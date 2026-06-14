import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RouterService } from './router.service';
import { RouterRequestDto } from './dto/router-request.dto';

/**
 * 查询路由控制器
 * 统一入口，自动路由到不同处理流程
 */
@Controller('router')
export class RouterController {
  constructor(private readonly routerService: RouterService) {}

  /**
   * 智能路由接口
   * POST /router
   * 自动分析查询类型并路由到对应处理器
   *
   * QueryType:
   * - rag: RAG增强回复（检索+生成）
   * - chat: 闲聊（直接LLM回复）
   * - retrieval: 原文检索（仅返回检索结果）
   */
  @Post()
  async route(@Body() dto: RouterRequestDto) {
    try {
      const { query, forceType } = dto;

      console.log(`[RouterController] 收到查询: ${query}`);

      // 如果强制指定类型，直接路由（待实现）
      // if (forceType) { ... }

      // 智能路由
      const { decision, result } = await this.routerService.route(query);

      return {
        success: true,
        data: {
          decision, // 路由决策信息
          result,   // 处理结果
        },
      };
    } catch (error) {
      console.error('[RouterController] Error:', error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Routing failed',
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
