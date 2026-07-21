# Gate 1 — Nachweis der Prüfsatz-Güte (THE-421)

**Stand:** 2026-07-21 · **Branch:** `mganzmanninfo/the-421-onto-full`
**Plan:** `docs/superpowers/plans/2026-07-20-the-421-fundament-gate1.md`
**Spec:** `docs/superpowers/specs/2026-07-19-onto-reqharm-path-design.md`

> **Kurzfassung:** Das Fundament steht und misst. Die Messung hat drei Dinge zutage gefördert, die
> vorher nicht sichtbar waren — zwei davon sind erledigt, **zwei Entscheidungen liegen beim
> Architekten**. Gate 1 ist damit **noch nicht durchschritten**; es fehlt bewusst nicht an Bauarbeit,
> sondern an zwei fachlichen Festlegungen.

---

## 1. Was gemessen wurde und wie

Zwei Prüfsätze, je zwei unabhängige Prüfer, dieselben Fälle:

| | Klassifizierung | Beziehungen |
|---|---|---|
| Fälle | 80 Provisions | 120 Paragraphen-Paare |
| Quellen | 11 (6 Gesetze, DE + EN) | DORA×NIS2, DSGVO×NIS2, DSGVO×AI Act |
| Prüfer A | Opus, blind (sieht keinen Vorschlag) | Opus, blind |
| Prüfer B | Haiku, unabhängiger Durchgang | Haiku, unabhängiger Durchgang |
| Datei A | `golden/typing.v1.rater-a.json` | `golden/relations.v1.rater-a.json` |
| Datei B | `golden/typing.v1.rater-b-haiku.json` | `golden/relations.v1.rater-b-haiku.json` |

**Einschränkung, die im Bericht bleiben muss:** Beide Prüfer stammen aus demselben Modell-Haus. Das ist
noch nicht die Unabhängigkeit, die die Spec verlangt (offener Punkt **O-1**: MikeOSS-Zugang). Die
Blindkopien für einen echten Zweitprüfer liegen fertig bereit:
`golden/typing.v1.blind-for-rater-b.json` und `golden/relations.v1.blind-for-rater-b.json`.

---

## 2. Ergebnis Klassifizierung

| Achse | Rohübereinstimmung | Kappa | Tor (≥ 0,6) |
|---|---|---|---|
| `obligationKind` | 92,5 % | **0,879** | bestanden |
| `provisionKind` | 82,5 % | **0,777** | bestanden |
| `partyRole` | 70,0 % | **0,597** | **knapp verfehlt** |
| `normKind` | 100 % | — | ausgenommen (konstant) |
| `bindingness` | 97,5 % | — | ausgenommen (konstant) |

`provisionKind` — die Achse, die für diesen Bau neu geschaffen wurde — trägt mit 0,777 belastbar.
Ihre Klassenverteilung ist nach dem Pflicht-Einschluss der Geltungsbereichs- und Definitions-Artikel
tragfähig: 17 Geltungsbereich, 11 Aufsicht, 8 Definition (vorher 5 bzw. 2).

---

## 3. Ergebnis Beziehungen

| | Wert |
|---|---|
| Rohübereinstimmung | 94,0 % |
| Gesamt-Kappa | **0,212** |
| Abweichungen | 7 von 116 |
| Je Beziehungsart | keine Art erreicht n ≥ 10 — kein Einzelwert berechenbar |

Verteilung Prüfer A: 111 × „keine Beziehung", 6 × Verdrängung, je 1 × Konkretisierung, Auslegung,
Verdrängt-durch. Prüfer B: 114 × „keine Beziehung", 2 × Gleichwertigkeit, 4 offen.

---

## 4. Die drei Befunde

### Befund 1 — Die Prüfer hatten die Aufgabenstellung nie bekommen *(behoben)*

Der erste Beziehungs-Lauf ergab 81,7 % Rohübereinstimmung bei Kappa 0,265. Die Durchsicht der 22
Abweichungen war eindeutig: nahezu alle betrafen die Regel „paralleles Schutzziel ist keine Beziehung"
oder die Abgrenzung Verdrängung gegen Konkretisierung.

