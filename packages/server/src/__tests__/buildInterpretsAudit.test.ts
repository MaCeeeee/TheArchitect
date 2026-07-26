/**
 * Tests für den Instrument-Generator (THE-519, Task 4).
 *
 * Getestet wird die reine Sammel-/Ableitungs-Logik (`collectAuditSubset`,
 * `deriveCaseAudit`, `buildSidecar`) an kleinen Fixtures — NIEMALS gegen den
 * echten 1532er-Pool. Die Datei-I/O (`main`) ist bewusst ungetestet (Muster wie
 * buildRelationsGolden.test.ts).
 *
 * Run: cd packages/server && npx jest src/__tests__/buildInterpretsAudit.test.ts
 */
import {
  collectAuditSubset,
  deriveCaseAudit,
  buildSidecar,
  identsForSource,
  splitSentences,
  isDefinitionTitle,
  type AuditSideInput,
  type PoolDoc,
} from '../scripts/build-interprets-audit';
import type { RelationsGoldenCase } from '../evals/relationsGolden';

const PAD = ' Weiterer Kontexttext, damit die Provision lang genug für realistische Sätze ist.';

function side(
  regulationKey: string,
  source: string,
  paragraphNumber: string,
  fullText: string,
  title?: string,
  language: 'de' | 'en' = 'de',
): AuditSideInput {
  return { regulationKey, source, paragraphNumber, title, fullText: fullText + PAD, language };
}

function gcase(
  caseId: string,
  a: AuditSideInput,
  b: AuditSideInput,
  relation: string | null,
  direction?: 'a-to-b' | 'b-to-a',
): RelationsGoldenCase {
  return {
    caseId,
    a: { ...a },
    b: { ...b },
    ...(relation === null ? { relation: null } : relation ? { relation, direction } : {}),
  } as RelationsGoldenCase;
}

// ── Wiederkehrende Fixtures ──────────────────────────────────────────
const CRA_INCIDENT =
  "(43) ‘incident’ means an incident as defined in Article 6, point (6), of Directive (EU) 2022/2555;";
const NIS2_INCIDENT_DEF = "(6) ‘incident’ means an event compromising the availability of a network;";

/** Echte INTERPRETS-Anleihe cra → nis2 (Ziel-Überschrift „Definitions" ⇒ P2). */
function craNis2Case(caseId = 'cra-en-art-3__nis2-art-6', craSrc = 'cra-en', nis2Src = 'nis2', lang: 'de' | 'en' = 'en'): RelationsGoldenCase {
  return gcase(
    caseId,
    side(`${craSrc}:art-3`, craSrc, 'Art. 3', CRA_INCIDENT, 'Definitions', lang),
    side(`${nis2Src}:art-6`, nis2Src, 'Art. 6', NIS2_INCIDENT_DEF, 'Definitions', lang),
    'INTERPRETS',
    'b-to-a',
  );
}

describe('Hilfsfunktionen', () => {
  it('identsForSource zieht die Verordnungsnummer der Familie aus den Mustern', () => {
    expect(identsForSource('nis2')).toContain('2022/2555');
    expect(identsForSource('dsgvo')).toContain('2016/679');
    expect(identsForSource('psd2-de')).toContain('2015/2366');
    expect(identsForSource('unbekannt')).toEqual([]);
  });

  it('splitSentences kappt an Satzgrenzen, NICHT an juristischen Abkürzungen', () => {
    const s = splitSentences('Erster Satz endet hier. Zweiter Satz nennt Art. 5 und läuft weiter; Dritter Satz.');
    expect(s.length).toBe(3);
    expect(s[1]).toMatch(/Art\. 5/); // „Art. 5" hat den Satz nicht zerschnitten
  });

  it('isDefinitionTitle erkennt Definitions-Überschriften DE + EN', () => {
    expect(isDefinitionTitle('Begriffsbestimmungen')).toBe(true);
    expect(isDefinitionTitle('Definitions')).toBe(true);
    expect(isDefinitionTitle('Zuständige Behörden')).toBe(false);
    expect(isDefinitionTitle(undefined)).toBe(false);
  });
});

