# THE-438 Slice 1 — Handlungs-Katalog, Klassifikation, Konfidenzstufen

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pflichten aus verschiedenen Rechtsakten auf einen versionierten Katalog kanonischer Handlungen klassifizieren und gesetzesübergreifende Gruppen als **Vorschlag mit Konfidenzstufe und ausgewiesenem Delta** sichtbar machen — ohne Datenmodell-Änderung, ohne Auto-Merge.

**Architecture:** Der Katalog wird eine neue Facette `canonicalActions` in der bestehenden `NORM_ONTOLOGY` (Versionierung, CHANGELOG und Werteraum-Validierung sind dort schon gelöst). Die Klassifikation läuft über die vorhandene Rater-Abstraktion (`raterClient`), die Mehrhaus-Abstimmung und die drei Kontroll-Arme werden als Eval-Harness nach dem Muster von `runTypingEval` gebaut. Alles ist read-only und batch: es entsteht kein neuer Request-Pfad und kein Schreibzugriff auf `ComplianceRequirement`.

**Tech Stack:** TypeScript (Monorepo shared/server), Zod, Jest, Mongoose (nur lesend), `@anthropic-ai/sdk` + OpenRouter über `raterClient`.

**Linear:** THE-438 (REQ-REQHARM-001.0 · 001.2 · 001.2b) · Prämisse entschieden in THE-538

**RVTM:** `docs/superpowers/rvtm/2026-08-01-the438-slice1-action-catalog-rvtm.md`

---

## Kontext, den du brauchst (du kennst diese Codebasis nicht)

### Warum es diesen Slice gibt

Die Compliance-Pipeline erzeugt Requirements **pro Paragraph isoliert**. Fordern drei Gesetze dieselbe Maßnahme, entstehen drei Requirements. Der naheliegende Reflex — Textähnlichkeit — wurde gemessen und **scheitert**: lexikalisch (Jaccard max. 0,225, echter Treffer auf Rang 17) wie semantisch. Der Grund ist strukturell: Ähnlichkeitssuche vergleicht **Formulierungen**, die Frage ist aber, ob **eine Maßnahme beide Pflichten erfüllt**.

Was stattdessen trägt (THE-538, 2026-08-01, 219 Pflichten aus DSGVO × NIS2 × DORA):

- Jede Pflicht in ⟨**Handlung** · **Adressat** · **Modalität** · **Bedingung**⟩ zerlegen.
- Handlungen **frei** extrahieren: 219 Pflichten → 216 verschiedene Formulierungen. An der Oberfläche konvergiert nichts.
- Vokabular **bottom-up** ableiten: 216 Formulierungen → **26 kanonische Handlungen**. 218/219 zuordenbar. 13 Einträge tragen Pflichten aus mehr als einem Gesetz.
- Blinder Drei-Häuser-Richter: Positiv-Kontrolle 15/15 in allen drei Häusern, Negativ-Kontrolle 0/60 in allen drei Häusern, gesetzesübergreifend harmonisierbar 35 % (Mehrheit) / 18 % (einstimmig).

### Die zwei Lehren, die in Code gegossen werden müssen

Beide stammen aus einem Fehlschlag am selben Tag, bei dem drei Messungen nacheinander „0 Treffer" ergaben — **wegen des Messgeräts, nicht wegen der Daten**:

1. **Gesetzesnamen müssen geblendet werden.** Bei wortgleichem Pflichttext unter zwei Gesetzes-Etiketten urteilte der Richter 7/15 „verschiedene Sache" (Begründung: *„unterschiedliche Rechtsgüter"*). Geblendet: 15/15. → Task 3 baut die Blendung in den Prompt-Bauer und Task 3 testet, dass **kein** Gesetzesname durchrutscht.
2. **Jede Messung braucht eine Positiv-Kontrolle.** Ein Instrument, das nie „ja" sagt, sieht aus wie ein sauberes Instrument mit klarem Negativ-Befund. → Task 9 macht die Positiv-Kontrolle zur **Vorbedingung**: fällt sie unter 0,95, ist der ganze Lauf ungültig und Arm T wird gar nicht erst berichtet.

Siehe auch `packages/server/src/evals/RUBRIC.md`.

### Konventionen dieser Codebasis, die du einhalten musst

| Regel | Warum |
|---|---|
| **`packages/shared` hat keinen Test-Runner** (nur `build`/`lint`). Tests für shared-Logik liegen in `packages/server/src/__tests__/` und importieren aus `@thearchitect/shared`. | Etabliertes Muster — siehe Kopfkommentar von `packages/server/src/__tests__/interpretsAudit.test.ts`. |
| **shared muss vor server gebaut werden.** Bei Typfehlern oder `is not a function` zur Laufzeit: `packages/shared` clean bauen. | Stale `tsbuildinfo` maskiert Typfehler und liefert `undefined` für Wert-Importe. |
| **Prompts leben in `shared`**, nicht im Skript. | Eval und Produktionspfad müssen **byteidentische** Prompts benutzen, sonst misst der Eval etwas anderes als die Produktion. Vorbild: `packages/shared/src/typing/prompt.ts`. |
| **Kein `??` für Env-Fallbacks, immer `||`.** | Env-Variablen sind hier oft *vorhanden aber leer* (`FOO=`); `??` fällt bei `''` nicht durch. Steht so in `raterClient.ts`. |
| **Alle user-sichtbaren UI-Strings Englisch.** Code-Kommentare Deutsch (wie im Bestand). | Projektkonvention. |
| **Ontologie-Änderung = Datei-Edit + CHANGELOG-Eintrag + semver-Bump.** Kein Enum im Kern. | ADR-0004 E6. |

### Was du NICHT tust

- **Kein** `legalBases[]`, keine N:M-Umstellung, keine Migration. Das ist REQ-001.1 und kommt erst, wenn dieser Slice sich im Gebrauch trägt.
- **Kein** Auto-Merge, kein Schreiben auf `ComplianceRequirement`. κ liegt zwischen 0,308 und 0,697 — unter dem Kohärenz-Tor 0,80. Das System darf **vorschlagen, nicht behaupten**.
- **Kein** Einebnen von Adressat/Frist/Schwelle. Diese Abweichungen sind der Grund, warum jede Norm eigene Rechtsgrundlage bleibt.

---

## Dateistruktur

**shared — Katalog, Typen, Prompts (eine Verantwortung je Datei):**

| Datei | Verantwortung |
|---|---|
| `packages/shared/src/ontology/norm-ontology.v1.ts` *(ändern)* | Facette `canonicalActions` + Bump 1.7.0 → **1.8.0** |
| `packages/shared/src/ontology/norm-ontology.schema.ts` *(ändern)* | `CanonicalActionEntry`, Feld im `NormOntologySchema`, `CanonicalActionSchema` |
| `packages/shared/src/ontology/index.ts` *(ändern)* | `CANONICAL_ACTION_IDS`, `isCanonicalAction`, Typ `CanonicalActionId` |
| `packages/shared/src/ontology/CHANGELOG.md` *(ändern)* | Eintrag 1.8.0 |
| `packages/shared/src/obligations/slots.ts` *(neu)* | Slot-Typ ⟨Handlung·Adressat·Modalität·Bedingung⟩ + Zod |
| `packages/shared/src/obligations/prompt.ts` *(neu)* | Prompt-Bauer für Zerlegung + Klassifikation + **Blendung** |
| `packages/shared/src/obligations/index.ts` *(neu)* | Barrel |

