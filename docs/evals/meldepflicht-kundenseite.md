# Die Kundenseite der Meldepflicht — THE-548 / THE-549

**Datum:** 2026-08-03 · **Tickets:** THE-548 (Anwendbarkeitsprofil) · THE-549 (Fristobjekt)
**Plan:** `docs/superpowers/plans/2026-08-03-kundenseite-meldepflicht-vertikalschnitt.md`
**RVTM:** `docs/superpowers/rvtm/2026-08-03-kundenseite-meldepflicht-rvtm.md`
**Rahmen:** ADR-0007 · Belege: `docs/strategy/2026-08-01-the538-dora-meldepflicht.md`

---

## Der Satz, um den es ging — er steht

> Für eine **Bank** gelten DSGVO Art. 33 und DORA Art. 19. NIS2 Art. 23 gilt nicht —
> es ist **verdrängt** (DORA Art. 1 Abs. 2, *lex specialis*).
> Für einen **Energieversorger** gelten DSGVO Art. 33 und NIS2 Art. 23. DORA Art. 19
> ist **nicht anwendbar** — die Rolle `financial_entity` fehlt.
>
> Die bindende Frist der Erstmeldung: bei der Bank **4 h ab Einstufung** (DORA) *neben*
> 72 h ab Kenntnis (DSGVO) — zwei Uhren, nicht verrechenbar. Beim Energieversorger
> **24 h ab Kenntnis** (NIS2 schlägt die 72 h der DSGVO auf derselben Uhr).
> Die Nachweispflicht bleibt in beiden Fällen getrennt.

Jeder Teil dieses Satzes ist als Test hinterlegt und läuft mechanisch — kein Modellaufruf.

---

## 🚦 Das Gate: acht Zellen, vorab festgelegt, **8/8**

Festgelegt am 2026-08-02 im Plan und in der RVTM, **bevor** eine Zeile Code entstand.
Nichts daran wurde nachträglich angepasst.

| Normsatz | Bank (`financial_entity`) | Energieversorger (`essential_important_entity`) |
| --- | --- | --- |
| DSGVO Art. 33 | ✅ `applicable` | ✅ `applicable` |
| DSGVO Art. 34 | ✅ `applicable` | ✅ `applicable` |
| NIS2 Art. 23 | ✅ `displaced` (DORA Art. 1 Abs. 2) | ✅ `applicable` |
| DORA Art. 19 | ✅ `applicable` | ✅ `not_applicable` (Rolle fehlt) |

**Die neunte Prüfung ist die eigentliche:** die beiden „gilt nicht"-Zellen tragen
**verschiedene** Zustände. Vor THE-548 wären beide dasselbe undifferenzierte Nein gewesen.

---

## Was jetzt möglich ist, was vorher nicht ging

### 1. Der teuerste Befund des Projekts ist produktwirksam

`findDisplacement(displacedSource, addresseeClass)` war korrekt gebaut, am Primärtext belegt,
mit zwei Zitaten hinterlegt — und hatte **null Produktaufrufer**. Sein zweites Argument, die
Adressatenklasse des *Kunden*, war nirgends gespeichert.

Damit war der Befund aus THE-538 — **10 von 16** Katalog-Kandidaten durch *lex specialis*
gegenstandslos — nur im Eval nachvollziehbar, nicht im Produkt. Jetzt hat die Funktion ihren
ersten Aufrufer.

### 2. Vier Zustände statt zwei

| Zustand | Bedeutung |
| --- | --- |
| `applicable` | das Gesetz bindet eine Rolle des Profils |
| `displaced` | es **würde** binden, ein spezielleres schiebt es beiseite — **mit Zitat** |
| `not_applicable` | es bindet keine Rolle des Profils — **mit Nennung der fehlenden Rolle** |
| `undetermined` | das Profil oder die nötige Facette fehlt |

`displaced` und `not_applicable` einzuebnen hieße, einem Prüfer die Begründung schuldig zu
bleiben. Und **`undetermined` ist keins von beiden**: Nichtwissen als „gilt nicht"
auszugeben wäre die gefährliche Fehlerrichtung — der Nutzer hielte eine Pflicht für erledigt,
die nie geprüft wurde.

### 3. Fristen haben eine Uhr

`"72 Stunden ab Kenntnis"` und `"72 Stunden ab Erstmeldung"` unterscheiden sich als String um
zwei Wörter und bezeichnen zwei verschiedene Uhren. Der `bezugspunkt` macht das rechenbar:

| Norm | Stufe | Dauer | Bezugspunkt |
| --- | --- | --- | --- |
| DSGVO Art. 33 | erst | 72 h | `kenntnis` |
| NIS2 Art. 23 | erst | 24 h | `kenntnis` |
| NIS2 Art. 23 | zwischen | 72 h | `kenntnis` |
| NIS2 Art. 23 | abschluss | 1 Monat | `vorherige-meldung` |
| DORA Art. 19 | erst | 4 h | `einstufung` |
| DORA Art. 19 | zwischen | 72 h | `vorherige-meldung` |
| DORA Art. 19 | abschluss | 1 Monat | `vorherige-meldung` |

**P-1 (Abbruchbedingung): drei verschiedene Bezugspunkte** über die vier Normsätze — die
Schwelle lag bei drei, das Ticket schließt **positiv**.

