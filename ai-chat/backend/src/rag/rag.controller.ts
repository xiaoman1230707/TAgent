import {
  Controller,
  Post,
  Body,
  Res,
  Get,
  Query,
  HttpException,
  HttpStatus,
  Sse,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { RagService } from './rag.service';
import { SessionService } from '../session/session.service';
import { RagRequestDto } from './dto/rag-request.dto';
import { EnhancedSearchDto } from './dto/enhanced-search.dto';

/**
 * RAG 控制器
 * 提供基于向量检索的问答接口
 */
@Controller('rag')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(
    private readonly ragService: RagService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * RAG 流式问答接口 (SSE)
   * GET /rag/stream?query=xxx&sessionId=xxx
   * 基于向量检索 + LLM 生成流式回答
   */
  @Sse('stream')
  stream(
    @Query('query') query: string,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    // 1. 检查 query 是否存在
    if (!query || query.trim() === '') {
      return from(['错误: query 参数不能为空']).pipe(
        map((errorMsg) => ({ data: errorMsg }) as MessageEvent),
      );
    }

    // 2. 获取或创建 session
    const session = this.sessionService.getOrCreate(sessionId);
    this.logger.log(`[RAG] Session ${session.id} 处理查询: ${query}`);

    // 3. 调用 ragService.streamAnswer()
    const stream = this.ragService.streamAnswer(query);

    // 4. 使用 from(stream).pipe(map(...)) 转换为 SSE
    return from(this.asyncIterableToArray(stream)).pipe(
      map((chunks) => {
        const fullResponse = chunks.join('');
        return { data: fullResponse } as MessageEvent;
      }),
    );
  }

  /**
   * 将 AsyncIterable 转换为数组
   */
  private async asyncIterableToArray(
    iterable: AsyncIterable<string>,
  ): Promise<string[]> {
    const chunks: string[] = [];
    for await (const chunk of iterable) {
      chunks.push(chunk);
    }
    return chunks;
  }

  /**
   * RAG 流式问答接口 (原始 HTTP 流)
   * POST /rag/stream
   * 基于向量检索 + LLM 生成流式回答
   */
  @Post('stream')
  async streamRag(@Body() dto: RagRequestDto, @Res() res: Response) {
    try {
      // 设置流式响应头
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // 获取 RAG 流式响应
      const stream = this.ragService.streamRagAnswer(dto);

      for await (const chunk of stream) {
        res.write(chunk);
      }

      res.end();
    } catch (error) {
      console.error('[RAG] Stream error:', error);

      if (!res.headersSent) {
        throw new HttpException(
          {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            error: 'RAG Streaming failed',
            message: error.message,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      res.end();
    }
  }

  /**
   * RAG 非流式问答接口
   * POST /rag
   */
  @Post()
  async rag(@Body() dto: RagRequestDto) {
    try {
      const chunks: string[] = [];
      const stream = this.ragService.streamRagAnswer(dto);

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return {
        success: true,
        data: {
          answer: chunks.join(''),
        },
      };
    } catch (error) {
      console.error('[RAG] Error:', error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'RAG failed',
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 向量检索调试接口
   * GET /rag/search?query=xxx&limit=3
   * 仅返回检索到的内容，不经过 LLM
   */
  @Get('search')
  async vectorSearch(
    @Query('query') query: string,
    @Query('limit') limit: string = '3',
  ) {
    try {
      if (!query) {
        throw new HttpException('Query is required', HttpStatus.BAD_REQUEST);
      }

      const results = await this.ragService.vectorSearch(
        query,
        parseInt(limit, 10),
      );

      return {
        success: true,
        data: {
          query,
          results,
        },
      };
    } catch (error) {
      console.error('[RAG] Search error:', error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Vector search failed',
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 增强向量检索接口
   * POST /rag/search/enhanced
   * 返回小说原文 + 完整元数据（章节名、主要人物、摘要等）
   */
  @Post('search/enhanced')
  async enhancedSearch(@Body() dto: EnhancedSearchDto) {
    try {
      const result = await this.ragService.enhancedSearch(dto);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('[RAG] Enhanced search error:', error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Enhanced search failed',
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
