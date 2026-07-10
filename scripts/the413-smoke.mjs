#!/usr/bin/env node
/**
 * THE-413 manual smoke test — Source-Registry-as-data.
 *
 * Zero setup: no DB, no auth, no running server. Exercises the exact Mongoose
 * validators + key utilities that THE-413 changed, at the model level via
 * validateSync() (offline). Run from the repo root AFTER `npm run build`:
 *
 *   node scripts/the413-smoke.mjs
 *
 * Exits 0 if every check passes, 1 otherwise. This is the automated half; the
 * "new law = one data row" proof is the manual half — see the test guide:
 * docs/superpowers/test-guides/2026-07-10-the413-manual-test.md
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Regulation } = require('../packages/server/dist/models/Regulation.js');
const { Policy } = require('../packages/server/dist/models/Policy.js');
const {
  isNormSource,
  isJurisdiction,
  NORM_SOURCE_IDS,
  buildRegulationKey,
  normaliseParagraph,
} = require('../packages/shared/dist/index.js');
const { computeVersionHash } = require('../packages/server/dist/utils/regulationVersion.js');

let pass = 0;
let fail = 0;
const ok = (name) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); };
const bad = (name, detail) => { fail++; console.log(`  \x1b[31m✗ ${name}\x1b[0m — ${detail}`); };
const check = (name, cond, detail = '') => (cond ? ok(name) : bad(name, detail));

const regBase = {
  jurisdiction: 'EU',
  paragraphNumber: 'Art. 1',
  title: 'Smoke title',
  fullText: 'x'.repeat(60),
  sourceUrl: 'https://example.org/law',
  effectiveFrom: new Date('2024-01-01'),
  language: 'en',
};
const regErr = (over) => new Regulation({ ...regBase, ...over }).validateSync();

console.log('\n\x1b[1mTHE-413 smoke — Source-Registry-as-data\x1b[0m');

// ── AC-1/AC-2: every ontology source is accepted by the write boundary ──
console.log('\n[1] Every ontology source validates (data-driven, no hardcoded list):');
for (const source of NORM_SOURCE_IDS) {
  check(`source "${source}"`, regErr({ source })?.errors?.source === undefined,
    'rejected but is an ontology row');
}

// ── AC-2: invalid source is rejected, message points at the registry file ──
console.log('\n[2] Invalid values are rejected at the write boundary:');
{
  const e = regErr({ source: 'totally-made-up-source' });
  check('unknown source rejected', e?.errors?.source !== undefined, 'was accepted');
  check('reject message names norm-ontology.v1.ts',
    String(e?.errors?.source?.message || '').includes('norm-ontology.v1.ts'),
    `message was: ${e?.errors?.source?.message}`);
  check('unknown jurisdiction rejected',
    regErr({ jurisdiction: 'XX' })?.errors?.jurisdiction !== undefined, 'was accepted');
  check('jurisdiction is exact-case (lowercase "eu" rejected)',
    regErr({ jurisdiction: 'eu' })?.errors?.jurisdiction !== undefined, '"eu" was accepted');
}

// ── Review fix: null parity with the old built-in enum ──
console.log('\n[3] null parity (the review finding):');
check('Regulation.source: null still rejected (by required)',
  regErr({ source: null })?.errors?.source !== undefined, 'null slipped through required');
{
  // Policy.source is NOT required and has default "custom"; explicit null must
  // pass the validator exactly like the old enum did (else old docs break on re-save).
  const e = new Policy({
    projectId: '000000000000000000000000',
    name: 'Smoke policy',
    category: 'security',
    createdBy: '000000000000000000000000',
    source: null,
  }).validateSync();
  check('Policy.source: null passes the ontology validator',
    e?.errors?.source === undefined,
    `null was rejected: ${e?.errors?.source?.message}`);
}

// ── AC-2: Policy.source now shares the registry (togaf/archimate + regs) ──
console.log('\n[4] Policy.source validates against the same registry:');
for (const source of ['togaf', 'archimate', 'nis2', 'custom']) {
  const e = new Policy({
    projectId: '000000000000000000000000', name: 'p', category: 'security',
    createdBy: '000000000000000000000000', source,
  }).validateSync();
  check(`Policy source "${source}"`, e?.errors?.source === undefined, 'rejected');
}

// ── AC-3/AC-4: key byte-stability across the wfcomp replica collapse ──
console.log('\n[5] Canonical key byte-stability (AC-3/AC-4):');
check("buildRegulationKey('dsgvo','Art. 30') === 'dsgvo:art-30'",
  buildRegulationKey('dsgvo', 'Art. 30') === 'dsgvo:art-30', buildRegulationKey('dsgvo', 'Art. 30'));
check("buildRegulationKey('ai-act-en','Article 5(1)(a)') === 'ai-act-en:article-5-1-a'",
  buildRegulationKey('ai-act-en', 'Article 5(1)(a)') === 'ai-act-en:article-5-1-a',
  buildRegulationKey('ai-act-en', 'Article 5(1)(a)'));
check("normaliseParagraph('§ 6 Abs. 1') === '6-abs-1'",
  normaliseParagraph('§ 6 Abs. 1') === '6-abs-1', normaliseParagraph('§ 6 Abs. 1'));
check('computeVersionHash is sha256-utf8-hex, unchanged',
  computeVersionHash('lorem') === '3400bb495c3f8c4c3483a44c6bc1a92e9d94406db75a6f27dbccc11c76450d8a',
  computeVersionHash('lorem'));

// ── THE-396 fix: the helper the route/scheduler gates now use ──
console.log('\n[6] Gate helper (THE-396 fix — ai-act/data-act reachable):');
check('isNormSource("ai-act-en") === true (was silently dropped before)', isNormSource('ai-act-en') === true);
check('isNormSource("data-act-de") === true', isNormSource('data-act-de') === true);
check('isNormSource("not-a-law") === false', isNormSource('not-a-law') === false);
check('isJurisdiction("CH") === true', isJurisdiction('CH') === true);

console.log(`\n\x1b[1mResult:\x1b[0m ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
