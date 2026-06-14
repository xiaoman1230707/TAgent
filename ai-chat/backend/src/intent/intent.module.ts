import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IntentController } from './intent.controller';
import { IntentService } from './intent.service';
import { SessionModule } from '../session/session.module';

/**
 * 意图分析模块
 * 提供显式的意图分析接口
 */
@Module({
  imports: [ConfigModule, SessionModule],
  controllers: [IntentController],
  providers: [IntentService],
  exports: [IntentService],
})
export class IntentModule {}
