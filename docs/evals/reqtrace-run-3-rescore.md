# Nachrechnung des Gold-Abgleichs (THE-545)

Quelle: `../../docs/evals/reqtrace-run-3.json` — Gruppierung, Paarurteile und Verdrängung **unverändert übernommen**.
Neu gerechnet ist ausschließlich die Klassifikation der gespeicherten Anforderungstexte
und der daraus folgende Abgleich gegen das adressaten-korrigierte Gold.

## Ergebnis

| SCF | akzeptierte Gesetzes-Mengen | wiedergefunden durch |
| --- | --- | --- |
| BCD-01 | dsgvo + nis2 | pair__dsgvo:art32:c04:q1s1__nis2:art21:c07:q1s1 |
| CRY-01 | dsgvo + nis2 | measure__dsgvo:art32:c03:q1s2 |
| GOV-02 | dora + dsgvo *oder* dsgvo + nis2 | measure__dora:art19:c11:q1s1 |
| HRS-03 | dora + dsgvo | — |
| RSK-01 | dora + dsgvo *oder* dsgvo + nis2 | measure__dora:art9:c13:q3s2 |

**4 von 5** (Schwelle 3). Vorher, mit dem adressaten-blinden Gold: 2.

Keine Maßnahme trifft mehrere Gold-Einträge.

Semantische Negativ-Kontrolle auf der neuen Klassifikation: ❌

## Die gerissene Kontrolle — nachgetragene Analyse

Die Nachrechnung hebt die Positiv-Kontrolle auf 4/5 **und reißt gleichzeitig eine
Kontrolle, die in Lauf 3 bestanden war.** Beides hat dieselbe Ursache: die
Klassifikation ist ein zweiter Durchgang und weicht von der des Laufs ab. Damit
ist dieses Blatt **kein gültiges Verdikt** — die beiden Zahlen stammen nicht aus
demselben Durchgang.

Betroffen sind **2 von 31** Maßnahmen, beide an derselben Bruchstelle:

| Maßnahme | Anforderung | Handlung (2. Durchgang) |
| --- | --- | --- |
| `measure__dsgvo:art33:c04:q1s3` | Dokumentation einer Datenschutzverletzung erstellen | `vorfall-erkennen-behandeln` |
| | Kategorien in der Vorfalls-Dokumentation erfassen | `vorfall-melden-behoerde` |
| `measure__dsgvo:art33:c07:q2s1` | Maßnahmen zur Abmilderung ergreifen | `vorfall-melden-behoerde` |
| | CSIRT/Behörde um Orientierung ersuchen | `vorfall-erkennen-behandeln` |

In beiden Fällen sind die gepaarten Anforderungen inhaltlich benachbart — es ist
**die Zuordnung, die zwischen zwei angrenzenden Etiketten schwankt**, nicht die
Kette, die Fremdes zusammenzieht. In Lauf 3 erhielten beide Mitglieder dasselbe
Etikett und die Kontrolle bestand.

Das ist ein Befund über das **Messinstrument**, nicht über die Kette: die
semantische Negativ-Kontrolle setzt einen stabilen Maßstab voraus, und an der
Grenze *Vorfall behandeln ↔ Vorfall melden* ist er es nicht.

**Er wird hier festgehalten, nicht verwertet.** Ihn als „bloßes Artefakt"
abzubuchen, nachdem das Ergebnis bekannt ist, wäre genau die Nachbesserung, die
dieses Ticket ausschließen soll. Das Verdikt braucht einen Lauf, in dem Positiv-
und Negativ-Kontrolle aus **einem** Klassifikations-Durchgang stammen.

## Grenzen dieser Nachrechnung

- **Zweiter Klassifikations-Durchgang.** 288 von 289 Texten erhielten eine Handlung; 1 blieben ohne. Im Lauf selbst gab es dafür einen Rückfall auf die erste extrahierte Handlung, den es hier nicht gibt — diese Fälle können den Abgleich nur senken, nie heben.
- **Kein neuer Beleg für die Kette.** Widerspricht diese Zahl dem Lauf, ist der Lauf die Referenz, nicht die Nachrechnung.
- Ein negatives Ergebnis bleibt ein **gültiges Ergebnis**.
