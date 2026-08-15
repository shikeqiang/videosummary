/**
 * YouTube transcript 提取（**content script 全在浏览器上下文跑**）
 *
 * 5 步 fallback：
 *  1. 页面 script 提 playerResponse (ytInitialPlayerResponse)
 *  2. 直接 fetch track.baseUrl 拿 XML/srv3（带 cookies + 自动 pot）
 *  3. parseCaptionXml 支持两种格式
 *  4. 全失败 → fetch("/api/transcript?...") 代理 fallback
 *  5. 解析 proxy 返回的 trackUrl
 */

export interface TranscriptSegment {
  startMs: number
  durationMs: number
  text: string
}

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
  videoDetails?: { title?: string; author?: string; lengthSeconds?: string | number }
}

const API_BASE = (typeof process !== "undefined" && (process as any).env?.PLASMO_PUBLIC_API_BASE_URL) || "http://localhost:3000"

function getPlayerFromScript(): YtPlayerResponse | null {
  const w = window as any
  try {
    const p = w.ytInitialPlayerResponse
    if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      return p as YtPlayerResponse
    }
  } catch {}
  return null
}

function getPlayerFromWindowObject(): YtPlayerResponse | null {
  const w = window as any
  try {
    const p = w.ytplayer?.player?.getPlayerResponse?.()
    if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      return p as YtPlayerResponse
    }
  } catch {}
  return null
}

