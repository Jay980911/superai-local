'use strict';
/**
 * 项目模块：.superai/ 读写、scaffold 模板、文件树、clientId
 * R4 clientId 上报; R7 结构骨架记 memory
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

class Project {
  constructor(workdir) {
    this.workdir = workdir;
    this.superaiDir = path.join(workdir, '.superai');
    this.projectFile = path.join(this.superaiDir, 'project.json');
    this.memoryFile = path.join(this.superaiDir, 'memory.md');
    this.historyFile = path.join(this.superaiDir, 'history.json');
    this.convFile = path.join(this.superaiDir, 'conversation.json');
    this.data = null;
  }

  async ensure() {
    if (!fs.existsSync(this.superaiDir)) fs.mkdirSync(this.superaiDir, { recursive: true });
    if (!fs.existsSync(this.projectFile)) {
      this.data = {
        name: path.basename(this.workdir),
        template: null,
        techStack: null,
        devPort: null,
        clientId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        lastOpened: new Date().toISOString(),
      };
      this._save();
      if (!fs.existsSync(this.memoryFile)) fs.writeFileSync(this.memoryFile, `# ${this.data.name} 项目记忆\n\nAI 生成时自动追加。\n`, 'utf8');
    } else {
      this.data = JSON.parse(fs.readFileSync(this.projectFile, 'utf8'));
      this.data.lastOpened = new Date().toISOString();
      this._save();
    }
    return this.data;
  }

  _save() {
    fs.writeFileSync(this.projectFile, JSON.stringify(this.data, null, 2), 'utf8');
  }

  get clientId() { return this.data && this.data.clientId; }
  get template() { return this.data && this.data.template; }
  setDevPort(p) { this.data.devPort = p; this._save(); }

  /** 读 memory.md（注入 LLM context 用） */
  readMemory() {
    try { return fs.readFileSync(this.memoryFile, 'utf8'); }
    catch (_) { return ''; }
  }

  /** 追加 memory（save_memory 工具） */
  appendMemory(text) {
    const stamp = `\n## ${new Date().toISOString()}\n${text}\n`;
    fs.appendFileSync(this.memoryFile, stamp, 'utf8');
  }

  /** 聊天历史持久化(CLI 重启后恢复) */
  readHistory() {
    try { return JSON.parse(fs.readFileSync(this.historyFile, 'utf8')); } catch (_) { return []; }
  }
  writeHistory(arr) {
    try { fs.writeFileSync(this.historyFile, JSON.stringify(arr.slice(-500)), 'utf8'); } catch (_) {}
  }

  /** 会话 ID 持久化(绑定项目+用户,CLI 重启也延续同一会话) */
  readConversationId() {
    try { return JSON.parse(fs.readFileSync(this.convFile, 'utf8')).conversationId || null; } catch (_) { return null; }
  }
  saveConversationId(id) {
    try { fs.writeFileSync(this.convFile, JSON.stringify({ conversationId: id, savedAt: new Date().toISOString() }), 'utf8'); } catch (_) {}
  }

  /** 当前项目的预览入口文件链(让用户知道预览的是哪个文件) */
  getEntry() {
    const t = this.data.template;
    if (t === 'static-html') return { label: 'index.html', file: 'index.html' };
    if (t === 'vite-react') return { label: 'index.html → src/main.jsx → src/App.jsx', file: 'src/App.jsx' };
    if (t === 'vite-vue') return { label: 'index.html → src/main.js → src/App.vue', file: 'src/App.vue' };
    // 无模板时根据实际文件猜测
    if (fs.existsSync(path.join(this.workdir, 'src', 'App.jsx'))) return { label: 'index.html → src/main.jsx → src/App.jsx', file: 'src/App.jsx' };
    if (fs.existsSync(path.join(this.workdir, 'index.html'))) return { label: 'index.html', file: 'index.html' };
    return null;
  }

  /** scaffold 模板到 workdir */
  scaffold(templateName) {
    const src = path.join(TEMPLATES_DIR, templateName);
    if (!fs.existsSync(src)) throw new Error(`未知模板: ${templateName}`);
    // 检测已有项目(避免覆盖 + 避免超时)
    const hasPkg = fs.existsSync(path.join(this.workdir, 'package.json'));
    const hasIndex = fs.existsSync(path.join(this.workdir, 'index.html'));
    if (hasPkg || hasIndex) {
      return { skipped: true, reason: '工作目录已有项目(package.json/index.html)，跳过 scaffold。请用 ls 查看现有结构后用 write_file 修改' };
    }
    this._copyDir(src, this.workdir);
    // gitattributes 强制 LF (R6 换行符)
    const ga = path.join(this.workdir, '.gitattributes');
    if (!fs.existsSync(ga)) fs.writeFileSync(ga, '* text=auto eol-lf\n', 'utf8');
    this.data.template = templateName;
    this.data.techStack = templateName;
    this._save();
    return templateName;
  }

  _copyDir(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const e of entries) {
      const s = path.join(src, e.name);
      const d = path.join(dest, e.name);
      if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); this._copyDir(s, d); }
      else { fs.copyFileSync(s, d); }
    }
  }

  /** 文件树（默认折叠 node_modules/.git 深度） */
  readTree() {
    const walk = (dir, rel = '') => {
      const out = [];
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
      entries.sort((a, b) => (a.isDirectory() === b.isDirectory()) ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1);
      for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.gitignore') continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          const collapsed = (e.name === 'node_modules' || e.name === '.git');
          const children = collapsed ? [] : walk(path.join(dir, e.name), r);
          out.push({ name: e.name, path: r, type: 'dir', collapsed, children });
        } else {
          out.push({ name: e.name, path: r, type: 'file' });
        }
      }
      return out;
    };
    return walk(this.workdir);
  }

  readFile(rel) {
    const abs = path.join(this.workdir, rel);
    if (!abs.startsWith(this.workdir)) throw new Error('越界');
    return fs.readFileSync(abs, 'utf8');
  }

  writeFile(rel, content) {
    const abs = path.join(this.workdir, rel);
    if (!abs.startsWith(this.workdir)) throw new Error('越界');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
}

module.exports = Project;
