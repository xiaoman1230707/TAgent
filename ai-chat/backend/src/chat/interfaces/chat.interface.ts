/**
 * 聊天消息接口
 */
export interface IChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 聊天请求接口
 */
export interface IChatRequest {
  message: string;
  systemPrompt?: string;
  temperature?: number;
  model?: string;
}

/**
 * 聊天响应接口（流式）
 */
export interface IChatStreamResponse {
  content: string;
  done: boolean;
}
