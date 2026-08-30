#!/usr/bin/env node
/**
 * gesetz-durchstich.mjs — läuft die Kette „vom Gesetz zum Nachweis" rein über
 * die API und protokolliert je Frage, WIE VIELE HÄNDE der Weg braucht.
 *
 * Die Frage, die dieses Skript beantwortet, ist nicht „ist das Ergebnis
 * fachlich richtig?" — das ist eine andere Messung. Es beantwortet:
 *
 *     Läuft die Kette ohne Bedienung durch, und wo sitzt eine echte
 *     menschliche Entscheidung?
 *
 * Das ist die Entscheidungsgrundlage für „Der Lauf" (THE-639 / UC-FLOW-001):
 * Trägt die Vermutung, dass zwischen Startknopf und Bericht nur Mechanik
 * liegt — oder steckt dort eine Entscheidung, die wir übersehen haben?
 *
 *   node scripts/gesetz-durchstich.mjs                  gegen localhost:4000
 *   node scripts/gesetz-durchstich.mjs --api <url>      gegen eine andere Instanz
 *   node scripts/gesetz-durchstich.mjs --json           Protokoll als JSON
 *   node scripts/gesetz-durchstich.mjs --keep           Testprojekt nicht löschen
 *   node scripts/gesetz-durchstich.mjs --token <jwt>    mit bestehendem (verifiziertem) Konto
 *
 * VORBEDINGUNGEN werden vorab geprüft und, wenn sie fehlen, als solche gemeldet.
 * Ein Durchstich, der mangels Korpus „7 Brüche" meldet, misst seine eigene
 * Rüstung und nennt sie Befund — derselbe Fehler wie „looks clean" bei
 * 2 von 22 geprüften Elementen.
 *
 * Es wendet NICHTS an: keine Remediation, kein Auto-Apply. Was es schreibt
 * (Projekt, Elemente, Anforderungen, ein Nachweis), liegt in einem eigenen
 * Testprojekt und wird am Ende gelöscht.
 */
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const API = (val('--api', 'http://localhost:4000') || '').replace(/\/$/, '');
const LAW = val('--law', 'corpus:dsgvo');

/** Ein Schritt der Kette. `art` ist die Antwort, um die es geht. */
const ART = {
  HAND: 'HAND',        // trägt eine echte Entscheidung — bleibt beim Menschen
  MASCHINE: 'MASCHINE',// läuft ohne Zutun; als Bedienung wäre es Ballast
  BRUCH: 'BRUCH',      // geht heute nicht — ein Fund, kein Fehlschlag
  FOLGE: 'FOLGE',      // scheitert NUR, weil ein Schritt davor scheiterte.
                       // Getrennt gezählt: fünf Folgen eines Bruchs sind ein
                       // Problem, nicht fünf. Sonst zählt der Bericht Symptome
                       // und nennt sie Befunde.
};

const log = [];
let token = null;

async function call(method, path, body, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const ms = Date.now() - t0;
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  const rec = { method, path, status: res.status, ms };
  if (!opts.quiet) log.push(rec);
  return { ok: res.ok, status: res.status, data, ms };
}

const fragen = [];
function frage(nr, titel) {
  const f = { nr, titel, schritte: [], aufrufe: 0, ms: 0 };
  fragen.push(f);
  return {
    schritt(name, art, detail) {
      f.schritte.push({ name, art, detail });
      return f;
    },
    zaehle(before) {
      f.aufrufe = log.length - before;
      f.ms = log.slice(before).reduce((a, r) => a + r.ms, 0);
    },
  };
}

