// api.ts — mock → 真接口替换点
// 浏览器环境：返回 mock 数据
// Electron 环境：走 window.superai IPC 调真实 LLM + 本地文件系统
import type { Message, Session, SessionGroup, Suggestion, FileEntry } from '../types';
import {
  messages as mockMessages,
  sessions as mockSessions,
  suggestions as mockSuggestions,
} from './mock';
import {
  getStoredToken, isLoggedIn,
  listModels, createModel, updateCloudModel, deleteCloudModel, selectModel, getSelectedCredentials,
  testCloudModel, getCredentials,
  listConversations, createCloudConversation, getCloudConversationMessages, addCloudMessage,
  renameCloudConversation, setCloudConversationPinned, deleteCloudConversation, setCloudConversationWorkspace,
  type CloudModel, type CloudConversation, type CloudMessage,
} from './cloud';

// re-export 登录态判断（供 UI 组件直接从 api 取）
export { isLoggedIn };

export const isElectron = typeof window !== 'undefined' && !!(window as any).superai;

// ===== 模型配置 =====
// 协议与 dsh（deepseek-harness）llm-pi-ai 的三种 provider 协议对齐：
//   openai-completions  — OpenAI Chat Completions 兼容（DeepSeek/通义/Kimi/智谱/Ollama(/v1)/vLLM/LiteLLM 等绝大多数服务）
//   openai-responses    — OpenAI Responses API
//   anthropic-messages  — Anthropic Messages API
// 不内置任何模型，全部由用户自行添加。
export type ApiType = 'openai-completions' | 'openai-responses' | 'anthropic-messages';
export interface ModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  api: ApiType;
  hasKey?: boolean;  // 云端：是否已配置 apiKey（列表不返回明文，仅标记）
  kind?: 'chat' | 'image';  // 用途：对话 / 图像生成（云端字段，image-gen 同步用）
}

export type UiTheme = 'warm' | 'mist' | 'night';

export interface Settings {
  models: ModelConfig[];
  currentModelId: string;
  autoExec: boolean;
  /** 应用于加载页、登录页和全部应用界面的统一主题。 */
  uiTheme?: UiTheme;
  /** 是否扫描全局技能目录（~/.agents/skills 等 dsh 默认根）。默认 false：只扫 superai data/skills。 */
  scanGlobalSkills?: boolean;
  /** 全局默认工作目录覆盖（用户在无活动会话时选的目录）；空 = 安装目录/workspace */
  workspace?: string;
  imageModel?: { baseUrl: string; apiKey: string; model: string } | null;
  /** Unsplash 图库 API Access Key（可选，image-gen 图库模式需要） */
  unsplashKey?: string;
  /** HTTP/HTTPS 代理地址（可选，如 http://127.0.0.1:7890），image-gen 访问境外图库用 */
  proxy?: string;
}

export type AgentEvent =
  | ({ type: 'text'; text: string }   // 全量快照（dsh 快照语义，前端替换而非拼接）
  | { type: 'step'; status: 'running' | 'done' | 'error'; label: string; index: number; duration?: string; error?: string; result?: string }
  | { type: 'file'; name: string; path: string; action: string }
  | { type: 'artifacts'; files: Array<{ name: string; path: string; action: string }> }
  | { type: 'phase'; phase: 'preparing' | 'waiting' | 'thinking' | 'finalizing' } // 真实阶段（由 dsh 事件驱动）
  | { type: 'done'; text: string; steps: number }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }) & { sessionId?: string };

// ===== 长期记忆 =====
export interface MemoryFact {
  id: string;
  content: string;
  tags: string[];
  createdAt: string | null;
}

// ===== 技能 =====
export interface Skill {
  name: string;
  display_name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  tags: string[];
  body: string;
}

