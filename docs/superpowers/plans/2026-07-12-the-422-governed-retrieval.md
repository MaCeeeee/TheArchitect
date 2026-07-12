# THE-422 — Eligibility-Gate + Version-Pin im Retrieval-Pfad (governedRetrieval) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a single governed-retrieval Deep Module through which every AI consumer fetches law/corpus context, enforcing (a) eligibility (non-stale = current published version), (b) optional version-pin served from Mongo, (c) stale-drop with telemetry — the Read-Side counterpart to VERLOCK (THE-306).

**Architecture:** One new service `governedRetrieval.service.ts` sits over the two existing retrieval mechanisms: the Qdrant vector path (`queryDocuments` → Data-Server) and the canonical Mongo corpus (`corpusClient.service.ts`). It exposes `governedQuery()` (vector path: post-filters returned chunks against the corpus-current `versionHash`, drops stale, serves pinned `fullText` from Mongo) and `resolveGovernedRegulations()` (structured path: reads the corpus by key with pin + eligibility, replacing direct legacy `Regulation.find()` reads). All six AI consumers route through this module — no path bypasses the gate. Telemetry (`staleDropped`, `pinnedServed`) mirrors the THE-419 `corpusMiss` pattern; `CORPUS_STRICT_READS` semantics are honored.

**Tech Stack:** TypeScript (strict), Express, Mongoose (dedicated corpus connection), Jest 29, existing Data-Server (n8n/Qdrant) HTTP contract.

**Linear:** THE-422 (parent THE-420 / UC-CTXGOV-001). Blocks THE-461 (UC-LAW-002 discovery).

**RVTM:** `docs/superpowers/rvtm/2026-07-12-the-422-governed-retrieval-rvtm.md`

---

## Scope & Non-Goals (read first)

**In scope (THE-422 ACs):**
- AC-1: retrieval inputs accept `pin?: Record<regulationKey, versionHash>` + `eligibleOnly?: boolean` (default `true`).
- AC-2: retrieved chunk with `versionHash` ≠ current published hash is dropped + `staleDropped` counter.
- AC-3: explicit pin serves the pinned `fullText` from the **Mongo corpus version** — never Qdrant.
- AC-4: AI-Match + requirementGenerator + the 4 RAG generators fetch context **only** through the module.
- AC-5: tests — stale dropped; pin serves exact pinned version; default behavior for current corpora unchanged (regression green).

**Explicit Non-Goals (deferred, do NOT build here):**
- **draft/published lifecycle** (Staged Ingest) → THE-426. In THE-422, "eligible" means **"matches the corpus-current version" (not stale)**, because the corpus schema has no `status` field yet. Do not add one here.
- **Hash-chain / checkpoint / as-of point-in-time** → THE-424/425. `pin` here targets a concrete `versionHash` that still exists in Mongo; it does NOT reconstruct a historical corpus snapshot.
- **ContextTrace / Evidence Bundle** (audit-trace of consumed chunks) → THE-423. This plan leaves a clean seam (return the resolved `{regulationKey, versionHash}` set from the module) for THE-423 to persist, but does not write the trace.
- **Qdrant historization** — Qdrant keeps only latest-per-key (point-id = `hash(regulationKey)`). Pin/history is always served from Mongo. Do not touch the crawler's upsert.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `packages/server/src/services/governedRetrieval.service.ts` | The Deep Module: types, telemetry, `governedQuery`, `resolveGovernedRegulations`. | **Create** |
| `packages/server/src/services/corpusClient.service.ts` | Add `getRegulationByKeyAndHash(key, versionHash)` read for pin. | Modify (~after :100) |
| `packages/server/src/services/dataServer.service.ts` | Nothing functional; `QueryChunk.metadata` already carries payload. Confirmed by Spike (Chunk 0). | Read-only / maybe unchanged |
| `packages/server/src/services/activityGenerator.service.ts` | Route `queryRagSafe` through `governedQuery`. | Modify `:264-277` |
| `packages/server/src/services/connectionSuggestion.service.ts` | Same. | Modify (`:387` call-site) |
| `packages/server/src/services/processGenerator.service.ts` | Same. | Modify (`:149` call-site) |
| `packages/server/src/services/dataObjectGenerator.service.ts` | Same. | Modify (`:277` call-site) |
| `packages/server/src/routes/compliance.routes.ts` | Replace direct `Regulation.find()` (`:127`) with `resolveGovernedRegulations`. | Modify |
| `packages/server/src/routes/requirements.routes.ts` | Route the norm-section text through the gate (eligibility check on the resolved norm version). | Modify (`:135-146`) |
| `packages/server/src/routes/rag.routes.ts` | Accept + forward `pin` / `eligibleOnly` on `/rag/query`. | Modify (`:77-89`) |
| `packages/server/src/__tests__/governedRetrieval.service.test.ts` | Unit tests (in-memory corpus seam). | **Create** |
| `packages/server/src/__tests__/governedRetrieval.consumers.test.ts` | Wiring/regression tests for the 6 consumers. | **Create** |

