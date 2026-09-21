import type { JobStatus } from "./types.ts";

export function statusLabel(status: JobStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "awaiting_human":
      return "Needs a call";
    case "ready_to_push":
      return "Ready to push";
    case "pushing":
      return "Pushing";
    case "partial_failure":
      return "Partial failure";
    case "complete":
      return "Complete";
    case "rolled_back":
      return "Rolled back";
  }
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtMoney(n: string | number | null | undefined): string {
  if (n == null || n === "") return "—";
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString("en-IN");
}

export function displayVal(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return String(v);
}
