#!/usr/bin/env node
/**
 * bewertung-durchstich.mjs — läuft die Bewertungskette „was kostet mich eine
 * Mission (Änderung)?" rein über die API und misst ZWEI Achsen je Schritt:
 *
 *   1. HÄNDE     wie beim Gesetz-Durchstich: Entscheidung / Mechanik / Bruch
 *   2. HERKUNFT  wem gehören die Zahlen? Jede Geldsumme und jeder Score wird
 *                daraufhin geprüft, ob die Antwort seine Quelle MITLIEFERT —
 *                und ob sie aus Nutzerdaten stammt oder aus Typ-Defaults.
 *
 * Die zweite Achse ist der Grund für dieses Skript: Der UI/UX-Check fand
 * 368.000 $ Gesamtkosten in einem Projekt ohne eine einzige Kostenangabe
 * (B-043). Das Backend kennt die Herkunft (costConfidence/costSource in
 * analytics.service.ts) — die Frage ist, ob sie an jeder Stelle mitreist
 * oder unterwegs verloren geht.
 *
 *   node scripts/bewertung-durchstich.mjs                gegen localhost:4000
 *   node scripts/bewertung-durchstich.mjs --api <url> --token <jwt>
 *   node scripts/bewertung-durchstich.mjs --json
 *   node scripts/bewertung-durchstich.mjs --keep         Testprojekt behalten
 *
 * Teure Läufe (MiroFish-Simulation, Oracle-LLM) bekommen ein Zeitbudget von
 * 120 s. Läuft ein Schritt hinein, wird das als ZEITBUDGET protokolliert —
 * nicht gemessen ist nicht dasselbe wie kaputt.
 */
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const API = (val('--api', 'http://localhost:4000') || '').replace(/\/$/, '');
const SLOW_BUDGET_MS = 120_000;

const ART = {
  HAND: 'HAND', MASCHINE: 'MASCHINE', BRUCH: 'BRUCH', FOLGE: 'FOLGE',
  ZEIT: 'ZEITBUDGET',  // Lauf abgebrochen: Budget erschöpft — nicht gemessen ≠ kaputt
};
const HERKUNFT = {
  NUTZER: 'aus Nutzerdaten',
  GESCHAETZT: 'geschätzt, Quelle benannt',
  OHNE: 'OHNE HERKUNFT',      // Zahl kommt an, Quelle fehlt in der Antwort
  KEINE_ZAHL: null,
};

const log = [];
let token = val('--token') || null;

async function call(method, path, body, opts = {}) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.budget ?? 30_000);
  let res, text;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    text = await res.text();
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, aborted: e.name === 'AbortError', data: null, ms: Date.now() - t0 };
  }
  clearTimeout(timer);
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  const ms = Date.now() - t0;
  if (!opts.quiet) log.push({ method, path, status: res.status, ms });
  return { ok: res.ok, status: res.status, data, ms };
}

const fragen = [];
function frage(nr, titel) {
  const f = { nr, titel, schritte: [], aufrufe: 0, ms: 0 };
  fragen.push(f);
  return {
    schritt(name, art, detail, herkunft) { f.schritte.push({ name, art, detail, herkunft }); return f; },
    zaehle(before) { f.aufrufe = log.length - before; f.ms = log.slice(before).reduce((a, r) => a + r.ms, 0); },
  };
}

