import { FIELD_BY_KEY, TARGET_FIELDS } from "./schema.ts";
import { POLICY } from "./policy.ts";
import type {
  ColumnProfile,
  Escalation,
  FieldMapping,
  FieldValue,
  SourceFile,
  UnifiedRecord,
} from "./types.ts";
import { uid } from "./ids.ts";
import { canonicalizeEmployeeNumber, cleanValue } from "./transform.ts";
import { isBlank, splitPersonName, titleCaseName } from "./text.ts";

function emptyField(): FieldValue {
  return { raw: null, value: null, confidence: 1, lineage: [] };
}

function applyClean(
  rec: UnifiedRecord,
  field: string,
  raw: string,
  lineage: FieldValue["lineage"][number],
  transformCount: { n: number },
): void {
  const cleaned = cleanValue(field, raw);
  const current = rec.fields[field] ?? emptyField();
  if (cleaned.transform && cleaned.value != null) transformCount.n += 1;

  if (current.value == null || current.value === "") {
    rec.fields[field] = {
      raw,
      value: cleaned.value,
      confidence: cleaned.confidence,
      lineage: [lineage],
      transform: cleaned.transform,
    };
    if (cleaned.issue) rec.flags.push(`${field}:${cleaned.issue}`);
    return;
  }

  if (String(current.value) === String(cleaned.value)) {
    current.lineage.push(lineage);
    current.confidence = Math.max(current.confidence, cleaned.confidence);
    return;
  }

  if (FIELD_BY_KEY[field]?.type === "number" && POLICY.numericConflictEscalate) {
    rec.flags.push(`${field}:conflict`);
    current.lineage.push(lineage);
    const extras = current.conflictValues ?? [];
    if (cleaned.value != null && !extras.includes(cleaned.value) && cleaned.value !== current.value) {
      current.conflictValues = [...extras, cleaned.value];
    }
    return;
  }

  if (typeof current.value === "string" && typeof cleaned.value === "string" && POLICY.stringContainmentAuto) {
    const a = current.value.toLowerCase();
    const b = cleaned.value.toLowerCase();
    if (a.includes(b) || b.includes(a)) {
      if (cleaned.value.length > current.value.length) {
        rec.fields[field] = {
          raw,
          value: cleaned.value,
          confidence: Math.max(current.confidence, cleaned.confidence),
          lineage: [...current.lineage, lineage],
          transform: "kept longer form",
        };
      } else {
        current.lineage.push(lineage);
      }
      transformCount.n += 1;
      return;
    }
  }

  rec.flags.push(`${field}:conflict`);
  current.lineage.push(lineage);
}

