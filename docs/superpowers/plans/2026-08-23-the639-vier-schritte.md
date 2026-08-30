# UC-FLOW-001: Vom Gesetz zur Architektur in vier Schritten — Implementation Plan

> ## ⚠️ ÜBERHOLT am 30.08.2026 — nicht ausführen
>
> Ein Durchstich gegen Produktion (`npm run durchstich`) hat die Prämisse dieses
> Plans widerlegt: Die Kette läuft **ohne Bedienung** durch — 10 Mechanik-Schritte,
> 0 Brüche. Der Weg muss nicht auf vier Schritte verkürzt werden, er muss gar
> nicht bedient werden. THE-639 heißt seither **„Der Lauf"**.
>
> **Was hier weiterhin gilt:** Task 2 (P4 — der Generator bekommt einen Ort auf
> der Compliance-Fläche) überlebt unverändert; im Lauf ist er *der* Einstieg.
> Der Test und die Umsetzung sind vollständig ausgeschrieben und direkt
> verwendbar.
>
> **Was entfällt:** Task 1 (P3), Task 4 (P5) und Task 5 (P2) optimieren Schritte,
> die es im Lauf nicht mehr gibt.
>
> *Der Plan bleibt stehen, weil er zurückkommt, falls „Der Lauf" an seinem
> Kill-Kriterium scheitert. Dann ist er die richtige Zwischenlösung.*

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Weg „aus einem Korpus-Gesetz Architektur machen" braucht vier Schritte statt acht — jeder Schritt, der keine Entscheidung des Menschen trägt, fällt weg oder wird automatisiert.

**Architecture:** Vier lokale Schnitte im Client, keine Serverarbeit, keine neuen Endpunkte. Die Substanz der Kette ist gebaut und belegt (THE-638/642/643/636 alle Done) — was fehlt, ist die Verdrahtung der Fläche. Drei der vier Punkte haben ein Vorbild im selben Repo, das kopiert statt erfunden wird.

**Tech Stack:** React 18 + TypeScript, Zustand (`complianceStore`), React Router, Vitest + Testing Library (jsdom), Tailwind.

