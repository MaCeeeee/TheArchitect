# ADR-0009: Getrennte Vektorindizes mit Pull-Abgleich von Server A

**Status:** akzeptiert (2026-08-06) · **Linear:** THE-621 · THE-623 · THE-624 · Kontext THE-614, THE-466

## Kontext

Es existieren zwei Qdrant-Instanzen mit derselben Collection `regulations-corpus`:
der Crawler (Server B) embeddet in seine lokale Instanz; die App (Server A)
durchsucht ihre eigene. Zwischen beiden gab es keinerlei Abgleich — im
`packages/server`-Code existierte für die Collection nicht einmal ein Schreiber.

Gemessen am 2026-08-06 (ESG-Onboarding, THE-614): Server B 1746 Punkte, Server A
**1532**. Alles seit dem 2026-07-26 (ESG-Rating-VO, THE-519-Anleihegesetze) war in
Produktion semantisch unsichtbar — elf Tage, ohne Signal. `corpus/health` meldete
dabei grün, weil es die Korpus-Mongo maß, nicht den Vektorindex. Das ist die
DORA-Fehlerklasse (THE-466) eine Ebene höher: gleiche Stille, anderes Speicherpaar.

## Entscheidung

**Die zwei Indizes bleiben. Server A hält seinen eigenen aktuell — per Pull.**

1. **Messen (THE-623):** `GET /api/regulations/corpus/health` trägt `vectorIndex:
   {points, corpusCount, drift, ok}`. Unerreichbar ist `null`, nicht `0`. Das
   Top-Level-`ok` behält seine Bedeutung (Korpus lesbar) — n8n-Healthcheck und
   STRICT-Readiness hängen daran.
2. **Schließen (THE-624):** `corpusVectorSync.service.ts` liest die fertigen
   Vektoren aus dem `embedding`-Feld der Korpus-Mongo (kein Re-Embedding, kein
   Sidecar) und upsertet sie idempotent in den lokalen Index (Punkt-ID =
   `sha256(regulationKey)` in UUID-Form, zeichengleich mit dem Crawler).
   Ausgelöst: (a) nach jedem Scheduler-Crawl, (b) periodischer Drift-Check
   (`VECTOR_SYNC_INTERVAL_MINUTES`, Vorgabe 360; `VECTOR_SYNC_ENABLED=false`
   schaltet ab) — er deckt manuelle Crawls direkt auf Server B ab, die Klasse,
   die den 214-Punkte-Rückstand erzeugt hat. Beide Hooks werfen nie
   (Muster `runCrawlJob`).
3. Das CLI `scripts/sync-corpus-vectors.ts` ist ein Wrapper über den Service —
   Erst-Seeding und Ad-hoc-Reparatur.

## Geprüfte und verworfene Alternative: ein gemeinsamer Index

Server A auf den Qdrant von Server B umstellen. Verworfen aus drei gemessenen
bzw. architektonischen Gründen:

- **Latenz ist es NICHT.** Tailnet A→B: 2,8 ms im Mittel (10 Pings, 0 % Verlust).
  Das ursprünglich notierte Latenz-Argument gegen den gemeinsamen Index hält
  der Messung nicht stand und ist ausdrücklich kein Entscheidungsgrund.
- **Exposition:** Qdrant auf Server B bindet keine Host-Ports (containerintern,
  HTTP 000 vom Tailnet). Ein gemeinsamer Index bräuchte erst eine Brücke samt
  ACL-Erweiterung (Muster `ops/corpus-bridge`).
- **Vermischung:** Der Prod-Qdrant hält neben dem Korpus die Mandanten-
  Collections (`elements-<projectId>`). Nach ADR-0002 ist der öffentliche
  Korpus nicht residenzgebunden, der Tenant-Layer sehr wohl — ein Umzug hieße
  zwei Qdrant-Verbindungen im Server-Code, nicht eine geänderte Adresse.
- **Verfügbarkeit:** Server B würde zum Single Point of Failure jeder
  semantischen Funktion der App.

## Richtungs-Entscheid: Pull, nicht Push

Gemessen: Server B erreicht Server A **nicht** (Tailscale-ACL aus THE-441,
100 % Paketverlust — beabsichtigtes Least-Privilege). Ein Push-Design wäre gegen
die ACL gebaut und hätte sie aufgeweicht. Pull von A respektiert sie und braucht
nur die ohnehin bestehende A→B-Route (Korpus-Mongo über die corpus-bridge).

## Konsequenzen

- Drift ist jetzt **messbar** (Health), **begrenzt** (max. ein Intervall bei
  manuellen Crawls, sofort beim Scheduler-Pfad) und **selbstheilend**.
- Die Punkt-ID-Formel existiert doppelt (Crawler + Server, pin-getestet mit
  festgenagelten Kennungen). Der saubere Ort wäre `@thearchitect/shared`;
  ein direkter Import über die Paketgrenze scheitert an `rootDir` (TS6059).
  Hebung nach shared = Folgearbeit, nicht Teil dieses Schnitts.
- Läuft der App-Prozess nicht (Scheduler aus, `VECTOR_SYNC_ENABLED=false`),
  schließt niemand die Lücke automatisch — dann gilt das CLI (Runbook
  Schritt 9b).
