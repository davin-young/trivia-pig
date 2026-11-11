# Homelab deploy: triviapig.lol via Cloudflare Tunnel

This runs the whole stack on one box with Docker Compose and publishes it at
**https://triviapig.lol** through a **Cloudflare Tunnel**. You don't need port forwarding or
certificates, and your home IP isn't exposed. Cloudflare terminates TLS. WebSockets (the buzzers)
pass through the tunnel by default.

```
phones / TV / iPad ──HTTPS──► Cloudflare ──tunnel──► cloudflared ─► app:3000 (Next.js + Socket.IO)
                                                                   ├─► db (Postgres) ─► backup (nightly pg_dump)
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

## Operations
| Task | Command |
|---|---|
| Update | `git pull && docker compose up -d --build` (migrations run on start) |
| Logs | `docker compose logs -f app` |
| Backups | nightly in `./data/backups/` (daily/weekly/monthly rotation) |
| Restore | `gunzip -c data/backups/last/trivia-latest.sql.gz \| docker compose exec -T db psql -U trivia trivia` |
| Manual dump | `docker compose exec db pg_dump -U trivia trivia > dump.sql` |
| Use MinIO for images | `STORAGE_DRIVER=s3`, set `S3_SECRET_ACCESS_KEY`, `docker compose --profile minio up -d` |
| Without Cloudflare | `docker compose --profile caddy up -d` (forward 80/443; see `Caddyfile`) and stop `cloudflared` |

Everything persistent lives in `./data/`. Back up that folder and `.env`.

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
