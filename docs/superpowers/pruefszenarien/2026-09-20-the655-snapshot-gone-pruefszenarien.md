# Prüfszenarien: THE-655 Slice 1 — Geteilter Snapshot überlebt seinen Ursprung nicht — VERSIEGELT

> **SEALED — do not open during implementation.** No implementer (subagent or session)
> may read this file. Only the blind verifier opens it, after implementation.

**Spec:** Linear THE-655 (Befund 2026-08-12 + „Was zu tun ist") + Loop-Kontrakt Strang 1 (20.09.2026) + RVTM `docs/superpowers/rvtm/2026-09-20-the655-snapshot-gone-rvtm.md`
**Created:** 2026-09-20 (before implementation)
**Ausführung:** Worktree `/Users/mac_macee/javis-the655`, Befehle in `packages/server`. Für die HTTP-Szenarien legt der Prüfer eine **eigene Wegwerf-Testdatei** `src/__tests__/zz-blind-the655.test.ts` an (supertest gegen den Router unter `/api`; `../config/neo4j` mit `runCypher → []`, `../models/Project` und `../models/User` mit `exists`-Stubs, die Middlewares `auth`, `projectAccess`, `audit` als Durchreicher gemockt), führt sie aus und **löscht sie danach**. Ein Snapshot entsteht über `createSnapshot({ projectId, createdBy, title, viewType: '3d' })` aus `../services/snapshot.service`; `projectId`/`createdBy` sind gültige 24-Hex-ObjectIds.

| ID | REQ | Given / When / Then | Expected observable result | Type |
|----|-----|---------------------|---------------------------|------|
| S-001 | R-001 | Given Snapshot mit Titel `T1`, `Project.exists` → `{_id}`, `User.exists` → `{_id}`; When `GET /api/snapshots/<token>` | Status `200`; Body `success` = `true`; `data.title` = `T1`; `data` hat die Keys `viewType, createdAt, expiresAt, elements, connections, summary` | Positive |
| S-002 | R-002 | Given wie S-001, aber `Project.exists` → `null`; When GET | Status `410`; Body `success` = `false`; `error` ist ein String, der `project` und `deleted` enthält (case-insensitiv) | Positive |
| S-003 | R-002 | Given S-002 ausgeführt; When derselbe Token noch einmal per GET (jetzt mit `Project.exists` → `{_id}`) | Status `404` (der Token wurde beim 410 entfernt) | Positive |
| S-004 | R-003 | Given wie S-001, aber `User.exists` → `null`; When GET | Status `410`; `error` enthält `account` und `deleted` | Positive |
| S-005 | R-004 | Given Snapshot mit `createdBy: ''`, beide `exists`-Stubs → `{_id}`; When GET | Status `410`; `User.exists` wurde **nicht** aufgerufen | Negative |
| S-006 | R-004 | Given Snapshot mit `projectId: 'not-an-objectid'`; When GET | Status `410`; `Project.exists` wurde **nicht** aufgerufen | Negative |
| S-007 | R-005 | When `GET /api/snapshots/nope` ohne angelegten Snapshot | Status `404`; Body exakt `{"success":false,"error":"Snapshot not found or expired"}`; `Project.exists` nicht aufgerufen | Negative |
| S-008 | R-006 | Given Snapshot mit `expiresInHours: -1` und `Project.exists` → `null`; When GET | Status `404` (nicht 410); `Project.exists` nicht aufgerufen | Negative |
| S-009 | R-006 | Given Snapshot mit `maxAccesses: 1`, beide Stubs → `{_id}`; When zweimal GET | erst `200`, dann `404` | Positive |
| S-010 | R-007 | Given Snapshot; When `listSnapshots(projectId)` aus dem Service vor und nach einem 200-GET gelesen | `accessCount` erst `0`, dann `1` | Positive |
| S-011 | R-007 | Given Snapshot, `Project.exists` → `null`; When GET (410) und danach der Store-Eintrag geprüft (Service-Funktion, die ohne zu zählen liest, oder `listSnapshots`) | kein Eintrag mehr für den Token | Negative |
| S-012 | R-008 | When `grep -n "Project.exists\|User.exists" src/services/snapshot.service.ts` | jeweils ≥ 1 Treffer | Positive |
| S-013 | R-009 | Given Auth-Mocks; When `POST /api/projects/<projectId>/snapshots` (Router zusätzlich unter `/api/projects` gemountet) mit Body `{"title":"x","viewType":"3d"}` | Status `200`; Body `data.token` ist ein 64-Zeichen-Hex-String; `data.shareUrl` = `/shared/<token>` | Positive |
| S-014 | R-009 | Given ein Snapshot; When `DELETE /api/projects/<projectId>/snapshots/<token>`, dann `GET /api/snapshots/<token>` | erst `200` `{"success":true}`, dann `404` | Positive |
| S-015 | C-001 | When `git diff origin/master --stat -- packages/server/src/routes/project.routes.ts packages/server/src/routes/settings.routes.ts` (Worktree-Root) | leere Ausgabe | Negative |
| S-016 | NF-001 | When `env -u MONGODB_URI -u NEO4J_URI npx jest src/__tests__/snapshot.routes.gone.test.ts 2>&1 | tail -4` | alle Tests bestanden, kein Verbindungsversuch im Log | Negative |
| S-017 | NF-002 | When `npm run build -w @thearchitect/server; echo EXIT=$?` (Worktree-Root) | `EXIT=0` | Positive |
| S-018 | C-002 | When `git rev-parse --abbrev-ref HEAD` und `git log --format=%s origin/master..HEAD | grep -c 'THE-536'` | `fix/the-655-snapshot-gone` und `0` | Positive |
| S-019 | C-003 | When `git worktree list | grep -c javis-the655` und `ls /Users/mac_macee/javis-the655/node_modules | wc -l` | `1` und `> 0` | Positive |
| S-020 | R-002 | Given wie S-002; When der Body mit `JSON.parse` gelesen | keine weiteren Keys außer `success` und `error` (kein Datenleck im 410) | Negative |
