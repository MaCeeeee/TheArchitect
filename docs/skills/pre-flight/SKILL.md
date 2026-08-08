---
name: pre-flight
description: "PFLICHT vor jedem Plan und jeder Implementierung eines UC/REQ/Bugfix. Prüft Bestand, Prämissen, Wert und Komplexität, definiert den Loop-Kontrakt — und legt erst danach Tickets an. Auslöser: neue Aufgabe, 'lass uns X bauen', Ticket aktivieren, vor writing-plans."
---

# Pre-Flight

Sechs Stufen, bevor geplant oder gebaut wird. Sie beantworten fünf Fragen: **Gibt es das schon? Stimmt die Annahme? Lohnt es sich? Was handeln wir uns ein? Und wann hören wir auf?**

**Ankündigen:** „Ich fahre den Pre-Flight für <Vorhaben>."

**Reihenfolge ist bindend.** Jede Stufe kann das Vorhaben stoppen oder umschneiden — das ist ihr Zweck, nicht ein Nebeneffekt.

---

## Stufe 1 — Linear-Suche

- Bestehende Issues nach überlappenden Features/REQs durchsuchen (Titel **und** Beschreibung).
- **Done**-Issues, die (Teile der) Arbeit bereits abdecken, ausdrücklich melden.
- Bestehende REQs im betroffenen Bereich sammeln — sie sind der Schutzraum: der spätere Plan darf sie nicht brechen.

## Stufe 2 — Codebase-Scan

- Nach betroffenen Komponenten, Stores, Routen, Services greppen.
- Prüfen, ob vorhandene Funktionen das Geplante schon (teilweise) tun.
- Den Ist-Zustand im Zielbereich wirklich lesen, nicht raten.
- Bei größerem Umfang: Explore-Agenten mit konkreten Fragen beauftragen, Antworten mit `Datei:Zeile` verlangen.

**Ergebnis der Stufen 1+2 dem Nutzer vorlegen:** „Diese REQs sind betroffen, diese Features könnten kollidieren, das existiert bereits."

## Stufe 3 — Prämissen-Prüfung ⟵ *die Stufe, die am häufigsten fehlt*

> **Was nimmt dieses Vorhaben als wahr an — und ist das gemessen oder geglaubt?**

Die tragende Annahme **benennen** und einordnen:

| | |
|---|---|
| **gemessen** | Beleg verlinken (Messung, Adjudikation, Eval, Kundenaussage) → weiter zu Stufe 4 |
| **geglaubt** | bei nennenswerten Baukosten: **STOPP** |

Bei „geglaubt": **zuerst ein Entscheidungs-Ticket**, das das Bau-Ticket per `blockedBy` blockiert.

| Ticket-Art | Schließt mit | Darf existieren, wenn |
|---|---|---|
| **Entscheidung** | einer belegten Antwort | immer |
| **Bau** | Code | seine Prämissen entschieden sind |

Ein Entscheidungs-Ticket braucht **Positiv- und Negativ-Kontrolle** in der Definition of Done — sonst misst es nur, was ohnehin geglaubt wird.

*Präzedenz: THE-438 war ein voll ausgearbeitetes Bau-Ticket (7 REQs, Datenmodell, Migration) auf einer ungeprüften Annahme. Zwei Stunden Messung entzogen ihr die Grundlage → THE-538 blockiert seither.*

## Stufe 4 — WSJF-Scoring (8 Kriterien)

Je 0–5, gleich gewichtet (8 × 12,5 %): **Business Value · Business Risk · Implementation Challenges · Chance of Success · Compliance · Relationship to Requirements · Urgency · Status** (abgeleitet).

- Priority Score bestimmt die Backlog-Reihenfolge.
- Bei Aktivierung eines Alt-Tickets **neu bewerten** — Scores sind Momentaufnahmen; gefallene Blocker und neue Erkenntnisse verschieben sie.
- Score in Ticket **und** RVTM.

## Stufe 5 — Komplexitätsbewertung (Ousterhout)

WSJF sagt, *ob* es Wert hat — nicht, *was wir uns einhandeln*. Drei Symptome + zwei Ursachen, je niedrig/mittel/hoch:

**Symptome**
1. **Change Amplification** — muss eine künftige *einfache* Änderung an vielen Stellen nachgezogen werden?
2. **Cognitive Load** — wie viel muss man wissen, um daran zu arbeiten? Neue Konzepte, Sonderfälle?
3. **Unknown Unknowns** *(das schlimmste)* — ist offensichtlich, *was* zu ändern ist und *welche* Information man dafür braucht?

