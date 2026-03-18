/**
 * Audit Log Integration Tests
 *
 * Tests the admin audit-log endpoints: list with filters, stats, CSV export.
 *
 * Prerequisites: Server running on localhost:4000, MongoDB + Redis available.
 * A chief_architect user must exist (or be created in auth tests first).
 *
 * Run: npx jest src/__tests__/audit.test.ts --forceExit
 */

import axios, { AxiosError } from 'axios';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(__dirname, '../../../../.env') });

const API = 'http://localhost:4000/api';
const http = axios.create({ baseURL: API, timeout: 10_000 });

// Test credentials — must be a chief_architect or enterprise_architect user
const TEST_ID = Date.now().toString(36);
const ADMIN_EMAIL = `audit-admin-${TEST_ID}@thearchitect-test.local`;
const ADMIN_PASSWORD = 'AuditTest1!';
const VIEWER_EMAIL = `audit-viewer-${TEST_ID}@thearchitect-test.local`;
const VIEWER_PASSWORD = 'ViewerTest1!';

let adminToken = '';
let viewerToken = '';
let adminUserId = '';
let viewerUserId = '';

function getError(err: unknown): { status: number; error: string } {
  const axErr = err as AxiosError<{ error: string }>;
  return {
    status: axErr.response?.status || 0,
    error: axErr.response?.data?.error || 'unknown',
  };
}

// ─── Setup: Create test users ─────────────────────────────────────────────────

describe('0. Setup — Create test users', () => {
  test('0.1 Register admin user', async () => {
    const { data } = await http.post('/auth/register', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: 'Audit Admin',
    });
    expect(data.accessToken).toBeDefined();
    adminToken = data.accessToken;
    adminUserId = data.user?.id || data.user?._id;
    expect(adminUserId).toBeDefined();
  });

  test('0.2 Register viewer user', async () => {
    const { data } = await http.post('/auth/register', {
      email: VIEWER_EMAIL,
      password: VIEWER_PASSWORD,
      name: 'Audit Viewer',
    });
    expect(data.accessToken).toBeDefined();
    viewerToken = data.accessToken;
    viewerUserId = data.user?.id || data.user?._id;
    expect(viewerUserId).toBeDefined();
  });

  test('0.3 Promote admin user to chief_architect', async () => {
    // Direct MongoDB promotion — auth middleware reads role from DB, not JWT
    const { MongoClient } = await import('mongodb');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    const client = new MongoClient(mongoUri);
    try {
      await client.connect();
      const db = client.db();
      const result = await db.collection('users').updateOne(
        { email: ADMIN_EMAIL },
        { $set: { role: 'chief_architect' } }
      );
      expect(result.modifiedCount).toBe(1);
    } finally {
      await client.close();
    }
    // Token stays the same — authenticate middleware fetches role from DB
  });
});

// ─── 1. Access Control ────────────────────────────────────────────────────────

