# BSH Feedback-Capture (Demo 2026-05-06)

> **Status:** Draft / Feedback-Erfassung. **Pre-Flight-Check und Linear-Issue-Erstellung stehen noch aus** (siehe `feedback_preflight_before_plan` — Pre-Flight muss VOR dem Plan laufen).
> **8-Kriterien-Scoring:** für jede REQ in einem späteren Schritt (siehe `feedback_requirement_scoring`).

**Quelle:** Live-Feedback während BSH-Demo, drei Kernpunkte:

1. ✅ Neuralgische Punkte in der Architektur sofort erkennbar machen
2. ✅ Gesetz als Soll-Architektur laden + Side-by-Side vs. Ist
3. ✅ Plateau-Checkbox: Wave-Elements als "implementiert" markieren → Progress-Bars

---

## UC-CRIT-001 — Neuralgische Punkte at-a-Glance

### Goal
Beim Öffnen eines Projekts sieht der Architekt **innerhalb von 3 Sekunden** die neuralgischen Punkte seiner Landschaft — ohne klicken, ohne filtern, ohne Pivot-Tabelle.

### Warum (BSH-Kontext)
BSH hatte explizit den Wunsch: *"auf Anhieb die neuralgischen Punkte"*. Aktuell muss der Architekt durch X-Ray-Mode, Risk-Filter, Health-Score-Drilldown navigieren um das zu finden. Bei einem Audit oder C-Level-Review hat er die 3 Sekunden nicht.

### Begriffsdefinition (offen — Konzept-Arbeit)
"Neuralgisch" ist nicht in einer Dimension messbar. Vorschlag: **Composite Criticality Score** aus 7 Faktoren:

| Faktor | Was misst es | Datenquelle |
|---|---|---|
| F1 — **Single-Point-of-Failure** | hohe Dependent-Count + keine Redundanz | Neo4j Graph-Topologie |
| F2 — **Risk × Connectivity** | hohes `riskLevel` UND viele Connections | Element-Property × Graph |
| F3 — **Maturity-Floor** | niedrige `maturityLevel` bei vielen Dependents | Element-Property × Graph |
| F4 — **Compliance-Gap** | Element fehlt Realizer für eine Requirement | StandardMapping |
| F5 — **Cost-Burden** | dominante Roadmap-Kosten (>20% einer Wave) | Roadmap-Waves |
| F6 — **Stakeholder-Bottleneck** | häufig in MiroFish-Conflicts | EmergenceMetrics |
| F7 — **Cycle / Tangle** | Teil eines zirkulären Dependency-Knotens | Neo4j Cycle-Detection |

→ Final Score = gewichtete Summe (Gewichte konfigurierbar pro Workspace).

### REQs

| REQ | Beschreibung | Akzeptanzkriterium |
|---|---|---|
| **REQ-CRIT-001** | Begriffs-Workshop "neuralgisch" — Faktoren + Gewichte mit BSH validieren | Workshop-Notes mit signed-off Faktor-Liste |
| **REQ-CRIT-002** | `criticality.service.ts`: pure-function Score-Engine (Input: elements + connections + standardMappings + roadmap → Output: `Map<elementId, CriticalityBreakdown>`) | Unit-Tests für jeden der 7 Faktoren |
| **REQ-CRIT-003** | 3D-Visualisierung: Top-N neuralgische Elemente bekommen Glow-Outline + Pulsing-Animation (rot/orange/gelb je nach Score-Band) | Manuell: BSH-Demo-Projekt zeigt SAP S/4HANA + Vault-Equiv. mit Glow |
| **REQ-CRIT-004** | Sidebar-Widget "Critical Hotspots" — Top-10-Liste mit Score, klickbar | Klick fokussiert das Element + öffnet PropertyPanel |
| **REQ-CRIT-005** | Drill-Down-Popover: "Warum ist das neuralgisch?" — Faktor-Breakdown mit Mini-Bars je Faktor | Hover oder Klick auf Glow-Element öffnet Popover |
| **REQ-CRIT-006** | Persistierung der Scores in MongoDB + Recompute-Trigger bei Element/Connection/Mapping-Change | DB-Doc `criticalityCache.{projectId}.{elementId}` mit `computedAt` |
| **REQ-CRIT-007** | Schwellwert-Konfig pro User: "Top 5% / Top 10% / Custom" + Faktor-Gewichte einstellbar | Settings-Panel mit Sliders + sofortiges Re-Render |

### Out of Scope
- Nicht-Architektur-Faktoren (z.B. Personalfluktuation auf Capability)
- ML-basierte Score-Lernung (heuristisch reicht für V1)

---