// ─── Vorbedingungen: was dieser Lauf braucht, um überhaupt etwas zu messen ──
async function vorbedingungen(pid) {
  const fehlt = [];

  const health = await call('GET', '/api/health', null, { quiet: true });
  if (!health.ok) fehlt.push({ was: 'Server erreichbar', hinweis: `${API} antwortet nicht` });

  // Verifiziertes Konto: die KI-Endpunkte (Frage 3) sind dahinter verriegelt.
  const probe = await call('POST', `/api/projects/${pid}/requirements/generate`,
    { source: 'probe', paragraphNumber: 'x', text: 'Probe', language: 'de' }, { quiet: true });
  if (probe.status === 403 && probe.data?.code === 'EMAIL_NOT_VERIFIED') {
    fehlt.push({
      was: 'Konto mit verifizierter E-Mail',
      hinweis: 'Frage 3 und 5 liegen hinter requireVerifiedEmail. Entweder --token eines verifizierten Kontos übergeben, oder das Testkonto in der Datenbank verifizieren.',
    });
  }

  // Korpus mit Volltext: ohne ihn haben die Fragen 2, 3 und 5 keinen Gegenstand.
  const norms = await call('GET', `/api/projects/${pid}/norms`, null, { quiet: true });
  const list = norms.data?.data ?? norms.data ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    fehlt.push({
      was: 'Gesetzes-Korpus mit Volltext',
      hinweis: 'Diese Instanz führt keine Korpus-Gesetze. Der Volltext-Korpus liegt auf Server B; lokal ist er leer. Frage 2, 3 und 5 sind ohne ihn nicht messbar.',
    });
  }

  return fehlt;
}

// ─── Rüstzeug: Konto + Projekt mit einem Modell ────────────────────────────
async function ruesten() {
  if (val('--token')) {
    token = val('--token');
    const p0 = await call('POST', '/api/projects', {
      name: `Durchstich ${new Date().toISOString().slice(0, 16)}`,
      description: 'Kette vom Gesetz zum Nachweis — automatisch angelegt, wird gelöscht',
    }, { quiet: true });
    const id0 = p0.data?._id || p0.data?.data?._id;
    if (!id0) throw new Error(`Projekt mit übergebenem Token nicht anlegbar (HTTP ${p0.status})`);
    await modellAnlegen(id0);
    return id0;
  }
  const email = `durchstich-${Date.now()}@example.com`;
  const password = 'Durchstich!2026#Kette';
  const reg = await call('POST', '/api/auth/register', { name: 'Durchstich', email, password }, { quiet: true });
  token = reg.data?.accessToken || reg.data?.token || reg.data?.data?.accessToken;
  if (!token) {
    const lg = await call('POST', '/api/auth/login', { email, password }, { quiet: true });
    token = lg.data?.accessToken || lg.data?.data?.accessToken;
  }
  if (!token) throw new Error(`Anmeldung fehlgeschlagen (${reg.status}) — läuft der Server auf ${API}?`);

  const p = await call('POST', '/api/projects', {
    name: `Durchstich ${new Date().toISOString().slice(0, 16)}`,
    description: 'Kette vom Gesetz zum Nachweis — automatisch angelegt, wird gelöscht',
  }, { quiet: true });
  const projectId = p.data?._id || p.data?.data?._id;
  if (!projectId) throw new Error('Projekt konnte nicht angelegt werden');

  await modellAnlegen(projectId);
  return projectId;
}

/** Ein Modell, das eine Anwendbarkeitsprüfung überhaupt beurteilen kann:
 *  personenbezogene Daten + ein kundenbezogener Prozess. */
async function modellAnlegen(projectId) {
  await call('POST', `/api/projects/${projectId}/import/csv`, {
    elements: [
      { id: 'd-crm', name: 'CRM System', type: 'application_component', layer: 'application', description: 'Verwaltet personenbezogene Kundendaten' },
      { id: 'd-kunde', name: 'Kundendaten', type: 'data_object', layer: 'application', description: 'Personenbezogene Daten von Privatkunden' },
      { id: 'd-proz', name: 'Kundenanlage', type: 'process', layer: 'business', description: 'Erfassung und Pflege von Kundenstammdaten' },
    ],
    connections: [
      { sourceId: 'd-crm', targetId: 'd-kunde', type: 'access', label: 'liest/schreibt' },
      { sourceId: 'd-crm', targetId: 'd-proz', type: 'serving', label: 'bedient' },
    ],
  }, { quiet: true });
}

