import json
import logging
import os
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional
import threading

import redis
import requests
from openai import OpenAI
from flask import Flask, Response, jsonify, request
from flask_cors import CORS


@dataclass
class AgentConfig:
    agent_id: str
    name: str
    role: str  # primary|observer|assistant
    model: str
    api_url: str
    api_key: str
    system_prompt: str = ""
    persona: str = ""

    def public(self) -> Dict[str, Any]:
        """Return a sanitized dict suitable for UI consumption."""
        return {
            "agentId": self.agent_id,
            "name": self.name,
            "role": self.role,
            "model": self.model,
            "apiUrl": self.api_url,
            "systemPrompt": self.system_prompt,
            "persona": self.persona,
        }


@dataclass
class Settings:
    redis_url: str = os.getenv("REDIS_URL", "redis://redis:19002/0")
    session_ttl_seconds: int = int(os.getenv("SESSION_TTL_SECONDS", "86400"))
    session_recent_limit: int = int(os.getenv("SESSION_RECENT_LIMIT", "50"))
    stream_group: str = os.getenv("STREAM_GROUP", "worker-group")
    worker_autostart: bool = os.getenv("WORKER_AUTOSTART", "1") == "1"
    worker_idle_sleep: float = float(os.getenv("WORKER_IDLE_SLEEP", "0.05"))
    primary_agent_id: str = os.getenv("PRIMARY_AGENT_ID", "primary")
    primary_agent_name: str = os.getenv("PRIMARY_AGENT_NAME", "Nova")
    primary_model: str = os.getenv("PRIMARY_MODEL", "gpt-4o-mini")
    primary_max_tokens: int = int(os.getenv("PRIMARY_MAX_TOKENS", "1200"))
    primary_reasoning_effort: str = os.getenv("PRIMARY_REASONING_EFFORT", "")
    observer1_id: str = os.getenv("OBSERVER1_ID", "scout")
    observer1_name: str = os.getenv("OBSERVER1_NAME", "Scout")
    observer1_model: str = os.getenv("OBSERVER1_MODEL", "gpt-4o-mini-research")
    observer2_id: str = os.getenv("OBSERVER2_ID", "sage")
    observer2_name: str = os.getenv("OBSERVER2_NAME", "Sage")
    observer2_model: str = os.getenv("OBSERVER2_MODEL", "gpt-4o-mini-critic")

    primary_api_url: str = os.getenv("PRIMARY_API_URL", "https://api.openai.com/v1")
    primary_api_key: str = os.getenv("PRIMARY_API_KEY", "")
    primary_system_prompt: str = os.getenv(
        "PRIMARY_SYSTEM_PROMPT",
        "You are Nova, the primary agent. Be concise, calm, and synthesize inputs from observers.",
    )
    primary_persona: str = os.getenv("PRIMARY_PERSONA", "Primary orchestrator with balanced tone.")

    observer1_api_url: str = os.getenv("OBSERVER1_API_URL", "https://api.openai.com/v1")
    observer1_api_key: str = os.getenv("OBSERVER1_API_KEY", "")
    observer1_system_prompt: str = os.getenv(
        "OBSERVER1_SYSTEM_PROMPT",
        "You are Scout, a research-focused observer. Provide sources, examples, and quick facts.",
    )
    observer1_persona: str = os.getenv("OBSERVER1_PERSONA", "Curious researcher, crisp bullets.")

    observer2_api_url: str = os.getenv("OBSERVER2_API_URL", "https://api.openai.com/v1")
    observer2_api_key: str = os.getenv("OBSERVER2_API_KEY", "")
    observer2_system_prompt: str = os.getenv(
        "OBSERVER2_SYSTEM_PROMPT",
        "You are Sage, a critical observer. Challenge assumptions and highlight risks briefly.",
    )
    observer2_persona: str = os.getenv("OBSERVER2_PERSONA", "Critical reviewer, terse and pointed.")

    summarizer_id: str = os.getenv("SUMMARIZER_ID", "summarizer")
    summarizer_name: str = os.getenv("SUMMARIZER_NAME", "Summarizer")
    summarizer_model: str = os.getenv("SUMMARIZER_MODEL", "gpt-4o-mini")
    summarizer_api_url: str = os.getenv("SUMMARIZER_API_URL", "https://api.openai.com/v1")
    summarizer_api_key: str = os.getenv("SUMMARIZER_API_KEY", "")
    summarizer_system_prompt: str = os.getenv(
        "SUMMARIZER_SYSTEM_PROMPT",
        "You are a summarizer agent. Generate concise summaries of conversations.",
    )
    summarizer_persona: str = os.getenv("SUMMARIZER_PERSONA", "Concise summarizer, factual and brief.")

    @property
    def observer_model(self) -> str:
        """Backward compatibility for older fields."""
        return self.observer1_model

    @property
    def agents(self) -> list[AgentConfig]:
        """Config list for future UI exposure and extensibility."""
        return [
            AgentConfig(
                agent_id=self.primary_agent_id,
                name=self.primary_agent_name,
                role="primary",
                model=self.primary_model,
                api_url=self.primary_api_url,
                api_key=self.primary_api_key,
                system_prompt=self.primary_system_prompt,
                persona=self.primary_persona,
            ),
            AgentConfig(
                agent_id=self.observer1_id,
                name=self.observer1_name,
                role="observer",
                model=self.observer1_model,
                api_url=self.observer1_api_url,
                api_key=self.observer1_api_key,
                system_prompt=self.observer1_system_prompt,
                persona=self.observer1_persona,
            ),
            AgentConfig(
                agent_id=self.observer2_id,
                name=self.observer2_name,
                role="observer",
                model=self.observer2_model,
                api_url=self.observer2_api_url,
                api_key=self.observer2_api_key,
                system_prompt=self.observer2_system_prompt,
                persona=self.observer2_persona,
            ),
            AgentConfig(
                agent_id=self.summarizer_id,
                name=self.summarizer_name,
                role="hidden_agent",
                model=self.summarizer_model,
                api_url=self.summarizer_api_url,
                api_key=self.summarizer_api_key,
                system_prompt=self.summarizer_system_prompt,
                persona=self.summarizer_persona,
            ),
        ]


