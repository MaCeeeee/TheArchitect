# UC-METH-001 Stufenleiter zur Kohomologie — Abnahmeprotokoll

Messdatum: 20.11.2026 · lokaler Teil auf dem Zweig `feat/uc-meth-001-kohomologie-leiter` vor dem Merge (lokal: Mac, Server und Client aus dem Worktree, MongoDB, Neo4j und Redis in Docker) · Prod-Teil nach dem Deploy von `576c39a` am selben Abend.

**Dieses Protokoll ist unvollständig.** Gemessen sind der lokale Teil (Abschnitte 1–6) und die Leiter auf den Referenzmodellen in Produktion (Abschnitt 7). Offen ist, was den Product Owner braucht (Abschnitt 8). THE-783 wird erst damit geschlossen.

## 1 Landkarte 7.7 gegen die echte Datenbank

Drei leere Projekte, befüllt über die API mit `packages/server/scripts/uc-meth-001/seed-loop-demo.mjs`: drei Kontexte (TE, Produktion, Logistik) mit Mitgliedern, Übersetzungen TE → Produktion ×1, Produktion → Logistik ×10, TE → Logistik ×12 (Variante 3: ×10).

| Lauf | Variante | Ausgabe |
|---|---|---|
| 1 | getrennte Mitglieder | `highest rung: 5` · `pieces: global_obstruction — loop defects 1, face defects 0, dim H1 1` |
| 2 | `--shared-member` (ein Mitglied in allen drei Kontexten) | `highest rung: 5` · `pieces: local_defect — loop defects 1, face defects 1, dim H1 0` |
| 3 | `--consistent` | `highest rung: 5` · `pieces: exact — loop defects 0, face defects 0, dim H1 1` · `canonical scale: Produktion ×1 · TE ×1 · Logistik ×10` |

Alle drei Läufe enden mit Exit-Code 0. Es war die erste Ausführung der drei Abfragen des Loaders und der beiden schreibenden Abfragen gegen ein echtes Neo4j; keine musste korrigiert werden.

Abweichung vom Plan: Der Plan erwartete die Reihenfolge „TE · Produktion · Logistik“. Die erste Messung zeigte, dass die Reihenfolge von den zufälligen IDs abhing. Sie ist jetzt fest: je Gruppe nach Maßstab, dann nach Name.

## 2 Verweigerte Schreibversuche

| Versuch | Antwort |
|---|---|
| Übersetzung auf einer Mitgliedschaft (Komposition Kontext → Mitglied) | 404, in allen drei Läufen |
| Beziehung dieses Projekts, adressiert über ein anderes Projekt desselben Nutzers | 404, in Lauf 2 und 3 |
| Faktor 1e13, Faktor 0, Faktor als Zeichenkette | je 400 |
| Leiter ohne Token | 401 |

Nach den verweigerten Versuchen ist der Leiterbericht in jedem Lauf unverändert.

## 3 Audit

`auditlogs` mit `action: 'set_translation'`: 0 vor der ersten Runde, 9 nach der ersten, 18 nach der zweiten (je drei angenommene Übersetzungen in drei Projekten). Die verweigerten Versuche erzeugen keinen Eintrag. Ein Eintrag enthält `entityType: connection`, die ID der Beziehung und als `after` nur die geprüften Werte (`factor`, `quantity`).

## 4 Browser

Advisor-Panel im echten Client, Block „Ladder to cohomology“ aufgeklappt:

| Projekt | Überschrift | Befund |
|---|---|---|
| 1 | `Ladder to cohomology: rung 5 of 5` | `Global contradiction` · „The translations do not close around a loop.“ · `TE → Produktion ×1 · Produktion → Logistik ×10 · Logistik → TE ÷12 — product 0.8333333, expected 1` |
| 2 | `Ladder to cohomology: rung 5 of 5` | `Local contradiction` · „Contexts that share a member disagree about their translations.“ · `1 triple overlap · dim H¹ = 0` |
| 3 | `Ladder to cohomology: rung 5 of 5` | `Consistent` · „All translations compose. One consistent scale per context exists.“ · `Canonical scale: Produktion ×1 · TE ×1 · Logistik ×10` |

