# Prüfszenarien: View-Mode entfernen (UC-VIEW-001, THE-793) — VERSIEGELT

> **SEALED — do not open during implementation.** No implementer (subagent or session)
> may read this file. Only the blind verifier opens it, after implementation.

**Spec:** Linear THE-793 mit REQ THE-794 (UI-Weg), THE-795 (Konzept), THE-796 (3D unverändert), THE-797 (Suite/tsc)
**Created:** 2026-11-20 (before implementation)

Arbeitsverzeichnis für Befehle: `packages/client` im Worktree. Basis-Vergleich: `master`.

| ID | REQ | Given / When / Then | Expected observable result | Type |
|----|-----|---------------------|---------------------------|------|
| S-001 | THE-794 | Given der Quelltext des Clients, When `grep -rnE "label=\"2D\"\|label=\"Layers\"\|label=\"3D\"" src/components/ui/Toolbar.tsx`, Then | keine Treffer (Exit-Code 1) | Positive |
| S-002 | THE-794 | Given `src/components/ui/Toolbar.tsx`, When man alle `keydown`-Zweige auf `e.key === '1'`, `'2'`, `'3'` mit `ctrlKey`/`metaKey` prüft (`grep -nE "e.key === '[123]'" src/components/ui/Toolbar.tsx`), Then | keine Treffer | Negative |
| S-003 | THE-794 | Given das Dateisystem, When `test -e src/components/ui/LayerNavigator.tsx`, Then | Exit-Code 1 (Datei existiert nicht); `grep -rn LayerNavigator src` trifft höchstens Test-Dateien | Positive |
| S-004 | THE-794 | Given die laufende App mit geöffnetem Projekt (Browser), When man die Toolbar betrachtet und Ctrl+2, danach Ctrl+3 drückt, Then | keine Schaltfläche „2D“ oder „Layers“ sichtbar; die Kamera bleibt perspektivisch (Elemente bleiben räumliche Körper, kein flacher Draufsicht-Wechsel) | Negative |
| S-005 | THE-795 | Given ein Node-Skript im Client, When `useUIStore.getState()` aus `src/stores/uiStore.ts` gelesen wird, Then | weder `viewMode` noch `setViewMode` ist ein Schlüssel des States | Positive |
| S-006 | THE-795 | Given der Quelltext, When `grep -rnE "2d-topdown\|'layer'\s*\)\|viewMode === \|viewMode !== \|\bis2DMode\b\|\bisLayerMode\b\|\bisLayerView\b\|\bis3D\b" src --include=*.ts --include=*.tsx`, Then | Treffer nur in Test-Dateien, die das Fehlen prüfen; kein Treffer in Produktionscode | Negative |
| S-007 | THE-795 | Given der Quelltext, When `grep -rn "OrthographicCamera" src --exclude=*.test.*`, Then | keine Treffer | Negative |
| S-008 | THE-795 | Given der Quelltext, When `grep -rnE "useViewPositions\|computeViewPositions" src --exclude=*.test.*` und `test -e src/hooks/useViewPositions.ts`, Then | grep ohne Treffer; Datei existiert nicht | Negative |
| S-009 | THE-795 | Given `src/components/3d/LayerPlane.tsx`, When man das Props-Interface liest, Then | kein Prop namens `viewMode` | Negative |
| S-010 | THE-795 | Given andere Begriffe mit ähnlichem Namen, When `grep -rn "plateauViewMode" src/stores/roadmapStore.ts` und `grep -n "type ViewMode" src/components/simulation/SimulationPanel.tsx`, Then | beide weiterhin vorhanden (nicht versehentlich entfernt) | Edge |
| S-011 | THE-796 | Given die laufende App mit einem Projekt mit Elementen, When die Hauptszene lädt, Then | Hintergrund dunkel (#0a0a0a), Elemente als glänzende 3D-Körper mit Glow, Bodengitter sichtbar, Layer-Ebenen geneigt räumlich gestapelt, WorkspaceBar unten sichtbar | Positive |
| S-012 | THE-796 | Given ein Projekt mit mindestens zwei Workspaces, When Pfeil rechts, dann Taste `1`, dann `Home` gedrückt wird (Fokus nicht in einem Eingabefeld), Then | aktiver Workspace wechselt jeweils und die Kamera fliegt hin; `Home` zeigt alle Workspaces | Positive |
| S-013 | THE-796 | Given ein ausgewähltes Element, When `F` gedrückt wird, Then | Kamera fliegt schräg von oben auf das Element (nicht senkrecht von oben) | Positive |
| S-014 | THE-796 | Given X-Ray ist aktiv, When man ein Element in der Sidebar anklickt, Then | Kamera fliegt zur X-Ray-Position des Elements, nicht zur ursprünglichen Position | Edge |
| S-015 | THE-796 | Given die App, When man X-Ray über die Toolbar einschaltet, Then | X-Ray startet direkt, ohne Toast „Switching to 3D for X-Ray mode“ | Edge |
| S-016 | THE-796 | Given die App, When man die Plateau-Ansicht über das Roadmap-Panel einschaltet, Then | Plateau-Ansicht mit PlateauBar erscheint; WorkspaceBar ist währenddessen ausgeblendet | Positive |
| S-017 | THE-796 | Given ein Element im 3D-Modus, When man es mit der Maus zieht, Then | es bewegt sich auf seiner eigenen Layer-Höhe (y bleibt), nicht auf Bodenhöhe | Edge |
| S-018 | THE-797 | Given der Worktree, When `npm test` in `packages/client`, Then | alle Testdateien grün, 0 failed | Positive |
| S-019 | THE-797 | Given `src/components/3d/flyToStation.test.ts`, When `grep -nE "2d-topdown\|\.skip\|\.todo" src/components/3d/flyToStation.test.ts`, Then | keine Treffer (2D-Fälle entfernt, nicht übersprungen) | Negative |
| S-020 | THE-797 | Given shared frisch gebaut und alle `*.tsbuildinfo` im Client gelöscht, When `npx tsc -b` in `packages/client`, Then | Exit-Code 0, keine Ausgabe | Positive |
| S-021 | THE-797 | Given `master` und der Worktree, When `npm run lint` auf beiden, Then | Worktree meldet nicht mehr Fehler als `master` | Negative |
| S-022 | Constraint | Given der Worktree, When `git diff master -- packages/client/src/components/ui/WorkspaceBar.tsx`, Then | leere Ausgabe | Negative |
