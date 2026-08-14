# THE-683 — Typing-Experiment: Hilft der Zweck der Maschine?

**Gefahren am 2026-08-14** · Golden `typing.gv3` (frozen, 70 Fälle) · Modell `claude-haiku-4-5-20251001` ·
Kontext `purpose-context.v1.json` (eingefroren: 24 Fassungen, je die drei niedrigsten Erwägungsgründe) ·
6 Läufe (3× Baseline `tp-4`, 3× Zweck-Arm `tp-4+purpose.v1`) — nur der Prompt wanderte.

## Das Urteil zuerst

> **Die Hypothese ist widerlegt — und zwar invertiert.** Der gesetzesweite Zweck-Kontext macht die
> Adressaten-Einordnung nicht besser, sondern um **−8,6 Punkte schlechter** (74,8 % → 66,2 %).
> Die Schwelle verlangte **≥ +5**. Konsequenz (Kill-Kriterium aus THE-679): **kein Prompt-Einbau** —
> die Erwägungsgründe bleiben Kontext für Mensch und Landkarte, nicht für den Klassifikator.

## Alle Achsen, alle Läufe

| Achse | Baseline (3 Läufe) | ⌀ | Zweck-Arm (3 Läufe) | ⌀ | Δ |
|---|---|---|---|---|---|
| normKind | 100,0 / 98,6 / 100,0 | 99,5 % | 100,0 / 100,0 / 100,0 | 100,0 % | +0,5 |
| bindingness | 100,0 / 100,0 / 100,0 | 100,0 % | 100,0 / 100,0 / 100,0 | 100,0 % | ±0 |
| obligationKind | 75,7 / 75,7 / 77,1 | 76,2 % | 77,1 / 78,6 / 75,7 | 77,1 % | +1,0 |
| **partyRole** | 75,7 / 74,3 / 74,3 | **74,8 %** | 64,3 / 62,9 / 71,4 | **66,2 %** | **−8,6** |
| provisionKind | 77,1 / 78,6 / 78,6 | 78,1 % | 80,0 / 81,4 / 78,6 | 80,0 % | +1,9 |

macro-F1: partyRole 0,808 → 0,736 (−0,073) · provisionKind 0,661 → 0,605 (−0,055) ·
obligationKind 0,550 → 0,617 (+0,067). Alles außer partyRole im bekannten Rauschband kleiner Klassen.

## Die Kausal-Isolation — der Kern des Belegs

Die 12 Fälle ohne Zweck-Kontext (eprivacy, lksg) liefen im Zweck-Arm **prompt-identisch** zur
Baseline. Sie messen das Lauf-Rauschen; die 58 Fälle mit Kontext messen den Effekt:

| partyRole | Baseline ⌀ | Zweck-Arm ⌀ | Δ |
|---|---|---|---|
| ohne-Zweck-Quellen (n = 12, Prompt identisch) | 72,2 % | 69,4 % | −2,8 (Rauschen) |
| **mit-Zweck-Quellen (n = 58, Prompt + Kontext)** | **75,3 %** | **65,5 %** | **−9,8** |

Alle drei Zweck-Läufe im mit-Kontext-Subset (63,8 / 62,1 / 70,7) liegen unter **jedem** der drei
Baseline-Läufe (77,6 / 74,1 / 74,1). Der Schaden sitzt exakt dort, wo der Kontext eingespeist wurde.

## Deutung

Die ersten Erwägungsgründe eines Gesetzes nennen dessen **prominente Hauptadressaten** (Anbieter,
Hersteller, Mitgliedstaaten). Genau dorthin zieht der Kontext das Modell — weg vom Adressaten des
konkreten Artikels. **Der Zweck ankert.** Es ist dieselbe Verzerrung, gegen die der
Adjudikationsbogen den Menschen schützt (AC-2 in THE-682: kein geratener Zweck neben dem Urteil) —
am Modell experimentell bestätigt, mit −9,8 Punkten Preisschild.

Die OntoLearner-Sorge (AC-4) betraf die Ausgabe-Disziplin: **OOV-Drops = 0 in allen sechs Läufen**,
das Format hielt. Das Problem ist nicht Form, sondern Aufmerksamkeit.

## Trivial-Messlatte (AC-5)

| Achse | „immer häufigste Klasse" | Baseline ⌀ | echte Leistung |
|---|---|---|---|
| normKind | legislation → 100 % | 99,5 % | ±0 — die Achse prüft am Golden nichts |
| bindingness | binding → 100 % | 100,0 % | ±0 — dito (bekannter Befund vom 13.08.) |
| obligationKind | obligation → 61,4 % | 76,2 % | **+14,8** |
| partyRole | na → 21,4 % | 74,8 % | **+53,4** |
| provisionKind | obligation → 47,1 % | 78,1 % | **+31,0** |

## Ehrliche Ränder

- **Kosten:** Token-Zählung ist im Runner nicht instrumentiert; Schätzung auf Basis des
  Korpus-Batches ≈ 1,5–2 € für alle sechs Läufe.
- Der Zweck-Arm testete **Option b** (gesetzesweiter Kontext). Der wörtliche Artikel-Zitat-Join
  wurde nicht getestet — bei 4 % Zitat-Quote wäre das Subset leer gewesen (AC-6-Umstellung vom 14.08.).
- eprivacy fehlt im eingefrorenen Kontext (Quellen-Drossel beim Nachzug); die Fälle liefen im
  Rausch-Subset und stützen die Isolation.

## Konsequenz

1. **Kein Prompt-Einbau.** `tp-4` bleibt der Produktionsstand; der Schalter bleibt Experiment-Werkzeug.
2. Die Erwägungsgründe behalten ihren gemessenen Wert dort, wo ein **Mensch** liest:
   Adjudikationsbogen (32/35 Fälle mit Kontext) und künftige Zweck-Ebene der Landkarte.
3. Für die Ontologie-Arbeit gilt weiter der Beobachtungskanal — nicht der Zweck-Kontext.
