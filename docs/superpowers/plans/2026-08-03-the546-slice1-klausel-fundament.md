# THE-546 Slice 1 — Klausel-Fundament + Verdrängungs-Gate Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Die zwei gemessen-fundierten Bausteine von UC-REQTRACE-001 produktfähig machen: änderungsstabile Klausel-Identität (REQ-REQTRACE-001.1 / THE-560) und das Verdrängungs-Gate als geteilter Codepfad (REQ-REQTRACE-001.4 / THE-563).

**Architecture:** Beides rein additiv, keine DB-Migration. (1) `clauseIdentity` in `@thearchitect/shared` neben `deadline.ts` — Content-Hash über normalisierten Klauseltext; der Segmenter trägt die `contentId` zusätzlich zur positionalen Id (die bleibt Anzeige/Lauf-Reproduzierbarkeit). (2) `displacementGate.service` im Server hebt die private Eval-Logik (`measureGrouping.displacementFor`) in einen reinen Service; der Eval konsumiert künftig denselben Codepfad (Muster `obligationAction.service`: Eval = Produktion).

**Tech Stack:** TypeScript, jest (aus `packages/server`), node:crypto.

**Gemessene Grundlage:** `docs/evals/the550-granularitaet-entscheid.md` — positionale Ids verschieben sich bei umnummerierender Novelle 24/30, Content-Hash findet 30/30; Artikel-Ebene trägt die Kette nicht (8/9 unlesbar). Verdrängungs-Kante `dora-prevails-nis2` liegt als Ontologie-Daten mit beiden Zitaten vor, hat aber keinen Produkt-Konsumenten.

**RVTM:** docs/superpowers/rvtm/2026-08-03-the546-slice1-klausel-fundament-rvtm.md

**NICHT in diesem Slice (bewusst):**
- „(1a)"-Erkennung im Segmenter (bekannte Lücke, eigenes Folge-Ticket — AC verlangt nur die Dokumentation).
- Vier-Zustände-Anwendbarkeits-API (`applicable`/`displaced`/`not_applicable`/`undetermined`) als Endpoint — braucht das Kundenprofil (THE-548) als Gegenseite; der Service liefert das `displaced`-Prädikat, mehr Konsum wäre YAGNI.
- Jede Änderung an `ComplianceRequirement`/REQGEN (das ist REQ-001.7, Strangler-Entscheidung).

---

## Chunk 1: Klausel-Identität (REQ-REQTRACE-001.1)

### Task 1: `clauseIdentity` — Normalisierung + Content-Id

**Files:**
- Create: `packages/shared/src/obligations/clauseIdentity.ts`
- Test: `packages/server/src/__tests__/clauseIdentity.test.ts`
- Modify: `packages/shared/src/obligations/index.ts` (Export ergänzen; falls kein Barrel: `packages/shared/src/index.ts`)

- [x] **Step 1: Write the failing test**

