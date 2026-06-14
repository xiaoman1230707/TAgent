import { useState, useRef, useCallback } from 'react';
import { postChatStream } from '../services/chatApi';

/**
 * 自定义 Hook 处理流式聊天
 * @returns {{
 *   messages: Array,
 *   streamingContent: string,
 *   isStreaming: boolean,
 *   error: string | null,
 *   sendMessage: (message: string) => Promise<void>,
 *   stopStreaming: () => void,
 *   clearMessages: () => void
 * }}
 */
export function useChatStream() {
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  // 使用 ref 保存 abortController，避免重渲染问题
  const abortControllerRef = useRef(null);

  /**
   * 发送消息并处理流式响应
   */
  const sendMessage = useCallback(async (message) => {
    if (!message.trim()) return;

    // 重置错误状态
    setError(null);

    // 添加用户消息
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
    };
    setMessages((prev) => [...prev, userMessage]);

    // 初始化流式状态
    setIsStreaming(true);
    setStreamingContent('');

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    try {
      const response = await postChatStream(message, abortControllerRef.current.signal);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      // 读取流
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // 解码并追加内容
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setStreamingContent(fullContent);
      }

      // 流结束，添加完整消息到列表
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: fullContent,
      };
      setMessages((prev) => [...prev, assistantMessage]);

    } catch (err) {
      if (err.name === 'AbortError') {
        // 用户主动取消，添加已接收的内容
        if (streamingContent) {
          const assistantMessage = {
            id: Date.now() + 1,
            role: 'assistant',
            content: streamingContent,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
      } else {
        setError(err.message || '发送消息失败');
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  }, [streamingContent]);

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
  }, []);

  return {
    messages,
    streamingContent,
    isStreaming,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}