// ===== 设置 =====
// 云端模型 → 本地 ModelConfig（列表不返回 apiKey 明文，用 hasKey 标记）
function cloudToModel(m: CloudModel): ModelConfig {
  return {
    id: String(m.id), name: m.name, baseUrl: m.baseUrl || '',
    apiKey: '', hasKey: m.hasKey,
    model: m.modelName, api: (m.apiType as ApiType) || 'openai-completions',
    kind: m.kind || 'chat',
  };
}

export async function getSettings(): Promise<Settings> {
  const local: Settings = isElectron ? await (window as any).superai.getSettings() : { models: [], currentModelId: '', autoExec: true, uiTheme: 'warm' };
  // 登录后：models + currentModelId 从云端取，autoExec/workspace 等仍用本地
  if (getStoredToken()) {
    try {
      const [cms, sel] = await Promise.all([listModels(), getSelectedCredentials()]);
      const models = cms.map(cloudToModel);
      return { ...local, models, currentModelId: sel?.id ? String(sel.id) : '' };
    } catch { /* 云端失败回退本地 settings */ }
  }
  return local;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  if (isElectron) return await (window as any).superai.saveSettings(patch);
  return { models: [], currentModelId: '', autoExec: patch.autoExec ?? true, uiTheme: patch.uiTheme ?? 'warm' };
}

export async function getDefaultWorkspace(): Promise<string> {
  if (isElectron) return await (window as any).superai.defaultWorkspace();
  return '~/SuperAI/workspace';
}

// ===== 添加自定义模型（任意大模型，自行配置） =====
export async function addModel(model: Omit<ModelConfig, 'id'>): Promise<ModelConfig> {
  if (getStoredToken()) {
    const m = await createModel({ name: model.name, baseUrl: model.baseUrl, apiKey: model.apiKey, modelName: model.model, apiType: model.api, kind: model.kind });
    return cloudToModel(m);
  }
  if (isElectron) return await (window as any).superai.models.add(model);
  return { ...model, id: 'mock-' + Date.now() };
}

export async function removeModel(id: string): Promise<{ ok: boolean; error?: string }> {
  if (getStoredToken()) {
    try { await deleteCloudModel(Number(id)); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e.message || '删除失败' }; }
  }
  if (isElectron) return await (window as any).superai.models.remove(id);
  return { ok: true };
}

export async function setCurrentModel(id: string): Promise<Settings> {
  if (getStoredToken()) {
    await selectModel(Number(id));
    return await getSettings();  // 重新拉取（含云端 selected）
  }
  if (isElectron) return await (window as any).superai.models.setCurrent(id);
  return { models: [], currentModelId: id, autoExec: true };
}

export async function updateModel(id: string, patch: Partial<ModelConfig>): Promise<ModelConfig | null> {
  if (getStoredToken()) {
    const m = await updateCloudModel(Number(id), {
      name: patch.name, baseUrl: patch.baseUrl, apiKey: patch.apiKey,
      modelName: patch.model, apiType: patch.api, kind: patch.kind,
    });
    return cloudToModel(m);
  }
  if (isElectron) return await (window as any).superai.models.update(id, patch);
  return null;
}

/** 测试模型连接：登录态走云端 /api/models/test（云端有明文 key，可测任意已存模型）；本地态走 IPC 直接发请求 */
export async function testModel(cfg: { id?: string; baseUrl: string; apiKey?: string; model?: string; api: string }): Promise<{ ok: boolean; status: number; detail: string }> {
  if (getStoredToken()) {
    try {
      const r = await testCloudModel({
        id: cfg.id ? Number(cfg.id) : undefined,
        baseUrl: cfg.baseUrl || undefined,
        apiKey: cfg.apiKey || undefined,
        modelName: cfg.model || undefined,
        apiType: cfg.api || undefined,
      });
      // 兼容多种返回字段
      const ok = r?.ok !== undefined ? !!r.ok : (r?.success !== undefined ? !!r.success : !r?.error);
      const detail = r?.detail || r?.message || r?.error || (ok ? '连接成功' : '测试失败');
      return { ok, status: r?.status || 200, detail };
    } catch (e: any) {
      return { ok: false, status: 0, detail: '云端测试失败：' + (e?.message || '未知') };
    }
  }
  if (isElectron) return await (window as any).superai.models.test(cfg);
  return { ok: false, status: 0, detail: '仅桌面端可测试连接' };
}

