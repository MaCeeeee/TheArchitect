# THE-655 Slice 1: Geteilter Snapshot überlebt seinen Ursprung nicht — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der öffentliche Endpunkt `GET /api/snapshots/:token` liefert `410 Gone` mit Klartext, sobald das Projekt oder das Konto des Erstellers nicht mehr existiert — und entfernt den Link dabei aus dem Speicher. Kein Login, kein Cron, keine Kaskade nötig: die Prüfung passiert beim Lesen.

**Architecture:** Im Snapshot-Service kommt eine zählfreie Sicht `peekSnapshot` und eine Auflösung `resolveSharedSnapshot(token, checks)` dazu, die vor der Auslieferung die Existenz von Projekt (`Project.exists`) und Ersteller (`User.exists`) prüft; die Prüfer sind injizierbar, damit der Test ohne MongoDB läuft. Die Route bildet die drei Ausgänge auf 404 / 410 / 200 ab. Der Zugriffszähler zählt nur bei 200. Slice 2 (aktive Invalidierung bei Projekt-/Kontolöschung) und Slice 3 (Lösch-Dialog zeigt aktive Freigaben) sind eigene Pläne.

**Tech Stack:** Express 4, Mongoose (`Project`, `User` Modelle), in-memory Snapshot-Store (`snapshot.service.ts`), Jest + supertest (Muster: `src/__tests__/ai.routes.limiter-scope.test.ts`).

