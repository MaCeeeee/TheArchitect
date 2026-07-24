# Gate 2 — Nachweis Slice T (Term Typing über den Korpus) — THE-432

**Stand:** 2026-07-24 · **Branch/PRs:** #89 (Gate 1) + #90 (Slice T nachgezogen) auf `master`
**Plan:** `docs/superpowers/plans/2026-07-22-the-432-slice-t-typing-batch.md`
**Frozen Golden:** `packages/server/src/evals/golden/typing.v1.json` (80 Fälle, adjudiziert 2026-07-22)

> **Kurzfassung:** Jeder der 1532 Korpus-Paragraphen trägt jetzt einen 5-Achsen-Typisierungs-Vorschlag
> (Status `suggested`, kein Fakt, kein Konsument). Die Qualität gegen den eingefrorenen Golden liegt auf
> allen aussagekräftigen Achsen über der Freigabe-Schwelle; das **Gate-2-Kriterium** (die eine Klasse,
> die die Discovery-Priorisierung braucht: `scope-applicability`) ist mit F1 0,92 klar erfüllt. Zwei
> Nebenbefunde aus dem Voll-Korpus-Lauf haben Konsequenzen für die nächste Golden-Version.

---

## 1. Was Gate 2 ist

Gate 2 ist die Qualitäts-Schwelle, ab der ein *Konsument* der Typ-Labels freigeschaltet werden darf —
konkret die Priorisierung von `scope-applicability`-Provisions im Discovery-Retrieval (der THE-423-belegte
Hebel: Gesetze wurden bisher nur über Durchführungs-§§ gefunden, nie über ihren Geltungsbereichs-Artikel).
Die Kern-Disziplin (aus OntoLearner §5): **kein Suggest-Feature default-on ohne frozen Golden + Baseline
über der dokumentierten Schwelle.** Schwellen: `docs/evals/typing-release-gates.md`.

Wichtig zur Abgrenzung: Gate 2 gibt die *Messgrundlage* frei. Die Discovery-Priorisierung selbst ist ein
eigener, noch zu bauender Slice — flag-gated, dark by default. Das Typisieren des Korpus schreibt nur
Vorschläge; **kein Code liest das `typing`-Feld** (verifiziert: keine Leser in `packages/server` außer
dem Schema).

## 2. Qualität gegen den frozen Golden (Prompt tp-2, Haiku)

| Achse | Accuracy | macro-F1 | Schwelle | Ergebnis |
|---|---|---|---|---|
| obligationKind | 88,8 % | 0,869 | 0,80 / 0,75 | ✅ |
| provisionKind | 87,5 % | 0,883 | 0,75 / 0,70 | ✅ |
| partyRole | 95,0 % | 0,845 | 0,75 / 0,70 (macro über Klassen n ≥ 3) | ✅ |
| normKind | 100 % | 1,000 | 0,90 / 0,85 | ✅ (auf dem Golden konstant — s. § 4) |
| bindingness | 97,5 % | 0,987 | 0,85 / 0,80 | ✅ (auf dem Golden nahezu konstant — s. § 4) |

**Gate-2-Kriterium (klassen-spezifisch):** Die Discovery-Priorisierung hängt an `scope-applicability`,
nicht am Achsen-Durchschnitt. Diese Klasse: **F1 0,92 · Recall 1,00** ≥ Schwelle 0,80. **Erfüllt.**

**In-Sample-Vorbehalt (steht als stehende Regel in den release-gates):** Die tp-2-Präzedenzregeln im
Prompt stammen aus genau diesen 80 Golden-Fällen. Diese Zahlen belegen, dass der Prompt die adjudizierten
Regeln *anwendet* — sie sind **keine** unabhängige Generalisierungs-Aussage. Die kommt erst mit einem
erweiterten Golden (s. § 5). Der Sprung tp-1 → tp-2 (provisionKind 73,8 → 87,5 %, partyRole 85 → 95 %)
zeigt die Wirkung der Adjudikation, nicht die Feld-Genauigkeit.

## 3. Voll-Korpus-Lauf (Batch, Server B)

- **Abdeckung:** 1532 / 1532 typisiert, 0 untypisiert. `versionHash`-Anker stimmt bei **1532/1532** —
  jeder Vorschlag ist an den Textstand gebunden, den er beschreibt (Novelle ⇒ automatisches Re-Typing).
- **Ausfälle:** 0 (no-response). **OOV-Drops:** 6 (alle `partyRole` — Modell schlug eine nicht in E6
  stehende Rolle vor → verworfen, Achse bleibt offen; Ontologie sauber gehalten).
- **Kosten:** 3,68 M in / 96,8 K out ≈ **4,16 $** (Haiku-Instruct, Guardrail dokumentiert).
- **Provenance-Stichprobe** (`lksg:3`): `modelId=claude-haiku-4-5-20251001 · promptVersion=tp-2 ·
  ontologyVersion=1.6.0 · versionHash=36f5a47b… · status=suggested` — vollständig (AC-1).

**Label-Verteilung über den Korpus:**

| provisionKind | n | | partyRole | n |
|---|---|---|---|---|
| obligation | 765 | | member_state | 303 |
| procedural | 267 | | supervisory_authority | 252 |
| **scope-applicability** | **236** | | provider | 219 |
| enforcement-supervision | 156 | | manufacturer | 106 |
| other | 77 | | controller | 92 |
| definition | 31 | | processor | 57 |
| | | | financial_entity | 48 |
| obligationKind | n | | obligated_enterprise | 30 |
| obligation | 987 | | data_subject | 23 |
| permission | 246 | | essential_important_entity | 14 |
| prohibition | 59 | | ict_third_party_provider | 13 |
| (n/a) | 240 | | deployer / distributor / importer / auth. rep. | 11/11/10/8 |

