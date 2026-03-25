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

// ═══════════════════════════════════════════════════════════════════════════
// Stage 0: Normalize poorly-extracted PDF text (re-insert line breaks)
// ═══════════════════════════════════════════════════════════════════════════
// Some PDF extractors (pdf-parse v2, or certain PDF structures) produce text
// with very few newlines — entire pages on a single line. The line-based
// regexes (^) in later stages never match. This stage detects that situation
// and re-inserts newlines at section boundaries.

function normalizePdfText(text: string): string {
  const lines = text.split('\n');
  const avgLineLength = text.length / Math.max(lines.length, 1);

  // If average line is short (<300 chars), text is already well-structured
  if (avgLineLength < 300) return text;

  let result = text;

  // Insert newline before ToC entries: dotted leaders followed by page numbers
  // "...........13  5.2.4" → "...........13\n5.2.4"
  result = result.replace(/(\.{3,}\s*\d{1,4})\s{2,}(?=\d)/g, '$1\n');

  // Insert newline before section numbers preceded by 2+ spaces
  // "blah blah   6.4.1   Title" → "blah blah\n6.4.1   Title"
  // Also handles trailing dots: "blah   3.1.   Title" (ASPICE format)
  result = result.replace(/\s{2,}(\d+(?:\.\d+)+\.?)\s{2,}/g, '\n$1 ');

  // Insert newline before top-level section numbers (1-9) preceded by 2+ spaces and followed by title
  // "...1  2   Normative references" → "...1\n2   Normative references"
  result = result.replace(/\s{2,}([1-9])\s{3,}([A-Z])/g, '\n$1 $2');

  // Insert newline before "Annex X" patterns
  result = result.replace(/\s{2,}(Annex\s+[A-Z])\s/g, '\n$1 ');

  // Insert newline before "Part N:" patterns
  result = result.replace(/\s{2,}(Part\s+\d+)/gi, '\n$1');

  // Insert newline after page-end markers (copyright/license lines mid-text)
  result = result.replace(/(Restrictions apply\.)\s*/g, '$1\n');
  result = result.replace(/(© ISO\/IEC \d{4}[^\n]{0,30})\s{2,}/g, '$1\n');

  // ASPICE: Strip VDA page headers and break into lines
  // Pattern: "©   VDA Quality Management Center   15  PUBLIC PUBLIC  3.1. Title"
  result = result.replace(/©\s+VDA Quality Management Center\s+\d+\s+PUBLIC\s+PUBLIC\s+/g, '\n');

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 1: Clean raw PDF text (removes per-page noise)
// ═══════════════════════════════════════════════════════════════════════════

function cleanPdfText(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const s = line.trim();
      // IEEE/ISO license footers (appear on every page of licensed PDFs)
      if (s.includes('Authorized licensed use limited to')) return false;
      // Copyright lines (ISO, IEEE, VDA)
      if (/^©\s*(ISO|IEEE|VDA)/i.test(s)) return false;
      // Standalone page numbers (1-3 digits, possibly with BOM/control chars)
      if (/^[\s\u0008\uFEFF]*\d{1,3}[\s\u0008\uFEFF]*$/.test(s)) return false;
      return true;
    })
    .map((line) => line.replace(/[\u0008\uFEFF]/g, ''))
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 2: Extract section headings from ToC (source of truth for titles)
// ═══════════════════════════════════════════════════════════════════════════

function extractTocHeadings(text: string): Map<string, string> {
  const headings = new Map<string, string>();

  // CRITICAL: Use [ \t]+ (horizontal whitespace only), NOT \s+
  // \s+ matches newlines, causing cross-line matches like:
  //   "6.4\n\n6.1.2 Supply process...32" → num="6.4", title="6.1.2 Supply process"

  // Dotted ToC entries: "6.4.1 Business or mission analysis process...........59"
  // Also handles trailing dots: "3.1.   Process reference model .......15" (ASPICE format)
  const tocRegex = /^(\d+(?:\.\d+)*)\.?[ \t]+(.+?)\.{3,}[ \t]*\d+/gm;
  let match: RegExpExecArray | null;
  while ((match = tocRegex.exec(text)) !== null) {
    headings.set(match[1], match[2].trim());
  }

  // Top-level sections: "1  Scope.............1"
  const topRegex = /^([1-9])[ \t]+(.+?)\.{3,}[ \t]*\d+/gm;
  while ((match = topRegex.exec(text)) !== null) {
    if (!headings.has(match[1])) {
      headings.set(match[1], match[2].trim());
    }
  }

  // Annex entries: "Annex A (normative) Tailoring process....101"
  const annexRegex = /^(Annex[ \t]+[A-Z])[ \t]+\([^)]+\)[ \t]+(.+?)\.{3,}/gm;
  while ((match = annexRegex.exec(text)) !== null) {
    headings.set(match[1], match[2].trim());
  }

  return headings;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 3: Strip the ToC block from text (prevents duplicate matches)
