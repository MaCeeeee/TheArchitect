# UC-FIX-001 Slice 2: Ein-Klick-[Fix]-Button (deterministisches Anwenden) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. TDD ist bindend: erst der rote Test, dann der Code.

**Goal:** Jede *ein-Klick-fixbare* Policy-Violation im `ComplianceDashboard` bekommt einen `[Fix]`-Button. Klick → schreibt den deterministischen Zielwert direkt über `architectureAPI.updateElement(projectId, elementId, { [field]: value })` (echter PUT, awaitbar) → der Server re-evaluiert Policies und die Violation löst sich auf → das Dashboard führt sein bestehendes `runCheck()` erneut aus, wodurch die gelöste Violation aus der Liste fällt. „Ein-Klick-fixbar" wird in `deriveViolationFix` (shared) verschärft: `applicable:true` (mit `edit_field`-Action) NUR noch für Operatoren, bei denen `set field = expectedValue` die Regel *beweisbar* erfüllt — `equals`, `gte`, `lte`. `gt`, `lt`, `exists` (true/false), `contains` werden `applicable:false` **ohne Action**, behalten aber ihren Instruction-Hinweis. Ein Feld-Whitelist `AUTO_FIXABLE_FIELDS` begrenzt den Button auf sichere, flache Neo4j-Spalten. KEIN LLM, KEINE neue Engine, KEIN neuer Store, KEIN neues Panel, KEINE Server-Änderung. Slice 2 baut rein additiv auf Slice 1 (THE-499, gemerged) auf.

**Architecture:** Der Dashboard liest ausschließlich den **Report-Pfad** (`GET /compliance` → `checkCompliance()` → `ComplianceReport.violations`), der bereits `operator` UND `elementId` trägt (Slice 1 + `compliance.service.ts:98` `elementId: el.id`). Der Write-Pfad ist der bestehende `PUT /:projectId/elements/:elementId` (`architecture.routes.ts:694`): er erzwingt `PERMISSIONS.ELEMENT_UPDATE` (Viewer → 403), schreibt eine `update_element`-Audit-Zeile (`:696`) und feuert fire-and-forget `evaluateElementPolicies(...,'update')` (`:766`), was die Violation auf Serverseite auflöst. `checkCompliance` ist **stateless** (rechnet live neu) und der Dashboard hat **keine** Socket-Subscription — deshalb muss der Client nach erfolgreichem Apply selbst `runCheck()` erneut aufrufen, damit die gelöste Violation verschwindet. Der gesamte Slice ist Client-seitig (+ eine reine shared-Funktion). Es entsteht KEIN neuer Executor: der Apply-Call wird direkt aus Slice-1s `action.payload = { field, value }` gebaut.

**Tech Stack:** TypeScript-Monorepo (`packages/shared` baut ZUERST → `client`). Client: React 18 + Vite, Vitest 4 (+ `@testing-library/react` 16, jsdom 29, `@testing-library/jest-dom`). `deriveViolationFix` ist pure TS ohne Laufzeit-Abhängigkeiten. Kein Server-Code, kein Jest in diesem Slice.

**RVTM:** `docs/superpowers/rvtm/2026-07-17-uc-fix-001-slice2-rvtm.md` (im Closeout-Task anzulegen; Muster: `docs/superpowers/rvtm/2026-07-17-uc-fix-001-slice1-rvtm.md`).

**Linear:** Parent **THE-498** (UC-FIX-001) · REQ **THE-502** (REQ-FIX-001.2, Slice 2) · verwandter Bug **THE-501** (`maturityLevel`-Fix defekt — Grund für dessen Ausschluss aus `AUTO_FIXABLE_FIELDS`). Beim Abschluss THE-502 → Done mit Datei-Liste; THE-498 bleibt offen (Slice 3 = `regex`).

**Branch:** `mganzmanninfo/the-502-uc-fix-001-slice2-one-click-apply` (von `master`, aktuell `bea8b94`).

---

## Kontext für den Implementierer (zero context)

### Was Slice 1 bereits geliefert hat (verifiziert, gemergter Stand auf `master`)

- **`deriveViolationFix`** lebt in `packages/shared/src/utils/violation-fix.ts` und ist über den Barrel `packages/shared/src/index.ts:38` (`export * from './utils/violation-fix';`) exportiert. Signatur: `deriveViolationFix({ operator?, field, currentValue, expectedValue }) → { applicable, instruction, action? }`. `action` ist eine `RemediationAction` vom Typ `edit_field` mit `payload = { field, value: expectedValue }` (wiederverwendet `advisor.types.ts`, KEIN neuer Typ).
- **Der Dashboard** (`packages/client/src/components/governance/ComplianceDashboard.tsx`) importiert `deriveViolationFix` schon (`:5`), hat `operator?: string` im lokalen `Violation`-Interface (`:18`), eine `fmtValue`-Hilfe (`:62`), und rendert pro Violation (`.map` bei `:175-193`) eine grüne „Fix: {instruction}"-Zeile (`:185`) + eine „Field {field}: {current} → {expected}"-Transition-Zeile (`:187`). **Es gibt noch KEINEN `[Fix]`-Button** — das ist genau dieser Slice.
- **Der Slice-1-Komponententest** `packages/client/src/components/governance/ComplianceDashboard.fixline.test.tsx` prüft nur die *Anzeige* der Instruction + Transition-Zeile (keine Button-/`applicable`-Assertion). Er nutzt eine `exists`-Violation und erwartet „Add description". **Wichtig:** Nach der AC-1-Verschärfung bleibt `exists`' *Instruction* („Add description") unverändert — nur `applicable` kippt auf `false`. Der fixline-Test prüft `applicable` nicht → **er bleibt grün** (in Task 1 gegenprüfen).
- **Der Slice-1-Unit-Test** `packages/client/src/utils/deriveViolationFix.test.ts` pinnt das *alte* (lockere) Verhalten für `exists:true`, `exists:false` und `contains` (assertet `.action`/`.applicable`). Diese drei Tests **müssen** in Task 1 an den neuen Kontrakt angepasst werden. `equals`, `not_equals`, `regex`, missing-/unknown-operator, Objekt-/Leerstring-`expectedValue` bleiben unverändert. Der kombinierte `gt/gte/lt/lte`-Test assertet aktuell nur `.instruction` (bliebe technisch grün), wird aber in explizite Fälle aufgeteilt (AC-6 verlangt `applicable`/Action-Assertions).

