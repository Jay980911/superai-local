// 类型定义 · 对应规格 §7
export type Attachment = { name: string; size: string; kind: 'xls' | 'pdf' | 'img' | 'other' };
export type StepStatus = 'done' | 'running' | 'pending' | 'error';
export type Step = { label: string; status: StepStatus; duration?: string };
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

export type Message =
  | { id: string; role: 'user'; time: string; text: string; attachments?: Attachment[] }
  | {
      id: string;
      role: 'agent';
      time: string;
      text?: string;
      steps?: Step[];
      files?: { heading: string; tag: string; items: GenFile[]; actions: Action[] };
      actions?: Action[];
      edit?: Edit;
    };

export type SessionGroup = '智能体' | '今天' | '昨天' | '近 7 天';
export type Session = {
  id: string;
  title: string;
  summary: string;
  time: string;
  group: SessionGroup;
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
