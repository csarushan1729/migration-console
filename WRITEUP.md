# Approach — Migration Console

## What it is

Migration Console is an agent for HR data cutover: it ingests a client's messy source exports, reconciles them into one dataset, maps and cleans the fields against a target employee-master schema, and pushes the result live — stopping only when a decision is genuinely too risky to make alone. The product decision here isn't the parsing or the UI. It's the **escalation boundary**: what the agent is trusted to do without a human, and what it isn't.

## How it works

Three source files (legacy HRIS export, payroll export, IT directory) are profiled, mapped onto the target schema using synonym and type scoring, optionally reviewed by a model for any leftover columns, then cleaned, cross-file reconciled into one person-level dataset, and validated. The agent only applies a change it could defend out loud on a client cutover call. Everything else becomes a queue item — with evidence, a recommendation, and a one-click resolution — routed to the implementation consultant in the UI, not buried in a log.

## Where I drew the line

Field mapping is auto-applied only above 82% confidence **and** an 18-point lead over the next-best field, or above 92% regardless of margin. That bar is high on purpose — a wrong column mapping silently poisons every row beneath it, and that kind of error is expensive precisely because it doesn't look like an error.

**Handled alone:** date normalization (ISO, day>12, named months), whitespace and casing cleanup, PAN/phone formatting, exact duplicate rows, the same person keyed differently across files by employee number or work email, and known client vocabulary once it's been confirmed once (e.g. `Permanent → full_time`).

**Escalated:** anything where a wrong guess is either ambiguous or costly to reverse — a column that could plausibly map to two target fields, two columns in one file both claiming the same field, a required field with no source, locale-ambiguous dates like `05/06/1991` (the agent never picks a default between DMY and MDY — it asks), enum values outside the closed list, compensation mismatches between systems, fuzzy duplicates (same phone, different IDs), and a personal email address offered where a work email was expected.

The underlying principle: the agent can be wrong in the audit log, where it's visible and reversible. It cannot be wrong, silently, inside the target system — especially on identity fields and money.

## Delta solutioning

Field mapping is the commodity part of this problem — every migration needs it, and it's largely solvable once. The client-specific remainder is the actual job: this client's internal ID prefix, their non-standard employment-type vocabulary, treating "Absconding" as a separation reason rather than a status the target system doesn't natively support. Migration Console records these as a **playbook**, captured once per decision, so the next file drop from the same client doesn't relitigate calls that were already made. That's the delta layer sitting on top of what the automated pipeline does on its own — configuration that compounds, not a one-off spreadsheet a consultant has to remember to reapply.

## What I'd build next

- Persistent, cross-session client playbooks, with the agent learning from which recommendations consultants actually accept versus override
- True incremental/delta payroll loads, not only full cutover runs
- A direct integration against a real target employee-master API, including org units and reporting lines
- PII masking in the console UI, with approval routing (e.g. via Teams/Slack) for high-impact fields
- Calibration tooling — track acceptance rate on auto-applied changes over time and tighten or loosen thresholds against real outcomes, rather than leaving them fixed at launch values
