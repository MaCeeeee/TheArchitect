# Fehler-/Problemmanagement + geteilte Operational Governance Engine

**Datum:** 2026-07-11
**Status:** Analyse — **kein Bau-Ticket**. Nach Review fällt die Bau-Entscheidung (Struktur §7, Schnitt §8).
**Auslöser:** „Bevor ich Kunden auf die Software loslasse, will ich ein automatisiertes Fehler- und Problemmanagement aufbauen." Vorlage war eine Use-Case-Skizze (n8n als Orchestrator, ISO/IEC 15288 §6.3.7 Problem Resolution Process, Incident/Defect/Problem-Trennung).
**Companion zu:** [`docs/strategy/2026-07-11-automated-risk-management.md`](2026-07-11-automated-risk-management.md) (UC-RISK-001, proaktives Risiko). **Diese Doku ist der reaktive Zwilling** und legt die **geteilte Engine** fest, auf der beide UCs stehen.
**Verwandt:** `docs/risk-register.md` (Interim-Board), UC-RADAR-001 (THE-309 / THE-310 `RadarSignal` + `BaseSignalCrawler` = Ingest-Fundament), THE-8 (Audit-Trail), [[feedback_asilomar_ai_principles]] (Human Control), [[feedback_backlog_rescore_trigger]] (Review-Trigger), [[feedback_recursive_development]] (Dogfooding), [[strategy_trust_spine]] (ATTEST).

> **Nutzer-Entscheidung 2026-07-11: „Eine Engine, zwei Linsen."** RISK (proaktiv) und PROBLEM (reaktiv) teilen ~80 % Infrastruktur. Diese Doku definiert die geteilte Foundation genau einmal und hängt beide Linsen daran. Kein zweiter n8n-Workflow, kein zweites Register.

---

## 1. Das Problem hinter dem Wunsch

Ein Go-Live gegenüber Kunden macht Betriebs-Störungen zu einem **konsequenten Zustand**: ab dann kostet ein unbehandelter Fehler fremdes Vertrauen und ggf. fremde Compliance-Pflichten. „Fehlermanagement" heißt hier nicht *ein n8n-Flow, der ein Jira-Ticket pingt*, sondern ein **nachvollziehbarer, wiederholbarer Prozess** von der Meldung bis zur verifizierten Behebung — prüfbar, wenn ein Kunde oder Auditor fragt: *„Wie stellt ihr sicher, dass ein gemeldeter Fehler nicht verloren geht und die Ursache wirklich behoben wurde?"*

Die n8n-Skizze ist ein **konzeptionell starker** erster Entwurf (der `P_score` ist bewusst deterministisch — richtig). Vier Stellen fehlen, und es sind genau die, die vor einem Kunden-Launch am meisten wehtun (§4).

---

## 2. Standard-Framing: 15288 §6.3.7 als Ablauf, ITIL/ISO 20000 als Vokabular

Die Vorlage nennt korrekt den **Problem Resolution Process**. Der 15288-Ablauf passt als Skelett; das operative Vokabular (Incident/Defect/Problem, SLA, Known Error) kommt aus **ITIL / ISO/IEC 20000**. Empfehlung: 15288 gibt den *Prozess*, ITIL gibt die *Objekt-Taxonomie und den Lifecycle*.

| Prozess-Aktivität (15288 §6.3.7) | Bedeutung bei uns |
|---|---|
| **Identify & Record** | Webhook-Ingest, Schema-Validierung, unveränderliche Erfassung |
| **Analyze & Prioritize** | Deterministischer `P_score` (Severity×Urgency×Criticality − Mitigation) |
| **Resolve / Correct** | Routing → Ticket → Fix, Human-Gate an ausgehenden Aktionen |
| **Track & Verify Closure** | **Fix verifizieren**, verknüpfte Incidents mit-schließen, SLA-Breach eskalieren, Trend-Analyse |

---

## 3. Die konzeptionelle Kette: Incident → Defect → Problem

Die Skizze trennt Incident/Defect/Problem richtig. Als **Datenmodell** ist das eine N:1-Kaskade — und genau diese Kaskade macht deinen „Occurrence Counter" und die Priorisierung überhaupt erst tragfähig:

