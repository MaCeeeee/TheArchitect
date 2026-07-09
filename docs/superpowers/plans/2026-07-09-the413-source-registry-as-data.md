# THE-413: Source-Registry-as-data — Enum-Triplikation killen (REQ-CANON-001.1)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new regulation source becomes a data row in the norm ontology instead of a TS-enum edit in 6 places — every write path validates `source`/`jurisdiction` against `NORM_ONTOLOGY`, and the last hand-maintained copies (`RegulationSourceKey`, `VALID_SOURCES`, both `PolicySource` unions, wfcomp key-utility replica) are deleted.

**Architecture:** Extend the shipped THE-390/THE-429 foundation — `NORM_ONTOLOGY.normSources` (`packages/shared/src/ontology/norm-ontology.v1.ts`) is the single source of truth; Mongoose schemas swap `enum: [...]` for an ontology-membership validator; TS unions collapse to `string` aliases (ADR-0004 E6: core fields stay `string`, validation at the write boundary). NO new collection, NO `canonical_nodes` (architecture decision 2026-07-09 on THE-412).

**Tech Stack:** TypeScript monorepo (Turbo), Mongoose 8, Zod (already a `@thearchitect/shared` dependency), Jest (server + compliance-crawler; shared has NO test runner — ontology tests live in `packages/server/src/__tests__/`).

