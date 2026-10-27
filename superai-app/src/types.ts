// 类型定义 · 对应规格 §7
export type Attachment = { name: string; size: string; kind: 'xls' | 'pdf' | 'img' | 'other' };
export type StepStatus = 'done' | 'running' | 'pending' | 'error';
export type Step = { label: string; status: StepStatus; duration?: string; error?: string; result?: string };
export type GenFileKind = 'html' | 'md' | 'json' | 'xls';
export type GenFile = {
  name: string;
  desc: string;
  size: string;
  isNew: boolean;
  kind: GenFileKind;
};
export type Action = { label: string; kind: 'primary' | 'link'; act: string };
export type Edit = { file: string; plus: number; minus: number };

// 本轮 agent 实际产出/修改的文件（来自 file 事件），用于消息内的 present_files 卡。
export type ProducedFile = {
  name: string;      // 文件名
  path: string;      // 相对工作目录或绝对路径
  kind: string;      // html/md/pptx/pdf/img/json/...
  action: string;    // 生成/修改
};

export type Message =
  | { id: string; role: 'user'; time: string; text: string; attachments?: Attachment[]; createdAt?: number }
  | {
      id: string;
      role: 'agent';
      time: string;
      text?: string;
      steps?: Step[];
      elapsed?: string;   // 回合总耗时（秒，如 "12.4"）；运行中实时刷新
      phase?: 'preparing' | 'waiting' | 'thinking' | 'finalizing'; // 创建会话环境 / 等待模型首响应 / 模型思考 / 整理结果
      files?: { heading: string; tag: string; items: GenFile[]; actions: Action[] };
      produced?: ProducedFile[];   // 真实产出文件卡（present_files）
      actions?: Action[];
      edit?: Edit;
      createdAt?: number;
    };

export type SessionGroup = '置顶' | '其他';
export type Session = {
  id: string;
  title: string;
  summary: string;
  time: string;
  group: SessionGroup;
  workspace?: string;
  pinned?: boolean;
};

export type Kpi = { label: string; value: string; delta: string };
export type Region = { name: string; value: string; chg: string; highlight?: boolean };
export type PreviewData = {
  eyebrow: string;
  title: string;
  source: string;
  kpis: Kpi[];
  monthly: [string, number][];
  monthlyHlIndex: number;
  regions: Region[];
};

export type Suggestion = { icon: string; title: string; desc: string };

// 真实文件条目（来自 tools.cjs listFiles）
export type FileEntry = { name: string; path: string; type: 'dir' | 'file'; size: number };
