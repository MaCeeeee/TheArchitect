# Typing-Eval Report

- Golden: `typing.gv2.json` · Cases: **70** · Modell: `claude-haiku-4-5-20251001`
- ⚠ Leakage-Caveat: wurde das Golden LLM-vorgelabelt, labelt dieselbe Modell-Klasse, die hier getestet wird.

## Beobachtungskanal (partyRoleObserved)

- Beobachtungen gesamt: **2** von 70 Fällen
- davon wo das Gold KEINE Rolle kennt (gewollt): **2**
- davon wo das Gold eine Rolle kennt (Rauschen): **0**
- ⚠️ k=5: Beobachtung nur gezählt, wenn sie in der strikten Mehrheit der Läufe fiel — nicht vergleichbar mit einem k=1-Report.

## normKind

> ⚠️ **Akt-Metadatum (THE-691)** — ererbt vom Rechtsakt, zählt nicht als Klassifikator-Leistung.

Accuracy: **100.0%** (70/70) · macro-F1: **1.000** · ECE: 0.009

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: de | 37/37 | 100.0% |
| lang: en | 33/33 | 100.0% |
| source: dora-de | 4/4 | 100.0% |
| source: data-act-de | 4/4 | 100.0% |
| source: dora | 4/4 | 100.0% |
| source: nis2-de | 4/4 | 100.0% |
| source: psd2-de | 4/4 | 100.0% |
| source: mdr-en | 4/4 | 100.0% |
| source: cra-en | 4/4 | 100.0% |
| source: eprivacy-en | 3/3 | 100.0% |
| source: dsgvo-en | 3/3 | 100.0% |
| source: dsgvo | 3/3 | 100.0% |
| source: eprivacy-de | 3/3 | 100.0% |
| source: cra-de | 3/3 | 100.0% |
| source: mdr-de | 3/3 | 100.0% |
| source: lksg | 3/3 | 100.0% |
| source: ai-act-de | 3/3 | 100.0% |
| source: eidas-en | 3/3 | 100.0% |
| source: nis2 | 3/3 | 100.0% |
| source: ai-act-en | 3/3 | 100.0% |
| source: eidas-de | 3/3 | 100.0% |
| source: data-act-en | 3/3 | 100.0% |
| source: psd2-en | 3/3 | 100.0% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| legislation | 1.00 | 1.00 | 1.00 | 70 |

## bindingness

> ⚠️ **Akt-Metadatum (THE-691)** — ererbt vom Rechtsakt, zählt nicht als Klassifikator-Leistung.

Accuracy: **100.0%** (70/70) · macro-F1: **1.000** · ECE: 0.000

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: de | 37/37 | 100.0% |
| lang: en | 33/33 | 100.0% |
| source: dora-de | 4/4 | 100.0% |
| source: data-act-de | 4/4 | 100.0% |
| source: dora | 4/4 | 100.0% |
| source: nis2-de | 4/4 | 100.0% |
| source: psd2-de | 4/4 | 100.0% |
| source: mdr-en | 4/4 | 100.0% |
| source: cra-en | 4/4 | 100.0% |
| source: eprivacy-en | 3/3 | 100.0% |
| source: dsgvo-en | 3/3 | 100.0% |
| source: dsgvo | 3/3 | 100.0% |
| source: eprivacy-de | 3/3 | 100.0% |
| source: cra-de | 3/3 | 100.0% |
| source: mdr-de | 3/3 | 100.0% |
| source: lksg | 3/3 | 100.0% |
| source: ai-act-de | 3/3 | 100.0% |
| source: eidas-en | 3/3 | 100.0% |
| source: nis2 | 3/3 | 100.0% |
| source: ai-act-en | 3/3 | 100.0% |
| source: eidas-de | 3/3 | 100.0% |
| source: data-act-en | 3/3 | 100.0% |
| source: psd2-en | 3/3 | 100.0% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| binding | 1.00 | 1.00 | 1.00 | 70 |

## obligationKind

