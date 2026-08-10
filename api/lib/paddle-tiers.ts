import { ENV } from "./env"

/**
 * 套餐 / Tier 数据模型
 *
 * 设计原则：
 *   - 后端拥有"价格 ID 与名字"的映射（基于 env vars），
 *     客户端组件从不直接解析 pri_xxx，前端只拿到 slug。
 *   - description / features 都在这里集中写，改文案只改这一个文件。
 *   - popular 字段控制"最受欢迎"标签的位置。
 */

export type TierName = "Starter" | "Pro" | "Advanced"
export type TierSlug = "starter" | "pro" | "advanced"
export type BillingCycle = "month" | "year"

export interface Tier {
  /** 展示名（首字母大写） */
  name: TierName
  /** URL-safe slug，写进 Paddle custom_data 用 */
  slug: TierSlug
  /** 套餐简介（一句话） */
  description: string
  /** 卖点 bullet（最多 6 条） */
  features: string[]
  /** Paddle price ID，按计费周期 */
  priceIds: Record<BillingCycle, string>
  /** 是否标记为推荐（在 Pro 上打开） */
  popular?: boolean
}

/** 服务端"引导"配置：给前端 Paddle.Initialize 用 */
export interface PaddleBootstrap {
  /** "sandbox" | "live" — 由 PADDLE_ENVIRONMENT 决定 */
  environment: PaddleEnvString
  /** 客户端 token，@paddle/paddle-js 的 Paddle.Initialize({ token }) */
  clientToken: string
  /** Checkout 成功后的跳转 URL（绝对地址，Paddle 用 success_url 参数） */
  successUrl: string
  /** 全部套餐配置 */
  tiers: readonly Tier[]
}

export type PaddleEnvString = "sandbox" | "live"

/**
 * 把当前环境变量里的 price id 映射到 tier 上。
 *
 * 任何一个 env 缺失都会抛错（env.ts 的 required()），所以到这一步一定都有值。
 */
export const TIERS: readonly Tier[] = [
  {
    name: "Starter",
    slug: "starter",
    description: "For casual viewers who want smarter recaps.",
    features: [
      "30 summaries / day",
      "AI summarizer (Lite)",
      "Clickable timeline",
      "Translate to 5 langs"
    ],
    priceIds: {
      month: ENV.PADDLE_PRICE_STARTER_MONTHLY(),
      year: ENV.PADDLE_PRICE_STARTER_ANNUAL()
    }
  },
  {
    name: "Pro",
    slug: "pro",
    description: "For power users & creators who summarize often.",
    features: [
      "Unlimited summaries",
      "AI summarizer (Pro)",
      "Long videos (2h+)",
      "Priority queue",
      "Export to Markdown"
    ],
    priceIds: {
      month: ENV.PADDLE_PRICE_PRO_MONTHLY(),
      year: ENV.PADDLE_PRICE_PRO_ANNUAL()
    },
    popular: true
  },
  {
    name: "Advanced",
    slug: "advanced",
    description: "For teams & heavy research workflows.",
    features: [
      "Everything in Pro",
      "AI summarizer + Reasoning model",
      "Bulk URL import (up to 50)",
      "Custom prompt templates",
      "Priority email support"
    ],
    priceIds: {
      month: ENV.PADDLE_PRICE_ADVANCED_MONTHLY(),
      year: ENV.PADDLE_PRICE_ADVANCED_ANNUAL()
    }
  }
] as const

/**
 * 按 slug 取 tier，找不到抛错（应该不会发生，是开发期保护）。
 */
export function getTierBySlug(slug: string): Tier {
  const t = TIERS.find((x) => x.slug === slug)
  if (!t) throw new Error(`Unknown tier slug: ${slug}`)
  return t
}
