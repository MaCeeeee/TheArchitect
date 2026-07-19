# THE-423 ContextTrace — Kontext-Audit-Trace pro AI-Output (Evidence Bundle) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder AI-Aufruf mit Korpus-/RAG-Kontext (und der graph-basierte Oracle) erzeugt einen append-only `ContextTrace` — welche Norm-Versionen über welchen Retrieval-Pfad mit welchem Modell/Prompt konsumiert wurden — und jede Output-Persistenz trägt eine optionale `contextTraceId`, sodass rückwärts belegbar ist, worauf eine Maschinen-Aussage beruht (Trust-Spine / Evidence Bundle, Paper §9).

**Architecture:** Ein neuer append-only `ContextTrace`-Mongo-Layer + best-effort Recorder (`contextTrace.service.ts`, spiegelt `aiTrace.service.ts`). Die drei governedRetrieval-Lesefunktionen bekommen **getracte Wrapper**, die aus dem per-Call gehaltenen Treffer-Set das `consumed[]` bauen, den Trace persistieren und die `contextTraceId` zurückgeben — Call-Sites reichen die ID nur durch und stempeln sie auf ihren Output (AC-2). Oracle (kein Korpus-Read) persistiert erstmals seinen In-Memory-`_audit` über denselben Recorder (AC-4). Reverse-Lookup-Query über einen Multikey-Index (AC-5) und ein `llmTraceRef`-Join auf `AiTrace.requestId` (AC-6) schließen das Bundle. Alles rein additiv.

**Tech Stack:** TypeScript (packages/shared, server, client), Mongoose, Express, Neo4j (Cypher node-props für die Graph-Generatoren), Jest (server), Vitest (client).

**RVTM:** docs/superpowers/rvtm/2026-07-19-the-423-contexttrace-rvtm.md

**Linear:** THE-423 (REQ-CTXGOV-001.2), Parent THE-420, Score 82,9.

---

## Design-Entscheidungen & Grenzen (VOR den Tasks lesen — hier steckt das Urteil)

**DD-1 — AC-2-Naht (getracte Wrapper statt Signaturbruch).** Die drei bestehenden Lesefunktionen (`resolveGovernedRegulations`→`View[]`, `governedQuery`→`QueryResult`, `governedCorpusSearch`→`CorpusHit[]`) bleiben **unverändert** (kein Risiko für Nicht-Konsumenten-Aufrufer). Neu je Funktion ein getracter Wrapper in `governedRetrieval.service.ts`, der intern liest, aus dem gehaltenen Set `consumed[]` baut, `recordContextTrace` ruft und `{data, contextTraceId}` zurückgibt:
- `tracedResolveGovernedRegulations(input & TraceCtx) → {views, contextTraceId}` — `retrievalMethod:'direct'`, kein Score.
- `tracedGovernedQuery(input & TraceCtx) → {result, contextTraceId}` — `retrievalMethod:'dense'`, Key/Hash aus `metadata` via bestehende `keyOf`/`hashOf`, `score` vom Chunk.
- `tracedGovernedCorpusSearch(input & TraceCtx) → {hits, contextTraceId}` — `retrievalMethod:'dense'`, Key/Hash/Score direkt vom `CorpusHit`.
`TraceCtx = { feature, userId?, model?, promptVersion?, llmTraceRef? }`. So lebt das Trace-Bauen zentral in governedRetrieval; Call-Sites reichen nur die ID durch.

**DD-2 — Oracle (AC-4) ist audit-flavored, nicht korpus-flavored.** `oracle.service.ts` liest **keinen** Korpus (Kontext = Neo4j-Graph). Sein heute in-memory verworfener `_audit` ({systemPrompt, rawResponse, architectureContext, modelParams}) wird erstmals persistiert — als `ContextTrace` mit `feature:'oracle'`, `consumed:[]`, und einem optionalen `audit`-Feld (NICHT auf 4000 Zeichen gekappt — dies ist Source-of-Truth, anders als `AiTrace.rawResponse`). Direkter `recordContextTrace`-Call im Oracle-Flow, kein governedRetrieval.

