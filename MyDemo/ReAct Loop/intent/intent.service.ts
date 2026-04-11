import { Injectable, Inject, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { IntentResult } from './intent.types';

@Injectable()
export class IntentService {
  private readonly logger = new Logger(IntentService.name);

  constructor(
    @Inject('CHAT_MODEL') private readonly model: ChatOpenAI,
  ) {}

  /**
   * 分析用户查询意图
   * @param query 用户输入
   * @returns 意图分析结果
   */
  async analyze(query: string): Promise<IntentResult> {
    // 构建 system prompt
    const systemPrompt = this.buildSystemPrompt();

    // 构建 user prompt
    const userPrompt = `用户输入: "${query}"\n\n请分析上述输入的意图，返回JSON格式结果。`;

    try {
      // 调用 LLM
      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      // 解析返回内容
      const content = response.content as string;
      const result = this.parseIntentResponse(content);

      this.logger.debug(`意图分析结果: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      this.logger.error(`意图分析失败: ${(error as Error).message}`);
      // 失败时返回默认意图 agent
      return {
        intent: 'agent',
        confidence: 0.5,
        reason: '意图分析失败，使用默认意图',
      };
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(): string {
    return `你是一个意图分类助手。请分析用户输入，判断其意图类型。

可选的意图类型：
1. rag - RAG检索意图：用户询问关于特定文档、书籍、知识库内容的问题，需要从向量数据库中检索信息
   示例："天龙八部中乔峰是谁？"、"文档中提到的预算有多少？"、"这本书的主要内容是什么？"

2. agent - Agent工具调用意图：用户需要执行某些操作、使用工具、发送邮件、搜索网页等
   示例："帮我搜索今天的天气"、"发送邮件给张三"、"查询用户ID为001的信息"

3. db - 数据库查询意图：用户需要查询结构化数据、统计数据、执行SQL类查询
   示例："统计最近一个月的销售额"、"查询订单数量大于100的用户"、"显示所有管理员用户"

请返回JSON格式，包含以下字段：
- intent: 意图类型，必须是 "rag"、"agent" 或 "db" 之一
- confidence: 置信度，0.0-1.0之间的数字
- reason: 判断理由，简要说明为什么这样分类

注意：只返回JSON，不要包含其他解释文字。`;
  }

  /**
   * 解析 LLM 返回的意图分析结果
   */
  private parseIntentResponse(content: string): IntentResult {
    try {
      // 尝试提取 JSON 内容（处理可能的 markdown 代码块）
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        throw new Error('未找到JSON内容');
      }

      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      // 验证字段
      const intent = parsed.intent;
      const confidence = parseFloat(parsed.confidence);
      const reason = parsed.reason;

      // 验证 intent 值
      if (!['rag', 'agent', 'db'].includes(intent)) {
        throw new Error(`无效的意图类型: ${intent}`);
      }

      // 验证 confidence 范围
      const validConfidence = isNaN(confidence) ? 0.5 : Math.max(0, Math.min(1, confidence));

      return {
        intent,
        confidence: validConfidence,
        reason: reason || '未提供理由',
      };
    } catch (error) {
      this.logger.warn(`解析意图响应失败: ${(error as Error).message}，使用默认意图`);
      return {
        intent: 'agent',
        confidence: 0.5,
        reason: '解析失败，使用默认意图',
      };
    }
  }
}
