# Query 分流路由系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ReAct Loop 项目中实现 query 分流路由系统，通过意图识别自动选择 RAG/Agent/DB 三种处理流程。

**Architecture:** 新增 IntentService 做 LLM 意图分类，SessionService 维护对话上下文，RagService/DbService 封装原有 RAG Book 功能，AgentService 复用现有 ReAct 逻辑。统一 NestJS 模块架构。

**Tech Stack:** NestJS, LangChain, TypeScript, Milvus, OpenAI/DashScope API

---

## 文件结构规划

```
MyDemo/ReAct Loop/
├── session/
│   ├── session.service.ts      # 会话管理（内存 Map 存储）
│   └── session.interface.ts    # Session 类型定义
├── intent/
│   ├── intent.service.ts       # LLM 意图识别
│   └── intent.controller.ts    # POST /intent/analyze
├── rag/
│   ├── rag.service.ts          # RAG 流程封装（整合 ebook-rag）
│   └── rag.controller.ts       # GET /rag/stream
├── db-query/
│   ├── db-query.service.ts     # 原文查询（整合 ebook-query）
│   └── db-query.controller.ts  # GET /db/query
├── ai/
│   ├── ai.service.ts           # 修改：添加 session 支持
│   └── ai.controller.ts        # 修改：更新端点
└── app.module.ts               # 修改：注册新模块
```

---

## Task 1: Session 模块 - 基础类型定义

**Files:**
- Create: `session/session.interface.ts`

- [ ] **Step 1: 创建 Session 接口和类型**

```typescript
// session/session.interface.ts
import { BaseMessage } from '@langchain/core/messages';

export interface Session {
  id: string;
  messages: BaseMessage[];
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  lastIntent?: 'rag' | 'agent' | 'db';
  createdAt: Date;
  lastActiveAt: Date;
}

export interface CreateSessionDto {
  id?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add session/session.interface.ts
git commit -m "feat(session): add session interface definitions"
```

---

## Task 2: Session 模块 - SessionService 实现

**Files:**
- Create: `session/session.service.ts`
- Create: `session/session.module.ts`

- [ ] **Step 1: 实现 SessionService**

```typescript
// session/session.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Session, SessionMetadata } from './session.interface';
import { BaseMessage } from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessions = new Map<string, Session>();

  create(): Session {
    const id = uuidv4();
    const now = new Date();
    const session: Session = {
      id,
      messages: [],
      metadata: {
        createdAt: now,
        lastActiveAt: now,
      },
    };
    this.sessions.set(id, session);
    this.logger.log(`Created session: ${id}`);
    return session;
  }

  findById(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getOrCreate(id?: string): Session {
    if (id) {
      const existing = this.findById(id);
      if (existing) {
        existing.metadata.lastActiveAt = new Date();
        return existing;
      }
    }
    return this.create();
  }

  addMessage(sessionId: string, message: BaseMessage): void {
    const session = this.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    session.messages.push(message);
    session.metadata.lastActiveAt = new Date();
  }

  setIntent(sessionId: string, intent: 'rag' | 'agent' | 'db'): void {
    const session = this.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    session.metadata.lastIntent = intent;
    session.metadata.lastActiveAt = new Date();
  }

  delete(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) {
      this.logger.log(`Deleted session: ${id}`);
    }
    return deleted;
  }

  cleanupExpired(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let count = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.metadata.lastActiveAt.getTime() > maxAgeMs) {
        this.sessions.delete(id);
        count++;
      }
    }
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} expired sessions`);
    }
    return count;
  }
}
```

- [ ] **Step 2: 创建 SessionModule**

```typescript
// session/session.module.ts
import { Module } from '@nestjs/common';
import { SessionService } from './session.service';

@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
```

- [ ] **Step 3: 安装 uuid 依赖**

```bash
cd "MyDemo/ReAct Loop"
npm install uuid
npm install -D @types/uuid
```

- [ ] **Step 4: Commit**

```bash
git add session/
git commit -m "feat(session): add session management service"
```

---

## Task 3: Intent 模块 - IntentService 实现

**Files:**
- Create: `intent/intent.service.ts`
- Modify: `app.module.ts`（添加 ConfigModule 确保配置可用）

- [ ] **Step 1: 创建 IntentResult 类型**

在 `intent/intent.types.ts` 创建：

```typescript
// intent/intent.types.ts
export interface IntentResult {
  intent: 'rag' | 'agent' | 'db';
  confidence: number;
  reason: string;
}
```

- [ ] **Step 2: 实现 IntentService**

```typescript
// intent/intent.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { IntentResult } from './intent.types';

