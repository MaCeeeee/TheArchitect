# THE-557: Gates-Tripel + Notar-Akt — Implementierungsplan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ComplianceRequirement` bekommt ein additives Drei-Tore-Tripel (`covered` · `enforced` · `attested`); `covered` wird mechanisch abgeleitet, `enforced`/`attested` setzt ausschließlich ein Mensch — server-seitig, auditiert, mit Begründungspflicht.

**Architecture:** Reine Gate-Regeln in einem Server-Service (Muster `legalApplicability.service`), additives Mongoose-Subdokument (Muster `legalProfile`), Notar-Route (Muster `certification.routes.ts`: Identität aus der Session, nie aus dem Body), UI-Badge in der bestehenden Requirements-Fläche (`RequirementsForElementSection`).

**Tech Stack:** TypeScript · Mongoose · Express + Zod · React + vitest · jest (aus `packages/server` starten!)

**RVTM:** `docs/superpowers/rvtm/2026-08-03-the557-gates-tripel-rvtm.md`
**Ticket:** THE-557 (Slice 1 von UC-ATTEST-001/THE-552) · **Rahmen:** ADR-0003 (COVER/ENFORCE/ATTEST), Entscheidungen vom 2026-08-03 (`done` bleibt, Tripel additiv)

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `packages/shared/src/types/compliance.types.ts` *(ändern)* | `GateState`, `GateDecision`, `RequirementGates` + DTO-Erweiterung |
| `packages/server/src/services/requirementGates.service.ts` *(neu)* | REINE Regeln: `emptyGates`, `deriveCovered`, `applyHumanGate` |
| `packages/server/src/models/ComplianceRequirement.ts` *(ändern)* | additives `gates`-Subdokument, Enum-validiert |
| `packages/server/src/routes/requirements.routes.ts` *(ändern)* | `POST …/:id/gates` (Notar-Akt) + `covered`-Recompute im PATCH/POST |
| `packages/server/src/__tests__/requirementGates.test.ts` *(neu)* | Service + Modell |
| `packages/client/src/services/api.ts` *(ändern)* | `setGate` + `gates` am `RequirementDoc` |
| `packages/client/src/components/compliance/RequirementGatesBadge.tsx` *(neu)* | Tripel-Badge + Setzen-Dialog |
| `packages/client/src/components/compliance/RequirementsForElementSection.tsx` *(ändern)* | Badge je Zeile einbauen |
| `packages/client/src/components/compliance/RequirementGatesBadge.test.tsx` *(neu)* | 4 Verhaltens-Tests |

**Leitplanken (aus Ticket + Pre-Flight):**
- Ein Bestands-`done` erbt **keine** Tiefe: fehlt `gates`, rendert alles als `unknown`.
- **Kein LLM-Pfad** auf `enforced`/`attested`. `covered` automatisch, aber mit `setBy: 'system'` + Ableitungsgrund.
- **Nie aggregieren** zu Boolean/Prozent.
- `setBy` kommt **immer** aus der Session (Spoof-Schutz wie `certification.routes.ts`).

---

## Chunk 1: Server — Regeln, Modell, Notar-Route

### Task 1: Shared-Typen + reine Gate-Regeln

**Files:**
- Modify: `packages/shared/src/types/compliance.types.ts`
- Create: `packages/server/src/services/requirementGates.service.ts`
- Test: `packages/server/src/__tests__/requirementGates.test.ts`

- [ ] **Step 1: Failing Test schreiben**

