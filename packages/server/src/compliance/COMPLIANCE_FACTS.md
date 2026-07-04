# Compliance-Facts v1 — gesetzes-agnostische Element-Taxonomie

> Entschieden 2026-07-04 nach Design-Review (3 unabhängige Entwürfe × 3 Judge-Linsen).
> Code: `factsV1.ts` · Katalog: `facts-catalog.self.v1.json` · Einspielen: `npm run facts:apply`
> Linear: Epic THE-378 · Rubrik-Anbindung: `../evals/RUBRIC.md` §2.3

## 1. Warum (Ousterhout: strategisch statt taktisch)

**Das Problem:** Der Zwei-Stufen-Test der Rubrik verlangt, dass regulierte
Datenkategorien am Element „explizit dokumentiert" sind. Die naive Lösung —
Datenkategorien in die Freitext-Beschreibung schreiben — ist taktisches
Programmieren: Jedes neue Gesetz (heute DSGVO, morgen AI Act, übermorgen DORA)
erzwingt neue Sätze in 86+ Beschreibungen. Das ist *change amplification* in
Reinform, und die Beschreibung wird ein unlesbarer Gesetzes-Flickenteppich.

**Die Lösung:** Ein Element deklariert **einmal** gesetzes-freie Fakten —
*was bin ich, was halte ich, was tue ich, wie werde ich betrieben.* Jedes
Gesetz wird ein **Prädikat** über diesen Fakten. Der Beweis der Agnostik steckt
im Beispiel `tech-vps` (Hostinger): **dieselben** Fakten
`infra · eu/vendor_processor/core` ergeben für Art. 17 *no-match* (Infrastruktur
transitiv), für Art. 28 *match* (AVV nötig) und für NIS2 Art. 21 wieder *match*
(System der Diensterbringung). Freitext leistet diese Entkopplung nie.

Die **Beschreibung bleibt Funktionsprosa für Menschen** und wird nie wieder pro
Gesetz angefasst.

## 2. Die vier Dimensionen (Schema v1)

Gespeichert als `metadata.compliance` (Neo4j `metadataJson`, etabliertes Muster;
kompletter API-Schreibpfad existiert). Zod-validiert (`ComplianceFactsV1Schema`).

| Dimension | Werte | Trägt |
|---|---|---|
| `kind` | `store · service · infra · external · control` | infra ⇒ für Datenpflichten transitiv (§2.3); control ⇒ Element IST Maßnahme (Art. 32) |
| `holds` | `[kategorie:presence]` — Kategorien `account · credentials · telemetry · content · financial · special`, presence `doc · maybe` | Stufe-1-Kern: `doc` = maschinenlesbare Form von „explizit dokumentiert"; `maybe` = To-do der Daten-Inventur, matcht NICHT |
| `does` | `auth · tls · encrypt_rest · audit_log · backup · incident_response · breach_notify · ropa · dsr` | Stufe-2-Ausführer (ropa→Art. 30, breach_notify→Art. 33, dsr→Art. 15/17/20) UND „ist selbst TOM" (Art. 32, NIS2 21(2)) |
| `ops` | `{ loc: eu/adequacy/us/other · op: self/vendor_processor/vendor_other · tier: core/support/dev }` | Art. 28 (op), Art. 44 ff. (loc×op), NIS2 21 (tier) + 21(3) Lieferkette (op) |

Reserviert (v1.1, validiert aber ungenutzt): `cap` (`delete_by_subject`, …) für
die Gap-Analyse „doc-Halter OHNE Löschfähigkeit". `note` für Menschen-Kontext.

Jeder Enum-Wert hat in `FACTS_REGISTRY_V1` genau eine Definition + Normreferenz
(Test-erzwungen). Daraus werden später Prompt-Legende und Labeler-Cheatsheet
generiert — eine Quelle, kein Drift. **⚠️ Die DPV-Referenzen (`dpv:`/`pd:`)
stammen aus Modellwissen und sind VOR jedem Audit-/Marketing-Claim gegen die
W3C-DPV-2.x-Spec zu verifizieren** (Spec-Seiten waren zum Designzeitpunkt über
den Proxy nicht erreichbar).

## 3. Gesetze als Prädikate

`PREDICATES_V1` (gleiche Datei): `gdpr.art17/28/30/32/33/44`, `nis2.art21`,
`nis2.art21.supplychain`, `nis2.art23`. Signatur `(facts) → { match, stage, reason }`
— `reason` ist zugleich die Prüfer-Erklärung; `gaps[]` kommt in v1.1 additiv
dazu (Judge-Graft). Die Prädikate sind **Zweitmeinung** für Labeler und
Eval-Report, nicht Ersatz fürs menschliche Gold — Grenzfälle (z. B.
`data-audit` vs. Art. 17(3) Aufbewahrungspflicht) entscheidet weiterhin die
Adjudikation.

