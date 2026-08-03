# THE-571 — Abnahme: die sieben EA-Fragen an einem echten Fall

**Datum:** 2026-08-03 · **Art:** Abnahme, kein Bau · **Ticket:** [THE-571](https://linear.app/thearchitect/issue/THE-571)
**Rahmen:** Facetten-Landkarte vom selben Tag · ADR-0007 · ADR-0008

---

## Der Fall

| | |
|---|---|
| **Projekt** | „Demo: BSH ESG Compliance Transformation" (`6a705449293587c4708d4f19`) — 66 Elemente im Graph |
| **Norm** | NIS2 **aus dem Korpus** (`corpus:nis2-de`, 46 Artikel) — der Weg, den THE-570 geöffnet hat |
| **Profil** | Hausgerätehersteller: EU + DE · Rollen `essential_important_entity`, `controller`, `manufacturer` · 62 000 Beschäftigte |
| **Bestand** | 15 Ketten-Anforderungen, davon 2 mit Korpus-Anker; 15 Stakeholder- und 15 Systemanforderungen |

Der Korpus war für **jede** Messung verbunden (`Korpus verbunden = true`). Ohne das hätte die
Abnahme die eigene Kaltstart-Lücke als Produktbefund ausgewiesen — beim ersten Lauf ist
genau das passiert und wurde verworfen (siehe *Verworfene Messungen*).

## Die Rubrik — sie stand vor der Messung

| Stufe | Bedeutung |
|---|---|
| **A** | Ein Nutzer erreicht die Antwort über die Oberfläche, ohne Schnittstellen-Aufruf, ohne Entwicklerwissen |
| **B** | Die Antwort existiert, aber nur über API, Skript oder undokumentierten Pfad |
| **C** | Im Code und getestet, im Produkt nicht auslösbar |
| **D** | Die Struktur fehlt |

## Das Ergebnis in einem Bild

| # | Frage | Stufe | Der **eine** fehlende Schritt |
|---|---|---|---|
| 1 | Betrifft mich das Gesetz? | **A** | Größen-/Territoriums-Prädikate der Norm-Seite — das Urteil hängt allein an der Rolle |
| 2 | Welcher Teil? | **B** | `assessLawsForProfile` muss die bindenden eIds **zurückgeben**, nicht nur zählen |
| 3 | Anforderungen an Prozess/App/Daten/Org? | **D** | Die Ebene muss aus der **Landschaft** kommen, nicht aus der Norm (THE-551) |
| 4 | Erfülle ich es — wo? | **B** | Eine Fläche zum Anhängen von Nachweisen |
| 5 | Wenn nein — was tun? | **B** | Die **Frist** in den Lücken-Eintrag durchreichen |
| 6 | Harmonisierbar? | **A** | — (keine Blockade; die 22 Paar-Kandidaten hätten gern eine Fläche) |
| 7 | Geändert / zuerst / wer? | **D** | Drei getrennte Lücken, siehe unten |

**Positiv-Kontrolle:** 5 Fragen auf A oder B — die Schwelle war 4. **Bestanden.**
**Negativ-Kontrolle 1:** Frage 3 ist **nicht** A. **Gehalten.**
**Negativ-Kontrolle 2:** Nur-per-API ⇒ B. Frage 4 ist **nicht** A. **Gehalten.**

> Beide Negativ-Kontrollen haben gehalten, ohne dass nachgeschärft werden musste. Das ist
> das eigentliche Gütesiegel dieser Abnahme: die Rubrik hat gegen das eigene Wunschdenken
> gearbeitet, nicht dafür.

---

## Frage 1 — „Betrifft mich das Gesetz?" → **A**

**Weg:** Compliance → Standards → *Legal applicability* → Rollen anhaken, Jurisdiktionen
wählen, Sektoren eintippen, speichern. Fünf Handgriffe, kein Entwicklerwissen.
**Fläche:** `LegalApplicabilityCheck.tsx:102-123` (Rollen/Jurisdiktionen/Sektoren schreibend), `:260ff` (Urteil je Gesetz).

**Gemessen:** 13 Gesetze bewertet — **8 anwendbar, 5 nicht anwendbar.**

```
nis2   applicable  „Binds the project in role(s): essential_important_entity."
                   provisionsTotal 46 · provisionsTyped 35 · provisionsBinding 3
dsgvo  applicable  bindend 39/78        mdr   applicable  bindend 33/101
cra    applicable  bindend 13/49        dora  not_applicable
```

Das Urteil **reagiert auf das Profil**: NIS2 stand am Vortag als `displaced` (durch DORA);
mit einem Profil ohne `financial_entity` ist es korrekt `applicable`. Das ist kein
Zufallstreffer, sondern die Kernmechanik, die arbeitet.

**Die Lücke:** Das Urteil ruht **allein auf dem Rollen-Abgleich**. Eine Firma mit 40
Beschäftigten bekäme dieselbe Antwort wie BSH mit 62 000 — die Größen- und
Territoriums-Prädikate aus Art. 2 sind auf der Norm-Seite nirgends strukturiert
(Facette 1, D3). Das Profil erhebt die Beschäftigtenzahl bereits; es gibt nur nichts, wogegen
sie geprüft würde.

---

## Frage 2 — „Welcher Teil?" → **B**

**Weg:** Dieselbe Fläche, Gesetz aufklappen. Der Nutzer liest **„binds 3/35 typed provisions"**.
**Und dann hört es auf.**

**Gemessen — der entscheidende Befund:**

```
Gesetze MIT Paragraphen-Zitaten: 0 von 13
```

Die Oberfläche **rendert** eine Zitat-Liste (`LegalApplicabilityCheck.tsx:287-293`,
`{law.citations.map(...)}`) — der Dienst füllt `citations` aber nie. Serverseitig existiert
das Feld ausschließlich an **Verdrängungs-Kanten** der Ontologie
(`norm-ontology.v1.ts:64`, `displacementGate.service.ts:72`), nie an einem anwendbaren Gesetz.
Der Nutzer erfährt also, **wie viele** Artikel ihn binden, aber nie **welche**.

Die Klausel-Sicht (`ClauseCoveragePanel`) zeigt Klauseln im Volltext — aber nur die, für die
schon Anforderungen existieren. Sie beantwortet „was habe ich bearbeitet", nicht „was gilt".
Der Nenner kam aus dem Skript:

```
Sollseite corpus:nis2-de: 1 von 46 Artikeln bearbeitet
```

**Die Lücke:** `assessLawsForProfile` kennt die bindenden Provisions — es zählt sie ja.
Es muss sie **herausgeben**. Die Oberfläche wartet bereits darauf.

---

## Frage 3 — „Anforderungen an Prozess, App, Daten, Organisation?" → **D**

**Gemessen:**

```
Systemanforderungen: 15
Ziel-Ebenen-Feld am Objekt: KEINES
```

Geprüft wurde gegen `layer`, `targetLayer`, `architectureLayer`, `elementType`, `ebene` —
keines davon existiert an `ChainSystemRequirement`. Die Anforderungen **selbst** sind
lesbar und gut geschnitten:

> „Das Unternehmen muss jeden erheblichen Sicherheitsvorfall unverzüglich dem zuständigen CSIRT melden."
> `schutzgut` = Netz- und Informationssysteme · `verpflichteter` = wesentliche und wichtige Einrichtungen
> `ausloeser` = Eintritt eines erheblichen Sicherheitsvorfalls · `nachweis` = Meldung an das CSIRT

Was fehlt, ist die **Achse der Frage**: Ist das eine Prozess-, eine Anwendungs-, eine Daten-
oder eine Organisations-Anforderung? Ein Nutzer bekommt eine undifferenzierte Liste.

**Das war die vorhergesagte Negativ-Kontrolle, und sie hat gehalten.** THE-551 hat gemessen,
dass die Ziel-Ebene **aus der Norm nicht ableitbar** ist (51,2 %). Die Abnahme bestätigt es
von der anderen Seite: die Struktur ist nicht da, weil sie dort nicht hingehört.

**Die Lücke:** Die Ebene muss aus der **Landschaft** kommen — als Abgleich gegen die
vorhandenen Elemente, nicht als Facette an der Handlung. Wer sie an die Norm hängt,
baut auf einer Prämisse, die bereits zweimal gefallen ist (THE-547, THE-551).

---

## Frage 4 — „Erfülle ich es, und wo?" → **B**

**Gemessen:**

```
Ketten-Anforderungen: 15, davon mit verlinktem Element: 3
  Tor covered   ja=3  nein=12
  Tor enforced  ja=0  nein=15
  Tor attested  ja=0  nein=15
  Evidenz-Dokumente im Projekt: 0
```

Die **Rückwärts-Frage** arbeitet und ist die stärkste Einzelantwort der ganzen Abnahme:

```
Element „bsh-mot-sbti" ausmustern → 3 Anforderungen betroffen,
2 verlören ihre Abdeckung → Gesetze dsgvo, nis2
```

`covered` wird mechanisch aus den Verlinkungen abgeleitet; `enforced` und `attested` sind über
`RequirementsForElementSection` (→ `setGate`) im Eigenschaften-Panel eines Elements setzbar.

**Die Lücke:** Nachweise. `POST /:projectId/requirements/:id/evidence` hat **null** Aufrufer im
Client — „evidence" kommt dort nur in fremden Zusammenhängen vor (Audit-Checklisten,
Oracle-Traces). Das dritte Tor ist damit an der Oberfläche unerreichbar: attestieren kann man,
belegen nicht. **Genau der vorhergesagte Fall — Frage 4 kann nicht A sein.**