## UC-GAP-001 — Standard-as-Target Side-by-Side Gap-Analyse

### Goal
Ein hochgeladenes Standard-PDF (LkSG, CSRD, ESRS, …) wird in eine **synthetische Soll-Architektur** transformiert und kann als eigenständiges Projekt **side-by-side** mit dem Ist-Projekt verglichen werden. Gaps werden automatisch identifiziert und Harmonisierungs-Aktionen vorgeschlagen.

### Warum (BSH-Kontext, Originalzitat)
> *"Kann man nicht das Gesetz rein laden als Soll-Architektur und hinterher mit seiner Ist-Architektur vergleichen (side-by-side) … man hat seine Architektur gebaut und über den Import lässt sich dann ein weiteres angelegtes Projekt 'Soll-Architektur Gesetz LkSG' mit meinem Ist vergleichen und daraus dann die Gaps identifizieren. Anschließend dann bereits bestehende Punkte zur Harmonisierung angehen."*

Das ist die **Inversion der heutigen Compliance-Matrix**: aktuell mappt der User Elemente → Standard-Sektionen. Der BSH-Vorschlag dreht das um — Standard wird zum **First-Class-Architecture-Citizen**, Ist und Soll werden gleichberechtigt verglichen.

### Mechanik (5-Phasen-Pipeline)

```
PDF Upload → Section-Parse (existiert)
    ↓
LLM-Synthese: Section → ArchiMate-Element  (NEU)
    ↓
Synthetisches "Soll-Projekt" erzeugen      (NEU)
    ↓
Element-Matching Ist↔Soll (semantic+LLM)   (NEU, baut auf StandardMapping)
    ↓
Side-by-Side-Diff-View + Harmonization     (NEU, baut auf PlateauCompare)
```

### REQs

| REQ | Beschreibung | Akzeptanzkriterium |
|---|---|---|
| **REQ-GAP-001** | LLM-Prompt + Service: Standard-Sektion → 1..N ArchiMate-Elemente. Pro §: 1 Requirement (motivation), N Capabilities (strategy), N Processes (business). Type-Mapping kommt von LLM, validiert gegen ArchiMate-Rules. | Unit-Test: LkSG §4 ergibt mind. 1 Requirement + 1 Capability mit korrekten Layer |
| **REQ-GAP-002** | Neue Route `POST /api/projects/from-standard` mit Body `{standardId, name, description}`. Erzeugt Mongo-Project + Neo4j-Elements + Composition-Edges (§ → Capabilities → Processes). Markiert Project mit `metadata.syntheticFrom: standardId`. | curl mit LkSG-Standard erzeugt Projekt mit ≥20 Elementen |
| **REQ-GAP-003** | Element-Matching-Algorithm: für jedes Ist-Element finde Soll-Match via (a) Name-Similarity (Levenshtein + Embedding), (b) Type+Layer-Filter, (c) LLM-Validation. Output: `Map<istId, {sollId, confidence, reason}>` | Test: BSH-Ist mit "Compliance Documentation System" matcht LkSG-Soll "Documentation and Reporting System" mit confidence ≥0.7 |
| **REQ-GAP-004** | Side-by-Side-Diff-Viewer: 2 Spalten (Ist links, Soll rechts), Match-Linien dazwischen, 3 Status-Badges: COVERED (grün), MISSING (rot, nur Soll), ADDITIONAL (gelb, nur Ist). 3D oder 2D wählbar. | UI lädt BSH-Ist + LkSG-Soll, zeigt mind. 5 MISSING + 3 COVERED + 2 ADDITIONAL |
| **REQ-GAP-005** | Gap-Liste-Export: CSV (für Excel-Workshop) + PDF (für Audit-Report). Inkl. priorisierte Reihenfolge nach Severity (Soll-Element-Risk × Standard-Section-Mandatorischkeit). | Klick "Export Gaps" → Datei mit allen Diffs |
| **REQ-GAP-006** | "Add to Ist from Soll" Quick-Action: erzeugt Stub-Element (status='target', maturityLevel=1) im Ist-Projekt mit Link zur Soll-Quelle. | Klick auf MISSING-Soll-Element → Toast "Added to Ist as draft" + Element erscheint im Ist |
| **REQ-GAP-007** | Auto-Harmonization-Roadmap: aus Gap-Liste eine Transformation-Roadmap generieren (1 Wave pro Severity-Tier). Reuse `roadmap.service.generate()` mit Compliance-Candidates-Flag. | Klick "Generate Roadmap from Gaps" → Roadmap mit ≥3 Waves entstanden |
| **REQ-GAP-008** | Standard-Update-Reconciliation: bei neuer PDF-Version desselben Standards (LkSG v2026 → v2027) → Re-Parse + Re-Synthese + Re-Matching. Bestehende Matches bleiben wo möglich, Diff zeigt was sich geändert hat. | Manuell: Standard-Re-Upload zeigt "3 sections changed, 2 new requirements" |