**Convention notes (verified):** tests live in `packages/server/src/__tests__/*.test.ts`, runner is `jest` (`npm test -w @thearchitect/server`). `corpusClient` exposes a test seam `__setCorpusForTests(model)`. `MappingRegulationInput` (`complianceMapping.service.ts:57`) is structural — corpus views satisfy it without casts (THE-419 already decoupled it from `IRegulation`).

---

## Chunk 0: Spike — confirm the vector path carries version identity

**Why first:** AC-2 (stale-drop on the vector path) is only implementable if the Data-Server query response returns `versionHash` (and `regulationKey`) inside `QueryChunk.metadata`. The Qdrant *payload* stores them (`compliance-crawler/src/embeddings/qdrant.ts:66-78`), but whether the **n8n rag-query workflow** projects them into the response `metadata` is unverified. This is the plan's one real unknown-unknown — resolve it before writing filter code.

- [ ] **Step 1: Inspect the live query response shape**

Run against a project known to have ingested regulation chunks (use an existing integration/e2e helper or a one-off script hitting `POST /api/projects/:id/rag/query`). Capture one `chunks[].metadata` object.

Run: `DATA_SERVER_URL=... DATA_SERVER_SHARED_SECRET=... node scripts/spike-rag-metadata.mjs` (write a throwaway script that calls `queryDocuments` with a known law query, `topK: 20`, and prints how many of the returned chunks carry `metadata.versionHash` + `metadata.regulationKey` vs. how many are missing either).
Expected (two questions, not one): (a) does a *freshly ingested* law chunk carry `versionHash`+`regulationKey`? (b) is coverage **homogeneous** — do *all* law chunks carry it, or do legacy points (ingested before the payload field existed) still return without it? The `unverifiable` counter (Chunk 2) exists precisely because (b) may be "heterogeneous"; record the observed ratio.

- [ ] **Step 2: Branch on the result**

- **If present:** proceed to Chunk 2 as written (post-filter in the app, zero Data-Server change).
- **If absent:** STOP and surface to the human. The stale-filter for the vector path then requires an n8n rag-query workflow change (add payload fields to the response projection) — that is a separate REQ on the Data-Server and a prerequisite for AC-2 on the 4 generators. Chunks 1, 3-legacy, and 4 (the Mongo/structured path) are unaffected and can proceed; only the vector-path stale-drop blocks. Record the decision in the Linear issue.

- [ ] **Step 3: Commit the spike script + finding**

```bash
git add scripts/spike-rag-metadata.mjs docs/superpowers/plans/2026-07-12-the-422-governed-retrieval.md
git commit -m "chore(the-422): spike — verify rag-query metadata carries versionHash"
```

---

## Chunk 1: governedRetrieval module — types, telemetry, structured corpus read (Mongo path)

This chunk builds the module skeleton and the **structured** read (`resolveGovernedRegulations`) with pin + eligibility. It has no external dependency (pure Mongo corpus via the test seam), so it is fully unit-testable first.

**Files:**
- Create: `packages/server/src/services/governedRetrieval.service.ts`
- Modify: `packages/server/src/services/corpusClient.service.ts` (add `getRegulationByKeyAndHash`; **fix `getCurrentVersionHashes` last-wins bug**)
- Create: `packages/server/src/__tests__/helpers/fakeCorpus.ts` (chainable corpus stub)
- Test: `packages/server/src/__tests__/governedRetrieval.service.test.ts`

- [ ] **Step 1: Fix the pre-existing `getCurrentVersionHashes` bug (blocking dependency for AC-2/AC-5)**

