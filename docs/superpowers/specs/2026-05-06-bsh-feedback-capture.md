# BSH Feedback-Capture (Demo 2026-05-06)

> **Status:** Tier-1-UCs angelegt in Linear (UC-PLATEAU-001 = THE-217, UC-DATA-001 = THE-228). Tier 2/3 noch UC-Drafts — Pre-Flight folgt nach Tier-1-Sprint.
> **8-Kriterien-Scoring:** noch ausstehend pro REQ (siehe `feedback_requirement_scoring`).
> **Pre-Flight-Bericht (Tier 1):** siehe Section "Pre-Flight-Findings" am Ende dieses Dokuments.

**Quelle:** Live-Feedback während BSH-Demo + Nachgespräch mit BSH-Kollegen, **sieben Kernpunkte**:

**Aus Demo-Live-Feedback:**
1. ✅ Neuralgische Punkte in der Architektur sofort erkennbar machen → UC-CRIT-001
2. ✅ Gesetz als Soll-Architektur laden + Side-by-Side vs. Ist → UC-GAP-001
3. ✅ Plateau-Checkbox: Wave-Elements als "implementiert" markieren → UC-PLATEAU-001

**Aus Nachgespräch:**
4. ✅ Harmonisierung von zwei realen Architekturen (Post-Merger / Multi-Region) → UC-HARM-001
5. ✅ Redundanz-Detection mit klar definierten Parametern → UC-RED-001
6. ✅ Generator-Chain-Lücke: Business-Layer → Data-Objects → UC-DATA-001
7. ✅ C-Level-Board: einfache Zahlen/Daten/Fakten-Sicht für Executive → UC-EXEC-001

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

## UC-HARM-001 — Architecture-zu-Architecture Harmonisierung

### Goal
Zwei reale Architektur-Projekte (Post-Merger, Multi-Region, Legacy↔New) werden side-by-side geladen, automatisch gematcht, in Kategorien einsortiert (SAME / SIMILAR / UNIQUE / CONFLICT), und der User bekommt **Harmonisierungs-Aktionen** auf Knopfdruck.

### Warum (BSH-Kontext)
*"Ist es möglich durch meine Software eine Harmonisierung von zwei Architekturen durchzuführen?"*

BSH-Use-Cases:
- BSH übernimmt einen Wettbewerber → 2 EA-Landschaften müssen konsolidiert werden
- BSH-Deutschland vs. BSH-USA: zwei regionale Architekturen, soll ein gemeinsamer Kern entstehen
- Legacy-System-Migration: alte Architektur ↔ neue Ziel-Architektur, was wird gemerged

Heute ist das ein 6-monatiger Consultant-Auftrag. Ziel: **innerhalb 1 Tags ein erstes Diff-Ergebnis**.

### Beziehung zu UC-GAP-001
UC-GAP-001 macht **synthetisch (Standard) ↔ real**. UC-HARM-001 macht **real ↔ real**. Diff-Viewer + Element-Matching werden geteilt; HARM addiert Konflikt-Resolution + Result-Project-Generation.

### REQs

