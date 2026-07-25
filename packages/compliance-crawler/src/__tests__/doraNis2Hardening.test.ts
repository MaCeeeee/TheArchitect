/**
 * AC-4-Härtetest — DORA Art. 1 ↔ NIS2 Art. 4 (THE-433, Task 5).
 *
 * Die adjudizierte Wahrheit des eingefrorenen Goldens (relations.v4.json,
 * Fall dora-art-1__nis2-art-4) ist PREVAILS_OVER a→b: DORA Art. 1 Abs. 2
 * erklärt DORA „for the purposes of Article 4 of that Directive" zum
 * sektorspezifischen Rechtsakt — Gleichwertigkeit-als-Ausnahme = Verdrängung
 * (RUBRIC.md C5a, rp-2 RULE 3).
 *
 * WAS DIESER TEST DETERMINISTISCH BEWEIST (zweiteilig, bewusst OHNE Live-LLM):
 *  (a) Kandidaten-Teil: enumerateRelationCandidates findet auf den ECHTEN
 *      Texten das Paar dora:art-1 → nis2:art-4 mit Pinpoint auf Art. 4 —
 *      die Kante steht dem Klassifikator überhaupt zur Entscheidung an.
 *      (Das erforderte die anaphorische Pinpoint-Erweiterung des Miners:
 *      „Article 4 OF THAT DIRECTIVE" steht NACH der Zitierung, nicht davor.)
 *  (b) Prompt-Teil: buildRelationsPrompt legt für dieses Paar die
 *      Verdrängungs-Regel (rp-2 RULE 3, „Equivalence-as-exception is
 *      displacement") UND beide Volltexte vor — die Information, die laut
 *      Adjudikation die Entscheidung trägt, liegt dem Modell vollständig vor.
 *
 * WAS ER BEWUSST NICHT BEWEIST: dass Haiku wirklich PREVAILS_OVER antwortet.
 * Ein Test, der dem gemockten LLM die erwartete Antwort in den Mund legt,
 * wäre zirkulär. Der Live-Beweis gehört in die Baseline-Messung (Task 4,
 * relations:baseline über alle 175 Golden-Fälle — dieser Fall ist einer
 * davon) bzw. in den Ops-Lauf (Task 7, Stichprobe: DORA↔NIS2-Kante da?).
 * Fällt er dort, wird er als dokumentierte Grenze mit Fehleranalyse
 * ausgewiesen — kein stilles Bestehen (Plan, AC-4).
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/doraNis2Hardening.test.ts --verbose
 */
import { enumerateRelationCandidates, type RelationCandidateDoc } from '../lib/relationCandidates';
import { RELATIONS_RUBRIC_RULES, buildRelationsPrompt } from '@thearchitect/shared';
import fixture from './fixtures/dora-art1-nis2-art4.json';

const doraArt1 = fixture.doraArt1 as RelationCandidateDoc;
const nis2Art4 = fixture.nis2Art4 as RelationCandidateDoc;

describe('AC-4 Härtetest: DORA Art. 1 ↔ NIS2 Art. 4', () => {
  it('Fixture trägt die adjudizierte Wahrheit des frozen Goldens (Selbstbeschreibung, kein Test-Orakel)', () => {
    expect(fixture.goldenCaseId).toBe('dora-art-1__nis2-art-4');
    expect(fixture.goldenRelation).toBe('PREVAILS_OVER');
    expect(fixture.goldenDirection).toBe('a-to-b');
    // Der textliche Kern, auf dem die Adjudikation ruht, ist wirklich da:
    expect(doraArt1.fullText).toContain('for the purposes of Article 4 of that Directive');
    expect(nis2Art4.fullText).toContain('shall not apply to such entities');
  });

  it('(a) Kandidaten-Teil: das Paar dora:art-1 → nis2:art-4 wird mit Pinpoint auf Art. 4 aufgezählt', () => {
    const result = enumerateRelationCandidates([doraArt1, nis2Art4]);
    const pair = result.candidates.find(
      (c) => c.citing.regulationKey === 'dora:art-1' && c.target.regulationKey === 'nis2:art-4'
    );
    expect(pair).toBeDefined();
    expect(pair!.evidence.articleHints).toContain('4');
    // Der Verweis-Beleg ist die NIS2-Zitierung selbst — nachvollziehbar für den Reviewer.
    expect(pair!.evidence.matched).toContain('2022/2555');
  });

  it('(a) Nebenprüfung: der Vorwärts-Pinpoint (Art. 3, vor der Zitierung) bleibt erhalten', () => {
    // DORA Art. 1 nennt zusätzlich „national rules transposing Article 3 of
    // Directive (EU) 2022/2555" — Art. 3 ist nicht im Fixture-Korpus und muss
    // LAUT als unauflösbares Ziel erscheinen, nicht still verschwinden.
    const result = enumerateRelationCandidates([doraArt1, nis2Art4]);
    expect(
      result.unresolvedTargets.some((u) => u.citingKey === 'dora:art-1' && u.articleHint === '3')
    ).toBe(true);
  });

  it('(b) Prompt-Teil: der Batch-Prompt für dieses Paar trägt die Verdrängungs-Regel und beide Volltexte', () => {
    const result = enumerateRelationCandidates([doraArt1, nis2Art4]);
    const pair = result.candidates.find(
      (c) => c.citing.regulationKey === 'dora:art-1' && c.target.regulationKey === 'nis2:art-4'
    )!;
    // Exakt der Prompt, den der Batch fährt: A = zitierendes Dokument, B = Ziel.
    const prompt = buildRelationsPrompt({ a: pair.citing, b: pair.target });

    // Die entscheidungstragende rp-2-Regel (RULE 3, inkl. des adjudizierten
    // Präzedenzfalls SELBST) liegt dem Modell vor:
    expect(prompt).toContain('Equivalence-as-exception is displacement');
    expect(prompt).toContain('precedent: DORA Art. 1 → NIS2 Art. 4');
    // … und die Rubrik im Prompt ist wirklich die geteilte rp-2-Rubrik:
    expect(prompt).toContain(RELATIONS_RUBRIC_RULES);

    // Beide Volltexte vollständig im Prompt — insbesondere die Passagen, die
    // laut Adjudikation die Verdrängung tragen:
    expect(prompt).toContain(doraArt1.fullText);
    expect(prompt).toContain(nis2Art4.fullText);
    expect(prompt).toContain('sector-specific Union legal act for the purposes of Article 4');
    expect(prompt).toContain('shall not apply to such entities');

    // Und PREVAILS_OVER steht als wählbare Option in der geschlossenen Liste:
    expect(prompt).toContain('PREVAILS_OVER');
  });
});