```ts
// packages/server/src/__tests__/requirementGates.test.ts
/**
 * Tests für das Drei-Tore-Tripel (THE-557, Slice 1 von UC-ATTEST-001).
 *
 * DIE REGEL, DIE ALLES TRÄGT: `covered` darf eine Maschine ableiten (mit
 * ausgewiesenem Grund) — `enforced` und `attested` setzt NUR ein Mensch.
 * „Ein Mensch, nicht das LLM, macht grün" (WFCOMP-Präzedenz, THE-356).
 */
import {
  emptyGates,
  deriveCovered,
  applyHumanGate,
  HUMAN_ONLY_GATES,
} from '../services/requirementGates.service';

describe('emptyGates — Bestands-done erbt keine Tiefe', () => {
  it('starts every gate at unknown', () => {
    const g = emptyGates();
    expect(g.covered.state).toBe('unknown');
    expect(g.enforced.state).toBe('unknown');
    expect(g.attested.state).toBe('unknown');
  });
});

describe('deriveCovered — mechanisch, mit ausgewiesenem Grund', () => {
  it('is yes/system when linked elements exist, and names how many', () => {
    const d = deriveCovered(['el-1', 'el-2']);
    expect(d.state).toBe('yes');
    expect(d.setBy).toBe('system');
    expect(d.reason).toMatch(/2 linked element/);
    expect(d.setAt).toBeTruthy();
  });

  it('is no/system when nothing is linked — absence is a finding, not unknown', () => {
    const d = deriveCovered([]);
    expect(d.state).toBe('no');
    expect(d.reason).toMatch(/no linked element/i);
  });
});

describe('applyHumanGate — der Notar-Akt', () => {
  const user = '507f1f77bcf86cd799439011';

  it('sets enforced with who/when/why', () => {
    const g = applyHumanGate(emptyGates(), 'enforced', 'yes', user, 'Quartals-Review 2026-Q3, alle Fälle geprüft');
    expect(g.enforced).toMatchObject({ state: 'yes', setBy: user });
    expect(g.enforced.setAt).toBeTruthy();
    // die anderen Tore bleiben unangetastet
    expect(g.covered.state).toBe('unknown');
    expect(g.attested.state).toBe('unknown');
  });

  it('REFUSES covered — the machine gate is not a human decision', () => {
    expect(() => applyHumanGate(emptyGates(), 'covered' as never, 'yes', user, 'x')).toThrow(/covered/);
  });

  it('REFUSES an empty reason — Begründung ist Pflicht, kein Formularfeld', () => {
    expect(() => applyHumanGate(emptyGates(), 'attested', 'yes', user, '   ')).toThrow(/reason/i);
  });

  it('allows an explicit NO — „geprüft und nicht wirksam" ist ein Befund', () => {
    const g = applyHumanGate(emptyGates(), 'enforced', 'no', user, 'Stichprobe: 2 von 5 Fällen laufen am Prozess vorbei');
    expect(g.enforced.state).toBe('no');
  });

  it('does not mutate the input — pure', () => {
    const before = emptyGates();
    applyHumanGate(before, 'attested', 'yes', user, 'Evidenz X liegt vor');
    expect(before.attested.state).toBe('unknown');
  });
});

describe('HUMAN_ONLY_GATES', () => {
  it('names exactly enforced and attested', () => {
    expect([...HUMAN_ONLY_GATES].sort()).toEqual(['attested', 'enforced']);
  });
});
```

- [ ] **Step 2: Rot laufen lassen** — `cd packages/server && npx jest src/__tests__/requirementGates.test.ts` → FAIL (`Cannot find module`)
- [ ] **Step 3: Typen in shared**

```ts
// packages/shared/src/types/compliance.types.ts — ans Ende des Requirement-Blocks
/** THE-557 (UC-ATTEST-001): ein Tor des Erfüllungsgrads. */
export type GateState = 'unknown' | 'no' | 'yes';

export interface GateDecision {
  state: GateState;
  /** User-Id oder 'system' (nur bei `covered`). NIE aus dem Request-Body. */
  setBy?: string;
  setAt?: string; // ISO
  /** Bei human gates Pflicht; bei covered der Ableitungsgrund. */
  reason?: string;
}

/**
 * Drei-Tore-Erfüllungsgrad (ADR-0003: COVER · ENFORCE · ATTEST).
 * NIE zu Boolean oder Prozent aggregieren — „73 % Compliance" ist die Zahl,
 * die keiner Prüfung standhält.
 */
export interface RequirementGates {
  covered: GateDecision;
  enforced: GateDecision;
  attested: GateDecision;
}
```

