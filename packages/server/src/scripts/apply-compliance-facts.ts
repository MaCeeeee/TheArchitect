/**
 * apply-compliance-facts — spielt einen Facts-Katalog (facts-catalog.*.json) per
 * Produkt-API in die Element-metadata ein. Ersetzt das Prosa-Nachpflegen von
 * Beschreibungen (Ousterhout: Fakten einmal deklarieren statt pro Gesetz texten).
 *
 * SICHERHEIT: PUT /elements/:id ERSETZT metadataJson vollständig (kein Merge im
 * Server!). Deshalb macht dieses Skript zwingend GET → mergeComplianceIntoMetadata
 * → PUT und fasst NUR den compliance-Schlüssel an. Default ist --dry-run;
 * geschrieben wird erst mit --apply.
 *
 *   export TA_API=http://localhost:3000/api  TA_KEY=ta_...  TA_PROJECT=6a3ff887...
 *   npm run facts:apply                                  # Dry-Run (zeigt Diff-Plan)
 *   npm run facts:apply -- --apply                       # schreibt wirklich
 *   npm run facts:apply -- --catalog <andere.json> --apply
 *
 * Design: COMPLIANCE_FACTS.md · Linear: Epic THE-378
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ComplianceFactsV1Schema,
  mergeComplianceIntoMetadata,
  parseFactsFromMetadata,
  serializeFacts,
  type ComplianceFactsV1,
} from '../compliance/factsV1';

interface CatalogFile {
  version: number;
  profiles: Record<string, unknown>;
}

export interface PlanEntry {
  elementId: string;
  action: 'create' | 'update' | 'unchanged' | 'invalid' | 'not_found';
  detail: string;
}

/** Validiert den Katalog und liefert je Element das geparste Profil (reine Funktion). */
export function parseCatalog(raw: unknown): Map<string, ComplianceFactsV1 | { error: string }> {
  const out = new Map<string, ComplianceFactsV1 | { error: string }>();
  const cat = raw as CatalogFile;
  if (!cat || typeof cat !== 'object' || !cat.profiles || typeof cat.profiles !== 'object') {
    throw new Error('Katalog braucht die Form { version, profiles: { <elementId>: <facts> } }');
  }
  for (const [elementId, profile] of Object.entries(cat.profiles)) {
    const parsed = ComplianceFactsV1Schema.safeParse(profile);
    out.set(
      elementId,
      parsed.success
        ? parsed.data
        : { error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }
    );
  }
  return out;
}

/** Entscheidet je Element, was zu tun ist (reine Funktion — testbar). */
export function planFor(
  elementId: string,
  parsed: ComplianceFactsV1 | { error: string },
  existingMetadata: Record<string, unknown> | null
): PlanEntry {
  if ('error' in parsed) return { elementId, action: 'invalid', detail: parsed.error };
  const existing = parseFactsFromMetadata(existingMetadata);
  if (existing && JSON.stringify(existing) === JSON.stringify(parsed)) {
    return { elementId, action: 'unchanged', detail: serializeFacts(parsed) };
  }
  return {
    elementId,
    action: existing ? 'update' : 'create',
    detail: serializeFacts(parsed),
  };
}

// ─── API-Glue ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const catIdx = argv.indexOf('--catalog');
  const catalogPath = path.resolve(
    catIdx !== -1 && argv[catIdx + 1]
      ? argv[catIdx + 1]
      : path.join(__dirname, '..', 'compliance', 'facts-catalog.self.v1.json')
  );

  const api = process.env.TA_API || 'http://localhost:3000/api';
  const key = process.env.TA_KEY;
  const projectId = process.env.TA_PROJECT;
  if (!key || !projectId) {
    console.error('TA_KEY und TA_PROJECT müssen gesetzt sein (TA_API optional).');
    process.exitCode = 2;
    return;
  }

  const catalog = parseCatalog(JSON.parse(fs.readFileSync(catalogPath, 'utf8')));
  console.log(
    `[facts] Katalog ${path.basename(catalogPath)}: ${catalog.size} Profile · ` +
      `${apply ? 'APPLY' : 'DRY-RUN (schreiben mit --apply)'}\n`
  );

  const headers = { 'X-API-Key': key, 'Content-Type': 'application/json' };
  const counts: Record<string, number> = {};

  for (const [elementId, parsed] of catalog) {
    let entry: PlanEntry;
    const res = await fetch(`${api}/projects/${projectId}/elements/${elementId}`, { headers });
    if (res.status === 404) {
      entry = { elementId, action: 'not_found', detail: 'Element existiert nicht im Projekt' };
    } else if (!res.ok) {
      throw new Error(`GET ${elementId}: HTTP ${res.status}`);
    } else {
      const body = (await res.json()) as { data?: { metadata?: Record<string, unknown> } };
      const existingMetadata = body.data?.metadata ?? {};
      entry = planFor(elementId, parsed, existingMetadata);

      if (apply && (entry.action === 'create' || entry.action === 'update')) {
        const merged = mergeComplianceIntoMetadata(existingMetadata, parsed as ComplianceFactsV1);
        const put = await fetch(`${api}/projects/${projectId}/elements/${elementId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ metadata: merged }),
        });
        if (!put.ok) throw new Error(`PUT ${elementId}: HTTP ${put.status}`);
      }
    }
    counts[entry.action] = (counts[entry.action] ?? 0) + 1;
    const mark = { create: '＋', update: '↻', unchanged: '＝', invalid: '✗', not_found: '?' }[
      entry.action
    ];
    console.log(`  ${mark} ${entry.elementId} [${entry.action}] ${entry.detail}`);
  }

  console.log(
    `\n[facts] ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}` +
      (apply ? '' : '\n[facts] Nichts geschrieben (Dry-Run). Mit --apply einspielen.')
  );
  const invalid = counts['invalid'] ?? 0;
  if (invalid > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error('[facts] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