// ─── Rüstzeug: Projekt OHNE eine einzige Kostenangabe — mit Absicht ────────
// Jede Geldsumme, die dieser Lauf zurückbekommt, kann NICHT aus Nutzerdaten
// stammen. Liefert eine Antwort sie ohne Herkunftsangabe, ist das der Befund.
async function ruesten() {
  if (!token) {
    const email = `bewertung-${Date.now()}@example.com`;
    const password = 'Bewertung!2026#Kette';
    const reg = await call('POST', '/api/auth/register', { name: 'Bewertung', email, password }, { quiet: true });
    token = reg.data?.accessToken || reg.data?.data?.accessToken;
    if (!token) throw new Error(`Anmeldung fehlgeschlagen (${reg.status}) — läuft der Server auf ${API}?`);
  }
  const p = await call('POST', '/api/projects', {
    name: `Bewertung ${new Date().toISOString().slice(0, 16)}`,
    description: 'Bewertungskette — automatisch angelegt, wird gelöscht',
  }, { quiet: true });
  const pid = p.data?._id || p.data?.data?._id;
  if (!pid) throw new Error(`Projekt nicht anlegbar (HTTP ${p.status})`);

  await call('POST', `/api/projects/${pid}/import/csv`, {
    elements: [
      { id: 'b-crm-alt', name: 'CRM Classic', type: 'application_component', layer: 'application', status: 'current', riskLevel: 'high', description: 'Altes CRM, Wartungsende 2027' },
      { id: 'b-crm-neu', name: 'CRM Cloud', type: 'application_component', layer: 'application', status: 'target', description: 'SaaS-Nachfolger, funktional überlappend' },
      { id: 'b-core', name: 'Kernbanksystem', type: 'application_component', layer: 'application', status: 'current', riskLevel: 'high', description: 'COBOL-Altbestand, einziger Buchungsweg' },
      { id: 'b-portal', name: 'Online-Portal', type: 'application_component', layer: 'application', status: 'current', description: 'Kundenfrontend' },
      { id: 'b-proz', name: 'Kontoeröffnung', type: 'process', layer: 'business', description: 'Kernprozess' },
      { id: 'b-daten', name: 'Kundendaten', type: 'data_object', layer: 'application', description: 'Stammdaten' },
    ],
    connections: [
      { sourceId: 'b-portal', targetId: 'b-core', type: 'flow', label: 'Buchungen' },
      { sourceId: 'b-crm-alt', targetId: 'b-daten', type: 'access', label: 'liest/schreibt' },
      { sourceId: 'b-crm-neu', targetId: 'b-daten', type: 'access', label: 'liest/schreibt' },
      { sourceId: 'b-portal', targetId: 'b-proz', type: 'serving', label: 'bedient' },
      { sourceId: 'b-core', targetId: 'b-proz', type: 'serving', label: 'bedient' },
    ],
  }, { quiet: true });
  return pid;
}

/** Prüft eine Antwort auf Geldzahlen und deren Herkunft. */
function herkunftVon(obj, feldPfade) {
  const flat = JSON.stringify(obj || {});
  const hatZahl = /(cost|tco|capex|budget)/i.test(flat) && /\d{3,}/.test(flat);
  if (!hatZahl) return { h: HERKUNFT.KEINE_ZAHL, detail: 'keine Geldzahl in der Antwort' };
  const hatConfidence = /costConfidence|confidence/.test(flat);
  const hatSource = /costSource|source/.test(flat);
  if (hatConfidence && hatSource) {
    const m = flat.match(/"costConfidence":"([^"]+)"/g) || [];
    const verteilung = {};
    for (const x of m) { const v = x.split(':"')[1].replace('"', ''); verteilung[v] = (verteilung[v] || 0) + 1; }
    const vd = Object.entries(verteilung).map(([k, v]) => `${k}:${v}`).join(' · ');
    const alleDefaults = Object.keys(verteilung).every((k) => k !== 'benchmark' || verteilung[k] === 0);
    return { h: HERKUNFT.GESCHAETZT, detail: `Herkunft reist mit (${vd || 'confidence+source vorhanden'})${alleDefaults ? ' — alles geschätzt, wie es bei diesem Projekt sein MUSS' : ''}` };
  }
  return { h: HERKUNFT.OHNE, detail: `Geldzahlen ohne costConfidence/costSource in der Antwort (${feldPfade || 'siehe JSON'})` };
}

