# ADR-0001: Gesetzes-Korpus als kanonischer, referenzierter Single-Source-Store

- **Status:** Accepted
- **Datum:** 2026-06-27
- **Entscheider:** Matthias Ganzmann (Enterprise Architect)
- **Kontext-Session:** compliance-crawler-Fix → Diskussion „wohin schreiben wir die Gesetze?"

## Kontext

Der `compliance-crawler` (UC-ICM-001, THE-272) lädt Gesetzes-Paragraphen (NIS2, DSGVO, LkSG, …) und speichert sie heute **projekt-scoped**: jede `Regulation` trägt eine `projectId`, jedes Projekt bekommt eine **eigene Kopie** derselben Paragraphen. Embeddings landen in **per-Projekt** Qdrant-Collections `regulations-{projectId}`. Mongo ist die **Produktiv-App-DB** (`thearchitect` auf Server A).

Gesetzestext ist jedoch **Referenz-/Stammdaten**: global identisch, langsam veränderlich, reproduzierbar (re-crawlbar), nicht-vertraulich. Das Per-Projekt-Kopie-Modell erzeugt:

- **Inkonsistenz** — N Kopien, N Update-Pfade; Drift bei Gesetzesänderung; Version-Lock/Diff (THE-306/308) im Kopie-Modell kaum sauber abbildbar (Single-Source-of-Truth verletzt).
- **Volumen** — ein ernster Korpus (~1.000–2.000 §§) × N Projekte × Volltext; in Qdrant zusätzlich N-fache Vektor-Duplikate.
- **Serverlast** — Embedding (teuerste Operation) N-mal für identischen Text; ein Auto-Crawler × N Projekte multipliziert EUR-Lex-Fetches + Firecrawl-Quota (Free 500/Monat, THE-285).
- **Coupling** — Referenz-Churn + autonome Schreiblast in der Produktiv-App-DB.

## Entscheidung

Gesetzestext wird als **kanonische Stammdaten** modelliert — drei Festlegungen:

1. **Referenz statt Kopie.** Es gibt **einen** kanonischen Datensatz je Paragraph. Tenant-Artefakte (`ComplianceMapping`) halten eine **Referenz** `{ regulationKey, versionHash }` in den Korpus — keine Volltext-Kopie. (THE-306 Version-Lock ist genau dieser Referenz-Mechanismus.)
2. **Physische Trennung.** Der Korpus lebt in einem **separaten Store**, getrennt von der Tenant-/App-DB. Reproduzierbar und damit nicht Backup-kritisch wie Tenant-Daten.
3. **Geteilter Embedding-Space.** **Eine** Qdrant-Collection `regulations-corpus` (embed-once), Mapping-Queries filtern nach `jurisdiction`/`source` — keine per-Projekt-Vektoren.

Der **Auto-Crawler wird Corpus-Feeder**: crawlt **pro Quelle nach Zeitplan** (nicht pro Projekt), schreibt einmal in den Korpus, embedded einmal.

## Betrachtete Optionen

| | Modell | Verworfen weil / gewählt weil |
|---|---|---|
| A | Kopie pro Projekt (Status quo) | verworfen: Duplikat, Inkonsistenz, Embed-N-mal, App-DB-Coupling |
| B | Library-Projekt in App-DB | verworfen als Ziel: bleibt in App-DB (Volumen/Coupling); „Referenz vs. Kopie" ungelöst |
| C | Separater Korpus-Store | Basis der Entscheidung (saubere Trennung, embed-once) |
| **D** | **C + Tenant hält nur Referenzen `{key, versionHash}`** | **gewählt** — Master-Data-Pattern „lege artis" |

## Konsequenzen

**Positiv**
- Single Source of Truth → Version-Lock/Diff (THE-306/308) werden trivial korrekt.
- Volumen/Last linear unabhängig von Projektzahl; Firecrawl-Quota geschont.
- Korpus reproduzierbar/wegwerfbar → schlanke Tenant-Backups.
- Trägt die Trust-Spine-These (versionierter, provenance-fähiger Korpus).

**Negativ / Aufwand**
- Mapping muss Korpus über stabilen Key referenzieren statt projekt-lokaler `regulationId` → Schema-/Query-Änderung an `ComplianceMapping` + Mapping-Service.
- Cross-Store-Integrität (Tenant-Referenz → Korpus-Eintrag) als Eventual-Consistency-Thema.
- Migration der bestehenden ~16 Demo-/BSH-Regulations + 53+ Mappings.

**Folge-Entscheidung (bewusst offen)**
- **Physische Platzierung des separaten Stores:** (a) eigene **Mongo-DB** auf Server B (gleiche Instanz, getrennte DB) — leichteste Trennung; vs. (b) eigene **Mongo-Instanz/Container** — sauberster Lifecycle/Backup, mehr Ops. → eigene ADR, vor Bau von THE-362 zu klären.

## Auswirkung auf Tickets

- **THE-361** (UC-AUTOCRAWL-001): revidiert — „Library-Projekt in App-DB" → „separater kanonischer Korpus-Store + Corpus-Feeder + shared Embedding".
- **THE-362** (Scheduler): Ziel ändert sich von „Library-Projekt" zu „Korpus-Store"; abhängig von der Platzierungs-Entscheidung.
- **THE-306** (Version-Lock): rückt ins Fundament — ist der Referenz-Mechanismus, kein „Phase 1b".
- **THE-365** (Crawl-Qualität): unverändert relevant (Korpus-Input-Qualität).

## Verwandt

[[strategy_trust_spine]] · [[strategy_data_value]] · THE-272 (UC-ICM-001) · THE-306/308 · THE-361/362
