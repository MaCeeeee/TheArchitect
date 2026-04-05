/**
 * Connector Type-Mapping Tests
 *
 * Verifies that all connector helper functions correctly map external types
 * to valid ArchiMate element types, statuses, and layers.
 *
 * Run: cd packages/server && npx jest src/__tests__/connector-mappings.test.ts --verbose
 */

import { ELEMENT_TYPES } from '@thearchitect/shared';
import { __testExports as leanix } from '../services/connectors/leanix.connector';
import { __testExports as servicenow } from '../services/connectors/servicenow.connector';
import { __testExports as sap } from '../services/connectors/sap.connector';
import { __testExports as sparx } from '../services/connectors/sparxea.connector';
import { __testExports as n8n } from '../services/connectors/n8n.connector';

const TYPE_SET = new Set(ELEMENT_TYPES.map(et => et.type));

// ════════════════════════════════════════════════════════
// LeanIX Connector
// ════════════════════════════════════════════════════════

describe('LeanIX Connector', () => {
  describe('mapType', () => {
    it.each([
      ['Application', 'application_component'],
      ['ITComponent', 'system_software'],
      ['IT Component', 'system_software'],
      ['BusinessCapability', 'business_capability'],
      ['Business Capability', 'business_capability'],
      ['Process', 'process'],
      ['DataObject', 'data_object'],
      ['Interface', 'application_interface'],
      ['Provider', 'business_actor'],
      ['Project', 'work_package'],
      ['UserGroup', 'business_role'],
      ['Domain', 'grouping'],
      ['Microservice', 'application_component'],
      ['Behavior', 'application_function'],
    ])('maps "%s" → "%s"', (input, expected) => {
      expect(leanix.mapType(input)).toBe(expected);
    });

    it('falls back to application_component for unknown types', () => {
      expect(leanix.mapType('UnknownWidget')).toBe('application_component');
    });

    it('handles case-insensitive input', () => {
      expect(leanix.mapType('APPLICATION')).toBe('application_component');
      expect(leanix.mapType('itcomponent')).toBe('system_software');
    });
  });

  describe('inferLayer', () => {
    it.each([
      ['application_component', 'application'],
      ['process', 'business'],
      ['node', 'technology'],
      ['requirement', 'motivation'],
      ['work_package', 'implementation_migration'],
      ['business_capability', 'strategy'],
    ])('infers layer "%s" → "%s"', (type, expected) => {
      expect(leanix.inferLayer(type)).toBe(expected);
    });

    it('returns "other" for unknown types', () => {
      expect(leanix.inferLayer('totally_unknown')).toBe('other');
    });
  });

  describe('mapFitToMaturity', () => {
    it.each([
      ['excellent', 5], ['4', 5],
      ['adequate', 4], ['3', 4],
      ['insufficient', 2], ['2', 2],
      ['unreasonable', 1], ['1', 1],
    ])('maps "%s" → %d', (input, expected) => {
      expect(leanix.mapFitToMaturity(input)).toBe(expected);
    });

    it('returns 3 for undefined', () => {
      expect(leanix.mapFitToMaturity(undefined)).toBe(3);
    });

    it('returns 3 for unknown string', () => {
      expect(leanix.mapFitToMaturity('something_else')).toBe(3);
    });
  });

  describe('mapSuitabilityToFitness', () => {
    it.each([
      ['excellent', 5], ['4', 5],
      ['adequate', 4], ['3', 4],
      ['insufficient', 2], ['2', 2],
      ['unreasonable', 1], ['1', 1],
    ])('maps "%s" → %d', (input, expected) => {
      expect(leanix.mapSuitabilityToFitness(input)).toBe(expected);
    });

    it('returns null for undefined', () => {
      expect(leanix.mapSuitabilityToFitness(undefined)).toBeNull();
    });

    it('returns null for unknown string', () => {
      expect(leanix.mapSuitabilityToFitness('weird_value')).toBeNull();
    });
  });

  describe('LIFECYCLE_MAP', () => {
    it('maps plan → target', () => expect(leanix.LIFECYCLE_MAP['plan']).toBe('target'));
    it('maps phasein → target', () => expect(leanix.LIFECYCLE_MAP['phasein']).toBe('target'));
    it('maps active → current', () => expect(leanix.LIFECYCLE_MAP['active']).toBe('current'));
    it('maps phaseout → transitional', () => expect(leanix.LIFECYCLE_MAP['phaseout']).toBe('transitional'));
    it('maps endoflife → retired', () => expect(leanix.LIFECYCLE_MAP['endoflife']).toBe('retired'));
  });

  describe('TIME_TO_STRATEGY', () => {
    it('maps tolerate → retain', () => expect(leanix.TIME_TO_STRATEGY['tolerate']).toBe('retain'));
    it('maps invest → replatform', () => expect(leanix.TIME_TO_STRATEGY['invest']).toBe('replatform'));
    it('maps migrate → refactor', () => expect(leanix.TIME_TO_STRATEGY['migrate']).toBe('refactor'));
    it('maps eliminate → retire', () => expect(leanix.TIME_TO_STRATEGY['eliminate']).toBe('retire'));
  });
});

