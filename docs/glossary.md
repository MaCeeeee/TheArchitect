# Glossar — TheArchitect Fachbegriffe

> Entsteht inkrementell aus Grill-/Design-Sitzungen (grill-with-docs-Verfahren). Ein Begriff wird
> aufgenommen, wenn er in ADRs/Specs wiederkehrt und Verwechslungsgefahr trägt. Quelle je Eintrag.

| Begriff | Bedeutung | Quelle |
|---|---|---|
| **Beweis-Garantie (Scope-Guarantee)** | Mechanismus, der je gefundener Gesetzes-Familie die Geltungsbereichs-§§ zusätzlich ins Judge-Beweismaterial injiziert — im Gegensatz zum *Ranking-Boost*, der das Retrieval selbst verändern würde. | ADR-0006 E1 |
| **Herkunfts-Markierung** | Kennzeichnung im ContextTrace, *wie* ein § ins Beweismaterial kam (`retrieval` vs. `scope-guarantee`) — macht Feature-Wirkung abfragbar statt anekdotisch. | ADR-0006 E4 |
| **Text-Anker (`versionHash`)** | Bindung eines abgeleiteten Artefakts (z. B. Typing-Label) an den exakten Gesetzestext-Stand. Anker gebrochen ⇒ Artefakt gilt als nicht vorhanden, nie als „ungefähr noch gültig". | THE-432 Review-Fix 1; ADR-0006 E3 |
| **Konsumregeln** | Die harten Bedingungen, unter denen ein KI-Vorschlag (Status `suggested`) von einem Feature gelesen werden darf: Anker intakt, nicht `rejected`, hinter Flag. Präzedenz gesetzt vom ersten Konsumenten. | ADR-0006 E3 |
| **Sichtbarkeits-Feld** | Antwort-Feld, das den Degradierungszustand eines weichen Features ausweist (`applied/partial/unavailable`) — Lehre aus dem HyDE-Vorfall: weich ohne Sichtbarkeit ist gefährlich. | ADR-0006 E5 |
| **Beweis-Fingerabdruck (`evidenceSetHash`)** | Hash über das dem Judge vorgelegte Material; gleiches Material ⇒ kein erneutes Urteil. Verändertes Material löst bewusst Neu-Beurteilung aus. | UC-LAW-002; ADR-0006 E4 |
| **In-Sample-Vorbehalt** | Einwand, dass Qualitätszahlen auf denselben Fällen gemessen wurden, aus denen die Regeln stammen. Auflösung: Messung an frischem, disjunktem Out-of-Sample-Satz. | typing-release-gates; Golden-v2-Nachweis |
| **Prompt-Freeze-Ratsche** | Disziplin, den Prompt zwischen Regel-Ableitung und Out-of-Sample-Messung einzufrieren; neue Präzedenzen gelten erst für die nächste Prompt-Version und werden am nächsten Golden gemessen. | Golden-v2-Plan |
| **Konstante Achse / Prävalenz-Paradox** | Messsituation, in der ein Prüfmerkmal im Datenbestand nur einen Wert annimmt — Kappa fällt rechnerisch auf 0 trotz hoher Übereinstimmung; Achse wird ausgewiesen statt das Tor zu reißen. | RUBRIC B4a |
| **Adjudikation** | Menschlicher Schiedsentscheid über Fälle, in denen unabhängige Prüfer (Cross-House-KIs) uneinig sind; entschieden wird je **Regel-Block**, nicht je Einzelfall. | RUBRIC §7/B3a |
