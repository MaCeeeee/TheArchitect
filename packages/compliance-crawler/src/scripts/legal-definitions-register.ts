/**
 * Legaldefinitions-Register (Artefakt C der Semantik-Arbeit). READ-ONLY.
 *
 *   npm run definitions:register
 *
 * ── WARUM ──
 * Unser Rollen-Vokabular sind 19 Strings ohne Bedeutung. `provider` steht in
 * fünf Gesetzen für fünf verschiedene Rechtspersonen — KI-VO-Anbieter,
 * ESG-Rating-Anbieter, Zahlungsdienstleister, Cloud-Anbieter, MDR-Anbieter.
 * Ein Kunde, der „wir sind Anbieter" sagt, trifft im Join alle fünf.
 *
 * Die Semantik dafür müssen wir nicht erfinden: Der Gesetzgeber hat sie
 * geschrieben, in den Begriffsbestimmungen (Art. 2/3/4/6) JEDES Rechtsakts —
 * und die liegen bereits im Korpus. Dieses Register extrahiert sie mechanisch
 * und gibt jedem Begriff seine Fundstelle: `Anbieter@ai-act-de:art-3` Nr. 3.
 *
 * ── DREI EHRLICHKEITS-REGELN ──
 * 1. VERSCHACHTELTE VERWEISE werden NICHT aufgelöst, sondern als `unresolved`
 *    markiert („Anbieter von Krypto-Dienstleistungen im Sinne der Verordnung
 *    (EU) 2023/1114"). Eine geratene Auflösung wäre schlimmer als keine.
 * 2. ABGESCHNITTENE QUELLEN werden gemeldet: `fullText` ist bei 19.990 Zeichen
 *    gedeckelt; die MDR-Definitionen laufen darüber hinaus. Ein Register, das
 *    das verschweigt, behauptet Vollständigkeit, die es nicht hat.
 * 3. KOLLISIONEN sind der eigentliche Ertrag, kein Fehler: derselbe Begriff in
 *    mehreren Gesetzen mit eigener Definition. Sie werden je Sprache gezählt.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const PAKET_WURZEL = resolve(__dirname, '../..');
dotenv.config({ path: resolve(PAKET_WURZEL, '../../.env') });

/** Speicher-Deckel des Regulation-Modells — Text an dieser Grenze ist abgeschnitten. */
const FULLTEXT_CAP = 19_990;

/** Verschachtelter Verweis: die Definition zeigt auf ein ANDERES Gesetz. */
const FREMDVERWEIS =
  /im Sinne (?:von|des|der)\s+(?:Artikel|Nummer)|as defined in Article|within the meaning of (?:Article|point)|gemäß (?:Artikel|Nummer)\s+\d+\s+der (?:Verordnung|Richtlinie)|of (?:Regulation|Directive)\s*\(E[UG]\)/i;

interface Definition {
  nummer: string;
  begriff: string;
  text: string;
  quelle: string;
  regulationKey: string;
  sprache: string;
  fundstelle: string;
  unresolved: boolean;
}