---

## Frage 5 — „Wenn nein, was tun?" → **B**

**Gemessen:**

```
Unerfüllte Ketten-Anforderungen (ohne Element): 12
Lücken-Ansicht: 15 Einträge
  Felder: _id, regulationId, regulationTitle, title, description,
          priority, status, linkedElementIds, ageDays, createdBy, createdAt
  trägt „deadline": NEIN     trägt „gates": NEIN     trägt „chain": NEIN
Stakeholder-Anforderungen mit Frist: 13 von 15
```

Die Lücken-Ansicht **sieht** die Kette — die 15 Einträge sind die Ketten-Anforderungen, mit
aufgelöstem Titel „NIS2 Art. 23". Zwei Dinge kommen dort aber nicht an:

**Erstens die Frist.** Sie ist erhoben und strukturiert — `{dauer:{wert:24,einheit:"h"},
bezugspunkt:"kenntnis", stufe:"erst"}`, dazu 72 Stunden und ein Monat, alle mit belegter
Quelle. In der Lücken-Ansicht steht sie nur noch als Fließtext in der Beschreibung.
**Bei einer Meldepflicht ist die Uhr das Handlungsrelevante** — und genau sie fällt heraus.

**Zweitens der Anschluss der Remediation.** Sie nimmt `standardId + gapSectionIds`
(`remediation.service.ts:188`, `:212`) — sie arbeitet auf **Norm-Abschnitten**, nicht auf
Anforderungen. Ein Nutzer kann für *Art. 23 als Ganzes* einen Vorschlag erzeugen, nicht für
die 12 konkret unerfüllten Anforderungen. Der Rückweg existiert (THE-568), greift aber nur
über `normId + sectionEId` — den **2 von 15** Anforderungen tragen.

