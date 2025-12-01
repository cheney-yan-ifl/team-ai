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

## 3. Open Items / Decisions
A. **AG UI Component Mapping:** Finalize which AG UI components map to nav, chat stream items, right-panel cards, and composer controls.
B. **State-Reaction Tool API:** Confirm schema and triggers to wire agent reactions and UI indicators.
C. **Transport Choice:** Pick SSE vs. WebSockets based on infra constraints.
D. **Auth and Persistence:** Define workspace/session persistence, user auth, and storage for messages/state/files.
E. **Testing Stack:** Decide on Jest/RTL for unit tests and Playwright/Cypress for E2E.