**server — Dienst, Skripte, Messung:**

| Datei | Verantwortung |
|---|---|
| `packages/server/src/services/obligationAction.service.ts` *(neu)* | Eine Pflicht → eine kanonische Handlung (Rater injiziert) |
| `packages/server/src/evals/actionMetrics.ts` *(neu)* | **Rein**, kein I/O: Arm-Quoten, Kappa, Mehrheitsvotum, Konfidenzstufe |
| `packages/server/src/evals/actionGolden.ts` *(neu)* | Prüfsatz-Schema (Arme P/T/K) + Loader |
| `packages/server/src/evals/runActionEval.ts` *(neu)* | Drei-Arme-Harness, `judge` injiziert |
| `packages/server/src/evals/golden/actions.v1.json` *(neu)* | Eingefrorener Prüfsatz |
| `packages/server/src/scripts/obligation-slots.ts` *(neu)* | Pflichten aus DB → Slots (Batch) |
| `packages/server/src/scripts/derive-action-catalog.ts` *(neu)* | Slots → Katalog-**Vorschlag** zur Adjudikation |
| `packages/server/src/scripts/classify-obligations.ts` *(neu)* | Pflichten → Handlung, Abdeckungs- und „keine"-Quote |

**Tests** (alle in `packages/server/src/__tests__/`): `canonicalActions.test.ts`, `obligationSlots.test.ts`, `obligationPrompt.test.ts`, `actionMetrics.test.ts`, `obligationAction.service.test.ts`, `runActionEval.test.ts`.

---

## Chunk 1: Katalog als Ontologie-Facette (REQ-REQHARM-001.0)

### Task 1: Facette `canonicalActions` in der Ontologie

Der Katalog wird **nicht** als eigene Struktur gebaut. Er wird eine Facette der bestehenden `NORM_ONTOLOGY` — damit sind Versionierung, Werteraum-Prüfung, abgeleitete ID-Unions und der OntoLearner-Export ohne Zusatzarbeit erledigt. Das ist genau die Bedeutung von „Katalog einfrieren": die `ontologyVersion` **ist** die Katalog-Version.

**Files:**
- Modify: `packages/shared/src/ontology/norm-ontology.schema.ts`
- Modify: `packages/shared/src/ontology/norm-ontology.v1.ts`
- Modify: `packages/shared/src/ontology/index.ts`
- Modify: `packages/shared/src/ontology/CHANGELOG.md`
- Test: `packages/server/src/__tests__/canonicalActions.test.ts`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

```ts
/**
 * Tests für die Ontologie-Facette `canonicalActions` (THE-438 Slice 1, Task 1).
 * shared trägt keine eigenen Tests — der Testort ist der Server (Muster wie
 * interpretsAudit.test.ts).
 *
 * Die Facette ist der eingefrorene Handlungs-Katalog aus THE-538. Sie ist der
 * Bezugspunkt der Harmonisierung: zwei Pflichten sind Kandidaten, wenn sie auf
 * DENSELBEN Eintrag zeigen — nicht, wenn ihre Texte einander ähneln.
 */
import {
  NORM_ONTOLOGY,
  CANONICAL_ACTION_IDS,
  isCanonicalAction,
  CanonicalActionSchema,
  assertOntologyValid,
} from '@thearchitect/shared';

describe('canonicalActions (THE-438)', () => {
  it('ships a valid ontology with the new facet', () => {
    expect(() => assertOntologyValid()).not.toThrow();
    expect(NORM_ONTOLOGY.canonicalActions.length).toBeGreaterThanOrEqual(20);
  });

  it('derives the id set from the data (no parallel enum)', () => {
    expect(CANONICAL_ACTION_IDS).toEqual(NORM_ONTOLOGY.canonicalActions.map((a) => a.id));
  });

  it('accepts in-catalogue ids and rejects invented ones', () => {
    expect(CanonicalActionSchema.safeParse('vorfall-melden-behoerde').success).toBe(true);
    expect(CanonicalActionSchema.safeParse('erfundene-handlung').success).toBe(false);
    expect(isCanonicalAction('technisch-organisatorische-massnahmen')).toBe(true);
    expect(isCanonicalAction('')).toBe(false);
  });

  it('gives every entry a description — the classifier prompt is built from it', () => {
    for (const a of NORM_ONTOLOGY.canonicalActions) {
      expect(a.description.trim().length).toBeGreaterThan(10);
    }
  });

  it('bumped the ontology version (the catalogue version IS the ontology version)', () => {
    const [major, minor] = NORM_ONTOLOGY.ontologyVersion.split('.').map(Number);
    expect(major).toBe(1);
    expect(minor).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
npm test --workspace @thearchitect/server -- canonicalActions
```
Erwartet: FAIL — `CANONICAL_ACTION_IDS` ist kein Export.

- [ ] **Step 3: Schema erweitern**

In `norm-ontology.schema.ts`, direkt nach `const IdLabel = …` (Zeile 26):

```ts
/**
 * E6 — kanonische Handlung: die gesetzesneutrale MASSNAHME, auf die eine Pflicht
 * zeigt. Bezugsgröße der Harmonisierung (THE-438/THE-538). `description` ist
 * nicht dekorativ — der Klassifikations-Prompt wird daraus gebaut, deshalb
 * erzwingt das Schema eine echte Länge.
 */
const CanonicalActionEntry = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(11),
});
```

Im `NormOntologySchema` nach `partyRoles`:

```ts
  canonicalActions: z.array(CanonicalActionEntry).min(1),
```

Am Ende bei den Member-Schemas (neben `ObligationKindSchema`):

```ts
const canonicalActionIds = NORM_ONTOLOGY.canonicalActions.map((a) => a.id);
export const CanonicalActionSchema = makeMemberSchema(canonicalActionIds, 'canonicalActions');
```

- [ ] **Step 4: Facette einfügen und Version bumpen**

In `norm-ontology.v1.ts`: `ontologyVersion: '1.8.0'`, `updatedAt: '2026-08-01'`. Nach `partyRoles` die Facette einfügen — die 26 Einträge stammen aus der THE-538-Ableitung (`vocab.json`), Reihenfolge unverändert übernehmen:

```ts
  /**
   * E6 — kanonische Handlungen: die gesetzesneutralen MASSNAHMEN, auf die
   * Pflichten zeigen. Bezugsgröße der Harmonisierung (THE-438).
   *
   * HERKUNFT: nicht handgebaut und nicht von ISO/NIST übernommen, sondern aus
   * dem Korpus ABGELEITET (THE-538, 2026-08-01): 219 Pflichten aus DSGVO ×
   * NIS2 × DORA → Slot-Zerlegung → 216 freie Handlungs-Formulierungen →
   * bottom-up-Vokabular. 218/219 waren zuordenbar. Das Verfahren ist als
   * `npm run actions:derive` wiederholbar — der Katalog ist deshalb
   * FORTSCHREIBBAR, nicht endgültig.
   *
   * GRANULARITÄT ist der springende Punkt: grob genug, dass verschiedene
   * Gesetze denselben Eintrag treffen können — fein genug, dass der Eintrag
   * eine umsetzbare Maßnahme bleibt. Zu grob erzeugt Compliance-FEHLER (zwei
   * Meldepflichten mit verschiedenen Adressaten und Fristen als „dieselbe
   * Pflicht" auszuweisen wäre ein solcher). Deshalb prüft der Eval eine
   * NEGATIV-Kontrolle: Pflichten verschiedener Handlungen dürfen NIE als
   * gemeinsam erfüllbar durchgehen (gemessen: 0/60 in drei Modell-Häusern).
   */
  canonicalActions: [
    { id: 'rechtsgrundlage-dokumentieren', label: 'Establish and document legal basis', description: 'Rechtsgrundlage der Verarbeitung festlegen und nachweisbar dokumentieren.' },
    // … alle 26 Einträge aus vocab.json, id + label(EN) + description(DE)
  ],
```

