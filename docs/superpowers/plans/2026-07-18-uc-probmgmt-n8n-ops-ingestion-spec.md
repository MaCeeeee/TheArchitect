# Spec — n8n Ops-Register Ingestion (UC-PROBMGMT-001, ISO 15288 §6.3.7)

**Datum:** 2026-07-18
**Autor:** Pre-Flight + Spec via `/grill-with-docs`
**Kontext-Frage (User):** „8-Schritt Problem-/Fehlermanagement als n8n-Workflow für automatische Fehlerregistrierung und Problembehandlung mit TheArchitect."
**Verwandte Issues:** THE-443 (UC, Done) · THE-445/446/447/476/477 (Done) · THE-478 (Backlog) · THE-450 (Backlog) · THE-371 (Heartbeat)

---

## 0. TL;DR — Pre-Flight-Verdikt: Der Kern existiert schon

Der Pre-Flight hat **zwei aktive, produktive n8n-Workflows** gefunden, die den Großteil der abgestimmten Lösung bereits umsetzen. **Dies war kein Greenfield-Bau, sondern ein Audit + Delta.** Ergebnis: **GAP-1 gefixt & published** (§5), GAP-2/3 bewusst offen gelassen.

**Wichtige Standort-Korrektur:** Die Workflows liegen auf **n8n Cloud (`macee.app.n8n.cloud`)**, nicht auf dem in CLAUDE.md genannten self-hosted `n8n.just4.io`. Sie posten gegen **Prod = `https://thearchitect.site`**.

---

## 1. Die 8 Schritte (ISO 15288 abgeleitet) → wo sie leben

| # | Schritt | Umsetzung | Status |
|---|---------|-----------|--------|
| 1 | Erfassen/Melden + Dedup | n8n Sentry-Webhook → `POST /api/ops/register/ingest` | **LIVE** |
| 2 | Klassifizieren/Priorisieren | Engine `scoreAndRoute()` (pScore, routingPath, SLA) | LIVE (Backend) |
| 3 | Root-Cause | THE-448 LLM-Vorschlag (nur Vorschlag) | LIVE (Backend), n8n nicht beteiligt |
| 4 | Korrektur vorschlagen + Human-Gate | Engine `proposedActions` + `POST …/:chainId/gate` (UI) | LIVE (Backend + THE-477 UI) |
| 5 | Umsetzen (Code-Fix) | extern | Mensch |
| 6+7 | Verifizieren + Schließen | `POST …/:chainId/close` (tests-green, Kaskade) | LIVE (Backend + UI) |
| 8 | Lernen/Prävention | n8n SLA-Cron → `/sla-sweep`; `suggest-problems/-duplicates` | **Cron LIVE**, Suggest-Sweeps ungenutzt |

n8n ist die **Orchestrierungs-Hülle** (einsammeln, normalisieren, posten, Cron). Die 8-Schritt-Fachlogik bleibt im Backend (WORM, Audit, Human-Gates). Bestätigte Design-Locks:
- **Scope:** Ops-Register (system-weit, `/api/ops/register/*`), nicht projekt-scoped.
- **Notifications:** Backend `opsNotify.service` sendet Echtzeit-Alerts (kritisch/SLA) selbst → n8n benachrichtigt **nicht** (keine Duplikate).
- **Scoring:** deterministisches Mapping in n8n (kein LLM im Ingest-Pfad).
- **Auth:** `x-api-key: ta_…` eines Users mit Rolle `chief_architect`/`enterprise_architect`.

---

## 2. Ist-Zustand der zwei Live-Workflows

### 2.1 „Sentry → Register Ingest (THE-446)" — id `3QMcMgiKMh7WsFei`, aktiv
- **Trigger:** Webhook `POST /webhook/sentry-defect-ingest`
- **Normalize (Code-Node):** Sentry-Payload → kanonische Defect-Payload
- **POST:** `https://thearchitect.site/api/ops/register/ingest`, Auth `httpHeaderAuth` (`X-API-Key`) ✅ bereits auf Ops-Scope migriert
- **Aktuelles Mapping:**
  - `severity = levelMap[level]` mit `{fatal:5, error:4, warning:3, info:2, debug:1}`, Default `4`
  - `urgency = 1` (**hardcodiert**)
  - `criticality = 3` (**hardcodiert**, environment-unabhängig)
  - `systemComponent = tags.component ?? project_slug ?? 'unknown'`
  - `environment = event.environment ?? tags.environment ?? 'production'`
  - `title/description/stackTrace(top-frame)/errorType/eventId` sauber gemappt

### 2.2 „Register SLA Sweep — Daily Cron (THE-447)" — id `cweHcyNrFjGVt6Jg`, aktiv
- **Trigger:** Schedule, **täglich 07:00**
- **POST:** `https://thearchitect.site/api/ops/register/sla-sweep`, gleiche Auth ✅ Ops-Scope
- Idempotent; Eskalations-Notify feuert serverseitig.

---

## 3. Gap-Analyse (Ist vs. abgestimmtes Design)

### GAP-1 (SUBSTANZIELL — Correctness): Prod-Fehler mis-routen als NORMAL statt CRITICAL
Engine-Gewichte: `P = 2·sev + 1·urg + 1.5·crit − mit`; **critical ≥ 16**, noise ≤ 5.

