# Automatisiertes Risikomanagement — Prozessarchitektur & Scoring

**Datum:** 2026-07-11
**Status:** Analyse — noch **kein Bau-Ticket**. Nach Review dieser Doku fällt die Bau-Entscheidung (Scoring §6, Schnitt §8).
**Auslöser:** „Bevor ich Kunden auf die Software loslasse, will ich ein automatisiertes Risikomanagement aufbauen." Vorlage war eine Use-Case-Skizze (n8n als Orchestrator, ISO/IEC 15288 §6.3.4).
**Verwandt:** `docs/risk-register.md` (Interim-Board, das *„until this becomes a product feature"* existiert), [[feedback_asilomar_ai_principles]] (Human Control), [[feedback_recursive_development]] (Dogfooding), [[feedback_backlog_rescore_trigger]] (Loop-Engineering / Review-Trigger), [[strategy_trust_spine]] (ATTEST/Notar-Prinzip), UC-RADAR-001 (THE-309, externer Signal-Scanner), UC-GOV-001 (Policy-as-Data, Audit-Substrat).

> **Diese Doku entscheidet den Bau nicht. Sie legt die Prozessarchitektur, die Risiko-Taxonomie und das Register-Schema fest, damit die Bau-Entscheidung auf festem Grund steht.**

---

## 1. Das Problem hinter dem Wunsch

Ein Go-Live gegenüber Kunden ist ein **konsequenter Zustand**: ab dann liegen fremde Daten und fremde Compliance-Pflichten in unserer Hand. „Risikomanagement" heißt hier nicht *ein Skript, das ein Ticket pingt*, sondern ein **nachvollziehbarer, wiederholbarer Prozess**, der Risiken von der Identifikation bis zur Überwachung führt — und der prüfbar ist, wenn ein Kunde (oder ein Auditor) fragt: *„Wie stellt ihr sicher, dass ihr wisst, was schieflaufen kann?"*

Die n8n-Skizze ist ein solider erster Entwurf, hat aber vier Lücken, die genau an den Stellen sitzen, die vor einem Kunden-Launch am meisten wehtun (§3).

---

## 2. Standard-Framing: 15288 als Skelett, 27005 als Fleisch

Die Vorlage nennt **ISO/IEC 15288 §6.3.4 Risk Management Process**. Das ist der *Systems-Engineering-Lifecycle*-Standard — als EA-Prozess-Skelett brauchbar, seine vier Aktivitäten passen:

| 15288-Aktivität | Bedeutung bei uns |
|---|---|
| **Plan Risk Management** | Risiko-Taxonomie + *Risk Appetite* (Schwellen) einmalig definieren — **das leistet diese Doku** |
| **Manage the Risk Profile** | Das append-only **Risk Register** als lückenloses System-of-Record |
| **Analyze Risks** | Likelihood × Impact → Score → Klassifizierung |
| **Treat & Monitor Risks** | Mitigation erzwingen, Residualrisiko nach Behandlung neu bewerten |

Aber für „SaaS-Firma lässt Kunden auf die Plattform" ist die **anwendbare Risiko-Taxonomie** eher **ISO 31000** (generischer Rahmen) + **ISO/IEC 27005** (Informationssicherheits-Risiko), Zielbild **SOC 2 / ISO 27001**. Empfehlung: 15288 gibt den *Ablauf*, 27005 gibt die *Kategorien und das Register-Schema*. Nebeneffekt: TheArchitect mappt diese Frameworks ohnehin schon — das Register wird damit selbst zu einem Compliance-Artefakt.

---

## 3. Kritik an der naiven n8n-Skizze (vier Lücken)

**3.1 Determinismus-Widerspruch.** Die Skizze fordert „hochgradig deterministisch und nachvollziehbar" und schlägt dann **LLM-Scoring** vor. Das beißt sich — ISO verlangt Reproduzierbarkeit.
→ **Score = deterministische Matrix** (Likelihood × Impact aus einer *versionierten* Bewertungstabelle). Das LLM darf **anreichern und vorschlagen** (Kategorie, betroffene Umsysteme, Formulierung), aber nie die Zahl liefern, die das Gate entscheidet. Jeder LLM-Output wird als *Vorschlag* markiert und mit Prompt + Model-Version geloggt.

**3.2 Asilomar #16 wird verletzt — die wichtigste Lücke.** Ihr „Pfad 1: unter Schwelle → automatisch akzeptieren" lässt **das System ein Risiko akzeptieren**. Risiko-**Akzeptanz** ist genau der konsequente Zustand, den bei uns ein **Mensch** entscheidet ([[feedback_asilomar_ai_principles]], `risk-register.md`).
→ Das System darf „Akzeptanz empfohlen" *vorschlagen* — der Accept-Klick bleibt beim Risk Owner. Auto-Akzeptanz nur für explizit vorab-definierte, unkritische Kategorien (whitelist), alles andere braucht Sign-off.

**3.3 Kein geschlossener Loop.** Die Skizze endet bei „Ticket erstellt + geloggt". 15288 §6.3.4 verlangt **Monitor**: schließt das Mitigation-Ticket → **Residualrisiko neu bewerten** → Register updaten. Plus **SLA-Breach-Eskalation**: Deadline überschritten → eskalieren statt still verfallen. Das ist die `Review-Trigger`-Mechanik, die im Interim-Register schon konzipiert ist ([[feedback_backlog_rescore_trigger]]: statische Scores, dynamische Inputs → Re-Score beim Trigger).

**3.4 Instabiler Idempotenz-Key.** `hash(source + risk_title)` bricht, sobald SonarQube seine Meldung umformuliert → Duplikat.
→ Fingerprint = `hash(source + rule_id/cve_id + affected_component)`. Register **append-only / WORM** — Status-Änderungen als neue Zeilen, nie In-Place-Update → echter Audit-Trail.

---

## 4. Zielarchitektur: n8n = Ingest, Engine = TheArchitect

Die Skizze legt die **ganze** Logik in n8n. Das ist für einen Wegwerf-Prototyp ok, verschenkt aber den eigentlichen Hebel. Empfohlene Aufteilung:

```
  Quellen                    n8n (Ingest-Layer)              TheArchitect (Engine + SoR)
  ───────                    ──────────────────              ───────────────────────────
  SonarQube / Datadog  ─┐    Normalisieren → einheitl.       Deterministische Score-Matrix
  GitHub Dependabot    ─┼──▶  Payload  ─── Webhook ───▶       Risk Register (WORM, Postgres/Mongo)
  Jira / ITSM          ─┤    Fingerprint + Dedup             Human-Accept-Gate (Asilomar #16)
  Mitarbeiter-Formular ─┘    Retry/Error-Trigger             Projektion → ArchiMate-Motivation
                                                             Mitigation-Ticket ↔ Residual-Loop
```

- **n8n bleibt** der Connector-/Ingest-Layer (reaktiv Webhook, proaktiv Cron, manuell Form) — das nutzt die vorhandene n8n-Infrastruktur.
- **Engine + Register wandern ins Produkt.** Das Register ist System-of-Record in Postgres/Mongo **und** wird in die ArchiMate-Motivation-Ebene projiziert (Driver = warum, Assessment = Finding, Requirement/Constraint = Response — genau wie `risk-register.md` es vorzeichnet).
- **Konsequenz — Dogfooding:** Euer *erstes* Betriebs-Risikomanagement ist damit gleichzeitig eine **Live-Demo des Produkts** ([[feedback_recursive_development]]). Das Register, das euch vor dem Launch absichert, ist dasselbe Feature, das Enterprise-Kunden später kaufen.

Das erklärt auch, warum „Erst Strategy-Doc" die richtige Wahl war: die Engine gehört nicht in n8n, also ist es kein 2-Tage-Workflow, sondern ein UC mit REQs.

---

## 5. Register-Schema (Entwurf, an 27005 gehängt)

| Feld | Typ | Herkunft |
|---|---|---|
| `fingerprint` | hash(source + ruleId/cveId + component) | Dedup-Key (§3.4) |
| `source` | enum (sonarqube, datadog, dependabot, jira, manual, …) | Trigger |
| `category` | enum (27005: technisch, prozessual, personell, extern, compliance) | LLM-Vorschlag → Mensch bestätigt |
| `affected_component` | ref → CMDB/Self-Model-Element | Anreicherung §4 |
| `likelihood` / `impact` | 1–5 (versionierte Matrix) | **deterministisch** |
| `inherent_score` | likelihood × impact | berechnet |
| `treatment` | enum (accept, mitigate, transfer, avoid) | **Mensch** (Gate) |
| `residual_score` | 1–25 nach Behandlung | Monitor-Loop §3.3 |
| `status` | open → assessed → treating → mitigated / accepted / superseded | Zustandskette (append-only) |
| `review_trigger` | Bedingung, die Re-Evaluation erzwingt | Loop-Engineering |
| `mitigation_ref` | Linear/Jira-Ticket-ID + SLA-Deadline | Treat |
| `owner` · `evidence` · `timestamps` | — | Audit |

Jede Status-Änderung = **neue Zeile** (WORM). Das Register ist damit selbst auditierbar.

---

## 6. Scoring (7 Kriterien × 1–5 → /35 → /100)

| Kriterium | Wert | Begründung |
|---|---|---|
| Business Value | 4 | Launch-Enabler *und* verkaufbares Enterprise-Feature (Risk-Mgmt = EA-Tabellenstake); schärfere USP hat UC-RADAR-001 |
| Business Risk | 4 | Kunden ohne Risikomanagement onboarden = reale Haftungs-/Vertrauens-Exposition; kompetitiv aber kein weißer Fleck |
| Feasibility | 3 | Multi-System (Ingest + Engine + Human-Gate + Loop); Wiederverwendung von Audit-Log (THE-8), Policy-Engine, Motivation-Projektion senkt Aufwand |
| Chance of Success | 3 | Fundamente da (Audit, n8n-Toolchain, Register-Konzept, Motivation-Projektions-Präzedenz), aber Scope breit + Score-Matrix empirisch zu kalibrieren |
| Compliance | 5 | Ist selbst eine Compliance-/Governance-Fähigkeit (15288/27005/SOC 2); Kern der Trust-Spine (ATTEST) |
| Relations | 4 | Speist Self-Model-Dogfooding; verwandt mit RADAR-001, GOV-001, Trust-Spine |
| Urgency | 4 | Vom User als **Launch-Gate** gerahmt („bevor ich Kunden loslasse"); kein fixes externes Datum |

**Priority Score: 27/35 = 77,1 / 100** — solides oberes Backlog-Feld (Trust-Spine-CERT-Niveau), unter der aktuellen Spitze (CHOICE-003 / CTXGOV bei 88,6). Sheet-Sync nach User-Go.

---

## 7. Komplexitätsbewertung nach Ousterhout (Pflicht-Gate)

| Dimension | Verdikt | Begründung |
|---|---|---|
| Ausweiten von Änderungen | **mittel** | Neue Risiko-Domäne (Modelle, Register, Ingest-Webhooks), aber weitgehend additiv; hängt sich an Audit-Log + Motivation-Projektion |
| Kognitive Last | mittel | Etablierter ISO-Prozess mit klaren vier Aktivitäten; Komplexität liegt in der System-Orchestrierung, nicht im Konzept |
| **Unbekannte Unbekannte** | **mittel–hoch** | Payload-Formate externer Quellen (SonarQube/Datadog/Jira) sind erst beim Verdrahten bekannt; die Likelihood×Impact-Matrix muss empirisch kalibriert werden |
| Abhängigkeiten | niedrig–mittel | Wiederverwendung von Eigenem; externe Abhängigkeit = n8n-Instanz + die Quell-APIs |
| Unklarheiten | mittel → sinkt | Risiko-Taxonomie + Appetite-Schwellen sind heute undefiniert — **diese Doku löst das auf** |

**Kein harter Umschnitt-Zwang**, aber **UU ist der Haupt-Watch-Point.** Konsequenz für den Schnitt: erst den Loop *ohne* externe Ingest-Quellen end-to-end beweisen (manuell + deterministische Matrix + Human-Gate), dann eine einzige reale Quelle anschließen. So brennt Slice 1/2 die UU ab, bevor die Fläche wächst.

---

## 8. Empfohlener Schnitt (Slices = 15288-Aktivitäten)

| Slice | Inhalt | 15288-Bezug | Zweck |
|---|---|---|---|
| **0** (diese Doku) | Prozessarchitektur, Taxonomie, Appetite-Schwellen, Register-Schema | Plan | Fester Grund |
| **1** | Manueller Trigger (Human-Meldung) + deterministische Score-Matrix + WORM-Register in TheArchitect + **Human-Accept-Gate** | Analyze + Profile | Loop end-to-end auf euch selbst beweisen, **null externe UU** |
| **2** | **Eine** reaktive Ingest-Quelle via n8n (Vorschlag: GitHub Dependabot oder SonarQube) + Fingerprint-Dedup | Identify | UU einer realen Quelle abbrennen |
| **3** | Closed Loop: Mitigation-Ticket-Close → Residual-Re-Score + SLA-Breach-Eskalation | Treat + Monitor | Den 15288-Kern schließen |
| **4** | Proaktiver Cron-Aggregator + Slack/Teams-Notify (Block Kit) | Monitor | Breite/Komfort zuletzt |

Slice 1 ist bewusst **ohne n8n** — es beweist die Engine + das Gate. n8n kommt erst in Slice 2, wenn es einen echten Payload zu normalisieren gibt.

---

## 9. Offene Entscheidungen (vor dem UC-Ticket)

1. **Risk-Appetite-Schwellen:** Welcher `inherent_score` (1–25) triggert Pfad *akzeptieren* vs. *eskalieren*? Vorschlag: ≤6 empfohlene Akzeptanz (mit Sign-off), 7–14 Mitigation ≤14 Tage, ≥15 sofort + Eskalation.
2. **Register-Speicherort:** Postgres (neu, sauber getrennt) vs. Mongo (bestehend, näher am Rest)? Empfehlung: Mongo + Projektion, um beim Dogfooding nicht zwei Stores zu koppeln.
3. **Erste Ingest-Quelle für Slice 2:** Dependabot (billigste Verdrahtung, GitHub schon angebunden) vs. SonarQube (näher am Security-Narrativ).
4. **Abgrenzung zu UC-RADAR-001 (THE-309):** RADAR schaut *nach außen* (Gesetze/CVEs/Vendor), dieser UC *nach innen* (eigener Betrieb). Sie teilen das „Trigger → Score → Ticket"-Muster — als **gemeinsame Score-/Register-Basis** bauen, nicht doppelt.

---

## 10. Nächster Schritt

Nach Review dieser Doku: RVTM anlegen (`docs/superpowers/rvtm/…`), Linear-UC (`UC-RISK-001`) + REQs pro Slice, Score ins Sheet syncen. Erst dann Code.
