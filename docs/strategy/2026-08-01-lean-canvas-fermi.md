---
tags: [strategie, geschaeftsmodell, running-lean, lean-canvas, fermi, msc, hybrid-b, alex-key]
status: entwurf-v0.1
datum: 2026-08-01
methode: Running Lean (Ash Maurya, 3. Auflage) — Teil 1 "Design"
---

# Lean Canvas + Fermi-Rechnung — TheArchitect als Firma

> **Zweck.** Das Geschäftsmodell bekommt denselben Prüfmaßstab wie die Rechts-KI: Annahme → Beleg → Entscheidung, mit **vorab** festgelegter Messlatte. Dieses Dokument ist ein **Entwurf aus dem Kopf** (Maurya-Regel: 20 Minuten, beste Vermutung, nicht recherchieren). Alle Zahlen sind Fermi-Schätzungen mit offengelegten Annahmen — **keine Marktforschung**. Sie dienen dazu, ein untragfähiges Modell am Schreibtisch zu erkennen, statt nach zwei Jahren Bau.

---

## TL;DR in drei Sätzen

Das Ziel (500 k € ARR in 3 Jahren) ist rechnerisch erreichbar — es braucht **rund 7–10 zahlende Unternehmen bei 50–70 k € Jahreslizenz**, und dieses Preisniveau liegt im normalen Rahmen für GRC-/EA-Enterprise-Software. Der Engpass ist **nicht der Preis und nicht das Produkt, sondern der Vertriebsdurchsatz**: bei unter 5 Stunden Kundenarbeit pro Woche gibt der Kanal etwa 2–3 Neukunden pro Jahr her, kumuliert also 6–8 statt der nötigen 10 — und bei einem niedrigeren, leichter verkäuflichen Preis wird die Lücke zum Faktor 3. Daraus folgt die zentrale strategische Konsequenz: **der Partner-/Kanzlei-Kanal ist kein unterstützender Kanal mehr, sondern ein tragendes Element des Geschäftsmodells**, und die riskanteste unbelegte Annahme lautet ab sofort nicht mehr „funktioniert die KI", sondern „bringt ein Partner qualifizierte Kunden".

---

## Teil 0 — Minimum Success Criteria (MSC)

Nach Maurya die **erste** Festlegung, und bewusst eine persönliche, keine Marktentscheidung.

| Größe | Festlegung (2026-08-01) |
|---|---|
| **Erfolgsdefinition in 3 Jahren** | ~500 k € ARR, kleines Team (2–4 Personen) |
| **Zeithorizont** | Ende 2029 |
| **Runway ohne nennenswerten Produktumsatz** | 6–12 Monate |
| **Verfügbare Kundenarbeit** (Gespräche, Angebote, Vertrieb — nicht Bauen) | unter 5 h/Woche |

Damit ist die Firma **kein Lifestyle-Vorhaben** (das wäre 150 k € solo) und **kein VC-Fall** (das wäre Exit-getrieben). Sie liegt im Korridor „profitable Produktfirma mit kleinem Team" — was das Modell zwingend skalierbar macht: Variante C (Beratung) kann dieses Ziel **strukturell nicht** erreichen, weil der Umsatz an verkaufte Stunden gekoppelt ist.

---

## Teil 1 — Lean Canvas, drei Varianten

Alle drei verkaufen dasselbe Produkt. Sie unterscheiden sich in **wem** — und das entscheidet über Preis, Vertriebsaufwand und Exit-Wert.

### Variante A — „Nachweis-Fabrik" (Käufer: Governance / Compliance / Risk) — **Primärmodell**

