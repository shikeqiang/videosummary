/**
 * YouTube 视频 transcript 提取（不需要外部 API）
 *
 * 核心思路：
 *   1. 注入到 youtube.com 后，从 window 拿到 ytInitialPlayerResponse
 *   2. 找到 captionTracks，选择第一个可用的（优先手动字幕）
 *   3. 拿到 baseUrl，附加 &fmt=json3 得到结构化 JSON
 *   4. 解析并清洗成纯文本 + 时间戳
 */

export interface TranscriptSegment {
  /** 起始时间 ms */
  startMs: number
  /** 时长 ms */
  durationMs: number
  /** 文字 */
  text: string
}

export interface TranscriptResult {
  videoId: string
  title: string
  channel: string
  durationMs: number
  languageCode: string
  segments: TranscriptSegment[]
  /** 拼接后的纯文本 */
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
}

/**
 * 从窗口的全局变量提取 playerResponse
 *
 * 包含容错：有时 ytInitialPlayerResponse 不在全局，有时在 ytInitialData 中
 */
function findPlayerResponse(): YtPlayerResponse | null {
  const w = window as unknown as Record<string, unknown>

  // 1) window.ytInitialPlayerResponse
  const a = w.ytInitialPlayerResponse as YtPlayerResponse | undefined
  if (a?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
    return a
  }

  // 2) fallback: parse ytInitialData 中的 metadataRowRenderer 等（不完整，作 best-effort）
  const initialData = w.ytInitialData as string | undefined
  if (initialData) {
    try {
      // 这里仅占位：实际从 initialData 解析 captionTracks 比较繁琐，
      // 多数情况下 ytInitialPlayerResponse 已足够。
    } catch {}
  }

  return null
}

/**
 * 选择最佳字幕轨道：手写 > 英文 > 第一条
 */
function pickBestTrack(tracks: YtCaptionTrack[]): YtCaptionTrack | null {
  if (!tracks || tracks.length === 0) return null
  // 1) 手工上传的（非 ASR）
  const manual = tracks.find((t) => t.kind !== "asr")
  if (manual) return manual
  // 2) 英文
  const en = tracks.find((t) => t.languageCode === "en" || t.languageCode.startsWith("en."))
  if (en) return en
  // 3) 第一条
  return tracks[0]
}

/**
 * 从 ytcfg 中获取 INNERTUBE_API_KEY（用于 timedtext fallback）
 */
function getInnertubeApiKey(): string | null {
  const w = window as unknown as Record<string, unknown>
  const cfg = w.ytcfg as { data_?: string } | undefined
  const data = cfg?.data_
  if (!data) return null

  // API key 在 ytcfg 中以 INNERTUBE_API_KEY: "xxx" 形式出现
  const match = data.match(/INNERTUBE_API_KEY[\s":]+"([a-zA-Z0-9_-]+)"/)
  return match ? match[1] : null
}

/**
 * 主入口：抓取视频 transcript
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
  if (!videoId) return null
  const w = window as unknown as Record<string, unknown>

  const playerResp = findPlayerResponse()
  if (!playerResp) return null

  const tracks = playerResp.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks || tracks.length === 0) return null

  const track = pickBestTrack(tracks)
  if (!track) return null

  // 构造 fmt=json3 的字幕 url
  const separator = track.baseUrl.includes("?") ? "&" : "?"
  const params = ["fmt=json3"]
  const pot = getInnertubeApiKey()
  if (pot) params.push(`pot=${pot}`)
  const url = `\${track.baseUrl}\${separator}\${params.join("&")}`
  console.log("[transcript] tracks:", tracks.length, "picked:", track.languageCode, track.kind ?? "?")
  console.log("[transcript] url:", url.slice(0, 140))

  let json: any
  try {
    const res = await fetch(url, { credentials: "include" })
    console.log("[transcript] status:", res.status, res.headers.get("content-type")?.slice(0,40))
    if (!res.ok) {
      const t = await res.text().catch(() => "")
      console.warn("[transcript] non-OK body head:", t.slice(0, 200))
      return null
    }
    json = await res.json()
  } catch {
    return null
  }

  console.log("[transcript] events:", json?.events?.length ?? 0)
  const evList: Array<{ tStartMs: number; dDurationMs: number; segs?: Array<{ utf8: string }> }> =
    json?.events ?? []
  const segments: TranscriptSegment[] = []
  const texts: string[] = []

  for (const ev of evList) {
    const segs = ev.segs ?? []
    const text = segs.map((s) => s.utf8 ?? "").join("").trim()
    if (!text || text === "\n") continue
    segments.push({
      startMs: ev.tStartMs ?? 0,
      durationMs: ev.dDurationMs ?? 0,
      text
    })
    texts.push(text)
  }

  const title = (w.ytInitialPlayerResponse as any)?.videoDetails?.title
    ?? document.title?.replace(" - YouTube", "")
    ?? ""
  const channel = (w.ytInitialPlayerResponse as any)?.videoDetails?.author ?? ""
  const durationMs = (w.ytInitialPlayerResponse as any)?.videoDetails?.lengthSeconds
    ? Number((w.ytInitialPlayerResponse as any).videoDetails.lengthSeconds) * 1000
    : 0

  return {
    videoId,
    title,
    channel,
    durationMs,
    languageCode: track.languageCode,
    segments,
    plainText: texts.join(" ")
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
