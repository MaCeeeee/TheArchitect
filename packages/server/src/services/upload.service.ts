/**
 * Upload Service — Handles architecture artifact uploads for the public Health Check.
 * Creates temporary Neo4j project graphs with a `tmp-` prefix and 24h TTL.
 */
import { v4 as uuid } from 'uuid';
import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
import { runCypher, runCypherTransaction } from '../config/neo4j';
import { ELEMENT_TYPES, ARCHIMATE_STANDARD_TYPES, LEGACY_TYPE_MAP } from '@thearchitect/shared';
import { parseArchiMateExchange } from '../parsers/archimate-exchange.parser';
import { parseLeanIXExcel, parseLeanIXJSON, isLeanIXFormat } from '../parsers/leanix.adapter';

// ─── Types ───

export interface ParsedElement {
  id: string;
  name: string;
  type: string;
  layer: string;
  description: string;
  status: string;
  riskLevel: string;
  maturityLevel: number;
  properties?: Record<string, string>;
}

export interface ParsedConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  label?: string;
}

export interface ParseResult {
  elements: ParsedElement[];
  connections: ParsedConnection[];
  warnings: string[];
  format: string;
}

export interface UploadResult {
  uploadToken: string;
  projectId: string;
  elementCount: number;
  connectionCount: number;
  warnings: string[];
  format: string;
}

// ─── Type lookup maps ───

const TYPE_SET: Set<string> = new Set(ELEMENT_TYPES.map((et) => et.type));

const TYPE_TO_DOMAIN = new Map<string, string>();
for (const et of ELEMENT_TYPES) {
  TYPE_TO_DOMAIN.set(et.type, et.domain);
}

const DOMAIN_TO_LAYER: Record<string, string> = {
  strategy: 'strategy',
  business: 'business',
  application: 'application',
  data: 'application',
  technology: 'technology',
  physical: 'technology',
  motivation: 'motivation',
  implementation: 'implementation_migration',
  composite: 'other',
};

// ─── Format Detection ───

export function detectFormat(buffer: Buffer, filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() || '';

  // Check LeanIX first (before generic Excel/JSON)
  if (isLeanIXFormat(buffer, filename)) return 'leanix';

  if (ext === 'csv') return 'csv';
  if (ext === 'json') return 'json';
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  if (ext === 'xml' || ext === 'archimate') return 'archimate-xml';

  // Sniff content
  const head = buffer.subarray(0, 200).toString('utf-8').trim();
  if (head.startsWith('<?xml') || head.startsWith('<model')) return 'archimate-xml';
  if (head.startsWith('{') || head.startsWith('[')) return 'json';

  // Check for Excel magic bytes (PK zip for xlsx)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'excel';

  return 'unknown';
}

// ─── Normalize type string ───

function normalizeType(raw: string): string {
  let t = raw.toLowerCase().replace(/[\s-]+/g, '_').trim();

  // Check legacy mapping
  const legacy = LEGACY_TYPE_MAP[t as keyof typeof LEGACY_TYPE_MAP];
  if (legacy) t = legacy;

  if (TYPE_SET.has(t)) return t;

  // Fuzzy: try without common prefixes
  for (const prefix of ['archimate_', 'archimate3_', 'am_']) {
    if (t.startsWith(prefix)) {
      const stripped = t.slice(prefix.length);
      if (TYPE_SET.has(stripped)) return stripped;
    }
  }

  return t; // Return as-is; warning will be generated
}

function inferLayer(type: string): string {
  const domain = TYPE_TO_DOMAIN.get(type);
  if (domain) return DOMAIN_TO_LAYER[domain] || 'other';
  return 'other';
}

