# Plan: Gate 0 des Zielpfads — Instrumente an, Deckel zu

**Datum:** 2026-08-31 · **Freigabe:** Nutzer via `/goal` (gilt als Betting-Table-Beschluss für die Instrument-Tickets)
**Quelle:** Zielpfad-Audit 31.08. (Vorlage an THE-712), Gate 0.

## Ziel

Nach diesem Plan gilt: Das einzige In-Progress-Ticket (THE-471) ist mit Impact-Ist geschlossen, und die Gate-0-Messinstrumente existieren und haben ihre erste Zahl geliefert. Kein Gate-1+-Bau, keine vorweggenommene Entscheidung.

## Ausdrücklich NICHT in diesem Plan

- **Entscheidungen** THE-712, THE-690, THE-720, ADR-0011-vs-25-Gramm — bleiben beim Menschen (Asilomar #16).
- **Versand nach außen** (BSH-Terminanfrage, Angebot): wird als Entwurf vorbereitet, nie versandt.
- LAW-/VERIF-/UX-Bau (Gate 1+), Radar.

## Arbeitspakete (Reihenfolge = Abarbeitung, WIP=1 im Geist: eines nach dem anderen)

| # | Paket | Ticket | Verifikation |
|---|---|---|---|
| P1 | **THE-471 AC-3**: Ops-Untersuchung `rag-query` — leerer Body = „0 Treffer" oder Collection leer/nicht verbunden? Workflow auf der Self-Hosted-Instanz inspizieren, Webhook mit echtem Projekt sondieren | THE-471 → Done | Befund dokumentiert im Ticket; Impact-Ist-Kommentar (E2E: Fehlerbild kann nicht mehr still auftreten) |
| P2 | **Wert-Session-Protokoll**: neutrale Vorlage (Schwelle ≥5/7 fixiert, Kill <3/7, Kundenbestätigung ja/nein) | THE-718 → Done | Datei committed (öffentlich unbedenklich: Methodik, keine Preise/Kunden) |
| P3 | **Dailies-Guard**: Script + launchd-Agent auf dem Mac (Prüfung am Vault), macOS-Notification als Zustellung; Kadenz-Kennzahl | THE-719 → Done | AC-1-Testlauf (fehlende Datei → Meldung), AC-2-Negativkontrolle (vorhandene Datei → still), Agent geladen |
| P4 | **Moat-Zähler**: read-only Script gegen Korpus-Mongo (Tailnet) + `packages/server/src/evals/golden`; Baseline-Report `reports/moat/` | THE-717 → Done | Erster Report mit Absolutwerten; zweiter Lauf belegt Delta-Logik; kein Schreibzugriff |
| P5 | **Vertriebs-Log**: NocoDB-Tabelle via API (Creds in `.env`); erster Eintrag = BSH-Terminanfrage als „Entwurf bereit" (Latenz-Uhr startet erst mit realem Versand durch den Menschen) | THE-716 → In Progress/Done je AC | Tabelle per API angelegt + Wochenkennzahl-Abfrage dokumentiert; kein PII im Query-String |
| P6 | **Entwürfe für den Menschen**: BSH-Terminanfrage + NDA/AVV-Hinweis + Pilot-Angebot v1 — ins **private** Repo (`docs/customer/`, gitignored) | — | Dateien im privaten Repo committed; nichts im öffentlichen Repo, nichts versandt |

## Risiken / Abbruchpfade

- **Tailnet down** (P4): Script liefert Repo-Zahlen + WARN statt Korpus-Zahlen; Ticket bleibt In Progress mit Befund.
- **Self-Hosted-n8n-API nicht erreichbar** (P1): Sondierung nur über den Webhook + Code-Seite; AC-3 wird mit dem erreichbaren Beleg beantwortet, Rest als dokumentierte Restfrage.
- **NocoDB-API-Schema unbekannt** (P5): Fallback = Setup-Script + Anleitung, Ticket bleibt In Progress.
- **Rollback P3:** `launchctl unload ~/Library/LaunchAgents/site.thearchitect.dailies-guard.plist` + Datei löschen.

## Loop-Kontrakt

Budget 3 je Paket; Eskalation = Befund im Ticket, kein stiller Weiterversuch. Impact-Soll: siehe Verifikationsspalte — Done heißt gemessene Wirkung bzw. E2E-Evidenz, nie „deployed".
