# Query 分流路由系统设计文档

**日期**: 2026-04-11  
**状态**: 已确认，待实施

---

## 1. 背景与目标

### 1.1 问题
用户需要手动选择使用 RAG Book 系统还是 ReAct Agent 系统，体验不够智能。

### 1.2 目标
实现自动 query 分流：用户输入问题后，系统自动识别意图，进入对应处理流程，并给用户明确反馈。

### 1.3 处理流程
| 流程 | 描述 | 技术基础 |
|-----|------|---------|
| **RAG** | 基于《天龙八部》向量库，检索相关片段后用 LLM 总结回答 | `ebook-rag.mjs` |
| **Agent** | ReAct 循环，支持工具调用（查用户、发邮件、搜索） | `ai.service.ts` |
| **DB** | 直接向量检索，返回原文片段，不做 LLM 总结 | `ebook-query.mjs` |

---

## 2. 架构设计

### 2.1 系统架构

```
┌─────────────┐     POST /intent/analyze      ┌─────────────┐
│             │ ─────────────────────────────> │             │
│   前端界面   │                                │   Intent    │
│             │ <─ {intent, confidence, reason}│  Service    │
│             │                                │             │
│             │     GET /{intent}/stream       │             │
│             │ ─────────────────────────────> │             │
│             │                                ├─────────────┤
│             │ <─ SSE stream chunks ──────────┤   Router    │
│             │                                ├─────────────┤
│             │                                │  RAG/Agent/ │
│             │                                │    DB       │
└─────────────┘                                └─────────────┘
```

### 2.2 核心组件

#### IntentService（意图识别）
- 使用 LLM 对用户 query 进行分类
- 输出：`intent`, `confidence`, `reason`
- 模糊场景默认返回 `agent`

#### SessionService（会话管理）
- 后端维护 session，支持多轮对话上下文
- 数据存储在内存（Map），支持后续迁移到 Redis
- Session 包含：`id`, `messages[]`, `createdAt`, `lastActiveAt`

#### 流程服务
- **RagService**: 向量检索 + LLM 总结，SSE 流式返回
- **AgentService**: ReAct 循环，工具调用，SSE 流式返回
- **DbService**: 纯向量检索，同步返回原文片段

---

## 3. 接口设计

### 3.1 意图识别

```http
POST /intent/analyze
Content-Type: application/json

{
  "query": "萧峰是谁",
  "sessionId": "optional-existing-session-id"
}
```

**Response:**
```json
{
  "intent": "rag",
  "confidence": 0.92,
  "reason": "用户询问小说人物信息",
  "sessionId": "abc-123"
}
```

### 3.2 RAG 流式查询

```http
GET /rag/stream?query=萧峰是谁&sessionId=abc-123
```

**SSE Response:**
```
data: {"type":"start"}
data: {"type":"chunk","content":"萧峰是"}
data: {"type":"chunk","content":"《天龙八部》的主角"}
data: {"type":"end"}
```

### 3.3 Agent 流式查询

```http
GET /agent/stream?query=查用户001并发邮件&sessionId=abc-123
```

**SSE Response:** 同 RAG 格式

### 3.4 原文查询

```http
GET /db/query?query=第三章&limit=5
```

**Response:**
```json
{
  "results": [
    {
      "chapter_num": 3,
      "content": "原文片段...",
      "score": 0.95
    }
  ]
}
```

---

## 4. 意图分类规则

### 4.1 分类 Prompt

```
你是一个查询意图分类助手。分析用户输入，判断应该进入哪个处理流程：

可选流程：
- rag: 用户询问《天龙八部》小说内容、人物、情节等，需要 RAG 增强回答
- agent: 用户需要工具协助（查询用户信息、发邮件、搜索），或意图不明确
- db: 用户明确要求查询原文、获取原始片段，不需要 LLM 总结

用户输入：{query}

输出 JSON 格式：
{
  "intent": "rag|agent|db",
  "confidence": 0.0-1.0,
  "reason": "简短说明判断理由"
}

模糊场景（如只说"查一下"）默认选择 agent。
```

### 4.2 示例映射

| 用户输入 | 意图 | 原因 |
|---------|------|------|
| "萧峰是谁" | rag | 询问小说人物 |
| "查用户001并发邮件" | agent | 需要工具调用 |
| "第三章原文是什么" | db | 查询原始文本 |
| "搜索相关内容" | agent | 模糊，默认 |

---

## 5. 上下文管理

### 5.1 Session 数据结构

```typescript
interface Session {
  id: string;
  messages: BaseMessage[];  // LangChain 格式
  metadata: {
    lastIntent?: string;
    createdAt: Date;
    lastActiveAt: Date;
  }
}
```

### 5.2 各流程上下文策略

| 流程 | 上下文处理 |
|-----|-----------|
| RAG | 保留历史对话，每次检索片段 + history 构建 prompt |
| Agent | 完整对话历史，支持多轮工具调用 |
| DB | 无状态，单次查询 |

---

## 6. 错误处理

| 场景 | 处理策略 |
|-----|---------|
| 意图识别失败 | 默认走 agent，记录 error log |
| RAG 检索无结果 | 返回提示"未找到相关内容" |
| Agent 工具执行失败 | ToolMessage 携带错误，让 LLM 处理 |
| Session 不存在 | 返回 404，前端引导新建会话 |
| LLM 调用失败 | SSE 发送 error 事件后关闭连接 |

---

## 7. 扩展性考虑

- **新流程**: 添加新的 intent 类型和对应 service 即可
- **意图缓存**: 可添加 query → intent 的短时缓存（5分钟）
- **持久化**: Session 存储可从内存 Map 迁移到 Redis
- **置信度阈值**: 低于阈值（如 0.6）可返回"请明确您的需求"

---

## 8. 实施范围

在 `MyDemo/ReAct Loop/` 项目中新增：

1. `intent/intent.service.ts` - 意图识别服务
2. `intent/intent.controller.ts` - 意图分析端点
3. `session/session.service.ts` - 会话管理服务
4. `rag/rag.service.ts` - RAG 流程封装
5. `rag/rag.controller.ts` - RAG 端点
6. `db-query/db-query.service.ts` - 原文查询服务
7. `db-query/db-query.controller.ts` - DB 查询端点
8. 修改 `ai/ai.controller.ts` - 添加 session 支持
9. 更新 `app.module.ts` - 注册新模块

---

## 9. 验收标准

- [ ] 意图识别准确率 > 80%（基于测试集）
- [ ] 三个流程均可正常调用
- [ ] 支持多轮对话上下文
- [ ] SSE 流式输出正常
- [ ] 模糊 query 默认走 agent