**Linear:** [THE-655](https://linear.app/thearchitect/issue/THE-655) (Bug, In Progress, Strang 1, fällig 23.10.) · verwandt [THE-536](https://linear.app/thearchitect/issue/THE-536) (interne Lösch-Kaskade, bleibt getrennt)

**RVTM:** `docs/superpowers/rvtm/2026-09-20-the655-snapshot-gone-rvtm.md`

**Prüfszenarien (versiegelt):** `docs/superpowers/pruefszenarien/2026-09-20-the655-snapshot-gone-pruefszenarien.md` — implementers must not read this file

---

## Kontext: was gemessen ist

- Befund auf **Produktion**, 12.08.2026 (B-084): `GET /api/snapshots/<token>` lieferte 200 mit voller Elementliste nach `DELETE /api/projects/:id` (200) **und** `DELETE /api/settings/account` (200, Login danach 401). Der Link verfällt erst mit seiner 72-h-TTL.
- Code: `src/services/snapshot.service.ts` — In-Memory `Map<token, Snapshot>` (Kommentar „production: move to MongoDB"), `getSnapshot(token)` prüft nur `expiresAt` und `maxAccesses` (`:116-126`) und **zählt** danach den Zugriff (`accessCount++`) — eine Ursprungsprüfung gibt es nirgends. `Snapshot` trägt `projectId` und `createdBy`.
- Route: `src/routes/snapshot.routes.ts:9-35`, gemountet unter `/api` (`src/index.ts:191`); die geschützten Routen (`POST/GET/DELETE /:projectId/snapshots…`) unter `/api/projects` (`:192`) bleiben unberührt.
- Client: `packages/client/src/components/portfolio/SharedSnapshotView.tsx:36` rendert `err.response?.data?.error` — der 410-Klartext erreicht den Link-Besucher ohne Client-Änderung.
- **Entscheidung (Spec: „entscheiden und dokumentieren"):** Der Klartext-410 ist ein **Einmal-Signal**: beim ersten Aufruf nach der Löschung wird er gezeigt und der Token entfernt; jeder spätere Besucher bekommt das generische 404 „Snapshot not found or expired". Bewusst so — ein dauerhaft sprechender 410 hieße, Metadaten gelöschter Projekte weiter vorzuhalten.
- Projekt-Delete `src/routes/project.routes.ts:200` (`Project.findByIdAndDelete`), Konto-Delete `src/routes/settings.routes.ts:99` — **werden in diesem Slice nicht angefasst.**
- Loop-Kontrakt (Kommentar an THE-655): Done = Fehlerbild reproduziert nicht mehr (E2E-Evidenz), nicht „gemerged". Weiche Daten, Strang 2 hat Vorfahrt.

## Vorbereitung (vor Task 1)

- [ ] **Eigener Worktree, eigener Branch:**

```bash
cd /Users/mac_macee/javis && git fetch origin && git worktree add /Users/mac_macee/javis-the655 -b fix/the-655-snapshot-gone origin/master
```

- [ ] **Branch trägt THE-655 mit Absicht.** Linear schließt das Bug-Ticket beim Merge automatisch. Das ist hier akzeptabel, weil der Test die E2E-Evidenz lokal liefert; die **Prod-Gegenprobe nach dem Deploy** wird als Kommentar nachgetragen (Task 6). Kein Commit-Titel nennt THE-536.

- [ ] **Worktree ohne eigene `node_modules` testet still gegen das falsche `shared`:**

```bash
cd /Users/mac_macee/javis-the655 && npm install && npm run build --workspace=@thearchitect/shared
```

- [ ] **Plan, RVTM und versiegelten Katalog auf den Branch legen** (im Hauptrepo uncommitted; die RVTM wird im Worktree gepflegt; `cp` liest nichts in den Kontext):

```bash
cd /Users/mac_macee/javis-the655 && mkdir -p docs/superpowers/plans docs/superpowers/rvtm docs/superpowers/pruefszenarien && cp /Users/mac_macee/javis/docs/superpowers/plans/2026-09-20-the655-snapshot-gone.md docs/superpowers/plans/ && cp /Users/mac_macee/javis/docs/superpowers/rvtm/2026-09-20-the655-snapshot-gone-rvtm.md docs/superpowers/rvtm/ && cp /Users/mac_macee/javis/docs/superpowers/pruefszenarien/README.md /Users/mac_macee/javis/docs/superpowers/pruefszenarien/2026-09-20-the655-snapshot-gone-pruefszenarien.md docs/superpowers/pruefszenarien/ && git add docs/superpowers && git commit -m "docs(the-655): Plan, RVTM und versiegelte Prüfszenarien für Slice 1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Basislinie für den Side-by-side-Vergleich** (9–10 Integrationssuiten sind vorbestehend flaky):

```bash
cd /Users/mac_macee/javis/packages/server && npx jest 2>&1 | grep -E '^(Tests|Test Suites):'
```

Expected: zwei Zeilen; die Zahlen notieren (sie sind der Vergleichswert für Task 4 Step 3).

- [ ] **Kein Implementierer öffnet** `docs/superpowers/pruefszenarien/`.

## File Structure

| Datei | Art | Verantwortung |
|---|---|---|
| `packages/server/src/services/snapshot.service.ts` | Modify (additiv) | `peekSnapshot` (zählfrei), `OriginChecks`, `DEFAULT_ORIGIN_CHECKS` (Mongoose), `resolveSharedSnapshot`. `getSnapshot` bleibt unverändert. |
| `packages/server/src/routes/snapshot.routes.ts` | Modify (nur der öffentliche GET) | 404 / 410 / 200 aus der Auflösung; Antwortform bei 200 unverändert. |
| `packages/server/src/__tests__/snapshot.routes.gone.test.ts` | Create | Route + Service, alle Modelle und Neo4j gemockt. |

---

## Chunk 1: Existenzprüfung beim Lesen

### Task 1: Failing Tests schreiben

**Files:**
- Create: `packages/server/src/__tests__/snapshot.routes.gone.test.ts`

- [ ] **Step 1: Testdatei anlegen**

```ts
/**
 * THE-655 Slice 1 — Ein geteilter Snapshot überlebt seinen Ursprung nicht.
 *
 * Befund (Prod, 2026-08-12): ein öffentlicher Snapshot-Link lieferte nach
 * Projekt- UND Kontolöschung weiter 200 bis zum TTL-Ablauf. Diese Tests pinnen
 * den öffentlichen Endpunkt: 200 nur, solange Projekt und Ersteller existieren;
 * sonst 410 Gone mit Klartext, und der Token ist danach weg.
 *
 * Run: cd packages/server && npx jest src/__tests__/snapshot.routes.gone.test.ts
 */
import express, { type Express } from 'express';
import request from 'supertest';

jest.mock('../config/neo4j', () => ({ runCypher: jest.fn().mockResolvedValue([]) }));
const projectExists = jest.fn();
const userExists = jest.fn();
jest.mock('../models/Project', () => ({ Project: { exists: (...a: unknown[]) => projectExists(...a) } }));
jest.mock('../models/User', () => ({ User: { exists: (...a: unknown[]) => userExists(...a) } }));
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({
  createAuditEntry: jest.fn(),
  audit: () => (_req: any, _res: any, next: any) => next(),
}));

import { createSnapshot, peekSnapshot, resolveSharedSnapshot } from '../services/snapshot.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const snapshotRouter = require('../routes/snapshot.routes').default;

const PROJECT = '64b7f0c2a1e4d3f2b8c9a0d1';
const OWNER = '64b7f0c2a1e4d3f2b8c9a0d2';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', snapshotRouter);
  return app;
}

async function share(overrides: Partial<{ projectId: string; createdBy: string; expiresInHours: number; maxAccesses: number }> = {}) {
  const s = await createSnapshot({ projectId: PROJECT, createdBy: OWNER, title: 'Stakeholder Overview', viewType: '3d', ...overrides });
  return s.token;
}

beforeEach(() => {
  projectExists.mockReset().mockResolvedValue({ _id: PROJECT });
  userExists.mockReset().mockResolvedValue({ _id: OWNER });
});

describe('GET /api/snapshots/:token (THE-655)', () => {
  it('200 mit unveränderter Antwortform, solange Projekt und Ersteller existieren', async () => {
    const token = await share();
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ title: 'Stakeholder Overview', viewType: '3d', elements: [], connections: [] });
    expect(res.body.data.expiresAt).toBeDefined();
  });

  it('410 Gone, wenn das Projekt gelöscht ist — Klartext, und der Token ist danach weg', async () => {
    const token = await share();
    projectExists.mockResolvedValue(null);
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/project/i);
    expect(res.body.error).toMatch(/deleted/i);
    expect(peekSnapshot(token)).toBeNull();
    const again = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(again.status).toBe(404);
  });

  it('410 Gone, wenn das Konto des Erstellers gelöscht ist', async () => {
    const token = await share();
    userExists.mockResolvedValue(null);
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/account/i);
    expect(peekSnapshot(token)).toBeNull();
  });

  it('410 auch bei leerem createdBy — fail closed, ohne Datenbankfrage', async () => {
    const token = await share({ createdBy: '' });
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(410);
    expect(userExists).not.toHaveBeenCalled();
  });

  it('404 für unbekannten Token — ohne Datenbankfrage', async () => {
    const res = await request(makeApp()).get('/api/snapshots/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Snapshot not found or expired' });
    expect(projectExists).not.toHaveBeenCalled();
  });

  it('abgelaufener Link bleibt 404, auch wenn das Projekt fehlt (Ablauf wird zuerst geprüft)', async () => {
    const token = await share({ expiresInHours: -1 });
    projectExists.mockResolvedValue(null);
    const res = await request(makeApp()).get(`/api/snapshots/${token}`);
    expect(res.status).toBe(404);
    expect(projectExists).not.toHaveBeenCalled();
  });

  it('maxAccesses wirkt unverändert: nach dem letzten erlaubten Zugriff 404', async () => {
    const token = await share({ maxAccesses: 1 });
    expect((await request(makeApp()).get(`/api/snapshots/${token}`)).status).toBe(200);
    expect((await request(makeApp()).get(`/api/snapshots/${token}`)).status).toBe(404);
  });
});