**DD-3 — Gap: Trace am Roh-Read, KEINE governed-Umroutung (revidiert in Umsetzung).** `compliance-gaps.service.ts` liest roh `Regulation.find({_id:{$in}})` (ungoverned) und **persistiert keinen Output** (gibt nur einen Report zurück). Da es nichts zu stempeln gibt, wäre eine governed-Umroutung (Version-Gating = Verhaltensänderung) reines Risiko ohne Gegenwert. Daher: **direkter `recordContextTrace(feature:'gap', consumed=aus den gelesenen Regs mit key+hash)`**, `contextTraceId` in der Report-Response zurückgeben, kein Model-Stempel, keine Retrieval-Semantik-Änderung. Regs ohne key/versionHash werden übersprungen (defensiv). Ursprünglicher governed-Ansatz verworfen — der „Fallback" ist jetzt der Hauptweg.

**DD-4 — Neo4j-Generatoren stempeln auf Knoten-Props.** activity/connection/process/dataobject persistieren nach Neo4j (`ArchitectureElement`), nicht Mongo. Der Generator erzeugt beim `tracedGovernedQuery` die `contextTraceId` und gibt sie mit seinen Vorschlägen zurück; die Apply-Route setzt sie als Knoten-Property `contextTraceId` (neben dem bestehenden `provenance='ai_generated'`).

**DD-5 — AC-6-Join nur wo `recordAiTrace` existiert.** `ContextTrace.llmTraceRef` = die von `recordAiTrace` zurückgegebene `requestId`, durchgereicht dort, wo im selben Flow bereits ein AiTrace entsteht: **nur `mapping` (direkt) und `discovery` (via `lawJudge`)**. Alle übrigen Konsumenten **ohne** AiTrace — `reqgen`, **`gap`** (liest ungoverned, ruft keinen Judge/recordAiTrace), `oracle`, `rag`, die 4 Generatoren — lassen `llmTraceRef` leer; das Nachrüsten ist **THE-384-Scope, nicht THE-423**. Explizite Grenze. (Korrektur ggü. Erstentwurf: gap hat KEINEN AiTrace.)

**DD-6 — rag-query trace-t, stempelt aber nichts.** Pass-through-Read ohne Output-Persistenz: erzeugt `ContextTrace` (`feature:'rag-query'`), gibt `contextTraceId` in der Response zurück.

**DD-7 — Append-only pragmatisch.** Wir schreiben ausschließlich per `create`; keine Update/Delete-Pfade im Service. Mongoose erzwingt es nicht hart — die Disziplin liegt im Service (kein `findOneAndUpdate`/`deleteOne` auf `ContextTrace`).

**Explizit OUT (additiv später, nicht in THE-423):** recordAiTrace für reqgen/oracle/rag/Generatoren nachrüsten (THE-384) · `provisionKind`-Befüllung (THE-421 — der Trace *zeigt* es via `sectionRef`, berechnet es nicht) · REGDIFF-Re-Assess-Logik (THE-308; wir liefern nur die Reverse-Lookup-Grundlage) · Checkpoint-Nummern (`checkpointNo` bleibt optionales Feld, ungefüllt bis Eval-Checkpoints existieren).

---

## File Structure

**Neu:**
- `packages/shared/src/types/context-trace.types.ts` — `ContextTraceFeature`, `RetrievalMethod`, `ConsumedRef`, `ContextTraceRecord`, `TraceCtx`.
- `packages/server/src/models/ContextTrace.ts` — append-only Mongoose-Model.
- `packages/server/src/services/contextTrace.service.ts` — `recordContextTrace` (best-effort, env-gated) + `findOutputsByRegulation` (AC-5).
- `packages/server/src/services/contextTrace.service.test.ts`, `packages/server/src/models/ContextTrace.test.ts`.

