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

    this.logger.log(`DB query: ${query.substring(0, 50)}...`);
    return this.dbQueryService.query(query, parsedLimit);
  }
}
