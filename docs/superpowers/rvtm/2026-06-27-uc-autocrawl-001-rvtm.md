# RVTM: UC-AUTOCRAWL-001 — Autonomer Regulation-Refresh (Radar Phase 1) — Scoring

**Erstellt:** 2026-06-27
**Quelle:** Session 2026-06-27 (Bug-Fix compliance-crawler → Frage „autonom periodisch scrapen" → Claude-Code Pre-Flight + Repo-Verifikation)
**Parent-UC:** THE-361 · **REQ (neu):** THE-362 · **Reuse:** THE-306, THE-308 · **Phase 2:** THE-309/310/311

> Scoring-Modell wie bestehende RVTMs (2026-06-24 MCP-UCs, 2026-06-27 WFCOMP): 7 Kriterien je 1–5, **Score = Σ/35·100**.
> Linear = Status, diese RVTM = Source-of-Truth fürs Scoring (per `feedback_requirement_scoring.md`).

## Kriterien

BizValue · BizRisk · Feasibility (5 = leicht baubar) · Success · Compliance · Relations · Urgency

## Scoring

| Linear | REQ | Modus | BizV | BizR | Feas | Succ | Comp | Rel | Urg | **Score** | Status |
|--------|-----|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|--------|
| THE-306 | REQ-B Version-Lock | reuse | 4 | 5 | 4 | 4 | 5 | 5 | 4 | **88,6** | Backlog |
| THE-362 | REQ-AUTOCRAWL-001.1 Scheduler | write | 4 | 3 | 5 | 4 | 3 | 4 | 3 | **74,3** | Backlog |
| THE-308 | REQ-C Regulation-Diff | reuse | 4 | 4 | 3 | 3 | 4 | 4 | 3 | **71,4** | Backlog |

**Kernbefund:** Was der User wollte (REQ-A Scheduler) ist baulich am einfachsten (Feasibility 5), aber **REQ-B Version-Lock scort am höchsten und ist die Audit-Sicherheits-Vorbedingung**, sobald echte Projekte aus der Library mappen. Build-Order trotzdem **A → B → C**, weil die Library-Scope-Entscheidung REQ-A drift-frei macht (s. u.).

### Begründung je Kriterium

**REQ-AUTOCRAWL-001.1 (THE-362) — Scheduler, 74,3**
- **BizValue 4** — erfüllt die Produkt-These „Gesetze bleiben aktuell ohne Knopfdruck"; Wert wird aber erst über nachgelagerte Mappings/Alerts real.
- **BizRisk 3** — mildert „veraltete Regulations = falsche Compliance-Lage"; allein kein Audit-Treiber (Library hat keine Mappings).
- **Feasibility 5** — maximaler Reuse: `sync-scheduler`-Muster + `complianceCrawler.service.crawl()` existieren; nur Timer + Job-Registry + `CrawlLog`.
- **Success 4** — deterministisch & leicht verifizierbar (Cron feuert → Crawl läuft → Log).
- **Compliance 3** — indirekt (hält Compliance-Daten frisch).
- **Relations 4** — Fundament für RADAR (THE-309/310/311); macht THE-306/308 erst relevant.
- **Urgency 3** — kein fixes Datum; veralteter Crawler ist realer, aber nicht deadline-getriebener Schmerz.

**REQ-B Version-Lock (THE-306) — 88,6**
- **BizValue 4** — CORA-Differenzierung „versionsgebundene Auswertung".
- **BizRisk 5** — Auditor-Frage „welche Version wurde gemappt?" heute unbeantwortbar; autonomer Re-Crawl überschreibt still.
- **Feasibility 4** — additiv (Snapshot-Feld + Migration), sauber speziert (8 ACs).
- **Success 4** — klare ACs, testbar (Update → Mismatch → Re-Map clears).
- **Compliance 5** — direkt audit-kritisch.
- **Relations 5** — Vorbedingung für THE-308, macht REQ-A in echten Projekten sicher.
- **Urgency 4** — wird dringend in dem Moment, wo der Autopilot läuft.

**REQ-C Regulation-Diff (THE-308) — 71,4**
- **BizValue 4** — CORA „Dokumentenvergleiche", „was hat sich geändert".
- **BizRisk 4** — gegen Zombie-Mappings nach Update.
- **Feasibility 3** — größer: Version-History-Model + Diff-Algo + Impact-Analyse + Split-Screen-UI.
- **Success 3** — mehr Oberfläche (UI).
- **Compliance 4** — Change-Traceability audit-relevant.
- **Relations 4** — hängt an THE-306; speist später RADAR-Signal.
- **Urgency 3** — explizit „kein Demo-Blocker", W5/W6.

## Komplexitätsbewertung (Ousterhout — Pre-Flight-Pflicht)

| Dimension | Rating | Begründung / Mitigation |
|---|---|---|
| Ausweiten v. Änderungen | NIEDRIG | Scheduler + Crawl-Client reuse; Version-Snapshot additiv am Schema |
| Kognitive Last | MITTEL | Server-A↔B-Trigger + Snapshot/Mismatch-Flow; gemildert durch existierende Muster (`sync-scheduler`, `complianceCrawler.service`) |
| Unbekannte Unbekannte | MITTEL | Eine offene Frage geklärt (Crawl-Ziel = Library); Rest-Unknown: wie Projekte aus Library beziehen (Referenz vs. Kopie) — erst ab REQ-B |
| Abhängigkeiten | MITTEL | REQ-C → REQ-B (hart); REQ-A drift-frei dank Library; RADAR (Phase 2) hängt an Job-Registry-Form von REQ-A |
| Unklarheiten | NIEDRIG | THE-306/308 self-contained; REQ-A klar speziert (8 ACs) |

**Verdikt:** komplexitäts-arm dank Reuse. Watch-Point: Job-Registry-Form jetzt einziehen (sonst RADAR-Rebuild) + Diff als persistierbares Change-Record (nicht UI-only).

## Scope-Entscheidung (fixiert 2026-06-27)

- **Crawl-Ziel = dediziertes Referenz-/Library-Projekt.** Keine Mappings dort → kein Drift → REQ-A sicher allein (auch vor Version-Lock) ausrollbar.
- **Build-Order: REQ-A (THE-362) → REQ-B (THE-306) → REQ-C (THE-308).**
- **2 Forward-Leitplanken zu RADAR:** (1) Scheduler als Job-Registry, (2) Diff als persistierbares Change-Record → THE-310 sitzt additiv oben drauf.

## Abgrenzung

- **THE-309/310/311 (RADAR):** Phase 2 — breiteres `RadarSignal`-Model (auch EOL/CVE/Vendor), Dedup-by-externalId, generischer ImpactMatcher. Phase 1 ist strikte Teilmenge/Fundament → `related`.
- **THE-306/308:** keine Neuanlage — bestehende Specs wiederverwendet, hier nur in Phase-1-Reihenfolge eingeordnet + gescort.
- **UC-ICM-001 (THE-272, Done):** liefert den Crawler selbst; AUTOCRAWL automatisiert nur dessen Aufruf.

## Offene Verifikationspunkte (vor REQ-B/C)

- **Library-Bezug:** Referenz (Pointer auf Library-`Regulation`) vs. Kopie (per-Projekt-Upsert)? — eigene Design-Frage, blockiert REQ-A nicht.
- **Default-Intervall:** wöchentlich vs. täglich — Quellen ändern sich selten (Gesetze), aber Deadline-Tracker (THE-311) will feiner; Job-Registry erlaubt pro-Job-Intervall.

## Session-Kontext (Bug-Fix, der hierher führte)

`packages/compliance-crawler` lief 36 Tage „unhealthy": (1) Healthcheck `localhost`→IPv6-Mismatch, (2) kein Mongo-Reconnect. Beide gefixt auf Branch `fix/compliance-crawler-mongo-reconnect-healthcheck` (Commit 7b1ee46), end-to-end verifiziert + deployed (PR #6). Memory: `progress_compliance_crawler.md`.

---

## Revision 2026-06-27 — Korpus-Architektur (ADR-0001 + ADR-0002)

Nach Architektur-Diskussion (Inkonsistenz / Volumen / Serverlast) wurde das ursprüngliche „Library-Projekt in App-DB" verworfen. Neues Zielmodell (siehe `docs/adr/0001-...` + `docs/adr/0002-...`): **kanonischer Korpus, Referenz statt Kopie, geteilter Embedding-Space, dedizierte Mongo-Instanz (global replizierbar)**. Mongo = System of Record (verlustfrei), Qdrant = ableitbarer Vektor-Index. Öffentlicher Korpus ist NICHT residenz-gebunden (das ist der Tenant-Layer) → eine Instanz, frei gespiegelt.

### Kind-Dekomposition von THE-361 (Build-Order A → B → C → D)

| Baustein | Linear | Score | Inhalt |
|---|---|---|:---:|
| **A** Korpus-Infrastruktur | **THE-367** (neu) | 71,4 | dediz. Mongo-Instanz (Tailnet-Bind) + `regulations-corpus` Qdrant-Collection + Connection-Grenze |
| **B** Referenz-Modell | THE-306 | 88,6 | `ComplianceMapping` hält `{regulationKey, versionHash}` |
| **C** Korpus-Feeder + Scheduler | THE-362 | 74,3 | crawl→Korpus, embed-once, geplant (Job-Registry) |
| **D** Read-Path + Migration | **THE-368** (neu) | 68,6 | Mapping liest aus Korpus/shared Collection; Bestand migrieren |

### Scoring der zwei Neuen (7 Kriterien × 1–5, Σ/35·100)

| Linear | BizV | BizR | Feas | Succ | Comp | Rel | Urg | **Score** |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| THE-367 (A Infra) | 4 | 3 | 3 | 4 | 3 | 5 | 3 | **71,4** |
| THE-368 (D Read+Migr) | 4 | 4 | 3 | 3 | 4 | 4 | 2 | **68,6** |

- **A 71,4** — Fundament (Rel 5), Infra/nicht user-facing (BizV 4); Feas 3 (Instanz + Collection + Connection-Grenze, bekannte Muster).
- **D 68,6** — schließt die Schleife (Korpus nutzbar); Migration live = Korrektheitsrisiko (BizR 4); zuletzt (Urg 2).

### Komplexität (Ousterhout, Delta)

Abhängigkeiten steigen (D → A + B; A ist Pflicht-Fundament) — bewusst sequenziert. Unbekannte Unbekannte: Cross-Store-Integrität (Tenant-Referenz → Korpus) + Migration des Bestands. Mitigation: A liefert Connection-Grenze (Umzug = Config), Migration idempotent + Integritäts-Check (THE-368 AC-5).
