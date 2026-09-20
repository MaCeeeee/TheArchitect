# Typing-Eval Report

- Golden: `typing.gv3.json` · Cases: **70** · Modell: `claude-haiku-4-5-20251001`
- ⚠ Leakage-Caveat: wurde das Golden LLM-vorgelabelt, labelt dieselbe Modell-Klasse, die hier getestet wird.

## Beobachtungskanal (partyRoleObserved)

- Beobachtungen gesamt: **2** von 70 Fällen
- davon wo das Gold KEINE Rolle kennt (gewollt): **2**
- davon wo das Gold eine Rolle kennt (Rauschen): **0**

## normKind

Accuracy: **100.0%** (70/70) · macro-F1: **1.000**

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

Accuracy: **100.0%** (70/70) · macro-F1: **1.000**

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

Accuracy: **77.1%** (54/70) · macro-F1: **0.564**

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: en | 22/32 | 68.8% |
| lang: de | 32/38 | 84.2% |
| source: ai-act-en | 3/3 | 100.0% |
| source: ai-act-de | 3/4 | 75.0% |
| source: data-act-en | 2/4 | 50.0% |
| source: data-act-de | 4/5 | 80.0% |
| source: cra-de | 4/4 | 100.0% |
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
| source: lksg | 1/2 | 50.0% |
| source: cra-en | 2/2 | 100.0% |
| source: nis2 | 1/2 | 50.0% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| __na__ | 1.00 | 0.44 | 0.61 | 16 |
| obligation | 0.80 | 1.00 | 0.89 | 43 |
| permission | 0.50 | 0.38 | 0.43 | 8 |
| prohibition | 0.33 | 0.33 | 0.33 | 3 |

## partyRole

Accuracy: **74.3%** (52/70) · macro-F1: **0.811**

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: en | 22/32 | 68.8% |
| lang: de | 30/38 | 78.9% |
| source: ai-act-en | 2/3 | 66.7% |
| source: ai-act-de | 3/4 | 75.0% |
| source: data-act-en | 3/4 | 75.0% |
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
| __na__ | 1.00 | 0.73 | 0.85 | 15 |
| conformity_assessment_body | 0.44 | 1.00 | 0.62 | 4 |
| controller | 1.00 | 1.00 | 1.00 | 1 |
| data_holder | 0.80 | 1.00 | 0.89 | 4 |
| ecs_provider | 0.80 | 0.57 | 0.67 | 7 |
| financial_entity | 1.00 | 1.00 | 1.00 | 4 |
| manufacturer | 0.67 | 0.67 | 0.67 | 3 |
| member_state | 0.38 | 0.83 | 0.53 | 6 |
| obligated_enterprise | 1.00 | 1.00 | 1.00 | 2 |
| provider | 1.00 | 1.00 | 1.00 | 6 |
| supervisory_authority | 1.00 | 0.36 | 0.53 | 14 |
| trust_service_provider | 1.00 | 1.00 | 1.00 | 4 |

## provisionKind

Accuracy: **78.6%** (55/70) · macro-F1: **0.632**

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: en | 20/32 | 62.5% |
| lang: de | 35/38 | 92.1% |
| source: ai-act-en | 1/3 | 33.3% |
| source: ai-act-de | 4/4 | 100.0% |
| source: data-act-en | 4/4 | 100.0% |
| source: data-act-de | 5/5 | 100.0% |
| source: cra-de | 4/4 | 100.0% |
| source: mdr-en | 3/4 | 75.0% |
| source: mdr-de | 2/4 | 50.0% |
| source: eprivacy-en | 5/5 | 100.0% |
| source: eprivacy-de | 5/5 | 100.0% |
| source: eidas-en | 2/5 | 40.0% |
| source: eidas-de | 4/4 | 100.0% |
| source: nis2-de | 2/3 | 66.7% |
| source: dora | 2/3 | 66.7% |
| source: dsgvo | 3/3 | 100.0% |
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
| obligation | 0.74 | 0.97 | 0.84 | 33 |
| other | 1.00 | 0.60 | 0.75 | 5 |
| procedural | 1.00 | 0.36 | 0.53 | 14 |
| scope-applicability | 0.78 | 1.00 | 0.88 | 7 |


## THE-683 — Experiment-Anhang (tp-4)

OOV-Drops je Achse (AC-4): keine

Trivial-Messlatte (AC-5 — „immer häufigste Klasse"):

| Achse | Klasse | Accuracy |
|---|---|---|
| normKind | legislation | 100.0% |
| bindingness | binding | 100.0% |
| obligationKind | obligation | 61.4% |
| partyRole | na | 21.4% |
| provisionKind | obligation | 47.1% |
