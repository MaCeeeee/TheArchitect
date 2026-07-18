# Reconciliation — UC-LAW-001 als Vorstufe/Baustein von UC-RADAR-001

**Stand:** 2026-07-11 · **Betrifft:** UC-LAW-001 (Applicability Check, gebaut) ↔ UC-RADAR-001 (Regulatory & Technology Radar, THE-309, Backlog)

## Kernaussage

**UC-LAW-001 ist kein konkurrierendes Feature zum Radar, sondern seine statische Vorstufe.** Der Applicability Check beantwortet „**welche Normen gelten jetzt** für diese Architektur?"; der Radar beantwortet „**was ändert sich / kommt zeitlich auf mich zu**?". Der Radar braucht die Anwendbarkeits-Menge als Fundament — ohne zu wissen, *welche* Gesetze für ein Projekt überhaupt relevant sind, kann er regulatorische Änderungssignale nicht sinnvoll auf Projekte filtern. UC-LAW-001 liefert genau diese Grundmenge, deterministisch und ohne Crawl/LLM.

## Zwei Achsen, kein Overlap

| | UC-RADAR-001 (Backlog) | UC-LAW-001 (gebaut) |
|---|---|---|
| Frage | Was **ändert sich / kommt** über die Zeit? | Was **gilt jetzt**? |
| Input | Externe Feeds (Crawler, endoflife.date) | Internes Architektur-Modell |
| Output | Zeit-Signale, Impact × Time-Matrix | Statische, gerankte Normen-Liste |
| Zeitachse | ja (Deadlines, EOL, Gesetzesänderung) | nein (Momentaufnahme) |
| Mechanik | täglicher Cron, `RadarSignal`, LLM-Impact-Matcher | Regel-Daten, deterministisch, kein LLM |

## Wie UC-LAW-001 konkret in den Radar einfließt (wenn THE-309 gebaut wird)

1. **Baseline-Scope für den Impact-Matcher.** RADAR-REQ-4 (`matchSignalToElements`) matcht Signale auf Elemente. Die Anwendbarkeits-Menge aus UC-LAW-001 grenzt vorab ein, *welche* Regulatory-Signale für ein Projekt überhaupt in Frage kommen — spart LLM-Calls (RADAR-Kostenziel <€5/Projekt/Monat) und reduziert Alert-Fatigue.
2. **Neuer Signal-Kind `applicability`.** Ein Urteil-Wechsel („AI Act gilt jetzt", weil ein `ai_agent`-Element neu importiert wurde) kann als `RadarSignal` neben `regulatory`/`deadline`/`eol` auf der Radar-Matrix erscheinen. Die deterministische Herleitung liefert die Evidenz gleich mit.
3. **Der blinde Fleck von UC-LAW-001 = RADAR-UC1-Territorium.** UC-LAW-001 kennt nur die 7 kuratierten Regeln; alles außerhalb ist unsichtbar (siehe Plan-Doc, „blinder Fleck"). Das Schließen dieser Lücke — neue/geänderte Gesetze aktiv aufspüren — ist exakt RADAR-UC1 (regulatorische Updates). UC-LAW-001 macht die Lücke *sichtbar und benannt*; UC-RADAR-001 *schließt* sie.

## Geteilte Fundamente (bereits vorhanden)

- `NORM_ONTOLOGY.normSources` (ADR-0004 E6) — beide referenzieren dieselbe Quell-Registry.
- Norm-Facade + Add-to-pipeline-Adapter (THE-390 P4b) — UC-LAW-001 nutzt ihn heute; der Radar würde denselben Pfad zum Operationalisieren nutzen.
- Crawl-Scheduler-Job-Registry: der Kommentar in `regulationCrawlScheduler.service.ts` („shaped so RADAR (THE-310) can later register sources") ist der reservierte Andockpunkt.

## Namensklärung

Der Begriff „Radar" in der UC-LAW-001-Plan-Doc (`2026-07-11-uc-law-001-applicability-radar.md`) meint die **statische Anwendbarkeits-Momentaufnahme**, nicht das temporale Signal-System aus THE-309. Zur Vermeidung von Verwechslung gilt: der reservierte Produkt-Begriff **„Radar" = UC-RADAR-001**; UC-LAW-001 heißt im UI „Which laws apply to this architecture?" (Applicability Check).

## Bewusst NICHT getan

Kein Radar-Bau. UC-RADAR-001 (THE-309, REQs THE-310–314) bleibt Backlog. Dieser Vermerk ordnet nur ein; die Promotion von UC-LAW-001 zum Radar-Baustein erfolgt, wenn THE-309 gezogen wird.
