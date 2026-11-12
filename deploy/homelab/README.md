# Homelab deploy: triviapig.lol via Cloudflare Tunnel

This runs the whole stack on one box with Docker Compose and publishes it at
**https://triviapig.lol** through a **Cloudflare Tunnel**. You don't need port forwarding or
certificates, and your home IP isn't exposed. Cloudflare terminates TLS. WebSockets (the buzzers)
pass through the tunnel by default.

```
phones / TV / iPad ──HTTPS──► Cloudflare ──tunnel──► cloudflared ─► app:3000 (Next.js + Socket.IO)
                                                                   ├─► db (Postgres) ─► backup (nightly, verified, rotated)
                                                                   └─► ./data/uploads (images)
auth.triviapig.lol ─────────► Cloudflare ──tunnel──► keycloak:8080 (optional bundled Keycloak)
```

## 1. Prerequisites
- A Linux box (or VM/LXC) with Docker + the Compose plugin. 1 vCPU / 1 GB RAM is plenty
  (add ~1 GB more if you run the bundled Keycloak).
- `triviapig.lol` added to Cloudflare, with the nameservers switched over and the zone **Active**.

## 2. Create the tunnel
1. Cloudflare dashboard → **Zero Trust** → **Networks → Tunnels** → **Create a tunnel** →
   *Cloudflared* → name it `triviapig`.
2. On the "install connector" step, copy the **token** (the long string after `--token`).
   Don't run their install command. Compose runs cloudflared for you.
3. **Public hostnames** tab → add:
   | Subdomain | Domain | Service |
   |---|---|---|
   | *(empty)* | triviapig.lol | `HTTP` → `app:3000` |
   | auth | triviapig.lol | `HTTP` → `keycloak:8080` *(only if using the bundled Keycloak)* |

   Cloudflare creates the DNS records automatically.
4. Recommended zone settings for triviapig.lol:
   - **Speed → Optimization → Rocket Loader: Off** (it rewrites scripts and breaks the app).
   - SSL/TLS mode doesn't matter for tunnels. Leave it on *Full*.
   - Network → WebSockets: On (default).

## 3. Configure
```bash
git clone <your repo> jeppidy && cd jeppidy/deploy/homelab
cp .env.example .env
# generate secrets
for v in AUTH_SECRET POSTGRES_PASSWORD OIDC_CLIENT_SECRET KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD; do
  echo "$v=$(openssl rand -base64 36 | tr -d '/+=' )"; done
```
Paste those values and your `TUNNEL_TOKEN` into `.env`.

## 4. Keycloak (sign-in for people who build and save boards)
Players and the TV display never sign in. Only hosts and board builders use Keycloak.

**Option A: bundled Keycloak** (`--profile keycloak`). On first boot it imports
`keycloak/trivia-realm.json`:
- realm **`trivia`**, self-registration **on** (anyone can make an account to build boards)
- confidential client **`trivia-pig`** whose secret is your `OIDC_CLIENT_SECRET`, redirect
  `https://triviapig.lol/api/auth/oidc/callback`
- realm roles **`trivia-host`** (given to every new user) and **`trivia-admin`** (super-admin in the app)

After it starts, sign in to `https://auth.triviapig.lol/admin` with `KEYCLOAK_ADMIN_USER` /
`KEYCLOAK_ADMIN_PASSWORD`, open realm **trivia** → Users → your user → Role mapping → assign
**trivia-admin**. To stop open sign-ups, turn off Realm settings → Login → *User registration*.
To require email verification, configure SMTP under Realm settings → Email.

**Option B: Keycloak you already run.** Create a client in any realm:
- Client type OpenID Connect, **Client authentication: On**, Standard flow only
- Valid redirect URI `https://triviapig.lol/api/auth/oidc/callback`
- Valid post logout redirect URI `https://triviapig.lol/login`, Web origin `https://triviapig.lol`
- Advanced → PKCE method S256

