# Typisierte Beziehung statt Ja/Nein — Experiment vom 2026-08-01

**Frage:** Erklärt die **Binarität** unseres Paar-Richters sein niedriges Kappa (0,308)?
**Anlass:** NIST IR 8477 (*Set Theory Relationship Mapping*) typisiert Beziehungen — `equal` · `subset` · `intersects` · `not-related`. Unser Richter antwortete Ja/Nein.
**Aufbau:** Dieselben 120 Fälle aus dem eingefrorenen `actions.v1`, dieselbe geblendete Darstellung, dieselben zwei Häuser (Haiku 4.5 · Kimi K3). **Geändert wurde ausschließlich der Antwortraum.**

---

## Ergebnis 1 — Das Kappa-Problem war die Frage, nicht der Richter

| | κ Haiku ↔ Kimi | Rohübereinstimmung |
|---|---|---|
| binär (aufgezeichnet) | **0,308** | 77 % |
| vier Typen (IR 8477) | **0,681** | **84 %** |

**Der Beleg:** Von den **27** Fällen, über die die Häuser sich binär uneins waren, vergeben

* **19 (70 %)** beidseitig `intersects`,
* weitere 6 einen `intersects`/`unrelated`-Split,
* zusammen **25 von 27 (93 %)** mit `intersects` auf mindestens einer Seite.

Die Häuser waren sich einig, dass das Verhältnis **teilweise** ist. Der binäre Zwang hat sie auseinanderdividiert — jedes Mittelfeld-Paar war ein Münzwurf, und zwei Münzwürfe stimmen selten überein.

## Ergebnis 2 — `equal` kommt in 120 Fällen **nicht ein einziges Mal** vor

| Typ | Haiku | Kimi |
|---|---|---|
| `equal` | **0** | **0** |
| `subset` | 0 | 3 |
| `intersects` | 44 | 51 |
| `unrelated` | 76 | 66 |

**Warum das hart ist:** Die Definition ist **wortgleich** mit der des binären Richters.

| | |
|---|---|
| binär, „JA" | *„wenn EIN Prozess/System beide bedient und die Unterschiede reine Parameter sind"* |
| typisiert, `equal` | *„Eine gemeinsam betriebene Maßnahme erfüllt BEIDE vollständig. Unterschiede beschränken sich auf Parameter."* |

Der einzige Unterschied ist die **Ausweichmöglichkeit**. Mit ihr fällt die Ja-Quote von **35 % auf 0 %**.

> **Die veröffentlichten 35 % waren nicht „eine Maßnahme erfüllt beide". Sie waren ganz überwiegend die Mittelkategorie, nach oben gedrückt.**

## Ergebnis 3 — Der Katalog trennt weiterhin sauber

| | beidseitig einig |
|---|---|
| **Arm T** (gleiche kanonische Handlung) | `intersects` 37 · `unrelated` 8 |
| **Arm K** (verschiedene Handlung) | `unrelated` 55 · `intersects` 1 |

Die kanonische Handlung findet **zusammengehörige** Pflichten zuverlässig — Arm T landet auf „verwandt", Arm K auf „unverwandt". Sie findet nur keine **deckungsgleichen**. Die Entscheidung aus THE-538 (Katalog statt Ähnlichkeit) steht damit unverändert; nur die Deutung des Ergebnisses ändert sich.

Die Begründungen sind auffällig konsistent im Muster *„gemeinsamer Kern plus eigene Zusätze"*:

> „Beide fordern technische Maßnahmen, aber A verlangt Dokumentation eines Maßnahmenkatalogs, B zusätzlich …"
> „Beide verlangen Risikoidentifikation, aber A fokussiert auf Datenschutzrisiken …"

## Was das Produktversprechen betrifft

| | |
|---|---|
| ❌ **nicht belegt** | „Einmal umsetzen, mehrfach nachweisen" — das ist `equal`, und `equal` kam nicht vor |
| ✅ **belegt** | „**Gemeinsamer Kern, ausgewiesene Zusätze**" — einmal bauen, zweimal ergänzen |

Das ist keine Abschwächung, sondern eine Präzisierung — und sie passt exakt zur Delta-Logik aus THE-541: der gemeinsame Kern ist die Maßnahme, die Zusätze sind das Delta, das die UI ohnehin ausweisen soll.

## Eigener Fehler im Experiment, festgehalten

Die Zwischenzeile „kollabiertes κ = 0,000 bei 98 % Rohübereinstimmung" ist **kein Widerspruch, sondern die Prävalenzfalle**: Wenn `equal`/`subset` praktisch nicht vorkommen, fällt beim Zurückfalten auf Ja/Nein fast alles auf „nein", ein Rater wird konstant, und κ ist rechnerisch 0.

Unser produktives `cohensKappa` (`actionMetrics.ts`) liefert für genau diesen Fall korrekt `null`. Das Wegwerf-Analyseskript hatte eine eigene Implementierung **ohne** diesen Schutz — ich bin in die Falle gelaufen, die wir selbst dokumentiert haben (`reference_kappa_measurement_traps`, Falle 2). Wer die Zahl später sieht: sie bedeutet „nicht bestimmbar", nicht „Totaldissens".

## Grenzen

* 120 Paare, **zwei** Häuser, **ein** Lauf. Kein menschlicher Anker — das bleibt THE-382 Slice 1.
* Die naheliegende Gegenerklärung („`equal` war zu streng definiert") greift nicht: die Formulierung ist wörtlich die des binären Richters.
* Ob `intersects`-Paare wirtschaftlich wertvoll sind, ist damit **nicht** beantwortet. Ein gemeinsamer Kern kann viel oder wenig Aufwand sparen; das misst erst ein Nutzer.

## Konsequenzen

1. **Der Paar-Richter wird typisiert**, bevor menschliches Gold entsteht — sonst adjudizieren Menschen auf eine kaputte Frage (THE-382 Slice 1, Plan umgeschrieben).
2. **Die 35 % werden umgedeutet**, nicht zurückgezogen: Kommentar an THE-438, Korrektur im Bericht.
3. **Das Freigabe-Tor** bekommt den Typ als Dimension: Stufen A/B/C beziehen sich künftig auf `equal`/`subset` **und** `intersects` getrennt.

---

**Rohdaten:** `typed-relation.json` (Scratchpad, 120 Fälle × 2 Häuser, mit Begründungen) · Quelle `actions.v1`
**Verwandt:** `action-release-gates.md` · THE-382 · THE-438 · `docs/strategy/2026-08-01-uc-newlaw-001-haben-brauchen-uebernehmen.md`
