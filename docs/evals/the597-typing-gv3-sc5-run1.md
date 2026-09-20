# Typing-Eval Report

- Golden: `typing.gv3.json` · Cases: **70** · Modell: `claude-haiku-4-5-20251001`
- ⚠ Leakage-Caveat: wurde das Golden LLM-vorgelabelt, labelt dieselbe Modell-Klasse, die hier getestet wird.

## Beobachtungskanal (partyRoleObserved)

- Beobachtungen gesamt: **2** von 70 Fällen
- davon wo das Gold KEINE Rolle kennt (gewollt): **2**
- davon wo das Gold eine Rolle kennt (Rauschen): **0**

## normKind

> ⚠️ **Akt-Metadatum (THE-691)** — ererbt vom Rechtsakt, zählt nicht als Klassifikator-Leistung.

Accuracy: **100.0%** (70/70) · macro-F1: **1.000** · ECE: 0.000

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: en | 32/32 | 100.0% |
| lang: de | 38/38 | 100.0% |
| source: ai-act-en | 3/3 | 100.0% |
| source: ai-act-de | 4/4 | 100.0% |
| source: data-act-en | 4/4 | 100.0% |
| source: data-act-de | 5/5 | 100.0% |
| source: cra-de | 4/4 | 100.0% |
| source: mdr-en | 4/4 | 100.0% |
| source: mdr-de | 4/4 | 100.0% |
| source: eprivacy-en | 5/5 | 100.0% |
| source: eprivacy-de | 5/5 | 100.0% |
| source: eidas-en | 5/5 | 100.0% |
| source: eidas-de | 4/4 | 100.0% |
| source: nis2-de | 3/3 | 100.0% |
| source: dora | 3/3 | 100.0% |
| source: dsgvo | 3/3 | 100.0% |
| source: psd2-de | 2/2 | 100.0% |
| source: dsgvo-en | 2/2 | 100.0% |
| source: psd2-en | 2/2 | 100.0% |
| source: dora-de | 2/2 | 100.0% |
| source: lksg | 2/2 | 100.0% |
| source: cra-en | 2/2 | 100.0% |
| source: nis2 | 2/2 | 100.0% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| legislation | 1.00 | 1.00 | 1.00 | 70 |

## bindingness

> ⚠️ **Akt-Metadatum (THE-691)** — ererbt vom Rechtsakt, zählt nicht als Klassifikator-Leistung.

Accuracy: **100.0%** (70/70) · macro-F1: **1.000** · ECE: 0.000

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: en | 32/32 | 100.0% |
| lang: de | 38/38 | 100.0% |
| source: ai-act-en | 3/3 | 100.0% |
| source: ai-act-de | 4/4 | 100.0% |
| source: data-act-en | 4/4 | 100.0% |
| source: data-act-de | 5/5 | 100.0% |
| source: cra-de | 4/4 | 100.0% |
| source: mdr-en | 4/4 | 100.0% |
| source: mdr-de | 4/4 | 100.0% |
| source: eprivacy-en | 5/5 | 100.0% |
| source: eprivacy-de | 5/5 | 100.0% |
| source: eidas-en | 5/5 | 100.0% |
| source: eidas-de | 4/4 | 100.0% |
| source: nis2-de | 3/3 | 100.0% |
| source: dora | 3/3 | 100.0% |
| source: dsgvo | 3/3 | 100.0% |
| source: psd2-de | 2/2 | 100.0% |
| source: dsgvo-en | 2/2 | 100.0% |
| source: psd2-en | 2/2 | 100.0% |
| source: dora-de | 2/2 | 100.0% |
| source: lksg | 2/2 | 100.0% |
| source: cra-en | 2/2 | 100.0% |
| source: nis2 | 2/2 | 100.0% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| binding | 1.00 | 1.00 | 1.00 | 70 |

## obligationKind

