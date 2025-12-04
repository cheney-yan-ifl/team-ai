import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { STREAM_ENDPOINT } from "./config";

type SSEStatus = "idle" | "connecting" | "open" | "error";

interface SSEContextValue {
  status: SSEStatus;
  lastEvent?: MessageEvent;
  error?: Event;
}

const SSEContext = createContext<SSEContextValue>({
  status: "idle",
});

interface SSEProviderProps {
  sessionId?: string;
  children: React.ReactNode;
}

export function SSEProvider({ sessionId, children }: SSEProviderProps) {
  const [status, setStatus] = useState<SSEStatus>("idle");
  const [lastEvent, setLastEvent] = useState<MessageEvent | undefined>();
  const [error, setError] = useState<Event | undefined>();

  useEffect(() => {
    if (!sessionId) {
      setStatus("idle");
      return;
    }

    const source = new EventSource(`${STREAM_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}`);
    setStatus("connecting");
    setError(undefined);

    source.onopen = () => setStatus("open");
    source.onmessage = (event) => {
      setLastEvent(event);
    };
    source.onerror = (evt) => {
      setStatus("error");
      setError(evt);
    };

    return () => {
      source.close();
      setStatus("idle");
    };
  }, [sessionId]);

  const value = useMemo(
    () => ({
      status,
      lastEvent,
      error,
    }),
    [status, lastEvent, error]
  );

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSE() {
  return useContext(SSEContext);
}