und am `ComplianceRequirementDTO`: `gates?: RequirementGates;`

- [ ] **Step 4: Service implementieren**

```ts
// packages/server/src/services/requirementGates.service.ts
/**
 * requirementGates — die Regeln des Drei-Tore-Tripels (THE-557).
 *
 * ── DIE EINE REGEL ──
 * `covered` darf eine Maschine ableiten (Deckung = es existiert ein Element,
 * das die Pflicht adressiert — mechanisch aus `linkedElementIds`). `enforced`
 * und `attested` setzt NUR ein Mensch: Wirksamkeit und Nachweis sind nicht
 * mechanisch bestimmbar, und ein LLM-Urteil hier wäre eine selbstbestätigende
 * Metrik. Präzedenz: WFCOMP G9 — „Ein Mensch (nicht das LLM) macht grün."
 *
 * REIN — kein I/O. Die Identität (`setBy`) kommt vom Aufrufer aus der
 * SESSION, nie aus dem Body (Spoof-Schutz wie certification.routes.ts).
 */
import type { GateDecision, RequirementGates } from '@thearchitect/shared';

export const HUMAN_ONLY_GATES = ['enforced', 'attested'] as const;
export type HumanGate = (typeof HUMAN_ONLY_GATES)[number];

const unknown = (): GateDecision => ({ state: 'unknown' });

/** Bestands-Dokumente ohne `gates` rendern hierüber — done erbt keine Tiefe. */
export function emptyGates(): RequirementGates {
  return { covered: unknown(), enforced: unknown(), attested: unknown() };
}

/** Deckung mechanisch: mindestens ein verknüpftes Element. Grund wird ausgewiesen. */
export function deriveCovered(linkedElementIds: readonly string[]): GateDecision {
  const n = linkedElementIds.filter(Boolean).length;
  return {
    state: n > 0 ? 'yes' : 'no',
    setBy: 'system',
    setAt: new Date().toISOString(),
    reason: n > 0 ? `derived: ${n} linked element(s) address this requirement` : 'derived: no linked elements',
  };
}

/**
 * Der Notar-Akt. Wirft bei `covered` (Maschinen-Tor), leerer Begründung oder
 * fehlender Identität. Gibt NEUE gates zurück — pure.
 */
export function applyHumanGate(
  gates: RequirementGates,
  gate: HumanGate,
  state: 'yes' | 'no',
  userId: string,
  reason: string,
): RequirementGates {
  if (!HUMAN_ONLY_GATES.includes(gate)) {
    throw new Error(`gate "covered" is machine-derived — a human cannot set it`);
  }
  if (!userId) throw new Error('userId required (from session, never from body)');
  if (!reason || reason.trim().length === 0) {
    throw new Error('reason is required — an unexplained gate is an unchecked checkbox');
  }
  return {
    ...gates,
    [gate]: { state, setBy: userId, setAt: new Date().toISOString(), reason: reason.trim() },
  };
}
```

- [ ] **Step 5: Grün** — `cd packages/shared && npm run build && cd ../server && npx jest src/__tests__/requirementGates.test.ts` → 9 PASS
- [ ] **Step 6: Commit** — `feat(the-557): Gate-Regeln — covered mechanisch, enforced/attested nur Mensch`

### Task 2: Modell additiv erweitern

**Files:**
- Modify: `packages/server/src/models/ComplianceRequirement.ts`
- Test: erweitert `requirementGates.test.ts`

- [ ] **Step 1: Failing Tests anhängen** (Muster `legalProfile.test.ts`: `validateSync`, keine DB)