**Modifiziert (additiv):**
- `packages/server/src/services/governedRetrieval.service.ts` — 3 getracte Wrapper (DD-1).
- Konsumenten-Services: `lawDiscovery.service.ts`, `complianceMapping.service.ts`, `requirementGenerator.service.ts`, `compliance-gaps.service.ts`, `oracle.service.ts`, `activityGenerator.service.ts`, `connectionSuggestion.service.ts`, `processGenerator.service.ts`, `dataObjectGenerator.service.ts`.
- Routen: `rag.routes.ts`, `aiGenerator.routes.ts`, `architecture.routes.ts`, `requirements.routes.ts`, `oracle.routes.ts`, `compliance.routes.ts` (AC-5-Endpoint).
- Modelle (optionales `contextTraceId?`): `ComplianceMapping.ts`, `ComplianceRequirement.ts`, `LawDiscoveryFinding.ts`, `OracleAssessment.ts`.
- Client: `services/api.ts` (`getContextTrace`, `getRegulationImpact`), `components/compliance/ApplicabilityCheck.tsx` (Evidence-Expander), `components/oracle/OraclePanel.tsx` (Audit-Trace-View).
- Shared types der Konsumenten-Outputs (`DiscoveryFinding` etc.) um `contextTraceId?`.

---

## Phase 0 — Fundament: Typen, Model, Recorder

### Task 1: Shared-Typen für ContextTrace

**Files:**
- Create: `packages/shared/src/types/context-trace.types.ts`
- Modify: `packages/shared/src/index.ts` (Export ergänzen, dem bestehenden Muster folgend)

- [ ] **Step 1: Typen schreiben**

```ts
export type ContextTraceFeature =
  | 'discovery' | 'mapping' | 'reqgen' | 'gap' | 'oracle'
  | 'activity' | 'connection' | 'process' | 'dataobject' | 'rag-query';

export type RetrievalMethod = 'direct' | 'selector' | 'dense';

export interface ConsumedRef {
  regulationKey: string;
  versionHash: string;
  sectionRef?: string;        // z.B. eId/paragraphNumber, für provisionKind-Anzeige (THE-421 füllt Typ später)
  retrievalMethod: RetrievalMethod;
  score?: number;
  citedByJudge?: boolean;     // discovery: lag vor UND wurde vom Judge zitiert (Kern-Diagnose "Art.16 statt Art.2")
  checkpointNo?: number;      // reserviert (Eval-Checkpoints), bleibt vorerst leer
}

export interface ContextAuditPayload {   // nur oracle (AC-4)
  systemPrompt?: string;
  rawResponse?: string;
  architectureContextRef?: string;
  modelParams?: Record<string, unknown>;
}

export interface ContextTraceRecord {
  requestId: string;
  feature: ContextTraceFeature;
  projectId: string;
  userId?: string;
  consumed: ConsumedRef[];
  model?: string;
  promptVersion?: string;
  llmTraceRef?: string;       // AiTrace.requestId (AC-6), nur wo ein AiTrace existiert
  audit?: ContextAuditPayload;
  evidenceSetHash?: string;
  createdAt?: string;
}

export interface TraceCtx {
  feature: ContextTraceFeature;
  userId?: string;
  model?: string;
  promptVersion?: string;
  llmTraceRef?: string;
}
```

- [ ] **Step 2: Build shared** — Run: `npm run build -w @thearchitect/shared` · Expected: PASS (Typen exportiert). Bei Kaltstart siehe [[reference_client_tsc_cold_fail]]: shared clean bauen.
- [ ] **Step 3: Commit** — `git add packages/shared && git commit -m "feat(THE-423): shared ContextTrace types"`

### Task 2: ContextTrace-Model (append-only) + Test

**Files:**
- Create: `packages/server/src/models/ContextTrace.ts`
- Test: `packages/server/src/models/ContextTrace.test.ts`

- [ ] **Step 1: Failing test** — Schema erlaubt Minimal-Doc (feature+projectId+requestId+consumed:[]), Multikey-Index auf `consumed.regulationKey`+`consumed.versionHash` existiert, `audit` ist ungekappt (>4000 Zeichen erlaubt, im Gegensatz zu AiTrace).

```ts
it('persists a corpus-less oracle trace with uncapped audit', async () => {
  const big = 'x'.repeat(9000);
  const doc = await ContextTrace.create({
    requestId: 'r1', feature: 'oracle', projectId: new Types.ObjectId(),
    consumed: [], audit: { rawResponse: big },
  });
  expect(doc.audit!.rawResponse!.length).toBe(9000);
});
it('indexes consumed for reverse-lookup', () => {
  const idx = ContextTrace.schema.indexes().map(i => JSON.stringify(i[0]));
  expect(idx).toContain(JSON.stringify({ 'consumed.regulationKey': 1, 'consumed.versionHash': 1 }));
});
```

