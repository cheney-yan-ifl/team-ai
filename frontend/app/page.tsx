"use client";

import { useState, useEffect, useRef } from 'react';
import { checkHealth, sendMessage, generateSessionId, HealthStatus } from '../lib/api';
import { SSEProvider, useSSE } from '../lib/sse';

interface ChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  type: 'user' | 'agent';
}

type AgentState = {
  working: boolean;
  flash: boolean;
  name: string;
  role: string;
};

export default function HomePage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({
    primary: { working: false, flash: false, name: 'Nova', role: 'Primary' },
    observer1: { working: false, flash: false, name: 'Scout', role: 'Observer' },
    observer2: { working: false, flash: false, name: 'Sage', role: 'Observer' },
  });
  const [pendingMessageIds, setPendingMessageIds] = useState<Set<string>>(new Set());
  const [sentMessageIds, setSentMessageIds] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef<boolean>(true);

  const focusComposer = () => {
    const el = textareaRef.current;
    if (!el) return;
    const len = el.value.length;
    el.focus();
    try {
      el.setSelectionRange(len, len);
    } catch {
      // ignore selection issues on some browsers
    }
  };

  const colors = theme === 'dark'
    ? {
        background: '#0f1115',
        surface: '#161a1f',
        border: '#262c33',
        text: '#e5e7eb',
        muted: '#9ca3af',
        badgeBg: '#111827',
        badgeBorder: '#1f2937',
        primary: '#4da3ff',
        success: '#4ade80',
        bubbleUser: '#0b1624',
        bubbleAgent: '#121821',
        bubbleUserBorder: '#4da3ff',
        bubbleAgentBorder: '#4ade80',
        inputBg: '#0b0f14',
      }
    : {
        background: '#f8f9fa',
        surface: '#ffffff',
        border: '#e9ecef',
        text: '#212529',
        muted: '#6c757d',
        badgeBg: '#f8f9fa',
        badgeBorder: '#dee2e6',
        primary: '#007bff',
        success: '#28a745',
        bubbleUser: '#e3f2fd',
        bubbleAgent: '#f8f9fa',
        bubbleUserBorder: '#007bff',
        bubbleAgentBorder: '#28a745',
        inputBg: '#ffffff',
      };

  // Initialize session ID and health check on client
  useEffect(() => {
    setSessionId(generateSessionId());
    focusComposer();

    async function loadHealth() {
      const healthStatus = await checkHealth();
      setHealth(healthStatus);
    }
    loadHealth();
    
    // Check health every 30 seconds
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Shared submit helper used by form submit and keyboard shortcut
  const submitMessage = async () => {
    if (!messageText.trim() || sending) return;

    setSending(true);
    const textToSend = messageText;
    const newMessageId = Date.now().toString();
    setMessageText('');
    setPendingMessageIds((prev) => new Set(prev).add(newMessageId));

    try {
      const result = await sendMessage(sessionId, textToSend, 'user', newMessageId);
      console.log('Message sent:', result);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitMessage();
  };

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      await submitMessage();
    }
  };

  const getHealthStatus = () => {
    if (!health) return 'Checking...';
    if (health.status === 'ok' && health.redis === 'up') return 'Connected';
    if (health.status === 'ok' && health.redis === 'down') return 'Redis Down';
    return 'Disconnected';
  };

  const getHealthColor = () => {
    if (!health) return colors.muted;
    if (health.status === 'ok' && health.redis === 'up') return colors.success;
    return colors.muted;
  };

  const PageLayout = () => {
    const { status: sseStatus, error: sseError, lastEvent } = useSSE();

    useEffect(() => {
      if (!lastEvent?.data) return;
      let payload: any;
      try {
        payload = JSON.parse(lastEvent.data);
      } catch {
        return;
      }

      const type = payload.type as string | undefined;
      const messageId = (payload.messageId || payload.message_id) as string | undefined;
      const authorRaw = payload.author as string | undefined;
      const agentName = payload.agentName as string | undefined;
      const authorLabel = agentName || authorRaw || 'Agent';
      const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });

      if (!type) return;

      if (type === 'message:ack' && messageId) {
        setPendingMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        setSentMessageIds((prev) => {
          const next = new Set(prev);
          next.add(messageId);
          return next;
        });

        setMessages((prev) => {
          const exists = prev.find((m) => m.id === messageId);
          const nextMessage: ChatMessage = {
            id: messageId,
            author: authorRaw || 'You',
            text: payload.text || '',
            timestamp: now,
            type: (authorRaw && authorRaw.startsWith('agent:')) ? 'agent' : 'user',
          };
          if (exists) {
            return prev.map((m) => (m.id === messageId ? { ...m, ...nextMessage } : m));
          }
          return [...prev, nextMessage];
        });
        return;
      }

      if (type === 'message:delta' || type === 'message:done') {
        const id = messageId || payload.inReplyTo || payload.in_reply_to || Date.now().toString();
        if (type === 'message:done') {
          setPendingMessageIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setSentMessageIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }

        setMessages((prev) => {
          const existing = prev.find((m) => m.id === id);
          const base: ChatMessage = existing || {
            id: id,
            author: authorLabel,
            text: '',
            timestamp: now,
            type: 'agent',
          };
          const updated: ChatMessage = {
            ...base,
            author: authorLabel,
            text: type === 'message:delta'
              ? `${base.text || ''}${payload.delta || ''}`
              : (payload.text || base.text || ''),
            timestamp: base.timestamp || now,
            type: 'agent',
          };
          if (existing) {
            return prev.map((m) => (m.id === id ? updated : m));
          }
          return [...prev, updated];
        });
        return;
      }
    }, [lastEvent]);

    useEffect(() => {
      if (textareaRef.current && document.activeElement !== textareaRef.current) {
        focusComposer();
      }
    }, [messages.length, lastEvent]);

    useEffect(() => {
      if (!lastEvent?.data) return;
      try {
        const payload = JSON.parse(lastEvent.data);
        const type = payload.type as string;
        const rawAgent = payload.agentId || (payload.author && typeof payload.author === 'string' && payload.author.startsWith('agent:') ? payload.author.split(':')[1] : undefined);
        if (!rawAgent) return;

        const workingUpdate = type === 'message:delta' ? true : type === 'message:done' ? false : undefined;
        const nextName = payload.agentName || rawAgent;
        const nextRole = payload.role || (rawAgent === 'primary' ? 'Primary' : 'Agent');
        setAgentStates((prev) => {
          const existing = prev[rawAgent] || { name: rawAgent, role: 'Agent', working: false, flash: false };
          return {
            ...prev,
            [rawAgent]: {
              ...existing,
              name: nextName || existing.name,
              role: nextRole || existing.role,
              working: workingUpdate !== undefined ? workingUpdate : existing.working,
              flash: true,
            },
          };
        });

        const timer = setTimeout(() => {
          setAgentStates((prev) => {
            const existing = prev[rawAgent];
            if (!existing) return prev;
          return {
            ...prev,
            [rawAgent]: { ...existing, flash: false },
          };
        });
      }, 700);

      return () => clearTimeout(timer);
    } catch {
      // ignore malformed SSE payloads
    }
    }, [lastEvent]);

    useEffect(() => {
      const el = messagesContainerRef.current;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      isAtBottomRef.current = nearBottom;
    }, [messages.length]);

    useEffect(() => {
      const el = messagesContainerRef.current;
      if (!el) return;
      if (isAtBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    }, [messages.length]);
    return (
    <main style={{
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      backgroundColor: colors.surface,
      color: colors.text,
      boxSizing: 'border-box'
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        backgroundColor: colors.surface,
        borderBottom: `1px solid ${colors.border}`,
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            background: colors.primary,
            color: '#ffffff',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>beta</span>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '18px' }}>AI Team Workspace</div>
            <div style={{ color: colors.muted, fontSize: '14px' }}>Primary + observers with live context</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            style={{
              padding: '8px 12px',
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              color: colors.text,
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          <button style={{
            padding: '8px 16px',
            border: `1px solid ${colors.border}`,
            backgroundColor: 'transparent',
            borderRadius: '6px',
            cursor: 'pointer'
          }}>New Topic</button>
          <button style={{
            padding: '8px 16px',
            backgroundColor: colors.primary,
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
          }}>Start session</button>
        </div>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '240px minmax(0, 1fr) 260px',
        flexGrow: 1,
        minHeight: 0,
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        gap: '0px'
      }}>
        <aside style={{
          backgroundColor: colors.surface,
          borderRight: `1px solid ${colors.border}`,
          padding: '16px',
          overflowY: 'auto',
          minHeight: 0,
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%',
          overflowX: 'hidden'
        }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: colors.text
            }}>Agents</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                borderRadius: '4px',
                backgroundColor: colors.bubbleUser,
                marginBottom: '4px'
              }}>
                <span style={{
                  background: colors.primary,
                  color: '#ffffff',
                  padding: '2px 6px',
                  borderRadius: '8px',
                  fontSize: '10px',
                  fontWeight: 'bold'
                }}>Primary</span>
                Nova (analysis)
              </li>
              <li style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                marginBottom: '4px',
                color: colors.text
              }}>
                <span style={{
                  background: colors.muted,
                  color: '#ffffff',
                  padding: '2px 6px',
                  borderRadius: '8px',
                  fontSize: '10px',
                  fontWeight: 'bold'
                }}>Observer</span>
                Scout (research)
              </li>
              <li style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                marginBottom: '4px',
                color: colors.text
              }}>
                <span style={{
                  background: colors.muted,
                  color: '#ffffff',
                  padding: '2px 6px',
                  borderRadius: '8px',
                  fontSize: '10px',
                  fontWeight: 'bold'
                }}>Observer</span>
                Sage (critic)
              </li>
            </ul>
          </div>

          <div>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: colors.text
            }}>Topics</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ padding: '8px', marginBottom: '4px', color: colors.text }}>Launch brief · active</li>
              <li style={{ padding: '8px', marginBottom: '4px', color: colors.text }}>User research plan</li>
              <li style={{ padding: '8px', marginBottom: '4px', color: colors.text }}>Pricing discussion</li>
            </ul>
          </div>
        </aside>

        <section style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: colors.surface,
          minHeight: 0,
          overflow: 'hidden',
          flex: '1 1 0',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{
            padding: '20px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}>
            <div>
              <div style={{ 
                fontSize: '12px', 
                color: colors.muted, 
                marginBottom: '4px'
              }}>Session: {sessionId.slice(-8)}</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
                Ideas for a calmer workspace launch
              </div>
              <p style={{ color: colors.muted, margin: 0 }}>
                Connected to backend. Messages are sent to Redis for persistence.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{
                padding: '4px 8px',
                backgroundColor: health?.status === 'ok' && health?.redis === 'up' ? colors.bubbleAgent : colors.badgeBg,
                color: getHealthColor(),
                borderRadius: '12px',
                fontSize: '12px',
                border: `1px solid ${colors.border}`
              }}>{getHealthStatus()}</span>
              <span style={{
                padding: '4px 8px',
                backgroundColor: colors.badgeBg,
                color: colors.muted,
                borderRadius: '12px',
                fontSize: '12px',
                border: `1px solid ${colors.badgeBorder}`
              }}>3 agents online</span>
              <span style={{
                padding: '4px 8px',
                backgroundColor: colors.badgeBg,
                color: colors.muted,
                borderRadius: '12px',
                fontSize: '12px',
                border: `1px solid ${colors.badgeBorder}`
              }}>Session active</span>
            </div>
          </div>

          <div style={{
            flex: '1 1 0',
            minHeight: 0,
            padding: '20px',
            overflowY: 'auto',
            backgroundColor: colors.background,
            boxSizing: 'border-box'
          }} ref={messagesContainerRef}>
            {messages.map((message) => (
              <div key={message.id} style={{
                marginBottom: '16px',
                padding: '12px',
                backgroundColor: message.type === 'user' ? colors.bubbleUser : colors.bubbleAgent,
                borderRadius: '8px',
                borderLeft: `4px solid ${message.type === 'user' ? colors.bubbleUserBorder : colors.bubbleAgentBorder}`,
                color: colors.text
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  fontSize: '12px',
                  color: colors.muted
                }}>
                  <span style={{ fontWeight: 'bold' }}>{message.author}</span>
                  <span>{message.timestamp}</span>
                </div>
                <p style={{ margin: 0, lineHeight: '1.5' }}>{message.text}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{
            padding: '12px 16px',
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.surface,
            position: 'sticky',
            bottom: 0,
            left: 0,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box'
          }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
              <div style={{ marginBottom: '12px' }}>
                <textarea
                  ref={textareaRef}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message the team... (backend connected)"
                  rows={3}
                  disabled={sending}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    backgroundColor: colors.inputBg,
                    color: colors.text,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: colors.muted }}>
                    Session: {sessionId ? sessionId.slice(-12) : 'loading...'}
                  </span>
                  <span style={{ fontSize: '12px', color: colors.muted }}>
                    {pendingMessageIds.size > 0 ? `Sending ${pendingMessageIds.size}...` : sentMessageIds.size > 0 ? 'Sent' : 'Idle'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" style={{
                    padding: '8px 16px',
                    border: `1px solid ${colors.border}`,
                    backgroundColor: 'transparent',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}>
                    Clear
                  </button>
                  <button
                    type="submit"
                    disabled={!messageText.trim() || sending}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: (!messageText.trim() || sending) ? colors.muted : colors.primary,
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: (!messageText.trim() || sending) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>

        <aside style={{
          backgroundColor: colors.surface,
          borderLeft: `1px solid ${colors.border}`,
          padding: '16px',
          overflowY: 'auto',
          minHeight: 0,
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%',
          overflowX: 'hidden'
        }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: colors.text
            }}>Connection Status</div>
            <div style={{
              padding: '8px',
              marginBottom: '8px',
              borderRadius: '4px',
              backgroundColor: health?.status === 'ok' ? colors.bubbleAgent : colors.bubbleUser,
              color: colors.text,
              border: `1px solid ${colors.border}`
            }}>
              Backend: {health?.status || 'checking...'}
            </div>
            <div style={{
              padding: '8px',
              marginBottom: '8px',
              borderRadius: '4px',
              backgroundColor: health?.redis === 'up' ? colors.bubbleAgent : colors.bubbleUser,
              color: colors.text,
              border: `1px solid ${colors.border}`
            }}>
              Redis: {health?.redis || 'checking...'}
            </div>
            <div style={{
              padding: '8px',
              borderRadius: '4px',
              backgroundColor: colors.badgeBg,
              color: colors.text,
              border: `1px solid ${colors.border}`
            }}>
              SSE: {sseStatus}{sseError ? ' (error)' : ''}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: colors.text
            }}>Agent Status</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(agentStates).map(([id, state]) => {
                const initials = state.name ? state.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() : id.slice(0, 2).toUpperCase();
                const flashShadow = state.flash ? `0 0 0 3px ${colors.primary}` : `0 0 0 1px ${colors.border}`;
                return (
                  <li key={id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: colors.surface,
                    border: `1px solid ${colors.border}`,
                    boxShadow: flashShadow,
                    transition: 'box-shadow 0.3s ease'
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: colors.bubbleUser,
                      color: colors.text,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      border: `1px solid ${colors.border}`
                    }}>
                      {initials}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: colors.text }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {state.working && <span role="img" aria-label="speaking">🗣️</span>}
                        <span style={{ fontWeight: 'bold' }}>{state.name}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: colors.muted }}>{state.role}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: colors.text
            }}>Session Info</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ padding: '4px 0', color: colors.text }}>
                ID: {sessionId.slice(-8)}
              </li>
              <li style={{ padding: '4px 0', color: colors.text }}>
                Messages: {messages.length}
              </li>
              <li style={{ padding: '4px 0', color: colors.text }}>
                Status: Active
              </li>
            </ul>
          </div>

          <div>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: colors.text
            }}>Timeline</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {messages.slice(-3).map((msg, i) => (
                <li key={msg.id} style={{ padding: '4px 0', fontSize: '12px', color: colors.text }}>
                  {msg.timestamp} {msg.author.split(' ')[0]}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
    );
  };

  return (
    <SSEProvider sessionId={sessionId}>
      <PageLayout />
    </SSEProvider>
  );
}
