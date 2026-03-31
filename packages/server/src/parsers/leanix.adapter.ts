/**
 * LeanIX Export Import Adapter
 *
 * Supports:
 * 1. LeanIX Inventory Excel export (Application Portfolio, IT Component, etc.)
 * 2. LeanIX Fact Sheet JSON export
 * 3. LeanIX CSV export
 *
 * Maps LeanIX Fact Sheet types → TheArchitect ArchiMate types.
 */
import { v4 as uuid } from 'uuid';
import * as XLSX from 'xlsx';
import type { ParseResult, ParsedElement, ParsedConnection } from '../services/upload.service';
import { ELEMENT_TYPES, LEGACY_TYPE_MAP } from '@thearchitect/shared';

// ─── Type validation ───

const TYPE_SET: Set<string> = new Set(ELEMENT_TYPES.map((et) => et.type));
const TYPE_TO_DOMAIN = new Map<string, string>();
for (const et of ELEMENT_TYPES) TYPE_TO_DOMAIN.set(et.type, et.domain);

const DOMAIN_TO_LAYER: Record<string, string> = {
  strategy: 'strategy', business: 'business', application: 'application',
  data: 'application', technology: 'technology', physical: 'technology',
  motivation: 'motivation', implementation: 'implementation_migration', composite: 'other',
};

function inferLayer(type: string): string {
  const domain = TYPE_TO_DOMAIN.get(type);
  if (domain) return DOMAIN_TO_LAYER[domain] || 'other';
  return 'other';
}

// ─── LeanIX Fact Sheet Type → TheArchitect Mapping ───

const LEANIX_TYPE_MAP: Record<string, string> = {
  // Core Fact Sheet types
  'application': 'application_component',
  'itcomponent': 'system_software',
  'it component': 'system_software',
  'businesscapability': 'business_capability',
  'business capability': 'business_capability',
  'process': 'process',
  'businessprocess': 'process',
  'business process': 'process',
  'dataobject': 'data_object',
  'data object': 'data_object',
  'interface': 'application_interface',
  'provider': 'business_actor',
  'project': 'work_package',
  'technicalstack': 'node',
  'technical stack': 'node',
  'usergroup': 'business_role',
  'user group': 'business_role',
  'domain': 'grouping',

  // Less common
  'microservice': 'application_component',
  'behavior': 'application_function',
  'technopogy': 'node',  // Common LeanIX typo
};

// ─── LeanIX Relation Type → TheArchitect Connection ───

const LEANIX_RELATION_MAP: Record<string, string> = {
  'reltosuccessor': 'flow',
  'reltopredecessor': 'flow',
  'reltorequires': 'serving',
  'reltoprovides': 'serving',
  'reltoparent': 'composition',
  'reltochild': 'aggregation',
  'reltobusinesscapability': 'realization',
  'reltoapplication': 'serving',
  'reltoitcomponent': 'serving',
  'reltodataobject': 'access',
  'reltointerface': 'serving',
  'reltoprovider': 'assignment',
  'reltousergroup': 'association',
  'reltoprocess': 'triggering',
  'reltoproject': 'realization',
};

// ─── LeanIX Lifecycle → TheArchitect ───

const LEANIX_LIFECYCLE_MAP: Record<string, string> = {
  'plan': 'plan',
  'phaseIn': 'deploy',
  'phasein': 'deploy',
  'active': 'operate',
  'phaseOut': 'phase_out',
  'phaseout': 'phase_out',
  'endOfLife': 'retire',
  'endoflife': 'retire',
};

// ─── LeanIX Risk → TheArchitect ───

function mapRisk(leanixRisk: string): string {
  const r = leanixRisk.toLowerCase().trim();
  if (r === '1' || r === 'green' || r === 'low') return 'low';
  if (r === '2' || r === 'yellow' || r === 'medium') return 'medium';
  if (r === '3' || r === 'orange' || r === 'high') return 'high';
  if (r === '4' || r === 'red' || r === 'critical') return 'critical';
  return 'low';
}

// ─── Parser: LeanIX Excel/CSV Inventory Export ───