### Der Stale-dist-Trap (Pflichtwissen)

Der Symlink `node_modules/@thearchitect/shared → packages/shared` + `package.json.main = ./dist/index.js` bedeuten: **jeder Import aus `@thearchitect/shared` löst gegen `packages/shared/dist` auf, NICHT gegen `src`.** Der Client-Vitest hat kein `src`-Alias für shared. **Konsequenz: Nach JEDER Änderung an `packages/shared/src` MUSST du `npm run build --workspace=@thearchitect/shared` laufen lassen, bevor der Client-Test die neue Funktion/das neue Feld sieht.** Vergisst du das, importiert Vitest das alte dist → `isAutoFixableField is not a function` oder ein Test pinnt weiter das alte Verhalten. `AUTO_FIXABLE_FIELDS`/`isAutoFixableField` werden in dieselbe Datei (`violation-fix.ts`) gelegt, die schon barrel-exportiert ist → **kein `index.ts`-Edit nötig**, aber der shared-Build ist Pflicht.

### Der Write-Pfad (verifiziert) — und warum NICHT der Store

`architectureAPI.updateElement(projectId, elementId, data)` (`packages/client/src/services/api.ts:207`) → `api.put('/projects/${projectId}/elements/${elementId}', data)`. Server-Handler `architecture.routes.ts:694-813`:
- `requirePermission(PERMISSIONS.ELEMENT_UPDATE)` (`:695`) → Viewer/Analyst bekommen **403** (RBAC serverseitig, unabhängig vom UI).
- `audit({ action: 'update_element', ... })` (`:696`) → Audit-Zeile gratis.
- `UpdateElementSchema` (`:115-154`) akzeptiert top-level-Felder: `name`, `description`, `layer`, `togafDomain`, `maturityLevel`, `riskLevel`, `status`, Cost/Agent/`metadata` — **`type` ist NICHT in der Schema** (unschreibbar).
- Fire-and-forget `evaluateElementPolicies(...,'update')` (`:766`) → **die Violation löst sich serverseitig auf**.
- Re-Embed (`:770-803`) nur bei geändertem `name`/`description`/`layer`/`type`.

**NICHT `architectureStore.updateElement` verwenden** (`packages/client/src/stores/architectureStore.ts:228-237`): der Store ist (a) **optimistisch** (mutiert lokalen State zuerst), (b) feuert den Netz-Write NUR `if (get().projectId)` (`:235`) — der Store-`projectId` ist `null`, solange die 3D-Szene nicht gemountet ist, der Dashboard-`projectId` kommt aber aus `useParams()`, nicht aus dem Store → der Write würde **stumm übersprungen**, und (c) **schluckt Fehler** (`.catch` mit nur `import.meta.env.DEV`-`console.error`, `:237`). Für einen sichtbaren, verifizierbaren, 403-fähigen Apply brauchen wir den awaitbaren `architectureAPI.updateElement` direkt.

### Der `elementId` ist bereits auf dem Draht (kein Server-Change)

`checkCompliance()` (`compliance.service.ts:63-142`) baut `violations` ausschließlich aus Policy-Regeln (`:97-110`), jede mit **`elementId: el.id`** (`:98`) und `operator: rule.operator` (`:109`). `GET /compliance` gibt den Report unverändert zurück (`res.json({ success, data: report })`). Die **separate** Funktion `getBuiltInChecks` (`:145-178`) pusht zwar `elementId: ''`, wird von `checkCompliance` aber **nicht** aufgerufen → sie erreicht den Dashboard-Report NIE. Der Client `Violation`-Interface deklariert `elementId` nur noch nicht. Threading = ein Feld hinzufügen. (Verteidigung in der Tiefe: der Render-Guard fordert zusätzlich `!!v.elementId`, falls je ein leer-id-Pfad dazukommt.)

### Der verschärfte `deriveViolationFix`-Kontrakt (AC-1) — die Wahrheitstabelle

„`applicable` bedeutet ab jetzt *ein-Klick-fixbar*." `set field = expectedValue` muss die Regel beweisbar erfüllen:

| Operator | Regel-Semantik (`compliance.service.ts:190-203`) | `set field = expectedValue` erfüllt? | Slice-2-Verhalten |
|---|---|---|---|
| `equals` | `value === expected` | **Ja** | `applicable:true` + `edit_field`-Action (unverändert ggü. Slice 1) |
| `gte` | `value >= expected` | **Ja** (Grenzwert inklusiv) | `applicable:true` + Action (unverändert) |
| `lte` | `value <= expected` | **Ja** (Grenzwert inklusiv) | `applicable:true` + Action (unverändert) |
| `gt` | `value > expected` | **Nein** (strikt) | **`applicable:false`, keine Action**, Instruction bleibt „Set {f} > {v}" |
| `lt` | `value < expected` | **Nein** (strikt) | **`applicable:false`, keine Action**, Instruction bleibt „Set {f} < {v}" |
| `exists:true` | Feld nicht leer | **Nein** (`value=true` ist kein sinnvoller Feldinhalt) | **`applicable:false`, keine Action**, Instruction bleibt „Add {f}" |
| `exists:false` | Feld leer | **Nein** (`value=false` löscht nicht) | **`applicable:false`, keine Action**, Instruction bleibt „Remove {f}" |
| `contains` | `value` enthält `expected` | **Nein** (würde ersetzen statt anfügen) | **`applicable:false`, keine Action**, Instruction bleibt „Include '{v}' in {f}" |
| `not_equals` | `value !== expected` | — (verbotener Wert) | `applicable:false`, keine Action (bereits Slice 1) |
| `regex` | Pattern-Match | — (Slice 3) | `applicable:false`, generischer Hinweis (bereits Slice 1) |
| fehlt/unbekannt | — | — | `applicable:false`, „{f} should be {v}" (bereits Slice 1) |

