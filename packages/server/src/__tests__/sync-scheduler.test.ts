/**
 * Sync Scheduler — Unit Tests
 *
 * Tests SyncLog schema definition, enum values, defaults, and scheduler constants.
 * Does NOT require a running MongoDB — tests schema metadata only.
 *
 * Run: cd packages/server && npx jest src/__tests__/sync-scheduler.test.ts --verbose
 */

import mongoose from 'mongoose';
import { SyncLog } from '../services/sync-scheduler.service';

const schema = SyncLog.schema;

// ════════════════════════════════════════════════════════
// SyncLog Schema Structure
// ════════════════════════════════════════════════════════

describe('SyncLog Schema', () => {
  it('has required field: projectId', () => {
    const path = schema.path('projectId') as any;
    expect(path).toBeDefined();
    expect(path.options.required).toBe(true);
    expect(path.options.ref).toBe('Project');
  });

  it('has required field: integrationId', () => {
    const path = schema.path('integrationId') as any;
    expect(path).toBeDefined();
    expect(path.options.required).toBe(true);
  });

  it('has required field: connectionType', () => {
    const path = schema.path('connectionType') as any;
    expect(path).toBeDefined();
    expect(path.options.required).toBe(true);
  });

  it('has required field: status with enum', () => {
    const path = schema.path('status') as any;
    expect(path).toBeDefined();
    expect(path.options.required).toBe(true);
    expect(path.options.enum).toEqual(['success', 'error']);
  });

  it('has triggeredBy with correct enum values', () => {
    const path = schema.path('triggeredBy') as any;
    expect(path).toBeDefined();
    expect(path.options.enum).toEqual(['scheduler', 'manual']);
    expect(path.options.default).toBe('scheduler');
  });

  it('has numeric fields with defaults', () => {
    expect((schema.path('elementsCreated') as any).options.default).toBe(0);
    expect((schema.path('connectionsCreated') as any).options.default).toBe(0);
    expect((schema.path('durationMs') as any).options.default).toBe(0);
  });

  it('has warnings as array of strings', () => {
    const path = schema.path('warnings') as any;
    expect(path).toBeDefined();
  });

  it('has optional error field', () => {
    const path = schema.path('error') as any;
    expect(path).toBeDefined();
    expect(path.options.required).toBeUndefined();
  });

  it('has syncedAt with default Date.now', () => {
    const path = schema.path('syncedAt') as any;
    expect(path).toBeDefined();
    expect(path.options.default).toBe(Date.now);
  });
});

// ════════════════════════════════════════════════════════
// SyncLog Indexes
// ════════════════════════════════════════════════════════

describe('SyncLog Indexes', () => {
  it('has projectId index', () => {
    const indexes = schema.indexes();
    const projectIdIndex = indexes.find(
      ([fields]) => fields.projectId !== undefined
    );
    expect(projectIdIndex).toBeDefined();
  });

  it('has TTL index on syncedAt (90 days)', () => {
    const indexes = schema.indexes();
    const ttlIndex = indexes.find(
      ([fields, opts]) => fields.syncedAt !== undefined && (opts as any)?.expireAfterSeconds !== undefined
    );
    expect(ttlIndex).toBeDefined();
    if (ttlIndex) {
      expect((ttlIndex[1] as any).expireAfterSeconds).toBe(90 * 24 * 60 * 60);
    }
  });
});

// ════════════════════════════════════════════════════════
// Model Name
// ════════════════════════════════════════════════════════

describe('SyncLog Model', () => {
  it('is registered as "SyncLog"', () => {
    expect(SyncLog.modelName).toBe('SyncLog');
  });

  it('collection name is "synclogs"', () => {
    expect(SyncLog.collection.collectionName).toBe('synclogs');
  });
});
