# Die Vertrauens-Wirbelsäule — Produkt-These über den UX-Hebeln

> **Status:** Strategy-Draft, **NICHT** Sprint-Backlog. Die eigentliche Produkt-These, freigelegt im Gespräch 2026-06-21. Steht **über** den zwei UX-Docs vom selben Tag.
> **Trigger:** Vision des Founders: *"Sobald sich Business-Layer & Applikationen via MCP selbst entdecken, ist jeder CEO & CIO seiner eigenen Sache. Du hast eine Idee — TheArchitect verwirklicht sie."*
> **Ziel dieses Docs:** Begründen, warum **Vertrauen** (nicht Einfachheit) die tragende Achse des Produkts ist, die Schichten-Architektur festhalten, das **Notar-Prinzip** als bewusstes Design-Prinzip verankern und das **Fundament-UC** (Provenance & Konfidenz) skizzieren + scoren — ohne Implementierung loszutreten.
> **Companion-Docs:** [`2026-06-21-complexity-comprehension-ux.md`](./2026-06-21-complexity-comprehension-ux.md) · [`2026-06-21-ux-audit-checkliste.md`](./2026-06-21-ux-audit-checkliste.md)

---

## 1. Die Vision in einem Satz

> **TheArchitect ist die Brücke von Idee zu verwirklichtem Unternehmen.**

Heute braucht diese Brücke den Architekten als Mittler. Sobald sich Prozesse (Business-Layer) und Applikationen (via MCP) **selbst entdecken und verknüpfen**, kollabiert die Distanz zwischen *"ich habe eine Idee"* und *"ich habe ein laufendes, governtes Unternehmen"*. Dann ist jeder CEO & CIO seiner eigenen Sache — weil das Werkzeug die architektonische Komplexität trägt.

*"Du hast eine Idee — Ich verwirkliche sie"* ist damit keine Tagline, sondern die **Persona** des Produkts: TheArchitect als Agent, der realisiert.

---

## 2. Die These: Delegation erfordert Vertrauen

Das Kernverb der Vision ist **delegieren**. *"Ich verwirkliche sie"* heißt: der Mensch übergibt die Realisierung an die Maschine. Und:

> **Man delegiert nur an etwas, dem man vertraut.**

Damit ist die Debatte "Einfachheit vs. Vertrauen" entschieden:

| | Rolle | Begründung |
|---|---|---|
| **Einfachheit** (Krankheit 1: Überforderung lösen) | **Eintrittspreis** | Überforder mich nicht, sonst klicke ich weg. Table-Stakes. |
| **Vertrauen** (Krankheit 2: Misstrauen lösen) | **Der Hebel & der Moat** | Ohne Vertrauen keine Delegation, ohne Delegation keine Vision. |

Kunden *artikulieren* das Symptom (Überforderung) und fragen nach Einfachheit — das ist die *"faster horses"*-Situation. Der eigentliche Enabler, den sie nicht aussprechen, ist Vertrauen. **Wir lösen Einfachheit als Pflicht, wir gewinnen auf Vertrauen.**

---

## 3. Die unbequeme Verschärfung: Automation senkt Default-Vertrauen

Die Vision macht das Vertrauensproblem **größer, nicht kleiner.**

- **Heute:** Der Architekt baut das Modell selbst → er vertraut ihm, weil es *seins* ist.
- **Morgen:** MCP entdeckt Prozesse & Apps **selbst** → der Mensch hat es *nicht* gebaut → *"Die Maschine sagt, mein Unternehmen sieht so aus. Glaube ich das?"*

> **Je mehr du automatisierst, desto niedriger das Ausgangsvertrauen — desto tragender die Vertrauensschicht.**

Automation (Tesler) und Vertrauen sind nicht zwei Features. Sie sind dasselbe Feature von beiden Seiten. **Jede Automatisierung schuldet dem Nutzer eine Vertrauenserklärung.**

---

## 4. Das Notar-Prinzip (bewusstes Design-Prinzip)

> **Bestätigt 2026-06-21 als Design-Prinzip.**

In der Vision wandert der Architekt durch drei Stufen — und in **allen dreien** ist die Vertrauensschicht die Konstante:

| Stufe | Maschine | Mensch | Braucht |
|---|---|---|---|
| **Heute** | unterstützt | **baut** | Lesbarkeit (nicht ertrinken) |
| **Morgen** | **entdeckt (MCP)** | **zertifiziert** | Konfidenz-Signale (was prüfe ich?) |
| **Vision** | **realisiert** | **hat Idee + bestätigt** | Vertrauen by default |

Der Architekt wird vom **Bauer zum Notar.** Die Maschine entdeckt → der Mensch beglaubigt → der CIO/CEO verlässt sich. Eine **Vertrauenskette**, in der der Architekt das Notariat ist.

**Konsequenz für heute:** Wir unterstützen den Architekten nicht primär beim *Bauen* (Modellier-Erleichterung), sondern beim *Beglaubigen* des maschinell Entdeckten. Werkzeuge, die ihn zum souveränen Zertifizierer machen, sind strategischer als Werkzeuge, die ihn schneller zeichnen lassen.

