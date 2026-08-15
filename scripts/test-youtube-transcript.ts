/**
 * /api/youtube/transcript 端点的端到端 smoke test
 *
 * 用法：
 *   cd api && npx tsx scripts/test-youtube-transcript.ts <videoId>
 *   或： VIDEO_ID=jNQXAC9IVRw npm run smoke:transcript
 *
 * 测什么：
 *   1) 视频是否有 caption tracks
 *   2) 服务端能否拉到 timedtext（不受 cookie/pot 限制时）
 *   3) JSON3 / srv3 解析
 *
 * 不会测什么：
 *   - 真实 YouTube 403（需要浏览器 pot）。这部分在本机拿不到，不代表 API 坏。
 */
import { GET } from "../app/api/youtube/transcript/route"

async function main() {
  const videoId = process.argv[2] ?? process.env.VIDEO_ID ?? "jNQXAC9IVRw"
  const req = new Request(`http://localhost/api/youtube/transcript?videoId=${videoId}`)
  console.log("→ Testing videoId:", videoId)
  const res = await GET(req as any)
  const status = res.status
  const ct = res.headers.get("content-type") ?? ""
  let body: any
  try { body = await res.json() } catch { body = await res.text() }
  console.log("← status:", status, "ct:", ct.slice(0, 40))
  if (status !== 200) {
    console.log("body:", JSON.stringify(body).slice(0, 400))
    if (body?.error === "no captions") {
      console.log("✓ endpoint reachable. Video genuinely has no captions (expected for some videos).")
      process.exit(0)
    }
    if (status === 502 && String(body?.message ?? "").includes("timedtext")) {
      console.log("⚠ Server-side timedtext fetch blocked (pot-token / cookie).")
      console.log("  → In browser, extension's step 1-4 (direct fetch with cookies) is the primary path.")
      console.log("  → This endpoint is the fallback for when client can't reach YouTube.")
      process.exit(0)
    }
    process.exit(1)
  }
  const segs = body.segments ?? []
  console.log("✓ segments:", segs.length, "lang:", body.languageCode)
  console.log("  title:", body.title)
  console.log("  channel:", body.channel)
  console.log("  first 3 segs:", segs.slice(0, 3))
  console.log("  plainText[:200]:", String(body.plainText ?? "").slice(0, 200))
}

main().catch((e) => { console.error("✗", e); process.exit(1) })
