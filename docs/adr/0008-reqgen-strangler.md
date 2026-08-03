# ADR-0008: REQGEN-Ablösung als additiver Strangler — die ISO-Kette speist das bestehende Requirement, bevor sie es ersetzt

**Status:** proposed (2026-08-03) — Abnahme durch Product Owner ausstehend
**Kontext-Ticket:** THE-566 (REQ-REQTRACE-001.7) · Rahmen: ADR-0007 (Requirements-Kette nach ISO/IEC/IEEE 15288) · Präzedenz: THE-390 (Unified-Norm-Strangler)

## Kontext

REQGEN (THE-301) erzeugt aus einem Gesetzesparagraphen in **einem** LLM-Aufruf ein
`ComplianceRequirement`, das drei Dinge zugleich sein soll: rechtliche Forderung,
technische Anforderung und Architektur-Zuordnung. Der Prompt verlangt wörtlich
„what concretely MUST be done **HOW**" — das Gegenteil von ISO 15288 §6.4.3.1
(„should not imply any specific implementation"). Die Folgen sind gemessen
(THE-545/THE-546: Äpfel-mit-Birnen-Abbruch der Adjudikation; 68,8 %-Fehlerrest).

Die Ablösung ist kein Neubau auf grüner Wiese, denn `ComplianceRequirement` ist
das **meistkonsumierte Objekt der Compliance-Seite**. Mechanisch erhoben
(2026-08-03):

| Konsument | Rolle |
| --- | --- |
| `requirements.routes.ts` | CRUD **+ Gates-Tripel + Evidenz + Audit-Bundle (THE-557/558/559 — eine Nacht alt)** |
| `requirementGenerator.service.ts` | REQGEN selbst — der abzulösende Erzeuger |
| `requirementProjection.service.ts` | ArchiMate-Motivation-Projektion (THE-315) — die künftige Maßnahmen-Naht |
| `compliance-gaps.service.ts` | Gap-Analyse (THE-307) |
| `regulationDrift.service.ts` | Version-Lock/Drift + Evidenz-Alterung (THE-368/558) |
| `contextTrace.service.ts` | Korpus-Lese-Provenienz (THE-423) |
| Client (5 Bausteine) | `complianceStore`, Generator-Modal, Requirements-Sektion, Audit-Button, `api.ts` |
| Skripte | `migrate-to-norms`, `obligation-slots`, `seed-art30` |

Dazu die Bestandsgarantien, die jede Option einhalten muss (THE-566-ACs):
BSH-Demo-Daten überleben jede Stufe; alle Konsumenten laufen während der
Migration weiter; Rollback existiert.

Die neue Kette ist definiert (ADR-0007) und ihr Fundament seit heute gebaut:
Klausel mit inhalts-basierter Id (`clauseContentId`, THE-560) und
Verdrängungs-Gate (`displacementGate.service`, THE-563).

## Entscheidung

**Option A — additiver Strangler mit dem bestehenden `ComplianceRequirement`
als Naht.** Drei Phasen, jede einzeln abschaltbar:

**Phase 1 — die Kette speist das Bestandsobjekt.**
Die ISO-Kette (Klausel → Stakeholder-Anforderung → Systemanforderung) entsteht
als **eigene, neue Collections**; nichts Bestehendes wird umgeschrieben. Ein
Adapter materialisiert je Systemanforderung ein `ComplianceRequirement` mit
additiven Rückverweisen (`clauseContentId`, `stakeholderRequirementId`,
`provenance: 'chain'` statt `'reqgen'`). Für alle Konsumenten — Gap, Drift,
Gates, Evidenz, Audit-Bundle, UI — ändert sich **nichts**: sie lesen weiter
`ComplianceRequirement`. Der alte Ein-Schritt-Prompt bleibt hinter einem
Feature-Flag als Rollback-Pfad erhalten.

**Phase 2 — Konsumenten ziehen einzeln auf die Kette.**
Wo ein Konsument von der feineren Ebene profitiert, wechselt er gezielt:
Gap-Analyse je Klausel statt je Requirement; Drift staled je Klausel
(contentId) statt je Artikel; die Projektion (THE-315) hängt Maßnahmen an
Systemanforderungen. Jeder Umzug ist ein eigenes Ticket mit eigenem Test —
kein Sammel-Umbau.

**Phase 3 — REQGEN abschalten.**
Erst wenn kein Konsument mehr den Alt-Pfad braucht, fallen Prompt und
Generator-Service. Alt-Dokumente (`provenance: 'reqgen'`) bleiben lesbar
liegen — sie werden nicht rückwirkend „verbessert"; wo die Kette denselben
Paragraphen neu ableitet, entsteht ein neues Dokument mit Provenienz, das
alte wird als `superseded` markiert, nie gelöscht (WORM-Geist von THE-558).

## Warum nicht die Alternativen

**Option B — `ComplianceRequirement` in place erweitern** (Typ-Feld
`stakeholder | system`, Eltern-Verweis): weniger neue Collections, aber zwei
Semantiken in einem Schema. Die Altlast-Felder („HOW", `linkedElementIds` als
Pflichtbestandteil) blieben für neue Dokumente sinnlos-pflichtig oder müssten
für alte optionalisiert werden — eine Migration am offenen Herzen genau der
Collection, an der seit gestern Gates und Evidenz hängen. Singularität und
Implementierungsfreiheit wären für Altdaten nicht erzwingbar, das Schema
verlöre seine Aussagekraft.

**Option C — Big-Bang-Migration** (alles konvertieren, REQGEN sofort weg):
verletzt beide Bestandsgarantien gleichzeitig. Die Konvertierung alter
Ein-Schritt-Requirements in singuläre Ketten-Objekte ist inhaltliche Arbeit
(der 68,8 %-Fehlerrest zeigt: nicht mechanisch entscheidbar) — als Massen-Lauf
wäre sie genau die ungeprüfte LLM-Interpretation, die ADR-0007 verbietet.

## Konsequenzen

- **Positiv:** Kein Konsument bricht; die neue Kette ist ab Phase 1 produktiv
  nutzbar (gleiche UI, bessere Provenienz); Rollback ist ein Feature-Flag;
  BSH-Daten bleiben byte-identisch liegen. Die frisch gebauten Tore
  (THE-557/558/559) funktionieren unverändert und gewinnen in Phase 2 die
  Klausel-genaue Alterung.
- **Negativ / Preis:** Doppelte Persistenz in Phase 1–2 (Kette + materialisierte
  Requirements); der Adapter ist Code, der in Phase 3 wieder verschwindet;
  zwei Provenienzen nebeneinander verlangen das Provenienz-Feld in jeder
  Auswertung (sonst zählt eine Statistik Alt und Neu doppelt — bekannte
  Strangler-Falle aus THE-390).
- **Offen, ehrlich benannt:** Die Prod-Bestandsgröße (Anzahl
  `ComplianceRequirement` in der BSH-Demo) ist aus dieser Session nicht
  messbar (kein SSH) — sie ist Rollout-Prüfschritt vor Phase 1, ändert aber
  die Optionswahl nicht: Option A ist bestandsgrößen-unabhängig, genau das
  ist ihr Zweck. Ebenso Rollout-Prüfschritt: der THE-442-Migrationsstand
  lokaler Dev-Datenbanken.

## Prüfsteine der Abnahme (aus THE-566)

1. ADR liegt mit Alternativen und Trade-off vor — dieses Dokument.
2. BSH-Demo-Daten überleben jede Stufe → Phase-1-Design berührt sie nicht;
   nachzuweisen im Phase-1-PR durch Vorher/Nachher-Count auf Prod.
3. Konsumenten laufen weiter → Phase-1-Design ändert keine Lese-Pfade;
   nachzuweisen durch die bestehenden Suiten (Gap, Drift, Gates, Bundle).