---

## 5. Die Mechanik: Kalibrierung > Korrektheit

Vertrauen entsteht **nicht** durch *immer richtig* — das ist unmöglich. Die Maschine *wird* falsch entdecken.

> **Vertrauen wird in Tropfen gewonnen und in Eimern verloren.**

Der fatale Fehler ist nicht *"falsch liegen"* — es ist *"falsch liegen, ohne es zuzugeben."* Ein Tool, das sagt *"ich bin zu 60% sicher, prüf das"*, gewinnt mehr Vertrauen als eines, das selbstbewusst behauptet und einmal falsch liegt. **Ehrlichkeit über Unsicherheit IST der Vertrauensmechanismus.** Das ist die operative Antwort auf *"keine Fehler reinmachen"*: nicht Perfektion, sondern **kalibrierte Ehrlichkeit**, damit der Notar weiß, *was* er prüfen muss.

---

## 6. Die Schichten-Architektur

So sortiert sich alles Besprochene. Die zwei UX-Docs vom selben Tag sind die *unterste* Schicht — die eigentliche These sitzt drei Ebenen darüber:

```
VISION          „Du hast eine Idee — Ich verwirkliche sie"   (Delegation)
   │
THESE           Delegation erfordert Vertrauen
   │
WIRBELSÄULE     Provenance + Konfidenz auf jedem Atom         ← Fundament-UC (Daten)
   │
ROLLE           Architekt als Notar                           ← Beglaubigungs-Workflow
   │
MECHANIK        Kalibrierung > Korrektheit                    ← „60% sicher, prüf das"
   │
UI-KONSEQUENZ   die 5 Komplexitäts-Hebel + Audit-Checkliste   ← Companion-Docs
```

---

## 7. Das Fundament-UC — Provenance & Konfidenz (Skizze)

> **Befund 2026-06-21:** Provenance wird heute **nicht** getrackt. Damit ist die Wirbelsäule zuerst ein **Daten-Modell-Projekt**, kein UI-Projekt. *Du kannst keine Konfidenz anzeigen, die du nicht speicherst.*

### 7.1 Das Atom

Jedes Element, jede Connection, jedes generierte Requirement bekommt eine Herkunfts-Signatur:

```ts
// additiver Block in packages/shared/src/types/architecture.types.ts
// (genau das Muster der bestehenden Tier-2/Tier-3/AI-Agent-Blöcke)
provenance?:  'user' | 'import' | 'ai_generated' | 'mcp_discovered';
source?:      string;     // z.B. 'SAP-MCP', 'Blueprint-Generator', 'REQGEN'
confidence?:  number;     // 0.0–1.0, nur bei ai/mcp relevant
certifiedBy?: string;     // userId — die Notar-Handlung
certifiedAt?: string;     // ISO timestamp
```

### 7.2 Warum es überraschend billig ist
- **Additiv:** optionale Felder, Default `provenance: 'user'` für alles Bestehende → kein Refactor.
- **Bestehendes Muster:** `ArchitectureElement` ([architecture.types.ts:116](../../packages/shared/src/types/architecture.types.ts)) wächst bereits per optionaler Feld-Blöcke. Provenance ist der nächste Block.
- **Producer existieren schon:** Blueprint-Generator, REQGEN, Generatoren, Auto-Heal sind die ersten Stempler. Natürlicher erster Integrationspunkt: jeder Generator stempelt ab Tag 1 seine Herkunft auf, was er erzeugt.

### 7.3 Der reale Stolperstein (Pre-Flight-Scan-Punkt)
Elemente persistieren in **zwei** Stores: MongoDB **und** Neo4j (`MERGE` in [blueprint.service.ts:581](../../packages/server/src/services/blueprint.service.ts)). Die Provenance-Felder müssen in **beide** propagieren — das ist die eigentliche Arbeit, nicht das Feld selbst. Vor Implementierung: vollständiger Scan aller Schreibpfade (Mongo-Embeds + Cypher-MERGEs + Connection-Schreibpfade).

