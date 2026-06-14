import { Body, Controller, Post, Logger } from '@nestjs/common';
import { IntentService } from './intent.service';
import { AnalyzeIntentDto } from './intent.types';

/**
 * 意图分析控制器
 * 提供显式的意图分析接口
 */
@Controller('intent')
export class IntentController {
  private readonly logger = new Logger(IntentController.name);

  constructor(private readonly intentService: IntentService) {}

  /**
   * 意图分析接口
   * POST /intent/analyze
   * 分析用户查询意图，返回意图类型和置信度
   */
  @Post('analyze')
  async analyze(@Body() dto: AnalyzeIntentDto) {
    this.logger.log(`收到意图分析请求: ${dto.query.substring(0, 50)}...`);

    const result = await this.intentService.analyze(dto);

    this.logger.log(`意图分析完成: ${result.intent} (置信度: ${result.confidence})`);

    return {
      success: true,
      data: result,
    };
  }
}
