'use strict';
/**
 * 安全模块：path 校验、文件大小、磁盘、exec 白名单
 * R2(只读由前端保证) R10(path越界双端校验) R11(文件大小) R8(磁盘)
 */
const path = require('path');
const fs = require('fs');

const EXEC_WHITELIST = ['npm', 'npx', 'node', 'yarn', 'pnpm', 'git',
  // 只读诊断命令(排查网络/端口/进程问题)
  'netstat', 'curl', 'ping', 'ipconfig', 'tasklist', 'where', 'findstr', 'echo',
  'ss', 'ls', 'cat', 'grep', 'ps', 'lsof'];  // 兼容 Linux/Mac
const MAX_FILE_SIZE = 50 * 1024; // 50k 字符

class Security {
  constructor(workdir) {
    this.workdir = fs.realpathSync(workdir);
  }

  /** 规范化为 workdir 内绝对路径，越界抛错 */
  resolve(relativePath) {
    if (!relativePath || typeof relativePath !== 'string') throw new Error('path 为空');
    // 禁绝对路径越界
    const p = path.isAbsolute(relativePath) ? relativePath : path.join(this.workdir, relativePath);
    const norm = path.normalize(p);
    const real = fs.existsSync(norm) ? fs.realpathSync(norm) : path.resolve(this.workdir, path.relative(this.workdir, norm));
    // 校验在 workdir 内
    if (real !== this.workdir && !real.startsWith(this.workdir + path.sep)) {
      throw new Error(`path 越界(不在工作目录内): ${relativePath}`);
    }
    return real;
  }

  assertWritable(relativePath) {
    const real = this.resolve(relativePath);
    const dir = path.dirname(real);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return real;
  }

  assertFileSize(content) {
    if (typeof content !== 'string') throw new Error('content 必须是字符串(二进制请用模板预置)');
    if (content.length > MAX_FILE_SIZE) throw new Error(`文件过大 ${content.length} > ${MAX_FILE_SIZE}，请拆分`);
    return true;
  }

  checkExec(cmd) {
    const base = path.basename(cmd).replace(/\.exe$/i, '').replace(/\.cmd$/i, '');
    if (!EXEC_WHITELIST.includes(base)) throw new Error(`exec 白名单禁止: ${cmd} (允许: ${EXEC_WHITELIST.join(', ')})`);
    return true;
  }

  checkDisk() {
    try {
      const stat = fs.statfsSync ? fs.statfsSync(this.workdir) : null;
      // Node 18+ 有 statfs; 兜底用
      if (stat && stat.bfree && stat.bsize) {
        const free = stat.bfree * stat.bsize;
        if (free < 1024 * 1024 * 1024) console.warn(`⚠️  工作目录所在盘剩余 <1GB (${(free/1024/1024/1024).toFixed(2)}GB)`);
      }
    } catch (_) {}
  }
}

module.exports = Security;
