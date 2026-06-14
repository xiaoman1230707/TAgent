import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LLM_MODEL } from '../llm/llm.provider';
import { SessionService } from '../session/session.service';
import { AgentChunk } from './agent.types';

/**
 * Agent 服务
 * 实现 ReAct 循环：推理 + 行动
 * 支持工具调用：查询用户、发送邮件、网络搜索
 */
@Injectable()
export class AgentService {
  private tools: StructuredTool[];

  constructor(
    @Inject(LLM_MODEL) private readonly llm: ChatOpenAI,
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {
    // 初始化工具
    this.tools = this.createTools();
  }

  /**
   * 创建工具集合
   */
  private createTools(): StructuredTool[] {
    // 1. 发送邮件工具（模拟）
    const sendMailSchema = z.object({
      to: z.string().describe('收件人邮箱地址'),
      subject: z.string().describe('邮件主题'),
      text: z.string().optional().describe('邮件正文内容'),
    });

    const sendMailTool = tool(
      async ({ to, subject, text }: { to: string; subject: string; text?: string }) => {
        console.log(`[Agent] 发送邮件到: ${to}, 主题: ${subject}`);
        return `邮件发送成功！\n收件人: ${to}\n主题: ${subject}\n内容: ${text || '(无内容)'}`;
      },
      {
        name: 'send_mail',
        description: '发送电子邮件。需要提供收件人邮箱、主题、可选文本内容',
        schema: sendMailSchema as any,
      }
    ) as any;

    // 2. 网络搜索工具
    const webSearchSchema = z.object({
      query: z.string().describe('搜索关键词'),
      count: z.number().optional().describe('返回结果数量，默认5条，最大10条'),
    });

    const webSearchTool = tool(
      async ({ query, count = 5 }: { query: string; count?: number }) => {
        const apiKey = this.configService.get<string>('BOCHA_API_KEY');

        if (!apiKey) {
          return '错误：BOCHA_API_KEY 未配置，无法进行网络搜索';
        }

        try {
          const url = 'https://api.bochaai.com/v1/web-search';
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
              freshness: 'noLimit',
              summary: true,
              count: count || 5,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return `搜索API请求失败，状态码：${response.status}，错误：${errorText}`;
          }

          const json = await response.json();

          if (json.code !== 200 || !json.data) {
            return `搜索API返回错误：${json.msg || '未知错误'}`;
          }

          const webpages = json.data.webPages?.value || [];
          if (webpages.length === 0) {
            return '未找到相关搜索结果';
          }

          return webpages.map((page: any, idx: number) =>
            `[${idx + 1}] ${page.name}\nURL: ${page.url}\n摘要: ${page.summary || '无摘要'}`
          ).join('\n\n');

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '未知错误';
          return `搜索失败：${errorMessage}`;
        }
      },
      {
        name: 'web_search',
        description: '使用 Bocha AI 搜索互联网网页。输入搜索关键词，返回搜索结果列表',
        schema: webSearchSchema as any,
      }
    ) as any;

    return [sendMailTool, webSearchTool];
  }

