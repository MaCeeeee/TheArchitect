# THE-551 — Ist die Ziel-Architekturebene aus der Handlung ableitbar?

**Verdikt: ❌ trägt nicht.** Die Ebene ist keine Eigenschaft der Handlung —
sie ist eine Eigenschaft der **Landschaft im Einzelfall**. Genau die
Abbruchbedingung, die das Ticket vorab benannt hat: „sie bleibt eine
Einzelfall-Entscheidung des Mappings."

- Positiv-Kontrolle (Kette, Schwelle ≥ 70 %): roh 37,2 % → **nach belegtem
  Harness-Fix 51,2 %** → ❌
- Trenn-Paare: 3/3 → ✅
- κ (primär): 0,616 → ✅ (die Rubrik ist kodierbar — das rettet die Achse nicht)

## 1. κ-Doppelkodierung (26 Handlungen, primäre Ebene)

| Größe | Wert |
| --- | --- |
| Rohübereinstimmung | 20/26 |
| Cohen's κ (n-kategorial) | 0,616 |
| unlesbare B-Kodierungen | 0 |

Dissense (A = eingecheckte Tabelle, B = LLM mit Rubrik, blind):
- betroffenenrechte-bearbeiten: A=business · B=application
- loeschung-durchfuehren: A=application · B=technology
- folgenabschaetzung: A=business · B=data
- verzeichnis-fuehren: A=business · B=data
- resilienz-governance: A=business · B=strategy
- revision-ueberwachung: A=business · B=technology

## 2. Positiv-Kontrolle — adjudizierte Gold-Mappings (27 Fälle, 86 Paare)

**Benannter Harness-Fehler im ersten Lauf:** die req-self-Goldens sprechen
ArchiMate — `data_object`-Elemente tragen dort `layer: "information"`, der
Antwortraum sagt TOGAF `data`. 24 Paare fielen am **Wort**, nicht an der
Ableitung (0/24). Die Äquivalenz ist mechanisch belegt (ausschließlich
`data_object` trägt `information`) und als `normalizeGoldLayer` fixiert —
nur diese eine Brücke, kein weiteres Weichzeichnen.

| Größe | roh | nach Brücke |
| --- | --- | --- |
| (Fall × Gold-Element)-Paare | 86 | 86 |
| davon Kette ohne Handlung/Ebene | 2 | 2 |
| Treffer | 32 | 44 |
| **Trefferquote über die ganze Kette** | 37,2 % | **51,2 % (Schwelle 70 %)** |
| Trefferquote nur zugeordnete Paare | 38,1 % | 52,4 % |

### Die Fehlerstruktur — wo die Ableitung verfehlt

| Gold-Ebene | Treffer | Lesart |
| --- | --- | --- |
| business | 7/8 | wo die Ableitung zielt, trifft sie |
| application | 7/10 | ebenso |
| **technology** | **18/44** | der Miss-Block |
| data | 12/24 | halb |

Der Kern: das menschlich adjudizierte Mapping beantwortet „wo wird es
umgesetzt?" mit der **konkreten Landschaft** — die Löschpflicht zeigt auf
tech-mongodb, tech-redis, tech-neo4j (die Systeme, **in denen** gelöscht
wird). Die Handlung trägt nur „**was** getan wird"; welche Infrastruktur
dahintersteht, weiß erst die Landschaft. Eine Mengengröße, die das abdecken
würde (3+ Ebenen je Handlung), fiele am eigenen Trivialitäts-Guard.

## 3. Negativ-Kontrollen

- betroffene-informieren ↔ verschluesselung-pseudonymisierung: business vs technology → ✅ getrennt
- verzeichnis-fuehren ↔ zugriffskontrolle: business vs technology → ✅ getrennt (Mengen-Überlapp: application)
- einwilligung-verwalten ↔ revision-ueberwachung: application vs business → ✅ getrennt (Mengen-Überlapp: business)

Guards: häufigste primäre Ebene 69 % (business) · mittlere Mengengröße 1,73 ·
Verteilung primär: business 18 · technology 4 · application 2 · data 2

## Konsequenz für THE-546

**Kein Ebenen-REQ.** Die Sollseite („was verlangt dieses Gesetz von meiner
Applikationslandschaft?") ist aus der Handlung **allein** nicht ableitbar;
sie braucht die Landschaft als Input und bleibt eine Mapping-Entscheidung je
Einzelfall. Was überlebt, ist schwächer und ehrlich: die Handlung taugt als
**Prior** für die Prozess-/App-Seite (dort hohe Präzision), nicht als
Vorhersage der vollen Element-Menge.

## Grenzen

- Prüfstoff sind die 27 adjudizierten Golden-Fälle im Repo, nicht der volle
  Prod-Mapping-Bestand (Begründung: Pre-Flight-Kommentar am Ticket). Gleiches
  Skript läuft unverändert gegen einen DB-Export.
- Kodierer B ist ein LLM mit derselben Rubrik — das misst die Stabilität der
  Rubrik, nicht menschliche Übereinstimmung. Ein menschlicher Zweitkodierer
  bleibt der stärkere Test.
- Die Ticket-Beispiel-Ids der Trenn-Paare existieren im Katalog nicht; ersetzt
  durch reale Paare gleicher Absicht (im Skript benannt).
- Ein negatives Verdikt ist ein gültiges Ergebnis — dieses hier ist eines.
