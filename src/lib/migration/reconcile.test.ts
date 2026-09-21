import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recordsToSource } from "./parse.ts";
import {
  buildRecords,
  conflictEscalations,
  findFuzzyDuplicates,
  valueIssueEscalations,
  validationEscalations,
} from "./reconcile.ts";
import type { ColumnProfile, FieldMapping } from "./types.ts";

/** Minimal ColumnProfile — reconcile.ts only reads id/fileId/fileName/header off it. */
function col(fileId: string, fileName: string, header: string): ColumnProfile {
  return {
    id: `${fileId}:${header}`,
    fileId,
    fileName,
    header,
    normalized: header.toLowerCase(),
    samples: [],
    nullRate: 0,
    uniqueCount: 0,
    inferred: "string",
  };
}

/** Minimal FieldMapping pointing a column straight at a target field, already "auto". */
function map(c: ColumnProfile, targetField: string): FieldMapping {
  return {
    id: `map:${c.id}`,
    sourceColumnId: c.id,
    fileName: c.fileName,
    header: c.header,
    targetField,
    confidence: 0.95,
    margin: 0.3,
    rationale: "test fixture",
    status: "auto",
    candidates: [],
  };
}

describe("buildRecords — merging across files", () => {
  it("merges the same person keyed by employee number across two files, ignoring the client's APX- prefix", () => {
    const hris = recordsToSource(
      "hris.csv",
      [{ EmpCode: "APX-1001", Dept: "Manufacturing" }],
      "csv",
    );
    const payroll = recordsToSource(
      "payroll.csv",
      [{ employee_no: "1001", email_official: "rajesh.kumar@apexmfg.in" }],
      "csv",
    );
    const cols = [
      col(hris.id, hris.name, "EmpCode"),
      col(hris.id, hris.name, "Dept"),
      col(payroll.id, payroll.name, "employee_no"),
      col(payroll.id, payroll.name, "email_official"),
    ];
    const mappings = [
      map(cols[0], "employeeNumber"),
      map(cols[1], "department"),
      map(cols[2], "employeeNumber"),
      map(cols[3], "email"),
    ];
    const { records } = buildRecords([hris, payroll], cols, mappings);
    assert.equal(records.length, 1);
    assert.equal(records[0].employeeNumber, "1001");
    assert.equal(records[0].fields.department.value, "Manufacturing");
    assert.equal(records[0].fields.email.value, "rajesh.kumar@apexmfg.in");
  });

  it("keeps two different employee numbers as separate records", () => {
    const file = recordsToSource(
      "hris.csv",
      [
        { EmpCode: "1001", Dept: "Manufacturing" },
        { EmpCode: "1002", Dept: "Finance" },
      ],
      "csv",
    );
    const cols = [col(file.id, file.name, "EmpCode"), col(file.id, file.name, "Dept")];
    const mappings = [map(cols[0], "employeeNumber"), map(cols[1], "department")];
    const { records } = buildRecords([file], cols, mappings);
    assert.equal(records.length, 2);
  });

  it("flags a cross-file CTC mismatch as a conflict rather than silently picking one", () => {
    const hris = recordsToSource("hris.csv", [{ EmpCode: "1001", GrossCTC: "980000" }], "csv");
    const payroll = recordsToSource("payroll.csv", [{ employee_no: "1001", ctc: "920000" }], "csv");
    const cols = [
      col(hris.id, hris.name, "EmpCode"),
      col(hris.id, hris.name, "GrossCTC"),
      col(payroll.id, payroll.name, "employee_no"),
      col(payroll.id, payroll.name, "ctc"),
    ];
    const mappings = [
      map(cols[0], "employeeNumber"),
      map(cols[1], "ctcAnnual"),
      map(cols[2], "employeeNumber"),
      map(cols[3], "ctcAnnual"),
    ];
    const { records } = buildRecords([hris, payroll], cols, mappings);
    assert.equal(records.length, 1);
    assert.ok(records[0].flags.includes("ctcAnnual:conflict"));

    const escalations = conflictEscalations(records);
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].kind, "conflict_cross_file");
    assert.equal(escalations[0].field, "ctcAnnual");
  });

  it("keeps the longer string when one value is contained in the other (job title vs designation)", () => {
    const hris = recordsToSource(
      "hris.csv",
      [{ EmpCode: "1001", Designation: "Plant Supervisor", Title: "Supervisor" }],
      "csv",
    );
    const cols = [
      col(hris.id, hris.name, "EmpCode"),
      col(hris.id, hris.name, "Designation"),
      col(hris.id, hris.name, "Title"),
    ];
    const mappings = [
      map(cols[0], "employeeNumber"),
      map(cols[1], "designation"),
      map(cols[2], "designation"),
    ];
    const { records } = buildRecords([hris], cols, mappings);
    assert.equal(records[0].fields.designation.value, "Plant Supervisor");
    assert.ok(!records[0].flags.includes("designation:conflict"));
  });
});

