const DEFAULT_API_BASE = "http://127.0.0.1:19001";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE;

export const STREAM_ENDPOINT = `${API_BASE_URL}/api/stream`;
export const MESSAGE_ENDPOINT = `${API_BASE_URL}/api/message`;
