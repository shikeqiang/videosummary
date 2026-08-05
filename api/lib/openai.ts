import OpenAI from "openai"
import { ENV } from "./env"

let _client: OpenAI | null = null

function getClient() {
  if (_client) return _client
  _client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY() })
  return _client
}

/**
 * Pick the chat model based on the user's plan.
 * - free  → gpt-4o-mini  (cheap, fast)
 * - pro   → gpt-4o       (better reasoning, deeper summaries)
 *
 * Centralized here so we can swap models in one place later.
 */
function pickModel(plan: "mini" | "pro"): "gpt-4o-mini" | "gpt-4o" {
  return plan === "pro" ? "gpt-4o" : "gpt-4o-mini"
}

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

export async function summarizeChunk(
  text: string,
  opts: { model?: "mini" | "pro"; targetLang?: string } = {}
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
    ]
  })

  const content = completion.choices[0]?.message?.content ?? "{}"
  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = { summary: content, bullets: [], timeline: [], insight: "" }
  }

  return {
    summary: parsed.summary ?? "",
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 10).map(String) : [],
    timeline: Array.isArray(parsed.timeline)
      ? parsed.timeline.slice(0, 12).map((t: any) => ({
          ts: Math.max(0, parseInt(t.ts, 10) || 0),
          title: String(t.title ?? "")
        }))
      : [],
    insight: parsed.insight
  }
}

/**
 * 多 chunk map-reduce 总结
 */
export async function summarizeMapReduce(
  chunks: string[],
  targetLang: string | undefined,
  model: "mini" | "pro" = "mini"
): Promise<SummaryOutput & { _usage?: { prompt: number; completion: number } }> {
  // 第一层：每块单独总结
  const partials: SummaryOutput[] = []
  for (const c of chunks) {
    const s = await summarizeChunk(c, { model, targetLang })
    partials.push(s)
  }

  // 第二层：合并
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
  const completion = await client.chat.completions.create({
    model: pickModel(model),
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 900,
    messages: [
      { role: "system", content: finalSys },
      { role: "user", content: mergedInput }
    ]
  })

  const content = completion.choices[0]?.message?.content ?? "{}"
  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = {}
  }

  return {
    summary: parsed.summary ?? partials[0]?.summary ?? "",
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 10).map(String) : [],
    timeline: mergeTimeline(partials.map((p) => p.timeline)),
    insight: parsed.insight,
    _usage: {
      prompt: completion.usage?.prompt_tokens ?? 0,
      completion: completion.usage?.completion_tokens ?? 0
    }
  }
}

function mergeTimeline(arrs: Array<Array<{ ts: number; title: string }>>): Array<{ ts: number; title: string }> {
  const flat = arrs.flat().filter((t) => t.title && t.ts > 0)
  flat.sort((a, b) => a.ts - b.ts)
  // 去重（30s 内）
  const out: typeof flat = []
  for (const t of flat) {
    if (out.length === 0 || t.ts - out[out.length - 1].ts > 30) out.push(t)
    if (out.length >= 10) break
  }
  return out
}
