/**
 * Security-Audit H11: Dekompressionsbomben bei xlsx/pptx-Uploads.
 *
 * `XLSX.read` und `adm-zip` entpacken synchron und ohne Größenbudget — eine
 * 1,44-MB-xlsx wuchs auf 496 MB Sheet-XML, ~1,56 GB RSS, Event-Loop 10,5 s
 * blockiert; der eine Node-Prozess stand für alle Mandanten. Die Element-
 * Obergrenzen greifen erst nach dem Parsen.
 *
 * Ein reiner Vorab-PRÜFER reicht nicht: Prüfer und Parser lesen ein ZIP
 * unterschiedlich (SheetJS erkennt ZIP schon an "PK" + zwei kleinen Bytes,
 * vertraut den lokalen Headern statt dem Zentralverzeichnis, sucht das
 * Verzeichnis-Ende anders). Deshalb entpackt `sanitizeZip` jeden Eintrag
 * SELBST mit hartem `maxOutputLength` und baut daraus ein neues Archiv mit
 * ausschließlich unkomprimierten ("stored") Einträgen. Der Parser bekommt nur
 * dieses Archiv — er sieht exakt, was hier gezählt wurde, und entpackt nichts.
 * Im ZIP angegebene Größen werden nicht geglaubt; sie sind frei fälschbar.
 */
import zlib from 'zlib';

export const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
export const MAX_ENTRIES = 5000;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const FLAG_UTF8 = 0x0800;

export class ArchiveRejectedError extends Error {
  constructor(reason: string) {
    super(`Archive rejected: ${reason}`);
    this.name = 'ArchiveRejectedError';
  }
}

function findEocd(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

interface Entry {
  name: Buffer;
  utf8: boolean;
  data: Buffer;
}

function readEntries(buffer: Buffer, maxBytes: number, maxEntries: number): Entry[] {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== SIG_LOCAL) throw new ArchiveRejectedError('not a ZIP archive');

  const eocd = findEocd(buffer);
  if (eocd < 0) throw new ArchiveRejectedError('no end of central directory');
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || cdOffset === 0xffffffff) throw new ArchiveRejectedError('ZIP64 is not supported');
  if (entryCount > maxEntries) throw new ArchiveRejectedError(`more than ${maxEntries} entries`);
  if (cdOffset + cdSize > eocd) throw new ArchiveRejectedError('malformed central directory');

  const entries: Entry[] = [];
  let remaining = maxBytes;
  let p = cdOffset;
  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ArchiveRejectedError('malformed central directory entry');
    }
    const flags = buffer.readUInt16LE(p + 8);
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const commentLength = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = Buffer.from(buffer.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;

    if (flags & 0x0001) throw new ArchiveRejectedError('encrypted entries are not supported');
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new ArchiveRejectedError('malformed local header');
    }
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (start + compressedSize > buffer.length) throw new ArchiveRejectedError('entry exceeds file');
    const raw = buffer.subarray(start, start + compressedSize);

    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(raw);
    } else if (method === 8) {
      try {
        data = zlib.inflateRawSync(raw, { maxOutputLength: remaining + 1 });
      } catch (err) {
        if (err instanceof RangeError || (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
          throw new ArchiveRejectedError(`expands beyond ${maxBytes} bytes`);
        }
        throw new ArchiveRejectedError('corrupt deflate stream');
      }
    } else {
      throw new ArchiveRejectedError(`unsupported compression method ${method}`);
    }
    remaining -= data.length;
    if (remaining < 0) throw new ArchiveRejectedError(`expands beyond ${maxBytes} bytes`);
    entries.push({ name, utf8: (flags & FLAG_UTF8) !== 0, data });
  }
  return entries;
}

function buildStoredZip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const crc = zlib.crc32(e.data);
    const flags = e.utf8 ? FLAG_UTF8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(e.name.length, 26);
    locals.push(local, e.name, e.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(0, 10); // stored
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(e.data.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(e.name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, e.name);

    offset += 30 + e.name.length + e.data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

/**
 * Entpackt ein ZIP innerhalb des Budgets und liefert es als neues Archiv mit
 * nur "stored"-Einträgen. Wirft `ArchiveRejectedError` bei allem, was über
 * dem Budget liegt oder kein sauberes ZIP ist.
 */
export function sanitizeZip(
  buffer: Buffer,
  { maxBytes = MAX_UNCOMPRESSED_BYTES, maxEntries = MAX_ENTRIES } = {},
): Buffer {
  return buildStoredZip(readEntries(buffer, maxBytes, maxEntries));
}

/**
 * Für `XLSX.read`: alles, was SheetJS als ZIP lesen würde (beginnt mit "PK"),
 * läuft durch `sanitizeZip`; CSV, altes XLS (CFB) und Text bleiben unverändert.
 */
export function sanitizeSpreadsheet(buffer: Buffer): Buffer {
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b ? sanitizeZip(buffer) : buffer;
}
