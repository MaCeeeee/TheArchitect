# UC-NEWLAW-001 — „Ein neues Gesetz steht an"

**Datum:** 2026-07-31
**Status:** Use-Case-Festlegung — **kein Bau-Ticket.** Diese Seite ist der Maßstab, an dem sich ab jetzt jedes Ticket im linken Ast messen lassen muss.
**Auslöser:** Feedback Alex (2026-07-31): (1) zwei Probleme sind zu lösen — *Klassifizierung des Gesetzes* und *was drin steht*; (2) auf **einen** Use Case festlegen — AI Governance **oder** „neues Gesetz steht an"; (3) das Tool ist für den Unternehmenseinsatz noch zu komplex. Zweitmeinung zum wiederholten Komplexitäts-Befund (BSH 05/2026, [`2026-06-21-complexity-comprehension-ux.md`](2026-06-21-complexity-comprehension-ux.md)).
**Verwandt:** linker Ast — CANON (THE-417/418) → ONTO (THE-421) → CTXGOV (THE-422/423) → **REQHARM (THE-438)** → REGDIFF (THE-308); UC-LAW-001/002 (Anwendbarkeit), UC-REQGEN-001 (Pflichten), UC-GAP-001 (THE-307, Done).

---

## 1. Der Use Case in einem Satz

> **Eine neue oder geänderte Regulierung trifft ein. Wir sagen dem Unternehmen innerhalb eines Tages: ob es betroffen ist, warum, welche Pflichten daraus folgen, welche davon es bereits erfüllt — und wo die Lücken sitzen.**

Das ist die einzige Frage, die dieses Produkt vorerst beantwortet. Alles andere ist Nebenwirkung.

## 2. Nutzer und Auslöser

| | |
|---|---|
| **Wer fragt** | Compliance-Verantwortlicher, Legal, Business-/Enterprise-Architekt |
| **Wann** | Ein Gesetz tritt in Kraft, wird geändert, oder ein Prüfer/Kunde fragt danach — der Auslöser hat ein **Datum** |
| **Was heute passiert** | Wochen an Handarbeit: Text lesen, Betroffenheit einschätzen, Pflichten ableiten, im Unternehmen suchen, wer das schon tut. Ergebnis lebt in Excel und im Kopf einzelner Personen |
| **Wie oft** | Zu klären in den Problem-Interviews (§8) — Annahme: 5–15 relevante Rechtsakte pro Jahr pro Unternehmen |

## 3. Das Ergebnis ist ein Bericht, kein Werkzeug

Der Nutzer bekommt **ein lesbares Dokument**, keine 3D-Oberfläche. Fünf Abschnitte:

1. **Betroffen — ja/nein, und warum.** Anwendbarkeitsgründe, nicht Behauptung.
2. **Was drin steht.** Die Pflichten des Rechtsakts in Unternehmenssprache, nicht Paragraphen-Zitat.
3. **Was ihr schon erfüllt.** Zuordnung auf bestehende Elemente/Maßnahmen der Landschaft, mit Herkunftsnachweis.
4. **Die Lücken.** Was offen ist, wo es sitzt, wie kritisch.
5. **Herkunft.** Jede Aussage rückführbar auf Norm-Stelle und Datenquelle — das ist das Verkaufsargument gegenüber einer LLM-Antwort.

**Damit ist Alex' dritter Punkt beantwortet, ohne ein UI-Projekt:** die Komplexität wird nicht vereinfacht, sie wird **entfernt** aus dem, was der Kunde sieht. Die Plattform bleibt darunter unverändert mächtig.

## 4. Im Scope — und weitgehend gebaut

