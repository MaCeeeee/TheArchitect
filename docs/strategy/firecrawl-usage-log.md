# Firecrawl-Volumen-Log (Heartbeat THE-402 / OPS-CRAWL-003)

Laufendes Log der monatlichen Firecrawl-Cloud-Nutzung (Scrape-Seiten = Credits, 1 Credit = 1 Seite, kein Rollover).
Zweck: Vorlauf-Trigger vor Break-even, falls sich self-hosted Firecrawl (THE-402, Kosten-Gate THE-403) doch lohnt.
Kostenmodell: `docs/strategy/2026-07-04-crawl-003-cost-model.md` (§8 = Trigger-Schwellen).

## Schwellen
- 🟢 **Normal:** < 2.000 Seiten/Mon — nichts tun.
- 🟡 **Vorwarnung:** ≥ 3.000/Mon in **zwei aufeinanderfolgenden** Monaten (~60 % der Hobby-Decke von 5.000). Ein einzelner Spike-Monat löst NICHT aus.
- 🔴 **Break-even:** ≥ 5.000/Mon (Hobby→Standard-Sprung, $16→$83).

Firecrawl-Cloud-Preise: Free 500/$0 · Hobby 5.000/$16 · Standard 100.000/$83.

**Human-Gate:** Der Heartbeat triggert nur eine menschliche Re-Bewertung (Matze). Kein automatischer Bau-/Go-Entscheid.

---

## Hinweis zur Automatik
`FIRECRAWL_API_KEY` liegt im **Mac-Env nicht** vor (wohnt in Coolify/Server B, wo das Scrapen läuft). Der Heartbeat auf dem Mac kann daher `/team/credit-usage` nicht automatisch abfragen. Wert wird bis dahin **manuell aus dem Firecrawl-Dashboard** (firecrawl.dev/app/usage) abgelesen. Automatisierbar, wenn ein read-only Key in die Mac-Env gelegt wird.

Lauf 2026-08-01 hat zusätzlich geprüft, ob der Key über Server B (187.127.72.213) erreichbar ist — SSH aus der Heartbeat-Umgebung: `Permission denied (publickey)`. Der Weg über Server B ist damit ebenfalls zu. Solange kein read-only Key auf dem Mac liegt, bleibt der Heartbeat **strukturell manuell**.

---

## Trend-Tabelle

| Monat (YYYY-MM) | Seiten | Tier | Quelle (api/manuell) |
|-----------------|--------|------|----------------------|
| 2026-07         | ~198   | 🟢   | manuell (Dashboard-Stand **13.07.**, 30-Tage-Fenster; Billing-Periode seit 22.06 ~176) — **Monatsend-Wert steht aus** |
| 2026-08         | —      | 🟢   | offen (Heartbeat-Lauf 01.08., Monat gerade erst begonnen — kein Volumen zu messen) |

### Offene manuelle Ablesung (Heartbeat 2026-08-01)
1. firecrawl.dev/app/usage öffnen → **Juli-Endwert** ablesen und die 2026-07-Zeile ersetzen (aktueller Wert ist ein Mid-Month-Stand vom 13.07., deckt die Onboardings der 2. Julihälfte — THE-511 rule-less laws, THE-519 zwei Anleihe-Zielgesetze — **nicht** ab).
2. Ende August denselben Schritt für 2026-08.

Schwellen zur Erinnerung: 🟡 ≥ 3.000 in zwei Folgemonaten · 🔴 ≥ 5.000.
