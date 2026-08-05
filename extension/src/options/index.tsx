import { useEffect, useState } from "react"
import { Check, Crown, Loader2, LogOut, Sparkles, User } from "lucide-react"
import "../styles/globals.css"
import { ENV } from "../lib/env"
import { clearSession, getClient, getSession, saveSession } from "../lib/supabase"
import { fetchMe } from "../lib/api"

type Me = Awaited<ReturnType<typeof fetchMe>>

export default function OptionsPage() {
  const [tab, setTab] = useState<"signin" | "account">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const s = await getSession()
      if (s) {
        setLoggedIn(true)
        setTab("account")
        try {
          setMe(await fetchMe())
        } catch {}
      }
    })()
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
      setError("Extension not configured. Add SUPABASE env vars.")
      return
    }
    setBusy(true)
    try {
      const client = await getClient()
      const { data, error: err } = await client!.auth.signInWithPassword({ email, password })
      if (err) throw err
      if (!data.session) throw new Error("No session returned")
      await saveSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: data.session.user as any
      })
      setLoggedIn(true)
      setTab("account")
      setSuccess("Signed in.")
      setEmail("")
      setPassword("")
      setMe(await fetchMe())
    } catch (e: any) {
      setError(e.message ?? "Sign-in failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleSignUp() {
    setError(null)
    setSuccess(null)
    if (!email) return
    setBusy(true)
    try {
      const client = await getClient()
      const { error: err } = await client!.auth.signUp({ email, password })
      if (err) throw err
      setSuccess("Check your email to confirm. Then sign in.")
    } catch (e: any) {
      setError(e.message ?? "Sign-up failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogleSignIn() {
    setError(null)
    try {
      const client = await getClient()
      const { data, error: err } = await client!.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: chrome.runtime.getURL("options.html") }
      })
      if (err) throw err
      if (data?.url) chrome.tabs.create({ url: data.url })
    } catch (e: any) {
      setError(e.message ?? "OAuth failed")
    }
  }

  async function handleSignOut() {
    await clearSession()
    setLoggedIn(false)
    setMe(null)
    setTab("signin")
    setSuccess("Signed out.")
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-white px-5 py-8 text-zinc-900">
      <div className="mb-6 flex items-center gap-2 text-lg font-bold">
        <Sparkles className="h-5 w-5 text-brand-600" />
        YouTube AI Summary
      </div>

      {tab === "signin" && (
        <section>
          <h2 className="mb-1 text-xl font-semibold">Sign in</h2>
          <p className="mb-4 text-sm text-zinc-500">Get 5 free summaries per day.</p>

          <button
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60">
            <svg viewBox="0 0 48 48" className="h-4 w-4">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32 29.2 35 24 35c-6 0-11-5-11-11s5-11 11-11c2.9 0 5.5 1.1 7.5 3l5.7-5.7C33.6 7 29.1 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c2.9 0 5.5 1.1 7.5 3l5.7-5.7C33.6 7 29.1 5 24 5 16.3 5 9.6 9.4 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 43c5.1 0 9.6-2 13-5.2l-6-5c-2 1.4-4.5 2.2-7 2.2-5.2 0-9.6-3.4-11.3-8.1l-6.5 5C9.4 38.6 16.2 43 24 43z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6 5c4.2-3.9 6.7-9.5 6.7-16.4 0-1.2-.1-2.4-.4-3.5z"/>
            </svg>
            Continue with Google
          </button>

          <div className="my-3 flex items-center text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" />
            <span className="px-3">or</span>
            <span className="h-px flex-1 bg-zinc-200" />
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
              Sign in
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={busy}
              className="block w-full text-center text-xs text-zinc-500 hover:text-zinc-700">
              New here? Create an account
            </button>
          </form>

          {error && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>
          )}
          {success && (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">{success}</p>
          )}
        </section>
      )}

      {tab === "account" && (
        <section>
          <h2 className="mb-1 text-xl font-semibold">Account</h2>
          <p className="mb-4 text-sm text-zinc-500">Signed in. Manage your subscription below.</p>

          <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Plan</span>
              <span className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize">
                {me?.plan === "pro" ? (
                  <>
                    <Crown className="h-3 w-3 text-amber-500" /> Pro
                  </>
                ) : (
                  "Free"
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Today usage</span>
              <span className="text-sm font-mono">{me?.usageToday ?? 0} / {me?.limit ?? 5}</span>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>

          {success && (
            <p className="mt-3 flex items-center gap-1 text-xs text-emerald-700">
              <Check className="h-3 w-3" />
              {success}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
