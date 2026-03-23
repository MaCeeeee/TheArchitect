# MiroFish Phase 3 — User & Usability Test Script

> **Ziel:** Vollständige manuelle Verifikation von Custom Persona Editor + Run-Vergleich vor Deployment.
> **Voraussetzung:** `npm run dev` läuft, mindestens ein Projekt mit Architecture-Elementen existiert.
> **Testdauer:** ~45-60 Minuten

---

## Vorbereitung

- [ ] Dev-Server gestartet (`npm run dev`)
- [ ] Browser geöffnet (Chrome/Firefox, DevTools Console sichtbar)
- [ ] In TheArchitect eingeloggt
- [ ] Projekt mit mindestens 5 Architecture-Elementen geöffnet (verschiedene Layers/Domains)
- [ ] Sidebar → Scenarios Tab ist sichtbar

---

## Teil A: Custom Persona Editor

### A1. Persona-Laden (GET /personas)

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| A1.1 | Scenarios Tab öffnen → Config-View | 5 Preset-Personas werden geladen und angezeigt (CTO, Business Unit Lead, IT Operations Manager, Data Architect, Security Officer) | ☐ |
| A1.2 | Jede Preset-Karte prüfen | Name, Stakeholder-Typ, Budget, Kapazität werden angezeigt | ☐ |
| A1.3 | Console prüfen | Keine Fehler beim Laden der Personas | ☐ |
| A1.4 | "Custom Personas" Sektion prüfen | Leer (noch keine erstellt), oder mit passender Empty-State-Nachricht | ☐ |

### A2. Persona klonen (Clone from Preset)

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| A2.1 | Bei CTO-Karte auf "Clone" klicken | PersonaEditor Modal öffnet sich | ☐ |
| A2.2 | Header prüfen | "Clone & Customize" + "Based on: Chief Technology Officer" | ☐ |
| A2.3 | Name-Feld prüfen | Vorausgefüllt: "Chief Technology Officer (Custom)" | ☐ |
| A2.4 | Scope-Selector prüfen | Zwei Radio-Buttons: "Project (shared)" und "Personal (portable)", "Project" vorausgewählt | ☐ |
| A2.5 | Vorausgefüllte Felder prüfen | StakeholderType, Layers, Domains, Budget, Risk, Capacity, Priorities, SystemPrompt — alle vom CTO-Preset übernommen | ☐ |
| A2.6 | Name ändern auf "CFO Custom" | Input akzeptiert Eingabe | ☐ |
| A2.7 | Einen Layer deaktivieren (z.B. "technology" abwählen) | Toggle wechselt von grün zu grau, Layer verschwindet aus Auswahl | ☐ |
| A2.8 | Budget auf 500000 setzen | Number-Input akzeptiert Wert | ☐ |
| A2.9 | Priority hinzufügen: "Cost Reduction" eingeben + Enter | Neuer Tag erscheint in der Priorities-Liste | ☐ |
| A2.10 | Priority entfernen: auf Trash-Icon eines bestehenden Tags klicken | Tag verschwindet | ☐ |
| A2.11 | SystemPromptSuffix ändern | Textarea akzeptiert Text | ☐ |
| A2.12 | Description eingeben: "Test persona for CFO perspective" | Input akzeptiert Text | ☐ |
| A2.13 | "Create Persona" klicken | Toast "Custom persona created", Modal schließt sich | ☐ |
| A2.14 | Custom Personas Sektion prüfen | Neue "CFO Custom" Persona erscheint mit Scope-Badge | ☐ |

### A3. Validierung

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| A3.1 | Erneut Clone öffnen, Name leer lassen, Save klicken | Toast Error: "Name is required" | ☐ |
| A3.2 | Alle Layers deaktivieren, Save klicken | Toast Error: "At least one layer must be visible" | ☐ |
| A3.3 | Alle Domains deaktivieren, Save klicken | Toast Error: "At least one domain must be visible" | ☐ |
| A3.4 | Alle Priorities entfernen, Save klicken | Toast Error: "At least one priority is required" | ☐ |
| A3.5 | Cancel klicken | Modal schließt sich ohne Änderungen | ☐ |
| A3.6 | Außerhalb des Modals klicken (Backdrop) | Modal schließt sich | ☐ |
| A3.7 | Duplicate Priority eingeben | Wird nicht hinzugefügt (stilles Ignorieren) | ☐ |

