// mock 数据 · 对应规格 §7（文案 1:1 照抄原型）
import type { Message, Session, Suggestion, PreviewData, GenFile } from '../types';

export const WORKSPACE = '~/Documents/Q3汇报';
export const PROJECT = 'q3-report';

// §7 预览页数据（与源码片段共享，保证两者一致）
export const previewData: PreviewData = {
  eyebrow: 'Q3 SALES REPORT · 2026',
  title: '第三季度销售汇报',
  source: '数据来源：销售数据-Q3.xlsx · 由案台生成于今天 14:35',
  kpis: [
    { label: '营收', value: '¥2,480万', delta: '▲ 12.4%' },
    { label: '订单', value: '18,204', delta: '▲ 8.1%' },
    { label: '客单价', value: '¥1,363', delta: '▲ 3.9%' },
  ],
  monthly: [['4月', 52], ['5月', 44], ['6月', 61], ['7月', 58], ['8月', 72], ['9月', 84]],
  monthlyHlIndex: 5,
  regions: [
    { name: '华东', value: '¥862万', chg: '+18.2%', highlight: true },
    { name: '华南', value: '¥604万', chg: '+9.4%' },
    { name: '华北', value: '¥512万', chg: '+5.7%' },
    { name: '西南', value: '¥502万', chg: '+11.1%' },
  ],
};

// 生成文件（目录树 + 文件卡共享）
export const genFiles: GenFile[] = [
  { name: 'index.html', desc: '汇报页 · 双击即可在浏览器打开', size: '18 KB', isNew: true, kind: 'html' },
  { name: '说明文档.md', desc: '指标口径与结论文字版', size: '6 KB', isNew: true, kind: 'md' },
  { name: 'data.json', desc: '图表数据源', size: '3 KB', isNew: true, kind: 'json' },
];

// 引用文件（只读）
export const refFiles: GenFile[] = [
  { name: '销售数据-Q3.xlsx', desc: '只读引用 · 未改动', size: '2.4 MB', isNew: false, kind: 'xls' },
];

export const sessions: Session[] = [
  { id: 's1', title: 'Q3 销售汇报', summary: '汇报页已生成，等你确认标注', time: '14:35', group: '今天' },
  { id: 's2', title: '差旅报销整理', summary: '已归档 23 张发票，汇总表就绪', time: '11:20', group: '今天' },
  { id: 's3', title: '90 年代复古杂志网页', summary: '预览链接可分享 · 3 个文件', time: '昨天', group: '昨天' },
  { id: 's4', title: '产品发布会 PPT 大纲', summary: '12 页，已导出 PPTX', time: '昨天', group: '昨天' },
  { id: 's5', title: '关西 7 日行程规划', summary: '行程页 + 预算表', time: '周一', group: '近 7 天' },
  { id: 's6', title: '会议纪要整理', summary: '6 场会议，已生成待办', time: '周一', group: '近 7 天' },
  { id: 's7', title: '搬家清单', summary: '按房间分组', time: '周日', group: '近 7 天' },
];

export const suggestions: Suggestion[] = [
  { icon: '🗂', title: '整理一批文件并生成摘要', desc: '适合：发票、合同、会议记录' },
  { icon: '◈', title: '做一个可以直接分享的网页', desc: '适合：汇报页、作品集、邀请函' },
  { icon: '▥', title: '分析表格并画出图表', desc: '适合：销售数据、问卷结果' },
];

