/**
 * THE-685 (REQ-CANON-001.3a): Formex-Analyse und Paket-Auswahl.
 *
 * Kein Netz, kein Mongo — die Analyse ist absichtlich eine reine Funktion,
 * damit genau die Fälle prüfbar sind, an denen der HTML-Segmentierer scheitert.
 */
import AdmZip from 'adm-zip';
import { analyzeFormex, findGaps, normalizeArticleNumber, parseArticleNumber } from '../lib/formexAnalyze';
import {
  buildCellarUrl,
  buildManifestationQuery,
  cacheFileName,
  parseManifestationResults,
  pickMainXml,
  FormexFetchError,
} from '../lib/formexFetch';
import { SOURCE_CRAWL_CONFIG } from '../sources/crawl-config';

// ─── Fixture ─────────────────────────────────────────────────────────────────

/**
 * Nachbau der DORA-Struktur im Kleinen, mit der Falle, die den echten Fall trägt:
 * Artikel 3 ist ein ÄNDERUNGSARTIKEL und enthält einen fremden Artikel als
 * zitierte Struktur. Ein naiver Zähler sähe hier 4 Artikel, davon einen aus
 * einer fremden Verordnung — und übersähe zugleich, dass Artikel 2 fehlt.
 */
const ACT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ACT xsi:noNamespaceSchemaLocation="http://formex.publications.europa.eu/schema/formex-05.59-20170418.xd">
<BIB.INSTANCE><LG.DOC>DE</LG.DOC></BIB.INSTANCE>
<TITLE><TI><P>Verordnung (EU) 2022/2554</P></TI></TITLE>
<PREAMBLE>
  <GR.CONSID>
    <CONSID><NP><NO.P>(1)</NO.P><TXT>Die Union braucht klare Regeln.</TXT></NP></CONSID>
    <CONSID><NP><NO.P>(2)</NO.P><TXT>Hersteller sollten Schwachstellen melden.</TXT></NP></CONSID>
  </GR.CONSID>
</PREAMBLE>
<ENACTING.TERMS>
  <ARTICLE IDENTIFIER="001"><TI.ART>Artikel 1</TI.ART><STI.ART>Gegenstand</STI.ART>
    <PARAG IDENTIFIER="001.001"><NO.PARAG>(1)</NO.PARAG><ALINEA><P>Diese Verordnung gilt.</P></ALINEA></PARAG>
    <PARAG IDENTIFIER="001.002"><NO.PARAG>(2)</NO.PARAG><ALINEA><P>Sie lässt anderes unberührt.</P></ALINEA></PARAG>
  </ARTICLE>
  <ARTICLE IDENTIFIER="003"><TI.ART>Artikel 3</TI.ART><STI.ART>Änderungen der Verordnung (EU) Nr. 909/2014</STI.ART>
    <ALINEA><P>Die Verordnung wird wie folgt geändert:</P>
      <QUOT.S LEVEL="1">
        <ARTICLE IDENTIFIER="045"><TI.ART>Artikel 45</TI.ART><STI.ART>Fremder Artikel</STI.ART>
          <PARAG IDENTIFIER="045.001"><ALINEA><P>Fremder Text.</P></ALINEA></PARAG>
        </ARTICLE>
      </QUOT.S>
    </ALINEA>
  </ARTICLE>
  <ARTICLE IDENTIFIER="004"><TI.ART>Artikel 4</TI.ART><STI.ART>Inkrafttreten</STI.ART>
    <ALINEA><P>Diese Verordnung tritt in Kraft.</P></ALINEA>
  </ARTICLE>
</ENACTING.TERMS>
<ANNEX>
  <TI><P>ANHANG I</P></TI>
  <ARTICLE IDENTIFIER="A01"><TI.ART>Artikel 99</TI.ART><STI.ART>Nur im Anhang</STI.ART></ARTICLE>
</ANNEX>
</ACT>`;

const DOC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<DOC><BIB.DOC><AUTHOR>EP</AUTHOR></BIB.DOC><FMX><DOC.MAIN.PUB><LG.DOC>DE</LG.DOC><LEGAL.VALUE>REG</LEGAL.VALUE></DOC.MAIN.PUB></FMX></DOC>`;

// ─── Analyse ─────────────────────────────────────────────────────────────────

