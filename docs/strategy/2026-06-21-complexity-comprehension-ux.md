# Complexity & Comprehension — UX-Strategie für „Verstehe dein Unternehmen"

> **Status:** Strategy-Draft, **NICHT** Sprint-Backlog. Theoretisches Fundament + Hebel-Mapping vor UX-Investment-Entscheidung.
> **Trigger:** User-Frage 2026-06-21 nach dem wiederkehrenden Feedback: *"Weil eine Geschäftsstruktur darzustellen sehr komplex ist, wird die Software automatisch sehr komplex."* — und: *Wer hat das benannt, und wie unterstützen wir den Nutzer via UI, sein Unternehmen besser zu verstehen?*
> **Ziel dieses Docs:** Das Feedback wissenschaftlich verankern (welche Denker haben es benannt), daraus 5 übersetzbare UI-Hebel ableiten, gegen den Ist-Stand von TheArchitect mappen, und einen Stage-Gate-Plan vorschlagen — ohne Sprint-Roadmap umzustellen.

---

## 1. Das Feedback, präzise reformuliert

Das Feedback klingt wie ein Designfehler, ist aber in Wahrheit ein **Naturgesetz der Domäne**. Die wichtigste Erkenntnis vorweg:

> **Die Architektur darf komplex sein — das Werkzeug, sie zu verstehen, darf es nicht.**

Der Fehler wäre, das Feedback als *"mach die Software einfacher"* zu lesen. Eine Unternehmensarchitektur **ist** verflochten; jeder Versuch, das wegzudesignen, produziert ein Spielzeug, das echte Unternehmen nicht abbildet. Die richtige Lesart ist: **trenne die unvermeidbare (essentielle) Komplexität der Domäne von der vermeidbaren (akzidentellen) Komplexität des Werkzeugs — und drücke letztere auf null.**

Genau diese Unterscheidung ist seit den 1970ern gut erforscht. Wir erfinden hier nichts; wir wenden bekannte Prinzipien diszipliniert an.

---

## 2. Die Denker, die das benannt haben

Geordnet nach direkter Relevanz für unser Problem.

