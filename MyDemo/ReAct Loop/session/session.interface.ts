import { BaseMessage } from '@langchain/core/messages';

export interface Session {
  id: string;
  messages: BaseMessage[];
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  lastIntent?: 'rag' | 'agent' | 'db';
  createdAt: Date;
  lastActiveAt: Date;
}

export interface CreateSessionDto {
  id?: string;
}
