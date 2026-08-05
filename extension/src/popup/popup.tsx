import { Sparkles, ArrowRight, AlertCircle } from "lucide-react"
import { useEffect, useState } from "react"

export function Popup() {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chrome.tabs?.query) {
      setError("Not running as an extension.")
      return
    }
    chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => setTab(t))
  }, [])

  const isYT = tab?.url?.includes("youtube.com/watch")

  function openYT() {
    chrome.tabs.create({ url: "https://www.youtube.com/" })
  }

  function openOptions() {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage()
    else window.open(chrome.runtime.getURL("options.html"))
  }

  return (
    <div className="w-72 p-4 bg-white text-zinc-900">
      <header className="flex items-center gap-2 text-base font-semibold">
        <Sparkles className="h-4 w-4 text-brand-600" />
        YouTube AI Summary
      </header>
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </div>
      )}
      {!error && (
        <div className="mt-3 space-y-2 text-sm text-zinc-700">
          {isYT ? (
            <>
              <p className="text-xs text-zinc-500">
                Sidebar is injected on this page. Look for it on the right side.
              </p>
              <a href={tab?.url} target="_blank" className="block truncate text-xs text-brand-600 underline-offset-2 hover:underline">
                {tab?.title}
              </a>
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-500">Open a YouTube video to use this extension.</p>
              <button
                onClick={openYT}
                className="flex w-full items-center justify-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                Open YouTube <ArrowRight className="h-3 w-3" />
              </button>
            </>
          )}
          <button
            onClick={openOptions}
            className="mt-2 block w-full rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50">
            Sign in / Account
          </button>
        </div>
      )}
    </div>
  )
}
