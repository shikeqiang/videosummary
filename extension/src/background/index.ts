export default defineBackground(() => {
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
})
