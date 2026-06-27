# ADR-0002: Korpus-Store-Platzierung — dedizierte Mongo-Instanz, global replizierbar

- **Status:** Accepted
- **Datum:** 2026-06-27
- **Entscheider:** Matthias Ganzmann (Enterprise Architect)
- **Baut auf:** ADR-0001 (kanonischer, referenzierter Korpus)

## Kontext

ADR-0001 hat festgelegt: der Gesetzes-Korpus ist ein **separater Store** (Mongo als System of Record) + **geteilter Qdrant-Index**, von Projekten nur referenziert. Offen blieb die **physische Platzierung** des Record-Stores. Treiber der Entscheidung: „es werden sehr schnell viele Regionen dazukommen" — also Skalierung Richtung enterprise / world-ready.

### Klärung „Mongo vs. Qdrant"
Kein Entweder-oder — zwei Jobs:
- **MongoDB = System of Record**: voller Gesetzestext + Metadaten + Versionen, verlustfrei, exakte Queries. Die Quelle der Wahrheit.
- **Qdrant = Vektor-Index**: Embeddings für semantische Suche (treibt UC-ICM-002 Mapping). Aus dem Record-Store **ableitbar und neu aufbaubar**.
- Asymmetrie: Text→Vektor jederzeit reproduzierbar; Vektor→Text **unmöglich** (Embeddings sind verlustbehaftet). ⇒ Die Wahrheit gehört in den Record-Store, der Index ist ein wegwerfbarer Beschleuniger.

### Klärung „Regionen" für den Korpus
Datenresidenz-Pflichten gelten für **personenbezogene/Tenant-Daten**, nicht für **öffentliches Gesetzesrecht**. Der Korpus ist public data → **frei in jede Region replizierbar**; Residenz bindet den **Tenant-/App-Layer** (Mappings, Projekte), nicht den Korpus. Konsequenz: nicht N rechtlich getrennte Korpus-Silos, sondern **eine** Korpus-Instanz, global gespiegelt.

## Entscheidung

Der Korpus-Record-Store läuft als **dedizierte, eigene Mongo-Instanz/Container** — getrennt von der App-DB (Server A), eigener Lebenszyklus.

- **Topologie jetzt:** 1 dedizierte Instanz (Write-Primary), Tailnet-erreichbar; Crawler füttert sie; eine `regulations-corpus`-Qdrant-Collection darauf.
- **Topologie später (wenn Regionen kommen):** regionale **Read-Replicas** (EU/US/APAC) für Latenz; Schreibzugriff bleibt am Primary; Qdrant analog. Kein Re-Design — nur Topologie-Erweiterung. Tenant-Daten werden separat pro Region deployt (App-Layer, Residenz).

## Betrachtete Optionen

| | Option | Bewertung |
|---|---|---|
| A | Eigene **DB** auf der bestehenden App-Mongo-Instanz | verworfen: keine unabhängige Skalierung/Replikation pro Region; koppelt Lebenszyklus an App-DB |
| B | **Postgres + pgvector** (Record + Vektor in einem Motor) | verworfen: legitim & weniger bewegliche Teile, aber neuer Tech-Stack; dedizierte Vektor-Skalierung (Qdrant) schon vorhanden |
| **C** | **Dedizierte Mongo-Instanz/Container, global replizierbar** | **gewählt** — Enabler für Multi-Region; unabhängiger Lifecycle/Backup; nutzt vorhandenen Mongo+Qdrant-Stack |

## Konsequenzen

**Positiv**
- Multi-Region-Option ohne Re-Architecting (Read-Replicas anhängen).
- Unabhängiges Skalieren: Vektor-Suche (RAM) und Record-Store (Disk) getrennt; Korpus-Last entkoppelt von der App-DB.
- Kein Lock-in: Vektor-Engine austauschbar (re-index aus Mongo); Korpus überlebt Such-Tech-Wechsel.
- Schlanke Tenant-Backups (Korpus re-crawlbar → leichtes Backup oder Re-Seed).

**Negativ / Aufwand**
- Mehr Ops: eigener Container + Volume + Backup + Credentials + Resource-Limits.
- Eigene Zugriffsgrenze nötig (separate Connection / Corpus-Service), nicht über die App-DB-Verbindung.
- Cross-Store-Integrität (Tenant-Referenz → Korpus) bleibt Eventual-Consistency-Thema (aus ADR-0001).

**Operative Leitplanken (aus der Crawler-Episode gelernt)**
1. **Tailnet-Bind von Tag 1** — Korpus-Mongo-Port an die Tailscale-IP binden, **nicht** `0.0.0.0` (der `27017`-Fehler, der 36 Tage gekostet hat). Crawler + App erreichen ihn übers Tailnet.
2. **Zugriff gekapselt** — App/Mapping spricht den Korpus über separate Connection/Service → späterer Instanz-/Replica-Ausbau = Config, kein Refactoring.
3. **Backup bewusst schlank** — re-crawlbar; ggf. Re-Seed statt schwerem Backup.

## Auswirkung auf Tickets

- **THE-362** (Scheduler): Ziel = die dedizierte Korpus-Instanz (Tailnet-Adresse), nicht App-DB; finale ACs jetzt schärfbar.
- **THE-361** (UC-AUTOCRAWL-001): Platzierungs-Folgefrage damit geschlossen.
- **THE-306/308** (Version-Lock/Diff): leben im Korpus-Store (Versions-Historie als System of Record).

## Verwandt

ADR-0001 · [[strategy_trust_spine]] · [[strategy_data_value]] · THE-361/362 · THE-306/308 · THE-364 (Tailnet-Bind-Pattern)
