# RVTM — THE-569 (Slice B): Harmonisierungs-Vorschlag

**Plan:** docs/superpowers/plans/2026-08-03-the569-harmonisierungs-vorschlag.md
**Parent:** THE-564 (REQ-REQTRACE-001.5) · **Stand:** Plan geschrieben — wartet auf Bau-Freigabe.
**Score (Pre-Flight 2026-08-03, THE-564-Ebene):** ≈ 83.
**Ousterhout (Slice-B-Zuschnitt):** Change Amplification niedrig-mittel (1 Service, 2 Routen, 1 Panel; `groupIntoMeasures` bleibt unangetastet die EINE Quelle) · Cognitive Load mittel (zwei neue Nutzer-Begriffe: Vorschlag/Bestätigung — getragen vom Asilomar-Muster) · Unknown Unknowns mittel (Adressaten-Lexikon-Abdeckung auf echten Daten; Judge-Latenz im Produkt) · Abhängigkeiten mittel (LLM classify + judge, beide injizierbar) · Obscurity niedrig. **Watch-Points:** (1) Judge-Kosten — nur expliziter Aufruf, Deckelung Default 50 / Max 200, `pairsJudged` in der Antwort; (2) Adressaten-Lexikon konservativ — `unmappedAddressee` als Quote, nie falsch paaren; (3) Routen-Reihenfolge (`/harmonization/*` vor `:id`-Routen).

| AC (THE-569) | Plan-Task | Verifikation | Status |
| --- | --- | --- | --- |
| AC1 — Vorschlag nur als expliziter Aufruf; Kosten/Latenz in der Antwort | Task 3, 4 | POST-only + Rate-Limit + `stats.pairsJudged`/`pairsCapped` in Response | offen (Plan) |
| AC2 — verdrängte Paare erreichen den Richter nie; eigener Fall mit Zitat | Task 3 | Judge-Spy-Test (nis2×dora nie gerufen) + `excludedByDisplacement` in Response | offen (Plan) |
| AC3 — 68,8-%-Fehlerrest sichtbar; Bestätigung = Mensch, editor, auditiert | Task 4, 5 | Panel-Test (Satz sichtbar) + Route (editor + audit high) | offen (Plan) |
| AC4 — nach Bestätigung: gemeinsames Element an allen Mitgliedern; Gates/Evidenz je Anforderung getrennt | Task 3 | confirm-Test ($addToSet + covered-Recompute, menschliche Tore unangetastet; Element muss an ≥1 Mitglied hängen — THE-551-Leitplanke: System schlägt Gruppe vor, Mensch wählt Element) | offen (Plan) |
| AC5 — Deckelung ausgewiesen, nie still | Task 3, 4 | `maxJudgedPairs` Default 50/Max 200 + `pairsCapped` in stats | offen (Plan) |

**Ehrliche Grenzen (Plan-Kopf, werden Code-Kommentar):** Adressaten-Lexikon musterbasiert (`unmappedAddressee`-Quote; sauberer Weg = Korpus-`partyRole` mit dem Korpus-Anschluss) · nur Ketten-Anforderungen (REQGEN-Alt ohne vier Schlüsselfelder nimmt nicht teil — Provenienz-Trennung ADR-0008) · Bestätigung braucht ≥1 bereits verlinktes Element.

**Bewusst nicht in Slice B:** Element-VORSCHLAG durch das System (THE-551: 51,2 % — die Ebene/das Element ist eine Landschafts-Entscheidung) · Persistenz des Vorschlags als eigenes Objekt (YAGNI — der Vorschlag ist eine Antwort, die Bestätigung ist der Zustand) · Slice C (Prämisse ungemessen).
