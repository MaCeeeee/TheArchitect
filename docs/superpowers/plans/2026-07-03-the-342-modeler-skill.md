# THE-342 „Paste & See" Modeler-Skill — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new Claude skill `the-architect-modeler` that turns pasted prose (concept papers, e-mails, meeting notes) into a committed multi-layer ArchiMate 3.2 model in a chosen project, with a preview→confirm gate before any write.

**Architecture:** Second skill in the `the-architect-*` family, layered on the existing `the-architect-core` (references + `commit-model.mjs`). Extraction runs *in the skill* (Claude is the LLM — no backend service). The write path reuses `commit-model.mjs` over the REST API. Only three small, TDD-covered generalizations to `commit-model.mjs` are needed; no new endpoint, service, or schema change. Duplicate detection is Name+Type against `GET …/elements` (semantic/Qdrant dedup is explicitly out of scope — future).

**Tech Stack:** Node 22 ESM (`.mjs`), `node --test` (built-in), Markdown skill authoring, The Architect REST API (`ta_` API-key auth).

**RVTM:** docs/superpowers/rvtm/2026-07-03-the-342-modeler-skill-rvtm.md

**Linear:** [THE-342](https://linear.app/thearchitect/issue/THE-342) (child of THE-339). Depends conceptually on THE-370 (projectId-scope fix, PR #28) — not a hard blocker because `commit-model.mjs` already namespaces ids (`NS()`).

---

## Context the implementer needs (read first)

You have zero context for this codebase. Read these before starting — they are short and authoritative:

- `docs/skills/the-architect-core/references/the-architect-api.md` — the REST contract: auth, `POST …/elements`, `POST …/connections`, `PUT …/:projectId` (vision/stakeholders), enums (layer, togafDomain, element types, relationship types, status), assumption encoding, the dual-representation gotcha, read-back verify.
- `docs/skills/the-architect-core/references/3d-layout.md` — 3D layout scale/bands.
- `docs/skills/the-architect-core/scripts/commit-model.mjs` — the runnable write script you will generalize. Study `layerOf`, `domainOf`, `MOTIVATION_Y`, `STRATEGY_Y`, `PLANE_Y`, `yOf`, `autoLayout`, and the bottom IIFE.
- `.claude/skills/togaf-vision-architect/SKILL.md` — the sibling skill. This is your **template** for tone, structure, and the confirmation discipline. The Modeler mirrors its shape.
- `packages/shared/src/constants/togaf.constants.ts` — canonical `ARCHITECTURE_LAYERS`/`LAYER_Y`, `MOTIVATION_SUB_Y`, `STRATEGY_SUB_Y`, `resolveElementY`, `TOGAF_DOMAINS`, `ELEMENT_TYPES` (type→domain). **This is the single source of truth** `commit-model.mjs` mirrors. Any layer/domain map you write must match it.

**Key facts that shape the plan (already verified):**
1. The element POST body in `commit-model.mjs` already honors an explicit `e.layer` and derives `togafDomain` via `domainOf(layer)`. `PLANE_Y` already covers all 8 layers. So multi-layer support is *mostly there* — the gaps are narrow.
2. The server **auto-resolves Y on load** via `resolveElementY(layer, type)`. So the stored Y is cosmetic; the real layout work `commit-model.mjs` owns is **X/Z**. `domainOf` matters because `togafDomain` is a *stored, queried* field (domain filters, TPCV views), not because of Y.
3. `domainOf` today only maps motivation/strategy/business correctly; `information`/`application`/`technology`/`physical`/`implementation_migration` all fall through to `'business'` — **wrong**. This is the load-bearing fix.
4. `autoLayout` groups by `${layer}:${type}` but places every non-motivation/strategy group at `z=0`. Two types in the same plane (e.g. `application_component` + `application_service`) then share Y (`LAYER_Y[layer]`) *and* z=0 → overlapping coordinates. Needs per-type Z separation within a plane.

---

## File Structure

- **Modify** `docs/skills/the-architect-core/scripts/commit-model.mjs`
  - Fix `domainOf` → full 8-layer→domain map (authoritative derivation).
  - Extend `layerOf` → best-effort type→layer fallback for common business/app/tech/data types (safety net; explicit `e.layer` remains the contract).
  - Fix `autoLayout` → give each type-group within a non-motivation/strategy plane a distinct Z lane.
  - Add an `import.meta`/argv guard so pure helpers can be imported by tests without running the IIFE, and `export` the pure helpers.
- **Create** `docs/skills/the-architect-core/scripts/commit-model.test.mjs`
  - `node --test` unit tests for `domainOf` (all 8 layers), `layerOf` (fallback), `autoLayout` (no coordinate collision across types in one plane).
- **Create** `docs/skills/the-architect-modeler/SKILL.md`
  - The skill: description/triggers (delimited from Vision), prose→ArchiMate method across all layers, type/layer vocabulary, relationship rules, dedup-preview flow, logical `architect.commit_elements` contract + `commit-model.mjs` executor note, confirmation discipline, output format, examples.
- **Create** `docs/skills/the-architect-modeler/fixtures/modeler-multilayer.json`
  - A multi-layer sample model (business + application + technology + data + connections) used by the end-to-end verification step and as an in-doc example.
- **Mirror (copy)** `docs/skills/the-architect-modeler/` → `.claude/skills/the-architect-modeler/`
  - `docs/skills/` is the tracked source; `.claude/skills/` is the gitignored runtime location (same convention as `togaf-vision-architect`).

---

## Chunk 1: Generalize `commit-model.mjs` (TDD)

### Task 1: Make helpers importable + failing tests for `domainOf`

**Files:**
- Modify: `docs/skills/the-architect-core/scripts/commit-model.mjs`
- Test: `docs/skills/the-architect-core/scripts/commit-model.test.mjs`

- [ ] **Step 1: Guard the IIFE and export the pure helpers**

At the bottom of `commit-model.mjs`, the model-committing IIFE currently runs on any import. Wrap its invocation so it only runs when the file is executed directly, and export the pure helpers. Change the IIFE from `(async () => { … })();` to a named async `main` and guard it:

```js
// ── exported pure helpers (testable without touching the network) ──────────
export { layerOf, domainOf, yOf, autoLayout };

// Only run the committer when executed as a script, not when imported by tests.
// pathToFileURL(argv[1]) survives symlinked invocation paths (e.g. /tmp → /private/tmp
// on macOS), where a raw fileURLToPath string comparison would silently skip main().
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

Rename the existing `(async () => { … })();` to `async function main() { … }`. Do not change its body.

- [ ] **Step 2: Write the failing test for `domainOf`**

```js
// docs/skills/the-architect-core/scripts/commit-model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainOf, layerOf, autoLayout } from './commit-model.mjs';

test('domainOf maps every ArchiMate layer to its canonical TOGAF domain', () => {
  assert.equal(domainOf('motivation'), 'motivation');
  assert.equal(domainOf('strategy'), 'strategy');
  assert.equal(domainOf('business'), 'business');
  assert.equal(domainOf('information'), 'data');          // Data domain
  assert.equal(domainOf('application'), 'application');
  assert.equal(domainOf('technology'), 'technology');
  assert.equal(domainOf('physical'), 'technology');       // physical → technology domain
  assert.equal(domainOf('implementation_migration'), 'implementation');
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `node --test docs/skills/the-architect-core/scripts/commit-model.test.mjs`
Expected: FAIL — `domainOf('information')` returns `'business'`, not `'data'`.

- [ ] **Step 4: Fix `domainOf` with the authoritative map**

Replace the current `const domainOf = (l) => …;` with (mirrors `TOGAF_DOMAINS` + `ARCHITECTURE_LAYERS` in `togaf.constants.ts`):

```js
const LAYER_TO_DOMAIN = {
  motivation: 'motivation',
  strategy: 'strategy',
  business: 'business',
  information: 'data',
  application: 'application',
  technology: 'technology',
  physical: 'technology',                 // no 'physical' domain — rolls up to technology
  implementation_migration: 'implementation',
};
const domainOf = (l) => LAYER_TO_DOMAIN[l] ?? 'business';
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `node --test docs/skills/the-architect-core/scripts/commit-model.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/skills/the-architect-core/scripts/commit-model.mjs docs/skills/the-architect-core/scripts/commit-model.test.mjs
git commit -m "fix(skills/core): domainOf maps all 8 layers + make helpers testable (THE-342)"
```

### Task 2: `layerOf` fallback for business/app/tech/data types

**Files:**
- Modify: `docs/skills/the-architect-core/scripts/commit-model.mjs`
- Test: `docs/skills/the-architect-core/scripts/commit-model.test.mjs`

Contract: the Modeler skill always emits an explicit `layer` per element. `layerOf` is only a *fallback* for elements that omit it (demo/legacy). Keep it small and correct — do not replicate all ~50 `ELEMENT_TYPES`; cover the common ones and default to `business`.

- [ ] **Step 1: Write the failing test**

```js
test('layerOf infers the layer for common non-motivation/strategy types', () => {
  assert.equal(layerOf('application_component'), 'application');
  assert.equal(layerOf('application_service'), 'application');
  assert.equal(layerOf('node'), 'technology');
  assert.equal(layerOf('system_software'), 'technology');
  assert.equal(layerOf('data_object'), 'information');
  assert.equal(layerOf('process'), 'business');            // explicit business behavioral
  assert.equal(layerOf('stakeholder'), 'motivation');      // unchanged
  assert.equal(layerOf('business_capability'), 'strategy'); // unchanged
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test docs/skills/the-architect-core/scripts/commit-model.test.mjs`
Expected: FAIL — `layerOf('application_component')` returns `'business'`.

- [ ] **Step 3: Extend `layerOf`**

Add `APPLICATION`, `TECHNOLOGY`, `INFORMATION` arrays next to `MOTIVATION`/`STRATEGY` and widen `layerOf` (types taken verbatim from `ELEMENT_TYPES` in `togaf.constants.ts`):

```js
const APPLICATION = ['application_component','application_collaboration','application_interface','application_function','application_interaction','application_process','application_event','application_service'];
const TECHNOLOGY = ['node','device','system_software','technology_collaboration','technology_interface','path','communication_network','technology_function','technology_process','technology_interaction','technology_event','technology_service','artifact'];
const INFORMATION = ['data_object','data_entity','data_model'];
const layerOf = (t) =>
  MOTIVATION.includes(t) ? 'motivation'
  : STRATEGY.includes(t) ? 'strategy'
  : APPLICATION.includes(t) ? 'application'
  : TECHNOLOGY.includes(t) ? 'technology'
  : INFORMATION.includes(t) ? 'information'
  : 'business';
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test docs/skills/the-architect-core/scripts/commit-model.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/skills/the-architect-core/scripts/commit-model.mjs docs/skills/the-architect-core/scripts/commit-model.test.mjs
git commit -m "feat(skills/core): layerOf fallback for app/tech/data types (THE-342)"
```

### Task 3: `autoLayout` — per-type Z lanes within a plane (no overlap)

**Files:**
- Modify: `docs/skills/the-architect-core/scripts/commit-model.mjs`
- Test: `docs/skills/the-architect-core/scripts/commit-model.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('autoLayout separates different types in the same plane so no two elements collide', () => {
  const els = [
    { id: 'ac1', type: 'application_component', name: 'A', layer: 'application' },
    { id: 'ac2', type: 'application_component', name: 'B', layer: 'application' },
    { id: 'as1', type: 'application_service',   name: 'C', layer: 'application' },
    { id: 'as2', type: 'application_service',   name: 'D', layer: 'application' },
  ];
  autoLayout(els);
  const key = (e) => `${e.position3D.x}|${e.position3D.y}|${e.position3D.z}`;
  const coords = els.map(key);
  assert.equal(new Set(coords).size, coords.length, 'every element has a unique coordinate');
  // The two type-groups must occupy different Z lanes.
  const zByType = {};
  for (const e of els) (zByType[e.type] ||= new Set()).add(e.position3D.z);
  assert.notDeepEqual([...zByType.application_component], [...zByType.application_service]);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test docs/skills/the-architect-core/scripts/commit-model.test.mjs`
Expected: FAIL — both application groups land at z=0, so `application_component` and `application_service` overlap.

- [ ] **Step 3: Fix `autoLayout` to assign a Z lane per type-group in flat planes**

In `autoLayout`, the flat-layer branch (the final `else { x = spread(...); z = 0; }`) must offset Z per type-group. Track a per-layer lane index so successive types in the same plane get z = 0, 3, -3, 6, … Replace the flat-layer handling with:

```js
  // Assign each flat-plane type-group its own Z lane so types don't overlap.
  const laneByLayer = {};                       // layer → next lane index
  const laneOfGroup = {};                        // groupKey → lane index (stable)
  const zForLane = (n) => (n % 2 === 1 ? 1 : -1) * Math.ceil(n / 2) * 3; // 0,3,-3,6,-6…
  for (const [key, group] of Object.entries(byKey)) {
    const layer = group[0].layer || layerOf(group[0].type);
    if (!(key in laneOfGroup) && layer !== 'motivation' && layer !== 'strategy') {
      laneOfGroup[key] = (laneByLayer[layer] ??= 0);
      laneByLayer[layer]++;
    }
    group.forEach((e, i) => {
      if (e.position3D) return;
      const y = yOf(layer, e.type);
      let x, z;
      if (key === 'vs') { x = spread(group.length, i, 10); z = 0; }
      else if (key === 'cap-have') { x = spread(group.length, i, 6); z = 4; }
      else if (key === 'cap-gap') { x = spread(group.length, i, 6); z = 9; }
      else if (layer === 'motivation') { x = spread(group.length, i, 5); z = 0; }
      else { x = spread(group.length, i, 6); z = zForLane(laneOfGroup[key]); }
      e.position3D = { x: Math.round(x * 10) / 10, y, z };
    });
  }
```

Note: this replaces the existing `for (const [key, group] of …)` loop body — fold the lane bookkeeping into the single existing loop; do not add a second loop. Keep the `strategy`/`motivation`/`vs`/`cap-*` behavior byte-for-byte identical.

- [ ] **Step 4: Run the full test file to confirm all pass**

Run: `node --test docs/skills/the-architect-core/scripts/commit-model.test.mjs`
Expected: PASS (all three tests).

- [ ] **Step 5: Smoke-test the demo path still runs (no network)**

Run: `node docs/skills/the-architect-core/scripts/commit-model.mjs --demo 2>&1 | head -5`
Expected: it reaches the auth check and exits with the "FEHLT: API_KEY…" message (proves the IIFE guard + refactor didn't break execution). It must NOT throw a JS error.

- [ ] **Step 6: Commit**

```bash
git add docs/skills/the-architect-core/scripts/commit-model.mjs docs/skills/the-architect-core/scripts/commit-model.test.mjs
git commit -m "fix(skills/core): autoLayout Z-lanes prevent same-plane type overlap (THE-342)"
```

---

## Chunk 2: Author the `the-architect-modeler` skill

### Task 4: Write `the-architect-modeler/SKILL.md`

**Files:**
- Create: `docs/skills/the-architect-modeler/SKILL.md`
- Create: `docs/skills/the-architect-modeler/fixtures/modeler-multilayer.json`

- [ ] **Step 1: Create the multi-layer fixture** (also the in-doc worked example)

`docs/skills/the-architect-modeler/fixtures/modeler-multilayer.json`:

```json
{
  "project": { "name": "Modeler — Demo", "description": "the-architect-modeler multi-layer demo", "tags": ["demo","modeler"] },
  "elements": [
    { "id": "svc-order", "type": "business_service", "name": "Order Management", "layer": "business" },
    { "id": "proc-fulfil", "type": "process", "name": "Fulfil Order", "layer": "business" },
    { "id": "app-erp", "type": "application_component", "name": "ERP", "layer": "application" },
    { "id": "app-shop", "type": "application_component", "name": "Web Shop", "layer": "application" },
    { "id": "as-catalog", "type": "application_service", "name": "Catalog API", "layer": "application" },
    { "id": "do-order", "type": "data_object", "name": "Order", "layer": "information" },
    { "id": "node-k8s", "type": "node", "name": "Kubernetes Cluster", "layer": "technology" },
    { "id": "ss-postgres", "type": "system_software", "name": "PostgreSQL", "layer": "technology" }
  ],
  "connections": [
    { "s": "proc-fulfil", "t": "svc-order", "type": "realization", "label": "realizes" },
    { "s": "app-erp", "t": "proc-fulfil", "type": "serving", "label": "serves" },
    { "s": "as-catalog", "t": "app-shop", "type": "serving", "label": "serves" },
    { "s": "app-erp", "t": "do-order", "type": "access", "label": "reads/writes" },
    { "s": "node-k8s", "t": "app-erp", "type": "serving", "label": "hosts" },
    { "s": "ss-postgres", "t": "node-k8s", "type": "serving", "label": "runs on" }
  ]
}
```

- [ ] **Step 2: Write the skill** using `togaf-vision-architect/SKILL.md` as the structural template. The frontmatter `description` must be **triggering-precise and delimited from Vision**:

Required sections (mirror the Vision skill's shape and confirmation discipline):
- **Frontmatter**: `name: the-architect-modeler`; `description` that triggers on "paste this text/spec/notes and build/create an ArchiMate model", "turn this document into elements", "model this system description" — and **explicitly says**: use this when the user hands over *existing prose/artifacts describing systems*; for starting from intent/vision use `togaf-vision-architect` instead. `compatibility`: needs a `projectId` + `ta_` key; executes via `the-architect-core` (`commit-model.mjs`).
- **Core principle**: methodology (extraction) lives in the skill; action lives in `the-architect-core`/(future) MCP.
- **Before you start**: confirm `projectId`; mirror the user's language for `name`/`description`; never commit before a confirmed preview.
- **Extraction method**: read the prose, identify candidate elements across **all** layers (business/application/technology/data, plus motivation/strategy when the text implies intent), assign `type` + `layer` from the vocabulary, infer relationships. Reference `the-architect-core/references/the-architect-api.md` (`@`-style) for the enums rather than duplicating the full list.
- **Layer/type vocabulary** (compact): list the layers and the most common types per layer; point to `the-architect-api.md` and `togaf.constants.ts` for the full set. Rule: **emit an explicit `layer` for every element**; invalid/unknown types are shown in the preview as "unsupported — dropped", never committed (AC-2).
- **Relationship rules**: the ArchiMate 3.2 relationship types and common valid patterns (serving/realization/access/assignment/composition/flow/triggering), pointing to the api.md patterns.
- **Dedup preview flow (AC-3, AC-4)**: before writing, `GET /api/projects/:projectId/elements`; match each proposed element by **Name+Type** (case-insensitive, trimmed); mark matches as "exists — reuse id" and DO NOT re-create them (reuse the existing id when wiring relationships); mark the rest as "new". Present a compact preview: new-elements-by-type, dedup hits, and the relationship list.
- **Logical tool contract + executor note** (per the chosen convention): describe a logical `architect.commit_elements` tool (`projectId`, `elements[]`, `connections[]` → created ids) for family consistency, and state plainly that **today the executor is `the-architect-core/scripts/commit-model.mjs`** (pass the model JSON; it namespaces ids via `NS()`, retries writes, and reads back to verify).
- **Confirmation discipline**: preview → explicit yes → commit; re-preview on edits; never commit an unseen model (Asilomar #16).
- **Verification & output (AC-5)**: after commit, rely on the script's read-back; report counts by type, dedup summary, and point the user to the 3D view. Do not claim success unverified.
- **Examples**: (1) short system paragraph → multi-layer model; (2) a paste that overlaps an existing model → dedup reuses ids; (3) an ambiguous/underspecified paste → ask one clarifying question rather than inventing.

- [ ] **Step 3: Structural self-check (lint-style, no code)**

Verify the file has valid frontmatter and every required section above. Run:

```bash
head -20 docs/skills/the-architect-modeler/SKILL.md          # frontmatter present
grep -cE '^## ' docs/skills/the-architect-modeler/SKILL.md    # section count ≥ 8
```
Expected: frontmatter with `name`/`description`/`compatibility`; ≥ 8 `##` sections.

- [ ] **Step 4: Commit**

```bash
git add docs/skills/the-architect-modeler/
git commit -m "feat(skills): the-architect-modeler — prose → multi-layer ArchiMate (THE-342)"
```

### Task 5: Mirror the skill into the runtime location

**Files:**
- Create (copy): `.claude/skills/the-architect-modeler/` (gitignored runtime mirror)

- [ ] **Step 1: Copy the tracked source to the runtime location**

Run:
```bash
mkdir -p .claude/skills/the-architect-modeler
cp -R docs/skills/the-architect-modeler/. .claude/skills/the-architect-modeler/
```

- [ ] **Step 2: Confirm the skill is discoverable**

Run: `test -f .claude/skills/the-architect-modeler/SKILL.md && echo OK`
Expected: `OK`. (No commit — `.claude/` is gitignored, mirroring the Vision skill.)

---

## Chunk 3: End-to-end verification, Linear & memory

### Task 6: End-to-end verification against a local dev server

**Precondition (document, do not assume):** a local dev stack (`npm run dev`) with Neo4j/Mongo up, and a fresh `ta_` key from Settings → API Keys (raw value shown once). If no local stack is available at execution time, mark this task BLOCKED and record it — do not fake a pass.

- [ ] **Step 1: Commit the fixture model against a scratch project**

Run:
```bash
API_KEY=ta_… BASE_URL=http://localhost:4000/api \
  node docs/skills/the-architect-core/scripts/commit-model.mjs \
  docs/skills/the-architect-modeler/fixtures/modeler-multilayer.json
```
Expected: `Elements: 8/8`, `Connections: 6/6`, and a `VERIFY — 8 elements … 6 connections` line with `by type` covering business/application/information/technology.

- [ ] **Step 2: Confirm layers + domains are correct in read-back**

Run: `GET /api/projects/:projectId/elements` (via the printed projectId) and confirm each element's `layer`/`togafDomain` matches (e.g. `data_object` → `layer: information`, `togafDomain: data`; `node` → `technology`/`technology`). Confirm no two elements share identical `position3D`.

- [ ] **Step 3: Dedup check** — re-run the same fixture against the **same** projectId; expected: the skill's dedup path (when driven through the skill) reports all 8 as "exists — reuse id" and creates 0 new elements. (Script-only re-run is idempotent via `MERGE` on connections; element dedup is the skill's responsibility — exercise it through the skill conversation, not the raw script.)

- [ ] **Step 4: Record the verification result** in the RVTM (pass/blocked + evidence).

### Task 7: Update THE-342 acceptance criteria + memory

- [ ] **Step 1: Write the six AC (AC-1…AC-6 from this plan) into THE-342** via Linear (`save_issue` description append or a comment), and link this plan + the PR.
- [ ] **Step 2: Update memory** `progress_uc_mcp_001.md`: Modeler skill built (files, dedup=Name+Type MVP, semantic dedup deferred), and add a `progress_uc_modeler` pointer if warranted.
- [ ] **Step 3: Open the PR** against `master` referencing THE-342, summarizing the skill + the three `commit-model.mjs` generalizations + tests, and the verification outcome.

---

## Out of scope (explicit)

- **Semantic/Qdrant dedup** (`elementSimilarity.service`): Name+Type only for the MVP, matching the scored scope. Semantic dedup is a future enhancement.
- **A real MCP server / new REST endpoint / new backend service**: none. The skill executes via `commit-model.mjs` over existing REST.
- **BPMN/n8n import** (THE-349/UC-2): separate sibling; not here.
- **THE-283's compliance "Paste & See"** (regulation→existing-element mapping): unrelated feature that happens to share the name.
