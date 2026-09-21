export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[/_.;:()[\]-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  return normalizeHeader(s).split(" ").filter(Boolean);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

export function similarity(a: string, b: string): number {
  const na = normalizeHeader(a);
  const nb = normalizeHeader(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

export function titleCaseName(value: string): string {
  const stripped = value.replace(/\s+/g, " ").trim();
  return stripped
    .split(" ")
    .map((part) => {
      if (/^(?:[A-Z]\.)+$/i.test(part)) return part.toUpperCase();
      if (["da", "de", "del", "van", "von", "bin", "binti"].includes(part.toLowerCase())) {
        return part.toLowerCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function stripHonorific(name: string): string {
  return name.replace(/^\s*(dr|mr|mrs|ms|miss|prof|sir)\.?\s+/i, "").trim();
}

export function splitPersonName(full: string): { firstName: string; lastName: string } | null {
  const cleaned = stripHonorific(full.replace(/\s+/g, " ").trim());
  if (!cleaned) return null;
  if (cleaned.includes(",")) {
    const [last, rest] = cleaned.split(",").map((s) => s.trim());
    if (last && rest) return { firstName: titleCaseName(rest), lastName: titleCaseName(last) };
  }
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { firstName: titleCaseName(parts[0]), lastName: "" };
  return {
    firstName: titleCaseName(parts.slice(0, -1).join(" ")),
    lastName: titleCaseName(parts[parts.length - 1] ?? ""),
  };
}

export function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

export function looksEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function emailDomain(s: string): string {
  const at = s.trim().toLowerCase().split("@")[1] ?? "";
  return at;
}

export function looksPhone(s: string): boolean {
  const d = digitsOnly(s);
  return d.length >= 10 && d.length <= 13;
}

export function looksIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(s.trim());
}

export function isBlank(s: string | null | undefined): boolean {
  if (s == null) return true;
  const t = s.trim();
  return t === "" || t === "-" || /^n\/?a$/i.test(t) || t === "null" || t === "NULL";
}

export function parseNumberLoose(s: string): number | null {
  const t = s.replace(/[,₹$€\s]/g, "").replace(/inr/i, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
