/**
 * THE-433 (Slice 1, Task 2): enumerateRelationCandidates — reine, deterministische
 * Kandidaten-Aufzählung für den Relations-Batch.
 *
 * Kein I/O, kein Mongo, kein LLM: die Funktion bekommt Korpus-Dokumente als
 * Plain Objects und zählt artikelscharfe Querverweise (Pinpoints) auf. Die
 * Verweis-Muster kommen aus @thearchitect/shared (lawPatterns — EINE Wahrheit
 * für Eval-Harness und Batch).
 *
 * Regeln unter Test (aus der Task-Spec):
 *  (a) Pinpoint auf existierende Ziel-Provision → Kandidat mit Evidence
 *  (b) law-level-Erwähnung (Gesetz ohne Artikel) → KEIN Kandidat, aber gezählt
 *  (c) Sprachzwillinge derselben Familie (dsgvo vs dsgvo-en) → nie Kandidat
 *  (d) Ziel-Artikel fehlt in docs → unresolvedTargets (laut, nie still verworfen)
 *  (e) deterministisch (stabile Sortierung) + duplikatfrei (citing+target einmal)
 *  (f) sprachreine Ziel-Auflösung: bei mehreren Sprachvarianten der Ziel-Familie
 *      gewinnt die Variante mit der Sprache des zitierenden Dokuments
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/relationCandidates.test.ts
 */
import { enumerateRelationCandidates, type RelationCandidateDoc } from '../lib/relationCandidates';

function doc(
  regulationKey: string,
  source: string,
  paragraphNumber: string,
  fullText: string,
  language: 'de' | 'en',
): RelationCandidateDoc {
  return {
    regulationKey,
    source,
    paragraphNumber,
    title: `Title ${regulationKey}`,
    fullText,
    language,
    versionHash: 'h-' + regulationKey,
  };
}

const FILLER = 'This provision regulates security measures for the entities in scope. ';

