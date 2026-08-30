---
name: backlog-heartbeat
description: PAUSIERT 2026-08-17 — Backlog Heartbeat (UC-HEARTBEAT-001). Grund: gemessen 0 von 14 Vorschlägen umgesetzt; wartet auf Entscheidung zum Zustellkanal (blockt THE-376).
---

Run the weekly Backlog Heartbeat (UC-HEARTBEAT-001 / THE-371) for the TheArchitect Linear team in REPORT-ONLY mode.

CRITICAL CONSTRAINT (non-negotiable): Do NOT change any Linear issue status. Do NOT set anything to Done. Do NOT create or edit any issue. The ONLY write you may perform in Linear is posting a single digest comment on THE-371. This honors Asilomar AI Principle #16 (Human Control): the loop surfaces findings, the human acts on them.

LIVENESS GUARANTEE (non-negotiable — this run's #1 job): Every run MUST leave an audit trail. That means BOTH: (a) exactly one comment on THE-371, and (b) a line appended to the local run-log. "No comment" must never happen again — a silent run is itself a failure. If you cannot complete the full sweep for any reason (tool error, rate limit, truncated data, ambiguity), you MUST STILL post a comment on THE-371 saying the run started, what you completed, and what failed — then still write the run-log line. Never exit without (a) and (b).

Tools: use the Linear MCP for all Linear reads/the one comment; use Bash/grep against the local repo at /Users/mac_macee/javis for code checks; use Bash to append to the run-log.

RUN-LOG: /Users/mac_macee/.claude/scheduled-tasks/backlog-heartbeat/runs.log

STEPS:

0. START LOG. Append a start line to the run-log (create the file if missing):
   `printf '%s\tSTART\n' "$(date -u +%FT%TZ)" >> /Users/mac_macee/.claude/scheduled-tasks/backlog-heartbeat/runs.log`

1. Pull all issues in status "Backlog" for the TheArchitect Linear team (list_issues, team="TheArchitect", state="Backlog", includeArchived=false, limit=250). The result is large and will likely exceed the inline token limit — when it does, the tool saves it to a tool-results file; read that file and parse with `jq` (e.g. `jq -r '.issues[] | "\(.identifier)\t\(.parentId // "-")\t\((.labels//[])|join(","))\t\(.title)"'`). Do NOT proceed on a truncated read — if you cannot parse the full set, treat it as a failure and follow the LIVENESS GUARANTEE.

2. Detect four staleness signals:
   - Typ A "tracker lies": issue is Backlog but its implementation already exists in the repo. From the issue title/description extract search signals (service/file names, endpoint paths like "/executive-summary", function names like "generateDataObjectsForProcess", REQ-ID markers). Then grep packages/**/src + __tests__ for them (quote globs in zsh: `grep -rIn --include='*.ts' --include='*.tsx' 'NEEDLE' packages/*/src`). BE FALSE-POSITIVE-ARMED: a mere "Pattern: X.service.ts" / "Vorbild" / "Pre-Flight" mention is NOT the issue's own code. Confirm with a REAL implementation file (an `export function …`, a route mount, or a rendered component) — not just a test mock or a `jest.fn()`.
   - Typ B born-ready / stale-parent: all of an issue's blockedBy relations are Done; OR a parent issue is in Backlog while its children are Done/In Review (use get_issue includeRelations + list_issues parentId).
   - Typ C ungescheduled: a prose dependency (named in docs/superpowers/rvtm/*.md or the issue description) is resolved/Done, but the issue is still Backlog.
   - Typ D: bugs sitting in Backlog (born-ready by class).

3. IDEMPOTENCY: read the comments on THE-371 (list_comments) and on any issue you are about to cite. Skip any finding whose issue already carries a "🫀 Heartbeat" digest line for a prior week unless its state has regressed. Only report NEW drift since the last digest. (The whole digest lives as one comment on THE-371; scan the most recent one to know what was already reported.)

4. POST EXACTLY ONE COMMENT on THE-371. Two cases, but a comment is posted in BOTH:
   - New drift found → consolidated digest, grouped by Typ A/B/C/D. For each finding give: issue ID + title, the evidence (file:line, blocker IDs, or doc reference), and the PROPOSED action (→ In Review / Todo / In Progress / flag). Start the comment with `🫀 Heartbeat <YYYY-MM-DD>`.
   - No new drift → post exactly: `🫀 Heartbeat <YYYY-MM-DD> — No new drift this week. (scanned N backlog issues)`.
   In every case end the comment with the literal line: `Report-only — no statuses changed; human decides. (Asilomar #16 + #7)`.

5. VERIFY THE POST. Immediately re-fetch comments on THE-371 (list_comments) and confirm your `🫀 Heartbeat <today's date>` comment is present. If it is NOT there, retry the post ONCE. If the retry also cannot be verified, append a `POST-FAILED` line to the run-log (step 6) so the failure is at least recorded locally.

6. END LOG. Append a result line to the run-log capturing the outcome:
   `printf '%s\tDONE\tbacklog=%s\tnew_findings=%s\tposted=%s\n' "$(date -u +%FT%TZ)" "<N>" "<count>" "<yes|no>" >> /Users/mac_macee/.claude/scheduled-tasks/backlog-heartbeat/runs.log`
   (On a handled failure, write `FAILED` instead of `DONE` plus a short reason — but only AFTER you have posted the fallback comment from the LIVENESS GUARANTEE.)

Keep the digest concise and skimmable. Do not act on findings beyond posting this one comment. The human routes the issues.