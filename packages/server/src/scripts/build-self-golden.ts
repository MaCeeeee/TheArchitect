/**
 * build-self-golden — baut aus den Projekt-Regulations + dem profilierten
 * Kandidatenpool ein Golden-Set-DRAFT (goldElementIds leer), aus dem dann
 * `golden:worksheet` die HTML-Labelvorlage erzeugt.
 *
 * Warum nicht seed-golden-from-db? Die Auto-Mappings haben status='auto'/
 * createdBy='llm' und dieser Produkt-Build hat keinen Confirm/Reject-Flow —
 * seed-golden-from-db sähe also kein Gold. Dieser Weg umgeht das: Matthias
 * labelt bias-frei im Worksheet, kein DB-Zugang nötig (nur der API-Key).
 *
 * Kandidatenpool = Elemente MIT Compliance-Profil (metadata.compliance) — das
 * ist der compliance-relevante Operations-Layer (Stores/Services/Infra/…); die
 * Facts werden in die Kandidaten-Beschreibung serialisiert, damit der Labeler
 * beim Stufe-1-Test (RUBRIC §2.3) sieht, was das Element hält.
 *
 *   export TA_API=http://localhost:3000/api TA_KEY=ta_... TA_PROJECT=6a3ff887...
 *   npm run golden:build-self                                   # → src/evals/golden/mapping.self.v1.json
 *   npm run golden:build-self -- --out /tmp/self.json --source dsgvo
 *   npm run golden:worksheet -- src/evals/golden/mapping.self.v1.json /tmp/self-labeling.html
 *
 * Linear: THE-379 · Epic THE-378
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseFactsFromMetadata, serializeFacts } from '../compliance/factsV1';
import { GoldenSetSchema, type GoldenCase } from '../evals/goldenSet';

// ─── Reine Transformation (ohne I/O — testbar) ──────────────────

interface ApiElement {
  id: string;
  name: string;
  type: string;
  layer?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
interface ApiRegulation {
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: string;
  jurisdiction: string;
}

export function slugifyCaseId(source: string, paragraphNumber: string): string {
  return `${source}-${paragraphNumber}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Elemente mit gültigem Compliance-Profil → Kandidaten (Facts in die Beschreibung serialisiert). */
export function profiledCandidates(elements: ApiElement[]): GoldenCase['candidates'] {
  const out: GoldenCase['candidates'] = [];
  for (const e of elements) {
    const facts = parseFactsFromMetadata(e.metadata);
    if (!facts) continue;
    const base = (e.description ?? '').trim();
    const description = `${base ? base + ' · ' : ''}facts: ${serializeFacts(facts)}`;
    out.push({ id: e.id, name: e.name, type: e.type, layer: e.layer, description });
  }
  return out;
}

export function buildGoldenDraft(
  regulations: ApiRegulation[],
  elements: ApiElement[],
  version = 'self-v1-draft'
): { version: string; frozen: false; rubricRef: string; cases: GoldenCase[] } {
  const candidates = profiledCandidates(elements);
  if (candidates.length === 0) {
    throw new Error('keine profilierten Elemente (metadata.compliance) — erst `npm run facts:apply`');
  }
  const seen = new Set<string>();
  const cases: GoldenCase[] = [];
  for (const r of regulations) {
    if (!r.fullText || r.fullText.length < 50) continue;
    let caseId = slugifyCaseId(r.source, r.paragraphNumber);
    while (seen.has(caseId)) caseId = `${caseId}-x`;
    seen.add(caseId);
    cases.push({
      caseId,
      source: r.source,
      paragraphNumber: r.paragraphNumber,
      title: r.title,
      fullText: r.fullText,
      language: r.language === 'en' ? 'en' : 'de',
      jurisdiction: r.jurisdiction || 'EU',
      candidates,
      goldElementIds: [],
    });
  }
  return { version, frozen: false, rubricRef: '../RUBRIC.md', cases };
}

// ─── API-Glue ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const srcIdx = argv.indexOf('--source');
  const outPath = path.resolve(
    outIdx !== -1 && argv[outIdx + 1]
      ? argv[outIdx + 1]
      : path.join(__dirname, '..', 'evals', 'golden', 'mapping.self.v1.json')
  );
  const source = srcIdx !== -1 && argv[srcIdx + 1] ? argv[srcIdx + 1] : 'dsgvo';

  const api = process.env.TA_API || 'http://localhost:3000/api';
  const key = process.env.TA_KEY;
  const projectId = process.env.TA_PROJECT;
  if (!key || !projectId) {
    console.error('TA_KEY und TA_PROJECT müssen gesetzt sein.');
    process.exitCode = 2;
    return;
  }
  const headers = { 'X-API-Key': key };

  const regRes = await fetch(`${api}/projects/${projectId}/regulations?source=${source}&limit=200`, { headers });
  if (!regRes.ok) throw new Error(`GET regulations: HTTP ${regRes.status}`);
  const regulations = ((await regRes.json()) as { data: { items: ApiRegulation[] } }).data.items;

  const elRes = await fetch(`${api}/projects/${projectId}/elements`, { headers });
  if (!elRes.ok) throw new Error(`GET elements: HTTP ${elRes.status}`);
  const elements = ((await elRes.json()) as { data: ApiElement[] }).data;

  const draft = buildGoldenDraft(regulations, elements);
  // Schema-Validierung vor dem Schreiben (fängt kaputte Kandidaten/Cases sofort).
  GoldenSetSchema.parse(draft);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(draft, null, 2) + '\n');

  console.log(
    `[build-self] ${draft.cases.length} Cases (${source}) · ${draft.cases[0]?.candidates.length ?? 0} Kandidaten je Case\n` +
      `[build-self] → ${outPath}\n` +
      `[build-self] NEXT: npm run golden:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/self-labeling.html`
  );
}

if (require.main === module) {
  main().catch(err => {
    console.error('[build-self] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
