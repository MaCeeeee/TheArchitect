/**
 * actionMetrics — Auswertung des Drei-Arme-Kontrollversuchs (THE-438,
 * REQ-REQHARM-001.2b). REIN: kein I/O, keine Netzaufrufe, damit vollständig
 * testbar. Muster: typingMetrics.ts.
 *
 * ── DIE ZENTRALE REGEL ──
 *
 * Ohne bestandene POSITIV-Kontrolle ist der Lauf ungültig, und Arm T wird
 * NICHT berichtet — auch nicht im gerenderten Text.
 *
 * Am 2026-08-01 ergaben drei aufeinander folgende Messungen „0 Treffer". Der
 * Richter hatte zwei Defekte: seine Rubrik gehörte zur starken These und
 * schloss die gesuchte Antwort aus, und er urteilte über das Gesetzes-Etikett
 * statt über den Text (wortgleicher Pflichttext unter zwei Etiketten: 7/15;
 * geblendet 15/15). Ein Instrument, das nie „ja" sagt, sieht aus wie ein
 * sauberes Instrument mit klarem Negativ-Befund. Eine Positiv-Kontrolle hätte
 * beides sofort aufgedeckt — sie war nie gefahren worden.
 *
 * Deshalb ist sie hier Vorbedingung, nicht Beiwerk, und deshalb ist `tRate`
 * `null`, solange der Lauf ungültig ist: eine Zahl, die nicht existiert, kann
 * auch nicht versehentlich zitiert werden.
 *
 * Linear: THE-438 · Vorgeschichte: THE-538
 */

/** Ein Prüfer-Votum. `null` = Haus hat nicht geantwortet (Ausfall, keine Ablehnung). */
export type Vote = boolean | null;

/** Konfidenzstufe eines Harmonisierungs-Vorschlags. */
export type Tier = 'A' | 'B' | 'C';

/** Untergrenze der Positiv-Kontrolle. Darunter ist das Instrument unbrauchbar. */
export const POSITIVE_CONTROL_MIN = 0.95;

/** Kohärenz-Tor des Projekts. Darunter darf das System vorschlagen, nicht behaupten. */
export const COHERENCE_GATE = 0.8;

/** `null` (nicht bestimmbar) besteht das Tor NICHT — Unwissen ist kein Bestehen. */
export function meetsCoherenceGate(kappa: number | null): boolean {
  return kappa !== null && kappa >= COHERENCE_GATE;
}

/**
 * Cohen's Kappa über zwei Prüferreihen.
 *
 * `null`, wenn ein Prüfer konstant ist: dann ist Kappa rechnerisch 0, ohne dass
 * Uneinigkeit vorläge (Prävalenz-Paradox, RUBRIC B4a). Eine 0 an dieser Stelle
 * zu berichten würde perfekte Übereinstimmung als Totaldissens ausweisen.
 *
 * WIRFT bei ungleicher Länge, statt die ersten n zu vergleichen: ungleich lange
 * Reihen sind ein Programmfehler, und ein stillschweigend gekürzter Vergleich
 * lieferte ein plausibles, falsches Kappa.
 */
export function cohensKappa(a: boolean[], b: boolean[]): number | null {
  if (a.length !== b.length) {
    throw new Error(`cohensKappa: ungleiche Länge (${a.length} vs ${b.length}) — Prüferreihen gehören paarweise zusammen`);
  }
  const n = a.length;
  if (n === 0) return null;

  const pa = a.filter(Boolean).length / n;
  const pb = b.filter(Boolean).length / n;
  if (pa === 0 || pa === 1 || pb === 0 || pb === 1) return null;

  let agree = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) agree++;
  const po = agree / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? null : (po - pe) / (1 - pe);
}

export interface HouseAgreement {
  a: string;
  b: string;
  /** `null` = nicht bestimmbar (konstanter Prüfer oder zu wenig Überlappung). */
  kappa: number | null;
  agreement: number;
  /** Fälle, in denen BEIDE Häuser geantwortet haben. */
  n: number;
}

/**
 * Kappa über alle Haus-Paare. Fälle, in denen eines der beiden Häuser
 * ausgefallen ist (`null`), fließen nicht ein — ein Ausfall ist keine Meinung
 * und darf die Übereinstimmung weder heben noch senken.
 */
export function pairwiseKappa(votesByHouse: Record<string, Vote[]>): HouseAgreement[] {
  const names = Object.keys(votesByHouse);
  const out: HouseAgreement[] = [];

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [na, nb] = [names[i], names[j]];
      const va = votesByHouse[na];
      const vb = votesByHouse[nb];
      const pa: boolean[] = [];
      const pb: boolean[] = [];
      for (let k = 0; k < Math.min(va.length, vb.length); k++) {
        if (va[k] !== null && vb[k] !== null) {
          pa.push(va[k] as boolean);
          pb.push(vb[k] as boolean);
        }
      }
      const agree = pa.filter((v, k) => v === pb[k]).length;
      out.push({
        a: na,
        b: nb,
        kappa: cohensKappa(pa, pb),
        agreement: pa.length === 0 ? 0 : agree / pa.length,
        n: pa.length,
      });
    }
  }
  return out;
}

