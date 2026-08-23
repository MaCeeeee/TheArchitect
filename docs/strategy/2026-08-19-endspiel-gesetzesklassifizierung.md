# Endspiel: Die Gesetzesklassifizierung produktiv machen

**19.08.2026 · Auftrag: den linken Ast schließen — „um jeden Preis". Der Preis steht unten, beziffert.**
**Beweislage: 8 eigene Messungen · 24 adversarial verifizierte arXiv-Arbeiten (13-Agenten-Sweep) · 11 Red-Team-Angriffe, alle eingearbeitet.**

---

## Das Urteil vorweg

Das Kapitel schließt in **vier Zügen über ~5 Wochen** — nicht, weil ein besseres Modell fehlt, sondern weil die Arbeitsteilung falsch war: Ein LLM riet Adressaten in einen Katalog, den niemand je auf Deckung geprüft hatte, und niemand konnte dem Ergebnis widersprechen. Das Endspiel ersetzt Raten durch **drei Zeugen, die einander widersprechen können** — Parser, LLM-Span-Extraktion, Schwester-Sprachfassung — plus eine Abnahme-Statistik, die mit ~70 menschlichen Urteilen **Konfidenzintervalle über alle 1750 Bestimmungen** legt. Und: Das Retrieval (44 % Recall) ist ein *unabhängiger* Engpass mit eigenem Tor — seine Diagnose startet **heute parallel**, nicht „danach".

---

## Beweislage

### Eigene Messungen dieser Woche

