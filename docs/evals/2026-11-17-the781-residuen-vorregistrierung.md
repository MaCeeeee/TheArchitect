# THE-781 — Vorregistrierung: Residuen-Check SCF gegen ENISA

**Datum:** 2026-11-17 · **Ticket:** THE-781 (Decision) · **Bezug:** THE-780 / ADR-0007 E8, THE-538
**Eingefroren VOR dem Download beider Dateien.** Die SHA-256 dieser Datei steht im Ticket.
Nach dem Einfrieren ändert sich hier nichts mehr; Abweichungen stehen im Ergebnisbericht als „Abweichung von der Vorregistrierung“.

## Frage

Sagt eine Korrespondenzanalyse mit k = 5 Achsen auf der Matrix CIR-Punkt × ISO 27002:2022,
abgeleitet aus dem SCF, die Zellen vorher, die das SCF **nicht** hat, ENISA aber **nennt** —
besser als die Pflicht-Baselines?

**Reichweite der Aussage:** ENISA ist eine zweite Fachmeinung, kein Gold. Ein positives Ergebnis heißt
nur „sagt Uneinigkeit zweier Fachquellen vorher“, nicht „findet Mapping-Fehler“.

## Offenlegung: Was vorher bekannt ist

Aus `docs/strategy/2026-08-01-the538-enisa-gegenprobe.md` (gelesen am 17.11. vor dieser Vorregistrierung):
47 vergleichbare CIR-Punkte; mittlerer Recall 0,653; Deckung 23 voll / 16 teilweise / 8 keine;
die 8 ungedeckten Punkte: 2.2, 3.3, 5.2, 6.1, 10.1, 11.4, 11.7, 12.5; Einzelwerte zu 3.3, 3.5, 4.1, 4.2, 2.1, 9.1.
Die Ergebnisse je Zelle (`enisa_result.json`) sind verloren und nicht bekannt.

## Daten

| Quelle | Datei | Bezug | Prüfung |
|---|---|---|---|
| ENISA | `ENISA_Technical_Implementation_Guidance_Mapping_table_version_1.2.xlsx` | enisa.europa.eu, 2025-09 | SHA-256 muss `b34ce42c46bd643dd3e5bc4aa03c2704fa006fc798946e36753914521d2be59b` sein |
| SCF | `secure-controls-framework-scf-2026-2.xlsx` | GitHub-Release `securecontrolsframework/securecontrolsframework` | SHA-256 wird im Bericht notiert. Fehlt 2026.2, wird 2026.3 genommen und das offengelegt |

## Aufbereitung

- **Spalten:** die 93 Kontrollen von ISO 27002:2022 (5.1–5.37, 6.1–6.8, 7.1–7.14, 8.1–8.34).
  ISO-27001-Klauseln 4–10 zählen nicht (wie in THE-538).
- **SCF-Menge je CIR-Punkt p:** Vereinigung der ISO-27002-Referenzen aller SCF-Kontrollen, die auf p gemappt sind.
- **ENISA-Menge je CIR-Punkt p:** die ISO-27001-Annex-A-Referenzen der ENISA-Zeile p (nummerngleich mit 27002).
- **Vergleichbare Zeilen:** CIR-Punkte mit nichtleerer SCF-Menge **und** nichtleerer ENISA-Menge.
- **Matrix X:** X[p, j] = 1, wenn j in der SCF-Menge von p liegt.

## Positivkontrolle 1 — Pipeline (vor jeder Analyse)

Reproduziert werden: **47 vergleichbare Punkte** und **mittlerer Recall 0,653 ± 0,01** (Recall je Punkt = |SCF ∩ ENISA| / |ENISA|).
Gelingt das nicht, wird nur der **Parser** korrigiert (Spaltenwahl, Referenz-Erkennung), nie ein Analyseparameter.
Parser-Korrekturen zählen nicht gegen das Loop-Budget. Gelingt die Reproduktion nach 3 Parser-Hypothesen nicht: Stopp und Befund.
Bei SCF 2026.3 gilt die Toleranz als nicht anwendbar; die Abweichung wird berichtet und der Lauf als „Version abweichend“ markiert.

