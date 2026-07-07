/**
 * golden-candidates — Vorprüfung des Kandidatenpools VOR dem Self-Baseline-
 * Labeling (SELF_BASELINE_GUIDE.md, Schritt 1).
 *
 * Listet alle Architektur-Elemente eines Projekts und prüft die Labeling-
 * Tauglichkeit nach RUBRIC.md v2: Der Zwei-Stufen-Test (§ 2.3) verlangt, dass
 * regulierte Datenkategorien am Element EXPLIZIT dokumentiert sind. Primärer
 * Mechanismus dafür ist das Compliance-Facts-Profil (metadata.compliance,
 * COMPLIANCE_FACTS.md); die Freitext-Beschreibung ist nur noch Übergangs-
 * Fallback. Elemente ohne beides sind für Stufe-1-Pflichten (Löschung,
 * Sicherheit) blind → unsichtbare False Negatives, VOR dem Labeling schließen
 * (npm run facts:apply).
 *
 *   npm run golden:candidates -- <projectId>            # liest Neo4j direkt (.env nötig)
 *   npm run golden:candidates -- --from-json <file>     # liest die API-Antwort von
 *                                                       # GET /api/projects/:id/elements
 *                                                       # (kein DB-Zugang nötig, nur API-Key)
 *
 * Read-only. Linear: THE-379 (REQ-EVAL-001.1) · Epic THE-378
 */
import type { CandidateElement } from '../services/complianceMapping.service';
import {
  ComplianceFactsV1Schema,
  parseHoldsEntry,
  serializeFacts,
  type ComplianceFactsV1,
} from '../compliance/factsV1';

// ─── Reine Auswertung (ohne DB — testbar) ───────────────────────

export interface ProfiledCandidate extends CandidateElement {
  /** Geparstes Compliance-Facts-Profil (metadata.compliance), falls vorhanden+gültig. */
  facts?: ComplianceFactsV1 | null;
  /** true = metadata.compliance existiert, ist aber schema-ungültig. */
  factsInvalid?: boolean;
}

export interface CandidateReport {
  total: number;
  byType: Record<string, number>;
  withoutDescription: ProfiledCandidate[];
  shortDescription: ProfiledCandidate[]; // < 30 Zeichen: kaum je "explizit dokumentiert"
  /** Elemente, deren Beschreibung eine Datenkategorie erwähnt (Heuristik, Fallback). */
  dataBearing: ProfiledCandidate[];
  distinctTypes: number;
  /** Compliance-Facts-Abdeckung (der eigentliche §2.3-Mechanismus). */
  profiled: ProfiledCandidate[];
  invalidProfiles: ProfiledCandidate[];
  /** Profilierte Elemente mit mind. einer doc-Kategorie → Stufe-1-Kandidaten. */
  docHolders: ProfiledCandidate[];
}

const DATA_HINTS =
  /personal data|personenbezogen|customer data|contact person|kontaktdaten|user data|nutzerdaten|pii|credentials|session|stores|speichert|verarbeitet/i;

export function analyzeCandidates(candidates: ProfiledCandidate[]): CandidateReport {
  const byType: Record<string, number> = {};
  const withoutDescription: ProfiledCandidate[] = [];
  const shortDescription: ProfiledCandidate[] = [];
  const dataBearing: ProfiledCandidate[] = [];
  const profiled: ProfiledCandidate[] = [];
  const invalidProfiles: ProfiledCandidate[] = [];
  const docHolders: ProfiledCandidate[] = [];

  for (const c of candidates) {
    byType[c.type] = (byType[c.type] ?? 0) + 1;
    const desc = (c.description ?? '').trim();
    if (desc.length === 0) withoutDescription.push(c);
    else if (desc.length < 30) shortDescription.push(c);
    if (desc && DATA_HINTS.test(desc)) dataBearing.push(c);
    if (c.factsInvalid) invalidProfiles.push(c);
    if (c.facts) {
      profiled.push(c);
      if (c.facts.holds.some(h => parseHoldsEntry(h).presence === 'doc')) docHolders.push(c);
    }
  }

  return {
    total: candidates.length,
    byType,
    withoutDescription,
    shortDescription,
    dataBearing,
    distinctTypes: Object.keys(byType).length,
    profiled,
    invalidProfiles,
    docHolders,
  };
}

