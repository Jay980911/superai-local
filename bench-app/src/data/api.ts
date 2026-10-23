// api.ts — mock → 真接口替换点（§10）
// 浏览器环境：返回 mock 数据
// Electron 环境：走 window.bench IPC 调真实 LLM + 本地文件系统
import type { Message, Session, Suggestion } from '../types';
import {
  messages as mockMessages,
  sessions as mockSessions,
  suggestions as mockSuggestions,
} from './mock';

export const isElectron = typeof window !== 'undefined' && !!(window as any).bench;

export interface Settings {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  workspace: string;
  autoExec: boolean;
}

export interface ProviderPreset {
  baseUrl: string;
  model: string;
}

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'step'; status: 'running' | 'done' | 'error'; label: string; index: number; duration?: string; error?: string }
  | { type: 'file'; name: string; action: string; size: number }
  | { type: 'done'; text: string; steps: number }
  | { type: 'error'; message: string };

// ===== 设置 =====
export async function getSettings(): Promise<Settings> {
  if (isElectron) return await (window as any).bench.getSettings();
  return { provider: '', apiKey: '', baseUrl: '', model: '', workspace: '', autoExec: true };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  if (isElectron) return await (window as any).bench.saveSettings(patch);
  return { ...{ provider: '', apiKey: '', baseUrl: '', model: '', workspace: '', autoExec: true }, ...patch };
}

export async function getPresets(): Promise<Record<string, ProviderPreset>> {
  if (isElectron) return await (window as any).bench.getPresets();
  return {
    deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
    openai: { baseUrl: 'https://api.openai.com', model: 'gpt-4o' },
    ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' },
  };
}

// ===== 会话 =====
export function getSessions(): Session[] {
  return mockSessions;
}

export function getSuggestions(): Suggestion[] {
  return mockSuggestions;
}

export function getInitialMessages(): Message[] {
  // Electron 环境下也用空消息列表开始（用户发起新对话）
  return isElectron ? [] : mockMessages;
}

// ===== Agent 运行 =====
export async function runAgent(
  input: string,
  history: Array<{ role: string; content: string }>,
  onEvent: (e: AgentEvent) => void,
): Promise<{ error?: string }> {
  if (isElectron) {
    const bench = (window as any).bench;
    bench.onAgentEvent(onEvent);
    return await bench.runAgent(input, history);
  }
  // 浏览器 mock：模拟流式回复
  onEvent({ type: 'text', delta: '收到，正在拆解任务…（浏览器预览模式，请在桌面应用中运行以执行真实任务）' });
  onEvent({ type: 'done', text: '', steps: 0 });
  return {};
}

// ===== 文件 =====
export async function listFiles(dir?: string) {
  if (isElectron) return await (window as any).bench.listFiles(dir);
  return [];
}

export async function readFile(p: string): Promise<string> {
  if (isElectron) return await (window as any).bench.readFile(p);
  return '';
}

export async function writeFile(p: string, content: string): Promise<{ path: string; size: number }> {
  if (isElectron) return await (window as any).bench.writeFile(p, content);
  return { path: p, size: content.length };
}

// ===== 对话框 =====
export async function pickDirectory(): Promise<string | null> {
  if (isElectron) return await (window as any).bench.pickDirectory();
  return null;
}

export async function openExternal(url: string): Promise<void> {
  if (isElectron) await (window as any).bench.openExternal(url);
  else window.open(url, '_blank');
}