@Injectable()
export class IntentService {
  private readonly logger = new Logger(IntentService.name);

  constructor(
    @Inject('CHAT_MODEL') private readonly model: ChatOpenAI,
  ) {}

  async analyze(query: string): Promise<IntentResult> {
    const prompt = this.buildPrompt(query);

    try {
      const response = await this.model.invoke([
        new SystemMessage(prompt.system),
        new HumanMessage(prompt.user),
      ]);

      const content = response.content as string;
      return this.parseIntent(content);
    } catch (error) {
      this.logger.error('Intent analysis failed:', error.message);
      // 默认返回 agent
      return {
        intent: 'agent',
        confidence: 0,
        reason: '意图识别失败，使用默认流程',
      };
    }
  }

  private buildPrompt(query: string): { system: string; user: string } {
    const system = `你是一个查询意图分类助手。分析用户输入，判断应该进入哪个处理流程。

可选流程：
- rag: 用户询问《天龙八部》小说内容、人物、情节等，需要 RAG 增强回答
- agent: 用户需要工具协助（查询用户信息、发邮件、搜索），或意图不明确
- db: 用户明确要求查询原文、获取原始片段，不需要 LLM 总结

输出 JSON 格式，不要包含其他内容：
{
  "intent": "rag|agent|db",
  "confidence": 0.0-1.0,
  "reason": "简短说明判断理由"
}

规则：
1. 模糊场景（如只说"查一下"）默认选择 agent
2. 涉及工具调用、发邮件、查用户信息的一定是 agent
3. 明确要求"原文"、"原始片段"、"数据库查询"的是 db
4. 询问小说人物、情节的是 rag`;

    const user = `用户输入："""${query}"""

请输出 JSON 格式的意图分析结果：`;

    return { system, user };
  }

  private parseIntent(content: string): IntentResult {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证并规范化
      const intent = this.validateIntent(parsed.intent);
      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0));
      const reason = parsed.reason || '未提供理由';

      return { intent, confidence, reason };
    } catch (error) {
      this.logger.warn('Failed to parse intent JSON, using default:', error.message);
      return {
        intent: 'agent',
        confidence: 0,
        reason: '解析失败，使用默认流程',
      };
    }
  }

  private validateIntent(intent: string): 'rag' | 'agent' | 'db' {
    if (intent === 'rag' || intent === 'agent' || intent === 'db') {
      return intent;
    }
    return 'agent'; // 默认
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add intent/
git commit -m "feat(intent): add intent analysis service"
```

---

## Task 4: Intent 模块 - Controller 和 Module

**Files:**
- Create: `intent/intent.controller.ts`
- Create: `intent/intent.module.ts`

- [ ] **Step 1: 创建 IntentController**

```typescript
// intent/intent.controller.ts
import { Body, Controller, Post, Logger } from '@nestjs/common';
import { IntentService } from './intent.service';
import { SessionService } from '../session/session.service';

interface AnalyzeIntentDto {
  query: string;
  sessionId?: string;
}

@Controller('intent')
export class IntentController {
  private readonly logger = new Logger(IntentController.name);

  constructor(
    private readonly intentService: IntentService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('analyze')
  async analyze(@Body() dto: AnalyzeIntentDto) {
    const { query, sessionId } = dto;

    this.logger.log(`Analyzing intent for query: ${query.substring(0, 50)}...`);

    // 获取或创建 session
    const session = this.sessionService.getOrCreate(sessionId);

    // 分析意图
    const result = await this.intentService.analyze(query);

    // 更新 session 的意图
    this.sessionService.setIntent(session.id, result.intent);

    return {
      ...result,
      sessionId: session.id,
    };
  }
}
```

- [ ] **Step 2: 创建 IntentModule**

```typescript
// intent/intent.module.ts
import { Module } from '@nestjs/common';
import { IntentController } from './intent.controller';
import { IntentService } from './intent.service';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  controllers: [IntentController],
  providers: [IntentService],
  exports: [IntentService],
})
export class IntentModule {}
```

- [ ] **Step 3: Commit**

```bash
git add intent/
git commit -m "feat(intent): add intent controller and module"
```

---

## Task 5: RAG 模块 - RagService 实现

**Files:**
- Create: `rag/rag.service.ts`
- Create: `rag/rag.types.ts`

- [ ] **Step 1: 创建 RAG 类型定义**

```typescript
// rag/rag.types.ts
export interface RagConfig {
  collectionName: string;
  vectorDim: number;
  topK: number;
}

