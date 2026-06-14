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

      // 4. 格式化结果并按分数降序排序
      const results: DbQueryResult[] = searchResult.results
        .map((item) => ({
          id: String(item.id),
          book_id: String(item.book_id),
          book_name: String(item.book_name || '天龙八部'),
          chapter_num: Number(item.chapter_num),
          index: Number(item.index),
          content: String(item.content),
          score: Number(item.score),
        }))
        .sort((a, b) => b.score - a.score);

      // 5. 过滤只保留最相关的结果
      const filteredResults = this.filterMostRelevant(results, {
        maxDropRatio: 0.3,  // 相对最高分下降不超过30%
        minScore: 0.5,      // 最低绝对分数0.5
        maxResults: 3,      // 最多返回3条
      });

      console.log(`[DB Query] 查询完成，原始 ${results.length} 条，过滤后 ${filteredResults.length} 条`);

      return {
        query,
        count: filteredResults.length,
        results: filteredResults,
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

  /**
   * 过滤只保留最相关的结果
   * 基于相对分数下降和绝对阈值过滤
   */
  private filterMostRelevant(
    results: DbQueryResult[],
    options: {
      maxDropRatio: number;  // 相对下降比例阈值（如0.3表示30%）
      minScore: number;      // 最低绝对分数
      maxResults: number;    // 最大返回数量
    },
  ): DbQueryResult[] {
    if (results.length === 0) return [];

    const { maxDropRatio, minScore, maxResults } = options;
    const topScore = results[0].score;
    const filtered: DbQueryResult[] = [];

    for (const result of results) {
      // 检查绝对阈值
      if (result.score < minScore) break;

      // 检查相对下降阈值
      const dropRatio = (topScore - result.score) / topScore;
      if (dropRatio > maxDropRatio) break;

      // 检查最大数量
      if (filtered.length >= maxResults) break;

      filtered.push(result);
    }

    return filtered;
  }
}
