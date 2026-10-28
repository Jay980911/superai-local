// 云端 API 客户端 — 走 superAi-py (FastAPI)
// API: http://124.222.130.62:8083  (CORS allow_origins=["*"])
// token 是 JWT 字符串，存 localStorage；泄漏最多被冒用 7 天，不像 DB 凭证能删库。

const API_BASE = 'http://124.222.130.62:8083';
const TOKEN_KEY = 'superai_cloud_token';
const USER_KEY = 'superai_cloud_user';

export type CloudUser = {
  id: number;
  username: string;
  nickname: string | null;
  email?: string | null;
  role: string;
  avatar?: string | null;
  bio?: string | null;
  tokenQuota: number;
};

export class ApiError extends Error {}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getStoredUser(): CloudUser | null {
  try { const r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) as CloudUser : null; } catch { return null; }
}
function persist(token: string | null, user: CloudUser | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY);
}

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as any) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Electron: 走主进程代理（绕过渲染进程 mixed content / CORS 限制）
  const w = window as any;
  if (w.superai?.cloud?.api) {
    let res: { ok: boolean; status: number; body: any; error?: string };
    try {
      res = await w.superai.cloud.api(path, { ...init, headers });
    } catch (e: any) {
      throw new ApiError('IPC 调用失败：' + (e?.message || 'unknown'));
    }
    if (!res.ok) {
      let msg = res.status === 0 ? (res.error || '网络错误') : `HTTP ${res.status}`;
      try {
        const b = res.body;
        msg = (b?.detail?.message) || (typeof b?.detail === 'string' ? b.detail : '') || msg;
      } catch { /* 非 JSON */ }
      throw new ApiError(msg);
    }
    return res.body;
  }

  // 非 Electron（纯浏览器/dev web only）：直接 fetch
  let r: Response;
  try {
    r = await fetch(API_BASE + path, { ...init, headers });
  } catch (e: any) {
    throw new ApiError('网络错误：无法连接服务器（' + (e?.message || 'unknown') + '）');
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const body = await r.json();
      msg = (body.detail?.message) || (typeof body.detail === 'string' ? body.detail : '') || msg;
    } catch { /* 非 JSON 响应 */ }
    throw new ApiError(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

/** 登录：成功后立即拉取完整资料（含 avatar/bio/email） */
export async function login(username: string, password: string): Promise<CloudUser> {
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  persist(r.token, {
    id: r.userId, username: r.username, nickname: r.nickname, role: r.role, tokenQuota: r.tokenQuota,
  });
  try { return await fetchMe(); } catch { return getStoredUser()!; }
}

export async function fetchMe(): Promise<CloudUser> {
  const r = await api('/api/auth/me');
  const u: CloudUser = {
    id: r.id, username: r.username, nickname: r.nickname, email: r.email,
    role: r.role, avatar: r.avatar, bio: r.bio, tokenQuota: r.tokenQuota,
  };
  persist(getStoredToken(), u);
  return u;
}

export async function register(
  username: string, password: string, email: string,
  nickname: string | undefined, emailCode: string,
): Promise<CloudUser> {
  await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password, email, nickname, emailCode }) });
  // 注册成功 → 自动登录
  return await login(username, password);
}

/** 发送邮箱验证码（后端 SMTP 暂为 TODO，前端走流程即可） */
export async function sendCode(email: string): Promise<void> {
  await api('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ email }) });
}

export function logout() { persist(null, null); }

// ===== 模型配置（/api/models）=====
// 列表不返回 apiKey（只 hasKey）；getSelectedCredentials 返回明文 apiKey 给本地 agent。
export type CloudModel = {
  id: number; name: string; baseUrl: string | null; modelName: string;
  apiType: string; temperature: number; maxTokens: number;
  isDefault: boolean; userId: number | null; hasKey: boolean; createdAt: string | null;
  kind?: 'chat' | 'image';  // 模型用途（后端字段，未配置时缺省 chat）
};

export type ModelDto = {
  id?: number | null;
  name?: string; baseUrl?: string; apiKey?: string; modelName?: string;
  apiType?: string; temperature?: number; maxTokens?: number;
  kind?: 'chat' | 'image';
};

export type SelectedCredentials = {
  configId: number | null; id: number | null; name: string | null;
  modelName: string | null; apiType: string; baseUrl: string | null;
  apiKey: string | null; temperature: number; maxTokens: number;
};

export async function listModels(): Promise<CloudModel[]> {
  return await api('/api/models');
}
export async function createModel(dto: ModelDto): Promise<CloudModel> {
  return await api('/api/models', { method: 'POST', body: JSON.stringify(dto) });
}
export async function updateCloudModel(id: number, dto: ModelDto): Promise<CloudModel> {
  return await api(`/api/models/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
}
export async function deleteCloudModel(id: number): Promise<void> {
  await api(`/api/models/${id}`, { method: 'DELETE' });
}
export async function selectModel(id: number): Promise<void> {
  await api(`/api/models/select?configId=${id}`, { method: 'POST' });
}
export async function getSelectedCredentials(): Promise<SelectedCredentials> {
  return await api('/api/models/selected');
}

/** 按 id 取任意模型的明文凭证（不限于当前选中模型；供 image-gen 拿图像模型 key 用） */
export async function getCredentials(id: number): Promise<SelectedCredentials> {
  return await api(`/api/models/credentials/${id}`);
}

/** 测试模型连接（云端有明文 apiKey，可测任意已存模型；传 id 用已存 key，传 apiKey 则直接测） */
export async function testCloudModel(dto: ModelDto): Promise<any> {
  return await api('/api/models/test', { method: 'POST', body: JSON.stringify(dto) });
}

// ===== 会话/消息云端化 =====
export type CloudConversation = {
  id: number; title: string | null; workspace: string | null;
  pinned: boolean; messageCount: number;
  createdAt?: string; updatedAt?: string;
};
export type CloudMessage = {
  id: number; conversationId: number; role: string; content: string;
  createdAt?: string;
};
export function isLoggedIn(): boolean { return !!getStoredToken(); }

export async function listConversations(): Promise<{ conversations: CloudConversation[] }> {
  return await api('/api/conversation/list');
}
export async function createCloudConversation(workspace?: string, title?: string): Promise<CloudConversation> {
  return await api('/api/conversation/create', { method: 'POST', body: JSON.stringify({ workspace, title }) });
}
export async function getCloudConversationMessages(convId: string): Promise<{ messages: CloudMessage[] }> {
  return await api(`/api/conversation/${convId}/messages`);
}
export async function addCloudMessage(convId: string, role: string, content: string, workspace?: string): Promise<CloudMessage> {
  return await api(`/api/conversation/${convId}/messages`, { method: 'POST', body: JSON.stringify({ role, content, workspace }) });
}
export async function renameCloudConversation(convId: string, title: string): Promise<void> {
  await api(`/api/conversation/${convId}/title`, { method: 'PUT', body: JSON.stringify({ title }) });
}
export async function setCloudConversationPinned(convId: string, pinned: boolean): Promise<void> {
  await api(`/api/conversation/${convId}/pinned`, { method: 'PUT', body: JSON.stringify({ pinned }) });
}
export async function deleteCloudConversation(convId: string): Promise<void> {
  await api(`/api/conversation/${convId}`, { method: 'DELETE' });
}
export async function setCloudConversationWorkspace(convId: string, workspace: string): Promise<void> {
  await api(`/api/conversation/${convId}/workspace`, { method: 'PUT', body: JSON.stringify({ workspace }) });
}