// ─── CSV Parser (server-side) ───

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseCSV(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { elements: [], connections: [], warnings: ['CSV file has no data rows'], format: 'csv' };

  let headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s-]+/g, '_'));
  const elements: ParsedElement[] = [];
  const connections: ParsedConnection[] = [];
  const warnings: string[] = [];

  // Detect if it's a connections-only CSV
  const isConnectionCSV = headers.includes('source') && headers.includes('target');

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.every((f) => !f)) continue;

    // Detect mid-file header switch (e.g. "source,target,connection_type,label")
    const normalized = fields.map((f) => f.toLowerCase().replace(/[\s-]+/g, '_'));
    if (normalized.includes('source') && normalized.includes('target') && normalized.includes('connection_type')) {
      headers = normalized;
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = fields[idx] || ''; });

    // Connection row
    if (row.source && row.target && (row.connection_type || row.type)) {
      connections.push({
        id: `conn-${uuid().slice(0, 8)}`,
        sourceId: row.source,
        targetId: row.target,
        type: (row.connection_type || row.type || 'association').toLowerCase().replace(/[\s-]+/g, '_'),
        label: row.label || row.name || '',
      });
      continue;
    }

    // Element row
    if (isConnectionCSV && !row.name) continue;

    const rawType = row.type || 'application_component';
    const type = normalizeType(rawType);
    if (!TYPE_SET.has(type) && !(ARCHIMATE_STANDARD_TYPES as ReadonlySet<string>).has(type)) {
      warnings.push(`Row ${i + 1}: Unknown type '${rawType}' — imported as '${type}'`);
    }

    const layer = row.layer || inferLayer(type);

    elements.push({
      id: row.id || `elem-${uuid().slice(0, 8)}`,
      name: row.name || `Element ${i}`,
      type,
      layer,
      description: row.description || '',
      status: row.status || 'current',
      riskLevel: row.risk_level || row.risklevel || 'low',
      maturityLevel: parseInt(row.maturity_level || row.maturitylevel || row.maturity || '3', 10) || 3,
    });
  }

  return { elements, connections, warnings, format: 'csv' };
}

// ─── Excel Parser ───

export function parseExcel(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const elements: ParsedElement[] = [];
  const connections: ParsedConnection[] = [];
  const warnings: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    for (let i = 0; i < rows.length; i++) {
      const row: Record<string, string> = {};
      // Normalize header keys
      for (const [k, v] of Object.entries(rows[i])) {
        row[k.toLowerCase().replace(/[\s-]+/g, '_')] = String(v).trim();
      }

      // Skip empty rows
      if (!row.name && !row.source) continue;

      // Connection row
      if (row.source && row.target) {
        connections.push({
          id: `conn-${uuid().slice(0, 8)}`,
          sourceId: row.source,
          targetId: row.target,
          type: (row.connection_type || row.type || 'association').toLowerCase().replace(/[\s-]+/g, '_'),
          label: row.label || '',
        });
        continue;
      }

      const rawType = row.type || 'application_component';
      const type = normalizeType(rawType);
      if (!TYPE_SET.has(type)) {
        warnings.push(`Sheet '${sheetName}', row ${i + 2}: Unknown type '${rawType}'`);
      }

      elements.push({
        id: row.id || `elem-${uuid().slice(0, 8)}`,
        name: row.name || `Element ${i + 1}`,
        type,
        layer: row.layer || inferLayer(type),
        description: row.description || '',
        status: row.status || 'current',
        riskLevel: row.risk_level || row.risklevel || 'low',
        maturityLevel: parseInt(row.maturity_level || row.maturitylevel || row.maturity || '3', 10) || 3,
      });
    }
  }

  return { elements, connections, warnings, format: 'excel' };
}

// ─── ArchiMate XML Parser (Basic — supports 3.1 / 3.2 Model Exchange) ───

