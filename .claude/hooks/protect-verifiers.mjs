#!/usr/bin/env node
/**
 * PreToolUse — der Pruefer ist geschuetzt.
 *
 * Terminal-RSI (arXiv 2610.22192) zaehlt strikten Erfolg nur gegen einen
 * GESCHUETZTEN Pruefer. Ein Agent, der Tore, Baselines oder Golden Sets selbst
 * aendern darf, kann jedes Rot in Gruen verwandeln, ohne die Aufgabe zu loesen
 * (Goodhart). Dieser Hook verbietet das nicht — er holt den Menschen dazu:
 * Schreibzugriffe auf die Pruefer laufen ueber eine Rueckfrage ("ask").
 *
 * Geschuetzt:
 *   - jede Suite in GATE_SUITES (live aus jest.gate.config.ts gelesen —
 *     neue Tore sind automatisch geschuetzt) und die Config selbst
 *   - Baselines: nav-graph, Architektur-Fitness, EVAL_BASELINE.md
 *   - Golden Sets (packages/server/src/evals/golden/)
 *   - die Hooks, .claude/settings.json und settings.local.json (der Pruefer
 *     des Pruefers — sonst schaltet der Agent den Hook einfach ab)
 *   - .github/workflows/gate.yml
 *
 * Grenze: Bash wird heuristisch geprueft (Pfad im Befehl + schreibender
 * Operator). Ein entschlossener Umweg ueber ein Skript ist moeglich — der
 * Hook faengt den Normalfall, nicht jeden Trick.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function gateSuites() {
  try {
    const cfg = readFileSync(resolve(ROOT, 'packages/server/jest.gate.config.ts'), 'utf8');
    const list = cfg.match(/GATE_SUITES\s*=\s*\[([\s\S]*?)\]/);
    if (!list) return [];
    return [...list[1].replace(/\/\/[^\n]*/g, '').matchAll(/['"]([\w.-]+)['"]/g)].map(
      (m) => `packages/server/src/__tests__/${m[1]}.test.ts`,
    );
  } catch {
    return [];
  }
}

const PROTECTED_FILES = [
  'packages/server/jest.gate.config.ts',
  'packages/server/src/__tests__/architectureFitness.baseline.json',
  'packages/server/src/evals/EVAL_BASELINE.md',
  'docs/strategy/nav-graph-baseline.json',
  '.github/workflows/gate.yml',
  '.claude/settings.json',
  // settings.local.json kann Hooks abschalten (disableAllHooks, env) —
  // der Pruefer des Pruefers gilt auch hier.
  '.claude/settings.local.json',
  ...gateSuites(),
];
const PROTECTED_DIRS = ['packages/server/src/evals/golden/', '.claude/hooks/'];

function protectedReason(rel) {
  if (PROTECTED_FILES.includes(rel)) return rel;
  const dir = PROTECTED_DIRS.find((d) => rel.startsWith(d));
  return dir ? `${dir}…` : null;
}

/** Schreibende Operatoren in Shell-Befehlen. */
const WRITES =
  /(\bsed\s+(-[a-zA-Z]*i|--in-place)|\bperl\s+-[a-zA-Z]*i|>>|>\s*(?!&|\/dev\/null)\S|\btee\b|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bgit\s+(checkout|restore|rm|mv)\b|writeFileSync|--write-baseline)/;

function checkBash(command) {
  if (/--write-baseline/.test(command)) return 'nav-graph-baseline.json (--write-baseline)';
  if (!WRITES.test(command)) return null;
  // Basisname reicht: Befehle laufen oft aus Unterverzeichnissen.
  const needles = [
    ...PROTECTED_FILES.map((f) => f.split('/').pop()),
    'evals/golden',
    '.claude/hooks',
    '.claude/settings.json',
    '.claude/settings.local.json',
  ];
  const hit = needles.find((n) => command.includes(n));
  return hit || null;
}

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  const { tool_name: tool, tool_input: args = {} } = payload;

  let hit = null;
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const p = args.file_path || args.notebook_path;
    if (p) {
      const rel = relative(ROOT, isAbsolute(p) ? p : resolve(payload.cwd || ROOT, p)).split('\\').join('/');
      hit = protectedReason(rel);
    }
  } else if (tool === 'Bash' && typeof args.command === 'string') {
    hit = checkBash(args.command);
  }
  if (!hit) process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason:
          `Geschützter Prüfer: ${hit}. Tore, Baselines und Golden Sets ändert nur, wer es ` +
          'bewusst entscheidet — nicht der Agent, um Rot in Grün zu verwandeln. ' +
          'Freigeben nur, wenn die Änderung am Prüfer selbst gewollt ist.',
      },
    }),
  );
});
