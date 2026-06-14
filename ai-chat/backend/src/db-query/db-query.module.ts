import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbQueryController } from './db-query.controller';
import { DbQueryService } from './db-query.service';

/**
 * DB 查询模块
 * 提供纯向量检索服务（无 LLM 参与）
 */
@Module({
  imports: [ConfigModule],
  controllers: [DbQueryController],
  providers: [DbQueryService],
  exports: [DbQueryService],
})
export class DbQueryModule {}