describe('enumerateRelationCandidates (THE-433 Task 2)', () => {
  it('(a) Pinpoint auf existierende Ziel-Provision → Kandidat mit Evidence', () => {
    const docs = [
      doc(
        'dora:art-1',
        'dora',
        'Art. 1',
        FILLER + 'In relation to entities covered by Article 3 of Directive (EU) 2022/2555, this Regulation shall apply.',
        'en',
      ),
      doc('nis2:art-3', 'nis2', 'Art. 3', FILLER + 'Sector-specific Union legal acts take precedence.', 'en'),
    ];

    const { candidates, unresolvedTargets, stats } = enumerateRelationCandidates(docs);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].citing.regulationKey).toBe('dora:art-1');
    expect(candidates[0].target.regulationKey).toBe('nis2:art-3');
    expect(candidates[0].evidence.matched).toContain('2022/2555');
    expect(candidates[0].evidence.articleHints).toContain('3');
    expect(unresolvedTargets).toHaveLength(0);
    expect(stats.lawLevelRejected).toBe(0);
  });

  it('(b) law-level-Erwähnung ohne Artikel → kein Kandidat, aber in stats gezählt', () => {
    const docs = [
      doc(
        'dora:art-2',
        'dora',
        'Art. 2',
        FILLER + 'Processing of personal data shall comply with Regulation (EU) 2016/679 in all cases.',
        'en',
      ),
      doc('dsgvo:art-32', 'dsgvo', 'Art. 32', FILLER + 'Sicherheit der Verarbeitung ist zu gewährleisten.', 'de'),
    ];

    const { candidates, unresolvedTargets, stats } = enumerateRelationCandidates(docs);

    expect(candidates).toHaveLength(0);
    expect(unresolvedTargets).toHaveLength(0);
    expect(stats.lawLevelRejected).toBe(1);
  });

  it('(c) Sprachzwillinge derselben Familie sind nie Kandidaten', () => {
    // dsgvo-en Art. 5 nennt „Article 32 of Regulation (EU) 2016/679" — das ist
    // die EIGENE Familie (gdpr); dsgvo Art. 32 existiert, darf aber kein Ziel sein.
    const docs = [
      doc(
        'dsgvo-en:art-5',
        'dsgvo-en',
        'Art. 5',
        FILLER + 'Security shall be ensured pursuant to Article 32 of Regulation (EU) 2016/679.',
        'en',
      ),
      doc('dsgvo:art-32', 'dsgvo', 'Art. 32', FILLER + 'Sicherheit der Verarbeitung ist zu gewährleisten.', 'de'),
    ];

    const { candidates, unresolvedTargets, stats } = enumerateRelationCandidates(docs);

    expect(candidates).toHaveLength(0);
    expect(unresolvedTargets).toHaveLength(0);
    // Familien-Ausschluss heißt: gar nicht erst gescannt — auch kein law-level-Zähler.
    expect(stats.lawLevelRejected).toBe(0);
  });

  it('(d) Ziel-Artikel fehlt in docs → unresolvedTargets-Eintrag, nie still verworfen', () => {
    const docs = [
      doc(
        'dora:art-5',
        'dora',
        'Art. 5',
        FILLER + 'Without prejudice to Article 99 of Regulation (EU) 2016/679, the following applies.',
        'en',
      ),
      doc('dsgvo:art-32', 'dsgvo', 'Art. 32', FILLER + 'Sicherheit der Verarbeitung ist zu gewährleisten.', 'de'),
    ];

    const { candidates, unresolvedTargets } = enumerateRelationCandidates(docs);

    expect(candidates).toHaveLength(0);
    expect(unresolvedTargets).toHaveLength(1);
    expect(unresolvedTargets[0]).toMatchObject({ citingKey: 'dora:art-5', articleHint: '99' });
    expect(unresolvedTargets[0].targetSource).toMatch(/^dsgvo/);
  });

  it('(e) deterministisch bei umgekehrter Input-Reihenfolge + duplikatfrei bei doppelter Zitierung', () => {
    const docs = [
      doc(
        'dora:art-1',
        'dora',
        'Art. 1',
        FILLER +
          'Entities under Article 3 of Directive (EU) 2022/2555 are covered. ' +
          'The obligations of Article 3 of Directive (EU) 2022/2555 remain applicable.',
        'en',
      ),
      doc('nis2:art-3', 'nis2', 'Art. 3', FILLER + 'Sector-specific Union legal acts take precedence.', 'en'),
      doc(
        'cra-en:art-2',
        'cra-en',
        'Art. 2',
        FILLER + 'For products also governed by Article 3 of Directive (EU) 2022/2555 the following applies.',
        'en',
      ),
    ];

    const forward = enumerateRelationCandidates(docs);
    const reversed = enumerateRelationCandidates([...docs].reverse());

    // Duplikatfrei: dora:art-1 zitiert nis2:art-3 zweimal → EIN Kandidat.
    const pairs = forward.candidates.map((c) => `${c.citing.regulationKey}->${c.target.regulationKey}`);
    expect(pairs).toEqual(['cra-en:art-2->nis2:art-3', 'dora:art-1->nis2:art-3']);
    // Deterministisch: identisches Ergebnis unabhängig von der Input-Reihenfolge.
    expect(reversed).toEqual(forward);
  });

  it('(f) sprachreine Auflösung: Ziel-Familie mit zwei Sprachvarianten → Variante in Sprache des Zitierenden', () => {
    const docs = [
      doc(
        'dora:art-6',
        'dora',
        'Art. 6',
        FILLER + 'Security of processing follows Article 32 of Regulation (EU) 2016/679.',
        'en',
      ),
      doc('dsgvo:art-32', 'dsgvo', 'Art. 32', FILLER + 'Sicherheit der Verarbeitung ist zu gewährleisten.', 'de'),
      doc('dsgvo-en:art-32', 'dsgvo-en', 'Art. 32', FILLER + 'Security of processing shall be ensured.', 'en'),
    ];

    const { candidates } = enumerateRelationCandidates(docs);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].target.regulationKey).toBe('dsgvo-en:art-32');
  });

  it('(g) Familie mit Registry-Mustern, aber 0 Dokumenten im Input → laut gezählt, nie still übersprungen', () => {
    // Review-Finding 1: früher wurde nur über die im Input VERTRETENEN Familien
    // gescannt — ein Verweis auf eine abwesende Familie (hier: gdpr, kein
    // dsgvo-Dokument im Input) verschwand komplett (kein Kandidat, kein
    // unresolvedTarget, kein stats-Zähler).
    const docs = [
      doc(
        'dora:art-9',
        'dora',
        'Art. 9',
        FILLER + 'Die Verarbeitung erfolgt gemäß Artikel 6 der Verordnung (EU) 2016/679 in allen Fällen.',
        'de',
      ),
      doc('nis2:art-3', 'nis2', 'Art. 3', FILLER + 'Sector-specific Union legal acts take precedence.', 'en'),
    ];

    const { candidates, unresolvedTargets, stats } = enumerateRelationCandidates(docs);

    expect(candidates).toHaveLength(0);
    // Der Pinpoint auf die abwesende Familie ist ein nicht auflösbares Ziel — laut.
    expect(unresolvedTargets).toHaveLength(1);
    expect(unresolvedTargets[0]).toMatchObject({ citingKey: 'dora:art-9', articleHint: '6' });
    expect(unresolvedTargets[0].targetSource).toMatch(/^dsgvo/);
    // Und die Familie selbst wird mit ihrer Treffer-Zahl ausgewiesen.
    expect(stats.familiesWithoutDocs).toEqual({ gdpr: 1 });
  });

  // THE-519: Satz-Grenzen-Regel (geerbt aus @thearchitect/shared referencesLaw).
  // Ein „Artikel N" im Nachbarsatz darf keinen Kandidaten auf die fremde
  // Ziel-Provision erzeugen — genau der Mechanismus des dsgvo-4↔nis2-35-Artefakts.
  it('(h) Pinpoint über eine Satzgrenze hinweg erzeugt keinen Kandidaten auf die fremde Provision', () => {
    const docs = [
      doc(
        'dsgvo:art-4',
        'dsgvo',
        'Art. 4',
        // Satz 1 nennt „Artikel 35" OHNE Gesetzes-Bezug; erst Satz 2 zitiert NIS2
        // mit dem satz-eigenen Pinpoint „Artikel 5".
        FILLER +
          'Die zuständige Behörde nach Artikel 35 handelt unverzüglich. Ein Verstoß nach Artikel 5 im Sinne der Verordnung (EU) 2022/2555 ist zu melden.',
        'de',
      ),
      doc('nis2:art-5', 'nis2', 'Art. 5', FILLER + 'Regelung des Artikels 5.', 'de'),
      doc('nis2:art-35', 'nis2', 'Art. 35', FILLER + 'Regelung des Artikels 35.', 'de'),
    ];

    const { candidates } = enumerateRelationCandidates(docs);
    const targets = candidates.map((c) => c.target.regulationKey);
    expect(targets).toContain('nis2:art-5'); // satz-eigener Pinpoint → Kandidat
    expect(targets).not.toContain('nis2:art-35'); // Nachbarsatz-Nummer → kein Kandidat
  });

  it('meldet Quellen ohne Referenz-Muster laut in stats (nie stiller Blindfleck)', () => {
    const docs = [
      doc('mystery:art-1', 'mystery-law', 'Art. 1', FILLER + 'Some provision text without any citation.', 'en'),
      doc('nis2:art-3', 'nis2', 'Art. 3', FILLER + 'Sector-specific Union legal acts take precedence.', 'en'),
    ];

    const { stats } = enumerateRelationCandidates(docs);
    expect(stats.sourcesWithoutPatterns).toEqual(['mystery-law']);
  });

  // ─── THE-529 (Task 3): typing.provisionKind ans Kandidaten-Ziel ───
  //
  // Der mechanische INTERPRETS-Detektor (Task 4) braucht die Typisierung der
  // ZIEL-Provision als P2-Quelle („Ziel ist ein Definitions-Ort"). Sie wird
  // NUR durchgereicht, wenn sie nicht menschlich verworfen ist: ein
  // rejected-Typing ist ein als falsch markiertes Label und darf keinen
  // mechanischen Beleg speisen.
  describe('typing.provisionKind am Kandidaten (THE-529 Task 3)', () => {
    const citing = doc(
      'dora:art-1',
      'dora',
      'Art. 1',
      FILLER + 'In relation to entities covered by Article 3 of Directive (EU) 2022/2555, this Regulation shall apply.',
      'en',
    );
    const target = doc('nis2:art-3', 'nis2', 'Art. 3', FILLER + 'Sector-specific Union legal acts take precedence.', 'en');

    function run(typing?: { provisionKind?: string; status?: string }) {
      const { candidates } = enumerateRelationCandidates([citing, { ...target, typing }]);
      expect(candidates).toHaveLength(1);
      return candidates[0];
    }

    it('confirmed-Typing → target.provisionKind am Kandidaten', () => {
      const c = run({ provisionKind: 'definition', status: 'confirmed' });
      expect(c.target.provisionKind).toBe('definition');
    });

    it('suggested-Typing (nicht rejected) → wird ebenfalls durchgereicht', () => {
      const c = run({ provisionKind: 'definition', status: 'suggested' });
      expect(c.target.provisionKind).toBe('definition');
    });

    it('rejected-Typing → provisionKind fehlt (verworfenes Label speist keinen Detektor)', () => {
      const c = run({ provisionKind: 'definition', status: 'rejected' });
      expect(c.target.provisionKind).toBeUndefined();
    });

    it('typing ohne provisionKind → Feld fehlt', () => {
      const c = run({ status: 'confirmed' });
      expect(c.target.provisionKind).toBeUndefined();
    });

    it('ohne typing → Feld fehlt', () => {
      const c = run(undefined);
      expect(c.target.provisionKind).toBeUndefined();
    });
  });
});
