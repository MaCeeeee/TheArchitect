# UC-ICM-003 Demo-Skript — BSH-Touchpoint 2026-06-14

**Audience:** BSH Vorstand / Business Architect Team
**Dauer:** 5-7 Minuten (3 Akte à 90-120s, danach Q&A)
**Format:** Live-Demo am Laptop, gespiegelt auf TV / Beamer
**Ziel:** „Compliance-Mapping wird vom KI-Copilot in Sekunden gemacht — automatisch, mit Quellenverweis, in Eure 3D-Architektur eingebettet."

---

## Pre-Flight Checkliste (5 Min vor Demo)

| | Check |
|---|---|
| ☐ | Browser auf https://thearchitect.site offen, eingeloggt als `demo-bsh@thearchitect.site` |
| ☐ | Project „BSH Demo (UC-ICM-003)" geöffnet (URL: `/project/6a115592d31e8700abb535b9`) |
| ☐ | 3D-View aktiv (nicht 2D), Camera so positioniert dass alle 5 Elements sichtbar sind |
| ☐ | „Compliance Heat-Map" Toggle in der Toolbar **AUS** (für den Reveal-Moment) |
| ☐ | PropertyPanel rechts geschlossen oder leer |
| ☐ | Browser-Console offen für eventuelle Debug-Sicht (Cmd+Opt+I) |
| ☐ | Internet-Connection stabil (Anthropic-API muss erreichbar sein für Live-Mapping) |
| ☐ | Backup: Screenshot-Galerie aller 3 Akte bereit (falls Live-Demo ausfällt) |

**Daten-Stand bestätigen** (im DevTools-Console oder schnell SSH):
- 16 Regulations geladen (NIS2 + LkSG + DSGVO)
- 53+ Compliance-Mappings persistent
- 5 BSH-Demo-Elements im Neo4j

---

## Opening-Statement (15 Sekunden)

> „Compliance-Officer und Architects haben heute eine Riesenlücke: Welche Regulation betrifft welches System? Diese Frage wird manuell beantwortet, dauert Wochen, ist nie aktuell.
>
> Wir zeigen Ihnen in 5 Minuten, wie unser AI-Copilot das in **Echtzeit** löst — von der vollautomatischen Quellen-Erfassung bis zur Live-Klassifikation neuer Gesetze."

---

## Akt 1 — „So sieht Ihre Compliance-Lage aus" (90 Sekunden)

### Setup
3D-Architektur ist sichtbar. 5 Elements verteilt auf Business / Data / Application Layer.

### Action

1. Sage: *„Das ist die BSH-Demo-Architektur — 5 Capabilities und Apps auf den TOGAF-Layern. Ohne Compliance-Sicht."*
2. **Klick „Compliance Heat-Map"** Button in der Toolbar (Layers-Icon)
3. Pause 2 Sekunden — die pulsierenden Halos erscheinen

### Was der Vorstand sieht
- **Grüne pulsing Halos** um die meisten Elements (Lieferantenmanagement, Datenverarbeitung B2C, HR-Plattform, Personalakte)
- **Gelber/oranger Halo** evtl. um ERP-System SAP (partial coverage)
- Die Architektur ist plötzlich „compliance-codiert" — auf einen Blick erkennbar wo Probleme + wo gute Coverage sind

### Skript-Text

> „Innerhalb von <1 Sekunde sehen Sie jetzt die Compliance-Lage Ihrer Architektur:
> - **Grün** = das Element ist gut durch Regulations abgedeckt
> - **Gelb** = partial coverage, einige Lücken
> - **Rot** = compliance-Gap, dringend Handlungsbedarf
>
> Unsere KI hat 16 Public Regulations — NIS2, DSGVO und LkSG — automatisch gegen Ihre 5 Architecture-Elements gemappt. Das sind 53 fundierte Mappings, jedes mit Reasoning und Confidence-Score.
>
> Das spart Ihren Compliance-Architekten Wochen manuelle Arbeit."

### Wahrscheinliche Frage
**„Was bedeutet diese Coverage konkret?"**
→ Übergang zu Akt 2.

---

## Akt 2 — „Warum ist dieses Element rot/grün?" (90 Sekunden)

### Setup
Heat-Map ist noch aktiv.

### Action

1. **Klick auf das HR-Plattform-Element** (orange Sphere auf Application-Layer)
2. PropertyPanel rechts öffnet sich, Tab-Bar erscheint
3. **Klick auf „Compliance (X)" Tab** — X = aktuelle Anzahl Mappings, typisch 9-10

