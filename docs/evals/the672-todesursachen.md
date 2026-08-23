# THE-672 — Todesursachen-Diagnose: wo die verlorenen Gold-Familien sterben

> Erzeugt von `the672-todesursachen.ts` (read-only, offline gegen die eingefrorene Fixture). Nicht von Hand pflegen.

Parameter wie prod: topK 60 · Schwelle 0.3 · Deckel 5. Fixture: 35 Absätze.

| Fall | verlorene Familie | max | mean | Score | Rang | **Ursache** |
|---|---|---|---|---|---|---|
| bank-payment-provider | **dsgvo** | 0.168 | 0.078 | 0.141 | 9/11 | **schwelle-max** |
| regional-clinic-patient-portal | **dsgvo** | 0.330 | 0.151 | 0.276 | 8/11 | **mean-verwaesserung** |
| iot-device-manufacturer | **dsgvo** | 0.157 | 0.044 | 0.123 | 10/11 | **schwelle-max** |
| ai-recruiting-saas | **dsgvo** | 0.291 | 0.165 | 0.253 | 2/11 | **schwelle-max** |
| internal-crm-precision | **dsgvo** | 0.122 | 0.088 | 0.112 | 10/11 | **schwelle-max** |
| energy-grid-operator | **dsgvo** | 0.118 | 0.054 | 0.099 | 11/11 | **schwelle-max** |
| automotive-telematics | **dsgvo** | 0.141 | 0.030 | 0.108 | 10/11 | **schwelle-max** |
| automotive-telematics | **data-act** | 0.317 | 0.168 | 0.273 | 5/11 | **mean-verwaesserung** |
| ecommerce-tracking | **dsgvo** | 0.183 | 0.105 | 0.160 | 10/11 | **schwelle-max** |
| ecommerce-tracking | **eprivacy** | 0.267 | 0.206 | 0.249 | 3/11 | **schwelle-max** |
| cloud-msp-financial-clients | **dsgvo** | 0.238 | 0.082 | 0.191 | 9/11 | **schwelle-max** |
| ai-radiology-diagnostics | **dsgvo** | 0.278 | 0.137 | 0.236 | 4/11 | **schwelle-max** |
| supply-chain-conglomerate | **lksg** | 0.084 | 0.057 | 0.076 | 11/11 | **schwelle-max** |
| supply-chain-conglomerate | **dsgvo** | 0.149 | 0.057 | 0.121 | 9/11 | **schwelle-max** |

## Bilanz

Verluste gesamt: **14**
- **schwelle-max**: 12
- **mean-verwaesserung**: 2

## Je Familie

- **dsgvo**: schwelle-max ×10 · mean-verwaesserung ×1
- **data-act**: mean-verwaesserung ×1
- **eprivacy**: schwelle-max ×1
- **lksg**: schwelle-max ×1

## Ehrlichkeits-Vermerk

Die Fixture ist ein 35-Absatz-Miniatur-Korpus — die Diagnose gilt für die MECHANIK (Aggregation/Gate), nicht für Realwelt-Retrieval-Qualität. Bei topK ≥ Korpusgröße ist der Any-Hit-Recall konstruktionsbedingt 100 %; ein echter Retrieval-Miss kann hier gar nicht auftreten. Bevor ein Exit-Tor auf dieser Fixture gemessen wird, gelten die Härtungs-Regeln der Endspiel-Strategie (Held-out je Familie: beide Sprachfassungen + Erwägungsgründe raus, Leakage-Audit, korpusfremder Messpunkt).

## Nachtrag: die Hybrid-Sicht (Stage A ∪ Discovery) — die Zahl, die in Prod zählt

Näherung (Signal-Liste aus dem Golden-Profil, jede Regel mit passendem Signal feuert; vereinfacht gegenüber der gewichteten Prod-Bewertung):

| Metrik | Wert |
|---|---|
| **Hybrid-Recall** | **24/25 = 96,0 %** |
| davon nur Regel-Spur | 13 |
| davon nur Discovery | 5 |
| davon beide Spuren | 6 |
| weiterhin verloren | `ecommerce-tracking/eprivacy` (regel-los, max-Hit 0,267 knapp unter 0,3) |

**Die Antwort auf THE-671 lautet damit: an keinem der drei Verdächtigen.**
- **Deckel: unschuldig** — 0 von 14 Verlusten sterben am Cap (bestätigt die Ticket-Vermutung).
- **Schwelle: das falsche Stellrad** — bei 12 von 14 liegt schon der beste *Einzeltreffer* unter 0,3 (0,08–0,29). Horizontale Gesetze (DSGVO 11×, LkSG) sind gegen ein Projektprofil **semantisch unsichtbar** — kein DSGVO-Artikel ähnelt einer Banking-Plattform-Beschreibung. Genau deshalb existiert für sie die Regel-Spur.
- **Aggregation (Mean-Verwässerung): marginal** — 2 von 14, beide mit max nur hauchdünn über der Schwelle.

Der 44-%-Wert misst Stage B allein gegen Golds, die zu 13/14 Stage-A-gedeckt sind. Discovery leistet, wofür sie gebaut ist: **ruleLessGold-Recall 83,3 %** — das ist ihre Schlagzeilen-Metrik, nicht die 44 %.

**Konsequenzen:** (1) Kein Parameter-Sweep (THE-673) — es gibt nichts zu tunen, das den Befund ändert. (2) Der eine echte Verlust fällt deterministisch an THE-457: eprivacy-Zeile in die Regel-Tabelle. (3) Die Discovery-Metrik im Eval-Report wird auf ruleLessGold als Schlagzeile umgestellt; der Gesamt-Recall bekommt den Vermerk „misst Stage B allein".
