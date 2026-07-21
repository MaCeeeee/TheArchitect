/**
 * build-relations-golden — baut aus dem Projekt-Korpus einen Relations-Golden-
 * DRAFT (THE-421, Task 12b): für konfigurierte Gesetzespaare (z. B. DORA×NIS2)
 * werden Paragraphen geholt, per Cosine-Similarity gerankt (Task 12a:
 * `rankCandidatePairs`), auf ein handhabbares Arbeitsset selektiert (Task 12a:
 * `selectCandidates`) und als schema-gültige, LABEL-OFFENE Cases geschrieben.
 * `relation`/`direction` bleiben bewusst `undefined` — Labels kommen NIE aus
 * diesem Skript (spätere Prelabel-/Adjudikations-Tasks 13-15).
 *
 *   export TA_API=http://localhost:3000/api TA_KEY=ta_... TA_PROJECT=6a3ff887...
 *   export MONGODB_URI=mongodb://localhost:27017/thearchitect
 *   npm run relations:build -- --pairs dora:nis2,dsgvo:nis2,dsgvo:eprivacy \
 *     --target-size 60 --negative-share 0.3 --seed 42 --out src/evals/golden/relations.draft.json
 *
 * ─── Embeddings: warum zwei Quellen statt einer ──────────────────────────
 * `rankCandidatePairs`/`selectCandidates` brauchen pro Paragraph einen
 * Embedding-Vektor. `GET /api/projects/:projectId/regulations` (das die
 * Schwester-Skripte typing:build/build-typing-golden.ts für ihre Provisions
 * benutzen) liefert diesen NICHT — `.select('-embedding')` ist bewusstes,
 * getestetes Verhalten der Route ("excludes embedding field from list
 * response (size optimization)", regulations.routes.ts:92 +
 * regulations.routes.test.ts). Der Einzel-Fetch (`/regulations/:id`)
 * schließt das Feld ebenso aus, und der kanonische Korpus (Server B,
 * corpusClient.service.ts) speichert für seine Paragraphen aktuell GAR KEIN
 * `embedding`-Feld — Embeddings existieren nur auf dem projekt-gebundenen
 * `Regulation`-Mongoose-Modell.
 *
 * Also: Metadaten (fullText/title/language/...) kommen wie bei
 * build-typing-golden.ts über `TA_API`; Embeddings kommen über einen ZWEITEN,
 * direkten Mongo-Read auf genau dasselbe `Regulation`-Modell — derselbe
 * Zugriffsweg, den mehrere Geschwister-Skripte in diesem Ordner schon nutzen
 * (seed-golden-from-db.ts, seed-corpus-from-projects.ts,
 * migrate-mapping-references.ts), keine neu erfundene Route. Provisions ohne
 * Embedding (z. B. `embed-all` noch nicht gelaufen) werden aus dem
 * Kandidatenpool AUSGESCHLOSSEN + laut gemeldet (console.warn) — nicht still
 * so behandelt, als hätten sie eins.
 *
 * Linear: THE-421 (Task 12b) · Muster: build-typing-golden.ts (Task 11/THE-430)
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { NORM_ONTOLOGY, buildRegulationKey } from '@thearchitect/shared';
import { Regulation } from '../models/Regulation';
import {
  rankCandidatePairs,
  selectCandidatesWithReferences,
  hasReferencePatterns,
  type CandidateParagraph,
  type RankedPair,
} from '../evals/relationsCandidates';
import {
  RelationsGoldenSetSchema,
  type RelationsGoldenCase,
  type RelationsGoldenPairSide,
} from '../evals/relationsGolden';

// ─── Reine Transformation (ohne I/O — testbar) ──────────────────

export interface RelationsDraft {
  version: string;
  frozen: false;
  ontologyVersion: string;
  rubricRef: string;
  cases: RelationsGoldenCase[];
}

export interface BuildRelationsDraftOptions {
  ontologyVersion?: string;
  version?: string;
}

/** Mirrors PairSide.fullText.min(50) in relationsGolden.ts (and build-typing-golden's rule). */
const MIN_FULLTEXT_LEN = 50;

function slugifyRegulationKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toPairSide(p: CandidateParagraph): RelationsGoldenPairSide {
  return {
    regulationKey: p.regulationKey,
    source: p.source,
    paragraphNumber: p.paragraphNumber,
    title: p.title,
    fullText: p.fullText,
    language: p.language,
  };
}

/**
 * Assembles a schema-valid, label-open draft from already-selected pairs
 * (the output of `selectCandidates`, concatenated across law pairs). Sorts
 * each pair defensively by `regulationKey` — `RankedPair` documents
 * a.regulationKey < b.regulationKey as an invariant of the pure ranking/
 * selection functions, but a caller (or a future refactor) violating it must
 * not silently produce an unsorted case; relationsGolden.ts's schema rejects
 * that outright anyway, this just gives a correct case instead of a thrown
 * schema error for a fixable input.
 */
export function buildRelationsDraft(
  selected: RankedPair[],
  opts: BuildRelationsDraftOptions = {},
): RelationsDraft {
  const { ontologyVersion = NORM_ONTOLOGY.ontologyVersion, version = 'v1-draft' } = opts;

  const seenIds = new Set<string>();
  const cases: RelationsGoldenCase[] = [];

  for (const rp of selected) {
    if (!rp.a.fullText || rp.a.fullText.length < MIN_FULLTEXT_LEN) continue;
    if (!rp.b.fullText || rp.b.fullText.length < MIN_FULLTEXT_LEN) continue;

    const [a, b] = rp.a.regulationKey < rp.b.regulationKey ? [rp.a, rp.b] : [rp.b, rp.a];

    let caseId = `${slugifyRegulationKey(a.regulationKey)}__${slugifyRegulationKey(b.regulationKey)}`;
    while (seenIds.has(caseId)) caseId = `${caseId}-x`;
    seenIds.add(caseId);

    // relation/direction stay ABSENT — never guessed here (Tasks 13-15 label).
    cases.push({
      caseId,
      a: toPairSide(a),
      b: toPairSide(b),
    });
  }

  const draft: RelationsDraft = {
    version,
    frozen: false,
    ontologyVersion,
    rubricRef: '../RUBRIC.md',
    cases,
  };

  const parsed = RelationsGoldenSetSchema.safeParse(draft);
  if (!parsed.success) {
    throw new Error(
      `buildRelationsDraft: assembled draft failed schema validation: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }

  return draft;
}

// ─── Anchors ─────────────────────────────────────────────────────
//
// Per-law-pair anchor couples — regulationKey pairs ALWAYS included
// regardless of similarity ranking (relationsCandidates.ts module doc):
// known cross-norm connections a similarity ranking might rank low (or a
// human would expect and notice missing if silently dropped).
//
// Keyed by the same `lawA:lawB` string the --pairs flag uses, and looked up
// for BOTH orderings (a caller might type `nis2:dora` just as easily as
// `dora:nis2`) — deliberately only the anchors relevant to the pair being
// built are ever passed into that pair's `selectCandidates` call, so a typo
// or a genuinely wrong regulationKey fails LOUDLY (selectCandidates throws)
// instead of silently vanishing into "no anchors for this pair".
//
// regulationKey format is `buildRegulationKey(source, paragraphNumber)`.
//
// ⚠️ SOURCE NAMING IS NOT UNIFORM — verified against the live corpus 2026-07-20.
// The first crawled language of a law got the BARE source name, the second got a
// language suffix. Which language is bare therefore differs per law:
//
//   dora      → EN   (german variant: dora-de)
//   nis2      → EN   (german variant: nis2-de)
//   dsgvo     → DE   (english variant: dsgvo-en)
//   ePrivacy  → has NO bare name at all: only eprivacy-de / eprivacy-en
//
// So `eprivacy:art-1` does not exist and would make selectCandidates throw.
// Anchors below use keys CONFIRMED present in the corpus. When choosing --pairs,
// prefer language-consistent combinations (see the doc block at the top of this
// file) so a labeler compares two texts in one language.
export const ANCHORS: Record<string, Array<[string, string]>> = {
  // DORA Art. 1(2): DORA is lex specialis vis-à-vis NIS2 for the financial
  // sector; NIS2 Art. 4 ("Sector-specific Union legal acts") is the mirror
  // provision on the NIS2 side that yields to sector-specific acts like DORA.
  // Both bare names → both EN. ✔ verified present.
  'dora:nis2': [['dora:art-1', 'nis2:art-4']],
  // GDPR Art. 32 (security of processing) and NIS2 Art. 21 (cybersecurity
  // risk-management measures) both mandate technical/organisational security
  // measures for overlapping populations of controllers/entities.
  // dsgvo is DE, so pair it with the DE variant of NIS2. ✔ verified present.
  'dsgvo:nis2-de': [['dsgvo:art-32', 'nis2-de:art-21']],
  // GDPR Art. 95 is the explicit GDPR/ePrivacy interface article (GDPR does
  // not impose additional obligations where the ePrivacy regime already sets
  // specific obligations with the same objective); ePrivacy Art. 1 is that
  // directive's own subject-matter/scope article defining the relationship.
  // ePrivacy has no bare source → use the DE variant to match dsgvo. ✔ verified.
  'dsgvo:eprivacy-de': [['dsgvo:art-95', 'eprivacy-de:art-1']],
  // AI Act Art. 10 (Daten und Daten-Governance) erlaubt in Absatz 5 die
  // Verarbeitung besonderer Kategorien personenbezogener Daten zur Erkennung
  // und Korrektur von Verzerrungen — unter Schutzvorkehrungen und ausdrücklich
  // im Verhältnis zu DSGVO Art. 9, der genau diese Verarbeitung grundsätzlich
  // untersagt. Beide DE. ✔ Texte im Korpus geprüft.
  //
  // Anlass: ePrivacy ist im Korpus (Stand 2026-07-21) NICHT vorhanden — das
  // Paar oben bleibt für projekt-gebundene Korpora gültig, taugt aber nicht
  // als drittes Paar für den korpus-weiten Prüfsatz. Dieses ersetzt es dort.
  'dsgvo:ai-act-de': [['dsgvo:art-9', 'ai-act-de:art-10']],
};

function anchorsForPair(lawA: string, lawB: string): Array<[string, string]> {
  return ANCHORS[`${lawA}:${lawB}`] ?? ANCHORS[`${lawB}:${lawA}`] ?? [];
}

// ─── API + DB glue ───────────────────────────────────────────────

interface ApiRegulation {
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: string;
}

function argValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
}

function parsePairsArg(raw: string): Array<[string, string]> {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [a, b] = entry.split(':').map((s) => s.trim());
      if (!a || !b) throw new Error(`--pairs: invalid entry "${entry}" (expected lawA:lawB)`);
      return [a, b] as [string, string];
    });
}

async function fetchProvisionsMetadata(
  api: string,
  key: string,
  projectId: string,
  source: string,
): Promise<ApiRegulation[]> {
  const res = await fetch(`${api}/projects/${projectId}/regulations?source=${source}&limit=300`, {
    headers: { 'X-API-Key': key },
  });
  if (!res.ok) throw new Error(`GET regulations (${source}): HTTP ${res.status}`);
  const body = (await res.json()) as { data: { items: ApiRegulation[] } };
  return body.data.items;
}

/** Second call (see module doc): direct read of the same Regulation model the API route excludes `embedding` from. */
async function fetchEmbeddings(projectId: string, source: string): Promise<Map<string, number[]>> {
  const docs = await Regulation.find({ projectId: new mongoose.Types.ObjectId(projectId), source })
    .select('source paragraphNumber embedding')
    .lean();
  const map = new Map<string, number[]>();
  for (const d of docs) {
    if (Array.isArray(d.embedding) && d.embedding.length > 0) {
      map.set(`${d.source}::${d.paragraphNumber}`, d.embedding);
    }
  }
  return map;
}

async function fetchCandidateParagraphs(
  api: string,
  key: string,
  projectId: string,
  source: string,
): Promise<CandidateParagraph[]> {
  const [metadata, embeddings] = await Promise.all([
    fetchProvisionsMetadata(api, key, projectId, source),
    fetchEmbeddings(projectId, source),
  ]);

  const out: CandidateParagraph[] = [];
  let missingEmbedding = 0;
  for (const r of metadata) {
    const embedding = embeddings.get(`${r.source}::${r.paragraphNumber}`);
    if (!embedding) {
      missingEmbedding++;
      continue; // cannot rank without a vector — excluded, not silently treated as similar/negative.
    }
    out.push({
      regulationKey: buildRegulationKey(r.source, r.paragraphNumber),
      source: r.source,
      paragraphNumber: r.paragraphNumber,
      title: r.title,
      fullText: r.fullText,
      language: r.language === 'en' ? 'en' : 'de',
      embedding,
    });
  }
  if (missingEmbedding > 0) {
    console.warn(`[relations-build] ${source}: ${missingEmbedding} provision(s) skipped — no embedding stored yet`);
  }
  return out;
}

/**
 * Dritter Beschaffungsweg: ein lokaler Pool, der Text UND Vektor mitbringt.
 *
 * WARUM: Die beiden Wege oben setzen ein Projekt voraus, dem die Gesetze
 * zugeordnet sind, plus direkten Mongo-Zugriff auf dieselbe Datenbank. Für
 * einen KORPUS-weiten Prüfsatz trifft beides nicht zu — der Korpus ist gerade
 * nicht projekt-gebunden, und ein Prüfsatz darf keinen Import in ein fremdes
 * Projekt auslösen (das würde hunderte Dokumente in das Modell eines Nutzers
 * schreiben). Derselbe Grund wie bei `--from-file` in build-typing-golden.ts.
 *
 * Der Pool wird read-only aus dem Korpus gezogen und die Vektoren werden mit
 * DEMSELBEN Einbetter erzeugt, den die Pipeline benutzt (Sidecar,
 * all-mpnet-base-v2). Ein anderer Einbetter würde die Paar-Auswahl in Richtung
 * dessen verschieben, was ER ähnlich findet — der Prüfsatz misst dann eine
 * andere Nachbarschaft als die, in der die Pipeline arbeitet.
 */
export function loadCandidatesFromPool(
  pool: Array<ApiRegulation & { embedding?: number[] }>,
  sources: string[],
): Map<string, CandidateParagraph[]> {
  const wanted = new Set(sources);
  const bySource = new Map<string, CandidateParagraph[]>();
  const missingBySource = new Map<string, number>();

  for (const r of pool) {
    if (!wanted.has(r.source)) continue;
    if (!Array.isArray(r.embedding) || r.embedding.length === 0) {
      missingBySource.set(r.source, (missingBySource.get(r.source) ?? 0) + 1);
      continue; // ohne Vektor nicht rankbar — ausgeschlossen, nicht stillschweigend als unähnlich gewertet.
    }
    const list = bySource.get(r.source) ?? [];
    list.push({
      regulationKey: buildRegulationKey(r.source, r.paragraphNumber),
      source: r.source,
      paragraphNumber: r.paragraphNumber,
      title: r.title,
      fullText: r.fullText,
      language: r.language === 'en' ? 'en' : 'de',
      embedding: r.embedding,
    });
    bySource.set(r.source, list);
  }

  for (const [source, n] of missingBySource) {
    console.warn(`[relations-build] ${source}: ${n} provision(s) skipped — kein Vektor im Pool`);
  }
  return bySource;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const pairsArg = argValue(argv, '--pairs');
  const outArg = argValue(argv, '--out');
  const targetSizeArg = argValue(argv, '--target-size');
  const negativeShareArg = argValue(argv, '--negative-share');
  const seedArg = argValue(argv, '--seed');

  const pairs = parsePairsArg(pairsArg || 'dora:nis2,dsgvo:nis2,dsgvo:eprivacy');
  const targetSize = targetSizeArg !== undefined ? Number(targetSizeArg) : 60;
  const negativeShare = negativeShareArg !== undefined ? Number(negativeShareArg) : 0.3;
  const seed = seedArg !== undefined ? Number(seedArg) : 42;

  const allSources = [...new Set(pairs.flatMap(([a, b]) => [a, b]))];

  // --from-file <pool.json>: Text + Vektor kommen aus einer lokalen Datei
  // (siehe loadCandidatesFromPool). Weder Projekt-API noch Mongo nötig.
  const fromFileArg = argValue(argv, '--from-file');

  let paragraphsBySource: Map<string, CandidateParagraph[]>;
  let connected = false;

  if (fromFileArg) {
    const poolPath = path.resolve(fromFileArg);
    const pool = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
    if (!Array.isArray(pool)) throw new Error(`--from-file: ${poolPath} enthält kein Array`);
    paragraphsBySource = loadCandidatesFromPool(pool, allSources);
    const empty = allSources.filter((s) => (paragraphsBySource.get(s) ?? []).length === 0);
    if (empty.length) {
      console.error(
        `--from-file: keine Provisions mit Vektor für ${empty.join(', ')} in ${poolPath} ` +
          `(vorhandene Quellen: ${[...new Set(pool.map((r: ApiRegulation) => r.source))].sort().join(', ')})`,
      );
      process.exitCode = 2;
      return;
    }
  } else {
    const api = process.env.TA_API || 'http://localhost:3000/api';
    const key = process.env.TA_KEY;
    const projectId = process.env.TA_PROJECT;
    const mongoUri = process.env.MONGODB_URI;
    if (!key || !projectId) {
      console.error('TA_KEY und TA_PROJECT müssen gesetzt sein (oder --from-file benutzen).');
      process.exitCode = 2;
      return;
    }
    if (!mongoUri) {
      console.error('MONGODB_URI muss gesetzt sein (Embeddings kommen nicht über TA_API — siehe Skript-Kopf).');
      process.exitCode = 2;
      return;
    }
    await mongoose.connect(mongoUri);
    connected = true;
    paragraphsBySource = new Map<string, CandidateParagraph[]>();
    for (const source of allSources) {
      paragraphsBySource.set(source, await fetchCandidateParagraphs(api, key, projectId, source));
    }
  }

  try {

    const allSelected: RankedPair[] = [];
    for (const [lawA, lawB] of pairs) {
      const lawAParas = paragraphsBySource.get(lawA) ?? [];
      const lawBParas = paragraphsBySource.get(lawB) ?? [];
      const ranked = rankCandidatePairs(lawAParas, lawBParas);
      const anchors = anchorsForPair(lawA, lawB);

      // Ein Gesetz ohne Referenz-Muster (relationsCandidates.ts) ist für die
      // referenz-getriebene Auswahl unsichtbar und fiele still auf reine
      // Similarity zurück — also auf genau die Quelle, die das Set unbrauchbar
      // gemacht hat. Deshalb laut melden statt schweigen.
      for (const s of [lawA, lawB]) {
        if (!hasReferencePatterns(s)) {
          console.warn(
            `[relations-build] ⚠️ ${s}: keine Referenz-Muster registriert — ` +
              `Paare mit dieser Quelle können nicht referenz-verknüpft werden ` +
              `(LAW_FAMILY_PATTERNS/SOURCE_TO_FAMILY in evals/relationsCandidates.ts ergänzen)`,
          );
        }
      }

      try {
        const { pairs: selected, stats } = selectCandidatesWithReferences(ranked, {
          targetSize,
          negativeShare,
          anchors,
          seed,
        });
        allSelected.push(...selected);
        console.log(
          `[relations-build] ${lawA}×${lawB}: ${selected.length} candidates selected ` +
            `(reference ${stats.reference}, negative ${stats.negative}, anchor ${stats.anchor}, similar ${stats.similar}) · ` +
            `referenz-verknüpft verfügbar: ${stats.referenceAvailable}, davon Pinpoint: ${stats.referencePinpoint}`,
        );
      } catch (err) {
        // Anchor missing among ranked candidates — fail loudly, name the pair, do not swallow.
        throw new Error(
          `[relations-build] ${lawA}×${lawB}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const draft = buildRelationsDraft(allSelected, {});

    const outPath = path.resolve(
      outArg
        ? outArg
        : path.join(
            __dirname,
            '..',
            'evals',
            'golden',
            `relations.${pairs.map(([a, b]) => `${a}-${b}`).join('_')}.draft.json`,
          ),
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(draft, null, 2) + '\n');

    console.log(
      `[relations-build] ${draft.cases.length} pairs (${pairs.map(([a, b]) => `${a}×${b}`).join(', ')}) · E7 ${draft.ontologyVersion}\n` +
        `[relations-build] → ${outPath}`,
    );
  } finally {
    // Auf dem --from-file-Weg wurde nie verbunden — ein disconnect() darauf
    // wäre folgenlos, aber irreführend zu lesen.
    if (connected) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[relations-build] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