// ─── Die fünf Fragen ───────────────────────────────────────────────────────
async function frage1(pid) {
  const f = frage(1, 'Welche Gesetze gelten?');
  const before = log.length;

  const rule = await call('GET', `/api/projects/${pid}/norms/applicability`);
  f.schritt('Regelwerk auswerten (12 Signale, 7 Regeln)',
    rule.ok ? ART.MASCHINE : ART.BRUCH,
    rule.ok ? `${(rule.data?.data?.length ?? rule.data?.length ?? 0)} Urteile` : `HTTP ${rule.status}`);

  const legal = await call('GET', `/api/projects/${pid}/norms/legal-applicability`);
  const rows = legal.data?.data ?? legal.data ?? [];
  const states = Array.isArray(rows)
    ? rows.reduce((a, r) => ((a[r.state] = (a[r.state] || 0) + 1), a), {})
    : {};
  f.schritt('Bindung je Gesetz (vier Zustände)',
    legal.ok ? ART.MASCHINE : ART.BRUCH,
    legal.ok ? Object.entries(states).map(([k, v]) => `${k}:${v}`).join(' · ') || 'keine Zeilen' : `HTTP ${legal.status}`);

  f.schritt('Rechtsprofil setzen (Rollen, Sektor, Jurisdiktion)', ART.HAND,
    'nur der Mensch weiß, wer das Unternehmen ist — einmalig, nicht je Gesetz');

  f.zaehle(before);
  return rows;
}

async function frage2(pid) {
  const f = frage(2, 'Was steht drin?');
  const before = log.length;

  const norms = await call('GET', `/api/projects/${pid}/norms`);
  const list = norms.data?.data ?? norms.data ?? [];
  f.schritt('Korpus-Gesetze auflisten', norms.ok ? ART.MASCHINE : ART.BRUCH,
    norms.ok ? `${Array.isArray(list) ? list.length : '?'} Gesetze verfügbar` : `HTTP ${norms.status}`);

  f.schritt('Gesetz wählen', ART.HAND, `hier gesetzt: ${LAW}`);

  const sec = await call('GET', `/api/projects/${pid}/norms/${encodeURIComponent(LAW)}/sections/${encodeURIComponent('dsgvo:Art. 32')}`);
  f.schritt('Artikel-Volltext holen', sec.ok ? ART.MASCHINE : ART.BRUCH,
    sec.ok ? `${(sec.data?.data?.text || '').length} Zeichen` : `HTTP ${sec.status}`);

  f.zaehle(before);
  return sec.data?.data;
}

async function frage3(pid, section) {
  const f = frage(3, 'Was verlangt es von mir?');
  const before = log.length;

  f.schritt('Artikel wählen', ART.HAND, 'welcher Artikel gilt uns — Art. 1 wäre Gegenstand und Ziele');

  const gen = await call('POST', `/api/projects/${pid}/requirements/generate`, {
    source: LAW.replace('corpus:', ''),
    paragraphNumber: section?.number || 'Art. 32',
    text: section?.text || '',
    language: 'de',
  });
  const preview = gen.data?.data ?? gen.data ?? [];
  const n = Array.isArray(preview) ? preview.length : (preview?.requirements?.length ?? 0);
  f.schritt('Anforderungen erzeugen (Vorschau, kein Schreiben)',
    gen.ok ? ART.MASCHINE : ART.BRUCH,
    gen.ok ? `${n} Vorschläge` : `HTTP ${gen.status} — ${JSON.stringify(gen.data).slice(0, 120)}`);

  f.schritt('Vorschläge prüfen und übernehmen', ART.HAND,
    'Asilomar #16: die Maschine schlägt vor, der Mensch entscheidet');

  const items = (Array.isArray(preview) ? preview : preview?.requirements ?? []).slice(0, 3);
  let saved = [];
  if (!gen.ok) {
    f.schritt('Übernommene Anforderungen schreiben', ART.FOLGE, 'Erzeugen hat nichts geliefert');
  } else if (items.length) {
    const conf = await call('POST', `/api/projects/${pid}/requirements`, {
      source: LAW.replace('corpus:', ''),
      paragraphNumber: section?.number || 'Art. 32',
      requirements: items.map((r) => ({ ...r })),
    });
    saved = conf.data?.data ?? [];
    f.schritt('Übernommene Anforderungen schreiben',
      conf.ok ? ART.MASCHINE : ART.BRUCH,
      conf.ok ? `${saved.length} gespeichert` : `HTTP ${conf.status} — ${JSON.stringify(conf.data).slice(0, 120)}`);
  } else {
    f.schritt('Übernommene Anforderungen schreiben', ART.BRUCH, 'Erzeugen lief, lieferte aber keinen Vorschlag');
  }

  f.zaehle(before);
  return saved;
}