---

## Entscheidungen, die begründet gehören

**Verdrängung wird vor Mitgliedschaft geprüft.** Für eine Bank ist die wahre Antwort auf
„gilt NIS2 Art. 23?" *immer* „verdrängt durch DORA" — auch wenn `essential_important_entity`
nicht im Profil steht. Die Alternative („du bist keine wesentliche Einrichtung") wäre sachlich
falsch — Kreditinstitute stehen in NIS2 Anhang I — und verlangte genau die Sektor-Rechtsanalyse,
die die *lex specialis* erspart.

**`addresseeClasses` ist eine Liste.** Dieselbe Firma ist Verantwortlicher für Kundendaten und
Auftragsverarbeiter für Mandantendaten, mit verschiedenen Pflichtenbündeln. Ein Einzelwert wäre
schon das falsche Modell.

**`sectors` bleibt Freitext.** Die Zuordnung eines Kunden zu NIS2 Anhang I/II ist eine
**Rechtsfrage**, keine Datenpflege. Ein Dropdown-Zwang würde eine Genauigkeit vortäuschen, die
das Feld nicht hat — Vorschlag mit Beleg, Bestätigung durch den Menschen (Asilomar #16).

**Es gibt keine Funktion, die über Uhren hinweg ein Minimum bildet.** „4 h ab Einstufung" und
„72 h ab Kenntnis" zu „4 h" zusammenzuziehen behauptete eine Ordnung, die es nicht gibt. Die
*Abwesenheit* dieser Funktion ist die Garantie; ein Test hält sie fest.

**Eine ehrliche Korrektur an der eigenen Vereinfachung.** Der Merksatz „NIS2 zählt durchgehend
ab Kenntnis" stimmt für Frühwarnung und Meldung — der **Abschlussbericht** zählt ab Übermittlung
der Meldung. Der Parser weist das aus statt es zu glätten.

---

## Zahlen

| | |
| --- | --- |
| Gate | **8/8** Zellen, mechanisch, kein Modellaufruf |
| THE-548 | 6 Akzeptanzkriterien ✅ · 2 Negativ-Kontrollen ✅ · 25 Tests |
| THE-549 | 4 AC ✅ · P-1 / P-2 ✅ · N-1 / N-2 ✅ · 18 Tests |
| Gesamt | **43 neue Tests**, 907 Zeilen über 9 Dateien |
| Regression | 2897 Unit-Tests grün; `tsc --noEmit` sauber in `shared` und `server` |

Die 10 roten Integrations-Suiten sind **vorbestehend flaky** (brauchen einen laufenden Server,
Verbindung verweigert) — dokumentiert, keine Regression dieser Änderung.

---

## Grenzen

- **Das Profil ist eine Selbstauskunft.** Es macht die Anwendbarkeit nachvollziehbar, nicht
  rechtsverbindlich.
- **Zwei Fixture-Profile, vier Normsätze.** Das belegt den Mechanismus, nicht die Abdeckung.
  Ob er über andere Rechtsakte trägt, ist offen.
- **Die Verdrängung ist partiell und bedingt.** NIS2 Art. 4 verdrängt nur, soweit der
  sektorspezifische Rechtsakt „mindestens gleichwertig" ist, und nur für erfasste Entitäten.
  Der Fall gehört an der **Provision** entschieden, nicht am Rechtsakt — die Kante trägt
  heute die Rechtsakt-Ebene.
- **Der Fristparser ist ein Lexikon.** Er erkennt die Formulierungen dieser vier Normsätze.
  Über einen größeren Korpus muss seine Abdeckung gemessen werden, bevor sie als Schutz gilt.
- **Trägt eine Klausel Primärfrist plus Obergrenze** („4 h nach Einstufung, spätestens 24 h
  nach Kenntnisnahme"), nimmt der Parser die primäre. Die Obergrenze wäre ein zweites
  Fristobjekt — bewusst draußen, ausgewiesen statt still vermischt.
- **Der Gate-Konsument im Harmonisierungspfad fehlt noch.** Dieses Ticket baut das Datum;
  THE-544 baut das Gate.

---

## Konsequenzen

| # | |
| --- | --- |
| K1 | **THE-544 ist entblockt** — das zweite Argument von `findDisplacement` hat jetzt eine Quelle. Es kann auflösen statt beide Regime nebeneinanderzustellen. |
| K2 | **Die Oberfläche muss vier Zustände zeigen, nicht zwei.** Ein grünes/rotes Häkchen wäre ein Rückschritt hinter das, was das Modell jetzt weiß. |
| K3 | **Der Fehlerrest der Kette bleibt 68,8 %** (THE-545, 32 adjudizierte Fälle). Das gehört neben jede Harmonisierungs-Aussage, nicht in eine Fußnote. |
| K4 | **Die Artikel-Granularität bleibt terminiert** (THE-550): NIS2 Art. 23 trägt drei Meldestufen in *einer* Section. Der Fristparser umgeht das heute über die Klausel-Ebene — vor dem Skalieren muss es entschieden sein. |
| K5 | **Abdeckung des Fristparsers messen**, bevor er als Schutz verkauft wird — dieselbe Regel wie bei der Verdrängungs-Kante in THE-544. |