### A4. Persona bearbeiten (Edit)

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| A4.1 | Bei "CFO Custom" auf "Edit" klicken | PersonaEditor öffnet sich mit Header "Edit Persona" | ☐ |
| A4.2 | Scope-Selector prüfen | NICHT sichtbar (Scope nicht editierbar) | ☐ |
| A4.3 | Name ändern auf "CFO v2" | Input akzeptiert | ☐ |
| A4.4 | Risk Threshold auf "critical" ändern | Select akzeptiert | ☐ |
| A4.5 | "Update" klicken | Toast "Persona updated", Modal schließt | ☐ |
| A4.6 | Persona-Liste prüfen | Name zeigt jetzt "CFO v2", Risk Threshold aktualisiert | ☐ |

### A5. Persona löschen (Delete)

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| A5.1 | Bei "CFO v2" auf "Delete" klicken | Persona wird gelöscht (ggf. mit Bestätigung) | ☐ |
| A5.2 | Custom Personas Sektion prüfen | "CFO v2" ist verschwunden | ☐ |
| A5.3 | Preset-Personas prüfen | Unverändert (Presets können nicht gelöscht werden) | ☐ |

### A6. Custom Persona in Simulation verwenden

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| A6.1 | Neue Custom Persona erstellen (z.B. "Compliance Officer") | Erfolgreich erstellt | ☐ |
| A6.2 | Custom Persona zur Simulation hinzufügen ("Add"-Button) | Persona erscheint in der Agents-Liste | ☐ |
| A6.3 | 1-2 Preset-Personas ebenfalls hinzufügen | Gemischte Agents-Liste (Preset + Custom) | ☐ |
| A6.4 | Simulation starten | Simulation startet ohne Fehler | ☐ |
| A6.5 | Simulation abwarten bis Abschluss | Alle Agents (inkl. Custom) haben Turns, Ergebnisse sind plausibel | ☐ |
| A6.6 | Results prüfen | Custom Persona erscheint in Per-Agent Fatigue, Fatigue Scorecard | ☐ |

### A7. Dual Scope Test

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| A7.1 | Persona mit Scope "Project (shared)" erstellen | Erfolgreich | ☐ |
| A7.2 | Persona mit Scope "Personal (portable)" erstellen | Erfolgreich | ☐ |
| A7.3 | Anderes Projekt öffnen, Personas laden | User-scoped Persona sichtbar, Project-scoped vom alten Projekt NICHT sichtbar | ☐ |
| A7.4 | Zurück zum Original-Projekt | Beide Personas sichtbar | ☐ |

---

## Teil B: Run-Vergleich (Side-by-Side)

### B0. Vorbereitung — Zwei abgeschlossene Runs

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B0.1 | Falls noch nicht vorhanden: Simulation #1 durchführen (z.B. "Cloud Migration", 3 Agents) | Run abgeschlossen (completed) | ☐ |
| B0.2 | Simulation #2 durchführen (gleicher oder anderer Szenario-Typ, ggf. andere Agents) | Run abgeschlossen (completed) | ☐ |
| B0.3 | History-Tab öffnen | Beide Runs in der Liste sichtbar mit Fatigue-Rating-Dots | ☐ |

### B1. Compare Mode aktivieren

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B1.1 | "Compare Runs" Button in History klicken | Compare-Modus aktiviert, Checkboxen erscheinen bei jedem Run | ☐ |
| B1.2 | Nur abgeschlossene Runs haben Checkboxen | Laufende/abgebrochene Runs sind nicht auswählbar | ☐ |
| B1.3 | Einen Run auswählen (Checkbox) | Checkbox wird angehakt, "Compare Selected" Button erscheint (disabled) | ☐ |
| B1.4 | Zweiten Run auswählen | Zweite Checkbox angehakt, "Compare Selected" Button wird aktiv | ☐ |
| B1.5 | Dritten Run auswählen (falls vorhanden) | Wird nicht angehakt ODER vorherige Auswahl wird angepasst (max 2) | ☐ |
| B1.6 | "Compare Selected" klicken | ViewMode wechselt auf "comparison", Compare-Tab erscheint | ☐ |

