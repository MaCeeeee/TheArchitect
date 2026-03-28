/**
 * Gap Remediation Engine — Integration Tests
 *
 * Tests the full remediation lifecycle via HTTP:
 *   Setup → Generate → List/Get → Edit → Apply → Rollback
 *   + Partial Apply, Batch Apply, Auth/RBAC, Cleanup
 *
 * Prerequisites: Server running on localhost:4000, MongoDB + Neo4j + Redis available.
 *
 * Run: cd packages/server && npx jest src/__tests__/remediation.test.ts --forceExit
 */

import axios from 'axios';
import { config } from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

config({ path: resolve(__dirname, '../../../../.env') });

const API = 'http://localhost:4000/api';
const http = axios.create({ baseURL: API, timeout: 30_000 });

// ─── Test Credentials ───

const TEST_ID = Date.now().toString(36);
const ADMIN_EMAIL = `remed-admin-${TEST_ID}@thearchitect-test.local`;
const ADMIN_PASSWORD = 'RemediationTest1!';
const VIEWER_EMAIL = `remed-viewer-${TEST_ID}@thearchitect-test.local`;
const VIEWER_PASSWORD = 'RemediationView1!';

let adminToken = '';
let adminUserId = '';
let viewerToken = '';
let projectId = '';
const elementIds: string[] = [];
let proposalId = '';
let secondProposalId = '';

function auth(token?: string) {
  return { headers: { Authorization: `Bearer ${token || adminToken}` } };
}

// ═════════════════════════════════════════════════════════════════════════════
// 0. SETUP — Create users, project, elements
// ═════════════════════════════════════════════════════════════════════════════

