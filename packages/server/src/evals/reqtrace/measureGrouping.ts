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
  PAIR_RELATION_SYSTEM,
  buildSysReqPairUserPrompt,
  parsePairRelation,
  collapseKey,
  findDisplacement,
  type PairRelation,
  type SystemRequirement,
} from '@thearchitect/shared';

/** Eine Systemanforderung mit dem Kontext, den die Gruppierung braucht. */
export interface GroupableSysReq extends SystemRequirement {
  id: string;
  /** Rechtsakt-Kürzel — `dsgvo` · `nis2` · `dora`. */
  source: string;
  /** Kanonische Handlung; `null` = nicht zuordenbar, dann kein Kandidat. */
  actionId: string | null;
  addresseeClass: string;
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
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const hit = findDisplacement(x.source, y.addresseeClass);
    if (hit && hit.prevailing.source === y.source) {
      return {
        a: a.id,
        b: b.id,
        displaced: x.source,
        prevailing: y.source,
        addresseeClass: y.addresseeClass,
        scope: hit.scope,
        citations: hit.citations,
      };
    }
  }
  return null;
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
  excludedByDisplacement: DisplacementExclusion[];
  /** Zusammenfall auf Anforderungsebene — erwartete Häufigkeit nahe null. */
  collapsed: CollapsedPair[];
  /** Wie viele Paare der Richter tatsächlich gesehen hat. */
  judged: number;
  /** Verteilung der Urteile — ein Kollaps auf einen Typ ist ein Alarm. */
  relationCounts: Record<string, number>;
}

export type JudgeFn = (system: string, user: string) => Promise<string>;

/**
 * Gruppiert Systemanforderungen zu Maßnahmen.
 *
 * Deterministisch: die Paare werden in stabiler Id-Reihenfolge geprüft, und
 * die Komponenten kommen sortiert heraus — ein Ergebnis, das zwischen zwei
 * Läufen wackelt, ist als Beleg wertlos.
 */
export async function groupIntoMeasures(
  reqs: GroupableSysReq[],
  opts: { judge: JudgeFn },
): Promise<GroupingResult> {
  const sorted = [...reqs].sort((x, y) => x.id.localeCompare(y.id));
  const excludedByDisplacement: DisplacementExclusion[] = [];
  const edges: MeasureEdge[] = [];
  const collapsed: CollapsedPair[] = [];
  const relationCounts: Record<string, number> = {};
  let judged = 0;

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];

      // (1) Nur gesetzesuebergreifend, gleiche Handlung, vertraegliche Adressaten.
      if (a.source === b.source) continue;
      if (!a.actionId || !b.actionId || a.actionId !== b.actionId) continue;
      if (!areAddresseesCompatible(a.addresseeClass, b.addresseeClass)) continue;

      // (2) VERDRAENGUNG ZUERST — ab hier gibt es fuer dieses Paar keinen
      //     Codepfad zum Richter. Das ist die mechanische Negativ-Kontrolle.
      const displaced = displacementFor(a, b);
      if (displaced) {
        excludedByDisplacement.push(displaced);
        continue;
      }

      // (3) Erst jetzt der typisierte Richter.
      judged += 1;
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

  // (5) Massnahme = Zusammenhangskomponente ueber die Richter-Kanten.
  const parent = new Map<string, string>(sorted.map((r) => [r.id, r.id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    return root;
  };
  for (const e of edges) {
    const [ra, rb] = [find(e.a), find(e.b)];
    if (ra !== rb) parent.set(ra, rb);
  }

  const byRoot = new Map<string, GroupableSysReq[]>();
  for (const r of sorted) {
    const root = find(r.id);
    (byRoot.get(root) ?? byRoot.set(root, []).get(root) as GroupableSysReq[]).push(r);
  }

  const measures: Measure[] = [...byRoot.values()]
    .map((members) => {
      const memberIds = members.map((m) => m.id).sort();
      return {
        id: `measure__${memberIds[0]}`,
        memberIds,
        laws: [...new Set(members.map((m) => m.source))].sort(),
        relations: edges.filter((e) => memberIds.includes(e.a) && memberIds.includes(e.b)),
      };
    })
    .sort((x, y) => x.id.localeCompare(y.id));

  return { measures, excludedByDisplacement, collapsed, judged, relationCounts };
}