**Produktsignal:** 236 `scope-applicability`-Provisions über den ganzen Korpus — die Menge, aus der die
Discovery-Priorisierung schöpfen wird. Ausreichende Dichte (je EU-Gesetz Art. 1/2 + Ausnahmen).

## 4. Nebenbefund A — 22 abweichende Labels auf den „konstanten" Achsen: Verdachtsfälle, keine Varianz

> **KORRIGIERT am 24.07. (abends), im Zuge des Golden-v2-Pre-Flights.** Die ursprüngliche Fassung dieses
> Abschnitts las die Abweichungen als „der Korpus zeigt Varianz, der Golden hat sie nur nicht getroffen".
> Diese Lesart war voreilig — der Pre-Flight hat sie falsifiziert.

Der Voll-Korpus-Lauf zeigt auf den zwei am Golden konstanten Achsen 22 abweichende Labels:

- `normKind`: 1516 legislation · **9 implementing_act · 7 delegated_act**
- `bindingness`: 1524 binding · **4 binding-for-agencies · 1 voluntary-de-facto · 1 persuasive**

**Prüfung gegen die Quellen-Registry:** Alle 21 gecrawlten Korpus-Quellen sind unmittelbar geltende
Rechtsakte (EU-Verordnungen/-Richtlinien, deutsche Gesetze). Es gibt **keinen** Durchführungs- oder
delegierten Rechtsakt als Quelle. Da `normKind`/`bindingness` per Rubrik-Regel **dem Quell-Dokument
folgen**, müssten alle 1532 Labels `legislation`/`binding` sein.

Die 22 Abweichungen sind damit **Verdachtsfälle auf Modellfehler** — mutmaßlich exakt die in der Rubrik
benannte Falle: *ein Artikel, der zu delegierten Rechtsakten ermächtigt, ist nicht selbst ein delegierter
Rechtsakt*. **Folge für Golden v2:** Die 22 Fälle gehen als eigener **Audit-Topf** in die Adjudikation
(getrennt vom Generalisierungs-Sample, weil über die Modell-Ausgabe selbst selektiert). Ergebnis ist
entweder der erste echte Fehler-Befund auf diesen Achsen — oder der Beleg echter Varianz. Beides ist
ein Gewinn; die bisherige Formulierung war keine belastbare Aussage.

## 5. Nebenbefund B — die Facetten-Erweiterung war belegt richtig

Die sechs mit E6 1.6.0 neu eingeführten Rollen sind alle mit realer Korpus-Präsenz belegt:
member_state 303 · manufacturer 106 · financial_entity 48 · obligated_enterprise 30 ·
essential_important_entity 14 · ict_third_party_provider 13. Ohne die Erweiterung hätten diese ~514
Provisions keine passende Rolle gehabt (der partyRole-0,597-Befund von Gate 1) — der Architekten-Entscheid
ist damit nicht nur am Golden, sondern am Voll-Korpus bestätigt. Die 6 OOV-Drops sind Kandidaten für die
Prüfung einer 7. Rolle (notifizierte/Konformitätsbewertungsstellen) in einer künftigen Version.

## 6. Akzeptanzkriterien

| AC | Status | Beleg |
|---|---|---|
| AC-1 Provenance vollständig | ✅ | Stichprobe § 3 + versionHash-Anker 1532/1532 |
| AC-2 OOV-Drop + Telemetrie | ✅ | 6 partyRole-Drops gezählt + gemeldet |
| AC-3 Baseline ≥ Schwelle vor default-on | ✅ | § 2; kein Konsument aktiv |
| AC-4 Menschliche Entscheidung unantastbar | ✅ | `$nin`-Guard + Skip-Logik (kein confirmed/rejected im Korpus, latent bis Confirm-UI) |
| AC-5 Instruct-Guardrail dokumentiert | ✅ | `TYPING_BATCH_MODEL`-Kommentar |

## 7. Gate-2-Verdikt

**BESTANDEN** für die Freigabe der Messgrundlage. Der Korpus ist vollständig, nachvollziehbar und
qualitätsgemessen typisiert. Damit ist entsperrt: der Bau der Discovery-`scope-applicability`-Priorisierung
(eigener Slice, flag-gated, dark) und der REQHARM-Cluster-Vorschlag (Typing-Bucket als Vor-Filter).

**Nicht** durch dieses Gate freigegeben: irgendein Feature `default-on`, oder das Lesen der Labels ohne
Flag. Der In-Sample-Vorbehalt bleibt bis zum erweiterten Golden bestehen.

## 8. Nächste Schritte

1. Golden v2: frisches, gestreutes Out-of-Sample-Sample über ALLE Quellen (auch MDR/PSD2/eIDAS/ePrivacy/
   Data Act, die v1 nie sah) → hebt den In-Sample-Vorbehalt; plus Audit-Topf mit den 22 Verdachtsfällen
   (Nebenbefund A) → erster Fehler-Befund bzw. Varianz-Beleg auf normKind/bindingness.
2. Discovery-`scope-applicability`-Priorisierung bauen (dark, flag-gated) — der eigentliche Konsument.
3. Wiederkehrender Batch: neu gecrawlte §§ nachtypisieren (O-5, Scheduler — noch offen).
4. Slice K (Beziehungs-Pipeline) bleibt hinter der Korpus-Verbreiterung (getrennter Track).
