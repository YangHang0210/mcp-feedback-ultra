# Async Feedback via MCP Resources — Design Spec

**Date**: 2026-04-13
**Status**: Approved
**Scope**: Phase 1 (Core MCP Integration) + Phase 2 (Web UI)

---

## 1. Problem

Agent 在长时间任务中可能走错方向，当前 `mcp-feedback-ultra` 仅支持同步反馈（Agent 调用 `interactive_feedback` 时），用户无法在 Agent 工作期间打断或重定向。

## 2. Solution Overview

基于 MCP Resource + Tool 组合，提供异步反馈通道：

- **MCP Resource** `feedback://pending`：被动查询接口，为未来客户端订阅做准备
- **MCP Tool** `check_async_feedback()`：主动消费接口，Agent 调用后读取并清除反馈
- **AsyncFeedbackQueue**：线程安全的单槽内存队列
- **Web UI**：浮动异步反馈输入区域
- **Web API**：`POST /api/async-feedback` 提交反馈

## 3. Architecture

```
┌──────────────────┐        ┌──────────────────────────────┐
│   Web UI          │        │   MCP Server (FastMCP)       │
│                   │        │                              │
│  [异步反馈        │───────▶│  AsyncFeedbackQueue          │
│   输入区域]       │  HTTP  │  (内存，线程安全)            │
│                   │  POST  │                              │
└──────────────────┘        │  ┌─────────────────────────┐ │
                            │  │ MCP Resource             │ │
                            │  │ feedback://pending       │ │
                            │  │ (peek: 不清除)           │ │
                            │  └─────────────────────────┘ │
                            │                              │
                            │  ┌─────────────────────────┐ │
                            │  │ MCP Tool                 │ │
                            │  │ check_async_feedback()   │ │
                            │  │ (consume: 读后清除)      │ │
                            │  └─────────────────────────┘ │
                            └──────────────────────────────┘
```

## 4. Component Details

### 4.1 AsyncFeedbackQueue

**位置**: `src/mcp_feedback_ultra/server.py`

```python
class AsyncFeedbackQueue:
    EXPIRY_SECONDS = 1800  # 30 minutes

    def __init__(self):
        self._lock = threading.Lock()
        self._feedback: str | None = None
        self._timestamp: float | None = None

    def submit(self, feedback: str) -> None:
        """Store new feedback (overwrites previous)."""
        with self._lock:
            self._feedback = feedback.strip()
            self._timestamp = time.time()

    def peek(self) -> dict:
        """Read without clearing. Auto-expires stale feedback."""
        with self._lock:
            if self._feedback and self._timestamp:
                if time.time() - self._timestamp > self.EXPIRY_SECONDS:
                    self._feedback = None
                    self._timestamp = None
                    return {"has_feedback": False}
                return {
                    "has_feedback": True,
                    "feedback": self._feedback,
                    "timestamp": self._timestamp,
                }
            return {"has_feedback": False}

    def consume(self) -> dict:
        """Read and clear. Auto-expires stale feedback."""
        with self._lock:
            if self._feedback and self._timestamp:
                if time.time() - self._timestamp > self.EXPIRY_SECONDS:
                    self._feedback = None
                    self._timestamp = None
                    return {"has_feedback": False}
                result = {
                    "has_feedback": True,
                    "feedback": self._feedback,
                    "timestamp": self._timestamp,
                }
                self._feedback = None
                self._timestamp = None
                return result
            return {"has_feedback": False}
```

**Design decisions:**
- Single-slot: only latest feedback matters (redirect semantics)
- 30-minute expiry: stale feedback auto-clears
- Thread-safe: Web UI and MCP tool access concurrently

### 4.2 MCP Resource: `feedback://pending`

```python
@mcp.resource(
    "feedback://pending",
    name="Async User Feedback",
    description="Check for pending async user feedback submitted via Web UI. "
                "Returns JSON with has_feedback boolean and feedback content.",
    mime_type="application/json",
)
def get_pending_feedback() -> str:
    return json.dumps(_async_feedback_queue.peek(), ensure_ascii=False)
```

- Non-destructive read (does not clear the queue)
- Prepares for future client-side resource subscription support

### 4.3 MCP Tool: `check_async_feedback()`

```python
@mcp.tool()
def check_async_feedback() -> str:
    """Check and consume pending async user feedback.

    Call this periodically during long-running tasks (every few major steps)
    to check if the user wants to redirect your current approach.

    Returns the feedback text if available, or empty string if none.
    Do NOT call this in a tight loop.
    """
    result = _async_feedback_queue.consume()
    if result["has_feedback"]:
        return result["feedback"]
    return ""
```

