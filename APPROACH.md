# Approach

Meridian is an implementation console, not a chatbot with a CSV parser. The product decision is the **escalation boundary**. Everything else is machinery in service of that line.

## How it works

Three messy extracts (legacy HRIS, payroll, IT directory) are profiled, mapped with synonym + type scores, optionally reviewed by a model for leftover columns, then cleaned, merged, and validated against a Darwinbox-like employee master. The agent applies a change only when it could defend it to a client on a cutover call. Everything else becomes a queue item with evidence, a recommendation, and one-click resolutions.

## Alone versus escalate

Auto-map requires ≥82% confidence and an 18-point lead over the next field. That bar is high on purpose: a wrong column map poisons every row.

- **Alone:** ISO / day>12 / named-month dates; whitespace and ALL CAPS; email casing; PAN uppercase; 10-digit IN phones; exact duplicate rows; same person keyed by employee number or work email; empty vs present (take present); string containment (keep the longer form); known client vocabulary (`Permanent → full_time`, `M → male`, `APX-` prefix).
- **Escalate:** a column that could be two target fields within 18 points; two columns in the same file claiming one field; a required field with no source; `05/06/1991`-style locale traps (India is DMY, US payroll extracts are often MDY — we do not pick a default); enum tokens outside the closed list; CTC mismatches; fuzzy duplicates (same mobile, two IDs); Gmail offered as work email.

The agent is allowed to be wrong in the audit log. It is not allowed to be quietly wrong in the target HRIS.

## Delta on top of the model

Mapping is the commodity. The client-specific remainder is the job: APX- prefixes, Permanent→full_time, absconding as a separation reason rather than a status, a second IT id for the same person. Meridian records those as a **playbook** so the next file drop does not relitigate them. That is delta solutioning — configuration on top of a core engine, not a one-off spreadsheet.

## What I would build next

- Persistent client playbooks and active learning from consultant decisions
- Incremental (true payroll delta) loads, not only full cutover
- Direct Darwinbox employee-master API, with org units and positions
- PII masking in the console; approval via Teams for high-impact fields
- Calibration: measure how often recommendations are accepted, tighten thresholds
