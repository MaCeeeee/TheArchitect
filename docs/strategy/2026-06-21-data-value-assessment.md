# Daten-Wert-Bemessung — die Wert-Hälfte der Trust-Spine

> **Status:** Strategy-Seed, **NICHT** Sprint-Backlog. Denkrahmen, der die Trust-Spine um ihre fehlende zweite Hälfte ergänzt. Analog zu [`2026-05-06-predictive-architecture.md`](./2026-05-06-predictive-architecture.md): freilegen, verbinden, später ggf. zu UC promoten.
> **Trigger:** Founder bringt Vorlesungsnotiz „Daten-Wert-Bemessung" (18.04) ein und verknüpft sie mit dem laufenden Vorhaben *„Daten abgreifen und mappen"* (Connector-/MCP-Strategie) — 2026-06-21.
> **Companion:** [`2026-06-21-trust-spine.md`](./2026-06-21-trust-spine.md) (die Vertrauens-Hälfte) · [`2026-05-06-predictive-architecture.md`](./2026-05-06-predictive-architecture.md) (Reuse/Similarity).

---

## 1. Der Vorlesungs-Rahmen (rekonstruiert)

Aus der handschriftlichen Notiz:

- **Durchgängigkeit** von der Strategie zur Umsetzung (Traceability)
- Capability-Bezüge: **U-015 Künstliche Intelligenz**, **U-068 Data Governance & Management**
- **13 Datendomänen**, in denen Daten gruppiert werden
- Datengetriebene Innovation: *erkennen → wo liegt das Problem*
- Leitsatz: **„Wenn ich nur wüsste… dann könnte/würde ich"**
- **Kontext-Matrix** (die Kern-Idee):
  ```
                    Kontext
   Datenentstehung  ←——————→  Datennutzung
      Anwendung     ←——————→  Anwendung
     Stakeholder    ←——————→  Stakeholder
  ```
- **Innovation durch Wiederverwendung und Re-Kombination**

**Kern-These der Vorlesung:** Der Wert von Daten ist nicht intrinsisch, sondern **kontextuell** — er entsteht im *Fluss* von der Entstehung zur Nutzung, über Anwendungs- und Stakeholder-Grenzen hinweg. *„Wenn ich nur wüsste, dann könnte ich"* = der Wert eines Datums ist die **Handlung/Entscheidung, die es freischaltet.**

---

## 2. Mapping auf TheArchitect

| Vorlesung | TheArchitect / Trust-Spine |
|---|---|
| **Datenentstehung** | `provenance` + `source` (UC-PROV-001 / THE-320) — *die* Erfassung der Entstehung |
| **Datennutzung** | Graph-Kanten (`CONNECTS_TO`); bei `ai_agent`-Elementen schon `dataSources[]` / `outputTargets[]` = Entstehung→Nutzung auf Element-Ebene |
| **Kontext** | der gesamte Graph (Layer, Connections, Compliance-Mappings) |
| **Stakeholder ←→ Stakeholder** | Motivation-Layer (Stakeholder-Elemente) |
| **Wiederverwendung & Re-Kombination** | Similarity/Redundanz ([`predictive-architecture`](./2026-05-06-predictive-architecture.md), UC-SIM/UC-RED) |
| **„Wenn ich nur wüsste, dann könnte ich"** | **= die Delegations-These wortwörtlich** („Du hast eine Idee — ich verwirkliche sie") |

Der letzte Punkt ist der Treffer: die Vorlesung liefert die **akademische Begründung** für die Produkt-These. Daten-Wert = freigeschaltete Handlung.

---

## 3. Die zentrale Unterscheidung: Vertrauen ≠ Wert

Zwei verschiedene Fragen, die oft verwechselt werden:

- **Trust-Spine** beantwortet: *„Kann ich mich auf dieses Datum verlassen?"* (Provenance, Konfidenz, Notar)
- **Daten-Wert-Bemessung** beantwortet: *„Was ist dieses Datum wert?"*