| Bausteine | Zustand |
|---|---|
| Gesetz aufnehmen ohne Code (CANON) | ✓ THE-418, E2E-Beweis mit NIS2/DORA/AI Act/Data Act |
| **Klassifizieren** (ONTO) — Alex' Problem 1a | ✓ THE-421, 1532 §§ typisiert, fünf Achsen, zwei Qualitätstore |
| Anwendbarkeit ermitteln (UC-LAW-001/002) | ✓ live |
| **Pflichten ableiten** (REQGEN) — Alex' Problem 1b | ✓ THE-302/303/304/315 |
| Zuordnung auf die Landschaft + Lückenliste (UC-GAP-001) | ✓ THE-307 Done |
| Kontext-Nachweis pro AI-Aussage (CTXGOV/ContextTrace) | ✓ THE-423 |
| **Dubletten über mehrere Gesetze zusammenführen (REQHARM)** | ○ THE-438 — der nächste Knoten |
| Delta bei Gesetzesänderung (REGDIFF) | ○ THE-308 |
| **Der Bericht selbst** | ✗ existiert nicht — das eigentliche Loch |

## 5. Bewusst NICHT im Scope

Diese Dinge sind nicht schlecht, sie sind **nicht jetzt**. Wer sie hereinholen will, muss diese Seite ändern:

- **AI Governance** (wie ein KI-Workflow ins Unternehmen passt) — verlangt Prozess-, Rollen- und Freigabemodellierung, also maximale Werkzeug-Komplexität, und trifft auf etablierte GRC-Anbieter.
- **Die 3D-Welt als Einstieg.** Sie bleibt für Architekten, sie ist nicht der Weg zum Bericht.
- **Umsetzung der Lücken** (Remediation, Roadmap, Kosten) — der Bericht endet bei der Lücke.
- **Laufendes Monitoring / Radar.** Erst der Einzelfall auf Zuruf, dann Dauerbetrieb.
- **Modellierungs-Komfort**, Marktplatz, Multi-Country-Ausbau, Konnektoren-Breite.
- **Perfektes Retrieval** (THE-434 u. Ä.) — Optimierung ohne Kundenauslöser.

## 6. Erfolgskriterium (Definition of Done für den Use Case)

Der Use Case gilt als bewiesen, wenn **alle drei** erfüllt sind:

1. **Lesbarkeit ohne Erklärung.** Eine fachkundige Person außerhalb des Projekts liest den Bericht und braucht keine Rückfragen zur Bedienung. Erster Prüfer: Alex.
2. **Am eigenen Modell belegt.** Erzeugt gegen das Self-Model in Prod (93 Elemente, 168 Kanten, provenance-belegt) für DSGVO / EU AI Act — Dogfooding statt Kundendaten.
3. **Keine Dubletten.** Dieselbe Pflicht erscheint einmal, mit N Rechtsgrundlagen — nicht dreimal.

## 7. Was das für den linken Ast ändert

Nur zwei Dinge — der Ast bleibt richtig, er bekommt ein Ende:

- **THE-438 (REQHARM) behält seinen Platz, ändert seine Definition of Done:** nicht „harmonisierte Requirements liegen in der Datenbank", sondern **„der Bericht liest sich ohne Dubletten"**. Das ist wörtlich Alex' Punkt und macht aus einem Datenmodell-Ticket ein Kunden-Ticket.
- **Der Bericht wird Knoten 6** — und darf vorgezogen werden, weil er THE-438/308 nicht braucht (Anwendbarkeit, Pflichten, Zuordnung sind live). Ein Skelett mit sichtbaren Dubletten ist ein *besseres* Argument für THE-438 als jede Begründung.

## 8. Offene Fragen — für die Problem-Interviews, nicht für den Bau

Nach *Running Lean* (Empfehlung Alex) gehören diese Fragen in 8–10 Problem-Interviews, bevor weitergebaut wird:

1. Wann hat euch zuletzt ein neuer Rechtsakt Aufwand verursacht — und wie viel (Personentage)?
2. Wer hat ihn gelesen, wer hat entschieden, wo steht das Ergebnis heute?
3. Was hättet ihr gebraucht, das ihr nicht hattet?
4. Was würde euch ein solcher Bericht wert sein — und wem müsstet ihr ihn vorlegen?

---

**Nächster Schritt:** Bericht-Skelett am Self-Model (Abschnittsschnitt, Datenherkunft je Abschnitt), parallel zum laufenden THE-438-Pre-Flight.
