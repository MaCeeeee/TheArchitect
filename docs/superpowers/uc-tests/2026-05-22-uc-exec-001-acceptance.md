# UC-EXEC-001 — 3 Acceptance UseCase-Tests

> Manuell durchspielen im Browser. Pro Test gibt's einen klaren Vor-Zustand,
> Aktionen mit erwartetem Ergebnis und eine Fail-Bedingung. Wenn alle 3 ✅,
> ist UC-EXEC-001 deploy-reif.

**Vorbedingung (einmalig):**
- `npm run dev` läuft (Client http://localhost:3000, API :4000)
- Du bist eingeloggt
- Du hast ein Projekt mit ≥ 30 Elementen (BSH-Demo oder Vergleichbares)
- DB enthält die 16 Regulations aus UC-ICM-001 (`Regulation.countDocuments({}) === 16`)

---

## UC-Test 1: "Happy Path — CIO findet Hotspots & navigiert zur Tiefe"

**Persona:** CIO will in < 5 Sekunden wissen, wo es im Projekt brennt.

**Setup:**
1. Öffne `http://localhost:3000/project/<bsh-demo-id>/analyze`
2. Beobachte: **CIO-Tab muss aktiv sein** (Default)

**Aktionen + Erwartungen:**

| # | Aktion | Erwartet | Fail wenn |
|---|---|---|---|
| 1.1 | Seite lädt | Spinner kurz sichtbar → HeadlineCard + 5 KPI-Cards | Keine Cards, weißer Screen |
| 1.2 | HeadlineCard prüfen | Tone matched die Realität: bei BSH-Demo (5+ kritische) → **roter "critical"** Tone, Title enthält Hotspot-Anzahl | Tone passt nicht zu Hotspot-Count |
| 1.3 | "Critical Hotspots" Card lesen | Zeigt Count + Top-Element-Name (z.B. "Payment Gateway") | "—" oder undefined obwohl Daten existieren |
| 1.4 | Klick auf "Critical Hotspots" Card | Navigiert zu `/analyze/risk` und behält Project-Context | Bleibt auf gleicher Seite oder 404 |
| 1.5 | Browser zurück → CIO-Tab | Cards sofort da, kein erneutes Loading | Spinner erneut sichtbar (Cache nicht greifend) |
| 1.6 | Refresh-Button (oben rechts) klicken | Spinner kurz, gleiche Daten, neuer `generatedAt` Zeitstempel | Daten verschwinden oder Error |

**Pass-Kriterium:** alle 6 Punkte ✅. Cache greift in < 1s beim Tab-Wechsel.

**DevTools-Check (optional):**
```
F12 → Network → exec... → 2 Calls:
  1. /executive-summary               → fromCache: false
  2. /executive-summary?fresh=true    → fromCache: false (mit neuem generatedAt)
```

---

## UC-Test 2: "CFO Cost-Drill-Down + Keyboard-A11y"

**Persona:** CFO öffnet das Dashboard mit Keyboard-Only (Accessibility-Audit).

**Setup:**
1. Gleiches Projekt wie Test 1
2. Tab-Strip via Maus auf **CIO** klicken (default)
3. Fokus mit Tab-Taste in den Tab-Strip bringen

**Aktionen + Erwartungen:**

| # | Aktion | Erwartet | Fail wenn |
|---|---|---|---|
| 2.1 | Pfeil-rechts drücken | CFO-Tab wird selected + fokussiert | Nichts passiert / Focus springt raus |
| 2.2 | Investment Heatmap prüfen | 4 farbige Balken Tier 0–3 mit Element-Counts. Längster Balken = dominanter Tier | Heatmap leer oder Counts negativ |
| 2.3 | "Total TCO" Card | Wert in $M oder $K Format (z.B. "$2.5M"). Subtitel "P10 $A – P90 $B" | "$NaN" oder ungeformatet |
| 2.4 | "Optimization Potential" | Wert ≈ 15% von Total TCO. Subtitel "X% of TCO" passt | Wert > TCO oder negative Prozente |
| 2.5 | "Cost Hotspots" Card | Top-Element-Name + Tier-Badge oben rechts (z.B. "T2"). Klick → `/analyze/cost` | Kein Badge oder Klick navigiert falsch |
| 2.6 | Home-Taste | CEO-Tab wird aktiv | Bleibt auf CFO |
| 2.7 | End-Taste | CFO-Tab wird aktiv | Bleibt auf CEO |
| 2.8 | Pfeil-rechts an Tab-Ende (CFO) | Wrap-Around zu CEO | Stuck auf CFO |

**Pass-Kriterium:** alle 8 Punkte ✅. Tastatur-Navigation flüssig, Heatmap visuell stimmig.

**A11y-Check (DevTools):**
```
Inspect → Tab-Strip-Element → Attributes:
  role="tablist"              ← muss da sein
  aria-label="Executive personas"
  Active Button: aria-selected="true", tabindex="0"
  Inactive Buttons: aria-selected="false", tabindex="-1"
```

---

## UC-Test 3: "CEO Compliance-Story + Stale-Invalidation"

**Persona:** CEO öffnet das Dashboard wegen Compliance-Reporting; während der Session ändern sich die Criticality-Settings (anderer User oder eigene Aktion).

**Setup:**
1. Wechsle zu CEO-Tab (Maus oder Pfeil-links)
2. Notiere `generatedAt` aus DevTools-Network-Response

**Aktionen + Erwartungen:**

| # | Aktion | Erwartet | Fail wenn |
|---|---|---|---|
| 3.1 | "Compliance Coverage" Card | Zeigt z.B. "0%" oder "X%" mit "Y mappings · 16 regulations" als Subtitel | Regulations-Count ist 0 obwohl UC-ICM-001 läuft |
| 3.2 | HeadlineCard Tone | Bei 0% mapping + 16 regulations: **roter "critical"** + Text "Compliance gap critical" | Tone falsch zur Coverage |
| 3.3 | "Strategic Risks" Card | Count + Name eines Driver-Elements (z.B. "EU CSRD") | Driver-Element appears unter CIO/Hotspots statt CEO |
| 3.4 | "Active Initiatives" Card | Anzahl Szenarien + Roadmap-Status (active/draft/completed) | Klick navigiert nicht zu `/analyze/scenarios` |
| 3.5 | Anderes Tab öffnen: Risk Settings | Sidebar → Risk → Settings → Gewicht eines Faktors ändern, speichern | Settings-Save fehlschlägt |
| 3.6 | Zurück zu Analyze-Dashboard CEO | **Automatisches Re-Fetch** (Spinner kurz), neuer `generatedAt` | `generatedAt` bleibt alt (Stale-Invalidation broken) |
| 3.7 | Network-Tab inspizieren | Letzter Call: `/executive-summary?fresh=true` | Nur Original-Call ohne `?fresh=true` |

**Pass-Kriterium:** alle 7 Punkte ✅. Compliance-Story stimmt + Stale-Invalidation funktioniert.

**Realwert-Check (Mongo-CLI):**
```bash
# Auf VPS oder mongosh lokal:
db.regulations.countDocuments()             # → 16 (NIS2 + LkSG + DSGVO)
db.standardmappings.countDocuments({ projectId: ObjectId('<bsh-id>') })
# → muss mit "X mappings" in CEO Compliance-Card matchen
```

---

## Failure-Triage

Wenn ein Test rot wird:

| Symptom | Wahrscheinliche Ursache | Fix-Weg |
|---|---|---|
| Cards leer / undefined | `fetchExecutiveSummary` 500ed oder Network blocked | DevTools Network → Response anschauen |
| HeadlineCard zeigt falschen Tone | `HEADLINE_THRESHOLDS` falsch oder neuer Edge-Case | `executiveSummary.service.ts` → `derive*Headline` |
| Cache greift nicht (jedes Tab-Switch = neuer API-Call) | useExecutiveSummary `useEffect`-Dependency falsch | Hook prüfen: Tab-State darf NICHT triggern |
| Keyboard-Nav broken | `tabIndex`/`aria-selected` falsch | `ExecTabStrip.tsx` → `handleKey` |
| Stale-Invalidation broken | `criticalityStore.computedAt` ändert sich nicht beim Save | criticality-Patch-Endpoint feuert kein store-update |

---

## Sign-Off

- [ ] UC-Test 1: ___/6 grün
- [ ] UC-Test 2: ___/8 grün
- [ ] UC-Test 3: ___/7 grün
- [ ] Datum/Uhrzeit: ____________
- [ ] Tester: ____________

Bei 21/21 → Freigabe für Production-Deploy.