Vertrauen ist ein **notwendiger Input** für Wert — man kann nicht bewerten/wiederverwenden, was man nicht zurückverfolgen kann (Garbage-in bei der Re-Kombination). Aber Vertrauen ist nicht der ganze Wert:

> **Wert = f(Vertrauen, Nutzung, Wiederverwendbarkeit, Kontext)**

Die Trust-Spine liefert den ersten Term. Die Vorlesung liefert die anderen drei. Zusammen: **„verlässlich UND wertvoll".**

---

## 4. Der Daten-Layer ist genau das, was wir jetzt bespielen

> **Founder-Einsicht 2026-06-21:** *„Es ging [in der Vorlesung] um den Daten-Layer — aber genau das versuchen wir jetzt zu bespielen: Daten abgreifen und mappen."*

Das ist der Scharnier-Punkt. Der Daten-Layer ist die Schicht, die **zuerst** von hand-gebaut zu maschinell-bespielt kippt — Connectors (SAP/ServiceNow/n8n, siehe Connector-Roadmap) und perspektivisch MCP **greifen Daten ab** und **mappen** sie in den Architektur-Graphen.

Und genau dieser Vorgang IST die Kontext-Matrix der Vorlesung:

```
   abgreifen           mappen
  (Datenentstehung) → (Datennutzung)
  provenance=          Kanten in den
  mcp_discovered/      Architektur-Graphen
  import + source      (Apps, Capabilities,
                        Stakeholder)
```

- **Abgreifen** = Datenentstehung → wird von `provenance` + `source` festgehalten
- **Mappen** = Datennutzung → die neue Kante, die das abgegriffene Datum in einen Anwendungs-/Stakeholder-Kontext stellt
- Der **Wert** entsteht im Mapping: ein in Kontext A abgegriffenes Datum wird wertvoll, sobald es in Kontext B genutzt/re-kombiniert wird

→ Konsequenz: Weil der Daten-Layer als erster self-populating wird, fällt dort das Default-Vertrauen zuerst (vgl. Trust-Spine §3) **und** greift dort der Wert-Rahmen am direktesten. Der Daten-Layer ist die Pilot-Schicht für beide Hälften.

---

## 5. Warum Provenance das Fundament für BEIDE Hälften ist

Die ursprüngliche Frage war: *„Trackt ihr Provenance? Wenn ja → UI-Projekt (Surfacing). Wenn nein → Daten-Modell-Projekt, das eigentliche Fundament-UC vor allem anderen."* Antwort war **nein** → daraus wurde THE-320.

Die Daten-Wert-Linse bestätigt das **doppelt**:

| | Braucht Provenance, weil… |
|---|---|
| **Vertrauen** | man nur delegiert/zertifiziert, was man zurückverfolgen kann |
| **Wert** | man nur bewerten/wiederverwenden/re-kombinieren kann, dessen Entstehung + Konfidenz man kennt |

Provenance ist also nicht nur das Fundament der Trust-Spine, sondern auch das Fundament der Daten-Wert-Bemessung. **Ein Atom, zwei Werttreiber.** Das erhöht den strategischen BizRisk-Score von THE-320 nachträglich (mehr hängt dran als beim Scoring angenommen).

---

## 6. Die Lücke, die das offenlegt

TheArchitect misst heute **Kosten** (Cost-Engine: `annualCost`, TCO, capex/opex) — aber **nicht Wert**. Das ist die andere Seite derselben Münze, und sie fehlt im Produkt. „Business Value Mapping / Value Realization Tracking" steht bereits unbespielt im BP_Javis-Feature-Katalog (Tab 7).

**Wert-Metrik — jetzt literatur-gestützt** (Recherche 2026-06-21, siehe §6b). Laney-BVI-inspirierter, graph-nativer Element-Wert-Index:

```
ElementWert ≈  Relevanz        (Kanten zu Business-/Motivation-Layer)        Laney BVI: Relevance(p)
             × Zentralität     (PageRank/Betweenness)                        Moody "Nutzung" + Data Shapley
             × Scarcity/Reuse  (Qdrant cross-project similarity)             Laney IVI: Scarcity + Moody-Reuse
             × Aktualität      (updatedAt / lastActiveDate)                   Laney BVI: Timeliness
             × Konfidenz       (UC-PROV / THE-320)                            Validity-Proxy
```

