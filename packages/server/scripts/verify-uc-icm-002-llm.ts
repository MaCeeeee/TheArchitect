/**
 * UC-ICM-002 Live-Verification — D3 AC-5
 *
 * Führt 5 BSH-ähnliche Demo-Szenarien gegen ECHTES Anthropic Claude Haiku 4.5 aus
 * und prüft AC-5: "≥ 0.7 Confidence beim High-Confidence-Match".
 *
 * Run: cd packages/server && \
 *      ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-uc-icm-002-llm.ts
 *
 * Kosten: 5 Calls × ~$0.001 = ~$0.005 (Haiku 4.5)
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'path';
// override:true — the shell may pre-set empty values that dotenv would otherwise skip
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });
if (!process.env.ANTHROPIC_API_KEY) {
  dotenvConfig({
    path: '/Users/mac_macee/javis/packages/server/.env',
    override: true,
    quiet: true,
  });
}

import Anthropic from '@anthropic-ai/sdk';
import { mapTextToElements, type CandidateElement } from '../src/services/complianceMapping.service';

// ─── Fixtures ───────────────────────────────────────────────────

const BSH_DEMO_ELEMENTS: CandidateElement[] = [
  {
    id: 'cap-lieferantenmanagement',
    name: 'Lieferantenmanagement',
    type: 'capability',
    layer: 'business',
    description:
      'Strategische Fähigkeit zum Aufbau und Steuerung von Beziehungen zu Zulieferern. Enthält Onboarding, Bewertung, Risikoanalyse und Audit-Prozesse für Tier-1- und Tier-2-Suppliers.',
  },
  {
    id: 'cap-datenverarbeitung-b2c',
    name: 'Datenverarbeitung B2C',
    type: 'capability',
    layer: 'business',
    description:
      'Verarbeitung personenbezogener Daten von Endkunden im Rahmen des Hausgeräte-Vertriebs und After-Sales-Service. Umfasst Kundenkonten, Bestellungen, Garantie-Cases.',
  },
  {
    id: 'app-sap-erp',
    name: 'ERP-System SAP',
    type: 'application',
    layer: 'application',
    description:
      'Zentrales SAP S/4HANA-System für Finanzbuchhaltung, Materialwirtschaft, Produktion und Vertrieb. Business-kritisch, mit ~3000 Usern.',
  },
  {
    id: 'app-hr-plattform',
    name: 'HR-Plattform',
    type: 'application',
    layer: 'application',
    description:
      'Workday-basierte HR-Plattform für Personaldaten, Gehaltsabrechnung, Performance-Reviews und Recruiting. Enthält besondere Kategorien personenbezogener Daten (Gesundheitsdaten, Sozialversicherung).',
  },
  {
    id: 'data-personalakte',
    name: 'Mitarbeiter-Personalakte',
    type: 'data_object',
    layer: 'data',
    description:
      'Digitale Personalakte mit Stammdaten, Vertragsdaten, Gesundheitsdaten, Performance-Bewertungen und Beschäftigungshistorie eines Mitarbeiters.',
  },
];

interface Scenario {
  name: string;
  regulationText: string;
  source: string;
  paragraphNumber: string;
  language: 'de' | 'en';
  jurisdiction: string;
  // Validation
  expectedHighConfidenceId: string;        // muss ≥ 0.7 sein
  expectedHighConfidenceMinScore: number;  // mindestens dieser Wert
  expectedToBeRanked: string[];             // alle müssen in Top-5 erscheinen (≥ Threshold)
}

const SCENARIOS: Scenario[] = [
  {
    name: 'NIS2 Art. 21 — Cybersecurity in Supply Chain',
    regulationText: `Die Mitgliedstaaten stellen sicher, dass wesentliche und wichtige Einrichtungen geeignete und verhältnismäßige technische, operative und organisatorische Maßnahmen zur Beherrschung der Risiken für die Sicherheit der Netz- und Informationssysteme ergreifen. Diese Maßnahmen umfassen insbesondere: (a) Konzepte für Risikoanalyse und Sicherheit der Informationssysteme; (d) Sicherheit der Lieferkette einschließlich sicherheitsbezogener Aspekte der Beziehungen zwischen den einzelnen Einrichtungen und ihren unmittelbaren Anbietern oder Dienstleistern.`,
    source: 'nis2',
    paragraphNumber: 'Art. 21',
    language: 'de',
    jurisdiction: 'EU',
    expectedHighConfidenceId: 'cap-lieferantenmanagement',
    expectedHighConfidenceMinScore: 0.7,
    expectedToBeRanked: ['cap-lieferantenmanagement', 'app-sap-erp'],
  },
  {
    name: 'LkSG § 6 — Präventionsmaßnahmen Supplier-Risiko',
    regulationText: `Stellt das Unternehmen im Rahmen seiner Risikoanalyse nach § 5 ein Risiko fest, so hat es unverzüglich angemessene Präventionsmaßnahmen gegenüber dem Verursacher zu verankern. Angemessene Präventionsmaßnahmen gegenüber einem unmittelbaren Zulieferer sind insbesondere: 1. die Berücksichtigung menschenrechtlicher und umweltbezogener Erwartungen bei der Auswahl eines unmittelbaren Zulieferers; 2. die vertragliche Zusicherung eines unmittelbaren Zulieferers, dass dieser die vom Unternehmen verlangten Anforderungen einhält.`,
    source: 'lksg',
    paragraphNumber: '§ 6',
    language: 'de',
    jurisdiction: 'DE',
    expectedHighConfidenceId: 'cap-lieferantenmanagement',
    expectedHighConfidenceMinScore: 0.7,
    expectedToBeRanked: ['cap-lieferantenmanagement'],
  },
  {
    name: 'DSGVO Art. 32 — Sicherheit der Verarbeitung',
    regulationText: `Unter Berücksichtigung des Stands der Technik, der Implementierungskosten und der Art, des Umfangs, der Umstände und der Zwecke der Verarbeitung sowie der unterschiedlichen Eintrittswahrscheinlichkeit und Schwere des Risikos für die Rechte und Freiheiten natürlicher Personen treffen der Verantwortliche und der Auftragsverarbeiter geeignete technische und organisatorische Maßnahmen, um ein dem Risiko angemessenes Schutzniveau zu gewährleisten; diese Maßnahmen schließen gegebenenfalls unter anderem Folgendes ein: a) die Pseudonymisierung und Verschlüsselung personenbezogener Daten.`,
    source: 'dsgvo',
    paragraphNumber: 'Art. 32',
    language: 'de',
    jurisdiction: 'EU',
    expectedHighConfidenceId: 'cap-datenverarbeitung-b2c',
    expectedHighConfidenceMinScore: 0.7,
    expectedToBeRanked: ['cap-datenverarbeitung-b2c'],
  },
  {
    name: 'DSGVO Art. 9 — Besondere Kategorien personenbezogener Daten',
    regulationText: `Die Verarbeitung personenbezogener Daten, aus denen die rassische und ethnische Herkunft, politische Meinungen, religiöse oder weltanschauliche Überzeugungen oder die Gewerkschaftszugehörigkeit hervorgehen, sowie die Verarbeitung von genetischen Daten, biometrischen Daten zur eindeutigen Identifizierung einer natürlichen Person, Gesundheitsdaten oder Daten zum Sexualleben oder der sexuellen Orientierung einer natürlichen Person ist untersagt.`,
    source: 'dsgvo',
    paragraphNumber: 'Art. 9',
    language: 'de',
    jurisdiction: 'EU',
    expectedHighConfidenceId: 'app-hr-plattform',
    expectedHighConfidenceMinScore: 0.7,
    expectedToBeRanked: ['app-hr-plattform', 'data-personalakte'],
  },
  {
    name: 'LkSG § 3 — Sorgfaltspflichten Mitarbeiter',
    regulationText: `Unternehmen sind verpflichtet, in ihren Lieferketten die in diesem Gesetz festgelegten menschenrechtlichen und umweltbezogenen Sorgfaltspflichten in angemessener Weise zu beachten mit dem Ziel, menschenrechtlichen oder umweltbezogenen Risiken vorzubeugen oder sie zu minimieren oder die Verletzung menschenrechtsbezogener oder umweltbezogener Pflichten zu beenden. Die Sorgfaltspflichten umfassen die Einrichtung eines Risikomanagements und die Durchführung regelmäßiger Risikoanalysen sowohl im eigenen Geschäftsbereich als auch bei unmittelbaren Zulieferern.`,
    source: 'lksg',
    paragraphNumber: '§ 3',
    language: 'de',
    jurisdiction: 'DE',
    expectedHighConfidenceId: 'cap-lieferantenmanagement',
    expectedHighConfidenceMinScore: 0.7,
    expectedToBeRanked: ['cap-lieferantenmanagement'],
  },
];

// ─── Runner ─────────────────────────────────────────────────────

interface ScenarioResult {
  name: string;
  passed: boolean;
  reasons: string[];
  mappings: Array<{ elementId: string; confidence: number; reasoning: string }>;
  durationMs: number;
}

async function runScenario(s: Scenario, client: Anthropic): Promise<ScenarioResult> {
  const reasons: string[] = [];
  const start = Date.now();

  const { candidates } = await mapTextToElements({
    text: s.regulationText,
    source: s.source,
    paragraphNumber: s.paragraphNumber,
    language: s.language,
    jurisdiction: s.jurisdiction,
    candidateElements: BSH_DEMO_ELEMENTS,
    anthropicClient: client,
  });

  const durationMs = Date.now() - start;

  // Check 1: high-confidence element appeared with sufficient score
  const highConf = candidates.find(c => c.elementId === s.expectedHighConfidenceId);
  if (!highConf) {
    reasons.push(
      `FAIL: expected ${s.expectedHighConfidenceId} not in mappings (got ${candidates.map(c => c.elementId).join(', ') || 'none'})`,
    );
  } else if (highConf.confidence < s.expectedHighConfidenceMinScore) {
    reasons.push(
      `FAIL: ${s.expectedHighConfidenceId} confidence ${highConf.confidence.toFixed(2)} < ${s.expectedHighConfidenceMinScore}`,
    );
  } else {
    reasons.push(
      `✓ ${s.expectedHighConfidenceId} @ ${highConf.confidence.toFixed(2)} ≥ ${s.expectedHighConfidenceMinScore}`,
    );
  }

  // Check 2: all expected elements ranked
  for (const expectedId of s.expectedToBeRanked) {
    if (!candidates.find(c => c.elementId === expectedId)) {
      reasons.push(`WARN: expected ranked ${expectedId} missing`);
    }
  }

  // Check 3: no hallucinated ids
  const validIds = new Set(BSH_DEMO_ELEMENTS.map(e => e.id));
  for (const c of candidates) {
    if (!validIds.has(c.elementId)) {
      reasons.push(`FAIL: hallucinated id ${c.elementId}`);
    }
  }

  const passed = !reasons.some(r => r.startsWith('FAIL'));
  return {
    name: s.name,
    passed,
    reasons,
    mappings: candidates.map(c => ({
      elementId: c.elementId,
      confidence: c.confidence,
      reasoning: c.reasoning,
    })),
    durationMs,
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set — aborting.');
    process.exit(1);
  }

  console.log(`▶ UC-ICM-002 Live-Verification — model: ${process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'}`);
  console.log(`▶ Architecture: ${BSH_DEMO_ELEMENTS.length} elements`);
  console.log(`▶ Scenarios: ${SCENARIOS.length}\n`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results: ScenarioResult[] = [];

  for (const s of SCENARIOS) {
    process.stdout.write(`  • ${s.name} ... `);
    try {
      const r = await runScenario(s, client);
      results.push(r);
      console.log(`${r.passed ? '✅' : '❌'} ${r.durationMs}ms`);
      for (const reason of r.reasons) {
        console.log(`      ${reason}`);
      }
      console.log(`      mappings:`);
      for (const m of r.mappings) {
        console.log(`        - ${m.elementId} @ ${m.confidence.toFixed(2)} — ${m.reasoning.slice(0, 100)}${m.reasoning.length > 100 ? '…' : ''}`);
      }
      console.log();
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`);
      results.push({
        name: s.name,
        passed: false,
        reasons: [`FAIL: ${(err as Error).message}`],
        mappings: [],
        durationMs: 0,
      });
    }
  }

  // ─── Summary ──────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const totalMs = results.reduce((a, r) => a + r.durationMs, 0);
  const avgMs = Math.round(totalMs / results.length);

  console.log('━'.repeat(60));
  console.log(`Result: ${passed}/${results.length} scenarios passed`);
  console.log(`Total time: ${totalMs}ms (avg ${avgMs}ms per call)`);
  console.log(`Per-element budget projection: 50 regs × ${BSH_DEMO_ELEMENTS.length} els ≈ ${Math.round((totalMs / results.length) * 50 / 1000)}s (sequential)`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
