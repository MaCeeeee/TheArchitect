/**
 * THE-685 (REQ-CANON-001.3a): Formex v4 aus CELLAR holen — mit Ablage.
 *
 * ── Warum CELLAR und nicht EUR-Lex ──
 * EUR-Lex drosselt unsere IP seit dem 14.08. mit HTTP 202 und LEEREM Body.
 * CELLAR ist ein anderer Host mit anderer Sperre: im Pre-Flight am 15.08. lief
 * er mit HTTP 200 durch, während EUR-Lex gleichzeitig zu war.
 *
 * ── Warum die Adresse aufgelöst und nicht gebaut wird ──
 * Die naheliegende Form `…/resource/celex/{CELEX}.{LANG}.fmx4` funktioniert
 * für einen Teil der Rechtsakte (DORA, NIS2, MDR) und antwortet für andere mit
 * HTTP 404 — für die DSGVO etwa, die nachweislich eine Formex-Fassung HAT.
 * Am 15.08. hätte dieser 404 beinahe als „kein Formex vorhanden" gezählt und
 * das Vorhaben fälschlich beendet.
 *
 * Deshalb wird die Adresse beim Amt ERFRAGT statt geraten: eine SPARQL-Anfrage
 * an CELLAR nennt zu CELEX + Sprache die Manifestation vom Typ `fmx4`, die
 * dann mit `Accept: application/zip` geholt wird. Die alte Form bleibt als
 * Rückfall — welcher Weg getragen hat, steht in `route`, damit ein stiller
 * Wechsel nicht als Messergebnis durchgeht.
 *
 * ── Ablage (AC-3) ──
 * Jede geholte Fassung landet als ZIP im Cache. Die spätere Parser-Arbeit
 * läuft mit `allowNetwork: false` gegen diese Ablage — sonst hängt jeder
 * Testlauf an einer fremden Drossel.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AdmZip from 'adm-zip';

/** Ontologie-Sprachkennung → CELLAR-Sprachcode (ISO 639-2/B, dreistellig). */
export const CELLAR_LANGUAGE: Record<string, string> = { de: 'DEU', en: 'ENG' };

/** Unter dieser Größe ist eine Antwort kein Gesetz, sondern eine Fehlerseite. */
export const MIN_FORMEX_ZIP_BYTES = 2_000;

export class FormexFetchError extends Error {
  constructor(
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'FormexFetchError';
  }
}

/** CELLAR-Abfragedienst — nennt zu einem CELEX die vorhandenen Manifestationen. */
export const CELLAR_SPARQL_URL = 'http://publications.europa.eu/webapi/rdf/sparql';

export function buildCellarUrl(celex: string, language: string): string {
  const lang = CELLAR_LANGUAGE[language];
  if (!lang) throw new FormexFetchError(`Keine CELLAR-Sprachkennung für '${language}'.`);
  return `http://publications.europa.eu/resource/celex/${celex}.${lang}.fmx4`;
}

/**
 * Fragt: „Welche Formex-Fassung gibt es zu diesem Gesetz in dieser Sprache?"
 * Der CELEX wird streng geprüft, bevor er in die Abfrage geht — er stammt zwar
 * aus unserer eigenen Konfiguration, aber eine Abfrage aus zusammengesetztem
 * Text prüft man dort, wo sie entsteht, nicht dort, wo sie herkommt.
 */
export function buildManifestationQuery(celex: string, language: string): string {
  // Sektor (1) + Jahr (4) + Deskriptor (R/L/D…) + laufende Nummer (4),
  // z. B. `32016R0679`. Alles andere wird nicht durchgereicht.
  if (!/^[0-9]{5}[A-Z]{1,2}[0-9]{4}$/.test(celex)) {
    throw new FormexFetchError(`Kein wohlgeformter CELEX: '${celex}'`);
  }
  const lang = CELLAR_LANGUAGE[language];
  if (!lang) throw new FormexFetchError(`Keine CELLAR-Sprachkennung für '${language}'.`);
  return [
    'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
    'SELECT ?m WHERE {',
    ` ?w cdm:resource_legal_id_celex "${celex}"^^<http://www.w3.org/2001/XMLSchema#string> .`,
    ' ?e cdm:expression_belongs_to_work ?w ;',
    `    cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/${lang}> .`,
    ' ?m cdm:manifestation_manifests_expression ?e ;',
    '    cdm:manifestation_type ?type .',
    ' FILTER(STR(?type) = "fmx4")',
    '} ORDER BY ?m',
  ].join('\n');
}

/** Manifestations-Adressen aus der SPARQL-Antwort — sortiert, damit die Wahl reproduzierbar ist. */
export function parseManifestationResults(json: unknown): string[] {
  const bindings = (json as { results?: { bindings?: Array<{ m?: { value?: string } }> } })?.results?.bindings ?? [];
  return bindings
    .map((b) => b.m?.value)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .sort();
}

export async function resolveFormexManifestations(
  celex: string,
  language: string,
  timeoutMs = 60_000
): Promise<string[]> {
  const url = `${CELLAR_SPARQL_URL}?query=${encodeURIComponent(buildManifestationQuery(celex, language))}&format=${encodeURIComponent('application/sparql-results+json')}`;
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new FormexFetchError(`CELLAR-Abfrage antwortete HTTP ${res.status}`, `${celex}.${language}`);
  return parseManifestationResults(await res.json());
}