### B2. Comparison View — Grundstruktur

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B2.1 | Header prüfen | Run A (cyan) und Run B (purple) mit Namen angezeigt | ☐ |
| B2.2 | Clear-Button (X) prüfen | Vorhanden und klickbar | ☐ |
| B2.3 | Outcome Cards prüfen | Run A Outcome und Run B Outcome nebeneinander | ☐ |

### B3. Fatigue Vergleich

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B3.1 | Fatigue Scorecard sichtbar | Zwei Karten (Run A cyan border, Run B purple border) + Delta in der Mitte | ☐ |
| B3.2 | Global Fatigue Index | Prozent-Wert für beide Runs, farbcodiert nach Rating | ☐ |
| B3.3 | Delta-Arrow prüfen | Grüner Pfeil ↓ wenn B besser, Roter Pfeil ↑ wenn B schlechter, Minus wenn gleich | ☐ |
| B3.4 | Projected Delay prüfen | Monate-Wert für beide Runs + Delta | ☐ |
| B3.5 | Budget at Risk prüfen | Dollar-Wert für beide Runs + Delta | ☐ |
| B3.6 | Farblogik verifizieren | Negative Deltas (Fatigue/Delay/Budget sinkt) = grün, Positive = rot | ☐ |

### B4. Per-Agent Fatigue Tabelle

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B4.1 | Tabelle sichtbar (wenn Agents in beiden Runs) | 4 Spalten: Agent, Run A %, Run B %, Delta | ☐ |
| B4.2 | Agent-Namen prüfen | Agents aus beiden Runs gelistet (Union) | ☐ |
| B4.3 | Diff-Highlighting | Zeilen mit negativem Delta = grüner Hintergrund, positiv = rot | ☐ |
| B4.4 | Agent nur in einem Run | Zeigt 0% für den fehlenden Run | ☐ |

### B5. Bottleneck Vergleich

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B5.1 | Shared Bottlenecks prüfen | Elemente in beiden Runs: Name + Delay-Delta + Conflict-Delta | ☐ |
| B5.2 | "RESOLVED" Badge | Bottleneck nur in Run A (in Run B behoben) = grüner RESOLVED Badge | ☐ |
| B5.3 | "NEW" Badge | Bottleneck nur in Run B (neu entstanden) = roter NEW Badge | ☐ |

### B6. Emergence Metrics

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B6.1 | 4 Metriken sichtbar | Consensus, Deadlocks, Avg Rounds, Blocked | ☐ |
| B6.2 | Jede Metrik zeigt A-Wert und B-Wert | Cyan für A, Purple für B | ☐ |
| B6.3 | Delta-Wert prüfen | Farbcodiert (grün wenn besser, rot wenn schlechter) | ☐ |
| B6.4 | Consensus: Höher = besser (invertierte Farblogik) | Positive Delta = grün bei Consensus | ☐ |

### B7. Emergence Timeline

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B7.1 | Zwei Timeline-Spalten sichtbar | Run A (cyan border) und Run B (purple border) | ☐ |
| B7.2 | Event-Count im Header | "(X events)" für jede Spalte | ☐ |
| B7.3 | Events mit Farbpunkten | consensus=grün, deadlock=rot, coalition=blau, fatigue=orange | ☐ |
| B7.4 | Runden-Nummern | "R1", "R2" etc. vor jedem Event | ☐ |
| B7.5 | Leere Timeline | "No events" Text wenn keine Emergence Events | ☐ |

### B8. Risk/Cost Delta Tabelle

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B8.1 | Tabelle sichtbar (wenn Risk/Cost-Deltas existieren) | 5 Spalten: Element, Risk A, Risk B, Cost A, Cost B | ☐ |
| B8.2 | Diff-Coloring | Run B Werte farbcodiert (grün wenn besser, rot wenn schlechter) | ☐ |
| B8.3 | Max 10 Elemente | Tabelle zeigt höchstens 10 Zeilen | ☐ |

### B9. Compare-View Navigation

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| B9.1 | "Compare" Tab in Tab-Leiste prüfen | Nur sichtbar wenn Comparison aktiv | ☐ |
| B9.2 | Anderen Tab klicken (z.B. History) | Comparison bleibt erhalten, Compare Tab noch sichtbar | ☐ |
| B9.3 | Zurück zu Compare Tab | Vergleichsdaten noch da | ☐ |
| B9.4 | Clear-Button (X) in Comparison Header klicken | Comparison wird gelöscht, Compare Tab verschwindet | ☐ |
| B9.5 | "Compare Runs" erneut klicken in History | Neuer Vergleich möglich | ☐ |

