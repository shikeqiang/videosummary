const FILLERS = new Set([
  "uh", "uhh", "uh-huh", "uh.", "uh,",
  "um", "umm", "um.",
  "er", "err", "erm",
  "ah", "ahh", "ah.",
  "you know", "you know,", "y'know",
  "like", "like,",
  "so basically", "basically,",
  "right?", "yeah", "yep", "yeah,",
  "okay", "ok", "ok,",
  "hmm", "hmm,",
  "[music]", "[applause]", "[laughter]"
])

/**
 * 清洗字幕文本：删 filler words、合并重复行
 * 不激进删除以保留上下文
 */
export function cleanTranscript(text: string): string {
  if (!text) return ""

  // 按句分割，删掉纯 filler 句
  const sentences = text
    .split(/(?<=[.!?。!?])\s+/g)
    .map((s) => s.trim())
    .filter(Boolean)

  const cleaned: string[] = []
  for (const s of sentences) {
    const lower = s.toLowerCase().trim().replace(/[.,!?;:]/g, "")
    if (FILLERS.has(lower)) continue
    // 删 "uh..." 开头且 < 5 词的句子
    if (/^(uh|um|er|ah|like|you know)/i.test(s.trim()) && s.split(/\s+/).length < 5) continue
    cleaned.push(s)
  }

  return cleaned.join(" ").replace(/\s+/g, " ").trim()
}

/**
 * 按 token 估算切块（1 token ≈ 4 chars 英文，1 token ≈ 1.5 chars 中文）
 */
export function chunkByChars(text: string, maxChars = 12000): string[] {
  const chunks: string[] = []
  const sentences = text.split(/(?<=[.!?。!?])\s+/g)
  let cur = ""
  for (const s of sentences) {
    if ((cur + s).length > maxChars && cur.length > 0) {
      chunks.push(cur)
      cur = s
    } else {
      cur = cur ? `${cur} ${s}` : s
    }
  }
  if (cur.length > 0) chunks.push(cur)
  return chunks
}
