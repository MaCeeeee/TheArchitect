# corpus-tailnet-bridge (Server B → Tailnet)

**Ticket:** THE-441 (OPS-CORPUS-002) · **Server:** B / `data-server` (Tailnet `100.106.223.83`, Hostinger `srv1596957`)

## Zweck

Publiziert die Coolify-managed **Korpus-MongoDB** (`regulations-corpus-db`, Container `zcyizw0m4uvrahyp1txs1qj8`, mongo:7) auf der **Tailnet-IP** von Server B, damit **Server A** den kanonischen Gesetzes-Korpus über das verschlüsselte Tailscale-Mesh lesen kann (ADR-0001/0002).

Der eigentliche Cutover (Server A setzt `CORPUS_MONGODB_URI` auf `…@100.106.223.83:27017/regulations-corpus`) ist **THE-440** — dieser Connector ist die Voraussetzung.

## Warum socat (statt Coolify-Port-Publish)

Coolifys eingebautes Port-Publish bindet auf `0.0.0.0` (öffentlich) — Security-Regression. socat bindet **nur** die Tailnet-IP. Ziel ist der **stabile Coolify-uuid-Containername** → ein Korpus-DB-Redeploy bricht die Auflösung nicht.

> **Diese Bridge ist NICHT in der Coolify-UI sichtbar** (roher Compose-Stack). **Diese Datei ist die Quelle der Wahrheit.** Ersetzt die zuvor per `docker run` gestartete, undokumentierte Bridge (THE-441).

## Deploy

```bash
# Vom Mac (Repo-Root): Dateien auf Server B bringen
rsync -az ops/corpus-bridge/ root@100.106.223.83:/docker/corpus-bridge/

# Auf Server B: alte rohe Bridge entfernen, managed hochfahren
ssh root@100.106.223.83 'docker rm -f corpus-tailnet-bridge; cd /docker/corpus-bridge && docker compose up -d'
```

Der Swap ist **impact-frei, solange THE-440 noch nicht gefahren ist** (nichts konsumiert den Tailnet-Korpus-Port), sonst ein ~Sekunden-Blip auf 27017.

## Verifikation

```bash
# Server B: Listener auf Tailnet-IP + restart-policy
ssh root@100.106.223.83 'ss -tlnp | grep 100.106.223.83:27017; docker inspect corpus-tailnet-bridge --format "restart={{.HostConfig.RestartPolicy.Name}}"'

# Server A → B erreichbar?
ssh root@76.13.150.49 'timeout 5 bash -c "</dev/tcp/100.106.223.83/27017" && echo "A→B:27017 OK" || echo FAIL'
```

Erwartet: Listener auf `100.106.223.83:27017`, `restart=unless-stopped`, `A→B:27017 OK`.

## Auto-Recreate-Probe

```bash
ssh root@100.106.223.83 'cd /docker/corpus-bridge && docker compose down && docker compose up -d && sleep 3'
ssh root@76.13.150.49 'timeout 5 bash -c "</dev/tcp/100.106.223.83/27017" && echo OK || echo FAIL'
```

`restart: unless-stopped` → kommt auch nach Docker-Daemon-/Server-Neustart hoch.

## Rollback (reproduziert die vorige rohe Bridge exakt)

```bash
ssh root@100.106.223.83 'docker rm -f corpus-tailnet-bridge; \
  docker run -d --name corpus-tailnet-bridge --restart unless-stopped \
    --network coolify -p 100.106.223.83:27017:27017 \
    alpine/socat tcp-listen:27017,fork,reuseaddr tcp-connect:zcyizw0m4uvrahyp1txs1qj8:27017'
```

## Security / Härtung (THE-441)

- **Transport:** Tailscale/WireGuard (verschlüsselt, authentifiziert). Bind **nur** auf die Tailnet-IP `100.106.223.83` — nie `0.0.0.0`.
- **Mesh-Least-Privilege (Tailscale-ACL, aktiv):** Tailnet nutzt das `grants`-Modell; nur `server-a → server-b:27017` (+ `admin-mac → *`). Kein `*→*` → jeder fremde/künftige Knoten default-deny. Verifiziert: B→A ist geblockt.
- **Mongo-Auth:** AN (`authSource=admin`) — Primärschutz; auch bei erreichbarem Port kein Zugriff ohne Credentials.
- **TLS:** aktuell nicht aktiv (Tailnet verschlüsselt bereits). Optionale Tiefenverteidigung → eigenes Folge-Ticket, nicht blockierend.
- **Monitoring/Alarm:** gehört zum Cutover — siehe THE-440 (Healthcheck auf `corpus/health` + `corpusMiss`-Telemetrie, scharf sobald `CORPUS_MONGODB_URI` gesetzt ist).

## Zugehörig

- **Least-Privilege (Tailscale ACL):** nur Server A darf `data-server:27017` — Policy in THE-441 (Phase 3).
- **Healthcheck/Alarm:** THE-441 Phase 2 (interim TCP-Probe A→B:27017, scharf auf `/api/regulations/corpus/health` nach THE-440).
- **Spiegel-Bridge B→A:** `mongo-tailnet-bridge` auf Server A = THE-364 (laut THE-441-Review 0 Konsumenten → Kandidat zur Stilllegung).
