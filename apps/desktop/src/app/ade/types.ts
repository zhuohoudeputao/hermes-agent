/**
 * Wire types for the ADE console probe payload (`hermes:ade:state` /
 * `hermes:ade:summary`). Kept in sync with `Projects/ade-app/ade_probe.py`.
 */

export type AdeStatusState = 'running' | 'ended' | 'aborted' | 'unread' | 'idle' | 'unknown'

export interface AdeStatus {
  state: AdeStatusState
  label: string
  /** Which column decided the state (provenance for the tooltip / report). */
  source: string
  end_reason: null | string
  ended_at: null | number
  unread: 'read' | 'unread' | 'unknown'
}

export interface AdeSession {
  /** Display-only index (FR-07/FR-33) — identical on the tree and the report. */
  number: number
  id: string
  anchor: string
  title: string
  profile: string
  folder: string
  source: string
  model: null | string
  last_active: null | number
  preview: null | string
  message_count: number
  tool_call_count: number
  pinned: boolean
  status: AdeStatus
}

export interface AdeState {
  ok: boolean
  error?: string
  generatedAt?: number
  errors?: string[]
  profiles?: string[]
  bindings?: Record<string, string>
  sessions?: AdeSession[]
  summary?: {
    sessions: number
    profiles: number
    boundFolders: number
    running: number
    ended: number
    aborted: number
    unread: number
    idle: number
    unknown: number
  }
}

export interface AdeBodyRow {
  role: string
  excerpt: string
  tool_name: null | string
  timestamp: null | number
}

export interface AdeSummaryPayload {
  ok: boolean
  error?: string
  profile?: string
  session?: { id: string; anchor: string; status: AdeStatus }
  summary?: {
    target: string
    progress: string
    next: string
    targetSource: string
    progressSource: string
    nextSource: string
  }
  body?: AdeBodyRow[]
  messageCount?: number
}

/** Collect every error string a payload carries (probe `errors` + `error`). */
export function payloadErrors(payload: { errors?: string[]; error?: string } | null | undefined): string[] {
  if (!payload) {
    return []
  }

  const out = [...(payload.errors || [])]

  if (payload.error) {
    out.push(payload.error)
  }

  return out
}