---

## Teil C: Edge Cases & Robustheit

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| C1 | Persona mit maximalem Namen (100 Zeichen) erstellen | Wird akzeptiert, UI bricht nicht | ☐ |
| C2 | Budget auf 0 setzen | Gespeichert als "kein Budget" (undefined) | ☐ |
| C3 | Capacity auf 1 (Minimum) und 20 (Maximum) setzen | Clamped, akzeptiert | ☐ |
| C4 | Alle 5 Layers und alle 4 Domains aktivieren | Gespeichert und angezeigt | ☐ |
| C5 | Leeres SystemPromptSuffix | Akzeptiert (optionales Feld) | ☐ |
| C6 | Vergleich zweier identischer Runs (gleicher Run zweimal) | Alle Deltas = 0, grau/neutral angezeigt | ☐ |
| C7 | Vergleich: Run mit 3 Agents vs Run mit 5 Agents | Fehlende Agents zeigen 0% Fatigue | ☐ |
| C8 | Vergleich: Run ohne Bottlenecks vs Run mit Bottlenecks | "NEW" Badges für alle Bottlenecks in Run B | ☐ |
| C9 | Browser-Refresh während Compare-View | State geht verloren (erwartet), kein Crash | ☐ |
| C10 | Schnelles Doppelklick auf "Create Persona" | Kein doppeltes Erstellen (Button disabled während Save) | ☐ |

---

## Teil D: Responsive & Visual

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| D1 | PersonaEditor Modal bei kleinem Viewport (1024px) | Scrollbar, alle Felder erreichbar | ☐ |
| D2 | Comparison View bei kleinem Viewport | Keine horizontalen Überläufe, Text truncated wo nötig | ☐ |
| D3 | Matrix-Theme konsistent | Grün (#00ff41) Akzente, dunkle Hintergründe, keine hellen Ausreißer | ☐ |
| D4 | Persona-Karten: Hover-Effekte | Buttons erscheinen/ändern Farbe bei Hover | ☐ |
| D5 | Modal: Fade-In Animation | Backdrop und Modal haben sanfte Einblende-Animation | ☐ |
| D6 | Fatigue Rating Farben korrekt | green=#22c55e, yellow=#eab308, orange=#f97316, red=#ef4444 | ☐ |
| D7 | Comparison Farbkonvention konsistent | Verbesserung immer grün, Verschlechterung immer rot, neutral grau | ☐ |

---

## Teil E: API & Netzwerk (DevTools)

| # | Testschritt | Erwartung | OK? |
|---|-------------|-----------|-----|
| E1 | Network Tab: GET /simulations/personas | 200 OK, Response enthält `presets` (5) + `custom` Array | ☐ |
| E2 | Network Tab: POST /simulations/custom-personas | 201 Created, Response enthält neue Persona mit `_id` | ☐ |
| E3 | Network Tab: PATCH /simulations/custom-personas/:id | 200 OK, Response enthält aktualisierte Persona | ☐ |
| E4 | Network Tab: DELETE /simulations/custom-personas/:id | 200 OK | ☐ |
| E5 | POST mit ungültigem basedOnPresetId (z.B. "fake_preset") | 400 Bad Request (Zod Validation Error) | ☐ |
| E6 | PATCH auf Persona eines anderen Projekts | 404 Not Found (IDOR-Schutz) | ☐ |
| E7 | Unauthenticated Request | 401 Unauthorized | ☐ |

---

## Zusammenfassung

| Teil | Tests | Bestanden | Fehlgeschlagen | Notizen |
|------|-------|-----------|----------------|---------|
| A: Custom Persona Editor | 30 | | | |
| B: Run-Vergleich | 35 | | | |
| C: Edge Cases | 10 | | | |
| D: Visual/Responsive | 7 | | | |
| E: API/Netzwerk | 7 | | | |
| **Gesamt** | **89** | | | |

### Gefundene Bugs

| # | Beschreibung | Schwere | Status |
|---|-------------|---------|--------|
| | | | |

### Anmerkungen

-
