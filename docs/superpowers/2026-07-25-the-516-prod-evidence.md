# Prod-Nachweis — Discovery Scope-Guarantee (THE-516, ADR-0006 E6 Stufe 2)

**Stand:** 2026-07-25 · **Commit live:** `7f5e3fe` · **Flag:** `LAW_DISCOVERY_SCOPE_GUARANTEE=true` (Server A)
**Projekt:** BSH-ESG-Demo (`69e313db8e1a7d2fac087933`) · **ADR:** `docs/adr/0006-discovery-scope-guarantee.md`

> **Ergebnis: bestanden.** Die Garantie greift bei allen 9 Kandidaten-Familien (`applied`), 17 Geltungs-
> bereichs-§§ wurden injiziert, 6 davon vom Judge zitiert. Die Urteilsqualität steigt nachweisbar: Die
> DSGVO wird nicht mehr über zwei Randartikel begründet, sondern über Art. 1/2 plus die Kernpflichten.
> Kein bestehendes „gilt"-Urteil ist verschwunden (AC-2).

## 1. Der Vorher/Nachher-Beleg (DSGVO, identisches Projekt)

| | vor der Garantie | mit Garantie |
|---|---|---|
| Vom Judge gesichtete §§ | „Datenverarbeitung im Beschäftigungskontext" (Art. 88), „Zertifizierung" (Art. 42) | **„Subject-matter and objectives" (Art. 1), „Material scope" (Art. 2)** + Art. 24, 30, 32 |
| Begründung | „Art. 88 (employment context) und Art. 42 (certification) relevant für Lieferantendaten" | „**Art. 1-2 establish scope** for personal data processing; Art. 24, 30, 32 mandate controller responsibility, processing records, and security controls" |
| Judge-Konfidenz | 72 % | **75 %** |

Vorher urteilte der Judge über die Anwendbarkeit anhand **zweier Spezialvorschriften**, aus denen sich
der Geltungsbereich gar nicht ableiten lässt. Das ist exakt der THE-423-Fehlermodus — nur diesmal bei
der DSGVO statt beim CRA sichtbar.

## 2. Audit-Trail (ContextTrace, 9 Traces)

| Familie | injiziert | zitiert | Urteil |
|---|---|---|---|
| dsgvo-en | art-1, art-2 | **beide ✓** | Applies |
| ai-act-de | art-1, art-2 | **beide ✓** | Applies |
| dora-de | art-2 (nur einer — Art. 1 war bereits in den Treffern ⇒ **Dedupe griff**) | ✓ | Likely applies |
| lksg | § 1, § 22 | § 1 ✓ | Likely applies |
| nis2-de, cra-de, mdr-en, eidas-en, psd2-de | je art-1, art-2 | — | nicht anwendbar |

**Zustände: 9 × `applied`**, kein `partial`, kein `unavailable`. Gesamt: 17 injiziert, 6 zitiert.

**Muster:** Beide Familien mit dem stärksten Urteil („Applies") stützen sich auf **beide**
Geltungsbereichs-Artikel. Der Judge greift sie also gezielt auf, wo er zu einer klaren Aussage kommt —
kein blindes Mitschleppen.

## 3. Drei ehrliche Befunde

**(a) Der CRA gilt weiterhin nicht — und das ist der Punkt.** Unser Ur-Fall aus THE-423 bekam Art. 1
und Art. 2 vorgelegt und urteilt trotzdem „nicht anwendbar". Für ein ESG-Reporting-Modell ohne
Produkte mit digitalen Elementen ist das plausibel richtig. Der Gewinn liegt nicht in mehr Treffern,
sondern in der **Grundlage**: vorher ein Urteil im Blindflug (nur Durchführungs-§§), jetzt ein
informiertes Urteil. Die Garantie erhöht nicht den Recall — sie macht Urteile belastbar.

**(b) Die Garantie ist nur so gut wie die Typisierung darunter.** Bei LkSG wurde neben § 1 auch
**§ 22 („Ausschluss von der Vergabe öffentlicher Aufträge")** injiziert — eine Rechtsfolge, kein
Geltungsbereich. Der Typing-Batch hat ihn falsch gelabelt. Folgenlos (der Judge ignorierte ihn), aber
es materialisiert die gemessene Fehlerrate: `provisionKind` liegt out-of-sample bei F1 0,90 — rund
jeder zehnte Fall ist falsch, und genau solche rutschen dann in die Evidenz. Konsequenz: kein
Auto-Commit, Vorschlags-Status und Messung bleiben Pflicht.

**(c) Dedupe und Dosierung arbeiten wie entworfen.** DORA erhielt nur einen § statt zwei, weil Art. 1
bereits regulär gefunden war; nirgends mehr als 2 §§ (AC-6).

## 4. AC-Status nach dem Prod-Test

| AC | Status | Beleg |
|---|---|---|
| AC-1 CRA-Fixture kippt | ✅ | offline (Eval-Harness); prod: CRA-Urteil bleibt „nicht anwendbar", jetzt aber informiert (§ 3a) |
| AC-2 keine Recall-Regression | ✅ | Gesetzesliste identisch: DSGVO, LkSG, KI-VO, Data Act, NIS2, DORA, ISO 27001 |
| AC-3 Konsumregeln + Flag-aus-Identität | ✅ | Unit-Tests; prod dark bis zur Aktivierung |
| AC-4 Herkunfts-Markierung + Sichtbarkeitsfeld | ✅ | 17 Einträge mit `origin: scope-guarantee`, `scopeGuarantee: applied` im Trace |
| AC-5 unavailable-Alert | ⏳ | Unit-geprüft; real noch nicht ausgelöst (kein Ausfall aufgetreten) — offen |
| AC-6 ≤2 §§/Familie | ✅ | max. 2, teils 1 durch Dedupe |

## 5. Offen

- **AC-5 real auslösen** (Korpus-Lookup künstlich brechen → Alert muss im Ops-Register landen).
- **Typing-Qualität beobachten:** falsch gelabelte scope-§§ (wie LkSG § 22) sind der direkteste
  Nutzen-Hebel für THE-515/tp-3 — jeder Fehler landet ungefiltert in der Evidenz.
- Default-on erst nach längerer Beobachtung; Flag bleibt bewusst explizit gesetzt.