`corpusClient.service.ts:138-147` currently resolves "current" via last-wins over an **unsorted** `getRegulationsByKeys().find()` — line 144 `if (!existing || (r.version ?? 1) >= 1)` is always true, so the returned hash is nondeterministic and can be a *stale* version. That would invert AC-2 (drop current, keep stale). Fix it to max-version-wins with an explicit sort, mirroring the correct `listCorpusBySource` pattern (:119-132). Add a failing test first.

Add to `governedRetrieval.service.test.ts` (or a `corpusClient.service.test.ts`): seed `k1` with version 1/`hA` and version 2/`hB` returned in **descending** and then **ascending** order from the stub; assert `getCurrentVersionHashes(['k1'])` returns `hB` (max version) in both orderings.

Then replace the body:

```ts
export async function getCurrentVersionHashes(keys: string[]): Promise<Map<string, string>> {
  const regs = await getRegulationsByKeys([...new Set(keys)]);
  const latest = new Map<string, ICorpusRegulation>();
  for (const r of regs) {
    const cur = latest.get(r.regulationKey);
    if (!cur || (r.version ?? 1) > (cur.version ?? 1)) latest.set(r.regulationKey, r);
  }
  const map = new Map<string, string>();
  for (const [k, r] of latest) map.set(k, r.versionHash);
  return map;
}
```

Run: `npm test -w @thearchitect/server -- getCurrentVersionHashes` — FAIL then PASS. Commit separately: `git commit -am "fix(corpus): getCurrentVersionHashes max-version-wins (was nondeterministic last-wins)"`.

- [ ] **Step 2: Author the fake-corpus test helper**

Create `packages/server/src/__tests__/helpers/fakeCorpus.ts`. `corpusClient` chains `.findOne({...}).sort({version:-1})` (:99) and `.find({...}).sort({...})` (:125), so the stub MUST return chainable, `await`-able query objects (a thenable that also has `.sort()` returning itself).

```ts
import type { Model } from 'mongoose';
import type { ICorpusRegulation } from '../../services/corpusClient.service';

type Row = Partial<ICorpusRegulation> & { regulationKey: string; versionHash: string; version: number };

const REQUIRED: Omit<Row, 'regulationKey' | 'versionHash' | 'version'> = {
  source: 's', jurisdiction: 'EU', paragraphNumber: '1', title: 't', fullText: '',
  summary: undefined, sourceUrl: 'http://x', effectiveFrom: new Date(0), language: 'en',
} as never;

function query(rows: Row[]) {
  let result = rows;
  const q: any = {
    sort(spec: Record<string, 1 | -1>) {
      const [field, dir] = Object.entries(spec)[0];
      result = [...result].sort((a: any, b: any) => (a[field] > b[field] ? 1 : -1) * dir);
      return q;
    },
    then(resolve: (v: any) => void) { resolve(result); },
  };
  return q;
}

/** Minimal Model-like stub for __setCorpusForTests. Only implements what corpusClient uses. */
export function makeFakeCorpus(rows: Array<Partial<Row>>): Model<ICorpusRegulation> {
  const full = rows.map(r => ({ ...REQUIRED, ...r })) as Row[];
  return {
    findOne: (f: any) => query(full.filter(r =>
      Object.entries(f).every(([k, v]) => (r as any)[k] === v))).sort({ version: 1 }) &&
      // findOne resolves to the first element
      { then: (res: any) => res(full.filter(r => Object.entries(f).every(([k, v]) => (r as any)[k] === v))
        .sort((a, b) => (b.version - a.version))[0] ?? null),
        sort() { return this; } },
    find: (f: any) => query(full.filter(r => Object.entries(f).every(([k, v]) =>
      Array.isArray((v as any)?.$in) ? (v as any).$in.includes((r as any)[k]) : (r as any)[k] === v))),
    estimatedDocumentCount: async () => full.length,
  } as unknown as Model<ICorpusRegulation>;
}
```

> Note: keep this helper deliberately tiny. If a later test needs an operator the stub doesn't support, extend it here, not inline in the test.

- [ ] **Step 3: Add the pin read to corpusClient**

In `corpusClient.service.ts`, after `getRegulationByKey` (:98-100):

```ts
/** Exact version by key+hash — for version-pin (AC-3). Returns null if that version no longer exists. */
export async function getRegulationByKeyAndHash(
  key: string,
  versionHash: string,
): Promise<ICorpusRegulation | null> {
  try {
    return await CorpusRegulation().findOne({ regulationKey: key, versionHash });
  } catch (err) {
    log.warn({ err: safeErrorMessage(err), key }, '[corpus] getRegulationByKeyAndHash failed');
    return null;
  }
}
```

