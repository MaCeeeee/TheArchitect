/**
 * THE-516 / ADR-0006 — Scope-Guarantee purer Kern (Task 1).
 *
 * WARUM diese Tests: Der belegte Fehlermodus (THE-423/CRA) war fehlendes
 * Beweismaterial, nie fehlendes Finden. Der Kern hier entscheidet, WELCHE
 * scope-§§ konsumierbar sind (E3 — Präzedenz für alle künftigen
 * Typing-Konsumenten) und WIE sie injiziert werden (E2-Dosierung,
 * Score-Neutralität als harte Leitplanke). Jede E3-Regel wird einzeln
 * getestet, damit ein künftiger Konsument nicht eine Regel "aus Versehen"
 * lockern kann, ohne dass ein Test rot wird.
 */
import {
  selectScopeProvisions,
  injectScopeHits,
  guaranteeStateFor,
  type ScopeCorpusDoc,
} from '../services/scopeGuarantee.service';
import type { CorpusHit, DiscoveryCandidate } from '@thearchitect/shared';

const doc = (over: Partial<ScopeCorpusDoc> = {}): ScopeCorpusDoc => ({
  source: 'cra-de',
  paragraphNumber: 'Art. 2',
  title: 'Geltungsbereich',
  fullText: 'Diese Verordnung gilt für …',
  language: 'de',
  jurisdiction: 'EU',
  versionHash: 'v1',
  typing: { provisionKind: 'scope-applicability', versionHash: 'v1', status: 'suggested' },
  ...over,
});

const hit = (source: string, para: string, score: number): CorpusHit => ({
  regulationKey: `${source}:${para}`,
  versionHash: 'vx',
  source,
  paragraphNumber: para,
  title: 't',
  jurisdiction: 'EU',
  language: 'de',
  score,
});

const cand = (topHits: CorpusHit[]): DiscoveryCandidate => ({
  family: 'cra',
  sources: ['cra-de'],
  jurisdiction: 'EU',
  score: 0.87,
  hitCount: topHits.length,
  topHits,
});

describe('selectScopeProvisions — E3-Konsumregeln (jede Regel einzeln)', () => {
  // WARUM einzeln: E3 ist der Präzedenzfall für ALLE künftigen
  // Typing-Konsumenten — jede Regel braucht ihren eigenen roten Test.

  it('fehlendes typing ⇒ nicht konsumierbar', () => {
    expect(selectScopeProvisions([doc({ typing: undefined })], {})).toEqual([]);
  });

  it('falscher provisionKind ⇒ nicht konsumierbar', () => {
    const d = doc({ typing: { provisionKind: 'obligation', versionHash: 'v1', status: 'suggested' } });
    expect(selectScopeProvisions([d], {})).toEqual([]);
  });

  it('staler Text-Anker (typing.versionHash ≠ doc.versionHash) ⇒ wie untypisiert behandelt', () => {
    // Nach einer Novelle beschreibt das Label einen ALTEN Text — lieber keine
    // Garantie als eine falsche (ADR-0006 E3.1).
    const d = doc({ versionHash: 'v2', typing: { provisionKind: 'scope-applicability', versionHash: 'v1', status: 'confirmed' } });
    expect(selectScopeProvisions([d], {})).toEqual([]);
  });

  it('status=rejected ⇒ nie konsumieren', () => {
    const d = doc({ typing: { provisionKind: 'scope-applicability', versionHash: 'v1', status: 'rejected' } });
    expect(selectScopeProvisions([d], {})).toEqual([]);
  });

  it('status=suggested passiert', () => {
    expect(selectScopeProvisions([doc()], {})).toHaveLength(1);
  });

  it('status=confirmed passiert', () => {
    const d = doc({ typing: { provisionKind: 'scope-applicability', versionHash: 'v1', status: 'confirmed' } });
    expect(selectScopeProvisions([d], {})).toHaveLength(1);
  });
});

