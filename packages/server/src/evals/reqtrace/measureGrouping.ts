/**
 * measureGrouping — bildet aus Systemanforderungen geteilte MASSNAHMEN
 * (THE-545, Task 6). Hier fallen zwei der drei Kontrollen.
 *
 * ── DIE REIHENFOLGE IST DIE KONTROLLE ──
 *
 * Die Verdrängung filtert **vor** jedem Modellurteil. Das ist keine
 * Optimierung, sondern die mechanische Negativ-Kontrolle aus THE-545: Wird ein
 * verdrängtes Paar überhaupt einem Richter vorgelegt, gilt sie als gerissen —
 * unabhängig davon, wie er urteilt. Ein richtiges Urteil aus dem falschen
 * Grund ist kein Bestehen. Deshalb existiert für diese Paare kein Codepfad zum
 * Richter, statt dass sein Ergebnis nachträglich verworfen würde.
 *
 * ── EINE MASSNAHME IST EINE ZUSAMMENHANGSKOMPONENTE, KEIN PAAR ──
 *
 * GOV-02 und RSK-01 (SCF) verlangen Maßnahmen über DORA **und** DSGVO **und**
 * NIS2 — aber jede NIS2×DORA-Direktkante ist verdrängt. Die DSGVO ist die
 * Brücke. Mit paarweisen Gruppen wären diese beiden Kandidaten per
 * Konstruktion unerreichbar (höchstens 3 von 5), und die Abbruchschwelle des
 * Tickets risse an einer Implementierungsentscheidung statt an der Kette.
 *
 * Die Kontrolle bleibt gewahrt: der Richter hat das verdrängte Paar nie
 * gesehen, und der Bericht weist die Komponentenstruktur aus.
 *
 * Linear: THE-545 · Rahmen: ADR-0007 E5/E6
 */
import {
  normalizeCorpusSource,
  PAIR_RELATION_SYSTEM,
  buildSysReqPairUserPrompt,
  parsePairRelation,
  collapseKey,
  type PairRelation,
  type SystemRequirement,
} from '@thearchitect/shared';
import { evaluateDisplacement } from '../../services/displacementGate.service';

/** Eine Systemanforderung mit dem Kontext, den die Gruppierung braucht. */
export interface GroupableSysReq extends SystemRequirement {
  id: string;
  /** Rechtsakt-Kürzel — `dsgvo` · `nis2` · `dora`. */
  source: string;
  /** Kanonische Handlung; `null` = nicht zuordenbar, dann kein Kandidat. */
  actionId: string | null;
  addresseeClass: string;
  /**
   * Woher die Adressatenklasse stammt (THE-591). Optional, weil der Prüfstand
   * sie aus der Fixture setzt und keine Herkunft kennt. Im Produkt ist sie
   * Pflicht-Information: Eine Rolle ohne erkennbare Quelle ist im Prüfungsfall
   * wertlos — `corpus` ist die typisierte Provision, `lexicon` der Rückfall
   * über den Freitext.
   */
  addresseeSource?: 'corpus' | 'lexicon';
}

/**
 * Adressatenklassen, die EIN Unternehmen gleichzeitig tragen kann.
 *
 * Bewusst eine Datenzeile und bewusst NICHT „gleiche Rolle": Alle fünf
 * SCF-Kandidaten sind rollenübergreifend (DSGVO bindet den Verantwortlichen,
 * NIS2 die wesentliche Einrichtung, DORA das Finanzunternehmen). Die Lesart
 * „gleiche Id" ergäbe mechanisch null Treffer — der Lauf sähe aus, als trüge
 * die Kette nicht, obwohl nur der Filter falsch wäre.
 */
export const COMPATIBLE_ENTERPRISE_ROLES: readonly string[] = [
  'controller',
  'processor',
  'essential_important_entity',
  'financial_entity',
  'obligated_enterprise',
  'provider',
  'deployer',
  'manufacturer',
];

/**
 * Können beide Pflichten denselben Adressaten treffen?
 *
 * Unternehmensrollen sind untereinander verträglich; eine Behörden- oder
 * Betroffenen-Rolle ist es nicht. Genau diese Unterscheidung fehlte im alten
 * Prüfsatz — dort stand eine Pflicht der Aufsichtsbehörde gegen eine
 * Unternehmenspflicht.
 */
export function areAddresseesCompatible(a: string, b: string): boolean {
  return COMPATIBLE_ENTERPRISE_ROLES.includes(a) && COMPATIBLE_ENTERPRISE_ROLES.includes(b);
}

export interface DisplacementExclusion {
  a: string;
  b: string;
  /** Der verdrängte Rechtsakt. */
  displaced: string;
  /** Der vorrangige Rechtsakt. */
  prevailing: string;
  addresseeClass: string;
  scope: string;
  citations: readonly string[];
}

