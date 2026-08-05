/**
 * 服务端环境变量校验。
 *
 * 行为：
 *   - required(name)：缺失或为空时立即抛 `Missing required env: <name>`，
 *     让进程在启动/第一次访问时立刻挂掉，而不是带着空 key 跑出莫名 401。
 *   - optional(name, fallback)：用于有合理默认值的变量。
 *
 * 用法：
 *   import { ENV } from "~/lib/env"
 *   const url = ENV.SUPABASE_URL()  // throws if missing
 */
function required(name: string): string {
  const v = process.env[name]
  if (!v || v.length === 0) {
    throw new Error(`Missing required env: ${name}`)
  }
  return v
}

function optional(name: string, fallback: string): string {
  return process.env[name] && process.env[name]!.length > 0
    ? process.env[name]!
    : fallback
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export const ENV = {
  // Supabase
  SUPABASE_URL: () => required("SUPABASE_URL"),
  SUPABASE_SERVICE_KEY: () => required("SUPABASE_SERVICE_KEY"),
  SUPABASE_ANON_KEY: () => required("SUPABASE_ANON_KEY"),
  SUPABASE_JWT_SECRET: () => required("SUPABASE_JWT_SECRET"),

  // OpenAI
  OPENAI_API_KEY: () => required("OPENAI_API_KEY"),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: () => required("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: () => required("UPSTASH_REDIS_REST_TOKEN"),

  // Lemon Squeezy
  LS_STORE_ID: () => required("LEMONSQUEEZY_STORE_ID"),
  LS_PRODUCT_ID: () => required("LEMONSQUEEZY_PRODUCT_ID"),
  LS_VARIANT_ID: () => required("LEMONSQUEEZY_VARIANT_ID"),
  LS_API_KEY: () => required("LEMONSQUEEZY_API_KEY"),
  LS_WEBHOOK_SECRET: () => required("LEMONSQUEEZY_WEBHOOK_SECRET"),

  // Site
  SITE_URL: () => optional("NEXT_PUBLIC_SITE_URL", "http://localhost:3000"),

  // Quotas
  FREE_LIMIT: () => intEnv("FREE_DAILY_LIMIT", 5),
  PRO_LIMIT: () => intEnv("PRO_DAILY_LIMIT", 200),

  // Optional
  LOG_LEVEL: () => optional("LOG_LEVEL", "info")
}

export const isProd = process.env.NODE_ENV === "production"
