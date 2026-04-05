/**
 * Connector Constants Validation — Unit Tests
 *
 * Ensures that all type-mapping constants across all connectors produce
 * valid ArchiMate types from ELEMENT_TYPES. Catches typos and invalid mappings.
 *
 * Run: cd packages/server && npx jest src/__tests__/connector-constants.test.ts --verbose
 */

import { ELEMENT_TYPES } from '@thearchitect/shared';
import { __testExports as leanix } from '../services/connectors/leanix.connector';
import { __testExports as servicenow } from '../services/connectors/servicenow.connector';
import { __testExports as sap } from '../services/connectors/sap.connector';
import { __testExports as sparx } from '../services/connectors/sparxea.connector';
import { __testExports as n8n } from '../services/connectors/n8n.connector';
import { __testExports as jira } from '../services/connectors/jira.connector';
import { __testExports as salesforce } from '../services/connectors/salesforce.connector';
import { __testExports as citrix } from '../services/connectors/citrix.connector';

const TYPE_SET = new Set(ELEMENT_TYPES.map(et => et.type));

// Valid ArchiMate relationship types used in connectors
const VALID_RELATION_TYPES = new Set([
  'association', 'aggregation', 'composition', 'serving', 'specialization',
  'realization', 'flow', 'access', 'influence', 'triggering', 'assignment',
]);

// Valid element statuses
const VALID_STATUSES = new Set(['current', 'target', 'transitional', 'retired']);

// Valid layers
const VALID_LAYERS = new Set([
  'strategy', 'business', 'application', 'technology',
  'motivation', 'implementation_migration', 'other',
]);

// ════════════════════════════════════════════════════════
// Element Type Maps → Valid ArchiMate Types
// ════════════════════════════════════════════════════════

