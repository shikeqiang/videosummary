# YouTube AI Summary Chrome 插件开发文档（2026 独立开发版）

## 项目目标

打造一个：

- 1~2 周可上线
- 个人开发者可维护
- 能真实收费
- 可低成本运行
- 可快速迭代

的 YouTube AI 总结 Chrome 插件。

核心功能：

```text
用户打开 YouTube 视频
→ 点击按钮
→ 立即获得 AI 总结
```

---

# 一、产品定位

不要做：

- AI 视频平台
- 万能 AI 助手
- 多功能超级插件

只做：

```text
YouTube 视频总结
+ 时间轴提炼
+ 多语言翻译
```

核心原则：

- 高频使用
- 速度快
- UI 简洁
- 成本可控
- 可订阅

---

# 二、MVP 功能（第一版）

## 1. 视频总结

生成：

- 简短摘要
- 核心观点
- Bullet Point

示例：

```text
- AI Agent 将改变软件行业
- 小团队越来越强
- 浏览器插件是高 ROI 副业方向
```

---

## 2. Timeline 时间轴

示例：

```text
00:00 视频介绍
02:10 AI Agent
05:30 Chrome 插件机会
09:15 总结
```

---

## 3. 多语言翻译

例如：

- 英文视频 → 中文总结
- 日文视频 → 英文总结

---

## 4. 一键复制

支持：

- Notion
- Slack
- 飞书
- Obsidian

---

# 三、不要一开始做的功能

不要做：

❌ AI Chat
❌ 视频下载
❌ 知识库
❌ 多平台支持
❌ 复杂团队功能
❌ Agent 自动操作

原因：

会显著增加复杂度，但不增加初期收入。

---

# 四、推荐技术栈

## 插件

推荐：

- Plasmo
- Manifest V3
- TypeScript

官网：

https://www.plasmo.com

---

## 前端

- React
- Tailwind CSS

---

## 后端

推荐：

- Next.js API Routes

---

## 数据库

推荐：

- Supabase

---

## AI 模型

推荐：

- OpenAI GPT-4.1 mini

后期可增加：

- GPT-4.1
- Claude Sonnet

---

## 缓存

推荐：

- Redis
- Upstash Redis

---

## 支付

推荐：

- Lemon Squeezy

原因：

- 不需要公司主体，个人开发者可直接注册
- Merchant of Record 模式，自动处理全球税务
- 原生支持订阅 + Webhook，开发者体验接近 Stripe
- 支持中国大陆开发者提现（通过 Payoneer / Wise）
---

## 部署

推荐：

- Vercel

---

# 五、系统整体架构

```text
Chrome Extension
       ↓
Content Script
       ↓
Background Service Worker
       ↓
Your Backend API
       ↓
OpenAI API
```

---

# 六、推荐项目结构

```text
src/
 ├── background/
 ├── contents/
 ├── popup/
 ├── options/
 ├── lib/
 ├── hooks/
 ├── storage/
 └── api/
```

---

# 七、核心业务流程

## Step 1：检测 YouTube 页面

监听：

```text
youtube.com/watch
```

获取：

- videoId
- title
- channel

---

## Step 2：获取 Transcript 字幕

核心：

通过 YouTube transcript 获取文本。

推荐方式：

读取：

```text
ytInitialPlayerResponse
```

从：

```text
captionTracks
```

中提取字幕。

原因：

LLM 不需要视频本身。
只需要文本。

---

## Step 3：发送到后端

请求示例：

```json
{
  "videoId": "xxx",
  "title": "xxx",
  "transcript": "xxx"
}
```

---

## Step 4：AI 总结

Prompt 示例：

```text
Summarize this YouTube transcript.

Return:
1. Brief summary
2. Key bullet points
3. Timeline sections
4. Actionable insights

Keep concise.
```

---

# 八、推荐 UI 结构

推荐：

## 右侧 Sidebar

原因：

- 最符合 YouTube 使用习惯
- 不影响视频播放
- 用户体验最好

---

## Sidebar 内容

### 顶部

- 视频标题
- 总结状态

---

### 中间

- Summary
- Key Points
- Timeline

---

### 底部

- Copy
- Translate
- Upgrade

---

# 九、AI 成本控制（核心）

很多 AI 产品死于：

```text
用户增长
=
API 账单爆炸
```

必须做好成本控制。

---

## 1. 缓存（最重要）

核心逻辑：

```text
video_id
→ summary
```

同一个视频：

