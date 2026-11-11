# 🐷 Trivia Pig (jeppidy)

A self-hosted, real-time quiz-show game in the style of Jeopardy!: a big-screen **display**, **host
controls** on a laptop, iPad, or phone, and **buzzers** on everyone's phone. Players sign their names by
hand, multi-color, and write their Final Jeopardy answers the same way.

Built to replace jeopardylabs.com, with a better board editor, real admin controls, and instant phone join.

**Open source.** The code lives at <https://github.com/davin-young/trivia-pig>, and you can host your
own copy (see [Quick start](#quick-start-docker)). A public instance runs at <https://triviapig.lol>.

> _Screenshots / GIFs:_
> `docs/screenshots/display-board.png` · `docs/screenshots/host-ipad.png` · `docs/screenshots/player-buzzer.png` · `docs/screenshots/final-reveal.gif`

## Features
- **Three synced views of one live game**
  - `/display/CODE`: no login, view-only, fullscreen, cast/AirPlay/HDMI friendly. Answers are never
    sent to it until revealed.
  - `/host/CODE`: full controls. It's responsive (laptop, iPad landscape/portrait, or phone) and has
    keyboard shortcuts on a laptop.
  - `/join` → `/play/CODE`: phone buzzer with lockout feedback, handwritten name, Final Jeopardy
    wager and answer.
- **Join screen.** Before the game, the display is a party-game style room screen: where to go, a
  big room code and QR, original lobby music, and a wall of hand-drawn name cards that pop in as
  people join. Cards resize to fit, so 3 players or 300 both fill the screen. There is no cap on
  players or teams unless the host sets one.
- **Device pairing.** Hand the host controls to an iPad or phone by scanning a QR code. You can
  hand off as host, co-host, or scorekeeper. Online/reconnecting/offline status shows for every
  device.
- **Handwriting.** Names and Final answers are drawn with perfect-freehand. Strokes are stored as
  vector data, so they stay crisp on a 4K TV. You get 10 bright swatches plus a custom color, three
  brush sizes, an eraser, undo/redo, and rainbow and neon-glow brushes.
- **Server-authoritative game engine.** It's pure, tested, and event-sourced, so the host can
  **undo any step** (not just the last) and redo it. State persists to Postgres, so a refresh or
  dropped connection resumes exactly where you were.
- **Fair buzzers.** The server measures each phone's network round-trip time and orders buzzes by
  when the button was *pressed*, so the best Wi-Fi doesn't win (toggle in Settings). An optional
  early-buzz lockout penalizes buzzing before the host unlocks, and a setting controls whether
  wrong answerers can buzz again.
- **Live controls.** Open, reveal, and close clues. "Nobody got it" auto-returns to the board.
  Daily Double wagers, the full Final Jeopardy reveal flow, manual score edits, and passing control.
  Skip, re-open, or mark clues used. Fix a typo mid-game. Pause, BRB or blank screen, scoreboard
  overlay, announcements, show/hide the join QR, and switch rounds.
- **All-play clues.** Open any clue as "all-play": everyone types an answer on their phone at once,
  the host judges each one, right answers score and wrong ones cost nothing.
- **Auto-open buzzers.** Optionally the buzzers open by themselves after a reading time based on
  the clue's length, with countdown light bars on the display so nobody has to guess.
- **Reactions, awards and practice bots.** Players can send emoji reactions to the display. The
  winner screen hands out awards (fastest buzzer, longest streak, biggest comeback and more). The
  host can add bot players to rehearse a board alone.
- **Players and teams.** Kick, ban, rename, reset or hide a drawing, drag onto teams, auto-balance,
  a profanity filter, and automatic seat and score recovery on reconnect.
- **Sound.** All original audio, synthesized with the Web Audio API (no copyrighted show music),
  plus a host soundboard.
- **Board builder.** Inline grid editing with keyboard navigation and autosave, images (drag, drop,
  or paste), video/audio/YouTube links, Daily Doubles, CSV/JSON import, JSON export, drag to
  reorder, preview, version history, share links, and templates. Two people editing the same board
  (or a typo fix made mid-game) never silently overwrite each other: the second save gets a
  conflict prompt.
- **Try it without an account.** `/try` opens the builder with no sign-in. The draft is kept in
  the browser and moves into the account when the person signs in.
- **Public gallery.** Owners can list a copyable board at `/gallery`, where anyone can search,
  preview and copy it.
- **AI board drafts (optional).** With `ANTHROPIC_API_KEY` set, hosts can describe a topic and get
  a full editable draft from Claude. Drafts are rate limited per host and always need a human
  fact-check before game night.
- **Season leaderboard.** Wins, podiums, totals and averages across finished games, by player or
  team name, for the last 30/90/365 days or all time.
- **Dashboard.** Search, tags, folders, archive, trash and restore. Active games with resume, game
  history, results with CSV export, and rematch.
- **Accounts.** **Keycloak/OIDC** single sign-on and/or email + password + magic link. Co-host and
  scorekeeper invites. A super-admin page.

## Architecture
```
 phones (/play) ──┐                          ┌─ Postgres (Prisma): users, boards, games + action logs
 host   (/host) ──┼── Socket.IO ──► server.ts ┤
 TV  (/display) ──┘   (same port)   Next.js   └─ media: ./uploads or S3/R2/MinIO, served via /media/*
```
- **`server.ts`** runs Next.js (App Router pages + API routes) **and** Socket.IO in one long-lived
  Node process. Don't deploy it serverless.
- **`src/engine/`** is the pure game engine: `GameState = replay(setup, actionLog)`. Undo marks a log
  entry undone and replays. `views.ts` redacts state per audience (host / display / player).
- **`src/server/live.ts`** keeps live games in memory, writes each action through to Postgres, and
  broadcasts a redacted view to every socket.
- **`src/shared/protocol.ts`** holds the zod schemas for every socket message. Host intents are
  validated, permission-checked (scorekeepers get score actions only), then resolved to engine
  actions.
- Host sockets authenticate **only** via the httpOnly session cookie or a game-scoped pairing grant
  cookie. Players reconnect with a per-game secret token kept in localStorage.
- Rate limits: a token bucket per socket, extra cost for drawings, a 2-second drawing throttle,
  stroke/point caps, a 256 KB max message size, and per-IP limits on sign-in and upload routes.

See [`docs/PLAN.md`](docs/PLAN.md) for the data model and the full socket event schema.

**Built to recover.** Every action is saved to Postgres within about 0.3 s. If the process
crashes, hangs (a watchdog exits it), or the box reboots, the supervisor restarts it, devices
reconnect by themselves, and the game continues. If Postgres is briefly down, games keep running
from memory and saves retry. `/healthz` is liveness; `/readyz` reports database status, version,
and live games. Details: [`deploy/homelab/README.md`](deploy/homelab/README.md#recovery-what-happens-when-things-go-wrong).

> **Scaling note:** live game state is held in one process, so run **one** app instance. A single
> small instance handles many concurrent games.

## Quick start (Docker)
```bash
docker compose up --build        # app + Postgres + MinIO at http://localhost:3000
```
`SEED_DEMO=true` creates **demo@example.com / demo1234** with the "Kava & Kratom" board.

## Local development
```bash
cp .env.example .env
docker compose up -d db          # or point DATABASE_URL at any Postgres 14+
npm install
npx prisma migrate dev
npm run db:seed                  # demo@example.com / demo1234
npm run dev                      # http://localhost:3000 (tsx watch: server + Next dev)
```
Useful scripts:
| Command | What it does |
|---|---|
| `npm test` | unit tests (engine, pairing, socket auth, limits, OIDC, import, results) |
| `npm run lint` / `npm run typecheck` | ESLint / tsc |
| `npx tsx scripts/smoke.ts` | end-to-end test against a running server (2 players, a clue, undo, Final) |
| `npx tsx scripts/crash-test.ts` | hard-kills the built server mid-game, restarts it, and checks every device resumes |
| `npx tsx scripts/dev-bots.ts` | creates a game and joins 3 bot players, for UI work |

To test on phones on your LAN, set `APP_URL=http://<your-lan-ip>:3000`.

## Configuration
All settings are environment variables. See [`.env.example`](.env.example).

| Variable | Purpose |
|---|---|
| `APP_URL` | Public URL, used for QR codes, sign-in redirects, and secure cookies |
| `AUTH_SECRET` | Required in production |
| `DATABASE_URL` | Postgres connection string |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Keycloak sign-in (empty disables it) |
| `OIDC_ADMIN_ROLE` / `OIDC_REQUIRED_ROLE` | Role that grants super-admin / role required to sign in |
| `LOCAL_AUTH` | `false` makes Keycloak the only sign-in method |
| `ALLOW_SIGNUP`, `ADMIN_EMAILS` | Local accounts. The first account is always admin |
| `SMTP_URL`, `MAIL_FROM` | Magic links and invites. Without SMTP, links are printed to the log |
| `ANTHROPIC_API_KEY` | Optional. Enables "Draft with AI" (`ANTHROPIC_MODEL`, `AI_DRAFTS_PER_HOUR` tune it) |
| `STORAGE_DRIVER` | `local` (`UPLOAD_DIR`) or `s3` (`S3_ENDPOINT`, `S3_BUCKET`, keys, `S3_FORCE_PATH_STYLE`) |

## Deploy
- **Homelab behind a domain (triviapig.lol, Cloudflare Tunnel, optional bundled Keycloak):** see
  **[`deploy/homelab/README.md`](deploy/homelab/README.md)**.
- **Fly.io:** `fly.toml` is included. Run `fly launch --no-deploy --copy-config`, attach Fly
  Postgres, create the `trivia_data` volume, set `AUTH_SECRET` and `APP_URL`, then `fly deploy`.
  Keep one machine running (auto-stop is disabled because games live in memory).
- **Behind a reverse proxy:** forward WebSocket upgrades for `/socket.io/` and use long read
  timeouts. Snippets are in the homelab README.
- **Images:** GitHub Actions publishes `ghcr.io/<owner>/<repo>:latest` on every push to `main`.

## Sound licenses
Every sound effect and the ~30-second Final "think" music are **original**. They're generated at
runtime by `src/client/sound.ts` with the Web Audio API (oscillators, filtered noise, a simple
sequencer). The repo bundles no audio files. They are not based on, and do not imitate, the
Jeopardy! theme or its official sound effects. You may use them under this project's license.

## Seed data
`prisma/seed.ts` (and every new account) gets the **Kava & Kratom** demo board: one category per
round, 5 clues each in Jeopardy and Double Jeopardy, plus Final Jeopardy (“The calming brain system
that kava affects” → *What is GABA?*).

## Legal
Jeopardy! is a trademark of Jeopardy Productions, Inc. This is an independent hobby project for
private games and is not affiliated with or endorsed by them.
