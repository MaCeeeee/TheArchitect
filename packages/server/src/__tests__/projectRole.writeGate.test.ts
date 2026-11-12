/**
 * Security-Audit H4: die Projektrolle `viewer` hat Schreibzugriffe nicht
 * aufgehalten. `aiGenerator.routes` legte Elemente/Verbindungen an und schrieb
 * die Projekt-Vision hinter `requireProjectAccess('viewer')`;
 * `architecture.routes` gatete den ganzen CRUD-Router nur mit 'viewer' — alle
 * Schreibzugriffe hingen allein an der (orthogonalen) System-Rolle.
 *
 * Geprüft wird der Router-Stack: jede schreibende Route braucht ein
 * Projekt-Tor mit mindestens 'editor'.
 */
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: (minRole?: string) =>
    Object.assign((_req: unknown, _res: unknown, next: () => void) => next(), { minRole: minRole ?? 'viewer' }),
}));

import type { Router } from 'express';
import architectureRoutes from '../routes/architecture.routes';
import aiGeneratorRoutes from '../routes/aiGenerator.routes';

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: { minRole?: string } }> };
  handle: { minRole?: string };
};

const WRITE_ROLES = new Set(['editor', 'owner']);
// POST, aber reine Lesesuche (requirePermission ELEMENT_READ).
const READ_ONLY_POSTS = new Set(['post /:projectId/elements/similar']);

function writeRoutesWithoutEditorGate(router: Router): string[] {
  const stack = (router as unknown as { stack: Layer[] }).stack;
  const offenders: string[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      if (['get', 'head', 'options'].includes(method)) continue;
      const key = `${method} ${layer.route.path}`;
      if (READ_ONLY_POSTS.has(key)) continue;
      const gated = layer.route.stack.some((s) => WRITE_ROLES.has(s.handle.minRole ?? ''));
      if (!gated) offenders.push(key);
    }
  }
  return offenders;
}

describe('Projektrolle für Schreibzugriffe (Security-Audit H4)', () => {
  it('architecture.routes: every write requires at least project editor', () => {
    expect(writeRoutesWithoutEditorGate(architectureRoutes)).toEqual([]);
  });

  it('aiGenerator.routes: every apply-* write requires at least project editor', () => {
    const offenders = writeRoutesWithoutEditorGate(aiGeneratorRoutes).filter((r) => r.includes('/apply-'));
    expect(offenders).toEqual([]);
  });

  it('the check sees the routes at all — sonst wäre grün bedeutungslos', () => {
    const count = (r: Router) => (r as unknown as { stack: Layer[] }).stack.filter((l) => l.route).length;
    expect(count(architectureRoutes)).toBeGreaterThan(10);
    expect(count(aiGeneratorRoutes)).toBeGreaterThanOrEqual(9);
  });
});
