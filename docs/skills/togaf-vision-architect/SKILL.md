---
name: togaf-vision-architect
description: >-
  Guides a user through building THEIR enterprise/business architecture in The
  Architect — entirely in natural language — and commits the result as a clean,
  READABLE ArchiMate 3.2 model (Motivation + Strategy layers) via The Architect's
  API. Use this skill whenever the user wants to START or shape an architecture:
  "create a vision", "model my company", "set up our business architecture",
  "kick off an initiative", "fill the motivation layer", define
  drivers/goals/stakeholders/outcomes, map value streams and capabilities, or
  when they describe a strategy or transformation idea in prose and expect a
  structured model — even if they never say "TOGAF" or "ArchiMate". This is the
  front door for an empty (or thin) project: reach for it before any generic
  import whenever the user is describing INTENT rather than handing over existing
  artifacts. Also trigger when the user asks "what is my business architecture",
  wants to discuss goals/outcomes/value, or wants their company reflected inside
  The Architect.
compatibility: >-
  Targets The Architect. The MCP server (architect.* tools) is the intended
  long-term interface but is NOT built yet — until then, commit via the REST API.
  All API, layout, and commit details live in the shared the-architect-core skill
  (the-architect-core/references/* and scripts/commit-model.mjs) — read those
  before any commit. Requires a target projectId (or create one) and an API key
  (ta_ prefix, X-API-Key header). Node 22 for the reference script.
---

> **Shared core:** the *how to talk to The Architect* details (auth, endpoints,
> enums, dual-store, 3D layout, verify, known bugs) live in the
> **`the-architect-core`** skill, shared across the architect-\* family. This
> skill owns only the *method*. When this document points at "the core," read:
> `the-architect-core/references/the-architect-api.md`,
> `the-architect-core/references/3d-layout.md`, and
> `the-architect-core/scripts/commit-model.mjs`.

# TOGAF Vision Architect

Turn a spoken or written idea ("we want to migrate ERP to the cloud, driven by
NIS2 and cost pressure" — or "help me model my own company") into a structured,
**readable** architecture committed into The Architect: an ArchiMate 3.2
**Motivation** model (the "why"), and optionally a **Strategy** layer (value
streams + capabilities — the "what we bet on").

The point is to take the complexity out of the software. The user thinks and
talks; this skill owns the TOGAF method and the ArchiMate metamodel; the platform
receives a clean, validated, well-laid-out payload to persist and render.

This skill was distilled from a real dogfooding session — building The
Architect's *own* company architecture. Two lessons from that run shape
everything below, because both are easy to get wrong and both make the result
useless if missed:

1. **Eliciting good content is a discipline, not a form.** Generic questions
   produce generic filler. The high-leverage move is surfacing the *strategic
   forks* (see "Strategic discovery").
2. **A committed model that isn't laid out is a hairball.** The 3D scene has
   specific coordinate rules. Skipping them produces a sprawling star-field that
   looks broken regardless of how good the content is. See
   `the-architect-core/references/3d-layout.md` — read it before any commit.

## Core principle: method here, action via the API (MCP later)

Keep a hard separation:

- **This skill owns the method** — the questioning sequence, the mapping to
  ArchiMate element types, the relationship rules, the layout, and quality
  control all happen in the conversation.
- **The platform owns persistence** — a thin write layer that receives a
  finished, laid-out payload. Never push half-formed data; never expect the
  platform to "figure out" structure or position.

The MCP server (`architect.commit_motivation_model`, etc.) is the intended
interface, but it is **not implemented yet**. Until it exists, commit through the
REST API in `the-architect-core/references/the-architect-api.md`. When the MCP
server ships it will wrap exactly these operations, so the method here does not
change.

## Before you start

1. **Confirm a target `projectId`.** If none is given, create one (see the API
   reference) or ask which to populate.
2. **Confirm auth.** You need an API key (`ta_…`) for the `X-API-Key` header. If
   the user doesn't have one handy, point them to Settings → API Keys → Generate
   New Token (the raw key is shown only once). Details and pitfalls (local vs.
   prod databases, stale keys) are in
   `the-architect-core/references/the-architect-api.md`.
3. **Mirror the user's language.** Default to German for this audience; switch to
   whatever the user writes in. Element `name`/`description` go into the model in
   that language. (Tip from the source session: it can be useful to keep the
   *content* in the user's language but *reasoning/labels* in English — be
   consistent.)
4. **Never commit before a preview and an explicit yes.** Writes are
   confirmation-gated (see "Confirmation discipline").

## The elicitation flow

Work through these themes **one at a time**, conversationally. Don't dump all
questions at once — that produces fatigue and shallow answers. Ask, listen,
reflect back in ArchiMate terms, then move on. Keep your own questions short; the
user is describing, not filling a form. If the conversation already contains rich
context, extract answers from it first and only ask about genuine gaps.

### Strategic discovery (do this first when modeling a company/business)

For an IT initiative you can go straight to Step 1 below. But when the user wants
to model **their company / business / enterprise architecture**, the motivation
layer is only as good as the strategy behind it. Surface these forks *before*
forming elements — they were the difference between a generic model and a true
one in the source session:

- **Separate the company from the product.** "What you sell" ≠ "how you create
  and capture value." Model the latter.
- **The business-model fork — and that options live on different levels.** When
  you offer choices (e.g. SaaS / consulting+tool hybrid / funding), notice they
  may not be comparable: a *phase* ("land first customer") is not a *business
  model* (SaaS vs hybrid) is not an *exit* (funding). Sort them onto their levels
  so the user chooses the one real fork.
- **Purpose vs. means.** "Consulting + tool" splits into "consultant *with* a
  tool" (a practice, doesn't scale) vs. "tool firm, consulting-financed" (an
  asset). Pin which one — it reorders every capability.
- **The value-proposition causal chain.** Push past "better X" to the *enabler*.
  (Source example: trust → freedom within governance → transformation. They sell
  the enabler, not the outcome.) The chain often becomes a `Principle` plus the
  goal/outcome spine.
- **Economic buyer vs. champion.** Who holds the budget vs. who loves the
  product? They're usually different `Stakeholder`s with different motivations.
- **Reusable vs. one-off (productization).** What from a delivery repeats vs. is
  bespoke? This reveals the real `Capability` gaps.
- **Honest maturity.** What is *known* vs. *assumed*? This drives the
  assumption/validated encoding below — don't skip it.

### Phase A — Motivation (the core model)

**Step 1 — Scope & initiative.** What's the initiative? What problem/opportunity
triggered it? In/out of scope? (Sets the boundary; not yet an element.)

**Step 2 — Stakeholders & drivers.** Who cares, and why? External/internal
forces? → `stakeholder`, `driver`. Stakeholders *influence/associate with* the
drivers they care about. Watch for special stakeholder roles (an authority that
makes a claim credible; a validation surface that supplies real data) — they earn
a place even when they aren't customers.

**Step 3 — Assessment of today.** Honest read on the current situation —
strengths, gaps relative to the drivers (a light SWOT). → `assessment`, each
*associated with* the driver it assesses.

**Step 4 — Goals & outcomes.** Given those assessments, what does success look
like? Separate the qualitative aim from the concrete observable result. → `goal`
(aim), `outcome` (achieved end-state). Outcomes *realize* goals; assessments
*influence* goals.

**Step 5 — Principles & constraints.** Guiding rules the architecture must
respect; hard limits (budget, tech, legal, time). → `principle`, `constraint`.
Principles *realize* goals/drivers and *influence* requirements. (The value-prop
causal chain from discovery often lands here as a principle.)

**Step 6 — High-level requirements.** What must hold for the vision — at vision
altitude, not detailed specs. → `requirement`. Requirements *realize* goals.

### Strategy (optional, after the vision) — Value Streams + Capabilities

Offer this once the vision is committed: "Want to map how value is actually
created — value streams and the capabilities behind them?" This produces the
**Value Stream View** (a major reason to use the strategy layer):

- `value_stream` — the sequence that creates value (e.g. "consulting delivery →
  product license").
- `business_capability` — the abilities the business needs. Mark which exist
  (validated) and which are gaps (assumption). Capability gaps are often the
  user's real roadmap.
- Wire **`capability —serving→ value_stream`** (arrow points up). With the layout
  in `the-architect-core/references/3d-layout.md`, this renders as the canonical
  ArchiMate Value Stream View for free.

## Assumption vs. validated (the trust encoding)

Most forward-looking elements (goals, outcomes, target value streams, capability
gaps) are *hypotheses* until grounded in real data. Make that honesty visible —
it is often the user's own thesis applied to their own model:

- **Validated / known** → `status: "current"`, `metadata.assumption: false`
- **Assumption / hypothesis** → `status: "target"`, `metadata.assumption: true`

(Provenance fields like `certifiedBy` exist but are **server-set and not
spoofable from the API** — so encode the distinction via `status` + `metadata`,
not provenance. See `the-architect-core/references/the-architect-api.md`.)

## Quality guardrails (the abstract-layer trap)

Motivation elements are abstract, so output drifts toward generic filler. Guard
before previewing:

- **No vague goals.** Reject "improve efficiency" / "be more agile". Push for
  specific, ideally observable aims tied to a driver.
- **Every goal traces to a driver.** No driving force → find it or drop the goal.
- **Outcomes are end-states, not activities.** "Migrated to cloud" ✓; "migrate to
  cloud" ✗.
- **Constraint ≠ requirement.** A constraint limits the solution space; a
  requirement is to be realized.
- **Vision altitude.** ~5–15 motivation elements is healthy. Sprawl into detailed
  design means you left Phase A.
- **Mark assumptions honestly.** If the model is mostly `target`/assumption,
  that's fine — say so. It tells the user what to validate next.

## Synthesize → preview → confirm → commit → verify

1. Assemble the model in memory (elements + relationships + assumption flags).
2. Run the guardrails.
3. **Preview** compactly: element count by type, the driver→goal→outcome spine,
   the value-stream/capability map, and what's marked assumption.
4. Get an **explicit yes**.
5. **Commit** via the API
   (`the-architect-core/references/the-architect-api.md`). Use stable local ids
   so relationships and positions wire deterministically. Populate **both** the
   graph elements **and** the project's vision/stakeholders fields — they are
   separate stores and the Phase-A panel reads the latter (see "dual
   representation" in the API reference).
6. **Lay it out** so it's readable — this is not optional. Apply the coordinate
   rules in `the-architect-core/references/3d-layout.md`.
7. **Verify with a read-back** (GET elements + connections; count by type) and
   report what was created and where to see it (3D view).

The reference script `the-architect-core/scripts/commit-model.mjs` does steps
5–7 end-to-end from a model definition — adapt it rather than hand-rolling fetch
calls.

## Confirmation discipline

Every write is gated. Before any commit: show the preview, get a yes, then write.
If the user edits during preview, update the in-memory model and re-preview — do
not commit a model the user hasn't just seen. Keep the vision commit and the
optional strategy/As-Is step as **separate** approvals; never bundle them.

## Output format (summary back to the user)

After a successful commit + verify, summarize in the user's language:

```
Architecture committed to <project> (id <projectId>).
Drivers:      <list>
Stakeholders: <list>  (buyer vs. champion noted where relevant)
Goals → Outcomes:
  - <goal> → <outcome>   [validated | assumption]
Principles & constraints: <list>
Value streams → capabilities (if modeled):
  - <stream> ← serving ← <capability> [validated | gap]
Marked as assumption (to validate next): <list>
Verify: <N> elements, <M> relations persisted. Open the 3D view to see it.
```

## Examples

**Example 1 — model a company.** Input: "Help me get my company into The
Architect — discuss it with me first." Action: run Strategic discovery (business
model, purpose-vs-means, value-prop chain, buyer, productization, maturity),
then Phase A motivation, offer the strategy layer, mark assumptions, preview,
commit + lay out + verify.

**Example 2 — minimal kickoff.** Input: "Start a vision: modernize our legacy CRM
because customers churn and support costs rise." Action: elicit Steps 1–6
(drivers: churn, support cost; goal: reduce churn to <X%; outcome: modern CRM
live), preview, commit, offer value-stream mapping.

**Example 3 — vague goal caught.** Input: goal is "to be more digital." Action:
don't commit it. Ask what observable change that means and which driver pushes
it, then form a specific goal/outcome pair.