```
  Incident (Symptom, akut)  ──┐
  Incident                    ├──▶  Defect (Code-Abweichung)  ──┐
  Incident  ──────────────────┘                                 ├──▶  Problem (systemische Ursache)
  Incident  ─────────────────────▶  Defect  ────────────────────┘
```

- **Incident** = eine akute Auftreten-Instanz (das, was der Webhook meldet). Erhöht den `occurrence_counter` seines Defects.
- **Defect** = eine Code-/Spec-Abweichung. Das ist die Einheit, die ein Entwickler *fixt*.
- **Problem** = die zugrundeliegende systemische Ursache (ein Problem kann mehrere Defects bündeln). Das ist die Einheit, die in die **ArchiMate-Motivation-Ebene** projiziert wird (Problem = Driver/Assessment) → Dogfooding.

Dedup arbeitet auf **Defect**-Ebene: neuer Incident mit gleichem Fingerprint → kein neuer Defect, sondern Counter++ und Log-Verknüpfung.

---

## 4. Kritik an der n8n-Skizze (vier Lücken)

**4.1 Determinismus — schon fast gelöst.** Der `P_score` als Code-Node-Formel ist deterministisch ✅ (besser als die Risk-Skizze). **Falle:** Schritt 2 nutzt das LLM für Dedup *und* Routing.
→ LLM darf **anreichern/vorschlagen** (Duplikat-Kandidat, Kategorie, betroffene Komponente, Formulierung), aber nie die Zahl liefern, die das Gate entscheidet. Jeder LLM-Output = *Vorschlag*, geloggt mit Prompt + Model-Version. Die semantische Ähnlichkeit ist ein *Kandidaten-Vorschlag*, die Merge-Entscheidung fällt gegen einen deterministischen Fingerprint (§6) oder einen Menschen.

**4.2 Asilomar #16 — zwei Auto-Aktionen sind konsequente Zustände.** „Pfad A → Auto-Paging On-Call" ist ok (dafür existiert On-Call). Aber:
- **„Pfad C → automatische Antwort an den Melder"** = ausgehende Nachricht an einen Menschen → **Template mit Bestätigung**, kein Blind-Send ([[feedback_asilomar_ai_principles]]).
- **„Rauschen automatisch abweisen"** = das System entscheidet, dass etwas *kein* Defect ist → System schlägt „Noise" vor, Mensch bestätigt (oder Whitelist für vorab-definierte, unkritische Kategorien).

**4.3 Kein geschlossener Loop — die eigentliche §6.3.7-Anforderung.** Die Skizze endet bei „Ticket + Audit-Log". Der Problem Resolution Process verlangt mehr:
- **Verify Closure:** Bevor ein Defect geschlossen wird → *ist der Fix wirksam?* (Test grün / Incident-Rate fällt). Sonst Re-Open.
- **Cascade-Close:** Defect geschlossen → verknüpfte Incidents mit-schließen; Problem geschlossen, wenn alle Defects zu → status-propagation.
- **SLA-Breach-Eskalation:** Deadline überschritten → eskalieren statt still verfallen ([[feedback_backlog_rescore_trigger]]).
- **Trend-Analyse:** mehrere Incidents/Defects → *Problem* erkennen (Known-Error-Bildung).

**4.4 Instabiler Idempotenz-Key.** `hash(source + title)` bricht, sobald Sentry/QA die Meldung umformuliert → Duplikat trotz Dedup.
→ Fingerprint aus **stabilen** Feldern: `hash(system_component + normalized_stacktrace_top_frame + rule_id/error_type)`, nicht Freitext-Titel. Register **append-only / WORM** — Status-Änderungen als neue Zeilen.

---

## 5. Zielarchitektur: die geteilte Operational Governance Engine

Beide Linsen (RISK, PROBLEM) sind derselbe Mechanismus mit unterschiedlichem Eingangs-Objekt und unterschiedlicher Score-Formel. Deshalb **eine** Engine im Produkt, n8n nur als Ingest.

