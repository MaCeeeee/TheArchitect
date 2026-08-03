# RVTM — THE-576: Die Fläche für das dritte Tor

**Datum:** 2026-08-03 · **Ticket:** [THE-576](https://linear.app/thearchitect/issue/THE-576)
**Herkunft:** Abnahme [THE-571](https://linear.app/thearchitect/issue/THE-571), Frage 4
**WSJF:** 82,5 — BV 5 · **Risk 5** · Impl 4 · Success 4 · Compliance 5 · ReqRel 4 · Urgency 3 · Status 3

**Ousterhout:** Change Amplification niedrig · **Cognitive Load mittel** (WORM, Alterung,
„lokal hashen" sind drei Konzepte) · Unknown Unknowns niedrig · Abhängigkeiten niedrig ·
**Obscurity mittel** — das Nicht-Offensichtliche ist, *warum* lokal gehasht statt hochgeladen
wird. Steht deshalb im Kopf beider neuen Dateien **und** sichtbar in der Fläche.

> **Watch-Point:** die Versuchung, die Datei hochzuladen. Das ist eine
> Aufbewahrungs-Entscheidung, keine Bequemlichkeitsfrage — und bereits getroffen.

---

## Der Befund war schärfer als das Ticket sagte

Das Ticket sprach von „nur per API erreichbar". Der Pre-Flight zeigte mehr: Der Gates-Endpunkt
**verweigert** `attested = yes`, solange kein frischer Nachweis existiert —

```
'attested requires at least one fresh (non-stale) evidence record — add evidence first'
```

Da Nachweise bis heute **null Aufrufer im Client** hatten, war das dritte Tor über die
Oberfläche **überhaupt nicht erreichbar**, nicht bloß umständlich. Am Referenzprojekt gemessen:

```
Anforderungen: 15 · attestiert: 0 · Evidenz-Dokumente: 0
⇒ kein Nachweis, kein Attest — die Sackgasse, die die fehlende Fläche erzwungen hat.
```

**Dieses Bauteil schaltet das Tor frei**, statt nur einen Umweg abzukürzen.

---

## Die Entwurfsentscheidung, an der die ganze Fläche hing

`sha256` ist Pflicht und kommt „vom Erfasser". Zwei naheliegende Wege scheiden aus:

| Weg | Warum nicht |
|---|---|
| Hash abtippen lassen | Entwicklerwissen — die Fläche käme nie über „mit Umweg" hinaus |
| Datei hochladen | Das Modell schließt es **ausdrücklich** aus: Aufbewahrungs- und Löschpflichten bleiben beim Quellsystem, solange [THE-536](https://linear.app/thearchitect/issue/THE-536) offen ist |

Bleibt genau ein Weg: **Der Browser liest die Datei, bildet den Fingerabdruck, nur dieser
geht raus.** Die Datei verlässt den Rechner nie — und der Nutzer erfährt das ausdrücklich,
weil es eine Zusage ist und keine Nebensache.

---

## Anforderungen → Umsetzung → Nachweis

| REQ | Was wahr sein muss | Umsetzung | Nachweis |
|---|---|---|---|
| **[THE-585](https://linear.app/thearchitect/issue/THE-585)** (576.1) | Der Fingerabdruck entsteht lokal, die Datei bleibt | `evidenceHash.ts` (`crypto.subtle`), Hinweis in der Fläche | 7 Tests, darunter die **FIPS-180-4-Referenzwerte** für `""` und `"abc"` — eine Implementierung, die sie verfehlt, ist falsch, egal wie plausibel sie aussieht |
| **[THE-586](https://linear.app/thearchitect/issue/THE-586)** (576.2) | Anhängen und Lesen ohne API, Alterung sichtbar | `EvidencePanel.tsx`, eingehängt neben dem Tore-Abzeichen | 6 Tests: Liste, stale-Kennzeichnung, Upload-Zusage, Server-Begründung im Klartext, kein Absenden ohne Datei, exakter Request-Body |
| **[THE-587](https://linear.app/thearchitect/issue/THE-587)** (576.3) | Ein Attest ohne Nachweis bleibt sichtbar unbelegt | Warnzeile, die „nichts erfasst" von „alles veraltet" unterscheidet | 3 Tests |

---

## Was bewusst NICHT gebaut wurde

- **Die Credential-Regel wurde nicht in den Client dupliziert.** `refCarriesCredentialMaterial`
  bleibt server-seitig; die Fläche zeigt die Server-Begründung im Klartext (Muster `setGate`).
  Eine zweite Kopie wäre genau der „zweite Katalog am API-Rand", vor dem der Modell-Kopf warnt.
- **`kind` bleibt Freitext** mit Vorschlägen. Der kanonische Werteraum kommt aus THE-553.
- **Die Fläche setzt kein Tor.** Nachweis anhängen ≠ attestieren; der Notar-Akt bleibt getrennt
  (THE-557).

## Ein Fund, der nicht in dieses Ticket gehört

Die Routen-Regel „attestieren verlangt frischen Nachweis" hat **keinen Test**.
`evidence.test.ts` deckt die Dienst-Bausteine ab, nicht die Kopplung an der Route. Das ist
Bestand aus THE-558 und wurde als eigene Aufgabe herausgeschrieben — nicht stillschweigend
in diesen Bau gezogen.

## Grenzen

- **Nicht am Klick geprüft**, wie bei THE-571/573/574/575: Bauteil-Tests plus Messung des
  Ausgangszustands am echten Bestand, kein angemeldeter Browser. Der Dateiwahl-Pfad ist im
  Test mit einer echten `File` durchlaufen (der Hash von `"abc"` wird geprüft), aber nicht
  mit einer echten Nutzergeste.
- **Große Dateien** werden vollständig in den Speicher gelesen (`arrayBuffer`). Für
  Nachweis-Dokumente unkritisch; ein Stream-Hash wäre die Antwort, falls jemand ein
  Gigabyte-Archiv wählt.