- [ ] **Step 2: Run, verify fail** — `npm test -w @thearchitect/server -- ContextTrace.test` · Expected: FAIL (model fehlt).
- [ ] **Step 3: Implement model** — Interface `IContextTrace` + Schema. `consumed` als Subdoc-Array (`_id:false`) mit den `ConsumedRef`-Feldern; `feature` enum; `audit` als frei-getyptes Subdoc ohne `maxlength`; `evidenceSetHash?`. Indizes: `{projectId:1, feature:1, createdAt:-1}`, `{'consumed.regulationKey':1, 'consumed.versionHash':1}`, `{requestId:1}`. `timestamps:{createdAt:true, updatedAt:false}` (append-only). Precedent für optionale Subdocs: `LawDiscoveryFinding.ts:83-84`. **Feldname-Alias (AC-1):** Die Spec nennt das Identitätsfeld `traceId`; wir persistieren es als `requestId` (spiegelt `AiTrace`, ermöglicht den `llmTraceRef`-Join über eine gemeinsame ID) und stempeln es auf Outputs als `contextTraceId`. Alias hier bewusst — im Interface-Doc-Kommentar festhalten: `requestId` = der AC-1-`traceId`.
- [ ] **Step 4: Run, verify pass** — Expected: PASS.
- [ ] **Step 5: Commit** — `git add packages/server/src/models/ContextTrace.* && git commit -m "feat(THE-423): append-only ContextTrace model"`

### Task 3: recordContextTrace-Recorder (best-effort) + Test

**Files:**
- Create: `packages/server/src/services/contextTrace.service.ts`
- Test: `packages/server/src/services/contextTrace.service.test.ts`

- [ ] **Step 1: Failing test** — `recordContextTrace` (a) gibt eine `requestId` zurück (übergeben oder generiert), (b) schreibt nie, wenn `CONTEXT_TRACING_ENABLED` aus/Mongo nicht ready (best-effort), (c) wirft nie bei DB-Fehler. Spiegel: `aiTrace.service.ts:66-102`.

```ts
it('returns provided requestId and never throws when tracing disabled', async () => {
  process.env.CONTEXT_TRACING_ENABLED = 'false';
  const id = await recordContextTrace({ requestId: 'r9', feature: 'rag-query', projectId, consumed: [] });
  expect(id).toBe('r9');
  expect(await ContextTrace.countDocuments()).toBe(0);
});
```

- [ ] **Step 2: Verify fail** · **Step 3: Implement** — `recordContextTrace(input): Promise<string>` mirror von `recordAiTrace`: env-gate `isContextTracingEnabled()` (default = `AI_TRACING_ENABLED`), `mongoose.connection.readyState===1`, try/catch best-effort, gibt `input.requestId ?? randomUUID()` zurück (auch wenn deaktiviert). **Step 4: Verify pass** · **Step 5: Commit**.

---

## Phase 1 — governedRetrieval-Naht (AC-2)

### Task 4: Drei getracte Wrapper + Test

**Files:**
- Modify: `packages/server/src/services/governedRetrieval.service.ts` (nach den bestehenden Exporten)
- Test: `packages/server/src/services/governedRetrieval.trace.test.ts`

- [ ] **Step 1: Failing test** — `tracedGovernedCorpusSearch({...,feature:'discovery'})` gibt `{hits, contextTraceId}` zurück UND schreibt einen `ContextTrace` mit `consumed` = die Hits (key+hash+score, `retrievalMethod:'dense'`). `tracedGovernedQuery` extrahiert key/hash aus `metadata`. `tracedResolveGovernedRegulations` setzt `retrievalMethod:'direct'`, kein score.

```ts
it('records consumed set from corpus hits', async () => {
  const { hits, contextTraceId } = await tracedGovernedCorpusSearch({ projectId, text: 'x', topK: 5, feature: 'discovery' });
  const t = await ContextTrace.findOne({ requestId: contextTraceId });
  expect(t!.consumed.map(c => c.regulationKey)).toEqual(hits.map(h => h.regulationKey));
  expect(t!.consumed[0].retrievalMethod).toBe('dense');
});
```