// ArchiMate XML type xsi:type → TheArchitect type
const ARCHIMATE_XML_TYPE_MAP: Record<string, string> = {
  // Business
  'BusinessActor': 'business_actor',
  'BusinessRole': 'business_role',
  'BusinessCollaboration': 'business_collaboration',
  'BusinessInterface': 'business_interface',
  'BusinessProcess': 'process',
  'BusinessFunction': 'business_function',
  'BusinessInteraction': 'business_interaction',
  'BusinessEvent': 'business_event',
  'BusinessService': 'business_service',
  'BusinessObject': 'business_object',
  'Contract': 'contract',
  'Representation': 'representation',
  'Product': 'product',
  // Application
  'ApplicationComponent': 'application_component',
  'ApplicationCollaboration': 'application_collaboration',
  'ApplicationInterface': 'application_interface',
  'ApplicationFunction': 'application_function',
  'ApplicationInteraction': 'application_interaction',
  'ApplicationProcess': 'application_process',
  'ApplicationEvent': 'application_event',
  'ApplicationService': 'application_service',
  'DataObject': 'data_object',
  // Technology
  'Node': 'node',
  'Device': 'device',
  'SystemSoftware': 'system_software',
  'TechnologyCollaboration': 'technology_collaboration',
  'TechnologyInterface': 'technology_interface',
  'TechnologyFunction': 'technology_function',
  'TechnologyProcess': 'technology_process',
  'TechnologyInteraction': 'technology_interaction',
  'TechnologyEvent': 'technology_event',
  'TechnologyService': 'technology_service',
  'Artifact': 'artifact',
  'CommunicationNetwork': 'communication_network',
  'Path': 'path',
  // Physical
  'Equipment': 'equipment',
  'Facility': 'facility',
  'DistributionNetwork': 'distribution_network',
  'Material': 'material',
  // Strategy
  'Resource': 'resource',
  'Capability': 'business_capability',
  'ValueStream': 'value_stream',
  'CourseOfAction': 'course_of_action',
  // Motivation
  'Stakeholder': 'stakeholder',
  'Driver': 'driver',
  'Assessment': 'assessment',
  'Goal': 'goal',
  'Outcome': 'outcome',
  'Principle': 'principle',
  'Requirement': 'requirement',
  'Constraint': 'constraint',
  'Meaning': 'meaning',
  'Value': 'am_value',
  // Implementation & Migration
  'WorkPackage': 'work_package',
  'Deliverable': 'deliverable',
  'ImplementationEvent': 'implementation_event',
  'Plateau': 'plateau',
  'Gap': 'gap',
  // Composite
  'Grouping': 'grouping',
  'Location': 'location',
};

const ARCHIMATE_RELATIONSHIP_MAP: Record<string, string> = {
  'Composition': 'composition',
  'CompositionRelationship': 'composition',
  'Aggregation': 'aggregation',
  'AggregationRelationship': 'aggregation',
  'Assignment': 'assignment',
  'AssignmentRelationship': 'assignment',
  'Realization': 'realization',
  'RealizationRelationship': 'realization',
  'Serving': 'serving',
  'ServingRelationship': 'serving',
  'Access': 'access',
  'AccessRelationship': 'access',
  'Influence': 'influence',
  'InfluenceRelationship': 'influence',
  'Triggering': 'triggering',
  'TriggeringRelationship': 'triggering',
  'Flow': 'flow',
  'FlowRelationship': 'flow',
  'Specialization': 'specialization',
  'SpecializationRelationship': 'specialization',
  'Association': 'association',
  'AssociationRelationship': 'association',
};

