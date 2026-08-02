# THE-545 Senkrechter Schnitt — Implementierungsplan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beantworten, ob die Kette Klausel → Stakeholder-Anforderung → Systemanforderung → Maßnahme automatisierbar ist — gemessen gegen das externe SCF-Gold (5 Kandidaten), mit einer mechanischen und einer semantischen Negativ-Kontrolle.

**Architecture:** Reines Eval-Artefakt (kein Mongoose-Modell, keine Migration): eingefrorenes Rechtstext-Fixture → mechanischer Klausel-Zerleger → LLM-Extraktion mit mechanischem Singularitätstor → LLM-Transformation mit mechanischem Implementierungsfreiheits- und Wortgleichheits-Test → Maßnahmen-Gruppierung, bei der die Verdrängungs-Kante **vor** jedem Modellurteil filtert. Wiederverwendet die THE-382-Werkzeuge (Blendung, typisierter Paar-Richter, Kanarien-Disziplin) in neuer Rolle.

**Tech Stack:** TypeScript · Zod · Jest (Tests in `packages/server/src/__tests__/`, shared hat keinen Runner) · `raterClient` (Anthropic/OpenRouter, dotenv) · Norm-Ontologie v1.9.0

**Ticket:** THE-545 · **Rahmen:** ADR-0007 · **RVTM:** docs/superpowers/rvtm/2026-08-02-the545-reqtrace-vertical-cut-rvtm.md

---

## Bindende Vorgaben aus THE-545 / ADR-0007

1. **Keine Produktionsdaten.** Nur Dateien unter `src/evals/` + `docs/`. REQGEN wird weder gelesen noch umgebaut — die Kette läuft aus dem Rechtstext.
2. **Verdrängung filtert vor jedem Modellurteil** (mechanische Negativ-Kontrolle ist strukturell: wird das Paar einem Richter vorgelegt, ist sie gerissen — egal wie er urteilt).
3. **Mechanische Tore statt LLM-Rubriken:** Singularität = Zählung je Slot; Zusammenfall = Feldvergleich; Implementierungsfreiheit = Lexikon. Das LLM extrahiert, die Entscheidung ist ein Vergleich.
4. **Blendung strukturell** — jede Klausel läuft durch `blindLawNames`, kein Prompt sieht Gesetzesnamen.
5. **Abbruchbedingungen sind Teil des Berichts:** <3/5 Positiv-Kandidaten, eine gerissene Negativ-Kontrolle, oder Extraktionsrate weit weg von ~1/Klausel ⇒ Ticket schließt **negativ** (gültiges Ergebnis).

**Eine benannte Abweichung vom Ticket-Text:** „Es liest den Korpus" ist vom Mac aus derzeit unmöglich (`CORPUS_MONGODB_URI` → localhost; Korpus liegt auf Server B). Der Plan ersetzt das durch ein **eingefrorenes Rechtstext-Fixture aus EUR-Lex** mit CELEX-Nachweis — dieselbe Reproduzierbarkeits-Idee wie bei den Golden Sets, und der Adressatenkreis je Artikel wird von Hand mit Zitat erfasst statt aus der Korpus-Typisierung gejoint. Grenze im Bericht ausweisen.

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `packages/server/src/evals/golden/reqtrace/laws.v1.json` *(neu)* | Eingefrorener Rechtstext: 9 Artikel, DE, mit CELEX + Adressatenklasse + Zitat |
| `packages/server/src/evals/reqtrace/lawsFixture.ts` *(neu)* | Schema + Loader des Fixtures |
| `packages/server/src/evals/reqtrace/clauseSegmenter.ts` *(neu)* | Mechanische Zerlegung Artikel → Klauseln (Absatz/Litera/Satz), kein LLM |
| `packages/shared/src/ontology/norm-ontology.v1.ts` *(ändern)* | Facette `displacements` — v1.9.0 |
| `packages/shared/src/ontology/norm-ontology.schema.ts` *(ändern)* | `DisplacementEntry` + Duplikat-Check |
| `packages/shared/src/ontology/index.ts` *(ändern)* | `findDisplacement()` |
| `packages/shared/src/ontology/CHANGELOG.md` *(ändern)* | 1.9.0-Eintrag |
| `packages/shared/src/obligations/reqtrace-prompt.ts` *(neu)* | `STAKEHOLDER_REQ_SYSTEM`, `SYSTEM_REQ_SYSTEM`, Parser, mechanische Tore |
| `packages/server/src/evals/reqtrace/measureGrouping.ts` *(neu)* | Verdrängungsfilter → Gruppierung → geteilte-Maßnahme-Kandidaten |
| `packages/server/src/evals/reqtrace/runReqtraceEval.ts` *(neu)* | Harness: Kette + 3 Kontrollen + Kalibrierung + Bericht |
| `packages/server/src/scripts/reqtrace-worksheet.ts` *(neu)* | Menschliches Tor: 5 Maßnahmen-Fälle als HTML |
| `packages/server/package.json` *(ändern)* | Aliasse `reqtrace:eval`, `reqtrace:worksheet` |
| Tests | `packages/server/src/__tests__/reqtrace*.test.ts`, `normOntology.test.ts` erweitern |

