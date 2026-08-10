import type { Config } from 'jest';
import base from './jest.config';

/**
 * DIE TORE — der schnelle, verlässliche Lauf (THE-611).
 *
 * ── WARUM EINE EIGENE LISTE ──
 *
 * `npm test` fährt 236 Suiten, 60 davon mit Datenbank; ein Teil ist
 * vorbestehend flaky (Jest-Worker-Crashes unter Parallelität, THE-435). Ein
 * roter Gesamtlauf ist deshalb mehrdeutig — und ein Tor, dessen Rot man
 * routinemäßig wegdrückt, ist keins mehr.
 *
 * Hier stehen deshalb NUR Suiten, die eine Freigabe-Bedingung tragen und
 * dabei rein mechanisch sind: kein Modell, kein Netz, keine Datenbank, nichts
 * Zufälliges. Der ganze Lauf dauert ~1 Sekunde. Rot heißt hier: etwas ist
 * kaputt — nicht „vielleicht wieder der Worker".
 *
 * ── WAS HIER AUFGENOMMEN WIRD ──
 *
 * Eine Suite gehört hierher, wenn sie eine Bedingung prüft, die vor einer
 * Auslieferung gelten MUSS, und wenn ihr Ergebnis nicht wackeln kann. Die
 * Liste ist bewusst explizit statt per Glob: Was ein Tor ist, wird
 * entschieden, nicht durch einen Dateinamen zufällig erworben.
 *
 * Doku: docs/evals/reqtrace-release-gates.md · docs/evals/action-release-gates.md
 */
const GATE_SUITES = [
  // Gold über den Produktpfad ≥ 4/5, mit Umkehrprobe (THE-611)
  'goldGuard',
  // Verdrängung greift VOR jedem Urteil — die mechanische Negativ-Kontrolle (THE-563)
  'displacementGateSvc',
  // Paar-Bildung: Familie, Adressat, Verdrängung, Bilanz (THE-545/590/600)
  'measureGrouping',
  // „Betrifft mich dieses Gesetz?" — die acht vorab festgelegten Zellen (THE-548)
  'legalProfile',
  // Kanarienvögel: kann der Richter überhaupt ablehnen? (THE-382)
  'canaries',
  // Kohärenz-Tor des Handlungs-Katalogs (THE-438)
  'actionMetrics',
  // Ein Paragraph, ein Schlüssel — quer über Korpus und Projekt-Kopie (THE-645).
  // Bricht die Invariante, findet der Rückschluss die Anforderung nicht mehr,
  // und zwar STILL: der Vorschlag entsteht, das Element auch, die Lücke bleibt.
  'normSectionAnchor',
  // Kein Produktcode baut Norm-/Sektions-Schlüssel von Hand — dreimal in einer
  // Woche entstand genau so ein stiller Bug (THE-600/643/645). Statischer
  // Quelltext-Scan mit Umkehrprobe (THE-653).
  'canonicalKey',
  // Wer „nichts gefunden" behauptet, muss belegen, dass er etwas angesehen
  // hat: jede E2E-Spec mit Null-Zusicherung braucht einen positiven Nenner
  // (THE-653). Braucht e2e/ im Build-Kontext — das Dockerfile kopiert es.
  'emptyMeasurement',
  // Mensch-Übereinstimmung des Paar-Richters (THE-382)
  'pairAgreement',
];

const config: Config = {
  ...base,
  testMatch: GATE_SUITES.map((s) => `<rootDir>/src/__tests__/${s}.test.ts`),
};

export default config;