| Befund | Zahl | Konsequenz |
|---|---|---|
| Adressaten-Katalog deckt nicht (Blind-Adjudikation, 36 Fälle) | 50 % Katalog-Lücke · 36 % Klassifikator-Fehler | zweischichtiges Modell (THE-692), zwei getrennte Baustellen |
| Mehrfach-Adressaten | 41 % (Untergrenze) | `roles[]` mehrwertig; Deontik je (Bestimmung, Rolle)-Paar |
| Achsen orthogonal; bindingness/normKind leer | max. U 0,44 · 0,014 Bit | Akt-Metadaten statt Bestimmungs-Achsen |
| Zweck-Kontext im Prompt | **−9,8 pp** | Anker-Verbot bleibt; jedes neue Prompt-Format nur per A/B |
| Titel-mechanisch klassifizierbar (Artikel-Ebene) | 15,2 % | Muster-Schicht ist Tor-Sammlung, kein Hauptweg |
| Naives Subjekt-Pflicht-Muster (Artikel-Ebene) | 5,0 % | ohne Klausel-Zerlegung keine mechanische Extraktion |
| **Satztyp-Verteilung (heute, heuristisch):** unter den Pflichtsätzen sind passiv/unpersönlich/anaphorisch die **Mehrheit** (EN: ~55 % der deontisch markierten) | EN: 25,6 % aktiv-explizit · 18,9 % nur passiv · 31,7 % ohne greifbares Muster | **Die Red-Team-Warnung trifft zu: „mechanischer Hauptweg" ist gestrichen.** Parser ist Zeuge, nicht Hauptweg. |
| DE/EN-Heuristik-Asymmetrie (dieselben Gesetze, 56 % vs. 7,5 % „kein Marker") | — | Sprachen brauchen getrennte Messungen; die Differenz selbst ist ein Fehlerdetektor |

### Literatur (verifiziert, nur was trägt)

| Arbeit | Befund | Übernahme |
|---|---|---|
| **2505.00479** — Regulatory Statements in EU Legislation | Dependency-Parsing 80 % vs. Transformer 84 %; Inter-Annotator **α = 0,58** | gleicher Korpustyp: Parser ist eine billige zweite Zeugin, 4 Punkte hinter ML — und selbst Experten sind sich beim Adressaten uneins → geschlossener Antwortraum im Bogen ist Pflicht, Maschinen-Gates dürfen nie mehr Präzision verlangen als das Gold hergibt |
| **2001.11245** — Sleimi et al., Legal Metadata | Regeln auf Dependency-Parses: P 97/82, R 95/92 (frz. Recht) | Referenzdesign Schicht 1: Adressat als **Span mit Fundstelle**, zweistufig |
| **2211.12752** — LEXDEMOD | Deontik ist **agent-relativ**: dieselbe Klausel, je Partei andere Modalität | publizierte Form unserer 41 %: `obligationKind` je (Bestimmung, Rolle) — vor dem Bau ins Schema |
| **2608.03898** — Annotares (deutsche Gesetze) | BERT/LLM > Regeln bei deutscher Rechtssyntax | DE-Extraktion nie von EN-Ergebnissen ableiten; eigenes DE-Gold |
| **2606.02971** — EURO-5K | generisches BERT = Legal-BERT (0,89 F1) | kein Legal-BERT-Umweg; Berichtspflichten als externe Stichprobe für die Gattung „Unionsorgan" |
| **2403.07008** (PPI) + **2402.07214** + **2305.17926** | Abnahme mit wenigen Urteilen + Streit-Selektion + Judge-Bias | **die Abnahme-Statistik des Endspiels**: ~70 frische Urteile → unverzerrte CIs je Achse über alle 1750 (±5–10 pp realistisch); LLM-as-Judge nur mit Positions-/Anker-Kontrollen |
| **2603.25450** + **2305.14240** | Modell-Dissens als label-freies Korrektheitssignal; EN als Primärkanal | **DE/EN-Doppellauf, getrennte Prompts; Label-Differenz füllt die Adjudikations-Queue.** Ehrlich: trifft nur die 36-%-Fehlerklasse, nicht die Katalog-Lücken |
| **2408.10343** (LegalBench-RAG) + BSARD-Linie | Retrieval-Messung muss einheiten-genau sein | Recall-Harness härten, Fehler nach „falsches Gesetz" vs. „falsche Stelle" auszählen — *vor* jedem Hebel |
| **Fehlanzeigen (wertvoll):** EuroVoc als Retrieval-Vorfilter — keine gemessene Evidenz. Gleich verbindliche Sprachfassungen als gegenseitige Aufsicht — **Nische unbesetzt.** | | Option D degradiert; die Nische ist unser Alleinstellungs-Stoff |

### Red-Team: die fünf Angriffe, die den Plan geändert haben

1. **Zirkuläres, unterdimensioniertes Gold** (14 Urteile, teils auf trunkiertem Text, mit derselben Lesart erzeugt) → frisches Gold ≥ 30, **stratifiziert nach Satztyp**, Volltext, blind; die 22 kontaminierten Urteile zählen in keiner Aggregation; CI statt Punktschwelle.
2. **Die linguistische Annahme** → heute gemessen, bestätigt kritisch → Drei-Zeugen-Design statt mechanischem Hauptweg.
3. **Aufwandslüge „1 Woche"** → erst **zwei Gesetze end-to-end** (CRA = NLF-Familie, DSGVO = Querschnitt), Wörterbuch-Deckung und Aufwand **messen**, dann Rollout mit der gemessenen Zahl terminieren; gesetzesübergreifende Definitions-Verweise bleiben zunächst `unresolved`.
4. **Reihenfolge** → THE-671 hängt an nichts: startet sofort parallel; Schema-Kontrakt wird vor Zug-3-Baubeginn eingefroren; **zwei getrennte Tore** statt einem vermengten Exit.
5. **Leakage & Produkt-Bruch** → Held-out heißt: beide Sprachfassungen UND Erwägungsgründe der Familie raus, NN-Leakage-Audit, korpusfremder Messpunkt; Migration mit Contract-Tests, Dual-Read, `unmapped`-Alarm (nie stilles Nichts), Aggregations-Regel für Mehrwertigkeit vorab.

---

## Die vier Züge

### Zug 0 — Heute: Entscheide, die keine Messung mehr brauchen

- **THE-691 direkt entscheiden:** `bindingness`/`normKind` werden Akt-Metadaten aus dem Dokumenttyp (mechanische Herkunft, CELEX-Sektor kennt sie fehlerfrei). Eval-Filter sofort — die Achsen verlassen jede Genauigkeits-Aggregation. Die geplante Negativ-Kontrolle ist zum 10-Minuten-Smoke-Test degradiert (Red-Team: „Ritual, kein Experiment").
- **Satztyp-Verteilung:** gemessen (oben). Die Strategie-These wurde daraufhin korrigiert, *bevor* sie galt.

### Zug 1 — Sofort parallel: Retrieval-Diagnose (THE-671, eigenes Tor)

Fixture härten (Leakage-Regeln oben, Spielzeug-RL als korpusfremder Messpunkt) → Fehler-Taxonomie über die 44 % (falsches Gesetz vs. falsche Stelle im richtigen Gesetz) → **erst danach** ein Parameter-/Präfix-Experiment. Kein Hebel vor der Diagnose; EuroVoc nur, falls die Taxonomie auf „falsches Gesetz" zeigt.

### Zug 2 — Woche 1: Das Adressaten-Fundament (THE-692-Proben, richtig dimensioniert)

- **Frisches Gold ≥ 30**, stratifiziert nach Satztyp, Volltext, blind (Frage: „Wer ist verpflichtet?" — ohne die Subjekt-These zu nennen).
- **Gattungs-Regeln + Grenzfall-Katalog vorab schriftlich** (benannte Stellen, öffentliche Auftraggeber, Normungsorganisationen, Betroffene mit Pflichten). Zwei unabhängige Zuordner, κ-Kriterium, „unklar"-Eimer erlaubt und gezählt: **> 10 % unklar = Gattungsliste durchgefallen.** Kein Bestehen durch Dehnung.
- **Generalisierung an zwei korpusfremden Gesetzen:** Spielzeug-RL 2009/48 (Mechanik-Test) + Vergabe-RL 2014/24 (der harte Test).
- **Drei-Zeugen-Extraktion als Design:** (1) Parser, wo er feuert — hohe Präzision, Span, Fundstelle; (2) **LLM-Span-Extraktion**: zeigen statt raten — das Modell markiert die Textstelle des Adressaten (Anti-Barnum), es wählt nicht aus 19 Rollen; (3) Schwester-Sprache: **EN führend, DE als Konsistenz-Check mit Divergenz-Flag** — Dissens füllt die Queue, entscheidet nie still.
- `obligationKind` wandert auf das (Bestimmung, Rolle)-Paar.

### Zug 3 — Woche 2–4: Produktivbau (nach dem ADR, nicht daneben)

- **ADR zuerst** — der Schema-Diff (roles[], Gattung, Herkunft, Mapping-Tabelle) ist der eingefrorene Kontrakt und **Blocker für jeden Commit**. Eine Identitäts-Story, nicht zwei.
- Zwei Gesetze end-to-end → messen → Rollout mit gemessener Zahl. LkSG: eigener Slice mit eigenem Parser-Test **oder sichtbar aus dem Exit-Kriterium ausgenommen** — nie ein stilles Loch.
- Migration: Contract-Tests je Feature vor dem Umbau, Dual-Read-Phase, `unmapped`-Alarm, vorab definierte Aggregation für Mehrwertigkeit (count distinct provisions).
- Exit **gesplittet**: mechanischer Anteil ≥ X % · LLM-Rückfall-Genauigkeit separat auf eigener Stichprobe ≥ Y % · Attest unterscheidet Herkunft sichtbar. Die Hoffnung „die 36-%-Klasse verschwindet strukturell" ist als **Hypothese** markiert und wird im Re-Typing nachgemessen.

### Zug 4 — Woche 4–5: Abnahme, die den Namen verdient

**PPI-Abnahme:** Klassifikation über alle 1750 + ~70 frische Experten-Urteile (Vier-Ausgänge-Rubrik) → **unverzerrtes Konfidenzintervall je Achse**, veröffentlicht im Produkt-Attest. Die DE/EN-Dissens-Queue ersetzt „still falsch" durch „sichtbar strittig". Danach ist das Kapitel produktiv — nicht weil alles richtig ist, sondern weil **jede Zahl ein Intervall, jede Klassifikation eine Herkunft und jeder Streitfall eine Queue hat.**

---

## Die zwei Tore (getrennt, vorab registriert)

**Typisierungs-Tor:** Jede Bestimmung trägt `roles[]` (wörtlich + Fundstelle, mehrwertig) + Gattung + Deontik je Rolle, Herkunft `mechanisch | llm-span | geerbt | gemappt`; PPI-CI je Achse liegt vor; Rückfall-Quote und -Genauigkeit separat berichtet; 0 stille `unmapped`.

**Retrieval-Tor:** Recall auf der gehärteten Familien-Held-out-Fixture ≥ vorab registrierter Schwelle **und** ein korpusfremder Messpunkt; Fehler-Taxonomie veröffentlicht.

## Kill-Liste (entschieden, nicht vertagt)

EuroVoc-Vorfilter vor der Diagnose · Legal-BERT-Feintuning · Snorkel/Weak-Supervision-Maschinerie · Deontik-Logik-Formalisierung · Zweck-Kontext im Klassifikator · Nachbewertung der 22 trunkierten Bogen-Urteile (frisches Gold ist billiger und sauberer) · agent-konditionierte Prompts ohne A/B · **„mechanischer Hauptweg" als Behauptung** — heute an den eigenen Daten widerlegt.

## Nebenprodukt

Die Literatur kennt **kein** Verfahren, das die gleich verbindlichen EU-Sprachfassungen als gegenseitige Aufsicht nutzt. Wir bauen es nebenbei. Das ist Differenzierungs-Stoff — fürs Produkt („24 Fassungen, ein Wächter") und gegebenenfalls für ein Paper.

## Kalender, ehrlich

| Woche | Läuft |
|---|---|
| 0 (heute) | Zug 0 fertig · Zug 1 gestartet |
| 1 | Zug 2: Gold-Session (~2 h Mensch) + Generalisierungs-Proben |
| 2–4 | Zug 3: ADR → 2 Gesetze → gemessener Rollout |
| 4–5 | Zug 4: PPI-Abnahme, Tore prüfen, Kapitel schließen |

Das Red-Team hat die 48h/1-Wochen-Version dieser Strategie kassiert. Dieser Kalender hält, weil er nach den ersten zwei Gesetzen mit gemessenen Zahlen **neu terminiert wird** — das steht hier als Zusage, nicht als Vorbehalt.
