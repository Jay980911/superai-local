'use strict';
/**
 * 系统托盘(PowerShell WinForms NotifyIcon)
 * 用系统签名 powershell.exe 跑 → SAC/Defender 放行(无需无签名 helper exe)
 * Node ↔ PowerShell 经 stdout JSON 行通信
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 图标路径:打包时在 exe 同级,开发时在项目根
const ICON_PATH = process.pkg
  ? path.join(path.dirname(process.execPath), 'icon.ico')
  : path.join(__dirname, '..', 'icon.ico');
const iconLine = fs.existsSync(ICON_PATH)
  ? `if (Test-Path '${ICON_PATH.replace(/'/g, "''") }') { $ico.Icon = New-Object System.Drawing.Icon('${ICON_PATH.replace(/'/g, "''") }') } else { $ico.Icon = [System.Drawing.SystemIcons]::Application }`
  : `$ico.Icon = [System.Drawing.SystemIcons]::Application`;

const PS_SCRIPT = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ico=New-Object System.Windows.Forms.NotifyIcon
${iconLine}
$ico.Visible=$true
$ico.Text='SuperAI Local :7000'
$m=New-Object System.Windows.Forms.ContextMenuStrip
$miOpen=$m.Items.Add('打开工作台')
$miAuto=$m.Items.Add('开机自启 (切换)')
$m.Items.Add('-')|Out-Null
$miExit=$m.Items.Add('退出')
$ico.ContextMenuStrip=$m
function emit($s){[Console]::Out.WriteLine($s);[Console]::Out.Flush()}
$miOpen.Add_Click({ emit('{"cmd":"open"}') })
$miAuto.Add_Click({ emit('{"cmd":"autostart"}') })
$miExit.Add_Click({ $ico.Visible=$false; emit('{"cmd":"exit"}'); [System.Windows.Forms.Application]::Exit() })
$ico.Add_DoubleClick({ emit('{"cmd":"open"}') })
emit('{"cmd":"ready"}')
[System.Windows.Forms.Application]::Run()
`;

class Tray {
  constructor({ onOpen, onAutostart, onExit, onLog }) {
    this.onOpen = onOpen; this.onAutostart = onAutostart; this.onExit = onExit; this.onLog = onLog;
    this.proc = null; this.buf = '';
  }
  start() {
    if (process.platform !== 'win32') { this.onLog && this.onLog('[tray] 仅 Windows 支持'); return false; }
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT], { stdio: ['pipe','pipe','pipe'] });
    } catch (e) { this.onLog && this.onLog('[tray] 启动失败: ' + e.message); return false; }
    this.proc.stdout.on('data', d => {
      this.buf += d.toString('utf8');
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i+1);
        if (!line) continue;
        let obj; try { obj = JSON.parse(line); } catch(_) { continue; }
        this.onLog && this.onLog('[tray] ' + line);
        if (obj.cmd === 'open') this.onOpen && this.onOpen();
        else if (obj.cmd === 'autostart') this.onAutostart && this.onAutostart();
        else if (obj.cmd === 'exit') this.onExit && this.onExit();
      }
    });
    this.proc.stderr.on('data', d => this.onLog && this.onLog('[tray:err] ' + d.toString('utf8').trim()));
    this.proc.on('error', e => this.onLog && this.onLog('[tray] error: ' + e.message));
    this.proc.on('exit', () => { this.onLog && this.onLog('[tray] 已退出'); this.proc = null; });
    return true;
  }
  stop() { if (this.proc) { try { this.proc.kill(); } catch(_){} this.proc = null; } }
}

module.exports = Tray;
