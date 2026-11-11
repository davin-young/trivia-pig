# Jeppidy — plan, data model, socket schema

## Architecture

One long-lived Node process (`server.ts`) runs **Next.js (App Router)** request handling **and**
**Socket.IO** on the same port. No serverless anywhere: the process holds live game state in memory
and writes it through to Postgres after every action.

```
 phones (/play)  ──┐                 ┌── Postgres (Prisma): users, boards, games, action logs
 iPad   (/host)  ──┼─ Socket.IO ─┐   │
 TV     (/display)─┘             ▼   │
                           server.ts ┼── Storage: local ./uploads (dev) | S3/R2/MinIO (prod)
 browser (dashboard, ─ HTTP ─►  Next  │   media is streamed back through /media/:key so the
          builder)                    │   bucket never needs to be public
```

Deviations from the brief (all minor, no new infrastructure):
- **Postgres everywhere** (dev runs it via `docker compose up db`). Prisma can't switch provider by
  env var, and keeping one dialect avoids drift between dev and prod.
- **Media is proxied through the app** (`/media/<key>`) instead of handing out public bucket URLs,
  so homelab MinIO stays private behind the tunnel.
- **Own auth** (bcrypt + DB sessions + magic-link tokens) rather than NextAuth: the socket server
  needs to read the same session cookie, and pairing tokens are a custom flow anyway.

### Game engine: event-sourced
`src/engine` is pure TypeScript with no I/O.

- `GameState = replay(setup, actions.filter(a => !a.undone))`
- Every host/player action is appended to an **action log** with a server timestamp and any
  randomness already resolved (for example, random Daily Double placement is chosen when the round
  starts and stored in the action).
- **Undo any step**: mark that log entry `undone` and replay. Actions that no longer make sense
  after replay are ignored by the reducer, so replay is always total. Undo can itself be undone
  (redo).
- `views.ts` redacts state per audience: **host** gets everything. **Display** and **player** get
  clue text only once a clue is opened, answers only once revealed, and Final Jeopardy answers only
  once revealed. A player also sees their own FJ drawing. Answers never leave the server early.
- `effects.ts` maps action → sound/animation cues (sent to the display only, not replayed on undo).

## Data model (Prisma)

| Model | Key fields |
|---|---|
| `User` | email, passwordHash?, name, isAdmin, gameDefaults (Json) |
| `Session` | tokenHash, userId, expiresAt |
| `MagicLink` | tokenHash, email, expiresAt, usedAt |
| `Membership` | ownerId → memberId, role `COHOST`/`SCOREKEEPER` (invite by email) |
| `Invite` | ownerId, email, role, tokenHash |
| `Board` | ownerId, title, description, tags[], folder, content (Json, `BoardContent`), status `ACTIVE`/`ARCHIVED`/`TRASHED`, trashedAt, shareToken?, shareMode `VIEW`/`COPY` |
| `BoardVersion` | boardId, content, title, createdAt, label |
| `Media` | ownerId, key, mime, size, filename |
| `Game` | code (5 chars, unique while active), ownerId, boardId, status `LOBBY`/`ACTIVE`/`FINISHED`, settings (Json), boardSnapshot (Json), actions (Json[] log), state (Json cache), finishedAt, rematchOfId |
| `GamePlayer` | gameId, playerId (public), tokenHash (reconnect secret), name, signature (Json strokes), teamId, banned |
| `PairingToken` | tokenHash, gameId, userId, role `HOST`/`COHOST`/`SCOREKEEPER`, expiresAt (5 min), usedAt |
| `HostGrant` | tokenHash, gameId, role, expiresAt (game-scoped host cookie issued by pairing) |

`BoardContent` (zod `boardContentSchema`):
```ts
{ rounds: [
    { kind: "single" | "double", name, values: number[],
      categories: [{ id, name, clues: [{ id, text, answer, media?, answerMedia?, dailyDouble }] }] },
  ],
  final?: { category, text, answer, media?, answerMedia? } }
media = { type: "image" | "video" | "audio" | "youtube", url }
```

Strokes (`src/shared/strokes.ts`): `{ v: 1, w, h, strokes: [{ c: "#hex"|"rainbow", s: size, fx?: "glow", p: [x,y,pressure][] }] }`
with hard caps (300 strokes, 1,500 points per stroke, 30k points total, ~200 KB serialized).
The eraser removes whole strokes it touches, so the saved data stays plain vector strokes.

## Socket event schema (all payloads validated with zod, `src/shared/protocol.ts`)

Handshake `auth`: `{ role: "display" | "host" | "player", code, playerToken? }`.
Host identity comes from the session cookie or a `HostGrant` cookie, never from the payload.

Client → server
| Event | Who | Payload |
|---|---|---|
| `player:join` | player | `{ name, signature?, teamId? }` → ack `{ playerId, playerToken }` |
| `player:signature` | player | `{ signature }` (lobby redraw) |
| `player:buzz` | player | `{}` |
| `player:wager` | player | `{ amount }` (Daily Double is host-entered; FJ is player-entered) |
| `player:final` | player | `{ drawing }` |
| `host:action` | host/cohost/scorekeeper | `{ action: HostAction }` (discriminated union, ~45 types) |
| `host:undo` / `host:redo` | host | `{ seq }` |
| `host:sound` | host | `{ id }` soundboard |
| `presence:ping` | all | `{}` |

Server → client
| Event | To | Payload |
|---|---|---|
| `state` | each socket | redacted `GameView` for that audience |
| `fx` | display (+ buzzing player) | `{ cue, playerId? }` sound/animation cues |
| `presence` | host + display | `{ display, hosts, players: { id: online/reconnecting/offline } }` |
| `kicked` / `redirect` | player(s) | reason / new game code (rematch) |
| `error` | sender | `{ message }` |

Rate limits: a token bucket per socket (20 msg/s burst, 10/s sustained), buzz debounce,
signature/final uploads at most 1 per 2 s, and a 256 KB `maxHttpBufferSize`.

## Build order
data model → engine (+tests) → socket/auth/pairing → host → display → player → lobby/mgmt →
sound → Final Jeopardy → builder → media → dashboard/history/post-game → roles/sharing → deploy
(Docker, Fly.io, homelab via Cloudflare Tunnel for triviapig.lol).
