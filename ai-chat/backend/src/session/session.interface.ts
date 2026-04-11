import { BaseMessage } from '@langchain/core/messages';

/**
 * 会话元数据
 */
export interface SessionMetadata {
  createdAt: Date;
  lastActiveAt: Date;
  lastIntent?: 'rag' | 'agent' | 'db';
}

/**
 * 会话对象
 */
export interface Session {
  id: string;
  messages: BaseMessage[];
  metadata: SessionMetadata;
}