// ===== 会话 =====
export function getSessions(): Session[] {
  return mockSessions;
}

export function getSuggestions(): Suggestion[] {
  return mockSuggestions;
}

export function getInitialMessages(): Message[] {
  return isElectron ? [] : mockMessages;
}

// ===== Agent 运行 =====
export async function runAgent(
  input: string,
  history: Array<{ role: string; content: string }>,
  workspace: string,
  onEvent: (e: AgentEvent) => void,
  sessionId?: string,
): Promise<{ error?: string }> {
  if (isElectron) {
    const superai = (window as any).superai;
    // onAgentEvent 已由 App.tsx 全局路由器接管（按 sessionId 分发），此处不再注册
    try {
      return await superai.runAgent(input, history, workspace, sessionId);
    } catch (e: any) {
      // handler 之外的 throw（磁盘错误 / 通道断开等）会走 IPC rejection，
      // 这里收敛成 {error}，否则 send() 未处理拒绝会导致 running 卡死、消息不存盘
      return { error: e?.message || '主进程无响应，请重试' };
    }
  }
  onEvent({ type: 'text', text: '收到，正在拆解任务…（浏览器预览模式，请在桌面应用中运行以执行真实任务）' });
  onEvent({ type: 'done', text: '', steps: 0 });
  return {};
}

/** 停止指定会话正在进行的一轮运行（dsh 协议无取消，主进程侧强杀 runtime） */
export async function cancelAgent(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  if (isElectron) return await (window as any).superai.cancelAgent(sessionId);
  return { ok: false };
}

// 插话：回合运行中注入消息引导当前任务（dsh followup → inbox splice，不打断）
export async function steerAgent(sessionId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (isElectron) return await (window as any).superai.steerAgent(sessionId, text);
  return { ok: false, error: '仅在桌面应用中可用' };
}

// ===== 文件 =====
export async function listFiles(dir?: string, workspace?: string): Promise<FileEntry[]> {
  if (isElectron) return await (window as any).superai.listFiles(dir, workspace);
  return [];
}

export async function readFile(p: string, workspace?: string): Promise<string> {
  if (isElectron) return await (window as any).superai.readFile(p, workspace);
  return '';
}

export async function writeFile(p: string, content: string, workspace?: string): Promise<{ path: string; size: number }> {
  if (isElectron) return await (window as any).superai.writeFile(p, content, workspace);
  return { path: p, size: content.length };
}

// ===== 附件（用户显式选中，可越出 workspace）=====
export interface PickedFile { path: string; name: string; size: number }

/** 弹出文件选择框（多选），返回文件元信息 */
export async function pickFiles(): Promise<PickedFile[]> {
  if (isElectron) return await (window as any).superai.pickFiles();
  return [];
}

/**
 * 读取附件内容（主进程限 256KB + 二进制检测）。
 * @returns 文本内容 / { binary } 二进制只报大小 / { error } 失败
 */
export async function readAttachment(p: string): Promise<{ content?: string; truncated?: boolean; size?: number; binary?: boolean; error?: string }> {
  if (isElectron) return await (window as any).superai.readAttachment(p);
  return { error: '仅在桌面应用中可用' };
}

/** 拖拽进来的 File → 磁盘绝对路径（Electron webUtils） */
export function pathOfDroppedFile(file: File): string {
  if (isElectron) return (window as any).superai.getPathForFile(file) || '';
  return '';
}

// ===== 会话持久化 =====
function cloudConvToSession(c: CloudConversation): Session {
  const t = c.updatedAt ? new Date(c.updatedAt) : new Date();
  const group: SessionGroup = c.pinned ? '置顶' : '其他';
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  return {
    id: String(c.id),
    title: c.title || '新对话',
    summary: `${c.messageCount || 0} 条消息`,
    time: `${hh}:${mm}`,
    group,
    workspace: c.workspace || '',
    pinned: !!c.pinned,
  };
}

