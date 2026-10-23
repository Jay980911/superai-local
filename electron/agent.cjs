// agent.cjs — Agent 循环：LLM ↔ 工具，流式输出事件
// 事件类型: text | step | file | done | error
const { streamChat } = require('./llm.cjs');
const { TOOL_SCHEMAS, execute } = require('./tools.cjs');
const memory = require('./memory.cjs');
const skills = require('./skills.cjs');

const BASE_PROMPT = `你是「SuperAI」，一个本地 AI 工作台助手。

你可以在用户授权的工作目录里：
- list_files: 列出目录文件
- read_file: 读取文件
- write_file: 写入/创建文件
- run_command: 执行 shell 命令

你还有长期记忆能力：
- save_memory(content, tags): 当用户透露个人信息、偏好、项目背景时主动保存
- search_memory(query): 需要回忆用户之前说过的事时查询
- 不确定要不要存时，宁可存

工作方式：
1. 先理解用户要达成的结果
2. 拆解为步骤，逐步调用工具执行
3. 每完成一步，用简短的中文说明做了什么
4. 生成文件后告知文件名和路径
5. 全部完成后总结成果

你还有「技能」能力：当用户任务匹配某个已安装技能时，先调用 read_skill(name) 读取其完整指令，再按指令执行。未匹配时不强行调用。

语气：简洁、专业、不废话。用中文回复。`;

/**
 * 运行 agent 循环
 * @param {string} userInput
 * @param {Array} history  — 之前的消息 [{role,content}]
 * @param {object} cfg     — settings
 * @param {(event:object)=>void} onEvent
 */
async function run(userInput, history, cfg, onEvent) {
  // 注入长期记忆到 system prompt
  const memText = memory.getMemoryText();
  let systemPrompt = BASE_PROMPT;
  if (memText) {
    systemPrompt += `\n\n【关于用户，你应该记住】\n${memText}`;
  }
  // 注入已安装技能清单
  let skillList = [];
  try { skillList = skills.listSkills(); } catch {}
  if (skillList.length > 0) {
    const lines = skillList.map((s) => `- ${s.name || s.display_name}${s.description ? '：' + s.description : ''}`).join('\n');
    systemPrompt += `\n\n【已安装技能】（任务匹配时可调用 read_skill 读取指令）\n${lines}`;
  }
  const messages = [
    { role: 'system', content: systemPrompt },
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
        // 记忆工具走 memory.cjs
        let result;
        if (tc.name === 'save_memory') {
          result = memory.saveMemory(tc.args.content, tc.args.tags);
        } else if (tc.name === 'search_memory') {
          result = memory.searchMemory(tc.args.query);
        } else {
          // read_skill / 本地文件 / 命令 统一走 tools.execute
          result = await execute(tc.name, tc.args, cfg.workspace);
        }
        const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

        // 如果是写文件，发出 file 事件 + 刷新记忆检查
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
    case 'save_memory': return `保存记忆: ${(a.content || '').slice(0, 40)}`;
    case 'search_memory': return `搜索记忆: ${a.query || ''}`;
    case 'read_skill': return `读取技能: ${a.name || ''}`;
    default: return name;
  }
}

module.exports = { run };
