# Pitch Demo Script — TheArchitect

**Pitch-Datum:** 23.04.2026
**Zielsprache:** Deutsch (formell, "Sie")
**Dauer:** 15–18 Minuten
**Setup:** Chrome (neues Profil, DE, Zoom 100%), localhost oder thearchitect.site
**Backup-Assets:** `/Users/mac_macee/javis/docs/pitch-backup/` (siehe README.md)

---

## Pre-Show Checklist (5 Minuten vor Start)

- [ ] Chrome-Tab geöffnet auf `https://thearchitect.site/?lang=de`
- [ ] Zweiter Tab bereit mit `thearchitect.site/login` (Demo-Account)
- [ ] DevTools geschlossen
- [ ] Demo-Projekt auf Account existiert (Pre-Staged)
- [ ] MP4-Player im Hintergrund geöffnet (Backup-Video bereit)
- [ ] Mikrofon-Level geprüft
- [ ] Handy stumm, Timer gestartet

---

# Akt 1 — Das Problem (0:00 – 2:00)

**Ziel:** Das Publikum emotional abholen. Enterprise-Architekten erkennen ihren eigenen Schmerz wieder.

## 1.1 — Eröffnung (0:00 – 0:30)

[Landing Page sichtbar, Hero-Section. MatrixRain-Effekt läuft im Hintergrund.]

> "Guten Morgen. Ich frage Sie zum Einstieg eines:
>
> Wann haben Sie das letzte Mal eine aktuelle Architektur-Übersicht Ihres Unternehmens gesehen? Nicht eine PowerPoint aus 2020. Nicht eine Confluence-Seite von einem Kollegen, der nicht mehr im Haus ist.
>
> **Eine aktuelle.**"

[Kurze Pause. Publikum anschauen.]

> "Die meisten Enterprise-Architekten, mit denen ich spreche, antworten: *'nie'*. Die Landschaft ändert sich schneller, als sie dokumentiert werden kann."

## 1.2 — Problem-Ankündigung (0:30 – 1:00)

> "Das ist kein Dokumentations-Problem. Das ist ein Operationalisierungs-Problem. Stakeholder treffen heute Entscheidungen über Systeme, die sie nicht verstehen. Consultants liefern Reports, die am Tag der Übergabe veraltet sind. TOGAF-Phasen brauchen Monate — aber Märkte warten nicht auf Monate.
>
> Die Folgen kennen Sie: gescheiterte Migrations, Compliance-Lücken, Shadow-IT, Budgets, die viermal überschritten werden."

## 1.3 — CSV-Upload Live (1:00 – 1:40)

[Scroll zum CSV-Upload-Bereich.]

> "TheArchitect löst das anders. Ich zeige es Ihnen an einem echten Beispiel."

[Klick auf CSV-Upload, ziehe Demo-CSV *banking-platform.csv* hinein.]

> "Das ist eine normale Enterprise-CSV — wie sie aus SAP LeanIX, ServiceNow oder einer Excel-Tabelle kommt. 28 Systeme, 35 Abhängigkeiten, Banking-Plattform."

[Warte auf Scan-Result, ca. 2-3 Sekunden.]

## 1.4 — Health Score Reveal (1:40 – 2:00)

[Health Score Ring erscheint mit Score.]

> "In drei Sekunden: Health Score, fünf-Faktor-Breakdown, die fünf größten Architektur-Risiken. **Ohne dass ich mich angemeldet habe.** Keine Daten werden gespeichert. Der Audit bleibt in Ihrem Browser.
>
> Das ist der Einstiegspunkt. Jetzt zeige ich Ihnen, was dahinter steckt."

**[Timing-Cue: Soll 2:00, kumuliert 2:00]**

**Fallback:** Falls Lazy-Load >3s: *"Während das lädt — die Plattform läuft auf WebGPU, das rendert die gesamte Architektur clientseitig. Wir übertragen keine Architektur-Metadaten auf unsere Server."*

---

# Akt 2 — 0→Architektur in 60 Sekunden (2:00 – 5:00)

**Ziel:** Die "Wow, das ist echt"-Reaktion. 3D-Visualisierung, die kein Whiteboard schafft.

## 2.1 — Login + Demo Load (2:00 – 2:45)

[Klick "Sign In" oben rechts, Demo-Account einloggen.]

