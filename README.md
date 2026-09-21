# Migration-Console

Implementation console for **autonomous HR data migration**.

Migration-Console reads multiple messy client extracts (CSV / Excel), maps them onto an employee master **without a pre-written field map**, cleans what is mechanically safe, and stops for a consultant only when a guess would be irresponsible. A stub target API then accepts the load with per-record success/failure, retry, and batch rollback. Every decision is audited.

## Tour

1. Open the app and click **Run Apex Manufacturing demo**.
2. Watch the agent ingest two CSVs + one Excel workbook, auto-map, and pause.
3. Work the **Needs a call** queue (ambiguous date, CTC conflict, fuzzy duplicate, unknown enum, personal email). One-click resolve.
4. Open **Delta** - client-specific rules inferred on top of the core engine.
5. **Push to target**. If anything fails; hit **Retry failed**, then for any use you can **Rollback batch**.

## Escalation boundary

Auto-apply only when a mapping is ≥82% confident **and** 18 points ahead of the next field. Dates with interchangeable day/month, compensation mismatches, fuzzy people, closed-enum misses, and personal mailboxes always escalate. Exact duplicates, ISO dates, title-case, APX- prefixes, and known vocabulary (`Permanent → full_time`) do not.

The agent may be wrong in the audit log. It may not be quietly wrong in the target HRIS.

Details: [WRITEUP.md](./WRITEUP.md).

## Stack

- TanStack Start (React 19) + TanStack Router
- Tailwind v4
- Server functions for the agent pipeline
- Heuristic mapper(optional xAI (`grok-4.5`) assist for leftover columns)
- SheetJS for Excel
- SQLite (Node's built-in `node:sqlite`) for job persistence- no external DB service, no native build step

No auth. Job state- files, mappings, escalations, audit trail, is persisted to SQLite (see [Persistence](#persistence) below), so it survives a server restart; a replay of the run is still the audit log itself.

## Persistence

Every job (its files, column mappings, records, escalations, events, and audit trail) is written to a local SQLite database via Node's built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html) module — no separate database service to run, no native bindings to compile. `src/lib/migration/store.ts` is the only file that touches it; the rest of the pipeline reads/writes jobs through `saveJob` / `getJob` / `listJobs` exactly as it did before.

- **Location**: `./data/meridian.db` by default, created on first write. Override with `MERIDIAN_DB_PATH` (see `.env.example`)- point it at a mounted volume on hosts with an ephemeral filesystem, or set it to `:memory:` to opt back into pure in-memory state.
- **Shape**: one row per job (`id`, `client_name`, `status`, `created_at` as indexed columns; the full job as a JSON blob)- enough structure to list and sort jobs in SQL without loading everything into memory, without a multi-table schema migration for what's still a single-tenant prototype.
- **Restart-safe**: kill the server mid-run and start it again- `GET`ting a job by id, or the recent-jobs list, comes back from disk, not from a Map that reset to empty.


## Getting started

```bash
npm install
npm run dev          # http://localhost:8080
```

Production build:

```bash
npm run build
npm start            # serves the Nitro output from .output/
```

(Fully Optional: copy `.env.example` to `.env` and set `XAI_API_KEY` to enable model assist on uncertain columns.)

## Deployed 
[Live Link](https://migration-console.onrender.com/)

## Demo 
[Demo Link](https://youtu.be/8ph9EYvbOfA)

## Engine tests

72 unit tests across 24 suites, covering date-locale parsing, header/name normalization, per-field cleanup rules, the mapping confidence/margin boundary, record reconciliation, and the SQLite job store:

```bash
npm test
```

| File | Covers |
|---|---|
| `dates.test.ts` | ISO / named-month / numeric date parsing, the DMY-vs-MDY locale trap, 2-digit year expansion |
| `text.test.ts` | Header normalization, name splitting/title-casing, blank detection, loose number/email/phone parsing |
| `transform.test.ts` | `cleanValue` per field type — ids, emails, dates, enums, PAN, currency |
| `mapping.test.ts` | Auto-map vs. escalate vs. ignore boundary, competing-column detection, full-name routing |
| `reconcile.test.ts` | Cross-file merge by employee number, CTC conflicts, fuzzy duplicates, required-field and DOB/DOJ validation |
| `store.test.ts` | SQLite persistence — round-trip, overwrite-on-save, listing order/cap, and survival across a simulated restart |

## Project layout

```
src/lib/migration/   agent engine (parse, map, clean, reconcile, push)
src/routes/          desk, live console, approach
src/components/      shell + UI primitives
public/samples/      the three fictional Apex Manufacturing source files
```