export function parseArchiMateXML(buffer: Buffer): ParseResult {
  const xmlStr = buffer.toString('utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false, // Prevent XXE / Billion Laughs attacks
    isArray: (name) => ['element', 'relationship', 'property', 'value'].includes(name),
  });

  const parsed = parser.parse(xmlStr);
  const elements: ParsedElement[] = [];
  const connections: ParsedConnection[] = [];
  const warnings: string[] = [];

  // Find the model root — ArchiMate Exchange uses <model> as root
  const model = parsed.model || parsed['archimate:model'] || parsed;

  // Extract elements
  const xmlElements = model?.elements?.element || model?.element || [];
  const arr = Array.isArray(xmlElements) ? xmlElements : [xmlElements];

  const idMap = new Map<string, string>(); // archimate ID → our element ID

  for (const el of arr) {
    if (!el) continue;
    const archiId = el['@_identifier'] || el['@_id'] || `elem-${uuid().slice(0, 8)}`;
    const xsiType = el['@_xsi:type'] || el['@_type'] || '';
    const typeName = xsiType.replace(/^archimate:?/i, '');

    const type = ARCHIMATE_XML_TYPE_MAP[typeName] || normalizeType(typeName);
    if (!TYPE_SET.has(type)) {
      warnings.push(`Element '${el.name || archiId}': Unknown ArchiMate type '${xsiType}' → imported as '${type}'`);
    }

    const elemId = `elem-${uuid().slice(0, 8)}`;
    idMap.set(archiId, elemId);

    // Extract properties
    const props: Record<string, string> = {};
    const xmlProps = el.properties?.property || el.property || [];
    const propsArr = Array.isArray(xmlProps) ? xmlProps : [xmlProps];
    for (const p of propsArr) {
      if (!p) continue;
      const key = p['@_propertyDefinitionRef'] || p['@_key'] || 'unknown';
      const val = p.value?.['#text'] || p.value || p['@_value'] || '';
      props[key] = String(val);
    }

    elements.push({
      id: elemId,
      name: typeof el.name === 'string' ? el.name : el.name?.['#text'] || el['@_name'] || archiId,
      type,
      layer: inferLayer(type),
      description: typeof el.documentation === 'string' ? el.documentation : el.documentation?.['#text'] || '',
      status: 'current',
      riskLevel: 'low',
      maturityLevel: 3,
      properties: Object.keys(props).length > 0 ? props : undefined,
    });
  }

  // Extract relationships
  const xmlRels = model?.relationships?.relationship || model?.relationship || [];
  const relsArr = Array.isArray(xmlRels) ? xmlRels : [xmlRels];

  for (const rel of relsArr) {
    if (!rel) continue;
    const xsiType = rel['@_xsi:type'] || rel['@_type'] || '';
    const relTypeName = xsiType.replace(/^archimate:?/i, '');
    const relType = ARCHIMATE_RELATIONSHIP_MAP[relTypeName] || 'association';

    const sourceRef = rel['@_source'] || '';
    const targetRef = rel['@_target'] || '';
    const sourceId = idMap.get(sourceRef);
    const targetId = idMap.get(targetRef);

    if (!sourceId || !targetId) {
      warnings.push(`Relationship '${rel['@_identifier'] || '?'}': source or target not found — skipped`);
      continue;
    }

    connections.push({
      id: `conn-${uuid().slice(0, 8)}`,
      sourceId,
      targetId,
      type: relType,
      label: typeof rel.name === 'string' ? rel.name : rel['@_name'] || '',
    });
  }

  return { elements, connections, warnings, format: 'archimate-xml' };
}

// ─── JSON Parser ───

export function parseJSON(buffer: Buffer): ParseResult {
  const text = buffer.toString('utf-8');
  // Guard against deeply nested JSON DoS
  let depth = 0;
  let maxDepth = 0;
  for (let i = 0; i < Math.min(text.length, 50000); i++) {
    if (text[i] === '{' || text[i] === '[') { depth++; if (depth > maxDepth) maxDepth = depth; }
    if (text[i] === '}' || text[i] === ']') depth--;
    if (maxDepth > 100) throw new Error('JSON structure too deeply nested (max depth: 100)');
  }
  const data = JSON.parse(text);
  const elements: ParsedElement[] = [];
  const connections: ParsedConnection[] = [];
  const warnings: string[] = [];

  // Accept {elements: [], connections: []} or bare arrays
  const rawElements = Array.isArray(data.elements) ? data.elements : (Array.isArray(data) ? data : []);
  const rawConnections = Array.isArray(data.connections) ? data.connections : [];

  // Early warning if the JSON doesn't look like architecture data
  if (rawElements.length === 0 && !Array.isArray(data.elements) && !Array.isArray(data)) {
    const topKeys = Object.keys(data).slice(0, 5).join(', ');
    warnings.push(`JSON has no "elements" array. Found keys: [${topKeys}]. Expected format: {elements: [...], connections: [...]}`);
  }

  for (let i = 0; i < rawElements.length; i++) {
    const el = rawElements[i];
    const type = normalizeType(el.type || 'application_component');
    if (!TYPE_SET.has(type)) {
      warnings.push(`Element ${i}: Unknown type '${el.type}'`);
    }
    elements.push({
      id: el.id || `elem-${uuid().slice(0, 8)}`,
      name: el.name || `Element ${i + 1}`,
      type,
      layer: el.layer || inferLayer(type),
      description: el.description || '',
      status: el.status || 'current',
      riskLevel: el.riskLevel || 'low',
      maturityLevel: el.maturityLevel || 3,
    });
  }

  for (const c of rawConnections) {
    connections.push({
      id: c.id || `conn-${uuid().slice(0, 8)}`,
      sourceId: c.sourceId || c.source,
      targetId: c.targetId || c.target,
      type: c.type || 'association',
      label: c.label || '',
    });
  }

  return { elements, connections, warnings, format: 'json' };
}

// ─── Master Parse Function ───

