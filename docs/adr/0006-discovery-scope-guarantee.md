# ADR-0006: Discovery Scope-Guarantee — Beweis-Garantie statt Ranking-Boost für Geltungsbereichs-Artikel

- **Status:** Accepted (2026-07-25, Matthias Ganzmann)
- **Datum:** 2026-07-25
- **Entscheider:** Matthias Ganzmann (Enterprise Architect), im Grill-Verfahren (7 Entscheidungen, einzeln bestätigt)
- **Baut auf:** THE-423-ContextTrace-Befund (CRA: Familie gefunden, Judge sah nie den Geltungsbereichs-Artikel) · Spec `docs/superpowers/specs/2026-07-19-onto-reqharm-path-design.md` §4 · Gate-2-Nachweis `docs/superpowers/2026-07-24-the-432-gate2-evidence.md` · Golden-v2-Nachweis (scope-applicability F1 0,90 out-of-sample) · `docs/evals/typing-release-gates.md`
- **Ticket:** REQ-LAW-002.7 (unter THE-459 / UC-LAW-002)

## Kontext

Die korpusweite Discovery (UC-LAW-002) findet Gesetzes-Familien über Vektor-Ähnlichkeit und legt dem
LLM-Judge je Familie die ähnlichsten Treffer (`topHits`) als Beweismaterial vor. Der per ContextTrace
belegte Fehlermodus (THE-423): Eine Familie wird *gefunden*, aber die topHits enthalten nur
Durchführungs-§§ — der Artikel, der über die Anwendbarkeit *entscheidet* (Geltungsbereich), liegt dem
Judge nie vor → Fehlurteil „gilt nicht".

Seit Gate 2 trägt jeder Korpus-§ einen Typisierungs-Vorschlag (`typing.provisionKind`, 236 ×
`scope-applicability`), qualitätsgemessen (in-sample F1 0,92; **out-of-sample 0,90** — Golden v2) und
per `versionHash` an den Textstand geankert. Dieses Feature ist der **erste Konsument** der
Typisierung; seine Konsumregeln setzen den Präzedenzfall.

## Entscheidungen

**E1 — Mechanismus: Beweis-Garantie, kein Ranking-Boost.** Für jede vom Retrieval gefundene
Kandidaten-Familie werden die scope-§§ aus dem Korpus **zusätzlich ins Judge-Beweismaterial
injiziert**. Das Retrieval (Qdrant, HyDE) bleibt unangetastet. Begründung: Der belegte Fehler lag im
Beweismaterial, nie im Finden; ein Ranking-Eingriff würde das gerade stabilisierte Retrieval riskieren,
um ein ungemessenes Problem zu lösen. **Ehrliche Grenze:** Familien mit null Treffern kann die Garantie
nicht wiederbeleben — das bleibt Recall-Aufgabe der Suchseite (HyDE).

**E2 — Dosierung:** Max. **2 scope-§§ je Familie**, deterministisch nach niedrigster Artikelnummer
(Art. 1/2 zuerst). **Eine Sprachvariante**, bevorzugt die Sprache der vorhandenen Familien-Treffer.
**Dedupe:** Ist ein scope-§ bereits regulär in den topHits, gilt die Garantie als erfüllt.

**E3 — Konsumregeln für Typing-Labels (Präzedenz für alle künftigen Konsumenten):**
1. `typing.versionHash === doc.versionHash`, sonst gilt der § als untypisiert (nie stale konsumieren —
   nach einer Novelle fällt die Garantie stumm weg, bis der Re-Typing-Batch lief; bewusst so).
2. Status `suggested` und `confirmed` werden konsumiert, `rejected` **nie**.
3. Flag `LAW_DISCOVERY_SCOPE_GUARANTEE`, Default **aus** (dark); Env-Fallbacks mit `||`, nie `??`
   (Present-but-empty-Lehre THE-514).

**E4 — Wirkung auf bestehende Urteile + Nachvollziehbarkeit:** Die Injektion verändert den
Beweis-Fingerabdruck (`evidenceSetHash`) → beim ersten Lauf mit Flag werden Kandidaten-Familien **neu
beurteilt**. Das ist gewollt: neues Beweismaterial ⇒ neues Urteil (Kosten ≈ ein Judge-Lauf je Familie,
einmalig pro Projekt). Injizierte §§ tragen im ContextTrace eine **Herkunfts-Markierung**
(`scope-guarantee` statt `retrieval`) — Wirkung und Zitierung bleiben eine Datenbankabfrage
(Notar-Prinzip; so wurde der HyDE-Bug gefunden).

**E5 — Ausfall-Verhalten: weich mit Sichtbarkeit + Alert.** Korpus nicht erreichbar oder keine
konsumierbaren scope-§§ ⇒ Discovery läuft **ohne** Garantie weiter. Die Antwort trägt ein
Sichtbarkeits-Feld `scopeGuarantee: 'applied' | 'partial' | 'unavailable'` (auch im Trace).
**Alerting:** `unavailable` ⇒ Sentry-Error mit `component: law-discovery-scope-guarantee` → fließt
über die bestehende Kette (Sentry → n8n `3QMcMgiKMh7WsFei` → plattformweites Ops-Register) — kein
neuer Draht, kein neues Secret. `partial` (legitimer Zustand, z. B. frisch gecrawltes Gesetz vor dem
Re-Typing) ⇒ nur Log + Feld, **kein** Alert (Alert-Müdigkeit).

**E6 — Messung vor Hellschaltung (release-gates-Disziplin):** Zweistufig wie HyDE:
1. **Offline:** Discovery-Eval-Harness (THE-465) erhält einen Injektions-Seam + einen Fixture-Fall,
   der den CRA-Blindfleck nachstellt (ohne Garantie „gilt nicht", mit Garantie „gilt") — der
   Regressionstest, der THE-423 dauerhaft festnagelt.
2. **Prod, dunkel:** Flag auf einem realen Projekt, Vorher/Nachher via ContextTrace (Herkunfts-
   Markierung macht „wurden injizierte §§ zitiert, kippten Urteile?" abfragbar).
Abnahme: CRA-Fixture kippt nachweislich **und** kein bestehendes „gilt"-Urteil verschwindet.

**E7 — Ownership:** REQ-LAW-002.7 unter **THE-459** (UC-LAW-002): Ownership folgt dem System, dessen
Verhalten sich ändert — nicht der Datenquelle. Sonst sammelt das ONTO-Dach jeden künftigen Konsumenten
und wird nie abschließbar.

## Konsequenzen

- Erster produktiver Konsument der ONTO-Typisierung; E3 ist ab jetzt die Referenz-Vertrauensregel.
- Judge-Prompts wachsen um ≤2 §§ je Familie (~+2–4k Tokens/Discovery-Lauf — vernachlässigbar).
- Nach Novellen ist die Garantie bis zum Re-Typing-Batch stumm — sichtbar über das Feld, alarmiert
  nur bei echtem Ausfall.
- Die Qdrant-Payloads bleiben typing-frei; ein späterer Ranking-Boost (verworfen als Erstschritt)
  bliebe als separates, messbares Vorhaben möglich.
