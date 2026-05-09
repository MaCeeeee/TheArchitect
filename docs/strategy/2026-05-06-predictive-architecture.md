# Predictive Architecture Modeling — Strategic Initiative

> **Status:** Initiative-Draft, **NICHT** Sprint-Backlog. Strukturiertes Denken vor Investment-Entscheidung.
> **Trigger:** User-Frage 2026-05-06 nach Karpathy-style "Build LLMs from scratch" Video — Übertragung des next-token-prediction-Prinzips auf Architektur-Modellierung.
> **Ziel dieses Docs:** Hypothese ehrlich prüfen, Daten-Realität testen, 3 Optionen mit Trade-offs zeigen, Stage-Gate-Empfehlung ableiten.

---

## 1. Hypothese

> *"Wenn LLMs gelernt haben das nächste Wort vorherzusagen, kann ein analoges Modell für Architekturen das nächste sinnvolle Element vorhersagen — und damit Modellierung beschleunigen, Anomalien erkennen, Patterns matchen."*

Die Idee ist konzeptionell tragfähig. Architekturen sind diskrete Strukturen mit endlichem Vokabular, kompositioneller Grammatik (ArchiMate-Rules), und beobachtbaren Co-occurrence-Mustern. Genau die Bedingungen unter denen statistische Sprach-/Strukturmodelle funktionieren.

Die Frage ist nicht **ob**, sondern **wie groß die Lücke** zwischen "konzeptionell tragfähig" und "betriebswirtschaftlich sinnvoll" ist.

---

## 2. LLM-Prinzip übertragen

| LLM-Konzept | Architektur-Äquivalent |
|---|---|
| Token | ArchiMate-Element (Type + Layer + Domain) — z.B. `business_capability/business/strategy:ESG-Reporting` |
| Vocabulary | ~25 ArchiMate-Element-Types × N Element-Instances (Namen) |
| Sequence | Architektur-Pfad (Capability → Process → Activity → AppService → AppComponent) |
| Context-Window | Aktueller Subgraph + 1-Hop-Neighbors |
| Next-Token-Prediction | Next-Element-Prediction gegeben Context |
| Training-Korpus | Alle TheArchitect-Projekte (anonymisiert) |
| Loss | Cross-Entropy auf gehaltene Test-Architekturen |
| Embedding-Space | Element-Type + Description + Layer-Position als Vektor |

**Wichtige Disanalogie:** Architekturen sind **Graphen, keine Sequenzen**. "Next" ist ambig — next-by-Layer-down, next-by-process-flow, next-by-composition? Bei LLMs ist next-token unique. Bei Architekturen muss man entscheiden welche "next"-Operation man modelliert.

→ Konsequenz: GNN (Graph Neural Network) ist das natürlichere Tool als Transformer. Aber Graph-2-Sequence-Encoding (z.B. via DFS-Traversierung oder ArchiMate-Exchange-XML) macht auch Transformer benutzbar.

---

## 3. Daten-Realitäts-Check (kritisch!)

| Metrik | LLMs (GPT-4 Class) | TheArchitect heute | Verhältnis |
|---|---|---|---|
| Trainings-Tokens | ~13 Trillionen | ~50 Projekte × ~300 Elements ≈ **15.000** | 10⁻⁹× |
| Vocabulary-Size | 50.000+ Subwords | ~25 ArchiMate-Types (klein) | OK |
| Examples per Concept | Millionen | <100 (z.B. wie viele "Greenhouse Gas Accounting"-Capabilities haben wir gesehen) | unbrauchbar |
| Compute Budget | $100M+ | praktisch $0 verfügbar | unbrauchbar |
| Domain-Diversity | Sehr hoch | Aktuell: 1-2 Industrien (Banking, ESG) | sehr eng |

**Klare Konsequenz:** Eigenes Foundation-Model from scratch ist **nicht realistisch**, weder heute noch in 12 Monaten. Aber das ist OK — man muss kein Foundation-Model trainieren um aus dem Konzept Wert zu schöpfen.

**Wo wir wirklich stehen:**
- Genug Daten für **Embedding-Fine-Tuning** auf pretrained Encoder
- Genug Daten für **statistisches Pattern-Mining**
- Zu wenig Daten für eigenes Pre-Training
- Zu wenig Daten für ein eigenes GNN das von Grund auf trainiert wird (außer mit synthetic data augmentation)

---

## 4. Drei Realistische Ansätze