- [ ] **Step 4: Write the failing test (types + eligibility + pin)**

Create `packages/server/src/__tests__/governedRetrieval.service.test.ts`. Use the in-memory corpus seam (`__setCorpusForTests`) with `makeFakeCorpus`. Seed key `gdpr:art-30` with two versions: `v1` hash `h1` (older, `fullText: 'OLD'`), `v2` hash `h2` (current, `fullText: 'NEW'`).

```ts
import {
  resolveGovernedRegulations,
  getGovernedStats,
  resetGovernedStats,
} from '../services/governedRetrieval.service';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { makeFakeCorpus } from './helpers/fakeCorpus'; // small helper returning a Model-like stub

beforeEach(() => {
  resetGovernedStats();
  __setCorpusForTests(makeFakeCorpus([
    { regulationKey: 'gdpr:art-30', versionHash: 'h1', version: 1, fullText: 'OLD', /* …required fields… */ },
    { regulationKey: 'gdpr:art-30', versionHash: 'h2', version: 2, fullText: 'NEW', /* … */ },
  ]));
});
afterEach(() => __setCorpusForTests(null));

test('eligibleOnly (default) returns only the current version', async () => {
  const out = await resolveGovernedRegulations({ keys: ['gdpr:art-30'] });
  expect(out).toHaveLength(1);
  expect(out[0].versionHash).toBe('h2');
  expect(out[0].fullText).toBe('NEW');
});

test('explicit pin serves the exact pinned version from Mongo (AC-3)', async () => {
  const out = await resolveGovernedRegulations({
    keys: ['gdpr:art-30'],
    pin: { 'gdpr:art-30': 'h1' },
  });
  expect(out[0].versionHash).toBe('h1');
  expect(out[0].fullText).toBe('OLD');
  expect(getGovernedStats().pinnedServed).toBe(1);
});

test('pin to a vanished version drops it + counts staleDropped', async () => {
  const out = await resolveGovernedRegulations({
    keys: ['gdpr:art-30'],
    pin: { 'gdpr:art-30': 'GONE' },
  });
  expect(out).toHaveLength(0);
  expect(getGovernedStats().staleDropped).toBe(1);
});
```

- [ ] **Step 5: Run it — verify it fails**

Run: `npm test -w @thearchitect/server -- governedRetrieval.service`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 6: Implement the module (structured path only for now)**

Create `governedRetrieval.service.ts`:

