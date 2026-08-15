/**
 * 通过 postMessage 调 YouTube 页面 MAIN world 里跑的 page-fetch-proxy content script，
 * 拿到带 PoToken 的 fetch 结果。
 *
 * 为什么需要这个：
 *   YouTube 2024 年下半年起，timedtext / 部分 API 调用要 PoToken，
 *   这个 token 由 YouTube 自己的 JS 在主线程通过 BotGuardClient 生成，
 *   存在 YouTube 的 fetch wrapper（yt.net.NetworkManager）里。
 *   Content script 在 isolated world，调用原生 fetch 拿不到 PoToken，被 YouTube 识别为 bot 返 HTML。
 *
 * 实现：
 *   - 独立的 page-fetch-proxy content script 在 MAIN world（自动满足 YouTube CSP，
 *     CSP 允许 chrome-extension://<our-id>/* 但不允许 inline <script>）
 *   - sidebar（isolated world）通过 window.postMessage 发请求
 *   - MAIN world proxy 调 YouTube 自己的 fetch wrapper，回传结果
 *
 * 不需要手动注入脚本：page-fetch-proxy 是独立 content script，由 Plasmo 在 build 时
 * 打包成 chrome-extension://.../*.js 注入。
 */

const MESSAGE_NAMESPACE_REQUEST = "pageFetch"
const MESSAGE_NAMESPACE_RESPONSE = "pageFetchResult"
const PAGE_FETCH_TIMEOUT_MS = 15000

export interface PageFetchResult {
  ok: boolean
  status: number
  ct: string
  text: string
  error?: string
  /** true if fetch went through YouTube's wrapper (likely had PoToken) */
  viaYTNet?: boolean
}

/**
 * 通过 MAIN world 的 page-fetch-proxy content script 跑 fetch。
 */
export async function pageContextFetch(url: string): Promise<PageFetchResult> {
  return new Promise((resolve) => {
    const id = `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const handler = (e: MessageEvent) => {
      const msg: any = e.data
      if (!msg || msg.__vs !== MESSAGE_NAMESPACE_RESPONSE || msg.id !== id) return
      window.removeEventListener("message", handler)
      clearTimeout(timer)
      const result: PageFetchResult = msg.error
        ? { ok: false, status: 0, ct: "", text: "", error: msg.error }
        : { ok: !!msg.ok, status: msg.status, ct: msg.ct, text: msg.text }
      resolve(result)
    }
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler)
      resolve({ ok: false, status: 0, ct: "", text: "", error: "pageContextFetch timeout" })
    }, PAGE_FETCH_TIMEOUT_MS)
    window.addEventListener("message", handler)
    window.postMessage({ __vs: MESSAGE_NAMESPACE_REQUEST, id, url }, "*")
  })
}
