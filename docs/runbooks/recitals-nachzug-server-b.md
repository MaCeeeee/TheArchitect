# Runbook — Erwägungsgründe auf Server B nachziehen (eprivacy)

**Zweck:** Die letzten beiden Sprachfassungen holen, die der lokale Lauf nicht
bekommt, weil EUR-Lex unsere Büro-IP drosselt. Auf Server B greift der
Firecrawl-Rückfall.

**Ticket:** THE-681 (REQ-679.2) · **Commit:** `f3241bd` + `recitals:crawl:prod`
**Stand vor dem Lauf:** 2554 Erwägungsgründe, 12 von 13 EU-Familien
**Erwartet danach:** 2652, 13 von 13

---

## Warum überhaupt Server B

Der Direktabruf von EUR-Lex ist von hier aus tot: **HTTP 202 mit leerem Body**,
auch für Quellen, die Stunden zuvor liefen (Kontrolltest am 14.08. mit `cra-de`).
Es ist eine IP-Sperre, keine URL-Frage. `fetchLegalHtml` fällt deshalb auf
**Firecrawl** zurück — das scrapt von fremder Infrastruktur. Voraussetzung ist ein
`FIRECRAWL_API_KEY` in der Umgebung; lokal ist keiner gesetzt, in Coolify
vermutlich schon.

> **Der Lauf ist idempotent.** Die 2554 vorhandenen Erwägungsgründe werden
> verglichen, nicht neu geschrieben (`versionHash` + `citedArticles`). Ein
> Fehlversuch kostet nichts außer Zeit.

---

## Voraussetzung: der Code muss auf `master` sein

Coolify deployt Server B **ausschließlich von `master`**. Der Recitals-Code hängt
derzeit in **PR #182**.

**Ohne Merge kein Lauf.** Bleibt Menschenhand.

---

## Schritt 1 — Prüfen, ob überhaupt ein Schlüssel da ist 🟢

Vor dem Deploy, damit ein Fehlversuch nicht erst nach zwei Minuten Bauzeit auffällt.
In der Coolify-Oberfläche (`http://100.106.223.83:8000`, nur übers Tailnet) unter der
App **`the-architect`** → *Environment Variables* nach `FIRECRAWL_API_KEY` sehen.

Fehlt er dort, ist der Lauf sinnlos — dann zuerst den Schlüssel eintragen (Wert aus
THE-402). **Nie in eine Repo-Datei.**

---

## Schritt 2 — Crawler neu ausrollen 🟡

**Bestätigungspflichtig:** Ein Redeploy reißt laufende Crawls und Embedding-Läufe ab.
Vorher abgleichen, ob auf Server B gerade etwas läuft.

```bash
# Server B (Korpus)
curl -s -H "Authorization: Bearer $(cat /root/.coolify_token)" \
  "http://localhost:8000/api/v1/deploy?uuid=juit59imqrk8joiorq06q7hc&force=true"
```

Status verfolgen mit der zurückgegebenen `deployment_uuid`:

```bash
# Server B (Korpus)
curl -s -H "Authorization: Bearer $(cat /root/.coolify_token)" \
  "http://localhost:8000/api/v1/deployments/<deployment_uuid>"
```

Warten bis `finished`. **„Coolify meldet fertig" ist kein Beweis** — Schritt 3 prüft
am Container, ob der neue Code wirklich drin ist.

---

## Schritt 3 — Container finden und Code-Stand belegen 🟢

Coolify vergibt Zufallsnamen; der Container wird über das Image gesucht.

```bash
# Server B (Korpus)
docker ps --format '{{.ID}}  {{.Names}}  {{.Image}}' | grep -i architect
```

Dann am gefundenen Container prüfen, dass der neue Einstiegspunkt existiert:

```bash
# Server B (Korpus)
docker exec <container> ls dist/cli/recitals-crawl.js
```

Fehlt die Datei, ist der alte Code noch drin — dann Schritt 2 wiederholen, **nicht**
weitermachen.

---

