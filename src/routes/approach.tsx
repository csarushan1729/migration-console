import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/approach")({ component: Approach });

function Approach() {
  return (
    <AppShell>
      <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">One page</p>
        <h1 className="mt-2 text-4xl">Where the agent stops — and why</h1>
        <p className="mt-4 text-muted-foreground">
          Migration Console is an implementation console, not a chatbot with a CSV parser.
          The product decision is the escalation boundary. Everything else is
          machinery in service of that line.
        </p>

        <h2 className="mt-10 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Approach
        </h2>
        <p className="mt-3">
          Three messy extracts (legacy HRIS, payroll, IT directory) are profiled,
          mapped with synonym + type scores, optionally reviewed by a model for
          leftover columns, then cleaned, merged, and validated against a target
          employee master. The agent applies a change only when it could defend it
          to a client on a cutover call. Everything else becomes a queue item with
          evidence, a recommendation, and one-click resolutions.
        </p>

        <h2 className="mt-8 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Alone versus escalate
        </h2>
        <p className="mt-3">
          Auto-map requires ≥82% confidence and an 18-point lead over the next field
          (or ≥92% certain, even with a thin margin).
          That bar is high on purpose: a wrong column map poisons every row. Dates
          whose first part is greater than 12, ISO dates, and named months are
          mechanical. 05/06/1991 is not —
          India is DMY and US payroll extracts are often MDY, so locale is a client
          decision, not a default. Exact duplicates collapse; fuzzy people (same
          mobile, two employee numbers) never do. Compensation mismatches always
          escalate — money is not a synonym problem. Unknown enums are not stuffed
          into “other”; that hides the delta the FDE is actually being paid to find
          (absconding as a status, gender identity gaps). Personal mailboxes are
          never silently accepted as work email.
        </p>
        <p className="mt-3">
          The agent is allowed to be wrong in the audit log. It is not allowed to
          be quietly wrong in the target HRIS.
        </p>

        <h2 className="mt-8 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Delta on top of the model
        </h2>
        <p className="mt-3">
          Mapping is the commodity. The client-specific remainder is the job:
          APX- prefixes, Permanent→full_time, absconding as a separation reason,
          a second IT id for the same person. Migration Console records those as a
          playbook so the next file drop does not relitigate them. That is delta
          solutioning — configuration on top of a core engine, not a one-off spreadsheet.
        </p>

        <h2 className="mt-8 font-sans text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          What I would build next
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Persistent client playbooks and active learning from consultant decisions.</li>
          <li>Incremental (true payroll delta) loads, not only full cutover.</li>
          <li>Direct integration against a real target employee-master API, with org units and positions.</li>
          <li>PII masking in the console; approval via Teams for high-impact fields.</li>
          <li>Calibration: measure how often recommendations are accepted, tighten thresholds.</li>
        </ul>
      </article>
    </AppShell>
  );
}
