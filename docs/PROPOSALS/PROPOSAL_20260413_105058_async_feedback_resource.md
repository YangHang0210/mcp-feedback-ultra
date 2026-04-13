# 提案：基于 MCP Resources 的异步反馈机制

**状态**: AwaitingApproval
**日期**: 2026-04-13
**作者**: AI Assistant

---

## 1. 背景与问题

当 AI Agent 处理长时间任务时，可能在错误的方向上尝试很久。当前 `mcp-feedback-pro` 仅支持**同步反馈**——Agent 必须主动调用 `interactive_feedback` 工具才能接收用户输入。用户**无法**在 Agent 工作期间进行打断或重定向。

### 当前流程（仅同步）

```
Agent 工作中 → ...（用户无法介入）... → Agent 调用 interactive_feedback → 用户提供反馈 → Agent 调整
```

### 期望流程（异步打断）

```
Agent 工作中 → 用户通过 Web UI 提交异步反馈 → Agent 在下一步前读取 Resource → Agent 立即调整
```

---

## 2. 目标

提供一条基于 MCP Resources 的**异步反馈通道**，实现：

1. 用户可以**随时**通过 Web UI 提交反馈（即使没有活跃的 `interactive_feedback` 会话）
2. Agent 可以通过 MCP Resource **被动查询** / MCP Tool **主动消费**待处理反馈
3. **避免 Agent 无限循环读取** —— 反馈一旦被消费即清除
4. 集成方式**非侵入性** —— 现有同步流程保持不变

---

## 3. 方案设计

### 3.1 架构总览

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
                            │  │ (从队列读取，不清除)     │ │
                            │  └─────────────────────────┘ │
                            │                              │
                            │  ┌─────────────────────────┐ │
                            │  │ MCP Tool                 │ │
                            │  │ check_async_feedback()   │ │
                            │  │ (读取并清除队列)         │ │
                            │  └─────────────────────────┘ │
                            └──────────────────────────────┘
                                          │
                                          ▼
                            ┌──────────────────────────────┐
                            │   AI Agent (Cursor)          │
                            │                              │
                            │  1. 读取 Resource → 查看是否 │
                            │     有待处理反馈             │
                            │  2. 调用 Tool → 消费反馈     │
                            │     并调整行为               │
                            └──────────────────────────────┘
```

### 3.2 核心组件

#### 3.2.1 AsyncFeedbackQueue（异步反馈队列）

线程安全的内存队列，位于 MCP Server 进程中：

```python
class AsyncFeedbackQueue:
    """线程安全的异步反馈队列（单槽设计）"""

    def submit(self, feedback: str) -> None:
        """用户提交反馈（来自 Web UI）"""

    def peek(self) -> dict:
        """读取但不清除（用于 Resource）"""

    def consume(self) -> dict:
        """读取并清除（用于 Tool）"""
```

**关键设计决策**：
- **单槽队列**：只保存最新一条反馈，旧反馈被覆盖。原因：异步反馈的核心语义是"打断/重定向"，用户最新的意图才是最重要的
- **Peek vs Consume**：Resource 使用 `peek()`（非破坏性），Tool 使用 `consume()`（读后清除）
- **超时机制**：反馈超过 30 分钟未被读取自动过期

#### 3.2.2 MCP Resource: `feedback://pending`

通过 FastMCP 的 `@mcp.resource()` 装饰器注册：

```python
@mcp.resource("feedback://pending",
    name="Async User Feedback",
    description="查看是否有待处理的用户异步反馈",
    mime_type="application/json")
def get_pending_feedback() -> str:
    return json.dumps(async_feedback_queue.peek(), ensure_ascii=False)
```

Agent 或 Cursor IDE 可以读取此资源来**查看**是否有待处理反馈，**不会**清除反馈。

#### 3.2.3 MCP Tool: `check_async_feedback()`

轻量级工具，读取并清除反馈：