/**
 * Schließen sich die beiden Pflichten für JEDEN denkbaren Adressaten aus?
 *
 * Geprüft wird mit der Adressatenklasse der **vorrangigen** Seite, nicht der
 * verdrängten. Die Frage lautet „gibt es einen Adressaten, für den beide
 * gelten?" — und ein Finanzunternehmen ist zugleich wesentliche Einrichtung.
 * Fragte man mit `essential_important_entity`, fände man nichts, obwohl die
 * Kante existiert.
 */
function displacementFor(a: GroupableSysReq, b: GroupableSysReq): DisplacementExclusion | null {
  // Seit THE-563 liegt die Paar-Semantik im Produkt-Service — der Eval
  // konsumiert denselben Codepfad (Muster obligationAction.service).
  const verdict = evaluateDisplacement(a, b);
  return verdict ? { a: a.id, b: b.id, ...verdict } : null;
}

export interface MeasureEdge {
  a: string;
  b: string;
  relation: PairRelation;
}

export interface Measure {
  id: string;
  memberIds: string[];
  /** Die Rechtsakte, die diese Maßnahme bedient — die Zahl, auf die DoD-1 zeigt. */
  laws: string[];
  relations: MeasureEdge[];
}

export interface CollapsedPair {
  ids: string[];
  key: string;
}

export interface GroupingResult {
  measures: Measure[];
  /**
   * Als `intersects` geurteilte Paare, die zu KEINER Gruppe gefuehrt haben.
   *
   * Sie sind nicht verloren, nur nicht verkettet: „gemeinsamer Kern" zwischen
   * A und B sagt nichts ueber A und C. Der Bericht weist sie als
   * paarweise Kandidaten aus.
   */
  sharedCorePairs: MeasureEdge[];
  excludedByDisplacement: DisplacementExclusion[];
  /** Zusammenfall auf Anforderungsebene — erwartete Häufigkeit nahe null. */
  collapsed: CollapsedPair[];
  /** Wie viele Paare der Richter tatsächlich gesehen hat. */
  judged: number;
  /** Verteilung der Urteile — ein Kollaps auf einen Typ ist ein Alarm. */
  relationCounts: Record<string, number>;
  /**
   * Paare, die wegen der Obergrenze NICHT beurteilt wurden.
   *
   * Sichtbar, nicht still: ein abgeschnittener Lauf liest sich sonst wie
   * „mehr gab es nicht" — und die Trefferquote waere unerklaerlich niedrig.
   */
  cappedPairs: number;
  /**
   * Paare, die den Richter erreichen WUERDEN — nach Filter und Verdraengung,
   * vor dem Deckel (THE-590).
   *
   * Ein eigenes Feld, kein abgeleitetes: `cappedPairs` beantwortet die Frage
   * „wie viele blieben uebrig?", nicht „wie viele gab es?". Wer die Gesamtzahl
   * brauchte, musste sie bisher aus zwei Feldern zusammenrechnen — oder mit
   * `maxJudgedPairs: 0` einen Lauf faelschen, der die Zahl als „gekappt"
   * verkleidet zurueckgibt. Ein Zaehler, den man nur ueber einen Trick
   * erreicht, ist kein Zaehler.
   *
   * Die Bilanz muss aufgehen: `judged + cappedPairs === candidatePairs`.
   * Verdraengte Paare stehen NICHT darin — sie sind keine Kandidaten, die
   * weggekappt wurden, sondern haetten den Richter nie erreicht.
   */
  candidatePairs: number;
  /** Wonach ausgewaehlt wurde, falls gekappt. Stabil, keine Rangfolge. */
  selectionOrder: PairSelectionOrder;
}

export type JudgeFn = (system: string, user: string) => Promise<string>;

/**
 * Wonach ausgewählt wird, wenn der Deckel greift (THE-590).
 *
 * `id-ascending` ist **stabil, aber keine Rangfolge**: die alphabetische
 * Reihenfolge der Anforderungs-Ids trägt kein fachliches Kriterium. „Die
 * ersten 200" liest sich wie „die wichtigsten 200" — es sind aber nur die
 * ersten. Wer das nicht weiß, hält die weggelassenen Paare für die weniger
 * relevanten.
 *
 * Stabil genügt hier: ein wackelnder Ausschnitt wäre als Beleg wertlos. Eine
 * inhaltlich bessere Auswahl (nach Handlung, nach Gesetzespaar, reihum) ist
 * eine fachliche Entscheidung mit eigener Prämisse und gehört nicht in dieses
 * Feld, sondern in ein Entscheidungs-Ticket. Was dieser Wert leistet, ist
 * nicht die bessere Wahl — sondern dass die getroffene benennbar ist.
 */
export const PAIR_SELECTION_ORDER = 'id-ascending' as const;
export type PairSelectionOrder = typeof PAIR_SELECTION_ORDER;

