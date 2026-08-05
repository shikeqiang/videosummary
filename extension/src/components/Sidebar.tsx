import { useEffect, useMemo, useRef, useState } from "react"
import { Sparkles, Clock, Languages, Copy, Check, Crown, Loader2, AlertCircle, FileText, ExternalLink } from "lucide-react"
import { fetchTranscript, type TranscriptResult } from "../lib/transcript"
import { createSummary, fetchMe, fetchUsage, getCheckoutUrl, type SummaryPayload } from "../lib/api"
import { getSession } from "../lib/supabase"
import { cn, formatTimestamp } from "../lib/utils"

type Status = "idle" | "loading-transcript" | "loading-summary" | "ready" | "error"

const LANGS = [
  { code: "auto", label: "Auto" },
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "es", label: "ES" }
] as const

export default function Sidebar() {
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null)
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [lang, setLang] = useState<typeof LANGS[number]["code"]>("auto")
  const [copied, setCopied] = useState<"summary" | "bullets" | null>(null)
  const [me, setMe] = useState<Awaited<ReturnType<typeof fetchMe>> | null>(null)
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof fetchUsage>> | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const videoIdRef = useRef<string | null>(null)

  useEffect(() => {
    let lastId: string | null = null
    const check = () => {
      const id = new URLSearchParams(location.search).get("v")
      if (id && id !== lastId) {
        lastId = id
        videoIdRef.current = id
        setSummary(null)
        setTranscript(null)
        setError(null)
        setStatus("idle")
      }
    }
    check()
    const interval = setInterval(check, 800)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    ;(async () => {
      const s = await getSession()
      setLoggedIn(!!s)
      if (s) await refreshQuota()
    })()
  }, [])

  async function refreshQuota() {
    try {
      const m = await fetchMe()
      setMe(m)
      const u = await fetchUsage()
      setUsage(u)
    } catch (e) {}
  }

  async function handleStart() {
    if (!videoIdRef.current) return
    setError(null)
    try {
      setStatus("loading-transcript")
      const t = await fetchTranscript(videoIdRef.current)
      if (!t || t.segments.length === 0) {
        throw new Error("No transcript available. Try another video with subtitles.")
      }
      setTranscript(t)

      setStatus("loading-summary")
      const s = await createSummary({
        videoId: t.videoId,
        title: t.title,
        channel: t.channel,
        language: lang === "auto" ? undefined : lang,
        transcript: t.plainText
      })
      setSummary(s)
      setStatus("ready")
      if (loggedIn) await refreshQuota()
    } catch (e: any) {
      setError(e.message ?? "Unknown error")
      setStatus("error")
    }
  }

  async function handleTranslate(target: string) {
    if (!transcript) return
    setStatus("loading-summary")
    try {
      const s = await createSummary({
        videoId: transcript.videoId,
        title: transcript.title,
        channel: transcript.channel,
        language: target,
        transcript: transcript.plainText
      })
      setSummary(s)
      setStatus("ready")
    } catch (e: any) {
      setError(e.message ?? "Translate failed")
      setStatus("error")
    }
  }

  async function handleCopy(kind: "summary" | "bullets") {
    if (!summary) return
    const text = kind === "summary" ? summary.summary : summary.bullets.join("\n- ")
    await navigator.clipboard.writeText(kind === "bullets" ? `- ${text}` : text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }

  async function handleUpgrade() {
    try {
      const { url } = await getCheckoutUrl()
      window.open(url, "_blank")
    } catch (e: any) {
      setError(e.message ?? "Checkout failed")
    }
  }

  function jumpTo(ts: number) {
    const video = document.querySelector("video") as HTMLVideoElement | null
    if (video) {
      video.currentTime = ts / 1000
      video.play()
    }
  }

  const videoTitle = useMemo(() => transcript?.title || (summary?.title ?? ""), [transcript, summary])

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-brand-600" />
          <span>YouTube AI Summary</span>
          {me?.plan === "pro" && (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <Crown className="h-3 w-3" />
              PRO
            </span>
          )}
        </div>
        {videoTitle && <div className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{videoTitle}</div>}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!summary && status !== "loading-summary" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Generate AI summary of this YouTube video in seconds.
            </p>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Output language
              </label>
              <div className="flex flex-wrap gap-1">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      lang === l.code
                        ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                    )}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleStart}
              disabled={status === "loading-transcript"}
              className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
              {status === "loading-transcript" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching transcript…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Summarize this video
                </>
              )}
            </button>
            {!loggedIn && (
              <p className="text-center text-[11px] text-zinc-400">
                <a
                  href={chrome.runtime.getURL("options.html")}
                  target="_blank"
                  className="text-brand-600 underline-offset-2 hover:underline">
                  Sign in
                </a>{" "}
                to unlock 5 free summaries / day.
              </p>
            )}
            {loggedIn && usage && (
              <p className="text-center text-[11px] text-zinc-400">
                Today: {usage.today} / {usage.limit}
              </p>
            )}
          </div>
        )}

        {status === "loading-summary" && (
          <div className="space-y-3">
            <Skeleton h="h-4 w-3/4" />
            <Skeleton h="h-3 w-full" />
            <Skeleton h="h-3 w-11/12" />
            <Skeleton h="h-3 w-4/5" />
            <div className="mt-4 space-y-2">
              <Skeleton h="h-3 w-1/2" />
              <Skeleton h="h-3 w-2/3" />
            </div>
          </div>
        )}

        {(status === "ready" || status === "error") && summary && (
          <div className="space-y-4">
            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <FileText className="h-3 w-3" />
                  Summary
                </h3>
                <button
                  onClick={() => handleCopy("summary")}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  title="Copy">
                  {copied === "summary" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{summary.summary}</p>
            </section>

            <section>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Key Points</h3>
                <button
                  onClick={() => handleCopy("bullets")}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  title="Copy">
                  {copied === "bullets" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                {summary.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>

            {summary.timeline && summary.timeline.length > 0 && (
              <section>
                <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <Clock className="h-3 w-3" />
                  Timeline
                </h3>
                <ul className="space-y-1">
                  {summary.timeline.map((t, i) => (
                    <li key={i}>
                      <button
                        onClick={() => jumpTo(t.ts)}
                        className="flex w-full items-baseline gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        <span className="shrink-0 font-mono text-[11px] text-brand-600">
                          {formatTimestamp(t.ts)}
                        </span>
                        <span className="text-zinc-700 dark:text-zinc-300">{t.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <Languages className="h-3 w-3" />
                Translate summary
              </h3>
              <div className="flex flex-wrap gap-1">
                {LANGS.filter((l) => l.code !== "auto").map((l) => (
                  <button
                    key={l.code}
                    onClick={() => handleTranslate(l.code)}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    {l.label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <footer className="border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
        {me?.plan !== "pro" && (
          <button
            onClick={handleUpgrade}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
            <Crown className="h-3.5 w-3.5" />
            Upgrade to Pro · $5/mo
          </button>
        )}
        {me?.plan === "pro" && (
          <div className="text-center text-[11px] text-zinc-400">
            <ExternalLink className="mr-1 inline h-3 w-3" />
            Manage billing via email receipts from Lemon Squeezy
          </div>
        )}
      </footer>
    </div>
  )
}

function Skeleton({ h }: { h: string }) {
  return <div className={cn("animate-pulse rounded bg-zinc-200 dark:bg-zinc-800", h)} />
}
