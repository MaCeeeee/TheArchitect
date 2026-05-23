# UC-ICM-003 Sprint-Plan — Compliance Demo Experience

**Linear Parent:** [THE-274](https://linear.app/thearchitect/issue/THE-274)
**Demo-Termin:** **2026-06-14 (BSH-Touchpoint)** — alles davor ist Maschinerie, das ist die Story.
**Sprint-Fenster:** Start **2026-05-24** (eine Woche früher als Original-Plan) bis **2026-06-13**.

## Goal: 3-Akt-Demo-Story

| Akt | Wow-Moment | REQ | Linear |
|---|---|---|---|
| **Akt 2** | „Klick auf rotes Element — warum?" Substanz, Quellen, Zitate | REQ-ICM-003.2 PropertyPanel-Tab | [THE-282](https://linear.app/thearchitect/issue/THE-282) |
| **Akt 3** | „Neues Gesetz reinpasten — System mappt automatisch" USP-Beweis | REQ-ICM-003.3 Live-Mapping Modal | [THE-283](https://linear.app/thearchitect/issue/THE-283) |
| **Akt 1** | „So sieht eure Compliance-Lage aus" 5-Sek-Wow über gesamte Architektur | REQ-ICM-003.1 3D Heat-Map | [THE-281](https://linear.app/thearchitect/issue/THE-281) |

**Build-Reihenfolge (Risiko-aufsteigend):** Akt 2 → Akt 3 → Akt 1.
**Demo-Reihenfolge bleibt narrativ:** Akt 1 → Akt 2 → Akt 3.

## Tagesplan (3 Wochen)

### Woche 1 (24.05.–30.05.)

| Tag | Was | REQ | Linear |
|---|---|---|---|
| Sa 24.05. | T0: BSH-Demo-Project Seed + Architecture + Re-Assign 16 Regs + Re-Run Auto-Mapping | – | – |
| So 25.05. | T1.1: compliance.api.ts Client + Store-Slice mappingsByElement | REQ-ICM-003.2 | THE-282 |
| Mo 26.05. | T1.2: PropertyPanel Section „Compliance" + Empty/Loading/Error-States | REQ-ICM-003.2 | THE-282 |
| Di 27.05. | T1.3: Confidence-Bar + Source-Citation-Link + Reasoning-Tooltip + Tests | REQ-ICM-003.2 | THE-282 |
| Mi 28.05. | T2.1: LiveMappingModal.tsx Skeleton + Source-Dropdown + Textarea | REQ-ICM-003.3 | THE-283 |
| Do 29.05. | T2.2: Preview-Button → API-Call → Top-5 Suggestions UI | REQ-ICM-003.3 | THE-283 |
| Fr 30.05. | T2.3: Confirm-Action (Regulation persist + Mappings persist) + Tests | REQ-ICM-003.3 | THE-283 |

### Woche 2 (02.06.–06.06.)

| Tag | Was | REQ | Linear |
|---|---|---|---|
| Mo 02.06. | T3.1: xraySubView 'compliance' Toggle im X-Ray-Menu + Coverage-Berechnung | REQ-ICM-003.1 | THE-281 |
| Di 03.06. | T3.2: CriticalityGlow-basierte HaloMesh-Komponente mit Color-Tier-Mapping | REQ-ICM-003.1 | THE-281 |
| Mi 04.06. | T3.3: useFrame Pulse-Animation + Performance-Tuning (60fps bei 100+ Elements) | REQ-ICM-003.1 | THE-281 |
| Do 05.06. | T3.4: Color-Mapping-Unit-Tests + integration mit complianceStore | REQ-ICM-003.1 | THE-281 |
| Fr 06.06. | Buffer / Polish | – | – |

### Woche 3 (09.06.–13.06.) — Polish + Demo-Rehearsal

| Tag | Was |
|---|---|
| Mo 09.06. | UI-Polish: Loading-States, Animation-Timing, Mobile-Check |
| Di 10.06. | T4.1: Demo-Skript schreiben (`uc-icm-003-demo-script.md`) |
| Mi 11.06. | T4.2: Dry-Run #1 (intern, gegen Local) |
| Do 12.06. | T5: Production-Deploy + Final-E2E gegen Production |
| Fr 13.06. | T4.3: Dry-Run #2 gegen Production + Last-Minute Bugfix-Window |
| Sa 14.06. | **🎯 BSH-Demo (Touchpoint)** |

## REQ-Implementation-Details

### T0 — BSH-Demo-Project Seed (heute Sa 24.05.)

**Problem:** 16 Production-Regs hängen an Test-projectId `507f1f77bcf86cd799439011`, kein Project-Doc, keine ArchiMate-Elements in Neo4j.

**Lösung:** Seed-Script erzeugt:
1. Neuer `User` (demo-Owner, gehasht-Passwort, verified)
2. Neues `Project` (`name: "BSH Demo (UC-ICM-003)"`, `ownerId`)
3. 5 `ArchitectureElement` in Neo4j unter neuer projectId (die 5 BSH-Demo-Elements aus unseren Verify-Scripts)
4. Re-Assign der 16 Regs: `Regulation.updateMany({ projectId: testId }, { projectId: newId })`
5. Re-Run `mapRegulationsBatch` → ~41 Mappings unter neuer projectId

**Files:**
- `packages/server/scripts/seed-bsh-demo.ts` (Standalone, läuft im App-Container)

**Akzeptanz:**
- `db.users` enthält Demo-User
- `db.projects` enthält BSH-Demo-Project mit ownerId=demo-user
- Neo4j enthält 5 `(ArchitectureElement {projectId: newId})` Knoten
- `db.regulations.countDocuments({projectId: newId})` === 16
- `db.compliancemappings.countDocuments({projectId: newId})` >= 40

### T1 — REQ-ICM-003.2 PropertyPanel Compliance-Tab (Akt 2)

**Files:**
- `packages/client/src/services/compliance.api.ts` (neu) — `getMappingsByElement(projectId, elementId)`, `getMappingsByRegulation(projectId, regId)`, `runAutoMapping(projectId)`, `previewLiveMapping(...)`, `confirmMappings(...)`
- `packages/client/src/stores/complianceStore.ts` (erweitern) — neuer Slice `mappingsByElement: Map<elementId, ComplianceMappingDTO[]>`, Action `loadMappingsByElement(elementId)`
- `packages/client/src/components/ui/PropertyPanel.tsx` (erweitern) — neue `<Section title="Compliance">` mit:
  - Loading-Indicator
  - Liste sortiert nach Confidence DESC: pro Item Source-Badge + ParagraphNumber + Confidence-Bar + Reasoning (tooltip on hover)
  - Source-Link: `https://eur-lex.europa.eu/...` für EU-Regs, `https://www.gesetze-im-internet.de/...` für DE-Regs
  - Empty-State: „Keine Compliance-Anforderungen identifiziert"

**Akzeptanz (AC-3, AC-4 von THE-274):**
- Klick auf Element öffnet PropertyPanel → Section „Compliance" sichtbar
- Mappings sortiert nach Confidence DESC
- Source-Link öffnet neue Tab mit korrektem URL
- Confidence-Bar zeigt 0-1 als visueller Balken

### T2 — REQ-ICM-003.3 Live-Mapping Modal (Akt 3)

**Files:**
- `packages/client/src/components/compliance/LiveMappingModal.tsx` (neu)
- `packages/client/src/components/compliance/ComplianceSidebar.tsx` (erweitern) — Button „➕ Neue Regulation testen"

**UI-Flow:**
1. User öffnet Modal via Sidebar-Button
2. Source-Dropdown (NIS2/LkSG/DSGVO/Custom) + Paragraph-Input + Textarea (Gesetzes-Text, max 5000 Chars)
3. Klick „🔍 Vorschläge generieren" → API `/preview` → 5 Suggestion-Cards (Element-Name, Type, Confidence, Reasoning)
4. Pro Suggestion: Checkbox (default-checked wenn confidence ≥ 0.7)
5. Klick „✅ Übernehmen" → API `/confirm` → Regulation + Mappings persistiert
6. Modal schließt, Toast „N Mappings angelegt"

**Akzeptanz (AC-5, AC-6 von THE-274):**
- Modal akzeptiert Text bis 5000 Chars
- Preview-API wird aufgerufen, Top-5 Vorschläge sichtbar < 5 Sek
- Confirm-Action erzeugt Regulation + Mappings via existing API
- Modal-State resetet beim Close

### T3 — REQ-ICM-003.1 3D Compliance Heat-Map (Akt 1)

**Files:**
- `packages/client/src/components/3d/ComplianceHaloMesh.tsx` (neu, Template: `CriticalityGlow.tsx`)
- `packages/client/src/stores/xrayStore.ts` (erweitern) — neue Sub-View `'compliance'`
- `packages/client/src/components/3d/Scene.tsx` (erweitern) — Rendering bei `xraySubView === 'compliance'`

**Coverage-Berechnung (Frontend, aus mappings im Store):**

```typescript
function coverage(elementId: string): 'none' | 'low' | 'medium' | 'high' {
  const ms = mappings.filter(m => m.elementId === elementId);
  if (ms.length === 0) return 'none';      // red
  const maxConf = Math.max(...ms.map(m => m.confidence));
  if (maxConf >= 0.9 && ms.length >= 3) return 'high';      // green
  if (maxConf >= 0.7) return 'medium';                        // yellow
  return 'low';                                                // orange
}
```

**Color-Mapping:**
- `none` → `#ef4444` (red-500)
- `low` → `#f97316` (orange-500)
- `medium` → `#eab308` (yellow-500)
- `high` → `#22c55e` (green-500)

**Akzeptanz (AC-1, AC-2 von THE-274):**
- `xraySubView='compliance'` Toggle sichtbar im X-Ray-Menu
- Heat-Map färbt Elemente korrekt nach Coverage
- 60fps bei 100+ Elements (Pulse-Animation via useFrame)

## RVTM

| REQ | Implementation | Verification |
|---|---|---|
| 003.1 | `ComplianceHaloMesh.tsx` + xraySubView | Color-mapping unit-tests + Visual review |
| 003.2 | `PropertyPanel.tsx` Section + Store-Slice + API | Vitest snapshot + Manual click-through |
| 003.3 | `LiveMappingModal.tsx` + Sidebar-Trigger | Vitest state + Mock-API + Dry-Run |

## Risiken + Mitigation

| Risiko | Wahrsch. | Impact | Mitigation |
|---|---|---|---|
| `PropertyPanel.tsx` ist 1858 Z — adding Section bricht etwas | mittel | mittel | Section minimal-invasiv ans Ende anhängen, vor jedem Edit ein Snapshot-Test laufen |
| 3D Heat-Map Performance bei 100+ Elements | mittel | hoch | `useMemo` für color-mapping, instanced rendering, max 60fps Cap |
| Demo-User Login-Flow funktioniert nicht in Production (OAuth, SMTP) | gering | hoch | Fallback: Direct-DB-User mit Passwort-Hash, kein OAuth |
| 16 Regs sind unter Test-projectId → kein Project-Doc | hoch | mittel | T0 löst das via Seed-Script + Re-Assign |
| ProjektPanel-Klick triggert Compliance-Load auch wenn unnötig | gering | gering | Cache per elementId im Store, max 5min TTL |
| Live-Mapping `/preview` Endpoint ist nicht im UI-Build-Path | gering | mittel | API-Spec mit Backend abgeglichen (steht in compliance.routes.ts) |

## Demo-Skript (Entwurf für T4)

```
Setup: thearchitect.site, BSH-Demo-Project ist offen, 3D-Viewer aktiv.

[Akt 1 — 30 Sekunden]
  • Click X-Ray-Menu → "Compliance"
  • Heat-Map färbt die 5 Elemente: ERP rot, HR-Platform gelb, Personalakte grün, ...
  • Voiceover: "Hier seht ihr eure gesamte Architektur, gefärbt nach Compliance-Abdeckung"

[Akt 2 — 90 Sekunden]
  • Doppel-Click auf "Lieferantenmanagement" (gelb)
  • PropertyPanel öffnet, Tab "Compliance" sichtbar
  • Liste zeigt: LkSG §3 (0.95), LkSG §6 (0.95), NIS2 Art.21 (0.85), ...
  • Click auf "LkSG §3" → öffnet gesetze-im-internet.de in neuem Tab
  • Voiceover: "Jedes Element zeigt, welche Paragraphen es betreffen, mit Confidence und Original-Quelle"

[Akt 3 — 90 Sekunden]
  • Click Sidebar-Button "➕ Neue Regulation testen"
  • Paste Beispiel-Text (z.B. EU-Lieferketten-Direktive Art. 4)
  • Click "Vorschläge generieren"
  • 5 Suggestion-Cards: Lieferantenmanagement (0.95), SAP (0.72), ...
  • Click "Übernehmen"
  • Heat-Map färbt sich neu, Toast "5 Mappings angelegt"
  • Voiceover: "Neue Gesetzes-Anforderung — eingearbeitet in 5 Sekunden. Das macht kein LeanIX, kein SAP."
```

## Definition of Done für UC-ICM-003

- [ ] T0: BSH-Demo-Project + 5 Elements + 16 Regs + ~40 Mappings in Production
- [ ] T1: REQ-ICM-003.2 closed, PropertyPanel-Tab live
- [ ] T2: REQ-ICM-003.3 closed, Live-Mapping-Modal live
- [ ] T3: REQ-ICM-003.1 closed, 3D Heat-Map live
- [ ] T4: Demo-Skript dokumentiert + 2 Dry-Runs bestanden
- [ ] T5: Production-Deploy stable, all 3 Akte funktional vom Browser aus
- [ ] THE-274 closed

## Open Question vor T0

⚠️ **Welcher Demo-User-Account?**
- Option A: Bestehenden Production-User upgraden zum Owner des neuen BSH-Demo-Projects
- Option B: Neuen User `demo-bsh@thearchitect.site` mit fixed Passwort seeden
- Option C: Existing `m.ganzmann.info@gmail.com` Account nutzen

**Empfehlung:** B (sauberer für Demo + reproduzierbarer Seed)