### 🟢 Option A — Embedding-Approach
**Aufwand:** 2-4 Wochen
**Risiko:** niedrig
**Wert:** hoch (löst direkt 2 bestehende UCs)

**Mechanik:**
1. Pretrained `sentence-transformers` (z.B. `all-mpnet-base-v2` oder `e5-large`) als Foundation
2. Fine-Tune auf konkatenierter `{name + description + type + layer + domain}`-Repräsentation jedes Elements
3. Embedding-Index pro Project + Cross-Project (FAISS oder Qdrant — letzteres haben wir schon im Stack)
4. Similarity-Queries als API-Endpoint

**Sofort-Wert (Day 1 nach Deploy):**
- "Zeig mir alle Elements ähnlich zu diesem" — Cross-Project-Discovery
- Anomalie-Score: "dieses Element hat Distanz X zum nächsten Cluster — verdächtig"
- Recommendation: "wenn du diesen Process baust, hier sind 5 Elements aus anderen Projekten die dazu passen"

**Multiplier-Effekte auf Bestehendes:**
- **UC-RED-001** (Redundanz): Description-Embedding-Similarity ist genau Parameter P3 — Embeddings ersetzen Heuristik
- **UC-HARM-001** (Harmonisierung): Element-Matching wird ungleich präziser — "echte" Semantik statt Name-Levenshtein
- **Auto-Heal-Connections**: Vorschläge basierend auf "ähnlichen verbundenen Patterns" statt nur Type-Rules
- **Activity-Generator (D)**: Few-shot-Prompts mit semantisch ähnlichen Beispielen aus anderen Projekten

**Was es NICHT kann:**
- Echte Predictive-Generation ("was ist das nächste Element") — das wäre Option C
- Strukturelle Pattern-Recognition jenseits einzelner Elements

### 🟡 Option B — Pattern-Mining (statistisch)
**Aufwand:** 4-8 Wochen
**Risiko:** mittel
**Wert:** mittel-hoch (sehr erklärbar, gut für Audit)

**Mechanik:**
1. Über alle Projekte: berechne Häufigkeiten von Element-Type-Pairs, Triples, Sub-Graphs
2. Cluster Projekte nach Industrie/Domain (manuell getaggt oder ML)
3. Pro Cluster: extrahiere "Reference-Pattern" — typische Capability-Counts, Process-Tree-Tiefen, häufige Connections
4. Pattern-Library als first-class Entität in Mongo
5. Match-Engine: "deine Architektur deckt 60% des Banking-Reference-Patterns ab"

**Sofort-Wert:**
- "Im Vergleich zu ähnlichen Architekturen fehlt dir typischerweise: X, Y, Z" — Coverage-Analyse
- Sanity-Check: "5 Capabilities ist für ESG-Reporting auffällig wenig (Cluster-Median: 12)"
- Onboarding: "starte mit dem ESG-Reference-Pattern, customize was du brauchst"
- Reference-Templates ohne LLM-Calls (Cost!)

**Vorteile gegenüber A:**
- 100% erklärbar (Stakeholder-Kompatibilität!)
- Kein ML-Compute nötig
- Robust gegen Hallucinations (es gibt keine — alles ist Statistik)

**Nachteile:**
- Skaliert schwer auf Long-Tail (seltene aber wichtige Patterns gehen unter)
- Statisch — muss neu berechnet werden bei jedem Korpus-Update
- Keine Semantic-Distance-Metrik (Banking-Capability ≠ Insurance-Capability auch wenn ähnlich)

### 🔴 Option C — Graph Neural Network (R&D)
**Aufwand:** 3-6 Monate
**Risiko:** hoch (Research-Charakter)
**Wert:** sehr hoch wenn erfolgreich, aber unsicher

**Mechanik:**
1. Architektur als typisierter, gerichteter Graph: Knoten = Elements (mit Features), Kanten = Connections (mit Type-Labels)
2. GNN-Architektur (GraphSAGE, GAT, oder Heterogeneous-Graph-Transformer)
3. Training-Tasks:
   - **Link-Prediction**: gegeben Subgraph, predict missing edges
   - **Node-Property-Prediction**: gegeben Subgraph, predict missing element type/layer
   - **Subgraph-Classification**: ist diese Subgraph ein "Compliance-Pattern"?
4. Pre-Training auf synthetic data (ArchiMate-Rule-konform generiert) + Fine-Tuning auf realen Projekten

