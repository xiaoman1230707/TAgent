import { Controller, Post, Body, Logger } from '@nestjs/common';
import { IntentService } from './intent.service';
import { SessionService } from '../session/session.service';
import { IntentResult } from './intent.types';

interface AnalyzeIntentDto {
  query: string;
  sessionId?: string;
}

interface AnalyzeIntentResponse extends IntentResult {
  sessionId: string;
}

@Controller('intent')
export class IntentController {
  private readonly logger = new Logger(IntentController.name);

  constructor(
    private readonly intentService: IntentService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('analyze')
  async analyze(@Body() dto: AnalyzeIntentDto): Promise<AnalyzeIntentResponse> {
    this.logger.log(`分析意图请求: query="${dto.query}", sessionId=${dto.sessionId || 'new'}`);

    // 1. 获取或创建 session
    const session = this.sessionService.getOrCreate(dto.sessionId);
    this.logger.debug(`使用会话: ${session.id}`);

    // 2. 调用 intentService.analyze(query)
    const result = await this.intentService.analyze(dto.query);

    // 3. 更新 session 的 intent
    this.sessionService.setIntent(session.id, result.intent);
    this.logger.log(`意图分析完成: ${result.intent} (置信度: ${result.confidence})`);

    // 4. 返回结果 + sessionId
    return {
      ...result,
      sessionId: session.id,
    };
  }
}
