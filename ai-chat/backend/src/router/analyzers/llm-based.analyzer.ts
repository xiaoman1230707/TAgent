import { Inject, Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLM_MODEL } from '../../llm/llm.provider';
import { QueryType, QueryDecision } from '../enums/query-type.enum';

/**
 * 基于 LLM 的查询分析器
 * 使用 LLM 判断查询意图，准确率更高但速度较慢
 */
@Injectable()
export class LlmBasedAnalyzer {
  constructor(
    @Inject(LLM_MODEL) private readonly llm: ChatOpenAI,
  ) {}

  /**
   * 使用 LLM 分析查询类型
   * @param query 用户查询
   * @returns QueryDecision
   */
  async analyze(query: string): Promise<QueryDecision> {
    const systemPrompt = `你是一个查询分类助手。请分析用户查询的意图，将其分类为以下三类之一：

1. **RAG** (rag) - 用户询问小说《天龙八部》的内容、情节、人物等问题，需要基于小说原文进行回答
   - 示例："段誉会什么武功？"、"乔峰为什么自杀？"、"虚竹怎么学会北冥神功的？"

2. **CHAT** (chat) - 用户进行闲聊、问候、询问助手能力等非小说内容相关的对话
   - 示例："你好"、"谢谢"、"你是谁？"、"你能做什么？"

3. **RETRIEVAL** (retrieval) - 用户明确要求查找小说原文、特定章节内容，不需要生成回答
   - 示例："查找第10章原文"、"给出段誉学武的原文"、"搜索关于乔峰的原文"

请只返回以下 JSON 格式，不要有任何其他内容：
{
  "type": "rag|chat|retrieval",
  "confidence": 0.95,
  "reason": "简要说明分类理由"
}`;

    try {
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`用户查询："${query}"\n\n请分析并返回JSON格式的分类结果。`),
      ]);

      const content = response.content as string;

      // 解析 JSON 结果
      const result = this.parseJsonResponse(content);

      return {
        type: result.type as QueryType,
        confidence: result.confidence,
        reason: result.reason,
        method: 'llm',
      };
    } catch (error) {
      console.error('[LLM Analyzer] 分析失败:', error);

      // 失败时默认返回 RAG 类型
      return {
        type: QueryType.RAG,
        confidence: 0.5,
        reason: 'LLM 分析失败，默认使用 RAG',
        method: 'llm',
      };
    }
  }

  /**
   * 解析 LLM 返回的 JSON
   */
  private parseJsonResponse(content: string): any {
    try {
      // 尝试直接解析
      return JSON.parse(content);
    } catch {
      // 尝试提取 JSON 代码块
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // 尝试提取花括号内容
      const braceMatch = content.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        return JSON.parse(braceMatch[0]);
      }

      throw new Error('无法解析 LLM 响应');
    }
  }
}