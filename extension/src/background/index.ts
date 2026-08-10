/**
 * 扩展 background service worker
 * 
 * 不使用 Plasmo 的 defineBackground() 包装（Plasmo 0.86 不再自动 inject 该全局），
 * 直接用 chrome.runtime.* API；副作用是这里用的所有"魔术"都会被 parcel 转译。
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    setTimeout(() => chrome.runtime.openOptionsPage?.(), 800)
  }
})

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return
  const url = tab.url ?? ""
  if (!url.includes("youtube.com/watch")) {
    chrome.runtime.openOptionsPage?.()
  }
})