> **Für den Umsetzer:** Die vollständige Liste liegt in `vocab.json` der THE-538-Messung (Scratchpad, im Ticket-Kommentar referenziert). `label` ist **englisch** (user-sichtbar), `description` deutsch (Prompt-/Doku-Text, wie der Bestand). Übernimm die ids **wörtlich** — sie sind bereits in gemessenen Ergebnissen referenziert.

- [ ] **Step 5: Abgeleitete Exporte ergänzen**

In `index.ts` — im Export-Block aus `./norm-ontology.schema` `CanonicalActionSchema` ergänzen, dann:

```ts
export const CANONICAL_ACTION_IDS = NORM_ONTOLOGY.canonicalActions.map((a) => a.id);
const CANONICAL_ACTION_ID_SET = new Set<string>(CANONICAL_ACTION_IDS);
export const isCanonicalAction = (v: string): boolean => CANONICAL_ACTION_ID_SET.has(v);
export type CanonicalActionId = (typeof NORM_ONTOLOGY.canonicalActions)[number]['id'];
```

- [ ] **Step 6: CHANGELOG-Eintrag**

Oberhalb von `## 1.7.0`:

```markdown
## 1.8.0 — 2026-08-01 (THE-438 / THE-538)

- **canonicalActions** NEU (26 Einträge) — additive Facette, keine bestehende id berührt.
  Bezugsgröße der Requirement-Harmonisierung. Auslöser ist wie bei 1.6.0/1.7.0 eine
  **Messung**, keine Meinung: drei Verfahren, die Pflichten über ihre FORMULIERUNG
  vergleichen (Jaccard, Embedding-Paare, gröbere Granularität), fanden 0 Treffer.
  Die Zerlegung in ⟨Handlung·Adressat·Modalität·Bedingung⟩ und ein aus dem Korpus
  ABGELEITETES Handlungs-Vokabular trennen dagegen sauber: gleiche kanonische
  Handlung 35 % gemeinsam erfüllbar (Mehrheit dreier Modell-Häuser), verschiedene
  Handlung **0/60 in jedem Haus**.
  Kappa zwischen den Häusern liegt bei 0,308–0,697 und damit unter dem Tor 0,80 —
  die Facette trägt deshalb **Vorschläge, keine Behauptungen**: kein Auto-Merge.
```

- [ ] **Step 7: shared bauen, Test grün**

```bash
npm run build --workspace @thearchitect/shared && npm test --workspace @thearchitect/server -- canonicalActions
```
Erwartet: PASS (5 Tests). Bei `is not a function`: `rm -rf packages/shared/dist packages/shared/tsconfig.tsbuildinfo` und neu bauen.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/ontology packages/server/src/__tests__/canonicalActions.test.ts && git commit -m "feat(the-438): canonicalActions als Ontologie-Facette (1.8.0) — Bezugsgröße der Harmonisierung"
```

---

### Task 2: Slot-Typ in shared

**Files:**
- Create: `packages/shared/src/obligations/slots.ts`
- Create: `packages/shared/src/obligations/index.ts`
- Modify: `packages/shared/src/index.ts` (Barrel-Re-Export, dem Bestand folgen)
- Test: `packages/server/src/__tests__/obligationSlots.test.ts`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

```ts
import { ObligationSlotsSchema, type ObligationSlots } from '@thearchitect/shared';

