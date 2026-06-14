import { Injectable } from '@nestjs/common';
import { QueryType, QueryDecision } from '../enums/query-type.enum';

/**
 * 基于规则的查询分析器
 * 通过关键词和模式匹配快速判断查询类型
 */
@Injectable()
export class RuleBasedAnalyzer {
  // 闲聊关键词
  private readonly chatPatterns = [
    /^你好/i, /^在吗/i, /^在么/i, /^您好/i,
    /^谢谢/i, /^感谢/i, /^再见/i, /^拜拜/i,
    /^你是谁/i, /^你叫什么/i, /^你能做什么/i,
    /^help$/i, /^hello$/i, /^hi$/i,
    /^(早上|下午|晚上)好/,
    /^今天天气/,
  ];

  // 原文检索关键词
  private readonly retrievalPatterns = [
    /原文/, /查找/, /搜索/, /找出/, /给出.*原文/,
    /第[一二三四五六七八九十百千\d]+章.*原文/,
    /第[一二三四五六七八九十百千\d]+回.*原文/,
  ];

  // RAG 关键词（小说相关内容）
  private readonly ragPatterns = [
    /根据小说/, /小说里/, /书中/, /原文.*(说明|表明|解释)/,
    /段誉/, /乔峰/, /萧峰/, /虚竹/, /王语嫣/, /慕容复/,
    /天山童姥/, /逍遥派/, /丐帮/, /少林/, /大理/,
    /武功/, /内力/, /真气/, /六脉神剑/, /降龙十八掌/, /北冥神功/,
    /情节/, /为什么/, /怎么回事/, /什么/, /谁/, /哪里/, /怎样/,
  ];

  /**
   * 分析查询类型
   * @param query 用户查询
   * @returns QueryDecision 或 null（无法确定）
   */
  analyze(query: string): QueryDecision | null {
    const normalizedQuery = query.trim();

    // 1. 检查闲聊模式
    if (this.matchPatterns(normalizedQuery, this.chatPatterns)) {
      return {
        type: QueryType.CHAT,
        confidence: 0.9,
        reason: '匹配到闲聊关键词',
        method: 'rule',
      };
    }

    // 2. 检查原文检索模式
    if (this.matchPatterns(normalizedQuery, this.retrievalPatterns)) {
      return {
        type: QueryType.RETRIEVAL,
        confidence: 0.85,
        reason: '包含原文检索关键词',
        method: 'rule',
      };
    }

    // 3. 检查 RAG 模式（小说相关问题）
    if (this.matchPatterns(normalizedQuery, this.ragPatterns)) {
      return {
        type: QueryType.RAG,
        confidence: 0.8,
        reason: '包含小说内容相关关键词',
        method: 'rule',
      };
    }

    // 4. 无法确定
    return null;
  }

  /**
   * 匹配正则模式列表
   */
  private matchPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
  }
}
