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
    const w = window as unknown as any

    // 1) window.ytInitialPlayerResponse（直接 SPA 加载时存在）
    const a = w.ytInitialPlayerResponse as YtPlayerResponse | undefined
    if (a?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
      console.log("[transcript] source 1: window.ytInitialPlayerResponse")
      return a
    }

    // 2) window.yt.player.getPlayerResponse() — 尝试拿 player 实例
    //    YouTube 在 watch 页挂了一个 yt-player 元素，可通过 DOM 或 window.yt 拿
    try {
      const player =
        w.yt?.player?.getPlayerResponse?.() ??
        w.yt?.player?.getPlayerResponse?.call?.(w.yt?.player)
      if (player?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
        console.log("[transcript] source 2: window.yt.player.getPlayerResponse()")
        return player as YtPlayerResponse
      }
    } catch {}

    // 3) document.getElementById('movie_player').getPlayerResponse()
    try {
      const el = document.getElementById("movie_player") as any
      const player = el?.getPlayerResponse?.()
      if (player?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
        console.log("[transcript] source 3: #movie_player.getPlayerResponse()")
        return player as YtPlayerResponse
      }
    } catch {}

    // 4) DOM 搜 #movie_player 下的 __data 或 yt-player 的内部状态
    try {
      const el = document.querySelector("yt-player") as any
      // yt-player 暴露 player state（有时）
      const state = el?.playerState ?? el?.playerState_
      if (state?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
        console.log("[transcript] source 4: yt-player.playerState")
        return state as YtPlayerResponse
      }
    } catch {}

    // 5) InnerTube API 兜底（需要 INNERTUBE_API_KEY，但目前已确认 ytcfg 不在了）
    const apiKey = getInnertubeApiKey()
    if (apiKey) {
      try {
        console.log("[transcript] source 5: InnerTube player API for", videoId)
        const res = await fetch(
          `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoId,
              context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00" } }
            })
          }
        )
        if (res.ok) {
          const json = (await res.json()) as YtPlayerResponse
          if (json?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
            return json
          }
        }
      } catch {}
    } else {
      console.log("[transcript] no INNERTUBE_API_KEY (ytcfg gone)")
    }

    // 6) Plan C：fetch watch page HTML，parse 嵌在 src 里的 ytInitialPlayerResponse
    try {
      console.log("[transcript] source 6: fetching watch page HTML for", videoId)
      const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        credentials: "include"
      })
      if (res.ok) {
        const html = await res.text()
        // 找 ytInitialPlayerResponse = { ... };  段
        // 用 indexOf + 括号计数，避免正则匹配到嵌套 }
        const marker = "ytInitialPlayerResponse = "
        const i = html.indexOf(marker)
        if (i >= 0) {
          let j = i + marker.length
          let depth = 0
          let end = -1
          // 第一个 { 一定是对象起点
          while (j < html.length && html[j] !== "{") j++
          for (; j < html.length; j++) {
            if (html[j] === "{") depth++
            else if (html[j] === "}") {
              depth--
              if (depth === 0) { end = j + 1; break }
            }
          }
          if (end > 0) {
            try {
              const json = JSON.parse(html.substring(i + marker.length, end)) as YtPlayerResponse
              if (json?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) {
                console.log("[transcript] source 6: HTML parse, tracks:", json.captions!.playerCaptionsTracklistRenderer!.captionTracks!.length)
                return json
              }
            } catch (e: any) {
              console.warn("[transcript] source 6: parse err:", e?.message ?? e)
            }
          }
        }
        console.log("[transcript] source 6: no ytInitialPlayerResponse in HTML")
      }
    } catch (e: any) {
      console.warn("[transcript] source 6 err:", e?.message ?? e)
    }

    console.warn("[transcript] all client-side sources failed for videoId:", videoId)
    return null
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
  console.log("[transcript] playerResp found:", !!playerResp, "has captions:", playerResp ? !!playerResp.captions?.playerCaptionsTracklistRenderer?.captionTracks : false)
  // 不直接 return null：即使 client 拿不到 player response，下面 server-side 还能兜底
  if (playerResp) {
    const tracks = playerResp.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (tracks && tracks.length > 0) {
      const track = pickBestTrack(tracks)
      if (track) {
        // client-side 路径：直接 fetch timedtext
        const separator = track.baseUrl.includes("?") ? "&" : "?"
        const params = ["fmt=json3"]
        const pot = getInnertubeApiKey()
        if (pot) params.push(`pot=${pot}`)
        const url = `${track.baseUrl}${separator}${params.join("&")}`
        console.log("[transcript] client-side: tracks:", tracks.length, "picked:", track.languageCode, "url head:", url.slice(0, 80))
        try {
          const res = await fetch(url, { credentials: "include" })
          const ct = res.headers.get("content-type") ?? ""
          console.log("[transcript] client-side status:", res.status, "ct:", ct.slice(0, 60))
          if (res.ok && ct.includes("application/json")) {
            const json = await res.json()
            // 解析 events...
          } else {
            console.warn("[transcript] client-side failed, falling back to server")
          }
        } catch (e: any) {
          console.warn("[transcript] client-side err:", e?.message ?? e)
        }
      }
    }
  }

  // Server-side 兜底（永远会跑）
  const apiBase = process.env.PLASMO_PUBLIC_API_BASE_URL || "http://localhost:3000"
  console.log("[transcript] calling server-side:", `${apiBase}/api/youtube/transcript?videoId=${videoId}`)
  let serverRes: Response
  try {
    // credentials: "omit" — 这个端点不需要 cookie（CORS 通配 * 才能用）
    serverRes = await fetch(`${apiBase}/api/youtube/transcript?videoId=${encodeURIComponent(videoId)}`, {
      credentials: "omit"
    })
  } catch (e: any) {
    console.warn("[transcript] server fetch err:", e?.message ?? e)
    return null
  }
  console.log("[transcript] server status:", serverRes.status)
  if (!serverRes.ok) {
    const t = await serverRes.text().catch(() => "")
    console.warn("[transcript] server non-OK body head:", t.slice(0, 200))
    return null
  }
  const serverJson: any = await serverRes.json().catch(() => null)
  console.log("[transcript] server response keys:", serverJson ? Object.keys(serverJson).slice(0, 5) : "null")
  if (!serverJson?.segments?.length) {
    console.warn("[transcript] server returned no segments, error:", serverJson?.error)
    return null
  }
  // Server data path：直接返回（不用走 client-side 解析）
  console.log("[transcript] using server-side data, segments:", serverJson.segments.length)
  return {
    videoId,
    title: serverJson.title ?? "",
    channel: serverJson.channel ?? "",
    durationMs: 0,
    languageCode: serverJson.languageCode ?? "en",
    segments: serverJson.segments,
    plainText: (serverJson.segments ?? []).map((s: any) => s.text ?? "").join(" ")
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
