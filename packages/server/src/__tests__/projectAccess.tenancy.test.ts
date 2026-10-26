/**
 * Security-Audit C1: jede Selbstregistrierung wurde enterprise_architect, und
 * diese Rolle übersprang in `requireProjectAccess` jede Eigentums- und
 * Mitgliedschaftsprüfung. Damit konnte jeder aus dem Internet alle Projekte
 * aller Kunden lesen, ändern und löschen. Diese Tests nageln fest: Zugriff
 * kommt nur über Eigentum, Mitgliedschaft oder Plattform-Admin (chief).
 */
const OWNER = '507f1f77bcf86cd799439011';
const MEMBER = '507f1f77bcf86cd799439022';
const STRANGER = '507f1f77bcf86cd799439033';

const PROJECT = {
  _id: 'p1',
  ownerId: { toString: () => OWNER },
  collaborators: [{ userId: { toString: () => MEMBER }, role: 'viewer' }],
};
const findById = jest.fn();
jest.mock('../models/Project', () => ({ Project: { findById: (...a: unknown[]) => findById(...a) } }));

import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { isPlatformAdmin, PLATFORM_ADMIN_ROLES } from '@thearchitect/shared';

function run(
  userId: string,
  role: string,
  minRole?: string,
): Promise<{ status: number; passed: boolean }> {
  return new Promise((resolve) => {
    const req = { user: { _id: { toString: () => userId }, role }, params: { projectId: 'p1' } } as never;
    const res = {
      status(code: number) {
        (this as unknown as { _code: number })._code = code;
        return this;
      },
      json() {
        resolve({ status: (this as unknown as { _code: number })._code, passed: false });
        return this;
      },
    } as never;
    requireProjectAccess(minRole)(req, res, () => resolve({ status: 200, passed: true }));
  });
}

describe('requireProjectAccess — Mandantentrennung (Security-Audit C1)', () => {
  beforeEach(() => findById.mockReset().mockResolvedValue(PROJECT));

  it('DENIES an enterprise_architect who is neither owner nor member — der ganze Zweck', async () => {
    const r = await run(STRANGER, 'enterprise_architect');
    expect(r.passed).toBe(false);
    expect(r.status).toBe(403);
  });

  it('denies a stranger with any non-admin role, also for writes', async () => {
    for (const role of ['enterprise_architect', 'solution_architect', 'analyst', 'viewer']) {
      const r = await run(STRANGER, role, 'editor');
      expect(r).toEqual({ status: 403, passed: false });
    }
  });

  it('lets the owner through, whatever the system role', async () => {
    expect((await run(OWNER, 'enterprise_architect', 'owner')).passed).toBe(true);
  });

  it('lets a member through at their project role, but not above it', async () => {
    expect((await run(MEMBER, 'enterprise_architect')).passed).toBe(true);
    expect(await run(MEMBER, 'enterprise_architect', 'editor')).toEqual({ status: 403, passed: false });
  });

  it('keeps implicit access for the platform admin (chief_architect)', async () => {
    const r = await run(STRANGER, 'chief_architect', 'owner');
    expect(r.passed).toBe(true);
    expect(findById).not.toHaveBeenCalled();
  });
});

describe('PLATFORM_ADMIN_ROLES', () => {
  it('is chief_architect only — die Rolle der Selbstregistrierung gehört nie hinein', () => {
    expect([...PLATFORM_ADMIN_ROLES]).toEqual(['chief_architect']);
    expect(isPlatformAdmin('enterprise_architect')).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
    expect(isPlatformAdmin('chief_architect')).toBe(true);
  });
});
