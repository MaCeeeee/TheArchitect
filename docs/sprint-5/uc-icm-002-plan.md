# UC-ICM-002 — LLM-driven Compliance Mapping (W2 Implementation Plan)

**Sprint:** W2 (26.05.–01.06.2026)
**BSH-Demo:** 14.06.2026
**Linear:** [THE-273](https://linear.app/thearchitect/issue/THE-273)
**Pre-Flight:** 2026-05-22 (Patterns verifiziert: activityGenerator + elementSimilarity)
**Status:** Plan-ready

## TL;DR

Für jeden Regulation-Paragraph (UC-ICM-001) bestimmt das System automatisch via 2-Stufen-Pipeline (Semantic-Recall via Qdrant + LLM-Re-Ranking via Anthropic Haiku 4.5), welche ArchiMate-Elemente (Capabilities, Apps, Data Objects) betroffen sind. Persistiert als `ComplianceMapping`-Dokument. Foundation für UC-ICM-003 Reverse-Lookup + Heat-Map.

## Architektur

```
trigger: POST /api/projects/:id/compliance/mappings/auto { regulationIds? }
   ↓ Server A backend (auth + audit)
   ↓ For each Regulation:
   │
   ├─ Stage 1: Semantic Recall (schnell, Qdrant)
   │    qdrant.search(regulations-{projectId}, regulation.embedding, topK=20)
   │    → 20 Element-Kandidaten mit Cosine-Score
   │
   ├─ Stage 2: LLM Re-Ranking (genau, Anthropic Haiku 4.5)
   │    Prompt = Regulation-Volltext + 20 Element-Beschreibungen
   │    Response = ComplianceMappingSchema (Zod) →
   │      [{ elementId, confidence ∈ [0,1], reasoning ≤200 chars }]
   │      ≤ 5 Mappings pro Regulation
   │
   └─ Stage 3: Filter + Upsert
        drop confidence < 0.5
        ComplianceMapping.upsertMany() via Compound-Index
        (projectId, regulationId, elementId) → idempotent
```

## Day-by-Day

| Tag | Datum | Wochentag | Was | REQ |
|---|---|---|---|---|
| D1 | 26.05 | Mo | ComplianceMapping Mongoose-Model + Shared Types + Tests | [THE-278](https://linear.app/thearchitect/issue/THE-278) |
| D2 | 27.05 | Di | LLM Mapping-Service (Anthropic Haiku + Zod-Schema + Prompt-Template) | [THE-279](https://linear.app/thearchitect/issue/THE-279) |
| D3 | 28.05 | Mi | Auto-Mapping API + Batch-Endpoint + 5 Demo-Szenarien-Verifikation | [THE-280](https://linear.app/thearchitect/issue/THE-280) |
| D4 | 29.05 | Do | Integration-Tests + Performance-Tuning (< 90 Sek für 50 Regs × 10 Elements) | Cross-cutting |
| D5 | 30.05 | Fr | Production-Deploy + E2E gegen 16 Regulations × ~10 BSH-Demo-Elements | Cross-cutting |

⏸️ **Sa/So Wochenende** — danach Sprint W3 UC-ICM-003 ab Mo 02.06.

## REQ-Implementation Details

### REQ-ICM-002.1 ([THE-278](https://linear.app/thearchitect/issue/THE-278)) — ComplianceMapping Model

**Files:**
- `packages/shared/src/types/compliance.types.ts` (erweitern)
- `packages/server/src/models/ComplianceMapping.ts` (neu)
- `packages/server/src/__tests__/ComplianceMapping.model.test.ts` (neu)

**Shared-Type:**
```typescript
export interface ComplianceMappingDTO {
  _id: string;
  projectId: string;
  regulationId: string;
  elementId: string;
  elementType: 'capability' | 'application' | 'data_object' | 'business_process' | 'business_actor' | string;
  confidence: number;       // ∈ [0, 1]
  reasoning: string;        // max 500 chars
  status: 'auto' | 'confirmed' | 'rejected';
  createdBy: 'llm' | 'human' | 'live-mapping';
  createdAt: string;
  updatedAt: string;
}
```

**Mongoose-Indexes:**
- Unique compound: `(projectId, regulationId, elementId)` — Upsert-Dedup
- Query: `(projectId, elementId, confidence)` desc — Reverse-Lookup
- Query: `(projectId, regulationId)` — Forward-Lookup für Heat-Map

**Tests (Jest + mongodb-memory-server):**
1. CRUD roundtrip
2. Upsert via compound index ist idempotent
3. Confidence-Validation (∈ [0,1])
4. Reasoning-Pflicht wenn `createdBy='llm'`
5. Query-Performance bei 1000 Mappings

### REQ-ICM-002.2 ([THE-279](https://linear.app/thearchitect/issue/THE-279)) — LLM Mapping-Service

**Files:**
- `packages/server/src/services/complianceMapping.service.ts` (neu)
- `packages/server/src/prompts/complianceMapping.prompt.ts` (neu — zentralisierter Prompt, A/B-fähig)
- `packages/server/src/__tests__/complianceMapping.service.test.ts` (neu, mocked Anthropic + Qdrant)

**Public API:**
```typescript
export async function mapRegulationToElements(
  regulationId: string,
  projectId: string,
): Promise<IComplianceMapping[]>;

// Für UC-ICM-003 Live-Mapping (ohne Persistierung)
export async function mapTextToElements(
  text: string,
  projectId: string,
): Promise<{
  regulation: Partial<IRegulation>;
  mappings: IComplianceMapping[];
}>;
```

**Pipeline (Implementierung):**
```typescript
async function mapRegulationToElements(regulationId, projectId) {
  // 1. Load regulation + verify it has embedding
  const reg = await Regulation.findById(regulationId);
  if (!reg.embedding) throw ...

  // 2. Qdrant: semantic-recall top-20 elements via cosine similarity
  const candidates = await qdrant.search(`elements-${projectId}`, {
    vector: reg.embedding,
    limit: 20,
    score_threshold: 0.4,
    with_payload: true,
  });

  // 3. Build LLM prompt
  const prompt = buildMappingPrompt(reg, candidates);

  // 4. Anthropic call with Zod-validated response
  const result = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2048,
  });
  const parsed = ComplianceMappingSchema.parse(extractJson(result));

  // 5. Filter + upsert
  return ComplianceMapping.bulkWrite(
    parsed.mappings
      .filter(m => m.confidence >= 0.5)
      .map(m => ({
        updateOne: {
          filter: { projectId, regulationId, elementId: m.elementId },
          update: { $set: { ...m, status: 'auto', createdBy: 'llm' } },
          upsert: true,
        },
      })),
  );
}
```

**Zod-Schema:**
```typescript
const ComplianceMappingSchema = z.object({
  mappings: z.array(z.object({
    elementId: z.string(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().max(500),
  })).max(5),
});
```

**Prompt-Template** (`packages/server/src/prompts/complianceMapping.prompt.ts`):
- System: "Du bist Compliance-Architekt. Bewerte semantische Relevanz von Gesetzestext zu System-Komponenten. Antworte mit JSON nach Schema."
- User: Strukturiert mit Regulation-Volltext + 20 Element-Beschreibungen + Schema-Erwartung
- Inspired by `activityGenerator.service.ts` `buildSystemPrompt()` Pattern

**Tests:**
- Unit (mocked Anthropic + Qdrant): Schema-Validation, Filter-Logic, Upsert-Idempotency
- Integration (mocked Anthropic, real mongodb-memory-server): bulkWrite-Verhalten
- 3 Demo-Szenarien: (a) klares Match (NIS2 Art. 21 ↔ Cybersecurity-Capability), (b) ambivalent (Art. 22 ↔ Supply-Chain-Capability), (c) kein Match
- Performance: 1 Paragraph × 20 Elemente < 3 Sek (single LLM-Call)

### REQ-ICM-002.3 ([THE-280](https://linear.app/thearchitect/issue/THE-280)) — Auto-Mapping API

**Files:**
- `packages/server/src/routes/compliance.routes.ts` (neu — separate von regulations.routes.ts)
- `packages/server/src/__tests__/compliance.routes.test.ts` (neu)
- `packages/server/src/index.ts` (mount neue Routes)

**Endpoints:**

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| `POST` | `/api/projects/:projectId/compliance/mappings/auto` | editor | `{ regulationIds?: string[] }` | `{ total, mapped, errors[] }` |
| `POST` | `/api/projects/:projectId/compliance/mappings/preview` | viewer | `{ text: string }` | `{ regulation: Partial, mappings: [...5] }` |
| `GET` | `/api/projects/:projectId/compliance/mappings/by-element/:elementId` | viewer | – | `ComplianceMappingDTO[]` |
| `GET` | `/api/projects/:projectId/compliance/mappings/by-regulation/:regulationId` | viewer | – | `ComplianceMappingDTO[]` |
| `POST` | `/api/projects/:projectId/compliance/mappings/confirm` | editor | `{ regulationId, mappings: [...] }` | persistiert + Audit |

**Acceptance Criteria:**
- AC-1 Routes authenticate-protected ✓ (via existing middleware)
- AC-2 Auto-Mapping-Batch synchron < 90 Sek für 50 Paragraphen × 10 Elemente
- AC-3 Audit-Entry für `auto` + `confirm` (action='compliance.mapping.auto', riskLevel='medium')
- AC-4 Rate-Limit für `preview`: 30 Requests/Min/User
- AC-5 5 Demo-Szenarien verifiziert: BSH-Capability × NIS2/LkSG → ≥ 0.7 Confidence

**Tests:**
- Integration-Tests mit gesehedeten 5 Regulations + 10 Elements
- Mock-Anthropic für deterministische Outputs
- Tenant-Isolation (project A's Mappings nicht sichtbar in project B)

## RVTM (Traceability)

| REQ | Implementation | Verification | Evidence |
|---|---|---|---|
| 002.1 | `packages/server/src/models/ComplianceMapping.ts` | Jest tests | CI green |
| 002.2 | `packages/server/src/services/complianceMapping.service.ts` | Unit-Tests mit mocks + integration | 3 Demo-Szenarien |
| 002.3 | `packages/server/src/routes/compliance.routes.ts` | supertest + audit-log inspection | Live E2E (D5) |

## Risiken + Mitigation

| Risiko | Wahrsch. | Impact | Mitigation |
|---|---|---|---|
| Embedding-Sidecar nicht deployed → Regulations haben kein embedding-Field, Qdrant-Recall geht nicht | hoch | hoch | **D1 zuerst: prüfen ob 16 Regulations Embeddings haben.** Falls nein: Embedding-Pipeline triggern oder Sidecar deployen (kann auch Server A lokal sein, [THE-277](https://linear.app/thearchitect/issue/THE-277) hat das vorgesehen) |
| Anthropic-Token-Budget für Batch-Crawl | mittel | mittel | Haiku 4.5 ist günstig (~$0.001 pro Mapping-Call). 50 Regulations × $0.001 = $0.05/Run |
| LLM-Halluziniert elementIds die gar nicht im Projekt sind | mittel | hoch | Post-Validation: Filter response.mappings auf `elementId IN candidateIds` |
| Reasoning ist zu lang (>500 chars) | gering | gering | Zod `.max(500)` schneidet zurück |
| Performance > 90 Sek bei Vollladen | mittel | mittel | Concurrency-Limit `MAX_CONCURRENT=5` (Pattern aus remediation.service.ts) |
| Qdrant-Collection `elements-{projectId}` existiert nicht (Element-Embeddings fehlen) | hoch | hoch | **D1: prüfen ob UC-SIM-001 elements-Collection für unsere Demo-Projects existiert.** Falls nein: Element-Embedding-Backfill nötig |

## Demo-Szenarien für Verifikation (D3 AC-5)

Vorgesehen: 5 BSH-ähnliche Demo-Elemente × 16 Regulations → mind. 5 Mappings mit ≥ 0.7 Confidence

| Element | Erwartetes Mapping mit High-Confidence |
|---|---|
| Capability "Lieferantenmanagement" | LkSG § 6 (Präventionsmaßnahmen), NIS2 Art. 21 (Cybersecurity in supply chain) |
| Capability "Datenverarbeitung B2C" | DSGVO Art. 5, 6, 32 |
| Application "ERP-System SAP" | NIS2 Art. 21 (Risk Management) |
| Application "HR-Plattform" | DSGVO Art. 9 (besondere Kategorien) |
| Data Object "Mitarbeiter-Personalakte" | DSGVO Art. 5, 6, 9; LkSG § 3 |

## Definition of Done für UC-ICM-002

- [ ] D1: ComplianceMapping-Model + Tests, [THE-278](https://linear.app/thearchitect/issue/THE-278) closed
- [ ] D2: LLM-Service + Prompt-Template + Tests, [THE-279](https://linear.app/thearchitect/issue/THE-279) closed
- [ ] D3: Auto-Mapping-API live + 5 Demo-Szenarien-Verifikation, [THE-280](https://linear.app/thearchitect/issue/THE-280) closed
- [ ] D4: Performance < 90 Sek für 50 × 10
- [ ] D5: Production-Deploy + 16 Regulations × Demo-Architecture E2E
- [ ] [THE-273](https://linear.app/thearchitect/issue/THE-273) closed

## Open Question vor D1-Start

⚠️ **Müssen wir Embedding-Sidecar deployen?** Aktuell sind unsere 16 Regulations OHNE Embedding in MongoDB (UC-ICM-001 lief mit `EMBEDDING_SERVICE_URL=""` leer). Stage 1 (Qdrant-Recall) braucht aber Embeddings.

Drei Optionen für Mo D1:
1. **Sidecar deployen** auf Server B (Python FastAPI mit all-mpnet-base-v2, analog UC-SIM-001-Stack) — ~30-60 Min Aufgabe
2. **Anthropic-Embeddings nutzen** statt sentence-transformers (Voyage AI o.ä. via API) — kostet $$, weniger Aufwand
3. **Stage 1 weglassen** für MVP — LLM bekommt ALLE Elemente eines Projekts als Kontext (klappt bei < ~30 Elementen, drüber Token-Limit)

→ Mo Vormittag entscheiden. Empfehlung: **Option 1** (Sidecar deployen), passt zu Architektur + ist Foundation für später.