Der Methodenblock zeigt `PA-kategorientheorie`, die Formel `F(g ∘ f) = F(g) ∘ F(f)`, die Grenzen und die Toleranz (0.000001). Beim Laden der drei Projekte gab es keine Konsolenfehler.

Weitere Prüfungen im Browser:

- **Verbindungsauswahl:** Von der Gruppierung TE zu einem Element der Application-Schicht bietet die Auswahl Composition, Aggregation, Realization und Association an. Die Vorauswahl ist Realization, nicht Composition — ein mögliches Hindernis für den Modellierversuch.
- **Lange Namen:** Kontextnamen mit 55 Zeichen ohne Leerzeichen und ein Größenname mit 64 Zeichen brechen im 240 px breiten Panel um; der Container scrollt nicht horizontal.

## 5 Tests und Prüfungen

- Server, die zwölf Suites dieses Vorhabens: 150 Tests grün. Client: 67 Dateien, 536 Tests grün. Typecheck für Server und Client ohne Fehler.
- Voller Server-Lauf: 11 Suites rot, keine aus diesem Vorhaben. Fünf davon gegen `origin/master` nachgemessen (`requirements.routes`, `norm.service`, `governedRetrieval.gate.routes`, `cost-engine`, `rbac`): dort mit denselben Tests rot. Die übrigen sechs stehen auf der Liste der bekannten instabilen Integrations-Suites.
- Drei Reviews (Rechenkern, Sicherheit der Routen, gesamter Zweig) und drei Korrekturrunden. Der schwerste Befund: Die erste Fassung zählte alle Dreiergruppen von Kontexten auf; 700 Gruppierungen mit einem gemeinsamen Mitglied ließen den Prozess nach rund 10 s mit Speichermangel abstürzen. Jetzt 9 ms.
- Blinde Prüfung mit den vor dem Bau versiegelten Szenarien: 31 von 43 bestanden, 1 nicht bestanden (dieses Protokoll fehlte), 11 nicht ausführbar (7 brauchen einen Browser, 4 hängen am Product Owner oder an diesem Protokoll). Für sechs Anforderungen (Gruppen, Komplex, Baseline Stufe 1, δ∘δ = 0, Build, „kein bestehendes Verhalten geändert“) gibt es kein versiegeltes Szenario; sie sind durch die Tests und Reviews belegt, nicht blind.

## 6 Grenzen, die der Bau eingeführt hat

Der Plan kannte sie nicht; sie stammen aus den Reviews.

| Grenze | Wert | Verhalten darüber |
|---|---|---|
| Kontexte je Modell | 200 | Stufe 2 bleibt offen, der Text nennt Grenze und Anzahl |
| Übersetzungen je Größe | 500 | die Größe wird nicht geprüft und in einer Warnung genannt |
| 2-Zellen je Größe | 500 | wie oben |
| Übersetzungen je Bericht | 1.000 | spätere Größen werden nicht geprüft |
| Faktor einer Übersetzung | 1e-12 bis 1e12 | API antwortet 400; im Bestand zählt sie als unbrauchbar |
| gemeldete Widersprüche je Größe | 20 Schleifen, 20 Dreifach-Überlappungen | Gesamtzahl und „and N more“ |
| Anfragen an den Leiter-Endpunkt | 30 je Minute und Adresse | nur in Produktion aktiv |

Gemessen auf dem Mac, nur die Rechnung: Der ungünstigste gefundene Fall innerhalb aller Grenzen braucht 0,92 s (32 Kontexte mit je 10.000 eigenen Mitgliedern und zwei vollen Netzen von Übersetzungen). Ein Modell mit 5.000 Elementen, 10.000 Beziehungen, 50 Kontexten und 100 Übersetzungen brauchte 28 ms (gemessen vor den Korrekturrunden, danach nicht wiederholt). Der Endpunkt antwortete lokal auf dem Beispielprojekt in 19 ms. Auf dem VPS wird alles langsamer sein; das ist nicht gemessen.

