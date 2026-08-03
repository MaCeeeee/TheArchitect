# RVTM — THE-546 Slice 1: Klausel-Fundament + Verdrängungs-Gate

**Plan:** docs/superpowers/plans/2026-08-03-the546-slice1-klausel-fundament.md
**Stand:** Gebaut 2026-08-03 nach Freigabe. Alle ACs erfüllt oder mit Beleg als Bestand ausgewiesen.
**Scores:** Parent THE-546: 85,7 (Pre-Flight 2026-08-02). Ousterhout Slice 1: alle fünf Dimensionen niedrig (bestätigt — additiv, keine DB-Migration, ein neuer Begriff). Watch-Point `measureGrouping`-Umbau: eingetreten wie geplant, Lauf-4-Reproduzierbarkeit über 22 Bestandstests nachgewiesen.

| REQ / AC | Quelle | Umsetzung | Verifikation | Status |
| --- | --- | --- | --- | --- |
| 001.1 AC1 — Segmentierung reproduzierbar, Rate je Artikel, Reg2Req-Vergleich | THE-560 | Bestand (Lauf 4) | `runReqtraceEval.test.ts` + `reqtrace-run-4.md` (143 Klauseln, ~15,9/Artikel, Referenz Reg2Req ~4/Artikel dokumentiert) | ✅ Bestand belegt |
| 001.1 AC2 — Content-Id = Hash über normalisierten Text; positionaler Pfad nur Anzeige | THE-560 | `clauseIdentity.ts` (shared, pure-TS sha256) + `Clause.contentId` | `clauseIdentity.test.ts` (11 Tests, sha256 gegen node:crypto-Referenz) + Interface-Kommentar „REFERENZEN gehören auf contentId" | ✅ |
| 001.1 AC3 — Novellen-Test: unveränderte Klauseln behalten Id | THE-560 | Segmenter + Regressionstest | `clauseSegmenterNovelle.test.ts` — 30/30 wiedergefunden, Einschub erscheint als NEUE contentId | ✅ (gemessene Zahl aus THE-550 reproduziert) |
| 001.1 AC4 — „(1a)"-Grenze dokumentiert, Folge-Ticket | THE-560 | Kommentar am `Clause`-Interface + **THE-567** angelegt (mit ACs inkl. Fußnoten-Negativ-Kontrolle) | Review | ✅ |
| 001.4 AC1 — DORA/NIS2-Kante mit Zitat belegt | THE-563 | Bestand: `norm-ontology.v1.ts` `dora-prevails-nis2` (Art. 1 Abs. 2 DORA; Art. 4 NIS2 + ErwG 28) | Ontologie-Daten + Schema-Validierung | ✅ Bestand belegt |
| 001.4 AC2 — Gate greift mechanisch VOR jeder Beurteilung | THE-563 | `displacementGate.service.ts` (rein, symmetrisch, Kante = Daten); `measureGrouping.displacementFor` delegiert — **ein Codepfad, Eval = Produktion** | `displacementGateSvc.test.ts` (5) + `measureGrouping.test.ts` (22, unverändert grün — inkl. „bevor ein Modell befragt wurde") | ✅ |
| 001.4 AC3 — vier Anwendbarkeits-Zustände unterscheidbar | THE-563 | Bestand: `legal-profile.ts` (THE-548) führt `applicable`/`displaced`/`not_applicable`/`undetermined`; das Paar-Gate liefert den `displaced`-Anteil mit Zitat | legal-profile-Tests (THE-548) + `displacementGateSvc.test.ts` | ✅ Bestand + Slice-Beitrag |
| 001.4 AC4 — Versionierung + CHANGELOG, Kante als Daten erweiterbar | THE-563 | Bestand: `ontologyVersion: '1.9.0'` (norm-ontology.v1.ts:18), CHANGELOG.md:12 weist `dora-prevails-nis2` aus; Service liest ausschließlich `NORM_ONTOLOGY.displacements` | Review | ✅ Bestand belegt |

**Testbilanz Slice 1:** 11 (clauseIdentity) + 3 (Novelle) + 5 (Gate) neu · 22 (measureGrouping) + 33 (Reqtrace-Suiten) Bestand grün · `tsc --noEmit` sauber in shared + server.

**Bewusst NICHT in Slice 1 (unverändert):** REQ-001.2/001.3 (Anforderungs-Erzeugung — braucht Strangler-Rahmen 001.7), REQ-001.5/001.6 (konsumieren dieses Fundament), „(1a)"-Fix (jetzt THE-567), Vier-Zustände-API als Endpoint (wartet auf THE-548-Anschluss).

**Eine Abweichung vom Plan, benannt:** Die Test-Signatur des Gates folgt der *gemessenen* Eval-Semantik (Adressatenklasse **je Seite**, geprüft mit der Klasse der vorrangigen — „ein Finanzunternehmen ist zugleich wesentliche Einrichtung") statt der vereinfachten Plan-Skizze mit gemeinsamer Klasse. Der Plan sah diese Ausrichtung ausdrücklich vor („an `measureGrouping.displacementFor` ausrichten — der Service HEBT sie, er erfindet sie nicht neu").
