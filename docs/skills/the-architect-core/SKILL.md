---
name: the-architect-core
description: >-
  Technical reference for talking to The Architect (the enterprise-architecture
  platform) from any skill: how to authenticate, which REST endpoints exist, the
  valid ArchiMate enums (layers, element types, relationship types, status), how
  to encode assumption-vs-validated, the dual-store gotcha (graph elements vs the
  project vision/stakeholders panel), the 3D layout rules that keep a committed
  model readable, the commit→verify workflow, and known platform bugs and their
  workarounds. This is a shared knowledge base consulted BY OTHER architect-*
  skills (e.g. togaf-vision-architect) — it is not a user-facing workflow and
  does not own any elicitation method. Read it whenever you need to create,
  update, lay out, or verify elements/connections/vision in The Architect via the
  API, or are unsure of an endpoint, enum value, or coordinate convention. The
  reference implementation scripts/commit-model.mjs commits + lays out + verifies
  a model end-to-end and is the thing to adapt rather than hand-rolling fetch.
compatibility: >-
  Targets The Architect's REST API. The MCP server (architect.* tools, THE-339)
  is the intended long-term interface but is NOT built yet — until then, commit
  via REST as documented here. Requires a target projectId (or create one) and an
  API key (ta_ prefix, X-API-Key header). Node 22 for the reference script.
---

# The Architect — Core

The shared technical core for the **architect-\* skill family**. Each
capability skill (vision, modeler, analyst, simulate, compliance…) owns its own
*method*; they all rely on this core for the *action* — "how do I actually talk
to The Architect." When the MCP server (THE-339) ships, its tool descriptions
supersede this core and the skills get thinner; until then, everything here is
the contract.

**Hard separation (the family principle):** method lives in the capability
skill; action/persistence lives here (and later in the MCP server). Never push
half-formed data; never expect the platform to "figure out" structure or
position — hand it a finished, laid-out, validated payload.

## How to use this core from another skill

A skill is a self-contained directory, but Claude can read any file under
`docs/skills/…` by path. So a sibling skill references this core's files
directly:

- **API contract & gotchas** → `the-architect-core/references/the-architect-api.md`
- **3D layout rules (avoid the hairball)** → `the-architect-core/references/3d-layout.md`
- **Reference implementation** → `the-architect-core/scripts/commit-model.mjs`
  (commit + auto-layout + read-back verify, end-to-end). **Adapt this rather
  than writing raw fetch calls.**

Read `the-architect-api.md` before any write; read `3d-layout.md` before any
commit.

## The non-obvious essentials (full detail in the references)

These are the things that are easy to get wrong and silently ruin a result.
Each is spelled out in the references — kept here so nothing is lost.

### Auth
Header `X-API-Key: ta_…` (or `Authorization: Bearer ta_…`). Alternative: login
`POST /api/auth/login {email,password}` → `accessToken`. Local dev API is
`http://localhost:4000/api` (client on `:3000`). **Pitfalls:** the local server
uses its own `localhost:27017` Mongo (separate from prod); the `.env` keys
(`THEARCHITECT_API_KEY*`) are *outbound prod* keys → 401 locally; keys rotate.
Generate a fresh local key in-app: **Settings → API Keys → Generate New Token**
(raw value shown **once**). **Never hard-code a key into the repo.**

### Endpoints (all under `/api/projects`)
- `POST /api/projects` `{name,description,tags}` → project with `_id`
- `POST /api/projects/:id/elements` — `{id?, type, name, description, layer,
  togafDomain, status, riskLevel, maturityLevel, position3D{x,y,z}, metadata}`
- `POST /api/projects/:id/connections` `{sourceId, targetId, type, label}` —
  **no PUT**; to change a type, DELETE + recreate. `DELETE …/connections/:connId`.
- `PUT /api/projects/:id` `{vision{…}, stakeholders[]}` ← **dual representation**
- `PUT …/elements/:id {position3D}`; `GET …/elements`, `…/connections` (read-back)
- `DELETE /api/projects/:id`

### Enums
- **layer:** `motivation | strategy | business | information | application |
  technology | physical | implementation_migration`
- **motivation types:** stakeholder, driver, assessment, goal, outcome,
  principle, requirement, constraint, am_value, meaning
- **strategy types:** business_capability, value_stream, resource,
  course_of_action
- **relationships:** influence, realization, association, serving, flow,
  composition, aggregation, assignment, access, triggering, specialization
- **status:** current | target | transitional | retired

### Assumption vs. validated (trust encoding)
Provenance fields (`certifiedBy`, …) are **server-set and not spoofable from the
API** (anti-spoofing). Encode the distinction yourself:
- validated/known → `status: "current"` + `metadata.assumption: false`
- assumption/hypothesis → `status: "target"` + `metadata.assumption: true`

### Dual representation (the silent trap)
Graph elements (Neo4j, via `…/elements`) and the project's `vision` +
`stakeholders` (Mongo, via `PUT /projects/:id`) are **separate stores**. The
Phase-A panel reads the vision; creating elements does **not** fill it. Write
**both**.

### 3D layout (else: star-field hairball)
The client overrides Y on load via `resolveElementY(layer,type)`
(`packages/shared/src/constants/togaf.constants.ts`); you control only **X/Z**,
in **small units** (~3 per cell, roughly −12…+12 — NOT hundreds). Motivation
stacks into a vertical wall (stakeholder y≈31 … requirement y≈16); Strategy
stacks below (value_stream 14.5, business_capability 13) and
`capability —serving→ value_stream` points up = the **Value Stream View**. Full
recipe and bands: `references/3d-layout.md`. `commit-model.mjs` already does this
auto-layout.

### Verify (never report "done" unverified)
After every commit, `GET` elements + connections, count by type, check the
assumption split. `commit-model.mjs` ends with this read-back.

## Known platform bugs (document, don't silently absorb)

**THE-370 — connection match without projectId scope.** `POST …/connections`
matches source/target elements by `id` **without** scoping to projectId, so
short generic ids (`sh-du`, `cap-trust`) collide across projects → 500 /
ambiguous match / unique-constraint violation. **Workaround (already in
`commit-model.mjs`):** namespace ids per project — `NS(id)` derives a stable
prefix from the projectId so ids are globally unique yet deterministic across
re-runs — plus retry transient `500/401/429` on every write. The proper server
fix is tracked as THE-370 (separate).

## Quick start (reference script)

```bash
# fresh local API key first (Settings → API Keys → Generate New Token)
API_KEY=ta_… node scripts/commit-model.mjs --demo        # tiny built-in example
API_KEY=ta_… node scripts/commit-model.mjs model.json    # commit a real model
API_KEY=ta_… PROJECT_ID=… node scripts/commit-model.mjs --layout-only model.json
```

The script handles: create-project-if-needed → elements (with status/assumption
encoding + per-project id namespacing + retry) → connections → vision +
stakeholders → read-back verify. The `model.json` shape is documented in the
script header.
