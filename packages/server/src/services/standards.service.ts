// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseModule = require('pdf-parse');
import { getOrCreatePipelineState } from './compliance-pipeline.service';

/**
 * Wrapper that works with both pdf-parse v1 (function) and v2 (PDFParse class).
 * Returns { text: string, numpages: number }.
 */
async function pdfParse(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  // v1 API: module exports a function directly
  if (typeof pdfParseModule === 'function') {
    return pdfParseModule(buffer);
  }
  // v2 API: module exports { PDFParse } class
  const PDFParse = pdfParseModule.PDFParse;
  if (!PDFParse) throw new Error('pdf-parse module has no usable export');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  await parser.load();
  const numPages = parser.doc?.numPages || 0;
  let text = '';
  for (let i = 1; i <= numPages; i++) {
    try {
      const items = await parser.doc.getPage(i).then((page: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => page.getTextContent());
      text += items.items.map((item: { str: string }) => item.str).join(' ') + '\n';
    } catch {
      // Skip pages that fail to parse
    }
  }
  return { text, numpages: numPages };
}
import { randomUUID } from 'crypto';
import { Standard, IStandard, IStandardSection } from '../models/Standard';
import { StandardMapping, IStandardMapping } from '../models/StandardMapping';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';

// ─── PDF Parsing ───

interface ParsedSection {
  title: string;
  number: string;
  content: string;
  level: number;
}

function parseSections(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  // Match lines starting with section numbers like "6.4.2 Title" or "Part 3: Title"
  const sectionRegex = /^(\d+(?:\.\d+)*)\s+(.+)/gm;
  const partRegex = /^(Part\s+\d+)[:\s]+(.+)/gim;

  const matches: { index: number; number: string; title: string; level: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(text)) !== null) {
    const num = match[1];
    const level = num.split('.').length;
    matches.push({ index: match.index, number: num, title: match[2].trim(), level });
  }

  while ((match = partRegex.exec(text)) !== null) {
    matches.push({ index: match.index, number: match[1], title: match[2].trim(), level: 0 });
  }

  // Sort by position in text
  matches.sort((a, b) => a.index - b.index);

  // Extract content between sections
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();

    sections.push({
      title: matches[i].title,
      number: matches[i].number,
      content: content.slice(0, 5000), // Cap per section
      level: matches[i].level,
    });
  }

  // If no sections detected, create a single section with the full text
  if (sections.length === 0 && text.trim().length > 0) {
    sections.push({
      title: 'Full Document',
      number: '1',
      content: text.slice(0, 10000),
      level: 1,
    });
  }

  return sections;
}

export interface StandardMetadata {
  name: string;
  version: string;
  type: 'iso' | 'aspice' | 'togaf' | 'custom';
  description?: string;
}

export async function parseAndStore(
  projectId: string,
  fileBuffer: Buffer,
  metadata: StandardMetadata,
  userId: string,
): Promise<IStandard> {
  const pdf = await pdfParse(fileBuffer);

  const fullText = pdf.text.slice(0, 100000); // Cap at 100k chars
  const parsedSections = parseSections(pdf.text);

  const sections: IStandardSection[] = parsedSections.map((s) => ({
    id: randomUUID(),
    title: s.title,
    number: s.number,
    content: s.content,
    level: s.level,
  })) as IStandardSection[];

  const standard = await Standard.create({
    projectId,
    name: metadata.name,
    version: metadata.version,
    type: metadata.type,
    description: metadata.description || '',
    sections,
    fullText,
    pageCount: pdf.numpages,
    uploadedBy: userId,
  });

  // Create pipeline state so PhaseBar can track progress immediately
  await getOrCreatePipelineState(projectId, String(standard._id));

  return standard;
}

// ─── CRUD ───

export async function getStandards(projectId: string) {
  return Standard.find({ projectId })
    .select('-fullText -sections.content')
    .sort({ createdAt: -1 });
}

export async function getStandard(standardId: string) {
  return Standard.findById(standardId);
}

export async function deleteStandard(standardId: string) {
  await StandardMapping.deleteMany({ standardId });
  return Standard.findByIdAndDelete(standardId);
}

// ─── Mappings ───

