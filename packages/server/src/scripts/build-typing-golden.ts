/**
 * build-typing-golden — baut aus den Projekt-Regulations einen Typing-Golden-
 * DRAFT (Labels leer bzw. LLM-vorgeschlagen), aus dem `typing:worksheet` die
 * HTML-Adjudikationsvorlage erzeugt.
 *
 * Workflow (User-Entscheidung 2026-07-12: LLM-vorlabeln → Mensch adjudiziert):
 *   1. build-typing-golden  → Draft (eine Provision = ein Case, Labels undefined)
 *   2. [optional] LLM-Prelabel füllt `labels` als VORSCHLAG (leakage dokumentiert)
 *   3. typing:worksheet     → HTML mit Dropdowns, auf Vorschlag vorbelegt
 *   4. Mensch adjudiziert, exportiert, Kappa ≥ 0.6 → `frozen: true`
 *
 *   export TA_API=http://localhost:3000/api TA_KEY=ta_... TA_PROJECT=6a3ff887...
 *   npm run typing:build -- --source dsgvo --out src/evals/golden/typing.draft.json
 *   npm run typing:build -- --source nis2  --out /tmp/typing-nis2.json
 *
 * Der Draft ist bewusst LLM-FREI (kein Kosten-/Modell-Entscheid hier); der
 * Prelabel-Schritt ist separat + flag-gated, damit dieser Build deterministisch
 * + testbar bleibt.
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Muster: build-self-golden.ts (THE-379)
 */
import fs from 'node:fs';
import path from 'node:path';
import { NORM_ONTOLOGY } from '@thearchitect/shared';
import { TypingGoldenSetSchema, type TypingGoldenCase } from '../evals/typingGolden';

// ─── Reine Transformation (ohne I/O — testbar) ──────────────────

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

export interface TypingDraft {
  version: string;
  frozen: false;
  ontologyVersion: string;
  rubricRef: string;
  cases: TypingGoldenCase[];
}

/** Ein Case je Provision, `labels` LEER (undefined-Achsen) — der Labeler/Prelabel füllt. */
export function buildTypingDraft(
  regulations: ApiRegulation[],
  ontologyVersion: string = NORM_ONTOLOGY.ontologyVersion,
  version = 'v1-draft'
): TypingDraft {
  const seen = new Set<string>();
  const cases: TypingGoldenCase[] = [];
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
      labels: {}, // alle Achsen offen — bewusst kein Default-Label
    });
  }
  return { version, frozen: false, ontologyVersion, rubricRef: '../RUBRIC.md', cases };
}

// ─── API-Glue ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const srcIdx = argv.indexOf('--source');
  const source = srcIdx !== -1 && argv[srcIdx + 1] ? argv[srcIdx + 1] : 'dsgvo';
  const outPath = path.resolve(
    outIdx !== -1 && argv[outIdx + 1]
      ? argv[outIdx + 1]
      : path.join(__dirname, '..', 'evals', 'golden', `typing.${source}.draft.json`)
  );

  const api = process.env.TA_API || 'http://localhost:3000/api';
  const key = process.env.TA_KEY;
  const projectId = process.env.TA_PROJECT;
  if (!key || !projectId) {
    console.error('TA_KEY und TA_PROJECT müssen gesetzt sein.');
    process.exitCode = 2;
    return;
  }
  const headers = { 'X-API-Key': key };

  const regRes = await fetch(`${api}/projects/${projectId}/regulations?source=${source}&limit=300`, { headers });
  if (!regRes.ok) throw new Error(`GET regulations: HTTP ${regRes.status}`);
  const regulations = ((await regRes.json()) as { data: { items: ApiRegulation[] } }).data.items;

  const draft = buildTypingDraft(regulations);
  // Schema-Validierung vor dem Schreiben (fängt kaputte Cases sofort).
  TypingGoldenSetSchema.parse(draft);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(draft, null, 2) + '\n');

  console.log(
    `[typing-build] ${draft.cases.length} Provisions (${source}) · E6 ${draft.ontologyVersion}\n` +
      `[typing-build] → ${outPath}\n` +
      `[typing-build] NEXT: npm run typing:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/typing-label.html`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[typing-build] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
