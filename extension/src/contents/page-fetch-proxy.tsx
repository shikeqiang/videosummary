/**
 * 在 YouTube 页面 MAIN world 里跑的内容脚本（独立于 sidebar content script）。
 *
 * 为什么需要这个：
 *   1. YouTube CSP 不允许 inline <script> 注入
 *   2. 但允许从 chrome-extension://<our-id>/ 加载外部脚本
 *   3. Plasmo 的 world: "MAIN" 会把 content script 打包成外部 JS，
 *      从 chrome-extension:// URL 注入，符合 YouTube CSP
 *   4. 这个脚本跑在 YouTube 主线程，能访问 YouTube 自己的 fetch wrapper
 *      （yt.net.XhrClient / NetworkManager），这些 wrapper 会自动附 PoToken
 *   5. 通过 postMessage 跟 sidebar content script（isolated world）通信
 *
 * 通信协议：
 *   - sidebar 发:  { __vs: "pageFetch", id, url }
 *   - proxy 回:    { __vs: "pageFetchResult", id, ok, status, ct, text, error? }
 */

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/watch*"],
  world: "MAIN",
  run_at: "document_start"
}

const MESSAGE_NAMESPACE = "pageFetch"

function getYTNet(): any {
  const w = window as any
  // YouTube obfuscated globals；这些路径在 2024 各版本里都有
  return w.yt?.net ?? w._yt_player?.net ?? w._yt_player_?.net ?? null
}

async function ytAwareFetch(url: string): Promise<{
  ok: boolean
  status: number
  ct: string
  text: string
  error?: string
}> {
  try {
    const net = getYTNet()
    // 试 YouTube 的 NetworkManager.singleton.fetch（最有可能带 PoToken）
    const mgr = net?.NetworkManager ?? net?.networkManager ?? null
    const singleton = mgr?.singleton ?? mgr?.instance ?? mgr?.instance_ ?? null
    if (singleton?.fetch) {
      const r = await singleton.fetch(url, { credentials: "include" })
      const text = await r.text()
      return {
        ok: !!r.ok,
        status: r.status,
        ct: r.headers?.get?.("content-type") ?? r.headers?.get?.("Content-Type") ?? "",
        text
      }
    }
    // 试 XhrClient 公开方法
    const xhr = net?.XhrClient ?? net?.xhrClient ?? null
    if (xhr?.fetch) {
      const r = await xhr.fetch(url, { credentials: "include" })
      const text = await r.text()
      return {
        ok: !!r.ok,
        status: r.status,
        ct: r.headers?.get?.("content-type") ?? r.headers?.get?.("Content-Type") ?? "",
        text
      }
    }
    // 兜底：原生 fetch（无 PoToken，但起码能拿响应看 YouTube 返了什么）
    const r = await fetch(url, { credentials: "include" })
    const text = await r.text()
    return {
      ok: r.ok,
      status: r.status,
      ct: r.headers.get("content-type") ?? "",
      text
    }
  } catch (err: any) {
    return { ok: false, status: 0, ct: "", text: "", error: err?.message ?? String(err) }
  }
}

export default function () {
  window.addEventListener("message", async (e) => {
    const msg: any = (e as MessageEvent).data
    if (!msg || msg.__vs !== MESSAGE_NAMESPACE) return
    const { id, url } = msg
    const result = await ytAwareFetch(url)
    window.postMessage({ __vs: "pageFetchResult", id, ...result }, "*")
  })
}
