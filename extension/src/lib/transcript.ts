/**
 * YouTube 视频 transcript 提取（**完全在浏览器上下文跑**）
 *
 * 为什么不能 server 端 fetch：
 *   - YouTube timedtext API 现在强要 `pot` token（client-side JS 生成）
 *   - 扩展 content script 在 youtube.com 域名下运行，自动带 cookie + pot
 *
 * 流程（全部在浏览器 fetch + cookies include）：
 *   1) 拉 watch page HTML（找 player response）
 *   2) 字符串感知的括号匹配 parse 整个 player response JS 对象
 *   3) 找 captionTracks，挑最好的 track（手动 > 英文 > 第一个）
 *   4) fetch timedtext URL（带 cookies，pot 自动）
 *   5) 解析 JSON3 events → segments + plainText
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
 * 字符串感知的括号匹配：找到 { ... } 配对位置
 * (避免 {..:  "}"} 之类字符串里的 } 误判)
 */
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

function extractPlayerResponse(html: string): YtPlayerResponse | null {
  const marker = "ytInitialPlayerResponse = "
  const i = html.indexOf(marker)
  if (i < 0) return null
  // 找第一个 {
  let j = i + marker.length
  while (j < html.length && html[j] !== "{") j++
  if (j >= html.length) return null
  // 找配对的 }
  const end = findMatchingBrace(html, j)
  if (end < 0) return null
  const obj = html.substring(j, end + 1)
  try {
    // 用 new Function 跑：YouTube 嵌的是 JS 对象字面量（unquoted keys、单引号等）
    const result = new Function(`return (${obj});`)()
    if (typeof result !== "object" || result === null) return null
    return result as YtPlayerResponse
  } catch {
    return null
  }
}

function pickBestTrack(tracks: YtCaptionTrack[]): YtCaptionTrack | null {
  if (!tracks?.length) return null
  return (
    tracks.find((t) => t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "en" || t.languageCode?.startsWith("en.")) ??
    tracks[0]
  )
}

/**
 * 主入口：拉 transcript（完全在浏览器上下文）
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
  console.log("[transcript] fetchTranscript CALLED with videoId:", videoId)
  if (!videoId) {
    console.log("[transcript] early-return: videoId empty")
    return null
  }

  try {
    // 1) 拉 watch page HTML（带 cookies）
    console.log("[transcript] fetching watch page HTML")
    const watchRes = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      { credentials: "include" }
    )
    if (!watchRes.ok) {
      console.log("[transcript] watch fetch failed:", watchRes.status)
      return null
    }
    const html = await watchRes.text()
    console.log("[transcript] html len:", html.length)

    // 2) parse player response
    const player = extractPlayerResponse(html)
    if (!player) {
      console.log("[transcript] no player response extracted")
      return null
    }
    console.log("[transcript] player keys:", Object.keys(player).slice(0, 6))

    // 3) 拿 caption tracks
    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!tracks?.length) {
      console.log("[transcript] no caption tracks")
      return null
    }
    const track = pickBestTrack(tracks)
    if (!track?.baseUrl) {
      console.log("[transcript] no track baseUrl")
      return null
    }
    console.log("[transcript] track:", track.languageCode, track.kind ?? "?")

    // 4) fetch timedtext（带 cookies，浏览器自动带 pot）
    const sep = track.baseUrl.includes("?") ? "&" : "?"
    const capUrl = `${track.baseUrl}${sep}fmt=json3`
    console.log("[transcript] fetching timedtext, len:", capUrl.length)
    const capRes = await fetch(capUrl, { credentials: "include" })
    console.log("[transcript] capRes status:", capRes.status, "ct:", capRes.headers.get("content-type")?.slice(0, 40))
    if (!capRes.ok) {
      console.log("[transcript] cap fetch failed")
      return null
    }
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

    // 5) parse segments
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
  } catch (e) {
    console.log("[transcript] outer err:", (e as Error).message)
    return null
  }
}

/**
 * 把 transcript 切成 ~N token 的小块（粗略估算：1 token ≈ 4 char 英文 / 1.5 char 中文）
 */
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
