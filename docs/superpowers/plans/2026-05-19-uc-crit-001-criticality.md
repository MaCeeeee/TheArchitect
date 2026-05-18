# UC-CRIT-001 — Neuralgische Punkte at-a-Glance Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or step-by-step single-session.

**Goal:** Architekt sieht in 3 Sekunden die kritischsten Architektur-Punkte — 3D-Glow + Sidebar-Top-10 — basierend auf einem 7-Faktor-Composite-Score.

**Architecture:** Pure-function Score-Engine (`criticality.service.ts`) → REST `GET /:projectId/criticality` → MongoDB-Cache → React-Hook → 3D-Glow + Sidebar-Widget + Drill-Down-Popover.

**Tech Stack:** Express/TypeScript, Mongoose, Neo4j (cycle-detection via Cypher), React Three Fiber (Shader), Zustand-Store, vitest/jest.

**Linear:** [THE-264](https://linear.app/thearchitect/issue/THE-264) Parent + REQs THE-265 bis THE-271.

---

## WSJF-Scoring (Sum/40 × 100)

| REQ | Titel | Sum | WSJF | Slice |
|---|---|---|---|---|
| REQ-CRIT-001 | Score-Engine (pure function) | 32 | **80.0** | Slice 1 (Foundation) |
| REQ-CRIT-002 | Backend-Route | 30 | **75.0** | Slice 2 |
| REQ-CRIT-004 | Sidebar-Widget | 29 | **72.5** | Slice 4 |
| REQ-CRIT-003 | 3D-Glow | 27 | **67.5** | Slice 5 (Demo-Wow) |
| REQ-CRIT-005 | Drill-Down-Popover | 26 | **65.0** | Slice 6 |
| REQ-CRIT-006 | Cache + Recompute | 21 | 52.5 | Sprint-5 Polish |
| REQ-CRIT-007 | Settings UI | 17 | 42.5 | Sprint-5 Polish |

**Sprint-4-Scope (5 von 7 REQs):** 1, 2, 4, 3, 5 — bringt das **vollständige Demo-Feature** live.
**Sprint-5-Scope (2 REQs):** 6 (Cache), 7 (Settings) — Polish.

---

## Foundation existiert

✅ Element-Properties `riskLevel` (low/medium/high/critical) + `maturityLevel` (0-5) in shared types
✅ Neo4j-Graph mit `CONNECTS_TO`-Edges (kann Degree + Cycles berechnen)
✅ StandardMapping-Model (für Compliance-Gap-Faktor)
✅ Roadmap-Waves + Cost-Field (für Cost-Burden-Faktor)
✅ EmergenceMetrics-Service (für Stakeholder-Bottleneck-Faktor)
✅ `portfolio.service.ts` hat schon `criticalityDistribution` als Lazy-Inspiration

→ **Wir bauen "nur" den Composite-Score + Frontend-Visualization. ~8h Tag-1.**

---

## File Structure

**Server (NEU):**
- `packages/server/src/services/criticality.service.ts` (pure function, 7 Faktoren)
- `packages/server/src/services/criticality.cypher.ts` (Cycle-Detection + Degree-Queries)
- `packages/server/src/__tests__/criticality.service.test.ts` (10+ tests)
- `packages/server/src/routes/architecture.routes.ts` (1 neue Route)
- `packages/server/src/__tests__/criticality.routes.test.ts` (5+ supertests)
- `packages/server/src/models/CriticalityCache.ts` (Sprint-5)

**Shared:**
- `packages/shared/src/types/criticality.types.ts` (neu)

**Client (NEU):**
- `packages/client/src/components/3d/CriticalityGlow.tsx`
- `packages/client/src/components/ui/CriticalHotspotsWidget.tsx`
- `packages/client/src/components/ui/CriticalityBreakdownPopover.tsx`
- `packages/client/src/hooks/useCriticality.ts`
- `packages/client/src/services/criticality.api.ts`
- `packages/client/src/stores/criticalityStore.ts` (Zustand)

**Modified:**
- `packages/client/src/components/3d/ArchitectureScene.tsx` (Glow-Layer mounten)
- `packages/client/src/components/ui/Sidebar.tsx` (Widget integrieren)

---

## Slice 1: Composite-Score-Engine (REQ-CRIT-001)

**Approach:** Pure function. 7 Sub-Calculators als eigene Functions. Composition mit Weights. DI-Hooks für externe Daten (cycles, degrees aus Neo4j).

**Key Design Decisions:**
- **Normalisierung** pro Faktor mit project-wide-Statistik: jeder Faktor wird relativ zum max im Projekt skaliert (sonst dominiert ein Outlier).
- **Mehrere Modi möglich**: relative (default) oder absolute (fixe Threshold-Cutoffs).
- **Empty-Project**: leere Map zurückgeben.

**Test-Strategie:** Pro Faktor mind. 1 happy-path + 1 edge-case Test. Plus 3 Composition-Tests.

## Slice 2: Backend-Route (REQ-CRIT-002)

Lädt elements + connections + standardMappings + roadmapWaves parallel, calls Score-Engine, returns Top-N. Cycle-Detection mit Cypher `MATCH p=(n)-[:CONNECTS_TO*1..5]->(n)` mit Timeout.

## Slice 3: Frontend API + Hook + Store (REQ-CRIT-001/004 plumbing)

useCriticality hook fetcht `/:projectId/criticality?topN=10`. Zustand-Store hält top-N-Liste + selectedHotspot.

## Slice 4: Sidebar-Widget (REQ-CRIT-004)

Top-10-Liste in Sidebar. Click → fitToScreen + openPropertyPanel.

## Slice 5: 3D-Glow (REQ-CRIT-003)

`<CriticalityGlow>` Component liest Store → rendert für jede Top-N-Element einen Pulsing-Halo via Shader oder Spritesheet. Performance-Test bei 10 Halos im 200-Element-Scene.

## Slice 6: Drill-Down-Popover (REQ-CRIT-005)

Click auf Hotspot → Popover mit Faktor-Breakdown (Mini-Bars) + Suggested-Actions.

## Slice 7: Deploy + Verify

Bekannter Workflow (siehe deployment_pitfalls_2026_05_17): rsync mit `.env*`-exclude + `--force-recreate app`.

---

## Aufwand

| Slice | Was | Aufwand |
|---|---|---|
| 1 | Score-Engine + 10 Tests | 2h |
| 2 | Route + Cypher + 5 Supertests | 1.5h |
| 3 | API + Hook + Store | 1h |
| 4 | Sidebar-Widget | 1.5h |
| 5 | 3D-Glow | 2h |
| 6 | Popover + Actions | 1h |
| 7 | Deploy + Smoke | 1h |
| **Total** | | **~10h** (Tag 1 + halber Tag 2) |

---

## Risiken

1. **Faktor-Gewichtung subjektiv** — Default 1.0 für alle, später per Workspace-Setting konfigurierbar (REQ-CRIT-007 Sprint 5)
2. **Cycle-Detection Performance** auf großen Graphs — Limit max-depth=5, Timeout 2s, fallback "keine Cycles detected"
3. **3D-Glow FPS-Drop** — limit auf Top-10, lazy-load Shader, fallback auf Bounding-Box-Outline ohne Shader
4. **Normalisierung-Edge-Case** wenn nur 1 Element → degeneriert, dann skip Score

---

## Demo-Story für BSH

> *"Du öffnest das BSH-ESG-Projekt. Innerhalb von 3 Sekunden glüht **'SAP S/4HANA'** rot — der Score sagt 87/100. In der Sidebar rechts steht 'Critical Hotspots' mit Top-10. Du klickst SAP, das Popover öffnet: 'Single-Point-of-Failure dominant (32 Punkte), plus Risk×Connectivity 24, plus Maturity-Floor 15'. Suggested Action: 'Apply Redundancy-Pattern aus der Pattern-Library'.
>
> Du klickst — 'Pattern applied: managed-message-queue v1.0.0' — und der Score sinkt im Recompute auf 62/100. Glow wechselt von rot zu gelb.
>
> **3 Sekunden zur Diagnose, 30 Sekunden zur Lösung.** LeanIX-Equivalent: 2 Stunden Excel-Pivot + Risk-Workshop + Roadmap-Replanning."*
