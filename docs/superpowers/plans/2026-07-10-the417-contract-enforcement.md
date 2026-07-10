# THE-417-Rest: Contract-Durchsetzung am Store-Eingang (REQ-CANON-001.5)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every write into the canonical stores is ontology-enforced and version-stamped: the `language` enums collapse onto a new ontology `languages` facet (4th facet, THE-413 recipe), every stored Regulation/Norm doc records the `ontologyVersion` that validated it, and the Norm write path (`upsertNormDoc`) validates `kind`/`jurisdiction` against the ontology — closing the open THE-390-P0 obligation ("Facade-kind/jurisdiction gegen THE-429-Ontologie").

**Architecture:** Extend `NORM_ONTOLOGY` to 1.2.0 (additive: `languages` facet + 2 missing `normKinds` rows `framework`/`custom` that `kindFromStandardType` already produces). Enforcement lives in the Mongoose models (null-tolerant validators, THE-413 pattern) — no separate "ingestion package" object (see reconciliation). Stamps set at the write sites (crawler `$set`, `upsertNormDoc`).

**Tech Stack:** TS monorepo, Mongoose 8, Zod, Jest. shared → server/crawler build order.

**Linear:** [THE-417](https://linear.app/thearchitect/issue/THE-417) (parent THE-412) · Score 82,9 (unverändert — Scope präzisiert, nichts abgespalten)
**Branch:** `mganzmanninfo/the-417-contract-enforcement` (off `master`)
**References:** ADR-0004 E6 · E6-Datei-Kontrakt 2026-07-07 (TS `as const`, Zod an Schreibgrenze) · THE-390-P0-Auflage (Facade-kind/jurisdiction) · baut auf THE-413 (Validatoren-Muster) + THE-414 (Write-Site)

---

## Scope reconciliation (read BEFORE executing)

1. **AC-1 „Zod-Ingestion-Contract; Paket-Reject am Store-Eingang":** Enforcement EXISTS materially since THE-413/414 — Mongoose validators (`runValidators: true` on the crawler upsert) + the Zod `CrawlBodySchema` reject off-ontology writes with messages naming the registry file. Building a *separate* IngestionPackage-Zod object on top would be double validation with no new consumer (same E6/YAGNI reasoning Matthias accepted twice: THE-413 AC-1, THE-414 re-slice). This plan **completes** the enforcement (language facet, Norm write path, version stamps) instead of duplicating it. → Document in the Linear close-out.
2. **AC-3 `PartyRole`:** zero consumers outside the ontology (verified 2026-07-10 grep) — no closed enum exists to collapse; the ontology facet stands ready. Satisfied by absence; document, don't build.
3. **Provenance-Pflichtfelder:** since THE-414, the crawler write site ALWAYS stamps provenance — mandatory de facto for new ingests. Model-level `required` stays off (existing docs). Document.
4. **Eval z.enums (`evals/consistency.ts:22`, `evals/goldenSet.ts:35`):** test-harness input schemas, not store writes — deliberately untouched.
5. **`Norm.source` is the provenance discriminator `'upload' | 'corpus'`** — do NOT validate it against `normSources` (different vocabulary!). Only `kind` (normKinds) and `jurisdiction` (jurisdictions) are ontology facets on Norm.

## Known pitfalls

- cwd discipline: explicit `cd` per block; `npm -w`/`npx tsc -p` from root, bare `npx jest` from the package dir.
- After ontology edits: `npm run build -w @thearchitect/shared` before server/crawler pick it up.
- `upsertNormDoc` uses `findOneAndUpdate` — Mongoose runs validators there ONLY with `runValidators: true` (currently missing! adding it is part of the fix).
- THE-435: file-scoped jest during TDD; `--maxWorkers=1` for sweeps.
- Crawler deploys separately (Server B/Coolify) — PR note.
- `norm-ontology.schema.ts` `NormOntologySchema` must learn the new `languages` facet AND `assertOntologyValid`'s dupe-check facet list must include it — otherwise the file-shape validation silently ignores it.

## File structure

| File | Action | Responsibility after this plan |
|---|---|---|
| `packages/shared/src/ontology/norm-ontology.v1.ts` | Modify | v1.2.0: + `languages` facet (de/en); + normKinds rows `framework`, `custom` |
| `packages/shared/src/ontology/norm-ontology.schema.ts` | Modify | `NormOntologySchema` + `LanguageSchema` know the facet; dupe-check includes it |
| `packages/shared/src/ontology/CHANGELOG.md` | Modify | 1.2.0 entry |
| `packages/shared/src/ontology/index.ts` | Modify | + `LANGUAGE_IDS`, `isLanguage`, `isNormKind` (Set-backed, THE-413 pattern) |
| `packages/shared/src/types/compliance.types.ts` | Modify | `RegulationLanguage` → deprecated `string` alias |
| `packages/server/src/models/Regulation.ts` | Modify | `language` enum → `isLanguage` validator; + optional `ontologyVersion` field |
| `packages/compliance-crawler/src/db/regulation.model.ts` | Modify | same two changes (stay-in-sync) |
| `packages/compliance-crawler/src/routes/crawl.ts` | Modify | `$set` stamps `ontologyVersion: NORM_ONTOLOGY.ontologyVersion` |
| `packages/server/src/models/Norm.ts` | Modify | `kind`/`jurisdiction`: null-tolerant ontology validators |
| `packages/server/src/services/norm.service.ts` | Modify | `upsertNormDoc`: stamps `ontologyVersion`, adds `runValidators: true` |
| `packages/server/src/__tests__/norm-ontology.test.ts` | Modify | + languages/normKinds facet tests |
| `packages/server/src/__tests__/regulation-model-ontology.test.ts` | Modify | + language validator tests (data-driven) |
| `packages/server/src/__tests__/norm.service.test.ts` | Modify | + stamp + kind-validation tests |
| `packages/compliance-crawler/src/__tests__/regulation-model-ontology.test.ts` | Modify | + language validator test |

---

## Chunk 1: Ontology 1.2.0 (languages facet + missing normKinds)

### Task 1: Branch + baseline
- [ ] **Step 1.1**
```bash
cd /Users/mac_macee/javis
git checkout master && git pull
git checkout -b mganzmanninfo/the-417-contract-enforcement
```
- [ ] **Step 1.2: baseline** — `cd /Users/mac_macee/javis && npm run build -w @thearchitect/shared && npx tsc --noEmit -p packages/server && npx tsc --noEmit -p packages/compliance-crawler` → exit 0, else STOP.

### Task 2: Ontology v1.2.0 (TDD)

**Files:** `norm-ontology.v1.ts`, `norm-ontology.schema.ts`, `CHANGELOG.md`, extend `packages/server/src/__tests__/norm-ontology.test.ts`

- [ ] **Step 2.1: Failing test** — append to the existing THE-413 describe block (extend the shared import by `NORM_KIND_IDS`; add `LANGUAGE_IDS, isLanguage, isNormKind` — they don't exist yet, the test file won't compile, that IS the red):
```typescript
describe('languages facet + kind coverage (THE-417)', () => {
  it('languages facet covers the legacy RegulationLanguage values', () => {
    expect(LANGUAGE_IDS).toEqual(expect.arrayContaining(['de', 'en']));
  });
  it('isLanguage: membership + exact-case', () => {
    expect(isLanguage('de')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage('DE')).toBe(false);
    expect(isLanguage('')).toBe(false);
  });
  it('every kind the norm facade produces is an ontology normKind', () => {
    // kindFromStandardType produces: technical_standard/framework/custom/…;
    // kindFromCorpusSource produces: technical_standard/legislation.
    for (const k of ['legislation', 'technical_standard', 'framework', 'custom']) {
      expect(NORM_KIND_IDS).toContain(k);
      expect(isNormKind(k)).toBe(true);
    }
  });
  it('bumped to 1.2.0', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toBe('1.2.0');
  });
});
```
NOTE for the implementer: FIRST read `kindFromStandardType` in `packages/server/src/services/norm.service.ts` (~line 35-50) completely and list EVERY value it can return — the test's kind list above must cover them all (plus `kindFromCorpusSource`'s outputs). Adjust the array if the function produces more values.

