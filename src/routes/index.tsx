import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, FileSpreadsheet, Lock, Scale, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startSampleJob, startUploadJob } from "@/lib/migration/actions";
import { TARGET_FIELDS } from "@/lib/migration/schema";
import { POLICY_COPY } from "@/lib/migration/policy";
import { SAMPLE_FILES } from "@/lib/migration/samples";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [clientName, setClientName] = useState("Apex Manufacturing Pvt Ltd");

  async function runSample() {
    setBusy(true);
    try {
      const job = await startSampleJob();
      await navigate({ to: "/run/$jobId", params: { jobId: job.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the run");
      setBusy(false);
    }
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const files = await Promise.all(
        [...list].map(async (file) => {
          const isXlsx = /\.xlsx?$/i.test(file.name);
          if (isXlsx) {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = "";
            bytes.forEach((b) => {
              binary += String.fromCharCode(b);
            });
            return { name: file.name, base64: btoa(binary) };
          }
          return { name: file.name, text: await file.text() };
        }),
      );
      const job = await startUploadJob({ data: { clientName, files } });
      await navigate({ to: "/run/$jobId", params: { jobId: job.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read files");
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
          <section className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Implementation console
            </p>
            <h1 className="mt-3 max-w-[18ch] text-4xl text-foreground sm:text-5xl">
              The agent maps the mess. You only take the calls that matter.
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground">
              Meridian reads multiple HR exports, maps them onto an employee master,
              cleans what is safe, and stops when a guess would be irresponsible.
              Built for a Darwinbox-style cutover — watched by an implementation
              consultant, not a developer.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={runSample} disabled={busy} size="lg">
                {busy ? "Starting run" : "Run Apex Manufacturing demo"}
                <ArrowRight />
              </Button>
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  multiple
                  className="sr-only"
                  suppressHydrationWarning
                  onChange={(e) => onFiles(e.target.files)}
                />
                <Button variant="outline" size="lg" type="button" asChild>
                  <span>
                    <Upload />
                    Upload your own files
                  </span>
                </Button>
              </label>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Demo loads two CSVs and one Excel workbook from three source systems.
              No field-by-field map is provided.
            </p>
          </section>

          <aside className="min-w-0 rounded-xl bg-card p-4 shadow-card sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Engagement</p>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="mt-1 w-full bg-transparent font-display text-2xl tracking-tight outline-none"
                  suppressHydrationWarning
                />
                <p className="text-sm text-muted-foreground">Target · Darwinbox Employee Master</p>
              </div>
              <Badge variant="primary">3 sources</Badge>
            </div>
            <ul className="mt-5 space-y-2">
              {SAMPLE_FILES.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center gap-3 rounded-lg bg-muted/70 px-3 py-3"
                >
                  <FileSpreadsheet className="size-4 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.kind === "xlsx" ? "Excel · IT directory" : "CSV · mixed headers"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Target schema · {TARGET_FIELDS.length} fields
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {TARGET_FIELDS.map((f) => (
                  <Badge key={f.key} variant={f.required ? "solid" : "default"}>
                    {f.label}
                    {f.required ? " *" : ""}
                  </Badge>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <section className="mt-12 grid gap-4 md:grid-cols-2">
          {POLICY_COPY.map((col) => (
            <div key={col.title} className="rounded-xl bg-card p-5 shadow-card">
              <div className="flex items-center gap-2">
                {col.title === "Handle alone" ? (
                  <Lock className="size-4 text-primary" />
                ) : (
                  <Scale className="size-4 text-warning" />
                )}
                <h2 className="font-sans text-sm font-semibold tracking-tight">{col.title}</h2>
              </div>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                {col.items.map((item) => (
                  <li key={item} className="pl-3 border-l border-border">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
