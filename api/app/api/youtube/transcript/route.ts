import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/youtube/transcript?videoId=xxx
 *
 * 代替扩展端 fetch YouTube 的 timedtext API。
 * 我们从服务端拿 fresh 的 watch page HTML → parse player response → fetch captions。
 * 解决扩展端遇到的：签名过期 / cookie 不匹配 / IP 校验等所有问题。
 *
 * 性能：每次调用 < 1s（一个 HTML + 一个 captions JSON）。
 */
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

function extractPlayerResponse(html: string): any | null {
  const marker = "ytInitialPlayerResponse = "
  const i = html.indexOf(marker)
  if (i < 0) return null
  let j = i + marker.length
  while (j < html.length && html[j] !== "{") j++
  let depth = 0
  let end = -1
  for (; j < html.length; j++) {
    if (html[j] === "{") depth++
    else if (html[j] === "}") {
      depth--
      if (depth === 0) { end = j + 1; break }
    }
  }
  if (end <= 0) return null
  try { return JSON.parse(html.substring(i + marker.length, end)) } catch { return null }
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  if (!videoId) {
    return NextResponse.json({ error: "missing videoId" }, { status: 400 })
  }

  try {
    // 1) fetch watch page HTML（拿 fresh player response）
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
    const player = extractPlayerResponse(html)
    if (!player) {
      return NextResponse.json({ error: "no player response in HTML" }, { status: 502 })
    }

    // 2) 拿 caption tracks
    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks?.length) {
      return NextResponse.json({ error: "no captions" }, { status: 404 })
    }
    const track = pickBestTrack(tracks)
    if (!track?.baseUrl) {
      return NextResponse.json({ error: "no track baseUrl" }, { status: 502 })
    }

    // 3) fetch captions JSON
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

    // 4) parse 出 segments
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
    console.error("[transcript-api] error:", e?.message ?? e)
    return NextResponse.json({ error: "internal", message: e?.message }, { status: 500 })
  }
}
