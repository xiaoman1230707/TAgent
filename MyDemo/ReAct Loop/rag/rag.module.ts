import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagService } from './rag.service';
import { SessionModule } from '../session/session.module';

/**
 * RAG 模块
 * 提供基于向量检索的问答服务
 */
@Module({
  imports: [ConfigModule, SessionModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