### Out of Scope
- Vollautomatische Implementierung der MISSING-Elements (User muss freigeben)
- Cross-Standard-Diff (LkSG vs. CSRD) — V2

### Bestehende Bausteine die wiederverwendet werden
- `standards.service.ts` — PDF-Parser inkl. German-Law-Modus (`looksLikeGermanLaw`)
- `StandardMapping` — Mongo-Modell für Element↔Section-Mapping (wird Basis für Matching)
- `plateauComputation.ts` — Side-by-Side-Logic, kann auf 2 Projekte erweitert werden
- `aiGenerator.routes.ts` — Mechanik für LLM-driven Element-Erzeugung existiert (Blueprint)

---

## UC-PLATEAU-001 — Wave-Element Execution-Tracking via Done-Häkchen

### Goal
Jedes Element in einer Roadmap-Wave bekommt eine **Checkbox "implementiert"**. Der Architekt kann den Roadmap-Fortschritt gegen die Realität abgleichen — Plateau-Progress-Bars zeigen, wo das Programm tatsächlich steht.

### Warum (BSH-Kontext)
*"Bei der Transformation-View im Plateau super wäre es wenn es so etwas wie einen Check oder Checkbox geben würde, dass diese [Elemente bereits implementiert sind]."*

Heute zeigt die Plateau-View den **Soll-Zustand pro Wave**, aber es gibt keinen Mechanismus, um zu tracken **was davon bereits Realität ist**. Der Architekt muss die Roadmap im Kopf gegen den aktuellen Element-Status abgleichen. Bei BSH mit 31 Elementen über 4 Waves ist das praktisch nicht machbar.

### Konzept-Trennung (wichtig)
Es existieren **zwei verschiedene "Status"-Konzepte**, die nicht vermischt werden dürfen:

| Konzept | Was es ausdrückt | Wo es lebt |
|---|---|---|
| `element.status` (current/target/transitional/retired) | **Realität** — was hat dieses Element gerade in der Architektur | `ArchitectureElement` (Neo4j) |
| `waveElement.implementedAt` (NEU) | **Roadmap-Execution** — ist diese geplante Veränderung erledigt | `TransformationRoadmap.waves[].elements[]` (Mongo) |

→ Die Checkbox setzt **nur** `implementedAt`. Optional kann sie das Element-Status-Feld synchronisieren (Confirm-Dialog), aber das ist eine separate User-Aktion.

### REQs

| REQ | Beschreibung | Akzeptanzkriterium |
|---|---|---|
| **REQ-PLATEAU-001** | Datenmodell: `WaveElement` erhält `implementedAt: Date \| null`, `implementedBy: userId \| null`, `implementationNote: string \| null` | Mongo-Migration: bestehende Roadmaps haben `implementedAt: null` für alle Wave-Elemente |
| **REQ-PLATEAU-002** | Endpoint `PATCH /api/projects/:projectId/roadmaps/:roadmapId/waves/:waveNumber/elements/:elementId/implementation` mit Body `{implemented: boolean, note?: string}`. Idempotent. Audit-Log via existing Middleware. | curl mit `{implemented:true}` → 200 + Wave-Element-Doc mit Timestamp; zweiter Call mit demselben Wert → 200 (no-op) |
| **REQ-PLATEAU-003** | UI: Checkbox links neben jedem Element in `WaveCard.tsx`. Bei Klick → Optimistic Update + API-Call. Bei Fehler → Rollback + Toast. | Manuell: Klick auf Checkbox → sofort grünes Häkchen, API-Call im Network-Tab sichtbar, Reload zeigt Häkchen weiterhin |
| **REQ-PLATEAU-004** | Plateau-Progress-Bar: pro Plateau `implementedCount / totalCount` als Bar oben in der Plateau-View. Color-Coded: <33% rot, 33-66% gelb, >66% grün. | Plateau mit 5 Elementen, 2 abgehakt → "2/5 (40%)" gelb |
| **REQ-PLATEAU-005** | Roadmap-Summary: Gesamt-Progress (% über alle Waves) im Roadmap-Header. Klickbar → springt zum nächsten unimplementierten Element. | Roadmap-Header zeigt "12/31 implementiert (39%)" |
| **REQ-PLATEAU-006** | 3D-Visualisierung: Implementierte Elements bekommen kleine grüne Check-Badge oben rechts. Im Plateau-Mode wird die Glow-Color gedimmt (vom "wird-gerade-verändert"-orange zu "fertig"-grün). | Im Plateau-Mode der BSH-Demo: 3 abgehakte Elemente zeigen Check-Badge |
| **REQ-PLATEAU-007** | Filter-Toggle "Outstanding only" / "Implemented only" / "All" in der Plateau-View. Default: All. | Klick "Outstanding only" → nur unabgehakte Elements visible, Plateau-Bar bleibt aber bei Gesamt-% |
| **REQ-PLATEAU-008** | Optional-Sync: bei Toggle "implemented:true" zeigt Confirm-Dialog *"Element-Status auch von 'target' auf 'current' setzen?"*. Bei Confirm → zweiter API-Call an Element-Update-Endpoint. | Confirm "Ja" → Element in 3D wechselt von Target-Style zu Current-Style; Confirm "Nein" → nur Wave-Element-Flag |
| **REQ-PLATEAU-009** | Audit-Trail-Zugriff: jeder Toggle erzeugt Audit-Eintrag mit `action: 'mark_implementation'`, `entityType: 'wave_element'`, `before/after` Diff. Im Audit-Log-Viewer filterbar. | Audit-Logs zeigen alle Implementation-Toggles mit User, Timestamp, Element-Name |
| **REQ-PLATEAU-010** | RBAC: nur User mit `ROADMAP_UPDATE` Permission können togglen. Viewer/Read-Only sehen Checkbox aber disabled. | Token mit Viewer-Rolle: Klick auf Checkbox → 403 + Toast |