### 7.4 Abgeleitete Folge-UCs *(in Linear angelegt 2026-06-21)*
- **UC-PROV-001** — Provenance & Konfidenz Daten-Modell *(Fundament)* → [THE-320](https://linear.app/thearchitect/issue/THE-320)
- **UC-CERT-001** — Notar-/Beglaubigungs-Workflow ("Needs-Certification"-Queue: alle Atome mit `provenance ≠ user` ∧ `certifiedBy = null`) → [THE-321](https://linear.app/thearchitect/issue/THE-321) *(blocked by THE-320)*
- **UC-TRUST-001** — Konfidenz-Übersicht (aggregiert "73% bestätigt" als Vertrauenssignal im Overview-First-Screen) → [THE-322](https://linear.app/thearchitect/issue/THE-322) *(blocked by THE-320)*

---

## 8. Scoring (7-Kriterien × 0–5, Σ/35×100)

Schema wie `BP_Javis.xlsx` / Post-Demo-Backlog-RVTM. *ImplChall: 5 = leicht/feasible, 0 = blockierend.* Status = abgeleitet.

| UC | BizValue | BizRisk | ImplChall | Success | Compliance | Relations | Urgency | **Score** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|--:|
| **UC-PROV-001** Provenance-Schema *(Fundament)* | 4 | 5 | 4 | 5 | 4 | 5 | 3 | **85,7** |
| **UC-CERT-001** Notar-Workflow | 4 | 4 | 3 | 5 | 5 | 4 | 2 | **77,1** |
| **UC-TRUST-001** Konfidenz-Übersicht | 5 | 4 | 4 | 5 | 3 | 4 | 2 | **77,1** |

**Lesart:**
- **UC-PROV-001 rankt am höchsten (85,7)** — korrekt, es ist Voraussetzung für die beiden anderen. Hoher BizRisk (ohne es ist die Vision unmöglich) + hohe Relations (enabling) treiben den Score; Urgency niedrig (kein Kunde wartet *heute* darauf).
- CERT & TRUST gleichauf (77,1) — beide hängen an PROV. CERT punktet auf Compliance (Beglaubigung = Audit-Gold), TRUST auf BizValue (der sichtbare Differenzierer / das "Wow").
- **Sequenz ist erzwungen:** PROV → dann CERT + TRUST parallel.

> Scores zur Einordnung ins bestehende Backlog: UC-PROV-001 (85,7) läge zwischen UC-CHOICE-003 (85,7) und UC-GOV-001-Tests (82,9) der Post-Demo-Liste — also **oberes Drittel**, gerechtfertigt durch seinen Enabling-Charakter.

---

## 9. Risiken & Mitigations

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Provenance-Feld nur in Mongo, nicht in Neo4j → inkonsistente Konfidenz | hoch | hoch | Pre-Flight: alle Schreibpfade scannen; ein zentraler Stempel-Helper, den alle Producer + beide Stores nutzen |
| Konfidenz-Werte sind erfunden / unkalibriert → falsches Vertrauen | mittel | sehr hoch | Konfidenz nur wo real messbar (LLM-logprobs, Match-Score reuse von UC-ICM 0.5-Threshold); sonst kein Wert statt Fake-Wert |
| Notar-Queue wird zur Pflichtarbeit, die niemand macht | mittel | mittel | Queue priorisiert (nur hohe Kritikalität / niedrige Konfidenz zuerst); Beglaubigung in Batches, nicht atomweise |
| "73% bestätigt" wird als Gamification missverstanden statt als Ehrlichkeit | niedrig | mittel | Framing als Ehrlichkeits-Signal, nicht als Score-to-maximize |
| Vision verleitet zum Überspringen der Grundarbeit | mittel | hoch | Strikt PROV zuerst; CERT/TRUST erst danach. Dieses Doc als Gate. |

---

## 10. Honest Take (Closing Thought)

Die eigentliche Produkt-These war drei Ebenen unter dem, womit wir gestartet sind. Wir kamen über *"die App ist zu komplex"* rein — und landeten bei *"Delegation erfordert Vertrauen, und Vertrauen erfordert Provenance auf jedem Atom."*

Das Beruhigende: Das Fundament ist **billig und additiv** — ein Feld-Block im Muster, das `ArchitectureElement` eh schon nutzt. Das Unbequeme: Es ist **irreversibel genug** (es wandert in jeden Producer-Codepfad und beide Stores), dass es bewussten Scoring-Blick verdient, bevor es losgetreten wird. Genau deshalb: erst dokumentieren + scoren (dieses Doc), dann Pre-Flight-Scan, dann implementieren.

**Der Moat:** LeanIX/Ardoq bauen hübsche Dashboards *über* der Wahrheit. Wenn TheArchitect die Wahrheit *mit ihrer Konfidenz* zeigt, ist es das erste EA-Tool, das ein Architekt nicht als PowerPoint-Schicht verachtet — und das erste, dem ein CEO bei der MCP-Selbstentdeckung von morgen vertrauen *kann*.

---

## 11. Konkrete nächste Aktionen

### Für mich (Claude):
- [x] Dieses Doc (Schichten-These + Fundament-UC + Scoring)
- [x] Memory-Eintrag `strategy_trust_spine.md` (Produkt-These cross-session)
- [x] Pre-Flight Linear-Suche (kein Duplikat) + 3 UCs angelegt: THE-320 / THE-321 / THE-322
- [ ] Auf Wunsch: UC-PROV-001 (THE-320) als vollständiges RVTM + Schreibpfad-Scan ausarbeiten — **erst nach deinem Go**

### Für dich (Matze):
- [ ] Doc gegenlesen — trägt die Schichten-These? Ist das Notar-Prinzip richtig gefasst?
- [x] UC-PROV-001 ins Scoring aufgenommen (Linear THE-320, Score 85,7) — Scoring lebt in Linear, nicht im xlsx
- [ ] Wenn implementiert werden soll: Pre-Flight-Check für THE-320 freigeben (Schreibpfad-Scan Mongo + Neo4j)

### Was wir HEUTE NICHT machen:
- Keine Schema-Änderung, kein Producer-Code
- Keine Implementierung (Issues stehen auf Backlog, Pre-Flight-Scan + RVTM ausstehend)
