# RVTM — THE-642: Remediate über die Zwei-Welten-Naht

**Datum:** 2026-08-10 · **Ticket:** [THE-642](https://linear.app/thearchitect/issue/THE-642) · REQs [THE-643](https://linear.app/thearchitect/issue/THE-643), [THE-644](https://linear.app/thearchitect/issue/THE-644)
**PR:** [#171](https://github.com/MaCeeeee/TheArchitect/pull/171) · **Live:** `e3265ad`, Bundle `index-DK0Q59Pl.js`
**Diagramm:** `docs/strategy/2026-08-10-remediation-naht.svg`

**Ousterhout-Verdikt aus dem Pre-Flight:** *Unknown Unknowns **niedrig*** — im Pre-Flight von *hoch*
gesenkt, weil alle vier Änderungsstellen benannt, alle Leser aufgezählt und der Sektions-Schlüsselraum
verifiziert waren. Das Urteil hat gehalten: keine Überraschung im Bau, kein roter Zyklus.
**WSJF 87,5.**

---

## Die Prämisse, und wie sie gemessen wurde

Die offene Frage des Tickets lautete: *Wird `sourceRef.standardId` irgendwo als echte ObjectId
gelesen?* Sie entschied zwischen additiv (Option A) und Migration (Option B).

Beantwortet **im Repo, nicht in den Daten** — das ist die stärkere Messung, weil sie den ganzen Code
abdeckt statt einen Datenstand:

| Prüfung | Befund |
|---|---|
| `populate` auf `sourceRef.standardId` | **keine** — die `ref: 'Standard'` ist eine Deklaration ohne Konsument |
| `$lookup` / Aggregations-Join | **keiner** |
| einziger Leser serverseitig | `remediationBacklink.service.ts:50` — String-Interpolation |
| Client | liest `sourceRef.standardId` **nirgends** |
| Skripte / Migrationen | **keine** fassen `RemediationProposal` an |
| geteilter Vertrag | `shared/types/remediation.types.ts:75` sagt **bereits** `standardId?: string` |

**Urteil:** Der ObjectId-Typ trug nichts außer der Validierung, die den Fehler auslöste. → Option A.

## Anforderungen → Nachweis

| AC | Nachweis | Status |
|---|---|---|
| **643 AC-1** Vorschlag entsteht für `corpus:*` | E2E gegen Prod: `{"type":"generation_start","proposalId":"6a79a47e…"}`, validiert, 83 % Konfidenz, 3 Elemente | **PASS** |
| **643 AC-2** kanonischer Schlüssel im Dokument | `buildSourceRef` schreibt `normId` immer; `standardId` nur bei `isValidObjectId` | PASS |
| **643 AC-3** Rückschluss greift in beiden Welten | `remediationBacklinkDb.test.ts` **11/11** — Korpus greift, **Bestand ohne `normId` greift weiter** | PASS |
| **643 AC-4** Duplikation trägt ihr Ablaufdatum | Kommentar an `RemediationProposal.sourceRef`: stirbt mit dem Index-Flip THE-390 P4 (ADR-0004 E4) | PASS |
| **643 AC-5** Negativ-Kontrolle | „weder normId noch standardId bleibt ein No-op" — grün | PASS |
| **644 AC-1** Fläche zeigt den Fehler | `RemediateGateway.test.tsx` **8/8** | PASS |
| **644 AC-2** Fehler räumt sich auf | Render-Gate `error && !isGenerating` — ein alter Fehler steht nie über einem laufenden Versuch | PASS |
| **644 AC-3** vorab entscheidbar → Statuscode | E2E gegen Prod: `404 {"error":"norm not found: corpus:dieses-gesetz-gibt-es-nicht"}` | **PASS** |
| **644 AC-4** SSE-Grenze als Kommentar | `remediation.routes.ts` — die Grenze ist benannt, nicht ein Rest zum Aufräumen | PASS |
| **644 AC-5** Positiv-Kontrolle im E2E | der 404-Test steht **vor** dem teuren Lauf, damit er auch bei dessen Abbruch fällt | PASS |
| **Regression** | `npm run gate` **134/134**, unverändert — auch in der Builder-Stufe des Images (8,6 s) | PASS |

## Die drei Bruchstellen

Keine davon lag dort, wohin der Fehlertext zeigte.

| | Wo | Was |
|---|---|---|
| **1** | `RemediationProposal.sourceRef.standardId` | ObjectId-Typ nahm `corpus:dsgvo` nicht an — Abbruch, bevor irgendetwas entstand |
| **2** | `remediationBacklink.service.ts:50` | Join baute `upload:${standardId}` von Hand → `upload:corpus:dsgvo`, ein Schlüssel ohne Gegenstück |
| **3** | `RemediateGateway.tsx` | Der Store trug `error` die ganze Zeit; die Fläche las ihn nie aus |

Bruch 2 stand **nicht im Ticket**. Er kam im Pre-Flight ans Licht und hätte den Fix sonst wertlos
gemacht: Der Vorschlag wäre entstanden, aber `covered` wäre leer geblieben — dieselbe Klasse
Fehlschlag, nur eine Station später.

## Der Preis, offen benannt

Zwei Felder für einen Begriff. Rückholbarkeit **billig** (additives Feld, keine Migration), Ablaufdatum
am Index-Flip in THE-390 P4. Verworfen: **B** (`standardId` auf String öffnen) — gleiche Wirkung,
teurere Rückholbarkeit, *kommt zurück, wenn P4 ohnehin migriert*. **C** (erst die volle Vereinigung) —
hätte THE-636 auf unbestimmte Zeit blockiert, *kommt zurück als P4 selbst*.

## Impact (Ist) — teilweise erreicht

```
POST …/remediation/generate  → 200  {"type":"generation_start","proposalId":"6a79a47ef688dd5dcdd7a1a3"}
sourceRef                    → {"normId":"corpus:dsgvo","sectionIds":["dsgvo:Art. 32"]}
POST …/proposals/…/apply     → 200  {"elementsCreated":3,"connectionsCreated":3}
Lücken vorher: 14   ·   nachher: 14        ⟵ der Rückschluss greift nicht
```

Der Weg, der morgens am Datenmodell endete, führt jetzt bis zur vorletzten Station. Die letzte
fehlt: der Join sucht `sectionEId ∈ ["dsgvo:Art. 32"]`, die 14 Anforderungen tragen `dsgvo:art-32`.
Roh gegen normalisiert → **THE-645**, blockiert THE-642 und THE-643.

## Der vierte Bruch — und warum der Pre-Flight ihn nicht fand

Der Pre-Flight erklärte diesen Schlüsselraum für verifiziert:

> „`requirements.routes.ts:386` löst `sectionEId` gegen `norm.sections[].id` auf, und genau daraus
> besteht `openSectionIds`."

**Falsch, auf vermeidbare Weise.** Zeile 386 ist der *Eingang* des Generators — dort kommt der
Schlüssel vom Client. Was die *gespeicherten* Anforderungen tragen, steht dort nicht; sie tragen den
normalisierten `regulationKey` aus `buildRegulationKey`. Aus einer Route geschlossen, was für die
Daten gilt.

| | Wert | Herkunft |
|---|---|---|
| `ComplianceRequirement.sectionEId` | `dsgvo:art-32` | **normalisiert** (`migrate-to-norms.ts:145`) |
| `norm.sections[].id` → `openSectionIds` | `dsgvo:Art. 32` | **roh**, der `eId` aus dem Korpus |

Die Regel, die daraus folgt: **ein Schlüsselraum ist erst verifiziert, wenn er an gespeicherten
Daten geprüft wurde — nicht, wenn eine Route ihn plausibel auflöst.** Der Rest dieses Pre-Flights
hat an den Daten gemessen; genau an der einen Stelle, wo nicht, saß der nächste Bruch.

## Loop-Stand

| Zyklus | Befund | zählt? |
|---|---|---|
| 1 | Apply-Knopf nicht gefunden — `ProposalCard` startet zugeklappt. **Mein Messwerkzeug**, nicht das Produkt. | nein (neue Diagnose) |
| 2 | Sektions-Schlüssel roh vs. normalisiert. **Produktbefund** → THE-645. | nein (neue Diagnose) |

Budget unangetastet. Gestoppt wurde trotzdem: „wo gehört die Normalisierung hin?" ist eine
Architekturentscheidung, keine Mechanik — und THE-645 legt die drei Optionen mit Rückholbarkeit vor.

## Nachvollziehen

```
$ npx playwright test e2e/chain-remediation.spec.ts -g "404"          # billig, kein Modell
$ E2E_PROJECT_ID=… npx playwright test e2e/chain-remediation.spec.ts  # der teure Durchstich
```

Braucht `.env.e2e` (gitignored, Platzhalter in `.env.e2e.example`).
