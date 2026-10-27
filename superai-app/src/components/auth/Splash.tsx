// 启动闪屏 — 登录校验期间展示；样式见 App.css .splash-*
export default function Splash({ status = '正在准备工作台' }: { status?: string }) {
  return (
    <div className="splash-screen">
      <div className="splash-mark">S</div>
      <div className="splash-brand">
        <h1>SuperAI</h1>
        <div className="sub">local · desktop</div>
      </div>
      <div className="splash-bar"><i /></div>
      <div className="splash-status">{status}</div>
    </div>
  );
}