只生成一次。

之后直接返回缓存。

---

## 2. 免费用户使用 mini 模型

推荐：

- GPT-4.1 mini

不要：

- 免费用户直接 GPT-4.1

---

## 3. Transcript 清洗

删除：

```text
uh...
you know...
like...
```

减少 Token 消耗。

---

## 4. Chunk Summary

不要一次发送整个 transcript。

推荐：

```text
3000 token 一段
```

流程：

```text
局部总结
→
总总结
```

---

## 5. 热门视频预生成

检测：

- 热门视频
- 高频请求视频

提前缓存 summary。

---

# 十、防止用户白嫖 API（非常重要）

---

## 1. 永远不要前端直连 OpenAI

错误：

```text
Extension → OpenAI
```

正确：

```text
Extension → Backend → OpenAI
```

---

## 2. 必须登录

推荐：

- Google Login
- Supabase Auth

---

## 3. 免费额度限制

例如：

```text
每天 5 次总结
```

---

## 4. Rate Limit

例如：

```text
1 分钟最多 5 次
```

---

## 5. Redis 缓存

同一个视频：

只调用一次 AI。

---

## 6. Prompt 不放前端

所有 Prompt：

必须放后端。

---

## 7. 日志与风控

记录：

- 用户 ID
- 请求次数
- 视频 ID
- Token 消耗
- IP

---

# 十一、数据库设计

## users

```sql
id
email
plan
usage_count
created_at
```

---

## videos

```sql
id
youtube_video_id
title
summary
timeline
language
created_at
```

---

## usage_logs

```sql
id
user_id
video_id
tokens
created_at
```

---

# 十二、订阅系统

## 推荐模式

```text
免费
+
订阅
```

---

## 免费用户

例如：

- 每天 5 次
- mini 模型

---

## 付费用户

例如：

- 无限次数
- 更强模型
- 多语言
- 更长总结

---

## 推荐价格

```text
$5/月
```

这是最容易转化的价格。

---

# 十三、Chrome Store SEO（非常重要）

插件名字不要太花哨。

推荐：

✅ YouTube AI Summary
✅ YouTube Video Summarizer
✅ AI YouTube Summary

不要：

❌ FancyAI
❌ SmartTubeX

---

# 十四、增长渠道

## 1. Chrome Store SEO

关键词：

- youtube summary
- youtube ai
- video summarizer

---

## 2. Reddit

推荐社区：

- r/youtube
- r/productivity
- r/chatgpt
- r/students

---

## 3. X/Twitter

发布：

- 总结效果
- before/after
- AI demo

---

## 4. Product Hunt

适合冷启动。

---

# 十五、推荐开发顺序（7 天计划）

## Day 1

- 搭建 Plasmo
- YouTube 页面检测

---

## Day 2

- Transcript 获取
- Sidebar UI

---

## Day 3

- OpenAI API 接入
- Summary 生成

---

## Day 4

- Timeline
- 多语言

---

## Day 5

- Redis 缓存
- 免费额度

---

## Day 6

- Lemon Squeezy 支付集成
- 用户系统（Google Login + Supabase Auth）
- 前端 Upgrade 按钮跳转到 Hosted Checkout
- Webhook 处理订阅生命周期事件
- users 表新增 plan 字段（free | pro | canceled）

---

## Day 7

- Chrome Store 上架
- Landing Page
- SEO 文案

---

# 十六、MVP 阶段最重要的事情

不是：

- 架构完美
- AI 最强
- 功能最多

而是：

```text
快速上线
+
真实用户
+
第一个付费用户
```

---

# 十七、最终推荐方案（最现实）

如果是个人开发者。

推荐最终组合：

```text
Plasmo
+
React
+
Tailwind
+
Next.js API
+
Supabase
+
Upstash Redis
+
GPT-4.1 mini
+
Lemon Squeezy（替代 Stripe）
+
Payoneer / Wise（收款）
+
Vercel
```

原因：

- 成本低
- 开发快
- 易维护
- 社区成熟
- 不需要注册海外公司就能全球收款
- 适合独立开发

> 具体支付方案对比与注册集成流程见附录「二十、支付方案对比」与「二十一、Lemon Squeezy 注册与集成 Checklist」。

---

# 十八、真正赚钱的核心

YouTube AI Summary 插件真正赚钱的关键：

不是：

```text
模型最强
```

而是：

```text
速度快
+
使用顺滑
+
成本低
+
用户每天都用
```

---

