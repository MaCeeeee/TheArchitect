---
name: arxiv-radar
description: Nightly arXiv cs.AI radar for TheArchitect. Scrapes https://arxiv.org/list/cs.AI/recent via the n8n scrape service (workflow E9UENkFozWHlKc4U), scores each paper on TheArchitect-Feature-Fit (EA/TOGAF, Governance, Dependency-Graph/Neo4j, AI-Copilot/MCP, 3D-Visualisierung, Umsetzbarkeit), and for high scorers creates Linear issues in team THE plus a daily digest. Use when the user asks to run the arXiv radar, find new AI papers relevant to TheArchitect, or when triggered on a nightly schedule.
---

# arXiv Radar für TheArchitect

Jede Nacht die neuesten cs.AI-Arbeiten von arXiv einlesen, gegen die
Produktvision von **TheArchitect** scoren und die relevantesten Papers als
Linear-Issues (Team **THE**) sowie als Tages-Digest ausspielen.

Ziel: Arbeiten finden, die einen **TheArchitect-Usecase unterstützen oder
verbessern** könnten — z.B. natürlichsprachige Modellabfrage (THE-341),
MCP-Server (THE-339), Neo4j-Abhängigkeitsanalyse, TOGAF-Governance oder
3D-Visualisierung.

## Wann diese Skill nutzen

- Nächtlicher Scheduled-Task „arXiv Radar".
- Nutzer fragt: „Was gibt es Neues auf arXiv für TheArchitect?", „lauf den
  arXiv-Radar", „interessante AI-Papers für unseren Usecase".

## Feste Parameter