**Die Lücke:** Die Frist in den Lücken-Eintrag durchreichen. Ein Feld, kein Umbau.

---

## Frage 6 — „Harmonisierbar?" → **A**

**Weg:** Compliance → Standards → *Shared measures* → „Propose".
**Gemessen (echtes Modell, keine Attrappe):**

```
15 Systemanforderungen → 14 gruppierbar (1 ohne Adressaten-Zuordnung), 0 unklassifiziert
Richter sah 25 Paare · 12 Maßnahmen vorgeschlagen
davon über MEHR ALS EIN GESETZ: 1
   Mitglieder 3 · Gesetze [dsgvo, nis2, nis2-de] · bereits verlinkte Elemente 2
      „erhebliche Sicherheitsvorfälle dem CSIRT melden"
      „Verletzung des Schutzes personenbezogener Daten der zuständigen Aufsichtsbehörde melden"
      „Sicherheitsvorfall unterrichten"
paarweise Kandidaten ohne Gruppe: 22 · durch Verdrängung ausgeschlossen: 0
```

**Das ist der Ertrag der ganzen Woche in einer Zeile:** Die Meldepflicht aus NIS2 Art. 23 und
die aus DSGVO Art. 33 sind als **eine** Maßnahme erkannt — über Gesetzesgrenzen hinweg,
mit zwei bereits verlinkten Elementen als Startpunkt. Alle 15 Anforderungen wurden auf die
kanonische Handlung `vorfall-melden-behoerde` abgebildet; der Richter hat daraus die
tragfähige Gruppe geschnitten.

