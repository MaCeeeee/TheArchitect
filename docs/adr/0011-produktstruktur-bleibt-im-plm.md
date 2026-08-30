# ADR-0011: Der Gegenstand gehört ins PLM — keine Produktstruktur in TheArchitect

- **Status:** Accepted (2026-08-30, Matthias Ganzmann), im Grill-Verfahren (grill-with-docs) — 9 Entscheidungen einzeln bestätigt
- **Datum:** 2026-08-30
- **Schließt:** THE-625 („Trägt die Produktstruktur als Betroffenheits-Subjekt?") mit der Option *nichts tun*
- **Baut auf:** BSH-Sprachnachricht 2026-08-05 (`docs/customer/2026-08-05-bsh-tagging-sprachnachricht.md`) · Pre-Flight THE-625 (2026-08-07) · ADR-0010 (Spezialisierung) · Zielkatalog `docs/strategy/ziele.md`
- **Glossar:** `CONTEXT.md`, „Information Architecture" — die Begriffe **Scharnier**, **Typ/Instanz-Grenze** und **Probe** benennen diese Grenze bereits; dieses ADR entscheidet sie.

## Kontext

BSH hat von sich aus einen Anwendungsfall gebracht: Betroffenheit zwischen Regularie und
Produktstruktur (Trading Good → Component → Raw Material → Substance) über geteilte Tags plus
Regelwerk. THE-625 stellte die tragende Frage — lässt sich der Betroffenheits-Subjektraum von
Architektur-Elementen auf die Produktstruktur ausdehnen?

Der Befund des Pre-Flights: **Das ist überwiegend Produktarchitektur/PLM, nicht
Unternehmensarchitektur.** Stückliste, physische Teile-Merkmale, Produktlebenszyklus — nichts
davon ist ArchiMate. Der Markt ist besetzt: SAP EHS Product Compliance, Siemens Teamcenter,
Assent, Sphera, iPoint.

Die Grenze lebte seither als **Vokabular** (CONTEXT.md: „Keine Stückliste ist damit prüfbar:
kein Element unterhalb der Typ-Ebene — außer als Probe") und als Notiz, aber **nie als
Entscheidung** — ohne Alternativen, ohne Preis, ohne Re-Trigger. Genau das holt dieses ADR nach.

## Entscheidung

**E1 — Der Betroffenheits-Subjektraum bleibt Unternehmensarchitektur.** Wir führen
Norm → Geltungsbereich; Teil → Substanz führt der Kunde in seinem PLM. Die Instanz-Ebene
(Teilestämme, Stücklisten) wird nicht übernommen, nicht synchronisiert und nicht als Bestand
behauptet. Einzige Ausnahme bleibt die **Probe** (CONTEXT.md).

**E2 — Der Mechanismus ist domänenfrei und bleibt es.** „Subjekt trägt Merkmale, Norm ist
Prädikat darüber, Vererbung entlang der Zerlegung, Neubewertung bei Änderung" ist für
IT-Elemente gebaut (Compliance-Facts v1, `PREDICATES_V1`). Er ist auf Produktstrukturen
anwendbar — **beim Instanz-Halter**, nicht bei uns.

**E3 — Was stattdessen wächst.** Die organisationsübergreifende Sicht entsteht nicht über
Teile, sondern über Dienstleister: `ops.op = vendor_processor|vendor_other` wird vom Merkmal am
Element zum eigenen `business_actor` «Auftragsverarbeiter» befördert. Das ist ADR-0010-konform
(Spezialisierung eines Standardtyps), bricht kein Prädikat und macht das bereits gebaute
`nis2.art21.supplychain` erstmals traversierbar statt nur auswertbar.

## Verworfene Alternativen

**A — Produktstruktur als weiterer Subjekt-Typ** (`kind` um Trading Good / Component / Raw
Material / Substance erweitern). Verworfen: Der Subjektraum trüge danach zwei Bedeutungen —
IT-Element *und* Sachgut —, und jede künftige Regel müsste beide meinen. Die `kind`-Werte
steckten anschließend in Bestandsdaten; nicht rückholbar. *Kommt zurück, wenn* der
Subjektraum ohnehin neu geschnitten wird.

**B — Eigenes Produktmodell neben der Architektur.** Verworfen: eigener Baum, eigener Import,
eigene Pflege — in einem reifen Markt, auf Daten, die uns nicht gehören, für einen einzigen
Kunden. Das ist die dokumentierte Drift „Produkt wird Projekt".

**C — Referenzierendes Modell** (Struktur bleibt im PLM, wir halten nur Verweis + normrelevante
Merkmale + Prädikat). Ernsthaft erwogen und knapp verworfen: Es rettet die Grenze, macht uns
aber von einem PLM-Konnektor abhängig, den der Kunde bauen oder freigeben muss, und verschiebt
das Produkt vom Modellierungs- zum Integrationswerkzeug. *Kommt zurück, wenn* ein PLM-Konnektor
aus anderem Grund entsteht **oder** ein zweiter Kunde denselben Produktbezug bringt — dann ist
es die erste Option, nicht A oder B.

## Preis, offen benannt

- **Der BSH-Demand bleibt unbedient** — und zwar einer, den der Kunde von sich aus gebracht hat
  („das ist ein Demand bei uns, das mal testen"). Das kostet Beziehungskapital, nicht nur
  Funktionsumfang. Der Türöffner bleibt BSHs eigener Halbsatz: **„aber auch
  Produktionsprozesse"** — Produktionsprozesse sind Geschäftsprozesse und damit unser Feld.
- Die Frage, die der Pre-Flight als entscheidend markiert hat, bleibt unbeantwortet:
  **wessen Budget?** Ein Business Architect mit einem Produktcompliance-Problem ist entweder
  eine echte Lücke oder ein Waisenproblem. Dieses ADR beantwortet sie nicht — es entscheidet
  nur, dass wir sie nicht durch Bauen beantworten.

## Zielwirkung

↑G4 (kein Modell auf fremden Daten, keine zweite Pflege) · ↑G5 (wir bleiben auf dem Feld, auf
dem sich Vorsprung aufbaut, statt in einen besetzten Markt zu laufen) · **↓G3** (der einzige
aktive Kundenkanal bekommt eine Absage) — bewusst.
