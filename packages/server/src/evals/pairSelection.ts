/**
 * pairSelection — bildet Pflicht-Paare auf VIER Achsen statt auf einer
 * (THE-382, Reparatur des Prüfsatzes nach der Adjudikations-Absage 2026-08-02).
 *
 * ── WARUM ES DIESE DATEI GIBT ──
 *
 * `actions.v1` paarte nach EINER Achse: gleicher Katalog-Eintrag, verschiedene
 * Gesetze, volles Kreuzprodukt. Bei 26 Einträgen für 219 Pflichten ist ein
 * Eintrag ein THEMA, keine Maßnahme — 44 der 60 Arm-T-Paare stammten aus zwei
 * Töpfen. Die Folge sah ein Mensch beim Adjudizieren sofort:
 *
 *   „Beschreibung der wahrscheinlichen Folgen in der Meldung"   (Inhaltselement
 *                                                                eines Dokuments)
 *   gegen
 *   „Behördenweiterleitung an EU-Agenturen"                     (Pflicht der
 *                                                                AUFSICHT, nicht
 *                                                                des Unternehmens)
 *
 * Die Frage „erfüllt eine Maßnahme beide?" ist dort nicht schwer, sondern
 * gegenstandslos. Gemessen wurde also nicht der Richter, sondern die Paarung.
 *
 * ── DIE REGEL ──
 *
 * Zwei Pflichten werden nur dann einander gegenübergestellt, wenn sie in ALLEN
 * VIER Achsen übereinstimmen und aus verschiedenen Rechtsakten stammen:
 *
 *   Handlung · Verpflichteter · Empfängerklasse · Modalität
 *
 * Der Verpflichtete kommt aus der Korpus-Typisierung (`partyRole`), NICHT aus
 * der Slot-Zerlegung: dort lieferte das Modell überwiegend den Empfänger
 * (THE-540). Die Empfängerklasse kommt aus einem abgeleiteten Vokabular — der
 * Freitext „die zuständige Behörde" ist nicht filterbar.
 *
 * ── WAS DIESE REGEL KOSTEN DARF ──
 *
 * Bleiben danach wenige Paare übrig, ist das die ANTWORT, nicht ein Defekt: die
 * unabhängige Rechnung über den Kontroll-Katalog kam auf 5–6 echte Kandidaten
 * (`docs/strategy/2026-08-01-the538-dora-meldepflicht.md`). Zwei Wege zur selben
 * Größenordnung sind ein Beleg, kein Problem.
 *
 * REIN: kein I/O, kein Netz — die Regel muss testbar sein, bevor ein Mensch
 * wieder Zeit investiert.
 *
 * Linear: THE-382 · Vorgeschichte: THE-438, THE-538, THE-540
 */
import type { ObligationRef } from '@thearchitect/shared';
import type { ActionGoldenCase, ActionGoldenSet } from './actionGolden';

/** Eine Pflicht mit allen vier Achsen. `null` = Achse nicht bestimmbar. */
export interface SlottedObligation extends ObligationRef {
  /** Kanonische Handlung aus dem Katalog. `null` = keine passende. */
  actionId: string | null;
  /** Der VERPFLICHTETE aus der Korpus-Typisierung. `null` = keine konsumierbare Typisierung. */
  partyRole: string | null;
  /** Empfängerklasse aus dem abgeleiteten Vokabular. `null` = nicht zuordenbar. */
  recipientClass: string | null;
  modality: string | null;
}

export interface PairSelectionOptions {
  /**
   * Wie oft dieselbe Pflicht höchstens auftauchen darf.
   *
   * In `actions.v1` entstanden 60 Paare aus 34 A-Seiten; eine Formulierung kam
   * sechsmal vor. Das bläht die Stichprobe auf, ohne Information hinzuzufügen —
   * und lässt einen Adjudikator dieselbe Frage mehrfach beantworten.
   */
  maxUsesPerObligation?: number;
  /** Obergrenze je Arm. Ohne sie dominiert ein einzelner großer Topf die Menge. */
  maxPerArm?: number;
  /**
   * Nur diese Verpflichteten zulassen (z. B. nur Unternehmenspflichten).
   * Leer = keine Einschränkung.
   */
  allowedPartyRoles?: string[];
}

export interface PairSelectionStats {
  /** Pflichten, die mangels einer Achse gar nicht paarungsfähig waren. */
  incomplete: number;
  /** Verworfen, weil der Verpflichtete nicht zugelassen war. */
  wrongParty: number;
  /** Gruppen (Handlung × Verpflichteter × Empfänger × Modalität) mit ≥2 Gesetzen. */
  groupsWithPair: number;
  /** Kandidaten-Paare vor Deckelung. */
  candidates: number;
  /** Nach Deckelung übrig. */
  selected: number;
}

export interface PairSelectionResult {
  T: ActionGoldenCase[];
  K: ActionGoldenCase[];
  statsT: PairSelectionStats;
}

/** Der Schlüssel, auf dem gepaart wird — alle vier Achsen, in fester Reihenfolge. */
export function axisKey(o: SlottedObligation): string | null {
  if (!o.actionId || !o.partyRole || !o.recipientClass || !o.modality) return null;
  return [o.actionId, o.partyRole, o.recipientClass, o.modality].join('||');
}

