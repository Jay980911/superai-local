// superai-local × dsh 协议探针（Step 1 补充）
// 目的：看清 session.event / session.status / approval/request 的真实载荷结构，
// 为 CJS JSON-RPC 客户端 + 事件翻译层提供契约依据。
// 运行：$env:SUPERAI_MODEL_API_KEY="sk-xxx"; node scripts/dsh-probe.mjs
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const base = {
  profile: 'sdk',
  patches: [path.join(here, 'dsh-litellm.patch.yml')],
  dshHome: path.join(tmpdir(), 'superai-dsh-smoke-home'),
  provider: 'superai-litellm',
  model: 'gpt-5.1-chat',
  env: { ...process.env },
  initializeTimeoutMs: 60_000,
}

const brief = (v, n = 400) => JSON.stringify(v)?.slice(0, n)

// ---------- A: 事件结构（纯对话） ----------
console.log('=== A: session.event / session.status 载荷结构 ===')
{
  const harness = new DeepSeekHarness(base)
  let printed = 0
  try {
    await harness.run('你好，请用一句中文介绍你自己，不要使用任何工具。', {
      onNotification: (n) => {
        if (printed < 6) {
          console.log(`\n[notif] method=${n.method}`)
          console.log('  params keys:', Object.keys(n.params ?? {}))
          console.log('  params:', brief(n.params, 600))
          printed++
        }
      },
    })
  } finally {
    await harness.close()
  }
}

// ---------- B: 审批流（工具调用） ----------
console.log('\n\n=== B: 工具调用（DSH_PERMISSION_MODE=danger-full-access） ===')
{
  // rc.3 的 SDK 协议还没有 approval/request 传输（master 未发布功能），
  // sdk profile 的审批链由 DSH_PERMISSION_MODE 驱动：
  //   workspace-write(默认) → approval: ask → SDK 会话无应答通道 → 失败关闭
  //   danger-full-access    → approval: never → 直接放行
  const harness = new DeepSeekHarness({
    ...base,
    env: { ...process.env, DSH_PERMISSION_MODE: 'danger-full-access' },
  })
  try {
    const result = await harness.run('请使用 shell 工具运行 echo hello-from-dsh，并告诉我它的输出。', {
      onNotification: (n) => {
        if (n.method === 'session.status') console.log('[status]', brief(n.params, 200))
        if (n.method === 'session.event' && /tool|step/.test(n.params?.event?.type ?? '')) {
          console.log('[event]', brief(n.params.event, 300))
        }
      },
    })
    console.log('\n[B] finalResponse =', (result.finalResponse ?? '').slice(0, 400))
  } catch (error) {
    console.error('[B] FAILED:', error?.message ?? error)
  } finally {
    await harness.close()
  }
}
console.log('\n[probe] done.')
