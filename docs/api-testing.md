# Backend API Testing Guide

Quick commands to exercise the backend endpoints and watch SSE updates in the frontend. Adjust `SESSION_ID` to match the one shown in the UI (e.g., `95_3dyxnovas`).

## 1) Health check
```bash
curl -X GET http://127.0.0.1:19001/api/health
```

## 2) Send a single message
```bash
SESSION_ID=95_3dyxnovas
curl -X POST http://127.0.0.1:19001/api/message \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"SSE manual ping\",\"author\":\"user\"}"
```

## 3) Burst of messages (5 total, 1s apart)
```bash
SESSION_ID=95_3dyxnovas
for i in $(seq 1 5); do
  curl -X POST http://127.0.0.1:19001/api/message \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"SSE burst $i\",\"author\":\"user\"}"
  sleep 1
done
```

## 4) Continuous stream (Ctrl+C to stop)
```bash
SESSION_ID=95_3dyxnovas
i=1
while true; do
  curl -X POST http://127.0.0.1:19001/api/message \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$SESSION_ID\",\"text\":\"SSE stream $i\",\"author\":\"user\"}"
  i=$((i+1))
  sleep 2
done
```

## 5) Inspect SSE from the browser console
Open DevTools on the frontend and run:
```js
const sessionId = '95_3dyxnovas'; // match the UI session
const es = new EventSource(`http://127.0.0.1:19001/api/stream?sessionId=${sessionId}`);
es.onmessage = (e) => console.log('SSE message', e.data);
es.onerror = (e) => console.error('SSE error', e);
```
You should see `state:update` (connected), then `message:ack`, `message:delta`, `message:done`, and summary `state:update` events as you send messages.

## Notes
- Backend must be running (e.g., `docker-compose up`).
- If ports differ, change `http://127.0.0.1:19001` accordingly and set `NEXT_PUBLIC_API_BASE_URL` on the frontend.
