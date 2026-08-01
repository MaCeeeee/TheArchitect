/**
 * Tests für die Ontologie-Facette `canonicalActions` (THE-438 Slice 1, Task 1).
 * shared trägt keine eigenen Tests — der Testort ist der Server (Muster wie
 * interpretsAudit.test.ts).
 *
 * Die Facette ist der eingefrorene Handlungs-Katalog aus THE-538. Sie ist der
 * Bezugspunkt der Harmonisierung: zwei Pflichten sind Kandidaten, wenn sie auf
 * DENSELBEN Eintrag zeigen — nicht, wenn ihre Texte einander ähneln. Drei
 * Verfahren, die über die Formulierung gehen (Jaccard, Embedding-Paare, gröbere
 * Granularität), fanden 0 Treffer; die kanonische Handlung trennt dagegen
 * 35 % (Mehrheit dreier Modell-Häuser) gegen 0/60 in der Negativ-Kontrolle.
 */
import {
  NORM_ONTOLOGY,
  CANONICAL_ACTION_IDS,
  isCanonicalAction,
  CanonicalActionSchema,
  assertOntologyValid,
  type CanonicalActionId,
} from '@thearchitect/shared';

describe('canonicalActions (THE-438)', () => {
  it('ships a valid ontology with the new facet', () => {
    expect(() => assertOntologyValid()).not.toThrow();
    expect(NORM_ONTOLOGY.canonicalActions.length).toBeGreaterThanOrEqual(20);
  });

  it('derives the id set from the data (no parallel enum)', () => {
    expect(CANONICAL_ACTION_IDS).toEqual(NORM_ONTOLOGY.canonicalActions.map((a) => a.id));
  });

  it('accepts in-catalogue ids and rejects invented ones', () => {
    expect(CanonicalActionSchema.safeParse('vorfall-melden-behoerde').success).toBe(true);
    expect(CanonicalActionSchema.safeParse('erfundene-handlung').success).toBe(false);
    expect(isCanonicalAction('technisch-organisatorische-massnahmen')).toBe(true);
    expect(isCanonicalAction('')).toBe(false);
  });

  it('gives every entry a description — the classifier prompt is built from it', () => {
    for (const a of NORM_ONTOLOGY.canonicalActions) {
      expect(a.description.trim().length).toBeGreaterThan(10);
    }
  });

  it('keeps labels English — they are user-visible', () => {
    // Projektkonvention: user-sichtbare Strings Englisch, Kommentare/Doku Deutsch.
    for (const a of NORM_ONTOLOGY.canonicalActions) {
      expect(a.label).not.toMatch(/[äöüßÄÖÜ]/);
    }
  });

  it('catches duplicate ids in the new facet like every other facet', () => {
    const broken = {
      ...NORM_ONTOLOGY,
      canonicalActions: [
        { id: 'dup', label: 'A', description: 'lange genug für das Schema' },
        { id: 'dup', label: 'B', description: 'lange genug für das Schema' },
      ],
    };
    expect(() => assertOntologyValid(broken)).toThrow(/canonicalActions/);
  });

  it('rejects an entry whose description is too short to build a prompt from', () => {
    const broken = {
      ...NORM_ONTOLOGY,
      canonicalActions: [{ id: 'x', label: 'X', description: 'kurz' }],
    };
    expect(() => assertOntologyValid(broken)).toThrow();
  });

  it('bumped the ontology version (the catalogue version IS the catalogue freeze)', () => {
    const [major, minor] = NORM_ONTOLOGY.ontologyVersion.split('.').map(Number);
    expect(major).toBe(1);
    expect(minor).toBeGreaterThanOrEqual(8);
  });

  it('exposes the id union as a type (compile-time guard, not just runtime)', () => {
    const id: CanonicalActionId = 'wirksamkeit-pruefen';
    expect(isCanonicalAction(id)).toBe(true);
  });
});