// ═══════════════════════════════════════════════════════════════════════════

function stripToc(text: string): string {
  const lines = text.split('\n');
  let tocStart: number | null = null;
  let tocEnd: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    // ToC lines have long dotted leaders (..........)
    if (/\.{5,}/.test(lines[i])) {
      if (tocStart === null) tocStart = Math.max(0, i - 3);
      tocEnd = i;
    }
  }

  if (tocStart !== null && tocEnd !== null) {
    return [...lines.slice(0, tocStart), ...lines.slice(tocEnd + 1)].join('\n');
  }
  return text;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 4: Locate section positions in body text using ToC as guide
// ═══════════════════════════════════════════════════════════════════════════

function findSectionPositions(
  text: string,
  tocHeadings: Map<string, string>,
): { index: number; number: string; title: string; level: number }[] {
  const positions: { index: number; number: string; title: string; level: number }[] = [];
  const found = new Set<string>();

  for (const [num, title] of tocHeadings) {
    const escapedNum = num.replace(/\./g, '\\.');
    // Escape regex special chars in title, take first 20 chars for matching
    const escapedTitle = title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Try 1: same-line match (number and title on one line)
    // Use [ \t]+ to avoid crossing lines
    // \.? allows optional trailing dot (ASPICE: "3.1.   Title")
    const sameLineRegex = new RegExp(`^${escapedNum}\\.?[ \\t]+${escapedTitle}`, 'gm');
    const sameMatch = sameLineRegex.exec(text);
    if (sameMatch) {
      positions.push({
        index: sameMatch.index,
        number: num,
        title,
        level: num.split('.').length,
      });
      found.add(num);
      continue;
    }

    // Try 2: standalone number on its own line (common in pdf-parse output)
    const aloneRegex = new RegExp(`^${escapedNum}\\.?\\s*$`, 'gm');
    const aloneMatch = aloneRegex.exec(text);
    if (aloneMatch) {
      positions.push({
        index: aloneMatch.index,
        number: num,
        title, // Use the ToC title (body title is on a separate line)
        level: num.split('.').length,
      });
      found.add(num);
    }
  }

  // Detect subsections not in ToC (e.g. 6.1.1.1 Purpose, 6.1.1.2 Outcomes)
  const knownSubTitles = ['Purpose', 'Outcomes', 'Activities and tasks'];
  for (const subTitle of knownSubTitles) {
    const escapedSub = subTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const subRegex = new RegExp(`^(\\d+(?:\\.\\d+){3,})[ \\t]+${escapedSub}\\s*$`, 'gm');
    let m: RegExpExecArray | null;
    while ((m = subRegex.exec(text)) !== null) {
      const subNum = m[1];
      if (!found.has(subNum)) {
        positions.push({
          index: m.index,
          number: subNum,
          title: subTitle,
          level: subNum.split('.').length,
        });
        found.add(subNum);
      }
    }
  }

  // Pattern B: number alone on a line, title on a following line
  const aloneSubRegex = /^(\d+(?:\.\d+){3,})\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = aloneSubRegex.exec(text)) !== null) {
    const subNum = m[1];
    if (found.has(subNum)) continue;

    // Look ahead up to 200 chars for a known sub-title
    const lookAhead = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
    const titleMatch = lookAhead.match(/^\s*(Purpose|Outcomes|Activities and tasks)\s*$/m);
    if (titleMatch) {
      positions.push({
        index: m.index,
        number: subNum,
        title: titleMatch[1],
        level: subNum.split('.').length,
      });
      found.add(subNum);
    }
  }

  return positions;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 5: Deduplicate (keep last occurrence = body, not stray refs)
// ═══════════════════════════════════════════════════════════════════════════

