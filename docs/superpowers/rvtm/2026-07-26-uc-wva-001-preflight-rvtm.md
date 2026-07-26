# Pre-Flight RVTM — UC-WVA-001: Workflow Value Assessment (THE-480)

**Datum:** 2026-07-26
**Status:** Pre-Flight abgeschlossen — **Re-Cut vor REQ-Erstellung** (Compliance-Hälfte bereits Done, Value-Hälfte grenzt an THE-474). REQs bewusst NICHT angelegt.
**Linear:** [THE-480](https://linear.app/thearchitect/issue/THE-480/uc-wva-001-workflow-value-assessment-n8n-wertbemessung) (Backlog, High, angelegt 2026-07-15)
**Spec:** `docs/features/UC-WVA-001 Workflow Value Assessment.md`

## 1. Kontext

Self-Serve-Wertbemessung für n8n-Workflows: Builder verbindet Instanz → telemetrie-gestützter Wertbeitrag (€/Jahr, p10/p50/p90) + Compliance-Befund, ausgewiesen als vorzeigbares Zertifikat. Strategischer Rahmen: Nadella-Forderung „messbarer KI-Nutzen" (Lanz+Precht #253), im Kleinen und viral statt Enterprise-Sales. Der kritische Erfolgsfaktor ist die **Glaubwürdigkeit des Scores** — der Bewertete bewertet sein eigenes Werk, daher das dreistufige Vertrauensmodell (deklariert / telemetrie-verifiziert / gegengezeichnet).

Die Spec (2026-07-15) wurde ohne Linear-Umfeld-Scan geschrieben. **Dieser Pre-Flight ist genau deshalb load-bearing:** er korrigiert zwei Gap-Behauptungen der Spec und deckt eine erhebliche Überschneidung mit bereits gelieferter Arbeit auf.

## 2. Linear-Umfeld (Step 1)

| Issue | UC/REQ | Status | Relevanz für WVA-001 |
|---|---|---|---|
| **THE-351** | **UC-WFCOMP-001 Workflow-Compliance-Assessment (DSGVO Art. 30)** | **Done** (2026-06-27) | ⚠️ **Deckt die gesamte Compliance-Hälfte von WVA-001 ab.** `assessWorkflow`-Pipeline (sanitize→scope→lift→trace) über den n8n-Graphen. Score 82,9 |
| **THE-358** | REQ-WFCOMP-001.0 Privacy-by-Design-Adaptergrenze | **Done** | ⚠️ **Ist meine „härteste NFR" (NFR-WVA-01: keine Payloads).** Datenminimierung VOR Ingestion existiert bereits als harte Grenze — kein Neubau |
| THE-352 | REQ-WFCOMP-001.1 Art.-30-Anforderungssatz als Daten | Done | Compliance-Regelwerk als Daten (reuse `Regulation`/`ComplianceRequirement`) |
| THE-353 | REQ-WFCOMP-001.2 Compliance-Lift-Pass (GDPR-Semantik aus n8n-Graph) | Done | = mein FR-09 (Node-Checks). „Zweiter Pass über den importierten n8n-Graphen, `n8n.connector.ts` bleibt unangetastet" |
| THE-355 | REQ-WFCOMP-001.4 Trace-Check-Cypher → Gap-Liste | Done | = mein FR-10 (Datenfluss-Pfad-Checks), das die Spec als „fehlt komplett" führte |
| THE-357 | REQ-WFCOMP-001.6 Drei-Listen-Verdikt (grün/gelb/rot, provenance-gebunden) | Done | Verdikt-Darstellung, provenance-gebunden — direkt für WVA-Report nutzbar |
| THE-360 | REQ-WFCOMP-001.8 Neo4j-Adapter (Lift persistieren + Trace) | Done | **Integrations-Watchpoint:** M1 = In-Memory-Pipeline, „n8n client-seitig geparst → Server bekommt nur {elements,connections}" |
| THE-363 | REQ-WFCOMP-001.9 Live-Quality-Eval (LLM-Vorschläge) | Backlog | LLM-Vorschlags-Qualität — nur relevant, falls WVA LLM-Zweckvorschläge nutzt |
| **THE-474** | **Modul Portfolio Business Case (rNPV/Monte-Carlo/WSJF/MCDA/COCOMO/Real-Options)** | **Backlog** | ⚠️ **Value-Engine-Überschneidung.** Preflight (13.07.) stellte fest: finanzielle Rechen-Engine existiert bereits, Ticket = „Konsolidierung + Komposition, kein Neubau" |
| THE-320/321/322 | UC-PROV-001 / CERT-001 / TRUST-001 (Trust-Spine) | **Done** (2026-06-22) | Fundament des 3-Stufen-Vertrauensmodells — `ProvenanceFields`/`certifiedBy` produktiv |
| THE-333/335 | UC-PROV-002 Connector-Source-Provenance & Origin | **Done** | Connector-Importe stempeln bereits `sourceRef`/`importedAt`/`connectorConfigId` — Stufe-2-Provenance geschenkt |
| THE-111 | REQ-INT-001.1 Integration Connector Framework (`sync()`, Sync-Intervall) | **Done** (2026-07-18) | Sync-Substrat für FR-04 |
| THE-101 | REQ-AHS-001.3 Shareable Health Report (`/report/{id}`, kein Login, CTA) | **Done** (2026-07-18) | = mein FR-14 (teilbarer Public-Link), den die Spec als „fehlt komplett" führte — Muster existiert |
| THE-346 | MCP-UC-7 PDF-Report (PDFKit, 3 Report-Typen) | Backlog | PDF-Export-Substrat für FR-12 |
| THE-349 | MCP-UC-2 BPMN-/n8n-Import | Backlog, Score 51,4 | Geschwister, kein Blocker |

⚠️ **Befund 1 — Compliance-Hälfte ist Done, nicht neu.** Spec führte FR-09 als „EXT" und FR-10/NFR-01 als „fehlt komplett". Tatsächlich: die ganze DSGVO-Assessment-Maschinerie über den n8n-Graphen (Lift, Trace, Gap-Liste, Privacy-Grenze, Golden-Eval) wurde in UC-WFCOMP-001 gebaut und ist Done.

⚠️ **Befund 2 — Value-Hälfte überlappt mit THE-474.** Beide berechnen „Wert" via Monte-Carlo/Cost-Engine. Abgrenzung nötig (nicht zwingend Konflikt): THE-474 = *per-Applikation Investment-Business-Case* (rNPV einer Transformation); WVA = *per-Workflow Laufzeit-Wert* (Telemetrie × Zeitersparnis). Verwandt, aber unterschiedliche Einheit. Wer besitzt die Value-Engine?

⚠️ **Befund 3 — keine Linear-Relationen gesetzt.** THE-480 hat weder `relatedTo` THE-351/THE-474/THE-101 noch `buildsOn` Trust-Spine. Rescore-/Dedup-Trigger greifen dadurch nicht.

## 3. Codebase-Scan & Gap-Matrix (Step 2)

Reuse-Landkarte (verifiziert im Code, siehe auch Deep-Dive in der Spec):

| Baustein | Zustand | Fundstelle |
|---|---|---|
| n8n-Struktur-Import (Workflows+Nodes+Kanten, `n8nWorkflowId`-Anker) | ✅ | `services/connectors/n8n.connector.ts` |
| Periodischer Sync (`syncIntervalMinutes`, Scheduler) | ✅ | `services/sync-scheduler.service.ts`, `models/ConnectorConfig.ts` |
| **Executions-/Telemetrie-Abruf** | ❌ | kein Treffer auf `executions` im Server-Code |
| n8n-Kostenmodell (Stundensatz, Node-Kategorien, Aufwands-Heuristik) | ✅ | `analytics.service.ts:401 ff.`, `roadmap.service.ts:896` |
| Betriebskosten-Benchmarks (matcht auf `n8nType`) | ✅ | `smart-cost.service.ts:64` |
| Monte-Carlo (beta-PERT p10/p50/p90) | ✅ | `analytics.service.ts runMonteCarloSimulation` |
| Trust-Spine (Provenance/Confidence/Zertifizierung) | ✅ | `architecture.types.ts:121-129`; THE-320/321/333 Done |
| **DSGVO-Assessment über n8n-Graph** (Lift/Trace/Gap/Privacy-Grenze) | ✅ **NEU erkannt** | UC-WFCOMP-001 (`assessWorkflow`-Pipeline); THE-351 Done |
| Shareable Public-Report (`/report/{id}`, kein Login) | ✅ **NEU erkannt** | THE-101 Done; `report.service.ts` |
| **Baseline-Erfassung (manuelle Dauer, Stundensatz) mit Provenance** | ❌ | neu |
| **Wert-Komposition + Vertrauensstufen-Ableitung** | ❌ | neu (komponiert Vorhandenes) |

### Gap-Matrix pro Spec-Requirement (Kern des Pre-Flights)

| FR | Spec-Einschätzung | Pre-Flight-Korrektur | Netto |
|---|---|---|---|
| FR-01 Import | HAVE | bestätigt | — |
| FR-02 Executions-Abruf | NEW | bestätigt neu | **NEU** |
| FR-03 Telemetrie-Aggregation (pruning-fest) | NEW | bestätigt neu | **NEU** |
| FR-04 Sync (periodisch+manuell) | EXT | bestätigt (THE-111 Done) | EXT |
| FR-05 Baseline-Erfassung | NEW | bestätigt neu | **NEU** |
| FR-06 Wertberechnung p10/p50/p90 | EXT | ⚠️ **mit THE-474 abgrenzen** — komponiert, ggf. konsumiert THE-474-Engine | EXT (+Klärung) |
| FR-07 Vertrauensstufe ableiten | NEW | Provenance-Substrat Done → dünner als gedacht | NEU (dünn) |
| FR-09 Compliance-Node-Checks | EXT | ✅ **bereits Done via THE-353** | **ENTFÄLLT (compose)** |
| FR-10 Datenfluss-Pfad-Checks | „fehlt komplett" | ✅ **bereits Done via THE-355** | **ENTFÄLLT (compose)** |
| FR-12 Wert-Report (Web+PDF) | EXT | Muster Done (THE-101/THE-346) → dünner | EXT (dünn) |
| FR-14 Public-Link | „fehlt komplett" | ✅ **Muster Done via THE-101** | **ENTFÄLLT (reuse)** |
| NFR-01 keine Payloads | „härteste NFR, neu" | ✅ **bereits erzwungen via THE-358** | **ENTFÄLLT (compose)** |

**Netto-Neubau nach Pre-Flight schrumpft auf drei Dinge:** (a) Telemetrie-Sync (FR-02/03), (b) Baseline-Erfassung (FR-05), (c) Wert-Komposition + Vertrauensstufe (FR-06/07). Alles andere ist Reuse/Compose bereits gelieferter UCs. Die Spec hat den Neubau-Umfang **überschätzt**, weil sie die WFCOMP-Familie und THE-101 nicht kannte.

## 4. WSJF-Scoring (7-Kriterien, UC-Ebene)

| Kriterium | Score (0–5) | Begründung |
|---|---|---|
| Business Value | 4 | Neuer Self-Serve-Markt + viraler Zertifikat-Loop + „messbarer KI-Nutzen"-Narrativ; nicht 5, weil Kategorie „Workflow-Wertbemessung" unbewiesen |
| Business Risk / CoD | 3 | Kein dokumentierter Kundenpull, keine Frist (wie THE-192); aber n8n-Monetarisierung ist ein offenes Wettbewerbsfenster. Weichste Zahl |
| Impl. Challenges (Feasibility) | 4 | **Hochgestuft durch Pre-Flight:** Compliance-Hälfte Done, Value-Engine existiert, Netto-Neubau = Telemetrie+Baseline+Komposition |
| Chance of Success | 4 | Fundamente vollständig + validiert (WFCOMP, Trust-Spine, Report Done); unbewiesen ist die **Marktadoption**, nicht die Technik |
| Compliance | 4 | Komponiert die fertige Art.-30-Assessment + Privacy-by-Design-Grenze — hohe Compliance-Substanz ohne Neubau |
| Relations | 4 | Komponiert THE-351/THE-474/THE-101/Trust-Spine; zugleich **Überschneidungs-Risiko**, das aufgelöst werden muss |
| Urgency | 2 | Kein externer Termin; opportunistischer Self-Serve-Launch |

**Priority Score = 25/35 ≈ 71,4 / 100** — oberes Mittelfeld. Einordnung: unter den Backlog-Spitzen (WFCOMP 82,9 · CHOICE-003 88,6 · CTXGOV 88,6), über den zurückgestellten (CHOICE-002 52,9 · RED-002 51,4), nahe THE-478 (77,1). **Hinweis:** Der Score gilt für den **re-geschnittenen** UC (Compose statt Rebuild). Ohne Re-Cut wäre Feasibility niedriger und der Score ~63.

> Vergleich zum RICE-Score im Issue (56): RICE und WSJF sind nicht direkt vergleichbar (RICE teilt durch Effort, WSJF nicht). Beide platzieren WVA „attraktiv, aber mit unsicherem Markt-Faktor" — die verwundbarste Größe ist in beiden der Reach/BizR (Marktadoption), nicht der Aufwand.

## 5. Komplexitätsbewertung nach Ousterhout (Pflicht-Gate)

| Dimension | Verdikt | Begründung |
|---|---|---|
| Ausweiten von Änderungen | **niedrig** | Telemetrie = isoliertes neues Modell + ein Connector-Fetch; Wert-Komposition ruft vorhandene Services. Kein Query-weiter Refactor |
| Kognitive Last | niedrig–mittel | Vertrauensstufen-Logik und Monte-Carlo-Komposition sind etablierte Muster; das 3-Stufen-Modell ist bereits im Trust-Spine gedacht |
| Unbekannte Unbekannte | **niedrig–mittel** (war mittel) | (a) **Markt** — adoptieren externe Builder das? (product-UU, nicht tech, bleibt). (b) **Baseline bleibt kontrafaktisch** (manuelle Dauer = Annahme). (c) **Integration — AUFGELÖST** (Code-Check 2026-07-26, siehe §6.1): thin Adapter am Raw-Fetch-Seam, keine offene tech-Unbekannte mehr |
| **Abhängigkeiten** | **mittel–hoch** | Komponiert/überschneidet THE-351 (Compliance, Done), THE-474 (Value-Engine, Backlog), THE-101 (Report, Done), Trust-Spine (Done). Keine echten Blocker, aber **Overlap muss aufgelöst werden**, sonst Doppelbau |
| Unklarheiten | mittel | 5 offene Produktfragen der Spec + neue Re-Cut-Frage (Value-Engine-Ownership) |

**Regel-Anwendung:** Der harte Umschnitt-Zwang triggert bei *UU hoch UND Deps hoch* (CHOICE-002) bzw. *UU hoch ODER Deps hoch* (CHOICE-003). Hier: UU = mittel, Deps = mittel–hoch → **kein harter Umschnitt-Zwang, aber ein Scope-Re-Cut ist klar geboten** (Compose statt Rebuild), weil sonst nachweislich Done-Arbeit doppelt gebaut würde.

**Haupt-Watch-Point (AUFGELÖST 2026-07-26, §6.1):** Der Integrations-Punkt — ob live-gesyncte Workflows dieselbe Assessment-Pipeline durchlaufen. Code-Check ergab: thin Adapter am Raw-Fetch-Seam, mit einer wichtigen Falle (der naive Weg über den persistierten Graphen liefert *falsche Negative*). **Verbleibender Watch-Point:** Value-Engine-Ownership gegenüber THE-474 (Produktentscheidung, kein Code-Risiko).

## 6. Verdikt & empfohlener Schnitt

**THE-480 ist spezifikationsreif NACH Re-Cut + zwei Klärungen** — nicht als From-Scratch-Build, sondern als **Komposition + dünne Neubau-Schicht**.

**Re-Cut (verbindlich):**
- FR-09, FR-10, FR-14, NFR-01 aus dem Neubau streichen → **komponieren** (UC-WFCOMP-001 Assessment + Privacy-Grenze, THE-101 Report-Muster).
- Neu-Bau-Kern reduziert auf: **Telemetrie-Sync** (FR-02/03), **Baseline-Erfassung** (FR-05), **Wert-Komposition + Vertrauensstufe** (FR-06/07). Das ist v1.

**Zwei Klärungen vor REQ-Erstellung:**
1. **Value-Engine-Ownership (Scope):** Besitzt WVA eine eigene Wertformel oder konsumiert es die THE-474-Engine? Empfehlung: WVA definiert die *workflow-spezifische* Formel (Telemetrie × Zeitersparnis − Betriebskosten), nutzt aber die *gemeinsame* Monte-Carlo-/Cost-Engine — keine zweite Finanzmaschine.
2. **Pipeline-Integration (Code-Check): ✅ AUFGELÖST** — siehe §6.1.

## 6.1 Klärung 2 — AUFGELÖST (Code-Check 2026-07-26)

**Frage:** Sind server-gesyncte n8n-Workflows für die `assessWorkflow`-Compliance-Pipeline nutzbar?

**Befund — die naive Annahme ist falsch, aber der richtige Weg ist billig:**

- `assessWorkflow(rawN8nJson)` (`services/wfcomp/assess.ts:20-27`) konsumiert **das rohe n8n-Workflow-JSON inkl. `node.parameters`** — **nicht** `{elements, connections}` und **nicht** den Neo4j-Graphen. Die Scope-Erkennung (`scope.ts:39-41`) und der Lift (`lift.ts:31-68`) leiten alles aus `node.parameters` ab (PII-Parameter-Keys + Ziel-Hostnames).
- ⚠️ **Falle:** Der Connector-Parse (`n8n.connector.ts:133-211`) **wirft `node.parameters` weg** und persistiert nur Struktur. Wer die Pipeline auf den **persistierten** `source:'n8n'`-Graphen zeigt, bekommt für *jeden* Workflow „nicht im Scope" — **stille Falsch-Negative.** Der offensichtliche Weg ist genau der falsche.
- ✅ **Der richtige Seam:** Das rohe JSON liegt server-seitig bereits vor — `fetchWorkflow` (`n8n.connector.ts:222-225`, `GET /workflows/:id`) liefert es vollständig, bevor `parseWorkflow` (`n8n.connector.ts:118-119`) es reduziert. Genau dort andocken: pro `fullWf` ein `assessAndStore({ projectId, wfcompId: <n8n-Workflow-Id>, raw: fullWf })` (`services/wfcomp/store.ts:29`).
- ✅ **Privacy gratis:** `sanitize` läuft als **erster** Schritt *innerhalb* der Pipeline (`assess.ts:44`, `sanitize.ts:78` — verwirft `pinData`/`credentials`/Parameter-*Werte*, behält nur Keys+Struktur). Übergabe des Roh-JSON ist damit automatisch DSGVO-sicher — **NFR-01 ist im Compose-Weg erfüllt, kein separater Sanitize-Pass nötig.**
- ✅ **Idempotenz gratis:** `wfcompId = n8n-Workflow-Id` → `persist.ts:44-47` + Mongo-Upsert (`store.ts:39-52`) re-assessen sauber bei jedem Sync.

**Konsequenz für den Schnitt:** Compliance-Compose ist bestätigt billig (**ein Aufruf am Fetch-Seam**, THE-360-analoger Adapter entfällt), aber es ist **nicht** „gratis über den vorhandenen Graphen" — es braucht den expliziten Hook am Raw-JSON. Das wird ein eigener kleiner REQ (FR-09-compose), kein Null-Aufwand. UU-Dimension sinkt dadurch von mittel auf niedrig–mittel.

**Sofort-Hygiene in Linear (unabhängig vom Bau):**
- THE-480 `relatedTo` THE-351, THE-474, THE-101 setzen; `buildsOn` Trust-Spine (THE-320) vermerken.
- Score im Issue von RICE 56 auf die re-cut-Realität aktualisieren (Compliance-Hälfte entfällt als Aufwand).

**Empfohlene Bau-Reihenfolge (nach Klärungen):**
FR-02 (Executions-Fetch, nur Metadaten) → FR-03 (`WorkflowTelemetry`-Aggregation, pruning-fest) → FR-04 (Scheduler-Verdrahtung) → FR-05 (Baseline-UI + Provenance) → FR-06 (Wert-Komposition p10/p50/p90) → FR-07 (Vertrauensstufe = min. Stufe der Inputs) → Compliance-Compose (THE-351-Pipeline andocken) → FR-12 (Report = THE-101-Muster + Werte + Verdikt).

**Analog zu CHOICE-002:** REQs werden hier **bewusst noch nicht angelegt** — erst nach den zwei Klärungen und dem Setzen der Relationen. Das verhindert, dass REQs auf sich bewegendem Grund (Value-Engine-Ownership) oder Doppelarbeit (Compliance) gebaut werden.

## 7. Traceability

| Artefakt | Referenz |
|---|---|
| Parent-Issue | THE-480 (Backlog, High) |
| Spec | `docs/features/UC-WVA-001 Workflow Value Assessment.md` |
| Compliance-Vorläufer (Done, compose) | THE-351 (+ THE-352/353/355/357/358/360) |
| Value-Engine-Nachbar (klären) | THE-474 |
| Report-Muster (Done, reuse) | THE-101, THE-346 |
| Trust-Fundament (Done) | THE-320 / THE-321 / THE-322 / THE-333 |
| Sync-Substrat (Done) | THE-111 |
| REQs | — bewusst nicht angelegt (Re-Cut-Gate) |
| Scoring | §4 (WSJF 71,4; Sheet-Sync ausstehend) |
| Vorbild-Pre-Flights | 2026-07-11-uc-choice-002 (Rückstellung), -003 (spez.-reif nach Klärung) |
