# RVTM — THE-573: Die Anwendbarkeit nennt die bindenden Artikel

**Datum:** 2026-08-03 · **Ticket:** [THE-573](https://linear.app/thearchitect/issue/THE-573)
**Herkunft:** Abnahme [THE-571](https://linear.app/thearchitect/issue/THE-571), Frage 2 (Stufe **B**)
**WSJF:** 80,0 — BV 5 · Risk 3 · Impl 5 · Success 5 · Compliance 4 · ReqRel 4 · Urgency 3 · Status 3

**Ousterhout:** Change Amplification niedrig · Cognitive Load niedrig · Unknown Unknowns **niedrig**
(die einzige offene Frage war vor dem Bau gemessen) · Abhängigkeiten niedrig · **Obscurity mittel**.
**Haupt-Watch-Point:** die Versuchung, `citations` wiederzuverwenden — gehalten, siehe REQ-573.1.

---

## Prämissen — beide vor dem Bau gemessen

| Annahme | Status | Beleg |
|---|---|---|
| Der Nutzer erfährt heute nicht, **welche** Artikel binden | **gemessen** | THE-571: `citations` bei **0 von 13** Gesetzen gefüllt |
| Die Kennungen liegen bereits vor | **gemessen** | `listTypingSummaries` projiziert `regulationKey`; kein Eingriff in den Korpus-Lesepfad |
| `regulationKey` ist die Section-`eId` | **gemessen im Pre-Flight** | **46 von 46** identisch bei `nis2-de` — keine Abbildungsschicht nötig |

---

## Anforderungen → Umsetzung → Nachweis

| REQ | Was wahr sein muss | Umsetzung | Nachweis |
|---|---|---|---|
| **[THE-579](https://linear.app/thearchitect/issue/THE-579)** (573.1) | Die Antwort trägt die bindenden Provisions, in einem **eigenen** Feld | `legalApplicability.service.ts`: `roleCounts` → `roleKeys` (Liste statt Zahl), `bindingProvisionEIds` an der Zeile | 5 Tests: Benennung, nur Profilrollen, Zahl/Liste ohne Drift, keine Liste wo nichts bindet, Deckelung mit ablesbarem Rest |
| **[THE-580](https://linear.app/thearchitect/issue/THE-580)** (573.2) | Die Fläche zeigt sie und führt zum Gesetzestext | `LegalApplicabilityCheck.tsx`: Artikel-Chips + Vorschau; `getNormSection` mit Korpus-Rückfall; Route umgestellt | 4 UI-Tests + 5 Dienst-Tests; **am echten Korpus: 47 von 47 auflösbar** |
| **[THE-581](https://linear.app/thearchitect/issue/THE-581)** (573.3) | Fehlende Typisierung ≠ „nichts bindet" | Zustand bleibt `undetermined`; ehrlicher Nenner `provisionsTyped`/`provisionsTotal` | 2 Dienst-Tests + 1 UI-Test (kein leerer Kasten) |

---

## Die Entwurfsentscheidung, die der Pre-Flight erzwungen hat

`citations` ist am Typ ausdrücklich für die **Verdrängungs-Kante** reserviert
(*„Bei `displaced`: die Belege der Kante"*, `legal-profile.ts:83`). Das Feld mit den
bindenden Artikeln zu überladen hätte zwei Aussagen vermengt, die im Prüfungsfall
verschiedene Fragen beantworten:

| Feld | Beantwortet |
|---|---|
| `citations` | *Warum* gilt DORA statt NIS2? |
| `bindingProvisionEIds` | *Welche Artikel* binden mich? |

Beide Listen stehen in der Fläche als **getrennte Blöcke** (`binding-provisions`,
`displacement-citations`), mit einem Test, der ihre Trennung festhält.

---

## Der Fund, den erst der echte Korpus zeigte

Nach grünen Tests lösten **44 von 47** bindenden Artikeln bis zum Gesetzestext auf — drei
nicht. Kein Kennungsproblem, sondern eine **Überschattung**: Das Projekt trug eine verkürzte
Norm unter `corpus:nis2` (Stummel aus dem alten Einfüge-Weg, eine einzige Section).
`getNorm` bevorzugt die Projekt-Kopie und fragt den Korpus nur, wenn gar keine da ist — also
nie.

**Dieselbe Falle wie im Generator-Dropdown am Vormittag** (1 statt 46 Artikel) und beim
Migrations-Befund (der Altbestand traf sich selbst). Dreimal an einem Tag dieselbe Ursache.

Daraus die Regel, jetzt als Dienst und mit fünf Tests festgehalten:

> **Eine Projekt-Kopie, welche die Antwort nicht enthält, ist kein Grund, den Korpus nicht zu fragen.**

Nach dem Fix: **47 von 47.**

---

## Was am echten Korpus herauskommt

```
Gesetze MIT benannten bindenden Artikeln: 8 von 13   (vorher: 0 von 13)

  nis2      bindend=3/35   → nis2:art-11, nis2:art-21, nis2:art-23
  dsgvo     bindend=39/78  → dsgvo:art-10, art-11, art-12, art-13 (+29 weitere)
  ai-act    bindend=11/91  → ai-act-de:art-11, art-12, art-14, art-15 (+1 weitere)
  mdr       bindend=33/101 → mdr-de:art-10, art-117, art-15, art-17 (+23 weitere)
```

NIS2 nennt Art. 21 (Risikomanagement) und Art. 23 (Meldepflichten) — fachlich plausibel.
DSGVO zeigt die Deckelung bei der Arbeit: 39 gebunden, 10 genannt, **29 ausgewiesen**.

---

## Grenzen — ehrlich benannt

- **Der Nenner bleibt der Korpus.** NIS2 ist zu 35 von 46 Artikeln typisiert; die elf
  untypisierten sind in der Rechnung unsichtbar. Die Fläche zeigt `typed X/Y`, damit das
  ablesbar bleibt — sie kann es aber nicht heilen. Gehört zu THE-540 Achse 2.
- **Nicht am Klick geprüft.** Wie bei THE-571 wurde auf Dienst-Ebene plus Quellenprüfung
  gemessen, nicht im angemeldeten Browser. Die UI-Tests decken den Klickpfad ab
  (Chip → `getSection` → Text), der echte Klick steht aus.
- Die Reihenfolge der Artikel ist die Sortierung des Korpus-Reads (`art-10, art-117,
  art-15`) — lesbar, aber nicht natürlich sortiert. Kosmetik, kein AC.

## Nachvollziehen

```
packages/server$ npx ts-node --transpile-only src/scripts/the573-resolve-probe.ts <projectId>
```

Read-only. Prüft, ob **jede** genannte Kennung bis zu echtem Gesetzestext führt.