# 十九、后续可扩展方向（第二阶段）

后续可增加：

- AI Chat with Video
- Notion Export
- Obsidian Export
- AI Flashcards
- AI Quiz
- Team Workspace
- 收藏夹
- 视频知识库
- RAG 搜索
- Agent 自动整理

但不要在 MVP 阶段做。


---

# 二十、支付方案对比（附录）

> 由于 Stripe 在中国大陆不直接支持个人开发者注册，本附录给出替代方案对比。

## 1. 整体对比

| 方案 | 国内个人开发者是否可注册 | 需要公司主体 | 订阅支持 | 费率 | 全球收款 | 税务处理 | 集成难度 | 推荐阶段 |
|---|---|---|---|---|---|---|---|---|
| **Lemon Squeezy** | ✅ | ❌ 不需要 | ✅ 原生支持订阅 | 5% + $0.50 | ✅ | 自动（MoR） | ⭐ 简单（Hosted Checkout） | ✅ **MVP 首选** |
| **Creem** | ✅ | ❌ 不需要 | ✅ | ~3.9% + $0.30 | ✅ | 自动（MoR） | ⭐ 简单 | ✅ 备选（费率更低） |
| **Stripe** | ❌ | ✅ US LLC / HK 公司 | ✅ 原生 | 2.9% + $0.30 | ✅ | 自行处理 | ⭐ 简单 | ARR 50k+ 后再考虑 |
| **Paddle** | ❌ | ✅ US/UK/HK 公司 | ✅ | 5% + $0.50 | ✅ | 自动（MoR） | ⭐⭐ 中等 | 中后期 |
| **Gumroad** | ✅（身份有限制） | ❌ 不需要 | ⚠ 基础订阅 | 10% | ✅ | 简单 | ⭐ 简单 | 辅助引流 |
| **Coinbase Commerce** | ✅ | ❌ 不需要 | ❌ 仅一次性 | 1% | ✅ | 自理 | ⭐⭐ 中等 | 加密圈细分场景 |
| **支付宝 / 微信支付** | ✅ | 国内主体 | ⚠ 需自实现订阅 | 0.6%~1% | ❌ 国内为主 | 自理 | ⭐⭐⭐ 复杂 | 仅做国内产品时 |

## 2. 各方案详细分析

### 2.1 Lemon Squeezy（推荐 / MVP 首选）

**优点：**
- 个人开发者用护照即可注册，最快 3 天审核通过
- Merchant of Record（MoR）模式：全球税务自动处理（含欧盟 VAT、美国销售税、加拿大 GST 等）
- Hosted Checkout：直接跳转收银台，前端几乎零开发
- Webhook 体验接近 Stripe：subscription_created、updated、cancelled 等
- 支持 PayPal、Apple Pay、Google Pay、信用卡

**缺点：**
- 费率比 Stripe 略高（5% vs 2.9%）
- 发票 / 收据主体是 Lemon Squeezy，而不是你自己的品牌名

**适合场景：** ARR < $50k 的独立开发者；尤其是首版插件快速上线。

---

### 2.2 Creem（备选 / 关注中）

**优点：**
- 费率更低（约 3.9% + $0.30，比 LS 省 1.1%）
- 面向 AI 产品 / 亚洲开发者做了大量体验优化
- 早期项目能直接联系到创始人，有问题响应快

**缺点：**
- 平台相对年轻（2024–2025 起来），长期稳定性有待验证
- 文档 / 社区 / 第三方集成不如 LS 完善

**适合场景：** 愿意承担一点点生态不确定性换取更低费率。

---

### 2.3 Stripe（暂不可用）

**国内个人开发者无法直接注册 Stripe**，需要：
- 注册美国 LLC / 香港公司
- 申请 EIN / BR
- 开设美国银行账户 / 通过 Mercury 等
- 走 Stripe Atlas（$500 一次性 + $35/月会员费）

**适合场景：** ARR $50k+ 后再考虑，详情见「3. 何时从 Lemon Squeezy 迁移到 Stripe」。

---

### 2.4 Paddle（暂不可用）

**和 Stripe 一样，必须有公司主体。** 适合 B2B 中大客户场景，对 SaaS 的订阅管理功能强，但 MVP 阶段门槛过高。

---

## 3. 何时从 Lemon Squeezy 迁移到 Stripe

