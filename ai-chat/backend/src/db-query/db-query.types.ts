/**
 * DB 查询模块类型定义
 * 纯向量检索服务，无 LLM 参与
 */

/**
 * 单条查询结果
 */
export interface DbQueryResult {
  id: string;
  book_id: string;
  book_name: string;
  chapter_num: number;
  index: number;
  content: string;
  score: number;
}

/**
 * 查询响应
 */
export interface DbQueryResponse {
  query: string;
  count: number;
  results: DbQueryResult[];
}