describe('selectScopeProvisions — E2-Dosierung', () => {
  it('kappt auf max. 2 scope-§§ (AC-6)', () => {
    const docs = [
      doc({ paragraphNumber: 'Art. 1' }),
      doc({ paragraphNumber: 'Art. 2' }),
      doc({ paragraphNumber: 'Art. 3' }),
    ];
    const sel = selectScopeProvisions(docs, {});
    expect(sel).toHaveLength(2);
    expect(sel.map(d => d.paragraphNumber)).toEqual(['Art. 1', 'Art. 2']);
  });

  it('numerische Sortier-Falle: "Art. 2" kommt vor "Art. 10" (naive String-Sortierung würde "10" < "2" liefern)', () => {
    const sel = selectScopeProvisions(
      [doc({ paragraphNumber: 'Art. 10' }), doc({ paragraphNumber: 'Art. 2' })],
      {},
    );
    expect(sel.map(d => d.paragraphNumber)).toEqual(['Art. 2', 'Art. 10']);
  });

  it('"§ 3"-Notation wird numerisch geparst wie "Art."', () => {
    const sel = selectScopeProvisions(
      [doc({ paragraphNumber: '§ 10' }), doc({ paragraphNumber: '§ 3' })],
      {},
    );
    expect(sel.map(d => d.paragraphNumber)).toEqual(['§ 3', '§ 10']);
  });

  it('Buchstaben-Suffix: numerisch primär, Suffix sekundär (Art. 5 < Art. 5a < Art. 6)', () => {
    const sel = selectScopeProvisions(
      [doc({ paragraphNumber: 'Art. 6' }), doc({ paragraphNumber: 'Art. 5a' }), doc({ paragraphNumber: 'Art. 5' })],
      {},
    );
    expect(sel.map(d => d.paragraphNumber)).toEqual(['Art. 5', 'Art. 5a']);
  });

  it('unparsebare Nummern sortieren nach hinten', () => {
    const sel = selectScopeProvisions(
      [doc({ paragraphNumber: 'Anhang I' }), doc({ paragraphNumber: 'Art. 2' })],
      {},
    );
    expect(sel.map(d => d.paragraphNumber)).toEqual(['Art. 2', 'Anhang I']);
  });

  it('EINE Sprachvariante: preferredLanguage gewinnt, wenn vorhanden', () => {
    const docs = [
      doc({ source: 'cra-de', language: 'de', paragraphNumber: 'Art. 2' }),
      doc({ source: 'cra-en', language: 'en', paragraphNumber: 'Art. 2' }),
    ];
    const sel = selectScopeProvisions(docs, { preferredLanguage: 'en' });
    expect(sel).toHaveLength(1);
    expect(sel[0].language).toBe('en');
  });

  it('Sprach-Fallback deterministisch: preferred fehlt ⇒ de, sonst en, sonst lexikographisch', () => {
    const de = doc({ source: 'cra-de', language: 'de' });
    const en = doc({ source: 'cra-en', language: 'en' });
    const fr = doc({ source: 'cra-fr', language: 'fr' });
    const it = doc({ source: 'cra-it', language: 'it' });

    // preferred 'fr' nicht vorhanden ⇒ de zuerst
    expect(selectScopeProvisions([de, en], { preferredLanguage: 'fr' })[0].language).toBe('de');
    // kein de ⇒ en
    expect(selectScopeProvisions([en, fr], { preferredLanguage: 'xx' })[0].language).toBe('en');
    // weder de noch en ⇒ lexikographisch kleinste vorhandene Sprache ('fr' < 'it')
    expect(selectScopeProvisions([it, fr], {})[0].language).toBe('fr');
  });

  it('Determinismus: gleiche Menge in anderer Eingabe-Reihenfolge ⇒ identisches Ergebnis', () => {
    const docs = [
      doc({ paragraphNumber: 'Art. 10' }),
      doc({ paragraphNumber: 'Art. 2' }),
      doc({ paragraphNumber: 'Art. 5a' }),
      doc({ paragraphNumber: 'Art. 5' }),
    ];
    const a = selectScopeProvisions(docs, {});
    const b = selectScopeProvisions([...docs].reverse(), {});
    expect(a).toEqual(b);
  });
});