function cloudMsgToMessage(m: CloudMessage): Message {
  const role = m.role === 'user' ? 'user' : 'agent';
  const ts = m.createdAt ? Date.parse(m.createdAt) : Date.now();
  return { id: String(m.id), role, time: m.createdAt || '', text: m.content, createdAt: ts } as Message;
}

export async function listSessions(): Promise<Session[]> {
  // 本地优先：登录态先 best-effort 合并云端（下拉本地没有的会话副本，用云端 id 建），再返回本地列表
  if (isLoggedIn() && isElectron) {
    try { await syncCloudToLocal(); } catch { /* 云端不可用不阻断本地 */ }
  }
  if (isElectron) return await (window as any).superai.sessions.list();
  if (isLoggedIn()) {
    const data = await listConversations();
    return (data.conversations || []).map(cloudConvToSession);
  }
  return mockSessions;
}

/** 云端→本地 best-effort 合并：
 *  - 本地无的会话：用云端 id 建副本（含 title/pinned）
 *  - 本地已有的会话：比 updatedAt，云端更新则以云端为准覆盖 title/pinned/workspace（设置以最后修改为准）
 *  直接走本地 IPC，不调 api.ts 封装，避免双写循环。 */
async function syncCloudToLocal(): Promise<void> {
  const w = window as any;
  if (!w.superai?.sessions) return;
  const data = await listConversations();
  for (const c of data.conversations || []) {
    const cid = String(c.id);
    const local = await w.superai.sessions.get(cid);
    if (!local) {
      // 本地无：下拉新会话副本
      await w.superai.sessions.create(c.workspace || '', cid);
      if (c.title && c.title !== '新对话') await w.superai.sessions.rename(cid, c.title);
      if (c.pinned) await w.superai.sessions.togglePin(cid);
      continue;
    }
    // 已有：以 updatedAt 最后修改为准更新元数据（消息合并见 mergeMessages）
    const cloudTs = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
    const localTs = (local as any).updatedAt || 0;
    if (cloudTs > localTs) {
      if (c.title && c.title !== local.title) await w.superai.sessions.rename(cid, c.title);
      if ((c.workspace || '') !== (local.workspace || '')) await w.superai.sessions.setWorkspace(cid, c.workspace || '');
      if (!!c.pinned !== !!local.pinned) await w.superai.sessions.togglePin(cid);
    }
  }
}

export async function togglePinSession(id: string, pinned: boolean): Promise<Session[]> {
  // 本地优先；登录态 best-effort 同步云端
  if (isElectron) await (window as any).superai.sessions.togglePin(id);
  if (isLoggedIn()) { try { await setCloudConversationPinned(id, pinned); } catch {} }
  return [];
}

export async function getSession(id: string): Promise<{ id: string; title: string; workspace: string; messages: Message[] } | null> {
  if (isElectron) {
    let s = await (window as any).superai.sessions.get(id);
    // 本地无（云端历史会话首次打开）：用云端 id 建副本
    if (!s) {
      await (window as any).superai.sessions.create('', id);
      s = await (window as any).superai.sessions.get(id);
    }
    // 登录态：合并云端消息——会话 id 一致，拉同一会话的云端消息，按 role+内容去重（消息 id 两边各自生成，不依赖），云端独有补存本地
    if (s && isLoggedIn()) {
      try {
        const data = await getCloudConversationMessages(id);
        const local = s.messages || [];
        const keyOf = (m: any) => `${m.role}|${(m.text || '').slice(0, 60)}`;
        const localKeys = new Set(local.map(keyOf));
        const fresh = (data.messages || []).map(cloudMsgToMessage).filter((m) => !localKeys.has(keyOf(m)));
        if (fresh.length > 0) {
          for (const m of fresh) await (window as any).superai.sessions.append(id, m);
          s = await (window as any).superai.sessions.get(id);
        }
      } catch { /* 云端不可用，返回本地已有 */ }
    }
    return s ? { id: s.id, title: s.title || '', workspace: s.workspace || '', messages: s.messages || [] } : null;
  }
  if (isLoggedIn()) {
    const data = await getCloudConversationMessages(id);
    return { id, title: '', workspace: '', messages: (data.messages || []).map(cloudMsgToMessage) };
  }
  return null;
}

