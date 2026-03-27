import type { ArchitectureElement, Connection } from '../stores/architectureStore';
import type { ArchitectureLayer, TOGAFDomain } from '@thearchitect/shared/src/types/architecture.types';
import { ELEMENT_TYPES, LAYER_Y } from '@thearchitect/shared/src/constants/togaf.constants';

// ── CSV parsing helpers ─────────────────────────────────

function generateId(): string {
  return `csv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** RFC 4180 CSV line parser — handles quoted fields with commas and escaped quotes */
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
          i++; // skip escaped quote
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

function parseCSVRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map(parseCSVLine);
}

// ── Type inference maps ─────────────────────────────────

const TYPE_TO_DOMAIN = new Map<string, string>();
const TYPE_TO_LABEL = new Map<string, string>();
for (const et of ELEMENT_TYPES) {
  TYPE_TO_DOMAIN.set(et.type, et.domain);
  TYPE_TO_LABEL.set(et.type, et.label);
}

const DOMAIN_TO_LAYER: Record<string, ArchitectureLayer> = {
  strategy: 'strategy',
  business: 'business',
  data: 'information',
  application: 'application',
  technology: 'technology',
  motivation: 'motivation',
  implementation: 'implementation_migration',
};

const STRATEGY_TYPES = new Set(['business_capability', 'value_stream', 'resource', 'course_of_action']);
const PHYSICAL_TYPES = new Set(['equipment', 'facility', 'distribution_network', 'material']);

function inferLayer(type: string): ArchitectureLayer {
  if (STRATEGY_TYPES.has(type)) return 'strategy';
  if (PHYSICAL_TYPES.has(type)) return 'physical';
  const domain = TYPE_TO_DOMAIN.get(type);
  if (domain && DOMAIN_TO_LAYER[domain]) return DOMAIN_TO_LAYER[domain];
  return 'application';
}

function inferDomain(type: string): TOGAFDomain {
  const domain = TYPE_TO_DOMAIN.get(type);
  return (domain as TOGAFDomain) || 'application';
}

// ── Public interface ────────────────────────────────────

export interface CSVParseResult {
  elements: ArchitectureElement[];
  connections: Connection[];
  warnings: string[];
}

/**
 * Parse a combined CSV file with elements and (optionally) connections separated by
 * a `---CONNECTIONS---` line.
 *
 * **Elements CSV header:**
 * `name,type,layer,togafDomain,description,status,riskLevel,maturityLevel`
 *
 * Only `name` and `type` are required. All others are inferred or defaulted.
 *
 * **Connections CSV header:**
 * `sourceName,targetName,type,label`
 */
export function parseCSV(text: string): CSVParseResult {
  const warnings: string[] = [];
  const separatorIdx = text.indexOf('---CONNECTIONS---');
  const elementsText = separatorIdx >= 0 ? text.slice(0, separatorIdx) : text;
  const connectionsText = separatorIdx >= 0 ? text.slice(separatorIdx + '---CONNECTIONS---'.length) : '';

  // ── Parse elements ──
  const elemRows = parseCSVRows(elementsText);
  if (elemRows.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  const header = elemRows[0].map((h) => h.toLowerCase().replace(/\s+/g, ''));
  const nameIdx = header.indexOf('name');
  const typeIdx = header.indexOf('type');
  if (nameIdx < 0 || typeIdx < 0) {
    throw new Error('CSV header must include "name" and "type" columns');
  }
  const layerIdx = header.indexOf('layer');
  const domainIdx = header.findIndex((h) => h === 'togafdomain' || h === 'domain');
  const descIdx = header.indexOf('description');
  const statusIdx = header.indexOf('status');
  const riskIdx = header.findIndex((h) => h === 'risklevel' || h === 'risk');
  const maturityIdx = header.findIndex((h) => h === 'maturitylevel' || h === 'maturity');

  const elements: ArchitectureElement[] = [];
  const nameToId = new Map<string, string>();
  const layerCounts: Record<string, number> = {};

  for (let i = 1; i < elemRows.length; i++) {
    const row = elemRows[i];
    const name = row[nameIdx];
    const type = row[typeIdx];
    if (!name || !type) {
      warnings.push(`Row ${i + 1}: missing name or type, skipped`);
      continue;
    }

    const layer = (layerIdx >= 0 && row[layerIdx]) ? row[layerIdx] as ArchitectureLayer : inferLayer(type);
    const togafDomain = (domainIdx >= 0 && row[domainIdx]) ? row[domainIdx] as TOGAFDomain : inferDomain(type);
    const description = descIdx >= 0 ? (row[descIdx] || '') : '';
    const status = (statusIdx >= 0 && row[statusIdx]) ? row[statusIdx] as ArchitectureElement['status'] : 'current';
    const riskLevel = (riskIdx >= 0 && row[riskIdx]) ? row[riskIdx] as ArchitectureElement['riskLevel'] : 'low';
    const maturityLevel = maturityIdx >= 0 ? (parseInt(row[maturityIdx]) || 3) : 3;

    const id = generateId();
    nameToId.set(name.trim().toLowerCase(), id);

    layerCounts[layer] = layerCounts[layer] || 0;
    const col = layerCounts[layer]++;
    const spacing = 3;
    const rowSize = 5;
    const x = (col % rowSize) * spacing - ((Math.min(rowSize, layerCounts[layer]) - 1) * spacing) / 2;
    const z = Math.floor(col / rowSize) * spacing;

    elements.push({
      id,
      type,
      name,
      description,
      layer,
      togafDomain,
      maturityLevel,
      riskLevel,
      status,
      position3D: { x, y: LAYER_Y[layer] || 0, z },
      metadata: { source: 'csv' },
    });
  }

  // ── Parse connections ──
  const connections: Connection[] = [];
  if (connectionsText.trim()) {
    const connRows = parseCSVRows(connectionsText);
    if (connRows.length >= 2) {
      const cHeader = connRows[0].map((h) => h.toLowerCase().replace(/\s+/g, ''));
      const srcIdx = cHeader.findIndex((h) => h === 'sourcename' || h === 'source');
      const tgtIdx = cHeader.findIndex((h) => h === 'targetname' || h === 'target');
      const cTypeIdx = cHeader.indexOf('type');
      const cLabelIdx = cHeader.indexOf('label');

      if (srcIdx < 0 || tgtIdx < 0) {
        warnings.push('Connections header must include "sourceName" and "targetName" — connections skipped');
      } else {
        for (let i = 1; i < connRows.length; i++) {
          const row = connRows[i];
          const srcName = row[srcIdx]?.trim().toLowerCase();
          const tgtName = row[tgtIdx]?.trim().toLowerCase();
          if (!srcName || !tgtName) {
            warnings.push(`Connection row ${i + 1}: missing source or target, skipped`);
            continue;
          }

          const sourceId = nameToId.get(srcName);
          const targetId = nameToId.get(tgtName);
          if (!sourceId || !targetId) {
            warnings.push(`Connection row ${i + 1}: "${row[srcIdx]}" → "${row[tgtIdx]}" — element not found, skipped`);
            continue;
          }

          connections.push({
            id: generateId(),
            sourceId,
            targetId,
            type: (cTypeIdx >= 0 && row[cTypeIdx]) ? row[cTypeIdx] : 'association',
            label: cLabelIdx >= 0 ? row[cLabelIdx] : undefined,
          });
        }
      }
    }
  }

  return { elements, connections, warnings };
}

/**
 * Parse two separate CSV strings: one for elements, one for connections.
 */
export function parseCSVSeparate(elementsCSV: string, connectionsCSV: string): CSVParseResult {
  const combined = elementsCSV.trim() + '\n---CONNECTIONS---\n' + connectionsCSV.trim();
  return parseCSV(combined);
}
