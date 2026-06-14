import { Injectable } from '@nestjs/common';
import { DbQueryService } from '../../db-query/db-query.service';
import { QueryType } from '../enums/query-type.enum';

/**
 * 原文检索处理器
 * 仅返回检索结果，不经过 LLM 生成
 */
@Injectable()
export class RetrievalHandler {
  constructor(private readonly dbQueryService: DbQueryService) {}

  /**
   * 处理查询
   * @param query 用户查询
   * @returns 检索结果列表
   */
  async handle(query: string): Promise<any> {
    const results = await this.dbQueryService.query(query, 5);

    return {
      type: QueryType.RETRIEVAL,
      query: results.query,
      total: results.count,
      results: results.results.map((item, index) => ({
        id: item.id,
        rank: index + 1,
        score: item.score,
        metadata: {
          bookName: item.book_name,
          chapterNum: item.chapter_num,
          fragmentIndex: item.index,
        },
        content: item.content,
      })),
    };
  }
}
