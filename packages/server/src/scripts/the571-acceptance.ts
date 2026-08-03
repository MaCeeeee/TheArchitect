/**
 * the571-acceptance — die sieben EA-Fragen an EINEM echten Fall (THE-571).
 *
 * ── WAS DIESES SKRIPT IST ──
 *
 * Ein Messinstrument, kein Produktcode. Es ruft je Frage GENAU den Dienst auf,
 * den die zugehörige Oberflächen-Fläche aufruft, und protokolliert, was ein
 * Nutzer zu sehen bekäme. Die Einstufung A/B/C/D trifft der Mensch im Befund
 * (docs/evals/the571-abnahme-sieben-fragen.md) — dieses Skript liefert nur die
 * Belege.
 *
 * ── DIE EINE ABWEICHUNG, DIE OFFENGELEGT GEHÖRT ──
 *
 * Es misst die DIENST-Ebene, nicht den Klick. Ob eine Fläche existiert und
 * erreichbar ist, wurde getrennt an der Quelle belegt (Datei:Zeile im Befund).
 * Was diese Kombination NICHT fängt: eine Fläche, die existiert und beim
 * Klicken bricht. Genau das fand die Handprobe zu THE-570 zweimal — die
 * Grenze ist real und steht so im Befund.
 *
 * READ-ONLY mit EINER Ausnahme: der Aufbau setzt das Rechts-Profil des
 * Projekts (`--write-profile`), weil Frage 1 ohne Profil keine Sollseite hat.
 * Das ist Aufbau, keine Reparatur.
 *
 *   npx ts-node src/scripts/the571-acceptance.ts --project <id> [--write-profile]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Project } from '../models/Project';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';
import { Evidence } from '../models/Evidence';
import { buildProjectLegalApplicability } from '../services/legalApplicability.service';
import { forwardTrace, backwardTrace } from '../services/traceability.service';
import { chainDriftCheck } from '../services/chainDrift.service';
import { buildGroupables, proposeSharedMeasures } from '../services/harmonization.service';
import { getPipelineNorm } from '../services/norm.service';
import { computeComplianceGaps } from '../services/compliance-gaps.service';
import {
  getCorpusConnection,
  isCorpusConfigured,
  isCorpusReachable,
  listTypingSummaries,
} from '../services/corpusClient.service';

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function head(n: number, title: string): void {
  console.log(`\n${'='.repeat(72)}\nFRAGE ${n}: ${title}\n${'='.repeat(72)}`);
}

/**
 * Das Profil des Falls: BSH, Hausgerätehersteller.
 * Sektor ist Freitext (Rechtsfrage, kein Enum — THE-548).
 */
