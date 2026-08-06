# Anforderungskette — Freigabe-Tore (THE-611)

**Gilt für:** den Produktpfad der Kette Gesetz → Stakeholder-Anforderung → Systemanforderung →
Maßnahme — Adressaten-Auflösung, Werk-Familie, Verdrängung und den Harmonisierungs-Vorschlag.

**Kern-Regel:** *Eine Richtigkeits-Zahl, die nur einmal gemessen wurde, ist eine Behauptung
über den Stand von gestern. Sie zählt erst, wenn ein Tor sie hält — und das Tor zählt erst,
wenn belegt ist, dass es rot werden kann.*

Quelle der Disziplin ist wieder kein Paper, sondern zwei eigene Fehlschläge in einer Woche:

| | Prüfstand hatte | Produkt bekam | gefunden |
|---|---|---|---|
| Adressatenklasse | kuratierte Annotation am Artikel | aus einer Paraphrase abgeleitet | 03.08. (THE-589/591) |
| Werk-Stamm | `nis2` | `nis2-de` aus dem Korpus-Schlüssel | 05.08. (THE-600) |

Beide Male war der Prüfstand grün, während das Produkt still etwas anderes tat. **Die
Konstruktion „Prüfstand mit gepflegten Werten" ist damit selbst ein bekannter Fehlermodus** —
und ein Wächter, der ihr folgt, wäre die dritte Auflage.

---

## Das Tor

```
Gold über den Produktpfad   >=  4 von 5      GOLD_GUARD_MIN
```

Vorab gesetzt am 2026-08-03 (`scf-gold-produktpfad.md`), gehalten am 2026-08-05. Mehr ist über
diesen Schnitt nicht erreichbar: HRS-03 fiel bereits am **Prüfstand** (Lauf 4: 4/5). Das Tor
fragt nicht, ob die Kette besser wird als der Prüfstand — sondern ob der Produktpfad hält, was
der Prüfstand kann.

## Die zwei Hälften — und warum eine allein wertlos ist

| | Was sie beantwortet | Wo | Läuft |
|---|---|---|---|
| **Tor** | Verarbeitet der **Code** die Rollen richtig? | `evals/reqtrace/goldGuard.ts` + `__tests__/goldGuard.test.ts` | jedem Commit, netzfrei |
| **Anker-Prüfung** | Beschreibt die **Fixture** noch den Korpus? | `scripts/the613-gold-anchor-check.ts` | manuell, braucht Tailnet |

> **Grün im Tor heißt: der Code ist in Ordnung. Es heißt NICHT: die Zahl gilt.**

Das Tor fährt gegen eingefrorene Korpus-Rollen — nur so läuft es ohne Netz. Genau dadurch ist
es selbst ein Prüfstand. Die Anker-Prüfung schließt den Kreis: Sie vergleicht Rolle **und**
`versionHash` gegen den lebenden Korpus und fährt dieselbe Auswertung ein zweites Mal mit den
echten Rollen. Fallen die Quoten auseinander, ist das Tor grün für einen Stand, den es nicht
mehr gibt.

**Die Anker-Prüfung ist nicht wegzuvereinfachen.** Wer sie löscht, macht aus dem Tor eine
Selbstbestätigung.

## Vorbedingungen (hart)

1. **Ein Auswertungspfad.** Tor und Anker-Prüfung rufen dieselbe Funktion
   (`evaluateGoldGuard`); die Rollen kommen als Eingabe herein. Zwei Auswertungen wären die
   Kopie, die auseinanderläuft — und dann wüsste niemand, welche Zahl gilt.
2. **Über den Produktions-Code.** Das Tor rechnet mit `normalizeCorpusSource`,
   `areAddresseesCompatible`, `evaluateDisplacement`, `mapVerpflichteterToPartyRole`. Die
   Weichen im Wächter nachzubauen hieße, ihn gegen sich selbst zu prüfen.
3. **Anker vollständig.** `versionHash` als volle SHA-256 (64 Zeichen). Ein gekürzter Anker
   sieht bei jedem Lauf nach Drift aus — beim ersten Bau genau so passiert und von der
   Anker-Sonde im ersten Lauf gefunden.
4. **Die Umkehrprobe gehört dazu.** Für jede Weiche ist zu zeigen, dass ihr Ausfall das Tor
   reißen lässt — mit einer gebrochenen Weiche, nicht mit einem auskommentierten Test.
