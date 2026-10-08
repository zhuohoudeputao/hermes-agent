/**
 * ADE console — a first-class desktop page at `/ade` (routes contribution).
 *
 * Three panes, all fed by the read-only Python probe (`hermes:ade:*`, see
 * `electron/ade-ipc.ts` → `Projects/ade-app/ade_probe.py` → `data.py`):
 *
 *   LEFT   session tree — nodes carry a display `#编号` and a run-status mark
 *          (FR-33/FR-34). Grouped profile → first-level folder.
 *   MIDDLE session summary — the content summary (目标/进展/下一步, FR-31) on
 *          top, the session BODY expanded INLINE below (FR-32: never a new
 *          full-screen page; the route stays put).
 *   RIGHT  whole-tree report — one numbered section per session, identical
 *          numbers to the tree, stable `s-<id>` anchors, clickable TOC (FR-03/
 *          FR-07/FR-12).
 *
 * Design notes that are load-bearing:
 *   * An unknown status is shown as an explicit 状态未知 (never a green dot).
 *   * Clicking a session changes local state only — the router is NOT touched,
 *     so the layout (all three panes) survives (FR-32's acceptance criterion).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

import {
  type AdeSession,
  type AdeState,
  type AdeStatus,
  type AdeStatusState,
  type AdeSummaryPayload,
  payloadErrors
} from './types'

// Status → presentation. `unknown` is deliberately NOT green: a missing column
// must read as "don't know", not "all clear" (FR-34).
const STATUS_STYLE: Record<AdeStatusState, { color: string; ring: string }> = {
  running: { color: 'var(--ui-status-ok, #38b27b)', ring: 'var(--ui-status-ok, #38b27b)' },
  ended: { color: 'var(--ui-text-tertiary, #8a8f98)', ring: 'var(--ui-text-tertiary, #8a8f98)' },
  aborted: { color: 'var(--ui-status-error, #e5534b)', ring: 'var(--ui-status-error, #e5534b)' },
  unread: { color: 'var(--ui-status-info, #4a9eff)', ring: 'var(--ui-status-info, #4a9eff)' },
  idle: { color: 'var(--ui-text-tertiary, #555)', ring: 'var(--ui-text-tertiary, #555)' },
  unknown: { color: 'var(--ui-status-warn, #d9a441)', ring: 'var(--ui-status-warn, #d9a441)' }
}

const LEGEND: AdeStatusState[] = ['running', 'ended', 'aborted', 'unread', 'idle', 'unknown']

function StatusDot({ status }: { status: AdeStatus }) {
  const style = STATUS_STYLE[status.state] || STATUS_STYLE.unknown

  return (
    <span
      aria-label={status.label}
      className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem]"
      style={{ color: style.color }}
      title={`${status.label} · 依据：${status.source}`}
    >
      <span className="inline-block size-2 rounded-full" style={{ backgroundColor: style.ring }} />
    </span>
  )
}

function fmtTime(ts: null | number | undefined): string {
  if (!ts) {
    return '—'
  }

  try {
    return new Date(ts * 1000).toLocaleString()
  } catch {
    return '—'
  }
}

interface Group {
  profile: string
  folders: { folder: string; sessions: AdeSession[] }[]
  count: number
}

export function AdePage() {
  const [state, setState] = useState<AdeState | null>(null)
  const [loadError, setLoadError] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string>('')
  const [detail, setDetail] = useState<AdeSummaryPayload | null>(null)
  const [detailError, setDetailError] = useState<string>('')
  const reportRef = useRef<HTMLDivElement | null>(null)

  const bridge = typeof window === 'undefined' ? undefined : window.hermesDesktop?.ade

  const load = useCallback(async () => {
    setLoadError('')

    if (!bridge) {
      setLoadError('ADE 桥接不可用：window.hermesDesktop.ade 缺失（桌面主进程未注册 hermes:ade:*）')
      return
    }

    try {
      const payload = (await bridge.state(120)) as AdeState
      setState(payload)
      const errs = payloadErrors(payload)

      if (!payload.ok || errs.length) {
        setLoadError(errs.join('；') || 'ADE 探针返回 ok=false')
      }
    } catch (error) {
      setLoadError(`调用 ADE 探针失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [bridge])

  useEffect(() => {
    void load()
  }, [load])

  const sessions = state?.sessions || []

  const groups = useMemo<Group[]>(() => {
    const byProfile = new Map<string, Map<string, AdeSession[]>>()

    for (const s of sessions) {
      const profile = s.profile || 'default'

      if (!byProfile.has(profile)) {
        byProfile.set(profile, new Map())
      }

      const folders = byProfile.get(profile)!

      if (!folders.has(s.folder)) {
        folders.set(s.folder, [])
      }

      folders.get(s.folder)!.push(s)
    }

    return [...byProfile.entries()].map(([profile, folders]) => {
      const folderList = [...folders.entries()].map(([folder, list]) => ({ folder, sessions: list }))

      return { profile, folders: folderList, count: folderList.reduce((n, f) => n + f.sessions.length, 0) }
    })
  }, [sessions])

  const openSession = useCallback(
    async (s: AdeSession) => {
      // Local state only — the router is intentionally NOT touched (FR-32).
      setSelectedId(s.id)
      setDetail(null)
      setDetailError('')

      if (!bridge) {
        setDetailError('ADE 桥接不可用')
        return
      }

      try {
        const payload = (await bridge.summary(s.id)) as AdeSummaryPayload
        setDetail(payload)

        if (!payload.ok) {
          setDetailError(payloadErrors(payload).join('；') || '概要按照读取失败')
        }
      } catch (error) {
        setDetailError(`读取会话概要失败：${error instanceof Error ? error.message : String(error)}`)
      }
    },
    [bridge]
  )

  const selected = sessions.find(s => s.id === selectedId) || null

  const jumpTo = useCallback((anchor: string) => {
    const el = typeof document === 'undefined' ? null : document.getElementById(anchor)

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden text-sm" data-ade-root="">
      {/* ── LEFT: session tree ─────────────────────────────────────────── */}
      <aside
        className="flex w-[22rem] min-w-[16rem] shrink-0 flex-col overflow-hidden border-r border-(--ui-border, #2a2d34)"
        data-ade-pane="tree"
      >
        <header className="flex items-center justify-between gap-2 border-b border-(--ui-border, #2a2d34) px-3 py-2">
          <div className="flex items-center gap-2 font-medium">
            <Codicon name="list-tree" size="0.85rem" />
            会话树
          </div>
          <button
            className="rounded px-2 py-0.5 text-[0.6875rem] text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)"
            onClick={() => void load()}
            type="button"
          >
            刷新
          </button>
        </header>

        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-(--ui-border, #2a2d34) px-3 py-1.5 text-[0.625rem]">
          {LEGEND.map(key => (
            <span className="inline-flex items-center gap-1" key={key} style={{ color: STATUS_STYLE[key].color }}>
              <span className="inline-block size-1.5 rounded-full" style={{ backgroundColor: STATUS_STYLE[key].ring }} />
              {key === 'running'
                ? '运行中'
                : key === 'ended'
                  ? '已结束'
                  : key === 'aborted'
                    ? '异常结束'
                    : key === 'unread'
                      ? '有未读'
                      : key === 'idle'
                        ? '空闲'
                        : '状态未知'}
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-1.5 py-1">
          {loadError ? (
            <div className="m-2 rounded border border-(--ui-status-error, #e5534b) p-2 text-xs" data-ade-error="">
              {loadError}
            </div>
          ) : null}

          {groups.map(group => (
            <div className="mb-1" key={group.profile}>
              <div className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-semibold text-(--ui-text-secondary)">
                <Codicon name="account" size="0.75rem" />
                {group.profile}
                <span className="text-(--ui-text-tertiary)">（{group.count}）</span>
              </div>
              {group.folders.map(folderGroup => (
                <div className="ml-2" key={`${group.profile}/${folderGroup.folder}`}>
                  <div className="flex items-center gap-1.5 px-1.5 py-0.5 text-[0.6875rem] text-(--ui-text-tertiary)">
                    <Codicon name="folder" size="0.7rem" />
                    {folderGroup.folder}
                  </div>
                  {folderGroup.sessions.map(s => (
                    <button
                      className={cn(
                        'flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-[0.75rem] hover:bg-(--chrome-action-hover)',
                        s.id === selectedId && 'bg-(--chrome-action-hover)'
                      )}
                      data-ade-node=""
                      data-number={s.number}
                      data-session-id={s.id}
                      data-status={s.status.state}
                      key={s.id}
                      onClick={() => void openSession(s)}
                      type="button"
                    >
                      <span className="mt-0.5 tabular-nums text-(--ui-text-tertiary)">#{s.number}</span>
                      <StatusDot status={s.status} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{s.title}</span>
                        <span className="block truncate text-[0.625rem] text-(--ui-text-tertiary)">
                          {s.status.label} · {s.message_count} 条 · {s.source}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {!loadError && !sessions.length ? (
            <div className="m-2 text-xs text-(--ui-text-tertiary)">（探针未返回会话）</div>
          ) : null}
        </div>
      </aside>

      {/* ── MIDDLE: session summary + INLINE body ──────────────────────── */}
      <section
        className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-(--ui-border, #2a2d34)"
        data-ade-pane="summary"
      >
        <header className="flex items-center gap-2 border-b border-(--ui-border, #2a2d34) px-3 py-2">
          <Codicon name="note" size="0.85rem" />
          <span className="font-medium">会话概要</span>
          {selected ? (
            <span className="truncate text-(--ui-text-tertiary)">
              #{selected.number} · {selected.title}
            </span>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {!selected ? (
            <div className="text-xs text-(--ui-text-tertiary)">← 点击左侧会话节点，在此窗格内展开概要（不跳页）</div>
          ) : (
            <>
              {/* FR-31: 内容总结三行 —— 目标 / 进展 / 下一步 */}
              <div className="mb-3 rounded border border-(--ui-border, #2a2d34)" data-ade-summary="">
                {detail?.summary ? (
                  <dl className="divide-y divide-(--ui-border, #2a2d34)">
                    <SummaryLine kind="target" label="目标" title={detail.summary.targetSource} value={detail.summary.target} />
                    <SummaryLine
                      kind="progress"
                      label="进展"
                      title={detail.summary.progressSource}
                      value={detail.summary.progress}
                    />
                    <SummaryLine kind="next" label="下一步" title={detail.summary.nextSource} value={detail.summary.next} />
                  </dl>
                ) : (
                  <div className="p-2 text-xs text-(--ui-text-tertiary)">正在读取概要…</div>
                )}
              </div>

              {detailError ? (
                <div className="mb-3 rounded border border-(--ui-status-error, #e5534b) p-2 text-xs" data-ade-error="">
                  {detailError}
                </div>
              ) : null}

              {selected.status ? (
                <div className="mb-2 text-[0.6875rem] text-(--ui-text-tertiary)">
                  状态：<span style={{ color: STATUS_STYLE[selected.status.state]?.color }}>{selected.status.label}</span>
                  {' · '}依据 {selected.status.source}
                  {selected.status.end_reason ? ` · end_reason=${selected.status.end_reason}` : ''}
                </div>
              ) : null}

              {/* FR-32: the session BODY, expanded right here in the pane. */}
              <div className="flex items-center gap-2 border-b border-(--ui-border, #2a2d34) pb-1 text-xs font-medium">
                会话本体
                <span className="text-(--ui-text-tertiary)">
                  （{detail?.messageCount ?? selected.message_count} 条消息，展示最近 {detail?.body?.length ?? 0} 条）
                </span>
              </div>
              <div className="mt-2 space-y-1.5" data-ade-body="">
                {(detail?.body || []).map((row, i) => (
                  <div
                    className="rounded border border-(--ui-border, #2a2d34) px-2 py-1"
                    data-ade-body-row={row.role}
                    key={`${row.timestamp}-${i}`}
                  >
                    <span
                      className="mr-2 text-[0.625rem] uppercase"
                      style={{
                        color:
                          row.role === 'user'
                            ? 'var(--ui-status-info, #4a9eff)'
                            : row.role === 'assistant'
                              ? 'var(--ui-status-ok, #38b27b)'
                              : 'var(--ui-text-tertiary, #8a8f98)'
                      }}
                    >
                      {row.role}
                      {row.tool_name ? ` · ${row.tool_name}` : ''}
                    </span>
                    <span className="text-[0.75rem] whitespace-pre-wrap break-words">{row.excerpt}</span>
                  </div>
                ))}
                {detail && !(detail.body || []).length ? (
                  <div className="text-xs text-(--ui-text-tertiary)">（探针未返回消息体）</div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── RIGHT: whole-tree report ───────────────────────────────────── */}
      <aside
        className="flex w-[24rem] min-w-[18rem] shrink-0 flex-col overflow-hidden"
        data-ade-pane="report"
      >
        <header className="flex items-center gap-2 border-b border-(--ui-border, #2a2d34) px-3 py-2">
          <Codicon name="book" size="0.85rem" />
          <span className="font-medium">整树报告</span>
          <span className="text-(--ui-text-tertiary)">（{sessions.length} 节）</span>
        </header>

        {/* TOC — same numbers as the tree (FR-33), jumps to each section. */}
        <nav className="max-h-40 shrink-0 overflow-auto border-b border-(--ui-border, #2a2d34) px-3 py-2" data-ade-toc="">
          {sessions.map(s => (
            <button
              className="block w-full truncate rounded px-1 py-0.5 text-left text-[0.6875rem] hover:bg-(--chrome-action-hover)"
              data-toc-number={s.number}
              key={s.id}
              onClick={() => jumpTo(s.anchor)}
              type="button"
            >
              <span className="tabular-nums text-(--ui-text-tertiary)">#{s.number}</span> {s.title}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-2" ref={reportRef}>
          {sessions.map(s => (
            <section
              className="mb-4 scroll-mt-2"
              data-ade-report-section=""
              data-number={s.number}
              id={s.anchor}
              key={s.id}
            >
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className="tabular-nums text-(--ui-text-tertiary)">#{s.number}</span>
                <StatusDot status={s.status} />
                <span className="truncate">{s.title}</span>
              </h3>
              <div className="mt-1 grid grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 text-[0.6875rem] text-(--ui-text-secondary)">
                <span className="text-(--ui-text-tertiary)">会话 id</span>
                <span className="truncate font-mono">s-{s.id}</span>
                <span className="text-(--ui-text-tertiary)">profile</span>
                <span>{s.profile}</span>
                <span className="text-(--ui-text-tertiary)">一级文件夹</span>
                <span>{s.folder}</span>
                <span className="text-(--ui-text-tertiary)">状态</span>
                <span style={{ color: STATUS_STYLE[s.status.state]?.color }}>
                  {s.status.label}（{s.status.source}）
                </span>
                <span className="text-(--ui-text-tertiary)">最后活动</span>
                <span>{fmtTime(s.last_active)}</span>
                <span className="text-(--ui-text-tertiary)">消息 / 工具</span>
                <span>
                  {s.message_count} / {s.tool_call_count}
                </span>
              </div>
              {s.preview ? (
                <p className="mt-1 text-[0.6875rem] text-(--ui-text-tertiary)">{s.preview}</p>
              ) : null}
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}

function SummaryLine({
  label,
  value,
  title,
  kind
}: {
  label: string
  value: string
  title: string
  kind: 'next' | 'progress' | 'target'
}) {
  return (
    <div className="grid grid-cols-[4rem_1fr] gap-2 px-2 py-1.5">
      <dt className="text-(--ui-text-tertiary)">{label}</dt>
      <dd className="whitespace-pre-wrap break-words" data-ade-summary={kind} title={title}>
        {value}
      </dd>
    </div>
  )
}

export default AdePage