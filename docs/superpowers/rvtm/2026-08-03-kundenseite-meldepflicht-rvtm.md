# RVTM — Die Kundenseite, senkrecht durch die Meldepflicht

**Plan:** `docs/superpowers/plans/2026-08-03-kundenseite-meldepflicht-vertikalschnitt.md`
**Tickets:** THE-548 (Bau, 94,3) · THE-549 (Bau, 80,0) · THE-550 / THE-551 (Entscheidung, nur angelegt)
**Datum:** 2026-08-03 · **Basis:** Branch `mganzmanninfo/the-548-legal-profile` von master `9cb1408`
**Rahmen:** ADR-0007 · Glossar `CONTEXT.md`

Status: ⬜ offen · 🟡 in Arbeit · ✅ verifiziert · ❌ gerissen

---

## Der Befund, der beide Bau-Tickets trägt

**Das Modell kennt das Recht ausgezeichnet und den Kunden gar nicht.** Am Bestand verifiziert
am 2026-08-02:

| Prüfung | Ergebnis |
|---|---|
| `findDisplacement(displacedSource, addresseeClass)` | **0 Produktaufrufer** — nur `evals/reqtrace/measureGrouping.ts:105` und Tests |
| `Project.ts` gegen Sektor/Rolle/Größe/Jurisdiktion | **0 Treffer** |
| `canonicalActions` | 26 Einträge, **keine** Architektur-Ebene |
| Evidenz-Modell | **existiert nicht** |
| Sanktions-Facette | **0 Treffer** in der Ontologie |
| Korpus | 1428 eIds, **0** mit Absatz-Ebene |

---

## THE-548 — Anwendbarkeitsprofil (Score 94,3)

| ID | Anforderung | Plan-Block | Verifikation | Status |
|---|---|---|---|---|
| **AC-1** | `LegalProfile` als **optionales** Feld am Projekt; ohne Profil verhält sich alles wie heute | Block 2 | Unit: Projekt ohne Profil erzeugt identische Ausgabe wie vor der Änderung | ✅ |
| **AC-2** | Werteräume aus `NORM_ONTOLOGY` (`jurisdictions`, `partyRoles`), **kein** zweiter Rollenraum | Block 2 | Unit: jeder zulässige Wert existiert in der Ontologie; Fremdwert wird abgelehnt | ✅ |
| **AC-3** | **Drei** Zustände: `anwendbar` · `verdrängt (durch X, Beleg Y)` · `nicht anwendbar (Rolle fehlt)` | Block 2 | Unit: alle drei sind unterscheidbar; die Verdrängung trägt ihr Zitat | ✅ |
| **AC-4** | **Unbekannt ≠ nicht anwendbar** — ohne Profil lautet die Antwort `unbestimmt` | Block 2 | Unit: Projekt ohne Profil → 4× `unbestimmt`, nie `nicht anwendbar` | ✅ |
| **AC-5** | `findDisplacement` bekommt seinen **ersten Produktaufrufer** | Block 2 | grep: mindestens ein Aufruf außerhalb von `evals/` und `__tests__/` | ✅ |
| **AC-6** | `addresseeClasses` ist eine **Liste** — dieselbe Firma kann Verantwortlicher *und* Auftragsverarbeiter sein | Block 2 | Unit: zwei Rollen gleichzeitig führen zu zwei Pflichtenbündeln | ✅ |

### 🚦 Gate: die acht Zellen — vorab festgelegt, wird nicht angepasst

| Normsatz | Bank (`financial_entity`) | Energieversorger (`essential_important_entity`) | Status |
|---|---|---|---|
| DSGVO Art. 33 | ✅ anwendbar | ✅ anwendbar | ✅ |
| DSGVO Art. 34 | ✅ anwendbar | ✅ anwendbar | ✅ |
| NIS2 Art. 23 | ❌ **verdrängt** (DORA Art. 1(2)) | ✅ anwendbar | ✅ |
| DORA Art. 19 | ✅ anwendbar | ❌ **nicht anwendbar** (Rolle fehlt) | ✅ |

**8/8 → Block 4. Sonst Stopp und Bericht.** Mechanischer Test, kein Modellaufruf.

### Negativ-Kontrollen

| ID | Bedingung | Status |
|---|---|---|
| **N-1** | Projekt **ohne** Profil → alle vier `unbestimmt` | ✅ |
| **N-2** | Profil `['controller','financial_entity']` verdrängt NIS2, lässt die DSGVO **unberührt** | ✅ |

