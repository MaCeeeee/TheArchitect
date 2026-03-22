# UC-ROADMAP-003: Transformation Plateau Comparison View — Manuelle Testcheckliste

## Vorbedingungen

- [ ] Projekt mit ≥10 Architektur-Elementen in mindestens 3 Layern geladen
- [ ] Roadmap generiert (Status: `completed`, ≥2 Waves)
- [ ] Browser: Chrome/Firefox, DevTools Console offen (für Fehler-Monitoring)
- [ ] 3D-Modus aktiv (Default ViewMode)

---

## 1. Aktivierung & Deaktivierung

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 1.1 | Analytics → Roadmap öffnen, Roadmap laden/generieren | "Plateau View" Button erscheint zwischen Timeline und Wave Cards | ☐ |
| 1.2 | ViewMode auf 2D-Topdown wechseln | "Plateau View" Button ist disabled + Tooltip "Switch to 3D view..." | ☐ |
| 1.3 | ViewMode zurück auf 3D, "Plateau View" klicken | Scene wechselt zu N+1 Architekturen nebeneinander; PlateauBar unten, PlateauHUD rechts oben | ☐ |
| 1.4 | "Plateau View" erneut klicken (= Exit) | Normale 3D-Architektur wird wiederhergestellt; PlateauBar + HUD verschwinden | ☐ |
| 1.5 | Plateau View aktiv → Roadmap auf `null` setzen ("New Roadmap") | Plateau View deaktiviert sich automatisch | ☐ |

