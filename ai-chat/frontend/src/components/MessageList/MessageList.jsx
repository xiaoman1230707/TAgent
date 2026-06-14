import { useRef, useEffect } from 'react';
import MessageItem from '../MessageItem/MessageItem';
import './MessageList.css';

/**
 * 消息列表组件
 * @param {Object} props
 * @param {Array} props.messages - 消息数组
 * @param {string} props.streamingContent - 正在流式输出的内容
 * @param {boolean} props.isStreaming - 是否正在流式输出
 */
function MessageList({ messages, streamingContent, isStreaming }) {
  const bottomRef = useRef(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <div className="message-list">
      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <div className="empty-text">开始你的对话吧</div>
          <div className="empty-hint">输入消息与 AI 助手交流</div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              role={message.role}
              content={message.content}
            />
          ))}

          {/* 流式输出中的消息 */}
          {isStreaming && streamingContent && (
            <MessageItem
              role="assistant"
              content={streamingContent}
              isStreaming={true}
            />
          )}

          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
}

export default MessageList;
