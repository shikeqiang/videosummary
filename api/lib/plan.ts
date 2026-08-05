import { supabaseAdmin } from "./supabase-server"
import { ENV } from "./env"

export type Plan = "free" | "pro" | "grace"

/**
 * 根据 user_id 查 plan。
 * 优先级：subscriptions 表中 active/trialing > canceled/grace
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return "free"

  if (data.status === "active" || data.status === "on_trial") return "pro"
  if (data.status === "past_due" || data.status === "unpaid") return "grace"
  if (data.status === "cancelled" || data.status === "expired") return "free"
  return "free"
}

export function dailyLimitFor(plan: Plan) {
  return plan === "pro" ? ENV.PRO_LIMIT() : ENV.FREE_LIMIT()
}
