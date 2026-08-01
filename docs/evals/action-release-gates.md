# Handlungs-Katalog — Freigabe-Tore (THE-438 Slice 1)

**Gilt für:** den Katalog kanonischer Handlungen (`canonicalActions`, E6 ab 1.8.0) und alles,
was darauf aufsetzt — Klassifikation (`actions:classify`), Harmonisierungs-Vorschläge und
später die N:M-Umstellung (REQ-REQHARM-001.1).

**Kern-Regel:** *Kein Befund aus diesem Eval zählt, solange die Positiv-Kontrolle nicht
bestanden ist. Und kein Vorschlag wird automatisch übernommen, solange κ unter dem
Kohärenz-Tor liegt.*

Quelle der Disziplin ist kein Paper, sondern ein eigener Fehlschlag: Am 2026-08-01 ergaben
drei aufeinander folgende Messungen „0 Treffer" und hätten die Harmonisierungs-These beinahe
widerlegt. Der Richter hatte zwei Defekte — seine Rubrik gehörte zur starken These und schloss
die gesuchte Antwort aus, und er urteilte über das Gesetzes-Etikett statt über den Text
(wortgleicher Pflichttext unter zwei Etiketten: 7/15; geblendet 15/15). **Eine
Positiv-Kontrolle hätte beides sofort aufgedeckt. Sie war nie gefahren worden.**

---

## Vorbedingungen (hart)

1. **Prüfsatz frozen.** `frozen: true` und `ontologyVersion` gepinnt. Ein Prüfsatz, der auf
   einen entfernten oder umbenannten Katalog-Eintrag zeigt, misst stillschweigend nichts mehr
   — `loadActionGolden` + der Ontologie-Test fangen das ab.
2. **Blendung strukturell.** Alle Prompts rendern die Pflicht über *einen* Renderer, der
   Gesetzesnamen und Fundstellen entfernt. Nachgewiesen an allen 438 Feldern der 219 echten
   Pflichten: 0 Rest-Gesetzesnamen, 0 Rest-Fundstellen, 0 überblendete Texte.
3. **Mindestens zwei Häuser.** Ein Haus liefert keine Konfidenzstufe. Die Häuser müssen aus
   verschiedenen Modell-Familien kommen — zwei Modelle geteilter Herkunft irren systematisch
   in dieselbe Richtung, ihre Übereinstimmung ist dann aufgebläht (dieselbe Begründung wie
   bei `raterClient`).
4. **Ausfälle ausgewiesen.** Die Zahl verwertbarer Antworten je Haus steht im Bericht. Ein
   stummes Haus ist keine Gegenstimme — es fällt aus der Quote heraus, und das muss sichtbar
   sein, sonst sieht ein Budget-Problem wie inhaltliche Uneinigkeit aus.

## Die Tore

| Tor | Schwelle | Bei Verfehlung |
| --- | --- | --- |
| **Positiv-Kontrolle** (Arm P) | ≥ 0,95 | **Lauf ungültig.** `tRate` bleibt `null` und wird auch im Bericht nicht ausgewiesen. Zuerst Prompt und Blendung prüfen — **nie das Modell tunen.** |
| **Negativ-Kontrolle** (Arm K) | 0 Fehlalarme | **Lauf ungültig.** Katalog zu grob oder Richter zu großzügig: den betroffenen Katalog-Eintrag aufteilen, nicht die Schwelle senken. |
| **Arm T** (gleiche Handlung) | *kein Tor* | Wird berichtet, nicht bestanden. Das ist der **Wert**, nicht die Qualität. |
| **κ zwischen den Häusern** | ≥ 0,80 → Auto-Merge zulässig | **Unter 0,80: nur Vorschlag.** Stufe A vorausgewählt, B nicht vorausgewählt, C nur auf Anforderung. Kein Schreibpfad. |

> **κ ≥ 0,80 ist für Slice 1 ausdrücklich KEIN Ziel.** Der Slice liefert Vorschläge. Zum Tor
> wird κ erst, wenn ein späterer Slice automatisch zusammenführen soll. Es jetzt anzustreben
> hieße, am Richter zu drehen, bis er einig ist — und das misst Einigkeit, nicht Wahrheit.

`null` (nicht bestimmbar, etwa bei konstantem Prüfer) besteht das Tor **nicht**. Unwissen ist
kein Bestehen.

## Gemessene Grundlinie (2026-08-01)

DSGVO × NIS2 × DORA, 219 Kern-Pflichten, Prüfsatz `actions.v1` (T 60 · K 60), drei Häuser
(Haiku 4.5 · Opus 4.8 · Kimi K3), Gesetzesnamen geblendet:

| Arm | Haiku | Opus | Kimi |
| --- | --- | --- | --- |
| P Positiv-Kontrolle | 15/15 | 15/15 | 15/15 |
| K Negativ-Kontrolle | 0/60 | 0/60 | 0/60 |
| T gleiche kanonische Handlung | 37 % | 37 % | 47 % |

κ: Opus↔Kimi **0,697** · Haiku↔Opus **0,498** · Haiku↔Kimi **0,308** — alle unter dem Tor.
Konfidenzstufen auf Arm T: **A 11/60 = 18 % · B 10/60 = 17 % · zusammen 35 %.**

