import type { NextRequest } from "next/server"

/**
 * 从请求头推断访客国家（服务端可见），用于 Paddle.PricePreview().
 *   - Vercel:        x-vercel-ip-country
 *   - Netlify:       x-nf-geo-country / x-country-code
 *   - Cloudflare:    cf-ipcountry
 *   - Fastly:        x-geo-country / x-country
 *
 * 返回 ISO 3166-1 alpha-2（两位大写），如 "GB"；推断不到返回 null。
 * Paddle 接收到的会是 null/undefined — Paddle.PricePreview 会自动按 IP 推断。
 *
 * 重要：不要传内部 "OTHERS" / "ZZ" 之类的哨兵给 Paddle，那是 Paddle 的保留值，会报错。
 */
export function detectCountry(req: Request | NextRequest): string | null {
  const headers =
    "headers" in req && typeof (req as any).headers.get === "function"
      ? (req as any).headers
      : null
  if (!headers) return null

  const keys = [
    "x-vercel-ip-country",
    "x-nf-geo-country",
    "x-country-code",
    "cf-ipcountry",
    "x-geo-country",
    "x-country",
    "x-appengine-country"
  ]
  for (const k of keys) {
    const v = headers.get(k)
    if (typeof v === "string" && v.length === 2) {
      const up = v.toUpperCase()
      // 过滤哨兵和 unknown / ZZ / 私有 IP 段
      if (/^[A-Z]{2}$/.test(up) && up !== "ZZ" && up !== "XX") return up
    }
  }
  return null
}
