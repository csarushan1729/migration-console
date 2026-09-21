const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export type DateParse =
  | { status: "ok"; iso: string; reason: string }
  | { status: "ambiguous"; reason: string; candidates: string[] }
  | { status: "invalid"; reason: string }
  | { status: "empty" };

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1940 || y > 2035) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function yearOf(y: number): number {
  if (y < 100) return y >= 30 ? 1900 + y : 2000 + y;
  return y;
}

export function parseDateStrict(raw: string): DateParse {
  const s = raw.trim();
  if (!s) return { status: "empty" };

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const value = iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (!value) return { status: "invalid", reason: "ISO date is not a real calendar day" };
    return { status: "ok", iso: value, reason: "ISO-8601" };
  }

  const named = s.match(/^(\d{1,2})[- ]([A-Za-z]{3,9})[- ,](\d{2,4})$/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    const value = month ? iso(yearOf(Number(named[3])), month, Number(named[1])) : null;
    if (!value) return { status: "invalid", reason: "Named-month date is not a real calendar day" };
    return { status: "ok", iso: value, reason: "day-month-year with month name" };
  }

  const named2 = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (named2) {
    const month = MONTHS[named2[1].slice(0, 3).toLowerCase()];
    const value = month ? iso(yearOf(Number(named2[3])), month, Number(named2[2])) : null;
    if (!value) return { status: "invalid", reason: "Named-month date is not a real calendar day" };
    return { status: "ok", iso: value, reason: "month-name date" };
  }

  const num = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (num) {
    const a = Number(num[1]);
    const b = Number(num[2]);
    const y = yearOf(Number(num[3]));
    const dmy = iso(y, b, a);
    const mdy = iso(y, a, b);
    if (a > 12 && dmy) return { status: "ok", iso: dmy, reason: "DMY (day > 12, unambiguous)" };
    if (b > 12 && mdy) return { status: "ok", iso: mdy, reason: "MDY (second part > 12, unambiguous)" };
    if (dmy && mdy && dmy !== mdy) {
      return {
        status: "ambiguous",
        reason: `${s} could be ${dmy} (DMY) or ${mdy} (MDY). Locale was not assumed.`,
        candidates: [dmy, mdy],
      };
    }
    if (dmy) return { status: "ok", iso: dmy, reason: "numeric date" };
    return { status: "invalid", reason: "numeric date is not a real calendar day" };
  }

  return { status: "invalid", reason: `Unrecognised date format: ${s}` };
}