export async function getSessionMessages(id: string): Promise<Message[]> {
  const s = await getSession(id);
  return s ? s.messages : [];
}

export async function createSession(workspace: string): Promise<{ id: string; workspace: string }> {
  if (isLoggedIn()) {
    // 登录态：先云端拿 id，本地用同一 id 建副本（双写同 id，无需映射）
    try {
      const c = await createCloudConversation(workspace);
      const cid = String(c.id);
      const ws = c.workspace || workspace || '';
      if (isElectron) await (window as any).superai.sessions.create(ws, cid);
      return { id: cid, workspace: ws };
    } catch {
      // 云端失败：降级只本地（s-xxx），后续不同步
    }
  }
  if (isElectron) {
    const s = await (window as any).superai.sessions.create(workspace);
    return { id: s.id, workspace: s.workspace || workspace || '' };
  }
  return { id: 'mock-' + Date.now(), workspace };
}

export async function appendSessionMessage(id: string, msg: Message): Promise<void> {
  const text = msg.text || '';
  const ts = (msg as any).createdAt || Date.now();
  // 本地优先（消息 id 用本地 nid）；登录态 best-effort 同步云端（云端自己生成消息 id，两边不一致没关系）
  if (isElectron) await (window as any).superai.sessions.append(id, { ...msg, createdAt: ts });
  if (isLoggedIn()) { try { await addCloudMessage(id, msg.role, text); } catch {} }
}

export async function deleteSession(id: string): Promise<void> {
  if (isElectron) await (window as any).superai.sessions.delete(id);
  if (isLoggedIn()) { try { await deleteCloudConversation(id); } catch {} }
}

/** 重命名会话（标题） */
export async function renameSession(id: string, title: string): Promise<void> {
  if (isElectron) await (window as any).superai.sessions.rename(id, title);
  if (isLoggedIn()) { try { await renameCloudConversation(id, title); } catch {} }
}

export async function setSessionWorkspace(id: string, workspace: string): Promise<void> {
  if (isElectron) await (window as any).superai.sessions.setWorkspace(id, workspace);
  if (isLoggedIn()) { try { await setCloudConversationWorkspace(id, workspace); } catch {} }
}

export async function pickDirectory(): Promise<string | null> {
  if (isElectron) return await (window as any).superai.pickDirectory();
  return null;
}

export async function openExternal(url: string): Promise<void> {
  if (isElectron) await (window as any).superai.openExternal(url);
  else window.open(url, '_blank');
}

// 用系统默认程序打开文件（pptx/docx/xlsx 等无法右栏预览的二进制格式）
export async function openSystemFile(p: string, workspace?: string): Promise<{ ok: boolean; error?: string }> {
  if (isElectron) return (window as any).superai.openSystem(p, workspace);
  return { ok: false, error: 'not electron' };
}

// 另存为：复制工作目录文件到用户选的目录（present_files 下载按钮）
export async function saveFileAs(p: string, workspace?: string): Promise<{ ok: boolean; dest?: string; error?: string }> {
  if (isElectron) return (window as any).superai.saveAs(p, workspace);
  return { ok: false, error: 'not electron' };
}

// pptx -> html 预览转换（离线，用 python-pptx）。返回生成的 .preview.html 绝对路径。
export async function convertPptx(p: string, workspace?: string): Promise<{ ok: boolean; htmlPath?: string; error?: string }> {
  if (isElectron) return (window as any).superai.convertPptx(p, workspace);
  return { ok: false, error: 'not electron' };
}

