---
aliases:
  - Redundancy Detector
  - UC-RED-001
  - Semantic Redundancy Detection
tags:
  - feature
  - thearchitect
  - sprint-3
  - production-live
  - compliance
  - dsgvo
  - predictive-architecture
status: production-live
sprint: 3
use_case: UC-RED-001
linear_parent: THE-244
linear_url: https://linear.app/thearchitect/issue/THE-244
deployed_at: 2026-05-16
deployed_to: https://thearchitect.site
owner: Matze Ganzmann
implementer: Claude Opus 4.7
related:
  - UC-SIM-001 (Embedding Foundation)
  - UC-HARM-001 (Cross-Project Harmonisierung — Sprint 4)
  - UC-DATA-001 V2 (Generator-D Reuse — Sprint 2)
---

# Redundancy Detector (UC-RED-001)

> [!success] Status — Production-Live seit 2026-05-16
> Alle 5 Requirements der Use Case sind deployed auf https://thearchitect.site.
> Linear-Parent: [THE-244](https://linear.app/thearchitect/issue/THE-244) — Done.

## TL;DR

TheArchitect findet **semantische Daten- und Architektur-Redundanzen** in einem Projekt — über reine Name-Matches hinaus — und lässt den Architekten die Konsolidierung **per Mausklick** durchführen. Ein Workflow, der vorher 2 Stunden Excel-Arbeit war, läuft jetzt in 30 Sekunden im Tool.

Vorteil gegenüber **LeanIX, BiZZdesign, Mega**: keiner dieser Wettbewerber bietet Embedding-basierte Redundanz-Erkennung.

---

## Das Problem

> [!quote] User-Pain (BSH-Enterprise-Architekt)
> "Wir haben in unserem ESG-Compliance-Modell vermutlich dreimal das gleiche Konzept unter verschiedenen Namen. Ich kann das aber nicht systematisch finden — VLOOKUP findet nur exakte Treffer."

**Typischer Workflow vorher:**
1. Excel-Export aller Elements
2. Manuelles Scrollen, Namen vergleichen
3. VLOOKUP (nur exakte Treffer)
4. Pro vermutetes Duplikat manuell in der UI suchen
5. Properties vergleichen, entscheiden
6. Bei Merge: jede Connection manuell umhängen, dann altes Element löschen

**Aufwand:** Mehrere Stunden für ein 60-Element-Modell, fehleranfällig, semantische Duplikate (anders benannt aber gleiches Konzept) bleiben unentdeckt.

---

## Was der Architekt jetzt tun kann

### 1️⃣ Sehen — 3 Sekunden

- 3D-View → **GitMerge-Icon** in der Toolbar
- Modal `🔁 Redundancy Detector` öffnet sich
- Backend scannt Projekt mit Embedding-Similarity
- Liste erscheint, im **BSH-ESG-Demo: 20 Pair-Kandidaten** in 14 von 61 Data-Objects

Pro Paar:
- Links Element A
- Mitte Match-Score-Badge:
	- 🟢 **SAME** ≥85% (sehr wahrscheinlich gleiches Konzept)
	- 🟡 **SIMILAR** 65–85% (lohnt sich anzuschauen)
- Rechts Element B

> [!example] Top-Treffer im BSH-Demo
> `Supplier-Master ↔ Supplier-Contact-Information` mit **85%** SAME
> → klarer Konsolidierungs-Kandidat

### 2️⃣ Verstehen — ein Klick

- Klick auf Paar-Karte → 3D-Camera **zoomt auf beide Elements gleichzeitig**
- PropertyPanel öffnet das erste Element automatisch
- Kein Tab-Hopping, kein Verlieren des Überblicks

### 3️⃣ Erweitern — ein Häkchen

- **Cross-Type-Checkbox** oben rechts → Re-Scan über alle Element-Types
- Findet `business_capability ↔ business_service`-Verwechslungen
- Filter via `SEMANTIC_TYPE_GROUPS` — keine sinnlosen Matches wie `Stakeholder vs Application`
- Auto-Threshold steigt auf 0.7 für höhere Präzision

### 4️⃣ Entscheiden — Per-Pair

Vier Buttons pro Paar:

| Button | Effekt |
|---|---|
| `← Merge into A` | Element B verschwindet, alle Connections wandern zu A |
| `Merge into B →` | Spiegelverkehrt |
| `✓ Keep both` | Beide bleiben (semantisch ähnlich aber bewusst getrennt) |
| `⊳ Skip` | Später entscheiden |

Optisches Feedback: gewähltes Target bekommt grünen Ring. Footer Live-Counter "X merge · Y keep · Z skip".

### 5️⃣ Anwenden — Bulk

- **Apply (N)** Button am Footer
- Backend führt alle Decisions atomisch durch:
	- Connections von Source auf Target übertragen (MERGE-safe, keine Duplicate-Edges)
	- Source-Element + dessen Embedding löschen
	- Pro Merge: Audit-Entry geschrieben
- Toast: `✓ N merged · M kept · K skipped`
- 3D-Scene refresht automatisch — gelöschte Würfel sind weg
- Pair-Liste re-fetcht — verbrauchte Pairs verschwinden

### 6️⃣ Nachvollziehen — Audit-Trail

Jeder Merge ist als `action: 'redundancy_resolved'` in `AuditLog` mit:

```json
{
  "userId": "...",
  "projectId": "...",
  "action": "redundancy_resolved",
  "entityType": "redundancy_pair",
  "entityId": "aId|bId",
  "after": { "aId": "...", "bId": "...", "action": "merge-into-a", "sourceId": "...", "targetId": "..." },
  "ip": "...",
  "userAgent": "...",
  "riskLevel": "medium",
  "timestamp": "..."
}
```

> [!info] DSGVO-Konformität
> Jede Datenobjekt-Konsolidierung ist nach **DSGVO Art. 30** (Verarbeitungsverzeichnis) nachverfolgbar. Wer, wann, was, wie, von wo.

API-Endpoint für Stats:
```
GET /api/projects/:projectId/stats/redundancies
→ { totalResolved, totalKept, lastResolvedAt, lastResolvedBy, lastResolvedPair }
```

---

## Technische Architektur

```mermaid
flowchart TB
    User[👤 Architekt im Browser]
    Panel[RedundancyPanel.tsx]
    Hook[useRedundancies hook]
    AuthFetch[authFetch wrapper<br/>Token-Refresh]

    subgraph Backend[Backend Express]
      Route1[GET /redundancies<br/>findRedundancies]
      Route2[POST /redundancies/resolve<br/>applyRedundancyDecisions]
      Route3[GET /stats/redundancies]
      Service1[elementSimilarity.service<br/>findSimilarElements]
      Service2[redundancyResolution.service<br/>mergeElements]
      Audit[AuditLog Mongo]
    end

    subgraph DataLayer[Data Layer]
      Qdrant[(Qdrant<br/>elements-{projectId})]
      Neo4j[(Neo4j<br/>ArchitectureElement)]
      Mongo[(Mongo<br/>AuditLog)]
    end

    User -->|Click GitMerge| Panel
    Panel --> Hook
    Hook --> AuthFetch
    AuthFetch --> Route1
    AuthFetch --> Route2
    AuthFetch --> Route3

    Route1 --> Service1
    Service1 -->|kNN-search| Qdrant
    Service1 --> Neo4j

    Route2 --> Service2
    Service2 -->|relationship transfer| Neo4j
    Service2 -->|DETACH DELETE| Neo4j
    Service2 -->|deleteEmbedding| Qdrant
    Service2 --> Audit

    Route3 --> Audit
    Audit --> Mongo
```

### Tenant-Isolation

> [!warning] Hart isoliert via Workspace
> Embeddings leben in `elements-{projectId}` Qdrant-Collections.
> Cross-Workspace-Queries sind **physikalisch unmöglich** weil sie unterschiedliche Collections treffen.
> Siehe REQ-SIM-005 aus Sprint-2.

### Service-Layer Verantwortlichkeiten

| Service | File | Verantwortung |
|---|---|---|
| `elementSimilarity` | `packages/server/src/services/elementSimilarity.service.ts` | Embedding-Index, Similarity-Search, `findRedundancies()` Pair-Aggregation |
| `redundancyResolution` | `packages/server/src/services/redundancyResolution.service.ts` | `mergeElements()` mit Relationship-Transfer, `applyRedundancyDecisions()` Batch-Loop, Audit-Writes |
| Shared Constants | `packages/shared/src/constants/semantic-type-groups.constants.ts` | 6 Type-Gruppen für Cross-Type-Filterung |

### Frontend-Layer

| Component | File | Verantwortung |
|---|---|---|
| `RedundancyPanel` | `packages/client/src/components/copilot/RedundancyPanel.tsx` | Modal-UI, Decision-State, Bulk-Apply |
| `useRedundancies` | `packages/client/src/hooks/useRedundancies.ts` | Fetch + applyDecisions via `authFetch` |
| `authFetch` | `packages/client/src/services/authFetch.ts` | Token-Refresh-aware fetch-Wrapper |
| Toolbar-Integration | `packages/client/src/components/ui/Toolbar.tsx` | GitMerge-Icon-Trigger |

---

## Requirements & Acceptance Criteria

> [!check] Alle 5 REQs Done

| REQ | Linear | Score | Status |
|---|---|---|---|
| **REQ-RED-001** Same-Type Endpoint | [THE-245](https://linear.app/thearchitect/issue/THE-245) | 65.7 | ✅ Done |
| **REQ-RED-002** Cross-Type via Semantic Groups | [THE-246](https://linear.app/thearchitect/issue/THE-246) | 62.9 | ✅ Done |
| **REQ-RED-003** Redundancy-List-UI + Click-Navigate | [THE-247](https://linear.app/thearchitect/issue/THE-247) | 71.4 | ✅ Done |
| **REQ-RED-004** Bulk-Merge-Modal mit Per-Item-Decision | [THE-249](https://linear.app/thearchitect/issue/THE-249) | 65.7 | ✅ Done |
| **REQ-RED-005** Audit + Stats-Endpoint | [THE-250](https://linear.app/thearchitect/issue/THE-250) | 51.4 | ✅ Done (Frontend-Counter folgt Sprint-4) |

### 8-Kriterien WSJF-Scoring

```
                         BV  BR  IC  CoS Comp Rel Urg  Sum  Score
REQ-RED-001  Endpoint     4   3   2   5   2   4   3    23   65.7
REQ-RED-002  Cross-Type   5   3   3   4   2   3   2    22   62.9
REQ-RED-003  List-UI      5   3   2   5   2   5   3    25   71.4
REQ-RED-004  Bulk-Merge   4   4   3   4   3   3   2    23   65.7
REQ-RED-005  Audit        2   2   1   5   4   2   2    18   51.4
```

(BV=Business Value, BR=Business Risk, IC=Implementation Challenge, CoS=Chance of Success, Comp=Compliance, Rel=Relations, Urg=Urgency — je 0-5, Sum/35×100)

---

## Demo-Story für Pitches

> [!quote] BSH-Pitch-Punch
> *"Wir haben in 2 Tagen eine semantische Redundanz-Erkennung gebaut, die LeanIX, BiZZdesign und Mega nicht haben.*
>
> *Im BSH-ESG-Compliance-Modell findet sie in 3 Sekunden **20 Konsolidierungs-Kandidaten** in einem 61-Element-Modell. Top-Treffer: `Supplier-Master ↔ Supplier-Contact-Information` mit 85% SAME-Score.*
>
> *Der Architekt sieht Score + Tier, kann mit einem Klick zu beiden Elements zoomen, mit zwei Klicks mergen — und jede Aktion ist DSGVO-konform auditiert.*
>
> *Vorher: 2-Stunden-Excel-Job. Jetzt: 30 Sekunden im Tool."*

### Konkrete Zahlen aus Production-Smoke

- **Scan-Performance:** 14 von 61 Elements in <1s gescannt
- **Pair-Detection:** 20 SAME/SIMILAR-Kandidaten gefunden
- **Cross-Type-Mode:** 60 von 60 Elements gescannt, 7 strenge Matches (Threshold 0.7)
- **Echte Merge-Aktion:** 1 Pair gemerged auf Production → Element + 3 Pair-Beziehungen sauber entfernt

---

## Strategische Bedeutung

> [!note] Multiplier-Effekt
> UC-RED-001 ist ein direkter ROI auf die **Sprint-2 Similarity-Foundation** (Track A). Die Embedding-Infrastruktur, die für UC-SIM-001 gebaut wurde, treibt jetzt direkt UC-RED-001.

### Tier-3-Folgeprojekte

- **UC-HARM-001** Cross-Project-Harmonisierung — nutzt denselben Algorithmus aber mit Cross-Workspace-Query
- **Reference-Pattern-Library** — emergiert aus akkumulierten Cross-Project-Embeddings
- **Auto-Heal-Suggestions auf Embedding-Basis** — semantisch-ähnliche Connection-Patterns

---

## Bekannte Lücken (Sprint-4-Kandidaten)

> [!todo] Was im Frontend noch fehlt

| AC | Was fehlt | Aufwand |
|---|---|---|
| REQ-RED-005 AC-2 | "Redundancies resolved" Counter im Project-Dashboard (Sidebar-Stat-Card) | ~1h |
| REQ-RED-005 AC-3 | Audit-Log filterbar nach `redundancy_resolved` im governance Panel | ~30 min |
| — | Type-Group-Erklärung im Cross-Type-Tooltip | ~30 min |
| — | Smart-Hint im Modal ("recommend keep A — A has 5 connections vs B has 0") | ~2h |
| — | "Dismiss this pair" — User markiert false-positive damit es nicht wiederkommt | ~1-2h |

---

## Implementation-Timeline

```
2026-05-15  Pre-Flight + Linear-Setup (6 Issues)
            Sprint-2-Carry-Over: Token-Refresh-Bug-Fix
2026-05-16  Slice 1: REQ-RED-001 Backend + REQ-RED-003 Frontend → Live (vormittag)
            Slice 2: REQ-RED-004 Bulk-Merge → Live (mittag)
            Slice 3: REQ-RED-002 Cross-Type → Live (nachmittag)
            Slice 4: REQ-RED-005 Audit + Stats → Live (abend)
            UC-RED-001 KOMPLETT in 1.5 Tagen statt geplanten 5 Tagen
```

## Code-Pointer

| Datei | Was |
|---|---|
| [packages/server/src/services/elementSimilarity.service.ts](../../packages/server/src/services/elementSimilarity.service.ts) | `findRedundancies` Service mit DI-Hook |
| [packages/server/src/services/redundancyResolution.service.ts](../../packages/server/src/services/redundancyResolution.service.ts) | `mergeElements` + Audit-Writes |
| [packages/server/src/routes/architecture.routes.ts](../../packages/server/src/routes/architecture.routes.ts) | 3 Routes: detect / resolve / stats |
| [packages/shared/src/constants/semantic-type-groups.constants.ts](../../packages/shared/src/constants/semantic-type-groups.constants.ts) | 6 Cross-Type-Gruppen |
| [packages/client/src/components/copilot/RedundancyPanel.tsx](../../packages/client/src/components/copilot/RedundancyPanel.tsx) | Modal-UI |
| [packages/client/src/hooks/useRedundancies.ts](../../packages/client/src/hooks/useRedundancies.ts) | Hook mit fetch+applyDecisions |

## Tests

| Suite | Cases | File |
|---|---|---|
| `architecture.routes.redundancies` | 15 (incl. 4 Cross-Type) | Routes-Suite |
| `architecture.routes.redundancy-resolve` | 13 (incl. 3 Stats) | Resolve + Stats |
| `redundancyResolution.service` | 17 (incl. 5 Audit) | Service-Layer |
| **Σ neue Tests für UC-RED-001** | **45** | |

Cumulative server-Tests: **144 grün** nach Sprint-3-Tag-2.

---

## Commits

- `686754e` Token-Refresh-Bug-Fix (authFetch wrapper für 4 Generator-Hooks)
- `0aab456` REQ-RED-001 Backend (findRedundancies + Route)
- `0eea800` REQ-RED-003 Frontend (Panel + Hook + Toolbar)
- `7f2715a` REQ-RED-004 Bulk-Merge (Service + Per-Pair-Decisions UI)
- `3da2032` REQ-RED-002 Cross-Type (semantic-type-groups)
- `53646e4` REQ-RED-005 Audit + Stats-Endpoint

---

## Verlinkungen ins Vault

- [[UC-SIM-001 Similarity Foundation]] — die Sprint-2-Basis
- [[UC-HARM-001 Cross-Project Harmonisierung]] — Sprint-4-Folgeprojekt
- [[Sprint 3 Daily 2026-05-16]] — Tagesbericht
- [[Predictive Architecture Strategy]] — strategischer Kontext
- [[BSH-ESG-Compliance-Transformation]] — Demo-Projekt
