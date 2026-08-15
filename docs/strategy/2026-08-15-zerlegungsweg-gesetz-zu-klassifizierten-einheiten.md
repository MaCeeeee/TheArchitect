# Der Zerlegungsweg: Vom Gesetz zu klassifizierten Einheiten

**2026-08-15 · Ultracode-Durchlauf: 15 Agenten (5 Leser · 3 Entwerfer · 3 Richter · 1 Synthese · 3 Skeptiker) · alle Skeptiker-Auflagen eingearbeitet**

---

## Die Kernidee in vier Sätzen

Die EU hat die Zerlegung ihrer Rechtsakte **bereits amtlich spezifiziert** — die ELI-Subdivisions-Spezifikation definiert ~25 Einheiten-Typen, und ihre Formex-Mapping-Tabelle sagt maschinenlesbar, welches XML-Element welche Einheit ist. Wir erfinden also keine Segmentierung, wir **führen eine Spezifikation aus** — mechanisch, deterministisch, ohne Modell. Die Klassifikation wandert vom Artikel auf die **Klausel** (Absatz bzw. Einleitungssatz + jeder Listenpunkt), weil unsere eigene Messung das erzwingt: Auf Artikel-Ebene sind 89 % der Anforderungs-Extraktionen unlesbar, auf Klausel-Ebene 0,7 % (THE-550). Und die Klausel-Schicht kommt **additiv neben den Bestand** — nach dem Muster, das mit den Erwägungsgründen diese Woche belegt funktioniert hat: eigene Collection, kein bestehender Leser berührt, Rollback ist Nichtstun.

**Warum das die Klassifikations-Frage löst statt sie zu verschieben:** Je feiner die mechanische Einheit, desto größer der Anteil, der *ohne Modell* klassifizierbar ist (Definitions-Artikel, Verweis-Klauseln, Einleitungssatz-Vererbung), desto formelhafter der Rest (Gesetzessprache: 91 % Satz-Klassifikation mit 81 Regex-Mustern, de Maat/Winkels) — und desto seltener trägt eine Einheit mehrere Adressaten. Die Zerlegung ist nicht Vorstufe der Klassifikation; **die richtige Zerlegung ist der größte Klassifikations-Hebel.**

---

## Das Einheiten-Modell

| Einheit | ELI-Code | Identität | Gewinnung |
|---|---|---|---|
| Werk-Expression (Gesetz × Sprache × Fassung) | — | `{familie}:{lang}@{expressionHash}` | mechanisch (Cellar, `{CELEX}.{LANG}.fmx4`) |
| Artikel | `art` | **Content-Hash** `sha256(normText)`; amtlicher Pfad `art_14` nur Alias | mechanisch (amtl. XPath: `//ENACTING.TERMS//ARTICLE`) |
| Nummerierter Absatz | `par` | Content-Hash; Alias `art_14.par_1` | mechanisch (`ARTICLE/PARAG`) |
| Unnummerierter Absatz | `unp`/`sub` | Content-Hash | mechanisch (`PARAG/ALINEA`) |
| Punkt / Spiegelstrich | `pnt`/`idt` | Content-Hash; Alias `…pnt_a` | mechanisch (`LIST/ITEM`) |
| Einleitungssatz / Schlussteil | `inp`/`wrp` | Content-Hash | mechanisch (ALINEA vor/nach LIST) |
| Erwägungsgrund | `rct` | Bestand (2.554, eigene Collection) | mechanisch (gebaut, THE-681) |
| Annex | `anx` | Content-Hash, **eine** Grob-Einheit, `fineStructure=false` | mechanisch (vom amtl. Mapping ausgenommen — ehrlich grob) |
| Alt-Akt-Artikel (vor Mai 2004; lksg) | — | Bestand + `structureSource='html-coarse'` | mechanisch (heutiger HTML-Pfad) |
| **Klausel** *(Klassifikationsträger — abgeleitete Sicht, keine neue Speicherwahrheit)* | — | verweist auf Einheiten-Ids | Regel: `par` ohne Liste → die Klausel ist der `par`; `par` mit Liste → `inp` + jeder `pnt`/`idt` einzeln |

**Drei Identitäts-Regeln,** alle aus Messungen: (1) **Content-Hash, nie Position** — bei einer umnummerierenden Novelle fanden Content-Hashes 30/30 Einheiten wieder, positionale Ids nur 24/30, und die 6 falschen wussten es nicht. (2) Der `unitHash` ist der **einzige maschinelle Fremdschlüssel** (Requirements-Kette, Graph, Katalog-Belege); die ELI-Adresse ist Anzeige — ein Lint-Tor verhindert positionale Referenzen. (3) **Eine Strukturquelle je Rechtsakt** — die Spur-Weiche (Formex oder HTML-grob) ist exklusiv; nie zwei Antworten auf dieselbe Frage.