// 读取文件二进制为 ArrayBuffer（供 PPTist 嵌入预览自动导入 pptx）。
export async function readArrayBuffer(p: string, workspace?: string): Promise<{ ok?: boolean; buffer?: ArrayBuffer; error?: string }> {
  if (isElectron) return (window as any).superai.readArrayBuffer(p, workspace);
  return { error: 'not electron' };
}

// ===== 原生菜单事件桥接 =====
export function onMenu(cb: (action: 'settings' | 'about') => void): void {
  if (isElectron) (window as any).superai.onMenu(cb);
}

export function menuPopup(name: string): void {
  if (isElectron) (window as any).superai.menuPopup(name);
}

// 选工作目录 + 更新当前会话（返回新路径或 null）
export async function pickWorkspace(currentSessionId?: string): Promise<string | null> {
  if (isElectron) {
    const dir = await pickDirectory();
    if (!dir) return null;
    // 仅在无活动会话时更新全局默认目录（重启后仍然有效）；
    // 有活动会话时只改当前会话工作目录，不污染新建会话的默认目录。
    if (!currentSessionId) await saveSettings({ workspace: dir });
    if (currentSessionId) await setSessionWorkspace(currentSessionId, dir);
    return dir;
  }
  return null;
}

// 把上传文件复制进工作目录，返回工作区内副本；失败返回 null（调用方回退原路径）
export async function copyAttachmentIn(srcPath: string, workspace: string): Promise<{ path: string; name: string; size: number } | null> {
  if (isElectron) return await (window as any).superai.copyAttachmentIn(srcPath, workspace);
  return null;
}

// ===== 长期记忆管理 =====
export async function listMemory(): Promise<MemoryFact[]> {
  if (isElectron) return await (window as any).superai.memory.list();
  return [];
}

export async function saveMemory(content: string, tags: string[]): Promise<{ ok: boolean; count: number }> {
  if (isElectron) return await (window as any).superai.memory.save(content, tags);
  return { ok: true, count: 0 };
}

export async function searchMemory(query: string): Promise<{ results: MemoryFact[] }> {
  if (isElectron) return await (window as any).superai.memory.search(query);
  return { results: [] };
}

export async function deleteMemory(id: string): Promise<{ ok: boolean; count?: number }> {
  if (isElectron) return await (window as any).superai.memory.delete(id);
  return { ok: true };
}

export async function clearMemory(): Promise<{ ok: boolean; count: number }> {
  if (isElectron) return await (window as any).superai.memory.clear();
  return { ok: true, count: 0 };
}

// ===== 技能管理 =====
export async function listSkills(): Promise<Skill[]> {
  if (isElectron) return await (window as any).superai.skills.list();
  return [];
}

export async function readSkill(name: string): Promise<{ meta: any; body: string; path: string } | null> {
  if (isElectron) return await (window as any).superai.skills.read(name);
  return null;
}

/** 技能目录绝对路径（设置面板展示 + 告知用户投放位置） */
export async function getSkillsDir(): Promise<string> {
  if (isElectron) return await (window as any).superai.skills.dir();
  return '';
}

// ===== 图像生成模型同步（登录态：从云端拉取 kind=image 模型的明文 → 写本地 imageModel 缓存） =====
export async function syncImageModelFromCloud(): Promise<{ ok: boolean; msg: string; fresh?: Settings }> {
  if (!isLoggedIn()) return { ok: false, msg: '未登录云端' };
  try {
    const models = await listModels();
    const img = models.find((m) => (m as CloudModel).kind === 'image' && m.hasKey);
    if (!img) return { ok: false, msg: '云端没有标记为图像类型且已配置 Key 的模型' };
    const cred = await getCredentials(img.id);
    const fresh = await saveSettings({
      imageModel: { baseUrl: cred.baseUrl || '', apiKey: cred.apiKey || '', model: cred.modelName || '' },
    });
    return { ok: true, msg: `已从云端同步：${img.name}`, fresh };
  } catch (e: any) {
    return { ok: false, msg: e.message || '同步失败' };
  }
}
