import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { SessionService } from '../session/session.service';
import { RagChunk, SearchResultItem } from './rag.types';

/**
 * RAG 服务
 * 整合向量检索和 LLM 生成，提供流式回答能力
 */
@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private readonly COLLECTION_NAME = 'TianLong';
  private readonly VECTOR_DIM = 1024;

  private milvusClient: MilvusClient;
  private embeddings: OpenAIEmbeddings;
  private model: ChatOpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * 模块初始化时设置 Milvus 和 OpenAI 客户端
   */
  onModuleInit() {
    const milvusAddress = this.configService.get<string>('MILVUS_ADDRESS');
    const milvusToken = this.configService.get<string>('MILVUS_TOKEN');
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    const openaiBaseUrl = this.configService.get<string>('OPENAI_BASE_URL') ||
                          this.configService.get<string>('OPENAI_API_BASE_URL');
    const embeddingModelName = this.configService.get<string>('EMBEDDING_MODEL_NAME') || 'text-embedding-v3';
    const llmModelName = this.configService.get<string>('OPENAI_MODEL_NAME') || 'qwen-plus';

    if (!milvusAddress || !milvusToken) {
      throw new Error('MILVUS_ADDRESS and MILVUS_TOKEN must be configured');
    }

    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY must be configured');
    }

    // 初始化 Milvus 客户端
    this.milvusClient = new MilvusClient({
      address: milvusAddress,
      token: milvusToken,
    });

    // 初始化 Embeddings
    this.embeddings = new OpenAIEmbeddings({
      apiKey: openaiApiKey,
      model: embeddingModelName,
      configuration: {
        baseURL: openaiBaseUrl,
      },
      dimensions: this.VECTOR_DIM,
    });

    // 初始化 LLM
    this.model = new ChatOpenAI({
      apiKey: openaiApiKey,
      model: llmModelName,
      configuration: {
        baseURL: openaiBaseUrl,
      },
      temperature: 0.7,
    });

    this.logger.log('RAG Service initialized');
  }

  /**
   * 流式生成 RAG 回答
   * @param query 用户查询
   * @param sessionId 会话ID
   */
  async *streamAnswer(query: string, sessionId: string): AsyncGenerator<RagChunk> {
    try {
      // 1. 发送开始标记
      yield { type: 'start' };

      // 2. 生成 query 的 embedding
      this.logger.debug(`Generating embedding for query: ${query}`);
      const queryVector = await this.embeddings.embedQuery(query);

      // 3. Milvus 检索
      this.logger.debug('Searching Milvus collection...');
      const searchResults = await this.searchMilvus(queryVector, 3);

      // 4. 如果没结果，yield error 并返回
      if (searchResults.length === 0) {
        yield { type: 'error', error: '未找到相关内容' };
        return;
      }

      // 5. 构建 prompt
      const context = this.buildContext(searchResults);
      const messages = this.buildMessages(query, context);

      // 6. 将 user query 添加到 session
      this.sessionService.addMessage(sessionId, new HumanMessage(query));

      // 7. 流式调用 model.stream()
      this.logger.debug('Streaming LLM response...');
      const stream = await this.model.stream(messages);

      // 8. yield chunks
      let fullAnswer = '';
      for await (const chunk of stream) {
        const content = chunk.content as string;
        if (content) {
          fullAnswer += content;
          yield { type: 'chunk', content };
        }
      }

      // 9. 保存完整回答到 session
      this.sessionService.addMessage(sessionId, new AIMessage(fullAnswer));
      this.sessionService.setIntent(sessionId, 'rag');

      // 10. yield end
      yield { type: 'end' };

    } catch (error) {
      this.logger.error('RAG stream error:', error.message);
      yield { type: 'error', error: error.message || 'RAG 服务内部错误' };
    }
  }

  /**
   * Milvus 向量检索
   * @param queryVector 查询向量
   * @param topK 返回结果数量
   */
  private async searchMilvus(queryVector: number[], topK: number): Promise<SearchResultItem[]> {
    try {
      // 加载集合
      await this.loadCollection();

      // 执行搜索
      const searchResult = await this.milvusClient.search({
        collection_name: this.COLLECTION_NAME,
        vector: queryVector,
        limit: topK,
        metric_type: MetricType.COSINE,
        output_fields: ['id', 'book_id', 'book_name', 'chapter_num', 'index', 'content'],
      });

      return searchResult.results.map((item: any) => ({
        id: item.id,
        book_id: item.book_id,
        book_name: item.book_name,
        chapter_num: item.chapter_num,
        index: item.index,
        content: item.content,
        score: item.score,
      }));
    } catch (err) {
      this.logger.error('Milvus search failed:', err.message);
      return [];
    }
  }

  /**
   * 加载 Milvus 集合
   */
  private async loadCollection(): Promise<void> {
    try {
      await this.milvusClient.loadCollection({
        collection_name: this.COLLECTION_NAME,
      });
    } catch (err) {
      // 集合可能已加载，忽略错误
      this.logger.debug('Collection load attempted (may already be loaded)');
    }
  }

  /**
   * 构建上下文
   * @param results 检索结果
   */
  private buildContext(results: SearchResultItem[]): string {
    return results
      .map((item, i) => `
[片段${i + 1}]
章节：第${item.chapter_num}章
内容：${item.content}
      `.trim())
      .join('\n\n----\n\n');
  }

  /**
   * 构建 LLM 消息
   * @param query 用户问题
   * @param context 上下文
   */
  private buildMessages(query: string, context: string): any[] {
    const systemPrompt = `你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。`;

    const prompt = `
${systemPrompt}

请根据以下《天龙八部》小说片段内容回答问题：
${context}

用户问题：${query}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详情，准确地回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关的信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI助手的回答：
    `.trim();

    return [new HumanMessage(prompt)];
  }

  /**
   * 仅向量检索（用于调试）
   * @param query 查询文本
   * @param limit 返回数量
   */
  async vectorSearch(query: string, limit: number = 3): Promise<SearchResultItem[]> {
    const queryVector = await this.embeddings.embedQuery(query);
    return this.searchMilvus(queryVector, limit);
  }
}