| REQ | Beschreibung | Akzeptanzkriterium |
|---|---|---|
| **REQ-HARM-001** | Multi-Project-Loader: 2 Projekte gleichzeitig in einer View (Read-Only-Mode auf beiden) | UI lädt Project-A + Project-B, beide in 3D sichtbar mit Workspace-Offset |
| **REQ-HARM-002** | Element-Matching wie REQ-GAP-003, aber bidirektional und mit Confidence-Tiers (>0.9 = SAME, 0.6-0.9 = SIMILAR, <0.6 = UNIQUE) | Test: 2 BSH-Demo-Projekte mit überlappenden Capabilities → ≥80% korrekte Matches manuell verifiziert |
| **REQ-HARM-003** | Match-Kategorisierung: jedes Match-Pair bekommt einen von 5 Tags: **SAME** (identisch), **SIMILAR** (funktional gleich, Detail-Unterschiede), **CONFLICT** (gleicher Name, inkompatible Specs), **UNIQUE-A**, **UNIQUE-B** | UI-Filter zeigt jeweils nur die gewählte Kategorie |
| **REQ-HARM-004** | Konflikt-Resolution-Workflow: bei CONFLICT → Side-by-Side-Detail-View (Properties, Connections, Metadata) + 4 Resolutions: keep-A, keep-B, merge-into-new, both-required | Klick "merge-into-new" → Wizard fragt nach Name + nimmt Properties beider Sources auf |
| **REQ-HARM-005** | Harmonisierungs-Aktionen UI: Multi-Select über Diff-Liste, Bulk-Actions ("Keep all SIMILAR-Matches from Project A", "Merge all CONFLICTs", etc.) | Bulk-Action "Keep A für alle SIMILAR" reduziert die Diff-Liste um die SIMILAR-Einträge |
| **REQ-HARM-006** | Result-Project-Generation: aus den getroffenen Entscheidungen entsteht ein neues `harmonized_project` mit Linage-Metadaten (jedes Element kennt seine Quellen aus A und/oder B) | Result-Projekt zeigt 100% der "Keep"-Entscheidungen + alle Merged-Elements |
| **REQ-HARM-007** | Auto-Migration-Roadmap: vom Result-Project zurück zu A und B → 2 separate Roadmaps pro Source, die A/B in Richtung Result transformieren | Klick "Generate Migration Roadmap" → 2 Roadmaps mit Waves entstanden |
| **REQ-HARM-008** | Audit + Versionierung: jede Harmonisierungs-Entscheidung wird als Audit-Eintrag persistiert + Result-Project bekommt Version-Tag inkl. Decision-Snapshot | Audit-Logs zeigen alle merge-Entscheidungen mit User + Timestamp |

### Out of Scope (V1)
- Mehr als 2 Projekte gleichzeitig (V2: N-Way-Harmonization für globale Konzerne)
- Auto-Resolution ohne User-Input (immer human-in-the-loop für CONFLICTs)

### Bestehende Bausteine (heavy reuse)
- UC-GAP-001 Diff-Viewer + Element-Matching (REQ-GAP-003/004) — geteilte Codebase
- `roadmap.service.generate()` — wird für Migration-Roadmaps wiederverwendet
- `xrayStore` Multi-Workspace-Logik — Basis für Side-by-Side-Loader

---

## UC-RED-001 — Redundanz-Detection mit definierten Parametern

### Goal
Auto-Erkennung von redundanten Elementen in einer Architektur — auf Basis **klar definierter, transparenter Parameter**, nicht als Black-Box. Output: priorisierte Redundanz-Cluster mit Cost-Saving-Schätzung.

### Warum (BSH-Kontext)
*"Wie decke ich Redundanzen auf, und welche Parameter ziehe ich dafür heran?"*

Redundanzen sind **eines der größten EA-Optimierungspotenziale**: 30-40% der Tools/Capabilities in Konzern-Landschaften sind funktional doppelt. Heute findet man sie nur durch Workshops und Glück. Der BSH-Architekt will das systematisch.

### Parameter-Katalog (transparent, gewichtet)

| Parameter | Was misst es | Range | Default-Gewicht |
|---|---|---|---|
| **P1 — Name-Similarity** | Levenshtein + Cosine auf Element-Name | 0..1 | 0.15 |
| **P2 — Type+Layer-Match** | gleicher `type` UND `layer` | 0 oder 1 (Hard-Filter) | Filter |
| **P3 — Description-Embedding** | Cosine-Similarity der Description-Embeddings (LLM) | 0..1 | 0.30 |
| **P4 — Capability-Realization** | beide realisieren dieselbe Capability/Requirement | 0 oder 1 | 0.20 |
| **P5 — Connection-Pattern-Similarity** | Jaccard-Index auf Sets der Dependents/Dependencies | 0..1 | 0.15 |
| **P6 — Functional-Overlap (LLM)** | LLM-Frage: "Sind diese 2 Elemente funktional austauschbar?" | 0..1 | 0.20 |

→ **Redundancy-Score** = Σ (Pi × wi). Nur Pairs mit **Type+Layer-Match** kommen in den Score. Schwellwert ≥0.6 = Redundanz-Verdacht. ≥0.8 = starke Redundanz.

Cluster-Bildung: transitiv über die Score-Schwelle (A↔B redundant + B↔C redundant → {A,B,C} ein Cluster).

### REQs

