import importlib
import json
import os
import sys
import time
import uuid
from pathlib import Path

import fakeredis
import pytest

# Ensure the worker background thread does not start during tests
os.environ["WORKER_AUTOSTART"] = "0"
sys.path.append(str(Path(__file__).resolve().parents[2]))

app_module = importlib.import_module("backend.app")  # noqa: E402


@pytest.fixture
def test_ctx():
    fake = fakeredis.FakeRedis(decode_responses=True)
    app_module.store.set_client(fake)
    app_module.worker = app_module.EventWorker(
        app_module.store,
        app_module.llm,
        consumer_name=f"test-{uuid.uuid4().hex[:6]}",
    )
    fake.flushall()
    with app_module.app.test_client() as client:
        yield {"client": client, "redis": fake, "worker": app_module.worker}


def test_health_endpoint_reports_up(test_ctx):
    resp = test_ctx["client"].get("/api/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert data["redis"] == "up"


def test_post_message_appends_and_enqueues(test_ctx):
    session_id = "sess-post"
    resp = test_ctx["client"].post("/api/message", json={"sessionId": session_id, "text": "hello api"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True

    recent = test_ctx["redis"].lrange(app_module.session_recent_key(session_id), 0, -1)
    assert len(recent) == 1

    stream_entries = test_ctx["redis"].xrange(app_module.session_stream_key(session_id), min="-", max="+")
    assert len(stream_entries) == 1


def test_worker_processes_message_and_updates_state(test_ctx):
    session_id = "sess-worker"
    pubsub = test_ctx["redis"].pubsub()
    pubsub.subscribe(app_module.session_pubsub_channel(session_id))

    resp = test_ctx["client"].post("/api/message", json={"sessionId": session_id, "text": "hello worker"})
    assert resp.status_code == 200

    events = []
    saw_done = False
    saw_complete_state = False
    deadline = time.time() + 2
    while time.time() < deadline and not (saw_done and saw_complete_state):
        test_ctx["worker"].process_once()
        message = pubsub.get_message(timeout=0.05)
        if not message:
            continue
        if message["type"] != "message":
            continue
        payload = json.loads(message["data"])
        events.append(payload)
        if payload["type"] == "message:done":
            saw_done = True
        if payload.get("state") == "response_complete":
            saw_complete_state = True

    assert any(evt["type"] == "message:delta" for evt in events)
    assert any(evt["type"] == "message:done" for evt in events)
    assert any(evt.get("state") == "calling_api" for evt in events)
    assert any(evt.get("state") == "thinking" for evt in events)
    assert any(evt.get("state") == "responding" for evt in events)
    assert any(evt.get("state") == "response_complete" for evt in events)

    summary = test_ctx["redis"].hgetall(app_module.session_summary_key(session_id))
    assert "text" in summary and summary["text"]

    facts = test_ctx["redis"].lrange(app_module.session_facts_key(session_id), 0, -1)
    assert facts