```ts
/**
 * Governed Retrieval (THE-422 / UC-CTXGOV-001 Read-Side).
 *
 * Single Deep Module every AI consumer uses to fetch law/corpus context.
 * Enforces eligibility (non-stale = current published version) and optional
 * version-pin (served from the Mongo corpus, never Qdrant). Telemetry mirrors
 * the THE-419 corpusMiss pattern. `eligibleOnly` here == "matches corpus-current
 * version"; draft/published lifecycle is THE-426 (Non-Goal).
 */
import {
  getRegulationsByKeys,
  getCurrentVersionHashes,
  getRegulationByKeyAndHash,
  type ICorpusRegulation,
} from './corpusClient.service';
import { log } from '../config/logger';

export type VersionPin = Record<string, string>; // regulationKey -> versionHash

export interface GovernedReadInput {
  keys: string[];
  pin?: VersionPin;
  eligibleOnly?: boolean; // default true
}

export interface GovernedRegulationView {
  regulationKey: string;
  versionHash: string;
  source: string;
  jurisdiction: string;
  paragraphNumber: string;
  title: string;
  fullText: string;
  summary?: string;
  sourceUrl: string;
  effectiveFrom: Date;
  language: string;
}

interface GovernedStats {
  staleDropped: number;   // chunks/regs dropped: versionHash PRESENT but != current-or-pinned
  pinnedServed: number;   // regs served from an explicit pin
  unverifiable: number;   // law chunks KEPT despite missing versionHash (legacy pre-payload points)
}
const stats: GovernedStats = { staleDropped: 0, pinnedServed: 0, unverifiable: 0 };
export function getGovernedStats(): Readonly<GovernedStats> { return { ...stats }; }
export function resetGovernedStats(): void { stats.staleDropped = 0; stats.pinnedServed = 0; stats.unverifiable = 0; }

function toView(r: ICorpusRegulation): GovernedRegulationView {
  return {
    regulationKey: r.regulationKey, versionHash: r.versionHash, source: r.source,
    jurisdiction: r.jurisdiction, paragraphNumber: r.paragraphNumber, title: r.title,
    fullText: r.fullText, summary: r.summary, sourceUrl: r.sourceUrl,
    effectiveFrom: r.effectiveFrom, language: r.language,
  };
}

/**
 * Structured corpus read with pin + eligibility. Replaces direct legacy
 * `Regulation.find()` reads on the AI-Match / requirement-generation paths.
 */
export async function resolveGovernedRegulations(
  input: GovernedReadInput,
): Promise<GovernedRegulationView[]> {
  const { keys, pin } = input;
  const eligibleOnly = input.eligibleOnly ?? true;
  if (keys.length === 0) return [];

  const out: GovernedRegulationView[] = [];
  const unpinned = keys.filter(k => !(pin && pin[k]));

  // 1) Pinned keys — exact version from Mongo (AC-3).
  if (pin) {
    for (const k of keys) {
      const hash = pin[k];
      if (!hash) continue;
      const doc = await getRegulationByKeyAndHash(k, hash);
      if (doc) { out.push(toView(doc)); stats.pinnedServed += 1; }
      else { stats.staleDropped += 1; log.warn({ k, hash }, '[governed] pinned version not found — dropped'); }
    }
  }

  // 2) Unpinned keys — current version, eligibility-filtered.
  if (unpinned.length > 0) {
    const regs = await getRegulationsByKeys(unpinned);
    const current = eligibleOnly ? await getCurrentVersionHashes(unpinned) : null;
    // getRegulationsByKeys can return multiple versions per key → keep current only.
    const byKey = new Map<string, ICorpusRegulation>();
    for (const r of regs) {
      const cur = byKey.get(r.regulationKey);
      if (!cur || (r.version ?? 1) > (cur.version ?? 1)) byKey.set(r.regulationKey, r);
    }
    for (const [k, r] of byKey) {
      if (current && current.get(k) !== r.versionHash) { stats.staleDropped += 1; continue; }
      out.push(toView(r));
    }
  }
  return out;
}
```

- [ ] **Step 7: Run tests — verify pass**

Run: `npm test -w @thearchitect/server -- governedRetrieval.service`
Expected: PASS (eligibility + pin + vanished-pin, plus the `getCurrentVersionHashes` ordering test from Step 1).

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/services/governedRetrieval.service.ts \
        packages/server/src/services/corpusClient.service.ts \
        packages/server/src/__tests__/governedRetrieval.service.test.ts \
        packages/server/src/__tests__/helpers/fakeCorpus.ts
git commit -m "feat(the-422): governedRetrieval module — structured corpus read with pin + eligibility"
```

---

## Chunk 2: governedQuery — vector path stale-drop + pin fallback

Depends on Chunk 0 = "present". Adds `governedQuery()` wrapping `queryDocuments`: keeps only chunks whose `metadata.versionHash` equals the corpus-current hash for their `regulationKey`; for pinned keys, replaces the chunk text with the pinned Mongo `fullText`.

**Files:**
- Modify: `packages/server/src/services/governedRetrieval.service.ts`
- Test: `packages/server/src/__tests__/governedRetrieval.service.test.ts` (append)

- [ ] **Step 1: Failing test — stale chunk dropped, current kept, pin overrides text**

Append: mock `queryDocuments` (jest.mock of `dataServer.service`) to return three chunks for key `gdpr:art-30`: one with `metadata.versionHash='h2'` (current), one `'h1'` (stale), one with no key. Seed corpus current = `h2`.

```ts
test('governedQuery drops stale chunks, keeps current, counts staleDropped (AC-2)', async () => {
  const res = await governedQuery({ projectId: 'p1', text: 'records of processing' });
  const hashes = res.chunks.map(c => c.metadata.versionHash);
  expect(hashes).toContain('h2');
  expect(hashes).not.toContain('h1');
  expect(getGovernedStats().staleDropped).toBe(1);
});

test('governedQuery pin serves Mongo fullText for pinned key (AC-3)', async () => {
  const res = await governedQuery({ projectId: 'p1', text: 'x', pin: { 'gdpr:art-30': 'h1' } });
  const pinned = res.chunks.find(c => c.metadata.regulationKey === 'gdpr:art-30');
  expect(pinned?.text).toBe('OLD'); // from Mongo v1, not the Qdrant chunk
});

