# Implementation Plan (Frontend + Backend + Docker Compose)

## 1) Infrastructure & Repo Setup
- [ ] Create Next.js frontend (AG UI) app scaffold.
- [ ] Create Flask backend service scaffold.
- [ ] Add shared env config (.env.example) for API URLs, Redis.
- [ ] Add Docker Compose with services: frontend, backend, Redis.
- [ ] Configure Makefile/scripts for `docker-compose up` and local dev.

## 2) Backend (Flask + Redis + SSE)
- [ ] Dependency setup (Flask, Redis client, SSE support, CORS).
- [ ] Env/config loader (session TTL, Redis URL, model keys placeholders).
- [ ] Data model in Redis: `session:{id}:recent`, `session:{id}:summary`, `session:{id}:facts`.
- [ ] Event streams: Redis Stream `session:{id}:events` (worker group) and Pub/Sub `session:{id}:fanout` (UI).
- [ ] API: `POST /api/message` to accept user messages, append to Redis, publish `message:ack` + enqueue `message:new`.
- [ ] SSE: `GET /api/stream?sessionId=` bridge from `fanout` to EventSource clients.
- [ ] Worker/orchestrator: consume `events`, per-session lock, call LLM (placeholder), publish `message:delta/done/state:update`, update Redis.
- [ ] Error handling/events: `message:error`/`state:error` for UI display.
- [ ] Dockerfile for backend.

## 3) Frontend (Next.js + AG UI)
- [ ] Install AG UI and set up theming (light/dark).
- [ ] Global SSE hook/provider to connect to `/api/stream`.
- [ ] State store keyed by `messageId`, `agentId`, `sessionId` (messages, agent status, summary/TODO/decisions).
- [ ] UI shells: three-pane layout (left agents/topics, center chat + composer, right detail rail).
- [ ] Components: chat list with streaming bubbles; composer (plain text + mentions); right rail cards (summary, TODOs, decisions, timeline, agent status).
- [ ] Wire SSE events (`message:ack/delta/done`, `state:update/error`) into UI.
- [ ] Send flow: POST to `/api/message`, optimistic bubble.
- [ ] Error UI: toasts/alerts for `message:error`, connection loss indicators.
- [ ] Dockerfile for frontend.

## 4) Docker Compose & Local Run
- [ ] Compose file wiring backend, frontend, Redis; shared network; env injection.
- [ ] Healthchecks for services.
- [ ] Single command `docker-compose up` brings up full stack.

## 5) Validation
- [ ] Manual happy path: open UI, send message, see streaming primary response.
- [ ] Observer whisper surface/dismiss flows.
- [ ] Right rail updates on `state:update` (summary/TODO/decisions).
- [ ] Restart stack with persistent Redis volume (or note in-memory only).

## 6) Follow-ups (optional after v1)
- [ ] Define promotion/whisper rules.
- [ ] Clarify tasks/artifacts model.
- [ ] History UX beyond simple list.
- [ ] Coordinator extensions.
