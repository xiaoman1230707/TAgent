import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { milvusProvider } from './milvus.provider';
import { LlmModule } from '../llm/llm.module';
import { SessionModule } from '../session/session.module';

/**
 * RAG 模块
 * 提供基于向量数据库的检索增强生成功能
 */
@Module({
  imports: [ConfigModule, LlmModule, SessionModule],
  controllers: [RagController],
  providers: [RagService, milvusProvider],
  exports: [RagService],
})
export class RagModule {}
