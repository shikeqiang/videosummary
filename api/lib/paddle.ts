import crypto from "node:crypto"
import { ENV } from "./env"
import { TIERS, type PaddleBootstrap } from "./paddle-tiers"

/**
 * Paddle Billing 服务端封装
 *
 * https://developer.paddle.com/api-reference/overview
 *
 * 两个职责：
 *   1. 服务端 — 创建 hosted checkout URL（给扩展用）
 *   2. 服务端 — 提供给前端页面的"引导配置"（环境 + client token + tier 元数据），
 *      走专门 API 路由，绝不把 PADDLE_API_KEY 漏到客户端。
 */

const PADDLE_CHECKOUT_HOSTS = {
  sandbox: "https://sandbox-buy.paddle.com",
  live: "https://buy.paddle.com"
}

export type PaddleEnv = "sandbox" | "live"

export function getPaddleEnv(): PaddleEnv {
  // env.ts 已用 oneOf 限定取值，到这里一定是 "sandbox" | "live"
  return ENV.PADDLE_ENVIRONMENT() as PaddleEnv
}

/**
 * 返回前端初始化 Paddle.js 时所需的引导数据。
 *
 * 必须由服务端 API 路由调用并通过 JSON 返回，**绝不**直接传给客户端组件。
 * 因为 PADDLE_API_KEY 不能出现，但 PADDLE_CLIENT_TOKEN 是公开的，可以传。
 */
export function getPaddleBootstrap(): PaddleBootstrap {
  return {
    environment: getPaddleEnv(), // "sandbox" | "live"
    clientToken: ENV.PADDLE_CLIENT_TOKEN(),
    successUrl: successUrl(),
    tiers: TIERS
  }
}

/**
 * success_url 的来源：env 里的 NEXT_PUBLIC_SITE_URL。
 * /welcome 是用户付款成功后的目标页（Paddle 跳回）。
 */
export function successUrl(): string {
  return `${ENV.SITE_URL()}/welcome`
}

/**
 * 构造 Paddle 托管 checkout URL（扩展用的 fallback 入口）
 *
 * 文档：https://developer.paddle.com/build/checkout/build-overlay-checkout
 */
export async function createCheckoutUrl(opts: {
  userId: string
  userEmail?: string
  priceId?: string
}): Promise<string> {
  const env = getPaddleEnv()
  // 默认走 Pro 月付（向后兼容：扩展未指明价格时仍可用）
  const priceId = opts.priceId ?? ENV.PADDLE_PRICE_PRO_MONTHLY()
  if (!priceId) throw new Error("Paddle price ID not configured")

  const params = new URLSearchParams()
  params.set("custom_data[user_id]", opts.userId)
  if (opts.userEmail) params.set("custom_data[email]", opts.userEmail)
  params.set(
    "passthrough",
    JSON.stringify({
      user_id: opts.userId,
      source: "chrome_extension",
      plan: "pro_monthly"
    }).slice(0, 1000)
  )
  params.set("quantity", "1")
  params.set("success_url", successUrl())
  params.set("cancel_url", `${ENV.SITE_URL()}/pricing?canceled=1`)

  return `${PADDLE_CHECKOUT_HOSTS[env]}/checkout/${priceId}?${params.toString()}`
}

/**
 * 校验 Paddle webhook 签名
 *
 * Paddle-Signature header 格式：
 *   ts=1234567890;h1=abc123def456...
 *
 * 验证步骤：
 *   1. 解析 ts 和 h1
 *   2. 拼 `${ts}.${rawBody}` 字符串
 *   3. 用 signing_secret 做 HMAC-SHA256
 *   4. 常量时间比较 h1
 *   5. 校验 ts 不能太旧（防重放攻击，5 分钟容忍）
 *
 * 文档：https://developer.paddle.com/webhooks/verifying-webhooks
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): { valid: boolean; ts?: string; reason?: string } {
  if (!signatureHeader) return { valid: false, reason: "no signature header" }

  const secret = ENV.PADDLE_WEBHOOK_SECRET()
  if (!secret) return { valid: false, reason: "PADDLE_WEBHOOK_SECRET not configured" }

  const parts: Record<string, string> = {}
  for (const part of signatureHeader.split(";")) {
    const [k, v] = part.split("=")
    if (k && v) parts[k.trim()] = v.trim()
  }
  const ts = parts.ts
  const h1 = parts.h1
  if (!ts || !h1) return { valid: false, reason: "missing ts or h1 in signature header" }

  const tsNum = parseInt(ts, 10)
  if (!Number.isFinite(tsNum)) return { valid: false, reason: "invalid ts (not a number)" }
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - tsNum) > 300) {
    return { valid: false, reason: `ts too old (${Math.abs(nowSec - tsNum)}s drift, max 300s)` }
  }

  // Paddle 官方签名格式：ts=<timestamp>:<body>
  //   https://developer.paddle.com/webhooks/signature-verification
  const toSign = `ts=${ts}:${rawBody}`
  const expected = crypto.createHmac("sha256", secret).update(toSign, "utf8").digest("hex")

  if (expected.length !== h1.length) return { valid: false, reason: "hmac length mismatch" }
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ h1.charCodeAt(i)
  }
  if (diff !== 0) return { valid: false, reason: "hmac mismatch" }

  return { valid: true, ts }
}

/**
 * Paddle subscription.status → 我们 DB 状态映射
 *
 * Paddle 状态值：active | trialing | past_due | canceled | paused
 * DB 状态枚举：active | on_trial | past_due | paused | unpaid | cancelled | expired | grace
 * profile.plan：free | pro | grace
 */
export function mapSubscriptionStatus(paddleStatus: string): {
  dbStatus: "active" | "on_trial" | "past_due" | "paused" | "cancelled" | "expired" | "grace"
  plan: "free" | "pro" | "grace"
} {
  switch (paddleStatus) {
    case "active":
      return { dbStatus: "active", plan: "pro" }
    case "trialing":
      return { dbStatus: "on_trial", plan: "pro" }
    case "past_due":
      return { dbStatus: "past_due", plan: "grace" }
    case "paused":
      return { dbStatus: "paused", plan: "grace" }
    case "canceled":
      return { dbStatus: "cancelled", plan: "free" }
    default:
      return { dbStatus: "grace", plan: "grace" }
  }
}
