import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { SessionModule } from '../session/session.module';

/**
 * Agent 模块
 * 提供 ReAct 循环 Agent 功能，支持工具调用
 */
@Module({
  imports: [ConfigModule, SessionModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