/** DE: `3. „Anbieter" eine natürliche …;`   EN: `(3) 'provider' means a natural …;` */
function extrahiere(fullText: string, sprache: string): Array<{ nummer: string; begriff: string; text: string }> {
  const t = fullText.replace(/\s+/g, ' ');
  const treffer: Array<{ nummer: string; begriff: string; text: string }> = [];
  // Die Zeichen sind GEMESSEN, nicht geraten: Deutsch öffnet mit „ (U+201E) und
  // schließt mit “ (U+201C) — wer “ für einen Öffner hält, findet nichts.
  // Ältere Richtlinien (E-Geld 2009, ePrivacy 2002) nummerieren `1.` statt `(1)`
  // und nutzen ‘…’ statt ‚…'. Beide Formen müssen durch dasselbe Muster passen.
  // Der Schnitt läuft bis zum NÄCHSTEN Eintrag, nicht bis zum Semikolon:
  // eidas-de trennt seine Definitionen mit Punkt, andere mit Semikolon. Ein
  // zeichensetzungs-abhängiges Muster schluckte dort 41 Definitionen am Stück.
  const re =
    sprache === 'de'
      ? /(\d+[a-z]?)\.\s*„([^„“]{2,80})“\s*([\s\S]{10,1500}?)(?=\s\d+[a-z]?\.\s*„|$)/g
      : /[(\s](\d+[a-z]?)[).]\s*[‘'"]([^’'"]{2,80})[’'"]\s*(?:means|shall mean)?\s*([\s\S]{10,1500}?)(?=[(\s]\d+[a-z]?[).]\s*[‘'"]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    treffer.push({ nummer: m[1], begriff: m[2].trim(), text: m[3].trim() });
  }
  return treffer;
}

async function main(): Promise<void> {
  const uri = process.env.CORPUS_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('CORPUS_MONGODB_URI fehlt.');
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 8_000 }).asPromise();
  const docs = (await conn
    .collection('regulations')
    .find(
      { title: { $regex: 'Begriffsbestimmungen|^Definitions$', $options: 'i' } },
      { projection: { source: 1, regulationKey: 1, language: 1, fullText: 1, paragraphNumber: 1 } }
    )
    .toArray()) as never as Array<{
    source: string; regulationKey: string; language: string; fullText: string; paragraphNumber: string;
  }>;
  if (docs.length === 0) throw new Error('0 Begriffsbestimmungs-Artikel — leere Messung ist kein Bestehen.');

  const alle: Definition[] = [];
  const abgeschnitten: string[] = [];
  const ohneTreffer: string[] = [];

  for (const d of docs) {
    const text = String(d.fullText ?? '');
    if (text.length >= FULLTEXT_CAP) abgeschnitten.push(d.regulationKey);
    const roh = extrahiere(text, d.language === 'de' ? 'de' : 'en');
    if (roh.length === 0) { ohneTreffer.push(d.regulationKey); continue; }
    for (const r of roh) {
      alle.push({
        ...r,
        quelle: d.source,
        regulationKey: d.regulationKey,
        sprache: d.language,
        fundstelle: `${d.regulationKey} Nr. ${r.nummer}`,
        unresolved: FREMDVERWEIS.test(r.text),
      });
    }
  }

  // ── Kollisionen je Sprache: derselbe Begriff, mehrere Gesetze ──
  const norm = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9 -]/g, '').trim();
  const kollisionen = new Map<string, Definition[]>();
  for (const d of alle) {
    const k = `${d.sprache}|${norm(d.begriff)}`;
    kollisionen.set(k, [...(kollisionen.get(k) ?? []), d]);
  }
  const echte = [...kollisionen.entries()]
    .map(([k, v]) => ({ k, familien: new Set(v.map((x) => x.quelle.replace(/-(de|en)$/, ''))), defs: v }))
    .filter((x) => x.familien.size > 1)
    .sort((a, b) => b.familien.size - a.familien.size);

  const z: string[] = [];
  const sag = (s = '') => { console.log(s); z.push(s); };

  sag('# Legaldefinitions-Register — die Semantik, die der Gesetzgeber geschrieben hat');
  sag('');
  sag('> Erzeugt von `npm run definitions:register` (read-only, mechanisch, kein Modell). Nicht von Hand pflegen.');
  sag('');
  sag(`**${alle.length} Legaldefinitionen** aus **${docs.length}** Begriffsbestimmungs-Artikeln über ${new Set(docs.map((d) => d.source.replace(/-(de|en)$/, ''))).size} Gesetzesfamilien.`);
  sag('');

  sag('## Je Rechtsakt');
  sag('');
  sag('| Artikel | Definitionen | mit Fremdverweis | Quelle abgeschnitten |');
  sag('|---|---|---|---|');
  for (const d of docs.sort((a, b) => a.regulationKey.localeCompare(b.regulationKey))) {
    const meine = alle.filter((x) => x.regulationKey === d.regulationKey);
    const unres = meine.filter((x) => x.unresolved).length;
    sag(`| \`${d.regulationKey}\` | ${meine.length} | ${unres} | ${String(d.fullText ?? '').length >= FULLTEXT_CAP ? '⚠️ ja' : '—'} |`);
  }
  sag('');

  // ── Sprach-Symmetrie als eingebaute Qualitätsprüfung ──
  // Dieselbe Verordnung hat in DE und EN dieselbe Anzahl Legaldefinitionen.
  // Weicht ein Paar stark ab, ist das ein EXTRAKTIONS-Fehler, kein Rechtsbefund.
  // Genau so wurde eidas-de gefunden (1 gegen 41).
  sag('## Sprach-Symmetrie — die eingebaute Gegenprobe');
  sag('');
  sag('Dieselbe Verordnung trägt in beiden Fassungen dieselben Begriffe. Ein abweichendes Paar ist ein **Extraktionsfehler**, kein Rechtsbefund.');
  sag('');
  sag('| Familie | DE | EN | Abweichung |');
  sag('|---|---|---|---|');
  const familien = new Set(docs.map((d) => d.source.replace(/-(de|en)$/, '')));
  let schief = 0;
  for (const fam of [...familien].sort()) {
    const de = alle.filter((x) => x.quelle.replace(/-(de|en)$/, '') === fam && x.sprache === 'de').length;
    const en = alle.filter((x) => x.quelle.replace(/-(de|en)$/, '') === fam && x.sprache === 'en').length;
    if (de === 0 && en === 0) continue;
    const rel = Math.max(de, en) === 0 ? 0 : Math.abs(de - en) / Math.max(de, en);
    const warn = rel > 0.15;
    if (warn) schief++;
    sag(`| \`${fam}\` | ${de} | ${en} | ${warn ? `⚠️ ${(100 * rel).toFixed(0)} %` : '—'} |`);
  }
  sag('');
  sag(`Auffällige Paare: **${schief}**${schief === 0 ? ' — beide Fassungen decken sich.' : ' — dort zuerst das Muster prüfen, nicht den Rechtstext.'}`);
  sag('');

  sag('## Die Kollisionen — Donovans „Customer" in unserem Korpus');
  sag('');
  sag('Derselbe Begriff, mehrere Gesetze, **je eigene Legaldefinition**. Das ist kein Fehler, sondern die Tatsache, die unser Rollen-Vokabular heute verschweigt.');
  sag('');
  // Nicht jede Kollision ist ein Konflikt: Verweisen die anderen Gesetze nur auf
  // EINE Quelle („personenbezogene Daten im Sinne der Verordnung 2016/679"), ist
  // der Begriff HARMONISIERT — dann gibt es genau eine Bedeutung, und unser
  // einzelner Vokabelwert ist korrekt. Ein echter Konflikt liegt erst vor, wenn
  // mindestens zwei Gesetze eine EIGENE Definition schreiben.
  const bewertet = echte.map((k) => {
    const eigene = k.defs.filter((d) => !d.unresolved).length;
    return { ...k, eigene, art: eigene >= 2 ? 'konflikt' : 'harmonisiert' };
  });
  const konflikte = bewertet.filter((k) => k.art === 'konflikt');
  const harmonisiert = bewertet.filter((k) => k.art === 'harmonisiert');

  sag(`**${konflikte.length} echte Konflikte** (mindestens zwei Gesetze definieren selbst) · ${harmonisiert.length} harmonisiert (die übrigen verweisen auf eine Quelle).`);
  sag('');
  sag('### Echte Konflikte — hier braucht ein Vokabelwert eine Rechtsgrundlage');
  sag('');
  sag('| Begriff | Sprache | Gesetze | eigene Definitionen | Fundstellen |');
  sag('|---|---|---|---|---|');
  for (const k of konflikte.slice(0, 30)) {
    const [spr, begriff] = k.k.split('|');
    const fs = k.defs.map((d) => `\`${d.fundstelle}\``).join(' · ');
    sag(`| **${begriff}** | ${spr} | ${k.familien.size} | ${k.eigene} | ${fs.slice(0, 140)} |`);
  }
  sag('');
  sag('### Harmonisiert — eine Bedeutung, mehrfach zitiert');
  sag('');
  for (const k of harmonisiert.slice(0, 12)) {
    const [spr, begriff] = k.k.split('|');
    sag(`- **${begriff}** (${spr}, ${k.familien.size} Gesetze) — ${k.eigene} eigene Definition, Rest verweist`);
  }
  sag('');

  sag('## Ehrlichkeits-Vermerke');
  sag('');
  sag(`- **Fremdverweise (nicht aufgelöst):** ${alle.filter((d) => d.unresolved).length} von ${alle.length} Definitionen verweisen auf ein anderes Gesetz („im Sinne von Artikel X der Verordnung Y"). Sie sind als \`unresolved\` markiert, **nicht geraten**.`);
  sag(`- **Abgeschnittene Quellen:** ${abgeschnitten.length ? abgeschnitten.map((k) => `\`${k}\``).join(', ') : 'keine'} — \`fullText\` ist bei ${FULLTEXT_CAP.toLocaleString('de-DE')} Zeichen gedeckelt. Dort fehlen Definitionen am Ende des Artikels.`);
  sag(`- **Ohne Treffer:** ${ohneTreffer.length ? ohneTreffer.map((k) => `\`${k}\``).join(', ') : 'keine'} — abweichender Definitionsstil, gehört von Hand nachgesehen.`);
  sag('- **Nicht enthalten:** Definitionen außerhalb der Begriffsbestimmungs-Artikel (verstreute „im Sinne dieses Artikels"-Klauseln).');

  const berichtPfad = join(PAKET_WURZEL, '../../docs/evals/legal-definitions-register.md');
  writeFileSync(berichtPfad, z.join('\n') + '\n');
  const jsonPfad = join(PAKET_WURZEL, 'fixtures', 'legal-definitions.json');
  mkdirSync(join(PAKET_WURZEL, 'fixtures'), { recursive: true });
  writeFileSync(jsonPfad, JSON.stringify({ generated: docs.length, count: alle.length, definitions: alle }, null, 1) + '\n');
  console.log(`\n→ ${berichtPfad}\n→ ${jsonPfad}`);
  await conn.close();
}
main().catch(async (e) => { console.error(e); await mongoose.disconnect().catch(() => undefined); process.exit(1); });
