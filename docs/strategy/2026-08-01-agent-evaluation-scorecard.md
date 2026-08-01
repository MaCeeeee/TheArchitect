# Agent Evaluation Scorecard — Selbstbewertung 2026-08-01

**Instrument:** *Agent Evaluation Scorecard*, Alex Key (panoriq.ai) · 8 Dimensionen, je 0–3, Summe /24
**Anlass:** Fremdmaßstab. Alles, was wir bis hierher geprüft haben, haben wir **selbst** geprüft.
**Zweck:** Ausgangswert, an dem sich in drei Monaten messen lässt, ob wir die Rückkopplungs-Schleife geschlossen haben — nicht, ob wir uns besser fühlen.

> *„Mark where your team is today - honestly. The point is to find the gaps, not to feel good."*

---

## Ergebnis: **13 / 24** — „Some structure, not yet a system"

| # | Dimension | Wert | Begründung |
|---|---|---|---|
| 1 | Defined success criteria | **2** | Tore sind konkret, messbar und dokumentiert: `docs/evals/typing-release-gates.md` (Schwellen je Achse), `docs/evals/action-release-gates.md` (vier Tore), UC-NEWLAW-001 in einem Satz. **Aber:** „agreed across engineering, product, **and the people who actually use it**" — mit niemandem außerhalb abgestimmt. |
| 2 | Evaluation dataset | **3** | Unsere Stärke. Golden-Sets versioniert und eingefroren (`typing.v1`, `relations.v1–v5`, `mapping.v1/v2`, `discovery`, `consistency-pairs`, `actions.v1`), gewachsen über fünf Runden, mit Kalibrier- und Bekannt-Fehler-Fällen. Wächst aus echten Befunden, nicht aus Vorrat. |
| 3 | Automated evaluation runs | **2** | Definierter Prozess, läuft auf Abruf: `typing:eval`, `relations:baseline`, `actions:eval`, `eval:mapping`. **Lücke:** kein CI-Haken — läuft nicht bei jeder Änderung an Prompt, Modell oder Code. |
| 4 | Trace visibility | **1** | **Am 2026-08-01 belegt:** Der erste Live-Lauf von `actions:eval` riss die Negativ-Kontrolle mit 1 Fehlalarm auf 120 — und der Bericht konnte nicht sagen, **welches Paar**. Die vorgeschriebene Abhilfe war damit nicht ausführbar. Behoben durch `<out>.votes.json`, aber das ist ein Pflaster, kein Trace. |
| 5 | Reproducible failures | **2** | Feste Seeds, eingefrorene Fälle mit stabilen `caseId`s, Provenance an jedem Vorschlag (`modelId`, `promptVersion`, `ontologyVersion`, `versionHash`). **Aber:** Der Fehlalarm reproduzierte nicht (1/120 → 0/120). Stochastik ist gemildert (Regel „erst wiederholen, dann schneiden"), nicht gelöst. |
| 6 | Version comparison | **1** | Kein A/B-Gestell. Alter gegen neuer Slot-Prompt wurde am 2026-08-01 **von Hand** verglichen, indem beide Läufe getrennt gefahren und die Zahlen nebeneinandergelegt wurden. |
| 7 | Production monitoring | **1** | Sentry läuft. Agenten-Verhalten bei echten Nutzern: nicht beobachtet. Der Rückfluss Produktion → Prüfsatz existiert **genau einmal** (Prod-Befund „Discovery-Richter sah nie den Geltungsbereichs-Artikel" → neue Ontologie-Facette `provisionKinds`, 1.5.0) — als Einzelfall, nicht als Schleife. |
| 8 | Ownership of quality | **1** | Eine Person, die auch alles andere ist. Autorität vorhanden, Zeit nicht. |

**Bandenbeschreibung des Instruments für 9–16:** *„you have a dataset and traces, but no automated runs and no production feedback loop. **Connect what you already have.**"* — trifft wörtlich zu.

## Was das Profil über uns sagt

Wir sind **unwuchtig**: eine 3 beim Datensatz, drei 1er bei Trace, Version-Vergleich und Monitoring. Investiert wurde dort, wo wir ohnehin stark sind — die Rückkopplungs-Seite blieb fast unberührt.

Die Sitzung vom 2026-08-01 ist das Muster im Kleinen: makellose Kontroll-Disziplin (Positiv-/Negativ-Kontrolle, drei Modell-Häuser, geblendete Prompts) — und trotzdem war ein Fehlschlag nicht lokalisierbar.

## Der Satz, der die Reihenfolge entscheidet

> *„Dimension 1 is the one most teams skip and most regret skipping. **'What does good look like?' is not an engineering question** — it requires product, domain experts, and the people who will actually use the output. If you can't answer it, no amount of tooling setup will help."*

Unsere Tore sind ingenieurmäßig sauber und **fachlich mit niemandem vereinbart**. Kein weiterer Motor-Ausbau ändert daran etwas. Das deckt sich mit dem Domänengrenzen-Befund (THE-434-Abbruch: Mapping-Golds brauchen Domänen-Experten) und mit Alex' Kernkritik vom 2026-07-31.

## Ableitung — in dieser Reihenfolge

| Zug | Wirkt auf | Warum jetzt |
|---|---|---|
| **1. Bericht füllen und Alex vorlegen** | Dim. 1: 2 → 3 | Der einzige Zug, der Dimension 1 bewegt. Ohne sie entwertet das Instrument alles andere. |
| **2. Trace + Version-Vergleich** | Dim. 4, 6: 1 → 2 | Beide wurden am 2026-08-01 schmerzhaft. Kleine Arbeit: Rohdaten-Ausgabe existiert seit heute, ein A/B-Gestell auf `actions.v1` ist ein Nachmittag. ≈ 13 → 16 ohne neue Fachlichkeit. |
| **3. CI-Haken für die Eval-Läufe** | Dim. 3: 2 → 3 | Erst sinnvoll, wenn 2 steht — sonst automatisiert man einen Lauf, dessen Fehlschläge man nicht lesen kann. |
| **Nicht jagen** | Dim. 7, 8 | Produktions-Monitoring ohne Nutzer misst nichts. „Ownership" löst kein Ticket. Beide bleiben ehrlich bei 1, bis sich die Lage ändert. |

## Nächste Messung

**Turnus:** ~2026-11-01 (drei Monate). Erfolg ist **nicht** eine höhere Zahl, sondern eine **gleichmäßigere**: Eine 3 beim Datensatz neben einer 1 beim Trace ist schlechter als zweimal 2.

Die Bewertung bleibt eine Selbstbewertung — der Wert liegt in den **Dimensionen**, nicht in unserer Punktzahl. Wo möglich, sollte die nächste Runde mindestens Dimension 1 von jemandem außerhalb bewerten lassen.

---

**Verwandt:** [`2026-07-31-uc-newlaw-001-use-case-definition.md`](2026-07-31-uc-newlaw-001-use-case-definition.md) · [`2026-06-21-complexity-comprehension-ux.md`](2026-06-21-complexity-comprehension-ux.md) · `docs/evals/action-release-gates.md` · `packages/server/src/evals/RUBRIC.md`