export async function getMappings(projectId: string, standardId: string) {
  return StandardMapping.find({ projectId, standardId }).sort({ sectionNumber: 1 });
}

export interface MatrixCell {
  sectionId: string;
  sectionNumber: string;
  sectionTitle: string;
  layer: string;
  total: number;
  compliant: number;
  partial: number;
  gap: number;
  notApplicable: number;
}

export async function getMappingMatrix(
  projectId: string,
  standardId: string,
  sectionIds?: string[],
): Promise<{ cells: MatrixCell[]; layers: string[]; sections: { id: string; number: string; title: string }[] }> {
  const standard = await Standard.findById(standardId);
  if (!standard) throw new Error('Standard not found');

  let sections = standard.sections;
  if (sectionIds && sectionIds.length > 0) {
    sections = sections.filter((s) => sectionIds.includes(s.id));
  }

  // Get architecture elements to determine layers
  const elementRecords = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN DISTINCT e.layer as layer`,
    { projectId },
  );
  const layers = elementRecords
    .map((r) => String(serializeNeo4jProperties(r.toObject()).layer || ''))
    .filter(Boolean);

  const layerOrder = ['strategy', 'business', 'information', 'application', 'technology'];
  layers.sort((a, b) => {
    const ai = layerOrder.indexOf(a);
    const bi = layerOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Get all mappings
  const mappings = await StandardMapping.find({ projectId, standardId });

  // Build matrix
  const cells: MatrixCell[] = [];
  for (const section of sections) {
    for (const layer of layers) {
      const sectionMappings = mappings.filter(
        (m) => m.sectionId === section.id && m.elementLayer === layer,
      );
      cells.push({
        sectionId: section.id,
        sectionNumber: section.number,
        sectionTitle: section.title,
        layer,
        total: sectionMappings.length,
        compliant: sectionMappings.filter((m) => m.status === 'compliant').length,
        partial: sectionMappings.filter((m) => m.status === 'partial').length,
        gap: sectionMappings.filter((m) => m.status === 'gap').length,
        notApplicable: sectionMappings.filter((m) => m.status === 'not_applicable').length,
      });
    }
  }

  return {
    cells,
    layers,
    sections: sections.map((s) => ({ id: s.id, number: s.number, title: s.title })),
  };
}

export async function upsertMapping(data: {
  projectId: string;
  standardId: string;
  sectionId: string;
  sectionNumber: string;
  elementId: string;
  elementName: string;
  elementLayer: string;
  status: 'compliant' | 'partial' | 'gap' | 'not_applicable';
  notes?: string;
  source?: 'ai' | 'manual';
  confidence?: number;
  createdBy: string;
}): Promise<IStandardMapping> {
  const mapping = await StandardMapping.findOneAndUpdate(
    {
      standardId: data.standardId,
      sectionId: data.sectionId,
      elementId: data.elementId,
    },
    {
      $set: {
        projectId: data.projectId,
        sectionNumber: data.sectionNumber,
        elementName: data.elementName,
        elementLayer: data.elementLayer,
        status: data.status,
        notes: data.notes || '',
        source: data.source || 'manual',
        confidence: data.confidence || 0,
        createdBy: data.createdBy,
      },
    },
    { upsert: true, new: true },
  );
  return mapping;
}

export async function bulkCreateMappings(
  mappings: {
    projectId: string;
    standardId: string;
    sectionId: string;
    sectionNumber: string;
    elementId: string;
    elementName: string;
    elementLayer: string;
    status: 'compliant' | 'partial' | 'gap' | 'not_applicable';
    notes: string;
    source: 'ai' | 'manual';
    confidence: number;
    createdBy: string;
  }[],
): Promise<number> {
  if (mappings.length === 0) return 0;

  const ops = mappings.map((m) => ({
    updateOne: {
      filter: { standardId: m.standardId, sectionId: m.sectionId, elementId: m.elementId },
      update: { $set: m } as Record<string, unknown>,
      upsert: true,
    },
  }));

  const result = await StandardMapping.bulkWrite(ops as Parameters<typeof StandardMapping.bulkWrite>[0]);
  return result.upsertedCount + result.modifiedCount;
}

export async function deleteMapping(mappingId: string) {
  return StandardMapping.findByIdAndDelete(mappingId);
}
