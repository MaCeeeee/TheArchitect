# Den Modeler-Skill testen — Schritt für Schritt

> Ziel: Du fügst einen normalen Fließtext ein (z. B. eine Systembeschreibung) und
> bekommst daraus ein fertiges ArchiMate-Modell in The Architect — sichtbar im
> 3D-View. Diese Anleitung ist bewusst so geschrieben, dass sie auch ohne
> Vorwissen funktioniert. Du brauchst **nichts zu programmieren**.

Es gibt zwei Test-Stufen. **Test 1** dauert 2 Minuten und braucht keine
Installation. **Test 2** schreibt das Modell wirklich in die App.

---

## Test 1 — „Ergibt der Vorschlag Sinn?" (2 Min, ohne Setup)

Hier prüfst du nur den klugen Teil: Versteht der Skill den Text und macht er
daraus sinnvolle Architektur-Bausteine? Es wird **nichts gespeichert**.

**So geht's:**

1. Öffne einen Chat mit Claude in diesem Projekt (dort, wo du diese Anleitung
   liest).
2. Kopiere den folgenden Text und schicke ihn mit dem Satz davor:

   > *„Nutze den Modeler-Skill und zeig mir nur die Vorschau — noch nicht
   > speichern:"*
   >
   > „Unser Online-Shop ist eine React-Anwendung, über die Kunden Bestellungen
   > aufgeben. Ein Bestell-Service nimmt die Bestellungen an, legt die
   > Bestelldaten in einer PostgreSQL-Datenbank ab und ruft für die Bezahlung
   > den externen Dienst Stripe auf. Eine Lager-Mitarbeiterin bearbeitet neue
   > Bestellungen im Fulfillment-Prozess. Alles läuft in einem
   > Kubernetes-Cluster."

3. Claude antwortet mit einer **Vorschau**: einer Liste der erkannten Elemente
   (nach Ebene sortiert) und der Beziehungen dazwischen.

**Woran du erkennst, dass es funktioniert hat:** In der Vorschau tauchen
Bausteine auf mehreren Ebenen auf, ungefähr so:

| Ebene | Erwartete Bausteine (Beispiele) |
|-------|----------------------------------|
| Business | Bestell-Service, Fulfillment-Prozess, Lager-Mitarbeiterin |
| Application | React-Anwendung / Web-Shop, Stripe (extern) |
| Data | Bestelldaten |
| Technology | PostgreSQL, Kubernetes-Cluster |

Wenn das plausibel aussieht: Test 1 bestanden. Der Skill „liest" korrekt. ✅

---

## Test 2 — Wirklich ins Modell schreiben (mit der App)

Jetzt lässt du das Modell tatsächlich anlegen und schaust es dir im 3D-View an.

### Was du vorher brauchst (einmalig)

1. **Die App muss laufen.** Prüfe: Öffne <http://localhost:3000> im Browser.
   - Siehst du The Architect? → gut, weiter.
   - Fehler/leer? → Starte die App wie gewohnt (`npm run dev` im Repo). Dafür
     müssen die Datenbanken laufen (MongoDB/Neo4j/Redis, üblicherweise per
     Docker).

2. **Ein Projekt.** Logge dich unter <http://localhost:3000> ein (oder
   registriere dich neu). Erstelle ein Projekt oder öffne ein bestehendes.
   - **Die Projekt-ID** findest du in der Adresszeile des Browsers: Sie sieht aus
     wie `…/projects/6a4802d2938b265280f737dc`. Der lange Code am Ende ist die ID.
     Kopiere ihn.

3. **Einen API-Schlüssel.** In der App: **Settings → API Keys → Generate New
   Token**. Es erscheint **einmalig** ein Schlüssel, der mit `ta_` beginnt —
   kopiere ihn sofort (er wird danach nicht wieder angezeigt).

   > Wichtig: Der Schlüssel muss **von derselben App** stammen, die du testest.
   > Ein Schlüssel aus der Produktiv-Umgebung funktioniert am lokalen Server
   > nicht (Fehler „401").

### Der eigentliche Test

4. Schreib Claude eine Nachricht mit **drei Angaben** — Projekt-ID, API-Key und
   dem Text. Zum Beispiel:

   > „Nutze den Modeler-Skill. Bau daraus ein ArchiMate-Modell in **Projekt
   > `<hier deine Projekt-ID>`**, API-Key `ta_<dein Schlüssel>`. Text:
   >
   > *[denselben Online-Shop-Text von oben — oder deinen eigenen]*"

5. Claude zeigt zuerst wieder die **Vorschau** und fragt, ob es speichern soll.
   Lies kurz drüber und antworte mit **„ja"**.

6. Claude legt die Elemente an und meldet zurück, was gespeichert wurde
   (z. B. „8 Elemente, 6 Beziehungen").

7. **Ansehen:** Gehe im Browser auf dein Projekt (<http://localhost:3000>) und
   öffne den **3D-View**. Lade die Seite neu. Die neuen Bausteine erscheinen auf
   ihren Ebenen — Business oben, darunter Application, Data, Technology.

**Woran du erkennst, dass es geklappt hat:**
- Claudes Abschluss-Meldung nennt konkrete Zahlen (Elemente/Beziehungen), nicht
  nur „fertig".
- Im 3D-View siehst du die Kästchen tatsächlich, verbunden durch Linien.

### Bonus: Die Duplikat-Erkennung testen

Schick Claude **denselben Text ein zweites Mal** mit derselben Projekt-ID. Der
Skill sollte in der Vorschau melden: **„exists — reuse id"** für die schon
vorhandenen Bausteine und **nichts doppelt** anlegen. Das ist der Schutz gegen
Modell-Verschmutzung.

---

## Wenn etwas schiefgeht

| Symptom | Ursache & Lösung |
|---------|------------------|
| „401" / „Invalid API key" | Der `ta_`-Schlüssel passt nicht zur getesteten App. Neuen Schlüssel in **derselben** Instanz erzeugen (Settings → API Keys). |
| <http://localhost:3000> lädt nicht | App läuft nicht. `npm run dev` starten; sicherstellen, dass die Datenbanken (Docker) laufen. |
| „Source or target element not found" | Eine Beziehung zeigt auf ein Element, das nicht angelegt wurde. Einfach dieselbe Nachricht nochmal schicken — der Skill trägt Fehlendes nach. |
| Claude nutzt den Skill nicht von selbst | Sag es explizit: „Nutze den **the-architect-modeler**-Skill." |
| Elemente doppelt nach mehreren Läufen | Bekanntes Plattform-Thema (Element-Anlage hat noch keine ID-Eindeutigkeit). Zum Sauber-Testen ein frisches Projekt nehmen. |

---

## Was dieser Test NICHT abdeckt (bewusst)

- **Vision statt Ist-Beschreibung:** Wenn dein Text ein *Vorhaben* beschreibt
  („wir wollen … einführen", Ziele/Stakeholder), gehört das zum Schwester-Skill
  `togaf-vision-architect`, nicht hierher.
- **Strukturierte Dateien** (CSV, BPMN, n8n, ArchiMate-XML) haben eigene
  Importer — der Modeler ist nur für **frei geschriebenen Text**.