**Sofort-Wert (wenn es funktioniert):**
- Echtes "Auto-Suggest-next-Element" während Modellierung
- High-precision Anomalie-Detection
- Industry-agnostic Pattern-Recognition

**Risiken:**
- Daten-Knappheit (siehe oben) macht Pre-Training schwer
- Synthetic-Data könnte Bias einführen (LLM-generated Architekturen ≠ echte Industrie-Architekturen)
- ML-Engineer-Skill nötig (kein TypeScript-Backend-Job)
- Compute: kleiner GNN ist nicht so teuer wie GPT, aber immer noch GPU-Stunden + ML-Ops-Setup
- Research-Risiko: 6 Monate Investment ohne Garantie auf brauchbares Ergebnis

---

## 5. Use-Case-Decision-Matrix

Welcher Ansatz löst welchen Use-Case wie gut?

| Use-Case | Option A (Embeddings) | Option B (Patterns) | Option C (GNN) |
|---|---|---|---|
| Cross-Project-Similarity (UC-HARM-001) | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| Redundanz-Detection (UC-RED-001) | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Coverage-Analyse vs. Industrie-Norm | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| Reference-Pattern-Library | – | ⭐⭐⭐ | ⭐⭐ |
| Auto-Complete während Modellieren | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| Anomalie-Detection ("ungewöhnliches Element") | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Onboarding-Templates | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| Generator-D (UC-DATA-001) Quality-Boost | ⭐⭐⭐ | ⭐ | ⭐⭐ |
| Erklärbarkeit (Audit-tauglich) | ⭐⭐ | ⭐⭐⭐ | ⭐ |

**Pattern:** Option A löst die meisten konkreten heutigen Probleme. Option B ist der Reference-Pattern-Spezialist. Option C ist die ambitioniertere Vision.

---

## 6. Empfohlener Stage-Gate-Plan

### Gate 1 — Diese Woche: Strategy + Quick-PoC
- ✅ **Dieses Doc** (du liest es)
- ⏸ **1-Wochen-PoC für Option A**:
  - Setup `sentence-transformers` mit `all-mpnet-base-v2`
  - Embed alle Elements aus 5 Demo-Projekten (BSH-ESG, Banking-Demo, weitere)
  - FAISS-Index lokal
  - Streamlit/Notebook UI: "gib einen Element-Namen ein → top-10 ähnliche Elements aus allen Projekten"
  - **Decision-Kriterium:** Sind die Top-10-Treffer "intuitiv sinnvoll" für 5 Test-Queries?

### Gate 2 — Wenn Gate 1 ✓: Embedding-Approach productionizing
- Qdrant (haben wir schon im Stack via RAG-Server) als Embedding-Index
- API-Endpoint `POST /api/projects/:projectId/elements/:id/similar`
- UI-Hook im PropertyPanel: "Ähnliche Elements aus anderen Projekten"
- Telemetrie: was klicken/akzeptieren User → Feedback-Loop für späteres Re-Training
- **Lifeline für UC-RED-001 + UC-HARM-001**: deren Embedding-Parameter werden direkt von hier befüllt

### Gate 3 — Wenn Gate 2 ✓ und ≥500 Projekte im Korpus: Pattern-Mining (Option B)
- Statistik-Pipeline auf vorhandenem Korpus
- Pattern-Library als Mongo-Collection
- Coverage-Analysis-Feature im Compliance-Dashboard

### Gate 4 — Frühestens 2027: GNN (Option C)
- Wenn Korpus ≥10.000 Projekte
- Wenn ML-Engineer im Team
- Wenn klar geworden: Embeddings + Patterns reichen NICHT für die Wow-Use-Cases

**Killer-Kriterium für Gate 4:** wenn Embedding+Pattern zusammen 80% des Werts liefern, ist GNN-Investment fragwürdig.

---

