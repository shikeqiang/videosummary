import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36"
const WEB_INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"

function pickBestTrack(tracks: any[]): any | null {
  if (!tracks?.length) return null
  return (
    tracks.find((t: any) => t.kind !== "asr") ??
    tracks.find((t: any) => t.languageCode === "en" || t.languageCode?.startsWith("en.")) ??
    tracks[0]
  )
}

/**
 * 用 InnerTube API 拿 player response（不依赖 pot token）
 * InnerTube 接受公开 key，返回 fresh player response with caption tracks
 */
async function fetchPlayerViaInnerTube(videoId: string): Promise<any | null> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${WEB_INNERTUBE_KEY}&prettyPrint=false`
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.youtube.com",
        "Referer": `https://www.youtube.com/watch?v=${videoId}`,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: { clientName: "WEB", clientVersion: "2.20240101.00.00" }
        }
      }),
      cache: "no-store",
    })
    if (!res.ok) {
      console.log("[transcript-api] InnerTube status:", res.status)
      return null
    }
    return await res.json()
  } catch (e: any) {
    console.log("[transcript-api] InnerTube err:", e?.message)
    return null
  }
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  if (!videoId) return NextResponse.json({ error: "missing videoId" }, { status: 400 })

  try {
    // 用 InnerTube API 拿 player response（pot-free）
    console.log("[transcript-api] calling InnerTube for", videoId)
    const player = await fetchPlayerViaInnerTube(videoId)
    if (!player) {
      return NextResponse.json({ error: "InnerTube failed" }, { status: 502 })
    }
    console.log("[transcript-api] InnerTube keys:", Object.keys(player).slice(0, 5))

    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks?.length) return NextResponse.json({ error: "no captions" }, { status: 404 })
    const track = pickBestTrack(tracks)
    if (!track?.baseUrl) return NextResponse.json({ error: "no track baseUrl" }, { status: 502 })

    console.log("[transcript-api] track:", JSON.stringify(track).slice(0, 500))

    // 拿 caption track — InnerTube 返的 baseUrl 应该是 pot-free 的
    const sep = track.baseUrl.includes("?") ? "&" : "?"
    const capUrl = `${track.baseUrl}${sep}fmt=json3`
    console.log("[transcript-api] capUrl FULL:", capUrl)

    const capRes = await fetch(capUrl, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": `https://www.youtube.com/watch?v=${videoId}`,
        "Origin": "https://www.youtube.com",
      },
      cache: "no-store",
    })
    console.log("[transcript-api] capRes status:", capRes.status, "ct:", capRes.headers.get("content-type")?.slice(0, 60))
    if (!capRes.ok) {
      const t = await capRes.text().catch(() => "")
      console.error("[transcript-api] cap non-OK body head 200c:", t.slice(0, 200))
      return NextResponse.json({ error: "caption fetch failed", status: capRes.status }, { status: 502 })
    }
    const capText = await capRes.text()
    console.log("[transcript-api] cap body len:", capText.length, "head 100c:", capText.slice(0, 100).replace(/\n/g, "\\n"))
    let capJson: any
    try {
      capJson = JSON.parse(capText)
    } catch (e: any) {
      console.error("[transcript-api] cap JSON.parse err:", e?.message)
      console.error("[transcript-api] cap body tail 200c:", capText.slice(-200).replace(/\n/g, "\\n"))
      return NextResponse.json({ error: "internal", message: "cap parse: " + e?.message }, { status: 500 })
    }

    const evList: any[] = capJson?.events ?? []
    const segments: Array<{ startMs: number; durationMs: number; text: string }> = []
    const texts: string[] = []
    for (const ev of evList) {
      const segs = ev.segs ?? []
      const text = segs.map((s: any) => s.utf8 ?? "").join("").trim()
      if (!text || text === "\n") continue
      segments.push({ startMs: ev.tStartMs ?? 0, durationMs: ev.dDurationMs ?? 0, text })
      texts.push(text)
    }
    console.log("[transcript-api] segments count:", segments.length)

    return NextResponse.json({
      videoId,
      title: player?.videoDetails?.title ?? "",
      channel: player?.videoDetails?.author ?? "",
      languageCode: track.languageCode,
      segments,
      plainText: texts.join(" ")
    })
  } catch (e: any) {
    console.error("[transcript-api] outer error:", e?.message)
    return NextResponse.json({ error: "internal", message: e?.message }, { status: 500 })
  }
}
