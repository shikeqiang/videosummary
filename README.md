# YouTube AI Summary

> Chrome 扩展 + Next.js API。AI 总结 YouTube 视频。1-2 周可上线。

## 目录结构

```
videosummary/
├── extension/   # Plasmo Chrome 扩展（前端）
├── api/         # Next.js（API + Landing Page）
├── supabase/    # SQL schema（数据库）
├── docs/        # 规划文档
└── README.md    # ← 你在这里
```

## 技术栈（替代了原计划的 Stripe）

| 模块 | 选型 | 原因 |
|---|---|---|
| Chrome 扩展 | Plasmo + React + Tailwind | 开发快、热重载 |
| 后端 | Next.js 14 (App Router) | API + Landing Page 一体 |
| 数据库 | Supabase | Auth + Postgres + RLS |
| 缓存 | Upstash Redis | Serverless + Free tier 够用 |
| AI | OpenAI GPT-4o-mini | 便宜、足够好 |
| **支付** | **Lemon Squeezy** | **国内个人开发者无需公司主体** |
| 部署 | Vercel | 一键部署 |

---

## 快速开始（30 分钟）

### 0. 注册第三方账号

- [ ] OpenAI Platform：https://platform.openai.com → 创建 API key
- [ ] Supabase：https://supabase.com → 新建项目 → 跑 `supabase/schema.sql`
- [ ] Upstash Redis：https://upstash.com → 新建一个 Redis（选 Tokyo）
- [ ] Lemon Squeezy：https://lemonsqueezy.com → 注册 + 创建产品和 1 个 Variant
- [ ] （可选）Payoneer：https://payoneer.com → 注册收款账户

### 1. 装依赖

```bash
# 后端
cd api
cp .env.example .env.local
# 把上面的 key 全填进去
npm install

# 扩展
cd ../extension
cp .env.example .env.development
# 把对应 key 填进去
npm install
```

### 2. 跑起来

```bash
# 终端 1：起后端
cd api && npm run dev

# 终端 2：起扩展（热重载）
cd extension && npm run dev
```

打开 Chrome → `chrome://extensions/` → 开启"开发者模式" → "加载已解压的扩展程序" → 选 `extension/.plasmo/chrome-mv3-prod/` 或 dev 目录。

访问 `https://www.youtube.com/watch?v=...`，侧边栏应该会出现。

---

## Lemon Squeezy 集成要点

### 1. 创建 Variant 后台

- Store → Products → New Product
- 类型选 `Digital`，Pricing 选 `Subscription` + Monthly
- 保存后复制 `Variant ID` 填到 `LEMONSQUEEZY_VARIANT_ID`

### 2. 创建 Webhook

- Settings → Webhooks → Add
- URL 填：`https://<your-vercel-domain>/api/webhooks/lemonsqueezy`
- Events 全部勾选
- 拿到 Signing Secret 填到 `LEMONSQUEEZY_WEBHOOK_SECRET`

### 3. 本地联调（测试 webhook）

```bash
# 装一个 ngrok
npx ngrok http 3000

# 把 ngrok 的 https URL 配到 LS Webhook
# 然后在 LS 后台 Send Test Event
```

---

## 上线 Checklist

### 数据库
- [ ] Supabase schema.sql 跑成功
- [ ] service_role key 单独保存

### 后端
- [ ] `api/` 推 GitHub → Vercel 导入
- [ ] Vercel 环境变量全填
- [ ] 测一遍 `/api/me` → 返回 401（没人登录是正常的）
- [ ] 测一遍 Webhook（用 LS 后台 Send Test Event）

### Chrome 扩展
- [ ] 生成 128/48/32/16 png 图标（用 Figma/Canva）
- [ ] `extension/build/` 打包 zip
- [ ] Chrome Web Store 开发者注册（一次性 $5）
- [ ] 提交审核（首审 1-3 天）

### 商店素材
- [ ] 1 张 1280x800 缩略图
- [ ] 3-5 张 1280x800 截图
- [ ] 一段简短描述（中英两版）
- [ ] 隐私政策 URL（指向 `https://yourdomain.com/privacy`）

---

## 成本估算（100 个 Pro 用户时）

| 项目 | 月成本 |
|---|---|
| Vercel 免费层 | $0 |
| Supabase 免费层 | $0 |
| Upstash 免费层 | $0 |
| OpenAI API（cache 命中后） | ~$20 |
| Lemon Squeezy 抽成（$500 GMV × 5%） | ~$25 |
| 域名 | ~$1 |
| **合计** | **~$46** |
| **月收入** | **$500** |
| **净** | **~$454** |

---

## 图片资产

Logo + 商店截图都自动生成在 `extension/assets/`。

```bash
# 重新生成所有 PNG（需要 Pillow）
pip install Pillow
python scripts/generate-assets.py
```

详见 `extension/assets/README.md`。

| 资产 | 位置 |
|---|---|
| 扩展图标 (16/32/48/128) | `extension/assets/icon-*.png` |
| 商店主图 (512) | `extension/assets/icon-512.png` |
| 商店截图 (1280×800) | `extension/assets/store-screenshots/*.png` |
| (镜像)商店截图 | `api/public/store-screenshots/*.png` |

> 设计工具：纯 PIL 程序化生成（`scripts/generate-assets.py`）。改色 / 改文案都直接改这个脚本里的 Python 代码。

## 开发命令

```bash
# 后端
cd api
npm run dev          # 开发
npm run build        # 打包
npm run start        # 生产模式

# 扩展
cd extension
npm run dev          # Plasmo 热重载
npm run build        # 输出到 build/
npm run package      # 打 zip 用于 Chrome 上传
```

---

## 常见问题

### "extension 没看到侧边栏"
- 确认访问的是 `youtube.com/watch?v=...`
- 检查 Content Script Console（F12 → Console → 选 content script）
- 看 `[yt-ai-summary-sidebar]` 是否有 log
- 确认 `ytInitialPlayerResponse` 在 window 中存在

### "fetchTranscript 拿不到内容"
- 视频没有字幕：海螺视频或纯音乐大多没有，需绕路走 ASR（V2 功能）
- 字幕被禁用：私密视频/年龄限制视频

### "AI 一直 500"
- 看 Vercel Logs 里 OpenAI 调用报错
- 大多数情况是 `OPENAI_API_KEY` 没设 / 没余额
- 长视频特别吃 token，确保开了 chunk summary

### "Webhook 4001 Invalid Signature"
- 99% 是 body 解析后验签。检查 `route.ts` 是否用了 `req.text()` 而不是 `req.json()`
- 检查 `LEMONSQUEEZY_WEBHOOK_SECRET` 是否包含 trailing whitespace

---

## 安全清单

- [x] 用户必须登录才能调 `/api/summary`
- [x] service_role key 只在服务端使用（不放扩展、不放前端）
- [x] 每日免费配额 + 速率限制
- [x] 同一视频只调一次 AI（Redis cache）
- [x] Webhook 签名校验
- [x] Prompt 全部在后端、不下放到前端
- [x] 所有人对待 supports only service_role writes through RLS-bypass paths

---

## License

MIT（欢迎二次开发；但请不要原样重发布 → 上商店前改个品牌名）
