import { Injectable } from '@nestjs/common';
import { RagService } from '../../rag/rag.service';
import { QueryType } from '../enums/query-type.enum';

/**
 * RAG 处理器
 * 处理需要向量检索 + LLM 生成的问题
 */
@Injectable()
export class RagHandler {
  constructor(private readonly ragService: RagService) {}

  /**
   * 处理查询
   * @param query 用户查询
   * @returns 生成的回答
   */
  async handle(query: string): Promise<any> {
    const chunks: string[] = [];
    const stream = this.ragService.streamRagAnswer({
      question: query,
      topK: 3,
    });

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return {
      type: QueryType.RAG,
      answer: chunks.join(''),
      sources: [], // 可以添加引用来源
    };
  }

  /**
   * 流式处理
   */
  async *handleStream(query: string): AsyncIterable<string> {
    const stream = this.ragService.streamRagAnswer({
      question: query,
      topK: 3,
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