- **Quelle:** `https://arxiv.org/list/cs.AI/recent`
- **Scrape-Service:** n8n-Workflow `E9UENkFozWHlKc4U` („Scrape Service (Firecrawl-Ersatz)")
- **Linear-Team:** `TheArchitect`, Team-ID `404e1657-492d-464b-9938-895025058d94`, Präfix `THE`
- **Labels (Team THE):**
  - `Radar` = `1af5e732-6336-4c88-863e-81301df5f642` (**immer** setzen)
  - `Feature` = `7e8377da-bfb4-4c11-82fa-7956f3432d0a`
  - `Improvement` = `73121c25-236c-4477-96ea-5caf32517f02`
  - `Requirement` = `4671acf1-baab-401f-ab19-c381aa50169e`
- **Scoring-Modus:** TheArchitect-Feature-Fit (siehe unten)
- **Issue-Schwelle:** Gesamtscore **> 75 / 100** → Linear-Issue anlegen
- **Digest:** immer schreiben nach `/Users/mac_macee/javis/reports/arxiv-radar/YYYY-MM-DD.md`

## Scrapen — so wird der n8n-Service aufgerufen

Firecrawl wird **nicht mehr** verwendet. Gescrapt wird über den n8n-Workflow
`E9UENkFozWHlKc4U`. Er nimmt eine oder mehrere URLs entgegen und liefert pro
Seite sauberes Markdown plus Metadaten.

**Aufruf (zwei MCP-Calls):**

1. `execute_workflow` mit
   - `workflowId: "E9UENkFozWHlKc4U"`
   - `executionMode: "production"` (Fallback `"manual"`, solange der Workflow
     in n8n noch nicht aktiviert ist)
   - `inputs: { type: "webhook", webhookData: { method: "POST", body: { urls: [...], onlyMainContent: true, formats: ["markdown"] } } }`

   Der Call gibt sofort eine `executionId` zurück, **ohne** auf das Ergebnis zu
   warten.

2. `get_execution` mit `workflowId`, der `executionId`, `includeData: true` und
   `nodeNames: ["HTML to Markdown"]`. Falls der Status noch `running` ist, kurz
   erneut abfragen.

**Antwortformat** (im Output der Node `HTML to Markdown`):

```json
{
  "success": true,
  "count": 2,
  "scrapedAt": "2026-07-25T17:00:00.000Z",
  "results": [
    { "markdown": "...", "metadata": { "title": "...", "sourceURL": "...", "statusCode": 200 } }
  ]
}
```

`results` ist **positionsgleich** mit den gesendeten `urls`. Fehlgeschlagene
Seiten haben ein Feld `error` und leeres `markdown`.

**Wichtig:**

- Bis zu **50 URLs pro Call** — mehrere Seiten also in *einem* Call bündeln,
  nicht einzeln nacheinander. Der Workflow drosselt selbst (3 Requests pro
  Batch, 1200 ms Pause).
- Query-Parameter bleiben erhalten, Pagination (`?skip=…&show=…`) funktioniert.
  Das eingebaute `web_fetch` **nicht** verwenden: es folgt einem Redirect und
  verwirft dabei die Query-Parameter, liefert also für jede Seite denselben
  Inhalt.
- Kein JavaScript-Rendering. Bei leerem `markdown` trotz `statusCode: 200` lädt
  die Seite ihre Inhalte per JS — dann abbrechen statt raten.

## Ablauf

### Schritt 1 — Neueste Einträge scrapen

Scrape-Service (siehe oben) mit
`urls: ["https://arxiv.org/list/cs.AI/recent?skip=0&show=100"]`,
`onlyMainContent: true`, `formats: ["markdown"]`.

Aus dem Markdown nur den **obersten Datumsblock** verwenden (die neueste
„### <Wochentag>, <Datum>"-Sektion). Pro Eintrag parsen:

- **arXiv-ID** aus `arXiv:XXXX.XXXXX`
- **Titel** aus der Zeile nach `Title:`
- **Subjects** aus der `Subjects:`-Zeile (Cross-Listings verraten Domäne)
- **Abstract-URL** = `https://arxiv.org/abs/<ID>`

Die Listing-Seite enthält **keine Abstracts** — nur Titel + Subjects. Das
Erst-Scoring läuft auf Titel + Subjects.

### Schritt 2 — Erst-Scoring (Titel + Subjects)

Jede der sechs Dimensionen 0–5 bewerten, dann gewichten. Nutze die
Stichwort-Lexika als Anhaltspunkt, aber bewerte **semantisch** (nicht nur
Keyword-Match).

| # | Dimension (Gewicht) | Worauf achten / Stichwörter |
|---|---|---|
| D1 | **Usecase-Fit EA/TOGAF/Governance** (×5) | enterprise architecture, TOGAF, ArchiMate, capability model, governance, compliance, ADR, risk, audit, policy, requirements traceability |
| D2 | **Dependency-Graph / Knowledge-Graph / Neo4j** (×5) | knowledge graph, graph reasoning, dependency analysis, ontology, Cypher, graph neural network, impact analysis, GraphRAG, schema |
| D3 | **AI-Copilot / LLM-Agents / MCP / NL-Query** (×4) | LLM agent, tool use, MCP, natural language to query/SQL/Cypher, text-to-graph, RAG, copilot, multi-agent, function calling, planning |
| D4 | **3D- / Interaktive Visualisierung** (×2) | 3D scene, graph layout, visualization, spatial, rendering, interactive exploration, force-directed |
| D5 | **Umsetzbarkeit / praktischer Ansatz** (×2) | code/repo verfügbar, benchmark, library, framework, reproducible, method vs. rein theoretisch |
| D6 | **Reife / Signal** (×2) | akzeptiert bei Top-Venue (ICML/NeurIPS/KDD/…), Journal-ref, benchmark released, klare Anwendbarkeit |

**Score-Formel** (max = 5×(5+5+4+2+2+2) = 100):

```
score = D1*5 + D2*5 + D3*4 + D4*2 + D5*2 + D6*2
```

Ein Paper muss **nicht** alle Dimensionen treffen. Ein starkes D1/D2/D3 mit
klarem Usecase-Bezug reicht für hohe Scores. Rein theoretische Arbeiten ohne
EA-/Graph-/Agent-Bezug bleiben niedrig.

Nur Papers mit **Erst-Score ≥ 55** kommen in die Shortlist (max. 15).

### Schritt 3 — Abstracts nachladen (nur Shortlist)

Alle Abstract-URLs der Shortlist in **einem einzigen** Scrape-Call bündeln:
`urls: ["https://arxiv.org/abs/<ID1>", "https://arxiv.org/abs/<ID2>", …]`
(max. 15 Shortlist-Papers, liegt unter dem 50er-Limit).

Das Abstract steht im Markdown nach `Abstract:`, alternativ in
`metadata.description`. Score anhand des Abstracts **neu bewerten** (überschreibt
Erst-Score). Für jedes Paper 1–2 Sätze notieren: **konkreter TheArchitect-Bezug**
(„könnte Usecase X unterstützen / verbessern, weil …").

### Schritt 4 — Dedup gegen Linear

Vor dem Anlegen `list_issues` (Team THE, `query:` = arXiv-ID) prüfen, ob schon
ein Issue mit dieser arXiv-ID existiert (der Skill schreibt die ID in Titel und
Beschreibung). Bereits vorhandene Papers **überspringen** (kein Duplikat).

### Schritt 5 — Linear-Issues anlegen (Score > 75)

Pro qualifiziertem Paper `save_issue` (Team `404e1657-492d-464b-9938-895025058d94`):

- **Titel:** `[arXiv Radar] <Titel> (arXiv:<ID>, Score <score>)`
- **Priority:** immer **None (0)** — Radar-Tickets sind Lesestoff, keine Arbeit.
  Der Score steht im Titel; priorisiert wird erst bei Promotion über ein
  Decision-Ticket (Backlog-Beschluss 2026-08-29).
- **Labels:** immer `Radar` **plus** Typ-Label: neuer Ansatz/Fähigkeit →
  `Feature`; Verbesserung eines bestehenden Usecases → `Improvement`
- **Beschreibung (Markdown):**

```
## arXiv Radar — automatischer Fund

**Paper:** <Titel>
**arXiv:** https://arxiv.org/abs/<ID>  ·  PDF: https://arxiv.org/pdf/<ID>
**Subjects:** <Subjects>
**Score:** <score>/100

### Dimensions-Scores
- D1 EA/TOGAF/Governance: <n>/5
- D2 Dependency-/Knowledge-Graph (Neo4j): <n>/5
- D3 AI-Copilot/MCP/NL-Query: <n>/5
- D4 3D-/Visualisierung: <n>/5
- D5 Umsetzbarkeit: <n>/5
- D6 Reife/Signal: <n>/5

### TheArchitect-Bezug
<1–2 Sätze: welcher Usecase wird unterstützt/verbessert, warum relevant>

### Abstract (gekürzt)
<2–4 Sätze>

---
_Automatisch erzeugt vom Skill `arxiv-radar` am <Datum>. Bitte triagieren._
```

### Schritt 6 — Digest schreiben

Immer (auch wenn keine Issues entstanden) nach
`/Users/mac_macee/javis/reports/arxiv-radar/<YYYY-MM-DD>.md`:

- Kopf: Datum, Anzahl gescannter Einträge, Shortlist-Größe, angelegte Issues.
- Tabelle Top-10 (Titel, arXiv-ID-Link, Score, angelegtes THE-Issue falls vorhanden).
- Je Top-Paper der TheArchitect-Bezug (1–2 Sätze).

## Guardrails

- **Nur lesende** arXiv-Zugriffe über den Scrape-Service. Schreibzugriff
  ausschließlich auf Linear (neue Issues) + lokalen Digest. Den
  Scrape-Workflow selbst **nicht** verändern.
- **Kein Spam:** max. 8 neue Issues pro Lauf. Bei mehr Kandidaten nur die
  höchstgescorten anlegen, Rest im Digest listen.
- **Idempotenz:** immer erst Schritt 4 (Dedup) vor Schritt 5.
- Bei Scrape-Fehler (`success: false` auf der Listing-Seite, leeres `markdown`
  oder Workflow-Execution fehlgeschlagen): Lauf abbrechen, Kurz-Digest mit
  Fehlerhinweis schreiben, **keine** Issues anlegen. Einzelne fehlgeschlagene
  Abstract-Seiten in Schritt 3 sind kein Abbruchgrund — das Paper bleibt dann
  auf seinem Erst-Score und wird im Digest markiert.
- Score-Gewichte transparent halten — sie stehen bewusst hier im Skill und
  können angepasst werden (z.B. D4 hochziehen, wenn 3D-Fokus wichtiger wird).
```