function deduplicateSections(
  positions: { index: number; number: string; title: string; level: number }[],
): { index: number; number: string; title: string; level: number }[] {
  const sorted = [...positions].sort((a, b) => a.index - b.index);
  const seen = new Map<string, (typeof positions)[0]>();

  for (const pos of sorted) {
    seen.set(pos.number, pos); // last write wins
  }

  return [...seen.values()].sort((a, b) => a.index - b.index);
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 6: Slice content between section boundaries
// ═══════════════════════════════════════════════════════════════════════════

function extractContent(
  text: string,
  sections: { index: number; number: string; title: string; level: number }[],
): ParsedSection[] {
  const result: ParsedSection[] = [];

  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].index;
    const end = i + 1 < sections.length ? sections[i + 1].index : text.length;
    let content = text.slice(start, end).trim();

    // Remove residual noise inside content
    content = content.replace(/Authorized licensed.*?Restrictions apply\./gs, '');
    content = content.replace(/©\s*(ISO|IEEE)[^\n]*/g, '');
    content = content.trim();

    result.push({
      title: sections[i].title.slice(0, 500),
      number: sections[i].number,
      content: content.slice(0, 5000),
      level: sections[i].level,
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 7: Aggregate child content into parent sections
// ═══════════════════════════════════════════════════════════════════════════

function aggregateChildContent(sections: ParsedSection[]): ParsedSection[] {
  for (const section of sections) {
    if (section.content.length >= 100) continue;

    const prefix = section.number + '.';
    const children = sections.filter(
      (s) => s.number.startsWith(prefix) && s.number !== section.number,
    );

    if (children.length > 0) {
      const aggregated = children
        .map((c) => `[${c.title}]\n${c.content}`)
        .join('\n\n');
      section.content = (section.content + '\n\n' + aggregated).trim().slice(0, 5000);
    }
  }

  return sections;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

function parseSections(text: string): ParsedSection[] {
  // Stage 0: Normalize poorly-extracted text (re-insert line breaks)
  const normalizedText = normalizePdfText(text);

  // Stage 1: Clean raw PDF text
  const cleanedText = cleanPdfText(normalizedText);

  // Stage 2: Extract section titles from ToC (before stripping it)
  const tocHeadings = extractTocHeadings(cleanedText);

  // If we found a ToC, use the smart ToC-driven parser
  if (tocHeadings.size > 0) {
    // Stage 3: Strip the ToC block
    const bodyText = stripToc(cleanedText);

    // Stage 4: Find section positions
    const positions = findSectionPositions(bodyText, tocHeadings);

    // Stage 5: Deduplicate
    const deduped = deduplicateSections(positions);

    // Stage 6: Extract content
    let sections = extractContent(bodyText, deduped);

    // Stage 7: Aggregate child content
    sections = aggregateChildContent(sections);

    if (sections.length > 0) return sections;
  }

  // Fallback: no ToC detected — use improved regex-only parser
  return parseSectionsFallback(cleanedText);
}

// ═══════════════════════════════════════════════════════════════════════════
// Fallback: regex-only parser for documents without a ToC
// ═══════════════════════════════════════════════════════════════════════════

function parseSectionsFallback(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const matches: { index: number; number: string; title: string; level: number }[] = [];

  // Require title to start with uppercase letter (filters noise)
  const sectionRegex = /^(\d+(?:\.\d+)+)[ \t]+([A-Z][A-Za-z].{2,})$/gm;
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(text)) !== null) {
    const title = match[2].trim();
    // Filter remaining noise patterns
    if (/^[\.\s\d…]+$/.test(title)) continue;
    if (title.length < 3) continue;
    if (/^(to \d|NOTE\s|IEEE Xplore|Restrictions)/.test(title)) continue;

    matches.push({
      index: match.index,
      number: match[1],
      title,
      level: match[1].split('.').length,
    });
  }

  // Top-level sections (1 Scope, 2 Normative references...)
  const topRegex = /^([1-9])[ \t]+([A-Z][A-Za-z].{2,})$/gm;
  while ((match = topRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      number: match[1],
      title: match[2].trim(),
      level: 1,
    });
  }

  // Part sections (Part 1: Title)
  const partRegex = /^(Part\s+\d+)[:\s]+(.+)/gim;
  while ((match = partRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      number: match[1],
      title: match[2].trim(),
      level: 0,
    });
  }

  // Deduplicate (keep last occurrence)
  const seen = new Map<string, (typeof matches)[0]>();
  for (const m of matches.sort((a, b) => a.index - b.index)) {
    seen.set(m.number, m);
  }
  const deduped = [...seen.values()].sort((a, b) => a.index - b.index);

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : text.length;
    let content = text.slice(start, end).trim();
    content = content.replace(/Authorized licensed.*?Restrictions apply\./gs, '');
    content = content.replace(/©\s*(ISO|IEEE)[^\n]*/g, '');

    sections.push({
      title: deduped[i].title.slice(0, 500),
      number: deduped[i].number,
      content: content.trim().slice(0, 5000),
      level: deduped[i].level,
    });
  }

  // Aggregate children for thin parents
  for (const section of sections) {
    if (section.content.length >= 100) continue;
    const prefix = section.number + '.';
    const children = sections.filter(
      (s) => s.number.startsWith(prefix) && s.number !== section.number,
    );
    if (children.length > 0) {
      const aggregated = children
        .map((c) => `[${c.title}]\n${c.content}`)
        .join('\n\n');
      section.content = (section.content + '\n\n' + aggregated).trim().slice(0, 5000);
    }
  }

  // Ultimate fallback
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
