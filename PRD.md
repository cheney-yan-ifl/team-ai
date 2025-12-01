# Product Requirements Document (PRD)

## Project: Slack‑Like Multi‑Agent AI Chat Application

## Version: Draft v0.1

---

## 1. Overview

### 1.1 User Interface (UI) Overview

Moved to `ui.md` for clarity and to expand key screens (main workspace, right detail panel, state-driven interactions).

### 1.2 Text-Based UI Demonstration

(See `ui.md` for the updated three-pane layout and right detail panel notes.)

## 2. Core Use Cases
1. **User engages with a topic (channel) to chat with the primary AI agent.**
2. **User invites additional agents** to observe or contribute.
3. **Agents update and react to a shared session state** using the provided tool.
4. **User switches between agents, topics, and sessions** using a Slack‑like left‑side navigation.
5. **Agents coordinate, provide suggestions, or monitor progress** in a multi‑agent workspace.

---

## 3. Key Features
### 3.1 Slack‑Like Layout
- **Left sidebar** with:
  - User list (optional)
  - Agent list
  - Topic list (conversation threads)
- **Main chat area** with:
  - Message history
  - AI agent responses
  - Multi‑agent commentary/monitoring

### 3.2 Multi‑Agent Workflow
- One **primary agent** per topic
- Additional **observer agents** that:
  - Monitor the conversation
  - Provide suggestions
  - Trigger reactions based on status updates
  - Are optional depending on topic

### 3.3 Structured “Session State” System
- Integrated with external **status‑based reaction/response tool**
- Each conversation maintains a **session‑level state object**
- Agents and user actions trigger **state changes**, which then prompt:
  - Automated agent reactions
  - Workflow steps
  - UI updates

### 3.4 Topic & Session Management
- Users can create new topics
- Each topic maintains:
  - Associated agents
  - State
  - Message history
  - Metadata (title, description, purpose)

---

## 4. User Flows
### 4.1 Starting a Conversation
1. User selects an existing topic or creates a new one
2. Default primary agent joins the session
3. User begins messaging
4. State updates occur automatically

### 4.2 Inviting Agents
1. User opens agent list
2. Selects agent to invite
3. Agent joins as observer or contributor
4. State tool triggers new agent behaviors as appropriate

### 4.3 Session State Updates
1. User or agent action triggers state change
2. External tool processes new state
3. Agents respond according to rules
4. UI displays updated state and reactions

---

## 5. Technical Requirements
### 5.1 Frontend
- React/Next.js (recommended)
- Websocket or SSE for live updates
- Slack‑like layout components
- Message composer + agent controls

### 5.2 Backend
- Session manager
- Multi‑agent orchestration engine
- Integration layer for the **state‑reaction tool**
- Storage for:
  - Sessions
  - States
  - Messages
  - User and agent metadata

### 5.3 Agent Behavior
- Primary agent handles execution
- Observer agents:
  - Listen for state events
  - Provide feedback or improvements
  - Use configurable behavior roles

---

## 6. Integration With Status‑Reaction Tool
(To be expanded once the link and details are provided.)

Planned integration points:
- State schema mapping
- Trigger events
- Agent response pipeline
- UI feedback hooks

---

## 7. Initial Open Questions
1. What is the exact structure and API of the state‑based reaction tool?
2. How will topics be persisted and organized?
3. How many agents will be active in a typical session?
4. Do observer agents speak in the main chat or in a separate area?
5. Any constraints on latency or performance?

---

## 8. Next Steps
- Clarify external tool details
- Define agent roles and personalities
- Define full session state schema
- Finalize UI wireframes
- Expand PRD sections accordingly

```
