/**
 * Agent 模块类型定义
 */

/**
 * Agent 流式响应块
 */
export interface AgentChunk {
  type: 'start' | 'chunk' | 'tool_call' | 'tool_result' | 'end' | 'error';
  content?: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
  error?: string;
}

/**
 * Agent 请求 DTO
 */
export interface AgentRequestDto {
  query: string;
  sessionId?: string;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any;
}