// ─── Die Kette ─────────────────────────────────────────────────────────────
async function sDiagnose(pid) {
  const f = frage(1, 'Diagnose — wo tut es weh?');
  const before = log.length;
  const crit = await call('GET', `/api/projects/${pid}/criticality?topN=5`);
  const cd = crit.data?.data ?? crit.data ?? {};
  const list = cd.rankings ?? cd.elements ?? cd.scores ?? cd.top ?? (Array.isArray(cd) ? cd : []);
  const top = Array.isArray(list) ? list[0] : null;
  f.schritt('Neuralgische Punkte berechnen', crit.ok ? ART.MASCHINE : ART.BRUCH,
    crit.ok ? (top ? `Top: ${JSON.stringify(top).slice(0, 80)}` : `Antwortform: ${Object.keys(cd).join(',').slice(0, 60)}`) : `HTTP ${crit.status}`);
  const risk = await call('GET', `/api/projects/${pid}/analytics/risk`);
  f.schritt('Risiko-Lage', risk.ok ? ART.MASCHINE : ART.BRUCH, risk.ok ? 'berechnet' : `HTTP ${risk.status}`);
  f.schritt('Das Problem benennen', ART.HAND, 'welches Weh zuerst — das entscheidet der Mensch');
  f.zaehle(before);
  return top;
}

async function sTherapie(pid, top) {
  const f = frage(2, 'Therapie — welche Änderung?');
  const before = log.length;
  f.schritt('Änderung formulieren', ART.HAND, 'Was-wäre-wenn ist eine Absicht, keine Ableitung');
  const assess = await call('POST', `/api/projects/${pid}/oracle/assess`, {
    title: 'CRM Classic stilllegen',
    description: 'Das alte CRM wird abgeschaltet, CRM Cloud übernimmt alle Funktionen inklusive Datenmigration.',
    affectedElementIds: ['b-crm-alt', 'b-crm-neu'],
    changeType: 'retire',
  }, { budget: SLOW_BUDGET_MS });
  const ad = assess.data?.data ?? assess.data ?? {};
  const verdict = ad.verdict || ad.recommendation || ad.assessment?.verdict;
  f.schritt('Oracle bewertet den Vorschlag', assess.aborted ? ART.ZEIT : assess.ok ? ART.MASCHINE : ART.BRUCH,
    assess.aborted ? `Zeitbudget ${SLOW_BUDGET_MS / 1000}s erschöpft — nicht gemessen` :
    assess.ok ? `Urteil: ${JSON.stringify(verdict ?? ad).slice(0, 90)}` : `HTTP ${assess.status} — ${JSON.stringify(assess.data).slice(0, 100)}`,
    assess.ok ? herkunftVon(ad, 'oracle.assess') : undefined);
  f.zaehle(before);
  return ad?.assessmentId || ad?._id || ad?.id;
}

async function sValidierung(pid, kostenElemente) {
  const f = frage(3, 'Validierung — hält es?');
  const before = log.length;
  // Der Endpunkt verlangt PERT-Bandbreiten je Element (optimistic/mostLikely/
  // pessimistic) — im UI heute HANDEINGABE. Der Lauf leitet sie aus den
  // Schätzkosten ab (±30 %): Die Maschine kann Vorschlagswerte liefern, der
  // Mensch übersteuert. Dass das heute niemand tut, ist Teil des Befunds.
  const basis = (kostenElemente || []).filter((e) => (e.estimatedCost ?? 0) > 0).slice(0, 10);
  const inputs = basis.map((e) => ({
    elementId: e.id || e.elementId || '', elementName: e.name || e.elementName || '',
    optimistic: Math.round(e.estimatedCost * 0.7),
    mostLikely: e.estimatedCost,
    pessimistic: Math.round(e.estimatedCost * 1.5),
  }));
  if (!inputs.length) {
    f.schritt('Monte-Carlo über die Kosten', ART.FOLGE, 'keine Kostenbasis aus Schritt 3');
    f.zaehle(before);
    return;
  }
  f.schritt('PERT-Bandbreiten je Element', ART.MASCHINE,
    `${inputs.length} Elemente, ±30 %/+50 % aus Schätzkosten abgeleitet — im UI heute Handeingabe je Element`);
  const sim = await call('POST', `/api/projects/${pid}/analytics/cost/probabilistic`, { elements: inputs, iterations: 5000 }, { budget: SLOW_BUDGET_MS });
  const sd = sim.data?.data ?? sim.data ?? {};
  const hv = sim.ok ? herkunftVon(sd, 'cost/probabilistic') : undefined;
  f.schritt('Monte-Carlo über die Kosten', sim.aborted ? ART.ZEIT : sim.ok ? ART.MASCHINE : ART.BRUCH,
    sim.aborted ? 'Zeitbudget erschöpft' : sim.ok ? `P50 ${sd.p50 ?? sd.percentiles?.p50 ?? '?'} · P90 ${sd.p90 ?? sd.percentiles?.p90 ?? '?'}` : `HTTP ${sim.status}`, hv);
  f.zaehle(before);
}

