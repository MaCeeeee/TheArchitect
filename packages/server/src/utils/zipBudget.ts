/**
 * Security-Audit H11: Dekompressionsbomben bei xlsx/pptx-Uploads.
 *
 * `XLSX.read` und `adm-zip` entpacken synchron und ohne Größenbudget — eine
 * 1,44-MB-xlsx wuchs auf 496 MB Sheet-XML, ~1,56 GB RSS, Event-Loop 10,5 s
 * blockiert; der eine Node-Prozess stand für alle Mandanten. Die Element-
 * Obergrenzen greifen erst nach dem Parsen.
 *
 * Dieser Prüfer läuft VOR dem Parser: er liest das Zentralverzeichnis und
 * entpackt jeden Eintrag selbst mit hartem `maxOutputLength`. Die im ZIP
 * angegebenen Größen werden nicht geglaubt — sie sind frei fälschbar. Bytes,
 * die kein Eintrag des Verzeichnisses abdeckt, werden abgewiesen, damit kein
 * Parser versteckte lokale Einträge findet, die hier niemand gezählt hat.
 */
import zlib from 'zlib';

export const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
export const MAX_ENTRIES = 5000;
const UNCOVERED_SLACK_BYTES = 64 * 1024;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

export class ArchiveTooLargeError extends Error {
  constructor(reason: string) {
    super(`Archive rejected: ${reason}`);
    this.name = 'ArchiveTooLargeError';
  }
}

export function isZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === SIG_LOCAL;
}

function findEocd(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/**
 * Wirft `ArchiveTooLargeError`, wenn ein ZIP mehr als `maxBytes` entpackt,
 * zu viele Einträge hat oder nicht sauber lesbar ist. Nicht-ZIP-Eingaben
 * (CSV, altes XLS, JSON) passieren unverändert.
 */
export function assertZipWithinBudget(
  buffer: Buffer,
  { maxBytes = MAX_UNCOMPRESSED_BYTES, maxEntries = MAX_ENTRIES } = {},
): void {
  if (!isZip(buffer)) return;

  const eocd = findEocd(buffer);
  if (eocd < 0) throw new ArchiveTooLargeError('no end of central directory');
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (entryCount === 0xffff || cdOffset === 0xffffffff) throw new ArchiveTooLargeError('ZIP64 is not supported');
  if (entryCount > maxEntries) throw new ArchiveTooLargeError(`more than ${maxEntries} entries`);
  if (cdOffset + cdSize > eocd) throw new ArchiveTooLargeError('malformed central directory');

  let remaining = maxBytes;
  let covered = cdSize + 22 + commentLength;
  let p = cdOffset;
  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > buffer.length || buffer.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ArchiveTooLargeError('malformed central directory entry');
    }
    const flags = buffer.readUInt16LE(p + 8);
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extraLength = buffer.readUInt16LE(p + 30);
    const entryCommentLength = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    p += 46 + nameLength + extraLength + entryCommentLength;

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new ArchiveTooLargeError('malformed local header');
    }
    const localHeaderLength = 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + localHeaderLength;
    if (start + compressedSize > buffer.length) throw new ArchiveTooLargeError('entry exceeds file');
    const data = buffer.subarray(start, start + compressedSize);
    covered += localHeaderLength + compressedSize + (flags & 0x08 ? 16 : 0);

    let size: number;
    if (method === 0) {
      size = data.length;
    } else if (method === 8) {
      try {
        size = zlib.inflateRawSync(data, { maxOutputLength: remaining + 1 }).length;
      } catch (err) {
        if (err instanceof RangeError || (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
          throw new ArchiveTooLargeError(`expands beyond ${maxBytes} bytes`);
        }
        throw new ArchiveTooLargeError('corrupt deflate stream');
      }
    } else {
      throw new ArchiveTooLargeError(`unsupported compression method ${method}`);
    }
    remaining -= size;
    if (remaining < 0) throw new ArchiveTooLargeError(`expands beyond ${maxBytes} bytes`);
  }

  if (buffer.length - covered > UNCOVERED_SLACK_BYTES) {
    throw new ArchiveTooLargeError('contains data outside its central directory');
  }
}