test('law chunk with NO versionHash is kept + counted (legacy point, AC-5 safety)', async () => {
  // mock queryDocuments to also return a chunk {regulationKey:'gdpr:art-30'} with no versionHash in metadata
  const res = await governedQuery({ projectId: 'p1', text: 'records' });
  expect(res.chunks.some(c => c.metadata.regulationKey === 'gdpr:art-30' && c.metadata.versionHash === undefined)).toBe(true);
  expect(getGovernedStats().unverifiable).toBeGreaterThanOrEqual(1);
});

test('non-law chunk (user upload, no regulationKey) passes through untouched', async () => {
  const res = await governedQuery({ projectId: 'p1', text: 'internal doc' });
  // a chunk with no regulationKey must survive regardless of eligibility
  expect(res.chunks.some(c => c.metadata.regulationKey === undefined)).toBe(true);
});
```

- [ ] **Step 2: Run — verify fail** · Run: `npm test -w @thearchitect/server -- governedRetrieval.service` · Expected: FAIL (`governedQuery` undefined).

- [ ] **Step 3: Implement governedQuery**

Add to the module (import `queryDocuments`, `QueryInput`, `QueryResult`, `QueryChunk` from `./dataServer.service`):

```ts
export interface GovernedQueryInput extends QueryInput {
  pin?: VersionPin;
  eligibleOnly?: boolean; // default true
}

const keyOf = (c: QueryChunk): string | undefined =>
  (c.metadata?.regulationKey ?? c.metadata?.regulation_key) as string | undefined;
const hashOf = (c: QueryChunk): string | undefined =>
  (c.metadata?.versionHash ?? c.metadata?.version_hash) as string | undefined;

