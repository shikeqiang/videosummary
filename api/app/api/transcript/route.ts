import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UA_ANDROID = "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip"
const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36"

interface CaptionTrack {
  baseUrl: string
  languageCode: string
  name?: string
  kind?: string
}

interface PlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[]
    }
  }
  videoDetails?: { title?: string; author?: string }
}

interface Segment {
  startMs: number
  durationMs: number
  text: string
}

/**
 * InnerTube ANDROID client 拿 player response（ANDROID UA + protobuf params 走 pot 兼容路径）
 */
async function getPlayerFromInnerTube(videoId: string): Promise<PlayerResponse | null> {
  const url = `https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false`
  for (const client of [
    { name: "ANDROID", version: "19.09.37", ua: UA_ANDROID },
    { name: "WEB", version: "2.20240101.00.00", ua: UA_DESKTOP }
  ]) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": client.ua,
          "X-Youtube-Client-Name": client.name,
          "X-Youtube-Client-Version": client.version,
        },
        body: JSON.stringify({
          videoId,
          params: "8AEB",
          context: {
            client: { clientName: client.name, clientVersion: client.version, hl: "en" }
          }
        })
      })
      if (!r.ok) continue
      const p = await r.json()
      if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
        return p as PlayerResponse
      }
    } catch {}
  }
  return null
}

async function getPlayerFromHTML(videoId: string): Promise<PlayerResponse | null> {
  try {
    const r = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      { headers: { "User-Agent": UA_DESKTOP } }
    )
    if (!r.ok) return null
    const html = await r.text()
    const marker = "ytInitialPlayerResponse = "
    const i = html.indexOf(marker)
    if (i < 0) return null
    let j = i + marker.length
    while (j < html.length && html[j] !== "{") j++
    if (j >= html.length) return null
    let depth = 0, inString = false, escapeNext = false
    let end = -1
    for (let k = j; k < html.length; k++) {
      const c = html[k]
      if (escapeNext) { escapeNext = false; continue }
      if (c === "\\" && inString) { escapeNext = true; continue }
      if (c === '"' && !escapeNext) { inString = !inString; continue }
      if (inString) continue
      if (c === "{") depth++
      else if (c === "}") {
        depth--
        if (depth === 0) { end = k; break }
      }
    }
    if (end < 0) return null
    const obj = html.substring(j, end + 1)
    // string-aware 把 unquoted keys 加引号
    const out: string[] = []
    let p = 0, s2 = false, en2 = false
    const n = obj.length
    while (p < n) {
      const c = obj[p]
      if (en2) { out.push(c); en2 = false; p++; continue }
      if (c === "\\" && s2) { out.push(c); en2 = true; p++; continue }
      if (c === '"' && !en2) { s2 = !s2; out.push(c); p++; continue }
      if (s2) { out.push(c); p++; continue }
      if ((c === "{" || c === ",") && p + 1 < n) {
        let k = p + 1
        while (k < n && (obj[k] === " " || obj[k] === "\n" || obj[k] === "\t" || obj[k] === "\r")) k++
        if (k < n && /[a-zA-Z_$]/.test(obj[k])) {
          let e = k
          while (e < n && /[a-zA-Z0-9_$]/.test(obj[e])) e++
          let m = e
          while (m < n && (obj[m] === " " || obj[m] === "\n" || obj[m] === "\t" || obj[m] === "\r")) m++
          if (m < n && obj[m] === ":") {
            out.push(c)
            for (let x = p + 1; x < k; x++) out.push(obj[x])
            out.push('"')
            for (let x = k; x < e; x++) out.push(obj[x])
            out.push('"')
            p = e
            continue
          }
        }
      }
      out.push(c)
      p++
    }
    return JSON.parse(out.join("")) as PlayerResponse
  } catch {
    return null
  }
}

function pickBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks?.length) return null
  const pref = ["zh-Hans", "zh-CN", "zh", "en", "en-US"]
  for (const lang of pref) {
    const t = tracks.find((t) => t.languageCode === lang)
    if (t) return t
  }
  return tracks[0]
}

/**
 * 这个端点的角色是返回 caption track 的 URL 给扩展，
 * 由扩展（带 cookies + pot）在浏览器里 fetch track 内容。
 * server 端直接 fetch track URL 在今天 pot 机制下基本都失败。
 */
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId")
  if (!videoId) {
    return NextResponse.json({ error: "missing videoId" }, { status: 400 })
  }

  try {
    let player = await getPlayerFromInnerTube(videoId)
    if (!player) player = await getPlayerFromHTML(videoId)
    if (!player) {
      return NextResponse.json({ error: "no player response" }, { status: 502 })
    }
    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks?.length) {
      return NextResponse.json({ error: "no captions" }, { status: 404 })
    }
    const track = pickBestTrack(tracks)
    if (!track?.baseUrl) {
      return NextResponse.json({ error: "no track baseUrl" }, { status: 502 })
    }
    return NextResponse.json({
      videoId,
      title: player?.videoDetails?.title ?? "",
      channel: player?.videoDetails?.author ?? "",
      languageCode: track.languageCode,
      trackUrl: track.baseUrl,
      tracks: tracks.map((t) => ({ lang: t.languageCode, kind: t.kind, name: t.name }))
    })
  } catch (e: any) {
    return NextResponse.json({ error: "internal", message: e?.message }, { status: 500 })
  }
}

export const POST = GET