describe('Type maps produce valid ArchiMate types', () => {
  it('LeanIX LEANIX_TYPE_MAP values are valid', () => {
    for (const [key, value] of Object.entries(leanix.LEANIX_TYPE_MAP)) {
      expect(TYPE_SET.has(value as any)).toBe(true);
    }
  });

  it('ServiceNow CMDB_CLASS_MAP values are valid', () => {
    for (const [key, value] of Object.entries(servicenow.CMDB_CLASS_MAP)) {
      expect(TYPE_SET.has(value as any)).toBe(true);
    }
  });

  it('SAP SAP_TYPE_MAP values are valid', () => {
    for (const [key, value] of Object.entries(sap.SAP_TYPE_MAP)) {
      expect(TYPE_SET.has(value as any)).toBe(true);
    }
  });

  it('Sparx EA SPARX_TYPE_MAP values are valid', () => {
    for (const [key, value] of Object.entries(sparx.SPARX_TYPE_MAP)) {
      expect(TYPE_SET.has(value as any)).toBe(true);
    }
  });

  it('Jira JIRA_TYPE_MAP values are valid', () => {
    for (const [key, value] of Object.entries(jira.JIRA_TYPE_MAP)) {
      expect(TYPE_SET.has(value as any)).toBe(true);
    }
  });

  it('Salesforce SF_OBJECT_MAP type values are valid', () => {
    for (const [key, value] of Object.entries(salesforce.SF_OBJECT_MAP)) {
      expect(TYPE_SET.has(value.type as any)).toBe(true);
    }
  });

  it('Citrix CITRIX_TYPE_MAP type values are valid', () => {
    for (const [key, value] of Object.entries(citrix.CITRIX_TYPE_MAP)) {
      expect(TYPE_SET.has(value.type as any)).toBe(true);
    }
  });

  it('n8n NODE_TYPE_RULES mapping types are valid', () => {
    for (const rule of n8n.NODE_TYPE_RULES) {
      expect(TYPE_SET.has(rule.mapping.type as any)).toBe(true);
    }
    expect(TYPE_SET.has(n8n.DEFAULT_MAPPING.type as any)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════
// Relation Maps → Valid Relation Types
// ════════════════════════════════════════════════════════

describe('Relation maps produce valid relationship types', () => {
  it('LeanIX LEANIX_RELATION_MAP values are valid', () => {
    for (const [key, value] of Object.entries(leanix.LEANIX_RELATION_MAP)) {
      expect(VALID_RELATION_TYPES.has(value)).toBe(true);
    }
  });

  it('ServiceNow RELATION_TYPE_MAP values are valid', () => {
    for (const [key, value] of Object.entries(servicenow.RELATION_TYPE_MAP)) {
      expect(VALID_RELATION_TYPES.has(value)).toBe(true);
    }
  });

  it('SAP SAP_RELATION_MAP values are valid', () => {
    for (const [key, value] of Object.entries(sap.SAP_RELATION_MAP)) {
      expect(VALID_RELATION_TYPES.has(value)).toBe(true);
    }
  });

  it('Sparx EA SPARX_CONNECTOR_MAP values are valid', () => {
    for (const [key, value] of Object.entries(sparx.SPARX_CONNECTOR_MAP)) {
      expect(VALID_RELATION_TYPES.has(value)).toBe(true);
    }
  });

  it('Jira JIRA_LINK_MAP values are valid', () => {
    for (const [key, value] of Object.entries(jira.JIRA_LINK_MAP)) {
      expect(VALID_RELATION_TYPES.has(value)).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════
// Status Maps → Valid Statuses
// ════════════════════════════════════════════════════════

describe('Status maps produce valid statuses', () => {
  it('LeanIX LIFECYCLE_MAP values are valid', () => {
    for (const value of Object.values(leanix.LIFECYCLE_MAP)) {
      expect(VALID_STATUSES.has(value)).toBe(true);
    }
  });

  it('ServiceNow LIFECYCLE_MAP values are valid', () => {
    for (const value of Object.values(servicenow.LIFECYCLE_MAP)) {
      expect(VALID_STATUSES.has(value)).toBe(true);
    }
  });

  it('SAP SAP_STATUS_MAP values are valid', () => {
    for (const value of Object.values(sap.SAP_STATUS_MAP)) {
      expect(VALID_STATUSES.has(value)).toBe(true);
    }
  });

  it('Sparx EA SPARX_STATUS_MAP values are valid', () => {
    for (const value of Object.values(sparx.SPARX_STATUS_MAP)) {
      expect(VALID_STATUSES.has(value)).toBe(true);
    }
  });

  it('Salesforce SF_STAGE_MAP values are valid', () => {
    for (const value of Object.values(salesforce.SF_STAGE_MAP)) {
      expect(VALID_STATUSES.has(value)).toBe(true);
    }
  });

  it('Citrix POWER_STATE_MAP values are valid', () => {
    for (const value of Object.values(citrix.POWER_STATE_MAP)) {
      expect(VALID_STATUSES.has(value)).toBe(true);
    }
  });

  it('Citrix REGISTRATION_STATE_MAP values are valid', () => {
    for (const value of Object.values(citrix.REGISTRATION_STATE_MAP)) {
      expect(VALID_STATUSES.has(value)).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════
// Layer Maps → Valid Layers
// ════════════════════════════════════════════════════════

describe('Layer values are valid', () => {
  it('Salesforce SF_OBJECT_MAP layer values are valid', () => {
    for (const value of Object.values(salesforce.SF_OBJECT_MAP)) {
      expect(VALID_LAYERS.has(value.layer)).toBe(true);
    }
  });

  it('Citrix CITRIX_TYPE_MAP layer values are valid', () => {
    for (const value of Object.values(citrix.CITRIX_TYPE_MAP)) {
      expect(VALID_LAYERS.has(value.layer)).toBe(true);
    }
  });

  it('n8n NODE_TYPE_RULES layer values are valid', () => {
    for (const rule of n8n.NODE_TYPE_RULES) {
      expect(VALID_LAYERS.has(rule.mapping.layer)).toBe(true);
    }
    expect(VALID_LAYERS.has(n8n.DEFAULT_MAPPING.layer)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════
// Map sizes (sanity checks)
// ════════════════════════════════════════════════════════

describe('Maps are non-empty', () => {
  it('LeanIX has type mappings', () => expect(Object.keys(leanix.LEANIX_TYPE_MAP).length).toBeGreaterThan(5));
  it('ServiceNow has CI class mappings', () => expect(Object.keys(servicenow.CMDB_CLASS_MAP).length).toBeGreaterThan(10));
  it('SAP has type mappings', () => expect(Object.keys(sap.SAP_TYPE_MAP).length).toBeGreaterThan(10));
  it('Sparx EA has type mappings', () => expect(Object.keys(sparx.SPARX_TYPE_MAP).length).toBeGreaterThan(20));
  it('Jira has type mappings', () => expect(Object.keys(jira.JIRA_TYPE_MAP).length).toBeGreaterThan(5));
  it('Salesforce has object mappings', () => expect(Object.keys(salesforce.SF_OBJECT_MAP).length).toBeGreaterThan(5));
  it('Citrix has type mappings', () => expect(Object.keys(citrix.CITRIX_TYPE_MAP).length).toBeGreaterThan(5));
  it('n8n has node type rules', () => expect(n8n.NODE_TYPE_RULES.length).toBeGreaterThan(5));
});