- [ ] **Step 2: Verify fail** · **Step 3: Implement** — je Wrapper: underlying-Funktion rufen, `consumed[]` aus dem Ergebnis mappen (für `governedQuery`: `keyOf`/`hashOf` aus `metadata`, `governedRetrieval.service.ts:149-152`), `recordContextTrace({feature, userId, model, promptVersion, llmTraceRef, projectId, consumed})`, `contextTraceId` = Rückgabe. **WICHTIG (Non-Law-Chunks):** `governedQuery` reicht auch Nicht-Norm-Chunks durch → `keyOf`/`hashOf` sind dort `undefined`. Vor dem Mapping auf `ConsumedRef` **filtern**: nur Chunks mit definiertem `regulationKey` UND `versionHash` aufnehmen (sonst `consumed`-Einträge mit undefined Pflichtfeldern). Test-Assertion dafür ergänzen. **Step 4: Verify pass** · **Step 5: Commit**.

---

## Phase 2 — Korpus-Konsumenten (Mongo-Outputs)

> **Umsetzungs-Verfeinerung (aus Task 6 gelernt):** mapping/reqgen/gap lesen den Korpus **upstream in der Route** (batch), nicht im Service — die zu tracende Regulation liegt beim Persist bereits in der Hand. Daher NICHT den `tracedResolveGovernedRegulations`-Wrapper (der würde einen redundanten Zweit-Read auslösen), sondern **direkt `recordContextTrace(...)`** mit `consumed[]` aus der schon-resolvten Regulation (`retrievalMethod:'direct'`) — dasselbe Muster wie discovery. Der Wrapper bleibt den Neo4j-Generatoren (Phase 3) + rag (Phase 5), die selbst `governedQuery` rufen.
> Muster je Task: direkter `recordContextTrace` → `contextTraceId` erhalten → optionales `contextTraceId?` aufs Output-Model (+ shared type wo serialisiert) → beim Persist stempeln → `llmTraceRef` durchreichen wo AiTrace existiert (DD-5).

### Task 5: discovery — LawDiscoveryFinding + citedByJudge

**Files:** `lawDiscovery.service.ts` (~L78 Read, ~L190-247 Loop/Persist), `models/LawDiscoveryFinding.ts` (`contextTraceId?`), `services/lawDiscoveryFinding.service.ts` (Upsert-Input), `packages/shared/src/types/law-discovery.types.ts` (`DiscoveryFinding.contextTraceId?`).

- [ ] **Step 1: Failing test** — nach `discoverAndJudge` trägt das persistierte Finding eine `contextTraceId`; der zugehörige `ContextTrace.consumed` hat `citedByJudge:true` genau für die `verdict.keyParagraphs`.
- [ ] **Step 2: Verify fail** · **Step 3: Implement** — Read über `tracedGovernedCorpusSearch(feature:'discovery')`. Nach dem Judge je `consumed`-Eintrag `citedByJudge = verdict.keyParagraphs.includes(regulationKey)` setzen (zweiter, angereicherter Trace-Write ODER Trace erst nach Judge schreiben — bevorzugt: Trace nach Judge im L190-Loop, wo topHits + verdict beide in scope sind). `llmTraceRef` = die `requestId` aus `lawJudge`s `recordAiTrace` (Rückgabe durchreichen). `contextTraceId` in `toUpsert` (L234). Additives `contextTraceId?` auf Model (Precedent L83-84) + shared type. **Step 4: Verify pass** · **Step 5: Commit**.

### Task 6: mapping — ComplianceMapping

**Files:** `complianceMapping.service.ts` (Read L153, bulkWrite L521, recordAiTrace L179/L346), `models/ComplianceMapping.ts` (`contextTraceId?`, Precedent L68-70).

- [ ] **Step 1: Failing test** — gemappte Docs tragen `contextTraceId`; `ContextTrace.llmTraceRef` == die `recordAiTrace`-`requestId` desselben Laufs (AC-6-Join greift).
- [ ] **Step 2-5:** Read über `tracedResolveGovernedRegulations(feature:'mapping', llmTraceRef: requestId)`. `requestId` von `recordAiTrace` (L179) zuerst erzeugen, dann als `llmTraceRef` reingeben (Reihenfolge: AiTrace-requestId bestimmen → ContextTrace verlinken). `contextTraceId` in den bulkWrite-`$set`. Commit.

