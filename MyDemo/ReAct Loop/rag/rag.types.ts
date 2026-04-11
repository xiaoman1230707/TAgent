/**
 * RAG 模块类型定义
 */

/**
 * RAG 流式响应块
 */
export interface RagChunk {
  type: 'start' | 'chunk' | 'end' | 'error';
  content?: string;
  error?: string;
}

/**
 * Milvus 检索结果项
 */
export interface SearchResultItem {
  id: string;
  book_id: string;
  book_name: string;
  chapter_num: number;
  index: number;
  content: string;
  score?: number;
}

/**
 * 检索结果
 */
export interface SearchResult {
  results: SearchResultItem[];
  total: number;
}

/**
 * RAG 配置
 */
export interface RagConfig {
  collectionName: string;
  vectorDim: number;
  topK: number;
  metricType: string;
}

/**
 * RAG 服务配置（从环境变量读取）
 */
export interface RagServiceConfig {
  milvusAddress: string;
  milvusToken: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  embeddingModelName: string;
  llmModelName: string;
}
