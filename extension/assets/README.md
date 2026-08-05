# 图片资源（Assets）

## Logo（用于 Chrome 扩展图标）

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `icon-16.png` | 16×16 | Chrome 工具栏图标 |
| `icon-32.png` | 32×32 | 标准 Chrome 扩展菜单 |
| `icon-48.png` | 48×48 | 网站管理界面 |
| `icon-128.png` | 128×128 | Chrome Web Store 主图标 |
| `icon-512.png` | 512×512 | 高清主图 / Marketing |
| `icon-mono-128.png` | 128×128 | 单色版本（部分场景） |

## 商店截图（1280×800 PNG）

| 文件 | 内容 |
|---|---|
| `store-screenshots/01-hero.png` | 主标题 + 功能展示 + Sidebar 真实效果 |
| `store-screenshots/02-timeline.png` | Click-to-jump Timeline 时间轴功能 |
| `store-screenshots/03-translate.png` | 5+ 语言翻译（日 → 英） |
| `store-screenshots/04-pro-upgrade.png` | $5/mo Pro Plan + 在 Sidebar 中的 Upgrade 入口 |
| `store-screenshots/05-dark-mode.png` | YouTube 暗色主题适配 |

> 截图已同步到 `api/public/store-screenshots/`，可直接给 Landing Page 用。

## 重新生成

```bash
# 需要 Python 3.9+ 和 Pillow
pip install Pillow
python scripts/generate-assets.py
```

## 设计规范

- **主色**：`#7c3aed` (purple-600) → `#6d28d9` (purple-700) 渐变
- **金色**：`#fbbf24` (Pro 标识 + play)
- **字体**：DejaVu Sans / Sans Mono（系统默认），可在脚本顶部更换
- **圆角**：所有卡片 12px，按钮 / 胶囊 16-28px
- **尺寸**：截图 1280×800（Chrome Web Store 强制要求）