const BSH_PROFILE = {
  jurisdictions: ['EU', 'DE'],
  sectors: ['manufacture of electrical equipment', 'household appliances'],
  addresseeClasses: ['essential_important_entity', 'controller', 'manufacturer'],
  size: { employees: 62000, revenueEur: 15_600_000_000 },
  dataKinds: ['personal_data', 'employee_data'],
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const projectId = arg(argv, '--project');
  if (!projectId) throw new Error('--project <id> fehlt');
  const writeProfile = argv.includes('--write-profile');

  await mongoose.connect(process.env.MONGODB_URI as string);
  // Die Korpus-Verbindung ist faul und läuft mit `bufferCommands: false` —
  // ohne dieses Warten wirft der erste Zugriff, und die Messung würde die
  // eigene Kaltstart-Lücke als Produktbefund ausweisen.
  if (isCorpusConfigured()) {
    await getCorpusConnection().asPromise();
    console.log(`Aufbau: Korpus verbunden = ${isCorpusReachable()}`);
  } else {
    console.log('Aufbau: KORPUS NICHT KONFIGURIERT — Messung wäre ungültig');
  }
  const project = await Project.findById(projectId);
  if (!project) throw new Error(`Projekt ${projectId} nicht gefunden`);
  console.log(`Fall: „${project.name}"  (${projectId})`);

  // ── AUFBAU ─────────────────────────────────────────────────────────
  if (writeProfile) {
    project.set('legalProfile', BSH_PROFILE);
    await project.save();
    console.log('Aufbau: Rechts-Profil gesetzt.');
  }
  console.log(`Aufbau: legalProfile = ${project.legalProfile ? 'vorhanden' : 'FEHLT'}`);

  // ══ FRAGE 1 — Betrifft mich das Gesetz? ════════════════════════════
  head(1, 'Betrifft mich das Gesetz?');
  try {
    // Exakt wie die Route (norms.routes.ts:104ff): Profil + Korpus-Typisierung.
    const applic = await buildProjectLegalApplicability(project.legalProfile, listTypingSummaries);
    console.log(`profilePresent=${applic.profilePresent} corpus=${applic.corpus}`);
    const laws = applic.laws;
    console.log(`Gesetze bewertet: ${laws.length}`);
    const byVerdict = new Map<string, string[]>();
    for (const l of laws) byVerdict.set(l.state, [...(byVerdict.get(l.state) ?? []), l.law]);
    for (const [v, ls] of byVerdict) console.log(`  ${v.padEnd(14)} ${ls.length}×  ${ls.slice(0, 6).join(', ')}`);
    const nis2 = laws.find((l) => l.law.includes('nis2'));
    console.log(`  NIS2 im Detail: ${JSON.stringify(nis2 ?? null).slice(0, 400)}`);
    // Die Oberfläche RENDERT eine Zitat-Liste (LegalApplicabilityCheck.tsx:287ff).
    // Trägt die Antwort sie? Das entscheidet, ob Frage 2 „welcher Teil" beantwortet
    // ist oder nur gezählt wird.
    // THE-573: seit dem Bau trägt die Antwort die bindenden Artikel selbst.
    // `citations` bleibt den Verdrängungs-Belegen vorbehalten — zwei Listen,
    // zwei Aussagen.
    const withBinding = laws.filter((l) => Array.isArray(l.bindingProvisionEIds) && (l.bindingProvisionEIds as unknown[]).length > 0);
    console.log(`  Gesetze MIT benannten bindenden Artikeln: ${withBinding.length} von ${laws.length}`);
    for (const l of laws) {
      const eids = (l.bindingProvisionEIds as string[] | undefined) ?? [];
      const total = (l.provisionsBinding as number | undefined) ?? 0;
      const rest = total > eids.length ? ` (+${total - eids.length} weitere)` : '';
      console.log(
        `     ${String(l.law).padEnd(16)} ${String(l.state).padEnd(15)} bindend=${l.provisionsBinding ?? '—'}/${l.provisionsTyped}` +
          (eids.length ? `  → ${eids.slice(0, 4).join(', ')}${rest}` : ''),
      );
    }
  } catch (e) {
    console.log(`  FEHLER: ${(e as Error).message}`);
  }

  // ══ FRAGE 2 — Welcher Teil? ════════════════════════════════════════
  head(2, 'Welcher Teil des Gesetzes?');
  const fwd = await forwardTrace(projectId);
  console.log(`Normen mit Ketten-Anforderungen: ${fwd.norms.length}`);
  for (const n of fwd.norms) {
    console.log(`  ${n.regulationKey}: ${n.clauses.length} Klausel(n)`);
    for (const c of n.clauses.slice(0, 4)) {
      console.log(
        `     ${c.contentId}  ${(c.clausePath ?? '—').padEnd(10)} reqs=${c.requirements.length} elemente=${c.linkedElementIds.length}`,
      );
      console.log(`        „${(c.clauseText ?? '').replace(/\s+/g, ' ').slice(0, 90)}…"`);
    }
  }
  console.log(`Ohne Klausel-Anker (Altbestand): ${fwd.withoutClauseAnchor.count}`);
  // Wie viel des GESETZES ist abgedeckt? Sollseite aus dem Korpus.
  const anchored = await ComplianceRequirement.find({
    projectId,
    normId: { $exists: true, $ne: null },
  }).select('normId sectionEId').lean();
  const normIds = [...new Set(anchored.map((r) => r.normId))];
  for (const nid of normIds) {
    const norm = await getPipelineNorm(String(projectId), String(nid));
    const total = norm?.sections.length ?? 0;
    const touched = new Set(anchored.filter((r) => r.normId === nid).map((r) => r.sectionEId));
    console.log(`  Sollseite ${nid}: ${touched.size} von ${total} Artikeln bearbeitet`);
  }

  // ══ FRAGE 3 — Anforderungen an Prozess/App/Daten/Org? ══════════════
  head(3, 'Wie lauten die Anforderungen — an Prozess, App, Daten, Organisation?');
  const sysReqs = await ChainSystemRequirement.find({ projectId }).lean();
  console.log(`Systemanforderungen: ${sysReqs.length}`);
  const layerFields = ['layer', 'targetLayer', 'architectureLayer', 'elementType', 'ebene'];
  const present = layerFields.filter((f) => sysReqs.some((r) => (r as Record<string, unknown>)[f] != null));
  console.log(`  Ziel-Ebenen-Feld am Objekt: ${present.length ? present.join(', ') : 'KEINES'}`);
  for (const r of sysReqs.slice(0, 3)) {
    const rr = r as unknown as Record<string, string>;
    console.log(`  · „${String(rr.text).slice(0, 70)}…"`);
    console.log(`      schutzgut=${rr.schutzgut || '—'} | verpflichteter=${rr.verpflichteter || '—'} | ausloeser=${(rr.ausloeser || '—').slice(0, 30)} | nachweis=${(rr.nachweis || '—').slice(0, 30)}`);
  }

  // ══ FRAGE 4 — Erfülle ich es, und wo? ══════════════════════════════
  head(4, 'Erfülle ich es — und wo im Modell?');
  const reqs = await ComplianceRequirement.find({ projectId, chain: { $exists: true } }).lean();
  const gateCount = { covered: { yes: 0, no: 0 }, enforced: { yes: 0, no: 0 }, attested: { yes: 0, no: 0 } };
  let linked = 0;
  for (const r of reqs) {
    if (r.linkedElementIds?.length) linked += 1;
    const g = r.gates as unknown as Record<string, { state: string }> | undefined;
    if (!g) continue;
    for (const k of ['covered', 'enforced', 'attested'] as const) {
      if (g[k]?.state === 'yes') gateCount[k].yes += 1;
      else gateCount[k].no += 1;
    }
  }
  console.log(`Ketten-Anforderungen: ${reqs.length}, davon mit verlinktem Element: ${linked}`);
  console.log(`  Tor covered  ja=${gateCount.covered.yes} nein=${gateCount.covered.no}`);
  console.log(`  Tor enforced ja=${gateCount.enforced.yes} nein=${gateCount.enforced.no}`);
  console.log(`  Tor attested ja=${gateCount.attested.yes} nein=${gateCount.attested.no}`);
  console.log(`  Evidenz-Dokumente im Projekt: ${await Evidence.countDocuments({ projectId })}`);
  const withEl = reqs.find((r) => r.linkedElementIds?.length);
  if (withEl) {
    const back = await backwardTrace(projectId, withEl.linkedElementIds[0]);
    console.log(`  Rückwärts ab Element „${back.elementId}": ${back.requirements.length} Anforderung(en), Ausmustern verlöre ${back.impact.wouldLoseCoverage} → Gesetze ${back.impact.laws.join(', ') || '—'}`);
  }

  // ══ FRAGE 5 — Wenn nein, was tun? ══════════════════════════════════
  head(5, 'Wenn nein — was ist zu tun?');
  const uncovered = reqs.filter((r) => !r.linkedElementIds?.length);
  console.log(`Unerfüllte Ketten-Anforderungen (ohne Element): ${uncovered.length}`);
  // Sieht die Lücken-Ansicht (GapAnalysis → /compliance/gaps) die Kette, und
  // trägt sie das, woraus man handeln kann — Frist und Tore?
  const gaps = await computeComplianceGaps(String(projectId), {});
  const first = (gaps as unknown as { items: Array<Record<string, unknown>> }).items?.[0] ?? {};
  console.log(`Lücken-Ansicht: ${(gaps as unknown as { items: unknown[] }).items.length} Einträge`);
  console.log(`  Felder je Eintrag: ${Object.keys(first).join(', ')}`);
  for (const f of ['deadline', 'gates', 'chain'] as const) {
    console.log(`  trägt „${f}": ${f in first ? 'ja' : 'NEIN'}`);
  }
  const strs = await StakeholderRequirement.find({ projectId }).lean();
  const withDeadline = strs.filter((s) => (s as Record<string, unknown>).deadline != null);
  console.log(`Stakeholder-Anforderungen mit Frist: ${withDeadline.length} von ${strs.length}`);
  for (const s of withDeadline.slice(0, 4)) {
    const d = (s as unknown as Record<string, Record<string, unknown>>).deadline;
    console.log(`  · ${JSON.stringify(d)}`);
  }
  // Kommt die Frist bis zur Anforderung durch (Rückwärts-Sicht)?
  if (withEl) {
    const back = await backwardTrace(projectId, withEl.linkedElementIds[0]);
    console.log(`  Frist an der Anforderung sichtbar: ${back.requirements.filter((r) => r.deadline).length} von ${back.requirements.length}`);
  }

  // ══ FRAGE 6 — Harmonisierbar? ══════════════════════════════════════
  head(6, 'Lässt sich das mit anderen Gesetzen harmonisieren?');
  try {
    // Wie die Route (requirements.routes.ts:265): derselbe ask, echtes Modell.
    // Ohne echten Aufruf wäre die Aussage über Frage 6 wertlos — die
    // Klassifikation IST der Schritt, an dem sie hängt.
    const { makeHarmonizationAsk } = await import('../services/harmonizationAsk');
    const ask = makeHarmonizationAsk();
    // Der VOLLE Routen-Aufruf (requirements.routes.ts:267) — die Gruppierung
    // entsteht erst im Richter, nicht in der Vorstufe.
    const result = await proposeSharedMeasures(projectId, { ask, judge: ask, maxJudgedPairs: 50 });
    console.log(`Statistik: ${JSON.stringify(result.stats)}`);
    const g = result.grouping;
    const detailById = new Map(result.memberDetails.map((m) => [m.systemRequirementId, m]));
    console.log(`Vorgeschlagene Maßnahmen: ${g.measures.length}  (Richter sah ${g.judged} Paare)`);
    // `laws` trägt die Maßnahme selbst — das ist die Zahl, auf die es ankommt.
    const multi = g.measures.filter((m) => m.memberIds.length > 1);
    const crossLaw = g.measures.filter((m) => new Set(m.laws.map((l) => l.replace(/-de$/, ''))).size > 1);
    console.log(`  davon mit mehr als einem Mitglied: ${multi.length}`);
    console.log(`  davon über MEHR ALS EIN GESETZ: ${crossLaw.length}   ⟵ der Ertrag der Frage`);
    for (const m of multi) {
      const already = m.memberIds.map((i) => detailById.get(i)?.linkedElementIds?.length ?? 0).reduce((a, b) => a + b, 0);
      console.log(`     mitglieder=${m.memberIds.length} gesetze=[${m.laws.join(', ')}] bereits verlinkte Elemente=${already}`);
      for (const i of m.memberIds) console.log(`        „${(detailById.get(i)?.title ?? '?').slice(0, 66)}"`);
    }
    console.log(`  paarweise Kandidaten ohne Gruppe (sharedCorePairs): ${g.sharedCorePairs.length}`);
    console.log(`  durch Verdrängung ausgeschlossen: ${g.excludedByDisplacement.length}`);
    console.log(`  Zusammenfall auf Anforderungsebene: ${g.collapsed.length}`);
  } catch (e) {
    console.log(`  Ergebnis: ${(e as Error).message}`);
  }

  // ══ FRAGE 7 — Was hat sich geändert? ═══════════════════════════════
  head(7, 'Was hat sich geändert? / Was zuerst? / Wer ist zuständig?');
  const drift = await chainDriftCheck(projectId);
  console.log(`7a Änderung — Drift-Lauf: ${JSON.stringify(drift)}`);
  const anchoredCount = await ComplianceRequirement.countDocuments({
    projectId, chain: { $exists: true }, normId: { $exists: true, $ne: null }, sectionEId: { $exists: true, $ne: null },
  });
  console.log(`     prüfbar (mit Korpus-Anker): ${anchoredCount} von ${reqs.length}`);
  const prios = new Map<string, number>();
  for (const r of reqs) prios.set(r.priority, (prios.get(r.priority) ?? 0) + 1);
  console.log(`7b Reihenfolge — Prioritäten: ${JSON.stringify(Object.fromEntries(prios))}`);
  console.log(`     Sanktions-Feld an der Anforderung: ${reqs.some((r) => (r as Record<string, unknown>).sanction != null) ? 'ja' : 'NEIN'}`);
  const verpflichtete = new Set(sysReqs.map((r) => (r as unknown as Record<string, string>).verpflichteter).filter(Boolean));
  console.log(`7c Zuständigkeit — verschiedene „verpflichteter"-Werte: ${verpflichtete.size}`);
  console.log(`     ${[...verpflichtete].slice(0, 8).join(' | ')}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