describe('resolveSharedSnapshot / peekSnapshot', () => {
  it('peek zählt nicht; ein ok-Ergebnis zählt genau einmal', async () => {
    const token = await share();
    expect(peekSnapshot(token)!.accessCount).toBe(0);
    const r = await resolveSharedSnapshot(token);
    expect(r.kind).toBe('ok');
    expect(peekSnapshot(token)!.accessCount).toBe(1);
  });

  it('ein gone-Ergebnis zählt nicht und räumt den Token weg', async () => {
    const token = await share();
    const r = await resolveSharedSnapshot(token, {
      projectExists: async () => false,
      ownerExists: async () => true,
    });
    expect(r).toEqual({ kind: 'gone', reason: 'project' });
    expect(peekSnapshot(token)).toBeNull();
  });

  it('die injizierten Prüfer bekommen projectId und createdBy des Snapshots', async () => {
    const token = await share();
    const checks = { projectExists: jest.fn().mockResolvedValue(true), ownerExists: jest.fn().mockResolvedValue(true) };
    await resolveSharedSnapshot(token, checks);
    expect(checks.projectExists).toHaveBeenCalledWith(PROJECT);
    expect(checks.ownerExists).toHaveBeenCalledWith(OWNER);
  });
});
```

- [ ] **Step 2: Fehlschlag sehen**

Run: `cd /Users/mac_macee/javis-the655/packages/server && npx jest src/__tests__/snapshot.routes.gone.test.ts 2>&1 | tail -20`
Expected: `Tests: 6 failed, 4 passed, 10 total` — ts-jest läuft transpile-only, also **kein** TS-Fehler, sondern dreimal `TypeError: (0 , snapshot_service_1.peekSnapshot) is not a function` und dreimal `Expected: 410 / Received: 200`. Das ist der gewollte rote Lauf, keine kaputte Umgebung.

- [ ] **Step 3: Commit (nur der Test, rot)**

```bash
cd /Users/mac_macee/javis-the655 && git add packages/server/src/__tests__/snapshot.routes.gone.test.ts && git commit -m "test(the-655): öffentlicher Snapshot-Link muss 410 liefern, wenn Projekt oder Ersteller fehlt (rot)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 2: Service — zählfreie Sicht und Auflösung mit Existenzprüfung

