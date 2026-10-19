/**
 * TOR: DIE ARCHITEKTUR-REGELN AUS CLAUDE.md HALTEN (Architektur-Fitness).
 *
 * ── WARUM ──
 *
 * Tests prüfen nur, was sie prüfen. Ein Agent (oder Mensch) kann jede
 * Funktions-Suite grün machen und dabei eine Konvention brechen, die nirgends
 * als Test steht — eine öffentliche Route ohne `authenticate`, eine
 * Sicherheitsaktion ohne Audit-Eintrag, ein Client-Import aus dem Server.
 * Terminal-RSI (arXiv 2610.22192, §3.5) zeigt genau diese Lücke: alle Gates
 * grün, die geforderte Architektur trotzdem verletzt („tests certify only
 * enforced requirements"). Dieses Tor erzwingt drei Regeln aus CLAUDE.md
 * mechanisch.
 *
 * ── DIE DREI REGELN ──
 *
 *   F1  Jeder Endpunkt ist authentifiziert — per path-losem
 *       `router.use(authenticate)` VOR der Registrierung, per pfad-verengtem
 *       `router.use('/prefix', authenticate, …)` oder per `authenticate` in
 *       der eigenen Middleware-Kette. Bewusst öffentliche Endpunkte stehen
 *       namentlich in der Baseline (`publicEndpoints`).
 *   F2  Abhängigkeitsrichtung: client und shared importieren nie aus server,
 *       shared nie aus client.
 *   F3  Schreibende Endpunkte der sicherheitsrelevanten Router (auth,
 *       settings, admin) legen einen Audit-Eintrag an (`createAuditEntry`
 *       oder `audit(...)`). Bestehende Ausnahmen stehen in der Baseline
 *       (`unauditedSensitive`).
 *
 * ── RATSCHE STATT BIG BANG ──
 *
 * Die Baseline friert den Bestand ein (wie nav:check): Neue Verstöße machen
 * das Tor rot, behobene auch — dann ist die Baseline-Zeile veraltet und wird
 * gelöscht. So bleibt die Baseline eine exakte Liste der bewusst öffentlichen
 * bzw. noch offenen Stellen, kein Friedhof. Die Baseline ist durch den
 * Schutz-Hook (.claude/hooks/protect-verifiers.sh) geschützt: sie zu erweitern
 * ist eine menschliche Entscheidung, keine Agenten-Abkürzung.
 *
 * ── GRENZEN (bewusst) ──
 *
 * Statischer Quelltext-Scan, keine Laufzeit-Analyse: Router, die anders als
 * `router` heißen, und Middleware, die über Variablen zusammengesetzt wird,
 * sieht das Tor nicht. Pfad-verengte `router.use` decken per Präfix ab.
 *
 * Rein mechanisch: liest Quelltext, keine DB, kein Netz.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const ROUTES_DIR = 'packages/server/src/routes';
const BASELINE_PATH = join(__dirname, 'architectureFitness.baseline.json');

const SENSITIVE_ROUTERS = ['auth.routes.ts', 'settings.routes.ts', 'admin.routes.ts'];

interface Baseline {
  publicEndpoints: string[];
  unauditedSensitive: string[];
}

interface SourceFile {
  path: string;
  content: string;
}

interface Endpoint {
  /** `datei.routes.ts METHOD /pfad` — stabil gegen Zeilenverschiebungen. */
  key: string;
  method: string;
  path: string;
  /** Offset der Registrierung im Quelltext. */
  index: number;
  /** Quelltext von der Registrierung bis zur nächsten. */
  block: string;
  /** Middleware-Kette: Registrierung bis zum Handler. */
  chain: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