export function parseArchitectureFile(buffer: Buffer, filename: string): ParseResult {
  const format = detectFormat(buffer, filename);

  switch (format) {
    case 'csv':
      return parseCSV(buffer.toString('utf-8'));
    case 'excel':
      return parseExcel(buffer);
    case 'archimate-xml':
      return parseArchiMateExchange(buffer);  // Full-fidelity parser (superset of basic)
    case 'leanix': {
      const ext = filename.toLowerCase().split('.').pop() || '';
      if (ext === 'json') return parseLeanIXJSON(buffer);
      return parseLeanIXExcel(buffer);
    }
    case 'json':
      return parseJSON(buffer);
    default:
      throw new Error(`Unsupported file format: '${filename}'. Accepted: CSV, Excel, ArchiMate XML, LeanIX, JSON.`);
  }
}

// ─── Neo4j Graph Creation ───

export async function createTemporaryGraph(parsed: ParseResult): Promise<{ projectId: string; uploadToken: string }> {
  const projectId = `tmp-${uuid()}`;
  const uploadToken = uuid();
  const now = new Date().toISOString();

  const operations: Array<{ query: string; params: Record<string, unknown> }> = [];

  // Create elements
  for (const el of parsed.elements) {
    operations.push({
      query: `CREATE (e:ArchitectureElement {
        id: $id, projectId: $projectId, name: $name, type: $type,
        layer: $layer, description: $description, status: $status,
        riskLevel: $riskLevel, maturityLevel: $maturityLevel,
        createdAt: $now, updatedAt: $now
      })`,
      params: {
        id: el.id, projectId, name: el.name, type: el.type,
        layer: el.layer, description: el.description, status: el.status,
        riskLevel: el.riskLevel, maturityLevel: el.maturityLevel, now,
      },
    });
  }

  // Create connections — resolve name-based references if IDs don't match
  const elementIdSet = new Set(parsed.elements.map((e) => e.id));
  const nameToId = new Map(parsed.elements.map((e) => [e.name.toLowerCase(), e.id]));

  for (const conn of parsed.connections) {
    let sourceId = conn.sourceId;
    let targetId = conn.targetId;

    // Try name lookup if IDs don't match element IDs
    if (!elementIdSet.has(sourceId)) {
      const resolved = nameToId.get(sourceId.toLowerCase());
      if (resolved) sourceId = resolved;
    }
    if (!elementIdSet.has(targetId)) {
      const resolved = nameToId.get(targetId.toLowerCase());
      if (resolved) targetId = resolved;
    }

    operations.push({
      query: `MATCH (s:ArchitectureElement {id: $sourceId, projectId: $projectId})
              MATCH (t:ArchitectureElement {id: $targetId, projectId: $projectId})
              CREATE (s)-[:CONNECTS_TO {
                id: $connId, type: $type, label: $label,
                projectId: $projectId, createdAt: $now
              }]->(t)`,
      params: {
        sourceId, targetId, projectId,
        connId: conn.id, type: conn.type, label: conn.label || '', now,
      },
    });
  }

  // Execute in batches of 100 to avoid huge transactions
  const BATCH_SIZE = 100;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = operations.slice(i, i + BATCH_SIZE);
    await runCypherTransaction(batch);
  }

  return { projectId, uploadToken };
}

// ─── Migration: Temporary → Permanent ───

export async function migrateTemporaryGraph(tempProjectId: string, permanentProjectId: string): Promise<number> {
  // Copy all elements
  const result = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $tempId})
     SET e.projectId = $permId
     WITH e
     OPTIONAL MATCH (e)-[r:CONNECTS_TO {projectId: $tempId}]->()
     SET r.projectId = $permId
     RETURN count(e) as migrated`,
    { tempId: tempProjectId, permId: permanentProjectId },
  );

  return result[0]?.get('migrated')?.toNumber?.() || 0;
}

// ─── Cleanup ───

export async function cleanupTemporaryGraphs(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  const result = await runCypher(
    `MATCH (e:ArchitectureElement)
     WHERE e.projectId STARTS WITH 'tmp-' AND e.createdAt < $cutoff
     DETACH DELETE e
     RETURN count(e) as deleted`,
    { cutoff },
  );

  return result[0]?.get('deleted')?.toNumber?.() || 0;
}
