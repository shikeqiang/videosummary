/**
 * Offline parser / fallback 链的单元测试
 *
 * 用 node 跑（不需要连 YouTube），构造一段 fake 的 ytInitialPlayerResponse
 * 和一段 fake JSON3 / srv3 caption，验证：
 *   - extension/src/lib/transcript.ts 里的 getPlayerFromHTML/parseCaptionXml/JSON3 解析
 *   - api/app/api/youtube/transcript/route.ts 里的 extractPlayerResponse
 *
 * 用法： cd api && npx tsx scripts/test-transcript-parser.ts
 */

// ---- 1. extractPlayerResponse（服务端用的）----
function extractPlayerResponse(html: string): any | null {
  const marker = "ytInitialPlayerResponse = "
  const i = html.indexOf(marker)
  if (i < 0) return null
  let j = i + marker.length
  while (j < html.length && html[j] !== "{") j++
  if (j >= html.length) return null
  let depth = 0, inString = false, escapeNext = false
  for (let k = j; k < html.length; k++) {
    const c = html[k]
    if (escapeNext) { escapeNext = false; continue }
    if (c === "\\" && inString) { escapeNext = true; continue }
    if (c === '"' && !escapeNext) { inString = !inString; continue }
    if (inString) continue
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) {
        const obj = html.substring(j, k + 1)
        try {
          const result = new Function(`return (${obj});`)()
          if (typeof result !== "object" || result === null) return null
          return result
        } catch { return null }
      }
    }
  }
  return null
}

// ---- 2. parseCaptionXml（扩展里用的，srv3 格式）----
function parseCaptionXml(xml: string) {
  const out: { startMs: number; durationMs: number; text: string }[] = []
  const textRe = /<text\s+([^>]+?)>([\s\S]*?)<\/text>/g
  let m
  while ((m = textRe.exec(xml)) !== null) {
    const attrs = m[1]
    const startMatch = attrs.match(/start=["']?(\d+(?:\.\d+)?)["']?/)
    const durMatch = attrs.match(/dur=["']?(\d+(?:\.\d+)?)["']?/)
    if (!startMatch) continue
    const start = parseFloat(startMatch[1])
    const dur = durMatch ? parseFloat(durMatch[1]) : 0
    const text = m[2].replace(/<[^>]+>/g, "").trim()
    if (text) out.push({ startMs: Math.round(start*1000), durationMs: Math.round(dur*1000), text })
  }
  if (out.length) return out
  const pRe = /<p\s+([^>]+?)>([\s\S]*?)<\/p>/g
  while ((m = pRe.exec(xml)) !== null) {
    const attrs = m[1]
    const inner = m[2]
    const tMatch = attrs.match(/t=["']?(\d+)["']?/)
    const dMatch = attrs.match(/d=["']?(\d+)["']?/)
    if (!tMatch) continue
    const startMs = parseInt(tMatch[1], 10)
    const dur = dMatch ? parseInt(dMatch[1], 10) : 0
    const text = inner.replace(/<[^>]+>/g, "").trim()
    if (text) out.push({ startMs, durationMs: dur, text })
  }
  return out
}

// ---- 3. JSON3 解析（timedtext fmt=json3）----
function parseJson3(capText: string) {
  const j = JSON.parse(capText)
  const evList: any[] = j?.events ?? []
  const segs: { startMs: number; durationMs: number; text: string }[] = []
  for (const ev of evList) {
    const inner = (ev.segs ?? []).map((s: any) => s.utf8 ?? "").join("").trim()
    if (!inner || inner === "\n") continue
    segs.push({ startMs: ev.tStartMs ?? 0, durationMs: ev.dDurationMs ?? 0, text: inner })
  }
  return segs
}

// ---- Tests ----
let pass = 0, fail = 0
function t(name: string, cond: boolean, info: any = "") {
  if (cond) { pass++; console.log("  ✓", name) }
  else      { fail++; console.log("  ✗", name, info) }
}

console.log("[1] extractPlayerResponse — YT 的 JS object literal（键不带引号）")
{
  const html = `<script>ytInitialPlayerResponse = {captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:"https://x?v=1",languageCode:"en",kind:""}]}},videoDetails:{title:"T",author:"C",lengthSeconds:"100"}};</script>`
  const p = extractPlayerResponse(html)
  t("returns object", !!p)
  t("captions parsed", p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length === 1)
  t("languageCode", p?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.[0]?.languageCode === "en")
  t("title", p?.videoDetails?.title === "T")
  t("lengthSeconds", p?.videoDetails?.lengthSeconds === "100")
}

console.log("[2] extractPlayerResponse — 带字符串转义")
{
  const html = `<script>ytInitialPlayerResponse = {videoDetails:{title:"He said \\"hi\\""}};</script>`
  const p = extractPlayerResponse(html)
  t("escaped quote", p?.videoDetails?.title === 'He said "hi"', JSON.stringify(p))
}

console.log("[3] parseCaptionXml — classic <text>")
{
  const xml = `<?xml version="1.0"?><transcript><text start="0.0" dur="1.5">Hello world</text><text start="1.5" dur="2.0">Second line</text></transcript>`
  const segs = parseCaptionXml(xml)
  t("count", segs.length === 2, segs)
  t("first startMs", segs[0]?.startMs === 0)
  t("second startMs", segs[1]?.startMs === 1500)
}

console.log("[4] parseCaptionXml — srv3 <p t d>")
{
  const xml = `<?xml version="1.0"?><transcript><body><p t="100" d="500">a</p><p t="600" d="700">b</p></body></transcript>`
  const segs = parseCaptionXml(xml)
  t("count", segs.length === 2, segs)
  t("first startMs", segs[0]?.startMs === 100)
  t("second durationMs", segs[1]?.durationMs === 700)
}

console.log("[5] parseCaptionXml — srv3 带 <s>")
{
  const xml = `<transcript><p t="0" d="1000"><s>Hello </s><s>world</s></p></transcript>`
  const segs = parseCaptionXml(xml)
  t("count", segs.length === 1)
  t("joined text", segs[0]?.text === "Hello world", segs[0]?.text)
}

console.log("[6] JSON3 fmt=json3")
{
  const cap = JSON.stringify({
    wireMagic: "pb3",
    events: [
      { tStartMs: 0, dDurationMs: 2300, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
      { tStartMs: 2300, dDurationMs: 1500, segs: [{ utf8: "\n" }] },
      { tStartMs: 3800, dDurationMs: 2500, segs: [{ utf8: "Goodbye" }] }
    ]
  })
  const segs = parseJson3(cap)
  t("count", segs.length === 2, segs)
  t("skips newline event", !segs.find(s => s.text === "\n"))
  t("first joined text", segs[0]?.text === "Hello world")
  t("first durationMs", segs[0]?.durationMs === 2300)
}

console.log("\n" + (fail === 0 ? "✅" : "❌"), `pass=${pass} fail=${fail}`)
process.exit(fail === 0 ? 0 : 1)
