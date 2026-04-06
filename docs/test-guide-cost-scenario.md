# Transformation Cost & Scenario System — Testanleitung

## Voraussetzungen

- Projekt mit mindestens **5-10 Architektur-Elementen** (Applications, Infrastructure, Business Services)
- Server + Client laufen (`npm run dev`)
- Mindestens ein Projekt geöffnet

---

## Teil 1: Cost Input (Property Panel)

### Test 1.1 — Tier 0 (Kein Input)

1. Element in der 3D-Ansicht anklicken
2. PropertyPanel rechts prüfen
3. **"Cost Input"** Abschnitt suchen (unter Assessment)
4. **Erwartung:** Tier-Badge zeigt **T0** (grau)
5. Abschnitt aufklappen (Pfeil klicken)
6. **Erwartung:** 4 leere Felder sichtbar (Annual Cost, Strategy, Employees, Records)

### Test 1.2 — Tier 1 (Basisfelder)

1. **Annual Cost** eingeben: `120000`
2. **Transformation Strategy** auswählen: `Replatform`
3. **Employees** eingeben: `85`
4. **Records** eingeben: `500000`
5. **Erwartung:** Tier-Badge springt auf **T1** (blau)
6. **Erwartung:** Hinweis zeigt "4/4 basic fields"
7. **Erwartung:** "Advanced (Tier 2)" Toggle erscheint

### Test 1.3 — Tier 2 (Erweiterte Felder)

1. **"Advanced (Tier 2)"** aufklappen
2. Folgende Felder ausfüllen:
   - **KSLOC:** `65`
   - **Tech Fitness:** 3 (dritten Button klicken)
   - **Func Fitness:** 4 (vierten Button klicken)
   - **Error Rate:** `8`
   - **Hourly Rate:** `95`
   - **Infra/mo:** `12000`
   - **TDR (Slider):** ca. 20%
3. **Erwartung:** Tier-Badge springt auf **T2** (gelb/gruen)
4. **Erwartung:** "Probabilistic (Tier 3)" Toggle erscheint

### Test 1.4 — Tier 3 (Probabilistisch)

1. **"Probabilistic (Tier 3)"** aufklappen
2. Felder ausfüllen:
   - **Optimistic (O):** `80000`
   - **Most Likely (M):** `120000`
   - **Pessimistic (P):** `200000`
   - **P(success) Slider:** 85%
   - **CoD/week:** `5000`
3. **Erwartung:** Tier-Badge springt auf **T3** (lila)
4. **Erwartung:** Hinweis zeigt "Monte Carlo enabled"

### Test 1.5 — Mehrere Elemente befüllen

> Für aussagekräftige Szenarien mindestens **3-5 Elemente** mit Tier 1+ Daten versehen.

| Element | Annual Cost | Strategy | Employees | Records |
|---------|------------|----------|-----------|---------|
| ERP System | 250.000 | Replatform | 200 | 2.000.000 |
| CRM App | 80.000 | Rehost | 50 | 500.000 |
| Legacy DB | 150.000 | Refactor | 30 | 5.000.000 |
| Email Server | 20.000 | Retain | 500 | 100.000 |
| Data Warehouse | 180.000 | Relocate | 15 | 10.000.000 |

---

## Teil 2: Cost Optimization

### Test 2.1 — Kostenübersicht

1. In der Sidebar auf **"Analyze"** Tab klicken (BarChart-Icon)
2. **"Cost"** Button klicken
3. **Erwartung:** "Cost Optimization" Panel erscheint mit:
   - **Total TCO** Karte (Summe aller Element-Kosten)
   - **Save Potential** Karte (Optimierungspotenzial)
   - **Tier-Badge** (T0-T3, je nach Datenlage)

### Test 2.2 — Domain-Breakdown

1. **"By Domain"** Abschnitt prüfen
2. **Erwartung:** Farbige Balken pro TOGAF-Domain (Business, Data, Application, Technology)
3. **Erwartung:** Prozentwerte summieren sich auf ~100%

### Test 2.3 — Status-Breakdown

1. **"By Lifecycle Status"** prüfen
2. **Erwartung:** 4 Mini-Karten (Current, Target, Transitional, Retired)
3. **Erwartung:** Kosten pro Status angezeigt

### Test 2.4 — Optimierungsliste

1. **"Optimization Opportunities"** nach unten scrollen
2. **Erwartung:** Bis zu 8 Elemente mit Einsparpotenzial
3. **Erwartung:** Sortiert nach höchstem Einsparpotenzial (absteigend)

---

## Teil 3: Cost Breakdown (7 Dimensionen)