**Wiederverwendet, unverändert:** `blindLawNames`, `ObligationSlotsSchema`, `PAIR_RELATION_SYSTEM`/`parsePairRelation`/`foldRelation`, `CLASSIFY_SYSTEM`/`parseActionAssignment`, `relationKappa`, `createRaterClient`/`withEmptyResponseRetry`.

---

## Chunk 1: Rechtstext-Fixture + mechanischer Klausel-Zerleger

### Task 1: Das eingefrorene Rechtstext-Fixture

**Files:**
- Create: `packages/server/src/evals/golden/reqtrace/laws.v1.json`
- Create: `packages/server/src/evals/reqtrace/lawsFixture.ts`
- Test: `packages/server/src/__tests__/reqtraceLaws.test.ts`

Die 9 Artikel des Schnitts. Quelle: EUR-Lex, deutsche konsolidierte Fassung — beim Bau per WebFetch holen, **einmal**, dann eingefroren (CELEX im Datensatz, Stichproben-Zitat im Test):

| Artikel | Rolle im Schnitt | Adressatenklasse (partyRole-Id) | CELEX |
|---|---|---|---|
| DSGVO Art. 24, 32 | Positiv (BCD/CRY/GOV/HRS/RSK) | `controller` | 32016R0679 |
| DSGVO Art. 33 | semantische Negativ-Kontrolle | `controller` | 32016R0679 |
| NIS2 Art. 21 | Positiv | `essential_important_entity` | 32022L2555 |
| NIS2 Art. 23 | mechanische Negativ-Kontrolle | `essential_important_entity` | 32022L2555 |
| DORA Art. 5, 6, 9 | Positiv | `financial_entity` | 32022R2554 |
| DORA Art. 19 | mechanische Negativ-Kontrolle | `financial_entity` | 32022R2554 |

- [ ] **Step 1: Fehlschlagende Tests schreiben**

```ts
import { loadReqtraceLaws, ReqtraceLawsSchema } from '../evals/reqtrace/lawsFixture';
import { isPartyRole } from '@thearchitect/shared';

describe('reqtrace laws fixture (THE-545)', () => {
  const set = loadReqtraceLaws();

  it('carries all nine articles of the vertical cut', () => {
    const keys = set.articles.map((a) => `${a.source}:${a.article}`).sort();
    expect(keys).toEqual([
      'dora:art5', 'dora:art6', 'dora:art9', 'dora:art19',
      'dsgvo:art24', 'dsgvo:art32', 'dsgvo:art33',
      'nis2:art21', 'nis2:art23',
    ].sort());
  });

  it('is RAW law text, not a REQGEN artefact', () => {
    // Die zweite Praemisse aus THE-545: REQGEN-Ausgabe wird NICHT
    // weiterverwendet. Rohtext erkennt man an der Absatz-Struktur.
    for (const a of set.articles) {
      expect(a.fullText.length).toBeGreaterThan(500);
      expect(a.fullText).toMatch(/\(1\)|\(2\)/); // nummerierte Absaetze
    }
  });

  it('pins provenance: CELEX + retrieval date on every article', () => {
    for (const a of set.articles) {
      expect(a.celex).toMatch(/^3\d{4}[RL]\d{4}$/);
      expect(a.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('records the addressee class as an ontology partyRole WITH citation', () => {
    // Handersatz fuer den unerreichbaren Korpus-Join — jede Klasse traegt
    // die Fundstelle, aus der sie abgelesen wurde.
    for (const a of set.articles) {
      expect(isPartyRole(a.addresseeClass)).toBe(true);
      expect(a.addresseeCitation.length).toBeGreaterThan(10);
    }
  });

  it('spot-checks one load-bearing sentence per law against the source', () => {
    const text = (s: string, art: string) =>
      set.articles.find((a) => a.source === s && a.article === art)!.fullText;
    expect(text('dsgvo', 'art32')).toContain('geeignete technische und organisatorische Maßnahmen');
    expect(text('nis2', 'art21')).toContain('Risiken für die Sicherheit der Netz- und Informationssysteme');
    expect(text('dora', 'art6')).toContain('IKT-Risikomanagementrahmen');
  });
});
```

*(Falls `isPartyRole` nicht exportiert ist: in `packages/shared/src/ontology/index.ts` analog `isCanonicalAction` ergänzen.)*

- [ ] **Step 2: Fehlschlag bestätigen** — `cd packages/server && npx jest src/__tests__/reqtraceLaws.test.ts` → FAIL (Datei fehlt)

