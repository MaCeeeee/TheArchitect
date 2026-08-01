# RVTM — Slice 1 Handlungs-Katalog (THE-438)

**Plan:** docs/superpowers/plans/2026-08-01-the438-slice1-action-catalog.md
**Prämissen-Entscheidung:** THE-538 (Done, 2026-08-01) — Katalog kanonischer Handlungen als Bezugsgröße, mit Auflage
**Datum:** 2026-08-01 · **Basis:** neuer Branch ab `master`

Status: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert

## REQ-REQHARM-001.0 — Katalog ableiten und einfrieren

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **0.1** | Katalog liegt als **versionierte** Referenzdaten vor; die Katalog-Version ist ableitbar und wird an jedem Ergebnis vermerkt | Task 1, 4 | Unit: `ontologyVersion` ≥ 1.8.0; `classifyObligation` stempelt sie | ⬜ |
| **0.2** | Jeder Eintrag trägt eine `description` — der Klassifikations-Prompt wird daraus gebaut | Task 1 | Unit: Schema erzwingt `min(11)`; Test über alle Einträge | ⬜ |
| **0.3** | Werteraum-Prüfung: erfundene ids werden abgewiesen, nicht durchgereicht | Task 1, 3 | Unit: `CanonicalActionSchema` + `parseActionAssignment('{"id":"erfunden"}') === null` | ⬜ |
| **0.4** | Ableitung ist **wiederholbar**, der Katalog nicht hart kodiert | Task 5 | `npm run actions:derive` erzeugt Vorschlagsdatei; schreibt **nie** direkt in die Ontologie | ⬜ |
| **0.5** | Freie Extraktion **ohne** Vorgabeliste — sonst misst man die Liste statt den Korpus | Task 3 | Unit: `SLOT_SYSTEM` enthält keine Katalog-id | ⬜ |
| **0.6** | Änderung ist nachvollziehbar begründet (CHANGELOG + semver) | Task 1 | Review: Eintrag 1.8.0 mit Messzahlen | ⬜ |

## REQ-REQHARM-001.2 — Pflicht → kanonische Handlung klassifizieren

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **2.1** | Klassifikation gegen den eingefrorenen Katalog, ein Eintrag je Pflicht | Task 4 | Unit: `classifyObligation` liefert `actionId` | ⬜ |
| **2.2** | **„keine passende Handlung" bleibt ein zulässiges Ergebnis** — Hauptfehlermodus ist der erzwungene Treffer | Task 3, 4 | Unit: `NO_ACTION` steht im Prompt; `actionId: null, unparseable: false` | ⬜ |
| **2.3** | Abbildungsquote und „keine"-Quote werden gemessen und ausgewiesen | Task 4, 5 | Unit: `BatchStats`; Skript gibt `total/assigned/none/unparseable` aus | ⬜ |
| **2.4** | Kaputte Antwort ist von bewusstem „keine" unterscheidbar | Task 4 | Unit: `unparseable`-Flag getrennt geführt | ⬜ |
| **2.5** | Read-only: kein Schreibzugriff auf `ComplianceRequirement` | Task 4, 5 | Review: Dienst und Skripte schreiben nur JSON-Dateien | ⬜ |

## REQ-REQHARM-001.2b — Konfidenzstufen aus Mehrhausvotum

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **2b.1** | Stufen A (einstimmig) / B (Mehrheit ≥2/3) / C (sonst); kein Vorschlag ohne Stufe | Task 6, 7 | Unit: `tierFor` über alle vier Konstellationen | ⬜ |
| **2b.2** | Ein ausgefallenes Haus zählt **nicht** als Gegenstimme | Task 6 | Unit: `tierFor([true,true,null]) === 'A'` | ⬜ |
| **2b.3** | **Positiv-Kontrolle ist Vorbedingung** — unter 0,95 ist der Lauf ungültig und Arm T wird nicht berichtet | Task 6, 7 | Unit: `buildActionReport` → `valid:false`, `tRate:null` | ⬜ |
| **2b.4** | Negativ-Kontrolle: 0 Fehlalarme, sonst Lauf ungültig | Task 6 | Unit: ein Fehlalarm kippt `valid` | ⬜ |
| **2b.5** | Beide Kontrollen laufen als **Regressionstest** bei jeder Katalog-Änderung mit | Task 7, 8 | `npm run actions:eval` gegen `actions.v1.json`; Tor-Dokument | ⬜ |
| **2b.6** | Arm T wird gegen die **Decke des Instruments** berichtet, nicht absolut | Task 6 | Unit: `tRateNormalised === tRate / pRate` | ⬜ |
| **2b.7** | Kein Auto-Merge, solange κ < 0,80 | Task 8 | Review: Tor-Dokument; kein Schreibpfad im Slice | ⬜ |

