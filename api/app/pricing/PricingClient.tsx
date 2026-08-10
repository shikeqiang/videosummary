"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { initializePaddle, type Paddle } from "@paddle/paddle-js"
import { Check, Crown, Loader2 } from "lucide-react"

/**
 * Pricing 客户端组件（'use client'）。
 *
 * 做的事（按顺序）：
 *   1. 挂载时拉 /api/paddle-bootstrap，拿 environment + clientToken + tiers + 已登录邮箱。
 *      country 由 server component 通过 defaultCountry prop 传入，不在这里再读。
 *
 *   2. 用 @paddle/paddle-js 的 initializePaddle 加载 Paddle.js SDK 并初始化。
 *      设置：
 *        - environment: sandbox | production（由 env 决定）
 *        - checkout.settings.displayMode: 'overlay'
 *        - checkout.settings.variant:    'one-page'
 *        - checkout.settings.successUrl: '/welcome'
 *
 *   3. cycle ('month' | 'year') 是用户切换的状态。每次切：
 *      对每个 tier 调用 Paddle.PricePreview 拿到 formattedTotals，
 *      **原样**展示，不做 Intl.NumberFormat、不算钱。
 *
 *   4. 点 Subscribe 调 Paddle.Checkout.open：
 *        - items: [{ priceId: 该 tier + 当前 cycle 的价格 }]
 *        - customer.email: 已登录则预填
 *        - settings.displayMode = 'overlay'（one-page 已在 Initialize 里设）
 *
 * 约束：
 *   - 服务端 API key (PADDLE_API_KEY) 永远不在这个文件 / bundle 里出现。
 *   - 金额展示只用 Paddle 的 formattedTotals，不二次格式化。
 *   - country 缺失时不传给 Paddle（让 Paddle 自己按 IP 算）。
 *   - 价格加载中显示 "—" 占位，失败显示 "—"，不停错误。
 */

import type { Tier as ApiTier, PaddleBootstrap } from "~/lib/paddle-tiers"

type Cycle = "month" | "year"
type PreviewMap = Record<string, { total: string } | undefined>

const PADDLE_ENV_MAP = { sandbox: "sandbox", live: "production" } as const

interface PricingClientProps {
  /** 来自 server component 的国家（两位 ISO），null 表示未知 */
  defaultCountry: string | null
}