Beide Regeln stehen in der Rubrik. **Kein Prüfer hat die Rubrik je gesehen** — der Vorschlags-Prompt
reichte nur die Namensliste der Beziehungsarten durch. Dieselbe Lücke bestand bei der Klassifizierung.

Das entscheidet, wie eine niedrige Zahl zu lesen ist: Ein Kappa misst nur dann, ob die Aufgabe klar
definiert ist, wenn die Prüfer die Definition auch bekommen haben. Sonst misst er die Lücke im Prompt.

**Behoben** (Commit `dcc1fb2`): Die Entscheidungsregeln wandern in beide Prompts. Wirkung:

| | vorher | nachher |
|---|---|---|
| Beziehungen, Rohübereinstimmung | 81,7 % | 94,0 % |
| Beziehungen, Abweichungen | 22 | 7 |
| `obligationKind` | 0,710 | 0,879 |

Das ist **kein** Modell-Tuning im Sinne von Regel § 7.4 — an den Labels wurde nichts gedreht, die
Aufgabenstellung wurde überhaupt erst mitgeliefert.

### Befund 2 — Konstante Achsen brechen die Messung, nicht die Rubrik *(behoben)*

`normKind` und `bindingness` zeigten 95 % Rohübereinstimmung bei Kappa 0,000. Das ist keine
Uneinigkeit, sondern das Prävalenz-Paradox: Der Korpus besteht ausschließlich aus unmittelbar
geltenden Gesetzgebungsakten, also ist jede Provision `legislation` und `binding`. Wo ein Prüfer nur
eine einzige Klasse vergibt, wird die erwartete Zufallsübereinstimmung so hoch wie die beobachtete —
Kappa fällt rechnerisch auf null.

Ohne Gegenmaßnahme hätte das Tor hier ausgelöst und eine funktionierende Rubrik für ein Problem
umgebaut, das sie nicht hat. **Behoben** (Commit `ad07924` + Rubrik-Abschnitt B4a): Solche Achsen
werden als konstant ausgewiesen, ausdrücklich berichtet und vom Tor ausgenommen. Sie bleiben im
Prüfsatz und werden aussagekräftig, sobald Material mit Varianz dazukommt (delegierte Rechtsakte,
Leitlinien, Normen).

### Befund 3 — Zwei offene Entscheidungen 🧑

#### 3a. `partyRole` — der Werteraum deckt die Regime nicht ab

Kappa 0,597. Die 24 Abweichungen zerfallen in zwei Muster:

1. **Definitions-Artikel** (Art. 3 in DSGVO, NIS2, …): Prüfer A vergibt eine Rolle, Prüfer B sagt
   „nicht anwendbar". → Reine Rubrik-Frage, in B3 zu entscheiden und zu schreiben.
2. **Das eigentliche Problem:** Der Werteraum mischt DSGVO-Rollen (Verantwortlicher, Auftrags­verarbeiter,
   betroffene Person) mit Produkt-Rollen aus AI Act und CRA (Anbieter, Betreiber, Händler, Einführer).
   Für eine NIS2- oder DORA-Provision passt **keine von beiden** — dort sind „wesentliche und wichtige
   Einrichtungen" bzw. „Finanzunternehmen" adressiert, für die es in der Ontologie keinen Wert gibt.
   Die Prüfer greifen dann zu willkürlich verschiedenen Ersatzwerten: `controller` gegen `provider`
   gegen `deployer` auf demselben Paragraphen.

**Das ist eine Lücke in der Ontologie, keine unklare Rubrik.** Eine Rubrik kann keine Klasse schärfen,
die es nicht gibt. Vorschlag: einen regime-neutralen Wert für den Regulierten ergänzen (Facetten-
Erweiterung wie bei `provisionKind`, Version 1.5.0 → 1.6.0), plus die Definitions-Regel in B3.

> **Entscheidung des Architekten:** Facette erweitern und neu messen — oder `partyRole` für Gate 1
> als „noch nicht tragfähig" ausweisen und ohne sie einfrieren?

