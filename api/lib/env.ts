/**
 * 服务端环境变量校验。
 *
 * 行为：
 *   - required(name)：缺失或为空时立即抛 `Missing required env: <name>`，
 *     让进程在启动/第一次访问时立刻挂掉，而不是带着空 key 跑出莫名 401。
 *   - optional(name, fallback)：用于有合理默认值的变量。
 *   - oneOf(name, allowed)：值必须在枚举里，否则抛错。
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
  const v = process.env[name]
  return v && v.length > 0 ? v : fallback
}

/**
 * 受限枚举校验：值必须是给定集合之一，否则抛错。
 * 用于 PADDLE_ENVIRONMENT，避免悄悄写成 "Sandbox" / "sandboxx" 等。
 */
function oneOf(name: string, allowed: readonly string[]): string {
  const v = required(name)
  if (!allowed.includes(v)) {
    throw new Error(
      `Invalid ${name}: expected one of [${allowed.join(", ")}], got "${v}"`
    )
  }
  return v
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export const ENV = {
  // ---- Supabase ----
  SUPABASE_URL: () => required("SUPABASE_URL"),
  SUPABASE_SERVICE_KEY: () => required("SUPABASE_SERVICE_KEY"),
  SUPABASE_ANON_KEY: () => required("SUPABASE_ANON_KEY"),
  SUPABASE_JWT_SECRET: () => required("SUPABASE_JWT_SECRET"),

  // ---- LLM (provider-agnostic) ----
  // LLM_PROVIDER: 强校验；写错立即抛。改 provider 只动这一个变量。
  LLM_PROVIDER: () =>
    oneOf("LLM_PROVIDER", ["openai","deepseek","dashscope","moonshot","zhipu","MiniMax"] as const),
  // LLM_API_KEY: 该 provider 的 API key
  LLM_API_KEY: () => required("LLM_API_KEY"),
  // LLM_BASE_URL: 留空则按 provider 自动填
  //   openai    → https://api.openai.com/v1
  //   deepseek  → https://api.deepseek.com/v1
  //   dashscope → https://dashscope.aliyuncs.com/compatible-mode/v1
  //   moonshot  → https://api.moonshot.cn/v1
  //   zhipu     → https://open.bigmodel.cn/api/paas/v4
  //   MiniMax   → https://api.MiniMax.chat/v1
  LLM_BASE_URL: () => optional("LLM_BASE_URL", ""),
  // 模型 alias：留空 → 用 provider 默认
  //   mini  便宜的快模型（free 用户）
  //   pro   主力模型（pro 用户）
  //   reason 推理模型（advanced 用户；deepseek 是 deepseek-reasoner）
  LLM_MODEL_MINI: () => optional("LLM_MODEL_MINI", ""),
  LLM_MODEL_PRO: () => optional("LLM_MODEL_PRO", ""),
  LLM_MODEL_REASON: () => optional("LLM_MODEL_REASON", ""),

  // ---- Upstash Redis ----
  UPSTASH_REDIS_REST_URL: () => required("UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: () => required("UPSTASH_REDIS_REST_TOKEN"),

  // ---- Paddle Billing ----
  // 强校验 "sandbox" / "live"，绝不静默默认，避免误连正式账号。
  PADDLE_ENVIRONMENT: () =>
    oneOf("PADDLE_ENVIRONMENT", ["sandbox", "live"] as const),
  // 服务器端 API key（仅服务端，绝不暴露给客户端）
  PADDLE_API_KEY: () => required("PADDLE_API_KEY"),
  // Webhook 签名 secret
  PADDLE_WEBHOOK_SECRET: () => required("PADDLE_WEBHOOK_SECRET"),
  // 客户端 token：Paddle Billing Dashboard → Developer tools → Authentication → "Client-side tokens"
  // 沙盒以 test_ 开头；生产以 live_ 开头。传给 @paddle/paddle-js 的 Paddle.Initialize。
  PADDLE_CLIENT_TOKEN: () => required("PADDLE_CLIENT_TOKEN"),
  // 六个 price ID（每个产品月付 + 年付）
  PADDLE_PRICE_STARTER_MONTHLY: () => required("PADDLE_PRICE_STARTER_MONTHLY"),
  PADDLE_PRICE_STARTER_ANNUAL: () => required("PADDLE_PRICE_STARTER_ANNUAL"),
  PADDLE_PRICE_PRO_MONTHLY: () => required("PADDLE_PRICE_PRO_MONTHLY"),
  PADDLE_PRICE_PRO_ANNUAL: () => required("PADDLE_PRICE_PRO_ANNUAL"),
  PADDLE_PRICE_ADVANCED_MONTHLY: () => required("PADDLE_PRICE_ADVANCED_MONTHLY"),
  PADDLE_PRICE_ADVANCED_ANNUAL: () => required("PADDLE_PRICE_ADVANCED_ANNUAL"),

  // ---- Site ----
  SITE_URL: () => optional("NEXT_PUBLIC_SITE_URL", "http://localhost:3000"),

  // ---- Quotas ----
  FREE_LIMIT: () => intEnv("FREE_DAILY_LIMIT", 5),
  PRO_LIMIT: () => intEnv("PRO_DAILY_LIMIT", 200),

  // ---- Optional ----
  LOG_LEVEL: () => optional("LOG_LEVEL", "info"),

  // ---- Deprecated: Lemon Squeezy ----
  // 旧实现仍保留，env vars 为可选仅为通过 typecheck；新代码不要再用。
  LS_API_KEY: () => optional("LEMONSQUEEZY_API_KEY", ""),
  LS_VARIANT_ID: () => optional("LEMONSQUEEZY_VARIANT_ID", ""),
  LS_STORE_ID: () => optional("LEMONSQUEEZY_STORE_ID", ""),
  LS_WEBHOOK_SECRET: () => optional("LEMONSQUEEZY_WEBHOOK_SECRET", "")
}

export const isProd = process.env.NODE_ENV === "production"
