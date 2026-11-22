# THE-781 — Ergebnis: Residuen-Check SCF gegen ENISA

**Datum:** 2026-11-17 · **Vorregistrierung:** `2026-11-17-the781-residuen-vorregistrierung.md` (SHA-256 `190b4050…`, eingefroren 21:56 UTC vor dem Download)
**Analyse:** `packages/server/scripts/the781-residuen/analyse.py` (SHA-256 `6ae412aa…`, unverändert) · **Parser:** `parse.cjs` (nach dem Download)

## Urteil: KILL

Die Korrespondenzanalyse sagt **nicht** vorher, wo ENISA eine ISO-Kontrolle nennt, die das SCF nicht hat.
Alle drei Kriterien verfehlt; selbst die obere Konfidenzgrenze liegt unter der Schwelle.

| | M (KA, k = 5) | B0 Spaltengrad | B1 Nachbarzeilen |
|---|--:|--:|--:|
| **AUROC** (gepoolt, 4.163 Zielzellen, 38 positiv) | **0,568** | 0,449 | 0,565 |
| 95-%-KI AUROC(M) | 0,465–0,670 | | |
| Differenz M − B1 (beste Baseline) | +0,003, KI −0,096 bis +0,113 | | |
| Precision@20 | 0,00 | 0,00 | 0,05 |
| ohne Zeile 3.3 | 0,568 | 0,438 | 0,564 |

| Kriterium | Soll | Ist | |
|---|---|---|---|
| AUROC(M) ≥ 0,70 | 0,70 | 0,568 | ✗ |
| untere Grenze (M − beste Baseline) > 0 | > 0 | −0,096 | ✗ |
| ohne 3.3 hält | ≥ 0,70 und Differenz > 0 | 0,568 / +0,004 | ✗ |

## Kontrollen

- **Positivkontrolle 1 (Pipeline): bestanden, mit erklärter Abweichung.** Der Parser liest alle 49 ENISA-Zeilen korrekt (Liste im Lauf geprüft).
  Er findet **48** vergleichbare Punkte, Recall 0,660, 24 voll, 8 keine — gleiche 8 ungedeckte Punkte wie THE-538.
  Ohne Punkt 3.1 ergibt er exakt **47 / 0,6525 / 23**: Der THE-538-Parser hatte die ENISA-Zelle `A.5 .24` (Leerzeichen vor dem Punkt) verloren.
  Weitere Schreibweisen in der ENISA-Tabelle: `A5.7`, `A. 5.30`, griechisches `Α.5.19`.
- **Positivkontrolle 2 (Mechanik): bestanden.** Versteckte SCF-Zellen findet M wieder (AUROC 0,825 gegen B0 0,725, B1 0,779).
- **Negativkontrolle: unauffällig.** Zeilenweise permutierte Labels geben AUROC(M) 0,501 (KI 0,416–0,585) → gepoolte Metrik gilt.
- **Sensitivität:** k = 3 → 0,543, k = 8 → 0,591. 47-Punkte-Variante (THE-538-Parser): AUROC(M) 0,569, ebenfalls KILL.

## Abweichung von der Vorregistrierung

Hauptlauf auf **48** statt 47 Punkten, weil die Reproduktion den Unterschied als Parser-Fehler von THE-538 identifiziert hat (3.1 ist eindeutig A.5.24).
Festgelegt vor dem ersten Analyseergebnis; die 47er-Variante ist als Sensitivität mitgerechnet und ändert das Urteil nicht.

## Was das bedeutet

1. **Das Verfahren funktioniert, die Prämisse nicht.** M rekonstruiert die eigene Struktur des SCF gut (Positivkontrolle 2), aber diese Struktur sagt nichts darüber, wo ENISA anders mappt.
   Die Uneinigkeit der beiden Häuser ist kein Rauschen um eine gemeinsame Struktur, sondern eine **andere Lesart** — das passt zum THE-538-Befund bei RSK-01.
2. **Es gibt keine wenigen Hauptachsen.** Die Singulärwerte fallen kaum ab (1,00 · 0,88 · 0,82 · 0,82 · 0,79 · 0,78 · 0,76 · 0,75); fünf Achsen erklären nur 31 % der Trägheit.
   Die Beltrami-Hoffnung „viele Pflichten auf wenige Hauptachsen“ trägt auf dieser Matrix nicht.
3. **Die Top-Vorhersagen sind generische Governance-Kontrollen** (ISO 5.2 Rollen, 5.4 Managementverantwortung, 5.18 Zugriffsrechte) — Beliebtheit, nicht Inhalt. Eine Adjudikation des Gold-Ausgangs würde das Urteil nicht ändern und wird darum nicht empfohlen.

## Gold-Ausgang (nur dokumentiert, Adjudikation nicht empfohlen)

| CIR-Punkt | ISO 27002 |
|---|---|
| 6.2 Secure development life cycle | 5.2, 5.4, 5.14 |
| 6.9 Protection against malicious and unauthorised software | 5.18, 5.15 |
| 13.1 Supporting utilities | 5.30, 8.12 |
| 12.3 Removable media policy | 5.18 |
| 8.1 Awareness raising and basic cyber hygiene | 5.4 |
| 4.3 Crisis management | 5.4 |

## Re-Trigger

Ein Crosswalk mit **menschlich adjudizierten Fehlern** (z. B. Notar-Urteile über LLM-Mappings). Erst dort ließe sich prüfen, ob Residuen Fehler finden statt Lesarten.

## Artefakte (Rohdaten flüchtig im Session-Scratchpad)

| Datei | SHA-256 |
|---|---|
| ENISA-Mapping-Tabelle v1.2 | `b34ce42c46bd643dd3e5bc4aa03c2704fa006fc798946e36753914521d2be59b` (= THE-538) |
| SCF 2026.2 | `9e0a4df4993726c95e636f04b3028d8b5edeba2bda45d16ed6722b13540e6835` |
| points.json (48) | `ffd61b5f9d9f7637866d28fe382b7a2d570110451d717456acc019934b126ca9` |
| result-48.json | `73c7857471308a91b361c5ab891cf670b4f09a05aff8c332b177ce0c49690ad1` |
| result-47.json | `edfa56507a0b73c8035236260d082fb40eb537030bb06fe388f96521c6e56dba` |

Reproduzieren: beide Dateien aus den Quellen der Vorregistrierung laden, dann
`node parse.cjs <scf.xlsx> <enisa.xlsx> points.json` und `python -I analyse.py points.json result.json` (numpy 2.0).
