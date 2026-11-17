/**
 * THE-597 Slice 3 — wendet die Vorregistrierung auf die 7 Läufe an.
 * LLM-frei. Run: cd packages/server && npx ts-node -T src/scripts/the597-slice3.ts
 */
import fs from 'fs';
import path from 'path';
import {
  decideSlice3,
  knownErrorClasses,
  parseRun,
  renderSlice3Report,
  type GoldenId,
} from '../evals/the597Slice3';

const DOCS = path.resolve(__dirname, '../../../../docs/evals');

const RUNS: Array<[label: string, golden: GoldenId, file: string]> = [
  ['gv3-run1', 'gv3', 'the597-typing-gv3-sc5-run1.json'],
  ['gv3-run2', 'gv3', 'the597-typing-gv3-sc5.json'],
  ['gv3-run3', 'gv3', 'the597-slice3/gv3-run3.json'],
  ['gv3-run4', 'gv3', 'the597-slice3/gv3-run4.json'],
  ['gv3-run5', 'gv3', 'the597-slice3/gv3-run5.json'],
  ['gv2-run1', 'gv2', 'the597-slice3/gv2-run1.json'],
  ['gv2-run2', 'gv2', 'the597-slice3/gv2-run2.json'],
];

function main(): void {
  const runs = RUNS.map(([label, golden, file]) => {
    const p = path.join(DOCS, file);
    if (!fs.existsSync(p)) throw new Error(`[the597-slice3] Lauf fehlt: ${p}`);
    return parseRun(label, golden, fs.readFileSync(p, 'utf8'));
  });
  const decision = decideSlice3(runs);
  const known = knownErrorClasses(runs);
  const md = renderSlice3Report(decision, known);
  fs.writeFileSync(path.join(DOCS, 'the597-slice3-ergebnis.md'), md + '\n');
  fs.writeFileSync(path.join(DOCS, 'the597-slice3-ergebnis.json'), JSON.stringify({ decision, known }, null, 2) + '\n');
  console.log(`[the597-slice3] Schicht 1: ${decision.layer1}`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
