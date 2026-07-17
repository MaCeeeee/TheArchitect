# ADR-0005: Frontend als eine persistente 3D-Welt mit ADM-Rückgrat

- **Status:** Accepted
- **Datum:** 2026-07-15
- **Entscheider:** Matthias Ganzmann (Enterprise Architect)
- **Baut auf:** ADR-0003 (Conformance-IA) · [[strategy_complexity_comprehension_ux]] · [[strategy_trust_spine]] · [[feedback_ux_simplicity]] · Storyboard-Artifact „Journey — Eine Welt, sechs Akte"
- **Vokabular:** `CONTEXT.md` (Phase, Station, On-ramp, World, Rail, Sheet, Conformance Hub)

## Kontext

Wiederkehrendes Feedback: „App zu komplex". Bisherige Fixes waren kosmetisch (Fonts, Stepper, CTAs), nicht strukturell. Ausgangspunkt war eine Maeda-Analyse (Klarheit durch Subtraktion + Abschirmung von Komplexität) und ein Lusion-inspiriertes Ziel: das ganze Tool als *eine* durchgängige 3D-Welt erleben, statt als Sammlung getrennter Seiten. Ein interaktives Storyboard wurde gebaut und in einer strukturierten Grill-Session zu einem tragfähigen Modell gehärtet. Diese ADR hält die zehn Entscheidungen fest.

Randbedingung: TheArchitect ist deployed, aber es sind **noch keine echten Nutzer onboarded** — der Umbau darf mutig sein.

## Entscheidung

1. **Leitprinzip (Tie-Breaker):** Kollidieren *Erlebnis* und *Klarheit*, gewinnt **Klarheit**. Erlebnis wird einmalig (Erstkontakt) und an Vertrauens-Momenten ausgegeben, verlangsamt aber nie die tägliche Nutzung. Kein Effekt ohne Bedeutung.

2. **Rückgrat:** Die verdrahtete **TOGAF-ADM-Achse** (`journeyStore`, 6 Phasen) bleibt das *sichtbare* Rückgrat — in **Alltagssprache übersetzt**, ADM als Badge (Vision · Model · Explore · Plan · Govern · Track). Keine parallele „Akt"-Landkarte. Entry-Mechanismen (Arrival, Genesis) sind **On-Ramps**, keine Phasen.

3. **Navigations-Modell:** **Freie Landkarte + Vorschlag, kein Riegel.** Die Rail ist immer springbar; der eine CTA zeigt auf `nextAction`; nicht-verdiente Phasen sind *leise*, nicht gesperrt. Aussagekräftige Empty-States (die die On-Ramp anbieten) sind Pflichtteil jeder Station.

4. **Conformance (Versöhnung mit ADR-0003):** **Komponieren, nicht ablösen.** Der **Conformance Hub** (ein Sheet, Subjekt×Norm) macht Einstieg/Scoping; die **World** zeigt Ergebnisse (wo die Gaps sind); ein **Matrix-Sheet** hält das Detail. Ein einziger Hub, erreichbar aus jeder Compliance-Phase (E/G/H), vorgescoped auf die aktuelle Phase. ADR-0003 bleibt gültig, seine Oberfläche verlagert sich in die Station.

5. **Persistente Shell:** Die **World mountet nie ab**. Sie wird in eine dauerhafte Shell hochgezogen; Routen bleiben als **URL-/Deep-Link-Schicht**, treiben aber Kamera + welches Sheet offen ist, statt die Szene zu tauschen. Das Duplikat `ComplianceOverlay` (Sheet) vs. `CompliancePage` (Route) wird aufgelöst: **Sheet-über-World ist kanonisch**, Route-Seiten werden zu Deep-Links, die Sheets öffnen. Jede Seiten-Komponente wird von „ich besitze den Viewport" auf „ich bin ein Sheet" umgestellt.

6. **Kommando-Fläche:** **Palette + kontextuelles, gedeckeltes Set.** ⌘K ist die einzige Vollliste aller Werkzeuge; pro Station max. 3–4 sichtbare, phasen-gebundene Aktionen. Sidebar/Toolbar als *Navigation* entfallen; ihre kontextuellen Panels werden Sheets.

7. **Auflösung der World:** **Station-adaptives semantisches LOD.** Jede Station rendert nur die Detailtiefe ihrer Frage (Model = volle Elemente; Explore/Govern = aggregierte Heatmap; Plan = Fluss/Last; Track/Transfer = Plateau-Blöcke); Detail ist einen Drill tiefer. Verhindert den „Hairball" bei großen Modellen.

8. **Zwei Tempi:** Kinematisch beim ersten Erreichen einer Station **pro Projekt** (persistiert), danach instant. `prefers-reduced-motion` → immer instant (nicht verhandelbar). Manuelles „Kino-Replay" für Demos.

9. **Auslieferung:** **Parallele v2-Shell (additiv)**, Stationen wandern einzeln hinein — jede Migration ein geflaggter, Pre-Flight-getriebener Slice. Alte UI bleibt lauffähig bis Cutover. Reihenfolge: (1) Shell + Model, (2) Comply/Conformance, (3) Kommando-Fläche, (4) semantisches LOD, (5) On-Ramps + Landing-Brücke + Tempi. Genesis darf für einen Pitch vorgezogen werden.