function getPlayerFromHTML(videoId: string): Promise<YtPlayerResponse | null> {
  return (async () => {
    try {
      const r = await fetch(
        `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
        { credentials: "include" }
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
        else if (c === "}") { depth--; if (depth === 0) { end = k; break } }
      }
      if (end < 0) return null
      const obj = html.substring(j, end + 1)
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
      return JSON.parse(out.join("")) as YtPlayerResponse
    } catch { return null }
  })()
}

function pickBestTrack(tracks: YtCaptionTrack[]): YtCaptionTrack | null {
  if (!tracks?.length) return null
  const pref = ["zh-Hans", "zh-CN", "zh", "en", "en-US"]
  for (const lang of pref) {
    const t = tracks.find((t) => t.languageCode === lang)
    if (t) return t
  }
  return tracks[0]
}

/**
 * 解析 caption 文本
 * - 新版 (srv3): <p t="毫秒" d="毫秒"><s>词</s></p>
 * - 经典: <text start="秒" dur="秒">内容</text>
 */
function parseCaptionXml(xml: string): { startMs: number; durationMs: number; text: string }[] {
  const out: { startMs: number; durationMs: number; text: string }[] = []
  // 解析所有 <text> 标签（经典格式）
  const textRe = /<text\s+([^>]+?)>([\s\S]*?)<\/text>/g
  let m: RegExpExecArray | null
  while ((m = textRe.exec(xml)) !== null) {
    const attrs = m[1]
    const inner = m[2]
    const startMatch = attrs.match(/start=["']?(\d+(?:\.\d+)?)["']?/)
    const durMatch = attrs.match(/dur=["']?(\d+(?:\.\d+)?)["']?/)
    if (!startMatch) continue
    const start = parseFloat(startMatch[1])
    const dur = durMatch ? parseFloat(durMatch[1]) : 0
    const text = inner.replace(/<[^>]+>/g, "").trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    if (text) out.push({ startMs: Math.round(start * 1000), durationMs: Math.round(dur * 1000), text })
  }
  if (out.length) return out
  // 解析 <p> 标签（srv3 格式）：从 <p t="毫秒" d="毫秒"> 拿时间戳
  const pRe = /<p\s+([^>]+?)>([\s\S]*?)<\/p>/g
  while ((m = pRe.exec(xml)) !== null) {
    const attrs = m[1]
    const inner = m[2]
    const tMatch = attrs.match(/t=["']?(\d+)["']?/)
    const dMatch = attrs.match(/d=["']?(\d+)["']?/)
    if (!tMatch) continue
    const startMs = parseInt(tMatch[1], 10)
    const dur = dMatch ? parseInt(dMatch[1], 10) : 0
    const text = inner.replace(/<[^>]+>/g, "").trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    if (text) out.push({ startMs, durationMs: dur, text })
  }
  return out
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

  // 1-2. 拿 player response（多个数据源）
  let player = getPlayerFromWindowObject() || getPlayerFromScript()
  let source = player ? "window" : "html"

  if (!player) {
    console.log("[transcript] waiting for ytplayer (up to 6s)...")
    await waitForPlayer()
    player = getPlayerFromWindowObject() || getPlayerFromScript()
  }
  if (!player) {
    source = "html"
    console.log("[transcript] trying HTML fetch")
    player = await getPlayerFromHTML(videoId)
  }

  if (!player) {
    console.log("[transcript] all player sources failed, trying API proxy")
    return await fetchTranscriptViaAPI(videoId)
  }

  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks?.length) {
    console.log("[transcript] no caption tracks, trying API proxy")
    return await fetchTranscriptViaAPI(videoId)
  }
  const track = pickBestTrack(tracks)
  if (!track?.baseUrl) {
    console.log("[transcript] no track baseUrl, trying API proxy")
    return await fetchTranscriptViaAPI(videoId)
  }
  console.log("[transcript] track:", track.languageCode, track.kind ?? "?", "from:", source)

  // 3. 直接 fetch timedtext URL（带 cookies 浏览器自动带 pot）
  const sep = track.baseUrl.includes("?") ? "&" : "?"
  const capUrl = `${track.baseUrl}${sep}fmt=json3`
  let capRes: Response
  try {
    capRes = await fetch(capUrl, { credentials: "include" })
  } catch (e) {
    console.log("[transcript] direct fetch err:", (e as Error).message?.slice(0, 100))
    return await fetchTranscriptViaAPI(videoId)
  }
  console.log("[transcript] direct capRes status:", capRes.status, "ct:", capRes.headers.get("content-type")?.slice(0, 40))
  if (!capRes.ok) return await fetchTranscriptViaAPI(videoId)

  const capText = await capRes.text()
  // 4. 优先解析 JSON3（fmt=json3），fallback XML
  if (capText.trimStart().startsWith("{")) {
    try {
      const j = JSON.parse(capText)
      const evList: any[] = j?.events ?? []
      const segs: TranscriptSegment[] = []
      const texts: string[] = []
      for (const ev of evList) {
        const inner = (ev.segs ?? []).map((s: any) => s.utf8 ?? "").join("").trim()
        if (!inner || inner === "\n") continue
        segs.push({ startMs: ev.tStartMs ?? 0, durationMs: ev.dDurationMs ?? 0, text: inner })
        texts.push(inner)
      }
      if (segs.length) {
        console.log("[transcript] JSON3 ok, segments:", segs.length)
        return {
          videoId, title: player?.videoDetails?.title ?? "", channel: player?.videoDetails?.author ?? "",
          durationMs: 0, languageCode: track.languageCode, segments: segs, plainText: texts.join(" ")
        }
      }
    } catch {}
  }
  // XML parse
  try {
    const segs = parseCaptionXml(capText)
    if (segs.length) {
      console.log("[transcript] XML ok, segments:", segs.length)
      return {
        videoId, title: player?.videoDetails?.title ?? "", channel: player?.videoDetails?.author ?? "",
        durationMs: 0, languageCode: track.languageCode, segments: segs, plainText: segs.map(s => s.text).join(" ")
      }
    }
  } catch {}
  return await fetchTranscriptViaAPI(videoId)
}

/**
 * 数据源 5：API 代理 fallback（server 端 InnerTube ANDROID client 拿 track URL）
 */
async function fetchTranscriptViaAPI(videoId: string): Promise<TranscriptResult | null> {
  try {
    console.log("[transcript] API proxy GET", `${API_BASE}/api/transcript?videoId=${videoId}`)
    const r = await fetch(`${API_BASE}/api/transcript?videoId=${videoId}`, { credentials: "omit" })
    if (!r.ok) return null
    const j = await r.json()
    if (j?.error) return null
    const trackUrl = j.trackUrl
    if (!trackUrl) return null
    console.log("[transcript] API got trackUrl, fetching content")
    const capRes = await fetch(trackUrl, { credentials: "include" })
    if (!capRes.ok) return null
    const capText = await capRes.text()
    if (capText.trimStart().startsWith("{")) {
      try {
        const json = JSON.parse(capText)
        const evList: any[] = json?.events ?? []
        const segs: TranscriptSegment[] = []
        const texts: string[] = []
        for (const ev of evList) {
          const inner = (ev.segs ?? []).map((s: any) => s.utf8 ?? "").join("").trim()
          if (!inner || inner === "\n") continue
          segs.push({ startMs: ev.tStartMs ?? 0, durationMs: ev.dDurationMs ?? 0, text: inner })
          texts.push(inner)
        }
        if (segs.length) {
          return { videoId, title: j.title, channel: j.channel, durationMs: 0, languageCode: j.languageCode, segments: segs, plainText: texts.join(" ") }
        }
      } catch {}
    }
    const segs = parseCaptionXml(capText)
    if (segs.length) {
      return { videoId, title: j.title, channel: j.channel, durationMs: 0, languageCode: j.languageCode, segments: segs, plainText: segs.map(s => s.text).join(" ") }
    }
  } catch (e) {
    console.log("[transcript] API proxy err:", (e as Error).message?.slice(0, 100))
  }
  return null
}

export function chunkTranscript(segments: TranscriptSegment[], maxChars = 12000): TranscriptSegment[][] {
  const chunks: TranscriptSegment[][] = []
  let cur: TranscriptSegment[] = []
  let curLen = 0
  for (const seg of segments) {
    if (curLen + seg.text.length > maxChars && cur.length > 0) {
      chunks.push(cur); cur = []; curLen = 0
    }
    cur.push(seg); curLen += seg.text.length + 1
  }
  if (cur.length > 0) chunks.push(cur)
  return chunks
}
