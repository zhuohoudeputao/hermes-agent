// ADE console data IPC (hermes:ade:*).
//
// The ADE desktop page reads session state by spawning the audited, read-only
// Python probe `ade_probe.py` (which re-uses `Projects/ade-app/data.py`) in a
// CHILD PROCESS from the desktop MAIN process — NOT via the tui_gateway RPC.
// The gateway contract is deliberately untouched: changing it needs a gateway
// restart, which would interrupt a live Hermes session. A subprocess costs one
// short-lived `python3` per request and keeps the gateway running.
//
// Hard rules: the probe itself opens every state.db with `mode=ro`; this module
// never writes anything and returns every failure as `{ ok: false, error }`
// rather than throwing across the IPC boundary.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { ipcMain } from 'electron'

export interface AdeIpcDeps {
  /** Absolute path to the `ade_probe.py` shell (re-uses data.py). */
  probeScript: string
  /** Candidate Python interpreters, in preference order; the first that exists
   *  (or plain `python3` if none do) is used. The probe is stdlib-only. */
  pythonCandidates: string[]
  /** Hard wall-clock cap on a single probe run. */
  timeoutMs?: number
}

interface ProbeResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

function runProbe(python: string, script: string, args: string[], timeoutMs: number): Promise<ProbeResult> {
  return new Promise<ProbeResult>(resolve => {
    let child: ReturnType<typeof spawn>

    try {
      child = spawn(python, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ ok: false, error: `无法启动 ${python}：${error instanceof Error ? error.message : String(error)}` })
      return
    }

    let out = ''
    let err = ''
    let settled = false

    const finish = (result: ProbeResult) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }

      finish({ ok: false, error: `ADE 探针超时（>${timeoutMs}ms）：${script}` })
    }, timeoutMs)

    child.stdout?.on('data', chunk => {
      out += String(chunk)
    })
    child.stderr?.on('data', chunk => {
      err += String(chunk)
    })
    child.on('error', error => {
      finish({ ok: false, error: `ADE 探针启动失败：${error.message}` })
    })
    child.on('close', code => {
      if (code !== 0) {
        finish({ ok: false, error: `ADE 探针退出码 ${code}${err ? '：' + err.trim().slice(0, 800) : ''}` })
        return
      }

      try {
        finish(JSON.parse(out) as ProbeResult)
      } catch (error) {
        finish({
          ok: false,
          error: `ADE 探针输出不是 JSON：${error instanceof Error ? error.message : String(error)}${
            err ? '；stderr=' + err.trim().slice(0, 400) : ''
          }`
        })
      }
    })
  })
}

function resolvePython(candidates: string[]): string {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return 'python3'
}

export function registerAdeIpc({ probeScript, pythonCandidates, timeoutMs = 20_000 }: AdeIpcDeps): void {
  const python = resolvePython(pythonCandidates)

  ipcMain.handle('hermes:ade:state', async (_event, limit?: number): Promise<ProbeResult> => {
    if (!existsSync(probeScript)) {
      return { ok: false, error: `ADE 探针脚本不存在：${probeScript}` }
    }

    const n = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Math.trunc(Number(limit)))) : 40

    return runProbe(python, probeScript, ['--json', '--limit', String(n)], timeoutMs)
  })

  ipcMain.handle('hermes:ade:summary', async (_event, sessionId?: string): Promise<ProbeResult> => {
    if (!existsSync(probeScript)) {
      return { ok: false, error: `ADE 探针脚本不存在：${probeScript}` }
    }

    const id = String(sessionId || '').trim()

    if (!id) {
      return { ok: false, error: 'sessionId 不能为空' }
    }

    return runProbe(python, probeScript, ['--json', '--summary', id], timeoutMs)
  })

  console.log(`[ade] probe IPC registered (python=${python}, probe=${probeScript})`)
}

/** Best-effort locations for the probe shell + interpreters, given HERMES_HOME. */
export function defaultAdeIpcDeps(hermesHome: string, homeDir: string): AdeIpcDeps {
  const probeCandidates = [
    process.env.ADE_PROBE_SCRIPT,
    path.join(homeDir, 'Projects', 'ade-app', 'ade_probe.py'),
    path.join(hermesHome, 'ade-app', 'ade_probe.py')
  ].filter((value): value is string => Boolean(value))

  const probeScript = probeCandidates.find(existsSync) || probeCandidates[1] || probeCandidates[0]

  return {
    probeScript,
    pythonCandidates: [
      process.env.ADE_PYTHON,
      path.join(hermesHome, 'hermes-agent', 'venv', 'bin', 'python3'),
      '/usr/bin/python3',
      '/usr/local/bin/python3'
    ].filter((value): value is string => Boolean(value))
  }
}