#### 3b. Beziehungen — die Paar-Auswahl findet die falschen Paare

94 % Rohübereinstimmung, aber Kappa 0,212 — dieselbe Mechanik wie bei Befund 2: 111 von 120 Paaren
sind „keine Beziehung". Der Satz ist zu dünn an echten Beziehungen, um eine belastbare Zahl zu tragen.

Die Ursache ist im Aufbau angelegt: Die Paare werden **nach Ähnlichkeit** ausgewählt. Genau die
zentrale Rubrik-Regel sagt aber, dass Ähnlichkeit **keine** Beziehung begründet — DSGVO Art. 32 und
NIS2 Art. 21 sind maximal ähnlich und stehen in keiner Beziehung zueinander. Die Ähnlichkeits-Suche
findet also systematisch thematische Zwillinge, das heißt: systematisch Negativ-Fälle.

Echte Beziehungen stehen dort, wo eine Norm die andere **anspricht** — „unbeschadet der Verordnung
(EU) 2016/679", „im Sinne von Artikel X der Richtlinie …", sektorspezifische Vorrangklauseln. Das ist
über Verweis-Muster im Text auffindbar, nicht über Vektor-Nähe.

> **Entscheidung des Architekten:** Paar-Auswahl auf verweis-getrieben umstellen (Ähnlichkeit bleibt
> als Quelle für Negativ-Fälle) — oder den Beziehungs-Prüfsatz mit dem heutigen Positiv-Anteil
> einfrieren und die dünne Aussage im Bericht offenlegen?

---

## 5. Zustand der Bauarbeit

- **Rein additiv.** Kein bestehender Pfad geändert; das binäre Kappa des Zuordnungs-Pfades bleibt
  unangetastet.
- **Typprüfung grün** für `shared` und `server`.
- **Keine neuen roten Tests.** Die vier fehlschlagenden Tests (Kostenschätzung, Legacy-Typ-Abbildung,
  Norm-Dedupe) bestehen unverändert auch ohne diesen Branch; die 10 abbrechenden Suiten sind die
  bekannten vorbestehenden Integrations-Flaky-Suiten.
- **Werkzeuge vollständig:** Bau, Vorschlag, Adjudikations-Oberfläche, Blindkopie und Einigkeits-Messung
  für beide Prüfsätze; Pflicht-Einschluss seltener Klassen; mehrklassiges Kappa; Erkennung konstanter
  Achsen.

## 6. Was Gate 1 noch fehlt

1. 🧑 Entscheidung 3a (`partyRole`) und 3b (Paar-Auswahl).
2. 🧑 Adjudikation der verbleibenden Abweichungen, Begründung je Fall in `notes`.
3. **O-1**: ein Zweitprüfer außerhalb desselben Modell-Hauses. Blindkopien liegen bereit.
4. Einfrieren beider Sätze als `typing.v1.json` / `relations.v1.json` mit `frozen: true`.

## 7. Rohdaten

| Artefakt | Pfad |
|---|---|
| Entwurf Klassifizierung | `packages/server/src/evals/golden/typing.v1.draft.json` |
| Prüfer A / B | `typing.v1.rater-a.json` · `typing.v1.rater-b-haiku.json` |
| Blindkopie | `typing.v1.blind-for-rater-b.json` |
| Entwurf Beziehungen | `relations.v1.draft.json` |
| Prüfer A / B | `relations.v1.rater-a.json` · `relations.v1.rater-b-haiku.json` |
| Blindkopie | `relations.v1.blind-for-rater-b.json` |
| Rubrik | `packages/server/src/evals/RUBRIC.md` (Teil B, Teil C) |

Messung reproduzierbar über:

```bash
cd packages/server
npx ts-node src/scripts/typing-kappa.ts    compare src/evals/golden/typing.v1.rater-a.json    src/evals/golden/typing.v1.rater-b-haiku.json
npx ts-node src/scripts/relations-kappa.ts compare src/evals/golden/relations.v1.rater-a.json src/evals/golden/relations.v1.rater-b-haiku.json
```
