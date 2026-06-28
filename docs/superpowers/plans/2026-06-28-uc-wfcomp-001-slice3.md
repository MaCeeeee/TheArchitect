# UC-WFCOMP-001 — Slice 3 (Persistenz) Plan — corpus-aligned

> Live-Wiring auf THE-360. Stand 2026-06-28. Branch `mganzmanninfo/the-360-wfcomp-assess-slice1`.

## Kontext-Realignment (ADR-0001/0002)

Gesetzestext = kanonische Stammdaten im **Korpus** (dedizierte Mongo-Instanz), referenziert per `{regulationKey, versionHash}` — NICHT per-Projekt kopiert. Der THE-352-Seed (per-Projekt) ist das verworfene Anti-Pattern (THE-368-Migration). Konsequenz:
- **Art.-30-Spec** (7 Felder + traceTargets) = `ART30_FIELDS`-Konstante (kanonisch, in git, eine Quelle) → Trace liest die Konstante.
- **Verbatim-Text** = aus Korpus per `dsgvo:art-30-abs-1` (Referenz).
- **Gelifteter Graph** = echte Tenant-Daten → Neo4j, projekt-scoped. **Das ist Slice 3.**

## Schlüssel-Insight: Laden + reine Trace statt Cypher-Reimplementierung

THE-360 AC-2 klang nach „Trace in Cypher nachbauen". **Besser:** den gelifteten Graphen persistieren, bei Bedarf **zurück in die In-Memory-`LiftedGraph`-Form laden** und die **bewährte reine `runTraceCheck`** drauf laufen lassen. So bleibt die Trace-Logik die **einzige Source-of-Truth** (keine zweite, divergierende Cypher-Implementierung) — der Trace-DSL-Watch-Point aus der Komplexitätsbewertung wird nicht verdoppelt. Cypher schrumpft auf **Write + Read** (simple MATCH/CREATE, parametrisiert, tenant-scoped).

## Design-Entscheidungen (vor Bau bestätigen)

1. **Lifted-Attrs als Top-Level-Neo4j-Props** (nicht `metadataJson`): `role`, `thirdCountry`, `personal`, `kind`, `art32` als echte Properties → der Load-Match ist exakt (`{type:'business_role', role:'Recipient'}`), nicht stringly (`metadataJson CONTAINS`). Neo4j ist schemalos, sauber.
2. **Idempotenz-Scope:** lifted Knoten tragen `source:'wfcomp'` + `wfcompId` (Assessment-/Workflow-ID). Re-Assess = `MATCH (e {projectId, source:'wfcomp', wfcompId}) DETACH DELETE e` → neu schreiben. Scoped Delete (nur dieser Assessment-Teilgraph, nicht das ganze Projekt).
3. **Reine Trace bleibt Source-of-Truth** (Insight oben).

## Tasks (corpus-unabhängig — können jetzt gebaut werden)

### Task 3.1 — `persistLiftedGraph(projectId, wfcompId, lifted)`
- Files: `services/wfcomp/persist.ts` + test.
- Map `LiftedElement` → `CREATE (:ArchitectureElement {id, projectId, name, type, source:'wfcomp', wfcompId, provenance:'import', <attrs als Props>, createdAt, updatedAt})` (Reuse `createTemporaryGraph`-Muster + `runCypherTransaction`).
- Map `LiftedEdge` → `:CONNECTS_TO {type: rel, projectId, source:'wfcomp', wfcompId, provenance:'import'}`.
- Idempotent: scoped DETACH DELETE vorab.
- Test: `jest.mock('../config/neo4j')` (`runCypherMock`) — assert die richtigen Cypher-Ops (Delete-vor-Create, projectId/wfcompId in jedem, Attrs als Props).

### Task 3.2 — `loadLiftedGraph(projectId, wfcompId): Promise<LiftedGraph>`
- Cypher: `MATCH (e:ArchitectureElement {projectId, source:'wfcomp', wfcompId}) OPTIONAL MATCH (e)-[r:CONNECTS_TO {wfcompId}]->(t) RETURN e, r, t` → rekonstruiert `{elements, edges}` (id/type/name/attrs + rel).
- Parametrisiert (AC-7), tenant-scoped (AC-4).
- Test: mock runCypher → liefert Knoten/Kanten → korrekt rekonstruiert; danach `runTraceCheck(loaded, ART30_FIELDS)` == das Original-Verdikt (Round-Trip-Beweis).

### Task 3.3 — `WfcompAssessment` Mongo-Model (Reuse `OracleAssessment`/`ComplianceSnapshot`-Muster)
- Felder: `projectId`, `workflowName`, `wfcompId`, `gapReport` (das GapReport), `assessedBy`, `assessedAt`, **+ `regulationRef: { regulationKey, versionHash }`** ← der EINE corpus-abhängige Punkt (offen bis Sync; bis dahin aus der Konstante ableitbar: `dsgvo:art-30-abs-1` + sha256 des Verbatim).
- Audit-Eintrag bei Assess (`createAuditEntry`).
- Test: Model-Round-Trip + Tenant-Isolation.

### Task 3.4 — Route-Verdrahtung
- Assess-Route persistiert nach dem Verdikt: `persistLiftedGraph` + `WfcompAssessment.create`. Recompute-Endpoint (später, mit Attestierung) = `loadLiftedGraph` → `applyAttestation` → `runTraceCheck`.

## Was auf den Sync mit der Scraper-Session wartet (NICHT corpus-unabhängig)
- **Nur** die exakte Form von `regulationRef`: Key-Konvention (`dsgvo:art-30-abs-1` vs. `dsgvo:art-30`), ob Verbatim den Korpus seedet, Corpus-Service vs. direkte Connection für den späteren Text-Read.
- Alles andere (3.1–3.4 Mechanik) ist baubar, sobald die Design-Entscheidungen bestätigt sind.

## Risiko / Komplexität (Ousterhout)
Niedriger als gestern gedacht: keine Cypher-Trace-Reimplementierung (Load + reine Funktion). Watch-Point: die Attrs-als-Props-Map muss konsistent zwischen `persist` und `load` sein — ein gemeinsamer Mapper deckt das ab.