// S1 对话流（文案照抄原型）
export const messages: Message[] = [
  {
    id: 'm1',
    role: 'user',
    time: '14:32',
    text: '把 Q3 的销售数据做成一个能直接打开看的汇报页，再配一份文字说明，都放到 Q3汇报 文件夹里。',
    attachments: [{ name: '销售数据-Q3.xlsx', size: '2.4 MB', kind: 'xls' }],
  },
  {
    id: 'm2',
    role: 'agent',
    time: '14:32',
    text: '好，我先读数据、算指标，再生成汇报页和说明文档。',
    steps: [
      { label: '读取并核对 Q3 销售数据', status: 'done', duration: '1.2s' },
      { label: '计算季度指标与区域环比', status: 'done', duration: '2.8s' },
      { label: '生成汇报页 index.html', status: 'done', duration: '4.6s' },
      { label: '写入说明文档', status: 'done', duration: '1.1s' },
    ],
  },
  {
    id: 'm3',
    role: 'agent',
    time: '14:34',
    files: {
      heading: '已生成 3 个文件',
      tag: 'q3-report',
      items: genFiles,
      actions: [
        { label: '打开预览', kind: 'primary', act: 'open:preview' },
        { label: '下载全部', kind: 'link', act: 'toast:下载全部' },
        { label: '在文件夹中显示', kind: 'link', act: 'toast:在文件夹中显示' },
      ],
    },
  },
  {
    id: 'm4',
    role: 'user',
    time: '14:36',
    text: '华东区的数字标红，再加个环比。',
  },
  {
    id: 'm5',
    role: 'agent',
    time: '14:36',
    text: '改好了：index.html +6 −2，华东区标红并补了环比列，预览已实时刷新。',
    edit: { file: 'index.html', plus: 6, minus: 2 },
    actions: [
      { label: '查看预览', kind: 'primary', act: 'open:preview' },
      { label: '撤销这次修改', kind: 'link', act: 'undo' },
    ],
  },
];

// 源码片段（与预览共享数据，保证一致；行号/改动行/注记照原型）
export type CodeLine = { n: number; cls?: 'add' | 'hot'; src: React.ReactNode };
export const codeLines: CodeLine[] = [
  { n: 1, src: <span className="c2">{'<!-- q3-report / index.html -->'}</span> },
  { n: 2, src: <><span className="k">{'<section'}</span> <span className="a">class</span>=<span className="s">"kpi"</span><span className="k">{'>'}</span></> },
  { n: 3, src: <>  <span className="k">{'<div>'}</span>营收 <span className="n2">¥2,480万</span><span className="k">{'</div>'}</span></> },
  { n: 4, src: <>  <span className="k">{'<div>'}</span>订单 <span className="n2">18,204</span><span className="k">{'</div>'}</span></> },
  { n: 5, src: <span className="k">{'</section>'}</span> },
  { n: 6, src: ' ' },
  { n: 7, src: <><span className="k">{'<table'}</span> <span className="a">class</span>=<span className="s">"regions"</span><span className="k">{'>'}</span></> },
  { n: 8, src: <>  <span className="k">{'<tr>'}</span><span className="k">{'<td>'}</span>华南<span className="k">{'</td>'}</span> <span className="k">{'<td>'}</span><span className="n2">¥604万</span><span className="k">{'</td>'}</span><span className="k">{'</tr>'}</span></> },
  { n: 9, cls: 'add', src: <>  <span className="k">{'<tr'}</span> <span className="a">class</span>=<span className="s">"hl"</span><span className="k">{'>'}</span><span className="k">{'<td>'}</span>华东<span className="k">{'</td>'}</span> <span className="k">{'<td>'}</span><span className="n2">¥862万</span><span className="k">{'</td>'}</span></> },
  { n: 10, cls: 'add', src: <>           <span className="k">{'<td'}</span> <span className="a">class</span>=<span className="s">"chg"</span><span className="k">{'>'}</span>+18.2%<span className="k">{'</td>'}</span><span className="k">{'</tr>'}</span></> },
  { n: 11, src: <>  <span className="k">{'<tr>'}</span><span className="k">{'<td>'}</span>华北<span className="k">{'</td>'}</span> <span className="k">{'<td>'}</span><span className="n2">¥512万</span><span className="k">{'</td>'}</span><span className="k">{'</tr>'}</span></> },
  { n: 12, src: <span className="k">{'</table>'}</span> },
  { n: 13, src: ' ' },
  { n: 14, src: <span className="k">{'<style>'}</span> },
  { n: 15, cls: 'hot', src: <>  .regions .hl td {'{'} <span className="a">color</span>: <span className="n2">#C2412B</span>; {'}'}</> },
  { n: 16, src: <span className="k">{'</style>'}</span> },
];