### Task 7: reqgen — ComplianceRequirement

**Files:** `requirementGenerator.service.ts` (Read L154), `routes/requirements.routes.ts` (bulkWrite L293), `models/ComplianceRequirement.ts` (`contextTraceId?`, Precedent optionale Felder L63/64).

- [ ] **Step 1: Failing test** — generierte Requirements tragen `contextTraceId`; `llmTraceRef` bleibt leer (DD-5, reqgen hat kein AiTrace).
- [ ] **Step 2-5:** Read über `tracedResolveGovernedRegulations(feature:'reqgen')`. `contextTraceId` vom Service bis zur Confirm-Route durchreichen (im Generierungs-Response mitgeben, beim bulkWrite L293 stempeln). Commit.

### Task 8: gap — direkter Trace am Roh-Read (DD-3 revidiert)

**Files:** `compliance-gaps.service.ts` (Roh-Read ~L104; `computeComplianceGaps` ~L75); ggf. der Report-Rückgabetyp (`contextTraceId?` ergänzen); Gap-Route wo der Report rausgeht.

- [ ] **Step 1: Failing test** — nach `computeComplianceGaps` (`CONTEXT_TRACING_ENABLED='true'`) wird ein `ContextTrace(feature:'gap')` geschrieben, dessen `consumed` die gelesenen Regulationen (nur die mit `regulationKey`+`versionHash`) trägt; der zurückgegebene Report enthält die `contextTraceId`. Gap-**Ausgabe** (die Gap-Menge) bleibt unverändert (Roh-Read unangetastet).
- [ ] **Step 2: Verify fail** · **Step 3: Implement** — Roh-Read `Regulation.find(...)` BEHALTEN; danach `recordContextTrace({feature:'gap', projectId, consumed: regs.filter(r=>r.regulationKey&&r.versionHash).map(r=>({regulationKey:r.regulationKey, versionHash:r.versionHash, retrievalMethod:'direct'}))})`; `contextTraceId` in den Report. `llmTraceRef` unset (DD-5). **Step 4: Verify pass** · **Step 5: Commit**.

---

## Phase 3 — Neo4j-Generatoren (Knoten-Props, DD-4)

### Task 9: activity/connection/process/dataobject — contextTraceId auf ArchitectureElement

**Files:** `activityGenerator.service.ts:269`, `connectionSuggestion.service.ts:388`, `processGenerator.service.ts:150`, `dataObjectGenerator.service.ts:278` (Reads); Apply-Routen `aiGenerator.routes.ts` (L190-226/L295/L767), `architecture.routes.ts:1070` (Cypher SET); ggf. Client-Apply-Payloads.

**Ticket-Intention (bewusst leicht):** Das Ticket listet „4 Generator-Services (je 1–3 Zeilen)" — Kern = jeder Generator **swap `governedQuery` → `tracedGovernedQuery(feature:<name>)`**, wodurch der `ContextTrace` (consumed = gelesene Chunks) automatisch entsteht. Das ist der Pflicht-Teil und erfüllt „jeder Korpus-Konsument erzeugt einen Trace".

**Node-Stempel (best effort, nicht erzwingen):** Die `contextTraceId` entsteht zur Generier-Zeit; das Apply ist oft eine separate Route nach Client-Roundtrip. Node-Stempeln NUR dort, wo die `contextTraceId` am Knoten-Erzeugungspunkt **ohne Client-Änderung** verfügbar ist (z.B. generate+apply im selben Handler, oder das Vorschlags-Objekt trägt die ID schon durch bestehende Felder). Wo es einen echten Client-Round-Trip bräuchte: **nur Trace aufzeichnen, Node-Stempel als dokumentierter Follow-up** — kein fragiles Payload-Threading durch den Client erzwingen. Der Implementer berichtet je Generator, ob gestempelt wurde.

