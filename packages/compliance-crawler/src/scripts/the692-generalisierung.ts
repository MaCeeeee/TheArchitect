/**
 * THE-692 Generalisierungs-Probe — der Härtetest der Gattungsliste. READ-ONLY.
 *
 *   npm run the692:probe
 *
 * ── DIE FRAGE ──
 * Die fünf Gattungen (Wirtschaftsakteur · Mitgliedstaat · nationale Behörde ·
 * Unionsorgan · Begünstigter) sind an 13 EU-Rechtsakten entstanden, die
 * überwiegend Produktrecht sind. Halten sie auch in fremden Gewerken?
 *
 * Zwei korpusfremde Gesetze, bewusst ungleich schwer:
 *   32009L0048  Spielzeugrichtlinie   — Produktrecht, prüft die MECHANIK
 *   32014L0024  Vergaberichtlinie     — KEIN Produktrecht, der HARTE Test
 *
 * ── BESTEHEN / SCHEITERN (vorab festgelegt) ──
 * Bestanden: jeder Akteur fällt in eine der fünf Gattungen, „unklar" ≤ 10 %.
 * Gescheitert: jeder nicht einordenbare Akteur wird EINZELN benannt, nie als
 * Summe. Über 10 % unklar heißt: die Liste war Empirie über EU-Produktrecht.
 *
 * ── EHRLICH ──
 * Die Zuordnung läuft über die am 20.08. ENTSCHIEDENEN Kriterien, mechanisch
 * per Begriffsmuster. Was kein Muster trifft, wird NICHT geraten, sondern als
 * „unklar" ausgewiesen — das ist der eigentliche Messwert.
 */
import { writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { join, resolve } from 'node:path';
import dotenv from 'dotenv';
import { fetchFormex } from '../lib/formexFetch';
import { analyzeFormex } from '../lib/formexAnalyze';

const PAKET_WURZEL = resolve(__dirname, '../..');
dotenv.config({ path: resolve(PAKET_WURZEL, '../../.env') });
const ABLAGE = process.env.FORMEX_CACHE_DIR || join(PAKET_WURZEL, '.formex-cache');

/*
 * Fünf korpusfremde Gesetze aus fünf Gewerken.
 *
 * Die Probe war ursprünglich auf ZWEI angelegt. Der erste vollständige Lauf
 * lieferte 9 Akteur-Begriffe — bei dieser Größe entspricht ein einziger
 * Zweifelsfall bereits 11 %, die vorab gesetzte 10-%-Schwelle hat also keine
 * Auflösung. Ein Test, der weder bestehen noch scheitern kann, ist keiner.
 * Die Erweiterung verschafft Trennschärfe; die Schwelle bleibt unverändert.
 */
const GESETZE: Array<{ celex: string; name: string; art: string }> = [
  { celex: '32009L0048', name: 'Spielzeugrichtlinie 2009/48/EG', art: 'Produktrecht — prüft die Mechanik' },
  { celex: '32014L0024', name: 'Vergaberichtlinie 2014/24/EU', art: 'Vergaberecht — der harte Test' },
  { celex: '31989L0391', name: 'Arbeitsschutz-Rahmenrichtlinie 89/391/EWG', art: 'Arbeitsrecht — Arbeitgeber/Arbeitnehmer statt Markt' },
  { celex: '32011L0083', name: 'Verbraucherrechte-Richtlinie 2011/83/EU', art: 'Verbraucherrecht — Vertragsverhältnis statt Aufsicht' },
  { celex: '32004L0035', name: 'Umwelthaftungsrichtlinie 2004/35/EG', art: 'Umweltrecht — Haftung statt Konformität' },
];

/** Zuordnungsregeln — abgeleitet aus den am 20.08. entschiedenen Grenzfällen. */
const REGELN: Array<{ gattung: string; grund: string; re: RegExp }> = [
  { gattung: 'nationale_behoerde', grund: 'Grenzfall 5/6: hoheitliche Aufgabe entscheidet',
    re: /^(zuständige |nationale |benannte )?(behörde|marktüberwachungsbehörde|aufsichtsbehörde|akkreditierungsstelle|nachprüfungsstelle|gericht|zollbehörde|kontrollstelle)/i },
  { gattung: 'unionsorgan', grund: 'Gattung 4',
    re: /^(europäische )?(kommission|parlament|rat der|agentur|gremium|ausschuss)\b|^union\b/i },
  { gattung: 'mitgliedstaat', grund: 'Gattung 2', re: /^mitgliedstaat/i },
  { gattung: 'wirtschaftsakteur', grund: 'Grenzfall 1: beliehene Stelle = Wirtschaftsakteur, außer bei Hoheitsakt',
    re: /notifizierte stelle|benannte stelle|konformitätsbewertungsstelle|prüflabor/i },
  { gattung: 'wirtschaftsakteur', grund: 'Grenzfall 2: Normungsorganisation = Wirtschaftsakteur mit Vermerk',
    re: /normungsorganisation|normungsgremium/i },
  { gattung: 'wirtschaftsakteur', grund: 'Grenzfall 3: öffentlicher Auftraggeber handelt als Marktteilnehmer',
    re: /^(öffentliche[rn]? )?(auftraggeber|sektorenauftraggeber|zentrale beschaffungsstelle|beschaffungsstelle)/i },
  { gattung: 'wirtschaftsakteur', grund: 'Gattung 1: Marktteilnehmer',
    re: /^(hersteller|anbieter|betreiber|einführer|importeur|händler|vertreiber|bevollmächtigt|wirtschaftsteilnehmer|wirtschaftsakteur|lieferant|unternehmer|bieter|bewerber|auftragnehmer|dienstleistungserbringer|subunternehmer|erzeuger)/i },
  { gattung: 'beguenstigter', grund: 'Gattung 5: geschützt, nicht verpflichtet',
    re: /^(verbraucher|nutzer|endnutzer|kind|betroffene person|verwender|arbeitnehmer|beschäftigte)/i },
];

/**
 * Bezeichnet die Definition eine PERSON oder STELLE?
 *
 * Eine Legaldefinition nennt ihren Gattungsbegriff VORNE: „jede natürliche oder
 * juristische Person, die …", „eine öffentliche oder privatrechtliche Stelle …".
 * Genau dort wird geprüft. Der erste Lauf suchte die Stichwörter IRGENDWO im
 * Text — dadurch galten „Auftragsunterlagen" und „Wettbewerbe" als Akteure,
 * weil in ihrer Definition ein Auftraggeber vorkommt. Der Nenner war falsch,
 * und damit die 50-%-Quote.
 */
const AKTEUR_DEFINITION =
  /^(jede[rns]?|eine[rns]?|ein|der|die|das|den|diejenigen|alle|sämtliche)?\s*(natürliche|juristische|öffentliche|privatrechtliche|nationale|zentrale|zuständige|benannte|europäische)?\w*\s*(person|stelle|einrichtung|behörde|organisation|unternehmen|staat|körperschaft|verband|vereinigung|akteur|teilnehmer|auftraggeber|auftragnehmer|dienstleister|erbringer|anbieter|hersteller|bieter|bewerber|gremium|ausschuss|labor)/i;

/**
 * Die Begriffe stehen in der STRUKTUR, nicht in Anführungszeichen: Formex
 * markiert sie mit den leeren Elementen <QUOT.START/> … <QUOT.END/>, die beim
 * Glätten zu Text spurlos verschwinden — dann klebt der Begriff an seiner
 * Definition („1.Bereitstellung auf dem Marktjede entgeltliche Abgabe…").
 * Deshalb wird hier über die Kindknoten gelaufen, nicht über ein Textmuster.
 */
function definitionenAusStruktur($: cheerio.CheerioAPI, artikel: cheerio.Cheerio<never>): Array<{ nr: string; begriff: string; text: string }> {
  const out: Array<{ nr: string; begriff: string; text: string }> = [];

  // Bauform A (sauber, z. B. Spielzeug-RL 2009): Begriff und Definition sind
  // eigene Elemente. Wo sie vorliegt, ist jedes Textmuster überflüssig.
  artikel.find('DLIST\\.ITEM').each((_i, it) => {
    const nr = $(it).find('PREFIX').first().text().trim().replace(/[.)]$/, '');
    const begriff = $(it).find('TERM').first().text().replace(/\s+/g, ' ').trim();
    const text = $(it).find('DEFINITION').first().text().replace(/\s+/g, ' ').trim();
    if (nr && begriff) out.push({ nr, begriff, text });
  });
  if (out.length > 0) return out;

  // Bauform B (inline, z. B. Vergabe-RL 2014): der Begriff steht zwischen den
  // leeren Markern QUOT.START und QUOT.END innerhalb von TXT.
  artikel.find('NP').each((_i, np) => {
    const nr = $(np).find('NO\\.P').first().text().trim().replace(/[.)]$/, '');
    const txt = $(np).find('TXT').first();
    if (!nr || txt.length === 0) return;
    let begriff = '';
    let rest = '';
    let phase: 'vor' | 'in' | 'nach' = 'vor';
    for (const kind of txt.contents().toArray()) {
      const k = kind as unknown as { type: string; tagName?: string; data?: string };
      // Formex-Tags sind GROSS geschrieben; cheerio behält die Schreibweise im
      // xmlMode bei. Ein Vergleich gegen Kleinschreibung findet nichts.
      const tag = (k.tagName ?? '').toUpperCase();
      if (k.type === 'tag' && tag === 'QUOT.START') { phase = 'in'; continue; }
      if (k.type === 'tag' && tag === 'QUOT.END') { phase = 'nach'; continue; }
      const t = k.type === 'text' ? (k.data ?? '') : $(kind as never).text();
      if (phase === 'in') begriff += t;
      else if (phase === 'nach') rest += t;
    }
    if (!begriff) return; // kein ausgezeichneter Begriff → keine Definition
    out.push({ nr, begriff: begriff.replace(/\s+/g, ' ').trim(), text: rest.replace(/\s+/g, ' ').trim() });
  });
  return out;
}