export interface CandidateEnumeration {
  /** Paare, die den Richter erreichen würden — in `PAIR_SELECTION_ORDER`. */
  pairs: [GroupableSysReq, GroupableSysReq][];
  excludedByDisplacement: DisplacementExclusion[];
}

/**
 * Die Kandidaten-Aufzählung — **ohne** ein einziges Modellurteil.
 *
 * Herausgelöst, damit die Vorschau (THE-590) und der teure Lauf beweisbar
 * **denselben** Filter benutzen. Zwei Kopien derselben drei Bedingungen wären
 * genau die Sorte Duplikat, die irgendwann auseinanderläuft — und dann zeigt
 * die Vorschau eine Zahl, die der Lauf nie erreicht.
 *
 * Die Reihenfolge der Bedingungen ist die Kontrolle, nicht eine Optimierung:
 * die Verdrängung filtert **vor** allem Weiteren, damit für ein verdrängtes
 * Paar kein Codepfad zum Richter existiert (THE-563).
 */
export function enumerateCandidatePairs(reqs: GroupableSysReq[]): CandidateEnumeration {
  const sorted = [...reqs].sort((x, y) => x.id.localeCompare(y.id));
  const excludedByDisplacement: DisplacementExclusion[] = [];
  const pairs: [GroupableSysReq, GroupableSysReq][] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];

      // (1) Nur gesetzesuebergreifend, gleiche Handlung, vertraegliche Adressaten.
      //
      // „Gesetzesuebergreifend" heisst FAMILIE, nicht Schreibweise (THE-600):
      // `nis2` und `nis2-de` sind zwei Fassungen DESSELBEN Gesetzes. Exakt
      // verglichen waeren sie ein Paar — eine Norm gegen sich selbst, mit
      // einem Modellurteil bezahlt.
      if (normalizeCorpusSource(a.source) === normalizeCorpusSource(b.source)) continue;
      if (!a.actionId || !b.actionId || a.actionId !== b.actionId) continue;
      if (!areAddresseesCompatible(a.addresseeClass, b.addresseeClass)) continue;

      // (2) VERDRAENGUNG ZUERST — ab hier gibt es fuer dieses Paar keinen
      //     Codepfad zum Richter. Das ist die mechanische Negativ-Kontrolle.
      const displaced = displacementFor(a, b);
      if (displaced) {
        excludedByDisplacement.push(displaced);
        continue;
      }
      pairs.push([a, b]);
    }
  }
  return { pairs, excludedByDisplacement };
}

/**
 * Gruppiert Systemanforderungen zu Maßnahmen.
 *
 * Deterministisch: die Paare werden in stabiler Id-Reihenfolge geprüft, und
 * die Komponenten kommen sortiert heraus — ein Ergebnis, das zwischen zwei
 * Läufen wackelt, ist als Beleg wertlos.
 */