```ts
describe('ComplianceRequirement model — gates ist additiv (THE-557)', () => {
  const { ComplianceRequirement } = require('../models/ComplianceRequirement');
  const base = {
    projectId: '507f1f77bcf86cd799439011',
    regulationId: '507f1f77bcf86cd799439012',
    sourceParagraph: 'Art. 32',
    title: 'x', description: 'y', priority: 'must',
    linkedElementIds: [], createdBy: 'human',
  };

  it('a document WITHOUT gates validates exactly as before — Bestand unberührt', () => {
    const doc = new ComplianceRequirement({ ...base, status: 'done' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.gates).toBeUndefined(); // kein default-{} — Abwesenheit bleibt sichtbar
  });

  it('accepts a full gates tripel', () => {
    const doc = new ComplianceRequirement({
      ...base,
      gates: {
        covered: { state: 'yes', setBy: 'system', setAt: new Date().toISOString(), reason: 'derived: 1' },
        enforced: { state: 'unknown' },
        attested: { state: 'unknown' },
      },
    });
    expect(doc.validateSync()).toBeUndefined();
  });

  it('rejects an invalid gate state at schema level', () => {
    const doc = new ComplianceRequirement({
      ...base,
      gates: { covered: { state: 'kaputt' }, enforced: { state: 'unknown' }, attested: { state: 'unknown' } },
    });
    expect(doc.validateSync()).toBeDefined();
  });
});
```

- [ ] **Step 2: Rot** — FAIL (`gates` unbekannt → `doc.gates` undefined ist ok, aber Test 2/3 scheitern am strict-Schema)
- [ ] **Step 3: Schema erweitern** — im Interface `gates?: RequirementGates;` (Import aus shared), im Schema **nach** `status`:

```ts
    // THE-557: Drei-Tore-Erfüllungsgrad — ADDITIV, kein default-{}: ein nie
    // gesetztes Tripel bleibt `undefined`, damit „nie bewertet" von „bewertet:
    // 3× unknown" unterscheidbar ist. Ein Bestands-`done` erbt KEINE Tiefe.
    gates: {
      type: {
        covered: { state: { type: String, enum: ['unknown', 'no', 'yes'] }, setBy: String, setAt: String, reason: String },
        enforced: { state: { type: String, enum: ['unknown', 'no', 'yes'] }, setBy: String, setAt: String, reason: String },
        attested: { state: { type: String, enum: ['unknown', 'no', 'yes'] }, setBy: String, setAt: String, reason: String },
      },
      default: undefined,
      _id: false,
    },
```

- [ ] **Step 4: Grün + tsc** — Suite PASS, `npx tsc --noEmit` sauber
- [ ] **Step 5: Commit** — `feat(the-557): gates-Subdokument am ComplianceRequirement — additiv, ohne default`

### Task 3: Notar-Route + covered-Recompute

**Files:**
- Modify: `packages/server/src/routes/requirements.routes.ts`

- [ ] **Step 1: Route einfügen** (vor der PATCH-Route; Muster Notar):

```ts
// THE-557: Notar-Akt — enforced/attested setzt NUR ein Mensch. `setBy` kommt
// server-seitig aus der Session (Spoof-Schutz wie certification.routes.ts);
// ein `setBy` im Body wird ignoriert, weil das Schema es gar nicht kennt.
const GateBodySchema = z.object({
  gate: z.enum(['enforced', 'attested']),
  state: z.enum(['yes', 'no']),
  reason: z.string().min(1),
});

router.post(
  '/:projectId/requirements/:id/gates',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'invalid id' });
    }
    const parsed = GateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    const doc = await ComplianceRequirement.findOne({ _id: id, projectId });
    if (!doc) return res.status(404).json({ success: false, error: 'requirement not found' });

    const userId = String(req.user!._id);
    let gates;
    try {
      // covered wird beim Setzen eines Human-Gates mitabgeleitet, falls noch nie bewertet —
      // so entsteht nie ein Tripel, dessen Maschinen-Tor grundlos unknown bleibt.
      const current = doc.gates ?? { ...emptyGates(), covered: deriveCovered(doc.linkedElementIds ?? []) };
      gates = applyHumanGate(current, parsed.data.gate, parsed.data.state, userId, parsed.data.reason);
    } catch (err) {
      return res.status(400).json({ success: false, error: (err as Error).message });
    }
    doc.gates = gates;
    await doc.save();

    await createAuditEntry({
      userId,
      projectId,
      action: `requirement.gate.${parsed.data.gate}`,
      entityType: 'compliance_requirement',
      entityId: id,
      after: { gate: parsed.data.gate, state: parsed.data.state, reason: parsed.data.reason },
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });
    return res.json({ success: true, data: doc });
  },
);
```

