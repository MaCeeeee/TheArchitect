# THE-441: Sichere, immer-verfügbare A→B Korpus-Verbindung — Ausführungsplan

> **Für die Ausführung:** Dies ist ein **OPS/Infra-Plan** (kein Code-TDD). Jeder Schritt hat *Aktion → Verifikation → Rollback*. Änderungen an Prod-Infra werden **einzeln** gefahren und verifiziert. Checkbox-Syntax (`- [ ]`) zum Tracking.

**Ziel:** Die Netzwerk-Verbindung Server A (App) → Server B (Korpus-Mongo) sicher und immer-verfügbar machen — als Teil-1-Voraussetzung für den Cutover (THE-440). Kernstücke: deklarativer/versionierter Connector, Healthcheck-Monitoring (das eigentliche „immer abrufbar"), Mesh-Least-Privilege (defense-in-depth).

**Ticket:** [THE-441](https://linear.app/thearchitect/issue/THE-441) (blocks THE-440) · Score 74,3
**Branch (nur für die committed Infra-Dateien):** `mganzmanninfo/the-441-corpus-bridge-hardening`
**Referenzen:** ADR-0001/0002 · THE-364 (Spiegel-Bridge B→A) · THE-419 (Fallback/Telemetrie) · verifizierter Ist-Stand im Ticket

---

## Verifizierter Kontext (2026-07-10, live)

- **Connector heute:** roher `corpus-tailnet-bridge` (`alpine/socat`) auf Server B: `tcp-listen:27017 → tcp-connect:zcyizw0m4uvrahyp1txs1qj8:27017`, Bind `100.106.223.83:27017` (Tailnet-only), Netz `coolify`, `restart: unless-stopped`. NICHT in IaC/Coolify.
- **Korpus-DB:** Coolify-managed `zcyizw0m4uvrahyp1txs1qj8` (mongo:7, stabiler uuid-Name, Auth `authSource=admin`, kein Host-Publish).
- **Tailnet: 3 Knoten** — `macee-mac` (100.108.237.60), `primary`=A (100.96.198.73), `data-server`=B (100.106.223.83).
- **Crawler schreibt Korpus intern** (coolify-Netz), nicht über Tailnet. → Die `mongo-tailnet-bridge` auf **A** (published A's App-DB auf 100.96.198.73:27017, socat→`thearchitect-mongodb`) ist evtl. **legacy/ungenutzt** — im ACL-Schritt mitprüfen, gehört sonst zu THE-364.
- **App-Seite bereit:** `GET /api/regulations/corpus/health` (nutzt `isCorpusConfigured()`), Fallback+Telemetrie.

## Scope-Reconciliation (VOR Ausführung lesen)

1. **Primärschutz ist Mongo-Auth (bereits AN).** Die Tailscale-ACL ist **defense-in-depth** (Angriffsfläche verkleinern), NICHT der einzige Schutz. Sie ist deshalb **kein harter Blocker** — bricht sie Konnektivität oder ist auf dem 3-Knoten-Tailnet den Aufwand nicht wert, liefern Connector+Healthcheck+Auth trotzdem „sicher + immer-verfügbar".
2. **ACL-Risiko:** Ein Default-Allow-Tailnet auf explizite ACLs umzustellen kippt auf **Default-Deny** — nicht enumerierte Flüsse (SSH, evtl. A→B Qdrant/Embedding, B→A) brechen. Darum: **Preview im Tailscale-ACL-Tester + reversibel + alle kritischen Flüsse nachprüfen.** User-getrieben (eigener Account).
3. **Zero-Downtime-Fenster:** Nichts konsumiert den Tailnet-Korpus-Port bisher (`CORPUS_MONGODB_URI` ungesetzt) → der Connector-Swap ist **impact-frei**, solange er VOR dem Cutover läuft.
4. **Kein reiner Tailscale-Sidecar** (invasiv bei Coolify-managed DB) — bewusst verworfen, siehe Ticket.

---

## Phase 0 — Branch + Korpus-Verbindungsdaten sichern

### Task 0.1: Branch
- [ ] `cd /Users/mac_macee/javis && git checkout master && git pull && git checkout -b mganzmanninfo/the-441-corpus-bridge-hardening`

### Task 0.2: Korpus-Connection-Details (read-only, für Compose-Ziel + spätere Verifikation)
- [ ] Ziel-Container + Netz bestätigen (schon bekannt, gegenprüfen):
```bash
ssh root@100.106.223.83 'docker inspect corpus-tailnet-bridge --format "{{json .Args}} | net={{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}}"'
```
Erwartet: `tcp-connect:zcyizw0m4uvrahyp1txs1qj8:27017`, net=`coolify`. Weicht es ab → STOPP, Plan anpassen.
- [ ] Prüfen ob `coolify`-Netz `external`/attachbar ist:
```bash
ssh root@100.106.223.83 'docker network inspect coolify --format "{{.Name}} driver={{.Driver}} scope={{.Scope}}"'
```

---

## Phase 1 — Deklarativer, versionierter Connector

### Task 1.1: Compose + Runbook committen
- [ ] Datei `ops/corpus-bridge/docker-compose.yml`:
```yaml
# THE-441 — declarative replacement for the raw `corpus-tailnet-bridge` container.
# Exposes the Coolify-managed corpus Mongo (zcyizw0m4uvrahyp1txs1qj8) on the
# Tailnet IP of data-server, so Server A can read the canonical corpus.
# Tailnet-ONLY bind (never 0.0.0.0). Target is the stable Coolify uuid name.
services:
  corpus-tailnet-bridge:
    image: alpine/socat:latest
    container_name: corpus-tailnet-bridge
    restart: unless-stopped
    command: >
      tcp-listen:27017,fork,reuseaddr
      tcp-connect:zcyizw0m4uvrahyp1txs1qj8:27017
    ports:
      - "100.106.223.83:27017:27017"   # Tailnet IP of data-server — NOT 0.0.0.0
    networks:
      - coolify

networks:
  coolify:
    external: true
```
- [ ] Datei `ops/corpus-bridge/README.md` (Runbook): Zweck, warum socat (Coolify public_port bindet 0.0.0.0 = unerwünscht), Deploy-Befehl, Verifikation, Rollback, Hinweis „nicht in Coolify-UI sichtbar — hier ist die Quelle".
- [ ] Commit:
```bash
cd /Users/mac_macee/javis
git add ops/corpus-bridge/ && git commit -m "ops(corpus): declarative tailnet bridge for Server A→corpus reads (THE-441)"
```

### Task 1.2: Swap auf Server B (impact-frei — nichts konsumiert den Port)
- [ ] Compose-Datei auf den Server bringen:
```bash
rsync -az /Users/mac_macee/javis/ops/corpus-bridge/ root@100.106.223.83:/docker/corpus-bridge/
```
- [ ] **Swap** (rohe Bridge stoppen → managed hochfahren; ~Sekunden Blip auf 27017, ohne Konsument = kein Impact):
```bash
ssh root@100.106.223.83 'docker rm -f corpus-tailnet-bridge; cd /docker/corpus-bridge && docker compose up -d'
```
- [ ] **Verifikation:** Listener + A→B-Erreichbarkeit + Auto-restart-Policy:
```bash
ssh root@100.106.223.83 'ss -tlnp | grep 100.106.223.83:27017; docker inspect corpus-tailnet-bridge --format "restart={{.HostConfig.RestartPolicy.Name}}"'
ssh root@76.13.150.49 'timeout 5 bash -c "</dev/tcp/100.106.223.83/27017" && echo "A→B:27017 OK" || echo FAIL'
```
Erwartet: Listener auf Tailnet-IP, `restart=unless-stopped`, `A→B:27017 OK`.
- [ ] **Rollback bei Fehler:** die rohe Bridge war identisch reproduzierbar:
```bash
ssh root@100.106.223.83 'docker rm -f corpus-tailnet-bridge; docker run -d --name corpus-tailnet-bridge --restart unless-stopped --network coolify -p 100.106.223.83:27017:27017 alpine/socat tcp-listen:27017,fork,reuseaddr tcp-connect:zcyizw0m4uvrahyp1txs1qj8:27017'
```

### Task 1.3: Auto-Recreate-Probe (AC)
- [ ] `down`/`up` überlebt:
```bash
ssh root@100.106.223.83 'cd /docker/corpus-bridge && docker compose down && docker compose up -d && sleep 3'
ssh root@76.13.150.49 'timeout 5 bash -c "</dev/tcp/100.106.223.83/27017" && echo OK || echo FAIL'
```
- [ ] Reboot-Robustheit dokumentiert (unless-stopped → kommt nach Docker-Daemon-Start hoch); ein echter Reboot-Test ist optional (Wartungsfenster).

---

## Phase 2 — Healthcheck + Alarm (das „immer abrufbar")

> Ziel: stiller Ausfall (die 36-Tage-Lehre) wird unmöglich. Der Probe testet den A→B-Korpuspfad und alarmiert bei degraded.

### Task 2.1: Alarm-Kanal entscheiden (kleine User-Entscheidung)
- [ ] Kanal wählen: **(a)** n8n-Workflow auf Server B (läuft bereits) → Webhook/E-Mail/Slack; **(b)** einfacher Cron auf Server A + Resend-E-Mail (App hat bereits Resend); **(c)** externer Uptime-Monitor. Default-Empfehlung: **(a) n8n** wenn erreichbar, sonst **(b) Cron+Resend**.

### Task 2.2: Probe bauen (nach Kanal-Wahl)
- [ ] Der Probe ruft **von Server A aus** `curl -s localhost:4000/api/regulations/corpus/health` (bzw. `https://thearchitect.site/...`) und wertet `configured` + `ok` aus. **Wichtig:** VOR dem Cutover ist `configured:false` der Normalzustand (Fallback) — der Probe soll erst NACH THE-440 auf `ok:true` scharf alarmieren. Bis dahin: Probe alarmiert auf *Bridge-Erreichbarkeit* (`A→B:27017 tcp`) statt auf `corpus/health`.
  - Interim-Probe (jetzt sinnvoll): TCP-Reachability A→B:27017 (Cron auf A, 5-min, Alarm bei Fehlschlag).
  - Post-Cutover-Probe: `corpus/health` → `ok:true`, Alarm bei degraded + wenn `corpusMiss`-Telemetrie > Schwelle.
- [ ] Implementieren (Variante je Kanal), 1× Fehlerfall künstlich auslösen → Alarm kommt an (Verifikation).
- [ ] Cron/Workflow + Alarm-Kanal im Runbook dokumentiert.

---

## Phase 3 — Mesh-Least-Privilege (Tailscale ACL) — defense-in-depth, USER-getrieben, reversibel

> ⚠️ Reihenfolge-Sicherheit: Diesen Schritt NUR mit Preview + Rollback-Bereitschaft. Bricht er Konnektivität → sofort zurück (ACL-History im Admin-Konsole). Kein harter Blocker (Mongo-Auth schützt primär).

### Task 3.1: Ist-Flüsse enumerieren (VOR Policy)
> **Review-Ergebnis 2026-07-10 (empirisch, vorab geklärt):** A macht Semantiksuche **lokal** (`QDRANT_URL=http://qdrant:6333`, `EMBEDDING_SIDECAR_URL=http://embedding-sidecar:8001`, `MONGODB_URI=…@mongodb:27017` — alle Container auf A); **0** Referenzen auf `100.106.223.83`/`CORPUS_` in A's Env. **Kein A→B-Fluss ausser dem künftigen Korpus-27017.** Server B hat **0** established Tailnet-Sessions zu A. Die `mongo-tailnet-bridge` auf A = **0 Konsumenten** (legacy → THE-364). Die Start-Policy unten ist damit **flow-vollständig**. Die Enumeration bleibt als Bestätigungs-Gate VOR dem Save.
- [ ] Env-Grep bestätigen (erwartet: nichts):
```bash
ssh root@76.13.150.49 'docker exec thearchitect-app printenv | grep -iE "QDRANT|EMBEDDING|CORPUS|100.106.223.83"'
```
- [ ] **Stärkere Live-Probe (nicht nur Env):** established A→B-Sessions prüfen — jede Zeile = ein Fluss, den die ACL erlauben MUSS:
```bash
ssh root@76.13.150.49 'ss -tnp | grep 100.106.223.83 || echo "keine established A→B-Session"'
```

### Task 3.2: Policy liefern (ich) + einfügen (User, mit Preview)
- [ ] Ich liefere die vollständige Policy als Startpunkt, z.B.:
```jsonc
{
  "hosts": {
    "admin-mac": "100.108.237.60",
    "server-a":  "100.96.198.73",
    "server-b":  "100.106.223.83"
  },
  "acls": [
    // Management/SSH + operator device — volle Konnektivität behalten
    { "action": "accept", "src": ["admin-mac"], "dst": ["*:*"] },
    // Korpus-Read: NUR Server A darf Server B:27017 (der Least-Privilege-Kern)
    { "action": "accept", "src": ["server-a"], "dst": ["server-b:27017"] },
    // + hier die in 3.1 gefundenen Zusatz-Flüsse ergänzen, z.B.:
    // { "action": "accept", "src": ["server-a"], "dst": ["server-b:6333"] },  // Qdrant, falls genutzt
    // { "action": "accept", "src": ["server-b"], "dst": ["server-a:27017"] }, // nur falls mongo-bridge A noch genutzt
  ]
}
```
- [ ] ⚠️ **NUR das `acls`-Array ersetzen — NICHT die ganze Policy.** Bestehende `ssh`-, `nodeAttrs`-, `grants`-, `autoApprovers`-, `tagOwners`- und Subnet/Exit-Node-Blöcke MÜSSEN erhalten bleiben (sonst brechen SSH-Freigaben/Routes still). `hosts` ergänzen, `acls` in-place anpassen, Rest unangetastet.
- [ ] **User:** in Tailscale-Admin → **Access Controls** → nur `hosts`+`acls` einpflegen → **Preview/Tester** nutzen (prüfen: admin-mac→A/B SSH erlaubt; A→B:27017 erlaubt; ein hypothetischer Fremdknoten→B:27017 verweigert) → Save.
- [ ] **Verifikation nach Save** (alle müssen grün bleiben):
```bash
ssh root@76.13.150.49 'echo A-SSH ok'; ssh root@100.106.223.83 'echo B-SSH ok'
ssh root@76.13.150.49 'timeout 5 bash -c "</dev/tcp/100.106.223.83/27017" && echo "A→B:27017 OK"'
ssh root@100.106.223.83 'curl -s -o /dev/null -w "crawler /health %{http_code}\n" localhost:3100/health'
curl -s -o /dev/null -w "site %{http_code}\n" https://thearchitect.site/
```
- [ ] **Negativprobe:** vom Mac aus `nc -z -G3 100.106.223.83 27017` → sollte nach ACL **fehlschlagen** (Mac ist nicht `server-a`), belegt Least-Privilege.
- [ ] **Rollback:** ACL-Policy im Admin-Konsole auf die vorige Version zurücksetzen (Versionshistorie).

---

## Phase 4 — Auth/TLS + Abschluss

### Task 4.1: Auth bestätigen, TLS einordnen
- [ ] Mongo-Auth AN bestätigt (Korpus-URI `authSource=admin`) ✓ (bereits verifiziert).
- [ ] TLS als **optionale Tiefenverteidigung** in THE-441-Kommentar festhalten (Tailnet verschlüsselt bereits → separates Folge-Ticket, nicht blockierend).

### Task 4.2: Doku + Linear + Memory
- [ ] `ops/corpus-bridge/README.md` final (Deploy/Verify/Rollback, ACL-Verweis, Healthcheck-Kanal). Commit + Push + PR.
- [ ] THE-441 → In Progress → (nach Merge/Abschluss) Done; Kommentar mit finalem Zustand + welche ACL-Flüsse erlaubt wurden + Healthcheck-Kanal.
- [ ] Memory `progress_compliance_crawler` aktualisieren (Connector jetzt deklarativ, Pfad, Healthcheck, ACL-Stand).
- [ ] THE-440 (Cutover) ist damit **unblocked** → separater bewusster Schritt.

---

## Reihenfolge & Risiko-Zusammenfassung

1. **Phase 1** (Connector) — sicher, impact-frei, hoher Wert. **Zuerst.**
2. **Phase 2** (Healthcheck) — der eigentliche „immer-abrufbar"-Hebel. Interim-Probe jetzt, scharf nach Cutover.
3. **Phase 3** (ACL) — defense-in-depth, USER-getrieben, reversibel, **kein harter Blocker**.
4. **Phase 4** — Doku/Abschluss.

Jede Phase einzeln fahren + verifizieren. Phase 1+2 kann ich weitgehend allein (SSH), Phase 3 braucht dich (Tailscale-Admin).
