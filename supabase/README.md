# Supabase 配置

## 初始化

1. 注册并创建新项目：https://supabase.com
2. 选区域（建议 Tokyo / Singapore，离国内近）
3. 在 SQL Editor 里打开 `schema.sql` 全跑一遍
4. 在 Project Settings → API 拿到：
   - `Project URL`         → `SUPABASE_URL`
   - `anon public` key     → `SUPABASE_ANON_KEY`
   - `service_role` key    → `SUPABASE_SERVICE_KEY`（**仅服务端用**，不要放到扩展里）
   - `JWT Secret`          → `SUPABASE_JWT_SECRET`

## 启用 Google OAuth（可选）

Authentication → Providers → Google：
- 把 Google Cloud Console 的 OAuth Client ID/Secret 填上
- Authorized redirect URL 填 `https://<project>.supabase.co/auth/v1/callback`

## 启用 Lemonsqueezy webhook 时需要的网络

默认 Supabase 项目允许所有外网出口。
如果你是 Serverless Function，必要时把 `api.lemonsqueezy.com` 加白名单。
