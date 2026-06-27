/**
 * Ground-Truth-Labels für den WFCOMP-Eval-Datensatz (REQ-WFCOMP-001.7 / THE-359).
 *
 * Handgelabelt = die menschliche Wahrheit über die Art.-30-Realität eines Workflows,
 * unabhängig davon, wie das Tool sie berechnet. Der Eval-Harness vergleicht
 * Tool-Output gegen diese Labels (M1: deterministische Teilmenge).
 *
 * M1-Teilmenge (deterministisch). M2 ergänzt missing-purpose + inferrable/ambiguous.
 */
export type Litera = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';
export type Criticality = 'HART' | 'BEDINGT' | 'WEICH';

export interface ExpectedGap {
  litera: Litera;
  criticality: Criticality;
}

export interface FixtureGroundTruth {
  fixture: string; // Dateiname ohne .json
  gdprScope: boolean; // Ist Art. 30 überhaupt einschlägig?
  /** Menschlich gelabelte, deterministisch entscheidbare Lücken (HART/BEDINGT). */
  groundTruthGaps: ExpectedGap[];
  /** Sanitize-Gate: nach Ingestion dürfen 0 Personendaten persistiert sein. */
  expectsNoPiiAtRest?: boolean;
  note: string;
}

export const GROUND_TRUTH: FixtureGroundTruth[] = [
  {
    fixture: 'clean-compliant',
    gdprScope: true,
    groundTruthGaps: [],
    note: 'Empfänger (EU) + Storage vorhanden → d deterministisch grün. a/b brauchen Attestierung (M2), kein deterministisches false-rot.',
  },
  {
    fixture: 'missing-recipient',
    gdprScope: true,
    groundTruthGaps: [{ litera: 'd', criticality: 'HART' }],
    note: 'Personenbezogene Daten erhoben + gespeichert, aber an keine Empfänger-Rolle offengelegt → d ROT.',
  },
  {
    fixture: 'pindata-leak',
    gdprScope: true,
    groundTruthGaps: [{ litera: 'd', criticality: 'HART' }],
    expectsNoPiiAtRest: true,
    note: 'Trägt pinData + hardcodierte PII (E-Mail/Name/IBAN). Sanitize MUSS strippen (G1). Strukturell intern (kein Empfänger) → d ROT.',
  },
  {
    fixture: 'thirdcountry-no-safeguard',
    gdprScope: true,
    groundTruthGaps: [{ litera: 'e', criticality: 'BEDINGT' }],
    note: 'Empfänger in US (.com, Mailchimp) → Drittland-Transfer ohne dokumentierte Garantie → e ROT. d ist present (Empfänger existiert).',
  },
  {
    fixture: 'no-personal-data',
    gdprScope: false,
    groundTruthGaps: [],
    note: 'Verschiebt Dateien zwischen Buckets; keine personenbezogenen Felder → Art. 30 nicht einschlägig (G5).',
  },
  {
    fixture: 'inferrable-purpose',
    gdprScope: true,
    groundTruthGaps: [],
    note: 'M2: Zweck klar inferierbar (Newsletter) → b mode confirm. Deterministisch d/e present (EU-Empfänger). Tier-B-Referenz: "Newsletter-Anmeldung verwalten".',
  },
  {
    fixture: 'ambiguous-purpose',
    gdprScope: true,
    groundTruthGaps: [],
    note: 'M2: generischer Daten-Relay, Zweck mehrdeutig → b mode ask (LLM abstain). Deterministisch d/e present (EU). Tier-B: korrektes Verhalten = abstain.',
  },
];
