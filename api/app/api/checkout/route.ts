import { NextRequest, NextResponse } from "next/server"
import { getUserFromBearer } from "~/lib/supabase-server"
import { createCheckoutUrl } from "~/lib/paddle"

/**
 * 创建 Paddle checkout URL 并返回给前端
 *
 * 前端流程（extension/src/lib/api.ts）：
 *   1. POST /api/checkout (Bearer token)
 *   2. 拿到 { url }，window.open(url, "_blank") 跳转到 Paddle 托管页
 *   3. 用户在 Paddle 页付款
 *   4. Paddle 跳回 our /thanks
 *   5. webhook 异步到达 /api/webhooks/paddle 更新 DB
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  // 1. 鉴权
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null
  const user = await getUserFromBearer(token)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. 构造 Paddle checkout URL
  try {
    const url = await createCheckoutUrl({
      userId: user.id,
      userEmail: user.email
    })
    return NextResponse.json({ url })
  } catch (e: any) {
    console.error("[checkout] Paddle error", e)
    return NextResponse.json(
      { error: "Checkout failed", details: e.message },
      { status: 500 }
    )
  }
}
