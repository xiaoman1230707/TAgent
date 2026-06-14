import { Injectable } from '@nestjs/common';
import { RuleBasedAnalyzer } from './analyzers/rule-based.analyzer';
import { LlmBasedAnalyzer } from './analyzers/llm-based.analyzer';
import { RagHandler } from './handlers/rag.handler';
import { ChatHandler } from './handlers/chat.handler';
import { RetrievalHandler } from './handlers/retrieval.handler';
import { QueryType, QueryDecision } from './enums/query-type.enum';

/**
 * 查询路由服务
 * 混合路由：规则 + LLM
 */
@Injectable()
export class RouterService {
  // 规则置信度阈值，低于此值使用 LLM
  private readonly CONFIDENCE_THRESHOLD = 0.7;

  constructor(
    private readonly ruleAnalyzer: RuleBasedAnalyzer,
    private readonly llmAnalyzer: LlmBasedAnalyzer,
    private readonly ragHandler: RagHandler,
    private readonly chatHandler: ChatHandler,
    private readonly retrievalHandler: RetrievalHandler,
  ) {}

  /**
   * 路由决策
   * 1. 先用规则匹配
   * 2. 规则置信度低时，使用 LLM
   */
  async route(query: string): Promise<{
    decision: QueryDecision;
    result: any;
  }> {
    console.log(`[Router] 分析查询: ${query}`);

    // 1. 规则匹配
    let decision = this.ruleAnalyzer.analyze(query);

    // 2. 规则无法确定或置信度低时，使用 LLM
    if (!decision || decision.confidence < this.CONFIDENCE_THRESHOLD) {
      console.log('[Router] 规则匹配置信度低，使用 LLM 分析');
      decision = await this.llmAnalyzer.analyze(query);
    } else {
      console.log(`[Router] 规则匹配成功: ${decision.type}`);
    }

    // 3. 根据决策调用对应处理器
    const result = await this.executeHandler(decision.type, query);

    return {
      decision,
      result,
    };
  }

  /**
   * 执行对应处理器
   */
  private async executeHandler(type: QueryType, query: string): Promise<any> {
    switch (type) {
      case QueryType.RAG:
        return this.ragHandler.handle(query);
      case QueryType.CHAT:
        return this.chatHandler.handle(query);
      case QueryType.RETRIEVAL:
        return this.retrievalHandler.handle(query);
      default:
        // 默认使用 RAG
        return this.ragHandler.handle(query);
    }
  }
}