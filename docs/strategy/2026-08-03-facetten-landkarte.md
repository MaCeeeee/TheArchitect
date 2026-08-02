# Facetten-Landkarte — neun Facetten, sieben Fragen, am Bestand belegt

**Datum:** 2026-08-03 · **Anlass:** die Frage „können wir denn alle Fragen beantworten?" — vor jedem Korpus-Test
**Methode:** jede Behauptung mit `Datei:Zeile` belegt, nichts aus dem Gedächtnis
**Rahmen:** ADR-0007 · die sieben EA-Fragen aus der Zweckklärung (Schritt 0)

---

## Die Tiefenskala — warum „existiert" fünf verschiedene Dinge heißt

Dieselbe Facette kann an fünf Stellen leben, und der Bestand zeigt: **sie tut es fast nie an allen.**

| Tiefe | Bedeutung | Beispielfrage |
|---|---|---|
| **D1** | Werteraum in der Ontologie | *Gibt es die Kategorie?* |
| **D2** | Extraktion gemessen (Eval/Golden) | *Können wir sie zuverlässig bestimmen?* |
| **D3** | Im Korpus/DB persistiert | *Trägt der Bestand sie?* |
| **D4** | Produktmodell/Service | *Kann das Produkt sie verarbeiten?* |
| **D5** | Konsument (Route/Report/UI) | *Erreicht ein Nutzer sie?* |

---

## Die Landkarte

### 1. Anwendbarkeits-Prädikat — dient Frage 1

| Tiefe | Stand | Beleg |
|---|---|---|
| D1 | ✅ Rollen + Jurisdiktionen | `norm-ontology.v1.ts:162` (19 Rollen), `:304` |
| D2 | ✅ Gate 8/8 an zwei Fixture-Profilen | `legalProfile.test.ts` |
| D3 | ❌ **Schwellen/Prädikate der Norm-Seite nirgends strukturiert** | Korpus-Export: 0 Treffer |
| D4 | ✅ Kundenseite seit 02.08.: `LegalProfile` | `Project.ts:164` |
| D5 | ❌ **`assessNormApplicability` hat keinen Aufrufer** — keine Route, kein Service | grep: nur `ontology/index.ts:152` (Export) |

> **Korrektur an der eigenen Meldung vom 02.08.:** „produktwirksam" war zu stark. Richtig ist:
> *im Produktionscode angekommen, nicht angeschlossen.* Die element-basierte Applicability
> (`applicability-rules.ts`, Signale auf Elementnamen) hat einen Report-Konsumenten — das
> Rechts-Profil hat keinen.

### 2. Adressat/Rolle — dient Fragen 1, 2

| Tiefe | Stand | Beleg |
|---|---|---|
| D1 | ✅ 19 `partyRoles` | `norm-ontology.v1.ts:162` |
| D2 | ✅ Typisierung gemessen (THE-421/THE-515) | `evals/typingGolden.ts`, `typingMetrics.ts` |
| D3 | ✅ **korrigiert 03.08.:** der Korpus (Server B) trägt `typing.partyRole` auf **77 %** von 1640 Provisions (Status `suggested`) | THE-540 Pre-Flight-Messung · `corpusClient.service.ts:88-103` |
| D4 | ✅ beide Seiten: Kundenseite `LegalProfile` · Norm-Seite `typedProvision.service.ts` mit Hausregel (`rejected` raus, `versionHash`-Match) | `Project.ts:164` · `typedProvision.service.ts` |
| D5 | ❌ Konsumenten des Joins sind **Skripte** (`build-pairs-v2`, `obligation-slots`), keine Route | — |

> **Korrektur 03.08. an der Erstfassung:** hier stand *„0× `partyRole` im Korpus — die Typisierung blieb im Prüfstand"*. **Falsch.** Der Beleg war der lokale Export `norms.json` — der das `typing`-Subdokument schlicht nicht enthält. Die Datenbank auf Server B trägt es (Messung im THE-540-Pre-Flight: 1263/1640). **Ein Export ist kein Datenbankstand.** Die echte Lücke dieser Facette ist D5, nicht D3 — und THE-540 Achse 1 ist gebaut und getestet (23/23), nicht offen.

### 3. Kanonische Handlung — dient Fragen 3, 6 · **das Gelenk**

