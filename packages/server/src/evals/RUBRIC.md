# Labeling-Rubrik — Compliance-Mapping Golden-Set (v2)

> Linear: THE-379 (REQ-EVAL-001.1) · Epic: THE-378 (UC-EVAL-001)
>
> Diese Rubrik definiert, **wann ein (Regulierung, Element)-Paar als Treffer gilt**.
> Sie ist die einzige Wahrheitsquelle für: (1) menschliches Labeling des Golden-Sets,
> (2) den LLM-Judge-Prompt (THE-382). Änderungen an der Rubrik = neue Golden-Set-Version.

## 1. Die Label-Frage

Für jedes Paar aus einem Regulierungs-Paragraphen R und einem Architektur-Element E
beantworten wir genau eine Frage:

> **„Ist E von R materiell betroffen — d. h. muss E angepasst, geprüft oder
> nachgewiesen werden, damit die Organisation R erfüllt?"**

Antwort: `match` oder `no-match`. Keine Zwischenstufen im Label (die Unsicherheit
gehört in `notes`, nicht ins Label).

## 2. `match` — Kriterien (mind. eines muss zutreffen)

1. **Expliziter Scope:** R benennt die Funktion/Datenart/Prozessart von E direkt
   (z. B. DSGVO Art. 30 ↔ Element „Verzeichnis von Verarbeitungstätigkeiten").
2. **Funktionale Pflicht:** R verlangt eine Tätigkeit, die E ausführt oder
   implementiert (z. B. LkSG § 6 Abmilderungsmaßnahmen ↔ „Supplier Due Diligence Process").
3. **Datenbezug — Zwei-Stufen-Test (Regel C, entschieden 2026-07-04):**
   Für datenhaltende Systeme gilt NICHT pauschal match. Prüfe zweistufig:

   > **Stufe 1 — Systemfähigkeit:** Verlangt R eine Fähigkeit oder Eigenschaft,
   > die **im System selbst** implementiert sein muss (Löschfähigkeit Art. 17,
   > TOMs/Sicherheit Art. 32, Sicherheitsmaßnahmen an Netz-/Informationssystemen
   > NIS2 Art. 21)? → Jeder Halter der regulierten Datenkategorie ist **match**.
   >
   > **Stufe 2 — organisatorischer Akt:** Verlangt R nur einen Akt, den ein
   > **anderes** Element ausführt (Meldung abgeben Art. 33, Verzeichnis führen
   > Art. 30, Bericht veröffentlichen LkSG § 10)? → Datenhalter sind **no-match**
   > (transitiv, § 3); match ist nur der Ausführer.

   Merksatz: *„Muss an DIESEM Element etwas gebaut, geändert oder nachgewiesen
   werden — oder steht es nur in einer Liste, die woanders geführt wird?"*

   **Zusatzbedingung für Stufe 1:** Die regulierte Datenkategorie muss am
   Element **explizit dokumentiert** sein. Primärer Mechanismus ist das
   **Compliance-Facts-Profil** (`metadata.compliance.holds` mit presence `doc`
   — Taxonomie: `../compliance/COMPLIANCE_FACTS.md`); die Freitext-Beschreibung
   („stores customer personal data") gilt als Übergangs-Fallback und für
   profilfreie Sets (BSH-Transfer-Slice). Keine Spekulation über mögliche
   Inhalte — `maybe`-Einträge und Systeme, die Personendaten enthalten
   *könnten*, sind no-match (konservativ, § 4). Reine Hosting-Infrastruktur
   (`kind: infra`) ist für *Daten*-Pflichten transitiv — die Fähigkeit
   (löschen, verschlüsseln) liegt in der App-/DB-Schicht, nicht im Hoster.
4. **Nachweispflicht:** E erzeugt oder hält die Evidenz, die R fordert
   (Audit-Logs, Berichte, Dokumentation).
5. **Capability-Regel (Theme ①):** Eine Capability ist match, wenn R das
   **gesamte Tätigkeitsbündel** verlangt, das die Capability repräsentiert
   (LkSG § 3 Sorgfaltspflichten ↔ „Supplier Due Diligence"-Capability).
   Zusätzlich ist der konkrete Prozess match, wenn R eine namentlich
   bestimmbare Einzelpflicht enthält, die er implementiert (§ 5 Risikoanalyse
   ↔ „Supplier Risk Assessment"). Capability und Prozess schließen sich also
   NICHT aus — beide können match sein.

### 2a. Beispielkatalog Zwei-Stufen-Test (Adjudikation vom 2026-07-04)

| Paragraph | Stufe | Entscheidung |
|---|---|---|
| DSGVO Art. 30 (VVT) | 2 | Nur die VVT-App führt das Verzeichnis. CRM & Co. stehen *im* Verzeichnis → no-match. |
| DSGVO Art. 33 (Breach-Meldung) | 2 | Nur der Incident-Response-Prozess meldet. Systeme, in denen ein Breach passieren *könnte*, sind transitiv → no-match. |
| DSGVO Art. 17 (Löschung) | 1 | *Löschen können* ist eine Systemfähigkeit → jeder dokumentierte Halter personenbezogener Daten ist match (CRM, DWH, Portal mit Kontaktpersonen). Hosting-Plattform: no-match. |
| DSGVO Art. 32 (Sicherheit) | 1 | TOMs müssen an den Systemen umgesetzt werden → ISMS/Encryption/Backup match; dokumentierte pbD-Halter sind Grenzfall (Adjudikation, § 4). |
| NIS2 Art. 21 (Risk-Mgmt) | 1 | Maßnahmen werden *an* Netz-/Informationssystemen umgesetzt → OT/MES, Cloud-Plattform match; plus Lieferketten-Prozess (Abs. 3). |
| LkSG § 8 (Beschwerde) | — | Das Beschwerdesystem IST der geforderte Kanal (funktionale Pflicht 2.2) → match. Lieferanten-Risiko/CSRD/Portal: nur thematische Nähe → no-match. |
| LkSG § 10 (Bericht) | 2 | LkSG-Bericht ist ein eigener Akt; CSRD-Zyklus ist ein **anderes Regime** → no-match (Regime-Grenze: ein Element, das Pflicht X eines anderen Gesetzes erfüllt, ist für Pflicht Y kein match). |

## 3. `no-match` — typische Fälle (Abgrenzung)

- **Nur thematische Nähe:** E klingt verwandt, aber R erzeugt keine konkrete
  Anpassungs-/Prüf-/Nachweispflicht für E. („beide handeln von IT-Sicherheit" reicht NICHT.)
- **Transitive Betroffenheit:** R trifft ein anderes Element, das mit E nur
  verbunden ist. Wir labeln **direkte** Betroffenheit; Kaskaden ergeben sich im
  Graph, nicht im Label.
- **Organisationspflicht ohne Systembezug:** R verpflichtet die Organisation
  (z. B. Meldung an Behörde), aber kein gelistetes Element führt das aus.
- **Adressaten-Test (Theme ③):** Richtet sich R an **Behörden, Mitgliedstaaten
  oder EU-Gremien** (Aufsichtsbehörde verhängt Bußgeld Art. 83, Cooperation
  Group koordiniert Risk-Assessments NIS2 Art. 22) und erzeugt KEINE eigene
  Handlungspflicht für das Unternehmen, ist **kein** Element match — auch wenn
  ein Element thematisch zu dem passt, was die Behörde tut. Leitfrage: *„Wer
  ist Subjekt des Satzes — das Unternehmen oder eine Behörde?"* Solche
  Paragraphen sind die besten Hard Negatives (§ 5).
- **Regime-Grenze:** Ein Element, das eine ähnliche Pflicht eines ANDEREN
  Gesetzes erfüllt (CSRD-Berichtszyklus ↔ LkSG-Bericht, DSGVO-Breach-Prozess ↔
  NIS2-Incident-Meldung), ist no-match — Regime werden nicht vermischt.

## 4. Mehrdeutigkeit — die Entscheidungsregel

Wenn zwei kompetente Architekten unterschiedlich entscheiden könnten:

1. Entscheide nach der Frage: **„Würde ein Auditor verlangen, dieses Element im
   Compliance-Nachweis für R aufzuführen?"** Ja → `match`.
2. Bleibt es 50/50 → `no-match` labeln **und** `ambiguous: true` setzen mit
   Begründung in `notes`. (Konservativ labeln; ambige Fälle werden bei der
   Kappa-Auswertung gesondert betrachtet und können die Rubrik schärfen.)

## 5. Hard Negatives (Pflichtbestandteil des Sets)

≥ 15–20 % der Fälle müssen Paragraphen sein, für die **kein** Kandidat ein
`match` ist (`goldElementIds: []`). Sie testen, ob das Modell korrekt „nichts"
zurückgibt, statt zwanghaft zu matchen. Gute Quellen: Paragraphen zu Behörden-
zuständigkeiten, Bußgeldrahmen, Definitionen.

## 6. Stratifizierung & Set-Rollen (v2-Scope, entschieden 2026-07-04)

**Grundsatz-Entscheidung:** Das Baseline-Set wird auf **Gesetze, die auf
TheArchitect selbst zutreffen × das eigene Architektur-Modell** umgestellt
(Self-Baseline). Begründung: Ground Truth erfordert einen Annotator, der
Gegenstand UND Recht sicher beurteilen kann — das erste Doppel-Labeling hat
gezeigt, dass fremde Domänen (LkSG/Fertigung) diese Sicherheit nicht hergeben.

| Set | Rolle | Gate-relevant? |
|---|---|---|
| **Self-Baseline** (TheArchitect-Modell, echte Crawl-Texte) | Kappa-Gate, Freeze, E1-Baseline (THE-381) | **ja** |
| `mapping.v2.json` (BSH-Demo, LkSG/NIS2-Fertigung) | Transfer-Slice: wird mitgemessen, zeigt Generalisierung | nein — bis ein Domänenexperte die LkSG-Fälle gelabelt hat |

Soll-Verteilung Self-Baseline (Start: 15–25 Fälle, Ziel: 50+):

| Dimension | Vorgabe |
|---|---|
| Quellen | **dsgvo als Kern** (Betreiber-Pflichten: Art. 5/6/15/17/20/25/28/30/32/33/34); **nis2 als Grenzfall-Slice** (Zulieferer-Perspektive Art. 21 Abs. 3); iso27001 optional (Nachweispflicht 2.4) |
| Hard Negatives | ≥ 15 % — Paragraphen INNERHALB anwendbarer Gesetze mit Behörden-Adressat (Art. 51, 83; Adressaten-Test § 3), NICHT „ganzes Gesetz gilt nicht" |
| Sprache | de und en vertreten (EUR-Lex liefert beides — speist auch die Konsistenz-Eval) |
| Element-Typen | mind. 4 verschiedene (`application`, `business_process`, `capability`, `technology_service`, …) |
| Texte | **nur gecrawlte Originaltexte** (EUR-Lex / gesetze-im-internet), keine Modellwissen-Zitate |

## 7. Doppel-Labeling & Cohen's Kappa (Freeze-Kriterium)

1. Zwei Annotatoren labeln **dieselben ≥ 20 Fälle** unabhängig.
2. Cohen's Kappa über alle Paare berechnen (`metrics.ts → cohenKappa`).
3. **Kappa ≥ 0,6:** Differenzen adjudizieren (gemeinsam final entscheiden),
   Set als `frozen: true` mit Version `v1` einfrieren.
4. **Kappa < 0,6:** Die Aufgabe ist unklar definiert — **nicht** das Modell
   tunen, sondern diese Rubrik schärfen (v. a. Abschnitte 2/3), dann neu labeln.
5. Adjudikations-Entscheidungen mit Ein-Satz-Begründung in `notes` festhalten —
   sie sind das Rohmaterial für den Judge-Prompt (THE-382).

## 8. Format

Golden-Set-Einträge liegen in `golden/mapping.v2.json` und werden von
`goldenSet.ts` (Zod) validiert. Pro Fall: Regulierungstext + Kandidatenliste +
`goldElementIds` (leer = Hard Negative). Ein eingefrorenes Set wird nie
editiert — Korrekturen erzeugen die nächste Versionsdatei.

## 9. Changelog

- **v2.2 (2026-07-04):** Zusatzbedingung § 2.3 konkretisiert: „explizit
  dokumentiert" = Compliance-Facts-Profil (`metadata.compliance`, Taxonomie in
  `../compliance/COMPLIANCE_FACTS.md`); Beschreibung nur noch Übergangs-Fallback.
  Verhindert, dass jedes neue Gesetz Freitext-Beschreibungen aufbläht
  (Ousterhout-Entscheidung, Design-Review mit Judge-Panel).
- **v2.1 (2026-07-04):** Scope-Pivot: Baseline-Set = Self-Baseline (TheArchitect-
  Gesetze × eigenes Modell, Projekt `…3802f`), BSH-Set zum Transfer-Slice
  herabgestuft (§ 6). Ablauf: `SELF_BASELINE_GUIDE.md`.
- **v2 (2026-07-04):** Theme-②-Entscheidung nach erstem Doppel-Labeling
  (Kappa 0,365): § 2.3 durch Zwei-Stufen-Test (Regel C) ersetzt, Beispielkatalog
  § 2a ergänzt, Adressaten-Test + Regime-Grenze in § 3, Capability-Regel § 2.5.
  Golden-Set `mapping.v1.json` → `mapping.v2.json` (A-Labels nach neuer Regel).
- **v1:** Erstfassung (THE-379).

---

# Teil B — Klassifizierung einzelner Provisions (Term Typing)

> **Abgrenzung:** Teil A (§ 1–9) beschreibt die **Zuordnungs-Aufgabe** (Gesetzestext → Architektur-Element).
> Teil B beschreibt eine davon unabhängige Aufgabe: die **Provision selbst** einordnen, ohne Bezug zu
> irgendeinem Architektur-Modell. Gemeinsam bleiben nur die Verfahrensregeln — Mehrdeutigkeit (§ 4),
> Doppel-Labeling und das Freeze-Kriterium (§ 7) gelten unverändert auch hier.
> Golden-Sets: `golden/typing.v1.json`, validiert von `typingGolden.ts`.

## B1. Die Label-Frage

> *„Was für ein Paragraph ist das — unabhängig davon, auf wen er zutrifft?"*

Fünf Achsen, jede unabhängig zu entscheiden. Der Text der Provision ist die einzige Grundlage;
Modellwissen über das Gesetz „im Allgemeinen" ist ausdrücklich **keine** zulässige Begründung.

## B2. Die drei Zustände (gilt für jede Achse)

| Zustand | Bedeutung | Wann |
|---|---|---|
| **offen** (kein Wert) | noch nicht entschieden | Sollte im fertigen Satz die Ausnahme sein. Nutzt der Prüfer, wenn der Text die Achse schlicht nicht hergibt und auch „nicht anwendbar" falsch wäre. |
| **`null`** — nicht anwendbar | bewusste Entscheidung | Die Achse *hat* auf diese Provision keine sinnvolle Antwort. Beispiel: ein Definitionsartikel trägt keine deontische Kraft → `obligationKind: null`. |
| **Wert** | gelabelt | Einer der geschlossenen Ontologie-Werte. |

`null` ist eine **Aussage**, kein Auslassen — sie wird in der Auswertung als eigene Klasse gewertet und
zählt bei der Prüfer-Einigkeit voll mit. Zwei Prüfer, die sich auf „nicht anwendbar" einigen, sind sich einig.

## B3. Entscheidungsregeln je Achse

### `provisionKind` — worum geht es in diesem Paragraphen?

Die Achse mit dem größten Streitpotenzial; hier lohnt die genaueste Lektüre.

| Wert | Kriterium | Typischer Wortlaut |
|---|---|---|
| `scope-applicability` | entscheidet, **ob** das Gesetz auf jemanden/etwas anwendbar ist | „Diese Verordnung gilt für…", „Anwendungsbereich", Schwellenwerte, Ausnahmen vom Anwendungsbereich |
| `definition` | legt die **Bedeutung eines Begriffs** fest | „Im Sinne dieser Verordnung bezeichnet der Ausdruck …" |
| `obligation` | begründet eine **materielle Pflicht** des Regulierten | „… trifft geeignete Maßnahmen", „… stellt sicher, dass" |
| `enforcement-supervision` | regelt **Befugnisse oder Handeln der Aufsicht** | Marktüberwachung, Sanktionen, Untersuchungsbefugnisse, Zusammenarbeit der Behörden |
| `procedural` | regelt das **Wie/Wann** einer bereits bestehenden Pflicht | Fristen, Formvorschriften, Meldewege, Registrierungsverfahren |
| `other` | Rest | Übergangs- und Schlussbestimmungen, Inkrafttreten, Verweise auf Anhänge |

**Die drei Abgrenzungen, an denen Prüfer auseinandergehen:**

1. **`scope-applicability` vs. `definition`.** Test: *Entscheidet der Text darüber, ob das Gesetz greift,
   oder legt er nur Vokabular fest?* Eine Definition kann den Anwendungsbereich mittelbar verengen —
   sie bleibt trotzdem `definition`. Nur wenn der Paragraph selbst die Anwendbarkeit ausspricht, ist es
   `scope-applicability`.
2. **`obligation` vs. `procedural`.** Test: *Begründet dieser Paragraph die Pflicht, oder regelt er die
   Abwicklung einer anderswo begründeten Pflicht?* Eine Meldepflicht ist eine Pflicht (`obligation`);
   die 72-Stunden-Frist und das Meldeformular dazu sind `procedural`. Steht beides im selben Paragraphen,
   entscheidet der Schwerpunkt.
3. **`obligation` vs. `enforcement-supervision`.** Test: *Wer wird adressiert?* Pflichten des Regulierten
   → `obligation`. Befugnisse oder Pflichten der Behörde → `enforcement-supervision`. Diese Achse läuft
   fast immer parallel zu `partyRole` — steht dort die Aufsichtsbehörde, ist `obligation` verdächtig.

### `obligationKind` — deontische Kraft

`obligation` (Gebot) · `prohibition` (Verbot) · `permission` (Erlaubnis).

- **`null`**, wenn die Provision niemandem etwas gebietet, verbietet oder erlaubt — bei
  `scope-applicability`, `definition` und den meisten `other`-Fällen der Normalfall.
- **Konditionale Formulierungen** („darf nur, wenn…") entscheidet man über den **Ausgangszustand**:
  Ist die Handlung im Grundsatz untersagt und der Paragraph öffnet eine Tür → `permission`.
  Ist sie im Grundsatz erlaubt und der Paragraph schließt sie → `prohibition`.

### `partyRole` — Adressat

Der geschlossene Rollenraum (Verantwortlicher, Auftragsverarbeiter, Anbieter, Betreiber, Einführer,
Händler, bevollmächtigter Vertreter, betroffene Person, Aufsichtsbehörde).

- **`null`**, wenn kein Rollenträger adressiert wird — Definitionen, oder Provisions, die sich an
  Mitgliedstaaten bzw. den Gesetzgeber selbst richten (dafür gibt es bewusst keine Rolle).
- Mehrere Adressaten: die Rolle wählen, die der Paragraph **primär** verpflichtet.

### `normKind` und `bindingness` — Eigenschaften der Norm, nicht der Provision

Beide beschreiben das **Dokument**, aus dem die Provision stammt, nicht den einzelnen Paragraphen.
Innerhalb eines Gesetzes sind sie deshalb über alle Fälle konstant. Erwartete Einigkeit: hoch.
Weichen zwei Prüfer hier ab, ist meist die Quelle falsch zugeordnet — kein Rubrik-Problem.

## B4. Erwartete Einigkeit — wo Streit normal ist

| Achse | Erwartung | Grund |
|---|---|---|
| `normKind`, `bindingness` | sehr hoch | folgen aus der Quelle |
| `obligationKind` | hoch | dreiwertig, klare Signalwörter |
| `partyRole` | mittel | Mehrfach-Adressaten, implizite Rollen |
| `provisionKind` | **am niedrigsten** | die drei Abgrenzungen in B3 |

Fällt die Prüfer-Einigkeit auf einer Achse unter 0,6, ist **B3 zu schärfen** — nicht das Modell zu
tunen und nicht der Prüfsatz zu beschönigen (§ 7.4 gilt unverändert).

### B4a. Die Ausnahme: konstante Achsen (Prävalenz-Paradox)

Diese Regel hat **eine** Ausnahme, und sie ist beim ersten Zwei-Prüfer-Lauf sofort aufgetreten:

> `normKind` 95 % Rohübereinstimmung — Kappa **0,000**.
> `bindingness` 95 % Rohübereinstimmung — Kappa **0,000**.

Das ist keine Uneinigkeit. Kappa misst Übereinstimmung **über den Zufall hinaus**. Vergibt ein Prüfer
über alle Fälle nur *eine* Klasse — weil die Achse auf diesem Material gar keine Varianz hat —, dann ist
die erwartete Zufallsübereinstimmung genauso hoch wie die beobachtete, und Kappa fällt rechnerisch auf
null. Genau das passiert hier: Der Korpus besteht ausschließlich aus unmittelbar geltenden
Gesetzgebungsakten, also ist jede Provision `legislation` und `binding`. Die Achse ist
**konstruktionsbedingt konstant** (siehe B3, letzter Abschnitt: beide beschreiben das Dokument, nicht
die Provision).

**Was daraus folgt:**

1. Auf eine konstante Achse mit „B3 schärfen" zu reagieren, würde eine funktionierende Rubrik für ein
   Problem umbauen, das sie nicht hat. **Nicht tun.**
2. `typing-kappa compare` weist solche Achsen als **KONSTANT** aus und nimmt sie vom Exit-1-Tor aus.
   Die Ausnahme wird ausdrücklich gedruckt, damit niemand sie später für ein bestandenes Tor hält.
3. Berichtet wird für konstante Achsen die **Rohübereinstimmung**, nicht der Kappa-Wert.
4. Die Achse bleibt trotzdem im Prüfsatz: Sie wird aussagekräftig, sobald Material mit Varianz dazukommt
   (delegierte Rechtsakte, Leitlinien, Normen). Erst dann ist ihr Kappa zu interpretieren.

Die Abweichungen auf diesen beiden Achsen sind entsprechend zu lesen: Sie sind **Einzelfehler**, keine
Definitionsstreitigkeiten. Typisch ist die Verwechslung „Artikel *ermächtigt zu* delegierten Rechtsakten"
mit „Artikel *ist* ein delegierter Rechtsakt" — das Label folgt der Quelle, nicht dem Gegenstand.

## B5. Doppel-Labeling — die Blindheits-Regel

§ 7 gilt vollständig (zwei Prüfer, dieselben ≥ 20 Fälle, Kappa ≥ 0,6, danach Adjudikation und Freeze).
Eine **Zusatzregel** ist beim Typing zwingend:

> **Der zweite Prüfer darf den KI-Vorschlag nicht sehen.**

Der erste Durchgang ist bewusst eine *Adjudikation* — der Prüfer bekommt den maschinellen Vorschlag
vorbefüllt und korrigiert ihn. Bekäme der zweite Prüfer denselben Vorschlag, wären beide auf dieselbe
Quelle geankert: Sie wären sich einig, **weil sie beide der Maschine gefolgt sind**, nicht weil die
Aufgabe klar definiert ist. Die gemessene Einigkeit wäre geschönt und das Freeze-Tor wertlos.

Deshalb erzeugt `typing-kappa blind` eine Kopie **ohne** Labels und ohne jede Spur des ersten Durchgangs
(keine Notizen, kein Bearbeiter, kein Zeitstempel) — nur Gesetzestext und Auswahllisten. Wer diese
Mechanik später „vereinfacht", macht die Messung wertlos.

## B6. Format

Prüfsätze liegen in `golden/typing.v*.json`, validiert von `typingGolden.ts` (Zod).
Pro Fall: Provision (Quelle, Paragraphennummer, Volltext, Sprache, Jurisdiktion) + `labels` über die
fünf Achsen + optional `ambiguous`/`notes`. `ontologyVersion` bindet die Labels an die E6-Version,
gegen die gelabelt wurde — bei einer Ontologie-Erhöhung ist zu prüfen, ob alte Labels noch gelten.
§ 8 gilt sinngemäß: **ein eingefrorener Satz wird nie editiert**, Korrekturen erzeugen die nächste Version.

## B7. Changelog Teil B

- **B-v1 (2026-07-20):** Erstfassung (THE-421, Slice G-0/G). Fünf Achsen inkl. der neuen
  `provisionKind`; Abgrenzungsregeln B3; Blindheits-Regel B5.
- **B-v1.1 (2026-07-21):** B4a ergänzt — konstante Achsen (Prävalenz-Paradox) sind vom Tor ausgenommen,
  Rohübereinstimmung statt Kappa berichten. Anlass: erster Zwei-Prüfer-Lauf, `normKind`/`bindingness`
  95 % Übereinstimmung bei Kappa 0,000.

---

# Teil C — Beziehungen zwischen Normen (Cross-Norm Relations)

> **Abgrenzung:** Teil B klassifiziert eine **einzelne** Provision. Teil C beurteilt ein **Paar** von
> Provisions aus **zwei verschiedenen Gesetzen**: Steht zwischen ihnen eine Beziehung — und wenn ja,
> welche und in welche Richtung? Verfahrensregeln aus § 4 (Mehrdeutigkeit) und § 7 (Doppel-Labeling,
> Freeze) gelten unverändert. Golden-Sets: `golden/relations.v*.json`, validiert von `relationsGolden.ts`.

## C1. Die Label-Frage

> *„Sagt eine dieser beiden Provisions etwas über die andere aus?"*

Nicht gefragt ist, ob beide **inhaltlich ähnlich** sind oder dasselbe Ziel verfolgen. Gefragt ist, ob
zwischen ihnen ein **normatives Verhältnis** besteht — verdrängt, konkretisiert, setzt einen Parameter,
erkennt Gleichwertigkeit an, legt aus. Ähnlichkeit ohne solches Verhältnis ist **keine Beziehung**
(siehe C4 — das ist die wichtigste Regel dieses Teils).

## C2. Die drei Zustände

| Zustand | Bedeutung |
|---|---|
| **offen** (kein Wert) | noch nicht entschieden — im fertigen Satz die Ausnahme |
| **„keine Beziehung"** (`null`) | **geprüft und verneint.** Die Negativ-Klasse ist Pflichtbestandteil: ohne sie lässt sich nicht messen, ob das Verfahren auch richtig ablehnt |
| **Beziehungsart + Richtung** | gelabelt |

## C3. Die Richtungs-Regel (verbindlich)

Jedes Paar wird intern sortiert gespeichert, damit es eine stabile Identität hat. **Diese Sortierung
trägt keine juristische Bedeutung.** Die Richtung ist ein eigenes Feld:

- **`a-to-b`** — die Aussage geht **von A aus über B**. Das Label benennt, was A gegenüber B tut.
- **`b-to-a`** — umgekehrt.

Beispiel: „DORA verdrängt NIS2 für Finanzunternehmen." Steht DORA als A, ist das
`PREVAILS_OVER` mit `a-to-b`. Steht DORA als B, ist dieselbe Aussage `PREVAILS_OVER` mit `b-to-a` —
**nicht** die Umkehrart. Nur zwei der acht Arten haben überhaupt eine deklarierte Umkehrung; für die
übrigen sechs ist das Richtungsfeld der einzige Weg, die Aussage korrekt auszudrücken.

Wer die Richtung nicht sicher bestimmen kann, wählt **„keine Beziehung"** — nicht raten.

## C4. Die entscheidende Abgrenzung: parallele Pflicht ≠ Beziehung

**Das ist der Fall, bei dem am häufigsten falsch gelabelt wird.**

DSGVO Art. 32 („Sicherheit der Verarbeitung") und NIS2 Art. 21 („Risikomanagementmaßnahmen im Bereich
der Cybersicherheit") verlangen beide technische und organisatorische Sicherheitsmaßnahmen. Es liegt
nahe, hier eine Beziehung zu sehen. **Das ist falsch.**

Keine der beiden Normen sagt etwas über die andere aus: Keine verdrängt die andere, keine konkretisiert
die andere, keine erklärt die Erfüllung der einen zur Erfüllung der anderen. Es sind **zwei
eigenständige Pflichten aus zwei Regimen**, die zufällig dasselbe Schutzziel verfolgen. Korrektes
Label: **„keine Beziehung"**.

> **Warum das trotzdem wichtig ist:** Dass ein Unternehmen beide Pflichten mit **einer** Maßnahme
> erfüllen kann, ist richtig — aber das ist eine Aussage über die **Umsetzung**, nicht über das
> Verhältnis der Normen. Diese Zusammenführung ist Aufgabe der Pflichten-Harmonisierung, die auf
> diesem Prüfsatz aufbaut. Würden wir „ähnliche Pflicht" hier als Beziehung labeln, vermischten wir
> zwei Ebenen und der Prüfsatz würde die Harmonisierung nicht mehr absichern, sondern vorwegnehmen.

**Test:** *Verweist eine der beiden Provisions — ausdrücklich oder der Sache nach — auf die andere
Norm?* Wenn nein: keine Beziehung, egal wie ähnlich die Inhalte sind.

## C5. Entscheidungsregeln je Beziehungsart

Nur die acht **abgeleiteten** Arten stehen zur Wahl. Die vier metadatenbasierten (`AMENDS`,
`CONSOLIDATES`, `REPEALS`, `CITES`) stammen aus amtlichen Dokument-Metadaten, werden nie aus dem Text
erschlossen und tauchen hier gar nicht erst als Option auf.

| Art | Kriterium | Erkennungszeichen |
|---|---|---|
| `PREVAILS_OVER` / `DEROGATED_BY` | **Verdrängung** (lex specialis): in ihrem Anwendungsbereich tritt die eine Norm an die Stelle der anderen | „gilt nicht, soweit…", „unbeschadet", sektorspezifische Vorrangklauseln |
| `CONCRETIZES` | die eine Norm **füllt eine allgemeine Pflicht der anderen inhaltlich aus** — die andere gilt weiter | „nähere Bestimmungen zu…", spezielle Regeln innerhalb eines fortbestehenden Rahmens |
| `SETS_PARAMETER` | die eine Norm **fixiert einen konkreten Wert/Schwellenwert**, den die andere voraussetzt | Fristen, Schwellen, technische Kennzahlen |
| `RECOGNIZES_EQUIVALENCE` | Erfüllung der einen **gilt als** Erfüllung der anderen | „gilt als erfüllt, wenn…", Anerkennungsklauseln |
| `INTERPRETS` | die eine Norm **legt einen Begriff der anderen aus** | „im Sinne von Artikel X der Verordnung Y" |
| `TRANSPOSES` | Umsetzung einer Richtlinie in nationales Recht | nationale Umsetzungsgesetze |
| `IMPLEMENTS` | Durchführungsrechtsakt zu einem Basisrechtsakt | „Durchführungsverordnung zu…" |

**Die zwei Abgrenzungen, an denen Prüfer auseinandergehen:**

1. **Verdrängung vs. Konkretisierung.** Test: *Gilt die andere Norm danach noch?* Hört sie in diesem
   Bereich auf zu gelten → Verdrängung. Gilt sie weiter, nur genauer ausgefüllt → `CONCRETIZES`.
   DORA gegenüber NIS2 für Finanzunternehmen: Verdrängung. ePrivacy gegenüber DSGVO: Konkretisierung
   (die DSGVO gilt weiter).
2. **Konkretisierung vs. Parameter.** Test: *Wird ein konkreter Wert festgelegt oder eine Pflicht
   inhaltlich ausgefüllt?* Eine Zahl, Frist oder Schwelle → `SETS_PARAMETER`. Materielle Ausgestaltung
   ohne festen Wert → `CONCRETIZES`.

## C6. Erwartete Einigkeit — und warum die Zahlen anders zu lesen sind

Der Satz ist **stark schief**: die große Mehrheit der Paare hat keine Beziehung. Zwei Prüfer, die
beide meistens „keine Beziehung" sagen, erreichen leicht 90 % Rohübereinstimmung, ohne dass die
Aufgabe klar definiert wäre. Deshalb:

- Maßgeblich ist das **zufallskorrigierte Maß**, nie die Rohübereinstimmung.
- Ein **Einzelwert je Beziehungsart** wird nur ab **n ≥ 10** ausgewiesen; darunter ist er statistisch
  bedeutungslos und der Bericht markiert die Art ausdrücklich als zu dünn. Die Entscheidung trägt
  dann der Gesamtwert.
- „Keine Beziehung" ist keine Art und bekommt keinen Einzelwert — zählt aber voll in den Gesamtwert.

Fällt der Gesamtwert unter 0,6, ist **C4/C5 zu schärfen**, nicht das Modell zu tunen (§ 7.4).

## C7. Doppel-Labeling

§ 7 und die Blindheits-Regel aus **B5** gelten unverändert: Der zweite Prüfer sieht **weder** den
maschinellen Vorschlag **noch** Notizen oder Bearbeiter des ersten Durchgangs. `relations-kappa blind`
entfernt Beziehungsart, Richtung und jede Spur des ersten Durchgangs und lässt nur die beiden
Gesetzestexte stehen.

## C8. Format

Pro Fall: zwei Provisions (A und B, sortiert gespeichert, aus **verschiedenen** Gesetzen) + optionale
Beziehungsart + Richtung + `ambiguous`/`notes`. Die Kopplung ist erzwungen: Richtung nur bei gesetzter
Art, keine Richtung bei „keine Beziehung". § 8 gilt sinngemäß — **ein eingefrorener Satz wird nie
editiert**.

## C9. Changelog Teil C

- **C-v1 (2026-07-20):** Erstfassung (THE-421, Slice G). Richtungs-Regel C3; die Parallel-Pflicht-
  Abgrenzung C4 als Kernregel; Entscheidungsregeln C5; Lesehinweis zur Schieflage C6.