**Kein blockierender Mangel.** Ein Nachsatz zur Ehrlichkeit: 22 Paare hat der Richter als
`intersects` beurteilt, ohne dass daraus eine Gruppe wurde — sie stehen in der Antwort als
`sharedCorePairs` und haben keine Fläche. Und 11 der 12 „Maßnahmen" haben genau ein
Mitglied; eine geteilte Maßnahme mit einem Mitglied ist keine.

---

## Frage 7 — „Was hat sich geändert / was zuerst / wer?" → **D**

Drei Teilfragen, drei sehr verschiedene Antworten.

### 7a „Was hat sich geändert?" → **A**, mit einem stillen Loch

**Weg:** Klausel-Panel → Knopf *Drift check* (`ClauseCoveragePanel.tsx:65-74`).

```
{"checked":2,"staled":0,"skipped":0,"evidenceStaled":0,"attestedReset":0}
     prüfbar (mit Korpus-Anker): 2 von 15
```

Der Lauf arbeitet — und er arbeitet nachweislich erst seit THE-570 (vorher `checked: 0`).
**Aber:** Die Abfrage filtert auf `normId` und `sectionEId`
(`chainDrift.service.ts:52-57`). Die 13 Anforderungen ohne Korpus-Anker fallen aus der
Abfrage heraus und werden **weder als geprüft noch als übersprungen gezählt** — sie sind
unsichtbar. Der Nutzer liest „2 geprüft, 0 veraltet" und darf glauben, sein Bestand sei
geprüft. 13 von 15 waren nie im Blick.

Das ist eine stille Kappung — genau die Sorte, gegen die die eigenen Regeln stehen.

### 7b „Was zuerst?" → **D**

```
Prioritäten: {"must": 15}          Sanktions-Feld an der Anforderung: NEIN
```

Alle 15 Anforderungen sind `must`. Eine Reihenfolge lässt sich daraus nicht bilden, und
es gibt keine Sanktions-Facette, aus der sie kommen könnte (THE-554, null Treffer).

### 7c „Wer ist zuständig?" → **D**

```
verschiedene „verpflichteter"-Werte: 7
   wesentliche und wichtige Einrichtungen | betroffene Einrichtung |
   Betroffene Einrichtung (Betreiber kritischer Infrastruktur) |
   betroffene Einrichtung (kritische Infrastruktur) | Verantwortlicher (Unternehmen) | …
```

Sieben Schreibweisen für im Kern **zwei** Rollen. Die Normalisierung existiert intern
(`mapVerpflichteterToPartyRole`, von der Harmonisierung genutzt) — an der Oberfläche
kommt roher Freitext an. Und die interne Abbildung ist auch nicht vollständig: eine
Anforderung blieb ohne Adressaten-Zuordnung und fiel aus der Harmonisierung.

**Zusammengesetzt: D.** Ein Drittel der Frage ist beantwortet, zwei Drittel haben keine
Struktur. Die Frage als Ganzes ist nicht beantwortbar.

---

## Vier Funde, die keine der sieben Fragen war

### 1. Derselbe Artikel steht zweimal in der Klausel-Sicht

```
nis2:art.-23      3 Klauseln, 12 Anforderungen, ohne Korpus-Anker
nis2-de:art-23    2 Klauseln,  2 Anforderungen, Anker corpus:nis2-de
```

Zwei Erzeugungswege haben denselben NIS2-Artikel 23 unter zwei Schlüsseln abgelegt: der
Einfüge-Weg von vor THE-570 und der Korpus-Weg danach. In der Klausel-Sicht erscheint das
Gesetz doppelt, unter zwei Namen. **Jedes Projekt, das vor dem 03.08. entstand, trägt diesen
Bruch** — das ist keine Eigenheit des Testfalls, sondern eine Migrationsfrage.