- [ ] **Step 3: Fixture bauen.** Je Artikel per WebFetch die deutsche Fassung aus EUR-Lex holen (`https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:<celex>`), den Artikeltext **vollständig** übernehmen (Absatz-Nummerierung erhalten), `retrievedAt` = heutiges Datum. Adressatenklasse + Zitat je Artikel:
  - DSGVO: `controller` — „Der Verantwortliche…" (Art. 24 Abs. 1 Satz 1)
  - NIS2: `essential_important_entity` — „Wesentliche und wichtige Einrichtungen…" (Art. 21 Abs. 1)
  - DORA: `financial_entity` — „Finanzunternehmen…" (Art. 5 Abs. 1)

- [ ] **Step 4: `lawsFixture.ts` implementieren** — Zod-Schema (`source`, `article`, `celex`, `language: 'de'`, `retrievedAt`, `addresseeClass`, `addresseeCitation`, `fullText`), Loader mit Duplikat-Check (Muster: `actionGolden.ts`).

- [ ] **Step 5: Grün + Commit** — `git commit -m "feat(the-545): eingefrorenes Rechtstext-Fixture, 9 Artikel mit CELEX und Adressatenklasse"`

---

### Task 2: Mechanischer Klausel-Zerleger

**Files:**
- Create: `packages/server/src/evals/reqtrace/clauseSegmenter.ts`
- Test: `packages/server/src/__tests__/clauseSegmenter.test.ts`

Absatz/Litera/Satz stehen **im Text** — nach ADR-0007 E7 gehört das in einen Parser, nicht in einen Prompt. Kein LLM-Aufruf in dieser Datei.

- [ ] **Step 1: Tests**