> "Ich melde mich mit dem Demo-Account an. Neuer Kunde — er würde hier sein Unternehmen anlegen. Für die Demo habe ich die Banking-Plattform von eben bereits angelegt."

[Login erfolgreich, Dashboard lädt.]

[Klick auf Projekt *Demo: Enterprise Banking Platform*.]

## 2.2 — 3D Scene Reveal (2:45 – 3:30)

[3D-Scene rendert. Kamera in Default-Position.]

> "Das sind Ihre 28 Systeme. Echte Daten aus dem Seed:
> - Oberste Ebene: Business-Capabilities — Payment Gateway, Fraud Detection, Regulatory Reporting, Risk Management
> - Mittlere Ebene: Application-Services — API Gateway, Auth Service, Transaction Service, AI Scoring Engine
> - Unterste Ebene: Technology-Stack — Postgres-Cluster, Kafka, Redis, Kubernetes, HashiCorp Vault"

[Mit Maus drehen — Kamera 360° um Architektur.]

> "Das ist keine Mockup-Grafik. Das sind die realen Abhängigkeiten — 35 Connections, von Business-Outcome bis Datenbank-Cluster. Serving, Flow, Triggering — alle ArchiMate-Relationen sauber typisiert."

## 2.3 — Layer Toggle (3:30 – 4:15)

[Klick Button "Layers" oben rechts.]

> "Ich kann einzelne Layer isolieren. Für einen Business-Analyst — nur die Business-Capabilities."

[Toggle Layer, nur Business-Layer sichtbar.]

> "Für einen Infrastruktur-Engineer — nur Technology."

[Toggle, nur Technology sichtbar.]

> "Das ist nicht Layer-als-Kategorie. Das sind eigene 3D-Ebenen, stackable, inspektierbar. Rollenbasierte Sichten — in Echtzeit."

## 2.4 — X-Ray Mode (4:15 – 5:00)

[Klick X-Ray-Button.]

> "X-Ray-Mode: Jetzt zeige ich Ihnen etwas, das kein statisches Diagramm kann."

[Elemente werden transparent, Connections durchstrahlen.]

> "Sie sehen die kompletten Datenflüsse — vom Mobile-BFF bis zum Postgres-Cluster. Jede Hop, jede Latenz-relevante Abhängigkeit. **Diese Sicht brauchen Sie, wenn Sie eine Cloud-Migration planen.** Und genau da kommen wir gleich hin."

**[Timing-Cue: Soll 3:00, kumuliert 5:00]**

**Fallback:** Falls 3D-Lag: *"Die 3D-Engine nutzt Level-of-Detail und passt die Render-Qualität an die GPU an. Auf einem Beamer reduziere ich normalerweise auf 2D-Grid — lass uns das kurz wechseln."* [Klick 2D-Toggle.]

---

# Akt 3 — AI-Native (5:00 – 9:00)

**Ziel:** Zeigen, dass die KI die Architektur **versteht**, nicht nur durchsuchbar macht.

## 3.1 — Vision Panel (5:00 – 5:45)

[Klick in linker Sidebar auf "Envision" oder "Vision".]

> "Phase A in TOGAF. Die Vision. Früher: Workshop, 2 Tage, Whiteboard voll Post-Its."

[Vision-Panel sichtbar mit Stakeholder-Liste.]

> "Ich habe diese Vision vor drei Tagen vom Blueprint-Wizard generieren lassen. Sechs Stakeholder, jeder mit Ziel, Konflikt, Einfluss-Grad. Der CTO will Innovation. Die Regulatoren wollen Stabilität. Das Business will Geschwindigkeit.
>
> Sie sehen: Die KI hat die Konflikte explizit markiert — *CTO vs Risk Management: Trade-off zwischen Cloud-Velocity und Change-Freeze-Policy*. Das ist keine Bullet-Liste. Das ist ein Verhandlungsraum."

## 3.2 — Blueprint Wizard Live (5:45 – 7:30)

[Klick Button "Generate Blueprint" / Navigation zu Blueprint-Panel.]

> "Jetzt das Kernstück. Ich simuliere einen neuen Kunden, der gerade einsteigt. Er hat einen CSV-Import — aber noch keine Vision, keine Phase A."

[Blueprint Wizard öffnet Questionnaire.]

