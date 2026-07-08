# THE-390 P4b — Client-Cutover (Umsetzungsplan)

**Stand:** 2026-07-08 · **Voraussetzung erfüllt:** P1–P4a auf master + Prod deployed, Migrations-Dry-Runs verlustfrei · **Grundlage:** ADR-0004, THE-390 P4

## Ziel

Die Korpus-Normen werden **im UI sichtbar und bedienbar**: der Norm-Manager zeigt Upload-Standards und Korpus-Gesetze in einer Liste, eine Regulation kann per Klick in die Pipeline gelegt werden, und Pipeline/Portfolio/Gap-Ansichten funktionieren mit beiden Welten. Erst damit ist Strecke A des Abnahme-Testplans (`docs/test-guide-norm-pipeline.md`) menschlich durchspielbar.

## Der Glücksfall (hält den Slice klein)

P2/P3 haben die Server-Endpunkte normRef-fähig gemacht **über dieselben Parameter**: `refreshMappingStats(projectId, ref)` nimmt `corpus:dsgvo` genauso wie eine `standardId`; das Portfolio liefert Korpus-Zeilen bereits mit (`standardId: normId ?? …, normId`, Name/Typ via Facade). Der Client muss also **nicht** auf eine neue API umgebaut werden — die `standardId`-Strings im Client tragen transparent workIds. Der Cutover ist additiv: neue Tab-Ansicht + Durchreichen, kein Refactor der bestehenden Flows.

## Scope (BUILD)

1. **`normsAPI` in `api.ts`** — 3 Aufrufe: `list(projectId)`, `mappings(projectId, workId)`, `addToPipeline(projectId, workId)` (Routen aus P2 existieren).
2. **StandardsManager → Norm-Manager** (`copilot/StandardsManager.tsx`): zweiter Tab **„Regulations"** — listet Korpus-Normen (`source: 'corpus'`, Titel, Jurisdiktion, Section-Zahl) + Button **„Add to pipeline"**. Upload-Tab bleibt unverändert. Englische UI-Strings.
3. **Portfolio-/Pipeline-Karten robust für workIds**: Korpus-Zeilen erscheinen (kommt aus P2); prüfen/fixen, dass Karten-Aktionen (refreshStats, Detail) mit non-ObjectId-`standardId` nicht brechen — `complianceStore.refreshStats` reicht den String schon durch.
4. **GapAnalysis-Verdrahtung prüfen**: `byRegulation` liefert normIds als `regulationId` (P3) — Filter-Klicks müssen den String ungeprüft durchreichen (kein `isValidObjectId`-Gate im Client).
5. **Tests**: vitest für Norm-Manager-Tab (Liste + Add-to-pipeline-Call) + Portfolio-Karte mit workId-Zeile.

## Explizit NICHT in P4b (→ P4c/P5, ehrliche Korrektur zu gestern)

- **Unique-Index-/FK-Flip** auf `normId`/`corpusRef` + Alt-Collection-Stilllegung: destruktiv, gehört **hinter** den grünen E2E-Test (erst UI verifizieren, dann Fundament flippen — sonst flippen wir auf unverifiziertem UI). → P4c, gebündelt mit den `--apply`-Migrationen in P5.
- Read-Cutover der Facade auf die Norm-Collection (gleiches Argument).
- **Prod-`CORPUS_MONGODB_URI` fehlt** (Befund 2026-07-07): ohne sie sieht Prod nur die 19 legacy Regs, keine Server-B-Korpus-Gesetze. Ops-Schritt in P5: Variable in Prod-`.env` setzen (Tailnet-URI) + force-recreate app. Für Dev/E2E lokal vorhanden.

## Aufwand & Sequenz

Branch `mganzmanninfo/the-390-p4b-client-cutover` · api → Manager-Tab → Robustheit → Tests · **~0,5–1 PT** · Merge-Kriterium: vitest grün, bestehende Client-Suite grün, TSC clean. Danach: **manuelle Strecke A/B** aus dem Testplan (lokal), dann P4c/P5.
