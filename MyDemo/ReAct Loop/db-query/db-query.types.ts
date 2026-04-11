export interface DbQueryResult {
  id: string;
  book_id: string;
  book_name: string;
  chapter_num: number;
  index: number;
  content: string;
  score: number;
}

export interface DbQueryResponse {
  query: string;
  count: number;
  results: DbQueryResult[];
}