### Out of Scope (V1)
- Auto-Detection (z.B. "Element-Status ist 'current' geworden → Wave-Element auto-mark als implementiert"). Manueller Check ist explizit, V2.
- Partial-Implementation-Percentages pro Element (z.B. "75% fertig"). Binary für V1.
- Notifications wenn ganze Wave implementiert. V2.
- Comments-Thread pro Wave-Element. V2.

### Bestehende Bausteine die wiederverwendet werden
- `TransformationRoadmap` Mongo-Modell — Schema-Erweiterung statt neuer Collection
- `WaveCard.tsx` — Checkbox wird in existing Element-Liste eingehängt
- `plateauComputation.ts` — Progress-Berechnung kommt zu den Snapshot-Metriken dazu
- `audit.middleware.ts` — Existiert bereits, nur neue `action`-String registrieren
- `STATUS_COLORS` aus den Plateau-Visualisierungen — wird um "implemented"-Variante ergänzt

---

## Nächste Schritte (workflow-konform)

**Bevor ein einziger Code-Edit passiert** — siehe `feedback_preflight_before_plan`:

1. **Pre-Flight-Check pro UC:**
   - Linear durchsuchen: existiert schon ein Issue mit ähnlichem Scope?
   - Codebase-Scan: gibt es bereits eine partielle Implementation?
   - Linear-Issues anlegen (UC + Sub-REQs) per Linear-MCP
2. **8-Kriterien-Scoring** pro REQ — siehe `feedback_requirement_scoring`. Output: WSJF-Ranking, Top-5 für Sprint-Planning
3. **User-Confirmation** der Reihenfolge → erst dann `writing-plans` ausführen
4. **RVTM-Datei** pro UC, dann implementation via `subagent-driven-development`

**Geschätzter Scope:**
- UC-CRIT-001: **medium** (1-2 Sprints, viel Konzept-Arbeit für die "neuralgisch"-Definition, wenig neue Infrastruktur)
- UC-GAP-001: **large** (3-4 Sprints, neuer Project-Typ + neuer Diff-Viewer, baut aber auf 4 existierenden Bausteinen)
- UC-PLATEAU-001: **small-medium** (1 Sprint, Schema-Migration + UI-Erweiterung + neuer Endpoint; rein additiv, kein Refactor)

**Empfohlene Reihenfolge (vor Pre-Flight subjektiv):**
1. **UC-PLATEAU-001 zuerst** — kleinster Aufwand, höchster Daily-Value, BSH sieht direkt Fortschritt im aktuellen Demo-Projekt
2. **UC-CRIT-001 als zweites** — Konzept-Workshop mit BSH parallel zum Sprint, dann Implementation
3. **UC-GAP-001 als drittes** — größter Hebel, aber lohnt einen vorgelagerten Concept-Workshop, weil "Standard→ArchiMate"-Mapping nicht-trivial ist

Insgesamt **post-Demo-Backlog**, nicht kurzfristig. UC-GAP-001 ist die mächtigste der drei Ideen — wenn sich BSH dafür begeistert, lohnt sich ein Konzept-Workshop.