describe('analyzeFormex', () => {
  const a = analyzeFormex(ACT_XML, DOC_XML);

  it('liest Wurzel, Schemaversion, Sprache und Rechtsform', () => {
    expect(a.rootTag).toBe('ACT');
    expect(a.schemaVersion).toBe('formex-05.59-20170418');
    expect(a.language).toBe('DE');
    expect(a.legalValue).toBe('REG');
  });

  it('erkennt die Ausdrucksform: Wurzel ACT = Fassung wie erlassen (AC-5)', () => {
    expect(a.expressionType).toBe('base-act');
  });

  it('zählt NUR die Artikel des verfügenden Teils — der zitierte fremde nicht', () => {
    expect(a.articleNumbers).toEqual(['1', '3', '4']);
    expect(a.articlesInQuotedStructures).toBe(1);
    expect(a.articleNumbers).not.toContain('45');
  });

  it('der Anhang-Artikel wird ausgewiesen, aber nicht mitgerechnet', () => {
    expect(a.articlesOutsideEnactingTerms).toBe(1);
    expect(a.articleNumbers).not.toContain('99');
    expect(a.annexCount).toBe(1);
  });

  it('meldet die Lücke einzeln — Artikel 2 fehlt (der THE-684-Fehlertyp)', () => {
    expect(a.articleGaps).toEqual([2]);
  });

  it('trägt die amtlichen Ids mit — sie sind hierarchisch, nicht nur laufend', () => {
    expect(a.articles[0].identifier).toBe('001');
    expect(a.articles[0].title).toBe('Gegenstand');
  });

  it('zählt Erwägungsgründe aus NO.P und findet keine Lücke', () => {
    expect(a.recitalNumbers).toEqual([1, 2]);
    expect(a.recitalGaps).toEqual([]);
  });

  it('zählt Struktur-Tags — zitierte Elemente bleiben draußen (AC-2)', () => {
    expect(a.counts.ARTICLE).toBe(4); // 3 im verfügenden Teil + 1 im Anhang
    expect(a.counts.PARAG).toBe(2); // die zwei aus Artikel 1; der zitierte PARAG fehlt
    expect(a.counts.CONSID).toBe(2);
    expect(a.quotedElements).toBeGreaterThan(0);
  });

  it('leeres Dokument bricht laut ab — leere Messung ist kein Bestehen (AC-8)', () => {
    expect(() => analyzeFormex('   ')).toThrow(/[Ll]eer/);
  });

  it('erkennt eine konsolidierte Fassung an der Wurzel', () => {
    const kons = analyzeFormex('<?xml version="1.0"?><CONS.DOC><ENACTING.TERMS/></CONS.DOC>');
    expect(kons.expressionType).toBe('consolidated');
  });
});

describe('parseArticleNumber', () => {
  it('liest DE und EN', () => {
    expect(parseArticleNumber('Artikel 61')).toBe('61');
    expect(parseArticleNumber('Article 61')).toBe('61');
  });
  it('behält den Buchstaben-Zusatz und normalisiert ihn', () => {
    expect(parseArticleNumber('Artikel 10a')).toBe('10a');
    expect(parseArticleNumber('Article 10 A')).toBe('10a');
  });
  it('ohne Nummer null statt Raten', () => {
    expect(parseArticleNumber('ANHANG I')).toBeNull();
  });
});

describe('normalizeArticleNumber — der gemeinsame Vergleichsschlüssel', () => {
  it('bringt beide Schreibweisen auf dieselbe Form', () => {
    // Am echten Bestand gefunden (15.08.): `regulations.paragraphNumber` führt
    // `art. 61`, die amtliche Quelle „Artikel 61". Ohne diese Funktion sah jede
    // Fassung zu 100 % abweichend aus — 64 fehlend, 63 überzählig.
    expect(normalizeArticleNumber('art. 61')).toBe('61');
    expect(normalizeArticleNumber('Art. 61')).toBe('61');
    expect(normalizeArticleNumber('Artikel 61')).toBe('61');
    expect(normalizeArticleNumber('Article 61')).toBe('61');
    expect(normalizeArticleNumber('61')).toBe('61');
    expect(normalizeArticleNumber('§ 7')).toBe('7');
  });
  it('hält den Buchstaben-Zusatz', () => {
    expect(normalizeArticleNumber('art. 10a')).toBe('10a');
    expect(normalizeArticleNumber('Artikel 10 A')).toBe('10a');
  });
  it('was keine Artikelnummer ist, wird nicht zurechtgebogen', () => {
    expect(normalizeArticleNumber('Anhang I')).toBeNull();
    expect(normalizeArticleNumber('')).toBeNull();
  });
});

describe('findGaps', () => {
  it('lückenlos → leer', () => expect(findGaps([1, 2, 3])).toEqual([]));
  it('nennt jede Lücke einzeln, nicht die Summe', () => expect(findGaps([1, 3, 6])).toEqual([2, 4, 5]));
  it('leere Eingabe erfindet keine Lücken', () => expect(findGaps([])).toEqual([]));
});