export default function PricingClient({ defaultCountry }: PricingClientProps) {
  // ---- 引导状态 ----
  const [boot, setBoot] = useState<PaddleBootstrap | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  // ---- Paddle SDK 状态 ----
  const [paddle, setPaddle] = useState<Paddle | null>(null)
  const [sdkReady, setSdkReady] = useState(false)

  // ---- UI 状态 ----
  const [cycle, setCycle] = useState<Cycle>("month")
  const [previews, setPreviews] = useState<PreviewMap>({})
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busyTier, setBusyTier] = useState<string | null>(null)

  // ---- 拉取 bootstrap ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // 优先从 supabase 在扩展/网页共同使用的 localStorage 拿 token
        const stored =
          typeof window !== "undefined"
            ? window.localStorage.getItem("sb-access-token")
            : null
        const headers: Record<string, string> = { Accept: "application/json" }
        if (stored) headers.Authorization = `Bearer ${stored}`

        const res = await fetch("/api/paddle-bootstrap", { headers })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
        if (cancelled) return
        setBoot(json)
        if (typeof json.userEmail === "string" && json.userEmail.length > 0) {
          setUserEmail(json.userEmail)
        }
      } catch (e: any) {
        if (!cancelled)
          setBootError(e?.message ?? "Failed to load checkout configuration.")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ---- 初始化 Paddle.js SDK ----
  useEffect(() => {
    if (!boot) return
    let cancelled = false
    ;(async () => {
      try {
        const env = PADDLE_ENV_MAP[boot.environment]
        const p = await initializePaddle({
          token: boot.clientToken,
          environment: env,
          checkout: {
            settings: {
              displayMode: "overlay",
              variant: "one-page",
              successUrl: `${window.location.origin}${boot.successUrl}`
            }
          }
        })
        if (cancelled) return
        if (!p) throw new Error("Paddle.js failed to initialize")
        setPaddle(p)
        setSdkReady(true)
      } catch (e: any) {
        if (!cancelled) setBootError(e?.message ?? "Paddle.js init failed")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [boot])

  // ---- 每次 cycle 切换或 SDK 就绪时，刷新预览 ----
  useEffect(() => {
    if (!paddle || !boot) return
    let cancelled = false

    const tiers = boot.tiers as ApiTier[]
    const address = defaultCountry ? { countryCode: defaultCountry } : undefined
    const priceIds = tiers.map((t) => t.priceIds[cycle])

    ;(async () => {
      setPreviewError(null)
      setPreviews({})
      try {
        const resp = await paddle.PricePreview({
          items: priceIds.map((priceId) => ({ priceId, quantity: 1 })),
          ...(address ? { address } : {})
        })
        if (cancelled) return
        const map: PreviewMap = {}
        resp.data.details.lineItems.forEach((li, i) => {
          map[priceIds[i]] = { total: li.formattedTotals.total }
        })
        setPreviews(map)
      } catch (e: any) {
        if (!cancelled) {
          setPreviewError(e?.message ?? "Price preview failed")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [paddle, boot, cycle, defaultCountry])

  // ---- Subscribe ----
  const handleSubscribe = useCallback(
    async (tier: ApiTier) => {
      if (!paddle) return
      const priceId = tier.priceIds[cycle]
      setBusyTier(tier.slug)
      try {
        paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          ...(userEmail
            ? { customer: { email: userEmail } }
            : {}),
          settings: {
            displayMode: "overlay",
            variant: "one-page",
            successUrl: `${window.location.origin}/welcome`
          },
          customData: {
            tier_slug: tier.slug,
            cycle
          }
        })
      } catch (e: any) {
        // Paddle 会自己显示错误 UI，这里不二次弹窗
        console.error("[pricing] Checkout.open failed", e)
      } finally {
        // Checkout overlay 关闭/完成后释放 busy 状态
        setTimeout(() => setBusyTier(null), 1000)
      }
    },
    [paddle, cycle, userEmail]
  )

  const monthlySavingsHint = useMemo(() => {
    if (cycle !== "year" || !boot) return null
    // 仅文案提示，不做算术 — 实际折扣由 Paddle 显示
    return "Save with annual billing"
  }, [cycle, boot])

  // ---- 渲染 ----
  if (bootError) {
    return (
      <div className="mt-12 rounded-lg border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        Checkout configuration failed to load: {bootError}
        <br />
        <span className="text-xs text-red-600">
          Make sure PADDLE_ENVIRONMENT and PADDLE_CLIENT_TOKEN are set.
        </span>
      </div>
    )
  }

  if (!boot) {
    return (
      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-72 animate-pulse rounded-2xl border border-zinc-200 bg-white"
          />
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Monthly / Yearly toggle */}
      <div className="mt-10 flex justify-center">
        <div
          role="tablist"
          aria-label="Billing cycle"
          className="inline-flex rounded-full border border-zinc-200 bg-white p-1 text-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "month"}
            onClick={() => setCycle("month")}
            className={
              "rounded-full px-5 py-1.5 transition " +
              (cycle === "month"
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900")
            }
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cycle === "year"}
            onClick={() => setCycle("year")}
            className={
              "rounded-full px-5 py-1.5 transition " +
              (cycle === "year"
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900")
            }
          >
            Yearly
          </button>
        </div>
      </div>

      {monthlySavingsHint && (
        <p className="mt-3 text-center text-xs text-emerald-600">
          {monthlySavingsHint}
        </p>
      )}

      {previewError && (
        <p className="mt-4 text-center text-xs text-red-600">
          Price preview failed: {previewError}
        </p>
      )}

      {/* Tier cards */}
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {boot.tiers.map((tier) => {
          const priceId = tier.priceIds[cycle]
          const preview = previews[priceId]
          const isBusy = busyTier === tier.slug
          return (
            <div
              key={tier.slug}
              className={
                "relative rounded-2xl border bg-white p-8 " +
                (tier.popular
                  ? "border-2 border-brand-600 shadow-lg shadow-brand-600/10"
                  : "border border-zinc-200")
              }
            >
              {tier.popular && (
                <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-amber-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  <Crown className="h-3 w-3" />
                  Most popular
                </span>
              )}
              <h3 className="text-xl font-bold">{tier.name}</h3>
              <p className="mt-2 min-h-[3rem] text-sm text-zinc-600">
                {tier.description}
              </p>

              <div className="mt-5 min-h-[3.5rem]">
                {!sdkReady ? (
                  <div className="text-3xl font-bold text-zinc-300">—</div>
                ) : preview ? (
                  <>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{preview.total}</span>
                      <span className="text-sm text-zinc-500">
                        /{cycle === "month" ? "month" : "year"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      7-day free trial · cancel anytime
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading price…</span>
                  </div>
                )}
              </div>

              <ul className="mt-6 space-y-2 text-sm text-zinc-700">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleSubscribe(tier)}
                disabled={!sdkReady || isBusy}
                className={
                  "mt-8 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 " +
                  (tier.popular
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "border border-zinc-200 text-zinc-800 hover:bg-zinc-50")
                }
              >
                {isBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Opening…
                  </>
                ) : (
                  <>Subscribe</>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* 邮箱预填提示（仅在已登录时显示） */}
      {userEmail && (
        <p className="mt-6 text-center text-xs text-zinc-500">
          Checkout will prefill <strong>{userEmail}</strong>
        </p>
      )}
    </>
  )
}
