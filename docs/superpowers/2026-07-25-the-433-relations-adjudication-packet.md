# Adjudikations-Paket — Cross-Norm-Relationen v3 (THE-433 / THE-430)

**Zweck:** Die 16 Abweichungen zwischen Opus und GPT-5 auf `relations.v3` entscheiden, damit
`relations.v3.json` eingefroren werden kann (Kappa-Tor ≥ 0,6). Aktuell: **Kappa 0,397** bei 83,3 %
Rohübereinstimmung, 100 Fälle.

**Methode (wie bei der Typisierung):** Du entscheidest **vier Regeln** — nicht 16 Einzelfälle. Jede
Regel löst einen ganzen Block. Am Ende gibt es **einen** echten Ermessensfall, der deine Einzel-
Entscheidung braucht.

**Wichtig vorab — was diese Zahl NICHT ist:** Nicht die Typ-Definitionen sind unscharf (C5 ist
präzise). Die Rater sind an zwei wiederkehrenden Mustern auseinandergegangen, die die Rubrik zwar
abdeckt, aber noch nicht mit einem Präzedenzfall festnagelt. Genau die schreiben wir jetzt fest.

Legende je Fall: **O** = Opus (rater-a) · **G** = GPT-5 (rater-b) · **→ Empf.** = meine Empfehlung
(deine Entscheidung sticht).

---

## BLOCK A — „Nutzt/koordiniert die Institution der anderen Norm, ändert ihren Inhalt nicht" → **keine Beziehung**

**Die Regel, die du entscheidest:**
> Verweist eine Provision auf die **Institution, Plattform oder das Verfahren** einer anderen Norm
> (speist Daten ein, informiert, koordiniert, läuft daneben) — **ohne zu ändern, was die andere Norm
> inhaltlich verlangt** — dann ist das **keine getypte Beziehung** (`__none__`). Reine Nutzung/
> Koordination ≠ Verdrängung/Konkretisierung/Auslegung.

Begründung: C1 fragt „sagt eine Provision etwas **über** die andere aus?". „Ich speise Information in
dein Gremium ein" sagt nichts über den **normativen Gehalt** des anderen — es benutzt ihn nur. Sonst
würde jede institutionelle Verzahnung im Cyber-Recht (ENISA, CSIRT, EU-CyCLONe) zu Tausenden
Schein-Kanten führen.

| # | Paar | O | G | → Empf. | Warum |
|---|---|---|---|---|---|
| A1 | CRA Art. 16 (Single Reporting Platform) ↔ NIS2 Art. 12 (CVD) | CONCRETIZES | none | **`__none__`** | Zwei Meldemechanismen, keiner ändert den anderen (der C4-Standardfall). G richtig. |
| A2 | CRA Art. 17 (weitere Meldung) ↔ NIS2 Art. 18 (Lagebericht) | none | CONCRETIZES | **`__none__`** | Art. 17 verweist auf EU-CyCLONe (NIS2 Art. 16), **nicht** auf Art. 18. O richtig. |
| A3 | CRA Art. 17 ↔ NIS2 Art. 16 (EU-CyCLONe) | none | CONCRETIZES | **`__none__`** | Art. 17 sagt „ENISA **darf** Infos an EU-CyCLONe **übermitteln**" — nutzt das Gremium, konkretisiert es nicht. O richtig. |
| A4 | CRA Art. 17 ↔ NIS2 Art. 12 (CVD) | SETS_PARAMETER | CONCRETIZES | **`__none__`** | Art. 17 bezieht sich auf Art. 16, nicht auf Art. 12. **Beide Rater daneben** — das Paar hat keine Beziehung. |
| A5 | CRA Art. 3 (Definitionen) ↔ NIS2 Art. 12 (CVD) | INTERPRETS | none | **`__none__`** | CRA Art. 3 leiht Begriffe aus NIS2 allgemein, nicht aus Art. 12 (CVD) speziell. G richtig. |
| A6 | DORA Art. 32 (Oversight-Struktur) ↔ NIS2 Art. 32 (Aufsicht) | none | PREVAILS_OVER | **`__none__`** | NIS2 Art. 32 sagt: nationale Behörden **informieren** das DORA-Oversight-Forum — Koordination, keine Verdrängung. O richtig. |
| A7 | KI-VO Art. 6 (Hochrisiko-Einstufung) ↔ CRA Art. 52 (Marktüberwachung) | CONCRETIZES | none | **`__none__`** | Art. 52 verweist auf KI-VO nur zur Marktaufsichts-Koordination, nicht auf die Einstufung in Art. 6. G richtig. |
| A8 | KI-VO Art. 57 (KI-Reallabore) ↔ CRA Art. 12 | RECOGNIZES_EQUIVALENCE | none | **`__none__`** | CRA Art. 12 nennt KI-VO Art. **6/15**, nicht Art. 57 (Sandboxes). Falsches Paar für die Gleichwertigkeit. G richtig. |
| A9 | KI-VO Art. 3 (Definitionen) ↔ DSGVO Art. 9 (bes. Kategorien) | INTERPRETS | none | **`__none__`** | Art. 9 ist keine Definitionsnorm; die geliehenen Begriffe stehen in DSGVO Art. 4. Kein Bezug zu Art. 9. G richtig. |

