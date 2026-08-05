# Chrome Web Store Listing Copy

> All fields and copy you need to fill in Chrome Web Store Developer Dashboard.
> Copy the relevant block, translate if needed, paste into the form.
>
> **Dashboard:** https://chrome.google.com/webstore/devconsole/

---

## 1. Store listing — Basic info

### Name *(max 45 chars)*
```
YouTube AI Summary
```

### Short description *(max 132 chars)*
```
Summarize any YouTube video in 5s. AI-powered bullets, clickable timeline, translate to 5+ langs. Free 5/day.
```
*(128 chars)*

### Detailed description *(EN — primary)*
```
Skip the watch. Get the gist of any YouTube video in seconds.

YouTube AI Summary injects a clean, distraction-free sidebar right into YouTube that turns any video's transcript into:

  ✓ 30-word TL;DR
  ✓ 5–8 key bullets
  ✓ Clickable timeline (jump to the exact moment)
  ✓ Auto-detected language, output in EN / 中文 / 日本語 / ES / DE
  ✓ One-click copy for sharing

---

WHY YOU'LL LOVE IT

• Built for power users — keyboard-first, no extra tabs.
• Free tier is real: 5 summaries / day, no credit card.
• Pro at $5/mo: unlimited + GPT-4o model + priority queue.
• Your transcript never leaves your browser unencrypted.
• Open architecture: Supabase auth + Lemon Squeezy payments, no shady tracking.

---

HOW IT WORKS

1. Open any YouTube video with captions.
2. The sidebar appears on the right.
3. Pick output language → hit "Summarize this video".
4. In ~5 seconds: TL;DR, bullets, clickable timeline.

The first time, you'll be asked to sign in (free email/password, no credit card). We use it only to enforce daily limits and process your Pro subscription.

---

WHAT IT DOESN'T DO

✗ Doesn't read your data — extension only sees the current tab's caption tracks.
✗ Doesn't sell your data.
✗ Doesn't store transcripts (only AI-generated summaries are cached anonymously).
✗ Doesn't run ads.
✗ Doesn't track you across sites.

---

PRICING

Free — $0/mo
  • 5 summaries / day
  • GPT-4o-mini model
  • Clickable timeline
  • Translate to 5 langs

Pro — $5/mo (cancel anytime)
  • Unlimited summaries
  • GPT-4o model
  • Priority queue
  • Long-video support

Payments handled by Lemon Squeezy (Merchant of Record — handles VAT, sales tax globally). Cancel from the extension's Account page anytime.

---

SUPPORT

• Email: support@youtube-ai-summary.com *(replace)*
• Privacy policy: https://your-api.vercel.app/privacy
• Terms: https://your-api.vercel.app/terms

Made by an indie developer — feedback welcome.
```

### 详细描述 *(中文 — 备用语言)*
```
不看完整视频，5 秒拿到 YouTube 视频重点。

YouTube AI Summary 会在 YouTube 页面右侧注入一个干净的侧边栏，把任何视频的字幕变成：

  ✓ 30 字摘要
  ✓ 5-8 条要点
  ✓ 可点击时间轴（直接跳到关键节点）
  ✓ 自动检测源语言，输出 EN / 中文 / 日本語 / ES / DE
  ✓ 一键复制，方便分享

为什么你会喜欢它：

• 为重度用户设计——键盘优先，不需要新开标签页
• 真正的免费档：每天 5 次摘要，不要信用卡
• Pro $5/月：无限次数 + GPT-4o 模型 + 优先队列
• 字幕内容不会离开你的浏览器
• 透明架构：Supabase 登录 + Lemon Squeezy 支付，没有偷偷摸摸的追踪

怎么用：
1. 打开任意带字幕的 YouTube 视频
2. 右侧会出现侧边栏
3. 选输出语言 → 点"总结这个视频"
4. 约 5 秒后：摘要、要点、可点击时间轴

价格：
免费版 - $0/月：每天 5 次，GPT-4o-mini
Pro - $5/月（随时取消）：无限次数，GPT-4o 模型
支付由 Lemon Squeezy 处理（全球含税）。

支持：
• 邮箱：support@youtube-ai-summary.com
• 隐私政策：https://your-api.vercel.app/privacy
```

### Category
```
Productivity
```

### Language
```
English (United States) — primary
中文 (简体) — secondary (optional but recommended for SEO)
```

---

## 2. Graphic assets

