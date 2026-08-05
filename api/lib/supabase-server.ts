import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import crypto from "node:crypto"
import { ENV } from "./env"

/**
 * 后端 Supabase admin client（service_role，绕过 RLS）
 * 仅服务端可用，绝不能 import 到前端代码
 */
let _admin: SupabaseClient | null = null
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  _admin = createClient(ENV.SUPABASE_URL(), ENV.SUPABASE_SERVICE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  return _admin
}

// ----- JWT 本地校验（取代 supabase.auth.getUser 的 HTTP 调用） -----

type SupabaseClaims = {
  sub: string
  email?: string
  exp?: number
  role?: string
  aud?: string | string[]
}

/**
 * Supabase access token 是 HS256 JWT，secret = SUPABASE_JWT_SECRET。
 * 本地校验：拆 header.payload.signature，HMAC-SHA256 验签，解析 claims。
 *
 * 比 supabase.auth.getUser() 快 ~50-100ms（无网络往返）。
 */
function verifySupabaseJwt(token: string): SupabaseClaims | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, sigB64] = parts

  // 验签
  let expected: Buffer
  let actual: Buffer
  try {
    const secret = ENV.SUPABASE_JWT_SECRET()
    expected = crypto.createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest()
    actual = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  } catch {
    return null
  }
  if (expected.length !== actual.length) return null
  if (!crypto.timingSafeEqual(expected, actual)) return null

  // 解析 payload
  let claims: any
  try {
    const payloadJson = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    claims = JSON.parse(payloadJson)
  } catch {
    return null
  }
  if (typeof claims.sub !== "string") return null
  if (typeof claims.exp === "number" && claims.exp < Math.floor(Date.now() / 1000)) return null

  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    exp: typeof claims.exp === "number" ? claims.exp : undefined,
    role: typeof claims.role === "string" ? claims.role : undefined,
    aud: claims.aud
  }
}

/**
 * 从 Bearer token 解析当前用户
 * 返回 { id, email } 或 null（无效/过期/未提供）
 */
export async function getUserFromBearer(token: string | null): Promise<{
  id: string
  email: string
} | null> {
  if (!token) return null
  const claims = verifySupabaseJwt(token)
  if (!claims) return null
  return {
    id: claims.sub,
    email: claims.email ?? ""
  }
}
