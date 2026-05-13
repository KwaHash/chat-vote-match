# Web Socket Chat Server

Express + WebSocket (`ws`) backend for chat between **assistants** and **candidates**. REST endpoints handle conversations and messages; the WebSocket hub pushes new messages to participants in real time. MySQL stores conversations and messages; `assistants` and `candidates` tables are used for JWT-backed auth.

## Setup

```bash
npm install
```

Create a `.env` file (see [Environment variables](#environment-variables)). The app creates `chat_conversations` and `chat_messages` on first DB use if they do not exist. Your database must already define **`assistants`** and **`candidates`** with at least `id`, `email`, and `username` (see queries in `src/db.js`).

```bash
npm run dev    # tsx watch — hot reload
npm start      # tsx — single run
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (required in current code) |
| `CORS_ORIGINS` | Comma-separated allowed browser origins (e.g. `https://app.example.com`) |
| `DB_HOST` | MySQL host |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | MySQL database name |
| `ACCESS_TOKEN_SECRET` | Secret for verifying JWT access tokens (defaults to a dev placeholder if unset — **set this in production**) |

JWT payloads must include `user_id` (and are verified against `assistants` or `candidates` by role).

## HTTP API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | `{ "ok": true }` — no auth |
| GET | `/socket/conversations?role=assistant` or `role=candidate` | `Authorization: Bearer <token>` |
| POST | `/socket/conversations` | Body: `{ "participantId": <number> }` — other party’s user id |
| GET | `/socket/conversations/:conversationId/messages?role=...` | Paginated/history shape from `listMessages` |
| POST | `/socket/conversations/:conversationId/messages?role=...` | Body: `{ "content": "..." }` — also triggers WS broadcast |

All `/socket/*` routes require `role` as a query parameter (`assistant` or `candidate`) and a valid Bearer token.

## WebSocket

- **URL:** same host and port as HTTP, path **`/ws`** (e.g. `ws://localhost:8080/ws`; use `wss://` when the site is served over HTTPS).
- Messages are JSON text frames.

**Client → server**

1. `{ "type": "auth", "accessToken": "<jwt>", "role": "assistant" | "candidate" }` — do this first.
2. Optionally `{ "type": "join", "conversationId": <number> }` to subscribe to a room (server replies `joined`).
3. `{ "type": "message", "conversationId": <number>, "content": "..." }` to send a message (also persisted and broadcast).

**Server → client**

- `auth_ok`, `joined`, `error`, and `message` (payload includes the saved `ChatMessage`).

## Project layout

- `src/index.ts` — HTTP server, CORS, routes, WebSocket attach
- `src/routes.ts` — REST API under `/socket`
- `src/ws.ts` — WebSocket auth, join, send, broadcast
- `src/db.ts` — MySQL pool, schema bootstrap for chat tables, queries
- `src/auth.ts` — JWT verification
