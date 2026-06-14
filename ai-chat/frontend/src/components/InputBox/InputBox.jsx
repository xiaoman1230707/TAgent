import { useState } from 'react';
import './InputBox.css';

/**
 * 输入框组件
 * @param {Object} props
 * @param {boolean} props.disabled - 是否禁用
 * @param {boolean} props.isStreaming - 是否正在流式输出
 * @param {Function} props.onSend - 发送消息回调
 * @param {Function} props.onStop - 停止流式输出回调
 */
function InputBox({ disabled, isStreaming, onSend, onStop }) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="input-box">
      <div className="input-container">
        <textarea
          className="input-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          disabled={disabled}
          rows={1}
        />

        {isStreaming ? (
          <button
            className="action-button stop-button"
            onClick={onStop}
            title="停止生成"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            className={`action-button send-button ${!input.trim() || disabled ? 'disabled' : ''}`}
            onClick={handleSend}
            disabled={!input.trim() || disabled}
            title="发送"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default InputBox;