export interface SearchResult {
  id: string;
  book_id: string;
  book_name: string;
  chapter_num: number;
  index: number;
  content: string;
  score: number;
}

export interface RagChunk {
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;
  error?: string;
}
```

- [ ] **Step 2: 实现 RagService**

```typescript
// rag/rag.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { SessionService } from '../session/session.service';
import { RagChunk, SearchResult } from './rag.types';

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private milvusClient: MilvusClient;
  private embeddings: OpenAIEmbeddings;
  private model: ChatOpenAI;

  private readonly COLLECTION_NAME = 'TianLong';
  private readonly VECTOR_DIM = 1024;
  private readonly DEFAULT_TOP_K = 3;

  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {}

  onModuleInit() {
    // 初始化 Milvus 客户端
    this.milvusClient = new MilvusClient({
      address: this.configService.get<string>('MILVUS_ADDRESS')!,
      token: this.configService.get<string>('MILVUS_TOKEN')!,
    });

    // 初始化 Embeddings
    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      model: this.configService.get<string>('EMBEDDING_MODEL_NAME'),
      configuration: {
        baseURL: this.configService.get<string>('OPENAI_API_BASE_URL'),
      },
      dimensions: this.VECTOR_DIM,
    });

    // 初始化 LLM
    this.model = new ChatOpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      model: this.configService.get<string>('OPENAI_MODEL_NAME'),
      configuration: {
        baseURL: this.configService.get<string>('OPENAI_API_BASE_URL'),
      },
      temperature: 0.7,
    });

    this.logger.log('RagService initialized');
  }

  async *streamAnswer(query: string, sessionId: string): AsyncGenerator<RagChunk> {
    try {
      yield { type: 'start' };

      // 获取向量嵌入
      const queryVector = await this.embeddings.embedQuery(query);

      // Milvus 检索
      const searchResult = await this.milvusClient.search({
        collection_name: this.COLLECTION_NAME,
        vector: queryVector,
        limit: this.DEFAULT_TOP_K,
        metric_type: MetricType.COSINE,
        output_fields: ['id', 'book_id', 'book_name', 'chapter_num', 'index', 'content'],
      });

      const results: SearchResult[] = searchResult.results.map((r: any) => ({
        id: r.id,
        book_id: r.book_id,
        book_name: r.book_name,
        chapter_num: r.chapter_num,
        index: r.index,
        content: r.content,
        score: r.score,
      }));

      if (results.length === 0) {
        yield { type: 'chunk', content: '未找到相关内容，请尝试其他关键词。' };
        yield { type: 'end' };
        return;
      }

      // 构建上下文
      const context = results.map((item, i) => `
[片段${i + 1}]
章节：第${item.chapter_num}章
内容：${item.content}
`).join('\n\n----\n\n');

      // 构建 prompt
      const prompt = this.buildRagPrompt(query, context);

      // 添加到 session 历史
      this.sessionService.addMessage(sessionId, new HumanMessage(query));

      // 流式生成回答
      const stream = await this.model.stream([
        new SystemMessage(prompt.system),
        new HumanMessage(prompt.user),
      ]);

      let fullContent = '';
      for await (const chunk of stream) {
        const content = chunk.content as string;
        if (content) {
          fullContent += content;
          yield { type: 'chunk', content };
        }
      }

      // 保存 AI 回复到 session
      this.sessionService.addMessage(sessionId, new SystemMessage(fullContent));

      yield { type: 'end' };
    } catch (error) {
      this.logger.error('RAG error:', error.message);
      yield { type: 'error', error: error.message };
    }
  }

  private buildRagPrompt(query: string, context: string): { system: string; user: string } {
    const system = `你是一个专业的《天龙八部》小说助手。基于提供的小说片段内容回答用户问题。

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出准确、详细的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答`;

    const user = `根据以下《天龙八部》小说片段内容回答问题：

${context}

用户问题：${query}

AI助手的回答：`;

    return { system, user };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add rag/
git commit -m "feat(rag): add RAG service with Milvus integration"
```

---

## Task 6: RAG 模块 - RagController

**Files:**
- Create: `rag/rag.controller.ts`
- Create: `rag/rag.module.ts`

- [ ] **Step 1: 创建 RagController**

```typescript
// rag/rag.controller.ts
import { Controller, Get, Query, Sse, Logger } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { RagService } from './rag.service';
import { SessionService } from '../session/session.service';

@Controller('rag')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(
    private readonly ragService: RagService,
    private readonly sessionService: SessionService,
  ) {}

  @Sse('stream')
  stream(
    @Query('query') query: string,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    if (!query) {
      return from([{ type: 'error', error: 'Query is required' }]).pipe(
        map((data) => ({ data }) as MessageEvent),
      );
    }

    // 获取或创建 session
    const session = this.sessionService.getOrCreate(sessionId);
    this.logger.log(`RAG stream for session: ${session.id}, query: ${query.substring(0, 50)}...`);

    const stream = this.ragService.streamAnswer(query, session.id);

    return from(stream).pipe(
      map((chunk) => ({ data: chunk }) as MessageEvent),
    );
  }
}
```

- [ ] **Step 2: 创建 RagModule**

```typescript
// rag/rag.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [ConfigModule, SessionModule],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
```

- [ ] **Step 3: Commit**

```bash
git add rag/
git commit -m "feat(rag): add RAG controller and module"
```

---

## Task 7: DB 查询模块 - DbQueryService

**Files:**
- Create: `db-query/db-query.service.ts`
- Create: `db-query/db-query.types.ts`

- [ ] **Step 1: 创建 DB 查询类型**

```typescript
// db-query/db-query.types.ts
export interface DbQueryResult {
  id: string;
  book_id: string;
  book_name: string;
  chapter_num: number;
  index: number;
  content: string;
  score: number;
}