export function buildRecords(
  files: SourceFile[],
  columns: ColumnProfile[],
  mappings: FieldMapping[],
): { records: UnifiedRecord[]; transforms: number } {
  const colById = new Map(columns.map((c) => [c.id, c]));
  const mapsByFile = new Map<string, FieldMapping[]>();
  for (const m of mappings) {
    const col = colById.get(m.sourceColumnId);
    if (!col) continue;
    const arr = mapsByFile.get(col.fileId) ?? [];
    arr.push(m);
    mapsByFile.set(col.fileId, arr);
  }

  const byEmp = new Map<string, UnifiedRecord>();
  const orphans: UnifiedRecord[] = [];
  const transformCount = { n: 0 };
  let seq = 0;

  for (const file of files) {
    file.rows.forEach((row, rowIdx) => {
      const rec: UnifiedRecord = {
        id: uid("rec"),
        employeeNumber: null,
        fields: Object.fromEntries(TARGET_FIELDS.map((f) => [f.key, emptyField()])),
        sourceRowIds: [`${file.name}:${rowIdx}`],
        flags: [],
        excluded: false,
      };

      const fileMaps = mapsByFile.get(file.id) ?? [];
      for (const m of fileMaps) {
        if (m.status === "ignored") continue;
        const col = colById.get(m.sourceColumnId);
        if (!col) continue;
        const raw = row[col.header] ?? "";
        if (isBlank(raw)) continue;
        const lineage = { fileName: file.name, column: col.header, row: rowIdx + 2 };

        if (m.targetField === "fullName") {
          const parts = splitPersonName(raw);
          if (parts) {
            applyClean(rec, "firstName", parts.firstName, lineage, transformCount);
            if (parts.lastName) applyClean(rec, "lastName", parts.lastName, lineage, transformCount);
            else rec.flags.push("lastName:missing_from_split");
            transformCount.n += 1;
          }
          continue;
        }
        if (!m.targetField || m.status === "escalated") continue;
        applyClean(rec, m.targetField, raw, lineage, transformCount);
      }

      const emp = rec.fields.employeeNumber?.value;
      rec.employeeNumber = emp != null ? String(emp) : null;

      const fingerprint = rec.employeeNumber
        ? `emp:${canonicalizeEmployeeNumber(rec.employeeNumber)}`
        : rec.fields.email?.value
          ? `email:${String(rec.fields.email.value).toLowerCase()}`
          : null;

      if (fingerprint && byEmp.has(fingerprint)) {
        const keep = byEmp.get(fingerprint)!;
        keep.sourceRowIds.push(...rec.sourceRowIds);
        for (const key of TARGET_FIELDS.map((f) => f.key)) {
          const incoming = rec.fields[key];
          if (!incoming?.value && incoming?.raw == null) continue;
          if (incoming.raw == null && incoming.value == null) continue;
          const raw = incoming.raw ?? String(incoming.value ?? "");
          const lin = incoming.lineage[0] ?? { fileName: file.name, column: key, row: rowIdx + 2 };
          applyClean(keep, key, raw, lin, transformCount);
        }
        keep.flags.push(...rec.flags);
      } else if (fingerprint) {
        rec.id = `rec_${++seq}_${fingerprint.replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;
        byEmp.set(fingerprint, rec);
      } else {
        orphans.push(rec);
      }
    });
  }

  const records = [...byEmp.values(), ...orphans];
  for (const rec of records) {
    rec.flags = [...new Set(rec.flags)];
    if (!rec.fields.currency?.value && rec.fields.ctcAnnual?.value != null) {
      rec.fields.currency = {
        raw: null,
        value: "INR",
        confidence: 0.7,
        lineage: [],
        transform: "defaulted INR because CTC present",
      };
      transformCount.n += 1;
    }
  }
  return { records, transforms: transformCount.n };
}

function fieldStr(rec: UnifiedRecord, key: string): string {
  const v = rec.fields[key]?.value;
  return v == null ? "" : String(v);
}

export function findFuzzyDuplicates(records: UnifiedRecord[]): Escalation[] {
  const live = records.filter((r) => !r.excluded);
  const escalations: Escalation[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      const nameA = `${fieldStr(a, "firstName")} ${fieldStr(a, "lastName")}`.toLowerCase().replace(/\./g, "");
      const nameB = `${fieldStr(b, "firstName")} ${fieldStr(b, "lastName")}`.toLowerCase().replace(/\./g, "");
      const phoneA = fieldStr(a, "phone");
      const phoneB = fieldStr(b, "phone");
      const compactA = nameA.replace(/[^a-z]/g, "");
      const compactB = nameB.replace(/[^a-z]/g, "");
      const similarName =
        compactA.length > 3 &&
        (compactA === compactB ||
          compactA.includes(compactB) ||
          compactB.includes(compactA) ||
          (nameA[0] === nameB[0] && fieldStr(a, "lastName").toLowerCase() === fieldStr(b, "lastName").toLowerCase()));
      const samePhone = phoneA && phoneA === phoneB;
      const sameDob =
        fieldStr(a, "dateOfBirth") && fieldStr(a, "dateOfBirth") === fieldStr(b, "dateOfBirth");
      if ((similarName && samePhone) || (similarName && sameDob && a.employeeNumber !== b.employeeNumber)) {
        escalations.push({
          id: uid("esc"),
          kind: "duplicate_fuzzy",
          title: `Possible duplicate · ${titleCaseName(nameA) || a.employeeNumber} / ${titleCaseName(nameB) || b.employeeNumber}`,
          why: "Same person likely exists under two employee numbers. Merging without a human would collapse headcount.",
          evidence: [
            `A ${a.employeeNumber ?? "—"} · ${fieldStr(a, "firstName")} ${fieldStr(a, "lastName")} · ${phoneA || "no phone"}`,
            `B ${b.employeeNumber ?? "—"} · ${fieldStr(b, "firstName")} ${fieldStr(b, "lastName")} · ${phoneB || "no phone"}`,
          ],
          recommendation: `Keep ${a.employeeNumber ?? a.id} and drop the duplicate.`,
          recordId: a.id,
          confidence: 0.72,
          status: "open",
          options: [
            {
              id: "merge_a",
              label: `Keep ${a.employeeNumber ?? fieldStr(a, "firstName")} · drop ${b.employeeNumber ?? fieldStr(b, "firstName")}`,
              apply: { type: "merge_records", keepId: a.id, dropId: b.id },
            },
            {
              id: "merge_b",
              label: `Keep ${b.employeeNumber ?? fieldStr(b, "firstName")} · drop ${a.employeeNumber ?? fieldStr(a, "firstName")}`,
              apply: { type: "merge_records", keepId: b.id, dropId: a.id },
            },
            {
              id: "keep_both",
              label: "Keep both (not a duplicate)",
              apply: { type: "accept_value", recordId: a.id, field: "employeeNumber" },
            },
          ],
        });
      }
    }
  }
  return escalations;
}

export function conflictEscalations(records: UnifiedRecord[]): Escalation[] {
  const out: Escalation[] = [];
  for (const rec of records) {
    for (const flag of rec.flags) {
      const [field, kind] = flag.split(":");
      if (kind !== "conflict") continue;
      const fv = rec.fields[field];
      const values = fv?.lineage.map((l) => `${l.fileName}.${l.column} row ${l.row}`) ?? [];
      const shown = [
        `Current: ${fv?.value ?? "—"}`,
        ...values,
      ];
      out.push({
        id: uid("esc"),
        kind: "conflict_cross_file",
        title: `${FIELD_BY_KEY[field]?.label ?? field} conflict · ${rec.employeeNumber ?? "unkeyed"}`,
        why:
          field === "ctcAnnual"
            ? "Two systems disagree on compensation. Picking either side silently would misstate payroll."
            : "Source files disagree and neither value contains the other.",
        evidence: shown,
        recommendation: field === "ctcAnnual" ? "Keep the HRIS Gross CTC (usually the offer of record)." : "Keep the longer / more specific value.",
        recordId: rec.id,
        field,
        confidence: 0.5,
        status: "open",
        options: buildConflictOptions(rec, field),
      });
    }
  }
  return out;
}

function buildConflictOptions(rec: UnifiedRecord, field: string): NonNullable<Escalation["options"]> {
  const fv = rec.fields[field];
  const options: NonNullable<Escalation["options"]> = [
    {
      id: "keep",
      label: `Keep ${fv?.value ?? "current"}`,
      apply: { type: "accept_value", recordId: rec.id, field },
    },
  ];
  for (const alt of fv?.conflictValues ?? []) {
    options.push({
      id: `alt-${alt}`,
      label: `Use ${alt}`,
      apply: { type: "set_field", recordId: rec.id, field, value: alt },
    });
  }
  return options;
}

export function valueIssueEscalations(records: UnifiedRecord[]): Escalation[] {
  const out: Escalation[] = [];
  for (const rec of records) {
    for (const flag of rec.flags) {
      const [field, kind] = flag.split(":");
      const fv = rec.fields[field];
      const label = FIELD_BY_KEY[field]?.label ?? field;
      const who = rec.employeeNumber ?? `${fieldStr(rec, "firstName")} ${fieldStr(rec, "lastName")}`.trim();
      if (kind === "ambiguous_date") {
        const raw = fv?.raw ?? "";
        out.push({
          id: uid("esc"),
          kind: "value_ambiguous_date",
          title: `Ambiguous ${label.toLowerCase()} · ${who}`,
          why: "Day and month are interchangeable. Guessing DMY because the client is Indian would still be a guess — US payroll extracts are often MDY.",
          evidence: [`Raw value: ${raw}`, fv?.transform ?? "No auto-parse"],
          recommendation: "Interpret as DMY (India locale) unless the file is a US-system extract.",
          recordId: rec.id,
          field,
          confidence: 0.55,
          status: "open",
          options: dateOptions(rec, field, raw),
        });
      }
      if (kind === "unknown_enum") {
        out.push({
          id: uid("esc"),
          kind: "value_unknown_enum",
          title: `Unknown ${label.toLowerCase()} · ${who}`,
          why: "Closed target enum. Stuffing this into “other” would hide a real HR process the client may need a delta for.",
          evidence: [`Raw: ${fv?.raw ?? "—"}`, `Allowed: ${FIELD_BY_KEY[field]?.enumValues?.join(", ")}`],
          recommendation: recommendEnum(field, fv?.raw),
          recordId: rec.id,
          field,
          confidence: 0.4,
          status: "open",
          options: enumOptions(rec, field, fv?.raw ?? ""),
        });
      }
      if (kind === "personal_email") {
        out.push({
          id: uid("esc"),
          kind: "validation_failed",
          title: `Personal email as work email · ${who}`,
          why: "Gmail/Yahoo mailboxes are not corporate accounts. Auto-loading them would break SSO and policy.",
          evidence: [`Email: ${fv?.value ?? fv?.raw}`],
          recommendation: "Hold the record until a corporate mailbox exists, or confirm the client uses this as official mail.",
          recordId: rec.id,
          field: "email",
          confidence: 0.35,
          status: "open",
          options: [
            {
              id: "accept",
              label: "Accept as work email",
              apply: { type: "accept_value", recordId: rec.id, field: "email" },
            },
            {
              id: "clear",
              label: "Clear email (block push)",
              apply: { type: "set_field", recordId: rec.id, field: "email", value: null },
            },
            {
              id: "exclude",
              label: "Exclude this person from cutover",
              apply: { type: "exclude_record", recordId: rec.id },
            },
          ],
        });
      }
      if (kind === "invalid") {
        out.push({
          id: uid("esc"),
          kind: "validation_failed",
          title: `Invalid ${label.toLowerCase()} · ${who}`,
          why: "Value failed a mechanical check after cleanup. A second pass still failed.",
          evidence: [`Raw: ${fv?.raw ?? "—"}`],
          recommendation: "Correct the value or exclude the record.",
          recordId: rec.id,
          field,
          confidence: 0.2,
          status: "open",
          options: [
            {
              id: "exclude",
              label: "Exclude record",
              apply: { type: "exclude_record", recordId: rec.id },
            },
          ],
        });
      }
    }
  }
  return out;
}

function dateOptions(rec: UnifiedRecord, field: string, raw: string) {
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) {
    return [
      {
        id: "exclude",
        label: "Exclude record",
        apply: { type: "exclude_record" as const, recordId: rec.id },
      },
    ];
  }
  const a = m[1].padStart(2, "0");
  const b = m[2].padStart(2, "0");
  let y = m[3];
  if (y.length === 2) y = Number(y) >= 30 ? `19${y}` : `20${y}`;
  const dmy = `${y}-${b}-${a}`;
  const mdy = `${y}-${a}-${b}`;
  return [
    { id: "dmy", label: `DMY · ${dmy}`, apply: { type: "set_field" as const, recordId: rec.id, field, value: dmy } },
    { id: "mdy", label: `MDY · ${mdy}`, apply: { type: "set_field" as const, recordId: rec.id, field, value: mdy } },
  ];
}

function recommendEnum(field: string, raw: string | null | undefined): string {
  const v = (raw ?? "").toLowerCase();
  if (field === "gender" && v.includes("trans")) return "Map to “other” only if the client has no gender-identity delta; otherwise park it.";
  if (field === "status" && v.includes("abscond")) return "Treat as terminated for cutover, and raise a delta: Darwinbox often models absconding as a separation reason, not a status.";
  return "Pick the closest allowed value or exclude.";
}

function enumOptions(rec: UnifiedRecord, field: string, raw: string): NonNullable<Escalation["options"]> {
  const allowed = FIELD_BY_KEY[field]?.enumValues ?? [];
  const opts: NonNullable<Escalation["options"]> = allowed.map((v) => ({
    id: v,
    label: v.replaceAll("_", " "),
    apply: { type: "set_field", recordId: rec.id, field, value: v },
  }));
  opts.push({
    id: "exclude",
    label: "Exclude record",
    apply: { type: "exclude_record", recordId: rec.id },
  });
  if (field === "gender" && /trans/i.test(raw)) {
    opts.unshift({
      id: "other",
      label: "Map to other (no schema slot)",
      apply: { type: "set_field", recordId: rec.id, field, value: "other" },
    });
  }
  if (field === "status" && /abscond/i.test(raw)) {
    opts.unshift({
      id: "term",
      label: "terminated + note absconding as delta",
      apply: { type: "set_field", recordId: rec.id, field, value: "terminated" },
    });
  }
  return opts;
}

export function validationEscalations(records: UnifiedRecord[], skipIds: Set<string>): Escalation[] {
  const out: Escalation[] = [];

  for (const rec of records) {
    if (rec.excluded) continue;
    if (skipIds.has(rec.id)) continue;
    const who = rec.employeeNumber ?? (`${fieldStr(rec, "firstName")} ${fieldStr(rec, "lastName")}`.trim() || rec.id);
    const missing = TARGET_FIELDS.filter((field) => {
      const val = rec.fields[field.key]?.value;
      return field.required && (val == null || val === "");
    });
    if (missing.length) {
      out.push({
        id: uid("esc"),
        kind: "validation_failed",
        title: `Missing ${missing.map((f) => f.label.toLowerCase()).join(", ")} · ${who}`,
        why: "Required on the target employee master. Pushing would 422.",
        evidence: [`Sources: ${rec.sourceRowIds.join(", ")}`],
        recommendation: missing.some((f) => f.key === "email")
          ? "Hold until IT provisions a mailbox, or exclude from this cutover."
          : "Fill from the consultant or exclude.",
        recordId: rec.id,
        field: missing[0]?.key,
        confidence: 0.2,
        status: "open",
        options: [
          {
            id: "exclude",
            label: "Exclude from this cutover",
            apply: { type: "exclude_record", recordId: rec.id },
          },
        ],
      });
    }
    const dob = fieldStr(rec, "dateOfBirth");
    const doj = fieldStr(rec, "dateOfJoining");
    if (dob && doj && dob > doj) {
      out.push({
        id: uid("esc"),
        kind: "validation_failed",
        title: `DOB after joining date · ${who}`,
        why: "Physically impossible. One of the two dates is wrong.",
        evidence: [`DOB ${dob}`, `DOJ ${doj}`],
        recommendation: "Correct the swapped date.",
        recordId: rec.id,
        field: "dateOfBirth",
        confidence: 0.15,
        status: "open",
        options: [],
      });
    }
  }
  return out;
}
