import crypto from "node:crypto"
import { ENV } from "./env"

const LS_BASE = "https://api.lemonsqueezy.com/v1"

async function lsFetch(path: string, init: RequestInit = {}) {
  const apiKey = ENV.LS_API_KEY()
  const res = await fetch(`${LS_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.api+json",
      ...(init.headers ?? {})
    }
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`LS API ${res.status}: ${txt}`)
  }
  return res.json()
}

/**
 * 创建一次性 Checkout URL（hosted page）
 * 用户预订一个变体（$5/月订阅）
 *
 * 关键：custom data 写入 user_id，方便 webhook 收到时回查 DB
 */
export async function createCheckoutUrl(opts: {
  userId: string
  userEmail?: string
  variantId?: string
  redirectUrl?: string
}): Promise<string> {
  const variantId = opts.variantId ?? ENV.LS_VARIANT_ID()
  if (!variantId) throw new Error("Variant not configured")

  const json = await lsFetch("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
            desc: true
          },
          checkout_data: {
            email: opts.userEmail,
            custom: { user_id: opts.userId }
          },
          product_options: {
            redirect_url: opts.redirectUrl ?? `${ENV.SITE_URL()}/thanks`,
            receipt_button_text: "Go to extension",
            receipt_thank_you_note: "Welcome to YouTube AI Summary Pro!"
          }
        },
        relationships: {
          store: { data: { type: "stores", id: ENV.LS_STORE_ID() } },
          variant: { data: { type: "variants", id: variantId } }
        }
      }
    })
  })

  const url = json?.data?.attributes?.url
  if (!url) throw new Error("LS API: no checkout URL")
  return url
}

/**
 * 校验 webhook 签名
 * Lemon Squeezy 把签名放在 x-signature header，HMAC-SHA256(secret, raw_body)
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false
  const secret = ENV.LS_WEBHOOK_SECRET()
  if (!secret) return false
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex")
  // 长度相等且 constant-time 比较
  if (computed.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}
