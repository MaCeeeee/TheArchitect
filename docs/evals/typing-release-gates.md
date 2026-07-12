# Typing-Eval — Freigabe-Schwellen (THE-430 AC-5)

**Gilt für:** die ONTO-Suggest-Features, die auf der Typing-Eval aufsetzen —
THE-432 (Term Typing beim Ingest), THE-433 (Relation Extraction), THE-434
(Stage-1-Retrieval). **Kern-Regel:** *Kein Suggest-Feature geht `default-on`,
ohne ein frozen Golden-Set + einen Baseline-Report, der diese Schwellen trifft.*

Quelle der Disziplin: OntoLearner (arXiv:2607.01977) §5 — Modelle liegen
**konfident falsch**, F1 allein sieht das nicht. Darum: pro Achse gemessen,
nach C_score-Band stratifiziert, mit Kalibrierungs-Ausweis.

## Vorbedingungen (hart)

1. **Golden frozen**: `frozen: true`, Kappa ≥ 0.6 nach Adjudikation (RUBRIC §7).
   Ein nicht-frozen Golden erzeugt keinen verbindlichen Baseline-Report.
2. **Leakage deklariert**: wurde LLM-vorgelabelt (typing:prelabel), labelt
   dieselbe Modell-Klasse, die getestet wird — im Report vermerkt. Ein Feature,
   das auf leakage-behaftetem Golden knapp über der Schwelle liegt, ist NICHT
   freigabereif; dann ein zweiter, unabhängig gelabelter Golden-Split.
3. **Sprach- + Band-Deckung**: mindestens DE + EN vertreten; Bänder, in denen
   das Feature laufen soll, mit ≥ 5 Cases besetzt (sonst kein Urteil je Band).

## Freigabe-Schwellen je Achse (Vorschlag → default-on)

| Achse | Accuracy | macro-F1 | Zusatz |
| --- | --- | --- | --- |
| normKind | ≥ 0.90 | ≥ 0.85 | norm-level, hohe Deckung erwartbar |
| bindingness | ≥ 0.85 | ≥ 0.80 | — |
| obligationKind | ≥ 0.80 | ≥ 0.75 | deontisches Tripel; `__na__` als eigene Klasse gewertet |
| partyRole | ≥ 0.75 | ≥ 0.70 | dünnbesetzte Klassen → macro-F1 kritisch |

Schwellen sind **Slice-1-Startwerte** (kein Paper-Import — die Law-Domäne war im
OntoLearner-Benchmark nicht getestet). Nach dem ersten echten Baseline werden sie
mit den beobachteten Bootstrap-CIs kalibriert, nicht vorab pauschal gesetzt.

## C_score-Band-Kopplung (THE-431)

Auto-Akzeptanz-Schwelle steigt mit Norm-Komplexität — dort konzentrieren sich
Halluzinationen (Paper §5). Über `confidenceThresholdForBand` (complexityScore.ts):

| Band | Auto-Akzeptanz | Review |
| --- | --- | --- |
| trivial / low | Default-Schwelle | Stichprobe |
| moderate | Default-Schwelle | Breakdown beobachten |
| high | + strengere Confidence | erhöht |
| very-high | nur Top-Konfidenz | Pflicht-Review |

Default-Overrides sind LEER → heutiges Verhalten unverändert, bis ein Band-Wert
gesetzt wird (keine Regression, THE-431 AC-4).

## Kalibrierung (Gate, nicht nur Anzeige)

Trägt die Vorhersage Confidence: **ECE ≤ 0.10** je Achse für default-on. Höheres
ECE = konfident-falsch → Feature bleibt Vorschlag-mit-Review, auch bei guter
Accuracy. Ohne Confidence: kein ECE-Gate, aber auch keine Auto-Akzeptanz nach
Confidence-Schwelle möglich (nur Accuracy-basierte Freigabe).

## Ablauf

```
typing:build → typing:prelabel → typing:worksheet → (Kappa) → frozen
             → typing:eval --golden <frozen.json>
             → Report gegen diese Tabelle prüfen → THE-432 default-on JA/NEIN
```