| REQ | Beschreibung | Akzeptanzkriterium |
|---|---|---|
| **REQ-RED-001** | `redundancy.service.ts`: pure Score-Engine. Input: elements + connections + standardMappings + Embeddings → Output: `RedundancyCluster[]` mit Score + Parameter-Breakdown pro Cluster | Unit-Test: 3 als Duplikate angelegte Application-Components werden korrekt als Cluster erkannt |
| **REQ-RED-002** | Mongo-Modell `RedundancyCluster`: `{projectId, elementIds, score, parameterBreakdown, recommendation, costSaving, computedAt}` | DB-Doc-Struktur dokumentiert + Indexes |
| **REQ-RED-003** | On-Demand-Endpoint `POST /api/projects/:projectId/scan-redundancies` + Background-Job-Variante (täglich) | curl-Smoke-Test liefert Cluster zurück; Cron-Trigger im Server-Index |
| **REQ-RED-004** | Redundancy-Dashboard: Liste der Top-N-Cluster, sortiert nach Score × Cost-Saving. Pro Cluster: Mini-3D-View, Member-Liste, Score-Bar mit Parameter-Breakdown | UI: BSH-Demo zeigt mind. 1 erkannten Cluster (Risk Management System Duplikate aus Run 3) |
| **REQ-RED-005** | Cost-Saving-Calculation: für jedes Cluster wird die Σ-Kosten der nicht-Lead-Elemente als potenzielles Saving angezeigt | Cluster mit 3 Application-Components × €43K/€48K/€42K → Saving-Range €85K-€91K |
| **REQ-RED-006** | Recommendation-Engine: pro Cluster automatischer Vorschlag "Lead = X (höchste Maturity), Retire = Y, Z" + Begründung | UI zeigt Recommendation-Card mit "Why this lead" |
| **REQ-RED-007** | Drill-Down "Why are these redundant?": klickbare Parameter-Breakdown-Bars zeigen pro Pair und pro Parameter Score + Quelle (z.B. Embedding-Distance, Connection-Jaccard) | Hover auf Score-Bar zeigt Tooltip mit Wert |
| **REQ-RED-008** | One-Click-Action "Apply Recommendation": Lead bleibt, Andere bekommen status='retired' + Connections umgehängt auf Lead | Klick → Confirm-Dialog → Aktion in Audit-Log + Cluster wird auf "resolved" gesetzt |

### Out of Scope (V1)
- Cross-Layer-Redundanz (z.B. Business-Capability ↔ Application-Service als "doppelt") — komplex, V2
- Automatische Anwendung ohne Confirm (Hard-Stop: User entscheidet)

---

## UC-DATA-001 — Generator D: Business-Layer → Data-Objects (Spec-Chain-Lücke schließen)

### Goal
Die Generator-Chain endet aktuell bei Process/Activity (Business-Layer). **Datenobjekte werden nicht generiert** — der Layer-Sprung Business → Information ist eine Lücke. UC-DATA-001 ergänzt Generator D, der aus jedem Business-Process die benötigten Data-Objects ableitet und mit "access"-Relationships verknüpft.

### Warum (BSH-Kontext)
*"Der Übergang von Business zu Datenobjekten ist momentan gar nicht abgedeckt."*

ArchiMate-Spec-Chain ist nur dann tragfähig, wenn JEDE Layer-Verbindung lückenlos generiert/validiert werden kann:

```
Motivation → Strategy → Capability → Process → Activity → ApplicationService → ApplicationComponent → Technology
                                          ↓
                                    Data-Object ← LÜCKE
                                          ↓
                                  Application-Layer Data
```

Ohne Data-Objects ist die Architektur **datenblind** — Compliance-Mappings (DSGVO/CSRD/LkSG fragen oft konkrete Daten ab), Lineage-Analysen, und Cost-Modelle (Datenvolumen → Storage-Kosten) sind nicht möglich.

### Mechanik
1. Eingabe: ein Business-Process oder eine Capability
2. LLM-Prompt: *"Welche Daten produziert/konsumiert dieser Process? Pro Datum: Name, Typ (Customer-PII / Transaktional / Master / Reference), CRUD-Verhalten."*
3. Output validieren gegen ArchiMate-Data-Object-Rules
4. Erzeuge Data-Object-Elemente (information layer)
5. Erzeuge Connections: `Process` --[access:R/W/CRUD]-→ `Data-Object`

### REQs

