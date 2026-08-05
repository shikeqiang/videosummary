import { NextRequest, NextResponse } from "next/server"

/**
 * 给 /api/* 加 CORS 头。
 *
 * 设计：
 *   - Bearer-token 鉴权，不是 cookie，所以允许 `*` 是安全的：
 *     浏览器不会自动把目标站点的 token 跨源发出，攻击者拿不到用户身份。
 *   - 暴露的 headers 默认带上 Authorization，让前端能发 Bearer。
 *   - max-age 设大减少 preflight 次数。
 *
 * 不影响的路径：
 *   - _next/static, _next/image, 静态资源 → 走 matcher 之外，不加头。
 *   - /, /pricing, /privacy 等 marketing 页面 → 同源 + 不需 CORS。
 */
export function middleware(req: NextRequest) {
  // 处理 OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders()
    })
  }

  const res = NextResponse.next()
  const headers = corsHeaders()
  for (const [k, v] of Object.entries(headers)) {
    res.headers.set(k, v)
  }
  return res
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  }
}

export const config = {
  matcher: "/api/:path*"
}