Diese Verschärfung ist die direkte Umsetzung von Slice-1-RVTM „Slice-2-Merker" #1 (blindes `payload.value`-Schreiben fixt `gt/lt/exists:false/contains` NICHT).

### Feld-Whitelist `AUTO_FIXABLE_FIELDS` (AC-2) — Entscheidung inkl. `layer`

`AUTO_FIXABLE_FIELDS = ['description', 'name', 'riskLevel', 'status']`. Der `[Fix]`-Button rendert nur, wenn `fix.applicable && isAutoFixableField(v.field)`.

- Ausgeschlossen `type`: nicht in `UpdateElementSchema` → serverseitig unschreibbar.
- Ausgeschlossen `maturityLevel`: **THE-501** (Fix defekt) — obwohl schreibbar (`:709/:120`), bis THE-501 nicht per Ein-Klick anbieten.
- **Ausgeschlossen `layer` (bewusste MVP-Entscheidung — vertagt, nicht enthalten):** `layer` ist schreibbar, aber ein Ein-Klick-Layer-Change hat drei nicht-lokale Nebenwirkungen: (1) **Re-Embed** (`architecture.routes.ts:770-803`, Server re-fetcht + `upsertEmbedding`); (2) **3D-Reposition** — `layer` ist die Y-Achse der 3D-Szene (`alignYToLayer`-Konvention), das Element springt strukturell; (3) **Scope-Kaskade (ausschlaggebend)** — `elementMatchesScope` (`compliance.service.ts:180-185`) filtert Policies nach `scope.layers`; ein Layer-Wechsel kann das Element in den Scope *anderer* Policies schieben und dadurch neue Violations auslösen bzw. bestehende auflösen. Das ist keine „ruhige" Ein-Klick-Attribut-Korrektur, sondern ein struktureller Zug mit Kaskade — passt zum Human-in-the-Loop-Prinzip (Asilomar #16: KI schlägt vor, Mensch entscheidet konsequente Zustände). Der `Fix:`-Hinweis (Instruction) bleibt für Layer-Violations sichtbar; nur der Ein-Klick-Button entfällt. **Re-Aktivieren später** = `'layer'` an das Array anhängen (der Apply-Handler ist feld-agnostisch) + idealerweise ein Bestätigungsdialog. Als eigener REQ (Slice ≥ 3) sinnvoll.

**Realismus-Hinweis (kein Bug):** Weil `exists` nach AC-1 `applicable:false` ist, erscheint der Button für `description`/`name` praktisch nur bei den (seltenen) `equals`-Policies. Die realistischen Ein-Klick-Ziele sind `status equals …` und `riskLevel equals …`. Das ist gewollt — der Button erscheint genau dort, wo ein deterministischer Zielwert existiert.

### Client-Permission-Bewusstsein (AC-5) — WICHTIG: die Vorlage-Annahme stimmt so nicht

Es gibt **keinen** `useAuth`-Hook, **keinen** `hasPermission`-Helper und **keine** Permission-Selector auf dem Client. Die im Ticket genannte „THE-227 Roadmap-Toggle deaktiviert auf fehlender Permission (WaveCard)"-Vorlage existiert so **nicht**: `WaveCard.tsx:315` deaktiviert auf `disabled={!roadmapId}` (Daten-Präsenz), nicht auf einer Permission. Es gibt also kein permission-basiertes Disable-Muster zum Spiegeln.

**Was tatsächlich existiert** (und das idiomatische Muster ist, siehe `RolesAccessSection.tsx:60-61`):
- `useAuthStore` (`packages/client/src/stores/authStore.ts`) hält `user: { id, email, name, role: string, … }` — **`role` ist ein String, es gibt kein `permissions`-Array am User.**
- `ROLE_PERMISSIONS` und `PERMISSIONS` kommen aus `@thearchitect/shared` (`permissions.constants.ts`). `PERMISSIONS.ELEMENT_UPDATE = 'element:update'`. `ROLE_PERMISSIONS[role]` ist das Permission-Array der Rolle. `viewer` und `analyst` haben **kein** `ELEMENT_UPDATE`; alle Architekten-Rollen haben es.
- Client-Permission-Check (mirror von `RolesAccessSection.tsx:61`):
  ```ts
  const role = useAuthStore((s) => s.user?.role);
  const canUpdate = !!role && (ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? []).includes(PERMISSIONS.ELEMENT_UPDATE);
  ```
- Der Server erzwingt `ELEMENT_UPDATE` ohnehin (`:695`) → das UI-Disable ist reine UX (verhindert einen sicheren 403-Fehlklick), keine Sicherheitsgrenze.

### Toast-Mechanismus (AC-4) — verifiziert

`react-hot-toast`, Default-Import: `import toast from 'react-hot-toast';` (in ~40 Client-Dateien, z. B. `PropertyPanel.tsx:4`, `GapAnalysis.tsx:12`). `<Toaster />` ist in `main.tsx:6` gemountet. Nutzung: `toast.success(...)` / `toast.error(...)`.

### Testkonventionen (aus Slice 1 übernommen)

- **Unit-Tests** leben im Client-Vitest (`packages/client`, `test.include: src/**/*.test.{ts,tsx}`), importiert aus `@thearchitect/shared`. Lauf aus `packages/client`: `npx vitest run <pfad>`.
- **Komponententests** brauchen jsdom. Vitest ist global auf `environment: 'node'` gesetzt (`vite.config.ts`), deshalb pro Datei die **Direktive `// @vitest-environment jsdom` in Zeile 1** setzen (siehe `ComplianceDashboard.fixline.test.tsx:1`). Harness: `@testing-library/react` + `@testing-library/jest-dom/vitest` + `MemoryRouter`. API wird via `vi.mock('../../services/api', …)` gemockt.
- **Gate = `npx vitest run` (+ optional `npx vite build`), NICHT `tsc -b`/`npm run build`** — kalter `tsc -b` bricht mit 19 vorbestehenden `ViolationSeverity`-Fehlern ab. **Kein Server-Jest in diesem Slice** (kein Server-Code).
- **Parallele Sessions teilen den Git-Index** → immer **pfad-selektiv** `git add <konkrete dateien>` (nie `git add -A`), atomar committen.

