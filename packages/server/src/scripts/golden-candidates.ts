/**
 * golden-candidates — Vorprüfung des Kandidatenpools VOR dem Self-Baseline-
 * Labeling (SELF_BASELINE_GUIDE.md, Schritt 1).
 *
 * Listet alle Architektur-Elemente eines Projekts aus Neo4j und prüft die
 * Labeling-Tauglichkeit nach RUBRIC.md v2: Der Zwei-Stufen-Test (§ 2.3)
 * verlangt, dass regulierte Datenkategorien in der Element-Beschreibung
 * EXPLIZIT dokumentiert sind — ein Element ohne Beschreibung kann bei
 * Stufe-1-Pflichten (Löschung, Sicherheit) nie match werden, obwohl es
 * vielleicht sollte. Solche Lücken müssen VOR dem Labeling im Modell
 * geschlossen werden, sonst sind sie unsichtbare False Negatives.
 *
 *   npm run golden:candidates -- <projectId>            # liest Neo4j direkt (.env nötig)
 *   npm run golden:candidates -- --from-json <file>     # liest die API-Antwort von
 *                                                       # GET /api/projects/:id/elements
 *                                                       # (kein DB-Zugang nötig, nur API-Key)
 *
 * Read-only. Linear: THE-379 (REQ-EVAL-001.1) · Epic THE-378
 */
import type { CandidateElement } from '../services/complianceMapping.service';

// ─── Reine Auswertung (ohne DB — testbar) ───────────────────────

export interface CandidateReport {
  total: number;
  byType: Record<string, number>;
  withoutDescription: CandidateElement[];
  shortDescription: CandidateElement[]; // < 30 Zeichen: kaum je "explizit dokumentiert"
  /** Elemente, deren Beschreibung eine Datenkategorie erwähnt (Heuristik). */
  dataBearing: CandidateElement[];
  distinctTypes: number;
}

const DATA_HINTS =
  /personal data|personenbezogen|customer data|contact person|kontaktdaten|user data|nutzerdaten|pii|credentials|session|stores|speichert|verarbeitet/i;

export function analyzeCandidates(candidates: CandidateElement[]): CandidateReport {
  const byType: Record<string, number> = {};
  const withoutDescription: CandidateElement[] = [];
  const shortDescription: CandidateElement[] = [];
  const dataBearing: CandidateElement[] = [];

  for (const c of candidates) {
    byType[c.type] = (byType[c.type] ?? 0) + 1;
    const desc = (c.description ?? '').trim();
    if (desc.length === 0) withoutDescription.push(c);
    else if (desc.length < 30) shortDescription.push(c);
    if (desc && DATA_HINTS.test(desc)) dataBearing.push(c);
  }

  return {
    total: candidates.length,
    byType,
    withoutDescription,
    shortDescription,
    dataBearing,
    distinctTypes: Object.keys(byType).length,
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

  if (report.withoutDescription.length > 0) {
    lines.push(
      `⚠️  OHNE Beschreibung (${report.withoutDescription.length}) — können bei Stufe-1-` +
        `Pflichten (Löschung/Sicherheit) NIE match werden (Rubrik §2.3 Zusatzbedingung):`,
    );
    for (const c of report.withoutDescription) lines.push(`   - ${c.id} · ${c.name} (${c.type})`);
    lines.push('');
  }
  if (report.shortDescription.length > 0) {
    lines.push(`⚠️  Sehr kurze Beschreibung (${report.shortDescription.length}) — prüfen, ob Datenkategorien fehlen:`);
    for (const c of report.shortDescription) lines.push(`   - ${c.id} · ${c.name}: "${c.description}"`);
    lines.push('');
  }
  lines.push(
    `Daten-tragend laut Beschreibung (${report.dataBearing.length}) — Kernkandidaten für DSGVO-Stufe-1-Fälle:`,
  );
  for (const c of report.dataBearing) lines.push(`   - ${c.id} · ${c.name} (${c.type})`);

  lines.push('');
  const ok = report.withoutDescription.length === 0 && report.distinctTypes >= 4;
  lines.push(
    ok
      ? '✅ Pool ist labeling-tauglich. Weiter mit SELF_BASELINE_GUIDE.md Schritt 2.'
      : '❌ Erst Modell nachpflegen (Beschreibungen mit Datenkategorien!), dann erneut prüfen.',
  );
  return lines.join('\n');
}

/**
 * Normalisiert die Element-API-Antwort (GET /api/projects/:id/elements) auf
 * das Kandidaten-Schema. Reine Funktion — testbar. Akzeptiert sowohl das
 * `{ success, data: [...] }`-Envelope als auch ein rohes Array.
 */
export function candidatesFromApiJson(raw: unknown): CandidateElement[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown })?.data)
      ? ((raw as { data: unknown[] }).data)
      : null;
  if (!arr) {
    throw new Error('Unerwartetes JSON: erwarte ein Array oder { data: [...] } (API-Antwort)');
  }
  return arr.map((e): CandidateElement => {
    const el = e as Record<string, unknown>;
    return {
      id: el.id != null ? String(el.id) : '',
      name: el.name != null ? String(el.name) : '',
      type: (el.type != null ? String(el.type) : 'custom') as CandidateElement['type'],
      layer: el.layer != null ? String(el.layer) : undefined,
      description: el.description != null ? String(el.description) : undefined,
    };
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