Bemerkenswert: **vier von fünf Faktoren sind im Graphen bereits messbar.** Zentralität = PageRank/Betweenness (Cost-Engine, [[progress_uc_red_002_structural]]). Reuse/Scarcity = Qdrant-Similarity. Aktualität = vorhandene Timestamps. Konfidenz = UC-PROV (THE-320). Es fehlt nur die **Wertungs-Schicht obendrauf** — kein neuer Datenbestand.

---

## 6b. Literatur-Fundament (Recherche 2026-06-21)

Es gibt **keine** einzelne kanonische Formel, sondern vier etablierte Schulen. Sie konvergieren erstaunlich gut auf die Faktoren in §6.

### Schule 1 — Value of Information / EVPI (Entscheidungstheorie, Ronald Howard)
> **EVPI = E[max Nutzen *mit* perfekter Info] − max E[Nutzen *ohne*]**

Der Wert von Information = die bessere Entscheidung, die sie freischaltet. **Das ist der Vorlesungs-Leitsatz *„Wenn ich nur wüsste, dann könnte ich"* als Gleichung.** Philosophischer Anker, pro-Element schwer zu rechnen, aber das „Warum".

### Schule 2 — Doug Laney, *Infonomics* (das Standardwerk, 6 Formeln)
**Foundational (relativ):**
- **IVI** Intrinsic = Validity × Scarcity × Coverage × Useful Life
- **BVI** Business = Relevance(p) × Validity × Coverage × Timeliness
- **PVI** Performance = (KPI_mit / KPI_ohne) × (T/t)

