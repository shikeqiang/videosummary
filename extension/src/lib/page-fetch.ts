/**
 * 在 YouTube 页面主线程 context 里跑 fetch，绕开 content script 拿不到 PoToken 的限制。
 *
 * 为什么需要这个：
 *   YouTube 2024 年下半年起，timedtext / 部分 API 调用要 PoToken（Proof of Origin Token），
 *   这个 token 由 YouTube 自己的 JS 在主线程通过 BotGuardClient 生成，
 *   存在 YouTube 的 fetch wrapper 里。content script 直接 fetch 拿不到这个 token。
 *   在主线程 context 里 fetch，YouTube 的 fetch wrapper 会自动附加 PoToken。
 *
 * 实现：
 *   1. 注入一段 inline <script> 到页面（document.documentElement），在主线程跑
 *   2. 页面脚本监听 window 'message' 事件，过滤 __vs==='pageFetch' 的请求
 *   3. 主线程 fetch 后通过 postMessage 回传结果（带相同 id 配对）
 *   4. content script 收到 pageFetchResult 后 resolve promise
 *
 * 注意：
 *   - 注入只在首次调用时执行（flag 在 window 上，跨调用复用）
 *   - 每个 fetch 有 12s timeout
 *   - 不传 headers（YouTube 的 fetch wrapper 内部会附加所有需要的头）
 */

const INJECTED_FLAG = "__videosummaryInjected"
const PAGE_FETCH_TIMEOUT_MS = 12000

// 用字符串拼接构造注入脚本，避免 TS 模板字符串嵌套歧义
function buildInjectedScript(): string {
  const flag = JSON.stringify(INJECTED_FLAG)
  // 页面主线程里跑的代码：
  //   - 设置 injected flag
  //   - 监听 message 事件，过滤 __vs==='pageFetch'
  //   - 主线程 fetch 后回传 pageFetchResult
  const pageBody =
    `if (window[${flag}]) return;` +
    `Object.defineProperty(window, ${flag}, { value: true, writable: false });` +
    `window.addEventListener("message", async (e) => {` +
    `  const msg = e.data;` +
    `  if (!msg || msg.__vs !== "pageFetch") return;` +
    `  const { id, url } = msg;` +
    `  try {` +
    `    const r = await fetch(url, { credentials: "include" });` +
    `    const text = await r.text();` +
    `    window.postMessage({` +
    `      __vs: "pageFetchResult", id,` +
    `      ok: r.ok, status: r.status,` +
    `      ct: r.headers.get("content-type") || "",` +
    `      text` +
    `    }, "*");` +
    `  } catch (err) {` +
    `    window.postMessage({` +
    `      __vs: "pageFetchResult", id,` +
    `      error: (err && err.message) || String(err)` +
    `    }, "*");` +
    `  }` +
    `});`
  return `(${pageBody})();`
}

async function injectPageScript(): Promise<void> {
  const w = window as any
  if (w[INJECTED_FLAG]) return
  const script = document.createElement("script")
  script.textContent = buildInjectedScript()
  // 在主线程跑；要等它同步执行完（挂 listener + set flag）再继续
  document.documentElement.appendChild(script)
  // flag 在同步执行里就设上了；这里二次确认
  if (!w[INJECTED_FLAG]) {
    // 不太可能失败，但留个兜底
    throw new Error("page script injection failed")
  }
}

export interface PageFetchResult {
  ok: boolean
  status: number
  ct: string
  text: string
  error?: string
}

/**
 * 在 YouTube 页面主线程 context 里跑 fetch。
 * 返回 { ok, status, ct, text } 或 { error }
 */
export async function pageContextFetch(url: string): Promise<PageFetchResult> {
  await injectPageScript()
  return new Promise((resolve) => {
    const id = `pf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const handler = (e: MessageEvent) => {
      const msg: any = e.data
      if (!msg || msg.__vs !== "pageFetchResult" || msg.id !== id) return
      window.removeEventListener("message", handler)
      clearTimeout(timer)
      if (msg.error) {
        resolve({ ok: false, status: 0, ct: "", text: "", error: msg.error })
      } else {
        resolve({ ok: !!msg.ok, status: msg.status, ct: msg.ct, text: msg.text })
      }
    }
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler)
      resolve({ ok: false, status: 0, ct: "", text: "", error: "pageContextFetch timeout" })
    }, PAGE_FETCH_TIMEOUT_MS)
    window.addEventListener("message", handler)
    window.postMessage({ __vs: "pageFetch", id, url }, "*")
  })
}