export function renderCandidateReport(report: CandidateReport): string {
  const lines: string[] = [];
  lines.push(`Kandidaten gesamt: ${report.total}`);
  lines.push(
    `Element-Typen (${report.distinctTypes}, Rubrik §6 verlangt ≥ 4): ` +
      Object.entries(report.byType)
        .sort(([, a], [, b]) => b - a)
        .map(([t, n]) => `${t}: ${n}`)
        .join(' · '),
  );
  lines.push('');

  lines.push(
    `Compliance-Facts-Profile (§2.3-Mechanismus): ${report.profiled.length}/${report.total} Elemente` +
      ` · doc-Halter (Stufe-1-Kandidaten): ${report.docHolders.length}` +
      (report.invalidProfiles.length ? ` · ⚠️ UNGÜLTIG: ${report.invalidProfiles.length}` : ''),
  );
  for (const c of report.docHolders) {
    lines.push(`   ● ${c.id} · ${c.name} → ${serializeFacts(c.facts as ComplianceFactsV1)}`);
  }
  for (const c of report.invalidProfiles) {
    lines.push(`   ✗ ${c.id} · ${c.name} — metadata.compliance schema-ungültig, fixen!`);
  }
  if (report.profiled.length === 0) {
    lines.push('   (noch keine Profile — mit `npm run facts:apply` aus dem Katalog einspielen)');
  }
  lines.push('');

  // Blockierend ist nur, was WEDER Profil NOCH Beschreibung hat.
  const blind = report.withoutDescription.filter(c => !c.facts);
  if (blind.length > 0) {
    lines.push(
      `⚠️  Weder Profil noch Beschreibung (${blind.length}) — für Stufe-1-Pflichten blind` +
        ` (Rubrik §2.3 Zusatzbedingung):`,
    );
    for (const c of blind) lines.push(`   - ${c.id} · ${c.name} (${c.type})`);
    lines.push('');
  }
  if (report.shortDescription.length > 0) {
    const unprofiled = report.shortDescription.filter(c => !c.facts);
    if (unprofiled.length > 0) {
      lines.push(`⚠️  Sehr kurze Beschreibung ohne Profil (${unprofiled.length}) — prüfen:`);
      for (const c of unprofiled) lines.push(`   - ${c.id} · ${c.name}: "${c.description}"`);
      lines.push('');
    }
  }
  lines.push(
    `Daten-tragend laut Beschreibung (${report.dataBearing.length}) — Fallback-Heuristik für unprofilierte Elemente:`,
  );
  for (const c of report.dataBearing) lines.push(`   - ${c.id} · ${c.name} (${c.type})`);

  lines.push('');
  const ok = blind.length === 0 && report.distinctTypes >= 4 && report.invalidProfiles.length === 0;
  lines.push(
    ok
      ? '✅ Pool ist labeling-tauglich. Weiter mit SELF_BASELINE_GUIDE.md Schritt 2.'
      : '❌ Erst nachpflegen (Facts-Profile via `npm run facts:apply` bzw. ungültige Profile fixen), dann erneut prüfen.',
  );
  return lines.join('\n');
}

/**
 * Normalisiert die Element-API-Antwort (GET /api/projects/:id/elements) auf
 * das Kandidaten-Schema. Reine Funktion — testbar. Akzeptiert sowohl das
 * `{ success, data: [...] }`-Envelope als auch ein rohes Array.
 */
export function candidatesFromApiJson(raw: unknown): ProfiledCandidate[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown })?.data)
      ? ((raw as { data: unknown[] }).data)
      : null;
  if (!arr) {
    throw new Error('Unerwartetes JSON: erwarte ein Array oder { data: [...] } (API-Antwort)');
  }
  return arr.map((e): ProfiledCandidate => {
    const el = e as Record<string, unknown>;
    const out: ProfiledCandidate = {
      id: el.id != null ? String(el.id) : '',
      name: el.name != null ? String(el.name) : '',
      type: (el.type != null ? String(el.type) : 'custom') as CandidateElement['type'],
      layer: el.layer != null ? String(el.layer) : undefined,
      description: el.description != null ? String(el.description) : undefined,
    };
    const meta = el.metadata as Record<string, unknown> | undefined;
    if (meta && typeof meta === 'object' && meta.compliance != null) {
      const parsed = ComplianceFactsV1Schema.safeParse(meta.compliance);
      if (parsed.success) out.facts = parsed.data;
      else out.factsInvalid = true;
    }
    return out;
  });
}

// ─── DB-Glue ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonFlagIdx = argv.indexOf('--from-json');

  // Weg B: API-Antwort aus Datei (kein DB-Zugang nötig, nur der API-Key beim curl).
  if (jsonFlagIdx !== -1) {
    const file = argv[jsonFlagIdx + 1];
    if (!file) {
      console.error('Usage: golden-candidates --from-json <file.json>');
      process.exitCode = 2;
      return;
    }
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const candidates = candidatesFromApiJson(raw);
    console.log(`[candidates] aus ${file} (${candidates.length} Elemente)\n`);
    console.log(renderCandidateReport(analyzeCandidates(candidates)));
    return;
  }

  // Weg A: direkt aus Neo4j.
  const projectId = argv[0];
  if (!projectId) {
    console.error('Usage: golden-candidates <projectId>  |  golden-candidates --from-json <file>');
    process.exitCode = 2;
    return;
  }
  const dotenv = await import('dotenv');
  dotenv.config(); // .env aus packages/server lesen (NEO4J_URI/USER/PASSWORD)

  const { connectNeo4j, getNeo4jDriver } = await import('../config/neo4j');
  const { loadProjectCandidateElements } = await import('../services/complianceElements.service');

  await connectNeo4j();
  try {
    const candidates = await loadProjectCandidateElements(projectId);
    console.log(`[candidates] Projekt ${projectId}\n`);
    console.log(renderCandidateReport(analyzeCandidates(candidates)));
  } finally {
    await getNeo4jDriver().close().catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[candidates] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