### Test 3.1 — Dimensionsübersicht

1. Unter CostOptimization den **"Cost Breakdown"** Bereich prüfen
2. **Erwartung:** Gesamtkosten (große Zahl in EUR)
3. **Erwartung:** Konfidenzband (z.B. "€84.000 — €156.000") bei Tier 1+

### Test 3.2 — 7 Dimensionen aufklappen

Jede Dimension einzeln anklicken und prüfen:

| # | Dimension | Modell | Farbe |
|---|-----------|--------|-------|
| 1 | Process | ABC + COPQ | Amber |
| 2 | Data Migration | 1-10-100 Rule | Blau |
| 3 | Training & Change | Wright + J-Curve | Lila |
| 4 | App Transformation | COCOMO II + SQALE + 7Rs | Rot |
| 5 | Infrastructure | TCO + FinOps | Cyan |
| 6 | Opportunity Cost | Metcalfe + Delay | Orange |
| 7 | Risk-Adjusted Financial | rNPV + Bayesian | Pink |

**Erwartung pro Dimension:**
- Horizontaler Farbbalken (proportional zum Gesamtanteil)
- EUR-Betrag rechts
- Prozentwert rechts
- Aufgeklappt: Modellname sichtbar

### Test 3.3 — Top Elemente

1. **"Top Elements by Cost"** prüfen
2. **Erwartung:** Sortiert nach Kosten (teuerste oben)
3. **Erwartung:** Tier-Badge pro Element (T0/T1/T2/T3)

---

## Teil 4: Probabilistische Analyse (Monte Carlo)

### Test 4.1 — Voraussetzung prüfen

1. Mindestens 1 Element muss **O/M/P** Werte haben (Tier 3)
2. Falls nicht: Zurück zu Test 1.4

### Test 4.2 — Monte Carlo Simulation

1. Unter CostBreakdown den **"Probabilistic Analysis"** Bereich suchen
2. **Erwartung:** Automatische Simulation startet (10.000 Iterationen)
3. **Erwartung:** Spinner während Berechnung

### Test 4.3 — Ergebnisse prüfen

1. **P10 / P50 / P90 Karten** (3 Spalten):
   - P10 (grün) < P50 (blau) < P90 (rot) — **Reihenfolge prüfen!**
2. **VaR (95%)** — muss >= P90 sein
3. **Std Dev** — muss > 0 sein

### Test 4.4 — Tabs durchklicken

1. **"Overview"** Tab:
   - Mean, Range, Confidence Level sichtbar
   - **"Re-run Simulation"** Button klicken → neue Werte (leicht unterschiedlich)
2. **"Distribution"** Tab:
   - Histogramm mit ~20 Balken
   - Gesamtzahl der Counts = 10.000
3. **"Tornado"** Tab:
   - Sensitivitätsanalyse
   - Element mit größtem O/P-Spread sollte oben stehen

---

## Teil 5: X-Ray Kostenmodus (3D)

### Test 5.1 — X-Ray aktivieren

1. X-Ray Toggle in der HUD/Toolbar aktivieren
2. **Erwartung:** Kamera schwenkt automatisch auf Übersichtsposition
3. **Erwartung:** Grünes + blaues Zusatzlicht erscheint

### Test 5.2 — Cost Sub-View

1. **"Cost"** Sub-View auswählen
2. **Erwartung:**
   - **Kostenbalken** (vertikale Zylinder) unter jedem Element
   - Höhe proportional zu `annualCost`
   - Farbverlauf: grün (günstig) → orange → rot (teuer)

### Test 5.3 — Monte Carlo Ebenen

1. **Erwartung:** 3 transparente horizontale Ebenen:
   - P10 (grün, unten)
   - P50 (blau, mitte)
   - P90 (rot, oben)
2. Pulsierende Animation (Opacity-Wechsel)

### Test 5.4 — Optimierungsringe

1. Elemente mit Einsparpotenzial haben **grüne pulsierende Ringe**
2. Ringgröße proportional zum Optimierungspotenzial

### Test 5.5 — Skalenachsen

1. Links: **"€ Low"** Label
2. Rechts: **"€ High"** Label
3. Horizontale Skalenlinie pro Architektur-Layer

---

## Teil 6: Szenario-Dashboard

### Test 6.1 — Szenario erstellen

1. **"Analyze"** → **"Scenarios"** Tab klicken
2. **"Scenarios"** Sub-Tab ist aktiv
3. Im Textfeld **"Cloud Migration"** eingeben
4. Plus-Button oder Enter drücken
5. **Erwartung:** Neues Szenario erscheint in der Liste
6. Weitere Szenarien erstellen:
   - "Modernisierung"
   - "Cost-Optimized"

