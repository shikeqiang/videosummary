# Paddle 迁移操作手册

> 从 Lemon Squeezy 切到 Paddle Billing 的完整步骤。
> 代码侧已经全部改完（**additive**，旧的 lemonsqueezy.ts 还在，需要回滚随时可）。
> 你只需要按下面步骤在 Paddle 后台操作。

---

## 🗺️ 总览

```
Phase 1: 沙箱配置 (1-3 天)
  1.1  建产品
  1.2  建 webhook destination
  1.3  拿 API key
  1.4  填 sandbox env vars
  1.5  跑通测试 (用户注册 → checkout → webhook → plan=pro)

Phase 2: 切到 live (1-3 天)
  2.1  在 live 建相同 product + webhook
  2.2  拿 live API key
  2.3  填 live env vars
  2.4  提交业务验证 (KYB)
  2.5  提交域名审批

Phase 3: 删 LS 代码 (你确认 Paddle 没问题后)
  3.1  删 api/lib/lemonsqueezy.ts
  3.2  删 api/app/api/webhooks/lemonsqueezy/
  3.3  改 docs/STORE_LISTING.md 把 Paddle 列出来
```

---

## Phase 1 — 沙箱配置

### 1.1 建产品（Catalog → Products）

```
Paddle Dashboard (sandbox):  https://sandbox.paddle.com
左侧菜单 → Catalog → Products → "+ New product"

填：
  Name:        YouTube AI Summary Pro
  Description: AI-powered summaries of any YouTube video
  Image:       暂不传（可选）
  
Tax category: 选 "SaaS"（最常见的软件订阅类）

点 Next 进入 Prices → "+ New price"：
  Amount:        $5.00 USD
  Billing cycle: Monthly
  Trial period:  None（先不加，等有了再开）
  Currency:      USD (默认)
  
保存。复制 Price ID（格式 pri_01hxxxxxx）
→ 填到 api/.env.local：PADDLE_PRICE_ID_PRO_MONTHLY=pri_xxx
```

### 1.2 建 webhook destination（Developer tools → Webhooks → "+ New destination"）

```
Name:        YouTube AI Summary (sandbox)
URL:         https://<your-api-domain>/api/webhooks/paddle
             ⚠️ sandbox 阶段可以是 ngrok 或 Vercel preview URL
             等切 live 之前必须换成 production URL
Description: Production subscription webhook
Events:     勾上以下 5 个：
             ✅ subscription.created
             ✅ subscription.updated
             ✅ subscription.canceled
             ✅ subscription.paused
             ✅ subscription.resumed
             （其他不要勾，避免不必要的 webhook）

保存后 → 切到 "Authentication" tab：
  ⚠️ 复制 "endpoint_secret_key"（这是 webhook 签名密钥）
  ⚠️ 只显示这一次，丢失就重置（但重置会让现有签名作废）
  → 填到 api/.env.local：PADDLE_WEBHOOK_SECRET=xxx
```

### 1.3 拿 API key（Developer tools → API keys → "+ New API key"）

```
Name:        YouTube AI Summary Server (sandbox)
Type:        Server-side (默认就是)
Scopes:      ...
  ✅ Read customers
  ✅ Read subscriptions
  ✅ Read transactions
  ✅ Write webhooks (实际上 webhook 是 destination，不是 API 创建的，可以不勾)
  
保存 → 复制 token（pdl_xxx 格式）
→ 填到 api/.env.local：PADDLE_API_KEY=pdl_xxx
```

### 1.4 填 sandbox env vars

`api/.env.local`:
```
PADDLE_ENVIRONMENT=sandbox
PADDLE_API_KEY=pdl_xxx
PADDLE_WEBHOOK_SECRET=xxx
PADDLE_PRICE_ID_PRO_MONTHLY=pri_xxx
```

> NEXT_PUBLIC_SITE_URL 在 sandbox 可以是 `http://localhost:3000`，
> Paddle sandbox 允许 localhost 回调。切 live 前必须改成 https。

### 1.5 测试沙箱走通

```bash
cd api
npm run dev   # 启动本地服务

# 另开一个终端
bash scripts/smoke.sh

# smoke step 10（真实调用 /api/summary）需要 OPENAI_API_KEY
# 如果还没填，跳过即可——Paddle 部分不需要它
```

**手测 Paddle 流程**：
```
1. 在 Chrome 里加载扩展（unpacked dist/latest/chrome-mv3-prod）
2. 进 YouTube 视频，点 sidebar "Sign in"
3. 注册测试账号 → 登录 → options 页显示 plan=free
4. sidebar 点 "Upgrade to Pro"
5. 跳转到 Paddle sandbox 支付页（https://sandbox-buy.paddle.com/...）
6. 用 Paddle 测试卡号：4242 4242 4242 4242，任意未来日期，任意 CVC，任意邮编
7. 付款成功 → 跳回 /thanks
8. 看 Supabase subscriptions 表：应有一行 status=active, paddle_subscription_id=sub_xxx
9. 看 profiles 表：plan 字段应变成 'pro'
10. Paddle Dashboard → Webhooks → Events：应看到刚才的事件，状态 "Successful"

如果任何一步卡住：看 API 日志和 webhook 返回码
```

