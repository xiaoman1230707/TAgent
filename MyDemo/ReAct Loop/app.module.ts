import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { SessionModule } from './session/session.module';
import { IntentModule } from './intent/intent.module';
import { RagModule } from './rag/rag.module';
import { DbQueryModule } from './db-query/db-query.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SessionModule,
    IntentModule,
    RagModule,
    DbQueryModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
