import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { ENV } from "~/lib/env"

/**
 * 仅 dev 用：返回 PADDLE_WEBHOOK_SECRET 的 SHA256 哈希（不是明文）
 * + 前 4 字符 + 后 4 字符 + 字节 hex 头
 *
 * 用法：
 *   1. 本地：
 *      node -e 'console.log(require("crypto").createHash("sha256").update(process.env.PADDLE_WEBHOOK_SECRET).digest("hex"))'
 *   2. Vercel:
 *      curl -s https://videosummary-api.vercel.app/api/_debug/webhook-secret
 *   3. 两个 hash 对比，相同 → secret 字符串完全一致
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  if (ENV.PADDLE_ENVIRONMENT() === "live") {
    return NextResponse.json({ error: "disabled in live" }, { status: 404 })
  }
  const secret = ENV.PADDLE_WEBHOOK_SECRET()
  const hash = crypto.createHash("sha256").update(secret).digest("hex")
  return NextResponse.json({
    env: ENV.PADDLE_ENVIRONMENT(),
    sha256: hash,
    length: secret.length,
    preview: `${secret.slice(0, 4)}…${secret.slice(-4)}`,
    bytes: Buffer.from(secret).toString("hex").slice(0, 32) + "…"
  })
}
