/**
 * Security-Audit H11: `POST /api/healthcheck/upload` (ohne Login) gab den
 * Upload synchron an `XLSX.read` — ohne Budget für die entpackte Größe. Eine
 * 1,44-MB-xlsx wurde zu 496 MB Sheet-XML, der eine Node-Prozess stand 10,5 s
 * still. Dasselbe Primitiv steckte in den anderen xlsx-Pfaden und im
 * PPTX-Parser (adm-zip). Ein Archiv, das über das Budget entpackt, wird jetzt
 * abgewiesen, BEVOR ein Parser es anfasst.
 */
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';

jest.mock('xlsx', () => {
  const actual = jest.requireActual('xlsx');
  return { ...actual, read: jest.fn(actual.read) };
});

import { parseArchitectureFile } from '../services/upload.service';
import { parseLeanIXExcel } from '../parsers/leanix.adapter';
import { extractText } from '../services/document-parser.service';
import { assertZipWithinBudget } from '../utils/zipBudget';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** ~80 MB entpackt, ~80 KB gepackt. */
function bomb(entryName: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<Types/>'));
  zip.addFile(entryName, Buffer.alloc(80 * 1024 * 1024, 'a'));
  return zip.toBuffer();
}

function realXlsx(): Buffer {
  const ws = XLSX.utils.json_to_sheet([{ name: 'CRM', type: 'application_component', layer: 'application' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Elements');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const readSpy = XLSX.read as unknown as jest.Mock;

describe('Dekompressionsbombe (Security-Audit H11)', () => {
  beforeEach(() => readSpy.mockClear());

  it('rejects an xlsx bomb on the unauthenticated health-check path before XLSX.read — der ganze Zweck', () => {
    const file = bomb('xl/worksheets/sheet1.xml');
    expect(file.length).toBeLessThan(2 * 1024 * 1024);
    expect(() => parseArchitectureFile(file, 'landscape.xlsx')).toThrow(/Archive rejected/);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('rejects the bomb on the LeanIX Excel path', () => {
    expect(() => parseLeanIXExcel(bomb('xl/worksheets/sheet1.xml'))).toThrow(/Archive rejected/);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('rejects xlsx and pptx bombs in the document text extractor', async () => {
    await expect(extractText(bomb('xl/worksheets/sheet1.xml'), XLSX_MIME, 'doc.xlsx')).rejects.toThrow(/Archive rejected/);
    await expect(extractText(bomb('ppt/slides/slide1.xml'), PPTX_MIME, 'deck.pptx')).rejects.toThrow(/Archive rejected/);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('still parses a real xlsx', () => {
    const parsed = parseArchitectureFile(realXlsx(), 'landscape.xlsx');
    expect(parsed.elements.map((e) => e.name)).toContain('CRM');
  });

  it('is not fooled by a forged uncompressed size in the central directory', () => {
    const file = bomb('xl/worksheets/sheet1.xml');
    // Alle "uncompressed size"-Felder im Zentralverzeichnis auf 1 Byte fälschen.
    for (let i = 0; i < file.length - 4; i++) {
      if (file.readUInt32LE(i) === 0x02014b50) file.writeUInt32LE(1, i + 24);
    }
    expect(() => assertZipWithinBudget(file)).toThrow(/Archive rejected/);
  });

  it('rejects data hidden outside the central directory', () => {
    // Ein gültiges, harmloses Archiv — davor ein lokaler Bomben-Eintrag, den
    // das Zentralverzeichnis nicht nennt. Offsets werden korrekt verschoben,
    // damit allein die Abdeckungsprüfung anschlägt.
    const hidden = bomb('hidden.xml');
    const hiddenLocal = hidden.subarray(0, hidden.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])));
    const visible = new AdmZip();
    visible.addFile('a.txt', Buffer.from('ok'));
    const file = Buffer.concat([hiddenLocal, visible.toBuffer()]);
    const shift = hiddenLocal.length;
    for (let i = shift; i < file.length - 4; i++) {
      const sig = file.readUInt32LE(i);
      if (sig === 0x02014b50) file.writeUInt32LE(file.readUInt32LE(i + 42) + shift, i + 42);
      if (sig === 0x06054b50) file.writeUInt32LE(file.readUInt32LE(i + 16) + shift, i + 16);
    }
    expect(() => assertZipWithinBudget(file)).toThrow(/outside its central directory/);
    // Gegenprobe: das harmlose Archiv allein passiert.
    expect(() => assertZipWithinBudget(visible.toBuffer())).not.toThrow();
  });

  it('lets non-zip input through untouched', () => {
    expect(() => assertZipWithinBudget(Buffer.from('name,type\nCRM,application_component'))).not.toThrow();
  });
});
