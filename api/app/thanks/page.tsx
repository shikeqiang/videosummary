import Link from "next/link"

export default function ThanksPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-white to-brand-50 px-6 text-center">
      <div className="rounded-2xl bg-white p-8 shadow-xl">
        <div className="text-5xl">🎉</div>
        <h1 className="mt-4 text-3xl font-bold">Welcome to Pro!</h1>
        <p className="mt-3 text-zinc-600">
          Your account has been upgraded. You now have <strong>unlimited summaries</strong>.
        </p>
        <p className="mt-6 text-sm text-zinc-500">
          Open any YouTube video and the sidebar will appear automatically.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-white hover:bg-brand-700">
          Back to Home
        </Link>
      </div>
    </main>
  )
}
