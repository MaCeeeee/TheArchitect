# RVTM: THE-655 Slice 1 — Geteilter Snapshot überlebt seinen Ursprung nicht

**Spec:** Linear [THE-655](https://linear.app/thearchitect/issue/THE-655) (Befund + „Was zu tun ist") · Loop-Kontrakt Strang 1 als Kommentar (20.09.2026) · Pre-Flight-Kommentar (20.09.2026)
**Plan:** `docs/superpowers/plans/2026-09-20-the655-snapshot-gone.md`
**Prüfszenarien (versiegelt, Pfad):** `docs/superpowers/pruefszenarien/2026-09-20-the655-snapshot-gone-pruefszenarien.md`
**Created:** 2026-09-20
**Last Updated:** 2026-09-20 (Abnahme, NF-003 offen)

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| **R-001** | `GET /api/snapshots/:token` liefert 200 mit unveränderter Antwortform (`title, description, viewType, createdAt, expiresAt, elements, connections, summary`), solange Projekt und Ersteller existieren | Task 3 | `src/routes/snapshot.routes.ts` | Test „200 mit unveränderter Antwortform" | PASS | Blindprüfung 20.09. (HEAD f39184b): S-001 PASS — 200, alle acht Payload-Keys; Suite-Test „200 mit unveränderter Antwortform" |
| **R-002** | Fehlt das Projekt: 410 Gone, `success:false`, Klartext sagt, dass „the project or account it belonged to has been deleted" — **generisch**: der anonyme Link-Inhaber erfährt nicht, welcher Ursprung gelöscht wurde (Art. 17: keine Aussage über eine gelöschte Person), der Grund steht nur im Server-Log; der Token ist danach entfernt (zweiter Aufruf 404) — Einmal-Signal, als Entscheidung im Route-Kommentar und im Ticket dokumentiert (Review-Entscheid 20.09.) | Tasks 2–3 | `src/services/snapshot.service.ts`, `src/routes/snapshot.routes.ts` | Tests „410 … Projekt gelöscht", „410-Text ist für beide Ursachen identisch" | PASS | S-002/S-003/S-020 PASS — 410 mit generischem Text, danach 404, Body nur `success`/`error`; Tests „410 … Projekt gelöscht", „410-Text ist für beide Ursachen identisch" (f39184b) |
| **R-003** | Fehlt das Konto des Erstellers: 410 Gone mit demselben generischen Klartext wie R-002 (nennt „project or account", nicht welches); Grund `owner` nur im Server-Log; Token entfernt | Tasks 2–3 | wie R-002 | Test „410 … Konto" (prüft `account` **und** `project` im Text) | PASS | S-004 PASS — 410, Text enthält `account` und `project`; Test „410 … Konto" prüft beides |
| **R-004** | Leeres oder ungültiges `createdBy`/`projectId` gilt als nicht existent (fail closed) — ohne Datenbankabfrage (`mongoose.isValidObjectId`, bson ≥ 6: nur 24-Hex) | Task 2 | `src/services/snapshot.service.ts` | Tests „leerem createdBy" und „ungültiger projectId" | PASS | S-005/S-006 PASS — 410 ohne `User.exists` bzw. `Project.exists`-Aufruf; Tests „leerem createdBy", „ungültiger projectId" |
| **R-005** | Unbekannter Token: 404 wie bisher, ohne Datenbankabfrage | Task 3 | Route | Test „404 für unbekannten Token" | PASS | S-007 PASS — 404, Body byte-exakt, kein DB-Aufruf |
| **R-006** | Ablauf und `maxAccesses` werden **vor** der Ursprungsprüfung ausgewertet und verhalten sich unverändert (abgelaufen → 404, auch wenn das Projekt fehlt) | Task 2 | Service | Tests „abgelaufener Link", „maxAccesses" | PASS | S-008/S-009 PASS — abgelaufen → 404 ohne DB-Aufruf; maxAccesses 1 → 200 dann 404 |
| **R-007** | Der Zugriffszähler zählt nur bei 200; `peekSnapshot` zählt nie; ein 410 zählt nicht | Task 2 | Service | Tests „peek zählt nicht", „gone … zählt nicht" | PASS | S-010/S-011 PASS — accessCount 0→1 nur bei 200; nach 410 kein Store-Eintrag; Tests „peek zählt nicht", „gone … zählt nicht" |
| **R-008** | Die Existenzprüfer sind injizierbar und erhalten `projectId` bzw. `createdBy` des Snapshots; Standard = Mongoose `Project.exists` / `User.exists` | Task 2 | Service | Test „injizierten Prüfer" + Code-Review `DEFAULT_ORIGIN_CHECKS` | PASS | S-012 PASS (`Project.exists`/`User.exists` in `DEFAULT_ORIGIN_CHECKS`); Test „injizierten Prüfer bekommen projectId und createdBy" |
| **R-009** | Die geschützten Routen (POST/GET-Liste/DELETE unter `/api/projects/:projectId/snapshots`) sind unverändert | Task 3 | Route | `git diff` zeigt nur den öffentlichen GET + Import | PASS | S-013/S-014 PASS — POST liefert 64-Hex-Token + shareUrl, DELETE dann GET 404; Diff der Route nur öffentlicher GET + Import |
| **R-010** | Kann die Existenz **nicht festgestellt** werden (Prüfer wirft, z. B. Mongo nicht erreichbar), antwortet die Route 500 und der Token bleibt bestehen — nie „gone", nie gelöscht; kein `.catch(() => false)` in den Prüfern (Review-Befund 20.09.) | Review-Nachzug (0a4bab7) | `src/services/snapshot.service.ts` (JSDoc), Route-`catch` | Test „wirft die Existenzprüfung … 500 und der Token bleibt bestehen" (inkl. Erholung auf 200) | PASS | Suite-Test „wirft die Existenzprüfung … 500 und der Token bleibt bestehen" (0a4bab7): 500 mit Standard-Fehlerbody, `peekSnapshot` non-null, danach 200; Qualitätsreview-Bestätigung 20.09. (kein Sealed-Szenario — Anforderung entstand im Review) |
| **NF-001** | Tests laufen ohne MongoDB, ohne Neo4j, ohne Netz (alle Modelle und `runCypher` gemockt) | Task 1 | Testdatei | `npx jest src/__tests__/snapshot.routes.gone.test.ts` | PASS | S-016 PASS — 13/13 Tests, Log ohne Verbindungsversuch (einziger Treffer ist der Fixture-String „mongo down") |
| **NF-002** | Build grün; keine neuen Fehlschläge gegenüber `origin/master` (vorbestehend flaky Suiten ausgenommen) | Task 3 Step 4; Task 4 | — | `npm run build -w @thearchitect/server`; side-by-side | PASS | S-017 PASS (Build EXIT=0); `tsc --noEmit` sauber; Gesamtsuite side-by-side: 12 vorbestehend rote Suiten identisch zu `origin/master`, +1 Suite/+10 Tests grün (243→244 Suiten; Basislinie 10 failed/3246 passed → 10 failed/3256 passed) |
| **NF-003** | **Impact (Ist):** Auf Prod liefert ein geteilter Link nach Projektlöschung sofort 410 mit Klartext, danach 404 — als Kommentar an THE-655 | Task 6 | — | curl-Transkript im Ticket | PENDING | AUSSTEHEND bis Deploy — Impact (Ist) wird nach der Prod-Gegenprobe als Kommentar an THE-655 nachgetragen (Plan Task 6) |
| **C-001** | Delete-Pfade (`project.routes.ts`, `settings.routes.ts`) werden in diesem Slice nicht angefasst | Task 4 Step 2 | — | `git diff origin/master --stat` auf beide Dateien leer | PASS | S-015 PASS — Diff auf `project.routes.ts`/`settings.routes.ts` leer |
| **C-002** | Branch `fix/the-655-snapshot-gone`; Commit-Titel nennen THE-655, nie THE-536 | Vorbereitung | — | `git log --format=%s origin/master..HEAD` | PASS | S-018 PASS — Branch `fix/the-655-snapshot-gone`, 8 Commits, kein THE-536 |
| **C-003** | Eigener Worktree mit eigenen `node_modules` | Vorbereitung | — | `git worktree list`; `ls javis-the655/node_modules` | PASS | S-019 PASS — `javis-the655`, 712 Einträge in node_modules |
| **C-004** | Kein Implementierer liest `docs/superpowers/pruefszenarien/`; blinder Prüfer führt den ganzen Katalog aus | Vorbereitung; Task 5 | — | Prüfer-Report | PASS | Drei Blindläufe (a9fb2f8 20/20, 0a4bab7 20/20, f39184b 20/20), jeweils frischer Prüfer, ganzer Katalog |

## Coverage Summary

- **Total Requirements:** 17 (10 × R, 3 × NF, 4 × C)
- **Verified (PASS):** 16
- **Failed (FAIL):** 0
- **Pending:** 1 (NF-003, Prod-Gegenprobe nach Deploy)
- **Coverage:** 94 % (16/17); 100 % nach NF-003

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-09-20 | Initial RVTM created | R-001..R-009, NF-001..NF-003, C-001..C-004 | Plan phase |
| 2026-09-20 | Review-Loop (Approved): Einmal-Signal dokumentiert, Basislinie für Side-by-side, Docs auf den Branch | R-002, NF-002 | Plan phase |
| 2026-09-20 | Code-Review-Nachzug (0a4bab7): 410-Text generisch (R-002/R-003 umformuliert), R-004 um projectId-Guard, neues R-010 (Prüffehler ⇒ 500, nie löschen) | R-002, R-003, R-004, R-010 | Execution |
| 2026-09-20 | Abnahme: Blindprüfung 20/20 (HEAD f39184b), 16/17 PASS; NF-003 wartet auf Deploy + Prod-Gegenprobe | alle außer NF-003 | Execution |
