/**
 * 编译时注入的环境变量（以 PLASMO_PUBLIC_ 开头才会被注入到 bundle）
 */
export const ENV = {
  API_BASE_URL: process.env.PLASMO_PUBLIC_API_BASE_URL ?? "http://localhost:3000",
  SUPABASE_URL: process.env.PLASMO_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY ?? ""
} as const