| REQ | Beschreibung | Akzeptanzkriterium |
|---|---|---|
| **REQ-DATA-001** | LLM-Service `generateDataObjectsFromProcess(processId)`: liefert `{name, dataClass, sensitivity, crudOperations}[]` pro Process | Test: BSH "Collect Emissions Data" Process → ≥3 Data-Objects (Emissions-Record, Facility-Master, Audit-Log) |
| **REQ-DATA-002** | Schema-Validation: jedes generierte Data-Object muss ArchiMate-konform sein (information layer, type ∈ {data_object, data_entity, data_model}) | Validator-Test schlägt fehl wenn LLM unbekannten Type liefert |
| **REQ-DATA-003** | Auto-Connection: jede generierte Data-Object-Beziehung wird mit korrektem `access`-Relationship-Type angelegt (nicht generic "association") | Manuell: nach Generation hat Process die `access`-Edges in Neo4j |
| **REQ-DATA-004** | UI: Button "Generate Data-Objects" im PropertyPanel von Process/Capability/Activity-Elementen | Klick → Modal mit LLM-Stream + Preview vor Apply |
| **REQ-DATA-005** | Bulk-Mode: "Generate Data-Objects for whole project" — iteriert über alle Business-Layer-Elemente, mit Concurrency 5 | Bulk-Run für BSH-Demo → ≥30 Data-Objects neu, ≥60 access-Connections |
| **REQ-DATA-006** | Data-Lineage-View: Filter im 3D-View "show data flows" → zeigt Data-Objects + access-Connections, alles andere gedimmt | Toggle "Data-Lineage" zeigt aufgeräumte Sicht nur auf Information-Layer |
| **REQ-DATA-007** | CRUD-Matrix-Export: 2D-Tabelle Process × Data-Object × C/R/U/D als CSV/PDF | Export liefert Datei mit korrekten Markierungen |
| **REQ-DATA-008** | Sensitivity-Tagging: jedes Data-Object bekommt `sensitivity`-Property (public/internal/confidential/PII). Rendering färbt Data-Objects entsprechend (z.B. PII = rot) | BSH-Demo zeigt PII-Daten (Employee-Records) rot |
| **REQ-DATA-009** | Compliance-Hook: bei `sensitivity=PII` automatisches Mapping gegen DSGVO-Anforderungen (Art. 5/6/9) wenn DSGVO-Standard im Workspace existiert | Auto-Mapping erscheint in Compliance-Matrix für PII-Elemente |

### Out of Scope (V1)
- Automatische Field-Level-Schemas pro Data-Object (V2 — bräuchte Datenbank-Inspection-Connectoren)
- Reverse: Data-Object → suggested Process (V2)

### Bestehende Bausteine
- `aiGenerator.routes.ts` Pattern für Generator-A/B/C — Generator-D folgt demselben Aufbau
- ArchiMate-Rules in `archimate-rules.ts` haben bereits `access`-Relationship-Definitionen
- Standard-Mapping kann erweitert werden um data-object-spezifische Compliance-Regeln

---

## UC-EXEC-001 — C-Level Executive Briefing Board

### Goal
Eine **einseitige, vereinfachte Sicht** auf die Architektur — gemacht für CEO/CFO/Board-Meetings. Keine Element-IDs, keine Type-Codes, keine Layer-Diagramme. Nur **Zahlen, Daten, Fakten** in der Sprache, in der ein Vorstand denkt.

### Warum (BSH-Kontext)
*"Für C-Level ist die Vorstellung einer Architektur zu komplex — gibt es ein Board um Zahlen, Daten, Fakten einfach, verständlich zu präsentieren?"*

Das aktuelle Dashboard zeigt Portfolio-KPIs aber spricht weiterhin EA-Sprache (Compliance-Coverage, Risk-Levels, TOGAF-Phasen). Ein Vorstand fragt:
- "Was sind unsere drei größten Risiken?"
- "Wo liegen wir im Plan?"
- "Was haben wir letzten Monat erreicht?"
- "Was kostet uns die nächste Welle?"

Die EA-Software muss diese Fragen in einer Sprache beantworten, die ohne Erklärung verstanden wird.

### Design-Prinzipien
1. **One-Pager** — alles passt auf einen Bildschirm / eine A4-Seite
2. **Keine Jargon** — "Capability" wird zu "Geschäftsfähigkeit", "Risk Level: critical" wird zu "akute Bedrohung"
3. **Trends statt Snapshots** — wo möglich Sparklines (was hat sich in 30/90 Tagen verändert?)
4. **Top-3 statt Vollständigkeit** — Vorstände wollen die wichtigsten Punkte, nicht Listen
5. **Print-fähig** — PDF-Export A4 hochformat für Board-Mappen

