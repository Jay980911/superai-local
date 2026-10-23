// agent.cjs — Agent 循环：LLM ↔ 工具，流式输出事件
// 事件类型: text | step | file | done | error
const { streamChat } = require('./llm.cjs');
const { TOOL_SCHEMAS, execute } = require('./tools.cjs');

const SYSTEM_PROMPT = `你是「案台」(BENCH)，一个本地 AI 工作台助手。

你可以在用户授权的工作目录里：
- list_files: 列出目录文件
- read_file: 读取文件
- write_file: 写入/创建文件
- run_command: 执行 shell 命令

工作方式：
1. 先理解用户要达成的结果
2. 拆解为步骤，逐步调用工具执行
3. 每完成一步，用简短的中文说明做了什么
4. 生成文件后告知文件名和路径
5. 全部完成后总结成果

语气：简洁、专业、不废话。用中文回复。`;

/**
 * 运行 agent 循环
 * @param {string} userInput
 * @param {Array} history  — 之前的消息 [{role,content}]
 * @param {object} cfg     — settings
 * @param {(event:object)=>void} onEvent
 */
async function run(userInput, history, cfg, onEvent) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userInput },
  ];

  let stepCount = 0;
  const maxRounds = 15;

  for (let round = 0; round < maxRounds; round++) {
    // 收集本轮 LLM 的文本和 tool_calls
    let textBuf = '';
    const toolResults = [];
    const startTime = Date.now();

    await streamChat(messages, { ...cfg, tools: TOOL_SCHEMAS }, (chunk) => {
      if (chunk.type === 'text') {
        textBuf += chunk.delta;
        onEvent({ type: 'text', delta: chunk.delta });
      } else if (chunk.type === 'tool_call') {
        stepCount++;
        onEvent({
          type: 'step',
          status: 'running',
          label: describeToolCall(chunk.name, chunk.args),
          index: stepCount,
        });
        toolResults.push(chunk);
      }
    });

    // 如果 LLM 返回了纯文本（无 tool_call），对话结束
    if (textBuf && toolResults.length === 0) {
      onEvent({ type: 'done', text: textBuf, steps: stepCount });
      return { reply: textBuf, steps: stepCount };
    }

    // 把 assistant 的文本加入历史
    if (textBuf) {
      messages.push({ role: 'assistant', content: textBuf });
    }

    // 执行工具
    for (const tc of toolResults) {
      try {
        // 更新步骤状态为运行中
        const result = await execute(tc.name, tc.args, cfg.workspace);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

        // 如果是写文件，发出 file 事件
        if (tc.name === 'write_file') {
          onEvent({
            type: 'file',
            name: tc.args.path,
            action: 'written',
            size: typeof result === 'object' ? result.size : 0,
          });
        }

        onEvent({
          type: 'step',
          status: 'done',
          label: describeToolCall(tc.name, tc.args),
          index: stepCount,
          duration,
        });

        // 把工具结果加入历史
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }],
        });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: JSON.stringify(result).slice(0, 8000),
        });
      } catch (err) {
        onEvent({
          type: 'step',
          status: 'error',
          label: describeToolCall(tc.name, tc.args),
          index: stepCount,
          error: err.message,
        });
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }],
        });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: `错误: ${err.message}`,
        });
      }
    }
  }

  onEvent({ type: 'done', text: '', steps: stepCount });
  return { reply: '', steps: stepCount };
}

function describeToolCall(name, args) {
  const a = args || {};
  switch (name) {
    case 'list_files': return `列出目录 ${a.dir || '工作目录'}`;
    case 'read_file': return `读取 ${a.path}`;
    case 'write_file': return `写入 ${a.path}`;
    case 'run_command': return `执行命令 ${a.command?.slice(0, 60) || ''}`;
    default: return name;
  }
}

module.exports = { run };