Ein **einzelner Production-Fatal** mit dem Live-Mapping (`sev5, urg1, crit3`):
```
P = 2·5 + 1·1 + 1.5·3 − 0 = 15.5  →  NORMAL  (14-Tage-SLA, KEIN Critical-Notify)
```
Mit dem abgestimmten Mapping (`sev5, urg4, crit5`):
```
P = 2·5 + 1·4 + 1.5·5 − 0 = 21.5  →  CRITICAL  (1-Tag-SLA, Pager)
```
→ **Heute pagt ein erstmaliger Produktions-Fatal nicht.** Erst Wiederholungen eskalieren `urgency` über den occurrence-counter. Für ein Launch-Gate-Fehlermanagement ist das die eine wirklich fixwürdige Lücke.

**Fix:** In der Normalize-Node
- `criticality` aus `environment` ableiten: `production→5, staging→3, sonst→1`
- `urgency` initial: `production→3, sonst→2`; `level==='fatal' → +1` (cap 5)
- `severity`-`levelMap` auf abgestimmte Werte: `warning→2, info→1` (Default `3` statt `4`)

### GAP-2 (KLEIN — Kadenz, REVIDIERT): SLA-Sweep täglich vs. „15 min"
Faktenprüfung: `SLA_WINDOWS_MS` = **critical 1 Tag, normal 14 Tage, noise none**. Bei tag-granularen SLAs ist 15 min sinnlos; **täglich ist vertretbar**, stündlich ein moderates Tightening (worst-case Verzug bei einem 1-Tages-SLA von ~24h → ~1h). → **Empfehlung geändert gegenüber Grilling: bei täglich bleiben oder auf stündlich straffen; NICHT 15 min.**

### GAP-3 (NEU): Generischer Support-/Manuell-Webhook fehlt
Kein Workflow für human-gemeldete Incidents. Überlappt inhaltlich **THE-478** (Incident-Meldung via Team Chat `/report`, Backlog). Ein minimaler n8n-Form/Webhook mit `source:'support'` ist der billige Interim; die „richtige" Variante ist THE-478.

---

## 4. Tatsächlicher Rest-Aufwand (das Delta)

| Δ | Was | Aufwand | Empfehlung |
|---|-----|---------|-----------|
| Δ1 | Sentry-Normalize: environment→criticality, urgency-Init, levelMap angleichen | ~15 Zeilen im Code-Node | **JA** (behebt GAP-1) |
| Δ2 | SLA-Sweep-Kadenz: täglich→stündlich (optional) | 1 Feld | Optional |
| Δ3 | Neuer „Support Ingest"-Webhook (`source:'support'`, Melder liefert Scores 1–5) | 1 neuer Workflow (3 Nodes) | JA, als Interim zu THE-478 |

Alles **additiv**; kein Backend-Change nötig (die Engine akzeptiert die Payload bereits).

---

## 5. Entscheidungen (User, 2026-07-18) + Umsetzung

- **D1 — GAP-1 fixen: JA ✅ UMGESETZT.** Live-Sentry-Workflow (`3QMcMgiKMh7WsFei`) Normalize-Node gefixt + **published** (aktive Version `ba219ec3`). environment→criticality (prod 5), urgency-Init (prod 3, +1 fatal), levelMap angeglichen. Trigger/URL/Credential unberührt.
- **D2 — SLA-Kadenz: täglich lassen.** Keine Änderung (tag-granulare SLAs; 15 min verworfen).
- **D3 — Support-Webhook: auf THE-478 warten.** Kein Interim-Webhook; der menschliche Meldekanal kommt mit dem Team-Chat-`/report`-Slice (THE-478).

## 6. Linear-Delta (ausgeführt)
- **Kein** Reopen von THE-446/447 (Workflows existieren, Scope korrekt).
- **Angelegt: THE-505** (Bug, unter THE-443, *In Review*) — GAP-1/Δ1, Fix + Traceability. AC-1/AC-2 done, AC-3 (T1-Live) offen bis `ta_`-Key gesetzt.
- **THE-478** bleibt Heimat von Δ3 (Support-/Team-Chat-Meldekanal).

## 7. Vom User zu liefern (Fakten, ohne die kein Aktivieren/Testen)
- `ta_…`-Key eines System-Admin-Users (`ops-bot`, Rolle `enterprise_architect`) als n8n-Credential *TheArchitect Register API Key* (Header `X-API-Key`). Wird einmalig angezeigt — nur der User kann ihn erzeugen.
- Bestätigung, dass **Sentry** für die Prod-App tatsächlich Events feuert (DSN gesetzt; `config/sentry.ts` existiert).
- `OPS_NOTIFY_WEBHOOK_URL` (o.ä.) im Backend gesetzt, damit die Echtzeit-Alerts rausgehen (sonst no-op).

## 8. Testplan + Ergebnisse
- **T1 (GAP-1) ✅ PASS 2026-07-18** (n8n exec 2394): prod/fatal → `pScore=21.5`, `routingPath='critical'`, `slaDeadline`=+1d, `proposedActions=[page_oncall, create_blocker]`.
- **T2 (Dedup) ✅ PASS** (exec 2395→2396): zwei Titel, ein Fingerprint → **ein** Defect, `occurrenceCounter=2`, kanonischer Titel bleibt (deckt THE-446 AC-5 live).
- **T3 (Support):** entfällt vorerst (Δ3 → THE-478).
- **T4 (SLA):** offen — manueller Sweep-Trigger auf künstlich überfälligen Eintrag → `escalate`-Proposal, idempotent.

**Verifikations-Trick:** Ohne API-Key ließ sich das Ergebnis über die **n8n-Execution-Logs** prüfen — der 201-Body des `POST Register Ingest`-Node enthält die vollständige Engine-Row (routingPath, slaDeadline, occurrenceCounter).