**Files:**
- Modify: `packages/server/src/services/snapshot.service.ts` — Imports oben, neue Funktionen direkt **vor** `export function getSnapshot(`

- [ ] **Step 1: Imports ergänzen** (nach `import { runCypher } from '../config/neo4j';`):

```ts
import mongoose from 'mongoose';
import { Project } from '../models/Project';
import { User } from '../models/User';
```

- [ ] **Step 2: Funktionen einfügen** (vor `getSnapshot`):

```ts
// ─── THE-655: Ein geteilter Link überlebt seinen Ursprung nicht ─────
//
// Befund (Prod, 2026-08-12): Snapshot-Links lieferten nach Projekt- UND
// Kontolöschung weiter aus, bis die 72-h-TTL ablief. Der Speicher ist
// in-memory und kennt keine Kaskade — also wird beim LESEN geprüft, ob
// Projekt und Ersteller noch existieren. Fehlt eines, ist der Link "gone"
// und wird entfernt. Die Prüfer sind injizierbar (Tests ohne MongoDB).

export type SnapshotResolution =
  | { kind: 'not_found' }
  | { kind: 'gone'; reason: 'project' | 'owner' }
  | { kind: 'ok'; snapshot: Snapshot };

export interface OriginChecks {
  projectExists: (projectId: string) => Promise<boolean>;
  ownerExists: (userId: string) => Promise<boolean>;
}

/**
 * Standard-Prüfer gegen MongoDB. Ein Wert, der keine ObjectId ist (z. B. ein
 * leeres createdBy), gilt als nicht existent — fail closed: lieber ein
 * Link zu viel gesperrt als ein Link ohne Eigentümer öffentlich.
 */
export const DEFAULT_ORIGIN_CHECKS: OriginChecks = {
  projectExists: async (id) => mongoose.isValidObjectId(id) && !!(await Project.exists({ _id: id })),
  ownerExists: async (id) => mongoose.isValidObjectId(id) && !!(await User.exists({ _id: id })),
};

/** Liest ohne zu zählen: null bei unbekannt, abgelaufen oder Zugriffs-Limit erreicht. */
export function peekSnapshot(token: string): Snapshot | null {
  const snapshot = snapshotStore.get(token);
  if (!snapshot) return null;
  if (new Date() > snapshot.expiresAt) {
    snapshotStore.delete(token);
    return null;
  }
  if (snapshot.maxAccesses > 0 && snapshot.accessCount >= snapshot.maxAccesses) return null;
  return snapshot;
}

/**
 * Auflösung für den öffentlichen Endpunkt. Reihenfolge ist Absicht:
 * erst Ablauf/Limit (billig, keine DB), dann Ursprung (zwei Existenz-
 * abfragen), erst dann zählt der Zugriff (getSnapshot).
 */
export async function resolveSharedSnapshot(
  token: string,
  checks: OriginChecks = DEFAULT_ORIGIN_CHECKS,
): Promise<SnapshotResolution> {
  const peeked = peekSnapshot(token);
  if (!peeked) return { kind: 'not_found' };
  if (!(await checks.projectExists(peeked.projectId))) {
    snapshotStore.delete(token);
    return { kind: 'gone', reason: 'project' };
  }
  if (!(await checks.ownerExists(peeked.createdBy))) {
    snapshotStore.delete(token);
    return { kind: 'gone', reason: 'owner' };
  }
  const snapshot = getSnapshot(token);
  return snapshot ? { kind: 'ok', snapshot } : { kind: 'not_found' };
}
```

