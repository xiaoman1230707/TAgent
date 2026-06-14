import {
  Controller,
  Get,
  Query,
  Sse,
  Logger,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AgentService } from './agent.service';
import { SessionService } from '../session/session.service';

/**
 * Agent 控制器
 * 提供 ReAct Agent 的 SSE 流式接口
 */
@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agentService: AgentService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Agent 流式接口
   * GET /agent/stream?query=xxx&sessionId=xxx
   * 支持工具调用的 ReAct 循环
   *
   * 可用工具：
   * - query_user: 查询用户信息
   * - send_mail: 发送邮件
   * - web_search: 网络搜索
   */
  @Sse('stream')
  stream(
    @Query('query') query: string,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    if (!query) {
      return from([{ type: 'error', error: 'Query parameter is required' }]).pipe(
        map((data) => ({ data }) as MessageEvent),
      );
    }

    // 获取或创建会话
    const session = this.sessionService.getOrCreate(sessionId);
    this.logger.log(`Agent stream for session: ${session.id}, query: ${query.substring(0, 50)}...`);

    const stream = this.agentService.streamAgent(query, session.id);

    return from(stream).pipe(
      map((chunk) => ({ data: chunk }) as MessageEvent),
    );
  }
}