> "Fünf Fragen. Was ist die strategische Richtung? Welche Stakeholder? Welcher Zeit-Horizont?"

[Beispielantworten schnell eingeben oder Pre-Staged Defaults nutzen.]

> "Und jetzt: Generate."

[Klick Generate-Button. Spinner startet.]

> **[Füll-Monolog während 30-60s Spinner — Level 1]**
>
> "Was gerade passiert: Claude liest die Architektur, 28 Elemente, 35 Connections. Er mappt sie gegen die TOGAF-ArchiMate-Metamodell-Spec. Er extrahiert Stakeholder-Interessen aus dem Banking-Domain-Kontext. Und er generiert ein komplettes Blueprint — Vision, Scope, Principles, Conflicts.
>
> Das ist nicht GPT-Wrapper um ein Prompt. Das ist eine mehrstufige Pipeline: Erst Graph-Analyse, dann Domain-Embedding, dann Generation, dann Validation gegen unser ArchiMate-Schema."

> **[Bei >60s — Level 2]**
>
> "Der Unterschied zu LeanIX oder iServer: Die arbeiten mit Templates. Wir arbeiten mit dem tatsächlichen Architektur-Graph. Jede Generation ist spezifisch für diesen Kunden. Das merken Sie, wenn Sie gleich das Ergebnis sehen."

> **[Bei >90s — Switch auf Backup-Video]**
>
> "Die API ist heute langsamer als sonst. Ich zeige Ihnen den Run, den ich gestern aufgezeichnet habe — **identische Parameter, identische Pipeline.**"
>
> [Backup-Video `blueprint-ai-generation.mp4` einblenden.]

[Blueprint generiert, zeige Result.]

> "Da ist es. Vision, Principles, Drivers, Constraints. Sie können das akzeptieren — oder einzelne Punkte umformulieren."

## 3.3 — Copilot Review (7:30 – 9:00)

[Schließe Blueprint-Panel, öffne Copilot (unten rechts Button).]

> "Das Letzte in diesem Akt: Der Copilot. Das ist die Konversationsschicht. Stellen Sie sich vor, ein neuer Architect kommt ins Haus — er fragt *'gibt es hier etwas, das mich sofort aufwachen lassen sollte?'*"

[Tippe in Copilot: *"Review my architecture and highlight the top 3 risks"* und Enter.]

> **[Während Response streamt:]**
>
> "Was der Copilot jetzt macht: Er hat Zugriff auf den gesamten Graph. Jedes Element, jede Connection, jeden riskLevel, jeden maturityLevel. Er kann Cluster-Analyse machen, Abhängigkeits-Tiefen berechnen, Gaps identifizieren."

[Response erscheint mit 3 Risiken — z.B. HashiCorp Vault critical + Auth Service critical + single-point-of-failure.]

> "Drei Risiken. Jedes mit Quelle — Element-ID, Abhängigkeits-Kette, Remediation-Vorschlag. **Das ist nicht ChatGPT auf unsere Daten.** Das ist ein Agent, der unseren Architektur-Graph durchwandert und Ihnen zurückgibt, was er findet."

**[Timing-Cue: Soll 4:00, kumuliert 9:00]**

---

# Akt 4 — Compliance in 60 Sekunden (9:00 – 12:00)

**Ziel:** Der "Das-spart-mir-drei-Monate"-Moment. Consulting-Budget wird sichtbar ersetzt.

## 4.1 — Pipeline öffnen (9:00 – 9:30)

[Navigation zur Compliance-Pipeline.]

> "Compliance. Das ist der teuerste Schmerz in der Enterprise-Architektur. ISO 27001, DORA, NIS-2, BAIT — jedes Framework braucht Monate Consultants, die Ihren SOA-Katalog gegen den Standard mappen.
>
> Wir machen das anders. Pipeline-Ansatz — siebenstufig."

[Pipeline-Stepper sichtbar mit 7 Stages.]

## 4.2 — Compliance Matrix (9:30 – 10:30)

[Klick auf Stage "Matrix" oder direkt Compliance Matrix öffnen.]

> "Hier sehen Sie das Mapping: 28 Elemente gegen ISO 27001 — Annex A Kontrollen. Gegen DORA — Anforderungen Artikel 4 bis 16.
>
> Die KI hat das in der Nacht gemappt. Sechs Stunden Compute. Consultants würden drei Monate brauchen — und es wäre schlechter."

