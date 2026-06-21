/**
 * REQ-PROV-001.5 — Producer-Completeness als statischer Quellcode-Scan (Kollision 3).
 *
 * Codifiziert den manuellen Sweep: JEDER Cypher-Producer, der ein ArchitectureElement
 * oder eine CONNECTS_TO-Relationship erzeugt (CREATE/MERGE), MUSS provenance stempeln.
 * Schlägt fehl, sobald ein künftiger Producer ohne Stempel hinzukommt.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');

// Producer-Dateien (jede erzeugt Elemente und/oder Connections in Neo4j).
const PRODUCER_FILES = [
  'routes/architecture.routes.ts',
  'routes/aiGenerator.routes.ts',
  'routes/blueprint.routes.ts',
  'routes/demo.routes.ts',
  'routes/standards.routes.ts',
  'services/remediation-apply.service.ts',
  'services/upload.service.ts',
  'services/requirementProjection.service.ts',
  'services/policy-to-requirement.service.ts',
  'services/policy-graph.service.ts',
  'services/redundancyResolution.service.ts',
  'services/blueprint.service.ts',
];

const ELEMENT_RE = /(CREATE|MERGE)\s*\(\w+:ArchitectureElement/;
const CONN_RE = /(CREATE|MERGE)\s*\([^)]*\)-\[\w*:CONNECTS_TO/;
const isProducerLine = (l: string) => ELEMENT_RE.test(l) || CONN_RE.test(l);

/** Findet Producer-Blöcke ohne `provenance`. Block = bis zum nächsten Producer (max 40 Zeilen). */
function findGaps(content: string): string[] {
  const lines = content.split('\n');
  const gaps: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isProducerLine(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && end < i + 40 && !isProducerLine(lines[end])) end++;
    const block = lines.slice(i, end).join('\n');
    if (!/provenance/.test(block)) {
      gaps.push(`L${i + 1}: ${lines[i].trim().slice(0, 70)}`);
    }
  }
  return gaps;
}

describe('Provenance-Completeness (REQ-PROV-001.5 / Kollision 3)', () => {
  it.each(PRODUCER_FILES)('%s — jeder Element-/Connection-Producer stempelt provenance', (rel) => {
    const content = fs.readFileSync(path.join(SRC, rel), 'utf8');
    const gaps = findGaps(content);
    expect(gaps).toEqual([]);
  });

  it('erkennt überhaupt Producer (Selbsttest: architecture.routes hat ≥6)', () => {
    const content = fs.readFileSync(path.join(SRC, 'routes/architecture.routes.ts'), 'utf8');
    const count = content.split('\n').filter(isProducerLine).length;
    expect(count).toBeGreaterThanOrEqual(6);
  });

  it('AC-5 — Integrations-Model models/Connection.ts bleibt unangetastet (kein provenance)', () => {
    const content = fs.readFileSync(path.join(SRC, 'models/Connection.ts'), 'utf8');
    expect(content).not.toMatch(/provenance/);
  });
});