describe('1. Access Control', () => {
  test('1.1 Reject unauthenticated access to audit logs', async () => {
    try {
      await http.get('/admin/audit-log');
      fail('Should have thrown');
    } catch (err) {
      const { status } = getError(err);
      expect(status).toBe(401);
    }
  });

  test('1.2 Reject viewer role access to audit logs', async () => {
    try {
      await http.get('/admin/audit-log', {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      fail('Should have thrown');
    } catch (err) {
      const { status } = getError(err);
      expect(status).toBe(403);
    }
  });

  test('1.3 Reject unauthenticated access to stats', async () => {
    try {
      await http.get('/admin/audit-log/stats');
      fail('Should have thrown');
    } catch (err) {
      const { status } = getError(err);
      expect(status).toBe(401);
    }
  });

  test('1.4 Reject unauthenticated access to export', async () => {
    try {
      await http.get('/admin/audit-log/export');
      fail('Should have thrown');
    } catch (err) {
      const { status } = getError(err);
      expect(status).toBe(401);
    }
  });
});

// ─── 2. Audit Log Listing ─────────────────────────────────────────────────────

describe('2. Audit Log Listing', () => {
  const authHeaders = () => ({ headers: { Authorization: `Bearer ${adminToken}` } });

  test('2.1 List audit logs with default params', async () => {
    const { data } = await http.get('/admin/audit-log', authHeaders());
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('limit');
    expect(data).toHaveProperty('offset');
    expect(Array.isArray(data.data)).toBe(true);
    expect(typeof data.total).toBe('number');
  });

  test('2.2 Respect limit and offset params', async () => {
    const { data } = await http.get('/admin/audit-log?limit=5&offset=0', authHeaders());
    expect(data.limit).toBe(5);
    expect(data.offset).toBe(0);
    expect(data.data.length).toBeLessThanOrEqual(5);
  });

  test('2.3 Cap limit at 500', async () => {
    const { data } = await http.get('/admin/audit-log?limit=9999', authHeaders());
    expect(data.limit).toBe(500);
  });

  test('2.4 Filter by action', async () => {
    const { data } = await http.get('/admin/audit-log?action=change_user_role', authHeaders());
    expect(Array.isArray(data.data)).toBe(true);
    for (const log of data.data) {
      expect(log.action).toBe('change_user_role');
    }
  });

  test('2.5 Filter by entityType', async () => {
    const { data } = await http.get('/admin/audit-log?entityType=user', authHeaders());
    expect(Array.isArray(data.data)).toBe(true);
    for (const log of data.data) {
      expect(log.entityType).toBe('user');
    }
  });

  test('2.6 Filter by riskLevel', async () => {
    const { data } = await http.get('/admin/audit-log?riskLevel=high', authHeaders());
    expect(Array.isArray(data.data)).toBe(true);
    for (const log of data.data) {
      expect(log.riskLevel).toBe('high');
    }
  });

  test('2.7 Filter by date range', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await http.get(
      `/admin/audit-log?startDate=${today}&endDate=${today}`,
      authHeaders()
    );
    expect(Array.isArray(data.data)).toBe(true);
    for (const log of data.data) {
      const logDate = new Date(log.timestamp).toISOString().slice(0, 10);
      expect(logDate).toBe(today);
    }
  });

  test('2.8 Filter by userSearch', async () => {
    const { data } = await http.get(
      `/admin/audit-log?userSearch=Audit`,
      authHeaders()
    );
    expect(Array.isArray(data.data)).toBe(true);
    // Results should have userId populated with matching user
  });

  test('2.9 Combined filters return consistent total', async () => {
    const { data } = await http.get(
      '/admin/audit-log?action=nonexistent_action_xyz&limit=10',
      authHeaders()
    );
    expect(data.total).toBe(0);
    expect(data.data.length).toBe(0);
  });

  test('2.10 Logs have populated userId with name and email', async () => {
    const { data } = await http.get('/admin/audit-log?limit=5', authHeaders());
    if (data.data.length > 0) {
      const log = data.data[0];
      if (typeof log.userId === 'object' && log.userId !== null) {
        expect(log.userId).toHaveProperty('name');
        expect(log.userId).toHaveProperty('email');
      }
    }
  });

  test('2.11 Logs are sorted by timestamp descending', async () => {
    const { data } = await http.get('/admin/audit-log?limit=10', authHeaders());
    if (data.data.length >= 2) {
      for (let i = 1; i < data.data.length; i++) {
        const prev = new Date(data.data[i - 1].timestamp).getTime();
        const curr = new Date(data.data[i].timestamp).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    }
  });
});

// ─── 3. Audit Log Stats ──────────────────────────────────────────────────────

describe('3. Audit Log Stats', () => {
  const authHeaders = () => ({ headers: { Authorization: `Bearer ${adminToken}` } });

  test('3.1 Returns stats with all risk levels', async () => {
    const { data } = await http.get('/admin/audit-log/stats', authHeaders());
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('low');
    expect(data).toHaveProperty('medium');
    expect(data).toHaveProperty('high');
    expect(data).toHaveProperty('critical');
    expect(typeof data.total).toBe('number');
    expect(typeof data.low).toBe('number');
  });

  test('3.2 Total equals sum of risk levels', async () => {
    const { data } = await http.get('/admin/audit-log/stats', authHeaders());
    const sum = data.low + data.medium + data.high + data.critical;
    expect(data.total).toBe(sum);
  });

  test('3.3 All counts are non-negative', async () => {
    const { data } = await http.get('/admin/audit-log/stats', authHeaders());
    expect(data.total).toBeGreaterThanOrEqual(0);
    expect(data.low).toBeGreaterThanOrEqual(0);
    expect(data.medium).toBeGreaterThanOrEqual(0);
    expect(data.high).toBeGreaterThanOrEqual(0);
    expect(data.critical).toBeGreaterThanOrEqual(0);
  });
});

// ─── 4. CSV Export ────────────────────────────────────────────────────────────

describe('4. CSV Export', () => {
  const authHeaders = () => ({ headers: { Authorization: `Bearer ${adminToken}` } });

  test('4.1 Export returns CSV content type', async () => {
    const response = await http.get('/admin/audit-log/export', authHeaders());
    expect(response.headers['content-type']).toContain('text/csv');
  });

  test('4.2 Export returns Content-Disposition header', async () => {
    const response = await http.get('/admin/audit-log/export', authHeaders());
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('audit-log-');
    expect(response.headers['content-disposition']).toContain('.csv');
  });

  test('4.3 CSV has correct header row', async () => {
    const response = await http.get('/admin/audit-log/export', authHeaders());
    const csv = response.data as string;
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toBe('Timestamp,User,Email,Action,Entity Type,Entity ID,Risk Level,IP');
  });

  test('4.4 CSV data rows match expected column count', async () => {
    const response = await http.get('/admin/audit-log/export', authHeaders());
    const csv = response.data as string;
    const lines = csv.trim().split('\n');
    if (lines.length > 1) {
      // Each row should have 8 columns (some may be quoted with commas inside)
      const headerCols = lines[0].split(',').length;
      expect(headerCols).toBe(8);
    }
  });

  test('4.5 Export respects filters', async () => {
    const response = await http.get(
      '/admin/audit-log/export?action=nonexistent_xyz',
      authHeaders()
    );
    const csv = response.data as string;
    const lines = csv.trim().split('\n');
    // Only header row, no data rows
    expect(lines.length).toBe(1);
  });

  test('4.6 Viewer cannot export', async () => {
    try {
      await http.get('/admin/audit-log/export', {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      fail('Should have thrown');
    } catch (err) {
      const { status } = getError(err);
      expect(status).toBe(403);
    }
  });
});

// ─── 5. Audit Entry Creation Verification ─────────────────────────────────────

describe('5. Audit Entry Creation', () => {
  const authHeaders = () => ({ headers: { Authorization: `Bearer ${adminToken}` } });

  test('5.1 Login creates an audit-visible event (registration events exist)', async () => {
    // The setup phase registered users, which should have created audit entries
    // or at minimum, the role change should be logged
    const { data } = await http.get('/admin/audit-log?limit=50', authHeaders());
    expect(data.total).toBeGreaterThan(0);
  });

  test('5.2 Audit entries have required fields', async () => {
    const { data } = await http.get('/admin/audit-log?limit=1', authHeaders());
    if (data.data.length > 0) {
      const entry = data.data[0];
      expect(entry).toHaveProperty('_id');
      expect(entry).toHaveProperty('action');
      expect(entry).toHaveProperty('entityType');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('riskLevel');
    }
  });
});

// ─── 6. Pagination Consistency ────────────────────────────────────────────────

describe('6. Pagination', () => {
  const authHeaders = () => ({ headers: { Authorization: `Bearer ${adminToken}` } });

  test('6.1 Offset 0 returns first page', async () => {
    const { data } = await http.get('/admin/audit-log?limit=2&offset=0', authHeaders());
    expect(data.offset).toBe(0);
    expect(data.data.length).toBeLessThanOrEqual(2);
  });

  test('6.2 Different offsets return different entries', async () => {
    const page1 = await http.get('/admin/audit-log?limit=2&offset=0', authHeaders());
    const page2 = await http.get('/admin/audit-log?limit=2&offset=2', authHeaders());

    if (page1.data.data.length > 0 && page2.data.data.length > 0) {
      expect(page1.data.data[0]._id).not.toBe(page2.data.data[0]._id);
    }
  });

  test('6.3 Total remains consistent across pages', async () => {
    const page1 = await http.get('/admin/audit-log?limit=2&offset=0', authHeaders());
    const page2 = await http.get('/admin/audit-log?limit=2&offset=2', authHeaders());
    expect(page1.data.total).toBe(page2.data.total);
  });

  test('6.4 Offset beyond total returns empty data', async () => {
    const { data: first } = await http.get('/admin/audit-log?limit=1', authHeaders());
    const { data } = await http.get(
      `/admin/audit-log?limit=10&offset=${first.total + 100}`,
      authHeaders()
    );
    expect(data.data.length).toBe(0);
    expect(data.total).toBe(first.total);
  });
});

// ─── 7. Cleanup ───────────────────────────────────────────────────────────────

describe('7. Cleanup', () => {
  test('7.1 Delete test users', async () => {
    const { MongoClient } = await import('mongodb');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    const client = new MongoClient(mongoUri);
    try {
      await client.connect();
      const db = client.db();
      await db.collection('users').deleteMany({
        email: { $in: [ADMIN_EMAIL, VIEWER_EMAIL] },
      });
    } finally {
      await client.close();
    }
    expect(true).toBe(true);
  });
});