10. **Klartext-Namen:** Vision · Model · Explore · Plan · Govern · Track (englisch, ADM als Badge). Siehe `CONTEXT.md`.

## Betrachtete Optionen (die wichtigsten Verwerfungen)

- **Rückgrat — neue „sechs Akte" sichtbar, ADM intern** (Q2-B): verworfen — erfindet eine *parallele* Landkarte gegen die ubiquitäre Domänensprache (ADM), wirft verdrahtete Logik weg. Verstößt gegen das Leitprinzip.
- **Conformance — räumliche Welt löst ADR-0003 ab** (Q4-B): verworfen — die Subjekt-Wahl ist keine räumliche Frage; ein guter, 2 Wochen alter Router würde ohne Ersatz zerstört.
- **Shell — In-Place feature-geflaggt** (Q5-B): verworfen — alter Routen-Tausch und neue Shell müssten in `MainLayout` koexistieren (Pflege-Spaghetti). Big-Bang (Q9-A) verworfen wegen Kohärenz-/Demo-Risiko.
- **Kommando-Fläche — Palette-only** (Q6-A): verworfen — versteckt *alles* hinter einer Taste, opak für genau den Erstnutzer, den wir entlasten wollen. „Hide" ≠ „unsichtbar".

## Konsequenzen

**Positiv**
- Eine kohärente Welt statt „20 Tools in einer Schachtel"; Route = Kamera + Sheet.
- Ubiquitäre Sprache bleibt gewahrt (ADM), plain-language an der Oberfläche → adressiert „App zu komplex" strukturell.
- Duplikat (Overlay vs. Page) stirbt; eine Wahrheit für Werkzeuge (⌘K).
- ADR-0003 überlebt und wird *verstärkt* (Hub für Einstieg, World für Ergebnis).

**Negativ / Aufwand**
- Slice 1 (persistente Shell) ist strukturell all-or-nothing; jede Seiten-Komponente wird zum Sheet refactored.
- Semantisches LOD verlangt mehrere Repräsentationen aus *einem* Modell (echtes Rendering-Engineering).
- Zwei Shells parallel bis Cutover.
- Pro Station eine Kuratierungs-Entscheidung (welche 3–4 Aktionen).

**Nicht-Ziele**
- Kein Ersetzen der ADM-Logik, nur ihrer Oberfläche.
- Keine Zusammenlegung der Conformance-Tore (ADR-0003 bleibt).

## Verwandt

ADR-0003 (Conformance-IA, verlagert) · `CONTEXT.md` · Storyboard-Artifact · nächster Schritt: Pre-Flight „Slice 1 — Shell + Model-Station".

## Addendum zu #7 — Slice-4-Konkretisierung (2026-07-17, gegrillt, THE-500)

Die Grill-Session mit Matze schärfte #7 nach: das gefühlte Problem ist **nicht Performance** (kein gemessenes Limit; größtes reales Modell ~110 Elemente), sondern dass sich die Stationen **nur durch die Kamera** unterschieden — gleiche Boxen, gleiches Modell, anderes Stativ. Beschlossen:

- **Semantisches LOD = LOD nach WICHTIGKEIT, nicht nach Distanz.** Eine pure Funktion `stationSalience(element, station) → [0..1]` aus bestehenden Phasen-Daten; einheitlicher Ausdruck (salient = voll/Label/Pop; nicht-salient rezediert auf einen Floor, nie 0).
- **Wichtig pro Station (tunebare Defaults):** Vision → Motivation/Strategy · Model → volle Detailtiefe (Zuhause) · Explore → Deckungslücken · Govern → Policy-Verletzungen · Plan → Roadmap/Kosten · Track → Änderung über Plateaus.
- **Hybrid statt Voll-Metamorphose:** Rückgrat = Re-dress (Boxen bleiben, Emphasis wandert); **Track = echter Re-form** (bestehender PlateauRenderer, station-getrieben, nur bei vorhandenen Plateau-Snapshots); **Explore/Govern = Re-form-Gefühl** (Boxen rezedieren hart hinter ComplianceGlow/Verletzungs-Salience). Kein Vertex-Morph (Render-Zweige teilen keine Geometrie — Follow-up).
- **Bewegung:** Cross-Fade/Dissolve pro Node (imperativ im Frame-Loop), getaktet mit den Zwei-Tempi aus #8 (kinematisch beim ersten Erreichen, instant danach, reduced-motion immer instant).
- **Daten-Fallback:** fehlen die Phasen-Daten → volle Re-dress-Ansicht + dezenter Hinweis; nie ein leerer Re-form.
- **Umkehrbarkeit:** „Show all detail"-Toggle (⌘K) flacht die Salience überall ab.
- **Klassik byte-identisch:** Salience feuert nur bei aktiver Station (`journeyStation`-Signal, v2-only).

Das große Zoom-Aggregations-LOD (Elemente zu Gruppen clustern, THE-23/THE-58) bleibt ein eigenes Feature; Slice 4 legt das Station-Signal + Salience-Plumbing, das es wiederverwendet.