| # | Feld | Inhalt |
|---|---|---|
| 1 | **Problem** | (a) Dieselbe Pflicht steht in DSGVO *und* NIS2 *und* DORA *und* KI-VO — und wird 4× getrennt umgesetzt und nachgewiesen. (b) Im Audit kann niemand belegen, **woher** eine Aussage stammt und ob sie noch gilt. (c) Eine Gesetzesänderung kommt an, ohne dass jemand sagen kann, welche Systeme betroffen sind. |
| — | **Bestehende Alternativen** | Excel + Word + SharePoint · Big4-Mandat je Regulierung · GRC-Tools (OneTrust, Archer, ServiceNow IRM), die Kontrollen verwalten, aber die Architektur nicht kennen |
| 2 | **Kundensegment** | Reguliertes Unternehmen DE/EU, 1.000–20.000 MA, **mehrere Regularien gleichzeitig**.<br>*Early Adopter:* Firma, die gerade eine **neue** Regulierung erstmals umsetzen muss (KI-VO, CRA, DORA) und schon eine laufen hat — der **Stichtag ist der Auslöser** |
| 3 | **UVP** | „**Ein Nachweis, mehrere Gesetze — mit belegbarer Herkunft.**"<br>*High-Level-Concept:* der Notar zwischen Gesetz und Architektur |
| 4 | **Lösung** | Rechtskorpus + Harmonisierungs-Katalog · Requirement-Generierung mit Rechtsgrundlagen-Verweis · Provenance / Version-Lock · Gap→Fix-Schleife · Audit-Export |
| 5 | **Kanäle** | **① Partner/Kanzlei (tragend, siehe Teil 2)** · ② BSH als Referenz · ③ Webinare entlang der Stichtage · ④ LinkedIn |
| 6 | **Einnahmen** | Zweistufig: bezahlter Einführungs-Pilot (15–25 k €, 6–8 Wochen) → Jahreslizenz, gestaffelt nach **Anzahl Regularien × Entitäten** (Einstieg ~25 k €, Vollausbau 70 k €+) |
| 7 | **Kosten** | Zeit (Solo) · VPS/Infra · LLM-API · Korpus-Pflege (Firecrawl) · juristische Validierung · Vertrieb · **Beschaffungsfähigkeit** (siehe Risiken) |
| 8 | **Schlüsselmetrik** | **Erster Audit-Export pro Kunde** (= Aktivierung). Laufend: harmonisierte Pflichten mit belegter Herkunft über ≥ 2 Gesetze |
| 9 | **Unfairer Vorteil** | Gemessener Rechtskorpus mit **eingefrorenen Prüfmaßstäben** + Provenance-Kette (nicht in Wochen kopierbar) · Kanzlei-Validierung als Autorität · Bau-Tempo |

### Variante B — „Lebende EA" (Käufer: Enterprise-/Business-Architekt)

