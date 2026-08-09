# RVTM — THE-630: Ein Schritt der Kette am Klick

**Datum:** 2026-08-09 · **Ticket:** [THE-630](https://linear.app/thearchitect/issue/THE-630) · Parent [THE-628](https://linear.app/thearchitect/issue/THE-628)
**Lief gegen:** Produktion (`https://thearchitect.site`)

**Ousterhout-Verdikt aus dem Pre-Flight:** *Unknown Unknowns **hoch*** — diesen Weg war am Klick
noch nie jemand gegangen. Deshalb umgeschnitten in **einen** Schritt statt sieben. Das Urteil
war richtig: Der Weg zum Ziel hat vier Anläufe gebraucht, drei davon wegen meines eigenen
Messwerkzeugs.

---

## Anforderungen → Nachweis

| AC | Nachweis |
|---|---|
| **AC-1** eigenes Projekt, erkennbar benannt | `[E2E-Durchstich] <Zeitstempel>`, Präfix als exportierte Konstante |
| **AC-2** Korpus-Sektion über die Fläche, nicht über eingefügten Text | `section-select` bedient; Textfeld **schreibgeschützt** (belegt im Lauf) |
| **AC-3** erzeugt und bestätigt | „Save 14 requirements" bzw. „Save 5 requirements", Dialog schließt |
| **AC-4** Verankerung sichtbar | `chain-provenance`: **„Abs. 1 · esg-rating-de:art-18"** |
| **AC-5** ehrlich über Kosten | Laufzeit und Ketten-Quoten im Bericht; Warnzeile vor dem teuren Teil |
| **AC-6** Bericht nennt den gebrochenen Schritt | Alle ≥400-Antworten mitgeschrieben; Zusicherungen tragen eigene Fehlertexte |

## Die zwei Läufe

```
DSGVO Art. 32 — Sicherheit der Verarbeitung
  2113 Zeichen Vorschau · 43 s · 8 Klauseln · 2 ohne Anforderung · 4 aufgeteilt
  Anker: dsgvo:art-32          → 14 Anforderungen gespeichert

ESG-RATING Art. 18 — Führen von Aufzeichnungen        ⟵ der scharfe Lauf
  378 Zeichen Vorschau · 15 s · 2 Klauseln · 0 ohne Anforderung · 2 aufgeteilt
  Anker: esg-rating-de:art-18  → 5 Anforderungen gespeichert
```

## Warum der zweite Lauf der eigentliche Beweis ist

Am 03.08. wies der Server mit *„source must be one of …"* ab, weil das Modal beim Speichern den
**Gruppen**-Schlüssel (`ai-act`) statt der aufgelösten Quelle (`ai-act-de`) schickte. Die
Bauteil-Tests waren grün — ihre Fixture kannte nur `nis2` und `lksg`, deren Stamm zufällig
gültig ist.

Bei DSGVO fällt beides zusammen (`dsgvo`), der Fehler wäre unsichtbar geblieben. Bei
ESG-RATING nicht:

```
Gruppe im Dropdown:  esg-rating
Quelle im Anker:     esg-rating-de     ⟵ aufgelöst, nicht geraten
```

Der Lauf prüft das jetzt als eigene Zusicherung. **Er hätte den Fehler vom 03.08. gefunden.**

## Vier Anläufe — und was jeder gekostet hat

| Anlauf | Was schiefging | Ursache |
|---|---|---|
| 1 | „0 Projekte, 0 Marken" | DOM gelesen, bevor die Daten da waren |
| 2 | „die Fläche hat nicht gefragt" | Lauscher **nach** der Navigation aufgehängt |
| 3 | Quellen-Dropdown zeigt die alte Sechser-Liste | 4 s Wartezeit für eine **242-KB**-Antwort — beinahe eine Falschmeldung gegen ein Done-Ticket ([THE-570](https://linear.app/thearchitect/issue/THE-570)) |
| 4 | „3 Klauseln, 3 ohne Anforderung" | Spec nahm `options[1]` — das ist **Art. 1, Gegenstand und Ziele** |

Die ersten drei waren Messfehler und stehen als Regel in
`feedback_spa_measurement_timing`: **auf die Antwort warten, nicht auf Sekunden; den Lauscher
vor die Navigation hängen; Belege sammeln statt Zahlen.**

Der vierte war ein Domänen-Fehler mit eigener Lehre: **Bei Gesetzen ist Artikel 1 praktisch
immer Gegenstand und Ziele.** „Nimm den ersten" ist die schlechteste aller Wahlen — der Lauf
meldete korrekt nichts, und ich hielt es für einen Defekt. Der Zielartikel wird jetzt benannt
gewählt, und ein leeres Ergebnis bricht mit dem Hinweis ab, dass es bei einem Zweckartikel
richtig und bei einem Pflichtartikel ein Befund wäre.

## Was der Lauf NICHT beweist

- **Nicht „die Kette funktioniert".** Er deckt **einen** Schritt ab: Gesetz → Anforderung.
  Lücken, geteilte Maßnahme, Nachweis, Attest, Prüfer-Bündel sind Slice 2.
- **Er ist kein Freigabe-Tor.** Modellaufrufe, Netz, Schreibzugriffe auf Produktion — er kann
  nicht im Build laufen. Das Tor bleibt mechanisch ([THE-611](https://linear.app/thearchitect/issue/THE-611), 134/134 unverändert).
- **Er räumt nicht auf.** Drei Projekte und 19 Ketten-Anforderungen bleiben in Produktion
  liegen. Bewusste Schuld, Slice 3.
- **Eine Beobachtung, keine Verteilung.** Die Extraktion ist nicht-deterministisch; ob dieselben
  Quoten wiederkehren, ist offen.

## Nebenbefund

Der Generator sitzt in der **Werkzeugleiste der Projekt-Ansicht**, nicht auf der
Compliance-Fläche — obwohl dort die Kette lebt (Pipeline, Matrix, Gap Analysis, Audit). Ich
habe ihn zwei Anläufe lang an der falschen Stelle gesucht. Ein Nutzer täte vermutlich dasselbe.
Das ist kein Fehler, aber ein Kandidat für die Frage nach der Auffindbarkeit.

## Nachvollziehen

```
$ npm run e2e -- e2e/chain-walkthrough.spec.ts
$ E2E_LAW=ESG-RATING E2E_ARTICLE='Art\. 18\b' npm run e2e -- e2e/chain-walkthrough.spec.ts
```

Braucht `.env.e2e` (gitignored, Platzhalter in `.env.e2e.example`).
