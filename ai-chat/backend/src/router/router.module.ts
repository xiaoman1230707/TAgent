import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RouterController } from './router.controller';
import { RouterService } from './router.service';
import { RuleBasedAnalyzer } from './analyzers/rule-based.analyzer';
import { LlmBasedAnalyzer } from './analyzers/llm-based.analyzer';
import { RagHandler } from './handlers/rag.handler';
import { ChatHandler } from './handlers/chat.handler';
import { RetrievalHandler } from './handlers/retrieval.handler';
import { RagModule } from '../rag/rag.module';
import { LlmModule } from '../llm/llm.module';
import { DbQueryModule } from '../db-query/db-query.module';

/**
 * 路由模块
 * 统一查询入口，智能路由到不同处理流程
 */
@Module({
  imports: [ConfigModule, RagModule, LlmModule, DbQueryModule],
  controllers: [RouterController],
  providers: [
    RouterService,
    RuleBasedAnalyzer,
    LlmBasedAnalyzer,
    RagHandler,
    ChatHandler,
    RetrievalHandler,
  ],
  exports: [RouterService],
})
export class RouterModule {}
