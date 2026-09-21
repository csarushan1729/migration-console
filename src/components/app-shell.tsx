import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Mark } from "@/components/mark";

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 text-foreground">
            <Mark className="size-6" />
            <span className="font-display text-xl tracking-tight">Migration-Console</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              to="/approach"
              className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Approach
            </Link>
            {right}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