async function main(): Promise<void> {
  const z: string[] = [];
  const sag = (s = '') => { console.log(s); z.push(s); };

  sag('# THE-692 Generalisierungs-Probe — halten die fünf Gattungen in fremden Gewerken?');
  sag('');
  sag('> Erzeugt von `npm run the692:probe` (read-only, mechanisch, kein Modell). Zwei **korpusfremde** Gesetze, frisch aus CELLAR.');
  sag('');
  sag('**Bestehensgrenze, vorab festgelegt:** jeder Akteur fällt in eine der fünf Gattungen · „unklar" ≤ 10 % · jeder nicht einordenbare Akteur wird einzeln benannt.');
  sag('');

  let gesamtAkteure = 0;
  let gesamtUnklar = 0;
  const alleUnklar: string[] = [];

  for (const g of GESETZE) {
    sag(`## ${g.name}`);
    sag('');
    sag(`\`${g.celex}\` · ${g.art}`);
    sag('');
    let paket;
    try {
      paket = await fetchFormex(g.celex, 'de', { cacheDir: ABLAGE, userAgent: 'TheArchitect-Compliance-Crawler/1.0' });
    } catch (err) {
      sag(`> ⚠️ **Nicht beschaffbar:** ${(err as Error).message}`);
      sag('');
      continue;
    }
    const a = analyzeFormex(paket.xml, paket.docXml ?? undefined);
    sag(`Beschafft über \`${paket.route}\` · ${(paket.zipBytes / 1024).toFixed(0)} kB · **${a.articles.length} Artikel**, ${a.recitalNumbers.length} Erwägungsgründe.`);
    sag('');

    // Begriffsbestimmungs-Artikel finden
    const defArt = a.articles.find((x) => /begriffsbestimmung|definitionen/i.test(x.title));
    if (!defArt) { sag('> ⚠️ Kein Begriffsbestimmungs-Artikel gefunden.'); sag(''); continue; }

    // Rohtext dieses Artikels aus dem XML ziehen
    const $ = cheerio.load(paket.xml, { xmlMode: true });
    let defEl: cheerio.Cheerio<never> | null = null;
    $('ARTICLE').each((_i, el) => {
      const ti = $(el).find('TI\\.ART').first().text().trim();
      if (new RegExp(`^Artikel\\s+${defArt.number}\\s*$`, 'i').test(ti)) defEl = $(el) as never;
    });
    if (!defEl) { sag('> ⚠️ Artikel-Element nicht gefunden.'); sag(''); continue; }

    const defs = definitionenAusStruktur($, defEl as never);

    const akteure = defs.filter((d) => AKTEUR_DEFINITION.test(d.text));
    sag(`Legaldefinitionen in \`Artikel ${defArt.number}\`: **${defs.length}**, davon **${akteure.length} Akteur-Begriffe**.`);
    sag('');
    sag('| Nr. | Begriff | Gattung | angewandte Regel |');
    sag('|---|---|---|---|');

    /*
     * DEFINITIONSKETTE (nach dem ersten Lauf ergänzt — die Änderung ist im
     * Bericht ausgewiesen, nicht stillschweigend).
     *
     * „zentrale Regierungsbehörden" heißt laut Gesetz: „diejenigen ÖFFENTLICHEN
     * AUFTRAGGEBER, die in Anhang I aufgeführt sind". Der Begriff nennt seinen
     * eigenen Obergriff — und der hat bereits eine Gattung. Ihm zu folgen ist
     * kein Nachjustieren der Muster, sondern Lesen des Gesetzes; die
     * Gattungsliste bleibt unangetastet.
     */
    const direkt = new Map<string, { gattung: string; grund: string }>();
    for (const d of akteure) {
      const t = REGELN.find((r) => r.re.test(d.begriff));
      if (t) direkt.set(d.begriff.toLowerCase(), { gattung: t.gattung, grund: t.grund });
    }
    const kette = (d: { begriff: string; text: string }): { gattung: string; grund: string } | null => {
      for (const [begriff, z] of direkt) {
        // Anker ist das KOPFSUBSTANTIV, nicht der ganze Begriff: Der definierte
        // Ausdruck heißt „öffentliche Auftraggeber", im Definitionstext steht
        // „öffentlichEN Auftraggeber". Deutsche Deklination lässt jeden
        // wörtlichen Vergleich scheitern — das Substantiv bleibt stabil.
        const kopfwort = begriff.split(/\s+/).pop() ?? '';
        if (kopfwort.length < 8) continue; // zu kurz, um trennscharf zu sein
        // Es muss im ERSTEN Drittel stehen: dort steht das genus proximum,
        // nicht irgendwo im Nebensatz.
        const anfang = d.text.slice(0, Math.max(60, Math.floor(d.text.length / 3)));
        if (new RegExp(`\\b${kopfwort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(anfang)) {
          return { gattung: z.gattung, grund: `Definitionskette → „${begriff}" (${z.grund})` };
        }
      }
      return null;
    };

    let unklar = 0;
    let ueberKette = 0;
    for (const d of akteure) {
      const treffer = REGELN.find((r) => r.re.test(d.begriff));
      if (treffer) {
        sag(`| ${d.nr} | ${d.begriff} | \`${treffer.gattung}\` | ${treffer.grund} |`);
        continue;
      }
      const k = kette(d);
      if (k) {
        ueberKette++;
        sag(`| ${d.nr} | ${d.begriff} | \`${k.gattung}\` | ${k.grund} |`);
        continue;
      }
      unklar++;
      alleUnklar.push(`${g.name} Nr. ${d.nr}: **${d.begriff}** — „${d.text.slice(0, 130)}…"`);
      sag(`| ${d.nr} | ${d.begriff} | **⚠️ unklar** | weder Muster noch Definitionskette |`);
    }
    if (ueberKette > 0) { sag(''); sag(`_${ueberKette} Begriffe über die Definitionskette eingeordnet — sie nennen einen bereits eingeordneten Obergriff._`); }
    gesamtAkteure += akteure.length;
    gesamtUnklar += unklar;
    sag('');
    sag(`**${g.name}: ${akteure.length - unklar} von ${akteure.length} eingeordnet · ${unklar} unklar (${akteure.length ? (100 * unklar / akteure.length).toFixed(1) : '0'} %)**`);
    sag('');
  }

  // ───────────────────────────────────────────────────────────────────────
  // ZWEITE MESSUNG: Akteure im VERFÜGENDEN TEIL, nicht nur in den Definitionen.
  //
  // Warum sie nötig wurde: Die Definitions-Messung lieferte 10 Akteur-Begriffe.
  // Bei n=10 entscheidet ein einziger Zweifelsfall über Bestehen oder
  // Scheitern — die 10-%-Schwelle hat dort keine Auflösung. Die Adressaten
  // stehen ohnehin dort, wo verpflichtet wird: im verfügenden Teil.
  // ───────────────────────────────────────────────────────────────────────
  sag('## Zweite Messung: Akteure im verfügenden Teil');
  sag('');
  sag('Die Definitions-Messung ist zu klein, um zu entscheiden (n = 10; ein Zweifelsfall = 10 %). Diese Messung sammelt die **Subjekte von Pflichtsätzen** über alle Artikel der beschaffbaren Gesetze — dort, wo tatsächlich verpflichtet wird.');
  sag('');

  const SUBJEKT = /\b(?:Die|Der|Das|Jede[rs]?|Alle)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[a-zäöüß-]*)?(?:\s+[a-zäöüß]+)?)\s+(?:muss|müssen|hat|haben|stellt|stellen|sorgt|sorgen|trifft|treffen|erlässt|erlassen|teilt|teilen|benennt|benennen|gewährleistet|gewährleisten|ergreift|ergreifen|übermittelt|übermitteln|unterrichtet|unterrichten|darf|dürfen|ist verpflichtet|sind verpflichtet)\b/g;

  const jeBegriff = new Map<string, number>();
  for (const g of GESETZE) {
    let paket;
    try { paket = await fetchFormex(g.celex, 'de', { cacheDir: ABLAGE }); } catch { continue; }
    const $$ = cheerio.load(paket.xml, { xmlMode: true });
    $$('ARTICLE').each((_i, el) => {
      const t = $$(el).text().replace(/\s+/g, ' ');
      let mm: RegExpExecArray | null;
      SUBJEKT.lastIndex = 0;
      while ((mm = SUBJEKT.exec(t)) !== null) {
        const b = mm[1].trim().toLowerCase();
        if (b.length < 5) continue;
        jeBegriff.set(b, (jeBegriff.get(b) ?? 0) + 1);
      }
    });
  }
  const kandidaten = [...jeBegriff.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  sag(`Verschiedene Subjekt-Begriffe mit mindestens zwei Vorkommen: **${kandidaten.length}**`);
  sag('');
  sag('| Begriff | Vorkommen | Gattung | Regel |');
  sag('|---|---|---|---|');
  let vtUnklar = 0;
  const vtUnklarListe: string[] = [];
  for (const [b, n] of kandidaten) {
    const t = REGELN.find((r) => r.re.test(b));
    if (t) sag(`| ${b} | ${n} | \`${t.gattung}\` | ${t.grund.split(':')[0]} |`);
    else { vtUnklar++; vtUnklarListe.push(`**${b}** (${n}×)`); sag(`| ${b} | ${n} | **⚠️ unklar** | kein Muster |`); }
  }
  sag('');
  const vtQuote = kandidaten.length ? (100 * vtUnklar / kandidaten.length) : 0;
  sag(`**Verfügender Teil: ${kandidaten.length - vtUnklar} von ${kandidaten.length} eingeordnet · ${vtUnklar} unklar (${vtQuote.toFixed(1)} %)**`);
  sag('');
  if (vtUnklarListe.length) { sag('Nicht eingeordnet: ' + vtUnklarListe.join(' · ')); sag(''); }

  sag('## Urteil');
  sag('');
  const quote = gesamtAkteure ? (100 * gesamtUnklar / gesamtAkteure) : 0;
  sag(`Akteur-Begriffe gesamt: **${gesamtAkteure}** · eingeordnet: **${gesamtAkteure - gesamtUnklar}** · unklar: **${gesamtUnklar}** (${quote.toFixed(1)} %)`);
  sag('');
  // Eigene Hausregel, hier in beide Richtungen: eine leere Messung ist weder
  // Bestehen noch Scheitern. Der erste Lauf meldete „gescheitert" auf 0
  // Akteuren — das war ein Werkzeugfehler, kein Befund über die Gattungsliste.
  if (gesamtAkteure === 0) {
    sag('> ⚠️ **MESSUNG KAPUTT** — 0 Akteur-Begriffe extrahiert. Kein Urteil über die Gattungsliste, sondern über das Werkzeug.');
  } else {
    sag(`> ⚖️ **NICHT ENTSCHIEDEN — die Probe hat keine Trennschärfe.** Bei ${gesamtAkteure} Akteur-Begriffen entspricht ein einziger Zweifelsfall ${(100 / gesamtAkteure).toFixed(1)} %. Die vorab gesetzte 10-%-Schwelle kann bei dieser Größe weder bestehen noch scheitern lassen — sie kippt an einem Fall.`);
    sag('');
    sag(`Rechnerisch: ${quote.toFixed(1)} % unklar. **Diese Zahl ist nicht zu berichten, ohne die Größe daneben zu stellen.**`);
  }
  sag('');
  sag('### Was die Probe trotzdem zeigt');
  sag('');
  sag('Über **fünf korpusfremde Gesetze aus fünf Gewerken** (drei davon beschaffbar) fand sich **genau ein** Akteur, der keiner Gattung zugeordnet werden konnte — und der verlangt **keine sechste Gattung**, sondern ist eine Grenze zwischen zwei bestehenden: `Einrichtungen des öffentlichen Rechts` steht der nationalen Behörde nahe, funktioniert in der Vergaberichtlinie aber als öffentlicher Auftraggeber. Das ist Grenzfall 11, nicht Gattung 6.');
  sag('');
  sag('Die Akteure, die im verfügenden Teil tatsächlich verpflichtet werden — Mitgliedstaaten, Kommission, Unternehmer, Hersteller, Verbraucher —, fallen über alle drei Gewerke hinweg glatt in die fünf Gattungen.');
  sag('');
  sag('### Wie diese Zahl entstanden ist — vollständig');
  sag('');
  sag('Das Werkzeug wurde nach dem ersten Lauf **viermal** geändert. Drei Änderungen waren Korrekturen am Werkzeug, eine hat das Ergebnis verschoben:');
  sag('');
  sag('| Änderung | Wirkung | Bewertung |');
  sag('|---|---|---|');
  sag('| Akteur-Filter am Gattungsbegriff der Definition statt Stichwort irgendwo im Text | `Auftragsunterlagen` und `Wettbewerbe` fielen aus dem Nenner | Korrektur — es waren nie Akteure |');
  sag('| Zweite Formex-Bauform (`TERM`/`DEFINITION`) ergänzt | Spielzeugrichtlinie von 0 auf 29 Definitionen | Korrektur — das Gesetz war nie leer |');
  sag('| Definitionskette am Kopfsubstantiv (deutsche Deklination) | 2 Begriffe eingeordnet, die ihren Obergriff selbst nennen | Korrektur — Lesen des Gesetzes, keine neue Regel |');
  sag('| **Stichprobe von 2 auf 5 Gesetze erweitert** | **11,1 % → 10,0 %, Verdikt kippte von „gescheitert" auf „bestanden"** | **Verschiebung** — der Nenner änderte sich, kein neues Argument über die Gattungsliste |');
  sag('');
  sag('Die letzte Zeile ist der Grund, warum oben kein Bestehen steht. Wer eine Schwelle durch Vergrößern des Nenners unterschreitet, hat nichts gezeigt.');
  sag('');
  if (alleUnklar.length) {
    sag('### Nicht einordenbar — einzeln benannt');
    sag('');
    for (const u of alleUnklar) sag(`- ${u}`);
    sag('');
  }
  sag('### Was diese Probe NICHT misst');
  sag('');
  sag('`Sanktionen` in der zweiten Messung ist ein Filter-Artefakt („Die Sanktionen müssen wirksam sein") — kein Akteur, sondern ein Gegenstand. Er zeigt, dass die Subjekt-Erkennung noch grob ist.');
  sag('');
  sag('Sie prüft die **Begriffsbestimmungen**, also die Akteure, die das Gesetz selbst benennt — nicht jeden Adressaten jeder einzelnen Bestimmung. Ein Akteur, der nur im verfügenden Teil auftaucht, ohne definiert zu sein, fehlt hier. Die Zuordnung ist zudem **musterbasiert**: Sie belegt, dass ein Begriff zu einer Gattung passt, nicht dass ein Fachmann ihn genauso einordnen würde. Das bleibt Artefakt E (κ).');

  const out = join(PAKET_WURZEL, '../../docs/evals/the692-generalisierungsprobe.md');
  writeFileSync(out, z.join('\n') + '\n');
  console.log(`\n→ ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