Imports oben ergänzen: `emptyGates, deriveCovered, applyHumanGate` aus `../services/requirementGates.service`; `createAuditEntry` (falls nicht schon da).

- [ ] **Step 2: covered-Recompute im PATCH** — in der bestehenden PATCH-Route, direkt nach dem `linkedElementIds`-Zweig (`setFields.linkedElementIds = …`):

```ts
      // THE-557: Deckung folgt der Verknüpfung — mechanisch, mit Grund.
      setFields['gates.covered'] = deriveCovered(parsed.data.linkedElementIds);
```

- [ ] **Step 3: covered beim Anlegen** — in der Confirm-/Create-Route (POST `/:projectId/requirements`), beim Bau jedes Dokuments: `gates: { ...emptyGates(), covered: deriveCovered(r.linkedElementIds ?? []) }`.
- [ ] **Step 4: tsc + Suite** — `npx tsc --noEmit` sauber; `npx jest src/__tests__/requirementGates.test.ts` PASS
- [ ] **Step 5: Commit** — `feat(the-557): Notar-Route POST /requirements/:id/gates + covered-Recompute`

---

## Chunk 2: Client — Badge, Setzen-Dialog, Ehrlichkeits-Text

### Task 4: API + Badge-Komponente

**Files:**
- Modify: `packages/client/src/services/api.ts` (`RequirementDoc` + `setGate`)
- Create: `packages/client/src/components/compliance/RequirementGatesBadge.tsx`
- Test: `packages/client/src/components/compliance/RequirementGatesBadge.test.tsx`

- [ ] **Step 1: Failing Component-Test**

```tsx
// @vitest-environment jsdom
/**
 * THE-557 — Gates-Badge: drei Tore, ehrlich gerendert.
 * Kernprüfung: ein Bestands-Dokument OHNE gates zeigt 3× unknown —
 * das done-Häkchen erbt keine Tiefe.
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RequirementGatesBadge from './RequirementGatesBadge';

describe('RequirementGatesBadge', () => {
  test('renders 3× unknown when gates are absent — Bestand erbt keine Tiefe', () => {
    render(<RequirementGatesBadge gates={undefined} onSet={vi.fn()} />);
    expect(screen.getAllByTitle(/not assessed/i)).toHaveLength(3);
  });

  test('shows covered=yes with its derivation reason', () => {
    render(
      <RequirementGatesBadge
        gates={{
          covered: { state: 'yes', setBy: 'system', reason: 'derived: 2 linked element(s) address this requirement' },
          enforced: { state: 'unknown' },
          attested: { state: 'unknown' },
        }}
        onSet={vi.fn()}
      />,
    );
    expect(screen.getByTitle(/derived: 2 linked/)).toBeInTheDocument();
    // Ehrlichkeit: gedeckt ist NICHT nachgewiesen
    expect(screen.getByText(/covered, not attested/i)).toBeInTheDocument();
  });

  test('asks for a reason before setting a human gate', () => {
    const onSet = vi.fn();
    render(<RequirementGatesBadge gates={undefined} onSet={onSet} />);
    fireEvent.click(screen.getByRole('button', { name: /enforced/i }));
    expect(onSet).not.toHaveBeenCalled(); // erst der Dialog
    fireEvent.change(screen.getByPlaceholderText(/why/i), { target: { value: 'Q3 review, all cases' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm yes/i }));
    expect(onSet).toHaveBeenCalledWith('enforced', 'yes', 'Q3 review, all cases');
  });

  test('covered has NO set-button — the machine gate is not clickable', () => {
    render(<RequirementGatesBadge gates={undefined} onSet={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^covered/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Rot** — `cd packages/client && npx vitest run src/components/compliance/RequirementGatesBadge.test.tsx`
- [ ] **Step 3: api.ts** — am `RequirementDoc`: `gates?: { covered: GateInfo; enforced: GateInfo; attested: GateInfo };` (lokaler Typ `GateInfo = { state: 'unknown'|'no'|'yes'; setBy?: string; setAt?: string; reason?: string }`), und:

```ts
  // THE-557: Notar-Akt — nur enforced/attested, Begründung Pflicht.
  setGate: (projectId: string, id: string, body: { gate: 'enforced' | 'attested'; state: 'yes' | 'no'; reason: string }) =>
    api.post(`/projects/${projectId}/requirements/${id}/gates`, body),