export async function groupIntoMeasures(
  reqs: GroupableSysReq[],
  opts: {
    judge: JudgeFn;
    /** Obergrenze beurteilter Paare. Ueberschuss wird gezaehlt, nicht verschwiegen. */
    maxJudgedPairs?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<GroupingResult> {
  const sorted = [...reqs].sort((x, y) => x.id.localeCompare(y.id));
  const edges: MeasureEdge[] = [];
  const collapsed: CollapsedPair[] = [];
  const relationCounts: Record<string, number> = {};
  let judged = 0;

  // Kandidaten ZUERST sammeln: nur so kennt der Fortschritt seine Gesamtzahl.
  // Die Schleife ist quadratisch — in Lauf 2 ergaben 304 Anforderungen 2124
  // Kandidaten-Paare, und die Phase lief ueber eine Stunde ohne Lebenszeichen.
  // Seit THE-590 liegt sie in `enumerateCandidatePairs`, damit die Vorschau
  // beweisbar denselben Filter benutzt wie der Lauf.
  const { pairs: toJudge, excludedByDisplacement } = enumerateCandidatePairs(sorted);

  const cap = opts.maxJudgedPairs ?? Number.POSITIVE_INFINITY;
  const cappedPairs = Math.max(0, toJudge.length - cap);

  {
    for (const [a, b] of toJudge.slice(0, cap)) {
      // (3) Erst jetzt der typisierte Richter.
      judged += 1;
      opts.onProgress?.(judged, Math.min(toJudge.length, cap));
      const verdict = parsePairRelation(await opts.judge(PAIR_RELATION_SYSTEM, buildSysReqPairUserPrompt(a, b)));
      if (!verdict) continue;
      relationCounts[verdict.relation] = (relationCounts[verdict.relation] ?? 0) + 1;
      if (verdict.relation === 'unrelated') continue;

      edges.push({ a: a.id, b: b.id, relation: verdict.relation });

      // (4) Zusammenfall auf ANFORDERUNGSEBENE nur bei wortgleichem Schluessel
      //     (ADR-0007 E5). Der Regelfall ist die geteilte Massnahme.
      if (collapseKey(a) === collapseKey(b)) {
        collapsed.push({ ids: [a.id, b.id].sort(), key: collapseKey(a) });
      }
    }
  }

  // ── (5) Gruppenbildung: Transitivitaet nur, wo sie gilt ─────────────────
  //
  // Lauf 1 vom 2026-08-02 erzeugte EINE Massnahme mit 159 Anforderungen ueber
  // alle drei Gesetze — 442 von 576 Urteilen waren `intersects`, und
  // Zusammenhangskomponenten behandeln die Relation als Aequivalenz. Das ist
  // ein Kategorienfehler: unsere eigene Rubrik definiert `intersects` als
  // „gemeinsamer Kern, aber JEDE Pflicht verlangt zusaetzlich etwas". Aus
  // A~B und B~C folgt nichts ueber A~C.
  //
  // Schlimmer: ueber die DSGVO als Bruecke landeten NIS2 Art. 23 und DORA
  // Art. 19 in derselben Massnahme — das Paar, das lex specialis fuer jeden
  // Adressaten ausschliesst. Die mechanische Kontrolle bestand dem Buchstaben
  // nach und verfehlte ihren Zweck.
  //
  // Deshalb:
  //   `equal`/`subset` → transitiv verschmelzen (das SIND sie)
  //   `intersects`     → nur als CLIQUE: eine Gruppe entsteht, wenn JEDES
  //                      Paar darin einzeln als ueberschneidend geurteilt
  //                      wurde. Das unterstellt keine Transitivitaet, es
  //                      verlangt sie als beobachtet.
  const parent = new Map<string, string>(sorted.map((r) => [r.id, r.id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    return root;
  };
  for (const e of edges.filter((x) => x.relation === 'equal' || x.relation === 'subset')) {
    const [ra, rb] = [find(e.a), find(e.b)];
    if (ra !== rb) parent.set(ra, rb);
  }

  const groups = new Map<string, string[]>();
  for (const r of sorted) {
    const root = find(r.id);
    groups.set(root, [...(groups.get(root) ?? []), r.id]);
  }

  // Cliquen-Wachstum ueber `intersects`: deterministisch, in Id-Reihenfolge.
  // Ein Kandidat tritt einer Gruppe nur bei, wenn er mit JEDEM ihrer
  // Mitglieder eine Kante hat.
  const intersectsKey = new Set(
    edges.filter((e) => e.relation === 'intersects').map((e) => [e.a, e.b].sort().join('␟')),
  );
  const connected = (x: string, y: string): boolean => intersectsKey.has([x, y].sort().join('␟'));

  const assigned = new Set<string>();
  const cliques: string[][] = [];
  for (const seedRoot of [...groups.keys()].sort()) {
    const seed = (groups.get(seedRoot) as string[]).slice().sort();
    if (seed.some((id) => assigned.has(id))) continue;
    const members = [...seed];
    for (const cand of sorted.map((r) => r.id)) {
      if (members.includes(cand) || assigned.has(cand)) continue;
      if (members.every((m) => connected(m, cand))) members.push(cand);
    }
    members.sort();
    members.forEach((m) => assigned.add(m));
    cliques.push(members);
  }

  const inAMeasure = new Set(cliques.filter((c) => c.length > 1).flat());
  const sharedCorePairs = edges.filter(
    (e) =>
      e.relation === 'intersects' &&
      !cliques.some((c) => c.includes(e.a) && c.includes(e.b) && c.length > 1),
  );

  const measures: Measure[] = cliques
    .map((memberIds) => {
      const members = memberIds
        .map((id) => sorted.find((r) => r.id === id) as GroupableSysReq)
        .filter(Boolean);
      return {
        id: `measure__${memberIds[0]}`,
        memberIds,
        // FAMILIEN, nicht Schreibweisen (THE-600): sonst zaehlt `nis2` und
        // `nis2-de` als zwei Gesetze, und das Gold-Matching am Produktpfad
        // reisst mechanisch an `'nis2-de' !== 'nis2'`.
        laws: [...new Set(members.map((m) => normalizeCorpusSource(m.source)))].sort(),
        relations: edges.filter((e) => memberIds.includes(e.a) && memberIds.includes(e.b)),
      };
    })
    .sort((x, y) => x.id.localeCompare(y.id));
  void inAMeasure;

  return {
    measures,
    sharedCorePairs,
    excludedByDisplacement,
    collapsed,
    judged,
    relationCounts,
    cappedPairs,
    candidatePairs: toJudge.length,
    selectionOrder: PAIR_SELECTION_ORDER,
  };
}