[Zeige Matrix mit farbigen Zellen — grün gemappt, gelb partial, rot gap.]

> "Grün heißt: Kontrolle erfüllt, mit Quell-Element. Gelb: partielle Abdeckung. Rot: Gap. Jede Zelle klickbar, mit Begründung."

[Klick auf eine rote Zelle.]

> "Beispiel: DORA Art. 11 — Backup and Recovery. Unser System erkennt, dass der Payment Gateway keine redundante Backup-Strategie dokumentiert hat. **Findings direkt aus dem Architektur-Graph** — nicht aus einer manuellen Checkliste."

## 4.3 — Gap Analysis (10:30 – 11:15)

[Navigation zu Gap-Analysis / RemediateGateway.]

> "Gaps werden nicht nur angezeigt. Sie werden **priorisiert.** Kombination aus Compliance-Risk, Architektur-Kritikalität und Remediation-Kosten."

[Zeige Gap-Liste, sortiert nach Impact-Score.]

> "Top-Gap hier: HashiCorp Vault ohne dokumentiertes Key-Rotation-Verfahren. Verstoß gegen ISO A.10. Remediation-Kosten: 2 Tage Engineering. Compliance-Impact: hoch. Das ist Ihre nächste Woche Sprint-Planning."

## 4.4 — Policy Generation (11:15 – 12:00)

[Klick auf "Generate Policy" bei einem Gap.]

> "Und die KI schlägt die Policy gleich mit vor."

[Policy-Draft erscheint — Markdown mit Header, Anwendungsbereich, Regeln.]

> "Das ist kein Template. Das ist spezifisch für Ihr HashiCorp Vault in Ihrer Architektur. Policy-Text, Anwendungsbereich, Audit-Kriterien. Sie können das review'n, anpassen, und dann als Policy-as-Data im System anbinden."

[Scroll durch Policy, zeige Audit-Kriterien-Sektion.]

> "Das System generiert nicht nur das Dokument. Es generiert die Kriterien, die später automatisch gegen Ihren Graph geprüft werden. **Compliance wird zum Continuous Process**, nicht zum jährlichen Audit-Marathon."

**[Timing-Cue: Soll 3:00, kumuliert 12:00]**

---

# Akt 5 — Die Zukunftsmaschine (12:00 – 16:00)

**Ziel:** Kernstück. Der Teil, den kein Konkurrent hat. Monte Carlo + Multi-Agent-Simulation + Oracle.

## 5.1 — Roadmap öffnen (12:00 – 12:45)

[Navigation zu Roadmap / Plan-Phase.]

> "Sie haben jetzt: Ist-Zustand, Vision, Compliance-Gaps. Die nächste Frage: **Wie kommen wir vom Ist zum Soll — ohne den Laden an die Wand zu fahren?**
>
> TOGAF nennt das Transition Planning. Wir nennen es eine Zukunftsmaschine."

[Roadmap-Panel mit Wellen-Visualisierung.]

> "Die KI hat aus der Vision, den Gaps und Ihren Constraints eine Transition-Roadmap generiert. Drei Wellen, 18 Monate. Wave 1: API Gateway Modernisierung. Wave 2: Cloud-Migration. Wave 3: ML-Platform-Konsolidierung."

## 5.2 — Monte Carlo (12:45 – 13:45)

[Klick auf Monte-Carlo-Tab / MonteCarloSimulation öffnen.]

> "Jetzt interessant: Was kostet das? Und mit welcher Wahrscheinlichkeit?"

[Cost-Distribution-Chart erscheint.]

> "Ich habe die Roadmap durch eine Monte-Carlo-Simulation geschickt. 100 Iterationen. Kosten-Verteilung. Zeit-Verteilung. Risiko-Adjustment."

[Zeige Verteilung mit P50, P75, P90.]

> "**P50: 5,2 Millionen Euro. P90: 8,7 Millionen.** Das ist Ihre Verhandlungsposition gegenüber dem CFO. Nicht *'das kostet 6 Millionen'*. Sondern: *'mit 50 Prozent Wahrscheinlichkeit 5,2. Wir brauchen Puffer bis 8,7, um 90 Prozent abzudecken.'* Das ist eine valide Finanzplanung, nicht ein Wunschzettel."

