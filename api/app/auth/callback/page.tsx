import { redirect } from "next/navigation"

/**
 * Supabase OAuth callback：把 code 换 session 后回跳到扩展
 *
 * 这里通常不需要手写——Supabase redirect URL 指向这一页，
 * 由前端 useEffect 接 ?code 并完成登录，然后跳转。
 * MVP 阶段我们让前端直接从 storage 读，避免这一跳。
 */
export default function AuthCallback() {
  redirect("/")
}