// ─── Paket-Auswahl ───────────────────────────────────────────────────────────

describe('pickMainXml', () => {
  function paket(dateien: Array<[string, string]>): AdmZip {
    const z = new AdmZip();
    for (const [name, inhalt] of dateien) z.addFile(name, Buffer.from(inhalt, 'utf8'));
    return new AdmZip(z.toBuffer()); // Roundtrip: erst danach stimmen die Größen im Header
  }

  it('wählt den Rechtsakt, nicht das kleine Manifest', () => {
    const p = pickMainXml(paket([['L_2022333EN.01000101.doc.xml', DOC_XML], ['L_2022333EN.01000101.xml', ACT_XML]]));
    expect(p.mainEntryName).toMatch(/01000101\.xml$/);
    expect(p.xml).toContain('<ENACTING.TERMS>');
    expect(p.docXml).toContain('LEGAL.VALUE');
  });

  it('Reihenfolge im Archiv ändert nichts — es entscheidet die Größe', () => {
    const p = pickMainXml(paket([['a.xml', ACT_XML], ['b.doc.xml', DOC_XML]]));
    expect(p.mainEntryName).toBe('a.xml');
  });

  it('nur ein Manifest ist kein Rechtsakt — laut abbrechen', () => {
    expect(() => pickMainXml(paket([['x.doc.xml', DOC_XML]]))).toThrow(FormexFetchError);
  });
});

describe('Adress-Auflösung statt Adress-Raten', () => {
  it('fragt nach CELEX, Sprache und genau dem Typ fmx4', () => {
    const q = buildManifestationQuery('32016R0679', 'de');
    expect(q).toContain('"32016R0679"');
    expect(q).toContain('/authority/language/DEU');
    expect(q).toContain('"fmx4"');
  });

  it('jeder CELEX aus unserer Konfiguration passiert die Prüfung', () => {
    // Ohne diesen Test hätte ein zu enges Muster still ALLE Fassungen auf den
    // Rückfallweg geschickt — und der Rückfall ist genau der, der 404 liefert.
    for (const [id, cfg] of Object.entries(SOURCE_CRAWL_CONFIG)) {
      if (cfg.transport !== 'eur-lex' || !cfg.celex || !cfg.language) continue;
      expect(() => buildManifestationQuery(cfg.celex!, cfg.language!)).not.toThrow();
      expect(id).toBeTruthy();
    }
  });

  it('ein unsauberer CELEX geht nicht in die Abfrage', () => {
    // Die Werte stammen aus unserer eigenen Konfiguration — geprüft wird
    // trotzdem dort, wo die Abfrage entsteht.
    expect(() => buildManifestationQuery('32016R0679" } #', 'de')).toThrow(FormexFetchError);
    expect(() => buildManifestationQuery('nis2', 'de')).toThrow(FormexFetchError);
  });

  it('liest die Adressen aus der Antwort und sortiert sie reproduzierbar', () => {
    const antwort = {
      results: {
        bindings: [
          { m: { value: 'http://publications.europa.eu/resource/cellar/uuid.0004.03' } },
          { m: { value: 'http://publications.europa.eu/resource/cellar/uuid.0004.02' } },
        ],
      },
    };
    expect(parseManifestationResults(antwort)).toEqual([
      'http://publications.europa.eu/resource/cellar/uuid.0004.02',
      'http://publications.europa.eu/resource/cellar/uuid.0004.03',
    ]);
  });

  it('eine leere oder unerwartete Antwort liefert nichts statt zu werfen', () => {
    expect(parseManifestationResults({ results: { bindings: [] } })).toEqual([]);
    expect(parseManifestationResults({})).toEqual([]);
    expect(parseManifestationResults(null)).toEqual([]);
  });
});

describe('buildCellarUrl', () => {
  it('setzt den dreistelligen CELLAR-Sprachcode', () => {
    expect(buildCellarUrl('32022R2554', 'en')).toBe('http://publications.europa.eu/resource/celex/32022R2554.ENG.fmx4');
    expect(buildCellarUrl('32016R0679', 'de')).toBe('http://publications.europa.eu/resource/celex/32016R0679.DEU.fmx4');
  });
  it('unbekannte Sprache wird nicht geraten', () => {
    expect(() => buildCellarUrl('32022R2554', 'fr')).toThrow(FormexFetchError);
  });
  it('Ablagename trägt CELEX und Sprache', () => {
    expect(cacheFileName('32022R2554', 'de')).toBe('32022R2554.DEU.fmx4.zip');
  });
});
