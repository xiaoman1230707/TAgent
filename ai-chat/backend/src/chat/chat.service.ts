import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLM_MODEL } from '../llm/llm.provider';
import { ChatRequestDto } from './dto/chat-request.dto';

/**
 * 聊天服务
 * 处理与 LangChain 的交互，支持流式输出
 */
@Injectable()
export class ChatService {
  constructor(
    @Inject(LLM_MODEL) private readonly llm: ChatOpenAI,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 流式聊天响应
   * @param dto 聊天请求 DTO
   * @returns AsyncIterable 流式响应
   */
  async *streamChat(dto: ChatRequestDto): AsyncIterable<string> {
    const { message, systemPrompt, temperature, model } = dto;

    // 创建消息数组
    const messages = [];

    // 添加系统提示（如果提供）
    if (systemPrompt) {
      messages.push(new SystemMessage(systemPrompt));
    }

    // 添加用户消息
    messages.push(new HumanMessage(message));

    // 根据请求参数创建临时模型实例（支持参数覆盖）
    const modelInstance = this.getModelInstance(temperature, model);

    try {
      // 流式调用
      const stream = await modelInstance.stream(messages);

      for await (const chunk of stream) {
        const content = chunk.content as string;
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('LLM streaming error:', error);
      throw new Error(`Streaming failed: ${error.message}`);
    }
  }

  /**
   * 获取模型实例（支持参数覆盖）
   * @param temperature 温度参数
   * @param model 模型名称
   * @returns ChatOpenAI 实例
   */
  private getModelInstance(temperature?: number, model?: string): ChatOpenAI {
    // 如果没有覆盖参数，使用默认实例
    if (temperature === undefined && model === undefined) {
      return this.llm;
    }

    // 创建带覆盖参数的实例
    return new ChatOpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
      configuration: {
        baseURL: this.configService.get<string>('OPENAI_BASE_URL'),
      },
      model: model || this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini',
      temperature: temperature !== undefined
        ? temperature
        : (parseFloat(this.configService.get<string>('OPENAI_TEMPERATURE') || '0.7')),
      streaming: true,
    });
  }
}