```typescript
/**
 * Tests für die änderungsstabile Klausel-Identität (THE-560, Slice 1 von
 * UC-REQTRACE-001). Gemessene Grundlage THE-550: positionale Ids zeigen nach
 * einer umnummerierenden Novelle zu 24/30 auf die FALSCHE Klausel; der
 * Content-Hash findet 30/30 wieder.
 */
import { normalizeClauseText, clauseContentId } from '@thearchitect/shared';

describe('normalizeClauseText', () => {
  it('collapses whitespace and trims — a re-crawl must not change identity', () => {
    expect(normalizeClauseText('  Die  Einrichtungen\n\nmelden   unverzüglich. '))
      .toBe('Die Einrichtungen melden unverzüglich.');
  });

  it('applies NFC — composed and decomposed umlauts are the same clause', () => {
    expect(normalizeClauseText('Mängel melden')).toBe(normalizeClauseText('Mängel melden'));
  });

  it('does NOT lowercase and does NOT strip punctuation — legal text identity is literal', () => {
    expect(normalizeClauseText('Die Meldung MUSS erfolgen.')).toBe('Die Meldung MUSS erfolgen.');
  });
});

describe('clauseContentId', () => {
  it('is deterministic and 16 hex chars', () => {
    const id = clauseContentId('Die Einrichtungen melden unverzüglich.');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(clauseContentId('Die Einrichtungen melden unverzüglich.')).toBe(id);
  });

  it('ignores whitespace differences but not wording differences', () => {
    const a = clauseContentId('Die  Einrichtungen melden\nunverzüglich.');
    const b = clauseContentId('Die Einrichtungen melden unverzüglich.');
    const c = clauseContentId('Die Einrichtungen melden binnen 24 Stunden.');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run (Mac): `cd packages/server && npx jest src/__tests__/clauseIdentity.test.ts`
Expected: FAIL — `normalizeClauseText` is not exported.

- [x] **Step 3: Write minimal implementation**

```typescript
/**
 * clauseIdentity — änderungsstabile Identität einer Rechtsklausel (THE-560).
 *
 * WARUM CONTENT-HASH STATT POSITION (gemessen, THE-550): eine umnummerierende
 * Novelle verschiebt positionale Ids zu 24/30 — sie zeigen danach auf die
 * FALSCHE Klausel, ohne es zu wissen. Der Hash über den normalisierten Text
 * findet alle 30 unveränderten Klauseln wieder; nur die tatsächlich
 * veränderte fällt heraus und wird als neu erkannt.
 *
 * Die Normalisierung ist bewusst MINIMAL: Whitespace-Kollaps + NFC + trim.
 * KEIN lowercase, KEIN Interpunktions-Strip — Rechtstext-Identität ist
 * wörtlich; „MUSS" vs „muss" zu verschmelzen wäre eine Interpretation.
 */
import crypto from 'node:crypto';

export function normalizeClauseText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** 16-Hex-Präfix von sha256 über den normalisierten Text. */
export function clauseContentId(text: string): string {
  return crypto.createHash('sha256').update(normalizeClauseText(text)).digest('hex').slice(0, 16);
}
```

- [x] **Step 4: Export aus shared, shared bauen, Test grün**

Run (Mac): `cd packages/shared && npm run build && cd ../server && npx jest src/__tests__/clauseIdentity.test.ts`
Expected: PASS (5 Tests). ⚠️ Erst shared bauen — Lektion `reference_client_tsc_cold_fail`: stale `dist` maskiert Typfehler.

- [x] **Step 5: Commit**

```bash
git add packages/shared/src packages/server/src/__tests__/clauseIdentity.test.ts
git commit -m "feat(the-560): clauseIdentity — Content-Hash-Identitaet fuer Klauseln (Grundlage THE-550)"
```

### Task 2: Segmenter trägt die `contentId` — der Novellen-Test aus THE-550 wird Regressionstest

**Files:**
- Modify: `packages/server/src/evals/reqtrace/clauseSegmenter.ts` (Interface `Clause` + `segmentClauses`)
- Test: `packages/server/src/__tests__/clauseSegmenter.novelle.test.ts` (neu)

- [x] **Step 1: Write the failing test**

```typescript
/**
 * Der Novellen-Test (THE-560 AC 3) — das THE-550-Experiment als Regressionstest.
 * Fixture: nis2 art23 aus dem eingefrorenen Reqtrace-Fixture; Novelle =
 * umnummerierender Einschub eines neuen Absatzes (2).
 */
import { loadReqtraceLaws } from '../evals/reqtrace/lawsFixture';
import { segmentClauses } from '../evals/reqtrace/clauseSegmenter';

function renumberedNovelle(fullText: string): string {
  let t = fullText;
  for (let n = 15; n >= 2; n--) t = t.split(`(${n})`).join(`(${n + 1})`);
  return t.replace(
    '(3)',
    '(2) Die Einrichtungen benennen eine zentrale Kontaktstelle für alle Meldungen nach diesem Artikel.\n\n(3)',
  );
}

