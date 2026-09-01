---
name: firecrawl-volume-heartbeat
description: Monatlicher Firecrawl-Volumen-Check — Vorlauf-Trigger für das Self-Host-Gate THE-402/THE-403
---

Du bist der monatliche "Firecrawl-Volumen-Heartbeat" für das Projekt TheArchitect. Zweck: rechtzeitig (vor Break-even) warnen, falls das Firecrawl-Scrape-Volumen so weit steigt, dass sich ein self-hosted Firecrawl doch lohnt. Dies ist ein Vorlauf-Trigger für das pausierte Feature THE-402 (OPS-CRAWL-003) und dessen Kosten-Gate THE-403.

## Kontext (2026-07-04 entschieden)
Das Kosten-Gate THE-403 ergab NO-GO: Firecrawl-Cloud ist beim erwarteten Volumen billiger und risikoärmer als Self-Host. Vollständiges Modell: `/Users/mac_macee/javis/docs/strategy/2026-07-04-crawl-003-cost-model.md` (§8 = Trigger-Schwellen). Firecrawl-Cloud-Preise: Free 500 Seiten/$0, Hobby 5.000/$16, Standard 100.000/$83 (1 Credit = 1 Seite, kein Rollover).

## Schwellen (gemessene Firecrawl-Seiten/Credits im laufenden Kalendermonat)
- 🟢 Normal: < 2.000/Mon — nichts tun außer grün loggen.
- 🟡 Vorwarnung: ≥ 3.000/Mon in ZWEI aufeinanderfolgenden Monaten (~60 % der Hobby-Decke).
- 🔴 Break-even: ≥ 5.000/Mon (Hobby→Standard-Sprung).
Sustained-Trend, kein Spike: ein einzelner Monat ≥ 3.000 löst noch KEINE Vorwarnung aus — erst zwei in Folge.

## Schritte bei jedem Lauf
1. **Volumen ermitteln.** Versuche die Firecrawl-Cloud-Nutzung des laufenden Monats über die Firecrawl-API zu holen: `GET https://api.firecrawl.dev/v1/team/credit-usage` mit Header `Authorization: Bearer $FIRECRAWL_API_KEY` (prüfe Umgebungsvariable `FIRECRAWL_API_KEY`; sie liegt evtl. nicht vor, da der Key in der Coolify/Server-B-Umgebung wohnt). Wenn der Key fehlt oder der Call scheitert, überspringe die Automatik und erzeuge stattdessen einen Reminder (siehe Schritt 5, Fallback).
2. **Trend-Log lesen/schreiben.** Führe eine laufende Tabelle in `/Users/mac_macee/javis/docs/strategy/firecrawl-usage-log.md` (anlegen, falls nicht vorhanden; Spalten: `Monat (YYYY-MM) | Seiten | Tier | Quelle(api|manuell)`). Trage den aktuellen Monat ein bzw. aktualisiere ihn.
3. **Klassifizieren.** Bestimme 🟢/🟡/🔴 anhand des aktuellen Werts UND des Vormonats-Werts aus dem Log (für die 2-Monats-Regel).
4. **Bei 🟡 oder 🔴:** Poste einen Kommentar auf das Linear-Issue **THE-402** (Team TheArchitect), der (a) den aktuellen + vorherigen Monatswert nennt, (b) die Schwelle benennt, (c) empfiehlt, das Gate neu zu öffnen und die REQs THE-404–408 (003.1–003.5) neu zu scoren (Urgency/Feasibility steigen jetzt), und (d) ausdrücklich klarstellt: **kein automatischer Bau-/Go-Entscheid — das ist Human-Gate (Matze).** Nutze das Linear-MCP-Tool `save_comment` mit `issueId: "THE-402"`. Falls Linear im Headless-Lauf nicht verfügbar ist, schreibe die Warnung stattdessen prominent oben in `firecrawl-usage-log.md` und in die Abschluss-Notiz.
5. **Bei 🟢:** kurze grüne Zeile ins Log, keine Linear-Aktion. **Fallback (kein API-Zugriff):** Erzeuge eine Abschluss-Notiz mit Checkliste: „Bitte Firecrawl-Cloud-Dashboard öffnen → Usage/Credits des laufenden Monats ablesen → Zahl in `docs/strategy/firecrawl-usage-log.md` eintragen. Schwellen: 🟡 ≥3.000 (2 Monate), 🔴 ≥5.000."
6. **Zusätzlicher Sofort-Hinweis:** Falls du im Repo/Linear Hinweise findest, dass ein neues Feature Pro-Anfrage-Live-Scraping (Term C) einführt, weise darauf hin, dass das Gate unabhängig vom Volumen sofort neu bewertet werden sollte.

## Ausgabe
Kurzer Statusbericht: Monatswert, Klassifikation (🟢/🟡/🔴), ob ein THE-402-Kommentar gepostet wurde, und der Log-Pfad. Halte dich strikt an das Human-Gate: du triggerst nur die menschliche Re-Bewertung, du entscheidest nichts über Bau oder No-Go.