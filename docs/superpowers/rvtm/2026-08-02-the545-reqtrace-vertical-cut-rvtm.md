# RVTM — THE-545 Senkrechter Schnitt gegen das SCF-Gold

**Plan:** docs/superpowers/plans/2026-08-02-the545-reqtrace-vertical-cut.md
**Ticket:** THE-545 (ENTSCHEIDUNG) · blockiert THE-546 · **Rahmen:** ADR-0007
**Datum:** 2026-08-02 · **Basis:** Branch `mganzmanninfo/the-382-slice1-pair-judge` (wiederverwendete Werkzeuge liegen dort)
**Score des blockierten Bau-UC:** 85,7 · **Komplexitäts-Verdikt:** Unknown Unknowns HOCH — genau deshalb dieses Ticket vor jedem Bau

Status: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert

## Definition of Done aus THE-545

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **DoD-1** | **Positiv-Kontrolle:** die 5 SCF-Kandidaten (BCD-01, CRY-01, GOV-02, HRS-03, RSK-01) werden aus dem Gesetzestext unabhängig wiedergefunden; Trefferquote als Zahl | Task 6, 7, 8 | Bericht weist x/5 aus; Zuordnung Maßnahme→Gold über Gesetzes-Abdeckung + Handlungstabelle | ⬜ |
| **DoD-2** | **Negativ mechanisch:** NIS2 Art. 23 × DORA Art. 19 scheidet durch die Verdrängungs-Kante aus, **bevor** ein Modell befragt wird | Task 3, 6 | Unit: Paar in `excludedByDisplacement`, Richter-Stub hat es nie gesehen (strukturell, nicht per Urteil) | ⬜ |
| **DoD-3** | **Negativ semantisch:** NIS2 Art. 21 (Risikoanalyse) × DSGVO Art. 33 (Meldung) → keine geteilte Maßnahme | Task 6, 7 | Unit + echter Lauf: Paar bleibt ungruppiert | ⬜ |
| **DoD-4** | **Kalibrierung:** Anforderungen je Klausel ausgewiesen, Referenz Reg2Req ≈ 1,1; dazu Anteil anforderungs-freier Klauseln und `splitCount` | Task 2, 7 | Bericht enthält alle drei Zahlen mit Referenz daneben | ⬜ |
| **DoD-V** | **Verdikt nach Abbruchbedingungen:** `traegt` nur bei ≥3/5 ∧ beiden Negativ-Kontrollen ∧ Rate ∈ [0,5; 3]; sonst `traegt-nicht` mit benannter Bedingung — ein negativer Ausgang ist ein gültiges Ergebnis | Task 7, 8 | Unit: Verdikt-Logik; `exitCode=1` nur bei Harness-Fehlern | ⬜ |

## Messvalidität — die Punkte, an denen dieser Schnitt selbst scheitern kann

