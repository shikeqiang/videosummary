/**
 * YouTube transcript 提取（**全在扩展/浏览器上下文**）
 *
 * 4 个数据源（任一成功就返回 segments）：
 *   1. window.ytplayer.player.getPlayerResponse() - 最可靠
 *   2. window.ytplayer.config.args.raw_player_response
 *   3. window.ytInitialPlayerResponse (老 YouTube)
 *   4. fetch watch page HTML 然后 extractPlayerResponse - 兜底
 *
 * timedtext 端点单独用 fetch（带 cookies，浏览器自动带 pot）
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
  videoDetails?: {
    title?: string
    author?: string
    lengthSeconds?: string | number
  }
}

/**
 * 1-3：从浏览器已有的 player 对象拿
 * 返回 null 表示没拿到
 */
function getPlayerFromWindow(): YtPlayerResponse | null {
  const w = window as any
  // 1) ytplayer.player.getPlayerResponse()
  try {
    const p = w.ytplayer?.player?.getPlayerResponse?.()
    if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      return p as YtPlayerResponse
    }
  } catch {}
  // 2) ytplayer.config.args.raw_player_response
  try {
    const p = w.ytplayer?.config?.args?.raw_player_response
    if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      return p as YtPlayerResponse
    }
  } catch {}
  // 3) ytInitialPlayerResponse (老 YouTube)
  try {
    const p = w.ytInitialPlayerResponse
    if (p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      return p as YtPlayerResponse
    }
  } catch {}
  return null
}

/**
 * 等 ytplayer 准备好（YouTube SPA 加载是异步的）
 * 轮询 30 次，每次 200ms，最多 6s
 */
function waitForPlayer(): Promise<any> {
  return new Promise((resolve) => {
    let attempts = 0
    const max = 30
    const tick = () => {
      const w = window as any
      if (w.ytplayer?.player?.getPlayerResponse?.()) {
        resolve(w.ytplayer)
        return
      }
      if (++attempts >= max) {
        resolve(null)
        return
      }
      setTimeout(tick, 200)
    }
    tick()
  })
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
  try {
    const result = new Function(`return (${obj});`)()
    console.log("[transcript] HTML parse: new Function OK, type:", typeof result, "has captions:", !!result?.captions)
    if (typeof result !== "object" || result === null) return null
    return result as YtPlayerResponse
  } catch (e) {
    console.log("[transcript] HTML parse: new Function err:", (e as Error).message?.slice(0, 200))
    return null
  }
}

function findTitleChannel(player: YtPlayerResponse | null, videoId: string) {
  return {
    title: player?.videoDetails?.title ?? document.title?.replace(" - YouTube", "") ?? "",
    channel: player?.videoDetails?.author ?? ""
  }
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
  console.log("[transcript] fetchTranscript CALLED with videoId:", videoId)
  if (!videoId) return null

  // 数据源 1-3：浏览器已有 player 对象（先等 SPA 加载完）
  console.log("[transcript] waiting for ytplayer (up to 6s)...")
  const ytplayer = await waitForPlayer()
  let player = ytplayer?.player?.getPlayerResponse?.() ?? null
  let source = "player-object"
  if (player) {
    console.log("[transcript] got player from window (sources 1-3)")
  }

  // 数据源 4：fetch watch page HTML 兜底
  if (!player) {
    source = "html-fetch"
    console.log("[transcript] window player empty, fetching HTML")
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

  // 拿 caption tracks
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks?.length) {
    console.log("[transcript] no caption tracks in player response")
    return null
  }
  const track = pickBestTrack(tracks)
  if (!track?.baseUrl) {
    console.log("[transcript] no track baseUrl")
    return null
  }
  console.log("[transcript] track:", track.languageCode, track.kind ?? "?", "from:", source)

  // fetch timedtext（带 cookies 浏览器自动带 pot）
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

  const { title, channel } = findTitleChannel(player, videoId)
  return {
    videoId,
    title,
    channel,
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