- [ ] **Step 2.2: Run — FAIL** — `cd /Users/mac_macee/javis/packages/server && npx jest src/__tests__/norm-ontology.test.ts`

- [ ] **Step 2.3: Implement.**
  1. `norm-ontology.v1.ts`: `ontologyVersion: '1.2.0'`, `updatedAt: '2026-07-10'`; append to `normKinds`:
     ```typescript
     // THE-417: kinds the norm facade already produces for upload-world norms
     // (kindFromStandardType) — data rows, not code special-cases.
     { id: 'framework', label: 'Architecture/Management Framework', bindingnessDefault: 'voluntary-de-facto' },
     { id: 'custom', label: 'User-curated / Custom', bindingnessDefault: 'voluntary-de-facto' },
     ```
     and add the new facet (after `jurisdictions`):
     ```typescript
     /**
      * THE-417 (DELTA-4): expression languages as data — collapse target for the
      * closed RegulationLanguage TS union + the `enum: ['de','en']` model fields.
      * A new corpus language = a row here, no code edit.
      */
     languages: [
       { id: 'de', label: 'Deutsch' },
       { id: 'en', label: 'English' },
     ],
     ```
  2. `norm-ontology.schema.ts`: add `languages: z.array(IdLabel).min(1),` to `NormOntologySchema`; add `['languages', o.languages.map((x) => x.id)]` to the `facets` dupe-check array in `assertOntologyValid`.
  3. `index.ts` (THE-413 pattern, next to the existing sets):
     ```typescript
     export const LANGUAGE_IDS = NORM_ONTOLOGY.languages.map((l) => l.id);
     const LANGUAGE_ID_SET = new Set<string>(LANGUAGE_IDS);
     const NORM_KIND_ID_SET = new Set<string>(NORM_KIND_IDS);
     export const isLanguage = (v: string): boolean => LANGUAGE_ID_SET.has(v);
     export const isNormKind = (v: string): boolean => NORM_KIND_ID_SET.has(v);
     ```
     (+ `LanguageId` type only if it matches the file's per-facet pattern — it does; and a `LanguageSchema = makeMemberSchema(...)` alongside the other member schemas in norm-ontology.schema.ts for consistency.)
  4. `CHANGELOG.md`: 1.2.0 entry (languages facet; normKinds + framework/custom; additive).

- [ ] **Step 2.4: Rebuild + run — PASS**
```bash
cd /Users/mac_macee/javis && npm run build -w @thearchitect/shared
cd packages/server && npx jest src/__tests__/norm-ontology.test.ts
```

- [ ] **Step 2.5: Commit** — `git add packages/shared/src/ontology/ packages/server/src/__tests__/norm-ontology.test.ts && git commit -m "feat(ontology): languages facet + framework/custom kinds, v1.2.0 (THE-417)"` (from repo root).

---

## Chunk 2: Language-enum collapse + ontologyVersion stamps

### Task 3: `language` enums → ontology validator (TDD; THE-413 recipe, 4th facet)

**Files:** `compliance.types.ts`, both Regulation models, extend both `regulation-model-ontology.test.ts` files

- [ ] **Step 3.1: Failing tests.** Server `regulation-model-ontology.test.ts`, append (import `LANGUAGE_IDS` from shared):
```typescript
describe('Regulation.language is ontology-driven (THE-417)', () => {
  it.each(LANGUAGE_IDS)('accepts ontology language "%s"', (language) => {
    const err = new Regulation({ ...base, source: 'dsgvo', language }).validateSync();
    expect(err?.errors?.language).toBeUndefined();
  });
  it('rejects a language missing from the ontology', () => {
    const err = new Regulation({ ...base, source: 'dsgvo', language: 'fr' }).validateSync();
    expect(err?.errors?.language).toBeDefined();
  });
  it('null language still rejected — by required, not the validator', () => {
    const err = new Regulation({ ...base, source: 'dsgvo', language: null }).validateSync();
    expect(err?.errors?.language).toBeDefined();
  });
});
```
Crawler test file: same describe (with the crawler `base` incl. regulationKey/versionHash).

- [ ] **Step 3.2: Run — verify current state.** NOTE: 'fr' is already rejected by the old enum (green); the meaningful red is only visible AFTER a new language row exists. The data-driven `it.each` is the regression guard; expected NOW: all green except nothing — run to confirm baseline, then swap (same green-green situation as THE-413 Task 7; the enum-removal is checked by grep + the ontology-iteration property).
- [ ] **Step 3.3: Implement.** `compliance.types.ts`: `RegulationLanguage` → deprecated `string` alias (same JSDoc pattern as RegulationSource, pointing at `isLanguage()`/`LanguageId`). Both models: `language: { type: String, enum: ['de','en'], required: true }` → null-tolerant validator:
```typescript
    language: {
      type: String,
      required: true,
      validate: {
        validator: (v: string | null | undefined) => v == null || isLanguage(v),
        message: (props: { value: string }) =>
          `language '${props.value}' is not in the norm ontology (add a languages row in norm-ontology.v1.ts — THE-417)`,
      },
    },
```
(extend the existing `isNormSource, isJurisdiction` imports by `isLanguage`.)
- [ ] **Step 3.4: Verify** — `cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/server && npx tsc --noEmit -p packages/compliance-crawler`, then run both regulation-model-ontology suites + grep proof `grep -rn "enum: \['de'" packages/*/src` → NOTHING.
- [ ] **Step 3.5: Commit** — `fix(compliance): language validates against ontology, closed union removed (THE-417, DELTA-4)`.

### Task 4: `ontologyVersion` stamp on corpus writes (TDD)

**Files:** both Regulation models (+ field), `crawl.ts` (+ stamp), extend crawler `regulation-model-ontology.test.ts`

- [ ] **Step 4.1: Failing test** (crawler test file):
```typescript
import { NORM_ONTOLOGY } from '@thearchitect/shared';
it('Regulation accepts + keeps the ontologyVersion stamp (THE-417 AC-2)', () => {
  const doc = new Regulation({ /* base incl. required fields */, ontologyVersion: NORM_ONTOLOGY.ontologyVersion });
  expect(doc.validateSync()?.errors?.ontologyVersion).toBeUndefined();
  expect(doc.ontologyVersion).toBe('1.2.0');
});
```
- [ ] **Step 4.2: Run — FAIL** (field stripped). 
- [ ] **Step 4.3: Implement.** Both models: `ontologyVersion?: string;` in the interface + `ontologyVersion: { type: String, trim: true },` in the schema (optional — existing docs). `crawl.ts` `$set`: add `ontologyVersion: NORM_ONTOLOGY.ontologyVersion,` (import `NORM_ONTOLOGY` from shared) next to the provenance stamp.
- [ ] **Step 4.4: Verify** — tsc both + crawler suite full run. 
- [ ] **Step 4.5: Commit** — `feat(crawler): stamp ontologyVersion per ingested fact (THE-417 AC-2)`.

---

## Chunk 3: Norm write path enforcement (THE-390-P0-Auflage)

### Task 5: Norm model validators + upsertNormDoc stamp + runValidators (TDD)

**Files:** `packages/server/src/models/Norm.ts`, `packages/server/src/services/norm.service.ts`, extend `packages/server/src/__tests__/norm.service.test.ts`

- [ ] **Step 5.1: Read first.** `Norm.ts` (kind/jurisdiction field defs, ontologyVersion at :60/:122) and `norm.service.ts` `upsertNormDoc` (~:449-476). Check how `norm.service.test.ts` seeds/builds views (reuse its helpers).
- [ ] **Step 5.2: Failing tests** (append to `norm.service.test.ts`, following its existing structure):
```typescript
// (a) stamp: upsertNormDoc records the validating ontology version
//     assert: (await upsertNormDoc(view)).ontologyVersion === NORM_ONTOLOGY.ontologyVersion
// (b) enforcement: a NormView with kind 'not-a-kind' → upsertNormDoc rejects
//     await expect(upsertNormDoc({ ...view, kind: 'not-a-kind' })).rejects.toThrow(/ontology/);
// (c) regression: every existing facade view still upserts (materializeProjectNorms
//     over the suite's seeded project resolves without error — kinds framework/custom
//     are now ontology rows, so upload-world norms pass)
```
Write them as real tests using the file's existing seed helpers — the comments above are the spec, not literal code.
- [ ] **Step 5.3: Run — FAIL** ((a) undefined, (b) resolves instead of rejecting).
- [ ] **Step 5.4: Implement.**
  1. `Norm.ts`: `kind` + `jurisdiction` fields get null-tolerant ontology validators (`isNormKind` / `isJurisdiction`, message pattern as in Regulation — kind message names normKinds/norm-ontology.v1.ts). Both fields stay non-required if they are today (read first — keep requiredness unchanged).
  2. `norm.service.ts` `upsertNormDoc`: add to `update`: `ontologyVersion: NORM_ONTOLOGY.ontologyVersion,` (import from shared) and add `runValidators: true` to the `findOneAndUpdate` options.
- [ ] **Step 5.5: Run — PASS + THE-390 facade sweep**
```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/server
cd packages/server && npx jest src/__tests__/norm.service.test.ts && npx jest src/__tests__ -t "norm" --maxWorkers=1
```
Expected: all green (69+ from THE-390 untouched + new). If an existing facade test fails on kind validation, that's a REAL find (a produced kind missing from the ontology) — add the data row, don't weaken the validator.
- [ ] **Step 5.6: Commit** — `feat(server): norm write path ontology-enforced + version-stamped (THE-417, closes THE-390 P0 obligation)`.

---

## Chunk 4: Verification + PR + close-out

### Task 6: Grep proof, sweeps, PR
- [ ] **Step 6.1: Grep proof** (root; all empty):
```bash
cd /Users/mac_macee/javis
grep -rn "enum: \['de'" packages/*/src --include="*.ts"
grep -n "RegulationLanguage =" packages/shared/src/types/compliance.types.ts | grep -v "= string"
```
- [ ] **Step 6.2: Sweeps** — server: `cd packages/server && npx jest --maxWorkers=1 --testPathPattern "(regulation|norm|policy|key-stability)"`; crawler: full `npx jest`; root `npm run build`. Record counts. (Known pre-existing reds: remediation/audit live-stack tests — not in this pattern set.)
- [ ] **Step 6.3: Push + PR** — title `feat(compliance): ontology-enforced store writes — languages facet, version stamps, norm write path (THE-417)`; body: summary (facet 1.2.0, language collapse, stamps, upsertNormDoc enforcement incl. runValidators fix), out-of-scope notes (no separate package contract — reconciliation §1; PartyRole by absence; eval enums untouched), test counts, grep proof, Server-B-deploy note, Claude-Code footer (as in PR #42/#43).

### Task 7: Linear + RVTM
- [ ] THE-417 → In Progress → (after merge) Done; comment with the three AC reconciliations (§1–§3 above) + evidence.
- [ ] RVTM row 001.5: status + PR + „schließt THE-390-P0-Auflage (Facade-kind/jurisdiction)".
- [ ] Re-score trigger: THE-416 (.4) — ontologyVersion-Stempel + enforcement liefern den Audit-Unterbau; THE-418 (.6) rückt näher (nur noch .3/.4 davor).