export interface DbQueryResponse {
  query: string;
  count: number;
  results: DbQueryResult[];
}
```

- [ ] **Step 2: 实现 DbQueryService**

```typescript
// db-query/db-query.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { DbQueryResponse, DbQueryResult } from './db-query.types';

@Injectable()
export class DbQueryService implements OnModuleInit {
  private readonly logger = new Logger(DbQueryService.name);
  private milvusClient: MilvusClient;
  private embeddings: OpenAIEmbeddings;

  private readonly COLLECTION_NAME = 'TianLong';
  private readonly VECTOR_DIM = 1024;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.milvusClient = new MilvusClient({
      address: this.configService.get<string>('MILVUS_ADDRESS')!,
      token: this.configService.get<string>('MILVUS_TOKEN')!,
    });

    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      model: this.configService.get<string>('EMBEDDING_MODEL_NAME'),
      configuration: {
        baseURL: this.configService.get<string>('OPENAI_API_BASE_URL'),
      },
      dimensions: this.VECTOR_DIM,
    });

    this.logger.log('DbQueryService initialized');
  }

  async query(query: string, limit: number = 5): Promise<DbQueryResponse> {
    try {
      const queryVector = await this.embeddings.embedQuery(query);

      const searchResult = await this.milvusClient.search({
        collection_name: this.COLLECTION_NAME,
        vector: queryVector,
        limit,
        metric_type: MetricType.COSINE,
        output_fields: ['id', 'book_id', 'book_name', 'chapter_num', 'index', 'content'],
      });

      const results: DbQueryResult[] = searchResult.results.map((r: any) => ({
        id: r.id,
        book_id: r.book_id,
        book_name: r.book_name,
        chapter_num: r.chapter_num,
        index: r.index,
        content: r.content,
        score: r.score,
      }));

      return {
        query,
        count: results.length,
        results,
      };
    } catch (error) {
      this.logger.error('DB query error:', error.message);
      throw error;
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add db-query/
git commit -m "feat(db-query): add database query service"
```

---

## Task 8: DB 查询模块 - Controller 和 Module

**Files:**
- Create: `db-query/db-query.controller.ts`
- Create: `db-query/db-query.module.ts`

- [ ] **Step 1: 创建 DbQueryController**

```typescript
// db-query/db-query.controller.ts
import { Controller, Get, Query, Logger, BadRequestException } from '@nestjs/common';
import { DbQueryService } from './db-query.service';

@Controller('db')
export class DbQueryController {
  private readonly logger = new Logger(DbQueryController.name);

  constructor(private readonly dbQueryService: DbQueryService) {}

  @Get('query')
  async query(
    @Query('query') query: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) {
      throw new BadRequestException('Query parameter is required');
    }

    const parsedLimit = limit ? parseInt(limit, 10) : 5;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
      throw new BadRequestException('Limit must be between 1 and 20');
    }

    this.logger.log(`DB query: ${query.substring(0, 50)}..., limit: ${parsedLimit}`);

    return this.dbQueryService.query(query, parsedLimit);
  }
}
```

- [ ] **Step 2: 创建 DbQueryModule**

```typescript
// db-query/db-query.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbQueryController } from './db-query.controller';
import { DbQueryService } from './db-query.service';

