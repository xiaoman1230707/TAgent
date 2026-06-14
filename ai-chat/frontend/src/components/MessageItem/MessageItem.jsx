import './MessageItem.css';

/**
 * 单条消息组件
 * @param {Object} props
 * @param {'user' | 'assistant'} props.role - 消息角色
 * @param {string} props.content - 消息内容
 * @param {boolean} props.isStreaming - 是否正在流式输出
 */
function MessageItem({ role, content, isStreaming = false }) {
  const isUser = role === 'user';

  return (
    <div className={`message-item ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        <div className="message-bubble">
          {content}
          {isStreaming && <span className="streaming-cursor">▋</span>}
        </div>
        <div className="message-time">
          {new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

export default MessageItem;
