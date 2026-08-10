import { ENV } from "./env"
import { getSession } from "./supabase"

/**
 * 后端 API 客户端。统一注入 auth header。
 */

export type SummarySection = {
  bullets: string[]
  outline?: Array<{ ts: number; title: string }>
  insight?: string
}

export type SummaryPayload = {
  videoId: string
  title: string
  channel: string
  language?: string
  summary: string
  bullets: string[]
  timeline: Array<{ ts: number; title: string }>
  insight?: string
  model: string
  tokensUsed?: number
}

async function authHeader(): Promise<Record<string, string>> {
  const session = await getSession()
  if (!session?.access_token) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "DELETE"
  body?: any
  query?: Record<string, string | number | undefined>
  signal?: AbortSignal
}

export async function request<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(path, ENV.API_BASE_URL)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader())
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (json as any).error ?? `HTTP ${res.status}`
    throw new ApiError(msg, res.status, json)
  }
  return json as T
}

export class ApiError extends Error {
  status: number
  data: any
  constructor(message: string, status: number, data: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

// ===== High-level =====

export async function createSummary(req: {
  videoId: string
  title: string
  channel: string
  language?: string
  transcript: string
}): Promise<SummaryPayload> {
  return request<SummaryPayload>("/api/summary", { method: "POST", body: req })
}

/**
 * 流式版本 createSummary：通过 SSE 接收进度事件和 token 增量
 *
 * 事件类型：
 *   - status  { phase, chunk?, total?, message }
 *   - token   { delta: string }            ← reduce 阶段每条 token 增量
 *   - result  <SummaryPayload>             ← 最终结构化 JSON
 *   - done    {}
 *   - error   { message, details? }
 *
 * 调用方通过 onStatus / onToken 回调拿到实时进度，await 返回最终 payload。
 */
export interface SummaryPartial {
  summary: string
  bullets: string[]
  timeline: Array<{ ts: number; title: string }>
  insight?: string
}

export async function createSummaryStream(
  req: {
    videoId: string
    title: string
    channel: string
    language?: string
    transcript: string
  },
  callbacks: {
    onStatus?: (s: { phase: string; chunk?: number; total?: number; message?: string }) => void
    /** map_done 时触发，partial 是这一块已完成的小 summary */
    onPartial?: (chunk: number, total: number, partial: SummaryPartial) => void
    onToken?: (delta: string) => void
  } = {},
  opts: { signal?: AbortSignal } = {}
): Promise<SummaryPayload> {
  const url = new URL("/api/summary", ENV.API_BASE_URL)
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(await authHeader())
    },
    body: JSON.stringify(req),
    signal: opts.signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new ApiError(`HTTP ${res.status}`, res.status, { raw: text })
  }
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  let result: SummaryPayload | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const evt = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let name = "message"
      let dataLine = ""
      for (const line of evt.split("\n")) {
        if (line.startsWith("event: ")) name = line.slice(7).trim()
        else if (line.startsWith("data: ")) dataLine += (dataLine ? "\n" : "") + line.slice(6)
      }
      if (!dataLine) continue
      let parsed: any
      try { parsed = JSON.parse(dataLine) } catch { parsed = dataLine }
      if (name === "status") {
        callbacks.onStatus?.(parsed)
        // map_done 时把 partial 推回
        if (parsed?.phase === "map_done" && parsed?.partial) {
          callbacks.onPartial?.(parsed.chunk, parsed.total, parsed.partial)
        }
      }
      else if (name === "token") callbacks.onToken?.(parsed.delta ?? "")
      else if (name === "result") result = parsed as SummaryPayload
      else if (name === "error") {
        if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError")
        throw new ApiError(parsed.message ?? "AI failed", 500, parsed)
      }
      // 'done' is just terminal — ignored
    }
  }
  if (!result) throw new ApiError("Stream ended without result", 500, {})
  return result
}

export async function getCheckoutUrl() {
  return request<{ url: string }>("/api/checkout", { method: "POST" })
}

export async function fetchMe() {
  return request<{
    id: string
    email: string
    plan: "free" | "pro" | "grace"
    usageToday: number
    limit: number
  }>("/api/me")
}

export async function fetchUsage() {
  return request<{
    today: number
    limit: number
    remaining: number
    resetAt: string
  }>("/api/usage")
}