export async function governedQuery(input: GovernedQueryInput): Promise<QueryResult> {
  const eligibleOnly = input.eligibleOnly ?? true;
  const raw = await queryDocuments({
    projectId: input.projectId, text: input.text, topK: input.topK, filters: input.filters,
  });

  const keys = [...new Set(raw.chunks.map(keyOf).filter((k): k is string => !!k))];
  if (keys.length === 0) return raw; // non-law chunks (user uploads) pass through untouched

  const current = await getCurrentVersionHashes(keys);
  const kept: QueryChunk[] = [];
  for (const c of raw.chunks) {
    const k = keyOf(c);
    if (!k) { kept.push(c); continue; } // non-law chunk

    const pinnedHash = input.pin?.[k];
    if (pinnedHash) {
      const doc = await getRegulationByKeyAndHash(k, pinnedHash);
      if (doc) { kept.push({ ...c, text: doc.fullText, metadata: { ...c.metadata, versionHash: doc.versionHash, pinned: true } }); stats.pinnedServed += 1; }
      else { stats.staleDropped += 1; }
      continue;
    }
    // Policy (AC-5 regression safety): a chunk whose versionHash is PRESENT and
    // mismatched is stale → drop. A chunk with NO versionHash (legacy point ingested
    // before the payload field existed) cannot be proven stale → KEEP + count, so we
    // never silently blank out existing generator context. Tighten to hard-drop only
    // once the corpus is fully re-ingested with versionHash (track via this counter).
    const h = hashOf(c);
    if (eligibleOnly && h !== undefined && h !== current.get(k)) { stats.staleDropped += 1; continue; }
    if (h === undefined) stats.unverifiable += 1;
    kept.push(c);
  }
  return { chunks: kept };
}
```

> If `stats.unverifiable` stays > 0 in production telemetry, that quantifies how much corpus still predates the `versionHash` payload — feed it back to the crawler re-ingest decision, don't hard-drop blindly.

- [ ] **Step 4: Run — verify pass** · Expected: PASS.
- [ ] **Step 5: Commit** · `git commit -am "feat(the-422): governedQuery — vector-path stale-drop + pin fallback (AC-2/AC-3)"`

---

## Chunk 3: Wire the 4 RAG generators + rag.routes passthrough

Each generator currently calls `queryDocuments({ projectId, text, topK })`. Swap to `governedQuery(...)` (default `eligibleOnly=true`). Behavior for current corpora is unchanged (regression), stale chunks now dropped.

**Files:** `activityGenerator.service.ts:264-277`, `connectionSuggestion.service.ts` (:387), `processGenerator.service.ts` (:149), `dataObjectGenerator.service.ts` (:277), `routes/rag.routes.ts:77-89`. Test: `governedRetrieval.consumers.test.ts`.

- [ ] **Step 1: Failing regression test** — for each generator's `queryRagSafe`-equivalent, assert that with an all-current corpus the returned context is identical to the pre-change behavior, and that a seeded stale chunk is excluded.
- [ ] **Step 2: Run — verify fail.**
- [ ] **Step 3: Edit each generator** — replace the import + call. Example (`activityGenerator.service.ts:268`):

```ts
// before: const res = await queryDocuments({ projectId, text: queryText, topK: 5 });
const res = await governedQuery({ projectId, text: queryText, topK: 5 });
```

Repeat verbatim for the other three call-sites. Keep the surrounding `try/catch` + score-threshold filter untouched.

- [ ] **Step 4: rag.routes.ts** — accept `pin` + `eligibleOnly` on `/rag/query` and forward via `governedQuery` instead of `queryDocuments`:

```ts
const { text, topK, filters, pin, eligibleOnly } = req.body ?? {};
// …
const result = await governedQuery({ projectId, text, topK: typeof topK === 'number' ? topK : undefined, filters, pin, eligibleOnly });
```

- [ ] **Step 5: Run — verify pass** · Run: `npm test -w @thearchitect/server -- governedRetrieval` · Expected: PASS.
- [ ] **Step 6: Commit** · `git commit -am "feat(the-422): route 4 RAG generators + /rag/query through governedQuery (AC-4)"`

---

## Chunk 4: Wire AI-Match + requirementGenerator (the legacy-bypass paths)

The critical AC-4 finding: `compliance.routes.ts:127` reads the legacy `Regulation` model directly (bypasses the resolver), and `requirements.routes.ts:143` slices a norm section. Both must go through the gate.

**Files:** `routes/compliance.routes.ts` (:118-142), `routes/requirements.routes.ts` (:131-146). Test: `governedRetrieval.consumers.test.ts` (append).

**Key-derivation reality (verified — read before writing):** the AI-Match route's input set is legacy `Regulation` docs (`compliance.routes.ts:119-127`, filtered by `requestedIds`), NOT `ComplianceMapping` (that is the *output* — empty on a first run). The legacy `Regulation` model has **no `regulationKey`/`versionHash`** (`models/Regulation.ts:18-37`). The bridge is `buildRegulationKey(source, paragraphNumber)` (`@thearchitect/shared`, already imported in `complianceMapping.service.ts:21`). So: keep the `Regulation.find()` selection, derive a corpus key per doc, and let the gate *upgrade* each legacy doc to its governed current/pinned corpus version — falling back to the legacy doc itself (through telemetry) when the corpus has no such key.

- [ ] **Step 1: Failing test — AI-Match upgrades legacy regs to the governed current version + honors pin**

Seed a legacy `Regulation` (source `gdpr`, paragraph `art-30`, `fullText 'LEGACY'`) whose derived key `gdpr:art-30` exists in the corpus at current `h2` (`'NEW'`). Assert `mapRegulationsBatch` (spy on its `regulations` arg) receives `fullText 'NEW'` (governed upgrade), not `'LEGACY'`. Assert a request `pin: {'gdpr:art-30':'h1'}` makes it receive `'OLD'`. Assert that a legacy reg whose key is **absent** from the corpus still reaches the batch as `'LEGACY'` and increments fallback telemetry.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Edit `compliance.routes.ts`** — after the existing `Regulation.find(regulationFilter).select('-embedding')` (:127), map each legacy doc through the gate by derived key:

```ts
import { buildRegulationKey } from '@thearchitect/shared';
import { resolveGovernedRegulations } from '../services/governedRetrieval.service';
// … after `const regulations = await Regulation.find(...)`:

const derived = regulations.map(r => ({ r, key: buildRegulationKey(r.source, r.paragraphNumber) }));
const governed = await resolveGovernedRegulations({
  keys: derived.map(d => d.key),
  pin: parsed.data.pin,          // add optional `pin` to the auto-map Zod schema
  eligibleOnly: true,
});
const governedByKey = new Map(governed.map(g => [g.regulationKey, g]));