```
  Quellen                       n8n (Ingest-Layer)             TheArchitect (Engine + SoR)
  ───────                       ──────────────────             ───────────────────────────
  GitHub/Sentry/Support  ─┐     Webhook + Schema-Validierung   Deterministische Score-Matrix
  (PROBLEM-Linse)         ├──▶  Normalisieren → kanonische      WORM-Register (Incident/Defect/
  SonarQube/Dependabot   ─┘     Payload                          Problem  +  Risk = eine Tabelle,
  (RISK-Linse)                  Fingerprint + Dedup-Kandidat      diskriminiert per `kind`)
                                Retry / Error-Trigger           Human-Gate (Asilomar #16)
                                                                Routing (Switch) + Ticket-Sync
                                                                Closed Loop: Verify + Cascade + SLA
                                                                Projektion → ArchiMate-Motivation
```

**Wiederverwendung, die das Feasibility-Rating trägt:**
- **THE-310 `RadarSignal` + `BaseSignalCrawler` + Cron + Dedup** — dasselbe „normalisieren → kanonisch → dedup"-Muster; der Webhook-Ingest ist die reaktive Variante des Crawler-Pull.
- **THE-8 Audit-Trail** — dein Schritt-5-Audit-Log existiert.
- **RISK-Engine (aus dem Companion-Doc)** — Score-Matrix, WORM-Register, Human-Gate, Closed-Loop sind identisch; PROBLEM erbt sie.

**Dogfooding:** Euer erstes Betriebs-Fehlermanagement ist gleichzeitig die Live-Demo des Produkts ([[feedback_recursive_development]]).

---

## 6. Register-Schema — ein Register, zwei Linsen

Das WORM-Register aus dem Risk-Doc wird um Defect-/Problem-Felder erweitert und per `kind` diskriminiert. Gemeinsame Felder tragen beide Linsen:

| Feld | Gilt für | Herkunft |
|---|---|---|
| `kind` | beide | `risk` \| `incident` \| `defect` \| `problem` |
| `fingerprint` | beide | Dedup-Key (§4.4) |
| `source` | beide | enum (github, sentry, sonarqube, dependabot, support, manual, …) |
| `system_component` | beide | ref → Self-Model/CMDB-Element |
| `severity` `urgency` `criticality` | PROBLEM | 1–5 (versionierte Matrix) |
| `likelihood` `impact` | RISK | 1–5 (versionierte Matrix) |
| `p_score` / `inherent_score` | beide | **deterministisch** berechnet |
| `occurrence_counter` | incident→defect | ++ bei Fingerprint-Treffer |
| `parent_ref` | incident→defect→problem | N:1-Kaskade (§3) |
| `treatment` / `routing_path` | beide | **Mensch** am Gate |
| `mitigation_ref` + `sla_deadline` | beide | Linear/Jira-ID + Frist |
| `verified_closed` | PROBLEM | Fix-Wirksamkeit bestätigt (§4.3) |
| `status` | beide | Zustandskette, append-only |
| `owner` · `evidence` · `timestamps` | beide | Audit |

Jede Status-Änderung = **neue Zeile** (WORM). Das Register ist selbst ein Compliance-Artefakt.

---

## 7. Bewertung & Zwei-UC-Struktur

**Scoring UC-PROBMGMT-001 (7-Kriterien-Matrix):**

| Krit. | Wert | Begründung |
|---|---|---|
| Business Value | 4 | Launch-Enabler + verkaufbares ITSM/Ops-Feature |
| Business Risk | 4 | Kunden ohne Defect-Prozess onboarden = Haftungs-/Vertrauens-Exposition |
| Feasibility | 4 | sehr hohe Wiederverwendung (RADAR-Ingest THE-310 + Audit THE-8 + RISK-Engine) |
| Chance of Success | 3 | Fundamente da, aber Score-Matrix empirisch zu kalibrieren + Scope breit |
| Compliance | 5 | ist selbst eine Governance-Fähigkeit (15288/20000/SOC 2) |
| Relations | 5 | teilt Engine mit RISK-001, nutzt RADAR-Infra, speist Self-Model/Dogfooding |
| Urgency | 4 | vom Nutzer als **Launch-Gate** gerahmt |

