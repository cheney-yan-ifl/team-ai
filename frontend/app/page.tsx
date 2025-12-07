"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { checkHealth, sendMessage, generateSessionId, HealthStatus, fetchAgents, AgentConfig } from '../lib/api';
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
  model?: string;
};

type ColorPalette = {
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  badgeBg: string;
  badgeBorder: string;
  primary: string;
  success: string;
  bubbleUser: string;
  bubbleAgent: string;
  bubbleUserBorder: string;
  bubbleAgentBorder: string;
  inputBg: string;
};

export default function HomePage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [pendingMessageIds, setPendingMessageIds] = useState<Set<string>>(new Set());
  const [sentMessageIds, setSentMessageIds] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef<boolean>(true);

  const focusComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const len = el.value.length;
    el.focus();
    try {
      el.setSelectionRange(len, len);
    } catch {
      // ignore selection issues on some browsers
    }
  }, []);

  const colors: ColorPalette = theme === 'dark'
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
    fetchAgents().then(setAgents);
    
    // Check health every 30 seconds
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!agents.length) return;
    setAgentStates((prev) => {
      const next: Record<string, AgentState> = {};
      agents.forEach((agent) => {
        const existing = prev[agent.agentId] || { working: false, flash: false, name: agent.name, role: agent.role };
        next[agent.agentId] = {
          ...existing,
          name: agent.name,
          role: agent.role === 'primary' ? 'Primary' : 'Observer',
          model: agent.model,
          flash: existing.flash,
          working: existing.working,
        };
      });
      return next;
    });
  }, [agents]);

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

  return (
    <SSEProvider sessionId={sessionId}>
      <PageLayout
        theme={theme}
        setTheme={setTheme}
        colors={colors}
        sessionId={sessionId}
        health={health}
        messages={messages}
        setMessages={setMessages}
        messageText={messageText}
        setMessageText={setMessageText}
        sending={sending}
        handleSubmit={handleSubmit}
        handleKeyDown={handleKeyDown}
        pendingMessageIds={pendingMessageIds}
        sentMessageIds={sentMessageIds}
        setPendingMessageIds={setPendingMessageIds}
        setSentMessageIds={setSentMessageIds}
        textareaRef={textareaRef}
        messagesContainerRef={messagesContainerRef}
        focusComposer={focusComposer}
        agents={agents}
        agentStates={agentStates}
        setAgentStates={setAgentStates}
        isAtBottomRef={isAtBottomRef}
        getHealthStatus={getHealthStatus}
        getHealthColor={getHealthColor}
      />
    </SSEProvider>
  );
}

type PageLayoutProps = {
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
  colors: ColorPalette;
  sessionId: string;
  health: HealthStatus | null;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  messageText: string;
  setMessageText: React.Dispatch<React.SetStateAction<string>>;
  sending: boolean;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => Promise<void>;
  pendingMessageIds: Set<string>;
  sentMessageIds: Set<string>;
  setPendingMessageIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSentMessageIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
  focusComposer: () => void;
  agents: AgentConfig[];
  agentStates: Record<string, AgentState>;
  setAgentStates: React.Dispatch<React.SetStateAction<Record<string, AgentState>>>;
  isAtBottomRef: React.MutableRefObject<boolean>;
  getHealthStatus: () => string;
  getHealthColor: () => string;
};

