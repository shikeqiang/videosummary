import { NextRequest, NextResponse } from "next/server"
import { getUserFromBearer } from "~/lib/supabase-server"
import { createCheckoutUrl } from "~/lib/lemonsqueezy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null
  const user = await getUserFromBearer(token)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const url = await createCheckoutUrl({
      userId: user.id,
      userEmail: user.email
    })
    return NextResponse.json({ url })
  } catch (e: any) {
    console.error("[checkout] error", e)
    return NextResponse.json({ error: "Checkout failed", details: e.message }, { status: 500 })
  }
}