**Und die Migration ist nicht mechanisch.** Naheliegend wäre, den Altbestand über die
inhalts-basierte Klausel-Identität (THE-560) nachzuverankern — dieselbe contentId im
Korpus, fertig. Gemessen gegen **1410 echte Korpus-Klausel-Identitäten** (NIS2-DE 46 Artikel,
DSGVO 99 Artikel):

```
Mechanisch nachverankerbar: 0 von 13
```

Der Grund steht im direkten Textvergleich:

> **Altbestand:** „Jeder Mitgliedstaat stellt sicher, dass wesentliche und wichtige Einrichtungen
> **dem** CSIRT unverzüglich jeden erheblichen Sicherheitsvorfall melden."
>
> **Korpus:** „Jeder Mitgliedstaat stellt sicher, dass wesentliche und wichtige Einrichtungen
> **ihrem** CSIRT **oder gegebenenfalls ihrer zuständigen Behörde gemäß Absatz 4** unverzüglich
> über jeden Sicherheitsvorfall…"

**Der eingefügte Text war eine Paraphrase, nicht das Gesetz.** Der Altbestand ruht damit auf
einem Wortlaut, den es so nie gab. Die Klausel-Identität weigert sich korrekt, beides
gleichzusetzen — genau dafür ist sie gebaut. Der saubere Weg ist Neu-Ableitung aus dem
Korpus, nicht Umhängen.

> **Beinahe-Fehlmessung, die hierher gehört:** Die erste Sonde meldete *„12 von 13 mechanisch
> nachverankerbar"*. Sie hatte gegen `corpus:nis2` geprüft — was bei einem Korpus-Miss die
> **Projekt-Norm aus der App-DB** ist, also genau den eingefügten Text. Der Altbestand traf
> sich selbst. Ein Rechtsakt mit einem einzigen Artikel ist kein Gesetz; die Sonde schließt
> Fassungen unter zehn Artikeln seither aus.

### 2. Der Drift-Lauf schweigt über das, was er nicht ansieht

Siehe 7a. `skipped` zählt nur Anforderungen, die den Filter passieren und deren Text fehlt —
nicht die, die am Filter scheitern.

### 3. NIS2 ist im Korpus nur zu drei Vierteln typisiert

`provisionsTotal 46 · provisionsTyped 35 · provisionsBinding 3` — elf Artikel tragen keine
Typisierung und sind in der Anwendbarkeits-Rechnung damit unsichtbar. Bei einem Gesetz,
das durchgehend Pflichten für wesentliche Einrichtungen normiert, sind 3 bindende von 35
außerdem auffällig wenig; die Fläche warnt bei ≤ 2 mit „thin evidence" — bei 3 nicht mehr.

### 4. Kaltstart: die erste Korpus-Anfrage nach Serverstart scheitert stumm

Die Korpus-Verbindung ist faul und läuft mit `bufferCommands: false`
(`corpusClient.service.ts:157-163`). Der erste Zugriff wirft, wird abgefangen und liefert eine
leere Liste. Der Befund von gestern (THE-570) ist damit reproduziert — und er hat diese
Abnahme im ersten Lauf beinahe verdorben.

---

## Verworfene Messungen — was nicht in die Bewertung einging

Ehrlichkeit über den eigenen Aufbau, weil sonst Aufbau-Fehler zu Produktbefunden werden:

| Beobachtung im ersten Lauf | Warum verworfen |
|---|---|
| „Frage 1: 0 Gesetze bewertet" | Falscher Aufruf im Messskript — die Signatur ist `(profile, fetchCorpus)`, nicht `(projectId)` |
| „Drift: `checked: 0, skipped: 2`" | Korpus-Verbindung nicht abgewartet — Aufbau, nicht Produkt |
| „Harmonisierung: 0 gesetzesübergreifend" | Falsches Feld gelesen (`regulationKey` statt `source`); die echte Gruppierung entsteht ohnehin erst im Richter |

Alle drei hätten sich als Produktmängel lesen lassen. Sie waren keine.

