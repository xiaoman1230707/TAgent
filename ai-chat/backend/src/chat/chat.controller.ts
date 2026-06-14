import {
  Controller,
  Post,
  Body,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';

/**
 * 聊天控制器
 * 提供 POST /chat/stream 流式接口
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * 流式聊天接口
   * POST /chat/stream
   * Content-Type: application/json
   * Body: { "message": "你好", "systemPrompt": "", "temperature": 0.7, "model": "gpt-4o-mini" }
   *
   * Response: text/plain 流式输出
   */
  @Post('stream')
  async streamChat(@Body() dto: ChatRequestDto, @Res() res: Response) {
    try {
      // 设置响应头 - 使用 text/plain 流式输出
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // 获取流式响应
      const stream = this.chatService.streamChat(dto);

      // 逐块写入响应
      for await (const chunk of stream) {
        res.write(chunk);
      }

      // 结束响应
      res.end();
    } catch (error) {
      console.error('Chat stream error:', error);

      // 如果响应尚未发送，返回错误
      if (!res.headersSent) {
        throw new HttpException(
          {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            error: 'Streaming failed',
            message: error.message,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 如果已经开始发送，强制结束
      res.end();
    }
  }

  /**
   * 非流式聊天接口（备用）
   * POST /chat
   */
  @Post()
  async chat(@Body() dto: ChatRequestDto) {
    try {
      const chunks: string[] = [];
      const stream = this.chatService.streamChat(dto);

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return {
        success: true,
        data: {
          content: chunks.join(''),
        },
      };
    } catch (error) {
      console.error('Chat error:', error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Chat failed',
          message: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
