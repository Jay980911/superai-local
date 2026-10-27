// diag-window.cjs — 单次试验：node scripts/diag-window.cjs [no-sandbox|in-process-gpu|baseline]
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

delete process.env.ELECTRON_RUN_AS_NODE;
const electronBin = require('electron');
const variant = process.argv[2] || 'baseline';
const PRELOAD = path.join(__dirname, '..', 'electron', 'preload.cjs');

const switchMap = {
  baseline: [],
  'no-sandbox': ['no-sandbox'],
  'in-process-gpu': ['in-process-gpu'],
  'no-sandbox+ipg': ['no-sandbox', 'in-process-gpu'],
};
const switches = switchMap[variant] || [];

const mainSrc = `
const { app, BrowserWindow } = require('electron');
const path = require('path');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-sandbox');
${switches.map((s) => `app.commandLine.appendSwitch('${s}');`).join('\n')}
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { preload: ${JSON.stringify(PRELOAD)}, contextIsolation: true },
  });
  const log = (...a) => console.log('[diag]', ...a);
  let gone = 0;
  win.webContents.on('render-process-gone', (_e, d) => { gone++; log('GONE', JSON.stringify(d)); });
  win.webContents.on('did-fail-load', (_e, code, desc) => log('FAIL-LOAD', code, desc));
  win.webContents.on('preload-error', (_e, p, err) => log('PRELOAD-ERROR', p, err && err.message));

  log('T1: about:blank');
  try { await win.loadURL('about:blank'); } catch (e) { log('T1 threw', e.message); }
  await new Promise((r) => setTimeout(r, 3000));
  log('T1 gone=' + gone);

  log('T2: http://localhost:5174');
  try { await win.loadURL('http://localhost:5174'); } catch (e) { log('T2 threw', e.message); }
  await new Promise((r) => setTimeout(r, 5000));
  log('T2 gone=' + gone);
  try {
    const probe = await win.webContents.executeJavaScript(
      'JSON.stringify({hasSuperai: typeof window.superai, rootChildren: document.getElementById("root") ? document.getElementById("root").children.length : -1})', true);
    log('PROBE', probe);
  } catch (e) { log('PROBE-FAILED', e.message); }
  log('DONE');
  app.exit(0);
});
app.on('window-all-closed', () => app.exit(0));
`;

const tmpMain = path.join(__dirname, '..', 'node_modules', '.diag-trial.cjs');
fs.writeFileSync(tmpMain, mainSrc, 'utf-8');
console.log('===== VARIANT:', variant, '=====');
const child = spawn(electronBin, [tmpMain], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => {
  try { fs.unlinkSync(tmpMain); } catch {}
  process.exit(code ?? 0);
});
setTimeout(() => { try { child.kill('SIGKILL'); } catch {} process.exit(3); }, 25000);
