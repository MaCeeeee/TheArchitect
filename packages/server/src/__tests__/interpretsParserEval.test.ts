/**
 * Parser-Eval-Kern (THE-529, Task 5) — reine Funktion, kein Netz, keine Datei.
 *
 * `evalInterpretsParser` fährt je Golden-Fall den mechanischen Detektor GENAU
 * wie der Crawler-Batch (shared `selectBorrowSentence`), probiert beide
 * Richtungen des Paars wie der Server-Generator (erst Seite a als zitierend,
 * dann b) und zählt gegen die v5-Wahrheiten:
 *   tp — Golden INTERPRETS ∧ Detektor interprets ∧ Richtung gleich
 *   fp — Golden ≠ INTERPRETS ∧ Detektor interprets
 *   fn — Golden INTERPRETS ∧ Detektor nicht
 *   Richtungs-Mismatch — Golden INTERPRETS ∧ Detektor interprets ∧ Richtung
 *   verschieden → zählt als 1 fn UND 1 fp und wird SEPARAT als
 *   directionMismatch ausgewiesen (er darf nicht als "fast richtig" in tp
 *   rutschen und nicht doppelt unsichtbar werden).
 *
 * Run: cd packages/server && npx jest src/__tests__/interpretsParserEval.test.ts
 */
import {
  evalInterpretsParser,
  poolKey,
  type ParserEvalPoolDoc,
} from '../scripts/interprets-parser-eval';
import type { RelationsGoldenCase } from '../evals/relationsGolden';

// ─── Fixture-Bausteine ──────────────────────────────────────────────
//
// Echte Quellen (cra-en/dsgvo/nis2), weil `identsForSource` nur registrierte
// Korpus-Quellen auflöst — der Eval-Pfad ist derselbe wie im Prod-Batch.

const PAD = ' This padding text only satisfies the fifty character minimum of the schema.';

/** Zitierender Satz mit voller Borrow-Schablone auf DSGVO Art. 4 (P0✓P1✓). */
const BORROW_DSGVO_4 =
  "For the purposes of this Regulation, 'personal data' means personal data as defined in " +
  'Article 4, point (1), of Regulation (EU) 2016/679.' +
  PAD;

/** Zitierender Satz mit voller Borrow-Schablone auf NIS2 Art. 6 (P0✓P1✓). */
const BORROW_NIS2_6 =
  "For the purposes of this Regulation, 'cybersecurity' means cybersecurity as defined in " +
  'Article 6, point (3), of Directive (EU) 2022/2555.' +
  PAD;

/** Text ohne Verweis-Satz — der Detektor findet nichts. */
const NO_BORROW =
  'The provider shall notify the competent authority without undue delay and shall document every incident.' +
  PAD;

/** Definitions-Ziel-Text (prägt den geborgten Begriff — P2-Fallback-tauglich). */
const DSGVO_4_TEXT =
  "'personal data' means any information relating to an identified or identifiable natural person." + PAD;
const NIS2_6_TEXT =
  "'cybersecurity' means the activities necessary to protect network and information systems." + PAD;

interface SideSpec {
  regulationKey: string;
  source: string;
  paragraphNumber: string;
  fullText: string;
}

function side(s: SideSpec): RelationsGoldenCase['a'] {
  return { ...s, title: 'T', language: 'en' };
}

function goldenCase(
  caseId: string,
  a: SideSpec,
  b: SideSpec,
  relation: string | null,
  direction?: 'a-to-b' | 'b-to-a'
): RelationsGoldenCase {
  const c: RelationsGoldenCase = { caseId, a: side(a), b: side(b), relation };
  if (direction) c.direction = direction;
  return c;
}

/** Pool mit typisierten Definitions-Zielen — die Prod-P2-Quelle (Task 3). */
function pool(): Map<string, ParserEvalPoolDoc> {
  return new Map<string, ParserEvalPoolDoc>([
    [poolKey('dsgvo', 'Art. 4'), { title: 'Begriffsbestimmungen', fullText: DSGVO_4_TEXT, provisionKind: 'definition' }],
    [poolKey('nis2', 'Art. 6'), { title: 'Definitions', fullText: NIS2_6_TEXT, provisionKind: 'definition' }],
  ]);
}

// Seite a (cra-en) zitiert — der Definierer ist das Ziel b → Detektor-Richtung 'b-to-a'.
const TP_CASE = goldenCase(
  'tp-1',
  { regulationKey: 'cra-en:art-3', source: 'cra-en', paragraphNumber: 'Art. 3', fullText: BORROW_DSGVO_4 },
  { regulationKey: 'dsgvo:art-4', source: 'dsgvo', paragraphNumber: 'Art. 4', fullText: DSGVO_4_TEXT },
  'INTERPRETS',
  'b-to-a'
);