### Commit-Konvention

`feat(compliance): <was> (THE-502)` + Trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File-Struktur (was sich ändert / entsteht)

| Datei | Aktion | Verantwortung |
|---|---|---|
| `packages/shared/src/utils/violation-fix.ts` | Modify | AC-1: `exists`/`gt`/`lt`/`contains` → `applicable:false` ohne Action (Instruction behalten); `equals`/`gte`/`lte` bleiben applicable. AC-2: `AUTO_FIXABLE_FIELDS` + `isAutoFixableField` exportieren |
| `packages/client/src/utils/deriveViolationFix.test.ts` | Modify | AC-6 unit: `exists:true`/`exists:false`/`contains`-Tests an neuen Kontrakt; `gt/gte/lt/lte` in explizite Fälle splitten; `isAutoFixableField`-Test |
| `packages/client/src/components/governance/ComplianceDashboard.tsx` | Modify | AC-3 `elementId` ins `Violation`-Interface; AC-4 Apply-Handler (`updateElement` → `runCheck`) + applying-State + Toast + gegateter `[Fix]`-Button; AC-5 Disable+Tooltip bei fehlender Permission |
| `packages/client/src/components/governance/ComplianceDashboard.applyfix.test.tsx` | Create | AC-6 component: Button sichtbar bei `equals`-auf-fixbarem-Feld + Apply-Flow; unsichtbar bei `contains`/`type`; disabled bei `viewer` |
| `docs/superpowers/rvtm/2026-07-17-uc-fix-001-slice2-rvtm.md` | Create | RVTM-Stub im Closeout (Task 4) |

**Kein Barrel-Edit** (`violation-fix.ts` ist bereits `index.ts:38` exportiert) — aber **shared nach jedem Edit neu bauen**. **Nicht im Scope:** `regex`-Vorschläge (Slice 3), `layer`-Ein-Klick (vertagt), `maturityLevel` (THE-501), Server-Code, PropertyPanel/Sidebar/3D, neuer Store/Panel/Executor, Batch-Fix.

---

## Task 1: `deriveViolationFix` verschärfen + `AUTO_FIXABLE_FIELDS` + Unit-Tests (TDD)

**Erfüllt:** AC-1, AC-2, AC-6 (unit).

**Files:**
- Modify: `packages/shared/src/utils/violation-fix.ts`
- Modify: `packages/client/src/utils/deriveViolationFix.test.ts`

- [ ] **Step 1: Tests an den neuen Kontrakt anpassen (rot-first)**

In `packages/client/src/utils/deriveViolationFix.test.ts`:

(a) Import-Zeile erweitern (Zeile 5):
```ts
import { deriveViolationFix, isAutoFixableField } from '@thearchitect/shared';
```

(b) Den `exists:true`-Test (aktuell Z.22-27) ersetzen:
```ts
  it('exists:true → "Add {field}", applicable:false, keine Action (THE-502: nicht ein-Klick-fixbar)', () => {
    const fix = deriveViolationFix({ operator: 'exists', field: 'owner', currentValue: '', expectedValue: true });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe('Add owner');
    expect(fix.action).toBeUndefined();
  });
```

(c) Den `exists:false`-Test (aktuell Z.29-33) ersetzen:
```ts
  it('exists:false → "Remove {field}", applicable:false, keine Action (THE-502)', () => {
    const fix = deriveViolationFix({ operator: 'exists', field: 'legacyFlag', currentValue: 'on', expectedValue: false });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe('Remove legacyFlag');
    expect(fix.action).toBeUndefined();
  });
```

(d) Den kombinierten `gt/gte/lt/lte`-Test (aktuell Z.35-40) durch zwei explizite Tests ersetzen:
```ts
  it('gte/lte → applicable + edit_field (set = expectedValue erfüllt ≥/≤, Grenzwert inklusiv)', () => {
    const gte = deriveViolationFix({ operator: 'gte', field: 'n', currentValue: 1, expectedValue: 5 });
    expect(gte.applicable).toBe(true);
    expect(gte.instruction).toBe('Set n ≥ 5');
    expect(gte.action).toEqual({ type: 'edit_field', label: 'Set n ≥ 5', payload: { field: 'n', value: 5 } });
    const lte = deriveViolationFix({ operator: 'lte', field: 'n', currentValue: 9, expectedValue: 5 });
    expect(lte.applicable).toBe(true);
    expect(lte.action?.payload).toEqual({ field: 'n', value: 5 });
  });

  it('gt/lt → applicable:false, keine Action, Instruction bleibt (THE-502: strikt, set ≠ Ziel)', () => {
    const gt = deriveViolationFix({ operator: 'gt', field: 'n', currentValue: 1, expectedValue: 5 });
    expect(gt.applicable).toBe(false);
    expect(gt.instruction).toBe('Set n > 5');
    expect(gt.action).toBeUndefined();
    const lt = deriveViolationFix({ operator: 'lt', field: 'n', currentValue: 9, expectedValue: 5 });
    expect(lt.applicable).toBe(false);
    expect(lt.instruction).toBe('Set n < 5');
    expect(lt.action).toBeUndefined();
  });
```

(e) Den `contains`-Test (aktuell Z.42-46) ersetzen:
```ts
  it('contains → "Include \'{expectedValue}\' in {field}", applicable:false, keine Action (THE-502)', () => {
    const fix = deriveViolationFix({ operator: 'contains', field: 'tags', currentValue: 'a,b', expectedValue: 'pii' });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe("Include 'pii' in tags");
    expect(fix.action).toBeUndefined();
  });
```

