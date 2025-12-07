# Event Model & Redis Reference

This document organizes the Server-Sent Events (SSE) and Redis data structures used in the application, based on the implementation in `backend/app.py` and design in `docs/tech.md`.

## 1. Redis Data Structures

The application uses Redis for state storage, event streaming, and Pub/Sub.

| Key Pattern | Redis Type | Description |
| :--- | :--- | :--- |
| `session:{id}:recent` | List | Stores recent message history as JSON objects. Used for LLM context. |
| `session:{id}:summary` | Hash | Stores the current conversation summary (`text`, `updated_at`). |
| `session:{id}:facts` | List | Stores extracted facts (implemented in `SessionStore`). |
| `session:{id}:events` | Stream | **Work Queue**. Events pushed here are consumed by workers (Consumer Group). |
| `session:{id}:fanout` | Pub/Sub | **Real-time Bus**. Events published here are delivered to SSE clients. |
| `session:{id}:eventlog` | Stream | **Persistence**. Log of all published events for replay/debugging. |
| `sessions:known` | Set | Global index of all registered session IDs. |
| `lock:session:{id}` | String | Distributed lock to ensure sequential processing per session. |

## 2. SSE Events (Client-Facing)

These events are streamed to the frontend via `GET /api/stream?sessionId={id}`.

| Event Type (`type`) | Origin | Description | Key Payload Fields |
| :--- | :--- | :--- | :--- |
| `state:update` | System | Connection status updates (e.g., "connected"). | `status` |
| `user:msg` | API | Acknowledgment of a user message (echo). Acts as `message:ack`. | `messageId`, `text`, `author` |
| `agent:working` | Worker | Notification that an agent has started generating a response. | `agentId`, `agentName`, `inReplyTo` |
| `agent:msg` | Worker | The agent's complete response text. | `text`, `agentId`, `agentName`, `inReplyTo` |
| `agent:fail` | Worker | Error notification if an agent fails to generate a response. | `reason`, `message` |
| `state:error` | System | Critical system errors (e.g., Redis unavailable). | `reason` |

> **Note:** `docs/tech.md` mentions `message:delta` for streaming tokens, but the current `backend/app.py` implements full-text responses (`agent:msg`) without streaming (`stream=False`).

## 3. Internal Stream Events (Worker Queue)

These events are processed by the `EventWorker` from the `session:{id}:events` Redis Stream.

| Event Type | Triggered By | Description |
| :--- | :--- | :--- |
| `message:new` | `POST /api/message` | A new user message that requires LLM processing. |
| `agent:msg` | Worker | An agent response. The worker observes this to trigger the Summarizer agent (unless the author is the summarizer itself). |

## 4. Data Flow Summary

1. **User Message**: Frontend POSTs to `/api/message`.
2. **API**:
   - Saves to `session:{id}:recent`.
   - Publishes `user:msg` to `fanout` (SSE).
   - Adds `message:new` to `events` stream.
3. **Worker**:
   - Consumes `message:new`.
   - Acquires `lock:session:{id}`.
   - Publishes `agent:working` to `fanout` (SSE).
   - Calls LLM.
   - Publishes `agent:msg` to `fanout` (SSE) and saves to `recent`.
4. **Summarizer**:
   - Worker sees `agent:msg` in stream.
   - Triggers summarization logic.
   - Publishes `agent:working` (for summarizer).
   - Publishes `agent:msg` (summary text) to `fanout`.