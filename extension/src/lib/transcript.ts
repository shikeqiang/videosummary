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
function findPlayerResponse(videoId: string): Promise<YtPlayerResponse | null> {
  return (async () => {
    const w = window as unknown as Record<string, unknown>

    // 1) window.ytInitialPlayerResponse（直接 SPA 加载时存在）
    const a = w.ytInitialPlayerResponse as YtPlayerResponse | undefined
    if (a?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      return a
    }

    // 2) fallback: YouTube InnerTube API /youtubei/v1/player
    //    SPA 切换视频时全局变量不会更新，这个 API 总能拿到当前视频的 player response
    const apiKey = getInnertubeApiKey()
    if (!apiKey) {
      console.warn("[transcript] no INNERTUBE_API_KEY, cannot fallback")
      return null
    }

    try {
      console.log("[transcript] fallback: calling InnerTube player API for", videoId)
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId,
            context: {
              client: { clientName: "WEB", clientVersion: "2.20240101.00.00" }
            }
          })
        }
      )
      if (!res.ok) {
        console.warn("[transcript] InnerTube API non-OK:", res.status)
        return null
      }
      const json = (await res.json()) as YtPlayerResponse
      if (json?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
        return json
      }
      console.warn("[transcript] InnerTube API returned no captions")
      return null
    } catch (e: any) {
      console.warn("[transcript] InnerTube API err:", e?.message ?? e)
      return null
    }
  })()
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
  const cfg = w.ytcfg as { data_?: string } | { data?: string } | undefined
  // ytcfg 可能是 object (有 .data_ 字符串属性) 或直接 { data: "..." } 形式
  const data: string | undefined =
    (cfg as any)?.data_ ?? (cfg as any)?.data ?? (cfg as any)?.body
  if (typeof data !== "string") {
    console.log("[transcript] ytcfg type:", typeof cfg, "  keys:", cfg ? Object.keys(cfg as any).slice(0, 8) : "(no ytcfg)")
    return null
  }
  // 多种可能的 key 字段名（YouTube 改过几次）
  const patterns = [
    /INNERTUBE_API_KEY\s*:\s*"([A-Za-z0-9_-]+)"/,
    /"INNERTUBE_API_KEY"\s*:\s*"([A-Za-z0-9_-]+)"/,
    /"INNERTUBE_API_KEY"\s*=\s*"([A-Za-z0-9_-]+)"/,
    /INNERTUBE_API_KEY\s*=\s*"([A-Za-z0-9_-]+)"/,
  ]
  for (const re of patterns) {
    const m = data.match(re)
    if (m) return m[1]
  }
  console.log("[transcript] INNERTUBE_API_KEY not found in ytcfg (ytcfg len:", data.length, ")")
  return null
}

/**
 * 主入口：抓取视频 transcript
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
  console.log("[transcript] fetchTranscript CALLED with videoId:", JSON.stringify(videoId))
  if (!videoId) {
    console.log("[transcript] early-return: videoId is empty")
    return null
  }
  const w = window as unknown as Record<string, unknown>
  console.log("[transcript] ytInitialPlayerResponse exists:", typeof w.ytInitialPlayerResponse)

  const playerResp = await findPlayerResponse(videoId)
  if (!playerResp) {
    console.log("[transcript] early-return: no playerResponse (window + API fallback both failed)")
    return null
  }
  console.log("[transcript] playerResp found, has captions:", !!playerResp.captions?.playerCaptionsTracklistRenderer?.captionTracks)

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
