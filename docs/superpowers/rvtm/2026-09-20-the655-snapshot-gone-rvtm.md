# RVTM: THE-655 Slice 1 — Geteilter Snapshot überlebt seinen Ursprung nicht

**Spec:** Linear [THE-655](https://linear.app/thearchitect/issue/THE-655) (Befund + „Was zu tun ist") · Loop-Kontrakt Strang 1 als Kommentar (20.09.2026) · Pre-Flight-Kommentar (20.09.2026)
**Plan:** `docs/superpowers/plans/2026-09-20-the655-snapshot-gone.md`
**Prüfszenarien (versiegelt, Pfad):** `docs/superpowers/pruefszenarien/2026-09-20-the655-snapshot-gone-pruefszenarien.md`
**Created:** 2026-09-20
**Last Updated:** 2026-09-20

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| **R-001** | `GET /api/snapshots/:token` liefert 200 mit unveränderter Antwortform (`title, description, viewType, createdAt, expiresAt, elements, connections, summary`), solange Projekt und Ersteller existieren | Task 3 | `src/routes/snapshot.routes.ts` | Test „200 mit unveränderter Antwortform" | PENDING | — |
| **R-002** | Fehlt das Projekt: 410 Gone, `success:false`, Klartext sagt, dass „the project or account it belonged to has been deleted" — **generisch**: der anonyme Link-Inhaber erfährt nicht, welcher Ursprung gelöscht wurde (Art. 17: keine Aussage über eine gelöschte Person), der Grund steht nur im Server-Log; der Token ist danach entfernt (zweiter Aufruf 404) — Einmal-Signal, als Entscheidung im Route-Kommentar und im Ticket dokumentiert (Review-Entscheid 20.09.) | Tasks 2–3 | `src/services/snapshot.service.ts`, `src/routes/snapshot.routes.ts` | Tests „410 … Projekt gelöscht", „410-Text ist für beide Ursachen identisch" | PENDING | — |
| **R-003** | Fehlt das Konto des Erstellers: 410 Gone mit demselben generischen Klartext wie R-002 (nennt „project or account", nicht welches); Grund `owner` nur im Server-Log; Token entfernt | Tasks 2–3 | wie R-002 | Test „410 … Konto" (prüft `account` **und** `project` im Text) | PENDING | — |
| **R-004** | Leeres oder ungültiges `createdBy`/`projectId` gilt als nicht existent (fail closed) — ohne Datenbankabfrage (`mongoose.isValidObjectId`, bson ≥ 6: nur 24-Hex) | Task 2 | `src/services/snapshot.service.ts` | Tests „leerem createdBy" und „ungültiger projectId" | PENDING | — |
| **R-005** | Unbekannter Token: 404 wie bisher, ohne Datenbankabfrage | Task 3 | Route | Test „404 für unbekannten Token" | PENDING | — |
| **R-006** | Ablauf und `maxAccesses` werden **vor** der Ursprungsprüfung ausgewertet und verhalten sich unverändert (abgelaufen → 404, auch wenn das Projekt fehlt) | Task 2 | Service | Tests „abgelaufener Link", „maxAccesses" | PENDING | — |
| **R-007** | Der Zugriffszähler zählt nur bei 200; `peekSnapshot` zählt nie; ein 410 zählt nicht | Task 2 | Service | Tests „peek zählt nicht", „gone … zählt nicht" | PENDING | — |
| **R-008** | Die Existenzprüfer sind injizierbar und erhalten `projectId` bzw. `createdBy` des Snapshots; Standard = Mongoose `Project.exists` / `User.exists` | Task 2 | Service | Test „injizierten Prüfer" + Code-Review `DEFAULT_ORIGIN_CHECKS` | PENDING | — |
| **R-009** | Die geschützten Routen (POST/GET-Liste/DELETE unter `/api/projects/:projectId/snapshots`) sind unverändert | Task 3 | Route | `git diff` zeigt nur den öffentlichen GET + Import | PENDING | — |
| **R-010** | Kann die Existenz **nicht festgestellt** werden (Prüfer wirft, z. B. Mongo nicht erreichbar), antwortet die Route 500 und der Token bleibt bestehen — nie „gone", nie gelöscht; kein `.catch(() => false)` in den Prüfern (Review-Befund 20.09.) | Review-Nachzug (0a4bab7) | `src/services/snapshot.service.ts` (JSDoc), Route-`catch` | Test „wirft die Existenzprüfung … 500 und der Token bleibt bestehen" (inkl. Erholung auf 200) | PENDING | — |
| **NF-001** | Tests laufen ohne MongoDB, ohne Neo4j, ohne Netz (alle Modelle und `runCypher` gemockt) | Task 1 | Testdatei | `npx jest src/__tests__/snapshot.routes.gone.test.ts` | PENDING | — |
| **NF-002** | Build grün; keine neuen Fehlschläge gegenüber `origin/master` (vorbestehend flaky Suiten ausgenommen) | Task 3 Step 4; Task 4 | — | `npm run build -w @thearchitect/server`; side-by-side | PENDING | — |
| **NF-003** | **Impact (Ist):** Auf Prod liefert ein geteilter Link nach Projektlöschung sofort 410 mit Klartext, danach 404 — als Kommentar an THE-655 | Task 6 | — | curl-Transkript im Ticket | PENDING | — |
| **C-001** | Delete-Pfade (`project.routes.ts`, `settings.routes.ts`) werden in diesem Slice nicht angefasst | Task 4 Step 2 | — | `git diff origin/master --stat` auf beide Dateien leer | PENDING | — |
| **C-002** | Branch `fix/the-655-snapshot-gone`; Commit-Titel nennen THE-655, nie THE-536 | Vorbereitung | — | `git log --format=%s origin/master..HEAD` | PENDING | — |
| **C-003** | Eigener Worktree mit eigenen `node_modules` | Vorbereitung | — | `git worktree list`; `ls javis-the655/node_modules` | PENDING | — |
| **C-004** | Kein Implementierer liest `docs/superpowers/pruefszenarien/`; blinder Prüfer führt den ganzen Katalog aus | Vorbereitung; Task 5 | — | Prüfer-Report | PENDING | — |

## Coverage Summary

- **Total Requirements:** 17 (10 × R, 3 × NF, 4 × C)
- **Verified (PASS):** 0
- **Failed (FAIL):** 0
- **Pending:** 17
- **Coverage:** 0 %

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-09-20 | Initial RVTM created | R-001..R-009, NF-001..NF-003, C-001..C-004 | Plan phase |
| 2026-09-20 | Review-Loop (Approved): Einmal-Signal dokumentiert, Basislinie für Side-by-side, Docs auf den Branch | R-002, NF-002 | Plan phase |
| 2026-09-20 | Code-Review-Nachzug (0a4bab7): 410-Text generisch (R-002/R-003 umformuliert), R-004 um projectId-Guard, neues R-010 (Prüffehler ⇒ 500, nie löschen) | R-002, R-003, R-004, R-010 | Execution |
