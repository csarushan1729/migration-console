import { TARGET_FIELDS } from "./schema.ts";
import { POLICY } from "./policy.ts";
import type { ColumnProfile, FieldMapping, SourceFile } from "./types.ts";
import { uid } from "./ids.ts";
import {
  isBlank,
  looksEmail,
  looksIsoDate,
  looksPhone,
  normalizeHeader,
  parseNumberLoose,
  similarity,
  tokens,
} from "./text.ts";

const SYNONYMS: Record<string, string[]> = {
  employeeNumber: [
    "empcode",
    "emp code",
    "emp id",
    "empid",
    "employee code",
    "employee no",
    "employee number",
    "employee_no",
    "staff id",
    "personnel number",
    "pernr",
    "emp id",
  ],
  firstName: ["first name", "firstname", "fname", "given name", "givenname"],
  lastName: ["last name", "lastname", "lname", "surname", "family name"],
  fullName: ["employee name", "full name", "display name", "name", "staff name"],
  email: [
    "email",
    "work email",
    "official email",
    "email official",
    "office email",
    "corporate email",
    "mail",
    "email address",
  ],
  phone: ["phone", "mobile", "mobile no", "contact", "cell", "phone number", "mobile number"],
  dateOfBirth: ["dob", "date of birth", "birth date", "birthdate", "birthday"],
  dateOfJoining: [
    "doj",
    "date of joining",
    "join date",
    "joining date",
    "hire date",
    "hired on",
    "start date",
    "date of hire",
  ],
  gender: ["gender", "sex"],
  department: ["dept", "department", "department name", "org unit", "business unit", "function"],
  designation: ["designation", "job title", "title", "position", "role", "job role"],
  employmentType: ["employment type", "emp type", "worker type", "contract type", "employee type"],
  status: ["status", "emp status", "employment status", "hr status"],
  workLocation: ["location", "work location", "office", "site", "workplace", "base location", "city"],
  managerEmployeeNumber: [
    "manager",
    "manager id",
    "manager emp id",
    "manager_emp_id",
    "supervisor id",
    "reporting manager",
    "line manager",
  ],
  panNumber: ["pan", "pan number", "pan no", "permanent account number"],
  ctcAnnual: ["ctc", "gross ctc", "grossctc", "annual ctc", "compensation", "salary", "annual salary", "pay"],
  currency: ["currency", "ccy", "curr"],
};

const IGNORE_HINTS = [
  "username",
  "cost center",
  "pay date",
  "payroll date",
  "last modified",
  "updated",
  "created",
];

function typeBonus(col: ColumnProfile, fieldKey: string): number {
  const field = TARGET_FIELDS.find((f) => f.key === fieldKey);
  if (!field) return 0;
  const samples = col.samples.filter((s) => !isBlank(s));
  if (samples.length === 0) return 0;
  const ratio = (pred: (s: string) => boolean) => samples.filter(pred).length / samples.length;
  if (field.type === "email") return ratio(looksEmail) * 0.14;
  if (field.type === "phone") return ratio(looksPhone) * 0.1;
  if (field.type === "date") {
    return (
      ratio(
        (s) =>
          looksIsoDate(s) ||
          /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(s) ||
          /\d{1,2}-[a-z]{3}-\d{2,4}/i.test(s),
      ) * 0.12
    );
  }
  if (field.type === "number") return ratio((s) => parseNumberLoose(s) != null) * 0.08;
  if (field.key === "employeeNumber") {
    return ratio((s) => /[a-z]*-?\d{3,}/i.test(s)) * 0.06;
  }
  return 0;
}

function typePenalty(col: ColumnProfile, fieldKey: string): number {
  const field = TARGET_FIELDS.find((f) => f.key === fieldKey);
  if (!field) return 0;
  const samples = col.samples.filter((s) => !isBlank(s));
  if (samples.length === 0) return 0;
  if (field.type === "date" && samples.every((s) => looksEmail(s) || /[a-z]{4,}/i.test(s) && !/\d/.test(s))) {
    return 0.4;
  }
  if (field.type === "email" && samples.every((s) => !s.includes("@"))) return 0.45;
  if (field.key === "ctcAnnual" && samples.every((s) => looksEmail(s))) return 0.5;
  return 0;
}

export function scoreColumnToField(col: ColumnProfile, fieldKey: string): number {
  const header = col.normalized;
  if (IGNORE_HINTS.some((h) => header === h) && fieldKey !== "workLocation") {
    if (header.includes("pay date") || header.includes("cost center") || header === "username") return 0.05;
  }
  const syns = SYNONYMS[fieldKey] ?? [fieldKey];
  let best = similarity(header, fieldKey);
  for (const syn of syns) {
    if (header === syn) best = Math.max(best, 0.96);
    else if (header.includes(syn) || syn.includes(header)) best = Math.max(best, 0.88);
    else best = Math.max(best, similarity(header, syn));
  }
  const headerTok = new Set(tokens(header));
  const synTok = new Set(syns.flatMap(tokens));
  const overlap = [...headerTok].filter((t) => synTok.has(t)).length;
  if (overlap) best = Math.max(best, overlap / Math.max(headerTok.size, 1) * 0.8);
  best += typeBonus(col, fieldKey);
  best -= typePenalty(col, fieldKey);
  return Math.max(0, Math.min(0.99, best));
}

