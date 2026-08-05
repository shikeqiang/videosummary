import type { PlasmoCSConfig } from "plasmo"
import Sidebar from "~components/Sidebar"
import "~styles/globals.css"

export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/watch*"]
}

// 用 Plasmo 标准方式：default export 一个 React component
// Plasmo 会自动把它注入到 shadow root
export default Sidebar
