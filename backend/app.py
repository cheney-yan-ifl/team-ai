import json
import os
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional
import threading

import redis
from flask import Flask, Response, jsonify, request
from flask_cors import CORS


@dataclass
class Settings:
    redis_url: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    session_ttl_seconds: int = int(os.getenv("SESSION_TTL_SECONDS", "86400"))
    session_recent_limit: int = int(os.getenv("SESSION_RECENT_LIMIT", "50"))
    stream_group: str = os.getenv("STREAM_GROUP", "worker-group")
    worker_autostart: bool = os.getenv("WORKER_AUTOSTART", "1") == "1"
    worker_idle_sleep: float = float(os.getenv("WORKER_IDLE_SLEEP", "0.05"))
    primary_agent_id: str = os.getenv("PRIMARY_AGENT_ID", "primary")
    primary_agent_name: str = os.getenv("PRIMARY_AGENT_NAME", "Nova")
    primary_model: str = os.getenv("PRIMARY_MODEL", "mock-primary")
    observer_model: str = os.getenv("OBSERVER_MODEL", "mock-observer")


def connect_redis(url: str) -> Optional[redis.Redis]:
    try:
        client = redis.Redis.from_url(url, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


def session_stream_key(session_id: str) -> str:
    return f"session:{session_id}:events"


def session_pubsub_channel(session_id: str) -> str:
    return f"session:{session_id}:fanout"


def session_recent_key(session_id: str) -> str:
    return f"session:{session_id}:recent"


def session_summary_key(session_id: str) -> str:
    return f"session:{session_id}:summary"


def session_facts_key(session_id: str) -> str:
    return f"session:{session_id}:facts"


def session_index_key() -> str:
    return "sessions:known"


def session_lock_key(session_id: str) -> str:
    return f"lock:session:{session_id}"


def sse_format(data: str) -> str:
    return f"data: {data}\n\n"


class SessionStore:
    def __init__(self, redis_client: Optional[redis.Redis], settings: Settings):
        self.redis = redis_client
        self.settings = settings

    def set_client(self, redis_client: redis.Redis) -> None:
        self.redis = redis_client

    def expire_session(self, session_id: str) -> None:
        if not self.redis:
            return
        ttl = self.settings.session_ttl_seconds
        for key in [
            session_recent_key(session_id),
            session_summary_key(session_id),
            session_facts_key(session_id),
            session_stream_key(session_id),
        ]:
            try:
                self.redis.expire(key, ttl)
            except Exception:
                continue

    def register_session(self, session_id: str) -> None:
        if not self.redis:
            return
        try:
            self.redis.sadd(session_index_key(), session_id)
        finally:
            self.expire_session(session_id)

    def ensure_group(self, session_id: str) -> None:
        if not self.redis:
            return
        stream = session_stream_key(session_id)
        try:
            self.redis.xgroup_create(stream, self.settings.stream_group, id="0", mkstream=True)
        except redis.exceptions.ResponseError:
            # Group already exists; ignore
            pass

    def enqueue_event(self, session_id: str, payload: Dict[str, Any]) -> Optional[str]:
        if not self.redis:
            return None
        stream = session_stream_key(session_id)
        entry_id = self.redis.xadd(stream, payload, maxlen=500, approximate=True)
        self.ensure_group(session_id)
        self.expire_session(session_id)
        return entry_id

    def append_recent(self, session_id: str, message: Dict[str, Any]) -> None:
        if not self.redis:
            return
        key = session_recent_key(session_id)
        self.redis.rpush(key, json.dumps(message))
        self.redis.ltrim(key, -self.settings.session_recent_limit, -1)
        self.expire_session(session_id)

    def update_summary(self, session_id: str, summary: str) -> None:
        if not self.redis:
            return
        key = session_summary_key(session_id)
        self.redis.hset(key, mapping={"text": summary, "updated_at": time.time()})
        self.expire_session(session_id)

    def add_fact(self, session_id: str, fact: str) -> None:
        if not self.redis:
            return
        key = session_facts_key(session_id)
        self.redis.lpush(key, fact)
        self.redis.ltrim(key, 0, self.settings.session_recent_limit)
        self.expire_session(session_id)

    def publish_event(self, session_id: str, payload: Dict[str, Any]) -> None:
        if not self.redis:
            return
        self.redis.publish(session_pubsub_channel(session_id), json.dumps(payload))

    def recent_messages(self, session_id: str) -> List[Dict[str, Any]]:
        if not self.redis:
            return []
        values = self.redis.lrange(session_recent_key(session_id), 0, -1)
        return [json.loads(v) for v in values]

    def known_sessions(self) -> List[str]:
        if not self.redis:
            return []
        return list(self.redis.smembers(session_index_key()))

    @contextmanager
    def session_lock(self, session_id: str, timeout: int = 30):
        if not self.redis:
            yield False
            return
        lock = self.redis.lock(session_lock_key(session_id), timeout=timeout, blocking_timeout=1.5)
        acquired = False
        try:
            acquired = lock.acquire(blocking=True)
            yield acquired
        finally:
            if acquired:
                lock.release()


class MockLLM:
    def __init__(self, settings: Settings):
        self.settings = settings

    def stream_response(self, prompt: str) -> Iterable[str]:
        response = f"Primary [{self.settings.primary_model}] reply: {prompt}"
        for token in response.split():
            yield token + " "

    def summarize(self, history: List[Dict[str, Any]]) -> str:
        if not history:
            return "No messages yet."
        latest = history[-1].get("text", "")
        return f"Session summary: last message noted '{latest[:60]}'"

    def extract_fact(self, text: str) -> str:
        return f"Fact: user asked '{text[:40]}'"


class EventWorker:
    def __init__(self, store: SessionStore, llm: MockLLM, consumer_name: Optional[str] = None):
        self.store = store
        self.llm = llm
        self.consumer_name = consumer_name or f"worker-{uuid.uuid4().hex[:8]}"

    def _stream_map(self) -> Dict[str, str]:
        streams = {}
        for session_id in self.store.known_sessions():
            streams[session_stream_key(session_id)] = ">"
        return streams

    def process_once(self) -> bool:
        if not self.store.redis:
            return False
        streams = self._stream_map()
        if not streams:
            return False
        try:
            results = self.store.redis.xreadgroup(
                self.store.settings.stream_group,
                self.consumer_name,
                streams,
                count=1,
                block=50,
            )
        except redis.exceptions.ResponseError:
            # Ensure groups exist then retry later
            for stream_name in streams:
                session_id = stream_name.split(":")[1]
                self.store.ensure_group(session_id)
            return False

        handled = False
        for stream_name, entries in results:
            session_id = stream_name.split(":")[1]
            for entry_id, fields in entries:
                handled = True
                try:
                    self._handle_event(session_id, stream_name, entry_id, fields)
                except Exception as exc:
                    error_payload = {
                        "type": "message:error",
                        "sessionId": session_id,
                        "reason": "worker_failure",
                        "details": str(exc),
                    }
                    self.store.publish_event(session_id, error_payload)
                finally:
                    self.store.redis.xack(stream_name, self.store.settings.stream_group, entry_id)
        return handled

    def _handle_event(self, session_id: str, stream_name: str, entry_id: str, fields: Dict[str, Any]) -> None:
        event_type = fields.get("type")
        if event_type == "message:new":
            self._handle_new_message(session_id, fields)

    def _handle_new_message(self, session_id: str, fields: Dict[str, Any]) -> None:
        message_id = fields.get("message_id") or str(uuid.uuid4())
        author = fields.get("author", "user")
        text = fields.get("text", "")

        with self.store.session_lock(session_id) as locked:
            if not locked:
                self.store.publish_event(
                    session_id,
                    {"type": "state:error", "reason": "lock_timeout", "sessionId": session_id},
                )
                return

            agent_message_id = str(uuid.uuid4())
            self.store.publish_event(
                session_id,
                {
                    "type": "state:update",
                    "sessionId": session_id,
                    "status": "processing",
                    "messageId": message_id,
                },
            )

            full_text = ""
            for idx, delta in enumerate(self.llm.stream_response(text)):
                full_text += delta
                self.store.publish_event(
                    session_id,
                    {
                        "type": "message:delta",
                        "messageId": agent_message_id,
                        "sessionId": session_id,
                        "author": f"agent:{self.store.settings.primary_agent_id}",
                        "agentId": self.store.settings.primary_agent_id,
                        "agentName": self.store.settings.primary_agent_name,
                        "delta": delta,
                        "index": idx,
                    },
                )

            done_payload = {
                "type": "message:done",
                "messageId": agent_message_id,
                "sessionId": session_id,
                "author": f"agent:{self.store.settings.primary_agent_id}",
                "agentId": self.store.settings.primary_agent_id,
                "agentName": self.store.settings.primary_agent_name,
                "text": full_text.strip(),
                "inReplyTo": message_id,
            }
            self.store.publish_event(session_id, done_payload)

            agent_message = {
                "messageId": agent_message_id,
                "sessionId": session_id,
                "author": done_payload["author"],
                "role": "agent",
                "agentId": self.store.settings.primary_agent_id,
                "text": full_text.strip(),
                "timestamp": time.time(),
            }
            self.store.append_recent(session_id, agent_message)

            summary_text = self.llm.summarize(self.store.recent_messages(session_id))
            self.store.update_summary(session_id, summary_text)
            self.store.publish_event(
                session_id,
                {
                    "type": "state:update",
                    "sessionId": session_id,
                    "state": "summary",
                    "summary": summary_text,
                },
            )
            if text:
                self.store.add_fact(session_id, self.llm.extract_fact(text))


settings = Settings()
redis_client = connect_redis(settings.redis_url)
store = SessionStore(redis_client, settings)
llm = MockLLM(settings)
worker = EventWorker(store, llm)

app = Flask(__name__)
CORS(app)


@app.route("/api/health", methods=["GET"])
def health() -> Response:
    redis_ok = False
    if store.redis:
        try:
            redis_ok = bool(store.redis.ping())
        except Exception:
            redis_ok = False
    status = {
        "status": "ok",
        "redis": "up" if redis_ok else "down",
        "primaryModel": settings.primary_model,
        "observerModel": settings.observer_model,
    }
    return jsonify(status)


@app.route("/api/message", methods=["POST"])
def post_message() -> Response:
    body = request.get_json(force=True, silent=True) or {}
    session_id = body.get("sessionId") or body.get("session_id")
    text = (body.get("text") or "").strip()
    author = body.get("author", "user")
    message_id = body.get("messageId") or str(uuid.uuid4())

    if not session_id or not text:
        return jsonify({"error": "sessionId and text are required"}), 400

    if not store.redis:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": "redis_down",
                    "message": "Redis unavailable; cannot accept message.",
                }
            ),
            503,
        )

    store.register_session(session_id)
    store.ensure_group(session_id)

    user_message = {
        "messageId": message_id,
        "sessionId": session_id,
        "author": author,
        "role": "user",
        "text": text,
        "timestamp": time.time(),
    }
    store.append_recent(session_id, user_message)

    ack_payload = {
        "messageId": message_id,
        "sessionId": session_id,
        "author": author,
        "text": text,
        "type": "message:ack",
    }
    store.publish_event(session_id, ack_payload)

    store.enqueue_event(
        session_id,
        {
            "message_id": message_id,
            "author": author,
            "text": text,
            "type": "message:new",
        },
    )

    return jsonify({"ok": True, "messageId": message_id})


