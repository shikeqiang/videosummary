/**
 * Provider-agnostic LLM client.
 *
 * 设计：
 *   - 上层（route.ts）只调 summarizeChunk / summarizeMapReduce，传 "mini" | "pro" | "reason"
 *   - 这个模块根据 LLM_PROVIDER 自动选 endpoint + 适配协议
 *   - 5 个 OpenAI-compat provider 共用 openai SDK，仅换 baseURL：
 *       openai / deepseek / dashscope / moonshot / zhipu
 *   - MiniMax 用自家协议（/v1/text/chatcompletion_v2），单独 adapter 30 行
 *   - response_format: {type:"json_object"} 在 OpenAI SDK 里直接用；MiniMax adapter 忽略（系统提示已要求纯 JSON）
 *
 * 切换 provider：
 *   只改 .env 里的 LLM_PROVIDER / LLM_API_KEY / LLM_MODEL_* 三行
 */

import OpenAI from "openai"
import { ENV } from "./env"

export type LLMProvider =
  | "openai"
  | "deepseek"
  | "dashscope"
  | "moonshot"
  | "zhipu"
  | "MiniMax"

export type Tier = "mini" | "pro" | "reason"

interface ProviderDefaults {
  baseURL: string
  defaultMini: string
  defaultPro: string
  defaultReason?: string
  // 是否 OpenAI 兼容（用 openai SDK）
  openaiCompat: boolean
}

const PROVIDER_DEFAULTS: Record<LLMProvider, ProviderDefaults> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    defaultMini: "gpt-4o-mini",
    defaultPro: "gpt-4o",
    openaiCompat: true
  },
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    defaultMini: "deepseek-chat",
    defaultPro: "deepseek-chat",
    defaultReason: "deepseek-reasoner",
    openaiCompat: true
  },
  dashscope: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultMini: "qwen-turbo",
    defaultPro: "qwen-plus",
    defaultReason: "qwen-max",
    openaiCompat: true
  },
  moonshot: {
    baseURL: "https://api.moonshot.cn/v1",
    defaultMini: "moonshot-v1-8k",
    defaultPro: "moonshot-v1-32k",
    openaiCompat: true
  },
  zhipu: {
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    defaultMini: "glm-4-flash",
    defaultPro: "glm-4-air",
    defaultReason: "glm-4-plus",
    openaiCompat: true
  },
  MiniMax: {
    baseURL: "https://api.MiniMax.chat/v1",
    defaultMini: "MiniMax-Text-01",
    defaultPro: "MiniMax-Text-01",
    defaultReason: "MiniMax-Text-01",
    openaiCompat: false
  }
}

/** 当前 LLM 配置（运行时常量；改 env 后需重启） */
export interface LLMConfig {
  provider: LLMProvider
  baseURL: string
  modelMini: string
  modelPro: string
  modelReason: string
}

export function getLLMConfig(): LLMConfig {
  const provider = ENV.LLM_PROVIDER() as LLMProvider
  const d = PROVIDER_DEFAULTS[provider]
  return {
    provider,
    baseURL: ENV.LLM_BASE_URL() || d.baseURL,
    modelMini: ENV.LLM_MODEL_MINI() || d.defaultMini,
    modelPro: ENV.LLM_MODEL_PRO() || d.defaultPro,
    modelReason:
      ENV.LLM_MODEL_REASON() || d.defaultReason || d.defaultPro
  }
}

/** 暴露给上层：基于 plan tier 选模型名 */
export function pickModel(plan: Tier): string {
  const c = getLLMConfig()
  if (plan === "mini") return c.modelMini
  if (plan === "pro") return c.modelPro
  return c.modelReason
}

// ----- 统一的 client 接口（route.ts 只调这一个形状） -----

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}
export interface ChatCompletionsCreateParams {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  /** OpenAI-compat 走 json_object；非 compat adapter 直接忽略 */
  response_format?: { type: "json_object" }
  /** AbortSignal；OpenAI-compat SDK 直接透传，MiniMax adapter 给 fetch() */
  signal?: AbortSignal
}
export interface ChatCompletions {
  create(p: ChatCompletionsCreateParams): Promise<{
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }>
}
export interface LLMClient {
  chat: { completions: ChatCompletions }
}

// ----- OpenAI SDK 直接复用（5 个 OpenAI-compat provider）-----

function buildOpenAICompatClient(c: LLMConfig, apiKey: string): LLMClient {
  const sdk = new OpenAI({ apiKey, baseURL: c.baseURL })
  // 直接返回 sdk，OpenAI SDK 的形状与 LLMClient 兼容
  return sdk as unknown as LLMClient
}

