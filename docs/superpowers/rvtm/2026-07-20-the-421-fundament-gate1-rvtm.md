# RVTM — THE-421 Fundament (Gate 1)

**Plan:** docs/superpowers/plans/2026-07-20-the-421-fundament-gate1.md
**Spec:** docs/superpowers/specs/2026-07-19-onto-reqharm-path-design.md (Slice G-0 + Slice G)
**Linear:** THE-421 (Parent) · THE-429/430 (erweitert) · THE-432/433 (bauen darauf auf)
**Datum:** 2026-07-20 · **Commit-Basis:** f30913f

Status: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert

| REQ | Anforderung (aus der Spec) | Plan-Task | Verifikationsmethode | Status |
|---|---|---|---|---|
| **G0-1** | `provisionKind` ist eine Ontologie-Facette mit geschlossenem Werteraum; Version 1.4.0 → 1.5.0; OntoLearner-Export deckt sie ab | Task 1 | Unit: Werteraum exakt, Mitgliedschaft + Groß/Klein, `ProvisionKindSchema`, Export-Vollständigkeit, Versions-Bump | ⬜ |
| **G0-2** | Prüfschema + Achsenliste + Statistik führen 5 Achsen | Task 2 | Unit: Schema akzeptiert/lehnt ab, `TYPING_AXES` = 5, Stats zählen die 5. Achse | ⬜ |
| **G0-3** | Vorschlags-Schritt deckt 5 Achsen ab; Prompt **aus der Achsenliste abgeleitet** (kein Hartcode, DD-1) | Task 3 | Unit: alle Achsen im Prompt, kein `'four axes'`, OOV bei `provisionKind` wird verworfen statt geraten | ⬜ |
| **G0-4** | Adjudikations-Oberfläche zeigt 5 Achsen | Task 4 | Unit: 5 Auswahlfelder im HTML, `provisionKind`-Optionen vorhanden | ⬜ |
| **G0-5** | Eval + Metriken bleiben unberührt (Achsen-Generizität belegt) | Task 5 | Unit: Report deckt 5 Achsen ab, **ohne** Änderung an `runTypingEval.ts`/`typingMetrics.ts` | ⬜ |
| **W-1** | Mehrklassiges Cohen's Kappa (das vorhandene ist binär) | Task 6 | Unit: perfekte Einigkeit = 1, Zufallsniveau ≈ 0, **Schieflage-Fall** (90 % Rohübereinstimmung ⇒ Kappa < 0,5), wirft bei leer/ungleich lang | ⬜ |
| **W-2** | Blindkopie **entfernt Labels UND KI-Vorschlag** (Anti-Ankerung, DD-2) | Task 7, Task 15 | Unit je Prüfsatz: alle Labels + `annotator`/`notes`/`ambiguous`/`labeledAt` weg, Ergebnis bleibt schema-gültig | ⬜ |
| **W-3** | Vergleich je Achse mit Abweichungsliste + Tor bei < 0,6 (Exit 1) | Task 7 | Unit: Kappa je Achse, einseitig-offene Paare als `skipped` ausgeschlossen, nur-in-einer-Datei als `unmatched` | ⬜ |
| **G-1** | Klassifizierungs-Prüfsatz ist **gestreut** (Quellen/Sprachen), nicht „alles einer Quelle" | Task 8 | Unit: Zielgröße eingehalten, ≥3 Quellen, beide Sprachen, deterministisch bei gleichem Seed, **rückwärtskompatibel ohne Zielgröße** | ⬜ |
| **G-2** | Label-Regeln für die Klassifizierung dokumentiert (sonst ist Kappa < 0,6 nicht reparierbar) | Task 9 | Review: RUBRIC-Abschnitt mit Entscheidungsregeln je Achse + Abgrenzungen + Drei-Zustands-Konvention | ⬜ |
| **G-3** | Klassifizierungs-Prüfsatz doppelt gelabelt, adjudiziert, **eingefroren** | Task 10 | Ops + 🧑 Nutzer-Tor: Kappa je Achse ≥ 0,6, Abweichungen entschieden, `frozen: true` committet | ⬜ |
| **G-4** | Beziehungs-Prüfsatz: Schema mit Negativ-Klasse, **Richtung als Feld** (DD-4), nur `inferred`-Arten (DD-5) | Task 11 | Unit: offen/`null`/Art+Richtung akzeptiert; `metadata`-Art abgelehnt; Art ohne Richtung abgelehnt; Richtung bei `null` abgelehnt; Paar-Sortierung erzwungen | ⬜ |
| **G-5** | Paar-Auswahl statt Vollkreuzprodukt, mit **bewussten Negativ-Paaren** | Task 12a, 12b | Unit: Rangfolge nach Ähnlichkeit, Negativ-Anteil aus dem unähnlichen Ende, Anker immer dabei, deterministisch; Entwurf lässt `relation` offen | ⬜ |
| **G-6** | Vorschlags-Schritt bietet **nur** `inferred`-Arten + verlangt die Richtung ausdrücklich | Task 13 | Unit: `AMENDS` nicht im Prompt, beide Richtungswerte im Prompt, `none`→`null` ohne Richtung, Art ohne Richtung wird verworfen | ⬜ |
| **G-7** | Adjudikations-Oberfläche für Paare (zwei Texte, Art + Richtung) | Task 14 | Unit: beide Texte + Richtungs-Bedienelement im HTML, bei „keine Beziehung" gesperrt, Export schema-gültig | ⬜ |
| **G-8** | Einigkeit für Beziehungen: Gesamt-Kappa über den zusammengesetzten Klassenraum; **je Art nur bei n ≥ 10** (DD-6) | Task 15 | Unit: gleiche Art + Gegenrichtung = Uneinigkeit; `relationLabelForKappa` als einzige Klassen-Definition; dünne Arten als `tooThin`; `__none__` ohne Einzelwert, aber im Gesamt-Kappa | ⬜ |
| **G-9** | Label-Regeln für Beziehungen dokumentiert (inkl. Richtungs-Regel) | Task 16 | Review: RUBRIC-Abschnitt mit Regeln je Art, Abgrenzung lex specialis vs. Konkretisierung, wann `null` korrekt ist | ⬜ |
| **G-10** | Beziehungs-Prüfsatz doppelt gelabelt, adjudiziert, **eingefroren** | Task 17 | Ops + 🧑 Nutzer-Tor: Gesamt-Kappa ≥ 0,6, Abweichungen entschieden, `frozen: true` committet | ⬜ |
| **GATE-1** | **Beide Prüfsätze eingefroren mit ehrlicher Zwei-Rater-Zahl** — das Tor, auf dem Slice T und K aufsetzen | Task 18 | Nachweis-Dokument: Kappa je Achse + Gesamt/je-Art, Zahl adjudizierter Fälle, Streuungs-Statistik, Verweis auf beide eingefrorenen Dateien | ⬜ |
| **Non-Reg** | Rein additiv; keine neuen roten Suiten; TSC grün; binäres Kappa bleibt für den Zuordnungs-Pfad | Task 18 | Full-Suite server + shared, `build` beider Pakete, Final-Review | ⬜ |