```python
@mcp.tool()
def check_async_feedback() -> str:
    """Check and consume pending async user feedback.

    Call this tool periodically (every few major steps) during long-running
    tasks to check if the user wants to redirect your current approach.

    Returns empty if no pending feedback. Once read, the feedback is cleared.
    Do NOT call this in a tight loop — only check between major work steps.
    """
    result = async_feedback_queue.consume()
    if result["has_feedback"]:
        return f"[USER ASYNC FEEDBACK]: {result['feedback']}"
    return "[NO PENDING FEEDBACK]"
```

#### 3.2.4 Web UI 增强

在 Web UI 中添加"异步反馈"输入区域：

- **始终可见**：页面底部/侧边的浮动输入框
- **独立于会话**：即使没有活跃的 `interactive_feedback` 会话也能使用
- **简洁 UI**：文本输入 + "发送"按钮
- **状态指示**：显示"无待处理反馈" / "反馈已提交，等待 Agent 读取"
- **API 端点**：`POST /api/async-feedback` → 写入队列

### 3.3 防无限循环设计

| 机制 | 说明 |
|------|------|
| 消费即清除 | Tool 读取后自动清空队列，再次调用返回空 |
| 明确响应信号 | `[NO PENDING FEEDBACK]` vs `[USER ASYNC FEEDBACK]: ...`，Agent 能准确判断 |
| Tool Description 引导 | 明确写明"Do NOT call this in a tight loop" |
| Reminder Text 引导 | 更新现有提醒文本，指导 Agent 每隔几个主要步骤检查一次 |
| 非阻塞执行 | 与 `interactive_feedback` 不同，此工具立即返回，不等待 |

---

## 4. 实施清单

### Phase 1：核心 — 异步反馈队列 & MCP 集成（本次实施）
- [ ] 在 `server.py` 中创建 `AsyncFeedbackQueue` 类
- [ ] 注册 MCP Resource `feedback://pending`
- [ ] 注册 MCP Tool `check_async_feedback()`
- [ ] 更新 `_DEFAULT_REMINDER_TEXT`，添加异步反馈检查指引

### Phase 2：Web UI — 异步反馈输入（后续实施）
- [ ] 添加 `POST /api/async-feedback` 端点
- [ ] 添加 `GET /api/async-feedback/status` 端点
- [ ] 前端添加浮动异步反馈输入组件
- [ ] WebSocket 通知反馈状态变更

### Phase 3：测试 & 文档（后续实施）
- [ ] 异步反馈提交测试
- [ ] MCP Resource 读取测试
- [ ] MCP Tool 消费行为测试
- [ ] 并发访问线程安全测试

---

## 5. 风险与应对

| 风险 | 应对措施 |
|------|---------|
| Agent 忽略 `check_async_feedback` 工具 | 通过 reminder text 强化引导；Tool description 详细说明使用时机 |
| Agent 过于频繁地轮询 | 工具立即返回明确信号；description 中明确说明不要紧密循环调用 |
| 队列竞态条件 | 使用 `threading.Lock` 保证线程安全 |
| Web UI 未启动时用户想提交反馈 | 第一版仅支持 Web UI 已启动的情况；后续可扩展命令行接口 |
| 反馈被覆盖（用户连续提交多条） | 设计选择：最新反馈覆盖旧反馈，符合"重定向"语义 |

---

## 6. Sequential Thinking 审阅结论

经过 6 步结构化审阅，结论如下：

- **方案合理性** ✅：Resource + Tool 组合提供了被动查询和主动消费两个接口
- **防循环设计** ✅：消费即清除 + 明确响应 + 指导文本，三重保障
- **非侵入性** ✅：现有同步流程（`interactive_feedback`）完全不受影响
- **实现简单性** ✅：单槽队列 + 线程安全，符合 KISS 原则
- **建议分阶段实施**：先实现 Phase 1（核心 MCP 集成），验证效果后再实现 Phase 2（Web UI）