// ════════════════════════════════════════════════════════
// ServiceNow Connector
// ════════════════════════════════════════════════════════

describe('ServiceNow Connector', () => {
  describe('mapCIClass', () => {
    it.each([
      ['cmdb_ci_appl', 'application_component'],
      ['cmdb_ci_service', 'application_service'],
      ['cmdb_ci_database', 'data_object'],
      ['cmdb_ci_server', 'node'],
      ['cmdb_ci_linux_server', 'node'],
      ['cmdb_ci_computer', 'device'],
      ['cmdb_ci_ip_switch', 'communication_network'],
      ['cmdb_ci_spkg', 'system_software'],
      ['cmdb_ci_service_business', 'business_service'],
    ])('maps "%s" → "%s"', (input, expected) => {
      expect(servicenow.mapCIClass(input)).toBe(expected);
    });

    it('uses fallback heuristics for unknown classes', () => {
      expect(servicenow.mapCIClass('cmdb_ci_custom_server')).toBe('node');
      // Note: 'cmdb' substring contains 'db', so 'db' heuristic fires before 'app'/'network'
      expect(servicenow.mapCIClass('custom_appl_system')).toBe('application_component');
      expect(servicenow.mapCIClass('custom_database_inst')).toBe('data_object');
      expect(servicenow.mapCIClass('custom_network_gear')).toBe('communication_network');
      expect(servicenow.mapCIClass('custom_storage_array')).toBe('artifact');
    });

    it('defaults to application_component for fully unknown classes', () => {
      expect(servicenow.mapCIClass('totally_unknown_class')).toBe('application_component');
    });
  });

  describe('mapLifecycleToStrategy', () => {
    it('maps retired status to retire', () => {
      expect(servicenow.mapLifecycleToStrategy('retired', undefined)).toBe('retire');
    });

    it('maps retired operational status to retire', () => {
      expect(servicenow.mapLifecycleToStrategy(undefined, 'retired')).toBe('retire');
    });

    it('maps pipeline to replatform', () => {
      expect(servicenow.mapLifecycleToStrategy('pipeline', undefined)).toBe('replatform');
    });

    it('maps non-operational to retain', () => {
      expect(servicenow.mapLifecycleToStrategy(undefined, 'non-operational')).toBe('retain');
    });

    it('maps installed + operational to retain', () => {
      expect(servicenow.mapLifecycleToStrategy('installed', 'operational')).toBe('retain');
    });

    it('returns null for unmapped statuses', () => {
      expect(servicenow.mapLifecycleToStrategy('unknown', 'unknown')).toBeNull();
    });
  });

  describe('LIFECYCLE_MAP', () => {
    it('maps pipeline → target', () => expect(servicenow.LIFECYCLE_MAP['pipeline']).toBe('target'));
    it('maps installed → current', () => expect(servicenow.LIFECYCLE_MAP['installed']).toBe('current'));
    it('maps retired → retired', () => expect(servicenow.LIFECYCLE_MAP['retired']).toBe('retired'));
  });

  describe('CRITICALITY_TO_RISK', () => {
    it('maps 1 - most critical → critical', () => expect(servicenow.CRITICALITY_TO_RISK['1 - most critical']).toBe('critical'));
    it('maps 4 - not critical → low', () => expect(servicenow.CRITICALITY_TO_RISK['4 - not critical']).toBe('low'));
  });
});

// ════════════════════════════════════════════════════════
// SAP Connector
// ════════════════════════════════════════════════════════

describe('SAP Connector', () => {
  describe('inferLayer', () => {
    it.each([
      ['application_component', 'application'],
      ['system_software', 'technology'],
      ['process', 'business'],
      ['data_object', 'application'],
      ['node', 'technology'],
    ])('infers layer "%s" → "%s"', (type, expected) => {
      expect(sap.inferLayer(type)).toBe(expected);
    });
  });

  describe('mapSAPStatusToStrategy', () => {
    it('maps decommissioned → retire', () => expect(sap.mapSAPStatusToStrategy('decommissioned')).toBe('retire'));
    it('maps inactive → retire', () => expect(sap.mapSAPStatusToStrategy('inactive')).toBe('retire'));
    it('maps end_of_life → retire', () => expect(sap.mapSAPStatusToStrategy('end_of_life')).toBe('retire'));
    it('maps planned → replatform', () => expect(sap.mapSAPStatusToStrategy('planned')).toBe('replatform'));
    it('maps in_development → replatform', () => expect(sap.mapSAPStatusToStrategy('in_development')).toBe('replatform'));
    it('maps testing → rehost', () => expect(sap.mapSAPStatusToStrategy('testing')).toBe('rehost'));
    it('maps active → retain', () => expect(sap.mapSAPStatusToStrategy('active')).toBe('retain'));
    it('maps productive → retain', () => expect(sap.mapSAPStatusToStrategy('productive')).toBe('retain'));
    it('returns null for unknown status', () => expect(sap.mapSAPStatusToStrategy('some_other')).toBeNull());
  });

  describe('SAP_STATUS_MAP', () => {
    it('maps active → current', () => expect(sap.SAP_STATUS_MAP['active']).toBe('current'));
    it('maps planned → target', () => expect(sap.SAP_STATUS_MAP['planned']).toBe('target'));
    it('maps decommissioned → retired', () => expect(sap.SAP_STATUS_MAP['decommissioned']).toBe('retired'));
    it('maps testing → transitional', () => expect(sap.SAP_STATUS_MAP['testing']).toBe('transitional'));
  });
});