| Asset | Spec | File |
|---|---|---|
| **Icon** | 128×128 PNG, transparent or solid | `extension/assets/icon-128.png` ✓ |
| **Screenshots** | 1280×800 or 640×400 PNG/JPEG, 1–5 | `extension/assets/store-screenshots/01-hero.png` … `05-dark-mode.png` ✓ |
| **Small promo tile** | 440×280 PNG/JPEG | `extension/assets/store-screenshots/promo-small-440x280.png` ⚠ need to generate |
| **Marquee promo tile** | 1400×560 PNG/JPEG | `extension/assets/store-screenshots/promo-marquee-1400x560.png` ⚠ optional but recommended |

> **Suggested order in dashboard:** hero → timeline → translate → pro → dark mode

---

## 3. Privacy practices *(required since 2024)*

### Single Purpose *(required)*
```
YouTube AI Summary is a single-purpose Chrome extension that summarizes YouTube videos using AI. It does one thing: extracts the current video's transcript and shows an AI-generated summary in a sidebar injected into the YouTube page.
```

### Permission Justifications

| Permission | Why we need it |
|---|---|
| `tabs` | Read the current tab's URL to detect when a YouTube video is loaded and refresh the sidebar. We only read `url` and `title` — never content, history, or bookmarks. |
| `storage` | Persist the user's Supabase session token across browser restarts so they don't have to sign in every time. |
| `activeTab` | Used in conjunction with the popup UI to display which YouTube video is currently active. |

### Host Permission Justifications

| Host | Why we need it |
|---|---|
| `https://www.youtube.com/*` | Content script matches `youtube.com/watch*` to extract the video's caption tracks from `ytInitialPlayerResponse` and inject the sidebar UI. |
| `https://*.supabase.co/*` | Authenticate users (sign in / sign up / refresh session) and read their profile (plan, quota). |
| `https://api.lemonsqueezy.com/*` | Server-side only (extension's bundled background script does not call this directly). Listed for transparency. |

### Data usage *(Privacy practices tab)*

| Question | Answer |
|---|---|
| Does this extension collect or use personal data? | **Yes** — but only what the user explicitly provides (email for auth). |
| What data is collected? | Email address (for auth), aggregated usage counts (number of summaries, no transcript content). |
| Why? | To enforce daily quotas, authenticate, and process Pro subscriptions. |
| Is data sold to third parties? | **No.** Never. |
| Is data used for purposes unrelated to the extension's single purpose? | **No.** |
| Do you handle personal data for purposes unrelated to auth/quota? | **No.** |
| Privacy policy URL | `https://your-api.vercel.app/privacy` *(replace with deployed URL)* |

---

## 4. Distribution

| Field | Value |
|---|---|
| Visibility | **Public** |
| Distribution | All regions (or specific list if needed) |
| Pricing | **Free** with in-app purchase for Pro (handled by Lemon Squeezy, not CWS IAP) |

> Note: We're using Lemon Squeezy for payments, NOT Chrome Web Store In-App Purchases. This is allowed but you must disclose it in the listing description (already covered in "PRICING" section above).

---

## 5. Submit checklist

Before clicking Submit:

- [ ] **Manifest validation** — `plasmo build` produces no errors
- [ ] **All env vars set** — `.env.production` has `PLASMO_PUBLIC_*` filled
- [ ] **Zip / folder uploaded** — `build/chrome-mv3-prod/` contents
- [ ] **Privacy policy live** — public URL, accessible without login
- [ ] **Terms live** — public URL
- [ ] **Support email** — working, replies within 48h (Chrome reviewers test it)
- [ ] **Single-purpose description** — clear, no marketing-speak
- [ ] **Permission justifications** — every permission explained
- [ ] **No remote code** — extension only loads its own bundle (Plasmo default — safe)
- [ ] **5 screenshots** in correct order (hero → features → pricing → dark mode)
- [ ] **Small promo tile** 440×280 generated
- [ ] **Test in unpacked mode** — load `build/chrome-mv3-prod/` locally, verify all flows

---

## 6. After submit

| Stage | Typical wait |
|---|---|
| Initial review | 1–3 business days |
| Re-review after rejection | 1–3 business days |
| Live on CWS | Within 1h of approval |

If rejected, common reasons:
- "Single purpose unclear" → refine the description
- "Permission justification insufficient" → add more detail
- "Privacy policy not accessible" → make sure URL doesn't 404 or require login
- "Manifest issue" → check Chrome's manifest validator output
