import "./globals.css"

export const metadata = {
  title: "YouTube AI Summary - Get instant AI summaries of any video",
  description:
    "Chrome extension that summarizes any YouTube video with GPT-4. Free tier: 5 summaries/day. Pro: unlimited.",
  keywords: ["youtube", "ai", "summary", "video summarizer", "chrome extension"],
  authors: [{ name: "YouTube AI Summary" }],
  openGraph: {
    title: "YouTube AI Summary",
    description: "Get instant AI summaries of any YouTube video.",
    type: "website"
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-zinc-900 antialiased">{children}</body>
    </html>
  )
}
