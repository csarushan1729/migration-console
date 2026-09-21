import { FIELD_BY_KEY } from "./schema.ts";
import { POLICY } from "./policy.ts";
import type { DateParse } from "./dates.ts";
import { parseDateStrict } from "./dates.ts";
import { digitsOnly, emailDomain, isBlank, looksEmail, parseNumberLoose, titleCaseName } from "./text.ts";

const ENUM_SYNONYMS: Record<string, Record<string, string>> = {
  gender: {
    m: "male",
    male: "male",
    man: "male",
    f: "female",
    female: "female",
    woman: "female",
    w: "female",
    o: "other",
    other: "other",
    pnts: "prefer_not_to_say",
    "prefer not to say": "prefer_not_to_say",
  },
  employmentType: {
    permanent: "full_time",
    "full time": "full_time",
    "full-time": "full_time",
    ft: "full_time",
    fte: "full_time",
    contract: "contract",
    contractor: "contract",
    "fixed term": "contract",
    intern: "intern",
    internship: "intern",
    consultant: "consultant",
  },
  status: {
    active: "active",
    a: "active",
    inactive: "inactive",
    "on notice": "on_notice",
    notice: "on_notice",
    resigned: "on_notice",
    terminated: "terminated",
    exit: "terminated",
    separated: "terminated",
  },
  currency: {
    inr: "INR",
    rs: "INR",
    "₹": "INR",
    usd: "USD",
    $: "USD",
    eur: "EUR",
  },
};

export type CleanResult = {
  value: string | number | null;
  confidence: number;
  transform?: string;
  issue?: "ambiguous_date" | "unknown_enum" | "invalid" | "personal_email";
  issueDetail?: string;
};

export function canonicalizeEmployeeNumber(raw: string): string {
  const t = raw.trim();
  const stripped = t.replace(/^apx[-_]?/i, "");
  const digits = stripped.replace(/\.0$/, "");
  return digits.toUpperCase();
}

export function cleanPhone(raw: string): string | null {
  let d = digitsOnly(raw);
  if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  if (d.length === 10) return `+91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `+91${d.slice(1)}`;
  if (d.length >= 10 && d.length <= 13) return `+${d}`;
  return null;
}

export function cleanValue(fieldKey: string, raw: string | null | undefined): CleanResult {
  if (raw == null || isBlank(raw)) return { value: null, confidence: 1, transform: "empty" };
  const field = FIELD_BY_KEY[fieldKey];
  const text = raw.trim();

  if (fieldKey === "employeeNumber") {
    return { value: canonicalizeEmployeeNumber(text), confidence: 0.96, transform: "strip client prefix, keep id" };
  }
  if (fieldKey === "firstName" || fieldKey === "lastName") {
    return { value: titleCaseName(text), confidence: 0.95, transform: "title case" };
  }
  if (fieldKey === "email") {
    const email = text.toLowerCase();
    if (!looksEmail(email)) return { value: email, confidence: 0.2, issue: "invalid", issueDetail: "Not an email" };
    const domain = emailDomain(email);
    if ((POLICY.personalEmailDomains as readonly string[]).includes(domain)) {
      return {
        value: email,
        confidence: 0.4,
        transform: "lowercased",
        issue: "personal_email",
        issueDetail: `${domain} is a personal domain — not auto-accepted as work email.`,
      };
    }
    return { value: email, confidence: 0.97, transform: "lowercased" };
  }
  if (fieldKey === "phone") {
    const phone = cleanPhone(text);
    if (!phone) return { value: text, confidence: 0.3, issue: "invalid", issueDetail: "Could not normalise phone" };
    return { value: phone, confidence: 0.93, transform: "E.164 (IN)" };
  }
  if (field?.type === "date") {
    const parsed: DateParse = parseDateStrict(text);
    if (parsed.status === "empty") return { value: null, confidence: 1 };
    if (parsed.status === "ambiguous") {
      return {
        value: null,
        confidence: 0.45,
        issue: "ambiguous_date",
        issueDetail: parsed.reason,
      };
    }
    if (parsed.status === "invalid") {
      return { value: text, confidence: 0.2, issue: "invalid", issueDetail: parsed.reason };
    }
    return { value: parsed.iso, confidence: 0.98, transform: parsed.reason };
  }
  if (field?.type === "enum") {
    const table = ENUM_SYNONYMS[fieldKey] ?? {};
    const mapped = table[text.toLowerCase()];
    if (mapped) return { value: mapped, confidence: 0.94, transform: `${text} → ${mapped}` };
    const exact = field.enumValues?.find((v) => v.toLowerCase() === text.toLowerCase());
    if (exact) return { value: exact, confidence: 0.99 };
    return {
      value: text,
      confidence: 0.35,
      issue: "unknown_enum",
      issueDetail: `“${text}” is not in ${field.enumValues?.join(", ")}.`,
    };
  }
  if (field?.type === "number") {
    const n = parseNumberLoose(text);
    if (n == null) return { value: text, confidence: 0.2, issue: "invalid", issueDetail: "Not a number" };
    return { value: n, confidence: 0.95, transform: "parsed number" };
  }
  if (fieldKey === "panNumber") {
    const pan = text.toUpperCase().replace(/\s+/g, "");
    if (field?.pattern && !new RegExp(field.pattern).test(pan)) {
      return { value: pan, confidence: 0.4, issue: "invalid", issueDetail: "PAN failed checksum pattern" };
    }
    return { value: pan, confidence: 0.96, transform: "uppercase" };
  }
  if (fieldKey === "department" || fieldKey === "designation" || fieldKey === "workLocation") {
    return { value: titleCaseName(text), confidence: 0.9, transform: "title case" };
  }
  if (fieldKey === "managerEmployeeNumber") {
    return { value: canonicalizeEmployeeNumber(text), confidence: 0.9, transform: "canonical id" };
  }
  return { value: text, confidence: 0.8 };
}