describe('ObligationSlots (THE-438)', () => {
  const valid: ObligationSlots = {
    handlung: 'Sicherheitsvorfall an die zuständige Behörde melden',
    adressat: 'Verantwortlicher',
    modalitaet: 'pflicht',
    bedingung: 'binnen 72 Stunden nach Kenntnis',
  };

  it('accepts a full decomposition', () => {
    expect(ObligationSlotsSchema.safeParse(valid).success).toBe(true);
  });

  it('requires an action — it is the slot harmonisation lives on', () => {
    expect(ObligationSlotsSchema.safeParse({ ...valid, handlung: '' }).success).toBe(false);
  });

  it('allows an unstated addressee or condition without dropping the record', () => {
    // Nicht jede Pflicht nennt beides. Ein fehlender Wert ist eine ECHTE
    // Beobachtung und darf den Datensatz nicht ungültig machen — sonst
    // verlieren wir genau die Pflichten, deren Delta wir ausweisen wollen.
    const r = ObligationSlotsSchema.safeParse({ ...valid, adressat: '—', bedingung: '—' });
    expect(r.success).toBe(true);
  });

  it('constrains modality to the deontic values, mirroring obligationKinds', () => {
    expect(ObligationSlotsSchema.safeParse({ ...valid, modalitaet: 'pflicht' }).success).toBe(true);
    expect(ObligationSlotsSchema.safeParse({ ...valid, modalitaet: 'vielleicht' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

```bash
npm test --workspace @thearchitect/server -- obligationSlots
```
Erwartet: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Implementieren**

`packages/shared/src/obligations/slots.ts`:

```ts
/**
 * Slot-Zerlegung einer Pflicht (THE-438 Slice 1).
 *
 * WARUM VIER SLOTS UND NICHT EIN TEXT: Harmonisierung lebt auf genau EINEM
 * davon — der `handlung`. `adressat` und `bedingung` sind die
 * ABWEICHUNGSTRÄGER: sie werden ausgewiesen, nie eingeebnet. Würde man sie
 * wegmitteln, entstünde der Compliance-Fehler, den die Negativ-Kontrolle des
 * Evals gerade verhindern soll (zwei Meldepflichten mit verschiedenen
 * Behörden und Fristen sind NICHT dieselbe Pflicht). `modalitaet` ist Filter.
 *
 * Zwei der vier Slots hat die Ontologie schon: `partyRole` ≙ adressat,
 * `obligationKind` ≙ modalitaet. Sie werden hier als Freitext geführt, weil die
 * Zerlegung dem Gesetzestext folgt und nicht in einen Werteraum gezwungen
 * werden darf — ein erzwungener Wert ist der Hauptfehlermodus (Schema-Blindheit).
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import { z } from 'zod';

/** Ein nicht genannter Slot wird als '—' geführt, nicht weggelassen. */
export const SLOT_UNSTATED = '—';

export const OBLIGATION_MODALITIES = ['pflicht', 'verbot', 'erlaubnis'] as const;
export type ObligationModality = (typeof OBLIGATION_MODALITIES)[number];

export const ObligationSlotsSchema = z.object({
  /** Die Maßnahme. Einziger Slot, auf dem Harmonisierung stattfindet. */
  handlung: z.string().min(1),
  /** Wer verpflichtet ist. Abweichungsträger — wird ausgewiesen, nie eingeebnet. */
  adressat: z.string().min(1),
  modalitaet: z.enum(OBLIGATION_MODALITIES),
  /** Frist, Schwelle, Auslöser. Abweichungsträger wie `adressat`. */
  bedingung: z.string().min(1),
});

export type ObligationSlots = z.infer<typeof ObligationSlotsSchema>;
```

`packages/shared/src/obligations/index.ts`:

```ts
export * from './slots';
export * from './prompt';
```

> **Hinweis:** `./prompt` entsteht erst in Task 3. Lege in diesem Schritt eine leere `prompt.ts` mit `export {};` an, damit der Build durchläuft, und ersetze sie in Task 3.

Im Haupt-Barrel `packages/shared/src/index.ts` dem bestehenden Muster folgend `export * from './obligations';` ergänzen.

- [ ] **Step 4: Test grün**

```bash
npm run build --workspace @thearchitect/shared && npm test --workspace @thearchitect/server -- obligationSlots
```
Erwartet: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/obligations packages/shared/src/index.ts packages/server/src/__tests__/obligationSlots.test.ts && git commit -m "feat(the-438): Slot-Typ für Pflicht-Zerlegung (Handlung/Adressat/Modalität/Bedingung)"
```

---

### Task 3: Prompt-Bauer mit erzwungener Blendung

Der wichtigste Task des Chunks. Die Blendung ist keine Stilfrage — ohne sie urteilt das Modell über das Gesetzes-Etikett statt über den Text (gemessen: 7/15 gegen 15/15).

**Files:**
- Create: `packages/shared/src/obligations/prompt.ts` (ersetzt den Stub aus Task 2)
- Test: `packages/server/src/__tests__/obligationPrompt.test.ts`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

```ts
import {
  buildSlotUserPrompt,
  buildClassifyUserPrompt,
  buildPairJudgeUserPrompt,
  parseSlots,
  parseActionAssignment,
  SLOT_SYSTEM,
  CLASSIFY_SYSTEM,
  PAIR_JUDGE_SYSTEM,
  NO_ACTION,
} from '@thearchitect/shared';

const oblA = { law: 'DSGVO', para: 'Art. 33', title: 'Meldung an die Aufsichtsbehörde', text: 'Der Verantwortliche meldet die Verletzung binnen 72 Stunden.' };
const oblB = { law: 'NIS2', para: 'Art. 23', title: 'Berichtspflichten', text: 'Die Einrichtung meldet erhebliche Sicherheitsvorfälle an das CSIRT.' };

describe('obligation prompts (THE-438)', () => {
  it('BLINDS law names in the pair judge — the decisive guarantee', () => {
    // Gemessen (THE-538): ungeblendet urteilte der Richter bei WORTGLEICHEM
    // Text unter zwei Gesetzes-Etiketten 7/15 "verschiedene Sache", begründet
    // mit "unterschiedliche Rechtsgüter". Geblendet: 15/15.
    const p = buildPairJudgeUserPrompt(oblA, oblB);
    expect(p).not.toMatch(/DSGVO|NIS2|DORA|Art\. 33|Art\. 23/);
    expect(p).toContain('Rechtsakt X');
    expect(p).toContain('Rechtsakt Y');
    expect(p).toContain(oblA.text);
    expect(p).toContain(oblB.text);
  });

  it('blinds regardless of where the law name appears', () => {
    const sneaky = { ...oblA, title: 'DSGVO-Meldung', text: 'Nach DORA Art. 19 zu melden.' };
    const p = buildPairJudgeUserPrompt(sneaky, oblB);
    expect(p).not.toMatch(/\bDSGVO\b|\bDORA\b|\bNIS2\b/);
  });

  it('offers "no matching action" as a first-class answer in the classifier', () => {
    // Ein erzwungener Katalog-Treffer ist der Hauptfehlermodus. Die Option
    // muss im Prompt STEHEN, nicht nur im Parser erlaubt sein.
    expect(CLASSIFY_SYSTEM).toContain(NO_ACTION);
    expect(parseActionAssignment(`{"id":"${NO_ACTION}"}`)).toEqual({ actionId: null });
  });

  it('rejects an invented action id instead of passing it through', () => {
    expect(parseActionAssignment('{"id":"erfunden"}')).toBeNull();
  });

  it('parses a slot decomposition and survives fenced JSON', () => {
    const raw = '```json\n{"handlung":"melden","adressat":"Verantwortlicher","modalitaet":"pflicht","bedingung":"72h"}\n```';
    expect(parseSlots(raw)?.handlung).toBe('melden');
  });

  it('returns null on unparseable rater output rather than throwing', () => {
    expect(parseSlots('ich bin mir nicht sicher')).toBeNull();
    expect(parseActionAssignment('')).toBeNull();
  });

  it('builds the classifier prompt from the ontology descriptions', () => {
    expect(buildClassifyUserPrompt(oblA)).toContain(oblA.text);
    expect(CLASSIFY_SYSTEM).toContain('vorfall-melden-behoerde');
  });

  it('keeps the slot prompt free of a predefined action vocabulary', () => {
    // Erst FREI extrahieren, dann Vokabular ableiten. Gibt man die Liste vor,
    // misst man die Liste und nicht den Korpus.
    expect(SLOT_SYSTEM).not.toContain('vorfall-melden-behoerde');
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

```bash
npm test --workspace @thearchitect/server -- obligationPrompt
```
Erwartet: FAIL — Exporte fehlen.

- [ ] **Step 3: Implementieren**

`packages/shared/src/obligations/prompt.ts`:

```ts
/**
 * Prompt-Bauer für die Pflicht-Zerlegung, die Klassifikation und den
 * Paar-Richter (THE-438 Slice 1).
 *
 * WARUM HIER UND NICHT IM SKRIPT: Eval und Produktionspfad müssen byteidentische
 * Prompts benutzen, sonst misst der Eval etwas anderes als die Produktion.
 * Vorbild: `packages/shared/src/typing/prompt.ts`.
 *
 * DIE BLENDUNG IST DIE ZENTRALE GARANTIE dieses Moduls. Trägt der Prompt
 * Gesetzesnamen, urteilt das Modell über das Etikett statt über den Text —
 * gemessen (THE-538): wortgleicher Pflichttext unter zwei Etiketten ergab 7/15
 * "verschiedene Sache" mit der Begründung "unterschiedliche Rechtsgüter";
 * geblendet 15/15. `blindLawNames` läuft deshalb über JEDES Feld, nicht nur
 * über das Label.
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import { NORM_ONTOLOGY, isCanonicalAction } from '../ontology';
import { ObligationSlotsSchema, type ObligationSlots } from './slots';

/** Antwortwert des Klassifikators, wenn keine Katalog-Handlung passt. */
export const NO_ACTION = 'keine';

export interface ObligationRef {
  law: string;
  para: string;
  title: string;
  text: string;
}

/**
 * Namen und Fundstellen, die die Herkunft verraten. Wird aus dem Korpus
 * gespeist und bewusst großzügig gehalten: ein zu viel geblendeter Begriff
 * kostet nichts, ein durchgerutschter verfälscht die Messung.
 */
const LAW_NAME_PATTERN =
  /\b(DSGVO|GDPR|NIS-?2|NIS|DORA|AI[- ]?Act|KI-?VO|CRA|ePrivacy|eIDAS|MDR|LkSG|CSRD|ESRS|UNECE|Data[- ]Act)\b/gi;
const CITATION_PATTERN = /\b(Art(?:ikel)?\.?|§+)\s*\d+[a-z]?\b/gi;

/** Entfernt Gesetzesnamen und Fundstellen aus einem Textstück. */
export function blindLawNames(s: string): string {
  return s.replace(LAW_NAME_PATTERN, 'dem Rechtsakt').replace(CITATION_PATTERN, 'der Bestimmung');
}

// ─── 1. Zerlegung ────────────────────────────────────────────────────────
export const SLOT_SYSTEM = `Du zerlegst eine regulatorische Pflicht in vier Bestandteile.

- handlung:   WAS getan werden muss — die Maßnahme, gesetzesneutral formuliert.
- adressat:   WER verpflichtet ist. Nicht genannt: "${'—'}".
- modalitaet: "pflicht", "verbot" oder "erlaubnis".
- bedingung:  WANN/UNTER WELCHEN UMSTÄNDEN — Frist, Schwelle, Auslöser. Nicht genannt: "${'—'}".

Formuliere die Handlung mit deinen eigenen Worten. Es gibt KEINE Vorgabeliste.

Antworte NUR mit JSON: {"handlung":"...","adressat":"...","modalitaet":"...","bedingung":"..."}`;

export function buildSlotUserPrompt(o: ObligationRef): string {
  return `Titel: ${o.title}\n\n${o.text}`;
}

// ─── 2. Klassifikation ───────────────────────────────────────────────────
const CATALOGUE = NORM_ONTOLOGY.canonicalActions
  .map((a) => `${a.id}: ${a.label} — ${a.description}`)
  .join('\n');

export const CLASSIFY_SYSTEM = `Ordne die Pflicht GENAU EINER kanonischen Handlung zu.

KATALOG:
${CATALOGUE}

Regeln:
- Wähle den Eintrag, der die MASSNAHME trifft — nicht das Thema.
- Passt kein Eintrag wirklich: "${NO_ACTION}". Das ist ausdrücklich erlaubt und
  wichtig. Erzwinge nichts; ein falsch erzwungener Treffer ist schlimmer als
  eine offene Zuordnung.
- Bei mehreren plausiblen Einträgen: den spezifischeren.

Antworte NUR mit JSON: {"id":"<katalog-id oder ${NO_ACTION}>"}`;

export function buildClassifyUserPrompt(o: ObligationRef): string {
  return `Titel: ${o.title}\n\n${o.text}`;
}

// ─── 3. Paar-Richter ─────────────────────────────────────────────────────
export const PAIR_JUDGE_SYSTEM = `Du bist Compliance-Jurist und berätst ein Unternehmen bei der UMSETZUNG.

Zwei Pflichten aus verschiedenen Rechtsakten. Entscheide EINE Frage:
Lässt sich das mit EINER gemeinsam betriebenen Maßnahme abdecken — auch wenn
Adressat, Frist oder Schwelle je Rechtsakt unterschiedlich parametriert werden müssen?

Denk an die Umsetzung, nicht an den Rechtstext:
- JA, wenn EIN Prozess/System beide bedient und die Unterschiede reine Parameter sind
  (z.B. eine Meldekette, die je nach Norm an andere Behörde und in anderer Frist auslöst).
- NEIN, wenn zwei getrennte Maßnahmen nötig sind, weil Inhalt, Schutzgut oder
  auszuführende Tätigkeit verschieden sind — nicht nur der Empfänger oder die Frist.
Im Zweifel NEIN.

Antworte NUR mit JSON: {"same": true|false, "delta": "<abweichende Parameter, oder '—'>", "why": "<ein knapper Satz>"}`;

export function buildPairJudgeUserPrompt(a: ObligationRef, b: ObligationRef): string {
  const side = (o: ObligationRef, label: string): string =>
    `${label}\nTitel: ${blindLawNames(o.title)}\n${blindLawNames(o.text)}`;
  return `${side(a, 'A) Rechtsakt X, Bestimmung 1')}\n\n${side(b, 'B) Rechtsakt Y, Bestimmung 2')}`;
}

// ─── Parser ──────────────────────────────────────────────────────────────
function firstJsonObject(raw: string): unknown | null {
  const m = raw.replace(/^```json\s*|\s*```$/g, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export function parseSlots(raw: string): ObligationSlots | null {
  const obj = firstJsonObject(raw);
  if (!obj) return null;
  const r = ObligationSlotsSchema.safeParse(obj);
  return r.success ? r.data : null;
}

/** `{ actionId: null }` bedeutet "keine passende Handlung" — ein gültiges Ergebnis. */
export function parseActionAssignment(raw: string): { actionId: string | null } | null {
  const obj = firstJsonObject(raw) as { id?: unknown } | null;
  if (!obj || typeof obj.id !== 'string') return null;
  if (obj.id === NO_ACTION) return { actionId: null };
  return isCanonicalAction(obj.id) ? { actionId: obj.id } : null;
}

export interface PairVerdict {
  same: boolean;
  delta: string;
  why: string;
}

export function parsePairVerdict(raw: string): PairVerdict | null {
  const o = firstJsonObject(raw) as Partial<PairVerdict> | null;
  if (!o || typeof o.same !== 'boolean') return null;
  return { same: o.same, delta: String(o.delta ?? '—'), why: String(o.why ?? '') };
}
```

- [ ] **Step 4: Test grün**

```bash
npm run build --workspace @thearchitect/shared && npm test --workspace @thearchitect/server -- obligationPrompt
```
Erwartet: PASS (8 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/obligations/prompt.ts packages/server/src/__tests__/obligationPrompt.test.ts && git commit -m "feat(the-438): Prompt-Bauer mit erzwungener Gesetzesnamen-Blendung"
```

---

## Chunk 2: Klassifikation (REQ-REQHARM-001.2)

### Task 4: Klassifikations-Dienst

**Files:**
- Create: `packages/server/src/services/obligationAction.service.ts`
- Test: `packages/server/src/__tests__/obligationAction.service.test.ts`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

Der Rater wird **injiziert** — kein Live-LLM im Test. Muster: `runTypingEval`.

```ts
import { classifyObligation, classifyObligations } from '../services/obligationAction.service';
import { NORM_ONTOLOGY } from '@thearchitect/shared';

const obl = { law: 'DSGVO', para: 'Art. 33', title: 'Meldung', text: 'binnen 72 Stunden melden' };
const stub = (reply: string) => async () => reply;

describe('obligationAction.service (THE-438)', () => {
  it('returns the assigned action and stamps the ontology version', async () => {
    const r = await classifyObligation(obl, stub('{"id":"vorfall-melden-behoerde"}'));
    expect(r.actionId).toBe('vorfall-melden-behoerde');
    // Ohne Katalog-Version ist ein Ergebnis später nicht mehr interpretierbar.
    expect(r.ontologyVersion).toBe(NORM_ONTOLOGY.ontologyVersion);
  });

  it('treats "no matching action" as a result, not a failure', async () => {
    const r = await classifyObligation(obl, stub('{"id":"keine"}'));
    expect(r.actionId).toBeNull();
    expect(r.unparseable).toBe(false);
  });

  it('distinguishes an unparseable answer from a deliberate "none"', async () => {
    // Beides auf null zu mappen würde die "keine"-Quote verfälschen — und die
    // ist die Kennzahl, an der Schema-Blindheit sichtbar wird.
    const r = await classifyObligation(obl, stub('kaputt'));
    expect(r.actionId).toBeNull();
    expect(r.unparseable).toBe(true);
  });

  it('reports coverage and the none-rate over a batch', async () => {
    const replies = ['{"id":"vorfall-melden-behoerde"}', '{"id":"keine"}', 'kaputt'];
    let i = 0;
    const res = await classifyObligations([obl, obl, obl], async () => replies[i++]);
    expect(res.stats).toEqual({ total: 3, assigned: 1, none: 1, unparseable: 1 });
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

```bash
npm test --workspace @thearchitect/server -- obligationAction.service
```

- [ ] **Step 3: Implementieren**

```ts
/**
 * obligationAction.service — ordnet eine Pflicht einer kanonischen Handlung zu
 * (THE-438 Slice 1, REQ-REQHARM-001.2).
 *
 * READ-ONLY: dieser Dienst schreibt NICHTS. Er ersetzt die Ähnlichkeitssuche aus
 * dem ursprünglichen Bauplan (THE-538: Ähnlichkeit vergleicht Formulierungen,
 * nicht Maßnahmen).
 *
 * `ask` ist INJIZIERT, damit der Dienst ohne Live-LLM testbar ist und damit der
 * Eval denselben Codepfad fährt wie die Produktion. In der Produktion kommt der
 * Aufrufer aus `raterClient` (der löst Reasoning-Budget und Leer-Antwort-Retry
 * bereits — nicht neu bauen).
 *
 * WARUM `unparseable` GETRENNT VON `actionId: null`: "keine passende Handlung"
 * ist ein Befund über den Katalog, eine kaputte Antwort ein Befund über den
 * Lauf. Zusammengeworfen verfälschen sie die "keine"-Quote — und genau die
 * zeigt an, ob der Katalog Lücken hat oder das Modell Treffer erzwingt.
 *
 * Linear: THE-438
 */
import {
  NORM_ONTOLOGY,
  CLASSIFY_SYSTEM,
  buildClassifyUserPrompt,
  parseActionAssignment,
  type ObligationRef,
} from '@thearchitect/shared';

export type AskFn = (system: string, user: string) => Promise<string>;

export interface ActionAssignment {
  actionId: string | null;
  unparseable: boolean;
  ontologyVersion: string;
}

export async function classifyObligation(o: ObligationRef, ask: AskFn): Promise<ActionAssignment> {
  const raw = await ask(CLASSIFY_SYSTEM, buildClassifyUserPrompt(o));
  const parsed = parseActionAssignment(raw);
  return {
    actionId: parsed?.actionId ?? null,
    unparseable: parsed === null,
    ontologyVersion: NORM_ONTOLOGY.ontologyVersion,
  };
}

export interface BatchStats {
  total: number;
  assigned: number;
  none: number;
  unparseable: number;
}

export async function classifyObligations(
  obligations: ObligationRef[],
  ask: AskFn,
): Promise<{ assignments: ActionAssignment[]; stats: BatchStats }> {
  const assignments: ActionAssignment[] = [];
  for (const o of obligations) assignments.push(await classifyObligation(o, ask));
  return {
    assignments,
    stats: {
      total: assignments.length,
      assigned: assignments.filter((a) => a.actionId !== null).length,
      none: assignments.filter((a) => a.actionId === null && !a.unparseable).length,
      unparseable: assignments.filter((a) => a.unparseable).length,
    },
  };
}
```

- [ ] **Step 4: Test grün**

```bash
npm test --workspace @thearchitect/server -- obligationAction.service
```
Erwartet: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/obligationAction.service.ts packages/server/src/__tests__/obligationAction.service.test.ts && git commit -m "feat(the-438): Klassifikations-Dienst Pflicht → kanonische Handlung"
```

---

### Task 5: Batch-Skripte (Zerlegung, Ableitung, Klassifikation)

Drei dünne Glue-Skripte über bereits getestete Bausteine. Sie lesen aus MongoDB und schreiben **nur** JSON-Dateien.

**Files:**
- Create: `packages/server/src/scripts/obligation-slots.ts`
- Create: `packages/server/src/scripts/derive-action-catalog.ts`
- Create: `packages/server/src/scripts/classify-obligations.ts`
- Modify: `packages/server/package.json` (npm-Aliasse)

- [ ] **Step 1: Skripte schreiben**

Folge dem Aufbau von `packages/server/src/scripts/prelabel-typing.ts` (Argument-Parsing, `resolveRaterConfig`, `createRaterClient`, `withEmptyResponseRetry`). Kernpunkte je Skript:

| Skript | Eingabe | Ausgabe | Besonderheit |
|---|---|---|---|
| `obligation-slots.ts` | `ComplianceRequirement`-Dokumente eines Projekts (`--project <id>`) | `slots.<projekt>.json` | Nutzt `SLOT_SYSTEM` — **ohne** Katalog im Prompt |
| `derive-action-catalog.ts` | Slot-Datei | `action-catalog.proposal.json` | Schreibt einen **Vorschlag** zur menschlichen Adjudikation, **nie** direkt in die Ontologie |
| `classify-obligations.ts` | Pflichten + eingefrorener Katalog | `assignments.<projekt>.json` + Statistik auf stderr | Gibt Abdeckungs- und „keine"-Quote aus |

- [ ] **Step 2: npm-Aliasse ergänzen**

In `packages/server/package.json` bei den bestehenden `relations:*`-Aliassen:

```json
"actions:slots": "ts-node src/scripts/obligation-slots.ts",
"actions:derive": "ts-node src/scripts/derive-action-catalog.ts",
"actions:classify": "ts-node src/scripts/classify-obligations.ts"
```

> Übernimm den Runner (`ts-node` o. ä.) **wörtlich** von den bestehenden `relations:*`-Einträgen — nicht raten.

- [ ] **Step 3: Rauchtest gegen ein Projekt**

```bash
npm run actions:classify --workspace @thearchitect/server -- --project <projectId> --limit 20
```
Erwartet auf stderr: `total=20 assigned=… none=… unparseable=0`.

> **Interpretationsregel:** `unparseable > 0` ist ein Lauf-Fehler (Budget/Retry prüfen). Eine **sehr niedrige** `none`-Quote bei einem Korpus außerhalb von DSGVO/NIS2/DORA ist ein **Warnzeichen**, kein Erfolg — sie deutet auf erzwungene Treffer. In der THE-538-Messung lag sie bei 0,5 %, und das war der Anlass, überhaupt zu kontrollieren.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/scripts/obligation-slots.ts packages/server/src/scripts/derive-action-catalog.ts packages/server/src/scripts/classify-obligations.ts packages/server/package.json && git commit -m "feat(the-438): Batch-Skripte für Zerlegung, Katalog-Ableitung und Klassifikation"
```

---

## Chunk 3: Kontrollen und Konfidenzstufen (REQ-REQHARM-001.2b)

### Task 6: Metriken — rein, ohne I/O

Hier steckt die eigentliche Lehre des Tages als Code: die **Positiv-Kontrolle ist Vorbedingung**, nicht Beiwerk.

**Files:**
- Create: `packages/server/src/evals/actionMetrics.ts`
- Test: `packages/server/src/__tests__/actionMetrics.test.ts`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

```ts
import { cohensKappa, tierFor, armRates, buildActionReport } from '../evals/actionMetrics';

describe('actionMetrics (THE-438)', () => {
  it('computes Cohen kappa and reports perfect agreement as 1', () => {
    expect(cohensKappa([true, false, true], [true, false, true])).toBeCloseTo(1, 6);
  });

  it('returns null kappa when a rater is constant (prevalence trap)', () => {
    // Vergibt ein Prüfer über alle Fälle nur eine Klasse, fällt Kappa
    // rechnerisch auf 0 — auch bei 100 % Rohübereinstimmung. Das ist KEIN
    // Uneinigkeits-Befund und darf nicht als solcher berichtet werden.
    expect(cohensKappa([true, true, true], [true, true, true])).toBeNull();
  });

  it('assigns tier A only on unanimity, B on majority, C otherwise', () => {
    expect(tierFor([true, true, true])).toBe('A');
    expect(tierFor([true, true, false])).toBe('B');
    expect(tierFor([true, false, false])).toBe('C');
    expect(tierFor([false, false, false])).toBe('C');
  });

  it('ignores null votes when forming the majority instead of counting them as no', () => {
    // Ein ausgefallenes Haus ist keine Gegenstimme. 2 von 2 gültigen = einstimmig.
    expect(tierFor([true, true, null])).toBe('A');
  });

  it('INVALIDATES the run when the positive control fails', () => {
    // Der Kernfehler vom 2026-08-01: drei Messungen mit einem Instrument, das
    // nie "ja" sagen konnte. Ohne bestandene Positiv-Kontrolle darf Arm T gar
    // nicht erst berichtet werden.
    const r = buildActionReport({
      P: [true, false, true, true],   // 0,75 < 0,95
      T: [true, false, false, false],
      K: [false, false, false, false],
    });
    expect(r.valid).toBe(false);
    expect(r.tRate).toBeNull();
    expect(r.reason).toMatch(/Positiv-Kontrolle/);
  });

  it('fails the run when the negative control produces any false alarm', () => {
    const r = buildActionReport({ P: [true, true], T: [true, false], K: [false, true] });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/Negativ-Kontrolle/);
  });

  it('reports arm T against the instrument ceiling, not in absolute terms', () => {
    const r = buildActionReport({
      P: Array(20).fill(true),
      T: [true, true, false, false],
      K: Array(10).fill(false),
    });
    expect(r.valid).toBe(true);
    expect(r.tRate).toBeCloseTo(0.5, 6);
    expect(r.tRateNormalised).toBeCloseTo(0.5, 6); // geteilt durch pRate = 1,0
  });

  it('renders a report without touching the filesystem', () => {
    const md = buildActionReport({ P: [true], T: [true], K: [false] }).markdown;
    expect(md).toContain('Positiv-Kontrolle');
  });
});
```

- [ ] **Step 2: Fehlschlag bestätigen**

```bash
npm test --workspace @thearchitect/server -- actionMetrics
```

- [ ] **Step 3: Implementieren**

```ts
/**
 * actionMetrics — Auswertung des Drei-Arme-Kontrollversuchs (THE-438,
 * REQ-REQHARM-001.2b). REIN: kein I/O, keine Netzaufrufe, damit vollständig
 * testbar. Muster: typingMetrics.ts.
 *
 * DIE ZENTRALE REGEL: Ohne bestandene POSITIV-Kontrolle ist der Lauf ungültig
 * und Arm T wird NICHT berichtet. Am 2026-08-01 ergaben drei aufeinander
 * folgende Messungen "0 Treffer" — mit einem Richter, dessen Rubrik die
 * gesuchte Antwort ausschloss und der zusätzlich über Gesetzes-Etiketten statt
 * über Text urteilte. Ein Instrument, das nie "ja" sagt, sieht aus wie ein
 * sauberes Instrument mit klarem Negativ-Befund. Deshalb ist die
 * Positiv-Kontrolle hier VORBEDINGUNG, nicht Beiwerk.
 *
 * Linear: THE-438 · Vorgeschichte: THE-538
 */
export type Vote = boolean | null;
export type Tier = 'A' | 'B' | 'C';

/** Untergrenze der Positiv-Kontrolle. Darunter ist das Instrument unbrauchbar. */
export const POSITIVE_CONTROL_MIN = 0.95;

/**
 * Cohen's Kappa. `null`, wenn ein Prüfer konstant ist — dann ist Kappa
 * rechnerisch 0, ohne dass Uneinigkeit vorläge (Prävalenz-Paradox, RUBRIC B4a).
 */
export function cohensKappa(a: boolean[], b: boolean[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n === 0) return null;
  const pa = a.slice(0, n).filter(Boolean).length / n;
  const pb = b.slice(0, n).filter(Boolean).length / n;
  if (pa === 0 || pa === 1 || pb === 0 || pb === 1) return null;
  let agree = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) agree++;
  const po = agree / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return pe === 1 ? null : (po - pe) / (1 - pe);
}

/**
 * Konfidenzstufe aus dem Mehrhausvotum. Ausgefallene Häuser (`null`) zählen
 * NICHT als Gegenstimme — ein stummes Haus ist keine Ablehnung.
 */
export function tierFor(votes: Vote[]): Tier {
  const valid = votes.filter((v): v is boolean => v !== null);
  if (valid.length === 0) return 'C';
  const yes = valid.filter(Boolean).length;
  if (yes === valid.length) return 'A';
  return yes * 2 > valid.length ? 'B' : 'C';
}

export function armRates(arm: boolean[]): { yes: number; n: number; rate: number } {
  const n = arm.length;
  return { yes: arm.filter(Boolean).length, n, rate: n === 0 ? 0 : arm.filter(Boolean).length / n };
}

export interface ActionReport {
  valid: boolean;
  reason: string;
  pRate: number;
  kRate: number;
  /** null, solange der Lauf ungültig ist — die Zahl darf dann nicht zirkulieren. */
  tRate: number | null;
  /** tRate geteilt durch die Decke des Instruments (pRate). */
  tRateNormalised: number | null;
  markdown: string;
}

export function buildActionReport(arms: { P: boolean[]; T: boolean[]; K: boolean[] }): ActionReport {
  const p = armRates(arms.P);
  const t = armRates(arms.T);
  const k = armRates(arms.K);

  let valid = true;
  let reason = 'Kontrollen bestanden.';
  if (p.rate < POSITIVE_CONTROL_MIN) {
    valid = false;
    reason = `Positiv-Kontrolle bei ${(100 * p.rate).toFixed(0)} % (< ${100 * POSITIVE_CONTROL_MIN} %) — Instrument unbrauchbar, Arm T wird nicht berichtet.`;
  } else if (k.yes > 0) {
    valid = false;
    reason = `Negativ-Kontrolle mit ${k.yes} Fehlalarm(en) — Katalog zu grob oder Richter zu großzügig.`;
  }

  const tRate = valid ? t.rate : null;
  const markdown = [
    '| Arm | Treffer | Quote |',
    '| -- | -- | -- |',
    `| P Positiv-Kontrolle | ${p.yes}/${p.n} | ${(100 * p.rate).toFixed(0)} % |`,
    `| T gleiche kanonische Handlung | ${t.yes}/${t.n} | ${valid ? `${(100 * t.rate).toFixed(0)} %` : '— (Lauf ungültig)'} |`,
    `| K verschiedene Handlung | ${k.yes}/${k.n} | ${(100 * k.rate).toFixed(0)} % |`,
    '',
    reason,
  ].join('\n');

  return {
    valid,
    reason,
    pRate: p.rate,
    kRate: k.rate,
    tRate,
    tRateNormalised: valid && p.rate > 0 ? t.rate / p.rate : null,
    markdown,
  };
}
```

- [ ] **Step 4: Test grün**

```bash
npm test --workspace @thearchitect/server -- actionMetrics
```
Erwartet: PASS (8 Tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/evals/actionMetrics.ts packages/server/src/__tests__/actionMetrics.test.ts && git commit -m "feat(the-438): Metriken mit Positiv-Kontrolle als Vorbedingung"
```

---

### Task 7: Prüfsatz + Drei-Arme-Harness

**Files:**
- Create: `packages/server/src/evals/actionGolden.ts`
- Create: `packages/server/src/evals/runActionEval.ts`
- Create: `packages/server/src/evals/golden/actions.v1.json`
- Modify: `packages/server/package.json` (Alias `actions:eval`)
- Test: `packages/server/src/__tests__/runActionEval.test.ts`

- [ ] **Step 1: Prüfsatz-Schema und Loader**

`actionGolden.ts` nach dem Muster von `typingGolden.ts`: Zod-Schema, `loadActionGolden(path)`, `findDuplicateCaseIds`. Ein Fall:

```ts
{
  id: 'dsgvo-33__nis2-23',
  arm: 'T',                    // 'P' | 'T' | 'K'
  a: { law, para, title, text },
  b: { law, para, title, text },
  actionId: 'vorfall-melden-behoerde',   // bei Arm T/K die Katalog-Zuordnung
}
```

Arm **P** wird **erzeugt, nicht kuratiert**: dieselbe Pflicht auf beiden Seiten, nur die Herkunft variiert. Das ist die billigste belastbare Positiv-Kontrolle und lässt sich für jeden Korpus automatisch bilden.

- [ ] **Step 2: Schreibe den fehlschlagenden Harness-Test**

```ts
import { evaluateActions } from '../evals/runActionEval';
import type { ActionGoldenSet } from '../evals/actionGolden';

const set: ActionGoldenSet = { version: 'actions.v1', cases: [/* 1× P, 1× T, 1× K */] };

describe('runActionEval (THE-438)', () => {
  it('runs every house over every case and derives tiers', async () => {
    const houses = { h1: async () => '{"same":true,"delta":"—","why":"x"}', h2: async () => '{"same":true,"delta":"—","why":"x"}' };
    const r = await evaluateActions(set, houses);
    expect(r.report.valid).toBe(true);
    expect(r.tiers['dsgvo-33__nis2-23']).toBe('A');
  });

  it('marks the run invalid when a house never agrees, instead of reporting 0 %', async () => {
    const houses = { h1: async () => '{"same":false,"delta":"—","why":"x"}' };
    const r = await evaluateActions(set, houses);
    expect(r.report.valid).toBe(false);
    expect(r.report.tRate).toBeNull();
  });

  it('never leaks a law name into the judge prompt', async () => {
    const seen: string[] = [];
    await evaluateActions(set, { h1: async (_s, u) => { seen.push(u); return '{"same":true,"delta":"—","why":"x"}'; } });
    for (const u of seen) expect(u).not.toMatch(/\bDSGVO\b|\bNIS2\b|\bDORA\b/);
  });
});
```

- [ ] **Step 3: Harness implementieren**

Dreiteilig wie `runTypingEval`:
- `renderActionReportMarkdown` — rein.
- `evaluateActions(set, houses)` — Kern, Häuser als `Record<string, AskFn>` **injiziert**; baut je Fall den geblendeten Prompt über `buildPairJudgeUserPrompt`, sammelt Stimmen, ruft `tierFor` und `buildActionReport`.
- `main` — Glue: Häuser aus `resolveRaterConfig`/`createRaterClient`, umhüllt mit `withEmptyResponseRetry`.

> **Nicht neu bauen:** `raterClient` löst das Reasoning-Budget (Mindestens 2000 Tokens auf der OpenRouter-Seite) und den Leer-Antwort-Retry bereits. Ein Reasoning-Modell mit zu kleinem Budget liefert `finish_reason: "length"` und **leeren** Text — das sieht in der Auswertung aus wie „keine Meinung" und würde eine ganze Haus-Spalte stillschweigend auf `null` setzen.

- [ ] **Step 4: Prüfsatz einfrieren**

`actions.v1.json` aus der THE-538-Stichprobe bauen: 60 Fälle Arm T, 60 Arm K, 15 Arm P. Feld `version: "actions.v1"`.

- [ ] **Step 5: Tests grün + Alias**

```bash
npm test --workspace @thearchitect/server -- runActionEval
```
`"actions:eval": "ts-node src/evals/runActionEval.ts"` in `packages/server/package.json`.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/evals/actionGolden.ts packages/server/src/evals/runActionEval.ts packages/server/src/evals/golden/actions.v1.json packages/server/src/__tests__/runActionEval.test.ts packages/server/package.json && git commit -m "feat(the-438): Drei-Arme-Eval-Harness mit geblendetem Paar-Richter"
```

---

### Task 8: Freigabe-Tor dokumentieren

**Files:**
- Create: `docs/evals/action-release-gates.md`

- [ ] **Step 1: Tor-Dokument schreiben**

| Tor | Schwelle | Bei Verfehlung |
|---|---|---|
| Positiv-Kontrolle | ≥ 0,95 | **Lauf ungültig.** Erst Prompt/Blendung prüfen, nie das Modell tunen. |
| Negativ-Kontrolle | 0 Fehlalarme | Katalog zu grob → Eintrag aufteilen. |
| Arm T (Mehrheit) | Bericht, kein Tor | Ist der Wert, nicht die Qualität. |
| κ zwischen Häusern | < 0,80 → nur Vorschlag | Kein Auto-Merge. Stufe A vorausgewählt, B nicht, C verborgen. |

Ausdrücklich festhalten: **κ ≥ 0,80 ist für Slice 1 kein Ziel.** Der Slice liefert Vorschläge; erst wenn ein späterer Slice automatisch zusammenführen soll, wird κ zum Tor.

- [ ] **Step 2: Commit**

```bash
git add docs/evals/action-release-gates.md && git commit -m "docs(the-438): Freigabe-Tore für den Handlungs-Katalog"
```

---

## Was dieser Slice ausdrücklich offen lässt

| Offen | Warum jetzt nicht |
|---|---|
| `legalBases[]` N:M + Migration | REQ-001.1. Erst wenn die Vorschlagssicht sich im Gebrauch trägt. |
| Merge-Confirm-UI mit Delta-Anzeige | REQ-001.3, baut auf den hier erzeugten Vorschlägen auf. |
| Coverage/Gap auf Obligation umstellen | REQ-001.4, setzt das Datenmodell voraus. |
| Juristische Adjudikation des Katalogs | Für die Bau-Entscheidung nicht nötig; vor einem **Produktversprechen** schon (Domänengrenzen-Regel). |
| Tragfähigkeit über andere Domänen | Belegt ist ein Ausschnitt aus drei Rechtsakten. `actions:derive` bleibt deshalb wiederholbar — der Katalog wird nicht hart kodiert. |

**Kostenhinweis für den Betrieb:** Die Mehrhaus-Abstimmung läuft **nur** über Paare innerhalb gesetzesübergreifender Handlungen — in der Referenzmessung 350 Paare statt 11 430. Bei drei Häusern sind das rund 1 050 Aufrufe je Korpus, als Batch-Job. Das ist kein Request-Pfad und darf keiner werden.
