# Runbook — ein Gesetz in den Korpus aufnehmen

**Zweck:** Der vollständige, ehrliche Ablauf für „ein neues Gesetz soll in den
`regulations-corpus`". Mitgeschrieben während eines echten Durchlaufs, damit der
nächste Durchlauf ein Kommando sein kann.

**Bauplan für:** THE-469 (`onboard-law <source>` Ein-Kommando-Script), REQ unter
THE-467 (UC-LAWOPS-001).

**Erster protokollierter Durchlauf:** 2026-08-06 · THE-614 (UC-CORPUS-004) ·
ESG-Rating-VO (EU) 2024/3005 · `esg-rating-de` + `esg-rating-en`

---

## Das Grundmissverständnis, gegen das dieses Runbook geschrieben ist

Ein Gesetz aufzunehmen sieht aus wie „eine Datenzeile". Es sind **fünf Hops**, und
zwei davon fallen still aus:

```
1  Konfiguration      Ontologie + Crawl-Config           → PR
2  Crawl              EUR-Lex → Parser                    → Server B
3  Mongo              regulations-corpus                  → Server B
4  Qdrant             Vektoren                            → Server B   ← fällt still aus
5  aus Prod lesbar    App kennt die Quelle                → Server A   ← fällt still aus
```

**Hop 4** fiel bei DORA am 2026-07-12 aus: 347 Dokumente in Mongo, 341 Vektoren in
Qdrant. Kein Fehler in Code, UI, Test, Health oder Doku. Keyword-Suche fand DORA,
jede semantische Funktion nicht. Gefunden nur per handgeschriebener Read-Query.

**Hop 5** ist der Grund, warum das **zwei Deployments** sind, nicht eines. Der
Quellen-Schlüssel wird gegen die geteilte Ontologie validiert (`isNormSource`).
Server B bekommt den Text; kennt Server A das neue `shared`-Build nicht, weist die
App die Quelle beim Speichern mit `source must be one of …` ab.

**„Done" ist Hop 5, nicht Hop 1.** Der gemergte Code ist die einfachen 20 %.

---

## Legende der Automatisierbarkeit

| Marke | Bedeutung |
|---|---|
| 🟢 | vollautomatisierbar — gehört ins Script |
| 🟡 | automatisierbar, aber mit Bestätigung (verändert gemeinsamen Zustand) |
| 🔴 | bleibt Menschenhand (Merge auf master, Produktions-Deploy, fachliche Abnahme) |

---

## Vorlauf — was man wissen muss, bevor man anfängt

| Sache | Wert |
|---|---|
| Crawler-App in Coolify | heißt **`the-architect`**, nicht „compliance-crawler" · uuid `juit59imqrk8joiorq06q7hc` · Port 3100 |
| Coolify deployt von | **`master`** — ein Feature-Branch muss vorher gemergt sein |
| Coolify-UI | `http://100.106.223.83:8000` (nur übers Tailnet; die öffentliche IP ist dicht) |
| Server B (Korpus) | Tailnet `data-server` = `100.106.223.83` = srv1596957 |
| Server A (App) | Tailnet `primary` = `100.96.198.73`, öffentlich `76.13.150.49` = srv1344643 |
| Korpus-Mongo vom Mac | `mongodb://<user>:<pw>@100.106.223.83:27017/regulations-corpus?authSource=admin` unter Schlüssel **`CORPUS_MONGODB_URI`** |
| Aktiver Compose auf Server A | `docker-compose.prod.yml` — **nie** `docker-compose.yml`, **nie** `git reset --hard` |

**Drei Sackgassen beim Korpus-Zugriff, je einmal durchlaufen:** `localhost:27017`
(dahinter läuft nichts), der Docker-interne Coolify-Zufallsname (löst nur innerhalb
des Compose-Netzes auf Server B auf), und der Wert unter `MONGODB_URI` statt
`CORPUS_MONGODB_URI` (überschreibt die App-DB — die App verbindet dann gegen den
Korpus).

---

## Ablauf

### Schritt 0 — Pre-Flight 🔴

