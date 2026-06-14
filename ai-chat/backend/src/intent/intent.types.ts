/**
 * 意图分析类型定义
 */

/**
 * 意图类型
 */
export enum IntentType {
  RAG = 'rag',           // RAG 增强回复
  CHAT = 'chat',         // 闲聊
  RETRIEVAL = 'retrieval', // 原文检索
  AGENT = 'agent',       // Agent 工具调用
}

/**
 * 意图分析结果
 */
export interface IntentResult {
  intent: IntentType;
  confidence: number;
  reason: string;
}

/**
 * 意图分析请求 DTO
 */
export interface AnalyzeIntentDto {
  query: string;
  sessionId?: string;
}