  /**
   * 流式 Agent 处理
   * ReAct 循环实现
   */
  async *streamAgent(query: string, sessionId: string): AsyncGenerator<AgentChunk> {
    try {
      // 获取会话
      const session = this.sessionService.findById(sessionId);
      if (!session) {
        throw new NotFoundException(`Session not found: ${sessionId}`);
      }

      yield { type: 'start' };

      // 构建消息历史
      const systemPrompt = `你是一个智能助手，能够根据用户需求自主决定是直接回答还是调用工具。

可用工具：
1. send_mail - 发送电子邮件（需要收件人邮箱、主题）
2. web_search - 网络搜索（需要搜索关键词）

判断规则：
- 用户需要发送邮件时 → 调用 send_mail
- 用户需要搜索最新信息时 → 调用 web_search
- 普通对话、问候、闲聊、知识问答 → 直接回答，不要调用工具

重要：不要为简单的问候或闲聊调用工具，直接友好回复即可。`;

      const messages: BaseMessage[] = session.messages.length > 0
        ? [new SystemMessage(systemPrompt), ...session.messages.slice(1)]
        : [new SystemMessage(systemPrompt)];

      // 添加用户消息
      messages.push(new HumanMessage(query));
      this.sessionService.addMessage(sessionId, new HumanMessage(query));

      // 绑定工具的 LLM
      const modelWithTools = this.llm.bindTools(this.tools);

      // 第一步：流式调用模型，让用户看到思考过程
      const stream = await modelWithTools.stream(messages);
      let partialContent = '';
      let hasToolCall = false;
      let toolCallBuffer: any = null;

      for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
        // 检查是否有工具调用
        if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
          hasToolCall = true;
          toolCallBuffer = chunk.tool_call_chunks[0];
          break; // 检测到工具调用，停止流式输出
        }

        // 输出思考内容
        const content = chunk.content as string;
        if (content) {
          partialContent += content;
          yield { type: 'chunk', content };
        }
      }

      // 获取完整的 AI 消息
      const aiMessage = await modelWithTools.invoke(messages);
      messages.push(aiMessage);

      // 检查是否有工具调用（从 tool_call_chunks 解析）
      const toolCallChunks = (aiMessage as any).tool_call_chunks || [];
      const toolCalls: any[] = [];

      for (const tc of toolCallChunks) {
        if (tc.args) {
          try {
            const args = JSON.parse(tc.args);
            // 通过参数推断工具名称（name 可能为空）
            let toolName = tc.name;
            if (!toolName) {
              if (args.query !== undefined) {
                toolName = 'web_search';
              } else if (args.to !== undefined) {
                toolName = 'send_mail';
              }
            }
            if (toolName) {
              toolCalls.push({
                name: toolName,
                args: args,
                id: tc.id || `call_${Date.now()}`,
              });
            }
          } catch (e) {
            console.error('[Agent] Failed to parse tool args:', tc.args);
          }
        }
      }

      if (toolCalls.length === 0) {
        // 没有工具调用，保存回答并结束
        const fullContent = aiMessage.content as string || partialContent;
        if (fullContent && !partialContent) {
          // 如果流式没有输出内容，一次性输出
          yield { type: 'chunk', content: fullContent };
        }
        this.sessionService.addMessage(sessionId, new AIMessage(fullContent));
      } else {
        // 有工具调用，执行工具
        for (const toolCall of toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.args;
          const toolCallId = toolCall.id || `call_${Date.now()}`;

          yield {
            type: 'tool_call',
            toolName,
            toolInput: toolArgs
          };

          // 查找并执行工具
          const targetTool = this.tools.find(t => t.name === toolName);
          let toolResult: string;

          if (targetTool) {
            try {
              toolResult = await targetTool.invoke(toolArgs);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : '工具执行失败';
              toolResult = `错误：${errorMessage}`;
            }
          } else {
            toolResult = `错误：未找到工具 ${toolName}`;
          }

          yield {
            type: 'tool_result',
            toolName,
            toolResult
          };

          // 添加工具结果到消息历史
          messages.push(new ToolMessage({
            content: toolResult,
            name: toolName,
            tool_call_id: toolCallId,
          }));

          this.sessionService.addMessage(sessionId, new ToolMessage({
            content: toolResult,
            name: toolName,
            tool_call_id: toolCallId,
          }));
        }

        // 工具调用后，流式输出生成回复
        yield { type: 'chunk', content: '\n\n' };
        const finalStream = await this.llm.stream(messages);
        let finalContent = '';

        for await (const chunk of finalStream) {
          const content = chunk.content as string;
          if (content) {
            finalContent += content;
            yield { type: 'chunk', content };
          }
        }

        this.sessionService.addMessage(sessionId, new AIMessage(finalContent));
      }

      // 设置会话意图
      this.sessionService.setIntent(sessionId, 'agent');

      yield { type: 'end' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Agent 处理失败';
      console.error('[Agent] Error:', error);
      yield { type: 'error', error: errorMessage };
    }
  }
}