def connect_redis(url: str) -> Optional[redis.Redis]:
    try:
        client = redis.Redis.from_url(url, decode_responses=True)
        client.ping()
        return client
    except Exception:
        return None


def session_stream_key(session_id: str) -> str:
    return f"session:{session_id}:events"


def session_event_log_key(session_id: str) -> str:
    return f"session:{session_id}:eventlog"


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
            session_event_log_key(session_id),
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

    def summary_text(self, session_id: str) -> str:
        if not self.redis:
            return ""
        key = session_summary_key(session_id)
        return self.redis.hget(key, "text") or ""

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
        encoded = json.dumps(payload)
        try:
            self.redis.publish(session_pubsub_channel(session_id), encoded)
        finally:
            # Also store in a per-session event log so reconnecting clients or debugging can replay.
            try:
                self.redis.xadd(
                    session_event_log_key(session_id),
                    {"data": encoded, "ts": time.time()},
                    maxlen=1000,
                    approximate=True,
                )
                self.expire_session(session_id)
            except Exception:
                # Logging should not block publish; swallow errors.
                pass

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


class PrimaryLLM:
    """OpenAI-compatible API client with 200-token response limit."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.client: Optional[OpenAI] = None
        if settings.primary_api_key and settings.primary_api_url:
            try:
                self.client = OpenAI(api_key=settings.primary_api_key, base_url=settings.primary_api_url)
            except Exception as exc:  # pragma: no cover - defensive
                app.logger.warning("Failed to init OpenAI client: %s", exc)
                self.client = None

    def _build_messages(self, prompt: str, history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Build chat-completions style messages with system + persona + mapped history + latest user prompt."""
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": self.settings.primary_system_prompt},
            {"role": "system", "content": self.settings.primary_persona},
        ]
        for msg in history:
            text = msg.get("text") or ""
            role = msg.get("role") or "user"
            api_role = "assistant" if role == "agent" else "user"
            messages.append({"role": api_role, "content": text})
        if not history or history[-1].get("text") != prompt:
            messages.append({"role": "user", "content": prompt})
        return messages

    def get_response(self, prompt: str, history: Optional[List[Dict[str, Any]]] = None) -> str:
        history = history or []
        model = self.settings.primary_model
        api_key = self.settings.primary_api_key
        api_url = self.settings.primary_api_url
        messages = self._build_messages(prompt, history)
        if not api_key or not api_url or not model or not self.client:
            return ""
        request_args: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.6,
            "max_tokens": 200,
            "stream": False,
        }
        try:
            resp = self.client.chat.completions.create(**request_args)
            if resp.choices:
                content = resp.choices[0].message.content or ""
                return content.strip()
            return ""
        except Exception as exc:
            extra = ""
            try:
                resp_obj = getattr(exc, "response", None)
                if resp_obj is not None:
                    extra = f" status={getattr(resp_obj, 'status_code', '?')} body={getattr(resp_obj, 'text', '')}"
            except Exception:
                extra = ""
            app.logger.error("Primary API call failed. Error: %s%s", exc, f" {extra}".rstrip())
            return ""

    def summarize(self, history: List[Dict[str, Any]]) -> str:
        """Placeholder for summary generation."""
        return ""

    def extract_fact(self, text: str) -> str:
        """Placeholder for fact extraction."""
        return ""