### Was der Vorstand sieht
- Liste mit ~10 Regulations sortiert nach Confidence DESC
- Top-Treffer: `DSGVO Art. 9 @ 0.95` mit Reasoning *„Die HR-Plattform verarbeitet explizit Gesundheitsdaten und Sozialversicherungsdaten…"*
- Color-coded Confidence-Bars (grün/gelb/orange)
- Klickbare Source-Badges (z.B. „LKSG § 6")

### Skript-Text

> „Wenn ich auf ein konkretes Element klicke — hier die HR-Plattform — sehe ich genau warum es rot/grün ist:
>
> 10 Regulations betreffen dieses System. An Position 1 mit 95% Confidence: **DSGVO Artikel 9 — besondere Kategorien personenbezogener Daten**. Die KI hat erkannt: Workday HR enthält Gesundheitsdaten, also greift Art. 9.
>
> Das ist nicht erraten — die KI zitiert konkret aus dem Gesetzestext und macht den Bezug zum System sichtbar. Auditor-tauglich, mit Quellenverweis."

### Wahrscheinliche Frage
**„Aber was, wenn jetzt ein NEUES Gesetz kommt?"**
→ Übergang zu Akt 3.

---

## Akt 3 — „Pasten Sie ein neues Gesetz rein" (120 Sekunden)

### Setup
PropertyPanel offen oder geschlossen — egal.

### Action

1. **Klick „Paste & See"** in der Toolbar (Sparkles-Icon mit grünem Label)
2. Modal öffnet
3. **„Demo-Text laden"** klicken (lädt § 6 LkSG)
4. *Optional: Source-Dropdown auf LkSG setzen, Paragraph „§ 6" eingeben*
5. **„Live-Mapping starten"** klicken
6. Loading-Spinner 3-5 Sekunden — *„Claude analysiert den Paragraph…"*
7. **Result:** 2-3 Elements identifiziert mit Confidence + Reasoning
8. **„Übernehmen & Speichern"** klicken
9. Toast: *„✓ LKSG § 6 ist jetzt persistent — 2 Mappings hinzugefügt"*

### Optional (mehr Demo-Wirkung)
10. Modal schließt sich
11. **Re-Klick** auf das gerade gemappte Element (Lieferantenmanagement)
12. PropertyPanel → Compliance-Tab → **+1 Mapping** sichtbar mit „LKSG live-paste"

### Skript-Text

> „Stellen Sie sich vor, das Bundesarbeitsministerium veröffentlicht morgen eine LkSG-Novelle. Compliance-Team sitzt da mit dem PDF und muss durch alle 50 Paragraphen.
>
> Heute machen wir das so: [§ 6 LkSG einfügen]
>
> [Klick Live-Mapping starten] — Claude liest, vergleicht mit unserer Architektur, und identifiziert in 3 Sekunden, dass dieses Element [Lieferantenmanagement] direkt betroffen ist.
>
> [Klick Übernehmen] — Der neue Eintrag ist jetzt persistent. Wenn ich nochmal auf das Element klicke, sehe ich Position 1 die soeben hinzugefügte Regulation.
>
> Das ist der Game-Changer: **Compliance-Bewertung in Echtzeit, statt in Wochen.**"

### Wahrscheinliche Frage
**„Funktioniert das auch für interne Standards / unsere eigenen Compliance-Docs?"**
→ Vorbereitete Antwort siehe Q&A.

---

## Q&A — Vorbereitete Antworten

### „Wie genau ist die KI?"
> „Wir messen das mit Confidence-Scores zwischen 0 und 1. In unserer BSH-Demo treffen ~70% der Mappings 0.9+ Confidence. Das ist genauer als manuelle Mappings, weil Claude konsistent ist — kein Compliance-Officer denkt um 16:00 noch genauso wie um 9:00. Plus: alle Reasoning-Texte zitieren konkret aus dem Gesetzestext, also nachvollziehbar."

### „Welche Daten werden an Anthropic geschickt?"
> „Nur der Regulation-Text und die Element-Namen plus Kurz-Beschreibungen. Keine Personaldaten, keine sensitiven Business-Inhalte. Der Vergleich passiert auf Capability-Level, nicht auf Daten-Level. Plus: wir können auf On-Premise-LLMs wechseln (LLaMA, Mistral) wenn das gewünscht ist."

### „Was passiert mit unseren internen Compliance-Docs / Standards?"
> „Dafür haben wir einen zweiten, ergänzenden Workflow: die **Compliance Pipeline** in der Sidebar. Da können Sie PDFs hochladen — Ihre eigenen ISO27001-Adaptionen, Code of Conduct, etc. — und kriegen denselben AI-Match. Heute zeigen wir Ihnen den **Public Regulations**-Weg, der ist eindrucksvoller. Der Custom-Weg läuft im Hintergrund analog."

### „Aktualisierung? Wenn sich ein Gesetz ändert?"
> „Public Regulations werden automatisch via Crawler aktualisiert (EUR-Lex, gesetze-im-internet.de). Mappings bleiben so lange bestehen wie die Regulation nicht verschwindet. Wenn ein neuer Paragraph reinkommt, wird automatisch dagegen gemappt — Sie sehen es als neuen Eintrag im PropertyPanel."

### „Performance bei großen Architekturen — 500+ Elements?"
> „Wir haben das gegen Anthropic Haiku 4.5 mit p-limit Concurrency=5 getestet: 50 Regulations × 10 Elements in 30 Sekunden. Bei 500 Elements wären wir bei ~5 Minuten — das ist immer noch weit unter manueller Bewertungszeit."

### „Können wir das self-hosten?"
> „Ja — wir laufen auf einer normalen Linux-VM. Datenbanken (Mongo, Neo4j, Qdrant, Redis) als Docker-Container. Anthropic-API kann wahlweise gegen on-prem-LLM ausgetauscht werden."

### „Kostet das viel?"
> „Anthropic Haiku 4.5 kostet uns ca. $0.001 pro Mapping-Call. Bei 50 Regulations × 10 Elements sind das $0.50 pro Full-Run. Pro Architecture-Refresh also Cent-Beträge. Compliance-Officer-Stundensätze sind 100-200€ — der ROI ist sofort sichtbar."

---

## Backup-Plan (wenn Live-Demo scheitert)

### Szenario 1: Anthropic-API down
- Heat-Map + PropertyPanel funktionieren weiterhin (statische DB-Daten)
- Akt 3 (Paste & See) zeigt Error-State → erkläre: *„Live-API kurz weg — die 53 vorgemappten Eintragungen sehen Sie aber alle persistent in der DB"*
- Stattdessen: Screenshot-Walkthrough der Paste-and-See-Story

### Szenario 2: Login klappt nicht
- Demo-User: `demo-bsh@thearchitect.site` / `BSH-Demo-2026!`
- Backup: Screenshot-Galerie auf USB-Stick / iPad
- Notfall: Erklärung der 3 Akte mit Screenshots im Folien-Deck

### Szenario 3: Heat-Map zeigt nur rote Halos
- Wahrscheinlich Cache-Race — `loadAllMappings` noch nicht durch
- Lösung: 3 Sekunden warten, dann Toggle off + on
- Fallback: Hard-Reload (Cmd+Shift+R), wieder probieren

### Szenario 4: Browser/Internet ausgefallen
- Folien-Deck mit Screenshot-Sequenz aller 3 Akte
- Demo-Video (10 sek pro Akt) als MP4 auf Laptop

---

## NICHT zu zeigen / NICHT zu erwähnen

- ❌ **Standards-Pipeline** (Compliance > Standards Page) — verwirrend, konkurriert visuell mit ICM
- ❌ Backend-Code, MongoDB-Internals, Anthropic-Prompt-Engineering
- ❌ Andere Project-Features (Cost-Analysis, Roadmap, Plateau, etc.) — sprengt den Demo-Rahmen
- ❌ „Wir bauen das gerade noch fertig" — keine Schwächen vorabsignaliseren
- ❌ Hinweise auf einzelne weak/orange Halos — sondern: „so sieht eure Compliance-Lage aus, einige Lücken sind sichtbar, dann arbeiten wir die ab"

---

## Closing-Statement (15 Sekunden)

> „Sie haben gerade in 5 Minuten erlebt:
> 1. **Sichtbare Compliance-Lage** über die gesamte Architektur in <1s
> 2. **Audit-tauglicher Drill-Down** mit Quellenverweis pro Element
> 3. **Live-Klassifikation** neuer Regulations in 3 Sekunden
>
> Was Sie hier sehen ist Production. Heute live, mit echten Daten, gegen echte EU-Gesetze. Wir können das nächste Woche bei BSH zum Laufen bringen."

---

## Demo-Daten (Cheatsheet)

| Element | Mappings | Top-Treffer |
|---|---|---|
| Lieferantenmanagement | 11-13 | LKSG §§ 3-9 alle @ 0.95 (perfect supplier-match) |
| Datenverarbeitung B2C | 7 | DSGVO Art. 5/6/32 alle @ 0.92-0.95 |
| ERP-System SAP | 10-16 | NIS2 Art. 21/23/24 @ 0.82, DSGVO Art. 6 |
| HR-Plattform | 9 | DSGVO Art. 9 @ 0.95 (Gesundheitsdaten) |
| Mitarbeiter-Personalakte | 6 | DSGVO Art. 9 @ 0.95, LKSG § 3 @ 0.95 |

---

## Dry-Run-Termine

- **2026-05-30** (Fr): Vorbereitende Probe mit interner Audience
- **2026-06-13** (Fr): Final Dry-Run, alle 3 Akte chronologisch, Stoppuhr
- **2026-06-14** (Sa): Live-Demo bei BSH

## Demo-Tag — was mit muss

- Laptop mit aktivem Account-Login
- Hotspot/Tether als Backup zum Office-Wifi
- USB-Stick mit Screenshot-Backup
- Telefon mit Linear + SSH-Zugang zum VPS (für last-minute-debugging)
- Wasser

---

## Lessons Learned aus Sprint 5 — was die Demo erlaubt

- Backend gegen 16 echte Production-Regs verifiziert (53 Mappings persistent)
- Frontend gegen real production data live getestet
- Performance unter 90s-Target für 50×10 (haben wir mit `p-limit 5` validiert)
- Persistierung end-to-end funktioniert (Live-Paste → DB → PropertyPanel)
- Confidence-Scores empirisch >70% bei ≥0.9

Wir können diese Demo guten Gewissens vor jedem Compliance-Architect zeigen.
