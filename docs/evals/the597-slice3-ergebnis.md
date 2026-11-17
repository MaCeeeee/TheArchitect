# THE-597 Slice 3 — Ergebnis: Go/No-Go für Schicht 1

Regel: `docs/evals/the597-slice3-vorregistrierung.md` (freigegeben 17.11.2026, vor der Messung).
Instrument: `claude-haiku-4-5-20251001` · Prompt `tp-4` · k = 5 · Kriterium Recall ≥ 50.0 % und Fehlalarm ≤ 10.0 % · stabil in ≥ 4 von 5 gv3-Läufen · repliziert auf gv2 (nur obligationKind, provisionKind).

## Verdikt — Schicht 1: **NO-GO**

## Kombinationen

| Achse | Schwelle | Recall gepoolt gv3 | Fehlalarm gepoolt gv3 | gepoolt erfüllt | stabil (Läufe) | gv2 repliziert | Prüf-Last | GO |
|---|---|---|---|---|---|---|---|---|
| obligationKind | < 0.8 | 15.1 % (11/73) | 1.4 % (4/277) | nein | 0/5 | nein (3.3 % (1/30) / 0.9 % (1/110)) | 4.3 % (15/350) | **nein** |
| obligationKind | < 1.0 | 30.1 % (22/73) | 3.6 % (10/277) | nein | 0/5 | nein (16.7 % (5/30) / 1.8 % (2/110)) | 9.1 % (32/350) | **nein** |
| partyRole | < 0.8 | 12.6 % (13/103) | 4.5 % (11/247) | nein | 0/5 | entfällt | 6.9 % (24/350) | **nein** |
| partyRole | < 1.0 | 29.1 % (30/103) | 8.1 % (20/247) | nein | 1/5 | entfällt | 14.3 % (50/350) | **nein** |
| provisionKind | < 0.8 | 17.5 % (14/80) | 2.2 % (6/270) | nein | 0/5 | nein (13.3 % (4/30) / 4.5 % (5/110)) | 5.7 % (20/350) | **nein** |
| provisionKind | < 1.0 | 38.8 % (31/80) | 5.6 % (15/270) | nein | 0/5 | nein (30.0 % (9/30) / 9.1 % (10/110)) | 13.1 % (46/350) | **nein** |

Prüf-Last = Anteil aller gv3-Samples, die ein Mensch sehen müsste. Sie wird berichtet und entscheidet nicht (stand nicht im Kriterium vom 20.09.2026).

## Einzelläufe gv3 (Recall / Fehlalarm)

| Achse | Schwelle | gv3-run1 | gv3-run2 | gv3-run3 | gv3-run4 | gv3-run5 |
|---|---|---|---|---|---|---|
| obligationKind | < 0.8 | 29.4 % (5/17) / 1.9 % (1/53) | 11.8 % (2/17) / 1.9 % (1/53) | 15.4 % (2/13) / 0.0 % (0/57) | 15.4 % (2/13) / 3.5 % (2/57) | 0.0 % (0/13) / 0.0 % (0/57) |
| obligationKind | < 1.0 | 35.3 % (6/17) / 1.9 % (1/53) | 35.3 % (6/17) / 3.8 % (2/53) | 23.1 % (3/13) / 3.5 % (2/57) | 30.8 % (4/13) / 3.5 % (2/57) | 23.1 % (3/13) / 5.3 % (3/57) |
| partyRole | < 0.8 | 23.5 % (4/17) / 13.2 % (7/53) | 23.8 % (5/21) / 2.0 % (1/49) | 9.1 % (2/22) / 0.0 % (0/48) | 9.1 % (2/22) / 2.1 % (1/48) | 0.0 % (0/21) / 4.1 % (2/49) |
| partyRole | < 1.0 | 35.3 % (6/17) / 15.1 % (8/53) | 52.4 % (11/21) / 6.1 % (3/49) ✓ | 27.3 % (6/22) / 4.2 % (2/48) | 9.1 % (2/22) / 8.3 % (4/48) | 23.8 % (5/21) / 6.1 % (3/49) |
| provisionKind | < 0.8 | 33.3 % (5/15) / 3.6 % (2/55) | 12.5 % (2/16) / 5.6 % (3/54) | 17.6 % (3/17) / 0.0 % (0/53) | 18.8 % (3/16) / 1.9 % (1/54) | 6.3 % (1/16) / 0.0 % (0/54) |
| provisionKind | < 1.0 | 40.0 % (6/15) / 7.3 % (4/55) | 37.5 % (6/16) / 9.3 % (5/54) | 47.1 % (8/17) / 1.9 % (1/53) | 31.3 % (5/16) / 1.9 % (1/54) | 37.5 % (6/16) / 7.4 % (4/54) |

## Bekannte Fehlerklassen (beschreibend, gepoolt über gv3 — entscheidet nicht)

Gezählt wird die Gold-Seite: Fälle mit dieser Gold-Klasse, die falsch klassifiziert wurden (bei F-07 war im Register die Precision das Problem; diese Seite sieht die Tabelle nicht).

| ID | Achse | Gold-Klasse | Gold | falsch | davon < 0,8 | davon < 1,0 |
|---|---|---|---|---|---|---|
| F-04 | obligationKind | prohibition | 15 | 7 | 1 | 4 |
| F-05 | partyRole | supervisory_authority | 70 | 47 | 3 | 9 |
| F-06 | provisionKind | procedural | 70 | 50 | 8 | 17 |
| F-07 | partyRole | member_state | 30 | 5 | 0 | 0 |

## Offen geblieben (alle k Aufrufe ohne Wert, wie in Slice 1 übersprungen)

| Lauf | obligationKind | partyRole | provisionKind |
|---|---|---|---|
| gv3-run1 | 0 | 0 | 0 |
| gv3-run2 | 0 | 0 | 0 |
| gv3-run3 | 0 | 0 | 0 |
| gv3-run4 | 0 | 0 | 0 |
| gv3-run5 | 0 | 0 | 0 |
| gv2-run1 | 0 | 0 | 0 |
| gv2-run2 | 0 | 0 | 0 |

## Inputs (SHA-256 der Lauf-Dateien)

| Lauf | Golden | SHA-256 |
|---|---|---|
| gv3-run1 | gv3 | `b31f401748034dfe7ae2ecf46839ba674c12918c07647fa2800945bb6b3eec66` |
| gv3-run2 | gv3 | `3f72f11544f535281af4153b3886f66fb28dd4667a0c25ab8e0165a4a67263bb` |
| gv3-run3 | gv3 | `e13aacbbac066e1aeb0da972b49eab7ae503225216f484e3b614ddf2605cbdc8` |
| gv3-run4 | gv3 | `472177033ea25a3fe5966297730bbc78d1d4b6ad5681372241cbaa4b3e45aff5` |
| gv3-run5 | gv3 | `976768155b78df656f0ef92aff80a88b56f3a25d9d98abe8fcb21a559bd82d43` |
| gv2-run1 | gv2 | `7f6b8b01f7d4f500b95af1687f16167a9f860176834b2afd127ebc1ca72d35d8` |
| gv2-run2 | gv2 | `b227cd275cba3fcfc62858a99ee6f2c44bbcace331ca25779b9ae015aee8e728` |