async function sKosten(pid) {
  const f = frage(4, 'Kosten — was und WOHER?');
  const before = log.length;
  const cost = await call('GET', `/api/projects/${pid}/analytics/cost`);
  const cd = cost.data?.data ?? cost.data ?? {};
  const total = cd.totalAnnualCost ?? cd.totalCost ?? cd.summary?.totalAnnualCost;
  const hv = cost.ok ? herkunftVon(cd, 'analytics/cost') : undefined;
  f.schritt('Gesamtkosten der Landschaft', cost.ok ? ART.MASCHINE : ART.BRUCH,
    cost.ok ? `Summe: ${total ?? '?'} — bei einem Projekt OHNE Kostenangaben` : `HTTP ${cost.status}`, hv);
  f.zaehle(before);
  return cd.elements ?? cd.rankings ?? [];
}

async function sReaktion(pid) {
  const f = frage(5, 'Reaktion — was sagen die Betroffenen? (MiroFish)');
  const before = log.length;
  const personas = await call('GET', `/api/projects/${pid}/simulations/personas`);
  f.schritt('Personas verfügbar', personas.ok ? ART.MASCHINE : ART.BRUCH,
    personas.ok ? `${(personas.data?.data ?? personas.data ?? []).length ?? '?'} Personas` : `HTTP ${personas.status}`);
  // CreateSimulationSchema verlangt scenarioType (Enum), Beschreibung ≥10
  // Zeichen UND eine vollständige agents[]-Konfiguration (Typ, Sichtbarkeit,
  // Prioritäten je Agent). Es gibt keinen Ein-Knopf-Start — die
  // Konfigurationslast liegt beim Menschen. Der Lauf füllt sie mit Defaults.
  f.schritt('Simulations-Konfiguration', ART.MASCHINE,
    'scenarioType + 2 Agenten mit Defaults gefüllt — im UI heute ein mehrteiliges Formular');
  const run = await call('POST', `/api/projects/${pid}/simulations`, {
    scenarioType: 'technology_refresh',
    scenarioDescription: 'CRM Classic wird stillgelegt, CRM Cloud übernimmt alle Funktionen inklusive Datenmigration.',
    maxRounds: 1,
    targetElementIds: ['b-crm-alt', 'b-crm-neu'],
    agents: [
      { id: 'a-cio', name: 'CIO', stakeholderType: 'c_level', visibleLayers: ['business', 'application', 'technology'], visibleDomains: [], maxGraphDepth: 5, expectedCapacity: 5, priorities: ['Stabilität', 'Kosten'] },
      { id: 'a-ops', name: 'IT-Betrieb', stakeholderType: 'it_ops', visibleLayers: ['application', 'technology'], visibleDomains: [], maxGraphDepth: 5, expectedCapacity: 5, priorities: ['Betriebssicherheit'] },
    ],
  }, { budget: SLOW_BUDGET_MS });
  f.schritt('Simulation anstoßen', run.aborted ? ART.ZEIT : run.ok ? ART.MASCHINE : ART.BRUCH,
    run.aborted ? 'Zeitbudget erschöpft' : run.ok ? `Lauf ${String((run.data?.data ?? run.data)?.runId || (run.data?.data ?? run.data)?._id || 'gestartet').slice(0, 12)}` : `HTTP ${run.status} — ${JSON.stringify(run.data).slice(0, 100)}`);
  f.schritt('Ergebnis deuten', ART.HAND, 'simulierte Stimmen sind Material, kein Urteil');
  f.zaehle(before);
}

