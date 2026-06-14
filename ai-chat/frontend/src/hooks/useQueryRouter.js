import { useState, useRef, useCallback } from 'react';
import { analyzeIntent, postAgentStream, postRagStream, getDbQuery } from '../services/chatApi';

/**
 * 自定义 Hook 处理 Query 分流路由
 * 1. 先分析意图
 * 2. 根据意图路由到不同流程
 * @returns {{
 *   messages: Array,
 *   streamingContent: string,
 *   isStreaming: boolean,
 *   isAnalyzing: boolean,
 *   currentFlow: string | null,
 *   error: string | null,
 *   sendMessage: (message: string) => Promise<void>,
 *   stopStreaming: () => void,
 *   clearMessages: () => void
 * }}
 */
export function useQueryRouter() {
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentFlow, setCurrentFlow] = useState(null);
  const [error, setError] = useState(null);

  // Session ID 管理
  const sessionIdRef = useRef(null);
  const abortControllerRef = useRef(null);

  /**
   * 发送消息并处理分流路由
   */
  const sendMessage = useCallback(async (message) => {
    if (!message.trim()) return;

    // 重置状态
    setError(null);
    setIsAnalyzing(true);
    setCurrentFlow(null);

    // 添加用户消息
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      // 1. 分析意图
      console.log('[QueryRouter] 分析意图...');
      const intentResult = await analyzeIntent(message, sessionIdRef.current);
      console.log('[QueryRouter] 意图分析结果:', intentResult);

      // 保存 sessionId
      sessionIdRef.current = intentResult.sessionId;

      // 2. 根据意图路由
      const { intent } = intentResult;
      setIsAnalyzing(false);
      setCurrentFlow(intent);

      // 3. 显示进入流程的提示
      const flowNames = {
        rag: 'RAG 检索生成',
        chat: '直接对话',
        retrieval: '原文检索',
        agent: 'Agent 工具调用',
      };

      const systemMessage = {
        id: Date.now() + 0.5,
        role: 'system',
        content: `正在进入【${flowNames[intent] || intent}】流程...`,
        intent: intent,
        confidence: intentResult.confidence,
        reason: intentResult.reason,
      };
      setMessages((prev) => [...prev, systemMessage]);

      // 4. 根据意图调用对应接口
      switch (intent) {
        case 'agent':
          await handleAgentStream(message);
          break;
        case 'rag':
          await handleRagStream(message);
          break;
        case 'retrieval':
          await handleDbQuery(message);
          break;
        case 'chat':
        default:
          // Chat 使用原有接口或简化处理
          await handleAgentStream(message);
          break;
      }

    } catch (err) {
      console.error('[QueryRouter] Error:', err);
      setError(err.message || '处理失败');
      setIsAnalyzing(false);
      setIsStreaming(false);
    }
  }, []);

  /**
   * 处理 Agent 流式响应
   */
  const handleAgentStream = async (query) => {
    setIsStreaming(true);
    setStreamingContent('');

    abortControllerRef.current = new AbortController();

    try {
      const response = await postAgentStream(
        query,
        sessionIdRef.current,
        abortControllerRef.current.signal
      );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // 解析 SSE 数据
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5).trim());

              if (data.type === 'chunk' && data.content) {
                fullContent += data.content;
                setStreamingContent(fullContent);
              } else if (data.type === 'tool_call') {
                fullContent += `\n[调用工具: ${data.toolName}]\n`;
                setStreamingContent(fullContent);
              } else if (data.type === 'tool_result') {
                fullContent += `[工具结果: ${data.toolResult?.substring(0, 100)}...]\n`;
                setStreamingContent(fullContent);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 添加完整消息
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: fullContent,
        flow: 'agent',
      };
      setMessages((prev) => [...prev, assistantMessage]);

    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Agent 请求失败');
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  };

  /**
   * 处理 RAG 流式响应
   */
  const handleRagStream = async (query) => {
    setIsStreaming(true);
    setStreamingContent('');

    abortControllerRef.current = new AbortController();

    try {
      const response = await postRagStream(
        query,
        sessionIdRef.current,
        abortControllerRef.current.signal
      );

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // 解析 SSE 格式数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留不完整的最后一行

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (data) {
              fullContent += data;
              setStreamingContent(fullContent);
            }
          }
        }
      }

      // 处理剩余缓冲区
      if (buffer.startsWith('data:')) {
        const data = buffer.slice(5).trim();
        if (data) {
          fullContent += data;
          setStreamingContent(fullContent);
        }
      }

      // 添加完整消息
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: fullContent,
        flow: 'rag',
      };
      setMessages((prev) => [...prev, assistantMessage]);

    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'RAG 请求失败');
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  };

  /**
   * 处理 DB Query（非流式）
   */
  const handleDbQuery = async (query) => {
    try {
      const result = await getDbQuery(query, 5);

      // 格式化结果
      let content = `检索到 ${result.count} 条相关原文：\n\n`;
      result.results.forEach((item, idx) => {
        content += `[${idx + 1}] 第${item.chapter_num}章 (相似度: ${item.score.toFixed(2)})\n`;
        content += `${item.content?.substring(0, 200)}...\n\n`;
      });

      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: content,
        flow: 'retrieval',
        results: result.results,
      };
      setMessages((prev) => [...prev, assistantMessage]);

    } catch (err) {
      setError(err.message || 'DB 查询失败');
    }
  };

  /**
   * 停止流式输出
   */
  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  /**
   * 清空消息
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent('');
    setError(null);
    setCurrentFlow(null);
    sessionIdRef.current = null;
  }, []);

  return {
    messages,
    streamingContent,
    isStreaming,
    isAnalyzing,
    currentFlow,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}