/** Kommentare ausblenden, Offsets erhalten (Zeilenumbrüche bleiben stehen). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, pre: string) => pre + ' '.repeat(m.length - pre.length));
}

const REGISTRATION = /router\.(get|post|put|patch|delete|all)\(\s*(['"`])([^'"`]+)\2/g;

export function findEndpoints(file: SourceFile): Endpoint[] {
  const src = stripComments(file.content);
  const name = file.path.split('/').pop() as string;
  const matches = [...src.matchAll(REGISTRATION)];
  return matches.map((m, i) => {
    const index = m.index as number;
    const end = i + 1 < matches.length ? (matches[i + 1].index as number) : src.length;
    const block = src.slice(index, end);
    // Die Kette endet am Handler: am ersten Pfeil oder an der schließenden
    // Klammer einer Registrierung mit benanntem Handler.
    const arrow = block.indexOf('=>');
    const close = block.indexOf(');');
    const cut = [arrow, close].filter((n) => n >= 0);
    const chain = block.slice(0, cut.length ? Math.min(...cut) : block.length);
    const method = m[1].toUpperCase();
    return { key: `${name} ${method} ${m[3]}`, method, path: m[3], index, block, chain };
  });
}

/** F1 — Endpunkte, die keine Authentifizierung erreicht. */
export function findUnauthenticated(file: SourceFile): string[] {
  const src = stripComments(file.content);
  const globalAuth = [...src.matchAll(/router\.use\(\s*authenticate\b/g)].map((m) => m.index as number);
  const scopedAuth = [...src.matchAll(/router\.use\(\s*(['"`])([^'"`]+)\1\s*,([^;]*?)\)\s*;/g)]
    .filter((m) => /\bauthenticate\b/.test(m[3]))
    .map((m) => ({ index: m.index as number, prefix: m[2] }));

  return findEndpoints(file)
    .filter((e) => {
      if (/\bauthenticate\b/.test(e.chain)) return false;
      if (globalAuth.some((i) => i < e.index)) return false;
      if (scopedAuth.some((s) => s.index < e.index && (e.path === s.prefix || e.path.startsWith(`${s.prefix}/`)))) {
        return false;
      }
      return true;
    })
    .map((e) => e.key);
}

const IMPORT_SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm;

/** F2 — Importe gegen die Abhängigkeitsrichtung. */
export function findLayerViolations(files: SourceFile[]): string[] {
  const forbidden: Record<string, string[]> = {
    'packages/client/': ['packages/server/'],
    'packages/shared/': ['packages/server/', 'packages/client/'],
  };
  const hits: string[] = [];
  for (const f of files) {
    const owner = Object.keys(forbidden).find((p) => f.path.startsWith(p));
    if (!owner) continue;
    const src = stripComments(f.content);
    for (const m of src.matchAll(IMPORT_SPECIFIER)) {
      const spec = m[2];
      let target: string | null = null;
      if (spec.startsWith('.')) target = relative(REPO, resolve(REPO, dirname(f.path), spec)) + '/';
      else if (spec.startsWith('@thearchitect/server')) target = 'packages/server/';
      else if (spec.startsWith('@thearchitect/client')) target = 'packages/client/';
      if (target && forbidden[owner].some((bad) => target!.startsWith(bad))) {
        const line = src.slice(0, m.index).split('\n').length;
        hits.push(`${f.path}:${line}  importiert '${spec}' — ${owner} darf davon nicht abhängen`);
      }
    }
  }
  return hits;
}

/** F3 — schreibende Endpunkte sicherheitsrelevanter Router ohne Audit. */
export function findUnaudited(file: SourceFile): string[] {
  const name = file.path.split('/').pop() as string;
  if (!SENSITIVE_ROUTERS.includes(name)) return [];
  return findEndpoints(file)
    .filter((e) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(e.method))
    .filter((e) => !/\bcreateAuditEntry\s*\(|\baudit\s*\(/.test(e.block))
    .map((e) => e.key);
}

function loadBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

/** Ratsche: neu = rot (Verstoß), veraltet = rot (Baseline-Zeile löschen). */
function ratchet(found: string[], allowed: string[]): { added: string[]; stale: string[] } {
  return {
    added: found.filter((k) => !allowed.includes(k)),
    stale: allowed.filter((k) => !found.includes(k)),
  };
}

function readRoutes(): SourceFile[] {
  return walk(join(REPO, ROUTES_DIR))
    .filter((p) => !/__tests__|\.test\./.test(p))
    .map((p) => ({ path: relative(REPO, p), content: readFileSync(p, 'utf8') }));
}

describe('Tor: Architektur-Fitness (CLAUDE.md-Regeln)', () => {
  describe('Umkehrproben — das Tor kann ablehnen', () => {
    it('F1 erkennt eine Route vor router.use(authenticate) und eine ohne Auth', () => {
      const file = {
        path: 'packages/server/src/routes/synthetic.routes.ts',
        content: [
          `router.get('/public', (req, res) => res.json({}));`,
          `// router.use(authenticate);  — Kommentar zählt nicht`,
          `router.post('/explicit', authenticate, async (req, res) => {});`,
          `router.use(`,
          `  '/:projectId/scoped',`,
          `  authenticate,`,
          `);`,
          `router.get('/:projectId/scoped/x', async (req, res) => {});`,
          `router.get('/:projectId/other', async (req, res) => {});`,
          `router.use(authenticate);`,
          `router.delete('/after', async (req, res) => {});`,
        ].join('\n'),
      };
      expect(findUnauthenticated(file)).toEqual([
        'synthetic.routes.ts GET /public',
        'synthetic.routes.ts GET /:projectId/other',
      ]);
    });

    it('F2 erkennt Server-Importe im Client und in shared — Kommentare zählen nicht', () => {
      const hits = findLayerViolations([
        {
          path: 'packages/client/src/stores/x.ts',
          content: `import { User } from '../../../server/src/models/User';\n// from '../../../server/x'`,
        },
        { path: 'packages/shared/src/y.ts', content: `const c = require('@thearchitect/client/z');` },
        { path: 'packages/client/src/ok.ts', content: `import { T } from '@thearchitect/shared';` },
      ]);
      expect(hits).toHaveLength(2);
      expect(hits[0]).toContain('packages/client/src/stores/x.ts:1');
      expect(hits[1]).toContain('packages/shared/src/y.ts:1');
    });

    it('F3 erkennt einen schreibenden Settings-Endpunkt ohne Audit', () => {
      const file = {
        path: 'packages/server/src/routes/settings.routes.ts',
        content: [
          `router.put('/profile', async (req, res) => {`,
          `  await createAuditEntry({ action: 'x' });`,
          `});`,
          `router.delete('/sessions/:id', async (req, res) => {`,
          `  res.json({});`,
          `});`,
          `router.get('/profile', async (req, res) => res.json({}));`,
        ].join('\n'),
      };
      expect(findUnaudited(file)).toEqual(['settings.routes.ts DELETE /sessions/:id']);
      expect(findUnaudited({ ...file, path: 'packages/server/src/routes/xray.routes.ts' })).toEqual([]);
    });
  });

  describe('Bestand gegen die Baseline', () => {
    const routes = readRoutes();
    const baseline = loadBaseline();

    it('F1: kein Endpunkt ohne Authentifizierung außer den bewusst öffentlichen', () => {
      // Eine leere Messung ist kein Bestehen (THE-653).
      const endpoints = routes.flatMap(findEndpoints);
      expect(routes.length).toBeGreaterThan(30);
      expect(endpoints.length).toBeGreaterThan(200);

      const { added, stale } = ratchet(routes.flatMap(findUnauthenticated), baseline.publicEndpoints);
      if (added.length || stale.length) {
        throw new Error(
          (added.length
            ? `Endpunkte ohne authenticate:\n  ${added.join('\n  ')}\n` +
              'Entweder authenticate in die Kette / vor die Registrierung setzen, oder — wenn der\n' +
              'Endpunkt bewusst öffentlich ist — ihn nach menschlicher Entscheidung in\n' +
              'architectureFitness.baseline.json → publicEndpoints eintragen.\n'
            : '') +
            (stale.length
              ? `Veraltete publicEndpoints-Einträge (Endpunkt jetzt geschützt oder entfernt):\n  ${stale.join('\n  ')}\n` +
                'Diese Zeilen aus der Baseline löschen.'
              : ''),
        );
      }
    });

    it('F2: client und shared importieren nicht gegen die Abhängigkeitsrichtung', () => {
      const files = ['packages/client/src', 'packages/shared/src']
        .flatMap((root) => walk(join(REPO, root)))
        .filter((p) => !/__tests__|\.test\./.test(p))
        .map((p) => ({ path: relative(REPO, p), content: readFileSync(p, 'utf8') }));
      expect(files.length).toBeGreaterThan(100);

      const hits = findLayerViolations(files);
      if (hits.length) {
        throw new Error(
          `Importe gegen die Abhängigkeitsrichtung (shared → server/client):\n  ${hits.join('\n  ')}\n` +
            'Gemeinsame Typen und Logik gehören nach packages/shared.',
        );
      }
    });

    it('F3: schreibende Endpunkte von auth/settings/admin legen einen Audit-Eintrag an', () => {
      const sensitive = routes.filter((f) => SENSITIVE_ROUTERS.some((n) => f.path.endsWith(`/${n}`)));
      expect(sensitive).toHaveLength(SENSITIVE_ROUTERS.length);

      const { added, stale } = ratchet(sensitive.flatMap(findUnaudited), baseline.unauditedSensitive);
      if (added.length || stale.length) {
        throw new Error(
          (added.length
            ? `Sicherheitsrelevante Endpunkte ohne Audit-Eintrag:\n  ${added.join('\n  ')}\n` +
              'createAuditEntry({ …, ip, userAgent }) aufrufen oder audit({...}) in die Kette setzen\n' +
              '(CLAUDE.md: „All security-sensitive actions create audit entries").\n'
            : '') +
            (stale.length
              ? `Veraltete unauditedSensitive-Einträge (jetzt auditiert oder entfernt):\n  ${stale.join('\n  ')}\n` +
                'Diese Zeilen aus der Baseline löschen.'
              : ''),
        );
      }
    });
  });
});