Then set `OIDC_ISSUER=https://<your-keycloak>/realms/<realm>`, `OIDC_CLIENT_ID` and
`OIDC_CLIENT_SECRET` (Credentials tab). Create a realm role named like `OIDC_ADMIN_ROLE`
(default `trivia-admin`) for admins. Set `OIDC_REQUIRED_ROLE=trivia-host` if only some users
should be allowed in.

With `LOCAL_AUTH=false` (the default in this `.env.example`), Keycloak is the only way to sign
in. Accounts are matched by Keycloak user id, or linked by verified email the first time.

## 5. Start it
```bash
docker compose up -d --build                     # app + db + backups + tunnel
docker compose --profile keycloak up -d --build  # ...with the bundled Keycloak
docker compose logs -f app
```
Open https://triviapig.lol, sign in, and you'll find the "Kava & Kratom" demo board on your
dashboard.

## 6. Running a game night
- **Laptop:** dashboard → *Start game* → host controls open. Click *Open the display* and drag that
  tab to the TV (HDMI, extended desktop), or in Chrome use *⋮ → Cast… → Cast tab*.
- **iPad / phone as host:** on the laptop's host screen open *Devices → Hand off → Host controls*
  and scan the QR code. Nothing to type.
- **Players:** scan the QR code on the TV, or go to `triviapig.lol/join` and type the code.

## Recovery: what happens when things go wrong
The stack is built to come back by itself. You should not need to touch it.

| Event | What happens |
|---|---|
| App crashes or is OOM-killed | Docker restarts it. Phones, the TV and the host reconnect on their own within a few seconds, and the game continues from the last saved step (every action is saved within about 0.3 s). |
| App hangs | A watchdog inside the app exits after 45 s of a frozen event loop, and Docker restarts it. |
| Host reboot / power cut | All services start again on boot (`restart: unless-stopped`; make sure Docker itself starts on boot: `sudo systemctl enable docker`). The app waits for Postgres and retries migrations, so start order doesn't matter. |
| Postgres restarts or is briefly unreachable | Games keep running from memory. Saves retry with backoff until the database is back, and nothing is evicted from memory while unsaved. If saving keeps failing, the host screen shows a red "not being saved" banner until it recovers. |
| Internet or tunnel drops | `cloudflared` reconnects by itself. Devices show "reconnecting" and resume when it returns. |
| A deploy goes wrong | `scripts/update.sh` waits for the new container to report healthy. If it doesn't, it prints the logs, puts the previous version back, and does not try that version again. |
| Bad data or a mistake | Restore last night's backup with `scripts/restore.sh` (it saves the current database first). |

This was tested by hard-killing the server in the middle of a clue (`npx tsx scripts/crash-test.ts`):
score, seats, the open clue, and the host's undo history all came back.

**Health endpoints**
- `/healthz`: liveness (used by the Docker health check).
- `/readyz`: JSON with database status, version, uptime, live games, connected devices,
  devices in games still being played (`playing`), seconds since those games last changed
  (`idleSec`), and unsaved games. Point Uptime Kuma (or similar) at `https://triviapig.lol/readyz`.

`docker compose ps` shows the health of each service. The `backup` service turns *unhealthy* if
the newest good backup is more than 26 hours old.

## Automatic deploys
The pipeline, end to end:

1. A push to `main` runs **CI** (lint, type check, unit tests, an end-to-end game, and a Docker
   boot and crash-recovery test).
2. Only if CI passes, the **Docker image** workflow publishes `ghcr.io/<owner>/<repo>:latest`
   (also tagged `sha-<commit>`).
3. On this host, a systemd timer runs `scripts/update.sh` every two minutes. It pulls the image
   and, when it is new, switches to it **at the next quiet moment**: no device connected to a game
   that is still being played, or no change in those games for `DEPLOY_IDLE_MIN` minutes
   (default 20). A game is never interrupted; a finished game or a forgotten display tab does
   not hold things up.
