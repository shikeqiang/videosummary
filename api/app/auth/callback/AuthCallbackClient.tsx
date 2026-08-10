"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

/**
 * 客户端 Supabase 客户端：把 session 写到 localStorage
 * 这样扩展同一个 origin 共享一个 supabase-js client 能读到这个 session。
 *
 * ⚠️ 这个页面是给「网页 + 同 origin 的扩展」用的。
 *    扩展 tab（chrome-extension://<id>/options.html）不属于这个 origin，
 *    session 不会自动同步过去；之后用 postMessage / chrome.storage 桥接。
 */
function getClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function AuthCallbackClient() {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading")
  const [msg, setMsg] = useState("Completing sign-in…")
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const code = params.get("code")
    const tokenHash = params.get("token_hash")
    const type = params.get("type") as
      | "email"
      | "magiclink"
      | "signup"
      | "recovery"
      | "invite"
      | "email_change"
      | null

    ;(async () => {
      try {
        const supa = getClient()
        if (code) {
          // OAuth / PKCE 路径
          const { error } = await supa.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else if (tokenHash && type) {
          // 邮件验证 / magic link 路径
          const { error } = await supa.auth.verifyOtp({ token_hash: tokenHash, type })
          if (error) throw error
        } else {
          throw new Error(
            "Missing ?code or ?token_hash in URL. Make sure Supabase Auth URL Configuration includes this site."
          )
        }
        setStatus("ok")
        setMsg("✓ Signed in! You can close this tab and return to the extension.")
        // 5 秒后回首页（如果用户没关）
        setTimeout(() => router.replace("/"), 5000)
      } catch (e: any) {
        setStatus("error")
        setMsg(e?.message ?? "Sign-in failed")
      }
    })()
  }, [params, router])

  return (
    <div className="max-w-md rounded-2xl bg-white p-8 shadow-xl">
      <div className="text-5xl">
        {status === "loading" ? "⏳" : status === "ok" ? "✅" : "❌"}
      </div>
      <h1 className="mt-4 text-2xl font-bold">
        {status === "ok" ? "Welcome aboard!" : status === "error" ? "Sign-in failed" : "Completing sign-in…"}
      </h1>
      <p className="mt-3 text-sm text-zinc-600">{msg}</p>

      {status === "error" && (
        <p className="mt-4 text-xs text-zinc-500">
          Check the Supabase URL Configuration includes{" "}
          <code>https://videosummary-api.vercel.app/auth/callback</code>.
        </p>
      )}
    </div>
  )
}