| # | Autor | Konzept | Kernaussage für uns |
|---|---|---|---|
| 1 | **Larry Tesler** | *Law of Conservation of Complexity* (Tesler's Law) | Komplexität kann nur verschoben werden, nicht eliminiert. Frage: trägt sie der Nutzer oder die Software? |
| 2 | **Fred Brooks** | *No Silver Bullet* — essentielle vs. akzidentelle Komplexität | Die Domäne ist essentiell komplex; unser Job ist, akzidentelle Komplexität zu eliminieren. |
| 3 | **Don Norman** | *Living with Complexity* | "Complexity is necessary; confusion is not." Lösung = Struktur + konzeptuelles Modell, nicht Reduktion. |
| 4 | **Ben Shneiderman** | *Visual Information-Seeking Mantra* | "Overview first, zoom and filter, then details-on-demand." Direkte UI-Bauanleitung. |
| 5 | **Gregor Hohpe** | *The Architect Elevator* | Zwischen Flughöhen fahren (Vorstand ↔ Maschinenraum). Immer **eine** Ebene scharf. |
| 6 | **Simon Brown** | *C4-Modell* | Komplexität via Abstraktions-Zoom: Context → Container → Component → Code. |
| 7 | **John Zachman** | *Zachman Framework* / ISO 42010 Viewpoints | Derselbe Gegenstand, viele Stakeholder-Perspektiven. Nie "alles" zeigen — rollenspezifische Ausschnitte. |
| 8 | **Richard Saul Wurman** | *Information Architecture* / LATCH | Es gibt nur 5 Ordnungsprinzipien: **L**ocation, **A**lphabet, **T**ime, **C**ategory, **H**ierarchy. |
| 9 | **John Sweller** | *Cognitive Load Theory* | Intrinsic / extraneous / germane load — die kognitive Grundlage zu Brooks. |
| 10 | **George Miller** | *"The Magical Number Seven, ± 2"* | Grenzen des Arbeitsgedächtnisses → Chunking/Gruppierung ist Pflicht, nicht Kür. |
| 11 | **Herbert Simon** | *Bounded Rationality* / "attention is the scarce resource" | Aufmerksamkeit ist das Knappe, nicht Information. Wir kuratieren Aufmerksamkeit. |
| 12 | **Edward Tufte** | *Visual Display of Quantitative Information* | "To clarify, add detail." Komplexität ≠ Unordnung; Dichte kann Klarheit erhöhen. |

**Die vier, die du zitieren solltest, wenn ein Kunde/Investor fragt:** Tesler (warum Automation = Komplexitäts-Transfer), Brooks (warum die App komplex *aussehen* darf), Shneiderman (wie navigiert wird), Hohpe (warum Flughöhen).

---

## 3. Von Theorie zu fünf UI-Hebeln

Die 12 Denker kondensieren zu **fünf operativen Hebeln**. Jeder ist gegen ArchiMate/EA-Realität getestet und gegen unseren Ist-Stand gemappt.

### 🟢 Hebel 1 — Shneiderman-Mantra als Master-Navigation
**Prinzip:** Jeder Einstieg in eine Architektur startet mit einer **Overview, die eine Frage beantwortet** ("Wo sind meine Risiken/Lücken?"), nicht mit dem rohen Graphen.
**Ist-Stand:** Teilweise da — UC-CRIT-001 *Neuralgische Punkte at-a-Glance*, PolicyBoard-Heatmap, Activity Drill-Down (Single/Double-Click → Steckbrief). Aber: Default-Einstieg ist oft noch das volle 3D-Modell.
**Lücke:** Es fehlt ein **garantierter Overview-First-Screen** als Eröffnung jeder Architektur.

### 🟢 Hebel 2 — Architect Elevator / Abstraktions-Zoom
**Prinzip:** Ein expliziter Schieberegler zwischen Flughöhen (Strategy/Plateau → Business → Application → Technology). Immer **nur eine Ebene scharf**, der Rest aggregiert/gedimmt.
**Ist-Stand:** Bausteine vorhanden — ArchiMate-Layer-Palette, Plateau-Navigation, Layer-Sichtbarkeit, X-Ray-Sub-Views.
**Lücke:** Heute sind das **freie Layer-Toggles**, kein geführter Single-Altitude-Zoom. Der Nutzer kann sich alles gleichzeitig einblenden — und tut es.

### 🟢 Hebel 3 — Tesler's Law operationalisieren (Komplexität → Maschine)
**Prinzip:** Jeder Punkt manueller Eingabe ist Last beim Nutzer. Automatisiere ihn — **und mach sichtbar, was die Maschine übernommen hat**.
**Ist-Stand:** Stark — `feedback_max_automation`, Auto-Heal-Connections (UC-CONN-001), Blueprint-Auto-Fill, Redundancy-Detector (UC-RED-001), AI-Vorschläge, Generator-D.
**Lücke:** Die Automation ist da, aber **unsichtbar**. Es fehlt ein "Was die Maschine für dich getan hat"-Feedback ("14 Verbindungen ergänzt, 3 Redundanzen erkannt") — das senkt Last *und* baut Vertrauen.

### 🟡 Hebel 4 — Rollenspezifische Viewpoints (Zachman)
**Prinzip:** Niemand sieht "die ganze Architektur". CISO → Compliance/Risiko, Business-Architekt → Capabilities, IT-Lead → Application-Layer. Default-Ansicht ist schon gefiltert.
**Ist-Stand:** Bausteine — RBAC-Overhaul, Stakeholder-Portal, Viewpoints im Modeling-UX.
**Lücke:** Viewpoints sind **nicht an Rollen gekoppelt**. Jeder startet im selben Default. Deckt sich mit BSH-Feedback (Business-Architect-Perspektive).

### 🟡 Hebel 5 — Progressive Disclosure als Narrative (Norman)
**Prinzip:** Statt Features zu enthüllen, beantworte Fragen in fester Reihenfolge: **"Was habe ich?" → "Wo sind die Probleme?" → "Was soll ich tun?" → "Was kostet/bringt es?"** Das ist eine geführte Erkenntnis-Reise, kein Werkzeugkasten.
**Ist-Stand:** Da — `feedback_ux_simplicity` (phase-gating, plain language), Pipeline-Stepper, Next-Step-CTAs, Phase-A-Flow.
**Lücke:** Norman's Zusatz fehlt teils — ein **konzeptuelles Modell**, das dem Nutzer erklärt, *warum* die Reihenfolge so ist. Stepper ≠ Narrative, solange der "Warum jetzt das"-Faden fehlt.

---

## 4. Hebel × Ist-Stand — Decision-Matrix

Wie gut deckt der Ist-Stand jeden Hebel ab, und wie hoch ist der Resthebel?

| Hebel | Theorie-Anker | Ist-Abdeckung | Resthebel | Aufwand bis "gut" |
|---|---|---|---|---|
| 1 — Overview-First-Navigation | Shneiderman | ⭐⭐ | ⭐⭐⭐ | mittel (1 Sprint) |
| 2 — Abstraktions-Zoom (Elevator) | Hohpe / Brown | ⭐⭐ | ⭐⭐⭐ | mittel-hoch |
| 3 — Automation sichtbar machen | Tesler | ⭐⭐⭐ (Logik) / ⭐ (Sichtbarkeit) | ⭐⭐ | niedrig (Quick-Win!) |
| 4 — Rollen-Viewpoints | Zachman | ⭐⭐ | ⭐⭐ | mittel |
| 5 — Narrative Progressive Disclosure | Norman / Sweller | ⭐⭐⭐ | ⭐ | niedrig (Reframe) |

**Pattern:** Hebel 3 ist der größte Wert-pro-Aufwand (Logik existiert schon, nur unsichtbar). Hebel 1 + 2 sind die strukturell wichtigsten, aber teurer. Hebel 5 ist überwiegend ein Reframe vorhandener Flows.

---

## 5. Das Leitprinzip in einem Satz

> **Die Architektur darf komplex sein — das Werkzeug nicht** (Norman). **Verschiebe die Komplexität in die Maschine** (Tesler), **zeig immer nur eine Flughöhe** (Hohpe/Shneiderman), **gefiltert nach Rolle** (Zachman), **als geführte Antwort auf eine Frage** (Progressive Disclosure / Sweller).

Dieser Satz gehört in den Pitch, in die Produkt-Vision und als Akzeptanz-Lakmustest über jedes künftige UX-UC: *"Welchen der 5 Hebel bedient dieses Feature — und macht es einen davon kaputt?"*

---

## 6. Empfohlener Stage-Gate-Plan

### Gate 1 — Jetzt: Theorie-Fundament (dieses Doc)
- ✅ **Dieses Doc** (du liest es) — Denker benannt, Hebel gemappt
- ⏸ **Entscheidung:** Wird daraus ein UX-Track, oder bleibt es Referenz-Fundament für künftige UCs?

### Gate 2 — Quick-Win: Hebel 3 sichtbar machen
- Kleinstes mögliches Feature: ein **"Was wurde automatisch erledigt"-Panel/Toast** nach Auto-Heal / Blueprint-Import / Redundancy-Run
- Kein neues Backend — nur Surfacing vorhandener Ergebnisse
- **Decision-Kriterium:** Fühlt sich die App "smarter" an, ohne neuen Lernaufwand?

### Gate 3 — Strukturell: Hebel 1 + 2 als UC
- UC "Overview-First-Einstieg" + UC "Single-Altitude-Zoom"
- Erst nach 8-Kriterien-Scoring (`feedback_requirement_scoring`) und Pre-Flight-Check (`feedback_preflight_check`)
- Hier liegt der größte strukturelle Wert — aber auch das größte Refactor-Risiko an der 3D-View

### Gate 4 — Personalisierung: Hebel 4 Rollen-Viewpoints
- Viewpoints an RBAC-Rollen koppeln, Default-Ansicht pro Rolle
- Nach Gate 3, weil es auf der Zoom/Filter-Infrastruktur aufsetzt

**Killer-Kriterium:** Wenn Hebel 3 + 5 (die billigen) zusammen das "überfordert"-Feedback messbar entschärfen, ist der teure Umbau von Hebel 1/2 neu zu priorisieren — nicht automatisch zu bauen.

---

## 7. Risiken & Mitigations

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| "Vereinfachung" wird als Feature-Wegnahme missverstanden | mittel | hoch | Klar kommunizieren: wir bauen Vermittlung, nicht Reduktion (Norman). Nichts wird entfernt, nur kuratiert. |
| Overview-First-Refactor bricht die bestehende 3D-View | mittel | hoch | Overview als **zusätzliche** Einstiegs-Schicht über der View, nicht Ersatz. Additiv, kein Rewrite. |
| Zoom-Stufen kollidieren mit freien Layer-Toggles (zwei Mentalmodelle) | mittel | mittel | Eine Interaktion gewinnt — Elevator als Default, Toggles als "Expert Mode". |
| Rollen-Viewpoints verstecken etwas, das der Nutzer braucht | mittel | mittel | Default gefiltert, aber "alles zeigen" immer 1 Klick entfernt. Filter ≠ Zensur. |
| Theorie bleibt Doc, fließt nie in Produkt | hoch | mittel | Hebel-Frage als Pflicht-Feld in jedem künftigen UX-UC-Template (siehe §5). |
| Over-Engineering: alle 5 Hebel auf einmal | mittel | hoch | Strikt Gate-für-Gate. Hebel 3 + 5 zuerst, messen, dann erst strukturell. |

---

## 8. Was das mit dem laufenden Sprint zu tun hat

**NICHT in Sprint-Backlog stopfen.** Die Compliance-/Regulation-UCs (UC-REQGEN/REQPROJ live, UC-VERLOCK/GAP/REGDIFF offen) liefern Daily-Value und laufen weiter. Diese UX-Strategie ist ein **Querschnitts-Fundament**, kein Feature.

**Aber: als Lakmustest sofort nutzbar.** Jedes künftige UX-Refinement (Step-2-Sub-Grids, THE-305 Dashboard, etc.) kann ab heute gegen die 5 Hebel geprüft werden — ohne neuen Prozess, nur eine Frage mehr im Pre-Flight.

**Reihenfolge-Empfehlung:**
1. **Jetzt:** Doc als Referenz ablegen (passiert mit diesem File)
2. **Nächste UX-Pause:** Hebel 3 Quick-Win (Automation-Feedback-Panel) — billig, hoher gefühlter Wert
3. **Nach Scoring:** Hebel 1/2 als eigenständige UCs, wenn das "überfordert"-Feedback persistiert
4. **Querschnitt:** §5-Frage in jedes UX-UC-Template

---

## 9. Konkrete nächste Aktionen

### Für mich (Claude) — bei Bedarf:
- [ ] Memory-Eintrag `strategy_complexity_comprehension_ux.md` für Cross-Session-Awareness (auf Wunsch)
- [ ] Bei künftigen UX-UCs: §5-Hebel-Frage automatisch im Pre-Flight mitführen
- [ ] Optional: Hebel-3-Quick-Win als kleinen, scope-begrenzten UC ausarbeiten

### Für dich (Matze):
- [ ] Doc kritisch gegenlesen — fehlt ein Denker / ein Hebel?
- [ ] Decision: eigener UX-Track, oder Querschnitts-Fundament für bestehende UCs?
- [ ] Falls Track: Hebel-3-Quick-Win als ersten, kleinsten Schritt scoren

### Was wir HEUTE NICHT machen:
- Keine Production-Code-Änderungen
- Keine Linear-Issues anlegen — erst nach Decision in §8
- Keine bestehende Roadmap umstellen

---

## 10. Honest Take (Closing Thought)

Das Feedback ist berechtigt, aber die naive Lesart ("macht's einfacher") führt in die Sackgasse — sie würde euer Produkt zum Spielzeug machen. Die seit 50 Jahren bekannte richtige Antwort ist: **die Komplexität der Domäne respektieren, die Komplexität des Werkzeugs eliminieren.**

Das Beruhigende: **ihr habt die meisten Bausteine schon** — Automation (Tesler), Phase-Gating (Norman/Sweller), Layer & Plateaus (Hohpe), Drill-Down (Shneiderman), RBAC (Zachman). Es fehlt weniger Neubau als **Orchestrierung und Sichtbarmachung** des Vorhandenen.

Der billigste, größte Hebel liegt unerwartet bei **Hebel 3**: Ihr automatisiert bereits viel — aber unsichtbar. Sobald die App dem Nutzer zeigt, *was sie für ihn übernommen hat*, kippt die Wahrnehmung von "überfordernd komplex" zu "erstaunlich schlau". Das ist kein Architektur-Projekt, das ist ein Panel.

**Mein Tipp:** Dieses Doc als Fundament ablegen, die §5-Hebel-Frage ab sofort als Lakmustest nutzen, und bei der nächsten UX-Pause den Hebel-3-Quick-Win bauen. Dann hat das Feedback eine Antwort im Produkt — nicht nur in der Theorie.