---

## Phase 2 — 切到 live

### ⚠️ 在 Paddle live 上，绝对不要：
- ❌ 删除/归档/重置任何已有实体（live 产品、prices、webhook destination）
- ❌ 编辑已用过的 price_id（Paddle 不可变，要改就新建）
- ❌ 删除/重建 webhook destination（会作废 signing secret）
- ❌ 删除 customer/subscription（活数据）

### 2.1 live 建相同 product + price

```
Paddle Dashboard (live):  https://paddle.com
左侧菜单 → Catalog → Products → "+ New product"
  → 同 sandbox 步骤
⚠️ 用相同名字 "YouTube AI Summary Pro"，但 Paddle 会给新的 price_id
   → 复制新的 price_id

Sandbox 和 Live 的 price_id 不同！
```

### 2.2 live 建 webhook destination

```
Developer tools → Webhooks → "+ New destination"
  Name:        YouTube AI Summary (live)
  URL:         https://your-api.vercel.app/api/webhooks/paddle  ← 必须用生产域名
  Events:     同 sandbox 的 5 个
  保存 → 复制 endpoint_secret_key

⚠️ 这是独立的 destination（不会替换 sandbox 的）
```

### 2.3 拿 live API key

```
Developer tools → API keys → "+ New API key"
  → 独立于 sandbox
```

### 2.4 填 live env vars

在 Vercel Dashboard → Settings → Environment Variables（或你的部署平台）：

```
PADDLE_ENVIRONMENT=live
PADDLE_API_KEY=pdl_live_xxx
PADDLE_WEBHOOK_SECRET=endpoint_secret_xxx
PADDLE_PRICE_ID_PRO_MONTHLY=pri_live_xxx
NEXT_PUBLIC_SITE_URL=https://your-api.vercel.app
```

> ⚠️ Live 的 price_id 是新的，跟 sandbox 那个完全不同——Paddle 不允许 live 用 sandbox 的 price_id。

### 2.5 提交业务验证 (KYB) + 域名审批

**KYB（Know Your Business）**：
```
Paddle Dashboard → Settings → Business details
  - Legal name:        Shikeqiang Studios
  - Country:           China
  - Tax form (W-8BEN): 个人，填护照 + 中国地址
  - 银行/Payout:        Payoneer（前面注册的）
  - 身份证/护照上传:    扫描件或照片
```

Paddle 审核 KYB 通常 **1-3 个工作日**。审核通过后才能正常打款。

**域名审批**：
```
Paddle Dashboard → Checkout → Domains → "Add domain"
  添加：
    - your-api.vercel.app  （API + marketing 站）
    - 你 Chrome Web Store listing 的 domain（CWS 用）
  
Paddle 会在每个域名放一个验证文件或 DNS 记录。
审批通常 **1-3 个工作日**，之后才能在 live 上用 checkout。
```

---

## Phase 3 — 删 LS 代码（可选，等你确认 Paddle 没问题再做）

```bash
# 1. 删 LS 代码
rm api/lib/lemonsqueezy.ts
rm -rf api/app/api/webhooks/lemonsqueezy/

# 2. 改 docs/STORE_LISTING.md，把 Lemon Squeezy 换成 Paddle

# 3. （可选）从 supabase/schema.sql 删 lemon_* 列
# ⚠️ 如果你有真实的 LS 订阅用户，保留 lemon_* 以便查询
# ⚠️ schema 改了必须重新跑 schema.sql

# 4. 重新 build
cd extension && pnpm install && cd .. && bash scripts/build-extension.sh
```

---

## 🆘 出问题怎么办

| 现象 | 原因 | 解法 |
|---|---|---|
| webhook 返回 401 | 签名错 | 检查 `PADDLE_WEBHOOK_SECRET` 一字不差；webhook header 必须是 `Paddle-Signature` |
| checkout 页 404 | price_id 错或已删除 | Paddle Dashboard → Catalog → 找对的 price_id |
| 用户付款后 DB 没更新 | webhook 没到 / DB 写失败 | 看 API 日志；Paddle Dashboard → Webhooks → Events 看投递历史 |
| `Missing required env: PADDLE_*` | env 没填 | 检查部署平台的 env vars |
| `signature invalid: ts too old` | 服务器时间漂移 | 检查 `date` 命令；Vercel/容器一般 NTP 同步 |
| CORS / CWS 拒收 | live domain 未审批 | Paddle Dashboard → Checkout → Domains 提交 |

---

## 📞 Paddle Support

- Docs: https://developer.paddle.com
- Support: https://paddle.com/support
- 实时聊天: dashboard 右下角（工作日 9am-6pm UTC）

如果卡住，把 Paddle Dashboard 截图 + 错误信息贴给我，我帮你看。
