import { useState } from 'react';
import './App.css';

// P0 骨架：标题栏 + 三栏 shell + 分段控件。
// 内容/交互后续阶段按 §6 组件清单填充；mock 数据按 §7。
// 视觉真值：design/bench-ui-ux-prototype.html（风格A）。

type Pane = 'tree' | 'code' | 'preview';

export default function App() {
  const [side, setSide] = useState<'on' | 'off'>('on');
  const [pane, setPane] = useState<Pane>('tree');

  return (
    <div className="app" data-side={side} data-screen="main">
      {/* 标题栏 42px */}
      <header className="titlebar">
        <div className="lights">
          <i /> <i /> <i />
        </div>
        <div className="tb-title">
          <b>案台</b>
          <span className="up" style={{ letterSpacing: '0.18em' }}>bench</span>
        </div>
        <div className="tb-mid">
          <span className="chip dir">📁 ~/Documents/Q3汇报</span>
          <span className="chip seal">已授权 · 仅此目录</span>
        </div>
        <div className="tb-right">
          <span className="chip">模型 · 均衡 ▾</span>
          <button className="icon-btn" title="设置">⚙</button>
          <button className="icon-btn" title="帮助">?</button>
        </div>
      </header>

      <main className="workspace">
        {/* 左：会话栏（P0 占位，P1 填充内容） */}
        <aside className="sessions">
          <div className="brandrow">
            <div className="logo">案</div>
            <div>
              <div className="nm">案台</div>
              <div className="sub">bench · desktop</div>
            </div>
            <div className="grow" />
            <button
              className="icon-btn"
              title="收起侧栏 «"
              onClick={() => setSide('off')}
            >
              «
            </button>
          </div>
          <button className="new-chat">＋ 新建对话</button>
          <div className="search">
            <span>⌕</span>搜索会话与文件<span className="k">⌘K</span>
          </div>
          <div className="side-scroll" />
          <div className="userbar">
            <div className="avatar">周</div>
            <div>
              <div className="u1">周佳豪</div>
              <div className="u2">个人版 · 已登录</div>
            </div>
            <div className="grow" />
            <span className="upgrade">升级</span>
            <button className="icon-btn">⚙</button>
          </div>
        </aside>

        {/* 中：主会话（P0 占位） */}
        <section className="chat">
          <div className="chat-head">
            <button
              className="icon-btn side-open"
              title="展开侧栏"
              onClick={() => setSide('on')}
            >
              ☰
            </button>
            <div>
              <div className="ttl">Q3 销售汇报</div>
              <div className="meta">今天 14:32 · 12 条消息 · 自动执行已开启</div>
            </div>
            <div className="grow" />
            <span className="chip dir">📁 ~/Documents/Q3汇报</span>
            <button className="icon-btn">↗</button>
            <button className="icon-btn">⋯</button>
          </div>
          <div className="stream">
            <div className="wrap" />
          </div>
          <div className="composer">
            <div className="inner">
              <div className="cbox">
                <textarea placeholder="告诉案台要达成的结果…" />
                <div className="ctools">
                  <span className="tbtn b">＋ 附件</span>
                  <span className="tbtn b">✨ 技能</span>
                  <span className="tbtn">模型 · 均衡 ▾</span>
                  <div className="grow" />
                  <button className="send" title="发送">↑</button>
                </div>
              </div>
              <div className="cfoot">
                <span>ENTER 发送</span>
                <span>SHIFT+ENTER 换行</span>
                <span style={{ marginLeft: 'auto' }}>读写范围 ~/Documents/Q3汇报</span>
              </div>
            </div>
          </div>
        </section>

        {/* 右：成果面板 492px（P0 shell） */}
        <aside className="output">
          <div className="out-head">
            <div className="t">成果</div>
            <div className="grow" />
            <div className="segs">
              <button className={pane === 'tree' ? 'on' : ''} onClick={() => setPane('tree')}>目录树</button>
              <button className={pane === 'code' ? 'on' : ''} onClick={() => setPane('code')}>源码</button>
              <button className={pane === 'preview' ? 'on' : ''} onClick={() => setPane('preview')}>预览</button>
            </div>
          </div>
          <div className="out-body">
            <div className={`opane ${pane === 'tree' ? 'on' : ''}`} />
            <div className={`opane ${pane === 'code' ? 'on' : ''}`} />
            <div className={`opane ${pane === 'preview' ? 'on' : ''}`} />
          </div>
          <div className="out-foot">
            <div className="grow" />
            <button className="icon-btn">＋</button>
            <button className="icon-btn">⋯</button>
          </div>
        </aside>
      </main>
    </div>
  );
}
