/**
 * THE-413 AC-3/AC-4 — byte-stability of canonical identity across the
 * utility collapse. If any of these change, every stored regulationKey /
 * versionHash reference (VERLOCK, ComplianceMapping, corpusRef) breaks.
 */
import { buildRegulationKey, normaliseParagraph } from '@thearchitect/shared';
import { computeVersionHash } from '../utils/regulationVersion';

const LOREM_SHA256 = '3400bb495c3f8c4c3483a44c6bc1a92e9d94406db75a6f27dbccc11c76450d8a';

describe('canonical key byte-stability (THE-413)', () => {
  it('buildRegulationKey stays byte-identical for known shapes', () => {
    expect(buildRegulationKey('dsgvo', 'Art. 30')).toBe('dsgvo:art-30');
    expect(buildRegulationKey('nis2', 'Art. 23')).toBe('nis2:art-23');
    expect(buildRegulationKey('ai-act-en', 'Article 5(1)(a)')).toBe('ai-act-en:article-5-1-a');
    expect(normaliseParagraph('§ 6 Abs. 1')).toBe('6-abs-1');
  });
  it('computeVersionHash is sha256-utf8-hex, unchanged', () => {
    expect(computeVersionHash('lorem')).toBe(LOREM_SHA256);
  });
});