## Die Grenze dieser Abnahme

Gemessen wurde auf der **Dienst-Ebene** — je Frage genau der Dienst, den die zugehörige
Fläche aufruft — plus eine erschöpfende Quellenprüfung, ob die Fläche existiert, eingehängt
und erreichbar ist (`CompliancePage.tsx:131-160`, Abschnitt *standards*).

**Nicht gemessen wurde der Klick.** Eine Fläche, die existiert und beim Bedienen bricht,
fängt dieses Verfahren nicht. Dass das kein theoretisches Restrisiko ist, hat die Handprobe
zu THE-570 am selben Tag zweimal gezeigt. Der Grund für den Verzicht: die Anmeldung hätte
das Eintippen von Zugangsdaten verlangt, und das findet nicht statt.

**Konsequenz:** Die Stufen A in dieser Tabelle heißen „die Fläche ist da, eingehängt und der
Dienst dahinter antwortet am echten Fall" — nicht „am Bildschirm nachgeklickt".

---

## Was daraus folgt

**Für die Zusammenlegung von Matrix und Klausel-Sicht** — sie war durch diese Abnahme
blockiert: Die Klausel-Sicht ist die **inhaltlich reichere** (Klauseltext, Fristen, Tore,
Rückwärts-Frage, Harmonisierung). Die Matrix hat, was der Klausel-Sicht fehlt: den
**Nenner** (was habe ich noch nicht angesehen) und den **Remediation-Anschluss**. Eine
Zusammenlegung, die die Klausel-Sicht in die Matrix schiebt, verliert das Reichere. Die
Richtung sollte umgekehrt sein — und Fund 1 (derselbe Artikel unter zwei Schlüsseln) ist die
erste Aufgabe, die dabei ansteht, nicht die letzte.

**Die drei kleinsten Hebel mit dem größten Ertrag**, in dieser Reihenfolge:

1. **Bindende Provisions herausgeben** statt zählen — hebt Frage 2 von B auf A. Die Fläche wartet bereits.
2. **Frist in den Lücken-Eintrag** — hebt Frage 5 spürbar; ein Feld.
3. **Drift ehrlich machen** — die 13 Unansehbaren zählen und benennen. Kein neues Können, nur keine stille Kappung mehr.

Alles drei zusammen ist kleiner als jedes einzelne der sieben REQs dieser Woche.

## Die Tickets aus dieser Abnahme

| Ticket | Was | Herkunft |
|---|---|---|
| [THE-573](https://linear.app/thearchitect/issue/THE-573) | Bindende Provisions herausgeben (Frage 2: B → A) | Frage 2 |
| [THE-574](https://linear.app/thearchitect/issue/THE-574) | Frist erreicht die Lücken-Ansicht | Frage 5 |
| [THE-575](https://linear.app/thearchitect/issue/THE-575) | Drift zählt, was er nicht ansieht — **stille Kappung** | Frage 7a |
| [THE-576](https://linear.app/thearchitect/issue/THE-576) | Nachweis-Fläche für das dritte Tor (Frage 4: B → A) | Frage 4 |
| [THE-577](https://linear.app/thearchitect/issue/THE-577) | **ENTSCHEIDUNG** Altbestand — blockiert die Zusammenlegung | Fund 1 |

Zwei Befunde blieben bewusst ohne eigenes Ticket: die untypisierten 11 NIS2-Artikel gehören
in das laufende Typisierungs-Thema (THE-540 Achse 2, gesperrt bis macro-F1 ≥ 0,75), und der
Kaltstart ist notiert, aber harmlos genug für den nächsten Aufräum-Durchgang.

## Nachvollziehen

```
packages/server$ npx ts-node --transpile-only src/scripts/the571-acceptance.ts \
    --project <projectId> [--write-profile]
packages/server$ npx ts-node --transpile-only src/scripts/the571-migration-probe.ts <projectId>
```

Beide lesen nur; die einzige Schreib-Operation ist `--write-profile` (Aufbau, damit Frage 1
eine Sollseite hat). Der Korpus muss über das Tailnet erreichbar sein — ohne ihn misst der
Lauf die eigene Kaltstart-Lücke.