5. **Nichts Zufälliges.** Kein Modellaufruf, kein Netz, keine Datenbank im Tor.

## Was das Tor NICHT leistet

- **Die kanonische Handlung** prüft es nicht. Sie kommt auf beiden Pfaden aus demselben
  Klassifikator über denselben Text und ist kein Unterschied. Lauf 4 hat die zugewiesenen
  Handlungen nicht festgehalten (`sysReqActions` existiert nur zur Laufzeit) — sie nachzubauen
  hieße, Werte zu erfinden. *(Ein erster Sondenentwurf tat genau das und meldete CRY-01
  fälschlich als verloren, 3/5 statt 4/5.)*
- **Ein UNTER-sperrendes Verdrängungs-Gate** sieht es nicht: unter den Gold-Paaren ist kein
  einziges verdrängtes (`dsgvo×nis2` und `dora×dsgvo` tragen keine Kante). Diese Kontrolle
  sitzt in `measureGrouping.test.ts` (werfender Richter) und `displacementGateSvc.test.ts`.
  Ein eigener Test hält das ausdrücklich fest, damit dem Tor keine Absicherung zugeschrieben
  wird, die es nicht hat.
- **Extraktions- und Richter-Varianz** — unverändert gegenüber Lauf 4.
- **Den Klick.** Dienst-Ebene und Bauteil-Tests, kein angemeldeter Browser.

## Die Eichung

Die Umkehrprobe „ohne Korpus-Rollen" reproduziert **2 von 5** mit genau den beiden Verlusten,
die am 03.08. gemessen wurden (BCD-01, RSK-01). Damit hängt der Wächter nicht nur an sich
selbst, sondern an einer echten historischen Messung. Weicht das ab, bildet das Tor den
Produktpfad nicht mehr nach — unabhängig davon, ob es gerade grün ist.

## Wenn das Tor rot wird

1. **Nicht die Erwartung nachziehen.** Weder Schwelle noch Fixture werden angepasst, um Grün
   herzustellen.
2. Ursache je Gold-Eintrag ablesen — das Ergebnis nennt sie (`why`).
3. Anker-Prüfung fahren: liegt es am Code oder am Korpus?
4. Erst dann entscheiden, was falsch liegt — und den Entscheid belegen.

## Wo das Tor verdrahtet ist

**Nicht in GitHub Actions.** Das Konto ist gesperrt — die letzten Läufe stammen vom
2026-05-22 und sind beide rot; seither startet nichts. Ein Workflow dort wäre ein Wächter,
der nicht wacht, also genau der Fehlermodus, gegen den dieses Tor gebaut wurde.

| Ort | Wirkung | Umgehbar? |
|---|---|---|
| **Docker-Build** (`Dockerfile`, Schicht `npm run gate`) | Ohne grünen Lauf **kein Image**, ohne Image **kein Deploy** | nein |
| `npm run gate` (Wurzel oder `packages/server`) | ~1 s, jederzeit von Hand | — |
| `.github/workflows/gate.yml` | **ruht**, bis das Konto frei ist | entfällt |

Das Build-Tor ist die wirksame Stelle. Belegt, nicht angenommen: eine absichtlich
verfälschte Fixture (`dsgvo:art-32` → `data_subject`) ließ den Build mit Exit 1 abbrechen und
nannte drei rote Tests. Erst danach wurde die Fixture wiederhergestellt.

**Warum nicht `npm test`?** Der volle Lauf fährt 236 Suiten, 60 davon mit Datenbank, und ein
Teil ist vorbestehend flaky (Worker-Crashes unter Parallelität, THE-435). Ein rotes Ergebnis
wäre mehrdeutig — und ein Tor, dessen Rot man routinemäßig wegdrückt, ist keins. Der
Tor-Lauf ist rein mechanisch und dauert ~1 Sekunde; **rot heißt hier: etwas ist kaputt.**

## Nachvollziehen

```
$ npm run gate                # alle Tore, ~1 s, netzfrei
packages/server$ npx ts-node --transpile-only -r dotenv/config src/scripts/the613-gold-anchor-check.ts
```

Die Anker-Prüfung bricht mit Code 2 ab, wenn kein Korpus konfiguriert ist — ein nicht
erreichbarer Korpus ist **unbekannt**, nicht **unverändert**.