export function parseLeanIXExcel(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const elements: ParsedElement[] = [];
  const connections: ParsedConnection[] = [];
  const warnings: string[] = [];

  // LeanIX exports typically have sheet names like "Application", "IT Component", "Relation", etc.
  const elementSheets: string[] = [];
  const relationSheets: string[] = [];

  for (const name of workbook.SheetNames) {
    const lower = name.toLowerCase();
    if (lower.includes('relation') || lower.includes('mapping')) {
      relationSheets.push(name);
    } else {
      elementSheets.push(name);
    }
  }

  const idMap = new Map<string, string>(); // LeanIX display name/ID → our element ID
  const nameMap = new Map<string, string>(); // lowercase name → element ID

  // Parse element sheets
  for (const sheetName of elementSheets) {
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const sheetType = inferSheetType(sheetName);

    for (let i = 0; i < rows.length; i++) {
      const row: Record<string, string> = {};
      for (const [k, v] of Object.entries(rows[i])) {
        row[k.toLowerCase().replace(/[\s-]+/g, '_')] = String(v).trim();
      }

      // Skip empty
      const name = row.name || row.display_name || row.displayname || row.factsheet_name || '';
      if (!name) continue;

      const leanixId = row.id || row.externalid || row.external_id || row.factsheet_id || '';
      const rawType = row.type || row.factsheet_type || sheetType;
      const type = mapLeanIXType(rawType);

      if (!TYPE_SET.has(type)) {
        warnings.push(`Sheet '${sheetName}', row ${i + 2}: Unknown LeanIX type '${rawType}' → '${type}'`);
      }

      const elemId = `elem-${uuid().slice(0, 8)}`;
      if (leanixId) idMap.set(leanixId, elemId);
      idMap.set(name, elemId);
      nameMap.set(name.toLowerCase(), elemId);

      // Extract lifecycle phase
      const lifecycleRaw = row.lifecycle || row.lifecycle_phase || row.lifecycle_status || '';
      const lifecyclePhase = LEANIX_LIFECYCLE_MAP[lifecycleRaw] || LEANIX_LIFECYCLE_MAP[lifecycleRaw.toLowerCase()] || undefined;

      // Build properties
      const props: Record<string, string> = {};
      if (row.description) props.description = row.description;
      if (row.alias) props.alias = row.alias;
      if (row.tags) props.tags = row.tags;
      if (row.business_criticality) props.businessCriticality = row.business_criticality;
      if (row.functional_fit) props.functionalFit = row.functional_fit;
      if (row.technical_fit) props.technicalFit = row.technical_fit;
      if (leanixId) props.leanixId = leanixId;

      elements.push({
        id: elemId,
        name,
        type,
        layer: inferLayer(type),
        description: row.description || '',
        status: lifecyclePhase === 'retire' ? 'retired' : lifecyclePhase === 'plan' ? 'target' : 'current',
        riskLevel: mapRisk(row.overall_risk || row.risk || row.business_risk || ''),
        maturityLevel: parseInt(row.maturity || row.technical_fit || '3', 10) || 3,
        properties: Object.keys(props).length > 0 ? props : undefined,
      });
    }
  }

  // Parse relation sheets
  for (const sheetName of relationSheets) {
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    for (let i = 0; i < rows.length; i++) {
      const row: Record<string, string> = {};
      for (const [k, v] of Object.entries(rows[i])) {
        row[k.toLowerCase().replace(/[\s-]+/g, '_')] = String(v).trim();
      }

      const sourceName = row.from || row.from_name || row.source || row.factsheet_name || '';
      const targetName = row.to || row.to_name || row.target || row.related_name || '';
      if (!sourceName || !targetName) continue;

      const sourceId = idMap.get(sourceName) || nameMap.get(sourceName.toLowerCase());
      const targetId = idMap.get(targetName) || nameMap.get(targetName.toLowerCase());

      if (!sourceId || !targetId) {
        warnings.push(`Relation row ${i + 2}: '${sourceName}' → '${targetName}' — unresolved reference`);
        continue;
      }

      const relType = row.relation_type || row.type || row.relationship || '';
      const mappedType = LEANIX_RELATION_MAP[relType.toLowerCase().replace(/[\s-]+/g, '')] || 'association';

      connections.push({
        id: `conn-${uuid().slice(0, 8)}`,
        sourceId,
        targetId,
        type: mappedType,
        label: row.description || relType || '',
      });
    }
  }

  warnings.unshift(`LeanIX import: ${elements.length} elements, ${connections.length} relations from ${elementSheets.length} sheets`);

  return { elements, connections, warnings, format: 'leanix' };
}

// ─── Parser: LeanIX JSON Fact Sheet Export ───