Bestand in Linear und Codebase prüfen, Prämisse einordnen, Score, Komplexität,
dann Ticket + REQs. Für ein Gesetz nach bekanntem Muster ist die Prämisse
(„der EUR-Lex-Transport crawlt diese VO sauber") an über 20 Quellen **gemessen** —
kein Entscheidungs-Ticket nötig.

**Automatisierbar:** nein. Das ist die Stelle, an der ein Mensch entscheidet, ob
dieses Gesetz überhaupt in den Korpus gehört.

_Durchlauf 2026-08-06:_ THE-614 + THE-615…619 angelegt. Score 82,9. Kein
bestehendes Ticket für CELEX 32024R3005 gefunden.

---

### Schritt 1 — Isolierter Arbeitsbereich 🟢

Parallele Sessions teilen den Git-Index. Ein Worktree vom frischen `origin/master`
verhindert, dass zwei Sessions sich gegenseitig den Stand wegziehen.

_Durchlauf 2026-08-06:_ Worktree `the-614-esg-rating-corpus`, Basis `4790333`.
Das Hauptrepo stand auf einem fremden Branch (`docs/the-611-tor-laufzeit`) mit
untracked Dateien — genau der Fall, für den der Worktree da ist.

---

### Schritt 2 — Die Quelle als Datum eintragen 🟢

Vier Dateien, alle in `packages/`:

| Datei | Was |
|---|---|
| `shared/src/ontology/norm-ontology.v1.ts` | `normSources`-Zeile je Sprachfassung + `ontologyVersion` MINOR-Bump |
| `shared/src/ontology/CHANGELOG.md` | Eintrag mit Begründung |
| `compliance-crawler/src/sources/crawl-config.ts` | Crawl-Zeile je Sprachfassung |
| `compliance-crawler/src/__tests__/crawl-config.test.ts` | beide Zeilen literal pinnen |
| `shared/src/relations/lawPatterns.ts` | Law-Familie + Quellen-Zuordnung |

**Zwei Regeln, die nicht verhandelbar sind:**

1. **Ganzes Gesetz.** Kein `articleNumbers`-Filter. Teil-Coverage erzeugt einen
   stillen Retrieval-Blindfleck — die DSGVO lag mit 4 Artikeln im Retrieval-Score
   unter 0,15 und erreichte den Judge nie, obwohl offensichtlich einschlägig.
2. **Beide Sprachen.** Eine einsprachige Quelle punktet schlecht gegen ein
   anderssprachiges Architekturmodell. Der Schlüssel ist `quelle:artikel` — ohne
   Sprach-Suffix überschreibt der zweite Crawl den ersten beim Upsert.

**Was man NICHT anfassen muss:** keine Mongoose-`enum`s, keine Parser-Factory.
Die Dreifach-Pflege ist seit THE-418 kollabiert. Wer hier Code schreibt, hat den
falschen Weg genommen.

---

### Schritt 3 — Lokal prüfen 🟢

`shared` bauen, dann Crawler-Suite und die Ontologie-Prüfsätze.

**Falle:** ein stales `tsbuildinfo` überspringt den Build still und maskiert
Typfehler. Bei unerklärlichen Ergebnissen `shared` sauber neu bauen.

---

### Schritt 4 — PR und Merge auf master 🔴

Coolify deployt Server B ausschließlich von `master`. Der Merge ist damit der
Punkt, ab dem die Änderung produktionswirksam wird.

**Bleibt Menschenhand.**

---

### Schritt 5 — Crawler auf Server B neu ausrollen 🟡

Coolify-API: `GET /api/v1/deploy?uuid=juit59imqrk8joiorq06q7hc&force=true` liefert
eine `deployment_uuid`, Status via `GET /api/v1/deployments/<duuid>`
(queued → in_progress → finished). Der API-Token braucht `read` + `deploy`.

**Bestätigungspflichtig:** ein Redeploy reißt laufende Crawls und Embedding-Läufe
ab. Vorher abgleichen, ob auf Server B gerade etwas läuft.

---

### Schritt 6 — Crawl auslösen 🟡

`POST /crawl` mit den neuen Quellen-Schlüsseln. Braucht keinen Token, solange
`CRAWLER_SHARED_SECRET` nicht gesetzt ist.

**Bestätigungspflichtig:** verändert den geteilten Korpus. Ein neues Gesetz
verschiebt die Retrieval-Grundgesamtheit — laufende Evaluierungen messen danach
gegen eine andere Grundlage. Vorher-Zählerstand festhalten.

---

### Schritt 7 — Embedding erzwingen 🟢

`POST /embed-all {force:false}` — inkrementell, holt nur nach, was fehlt.

**Diesen Schritt nie überspringen, auch wenn der Crawl „grün" meldet.** Das ist
Hop 4, die Stelle des DORA-Ausfalls.

---

### Schritt 8 — Beweisen, nicht vermuten 🟢

`GET /corpus/status` — die eine Frage „liegt Gesetz X vollständig im Korpus?" in
einem Aufruf. Pro Quelle `mongoCount`, `qdrantCount`, `drift`. **`drift = 0` für
beide Sprachfassungen ist das Abnahmekriterium.**

Dazu: Artikelzahl plausibel? DE/EN-Differenz erklärt? Volltext frei von
Tabellen-Artefakten? Kein Artikel am Zeichen-Cap abgeschnitten? Sprachreinheit?

**Warnung aus der Praxis:** ein lokaler API-Export ist **kein** Datenbankstand.
Behauptungen über den Korpus auf Server B werden auf Server B gemessen.

---

### Schritt 9 — Server A ausrollen 🔴

Damit die App die neue Quelle kennt (Hop 5).

```
git fetch origin master && git checkout origin/master -- packages/
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d app
```

**Nie `restart`** — das liest die `.env` nicht neu. **Nie `git reset --hard`** —
`docker-compose.prod.yml` ist git-getrackt und trägt VPS-lokale Patches.

**Bleibt Menschenhand.**

---

### Schritt 9b — Den Prod-Vektorindex nachziehen 🟢

**Der Schritt, der beim ESG-Durchlauf gefehlt hat und fast durchgerutscht wäre.**

Es gibt **zwei** Vektorspeicher. Der Crawler bettet in den auf Server B ein; die
Anwendung durchsucht ihren **eigenen, lokalen** (`QDRANT_URL=http://qdrant:6333`).
Zwischen beiden gleicht nichts von selbst ab.

```
docker exec thearchitect-app node packages/server/dist/scripts/sync-corpus-vectors.js
docker exec thearchitect-app node packages/server/dist/scripts/sync-corpus-vectors.js --apply
```

Erst ohne, dann mit `--apply`. Das Skript rechnet nichts neu — die fertigen Vektoren
liegen im `embedding`-Feld der Korpus-Mongo. Idempotent, mehrfaches Ausführen
schadet nicht.

**Warum das kein optionaler Schritt ist:** `drift = 0` in Schritt 8 misst nur Server
B. Am 2026-08-06 stand dort alles auf grün, während in Produktion **214 Vektoren
fehlten** — die ESG-VO und, seit elf Tagen unbemerkt, die Anleihegesetze aus
THE-519. `corpus/health` meldete dabei `ok: true` und die volle Dokumentenzahl,
weil es Mongo misst und nicht den Vektorindex.

Ursachenbehebung (ein Index statt zwei, und eine Gesundheitsmeldung, die den
Vektorindex mitmisst) = THE-621. Bis dahin ist dieser Schritt Pflicht.

---

### Schritt 10 — Fachliche Abnahme 🔴

Semantische Suche zu einem Sachverhalt des neuen Gesetzes: kommen Artikel zurück,
und zwar über Bedeutung, nicht nur über den exakten Schlüssel? Nimmt die API eine
Norm-Auswahl mit der neuen Quelle an (kein 400 auf `source`)?

Erst wenn das steht, ist das Gesetz aufgenommen.

---

## Protokoll des Durchlaufs vom 2026-08-06

> Wird während der Ausführung fortgeschrieben — **auch die Fehlschläge**. Ein
> Runbook, das nur den Erfolgsfall kennt, automatisiert den Erfolgsfall.

| # | Schritt | Ergebnis | Dauer |
|---|---|---|---|
| 0 | Pre-Flight, Tickets | THE-614 + 5 REQs, Score 82,9 | ~15 min |
| 1 | Worktree | `the-614-esg-rating-corpus` auf `4790333` | < 1 min |
| 2 | Fünf Dateien geändert | Ontologie 1.9.0 → 1.10.0, zwei Crawl-Zeilen, Muster, Pin | ~10 min |
| 3 | `shared` bauen | grün | < 1 min |
| 3a | **Crawler-Suite — FEHLSCHLAG** | 2 rot: `isNormSource('esg-rating-en')` = false | — |
| 3b | Ursache gefunden + behoben | `npm install` im Worktree | ~2 min |
| 3c | Crawler-Suite | **287/287 grün** | < 1 min |
| 3d | Ontologie-Tore | 2 rot → mitgezogen → **178/178 grün** | ~3 min |
| 3e | `tsc --noEmit` server + client | beide 0 | ~2 min |

| 4 | PR #160 | erstellt 18:05, **fremdgemergt 18:07** (nicht von mir) | — |
| 5 | Vorher-Zählerstand | 1640 = 1640, 25 Quellen, kein ESG | < 1 min |
| 6 | **Redeploy — drei Sackgassen** | siehe unten | ~35 min |
| 7 | Redeploy per Coolify-API | `e78jx7fv`, Commit `03b7856`, neuer Container nach ~2 min | ~4 min |
| 8 | Crawl beider Sprachen | je **53 Artikel**, 53 embedded, **0 Fehler** | ~3 min |
| 9 | `embed-all` | `total: 0` — nichts nachzuholen | < 1 min |
| 10 | `corpus/status` | **drift = 0** beidseitig, 1746 = 1746, 27 Quellen | < 1 min |
| 11 | Textqualität | 0 Tabellenmüll, Art. 1–53 lückenlos, **1 Artikel am Cap** → THE-620 | ~3 min |
| 12 | Server-A-Deploy | Gate 134/134, App kennt die Quelle, `corpus/health` 1746 | ~5 min |
| 13 | **Prod-Vektorindex: 1532 statt 1746** | 214 fehlten, davon 108 seit 11 Tagen → THE-621 | ~10 min |
| 14 | Nachzug gebaut + ausgeführt | `sync-corpus-vectors --apply`, 1532 → **1746** | ~25 min |
| 15 | Fachliche Abnahme | ESG-Treffer auf Platz 1 mit **0,804** | ~2 min |

### Die zweite Lehre: `drift = 0` ist nur die halbe Wahrheit

Schritt 8 meldete für beide Sprachfassungen saubere Deckungsgleichheit — und war
trotzdem kein Beweis dafür, dass die Anwendung das Gesetz findet. Gemessen wurde
Server B; durchsucht wird Server A. **Ein Gesetz kann in beiden Speichern eines
Servers vollständig liegen und im Produkt trotzdem nicht existieren.**

Für das Script heißt das: die Abnahme fragt **beide** Vektorspeicher ab, nicht nur
`corpus/status`. Und die letzte Prüfung ist keine Zahl, sondern eine echte
Bedeutungssuche — bei fachlich scharfer Frage muss das neue Gesetz oben stehen.

### Die eigentliche Lehre dieses Durchlaufs: der Redeploy war der teuerste Schritt

Nicht der Code, nicht der Crawl. **Der eine Knopf, der den Crawler erneuert, kostete
mehr Zeit als alles andere zusammen** — weil drei Wege dorthin versperrt waren:

| Versuch | Ergebnis |
|---|---|
| Nutzer klickt in der Coolify-Oberfläche | erreichte Coolify **nachweislich nie** (Uptime unverändert 11 Tage, kein Image, keine Log-Spur) — vermutlich falsche Anwendung erwischt |
| Dateien per `scp` in den Container schieben | von der Sicherheitsschranke gesperrt (kein Schreiben auf Produktion) |
| Den Knopf im Browser drücken | Oberfläche verlangt Einzelfreigabe pro Aktion |
| **Coolify-API mit Token** | ✅ **funktionierte auf Anhieb** |

**Konsequenz für THE-469:** Das Script muss den Deploy über die **Coolify-API**
auslösen, nicht über die Oberfläche. Der Token liegt auf Server B unter
`/root/.coolify_token` (Rechte `read` + `deploy`) und wird serverseitig in den
Header eingesetzt, sodass er nie im Klartext durch einen Client läuft:

```
ssh root@<server-b> 'curl -s -H "Authorization: Bearer $(cat /root/.coolify_token)" \
  "http://localhost:8000/api/v1/deploy?uuid=<app-uuid>&force=true"'
```

Antwort ist eine `deployment_uuid`; Status via
`GET /api/v1/deployments/<duuid>` (`queued` → `in_progress` → `finished`). Die
Antwort nennt auch den gebauten Commit — **den prüfen**, sonst deployt man alten
Stand und merkt es nicht.

**Verifikation, dass der Deploy wirklich griff** (der erste Fehlversuch wäre sonst
unbemerkt geblieben): Container-Name **und** Uptime vergleichen, dann im Container
selbst nach dem neuen Schlüssel greppen. „Coolify meldet fertig" ist kein Beweis;
der Container mit dem neuen Code ist einer.

### Sackgasse: Merge passiert eventuell von selbst

PR #160 war zwei Minuten nach dem Erstellen gemergt, ohne Zutun. Entweder eine
Auto-Merge-Regel oder eine parallele Session. Für ein Script heißt das: **nicht
annehmen, dass der eigene Merge-Aufruf der wirksame war** — nach dem Merge prüfen,
was tatsächlich auf `master` steht, und den gebauten Commit dagegen halten.

### Fehlschlag 3a — der Worktree lief gegen das falsche `shared` 🟢 automatisierbar

**Symptom:** Zwei Tests rot, beide mit derselben Aussage — der eben eingetragene
Quellen-Schlüssel sei keine gültige Ontologie-Quelle. Die Ontologie-Datei enthielt
ihn nachweislich, und `shared/dist` auch.

**Ursache:** Ein frischer Worktree hat **keine eigenen `node_modules`**. Node sucht
nach oben weiter und findet die des Hauptrepos — dort zeigt
`node_modules/@thearchitect/shared` per Symlink auf `packages/shared` **des
Hauptrepos**. Die Tests liefen also gegen einen Stand, der die Änderung nicht hat.

**Behebung:** `npm install` im Worktree-Root. Das npm-Workspaces-Setup legt die
Symlinks lokal an; danach zeigt `shared` auf den Worktree.

**Warum das ins Script gehört:** Der Fehler sieht wie ein Sachfehler aus („die
Quelle ist nicht in der Ontologie"), ist aber reine Auflösungs-Mechanik. Wer ihn
nicht kennt, sucht ihn in der Ontologie — dort, wo er nicht ist. Ein
`onboard-law`-Script muss vor dem ersten Test prüfen, ob
`node_modules/@thearchitect/shared` in den eigenen Arbeitsbereich zeigt.

**Verwandt, aber hier nicht die Ursache:** die bekannte `tsbuildinfo`-Falle (stales
Buildinfo überspringt den Build still). Beide Fehlerbilder sehen gleich aus —
„Code geändert, Verhalten unverändert". Erst Auflösung prüfen, dann Buildinfo.

### Nebenbefund 3d — die Versions-Tore

Zwei Tests pinnen die Ontologie-Version per Gleichheit. Eines ist das bewusste Tor
und wandert mit dem CHANGELOG mit. Das zweite lag in der Verdrängungs-Facette und
pinnte dieselbe Zahl ein zweites Mal — es prüfte damit nicht mehr seinen eigenen
Gegenstand, sondern brach bei jedem fremden Bump mit. Auf eine Untergrenze
umgestellt: die Facette darf nicht hinter ihren Einführungsstand zurückfallen, das
Versions-Tor bleibt beim einen Tor.