@Module({
  imports: [ConfigModule],
  controllers: [DbQueryController],
  providers: [DbQueryService],
  exports: [DbQueryService],
})
export class DbQueryModule {}
```

- [ ] **Step 3: Commit**

```bash
git add db-query/
git commit -m "feat(db-query): add controller and module"
```

---

## Task 9: 修改 Agent 模块 - 添加 Session 支持

**Files:**
- Modify: `ai/ai.service.ts`
- Modify: `ai/ai.controller.ts`

- [ ] **Step 1: 修改 AiService 支持 Session**

```typescript
// ai/ai.service.ts - 修改部分
import { SessionService } from '../session/session.service';

// 在 constructor 中注入
constructor(
  @Inject('CHAT_MODEL') model: ChatOpenAI,
  @Inject('QUERY_USER_TOOL') private readonly queryUserTool: StructuredTool,
  @Inject('SEND_MAIL_TOOL') private readonly sendMailTool: StructuredTool,
  @Inject('WEB_SEARCH_TOOL') private readonly websearchTool: StructuredTool,
  private readonly sessionService: SessionService,  // 新增
) {
  // ... 原有代码
}

// 修改 runChainStream 方法签名
async *runChainStream(query: string, sessionId: string): AsyncIterable<string> {
  // 获取 session
  const session = this.sessionService.findById(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // 初始化消息：使用 session 历史或新建
  const messages: BaseMessage[] = session.messages.length > 0
    ? [...session.messages, new HumanMessage(query)]
    : [
        new SystemMessage('你是一个智能助手，可以在需要时调用工具来查询用户信息、发送邮件或搜索网页。'),
        new HumanMessage(query),
      ];

  // Agent loop 逻辑保持不变 ...
  while (true) {
    // ... 原有流式逻辑

    // 循环结束后保存完整对话历史到 session
    // 注意：这里需要修改，将完整 messages 保存回 session
  }
}
```

完整修改后的 `ai.service.ts`：

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Runnable } from '@langchain/core/runnables';
import {
  BaseMessage,
  AIMessage,
  SystemMessage,
  HumanMessage,
  ToolMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { StructuredTool } from '@langchain/core/tools';
import { SessionService } from '../session/session.service';

@Injectable()
export class AiService {
  private readonly modelWithTools: Runnable<BaseMessage[], AIMessage>;

  constructor(
    @Inject('CHAT_MODEL') model: ChatOpenAI,
    @Inject('QUERY_USER_TOOL') private readonly queryUserTool: StructuredTool,
    @Inject('SEND_MAIL_TOOL') private readonly sendMailTool: StructuredTool,
    @Inject('WEB_SEARCH_TOOL') private readonly websearchTool: StructuredTool,
    private readonly sessionService: SessionService,
  ) {
    this.modelWithTools = model.bindTools([
      this.queryUserTool,
      this.sendMailTool,
      this.websearchTool,
    ]);
  }

  async *runChainStream(query: string, sessionId: string): AsyncIterable<string> {
    const session = this.sessionService.findById(sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    // 构建消息历史
    const messages: BaseMessage[] = session.messages.length > 0
      ? [...session.messages]
      : [new SystemMessage('你是一个智能助手，可以在需要时调用工具来查询用户信息、发送邮件或搜索网页。')];

    // 添加当前用户消息
    messages.push(new HumanMessage(query));
    this.sessionService.addMessage(sessionId, new HumanMessage(query));

    // Agent loop
    while (true) {
      const stream = await this.modelWithTools.stream(messages);
      let fullAIMessage: AIMessageChunk | null = null;

      for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
        fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk;
        const hasToolCallChunk = !!fullAIMessage.tool_call_chunks &&
          fullAIMessage.tool_call_chunks.length > 0;
        if (!hasToolCallChunk && chunk.content) {
          yield chunk.content as string;
        }
      }

      if (!fullAIMessage) {
        return;
      }

      messages.push(fullAIMessage);

      const toolCalls = fullAIMessage.tool_calls ?? [];
      if (!toolCalls.length) {
        // 保存完整 AI 消息到 session
        this.sessionService.addMessage(sessionId, fullAIMessage as AIMessage);
        return;
      }

      for (const toolCall of toolCalls) {
        const toolCallId = toolCall.id || '';
        const toolName = toolCall.name;
        let result: string;

        if (toolName === 'query_user') {
          result = await this.queryUserTool.invoke(toolCall.args);
        } else if (toolName === 'send_mail') {
          result = await this.sendMailTool.invoke(toolCall.args);
        } else if (toolName === 'web_search') {
          result = await this.websearchTool.invoke(toolCall.args);
        } else {
          result = `Unknown tool: ${toolName}`;
        }

        const toolMessage = new ToolMessage({
          content: result,
          name: toolName,
          tool_call_id: toolCallId,
        });

        messages.push(toolMessage);
        this.sessionService.addMessage(sessionId, toolMessage);
      }
    }
  }
}
```

- [ ] **Step 2: 修改 AiController**

```typescript
// ai/ai.controller.ts - 完整修改
import {
  Controller,
  Get,
  Query,
  Sse,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { SessionService } from '../session/session.service';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('agent')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly sessionService: SessionService,
  ) {}

  @Sse('stream')
  chatStream(
    @Query('query') query: string,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    if (!query) {
      return from([{ type: 'error', error: 'Query is required' }]).pipe(
        map((data) => ({ data }) as MessageEvent),
      );
    }

    // 获取或创建 session
    const session = this.sessionService.getOrCreate(sessionId);
    this.logger.log(`Agent stream for session: ${session.id}`);

    const stream = this.aiService.runChainStream(query, session.id);

    return from(stream).pipe(
      map((chunk) => ({ data: { type: 'chunk', content: chunk } }) as MessageEvent),
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add ai/
git commit -m "feat(agent): add session support to agent service and controller"
```

---

## Task 10: 更新 AiModule 依赖

**Files:**
- Modify: `ai/ai.module.ts`

- [ ] **Step 1: 添加 SessionModule 导入**

```typescript
// ai/ai.module.ts
import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ChatOpenAI } from '@langchain/openai';
import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { MailerService } from '@nestjs-modules/mailer';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],  // 新增
  controllers: [AiController],
  providers: [
    AiService,
    UserService,
    // ... 原有的 providers 保持不变
    {
      provide: 'CHAT_MODEL',
      useFactory: (configService: ConfigService) => {
        return new ChatOpenAI({
          apiKey: configService.get('OPENAI_API_KEY'),
          configuration: {
            baseURL: configService.get('OPENAI_BASE_URL'),
          },
          model: configService.get('OPENAI_MODEL_NAME'),
        });
      },
      inject: [ConfigService],
    },
    // ... QUERY_USER_TOOL, SEND_MAIL_TOOL, WEB_SEARCH_TOOL 保持不变
  ],
})
export class AiModule {}
```

- [ ] **Step 2: Commit**

```bash
git add ai/ai.module.ts
git commit -m "chore(ai): add SessionModule import"
```

---

## Task 11: 更新 AppModule 注册所有模块

**Files:**
- Modify: `app.module.ts`

- [ ] **Step 1: 更新 AppModule 导入新模块**

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { SessionModule } from './session/session.module';
import { IntentModule } from './intent/intent.module';
import { RagModule } from './rag/rag.module';
import { DbQueryModule } from './db-query/db-query.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SessionModule,
    IntentModule,
    RagModule,
    DbQueryModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 2: Commit**

```bash
git add app.module.ts
git commit -m "feat(app): register all new modules"
```

---

## Task 12: 更新 .env 示例配置

**Files:**
- Modify: `.env.example`（如存在）或创建 `.env.example`

- [ ] **Step 1: 确保环境变量完整**

```bash
# 在 MyDemo/ReAct Loop/ 目录下检查 .env 文件包含
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL_NAME=qwen-plus
EMBEDDING_MODEL_NAME=text-embedding-v3

MILVUS_ADDRESS=your_milvus_endpoint
MILVUS_TOKEN=your_milvus_token

MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=your_email
MAIL_PASS=your_password
MAIL_SECURE=false
MAIL_FROM=noreply@example.com

BOCHA_API_KEY=your_key

PORT=3000
```

- [ ] **Step 2: Commit（如果修改了文件）**

```bash
git add .env.example
git commit -m "docs: update env example with all required configs"
```

---

## Task 13: 安装缺失依赖

**Files:**
- 命令执行

- [ ] **Step 1: 安装 Milvus SDK**

```bash
cd "MyDemo/ReAct Loop"
npm install @zilliz/milvus2-sdk-node
```

- [ ] **Step 2: 验证所有依赖**

```bash
npm install
```

- [ ] **Step 3: Commit package.json 更新**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add milvus sdk and uuid dependencies"
```

---

## Task 14: 端到端测试

**Files:**
- 命令执行

- [ ] **Step 1: 编译 TypeScript**

```bash
cd "MyDemo/ReAct Loop"
npx tsc --noEmit
```

预期：无编译错误

- [ ] **Step 2: 启动服务（确保 Milvus 和配置正确）**

```bash
npx ts-node main.ts
```

- [ ] **Step 3: 测试意图识别接口**

```bash
curl -X POST http://localhost:3000/intent/analyze \
  -H "Content-Type: application/json" \
  -d '{"query": "萧峰是谁"}'
```

预期返回：
```json
{
  "intent": "rag",
  "confidence": 0.92,
  "reason": "询问小说人物",
  "sessionId": "xxx"
}
```

- [ ] **Step 4: 测试 RAG 流式接口**

```bash
curl "http://localhost:3000/rag/stream?query=萧峰是谁&sessionId=xxx"
```

预期：SSE 流式返回回答

- [ ] **Step 5: 测试 Agent 流式接口**

```bash
curl "http://localhost:3000/agent/stream?query=查用户001&sessionId=xxx"
```

预期：SSE 流式返回，可能包含工具调用结果

- [ ] **Step 6: 测试 DB 查询接口**

```bash
curl "http://localhost:3000/db/query?query=萧峰&limit=3"
```

预期返回 JSON 格式的搜索结果

- [ ] **Step 7: Commit 测试记录（可选）**

```bash
git commit --allow-empty -m "test: e2e tests passed"
```

---

## 验证清单

实施完成后，系统应具备以下能力：

- [ ] `POST /intent/analyze` - 分析 query 意图，返回 rag/agent/db
- [ ] `GET /rag/stream` - RAG 流式回答（支持 session）
- [ ] `GET /agent/stream` - Agent 流式回答（支持 session 和工具）
- [ ] `GET /db/query` - 原文向量查询（无状态）
- [ ] Session 管理 - 支持多轮对话上下文
- [ ] 模糊 query 默认走 agent 流程
- [ ] SSE 流式输出正常

---

## 接口汇总

| 端点 | 方法 | 功能 |
|-----|------|------|
| `/intent/analyze` | POST | 意图识别，返回 intent + sessionId |
| `/rag/stream?query=xxx&sessionId=xxx` | SSE | RAG 问答 |
| `/agent/stream?query=xxx&sessionId=xxx` | SSE | Agent 工具调用 |
| `/db/query?query=xxx&limit=N` | GET | 原文检索 |
