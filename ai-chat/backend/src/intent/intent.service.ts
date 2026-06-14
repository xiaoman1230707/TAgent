import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLM_MODEL } from '../llm/llm.provider';
import { SessionService } from '../session/session.service';
import { IntentType, IntentResult, AnalyzeIntentDto } from './intent.types';

/**
 * 意图分析服务
 * 使用 LLM 对用户查询进行意图分类
 */
@Injectable()
export class IntentService {
  private readonly logger = new Logger(IntentService.name);

  constructor(
    @Inject(LLM_MODEL) private readonly llm: ChatOpenAI,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * 分析用户意图
   * @param dto 分析请求
   * @returns 意图分析结果
   */
  async analyze(dto: AnalyzeIntentDto): Promise<IntentResult & { sessionId: string }> {
    const { query, sessionId: existingSessionId } = dto;

    this.logger.log(`Analyzing intent for query: ${query.substring(0, 50)}...`);

    // 获取或创建 session
    const session = this.sessionService.getOrCreate(existingSessionId);

    // 执行 LLM 意图分析
    const result = await this.performLlmAnalysis(query);

    // 更新 session 意图
    this.sessionService.setIntent(session.id, result.intent as 'rag' | 'agent' | 'db');

    return {
      ...result,
      sessionId: session.id,
    };
  }

  /**
   * 使用 LLM 执行意图分析
   */
  private async performLlmAnalysis(query: string): Promise<IntentResult> {
    const systemPrompt = `你是一个查询意图分类助手。分析用户输入，判断应该进入哪个处理流程。

可选流程：
- rag: 用户询问《天龙八部》小说内容、人物、情节等，需要 RAG 增强回答
- chat: 用户进行闲聊、问候、询问助手能力等非小说内容相关的对话
- retrieval: 用户明确要求查询原文、获取原始片段，不需要 LLM 总结
- agent: 用户需要工具协助（查询用户信息、发邮件、搜索），或意图不明确

输出 JSON 格式：
{
  "intent": "rag|chat|retrieval|agent",
  "confidence": 0.0-1.0,
  "reason": "简短说明判断理由"
}

规则：
1. 涉及工具调用、发邮件、查用户信息的一定是 agent
2. 明确要求"原文"、"原始片段"、"数据库查询"的是 retrieval
3. 询问小说人物、情节的是 rag
4. 闲聊问候的是 chat
5. 模糊场景默认选择 agent`;

    const userPrompt = `用户输入："""${query}"""

请输出 JSON 格式的意图分析结果：`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = response.content as string;
      return this.parseIntentResponse(content);
    } catch (error) {
      this.logger.error('Intent analysis failed:', error.message);
      // 默认返回 agent
      return {
        intent: IntentType.AGENT,
        confidence: 0,
        reason: '意图识别失败，使用默认流程',
      };
    }
  }

  /**
   * 解析 LLM 返回的意图 JSON
   */
  private parseIntentResponse(content: string): IntentResult {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证并规范化
      const intent = this.validateIntent(parsed.intent);
      const confidence = Math.max(0, Math.min(1, parsed.confidence || 0));
      const reason = parsed.reason || '未提供理由';

      return { intent, confidence, reason };
    } catch (error) {
      this.logger.warn('Failed to parse intent JSON, using default:', error.message);
      return {
        intent: IntentType.AGENT,
        confidence: 0,
        reason: '解析失败，使用默认流程',
      };
    }
  }

  /**
   * 验证意图类型
   */
  private validateIntent(intent: string): IntentType {
    if (Object.values(IntentType).includes(intent as IntentType)) {
      return intent as IntentType;
    }
    return IntentType.AGENT; // 默认
  }
}