function PageLayout({
  theme,
  setTheme,
  colors,
  sessionId,
  health,
  messages,
  setMessages,
  messageText,
  setMessageText,
  sending,
  handleSubmit,
  handleKeyDown,
  pendingMessageIds,
  sentMessageIds,
  setPendingMessageIds,
  setSentMessageIds,
  textareaRef,
  messagesContainerRef,
  focusComposer,
  agents,
  agentStates,
  setAgentStates,
  isAtBottomRef,
  getHealthStatus,
  getHealthColor,
}: PageLayoutProps) {
  const { status: sseStatus, error: sseError, lastEvent } = useSSE();

  useEffect(() => {
    if (!lastEvent?.data) return;
    console.log('SSE event:', lastEvent.data);
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

    if (type === 'user:msg' && messageId) {
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

    if (type === 'agent:msg') {
      const id = messageId || payload.inReplyTo || payload.in_reply_to || Date.now().toString();
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

      setMessages((prev) => {
        const existing = prev.find((m) => m.id === id);
        const nextMessage: ChatMessage = {
          id: id,
          author: authorLabel,
          text: payload.text || '',
          timestamp: now,
          type: 'agent',
        };
        if (existing) {
          return prev.map((m) => (m.id === id ? { ...m, ...nextMessage } : m));
        }
        return [...prev, nextMessage];
      });
      return;
    }

    if (type === 'agent:fail') {
      const id = messageId || payload.inReplyTo || payload.in_reply_to || Date.now().toString();
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

      setMessages((prev) => {
        const existing = prev.find((m) => m.id === id);
        const nextMessage: ChatMessage = {
          id: id,
          author: authorLabel,
          text: `❌ ${payload.message || 'Agent failed to respond'}`,
          timestamp: now,
          type: 'agent',
        };
        if (existing) {
          return prev.map((m) => (m.id === id ? { ...m, ...nextMessage } : m));
        }
        return [...prev, nextMessage];
      });
      return;
    }
  }, [lastEvent, setMessages, setPendingMessageIds, setSentMessageIds]);

  useEffect(() => {
    if (textareaRef.current && document.activeElement !== textareaRef.current) {
      focusComposer();
    }
  }, [messages.length, lastEvent, focusComposer, textareaRef]);

  useEffect(() => {
    if (!lastEvent?.data) return;
    try {
      const payload = JSON.parse(lastEvent.data);
      const type = payload.type as string;
      const rawAgent = payload.agentId || (payload.author && typeof payload.author === 'string' && payload.author.startsWith('agent:') ? payload.author.split(':')[1] : undefined);
      if (!rawAgent) return;

      // Determine working state based on event type
      let workingUpdate: boolean | undefined;
      if (type === 'agent:working') {
        workingUpdate = true;
      } else if (type === 'agent:msg' || type === 'agent:fail') {
        workingUpdate = false;
      }

      const nextName = payload.agentName || rawAgent;
      const nextRole = payload.role || payload.agentRole || (rawAgent === 'primary' ? 'Primary' : 'Agent');
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
  }, [lastEvent, setAgentStates]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    isAtBottomRef.current = nearBottom;
  }, [messages.length, messagesContainerRef, isAtBottomRef]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, messagesContainerRef, isAtBottomRef]);

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
              {agents.map((agent) => (
                <li key={agent.agentId} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  marginBottom: '8px',
                  color: colors.text
                }}>
                  <span style={{
                    background: agent.role === 'primary' ? colors.primary : colors.muted,
                    color: '#ffffff',
                    padding: '2px 6px',
                    borderRadius: '8px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>{agent.role === 'primary' ? 'Primary' : 'Observer'}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: 'bold' }}>{agent.name}</span>
                    <span style={{ fontSize: '12px', color: colors.muted }}>{agent.model}</span>
                  </div>
                </li>
              ))}
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
                <div
                  style={{
                    margin: 0,
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {message.text}
                </div>
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
              {agents.map((agent) => {
                const state = agentStates[agent.agentId] || { name: agent.name, role: agent.role, working: false, flash: false };
                const initials = state.name ? state.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() : agent.agentId.slice(0, 2).toUpperCase();
                const flashShadow = state.flash ? `0 0 0 3px ${colors.primary}` : `0 0 0 1px ${colors.border}`;
                const workingBgColor = state.working ? (theme === 'dark' ? '#1a3a52' : '#e3f2fd') : colors.surface;
                return (
                  <li key={agent.agentId} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: workingBgColor,
                    border: `1px solid ${state.working ? colors.primary : colors.border}`,
                    boxShadow: flashShadow,
                    transition: 'box-shadow 0.3s ease, background-color 0.3s ease, border-color 0.3s ease'
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: state.working ? colors.primary : colors.bubbleUser,
                      color: state.working ? '#ffffff' : colors.text,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      border: `1px solid ${colors.border}`,
                      transition: 'background-color 0.3s ease, color 0.3s ease'
                    }}>
                      {initials}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: colors.text }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {state.working && <span role="img" aria-label="speaking" style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>🗣️</span>}
                        <span style={{ fontWeight: 'bold' }}>{state.name}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: colors.muted }}>{state.role === 'primary' ? 'Primary' : 'Observer'} · {agent.model}</span>
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
              {messages.slice(-3).map((msg) => (
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
}