```ts
import { segmentClauses, clauseStats } from '../evals/reqtrace/clauseSegmenter';
import { loadReqtraceLaws } from '../evals/reqtrace/lawsFixture';

describe('clauseSegmenter (THE-545)', () => {
  const art32 = loadReqtraceLaws().articles.find((a) => a.source === 'dsgvo' && a.article === 'art32')!;

  it('splits numbered paragraphs and litterae with stable ids', () => {
    const clauses = segmentClauses(art32);
    expect(clauses.length).toBeGreaterThan(3);
    expect(clauses[0].id).toBe('dsgvo:art32:c01');
    // Jede Klausel kennt ihren Pfad — der Rueckverweis der Traceability.
    for (const c of clauses) expect(c.path).toMatch(/^Abs\.\s?\d/);
  });

  it('is deterministic — same text, same clauses, same ids', () => {
    expect(segmentClauses(art32)).toEqual(segmentClauses(art32));
  });

  it('never drops text: concatenated clauses cover the article', () => {
    // Stiller Verlust ist der Fehlermodus schlechthin (pairs:ingest-Regel).
    const joined = segmentClauses(art32).map((c) => c.text).join(' ');
    const words = art32.fullText.split(/\s+/).filter((w) => w.length > 6).slice(0, 60);
    for (const w of words) expect(joined).toContain(w);
  });

  it('makes no LLM call — the module imports no rater', () => {
    const src = require('fs').readFileSync(require.resolve('../evals/reqtrace/clauseSegmenter'), 'utf8');
    expect(src).not.toMatch(/raterClient|anthropic|openrouter/i);
  });

  it('reports the rate for calibration against Reg2Req', () => {
    const s = clauseStats(loadReqtraceLaws().articles.map(segmentClauses));
    expect(s.clausesPerArticle).toBeGreaterThan(1); // DSGVO-Referenz: ~4/Artikel
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**
- [ ] **Step 3: Implementieren.** Regex-Kaskade: `(\d+)`-Absätze → `a)`-Litterae → Satzsplit nur, wenn ein Absatz > 400 Zeichen und mehrere Vollverben trägt (konservativ — lieber eine zu grobe Klausel als zerhackter Sinn; das Singularitätstor in Task 4 teilt später nach). IDs fortlaufend `c01…`, `path` menschenlesbar.
- [ ] **Step 4: Grün + Commit** — `feat(the-545): mechanischer Klausel-Zerleger — Struktur aus dem Text, kein LLM`

---

## Chunk 2: Verdrängung als versionierte Daten

### Task 3: Ontologie 1.9.0 — Facette `displacements`

**Files:**
- Modify: `packages/shared/src/ontology/norm-ontology.v1.ts` (Version 1.8.0 → 1.9.0)
- Modify: `packages/shared/src/ontology/norm-ontology.schema.ts`
- Modify: `packages/shared/src/ontology/index.ts`
- Modify: `packages/shared/src/ontology/CHANGELOG.md`
- Test: `packages/server/src/__tests__/normOntology.test.ts` *(erweitern)*

Die Relationstypen `PREVAILS_OVER`/`DEROGATED_BY` existieren seit je als *Typen* — es gab nur nie eine konkrete Kante. ADR-0007 E6: die Kante ist ein Fakt mit Zitat, versioniert; Anwendbarkeit wird berechnet.

- [ ] **Step 1: Tests**

```ts
describe('displacements facet — v1.9.0 (THE-545, ADR-0007 E6)', () => {
  it('records DORA-over-NIS2 with citations from BOTH sides', () => {
    const d = NORM_ONTOLOGY.displacements.find((x) => x.id === 'dora-prevails-nis2');
    expect(d).toBeDefined();
    expect(d!.prevailing.source).toBe('dora');
    expect(d!.displaced.source).toBe('nis2');
    expect(d!.addresseeClass).toBe('financial_entity');
    // Beide Seiten der Herleitung — DORA erklaert sich, NIS2 zieht die Konsequenz.
    expect(d!.citations.join(' ')).toMatch(/Art\.\s?1\s?Abs\.\s?2/);
    expect(d!.citations.join(' ')).toMatch(/Art\.\s?4/);
  });

  it('findDisplacement fires only for the displaced addressee class', () => {
    expect(findDisplacement('nis2', 'financial_entity')).toBeTruthy();
    // Eine wesentliche Einrichtung, die KEIN Finanzunternehmen ist, bleibt
    // unter NIS2 — die Kante ist adressaten-scharf, kein Pauschalausschluss.
    expect(findDisplacement('nis2', 'essential_important_entity')).toBeNull();
    // Die DSGVO wird nicht verdraengt — sie gilt daneben (ADR-0007).
    expect(findDisplacement('dsgvo', 'financial_entity')).toBeNull();
  });

  it('uses the existing PREVAILS_OVER relation type, no new type', () => {
    expect(NORM_ONTOLOGY.relationTypes.some((r) => r.id === 'PREVAILS_OVER')).toBe(true);
  });

  it('bumps the ontology version', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toBe('1.9.0');
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**
- [ ] **Step 3: Implementieren.** Facette (eine Kante, mehr gibt der gemessene Ausschnitt nicht her — nichts erfinden):

```ts
/**
 * Konkrete Verdrängungs-Kanten (lex specialis) — ADR-0007 E6.
 * Die Kante ist ein FAKT über das Recht, belegt am Primärtext; ob sie für ein
 * konkretes Unternehmen greift, wird zur Abfragezeit berechnet, nie gespeichert.
 * Ohne sie waren am 2026-08-01 zehn von 16 Harmonisierungs-Kandidaten
 * rechtlich gegenstandslos.
 */
displacements: [
  {
    id: 'dora-prevails-nis2',
    relationType: 'PREVAILS_OVER',
    prevailing: { source: 'dora' },
    displaced: { source: 'nis2' },
    addresseeClass: 'financial_entity',
    scope: 'Risikomanagement- und Meldepflichten (NIS2 Kap. IV)',
    citations: [
      'DORA Art. 1 Abs. 2 (lex specialis, ErwG 16)',
      'NIS2 Art. 4 + ErwG 28 (nennt DORA ausdrücklich)',
    ],
  },
],
```

Schema: `DisplacementEntry` (alle Felder min-Länge, `addresseeClass` gegen `partyRoles` geprüft, `relationType` gegen `relationTypes`); in den Duplikat-Check aufnehmen. `index.ts`: `findDisplacement(displacedSource, addresseeClass)`. CHANGELOG-Eintrag 1.9.0 nach dem Muster von 1.8.0 (Auslöser: Messung — 10/16 gegenstandslos).

- [ ] **Step 4: Grün** — `npm run build --workspace @thearchitect/shared && npx jest src/__tests__/normOntology.test.ts`
- [ ] **Step 5: Commit** — `feat(the-545): Verdraengungs-Kante DORA→NIS2 als versionierte Ontologie-Daten (1.9.0)`

---

## Chunk 3: Die zwei Transformationen mit mechanischen Toren

### Task 4: Klausel → Stakeholder-Anforderung, Singularität als Zählung

**Files:**
- Create: `packages/shared/src/obligations/reqtrace-prompt.ts`
- Modify: `packages/shared/src/obligations/index.ts` (`export * from './reqtrace-prompt'`)
- Test: `packages/server/src/__tests__/reqtracePrompt.test.ts`

Kniff gegen die Zirkularität „LLM prüft LLM": der Extraktions-Prompt liefert die Slots als **Listen**. Das Tor ist dann eine **Zählung** — jede Liste muss Länge 1 haben, sonst wird aufgeteilt. Das LLM extrahiert, die Entscheidung ist ein Count (ADR-0007 E7).

- [ ] **Step 1: Tests**

```ts
describe('STAKEHOLDER_REQ extraction (THE-545)', () => {
  it('demands slots as LISTS so singularity is a count, not a judgement', () => {
    expect(STAKEHOLDER_REQ_SYSTEM).toMatch(/"handlungen"\s*:\s*\[/);
  });

  it('keeps "traegt keine Anforderung" as a first-class answer', () => {
    // Praeambel-Klauseln sind kein Fehler; erzwungene Treffer sind einer.
    expect(STAKEHOLDER_REQ_SYSTEM).toContain('keine');
    expect(parseStakeholderCandidates('{"candidates":[]}')).toEqual([]);
  });

  it('is singular iff every slot list has exactly one entry', () => {
    const singular = { handlungen: ['melden'], empfaenger: ['Behörde'], modalitaeten: ['pflicht'], bedingungen: ['binnen 72h'] };
    expect(isSingular(singular)).toBe(true);
    expect(isSingular({ ...singular, handlungen: ['etablieren', 'dokumentieren'] })).toBe(false);
    expect(isSingular({ ...singular, bedingungen: [] })).toBe(false); // leer ≠ singulär: SLOT_UNSTATED explizit fordern
  });

  it('maps prohibition to constraint at parse time', () => {
    const c = parseStakeholderCandidates('{"candidates":[{"text":"darf nicht","handlungen":["verarbeiten"],"empfaenger":["—"],"modalitaeten":["verbot"],"bedingungen":["—"]}]}');
    expect(c[0].kind).toBe('constraint');
  });

  it('builds the clause prompt blinded — and NEVER renders the clause id', () => {
    // Die reale Id lautet `dsgvo:art32:c01` und wuerde von CITATION_PATTERN
    // NICHT gefangen (kein \b zwischen Buchstabe und Ziffer). Darum die
    // strukturelle Regel: der Prompt rendert ausschliesslich geblendeten
    // path + text — die Id ist Auswertungs-Anker, nie Prompt-Inhalt.
    const p = buildStakeholderReqUserPrompt({ id: 'dsgvo:art32:c01', path: 'Abs. 1', text: 'Nach DSGVO Art. 32 sind Maßnahmen zu treffen.' });
    expect(p).not.toMatch(/DSGVO|Art\.\s?32|dsgvo:art32|c01/);
  });

  it('treats unreadable output as null, never as empty-success', () => {
    expect(parseStakeholderCandidates('kaputt')).toBeNull();
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**
- [ ] **Step 3: Implementieren.** `STAKEHOLDER_REQ_SYSTEM` (deutsch, wie die Bestands-Prompts): Aufgabe = aus EINER Klausel 0–n Anforderungs-Kandidaten, je Kandidat `text` (eigenständig lesbar, gesetzesneutral) + Slot-**Listen**; ausdrücklich: „Diese Klausel trägt keine Anforderung" ist als `{"candidates":[]}` erlaubt und erwünscht, wo es stimmt; KEINE Umsetzungsvorschläge. `isSingular` = reine Zählung. `kind: 'requirement' | 'constraint'` aus der Modalität (`verbot` → constraint, Wiederverwendung der `OBLIGATION_MODALITIES`). Parser nach dem Hausmuster (`null` = unlesbar ≠ leer).
- [ ] **Step 4: Grün + Commit** — `feat(the-545): Klausel→Stakeholder-Anforderung mit Singularitaet als Zaehlung`

### Task 5: Stakeholder- → Systemanforderung, implementierungsfrei und vergleichbar

**Files:**
- Modify: `packages/shared/src/obligations/reqtrace-prompt.ts`
- Test: `packages/server/src/__tests__/reqtracePrompt.test.ts` *(erweitern)*

Die Systemanforderung trägt die **vier Schlüsselfelder** aus ADR-0007 E5 als strukturierte Werte — damit ist der Zusammenfall-Test ein Feldvergleich, kein Urteil.

- [ ] **Step 1: Tests**

```ts
describe('SYSTEM_REQ transformation (THE-545)', () => {
  it('demands the four key fields that make the collapse test mechanical', () => {
    for (const f of ['schutzgut', 'verpflichteter', 'ausloeser', 'nachweis']) {
      expect(SYSTEM_REQ_SYSTEM).toContain(f);
    }
  });

  it('rejects implementation tokens via lexicon — the 6.4.3.1 gate', () => {
    expect(violatesImplementationFreedom('Daten mit AES-256 verschlüsseln')).toBe(true);
    expect(violatesImplementationFreedom('TLS 1.3 erzwingen')).toBe(true);
    expect(violatesImplementationFreedom('ruhende personenbezogene Daten nach Stand der Technik unlesbar halten')).toBe(false);
  });

  it('collapses two SysReqs only when ALL FOUR key fields match', () => {
    const a = { schutzgut: 'personenbezogene daten', verpflichteter: 'controller', ausloeser: 'verarbeitung', nachweis: 'rechenschaft' };
    expect(collapseKey(a)).toBe(collapseKey({ ...a }));
    // Ein anderes Schutzgut → KEIN Zusammenfall, egal wie aehnlich der Text.
    expect(collapseKey(a)).not.toBe(collapseKey({ ...a, schutzgut: 'ikt-assets' }));
  });

  it('carries traceability back to at least one stakeholder requirement', () => {
    expect(parseSystemReq('{"text":"x","schutzgut":"y","verpflichteter":"z","ausloeser":"a","nachweis":"b"}', [])).toBeNull();
    expect(parseSystemReq('{"text":"x","schutzgut":"y","verpflichteter":"z","ausloeser":"a","nachweis":"b"}', ['shr-1'])?.derivedFrom).toEqual(['shr-1']);
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**
- [ ] **Step 3: Implementieren.** `SYSTEM_REQ_SYSTEM`: Eingabe = eine (geblendete) Stakeholder-Anforderung; Ausgabe = Systemanforderung als „das Unternehmen muss …" (Fähigkeit, kein WIE) + die vier Schlüsselfelder als kurze normalisierte Phrasen. `IMPLEMENTATION_LEXICON` als exportierte Liste (Produkt-/Technologie-Namen, Versionsnummern-Muster `/\b[A-Z]{2,}-?\d+/`, „mittels", konkrete Toolgattungen) — bewusst konservativ, jede Erweiterung ist ein Datenzeileneintrag. `collapseKey` = lowercase/trim/join. `derivedFrom` Pflicht (§6.4.3.2 f).
- [ ] **Step 4: Grün + Commit** — `feat(the-545): SysReq-Transformation mit Lexikon-Tor und mechanischem Zusammenfall-Test`

---

## Chunk 4: Maßnahmen-Gruppierung, Kontrollen, Bericht, Mensch

### Task 6: Gruppierung — Verdrängung zuerst, dann der typisierte Richter als Werkzeug

**Files:**
- Create: `packages/server/src/evals/reqtrace/measureGrouping.ts`
- Test: `packages/server/src/__tests__/measureGrouping.test.ts`

- [ ] **Step 1: Tests** — die strukturelle Garantie der mechanischen Negativ-Kontrolle:

```ts
describe('measureGrouping (THE-545)', () => {
  it('excludes displaced pairs BEFORE any judge sees them — structurally', async () => {
    const asked: string[] = [];
    const r = await groupIntoMeasures(sysReqsIncl(nis2Art23, doraArt19), {
      judge: async (u) => { asked.push(u); return '{"relation":"equal","why":"x"}'; },
    });
    expect(r.excludedByDisplacement).toContainEqual(
      expect.objectContaining({ displaced: expect.stringContaining('nis2') }),
    );
    // Der Richter hat das Paar NIE gesehen — das ist das AC, nicht sein Urteil.
    // Pro Prompt asserten, NICHT ueber die Konkatenation: sonst matcht das
    // Muster ueber Prompt-Grenzen hinweg und der Test reisst falsch-positiv.
    for (const u of asked) {
      expect(u).not.toMatch(/CSIRT[\s\S]*Finanzaufsicht|Finanzaufsicht[\s\S]*CSIRT/);
    }
  });

  it('checks displacement against the PREVAILING side addressee class', async () => {
    // Die Falle: NIS2 Art. 23 traegt im Fixture `essential_important_entity`,
    // und findDisplacement('nis2', 'essential_important_entity') ist null.
    // Die richtige Frage beim Paar ist: "gibt es einen Adressaten, fuer den
    // BEIDE gleichzeitig gelten?" Ein Finanzunternehmen ist auch wesentliche
    // Einrichtung — geprueft wird darum mit der Adressatenklasse der
    // VORRANGIGEN Seite: findDisplacement('nis2', 'financial_entity') feuert.
    const r = await groupIntoMeasures(sysReqsIncl(nis2Art23, doraArt19), { judge: async () => UNRELATED_STUB });
    expect(r.excludedByDisplacement.length).toBeGreaterThan(0);
  });

  it('groups same-action cross-law SysReqs into one measure candidate', async () => { /* Haiku-Stub: themeAware-Muster aus runActionEval.test.ts */ });

  it('leaves same-addressee different-action pairs ungrouped (semantic negative)', async () => { /* NIS2 21 Risiko × DSGVO 33 Meldung */ });

  it('records the typed relation on every grouped edge — intersects is the expected case', async () => { /* equal 0/120-Erwartung */ });

  it('applies the collapse rule only on identical collapseKey', async () => { /* E5 */ });
});
```

- [ ] **Step 2: Fehlschlag bestätigen** — `npx jest src/__tests__/measureGrouping.test.ts` → FAIL

- [ ] **Step 3: Implementieren.** Ablauf **in dieser Reihenfolge, fest verdrahtet**:

  1. **Verdrängungsfilter.** `findDisplacement` über jedes gesetzesübergreifende Paar — **geprüft mit der Adressatenklasse der VORRANGIGEN Seite**, nicht der verdrängten: die Frage ist „gibt es einen Adressaten, für den beide gleichzeitig gelten?", und ein Finanzunternehmen ist zugleich wesentliche Einrichtung. `findDisplacement('nis2', 'financial_entity')` feuert also für NIS2×DORA-Paare. Treffer wandern mit Zitat nach `excludedByDisplacement`; der Code-Pfad zum Richter existiert für sie nicht.
  2. **Adressaten-Kompatibilität ist eine Datenzeile.** `COMPATIBLE_ENTERPRISE_ROLES = ['controller', 'essential_important_entity', 'financial_entity']` — ein Unternehmen kann alle drei Rollen zugleich tragen; alle Fixture-Paare sind damit kompatibel. Inkompatibel wäre Behörde × Unternehmen (kommt im Fixture nicht vor, die Funktion existiert trotzdem und ist getestet). **Achtung:** „gleiche partyRole-Id" wäre falsch — alle fünf Positiv-Kandidaten sind rollenübergreifend, diese Lesart ergäbe mechanisch 0/5.
  3. **Kandidaten** = SysReqs verschiedener Gesetze mit gleicher kanonischer Handlung (`CLASSIFY_SYSTEM` auf den SysReq-Text) und kompatiblen Adressaten.
  4. **Typisierter Richter** (`PAIR_RELATION_SYSTEM`, geblendet) je Kandidat — `equal`/`subset`/`intersects` ⇒ Kante (Typ an der Kante), `unrelated` ⇒ keine.
  5. **Maßnahme = Zusammenhangskomponente** über die Richter-Kanten, NICHT nur das Paar. Verdrängte Paare bekommen keine Kante, dürfen aber über ein drittes Gesetz in derselben Komponente landen (NIS2-Req — DSGVO-Req — DORA-Req): GOV-02 und RSK-01 verlangen `dora`+`dsgvo`+`nis2`, und alle NIS2×DORA-Direktkanten sind verdrängt — paarweise Gruppen könnten per Konstruktion höchstens 3/5 erreichen, und die Abbruchschwelle risse an einer Implementierungsentscheidung statt an der Kette. DoD-2 bleibt gewahrt: der Richter hat das verdrängte Paar nie gesehen; der Bericht weist die Komponentenstruktur aus.
  6. `collapseKey`-Gleichheit ⇒ Zusammenfall auf Anforderungsebene (erwartete Häufigkeit: ~0). Injizierbare `judge`-Funktion wie `HouseFn`.

  Zusätzlicher Test zu (5): Komponente {NIS2-Req, DSGVO-Req, DORA-Req} mit Kanten NIS2—DSGVO und DSGVO—DORA, ohne NIS2—DORA-Kante ⇒ **eine** Maßnahme, Gesetzes-Menge {nis2, dsgvo, dora}.

- [ ] **Step 4: Grün + Commit** — `feat(the-545): Massnahmen-Gruppierung — Verdraengung strukturell vor jedem Urteil, Massnahme = Zusammenhangskomponente`

### Task 7: Harness, drei Kontrollen, Kalibrierung, Bericht

**Files:**
- Create: `packages/server/src/evals/reqtrace/runReqtraceEval.ts`
- Modify: `packages/server/package.json` (`"reqtrace:eval": "ts-node src/evals/reqtrace/runReqtraceEval.ts"`)
- Test: `packages/server/src/__tests__/runReqtraceEval.test.ts`

Dreiteilig wie `runActionEval` (rein renderbar / Kern mit injizierten Häusern / main mit `dotenv/config` — Schlüssel nie auf der Kommandozeile). Das SCF-Gold als Konstante:

```ts
/** Extern, nicht von uns gebaut — docs/strategy/2026-08-01-the538-scf-durchrechnung.md */
export const SCF_GOLD = [
  { id: 'BCD-01', laws: ['dsgvo', 'nis2'] },
  { id: 'CRY-01', laws: ['dsgvo', 'nis2'] },
  { id: 'GOV-02', laws: ['dora', 'dsgvo', 'nis2'] },
  { id: 'HRS-03', laws: ['dora', 'dsgvo'] },
  { id: 'RSK-01', laws: ['dora', 'dsgvo', 'nis2'] },
] as const;
```

- [ ] **Step 1: Tests** (mit Stub-Häusern, kein Netz):
  - Positiv-Zuordnung: eine gefundene geteilte Maßnahme *matcht* einen Gold-Eintrag, wenn ihre Gesetzes-Menge die des Eintrags **abdeckt** und die kanonische Handlung zum Kontroll-Thema passt (Zuordnungstabelle Handlung→SCF-Id im Code, mit Kommentar); Trefferquote x/5 im Ergebnis.
  - `verdict`: `'traegt'` nur wenn ≥3/5 **und** beide Negativ-Kontrollen stehen **und** Rate ∈ [0.5, 3]; sonst `'traegt-nicht'` mit benannter Abbruchbedingung — ein negativer Ausgang ist ein Ergebnis, `process.exitCode = 1` nur bei Harness-Fehlern, nicht bei „trägt nicht".
  - Kalibrierung: `requirementsPerClause` im Bericht, Referenz 1,1 (Reg2Req) daneben.
  - Bericht nennt die Fixture-Abweichung („Adressatenklasse von Hand statt Korpus-Join") als Grenze.
  - Kanarien-Disziplin: mindestens die Positiv-Probe „dieselbe Klausel zweimal → muss auf dieselbe Maßnahme laufen" läuft mit (billigste Selbstkontrolle der Kette).
- [ ] **Step 2–3: Implementieren.** Pipeline: Fixture → Segmenter → Stakeholder-Extraktion (mit Singularitäts-Split: nicht-singuläre Kandidaten werden je Slot-Wert aufgeteilt und als `splitCount` gezählt) → SysReq-Transformation (Lexikon-Verstöße: ein Retry mit Hinweis, dann als `implFreedomFailures` gezählt, nicht still verworfen) → Gruppierung → Abgleich gegen `SCF_GOLD` → Markdown-Bericht (alle Zahlen der DoD, Abbruchbedingungen-Ampel, Grenzen). Artefakte nach `src/evals/golden/reqtrace/run-<datum>.json` — die Rohdaten sind das Ergebnis des Entscheidungs-Tickets.
- [ ] **Step 4: Grün + Commit** — `feat(the-545): reqtrace:eval — Kette, drei Kontrollen, Kalibrierung, Verdikt`

### Task 8: Der Lauf, das menschliche Tor, der Abschluss 🧑

**Files:**
- Create: `packages/server/src/scripts/reqtrace-worksheet.ts` (+ Alias `reqtrace:worksheet`)
- Create: `docs/evals/reqtrace-decision.md`
- Test: `packages/server/src/__tests__/reqtraceWorksheet.test.ts`

- [ ] **Step 1a: Fehlschlagende Worksheet-Tests.** Geblendet (inkl. Id-Fall), **kein SCF-Name im Blatt** (der Mensch darf nicht wissen, was „richtig" wäre), self-contained, Export schema-valide, Startzustand „unsicher".
- [ ] **Step 1b: Fehlschlag bestätigen**, dann Worksheet implementieren — Muster `pair-worksheet.ts`, aber die Einheit ist die **Maßnahme**: je gefundenem Positiv-Kandidat eine Karte — Maßnahmen-Beschreibung + die realisierten Systemanforderungen (geblendet) + genau eine Frage: *„Ist das eine Maßnahme, die man einmal baut?"* (ja / nein / unsicher, Notizfeld).
- [ ] **Step 1c: Grün + Commit** — `feat(the-545): Massnahmen-Arbeitsblatt fuer das menschliche Tor`
- [ ] **Step 2: Der echte Lauf** *(Mac, Schlüssel aus `.env`)*:

```bash
cd /Users/mac_macee/javis/packages/server && npm run reqtrace:eval -- --out ../../docs/evals/reqtrace-run-1.md
```

Erwartung: Bericht mit x/5, beiden Negativ-Kontrollen, Rate. **Bei einem Harness-Fehler reparieren und neu laufen; bei „trägt nicht" NICHT nachbessern** — das Verdikt ist das Ergebnis (Anti-Nachbesserungs-Anker wie beim Prompt-Freeze).

- [ ] **Step 3: 🧑 Tor 1 — Adjudikation.** `npm run reqtrace:worksheet` → der EA beantwortet die ≤5 Fragen (≈ 30 Minuten).
- [ ] **Step 4: 🧑 Tor 2 — Verdikt.** Gemeinsame Lesung des Berichts gegen die Abbruchbedingungen aus THE-545. Ergebnis (trägt / trägt nicht / trägt mit Auflagen) in `docs/evals/reqtrace-decision.md` — Aufbau wie `typed-relation-experiment.md`: Zahlen, Grenzen, eigene Fehler, Konsequenzen.
- [ ] **Step 5: Abschluss.** Kommentar an THE-545 (Zahlen + Verdikt), THE-545 auf Done; bei „trägt": THE-546 entblocken und REQs anlegen. RVTM-Häkchen, Commit, Push.

---

## Was dieser Plan bewusst NICHT tut

- Kein Mongoose-Modell, keine Migration, kein REQGEN-Umbau (THE-546, erst nach Entscheid).
- Kein EN-Text, keine weiteren Gesetze — der Ausschnitt sind die 9 Artikel der drei Kontrollen.
- Keine Potenzial-Messung („wie viele Maßnahmen gibt es insgesamt?" braucht den vollen Korpus).
- Kein zweiter Adjudikator — Grenze im Bericht, wie gehabt.

## Risiken mit Gegenmittel im Plan

| Risiko | Gegenmittel |
|---|---|
| EUR-Lex-Fetch liefert Navigations-Müll statt Artikeltext | Stichproben-Zitate als Test (Task 1 Step 1); Fixture wird eingefroren, nicht bei jedem Lauf geholt |
| Extraktion nicht-singulär in Serie | Split ist Teil der Pipeline und wird als `splitCount` gemessen — hohe Zahl = Befund über REQGEN-Granularität, kein Blocker |
| Lexikon zu scharf/zu lasch | Verstöße werden gezählt und benannt, nie still verworfen; Lexikon ist Datenzeile, kein Code |
| Alles landet in `intersects` (Richter-Kollaps) | Positiv-Probe „dieselbe Klausel zweimal" + Typ-Verteilung im Bericht (Kanarien-Disziplin aus THE-382) |
