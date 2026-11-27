# RVTM: View-Mode entfernen (UC-VIEW-001, THE-793)

**Spec:** Linear THE-793 mit REQ THE-794 … THE-797
**Plan:** `docs/superpowers/plans/2026-11-20-the793-view-mode-entfernen.md`
**Zweig:** `feat/uc-view-001-nur-3d` auf origin/master a0472be (uncommitted; am 27.11. von 576c39a rebased)
**Created:** 2026-11-20
**Last Updated:** 2026-11-27 (nach Rebase auf a0472be und Browser-Beweis)

**Score:** WSJF 21/40 = 52,5 · Ousterhout: alle fünf Dimensionen niedrig; Watch-Point: 3D-Positionen und Kamera unverändert.
**Netto-Delta:** 22 Dateien, +151 / −735 Zeilen (plus neuer Wächter-Test). Davon 5 Dateien aus dem Rebase: neuer Master-Code (#211, #214) benutzte noch `viewMode` und `focusedLayer`.
**Browser-Belege:** 12 Bilder, lokal im Worktree unter `docs/evals/the793-browserbeweis/`, nicht eingecheckt (das Repo führt keine Bilder unter `docs/`; Zweig auf :3013, unveränderter Master auf :3000, selbes Projekt, selbes Fenster 1440×900).

## Traceability Matrix

| ID | Requirement | Plan Task | Files Changed | Verification | Status | Evidence |
|----|-------------|-----------|---------------|--------------|--------|----------|
| R-001 | Toolbar zeigt keine View-Mode-Gruppe (THE-794) | Task 5, Step 1 | `ui/Toolbar.tsx` | Wächter-Test; blind S-001; Browser | PASS | Code: keine `label="3D/2D/Layers"` (blind PASS). Browser 27.11.: Toolbar hat 31 Schaltflächen, keine heißt 3D/2D/Layers; der Master zeigt im selben Projekt alle drei (Bild 01) |
| R-002 | Ctrl/⌘+1/2/3 schalten keine Ansicht um (THE-794) | Task 5, Step 1 | `ui/Toolbar.tsx` | blind S-002; Browser | PASS | Code: kein `e.key === '1/2/3'`-Zweig (blind PASS). Browser 27.11.: Ctrl+2 und Ctrl+3 gedrückt, Szene unverändert (Bild 01); Ctrl/⌘+1/2/3 werden nicht mehr abgefangen (`defaultPrevented` = false) |
| R-003 | `LayerNavigator` existiert nicht mehr (THE-794) | Task 4, Step 2 | `ui/LayerNavigator.tsx` (gelöscht) | Wächter-Test; blind S-003 | PASS | Datei fehlt; nur Treffer im Wächter-Test |
| R-004 | uiStore ohne `ViewMode`/`viewMode`/`setViewMode` (THE-795) | Task 6, Step 2 | `stores/uiStore.ts`; nach Rebase auch `groups/sceneSelectable.ts` und vier Tests | Wächter-Test 1; blind S-005 | PASS | Store-State: `viewMode`/`setViewMode` fehlen (55 Keys; Basis 59) |
| R-005 | Keine Verzweigung nach is3D/is2D/isLayerMode/isLayerView (THE-795) | Task 2–5 | 3D-Komponenten, Scene, Toolbar, RoadmapPanel | Wächter-Test 2; Rest-Grep; blind S-006 | PASS | 0 Treffer für `2d-topdown`, `is2DMode`, `isLayerMode`, `isLayerView`, `is3D`. Blind S-006 FAIL ist ein Szenario-Fehler (Regex trifft SimulationPanel-`viewMode` und `csvParser` `'layer'`, beide unverändert seit Basis, S-010 verlangt ihren Erhalt) |
| R-006 | `useViewPositions`/`computeViewPositions` entfernt (THE-795) | Task 3 | `hooks/useViewPositions.ts` (gelöscht), `ArchitectureElements`, `NodeObject3D`, `ConnectionLines` | blind S-008; Review | PASS | grep 0 Treffer, Datei fehlt; Review: in 3D war der Hook Identität |
| R-007 | Nur Perspektiv-Kamera (THE-795) | Task 2, Step 7 | `3d/ViewModeCamera.tsx` | blind S-007 | PASS | `OrthographicCamera` 0 Treffer außerhalb Tests |
| R-008 | `LayerPlane` ohne `viewMode`-Prop (THE-795) | Task 3, Step 5 | `3d/LayerPlane.tsx`, `PlateauRenderer.tsx`, `Scene.tsx` | blind S-009; tsc | PASS | Props: layerId, label, yPosition, color, offsetX?, workspaceName? |
| R-009 | 3D-Licht, Hintergrund, HDRI, Grid, Bloom, HUDs wie vorher (THE-796) | Task 4, Step 1 | `3d/Scene.tsx` | Review gegen `git show HEAD:`; Browser | PASS | Review Chunk 2: jeder Wert = alter 3D-Wert. Browser 27.11.: Startansicht Zweig gegen Master: 56 von 207.060 Pixeln der Szene weichen ab (0,03 %, Bild 01). X-Ray-HUD und Plateau-HUD erscheinen (Bilder 07, 09) |
| R-010 | Fly-to-Helfer wie vorher in 3D, inkl. X-Ray (THE-796) | Task 2 | `3d/ViewModeCamera.tsx`, `flyToStation.test.ts` | Tests; Review; Browser | PASS | flyToStation 7/7; Review Chunk 1: 3D-Zweige wörtlich. Browser 27.11.: F fliegt zum gewählten Element, auch bei eingeschaltetem X-Ray (Bilder 03, 05) |
| R-011 | Pfeiltasten, 1–9, Home wechseln Workspaces (THE-796) | Task 2, Step 7 | `3d/ViewModeCamera.tsx` | Review; Browser | PARTIAL | Review: Handler = alter 3D-Pfad. Browser 27.11.: Home fährt die Kamera in die Übersicht (Bild 06); Pfeil rechts, Pfeil unten und 1 lösen keinen Fehler aus. Offen: Das Testprojekt hat nur einen Workspace, der Wechsel zwischen zwei Workspaces ist im Browser nicht gezeigt |
| R-012 | Drag, Labels, Risiko-Licht, Hypothesen-Ring wie vorher (THE-796) | Task 3, Step 2 | `3d/NodeObject3D.tsx`, `ArchiMateIconSprite.tsx`, `PlateauElement.tsx` | Review; Browser | PARTIAL | Review: dragY = position3D.y, Ring 1.15, Label 3D-Stil. Browser 27.11.: Element gezogen, X 3 → 5, Y bleibt 8, Z bleibt 0; nach Neuladen steht es an der neuen Stelle (Bilder 04, 08). Label und Auswahlring sichtbar (Bild 02). Offen: Risiko-Licht nur im X-Ray gesehen, Hypothesen-Ring nicht (das Testprojekt hat keine Hypothese) |
| R-013 | Plateau-Ansicht und X-Ray einschaltbar (THE-796) | Task 4, Task 5 | `Scene.tsx`, `Toolbar.tsx`, `RoadmapPanel.tsx` | Review; Browser | PASS | Review: X-Ray ruft `toggleXRay` direkt, Plateau-Guard entfällt. Browser 27.11.: X-Ray über „More actions“ ein und aus; Plateau-Ansicht aus dem Roadmap-Panel eingeschaltet, 19 von 207.060 Pixeln weichen vom Master ab (0,009 %, Bild 07) |
| R-014 | Client-Suite grün, 2D-Fälle entfernt statt übersprungen (THE-797) | Task 2 Step 1, Task 6 Step 4 | `flyToStation.test.ts`, `uiStore.viewMode.test.ts` (neu) | `npm test`; blind S-018/S-019 | PASS | Nach Rebase (27.11.): 81 Dateien / 744 Tests passed, 0 failed, Exit 0; kein `.skip/.todo`. Der 2D-Fall in `sceneSelectable.test.ts` ist entfernt, nicht übersprungen. (Stand 21.11. auf 576c39a: 68 / 536, Exit 1 wegen 4 vorbestehender Teardown-Fehler) |
| R-015 | `tsc -b` kalt 0 Fehler (THE-797) | Task 6, Step 4 | — | shared bauen, tsbuildinfo löschen, `npx tsc -b`; blind S-020 | PASS | Nach Rebase (27.11.): shared clean gebaut, tsbuildinfo gelöscht, `npx tsc -b` exit 0, keine Ausgabe. (21.11.: Kontrolle mit injiziertem Fehler meldete TS2322) |
| R-016 | Keine neuen ungenutzten Bezeichner (THE-797; ESLint nicht eingerichtet) | Task 1 Step 3, Task 6 Step 4 | — | `--noUnusedLocals`-Zählung | PASS | Nach Rebase (27.11.): 103 → 102 (Master a0472be → Zweig). 21.11.: 107 → 106. Blind S-021 UNEXECUTABLE (ESLint fehlt auf beiden Seiten) |
| C-001 | `WorkspaceBar.tsx` unverändert | alle | — | blind S-022 | PASS | `git diff a0472be -- …/WorkspaceBar.tsx` leer |
| C-002 | Kein Commit, kein Push ohne PO-Freigabe | alle | — | `git log origin/master..HEAD` | PASS | 0 Commits |
| C-003 | `plateauViewMode` und `SimulationPanel`-`ViewMode` unverändert | alle | — | blind S-010 | PASS | beide vorhanden |

## Coverage Summary

- **Total Requirements:** 19
- **Verified (PASS):** 17
- **Partial (Code belegt, Browser nur zum Teil):** 2 (R-011, R-012)
- **Failed (FAIL):** 0
- **Coverage:** 89 % voll, 100 % mindestens im Code belegt
- **Nicht im Browser gezeigt:** Wechsel zwischen zwei Workspaces (R-011), Hypothesen-Ring und Risiko-Licht außerhalb von X-Ray (R-012). Dafür gilt bisher nur der Code-Review vom 21.11.

## Blinde Prüfung (21.11.)

12/22 PASS · 1 FAIL (S-006, Szenario-Fehler: Regex zu breit, Treffer vorbestehend und von S-010 geschützt) · 9 UNEXECUTABLE (8 Browser-Szenarien ohne Login, S-021 ESLint fehlt). Die versiegelte Datei konnte nicht nachgeschärft werden (Hook sperrt Edit).

## Blinde Prüfung (27.11., frischer Prüfer auf dem rebasten Stand a0472be)

11/22 PASS · 1 FAIL (S-006) · 10 UNEXECUTABLE.

- **S-006 (FAIL, zum zweiten Mal, gleiche Diagnose):** 11 Treffer in `csvParser.ts`, `SimulationPanel.tsx` und `deriveViolationFix.test.ts`. Keine dieser Dateien ist geändert, der Master a0472be hat dieselben Zeilen. In allen geänderten Dateien sind die Treffer weg (Master: 116 Zeilen in 16 Dateien, Zweig: 12). Die neun Treffer in `SimulationPanel.tsx` betreffen das lokale `viewMode`, dessen Erhalt S-010 verlangt. Loop-Budget: 2 von 3. Ein dritter Lauf bringt dasselbe Ergebnis, solange das Szenario nicht geändert wird; das entscheidet der PO.
- **S-002 (diesmal UNEXECUTABLE statt PASS):** Der Prüfer hat nur den genannten grep ausgeführt (kein Treffer) und den Handler nicht gelesen. Der Browser-Beweis deckt die Lücke: Ctrl+2 und Ctrl+3 ändern nichts, und Ctrl/⌘+1/2/3 werden nicht abgefangen (R-002).
- **S-004, S-011 … S-017:** brauchen einen Browser, der Prüfer hat keinen. Die Browser-Belege oben stammen vom Implementierer, nicht vom blinden Prüfer.
- **S-021:** ESLint ist im Repo nicht eingerichtet, auf Master wie auf dem Zweig.
- S-018 und S-020 bestätigt der Prüfer unabhängig: 81 Dateien / 744 Tests, Exit 0; `tsc -b` kalt Exit 0.

## Change Log

| Date | Change | Affected IDs | Author |
|------|--------|-------------|--------|
| 2026-11-20 | Initial RVTM created | R-001..R-016, C-001..C-003 | Plan phase |
| 2026-11-20 | Plan-Review: Lint-Kriterium auf `--noUnusedLocals` umgestellt (ESLint fehlt) | R-016 | Plan phase |
| 2026-11-21 | Chunk 1 (Task 1–3) gebaut, Spec- + Qualitätsreview ohne Befund | R-003..R-008, R-010, R-012 | Execution |
| 2026-11-21 | Chunk 2 (Task 4–6) gebaut, Spec- + Qualitätsreview ohne Befund; Teardown-Fehler auf Basis reproduziert | R-001, R-002, R-004, R-009, R-013..R-016 | Execution |
| 2026-11-21 | Blinde Prüfung 12/22 PASS, 0 echte Fehlschläge | alle | Blind verifier |
| 2026-11-27 | Rebase von 576c39a auf a0472be (9 Commits), kein Textkonflikt. Neuer Master-Code zog nach: `groups/sceneSelectable.ts` ohne `is3D`, vier Tests ohne `viewMode`/`focusedLayer` | R-004, R-005, R-014..R-016 | Execution |
| 2026-11-27 | Browser-Beweis mit lokalem Testkonto (Demo-Projekt, 28 Elemente): R-001, R-002, R-009, R-010, R-013 von PARTIAL auf PASS; R-011 und R-012 bleiben PARTIAL | R-001, R-002, R-009..R-013 | Execution |
| 2026-11-27 | Blinde Prüfung auf a0472be: 11/22 PASS, 1 FAIL (S-006, Szenario trifft unveränderte Dateien), 10 UNEXECUTABLE | alle | Blind verifier |
