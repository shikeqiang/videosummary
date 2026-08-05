import { Redis } from "@upstash/redis"
import { ENV } from "./env"
import { todayKey } from "./utils"

let _redis: Redis | null = null

function redis() {
  if (_redis) return _redis
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL ?? "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? ""
  })
  return _redis
}

/**
 * 缓存键：
 *   yt-summary:v1:<videoId>     -> JSON { summary, bullets, timeline, insight, model, createdAt }
 *   yt-summary:lang:v1:<videoId>:<lang>  -> 翻译版
 *
 * 命中：直接返回 JSON；未命中：调用方继续处理，再用 setex 写回
 */
const TTL = 60 * 60 * 24 * 30 // 30 天

export async function getCachedSummary(videoId: string, lang?: string) {
  try {
    const key = `yt-summary:v1:${videoId}:${lang ?? "auto"}`
    const data = await redis().get<any>(key)
    return data
  } catch {
    return null
  }
}

export async function setCachedSummary(videoId: string, lang: string | undefined, data: any) {
  try {
    const key = `yt-summary:v1:${videoId}:${lang ?? "auto"}`
    await redis().set(key, data, { ex: TTL })
  } catch {}
}

export async function incrQuota(userId: string): Promise<number> {
  const k = `quota:${userId}:${todayKey()}`
  const v = await redis().incr(k)
  if (v === 1) {
    // expire 到第二天 0 点 UTC
    await redis().expireat(k, Math.floor(Date.now() / 1000) + 60 * 60 * 26)
  }
  return v
}

export async function getQuota(userId: string): Promise<number> {
  const k = `quota:${userId}:${todayKey()}`
  const v = await redis().get<number>(k)
  return Number(v ?? 0)
}
