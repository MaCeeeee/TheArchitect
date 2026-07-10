# THE-414: Config-getriebene Source-Registry + Provenance (REQ-CANON-001.2, re-sliced)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the crawler's two hardcoded source registries + the `z.enum` source list into ONE data-driven registry (allowed sources validated against the ontology, not a `z.enum`), and stamp every ingested regulation with provenance (`adapter`, `format`, `fetchedAt`, `sourceUri`) — so wiring a new source that reuses an existing adapter is one data entry, no new parser class and no enum edit.

**Architecture:** New `packages/compliance-crawler/src/sources/source-registry.ts` = a data array of `SourceEntry` (one per current source), each declaring its `adapter`/`format` and a `make(env)` that wraps the *exact* existing factory call. Route (`crawl.ts`) and CLI (`crawl-live.ts`) both consume this single registry. `CrawlBodySchema` drops its `z.enum` for `isNormSource` (from THE-413). Provenance is set at the write site from the registry entry + crawl time — adapters stay untouched (low risk). NO new external adapters (CELLAR/Fedlex/eCFR → THE-439), NO hierarchy change (flat `ParsedRegulation` stays → THE-415).

**Tech Stack:** TypeScript, Fastify (crawler on Server B), Mongoose 8, Zod, Jest (fixture-based, offline). Crawler already depends on `@thearchitect/shared`.

