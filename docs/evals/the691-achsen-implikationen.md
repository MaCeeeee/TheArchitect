# THE-691 — Implikationen zwischen den Typ-Achsen

> Erzeugt von `npm run typing:implications` (read-only, kein Modell). Nicht von Hand pflegen.

Grundlage: **1750** typisierte Bestimmungen. Mindest-Belegung 20, Konfidenz ≥ 0.95, Lift ≥ 1.5.

## Jede Achse für sich

| Achse | belegt | Werte | Entropie | Mehrheitswert |
|---|---|---|---|---|
| `normKind` | 1750 | 3 | 0.224 Bit | legislation 97.0 % |
| `bindingness` | 1750 | 3 | 0.014 Bit | binding 99.9 % |
| `obligationKind` | 1467 | 3 | 0.941 Bit | obligation 77.0 % |
| `partyRole` | 1327 | 19 | 3.305 Bit | member_state 27.7 % |
| `provisionKind` | 1750 | 6 | 1.977 Bit | obligation 53.6 % |

## Was eine Achse über eine andere verrät

U = Anteil der Unsicherheit über die **Ziel**-Achse, den die **Quell**-Achse wegnimmt. 1,00 = vollständig ableitbar, 0,00 = unabhängig.

| Quelle → Ziel | n | Zellen | Einzelfall-Anteil | H(Ziel) | H(Ziel\|Quelle) | **U** |
|---|---|---|---|---|---|---|
| `provisionKind` → `obligationKind` | 1467 | 6 | 0.0 % | 0.941 | 0.692 | **0.265** |
| `partyRole` → `provisionKind` | 1327 | 19 | 0.0 % | 1.453 | 1.119 | **0.230** |
| `partyRole` → `obligationKind` | 1308 | 19 | 0.0 % | 0.797 | 0.620 | **0.222** |
| `partyRole` → `bindingness` | 1327 | 19 | 0.0 % | 0.009 | 0.007 | **0.215** |
| `partyRole` → `normKind` | 1327 | 19 | 0.0 % | 0.154 | 0.128 | **0.171** |
| `obligationKind` → `provisionKind` | 1467 | 3 | 0.0 % | 1.563 | 1.313 | **0.160** |
| `provisionKind` → `bindingness` | 1750 | 6 | 0.0 % | 0.014 | 0.012 | **0.145** |
| `obligationKind` → `bindingness` | 1467 | 3 | 0.0 % | 0.016 | 0.014 | **0.117** |
| `provisionKind` → `partyRole` | 1327 | 5 | 0.0 % | 3.305 | 2.972 | **0.101** |
| `obligationKind` → `partyRole` | 1308 | 3 | 0.0 % | 3.318 | 3.141 | **0.053** |
| `provisionKind` → `normKind` | 1750 | 6 | 0.0 % | 0.224 | 0.213 | **0.049** |
| `obligationKind` → `normKind` | 1467 | 3 | 0.0 % | 0.190 | 0.184 | **0.030** |
| `normKind` → `partyRole` | 1327 | 3 | 0.0 % | 3.305 | 3.279 | **0.008** |
| `normKind` → `obligationKind` | 1467 | 3 | 0.0 % | 0.941 | 0.936 | **0.006** |
| `normKind` → `provisionKind` | 1750 | 3 | 0.0 % | 1.977 | 1.966 | **0.006** |
| `normKind` → `bindingness` | 1750 | 3 | 0.0 % | 0.014 | 0.014 | **0.004** |
| `bindingness` → `obligationKind` | 1467 | 3 | 0.1 % | 0.941 | 0.940 | **0.002** |
| `bindingness` → `provisionKind` | 1750 | 3 | 0.1 % | 1.977 | 1.975 | **0.001** |
| `bindingness` → `partyRole` | 1327 | 2 | 0.1 % | 3.305 | 3.303 | **0.001** |
| `bindingness` → `normKind` | 1750 | 3 | 0.1 % | 0.224 | 0.224 | **0.000** |

## Ist eine Achse aus allen übrigen ableitbar?

Die eigentliche Redundanz-Frage. Hoher Einzelfall-Anteil entwertet die Zahl — dann misst sie Auswendiglernen.

| Ziel-Achse | n | Zellen | Einzelfall-Anteil | H(Ziel) | H(Ziel\|Rest) | **U** |
|---|---|---|---|---|---|---|
| `normKind` | 1308 | 84 | 1.7 % | 0.156 | 0.123 | **0.213** |
| `bindingness` | 1308 | 94 | 1.9 % | 0.009 | 0.005 | **0.405** |
| `obligationKind` | 1308 | 61 | 0.9 % | 0.797 | 0.446 | **0.441** |
| `partyRole` | 1308 | 17 | 0.2 % | 3.318 | 2.837 | **0.145** |
| `provisionKind` | 1308 | 49 | 0.5 % | 1.403 | 0.904 | **0.356** |

## Regeln, die nicht bloß die Mehrheit vorsagen

_Keine._ Jede Regel mit ausreichender Belegung und ≥ 0.95 Konfidenz sagt lediglich den Mehrheitswert ihrer Zielachse vorher (Lift < 1.5).

**Nicht gezählt:** 40 Regeln mit hoher Konfidenz, aber Lift < 1.5 — sie sagen nur die Mehrheit vorher. 50 Antezedenz-Werte lagen unter der Mindest-Belegung von 20 und wurden übergangen.