## 5.3 — MiroFish Simulation (13:45 – 15:00)

[Navigation zu MiroFish / Simulation-Panel.]

> "Aber Kosten sind nicht das einzige Risiko. Das größte Risiko ist: **Stakeholder-Blockade.** Wave 1 Cloud-Migration klingt gut — aber was wenn Ihr IT-Operations-Chef nicht mitspielt?"

[MiroFish-Panel, History-Tab zeigt bereits completed Run.]

> "Wir simulieren das. MiroFish ist unsere Multi-Agent-Simulation. Ich spiele die Cloud-Migration Wave 1 durch — mit drei KI-Agents, die drei reale Stakeholder-Rollen abbilden: CTO, Business Unit Lead, IT Operations Manager."

[Klick auf Run, ResultsView öffnet mit Scope-Badge.]

> "Scope-Badge oben: Drei Target-Elemente, Wave 1 — AI Scoring Engine, Mobile BFF, Workflow Engine. Portfolio-weit: 4 kritische, 8 high-risk Systeme. Die Simulation berührt 3 von 28 Elementen, bewusst.
>
> Jetzt das Interessante: **Die Agents streiten**."

[Klick auf Emergence-Tab.]

> "Runde 1: IT Ops blockiert die parallele Migration des Workflow Engines. Zwölf Millionen Records, stateful Service — Change-Freeze-Policy. **Sie sehen das in der Conflict-Heatmap:** CTO gegen IT Ops, Business gegen IT Ops, je ein Konflikt.
>
> Runde 2: CTO macht den Wave-Split-Vorschlag. Wave 1 nur Mobile BFF + AI Scoring. Workflow Engine in Wave 2 mit dediziertem Rollback-Fenster. **Consensus erreicht**. Sie sehen den Emergence-Event unten rechts."

## 5.4 — Oracle Verdict (15:00 – 16:00)

[Schließe MiroFish, navigiere zu Oracle.]

> "Letzter Schritt. Die Zukunftsmaschine produziert jetzt einen Vorschlag. Aber sollten Sie dem folgen?
>
> Das Oracle ist die letzte Instanz."

[Oracle-Panel, History-Tab oder Pre-Computed Verdict.]

> "Das Oracle prüft den Vorschlag gegen: Risiko-Profil, Compliance-Anforderungen, strategische Vision, Ressourcen-Verfügbarkeit. Es gibt ein Urteil — mit Alternativen."

[Zeige Verdict mit Alternatives.]

> "Hier: *Approved with conditions*. Conditions: Dedicated observability-Budget Wave 2, Pre-Migration Load-Testing. Alternatives: *'Wenn Sie nur 50% Budget haben, zieht diese Variante'*. Jedes Urteil ist nachvollziehbar — jede Alternative ist eine valide Transition-Option."

**[Timing-Cue: Soll 4:00, kumuliert 16:00]**

**Fallback:** Falls Oracle.assess hängt: *"Das Oracle hat bereits ein Verdict für diesen Run erstellt — das finden Sie im History-Tab."* [Klick History.]

---

# Akt 6 — Production Ready (16:00 – 18:00)

**Ziel:** Abschluss mit Vertrauen. Das ist kein Prototyp.

## 6.1 — Dashboard KPIs (16:00 – 16:45)

[Navigation zu Analytics-Dashboard / Overview.]

> "Zum Abschluss: Das hier ist Ihr Portfolio-Dashboard. Alle Projekte, alle KPIs, ein Blick."

[Dashboard mit KPI-Strip sichtbar.]

> "Health Score über das Portfolio: 63 Prozent. Kritische und High-Risk-Systeme: **12 von 28**. Compliance-Standards: 2 getrackt, ISO und DORA. Aktive Projekte: 1.
>
> Das ist die Sicht für den CIO. Jeden Morgen, zwei Klicks bis zum Risk-Hotspot."

## 6.2 — PDF Report (16:45 – 17:15)

[Klick auf Export-Button / Report.]

> "Audit-ready Reports — auf Knopfdruck. TOGAF-konform, Phase A bis Phase H, mit Stakeholder-Mapping, Architektur-Graph-Snapshots, Compliance-Coverage."

**Script-Variante bei PDF-Delay >5s:**