Accuracy: **78.6%** (55/70) · macro-F1: **0.591** · ECE: 0.203

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: de | 32/37 | 86.5% |
| lang: en | 23/33 | 69.7% |
| source: dora-de | 4/4 | 100.0% |
| source: data-act-de | 3/4 | 75.0% |
| source: dora | 3/4 | 75.0% |
| source: nis2-de | 4/4 | 100.0% |
| source: psd2-de | 3/4 | 75.0% |
| source: mdr-en | 2/4 | 50.0% |
| source: cra-en | 2/4 | 50.0% |
| source: eprivacy-en | 2/3 | 66.7% |
| source: dsgvo-en | 3/3 | 100.0% |
| source: dsgvo | 2/3 | 66.7% |
| source: eprivacy-de | 3/3 | 100.0% |
| source: cra-de | 3/3 | 100.0% |
| source: mdr-de | 2/3 | 66.7% |
| source: lksg | 2/3 | 66.7% |
| source: ai-act-de | 3/3 | 100.0% |
| source: eidas-en | 1/3 | 33.3% |
| source: nis2 | 3/3 | 100.0% |
| source: ai-act-en | 2/3 | 66.7% |
| source: eidas-de | 3/3 | 100.0% |
| source: data-act-en | 3/3 | 100.0% |
| source: psd2-en | 2/3 | 66.7% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| __na__ | 0.92 | 0.57 | 0.71 | 21 |
| obligation | 0.75 | 1.00 | 0.86 | 33 |
| permission | 0.83 | 0.77 | 0.80 | 13 |
| prohibition | 0.00 | 0.00 | 0.00 | 3 |

## partyRole

Accuracy: **70.0%** (49/70) · macro-F1: **0.694** · ECE: 0.291

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: de | 27/37 | 73.0% |
| lang: en | 22/33 | 66.7% |
| source: dora-de | 4/4 | 100.0% |
| source: data-act-de | 1/4 | 25.0% |
| source: dora | 3/4 | 75.0% |
| source: nis2-de | 2/4 | 50.0% |
| source: psd2-de | 1/4 | 25.0% |
| source: mdr-en | 3/4 | 75.0% |
| source: cra-en | 2/4 | 50.0% |
| source: eprivacy-en | 0/3 | 0.0% |
| source: dsgvo-en | 3/3 | 100.0% |
| source: dsgvo | 3/3 | 100.0% |
| source: eprivacy-de | 3/3 | 100.0% |
| source: cra-de | 3/3 | 100.0% |
| source: mdr-de | 3/3 | 100.0% |
| source: lksg | 3/3 | 100.0% |
| source: ai-act-de | 2/3 | 66.7% |
| source: eidas-en | 3/3 | 100.0% |
| source: nis2 | 3/3 | 100.0% |
| source: ai-act-en | 1/3 | 33.3% |
| source: eidas-de | 2/3 | 66.7% |
| source: data-act-en | 1/3 | 33.3% |
| source: psd2-en | 3/3 | 100.0% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| __na__ | 0.83 | 0.65 | 0.73 | 23 |
| authorized_representative | 0.00 | 0.00 | 0.00 | 1 |
| controller | 1.00 | 1.00 | 1.00 | 2 |
| deployer | 1.00 | 1.00 | 1.00 | 1 |
| essential_important_entity | 0.00 | 0.00 | 0.00 | 1 |
| financial_entity | 0.80 | 0.80 | 0.80 | 5 |
| importer | 1.00 | 1.00 | 1.00 | 1 |
| manufacturer | 0.80 | 1.00 | 0.89 | 4 |
| member_state | 0.53 | 0.90 | 0.67 | 10 |
| obligated_enterprise | 1.00 | 1.00 | 1.00 | 1 |
| provider | 0.67 | 0.33 | 0.44 | 6 |
| supervisory_authority | 1.00 | 0.67 | 0.80 | 15 |

## provisionKind

Accuracy: **78.6%** (55/70) · macro-F1: **0.816** · ECE: 0.189

