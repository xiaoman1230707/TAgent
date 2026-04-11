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
