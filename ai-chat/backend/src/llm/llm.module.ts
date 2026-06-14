import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { llmProvider } from './llm.provider';

/**
 * LLM 模块
 * 提供 LangChain ChatOpenAI 实例，可被其他模块注入使用
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [llmProvider],
  exports: [llmProvider],
})
export class LlmModule {}
