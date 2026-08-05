import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { supabaseAdmin } from "~/lib/supabase-server"
import { verifyWebhookSignature } from "~/lib/lemonsqueezy"
import { ENV } from "~/lib/env"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Lemon Squeezy 订阅生命周期 webhook
 *
 * 事件：
 *   subscription_created   -> plan=pro
 *   subscription_updated   -> plan=pro (新状态)
 *   subscription_resumed   -> plan=pro
 *   subscription_cancelled -> plan=free (到周期结束还有效)
 *   subscription_expired   -> plan=free
 *   subscription_payment_failed -> plan=grace
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("x-signature")
  const raw = await req.text()

  if (!verifyWebhookSignature(raw, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: any
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const type: string = event?.meta?.event_name ?? ""
  const attrs = event?.data?.attributes ?? {}
  const custom = attrs?.custom_data ?? {}

  // 从 custom 里拿 user_id
  const userId: string | undefined = custom?.user_id
  const customerEmail: string = attrs?.user_email ?? ""
  const customerId: string | undefined = attrs?.customer_id ? String(attrs.customer_id) : undefined
  const subscriptionId: string | undefined = attrs?.subscription_id ? String(attrs.subscription_id) : undefined
  const status: string = attrs?.status ?? "active"

  // ---- 映射 LS 状态 -> DB ----
  const map: Record<string, string> = {
    subscription_created: "pro",
    subscription_updated: "pro",
    subscription_resumed: "pro",
    subscription_paused: "grace",
    subscription_cancelled: "cancelled",
    subscription_expired: "expired",
    subscription_payment_failed: "past_due",
    subscription_payment_success: "active"
  }

  const targetStatus = map[type]
  if (!targetStatus) {
    // 不处理的事件直接 200，否则 LS 会重试
    return NextResponse.json({ ignored: true }, { status: 200 })
  }

  const sb = supabaseAdmin()

  let actualUserId = userId
  if (!actualUserId && customerEmail) {
    const { data } = await sb.from("profiles").select("id").eq("email", customerEmail).maybeSingle()
    actualUserId = data?.id
  }
  if (!actualUserId) {
    console.warn("[ls-webhook] no user identified", { type, customerEmail })
    return NextResponse.json({ ignored: true }, { status: 200 })
  }

  // upsert subscriptions
  await sb.from("subscriptions").upsert(
    {
      user_id: actualUserId,
      lemon_customer_id: customerId ? Number(customerId) : null,
      lemon_subscription_id: subscriptionId ? Number(subscriptionId) : null,
      status: targetStatus === "pro" ? "active" : targetStatus === "cancelled" || targetStatus === "expired" ? targetStatus : targetStatus,
      ls_status: status,
      current_period_end: attrs?.renews_at ?? attrs?.ends_at ?? null,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  )

  // 更新 profiles.plan
  let planInDb: "free" | "pro" | "grace" = "free"
  if (targetStatus === "pro") planInDb = "pro"
  else if (targetStatus === "past_due" || targetStatus === "paused") planInDb = "grace"
  else planInDb = "free"

  await sb.from("profiles").update({ plan: planInDb, updated_at: new Date().toISOString() }).eq("id", actualUserId)

  return NextResponse.json({ ok: true }, { status: 200 })
}