async function frage4(pid) {
  const f = frage(4, 'Erfülle ich es?');
  const before = log.length;

  const gaps = await call('GET', `/api/projects/${pid}/compliance/gaps`);
  const g = gaps.data?.data ?? gaps.data ?? {};
  f.schritt('Lücken berechnen', gaps.ok ? ART.MASCHINE : ART.BRUCH,
    gaps.ok ? `${g.totalOpen ?? g.open ?? (Array.isArray(g) ? g.length : '?')} offen` : `HTTP ${gaps.status}`);

  const scope = await call('GET', `/api/projects/${pid}/norms/${encodeURIComponent(LAW)}/remediation-scope`);
  const s = scope.data?.data ?? scope.data ?? {};
  f.schritt('Deckung je Norm (eine Zählweise, THE-638)',
    scope.ok ? ART.MASCHINE : ART.BRUCH,
    scope.ok ? `total ${s.total} · unmapped ${s.unmapped} · offen ${(s.openSectionIds || []).length}` : `HTTP ${scope.status}`);

  f.zaehle(before);
}

async function frage5(pid, saved) {
  const f = frage(5, 'Kann ich es beweisen?');
  const before = log.length;

  const reqId = saved?.[0]?._id;
  if (!reqId) {
    f.schritt('Nachweis anhängen', ART.FOLGE, 'keine gespeicherte Anforderung aus Frage 3');
    f.schritt('Tor setzen (Attest)', ART.FOLGE, 'dito');
  } else {
    const ev = await call('POST', `/api/projects/${pid}/requirements/${reqId}/evidence`, {
      kind: 'document', label: 'Durchstich-Nachweis',
      sha256: 'a'.repeat(64), note: 'Nur Fingerabdruck — die Datei bleibt beim Kunden',
    });
    f.schritt('Nachweis anhängen (nur Hash)', ev.ok ? ART.MASCHINE : ART.BRUCH,
      ev.ok ? 'angehängt' : `HTTP ${ev.status} — ${JSON.stringify(ev.data).slice(0, 120)}`);

    const gate = await call('POST', `/api/projects/${pid}/requirements/${reqId}/gates`, {
      gate: 'attested', value: true, rationale: 'Durchstich — nicht fachlich geprüft',
    });
    f.schritt('Tor setzen (Attest)', ART.HAND,
      gate.ok ? 'gesetzt — und das MUSS ein Mensch tun' : `HTTP ${gate.status}`);
  }

  const bundle = await call('GET', `/api/projects/${pid}/requirements/audit-bundle?format=json`);
  const b = bundle.data?.data ?? {};
  f.schritt('Prüfer-Bündel erzeugen', bundle.ok ? ART.MASCHINE : ART.BRUCH,
    bundle.ok ? `${(b.norms || []).length} Normen im Bündel` : `HTTP ${bundle.status}`);

  f.zaehle(before);
}

