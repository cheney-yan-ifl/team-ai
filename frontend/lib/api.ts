// Simple API client for backend communication
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001';

export interface HealthStatus {
  status: string;
  redis: string;
}

export interface Message {
  messageId: string;
  sessionId: string;
  author: string;
  text: string;
  type: string;
}

export interface MessageResponse {
  ok: boolean;
  messageId: string;
}

// Generate a simple session ID
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Check backend health
export async function checkHealth(): Promise<HealthStatus> {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    return { status: 'error', redis: 'down' };
  }
}

// Send a message to the backend
export async function sendMessage(sessionId: string, text: string, author: string = 'user'): Promise<MessageResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        text,
        author,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Send message failed:', error);
    return { ok: false, messageId: '' };
  }
}