// ════════════════════════════════════════════════════════
// Sparx EA Connector
// ════════════════════════════════════════════════════════

describe('Sparx EA Connector', () => {
  describe('mapSparxType', () => {
    it('maps ArchiMate stereotypes (priority over objectType)', () => {
      // Note: fetchData lowercases stereotypes before passing to mapSparxType
      expect(sparx.mapSparxType('class', 'applicationcomponent')).toBe('application_component');
      expect(sparx.mapSparxType('class', 'businessprocess')).toBe('process');
      expect(sparx.mapSparxType('class', 'dataobject')).toBe('data_object');
    });

    it('maps generic UML types when no stereotype', () => {
      expect(sparx.mapSparxType('class', '')).toBe('business_object');
      expect(sparx.mapSparxType('component', '')).toBe('application_component');
      expect(sparx.mapSparxType('interface', '')).toBe('application_interface');
      expect(sparx.mapSparxType('activity', '')).toBe('process');
      expect(sparx.mapSparxType('node', '')).toBe('node');
    });

    it('falls back to application_component for unknown types', () => {
      expect(sparx.mapSparxType('unknown', '')).toBe('application_component');
    });
  });

  describe('stripHtml', () => {
    it('removes HTML tags', () => {
      expect(sparx.stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
    });

    it('replaces HTML entities with space', () => {
      expect(sparx.stripHtml('Hello&nbsp;World')).toBe('Hello World');
    });

    it('truncates to 500 chars', () => {
      const long = '<p>' + 'x'.repeat(600) + '</p>';
      expect(sparx.stripHtml(long).length).toBeLessThanOrEqual(500);
    });

    it('handles empty string', () => {
      expect(sparx.stripHtml('')).toBe('');
    });
  });

  describe('SPARX_STATUS_MAP', () => {
    it('maps proposed → target', () => expect(sparx.SPARX_STATUS_MAP['proposed']).toBe('target'));
    it('maps implemented → current', () => expect(sparx.SPARX_STATUS_MAP['implemented']).toBe('current'));
    it('maps deprecated → transitional', () => expect(sparx.SPARX_STATUS_MAP['deprecated']).toBe('transitional'));
    it('maps obsolete → retired', () => expect(sparx.SPARX_STATUS_MAP['obsolete']).toBe('retired'));
  });
});

// ════════════════════════════════════════════════════════
// n8n Connector
// ════════════════════════════════════════════════════════

describe('n8n Connector', () => {
  describe('mapNodeType', () => {
    it.each([
      ['n8n-nodes-base.scheduleTrigger', 'business_service', 'business'],
      ['n8n-nodes-base.httpRequest', 'application_service', 'application'],
      ['n8n-nodes-base.code', 'application_component', 'application'],
      ['n8n-nodes-base.postgres', 'data_entity', 'application'],
      ['n8n-nodes-base.s3', 'technology_component', 'technology'],
      ['n8n-nodes-base.rabbitmq', 'technology_component', 'technology'],
      ['n8n-nodes-base.slack', 'application_service', 'application'],
      ['@n8n/n8n-nodes-langchain.openAi', 'application_component', 'application'],
      ['n8n-nodes-base.if', 'process', 'business'],
      ['n8n-nodes-base.set', 'process', 'business'],
      ['n8n-nodes-base.merge', 'process', 'business'],
    ])('maps "%s" → type="%s", layer="%s"', (input, expectedType, expectedLayer) => {
      const result = n8n.mapNodeType(input);
      expect(result.type).toBe(expectedType);
      expect(result.layer).toBe(expectedLayer);
    });

    it('returns default mapping for unknown node types', () => {
      const result = n8n.mapNodeType('n8n-nodes-base.someUnknownNode');
      expect(result).toEqual(n8n.DEFAULT_MAPPING);
    });
  });
});
