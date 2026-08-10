import { NextRequest } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "~/lib/supabase-server"
import { getUserFromBearer } from "~/lib/supabase-server"
import { getCachedSummary, setCachedSummary, incrQuota, getQuota } from "~/lib/redis"
import { cleanTranscript, chunkByChars } from "~/lib/transcript-clean"
import { summarizeMapReduce, pickModel, type Tier, type ProgressEvent } from "~/lib/llm"
import { getUserPlan, dailyLimitFor } from "~/lib/plan"
import { ENV } from "~/lib/env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BodySchema = z.object({
  videoId: z.string().min(3).max(50),
  title: z.string().max(500).optional(),
  channel: z.string().max(200).optional(),
  language: z.string().max(10).optional(),
  transcript: z.string().min(20).max(80000)
})

export async function POST(req: NextRequest) {
  // 1) 鉴权
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null
  const user = await getUserFromBearer(token)
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2) 验证 body
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (e: any) {
    return Response.json({ error: "Bad request", details: e.message }, { status: 400 })
  }

  // 3) 配额
  const plan = await getUserPlan(user.id)
  const limit = dailyLimitFor(plan)
  const used = await getQuota(user.id)
  if (used >= limit && plan !== "pro") {
    return Response.json(
      { error: "Daily limit reached. Upgrade to Pro.", code: "QUOTA_EXCEEDED", used, limit },
      { status: 402 }
    )
  }

  // 4) 缓存
  const cached = await getCachedSummary(body.videoId, body.language)
  if (cached) {
    await logUsage(user.id, body.videoId, 0, "cache")
    return Response.json({
      ...cached,
      cached: true,
      plan,
      usageToday: await getQuota(user.id),
      limit
    })
  }

  // 5) 文本清洗
  const cleaned = cleanTranscript(body.transcript)
  if (cleaned.length < 50) {
    return Response.json({ error: "Transcript too short" }, { status: 400 })
  }

  // 6) 切块 + map-reduce
  const chunks = chunkByChars(cleaned, 12000)
  const tier: Tier = plan === "pro" ? "pro" : "mini"

  // ===== 流式 vs 一次性：看 Accept header =====
  const accept = req.headers.get("accept") ?? ""
  const isStreaming = accept.includes("text/event-stream")

  if (isStreaming) {
    return streamSummary({ user, body, plan, limit, chunks, tier, signal: req.signal })
  }
  return jsonSummary({ user, body, plan, limit, chunks, tier, signal: req.signal })
}

// ----- 一次性 JSON 响应（旧路径，兼容现有扩展客户端） -----
async function jsonSummary({
  user, body, plan, limit, chunks, tier, signal
}: {
  user: { id: string; email: string }
  body: z.infer<typeof BodySchema>
  plan: "free" | "pro" | "grace"
  limit: number
  chunks: string[]
  tier: Tier
  signal: AbortSignal | undefined
}) {
  let out: any
  try {
    out = await summarizeMapReduce(chunks, body.language, tier, undefined, signal)
  } catch (e: any) {
    console.error("[summary] AI error", e)
    return Response.json({ error: "AI failed", details: e.message }, { status: 500 })
  }
  const videoPayload = {
    youtube_video_id: body.videoId,
    title: body.title ?? "",
    channel: body.channel ?? "",
    summary: out.summary,
    bullets: out.bullets,
    timeline: out.timeline,
    insight: out.insight ?? null,
    language: body.language ?? "auto",
    model: pickModel(tier)
  }
  await persistResult(user.id, body, out, videoPayload, plan, limit)
  return Response.json({
    ...out,
    cached: false,
    plan,
    usageToday: await getQuota(user.id),
    limit,
    videoId: body.videoId,
    title: body.title,
    channel: body.channel,
    language: body.language,
    model: videoPayload.model,
    tokensUsed: (out._usage?.prompt ?? 0) + (out._usage?.completion ?? 0)
  })
}

// ----- SSE 流式响应（新路径，扩展要传 Accept: text/event-stream）-----
function streamSummary({
  user, body, plan, limit, chunks, tier, signal
}: {
  user: { id: string; email: string }
  body: z.infer<typeof BodySchema>
  plan: "free" | "pro" | "grace"
  limit: number
  chunks: string[]
  tier: Tier
  signal: AbortSignal | undefined
}): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch { /* controller may be closed on cancel */ }
      }

      try {
        send("status", { phase: "preparing", message: "Cleaning transcript…" })

        // 边跑 map-reduce 边发进度
        let out: any
        try {
          out = await summarizeMapReduce(chunks, body.language, tier, (evt: ProgressEvent) => {
            if (evt.phase === "map" || evt.phase === "map_done") {
              send("status", {
                phase: "map",
                chunk: evt.chunk,
                total: evt.total,
                message: evt.message
              })
            } else if (evt.phase === "reduce") {
              if (typeof evt.delta === "string") {
                send("token", { delta: evt.delta })
              } else {
                send("status", { phase: "reduce", message: evt.message ?? "Combining results…" })
              }
            }
          }, signal)
        } catch (e: any) {
          console.error("[summary] AI error", e)
          send("error", { message: "AI failed", details: e.message })
          controller.close()
          return
        }

        // 写库 + 缓存
        const videoPayload = {
          youtube_video_id: body.videoId,
          title: body.title ?? "",
          channel: body.channel ?? "",
          summary: out.summary,
          bullets: out.bullets,
          timeline: out.timeline,
          insight: out.insight ?? null,
          language: body.language ?? "auto",
          model: pickModel(tier)
        }
        await persistResult(user.id, body, out, videoPayload, plan, limit)

        // 终态
        send("result", {
          ...out,
          cached: false,
          plan,
          usageToday: await getQuota(user.id),
          limit,
          videoId: body.videoId,
          title: body.title,
          channel: body.channel,
          language: body.language,
          model: videoPayload.model,
          tokensUsed: (out._usage?.prompt ?? 0) + (out._usage?.completion ?? 0)
        })
        send("done", {})
      } catch (e: any) {
        send("error", { message: e?.message ?? "unknown" })
      } finally {
        try { controller.close() } catch {}
      }
    },
    cancel() {
      // 客户端断开（用户关 overlay / 切视频）— 不做任何清理，
      // 但保证 controller 不会再被使用
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"  // 禁止 nginx 等代理 buffer
    }
  })
}

async function persistResult(
  userId: string,
  body: z.infer<typeof BodySchema>,
  out: any,
  videoPayload: any,
  plan: "free" | "pro" | "grace",
  _limit: number
) {
  await supabaseAdmin().from("videos").upsert(videoPayload, { onConflict: "youtube_video_id,language" })
  await setCachedSummary(body.videoId, body.language, out)
  await incrQuota(userId)
  await logUsage(userId, body.videoId, (out._usage?.prompt ?? 0) + (out._usage?.completion ?? 0), "ai")
}

async function logUsage(userId: string, videoId: string, tokens: number, source: "ai" | "cache") {
  try {
    await supabaseAdmin().from("usage_logs").insert({
      user_id: userId,
      video_id: videoId,
      tokens,
      source
    })
  } catch (e: any) {
    console.warn("[summary] logUsage failed", e?.message ?? e)
  }
}
