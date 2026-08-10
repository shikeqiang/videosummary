import Link from "next/link"
import { Sparkles, Clock, Languages, Shield, Zap, Copy, Crown } from "lucide-react"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-brand-50/30 to-white">
      {/* Header */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-bold">
          <Sparkles className="h-5 w-5 text-brand-600" />
          <span>YouTube AI Summary</span>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="#features" className="text-zinc-600 hover:text-zinc-900">Features</Link>
          <Link href="#pricing" className="text-zinc-600 hover:text-zinc-900">Pricing</Link>
          <Link href="#install" className="text-zinc-600 hover:text-zinc-900">Install</Link>
          <a
            href="https://chrome.google.com/webstore"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700">
            Add to Chrome
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">
          Summarize any YouTube video in <span className="text-brand-600">5 seconds</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600">
          Skip the watch. Get AI-powered summaries with key points, a clickable timeline,
          and translation into 5+ languages — right inside YouTube.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <a
            href="https://chrome.google.com/webstore"
            className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
            Install Free
          </a>
          <Link
            href="#pricing"
            className="rounded-lg border border-zinc-200 px-6 py-3 font-semibold text-zinc-700 hover:bg-zinc-50">
            See Pricing
          </Link>
        </div>
        <p className="mt-4 text-sm text-zinc-500">5 free summaries / day · No credit card required</p>
      </section>

      {/* Screenshot mock */}
      <section className="mx-auto max-w-5xl px-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl">
          <div className="flex gap-3">
            <div className="aspect-video flex-1 rounded-md bg-zinc-100" />
            <div className="w-80 space-y-2 rounded-md border border-zinc-200 p-3">
              <div className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
                <Sparkles className="h-3 w-3" /> SUMMARY
              </div>
              <div className="h-3 w-3/4 rounded bg-zinc-200" />
              <div className="h-3 w-full rounded bg-zinc-200" />
              <div className="h-3 w-11/12 rounded bg-zinc-200" />
              <div className="mt-3 h-3 w-1/2 rounded bg-zinc-200" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="text-center text-3xl font-bold">Why YouTube AI Summary</h2>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            { Icon: Zap, title: "5-second summaries", desc: "Powered by GPT-4. One click. No waiting." },
            { Icon: Clock, title: "Clickable timeline", desc: "Jump to any moment in the video that matters." },
            { Icon: Languages, title: "Translate to 5+ languages", desc: "Watch Japanese videos with English summaries." },
            { Icon: Copy, title: "Export to Notion / Slack / Obsidian", desc: "One click. Plain text always." },
            { Icon: Shield, title: "Privacy-first", desc: "No transcripts stored on our servers." },
            { Icon: Crown, title: "$5/mo Pro", desc: "Unlimited summaries. Stronger models. Longer videos." }
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-zinc-200 p-5 hover:border-brand-300">
              <Icon className="mb-3 h-6 w-6 text-brand-600" />
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-zinc-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Pricing</h2>
        <p className="mt-3 text-center text-zinc-600">Simple. Cancel anytime.</p>
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 p-8">
            <h3 className="text-xl font-bold">Free</h3>
            <div className="mt-4">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-zinc-500"> / month</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-zinc-700">
              <li>✅ 5 summaries / day</li>
              <li>✅ GPT-4o-mini model</li>
              <li>✅ Clickable timeline</li>
              <li>✅ Translate to 5 languages</li>
              <li>❌ Longer videos (&gt;30 min)</li>
              <li>❌ Priority queue</li>
            </ul>
          </div>
          <div className="relative rounded-2xl border-2 border-brand-600 bg-brand-50/30 p-8">
            <span className="absolute right-4 top-4 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
              POPULAR
            </span>
            <h3 className="text-xl font-bold">Pro</h3>
            <div className="mt-4">
              <span className="text-4xl font-bold">$5</span>
              <span className="text-zinc-500"> / month</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-zinc-700">
              <li>✅ <strong>Unlimited</strong> summaries</li>
              <li>✅ Stronger model (GPT-4o)</li>
              <li>✅ Clickable timeline</li>
              <li>✅ 5+ languages</li>
              <li>✅ Long videos supported</li>
              <li>✅ Priority generation queue</li>
            </ul>
            <a
              href="https://your-checkout.lemonsqueezy.com"
              className="mt-8 block rounded-lg bg-brand-600 px-4 py-2.5 text-center font-semibold text-white hover:bg-brand-700">
              Subscribe via Lemon Squeezy
            </a>
          </div>
        </div>
      </section>

      {/* Install */}
      <section id="install" className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold">Install in 30 seconds</h2>
        <ol className="mx-auto mt-8 max-w-md space-y-3 text-left text-sm text-zinc-700">
          <li className="flex gap-3"><span className="font-bold text-brand-600">1.</span> Click "Add to Chrome"</li>
          <li className="flex gap-3"><span className="font-bold text-brand-600">2.</span> Pin the extension icon</li>
          <li className="flex gap-3"><span className="font-bold text-brand-600">3.</span> Open any YouTube video</li>
          <li className="flex gap-3"><span className="font-bold text-brand-600">4.</span> Click "Summarize" on the right sidebar</li>
        </ol>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">FAQ</h2>
        <div className="mt-10 space-y-4">
          {[
            { q: "Is my data safe?", a: "Yes. We never store transcript text. Only your user ID, plan, and usage count are saved." },
            { q: "How is it different from a chatbot?", a: "It's a one-click button on every video. No context-switching, no copy-paste." },
            { q: "Which model do you use?", a: "Free uses GPT-4o-mini. Pro uses a stronger model with longer context." },
            { q: "Can I cancel?", a: "Cancel anytime from your billing email." }
          ].map(({ q, a }) => (
            <details key={q} className="rounded-lg border border-zinc-200 p-4">
              <summary className="cursor-pointer font-semibold">{q}</summary>
              <p className="mt-2 text-sm text-zinc-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-5xl border-t border-zinc-200 px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 text-sm text-zinc-500 md:flex-row">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600" />
            <span>© 2026 YouTube AI Summary</span>
          </div>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-zinc-900">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-900">Terms</Link>
            <a href="mailto:support@example.com" className="hover:text-zinc-900">Support</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
