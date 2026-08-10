import { headers } from "next/headers"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import PricingClient from "./PricingClient"

/**
 * Pricing 页（server component）
 *
 * 职责：
 *   1. 从请求头推断访客国家（Vercel / Netlify / Cloudflare 通用）。
 *      推断不到时返回 null → 客户端不会把它传给 Paddle，
 *      让 Paddle.PricePreview 按浏览器 IP 自动判断。
 *   2. 把 country 作为 prop 传给 client component。
 *
 * 不在这里做任何客户端 SDK 调用，避免泄漏 PADDLE_API_KEY。
 */

export const dynamic = "force-dynamic"

const COUNTRY_HEADERS = [
  "x-vercel-ip-country",
  "x-nf-geo-country",
  "x-country-code",
  "cf-ipcountry",
  "x-geo-country",
  "x-country",
  "x-appengine-country"
] as const

function detectCountry(): string | null {
  let h: Headers
  try {
    h = headers()
  } catch {
    return null
  }
  for (const k of COUNTRY_HEADERS) {
    const v = h.get(k)
    if (typeof v === "string" && v.length === 2) {
      const up = v.toUpperCase()
      if (/^[A-Z]{2}$/.test(up) && up !== "ZZ" && up !== "XX") return up
    }
  }
  return null
}

export default function PricingPage() {
  const defaultCountry = detectCountry()

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-brand-50/30 to-white px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900"
          >
            <Sparkles className="h-4 w-4 text-brand-600" />
            YouTube AI Summary
          </Link>
          <h1 className="mt-4 text-4xl font-bold">Pricing</h1>
          <p className="mt-3 text-zinc-600">
            Simple, fair, cancel anytime. 7-day free trial on every plan.
          </p>
        </div>

        <PricingClient defaultCountry={defaultCountry} />

        <p className="mt-12 text-center text-xs text-zinc-500">
          Prices shown in your local currency where available. Tax (VAT/GST)
          calculated by Paddle at checkout.
        </p>
      </div>
    </main>
  )
}