### Test 6.2 — Szenario aufklappen

1. Chevron-Pfeil eines Szenarios klicken
2. **Erwartung:** Detailansicht zeigt:
   - P10 / P50 / P90 Kostenschätzungen
   - Dimensionsaufschlüsselung (Top 5)
   - Angewandte Deltas (Änderungen)
   - MCDA Score (falls gerankt)

### Test 6.3 — AI Varianten generieren

1. **"Generate AI Variants"** Button klicken (lila, Sparkles-Icon)
2. **Erwartung:** Spinner "Generating..."
3. **Erwartung:** 3 neue Szenarien erscheinen (z.B. "Cost-Optimized", "Cloud-First", "Risk-Averse")
4. Jedes AI-Szenario hat automatisch berechnete Kosten und Deltas

### Test 6.4 — Real Options (Black-Scholes)

1. Ein Szenario aufklappen (Chevron)
2. **"Real Options (Black-Scholes)"** Button klicken
3. **Erwartung:** Ergebnisse erscheinen:
   - **Option Value** (EUR-Betrag)
   - **Defer Value** (EUR-Betrag, Wert des Abwartens)
   - **Recommendation:** PROCEED (grün) | DEFER (gelb) | ABANDON (rot)

---

## Teil 7: Szenariovergleich

### Test 7.1 — Vergleich starten

1. **"Compare"** Tab klicken
2. **Szenario A:** "Baseline (Current)" belassen
3. **Szenario B:** Ein erstelltes Szenario auswählen (z.B. "Cloud Migration")
4. **"Compare"** Button klicken
5. **Erwartung:** Spinner → Ergebnisse erscheinen

### Test 7.2 — Vergleichsergebnisse prüfen

1. **Cost Delta Karte:**
   - Differenz in EUR (rot = teurer, grün = günstiger)
   - Szenario A Kosten
   - Szenario B Kosten
   - Prozentwert der Änderung
2. **Element Changes:**
   - Added (grün), Modified (gelb), Removed (rot) — Anzahl prüfen
3. **Dimension Deltas:**
   - 7 Balken (pro Dimension)
   - Rot = Kostensteigerung, Grün = Einsparung
   - Nach Größe sortiert

### Test 7.3 — 3D Szenario-Ebenen

1. Bei aktivem Vergleich und X-Ray Mode:
2. **Erwartung:** Zwei transparente Ebenen in der 3D-Szene:
   - Szenario A (blau, unten, Y=-2)
   - Szenario B (cyan, oben, Y=+2)
3. **Delta-Säule** in der Mitte (rot = teurer, grün = günstiger)
4. **7 Dimension-Balken** im Kreis um die Mitte verteilt

---

## Teil 8: MCDA Ranking

### Test 8.1 — WSM Ranking

1. **"Rank"** Tab klicken
2. Methode **"WSM"** auswählen (Weighted Sum Model)
3. Gewichte anpassen:
   - Cost: 30%
   - Risk: 25%
   - Agility: 20%
   - Compliance: 15%
   - Time: 10%
4. **"Rank Scenarios"** klicken
5. **Erwartung:** Alle Szenarien erscheinen sortiert nach Score
6. Rang 1 hat Gold-Badge, Rang 2 Silber
7. Pro Szenario: 5 Kriterien-Balken (Cost/Risk/Agility/Compliance/Time)

### Test 8.2 — TOPSIS Ranking

1. Methode auf **"TOPSIS"** umschalten
2. Gleiche Gewichte belassen
3. **"Rank Scenarios"** erneut klicken
4. **Erwartung:** Reihenfolge kann sich von WSM unterscheiden
5. **Erwartung:** Scores zwischen 0% und 100%

### Test 8.3 — Gewichte variieren

1. **Cost-Gewicht auf 60%** setzen (alle anderen reduzieren)
2. Erneut ranken
3. **Erwartung:** Das günstigste Szenario steigt im Ranking
4. **Risk-Gewicht auf 60%** setzen
5. Erneut ranken
6. **Erwartung:** Das risikoärmste Szenario steigt im Ranking

---

## Teil 9: Compliance-Analyse

### Test 9.1 — DORA Framework

1. **"Compliance"** Tab klicken
2. **"DORA"** Button auswählen
3. Szenario aus Dropdown wählen
4. **"Analyze Compliance"** klicken
5. **Erwartung:**
   - Score in % (farbcodiert: grün ≥80%, gelb 50-80%, rot <50%)
   - 5 Compliance-Bereiche:
     1. ICT Risk Management
     2. Incident Reporting
     3. Digital Resilience Testing
     4. Third-Party Risk
     5. Info Sharing
   - Gap-Anzahl
   - Geschätzte Strafe (EUR)
   - Geschätzte Behebungskosten (EUR)

