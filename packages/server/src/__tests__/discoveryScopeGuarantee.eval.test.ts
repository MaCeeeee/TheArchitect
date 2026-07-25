/**
 * THE-516 / ADR-0006 E6 — Offline-Beweis der Scope-Guarantee im Eval-Harness.
 *
 * Der Regressionstest, der THE-423 dauerhaft festnagelt: die CRA-Familie wurde
 * damals GEFUNDEN, aber die topHits enthielten nur Durchführungs-§§ — der
 * Geltungsbereichs-Artikel lag dem Judge nie vor → Fehlurteil „gilt nicht".
 * Das Fixture „CRA-Blindfleck" (discovery.scope-blindspot.v1.json) stellt genau
 * diese Geometrie deterministisch nach (handkonstruierte 768-dim-Vektoren im
 * Precompute-Format — KEIN Live-Embedding-Call).
 *
 * Ehrlichkeits-Notiz zur Assertion-Variante (bewusste Wahl, Task 3):
 * Der Harness (runDiscoveryEval) hat KEINEN Offline-Judge — `--offline`
 * überspringt die Judge-Stufe komplett (kein Judge-Cache vorhanden), online
 * ruft er ein echtes LLM. Deshalb wird hier ZWEIGLEISIG geprüft:
 *   1. PRIMÄR auf EVIDENZ-Ebene: der scope-§ liegt mit Garantie im
 *      Judge-Beweismaterial (origin 'scope-guarantee'), ohne Garantie nicht —
 *      das ist die maschinenprüfbare Mechanik.
 *   2. Der URTEILS-Kipp (AC-1) über einen deterministischen Judge-Stub, der
 *      exakt den belegten THE-423-Fehlermodus kodiert: ohne Geltungsbereichs-
 *      Artikel in der Evidenz urteilt er „gilt nicht", mit ihm „gilt".
 *
 * Der Injektionspfad ist der PROD-Pfad: `applyScopeGuarantee` aus
 * lawDiscovery.service mit Fixture-Lookup über den E6-Seam (kein Mongo, keine
 * Nachbildung der Injektionslogik). Das Flag-aus-Gate selbst (AC-3,
 * byte-identisch) ist in lawDiscovery.scopeGuarantee.test.ts bewiesen — der
 * „Flag aus"-Arm hier ist deshalb ehrlich die unveränderte Kandidatenmenge
 * VOR der Garantie-Stufe (exakt was Prod bei Flag aus zurückgibt).
 *
 * Run: cd packages/server && npx jest src/__tests__/discoveryScopeGuarantee.eval.test.ts --verbose
 */
import { buildRegulationKey, type DiscoveryCandidate } from '@thearchitect/shared';
import {
  aggregateHitsToCandidates,
  gateCandidatesForJudge,
  applyScopeGuarantee,
} from '../services/lawDiscovery.service';
import { topKByCosine, familyOutcomeForCase } from '../evals/runDiscoveryEval';
import {
  loadScopeBlindspotFixture,
  fixtureScopeLookup,
  loadDiscoveryGoldenSet,
  loadFixtureCorpus,
  type ScopeBlindspotFixture,
} from '../evals/discoveryGolden';
import { readQueriesFile, DEFAULT_QUERIES_PATH } from '../scripts/build-discovery-eval-vectors';

// Runner-Defaults (runDiscoveryEval): topK 60, Judge-Gate 0.3 / max 5.
const TOP_K = 60;
const THRESHOLD = 0.3;
const MAX_JUDGE = 5;

/**
 * Deterministischer Judge-Stub — kodiert den THE-423-Fehlermodus (ADR-0006
 * Kontext): der Judge kann Anwendbarkeit nur bejahen, wenn der Geltungs-
 * bereichs-Artikel im Beweismaterial liegt. `scopeKeys` kommt aus dem Fixture
 * (alle §§ mit typing.provisionKind 'scope-applicability'), nicht hartkodiert.
 */
function deterministicScopeJudge(candidate: DiscoveryCandidate, scopeKeys: Set<string>): { applies: boolean } {
  return { applies: candidate.topHits.some(h => scopeKeys.has(h.regulationKey)) };
}

function scopeKeysOf(fixture: ScopeBlindspotFixture): Set<string> {
  return new Set(
    fixture.paragraphs
      .filter(p => p.typing?.provisionKind === 'scope-applicability')
      .map(p => buildRegulationKey(p.source, p.paragraphNumber)),
  );
}