### REQs

| REQ | Beschreibung | Akzeptanzkriterium |
|---|---|---|
| **REQ-EXEC-001** | Neue Route + View `/projects/:projectId/executive-briefing` separat vom Dashboard. Auth wie Dashboard. | URL erreichbar, Layout one-pager |
| **REQ-EXEC-002** | 5 Top-Level-Kacheln: (1) Health-Score "Stabilität", (2) Critical-Hotspots-Count "Akute Bedrohungen", (3) Roadmap-Progress "Plan-Erfüllung", (4) Compliance-Coverage "Gesetzes-Erfüllung", (5) Budget-Burn "Investition" | Alle 5 Werte aus existing Stores; jede Kachel mit Big-Number + Trend-Sparkline |
| **REQ-EXEC-003** | Trend-Lines: für jede Top-Level-Metrik 30/90/180-Tage-Verlauf. Datenbasis aus täglichen Snapshots (neuer Cron-Job). | Sparkline rendert min. 30 Datenpunkte; toggle 30/90/180 Tage |
| **REQ-EXEC-004** | "Top 3 Action Items" Card: AI-kuratiert aus Critical-Hotspots × Roadmap-Deviations × Compliance-Gaps. Pro Item: Klartext-Beschreibung, Impact, empfohlene nächste Aktion | Card zeigt max 3 Items, jeder Eintrag in Klartext (kein Element-ID) |
| **REQ-EXEC-005** | Plain-Language-Renderer: Service der Element-Types/Layer/Risk-Levels in Klartext übersetzt. Konfigurierbare Sprache (DE/EN). | "application_component" → "IT-System", "risk:critical" → "akute Bedrohung" |
| **REQ-EXEC-006** | One-Page-PDF-Export: Klick "Briefing Drucken" → PDF A4 hochformat mit allen Kacheln, optimiert für Schwarz-Weiß-Druck | PDF lädt, ist 1 Seite, lesbar in S/W |
| **REQ-EXEC-007** | Auto-Briefing-Mode: Vollbild-Modus für Board-Room-Display (Smart-TV / Beamer). Rotiert alle X Sekunden zwischen 3-4 Detail-Sichten (Risk-Heatmap, Top-Action-Items, Roadmap-Progress, Budget) | Klick "Beamer-Mode" → Fullscreen, Auto-Rotation alle 15s |
| **REQ-EXEC-008** | "Was hat sich seit letzten Briefing verändert?"-Card: Diff-Highlight (z.B. "2 neue Action-Items, 1 Compliance-Gap geschlossen") | Card zeigt Diff zum letzten Briefing-Snapshot |
| **REQ-EXEC-009** | Branding-Mode: Logo-Upload + Color-Theme pro Workspace. PDF + Briefing-View nutzen Brand-Farben | Settings → Logo + 2-Color-Picker; PDF zeigt Logo |

### Out of Scope (V1)
- Live-Multi-Project-Übersicht (Konzern-Briefing über alle Subsidiaries) — V2
- Editorial-Mode (Vorstandsassistenz kann Action-Items überschreiben) — V2
- Voice-Briefing (TTS-Audio für Auto-Mode) — V3

### Bestehende Bausteine
- `Dashboard.tsx` — bietet existierende KPI-Berechnungen, wird **nicht** ersetzt sondern komplementiert
- `report.service.ts` — PDF-Generation-Pipeline existiert, neue Layout-Variante reicht
- `criticality.service.ts` (UC-CRIT-001) — liefert Top-Action-Items; UC-EXEC-001 hängt von UC-CRIT-001 ab

---

**Bevor ein einziger Code-Edit passiert** — siehe `feedback_preflight_before_plan`:

1. **Pre-Flight-Check pro UC:**
   - Linear durchsuchen: existiert schon ein Issue mit ähnlichem Scope?
   - Codebase-Scan: gibt es bereits eine partielle Implementation?
   - Linear-Issues anlegen (UC + Sub-REQs) per Linear-MCP
2. **8-Kriterien-Scoring** pro REQ — siehe `feedback_requirement_scoring`. Output: WSJF-Ranking, Top-5 für Sprint-Planning
3. **User-Confirmation** der Reihenfolge → erst dann `writing-plans` ausführen
4. **RVTM-Datei** pro UC, dann implementation via `subagent-driven-development`

