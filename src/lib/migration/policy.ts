/**
 * Escalation boundary — the product decision this assignment is scoring.
 *
 * Meridian is allowed to be wrong in private (logged, reversible). It is not
 * allowed to be quietly wrong in the target HRIS. Everything below is the
 * line between those two.
 */
export const POLICY = {
  /** Auto-map when the winner is this strong and clearly ahead of the runner-up. */
  autoMapMin: 0.82,
  autoMapMargin: 0.18,
  /** Near-certain matches skip the margin test (manager_emp_id vs emp_id). */
  autoMapCertain: 0.92,
  /** Below this, the column is leftover noise — ignore, don't bother a human. */
  ignoreMapBelow: 0.45,
  /** Personal mailbox domains are never silently treated as work email. */
  personalEmailDomains: ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "rediffmail.com"],
  /** Exact-row and exact-id/email duplicates are safe to collapse. */
  exactDedupe: true,
  /** Fuzzy people matches (name + phone, name + DOB) always escalate. */
  fuzzyDedupeEscalate: true,
  /** Numeric compensation mismatches always escalate — money is irreversible. */
  numericConflictEscalate: true,
  /**
   * Dates where both calendar parts are <= 12 are locale traps (05/06/1991).
   * India is DMY, many exports are MDY. We do not pick a default locale.
   */
  ambiguousDateEscalate: true,
  /** Closed enums: unknown tokens escalate rather than being stuffed into "other". */
  unknownEnumEscalate: true,
  /**
   * String conflicts: if one value contains the other, keep the longer
   * (Plant Supervisor vs Supervisor). True disagreements escalate.
   */
  stringContainmentAuto: true,
} as const;

export const KIND_LABEL: Record<string, string> = {
  mapping_ambiguous: "Ambiguous mapping",
  mapping_competing: "Competing columns",
  mapping_missing_required: "Required field unmapped",
  value_ambiguous_date: "Ambiguous date",
  value_unknown_enum: "Unknown enum value",
  conflict_cross_file: "Cross-file conflict",
  duplicate_fuzzy: "Possible duplicate",
  validation_failed: "Validation failed",
};

export const POLICY_COPY = [
  {
    title: "Handle alone",
    items: [
      "Column names that synonym-match a single target field with ≥82% confidence and an 18-point lead — or ≥92% regardless of margin",
      "ISO dates, day>12 dates, and named months (15-Jun-2014)",
      "Whitespace, ALL CAPS names, email casing, PAN uppercase, 10-digit IN phones",
      "Exact duplicate rows and the same person keyed by employee number or work email",
      "Empty vs present: take the present value",
      "String A contained in string B: keep the longer form",
      "Client vocabulary we already know (Permanent → full_time, M → male, APX- prefix)",
    ],
  },
  {
    title: "Escalate",
    items: [
      "A column that could be two target fields within 18 points (Date → DOB or DOJ)",
      "Two columns in the same file both claiming one target field",
      "A required target field with no plausible source",
      "Calendar dates where day and month are interchangeable (05/06/1991)",
      "Enum values outside the closed list (Absconding, Transgender if not in schema)",
      "Two files disagreeing on CTC or on a string that isn't a substring",
      "Fuzzy duplicates (same mobile, different employee numbers)",
      "Personal email domains offered as work email",
    ],
  },
] as const;