describe("buildRecords — flagged values become escalations", () => {
  it("raises a personal-email escalation instead of accepting a Gmail address as work email", () => {
    const file = recordsToSource("it.csv", [{ EmpCode: "1009", Email: "vikram.s@gmail.com" }], "csv");
    const cols = [col(file.id, file.name, "EmpCode"), col(file.id, file.name, "Email")];
    const mappings = [map(cols[0], "employeeNumber"), map(cols[1], "email")];
    const { records } = buildRecords([file], cols, mappings);
    const escalations = valueIssueEscalations(records);
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].kind, "validation_failed");
    assert.match(escalations[0].title, /personal email/i);
  });

  it("raises an ambiguous-date escalation for a locale-trap DOB", () => {
    const file = recordsToSource("hris.csv", [{ EmpCode: "1006", DOB: "05/06/1991" }], "csv");
    const cols = [col(file.id, file.name, "EmpCode"), col(file.id, file.name, "DOB")];
    const mappings = [map(cols[0], "employeeNumber"), map(cols[1], "dateOfBirth")];
    const { records } = buildRecords([file], cols, mappings);
    const escalations = valueIssueEscalations(records);
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].kind, "value_ambiguous_date");
  });

  it("raises an unknown-enum escalation for a status value outside the closed list", () => {
    const file = recordsToSource("hris.csv", [{ EmpCode: "1012", Status: "Absconding" }], "csv");
    const cols = [col(file.id, file.name, "EmpCode"), col(file.id, file.name, "Status")];
    const mappings = [map(cols[0], "employeeNumber"), map(cols[1], "status")];
    const { records } = buildRecords([file], cols, mappings);
    const escalations = valueIssueEscalations(records);
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].kind, "value_unknown_enum");
  });
});

describe("findFuzzyDuplicates", () => {
  it("flags the same person under two employee numbers sharing one phone number", () => {
    const file = recordsToSource(
      "it.csv",
      [
        { EmpCode: "1010", FirstName: "Farhan", LastName: "Qureshi", Phone: "9810091010" },
        { EmpCode: "1010B", FirstName: "F", LastName: "Qureshi", Phone: "9810091010" },
      ],
      "csv",
    );
    const cols = [
      col(file.id, file.name, "EmpCode"),
      col(file.id, file.name, "FirstName"),
      col(file.id, file.name, "LastName"),
      col(file.id, file.name, "Phone"),
    ];
    const mappings = [
      map(cols[0], "employeeNumber"),
      map(cols[1], "firstName"),
      map(cols[2], "lastName"),
      map(cols[3], "phone"),
    ];
    const { records } = buildRecords([file], cols, mappings);
    assert.equal(records.length, 2);
    const dupes = findFuzzyDuplicates(records);
    assert.equal(dupes.length, 1);
    assert.equal(dupes[0].kind, "duplicate_fuzzy");
  });

  it("does not flag two unrelated people as duplicates", () => {
    const file = recordsToSource(
      "it.csv",
      [
        { EmpCode: "1001", FirstName: "Rajesh", LastName: "Kumar", Phone: "9876543210" },
        { EmpCode: "1002", FirstName: "Priya", LastName: "Mehta", Phone: "9876500000" },
      ],
      "csv",
    );
    const cols = [
      col(file.id, file.name, "EmpCode"),
      col(file.id, file.name, "FirstName"),
      col(file.id, file.name, "LastName"),
      col(file.id, file.name, "Phone"),
    ];
    const mappings = [
      map(cols[0], "employeeNumber"),
      map(cols[1], "firstName"),
      map(cols[2], "lastName"),
      map(cols[3], "phone"),
    ];
    const { records } = buildRecords([file], cols, mappings);
    assert.equal(findFuzzyDuplicates(records).length, 0);
  });
});

describe("validationEscalations", () => {
  it("flags a record missing a required field (email)", () => {
    const file = recordsToSource(
      "hris.csv",
      [{ EmpCode: "1014", FirstName: "Pooja", LastName: "Nair", Dept: "Finance", Designation: "Specialist", EmpType: "Permanent", Status: "Active", DOJ: "2023-03-15" }],
      "csv",
    );
    const cols = [
      col(file.id, file.name, "EmpCode"),
      col(file.id, file.name, "FirstName"),
      col(file.id, file.name, "LastName"),
      col(file.id, file.name, "Dept"),
      col(file.id, file.name, "Designation"),
      col(file.id, file.name, "EmpType"),
      col(file.id, file.name, "Status"),
      col(file.id, file.name, "DOJ"),
    ];
    const mappings = [
      map(cols[0], "employeeNumber"),
      map(cols[1], "firstName"),
      map(cols[2], "lastName"),
      map(cols[3], "department"),
      map(cols[4], "designation"),
      map(cols[5], "employmentType"),
      map(cols[6], "status"),
      map(cols[7], "dateOfJoining"),
    ];
    const { records } = buildRecords([file], cols, mappings);
    const escalations = validationEscalations(records, new Set());
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].kind, "validation_failed");
    assert.match(escalations[0].title, /email/i);
  });

  it("flags a date of birth that falls after the date of joining as physically impossible", () => {
    const file = recordsToSource(
      "hris.csv",
      [{ EmpCode: "1099", DOB: "2019-01-01", DOJ: "2014-06-15" }],
      "csv",
    );
    const cols = [
      col(file.id, file.name, "EmpCode"),
      col(file.id, file.name, "DOB"),
      col(file.id, file.name, "DOJ"),
    ];
    const mappings = [
      map(cols[0], "employeeNumber"),
      map(cols[1], "dateOfBirth"),
      map(cols[2], "dateOfJoining"),
    ];
    const { records } = buildRecords([file], cols, mappings);
    const escalations = validationEscalations(records, new Set());
    assert.ok(escalations.some((e) => /DOB after joining/i.test(e.title)));
  });

  it("skips ids passed in the skip set", () => {
    const file = recordsToSource("hris.csv", [{ EmpCode: "1099" }], "csv");
    const cols = [col(file.id, file.name, "EmpCode")];
    const mappings = [map(cols[0], "employeeNumber")];
    const { records } = buildRecords([file], cols, mappings);
    const skip = new Set(records.map((r) => r.id));
    assert.equal(validationEscalations(records, skip).length, 0);
  });
});