describe('injectScopeHits — Beweis-Garantie, keine Ranking-Änderung (E1/E2/E4)', () => {
  it('dedupliziert gegen vorhandene topHits (Garantie gilt als erfüllt, injectedKeys leer)', () => {
    // "Art. 2" normalisiert zu regulationKey "cra-de:art-2" — schon vorhanden.
    const existing = { ...hit('cra-de', 'art-2', 0.9), regulationKey: 'cra-de:art-2' };
    const candidate = cand([existing]);
    const { candidate: out, injectedKeys } = injectScopeHits(candidate, [doc({ paragraphNumber: 'Art. 2' })]);
    expect(injectedKeys).toEqual([]);
    expect(out.topHits).toHaveLength(1);
  });

  it('injizierte Einträge werden ANS ENDE gehängt, mit origin-Markierung und neutralem Score 0', () => {
    const candidate = cand([hit('cra-de', 'art-16', 0.9), hit('cra-de', 'art-17', 0.8)]);
    const { candidate: out, injectedKeys } = injectScopeHits(candidate, [doc({ paragraphNumber: 'Art. 2' })]);
    expect(injectedKeys).toEqual(['cra-de:art-2']);
    expect(out.topHits).toHaveLength(3);
    const injected = out.topHits[2];
    expect(injected.regulationKey).toBe('cra-de:art-2');
    expect(injected.origin).toBe('scope-guarantee');
    expect(injected.score).toBe(0);
    // Bestands-Hits bleiben implizit retrieval (kein Backfill)
    expect(out.topHits[0].origin).toBeUndefined();
  });

  it('SCORE-NEUTRALITÄT: Familien-Score, hitCount und Reihenfolge der Bestands-topHits byte-identisch vor/nach Injektion', () => {
    // Harte Leitplanke aus dem Plan: Injektion läuft NACH der Aggregation —
    // der Familien-Score ist zu diesem Zeitpunkt fix (ADR-0006 E1).
    const candidate = cand([hit('cra-de', 'art-16', 0.9), hit('cra-de', 'art-17', 0.8)]);
    const before = JSON.stringify({ score: candidate.score, hitCount: candidate.hitCount, topHits: candidate.topHits });
    const { candidate: out } = injectScopeHits(candidate, [doc({ paragraphNumber: 'Art. 2' })]);
    const after = JSON.stringify({ score: out.score, hitCount: out.hitCount, topHits: out.topHits.slice(0, candidate.topHits.length) });
    expect(after).toBe(before);
  });

  it('mutiert den Eingabe-Kandidaten nicht', () => {
    const candidate = cand([hit('cra-de', 'art-16', 0.9)]);
    const snapshot = JSON.stringify(candidate);
    injectScopeHits(candidate, [doc({ paragraphNumber: 'Art. 2' })]);
    expect(JSON.stringify(candidate)).toBe(snapshot);
  });
});

describe('guaranteeStateFor — Sichtbarkeits-Feld (E5)', () => {
  it('alle Familien mit ≥1 scope-§ im Beweismaterial ⇒ applied', () => {
    expect(guaranteeStateFor([
      { family: 'cra', covered: true },
      { family: 'ai-act', covered: true },
    ])).toBe('applied');
  });

  it('mind. eine Familie ohne konsumierbare scope-§§ ⇒ partial (legitim, kein Alert)', () => {
    // z. B. frisch gecrawltes Gesetz vor dem Re-Typing-Batch (ADR-0006 E5).
    expect(guaranteeStateFor([
      { family: 'cra', covered: true },
      { family: 'fresh-law', covered: false },
    ])).toBe('partial');
  });

  it('leere Kandidatenmenge ⇒ applied (nichts zu garantieren)', () => {
    expect(guaranteeStateFor([])).toBe('applied');
  });
});
