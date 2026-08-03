# RVTM — THE-546 Slice 1: Klausel-Fundament + Verdrängungs-Gate

**Plan:** docs/superpowers/plans/2026-08-03-the546-slice1-klausel-fundament.md
**Stand:** Plan geschrieben 2026-08-03 (Nachtlauf) — **wartet auf Freigabe, kein Bau begonnen.**
**Scores:** Parent THE-546: 85,7 (Pre-Flight 2026-08-02). Ousterhout Slice 1: Change Amplification niedrig (additiv, 2 neue Module) · Cognitive Load niedrig (ein Begriff: contentId) · Unknown Unknowns niedrig (beide Mechaniken heute Nacht gemessen) · Abhängigkeiten niedrig (shared→server, kein DB/Netz) · Obscurity niedrig (Kommentare tragen die Messbelege). Watch-Point: `measureGrouping`-Umbau darf Lauf-4-Reproduzierbarkeit nicht brechen (Regressionstests im Plan).

| REQ / AC | Quelle | Plan-Task | Verifikation | Status |
| --- | --- | --- | --- | --- |
| 001.1 AC1 — Segmentierung reproduzierbar, Rate je Artikel, Reg2Req-Vergleich | THE-560 | Bestand (Lauf 4) + Task 2 | `runReqtraceEval.test.ts` + `reqtrace-run-4.md` (143 Klauseln, Rate 15,9/Artikel) | Bestand belegt |
| 001.1 AC2 — Content-Id = Hash über normalisierten Text; positionaler Pfad nur Anzeige | THE-560 | Task 1 + 2 | `clauseIdentity.test.ts` (5 Tests) + Kommentar am Segmenter | offen (Plan) |
| 001.1 AC3 — Novellen-Test: unveränderte Klauseln behalten Id | THE-560 | Task 2 | `clauseSegmenter.novelle.test.ts` — 30/30 wiedergefunden (gemessene Zahl THE-550) | offen (Plan) |
| 001.1 AC4 — „(1a)"-Grenze dokumentiert, Folge-Ticket | THE-560 | Task 2 Step 3 (Kommentar) + Ticket-Anlage beim Merge | Kommentar + Linear | offen (Plan) |
| 001.4 AC1 — DORA/NIS2-Kante mit Zitat belegt | THE-563 | Bestand: `norm-ontology.v1.ts` `dora-prevails-nis2` (beide Zitate) | Ontologie-Daten + Schema-Test | **Bestand ✅** |
| 001.4 AC2 — Gate greift mechanisch VOR jeder Beurteilung | THE-563 | Task 3 | `displacementGate.test.ts` + `measureGrouping.test.ts` (ein Codepfad) | offen (Plan) |
| 001.4 AC3 — vier Anwendbarkeits-Zustände unterscheidbar | THE-563 | Rückgabeform Task 3; API-Konsum bewusst verschoben (braucht THE-548-Profil) | Test „scoped, not global" | teilweise geplant, Rest verschoben (begründet) |
| 001.4 AC4 — Versionierung + CHANGELOG, Kante als Daten erweiterbar | THE-563 | Task 4 | CHANGELOG-Eintrag oder Bestandsbeleg | offen (Plan) |

**Bewusst NICHT in Slice 1:** REQ-001.2/001.3 (Anforderungs-Erzeugung — braucht die Strangler-Entscheidung 001.7 als Rahmen), REQ-001.5/001.6 (Maßnahmen/Traceability — konsumieren 001.1–001.4), „(1a)"-Segmenter-Fix (Folge-Ticket), Vier-Zustände-API (THE-548-Anschluss).
