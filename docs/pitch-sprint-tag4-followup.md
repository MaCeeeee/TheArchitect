# Pitch Sprint — Tag 4 Follow-up (2026-04-14)

Änderungen nach dem initialen Tag-4-Commit (`a7cbbda`), die aus dem Browser-Smoke-Test mit dem vorberechneten Demo-Simulation-Run entstanden sind.

## Motivation

Der Demo-Walkthrough zeigte sechs Diskrepanzen zwischen Design-Intention und tatsächlichem UI-Verhalten, die alle Pitch-kritisch sind:

1. **MiroFish fehlte in der Full-View**, Oracle fehlte in der Compact-Sidebar (inkonsistente Navigation)
2. **Der pre-seedete Demo-Run war nicht sichtbar** — User landete auf Config-Tab mit leerer "Run simulation"-Ansicht
3. **Risk-Dashboard zeigte "1 High"**, obwohl die Architektur 4 Critical + 8 High + 10 Medium enthält
4. **Simulation-Scope war kontextlos** — 1+1+1-Verteilung der Targets wirkte wie Bug statt als Wave-1-Scope
5. **Conflict-Heatmap war leer**, obwohl die Narrative IT-Ops' Blockade auf Workflow Engine enthält
6. **Timeline zeigte R2/R3 statt R1/R2** — Datenmodell war 1-indexed, Dashboard erwartet 0-indexed
7. **Config-Tab war nicht klickbar** — Auto-History-Effect schnappte bei jedem Klick zurück
8. **IT-Ops-Persona-Behavior war generisch** — Reject-Action auf Workflow Engine nicht aus Prompt ableitbar

## Änderungen

### 1. Sidebar-Konsistenz zwischen Compact-Panel und Full-View

**Problem**: Die [AnalyzeSidebar](../packages/client/src/components/analyze/AnalyzeSidebar.tsx) (Full-View) hatte Oracle aber kein MiroFish. Die [Sidebar](../packages/client/src/components/ui/Sidebar.tsx) (Compact-Panel) hatte MiroFish aber kein Oracle. User-Kommentar: *"Mirofish zwar in der Sidebar .. aber nicht im Full View .. dafür Oracle, dies fehlt in der sidebar"*.

**Fix**:
- `AnalyzeSidebar.tsx`: Fish-Icon importiert, MiroFish-Eintrag in `SECTIONS` unter `group: 'simulate'` hinzugefügt
- `AnalyzePage.tsx`: Render-Case `{activeSection === 'mirofish' && <SimulationPanel />}` ergänzt
- `Sidebar.tsx`: `OraclePanel`-Import + Oracle-Eintrag in `ANALYTICS_SECTIONS` + Render-Case `{tab === 'oracle' && <OraclePanel />}`, `AnalyticsTab`-Typ um `'oracle'` erweitert

Ergebnis: Beide Sidebars haben jetzt identischen Satz an 12 Sektionen in 5 Gruppen (Overview, Assess, Simulate, Plan, Manage).

### 2. Pre-computed Banner + Auto-History (mit One-Shot-Guard)

**Problem**: Der DEMO_SIMULATION_RUN wurde im Seed angelegt, aber `simulationStore.loadRuns()` wurde nur bei Klick auf History-Tab aufgerufen. User öffnete MiroFish-Panel und sah leeren Config-Tab ohne Hinweis.

**Fix** in [SimulationPanel.tsx](../packages/client/src/components/simulation/SimulationPanel.tsx):

```tsx
const [runsLoadedOnce, setRunsLoadedOnce] = useState(false);
const [autoSwitchedOnce, setAutoSwitchedOnce] = useState(false);

useEffect(() => {
  if (!projectId || runsLoadedOnce) return;
  loadRuns(projectId).then(() => setRunsLoadedOnce(true));
}, [projectId, runsLoadedOnce, loadRuns]);

useEffect(() => {
  if (!runsLoadedOnce || autoSwitchedOnce || viewMode !== 'config') return;
  const hasCompleted = runs.some((r) => r.status === 'completed');
  setAutoSwitchedOnce(true);
  if (hasCompleted) setViewMode('history');
}, [runsLoadedOnce, autoSwitchedOnce, runs, viewMode]);
```

- **Mount-Effect**: Lädt Runs unabhängig vom Tab-Zustand
- **Auto-Switch-Effect**: Springt einmalig auf History-Tab, wenn completed Run existiert
- `autoSwitchedOnce`-Guard verhindert, dass User bei Klick auf Config zurückgeworfen wird (kritischer Bug in der ersten Implementierung)

