const API_BASE_URL = ''; // 使用 Vite 代理

/**
 * 分析用户意图
 * @param {string} query - 用户查询
 * @param {string} sessionId - 可选的会话ID
 * @returns {Promise<{intent: string, confidence: number, reason: string, sessionId: string}>}
 */
export async function analyzeIntent(query, sessionId = null) {
  const response = await fetch(`${API_BASE_URL}/intent/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, sessionId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: '意图分析失败',
    }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * 发送流式聊天请求（原有接口）
 * @param {string} message - 用户消息
 * @param {AbortSignal} signal - 用于取消请求
 * @returns {Promise<Response>} - 返回 Response 对象，body 是 ReadableStream
 */
export async function postChatStream(message, signal) {
  const response = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: '请求失败',
    }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response;
}

/**
 * Agent 流式请求
 * @param {string} query - 用户查询
 * @param {string} sessionId - 会话ID
 * @param {AbortSignal} signal - 用于取消请求
 * @returns {Promise<Response>} - SSE 流式响应
 */
export async function postAgentStream(query, sessionId, signal) {
  const params = new URLSearchParams({ query });
  if (sessionId) params.append('sessionId', sessionId);

  const response = await fetch(`${API_BASE_URL}/agent/stream?${params}`, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
    },
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'Agent 请求失败',
    }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response;
}

/**
 * RAG 流式请求
 * @param {string} query - 用户查询
 * @param {string} sessionId - 会话ID
 * @param {AbortSignal} signal - 用于取消请求
 * @returns {Promise<Response>} - SSE 流式响应
 */
export async function postRagStream(query, sessionId, signal) {
  const params = new URLSearchParams({ query });
  if (sessionId) params.append('sessionId', sessionId);

  const response = await fetch(`${API_BASE_URL}/rag/stream?${params}`, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
    },
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'RAG 请求失败',
    }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response;
}

/**
 * DB Query 请求（非流式）
 * @param {string} query - 用户查询
 * @param {number} limit - 返回结果数量
 * @returns {Promise<{query: string, count: number, results: Array}>}
 */
export async function getDbQuery(query, limit = 5) {
  const params = new URLSearchParams({ query, limit: String(limit) });

  const response = await fetch(`${API_BASE_URL}/db/query?${params}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'DB 查询失败',
    }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * 非流式聊天请求（备用）
 * @param {string} message - 用户消息
 * @returns {Promise<{content: string}>}
 */
export async function postChat(message) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: '请求失败',
    }));
    throw new Error(error.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}
