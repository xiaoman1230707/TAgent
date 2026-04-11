import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient, MetricType } from '@zilliz/milvus2-sdk-node';
import { OpenAIEmbeddings } from '@langchain/openai';
import { DbQueryResponse, DbQueryResult } from './db-query.types';

/**
 * DB 查询服务
 * 纯向量检索服务，无 LLM 参与
 * 复用 RagService 的 Milvus 连接逻辑
 */
@Injectable()
export class DbQueryService implements OnModuleInit {
  private milvusClient: MilvusClient;
  private embeddings: OpenAIEmbeddings;

  readonly COLLECTION_NAME = 'TianLong';
  readonly VECTOR_DIM = 1024;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 模块初始化时创建 MilvusClient 和 OpenAIEmbeddings
   */
  onModuleInit() {
    // 初始化 MilvusClient
    const milvusAddress = this.configService.get<string>('MILVUS_ADDRESS');
    const milvusToken = this.configService.get<string>('MILVUS_TOKEN');

    if (!milvusAddress) {
      throw new Error('MILVUS_ADDRESS is not configured');
    }

    this.milvusClient = new MilvusClient({
      address: milvusAddress,
      token: milvusToken,
    });

    // 初始化 OpenAIEmbeddings（复用 RagService 配置）
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const baseURL = this.configService.get<string>('OPENAI_BASE_URL');
    const model = this.configService.get<string>('EMBEDDING_MODEL_NAME') || 'text-embedding-v3';

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    this.embeddings = new OpenAIEmbeddings({
      apiKey,
      model,
      configuration: {
        baseURL,
      },
      dimensions: this.VECTOR_DIM,
    });

    console.log('[DbQueryService] 初始化完成');
  }

  /**
   * 执行向量检索查询
   * @param query 查询文本
   * @param limit 返回结果数量，默认 5
   * @returns 查询响应
   */
  async query(query: string, limit: number = 5): Promise<DbQueryResponse> {
    console.log(`[DB Query] 开始查询: "${query}", limit=${limit}`);

    try {
      // 1. 加载集合
      await this.loadCollection();

      // 2. 生成查询向量的 embedding
      const queryVector = await this.embeddings.embedQuery(query);

      // 3. Milvus 向量检索（使用 COSINE 相似度）
      const searchResult = await this.milvusClient.search({
        collection_name: this.COLLECTION_NAME,
        vector: queryVector,
        limit,
        metric_type: MetricType.COSINE,
        output_fields: ['id', 'book_id', 'book_name', 'chapter_num', 'index', 'content'],
      });

      // 4. 格式化结果
      const results: DbQueryResult[] = searchResult.results.map((item) => ({
        id: String(item.id),
        book_id: String(item.book_id),
        book_name: String(item.book_name || '天龙八部'),
        chapter_num: Number(item.chapter_num),
        index: Number(item.index),
        content: String(item.content),
        score: Number(item.score),
      }));

      console.log(`[DB Query] 查询完成，返回 ${results.length} 条结果`);

      return {
        query,
        count: results.length,
        results,
      };
    } catch (error) {
      console.error('[DB Query] 查询失败:', error.message);
      throw new Error(`DB 查询失败: ${error.message}`);
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
    }
  }
}