Zusätzlich: **Cyan Banner** in `ConfigView` über `RoadmapImportButton`, der auf den vorberechneten Run verlinkt, falls der User doch manuell auf Config geht. Banner zeigt Run-Name + "View pre-computed run"-Button.

### 3. Risk-Aggregation-Bug (Dashboard + Server)

**Problem**: `assessRisk()` in `analytics.service.ts` zählte Kategorien aus einem **berechneten** Risk-Score (5-Faktoren-gewichtet: inherent × 0.3 + maturity × 0.2 + depExposure × 0.2 + depImpact × 0.2 + lifecycle × 0.1). Schwellenwerte `≥8` = critical, `≥6` = high, `≥4` = medium. Problem: Der gewichtete Score erreicht selten >6, selbst wenn `riskLevel: 'critical'` explizit gesetzt ist. Ergebnis: 12 kritische Elemente wurden als "1 High" dargestellt.

**Fix** in [analytics.service.ts](../packages/server/src/services/analytics.service.ts) + [RiskDashboard.tsx](../packages/client/src/components/analytics/RiskDashboard.tsx):

```ts
const summary = {
  total: elements.length,
  critical: elements.filter((e) => e.riskLevel === 'critical').length,
  high: elements.filter((e) => e.riskLevel === 'high').length,
  medium: elements.filter((e) => e.riskLevel === 'medium').length,
  low: elements.filter((e) => e.riskLevel === 'low' || !['critical','high','medium'].includes(e.riskLevel)).length,
  averageScore: /* weiterhin aus riskScore berechnet */,
};
```

Der **averageScore** bleibt aus dem berechneten Score, die **Kategorien** kommen aus dem expliziten `riskLevel`-Feld. Dadurch ist die Dashboard-Zahl nachvollziehbar für den User (*"das ist das Feld, das ich im Modell gesetzt habe"*).

### 4. Simulation-Scope-Badge in ResultsView

**Problem**: Nach Fix 3 zeigte das Dashboard korrekt 4 Critical + 8 High, aber im MiroFish-Simulation-Ergebnis tauchten nur 3 Target-Elemente mit 1+1+1-Verteilung (1 high, 1 medium, 1 low) auf. User-Kommentar: *"mirofish sagt 1+1+1?"* — wirkte wie Bug, war aber Wave-1-Scope.

**Fix** in [SimulationPanel.tsx](../packages/client/src/components/simulation/SimulationPanel.tsx) — neues Scope-Badge in ResultsView:

```
┌─────────────────────────────────────────────────────┐
│ Scope: 3 of 28 elements · cloud migration   Wave 1 │
│ Targets:   ●1 high  ●1 medium  ●1 low              │
├─────────────────────────────────────────────────────┤
│ Portfolio: ●4 critical ●8 high ●10 medium ●6 low   │
└─────────────────────────────────────────────────────┘
```

Zwei Zeilen:
- **Targets**: Risk-Distribution der `config.targetElementIds` (= was simuliert wird)
- **Portfolio**: Risk-Distribution aller Elemente (= was Dashboard zeigt)

Dadurch ist die Diskrepanz "1+1+1 vs 4+8+10" selbsterklärend — Wave 1 ist bewusst ein kleiner Subset. Implementierung nutzt `useMemo(() => ...)` mit `countBy(elements)` Helper für DRY.

### 5. Conflict-Heatmap wurde leer dargestellt

