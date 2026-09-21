import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("text-primary", className)} aria-hidden>
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="16" cy="16" rx="5.5" ry="12.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 3.5v25M3.5 16h25" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