- [ ] **Step 1 (activity):** Read→`tracedGovernedQuery(feature:'activity')`; Test: `ContextTrace(feature:'activity', retrievalMethod:'dense')` wird geschrieben; falls Knoten-Stempel sauber → assert Node-Property; sonst Follow-up notieren. Implement + verify + commit.
- [ ] **Step 2 (connection):** analog `feature:'connection'` (Heal-Pfad `connectionSuggestion.service.ts:388` / `architecture.routes.ts:1070`) — eigener Test, commit.
- [ ] **Step 3 (process):** analog `feature:'process'` (`processGenerator.service.ts:150` / `aiGenerator.routes.ts:767`) — eigener Test, commit.
- [ ] **Step 4 (dataobject):** analog `feature:'dataobject'` (`dataObjectGenerator.service.ts:278` / `aiGenerator.routes.ts:295`) — eigener Test, commit.

Vier separate Read→Trace-Pfade — **je eigener Test + Commit** (Reviewer-Fund #7). Node-Stempel wo sauber; sonst dokumentierter Follow-up. Task 12 (AC-5) behält den Neo4j-Zweig (matcht leer, falls (noch) keine Knoten gestempelt sind — harmlos, zukunftssicher).

---

## Phase 4 — Oracle-Audit (AC-4, DD-2)

### Task 10: Oracle _audit erstmals persistieren + OracleAssessment.contextTraceId

**Files:** `oracle.service.ts` (`_audit` L25-30/L296/L355-460), `routes/oracle.routes.ts` (create L81), `models/OracleAssessment.ts` (`contextTraceId?`, Precedent L18).

- [ ] **Step 1: Failing test** — nach einer Assessment-Persistenz existiert ein `ContextTrace(feature:'oracle', consumed:[])` mit `audit.systemPrompt/rawResponse/modelParams` (ungekappt), und `OracleAssessment.contextTraceId` verweist darauf.
- [ ] **Step 2: Verify fail** · **Step 3: Implement** — im Oracle-Flow (wo `auditReport` aggregiert wird, L355-460) statt Verwerfen: `recordContextTrace({feature:'oracle', projectId, consumed:[], audit:{...}, model, promptVersion})`; `contextTraceId` in `OracleAssessment.create` (routes L81). `_audit` bleibt für den bestehenden transienten `auditReport` erhalten (kein Refactor der Verdikt-Rückgabe). **Step 4: Verify pass** · **Step 5: Commit**.

---

## Phase 5 — rag-query (DD-6) + Reverse-Lookup (AC-5)

### Task 11: rag-query trace-t + gibt contextTraceId zurück

**Files:** `routes/rag.routes.ts:111`.

- [ ] **Step 1: Failing test** — `POST /rag/...` Antwort enthält `contextTraceId`; ein `ContextTrace(feature:'rag-query')` existiert.
- [ ] **Step 2-5:** Read → `tracedGovernedQuery(feature:'rag-query', userId)`; `contextTraceId` der Response beifügen (kein Output-Model). Commit.

### Task 12: findOutputsByRegulation + Impact-Endpoint (AC-5)

**Files:** `contextTrace.service.ts` (`findOutputsByRegulation`), `routes/compliance.routes.ts` (neuer `GET /:projectId/regulations/impact`).

- [ ] **Step 1: Failing test** — `findOutputsByRegulation(projectId, key, versionHash)` findet über den Multikey-Index alle Traces und joint auf die gestempelten Outputs, gruppiert nach `feature`. **Deckung (Reviewer-Fund #2 + #5):** (a) Mongo-Outputs: `ComplianceMapping`, `ComplianceRequirement`, `LawDiscoveryFinding`. (b) **Neo4j-Outputs**: die 4 Generator-Elemente per Cypher `MATCH (e:ArchitectureElement) WHERE e.contextTraceId IN $ids` — sonst fehlen activity/connection/process/dataobject stillschweigend. (c) **Oracle NICHT** im Regulation-Join: Oracle-Traces haben `consumed:[]` (kein `regulationKey`) → können per `consumed.regulationKey`-Query nie matchen; Oracle ist nur per `traceId` erreichbar, nicht per Norm. Test darf `oracleAssessments` hier NICHT erwarten.
- [ ] **Step 2: Verify fail** · **Step 3: Implement** — Query `ContextTrace.find({'consumed.regulationKey':key,'consumed.versionHash':versionHash, projectId})` → traceIds → parallel: `find({contextTraceId:{$in}})` je Mongo-Model **+** ein Cypher-`MATCH` auf `ArchitectureElement`-Knoten mit `contextTraceId IN $ids`. Endpoint dünn: `authenticate`, ruft Service, gibt `{affected: {mappings, requirements, findings, elements}}`. Das ist die REGDIFF/Drift-Grundlage (THE-308), NICHT die Re-Assess-Logik. **Step 4: Verify pass** · **Step 5: Commit**.

---

## Phase 6 — Client-Sichtbarmachung

### Task 13: normsAPI/api.ts — getContextTrace + getRegulationImpact

**Files:** `packages/client/src/services/api.ts` (~L408 normsAPI-Block).

- [ ] **Step 1: Failing test (vitest)** — `normsAPI.getContextTrace(projectId, traceId)` und `getRegulationImpact(projectId, key, hash)` rufen die richtigen Endpunkte (mock via `vi.mock`, vgl. [[reference_client_tsc_cold_fail]] — Client nutzt Vitest).
- [ ] **Step 2-5:** Methoden ergänzen, dem bestehenden `normsAPI`-Muster folgend. Commit.

### Task 14: ApplicabilityCheck — „Paragraphs the judge reviewed"-Expander

**Files:** `packages/client/src/components/compliance/ApplicabilityCheck.tsx` (Corpus-Evidence-Block L315-380), shared `DiscoveryFinding`/`corpus`-Typ (`contextTraceId?`).

- [ ] **Step 1: Failing test (vitest)** — bei vorhandener `corpus.contextTraceId` rendert ein aufklappbarer Block; nach Expand werden die vorgelegten §§ (Titel+Score) gelistet, **zitierte hervorgehoben** (`citedByJudge`).
- [ ] **Step 2-5:** Lazy-Fetch per `getContextTrace` (spiegelt `toggleRejected`-Muster L139-154), Block direkt nach den keyParagraph-Chips (L342). Macht „Art.16 statt Art.2" sichtbar — der Kernnutzen. Commit.

### Task 15: OraclePanel — Audit-Trace-View

**Files:** `packages/client/src/components/oracle/OraclePanel.tsx`.

- [ ] **Step 1: Failing test (vitest)** — bei `assessment.contextTraceId` rendert ein „Evidence / Audit"-Abschnitt (model, promptVersion; rawResponse hinter Expand).
- [ ] **Step 2-5:** Lazy-Fetch `getContextTrace`, dezenter Audit-Block (dark theme, Palette). Commit.

---

## Phase 7 — Abschluss

### Task 16: Volle Verifikation

- [ ] **Step 1:** `npm test -w @thearchitect/server` (Server-Suiten; bekannte flaky Integrations-Suiten vgl. [[reference_server_test_flaky_suites]] ignorieren, keine neuen Rotfärbungen).
- [ ] **Step 2:** `npm test -w @thearchitect/client` (Vitest).
- [ ] **Step 3:** TSC ×3 — `npm run build -w @thearchitect/shared && -w @thearchitect/server && -w @thearchitect/client`.
- [ ] **Step 4:** Manuelle Env-Notiz: `CONTEXT_TRACING_ENABLED` in `.env.example` dokumentieren (default aus; Aktivierung analog `AI_TRACING_ENABLED`). Prod-Mapping in `docker-compose.prod.yml` (vgl. [[progress_uc_law_track]] Env-Mapping-Learning) — separater Deploy-Schritt, NICHT im Code-PR.
- [ ] **Step 5:** Final code-reviewer über den gesamten Branch.

---

## Verifikationsstrategie

- **Unit** (Jest): Model-Constraints, Recorder best-effort/env-gate, 3 Wrapper consumed-Mapping, citedByJudge-Ableitung, findOutputsByRegulation-Join, Gap-Regression.
- **Component** (Vitest): Expander (discovery), Oracle-Audit-View, api.ts-Methoden.
- **Integration**: end-to-end je Konsument (Read→Trace→stamped Output) — wo bestehende Integrations-Suiten es hergeben; sonst Service-Level.
- **Append-only-Disziplin**: Grep-Guard im Review — kein `updateOne`/`findOneAndUpdate`/`deleteOne`/`deleteMany` gegen `ContextTrace`.
- **Additiv-Beleg**: alle neuen Model-Felder optional (`default: undefined`); Alt-Docs bleiben gültig; kein Migrationszwang.
