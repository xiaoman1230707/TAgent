import { Inject, Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLM_MODEL } from '../../llm/llm.provider';
import { QueryType } from '../enums/query-type.enum';

/**
 * 闲聊处理器
 * 直接调用 LLM 回复，无需检索
 */
@Injectable()
export class ChatHandler {
  constructor(
    @Inject(LLM_MODEL) private readonly llm: ChatOpenAI,
  ) {}

  /**
   * 处理查询
   * @param query 用户查询
   * @returns LLM 回复
   */
  async handle(query: string): Promise<any> {
    const systemPrompt = '你是一个友好的 AI 助手。请简洁、礼貌地回答用户的问题。';

    const response = await this.llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(query),
    ]);

    return {
      type: QueryType.CHAT,
      answer: response.content,
    };
  }

  /**
   * 流式处理
   */
  async *handleStream(query: string): AsyncIterable<string> {
    const systemPrompt = '你是一个友好的 AI 助手。请简洁、礼貌地回答用户的问题。';

    const stream = await this.llm.stream([
      new SystemMessage(systemPrompt),
      new HumanMessage(query),
    ]);

    for await (const chunk of stream) {
      const content = chunk.content as string;
      if (content) {
        yield content;
      }
    }
  }
}