export function parseLeanIXJSON(buffer: Buffer): ParseResult {
  const text = buffer.toString('utf-8');
  const data = JSON.parse(text);
  const elements: ParsedElement[] = [];
  const connections: ParsedConnection[] = [];
  const warnings: string[] = [];

  // LeanIX GraphQL exports: { data: { allFactSheets: { edges: [{node: {...}}] } } }
  // or direct array: [{ id, name, type, ... }]
  let factSheets: any[];

  if (data?.data?.allFactSheets?.edges) {
    factSheets = data.data.allFactSheets.edges.map((e: any) => e.node);
  } else if (data?.factSheets) {
    factSheets = data.factSheets;
  } else if (Array.isArray(data)) {
    factSheets = data;
  } else {
    throw new Error('Unrecognized LeanIX JSON format. Expected allFactSheets edges or factSheets array.');
  }

  const idMap = new Map<string, string>();

  for (const fs of factSheets) {
    if (!fs) continue;

    const leanixId = fs.id || '';
    const name = fs.displayName || fs.name || leanixId;
    const rawType = fs.type || fs.factSheetType || '';
    const type = mapLeanIXType(rawType);

    const elemId = `elem-${uuid().slice(0, 8)}`;
    if (leanixId) idMap.set(leanixId, elemId);
    idMap.set(name, elemId);

    const lifecycleRaw = fs.lifecycle?.asString || fs.lifecyclePhase || '';
    const lifecyclePhase = LEANIX_LIFECYCLE_MAP[lifecycleRaw] || undefined;

    elements.push({
      id: elemId,
      name,
      type,
      layer: inferLayer(type),
      description: fs.description || '',
      status: lifecyclePhase === 'retire' ? 'retired' : lifecyclePhase === 'plan' ? 'target' : 'current',
      riskLevel: mapRisk(fs.overallRisk || ''),
      maturityLevel: 3,
      properties: leanixId ? { leanixId } : undefined,
    });

    // Extract relations from fact sheet
    if (fs.relToSuccessor || fs.relToRequires || fs.relToApplication || fs.relToITComponent) {
      for (const [relKey, relValue] of Object.entries(fs)) {
        if (!relKey.startsWith('rel') || !relValue) continue;
        const edges = (relValue as any)?.edges || [];
        const mappedRelType = LEANIX_RELATION_MAP[relKey.toLowerCase()] || 'association';

        for (const edge of edges) {
          const targetFs = edge?.node?.factSheet;
          if (!targetFs?.id) continue;

          connections.push({
            id: `conn-${uuid().slice(0, 8)}`,
            sourceId: elemId,
            targetId: targetFs.id, // Will resolve after all elements are parsed
            type: mappedRelType,
            label: edge?.node?.description || '',
          });
        }
      }
    }
  }

  // Resolve connection target IDs
  for (const conn of connections) {
    const resolved = idMap.get(conn.targetId);
    if (resolved) {
      conn.targetId = resolved;
    } else {
      warnings.push(`Relation: target '${conn.targetId}' not found in fact sheets — kept as reference`);
    }
    const resolvedSource = idMap.get(conn.sourceId);
    if (resolvedSource && resolvedSource !== conn.sourceId) {
      conn.sourceId = resolvedSource;
    }
  }

  // Remove connections with unresolved targets
  const validElements = new Set(elements.map(e => e.id));
  const validConnections = connections.filter(c => validElements.has(c.sourceId) && validElements.has(c.targetId));
  const dropped = connections.length - validConnections.length;
  if (dropped > 0) warnings.push(`Dropped ${dropped} relations with unresolved references`);

  warnings.unshift(`LeanIX JSON import: ${elements.length} fact sheets, ${validConnections.length} relations`);

  return { elements, connections: validConnections, warnings, format: 'leanix' };
}

// ─── Helpers ───

function mapLeanIXType(raw: string): string {
  const key = raw.toLowerCase().replace(/[\s-]+/g, '').trim();
  const mapped = LEANIX_TYPE_MAP[key] || LEANIX_TYPE_MAP[raw.toLowerCase().trim()];
  if (mapped) return mapped;

  // Try standard normalizeType
  let t = raw.toLowerCase().replace(/[\s-]+/g, '_').trim();
  const legacy = LEGACY_TYPE_MAP[t as keyof typeof LEGACY_TYPE_MAP];
  if (legacy) t = legacy;
  if (TYPE_SET.has(t)) return t;

  return 'application_component'; // Safe default for LeanIX
}

function inferSheetType(sheetName: string): string {
  const lower = sheetName.toLowerCase();
  if (lower.includes('application')) return 'application';
  if (lower.includes('it component') || lower.includes('itcomponent')) return 'itcomponent';
  if (lower.includes('business capability')) return 'businesscapability';
  if (lower.includes('process')) return 'process';
  if (lower.includes('data')) return 'dataobject';
  if (lower.includes('interface')) return 'interface';
  if (lower.includes('provider')) return 'provider';
  if (lower.includes('project')) return 'project';
  if (lower.includes('user group')) return 'usergroup';
  return 'application';
}

// ─── Format Detection ───

export function isLeanIXFormat(buffer: Buffer, filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || '';

  // JSON: look for LeanIX-specific fields
  if (ext === 'json') {
    const head = buffer.subarray(0, 2000).toString('utf-8');
    return head.includes('allFactSheets') || head.includes('factSheetType') || head.includes('factSheets');
  }

  // Excel: check for LeanIX-typical sheet names
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const wb = XLSX.read(buffer, { type: 'buffer', sheetRows: 0 });
      const names = wb.SheetNames.map(s => s.toLowerCase());
      return names.some(n =>
        n.includes('application') && (
          names.some(m => m.includes('it component') || m.includes('relation') || m.includes('business capability'))
        )
      );
    } catch { return false; }
  }

  return false;
}