/** Retrieval → Aggregation → Judge-Gate, exakt in Prod-/Runner-Reihenfolge. */
function retrieveAndGate(queryVector: number[], paragraphs: ScopeBlindspotFixture['paragraphs']): DiscoveryCandidate[] {
  const hits = topKByCosine(queryVector, paragraphs, TOP_K);
  return gateCandidatesForJudge(aggregateHitsToCandidates(hits), THRESHOLD, MAX_JUDGE);
}

describe('ADR-0006 E6 — CRA-Blindfleck-Fixture (AC-1)', () => {
  const fixture = loadScopeBlindspotFixture();
  const scopeKeys = scopeKeysOf(fixture);
  const expectedScopeKey = buildRegulationKey('cra', 'Art. 2');
  const lookup = fixtureScopeLookup(fixture.paragraphs);

  it('Vorbedingung (der historische Blindfleck): Familie GEFUNDEN, topHits enthalten NUR Durchführungs-§§', () => {
    const gated = retrieveAndGate(fixture.queryVector, fixture.paragraphs);
    const cra = gated.find(c => c.family === 'cra');
    // Familie ist da — das Retrieval hat nie versagt (ADR-0006: der Fehler lag
    // im Beweismaterial, nie im Finden).
    expect(cra).toBeDefined();
    expect(cra!.topHits.length).toBeGreaterThan(0);
    // …aber KEIN topHit ist ein scope-§: der Geltungsbereichs-Artikel existiert
    // im Fixture-Korpus (typisiert), wird aber von der Ähnlichkeit nicht
    // hochgespült — exakt die THE-423-Geometrie.
    for (const hit of cra!.topHits) {
      expect(scopeKeys.has(hit.regulationKey)).toBe(false);
    }
  });

  it('Flag aus ⇒ Evidenz OHNE scope-§ ⇒ deterministischer Judge urteilt „gilt nicht"', () => {
    const gated = retrieveAndGate(fixture.queryVector, fixture.paragraphs);
    const cra = gated.find(c => c.family === 'cra')!;
    expect(cra.topHits.some(h => h.origin === 'scope-guarantee')).toBe(false);
    expect(cra.topHits.some(h => h.regulationKey === expectedScopeKey)).toBe(false);
    expect(deterministicScopeJudge(cra, scopeKeys).applies).toBe(false);
  });

  it('AC-1: Flag an ⇒ scope-§ injiziert (origin, Score 0, ans Ende) ⇒ Urteil kippt auf „gilt"', async () => {
    const gated = retrieveAndGate(fixture.queryVector, fixture.paragraphs);
    const before = gated.find(c => c.family === 'cra')!;

    const { candidates, scopeGuarantee } = await applyScopeGuarantee('eval:cra-blindspot', gated, lookup);
    const after = candidates.find(c => c.family === 'cra')!;

    // Evidenz-Ebene (primär): der Geltungsbereichs-Artikel liegt jetzt im
    // Judge-Beweismaterial, markiert als Injektion (Notar-Prinzip, E4).
    const injected = after.topHits.filter(h => h.origin === 'scope-guarantee');
    expect(injected.map(h => h.regulationKey)).toEqual([expectedScopeKey]);
    expect(injected[0].score).toBe(0); // Score-Neutralität (harte Leitplanke)
    expect(scopeGuarantee).toBe('applied');

    // Beweis-Garantie ≠ Ranking-Eingriff (E1): Score/hitCount unverändert,
    // Bestands-topHits bleiben als unverändertes Präfix erhalten.
    expect(after.score).toBe(before.score);
    expect(after.hitCount).toBe(before.hitCount);
    expect(after.topHits.slice(0, before.topHits.length)).toEqual(before.topHits);

    // Urteils-Ebene (AC-1, deterministischer Stub): das Fixture kippt.
    expect(deterministicScopeJudge(after, scopeKeys).applies).toBe(true);
  });

  it('Determinismus: zwei Läufe mit Garantie sind byte-identisch', async () => {
    const runOnce = async () => {
      const gated = retrieveAndGate(fixture.queryVector, fixture.paragraphs);
      return applyScopeGuarantee('eval:cra-blindspot', gated, lookup);
    };
    const a = await runOnce();
    const b = await runOnce();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('ADR-0006 E6 — AC-2: kein bestehendes Golden-Urteil ändert sich (Flag an vs. aus)', () => {
  // Die ECHTEN eingefrorenen v1-Artefakte (unverändert gelesen, nie editiert):
  // Golden-Set + Fixture-Korpus + vorberechnete Query-Vektoren (offline).
  const golden = loadDiscoveryGoldenSet();
  const corpus = loadFixtureCorpus();
  const queries = readQueriesFile(DEFAULT_QUERIES_PATH);
  // Scope-Lookup aus dem ADDITIVEN Blindfleck-Fixture: es enthält den einzigen
  // typisierten scope-§ (cra). Damit ist AC-2 NICHT vakuum-erfüllt — bei Fällen
  // mit cra-Kandidat wird real injiziert, und trotzdem darf sich kein Outcome
  // ändern (Injektion ist Beweis-Superset, nie Verdrängung).
  const blindspot = loadScopeBlindspotFixture();
  const lookup = fixtureScopeLookup(blindspot.paragraphs);

  it('jeder Golden-Fall: Outcome (Familien + Konfidenzen) identisch mit und ohne Garantie', async () => {
    expect(queries).not.toBeNull();
    const byCaseId = new Map(queries!.queries.map(q => [q.caseId, q]));
    let totalInjected = 0;

    for (const c of golden.cases) {
      const baselineVector = byCaseId.get(c.caseId)?.baselineVector;
      expect(baselineVector).toBeDefined();
      const hits = topKByCosine(baselineVector as number[], corpus.paragraphs, TOP_K);
      // Prod-Reihenfolge (discoverCandidates → discoverAndJudge): Aggregation →
      // Garantie → Judge-Gate. Die Injektion läuft VOR dem Gate — genau deshalb
      // muss sie score-neutral sein, sonst würde sie das Gating verschieben.
      const candidates = aggregateHitsToCandidates(hits);
      const withGuarantee = (await applyScopeGuarantee(`eval:${c.caseId}`, candidates, lookup)).candidates;

      const gatedOff = gateCandidatesForJudge(candidates, THRESHOLD, MAX_JUDGE);
      const gatedOn = gateCandidatesForJudge(withGuarantee, THRESHOLD, MAX_JUDGE);

      // AC-2 auf der Ebene, auf der der Offline-Harness Verdicts scort
      // (Retrieval-Outcomes = familyOutcomeForCase): deep-identisch.
      expect(familyOutcomeForCase(c.caseId, c.goldFamilies, gatedOn)).toEqual(
        familyOutcomeForCase(c.caseId, c.goldFamilies, gatedOff),
      );

      // Struktur-Garantie je Kandidat: kein „gilt" KANN verschwinden, weil die
      // Evidenz ein reines Superset ist — Bestands-Hits als unverändertes
      // Präfix, Anhang nur markierte, score-neutrale Injektionen.
      expect(gatedOn.length).toBe(gatedOff.length);
      for (let i = 0; i < gatedOff.length; i++) {
        expect(gatedOn[i].family).toBe(gatedOff[i].family);
        expect(gatedOn[i].score).toBe(gatedOff[i].score);
        expect(gatedOn[i].hitCount).toBe(gatedOff[i].hitCount);
        expect(gatedOn[i].topHits.slice(0, gatedOff[i].topHits.length)).toEqual(gatedOff[i].topHits);
        const extra = gatedOn[i].topHits.slice(gatedOff[i].topHits.length);
        for (const hit of extra) {
          expect(hit.origin).toBe('scope-guarantee');
          expect(hit.score).toBe(0);
        }
        totalInjected += extra.length;
      }
    }

    // Vakuum-Guard: mindestens ein Golden-Fall hat real eine Injektion erlebt —
    // sonst bewiese der Test nur „nichts tun ändert nichts".
    expect(totalInjected).toBeGreaterThan(0);
  });

  it('Determinismus über das Golden-Set: zwei Garantie-Läufe identisch', async () => {
    expect(queries).not.toBeNull();
    const byCaseId = new Map(queries!.queries.map(q => [q.caseId, q]));
    const runAll = async () => {
      const out: unknown[] = [];
      for (const c of golden.cases) {
        const hits = topKByCosine(byCaseId.get(c.caseId)!.baselineVector as number[], corpus.paragraphs, TOP_K);
        out.push(await applyScopeGuarantee(`eval:${c.caseId}`, aggregateHitsToCandidates(hits), lookup));
      }
      return JSON.stringify(out);
    };
    expect(await runAll()).toBe(await runAll());
  });
});