export function cacheFileName(celex: string, language: string): string {
  return `${celex}.${CELLAR_LANGUAGE[language] ?? language.toUpperCase()}.fmx4.zip`;
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export interface FormexPackage {
  /** Die Haupt-XML des Rechtsakts. */
  xml: string;
  /** Das Begleit-Manifest (`*.doc.xml`) — trägt u. a. `LEGAL.VALUE`. */
  docXml: string | null;
  mainEntryName: string;
  zipBytes: number;
  sha256: string;
  fromCache: boolean;
  url: string;
  /** Welcher Weg getragen hat — ein stiller Wechsel darf kein Messergebnis sein. */
  route: 'cache' | 'sparql' | 'celex-alias';
  /** Wie viele fmx4-Manifestationen das Amt kennt. >1 heißt: es gab eine Wahl. */
  manifestationCount?: number;
}

/**
 * Haupt-XML aus dem Archiv wählen. Das Paket enthält zwei Dateien: ein kleines
 * Manifest `*.doc.xml` und den Rechtsakt `*.xml`. Die Regel ist deshalb: die
 * größte `.xml`, die NICHT auf `.doc.xml` endet — nicht „die erste".
 */
export function pickMainXml(zip: AdmZip): { xml: string; docXml: string | null; mainEntryName: string } {
  const eintraege = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.xml'));
  if (eintraege.length === 0) throw new FormexFetchError('Archiv enthält keine XML-Datei.');

  const manifest = eintraege.find((e) => e.entryName.toLowerCase().endsWith('.doc.xml'));
  const kandidaten = eintraege.filter((e) => !e.entryName.toLowerCase().endsWith('.doc.xml'));
  if (kandidaten.length === 0) {
    throw new FormexFetchError('Archiv enthält nur ein Manifest, keinen Rechtsakt.', eintraege.map((e) => e.entryName).join(', '));
  }
  const haupt = kandidaten.sort((a, b) => b.header.size - a.header.size)[0];
  return {
    xml: haupt.getData().toString('utf8'),
    docXml: manifest ? manifest.getData().toString('utf8') : null,
    mainEntryName: haupt.entryName,
  };
}

export interface FetchFormexOptions {
  cacheDir: string;
  /** false = ausschließlich aus der Ablage lesen (Parser-Arbeit, AC-3). */
  allowNetwork?: boolean;
  timeoutMs?: number;
  userAgent?: string;
}

/** Ein ZIP holen und prüfen, dass es eines IST — vor jeder Auswertung. */
async function holeZip(url: string, timeoutMs: number, userAgent?: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/zip', ...(userAgent ? { 'User-Agent': userAgent } : {}) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new FormexFetchError(`Netzfehler`, `${url} — ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new FormexFetchError(`CELLAR antwortete HTTP ${res.status}`, url);

  const buf = Buffer.from(await res.arrayBuffer());
  // Ein leerer oder winziger Body ist nie ein Gesetz — dieselbe Lehre wie bei
  // der EUR-Lex-Drossel, die mit HTTP 202 und 0 Bytes antwortete.
  if (buf.length < MIN_FORMEX_ZIP_BYTES) throw new FormexFetchError(`Antwort zu klein (${buf.length} Bytes)`, url);
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new FormexFetchError(`Antwort ist kein ZIP`, `${url} — ${buf.subarray(0, 60).toString('utf8')}`);
  }
  return buf;
}

export async function fetchFormex(
  celex: string,
  language: string,
  { cacheDir, allowNetwork = true, timeoutMs = 60_000, userAgent }: FetchFormexOptions
): Promise<FormexPackage> {
  const pfad = join(cacheDir, cacheFileName(celex, language));

  if (existsSync(pfad)) {
    const buf = readFileSync(pfad);
    return {
      ...pickMainXml(new AdmZip(buf)),
      zipBytes: buf.length,
      sha256: sha256(buf),
      fromCache: true,
      url: pfad,
      route: 'cache',
    };
  }
  if (!allowNetwork) {
    throw new FormexFetchError(`Nicht in der Ablage und Netz gesperrt: ${cacheFileName(celex, language)}`, pfad);
  }

  // Erst fragen, dann raten: die aufgelösten Adressen zuerst, die alte
  // gebaute Form als Rückfall. Umgekehrt hätte ein 404 der gebauten Form
  // vorhandene Rechtsakte als „nicht vorhanden" gemeldet.
  const wege: Array<{ route: 'sparql' | 'celex-alias'; url: string }> = [];
  let manifestationCount: number | undefined;
  let aufloesungsFehler: string | undefined;
  try {
    const uris = await resolveFormexManifestations(celex, language, timeoutMs);
    manifestationCount = uris.length;
    for (const u of uris) wege.push({ route: 'sparql', url: u });
  } catch (err) {
    aufloesungsFehler = err instanceof Error ? err.message : String(err);
  }
  wege.push({ route: 'celex-alias', url: buildCellarUrl(celex, language) });

  const fehler: string[] = aufloesungsFehler ? [`Auflösung: ${aufloesungsFehler}`] : [];
  for (const weg of wege) {
    let buf: Buffer;
    try {
      buf = await holeZip(weg.url, timeoutMs, userAgent);
    } catch (err) {
      fehler.push(err instanceof FormexFetchError ? `${err.message} (${err.detail ?? weg.url})` : String(err));
      continue;
    }
    const paket = pickMainXml(new AdmZip(buf));
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(pfad, buf);
    return {
      ...paket,
      zipBytes: buf.length,
      sha256: sha256(buf),
      fromCache: false,
      url: weg.url,
      route: weg.route,
      manifestationCount,
    };
  }
  throw new FormexFetchError(
    `Kein Formex für ${celex}.${language} (${wege.length} Weg${wege.length === 1 ? '' : 'e'} versucht)`,
    fehler.join(' · ')
  );
}
