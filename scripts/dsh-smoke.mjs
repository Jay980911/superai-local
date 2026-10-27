// superai-local × dsh 最小闭环验证（Step 1）
// 验证：spawn dsh --profile sdk → initialize 握手 → session/prompt → 事件流 → finalResponse → 工具调用
// 运行方式（PowerShell）：
//   $env:SUPERAI_MODEL_API_KEY="sk-xxx"; node scripts/dsh-smoke.mjs
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const patch = path.join(here, 'dsh-litellm.patch.yml')
const dshHome = path.join(tmpdir(), 'superai-dsh-smoke-home')

console.log('[smoke] dshHome =', dshHome)
console.log('[smoke] patch  =', patch)

const harness = new DeepSeekHarness({
  profile: 'sdk',
  patches: [patch],
  dshHome,
  provider: 'superai-litellm',
  model: 'gpt-5.1-chat',
  env: { ...process.env },
})

async function run(label, prompt) {
  console.log(`\n[smoke] --- ${label} ---`)
  const seen = []
  const result = await harness.run(prompt, {
    onNotification: (n) => {
      seen.push(n?.method ?? '?')
    },
  })
  const counts = seen.reduce((acc, m) => ({ ...acc, [m]: (acc[m] ?? 0) + 1 }), {})
  console.log(`[smoke] ${label}: sessionId =`, result.sessionId)
  console.log(`[smoke] ${label}: notifications(${result.notifications?.length ?? 0}) =`, JSON.stringify(counts))
  console.log(`[smoke] ${label}: events(${result.events?.length ?? 0})`)
  console.log(`[smoke] ${label}: finalResponse =`, (result.finalResponse ?? '').slice(0, 200))
}

console.log('[smoke] spawning dsh runtime...')
try {
  await run('chat', '你好，请用一句中文介绍你自己，不要使用任何工具。')
  await run('tool', '请使用 bash 工具运行 echo hello-from-dsh，并告诉我它的输出。')
} catch (error) {
  console.error('[smoke] FAILED:', error?.message ?? error)
  if (error?.data) console.error('[smoke] error data:', JSON.stringify(error.data).slice(0, 500))
  process.exitCode = 1
} finally {
  await harness.close()
  console.log('\n[smoke] closed.')
}
