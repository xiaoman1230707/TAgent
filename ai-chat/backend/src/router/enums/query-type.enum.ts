/**
 * 查询类型枚举
 */
export enum QueryType {
  RAG = 'rag',           // RAG 增强回复（检索+生成）
  CHAT = 'chat',         // 闲聊（直接LLM回复）
  RETRIEVAL = 'retrieval', // 原文检索（仅返回检索结果）
}

/**
 * 查询决策结果
 */
export interface QueryDecision {
  type: QueryType;
  confidence: number;     // 置信度 0-1
  reason: string;         // 决策原因说明
  method: 'rule' | 'llm'; // 决策方法
}
