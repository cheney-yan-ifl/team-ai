# Technical Architecture Guide (TAG)

Extracted from PRD technical notes and extended with UI/tooling direction.

## 1. Core Tools
A. **AG UI Components:** Use the AG UI kit (`https://docs.ag-ui.com/introduction`) as the primary component library for building the Slack-like workspace. Leverage its theming, layout primitives, form inputs, tables/lists, overlays, and responsive utilities. Prefer composable components and avoid custom recreations where AG UI provides a fit.
B. **React/Next.js:** Recommended app framework for routing, server-rendered pages, and API routes. Pair with SSR/SWR for real-time-ish data hydration.
C. **Realtime Transport:** Server-Sent Events (SSE) or WebSockets for live chat updates, agent activity indicators, and state-change events.
D. **Markdown Rendering:** Live markdown preview/render for messages, agent outputs, and system events.
E. **State/Agent Orchestration:** Session manager + multi-agent orchestrator (primary + observers), with hooks to a state-reaction tool (pending details).

## 2. UI/UX Style & Interaction
A. **Modern, Light Feel:** Aim for the clarity and lightness of ChatGPT: minimal chrome, breathable spacing, and focused content areas.
B. **Responsive:** Ensure layouts adapt to desktop/tablet/mobile; collapse sidebars intelligently and preserve key indicators.
C. **Motion Placeholders:** Use tasteful skeletons/placeholders during agent thinking or loading states.
D. **Mentions & Commands:** Support `@agent` mentions and simple slash commands; keep autocomplete fast and unobtrusive.
E. **Agent Visibility:** Clear differentiation between primary replies and observer feedback; allow whisper vs. loud modes.
F. **Files & Tasks:** Keep attachments/tasks discoverable in the right detail panel; link back to chat references.

## 3. Modern Chat Patterns (ChatGPT/Claude/Perplexity-inspired)
A. **Streaming & Latency:** Stream tokens via SSE/WebSockets; render incrementally with a sticky caret. Use optimistic UI for user sends and show a micro “thinking” pulse when the model is idle to keep perceived latency low.
B. **Progressive Disclosure:** Start with concise replies; provide inline “expand details”/“show reasoning” affordances. Keep system/meta info tucked behind disclosure chips so the thread stays airy.
C. **Placeholders & Continuations:** Mirror ChatGPT’s skeleton rows for incoming messages, then swap in text. Support “continue”/“regenerate” per message and “insert at cursor” for edits.
D. **Side Context:** Keep a collapsible right rail for sources/files/tasks. Show citations inline (e.g., numbered badges) with hover/expand behavior like Perplexity.
E. **Composer Polish:** Multi-line composer with `Shift+Enter` newline, `Cmd+Enter` send, mention autocomplete, quick-attach for files, and inline code fences with live preview.
F. **Voice In/Out:** Add Web Speech API (or native recorder) for capture with push-to-talk, VAD to auto-stop, and live waveform. Stream TTS playback with a low-latency engine; keep text and audio in sync with sentence/word highlights.
G. **Session Continuity:** Persist draft input, scroll position, and playback state. Use chat history prefetch on load to feel instant (like ChatGPT’s session resume).

## 4. Technical Decisions (locked)
A. **Transport:** Use SSE for streaming and presence; Redis backs fan-out and transient state.
B. **Backend shape:** Next.js app with stateless API routes; Redis KV keyed by session UUID. No additional DB, no user management, no history management beyond Redis.
C. **Auth/session:** Anonymous, single-tenant for now. Session tracked solely by `sessionId` UUID.
D. **Persistence:** In-memory via Redis only (messages/agent state/files), assuming everything fits in Redis; no separate durable storage yet.
E. **Agents/LLM routing:** Agents are preconfigured at startup with their model/provider settings (primary + observers + organizer). No user-defined agents at runtime in v1.
F. **UI theming:** Use AG UI kit with labeled interface; support light/dark switchable themes.
G. **Right panel contents:** Include current summary, TODO list (open questions), decisions, timeline, and agent status.
H. **Deployment:** Run locally via docker-compose for now.
I. **Attachments:** Out of scope for v1.
J. **Testing/Telemetry:** Not considered for v1 (no Jest/RTL/Playwright/Cypress setup; no analytics pipeline).
K. **Voice:** Text-only for v1; no voice input/output.
L. **AG UI mapping:** Use AG UI layout/components with light customization for chat bubble rendering.
M. **Composer scope:** Start with plain text plus mentions only.
N. **Agent catalog:** Fixed roles to start; no dynamic adjustment during a session.
O. **Coordinator agent:** Coordinator only provides live summaries; no other actions.
P. **State-reaction events:** Minimal set (message authored, agent wants to speak, summary updated).

## 5. Open questions
A. **Promotion/whisper rules:** When promoting an observer to primary, do past messages get relabeled? How does whisper → loud affect already-hidden messages?
B. **Tasks/artifacts model:** What should “tasks/artifacts” capture in v1 (message-linked TODOs, tool-run metadata, other)?
C. **History UX:** How should chat history surface—as a simple list or a richer artifact/app that can explain itself?
D. **Coordinator extensions:** Beyond live summaries, what future responsibilities should the coordinator take on?