function caseId(a: SlottedObligation, b: SlottedObligation): string {
  const norm = (o: SlottedObligation): string =>
    `${o.law}-${o.para}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${norm(a)}__${norm(b)}`;
}

function refOf(o: SlottedObligation): ObligationRef {
  return { law: o.law, para: o.para, title: o.title, text: o.text };
}

/**
 * Arm T: gleiche vier Achsen, verschiedene Rechtsakte.
 *
 * Deterministisch — nach Titel sortiert, gleichmäßig über die Gruppen verteilt.
 * Ein Prüfsatz, der zwischen zwei Läufen wackelt, misst zwei verschiedene Dinge.
 */
export function buildStrictPairs(
  obligations: SlottedObligation[],
  opts: PairSelectionOptions = {},
): PairSelectionResult {
  const maxUses = opts.maxUsesPerObligation ?? 2;
  const maxPerArm = opts.maxPerArm ?? 60;
  const allowed = opts.allowedPartyRoles?.length ? new Set(opts.allowedPartyRoles) : null;

  const stats: PairSelectionStats = {
    incomplete: 0,
    wrongParty: 0,
    groupsWithPair: 0,
    candidates: 0,
    selected: 0,
  };

  const usable: SlottedObligation[] = [];
  for (const o of obligations) {
    if (!axisKey(o)) {
      stats.incomplete++;
      continue;
    }
    if (allowed && !allowed.has(o.partyRole as string)) {
      stats.wrongParty++;
      continue;
    }
    usable.push(o);
  }

  // Gruppieren, dann INNERHALB der Gruppe nur ueber Gesetzesgrenzen paaren.
  const groups = new Map<string, SlottedObligation[]>();
  for (const o of usable) {
    const k = axisKey(o) as string;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(o);
  }

  const candidates: { key: string; a: SlottedObligation; b: SlottedObligation }[] = [];
  for (const [key, members] of [...groups.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    const sorted = [...members].sort((x, y) => `${x.law}${x.title}`.localeCompare(`${y.law}${y.title}`));
    let hasPair = false;
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[i].law === sorted[j].law) continue;
        candidates.push({ key, a: sorted[i], b: sorted[j] });
        hasPair = true;
      }
    }
    if (hasPair) stats.groupsWithPair++;
  }
  stats.candidates = candidates.length;

  // Reihum ueber die Gruppen, damit ein grosser Topf die Menge nicht dominiert.
  const byGroup = new Map<string, typeof candidates>();
  for (const c of candidates) (byGroup.get(c.key) ?? byGroup.set(c.key, []).get(c.key)!).push(c);
  const queues = [...byGroup.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([, v]) => v);

  const uses = new Map<string, number>();
  const idOf = (o: SlottedObligation): string => `${o.law}|${o.para}|${o.title}`;
  const T: ActionGoldenCase[] = [];
  const seenIds = new Set<string>();

  let progressed = true;
  while (progressed && T.length < maxPerArm) {
    progressed = false;
    for (const q of queues) {
      if (T.length >= maxPerArm) break;
      const next = q.shift();
      if (!next) continue;
      progressed = true;

      const ua = uses.get(idOf(next.a)) ?? 0;
      const ub = uses.get(idOf(next.b)) ?? 0;
      if (ua >= maxUses || ub >= maxUses) continue;

      const id = caseId(next.a, next.b);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      uses.set(idOf(next.a), ua + 1);
      uses.set(idOf(next.b), ub + 1);
      T.push({
        id,
        arm: 'T',
        a: refOf(next.a),
        b: refOf(next.b),
        actionId: next.a.actionId as string,
      });
    }
  }
  stats.selected = T.length;

  // Arm K: VERSCHIEDENE Handlung, sonst so aehnlich wie moeglich — sonst misst
  // die Negativ-Kontrolle den Themenbruch statt den Katalog.
  const K: ActionGoldenCase[] = [];
  const kSeen = new Set<string>();
  const kUses = new Map<string, number>();
  const sortedUsable = [...usable].sort((x, y) => `${x.law}${x.title}`.localeCompare(`${y.law}${y.title}`));
  for (const a of sortedUsable) {
    if (K.length >= Math.min(maxPerArm, T.length)) break;
    for (const b of sortedUsable) {
      if (a.law === b.law) continue;
      if (a.actionId === b.actionId) continue;
      if (a.partyRole !== b.partyRole || a.modality !== b.modality) continue;
      const id = caseId(a, b);
      if (kSeen.has(id)) continue;
      const ua = kUses.get(idOf(a)) ?? 0;
      const ub = kUses.get(idOf(b)) ?? 0;
      if (ua >= maxUses || ub >= maxUses) continue;

      kSeen.add(id);
      kUses.set(idOf(a), ua + 1);
      kUses.set(idOf(b), ub + 1);
      K.push({
        id,
        arm: 'K',
        a: refOf(a),
        b: refOf(b),
        actionId: a.actionId as string,
        actionIdB: b.actionId as string,
      });
      break;
    }
  }

  return { T, K, statsT: stats };
}

/** Setzt die beiden Arme zu einem Prüfsatz zusammen. */
export function toGoldenSet(r: PairSelectionResult, version: string, ontologyVersion: string): ActionGoldenSet {
  return { version, frozen: false, ontologyVersion, cases: [...r.T, ...r.K] };
}