4. The new container must report healthy. If it does not, the previous image is started again
   and that version is skipped until a newer one is published.

The host pulls; nothing on the internet needs a way in, so this works behind a tunnel.

Set it up once:

```sh
# in .env
APP_IMAGE=ghcr.io/<owner>/<repo>:latest
APP_PULL_POLICY=always

sudo ./scripts/install-autodeploy.sh
```

The publish workflow signs every image with its own GitHub identity (cosign, keyless). To make
the host refuse anything else, for example an image pushed with a stolen registry token, also set
`VERIFY_IMAGE_SIGNER` in `.env` (the example file has the pattern). An image that fails the
check is not deployed, and you get a notification.

Without `APP_IMAGE` the same timer builds from the git checkout instead (it then follows `main`
directly, without waiting for CI). `sudo ./scripts/install-autodeploy.sh remove` turns it off.

### Notifications
The same install also runs `scripts/monitor.sh` every minute. Put an address in `ALERT_URL`
(`.env`) and it tells you, once when a problem starts and once when it clears, about: the app
being down or unreachable from the internet, a crash, games not saving, `ALERT_USERS` or more
devices connected (default 100), memory or disk running out, overdue backups, and the system
clock jumping. Deploys and failed deploys are announced too. `./scripts/notify.sh test` sends
a test message. Because a machine that is switched off cannot send anything, set
`HEARTBEAT_URL` to a ping URL from an outside service to hear about that as well.

Why not Kubernetes: a live game lives in the memory of one server process, so a second replica
could not take over its players anyway. What protects a game is waiting for it to end, and the
fact that every action is saved, so even a forced restart resumes where it stopped.

## Operations
Run these from `deploy/homelab`.

| Task | Command |
|---|---|
| Update automatically | `sudo ./scripts/install-autodeploy.sh` once (see *Automatic deploys* below) |
| Update by hand | `./scripts/update.sh` (waits for a quiet moment; `FORCE=1 ./scripts/update.sh` deploys now) |
| See what the deployer did | `journalctl -u triviapig-deploy -n 50` |
| Status | `docker compose ps` and `curl -s localhost:3000/readyz` from inside: `docker compose exec app node -e "fetch('http://127.0.0.1:3000/readyz').then(r=>r.text()).then(console.log)"` |
| Logs | `docker compose logs -f app` (rotated: 5 files of 10 MB per service) |
| Backups | `./data/backups/daily` (14 days) and `monthly` (6 months): database dump plus an archive of uploaded images, verified after writing |
| Back up now | `docker compose restart backup` runs one if the last is older than 20 h; or `docker compose exec backup sh -c 'rm /backups/.last-success'` then restart |
| Restore | `./scripts/restore.sh` (newest) or `./scripts/restore.sh data/backups/daily/<file>.sql.gz [uploads-<file>.tar.gz]` |
| Manual dump | `docker compose exec db pg_dump -U trivia trivia > dump.sql` |
| Use MinIO for images | `STORAGE_DRIVER=s3`, set `S3_SECRET_ACCESS_KEY`, `docker compose --profile minio up -d` |
| Without Cloudflare | `docker compose --profile caddy up -d --scale cloudflared=0` (forward 80/443; see `Caddyfile`) |

Everything persistent lives in `./data/`. For off-site safety, copy `./data/backups` and `.env`
somewhere else (another machine, a NAS, or cloud storage) with whatever tool you already use.

### Behind your own reverse proxy instead (nginx / Traefik / NPM)
The only requirement is WebSocket upgrade on `/socket.io/`, plus long timeouts:
```nginx
location / {
    proxy_pass http://app:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
}
```
Traefik and Nginx Proxy Manager handle WebSockets automatically (in NPM, tick "Websockets Support").
Always set `APP_URL` to the public https URL. It's used for QR codes, sign-in redirects, and
secure cookies.
