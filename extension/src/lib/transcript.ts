/**
 * YouTube transcript 提取（**全在扩展/浏览器上下文**）
 *
 * 4 个数据源（任一成功就返回 segments）：
 *   1. window.ytplayer.player.getPlayerResponse() - 最可靠
 *   2. window.ytplayer.config.args.raw_player_response
 *   3. window.ytInitialPlayerResponse (老 YouTube)
 *   4. fetch watch page HTML 然后 extractPlayerFromHTML - 兜底
 *
 * 不用 eval/new Function（YouTube CSP 禁 unsafe-eval）
 * 用 string-aware quoteUnquotedKeys 转 JS object literal 成合法 JSON
 */

export interface TranscriptSegment {
  startMs: number
  durationMs: number
  text: string
}

const WEB_INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"

export interface TranscriptResult {
  videoId: string
  title: string
  channel: string
  durationMs: number
  languageCode: string
  segments: TranscriptSegment[]
  plainText: string
}

type YtCaptionTrack = {
  baseUrl: string
  languageCode: string
  name?: string
  kind?: string
}

type YtPlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: YtCaptionTrack[]
    }
  }
  videoDetails?: {
    title?: string
    author?: string
    lengthSeconds?: string | number
  }
}

function getPlayerFromWindow(): YtPlayerResponse | null {
  const w = window as any
  try {
    const p = w.ytplayer?.player?.getPlayerResponse?.()
    if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      return p as YtPlayerResponse
    }
  } catch {}
  try {
    const p = w.ytplayer?.config?.args?.raw_player_response
    if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      return p as YtPlayerResponse
    }
  } catch {}
  try {
    const p = w.ytInitialPlayerResponse
    if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      return p as YtPlayerResponse
    }
  } catch {}
  return null
}

function pickBestTrack(tracks: YtCaptionTrack[]): YtCaptionTrack | null {
  if (!tracks?.length) return null
  return (
    tracks.find((t) => t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "en" || t.languageCode?.startsWith("en.")) ??
    tracks[0]
  )
}

function findMatchingBrace(s: string, start: number): number {
  let depth = 0
  let inString = false
  let escapeNext = false
  for (let k = start; k < s.length; k++) {
    const c = s[k]
    if (escapeNext) { escapeNext = false; continue }
    if (c === "\\" && inString) { escapeNext = true; continue }
    if (c === '"' && !escapeNext) { inString = !inString; continue }
    if (inString) continue
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return k
    }
  }
  return -1
}

/**
 * string-aware 把 JS object literal 中 unquoted keys 加上引号
 * 不用 eval，符合 YouTube CSP（禁 unsafe-eval）
 */
function quoteUnquotedKeys(s: string): string {
  const out: string[] = []
  let i = 0
  let inString = false
  let escapeNext = false
  const n = s.length
  while (i < n) {
    const c = s[i]
    if (escapeNext) { out.push(c); escapeNext = false; i++; continue }
    if (c === "\\" && inString) { out.push(c); escapeNext = true; i++; continue }
    if (c === '"' && !escapeNext) { inString = !inString; out.push(c); i++; continue }
    if (inString) { out.push(c); i++; continue }
    if ((c === "{" || c === ",") && i + 1 < n) {
      let k = i + 1
      while (k < n && (s[k] === " " || s[k] === "\n" || s[k] === "\t" || s[k] === "\r")) k++
      if (k < n && /[a-zA-Z_$]/.test(s[k])) {
        let e = k
        while (e < n && /[a-zA-Z0-9_$]/.test(s[e])) e++
        let m = e
        while (m < n && (s[m] === " " || s[m] === "\n" || s[m] === "\t" || s[m] === "\r")) m++
        if (m < n && s[m] === ":") {
          out.push(c)
          for (let x = i + 1; x < k; x++) out.push(s[x])
          out.push('"')
          for (let x = k; x < e; x++) out.push(s[x])
          out.push('"')
          i = e
          continue
        }
      }
    }
    out.push(c)
    i++
  }
  return out.join("")
}

function extractPlayerFromHTML(html: string): YtPlayerResponse | null {
  const marker = "ytInitialPlayerResponse = "
  const i = html.indexOf(marker)
  if (i < 0) {
    console.log("[transcript] HTML parse: marker not found")
    return null
  }
  let j = i + marker.length
  while (j < html.length && html[j] !== "{") j++
  if (j >= html.length) return null
  const end = findMatchingBrace(html, j)
  if (end < 0) {
    console.log("[transcript] HTML parse: no matching brace found")
    return null
  }
  const obj = html.substring(j, end + 1)
  console.log("[transcript] HTML parse: obj len:", obj.length)
  const json = quoteUnquotedKeys(obj)
  try {
    const result = JSON.parse(json)
    console.log("[transcript] HTML parse: JSON.parse OK, has captions:", !!result?.captions)
    if (typeof result !== "object" || result === null) return null
    return result as YtPlayerResponse
  } catch (e) {
    console.log("[transcript] HTML parse: JSON.parse err:", (e as Error).message?.slice(0, 200))
    return null
  }
}

