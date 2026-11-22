/**
 * UC-RING-001 — every text of the change folder check is Simplified Technical English.
 * Same guard as topologyLadderText.test.ts. Names of elements are given to the guard by name.
 * Run: cd packages/server && npx jest src/__tests__/changeRingText.test.ts
 */
import { ste100Findings } from '@thearchitect/shared/src/constants/ste100-guard';
import { assessChangeRings } from '../services/topology/changeRing';
import { RING_TEXT } from '../services/topology/changeRingText';
import * as gold from './fixtures/changeRingGold';

const models = [
  gold.goldRing(), gold.p1WriteWrite(), gold.p2WriteRead(), gold.ringOpen(), gold.unreadSolution(),
  gold.noStart(), gold.unknownLabel(), gold.objectLevel(),
];
const reports = [...models.map((m) => assessChangeRings(m.elements, m.relationships)), assessChangeRings([], [])];
const names = [...new Set(models.flatMap((m) => m.elements.map((e) => e.name)))].map((n) => `"${n}"`);
const extraNames = ['"Ask legal"', '"read"', '"write"'];

// Hints tell the reader what to do: instruction (at most 20 words a sentence). Findings describe: description (25).
const hintTexts = [
  ...reports.flatMap((r) => [...r.hints, ...r.folders.flatMap((f) => f.hints)].map((x) => x.text)),
  RING_TEXT.noOrder('Ask legal', 'Change folder'),
  RING_TEXT.tooFewSteps('Change folder', 1),
  RING_TEXT.tooFewSteps('Change folder', 0),
  RING_TEXT.objectWithoutParts('Change folder', 1),
  RING_TEXT.severalStarts('Change folder'),
];
const findingTexts = reports.flatMap((r) => r.folders.flatMap((f) => f.findings.map((x) => x.text)));

test('the collection reaches every kind of text', () => {
  expect(Object.keys(RING_TEXT)).toHaveLength(11);
  expect(new Set([...hintTexts, ...findingTexts]).size).toBeGreaterThanOrEqual(11);
});

test.each([...new Set(hintTexts)])('hint: %s', (text) => {
  expect(ste100Findings(text, 'instruction', [...names, ...extraNames])).toEqual([]);
});

test.each([...new Set(findingTexts)])('finding: %s', (text) => {
  expect(ste100Findings(text, 'description', [...names, ...extraNames])).toEqual([]);
});
