# Discovery-Eval Report — Golden-Set v1

> ⚠️ **PRELIMINARY — golden set not yet owner-approved** (`frozen: false`).
> Results are development values, not a THE-381-style baseline.

> ⚠️ **DEGENERATE any-hit setting**: topK (60) ≥ fixture corpus size (35 paragraphs) —
> every query retrieves every paragraph, so any-hit recall is trivially 100%. The gated
> metrics below remain meaningful (they measure what actually reaches the judge in prod).

- Date: 2026-07-18T17:44:42.504Z · Top-K: 60 · Judge gate: threshold 0.3, max 5
- Cases: 12 (hard negatives: 1 = 8.3%, ambiguous: 1, rule-less-gold cases: 6)

## Retrieval — gated candidate set (what reaches the judge in prod; AC-7)

| Metric | Value | 95%-CI (bootstrap) |
|---|---|---|
| Precision | 40.7% | — |
| **Recall** | **44.0%** | 29.2% – 57.1% |
| F2 | 43.3% | — |
| Empty-Set-Accuracy (hard negatives) | 100.0% | — |
| TP / FP / FN | 11 / 16 / 14 | — |
| **ruleLessGold Recall** (Stage-A-blind families — the corpus value-add) | **83.3%** | — |

_Diagnostic: any-hit recall (upper bound): 100.0% — K=60 vs corpus=35 paragraphs; degenerate if K≥corpus._

### Per-family breakdown (retrieval, gated)

| Family | Precision | Recall | F2 | TP/FP/FN |
|---|---|---|---|---|
| ai-act | 66.7% | 100.0% | 90.9% | 2/1/0 |
| cra | 33.3% | 100.0% | 71.4% | 1/2/0 |
| data-act | 20.0% | 50.0% | 38.5% | 1/4/1 |
| dora | 33.3% | 100.0% | 71.4% | 1/2/0 |
| dsgvo | 0.0% | 0.0% | 0.0% | 0/0/11 |
| eprivacy | 0.0% | 0.0% | 0.0% | 0/0/1 |
| lksg | 0.0% | 0.0% | 0.0% | 0/0/1 |
| mdr | 66.7% | 100.0% | 90.9% | 2/1/0 |
| nis2 | 40.0% | 100.0% | 76.9% | 2/3/0 |
| psd2 | 50.0% | 100.0% | 83.3% | 1/1/0 |
| unece-r155 | 33.3% | 100.0% | 71.4% | 1/2/0 |

## DE/EN family consistency (AC-5)

No de/en family splits detected — every family was merged into a single candidate.

## Judge stage (end-to-end, optional --judge)

| Metric | Value |
|---|---|
| End-to-end Precision | 73.3% |
| **End-to-end F2** | **47.8%** |
| ECE (calibration) | 0.152 |

### Per-family breakdown (end-to-end)

| Family | Precision | Recall | F2 | TP/FP/FN |
|---|---|---|---|---|
| ai-act | 100.0% | 100.0% | 100.0% | 2/0/0 |
| cra | 50.0% | 100.0% | 83.3% | 1/1/0 |
| data-act | 50.0% | 50.0% | 50.0% | 1/1/1 |
| dora | 50.0% | 100.0% | 83.3% | 1/1/0 |
| dsgvo | 0.0% | 0.0% | 0.0% | 0/0/11 |
| eprivacy | 0.0% | 0.0% | 0.0% | 0/0/1 |
| lksg | 0.0% | 0.0% | 0.0% | 0/0/1 |
| mdr | 100.0% | 100.0% | 100.0% | 2/0/0 |
| nis2 | 66.7% | 100.0% | 90.9% | 2/1/0 |
| psd2 | 100.0% | 100.0% | 100.0% | 1/0/0 |
| unece-r155 | 100.0% | 100.0% | 100.0% | 1/0/0 |

### Loss attribution per case

- `bank-payment-provider` — missed@retrieval: dsgvo · missed@judge: — · false-positive@judge: —
- `regional-clinic-patient-portal` — missed@retrieval: dsgvo · missed@judge: — · false-positive@judge: cra, nis2, data-act
- `iot-device-manufacturer` — missed@retrieval: dsgvo · missed@judge: — · false-positive@judge: —
- `ai-recruiting-saas` — missed@retrieval: dsgvo · missed@judge: — · false-positive@judge: —
- `internal-crm-precision` — missed@retrieval: dsgvo · missed@judge: — · false-positive@judge: —
- `energy-grid-operator` — missed@retrieval: dsgvo · missed@judge: — · false-positive@judge: —
- `automotive-telematics` — missed@retrieval: dsgvo, data-act · missed@judge: — · false-positive@judge: —
- `ecommerce-tracking` — missed@retrieval: dsgvo, eprivacy · missed@judge: — · false-positive@judge: —
- `cloud-msp-financial-clients` — missed@retrieval: dsgvo · missed@judge: — · false-positive@judge: dora
- `ai-radiology-diagnostics` — missed@retrieval: dsgvo · missed@judge: — · false-positive@judge: —
- `supply-chain-conglomerate` — missed@retrieval: lksg, dsgvo · missed@judge: — · false-positive@judge: —

### Confidence bands

| Band | Predictions | Correct | Precision |
|---|---|---|---|
| 0.5–0.6 | 0 | 0 | 0.0% |
| 0.6–0.7 | 1 | 0 | 0.0% |
| 0.7–0.8 | 3 | 1 | 33.3% |
| 0.8–0.9 | 8 | 7 | 87.5% |
| 0.9–1.0 | 3 | 3 | 100.0% |

## Cost (AC-4)

- Judge calls: 27 ⚠️ above warning threshold (24)

## Baseline vs. HyDE retrieval (AC-8 — eval-only, NOT in the prod path)

| | Precision | Recall | F2 | ruleLessGold Recall |
|---|---|---|---|---|
| Baseline | 40.7% | 44.0% | 43.3% | 83.3% |
| HyDE | 48.1% | 100.0% | 82.2% | 100.0% |
| **Δ (HyDE − Baseline)** | — | **56.0pp** (CI 42.9–70.8pp) | — | 16.7pp (CI 0.0–50.0pp) |

_A HyDE→prod follow-up REQ is only justified if the ruleLessGold Δ-recall CI is clearly positive — see the plan's "Bewusste Nicht-Ziele"._

_Retrieval and judge are measured separately by design (AC-7): a strong end-to-end F2 can hide a weak retriever_
_masked by an aggressive judge, or vice versa. ruleLessGold recall is the headline number for the corpus-vs-rules question._