**Problem**: Die Heatmap-Logik in [EmergenceDashboard.tsx:64-82](../packages/client/src/components/simulation/EmergenceDashboard.tsx#L64-L82) zählt Konflikt-Pairs über Agent-Actions auf **demselben** `targetElementId` mit gegensätzlichen Positionen (approve vs reject, modify vs reject). Im ursprünglichen Seed waren die `validatedActions` so verteilt:

- CTO (approve) → AI Scoring + Mobile BFF
- BU Lead (approve) → Mobile BFF
- IT Ops (reject) → Workflow Engine

Kein Agent-Paar hatte je Actions auf demselben Element → 0 Konflikte → komplett leere Matrix, obwohl die Narrative IT-Ops' Blockade enthält.

**Fix** in [demo-seed.ts](../packages/server/src/data/demo-seed.ts):

CTO bekommt in Runde 1 eine dritte `validatedAction` auf Workflow Engine (`approve_change`, Reasoning: *"Parallel migration with blue/green deploy — auto-scaling outweighs transition risk"*). BU Lead bekommt eine zweite Action auf Workflow Engine (`approve_change`). Damit entstehen die erwarteten 2 Konflikte: CTO↔IT-Ops und BU↔IT-Ops. Heatmap zeigt jetzt 4 nicht-leere Zellen (symmetrisch).

### 6. Timeline zeigte R2/R3 statt R1/R2

**Problem**: [EmergenceDashboard.tsx:143](../packages/client/src/components/simulation/EmergenceDashboard.tsx#L143) rendert `R{r.roundNumber + 1}`. Der Engine-Code in [mirofish/engine.ts:69](../packages/server/src/services/mirofish/engine.ts#L69) nutzt `for (let roundNum = 0; roundNum < config.maxRounds; roundNum++)` — also **0-indexed**. Server-Tests prüfen `>= 0`. Mein Seed hatte aber `roundNumber: 1` und `roundNumber: 2` → Dashboard zeigte R2, R3.

**Fix** in [demo-seed.ts](../packages/server/src/data/demo-seed.ts):
- `roundNumber: 1` → `0`
- `roundNumber: 2` → `1`
- `emergenceEvents[].round`: `1` → `0`, `2` → `1` (alle Vorkommen via replace_all)

### 7. IT-Ops-Persona: Plausibilität für Pitch-Verteidigung

**Problem**: Originale Persona-Prompt-Definition war zu generisch — bei der Frage *"Warum reject IT Ops die Workflow Engine?"* wäre die einzige Antwort "weil es in der Historie so steht", nicht "weil es aus dem Persona-Verhalten folgt". User: *"ich möchte nicht angreifbar sein .. alles muss plausibel sein!"*

**Fix** in [personas.ts](../packages/server/src/services/mirofish/personas.ts) (Preset) + [demo-seed.ts](../packages/server/src/data/demo-seed.ts) (Inline-Kopie im Seed):

Neue Zeilen im `systemPromptSuffix` für `it_operations_manager`:

> You enforce change-freeze windows and require dedicated observability for any migration of stateful services (databases, workflow engines, message buses). You will block parallel migrations of stateful services — each needs its own rollback window and load-test cycle.

Jetzt ist die Reject-Action direkt aus dem Prompt deducible:
- Workflow Engine ist stateful (12M Records)
- → erfordert dedizierten Change-Freeze
- → Parallel-Migration verletzt die Policy
- → IT Ops blockiert

Der erweiterte Prompt erscheint auch im `Clone & Customize`-Dialog, den User im Pitch vorführt.

## Verifikation

- `tsc --noEmit` grün für Client und Server
- Browser-Smoke-Test durchgeführt: Demo-Create → MiroFish öffnet History mit Run → Config klickbar → Scope-Badge zeigt korrekten Kontrast → Emergence-Tab zeigt R1/R2 mit 2 Heatmap-Zellen → Persona-Dialog zeigt erweiterten IT-Ops-Prompt

## Geänderte Dateien

| Datei | Zeilen geändert | Zweck |
|-------|-----------------|-------|
| `client/src/components/analyze/AnalyzeSidebar.tsx` | +3 | MiroFish-Eintrag |
| `client/src/components/analyze/AnalyzePage.tsx` | +3 | MiroFish-Render-Case |
| `client/src/components/ui/Sidebar.tsx` | +5 | Oracle-Eintrag + Render-Case |
| `client/src/components/simulation/SimulationPanel.tsx` | +143 / −5 | Banner, Auto-History-One-Shot, Scope-Badge |
| `client/src/components/analytics/RiskDashboard.tsx` | +8 / −3 | Risk-Count aus riskLevel |
| `server/src/services/analytics.service.ts` | +8 / −3 | Server-seitige Risk-Count |
| `server/src/data/demo-seed.ts` | +28 / −5 | 2 neue validatedActions, roundNumber 0-indexed, IT-Ops-Prompt-Update |
| `server/src/services/mirofish/personas.ts` | +2 | Change-Freeze-Sätze im IT-Ops-Preset |

## Kein Refactoring

Alle Änderungen sind punktuell, kein Refactoring, keine neuen Abstraktionen. Zwei Effects in `SimulationPanel.tsx` statt einem, weil die Concerns verschieden sind (Mount-Load vs Auto-Switch-Once).