export function profileColumns(files: SourceFile[]): ColumnProfile[] {
  const out: ColumnProfile[] = [];
  for (const file of files) {
    for (const header of file.headers) {
      const values = file.rows.map((r) => r[header] ?? "");
      const present = values.filter((v) => !isBlank(v));
      const samples = present.slice(0, 8);
      const unique = new Set(present.map((v) => v.trim().toLowerCase()));
      let inferred: ColumnProfile["inferred"] = "string";
      const n = present.length || 1;
      if (present.filter(looksEmail).length / n > 0.7) inferred = "email";
      else if (present.filter(looksPhone).length / n > 0.7) inferred = "phone";
      else if (present.filter((s) => parseNumberLoose(s) != null && !looksPhone(s)).length / n > 0.7) inferred = "number";
      else if (
        present.filter((s) => looksIsoDate(s) || /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(s) || /\d{1,2}-[a-z]{3}/i.test(s))
          .length /
          n >
        0.6
      )
        inferred = "date";
      else if (unique.size <= 8 && unique.size / n < 0.4) inferred = "enum";
      else if (present.filter((s) => /(?:apx-)?\d{3,}/i.test(s)).length / n > 0.8) inferred = "id";
      out.push({
        id: `${file.id}:${header}`,
        fileId: file.id,
        fileName: file.name,
        header,
        normalized: normalizeHeader(header),
        samples,
        nullRate: file.rows.length ? 1 - present.length / file.rows.length : 1,
        uniqueCount: unique.size,
        inferred,
      });
    }
  }
  return out;
}

export type MappingResult = {
  mappings: FieldMapping[];
  fullNameColumns: ColumnProfile[];
};

export function proposeMappings(columns: ColumnProfile[]): MappingResult {
  const targetKeys = TARGET_FIELDS.map((f) => f.key);
  const mappings: FieldMapping[] = [];
  const fullNameColumns: ColumnProfile[] = [];

  for (const col of columns) {
    if (SYNONYMS.fullName.some((s) => col.normalized === s || similarity(col.normalized, s) > 0.9)) {
      fullNameColumns.push(col);
      mappings.push({
        id: uid("map"),
        sourceColumnId: col.id,
        fileName: col.fileName,
        header: col.header,
        targetField: "fullName",
        confidence: 0.93,
        margin: 0.4,
        rationale: "Full name source — will split into first and last name.",
        status: "auto",
        candidates: [{ field: "fullName", score: 0.93 }],
      });
      continue;
    }

    const scored = targetKeys
      .map((field) => ({ field, score: scoreColumnToField(col, field) }))
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    const second = scored[1];
    const margin = (top?.score ?? 0) - (second?.score ?? 0);
    const confidence = top?.score ?? 0;

    let status: FieldMapping["status"] = "ignored";
    let targetField: string | null = null;
    let rationale = "No reliable target field — treated as leftover source column.";

    if (
      confidence >= POLICY.autoMapCertain ||
      (confidence >= POLICY.autoMapMin && margin >= POLICY.autoMapMargin)
    ) {
      status = "auto";
      targetField = top.field;
      rationale = `Synonym and type match for ${top.field} (margin ${(margin * 100).toFixed(0)} pts).`;
    } else if (confidence >= POLICY.ignoreMapBelow && margin < POLICY.autoMapMargin) {
      status = "escalated";
      targetField = null;
      rationale = `Could be ${top.field} or ${second.field} — margin only ${(margin * 100).toFixed(0)} pts.`;
    } else if (confidence >= POLICY.ignoreMapBelow) {
      status = "escalated";
      targetField = top.field;
      rationale = `Best guess is ${top.field} at ${(confidence * 100).toFixed(0)}% — below auto-apply.`;
    }

    mappings.push({
      id: uid("map"),
      sourceColumnId: col.id,
      fileName: col.fileName,
      header: col.header,
      targetField,
      confidence,
      margin,
      rationale,
      status,
      candidates: scored.slice(0, 3),
    });
  }

  const claimed = new Map<string, FieldMapping[]>();
  for (const m of mappings) {
    if (!m.targetField || m.status === "ignored") continue;
    if (m.targetField === "fullName") continue;
    const key = `${m.fileName}::${m.targetField}`;
    const arr = claimed.get(key) ?? [];
    arr.push(m);
    claimed.set(key, arr);
  }
  for (const group of claimed.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.confidence - a.confidence);
    const winner = group[0];
    for (const loser of group.slice(1)) {
      if (loser.confidence >= 0.8) {
        loser.status = "escalated";
        loser.rationale = `Competes with “${winner.header}” for ${winner.targetField}.`;
      } else {
        loser.status = "ignored";
        loser.targetField = null;
        loser.rationale = `Weaker duplicate of “${winner.header}” — ignored.`;
      }
    }
  }

  return { mappings, fullNameColumns };
}
