import { NextRequest, NextResponse } from "next/server"
import { getUserFromBearer } from "~/lib/supabase-server"
import { getQuota } from "~/lib/redis"
import { getUserPlan, dailyLimitFor } from "~/lib/plan"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null
  const user = await getUserFromBearer(token)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const plan = await getUserPlan(user.id)
  const usageToday = await getQuota(user.id)
  const limit = dailyLimitFor(plan)

  return NextResponse.json({
    id: user.id,
    email: user.email,
    plan,
    usageToday,
    limit
  })
}