## Verfahren

- **M — Korrespondenzanalyse:** P = X / n, Zeilenmassen r, Spaltenmassen c,
  S = D_r^(−1/2) (P − r cᵀ) D_c^(−1/2); SVD von S; Rang-k-Rekonstruktion
  P_k = r cᵀ + D_r^(1/2) S_k D_c^(1/2), **k = 5** (kleiner, falls der Rang von S < 5).
  Score(p, j) = P_k[p, j]. Spalten mit Summe 0 werden aus der Zerlegung genommen und bekommen bei allen Verfahren Score 0.
- **B0 — Spaltengrad / Unabhängigkeitsmodell:** Score = r_p · c_j (das ist M mit k = 0).
- **B1 — Nachbarzeilen:** die 5 nach Jaccard ähnlichsten anderen Zeilen (Gleichstand: Reihenfolge der CIR-Nummer);
  Score = Anteil dieser Nachbarn mit X[·, j] = 1.

## Zielzellen und Metrik

- **Zielzellen:** alle (p, j) mit X[p, j] = 0 auf den vergleichbaren Zeilen. **Label** = 1, wenn ENISA j bei p nennt.
- **Metrik:** AUROC über alle Zielzellen (Gleichstände zählen 0,5).
- **Unsicherheit:** Bootstrap über die Zeilen (1.000 Ziehungen mit Zurücklegen, Seed 20261117).
- **Beste Baseline:** die mit dem höheren AUROC-Punktwert auf den vollen Daten.

## Kontrollen

- **Positivkontrolle 2 — Mechanik:** 20 Wiederholungen (Seeds 20261117 + i), je 10 % der Einsen in X zufällig verstecken,
  alle Verfahren auf der maskierten Matrix neu rechnen; Zielzellen = Nullen der maskierten Matrix, Label = versteckt.
  **Bestanden**, wenn der mittlere AUROC von M über dem von B0 liegt. Sonst Stopp ohne Urteil (Verfahren mechanisch kaputt).
- **Negativkontrolle — zeilenweise Permutation:** 200 Permutationen der ENISA-Labels innerhalb jeder Zeile.
  Enthält das 95-%-Intervall des permutierten AUROC von M den Wert 0,5, gilt die Hauptmetrik.
  Sonst ist der gepoolte AUROC durch Zeileneffekte verzerrt, und **entscheidend wird der Makro-AUROC je Zeile**
  (Mittel über Zeilen mit mindestens einem positiven und einem negativen Ziel), mit denselben Schwellen und demselben Bootstrap.

## Urteil

**TRÄGT**, wenn alle drei gelten:
1. AUROC(M) ≥ 0,70
2. untere 2,5-%-Grenze von AUROC(M) − AUROC(beste Baseline) > 0
3. **ohne Zeile 3.3** (aus Matrix und Zielzellen entfernt, alles neu gerechnet): AUROC(M) ≥ 0,70 und Punktwert der Differenz > 0

**KILL** sonst. Re-Trigger: ein Crosswalk mit menschlich adjudizierten Fehlern.

**Nur berichtet, nicht entscheidend:** k = 3 und k = 8; AUROC je Verfahren; Precision@20.

## Gold-Ausgang

Die 10 Zielzellen mit dem höchsten Score von M, die ENISA **nicht** nennt, gehen an den Menschen:
„Gehört ISO-Kontrolle j fachlich zu CIR-Punkt p?“ — ja / nein / unklar. Ohne dieses Urteil trägt keine dieser Zellen eine Aussage (ADR-0012).

## Artefakte

- Rohdaten: Scratchpad der Session (flüchtig), Prüfsummen im Bericht.
- Code: `packages/server/scripts/the781-residuen/` — `analyse.py` wird zusammen mit dieser Datei vor dem Download eingefroren (SHA im Ticket); der Parser entsteht nach dem Download und wird nur gegen Positivkontrolle 1 justiert.
- Bericht: `docs/evals/2026-11-17-the781-residuen-ergebnis.md`.