**Ursachen (die Hebel)**
- **Abhängigkeiten** — neue Kopplungen minimieren und explizit machen.
- **Obscurity** — Nicht-Offensichtliches durch Selbsterklärung/Doku beseitigen.

**Regel:** Hoch bei *Unknown Unknowns* oder *Abhängigkeiten* → **vor** der Issue-Erstellung umschneiden (mehr Repo-Verifikation, anderes Slicing), nicht einfach bauen. Verdikt (5 Dimensionen + Haupt-Watch-Point) neben den WSJF-Score in die RVTM.

## Stufe 6 — Issue + REQ-Unter-Issues

Erst jetzt entstehen Tickets.

- Parent-Issue mit Beschreibung, Akzeptanzkriterien, betroffenen Dateien; Label `Feature` | `Improvement` | `Bug`.
- **Pflicht: REQ-Unter-Issues** als Kinder (`parentId`), Titel mit `REQ-`-Präfix, Label `Requirement`, je eigene Akzeptanzkriterien.
  - Mindestens 1; komplexe Features 3–8, die verschiedene Aspekte abdecken.
  - REQs beschreiben **WAS wahr sein muss**, wenn es fertig ist — prüfbare Bedingungen, keine Aufgaben.
- **Pflicht: Loop-Kontrakt** im Parent-Issue — drei Zeilen, die den Bau-Loop regeln, bevor er startet:

  | Feld | Frage | Quelle |
  |---|---|---|
  | **Kill-Kriterium** | Welcher Befund beendet das Vorhaben — und was ist der Re-Trigger? | Widerlegung der tragenden Prämisse aus Stufe 3 |
  | **Loop-Budget** | Nach wie vielen erfolglosen Fix-Zyklen am selben roten Kriterium wird eskaliert? Default: 3 | — |
  | **Impact-Statement (Soll)** | Welche Zahl belegt nach dem Deploy die Wirkung, und wie wird sie gemessen? | Business Value aus Stufe 4 — „wo erscheint der Effekt?" |

  - Eskalation heißt: stoppen und Befund vorlegen — was probiert, was gelernt, welche Hypothesen bleiben. Kein stiller nächster Versuch.
  - Zyklen mit **neuer Diagnose** zählen nicht gegen das Budget; wiederholte Patches auf dieselbe Hypothese schon. Spätestens ab dem zweiten roten Zyklus: `systematic-debugging` statt nächster Patch.
  - Hat ein Vorhaben keinen Impact jenseits seiner Funktion (typisch: Bug), ist das Impact-Statement die E2E-Evidenz („Fehlerbild reproduziert nicht mehr").
  - *Präzedenz Kill-Kriterium: THE-402 — Self-Host NO-GO, Re-Trigger bei 5k Seiten/Monat. Präzedenz Impact-Format: THE-571 — „5/7 EA-Fragen auf Niveau A/B", nicht „deployed".*
- Status auf „In Progress", wenn die Arbeit beginnt; REQs einzeln auf Done, sobald ihre Kriterien erfüllt sind.
- Das Parent-Issue schließt mit dem **Impact (Ist)** im Format des Soll-Statements — nicht mit einer Aktivitätsmeldung. Schließt Linear das Ticket automatisch (Branch-Name/Commit-Titel), wird der Impact als Kommentar nachgetragen.

---

## Übergabe

Ergebnis dem Nutzer vorlegen — **Bestand · Prämissen-Urteil · Score · Komplexitäts-Verdikt · Loop-Kontrakt · Slice-Vorschlag** — und Freigabe abwarten.

Erst danach `writing-plans` (Plan + RVTM), erst danach `subagent-driven-development`.

## Rote Linien

- **Nie** ein Bau-Ticket anlegen, dessen tragende Prämisse ungemessen ist.
- **Nie** Stufe 1/2 überspringen, weil „das kenne ich doch" — genau dort sitzen die Dubletten und die schon gebauten Teile.
- **Nie** einen Alt-Score ungeprüft übernehmen.
- **Nie** mit der Implementierung beginnen, bevor der Nutzer den Plan freigegeben hat.
- **Nie** ein Done melden, das nur Aktivität benennt („deployed", „gemerged") — Done nennt die gemessene Wirkung oder die E2E-Evidenz.
- **Nie** das Loop-Budget stillschweigend überziehen — Eskalation mit Befund ist der vorgesehene Ausgang, kein Versagen.
