import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36"
const UA_ANDROID =
  "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip"
const UA_TV =
  "Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15"
const INNER_TUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"

/**
 * InnerTube API 拿 player response
 * 多 client 串行试：ANDROID（captions 字段通常保留）→ TVHTML5_SIMPLY_EMBEDDED_PLAYER（无 bot 检测）→ WEB
 * 任一拿到 captionTracks 即返回
 *
 * 为什么不用 HTML scrape：服务端裸 curl 经常被 YouTube 当成 bot，
 * 返回 consent 拦截页或裁剪过的 player response（captions 字段被剥离）。
 * InnerTube 是它自己内部的 JSON API，对无 cookie / 无 pot 的请求更友好。
 */
async function getPlayerFromInnerTube(videoId: string): Promise<any | null> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${INNER_TUBE_KEY}`
  // 多个 client 备选，按"对无 cookie/无 pot 请求最宽松"排序
  // params="8AEB" = 请求完整 player response（含 captions）
  // contentCheckOk/racyCheckOk = ANDROID/WEB client 必须，否则 captions 字段被剥离
  const clients = [
    {
      name: "ANDROID",
      version: "19.09.37",
      ua: UA_ANDROID,
      extra: { androidSdkVersion: 30, timeZone: "UTC", utcOffsetMinutes: 0 }
    },
    {
      name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
      version: "2.0",
      ua: UA_TV,
      extra: {}
    },
    {
      name: "MWEB",
      version: "2.20240101.00.00",
      ua: UA,
      extra: {}
    },
    {
      name: "WEB",
      version: "2.20240101.00.00",
      ua: UA,
      extra: {}
    }
  ]
  for (const c of clients) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": c.ua,
          "X-Youtube-Client-Name": c.name,
          "X-Youtube-Client-Version": c.version,
        },
        body: JSON.stringify({
          videoId,
          params: "8AEB",
          contentCheckOk: true,
          racyCheckOk: true,
          context: {
            client: {
              clientName: c.name,
              clientVersion: c.version,
              hl: "en",
              ...c.extra
            },
            user: { lockedSafetyMode: false }
          }
        })
      })
      if (!r.ok) {
        console.log("[transcript-api] InnerTube", c.name, "status:", r.status)
        continue
      }
      const p = await r.json()
      const tracks = p?.captions?.playerCaptionsTracklistRenderer?.captionTracks
      if (tracks?.length) {
        console.log("[transcript-api] InnerTube", c.name, "got tracks:", tracks.length)
        return p
      }
      const plStatus = p?.playabilityStatus?.status
      const reason = p?.playabilityStatus?.reason
      console.log("[transcript-api] InnerTube", c.name, "no captions, plStatus:", plStatus, "reason:", reason?.slice(0, 80))
    } catch (e: any) {
      console.log("[transcript-api] InnerTube", c.name, "err:", e?.message?.slice(0, 80))
    }
  }
  return null
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
    if (c === '"' && !escapeNext) { inString = !inString; continue }
    if (inString) continue
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) {
        const obj = html.substring(j, k + 1)
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
    // 1) 拉 watch page HTML（拿全量 player response）
    // 1) 拉 watch page HTML 拿 player response
    let player: any | null = null
    try {
      const watchRes = await fetch(
        `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
        { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, cache: "no-store" }
      )
      if (watchRes.ok) {
        const html = await watchRes.text()
        console.log("[transcript-api] html len:", html.length)
        player = extractPlayerResponse(html)
      } else {
        console.log("[transcript-api] watch fetch status:", watchRes.status)
      }
    } catch (e: any) {
      console.log("[transcript-api] watch fetch err:", e?.message?.slice(0, 80))
    }

    // 2) HTML 拿不到 captions（被 bot 检测 / consent 拦截 / captions 字段被剥离）时，fallback InnerTube
    let tracks: any[] | undefined = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks?.length) {
      console.log("[transcript-api] HTML has no captions, falling back to InnerTube")
      player = await getPlayerFromInnerTube(videoId)
      tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    }
    if (!player) return NextResponse.json({ error: "no player response" }, { status: 502 })
    if (!tracks?.length) return NextResponse.json({ error: "no captions" }, { status: 404 })
    console.log("[transcript-api] tracks count:", tracks.length)

    // 3) 选最佳 + 用 timedtext URL
    const track =
      tracks.find((t: any) => t.kind !== "asr") ??
      tracks.find((t: any) => t.languageCode === "en" || t.languageCode?.startsWith("en.")) ??
      tracks[0]

    console.log("[transcript-api] track.baseUrl:", track.baseUrl?.slice(0, 100))
    const sep = track.baseUrl.includes("?") ? "&" : "?"
    const capUrl = `${track.baseUrl}${sep}fmt=json3`
    console.log("[transcript-api] capUrl len:", capUrl.length)

    // 4) fetch 时加足 headers（YouTube 拒 server 请求经常因为缺 Referer/Origin）
    const capRes = await fetch(capUrl, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "application/json, text/plain, */*",
        "Referer": `https://www.youtube.com/watch?v=${videoId}`,
        "Origin": "https://www.youtube.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "X-Youtube-Client-Name": "1",  // 模拟 WEB client
        "X-Youtube-Client-Version": "2.20240101.00.00",
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