**Score: 29/35 = 82,9 / 100** — oberes Backlog-Feld, leicht über RISK-001 (77,1), weil Feasibility+Relations durch die RADAR-Wiederverwendung höher liegen. Unter der aktuellen Spitze (88,6).

**Ousterhout (Pflicht-Gate):** Unbekannte Unbekannte = **mittel** (niedriger als RISK — RADAR hat das Normalisierungs-/Dedup-Muster schon bewiesen); Change-Amplification mittel (additiv); Kognitive Last mittel (etablierter ITIL/15288-Prozess). → Slice 1 ohne externe Quellen brennt die UU ab, bevor Fläche wächst.

**Zwei-UC-Struktur auf einer Foundation:**

```
  UC-OGE-000 (diese Doku)  — geteilte Foundation: Register-Schema, Score-Matrix-Mechanik,
                             Human-Gate, Closed-Loop, n8n-Ingest-Kontrakt
      │
      ├── UC-RISK-001      (proaktive Linse — Companion-Doc, Score 77,1)
      └── UC-PROBMGMT-001  (reaktive Linse — diese Doku, Score 82,9)
```

Bau-Reihenfolge-Empfehlung: **PROBMGMT zuerst**, weil (a) es die konkretere Launch-Angst adressiert, (b) es die RADAR-Ingest-Wiederverwendung sofort validiert, (c) die Engine, die es baut, RISK-001 danach fast geschenkt macht.

---

## 8. Empfohlener Schnitt (Slices = §6.3.7-Aktivitäten)

| Slice | Inhalt | 15288-Bezug | Zweck |
|---|---|---|---|
| **0** (diese Doku) | Foundation: Register-Schema, Score-Matrix, Gate, Loop-Kontrakt | — | Fester Grund |
| **1** | Webhook + **strikte Schema-Validierung** (HTTP 400 bei Fehlformat) + deterministischer `P_score` + WORM-Register + **Human-Gate an ausgehenden Aktionen** | Identify + Analyze | Loop end-to-end, **null externe UU**, kein LLM |
| **2** | **Eine** reale Quelle (Vorschlag: Sentry *oder* GitHub) + stabiler Fingerprint-Dedup + `occurrence_counter` | Identify | UU einer realen Quelle abbrennen |
| **3** | Closed Loop: Verify-Closure + Cascade-Close verknüpfter Incidents + SLA-Breach-Eskalation | Track + Verify | den §6.3.7-Kern schließen |
| **4** | LLM-Anreicherung (Duplikat-Vorschlag, Kategorie, Problem-Trend-Erkennung) + Notify (Slack/Teams) | Analyze + Monitor | Komfort/Breite zuletzt, LLM *nur* als Vorschlag |

Slice 1 bewusst **ohne n8n-Quelle und ohne LLM** — es beweist Engine + Gate. Reale Quelle erst in Slice 2, LLM erst in Slice 4 (als Vorschlags-Layer, §4.1).

---

## 9. Offene Entscheidungen (vor dem UC-Ticket)

1. **Score-Gewichte & Schwellen:** `P = w1·S + w2·U + w3·C − M`. Startwerte + welcher `P_score` triggert Pfad Kritisch/Normal/Noise? Empirisch zu kalibrieren, Startvorschlag in Slice 1.
2. **Erste reale Quelle für Slice 2:** **Sentry** (näher am „Memory-Leak/Stacktrace"-Beispiel deiner Skizze) vs. **GitHub Issues/Actions** (billigste Verdrahtung, schon angebunden).
3. **Register-Speicherort:** Mongo (bestehend, näher am Rest — Empfehlung) vs. Postgres (sauber getrennt). Muss mit der RISK-Entscheidung übereinstimmen (ein Register).
4. **Paging-Kanal für Pfad A:** PagerDuty/Opsgenie vorhanden? Sonst Slice 3/4 auf Slack-Alert reduzieren.

---

## 10. Nächster Schritt

Nach Review dieser Doku: RVTM anlegen (`docs/superpowers/rvtm/2026-07-11-uc-probmgmt-001-rvtm.md`), Linear-UCs **UC-PROBMGMT-001** (+ REQs pro Slice) und **UC-RISK-001** auf die gemeinsame Foundation setzen, Scores ins Sheet syncen. Erst dann Code.