**Financial (absolut):**
- **CVI** Cost = (ProcessExpense × Attrib) × (T/t)
- **EVI** Economic = (Revenue_mit − Revenue_ohne − DataCost) × (T/t)
- **MVI** Market = (ExclusivePrice × #Licenses) / Premium

→ **BVI** und **IVI** sind die graph-nahen Modelle. PVI braucht A/B-Kontrollgruppen (heute nicht). EVI liegt nah an der bestehenden Cost-Engine.

### Schule 3 — Moody & Walsh (1999), *7 Laws of Information*
Daten-Wert **steigt mit Nutzung und Teilung** (Information ist nicht-erschöpfbar, unendlich teilbar). → akademische Begründung für *„Innovation durch Wiederverwendung und Re-Kombination"*. **Reuse = Wert-Multiplikator.**

### Schule 4 — Data Shapley (Ghorbani & Zou, ICML 2019)
Wert eines Datums = durchschnittlicher **Grenzbeitrag** (Shapley/Spieltheorie) zum Gesamtergebnis. Graph-Analog = **Betweenness-Zentralität** (wieviel Fluss läuft durch das Element) — bereits in der Cost-Engine vorhanden.

### Mapping-Konvergenz
| Faktor in §6 | gestützt durch | im Graph |
|---|---|---|
| Relevanz | Laney BVI `Relevance(p)` | Kanten zu Business/Motivation ✅ |
| Zentralität/Nutzung | Moody (Nutzung↑Wert) + Data Shapley | PageRank/Betweenness ✅ |
| Scarcity/Reuse | Laney IVI `Scarcity` + Moody (Teilung) | Qdrant-Similarity ✅ |
| Aktualität | Laney BVI `Timeliness` | `updatedAt`/`lastActiveDate` ✅ |
| Konfidenz | Laney `Validity`-Proxy | UC-PROV / THE-320 ⟵ Fundament |

**Surveys zur Vertiefung:** Coyle (2024, *Journal of Economic Surveys*); *Harvard Data Science Review* 5.1 (2023) „A Review of Data Valuation"; OECD (2022) „Measuring the Value of Data and Data Flows"; *JDIQ* (2024) „Quantitative Data Valuation Methods: A Systematic Review and Taxonomy".

---

## 7. Abgrenzung / Scope

- Die Vorlesung kommt aus der **Daten-Governance-Welt** (13 Datendomänen, U-068, DAMA-artig). TheArchitect modelliert *Architektur*, keinen rohen Daten-Katalog.
- Überlapp ist stark auf **(a)** dem Data-Object-Layer (TOGAF Data Architecture) und **(b)** den Meta-Prinzipien (Provenance, Vertrauen, Reuse, Kontext-Graph) — **nicht 1:1** auf der „13-Domänen-Katalog"-Ebene.
- Ein „Daten-Wert-Bemessung als vollwertiges Feature" wäre ein bewusster **Scope-Schritt** (Richtung Data-Catalog-Funktionalität), kein Selbstläufer aus dem Bestehenden.

---

## 8. Status & nächste Schritte

**Seed, kein Backlog.** Kein UC, kein Linear-Issue. Festgehalten, weil es:
1. die Trust-Spine konzeptionell vervollständigt (Vertrauen + Wert),
2. den strategischen Wert von THE-320 (Provenance) nachträglich erhöht — es trägt *zwei* Werttreiber, nicht einen,
3. eine messbare Metrik andeutet, die fast vollständig auf vorhandener Graph-Infrastruktur aufsetzt.

**Offene Frage — BEANTWORTET (Recherche 2026-06-21):** Die Vorlesungs-Formel lag nicht vor, aber die Literatur liefert vier (§6b). Ergebnis: ein **UC-VALUE-001 ist machbar** als Laney-BVI-inspirierter, graph-nativer Element-Wert-Index — 4 von 5 Faktoren sind bereits berechenbar, der fünfte ist THE-320. Die verbleibende Entscheidung ist nicht mehr „gibt es eine Formel?", sondern **„welche Treue?"**: Laney-*inspiriert* (graph-nativ, gut machbar) vs. Laney-*originalgetreu* (braucht Validity/Coverage/KPI-Inputs = Daten-Katalog-Scope-Schritt).

**Reihenfolge unverändert:** Erst die Trust-Spine (Provenance → Naming-Entscheidung → THE-320). Die Wert-Hälfte ist explizit *danach* — sie konsumiert dieselben Atome. Wenn promotet: UC-VALUE-001 als Konsument von THE-320, gestützt auf §6b.

---

## Quellen (Recherche 2026-06-21)

- Laney, *Infonomics* (IVI/BVI/PVI/CVI/EVI/MVI-Formeln) — [showmethedata.blog](https://showmethedata.blog/how-to-measure-the-value-of-data) · [Infonomics PDF](https://static1.squarespace.com/static/5699038c3b0be3b876587b6f/t/5ce33b53362fa200016b8c4e/1558395735709/Infonomics.pdf) · [Data valuation (Wikipedia)](https://en.wikipedia.org/wiki/Data_valuation)
- EVPI / Value of Information — [Analytica Docs (EVI/EVPI/ESVI)](https://docs.analytica.com/index.php/Expected_value_of_information_--_EVI,_EVPI,_and_ESVI)
- Moody & Walsh (1999), *Measuring the Value of Information — An Asset Valuation Approach* — [ResearchGate PDF](https://www.researchgate.net/profile/Faris_Alshubiri/post/How_to_determine_information_asset_value/attachment/59d6278679197b8077985d05/AS:326144877449217@1454770408208/download/1000.pdf)
- Ghorbani & Zou (2019), *Data Shapley* — [arXiv:1904.02868](https://arxiv.org/abs/1904.02868)
- Surveys: Coyle (2024) [J. Economic Surveys](https://onlinelibrary.wiley.com/doi/full/10.1111/joes.12585) · [Harvard Data Science Review 5.1 (2023)](https://hdsr.mitpress.mit.edu/pub/1qxkrnig) · [OECD (2022)](https://www.oecd.org/content/dam/oecd/en/publications/reports/2022/12/measuring-the-value-of-data-and-data-flows_2561fe7e/923230a6-en.pdf) · [JDIQ (2024) Taxonomy](https://dl.acm.org/doi/10.1145/3736178)