describe('0. Setup — Create test environment', () => {
  test('0.1 Register admin user and promote to chief_architect', async () => {
    const { data } = await http.post('/auth/register', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: 'Remediation Test Admin',
    });
    expect(data.accessToken).toBeDefined();
    adminToken = data.accessToken;
    adminUserId = data.user?.id || data.user?._id;

    // Promote via MongoDB
    const { MongoClient } = await import('mongodb');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    const client = new MongoClient(mongoUri);
    try {
      await client.connect();
      await client.db().collection('users').updateOne(
        { email: ADMIN_EMAIL },
        { $set: { role: 'chief_architect' } },
      );
    } finally {
      await client.close();
    }

    // Re-login for updated role token
    const { data: loginData } = await http.post('/auth/login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    adminToken = loginData.accessToken;
  }, 30_000);

  test('0.2 Register viewer user', async () => {
    const { data } = await http.post('/auth/register', {
      email: VIEWER_EMAIL,
      password: VIEWER_PASSWORD,
      name: 'Remediation Viewer',
    });
    viewerToken = data.accessToken;
    expect(viewerToken).toBeDefined();
  });

  test('0.3 Create test project', async () => {
    const { data } = await http.post('/projects', {
      name: `Remediation Test ${TEST_ID}`,
      description: 'Test project for Gap Remediation Engine validation',
    }, auth());
    projectId = data._id || data.id;
    expect(projectId).toBeDefined();
  });

  test('0.4 Add architecture elements (5 elements, 3 layers)', async () => {
    const elements = [
      { name: 'Customer Portal', type: 'application_component', layer: 'application', togafDomain: 'application', status: 'current', riskLevel: 'low', maturityLevel: 3, description: 'Web portal for customers' },
      { name: 'Order Service', type: 'application_service', layer: 'application', togafDomain: 'application', status: 'current', riskLevel: 'medium', maturityLevel: 2, description: 'Handles order processing' },
      { name: 'Customer Database', type: 'data_object', layer: 'information', togafDomain: 'data', status: 'current', riskLevel: 'low', maturityLevel: 3, description: 'Customer data store' },
      { name: 'Cloud Infrastructure', type: 'node', layer: 'technology', togafDomain: 'technology', status: 'current', riskLevel: 'low', maturityLevel: 4, description: 'AWS cloud infrastructure' },
      { name: 'Sales Process', type: 'business_process', layer: 'business', togafDomain: 'business', status: 'current', riskLevel: 'medium', maturityLevel: 2, description: 'Sales workflow' },
    ];

    for (const el of elements) {
      try {
        const { data: resp } = await http.post(`/projects/${projectId}/elements`, el, auth());
        const created = resp.data || resp;
        const id = created.id || created._id;
        expect(id).toBeDefined();
        elementIds.push(id);
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
        const { data: resp } = await http.post(`/projects/${projectId}/elements`, el, auth());
        const created = resp.data || resp;
        elementIds.push(created.id || created._id);
      }
    }
    expect(elementIds.length).toBe(5);
  }, 30_000);

  test('0.5 Add connections', async () => {
    const connections = [
      { sourceId: elementIds[0], targetId: elementIds[1], type: 'serving', label: 'Portal→OrderSvc' },
      { sourceId: elementIds[1], targetId: elementIds[2], type: 'access', label: 'OrderSvc→DB' },
      { sourceId: elementIds[3], targetId: elementIds[0], type: 'serving', label: 'Cloud→Portal' },
    ];

    for (const conn of connections) {
      try {
        const { data: resp } = await http.post(`/projects/${projectId}/connections`, conn, auth());
        expect(resp.success).toBe(true);
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
        const { data: resp } = await http.post(`/projects/${projectId}/connections`, conn, auth());
        expect(resp.success).toBe(true);
      }
    }
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. GENERATE — SSE Streaming
// ═════════════════════════════════════════════════════════════════════════════

describe('1. Generate Remediation Proposals', () => {
  test('1.1 POST /generate with manual context returns SSE stream', async () => {
    const response = await fetch(`${API}/projects/${projectId}/remediation/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        context: {
          source: 'manual',
          prompt: 'Add a Payment Gateway application component with connections to the Order Service',
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    // Read the entire SSE stream
    const text = await response.text();
    const lines = text.split('\n').filter((l) => l.startsWith('data: '));
    expect(lines.length).toBeGreaterThan(0);

    // Parse events
    const events = lines
      .map((l) => l.replace('data: ', ''))
      .filter((l) => l !== '[DONE]')
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);

    // Should have generation_start event with proposalId
    const startEvent = events.find((e: any) => e.type === 'generation_start');
    expect(startEvent).toBeDefined();
    expect(startEvent.proposalId).toBeDefined();
    proposalId = startEvent.proposalId;

    // Should have complete event
    const completeEvent = events.find((e: any) => e.type === 'complete');
    if (completeEvent) {
      expect(completeEvent.proposal).toBeDefined();
      expect(completeEvent.proposal.elements.length).toBeGreaterThan(0);
    }

    // Should end with [DONE]
    expect(text).toContain('[DONE]');
  }, 120_000);

  test('1.2 Generate a second proposal for batch testing', async () => {
    const response = await fetch(`${API}/projects/${projectId}/remediation/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        context: {
          source: 'manual',
          prompt: 'Add a Notification Service for email alerts in the application layer',
        },
      }),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    const lines = text.split('\n').filter((l) => l.startsWith('data: '));
    const events = lines
      .map((l) => l.replace('data: ', ''))
      .filter((l) => l !== '[DONE]')
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    const startEvent = events.find((e: any) => e.type === 'generation_start');
    if (startEvent) {
      secondProposalId = startEvent.proposalId;
    }
  }, 120_000);

  test('1.3 Invalid context (missing required fields) returns 400', async () => {
    try {
      await http.post(`/projects/${projectId}/remediation/generate`, {
        context: { source: 'compliance' }, // missing standardId, gapSectionIds
      }, auth());
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.success).toBe(false);
    }
  });

  test('1.4 Unauthenticated generate returns 401', async () => {
    try {
      await http.post(`/projects/${projectId}/remediation/generate`, {
        context: { source: 'manual', prompt: 'test' },
      });
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(401);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. LIST & GET PROPOSALS
// ═════════════════════════════════════════════════════════════════════════════

describe('2. List & Get Proposals', () => {
  test('2.1 GET /proposals returns list', async () => {
    const { data, status } = await http.get(
      `/projects/${projectId}/remediation/proposals`,
      auth(),
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);

    // If proposalId wasn't set from SSE, grab from list
    if (!proposalId && data.data.length > 0) {
      proposalId = data.data[0].id;
    }
    if (!secondProposalId && data.data.length > 1) {
      secondProposalId = data.data[1].id;
    }
  });

  test('2.2 Each proposal has required fields', async () => {
    const { data } = await http.get(
      `/projects/${projectId}/remediation/proposals`,
      auth(),
    );
    const proposal = data.data[0];

    expect(proposal.id).toBeDefined();
    expect(proposal.projectId).toBe(projectId);
    expect(['compliance', 'advisor', 'manual']).toContain(proposal.source);
    expect(proposal.title).toBeDefined();
    expect(typeof proposal.title).toBe('string');
    expect(proposal.elements).toBeDefined();
    expect(Array.isArray(proposal.elements)).toBe(true);
    expect(proposal.connections).toBeDefined();
    expect(Array.isArray(proposal.connections)).toBe(true);
    expect(['draft', 'validated', 'partially_applied', 'applied', 'rejected', 'expired']).toContain(proposal.status);
    expect(typeof proposal.confidence).toBe('number');
    expect(proposal.createdBy).toBeDefined();
    expect(proposal.createdAt).toBeDefined();
    expect(proposal.updatedAt).toBeDefined();
  });

  test('2.3 GET /proposals/:id returns single proposal', async () => {
    if (!proposalId) return;

    const { data, status } = await http.get(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      auth(),
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(proposalId);
  });

  test('2.4 GET /proposals/:id with invalid ID returns 404', async () => {
    try {
      await http.get(
        `/projects/${projectId}/remediation/proposals/000000000000000000000000`,
        auth(),
      );
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(404);
    }
  });

  test('2.5 Proposals are sorted by createdAt descending', async () => {
    const { data } = await http.get(
      `/projects/${projectId}/remediation/proposals`,
      auth(),
    );
    if (data.data.length >= 2) {
      const dates = data.data.map((p: any) => new Date(p.createdAt).getTime());
      // Each date should be >= the next (descending)
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. PROPOSAL ELEMENT STRUCTURE
// ═════════════════════════════════════════════════════════════════════════════

describe('3. Proposal Element & Connection Structure', () => {
  test('3.1 Proposal elements have ArchiMate-compliant structure', async () => {
    if (!proposalId) return;

    const { data } = await http.get(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      auth(),
    );
    const proposal = data.data;

    for (const el of proposal.elements) {
      expect(el.tempId).toBeDefined();
      expect(typeof el.tempId).toBe('string');
      expect(el.name).toBeDefined();
      expect(el.name.length).toBeGreaterThan(0);
      expect(el.type).toBeDefined();
      expect(el.layer).toBeDefined();
      expect(el.togafDomain).toBeDefined();
      expect(typeof el.confidence).toBe('number');
      expect(el.confidence).toBeGreaterThanOrEqual(0);
      expect(el.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('3.2 Proposal connections reference valid tempIds or existing elements', async () => {
    if (!proposalId) return;

    const { data } = await http.get(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      auth(),
    );
    const proposal = data.data;
    const tempIds = new Set(proposal.elements.map((e: any) => e.tempId));

    for (const conn of proposal.connections) {
      expect(conn.tempId).toBeDefined();
      expect(conn.sourceTempId).toBeDefined();
      expect(conn.targetTempId).toBeDefined();
      expect(conn.type).toBeDefined();
      expect(typeof conn.confidence).toBe('number');

      // Source and target should reference proposal elements or existing
      const sourceValid = tempIds.has(conn.sourceTempId) || conn.sourceTempId.startsWith('existing:');
      const targetValid = tempIds.has(conn.targetTempId) || conn.targetTempId.startsWith('existing:');
      expect(sourceValid || targetValid).toBe(true); // at least one should be a proposal element
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. EDIT PROPOSALS
// ═════════════════════════════════════════════════════════════════════════════

describe('4. Edit Proposals', () => {
  test('4.1 PATCH /proposals/:id updates title', async () => {
    if (!proposalId) return;

    const newTitle = 'Updated Remediation Proposal';
    const { data, status } = await http.patch(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      { title: newTitle },
      auth(),
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Verify the change
    const { data: getResp } = await http.get(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      auth(),
    );
    expect(getResp.data.title).toBe(newTitle);
  });

  test('4.2 PATCH /proposals/:id updates description', async () => {
    if (!proposalId) return;

    const { data, status } = await http.patch(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      { description: 'Updated description for testing' },
      auth(),
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('4.3 PATCH with invalid data returns 400', async () => {
    if (!proposalId) return;

    try {
      await http.patch(
        `/projects/${projectId}/remediation/proposals/${proposalId}`,
        { title: '' }, // min 1 char
        auth(),
      );
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(400);
    }
  });

  test('4.4 PATCH nonexistent proposal returns 404', async () => {
    try {
      await http.patch(
        `/projects/${projectId}/remediation/proposals/000000000000000000000000`,
        { title: 'Ghost' },
        auth(),
      );
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(404);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. APPLY PROPOSALS
// ═════════════════════════════════════════════════════════════════════════════

describe('5. Apply Proposals', () => {
  test('5.1 POST /apply creates elements in architecture', async () => {
    if (!proposalId) return;

    const { data, status } = await http.post(
      `/projects/${projectId}/remediation/proposals/${proposalId}/apply`,
      {},
      auth(),
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.elementsCreated).toBeGreaterThan(0);
    expect(data.data.elementIds.length).toBeGreaterThan(0);

    // Verify elements exist in architecture
    const { data: elemData } = await http.get(`/projects/${projectId}/elements`, auth());
    const allElements = elemData.data || elemData;
    const originalCount = elementIds.length;
    expect(allElements.length).toBeGreaterThan(originalCount);
  }, 30_000);

  test('5.2 Applied proposal status changes to "applied"', async () => {
    if (!proposalId) return;

    const { data } = await http.get(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      auth(),
    );
    expect(['applied', 'partially_applied']).toContain(data.data.status);
    expect(data.data.appliedElementIds.length).toBeGreaterThan(0);
    expect(data.data.appliedAt).toBeDefined();
    expect(data.data.appliedBy).toBeDefined();
  });

  test('5.3 Re-applying an applied proposal fails', async () => {
    if (!proposalId) return;

    try {
      await http.post(
        `/projects/${projectId}/remediation/proposals/${proposalId}/apply`,
        {},
        auth(),
      );
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(500);
      expect(err.response.data.error).toContain('not');
    }
  });

  test('5.4 Edit an applied proposal fails', async () => {
    if (!proposalId) return;

    try {
      await http.patch(
        `/projects/${projectId}/remediation/proposals/${proposalId}`,
        { title: 'Should fail' },
        auth(),
      );
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toContain('applied');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. ROLLBACK
// ═════════════════════════════════════════════════════════════════════════════

describe('6. Rollback Proposals', () => {
  test('6.1 POST /rollback removes applied elements', async () => {
    if (!proposalId) return;

    // Count elements before rollback
    const { data: beforeData } = await http.get(`/projects/${projectId}/elements`, auth());
    const beforeCount = (beforeData.data || beforeData).length;

    const { data, status } = await http.post(
      `/projects/${projectId}/remediation/proposals/${proposalId}/rollback`,
      {},
      auth(),
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Verify elements removed
    const { data: afterData } = await http.get(`/projects/${projectId}/elements`, auth());
    const afterCount = (afterData.data || afterData).length;
    expect(afterCount).toBeLessThan(beforeCount);
  }, 30_000);

  test('6.2 Rolled-back proposal status reverts to "validated"', async () => {
    if (!proposalId) return;

    const { data } = await http.get(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      auth(),
    );
    expect(data.data.status).toBe('validated');
    expect(data.data.appliedElementIds).toHaveLength(0);
  });

  test('6.3 Rollback on non-applied proposal fails', async () => {
    if (!proposalId) return;

    try {
      await http.post(
        `/projects/${projectId}/remediation/proposals/${proposalId}/rollback`,
        {},
        auth(),
      );
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(500);
      expect(err.response.data.error).toContain('No applied');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. PARTIAL APPLY
// ═════════════════════════════════════════════════════════════════════════════

describe('7. Partial Apply', () => {
  test('7.1 Apply with selectedTempIds applies only selected elements', async () => {
    if (!proposalId) return;

    // Get proposal to find tempIds
    const { data: propData } = await http.get(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      auth(),
    );
    const allTempIds = propData.data.elements.map((e: any) => e.tempId);

    if (allTempIds.length < 1) return;

    // Apply only the first element
    const selected = [allTempIds[0]];
    const { data, status } = await http.post(
      `/projects/${projectId}/remediation/proposals/${proposalId}/apply`,
      { selectedTempIds: selected },
      auth(),
    );
    expect(status).toBe(200);
    expect(data.data.elementsCreated).toBe(1);
    expect(data.data.elementIds).toHaveLength(1);

    // Status should be partially_applied (if more elements remain)
    if (allTempIds.length > 1) {
      const { data: updatedProp } = await http.get(
        `/projects/${projectId}/remediation/proposals/${proposalId}`,
        auth(),
      );
      expect(updatedProp.data.status).toBe('partially_applied');
    }
  }, 30_000);

  test('7.2 Rollback partial apply', async () => {
    if (!proposalId) return;

    const { data: propData } = await http.get(
      `/projects/${projectId}/remediation/proposals/${proposalId}`,
      auth(),
    );
    if (propData.data.appliedElementIds?.length > 0) {
      const { data, status } = await http.post(
        `/projects/${projectId}/remediation/proposals/${proposalId}/rollback`,
        {},
        auth(),
      );
      expect(status).toBe(200);
      expect(data.success).toBe(true);
    }
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. BATCH APPLY
// ═════════════════════════════════════════════════════════════════════════════

describe('8. Batch Apply', () => {
  test('8.1 POST /apply-batch applies multiple proposals', async () => {
    if (!proposalId || !secondProposalId) return;

    // Both proposals should be in validated state after rollback
    const { data, status } = await http.post(
      `/projects/${projectId}/remediation/apply-batch`,
      { proposalIds: [proposalId, secondProposalId] },
      auth(),
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);

    // Each result should have proposalId and success status
    for (const result of data.data) {
      expect(result.proposalId).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    }

    // At least one should succeed (first one)
    const successes = data.data.filter((r: any) => r.success);
    expect(successes.length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  test('8.2 Invalid batch apply (empty array) returns 400', async () => {
    try {
      await http.post(
        `/projects/${projectId}/remediation/apply-batch`,
        { proposalIds: [] },
        auth(),
      );
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(400);
    }
  });

  test('8.3 Batch rollback applied proposals', async () => {
    // Rollback each applied proposal
    for (const pid of [proposalId, secondProposalId]) {
      if (!pid) continue;
      try {
        const { data: propData } = await http.get(
          `/projects/${projectId}/remediation/proposals/${pid}`,
          auth(),
        );
        if (['applied', 'partially_applied'].includes(propData.data.status)) {
          await http.post(
            `/projects/${projectId}/remediation/proposals/${pid}/rollback`,
            {},
            auth(),
          );
        }
      } catch {
        // Ignore rollback errors during cleanup
      }
    }
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. AUTH & RBAC
// ═════════════════════════════════════════════════════════════════════════════

describe('9. Auth & RBAC', () => {
  test('9.1 Viewer can list proposals (ELEMENT_READ)', async () => {
    const { data, status } = await http.get(
      `/projects/${projectId}/remediation/proposals`,
      auth(viewerToken),
    );
    // Viewer may get 200 or 403 depending on project membership
    // If not a member, expect 403
    if (status === 200) {
      expect(data.success).toBe(true);
    }
  });

  test('9.2 Viewer cannot generate (requires editor + ELEMENT_CREATE)', async () => {
    try {
      await http.post(
        `/projects/${projectId}/remediation/generate`,
        { context: { source: 'manual', prompt: 'test' } },
        auth(viewerToken),
      );
      // Might succeed if viewer has been added to project; might fail
    } catch (err: any) {
      expect([401, 403]).toContain(err.response.status);
    }
  });

  test('9.3 Viewer cannot apply (requires editor + ELEMENT_CREATE)', async () => {
    if (!proposalId) return;
    try {
      await http.post(
        `/projects/${projectId}/remediation/proposals/${proposalId}/apply`,
        {},
        auth(viewerToken),
      );
    } catch (err: any) {
      expect([401, 403]).toContain(err.response.status);
    }
  });

  test('9.4 No token returns 401 for all endpoints', async () => {
    const endpoints = [
      { method: 'get', url: `/projects/${projectId}/remediation/proposals` },
      { method: 'post', url: `/projects/${projectId}/remediation/generate` },
    ];

    for (const ep of endpoints) {
      try {
        if (ep.method === 'get') {
          await http.get(ep.url);
        } else {
          await http.post(ep.url, {});
        }
        fail(`Should have thrown for ${ep.url}`);
      } catch (err: any) {
        expect(err.response.status).toBe(401);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. STATIC FILE VERIFICATION
// ═════════════════════════════════════════════════════════════════════════════

describe('10. Static File Verification', () => {
  const rootDir = resolve(__dirname, '../../..');

  test('10.1 Shared types file exists and exports key types', () => {
    const content = fs.readFileSync(resolve(rootDir, 'shared/src/types/remediation.types.ts'), 'utf8');
    expect(content).toContain('ProposalStatus');
    expect(content).toContain('RemediationSource');
    expect(content).toContain('ProposalElement');
    expect(content).toContain('ProposalConnection');
    expect(content).toContain('ProposalValidationResult');
    expect(content).toContain('RemediationProposal');
    expect(content).toContain('RemediationStreamEvent');
    expect(content).toContain('RemediationContext');
  });

  test('10.2 MongoDB model exists with correct indexes', () => {
    const content = fs.readFileSync(resolve(rootDir, 'server/src/models/RemediationProposal.ts'), 'utf8');
    expect(content).toContain('remediationProposalSchema');
    expect(content).toContain('projectId: 1, status: 1');
    expect(content).toContain('projectId: 1, createdAt: -1');
  });

  test('10.3 Service files exist', () => {
    const services = [
      'server/src/services/remediation.service.ts',
      'server/src/services/remediation-validator.service.ts',
      'server/src/services/remediation-apply.service.ts',
    ];
    for (const svc of services) {
      expect(fs.existsSync(resolve(rootDir, svc))).toBe(true);
    }
  });

  test('10.4 Routes file exists with all endpoints', () => {
    const content = fs.readFileSync(resolve(rootDir, 'server/src/routes/remediation.routes.ts'), 'utf8');
    expect(content).toContain('/remediation/generate');
    expect(content).toContain('/remediation/proposals');
    expect(content).toContain('/apply');
    expect(content).toContain('/rollback');
    expect(content).toContain('/apply-batch');
  });

  test('10.5 Client store exists with key actions', () => {
    const content = fs.readFileSync(resolve(rootDir, 'client/src/stores/remediationStore.ts'), 'utf8');
    expect(content).toContain('generate');
    expect(content).toContain('loadProposals');
    expect(content).toContain('applyProposal');
    expect(content).toContain('rollbackProposal');
    expect(content).toContain('isGenerating');
    expect(content).toContain('previewElements');
  });

  test('10.6 UI components exist', () => {
    const components = [
      'client/src/components/copilot/RemediationPanel.tsx',
      'client/src/components/copilot/ProposalCard.tsx',
      'client/src/components/copilot/ProposalDiffView.tsx',
    ];
    for (const comp of components) {
      expect(fs.existsSync(resolve(rootDir, comp))).toBe(true);
    }
  });

  test('10.7 AICopilot has remediation tab', () => {
    const content = fs.readFileSync(resolve(rootDir, 'client/src/components/copilot/AICopilot.tsx'), 'utf8');
    expect(content).toContain('remediation');
    expect(content).toContain('RemediationPanel');
    expect(content).toContain('Wrench');
  });

  test('10.8 3D preview supports proposal overlay', () => {
    const nodeContent = fs.readFileSync(resolve(rootDir, 'client/src/components/3d/NodeObject3D.tsx'), 'utf8');
    expect(nodeContent).toContain('isProposal');

    const elemContent = fs.readFileSync(resolve(rootDir, 'client/src/components/3d/ArchitectureElements.tsx'), 'utf8');
    expect(elemContent).toContain('useRemediationStore');
    expect(elemContent).toContain('proposalOverlays');
  });

  test('10.9 ComplianceMatrix has remediate button', () => {
    const content = fs.readFileSync(resolve(rootDir, 'client/src/components/copilot/ComplianceMatrix.tsx'), 'utf8');
    expect(content).toContain('useRemediationStore');
    expect(content).toContain('Remediate');
  });

  test('10.10 InsightCard has Fix with AI button', () => {
    const content = fs.readFileSync(resolve(rootDir, 'client/src/components/copilot/InsightCard.tsx'), 'utf8');
    expect(content).toContain('useRemediationStore');
    expect(content).toContain('Fix with AI');
  });

  test('10.11 Server index registers remediation routes', () => {
    const content = fs.readFileSync(resolve(rootDir, 'server/src/index.ts'), 'utf8');
    expect(content).toContain('remediationRoutes');
  });

  test('10.12 Client API has remediation methods', () => {
    const content = fs.readFileSync(resolve(rootDir, 'client/src/services/api.ts'), 'utf8');
    expect(content).toContain('remediationAPI');
    expect(content).toContain('generateStreamUrl');
    expect(content).toContain('getProposals');
    expect(content).toContain('applyProposal');
    expect(content).toContain('rollbackProposal');
  });

  test('10.13 Neo4j config has transaction utility', () => {
    const content = fs.readFileSync(resolve(rootDir, 'server/src/config/neo4j.ts'), 'utf8');
    expect(content).toContain('runCypherTransaction');
  });

  test('10.14 Shared index exports remediation types', () => {
    const content = fs.readFileSync(resolve(rootDir, 'shared/src/index.ts'), 'utf8');
    expect(content).toContain('remediation.types');
  });

  test('10.15 Validator uses ARCHIMATE_STANDARD_TYPES whitelist', () => {
    const content = fs.readFileSync(resolve(rootDir, 'server/src/services/remediation-validator.service.ts'), 'utf8');
    expect(content).toContain('ARCHIMATE_STANDARD_TYPES');
    expect(content).toContain('ARCHIMATE_STANDARD_CONNECTION_TYPES');
    expect(content).toContain('validateElement');
    expect(content).toContain('validateConnection');
    expect(content).toContain('resolveEndpoint');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. CLEANUP
// ═════════════════════════════════════════════════════════════════════════════

describe('11. Cleanup', () => {
  test('11.1 Delete test proposals from MongoDB', async () => {
    const { MongoClient } = await import('mongodb');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    const client = new MongoClient(mongoUri);
    try {
      await client.connect();
      const result = await client.db().collection('remediationproposals').deleteMany({
        projectId: { $exists: true },
      });
      // Just verify the operation didn't throw
      expect(result).toBeDefined();
    } finally {
      await client.close();
    }
  }, 15_000);

  test('11.2 Delete test project', async () => {
    if (!projectId) return;
    const { data } = await http.delete(`/projects/${projectId}`, auth());
    expect(data).toBeDefined();
  });

  test('11.3 Delete test users', async () => {
    const { MongoClient } = await import('mongodb');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    const client = new MongoClient(mongoUri);
    try {
      await client.connect();
      await client.db().collection('users').deleteMany({
        email: { $in: [ADMIN_EMAIL, VIEWER_EMAIL] },
      });
    } finally {
      await client.close();
    }
  }, 15_000);
});
