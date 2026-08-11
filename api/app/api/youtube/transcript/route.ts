import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36"

function pickBestTrack(tracks: any[]): any | null {
  if (!tracks?.length) return null
  return (
    tracks.find((t: any) => t.kind !== "asr") ??
    tracks.find((t: any) => t.languageCode === "en" || t.languageCode?.startsWith("en.")) ??
    tracks[0]
  )
}

/**
 * 找 `var ytInitialPlayerResponse = { ... };` 这个 statement 里的 JS 对象字面量。
 *
 * 注意：YouTube 嵌的是 JavaScript 对象字面量，**不是 strict JSON**！
 * 比如 `{key: "value"}` 而不是 `{"key": "value"}`。unquoted keys 是 JS 合法但 JSON 非法。
 * 所以用 `new Function` eval 它（在服务器端跑，源是 YouTube 可信）。
 */
function extractPlayerResponse(html: string): any | null {
  // marker 后面到下一个 `; var` 之前
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{\"responseContext\"[\s\S]+?\})\s*;\s*(?=\n\s*(?:var|if|const|let|function|\}|\)|$))/m)
  if (!m || !m[1]) {
    console.log("[transcript-api] regex no match, html len:", html.length)
    return null
  }
  const obj = m[1]
  console.log("[transcript-api] regex matched, obj len:", obj.length)
  try {
    // 用 new Function 跑（比 eval 安全——作用域隔离）
    // 包 return (...) 让我们拿到对象
    const result = new Function(`return (${obj});`)()
    if (typeof result !== "object" || result === null) return null
    return result
  } catch (e: any) {
    console.error("[transcript-api] eval err:", e?.message?.slice(0, 200))
    console.error("[transcript-api] obj head (300c):", obj.slice(0, 300))
    console.error("[transcript-api] obj tail (200c):", obj.slice(-200))
    return null
  }
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  if (!videoId) {
    return NextResponse.json({ error: "missing videoId" }, { status: 400 })
  }

  try {
    const watchRes = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      { headers: { "User-Agent": UA }, cache: "no-store" }
    )
    if (!watchRes.ok) {
      return NextResponse.json(
        { error: "watch fetch failed", status: watchRes.status },
        { status: 502 }
      )
    }
    const html = await watchRes.text()
    console.log("[transcript-api] html len:", html.length, "has marker:", html.includes("ytInitialPlayerResponse"))
    const player = extractPlayerResponse(html)
    if (!player) {
      return NextResponse.json({ error: "no player response in HTML" }, { status: 502 })
    }

    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks?.length) {
      return NextResponse.json({ error: "no captions" }, { status: 404 })
    }
    const track = pickBestTrack(tracks)
    if (!track?.baseUrl) {
      return NextResponse.json({ error: "no track baseUrl" }, { status: 502 })
    }

    const capRes = await fetch(
      `${track.baseUrl}&fmt=json3`,
      { headers: { "User-Agent": UA }, cache: "no-store" }
    )
    if (!capRes.ok) {
      return NextResponse.json(
        { error: "caption fetch failed", status: capRes.status },
        { status: 502 }
      )
    }
    const capJson = (await capRes.json()) as any

    const evList: any[] = capJson?.events ?? []
    const segments: Array<{ startMs: number; durationMs: number; text: string }> = []
    const texts: string[] = []
    for (const ev of evList) {
      const segs = ev.segs ?? []
      const text = segs.map((s: any) => s.utf8 ?? "").join("").trim()
      if (!text || text === "\n") continue
      segments.push({
        startMs: ev.tStartMs ?? 0,
        durationMs: ev.dDurationMs ?? 0,
        text
      })
      texts.push(text)
    }

    return NextResponse.json({
      videoId,
      title: player?.videoDetails?.title ?? "",
      channel: player?.videoDetails?.author ?? "",
      languageCode: track.languageCode,
      segments,
      plainText: texts.join(" ")
    })
  } catch (e: any) {
    console.error("[transcript-api] outer error:", e?.message ?? e)
    return NextResponse.json({ error: "internal", message: e?.message }, { status: 500 })
  }
}
