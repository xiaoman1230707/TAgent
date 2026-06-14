import {
  Controller,
  Get,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { DbQueryService } from './db-query.service';

/**
 * DB 查询控制器
 * 提供纯向量检索接口（无 LLM 生成）
 */
@Controller('db')
export class DbQueryController {
  private readonly logger = new Logger(DbQueryController.name);

  constructor(private readonly dbQueryService: DbQueryService) {}

  /**
   * 向量检索接口
   * GET /db/query?query=xxx&limit=5
   * 返回原文片段，不做 LLM 总结
   */
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