| Tiefe | Stand | Beleg |
|---|---|---|
| D1 | ✅ 26 `canonicalActions` | `norm-ontology.v1.ts:258` |
| D2 | ✅ 218/219 zuordenbar; menschliches Tor 68,8 % | THE-438 Slice 1 · `reqtrace-decision.md` |
| D3 | ❌ **bewusst read-only:** „dieser Dienst schreibt NICHTS" | `obligationAction.service.ts` Kopf |
| D4 | ⚠️ Service existiert — **einziger Aufrufer ist ein Script** | `classify-obligations.ts` |
| D5 | ❌ | — |

> Die Analyse nennt den Katalog „das einzige Gelenk, über das Fragen 4–6 beantwortbar werden".
> Befund: **das Gelenk existiert, aber keines der beiden Enden ist daran befestigt.**

### 4. Ziel-Architekturebene — dient Fragen 3, 4

| Tiefe | Stand | Beleg |
|---|---|---|
| D1 | ❌ Handlungen tragen nur `id, label, description` | verifiziert am gebauten Paket |
| D2–D5 | ❌ | [THE-551](https://linear.app/thearchitect/issue/THE-551) — Entscheidung, **formgleich zu THE-547 gewarnt** |

`ComplianceMapping.elementType` (13 Typen) ist **Instanzdatum eines Einzelfall-Mappings**, keine Facette der Handlung — es kann nicht sagen, was *fehlen würde*, wenn nichts gemappt ist. Ohne diese Facette hat Frage 4 keine Sollseite.

### 5. Auslöser + Frist — dient Fragen 5, 6

| Tiefe | Stand | Beleg |
|---|---|---|
| D1 | ⚠️ **Frist ✅ seit 02.08.** (`bezugspunkt`, `stufe`) · **Auslöser-Taxonomie ❌** (dauerhaft/ereignisgetrieben/periodisch/antragsgebunden: 0 Treffer) | `deadline.ts` · grep |
| D2 | ⚠️ 18 Tests — **an handgeschriebenen Klauseln, nie am Korpus** | `deadline.test.ts` |
| D3 | ❌ | — |
| D4 | ❌ `Deadline` hängt an nichts — nicht an `ComplianceRequirement` | — |
| D5 | ❌ | — |

`ausloeser` existiert als **Freitext** in der SystemRequirement-Extraktion (`reqtrace-prompt.ts:194ff`) — gemessen, aber ohne Werteraum.

### 6. Nachweisform — dient Fragen 4, 5

| Tiefe | Stand | Beleg |
|---|---|---|
| D1 | ❌ kein Werteraum (Register/Meldung/Bericht/Zertifikat/Protokoll) | — |
| D2 | ⚠️ als Freitext-Feld `nachweis` extrahiert, Teil des Zusammenfall-Schlüssels | `reqtrace-prompt.ts:200`, `:252`, `collapseKey :307-310` |
| D3–D5 | ❌ · **Evidenz-Objekt: 0 Modelle** | `models/`: 0 Treffer evidence/nachweis |

Der Extraktionspfad existiert; der Werteraum wäre bottom-up ableitbar wie Handlungen (216→26) und Gegenstände (223→30). Die `nachweis`-Werte von Lauf 4 sind allerdings **nicht persistiert** (das Ausgabeformat speichert Texte + Handlungen) — die Ableitung bräuchte einen Extraktionslauf über die vorhandenen Texte.

### 7. Deontik — dient Fragen 2, 5

| Tiefe | Stand | Beleg |
|---|---|---|
| D1 | ✅ `obligationKinds` (3) · Slot `modalitaet` | `norm-ontology.v1.ts:86` · `slots.ts:103` |
| D2 | ✅ Slots gemessen; `requirement`/`constraint`-Trennung | THE-438/545 |
| D3 | ⚠️ **korrigiert 03.08.:** `typing.obligationKind` auf **82 %** der Provisions (Server B) — vorhanden, aber unter dem Freigabe-Tor (macro-F1 0,579 < 0,75) und darum **nicht konsumierbar** | THE-540 Pre-Flight · `typing-release-gates.md` |
| D4/D5 | ⚠️ Projektion trennt constraint/requirement — aber als **Signalwort-Heuristik**, nicht über den gemessenen Slot-Weg | `requirementProjection.service.ts:48` |

Zwei Wege für dieselbe Facette: der gemessene (Slots) und der produktive (Heuristik) — **sie sind nicht verbunden.** Dasselbe Muster wie bei der Handlung.

### 8. Rechtsquelle / Rang / Umsetzungskette — quer

| Tiefe | Stand | Beleg |
|---|---|---|
| D1 | ✅ `normKinds` (10), `bindingness` (4), `relationTypes` inkl. `PREVAILS_OVER`, `DISPLACEMENTS` als Daten | `norm-ontology.v1.ts:22, :72, :120, :56` |
| D2 | ✅ Relations-Golden v5; ein adjudizierter Verdrängungsfall | `relations.v5.json` |
| D3 | ⚠️ Korpus trägt `kind` + `jurisdiction` — **`bindingness` 0, Kanten 0** | `norms.json` Top-Felder |
| D4 | ✅ `Norm.ts` validiert gegen die Ontologie | `Norm.ts:109-124` |
| D5 | ✅ Applicability-Report nutzt kind/jurisdiction | `applicability.types.ts` |

**Die stärkste Facette** — die einzige mit durchgängiger Kette bis D5. Sie zeigt, wie es aussieht, wenn es fertig ist.

### 9. Sanktion — dient der Priorisierung (Frage 7 „Was zuerst?")

**0 Treffer auf allen fünf Tiefen** (`sanction|sanktion|bussgeld|penalty`: 0 in Ontologie, Korpus, Modellen). `RemediationProposal.priority` ist eine **Modell-Meinung** ohne abgeleitete Grundlage.

---

## Querschnitts-Strukturen, die keiner Facette gehören

| Struktur | Stand | Beleg |
|---|---|---|
| **Normsatz-Granularität** | ❌ 1428 eIds, **0 mit Absatz-Ebene**; NIS2 Art. 23 = drei Fristen in *einer* Section | [THE-550](https://linear.app/thearchitect/issue/THE-550) |
| **Drei-Tore-Erfüllungsgrad** | ❌ Status eindimensional: `auto/confirmed/rejected` · `open/in_progress/done/waived` | `ComplianceMapping.ts:67` · `ComplianceRequirement.ts:58` |
| **Evidenz-Objekt** | ❌ existiert nicht | `models/`: 0 |
| **änderungsstabile Norm-Id** | ❓ ungeprüft — Teil von THE-550 | — |

---

## Die sieben Fragen — Reifegrad

| # | Frage | Reife | Der eine fehlende Schritt |
|---|---|---|---|
| 1 | Betrifft mich das Gesetz? | ⚠️ **halb** | *(korrigiert 03.08.)* beide Datenquellen existieren — fehlt: `assessNormApplicability` an den Korpus-Join anschließen und einem Nutzer zeigen (D5) |
| 2 | Welcher Teil? | ⚠️ **grob** | Absatz-Granularität (THE-550) |
| 3 | Anforderungen an Prozess/App/Daten/Org? | ❌ | Ebenen-Facette — erst messen (THE-551) |
| 4 | Erfülle ich es — wo? | ⚠️ **halb** | Drei-Tore-Status + Evidenz-Objekt (**kein Ticket**) |
| 5 | Wenn nein — was tun? | ⚠️ **halb** | `Deadline` an `ComplianceRequirement` anschließen |
| 6 | Harmonisierbar? | ⚠️ **gemessen, nicht produktiv** | Kette läuft im Eval; Verdrängungs-Gate = THE-544 |
| 7 | Was hat sich geändert? / Was zuerst? / Wer? | ❌ | Norm-Id-Stabilität (THE-550) · Sanktion (**kein Ticket**) · Handlung→Rolle (Teil von THE-551) |

**Keine Frage ist durchgängig beantwortbar. Frage 3 ist und bleibt der Engpass** — Fragen 4–6 setzen sie voraus.

---

## Das Muster: der Tiefe-3-Graben

```
D1 Werteraum      ████████░  8 von 9 Facetten
D2 gemessen       ███████░░  7 von 9
D3 im Korpus      ███░░░░░░  3 von 9  ⟵ korrigiert 03.08. (war fälschlich 1)
D4 Produktmodell  ████░░░░░  punktuell
D5 Konsument      ██░░░░░░░  2 von 9  ⟵ DER GRABEN sitzt hier
```

> **Korrektur 03.08.:** Die Erstfassung zählte D3 mit 1 von 9 — auf Basis des Exports `norms.json`, der das `typing`-Subdokument nicht enthält. Gemessen an der Datenbank (Server B) tragen auch Adressat/Rolle (77 %) und Deontik (82 %, unter Qualitätstor) den Korpus. **Der Graben ist real, aber er sitzt eine Ebene höher:** zwischen dem, was der Korpus weiß, und dem, was ein Nutzer erreicht.

**Alles Gemessene blieb im Prüfstand.** Die Typisierung (THE-421), die Handlungs-Klassifikation (THE-438), die Anforderungskette (THE-545), das Fristobjekt (THE-549) — vier saubere Messungen, und keine hat je in den Korpus zurückgeschrieben. Das ist kein Zufall, sondern war je Ticket die **richtige** Vorsicht („read-only, keine Produktionsdaten"). In Summe ist daraus aber ein Systemzustand geworden: **die Ontologie weiß viel, der Korpus weiß nichts davon.**

Die Konsequenz für jede weitere Arbeit: **nicht mehr Facetten bauen — die gebauten durchstechen.** Eine Facette auf D5 gebracht ist mehr wert als drei neue auf D2.

---

## Priorisierte Lücken

| # | Lücke | Fragen | Ticket | Charakter |
|---|---|---|---|---|
| 1 | ~~Rolle + Deontik je Provision in den Korpus~~ **korrigiert 03.08.: liegt im Korpus.** Achse 1 (Adressat) ist gebaut + getestet; offen sind **Achse 2** (Deontik, gesperrt bis macro-F1 ≥ 0,75) und der **Produkt-Konsum** des Joins | 1, 2 | THE-540 (Achse 1 ✅ · Achse 2 ⛔) | Entsperrung via THE-421 Typing-Slice |
| 2 | **Absatz-Granularität + stabile Norm-Id** | 2, 5, 7 | THE-550 | Entscheidung — vor jedem Skalieren |
| 3 | **`assessNormApplicability` anschließen** (Route/Report) | 1 | Teil von THE-544-Umfeld | Bau, klein |
| 4 | **Drei-Tore-Status + Evidenz-Objekt** | 4, 7 | [THE-552](https://linear.app/thearchitect/issue/THE-552) · 77,1 | größter Bau — **eigener Pre-Flight vor jeder Zeile Code** |
| 5 | **Ebenen-Facette messen** | 3, 4 | THE-551 | Entscheidung |
| 6+8 | **Nachweisform- und Auslöser-Werteraum** bottom-up | 4, 5 | [THE-553](https://linear.app/thearchitect/issue/THE-553) · 71,4 | klein — Muster existiert (216→26, 223→30) |
| 7 | **Sanktions-Facette** | 7 | [THE-554](https://linear.app/thearchitect/issue/THE-554) · 60,0 | halb mechanisch |

**Alle acht Lücken sind jetzt ticketiert** (angelegt 2026-08-03, nach Linear-Suche ohne Dublettenbefund). Drei Anmerkungen aus der Ticket-Erstellung, die die Landkarte nicht vorhergesehen hatte:

- **Lücken 6 und 8 wurden gebündelt** — dieselbe Maschinerie, aber mit **getrennten** Akzeptanzkriterien je Facette, damit ein gebündeltes Ticket nicht auf einer besteht und die andere mitzieht.
- **Die Nachweisform ist heikler als gedacht:** sie steckt bereits im Zusammenfall-Schlüssel (`collapseKey:307-310`) — als roher Freitext-Vergleich. Ein Werteraum kann den Zusammenfall dort *einebnen*; deshalb trägt THE-553 eine Negativ-Kontrolle gegen genau das.
- **Die Sanktion ist keine 1:1-Kante.** DSGVO Art. 83 Abs. 4 nennt Artikel-Gruppen, NIS2 Art. 34 verweist auf Kapitel. Als Attribut an der Pflicht modelliert, erfände sie eine Genauigkeit, die der Rechtstext nicht hat.

## Was ausdrücklich NICHT fehlt

Die Analyse warnt: *„Was keiner deiner Fragen dient, fliegt raus."* Am Bestand heißt das — **keine** neuen Facetten für Reifegrad-Scores, Kosten der Lücke (schwächster Kandidat, kaum belastbare Zahlen) oder Rechtsgebiets-Bäume (Anti-Pattern Nr. 1). Der Bestand hat kein Facetten-Defizit; er hat ein **Durchstich-Defizit**.