| ID | Anforderung | Plan-Task | Verifikation | Status |
|---|---|---|---|---|
| **MV-1** | **Rohtext, nicht REQGEN.** Die zweite Prämisse (widerlegt) darf nicht durch die Hintertür zurückkommen | Task 1 | Unit: Absatz-Struktur + Mindestlänge; kein Import aus `ComplianceRequirement` | ⬜ |
| **MV-2** | **Provenance des Fixtures:** CELEX + Abrufdatum je Artikel; Stichproben-Zitate gegen die Quelle | Task 1 | Unit: `celex`-Format, `retrievedAt`, drei tragende Sätze wörtlich | ⬜ |
| **MV-3** | **Adressatenklasse mit Zitat** — der Handersatz für den unerreichbaren Korpus-Join ist belegt, nicht geraten; Abweichung vom Ticket-Text im Bericht benannt | Task 1, 7 | Unit: `addresseeCitation` Pflicht; Bericht nennt die Grenze | ⬜ |
| **MV-4** | **Klausel-Zerlegung mechanisch, deterministisch, verlustfrei** — kein LLM, kein stiller Textverlust | Task 2 | Unit: kein raterClient-Import; Coverage-Test; zweimal = identisch | ⬜ |
| **MV-5** | **Verdrängung ist Datum mit Zitat, adressaten-scharf** — `financial_entity` ja, `essential_important_entity` nein, DSGVO nie; beim **Paar** wird mit der Adressatenklasse der **vorrangigen** Seite geprüft (ein Finanzunternehmen ist zugleich wesentliche Einrichtung) | Task 3, 6 | Unit: `findDisplacement`-Dreifachtest + Paar-Test in `measureGrouping`; Ontologie 1.9.0 + CHANGELOG | ⬜ |
| **MV-14** | **Maßnahme = Zusammenhangskomponente, nicht Paar** — verdrängte Paare bekommen keine Kante, dürfen aber über ein drittes Gesetz in derselben Komponente landen; sonst wären GOV-02/RSK-01 per Konstruktion unerreichbar (max. 3/5). Adressaten-Kompatibilität ist eine Datenzeile (`COMPATIBLE_ENTERPRISE_ROLES`), NICHT »gleiche partyRole-Id« | Task 6 | Unit: Drei-Gesetze-Komponente ohne Direktkante ⇒ eine Maßnahme; Kompatibilitäts-Funktion getestet | ⬜ |
| **MV-6** | **Singularität ist eine Zählung, kein Urteil** — Slots als Listen, Tor = Länge 1; leere Liste ≠ singulär | Task 4 | Unit: `isSingular` inkl. Leerlisten-Fall | ⬜ |
| **MV-7** | **Blendung strukturell auch hier** — der Klausel-Prompt rendert ausschließlich geblendeten `path` + `text`; die Klausel-Id (`dsgvo:art32:c01`) ist Auswertungs-Anker und erscheint **nie** im Prompt (sie würde von `CITATION_PATTERN` nicht gefangen) | Task 4 | Unit: Ausgabe enthält weder Gesetzesnamen noch Fundstelle noch Id — mit realistischer Id getestet | ⬜ |
| **MV-8** | **„Trägt keine Anforderung" ist erstklassig**; unlesbar (`null`) ≠ leer (`[]`) | Task 4 | Unit: Parser-Trennung | ⬜ |
| **MV-9** | **Implementierungsfreiheit per Lexikon** — Verstöße gezählt und benannt, nie still verworfen; Lexikon ist Datenzeile | Task 5, 7 | Unit: drei Lexikon-Fälle; Harness zählt `implFreedomFailures` | ⬜ |
| **MV-10** | **Zusammenfall nur bei identischem `collapseKey`** (Schutzgut · Verpflichteter · Auslöser · Nachweis) — ADR-0007 E5, erwartete Häufigkeit ~0 | Task 5, 6 | Unit: Feldvergleich; Bericht weist Zusammenfälle einzeln aus | ⬜ |
| **MV-11** | **Traceability rückwärts:** jede SysReq trägt `derivedFrom` ≥ 1 (15288 §6.4.3.2 f) | Task 5 | Unit: leeres `derivedFrom` → `null` | ⬜ |
| **MV-12** | **Richter-Kollaps sichtbar:** Positiv-Probe „dieselbe Klausel zweimal" läuft mit; Typ-Verteilung im Bericht; `equal`-Häufung würde dem Experiment (0/120) widersprechen und wird benannt | Task 7 | Unit + Bericht | ⬜ |
| **MV-13** | **Kein Nachbessern nach dem Verdikt** — bei „trägt nicht" wird repariert nur, was als Harness-Fehler belegt ist | Task 8 | Review; Anti-Nachbesserungs-Anker im Bericht | ⬜ |
| **ADD-1** | **Rein additiv:** keine Produktionsdaten, kein Modell, keine Migration; Bestands-Suiten grün | alle | `git diff` berührt nur `src/evals/`, `src/scripts/`, `shared/ontology|obligations`, docs; volle Suite grün | ⬜ |

## Menschliche Tore

| Tor | Wo | Entscheid |
|---|---|---|
| 🧑 1 | Task 8 Step 3 | **≤5 Maßnahmen-Fälle adjudizieren:** „Ist das eine Maßnahme, die man einmal baut?" — geblendet, ohne SCF-Namen im Blatt (≈ 30 min) |
| 🧑 2 | Task 8 Step 4 | **Verdikt gegen die Abbruchbedingungen** — trägt / trägt nicht / trägt mit Auflagen → `docs/evals/reqtrace-decision.md`, THE-545 schließen, ggf. THE-546 entblocken |

## Offene Punkte

- **O-1 Fixture statt Korpus:** benannte Abweichung vom Ticket-Text; Adressatenklasse von Hand mit Zitat statt Korpus-Join. Für den Entscheid ausreichend; das Bau-Ticket muss den echten Join (Server B) benutzen.
- **O-2 Zuordnungstabelle Handlung→SCF-Id ist unsere Setzung** — sie entscheidet mit, was als „wiedergefunden" zählt. Im Code kommentiert, im Bericht ausgewiesen; der Mensch sieht sie in Tor 2.
- **O-3 Ein Adjudikator, ≤5 Fälle** — reicht für den Entscheid, nicht für ein Produktversprechen (Grenze wie gehabt im Bericht).
- **O-4 DE-only, 9 Artikel** — keine Aussage über andere Sprachen/Domänen; Potenzialfrage braucht den vollen Korpus.
- **O-5 SCF ist CC BY-ND** — intern als Prüfmaßstab, nicht auslieferbar; die Transitivität „gleiche Kontrolle ⇒ harmonisierbar" ist unsere Folgerung und genau das, was Tor 1 prüft.