**Geschätzter Scope (alle 7 UCs):**

| UC | Scope | Sprints | Abhängigkeiten | Konzept-Workshop nötig |
|---|---|---|---|---|
| UC-PLATEAU-001 | small-medium | 1 | keine | nein |
| UC-DATA-001 | medium | 1-2 | keine | leicht (Sensitivity-Klassen) |
| UC-EXEC-001 | medium | 1-2 | UC-CRIT-001 (für Top-Action-Items) | ja (Plain-Language-Mapping) |
| UC-RED-001 | medium | 2 | Embeddings-Infra | ja (Parameter-Gewichte) |
| UC-CRIT-001 | medium | 1-2 | keine (Konzept-Workshop) | ja ("neuralgisch"-Definition) |
| UC-GAP-001 | large | 3-4 | keine | ja (Standard→ArchiMate-Mapping) |
| UC-HARM-001 | large | 3 | UC-GAP-001 (Diff-Viewer geteilt) | ja (Konflikt-Resolution-Workflow) |

**Empfohlene Reihenfolge (vor Pre-Flight + Scoring):**

**Tier 1 — Quick-Wins (Sprint 1-2)** — sofortiger Daily-Value, kleine Footprints:
1. **UC-PLATEAU-001** — Wave-Element-Done-Häkchen → BSH sieht direkt Fortschritt im aktuellen Demo-Projekt
2. **UC-DATA-001** — Generator-D Business→Data → schließt klaffende Spec-Chain-Lücke, große Compliance-Wirkung

**Tier 2 — Konzept-Arbeit + Sprint (Sprint 3-5)** — parallel zum Workshop:
3. **UC-CRIT-001** — Workshop "Was ist neuralgisch?" mit BSH, dann 7-Faktor-Score implementieren
4. **UC-EXEC-001** — baut auf UC-CRIT-001 für Top-Action-Items; Workshop für Plain-Language-Mapping

**Tier 3 — Strategische Hebel (Sprint 6+)** — größter Business-Impact, größter Scope:
5. **UC-RED-001** — wenn Embeddings-Infrastruktur steht (kann mit anderen UCs synergieren)
6. **UC-GAP-001** — Standard-as-Target — Wettbewerbsvorteil, braucht Concept-Workshop
7. **UC-HARM-001** — Architecture-Harmonization — baut auf UC-GAP-001-Diff-Viewer

**Synergien zu nutzen:**
- UC-GAP-001 + UC-HARM-001 teilen sich Diff-Viewer (REQ-GAP-004 / REQ-HARM-001-005)
- UC-CRIT-001 + UC-EXEC-001 teilen sich Critical-Hotspots-Daten
- UC-RED-001 + UC-DATA-001 nutzen beide Embedding-Infrastruktur (1× aufbauen, 2× nutzen)
- UC-PLATEAU-001 + UC-EXEC-001 teilen sich Roadmap-Progress-Berechnung

**Ressourcen-Schätzung gesamt:** ~12-16 Sprints für alle 7 UCs bei sequenzieller Bearbeitung. Bei 2 Tracks parallel: ~8-10 Sprints.

UC-GAP-001 + UC-HARM-001 sind zusammen **die mächtigste Story** — wenn BSH sich dafür begeistert, ist das ein klarer Konzern-Vertrag-Argument. Beide brauchen aber Concept-Work upfront.

---

## Pre-Flight-Findings & Linear-Issues (Tier 1, durchgeführt 2026-05-06)

### UC-PLATEAU-001 → [THE-217](https://linear.app/thearchitect/issue/THE-217)

**Linear-Search Ergebnis:** Parent-UC **THE-60 (UC-ROADMAP-003 TPCV)** existiert, "In Progress", 13 Sub-Issues davon 12 Done. Plateau-View ist Code-Complete mit 33 Unit-Tests. UC-PLATEAU-001 ist eine **additive Erweiterung** — daher als Child von THE-60 angelegt.

**Codebase-Scan Ergebnis:**
- Kein `implementedAt` / `isImplemented` / `markImplemented` im Code → clean slate
- `TransformationRoadmap.waves` ist `Schema.Types.Mixed` → additive Schema-Erweiterung ohne Migration
- Bestehende Dateien zur Erweiterung verifiziert: `WaveCard.tsx`, `plateauComputation.ts`, `PlateauHUD.tsx`, `roadmap.routes.ts`
- Stale UI-Text in `RoadmapPanel.tsx:451` ("Track implementation progress next") — wird durch REQ-PLATEAU-005 zu echtem Feature