## 7. Risiken & Mitigations

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Embedding-Qualität schlecht weil Element-Beschreibungen sparse | mittel | hoch | Description-Quality verbessern via Generator-D + AI-Autofill ist eh im Backlog |
| Cross-Project-Data-Leakage (kannst du Customer-X-Architektur Customer-Y zeigen?) | hoch | sehr hoch | Tenant-Isolation hart durchziehen — Embedding-Index pro Workspace, optional anonymisierter Public-Index als Opt-In |
| User-Erwartungs-Inflation ("AI versteht meine Architektur") | hoch | mittel | Klare UX: "ähnliche Elements" ≠ "mein Architektur-Co-Pilot" |
| ML-Ops-Komplexität explodiert | hoch (besonders Option C) | hoch | Bei A: nur Inference-Service. Pre-Training/Fine-Tuning ist offline + cached. Kein Live-Training |
| Konkurrenz (LeanIX, Ardoq) baut dasselbe schneller | mittel | mittel | Graph + ArchiMate-Spezifizität ist Moat — generische SaaS hat das nicht |
| Daten-DSGVO-Hürde wenn Customer-Daten ins Training | mittel | sehr hoch | Opt-in, anonymisiert, kein PII-Embedding, lokales Embedding-Hosting |

---

## 8. Was das mit Tier-1-Sprint zu tun hat

**Wichtig: NICHT in Sprint-Backlog stopfen.** Tier-1 (UC-PLATEAU-001 + UC-DATA-001) liefert Daily-Value für BSH und ist 1-2 Sprints. Diese Initiative ist Multi-Sprint Strategic Investment.

**Aber: Synergien nutzen.**
- UC-DATA-001 (Generator D) profitiert von Embeddings (Few-Shot-Prompts mit semantisch ähnlichen Beispielen)
- UC-RED-001 + UC-HARM-001 sind die natürlichen ersten Konsumenten der Embedding-Infrastruktur
- Tier-1-Sprint zuerst → dann Quick-PoC → dann Embedding-Production = Tier-2/3-UCs werden 10× besser

**Reihenfolge-Empfehlung:**
1. **Jetzt:** Tier-1-Sprint vorbereiten (Scoring, Linear, Plans) — nicht verzögern
2. **Parallel diese Woche, 2-4h:** Quick-PoC Option A im Notebook
3. **Nach Tier-1 (Sprint 3+):** Embedding-Production wenn PoC ✓
4. **Sprint 4-5:** UC-RED-001 oder UC-HARM-001 mit Embedding-Backbone bauen
5. **2027:** Re-evaluate — brauchen wir GNN?

---

## 9. Konkrete nächste Aktionen

### Für mich (Claude) — automatisch bei nächstem Auto-Mode-Run:
- [ ] Memory-Eintrag `strategy_predictive_architecture.md` für Cross-Session-Awareness
- [ ] PoC-Notebook-Skelett vorbereiten (`notebooks/predictive-poc/embedding-similarity.ipynb`)

### Für dich (Matze) — wenn diese Initiative weitergeht:
- [ ] Diese Strategy-Doc nochmal in Ruhe lesen, mit gestern-Abend-Augen kritisch hinterfragen
- [ ] Decision: Quick-PoC starten oder erst Tier-1-Sprint abwarten?
- [ ] Falls PoC: 2h Time-Box + harte Kriterien ("würde ich das einem Demo-Kunden zeigen?")
- [ ] Bei Erfolg: Linear-Issue UC-PRED-001 anlegen als parent für die Production-Implementation

### Was wir HEUTE NICHT machen:
- Keine Production-Code-Änderungen für diese Initiative
- Keine Linear-Issues anlegen — erst nach Quick-PoC entscheiden
- Keine Tier-1/2/3-Roadmap umstellen — Initiative läuft parallel

---

## 10. Honest Take (Closing Thought)

Die Idee ist gut. Sie ist in der **konzeptionellen Form ("LLM für Architekturen")** wahrscheinlich nicht direkt umsetzbar — weil Daten + Compute fehlen. Aber sie öffnet den Blick auf eine **realistischere Variante**: Embedding-basierte Semantik + statistisches Pattern-Mining, die zusammen 70-80% des Wow-Werts liefern können, ohne 6 Monate ML-R&D-Investment.

**Der größte Hebel ist, dass diese Infrastruktur die bereits dokumentierten UCs UC-RED-001 und UC-HARM-001 dramatisch besser macht.** Statt parallel-Track ist Embedding-Foundation eigentlich Pre-Requirement für die Tier-3-UCs.

Wenn das hier in 6 Monaten als "machen wir auch noch" angefangen wird — verspätet. Wenn es jetzt als Quick-PoC angetestet wird — und entweder validiert oder verworfen — bist du strategisch klar.

**Mein Tipp:** Quick-PoC einplanen für **kommendes Wochenende oder erste freie Tier-1-Pause**. 2-3h Time-Box. Dann ist die Frage beantwortet, statt offen über ihr zu kreisen.
