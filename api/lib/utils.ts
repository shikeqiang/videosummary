import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 通用工具函数
 */

/** Tailwind class 合并（clsx + tailwind-merge） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** UTC 当天 key: YYYY-MM-DD（用于 Redis 配额键） */
export function todayKey() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

/** UTC 次日 00:00 ISO 字符串（用于前端展示 "reset at"） */
export function nextResetAt(): string {
  const d = new Date()
  d.setUTCHours(24, 0, 0, 0)
  return d.toISOString()
}