async function waitForPlayer(): Promise<any> {
  return new Promise((resolve) => {
    let attempts = 0
    const tick = () => {
      const w = window as any
      if (w.ytplayer?.player?.getPlayerResponse?.()) {
        resolve(w.ytplayer)
        return
      }
      if (++attempts >= 30) { resolve(null); return }
      setTimeout(tick, 200)
    }
    tick()
  })
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
  console.log("[transcript] fetchTranscript CALLED with videoId:", videoId)
  if (!videoId) return null

  let player = getPlayerFromWindow()
  let source = "player-object"
  if (player) console.log("[transcript] got player from window (sources 1-3)")

  if (!player) {
    console.log("[transcript] waiting for ytplayer (up to 6s)...")
    const ytplayer = await waitForPlayer()
    if (ytplayer) {
      try {
        player = ytplayer?.player?.getPlayerResponse?.() ?? null
        if (player) console.log("[transcript] got player after wait")
      } catch {}
    }
  }

  if (!player) {
    source = "innertube"
    console.log("[transcript] window player empty, trying InnerTube API")
    try {
      const r = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${WEB_INNERTUBE_KEY}&prettyPrint=false`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": `https://www.youtube.com/watch?v=${videoId}`,
            "Origin": "https://www.youtube.com",
          },
          credentials: "include",
          body: JSON.stringify({
            videoId,
            context: { client: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "7.20250101.00.00" } }
          })
        }
      )
      console.log("[transcript] InnerTube status:", r.status)
      if (r.ok) {
        const p = await r.json()
        if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
          player = p as YtPlayerResponse
          console.log("[transcript] got player from InnerTube, keys:", Object.keys(player).slice(0, 7))
        } else {
          console.log("[transcript] InnerTube no captions. keys:", Object.keys(p).slice(0, 7))
        }
      }
    } catch (e) {
      console.log("[transcript] InnerTube err:", (e as Error).message?.slice(0, 200))
    }
  }

  if (!player) {
    source = "html-fetch"
    console.log("[transcript] no player yet, fetching HTML")
    try {
      const watchRes = await fetch(
        `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
        { credentials: "include" }
      )
      console.log("[transcript] HTML fetch status:", watchRes.status, "ct:", watchRes.headers.get("content-type")?.slice(0, 40))
      if (watchRes.ok) {
        const html = await watchRes.text()
        console.log("[transcript] HTML body len:", html.length, "has marker:", html.includes("ytInitialPlayerResponse"))
        player = extractPlayerFromHTML(html)
        if (player) console.log("[transcript] got player from HTML, keys:", Object.keys(player).slice(0, 5))
      }
    } catch (e) {
      console.log("[transcript] HTML fetch err:", (e as Error).message)
    }
  }

  if (!player) {
    console.log("[transcript] all sources failed, returning null")
    return null
  }

  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks?.length) {
    console.log("[transcript] no caption tracks in player response")
    return null
  }
  const track = pickBestTrack(tracks)
  if (!track?.baseUrl) return null
  console.log("[transcript] track:", track.languageCode, track.kind ?? "?", "from:", source)

  const sep = track.baseUrl.includes("?") ? "&" : "?"
  const capUrl = `${track.baseUrl}${sep}fmt=json3`
  let capRes: Response
  try {
    capRes = await fetch(capUrl, { credentials: "include" })
  } catch (e) {
    console.log("[transcript] cap fetch err:", (e as Error).message)
    return null
  }
  console.log("[transcript] capRes status:", capRes.status, "ct:", capRes.headers.get("content-type")?.slice(0, 60))
  if (!capRes.ok) return null
  const capText = await capRes.text()
  if (!capText || !capText.trimStart().startsWith("{")) {
    console.log("[transcript] cap body not JSON, len:", capText.length)
    return null
  }
  let capJson: any
  try {
    capJson = JSON.parse(capText)
  } catch (e) {
    console.log("[transcript] cap JSON.parse err:", (e as Error).message)
    return null
  }

  const evList: any[] = capJson?.events ?? []
  const segments: TranscriptSegment[] = []
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
  console.log("[transcript] segments count:", segments.length)
  if (!segments.length) return null

  return {
    videoId,
    title: player?.videoDetails?.title ?? "",
    channel: player?.videoDetails?.author ?? "",
    durationMs: player?.videoDetails?.lengthSeconds
      ? Number(player.videoDetails.lengthSeconds) * 1000
      : 0,
    languageCode: track.languageCode,
    segments,
    plainText: texts.join(" ")
  }
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  maxChars = 12000
): TranscriptSegment[][] {
  const chunks: TranscriptSegment[][] = []
  let cur: TranscriptSegment[] = []
  let curLen = 0

  for (const seg of segments) {
    if (curLen + seg.text.length > maxChars && cur.length > 0) {
      chunks.push(cur)
      cur = []
      curLen = 0
    }
    cur.push(seg)
    curLen += seg.text.length + 1
  }
  if (cur.length > 0) chunks.push(cur)
  return chunks
}