/**
 * Konfidenzstufe aus dem Mehrhausvotum.
 *
 * Ausgefallene Häuser (`null`) zählen NICHT als Gegenstimme — ein stummes Haus
 * ist keine Ablehnung. Sonst würde ein Budget- oder Netzproblem systematisch
 * Vorschläge herabstufen und wie inhaltliche Uneinigkeit aussehen.
 */
export function tierFor(votes: Vote[]): Tier {
  const valid = votes.filter((v): v is boolean => v !== null);
  if (valid.length === 0) return 'C';
  const yes = valid.filter(Boolean).length;
  if (yes === valid.length) return 'A';
  return yes * 2 > valid.length ? 'B' : 'C';
}

export interface ArmRate {
  yes: number;
  n: number;
  rate: number;
}

export function armRates(arm: boolean[]): ArmRate {
  const yes = arm.filter(Boolean).length;
  return { yes, n: arm.length, rate: arm.length === 0 ? 0 : yes / arm.length };
}

export interface ActionReport {
  valid: boolean;
  reason: string;
  pRate: number;
  kRate: number;
  /** `null`, solange der Lauf ungültig ist — die Zahl darf dann nicht zirkulieren. */
  tRate: number | null;
  /** `tRate` geteilt durch die Decke des Instruments (`pRate`). */
  tRateNormalised: number | null;
  markdown: string;
}

/**
 * Wertet die drei Arme aus.
 *
 *   P — Positiv-Kontrolle: dieselbe Pflicht, nur die Herkunft variiert.
 *       Muss nahezu 100 % „ja" ergeben, sonst ist das Instrument kaputt.
 *   T — gleiche kanonische Handlung: der eigentliche Messwert.
 *   K — verschiedene Handlung: darf NIE „ja" ergeben.
 */
export function buildActionReport(arms: { P: boolean[]; T: boolean[]; K: boolean[] }): ActionReport {
  const p = armRates(arms.P);
  const t = armRates(arms.T);
  const k = armRates(arms.K);

  let valid = true;
  let reason = 'Kontrollen bestanden.';

  if (p.n === 0) {
    // "Kein Arm P" heisst nicht "bestanden", sondern "nie geprueft" — genau der
    // Zustand, in dem die drei Vormittags-Messungen erhoben wurden.
    valid = false;
    reason = 'Positiv-Kontrolle nicht gemessen — ohne sie ist kein Befund belastbar, Arm T wird nicht berichtet.';
  } else if (p.rate < POSITIVE_CONTROL_MIN) {
    valid = false;
    reason =
      `Positiv-Kontrolle bei ${(100 * p.rate).toFixed(0)} % (< ${100 * POSITIVE_CONTROL_MIN} %) — ` +
      'Instrument unbrauchbar, Arm T wird nicht berichtet. Zuerst Prompt und Blendung prüfen, nie das Modell tunen.';
  } else if (k.yes > 0) {
    valid = false;
    reason =
      `Negativ-Kontrolle mit ${k.yes} Fehlalarm(en) auf ${k.n} Urteilen — ` +
      'Katalog zu grob oder Richter zu großzügig. Betroffenen Katalog-Eintrag aufteilen.';
  }

  const tRate = valid ? t.rate : null;
  const tCell = valid ? `${(100 * t.rate).toFixed(0)} %` : '— (Lauf ungültig)';

  const markdown = [
    '| Arm | Treffer | Quote |',
    '| --- | --- | --- |',
    `| P Positiv-Kontrolle *(dieselbe Pflicht)* | ${p.yes}/${p.n} | ${(100 * p.rate).toFixed(0)} % |`,
    `| T gleiche kanonische Handlung | ${t.yes}/${t.n} | ${tCell} |`,
    `| K Negativ-Kontrolle *(verschiedene Handlung)* | ${k.yes}/${k.n} | ${(100 * k.rate).toFixed(0)} % |`,
    '',
    valid && p.rate > 0
      ? `Arm T gegen die Decke des Instruments: ${((100 * t.rate) / p.rate).toFixed(0)} %.`
      : 'Lauf ungültig — Arm T wird bewusst nicht ausgewiesen.',
    '',
    reason,
  ].join('\n');

  return {
    valid,
    reason,
    pRate: p.rate,
    kRate: k.rate,
    tRate,
    tRateNormalised: valid && p.rate > 0 ? t.rate / p.rate : null,
    markdown,
  };
}