### Test 9.2 — NIS2 Framework

1. **"NIS2"** auswählen
2. Erneut analysieren
3. **Erwartung:** 7 Bereiche (Risk Mgmt, Incident Handling, Business Continuity, Supply Chain, Encryption, Access Control, Vulnerability Mgmt)

### Test 9.3 — KRITIS Framework

1. **"KRITIS"** auswählen
2. Erneut analysieren
3. **Erwartung:** 6 Bereiche (Availability, Integrity, Confidentiality, Resilience, Incident Response, IT-SiG 2.0)

---

## Teil 10: Automatisierte Tests (Backend)

### Test 10.1 — Alle Unit-Tests ausführen

```bash
cd packages/server
npx jest src/__tests__/cost-engine.test.ts src/__tests__/cost-stochastic.test.ts src/__tests__/cost-scenario.test.ts --verbose --forceExit
```

**Erwartung:** 92/92 Tests bestehen

### Testabdeckung

| Datei | Tests | Abdeckung |
|-------|-------|-----------|
| `cost-engine.test.ts` | 32 | Black-Scholes, Change Saturation, Tier 1/2 Berechnung, Tier 0 Fallback |
| `cost-stochastic.test.ts` | 32 | PERT Monte Carlo, rNPV, WSJF, EVM |
| `cost-scenario.test.ts` | 28 | Shared Constants, MCDA WSM, Delta Types, Cost Profiles, TOPSIS, Compliance |

### Getestete Modelle

| Modell | Tests | Schlüsselprüfungen |
|--------|-------|--------------------|
| Black-Scholes Real Options | 8 | ITM/OTM/ATM, Volatilität, Zeit, Defer-Value |
| Change Saturation | 6 | Unter/Über Kapazität, Custom K, Defaults |
| COCOMO II | 2 | KSLOC-Skalierung, Hourly-Rate-Effekt |
| SQALE/TDR | 1 | Debt-Ratio erhöht Kosten |
| 1-10-100 Data Quality | 1 | Error-Rate erhöht Kosten |
| Wright Learning Curve | 1 | Training-Dimension > 0 |
| PERT Monte Carlo | 12 | P10<P50<P90, VaR≥P90, Histogramm, Varianz |
| rNPV | 5 | Diskontierung, kumulative Wahrscheinlichkeit |
| WSJF | 7 | CoD/jobSize, Sortierung, CD3 |
| EVM | 8 | CPI, SPI, EAC=BAC/CPI, ETC, VAC |
| WSM (MCDA) | 5 | Normalisierung, Gewichtung, Invertierung |
| TOPSIS | 4 | Vektornorm, Closeness 0-1, Ideal/Worst |
| 7Rs Multipliers | 3 | Alle 7 Strategien, Ordnung |
| Industry Defaults | 2 | DACH-Rate, Wright-Rate |

---

## Manuelles Testscript (Kurzfassung)

```
SCHRITT 1: Projekt öffnen (mind. 5 Elemente)
SCHRITT 2: Element auswählen → PropertyPanel → Cost Input
SCHRITT 3: Tier 1 Felder füllen (AnnualCost, Strategy, Employees, Records)
SCHRITT 4: Tier 2 aufklappen + füllen (KSLOC, Fitness, ErrorRate, etc.)
SCHRITT 5: Tier 3 aufklappen + O/M/P füllen
SCHRITT 6: Schritte 2-5 für 4 weitere Elemente wiederholen
SCHRITT 7: Analyze → Cost → CostOptimization prüfen
SCHRITT 8: CostBreakdown → 7 Dimensionen aufklappen
SCHRITT 9: ProbabilisticCost → P10/P50/P90 + Histogramm + Tornado
SCHRITT 10: X-Ray → Cost View → 3D Balken + MC-Ebenen prüfen
SCHRITT 11: Analyze → Scenarios → 3 Szenarien erstellen
SCHRITT 12: AI Variants generieren (Button)
SCHRITT 13: Real Options für ein Szenario analysieren
SCHRITT 14: Compare Tab → A vs B vergleichen → Deltas prüfen
SCHRITT 15: Rank Tab → WSM ranken → Gewichte ändern → TOPSIS
SCHRITT 16: Compliance Tab → DORA / NIS2 / KRITIS testen
SCHRITT 17: Backend-Tests: npx jest --verbose (92/92 bestanden)

FERTIG — alle 6 Phasen getestet.
```
