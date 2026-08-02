# Tagesplan 2026-08-03 — die Kundenseite, senkrecht durch die Meldepflicht

> **Pre-Flight gefahren am 2026-08-02, Tickets angelegt.** Die Stufe 1 hat ein Beinahe-Duplikat
> gefunden: **THE-544** („Verdrängung als Ausschluss-Gate") baut bereits den Konsumenten von
> `PREVAILS_OVER` — er löst nur bewusst *nicht* nach Kunde auf, weil es kein Kundenprofil gibt.
> Block 2 wurde daraufhin verkleinert: **nur das Profil, nicht das Gate.**
>
> | Ticket | | Score |
> | --- | --- | --- |
> | **THE-548** | REQ-LAW-001.11 (F5) — Anwendbarkeitsprofil, *blockt THE-544* | 94,3 |
> | **THE-549** | REQ-REQHARM-001.5a — Fristobjekt ⟨Dauer, Bezugspunkt, Stufe⟩ | 80,0 |
> | THE-550 | ENTSCHEIDUNG Absatz-Granularität + stabile Norm-Id — nur angelegt | — |
> | THE-551 | ENTSCHEIDUNG Ziel-Architekturebene — nur angelegt | — |

**Der Befund in einem Satz:** Das Modell kennt das Recht ausgezeichnet und den Kunden gar nicht.

**Die schärfste Illustration, am Bestand verifiziert:** `findDisplacement(displacedSource, addresseeClass)` ist korrekt gebaut, am Primärtext belegt und mit zwei Zitaten hinterlegt — und hat **null Produktaufrufer**. Einziger Aufruf: `packages/server/src/evals/reqtrace/measureGrouping.ts:105`, also der Eval-Pfad. Das zweite Argument hat im Produkt keine Quelle, weil `Project.ts` kein einziges Feld für Sektor, Rolle, Größe oder Jurisdiktion führt.

Damit ist der teuerste Befund des Projekts — 10 von 16 SCF-Kandidaten durch *lex specialis* gegenstandslos — **nicht produktwirksam**.

---

## Der eine Satz, der abends steht oder nicht

> „Für eine **Bank** gelten DSGVO Art. 33 und DORA Art. 19 — NIS2 Art. 23 nicht.
> Für einen **Energieversorger** gelten DSGVO Art. 33 und NIS2 Art. 23 — DORA nicht.
> In beiden Fällen bindet die **kürzeste Frist**: 4 h bei der Bank, 24 h beim Energieversorger.
> Die **Nachweispflicht bleibt getrennt** — zwei Empfänger, zwei Uhren, zwei Belege."

Dieser Satz ist verkaufbar. „73 % Compliance" ist es nicht.

Er braucht genau **zwei** der fünf Lücken: das Anwendbarkeitsprofil (*welche* Normen) und das Fristobjekt (*welche* Uhr). Die anderen drei nicht — sie sind morgen ausdrücklich nicht dran.

---

## Prämissen-Einordnung (Pre-Flight Stufe 3)

| Lücke | Prämisse | Urteil | Ticket-Art |
| --- | --- | --- | --- |
| **1. Anwendbarkeitsprofil am Projekt** | „`findDisplacement` hat im Produkt keine Datenquelle" | **verifiziert** — 0 Produktaufrufer, 0 Profilfelder in `Project.ts` | **Bau** |
| **3. Fristobjekt ⟨Dauer, Bezugspunkt, Stufe⟩** | „NIS2 und DORA zählen von verschiedenen Punkten; eine Uhr für beide rechnet für eine falsch" | **gemessen** 2026-08-01 an Primärquellen (`docs/strategy/2026-08-01-the538-dora-meldepflicht.md`) | **Bau** |
| 2. Absatz-Granularität + stabile Normsatz-Id | „Artikel-Granularität verliert die Pflicht" | **geglaubt** (Indiz: 1428 eIds, 0 mit Absatz-Ebene; NIS2 Art. 23 trägt drei Fristen in einer Section) | Entscheidung — nur **anlegen** |
| 4. Layer-Zuordnung am Katalog | „Die Architektur-Ebene ist aus der Handlung ableitbar" | **geglaubt** — und heute ist eine formgleiche Ableitungs-Hypothese gescheitert (THE-547) | Entscheidung — nur **anlegen** |
| 5. Evidenz-Objekt + dreiteiliger Erfüllungsgrad | Drei-Tore-Modell | strategisch belegt, aber **großer Bau** | eigener Pre-Flight, nicht morgen |

**Die Lehre von heute wird angewandt:** Erwartungswerte stehen **vor** dem Lauf. In THE-545 fehlte der Schwellenwert fürs menschliche Tor, und die Zahl war hinterher weder Bestehen noch Durchfallen.

---

## Erwartungswerte — festgeschrieben, bevor eine Zeile Code entsteht

Zwei Profile, vier Normsätze. Was herauskommen **muss**:

| | Bank (`financial_entity`) | Energieversorger (`essential_important_entity`) |
| --- | --- | --- |
| DSGVO Art. 33 (A) | ✅ anwendbar | ✅ anwendbar |
| DSGVO Art. 34 (B) | ✅ anwendbar | ✅ anwendbar |
| NIS2 Art. 23 (C) | ❌ **verdrängt** durch DORA | ✅ anwendbar |
| DORA Art. 19 (D) | ✅ anwendbar | ❌ **nicht anwendbar** (Rolle fehlt) |
| bindende Frist | **4 h** (DORA, ab Einstufung) | **24 h** (NIS2, ab Kenntnis) |

**Der Unterschied, auf den es ankommt:** *verdrängt* und *nicht anwendbar* sind **zwei verschiedene Zustände**. Heute kann das Modell sie nicht unterscheiden. Ein System, das beides als „gilt nicht" ausgibt, kann einem Prüfer nicht erklären, warum.

**Abbruchbedingungen:** Kommt eine dieser acht Zellen anders heraus, ist das der Befund des Tages — dann kein Block 4. Nachgebessert wird nur, was als Harness-Fehler belegt ist.

---

## Blöcke

### Block 1 — Pre-Flight + Tickets *(früh, ~1 h)*

Stufen 1–2 sind für die Lücken 1 und 3 durch diese Prüfung erledigt; es fehlen Linear-Suche, Scoring, Komplexitätsverdikt.

- Linear nach Überschneidungen: THE-460 (UseCaseProfile), Applicability-Engine, THE-421
- WSJF + Ousterhout je Bau-Ticket, Score in Ticket **und** RVTM
- Vier Tickets: 2 Bau (Profil, Frist), 2 Entscheidung (Granularität, Layer) — letztere nur angelegt, mit Positiv- und Negativ-Kontrolle in der DoD
- **Freigabe abwarten**, dann erst Block 2

### Block 2 — Anwendbarkeitsprofil am Projekt *(~2 h)*

**Dateien:** `packages/server/src/models/Project.ts` · `packages/shared/src/types/` (neuer Typ) · `packages/server/src/services/regulationApplicability.service.ts`

Minimal und endlich — aus den Geltungsbereichs-Artikeln abgeleitet, nicht erfunden:

```
LegalProfile {
  jurisdictions:     string[]   // aus NORM_ONTOLOGY.jurisdictions
  sectors:           string[]   // NIS2 Anhang I/II
  addresseeClasses:  string[]   // aus NORM_ONTOLOGY.partyRoles — MEHRERE zulässig
  size:              { employees?: number; revenueEur?: number }
  dataKinds:         string[]   // personenbezogen, besondere Kategorien, …
}
```

- **Additiv**, alle Felder optional. Ohne Profil verhält sich alles wie heute — kein Rollback-Risiko, keine Migration.
- `addresseeClasses` ist eine **Liste**: die DSGVO bindet dasselbe Unternehmen als Verantwortlichen *und* als Auftragsverarbeiter, mit verschiedenen Pflichtenbündeln. Ein Einzelwert wäre schon das falsche Modell.
- **Drei Zustände, nicht zwei:** `anwendbar` · `verdrängt (durch X, Beleg Y)` · `nicht anwendbar (Rolle fehlt)`. Die Verdrängung trägt ihr Zitat mit.
- `findDisplacement` bekommt seinen Aufrufer im Produktpfad.
- **Unbekannt ≠ nicht anwendbar.** Fehlt das Profil, ist die Antwort „unbestimmt", nicht „gilt nicht" — die Fehlerrichtung, die die Applicability-Engine schon richtig kalibriert hat.

### Block 3 — Messung an der Meldepflicht-Familie 🚦 *(~1 h)*

Zwei Fixture-Profile, vier Normsätze, die Tabelle oben als Testmatrix. Kein LLM — das ist ein **mechanischer** Test, und mechanisch Entscheidbares gehört nicht ins Modell.

**Gate:** 8 von 8 Zellen richtig → Block 4. Sonst Bericht und Stopp.

### Block 4 — Fristobjekt *(~2 h)*

**Dateien:** `packages/shared/src/obligations/slots.ts` (additiv) · neuer Ableitungs-Prompt

```
Deadline {
  dauer:       { wert: number; einheit: 'h' | 'd' | 'mon' }
  bezugspunkt: 'kenntnis' | 'einstufung' | 'vorherige-meldung' | 'ereignis'
  stufe:       'erst' | 'zwischen' | 'abschluss'
}
```

- **Neben** dem Freitext-`bedingung`, nicht statt seiner. Der Rohslot bleibt Messeingabe; das strukturierte Objekt ist abgeleitet und trägt seine Herkunft.
- `bezugspunkt` ist die Achse, die heute vollständig fehlt — und die einzige, die NIS2 von DORA trennt. `"72 Stunden ab Kenntnis"` und `"72 Stunden ab Erstmeldung"` sehen als String fast gleich aus und bedeuten etwas völlig anderes.
- **Prüfsatz:** die vier Normsätze A–D müssen sich im Bezugspunkt unterscheiden. Tun sie es nicht, ist die Ableitung wertlos, egal wie plausibel sie klingt.

### Block 5 — Der Satz, oder der Befund *(~30 min)*

`docs/evals/meldepflicht-kundenseite.md`: die acht Zellen, die bindende Frist je Profil, was trägt und was reißt. Aufbau wie `reqtrace-decision.md` — Zahlen, Grenzen, eigene Fehler, Konsequenzen.

---

## Was morgen ausdrücklich NICHT passiert

- **Keine Absatz-Granularität, keine Normsatz-Id-Migration.** Das ist eine Migration über 1428 eIds und braucht eine gemessene Entscheidung. Ticket ja, Bau nein.
- **Keine Layer-Zuordnung.** Heute ist eine formgleiche Ableitungs-Hypothese („der Gegenstand bestimmt die Gruppierung") an der Messung gescheitert. Dieselbe Form ein zweites Mal ungeprüft zu bauen wäre der Fehler, den THE-547 gerade teuer bezahlt hat.
- **Kein Evidenz-Objekt.** Eigener Pre-Flight; ohne es bleibt `done` im Audit ein unbelegtes Häkchen, aber das ist ein Befund, kein Tagesziel.
- **Keine 100 Gesetze.** Vier Normsätze, senkrecht. Der Schnitt deckt Strukturfehler auf, die ein horizontaler erst nach hundert zeigt.

## Risiko, das ich sehe

Der Tag berührt **Produktionsmodelle** — anders als THE-545/547, die nur JSON neben die Golden Sets geschrieben haben. `Project.ts` ist ein Schema, an dem Kundendaten hängen. Deshalb: additiv, alles optional, kein Feld umgedeutet, Rollback = Felder ignorieren.