## Schritt 4 — Zählerstand VORHER festhalten 🟢

Ohne Vorher-Wert ist der Nachher-Wert keine Messung.

```bash
# Server B (Korpus)
docker exec <container> node -e "
const m=require('mongoose');(async()=>{await m.connect(process.env.MONGODB_URI);
const c=m.connection.db.collection('recitals');
console.log('recitals:',await c.countDocuments({}));
console.log('eprivacy:',await c.countDocuments({source:/^eprivacy/}));
console.log('regulations:',await m.connection.db.collection('regulations').countDocuments({}));
await m.disconnect()})()"
```

**Erwartet:** `recitals: 2554 · eprivacy: 0 · regulations: 1746`

---

## Schritt 5 — Die zwei Fassungen holen 🟡

Einzeln, nicht als Vollauf — das schont die Quelle und macht die Zuordnung eindeutig.

```bash
# Server B (Korpus)
docker exec <container> npm run recitals:crawl:prod -- --source eprivacy-de
docker exec <container> npm run recitals:crawl:prod -- --source eprivacy-en
```

**Im Ausgabe-Summary zu sehen:**

| Zeile | erwartet |
|---|---|
| `49 Erw. · neu 49 · … · paragraph-fallback` | die 2002er-Richtlinie hat keine ELI-Container |
| `über Firecrawl : eprivacy-de` | der Rückfall hat gegriffen — bei `— (alles direkt)` war die Drossel weg, auch gut |
| `regulations : 1746 → 1746 ✓ unberührt` | **muss** stehen; alles andere ist ein Abbruchgrund |

Steht dort `kein FIRECRAWL_API_KEY gesetzt`, fehlt der Schlüssel in Coolify →
zurück zu Schritt 1.

---

## Schritt 6 — Nachher messen 🟢

Dasselbe Kommando wie Schritt 4.

**Erwartet:** `recitals: 2652 · eprivacy: 98 · regulations: 1746`

Zusätzlich stichprobenhaft lesen, dass es echter Text ist und keine Attrappe
(die Lehre aus dem CRA-Art.-14-Fall — vollzählig ist nicht vollständig):

```bash
# Server B (Korpus)
docker exec <container> node -e "
const m=require('mongoose');(async()=>{await m.connect(process.env.MONGODB_URI);
const d=await m.connection.db.collection('recitals').findOne({regulationKey:'eprivacy-de:rec-1'});
console.log(d.recitalNumber, '|', d.fullText.slice(0,140));
await m.disconnect()})()"
```

---

## Schritt 7 — KEIN Vektor-Nachzug 🔴

Anders als bei einem neuen Gesetz: **Erwägungsgründe werden nicht eingebettet.**
Sie sind kein Normtext; sie ins Artikel-Retrieval zu mischen würde die Suche
verwässern. Das steht so in REQ-679.2 (AC-5) und ist eine Entscheidung, keine
Auslassung.

Ebenso **kein `typing:batch`** — ein Erwägungsgrund ist keine Pflicht.

---

## Schritt 8 — Zurückmelden

THE-681 mit dem Impact schließen: *„13 von 13 EU-Familien tragen Erwägungsgründe,
2652 gesamt (DE+EN), `regulations` unberührt."* Nicht „Lauf gefahren".

Danach den Adjudikationsbogen neu erzeugen — die drei Fälle, die heute noch
„Fassung liegt noch nicht vor" zeigen, bekommen ihren Zweck-Kontext:

```bash
# Mac
cd packages/server && node --env-file=../../.env -r ts-node/register/transpile-only \
  src/scripts/the654-addressee-sample.ts
```

**Erwartet:** `Zweck-Kontext : 0 Artikel-Zitat · 34 gesetzesweit · 1 ohne Fassung`
(der verbleibende ohne Fassung ist `lksg` — deutsches Recht ohne EU-Erwägungsgründe).
Danach die Fall-Liste gegen die committete Fassung diffen: Die Positionen **müssen**
byte-gleich bleiben.
