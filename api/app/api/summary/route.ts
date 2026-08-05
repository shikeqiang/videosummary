import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin } from "~/lib/supabase-server"
import { getUserFromBearer } from "~/lib/supabase-server"
import { getCachedSummary, setCachedSummary, incrQuota, getQuota } from "~/lib/redis"
import { cleanTranscript, chunkByChars } from "~/lib/transcript-clean"
import { summarizeMapReduce } from "~/lib/openai"
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2) 验证 body
  let body: z.infer<typeof BodySchema>
  try {
    body = BodySchema.parse(await req.json())
  } catch (e: any) {
    return NextResponse.json({ error: "Bad request", details: e.message }, { status: 400 })
  }

  // 3) 配额检查
  const plan = await getUserPlan(user.id)
  const limit = dailyLimitFor(plan)
  const used = await getQuota(user.id)
  if (used >= limit && plan !== "pro") {
    return NextResponse.json(
      { error: "Daily limit reached. Upgrade to Pro.", code: "QUOTA_EXCEEDED", used, limit },
      { status: 402 }
    )
  }

  // 4) 缓存
  const cached = await getCachedSummary(body.videoId, body.language)
  if (cached) {
    await logUsage(user.id, body.videoId, 0, "cache")
    return NextResponse.json({
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
    return NextResponse.json({ error: "Transcript too short" }, { status: 400 })
  }

  // 6) 切块 + Map-Reduce
  const chunks = chunkByChars(cleaned, 12000)
  let out: any
  try {
    out = await summarizeMapReduce(chunks, body.language, plan === "pro" ? "pro" : "mini")
  } catch (e: any) {
    console.error("[summary] AI error", e)
    return NextResponse.json({ error: "AI failed", details: e.message }, { status: 500 })
  }

  // 7) 入库 + 缓存
  const videoPayload = {
    youtube_video_id: body.videoId,
    title: body.title ?? "",
    channel: body.channel ?? "",
    summary: out.summary,
    bullets: out.bullets,
    timeline: out.timeline,
    insight: out.insight ?? null,
    language: body.language ?? "auto",
    model: plan === "pro" ? "gpt-4o-mini" : "gpt-4o-mini"
  }

  await supabaseAdmin().from("videos").upsert(videoPayload, { onConflict: "youtube_video_id,language" })
  await setCachedSummary(body.videoId, body.language, out)
  await incrQuota(user.id)
  await logUsage(user.id, body.videoId, (out._usage?.prompt ?? 0) + (out._usage?.completion ?? 0), "ai")

  return NextResponse.json({
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

async function logUsage(userId: string, videoId: string, tokens: number, source: "cache" | "ai") {
  try {
    await supabaseAdmin().from("usage_logs").insert({
      user_id: userId,
      video_id: videoId,
      tokens,
      source
    })
  } catch (e) {
    // 不要让日志失败影响主流程
  }
}
