import { NextRequest, NextResponse } from "next/server"
import { getPaddleBootstrap } from "~/lib/paddle"
import { detectCountry } from "~/lib/client-country"
import { getUserFromBearer } from "~/lib/supabase-server"

/**
 * GET /api/paddle-bootstrap
 *
 * 前端 /pricing 页面挂载时调用。
 * 返回：
 *   - environment         "sandbox" | "live"
 *   - clientToken         test_xxx / live_xxx（公开的，不是 API key）
 *   - successUrl          "/welcome"
 *   - tiers[]             三个 Tier 的全部展示信息 + price id
 *   - country             从服务端头推断；null 表示未知 → 让 Paddle 自己按 IP 算
 *   - userEmail?          已登录用户的邮箱（用于 checkout 预填），未登录则无该字段
 *
 * 安全：
 *   - PADDLE_API_KEY 永远不出现在这里（type checked @ paddle.ts）
 *   - email 仅在能 JWT-验证通过时返回
 *   - country 总是两位 ISO 3166-1 alpha-2 或 null，从不传哨兵
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  // 1. 尝试从 Bearer / cookie 拿当前用户
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null
  const user = await getUserFromBearer(token)

  // 2. 推断访客国家（Vercel / Netlify / Cloudflare 通用）
  const country = detectCountry(req)

  // 3. 装订返回内容
  const boot = getPaddleBootstrap()
  const body: Record<string, unknown> = { ...boot, country }
  if (user?.email) body.userEmail = user.email

  return NextResponse.json(body, {
    headers: {
      // 不要让 CDN 缓存（country / email 是个性化的）
      "Cache-Control": "private, no-store"
    }
  })
}
