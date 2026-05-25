/**
 * UC-REQGEN-001 Live-Verification — THE-303 AC-2
 *
 * Führt 5 BSH-ähnliche Demo-Szenarien gegen ECHTES Anthropic Claude Haiku 4.5 aus
 * und prüft, dass aus realen Regulation-Paragraphen actionable, strukturierte
 * Compliance-Requirements extrahiert werden.
 *
 * AC-2 (THE-303): "Aus § 6 LkSG entsteht mindestens 1 Requirement priority=must
 *                 mit linkedElementIds zu cap-lieferantenmanagement."
 *
 * Erweiterte Checks pro Szenario:
 *   - mindestens 1 Requirement extrahiert
 *   - Schema-Validierung (Zod) passes
 *   - Keine hallucinated linkedElementIds
 *   - Mindestens 1 Requirement matches expected priority
 *   - Mindestens 1 Requirement matches expected element-id (für mappable cases)
 *
 * Run: cd packages/server && \
 *      ANTHROPIC_API_KEY=sk-... npx tsx scripts/verify-uc-reqgen-001-llm.ts
 *
 * Kosten: 5 Calls × ~$0.002 = ~$0.01 (Haiku 4.5, größerer Output)
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
import {
  generateRequirementsFromText,
  type CandidateElement,
  type ComplianceRequirementCandidate,
} from '../src/services/requirementGenerator.service';

// ─── Fixtures (identisch zu UC-ICM-002 Live-Verify, damit vergleichbar) ─

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
  expectMinRequirements: number;              // mindestens diese Anzahl Requirements
  expectAtLeastOnePriority: 'must' | 'should' | 'may';  // muss vorkommen
  expectAtLeastOneLinkedTo?: string;          // optional: bestimmtes Element verlinkt
}

const SCENARIOS: Scenario[] = [
  {
    name: 'LkSG § 6 — Präventionsmaßnahmen Supplier-Risiko (AC-2)',
    regulationText: `Stellt das Unternehmen im Rahmen seiner Risikoanalyse nach § 5 ein Risiko fest, so hat es unverzüglich angemessene Präventionsmaßnahmen gegenüber dem Verursacher zu verankern. Angemessene Präventionsmaßnahmen gegenüber einem unmittelbaren Zulieferer sind insbesondere: 1. die Berücksichtigung menschenrechtlicher und umweltbezogener Erwartungen bei der Auswahl eines unmittelbaren Zulieferers; 2. die vertragliche Zusicherung eines unmittelbaren Zulieferers, dass dieser die vom Unternehmen verlangten Anforderungen einhält und entlang der Lieferkette angemessen adressiert; 3. die Durchführung von Schulungen und Weiterbildungen zur Durchsetzung der vertraglichen Zusicherungen des unmittelbaren Zulieferers; 4. die Vereinbarung angemessener vertraglicher Kontrollmechanismen sowie deren risikobasierte Durchführung, um die Einhaltung der Menschenrechtsstrategie bei dem unmittelbaren Zulieferer zu überprüfen.`,
    source: 'lksg',
    paragraphNumber: '§ 6',
    language: 'de',
    jurisdiction: 'DE',
    expectMinRequirements: 3,
    expectAtLeastOnePriority: 'must',
    expectAtLeastOneLinkedTo: 'cap-lieferantenmanagement',
  },
  {
    name: 'NIS2 Art. 21 — Cybersecurity-Maßnahmen',
    regulationText: `Die Mitgliedstaaten stellen sicher, dass wesentliche und wichtige Einrichtungen geeignete und verhältnismäßige technische, operative und organisatorische Maßnahmen zur Beherrschung der Risiken für die Sicherheit der Netz- und Informationssysteme ergreifen. Diese Maßnahmen umfassen insbesondere: (a) Konzepte für Risikoanalyse und Sicherheit der Informationssysteme; (b) Bewältigung von Sicherheitsvorfällen; (c) Aufrechterhaltung des Betriebs einschließlich Backup-Management und Wiederherstellung nach einem Notfall sowie Krisenmanagement; (d) Sicherheit der Lieferkette einschließlich sicherheitsbezogener Aspekte der Beziehungen zwischen den einzelnen Einrichtungen und ihren unmittelbaren Anbietern oder Dienstleistern; (e) Sicherheitsmaßnahmen bei Erwerb, Entwicklung und Wartung von Netz- und Informationssystemen.`,
    source: 'nis2',
    paragraphNumber: 'Art. 21',
    language: 'de',
    jurisdiction: 'EU',
    expectMinRequirements: 4,
    expectAtLeastOnePriority: 'must',
    expectAtLeastOneLinkedTo: 'app-sap-erp',
  },
  {
    name: 'DSGVO Art. 32 — Sicherheit der Verarbeitung',
    regulationText: `Unter Berücksichtigung des Stands der Technik, der Implementierungskosten und der Art, des Umfangs, der Umstände und der Zwecke der Verarbeitung sowie der unterschiedlichen Eintrittswahrscheinlichkeit und Schwere des Risikos für die Rechte und Freiheiten natürlicher Personen treffen der Verantwortliche und der Auftragsverarbeiter geeignete technische und organisatorische Maßnahmen, um ein dem Risiko angemessenes Schutzniveau zu gewährleisten; diese Maßnahmen schließen gegebenenfalls unter anderem Folgendes ein: a) die Pseudonymisierung und Verschlüsselung personenbezogener Daten; b) die Fähigkeit, die Vertraulichkeit, Integrität, Verfügbarkeit und Belastbarkeit der Systeme und Dienste im Zusammenhang mit der Verarbeitung auf Dauer sicherzustellen; c) die Fähigkeit, die Verfügbarkeit der personenbezogenen Daten und den Zugang zu ihnen bei einem physischen oder technischen Zwischenfall rasch wiederherzustellen.`,
    source: 'dsgvo',
    paragraphNumber: 'Art. 32',
    language: 'de',
    jurisdiction: 'EU',
    expectMinRequirements: 3,
    expectAtLeastOnePriority: 'must',
    expectAtLeastOneLinkedTo: 'cap-datenverarbeitung-b2c',
  },
  {
    name: 'DSGVO Art. 9 — Besondere Kategorien personenbezogener Daten',
    regulationText: `Die Verarbeitung personenbezogener Daten, aus denen die rassische und ethnische Herkunft, politische Meinungen, religiöse oder weltanschauliche Überzeugungen oder die Gewerkschaftszugehörigkeit hervorgehen, sowie die Verarbeitung von genetischen Daten, biometrischen Daten zur eindeutigen Identifizierung einer natürlichen Person, Gesundheitsdaten oder Daten zum Sexualleben oder der sexuellen Orientierung einer natürlichen Person ist untersagt. Die Verarbeitung ist nur zulässig, wenn die betroffene Person ausdrücklich in die Verarbeitung der genannten personenbezogenen Daten für einen oder mehrere festgelegte Zwecke eingewilligt hat oder wenn die Verarbeitung erforderlich ist, damit der Verantwortliche oder die betroffene Person die ihm bzw. ihr aus dem Arbeitsrecht erwachsenden Rechte ausüben kann.`,
    source: 'dsgvo',
    paragraphNumber: 'Art. 9',
    language: 'de',
    jurisdiction: 'EU',
    expectMinRequirements: 2,
    expectAtLeastOnePriority: 'must',
    expectAtLeastOneLinkedTo: 'app-hr-plattform',
  },
  {
    name: 'LkSG § 8 — Beschwerdeverfahren (no clear element match)',
    regulationText: `Das Unternehmen hat dafür zu sorgen, dass ein angemessenes unternehmensinternes Beschwerdeverfahren nach Maßgabe der Absätze 2 bis 4 eingerichtet ist. Über das Beschwerdeverfahren muss es Personen ermöglicht werden, auf menschenrechtliche und umweltbezogene Risiken sowie auf Verletzungen menschenrechtsbezogener oder umweltbezogener Pflichten hinzuweisen, die durch das wirtschaftliche Handeln eines Unternehmens im eigenen Geschäftsbereich oder eines unmittelbaren Zulieferers entstanden sind. Das Unternehmen hat eine Verfahrensordnung in Textform festzulegen, die öffentlich zugänglich ist.`,
    source: 'lksg',
    paragraphNumber: '§ 8',
    language: 'de',
    jurisdiction: 'DE',
    expectMinRequirements: 2,
    expectAtLeastOnePriority: 'must',
    // kein expectAtLeastOneLinkedTo — kein klares Mapping, [] ist auch OK
  },
];

// ─── Runner ─────────────────────────────────────────────────────

interface ScenarioResult {
  name: string;
  passed: boolean;
  reasons: string[];
  requirements: ComplianceRequirementCandidate[];
  durationMs: number;
}

async function runScenario(s: Scenario, client: Anthropic): Promise<ScenarioResult> {
  const reasons: string[] = [];
  const start = Date.now();

  const { candidates } = await generateRequirementsFromText({
    text: s.regulationText,
    source: s.source,
    paragraphNumber: s.paragraphNumber,
    language: s.language,
    jurisdiction: s.jurisdiction,
    candidateElements: BSH_DEMO_ELEMENTS,
    anthropicClient: client,
  });

  const durationMs = Date.now() - start;

  // Check 1: minimum requirement count
  if (candidates.length < s.expectMinRequirements) {
    reasons.push(
      `FAIL: only ${candidates.length} requirements (expected ≥ ${s.expectMinRequirements})`,
    );
  } else {
    reasons.push(`✓ ${candidates.length} requirements extracted (≥ ${s.expectMinRequirements})`);
  }

  // Check 2: at least one matches expected priority
  const priorityMatch = candidates.filter(c => c.priority === s.expectAtLeastOnePriority);
  if (priorityMatch.length === 0) {
    reasons.push(
      `FAIL: no requirement with priority=${s.expectAtLeastOnePriority} (got: ${candidates.map(c => c.priority).join(', ')})`,
    );
  } else {
    reasons.push(`✓ ${priorityMatch.length}× priority=${s.expectAtLeastOnePriority}`);
  }

  // Check 3: at least one requirement links to expected element (if expected)
  if (s.expectAtLeastOneLinkedTo) {
    const linked = candidates.filter(c =>
      c.linkedElementIds.includes(s.expectAtLeastOneLinkedTo as string),
    );
    if (linked.length === 0) {
      reasons.push(
        `FAIL: no requirement linked to ${s.expectAtLeastOneLinkedTo} (links: ${candidates.flatMap(c => c.linkedElementIds).join(', ') || 'none'})`,
      );
    } else {
      reasons.push(`✓ ${linked.length}× linked to ${s.expectAtLeastOneLinkedTo}`);
    }
  }

  // Check 4: no hallucinated ids (validate against BSH demo set)
  const validIds = new Set(BSH_DEMO_ELEMENTS.map(e => e.id));
  let hallucinated = 0;
  for (const c of candidates) {
    for (const id of c.linkedElementIds) {
      if (!validIds.has(id)) {
        reasons.push(`FAIL: hallucinated linkedElementId "${id}" in "${c.title}"`);
        hallucinated++;
      }
    }
  }
  if (hallucinated === 0) {
    reasons.push(`✓ no hallucinated ids`);
  }

  // Check 5: confidence + structural validity (already enforced by Zod, but log range)
  const confidences = candidates.map(c => c.confidence);
  if (confidences.length > 0) {
    const min = Math.min(...confidences);
    const max = Math.max(...confidences);
    reasons.push(`ⓘ confidence range: ${min.toFixed(2)} – ${max.toFixed(2)}`);
  }

  const passed = !reasons.some(r => r.startsWith('FAIL'));
  return { name: s.name, passed, reasons, requirements: candidates, durationMs };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set — aborting.');
    process.exit(1);
  }

  console.log(`▶ UC-REQGEN-001 Live-Verification — model: ${process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'}`);
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
      console.log(`      requirements:`);
      for (const req of r.requirements) {
        const links = req.linkedElementIds.length > 0 ? ` → [${req.linkedElementIds.join(', ')}]` : '';
        console.log(
          `        - [${req.priority.toUpperCase()}] ${req.title} (conf ${req.confidence.toFixed(2)})${links}`,
        );
      }
      console.log();
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`);
      results.push({
        name: s.name,
        passed: false,
        reasons: [`FAIL: ${(err as Error).message}`],
        requirements: [],
        durationMs: 0,
      });
    }
  }

  // ─── Summary ──────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const totalMs = results.reduce((a, r) => a + r.durationMs, 0);
  const avgMs = Math.round(totalMs / results.length);
  const totalReqs = results.reduce((a, r) => a + r.requirements.length, 0);

  console.log('━'.repeat(60));
  console.log(`Result: ${passed}/${results.length} scenarios passed`);
  console.log(`Total requirements extracted: ${totalReqs} across ${results.length} paragraphs`);
  console.log(`Total time: ${totalMs}ms (avg ${avgMs}ms per call)`);
  console.log(
    `Per-paragraph projection: 100 regs ≈ ${Math.round((totalMs / results.length) * 100 / 1000)}s (sequential)`,
  );

  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