**Deine Entscheidung A:** Regel annehmen? (→ 9 Fälle auf `__none__`) · anpassen · ablehnen

---

## BLOCK B — Gleichwertigkeits-/Konformitätsfiktion („gilt als konform/erfüllt")

**Die Regel, die du entscheidest:**
> Sagt eine Provision, die Erfüllung der einen Norm **„gilt als"** Erfüllung der anderen
> (Konformitätsfiktion), ist das **`RECOGNIZES_EQUIVALENCE`** — **es sei denn**, die Folge ist, dass
> die andere Norm in diesem Bereich **entfällt** („shall not apply"), dann **`PREVAILS_OVER`**
> (C5-Verdrängungstest). **Gepaart wird mit dem Artikel, der die Fiktions-Klausel trägt bzw. den sie
> ausdrücklich nennt.**

| # | Paar | O | G | → Empf. | Pivot-Klausel |
|---|---|---|---|---|---|
| B1 | DORA Art. 1 ↔ NIS2 Art. 4 (sektorspez. Rechtsakte) | RECOGNIZES_EQUIVALENCE | PREVAILS_OVER | **`PREVAILS_OVER` a→b** | NIS2 Art. 4: „…at least **equivalent** … the relevant provisions of this Directive … **shall not apply**." Gleichwertigkeit ist hier der **Auslöser der Verdrängung** → PREVAILS. G richtig. **Neuer Präzedenz.** |
| B2 | KI-VO Art. 43 (Konformitätsbewertung) ↔ CRA Art. 12 | RECOGNIZES_EQUIVALENCE | CONCRETIZES | **`RECOGNIZES_EQUIVALENCE` b→a** | CRA Art. 12: KI-Hochrisiko-Produkte „**gelten als** … konform" mit CRA. Fiktion, keine bloße Konkretisierung. O richtig. |
| B3 | KI-VO Art. 6 (Einstufung) ↔ CRA Art. 12 | INTERPRETS | none | **`RECOGNIZES_EQUIVALENCE` b→a** | CRA Art. 12 nennt Art. 6 ausdrücklich und knüpft die Konformitätsfiktion daran. **Beide Rater daneben** — es ist die Gleichwertigkeit. |

**Deine Entscheidung B:** Regel + die zwei Präzedenzfälle (Gleichwertigkeit-als-Ausnahme = Verdrängung;
„gilt als konform" = Equivalence) annehmen?

---

## BLOCK C — Verdrängung vs. Konkretisierung (bleibt die andere Norm anwendbar?)

**Die Regel (bereits in C5, hier als Präzedenz festnageln):**
> C5-Test: *Gilt die andere Norm danach noch?* Wenn ja — nur genauer ausgefüllt — dann
> **`CONCRETIZES`**, nicht `PREVAILS_OVER`.

| # | Paar | O | G | → Empf. | Warum |
|---|---|---|---|---|---|
| C1 | KI-VO Art. 10 (Daten-Governance) ↔ DSGVO Art. 9 | PREVAILS_OVER | CONCRETIZES | **`CONCRETIZES` a→b** | KI-VO Art. 10(5) **erlaubt** die Verarbeitung bes. Kategorien für Bias-Erkennung „unbedingt erforderlich" **mit Schutzmaßnahmen** — innerhalb des DSGVO-Rahmens. DSGVO Art. 9 gilt weiter → keine Verdrängung. G richtig. |

**Deine Entscheidung C:** Regel annehmen? (→ CONCRETIZES)

---

## BLOCK D — `INTERPRETS`: geliehene Definition, Richtung = die **definierende** Norm

**Die Regel, die du entscheidest:**
> Übernimmt eine Provision einen Begriff „**im Sinne von / as referred to in** Art. X der anderen
> Norm", ist das **`INTERPRETS`**, und die **Richtung zeigt von der definierenden Norm aus** (sie legt
> den Begriff für die andere aus). Gepaart wird mit dem **Definitions-/Begriffs-Artikel**, nicht mit
> einer beliebigen Sachnorm.

| # | Paar | O | G | → Empf. | Warum |
|---|---|---|---|---|---|
| D1 | KI-VO Art. 3 (Def.) ↔ DSGVO Art. 4 (Def.) | INTERPRETS **a→b** | INTERPRETS **b→a** | **`INTERPRETS` b→a** | DSGVO Art. 4 **definiert** „personenbezogene Daten", die KI-VO Art. 3 übernimmt → die definierende Norm (B=DSGVO) legt aus. Reine **Richtungs**-Korrektur. G richtig. |
| D2 | CRA Art. 57 ↔ NIS2 Art. 3 (wesentl. Einrichtungen) | none | INTERPRETS **b→a** | **`INTERPRETS` b→a** | CRA Art. 57: „essential entities **as referred to in Article 3(1) of Directive (EU) 2022/2555**" — leiht NIS2s Begriff. NIS2 Art. 3 legt aus. O hat den expliziten Verweis übersehen. G richtig. |

**Deine Entscheidung D:** Regel + Richtungs-Präzedenz annehmen? (→ beide `INTERPRETS` b→a)

---

## Der eine echte Ermessensfall (kein Block — deine Einzel-Entscheidung)

| Paar | O | G | Sachlage |
|---|---|---|---|
| KI-VO Art. 27 (Grundrechte-Folgenabschätzung) ↔ DSGVO Art. 35 (Datenschutz-Folgenabschätzung) | RECOGNIZES_EQUIVALENCE | none | KI-VO Art. 27(4): „…so **ergänzt** die Grundrechte-Folgenabschätzung … diese Datenschutz-Folgenabschätzung." **„Ergänzt"** — nicht „gilt als erfüllt". Es ist weder klare Gleichwertigkeit (O) noch gar kein Bezug (G): die Norm nennt die DSGVO-DPIA ausdrücklich und ordnet ein Komplementär-Verhältnis an. |

**Die Frage an dich:** Ist „die eine Prüfung **ergänzt** die andere" …
- **(a)** eine Beziehung, die unser geschlossener Raum nicht sauber trägt → `__none__` (dokumentierte Grenze), **oder**
- **(b)** nah genug an Gleichwertigkeit für die überlappenden Teile → `RECOGNIZES_EQUIVALENCE`, **oder**
- **(c)** eigener Fall, der einen **neuen Präzedenz** („Komplementär-Prüfpflicht") verdient?

Meine Neigung: **(a)** — „ergänzt" ist eine Umsetzungs-Aussage über zwei fortbestehende, eigenständige
Pflichten, nah an C4. Aber das ist genau die Art Grenzfall, die deine Entscheidung braucht.

---

## Nach deinen Entscheidungen

1. Empfehlungen als **B3a-Präzedenzen** (Teil C) in die RUBRIC schreiben — v.a. B1 (Gleichwertigkeit-als-
   Ausnahme), B2 („gilt als konform"), A (Nutzung ≠ Beziehung), D (Definitions-Richtung).
2. Beide Rater-Dateien auf die adjudizierten Wahrheiten setzen → `relations.v3.json` mit `frozen: true`.
3. Kappa neu rechnen (Kontrolle, dass die Regeln konsistent sind) — erwartet deutlich über 0,6, da 15/16
   Abweichungen einer klaren Regel folgen.
4. **Dann** ist THE-433 (Extraktions-Pipeline) entblockt — sie hat jetzt einen frozen Prüfmaßstab (AC-3).

**Bilanz der Empfehlungen (15 Regel-Fälle + 1 Ermessensfall):** In 4 Fällen lag Opus richtig, in 9
GPT-5, in 2 lagen **beide** daneben (A4, B3 — echte Regel-Lücken), 1 echter Ermessensfall (KI-VO 27 ↔
DSGVO 35). Kein systematischer Haus-Bias — die Kanten waren echt strittig, die Rubrik trägt sie.
