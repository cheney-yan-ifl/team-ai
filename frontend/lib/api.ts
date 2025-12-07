// Simple API client for backend communication
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:19001';

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

export interface AgentConfig {
  agentId: string;
  name: string;
  role: string;
  model: string;
  apiUrl: string;
  systemPrompt?: string;
  persona?: string;
}

export interface AgentsResponse {
  agents: AgentConfig[];
}

// Generate a short session ID (8 character alphanumeric)
export function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 10);
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
export async function sendMessage(
  sessionId: string,
  text: string,
  author: string = 'user',
  messageId?: string
): Promise<MessageResponse> {
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
        messageId,
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

// Fetch configured agents from backend
export async function fetchAgents(): Promise<AgentConfig[]> {
  try {
    const response = await fetch(`${API_BASE}/api/agents`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: AgentsResponse = await response.json();
    return data.agents || [];
  } catch (error) {
    console.error('Fetch agents failed:', error);
    return [];
  }
}