(f) Am Dateiende einen `AUTO_FIXABLE_FIELDS`-Test ergänzen:
```ts
  it('isAutoFixableField (THE-502/AC-2): whitelistet flache Felder, schließt type/maturityLevel/layer aus', () => {
    expect(isAutoFixableField('status')).toBe(true);
    expect(isAutoFixableField('riskLevel')).toBe(true);
    expect(isAutoFixableField('description')).toBe(true);
    expect(isAutoFixableField('name')).toBe(true);
    expect(isAutoFixableField('type')).toBe(false);          // unschreibbar (UpdateElementSchema)
    expect(isAutoFixableField('maturityLevel')).toBe(false); // THE-501
    expect(isAutoFixableField('layer')).toBe(false);         // vertagt (re-embed + reposition + scope-kaskade)
  });
```

**Unverändert lassen** (bleiben grün): `equals`-Test (Z.8-13), `not_equals`-Test (Z.15-20), `regex`-Test, missing-operator-Test, unknown-operator-Test, equals-Objekt-Test, equals-Leerstring-Test.

- [ ] **Step 2: Test laufen — FAIL** (aus `packages/client`)
```bash
npx vitest run src/utils/deriveViolationFix.test.ts
```
Erwartung: FAIL — `isAutoFixableField is not exported` + die drei umgeschriebenen Fälle rot (dist trägt noch das alte, lockere Verhalten).

- [ ] **Step 3: `violation-fix.ts` anpassen**

In `packages/shared/src/utils/violation-fix.ts` den `switch` so ändern, dass nur `equals`/`gte`/`lte` `editField(...)` zurückgeben; `exists`/`gt`/`lt`/`contains` liefern `{ applicable:false, instruction }` **ohne** Action. Konkret die betroffenen `case`-Zweige ersetzen (der `editField`-Helper und `equals`/`not_equals`/`regex`/`default` bleiben):

```ts
    case 'exists':
      // THE-502/AC-1: exists ist NICHT ein-Klick-fixbar — es gibt keinen
      // deterministischen Feldwert („Add owner" ist kein konkreter Inhalt,
      // value=false löscht nicht). Instruction bleibt als manueller Hinweis.
      return { applicable: false, instruction: expectedValue ? `Add ${field}` : `Remove ${field}` };

    // THE-502/AC-1: nur gte/lte sind ein-Klick-fixbar — set = expectedValue
    // erfüllt ≥/≤ (Grenzwert inklusiv). gt/lt (strikt) werden davon NICHT
    // erfüllt → applicable:false, Instruction bleibt Hinweis.
    case 'gte': return editField(field, expectedValue, `Set ${field} ≥ ${fmt(expectedValue)}`);
    case 'lte': return editField(field, expectedValue, `Set ${field} ≤ ${fmt(expectedValue)}`);
    case 'gt':  return { applicable: false, instruction: `Set ${field} > ${fmt(expectedValue)}` };
    case 'lt':  return { applicable: false, instruction: `Set ${field} < ${fmt(expectedValue)}` };

    case 'contains':
      // THE-502/AC-1: contains ist Teilstring-Semantik — set = expectedValue
      // würde ersetzen statt anfügen. Kein Ein-Klick-Fix.
      return { applicable: false, instruction: `Include '${fmt(expectedValue)}' in ${field}` };
```

Am Dateiende (nach `deriveViolationFix`) die Whitelist + Type-Guard ergänzen:
```ts
/**
 * THE-502/AC-2: Felder, für die ein Ein-Klick-[Fix] sicher ist — flache,
 * schreibbare Neo4j-Spalten mit geringem Blast-Radius. Bewusst NICHT enthalten:
 * `type` (nicht in UpdateElementSchema → unschreibbar), `maturityLevel` (Fix
 * defekt — THE-501), `layer` (Ein-Klick-Change triggert Re-Embed + 3D-Reposition
 * + Policy-Scope-Kaskade via elementMatchesScope → als eigener REQ mit Bestätigung).
 */
export const AUTO_FIXABLE_FIELDS = ['description', 'name', 'riskLevel', 'status'] as const;
export type AutoFixableField = (typeof AUTO_FIXABLE_FIELDS)[number];
export function isAutoFixableField(field: string): field is AutoFixableField {
  return (AUTO_FIXABLE_FIELDS as readonly string[]).includes(field);
}
```

- [ ] **Step 4: Shared bauen, dann Test — PASS**
```bash
npm run build --workspace=@thearchitect/shared
# aus packages/client:
npx vitest run src/utils/deriveViolationFix.test.ts
```
Erwartung: alle Fälle grün. (Ohne den shared-Build importiert Vitest das alte dist → die drei umgeschriebenen Fälle bleiben rot — der Stale-dist-Trap.)

