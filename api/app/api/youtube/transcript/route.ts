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

function extractPlayerResponse(html: string): any | null {
  const marker = "ytInitialPlayerResponse = "
  const i = html.indexOf(marker)
  if (i < 0) return null
  let j = i + marker.length
  while (j < html.length && html[j] !== "{") j++
  if (j >= html.length) return null
  let depth = 0, inString = false, escapeNext = false
  for (let k = j; k < html.length; k++) {
    const c = html[k]
    if (escapeNext) { escapeNext = false; continue }
    if (c === "\\" && inString) { escapeNext = true; continue }
    if (c === '"' && !escapeWithNext) { inString = !inString; continue }
    if (inString) continue
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) {
        const obj = html.substring(j, k + 1)
        console.log("[transcript-api] obj captured, len:", obj.length)
        try {
          const result = new Function(`return (${obj});`)()
          if (typeof result !== "object" || result === null) return null
          return result
        } catch (e: any) { return null }
      }
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  if (!videoId) return NextResponse.json({ error: "missing videoId" }, { status: 400 })

  try {
    const watchRes = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
      }
    )
    if (!watchRes.ok) return NextResponse.json({ error: "watch fetch failed", status: watchRes.status }, { status: 502 })
    const html = await watchRes.text()
    console.log("[transcript-api] html len:", html.length)
    const player = extractPlayerResponse(html)
    if (!player) return NextResponse.json({ error: "no player response in HTML" }, { status: 502 })

    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks?.length) return NextResponse.json({ error: "no captions" }, { status: 404 })
    const track = pickBestTrack(tracks)
    if (!track?.baseUrl) return NextResponse.json({ error: "no track baseUrl" }, { status: 502 })

    // log 完整 baseUrl（之前的 log 被 slice 截断）
    console.log("[transcript-api] track.baseUrl FULL:", track.baseUrl)

    const sep = track.baseUrl.includes("?") ? "&" : "?"
    const capUrl = `${track.baseUrl}${sep}fmt=json3`
    console.log("[transcript-api] capUrl FULL:", capUrl)
    console.log("[transcript-api] capUrl len:", capUrl.length)

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
