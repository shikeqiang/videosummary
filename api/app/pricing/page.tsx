"use client"

import Link from "next/link"
import { Sparkles, Check, Crown, Loader2 } from "lucide-react"
import { useState } from "react"

/**
 * Pricing 页面。
 *
 * 订阅流程：
 *   - 浏览器没有登录态（marketing 站不做 cookie session），
 *     "Subscribe" 按钮会引导用户先去安装扩展。
 *   - 已安装扩展的用户在扩展里 sign-in 后会自动跳到 checkout，
 *     本页面的按钮只是 fallback。
 */

// Chrome Web Store 链接 — 部署前在 api/.env.local 里设 NEXT_PUBLIC_CHROME_STORE_URL
// 例: https://chrome.google.com/webstore/detail/your-extension-name/abcdefghijklmnop
const CHROME_STORE_URL =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL ||
  "https://chrome.google.com/webstore/detail/PLACEHOLDER"

export default function PricingPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubscribe() {
    setError(null)
    setBusy(true)
    try {
      // 尝试拿当前浏览器里可能存在的 Supabase session（localStorage）
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("sb-access-token") : null
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (stored) headers["Authorization"] = `Bearer ${stored}`

      const res = await fetch("/api/checkout", { method: "POST", headers })

      if (res.status === 401) {
        // 用户没在扩展里登录 → 引导安装
        window.location.href = CHROME_STORE_URL
        return
      }

      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.url) {
        throw new Error(json?.error ?? `HTTP ${res.status}`)
      }

      window.location.href = json.url
    } catch (e: any) {
      setError(e?.message ?? "Checkout failed. Please try again or install the extension first.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-brand-50/30 to-white px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900">
            <Sparkles className="h-4 w-4 text-brand-600" />
            YouTube AI Summary
          </Link>
          <h1 className="mt-4 text-4xl font-bold">Pricing</h1>
          <p className="mt-3 text-zinc-600">Simple, fair, cancel anytime.</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-8">
            <h3 className="text-xl font-bold">Free</h3>
            <div className="mt-4">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-zinc-500"> / month</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-zinc-700">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> 5 summaries / day</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> GPT-4o-mini model</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Clickable timeline</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Translate to 5 langs</li>
            </ul>
            <a
              href={CHROME_STORE_URL}
              className="mt-8 block rounded-lg border border-zinc-200 px-4 py-2.5 text-center text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              Install Free
            </a>
          </div>

          <div className="rounded-2xl border-2 border-brand-600 bg-brand-50/50 p-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Pro</h3>
              <span className="flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white">
                <Crown className="h-3 w-3" />
                MOST PICKED
              </span>
            </div>
            <div className="mt-4">
              <span className="text-4xl font-bold">$5</span>
              <span className="text-zinc-500"> / month</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-zinc-700">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> <strong>Unlimited</strong> summaries</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> GPT-4o model</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Long videos</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Priority queue</li>
            </ul>
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={busy}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Redirecting…" : "Subscribe Now"}
            </button>
            {error && (
              <p className="mt-3 text-center text-xs text-red-600">{error}</p>
            )}
            <p className="mt-3 text-center text-xs text-zinc-500">
              Powered by Lemon Squeezy · Cancel anytime
            </p>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-zinc-500">
          You&apos;ll be redirected to the Chrome Web Store if you haven&apos;t installed the extension yet.
        </p>
      </div>
    </main>
  )
}
