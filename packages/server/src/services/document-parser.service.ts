/**
 * Document Parser Service
 * Extracts text content from PDF, Excel (XLSX/XLS), and PowerPoint (PPTX) files.
 */
import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
import AdmZip from 'adm-zip';

// pdf-parse compatibility — supports both v1 (function) and v2 (class)
const pdfParseModule = require('pdf-parse');

async function pdfParse(buffer: Buffer): Promise<{ text: string }> {
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
      const items = await parser.doc.getPage(i).then((page: any) => page.getTextContent());
      text += items.items.map((item: any) => item.str).join(' ') + '\n';
    } catch {
      // Skip pages that fail to parse
    }
  }
  return { text };
}

// ─── PDF ───

async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text || '';
}

// ─── Excel ───

function extractExcelText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    lines.push(`--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    // Convert to array of arrays, then join cells
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
    for (const row of rows) {
      const cells = row.map((c) => (c != null ? String(c).trim() : '')).filter(Boolean);
      if (cells.length > 0) lines.push(cells.join(' | '));
    }
  }

  return lines.join('\n');
}

// ─── PowerPoint (PPTX) ───
// PPTX files are ZIP archives containing XML slides.
// We extract text from slide XML files.

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  // ignoreAttributes: true strips XML metadata, only keeping element content
  const parser = new XMLParser({ ignoreAttributes: true });

  const slideTexts: string[] = [];

  for (const entry of entries) {
    // Slide content is in ppt/slides/slideN.xml
    if (entry.entryName.match(/^ppt\/slides\/slide\d+\.xml$/)) {
      const xml = entry.getData().toString('utf8');
      const parsed = parser.parse(xml);
      const texts = collectTextNodes(parsed);
      if (texts.length > 0) {
        slideTexts.push(`--- Slide ${entry.entryName.match(/\d+/)?.[0]} ---`);
        slideTexts.push(texts.join('\n'));
      }
    }
  }

  return slideTexts.join('\n');
}

/**
 * Recursively collect only `a:t` text nodes from parsed PPTX XML.
 * In OOXML, `a:t` is the element containing actual slide text content.
 */
function collectTextNodes(node: unknown): string[] {
  const texts: string[] = [];

  if (Array.isArray(node)) {
    for (const item of node) texts.push(...collectTextNodes(item));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'a:t') {
        // a:t can be a string or number
        const text = String(value).trim();
        if (text) texts.push(text);
      } else {
        texts.push(...collectTextNodes(value));
      }
    }
  }

  return texts;
}

// ─── Public API ───

const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
]);

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.pptx']);

export function isSupportedDocument(mimetype: string, filename: string): boolean {
  if (SUPPORTED_MIMES.has(mimetype)) return true;
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return SUPPORTED_EXTENSIONS.has(ext);
}

export async function extractText(buffer: Buffer, mimetype: string, filename: string): Promise<string> {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));

  if (mimetype === 'application/pdf' || ext === '.pdf') {
    return extractPdfText(buffer);
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimetype === 'application/vnd.ms-excel' ||
    ext === '.xlsx' || ext === '.xls'
  ) {
    return extractExcelText(buffer);
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    ext === '.pptx'
  ) {
    return extractPptxText(buffer);
  }

  throw new Error(`Unsupported file type: ${mimetype} (${filename})`);
}

export function getSupportedFormats(): string {
  return 'PDF, Excel (.xlsx, .xls), PowerPoint (.pptx)';
}
