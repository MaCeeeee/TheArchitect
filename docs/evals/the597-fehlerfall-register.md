# THE-597 — Fehlerfall-Register (Stand 2026-09-20, Slice 0)

Ein Ort für alle bekannten *stillen* Klassifikationsfehler, gegen die die drei Kandidaten-Schichten
(1 Kalibrierung/Schwelle · 2 Zod-Shape-Set v0 · 3 FCA/Statistik) retrospektiv gemessen werden.
„Still" heißt: der Fehler erzeugte keinen Alarm, er wurde durch Gegenprobe oder Zufall gefunden.
Spalte **Ausgang bekannt** = es gibt eine Gold-Wahrheit oder eine dokumentierte Messung, gegen die
„gefangen / nicht gefangen" entschieden werden kann.

**Benennung von Schicht 2:** Im Ticket (THE-597, THE-607) heißt sie „SHACL v0-Entwurf". SHACL wurde am
05.07.2026 bewusst verworfen (`docs/strategy/2026-07-05-canon-architecture-design.md:1130`, keine
SPARQL-Steuer); das Äquivalent im Repo ist die Zod-Schreibgrenze. Hier als **Zod-Shape-Set v0** geführt;
Slice 3 ordnet sein Go/No-Go der Ticket-Schicht „SHACL v0" zu.

## A. Fehlerfälle

| ID | Fall | Facette | Quelle (Datei:Zeile / Report) | Ausgang bekannt | Erwartete Fang-Schicht | Warum diese Schicht |
|---|---|---|---|---|---|---|
| F-01 | THE-542/543: Modalität 219/219 „gemessen", aber nur 2 Werte belegt (pflicht 210, erlaubnis 9, **verbot 0**) | obligationKind / modalitaet | `packages/shared/src/obligations/slots.ts:31-53`; `src/scripts/obligation-slots.ts:190-207` | ja (Verteilung dokumentiert; Ursache Korpus-Zuschnitt, nicht Prompt) | 3 | Eine Konstante ist ein statistischer Befund (Verteilungs-Wächter), keine Einzelfall-Frage |
| F-02 | THE-588: „oder"-Aufzählung im Adressaten-Lexikon wählte die erstbeste Regel (Zeilenreihenfolge entschied, nicht der Text) | partyRole | `src/services/addresseeLexicon.ts:43-66`; Sonde `src/scripts/the588-impact-probe.ts`; `docs/evals/scf-gold-produktpfad.md:140-165` | ja (gefixt; 12 eingefrorene Werte in der Sonde) | 2 | Zwei Rollen im Text, eine im Ergebnis: eine Shape-Regel „Aufzählung ⇒ Mehrfachrolle oder null" |
| F-03 | `partyRoleObserved` verschwand still: mongoose strict streicht unbekannte Pfade bei `$set` kommentarlos | (Schreibpfad) | `packages/compliance-crawler/src/db/regulation.model.ts:165-173`; Typing-Assembler ohne `.parse()` `packages/compliance-crawler/src/lib/typingBatch.ts:145` | ja (dokumentiert; gefixt durch Schema-Feld + `strict: 'throw'`) | 2 | Genau der Fall, den eine Schreibgrenze laut abweist |
| F-04 | `obligationKind`/`prohibition`: P 0,33 · R 0,33 · F1 0,33 bei support 3 (gv3, Haiku 4.5); auf gv2 F1 0,00 | obligationKind | `docs/evals/the597-input-typing-gv3.md`; `docs/evals/typing-release-gates.md:103` | ja (Gold gv3 frozen) | 1 | Eine niedrige Konfidenz auf dieser Klasse würde den Fall an den Menschen routen |
| F-05 | `partyRole`/`supervisory_authority`: R 0,36 bei support 14, gedrückt von `conformity_assessment_body` (P 0,44, R 1,00) | partyRole | `docs/evals/the597-input-typing-gv3.md`; `docs/evals/typing-release-gates.md:100-102` | ja (Gold gv3) | 1 | Verwechslung zweier Nachbarklassen — Self-Consistency sollte hier schwanken |
| F-06 | `provisionKind`/`procedural`: R 0,36 bei support 14 | provisionKind | `docs/evals/the597-input-typing-gv3.md` | ja (Gold gv3) | 1 | wie F-05 |
| F-07 | `partyRole`/`member_state`: P 0,38 bei support 6 | partyRole | `docs/evals/the597-input-typing-gv3.md` | ja (Gold gv3) | 1 | wie F-05 |
| F-08 | `provisionKind`/`definition`: F1 0,00 bei n = 1 | provisionKind | `docs/evals/the597-input-typing-gv3.md`; Klassen-Regel n ≥ 3 in `docs/evals/typing-release-gates.md:34-48` | ja, aber n = 1 | 1 (nur deskriptiv) | Unter der Klassen-Regel; wird berichtet, nicht gewertet |
| F-09 | Tote Achsen: `bindingness` 99,9 % `binding` (0,014 Bit), `normKind` 97 % `legislation` (0,224 Bit) — Trivial-Messlatte „immer häufigste Klasse" erreicht 100 %; Freigabe-Schwelle ≥ 0,85 war ein grünes Licht, das nichts prüft | bindingness, normKind | `docs/evals/the691-achsen-implikationen.md`; `docs/daily-2026-08-13.md:101-113`; `runTypingEval.ts:31-36` (AKT_METADATEN_ACHSEN) | ja (Korpus-Messung 1750 Bestimmungen) | 3 | Bereits von der FCA-Sonde gefunden — der Nachweis, dass Schicht 3 einen Fall fängt, existiert |