describe('deriveCaseAudit — Ableitung ohne evidence-Feld', () => {
  it('bestimmt citingSide + citingSentence korrekt und leitet interprets ab', () => {
    const c = craNis2Case();
    const d = deriveCaseAudit(c.a as AuditSideInput, c.b as AuditSideInput);
    expect(d.autoVerdict).toBe('interprets');
    expect(d.citingSide).toBe('a'); // cra zitiert nis2
    expect(d.citingSentence).toMatch(/as defined in Article 6/);
    expect(d.pairTargetArticle).toBe('6');
    expect(d.direction).toBe('b-to-a'); // vom Definierer (nis2 = Ziel) weg
    expect(d.p0).toBe(true);
    expect(d.p1).toBe(true);
  });

  it('kein Verweis-Satz auf den Paar-Artikel auf keiner Seite → pair-artifact', () => {
    // Zwei Provisions, die einander NICHT per Artikel zitieren.
    const a = side('dsgvo:art-4', 'dsgvo', 'Art. 4', 'Im Sinne dieser Verordnung bezeichnet der Ausdruck bestimmte Dinge.', 'Begriffsbestimmungen');
    const b = side('nis2-de:art-35', 'nis2-de', 'Art. 35', 'Diese Vorschrift regelt Verstöße ohne jeden Verweis auf eine andere Verordnung.', 'Verstöße');
    const d = deriveCaseAudit(a, b);
    expect(d.autoVerdict).toBe('pair-artifact');
    expect(d.citingSentence).toBeUndefined();
    expect(d.p0).toBe(false);
  });
});

describe('collectAuditSubset — Sammel-Logik a ∪ b ∪ c', () => {
  it('(a) zieht INTERPRETS-Fälle', () => {
    const cases = [
      craNis2Case(),
      gcase(
        'dora-art-1__nis2-art-4',
        side('dora:art-1', 'dora', 'Art. 1', 'Diese Verordnung gilt für Finanzunternehmen.', 'Anwendungsbereich'),
        side('nis2:art-4', 'nis2', 'Art. 4', 'Sektorspezifische Rechtsakte gehen vor.', 'Sektor'),
        null,
      ),
    ];
    const subset = collectAuditSubset(cases);
    const ids = subset.cases.map((c) => c.caseId);
    expect(ids).toContain('cra-en-art-3__nis2-art-6');
    expect(subset.cases.find((c) => c.caseId === 'cra-en-art-3__nis2-art-6')!.bucket).toBe('a-interprets');
    expect(subset.counts.a).toBe(1);
  });

  it('(b) zieht einen null-Fall MIT Leih-Operator als potenziellen False Negative', () => {
    const withOperator = gcase(
      'data-act-de-art-2__dsgvo-art-9',
      side(
        'data-act-de:art-2',
        'data-act-de',
        'Art. 2',
        '„besondere Kategorien“ besondere Kategorien im Sinne des Artikels 9 der Verordnung (EU) 2016/679;',
        'Begriffsbestimmungen',
      ),
      side('dsgvo:art-9', 'dsgvo', 'Art. 9', 'Verarbeitung besonderer Kategorien personenbezogener Daten ist untersagt.', 'Besondere Kategorien'),
      null,
    );
    const withoutOperator = gcase(
      'dora-de-art-46__psd2-de-art-33',
      side('dora-de:art-46', 'dora-de', 'Art. 46', 'bei den nach der Richtlinie (EU) 2015/2366 ausgenommenen Instituten', 'Behörden'),
      side('psd2-de:art-33', 'psd2-de', 'Art. 33', 'Kontoinformationsdienstleister unterliegen besonderen Regeln.', 'KID'),
      null,
    );
    const subset = collectAuditSubset([withOperator, withoutOperator]);
    const ids = subset.cases.map((c) => c.caseId);
    expect(ids).toContain('data-act-de-art-2__dsgvo-art-9'); // Operator ⇒ Bucket b
    expect(ids).not.toContain('dora-de-art-46__psd2-de-art-33'); // reine Nutzung ⇒ nicht b
    expect(subset.cases.find((c) => c.caseId === 'data-act-de-art-2__dsgvo-art-9')!.bucket).toBe('b-none-operator');
    expect(subset.counts.b).toBe(1);
  });

  it('(c) zieht einen Pool-Kandidaten mit P0 ✓, ignoriert einen ohne Operator', () => {
    const pool: PoolDoc[] = [
      // Borrow-Kandidat (Operator + Definiendum) → P0 ✓
      {
        source: 'cra-de',
        paragraphNumber: 'Art. 3',
        title: 'Begriffsbestimmungen',
        fullText: '„Vorfall“ bezeichnet einen Vorfall im Sinne des Artikels 6 der Verordnung (EU) 2022/2555;' + PAD,
        language: 'de',
        provisionKind: 'definition',
      },
      {
        source: 'nis2-de',
        paragraphNumber: 'Art. 6',
        title: 'Begriffsbestimmungen',
        fullText: '„Vorfall“ bezeichnet ein Ereignis, das die Verfügbarkeit beeinträchtigt.' + PAD,
        language: 'de',
        provisionKind: 'definition',
      },
      // Nutzungs-Doc OHNE Operator → kein Pool-Kandidat
      {
        source: 'dora-de',
        paragraphNumber: 'Art. 5',
        title: 'Behörden',
        fullText: 'bei den nach der Richtlinie (EU) 2015/2366 ausgenommenen Instituten handelt es sich um Ausnahmen.' + PAD,
        language: 'de',
      },
      {
        source: 'psd2-de',
        paragraphNumber: 'Art. 33',
        title: 'KID',
        fullText: 'Kontoinformationsdienstleister unterliegen besonderen Anforderungen.' + PAD,
        language: 'de',
      },
    ];
    const subset = collectAuditSubset([], pool);
    const ids = subset.cases.map((c) => c.caseId);
    expect(ids).toContain('cra-de-art-3__nis2-de-art-6'); // P0 ✓
    expect(ids).not.toContain('dora-de-art-5__psd2-de-art-33'); // kein Operator
    const poolCase = subset.cases.find((c) => c.caseId === 'cra-de-art-3__nis2-de-art-6')!;
    expect(poolCase.bucket).toBe('c-pool');
    expect(poolCase.p0).toBe(true);
    expect(subset.counts.c).toBe(1);
  });

  it('Pool-Kandidat, der schon in v4 steht, wird NICHT doppelt aufgenommen', () => {
    const v4 = [craNis2Case('cra-de-art-3__nis2-de-art-6', 'cra-de', 'nis2-de', 'de')];
    const pool: PoolDoc[] = [
      {
        source: 'cra-de',
        paragraphNumber: 'Art. 3',
        title: 'Begriffsbestimmungen',
        fullText: '„Vorfall“ bezeichnet einen Vorfall im Sinne des Artikels 6 der Verordnung (EU) 2022/2555;' + PAD,
        language: 'de',
      },
      {
        source: 'nis2-de',
        paragraphNumber: 'Art. 6',
        title: 'Begriffsbestimmungen',
        fullText: '„Vorfall“ bezeichnet ein Ereignis.' + PAD,
        language: 'de',
      },
    ];
    const subset = collectAuditSubset(v4, pool);
    expect(subset.cases.filter((c) => c.caseId === 'cra-de-art-3__nis2-de-art-6')).toHaveLength(1);
    expect(subset.counts.c).toBe(0);
  });
});