// ----- MiniMax 原生协议 adapter -----

function buildMiniMaxClient(c: LLMConfig, apiKey: string): LLMClient {
  return {
    chat: {
      completions: {
        create: async (p) => {
          const body: Record<string, unknown> = {
            model: p.model,
            messages: p.messages,
            temperature: p.temperature ?? 0.3
          }
          if (p.max_tokens) body.max_tokens = p.max_tokens
          // 不传 response_format（MiniMax 该参数不稳定；SYS_PROMPT 已经要 JSON）

          const r = await fetch(`${c.baseURL}/text/chatcompletion_v2`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            ...(p.signal ? { signal: p.signal } : {})
          } as any)
          if (!r.ok) {
            const errText = await r.text().catch(() => "")
            throw new Error(
              `MiniMax ${r.status}: ${errText.slice(0, 200)}`
            )
          }
          const j = (await r.json()) as {
            choices?: Array<{ message: { content: string } }>
            usage?: { prompt_tokens?: number; completion_tokens?: number }
            base_resp?: { status_code: number; status_msg?: string }
          }
          if (j.base_resp && j.base_resp.status_code !== 0) {
            throw new Error(
              `MiniMax: ${j.base_resp.status_msg ?? JSON.stringify(j.base_resp)}`
            )
          }
          return {
            choices: j.choices ?? [],
            usage: j.usage
          }
        }
      }
    }
  }
}

// ----- 单例 + 切换 provider 时重建 -----

let _client: LLMClient | null = null
let _clientCfg: LLMConfig | null = null

function getClient(): LLMClient {
  const cfg = getLLMConfig()
  if (_client && _clientCfg && _clientCfg.provider === cfg.provider) {
    return _client
  }
  const apiKey = ENV.LLM_API_KEY()
  const d = PROVIDER_DEFAULTS[cfg.provider]
  _client = d.openaiCompat
    ? buildOpenAICompatClient(cfg, apiKey)
    : buildMiniMaxClient(cfg, apiKey)
  _clientCfg = cfg
  return _client
}

// ----- 业务函数（之前在 lib/openai.ts）-----

const SYS_PROMPT = `You are a precise YouTube video summarizer. Given a transcript, produce a JSON object with:
- "summary" (2-3 sentences, 30-60 words, no fluff)
- "bullets" (5-8 concise points, each <= 22 words)
- "timeline" (4-8 entries: array of {"ts": seconds_int, "title": "short title"})
- "insight" (1 actionable sentence, optional)

Strict rules:
- No hallucination. If transcript is unclear, return less rather than inventing.
- Keep total response <= 400 tokens.
- Output pure JSON, no markdown fences.`

export type SummaryOutput = {
  summary: string
  bullets: string[]
  timeline: Array<{ ts: number; title: string }>
  insight?: string
}

/**
 * 单块总结
 */
export async function summarizeChunk(
  text: string,
  opts: { model?: Tier; targetLang?: string; signal?: AbortSignal } = {}
): Promise<SummaryOutput> {
  const client = getClient()
  const model = pickModel(opts.model ?? "mini")

  const userPrompt = opts.targetLang
    ? `Video language: auto-detected. Output language: ${opts.targetLang}.\nTranscript:\n\n${text}`
    : `Transcript:\n\n${text}`

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 700,
    messages: [
      { role: "system", content: SYS_PROMPT },
      { role: "user", content: userPrompt }
    ],
    ...(opts.signal ? { signal: opts.signal } : {})
  })

  const content = completion.choices[0]?.message?.content ?? "{}"
  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = { summary: content, bullets: [], timeline: [], insight: "" }
  }
  return normalize(parsed)
}

/**
 * 进度事件（传给 onProgress 回调）
 *   - map / map_done : 每块开始 / 结束时触发
 *   - reduce         : 第一行触发 status；后续每条 delta 是一个 token 流
 */
export type ProgressPhase = "map" | "map_done" | "reduce"
export interface ProgressEvent {
  phase: ProgressPhase
  chunk?: number  // 1-indexed
  total?: number
  /** map_done 时附上：这一块已完成的小 summary（用于客户端提前显示） */
  partial?: SummaryOutput
  /** reduce 阶段：每条 token 增量 */
  delta?: string
  message?: string
}

/**
 * 多 chunk map-reduce（带可选 onProgress 流式回调）
 */
