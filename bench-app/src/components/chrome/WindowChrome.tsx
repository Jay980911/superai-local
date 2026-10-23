// 标题栏 42px · §6 窗口外壳
import { WORKSPACE } from '../../data/mock';

export default function WindowChrome() {
  return (
    <header className="titlebar">
      <div className="lights">
        <i /> <i /> <i />
      </div>
      <div className="tb-title">
        <b>案台</b>
        <span className="up" style={{ letterSpacing: '0.18em' }}>bench</span>
      </div>
      <div className="tb-mid">
        <span className="chip dir">📁 {WORKSPACE}</span>
        <span className="chip seal">已授权 · 仅此目录</span>
      </div>
      <div className="tb-right">
        <span className="chip">模型 · 均衡 ▾</span>
        <button className="icon-btn" title="设置">⚙</button>
        <button className="icon-btn" title="帮助">?</button>
      </div>
    </header>
  );
}