**Sprachstrategie (Skeptiker-Auflage):** Content-Hashes sind sprachgebunden — jede Klausel existiert als DE- und EN-Einheit. Klassifiziert wird **eine** Sprache je Familie (die im Korpus führende); die Schwester-Fassung wird über den positionalen Alias konkordiert und erbt die bestätigte Klassifikation mit Herkunfts-Kennzeichen. Widersprüche zwischen Sprachfassungen sind ein *Befund* (wie beim CRA-Art.-14-Fund), nie stille Wahl.

---

## Die Pipeline: Gesetz → klassifizierte Einheiten

| # | Schritt | Entscheider |
|---|---|---|
| 1 | **Akquise:** Cellar-Abruf `{CELEX}.{LANG}.fmx4`, in einen versionierten **Fixture-Cache** (Entwicklung läuft gegen den Cache, nie gegen die Live-Quelle — EUR-Lex drosselt IPs) | mechanisch |
| 2 | **Spur-Weiche:** fmx4 vorhanden → Formex-Spur; sonst → HTML-Grob-Spur mit `structureSource`-Pflichtfeld | mechanisch |
| 3 | **Zerlegung:** amtliche XPath-Tabelle anwenden; Annexe als Grob-Einheit abtrennen | mechanisch |
| 4 | **Äquivalenz-Tor (Auflage):** Formex-Blätter *gegen den unabhängigen HTML-Bestand* diffen — nicht nur selbstreferenziell gegen die eigene Datei. Klärt zugleich die Expression-Wahl (konsolidiert vs. Basis-Akt). Toleranz vorab fixiert; Verletzung → Quarantäne | mechanisch |
| 5 | **Vollständigkeits-Tor:** Konkatenation aller Blätter ≥ 99,5 % der Zeichen der Erlass-Bestimmungen; keine Einheit > 15.000 Zeichen ohne Unterstruktur (der Dokument-Schwanz-Wächter) | mechanisch |
| 6 | **Identität:** `normText` → `unitHash`; Re-Crawl derselben Expression ⇒ identische Id-Menge (Idempotenz-Test) | mechanisch |
| 7 | **Klausel-Ableitung** per Regel (s. o.); Satz-Ebene wird **nicht** unterschritten (Standards-Loch: kein Standard vergibt Satz-IDs) | mechanisch |
| 8 | **Muster-Vorklassifikation:** Regex-Schicht je Sprache getrennt (Definitions-, Verweis-, Änderungs-, Inkrafttretens-Klauseln; deontische Marker als Feature). Muster feuern nur bei Eindeutigkeit; jedes Muster hat ein eigenes Precision-Gate **mit Mindest-Feuerzahl** (≥ 20 am Golden — 1/1 ist keine Messung) | mechanisch |
| 9 | **Einleitungssatz-Vererbung:** nennt der `inp` Subjekt + Deontik und der Listenpunkt keinen eigenen Akteur, erben die Punkte die Rolle. **Auflage:** Die Rubrik definiert den *wirksamen Adressaten*, nicht das grammatische Subjekt — „Die Mitgliedstaaten stellen sicher, dass [Betreiber] …" ist ein Pflicht-Stratum im Golden, denn hier würde die naive Vererbung exakt den −9,8-pp-Fehlmodus deterministisch nachbauen | mechanisch, eigenes Gate |
| 10 | **LLM-Klassifikation der Rest-Klauseln:** Haiku, geschlossener Werteraum (tp-4-Prinzip), OOV verworfen, **kein Zweck-Kontext** (Anker-Verbot, −9,8 pp gemessen); je Klausel eine Rolle **plus** Beobachtungskanal `partyRoleObserved` **plus persistentes `multiActor`-Flag** aus dem Koordinations-Detektor („X und Y …") — damit Mehr-Akteur-Fälle unterhalb jeder Schwelle im Bestand identifizierbar bleiben | LLM, `status=suggested` |
| 11 | **Adjudikation:** blinder Bogen, 4-Klassen-Rubrik (κ 0,308 → 0,681 kam aus dem Antwortraum), eingefrorene Stichprobe mit Positions-Pin; Zweck-/Telos-Material erscheint **nur hier** (Hermeneutik-Zuordnung: Zweck → Mensch) | Mensch, `status=confirmed` |
| 12 | **Rollup zur Artikel-Sicht:** Klausel-Klassifikationen aggregiert (Rollen als *Menge*); der bestehende Anwendbarkeits-Join bleibt bis zum Kontrakt-Wechsel unverändert bedienbar. **Auflage:** Ein Artikel wechselt erst auf Klausel-Rollen, wenn sein Klausel-Set *vollständig* adjudiziert ist — keine Verengung durch die erste bestätigte Klausel | mechanisch |

---

## Der Klassifikationsplan

**`partyRole` (der Kern):** dreistufig — Muster/Vererbung mechanisch, Rest LLM, Bestätigung Mensch. Die Einwertigkeits-Frage (THE-675) wird **nicht als gelöst behandelt**, sondern auf der richtigen Ebene neu gemessen: Die Klausel-Zerlegung *sollte* Mehr-Akteur-Fälle drastisch reduzieren — das ist plausibel, aber die Literatur hat genau hier ihre Lücke (keine Arbeit misst kontrolliert, dass Segmentierung Adressaten eindeutiger macht). Deshalb ist es bei uns eine **eigene Messung mit Vorab-Schwelle** (Slice 4), und die THE-675-Blindmessung (150er, Positiv-/Negativ-Kontrollen) wird auf Klausel-Ebene geführt statt auf Artikel-Ebene wiederholt. Das 67er-Beobachtungskanal-Stratum läuft als **Berichtsmetrik** mit, nicht als Go/No-Go — es ist eine schema-geformte Verdachtsstichprobe.

**`provisionKind`:** großteils mechanisch (Definitions-/Verfahrens-/Verweis-Muster; die gemessene Implikation `definition → partyRole=na` wird ein Tor). **`obligationKind`:** LLM je Klausel; deontische Marker als Feature, nie als alleinige Regel. **`normKind`/`bindingness`:** werden am EU-Korpus **nicht mehr je Einheit klassifiziert**, sondern als Akt-Eigenschaft geführt — aber als **korpusabhängig gekennzeichnet, nicht gestrichen** (die offene Mensch-Entscheidung zu den toten Achsen wird hier respektiert, nicht überholt; in einem Korpus mit Leitlinien oder chinesischem Recht kehren beide als Einheiten-Achsen zurück). **Kanonische Handlungen:** binden künftig an `unitHash` statt an Artikel — die Klausel ist die Ebene, auf der „vorfall-melden-behoerde" in seine drei Fristen zerfällt.

**Metrik-Ehrlichkeit (Auflagen):** macro-F1-Gates nur über Klassen mit vorregistriertem Mindest-Support ≥ 20 (die Minkova-Falle: seltene Klassen erzeugen F1 = 0 konstruktionsbedingt); Familien-Gates nur auf Strata mit vorregistrierter Mindestgröße, sonst Pool-Bildung oder Monitoring statt Gate; jedes Golden weist sein eigenes Inter-Annotator-Rauschen aus, und kein Maschinen-Gate verlangt mehr Präzision, als das Gold selbst hergibt (Human-Decke: α 0,58–0,78).

---

## Der Migrationsweg — sieben Slices, jeder mit Kill-Kriterium

> Durchgängige Regeln: jeder Slice additiv und rückholbar; Schwellen **vor** dem Bau; leere Messung ist kein Bestehen; Varianz durch Mehrfachläufe; Adjudikations-Fenster sind das knappste Gut und werden **vollständig** gezählt (es sind fünf, nicht drei: Zerlegungs-30er, Muster-200er, Klausel-A/B-Bogen, Requirements-Lesbarkeit, Join-Golden-Neuabnahme).

**Slice 0 — Beschaffungs-Spike (read-only).** Cellar-Erreichbarkeit von Mac *und* Server B messen; fmx4 für alle 13 EU-Familien beschaffen und als versionierten Fixture-Cache einfrieren; Expression-Wahl (konsolidiert vs. Basis-Akt) je Familie dokumentieren. *Kill:* < 10 Familien mit brauchbarem fmx4 → Formex-Spur schrumpft auf die gedeckten, Rest bleibt deklariert auf der HTML-Spur.

**Slice 1 — Zerleger + Einheiten-Collection (additiv).** Formex-Parser nach amtlicher XPath-Tabelle; eigene Collection `units` (Muster: `recitals` — kein bestehender Leser sieht sie); Äquivalenz- und Vollständigkeits-Tor. **Auflage eingebaut:** Der Artikel-Bestand (`fullText`, `versionHash`) wird **nicht angefasst** — Formex-Text ist ein Zusatzfeld; ein etwaiger Quellen-Wechsel des Bestands ist ein eigener, späterer Migrations-Slice mit Hash-Konkordanz. **Vorbedingung:** ein ADR, das die Identitäts-Story klärt — `unitHash`+ELI-Alias wird ausdrücklich als Umsetzung von ADR-0004 E2 deklariert (mit @eId-Konkordanz) oder ADR-0004 supersediert. Eine dokumentierte Identität, nicht zwei. *Kill:* Äquivalenz-Tor reißt bei > 2 Familien → Expression-Frage zurück an den Menschen.

**Slice 2 — Zerlegungs-Golden (30er, Mensch).** 30 Artikel quer über Familien, von Hand in Klauseln zerlegt, **doppelt kodiert: κ ≥ 0,6 ist Vorbedingung dafür, dass es „Gold" heißen darf** (Auflage — das Artikel-κ überträgt sich nicht automatisch auf den neuen Einheitentyp). Parser dagegen: Schwelle ≥ 95 % identische Schnitte. Enthält das Novellen-Golden (30 Einheiten vor/nach einer Novelle, Wiederfindung per Hash ≥ 29/30). *Kill:* Menschen können die Klausel-Grenze selbst nicht reliabel ziehen (κ < 0,6) → der Antwortraum ist das Problem, zurück zur Rubrik — nicht mehr Modell.

**Slice 3 — Muster-Schicht + Vererbung (mechanisch).** Regex-Katalog je Sprache; 200er-Golden mit Pflicht-Strata (Definitions-, Verweis-Klauseln, „Mitgliedstaaten-stellen-sicher"-Konstruktionen, Koordinations-Fälle). Gates: Precision ≥ 0,98 **bei ≥ 20 Feuerungen je Muster**, Vererbungs-Fehlerquote im Pflicht-Stratum = 0 adjudizierte Abweichungen; Koordinations-Detektor mit eigenem P/R-Gate. *Kill:* Muster-Abdeckung < 15 % aller Klauseln → Schicht bleibt als Tor-Sammlung, LLM übernimmt mehr.

**Slice 4 — Die Kern-Messung: klassifiziert die Klausel besser?** **Auflage eingebaut — das Gate ist neu ausgelegt, das alte war statistisch unentscheidbar** (0,2 pp über einer 74,8-%-Baseline ist Rauschen): *Primärmetrik* ist der THE-550-Hebel — Anteil unlesbarer/unbrauchbarer Extraktionen je Einheit (Referenz: 89 % Artikel vs. 0,7 % Klausel; dieser Effekt ist groß genug für bezahlbare Stichproben). *Gemeinsamer Endpunkt* für den A/B: das **Artikel-Rollup** beider Arme gegen dasselbe eingefrorene Artikel-Gold, mit vorregistrierter Scoring-Regel für Mehr-Akteur-Artikel. partyRole-Accuracy je Klausel ist *Sekundärmetrik* mit Power-Rechnung (minimal detektierbarer Effekt +5 pp, daraus Stichprobengröße — vor dem Bogen). Dazu: Mehr-Akteur-Quote je Klausel (die THE-675-Messung am neuen Objekt). *Kill:* Primärmetrik schlägt die Artikel-Referenz nicht deutlich → die Klausel-Schicht bleibt Struktur-Asset, die Klassifikation bleibt am Artikel — und das Retrieval-Argument dafür wird **nur** geltend gemacht, wenn die Embedding-Entscheidung (eigene Qdrant-Collection, A/B-Sync, Kosten je Sprache) tatsächlich getroffen ist.

**Slice 5 — Voll-Lauf + Adjudikations-Programm.** Typing-Batch auf Klausel-Ebene (Idempotenz nach dem `versionHash+citedArticles`-Muster); Bogen-Programm mit ehrlichem Kalender (200er-Fenster in Wochen, Zweitkodierer für κ eingeplant). Beobachtungskanal und `multiActor`-Flag laufen mit. *Kill:* Kosten- oder Kalender-Explosion ohne Genauigkeitsgewinn aus Slice 4 → Stopp mit Befund.

**Slice 6 — Schatten-Join + Kontrakt-Wechsel.** **Auflage eingebaut:** Der Anwendbarkeits-Join-Wechsel ist ein *Kontrakt*-Wechsel, kein Datenwechsel — der Konsument lernt zuerst, beide Formen zu lesen (eine Rolle / Rollen-Menge), *dann* startet der Schatten-Join; die Join-Goldens werden als neue, adjudizierte Version eingefroren statt „0 Regressionen" gegen alte Erwartungen zu behaupten. Gate widerspruchsfrei: **jede unerklärte Differenz blockiert den Flip** (keine 5-%-Duldung); verengende Differenzen (Rollen-Menge wird kleiner als der Altwert) sind eine eigene, ausgewiesene Klasse. Flip macht der Mensch (Korpus-Cutover-Muster). *Kill:* Differenzen strukturell unerklärbar → Rollup-Regel falsch, zurück zu Slice 4.

**Slice 7 — Anschluss.** Kanonische Handlungen, Requirements-Kette und Kanten-Graph binden auf `unitHash` um (Lint-Tor gegen positionale Referenzen); Erwägungsgründe verweisen per `citedArticles` auf Einheiten; die Norm-Landkarte bekommt ihre Klausel-Knoten.

---

## Was der Weg bewusst NICHT tut

- **Keine Satz-Segmentierung.** Unterhalb von Punkt/Spiegelstrich vergibt kein Standard Identität; dort beginnt Raten.
- **Kein Zweck-Kontext im Klassifikator.** −9,8 pp sind gemessen; der Zweck gehört dem Menschen (Bogen) und der Landkarte.
- **Kein IG/ADICO-Vollausbau als Datenmodell.** Die Institutional Grammar bleibt Rubrik-Sprache für Adjudikation und Slots — die automatischen Tagger sind auf einem einzigen Korpus evaluiert, die Reliabilität unpubliziert.
- **Keine Beerdigung der toten Achsen im Vorbeigehen.** Die Entscheidung (korpusabhängig kennzeichnen) bleibt beim Menschen; dieser Weg setzt sie nur voraus, er trifft sie nicht.
- **Kein Big-Bang.** Der Artikel-Korpus, seine Goldens, der Join und der laufende Adjudikationsbogen bleiben bis zum jeweils gemessenen Cutover unberührt.

## Offene Entscheidungen, die dem Menschen gehören

1. **ADR-Entscheid Identität** (Vorbedingung Slice 1): `unitHash`+ELI-Alias als Umsetzung oder Ablösung von ADR-0004 E2.
2. **Tote Achsen:** kennzeichnen als korpusabhängig — der noch offene Entscheid vom 13.08.
3. **Führende Klassifikationssprache je Familie** (Vorschlag: die Fassung mit dem besseren Strukturbestand).
4. **Reihenfolge gegen die laufenden Fäden:** THE-671 (Discovery-Recall, WSJF 90) konkurriert um dieselben Adjudikations-Fenster.
5. **Slice-4-Scoring-Regel für Mehr-Akteur-Artikel** (Any-Match / Dominanz / je-Klausel) — vorregistrieren, nicht nachverhandeln.

## Prüfprotokoll

15 Agenten: 5 Leser (Repo-Ist ×2, Messbefunde, Standards-Forschung, Klassifikations-Forschung) → 3 Entwerfer (Struktur-first, Normsatz-first, evolutionär) → 3 Richter (unterschiedliche Gewichtung; 2:1 für „evolutionär mit Struktur-Grafts") → 1 Synthese → 3 Skeptiker (Messbefunde / Betrieb / Wissenschaft). **Alle drei Skeptiker: „hält mit Auflagen."** Die vier kritischen Befunde — statistisch unentscheidbares Kern-Gate, nicht-additive Bestands-Berührung in Slice 1, selbstreferenzielles Vollständigkeits-Tor, ADR-0004-Kollision — sind oben eingearbeitet, ebenso alle 19 Muss-Änderungen (Mindest-Feuerzahlen, κ-Vorbedingung, Verengungs-Schutz, Sprachstrategie, Kontrakt-Wechsel, ehrlicher Adjudikations-Kalender, `multiActor`-Persistenz, Fixture-Cache, Muster-Gates je Sprache).

## Aufwand (grob, je Slice)

| Slice | Bau | Mensch (Adjudikation) | Modellkosten |
|---|---|---|---|
| 0 Beschaffung | 1–2 Tage | — | — |
| 1 Zerleger | 3–5 Tage | ADR-Entscheid | — |
| 2 Zerlegungs-Golden | 1 Tag | 1 Fenster + Zweitkodierer | — |
| 3 Muster-Schicht | 2–3 Tage | 1 Fenster (200er, in Wochen ansetzen) | — |
| 4 Kern-Messung | 2 Tage | 1 Fenster (A/B-Bogen) | ~2–4 € |
| 5 Voll-Lauf | 1–2 Tage | Programm (fortlaufend) | ~15–25 € (≈ 5–8 k Klauseln × 2 Sprachen anteilig) |
| 6 Schatten-Join | 2–3 Tage | 1 Fenster (Join-Golden) | — |
| 7 Anschluss | 3–5 Tage | — | — |