| Feld | Inhalt |
|---|---|
| **Problem** | EA-Modelle sind nach 6 Monaten Fiktion · niemand traut ihnen, also wird daneben entschieden · Pflege ist manuell |
| **Alternativen** | LeanIX/SAP, Ardoq, Bizzdesign · Visio/PowerPoint · Confluence |
| **Segment** | EA-Teams in Konzernen. *Early Adopter:* EA-Team mit LeanIX-Frust oder Erst-Aufbau |
| **UVP** | „Architektur, der man trauen kann, weil jede Aussage ihre Herkunft mitführt" |
| **Einnahmen** | Lizenz pro Nutzer/Jahr — klassisches EA-Tool-Pricing |
| **Befund** | Gedrängter Markt, **diskretionäres** Budget, Verdrängungsverkauf gegen SAP. Als Einstieg schwach — als **Expansion nach A** stark (= „Land über Compliance-Budget, expandiere über Transformation") |

### Variante C — „Beratung mit Werkzeug" (Vergleichsmaßstab, = benanntes Drift-Risiko)

| Feld | Inhalt |
|---|---|
| **Segment** | Identisch zu A — aber verkauft wird ein **Projekt**, keine Lizenz |
| **Einnahmen** | 60–150 k € pro Mandat, hohe Marge, sofort verfügbar |
| **Kosten** | Deine Zeit **ist** das Produkt |
| **Befund** | Erreicht ein Einkommensziel am schnellsten, deckelt bei 1–2 Mandaten gleichzeitig, **kann 500 k € ARR strukturell nicht erreichen**, Exit-Wert ≈ 0. Zulässig als **Runway-Verlängerung**, nicht als Modell (Regel siehe Teil 4) |

---

## Teil 2 — Fermi-Rechnung

### Rechnung 1 — Zielseite: wie viele Kunden bei welchem Preis?

500.000 € ARR geteilt durch die Jahreslizenz:

| Jahreslizenz (ACV) | Nötige aktive Kunden |
|---|---|
| 10 k € | 50 |
| 25 k € | 20 |
| 50 k € | 10 |
| 70 k € | 7 |
| 100 k € | 5 |

*Marktanker (Schätzung):* GRC-Enterprise-Lizenzen liegen typischerweise bei 50–250 k €/Jahr, EA-Tools bei 40–200 k €. **50–70 k € ACV liegen im normalen Rahmen** — das Ziel scheitert also nicht am Preisniveau.

### Rechnung 2 — Angebotsseite: was gibt der Kanal her?

Ausgangsgröße: **unter 5 h/Woche Kundenarbeit.**

| Schritt | Annahme | Ergebnis |
|---|---|---|
| Netto-Gesprächszeit | 5 h enthalten Vorbereitung + Nachfassen + Angebot (Faktor ~3) | ~1 echtes Gespräch/Woche |
| Aktive Wochen/Jahr | Urlaub, Bau-Phasen, Lieferung | ~40 |
| Erstgespräche/Jahr | | **~40** |
| → bezahlter Pilot | 8–12 % (Solo-Anbieter, anfangs ohne Referenz) | **3–5 Piloten/Jahr** |
| → Jahreslizenz | 50–60 % Pilot-Konversion | **2–3 Neukunden/Jahr** |

Kumuliert über 3 Jahre mit realistischem Anlauf und ~10 % Churn:

| Jahr | Neukunden | Aktiv (kumuliert) |
|---|---|---|
| 2027 | 1 (BSH) | 1 |
| 2028 | 2–3 | 3–4 |
| 2029 | 3–4 | **6–8** |

### Zusammenführung — der Befund

**500.000 € ÷ 7 Kunden = ~71 k € erforderlicher ACV.**

Damit sitzt das Modell in einer Zange:

- **Preis niedrig (25 k €, leicht durch die Beschaffung):** braucht 20 Kunden, der Kanal gibt 7 her → **Lücke Faktor 3**
- **Preis hoch (70 k €, Kundenzahl passt):** löst die Beschaffungs- und Lieferantenprüfung eines Konzerns gegenüber einem **Ein-Personen-Anbieter** aus → Zyklen verlängern sich, Deals können vollständig blockieren

**Beide Enden sind gedeckelt.** Mindestens einer der beiden Deckel muss gehoben werden — das ist die eigentliche strategische Frage der nächsten 90 Tage, nicht die nächste Funktion.

### Runway-Kollision (das Dringendste)

| Größe | Wert |
|---|---|
| Runway ohne Produktumsatz | 6–12 Monate |
| Enterprise-Verkaufszyklus (Erstgespräch → unterschriebene Lizenz, reguliert) | 6–12 Monate |

Diese beiden Zahlen sind **identisch**. Das heißt: es existiert **kein Puffer für einen einzigen verlorenen Deal**. Konsequenz: Der **bezahlte Pilot** (15–25 k €, 6–8 Wochen Zyklus) ist nicht optional — er ist gleichzeitig Nachfragebeleg *und* das einzige Cash-Instrument, das schnell genug ist.

---

## Teil 3 — Drei Hebel

**① Partner-/Kanzlei-Kanal wird tragend.** Eine Kanzlei oder mittelgroße Beratung mit 20 regulierten Mandanten liefert in einem Gespräch mehr Trichter als 40 Erstgespräche im Jahr. Der Kanal löst **beide** Deckel gleichzeitig: Durchsatz (partner-led statt founder-led) und Lieferantenrisiko (Vertrauensträger bzw. Vertragspartner steht davor). Die Kanzlei war bisher als *Autorität* gedacht — sie wird jetzt zusätzlich zum *Vertriebsweg*.

**② Preis steigt über Scope, nicht über Funktionen.** Preisachse = *Anzahl Regularien × Entitäten*, nicht Nutzer. Erlaubt Landung bei ~25 k € (eine Regulierung, oft unterhalb der Beschaffungsschwelle) und Expansion auf 70 k €+ **ohne neuen Verkaufszyklus**. Das ist „Land über Compliance-Budget, expandiere über Transformation" — jetzt als Preismechanik statt als Absichtserklärung.

**③ Die erste Einstellung ist kein Entwickler.** Das MSC sagt „kleines Team". Die Rechnung sagt, wofür: Vertrieb/Delivery. Solange nur gebaut wird, bleibt die Kundenarbeit bei unter 5 h/Woche — und damit bleibt der Deckel.

---

## Teil 4 — Regel gegen den Drift nach C

Beratungsumsatz in den nächsten 6 Monaten ist **Runway-Verlängerung, kein Modellwechsel** — unter zwei schriftlichen Auflagen:

1. Alles, was im Mandat gebaut wird, ist **mandantenfähig und generisch**; kundenspezifischer Code wird nicht ins Produkt übernommen.
2. Jedes Mandat erzeugt mindestens **ein belegtes Requirement** für das Produkt (Annahme → Beleg), sonst war es reiner Stundenverkauf.

---

## Teil 5 — Freigabekriterien (vorab festgelegt, wie beim Golden Set)

| Prüfung | Messlatte | Bei Verfehlen |
|---|---|---|
| **90 Tage** | ≥ 1 unterschriebener bezahlter Pilot (≥ 10 k €) **und** ≥ 1 Partnergespräch mit konkreter Mandantenliste | Primärmodell kippen (B oder C primär setzen) |
| **Preis** | in 10 Problem-Gesprächen nennt ≥ 3× jemand ein Budget > 25 k €/Jahr als plausibel | 500 k € in 3 Jahren mit diesem Kanal unerreichbar → MSC oder Kanal anpassen |
| **Problem** | ≥ 6 von 10 nennen **unaufgefordert** Mehrfach-Regulierung oder Nachweisführung unter ihren Top-3-Schmerzen | Problemhypothese fällt → Segment wechseln |
| **Lieferantenrisiko** | ≥ 1 Konzern signalisiert, dass ein Ein-Personen-Anbieter beschaffbar ist (ggf. über Partner) | Partner-Vertragsmodell wird Pflicht, nicht Option |

---

## Teil 6 — Riskanteste Annahmen, neu geordnet

Bisher wurde am intensivsten das **Lösungsrisiko** gemessen (κ, Recall, Freigabeschwellen). Nach dieser Rechnung liegt das größte unbelegte Risiko woanders:

| Rang | Annahme | Status | Test |
|---|---|---|---|
| 1 | Ein Partner/eine Kanzlei bringt qualifizierte Kunden | unbelegt | 3 Partnergespräche in 30 Tagen |
| 2 | Governance/Compliance hat Budget **und** darf es für Software eines Kleinanbieters ausgeben | unbelegt | 10 Problem-Gespräche |
| 3 | Mehrfach-Regulierung wird als **ein** Problem empfunden (nicht als vier Projekte) | unbelegt | Problem-Gespräche, Wortwahl der Kunden |
| 4 | Herkunfts-Nachweis ist ein Kaufgrund, kein Nice-to-have | unbelegt | Mafia Offer, Preisreaktion |
| 5 | Der wirtschaftliche Käufer ist Governance, nicht IT-Security | unbelegt | Problem-Gespräche |
| 6 | Die KI-Qualität reicht | **weitgehend belegt** | läuft bereits |

---

## Offene Punkte

- Canvas-Varianten und Fermi-Ergebnis ins Geschäftsmodell-Projekt in The Architect übernehmen (Projekt `6a3ff887e50cc39a4193802f`) — die 9 gestrichelten Annahmen um die 5 neuen aus Teil 6 ergänzen
- Interview-Leitfaden für die 10 Problem-Gespräche (Running Lean, Story-basiert)
- Mafia Offer / Pilot-Paket schnüren, sobald ≥ 5 Gespräche geführt sind
- Partner-Longlist (Kanzleien + mittelgroße Compliance-Beratungen DE)