## Messvalidität (die Lehren des 2026-08-01 als Prüfpunkte)

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **MV-1** | **Gesetzesnamen sind im Paar-Richter geblendet** — ungeblendet urteilt das Modell über das Etikett (7/15 gegen 15/15) | Task 3 | Unit: Prompt enthält keinen Gesetzesnamen, auch nicht aus Titel/Fließtext; Harness-Test auf allen erzeugten Prompts | ⬜ |
| **MV-2** | Richter-Rubrik passt zur **schwachen** These (eine Maßnahme, Abweichung als Parameter) | Task 3 | Review: `PAIR_JUDGE_SYSTEM` verneint nur bei verschiedener Tätigkeit, nicht bei verschiedenem Empfänger | ⬜ |
| **MV-3** | Eval- und Produktionspfad benutzen **byteidentische** Prompts | Task 3, 4, 7 | Struktur: ein shared-Modul, kein zweiter Prompt-Ort | ⬜ |
| **MV-4** | Reasoning-Modelle fallen nicht stumm aus (leerer Inhalt bei `finish_reason: length`) | Task 7 | Reuse `raterClient` (Mindestbudget + Leer-Antwort-Retry); Quote verwertbarer Antworten wird ausgewiesen | ⬜ |
| **MV-5** | Kappa meldet **`null`** statt 0 bei konstantem Prüfer (Prävalenz-Paradox) | Task 6 | Unit: `cohensKappa` bei konstanten Eingaben | ⬜ |
| **ADD-1** | Rein additiv: keine Bestands-Suite bricht | Task 1–7 | Beide Paket-Suiten grün ohne Anpassung | ⬜ |

## Menschliche Tore

| Tor | Wo | Entscheid |
|---|---|---|
| 🧑 1 | Task 1 | **Katalog-Adjudikation** — die 26 Einträge (ids, Labels, Granularität) werden übernommen. `actions:derive` liefert nur einen Vorschlag; die Ontologie ändert ein Mensch. |
| 🧑 2 | Task 7 | Prüfsatz `actions.v1.json` einfrieren |
| 🧑 3 | Task 8 | Freigabe der Tore, insbesondere: κ ist für Slice 1 **kein** Ziel |

## Offene Punkte

- **O-1 Katalog-Herkunft:** Die 26 Einträge liegen in `vocab.json` der THE-538-Messung im Scratchpad. **Das Scratchpad wurde in dieser Arbeit schon einmal zwischen zwei Tagen gewipt** — vor Beginn von Task 1 sichern oder aus dem Ticket-Kommentar rekonstruieren.
- **O-2 Korpus-Abhängigkeit:** Belegt ist DSGVO × NIS2 × DORA. Eine auffällig niedrige „keine"-Quote auf einem fremden Korpus ist ein Warnzeichen für erzwungene Treffer, kein Erfolg.
- **O-3 Juristische Adjudikation:** Bewusst nicht in diesem Slice. Vor einem Produktversprechen nötig (Domänengrenzen-Regel), nicht vor dem Bau.
- **O-4 Kosten:** Mehrhaus-Abstimmung nur über Paare innerhalb gesetzesübergreifender Handlungen (Referenz: 350 statt 11 430 Paare, ≈ 1 050 Aufrufe bei drei Häusern). Batch-Job, kein Request-Pfad.
