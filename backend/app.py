import json
import os
import time
import uuid
from typing import Iterable

import redis
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "86400"))

try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
except Exception as exc:  # pragma: no cover - defensive in case Redis is unavailable
    app.logger.warning("Redis connection failed: %s", exc)
    redis_client = None


def session_stream_key(session_id: str) -> str:
    return f"session:{session_id}:events"


def session_pubsub_channel(session_id: str) -> str:
    return f"session:{session_id}:fanout"


def sse_format(data: str) -> str:
    return f"data: {data}\n\n"


def publish_event(session_id: str, payload: dict) -> None:
    if not redis_client:
        app.logger.info("Redis offline, skipping publish: %s", payload)
        return
    redis_client.publish(session_pubsub_channel(session_id), json.dumps(payload))


@app.route("/api/health", methods=["GET"])
def health() -> Response:
    redis_ok = False
    if redis_client:
        try:
            redis_ok = bool(redis_client.ping())
        except Exception:
            redis_ok = False
    status = {"status": "ok", "redis": "up" if redis_ok else "down"}
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

    message_payload = {
        "messageId": message_id,
        "sessionId": session_id,
        "author": author,
        "text": text,
        "type": "message:ack",
    }

    if redis_client:
        redis_client.xadd(
            session_stream_key(session_id),
            {
                "message_id": message_id,
                "author": author,
                "text": text,
                "type": "message:new",
            },
        )
        redis_client.expire(session_stream_key(session_id), SESSION_TTL_SECONDS)
    publish_event(session_id, message_payload)
    return jsonify({"ok": True, "messageId": message_id})


def stream_events(session_id: str) -> Iterable[str]:
    if not redis_client:
        yield sse_format(
            json.dumps({"type": "state:error", "reason": "redis_down"})
        )
        return

    pubsub = redis_client.pubsub()
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