| Breakdown | correct/labeled | accuracy |
| --- | --- | --- |
| lang: de | 28/37 | 75.7% |
| lang: en | 27/33 | 81.8% |
| source: dora-de | 2/4 | 50.0% |
| source: data-act-de | 3/4 | 75.0% |
| source: dora | 2/4 | 50.0% |
| source: nis2-de | 4/4 | 100.0% |
| source: psd2-de | 3/4 | 75.0% |
| source: mdr-en | 4/4 | 100.0% |
| source: cra-en | 3/4 | 75.0% |
| source: eprivacy-en | 3/3 | 100.0% |
| source: dsgvo-en | 3/3 | 100.0% |
| source: dsgvo | 1/3 | 33.3% |
| source: eprivacy-de | 3/3 | 100.0% |
| source: cra-de | 2/3 | 66.7% |
| source: mdr-de | 2/3 | 66.7% |
| source: lksg | 3/3 | 100.0% |
| source: ai-act-de | 3/3 | 100.0% |
| source: eidas-en | 2/3 | 66.7% |
| source: nis2 | 3/3 | 100.0% |
| source: ai-act-en | 2/3 | 66.7% |
| source: eidas-de | 2/3 | 66.7% |
| source: data-act-en | 3/3 | 100.0% |
| source: psd2-en | 2/3 | 66.7% |

| Klasse | P | R | F1 | support |
| --- | --- | --- | --- | --- |
| definition | 1.00 | 1.00 | 1.00 | 1 |
| enforcement-supervision | 1.00 | 0.90 | 0.95 | 10 |
| obligation | 0.68 | 1.00 | 0.81 | 25 |
| other | 0.60 | 0.60 | 0.60 | 5 |
| procedural | 0.90 | 0.45 | 0.60 | 20 |
| scope-applicability | 1.00 | 0.89 | 0.94 | 9 |


## THE-683 — Experiment-Anhang (tp-4)

OOV-Drops je Achse (AC-4, je Lauf, k=5): keine

Trivial-Messlatte (AC-5 — „immer häufigste Klasse"):

| Achse | Klasse | Accuracy |
|---|---|---|
| normKind | legislation | 100.0% |
| bindingness | binding | 100.0% |
| obligationKind | obligation | 47.1% |
| partyRole | na | 32.9% |
| provisionKind | obligation | 35.7% |

## THE-597 — Schicht 1 retrospektiv (Self-Consistency k=5)

Konfidenz = Stimmenanteil der Mehrheit über k Läufe. Routing: confidence < Schwelle ⇒ Mensch.
Recall = geroutete falsche / alle falschen · Fehlalarm = geroutete richtige / alle richtigen.
Instrument-Kontrolle: AUROC > 0,6 auf mindestens einer Inhalts-Achse, sonst „nicht messbar".
Golden-Hash: `39e09d58d20391ee89a95b687157862286f13f12219ce98f9dd0ddb5b1a006a3`

| Achse | Samples | falsche | AUROC | Recall <0.6 | Recall <0.8 | Recall <1.0 | Fehlalarm <0.6 | Fehlalarm <0.8 | Fehlalarm <1.0 |
|---|---|---|---|---|---|---|---|---|---|
| normKind ⚠️ | 70 | 0 | — | — | — | — | 0.0% | 1.4% | 2.9% |
| bindingness ⚠️ | 70 | 0 | — | — | — | — | 0.0% | 0.0% | 0.0% |
| obligationKind | 70 | 15 | 0.591 | 0.0% | 0.0% | 20.0% | 0.0% | 0.0% | 1.8% |
| partyRole | 70 | 21 | 0.573 | 0.0% | 0.0% | 19.0% | 0.0% | 2.0% | 4.1% |
| provisionKind | 70 | 15 | 0.607 | 0.0% | 6.7% | 33.3% | 0.0% | 5.5% | 10.9% |

_⚠️ = Akt-Metadatum (THE-691), zählt nicht als Klassifikator-Leistung._