- [ ] **Step 5: Slice-1-fixline-Test gegenprüfen (muss grün bleiben)**
```bash
npx vitest run src/components/governance/ComplianceDashboard.fixline.test.tsx
```
Erwartung: grün. Der Test nutzt eine `exists`-Violation und assertet nur die *Instruction* („Add description") + Transition-Zeile, nicht `applicable`/Button → durch AC-1 unberührt. Falls rot: prüfen, ob versehentlich die Instruction-Strings geändert wurden (dürfen sie nicht).

- [ ] **Step 6: Commit** (pfad-selektiv)
```bash
git add packages/shared/src/utils/violation-fix.ts packages/client/src/utils/deriveViolationFix.test.ts
git commit -m "feat(compliance): tighten deriveViolationFix to one-click-fixable ops + AUTO_FIXABLE_FIELDS (THE-502)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: `[Fix]`-Button + Apply-Flow im Dashboard (TDD)

**Erfüllt:** AC-3, AC-4, AC-6 (component: sichtbar/apply/unsichtbar).

**Files:**
- Modify: `packages/client/src/components/governance/ComplianceDashboard.tsx`
- Create: `packages/client/src/components/governance/ComplianceDashboard.applyfix.test.tsx`

- [ ] **Step 1: Failing Komponententest schreiben** — neue Datei `ComplianceDashboard.applyfix.test.tsx` (Muster: die bestehende `ComplianceDashboard.fixline.test.tsx`, aber zusätzlich `architectureAPI.updateElement` + `react-hot-toast` + `useAuthStore` mocken/setzen). **Zeile 1 muss die jsdom-Direktive sein:**

```tsx
// @vitest-environment jsdom
/**
 * REQ-FIX-001.2 (THE-502) — der Ein-Klick-[Fix]-Button:
 *  - sichtbar NUR bei applicable (equals) + auto-fixbarem Feld
 *  - Klick → architectureAPI.updateElement(projectId, elementId, {field: value})
 *    → danach erneutes checkCompliance (stateless recompute → gelöste Violation fällt raus)
 *  - unsichtbar bei nicht-applicable Operator (contains) und nicht-fixbarem Feld (type)
 *  - disabled + Tooltip bei fehlendem element:update (viewer) — siehe Task 3
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const checkCompliance = vi.fn();
const updateElement = vi.fn();
vi.mock('../../services/api', () => ({
  governanceAPI: { checkCompliance: (...a: unknown[]) => checkCompliance(...a) },
  architectureAPI: { updateElement: (...a: unknown[]) => updateElement(...a) },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

import ComplianceDashboard from './ComplianceDashboard';

const renderDashboard = () =>
  render(
    <MemoryRouter initialEntries={['/project/p1/compliance']}>
      <Routes>
        <Route path="/project/:projectId/compliance" element={<ComplianceDashboard />} />
      </Routes>
    </MemoryRouter>,
  );

const okReport = (data: unknown) => Promise.resolve({ data: { success: true, data } });
const reportWith = (violations: unknown[]) => ({
  totalElements: 1, totalPolicies: 1, violations,
  summary: { critical: 0, high: violations.length, medium: 0, low: 0, complianceScore: 50 },
  byCategory: { c: violations.length },
});
const equalsStatusViolation = {
  elementId: 'el-1', elementName: 'X', elementType: 'application_component', policyName: 'P',
  severity: 'high', category: 'c', message: 'status must be current',
  field: 'status', currentValue: 'retired', expectedValue: 'current', operator: 'equals',
};
const setRole = (role: string) =>
  useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c', name: 'A', role }, isAuthenticated: true } as never);

beforeEach(() => {
  checkCompliance.mockReset();
  updateElement.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  setRole('chief_architect'); // hat element:update
});

describe('ComplianceDashboard — one-click [Fix] (THE-502)', () => {
  test('zeigt [Fix] bei equals-auf-fixbarem-Feld, wendet an und re-checkt danach', async () => {
    checkCompliance
      .mockReturnValueOnce(okReport(reportWith([equalsStatusViolation]))) // initialer Run
      .mockReturnValueOnce(okReport(reportWith([])));                      // nach Apply → aufgelöst
    updateElement.mockResolvedValue({ data: { success: true } });

    renderDashboard();
    fireEvent.click(screen.getByText('Run Compliance Check'));
    await screen.findByText(/Set status to current/);

    fireEvent.click(screen.getByRole('button', { name: /^Fix$/ }));

    await waitFor(() => expect(updateElement).toHaveBeenCalledWith('p1', 'el-1', { status: 'current' }));
    await waitFor(() => expect(checkCompliance).toHaveBeenCalledTimes(2)); // runCheck erneut ausgeführt
  });

  test('versteckt [Fix] bei nicht-applicable Operator (contains)', async () => {
    checkCompliance.mockReturnValue(okReport(reportWith([
      { ...equalsStatusViolation, field: 'description', operator: 'contains', currentValue: 'a', expectedValue: 'pii' },
    ])));
    renderDashboard();
    fireEvent.click(screen.getByText('Run Compliance Check'));
    await screen.findByText(/Include 'pii' in description/);
    expect(screen.queryByRole('button', { name: /^Fix$/ })).not.toBeInTheDocument();
  });

  test('versteckt [Fix] bei nicht-fixbarem Feld (type) trotz equals', async () => {
    checkCompliance.mockReturnValue(okReport(reportWith([
      { ...equalsStatusViolation, field: 'type', currentValue: 'node', expectedValue: 'application_component' },
    ])));
    renderDashboard();
    fireEvent.click(screen.getByText('Run Compliance Check'));
    await screen.findByText(/Set type to application_component/);
    expect(screen.queryByRole('button', { name: /^Fix$/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL** (aus `packages/client`)
```bash
npx vitest run src/components/governance/ComplianceDashboard.applyfix.test.tsx
```
Erwartung: FAIL — kein `[Fix]`-Button vorhanden; zudem wirft der Mock ohne `architectureAPI`-Export nichts, aber der Button fehlt → `getByRole('button', { name: /^Fix$/ })` schlägt fehl.

- [ ] **Step 3: Dashboard implementieren** — `ComplianceDashboard.tsx`:

(a) Imports (Z.1-6) anpassen:
```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, RefreshCw, Loader2, Wrench } from 'lucide-react';
import type { ViolationSeverity } from '@thearchitect/shared';
import { deriveViolationFix, isAutoFixableField, ROLE_PERMISSIONS, PERMISSIONS } from '@thearchitect/shared';
import { governanceAPI, architectureAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
```

(b) `elementId` ins lokale `Violation`-Interface (Z.8-19), als erstes Feld:
```tsx
interface Violation {
  elementId: string;
  elementName: string;
  // … unverändert …
  operator?: string;
}
```

(c) In der Komponente, direkt nach den bestehenden `useState`-Zeilen (nach Z.39) einen Apply-State ergänzen (`role`/`canUpdate` kommen in Task 3 dazu):
```tsx
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
```

(d) Nach `runCheck` (nach Z.53) den Apply-Handler ergänzen:
```tsx
  // THE-502/AC-4: await echten PUT (nicht den optimistischen Store), dann das
  // bestehende runCheck() erneut — checkCompliance ist stateless, die serverseitig
  // aufgelöste Violation fällt beim Neuberechnen aus der Liste.
  const applyFix = async (v: Violation, value: unknown) => {
    if (!projectId || !v.elementId) return;
    const key = `${v.elementId}:${v.field}`;
    setApplyingKey(key);
    try {
      await architectureAPI.updateElement(projectId, v.elementId, { [v.field]: value });
      toast.success(`Applied fix: ${v.field}`);
      await runCheck();
    } catch {
      toast.error('Could not apply fix');
    } finally {
      setApplyingKey(null);
    }
  };
```

(e) Im Violation-`.map` (Z.175-193): nach der Transition-Zeile (nach Z.189, noch innerhalb `<div className="flex-1 min-w-0">`) den Button ergänzen. Der `.map`-Kopf berechnet bereits `const fix = deriveViolationFix({...})` (Z.176). Direkt darunter zwei Ableitungen ergänzen und den Button rendern:
```tsx
{report.violations.slice(0, 20).map((v, i) => {
  const fix = deriveViolationFix({ operator: v.operator, field: v.field, currentValue: v.currentValue, expectedValue: v.expectedValue });
  const key = `${v.elementId}:${v.field}`;
  const applying = applyingKey === key;
  const canOneClick = fix.applicable && !!v.elementId && isAutoFixableField(v.field);
  return (
    <div key={i} className="flex items-start gap-2.5 py-2 px-2 rounded hover:bg-[var(--surface-raised)]">
      {severityIcon(v.severity)}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white block truncate">{v.elementName}</span>
        <span className="text-xs text-[var(--text-tertiary)]">{v.message}</span>
        <span className="text-xs text-[var(--text-disabled)] block">Policy: {v.policyName} · Field: {v.field}</span>
        <span className="text-xs text-[#22c55e] block mt-0.5">Fix: {fix.instruction}</span>
        <span className="text-xs text-[var(--text-disabled)] block">
          Field {v.field}: {fmtValue(v.currentValue)} → {fmtValue(v.expectedValue)}
        </span>
        {canOneClick && fix.action && (
          <button
            onClick={() => applyFix(v, fix.action!.payload?.value)}
            disabled={applying}
            className="mt-1.5 inline-flex items-center gap-1 rounded bg-[#1a2a1a] px-2 py-1 text-xs font-medium text-white hover:bg-[#3a4a3a] disabled:opacity-50 transition"
          >
            {applying ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
            {applying ? 'Applying…' : 'Fix'}
          </button>
        )}
      </div>
    </div>
  );
})}
```
(Die `+N more`-Zeile bei Z.194-196 bleibt unverändert.)

- [ ] **Step 4: Shared bauen (falls seit Task 1 nicht geschehen) + Test — PASS**
```bash
npm run build --workspace=@thearchitect/shared
# aus packages/client:
npx vitest run src/components/governance/ComplianceDashboard.applyfix.test.tsx
```
Erwartung: die drei Tests grün (der `viewer`-Disable-Test folgt in Task 3).

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/components/governance/ComplianceDashboard.tsx packages/client/src/components/governance/ComplianceDashboard.applyfix.test.tsx
git commit -m "feat(compliance): one-click [Fix] button applies deterministic fix then re-checks (THE-502)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: RBAC-Disable + Tooltip (TDD)

**Erfüllt:** AC-5, AC-6 (component: viewer-Fall).

**Files:**
- Modify: `packages/client/src/components/governance/ComplianceDashboard.tsx`
- Modify: `packages/client/src/components/governance/ComplianceDashboard.applyfix.test.tsx`

- [ ] **Step 1: Failing Test ergänzen** — im `describe`-Block von `ComplianceDashboard.applyfix.test.tsx` einen Fall anhängen:
```tsx
  test('disabled [Fix] mit Tooltip, wenn dem User element:update fehlt (viewer)', async () => {
    setRole('viewer'); // kein element:update
    checkCompliance.mockReturnValue(okReport(reportWith([equalsStatusViolation])));
    updateElement.mockResolvedValue({ data: { success: true } });

    renderDashboard();
    fireEvent.click(screen.getByText('Run Compliance Check'));
    await screen.findByText(/Set status to current/);

    const fixBtn = screen.getByRole('button', { name: /^Fix$/ });
    expect(fixBtn).toBeDisabled();
    expect(fixBtn).toHaveAttribute('title', expect.stringContaining('element:update'));

    fireEvent.click(fixBtn); // disabled → kein Effekt
    expect(updateElement).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run — FAIL** (der Button ist aktuell für alle Rollen enabled + hat keinen Tooltip)
```bash
npx vitest run src/components/governance/ComplianceDashboard.applyfix.test.tsx
```

- [ ] **Step 3: Permission-Ableitung + Disable implementieren** — `ComplianceDashboard.tsx`:

(a) In der Komponente (bei den `useState`/Selektoren, nach Z.39) ergänzen — Muster aus `RolesAccessSection.tsx:60-61`:
```tsx
  const role = useAuthStore((s) => s.user?.role);
  const canUpdate = !!role && (ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? []).includes(PERMISSIONS.ELEMENT_UPDATE);
```

(b) Den `[Fix]`-Button (aus Task 2) um `canUpdate` erweitern — `disabled` und `title` anpassen:
```tsx
        {canOneClick && fix.action && (
          <button
            onClick={() => applyFix(v, fix.action!.payload?.value)}
            disabled={applying || !canUpdate}
            title={!canUpdate ? 'Requires element:update permission' : undefined}
            className="mt-1.5 inline-flex items-center gap-1 rounded bg-[#1a2a1a] px-2 py-1 text-xs font-medium text-white hover:bg-[#3a4a3a] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {applying ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
            {applying ? 'Applying…' : 'Fix'}
          </button>
        )}
```
(Der Server erzwingt `ELEMENT_UPDATE` ohnehin per 403 — das Disable ist reine UX.)

- [ ] **Step 4: Shared-Build (falls nötig) + volle applyfix-Suite — PASS**
```bash
npm run build --workspace=@thearchitect/shared
# aus packages/client:
npx vitest run src/components/governance/ComplianceDashboard.applyfix.test.tsx
```
Erwartung: alle vier Tests grün.

- [ ] **Step 5: Commit**
```bash
git add packages/client/src/components/governance/ComplianceDashboard.tsx packages/client/src/components/governance/ComplianceDashboard.applyfix.test.tsx
git commit -m "feat(compliance): disable [Fix] with tooltip when user lacks element:update (THE-502)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Closeout — Gate grün, RVTM-Stub, PR

- [ ] **Step 1: Volles Client-Gate grün** (NICHT `tsc -b`)
```bash
npm run build --workspace=@thearchitect/shared
# aus packages/client:
npx vitest run src/utils/deriveViolationFix.test.ts src/components/governance/ComplianceDashboard.fixline.test.tsx src/components/governance/ComplianceDashboard.applyfix.test.tsx
npx vite build
```
Erwartung: alle drei Test-Files grün (Slice-1-fixline bleibt grün), `vite build` ✓.

- [ ] **Step 2: AC-Selbstcheck**
- AC-1: `equals`/`gte`/`lte` applicable+Action; `gt`/`lt`/`exists`(true/false)/`contains` applicable:false, keine Action, Instruction behalten (Task 1). ✓
- AC-2: `AUTO_FIXABLE_FIELDS = ['description','name','riskLevel','status']` + `isAutoFixableField`; `type`/`maturityLevel`/`layer` ausgeschlossen; Button-Gate `fix.applicable && isAutoFixableField(v.field)` (Task 1+2). ✓
- AC-3: `elementId: string` im Client-`Violation`-Interface, vom Apply genutzt (Task 2). ✓
- AC-4: `[Fix]` → `await architectureAPI.updateElement(projectId, elementId, {field:value})` → `runCheck()`; per-Row applying-State; Toast bei Fehler; NICHT der Store-Pfad (Task 2). ✓
- AC-5: Button disabled + Tooltip ohne `ELEMENT_UPDATE` (viewer); Server 403 unabhängig (Task 3). ✓
- AC-6: unit (deriveViolationFix-Verschärfung + `isAutoFixableField`) + component (sichtbar bei equals-auf-fixbar + Apply-Flow; unsichtbar bei contains/type; disabled bei viewer) (Task 1-3). ✓

- [ ] **Step 3: RVTM-Stub anlegen** — `docs/superpowers/rvtm/2026-07-17-uc-fix-001-slice2-rvtm.md` (Muster: `2026-07-17-uc-fix-001-slice1-rvtm.md`). Mindest-Tabelle:

| REQ | AC | Task | Files | Verifikation | Evidence |
|---|---|---|---|---|---|
| REQ-FIX-001.2 | AC-1 (nur equals/gte/lte ein-Klick) | T1 | `shared/utils/violation-fix.ts` | `deriveViolationFix.test.ts` (exists/gt/lt/contains→false, equals/gte/lte→action) | Vitest |
| REQ-FIX-001.2 | AC-2 (`AUTO_FIXABLE_FIELDS`) | T1 | `shared/utils/violation-fix.ts` | `isAutoFixableField` (type/maturityLevel/layer→false) | Vitest |
| REQ-FIX-001.2 | AC-3 (`elementId` threaden) | T2 | `client/…/ComplianceDashboard.tsx` | `applyfix.test.tsx` (updateElement mit el-1) | Vitest |
| REQ-FIX-001.2 | AC-4 (Apply → re-check, kein Store) | T2 | `client/…/ComplianceDashboard.tsx` | `applyfix.test.tsx` (updateElement→checkCompliance x2) | Vitest |
| REQ-FIX-001.2 | AC-5 (RBAC-Disable + Tooltip) | T3 | `client/…/ComplianceDashboard.tsx` | `applyfix.test.tsx` (viewer disabled) | Vitest |
| REQ-FIX-001.2 | AC-6 (unit + component) | T1-T3 | beide Test-Files | Gate-Lauf | Vitest |

(Die `rvtm-traceability`-Skill kann das Gerüst erzeugen.)

- [ ] **Step 4: PR** — gegen `master`, Titel `feat(compliance): UC-FIX-001 Slice 2 — one-click [Fix] apply (THE-502)`. In die Beschreibung: (1) AC-1-Verschärfung „applicable = ein-Klick-fixbar" (Wahrheitstabelle) — löst Slice-1-RVTM-Merker #1; (2) **Vorlage-Korrektur AC-5**: es gibt keinen `hasPermission`/`useAuth`-Helper und WaveCard deaktiviert auf Daten, nicht Permission — gebaut mit `useAuthStore` + `ROLE_PERMISSIONS`/`PERMISSIONS` (Muster `RolesAccessSection.tsx:61`); (3) **`layer` bewusst aus dem MVP vertagt** (Re-Embed + 3D-Reposition + Policy-Scope-Kaskade) — Re-Aktivierung = `'layer'` ans Array + Bestätigung; (4) Apply nutzt `architectureAPI.updateElement` (awaitbar/403-fähig), NICHT den optimistischen `architectureStore`; (5) kein Server-Code — `elementId`/`operator` sind seit Slice 1 auf dem Report-Draht. THE-502 → Done; THE-498 bleibt offen (Slice 3 = `regex`).

---

## Zusammenfassung der Reihenfolge

1. **Task 1** — `deriveViolationFix` verschärfen (`exists`/`gt`/`lt`/`contains` → applicable:false ohne Action, Instruction behalten; `equals`/`gte`/`lte` bleiben) + `AUTO_FIXABLE_FIELDS`/`isAutoFixableField` + Unit-Tests anpassen. Shared bauen. Slice-1-fixline gegenprüfen.
2. **Task 2** — `elementId` ins `Violation`-Interface + Apply-Handler (`updateElement` → `runCheck`) + applying-State + Toast + gegateter `[Fix]`-Button + Komponententest (sichtbar/apply/unsichtbar).
3. **Task 3** — RBAC-Disable (`useAuthStore` + `ROLE_PERMISSIONS`) + Tooltip + viewer-Test.
4. **Task 4** — Gate (`vitest` + `vite build`), RVTM-Stub, PR mit den vier geflaggten Punkten.

**Nach jeder shared-Änderung: `npm run build --workspace=@thearchitect/shared` vor den Tests.** Gate: Client = `npx vitest run` (+ `npx vite build`), NICHT `tsc -b`. Kein Server-Code, kein Jest.