describe('Sprachzwillinge', () => {
  it('cra-de/cra-en-Paar mit gleichen Artikeln → zweiter trägt languageTwinOf', () => {
    const en = craNis2Case('cra-en-art-3__nis2-art-6', 'cra-en', 'nis2', 'en');
    const de = craNis2Case('cra-de-art-3__nis2-de-art-6', 'cra-de', 'nis2-de', 'de');
    const subset = collectAuditSubset([en, de]);
    const deCase = subset.cases.find((c) => c.caseId === 'cra-de-art-3__nis2-de-art-6')!;
    const enCase = subset.cases.find((c) => c.caseId === 'cra-en-art-3__nis2-art-6')!;
    // Kanonisch = kleinste caseId (cra-de… < cra-en…) → EN trägt den Verweis.
    expect(deCase.languageTwinOf).toBeUndefined();
    expect(enCase.languageTwinOf).toBe('cra-de-art-3__nis2-de-art-6');
  });
});

describe('Determinismus', () => {
  it('gleiche Eingabe → gleiche caseIds-Reihenfolge, unabhängig von Input-Sortierung', () => {
    const c1 = craNis2Case('cra-en-art-3__nis2-art-6', 'cra-en', 'nis2', 'en');
    const c2 = craNis2Case('cra-de-art-3__nis2-de-art-6', 'cra-de', 'nis2-de', 'de');
    const c3 = gcase(
      'dsgvo-art-4__nis2-de-art-35',
      side('dsgvo:art-4', 'dsgvo', 'Art. 4', 'bezeichnet der Ausdruck Dinge.', 'Begriffsbestimmungen'),
      side('nis2-de:art-35', 'nis2-de', 'Art. 35', 'eine Verletzung im Sinne von Artikel 4 Nummer 12 der Verordnung (EU) 2016/679', 'Verstöße'),
      'INTERPRETS',
      'a-to-b',
    );
    const a = collectAuditSubset([c1, c2, c3]).cases.map((c) => c.caseId);
    const b = collectAuditSubset([c3, c1, c2]).cases.map((c) => c.caseId);
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort()); // stabile caseId-Sortierung
  });
});

describe('buildSidecar', () => {
  it('caseIds-Liste ist sortiert und deckt perCase vollständig ab', () => {
    const subset = collectAuditSubset([craNis2Case()]);
    const sidecar = buildSidecar(subset, { frozenAt: '2026-07-26T00:00:00.000Z' });
    expect(sidecar.generatedFrom).toBe('relations.v4.json');
    expect(sidecar.caseIds).toEqual(subset.cases.map((c) => c.caseId));
    for (const id of sidecar.caseIds) {
      expect(sidecar.perCase[id]).toBeDefined();
      expect(sidecar.perCase[id].autoVerdict).toBeDefined();
    }
    expect(sidecar.perCase['cra-en-art-3__nis2-art-6'].direction).toBe('b-to-a');
  });
});
