# ADR-0007: Die Anforderungskette nach ISO/IEC/IEEE 15288 — Gesetz als Bedarf, Harmonisierung auf der Maßnahmen-Ebene

- **Status:** Accepted (2026-08-02, Matthias Ganzmann)
- **Datum:** 2026-08-02
- **Entscheider:** Matthias Ganzmann (Enterprise Architect, ausgebildeter Systems Engineer), im Grill-Verfahren — 9 Entscheidungen, einzeln bestätigt
- **Normbezug:** ISO/IEC/IEEE 15288:2023 §6.4.2 (Stakeholder needs and requirements definition) · §6.4.3 (System requirements definition) · ISO/IEC/IEEE 29148 (Anforderungs-Qualitätsmerkmale)
- **Baut auf:** THE-538 (Katalog-Pivot, gemessen) · `docs/evals/typed-relation-experiment.md` (κ 0,308 → 0,681; `equal` 0/120) · `docs/strategy/2026-08-01-the538-dora-meldepflicht.md` (lex specialis; Wert-Zahl 16 → 5–6) · `docs/strategy/2026-08-01-the538-scf-durchrechnung.md` · Reg2Req (arXiv 2607.04448) · UGAF-ITS (2604.22789)
- **Revidiert:** den Harmonisierungs-Entwurf in THE-438 („eine Pflicht, N Rechtsgrundlagen") · beendet THE-382 in seiner bisherigen Form
- **Glossar:** `CONTEXT.md`, Abschnitt „Requirements (ISO/IEC/IEEE 15288:2023)"

## Kontext

Zwischen dem 31.07. und 02.08.2026 sind wir **viermal** in dieselbe Wand gelaufen: eine Rubrik, die die gesuchte Antwort ausschloss; ein Richter, der das Gesetzes-Etikett statt den Text las; eine binäre Frage über einem kontinuierlichen Sachverhalt (κ 0,308); und zuletzt ein Prüfsatz, dessen Paare fachlich unvergleichbar waren — aufgefallen erst, als ein Mensch 40 davon adjudizieren sollte und nach dem fünfzehnten abbrach.

Alle vier Fehler haben **einen** gemeinsamen Nenner: Wir haben Pflicht gegen Pflicht verglichen, ohne je gesagt zu haben, *an welches System* diese Pflichten gerichtet sind und *auf welcher Ebene* sie stehen. Der Prüfsatz stellte ein Inhaltselement einer Meldung („Beschreibung der wahrscheinlichen Folgen") gegen eine Governance-Pflicht („Kontinuitätsleitlinie genehmigen") und — schlimmer — eine Pflicht der **Aufsichtsbehörde** gegen eine Pflicht des **Unternehmens**.

Der Ist-Zustand im Code erklärt das vollständig. `requirementGenerator.prompt.ts` verlangt vom Modell in **einem** Aufruf: „extract every concrete, actionable requirement", `description: "what concretely MUST be done **HOW**"`, plus `linkedElementIds`. Damit sind Stakeholder-Anforderung, Systemanforderung und Architektur-Zuordnung in einem Artefakt verschmolzen — und die Norm verlangt in §6.4.3.1 das Gegenteil: *„the requirements should not imply any specific implementation."* Es gibt im Repo **keinen einzigen** Treffer für die Qualitätsmerkmale aus 29148 (`singular`, `implementation free`, `verifiable`).

Keines der gesichteten Papers löst das: Reg2Req springt von der Klausel direkt auf „system-level software requirements", modelliert den Adressaten ausdrücklich nicht und kennt keine Cross-Regulation-Stufe. Was fehlte, war kein weiteres Verfahren, sondern ein **Prozess-Rahmen** — und den liefert die Norm, in der der Entscheider ausgebildet ist.

## Entscheidungen

**E1 — System of Interest ist das Unternehmen als soziotechnisches System.** Prozesse, Menschen, Methoden, Tools, Daten — nicht „die IT-Landschaft". Begründung: der überwiegende Teil rechtlicher Pflichten bindet die Organisation, nicht einen Server, und ein Auditor prüft die Organisation. 15288 deckt das ausdrücklich ab („hardware, software, data, **humans, processes**, services, procedures, facilities"). **Preis:** die Systemgrenze ist weit, Implementierungsfreiheit wird dadurch schwerer zu halten.

**E2 — Der Gesetzestext ist der *Bedarf*, unsere Extraktion die *Stakeholder-Anforderung*.** §6.4.2.3 trennt „define stakeholder needs" (c) von „**transform** needs into requirements" (d); die Qualitätsmerkmale gelten für die Anforderungen. Ein Gesetzesartikel ist weder singulär noch eindeutig noch verifizierbar — erklärten wir ihn zur Anforderung, hätten wir **kein Tor**, denn ein Gesetz können wir nicht verbessern. So aber hängt das Tor am ersten Artefakt, das wir selbst erzeugen. Verbote werden dabei zu **Constraints** (§6.4.2.2 c), positive Pflichten und Erlaubnisse zu Anforderungen — eine Trennung, die `requirementProjection.service.ts` bereits vollzieht.