// ─── Bericht ───────────────────────────────────────────────────────────────
function bericht() {
  const alle = fragen.flatMap((f) => f.schritte);
  const z = (a) => alle.filter((s) => s.art === a).length;
  const W = 78;
  console.log(`\n${'═'.repeat(W)}`);
  console.log('  DURCHSTICH: vom Gesetz zum Nachweis — wie viele Hände braucht der Weg?');
  console.log(`${'═'.repeat(W)}`);

  for (const f of fragen) {
    console.log(`\n  FRAGE ${f.nr} — ${f.titel}`);
    console.log(`  ${'─'.repeat(W - 4)}`);
    for (const s of f.schritte) {
      const mark = s.art === ART.HAND ? '✋' : s.art === ART.MASCHINE ? '⚙️ ' : s.art === ART.FOLGE ? '↳ ' : '✗ ';
      console.log(`   ${mark} ${s.name}`);
      console.log(`      ${s.detail}`);
    }
    console.log(`      ${f.aufrufe} API-Aufrufe · ${f.ms} ms`);
  }

  console.log(`\n${'═'.repeat(W)}`);
  console.log(`  ✋ ${z(ART.HAND)} Entscheidungen   ⚙️  ${z(ART.MASCHINE)} Mechanik   ✗ ${z(ART.BRUCH)} Brüche   ↳ ${z(ART.FOLGE)} Folgen davon`);
  console.log(`  ${log.length} API-Aufrufe · ${log.reduce((a, r) => a + r.ms, 0)} ms gesamt`);
  console.log(`${'═'.repeat(W)}`);

  const brueche = alle.filter((s) => s.art === ART.BRUCH);
  const folgen = alle.filter((s) => s.art === ART.FOLGE);
  if (brueche.length) {
    console.log(`\n  Brüche — jeder ist ein eigener Fund:`);
    for (const b of brueche) console.log(`   ✗ ${b.name}: ${b.detail}`);
  }
  if (folgen.length) {
    console.log(`\n  ${folgen.length} weitere Schritte scheiterten NUR als Folge davon — sie sind`);
    console.log(`  keine eigenen Befunde und dürfen nicht als solche gezählt werden.`);
  }

  console.log(`\n  Lesart: Die ✋-Schritte sind der Weg, den ein Mensch gehen muss.`);
  console.log(`  Alles mit ⚙️  ist Mechanik — als Bedienung wäre es Ballast.`);
  console.log(`  Frage 6 („Was ändert sich?") fehlt hier bewusst: sie ist nicht gebaut`);
  console.log(`  (braucht stabile Ids) und kann deshalb nicht durchlaufen werden.\n`);
}

// ─── Lauf ──────────────────────────────────────────────────────────────────
(async () => {
  let pid = null;
  try {
    pid = await ruesten();

    const fehlt = await vorbedingungen(pid);
    if (fehlt.length) {
      console.log(`\n  NICHT PRÜFBAR — ${fehlt.length} Vorbedingung(en) fehlen:\n`);
      for (const f of fehlt) console.log(`   ✗ ${f.was}\n     ${f.hinweis}\n`);
      console.log('  Das ist KEIN Befund über die Kette, sondern über diese Umgebung.');
      console.log('  Ein Lauf, der jetzt Brüche meldete, würde seine eigene Rüstung messen.\n');
      if (!has('--trotzdem')) {
        console.log('  Mit --trotzdem läuft er dennoch — dann sind die Brüche entsprechend zu lesen.\n');
        process.exitCode = 2;
        return;
      }
      console.log('  --trotzdem gesetzt: der Lauf geht weiter.\n');
    }

    const applicable = await frage1(pid);
    const section = await frage2(pid);
    const saved = await frage3(pid, section);
    await frage4(pid);
    await frage5(pid, saved);

    if (has('--json')) {
      console.log(JSON.stringify({ fragen, aufrufe: log, projectId: pid }, null, 2));
    } else {
      bericht();
      console.log(`  Testprojekt: ${pid}${has('--keep') ? ' (behalten)' : ' (wird gelöscht)'}\n`);
    }
    void applicable;
  } catch (err) {
    console.error(`\n  ABBRUCH: ${err.message}`);
    console.error(`  Bis hierhin protokolliert: ${log.length} Aufrufe.\n`);
    if (log.length) bericht();
    process.exitCode = 1;
  } finally {
    if (pid && !has('--keep')) await call('DELETE', `/api/projects/${pid}`, null, { quiet: true });
  }
})();