| ARR | 建议支付方案 | 理由 |
|---|---|---|
| $0 – $50k | Lemon Squeezy / Creem | 0 启动成本，省心 |
| $50k – $200k | Stripe（注册 US LLC） | 费率低，开始能 cover 开公司成本 |
| $200k+ | Stripe + 谈判降费率 | 大客户 / B2B 场景对发票、合规要求更高 |

**迁移成本评估：**
- 用户不需要重新注册账号（用相同的 email 在新系统下单）
- 历史订阅可在 LS 中继续运行到到期
- 主要工作量是：注册公司 + 重写支付集成代码 + 迁移活跃订阅 + 报税

---

## 4. 为什么不建议在 MVP 用国内支付（支付宝 / 微信）

- Chrome 插件主要用户是海外（YouTube 是英文为主，中文视频本来就少）
- 国内用户访问 YouTube 体验差，付费意愿弱
- 国内支付接口对接 Stripe / LS 之外的第二种方案需要：B 类商户资质、网站 ICP、海外收款资质等，门槛高
- 即使接上，国内外两套支付 + 两套税务逻辑反而复杂

**例外场景：** 未来做 B站 / 抖音总结插件，再单独接国内支付。

---

# 二十一、Lemon Squeezy 注册与集成 Checklist

> 本附录是为了「Day 6」的实操准备的 SOP（标准操作流程）。

## 1. 前期准备（注册前先准备好的东西）

| 项目 | 具体要求 | 备注 |
|---|---|---|
| 护照（首选） | 清晰彩色扫描件 | 第二代身份证多数情况也能过，但护照更稳 |
| 地址证明 | 最近 3 个月内水电费账单 / 银行账单 / 网购配送单 | 英文最好，不行的话英文地址 + 中文票据也可以 |
| Payoneer 账户 | 提前注册完成 KYC | 域名 email → 收款首选 |
| Wise 账户 | 备选（多币种，费率更低） | 提供美元、欧元等虚拟账户 |
| 品牌域名 | `yourbrand.app` / `.com` | 给 Landing Page 用，LS 也建议有 |

**没有 Payoneer 的用户：** 先到 https://www.payoneer.com 用护照注册，1 周内能开完香港 USD 虚拟银行账户。

---

## 2. 注册 Lemon Squeezy

```text
1. 访问 https://www.lemonsqueezy.com
2. 点击 Sign Up
3. 邮箱 = 品牌邮箱（不要 163 / qq，会被拒）
4. 国家 = China
5. 提交护照扫描件 + 地址证明
6. 等待 1~3 个工作日人工审核
```

**审核通过后立即做的事：**
- Connect Store（绑定收款账户，建议选 Payoneer / Wise / Bank Transfer）
- 完善 Public Store Profile（公司名、Logo、URL）
- 上线至少一个测试产品

---

## 3. 创建订阅产品（$5/月）

### 后台配置

```text
1. Store > Products > New Product
2. 类型 = Digital
3. Name = "YouTube AI Summary Pro"
4. 价格 = $5.00 USD
5. Billing = Subscription
6. Interval = Monthly
7. Trial period = 7 days free（可选，提高转化）
8. 生成 Variant ID（保存！）
```

### 关键参数保存

| 参数 | 用途 | 存到哪 |
|---|---|---|
| Store ID | API 调用时使用 | `LEMONSQUEEZY_STORE_ID` |
| Product ID | 对应 Pro 版产品 | `LEMONSQUEEZY_PRODUCT_ID` |
| Variant ID | $5/月 对应规格 | `LEMONSQUEEZY_VARIANT_ID` |
| API Key | API 鉴权 | `LEMONSQUEEZY_API_KEY` |
| Webhook Secret | 验签 | `LEMONSQUEEZY_WEBHOOK_SECRET` |

---

## 4. Webhook 配置

### 创建 Webhook（LS 后台）

```text
1. Settings > Webhooks > Add Webhook
2. URL = https://your-domain.com/api/webhooks/lemonsqueezy
3. Events 勾选：
   - subscription_created
   - subscription_updated
   - subscription_cancelled
   - subscription_resumed
   - subscription_expired
   - subscription_payment_failed
4. 保存，拿到 Signing Secret
```

### 后端路由（Next.js 伪代码）