**Linear:** [THE-414](https://linear.app/thearchitect/issue/THE-414) (parent [THE-412](https://linear.app/thearchitect/issue/THE-412)) · re-sliced 2026-07-10, Score 71,4
**Branch:** `mganzmanninfo/the-414-config-driven-source-registry` (off `master`)
**References:** ADR-0004 E6 · Design §3/§9 (ADR-Ingest, Provenance interface) · builds on THE-413 (`isNormSource`, merged)

---

## Scope reconciliation (read BEFORE executing)

1. **AC „Config-Eintrag = Daten, keine Parser-Klasse".** Satisfied as: adding a source that reuses an existing adapter (eur-lex / firecrawl / gesetze) = appending one `SourceEntry` to `SOURCE_ENTRIES` in one file. A source needing a *new transport* (CELLAR-AKN, Fedlex-SPARQL, …) is explicitly **THE-439**, not here — the `make(env)` closure is the honest seam (it references adapter factories, not inline branching in the route). This is one-place + no-z.enum + no-duplication; it is NOT a runtime/DB-configurable registry (same E6 stance as THE-413: the file is the SoT).
2. **Provenance** is set at the **write site** from the registry entry (`adapter`, `format`) + crawl run (`fetchedAt`) + per-paragraph `sourceUrl` (`sourceUri`). Adapters are NOT modified to report it → smaller blast radius, and it's honest (the registry knows which adapter/format produced the fact).
3. **Out of scope (do not touch):** the adapter internals (`eur-lex.ts`, `firecrawl.ts`, `gesetze-im-internet.ts`, `clean.ts`); the flat `ParsedRegulation` shape beyond adding optional provenance carriage; hierarchy/@eId (THE-415); embedding/Qdrant; any new external source.

## Known pitfalls

- **cwd discipline:** every command block starts with an explicit `cd`. `npm -w`/`npx tsc -p` from repo root; bare `npx jest` from `packages/compliance-crawler`.
- **Build order:** shared is already built (THE-413 merged); only rebuild if you touch shared (you shouldn't here).
- **Crawler deploys separately** (Server B / Coolify, app `the-architect`) — note in PR body; this plan is code-only.
- **THE-435:** run fixture suites file-scoped during TDD; `--maxWorkers=1` if worker crashes on the full run.
- **Two Regulation models:** the crawler writes the corpus (`packages/compliance-crawler/src/db/regulation.model.ts`). The server model (`packages/server/src/models/Regulation.ts`) is the legacy per-project one and its header says "stay in sync" — add the SAME optional provenance field there (non-breaking) but no other server change.

## File structure

| File | Action | Responsibility after this plan |
|---|---|---|
| `packages/compliance-crawler/src/sources/source-registry.ts` | **Create** | `SourceEntry` type + `SOURCE_ENTRIES` data array + `resolveSourceParser(id, env)` + `RegistryEnv` — the ONE registry |
| `packages/compliance-crawler/src/sources/types.ts` | Modify | `ParsedRegulation` gains optional `provenance?` carriage; add `Provenance` type (adapter/format/fetchedAt/sourceUri) |
| `packages/compliance-crawler/src/routes/crawl.ts` | Modify | drop inline `buildSourceRegistry` + `z.enum`; consume registry; validate via `isNormSource`; set provenance at write site |
| `packages/compliance-crawler/src/cli/crawl-live.ts` | Modify | drop duplicate `SOURCES`; consume registry |
| `packages/compliance-crawler/src/db/regulation.model.ts` | Modify | + optional embedded `provenance` sub-doc |
| `packages/server/src/models/Regulation.ts` | Modify | + same optional `provenance` sub-doc (stay-in-sync only) |
| `packages/compliance-crawler/src/__tests__/source-registry.test.ts` | Create | registry is data-driven + ontology-consistent + resolves adapters |
| `packages/compliance-crawler/src/__tests__/crawl-route.test.ts` | Create/extend | body schema accepts ai-act-en via ontology, rejects garbage, dora → not-yet-implemented; provenance persisted |

---

## Chunk 1: The single config-driven registry

### Task 1: Branch + baseline

- [ ] **Step 1.1**
```bash
cd /Users/mac_macee/javis
git checkout master && git pull
git checkout -b mganzmanninfo/the-414-config-driven-source-registry
```
- [ ] **Step 1.2: baseline green**
```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/compliance-crawler
cd packages/compliance-crawler && npx jest
```
Expected: tsc exit 0, all crawler suites pass. If not, STOP and report.

### Task 2: `source-registry.ts` — the data-driven registry (TDD)

**Files:** Create `packages/compliance-crawler/src/sources/source-registry.ts` + `packages/compliance-crawler/src/__tests__/source-registry.test.ts`

- [ ] **Step 2.1: Write the failing test** (`source-registry.test.ts`):
```typescript
/**
 * THE-414: the source registry is data (one entry per source), not two hardcoded
 * object literals. Every entry's id must be an ontology source, and must resolve
 * to a working SourceParser. Adding a source = appending one entry here.
 */
import { SOURCE_ENTRIES, resolveSourceParser } from '../sources/source-registry';
import { isNormSource } from '@thearchitect/shared';

const env = { firecrawlKey: undefined, firecrawlUrl: undefined };

describe('source registry (THE-414)', () => {
  it('covers exactly the 7 currently-wired sources', () => {
    expect(SOURCE_ENTRIES.map((e) => e.id).sort()).toEqual(
      ['ai-act-de', 'ai-act-en', 'data-act-de', 'data-act-en', 'dsgvo', 'lksg', 'nis2'].sort(),
    );
  });

  it('every entry id is an ontology source (no off-ontology wiring)', () => {
    for (const e of SOURCE_ENTRIES) expect(isNormSource(e.id)).toBe(true);
  });

  it('every entry declares provenance adapter + format', () => {
    for (const e of SOURCE_ENTRIES) {
      expect(typeof e.adapter).toBe('string');
      expect(typeof e.format).toBe('string');
    }
  });

  it('resolveSourceParser builds a SourceParser for each entry', () => {
    for (const e of SOURCE_ENTRIES) {
      const parser = resolveSourceParser(e.id, env);
      expect(parser).not.toBeNull();
      expect(typeof parser?.crawl).toBe('function');
    }
  });

  it('returns null for an unwired ontology source (dora) — caller emits "not yet implemented"', () => {
    expect(resolveSourceParser('dora', env)).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run — verify FAIL** (module missing):
```bash
cd /Users/mac_macee/javis/packages/compliance-crawler && npx jest src/__tests__/source-registry.test.ts
```

- [ ] **Step 2.3: Implement `source-registry.ts`.** Move the EXACT factory calls currently in `crawl.ts:62-98` into data entries. Read `crawl.ts` first to copy the article numbers / language args verbatim.
```typescript
import type { RegulationSource } from '@thearchitect/shared';
import type { SourceParser } from './types';
import {
  nis2EurLexSource, dsgvoEurLexSource, aiActEurLexSource, dataActEurLexSource,
} from './eur-lex';
import {
  nis2FirecrawlSource, dsgvoFirecrawlSource, aiActFirecrawlSource, dataActFirecrawlSource,
} from './firecrawl';
import { lksgSource } from './gesetze-im-internet';

/** Runtime inputs the registry needs to pick a transport (Firecrawl vs. direct). */
export interface RegistryEnv {
  firecrawlKey?: string;
  firecrawlUrl?: string;
}

/**
 * One data entry per ingestable source. `adapter`/`format` are provenance labels
 * (THE-414 AC-3). `make` wraps the exact adapter-factory call. A new source that
 * reuses an existing adapter = one more entry here — no new class, no enum edit.
 * A source needing a NEW transport (CELLAR-AKN, Fedlex-SPARQL…) is THE-439.
 */
export interface SourceEntry {
  id: RegulationSource;
  adapter: string;   // provenance: which ingest adapter produced the fact
  format: string;    // provenance: source format (today: 'html')
  make: (env: RegistryEnv) => SourceParser;
}

export const SOURCE_ENTRIES: SourceEntry[] = [
  {
    id: 'nis2', adapter: 'eur-lex', format: 'html',
    make: ({ firecrawlKey, firecrawlUrl }) =>
      firecrawlKey
        ? nis2FirecrawlSource({ apiKey: firecrawlKey, apiUrl: firecrawlUrl, articleNumbers: [20, 21, 22, 23, 24] })
        : nis2EurLexSource({ articleNumbers: [20, 21, 22, 23, 24] }),
  },
  {
    id: 'dsgvo', adapter: 'eur-lex', format: 'html',
    make: ({ firecrawlKey, firecrawlUrl }) =>
      firecrawlKey
        ? dsgvoFirecrawlSource({ apiKey: firecrawlKey, apiUrl: firecrawlUrl, articleNumbers: [5, 6, 9, 32] })
        : dsgvoEurLexSource({ articleNumbers: [5, 6, 9, 32] }),
  },
  {
    id: 'lksg', adapter: 'gesetze-im-internet', format: 'html',
    make: () => lksgSource({ paragraphNumbers: [3, 4, 5, 6, 7, 8, 9] }),
  },
  ...(['en', 'de'] as const).flatMap((lang): SourceEntry[] => [
    {
      id: `ai-act-${lang}` as RegulationSource, adapter: 'eur-lex', format: 'html',
      make: ({ firecrawlKey, firecrawlUrl }) =>
        firecrawlKey
          ? aiActFirecrawlSource({ apiKey: firecrawlKey, apiUrl: firecrawlUrl, language: lang })
          : aiActEurLexSource({ language: lang }),
    },
    {
      id: `data-act-${lang}` as RegulationSource, adapter: 'eur-lex', format: 'html',
      make: ({ firecrawlKey, firecrawlUrl }) =>
        firecrawlKey
          ? dataActFirecrawlSource({ apiKey: firecrawlKey, apiUrl: firecrawlUrl, language: lang })
          : dataActEurLexSource({ language: lang }),
    },
  ]),
];

const BY_ID = new Map(SOURCE_ENTRIES.map((e) => [e.id, e]));

export const getSourceEntry = (id: string): SourceEntry | undefined => BY_ID.get(id as RegulationSource);

/** Build a parser for a source, or null if no adapter is wired (caller → "not yet implemented"). */
export function resolveSourceParser(id: string, env: RegistryEnv): SourceParser | null {
  const entry = BY_ID.get(id as RegulationSource);
  return entry ? entry.make(env) : null;
}
```
Note: the `firecrawl` factories in `crawl.ts` receive `articleNumbers` — verify that arg exists on `nis2FirecrawlSource`/`dsgvoFirecrawlSource` options (read `firecrawl.ts` exports). If a firecrawl factory does NOT accept `articleNumbers`, replicate the exact call from `crawl.ts:64-97` instead of the shape above — the crawl.ts calls are the source of truth.

- [ ] **Step 2.4: Run — verify PASS**
```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/compliance-crawler
cd packages/compliance-crawler && npx jest src/__tests__/source-registry.test.ts
```

- [ ] **Step 2.5: Commit**
```bash
cd /Users/mac_macee/javis
git add packages/compliance-crawler/src/sources/source-registry.ts packages/compliance-crawler/src/__tests__/source-registry.test.ts
git commit -m "feat(crawler): single data-driven source registry (THE-414)"
```

### Task 3: Route consumes the registry, kills the z.enum (TDD)

**Files:** Modify `packages/compliance-crawler/src/routes/crawl.ts` + create/extend `packages/compliance-crawler/src/__tests__/crawl-route.test.ts`

- [ ] **Step 3.1: Check for an existing route test.** `ls packages/compliance-crawler/src/__tests__ | grep -i crawl`. If a crawl-route/health test exists that builds the Fastify app, extend it; else create `crawl-route.test.ts` building the app via the crawler's app factory (find it: `grep -rn "fastify(" packages/compliance-crawler/src`). If wiring a full Fastify test is heavy, fall back to unit-testing the exported `CrawlBodySchema` directly (see Step 3.2 variant B).

- [ ] **Step 3.2: Write the failing test.** Export `CrawlBodySchema` from `crawl.ts` (add `export`) so it's unit-testable without HTTP:
```typescript
import { CrawlBodySchema } from '../routes/crawl';

describe('crawl body source validation (THE-414)', () => {
  it('accepts ai-act-en (ontology source, no z.enum gate)', () => {
    expect(CrawlBodySchema.safeParse({ sources: ['ai-act-en'] }).success).toBe(true);
  });
  it('accepts a currently-unwired ontology source (dora) at the schema — registry emits not-implemented later', () => {
    expect(CrawlBodySchema.safeParse({ sources: ['dora'] }).success).toBe(true);
  });
  it('rejects a non-ontology source', () => {
    expect(CrawlBodySchema.safeParse({ sources: ['totally-made-up'] }).success).toBe(false);
  });
  it('still bounds the array (min 1, max 12)', () => {
    expect(CrawlBodySchema.safeParse({ sources: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 3.3: Run — verify FAIL** (dora currently rejected by z.enum; import may fail until exported):
```bash
cd /Users/mac_macee/javis/packages/compliance-crawler && npx jest src/__tests__/crawl-route.test.ts
```

- [ ] **Step 3.4: Implement in `crawl.ts`:**
  1. Remove the imports of the individual `*Source` factories (lines 5-17) and the local `buildSourceRegistry` + `SOURCE_REGISTRY` (lines 51-101). Import instead:
     ```typescript
     import { resolveSourceParser, getSourceEntry } from '../sources/source-registry';
     import { isNormSource } from '@thearchitect/shared';
     ```
  2. Replace the `sources` field in `CrawlBodySchema` (and `export` the schema):
     ```typescript
     sources: z
       .array(z.string().refine(isNormSource, { message: 'source not in norm ontology' }))
       .min(1)
       .max(12),
     ```
  3. In the crawl loop, replace `const factory = SOURCE_REGISTRY[sourceKey]; if (!factory) {…}` with:
     ```typescript
     const parser = resolveSourceParser(sourceKey, { firecrawlKey: config.FIRECRAWL_API_KEY, firecrawlUrl: config.FIRECRAWL_API_URL || undefined });
     if (!parser) { errors.push({ source: sourceKey, message: 'source not yet implemented' }); continue; }
     ```
     and drop the now-removed `const parser = factory();` line. (Provenance wiring in Task 5 also touches this loop — Task 5 builds on this.)

- [ ] **Step 3.5: Run — verify PASS + no regression**
```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/compliance-crawler
cd packages/compliance-crawler && npx jest src/__tests__/crawl-route.test.ts && npx jest
```
Expected: new tests green; full crawler suite still green.

- [ ] **Step 3.6: Commit**
```bash
cd /Users/mac_macee/javis
git add packages/compliance-crawler/src/routes/crawl.ts packages/compliance-crawler/src/__tests__/crawl-route.test.ts
git commit -m "feat(crawler): crawl route reads the registry + ontology, z.enum removed (THE-414)"
```

### Task 4: CLI consumes the same registry (kill the duplicate)

**Files:** Modify `packages/compliance-crawler/src/cli/crawl-live.ts`

- [ ] **Step 4.1: Implement.** Remove the local `SOURCES` object + the `*Source` factory imports (lines 12-32). Use the registry:
```typescript
import { resolveSourceParser, SOURCE_ENTRIES } from '../sources/source-registry';
```
```typescript
  const sourceKey = process.argv[2] ?? 'nis2';
  const parser = resolveSourceParser(sourceKey, {
    firecrawlKey: process.env.FIRECRAWL_API_KEY,
    firecrawlUrl: process.env.FIRECRAWL_API_URL || undefined,
  });
  if (!parser) {
    console.error(`Unsupported source: ${sourceKey}. Available: ${SOURCE_ENTRIES.map((e) => e.id).join(', ')}`);
    process.exit(1);
  }
```
(The CLI historically used the direct EUR-Lex path; going through the registry means it now prefers Firecrawl IF `FIRECRAWL_API_KEY` is set in the CLI env. That's an improvement, not a regression — document it in the commit body. If you want to preserve the old always-direct CLI behavior, pass `{ firecrawlKey: undefined }` — but the registry default is fine and more production-faithful.)

- [ ] **Step 4.2: Verify tsc + no `SOURCES` duplicate remains**
```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/compliance-crawler
grep -n "buildSourceRegistry\|const SOURCES" packages/compliance-crawler/src/routes/crawl.ts packages/compliance-crawler/src/cli/crawl-live.ts
```
Expected: tsc clean; grep returns NOTHING (both duplicates gone).

- [ ] **Step 4.3: Commit**
```bash
cd /Users/mac_macee/javis
git add packages/compliance-crawler/src/cli/crawl-live.ts
git commit -m "refactor(crawler): CLI consumes the shared registry, duplicate SOURCES removed (THE-414)"
```

---

## Chunk 2: Provenance

### Task 5: Provenance per ingested fact (TDD)

**Files:** Modify `sources/types.ts`, `routes/crawl.ts`, `db/regulation.model.ts`, `packages/server/src/models/Regulation.ts` + extend `crawl-route.test.ts` (or a small model test)

- [ ] **Step 5.1: Write the failing test.** A model-level test proving a crawled doc carries provenance. In `packages/compliance-crawler/src/__tests__/source-registry.test.ts` (or a new `provenance.test.ts`), assert the model accepts a `provenance` sub-doc:
```typescript
import { Regulation } from '../db/regulation.model';
it('Regulation accepts a provenance sub-document (THE-414 AC-3)', () => {
  const doc = new Regulation({
    regulationKey: 'nis2:art-20', versionHash: 'x'.repeat(64), source: 'nis2', jurisdiction: 'EU',
    paragraphNumber: 'Art. 20', title: 't', fullText: 'x'.repeat(60), sourceUrl: 'https://e.org',
    effectiveFrom: new Date(), language: 'en',
    provenance: { adapter: 'eur-lex', format: 'html', fetchedAt: new Date(), sourceUri: 'https://e.org' },
  });
  const err = doc.validateSync();
  expect(err?.errors?.['provenance.adapter']).toBeUndefined();
  expect(doc.provenance?.adapter).toBe('eur-lex');
});
```

- [ ] **Step 5.2: Run — verify FAIL** (provenance not in schema → stripped, `doc.provenance` undefined).

- [ ] **Step 5.3: Implement.**
  1. `sources/types.ts` — add the provenance type + optional carriage:
     ```typescript
     export interface Provenance {
       adapter: string;            // ingest adapter id, e.g. 'eur-lex'
       format: string;             // source format, e.g. 'html'
       fetchedAt?: Date;           // set at ingest
       sourceUri?: string;         // resolvable origin (per-paragraph URL)
     }
     ```
     (`ParsedRegulation` does NOT need a provenance field — it's set at the write site. Only add `Provenance` for typing.)
  2. `db/regulation.model.ts` — add to `IRegulation`: `provenance?: Provenance;` (import the type), and to the schema an embedded optional sub-doc:
     ```typescript
     provenance: {
       type: new Schema({
         adapter: { type: String, required: true },
         format: { type: String, required: true },
         fetchedAt: { type: Date },
         sourceUri: { type: String },
       }, { _id: false }),
       required: false,
     },
     ```
  3. `packages/server/src/models/Regulation.ts` — add the SAME optional `provenance` field to its `IRegulation` + schema (stay-in-sync; import a local Provenance type or inline the sub-schema). No other server change.
  4. `routes/crawl.ts` — at the write site, look up the entry and stamp provenance into the `$set`:
     ```typescript
     const entry = getSourceEntry(sourceKey);
     const fetchedAt = new Date();
     // …inside the per-paragraph loop, in the $set:
     provenance: entry ? { adapter: entry.adapter, format: entry.format, fetchedAt, sourceUri: p.sourceUrl } : undefined,
     ```

- [ ] **Step 5.4: Run — verify PASS + tsc (both packages)**
```bash
cd /Users/mac_macee/javis && npx tsc --noEmit -p packages/compliance-crawler && npx tsc --noEmit -p packages/server
cd packages/compliance-crawler && npx jest src/__tests__/source-registry.test.ts
```

- [ ] **Step 5.5: Commit**
```bash
cd /Users/mac_macee/javis
git add packages/compliance-crawler/src/sources/types.ts packages/compliance-crawler/src/db/regulation.model.ts packages/compliance-crawler/src/routes/crawl.ts packages/server/src/models/Regulation.ts packages/compliance-crawler/src/__tests__/
git commit -m "feat(crawler): stamp provenance (adapter/format/fetchedAt/sourceUri) per ingested fact (THE-414 AC-3)"
```

---

## Chunk 3: Verification + PR

### Task 6: Grep proof, suites, PR

- [ ] **Step 6.1: Grep proof** (from repo root; all must return NOTHING):
```bash
cd /Users/mac_macee/javis
grep -n "z.enum" packages/compliance-crawler/src/routes/crawl.ts | grep -iv language
grep -rn "buildSourceRegistry\|const SOURCES\b" packages/compliance-crawler/src
```

- [ ] **Step 6.2: Full verification**
```bash
cd /Users/mac_macee/javis
npx tsc --noEmit -p packages/compliance-crawler && npx tsc --noEmit -p packages/server
cd packages/compliance-crawler && npx jest
cd ../.. && npm run build
```
Expected: tsc clean both packages; full crawler suite green (record count); turbo build 4/4. (Server Jest not required here — no server logic changed, only an optional model field; but run `cd packages/server && npx jest src/__tests__/regulation-model-ontology.test.ts` to confirm the model still validates.)

- [ ] **Step 6.3: Push + PR**
```bash
cd /Users/mac_macee/javis
git push -u origin mganzmanninfo/the-414-config-driven-source-registry
gh pr create --title "feat(compliance): config-driven source registry + provenance (THE-414)" --body "$(cat <<'EOF'
## Summary
- Two hardcoded source registries (`crawl.ts buildSourceRegistry` + `cli/crawl-live.ts SOURCES`) + the `CrawlBodySchema` `z.enum` collapsed into ONE data-driven registry (`sources/source-registry.ts`); allowed sources validated against the ontology via `isNormSource` (THE-413) — wiring a source that reuses an existing adapter is one data entry (REQ-CANON-001.2, re-sliced)
- Provenance (`adapter`/`format`/`fetchedAt`/`sourceUri`) stamped per ingested fact, set at the write site from the registry entry (UC-PROV hook)
- Existing 7 sources (nis2/dsgvo/lksg/ai-act·data-act ×en/de) unchanged; fixture suites green

## Out of scope (deliberate)
- New external adapters (CELLAR-AKN/Fedlex/eCFR/GovInfo) → THE-439
- Hierarchical @eId output → THE-415 (flat ParsedRegulation retained)

## Test plan
- [x] registry is data-driven + ontology-consistent + resolves each adapter (source-registry.test.ts)
- [x] crawl body accepts ai-act-en/dora via ontology, rejects garbage, no z.enum
- [x] provenance persisted (model sub-doc)
- [x] full crawler suite green; tsc clean (crawler + server); turbo build 4/4
- [x] grep proof: 0 hits for z.enum / buildSourceRegistry / duplicate SOURCES

Note: crawler deploys separately (Server B/Coolify).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Task 7: Linear + RVTM
- [ ] **Step 7.1:** THE-414 → In Progress → (after merge) Done; comment with file list, test counts, grep proof.
- [ ] **Step 7.2:** RVTM `2026-07-09-uc-canon-001-rvtm.md` row 001.2: status + PR evidence.
- [ ] **Step 7.3:** Re-score trigger: THE-415 (.3) now has the registry + provenance seam to build the @eId ingest on — note Feasibility bump.
