import MessageList from '../MessageList/MessageList';
import InputBox from '../InputBox/InputBox';
import { useQueryRouter } from '../../hooks/useQueryRouter';
import './ChatContainer.css';

/**
 * 聊天容器组件（Query 分流版本）
 * 整合消息列表和输入框，管理意图分析和分流路由
 */
function ChatContainer() {
  const {
    messages,
    streamingContent,
    isStreaming,
    isAnalyzing,
    currentFlow,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
  } = useQueryRouter();

  // 流程名称映射
  const flowNames = {
    rag: 'RAG 检索生成',
    chat: '直接对话',
    retrieval: '原文检索',
    agent: 'Agent 工具调用',
  };

  return (
    <div className="chat-container">
      {/* 头部 */}
      <header className="chat-header">
        <div className="header-title">
          <span className="header-icon">🤖</span>
          <span>AI 助手（Query 分流）</span>
        </div>
        {messages.length > 0 && (
          <button className="clear-button" onClick={clearMessages} title="清空对话">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
      </header>

      {/* 当前流程指示器 */}
      {(isAnalyzing || currentFlow) && (
        <div className="flow-indicator">
          {isAnalyzing ? (
            <span className="analyzing">🔍 正在分析意图...</span>
          ) : (
            <span className="current-flow">
              当前流程: {flowNames[currentFlow] || currentFlow}
            </span>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* 消息列表 */}
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />

      {/* 输入框 */}
      <InputBox
        disabled={isStreaming || isAnalyzing}
        isStreaming={isStreaming}
        onSend={sendMessage}
        onStop={stopStreaming}
      />
    </div>
  );
}

export default ChatContainer;