**Linear-Issues angelegt:**
| ID | Titel |
|---|---|
| THE-217 | UC-PLATEAU-001 (Parent unter THE-60) |
| THE-218 | REQ-PLATEAU-001: Datenmodell `WaveElement.implementedAt/By/Note` |
| THE-219 | REQ-PLATEAU-002: PATCH-Endpoint Wave-Element-Implementation |
| THE-220 | REQ-PLATEAU-003: UI-Checkbox in WaveCard mit Optimistic Update |
| THE-221 | REQ-PLATEAU-004: Plateau-Progress-Bar (color-coded) |
| THE-222 | REQ-PLATEAU-005: Roadmap-Header Gesamt-Progress + Jump-to-Next |
| THE-223 | REQ-PLATEAU-006: 3D-Check-Badge auf implementierten Elementen |
| THE-224 | REQ-PLATEAU-007: Filter-Toggle Outstanding/Implemented/All |
| THE-225 | REQ-PLATEAU-008: Optional Element-Status-Sync mit Confirm-Dialog |
| THE-226 | REQ-PLATEAU-009: Audit-Trail-Eintrag pro Implementation-Toggle |
| THE-227 | REQ-PLATEAU-010: RBAC ROADMAP_UPDATE-Permission |

### UC-DATA-001 → [THE-228](https://linear.app/thearchitect/issue/THE-228)

**Linear-Search Ergebnis:** Parent-UC **THE-188 (UC-ADD-004 AI-Auto-Generate Architecture-Hierarchy)** existiert, "In Progress" mit Generator A/B/C im Scope. Generator-D (Process → Data-Objects) ist **nicht** in THE-188 — daher als Child von THE-188 angelegt für konzeptuelle Einheit.

**Codebase-Scan Ergebnis:**
- `data_object` ArchiMate-Type bereits in 14 Dateien unterstützt: Parsers (archimate-exchange, leanix), Connectors (sap, servicenow, github), Validators (remediation, smart-cost), Blueprint-Defaults, AI-Mapping-Rules
- `aiGenerator.routes.ts` hat 6 existierende POST-Routen (Generator A/B/C-Varianten) — Generator-D folgt demselben Pattern
- `activityGenerator.service.ts` ist 1:1-Template für `dataObjectGenerator.service.ts`
- ArchiMate-Rules in `archimate-rules.ts` haben `access`-Relationship-Definitionen für Process→Data-Object
- Keine bestehende LLM-driven Process→DataObject-Extraction → clean slate

**Linear-Issues angelegt:**
| ID | Titel |
|---|---|
| THE-228 | UC-DATA-001 (Parent unter THE-188) |
| THE-229 | REQ-DATA-001: LLM-Service generateDataObjectsFromProcess |
| THE-230 | REQ-DATA-002: Schema-Validation gegen ArchiMate-Data-Object-Rules |
| THE-231 | REQ-DATA-003: Auto-Connection Process → Data-Object via access |
| THE-232 | REQ-DATA-004: UI-Button "Generate Data-Objects" in PropertyPanel |
| THE-233 | REQ-DATA-005: Bulk-Mode "Generate Data-Objects for whole project" |
| THE-234 | REQ-DATA-006: Data-Lineage-View (3D-Filter) |
| THE-235 | REQ-DATA-007: CRUD-Matrix-Export (CSV/PDF) |
| THE-236 | REQ-DATA-008: Sensitivity-Tagging mit Color-Coding |
| THE-237 | REQ-DATA-009: Compliance-Hook PII → Auto-Mapping gegen DSGVO Art. 5/6/9 |

### Pre-Flight-Outcome
**Beide UCs bestätigt als rein additiv** — keine Refactor-Risiken, kein Konflikt mit existierenden Issues, klare Wiederverwendung etablierter Patterns. **Implementation kann nach User-Confirmation und 8-Kriterien-Scoring starten.**

### Tier 2 + 3 (UC-CRIT-001, UC-EXEC-001, UC-RED-001, UC-GAP-001, UC-HARM-001)
Pre-Flight + Linear-Issues für diese UCs sind **nach Tier-1-Sprint** geplant — sie brauchen vorgelagerte Concept-Workshops mit BSH (siehe Empfohlene Reihenfolge weiter oben).
