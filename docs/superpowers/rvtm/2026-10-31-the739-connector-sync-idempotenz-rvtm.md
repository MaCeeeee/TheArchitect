# RVTM — THE-739 Connector-Sync idempotent (Re-Sync aktualisiert statt dupliziert)

**Linear:** [THE-739](https://linear.app/thearchitect/issue/THE-739) · REQs [THE-742](https://linear.app/thearchitect/issue/THE-742), [THE-743](https://linear.app/thearchitect/issue/THE-743)
**Created:** 2026-10-31 · **Status:** In Review (PR offen)
**Verwandt:** THE-370 (Match ohne projectId-Scope — Muster vermieden), UC-PROV-002 / THE-333 (Origin-Felder), THE-113 (GitHub-Connector)

## Befund (gemessen, lokale Neo4j 30.10.)

Ein lokales Projekt hielt **27 identische** GitHub-Elemente `TheArchitect`, eins pro Sync-Lauf seit 22.06. Ursache im Code, nicht in den Daten:

1. Jeder Connector vergibt pro Fetch eine **zufällige** Element-ID (`gh-${uuid}`, `elem-${uuid}`, `jira-${uuid}` …).
2. Der gemeinsame Schreibpfad `createTemporaryGraph` → `migrateTemporaryGraph` kennt nur `CREATE`. Drei Aufrufer: Scheduler, `POST …/connectors/:name/sync`, `POST …/integrations/:id/sync`.
3. → **Alle** Connectoren hatten den Bug, nicht nur GitHub.

**Prämissen-Korrektur:** `sourceRef` ist batch-weit (= `config.baseUrl`), nicht pro Element. `(connectorConfigId, sourceRef)` als Upsert-Schlüssel hätte bei Org-weiter Konfiguration alle Repos zu einem verschmolzen. Schlüssel ist daher pro Element.

## Lösung

`services/connector-import.service.ts` — ein Upsert für alle drei Pfade, gescoped auf `(projectId, source, connectorConfigId)`:

1. Match per `externalId` (GitHub/GitLab: Repo-ID, Jira: Issue-Key, ServiceNow: `sys_id`, LeanIX: Factsheet-ID, n8n: Workflow-/Node-ID)
2. sonst Adoption eines Knotens **ohne** `externalId` gleichen Namens + Typs, ältester zuerst, je Knoten einmal — fängt Altdaten und die übrigen Connectoren (SAP, Salesforce, Citrix, Sparx, Standards, Abacus) ohne Schlüssel
3. sonst `CREATE`

Connections per `MERGE (s)-[:CONNECTS_TO {type, projectId}]->(t)`. Ändert ein Re-Sync den Inhalt eines zertifizierten Elements, fällt es zurück in die Notar-Queue (`certifiedBy = null`); unveränderter Inhalt behält die Zertifizierung.

## Traceability Matrix

| REQ | Requirement | Verification | Evidence | Status |
|--|--|--|--|--|
| **REQ-THE739-1** (THE-742) | Zwei Syncs derselben Quelle → ein Element je externem Objekt; projekt-gescoped; Connections nicht verdoppelt; alle drei Sync-Pfade | `connector-import.test.ts` (8 Tests: 2 Syncs → 1, Rename, Projekt-Scope, Legacy-Adoption, Fallback ohne externalId, Connection-MERGE, Notar-Reset) | Probe gegen lokale Neo4j 5.26: echte Cypher, Legacy adoptiert, 1 Kante nach 2 Syncs. Zwei echte GitHub-Fetches ins betroffene Projekt → `updated:1, created:0`, bleibt 1 Element | ✅ |
| **REQ-THE739-2** (THE-743) | Cleanup-Skript: je Gruppe einen Knoten behalten, Kanten umhängen, Rest löschen; Dry-Run-Default; idempotent; distinkte Items nie mergen | `connector-dedupe.test.ts` (6 Tests: 27-Fall, No-op, zertifiziert gewinnt, kein Merge über Projekt/Config/Typ, Batch-/externalId-Skip, kein `elem-`-Präfix) | Probe-Projekt mit Kanten: Duplikat-Kante verworfen, Fremdkante mit ID umgehängt, interne Kante entfernt. Lokal: Dry-Run 1 Gruppe / 26 → Apply → zweiter Lauf 0 | ✅ |

## Impact (Ist)

Lokales Projekt: **27 → 1 Element**; zwei weitere Syncs lassen die Zahl bei 1.

## Offen / nicht Teil dieses Tickets

- **Prod-Cleanup:** eigene Entscheidung. Erst nach Deploy des Fixes, sonst legt der alte Scheduler weiter an. `--project` erlaubt schrittweises Vorgehen.
- **Entfernte Quellobjekte** (Repo gelöscht) bleiben als Element stehen — kein Löschen beim Sync.
- **`connectorConfigId` ist der Name**, keine ID: Umbenennen einer Connector-Konfiguration bricht die Zuordnung (dann greift nur die Namens-Adoption nicht, weil der Scope wechselt).
- Mongo-seitige Referenzen auf gelöschte Element-IDs prüft das Skript nicht (lokal: 0 Kanten, kein Befund).