## 2. Plateau Rendering (3D Scene)

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 2.1 | Plateau View aktivieren mit 3-Wave-Roadmap | 4 Architekturen nebeneinander (As-Is + 3 Waves), je 40 Einheiten versetzt | ☐ |
| 2.2 | Jedes Plateau prüfen | 8 TOGAF Layer-Planes pro Plateau sichtbar | ☐ |
| 2.3 | Plateau 0 (As-Is) prüfen | Alle Elemente in Layer-Default-Farben, keine pulsierenden Elemente | ☐ |
| 2.4 | Plateau 1 (Wave 1) prüfen | Geänderte Elemente: Status-Farbe (amber=#f59e0b für transitional, grün=#22c55e für target, rot=#ef4444 für retired) | ☐ |
| 2.5 | Geänderte Elemente in selektiertem Plateau | Pulsierende Glow-Animation + farbiger Ring am Fuß + Transition-Badge "current → transitional" | ☐ |
| 2.6 | Gleiche Elemente im nächsten Plateau | Pulsieren NICHT (isChanged=false), zeigen aber kumulativen Status | ☐ |
| 2.7 | Retired Elements | 40% Opacity, rote Farbe (#ef4444) | ☐ |
| 2.8 | Plateau-Label über Strategy-Layer | "As-Is" für Plateau 0, "Wave N: {name}" für folgende, Change-Count in Klammern | ☐ |

## 3. LOD (Level of Detail)

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 3.1 | Plateau 0 selektieren | Plateau 0 und 1: volle Geometrie + Labels + Glow; Plateau 2+: vereinfachte Spheres, keine Labels | ☐ |
| 3.2 | Plateau 2 selektieren | Plateau 1, 2, 3: voll; Plateau 0 und 4+: vereinfacht | ☐ |
| 3.3 | FPS bei ≥100 Elementen × 5 Plateaus prüfen | >30 FPS (DevTools Performance Tab oder Stats.js) | ☐ |

## 4. Connection Lines

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 4.1 | Intra-Plateau Connections im selektierten Plateau | Bestehende Connections sichtbar mit Opacity 0.15 (unveränderte) und 0.4 (mit geänderten Endpoints) | ☐ |
| 4.2 | Intra-Plateau Connections in distant Plateaus (>±1) | Nicht gerendert (LOD) | ☐ |
| 4.3 | Cross-Plateau Dependencies | Amber (#fbbf24) dashed Linien zwischen abhängigen Elementen über Waves hinweg, Arc-Höhe ~6 Einheiten | ☐ |

## 5. PlateauBar (Bottom Navigation)

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 5.1 | Tab-Leiste sichtbar | Tabs: "As-Is", "W1", "W2", "W3"... mit Change-Count und kumulativen Kosten | ☐ |
| 5.2 | Klick auf Tab "W2" | Kamera fliegt zu Plateau 2 (offsetX=80), Tab wird aktiv (grüner Border + Glow) | ☐ |
| 5.3 | ← / → Buttons | Navigation zum vorherigen/nächsten Plateau + Camera fly-to | ☐ |
| 5.4 | Home-Button | Kamera fliegt zurück und zeigt alle Plateaus | ☐ |
| 5.5 | "Full" / "Changed" Toggle | Full: alle Elemente sichtbar; Changed: nur Elemente die in irgendeiner Wave vorkommen | ☐ |

## 6. PlateauHUD (Top-Right Metrics)

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 6.1 | Plateau 0 (As-Is) selektiert | Label: "PLATEAU: AS-IS", Cost=€0, Risk Delta=0, Changes=— | ☐ |
| 6.2 | Plateau 2 selektiert | Kumulative Kosten (Summe Wave 1+2), Risk Delta, Change Count, Avg Fatigue | ☐ |
| 6.3 | Compliance Fixes Badge | Nur sichtbar wenn complianceImpact > 0 | ☐ |

## 7. Keyboard Navigation

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 7.1 | ← Pfeil | Vorheriges Plateau selektiert + Camera fly | ☐ |
| 7.2 | → Pfeil | Nächstes Plateau selektiert + Camera fly | ☐ |
| 7.3 | Tasten 1-9 | Sprung zu Plateau N (1=As-Is, 2=Wave 1, ...) | ☐ |
| 7.4 | Home-Taste | Fit all Plateaus in Viewport | ☐ |
| 7.5 | Keyboard in Input-Feld (z.B. Search) | Keine Plateau-Navigation (Event wird ignoriert) | ☐ |

## 8. Guards & Mutual Exclusion

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 8.1 | Plateau aktiv → X-Ray Toggle klicken | Plateau deaktiviert → X-Ray aktiviert | ☐ |
| 8.2 | X-Ray aktiv → Plateau View klicken | X-Ray deaktiviert → Plateau aktiviert | ☐ |
| 8.3 | Plateau aktiv → ViewMode auf 2D wechseln | Plateau View wird automatisch deaktiviert | ☐ |
| 8.4 | Plateau aktiv → ViewMode auf Layer wechseln | Plateau View wird automatisch deaktiviert | ☐ |
| 8.5 | ViewMode=2D → "Plateau View" Button | Disabled, nicht klickbar | ☐ |

## 9. Element Interaction

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 9.1 | Klick auf Element in Plateau | Element wird selektiert (Sidebar zeigt Details) | ☐ |
| 9.2 | Klick auf geändertes Element | Sidebar zeigt Elementdetails inkl. Status | ☐ |
| 9.3 | Klick auf leeren Bereich | Selection wird cleared | ☐ |

## 10. Edge Cases

| # | Testfall | Erwartetes Ergebnis | Status |
|---|----------|---------------------|--------|
| 10.1 | Roadmap mit 1 Wave | 2 Plateaus (As-Is + Wave 1) | ☐ |
| 10.2 | Roadmap mit 8 Waves (Maximum) | 9 Plateaus, LOD greift bei distant Plateaus | ☐ |
| 10.3 | Wave ohne Änderungen (leere elements[]) | Plateau zeigt alle Elemente unverändert, Change Count = 0 | ☐ |
| 10.4 | Projekt ohne Elemente | Plateau View Button sollte nicht crashen; leere Plateaus | ☐ |
| 10.5 | Roadmap mit Status `generating` | "Plateau View" Button ist nicht sichtbar | ☐ |
| 10.6 | Browser-Resize während Plateau View aktiv | Layout passt sich an, keine visuellen Artefakte | ☐ |
| 10.7 | Schnelles Wechseln zwischen Plateaus (Keyboard-Spam) | Kein Crash, Camera interpoliert sauber | ☐ |

---

## Zusammenfassung

| Kategorie | Tests | Must | Should | Could |
|-----------|-------|------|--------|-------|
| Aktivierung | 5 | 5 | 0 | 0 |
| Rendering | 8 | 6 | 2 | 0 |
| LOD | 3 | 2 | 1 | 0 |
| Connections | 3 | 1 | 2 | 0 |
| PlateauBar | 5 | 3 | 1 | 1 |
| PlateauHUD | 3 | 1 | 2 | 0 |
| Keyboard | 5 | 2 | 3 | 0 |
| Guards | 5 | 5 | 0 | 0 |
| Interaction | 3 | 1 | 2 | 0 |
| Edge Cases | 7 | 3 | 2 | 2 |
| **Gesamt** | **47** | **29** | **13** | **3** |