> "Den Report habe ich vorhin schon exportiert — hier:"

[Alternativ: Backup-PNG `pdf-report-preview.png` einblenden oder Download-Link zu bereits gespeicherter PDF.]

> "Sechzig Seiten, mit allen Diagrammen, allen Gaps, allen Risiken, allen Empfehlungen. Ihr Consultant hätte sechs Wochen gebraucht."

## 6.3 — Production Hardening (17:15 – 17:45)

> "Das ist kein Prototyp. Das läuft seit zwei Wochen auf Production:
> - **Sentry** für Error-Tracking
> - **Neo4j** für den Architektur-Graph
> - **MongoDB** für Dokumente und Audit-Log
> - **Redis** für Sessions und Realtime-Collaboration
> - **Kubernetes** auf Hostinger-VPS
> - **Rate-Limiting, JWT-Hardening, Email-Verification, OAuth, MFA**
>
> Security-Headers, structured Logging, Health-Checks — alles produktiv."

## 6.4 — Call to Action (17:45 – 18:00)

[Return to Landing-Page oder Contact-Slide.]

> "**TheArchitect** macht Enterprise-Architektur zu einem lebendigen System. Nicht ein Dokument, sondern ein Werkzeug. Nicht jährlich, sondern Continuous.
>
> Wenn Sie das für Ihr Unternehmen ausprobieren wollen — wir haben eine Early-Adopter-Liste. Ich freue mich über Ihre Fragen."

**[Timing-Cue: Soll 2:00, kumuliert 18:00]**

---

## Kritische Script-Regeln

1. **Nie entschuldigen.** Kein *"Sorry, das braucht kurz"* oder *"normalerweise läuft es schneller"*. Ladezeiten werden in Substanz verwandelt (Füll-Monolog).
2. **Nie mit dem Rücken zum Publikum.** Kamera/Screen-Share läuft, Sie bleiben dem Publikum zugewandt.
3. **Jede Zahl hat eine Quelle.** *"63 Prozent Health Score"* — keine gerundeten Fantasiewerte.
4. **EA-Begriffe unübersetzt lassen.** TOGAF, ArchiMate, Monte Carlo, Stakeholder, Compliance bleiben Englisch.
5. **Bei technischer Panne:** Ruhe. Auf Backup-Video oder History-Tab umschalten. Nicht rechtfertigen, direkt fortfahren.

---

## Tight-Timing-Variante (für Fragen-Puffer)

Falls nur 15 Minuten verfügbar:
- Akt 3.2 Blueprint-Wizard auf 45s kürzen (nur Result zeigen, generation skippen)
- Akt 5.1 Roadmap-Intro auf 30s kürzen
- Akt 6.3 Production Hardening weglassen, direkt zu CTA

Gewonnene Zeit: ~3 min → 15 min Total.

---

## Post-Pitch Q&A Preparation

**Erwartete Fragen + Anker-Antworten:**

| Frage | Antwort |
|-------|---------|
| *"Wie geht das mit unseren Daten?"* | On-Premise oder Private-Cloud-Deployment möglich. SOC-2-Roadmap läuft. Keine Trainings-Nutzung unserer Kundendaten. |
| *"Was kostet das?"* | Drei Tiers — Starter, Team, Enterprise. Starter unter 100 Euro pro Monat. Enterprise-Preis abhängig von Portfolio-Größe. |
| *"Integration mit LeanIX / ServiceNow / SAP?"* | Connector-Framework ist implementiert. Zehn Tools priorisiert — SAP, ServiceNow, LeanIX, Salesforce, n8n, weitere in Q3 2026. |
| *"Wer steckt dahinter?"* | Solo-Gründer mit 15 Jahren Enterprise-Architektur-Erfahrung. Aktuell Early-Access. Suche Co-Founder mit Vertriebs-Background. |
| *"Offline-Demo zur Mitnahme?"* | Ja — ich schicke Ihnen den heute gezeigten Flow als Video und eine Demo-Account-Einladung per E-Mail. |

---

## Lautlese-Test

Dieses Script einmal laut von oben bis unten lesen. Ziel-Timing: 15-18 Minuten. Wenn deutlich über 18: **Akt 3 und 5 sind die kürzbaren Bereiche** — nicht Akt 1, 4, 6 (die sind kurz und emotional/kommerziell kritisch).