---

## THE-549 — Fristobjekt (Score 80,0)

**Nur wenn das Gate 8/8 steht.**

| ID | Anforderung | Plan-Block | Verifikation | Status |
|---|---|---|---|---|
| **AC-1** | `Deadline` **neben** `bedingung`, nicht statt seiner | Block 4 | Unit: `bedingung` unverändert, `Deadline` additiv | ⬜ |
| **AC-2** | Jedes Objekt trägt seinen **Quell-Freitext** | Block 4 | Unit: `quelle` nie leer, wenn `Deadline` gesetzt ist | ⬜ |
| **AC-3** | Nicht ableitbar → `null`, **kein** Default-Bezugspunkt | Block 4 | Unit: unklare Klausel erzeugt `null` | ⬜ |
| **AC-4** | Bindende Frist = kürzeste Dauer **bei gleichem Bezugspunkt** | Block 4 | Unit: verschiedene Bezugspunkte werden **nicht** verrechnet | ⬜ |
| **P-1** | Über A–D **mindestens drei verschiedene** `bezugspunkt`-Werte | Block 4 | Lauf über die vier Normsätze | ⬜ |
| **P-2** | DORA Art. 19 Stufe 2 → `vorherige-meldung`; NIS2 Art. 23 Stufe 2 → `kenntnis` | Block 4 | derselbe Lauf | ⬜ |
| **N-1** | 4 h (ab Einstufung) und 72 h (ab Kenntnis) ergeben **nicht** „4 h" | Block 4 | Unit | ⬜ |
| **N-2** | Klausel ohne Frist → `null`, kein erfundener Wert | Block 4 | Unit | ⬜ |

**Abbruch:** < 3 verschiedene Bezugspunkte → Ticket schließt **negativ**, die Achse ist nicht extrahierbar.

---

## Komplexitäts-Verdikte (Ousterhout)

| | Change Ampl. | Cognitive Load | **Unknown Unknowns** | Abhängigkeiten | Obscurity |
|---|---|---|---|---|---|
| **THE-548** | niedrig | niedrig | **mittel** | mittel | niedrig |
| **THE-549** | niedrig | mittel | **HOCH** ⟵ | niedrig | niedrig |

**Watch-Point THE-548:** der **Sektor-Werteraum**. NIS2 Anhang I/II ist endlich, aber die
Zuordnung eines konkreten Kunden dazu ist eine **Rechtsfrage**, keine Datenpflege. Das Feld
darf nicht als „einfach ausfüllen" auftreten — Vorschlag mit Beleg, Bestätigung durch den
Menschen (Asilomar #16).

**Watch-Point THE-549:** die **Extraktionsgüte des Bezugspunkts**. Deshalb trägt das Ticket
seine Kontrollen selbst und schließt negativ, statt zu bauen und zu hoffen.

---

## Benanntes Risiko

Erstmals seit drei Tagen wird ein **Produktionsmodell** angefasst. THE-545/547 haben nur JSON
neben die Golden Sets geschrieben; `Project.ts` ist ein Schema mit Kundendaten daran.

**Gegenmaßnahme:** additiv, alle Felder optional, kein Feld umgedeutet, keine Migration.
**Rollback = Felder ignorieren.**

---

## Offene Befunde, die sichtbar bleiben müssen

| | |
|---|---|
| **68,8 %** ist der gemessene Fehlerrest der Kette (THE-545, 32 adjudizierte Fälle) | gehört in die Oberfläche, nicht in eine Fußnote |
| **HRS-03** wird zweimal unabhängig nicht gefunden | Befund, keine Aufgabe |
| **Artikel-Granularität** ist ein terminiertes Risiko (THE-550) | muss entschieden sein, **bevor** wir über neun Artikel hinausgehen |

---

## Nachtrag zu Block 1

Der Pre-Flight lief am 2026-08-02 **nachträglich** — der Tagesplan hatte ihn fälschlich als
ersten Block *innerhalb* des Plans geführt. Stufe 1 fand daraufhin sofort **THE-544**, das den
Verdrängungs-Konsumenten bereits beschreibt; THE-548 wurde auf „nur das Datum" verkleinert und
blockt THE-544, statt ihn zu doppeln. Diese RVTM schließt Block 1 ab.
