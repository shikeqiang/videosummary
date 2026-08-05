import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { Storage } from "@plasmohq/storage"
import { ENV } from "./env"

const storage = new Storage({ area: "local" })

export type Session = {
  access_token: string
  refresh_token: string
  user: {
    id: string
    email: string
    user_metadata?: { name?: string; avatar_url?: string }
  }
} | null

export async function getSession(): Promise<Session> {
  const raw = await storage.get<Session>("supabase-session")
  return raw ?? null
}

export async function saveSession(session: Session) {
  await storage.set("supabase-session", session)
}

export async function clearSession() {
  await storage.remove("supabase-session")
}

let client: SupabaseClient | null = null

/**
 * 懒加载 Supabase client
 * （不能放顶层，因为 Plasmo 打包时偶尔会让 URL undefined）
 */
export async function getClient(): Promise<SupabaseClient | null> {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) return null

  if (client) return client

  client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false, // 我们自己用 plasmo storage 持久化
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
  return client
}

export async function getAccessToken(): Promise<string | null> {
  const s = await getSession()
  return s?.access_token ?? null
}
