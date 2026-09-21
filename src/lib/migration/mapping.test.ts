import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, recordsToSource } from "./parse.ts";
import { profileColumns, proposeMappings, scoreColumnToField } from "./mapping.ts";
import { LEGACY_HRIS_CSV, PAYROLL_CSV, IT_DIRECTORY_CSV } from "./samples.ts";
import { POLICY } from "./policy.ts";

function mapColumns() {
  const hris = recordsToSource("hris.csv", parseCsv(LEGACY_HRIS_CSV), "csv");
  const pay = recordsToSource("pay.csv", parseCsv(PAYROLL_CSV), "csv");
  const it = recordsToSource("it.csv", parseCsv(IT_DIRECTORY_CSV), "csv");
  const cols = profileColumns([hris, pay, it]);
  return { cols, ...proposeMappings(cols) };
}

describe("mapping boundary — auto-apply", () => {
  it("auto-maps EmpCode to employeeNumber above the confidence + margin bar", () => {
    const { cols } = mapColumns();
    const emp = cols.find((c) => c.header === "EmpCode");
    assert.ok(emp);
    const score = scoreColumnToField(emp, "employeeNumber");
    assert.ok(score >= POLICY.autoMapMin, `EmpCode score ${score}`);
  });

  it("ignores Pay Date as leftover noise rather than escalating it", () => {
    const { mappings } = mapColumns();
    const payDate = mappings.find((m) => m.header === "Pay Date");
    assert.ok(payDate);
    assert.equal(payDate.status, "ignored");
  });

  it("auto-maps manager_emp_id to managerEmployeeNumber", () => {
    const { mappings } = mapColumns();
    const mgr = mappings.find((m) => m.header === "manager_emp_id");
    assert.ok(mgr);
    assert.equal(mgr.status, "auto");
    assert.equal(mgr.targetField, "managerEmployeeNumber");
  });

  it("detects a full-name column and routes it to the name-split path", () => {
    const { mappings } = mapColumns();
    const name = mappings.find((m) => m.header === "Employee Name");
    assert.ok(name);
    assert.equal(name.targetField, "fullName");
    assert.equal(name.status, "auto");
  });
});

describe("mapping boundary — escalation", () => {
  it("escalates Title against Designation as competing columns in the same file", () => {
    const { mappings } = mapColumns();
    const title = mappings.find((m) => m.header === "Title" && m.fileName === "hris.csv");
    const desig = mappings.find((m) => m.header === "Designation");
    assert.ok(title && desig);
    assert.equal(desig.status, "auto");
    assert.equal(title.status, "escalated");
  });

  it("never auto-maps two columns in the same file to the same target field", () => {
    const { mappings } = mapColumns();
    const autoByFileField = new Map<string, number>();
    for (const m of mappings) {
      if (m.status !== "auto" || !m.targetField || m.targetField === "fullName") continue;
      const key = `${m.fileName}::${m.targetField}`;
      autoByFileField.set(key, (autoByFileField.get(key) ?? 0) + 1);
    }
    for (const [key, count] of autoByFileField) {
      assert.equal(count, 1, `expected exactly one auto-mapped column for ${key}`);
    }
  });
});