## B. AC-4 — „Feature Oracle Kalibrierung" (Daily 2026-04-05)

Kein Kalibrierungsverfahren, sondern Prompt-Tuning: Score-Spannen je `riskThreshold` wurden in den
System-Prompt von `oracle.service.ts` geschrieben (HIGH → 65–80, MEDIUM → 50–70, LOW → 20–40/60–80) und
gegen eine *erwartete Spanne* geprüft, nicht gegen Gold. Kein Eval, keine Reliability-Prüfung.
**Wiederverwendbar: nein.** Wert für THE-597: das Negativbeispiel einer Zahl mit „kalibriert"-Etikett
ohne Messinstrument dahinter (vgl. ADR-0012).

## C. Wo heute Confidence entsteht — und wo nicht

| Pfad | Feld | Stelle | Gold-Pairing vorhanden | Offline messbar |
|---|---|---|---|---|
| Norm→Element-Mapping | `confidence` (Schwelle 0,5) | `src/services/complianceMapping.service.ts:79,502` | ja (`mapping.v1/v2`, 15 Fälle, **nicht frozen**) | nein (kein Cache-Bucket für Golden-Version v1-draft — der committete Cache liegt unter v1-seed; Fehler reproduziert in Task 4) — Live-Lauf n = 15, nicht frozen: Beobachtung, keine Kalibrierung |
| REQGEN | `extractionConfidence` | `src/services/requirementGenerator.service.ts:43,278` | nein | nein |
| Discovery-Judge | `confidence` | `src/services/lawDiscovery.service.ts:433` | ja, aber nur mit `--judge` live | nein |
| Relations-Vorschlag | `confidence` (optional) | `packages/shared/src/relations/suggestion.ts:59` | Gold ja (relations.v5), Confidence im Baseline-Lauf nicht erhoben | nein |
| **Typisierung (5 Achsen)** | **keine** | `packages/shared/src/typing/prompt.ts:256-268`; `runTypingEval.ts:196` | ja (gv3 frozen, 70 Fälle) | **nein — Slice 1 erzeugt das Signal** |

Konsequenz: Schicht 1 wird in Slice 1 auf der Typisierung gemessen, mit einer retrospektiv erzeugten
Self-Consistency-Konfidenz. Positivkontrolle des Instruments: AUROC > 0,6 auf mindestens einer
Inhalts-Achse. Fällt sie, lautet der Befund „nicht messbar", nicht „No-Go".

## D. Slice-1-Ergebnis (Self-Consistency k=5 auf gv3, Lauf vom 2026-09-20, Modell claude-haiku-4-5-20251001)

Golden-Hash: `af57f9f52f7fcae330562b271a957cc585a0071d8aadced9d83aa68f33091b11` · Report: `docs/evals/the597-typing-gv3-sc5.md` · Fälle: 70 · LLM-Aufrufe: 350

### Instrument-Kontrolle (Positivkontrolle: AUROC > 0,6 auf ≥ 1 Inhalts-Achse)