- [ ] **Step 3: Service-Tests grün, Routen-Tests noch rot**

Run: `cd /Users/mac_macee/javis-the655/packages/server && npx jest src/__tests__/snapshot.routes.gone.test.ts -t 'resolveSharedSnapshot' 2>&1 | tail -6`
Expected: 3 passed. (`-t 'GET'` zeigt weiterhin Fehlschläge: 200 statt 410.)

- [ ] **Step 4: Commit**

```bash
cd /Users/mac_macee/javis-the655 && git add packages/server/src/services/snapshot.service.ts && git commit -m "feat(snapshot): peekSnapshot + resolveSharedSnapshot — Existenz von Projekt und Ersteller vor der Auslieferung (THE-655)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Route — 404 / 410 / 200

**Files:**
- Modify: `packages/server/src/routes/snapshot.routes.ts:4` (Import) und `:9-35` (öffentlicher GET, inkl. `catch` und schließender Klammer)

- [ ] **Step 1: Import ergänzen** — `getSnapshot` aus der Import-Liste des Service durch `resolveSharedSnapshot` ersetzen:

```ts
import { createSnapshot, listSnapshots, resolveSharedSnapshot, revokeSnapshot } from '../services/snapshot.service';
```

- [ ] **Step 2: Handler ersetzen** — den gesamten `router.get('/snapshots/:token', …)`-Block durch:

```ts
// ─── Public: Access a shared snapshot (NO auth required) ───
// GET /api/snapshots/:token
// THE-655: 410 Gone, sobald Projekt oder Ersteller gelöscht sind — ein
// geteilter Link überlebt seinen Ursprung nicht (DSGVO Art. 17 Abs. 2).
// Der Klartext-410 ist ein Einmal-Signal: der Token wird dabei entfernt,
// jeder spätere Aufruf bekommt das generische 404 (keine Metadaten
// gelöschter Projekte vorhalten).
router.get('/snapshots/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token);
    const resolution = await resolveSharedSnapshot(token);
    if (resolution.kind === 'not_found') {
      return res.status(404).json({ success: false, error: 'Snapshot not found or expired' });
    }
    if (resolution.kind === 'gone') {
      return res.status(410).json({
        success: false,
        error:
          resolution.reason === 'project'
            ? 'This shared link is no longer available: the project it belonged to has been deleted.'
            : 'This shared link is no longer available: the account that created it has been deleted.',
      });
    }
    const { snapshot } = resolution;
    res.json({
      success: true,
      data: {
        title: snapshot.title,
        description: snapshot.description,
        viewType: snapshot.viewType,
        createdAt: snapshot.createdAt,
        expiresAt: snapshot.expiresAt,
        elements: snapshot.data.elements,
        connections: snapshot.data.connections,
        summary: snapshot.data.summary,
      },
    });
  } catch (err) {
    console.error('[Snapshot] Access error:', err);
    res.status(500).json({ success: false, error: 'Failed to load snapshot' });
  }
});
```

- [ ] **Step 3: Alle Tests grün**

Run: `cd /Users/mac_macee/javis-the655/packages/server && npx jest src/__tests__/snapshot.routes.gone.test.ts 2>&1 | tail -6`
Expected: `Tests: 10 passed`.

- [ ] **Step 4: Typprüfung + Build**

Run: `cd /Users/mac_macee/javis-the655/packages/server && npx tsc --noEmit -p . && npm run build -w @thearchitect/server 2>&1 | tail -3`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
cd /Users/mac_macee/javis-the655 && git add packages/server/src/routes/snapshot.routes.ts && git commit -m "fix(snapshot): GET /api/snapshots/:token liefert 410 Gone, wenn Projekt oder Ersteller gelöscht sind (THE-655)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: Seiteneffekte ausschließen

- [ ] **Step 1: Nachbar-Suiten** (Routen, die dieselben Mocks/Modelle berühren)

Run: `cd /Users/mac_macee/javis-the655/packages/server && npx jest src/__tests__/certification.routes.test.ts src/__tests__/ai.routes.limiter-scope.test.ts 2>&1 | tail -4`
Expected: PASS wie auf `origin/master`.

- [ ] **Step 2: Kein Delete-Pfad angefasst**

Run: `cd /Users/mac_macee/javis-the655 && git diff origin/master --stat -- packages/server/src/routes/project.routes.ts packages/server/src/routes/settings.routes.ts`
Expected: leere Ausgabe.

- [ ] **Step 3: Gesamtsuite side-by-side** (9–10 Integrationssuiten sind vorbestehend flaky — nur **neue** Fehlschläge zählen)

Run: `cd /Users/mac_macee/javis-the655/packages/server && npx jest 2>&1 | grep -E '^(Tests|Test Suites):'`
Expected: gleiche Zahlen wie die Basislinie aus der Vorbereitung, plus 1 Suite / 10 Tests; keine Suite rot, die auf `origin/master` grün ist (bei Abweichung: `npx jest 2>&1 | grep '^FAIL'` beider Läufe vergleichen).

### Task 5: Blinder Prüfer und RVTM

- [ ] **Step 1:** Nach `.agents/skills/subagent-driven-development/blind-verifier-prompt.md` einen frischen Subagenten mit dem versiegelten Katalog dispatchen. Findings (Eingabe, erwartet, tatsächlich) beheben; Loop-Budget 3; danach RVTM-Status je Zeile setzen.

- [ ] **Step 2: PR** `fix/the-655-snapshot-gone` → `master`, Titel `THE-655: geteilter Snapshot liefert 410 Gone, wenn Projekt oder Ersteller gelöscht sind`.

### Task 6: Prod-Gegenprobe nach dem Deploy (Session, nicht Subagent)

Deploy nach dem Runbook (Skill `deploy-to-hostinger`, immer `-f docker-compose.prod.yml`). Danach mit einem Wegwerf-Projekt:

- [ ] **Step 1:** In der App einen Snapshot teilen → Token aus der Share-URL notieren.
- [ ] **Step 2:** `curl -s -o /dev/null -w '%{http_code}\n' https://thearchitect.site/api/snapshots/<token>` → `200`.
- [ ] **Step 3:** Projekt in der App löschen.
- [ ] **Step 4:** `curl -s -w '\n%{http_code}\n' https://thearchitect.site/api/snapshots/<token>` → Body `{"success":false,"error":"This shared link is no longer available: the project it belonged to has been deleted."}`, Code `410`; zweiter Aufruf `404`.
- [ ] **Step 5:** Beide Ausgaben als Kommentar **Impact (Ist)** an THE-655 (Linear schließt das Ticket beim Merge; der Kommentar ist die Evidenz, die der Kontrakt verlangt) — samt der dokumentierten Entscheidung: Klartext-410 einmalig, danach generisches 404, Begründung „keine Metadaten gelöschter Projekte vorhalten". Die Konto-Löschungs-Variante wird nicht auf Prod nachgestellt (kostet ein Konto); sie ist durch den Test abgedeckt.

## Was dieser Plan bewusst nicht tut

- Keine aktive Invalidierung in den Delete-Pfaden (Slice 2) — die Leseprüfung macht den Link sofort tot, unabhängig davon, wann und wo gelöscht wurde.
- Kein Lösch-Dialog mit aktiven Freigaben (Slice 3, Client).
- Keine Verlagerung des Stores nach MongoDB (der Kommentar im Service ist älter als dieses Ticket; nicht sein Gegenstand).
