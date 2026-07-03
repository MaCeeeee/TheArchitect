# EVAL_BASELINE — Compliance-Mapping (THE-381)

> Dieses Dokument hält die **eine Zahl** fest, gegen die jede Prompt-/Modell-
> Änderung verglichen wird. Es wird NUR aktualisiert, wenn bewusst eine neue
> Baseline gesetzt wird (z. B. nach Golden-Set-Freeze oder Modellwechsel) —
> nicht bei jedem Lauf.

## Status: ⏳ NOCH KEINE BASELINE

Voraussetzungen (in dieser Reihenfolge):

- [ ] Golden-Set v1 gelabelt (≥ 50 Cases, ≥ 15 % Hard Negatives) — THE-379
- [ ] Doppel-Labeling: Cohen's Kappa ≥ 0,6 dokumentiert — RUBRIC.md §7
- [ ] Golden-Set `frozen: true` gesetzt
- [ ] `npm run eval:mapping` einmal live gelaufen (Cache gefüllt)

## Baseline (auszufüllen beim ersten eingefrorenen Lauf)

| Feld | Wert |
|---|---|
| Datum | _TBD_ |
| Golden-Set-Version | _TBD (frozen)_ |
| Modell | _TBD_ |
| Prompt-Hash | _TBD_ |
| Threshold / Top-N | _TBD_ |
| **Recall** | _TBD_ (CI: _TBD_) |
| **F2** | _TBD_ (CI: _TBD_) |
| Precision | _TBD_ |
| Empty-Set-Accuracy | _TBD_ |
| Cohen's Kappa (Annotatoren) | _TBD_ |
| Report-Datei | _TBD (JSON aus reports/ hier einchecken)_ |

## Regeln

1. **F2 und Recall sind die Leitmetriken** (übersehenes Gesetz = audit-kritisch).
2. Eine Änderung gilt erst als Verbesserung/Regression, wenn sie **außerhalb
   des Bootstrap-CI** der Baseline liegt (statistische Ehrlichkeit).
3. Jede neue Baseline = neue Zeile in der Historie unten, alte bleibt stehen.

## Historie

| Datum | Set | Modell | Recall | F2 | Anlass |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
