# Equity-Bewertung als Motivation-Layer — Sidequest-Skizze (Rheinmetall)

**Datum:** 2026-07-09 · **Status:** Demo/Proof-of-Concept, kein Sprint-Backlog
**Projekt in The Architect:** `6a507da4afe2e8bae18ca4dc` — "Equity-These — Rheinmetall 2030 (Demo)"
**Artefakte:** `scratchpad/model-rheinmetall.json` (Modell) · `scratchpad/mc-rheinmetall.mjs` (Monte Carlo)

## Frage

Kann The Architect eine börsennotierte Firma bewerten — im Sinne von: *Welche
Voraussetzungen (Requirements/Constraints) müssen wahr werden, damit die Firma
einen bestimmten Wert erreicht, und lässt sich das simulieren?*

## These

Ja — nicht als Kursprognose, sondern als **Expectations Investing** (Mauboussin):
Der Kurs ist eine Menge impliziter Erwartungen. Die Frage ist nicht "was ist die
Firma wert", sondern "was muss alles eintreten, damit Wert X gerechtfertigt ist —
und wie viel trägt jede Voraussetzung?". Das ist strukturell exakt ein
Motivation-Layer-Modell.

## Mapping Finanz → ArchiMate

| Finanz-Konzept | ArchiMate-Element |
|---|---|
| Zielbewertung (Marktkap. 2030) | **Goal** |
| Finanz-KPIs (Umsatz, Marge, Multiple) | **Outcomes** (multiplikativ verknüpft) |
| Werttreiber (Geopolitik, NATO-Budget) | **Driver** (+), Entspannung als Driver (−) |
| Operative Voraussetzungen | **Requirements** (assumption) |
| Regulatorik, Physik, Kapital, Wettbewerb | **Constraints** |
| Belegte Fakten (Backlog, Quartalszahlen) | **Assessments** (validated) |
| Werthebel-Gewicht (+/−) | **Influence-Relationships** mit Label |

Assumption-vs-validated nutzt das bestehende Encoding: validierte Fakten
(`status: current`, `assumption: false`) vs. Hypothesen (`status: target`,
`assumption: true`). Im Modell: 16 validiert, 12 Annahme.

## Ergebnis Rheinmetall (Datenstand 09.07.2026)

**Marktdaten:** Kurs €1.016, ~46 Mio. Aktien → Marktkap. ~€46,7 Mrd (−44% vom Hoch
nach dem F126-Fregatten-Storno am 24.06.2026).

**Managementplan voll geglaubt** (Umsatz €50 Mrd, Marge 20,5%, P/E 18):
Marktkap. 2030 ≈ €126 Mrd ≈ €84 Mrd heute diskontiert (9,5% p.a.) ≈ **€1.824/Aktie**.

**Monte Carlo, 100.000 Pfade** (Regime-Switch + unabhängige Execution-Shocks):

| Perzentil | Fairer Wert je Aktie |
|---|---|
| P10 | €496 |
| P25 | €697 |
| **P50** | **€1.100** |
| P75 | €1.409 |
| P90 | €1.671 |

→ Der aktuelle Kurs €1.016 liegt am **44. Perzentil** der These: Der Markt preist
knapp die halbe Story ein — konsistent mit "strukturelles Wachstum ja, aber
Ausführungs- und Regime-Risiko sichtbar eingepreist".

**Sensitivität — Δ P50 je Voraussetzung** (Werthebel = was bricht, wenn es fällt):

| Voraussetzung | Δ P50 bei Ausfall | P(Ausfall) |
|---|---|---|
| Entspannungs-Regime (Driver −) | **−€720** | 30% |
| R1 Kapazitätsausbau | **−€289** | 20% |
| R3 Win-Rate / Auftragseingang | −€89 | 25% |
| R2 Backlog-Konversion | −€67 | 25% |
| R5 Naval-Integration | −€46 | 30% |

Der größte Einzelhebel ist **kein Requirement, sondern der Regime-Driver** — er
trifft Umsatz *und* Multiple gleichzeitig (korrelierter Tail). Unter den
steuerbaren Requirements ist der **Kapazitätsausbau (R1)** der neuralgische Punkt:
~28% des aktuellen Kurses hängen an dieser einen Annahme.

## Was schon im Produkt liegt (~80% Reuse)

Monte-Carlo-Engine (Automotive-E2E), Szenario-/Oracle-Engine, Kritikalitätsanalyse
(UC-CRIT-001 = neuralgische Punkte in der Equity Story), Kosten-/Zahlen-Annotation
an Elementen, Neo4j-Abhängigkeitskette, Compliance-Crawler als Constraint-Feed.
Der stärkste Fit ist das **Heartbeat-Prinzip**: Flippt ein Requirement von Annahme
auf validiert/gescheitert → These wird automatisch neu bewertet. Das kann kein
statisches Excel-DCF.

## Was ehrlich fehlt

1. **Bewertungsmathematik** (DCF/Multiples) als Aggregationsschicht über dem Baum —
   überschaubar, ist Mathe, keine Magie. Der MC-Prototyp zeigt die Schicht.
2. **Marktdaten-Connector** (Kurse, Konsens, Fundamentaldaten) — aktuell manuell/Websuche.
3. **Kalibrierung**: Wahrscheinlichkeiten an Requirements sind subjektiv. MC über
   Bandbreiten mildert, löst es nicht (garbage in, garbage out).
4. **Korrelationen**: Werttreiber sind nicht unabhängig. Der Prototyp adressiert das
   nur grob über den Regime-Switch; naives MC unterschätzt sonst die Tails.

## Fazit

Als *Kursprognose* schlägt es den Markt nicht (kann niemand mit öffentlichen Daten).
Der Wert liegt woanders: Heute lebt jede Equity Story in einem Excel mit versteckten
Annahmen. The Architect macht daraus einen **auditierbaren Graphen mit Provenance** —
welche Annahme trägt wie viel Wert, was ist belegt, was bricht wenn Requirement X
fällt, und automatisches Re-Scoring wenn sich die Welt ändert. Das ist die
**Trust-Spine** (Notar-Prinzip), angewandt auf ein Investment Committee statt ein
Architecture Board. Zielgruppe: Equity Research / PE Due Diligence / Strategie —
nicht Retail.

Nebeneffekt: sauberer Beleg, dass die Plattform nicht nur regulation-agnostisch,
sondern **domänen-agnostisch** ist (derselbe Motivation-Layer trägt EA *und*
Finanz-Thesen).
