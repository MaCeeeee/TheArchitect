# UC-WFCOMP-001 — Definition of Success (Evaluation-Driven)

**Erstellt:** 2026-06-27 · **Parent:** THE-351 · **Eval-REQ:** THE-359 (REQ-WFCOMP-001.7)
**Prinzip:** Evaluation-driven, nicht reaktiv. „Define success → Build dataset → Evaluate → Improve → Repeat." Die Erfolgskriterien sind das Ziel, auf das M1 zubaut — nicht ein nachgelagerter Test.

## Der Reframe

Weil das Design Unsicherheit **bewusst an den Menschen routet** (Ask statt Predict), ist das Erfolgsmaß *nicht* „LLM-Genauigkeit auf Rechtsfeldern". Es sind überwiegend **binäre Sicherheits-/Korrektheits-Eigenschaften, die halten MÜSSEN**. Die zentrale Eval-Frage:

> **„Weiß das Tool zuverlässig, was es nicht weiß?"**

## North-Star (das ganze UC)

| # | Eigenschaft | Ziel | Warum |
|---|---|---|---|
| N1 | Kein false-grün (Feld „abgedeckt" obwohl Trace fehlt) | **0 %** | gefährlichster Fehler — falsches VVT schlimmer als keins |
| N2 | Keine Personendaten at-rest (Sanitize) | **0** PII-Werte | sonst Auftragsverarbeiter-Risiko (Art. 28) |
| N3 | Keine halluzinierten Elemente | **0** | LLM erfindet nie ein Atom |
| N4 | Kein Rechtsfeld-als-Fakt (LLM-Vermutung nie grün) | **100 %** geroutet | Honest-Naht, kein Rubber-Stamping |
| N5 | Deterministische Lücken exakt vs. Ground-Truth | **100 %** match | .2/.4 sind deterministisch → exakt, nicht statistisch |

## Golden-Datensatz (~10 Fixtures, handgelabelt)

Handgebaute n8n-JSONs mit handgelabeltem Art.-30(1)-Soll. Liegen unter `packages/server/src/__tests__/fixtures/wfcomp/`.

| Fixture | testet | Ground-Truth |
|---|---|---|
| `clean-compliant` | kein false-rot | alle HART grün, keine Lücke |
| `missing-purpose` | lit. b | b ROT (HART) |
| `missing-recipient` | lit. d | d ROT (HART) |
| `thirdcountry-no-safeguard` | lit. e Guard | e ROT (BEDINGT ausgelöst) |
| `thirdcountry-with-safeguard` | lit. e Gegenprobe | e GRÜN |
| `multi-dataobject-partial-tom` | Cypher-Korrektheit | g ROT (kein false-ok durch Nachbar-Objekt) |
| `pindata-leak` | Sanitize | 0 PII at-rest, Struktur trotzdem geparst |
| `no-personal-data` | Anwendbarkeit | gdprScope=false, „Art. 30 nicht einschlägig" |
| `inferrable-purpose` | LLM-Routing | Zweck-Kandidat GELB → Confirm, nie grün |
| `ambiguous-purpose` | LLM-Routing | → Ask, KEINE vorausgefüllte Vermutung |

## Definition of Success pro Meilenstein (Gates)

### M1 — Mechanismus-Beweis (deterministisch, kein LLM)
- **G1** Sanitize: `pindata-leak` → 0 PII in Neo4j/Mongo. *(must-hold)*
- **G2** Kein false-grün über alle Fixtures. *(must-hold)*
- **G3** HART-Lückenliste exakt = Ground-Truth (Fixtures 1–6, 8).
- **G4** Guard-Logik: `thirdcountry-*` korrekt rot/grün; `multi-dataobject` → g ROT.
- **G5** Anwendbarkeit: `no-personal-data` NICHT als „nicht-konform" geflaggt.
- **M1 fertig ⟺ G1–G5 grün.**

### M2 — Tiefe (LLM + Attestierung)
- **G6** Halluzination = 0 (kein inferiertes Element-Ref auf Nicht-Existentes). *(must-hold)*
- **G7** Honesty: jedes nicht-extrahierbare Rechtsfeld landet gelb/ask, NIE grün. *(must-hold, 100 %)*
- **G8** Ask-vs-Confirm-Split korrekt (`inferrable`→Confirm m. Kandidat, `ambiguous`→Ask ohne Vorfüllung).
- **G9** Recompute: Attestieren flippt Provenance→certified, Trace re-runnt, Verdikt aktualisiert.
- **M2 fertig ⟺ G6–G9 grün.**

### M3 — Verdikt + ehrliche UI
- **G10** Drei-Listen-Integrität: grün⟺import-Trace, gelb⟺certified, rot⟺fehlt; KEIN aggregiertes %.
- **G11** „Vollständig"-Regel: nur wenn keine roten HART/BEDINGT UND keine ungelb-bestätigten HART.
- **G12** Honest-Naht: strukturell-komplett-aber-unbestätigt → „Struktur lückenlos — Unterschrift nötig", kein grüner Haken.
- **M3 fertig ⟺ G10–G12 grün.**

## Eval-Harness

Test-Runner (`packages/server/src/__tests__/wfcomp-eval.test.ts` o.ä.) lädt die Fixtures, fährt die Pipeline, gibt einen **Gate-Report** aus (pro Gate grün/rot). „Meilenstein fertig" = Gate-Report grün. Harness entsteht **früh** (parallel zu .0/.1), nicht am Ende — er IST das Ziel.

## Komplexitätsbewertung (Ousterhout) — Querverweis

Siehe RVTM `2026-06-27-uc-wfcomp-001-rvtm.md`: Verdikt komplexitäts-arm, einziger Watch-Point = kognitive Last des Trace-DSL (mitigiert via Beispiel-traceTargets in THE-352).
