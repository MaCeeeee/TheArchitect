# THE-597 Slice 3 — Vorregistrierung (freigegeben 17.11.2026, vor der Messung)

**Frage:** Trägt Schicht 1 (Kalibrierung/Schwelle auf Self-Consistency-Konfidenz) robust das
Kill-Kriterium vom 20.09.2026 — **≥ 50 % Recall auf falsch klassifizierten Fällen bei ≤ 10 %
Fehlalarm auf richtig klassifizierten**? Davon hängt ab, ob THE-606 gebaut wird.

Diese Datei legt **vor der Messung** fest, was gemessen wird, wann es GO/NO-GO heißt und was jeder
Ausgang auslöst. Nach der ersten neuen Messung wird sie nicht mehr geändert; Abweichungen werden als
solche im Ergebnis vermerkt.

## Nicht in diesem Slice

- **Schicht 2 (Zod-Shape-Set) und Schicht 3 (FCA)** — dafür war Slice 2 vorgesehen, das nie lief.
  Beide bleiben „nicht gemessen". Je ein anekdotischer Fang existiert (F-03 Zod, F-09 FCA), das ist
  kein Recall.
- Kein neues Gold, keine Prompt-Änderung, kein Modellwechsel.

## Instrument (unverändert aus Slice 1)

| | |
|---|---|
| Modell | `claude-haiku-4-5-20251001` |
| Prompt | `TYPING_PROMPT_VERSION = tp-4` |
| Konfidenz | Self-Consistency, **k = 5**, Konfidenz = Stimmenanteil der Mehrheit je Achse |
| Achsen | obligationKind · partyRole · provisionKind (bindingness/normKind sind tot, F-09) |
| Schwellen | **< 0,8** und **< 1,0** (< 0,6 ist bei k = 5 strukturell leer) |
| Fehler | jede falsche Mehrheitsentscheidung je Achse (wie Slice 1); F-04…F-07 werden berichtet, entscheiden nicht |

## Daten

| Golden | Läufe | Zählt für | Warum |
|---|---|---|---|
| `typing.gv3.json` (frozen, 70, Rollenraum 1.7.0) | **5** = Lauf 1 + Lauf 2 aus Slice 1 + **3 neue** | alle drei Achsen | gleicher Instrumentstand, Zahlenlogik identisch |
| `typing.gv2.json` (frozen, 70, Rollenraum 1.6.0) | **2 neue** | **nur obligationKind, provisionKind** | partyRole ist in 1.6.0 gelabelt, tp-4 kennt 1.7.0 (+ conformity_assessment_body, ecs_provider, trust_service_provider, data_holder) — Gold und Prompt sprechen nicht dieselbe Sprache |

Kosten: 5 × 350 = **1.750 Haiku-Aufrufe** (Größenordnung einstellige Dollar).

## Entscheidungsregel

Für Achse *a* und Schwelle *t* heißt es **GO**, wenn alle Bedingungen gelten:

1. **Gepoolt über die 5 gv3-Läufe:** Recall ≥ 50 % **und** Fehlalarm ≤ 10 %.
2. **Stabil:** dieselbe Bedingung hält in **≥ 4 von 5** einzelnen gv3-Läufen.
3. **Repliziert** (nur obligationKind, provisionKind): gepoolt über die 2 gv2-Läufe Recall ≥ 50 %
   **und** Fehlalarm ≤ 10 %.

Für partyRole entfällt (3). Ein GO auf partyRole steht deshalb ausdrücklich auf **einem** Gold-Set
und wird im Ergebnis so beschriftet.

**Leerer Nenner** (keine falschen oder keine richtigen Fälle für eine Achse) heißt: Bedingung **nicht
erfüllt** — die Frage ist dann nicht gestellt (Klarstellung vom 17.11.2026, vor der ersten neuen
Messung; die 0 bei leerem Nenner in `metrics.ts` ist eine Konvention, keine Aussage).

**Schicht 1 = GO**, wenn mindestens eine Kombination (*a*, *t*) GO ist. Sonst **NO-GO**. Es gibt
keinen dritten Ausgang.

**Prüf-Last** (Anteil der Fälle, die ein Mensch sehen müsste) wird je (*a*, *t*) berichtet, **entscheidet
aber nicht** — sie stand nicht im Kriterium vom 20.09., und sie nachträglich einzuführen hieße, die
Latte nach dem Blick auf die Daten zu verschieben.

## Ausgänge und Folgen (vorab festgelegt)

**Wenn GO:**
- Sofort: THE-606 wird auf die GO-Achsen zugeschnitten (nur sie bekommen `calibratedConfidence`,
  die übrigen tragen sichtbar `uncalibrated`). Neuer Plan + Fälligkeit, Re-Score von THE-604.
- Entblockt / entfällt: THE-605 (Attest-Schema) und THE-609 (Schwellen-Routing) werden baubar.
- Neue Pflicht: k = 5 im Produkt heißt **5 LLM-Aufrufe je Typisierung**; jede GO-Schwelle schickt
  ihre Prüf-Last an den Menschen (bei partyRole < 1,0 in Lauf 2 waren das 20 %).
- Zielwirkung: ↑G1 (Konfidenz wird gemessen statt behauptet) · ↓G4 (Prüf-Last + LLM-Kosten).

**Wenn NO-GO:**
- Sofort: THE-606 wird nicht gebaut; THE-604 geht mit Befund zurück in den Backlog; THE-597 schließt
  mit diesem Bericht. Abschnitt in ADR-0012 nachgetragen.
- Entblockt / entfällt: THE-605/609/610 verlieren ihre Grundlage, bleiben im Backlog. Freie Kapazität
  für THE-692 (Katalog/Klassifikator), wo die systematischen Fehler herkommen.
- Neue Pflicht: keine.
- Re-Trigger: eine andere Konfidenzquelle (Logprobs, zweites Haus) oder ein Klassifikator mit anderem
  Fehlerprofil nach THE-692 — dann dieselbe Regel, neu gemessen.
- Zielwirkung: G1 bleibt offen (Konfidenz ist weiter Selbstauskunft) · ↑G4.

## Was gebaut wird

- Ein Lauf-Skript, das jeden Lauf unter eigenem Namen nach `docs/evals/the597-slice3/` sichert (heute
  überschreibt `typing:eval` die Ausgabe je Golden). Bricht ein Lauf ab, werden nur fehlende Läufe
  nachgeholt; ein fertiger Lauf wird nie überschrieben, jeder Abbruch wird im Ergebnis vermerkt.
- Eine reine Aggregationsfunktion: Läufe rein → gepoolte und Einzellauf-Routing-Zahlen je (*a*, *t*)
  → GO/NO-GO nach obiger Regel. Wiederverwendet `axisCalibrationSamples` und `thresholdRoutingStats`.
  Testgetrieben, ohne LLM.
- Ergebnisbericht `docs/evals/the597-slice3-ergebnis.md` + Abschnitt E im Fehlerfall-Register.