// Governed upgrade where the corpus knows the key; else keep the legacy doc (measured).
// CRITICAL: always thread the legacy `_id` — mapRegulationsBatch derives the persisted
// ComplianceMapping.regulationId from reg._id (complianceMapping.service.ts:214/285→494).
// The upgrade swaps TEXT/VERSION only, NEVER the persistence identity, or every mapping on
// the primary (corpus-hit) path persists with an empty/garbage regulationId.
const mappingInput: MappingRegulationInput[] = derived.map(({ r, key }) => {
  const g = governedByKey.get(key);
  if (g) return { _id: r._id, source: g.source, paragraphNumber: g.paragraphNumber, title: g.title,
                  fullText: g.fullText, language: g.language as RegulationLanguage, jurisdiction: g.jurisdiction };
  // corpus miss → legacy passthrough. Log once so the bypass is visible, not silent.
  log.warn({ fn: 'complianceAutoMap', regulationKey: key }, '[the-422] corpus miss — legacy Regulation used');
  return { _id: r._id, source: r.source, paragraphNumber: r.paragraphNumber, title: r.title,
           fullText: r.fullText, language: r.language, jurisdiction: r.jurisdiction };
});
```

Pass `mappingInput` (not the raw `regulations`) into `mapRegulationsBatch({ regulations: mappingInput, … })`. Note: a pinned/stale-dropped corpus reg means `governedByKey` has no entry for that key → it correctly falls through to legacy passthrough; if you want a hard stale-block instead, drop the entry — but for AC-5 safety default to passthrough. Extend the auto-map request Zod schema with optional `pin: z.record(z.string()).optional()`. **Add an assertion to the Step-1 test** that the batch arg for the corpus-hit reg still carries the original `_id` (guards the persistence-identity regression).

- [ ] **Step 4: Edit `requirements.routes.ts`** — gate the norm-section generation, but ONLY for corpus-sourced norms.

Verified: `getPipelineNorm(projectId, ref)` (param is `ref`, not `normId`) returns a `PipelineNormView` with `source: 'upload' | 'corpus'` (`norm.service.ts:310`). **Only corpus norms carry a version** (`corpusRef: {regulationKey, versionHash}`, :170); upload norms have none. So the gate must:
- `norm.source === 'upload'` → **pass through untouched** (no version to check — 409-ing these would break document-upload generation, an AC-5 regression).
- `norm.source === 'corpus'` → resolve the section's `regulationKey` via `resolveGovernedRegulations({ keys:[key], pin, eligibleOnly:true })`; if it returns empty (stale / vanished pin) → `409 { error: 'norm section version is stale — re-sync or pin an available version' }`. On a hit, proceed with the section text (the text stays the payload; the gate governs *which version* may feed generation).

Add a failing test first for both branches (upload passes, stale corpus 409s, current corpus proceeds). Add optional `pin` to `GenerateBodySchema`.
- [ ] **Step 5: Run — verify pass.**
- [ ] **Step 6: Full server suite regression** · Run: `npm test -w @thearchitect/server` · Expected: all green (baseline + new).
- [ ] **Step 7: Typecheck** · Run: `npm run build -w @thearchitect/server` · Expected: tsc clean.
- [ ] **Step 8: Commit** · `git commit -am "feat(the-422): gate AI-Match + requirement generation through governedRetrieval (AC-4 complete)"`

---

## Definition of Done (maps to ACs)

- [ ] AC-1: `governedQuery` + `resolveGovernedRegulations` accept `pin` + `eligibleOnly` (default true). *(Chunks 1-2)*
- [ ] AC-2: stale chunk dropped + `staleDropped` counter, reused telemetry style. *(Chunk 2; gated by Chunk 0)*
- [ ] AC-3: pin serves exact Mongo version, never Qdrant. *(Chunks 1-2)*
- [ ] AC-4: all 6 consumers route through the module; no direct `queryDocuments`/legacy `Regulation.find()` in a retrieval path. *(Chunks 3-4)* — verify with `grep -rn "queryDocuments(" packages/server/src/services` returning only `governedRetrieval.service.ts`.
- [ ] AC-5: regression green for current corpora; pin + stale tests pass; `npm test -w @thearchitect/server` + `npm run build` clean. *(all chunks)*

## Handoff seams (for the next REQs)

- THE-423 (ContextTrace): `governedQuery`/`resolveGovernedRegulations` already compute the resolved `{regulationKey, versionHash}` set — return/emit it so THE-423 persists the Evidence Bundle. Do not persist here.
- THE-426 (Staged Ingest): when a `status: 'published'` field lands on the corpus schema, tighten `eligibleOnly` from "current version" to "current AND published" in one place (this module).
