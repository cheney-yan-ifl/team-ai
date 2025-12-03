"use client";

import { useState, useEffect, useRef } from 'react';
import { checkHealth, sendMessage, generateSessionId, HealthStatus } from '../lib/api';

interface ChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  type: 'user' | 'agent';
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      author: 'You',
      text: 'Draft a launch plan for the AI team workspace. Keep it calm, clear, and helpful.',
      timestamp: '9:00',
      type: 'user'
    },
    {
      id: '2',
      author: 'Nova · Primary',
      text: 'Starting a calm launch: align on positioning, set a concise FAQ, and keep the UI breathable. Pulling observer thoughts now.',
      timestamp: '9:01',
      type: 'agent'
    }
  ]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize session ID and health check on client
  useEffect(() => {
    setSessionId(generateSessionId());
    
    async function loadHealth() {
      const healthStatus = await checkHealth();
      setHealth(healthStatus);
    }
    loadHealth();
    
    // Check health every 30 seconds
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!messageText.trim() || sending) return;

    setSending(true);
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      author: 'You',
      text: messageText,
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      }),
      type: 'user'
    };

    // Add message to UI immediately
    setMessages(prev => [...prev, newMessage]);
    setMessageText('');

    try {
      // Send to backend
      const result = await sendMessage(sessionId, messageText);
      console.log('Message sent:', result);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const getHealthStatus = () => {
    if (!health) return 'Checking...';
    if (health.status === 'ok' && health.redis === 'up') return 'Connected';
    if (health.status === 'ok' && health.redis === 'down') return 'Redis Down';
    return 'Disconnected';
  };

  const getHealthColor = () => {
    if (!health) return '#666';
    if (health.status === 'ok' && health.redis === 'up') return '#28a745';
    return '#666';
  };

  return (
    <main style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f8f9fa'
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        backgroundColor: 'white',
        borderBottom: '1px solid #e9ecef',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            background: '#007bff',
            color: 'white',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>beta</span>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '18px' }}>AI Team Workspace</div>
            <div style={{ color: '#6c757d', fontSize: '14px' }}>Primary + observers with live context</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{
            padding: '8px 16px',
            border: '1px solid #dee2e6',
            backgroundColor: 'transparent',
            borderRadius: '6px',
            cursor: 'pointer'
          }}>New Topic</button>
          <button style={{
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}>Start session</button>
        </div>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '250px 1fr 250px',
        flexGrow: 1,
        overflow: 'hidden'
      }}>
        <aside style={{
          backgroundColor: 'white',
          borderRight: '1px solid #e9ecef',
          padding: '20px',
          overflowY: 'auto'
        }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: '#495057'
            }}>Agents</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                borderRadius: '4px',
                backgroundColor: '#e3f2fd',
                marginBottom: '4px'
              }}>
                <span style={{
                  background: '#007bff',
                  color: 'white',
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
                marginBottom: '4px'
              }}>
                <span style={{
                  background: '#6c757d',
                  color: 'white',
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
                marginBottom: '4px'
              }}>
                <span style={{
                  background: '#6c757d',
                  color: 'white',
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
              color: '#495057'
            }}>Topics</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ padding: '8px', marginBottom: '4px' }}>Launch brief · active</li>
              <li style={{ padding: '8px', marginBottom: '4px' }}>User research plan</li>
              <li style={{ padding: '8px', marginBottom: '4px' }}>Pricing discussion</li>
            </ul>
          </div>
        </aside>

        <section style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'white'
        }}>
          <div style={{
            padding: '20px',
            borderBottom: '1px solid #e9ecef',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}>
            <div>
              <div style={{ 
                fontSize: '12px', 
                color: '#6c757d', 
                marginBottom: '4px'
              }}>Session: {sessionId.slice(-8)}</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
                Ideas for a calmer workspace launch
              </div>
              <p style={{ color: '#6c757d', margin: 0 }}>
                Connected to backend. Messages are sent to Redis for persistence.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{
                padding: '4px 8px',
                backgroundColor: health?.status === 'ok' && health?.redis === 'up' ? '#d4edda' : '#f8f9fa',
                color: getHealthColor(),
                borderRadius: '12px',
                fontSize: '12px',
                border: '1px solid #dee2e6'
              }}>{getHealthStatus()}</span>
              <span style={{
                padding: '4px 8px',
                backgroundColor: '#f8f9fa',
                color: '#666',
                borderRadius: '12px',
                fontSize: '12px',
                border: '1px solid #dee2e6'
              }}>3 agents online</span>
              <span style={{
                padding: '4px 8px',
                backgroundColor: '#f8f9fa',
                color: '#666',
                borderRadius: '12px',
                fontSize: '12px',
                border: '1px solid #dee2e6'
              }}>Session active</span>
            </div>
          </div>

          <div style={{
            flexGrow: 1,
            padding: '20px',
            overflowY: 'auto'
          }}>
            {messages.map((message) => (
              <div key={message.id} style={{
                marginBottom: '16px',
                padding: '12px',
                backgroundColor: message.type === 'user' ? '#e3f2fd' : '#f8f9fa',
                borderRadius: '8px',
                borderLeft: `4px solid ${message.type === 'user' ? '#007bff' : '#28a745'}`
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  fontSize: '12px',
                  color: '#6c757d'
                }}>
                  <span style={{ fontWeight: 'bold' }}>{message.author}</span>
                  <span>{message.timestamp}</span>
                </div>
                <p style={{ margin: 0, lineHeight: '1.5' }}>{message.text}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{
            padding: '20px',
            borderTop: '1px solid #e9ecef'
          }}>
            <div style={{ marginBottom: '12px' }}>
              <textarea
                ref={textareaRef}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Message the team... (backend connected)"
                rows={3}
                disabled={sending}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #dee2e6',
                  borderRadius: '6px',
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '12px', color: '#6c757d' }}>
                Session: {sessionId ? sessionId.slice(-12) : 'loading...'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" style={{
                  padding: '8px 16px',
                  border: '1px solid #dee2e6',
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
                    backgroundColor: (!messageText.trim() || sending) ? '#6c757d' : '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: (!messageText.trim() || sending) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside style={{
          backgroundColor: 'white',
          borderLeft: '1px solid #e9ecef',
          padding: '20px',
          overflowY: 'auto'
        }}>
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: '#495057'
            }}>Connection Status</div>
            <div style={{
              padding: '8px',
              marginBottom: '8px',
              borderRadius: '4px',
              backgroundColor: health?.status === 'ok' ? '#d4edda' : '#f8d7da',
              color: health?.status === 'ok' ? '#155724' : '#721c24'
            }}>
              Backend: {health?.status || 'checking...'}
            </div>
            <div style={{
              padding: '8px',
              marginBottom: '8px',
              borderRadius: '4px',
              backgroundColor: health?.redis === 'up' ? '#d4edda' : '#f8d7da',
              color: health?.redis === 'up' ? '#155724' : '#721c24'
            }}>
              Redis: {health?.redis || 'checking...'}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: '#495057'
            }}>Session Info</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ padding: '4px 0' }}>
                ID: {sessionId.slice(-8)}
              </li>
              <li style={{ padding: '4px 0' }}>
                Messages: {messages.length}
              </li>
              <li style={{ padding: '4px 0' }}>
                Status: Active
              </li>
            </ul>
          </div>

          <div>
            <div style={{ 
              fontWeight: 'bold', 
              fontSize: '14px', 
              marginBottom: '12px',
              color: '#495057'
            }}>Timeline</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {messages.slice(-3).map((msg, i) => (
                <li key={msg.id} style={{ padding: '4px 0', fontSize: '12px' }}>
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