Accuracy: **75.7%** (53/70) · macro-F1: **0.549** · ECE: 0.203

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: en | 22/32 | 68.8% |
| lang: de | 31/38 | 81.6% |
| source: ai-act-en | 3/3 | 100.0% |
| source: ai-act-de | 2/4 | 50.0% |
| source: data-act-en | 2/4 | 50.0% |
| source: data-act-de | 4/5 | 80.0% |
| source: cra-de | 3/4 | 75.0% |
| source: mdr-en | 2/4 | 50.0% |
| source: mdr-de | 4/4 | 100.0% |
| source: eprivacy-en | 4/5 | 80.0% |
| source: eprivacy-de | 5/5 | 100.0% |
| source: eidas-en | 2/5 | 40.0% |
| source: eidas-de | 4/4 | 100.0% |
| source: nis2-de | 2/3 | 66.7% |
| source: dora | 2/3 | 66.7% |
| source: dsgvo | 3/3 | 100.0% |
| source: psd2-de | 0/2 | 0.0% |
| source: dsgvo-en | 2/2 | 100.0% |
| source: psd2-en | 2/2 | 100.0% |
| source: dora-de | 2/2 | 100.0% |
| source: lksg | 2/2 | 100.0% |
| source: cra-en | 2/2 | 100.0% |
| source: nis2 | 1/2 | 50.0% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| __na__ | 1.00 | 0.38 | 0.55 | 16 |
| obligation | 0.81 | 1.00 | 0.90 | 43 |
| permission | 0.33 | 0.38 | 0.35 | 8 |
| prohibition | 0.50 | 0.33 | 0.40 | 3 |

## partyRole

Accuracy: **75.7%** (53/70) · macro-F1: **0.804** · ECE: 0.200

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: en | 23/32 | 71.9% |
| lang: de | 30/38 | 78.9% |
| source: ai-act-en | 2/3 | 66.7% |
| source: ai-act-de | 3/4 | 75.0% |
| source: data-act-en | 4/4 | 100.0% |
| source: data-act-de | 4/5 | 80.0% |
| source: cra-de | 4/4 | 100.0% |
| source: mdr-en | 2/4 | 50.0% |
| source: mdr-de | 1/4 | 25.0% |
| source: eprivacy-en | 4/5 | 80.0% |
| source: eprivacy-de | 3/5 | 60.0% |
| source: eidas-en | 3/5 | 60.0% |
| source: eidas-de | 4/4 | 100.0% |
| source: nis2-de | 3/3 | 100.0% |
| source: dora | 3/3 | 100.0% |
| source: dsgvo | 3/3 | 100.0% |
| source: psd2-de | 1/2 | 50.0% |
| source: dsgvo-en | 2/2 | 100.0% |
| source: psd2-en | 1/2 | 50.0% |
| source: dora-de | 2/2 | 100.0% |
| source: lksg | 2/2 | 100.0% |
| source: cra-en | 2/2 | 100.0% |
| source: nis2 | 0/2 | 0.0% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| __na__ | 1.00 | 0.80 | 0.89 | 15 |
| conformity_assessment_body | 0.40 | 1.00 | 0.57 | 4 |
| controller | 1.00 | 1.00 | 1.00 | 1 |
| data_holder | 0.80 | 1.00 | 0.89 | 4 |
| ecs_provider | 0.80 | 0.57 | 0.67 | 7 |
| financial_entity | 1.00 | 1.00 | 1.00 | 4 |
| manufacturer | 0.67 | 0.67 | 0.67 | 3 |
| member_state | 0.50 | 0.83 | 0.63 | 6 |
| obligated_enterprise | 1.00 | 1.00 | 1.00 | 2 |
| provider | 0.86 | 1.00 | 0.92 | 6 |
| supervisory_authority | 1.00 | 0.36 | 0.53 | 14 |
| trust_service_provider | 0.80 | 1.00 | 0.89 | 4 |

## provisionKind