## Menschliche Tore (nicht delegierbar)

| Tor | Wo | Was der Architekt entscheidet |
|---|---|---|
| 🧑 **1** | Task 10 Step 6 | Strittige Klassifizierungs-Fälle (Erwartung: wenige, da nur die ≥20 Überlappungsfälle doppelt gelabelt werden) |
| 🧑 **2** | Task 17 Step 6 | Strittige Beziehungs-Fälle (Art **und** Richtung) |

Bei Kappa < 0,6 gilt in beiden Fällen die Freeze-Regel §7.4: **RUBRIC schärfen und neu labeln — nicht das Modell tunen.**

## Ausgegrenzt (dieser Plan)

Slice T (Klassifizierungs-Batch, THE-432) · Slice K (Beziehungs-Pipeline, THE-433) · Gate 2/3 · REQHARM-Spur · THE-434. Nutzer-Entscheid 2026-07-20: „nur Fundament heute".

## Offene Punkte

- **O-1 Zweitprüfer-Zugang (MikeOSS):** gebraucht ab Task 10 Step 4. Rückfall: anderes Modell-Haus mit unabhängigem Prompt — Kriterium ist Unabhängigkeit, nicht der Anbieter.
- **O-2 Schwellen Gate 2/3:** nicht Teil dieses Plans.
- **O-3 Korpus-Schreibzugang:** erst für Slice T relevant.
