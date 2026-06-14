import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { LlmModule } from './llm/llm.module';
import { RagModule } from './rag/rag.module';
import { RouterModule } from './router/router.module';
import { SessionModule } from './session/session.module';
import { AgentModule } from './agent/agent.module';
import { DbQueryModule } from './db-query/db-query.module';
import { IntentModule } from './intent/intent.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LlmModule,
    SessionModule,
    ChatModule,
    RagModule,
    RouterModule,
    AgentModule,
    DbQueryModule,
    IntentModule,
  ],
})
export class AppModule {}