**E3 — Systemanforderung ≠ Maßnahme. Drei Ebenen, nicht zwei.** Die Systemanforderung sagt, *was das Unternehmen können muss* (implementierungsfrei); die **Maßnahme** ist das realisierende Prozess-, Methoden- oder Tool-Element, verbunden über ArchiMate `realization`. Die dritte Ebene existiert im Produkt bereits (THE-315, REQ-REQHARM-001.7 „PMT").

**E4 — Harmonisierung entsteht auf der Maßnahmen-Ebene.** Anforderungen bleiben getrennt — je eigene Fristen, eigene Empfänger, eigener Nachweis —, geteilt wird das realisierende Element. *„Eine Meldekette erfüllt sieben Anforderungen aus drei Gesetzen."*

> **Der Beleg kam vor der Erklärung.** NIS2 zählt seine Fristen ab Kenntnis, DORA ab der jeweils vorangegangenen Meldung. Eine Anforderung „binnen 24 h bzw. 4 h, je nach Rechtsakt" verletzt Singularität und Verifizierbarkeit gleichzeitig. Genau das hat die Messung vom 01.08. gefunden, bevor wir die Regel kannten: **`equal` kam in 120 Fällen null Mal vor, `intersects` dominierte.** Zwei Anforderungen mit gemeinsamem Kern und je eigenen Zusätzen — keine Messschwäche, sondern die korrekte Beschreibung.

**Produkt-Konsequenz, bewusst in Kauf genommen:** Der Bericht gliedert nach **Maßnahmen**, nicht nach Anforderungen. Das ist die ehrlichere Darstellung als eine Anforderungsliste, in der Dubletten wegretuschiert wurden.

> **Präzisierung vom 2026-08-02, aus dem menschlichen Tor von THE-545.** Geteilt wird nicht, wo dieselbe *Handlung* verlangt ist, sondern wo dieselbe **Capability** verlangt ist. Eine Capability heißt nach TOGAF G233 §6.1.1 **Substantiv + Verb** — der Gegenstand *und* die Handlung; die Maßnahme ist ihre Instanziierung. Der Adjudikator hat die 32 Kandidaten genau so beurteilt (22 ja / 10 nein), und **alle zehn Ablehnungen** paaren dieselbe Handlung mit einem anderen Gegenstand: „Vorfall melden" neben „Fristüberschreitung begründen", „Geschäftsfortführung prüfen" neben „personenbezogene Daten wiederherstellen". Unser Slot-Modell (`obligations/slots.ts`) führt Handlung, Empfänger, Modalität und Bedingung — **keinen Gegenstand**; `empfaenger` ist, an wen zu leisten ist, nicht, woran gehandelt wird. Der Harmonisierungs-Schlüssel ist damit die halbe Capability. Die Erklärung ist **nach** den Ablehnungen entstanden und deshalb unbelegt: sie ist blind gegen neue Fälle zu prüfen, bevor sie als Regel gilt. Beleg: `docs/evals/reqtrace-decision.md`.

**E5 — Zusammenfall auf Anforderungsebene nur bei Wortgleichheit — ein Test, kein Ermessen.**

> Zwei Stakeholder-Anforderungen führen auf **eine** Systemanforderung genau dann, wenn Schutzgut, Verpflichteter, Auslöser und Nachweis identisch sind — die Systemanforderung sich also wortgleich formulieren lässt. Sonst: zwei Anforderungen, **eine** Maßnahme.

Derselbe Maßstab wie „singulär". Der Regelfall ist die geteilte Maßnahme; der Zusammenfall ist die Ausnahme und wird geprüft, nie behauptet.

**E6 — Verdrängung (*lex specialis*) ist eine typisierte Kante im Graphen, Anwendbarkeit wird berechnet.** DORA Art. 1(2) erklärt sich zur *lex specialis*; NIS2 Art. 4 und ErwG 28 ziehen die Konsequenz und nennen DORA ausdrücklich. Das ist ein am Text belegbarer, für alle Kunden identischer Fakt — er gehört mit Zitat in die Ontologie (versioniert, semver + CHANGELOG). Ob er für ein konkretes Unternehmen greift, ist kundenspezifisch und wird zur Abfragezeit berechnet, **nie gespeichert**.

> Ohne diese Kante paart das System zwei Anforderungen, die einander ausschließen. Gemessen am 01.08.: **10 von 16** vermeintlichen Harmonisierungs-Kandidaten sind dadurch gegenstandslos. Ein Kontroll-Katalog kennt Fähigkeiten, keine Anwendungsbereiche — genau daran scheitert er hier.

**E7 — Einheit ist die Klausel; Singularität wird über die Slot-Zerlegung geprüft.** Absatz, Buchstabe und Satz sind **strukturell** und werden geparst, nicht vom Modell erraten. Eine Stakeholder-Anforderung ist singulär, wenn ihre Zerlegung ⟨Handlung · Empfänger · Modalität · Bedingung⟩ **genau einen** Wert je Slot ergibt. *„Konzepte und Verfahren … etablieren **und** dokumentieren"* sind damit zwei Anforderungen. Aus einem Analyse-Nebenprodukt wird das Qualitätstor. **Kalibrierung:** Reg2Req erzeugt ~1,1 Anforderungen je Klausel (448 aus 398 DSGVO-Klauseln); unser REQGEN bis zu zehn je Artikel.

## Verworfene Alternativen

| Verworfen | Warum |
|---|---|
| **Erwägungsgrund = Bedarf, Artikel = Anforderung** | Textnah und elegant, aber die Qualitätsmerkmale lägen auf einem Text, den wir nicht ändern können — und Recht→Maßnahme wäre ein Sprung statt zweier Schritte |
| **Gesetz = Constraint** | Trägt für Verbote, nicht für positive Pflichten; Constraints werden in 15288 nicht in Systemanforderungen transformiert |
| **Harmonisierung auf Anforderungsebene** (THE-438-Entwurf) | Verletzt Singularität; ist genau die Zusammenlegung, die die veröffentlichten 35 % erzeugt hat und zurückgenommen werden musste |
| **29148-Merkmale als LLM-Rubrik** | Ein weiteres Modellurteil mit eigenem Kappa-Problem — an vier Tagen viermal erlebt, wohin das führt |
| **Adressatenkreis als Attribut statt Kante** | Die Begründung („welcher Artikel verdrängt warum") ginge verloren, und genau die braucht ein Audit |

## Konsequenzen

- **THE-382 endet** in seiner bisherigen Form: der Paar-Richter war nie das Prüfobjekt, er ist Werkzeug. Weiterverwendet werden vier Typen nach NIST IR 8477 (mit Richtung) als Kantentyp zwischen Systemanforderungen, die Vier-Achsen-Auswahl als Vorfilter, Blendung/Kanarienvögel/Positiv-Kontrolle als Prüfgerüst jeder Stufe, und das blinde Arbeitsblatt — künftig für **fünf** Fälle statt vierzig.
- **THE-438s Definition of Done wird umformuliert:** nicht „eine Pflicht, N Rechtsgrundlagen", sondern „eine Maßnahme, N Anforderungen aus M Gesetzen, jede einzeln nachweisbar".
- **REQGEN bleibt vorerst unangetastet.** Der Umbau ist eine Strangler-Entscheidung des späteren Bau-Tickets, nicht dieser ADR.
- **Das Entscheidungs-Ticket fasst keine Produktionsdaten an** — es liest den Korpus und schreibt versionierte JSON-Artefakte neben die Golden Sets. Trägt die Kette nicht, ist nichts umgebaut.
- **Geprüft wird gegen ein externes Gold:** die fünf SCF-Kandidaten (BCD-01, CRY-01, GOV-02, HRS-03, RSK-01), die die Kette aus dem Gesetzestext **unabhängig wiederfinden** muss. Dazu zwei Negativ-Kontrollen — eine mechanische (NIS2 Art. 23 × DORA Art. 19 muss durch die Verdrängungs-Kante ausscheiden, bevor irgendetwas beurteilt wird) und eine semantische (NIS2 Art. 21 Risikoanalyse × DSGVO Art. 33 Meldung: gleicher Adressat, verschiedene Handlung, keine geteilte Maßnahme).

## Ehrliche Grenzen

- Die Kette ist **nicht gemessen**. Diese ADR hält den Rahmen fest, nicht ein Ergebnis; die tragende Annahme — dass die Überführung in implementierungsfreie Systemanforderungen automatisierbar ist — bleibt bis zum Entscheidungs-Ticket **geglaubt**.
- Das SCF steht unter CC BY-ND: intern als Prüfmaßstab nutzbar, **nicht auslieferbar**. Und die Transitivität „gleiche Kontrolle ⇒ harmonisierbar" ist unsere Folgerung, nicht die Behauptung des SCF.
- Belegt ist ein Ausschnitt aus drei Rechtsakten. Ob der Rahmen über andere Domänen trägt, ist offen.
- Geurteilt wird **Umsetzbarkeit**, nicht Rechtmäßigkeit. Eine gemeinsame Maßnahme entbindet von keiner Rechtsgrundlage — das muss in der UI stehen.
