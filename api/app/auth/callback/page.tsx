import { Suspense } from "react"
import AuthCallbackClient from "./AuthCallbackClient"

/**
 * Supabase OAuth / Email magic link callback。
 *
 * Supabase 把用户带到这里，URL 上带 ?code=xxx（或 magic link 的 token）。
 * 这一页是 server component 拿到 code 直接 render <AuthCallbackClient>，
 * 客户端组件用 @supabase/ssr 检测 session 并通过 BroadcastChannel / localStorage
 * 通知打开的扩展 tab 完成登录。
 *
 * 同时支持「Supabase 默认邮件验证」和「magic link」两种场景：
 *  - token_hash + type=email/magiclink：客户端用 verifyOtp() 兑换
 *  - code：客户端用 exchangeCodeForSession() 兑换
 */
export const dynamic = "force-dynamic"

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-white to-brand-50 px-6 text-center">
      <Suspense fallback={<p className="text-zinc-500">Completing sign-in…</p>}>
        <AuthCallbackClient />
      </Suspense>
    </main>
  )
}