// Golden INTERPRETS, aber kein Verweis-Satz → Detektor sagt nichts → fn.
const FN_CASE = goldenCase(
  'fn-1',
  { regulationKey: 'cra-en:art-14', source: 'cra-en', paragraphNumber: 'Art. 14', fullText: NO_BORROW },
  { regulationKey: 'dsgvo:art-33', source: 'dsgvo', paragraphNumber: 'Art. 33', fullText: DSGVO_4_TEXT },
  'INTERPRETS',
  'b-to-a'
);

// Golden trägt (synthetisch) die GEGEN-Richtung — Detektor berechnet 'b-to-a'.
const MISMATCH_CASE = goldenCase(
  'dir-1',
  { regulationKey: 'cra-en:art-3', source: 'cra-en', paragraphNumber: 'Art. 3', fullText: BORROW_NIS2_6 },
  { regulationKey: 'nis2:art-6', source: 'nis2', paragraphNumber: 'Art. 6', fullText: NIS2_6_TEXT },
  'INTERPRETS',
  'a-to-b'
);

// Bewusste Negativ-Klasse ohne Borrow-Satz → kein Verdikt, KEIN fp.
const NEGATIVE_CASE = goldenCase(
  'neg-1',
  { regulationKey: 'cra-en:art-14', source: 'cra-en', paragraphNumber: 'Art. 14', fullText: NO_BORROW },
  { regulationKey: 'nis2:art-23', source: 'nis2', paragraphNumber: 'Art. 23', fullText: NIS2_6_TEXT },
  null
);

// Golden sagt none, aber der Text trägt eine volle Borrow-Schablone → fp.
const FP_CASE = goldenCase(
  'fp-1',
  { regulationKey: 'cra-en:art-7', source: 'cra-en', paragraphNumber: 'Art. 7', fullText: BORROW_DSGVO_4 },
  { regulationKey: 'dsgvo:art-4', source: 'dsgvo', paragraphNumber: 'Art. 4', fullText: DSGVO_4_TEXT },
  null
);

// ─── Tests ──────────────────────────────────────────────────────────

describe('evalInterpretsParser() — tp', () => {
  it('Golden INTERPRETS + Detektor interprets + Richtung gleich → tp, P=R=1', () => {
    const r = evalInterpretsParser([TP_CASE], pool());
    expect(r.tp).toBe(1);
    expect(r.fp).toBe(0);
    expect(r.fn).toBe(0);
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
    expect(r.tpCases).toEqual(['tp-1']);
    expect(r.directionMismatchCases).toEqual([]);
  });
});

describe('evalInterpretsParser() — fp-frei auf der Negativ-Klasse', () => {
  it('none-Fall ohne Borrow-Satz erzeugt KEINEN fp', () => {
    const r = evalInterpretsParser([TP_CASE, NEGATIVE_CASE], pool());
    expect(r.tp).toBe(1);
    expect(r.fp).toBe(0);
    expect(r.fpCases).toEqual([]);
    expect(r.precision).toBe(1);
  });

  it('none-Fall MIT Borrow-Satz ist ein fp (der Zähler ist scharf)', () => {
    const r = evalInterpretsParser([FP_CASE], pool());
    expect(r.tp).toBe(0);
    expect(r.fp).toBe(1);
    expect(r.fpCases).toEqual(['fp-1']);
    expect(r.precision).toBe(0);
  });
});

describe('evalInterpretsParser() — fn', () => {
  it('Golden INTERPRETS ohne Detektor-Treffer → fn, Recall sinkt', () => {
    const r = evalInterpretsParser([TP_CASE, FN_CASE], pool());
    expect(r.tp).toBe(1);
    expect(r.fn).toBe(1);
    expect(r.fnCases).toEqual(['fn-1']);
    expect(r.recall).toBeCloseTo(0.5, 10);
  });
});

describe('evalInterpretsParser() — Richtungs-Mismatch', () => {
  it('zählt als 1 fn UND 1 fp und wird separat als directionMismatch ausgewiesen', () => {
    const r = evalInterpretsParser([MISMATCH_CASE], pool());
    expect(r.tp).toBe(0);
    expect(r.fp).toBe(1);
    expect(r.fn).toBe(1);
    expect(r.directionMismatchCases).toEqual(['dir-1']);
    // Der Mismatch steht auch in den fp-/fn-Listen — Zähler == Listenlängen.
    expect(r.fpCases).toEqual(['dir-1']);
    expect(r.fnCases).toEqual(['dir-1']);
    expect(r.precision).toBe(0);
    expect(r.recall).toBe(0);
  });
});

describe('poolKey()', () => {
  it('normalisiert die Artikelnummer — "Art. 4", "Artikel 4" und "art-4" sind derselbe Schlüssel', () => {
    expect(poolKey('dsgvo', 'Art. 4')).toBe(poolKey('dsgvo', 'Artikel 4'));
    expect(poolKey('dsgvo', 'Art. 4')).toBe(poolKey('dsgvo', 'art-4'));
    expect(poolKey('dsgvo', 'Art. 4')).not.toBe(poolKey('nis2', 'Art. 4'));
  });
});
