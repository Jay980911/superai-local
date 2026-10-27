// 登录界面 — 未登录时全屏遮罩（强制登录：登录后才能进主应用）
// 注册流程对齐 superAi-py 前端 login.html：账号/密码/确认密码/邮箱+发送验证码/邮箱验证码/昵称
// 视觉：Quiet Luxury 双栏（叙事 + 表单），纸感柔光背景见 App.css .login-*
import { useState, useRef, useEffect } from 'react';
import { login, register, sendCode, type CloudUser } from '../../data/cloud';

export default function LoginScreen({ onSuccess }: { onSuccess: (u: CloudUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cdSec, setCdSec] = useState(0);
  const [codeBusy, setCodeBusy] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const sendRegCode = async () => {
    if (cdSec > 0 || codeBusy) return;
    if (!email.trim()) { setErr('请先填写邮箱'); return; }
    setErr(''); setCodeBusy(true);
    try {
      await sendCode(email.trim());
      setCdSec(60);
      timerRef.current = window.setInterval(() => {
        setCdSec((s) => {
          if (s <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; }
          return s - 1;
        });
      }, 1000);
    } catch (e: any) {
      setErr(e.message || '验证码发送失败');
    } finally {
      setCodeBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (mode === 'login') {
      if (!username.trim() || !password) { setErr('请输入账号和密码'); return; }
    } else {
      if (!username.trim() || !password) { setErr('账号和密码必填'); return; }
      if (!/^[A-Za-z0-9]{3,20}$/.test(username.trim())) { setErr('账号只能含英文或数字，3-20 位'); return; }
      if (password !== confirmPassword) { setErr('两次密码输入不一致'); return; }
      if (!email.trim()) { setErr('请填写邮箱'); return; }
      if (!emailCode.trim()) { setErr('请填写邮箱验证码'); return; }
    }
    setBusy(true);
    try {
      const u = mode === 'login'
        ? await login(username.trim(), password)
        : await register(username.trim(), password, email.trim(), nickname.trim() || undefined, emailCode.trim());
      onSuccess(u);
    } catch (e: any) {
      setErr(e.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m); setErr('');
    setConfirmPassword(''); setEmailCode('');
  };

  return (
    <div className="login-screen">
      <div className="login-layout">
        <div className="login-hero">
          <div className="brand">
            <div className="logo">S</div>
            <div>
              <div className="nm">SuperAI</div>
              <div className="sub">local · desktop</div>
            </div>
          </div>
          <h2>安静地<br />把事情做完</h2>
          <p className="lead">
            选一个工作目录，用对话驱动 AI 拆解步骤、调用技能、生成文件。
            所有操作都限定在你授权的范围内——像一张整理好的工作台，而不是一块仪表盘。
          </p>
          <div className="foot">
            <span>v1.0</span>
            <span>Windows</span>
            <span>离线优先</span>
          </div>
        </div>

        <div className="login-card">
          <h1>{mode === 'login' ? '登录' : '注册'}</h1>
          <div className="lead">
            {mode === 'login' ? '登录后即可进入本地工作台' : '创建账号，开始使用 SuperAI'}
          </div>
          <form onSubmit={submit} className="login-form">
            <input
              className="l-input" placeholder="账号（3-20 位英文/数字）"
              value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
            />
            <input
              className="l-input" type="password" placeholder="密码"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'register' && (
              <>
                <input
                  className="l-input" type="password" placeholder="确认密码"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <div className="l-row">
                  <input
                    className="l-input" type="email" placeholder="邮箱"
                    value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }}
                  />
                  <button type="button" className="l-codebtn" onClick={sendRegCode} disabled={cdSec > 0 || codeBusy}>
                    {codeBusy ? '发送中…' : cdSec > 0 ? `${cdSec}s` : '发送验证码'}
                  </button>
                </div>
                <input
                  className="l-input" placeholder="邮箱验证码（6 位）"
                  value={emailCode} onChange={(e) => setEmailCode(e.target.value)} maxLength={6}
                />
                <input
                  className="l-input" placeholder="昵称（可选，默认用账号）"
                  value={nickname} onChange={(e) => setNickname(e.target.value)}
                />
              </>
            )}
            {err && <div className="l-err">{err}</div>}
            <button className="l-btn" type="submit" disabled={busy}>
              {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>
          <button
            className="l-switch" type="button"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
