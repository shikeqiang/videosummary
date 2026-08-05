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