export async function summarizeMapReduce(
  chunks: string[],
  targetLang: string | undefined,
  model: Tier = "mini",
  onProgress?: (event: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<SummaryOutput & { _usage?: { prompt: number; completion: number } }> {
  // --- Map phase：每块独立总结 ---
  const partials: SummaryOutput[] = []
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({
      phase: "map",
      chunk: i + 1,
      total: chunks.length,
      message: `Analyzing part ${i + 1}/${chunks.length}`
    })
    const s = await summarizeChunk(chunks[i], { model, targetLang, signal })
    partials.push(s)
    onProgress?.({
      phase: "map_done",
      chunk: i + 1,
      total: chunks.length,
      partial: s  // 把这一块的小 summary 推回客户端
    })
  }

  const mergedInput = partials
    .map(
      (p, i) =>
        `Part ${i + 1}:\n- Summary: ${p.summary}\n- Bullets:\n${(p.bullets ?? [])
          .map((b) => `  · ${b}`)
          .join("\n")}`
    )
    .join("\n\n")

  const finalSys = `${SYS_PROMPT}\n\nYou will receive multi-part partial summaries. Combine them into one JSON output that covers the entire video.`

  const client = getClient()
  const cfg = getLLMConfig()

  // --- Reduce phase：流式 ---
  // OpenAI-compat provider（deepseek/qwen/...）：用 SDK 的 stream:true 拿到 token 增量
  // MiniMax：暂不支持流式，回退到一次性 create()，onProgress 只触发 reduce 不带 delta
  let fullContent = ""
  let usage = { prompt: 0, completion: 0 }

  if (PROVIDER_DEFAULTS[cfg.provider].openaiCompat) {
    onProgress?.({ phase: "reduce", message: "Combining results…" })
    const stream = await (client as any).chat.completions.create({
      model: pickModel(model),
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 900,
      messages: [
        { role: "system", content: finalSys },
        { role: "user", content: mergedInput }
      ],
      stream: true,
      ...(signal ? { signal } : {})
    })
    for await (const chunk of stream) {
      if (signal?.aborted) break  // 客户端断开立刻停
      const delta = chunk.choices?.[0]?.delta?.content ?? ""
      if (delta) {
        fullContent += delta
        onProgress?.({ phase: "reduce", delta })
      }
    }
    // OpenAI stream 不返回 usage；token 数粗估（按 content 长度 / 4）
    usage = { prompt: 0, completion: Math.ceil(fullContent.length / 4) }
  } else {
    // MiniMax fallback（非流式）
    onProgress?.({ phase: "reduce", message: "Combining results…" })
    const completion = await client.chat.completions.create({
      model: pickModel(model),
      messages: [
        { role: "system", content: finalSys },
        { role: "user", content: mergedInput }
      ],
      temperature: 0.3,
      ...(signal ? { signal } : {})
      // max_tokens: omitted for MiniMax stability
    })
    fullContent = completion.choices[0]?.message?.content ?? "{}"
    usage = {
      prompt: completion.usage?.prompt_tokens ?? 0,
      completion: completion.usage?.completion_tokens ?? 0
    }
  }

  let parsed: any
  try {
    parsed = JSON.parse(fullContent)
  } catch {
    parsed = {}
  }
  return {
    ...normalize(parsed, partials[0]),
    _usage: usage
  }
}

function normalize(parsed: any, fallback?: SummaryOutput): SummaryOutput {
  return {
    summary: parsed.summary ?? fallback?.summary ?? "",
    bullets: Array.isArray(parsed.bullets)
      ? parsed.bullets.slice(0, 10).map(String)
      : fallback?.bullets ?? [],
    timeline: Array.isArray(parsed.timeline)
      ? parsed.timeline.slice(0, 12).map((t: any) => ({
          ts: Math.max(0, parseInt(t.ts, 10) || 0),
          title: String(t.title ?? "")
        }))
      : mergeTimeline([fallback?.timeline ?? []]),
    insight: parsed.insight ?? fallback?.insight
  }
}

function mergeTimeline(
  arrs: Array<Array<{ ts: number; title: string }>>
): Array<{ ts: number; title: string }> {
  const flat = arrs.flat().filter((t) => t.title && t.ts > 0)
  flat.sort((a, b) => a.ts - b.ts)
  const out: typeof flat = []
  for (const t of flat) {
    if (out.length === 0 || t.ts - out[out.length - 1].ts > 30) out.push(t)
    if (out.length >= 10) break
  }
  return out
}