describe('segmentClauses — contentId überlebt die Novelle (THE-550 gemessen)', () => {
  const art = loadReqtraceLaws().articles.find((a) => a.source === 'nis2' && /23/.test(a.article))!;
  const before = segmentClauses(art);
  const after = segmentClauses({ ...art, fullText: renumberedNovelle(art.fullText) });

  it('every clause carries a 16-hex contentId, unique within the article', () => {
    for (const c of before) expect(c.contentId).toMatch(/^[0-9a-f]{16}$/);
    expect(new Set(before.map((c) => c.contentId)).size).toBe(before.length);
  });

  it('all unchanged clauses are re-found by contentId after the renumbering novella', () => {
    const beforeIds = new Set(before.map((c) => c.contentId));
    const refound = after.filter((c) => beforeIds.has(c.contentId)).length;
    expect(refound).toBe(before.length); // 30/30 — die gemessene Zahl aus THE-550
  });

  it('the inserted paragraph appears as NEW content, not as a shifted old id', () => {
    const beforeIds = new Set(before.map((c) => c.contentId));
    const fresh = after.filter((c) => !beforeIds.has(c.contentId));
    expect(fresh.length).toBeGreaterThanOrEqual(1);
    expect(fresh.some((c) => /Kontaktstelle/.test(c.text))).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run (Mac): `npx jest src/__tests__/clauseSegmenter.novelle.test.ts`
Expected: FAIL — `contentId` existiert nicht am `Clause`.

- [x] **Step 3: Minimal implementation**

In `clauseSegmenter.ts`: `Clause` um `contentId: string` erweitern; in `segmentClauses` beim Push `contentId: clauseContentId(sentence)` setzen (Import aus `@thearchitect/shared`). Kommentar an der Id-Zeile:

```typescript
// Positionale Id (c01…) bleibt fuer Anzeige und Lauf-Reproduzierbarkeit.
// REFERENZEN gehoeren auf contentId — gemessen THE-550: Novelle verschiebt
// 24/30 positionale Ids, contentId findet 30/30. Bekannte Grenze (dokumentiert,
// Folge-Ticket): ein Einschub im Novellen-Stil "(1a)" wird nicht als
// Absatzgrenze erkannt und bleibt als eigene Klausel unsichtbar.
```

- [x] **Step 4: Alle Reqtrace-Tests grün (Regressionsschutz Lauf 4)**

Run (Mac): `npx jest src/__tests__/clauseSegmenter.novelle.test.ts src/__tests__/runReqtraceEval.test.ts src/__tests__/reqtraceLaws.test.ts`
Expected: PASS, 0 Regressionen (positionale Ids unverändert — Lauf 4 bleibt reproduzierbar).

- [x] **Step 5: Commit**

```bash
git add packages/server/src
git commit -m "feat(the-560): Segmenter traegt contentId — Novellen-Experiment THE-550 als Regressionstest"
```

## Chunk 2: Verdrängungs-Gate (REQ-REQTRACE-001.4)

### Task 3: `displacementGate.service` — die Eval-Logik wird der eine Codepfad

**Files:**
- Create: `packages/server/src/services/displacementGate.service.ts`
- Modify: `packages/server/src/evals/reqtrace/measureGrouping.ts` (privates `displacementFor` durch Service-Aufruf ersetzen)
- Test: `packages/server/src/__tests__/displacementGate.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
/**
 * Tests für das Verdrängungs-Gate (THE-563, Slice 1 von UC-REQTRACE-001).
 * DIE REGEL: Verdrängung ist eine ONTOLOGIE-KANTE mit Zitat und greift
 * MECHANISCH, bevor irgendein Modell befragt wird (Lauf-4-Negativ-Kontrolle).
 */
import { evaluateDisplacement } from '../services/displacementGate.service';

const dora = { source: 'dora' as const };
const nis2 = { source: 'nis2' as const };

describe('evaluateDisplacement', () => {
  it('displaces NIS2 for a financial entity — with edge id and citations', () => {
    const r = evaluateDisplacement(dora, nis2, { addresseeClass: 'financial_entity' });
    expect(r).not.toBeNull();
    expect(r!.displaced).toBe('b');
    expect(r!.edgeId).toBe('dora-prevails-nis2');
    expect(r!.citations.join(' ')).toMatch(/Art\. 1|Art\. 4/);
  });

  it('is symmetric on argument order — the edge decides, not the position', () => {
    const r = evaluateDisplacement(nis2, dora, { addresseeClass: 'financial_entity' });
    expect(r!.displaced).toBe('a');
  });

  it('does NOT displace outside the addressee class — displacement is scoped, not global', () => {
    expect(evaluateDisplacement(dora, nis2, { addresseeClass: 'essential_entity' })).toBeNull();
  });

  it('returns null for same-source pairs and unrelated pairs', () => {
    expect(evaluateDisplacement(dora, dora, { addresseeClass: 'financial_entity' })).toBeNull();
    expect(evaluateDisplacement({ source: 'dsgvo' }, nis2, { addresseeClass: 'financial_entity' })).toBeNull();
  });
});
```

Hinweis an den Implementierer: exakte Semantik von `addresseeClass`-Matching und Rückgabeform an `measureGrouping.displacementFor` (Zeile ~100) ausrichten — das ist die gemessene, funktionierende Logik; der Service HEBT sie, er erfindet sie nicht neu. Falls `displacementFor` keine addresseeClass prüft, die Ontologie-Kante aber eine trägt: die Kante gewinnt, und der Eval-Test bleibt grün (nachweisen).

- [x] **Step 2: Run test to verify it fails**

Run (Mac): `npx jest src/__tests__/displacementGate.test.ts`
Expected: FAIL — Modul existiert nicht.

- [x] **Step 3: Implement — Logik aus `measureGrouping.displacementFor` herausheben**

Service liest `NORM_ONTOLOGY.displacements` (KEINE Kopie der Kante im Code — Daten bleiben Daten). Rückgabe `{ displaced: 'a' | 'b', edgeId, citations, scope } | null`. Dann `measureGrouping.ts` auf den Service umstellen (Import, private Funktion löschen).

- [x] **Step 4: Beide Testfelder grün**

Run (Mac): `npx jest src/__tests__/displacementGate.test.ts src/__tests__/measureGrouping.test.ts`
Expected: PASS — der Eval fährt jetzt nachweislich denselben Codepfad wie das Produkt.

- [x] **Step 5: Commit**

```bash
git add packages/server/src
git commit -m "feat(the-563): displacementGate.service — Eval-Logik wird der eine Codepfad, Kante bleibt Daten"
```

### Task 4: Ontologie-Version + CHANGELOG prüfen (AC 4)

- [x] **Step 1:** Prüfen, ob `NORM_ONTOLOGY.ontologyVersion` + CHANGELOG die Kante `dora-prevails-nis2` bereits ausweisen (sie stammt aus THE-421/THE-544-Umfeld). Wenn ja: RVTM-Zeile „AC 4 = Bestand, Beleg <Datei:Zeile>". Wenn nein: CHANGELOG-Eintrag ergänzen, patch-Version, Commit `docs(the-563): Ontologie-CHANGELOG — Verdraengungs-Kante ausgewiesen`.

### Task 5: RVTM vervollständigen + Abschluss

- [x] **Step 1:** RVTM-Datei: jede AC-Zeile aus THE-560 + THE-563 → Task + Verifikation + Status. Die zwei bewusst offenen Punkte EXPLIZIT: „(1a)"-Folge-Ticket (THE-560 AC 4 = nur Doku-Pflicht, erfüllt) und Vier-Zustände-API (THE-563 AC 3 — Typ-Ebene erfüllt durch Rückgabewert, API-Konsum verschoben auf THE-548-Anschluss, Begründung im Plan-Kopf).
- [x] **Step 2:** `cd packages/server && npx tsc --noEmit && npx jest src/__tests__/clauseIdentity.test.ts src/__tests__/clauseSegmenter.novelle.test.ts src/__tests__/displacementGate.test.ts` — alles grün, dann Commit + Push + PR gegen master.