**Ticket:** [THE-639](https://linear.app/thearchitect/issue/THE-639) · Pre-Flight 2026-08-23, Score 81,3 · **RVTM:** `docs/superpowers/rvtm/2026-08-23-the639-vier-schritte-rvtm.md`

---

## Ausgangslage (heute im Code verifiziert)

Der gemessene Ist-Weg (THE-628, gegen Produktion) braucht acht Schritte, drei davon tragen eine Entscheidung:

```
1  Projekt anlegen                              Entscheidung
2  Werkzeugleiste → Generate Requirements       ← sitzt NICHT auf der Compliance-Fläche   → P4
3  Gesetz + Artikel wählen, erzeugen, speichern  Entscheidung
4  Gap Analysis: 14 Lücken                       Ansicht
5  „Remediate" an einer Lücke                   ← springt in einen Reiter ohne Kontext    → P5
6  Standards → Add to pipeline                  ← nirgends genannt, keine Entscheidung    → P2
7  Pipeline → Norm im Dropdown wählen           ← bei EINER Norm nichts zu wählen         → P3
8  Remediate                                     Entscheidung (Vorschläge übernehmen)
```

**Was bereits stimmt und nicht angefasst wird:** Die Kette funktioniert technisch. `RemediateGateway` zählt seit THE-638 aus einer Quelle (`normsAPI.remediationScope`), Korpus-Normen erzeugen Vorschläge (THE-642/643), Apply verlinkt zurück (THE-636). **Kein Schritt dieses Plans darf diese Zählweise antasten** — die Negativ-Kontrolle in `RemediateGateway.test.tsx` (die alte Upload-Route wirft, wenn sie gerufen wird) bleibt grün.

## File Structure

| Datei | Verantwortung | Änderung |
|---|---|---|
| `components/compliance/RemediateGateway.tsx` | Remediations-Fläche: zählt offene Punkte, ruft Generate | **P3** Auto-Select · **P5** Lücke aus dem Navigationszustand übernehmen |
| `components/compliance/CompliancePage.tsx` | Router der Compliance-Sektionen | **P4** Generator-Modal einbinden + Zustand |
| `components/compliance/StandardsManager.tsx` *(oder Sektion `standards`)* | Einstieg „Gesetz wählen" | **P4** Knopf „Anforderungen erzeugen" |
| `components/compliance/GapAnalysis.tsx:391` | Lückenliste mit Remediate-Knopf | **P5** Lücke im Navigationszustand mitgeben |
| `components/compliance/RequirementsGeneratorModal.tsx:474` | Erzeugt + persistiert Anforderungen | **P2** Pipeline-Aufnahme nach dem Speichern |
| `docs/strategy/mission-graph.json` | Aufgabenkette als Daten | Fundstellen nachziehen, wenn P4 den Ort schafft |

**Reihenfolge der Slices ist bindend:** Slice 1 schafft den Ort, auf den Slice 2 und 3 verweisen.

---

## Chunk 1: Slice 1 — Der Generator bekommt einen Ort, die Auswahl folgt

Streicht Schritt 7, macht Schritt 2 auffindbar. Bewegt beide Impact-Zahlen.

### Task 1: Auto-Select im RemediateGateway (P3)

Vorbild: `SuggestedElements.tsx:75-79` — dieselben fünf Zeilen, dieselbe Store-Action.

**Files:**
- Modify: `packages/client/src/components/compliance/RemediateGateway.tsx`
- Test: `packages/client/src/components/compliance/RemediateGateway.autoselect.test.tsx` (neu)

- [ ] **Step 1: Write the failing test**

Neue Datei `packages/client/src/components/compliance/RemediateGateway.autoselect.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * THE-639 P3 — Auswahl folgt, statt gewählt zu werden.
 *
 * Liegt genau EINE Norm in der Pipeline, trägt die Auswahl keine Entscheidung:
 * Das Gateway wählt sie selbst. Bei mehreren bleibt die Wahl beim Menschen —
 * das ist die Negativ-Kontrolle, ohne die aus Bequemlichkeit eine stille
 * Vorauswahl würde.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ projectId: 'p1' }),
  useLocation: () => ({ state: null }),
}));

vi.mock('../../services/api', () => ({
  normsAPI: {
    remediationScope: vi.fn(async () => ({
      data: { total: 1, compliant: 0, partial: 0, gap: 0, unmapped: 1, openSectionIds: ['dsgvo:Art. 32'] },
    })),
  },
  standardsAPI: { getMappings: vi.fn(() => { throw new Error('zweite Zählquelle — darf nicht gerufen werden'); }) },
}));

const selectStandard = vi.fn();
let storeState: Record<string, unknown> = {};
vi.mock('../../stores/complianceStore', () => ({
  useComplianceStore: () => storeState,
}));
vi.mock('../../stores/remediationStore', () => ({
  useRemediationStore: () => ({ proposals: [], generate: vi.fn(), apply: vi.fn(), isGenerating: false }),
}));
vi.mock('../../stores/architectureStore', () => ({
  useArchitectureStore: (sel: (s: unknown) => unknown) => sel({ projectId: 'p1' }),
}));

import RemediateGateway from './RemediateGateway';

describe('RemediateGateway — Auto-Select (THE-639 P3)', () => {
  beforeEach(() => {
    selectStandard.mockClear();
  });

  test('genau eine Norm in der Pipeline → wird selbst gewählt', async () => {
    storeState = {
      selectedStandardId: null,
      pipelineStates: [{ standardId: 'corpus:dsgvo' }],
      portfolioOverview: null,
      selectStandard,
    };
    render(<RemediateGateway />);
    await waitFor(() => expect(selectStandard).toHaveBeenCalledWith('corpus:dsgvo'));
  });

  test('mehrere Normen → die Wahl bleibt beim Menschen', async () => {
    storeState = {
      selectedStandardId: null,
      pipelineStates: [{ standardId: 'corpus:dsgvo' }, { standardId: 'corpus:nis2' }],
      portfolioOverview: null,
      selectStandard,
    };
    render(<RemediateGateway />);
    await new Promise((r) => setTimeout(r, 50));
    expect(selectStandard).not.toHaveBeenCalled();
  });

  test('bereits gewählt → keine stille Umwahl', async () => {
    storeState = {
      selectedStandardId: 'corpus:nis2',
      pipelineStates: [{ standardId: 'corpus:dsgvo' }],
      portfolioOverview: null,
      selectStandard,
    };
    render(<RemediateGateway />);
    await new Promise((r) => setTimeout(r, 50));
    expect(selectStandard).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=@thearchitect/client -- RemediateGateway.autoselect
```

Expected: FAIL — `expect(selectStandard).toHaveBeenCalledWith('corpus:dsgvo')` erhält 0 Aufrufe.

- [ ] **Step 3: Write minimal implementation**

In `RemediateGateway.tsx`: Store-Destrukturierung um `pipelineStates` und `selectStandard` erweitern (Zeile ~15), und den Effekt direkt danach einfügen:

```tsx
  const { portfolioOverview, selectedStandardId, pipelineStates, selectStandard } = useComplianceStore();

  // THE-639 P3: Liegt genau EINE Norm in der Pipeline, trägt die Auswahl keine
  // Entscheidung — das Gateway wählt sie selbst. Bei mehreren bleibt die Wahl
  // beim Menschen. Vorbild: SuggestedElements.tsx:75, PolicyDraftReview.tsx:47.
  useEffect(() => {
    if (!selectedStandardId && pipelineStates?.length === 1) {
      selectStandard(pipelineStates[0].standardId);
    }
  }, [selectedStandardId, pipelineStates, selectStandard]);
```

> **Abweichung vom Vorbild, bewusst:** `SuggestedElements` wählt bei `length > 0` das erste Element. Hier steht `=== 1`, weil bei mehreren Normen die Wahl eine echte Entscheidung ist. Wer das auf `> 0` lockert, baut eine stille Vorauswahl — der zweite Test hält das fest.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=@thearchitect/client -- RemediateGateway
```

Expected: PASS — alle drei neuen Tests, **und** die bestehende `RemediateGateway.test.tsx` weiterhin grün (Negativ-Kontrolle gegen die zweite Zählquelle).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/compliance/RemediateGateway.tsx \
        packages/client/src/components/compliance/RemediateGateway.autoselect.test.tsx
git commit -m "feat(the-639): Remediate waehlt die einzige Norm selbst — Schritt 7 faellt weg"
```

---

### Task 2: Der Generator bekommt einen Ort auf der Compliance-Fläche (P4)

Der Generator ist der Einstieg in die Kette und lebt heute nur in der 3D-Werkzeugleiste (`MainLayout.tsx:89`). Zwei Lesegänge haben ihn dort nicht gefunden; mein Mission-Abgleich meldet ihn maschinell als „Schritt ohne Ort".

**Files:**
- Modify: `packages/client/src/components/compliance/CompliancePage.tsx`
- Modify: `packages/client/src/components/copilot/StandardsManager.tsx`
- Test: `packages/client/src/components/compliance/CompliancePage.generator.test.tsx` (neu)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
/**
 * THE-639 P4 — Der Generator ist der Einstieg in die Kette und muss dort
 * erreichbar sein, wo der Nutzer die Kette beginnt: auf der Compliance-Fläche.
 * Heute lebt er nur in der 3D-Werkzeugleiste (MainLayout.tsx:89).
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ projectId: 'p1', section: 'standards' }),
  Navigate: () => null,
}));

vi.mock('./RequirementsGeneratorModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="generator-modal">Generator offen</div> : null,
}));

import CompliancePage from './CompliancePage';

describe('CompliancePage — Generator hat einen Ort (THE-639 P4)', () => {
  test('Knopf "Anforderungen erzeugen" ist auf der Standards-Fläche sichtbar', () => {
    render(<CompliancePage />);
    expect(screen.getByRole('button', { name: /Anforderungen erzeugen|Generate requirements/i })).toBeInTheDocument();
  });

  test('Klick öffnet den Generator — ohne Umweg über die 3D-Werkzeugleiste', () => {
    render(<CompliancePage />);
    expect(screen.queryByTestId('generator-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Anforderungen erzeugen|Generate requirements/i }));
    expect(screen.getByTestId('generator-modal')).toBeInTheDocument();
  });
});
```

> **Hinweis für den Umsetzenden:** `CompliancePage` mountet viele Kinder. Schlägt das Rendern an einer unbeteiligten Abhängigkeit fehl, mocke sie im Test dazu (`vi.mock`) — der Test prüft **nur** Knopf und Modal, nicht die Sektionsinhalte. Wächst die Mock-Liste über ~6 Einträge, ist das ein Signal, den Knopf stattdessen in `StandardsManager` zu testen; die Akzeptanz bleibt dieselbe.

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=@thearchitect/client -- CompliancePage.generator
```

Expected: FAIL — `Unable to find role="button"` mit diesem Namen.

- [ ] **Step 3: Write minimal implementation**

In `CompliancePage.tsx` — Import, Zustand, Knopf, Modal:

```tsx
import RequirementsGeneratorModal from './RequirementsGeneratorModal';
// … in der Komponente:
const [showGenerator, setShowGenerator] = useState(false);
```

Im `activeSection === 'standards'`-Block, **über** dem `StandardsManager`, als Primäraktion der Fläche:

```tsx
<div className="flex items-center justify-between mb-3">
  <p className="text-xs text-[var(--text-tertiary)]">
    Aus einem Gesetz Anforderungen ableiten — der Einstieg in die Kette.
  </p>
  <button
    onClick={() => setShowGenerator(true)}
    className="px-3 py-1.5 text-xs font-medium rounded bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
  >
    Anforderungen erzeugen
  </button>
</div>
```

Am Ende des Komponenten-JSX, neben den anderen Overlays:

```tsx
<RequirementsGeneratorModal isOpen={showGenerator} onClose={() => setShowGenerator(false)} />
```

> **Nicht entfernen:** Der Einstieg in `MainLayout.tsx:89` bleibt. Wer aus der 3D-Welt kommt, soll ihn dort weiter finden — das Ticket sagt „gehört **(auch)** auf die Compliance-Fläche". Eine Streichung wäre ein Konventionsbruch für Bestandsnutzer (UX-Checkliste §6.7).

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=@thearchitect/client -- CompliancePage
```

Expected: PASS.

- [ ] **Step 5: Typprüfung und Commit**

```bash
npx tsc --noEmit -p packages/client/tsconfig.json 2>&1 | grep -E "CompliancePage|RemediateGateway" || echo "typsauber"
git add packages/client/src/components/compliance/CompliancePage.tsx \
        packages/client/src/components/compliance/CompliancePage.generator.test.tsx
git commit -m "feat(the-639): der Requirements-Generator hat einen Ort auf der Compliance-Flaeche"
```

---

### Task 3: Slice 1 am Klick belegen und den Mission-Graph nachziehen

Das Impact-Statement verlangt eine Zahl, keine Aktivitätsmeldung. Diese Task erzeugt sie.

**Files:**
- Modify: `docs/strategy/mission-graph.json`
- Modify: `docs/strategy/nav-graph-baseline.json` (per Skript)

- [ ] **Step 1: Den Weg am Klick durchgehen**

Lokale Umgebung hochfahren, dann als Nutzer: Projekt öffnen → Compliance → Standards → **„Anforderungen erzeugen"** → Gesetz + Artikel wählen → erzeugen → speichern → Gap Analysis → Remediate.

Zu protokollieren: Anzahl der Schritte, und ob im Remediate-Reiter die Norm **ohne Zutun** gewählt ist.

Expected: Der Generator ist ohne Wechsel in die 3D-Ansicht erreichbar; Remediate zeigt die Norm vorausgewählt.

- [ ] **Step 2: Mission-Graph auf die neue Wirklichkeit ziehen**

In `docs/strategy/mission-graph.json`, Schritt `anforderung`:

```json
{ "id": "anforderung", "frage": "Was fordert es konkret von uns?",
  "surfaces": ["/project/:id/compliance/standards"],
  "note": "Seit THE-639 P4 auf der Compliance-Fläche erreichbar; der Einstieg aus der 3D-Werkzeugleiste bleibt zusätzlich bestehen." }
```

- [ ] **Step 3: Wirkung messen**

```bash
npm run nav:graph
```

Expected: In „Die sieben Fragen" sinkt **Schritte ohne Ort von 2 auf 0**, die direkten Übergänge steigen. Genau diese Zahlen sind das Impact-Statement.

- [ ] **Step 4: Baseline bewusst nachziehen**

```bash
npm run nav:graph -- --write-baseline
npm run nav:check   # muss grün sein
```

- [ ] **Step 5: Commit**

```bash
git add docs/strategy/mission-graph.json docs/strategy/nav-graph-baseline.json
git commit -m "feat(the-639): Schritt 'Anforderungen erzeugen' hat einen Ort — Mission-Abgleich 2 ohne Ort -> 0

Baseline bewusst nachgezogen: Der Ort ist neu entstanden, nicht die Messung
geaendert. Beleg im Commit davor."
```

---

## Chunk 2: Slice 2 — Der Remediate-Knopf nimmt die Lücke mit

Macht Schritt 5 zu dem, was er verspricht. Heute springt er in einen Reiter, der die Vorbedingungen einfordert, statt sie mitzubringen.

### Task 4: Lücke über den Navigationszustand übergeben (P5)

**Files:**
- Modify: `packages/client/src/components/compliance/GapAnalysis.tsx:391`
- Modify: `packages/client/src/components/compliance/RemediateGateway.tsx`
- Test: `packages/client/src/components/compliance/RemediateGateway.handover.test.tsx` (neu)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
/**
 * THE-639 P5 — Wer von einer Lücke kommt, bringt sie mit.
 *
 * Heute springt „Remediate" an der Lücke in einen Reiter, der die Norm-Auswahl
 * erst einfordert. Der Knopf verspricht eine Handlung an DIESER Lücke — also
 * muss die Norm mitreisen. Übertragen wird sie im Router-State, nicht in der
 * URL: sie ist Navigationskontext, kein teilbarer Ort (kein Deep-Link-Vertrag).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

let locationState: unknown = null;
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ projectId: 'p1' }),
  useLocation: () => ({ state: locationState }),
}));

vi.mock('../../services/api', () => ({
  normsAPI: {
    remediationScope: vi.fn(async () => ({
      data: { total: 1, compliant: 0, partial: 0, gap: 0, unmapped: 1, openSectionIds: ['dsgvo:Art. 32'] },
    })),
  },
  standardsAPI: { getMappings: vi.fn(() => { throw new Error('zweite Zählquelle'); }) },
}));

const selectStandard = vi.fn();
vi.mock('../../stores/complianceStore', () => ({
  useComplianceStore: () => ({
    selectedStandardId: null,
    pipelineStates: [{ standardId: 'corpus:dsgvo' }, { standardId: 'corpus:nis2' }],
    portfolioOverview: null,
    selectStandard,
  }),
}));
vi.mock('../../stores/remediationStore', () => ({
  useRemediationStore: () => ({ proposals: [], generate: vi.fn(), apply: vi.fn(), isGenerating: false }),
}));
vi.mock('../../stores/architectureStore', () => ({
  useArchitectureStore: (sel: (s: unknown) => unknown) => sel({ projectId: 'p1' }),
}));

import RemediateGateway from './RemediateGateway';

describe('RemediateGateway — Übergabe von der Lücke (THE-639 P5)', () => {
  beforeEach(() => selectStandard.mockClear());

  test('kommt eine Norm im Navigationszustand mit, wird sie gewählt — auch bei mehreren in der Pipeline', async () => {
    locationState = { standardId: 'corpus:nis2' };
    render(<RemediateGateway />);
    await waitFor(() => expect(selectStandard).toHaveBeenCalledWith('corpus:nis2'));
  });

  test('ohne Übergabe greift Auto-Select nicht bei mehreren Normen', async () => {
    locationState = null;
    render(<RemediateGateway />);
    await new Promise((r) => setTimeout(r, 50));
    expect(selectStandard).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=@thearchitect/client -- RemediateGateway.handover
```

Expected: FAIL — die Übergabe wird nicht gelesen.

- [ ] **Step 3: Write minimal implementation**

**a)** In `GapAnalysis.tsx:391` die Norm mitgeben. `standardId` ist die Kennung der Norm, zu der die Lücke gehört — im Zeilen-Datensatz vorhanden (dort verwenden, wo die Zeile sie führt; ist sie im Datensatz anders benannt, den vorhandenen Namen nutzen und **nicht** raten):

```tsx
onClick={() =>
  navigate(`/project/${projectId}/compliance/remediate`, {
    // THE-639 P5: Der Knopf verspricht eine Handlung an DIESER Lücke —
    // also reist ihre Norm mit, statt drüben neu erfragt zu werden.
    state: { standardId: row.standardId },
  })
}
```

**b)** In `RemediateGateway.tsx` — `useLocation` importieren und den Effekt aus Task 1 erweitern:

```tsx
import { useLocation, useNavigate, useParams } from 'react-router-dom';
// …
const location = useLocation();
const handoverStandardId = (location.state as { standardId?: string } | null)?.standardId;

// THE-639 P3 + P5: Eine übergebene Norm gewinnt (der Nutzer kam von genau
// dieser Lücke). Sonst: genau eine in der Pipeline → selbst wählen.
useEffect(() => {
  if (selectedStandardId) return;
  if (handoverStandardId) {
    selectStandard(handoverStandardId);
    return;
  }
  if (pipelineStates?.length === 1) {
    selectStandard(pipelineStates[0].standardId);
  }
}, [selectedStandardId, handoverStandardId, pipelineStates, selectStandard]);
```

> **Warum Router-State und nicht die URL:** Ein Query-Parameter wäre ein Deep-Link-Vertrag, den wir dann halten müssten (Teilen, Lesezeichen, Neuladen). Die Übergabe ist Navigationskontext für **einen** Sprung. `complianceStore` läuft ohne `persist` — nach einem Neuladen ist die Auswahl ohnehin weg, und das ist ein eigener Befund im Ticket, kein Auftrag dieses Schnitts.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=@thearchitect/client -- RemediateGateway
```

Expected: PASS — **alle drei** Suiten (`.test`, `.autoselect`, `.handover`).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/compliance/GapAnalysis.tsx \
        packages/client/src/components/compliance/RemediateGateway.tsx \
        packages/client/src/components/compliance/RemediateGateway.handover.test.tsx
git commit -m "feat(the-639): der Remediate-Knopf nimmt die Luecke mit — Schritt 5 haelt sein Versprechen"
```

---

## Chunk 3: Slice 3 — Erzeugen heißt in die Pipeline aufnehmen

Streicht Schritt 6. **Der einzige Schnitt mit Semantik** — hier wird eine Absicht des Nutzers unterstellt.

### Task 5: Pipeline-Aufnahme nach dem Speichern (P2)

**Files:**
- Modify: `packages/client/src/components/compliance/RequirementsGeneratorModal.tsx:474`
- Test: `packages/client/src/components/compliance/RequirementsGeneratorModal.pipeline.test.tsx` (neu)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
/**
 * THE-639 P2 — Wer Anforderungen aus DSGVO Art. 32 erzeugt und speichert,
 * will DSGVO in der Pipeline. Der Schritt trägt keine Entscheidung.
 *
 * Die Negativ-Kontrolle ist der wichtigere Teil: Scheitert die Aufnahme,
 * darf das Speichern NICHT als gescheitert erscheinen — die Anforderungen
 * sind geschrieben. Ein Fehler hier ist ein Hinweis, kein roter Toast.
 */
import { describe, test, expect, vi } from 'vitest';
import { addToPipelineAfterSave } from './RequirementsGeneratorModal';

describe('Pipeline-Aufnahme beim Erzeugen (THE-639 P2)', () => {
  test('nimmt die Norm auf', async () => {
    const addToPipeline = vi.fn(async () => ({ data: { success: true } }));
    const res = await addToPipelineAfterSave({ projectId: 'p1', workId: 'corpus:dsgvo', addToPipeline });
    expect(addToPipeline).toHaveBeenCalledWith('p1', 'corpus:dsgvo');
    expect(res.ok).toBe(true);
  });

  test('bereits in der Pipeline ist kein Fehler', async () => {
    const addToPipeline = vi.fn(async () => { throw { response: { status: 409 } }; });
    const res = await addToPipelineAfterSave({ projectId: 'p1', workId: 'corpus:dsgvo', addToPipeline });
    expect(res.ok).toBe(true);
    expect(res.alreadyPresent).toBe(true);
  });

  test('scheitert die Aufnahme, bleibt das Speichern erfolgreich', async () => {
    const addToPipeline = vi.fn(async () => { throw { response: { status: 500 } }; });
    const res = await addToPipelineAfterSave({ projectId: 'p1', workId: 'corpus:dsgvo', addToPipeline });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Pipeline/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=@thearchitect/client -- RequirementsGeneratorModal.pipeline
```

Expected: FAIL — `addToPipelineAfterSave is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `RequirementsGeneratorModal.tsx`, **oberhalb** der Komponente, exportierte reine Funktion (deshalb ohne DOM testbar):

```tsx
/**
 * THE-639 P2: Erzeugen heißt in die Pipeline aufnehmen — der Schritt trägt
 * keine Entscheidung. Bewusst fehlertolerant: Die Anforderungen sind zu diesem
 * Zeitpunkt bereits geschrieben; eine misslungene Aufnahme darf das Speichern
 * nicht als gescheitert erscheinen lassen.
 */
export async function addToPipelineAfterSave(args: {
  projectId: string;
  workId: string;
  addToPipeline: (projectId: string, workId: string) => Promise<unknown>;
}): Promise<{ ok: boolean; alreadyPresent?: boolean; message?: string }> {
  try {
    await args.addToPipeline(args.projectId, args.workId);
    return { ok: true };
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 409) return { ok: true, alreadyPresent: true };
    return { ok: false, message: 'In die Pipeline aufnehmen ist nicht gelungen — unter Standards nachholbar.' };
  }
}
```

Im Speichern-Handler, direkt nach `setSavedIds(...)` (Zeile ~474):

```tsx
      setSavedIds(persisted.map((p) => String(p._id)));

      // THE-639 P2: Aufnahme in die Pipeline gehört zum Erzeugen.
      const pipe = await addToPipelineAfterSave({
        projectId,
        workId: normId || source,
        addToPipeline: normsAPI.addToPipeline,
      });
      if (!pipe.ok) toast(pipe.message!, { icon: 'ℹ️' });
```

> **Für den Umsetzenden zu prüfen:** `workId` muss die Kennung sein, die `addToPipeline` erwartet (`corpus:dsgvo`-Form). Im Modal liegt sie in `normId`; ist sie leer, ist `source` der Rückfall. **Vor dem Bau am Klick verifizieren**, welche der beiden die richtige Form trägt — eine falsche Kennung erzeugt einen stillen 404, und genau solche Fehler sucht dieses Ticket.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=@thearchitect/client -- RequirementsGeneratorModal
```

Expected: PASS.

- [ ] **Step 5: Am Klick belegen — inklusive Rückweg**

Anforderungen erzeugen und speichern → **ohne** Umweg über Standards direkt nach Remediate. Erwartung: Die Norm ist in der Pipeline und vorausgewählt.

Und die Widerruflichkeit (Watchpoint des Pre-Flight): Prüfen, dass die Norm unter **Standards** wieder aus der Pipeline entfernt werden kann. Geht das nicht, ist das ein Befund — dann wird P2 zum Angebot („In die Pipeline aufnehmen?") statt zum Automatismus, wie im Kill-Kriterium vorgesehen.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/compliance/RequirementsGeneratorModal.tsx \
        packages/client/src/components/compliance/RequirementsGeneratorModal.pipeline.test.tsx
git commit -m "feat(the-639): erzeugen heisst in die Pipeline aufnehmen — Schritt 6 faellt weg"
```

---

## Chunk 4: Abschluss — die Wirkung belegen

### Task 6: Den Weg protokollieren und das Ticket schließen

- [ ] **Step 1: Vier-Schritte-Durchstich protokollieren**

Wie THE-628, gegen die lokale Umgebung, mit frischem Projekt:

```
1  Projekt anlegen
2  Compliance → Standards → „Anforderungen erzeugen" → Gesetz + Artikel → erzeugen → speichern
3  Gap Analysis → „Remediate" an einer Lücke → Vorschläge prüfen → übernehmen
4  (weiter zu Nachweis und Attest)
```

Jeden Klick festhalten. **Sind es mehr als vier Schritte, ist das der Befund** — nicht die Rundung.

- [ ] **Step 2: Beide Impact-Zahlen erheben**

```bash
npm run nav:graph
```

Expected:
- Mission „Sieben Fragen": **Schritte ohne Ort 2 → 0**, direkte Übergänge 2 → ≥ 4
- `npm run nav:check` grün gegen die in Task 3 nachgezogene Baseline

- [ ] **Step 3: Volle Testsuite und Typprüfung**

```bash
npm test --workspace=@thearchitect/client
npx tsc --noEmit -p packages/client/tsconfig.json
```

Expected: grün. Besonders `RemediateGateway.test.tsx` — die Negativ-Kontrolle gegen die zweite Zählquelle darf durch keinen dieser Schnitte gefallen sein.

- [ ] **Step 4: RVTM abschließen**

Jede Zeile in `docs/superpowers/rvtm/2026-08-23-the639-vier-schritte-rvtm.md` auf ihren Beleg setzen (Testname, Protokoll, Messwert).

- [ ] **Step 5: Ticket mit Impact (Ist) schließen**

In THE-639 den Impact im Format des Soll-Statements nachtragen — die zwei Zahlen und das Klick-Protokoll. **Keine Aktivitätsmeldung**: „vier Schritte statt acht, Mission-Abgleich 0 Schritte ohne Ort" ist ein Impact; „Slices 1–3 gemerged" ist keiner.

---

## Was dieser Plan bewusst nicht tut

- **Die Zählweise anfassen.** THE-638 hat sie auf eine Quelle gebracht; dieser Plan verlässt sich darauf und schützt sie über die bestehende Negativ-Kontrolle.
- **`complianceStore` persistieren.** Ein F5 wirft den Nutzer weiterhin auf Anfang — ein eigener Befund im Ticket, eigener Schnitt.
- **Den Generator aus der 3D-Werkzeugleiste entfernen.** Bestandsnutzer haben den Weg gelernt; ein zweiter Ort ist additiv, eine Streichung wäre ein Konventionsbruch (UX-Checkliste §6.7).
- **Die `RegulationsPanel`-Anzeige nachziehen** („Add to pipeline" bleibt nach Erfolg stehen) — Nebenbefund im Ticket, nicht auf dem Vier-Schritte-Weg.