| Achse | Samples | falsche | AUROC | Verdikt |
|---|---|---|---|---|
| obligationKind | 70 | 17 | 0.656 | trägt |
| partyRole | 70 | 21 | 0.733 | trägt |
| provisionKind | 70 | 16 | 0.637 | trägt |

**Instrument-Verdikt:** MESSBAR — Self-Consistency trennt richtig von falsch auf obligationKind, partyRole, provisionKind (AUROC > 0,6). Alle drei Inhalts-Achsen liegen über 0,6; die Streuung zwischen zwei Läufen (siehe unten) zeigt, wie viel davon Rauschen ist.

### Routing-Zahlen für die Kill-Schwelle (≥ 50 % Recall bei ≤ 10 % Fehlalarm; entschieden wird in Slice 3)

| Achse | Schwelle | Recall (falsche gefangen) | Fehlalarm (richtige geroutet) |
|---|---|---|---|
| obligationKind | < 0.6 / < 0.8 / < 1.0 | 0.0 % / 11.8 % / 35.3 % | 0.0 % / 1.9 % / 3.8 % |
| partyRole | < 0.6 / < 0.8 / < 1.0 | 0.0 % / 23.8 % / 52.4 % | 0.0 % / 2.0 % / 6.1 % |
| provisionKind | < 0.6 / < 0.8 / < 1.0 | 0.0 % / 12.5 % / 37.5 % | 0.0 % / 5.6 % / 9.3 % |

Lesart: Bei ≤ 10 % Fehlalarm erreicht in Lauf 2 partyRole die Kill-Schwelle (52.4 % Recall bei 6.1 % Fehlalarm (Schwelle < 1.0)); obligationKind bleibt darunter (35.3 % Recall bei 3.8 % Fehlalarm (Schwelle < 1.0)), provisionKind bleibt darunter (37.5 % Recall bei 9.3 % Fehlalarm (Schwelle < 1.0)). In Lauf 1 erreichte keine Achse die Schwelle (obligationKind 35.3 % Recall bei 1.9 % Fehlalarm (Schwelle < 1.0); partyRole 0.0 % Recall bei 3.8 % Fehlalarm (Schwelle < 0.6); provisionKind 40.0 % Recall bei 7.3 % Fehlalarm (Schwelle < 1.0)). Das Ergebnis kippt also zwischen zwei Läufen — die Zahlen stehen hier als Input für Slice 3, nicht als Entscheid; ein Go/No-Go braucht mehr als einen Lauf je Schwelle.

### Bezug zu den Fehlerfällen (aus `cases[]`, Achse offen = kein Sample, wie in `axisCalibrationSamples`)

- F-04 (prohibition): von 3 Gold-Fällen der Klasse `prohibition` wurden 2 falsch klassifiziert, davon 0 mit Konfidenz < 0,8 (also bei Schwelle 0,8 geroutet).
- F-05 (supervisory_authority): von 14 Gold-Fällen der Klasse `supervisory_authority` wurden 9 falsch klassifiziert, davon 1 mit Konfidenz < 0,8 (also bei Schwelle 0,8 geroutet).
- F-06 (procedural): von 14 Gold-Fällen der Klasse `procedural` wurden 9 falsch klassifiziert, davon 1 mit Konfidenz < 0,8 (also bei Schwelle 0,8 geroutet).
- F-07 (member_state): von 6 Gold-Fällen der Klasse `member_state` wurden 1 falsch klassifiziert, davon 0 mit Konfidenz < 0,8 (also bei Schwelle 0,8 geroutet).

### Robustheit: zwei unabhängige Läufe (stochastisch, je k=5)

| Achse | AUROC Lauf 1 (`the597-typing-gv3-sc5-run1.json`) | AUROC Lauf 2 (Evidenz) |
|---|---|---|
| obligationKind | 0.667 | 0.656 |
| partyRole | 0.591 | 0.733 |
| provisionKind | 0.668 | 0.637 |

Lauf 1 entstand vor den Review-Nachzügen am Renderer (Code-Stand 08dbb47; Zahlenlogik identisch); nur seine JSON-Zahlen werden hier verwendet. Die Streuung zwischen den Läufen ist die Unsicherheit dieses Instruments und gehört in jede Schwellen-Entscheidung in Slice 3.

