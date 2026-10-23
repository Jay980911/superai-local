// api.ts — mock → 真接口替换点
// 浏览器环境：返回 mock 数据
// Electron 环境：走 window.bench IPC 调真实 LLM + 本地文件系统
import type { Message, Session, Suggestion, FileEntry } from '../types';
import {
  messages as mockMessages,
  sessions as mockSessions,
  suggestions as mockSuggestions,
} from './mock';

export const isElectron = typeof window !== 'undefined' && !!(window as any).bench;

// ===== 模型配置 =====
export type ApiType = 'openai' | 'ollama';
export interface ModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiType: ApiType;
  builtin: boolean;
}

export interface Settings {
  models: ModelConfig[];
  currentModelId: string;
  autoExec: boolean;
}

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'step'; status: 'running' | 'done' | 'error'; label: string; index: number; duration?: string; error?: string }
  | { type: 'file'; name: string; action: string; size: number }
  | { type: 'done'; text: string; steps: number }
  | { type: 'error'; message: string };

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
export async function getSettings(): Promise<Settings> {
  if (isElectron) return await (window as any).bench.getSettings();
  return { models: [], currentModelId: '', autoExec: true };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  if (isElectron) return await (window as any).bench.saveSettings(patch);
  return { models: [], currentModelId: '', autoExec: patch.autoExec ?? true };
}

export async function getDefaultWorkspace(): Promise<string> {
  if (isElectron) return await (window as any).bench.defaultWorkspace();
  return '~/SuperAI/workspace';
}

// ===== 模型管理 =====
export async function addModel(model: Omit<ModelConfig, 'id' | 'builtin'>): Promise<ModelConfig> {
  if (isElectron) return await (window as any).bench.models.add(model);
  return { ...model, id: 'mock-' + Date.now(), builtin: false };
}

export async function removeModel(id: string): Promise<{ ok: boolean; error?: string }> {
  if (isElectron) return await (window as any).bench.models.remove(id);
  return { ok: true };
}

export async function setCurrentModel(id: string): Promise<Settings> {
  if (isElectron) return await (window as any).bench.models.setCurrent(id);
  return { models: [], currentModelId: id, autoExec: true };
}

export async function updateModel(id: string, patch: Partial<ModelConfig>): Promise<ModelConfig | null> {
  if (isElectron) return await (window as any).bench.models.update(id, patch);
  return null;
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
): Promise<{ error?: string }> {
  if (isElectron) {
    const bench = (window as any).bench;
    bench.onAgentEvent(onEvent);
    return await bench.runAgent(input, history, workspace);
  }
  onEvent({ type: 'text', delta: '收到，正在拆解任务…（浏览器预览模式，请在桌面应用中运行以执行真实任务）' });
  onEvent({ type: 'done', text: '', steps: 0 });
  return {};
}

// ===== 文件 =====
export async function listFiles(dir?: string, workspace?: string): Promise<FileEntry[]> {
  if (isElectron) return await (window as any).bench.listFiles(dir, workspace);
  return [];
}

export async function readFile(p: string, workspace?: string): Promise<string> {
  if (isElectron) return await (window as any).bench.readFile(p, workspace);
  return '';
}

export async function writeFile(p: string, content: string, workspace?: string): Promise<{ path: string; size: number }> {
  if (isElectron) return await (window as any).bench.writeFile(p, content, workspace);
  return { path: p, size: content.length };
}

// ===== 会话持久化 =====
export async function listSessions(): Promise<Session[]> {
  if (isElectron) return await (window as any).bench.sessions.list();
  return mockSessions;
}

export async function getSession(id: string): Promise<{ id: string; title: string; workspace: string; messages: Message[] } | null> {
  if (isElectron) return await (window as any).bench.sessions.get(id);
  return null;
}

export async function getSessionMessages(id: string): Promise<Message[]> {
  if (isElectron) {
    const s = await (window as any).bench.sessions.get(id);
    return s ? s.messages : [];
  }
  return id === mockSessions[0]?.id ? mockMessages : [];
}

export async function createSession(workspace: string): Promise<string> {
  if (isElectron) {
    const s = await (window as any).bench.sessions.create(workspace);
    return s.id;
  }
  return 'mock-' + Date.now();
}

export async function appendSessionMessage(id: string, msg: Message): Promise<void> {
  if (isElectron) await (window as any).bench.sessions.append(id, msg);
}

export async function deleteSession(id: string): Promise<void> {
  if (isElectron) await (window as any).bench.sessions.delete(id);
}

export async function setSessionWorkspace(id: string, workspace: string): Promise<void> {
  if (isElectron) await (window as any).bench.sessions.setWorkspace(id, workspace);
}

export async function pickDirectory(): Promise<string | null> {
  if (isElectron) return await (window as any).bench.pickDirectory();
  return null;
}

export async function openExternal(url: string): Promise<void> {
  if (isElectron) await (window as any).bench.openExternal(url);
  else window.open(url, '_blank');
}

// ===== 原生菜单事件桥接 =====
export function onMenu(cb: (action: 'settings' | 'about') => void): void {
  if (isElectron) (window as any).bench.onMenu(cb);
}

export function menuPopup(name: string): void {
  if (isElectron) (window as any).bench.menuPopup(name);
}

// 选工作目录 + 更新当前会话（返回新路径或 null）
export async function pickWorkspace(currentSessionId?: string): Promise<string | null> {
  if (isElectron) {
    const dir = await pickDirectory();
    if (!dir) return null;
    if (currentSessionId) await setSessionWorkspace(currentSessionId, dir);
    return dir;
  }
  return null;
}

// ===== 长期记忆管理 =====
export async function listMemory(): Promise<MemoryFact[]> {
  if (isElectron) return await (window as any).bench.memory.list();
  return [];
}

export async function saveMemory(content: string, tags: string[]): Promise<{ ok: boolean; count: number }> {
  if (isElectron) return await (window as any).bench.memory.save(content, tags);
  return { ok: true, count: 0 };
}

export async function searchMemory(query: string): Promise<{ results: MemoryFact[] }> {
  if (isElectron) return await (window as any).bench.memory.search(query);
  return { results: [] };
}

export async function deleteMemory(id: string): Promise<{ ok: boolean; count?: number }> {
  if (isElectron) return await (window as any).bench.memory.delete(id);
  return { ok: true };
}

export async function clearMemory(): Promise<{ ok: boolean; count: number }> {
  if (isElectron) return await (window as any).bench.memory.clear();
  return { ok: true, count: 0 };
}

// ===== 技能管理 =====
export async function listSkills(): Promise<Skill[]> {
  if (isElectron) return await (window as any).bench.skills.list();
  return [];
}

export async function readSkill(name: string): Promise<{ meta: any; body: string; path: string } | null> {
  if (isElectron) return await (window as any).bench.skills.read(name);
  return null;
}