async function sPlan(pid) {
  const f = frage(6, 'Plan — in welcher Reihenfolge?');
  const before = log.length;
  const rm = await call('POST', `/api/projects/${pid}/roadmaps`, { strategy: 'balanced', maxWaves: 4 }, { budget: SLOW_BUDGET_MS });
  const rd = rm.data?.data ?? rm.data ?? {};
  const waves = rd.waves?.length ?? rd.roadmap?.waves?.length;
  const hv = rm.ok ? herkunftVon(rd, 'roadmaps') : undefined;
  f.schritt('Roadmap erzeugen (balanced, 4 Wellen)', rm.aborted ? ART.ZEIT : rm.ok ? ART.MASCHINE : ART.BRUCH,
    rm.aborted ? 'Zeitbudget erschöpft' : rm.ok ? `${waves ?? '?'} Wellen` : `HTTP ${rm.status} — ${JSON.stringify(rm.data).slice(0, 100)}`, hv);
  f.schritt('Strategie wählen + Plan tragen', ART.HAND, 'conservative/balanced/aggressive ist eine Geschäftsentscheidung');
  f.zaehle(before);
}

// ─── Bericht ───────────────────────────────────────────────────────────────
function bericht() {
  const alle = fragen.flatMap((f) => f.schritte);
  const z = (a) => alle.filter((s) => s.art === a).length;
  const W = 78;
  console.log(`\n${'═'.repeat(W)}\n  BEWERTUNGS-DURCHSTICH: was kostet die Änderung — und wem gehören die Zahlen?\n${'═'.repeat(W)}`);
  for (const f of fragen) {
    console.log(`\n  ${f.nr} — ${f.titel}\n  ${'─'.repeat(W - 4)}`);
    for (const s of f.schritte) {
      const mark = s.art === ART.HAND ? '✋' : s.art === ART.MASCHINE ? '⚙️ ' : s.art === ART.FOLGE ? '↳ ' : s.art === ART.ZEIT ? '⏱ ' : '✗ ';
      console.log(`   ${mark} ${s.name}\n      ${s.detail}`);
      if (s.herkunft && s.herkunft.h) console.log(`      💶 ${s.herkunft.h === HERKUNFT.OHNE ? '✗ ' : ''}${s.herkunft.h}: ${s.herkunft.detail}`);
    }
    console.log(`      ${f.aufrufe} API-Aufrufe · ${f.ms} ms`);
  }
  const geld = alle.filter((s) => s.herkunft && s.herkunft.h);
  const ohne = geld.filter((s) => s.herkunft.h === HERKUNFT.OHNE);
  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  ✋ ${z(ART.HAND)} Entscheidungen   ⚙️  ${z(ART.MASCHINE)} Mechanik   ✗ ${z(ART.BRUCH)} Brüche   ⏱ ${z(ART.ZEIT)} Zeitbudget`);
  console.log(`  💶 ${geld.length} Antworten mit Geldzahlen — davon ${ohne.length} OHNE mitgelieferte Herkunft`);
  console.log(`${'═'.repeat(W)}`);
  if (ohne.length) {
    console.log(`\n  Zahlen ohne Herkunft — jede ist ein eigener Befund:`);
    for (const s of ohne) console.log(`   ✗ ${s.name}: ${s.herkunft.detail}`);
  }
  console.log(`\n  Lesart: Dieses Projekt trägt BEWUSST keine einzige Kostenangabe. Jede`);
  console.log(`  Geldsumme in den Antworten ist zwingend geschätzt — die Messfrage ist,`);
  console.log(`  ob die Antwort das SAGT (costConfidence/costSource) oder verschweigt.\n`);
}

(async () => {
  let pid = null;
  try {
    pid = await ruesten();
    const top = await sDiagnose(pid);
    await sTherapie(pid, top);
    const kosten = await sKosten(pid);
    await sValidierung(pid, kosten);
    await sReaktion(pid);
    await sPlan(pid);
    if (has('--json')) console.log(JSON.stringify({ fragen, aufrufe: log, projectId: pid }, null, 2));
    else { bericht(); console.log(`  Testprojekt: ${pid}${has('--keep') ? ' (behalten)' : ' (wird gelöscht)'}\n`); }
  } catch (err) {
    console.error(`\n  ABBRUCH: ${err.message}\n`);
    if (log.length) bericht();
    process.exitCode = 1;
  } finally {
    if (pid && !has('--keep')) await call('DELETE', `/api/projects/${pid}`, null, { quiet: true });
  }
})();
