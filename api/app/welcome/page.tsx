import Link from "next/link"
import { Sparkles, Chrome } from "lucide-react"

/**
 * /welcome — Paddle Checkout success_url 目标。
 *
 * Paddle 在用户付款成功（或试用开始）后跳回这里。URL 上可能带
 *   ?subscription_id=sub_xxx&customer_id=ctm_xxx
 * 由 webhook 异步给用户开权限，所以这页只需要做一个"等一下，会员会开通"
 * 的耐心提示。
 *
 * 注意：
 *   - 不要信任 success_url 上的参数来给用户授权（webhook 才是可信源）。
 *   - 这个 page 是 server component，不带 auth。
 */

export const dynamic = "force-dynamic"

export default function WelcomePage({
  searchParams
}: {
  searchParams?: { subscription_id?: string; canceled?: string }
}) {
  const canceled = searchParams?.canceled === "1"
  const sub = searchParams?.subscription_id

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-white to-brand-50 px-6 text-center">
      <div className="max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="text-5xl">{canceled ? "↩️" : "🎉"}</div>
        <h1 className="mt-4 text-3xl font-bold">
          {canceled ? "Checkout canceled" : "Welcome aboard!"}
        </h1>
        <p className="mt-3 text-zinc-600">
          {canceled ? (
            <>
              You closed the checkout. No charge was made. You can pick a plan
              again any time.
            </>
          ) : sub ? (
            <>
              We&apos;re activating your subscription. It usually takes a few
              seconds. You can close this page and start using the extension.
            </>
          ) : (
            <>
              Thanks for subscribing. We&apos;ll send a receipt to your email
              shortly.
            </>
          )}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-white hover:bg-brand-700"
          >
            <Sparkles className="h-4 w-4" />
            Back to Home
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-5 py-2.5 text-zinc-700 hover:bg-zinc-50"
          >
            <Chrome className="h-4 w-4" />
            View Plans
          </Link>
        </div>

        {sub && (
          <p className="mt-6 break-all text-xs text-zinc-400">
            Subscription: {sub}
          </p>
        )}
      </div>
    </main>
  )
}
