import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BaseMessage } from '@langchain/core/messages';
import { Session, SessionMetadata } from './session.interface';

@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, Session>();

  /**
   * 创建新会话
   */
  create(): Session {
    const id = uuidv4();
    const now = new Date();
    const session: Session = {
      id,
      messages: [],
      metadata: {
        createdAt: now,
        lastActiveAt: now,
      },
    };
    this.sessions.set(id, session);
    return session;
  }

  /**
   * 根据 ID 查找会话
   */
  findById(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * 获取或创建会话
   * 如果传入的 id 存在则返回现有会话，否则创建新会话
   */
  getOrCreate(id?: string): Session {
    if (id) {
      const existingSession = this.findById(id);
      if (existingSession) {
        return existingSession;
      }
    }
    return this.create();
  }

  /**
   * 向会话添加消息
   */
  addMessage(sessionId: string, message: BaseMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with id "${sessionId}" not found`);
    }
    session.messages.push(message);
    session.metadata.lastActiveAt = new Date();
  }

  /**
   * 设置会话意图
   */
  setIntent(sessionId: string, intent: 'rag' | 'agent' | 'db'): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Session with id "${sessionId}" not found`);
    }
    session.metadata.lastIntent = intent;
    session.metadata.lastActiveAt = new Date();
  }

  /**
   * 删除会话
   */
  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * 清理过期会话
   * @param maxAgeMs 最大存活时间（毫秒）
   * @returns 清理的会话数量
   */
  cleanupExpired(maxAgeMs: number): number {
    const now = new Date();
    let count = 0;

    for (const [id, session] of this.sessions.entries()) {
      const age = now.getTime() - session.metadata.lastActiveAt.getTime();
      if (age > maxAgeMs) {
        this.sessions.delete(id);
        count++;
      }
    }

    return count;
  }
}
