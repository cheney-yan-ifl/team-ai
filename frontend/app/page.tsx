export default function HomePage() {
  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span className="pill">beta</span>
          <div>
            <div className="title">AI Team Workspace</div>
            <div className="subtitle">Primary + observers with live context</div>
          </div>
        </div>
        <div className="top-actions">
          <button className="ghost">New Topic</button>
          <button className="solid">Start session</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="panel left">
          <div className="section">
            <div className="section-title">Agents</div>
            <ul className="list">
              <li className="list-item active">
                <span className="badge primary">Primary</span>
                Nova (analysis)
              </li>
              <li className="list-item">
                <span className="badge observer">Observer</span>
                Scout (research)
              </li>
              <li className="list-item">
                <span className="badge observer">Observer</span>
                Sage (critic)
              </li>
            </ul>
          </div>

          <div className="section">
            <div className="section-title">Topics</div>
            <ul className="list">
              <li className="list-item">Launch brief · active</li>
              <li className="list-item">User research plan</li>
              <li className="list-item">Pricing discussion</li>
            </ul>
          </div>
        </aside>

        <section className="chat">
          <div className="banner">
            <div>
              <div className="eyebrow">Session overview</div>
              <div className="banner-title">Ideas for a calmer workspace launch</div>
              <p className="muted">
                Agents stream via SSE; messages and state updates are persisted in
                Redis and fanned out to this UI.
              </p>
            </div>
            <div className="chips">
              <span className="chip good">Stable</span>
              <span className="chip">3 agents online</span>
              <span className="chip">Redis connected</span>
            </div>
          </div>

          <div className="stream">
            <div className="bubble user">
              <div className="meta">
                <span className="author">You</span>
                <span className="timestamp">9:00</span>
              </div>
              <p>
                Draft a launch plan for the AI team workspace. Keep it calm, clear,
                and helpful.
              </p>
            </div>

            <div className="bubble agent">
              <div className="meta">
                <span className="author">Nova · Primary</span>
                <span className="timestamp">9:01</span>
              </div>
              <p>
                Starting a calm launch: align on positioning, set a concise FAQ,
                and keep the UI breathable. Pulling observer thoughts now.
              </p>
            </div>

            <div className="bubble agent ghosted">
              <div className="meta">
                <span className="author">Scout · Observer</span>
                <span className="tag">whisper</span>
              </div>
              <p>Recommending a short in-product walkthrough with SSE status.</p>
            </div>

            <div className="bubble agent">
              <div className="meta">
                <span className="author">Nova · Primary</span>
                <span className="timestamp">9:02</span>
              </div>
              <p>
                Got it—will propose a launch checklist and a light status rail to
                show agent activity.
              </p>
            </div>
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <div className="input">
              <textarea
                placeholder="Message the team... (@mentions and /commands soon)"
                rows={3}
              />
            </div>
            <div className="composer-actions">
              <span className="muted">SSE bridge: /api/stream?sessionId=...</span>
              <div className="buttons">
                <button className="ghost" type="button">
                  Attach
                </button>
                <button className="solid" type="submit">
                  Send
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside className="panel right">
          <div className="section">
            <div className="section-title">Summary</div>
            <p className="muted">
              Calm launch plan drafting. Primary is synthesizing; observers are
              whispering suggestions.
            </p>
          </div>

          <div className="section">
            <div className="section-title">Agent status</div>
            <ul className="list">
              <li className="list-item">
                <span className="dot good" /> Nova thinking
              </li>
              <li className="list-item">
                <span className="dot">Scout has feedback</span>
              </li>
              <li className="list-item">
                <span className="dot muted" /> Sage idle
              </li>
            </ul>
          </div>

          <div className="section">
            <div className="section-title">Timeline</div>
            <ul className="list">
              <li className="list-item">
                9:00 user message
              </li>
              <li className="list-item">
                9:01 primary reply
              </li>
              <li className="list-item">
                9:02 summary ping
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