class SummarizerLLM:
    """OpenAI-compatible API client for summarizing conversations."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.client: Optional[OpenAI] = None
        if settings.summarizer_api_key and settings.summarizer_api_url:
            try:
                self.client = OpenAI(api_key=settings.summarizer_api_key, base_url=settings.summarizer_api_url)
            except Exception as exc:  # pragma: no cover - defensive
                app.logger.warning("Failed to init Summarizer OpenAI client: %s", exc)
                self.client = None

    def summarize(self, history: List[Dict[str, Any]]) -> str:
        """Summarize conversation history into 200 words."""
        if not self.client or not self.settings.summarizer_api_key:
            return ""

        # Build conversation text from history
        conversation_text = ""
        for msg in history:
            author = msg.get("author", "Unknown")
            text = msg.get("text", "")
            conversation_text += f"{author}: {text}\n\n"

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": self.settings.summarizer_system_prompt},
            {"role": "system", "content": self.settings.summarizer_persona},
            {
                "role": "user",
                "content": f"Please summarize this conversation in approximately 200 words:\n\n{conversation_text}",
            },
        ]

        request_args: Dict[str, Any] = {
            "model": self.settings.summarizer_model,
            "messages": messages,
            "temperature": 0.6,
            "max_tokens": 250,
            "stream": False,
        }
        try:
            resp = self.client.chat.completions.create(**request_args)
            if resp.choices:
                content = resp.choices[0].message.content or ""
                return content.strip()
            return ""
        except Exception as exc:
            app.logger.error("Summarizer API call failed. Error: %s", exc)
            return ""


class EventWorker:
    def __init__(self, store: SessionStore, llm: PrimaryLLM, summarizer: SummarizerLLM, consumer_name: Optional[str] = None):
        self.store = store
        self.llm = llm
        self.summarizer = summarizer
        self.consumer_name = consumer_name or f"worker-{uuid.uuid4().hex[:8]}"
        self.observer_configs = [agent for agent in store.settings.agents if agent.role == "observer"]
        self.observer_clients: Dict[str, Optional[OpenAI]] = {}
        self.observer_ids = {agent.agent_id for agent in self.observer_configs}

        for agent in self.observer_configs:
            if not agent.api_key or not agent.api_url:
                self.observer_clients[agent.agent_id] = None
                continue
            try:
                self.observer_clients[agent.agent_id] = OpenAI(api_key=agent.api_key, base_url=agent.api_url)
            except Exception as exc:
                app.logger.warning("Failed to init observer %s client: %s", agent.agent_id, exc)
                self.observer_clients[agent.agent_id] = None

    def _build_observer_messages(self, history: List[Dict[str, Any]], primary_text: str, agent: AgentConfig) -> List[Dict[str, Any]]:
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": agent.system_prompt},
            {"role": "system", "content": agent.persona},
        ]
        for msg in history:
            text = msg.get("text") or ""
            if not text:
                continue
            role = msg.get("role") or "user"
            api_role = "assistant" if role in ("agent", "observer") else "user"
            messages.append({"role": api_role, "content": text})
        messages.append(
            {
                "role": "user",
                "content": f"Primary agent just responded with:\n{primary_text}\n\nReact briefly with a helpful, concise observer note.",
            }
        )
        return messages

    def _run_observer(self, session_id: str, fields: Dict[str, Any], agent: AgentConfig) -> None:
        client = self.observer_clients.get(agent.agent_id)
        if not client:
            app.logger.debug("Observer %s skipped due to missing client", agent.agent_id)
            return

        primary_text = fields.get("text", "").strip()
        if not primary_text:
            return

        message_id = str(uuid.uuid4())
        in_reply_to = fields.get("messageId") or fields.get("message_id")

        self.store.publish_event(
            session_id,
            {
                "type": "agent:working",
                "messageId": message_id,
                "sessionId": session_id,
                "inReplyTo": in_reply_to,
                "agentId": agent.agent_id,
                "agentName": agent.name,
                "agentRole": agent.role,
            },
        )

        history = self.store.recent_messages(session_id)
        messages = self._build_observer_messages(history, primary_text, agent)
        request_args: Dict[str, Any] = {
            "model": agent.model,
            "messages": messages,
            "temperature": 0.5,
            "max_tokens": 200,
            "stream": False,
        }

        try:
            resp = client.chat.completions.create(**request_args)
            choice = resp.choices[0] if resp.choices else None
            text = (choice.message.content or "").strip() if choice else ""
        except Exception as exc:
            app.logger.warning("Observer %s API call failed: %s", agent.agent_id, exc)
            self.store.publish_event(
                session_id,
                {
                    "type": "agent:fail",
                    "messageId": message_id,
                    "sessionId": session_id,
                    "inReplyTo": in_reply_to,
                    "agentId": agent.agent_id,
                    "agentName": agent.name,
                    "agentRole": agent.role,
                    "reason": "api_error",
                    "message": "Failed to get response from observer API",
                },
            )
            return

        if not text:
            app.logger.info("Observer %s returned empty response", agent.agent_id)
            self.store.publish_event(
                session_id,
                {
                    "type": "agent:fail",
                    "messageId": message_id,
                    "sessionId": session_id,
                    "inReplyTo": in_reply_to,
                    "agentId": agent.agent_id,
                    "agentName": agent.name,
                    "agentRole": agent.role,
                    "reason": "empty_response",
                    "message": "Observer returned empty response",
                },
            )
            return

        payload = {
            "type": "agent:msg",
            "messageId": message_id,
            "sessionId": session_id,
            "author": f"agent:{agent.agent_id}",
            "agentId": agent.agent_id,
            "agentName": agent.name,
            "agentRole": agent.role,
            "text": text,
            "inReplyTo": in_reply_to,
        }
        self.store.publish_event(session_id, payload)

    def _handle_post_primary(self, session_id: str, fields: Dict[str, Any]) -> None:
        """Run summarizer and observers after primary reply without holding the session lock."""
        app.logger.info("Worker: Triggering summarizer for primary agent response")
        self._handle_summarize(session_id, fields)
        app.logger.info("Worker: Triggering observers for primary agent response")
        self._handle_observers(session_id, fields)

    def _handle_observers(self, session_id: str, fields: Dict[str, Any]) -> None:
        if not self.observer_configs:
            return

        for agent in self.observer_configs:
            self._run_observer(session_id, fields, agent)

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
            app.logger.debug(f"Worker: Processing message:new event from user")
            self._handle_new_message(session_id, fields)
        elif event_type == "agent:msg":
            # Trigger summarizer when agent responds (but not the summarizer itself)
            agent_id = fields.get("agentId") or (fields.get("author") and fields.get("author").split(":")[-1])
            app.logger.info(f"Worker: Detected agent:msg from {agent_id}")
            if agent_id == self.store.settings.primary_agent_id:
                app.logger.debug("Worker: Primary agent:msg already handled inline; skipping follow-on actions")
            elif agent_id == self.store.settings.summarizer_id:
                app.logger.debug("Worker: Skipping follow-on actions for summarizer message")
            elif agent_id in self.observer_ids:
                app.logger.debug("Worker: Received observer message; no further action")

    def _handle_new_message(self, session_id: str, fields: Dict[str, Any]) -> None:
        message_id = fields.get("message_id") or str(uuid.uuid4())
        author = fields.get("author", "user")
        text = fields.get("text", "")

        primary_agent_id = self.store.settings.primary_agent_id
        primary_agent_name = self.store.settings.primary_agent_name

        with self.store.session_lock(session_id) as locked:
            if not locked:
                self.store.publish_event(
                    session_id,
                    {"type": "state:error", "reason": "lock_timeout", "sessionId": session_id},
                )
                return

            agent_message_id = str(uuid.uuid4())

            # Signal that agent is working
            self.store.publish_event(
                session_id,
                {
                    "type": "agent:working",
                    "messageId": agent_message_id,
                    "sessionId": session_id,
                    "inReplyTo": message_id,
                    "agentId": primary_agent_id,
                    "agentName": primary_agent_name,
                    "agentRole": "primary",
                },
            )

            history = self.store.recent_messages(session_id)
            full_text = self.llm.get_response(text, history=history)

            # Check if API call failed
            if not full_text:
                fail_payload = {
                    "type": "agent:fail",
                    "messageId": agent_message_id,
                    "sessionId": session_id,
                    "inReplyTo": message_id,
                    "agentId": primary_agent_id,
                    "agentName": primary_agent_name,
                    "agentRole": "primary",
                    "reason": "api_error",
                    "message": "Failed to get response from API",
                }
                # Enqueue to stream so worker can detect failure
                self.store.enqueue_event(
                    session_id,
                    {
                        "type": "agent:fail",
                        "agentId": primary_agent_id,
                        "agentName": primary_agent_name,
                        "agentRole": "primary",
                        "messageId": agent_message_id,
                    },
                )
                self.store.publish_event(session_id, fail_payload)
                return

            # Send complete response
            done_payload = {
                "type": "agent:msg",
                "messageId": agent_message_id,
                "sessionId": session_id,
                "author": f"agent:{primary_agent_id}",
                "agentId": primary_agent_id,
                "agentName": primary_agent_name,
                "agentRole": "primary",
                "text": full_text.strip(),
                "inReplyTo": message_id,
            }

            # Store in recent messages BEFORE enqueuing event to avoid race condition
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

            # Enqueue to stream so worker can detect and trigger summarizer
            self.store.enqueue_event(
                session_id,
                {
                    "type": "agent:msg",
                    "agentId": primary_agent_id,
                    "agentName": primary_agent_name,
                    "agentRole": "primary",
                    "text": full_text.strip(),
                    "messageId": agent_message_id,
                },
            )
            # Publish to UI clients
            self.store.publish_event(session_id, done_payload)

        # Trigger summarizer and observers after releasing the lock
        self._handle_post_primary(session_id, done_payload)

    def _handle_summarize(self, session_id: str, fields: Dict[str, Any]) -> None:
        """Handle summarization when an agent message is received."""
        summarizer_id = self.store.settings.summarizer_id
        summarizer_name = self.store.settings.summarizer_name
        agent_id = fields.get("agentId", "unknown")

        app.logger.info(f"Summarizer: Detected agent:msg from {agent_id}, attempting to summarize")

        with self.store.session_lock(session_id) as locked:
            if not locked:
                app.logger.warning(f"Summarizer: Failed to acquire lock for session {session_id}")
                return

            message_id = fields.get("messageId") or str(uuid.uuid4())
            summary_message_id = str(uuid.uuid4())

            # Signal that summarizer is working
            app.logger.info(f"Summarizer: Publishing working event for session {session_id}")
            self.store.publish_event(
                session_id,
                {
                    "type": "agent:working",
                    "messageId": summary_message_id,
                    "sessionId": session_id,
                    "inReplyTo": message_id,
                    "agentId": summarizer_id,
                    "agentName": summarizer_name,
                    "agentRole": "hidden_agent",
                },
            )

            # Get conversation history and summarize
            history = self.store.recent_messages(session_id)
            app.logger.info(f"Summarizer: Got {len(history)} messages from history")
            summary_text = self.summarizer.summarize(history)
            app.logger.info(f"Summarizer: Generated summary of length {len(summary_text)}")

            # Check if summarization failed
            if not summary_text:
                app.logger.warning(f"Summarizer: Empty response for session {session_id}")
                return

            # Send summary as agent message
            summary_payload = {
                "type": "agent:msg",
                "messageId": summary_message_id,
                "sessionId": session_id,
                "author": f"agent:{summarizer_id}",
                "agentId": summarizer_id,
                "agentName": summarizer_name,
                "agentRole": "hidden_agent",
                "text": summary_text.strip(),
                "inReplyTo": message_id,
            }
            app.logger.info(f"Summarizer: Publishing summary for session {session_id}")
            self.store.publish_event(session_id, summary_payload)

            # Store in recent messages
            summary_message = {
                "messageId": summary_message_id,
                "sessionId": session_id,
                "author": summary_payload["author"],
                "role": "agent",
                "agentId": summarizer_id,
                "text": summary_text.strip(),
                "timestamp": time.time(),
            }
            self.store.append_recent(session_id, summary_message)
            app.logger.info(f"Summarizer: Completed for session {session_id}")

settings = Settings()
redis_client = connect_redis(settings.redis_url)
store = SessionStore(redis_client, settings)
llm = PrimaryLLM(settings)
summarizer = SummarizerLLM(settings)
worker = EventWorker(store, llm, summarizer)

app = Flask(__name__)
CORS(app)
app.logger.setLevel(logging.DEBUG)


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


@app.route("/api/agents", methods=["GET"])
def agents() -> Response:
    """Expose configured agents (sanitized) for the frontend UI."""
    payload = [agent.public() for agent in settings.agents]
    return jsonify({"agents": payload})


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
        "type": "user:msg",
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
    # Hydrate recent messages/summary to reduce perceived drops on reconnects.
    try:
        for msg in store.recent_messages(session_id):
            role = msg.get("role")
            if role == "user":
                payload = {
                    "type": "user:msg",
                    "messageId": msg.get("messageId"),
                    "sessionId": session_id,
                    "author": msg.get("author", "user"),
                    "text": msg.get("text", ""),
                }
            else:
                payload = {
                    "type": "agent:msg",
                    "messageId": msg.get("messageId"),
                    "sessionId": session_id,
                    "author": msg.get("author") or f"agent:{msg.get('agentId', 'agent')}",
                    "agentId": msg.get("agentId"),
                    "agentName": msg.get("agentName", settings.primary_agent_name),
                    "text": msg.get("text", ""),
                    "inReplyTo": msg.get("inReplyTo") or msg.get("in_reply_to"),
                }
            yield sse_format(json.dumps(payload))
    except Exception as exc:
        app.logger.debug("stream_events hydration failed: %s", exc)

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
    app.run(host="0.0.0.0", port=19001, debug=True)