Accuracy: **78.6%** (55/70) · macro-F1: **0.609** · ECE: 0.166

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: en | 21/32 | 65.6% |
| lang: de | 34/38 | 89.5% |
| source: ai-act-en | 2/3 | 66.7% |
| source: ai-act-de | 4/4 | 100.0% |
| source: data-act-en | 3/4 | 75.0% |
| source: data-act-de | 5/5 | 100.0% |
| source: cra-de | 4/4 | 100.0% |
| source: mdr-en | 3/4 | 75.0% |
| source: mdr-de | 3/4 | 75.0% |
| source: eprivacy-en | 5/5 | 100.0% |
| source: eprivacy-de | 5/5 | 100.0% |
| source: eidas-en | 2/5 | 40.0% |
| source: eidas-de | 3/4 | 75.0% |
| source: nis2-de | 2/3 | 66.7% |
| source: dora | 3/3 | 100.0% |
| source: dsgvo | 2/3 | 66.7% |
| source: psd2-de | 2/2 | 100.0% |
| source: dsgvo-en | 0/2 | 0.0% |
| source: psd2-en | 1/2 | 50.0% |
| source: dora-de | 2/2 | 100.0% |
| source: lksg | 2/2 | 100.0% |
| source: cra-en | 1/2 | 50.0% |
| source: nis2 | 1/2 | 50.0% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| definition | 0.00 | 0.00 | 0.00 | 1 |
| enforcement-supervision | 0.80 | 0.80 | 0.80 | 10 |
| obligation | 0.78 | 0.97 | 0.86 | 33 |
| other | 1.00 | 0.40 | 0.57 | 5 |
| procedural | 0.75 | 0.43 | 0.55 | 14 |
| scope-applicability | 0.78 | 1.00 | 0.88 | 7 |


## THE-683 — Experiment-Anhang (tp-4)

OOV-Drops je Achse (AC-4, je Lauf, k=5): partyRole=2

Trivial-Messlatte (AC-5 — „immer häufigste Klasse"):

| Achse | Klasse | Accuracy |
|---|---|---|
| normKind | legislation | 100.0% |
| bindingness | binding | 100.0% |
| obligationKind | obligation | 61.4% |
| partyRole | na | 21.4% |
| provisionKind | obligation | 47.1% |

## THE-597 — Schicht 1 retrospektiv (Self-Consistency k=5)

Konfidenz = Stimmenanteil der Mehrheit über k Läufe. Routing: confidence < Schwelle ⇒ Mensch.
Recall = geroutete falsche / alle falschen · Fehlalarm = geroutete richtige / alle richtigen.
Instrument-Kontrolle: AUROC > 0,6 auf mindestens einer Inhalts-Achse, sonst „nicht messbar".
Golden-Hash: `af57f9f52f7fcae330562b271a957cc585a0071d8aadced9d83aa68f33091b11`

| Achse | Samples | falsche | AUROC | Recall <0.6 | Recall <0.8 | Recall <1.0 | Fehlalarm <0.6 | Fehlalarm <0.8 | Fehlalarm <1.0 |
|---|---|---|---|---|---|---|---|---|---|
| normKind ⚠️ | 70 | 0 | — | — | — | — | 0.0% | 0.0% | 0.0% |
| bindingness ⚠️ | 70 | 0 | — | — | — | — | 0.0% | 0.0% | 0.0% |
| obligationKind | 70 | 17 | 0.667 | 5.9% | 29.4% | 35.3% | 0.0% | 1.9% | 1.9% |
| partyRole | 70 | 17 | 0.591 | 0.0% | 23.5% | 35.3% | 3.8% | 13.2% | 15.1% |
| provisionKind | 70 | 15 | 0.668 | 0.0% | 33.3% | 40.0% | 0.0% | 3.6% | 7.3% |

_⚠️ = Akt-Metadatum (THE-691), zählt nicht als Klassifikator-Leistung._