def stream_events(session_id: str) -> Iterable[str]:
    if not store.redis:
        yield sse_format(json.dumps({"type": "state:error", "reason": "redis_down"}))
        return

    pubsub = store.redis.pubsub()
    pubsub.subscribe(session_pubsub_channel(session_id))
    yield sse_format(json.dumps({"type": "state:update", "status": "connected"}))

    last_ping = time.time()
    try:
        for message in pubsub.listen():
            if message["type"] != "message":
                continue
            yield sse_format(message["data"])
            now = time.time()
            if now - last_ping > 10:
                yield ": ping\n\n"
                last_ping = now
    finally:
        pubsub.close()


@app.route("/api/stream", methods=["GET"])
def stream() -> Response:
    session_id = request.args.get("sessionId")
    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400
    return Response(
        stream_events(session_id),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def start_worker_thread() -> Optional[threading.Thread]:
    if not settings.worker_autostart:
        return None

    def _loop() -> None:
        while True:
            handled = False
            try:
                handled = worker.process_once()
            except Exception as exc:  # pragma: no cover - defensive logging
                app.logger.error("Worker loop error: %s", exc)
            if not handled:
                time.sleep(settings.worker_idle_sleep)

    thread = threading.Thread(target=_loop, daemon=True, name="worker-loop")
    thread.start()
    return thread


worker_thread = start_worker_thread()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
