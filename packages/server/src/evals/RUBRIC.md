# Labeling-Rubrik — Compliance-Mapping Golden-Set (v1)

> Linear: THE-379 (REQ-EVAL-001.1) · Epic: THE-378 (UC-EVAL-001)
>
> Diese Rubrik definiert, **wann ein (Regulierung, Element)-Paar als Treffer gilt**.
> Sie ist die einzige Wahrheitsquelle für: (1) menschliches Labeling des Golden-Sets,
> (2) den LLM-Judge-Prompt (THE-382). Änderungen an der Rubrik = neue Golden-Set-Version.

## 1. Die Label-Frage

Für jedes Paar aus einem Regulierungs-Paragraphen R und einem Architektur-Element E
beantworten wir genau eine Frage:

> **„Ist E von R materiell betroffen — d. h. muss E angepasst, geprüft oder
> nachgewiesen werden, damit die Organisation R erfüllt?"**

Antwort: `match` oder `no-match`. Keine Zwischenstufen im Label (die Unsicherheit
gehört in `notes`, nicht ins Label).

## 2. `match` — Kriterien (mind. eines muss zutreffen)

1. **Expliziter Scope:** R benennt die Funktion/Datenart/Prozessart von E direkt
   (z. B. DSGVO Art. 30 ↔ Element „Verzeichnis von Verarbeitungstätigkeiten").
2. **Funktionale Pflicht:** R verlangt eine Tätigkeit, die E ausführt oder
   implementiert (z. B. LkSG § 6 Abmilderungsmaßnahmen ↔ „Supplier Due Diligence Process").
3. **Datenbezug:** R reguliert eine Datenkategorie, die E speichert/verarbeitet
   (z. B. DSGVO Art. 9 ↔ Datenobjekt mit Gesundheitsdaten).
4. **Nachweispflicht:** E erzeugt oder hält die Evidenz, die R fordert
   (Audit-Logs, Berichte, Dokumentation).

## 3. `no-match` — typische Fälle (Abgrenzung)

- **Nur thematische Nähe:** E klingt verwandt, aber R erzeugt keine konkrete
  Anpassungs-/Prüf-/Nachweispflicht für E. („beide handeln von IT-Sicherheit" reicht NICHT.)
- **Transitive Betroffenheit:** R trifft ein anderes Element, das mit E nur
  verbunden ist. Wir labeln **direkte** Betroffenheit; Kaskaden ergeben sich im
  Graph, nicht im Label.
- **Organisationspflicht ohne Systembezug:** R verpflichtet die Organisation
  (z. B. Meldung an Behörde), aber kein gelistetes Element führt das aus.

## 4. Mehrdeutigkeit — die Entscheidungsregel

Wenn zwei kompetente Architekten unterschiedlich entscheiden könnten:

1. Entscheide nach der Frage: **„Würde ein Auditor verlangen, dieses Element im
   Compliance-Nachweis für R aufzuführen?"** Ja → `match`.
2. Bleibt es 50/50 → `no-match` labeln **und** `ambiguous: true` setzen mit
   Begründung in `notes`. (Konservativ labeln; ambige Fälle werden bei der
   Kappa-Auswertung gesondert betrachtet und können die Rubrik schärfen.)

## 5. Hard Negatives (Pflichtbestandteil des Sets)

≥ 15–20 % der Fälle müssen Paragraphen sein, für die **kein** Kandidat ein
`match` ist (`goldElementIds: []`). Sie testen, ob das Modell korrekt „nichts"
zurückgibt, statt zwanghaft zu matchen. Gute Quellen: Paragraphen zu Behörden-
zuständigkeiten, Bußgeldrahmen, Definitionen.

## 6. Stratifizierung (Soll-Verteilung v1, 50–100 Fälle)

| Dimension | Vorgabe |
|---|---|
| Quellen | dsgvo, nis2, lksg mindestens je 20 %; dora/iso27001 optional |
| Hard Negatives | ≥ 15 % |
| Sprache | de und en vertreten |
| Element-Typen | mind. 4 verschiedene (`application`, `business_process`, `data_object`, `capability`, …) |

## 7. Doppel-Labeling & Cohen's Kappa (Freeze-Kriterium)

1. Zwei Annotatoren labeln **dieselben ≥ 20 Fälle** unabhängig.
2. Cohen's Kappa über alle Paare berechnen (`metrics.ts → cohenKappa`).
3. **Kappa ≥ 0,6:** Differenzen adjudizieren (gemeinsam final entscheiden),
   Set als `frozen: true` mit Version `v1` einfrieren.
4. **Kappa < 0,6:** Die Aufgabe ist unklar definiert — **nicht** das Modell
   tunen, sondern diese Rubrik schärfen (v. a. Abschnitte 2/3), dann neu labeln.
5. Adjudikations-Entscheidungen mit Ein-Satz-Begründung in `notes` festhalten —
   sie sind das Rohmaterial für den Judge-Prompt (THE-382).

## 8. Format

Golden-Set-Einträge liegen in `golden/mapping.v1.json` und werden von
`goldenSet.ts` (Zod) validiert. Pro Fall: Regulierungstext + Kandidatenliste +
`goldElementIds` (leer = Hard Negative). Ein eingefrorenes Set wird nie
editiert — Korrekturen erzeugen `mapping.v2.json`.