```ts
// app/api/webhooks/lemonsqueezy/route.ts
import crypto from 'node:crypto'

export async function POST(req: Request) {
  const raw = await req.text()
  const signature = req.headers.get('x-signature') ?? ''
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!

  const hmac = crypto.createHmac('sha256', secret)
    .update(raw).digest('hex')

  if (hmac !== signature) {
    return new Response('invalid signature', { status: 401 })
  }

  const event = JSON.parse(raw)
  const sub = event.data.attributes
  const email = sub.user_email

  switch (event.meta.event_name) {
    case 'subscription_created':
    case 'subscription_resumed':
      await setPlan(email, 'pro', sub.id)
      break
    case 'subscription_cancelled':
    case 'subscription_expired':
      await setPlan(email, 'free', sub.id)
      break
    case 'subscription_payment_failed':
      await setPlan(email, 'grace', sub.id)  // 宽限期
      break
  }

  return new Response('ok', { status: 200 })
}
```

### 创建 Checkout（Next.js 伪代码）

```ts
// app/api/checkout/route.ts
export async function POST() {
  const url = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
          },
          checkout_data: {
            email: userEmail,           // 可选预填
            custom: { user_id: id },
          },
          product_options: {
            redirect_url: `${process.env.EXT_URL}/thanks`,
          },
        },
        relationships: {
          store:    { data: { type: 'stores', id: process.env.LEMONSQUEEZY_STORE_ID } },
          variant:  { data: { type: 'variants', id: process.env.LEMONSQUEEZY_VARIANT_ID } },
        },
      },
    }),
  }).then(r => r.json())

  return Response.json({ url: url.data.attributes.url })
}
```

---

## 5. 插件端调用

```ts
// 在 popup / sidebar 里
async function upgrade() {
  const res = await fetch('https://your-api.com/api/checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${userJwt}` },
  })
  const { url } = await res.json()
  chrome.tabs.create({ url })   // 新开标签页
}
```

---

## 6. 测试流程

### 本地测试（用 LS Test Mode + Webhook 转发）

```bash
# 把本地 Next.js 服务用 ngrok 暴露到公网
npx ngrok http 3000

# 把 ngrok 提供的 https URL 填到 LS 后台 Webhook 配置中
# 例如：https://xxxx.ngrok-free.app/api/webhooks/lemonsqueezy

# LS 后台 -> Settings -> Webhooks -> Send Test Event 即可触发测试事件
```

### 端到端测试用例

```text
✅ 新订阅 → plan = pro
✅ 取消订阅 → plan = free
✅ 续费成功 → 保持 plan = pro
✅ 支付失败 → plan = grace，邮件提醒
✅ 测试签名的 webhook → 401 拒绝
```

---

## 7. 上线 Checklist

- [ ] Payoneer 账户能正常接收 LS 的提现
- [ ] LS 产品 Variant 配置完成
- [ ] Webhook 验签通过（在 LS 后台能看见 "Healthy"）
- [ ] Checkout URL 在插件里能正常打开
- [ ] 收到订阅后 plan = pro，并触发解锁逻辑
- [ ] Privacy Policy + Terms 页面在域名下可访问（Chrome 商店要求）
- [ ] Landing Page 加 "Upgrade to Pro" 按钮 → 跳转 LS Checkout

---

## 8. 常见踩坑

| 踩坑 | 解决 |
|---|---|
| 注册 LS 时被拒 | 邮箱换成 Gmail / 品牌域名邮箱；地址证明补清晰原件 |
| Webhook 一直 401 | 检查签名用 raw body，**不要** 先 JSON.parse 再 verify |
| 用户付款成功但 plan 没更新 | Webhook 找不到对应用户（email 不一致），要回查 Lemon Squeezy 给的 customer_id 在 Supabase 查不到就 fallback 到 email |
| Payoneer 接收 LS 提现失败 | 确保 Payoneer 已激活 Global Payment Service，并填写了 USD 收款账户 |
| 信用卡被拒（海外用户） | 让用户切到 PayPal，结账页面 LS 默认集成好 |

---

## 9. 费用估算（早期）

```text
假设：
- Pro 用户：100 人，$5/月
- 月 GMV = $500
- LS 抽成 = $500 × 5% + $5（100 个用户 × $0.05 实际算法不同，但约这个量级） ≈ $30
- OpenAI API 成本（cached 后）≈ $20/月
- Vercel / Supabase 免费层 = $0
- 单域名 ≈ $10/年

净收入 ≈ $450/月 - $30 抽成 - $20 API ≈ $400/月
随着用户增长，OpenAI 成本需要更精细的缓存策略。
```

---

> 完成以上 Day 6 任务清单 + 本附录的 9 步，即可上线第一个能赚钱的 Chrome 插件。