```

- [ ] **Step 4: Komponente implementieren** — drei kompakte Chips `C`/`E`/`A` (grau `unknown` mit `title="not assessed…"`, grün `yes`, rot `no`; `title` = reason + setBy + setAt). `covered` als reines Anzeige-Element; `E`/`A` als Button → Inline-Dialog (Textfeld `placeholder="Why? …"`, Buttons „Confirm yes" / „Confirm no"). Bei `covered: yes` ∧ `attested ≠ yes` der Hinweis-Text **"covered, not attested"** — die Ehrlichkeit gehört in die Fläche, nicht in eine Fußnote. UI-Strings Englisch.
- [ ] **Step 5: Grün** — 4 PASS
- [ ] **Step 6: Commit** — `feat(the-557): RequirementGatesBadge — drei Tore, covered unklickbar, Begründungspflicht`

### Task 5: Einbau in die Requirements-Fläche

**Files:**
- Modify: `packages/client/src/components/compliance/RequirementsForElementSection.tsx`

- [ ] **Step 1:** Badge je Requirement-Zeile rendern (neben dem Status-Select, Anker: `REQ_STATUS_COLOR`-Verwendung in der Zeile); `onSet` ruft `requirementsAPI.setGate` + optimistisches Update + `toast`.
- [ ] **Step 2:** `npx tsc --noEmit` (client) + bestehende Section-Tests laufen lassen — keine Regression.
- [ ] **Step 3: Commit** — `feat(the-557): Gates-Tripel in der Requirements-Fläche — neben dem Status, nicht statt seiner`

### Task 6: Abschluss

- [ ] Volle berührte Suiten: `requirementGates` + Modell + Client-Tests + `tsc` beide Pakete
- [ ] RVTM abhaken, THE-557-Kommentar mit Zahlen, PR öffnen, mergen, **Nachprüfung auf origin/master** (die #114-Lektion)
- [ ] Slice-2-Hinweis im Ticket: `attested` verlangt ab THE-558 frische Evidenz — der jetzige Zustand (attested ohne Evidence-Objekt) ist Zwischenstand und im Ticket als solcher vermerkt

---

## Verifikation gegen die Ticket-Kontrollen

| Kontrolle (THE-557) | Wo geprüft |
|---|---|
| Bestands-`done` → 3× `unknown` | Task 2 Test 1 + Task 4 Test 1 |
| `covered` automatisch mit Grund, Mensch-Tore bleiben `unknown` | Task 1 (`deriveCovered`) + Task 3 (Create/PATCH) |
| `setBy` nie aus dem Body | Task 3 (Zod-Schema kennt kein `setBy`; Identität aus Session) |
| kein LLM-Pfad | strukturell: `applyHumanGate` verlangt `userId`; kein Service ruft es maschinell |
| nie Boolean/Prozent | kein Aggregat-Feld, kein Aggregat-Endpoint; Kommentar in shared |
| Begründungspflicht | Task 1 Test + Zod `min(1)` + UI-Dialog |