Bekannt und nicht behoben:

- Die Antwort kann im ungünstigsten Fall innerhalb der Grenzen einige Megabyte groß werden (sehr lange Schleifen).
- Innerhalb der Toleranz kann das Urteil von den IDs der Beziehungen abhängen (drei parallele Übersetzungen 1, 1,0000009, 1,0000018).
- Gruppierungen können weiterhin keine Motivations- und Implementierungselemente (goal, work_package) per Composition enthalten.
- Übersetzungen lassen sich in diesem Slice nur über die API setzen; der Editor ist Slice 2. Der Text des nächsten Schritts auf Stufe 3 sagt das nicht.
- „Entfernen“ antwortet auch dann mit 200 und schreibt einen Audit-Eintrag, wenn die Beziehung keine Übersetzung trug.

## 7 Leiter auf den Referenzmodellen (Produktion, nur lesend)

Deploy von `576c39a` mit `scripts/deploy-vps.sh`, Exit 0, Health `ok`; der Leiter-Endpunkt antwortet ohne Token mit 401 (vorher 404). Gemessen wurde im App-Container: der Leiterbericht je Modell über die Funktion, die auch der Endpunkt aufruft (drei lesende Abfragen und die Rechnung), fünfmal hintereinander. Die HTTP-Schicht mit Anmeldung und Rechteprüfung ist in den Zeiten nicht enthalten.

| Modell | Elemente | Beziehungen | b0 | b1 | höchste Stufe | Stufe 2 | Methoden rechenbar | Zeit (Median von 5) |
|---|---|---|---|---|---|---|---|---|
| Self-Model | 128 | 196 | 8 | 76 | 1 | offen, 0 Kontexte | 6 von 14 | 104 ms |
| Demo-Modell, ältere Instanz | 156 | 227 | 41 | 112 | 1 | offen, 0 Kontexte | 12 von 14 | 77 ms |
| Demo-Modell, jüngere Instanz | 66 | 103 | 3 | 40 | 1 | offen, 0 Kontexte | 12 von 14 | 52 ms |
| kundenbezogenes Modell | — | — | — | — | 1 | offen | — | — |

- Das Demo-Modell gibt es unter demselben Namen zweimal; beide Instanzen sind gemessen.
- Der allererste Aufruf im frischen Prozess brauchte auf dem größten Modell 1.082 ms, danach 52–130 ms. Die Berichte sind rund 8,5 kB groß.
- Nächster Schritt auf Stufe 2, in allen Modellen derselbe Text: „Model at least 2 contexts: grouping or location elements with composition or aggregation relationships to their members.“
- Stufe 0 warnt im Self-Model und in der älteren Demo-Instanz vor je einem mehrfach vergebenen Elementnamen.
- Im Self-Model fehlt vier Methoden genau ein Eingang: `PA-kanaele` (2 Akteure oder Rollen), `PA-lernkurve` (userCount an 1 Element), `PA-rty` (errorRatePercent an 2 Elementen), `PA-pareto` (annualCost an 5 Elementen). Im Demo-Modell fehlt nur `PA-kanaele`.
- Der Bericht zum kundenbezogenen Modell liegt im privaten Repository; hier steht nur die erreichte Stufe.

Das Ergebnis deckt sich mit der Erwartung aus der Messung vor dem Bau: alle Modelle auf Stufe 1, kein Modell hat Kontexte oder Übersetzungen. Eine Kohomologieklasse entsteht in Produktion bisher in keinem Modell.

## 8 Offen

| Teil | Braucht |
|---|---|
| Urteil je Modell, ob der nächste Schritt verständlich ist (Ziel 3 von 3) | Product Owner |
| Modellierversuch auf einer Kopie des Self-Models bis Stufe 2 (Kill-Kriterium a): erreicht ja/nein, Minuten, Hindernisse | Product Owner |
| Antwortzeit des Endpunkts über HTTP mit Anmeldung | ein Konto in Produktion |
| Sieben versiegelte Browser-Szenarien | blinder Prüfer mit Browser |
