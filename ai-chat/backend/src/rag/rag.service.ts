import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MILVUS_CLIENT } from './milvus.provider';
import { LLM_MODEL } from '../llm/llm.provider';
import { RagRequestDto } from './dto/rag-request.dto';
import {
  extractChapterName,
  extractCharacters,
  extractExcerpt,
  extractKeywords,
} from './utils/text-analyzer';
import { EnhancedSearchDto } from './dto/enhanced-search.dto';

/**
 * RAG 服务
 * 复用 MyDemo/rag-book/ebook-rag.mjs 的核心逻辑
 * 实现向量检索 + LLM 回答生成
 */
@Injectable()
export class RagService {
  private readonly collectionName: string;
  private readonly vectorDim: number;
  private readonly embeddings: OpenAIEmbeddings;

  constructor(
    @Inject(MILVUS_CLIENT) private readonly milvusClient: MilvusClient,
    @Inject(LLM_MODEL) private readonly llm: ChatOpenAI,
    private readonly configService: ConfigService,
  ) {
    // 复用原有的集合配置
    this.collectionName = 'TianLong';
    this.vectorDim = 1024;

    // 初始化 Embeddings（复用原有配置）
    this.embeddings = new OpenAIEmbeddings({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      model: this.configService.get<string>('EMBEDDING_MODEL_NAME') || 'text-embedding-v3',
      configuration: {
        baseURL: this.configService.get<string>('OPENAI_BASE_URL'),
      },
      dimensions: this.vectorDim,
    });
  }

  /**
   * RAG 流式回答
   * 1. 向量检索获取相关文档
   * 2. 构建 Prompt
   * 3. 流式生成回答
   */
  async *streamRagAnswer(dto: RagRequestDto): AsyncIterable<string> {
    const { question, topK = 3, systemPrompt } = dto;

    console.log(`[RAG] 开始处理问题: ${question}`);

    // 1. 向量检索（复用 ebook-rag.mjs 的 retrieveRelevantContent 逻辑）
    const retrievedContent = await this.retrieveRelevantContent(question, topK);
    console.log(`[RAG] 检索到 ${retrievedContent.length} 条相关内容`);

    if (retrievedContent.length === 0) {
      yield '抱歉，在我的知识库中没有找到相关内容。';
      return;
    }

    // 2. 构建 Context（复用原有 prompt 构建逻辑）
    const context = this.buildContext(retrievedContent);

    // 3. 构建消息
    const messages = this.buildMessages(question, context, systemPrompt);

    // 4. 流式生成（复用 ebook-rag.mjs 的流式调用逻辑）
    try {
      const stream = await this.llm.stream(messages);

      for await (const chunk of stream) {
        const content = chunk.content as string;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('[RAG] 流式生成失败:', error);
      throw new Error(`RAG 生成失败: ${error.message}`);
    }
  }

  /**
   * 向量检索
   * 复用 ebook-rag.mjs 中的 retrieveRelevantContent 函数逻辑
   */
  private async retrieveRelevantContent(question: string, k: number = 3) {
    try {
      // 加载集合
      await this.loadCollection();

      // 生成查询向量
      const queryVector = await this.embeddings.embedQuery(question);

      // 向量搜索（复用原有搜索参数）
      const searchResult = await this.milvusClient.search({
        collection_name: this.collectionName,
        vector: queryVector,
        limit: k,
        metric_type: MetricType.COSINE,
        output_fields: ['id', 'book_id', 'book_name', 'chapter_num', 'index', 'content'],
      });

      return searchResult.results;
    } catch (err) {
      console.error('[RAG] 向量搜索失败:', err.message);
      return [];
    }
  }

  /**
   * 加载集合
   */
  private async loadCollection(): Promise<void> {
    try {
      await this.milvusClient.loadCollection({
        collection_name: this.collectionName,
      });
    } catch (err) {
      // 集合可能已加载，忽略错误
    }
  }

  /**
   * 构建上下文
   * 复用 ebook-rag.mjs 中的 context 构建逻辑
   */
  private buildContext(results: any[]): string {
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
   * 复用 ebook-rag.mjs 中的 prompt 模板
   */
  private buildMessages(question: string, context: string, customSystemPrompt?: string): any[] {
    const defaultSystemPrompt = `你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。`;

    const prompt = `
${customSystemPrompt || defaultSystemPrompt}

请根据以下《天龙八部》小说片段内容回答问题：
${context}

用户问题：${question}

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
   * 复用 ebook-query.mjs 的功能
   */
  async vectorSearch(query: string, limit: number = 3) {
    await this.loadCollection();
    const queryVector = await this.embeddings.embedQuery(query);

    const searchResult = await this.milvusClient.search({
      collection_name: this.collectionName,
      vector: queryVector,
      limit,
      metric_type: MetricType.COSINE,
      output_fields: ['id', 'content', 'book_id', 'chapter_num', 'index'],
    });

    return searchResult.results.map((item, index) => ({
      rank: index + 1,
      score: item.score.toFixed(2),
      id: item.id,
      bookId: item.book_id,
      chapterNum: item.chapter_num,
      index: item.index,
      content: item.content,
    }));
  }

  /**
   * 流式回答（别名方法，用于统一接口）
   * @param question 问题
   * @returns 流式字符串迭代器
   */
  async *streamAnswer(question: string): AsyncIterable<string> {
    yield* this.streamRagAnswer({ question });
  }

  /**
   * 增强向量检索
   * 返回小说原文 + 完整元数据（章节名、人物等）
   * @param dto 增强搜索参数
   * @returns 带元数据的检索结果
   */
  async enhancedSearch(dto: EnhancedSearchDto) {
    const { query, limit = 5, extractCharacters: extractCharactersFlag = true, excerptLength = 200 } = dto;

    console.log(`[RAG] 增强检索: ${query}`);

    // 1. 加载集合并执行向量搜索
    await this.loadCollection();
    const queryVector = await this.embeddings.embedQuery(query);

    const searchResult = await this.milvusClient.search({
      collection_name: this.collectionName,
      vector: queryVector,
      limit,
      metric_type: MetricType.COSINE,
      output_fields: ['id', 'book_id', 'book_name', 'chapter_num', 'index', 'content'],
    });

    // 2. 提取查询关键词（用于生成摘要）
    const keywords = extractKeywords(query);

    // 3. 处理结果，添加元数据
    const results = searchResult.results.map((item, index) => {
      const content = item.content as string;

      // 提取元数据
      const metadata = {
        bookName: item.book_name || '天龙八部',
        chapterNum: item.chapter_num,
        chapterName: extractChapterName(content, item.chapter_num),
        fragmentIndex: item.index,
      };

      // 提取人物
      const characters = extractCharactersFlag
        ? extractCharacters(content)
        : [];

      // 生成摘要
      const excerpt = extractExcerpt(content, keywords, excerptLength);

      return {
        id: item.id,
        rank: index + 1,
        score: parseFloat(item.score.toFixed(4)),
        metadata,
        content, // 完整原文
        excerpt, // 摘要/高亮片段
        characters, // 主要人物
      };
    });

    return {
      query,
      total: results.length,
      keywords, // 提取的查询关键词
      results,
    };
  }
}
