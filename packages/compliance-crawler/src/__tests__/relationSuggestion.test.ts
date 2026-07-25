/**
 * THE-433 (Slice 1, Task 1): RelationSuggestion — shared Zod-Schema + additives
 * Korpus-Schema-Feld.
 *
 * Zwei Prüfebenen, bewusst in EINER Datei (der Typ und das Mongoose-Feld sind
 * dieselbe Vertragsfläche):
 *  1. Das Zod-Schema aus @thearchitect/shared — die Validierungs-Grenze, an der
 *     ein LLM-Vorschlag ins System eintritt. Kernregel: NUR `inferred`-
 *     Relationstypen der E7-Registry (AC-5) — 'AMENDS' & Co. kommen aus
 *     ELI/CELLAR-Metadaten und dürfen nie als KI-Vorschlag validieren.
 *  2. Das Mongoose-Schema (regulation.model.ts) — mongoose strict streicht
 *     unbekannte Pfade kommentarlos; ohne Schema-Feld wäre jeder Batch-Write
 *     ein stilles No-op (Beweis-Muster wie typingBatch.test.ts, kein Live-Mongo,
 *     validateSync auf Dokument-Ebene).
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/relationSuggestion.test.ts
 */
import { RelationSuggestionSchema, type RelationSuggestion } from '@thearchitect/shared';
import { Regulation } from '../db/regulation.model';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

/** Valider Eintrag — a = das zitierende Dokument (Träger), b = das Ziel. */
const validSuggestion: RelationSuggestion = {
  targetRegulationKey: 'nis2:art-3',
  targetVersionHash: HASH_B,
  sourceVersionHash: HASH_A,
  relationType: 'PREVAILS_OVER',
  direction: 'a-to-b',
  confidence: 0.82,
  evidence: {
    matched: 'Directive (EU) 2022/2555',
    articleHints: ['3'],
  },
  promptVersion: 'rp-1',
  model: 'claude-test-1',
  suggestedAt: '2026-07-25T12:00:00.000Z',
  status: 'suggested',
};

describe('RelationSuggestionSchema (shared, THE-433 Task 1)', () => {
  it('akzeptiert einen validen Eintrag', () => {
    const parsed = RelationSuggestionSchema.safeParse(validSuggestion);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.relationType).toBe('PREVAILS_OVER');
      expect(parsed.data.direction).toBe('a-to-b');
    }
  });

  it("weist 'AMENDS' als relationType zurück — metadata-Kanten sind kein KI-Vorschlag (AC-5)", () => {
    const parsed = RelationSuggestionSchema.safeParse({ ...validSuggestion, relationType: 'AMENDS' });
    expect(parsed.success).toBe(false);
  });

  it('weist einen fehlenden targetVersionHash zurück — ein Vorschlag ohne Text-Anker des Ziels ist nicht interpretierbar', () => {
    const { targetVersionHash: _omit, ...withoutTarget } = validSuggestion;
    const parsed = RelationSuggestionSchema.safeParse(withoutTarget);
    expect(parsed.success).toBe(false);
  });

  it('weist einen unbekannten Relationstyp zurück (nicht in der E7-Registry)', () => {
    const parsed = RelationSuggestionSchema.safeParse({ ...validSuggestion, relationType: 'NOT_A_TYPE' });
    expect(parsed.success).toBe(false);
  });

  it('confidence ist optional, muss aber in [0,1] liegen', () => {
    const { confidence: _omit, ...withoutConfidence } = validSuggestion;
    expect(RelationSuggestionSchema.safeParse(withoutConfidence).success).toBe(true);
    expect(RelationSuggestionSchema.safeParse({ ...validSuggestion, confidence: 1.5 }).success).toBe(false);
  });
});

// ─── Mongoose: additives Korpus-Feld ─────────────────────────────────

const base = {
  regulationKey: 'dora:art-1',
  versionHash: HASH_A,
  source: 'dora',
  jurisdiction: 'EU',
  paragraphNumber: 'Art. 1',
  title: 'Test title',
  fullText: 'x'.repeat(60),
  sourceUrl: 'https://example.org/law',
  effectiveFrom: new Date('2024-01-01'),
  language: 'en',
};

describe('Regulation.relationSuggestions + relationScan (additiv, THE-433 Task 1)', () => {
  it('persistiert einen validen relationSuggestions-Eintrag (kein strict-mode-Strip)', () => {
    const doc = new Regulation({ ...base, relationSuggestions: [validSuggestion] });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.relationSuggestions).toHaveLength(1);
    expect(doc.relationSuggestions?.[0].targetRegulationKey).toBe('nis2:art-3');
    expect(doc.relationSuggestions?.[0].evidence.articleHints).toEqual(['3']);
  });

  it('persistiert den relationScan-Idempotenz-Anker', () => {
    const doc = new Regulation({
      ...base,
      relationScan: { promptVersion: 'rp-1', versionHash: HASH_A, scannedAt: new Date('2026-07-25') },
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.relationScan?.promptVersion).toBe('rp-1');
    expect(doc.relationScan?.versionHash).toBe(HASH_A);
  });

  it('weist einen relationSuggestions-Eintrag ohne targetVersionHash zurück', () => {
    const { targetVersionHash: _omit, ...withoutTarget } = validSuggestion;
    const err = new Regulation({ ...base, relationSuggestions: [withoutTarget] }).validateSync();
    expect(err).toBeDefined();
  });

  it('weist einen ungültigen status zurück', () => {
    const err = new Regulation({
      ...base,
      relationSuggestions: [{ ...validSuggestion, status: 'auto-confirmed' }],
    }).validateSync();
    expect(err).toBeDefined();
  });

  it('bestehende Dokumente ohne die neuen Felder bleiben valide (rein additiv)', () => {
    const doc = new Regulation(base);
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.relationSuggestions ?? []).toHaveLength(0);
    expect(doc.relationScan).toBeUndefined();
  });
});
