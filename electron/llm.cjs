// llm.cjs — LLM 客户端：DeepSeek/OpenAI/Ollama 流式对话
// 三家都走 HTTP fetch，DeepSeek/OpenAI 用 /v1/chat/completions (SSE)，
// Ollama 用 /api/chat (NDJSON)。

/** @param {{provider:string,apiKey:string,baseUrl:string,model:string}} cfg */
function buildUrl(cfg, providerPath) {
  let base = (cfg.baseUrl || '').replace(/\/+$/, '');
  if (!base) base = providerDefaults(cfg.provider).baseUrl;
  return base + providerPath;
}

function providerDefaults(provider) {
  const map = {
    deepseek: 'https://api.deepseek.com',
    openai: 'https://api.openai.com',
    ollama: 'http://localhost:11434',
  };
  return { baseUrl: map[provider] || '' };
}

/**
 * 流式对话。yield { type: 'text', delta } | { type: 'tool_call', tool, args }
 * @param {Array<{role:string,content:string}>} messages
 * @param {object} cfg — {provider,apiKey,baseUrl,model,tools?}
 * @param {(chunk:object)=>void} onChunk
 */
async function streamChat(messages, cfg, onChunk) {
  if (cfg.provider === 'ollama') {
    return streamOllama(messages, cfg, onChunk);
  }
  return streamOpenAI(messages, cfg, onChunk);
}

/** DeepSeek/OpenAI compatible — /v1/chat/completions SSE */
async function streamOpenAI(messages, cfg, onChunk) {
  const url = buildUrl(cfg, '/v1/chat/completions');
  const body = {
    model: cfg.model,
    messages,
    stream: true,
  };
  if (cfg.tools) {
    body.tools = cfg.tools;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM ${res.status}: ${txt.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let toolCalls = {}; // index → {id,name,args}

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const choice = json.choices?.[0]?.delta;
        if (!choice) continue;
        if (choice.content) {
          onChunk({ type: 'text', delta: choice.content });
        }
        if (choice.tool_calls) {
          for (const tc of choice.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id || '', name: '', args: '' };
            if (tc.function?.name) toolCalls[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
          }
        }
      } catch {}
    }
  }

  // 发出累积的 tool_calls
  for (const idx of Object.keys(toolCalls).sort((a, b) => +a - +b)) {
    const tc = toolCalls[idx];
    let args = {};
    try { args = JSON.parse(tc.args || '{}'); } catch {}
    onChunk({ type: 'tool_call', id: tc.id, name: tc.name, args });
  }
}

/** Ollama — /api/chat NDJSON */
async function streamOllama(messages, cfg, onChunk) {
  const url = buildUrl(cfg, '/api/chat');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      tools: cfg.tools || undefined,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Ollama ${res.status}: ${txt.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed);
        if (json.message?.content) {
          onChunk({ type: 'text', delta: json.message.content });
        }
        if (json.message?.tool_calls) {
          for (const tc of json.message.tool_calls) {
            onChunk({ type: 'tool_call', id: tc.id || '', name: tc.function?.name || '', args: tc.function?.arguments || {} });
          }
        }
      } catch {}
    }
  }
}

module.exports = { streamChat, providerDefaults };