**Linear:** [THE-413](https://linear.app/thearchitect/issue/THE-413) (parent [THE-412](https://linear.app/thearchitect/issue/THE-412))
**Branch:** `mganzmanninfo/the-413-req-canon-0011-source-registry-as-data-enum-triplikation` (off `master`)
**RVTM:** `docs/superpowers/rvtm/2026-07-09-uc-canon-001-rvtm.md` (row 001.1)
**References:** ADR-0004 E1/E6 (`docs/adr/0004-norm-identity-canonical-schema.md`) · Design §2.3 Blocker 1/6, §3 C-1/C-2 (`docs/strategy/2026-07-05-canon-architecture-design.md`) · E6 file contract (`docs/superpowers/plans/2026-07-07-e6-ontology-file-contract.md`)

---

## Scope reconciliation (read BEFORE executing)

Three Linear ACs are sharpened here — deliberately, consistent with decisions Matthias already accepted:

1. **AC-1 says "kein TS-Edit, kein shared-Rebuild, kein Redeploy".** The accepted E6 file contract (2026-07-07) makes the ontology a versioned **TS `as const` data file** — adding a source IS an edit to that file + CHANGELOG + semver bump, followed by a normal release. What this plan delivers (and what AC-1 *means* post-E6): **one data row in one file instead of code edits in 6 places** — no enum edits, no parser class, no schema change, no per-package hand-sync. A truly runtime-addable registry (DB overlay) would create a second source of truth and is explicitly NOT built (E6: "there is no second store"). → After merge, comment on THE-413 with this reconciliation (Task 12 provides the text).
2. **AC-2 says read models become "ontologie-validiert".** Write paths become strict (Mongoose validators). Read models (`ICorpusRegulation.source`) deliberately stay tolerant `string` — reads must never die on vocabulary drift (Postel; same reasoning as the OOV-drop pattern in `norm-ontology.schema.ts` header). Enforcement lives at the write boundary only.
3. **AC-3 says the key utilities collapse "auf shared".** The pure-string logic (`buildRegulationKey`/`normaliseParagraph`) already lives in shared (single SoT) and stays there. `computeVersionHash` uses `node:crypto` and deliberately remains node-side in TWO homes (server `utils/regulationVersion.ts`, crawler `db/regulationKey.ts`) — shared is browser-safe by contract (the client imports it). What collapses in this plan is the **last true replica** (wfcomp); byte-stability is pinned by test (Task 9).

**Explicitly in scope although not named in the AC:** the `jurisdiction` enums in the same two Mongoose schemas (Design §3 C-3 mandates "ontology-validated, NOT a 4-value enum"; THE-414's US adapters would otherwise hit the wall we're removing here).

**Explicitly OUT of scope (do not touch):** `buildSourceRegistry()` / parser classes in `packages/compliance-crawler/src/routes/crawl.ts` and `src/sources/` (that's THE-414); `RegulationLanguage` (THE-417 AC-3); Qdrant/embedding code; any UI.

## Known pitfalls for the executor

- **Build order:** `@thearchitect/shared` must be rebuilt before server/crawler typechecks pick up changes: `npm run build -w @thearchitect/shared` (from repo root).
- **cwd discipline:** every command block below starts with an explicit `cd` — do not skip it; `npm -w` and `npx tsc -p` need the repo root, bare `npx jest` needs the package dir.
- **THE-435:** parallel heavy Jest suites can crash workers (false red). Run single files during TDD; for full suites use `--maxWorkers=1` if you see worker crashes.
- **Crawler deploys separately** (Server B / Coolify, app `the-architect`). This plan only changes code; deploy follows the normal release flow — note it in the PR body.
- Existing corpus/app data only contains sources that are already ontology rows (the 10 legacy values) — validators are non-breaking for existing documents.

## File structure

| File | Action | Responsibility after this plan |
|---|---|---|
| `packages/shared/src/ontology/norm-ontology.v1.ts` | Modify | +2 `normSources` rows (`togaf`, `archimate`), version 1.1.0 |
| `packages/shared/src/ontology/CHANGELOG.md` | Modify | 1.1.0 entry |
| `packages/shared/src/ontology/index.ts` | Modify | + `isNormSource`, `isJurisdiction`, `JURISDICTION_IDS` (O(1) write-boundary checks) |
| `packages/shared/src/types/compliance.types.ts` | Modify | `RegulationSource`/`RegulationJurisdiction`/`PolicySource` → deprecated `string` aliases |
| `packages/server/src/models/Regulation.ts` | Modify | `source`/`jurisdiction`: enum → ontology validator |
| `packages/server/src/models/Policy.ts` | Modify | local `PolicySource` → deprecated `string` alias; enum → ontology validator |
| `packages/server/src/services/complianceCrawler.service.ts` | Modify | `RegulationSourceKey` deleted; `sources: string[]` |
| `packages/server/src/routes/regulations.routes.ts` | Modify | local `VALID_SOURCES` deleted → `isNormSource` |
| `packages/server/src/services/regulationCrawlScheduler.service.ts` | Modify | local `VALID_SOURCES` deleted → `isNormSource` |
| `packages/server/src/services/wfcomp/regulationKey.ts` | **Delete** | replica collapsed onto shared + `utils/regulationVersion` |
| `packages/server/src/data/art30.reference.ts` | Modify | imports from shared + regulationVersion |
| `packages/server/src/__tests__/norm-ontology.test.ts` | **Modify (exists! THE-429)** | + source-registry describe block (do NOT overwrite) |
| `packages/server/src/__tests__/regulation-model-ontology.test.ts` | Create | data-driven schema validation proof (Regulation + Policy) |
| `packages/server/src/__tests__/key-stability.test.ts` | Create | byte-stability regression across the utility collapse |
| `packages/server/src/__tests__/wfcomp-assessment.test.ts` | Modify | import path only |
| `packages/server/src/__tests__/regulations.routes.test.ts` | Modify | + ai-act-en passes the gate |
| `packages/server/src/__tests__/regulationCrawlScheduler.test.ts` | Modify | + ai-act-en job registered |
| `packages/compliance-crawler/src/__tests__/regulation-model-ontology.test.ts` | Create | crawler-side schema validation proof |
| `packages/compliance-crawler/src/db/regulation.model.ts` | Modify | `source`/`jurisdiction`: enum → ontology validator |

---

## Chunk 1: Ontology + shared types

### Task 1: Branch + baseline

- [ ] **Step 1.1: Create the branch off current master**

```bash
cd /Users/mac_macee/javis
git checkout master && git pull
git checkout -b mganzmanninfo/the-413-req-canon-0011-source-registry-as-data-enum-triplikation
```

- [ ] **Step 1.2: Baseline build (proves a green start)**

```bash
cd /Users/mac_macee/javis
npm run build -w @thearchitect/shared && npx tsc --noEmit -p packages/server && npx tsc --noEmit -p packages/compliance-crawler
```
Expected: exit 0. If not, STOP and report — pre-existing breakage is not ours to fix silently.

### Task 2: Ontology rows for the PolicySource collapse (TDD)

**Files:** Modify `packages/server/src/__tests__/norm-ontology.test.ts` (**exists** — ~70 lines of THE-429 tests: ontology validity, OOV ingestion boundary, metadata/inferred relation separation, OntoLearner roundtrip — keep ALL of them) · Modify `packages/shared/src/ontology/norm-ontology.v1.ts`, `packages/shared/src/ontology/CHANGELOG.md`

- [ ] **Step 2.1: Extend the existing test file — do NOT overwrite it.** Open `packages/server/src/__tests__/norm-ontology.test.ts`, add `NORM_SOURCE_IDS` to the existing `@thearchitect/shared` import (the file already imports `NORM_ONTOLOGY` and `assertOntologyValid` — do not duplicate its validity test), and append this describe block at the end:

```typescript
describe('source registry (THE-413)', () => {
  it('covers every legacy RegulationSource and PolicySource value as data', () => {
    const legacyRegulationSources = [
      'nis2', 'lksg', 'dsgvo', 'dora', 'iso27001',
      'ai-act-en', 'ai-act-de', 'data-act-en', 'data-act-de', 'custom',
    ];
    const legacyPolicySources = ['custom', 'dora', 'nis2', 'togaf', 'archimate', 'iso27001'];
    for (const s of [...legacyRegulationSources, ...legacyPolicySources]) {
      expect(NORM_SOURCE_IDS).toContain(s);
    }
  });

  it('bumped ontologyVersion for the additive rows', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toBe('1.1.0');
  });
});
```

(The file's existing version assertion is a semver-regex check, so the 1.1.0 bump won't break it.)

- [ ] **Step 2.2: Run it — verify it fails**

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/norm-ontology.test.ts
```
Expected: the THE-429 tests PASS, the two new tests FAIL — `togaf`/`archimate` missing, version is `1.0.0`.

- [ ] **Step 2.3: Add the data rows + bump**

In `packages/shared/src/ontology/norm-ontology.v1.ts`: set `ontologyVersion: '1.1.0'`, `updatedAt: '2026-07-09'`, and append to `normSources` (before the `custom` row):

```typescript
    // THE-413: PolicySource collapse — modeling-framework sources become data
    // rows so Policy.source validates against the same registry as regulations.
    { id: 'togaf', label: 'TOGAF Standard (The Open Group)' },
    { id: 'archimate', label: 'ArchiMate Specification (The Open Group)' },
```

Append to `packages/shared/src/ontology/CHANGELOG.md` (follow the existing entry format):

```markdown
## 1.1.0 — 2026-07-09 (THE-413)
- normSources: + `togaf`, + `archimate` (PolicySource enum collapse; The Open Group framework sources become registry data). Additive — no id changed or removed.
```

- [ ] **Step 2.4: Rebuild shared, run the test — verify it passes**

```bash
cd /Users/mac_macee/javis && npm run build -w @thearchitect/shared
cd packages/server && npx jest src/__tests__/norm-ontology.test.ts
```
Expected: PASS (all THE-429 tests + 2 new).

- [ ] **Step 2.5: Commit**

```bash
cd /Users/mac_macee/javis
git add packages/shared/src/ontology/norm-ontology.v1.ts packages/shared/src/ontology/CHANGELOG.md packages/server/src/__tests__/norm-ontology.test.ts
git commit -m "feat(ontology): add togaf/archimate source rows, v1.1.0 (THE-413)"
```

### Task 3: O(1) write-boundary helpers `isNormSource` / `isJurisdiction` (TDD)

**Files:** Modify `packages/shared/src/ontology/index.ts`, extend `packages/server/src/__tests__/norm-ontology.test.ts`

- [ ] **Step 3.1: Check what already exists** — open `packages/shared/src/ontology/index.ts`. `NORM_SOURCE_IDS` exists. If `JURISDICTION_IDS`, `isNormSource`, or `isJurisdiction` already exist, skip the corresponding additions below.

- [ ] **Step 3.2: Write the failing test** (append inside the `source registry (THE-413)` describe block from Task 2; add `isNormSource, isJurisdiction` to the shared import):

```typescript
  it('isNormSource accepts ontology rows, rejects everything else', () => {
    expect(isNormSource('nis2')).toBe(true);
    expect(isNormSource('togaf')).toBe(true);
    expect(isNormSource('not-a-source')).toBe(false);
    expect(isNormSource('')).toBe(false);
  });

  it('isJurisdiction accepts ontology jurisdictions, rejects everything else', () => {
    expect(isJurisdiction('EU')).toBe(true);
    expect(isJurisdiction('CH')).toBe(true);
    expect(isJurisdiction('XX')).toBe(false);
  });
```

- [ ] **Step 3.3: Run — verify FAIL** (`isNormSource` not exported):

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/norm-ontology.test.ts
```

- [ ] **Step 3.4: Implement in `packages/shared/src/ontology/index.ts`** (next to the derived `*_IDS` sets):

```typescript
export const JURISDICTION_IDS = NORM_ONTOLOGY.jurisdictions.map((j) => j.id);

// ─── O(1) write-boundary membership checks (THE-413) ─────────────────
// Mongoose validators + route gates call these instead of hand-maintained
// enum arrays. New source/jurisdiction = ontology data row, nothing else.
const NORM_SOURCE_ID_SET = new Set<string>(NORM_SOURCE_IDS);
const JURISDICTION_ID_SET = new Set<string>(JURISDICTION_IDS);
export const isNormSource = (v: string): boolean => NORM_SOURCE_ID_SET.has(v);
export const isJurisdiction = (v: string): boolean => JURISDICTION_ID_SET.has(v);
```

(If `JURISDICTION_IDS` already exists, only add the sets + functions. Derive a `JurisdictionId` type only if the file's existing pattern has one per facet — match the surrounding code.)

- [ ] **Step 3.5: Rebuild shared, run test — verify PASS**

```bash
cd /Users/mac_macee/javis && npm run build -w @thearchitect/shared
cd packages/server && npx jest src/__tests__/norm-ontology.test.ts
```

- [ ] **Step 3.6: Commit**

```bash
cd /Users/mac_macee/javis
git add packages/shared/src/ontology/index.ts packages/server/src/__tests__/norm-ontology.test.ts
git commit -m "feat(ontology): isNormSource/isJurisdiction write-boundary helpers (THE-413)"
```

### Task 4: Collapse the shared TS unions to deprecated `string` aliases

**Files:** Modify `packages/shared/src/types/compliance.types.ts` (three unions: `PolicySource` at ~line 4, `RegulationSource` at 62-76, `RegulationJurisdiction` at 78)

No unit test — `tsc` across all three packages IS the test (type-level change only).

- [ ] **Step 4.1: Replace the three unions.**

Replace the `RegulationSource` union (lines 62–76) and `RegulationJurisdiction` (line 78) with:

```typescript
/**
 * @deprecated THE-413 (ADR-0004 E6): sources are ontology data
 * (`NORM_ONTOLOGY.normSources`), not a closed TS union. Core fields stay
 * `string`; validate writes with `isNormSource()`; use `NormSourceId` from
 * the ontology module for authoring/UI autocomplete only.
 */
export type RegulationSource = string;

/**
 * @deprecated THE-413 (ADR-0004 E6): jurisdictions are ontology data
 * (`NORM_ONTOLOGY.jurisdictions`); validate writes with `isJurisdiction()`.
 */
export type RegulationJurisdiction = string;
```

Also replace the **shared `PolicySource` union at the top of the same file** (~line 4 — it contains `'nis2'` etc. and is the Blocker-6 twin; verified to have zero importers, so this is riskless):

```typescript
/** @deprecated THE-413 (ADR-0004 E6): policy sources are ontology data; validate writes with `isNormSource()`. */
export type PolicySource = string;
```

Keep the surrounding doc comments about UC-ICM/THE-275; move the per-source explanations (ai-act language split etc.) into `norm-ontology.v1.ts` row comments if not already there — they document data, so they live with the data.

- [ ] **Step 4.2: Ripple check — all three packages must still compile**

```bash
cd /Users/mac_macee/javis
npm run build -w @thearchitect/shared && npx tsc --noEmit -p packages/server && npx tsc --noEmit -p packages/compliance-crawler
```
Expected: exit 0 (string literals assign to `string`; nothing narrows on the union). If a file fails because it *depended* on the closed union (e.g. exhaustive switch), STOP and report the file — that's an undiscovered consumer, decide with the human.

- [ ] **Step 4.3: Commit**

```bash
cd /Users/mac_macee/javis
git add packages/shared/src/types/compliance.types.ts
git commit -m "refactor(shared): RegulationSource/RegulationJurisdiction/PolicySource -> deprecated string aliases (THE-413, ADR-0004 E6)"
```

---

## Chunk 2: Server write boundaries

### Task 5: `Regulation` model — enum → ontology validator (TDD)

**Files:** Create `packages/server/src/__tests__/regulation-model-ontology.test.ts` · Modify `packages/server/src/models/Regulation.ts:39-59`

- [ ] **Step 5.1: Write the failing test**

```typescript
// packages/server/src/__tests__/regulation-model-ontology.test.ts
/**
 * THE-413 proof: the Regulation schema accepts EVERY ontology source without
 * an enum edit — the test iterates NORM_SOURCE_IDS instead of a hardcoded
 * list. togaf/archimate entered ONLY as data rows; if they validate here,
 * "new source = data" holds at the schema boundary.
 */
import mongoose from 'mongoose';
import { Regulation } from '../models/Regulation';
import { NORM_SOURCE_IDS } from '@thearchitect/shared';

const base = {
  projectId: new mongoose.Types.ObjectId(),
  jurisdiction: 'EU',
  paragraphNumber: 'Art. 1',
  title: 'Test title',
  fullText: 'x'.repeat(60),
  sourceUrl: 'https://example.org/law',
  effectiveFrom: new Date('2024-01-01'),
  language: 'en',
};

describe('Regulation.source is ontology-driven (THE-413)', () => {
  it.each(NORM_SOURCE_IDS)('accepts ontology source "%s" without any enum edit', (source) => {
    const err = new Regulation({ ...base, source }).validateSync();
    expect(err?.errors?.source).toBeUndefined();
  });

  it('rejects a source missing from the ontology, pointing at the registry', () => {
    const err = new Regulation({ ...base, source: 'not-in-ontology' }).validateSync();
    expect(err?.errors?.source).toBeDefined();
    expect(String(err?.errors?.source?.message)).toContain('ontology');
  });

  it('rejects a jurisdiction missing from the ontology', () => {
    const err = new Regulation({ ...base, source: 'dsgvo', jurisdiction: 'XX' }).validateSync();
    expect(err?.errors?.jurisdiction).toBeDefined();
  });
});
```

- [ ] **Step 5.2: Run — verify FAIL** (togaf/archimate rejected by the current enum):

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/regulation-model-ontology.test.ts
```

- [ ] **Step 5.3: Swap enum for validator** in `packages/server/src/models/Regulation.ts`. Add the import, then replace the `source` and `jurisdiction` field definitions:

```typescript
import { isNormSource, isJurisdiction } from '@thearchitect/shared';
```

```typescript
    // THE-413 (ADR-0004 E6): allowed sources are ontology DATA, not an enum.
    // A new law = a row in norm-ontology.v1.ts normSources — no edit here.
    source: {
      type: String,
      required: true,
      validate: {
        validator: isNormSource,
        message: (props: { value: string }) =>
          `source '${props.value}' is not in the norm ontology (add a normSources row in norm-ontology.v1.ts — THE-413)`,
      },
    },
    jurisdiction: {
      type: String,
      required: true,
      validate: {
        validator: isJurisdiction,
        message: (props: { value: string }) =>
          `jurisdiction '${props.value}' is not in the norm ontology`,
      },
    },
```

- [ ] **Step 5.4: Run — verify PASS.** Also run the pre-existing suites that exercise this model's validation (verified: `Regulation.model.test.ts` asserts via message-agnostic `rejects.toThrow()`, so it must stay green):

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/regulation-model-ontology.test.ts src/__tests__/Regulation.model.test.ts src/__tests__/regulations.routes.test.ts
```
(If `Regulation.model.test.ts` doesn't exist under that exact name, find it: `ls src/__tests__ | grep -i regulation`.)

- [ ] **Step 5.5: Commit**

```bash
cd /Users/mac_macee/javis
git add packages/server/src/models/Regulation.ts packages/server/src/__tests__/regulation-model-ontology.test.ts
git commit -m "feat(server): Regulation source/jurisdiction validate against ontology, enum removed (THE-413)"
```

### Task 6: Kill `RegulationSourceKey` + both server-side `VALID_SOURCES` gates (TDD)

**Files:** Modify `packages/server/src/services/complianceCrawler.service.ts:21-32`, `packages/server/src/routes/regulations.routes.ts:17-38`, `packages/server/src/services/regulationCrawlScheduler.service.ts:60-82` + their tests

Today both gates silently drop `ai-act-*`/`data-act-*` (THE-396 sources unreachable through the server API) — this task fixes that live bug as its test.

- [ ] **Step 6.1: Write the failing scheduler test.** Read `packages/server/src/__tests__/regulationCrawlScheduler.test.ts` first — it already has a `buildJobRegistry (env parsing)` describe with env save/restore in `afterEach`; follow that pattern. Add:

```typescript
it('registers ontology sources beyond the legacy six (THE-413 / THE-396 fix)', () => {
  process.env.REGULATION_CRAWL_SOURCES = 'ai-act-en,data-act-de';
  const jobs = buildJobRegistry();
  expect(jobs).toHaveLength(1);
  expect(jobs[0].sources).toEqual(['ai-act-en', 'data-act-de']);
});

it('still filters garbage sources', () => {
  process.env.REGULATION_CRAWL_SOURCES = 'ai-act-en,definitely-not-a-law';
  expect(buildJobRegistry()[0].sources).toEqual(['ai-act-en']);
});
```

- [ ] **Step 6.2: Run — verify FAIL** (`ai-act-en` filtered out by the 6-value list):

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/regulationCrawlScheduler.test.ts
```

- [ ] **Step 6.3: Implement all three files in one sweep** (they form one type-coupled unit):

`complianceCrawler.service.ts` — delete the `RegulationSourceKey` type (lines 21–27) entirely and change:

```typescript
export interface CrawlRequest {
  /** Optional — the corpus is project-independent (ADR-0001); the crawler ignores it. */
  projectId?: string;
  /** Ontology-validated at the route/scheduler gate (THE-413). */
  sources: string[];
  skipEmbedding?: boolean;
}
```

`regulationCrawlScheduler.service.ts` — remove `import type { RegulationSourceKey }`, remove the `VALID_SOURCES` line, and change `CrawlJob.sources` to `string[]`; the filter becomes:

```typescript
import { isNormSource } from '@thearchitect/shared';
```
```typescript
  const sources = (process.env.REGULATION_CRAWL_SOURCES ?? 'nis2,lksg,dsgvo')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(isNormSource);
```

`regulations.routes.ts` — remove the `type RegulationSourceKey` import and the local `VALID_SOURCES` array (lines 31–38); replace every use of `VALID_SOURCES.includes(...)` with `isNormSource(...)` (add the shared import). Where the routes *list* valid sources in an error message, use `NORM_SOURCE_IDS.join(', ')`.

- [ ] **Step 6.4: Extend the route test.** Read `packages/server/src/__tests__/regulations.routes.test.ts` first. NOTE: it does NOT mock `triggerCrawl` — it jest-mocks the auth/project middleware and stubs the HTTP layer via a global `fetchSpy`, so the real `triggerCrawl` runs against mocked fetch. Extend the existing crawl-validation block: a request with `sources: ['ai-act-en']` must get past the source gate — either arrange the `fetchSpy` success response and assert 2xx, or (minimal) assert the response is NOT the source-gate 400. Reuse the block's existing request/assert helpers.

- [ ] **Step 6.5: Typecheck + run all affected test files — verify PASS**

```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/server
cd packages/server && npx jest src/__tests__/regulationCrawlScheduler.test.ts src/__tests__/regulations.routes.test.ts
```

- [ ] **Step 6.6: Commit**

```bash
cd /Users/mac_macee/javis
git add packages/server/src/services/complianceCrawler.service.ts packages/server/src/services/regulationCrawlScheduler.service.ts packages/server/src/routes/regulations.routes.ts packages/server/src/__tests__/regulationCrawlScheduler.test.ts packages/server/src/__tests__/regulations.routes.test.ts
git commit -m "feat(server): route+scheduler source gates read the ontology - ai-act/data-act reachable (THE-413, fixes THE-396 gate gap)"
```

### Task 7: `Policy.source` — enum → ontology validator (TDD)

**Files:** Modify `packages/server/src/models/Policy.ts` + append a describe block to `packages/server/src/__tests__/regulation-model-ontology.test.ts` (check first whether a dedicated Policy test file exists — if yes, extend that instead)

- [ ] **Step 7.1: Write the test** (needs Task 2's togaf/archimate rows). Read `Policy.ts` first and fill `policyBase` with the schema's actual required fields:

```typescript
import { Policy } from '../models/Policy';

describe('Policy.source is ontology-driven (THE-413)', () => {
  const policyBase = { /* fill from Policy.ts required fields — read the schema */ };

  it.each(['togaf', 'archimate', 'nis2', 'custom'])('accepts ontology source "%s"', (source) => {
    const err = new Policy({ ...policyBase, source }).validateSync();
    expect(err?.errors?.source).toBeUndefined();
  });

  it('rejects a non-ontology source', () => {
    const err = new Policy({ ...policyBase, source: 'foo' }).validateSync();
    expect(err?.errors?.source).toBeDefined();
  });
});
```

- [ ] **Step 7.2: Run — establish the baseline.** Today's enum already contains togaf/archimate, so expect: accept-cases PASS, reject-case PASSES too (enum rejects 'foo'). The value of this test is that after Step 7.3 the allowed set comes from the ontology — the test keeps passing through the swap (regression guard), and `PolicySource`-the-union disappearing is checked by tsc.

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/regulation-model-ontology.test.ts
```

- [ ] **Step 7.3: Implement.** In `Policy.ts`: replace `export type PolicySource = 'custom' | 'dora' | 'nis2' | 'togaf' | 'archimate' | 'iso27001';` with

```typescript
/** @deprecated THE-413 (ADR-0004 E6): policy sources validate against NORM_ONTOLOGY.normSources. */
export type PolicySource = string;
```

and swap the schema field's `enum: [...]` for the `isNormSource` validator (same pattern as Task 5, Step 5.3).

- [ ] **Step 7.4: Typecheck + run — verify PASS**

```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/server
cd packages/server && npx jest src/__tests__/regulation-model-ontology.test.ts
```

- [ ] **Step 7.5: Commit**

```bash
cd /Users/mac_macee/javis
git add packages/server/src/models/Policy.ts packages/server/src/__tests__/regulation-model-ontology.test.ts
git commit -m "feat(server): Policy.source validates against ontology, PolicySource enum removed (THE-413, Blocker 6)"
```

---

## Chunk 3: Crawler, key-utility collapse, proof

### Task 8: Crawler `regulation.model.ts` — enum → ontology validator (TDD)

**Files:** Create `packages/compliance-crawler/src/__tests__/regulation-model-ontology.test.ts` · Modify `packages/compliance-crawler/src/db/regulation.model.ts:50-70`

- [ ] **Step 8.1: Write the failing test** — same shape as Task 5's test (fully printed there: iterate `NORM_SOURCE_IDS`, reject `'not-in-ontology'`, reject jurisdiction `'XX'`), with these crawler deltas: import `Regulation` from `../db/regulation.model`, and `base` additionally needs the crawler-specific required fields `regulationKey` (e.g. `'dsgvo:art-1'`) and `versionHash` (any 64-char hex string) — read the model interface first to confirm.

- [ ] **Step 8.2: Run — verify FAIL**

```bash
cd /Users/mac_macee/javis/packages/compliance-crawler && npx jest src/__tests__/regulation-model-ontology.test.ts
```

- [ ] **Step 8.3: Implement** — same validator swap as Task 5 Step 5.3 (`import { isNormSource, isJurisdiction } from '@thearchitect/shared';`). The crawler already depends on shared (see `src/db/regulationKey.ts`).

- [ ] **Step 8.4: Typecheck + run the full crawler suite — verify PASS, no regression**

```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/compliance-crawler
cd packages/compliance-crawler && npx jest
```
Expected: all crawler tests green (eur-lex/gesetze-im-internet/firecrawl parser tests untouched).

- [ ] **Step 8.5: Commit**

```bash
cd /Users/mac_macee/javis
git add packages/compliance-crawler/src/db/regulation.model.ts packages/compliance-crawler/src/__tests__/regulation-model-ontology.test.ts
git commit -m "feat(crawler): corpus model source/jurisdiction validate against ontology, enum removed (THE-413)"
```

### Task 9: Collapse the wfcomp key-utility replica (regression-pinned)

**Files:** Create `packages/server/src/__tests__/key-stability.test.ts` · Modify `packages/server/src/data/art30.reference.ts:12`, `packages/server/src/__tests__/wfcomp-assessment.test.ts:7` · **Delete** `packages/server/src/services/wfcomp/regulationKey.ts`

- [ ] **Step 9.1: Compute the reference hash to pin** (goes into the test below as `LOREM_SHA256`):

```bash
node --input-type=module -e "import('crypto').then(c=>console.log(c.createHash('sha256').update('lorem','utf8').digest('hex')))"
```

- [ ] **Step 9.2: Write the regression test** (it must pass BEFORE and AFTER the collapse — the key functions' SoT is already shared):

```typescript
// packages/server/src/__tests__/key-stability.test.ts
/**
 * THE-413 AC-3/AC-4 — byte-stability of canonical identity across the
 * utility collapse. If any of these change, every stored regulationKey /
 * versionHash reference (VERLOCK, ComplianceMapping, corpusRef) breaks.
 */
import { buildRegulationKey, normaliseParagraph } from '@thearchitect/shared';
import { computeVersionHash } from '../utils/regulationVersion';

const LOREM_SHA256 = '<paste hex from Step 9.1>';

describe('canonical key byte-stability (THE-413)', () => {
  it('buildRegulationKey stays byte-identical for known shapes', () => {
    expect(buildRegulationKey('dsgvo', 'Art. 30')).toBe('dsgvo:art-30');
    expect(buildRegulationKey('nis2', 'Art. 23')).toBe('nis2:art-23');
    expect(buildRegulationKey('ai-act-en', 'Article 5(1)(a)')).toBe('ai-act-en:article-5-1-a');
    expect(normaliseParagraph('§ 6 Abs. 1')).toBe('6-abs-1');
  });
  it('computeVersionHash is sha256-utf8-hex, unchanged', () => {
    expect(computeVersionHash('lorem')).toBe(LOREM_SHA256);
  });
});
```

Run it — Expected: PASS already (guard in place):

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/key-stability.test.ts
```
(If the `'ai-act-en:article-5-1-a'` literal fails, fix the expected literal to the actual output — pin reality, don't change the function.)

- [ ] **Step 9.3: Collapse.** In `art30.reference.ts` and `wfcomp-assessment.test.ts`, replace

```typescript
import { buildRegulationKey, computeVersionHash } from '../services/wfcomp/regulationKey';
```
with
```typescript
import { buildRegulationKey } from '@thearchitect/shared';
import { computeVersionHash } from '../utils/regulationVersion';
```
(`wfcomp-assessment.test.ts` also imports `normaliseParagraph` — take it from `@thearchitect/shared` too; adjust relative paths: from `src/__tests__/` it's `../utils/regulationVersion`.) Then delete the replica:

```bash
cd /Users/mac_macee/javis && git rm packages/server/src/services/wfcomp/regulationKey.ts
```

- [ ] **Step 9.4: Verify — tsc + the pinned tests + wfcomp suite**

```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/server
cd packages/server && npx jest src/__tests__/key-stability.test.ts src/__tests__/wfcomp-assessment.test.ts
```
Expected: PASS — proving the collapse changed zero bytes of key/hash behavior.

- [ ] **Step 9.5: Commit**

```bash
cd /Users/mac_macee/javis
git add -A packages/server/src/data/art30.reference.ts packages/server/src/__tests__/ packages/server/src/services/wfcomp/
git commit -m "refactor(server): collapse wfcomp regulationKey replica onto shared + regulationVersion (THE-413 AC-3, closes THE-368 TODO)"
```

### Task 10: AC-4 continuity check (facade aliases / stored keys)

- [ ] **Step 10.1: Run the THE-390 facade suite unchanged** — it is the living proof that stored `regulationKey`s still resolve:

```bash
cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__ -t "norm" --maxWorkers=1
```
Expected: the norm.service/facade tests from THE-390 P1–P4 all PASS untouched. If any fail, STOP — that's a real regression of AC-4.

- [ ] **Step 10.2: Confirm section-level continuity exists in a test.** Grep the norm service tests for `regulationKey`; if no assertion covers "corpus-backed NormView sections carry their regulationKey", add one small assert to the existing facade test (do NOT write a new harness). Commit only if you added an assert:

```bash
cd /Users/mac_macee/javis
git add packages/server/src/__tests__ && git commit -m "test(server): pin corpus section regulationKey continuity (THE-413 AC-4)"
```

### Task 11: Grep proof + full suites + PR

- [ ] **Step 11.1: Grep proof — the enum copies are gone.** Run from the repo root; every command must return NOTHING:

```bash
cd /Users/mac_macee/javis
grep -rn "RegulationSourceKey" packages/*/src --include="*.ts"
grep -n "enum:" packages/server/src/models/Regulation.ts packages/compliance-crawler/src/db/regulation.model.ts | grep -v language
grep -rn "'nis2'" packages/shared/src/types/compliance.types.ts
grep -n "VALID_SOURCES" packages/server/src/routes/regulations.routes.ts packages/server/src/services/regulationCrawlScheduler.service.ts
```
(Allowed remaining `'nis2'` literals elsewhere: `norm-ontology.v1.ts` (data), tests, and the crawler parser registry `crawl.ts`/`sources/*`/`cli/*` — those are THE-414 scope.)

- [ ] **Step 11.2: Full verification**

```bash
cd /Users/mac_macee/javis
npm run build -w @thearchitect/shared
npx tsc --noEmit -p packages/server && npx tsc --noEmit -p packages/compliance-crawler
cd packages/server && npx jest --maxWorkers=1
cd ../compliance-crawler && npx jest
cd ../.. && npm run build
```
Expected: all green (THE-435 note: `--maxWorkers=1` avoids the known worker-crash false-red). Record the test counts for the PR body.

- [ ] **Step 11.3: Push + PR**

```bash
cd /Users/mac_macee/javis
git push -u origin mganzmanninfo/the-413-req-canon-0011-source-registry-as-data-enum-triplikation
gh pr create --title "feat(compliance): source registry as data — enum triplication removed (THE-413)" --body "$(cat <<'EOF'
## Summary
- `RegulationSource`/`PolicySource` (both copies)/`RegulationSourceKey`/`VALID_SOURCES` collapsed onto the norm ontology (`normSources`, v1.1.0) — a new law/source is a data row, not a code edit (ADR-0004 E6, REQ-CANON-001.1)
- Mongoose `source`/`jurisdiction` fields validate via `isNormSource`/`isJurisdiction` (write-strict, read-tolerant)
- Fixes the THE-396 gate gap: `ai-act-*`/`data-act-*` now pass the server route + scheduler gates
- wfcomp key-utility replica deleted (byte-stability pinned by `key-stability.test.ts`), closes the THE-368 TODO

## Test plan
- [ ] new data-driven schema tests iterate the ontology (server + crawler)
- [ ] scheduler/route gate tests incl. ai-act-en
- [ ] key byte-stability regression
- [ ] full suites green (counts: <fill in>)

Note: crawler changes deploy separately (Server B/Coolify).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Task 12: Linear + RVTM close-out

- [ ] **Step 12.1: THE-413 → In Progress → (after merge) Done**, with a closing comment containing: final file list, test counts, the grep-proof output, and this reconciliation note:

> **AC-1-Präzisierung (E6-Kontrakt, akzeptiert 2026-07-07):** „Neue Quelle = Registry-/Ontologie-Eintrag" heißt: EIN Daten-Row-Edit in `norm-ontology.v1.ts` (+ CHANGELOG + semver) statt Code-Edits an 6 Stellen — kein Enum, keine Parser-Klasse, kein Schema-Change. Ein normales Release desselben Artefakts bleibt nötig (bewusst: Datei = einzige SoT, kein DB-Zweitstore). Runtime-Zuschaltbarkeit ist explizit nicht Ziel dieses REQ.
> **AC-3-Präzisierung:** `buildRegulationKey`/`normaliseParagraph` = shared (einzige SoT, war schon so); `computeVersionHash` bleibt bewusst node-seitig in Server + Crawler (node:crypto, shared ist browser-safe — Client importiert es). Die letzte echte Replika (wfcomp) ist gelöscht; Byte-Stabilität per `key-stability.test.ts` gepinnt.

- [ ] **Step 12.2: RVTM update** — in `docs/superpowers/rvtm/2026-07-09-uc-canon-001-rvtm.md`, row 001.1: set Status + evidence (PR link, test names).
- [ ] **Step 12.3: Re-score trigger** (`feedback_backlog_rescore_trigger`): THE-413 Done → re-score THE-414 (.2) and THE-417 (.5) — Feasibility/Urgency rise now that the registry mechanism exists.
