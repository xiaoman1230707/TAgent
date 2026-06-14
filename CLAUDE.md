# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains AI learning projects with two main parts:

1. **ai-chat/** - Query Routing System with NestJS backend and React frontend
2. **MyDemo/** - Standalone learning projects (RAG Book System and ReAct Loop)

The **ai-chat** project is the primary production code, implementing a query routing system that automatically classifies user intent and routes to appropriate handlers (RAG, Agent, DB Query, or Chat).

---

## ai-chat Architecture

### Backend (`ai-chat/backend/`)

NestJS + TypeScript + LangChain implementation with modular architecture.

**Module Structure:**
```
src/
├── agent/          # ReAct Agent with tool calling
├── chat/           # Basic chat interface
├── db-query/       # Pure vector search (no LLM)
├── intent/         # Explicit intent analysis API
├── llm/            # LLM provider configuration
├── rag/            # RAG with vector search + LLM generation
├── router/         # Query routing (rule-based + LLM)
└── session/        # Session management for multi-turn conversations
```

**Key Modules:**

| Module | Purpose | Key Files |
|--------|---------|-----------|
| `AgentModule` | ReAct loop with tools | `agent.service.ts`, `agent.controller.ts` |
| `RagModule` | Vector search + LLM | `rag.service.ts`, `rag.controller.ts` |
| `IntentModule` | Explicit intent analysis | `intent.service.ts`, `intent.controller.ts` |
| `DbQueryModule` | Raw vector retrieval | `db-query.service.ts`, `db-query.controller.ts` |
| `RouterModule` | Auto-routing logic | `router.service.ts`, handlers/ |
| `SessionModule` | Conversation state | `session.service.ts` |

**Tools Available (AgentModule):**
- `query_user` - Query in-memory user database
- `send_mail` - Send emails via SMTP
- `web_search` - Search via Bocha AI API

**API Endpoints:**
```
POST   /intent/analyze          # Analyze query intent
GET    /agent/stream?query=xxx  # Agent with tools (SSE)
GET    /rag/stream?query=xxx    # RAG streaming (SSE)
GET    /db/query?query=xxx      # Raw vector search
POST   /chat/stream             # Basic chat (SSE)
POST   /router                  # Auto-route based on intent
```

### Frontend (`ai-chat/frontend/`)

React + Vite application with query routing UI.

**Key Files:**
- `src/hooks/useQueryRouter.js` - Main hook for intent analysis + routing
- `src/services/chatApi.js` - API client for all endpoints
- `src/components/ChatContainer/ChatContainer.jsx` - Main chat UI

---

## Development Commands

### Backend

```bash
cd ai-chat/backend

# Install dependencies
npm install

# Development (watch mode)
npm run start:dev

# Production build
npm run build

# Start production
npm run start:prod

# Lint
npm run lint
```

### Frontend

```bash
cd ai-chat/frontend

# Install dependencies
npm install

# Development server (port 5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### Running Full Stack

```bash
# Terminal 1 - Backend
cd ai-chat/backend
npm run start:dev

# Terminal 2 - Frontend
cd ai-chat/frontend
npm run dev

# Access frontend at http://localhost:5173
# Backend API at http://localhost:3000
```

---

## Environment Variables

### ai-chat/backend/.env

```bash
# OpenAI/DashScope
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen-plus
OPENAI_TEMPERATURE=0.7
EMBEDDING_MODEL_NAME=text-embedding-v3

# Milvus Vector DB
MILVUS_ADDRESS=your_milvus_endpoint
MILVUS_TOKEN=your_milvus_token

# Email (for agent tools)
MAIL_HOST=smtp.qq.com
MAIL_PORT=465
MAIL_USER=your_email
MAIL_PASS=your_password
MAIL_SECURE=true
MAIL_FROM="AI Agent" <your_email>

# Web Search (Bocha AI)
BOCHA_API_KEY=your_key

# Server
PORT=3000
```

---

## MyDemo Learning Projects

Standalone learning implementations (not part of ai-chat):

### RAG Book System (`MyDemo/rag-book/`)

Simple RAG implementation for "天龙八部" novel.

**Files:**
- `ebook-writer.mjs` - EPUB ingestion to Milvus
- `ebook-rag.mjs` - RAG query with LLM
- `ebook-query.mjs` - Vector search only

**Usage:**
```bash
cd MyDemo/rag-book
node ebook-writer.mjs  # Ingest EPUB
node ebook-rag.mjs     # Query
```

### ReAct Loop (`MyDemo/ReAct Loop/`)

Early NestJS + LangChain experiment (superseded by ai-chat/backend).

**Note:** This was the prototype that evolved into ai-chat/backend. Use ai-chat for new development.

---

## Key Implementation Patterns

### Intent Analysis Flow

```typescript
// 1. Analyze intent
const { intent, confidence, sessionId } = await analyzeIntent(query);

// 2. Route based on intent
switch (intent) {
  case 'rag':       // RAG retrieval + generation
  case 'agent':     // Tool calling with ReAct
  case 'retrieval': // Raw vector search
  case 'chat':      // Direct LLM chat
}
```

### Streaming SSE Response

```typescript
// Backend
@Sse('stream')
stream(@Query('query') query: string): Observable<MessageEvent> {
  const stream = this.service.stream(query);
  return from(stream).pipe(map(chunk => ({ data: chunk })));
}

// Frontend
const response = await fetch('/agent/stream?query=xxx');
const reader = response.body.getReader();
// Read chunks and decode
```

### Tool Definition (LangChain)

```typescript
const tool = tool(
  async (args) => { /* implementation */ },
  {
    name: 'tool_name',
    description: 'What the tool does',
    schema: { /* JSON schema */ } as any,
  }
);
```

---

## Data Models

### Session
```typescript
interface Session {
  id: string;
  messages: BaseMessage[];
  metadata: {
    lastIntent?: 'rag' | 'agent' | 'db';
    createdAt: Date;
    lastActiveAt: Date;
  };
}
```

### IntentResult
```typescript
interface IntentResult {
  intent: 'rag' | 'chat' | 'retrieval' | 'agent';
  confidence: number;  // 0-1
  reason: string;
  sessionId: string;
}
```

---

## Troubleshooting

**Port already in use:**
```bash
npx kill-port 3000  # Backend
npx kill-port 5173  # Frontend
```

**TypeScript errors in ai-chat:**
```bash
cd ai-chat/backend
npx tsc --noEmit
```

**Missing dependencies:**
```bash
cd ai-chat/backend && npm install
cd ai-chat/frontend && npm install
```