**Neues Gesetz = neues Prädikat, 0 Element-Änderungen.** AI-Act-Probe: Deployer-
Pflichten nutzen `loc`/`op`/`content` wieder; NEU wäre genau eine optionale
Dimension `ai` (Minor-Bump v1.1) an den 1–2 KI-berührenden Elementen.

## 4. Serialisierung (Kurz-DSL)

`serializeFacts()`: eine Halbzeile je Element für Prompt, Worksheet, Reports:

```
store; holds account,credentials; does -; eu/self/core
external; holds content?; does -; us/vendor_processor/support
```

`doc` = nackter Name, `maybe` = `name?`, leere Liste = `-`. Kein Profil →
`facts: n/a` (LLM fällt auf die Beschreibung zurück — hält die Übergangsphase
und den profilfreien BSH-Transfer-Slice gültig). Kosten: ~15–25 Tokens/Element.

## 5. Migrationspfad

1. ✅ **Heute:** Schema + Registry + Prädikate + Katalog (34 Profile für die
   operativen Self-Model-Elemente) + `facts:apply` (GET→merge→PUT) +
   `golden:candidates` prüft Profil-Abdeckung + **Cache-Key-Fix** (s. §6).
2. **Matthias:** Katalog reviewen (jedes Profil ist eine Betreiber-Behauptung!),
   `npm run facts:apply -- --apply`, dann `golden:candidates --from-json` erneut.
3. **Nächster Slice (eigener PR):** Profil in den Mapping-Prompt — Cypher in
   `complianceElements.service` um `metadataJson` erweitern, `CandidateElement`
   um `facts`, `buildUserPrompt` rendert die DSL-Zeile + ~10 Zeilen Legende im
   SYSTEM_PROMPT (⇒ neuer Prompt-Hash, bewusst). Worksheet zeigt Facts-Badges —
   Labeler sieht exakt, was das LLM sieht; der Stufe-1-Test wird zur Ablese-Übung.
4. **Self-Baseline direkt MIT Facts labeln und einfrieren** — kein
   Re-Labeling-Konflikt, da die Baseline ohnehin neu entsteht.
5. **E1-Erweiterung:** Lauf mit vs. ohne Facts = eigenes Experiment
   („heben strukturierte Fakten die Mapping-Qualität?") — Meetup-Material.
6. **Zielbild bei echtem Bedarf (nicht jetzt):** Promotion relationaler Fakten
   in den Graph (`HOLDS`-Kanten auf DataCategory-Knoten) für Lineage-View und
   3D-Betroffenheits-Highlight; die `holds`-Kategorie-Werte sind als künftige
   Knoten-IDs vorgezeichnet. Prädikat-Endpoint
   `GET /compliance/affected?predicate=gdpr.art17` als Produkt-Feature.

## 6. Entscheidungs-Log (Design-Review 2026-07-04)

- **Gewinner CF1 (minimal, 4 Dimensionen)** vor DPV-Vollprofil (8 Dim.) und
  Graph-Hybrid — 2 von 3 Judges; Grafts übernommen: Registry mit Normreferenzen
  (aus DPV-Design), `{match, stage, reason}`-Signatur + `cap`-Reserve,
  dokumentierter Graph-Promotionspfad (aus Graph-Design).
- **Dealbreaker 1 (behoben):** `predictionCache.cacheKeyFor` hashte Kandidaten-
  INHALTE nicht — Profil-/Beschreibungs-Änderungen hätten still alte Predictions
  geliefert und jeden Vorher/Nachher-Vergleich entwertet. Fix: `candidatesHash`
  ist jetzt Key-Bestandteil; Alt-Buckets unter `evals/cache/` sind damit stale
  (bewusst — es existiert keine eingefrorene Baseline).
- **Dealbreaker 2 (durch Konstruktion behoben):** Element-PUT ERSETZT
  `metadataJson` vollständig; `policy-evaluation.service` filtert per
  String-CONTAINS auf dem Roh-JSON. Deshalb schreibt NUR
  `mergeComplianceIntoMetadata()` (GET→merge→PUT); Test erzwingt, dass fremde
  Keys byte-identisch überleben.
- **Dealbreaker 3 (offen, terminiert):** DPV-IRIs vor Audit-Claim verifizieren
  (~1–2 h, nach dem Meetup).
