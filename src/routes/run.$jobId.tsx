import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Loader2,
  RotateCcw,
  Send,
  Shield,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchJob,
  pushJob,
  resolveJobEscalation,
  rollbackJob,
  tickJob,
} from "@/lib/migration/actions";
import type { Escalation, JobSnapshot, PipelineStepId, UnifiedRecord } from "@/lib/migration/types";
import { TARGET_FIELDS } from "@/lib/migration/schema";
import { KIND_LABEL } from "@/lib/migration/policy";
import { displayVal, fmtMoney, fmtTime, statusLabel } from "@/lib/migration/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/run/$jobId")({ component: RunConsole });

const STEPS: { id: PipelineStepId; label: string }[] = [
  { id: "ingest", label: "Ingest" },
  { id: "profile", label: "Profile" },
  { id: "map", label: "Map" },
  { id: "ai_assist", label: "Model" },
  { id: "transform", label: "Clean" },
  { id: "reconcile", label: "Reconcile" },
  { id: "validate", label: "Validate" },
  { id: "summarize", label: "Pause" },
];

function RunConsole() {
  const { jobId } = Route.useParams();
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<"queue" | "activity" | "data" | "target">("activity");
  const [pane, setPane] = useState<"mapping" | "people" | "delta" | "audit">("mapping");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    let inflight = false;
    const loop = async () => {
      if (!alive || inflight) return;
      inflight = true;
      try {
        const current = await fetchJob({ data: { jobId } });
        if (!alive) return;
        if (!current) {
          setMissing(true);
          return;
        }
        if (current.status === "running") {
          const next = await tickJob({ data: { jobId } });
          if (alive) setJob(next);
        } else {
          setJob(current);
        }
      } catch (err) {
        if (alive) toast.error(err instanceof Error ? err.message : "Lost the run");
      } finally {
        inflight = false;
      }
    };
    void loop();
    const id = window.setInterval(loop, 480);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [jobId]);

  useEffect(() => {
    if (job?.status === "awaiting_human") setTab("queue");
    if (job?.status === "ready_to_push" || job?.status === "partial_failure" || job?.status === "complete") {
      setTab("target");
    }
  }, [job?.status]);

  const openEsc = job?.escalations.filter((e) => e.status === "open") ?? [];

  async function resolve(escalationId: string, optionId?: string, reject = false) {
    if (!job) return;
    setBusy(true);
    try {
      const next = await resolveJobEscalation({
        data: { jobId: job.id, escalationId, optionId, reject },
      });
      setJob(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve");
    } finally {
      setBusy(false);
    }
  }

  async function push(retryFailed = false) {
    if (!job) return;
    setBusy(true);
    try {
      const next = await pushJob({ data: { jobId: job.id, retryFailed } });
      setJob(next);
      toast.success(retryFailed ? "Retry sent" : "Push complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Push failed");
    } finally {
      setBusy(false);
    }
  }

  async function rollback() {
    if (!job) return;
    setBusy(true);
    try {
      const next = await rollbackJob({ data: { jobId: job.id } });
      setJob(next);
      toast.message("Batch rolled back");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <AppShell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-3xl">This run is gone</h1>
          <p className="mt-2 text-muted-foreground">
            Job state lives in memory for the prototype. Start a new engagement from the desk.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/">Back to desk</Link>
          </Button>
        </main>
      </AppShell>
    );
  }

  if (!job) {
    return (
      <AppShell>
        <main className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Opening run
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell
      right={
        <Badge
          variant={
            job.status === "awaiting_human" || job.status === "partial_failure" ? "warning" : "primary"
          }
        >
          {statusLabel(job.status)}
        </Badge>
      }
    >
      <div className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" /> Desk
            </Link>
            <h1 className="mt-1 font-display text-3xl tracking-tight">{job.clientName}</h1>
            <p className="text-sm text-muted-foreground">
              {job.engagement} · {job.targetSystem}
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
            <Metric label="Source rows" value={job.metrics.sourceRows} />
            <Metric label="People" value={job.metrics.uniquePeople} />
            <Metric label="Auto-mapped" value={job.metrics.autoMapped} />
            <Metric label="Transforms" value={job.metrics.autoTransforms} />
            <Metric label="Open" value={openEsc.length} warn={openEsc.length > 0} />
            <Metric label="Pushed" value={job.metrics.pushed} />
          </dl>
        </div>

        <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 lg:hidden">
          {(["activity", "queue", "data", "target"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "min-h-11 flex-1 rounded-md px-3 text-sm capitalize",
                tab === id ? "bg-card text-foreground shadow-card" : "text-muted-foreground",
              )}
            >
              {id}
              {id === "queue" && openEsc.length > 0 ? ` (${openEsc.length})` : ""}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_340px]">
          <div className={cn("min-w-0", tab !== "activity" && "hidden lg:block")}>
            <PipelineRail job={job} />
            <EventFeed job={job} />
          </div>

          <div className={cn("min-w-0", tab !== "data" && tab !== "target" && "hidden lg:block", tab === "target" && "block")}>
            {tab === "target" ? (
              <PushPanel job={job} busy={busy} onPush={push} onRollback={rollback} />
            ) : (
              <Workbench job={job} pane={pane} setPane={setPane} />
            )}
          </div>

          <div className={cn("min-w-0", tab !== "queue" && "hidden lg:block")}>
            <EscalationInbox job={job} busy={busy} onResolve={resolve} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium", warn && "text-warning")}>{value}</dd>
    </div>
  );
}

function PipelineRail({ job }: { job: JobSnapshot }) {
  return (
    <ol className="rounded-xl bg-card p-3 shadow-card">
      {STEPS.map((s, i) => {
        const done = i < job.pipelineIndex;
        const current = i === job.pipelineIndex && job.status === "running";
        return (
          <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[10px]",
                done && "bg-primary text-primary-foreground",
                current && "bg-warning text-warning-foreground",
                !done && !current && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={cn(current && "font-medium", !done && !current && "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function EventFeed({ job }: { job: JobSnapshot }) {
  const events = [...job.events].slice(-14).reverse();
  return (
    <div className="mt-3 rounded-xl bg-card p-3 shadow-card">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Agent</p>
      <ul className="mt-2 max-h-72 space-y-2 overflow-auto">
        {events.map((e) => (
          <li key={e.id} className="text-xs">
            <p className="tabular-nums text-muted-foreground">{fmtTime(e.ts)}</p>
            <p
              className={cn(
                "leading-snug",
                e.level === "escalate" && "text-warning",
                e.level === "warn" && "text-destructive",
                e.level === "human" && "text-primary",
              )}
            >
              {e.message}
            </p>
          </li>
        ))}
        {job.status === "running" && (
          <li className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Working
          </li>
        )}
      </ul>
    </div>
  );
}

function EscalationInbox({
  job,
  busy,
  onResolve,
}: {
  job: JobSnapshot;
  busy: boolean;
  onResolve: (id: string, optionId?: string, reject?: boolean) => void;
}) {
  const open = job.escalations.filter((e) => e.status === "open");
  const closed = job.escalations.filter((e) => e.status !== "open");
  return (
    <div className="rounded-xl bg-card p-3 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Needs a call</p>
        <Badge variant={open.length ? "warning" : "primary"}>{open.length} open</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Only ambiguity, conflict, or irreversible money. Not every field.
      </p>
      <div className="mt-3 max-h-[70vh] space-y-3 overflow-auto pr-1">
        {open.length === 0 && (
          <p className="rounded-lg bg-muted px-3 py-4 text-sm text-muted-foreground">
            Queue is clear. The agent will not guess past this point.
          </p>
        )}
        {open.map((e) => (
          <EscalationCard key={e.id} item={e} busy={busy} onResolve={onResolve} />
        ))}
        {closed.length > 0 && (
          <p className="pt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Resolved · {closed.length}
          </p>
        )}
        {closed.slice(0, 6).map((e) => (
          <p key={e.id} className="text-xs text-muted-foreground">
            <Check className="mr-1 inline size-3 text-primary" />
            {e.title}
            {e.resolution ? ` — ${e.resolution}` : ""}
          </p>
        ))}
      </div>
    </div>
  );
}

function EscalationCard({
  item,
  busy,
  onResolve,
}: {
  item: Escalation;
  busy: boolean;
  onResolve: (id: string, optionId?: string, reject?: boolean) => void;
}) {
  return (
    <article className="rounded-lg bg-muted/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        <Badge variant="warning">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{item.why}</p>
      <ul className="mt-2 space-y-1 text-xs">
        {item.evidence.map((ev) => (
          <li key={ev} className="font-mono text-[11px] text-foreground/80">
            {ev}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">
        <span className="text-muted-foreground">Recommend · </span>
        {item.recommendation}
      </p>
      <div className="mt-3 flex flex-col gap-1.5">
        {item.options?.slice(0, 4).map((opt, i) => (
          <Button
            key={opt.id}
            size="sm"
            variant={i === 0 ? "default" : "outline"}
            disabled={busy}
            onClick={() => onResolve(item.id, opt.id)}
            className="h-10 justify-start"
          >
            {opt.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => onResolve(item.id, undefined, true)}
          className="h-10 justify-start text-destructive"
        >
          Reject / hold out of cutover
        </Button>
      </div>
    </article>
  );
}

function Workbench({
  job,
  pane,
  setPane,
}: {
  job: JobSnapshot;
  pane: "mapping" | "people" | "delta" | "audit";
  setPane: (p: "mapping" | "people" | "delta" | "audit") => void;
}) {
  return (
    <div className="rounded-xl bg-card p-3 shadow-card sm:p-4">
      <div className="flex gap-1 overflow-x-auto">
        {(["mapping", "people", "delta", "audit"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setPane(id)}
            className={cn(
              "min-h-10 rounded-md px-3 text-sm capitalize",
              pane === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {id === "delta" ? "Delta" : id}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {pane === "mapping" && <MappingBoard job={job} />}
        {pane === "people" && <PeopleTable job={job} />}
        {pane === "delta" && <DeltaPanel job={job} />}
        {pane === "audit" && <AuditList job={job} />}
      </div>
    </div>
  );
}

function MappingBoard({ job }: { job: JobSnapshot }) {
  const rows = job.mappings.filter((m) => m.status !== "ignored" || m.confidence >= 0.4);
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="pb-2 font-medium">Source</th>
            <th className="pb-2 font-medium">Target</th>
            <th className="pb-2 font-medium">Confidence</th>
            <th className="pb-2 font-medium">Decision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-border/70">
              <td className="py-2.5">
                <p className="font-medium">{m.header}</p>
                <p className="text-xs text-muted-foreground">{m.fileName}</p>
              </td>
              <td className="py-2.5">{m.targetField ?? "—"}</td>
              <td className="py-2.5 tabular-nums">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full bg-primary"
                      style={{ width: `${Math.round(m.confidence * 100)}%` }}
                    />
                  </span>
                  {Math.round(m.confidence * 100)}%
                </div>
              </td>
              <td className="py-2.5">
                <Badge
                  variant={
                    m.status === "escalated" ? "warning" : m.status === "human" ? "solid" : "primary"
                  }
                >
                  {m.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeopleTable({ job }: { job: JobSnapshot }) {
  const [open, setOpen] = useState<string | null>(null);
  const recs = job.records;
  const selected = recs.find((r) => r.id === open);
  return (
    <div>
      <div className="overflow-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Emp #</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Dept</th>
              <th className="pb-2 font-medium">CTC</th>
              <th className="pb-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer border-t border-border/70 hover:bg-muted/50"
                onClick={() => setOpen(r.id === open ? null : r.id)}
              >
                <td className="py-2 font-mono text-xs">{r.employeeNumber ?? "—"}</td>
                <td className="py-2">
                  {displayVal(r.fields.firstName?.value)} {displayVal(r.fields.lastName?.value)}
                  {r.excluded && <Badge className="ml-2">held</Badge>}
                </td>
                <td className="py-2 text-xs">{displayVal(r.fields.email?.value)}</td>
                <td className="py-2 text-xs">{displayVal(r.fields.department?.value)}</td>
                <td className="py-2 tabular-nums text-xs">{fmtMoney(r.fields.ctcAnnual?.value)}</td>
                <td className="py-2">
                  {r.flags.length > 0 && (
                    <Badge variant="warning">{r.flags.length}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && <RecordInspector rec={selected} />}
    </div>
  );
}

function RecordInspector({ rec }: { rec: UnifiedRecord }) {
  return (
    <div className="mt-3 rounded-lg bg-muted/70 p-3">
      <p className="text-sm font-medium">
        Lineage · {rec.employeeNumber ?? rec.id}
        {rec.pushStatus ? ` · push ${rec.pushStatus}` : ""}
      </p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {TARGET_FIELDS.map((f) => {
          const cell = rec.fields[f.key];
          return (
            <div key={f.key}>
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{f.label}</dt>
              <dd className="text-sm">
                {f.type === "number" ? fmtMoney(cell?.value) : displayVal(cell?.value)}
                {cell?.transform && (
                  <span className="ml-2 text-xs text-muted-foreground">{cell.transform}</span>
                )}
              </dd>
              {cell?.lineage[0] && (
                <p className="text-[11px] text-muted-foreground">
                  {cell.lineage.map((l) => `${l.fileName}:${l.column}:${l.row}`).join(" · ")}
                </p>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function DeltaPanel({ job }: { job: JobSnapshot }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Core product mapping is the commodity. These rules are the client-specific remainder
        — what an FDE would write into the playbook for the next file drop.
      </p>
      {job.deltaRules.length === 0 && (
        <p className="text-sm text-muted-foreground">Rules appear after the transform step.</p>
      )}
      {job.deltaRules.map((r) => (
        <article key={r.id} className="rounded-lg bg-muted/80 p-3">
          <div className="flex items-center gap-2">
            <Shield className="size-3.5 text-primary" />
            <p className="text-sm font-medium">{r.title}</p>
            <Badge variant={r.origin === "human" ? "solid" : "primary"}>{r.origin}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{r.appliesTo}</p>
        </article>
      ))}
    </div>
  );
}

function AuditList({ job }: { job: JobSnapshot }) {
  const rows = [...job.audit].reverse();
  return (
    <ul className="max-h-[60vh] space-y-2 overflow-auto">
      {rows.map((a) => (
        <li key={a.id} className="border-b border-border/60 pb-2 text-xs">
          <p className="tabular-nums text-muted-foreground">
            {fmtTime(a.ts)} · {a.actor} · {a.action}
          </p>
          <p>
            {a.subject}
            {a.before ? ` · ${a.before}` : ""}
            {a.after ? ` → ${a.after}` : ""}
          </p>
          <p className="text-muted-foreground">{a.why}</p>
        </li>
      ))}
    </ul>
  );
}

function PushPanel({
  job,
  busy,
  onPush,
  onRollback,
}: {
  job: JobSnapshot;
  busy: boolean;
  onPush: (retry?: boolean) => void;
  onRollback: () => void;
}) {
  const blocked = job.escalations.some((e) => e.status === "open");
  const calls = [...job.pushCalls].reverse();
  const failed = job.records.filter((r) => r.pushStatus === "failed").length;
  const summary = useMemo(() => {
    const by: Record<number, number> = {};
    for (const c of job.pushCalls) by[c.status] = (by[c.status] ?? 0) + 1;
    return by;
  }, [job.pushCalls]);

  return (
    <div className="rounded-xl bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Target API</p>
          <h2 className="font-display text-2xl">POST /api/v1/employee</h2>
          <p className="text-sm text-muted-foreground">
            Stub employee master. Per-record 201 / 409 / 422 / 503. Batch rollback
            issues DELETE for every success in this load.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onPush(false)} disabled={busy || blocked || job.status === "complete"}>
            <Send />
            Push to target
          </Button>
          <Button variant="outline" onClick={() => onPush(true)} disabled={busy || failed === 0}>
            Retry failed
          </Button>
          <Button
            variant="destructive"
            onClick={onRollback}
            disabled={busy || job.metrics.pushed === 0}
          >
            <RotateCcw />
            Rollback batch
          </Button>
        </div>
      </div>
      {blocked && (
        <p className="mt-3 flex items-center gap-2 text-sm text-warning">
          <CircleAlert className="size-4" />
          Resolve the queue before a live push. Dry-run is not available once a required field is empty.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3 text-sm tabular-nums">
        {Object.entries(summary).map(([code, n]) => (
          <Badge key={code} variant={code.startsWith("2") ? "primary" : "warning"}>
            {code} × {n}
          </Badge>
        ))}
      </div>
      <ul className="mt-4 max-h-80 space-y-2 overflow-auto">
        {calls.map((c) => (
          <li key={c.id} className="rounded-lg bg-muted/80 px-3 py-2 font-mono text-[11px]">
            <span className={c.ok ? "text-primary" : "text-destructive"}>{c.status}</span>
            {"  "}
            {c.method} {c.path}
            {"  "}
            attempt {c.attempt}
            {c.error ? `  · ${c.error}` : ""}
          </li>
        ))}
        {calls.length === 0 && (
          <li className="text-sm text-muted-foreground">No calls yet. Push when the queue is clear.</li>
        )}
      </ul>
    </div>
  );
}