**Context cost optimization:**
- No feedback: returns `""` (~0 extra tokens)
- Has feedback: returns only the feedback text (no wrapper)

### 4.4 Reminder Text Update

Update `_DEFAULT_REMINDER_TEXT` in `server.py`:

```python
_DEFAULT_REMINDER_TEXT = (
    "[IMPORTANT] After completing the task based on the feedback above, "
    "you MUST call the `interactive_feedback` tool again to report your progress "
    "and get further instructions. Do NOT end your turn without calling this tool.\n\n"
    "During long-running tasks, periodically call `check_async_feedback` "
    "(every few major steps) to check if the user wants to redirect your approach."
)
```

### 4.5 Web API Endpoints

**位置**: `src/mcp_feedback_ultra/web/routes/main_routes.py`

#### POST `/api/async-feedback`

```python
@app.post("/api/async-feedback")
async def submit_async_feedback(request: Request):
    data = await request.json()
    feedback = data.get("feedback", "").strip()
    if not feedback:
        return JSONResponse({"success": False, "error": "empty feedback"}, status_code=400)
    _async_feedback_queue.submit(feedback)
    return JSONResponse({"success": True})
```

#### GET `/api/async-feedback/status`

```python
@app.get("/api/async-feedback/status")
async def get_async_feedback_status():
    status = _async_feedback_queue.peek()
    return JSONResponse(status)
```

### 4.6 Web UI Component (Phase 2)

A floating input area at the bottom of the page:

- Text input + "Send" button
- Status indicator: "No pending" / "Pending (waiting for agent)"
- Shortcut: Ctrl+Enter to send
- WebSocket notification for status changes
- Always visible, independent of interactive_feedback sessions

## 5. Anti-Loop Design

| Mechanism | Description |
|-----------|-------------|
| Consume-on-read | Tool clears queue after reading; re-calling returns empty |
| Minimal response | Empty string when no feedback, minimizing token waste |
| Tool description | Explicitly states "Do NOT call in a tight loop" |
| Reminder text | Guides agent to check "every few major steps" |
| Non-blocking | Unlike `interactive_feedback`, returns immediately |

## 6. Data Flow

### User submits async feedback:

```
Web UI → POST /api/async-feedback → AsyncFeedbackQueue.submit()
       → WebSocket notify frontend: status = "pending"
```

### Agent checks for feedback:

```
Agent → check_async_feedback() tool → AsyncFeedbackQueue.consume()
      → returns feedback text or ""
      → WebSocket notify frontend: status = "consumed"
```

### Agent reads resource (passive):

```
Agent → FetchMcpResource("feedback://pending") → AsyncFeedbackQueue.peek()
      → returns JSON status (does NOT clear queue)
```

## 7. Implementation Phases

### Phase 1: Core MCP Integration (this iteration)
1. Add `AsyncFeedbackQueue` class to `server.py`
2. Register MCP Resource `feedback://pending`
3. Register MCP Tool `check_async_feedback()`
4. Update `_DEFAULT_REMINDER_TEXT`
5. Add Web API endpoints (`POST /api/async-feedback`, `GET /api/async-feedback/status`)

### Phase 2: Web UI Frontend (next iteration)
1. Floating async feedback input component
2. WebSocket status notifications
3. i18n support for new UI text

## 8. Testing Strategy

- **Unit**: AsyncFeedbackQueue (submit/peek/consume/expiry/thread-safety)
- **Integration**: MCP Resource read + Tool consume flow
- **Manual**: Web UI submit → Agent read end-to-end

## 9. Global Instance & Cross-Module Access

The `AsyncFeedbackQueue` is instantiated as a module-level singleton in `server.py`:

```python
_async_feedback_queue = AsyncFeedbackQueue()
```

Web API endpoints in `main_routes.py` access it via import:

```python
from mcp_feedback_ultra.server import _async_feedback_queue
```

This works because the MCP server process loads `server.py` first, and the Web server runs in the same process (started from within `launch_web_feedback_ui`).

## 10. Files to Modify

| File | Changes |
|------|---------|
| `src/mcp_feedback_ultra/server.py` | Add AsyncFeedbackQueue, global instance, MCP Resource, MCP Tool, update reminder |
| `src/mcp_feedback_ultra/web/routes/main_routes.py` | Add async-feedback API endpoints (import queue from server) |