## Drei Zahlen, die nicht gegeneinander zitiert werden dürfen

Der Bericht enthält für Arm T **drei verschiedene Quoten**. Alle sind richtig, alle messen
etwas anderes:

| Zahl | Referenzwert | Bedeutung |
| --- | --- | --- |
| Quote je Haus | 37 % · 37 % · 47 % | Was ein einzelnes Haus für harmonisierbar hält |
| **gepoolte** Arm-Quote | 40 % | Alle verwertbaren Stimmen aller Häuser zusammen |
| Mehrheitsquote (A+B) | 35 % | Fälle, bei denen ≥2/3 der Häuser zustimmen |

Die **Mehrheitsquote** ist die belastbare Zahl für Produkt-Aussagen; die gepoolte Quote steht
im Bericht, weil sie die Arm-Kontrollen vergleichbar macht.

Zusätzlich wird Arm T **gegen die Decke des Instruments** ausgewiesen (`tRateNormalised` =
Arm T / Arm P). Ein schwacher Richter deckelt den Messwert — ohne diese Normierung ginge das
als niedriges *Ergebnis* durch statt als schwaches *Instrument*.

## Wenn ein Tor reißt — was zuerst zu prüfen ist

**Positiv-Kontrolle unter 0,95.** In dieser Reihenfolge: (1) Blendet der Prompt wirklich alle
Gesetzesnamen? (2) Verneint die Rubrik bei abweichendem Adressaten oder abweichender Frist —
dann gehört sie zur *starken* These und schließt die gesuchte Antwort aus. (3) Reicht das
Token-Budget? Ein Reasoning-Modell mit zu kleinem Budget liefert leeren Text, und das sieht
in der Auswertung aus wie „keine Meinung", nicht wie „kaputt".

**Negativ-Kontrolle mit Fehlalarm.** Der Katalog-Eintrag der betroffenen Paare ist zu grob.
Erster Kandidat ist `vorfall-melden-behoerde`: er fasst Früh-, Zwischen- und Abschlussmeldung
dreier Rechtsakte zusammen und erreichte nur **9/26** Mehrheitstreffer. Zwei unabhängige Wege
zeigen darauf — die Messung und die Neu-Ableitung, die ihn in drei Einträge zerlegt.

**„keine"-Quote auffällig niedrig.** Auf dem Korpus, aus dem der Katalog abgeleitet wurde, ist
das erwartbar (in-sample lag sie bei 0,5 %). Auf einem **fremden** Korpus ist es ein
**Warnzeichen für erzwungene Treffer**, kein Erfolg — ein Modell, das einen Katalog bekommt,
füllt ihn. Deshalb ist „keine passende Handlung" ein zulässiges Ergebnis und wird getrennt von
unlesbaren Antworten gezählt.

## Katalog-Fortschreibung

`actions:derive` erzeugt einen **Vorschlag** und schreibt nie in die Ontologie. Die
Reihenfolge ist bindend:

1. `actions:derive` → Vorschlagsdatei
2. **menschliche Abnahme** der Granularität, ids und Labels
3. `canonicalActions` in `norm-ontology.v1.ts` pflegen, `ontologyVersion` bumpen,
   CHANGELOG-Eintrag, Versions-Pin im Test nachziehen
4. `actions:eval` — **beide Kontrollen müssen weiter halten**

> **Die Ableitung ist verfahrens-reproduzierbar, aber nicht id-stabil.** Derselbe Korpus
> lieferte in zwei Läufen 26 bzw. 38 Einträge mit durchweg anderen ids
> (`rechtsgrundlage-dokumentieren` ↔ `document-legal-basis`), weil schon die Sprachfassung im
> Prompt die Benennung verschiebt. Der Diff gegen den eingefrorenen Katalog ist deshalb
> **nominal, nicht semantisch** — ein hoher Diff heißt nicht, dass der Katalog falsch ist.

## Was dieser Eval nicht beantwortet

- **Ob ein einzelnes Paar harmonisierbar ist.** Dafür ist κ zu niedrig. Die Häuser sind sich
  über die Quote einig, über das einzelne Paar nicht.
- **Ob die Harmonisierung rechtmäßig ist.** Geurteilt wird **Umsetzbarkeit**. Eine gemeinsame
  Maßnahme entbindet von keiner Rechtsgrundlage; das gehört in die UI.
- **Ob der Katalog über andere Domänen trägt.** Belegt ist ein Ausschnitt aus drei
  Rechtsakten. Die Pflichten stammen aus eigener REQGEN-Extraktion, nicht aus juristischer
  Adjudikation — für die Bau-Entscheidung ausreichend, für ein Produktversprechen nicht.

## Verwandt

- `packages/server/src/evals/RUBRIC.md` — Rubrik-Disziplin, Kappa-Regeln
- `docs/evals/typing-release-gates.md` — Schwellenwerk der Typing-Achsen
- Linear THE-538 (Prämissen-Entscheidung) · THE-438 (Bau) · Plan
  `docs/superpowers/plans/2026-08-01-the438-slice1-action-catalog.md`
