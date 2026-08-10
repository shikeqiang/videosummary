import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "~/lib/supabase-server"
import { verifyWebhookSignature, mapSubscriptionStatus, getPaddleEnv } from "~/lib/paddle"

/**
 * Paddle webhook 处理器
 *
 * 接收 Paddle 订阅生命周期事件，更新 Supabase subscriptions + profiles 表。
 *
 * 事件（只处理 subscription.*，其余忽略）：
 *   subscription.created   → 新订阅，plan=pro
 *   subscription.updated   → 状态变化（续费、付款失败等）
 *   subscription.canceled  → 用户取消，到期不续（仍可用到期为止）
 *   subscription.paused    → 暂停
 *   subscription.resumed   → 恢复
 *
 * 安全：
 *   - 验签（HMAC-SHA256，ts 防重放）
 *   - 必须有 user_id（通过 custom_data 传）
 *   - 所有事件 200 返回（Paddle webhook 重试机制）
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface PaddleSubscriptionEvent {
  event_id: string
  event_type: string
  occurred_at: string
  notification_id?: string
  data: {
    id: string                                  // sub_xxx
    status: string                              // active, trialing, past_due, canceled, paused
    customer_id: string                         // ctm_xxx
    custom_data?: {
      user_id?: string
      email?: string
    }
    current_billing_period?: {
      starts_at?: string
      ends_at?: string
    }
    next_billed_at?: string
    scheduled_change?: {
      action: string                            // "cancel" | "pause" | "resume"
      effective_at: string
    }
    items?: Array<{
      price?: { id?: string }
      quantity?: number
    }>
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sigHeader = req.headers.get("Paddle-Signature")
  const env = getPaddleEnv()

  // 1. 验签
  const v = verifyWebhookSignature(rawBody, sigHeader)
  if (!v.valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // 2. 解析 payload
  let event: PaddleSubscriptionEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventType = event.event_type
  const data = event.data
  const userId = data.custom_data?.user_id
  const paddleSubId = data.id
  const paddleCustomerId = data.customer_id
  const paddleStatus = data.status
  const periodEnd =
    data.current_billing_period?.ends_at ??
    data.next_billed_at ??
    null

  console.log(
    `[paddle-webhook] env=${env} event=${eventType} status=${paddleStatus}` +
    ` user=${userId ?? "?"} sub=${paddleSubId}`
  )

  // 3. 只处理 subscription.* 事件
  if (!eventType.startsWith("subscription.")) {
    return NextResponse.json(
      { ignored: true, reason: "not a subscription event" },
      { status: 200 }
    )
  }

  // 4. user_id 缺失 → 无法关联用户，安全忽略
  if (!userId) {
    console.warn(`[paddle-webhook] missing user_id in custom_data, dropping`)
    return NextResponse.json(
      { ignored: true, reason: "no user_id in custom_data" },
      { status: 200 }
    )
  }

  // 5. 状态映射
  const mapped = mapSubscriptionStatus(paddleStatus)

  // 6. upsert subscriptions 表
  const sb = supabaseAdmin()
  const { error: subErr } = await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      paddle_subscription_id: paddleSubId,
      paddle_customer_id: paddleCustomerId,
      status: mapped.dbStatus,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  )
  if (subErr) {
    console.error(`[paddle-webhook] subscriptions upsert failed:`, subErr)
    // 返回 500 让 Paddle 重试
    return NextResponse.json({ error: "DB write failed" }, { status: 500 })
  }

  // 7. 更新 profiles.plan
  const { error: profErr } = await sb.from("profiles")
    .update({ plan: mapped.plan, updated_at: new Date().toISOString() })
    .eq("id", userId)
  if (profErr) {
    console.error(`[paddle-webhook] profiles update failed:`, profErr)
    return NextResponse.json({ error: "profile update failed" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    env,
    eventType,
    paddleStatus,
    dbStatus: mapped.dbStatus,
    plan: mapped.plan
  })
}
