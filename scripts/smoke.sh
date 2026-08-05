#!/usr/bin/env bash
# =====================================================================
# scripts/smoke.sh — 本地冒烟测试脚本
#
# 跑前需要：
#   1. pnpm install (在 api/ 里)
#   2. api/.env.local 填好全部 key
#   3. pnpm dev:api (另一个终端跑起来，会起在 :3000)
#
# 用法： bash scripts/smoke.sh
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# Load env from api/.env.local (strip comments, export as real env vars)
ENV_FILE="api/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE not found"; exit 1
fi
set -a
# strip unquoted inline comments + blank/comment lines
sed -E 's/^([^=]+)=([^#]*?)\s*#.*$/\1=\2/' "$ENV_FILE" \
  | grep -vE '^[[:space:]]*$|^[[:space:]]*#' > /tmp/.smoke-env
. /tmp/.smoke-env
set +a

BASE="${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}"
PASS=0; FAIL=0
ok()   { echo "  ✓ $*"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $*"; FAIL=$((FAIL+1)); }

echo "=== 1. Required env vars set? ==="
for k in SUPABASE_URL SUPABASE_SERVICE_KEY SUPABASE_ANON_KEY SUPABASE_JWT_SECRET \
         UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN; do
  if [ -n "${!k:-}" ]; then ok "$k = ${!k:0:20}..."; else bad "$k missing"; fi
done
for k in OPENAI_API_KEY LEMONSQUEEZY_STORE_ID LEMONSQUEEZY_VARIANT_ID LEMONSQUEEZY_API_KEY; do
  if [ -n "${!k:-}" ]; then ok "$k set"; else echo "  ⚠ $k missing — downstream tests will skip"; fi
done

echo
echo "=== 2. API server reachable? ==="
if curl -sf -o /dev/null --max-time 5 "$BASE"; then
  ok "GET $BASE → reachable"
else
  bad "GET $BASE → not reachable. Did you run 'pnpm dev:api'?"
  exit 1
fi

echo
echo "=== 3. /api/me without token → 401 ==="
HTTP=$(curl -s -o /tmp/.smoke-me1 -w "%{http_code}" "$BASE/api/me")
if [ "$HTTP" = "401" ]; then ok "401 Unauthorized"; else bad "expected 401, got $HTTP"; fi

echo
echo "=== 4. CORS headers on /api/* ==="
CORS=$(curl -sI -X OPTIONS "$BASE/api/me" \
       -H "Origin: https://example.com" \
       -H "Access-Control-Request-Method: GET" \
       -H "Access-Control-Request-Headers: Authorization" \
       | grep -i "access-control-allow-origin" | tr -d '\r')
if echo "$CORS" | grep -qi 'allow-origin'; then ok "CORS preflight: $CORS"; else bad "no CORS header"; fi

echo
echo "=== 5. Upstash Redis ping ==="
PING=$(curl -sf --max-time 5 "$UPSTASH_REDIS_REST_URL/ping" \
       -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN")
if echo "$PING" | grep -q '"result":"PONG"'; then ok "Upstash PONG"; else bad "ping failed: $PING"; fi

echo
echo "=== 6. Supabase service_role → can list profiles table ==="
RESP=$(curl -sf --max-time 5 "$SUPABASE_URL/rest/v1/profiles?select=id,plan&limit=1" \
       -H "apikey: $SUPABASE_SERVICE_KEY" \
       -H "Authorization: Bearer $SUPABASE_SERVICE_KEY")
if echo "$RESP" | grep -q '\['; then ok "service_role auth + REST works (table readable)"; else bad "REST failed: $RESP"; fi

echo
echo "=== 7. Create/get a confirmed test user + mint session token ==="
# 用 password grant（OAuth2 spec）拿 token，不受 email confirmation 限制
# 同一个邮箱反复跑也没事（admin API 是幂等的）
TEST_EMAIL="smoke-test@local.test"
TEST_PW="smoke-test-pw-123-AbC!"

# 先用 admin API 强制 ensure 用户存在（email_confirm=true，跳过确认邮件）
ADMIN=$(curl -sf --max-time 10 -X POST "$SUPABASE_URL/auth/v1/admin/users" \
        -H "apikey: $SUPABASE_SERVICE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PW\",\"email_confirm\":true}" 2>/dev/null || true)

if echo "$ADMIN" | grep -q '"id"'; then
  USER_ID=$(echo "$ADMIN" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('id',''))" 2>/dev/null || true)
  ok "admin ensured user $TEST_EMAIL ($USER_ID)"
else
  # 已经存在时 admin API 返回 400 — 也算 OK
  echo "  → user likely already exists, continuing"
fi

# 用 password grant 直接拿 access_token（anon key + email + password）
LOGIN=$(curl -sf --max-time 10 -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PW\"}")

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('access_token') or '')" 2>/dev/null || true)
USER_ID=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print((d.get('user') or {}).get('id') or '')" 2>/dev/null || true)

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  ok "got access_token for $TEST_EMAIL (user $USER_ID)"
else
  echo "  ⚠ password grant failed: $(echo "$LOGIN" | head -c 200)"
  # 兜底：admin create user 后用户表里要有 profile（trigger 应已建），否则 plan.ts 查不到
fi

if [ -n "${TOKEN:-}" ]; then
  echo
  echo "=== 8. /api/me with valid token ==="
  ME=$(curl -sf --max-time 5 "$BASE/api/me" -H "Authorization: Bearer $TOKEN")
  if echo "$ME" | grep -q '"plan":"free"'; then ok "/api/me → $ME"; else bad "/api/me → $ME"; fi

  echo
  echo "=== 9. /api/usage with valid token ==="
  USAGE=$(curl -sf --max-time 5 "$BASE/api/usage" -H "Authorization: Bearer $TOKEN")
  if echo "$USAGE" | grep -q '"today"'; then ok "/api/usage → $USAGE"; else bad "/api/usage → $USAGE"; fi

  if [ -n "${OPENAI_API_KEY:-}" ]; then
    echo
    echo "=== 10. /api/summary (full flow, will use OpenAI credits) ==="
    SUMMARY=$(curl -sf --max-time 60 -X POST "$BASE/api/summary" \
              -H "Authorization: Bearer $TOKEN" \
              -H "Content-Type: application/json" \
              -d '{"videoId":"dQw4w9WgXcQ","transcript":"This is a test transcript about a famous video. The content discusses internet memes and how they spread. The video became iconic for its surprise ending. Many people reference it in everyday conversation.","language":"en"}')
    if echo "$SUMMARY" | grep -q '"summary"'; then ok "summary OK → $(echo "$SUMMARY" | head -c 100)..."; else bad "summary failed: $(echo "$SUMMARY" | head -c 200)"; fi
  else
    echo
    echo "=== 10. /api/summary SKIPPED (no OPENAI_API_KEY) ==="
  fi
else
  echo
  echo "=== 8–10. SKIPPED (no token obtained; check Supabase email-confirm settings) ==="
fi

echo
echo "============================================="
echo "  PASS: $PASS    FAIL: $FAIL"
echo "============================================="
[ "$FAIL" = "0" ] || exit 1
