import type { PlasmoCSConfig, PlasmoGetRootContainer } from "plasmo"
import Sidebar from "~components/Sidebar"
import "~styles/globals.css"

/**
 * 强制把 content UI 挂到 shadow root 里，CSS 跟 YouTube 隔离
 *
 * Plasmo 0.86 默认 mount 在普通 DOM 里，会被 YouTube 自己的 CSS 干扰。
 * 创建一个 shadow host，手动 attach shadow root，
 * 并把 globals.css 注入到 shadow root 里。
 */
export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/watch*"]
}

export const getRootContainer: PlasmoGetRootContainer = async () => {
  // 1. 创建 host 元素
  const host = document.createElement("plasmo-csui")
  host.id = "videosummary-sidebar-host"
  // 2. 附加 shadow root
  const shadow = host.attachShadow({ mode: "open" })
  // 3. 注入全局 CSS（.css 文件内容被打到 bundle 里，但只挂在外层 DOM）
  //    Plasmo 的机制：content_scripts.css 注入到主页面，无法直接注入 shadow root。
  //    所以我们手写一个 <link> 引用已生成 CSS 文件。
  //    但更稳的做法：把 globals.css 内容直接 inline 进来。
  //    Plasmo 0.86 提供了 getStyle hook，但更简单是读 CSSOM 资源。
  //    → 改用 import "data-text/css,..." 模式在 build 时打进去。
  //    为了这次能用，最简单：建一个 <style> 把所有要用的 utility 写 inline。
  //    但 globals.css 是 @tailwind 编译产物，很长。
  //    → 用 dynamic import + fetch 加载我们打包出的 CSS
  const styleEl = document.createElement("link")
  styleEl.rel = "stylesheet"
  styleEl.href = chrome.runtime.getURL("youtube-sidebar.cbd95b00.css")
  // 但用 content_scripts.css 是相对 content script 路径，
  // shadow root 里 fetch 受 host_permissions 限制
  // 改用 fetch 拿 + blob URL
  try {
    const cssUrl = chrome.runtime.getURL("youtube-sidebar.cbd95b00.css")
    const res = await fetch(cssUrl)
    const css = await res.text()
    const style = document.createElement("style")
    style.textContent = css
    shadow.appendChild(style)
  } catch (e) {
    console.warn("[videosummary] failed to load CSS into shadow root", e)
  }
  // 4. 准备 react 挂载点
  const root = document.createElement("div")
  root.id = "videosummary-sidebar-root"
  root.className = "plasmo-shadow-root"
  shadow.appendChild(root)
  // 5. 把 host 加到 body 末尾
  document.body.appendChild(host)
  return root
}

export default Sidebar
