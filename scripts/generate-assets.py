"""
YouTube AI Summary - 资产生成器

生成：
  - extension/assets/icon-{16,32,48,128,512}.png   扩展图标
  - extension/assets/icon-mono-128.png              单色版
  - extension/assets/store-screenshots/*.png       5 张 Chrome 商店截图 (1280x800)

依赖：
  Pillow

运行：
  pip install Pillow
  python scripts/generate-assets.py
"""

import math, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "extension", "assets")
SCREENS = os.path.join(ASSETS, "store-screenshots")
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(SCREENS, exist_ok=True)
os.makedirs(os.path.join(ROOT, "api", "public", "store-screenshots"), exist_ok=True)


# ---------- palette ----------
BRAND_A   = (124, 58, 237)
BRAND_B   = (139, 92, 246)
BRAND_C   = (109, 40, 217)
BRAND_SOFT= (237, 233, 254)
GOLD      = (251, 191, 36)
GOLD_DARK = (245, 158, 11)
DARK_TEXT = (24, 24, 27)
MID_TEXT  = (113, 113, 122)
LIGHT_TEXT= (161, 161, 170)
BORDER    = (228, 228, 231)
WHITE     = (255, 255, 255)
SURFACE_LT= (250, 245, 255)
SURFACE_BG= (245, 243, 255)
DARK_BG   = (10, 10, 10)
DARK_CARD = (24, 24, 27)
DARK_TEXT_2 = (250, 250, 250)


# ---------- fonts ----------
def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    path = {
        "regular":  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "bold":     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "mono":     "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    }.get(weight, "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(path, size)


# ---------- helpers ----------
def rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def fill_gradient_rounded_rect(canvas, x0, y0, x1, y1, radius, c_top, c_bot):
    W, H = canvas.size
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=255)
    grad = Image.new("RGB", (W, H), c_top)
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, (y1 - y0))
        r = int(c_top[0] * (1 - t) + c_bot[0] * t)
        g = int(c_top[1] * (1 - t) + c_bot[1] * t)
        b = int(c_top[2] * (1 - t) + c_bot[2] * t)
        for x in range(x0, x1 + 1):
            grad.putpixel((x, y), (r, g, b))
    canvas.paste(grad, (0, 0), mask)


def fill_gradient_vertical(canvas, c_top, c_bot):
    W, H = canvas.size
    px = canvas.load()
    for y in range(H):
        t = y / max(1, H - 1)
        for x in range(W):
            px[x, y] = tuple(int(c_top[i]*(1-t) + c_bot[i]*t) for i in range(3))


def draw_sparkle(draw, cx, cy, size, color=WHITE):
    s = size
    draw.polygon([(cx, cy-s), (cx+s*0.6, cy), (cx, cy+s), (cx-s*0.6, cy)], fill=color)
    small = s * 0.45
    for ang in [25, 115, 205, 295]:
        rad = math.radians(ang)
        off = s * 1.6
        x = cx + math.cos(rad) * off
        y = cy + math.sin(rad) * off
        draw.polygon([(x, y-small), (x+small*0.6, y), (x, y+small), (x-small*0.6, y)], fill=color)


def text(draw, x, y, s, f, color, anchor="lt"):
    draw.text((x, y), s, font=f, fill=color, anchor=anchor)


# ============================================================
# 1. LOGO
# ============================================================

def make_logo(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    fill_gradient_rounded_rect(img, 0, 0, size - 1, size - 1, int(size * 0.22),
                                BRAND_B, BRAND_C)
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    s_main = size * 0.18
    d.polygon([
        (cx, cy - s_main),
        (cx + s_main * 0.7, cy),
        (cx, cy + s_main),
        (cx - s_main * 0.7, cy)
    ], fill=WHITE)
    small = s_main * 0.55
    for ang in [10, 80, 170, 260]:
        rad = math.radians(ang)
        off = s_main * 1.7
        x = cx + math.cos(rad) * off
        y = cy + math.sin(rad) * off
        d.polygon([
            (x, y - small),
            (x + small * 0.7, y),
            (x, y + small),
            (x - small * 0.7, y)
        ], fill=WHITE)

    if size >= 32:
        pp_size = size * 0.16
        ppx = size - pp_size * 1.7
        ppy = pp_size * 1.0
        d.polygon([
            (ppx, ppy),
            (ppx + pp_size, ppy + pp_size / 2),
            (ppx, ppy + pp_size)
        ], fill=GOLD)

    return img


def make_mono_logo(size):
    img = Image.new("RGB", (size, size), (255, 255, 255))
    d = ImageDraw.Draw(img)
    m = size * 0.12
    rounded_rect(d, [m, m, size - m - 1, size - m - 1], int(size * 0.18), (0, 0, 0))
    cx = cy = size / 2
    s = size * 0.18
    d.polygon([(cx, cy-s), (cx+s*0.7, cy), (cx, cy+s), (cx-s*0.7, cy)], fill=WHITE)
    small = s * 0.55
    for ang in [10, 80, 170, 260]:
        rad = math.radians(ang)
        off = s * 1.7
        x = cx + math.cos(rad) * off
        y = cy + math.sin(rad) * off
        d.polygon([(x, y-small), (x+small*0.7, y), (x, y+small), (x-small*0.7, y)], fill=WHITE)
    return img


# ============================================================
# 2. Screenshots - 详见 store-screenshots 子文件
# ============================================================

def draw_sidebar(d, x, y, w, h, mode="light"):
    bg = WHITE if mode == "light" else DARK_CARD
    border = BORDER if mode == "light" else (50, 50, 50)
    rounded_rect(d, [x, y, x + w, y + h], 12, bg, outline=border)
    header_bg = SURFACE_LT if mode == "light" else (38, 33, 70)
    rounded_rect(d, [x, y, x + w, y + 50], 12, header_bg)
    draw_sparkle(d, x + 18, y + 25, 8, BRAND_A if mode == "light" else BRAND_B)
    text_color = DARK_TEXT if mode == "light" else DARK_TEXT_2
    text(d, x + 32, y + 17, "YouTube AI Summary", font(11, "bold"), text_color)
    rounded_rect(d, [x + w - 50, y + 12, x + w - 12, y + 38], 8, (217, 119, 6) if mode == "light" else GOLD_DARK)
    text(d, x + w - 31, y + 25, "PRO", font(8, "bold"), WHITE, anchor="mm")
    rounded_rect(d, [x + 12, y + 56, x + w - 12, y + 70], 4,
                 MID_TEXT if mode == "light" else (120, 120, 125))


def draw_summary_section(d, x, y, w, h, light=True):
    text_color = DARK_TEXT if light else DARK_TEXT_2
    rounded_rect(d, [x, y, x + 28, y + 4], 2, BRAND_A)
    text(d, x + 32, y - 8, "SUMMARY", font(8, "bold"), LIGHT_TEXT if light else (130, 130, 130))
    for i, ln in enumerate(["An introduction to AI agents:",
                            "how they reason, which tools",
                            "they use, and why 2025 is the year."]):
        text(d, x, y + 14 + i*14, ln, font(9), text_color)


def draw_keypoints(d, x, y, w, light=True):
    text_color = DARK_TEXT if light else DARK_TEXT_2
    text(d, x, y - 8, "KEY POINTS", font(8, "bold"), LIGHT_TEXT if light else (130, 130, 130))
    pts = [
        "Agents = LLM + memory + tools",
        "Tool use is the key shift in 2025",
        "Browser & OS are the new battleground",
        "Multi-agent frames often wins single agent"
    ]
    for i, p in enumerate(pts):
        cy = y + 18 + i * 14
        d.polygon([(x + 1, cy + 4), (x + 5, cy + 8), (x + 9, cy + 4)],
                  fill=BRAND_A if light else BRAND_B)
        text(d, x + 14, cy, p, font(9), text_color)


def draw_timeline(d, x, y, w, light=True):
    text_color = DARK_TEXT if light else DARK_TEXT_2
    text(d, x, y - 8, "TIMELINE", font(8, "bold"), LIGHT_TEXT if light else (130, 130, 130))
    items = [("0:00", "Intro"), ("2:35", "What is an Agent"),
             ("6:48", "Tool Use"), ("11:20", "Multi-Agent"),
             ("15:02", "Future Outlook")]
    for i, (ts, title) in enumerate(items):
        cy = y + 18 + i * 16
        rounded_rect(d, [x, cy - 1, x + 30, cy + 11], 3, BRAND_SOFT if light else (60, 50, 110))
        text(d, x + 15, cy + 5, ts, font(8, "bold"), BRAND_A, anchor="mm")
        text(d, x + 38, cy + 5, title, font(9), text_color, anchor="lm")


def mock_video(d, x, y, w, h):
    rounded_rect(d, [x, y, x + w, y + h], 8, (32, 32, 36))
    cx, cy, r = x + w/2, y + h/2, min(w, h) * 0.10
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(255, 0, 0))
    d.polygon([(cx - r*0.4, cy - r*0.55), (cx + r*0.55, cy), (cx - r*0.4, cy + r*0.55)], fill=WHITE)
    rounded_rect(d, [x + 12, y + h - 14, x + w - 12, y + h - 8], 3, (255, 255, 255, 80))
    rounded_rect(d, [x + 12, y + h - 14, x + 12 + int(w * 0.32), y + h - 8], 3, (255, 0, 0))


def screen_hero():
    canvas = Image.new("RGB", (1280, 800), SURFACE_BG)
    fill_gradient_vertical(canvas, (250, 245, 255), (221, 214, 254))
    d = ImageDraw.Draw(canvas)

    x0, y0 = 70, 100
    draw_sparkle(d, x0 + 12, y0 + 22, 14, BRAND_A)
    text(d, x0 + 36, y0 + 12, "YouTube AI Summary", font(20, "bold"), DARK_TEXT)
    text(d, x0, y0 + 80, "Summarize any", font(52, "bold"), DARK_TEXT)
    text(d, x0, y0 + 138, "YouTube video in 5s.", font(52, "bold"), BRAND_A)
    text(d, x0, y0 + 230, "AI-powered summaries with key points,", font(20), MID_TEXT)
    text(d, x0, y0 + 260, "a clickable timeline, and 5+ languages.", font(20), MID_TEXT)

    pill_y = y0 + 320
    pill_features = ["5-sec summaries", "Clickable Timeline", "5+ Languages", "One-click Copy"]
    px = x0
    for t in pill_features:
        pw = 7 * len(t) + 36
        rounded_rect(d, [px, pill_y, px + pw, pill_y + 38], 19, WHITE, outline=BORDER)
        d.ellipse([px + 14, pill_y + 13, px + 26, pill_y + 25], fill=BRAND_A)
        text(d, px + 32, pill_y + 11, t, font(12, "bold"), DARK_TEXT)
        px += pw + 12

    cta_y = y0 + 400
    rounded_rect(d, [x0, cta_y, x0 + 200, cta_y + 56], 28, BRAND_A)
    text(d, x0 + 100, cta_y + 28, "Add to Chrome - Free", font(16, "bold"), WHITE, anchor="mm")
    text(d, x0 + 220, cta_y + 16, "* * * * *   4.8", font(13), MID_TEXT)
    text(d, x0 + 220, cta_y + 36, "12,400+ users", font(13), MID_TEXT)

    sx, sy, sw, sh = 700, 90, 510, 660
    draw_sidebar(d, sx, sy, sw, sh, "light")
    mock_video(d, sx + 16, sy + 60, sw - 32, 220)
    text(d, sx + 16, sy + 292, "The Future of AI Agents - 2025", font(13, "bold"), DARK_TEXT)
    draw_summary_section(d, sx + 18, sy + 340, sw - 36, 60, light=True)
    draw_keypoints(d, sx + 18, sy + 422, sw - 36, light=True)
    draw_timeline(d, sx + 18, sy + 510, sw - 36, light=True)

    bx = sx + sw - 80
    by = sy + sh - 50
    rounded_rect(d, [bx - 100, by, bx - 12, by + 28], 14, BRAND_SOFT)
    text(d, bx - 56, by + 14, "Copy Summary", font(10, "bold"), BRAND_A, anchor="mm")

    return canvas


def screen_timeline():
    canvas = Image.new("RGB", (1280, 800), SURFACE_BG)
    fill_gradient_vertical(canvas, (255, 255, 255), (224, 231, 255))
    d = ImageDraw.Draw(canvas)

    draw_sparkle(d, 70, 70, 16, BRAND_A)
    text(d, 102, 58, "YouTube AI Summary", font(18, "bold"), DARK_TEXT)
    text(d, 70, 130, "Click any timestamp.", font(48, "bold"), DARK_TEXT)
    text(d, 70, 188, "Jump to what matters.", font(48, "bold"), BRAND_A)
    text(d, 70, 270, "Every AI summary comes with a timestamp. Click one and", font(18), MID_TEXT)
    text(d, 70, 296, "the video jumps. No more scrubbing.", font(18), MID_TEXT)

    video_x, video_y, video_w, video_h = 70, 380, 700, 360
    rounded_rect(d, [video_x, video_y, video_x + video_w, video_y + video_h], 12, (24, 24, 30))
    for i in range(8):
        seg_x = video_x + 12 + i * ((video_w - 24 - 7*6) / 8)
        seg_w = (video_w - 24 - 7*6) / 8
        grey = 60 + i * 8
        rounded_rect(d, [seg_x, video_y + 12, seg_x + seg_w, video_y + 200], 4, (grey, grey, grey))
    cx, cy = video_x + video_w/2, video_y + 110
    d.ellipse([cx-30, cy-30, cx+30, cy+30], fill=(255, 0, 0))
    d.polygon([(cx-12, cy-18), (cx+18, cy), (cx-12, cy+18)], fill=WHITE)

    markers = [(0, "0:00", "Intro"),
               (160, "2:35", "What is Agent"),
               (340, "6:48", "Tool Use"),
               (520, "11:20", "Multi-Agent"),
               (700, "15:02", "Future")]

    pb_y = video_y + 230
    rounded_rect(d, [video_x + 12, pb_y, video_x + video_w - 12, pb_y + 6], 3, (80, 80, 90))
    rounded_rect(d, [video_x + 12, pb_y, video_x + 12 + int((video_w-24) * 0.42), pb_y + 6], 3, (255, 0, 0))

    for frac, ts, label in markers:
        tx = video_x + 12 + int((video_w - 24) * frac / 700)
        d.line([(tx, pb_y + 4), (tx, pb_y + 16)], fill=WHITE, width=2)
        rounded_rect(d, [tx - 28, pb_y + 20, tx + 28, pb_y + 50], 6, BRAND_A)
        text(d, tx, pb_y + 27, ts, font(9, "bold"), WHITE, anchor="mt")
        text(d, tx, pb_y + 38, label, font(8), WHITE, anchor="mt")

    sb_x, sb_y, sb_w, sb_h = 800, 80, 410, 660
    rounded_rect(d, [sb_x, sb_y, sb_x + sb_w, sb_y + sb_h], 12, WHITE, outline=BORDER)
    rounded_rect(d, [sb_x, sb_y, sb_x + sb_w, sb_y + 50], 12, SURFACE_LT)
    draw_sparkle(d, sb_x + 18, sb_y + 25, 8, BRAND_A)
    text(d, sb_x + 32, sb_y + 17, "Timeline", font(13, "bold"), DARK_TEXT)
    sections = [
        ("00:00", "Video intro", True),
        ("02:35", "Define AI agents", True),
        ("06:48", "How tool use works", False),
        ("11:20", "Multi-agent patterns", False),
        ("15:02", "Future Outlook", False),
    ]
    for i, (ts, title, active) in enumerate(sections):
        iy = sb_y + 80 + i * 56
        if active:
            rounded_rect(d, [sb_x + 14, iy, sb_x + sb_w - 14, iy + 44], 8, SURFACE_LT, outline=BRAND_A)
        rounded_rect(d, [sb_x + 22, iy + 10, sb_x + 72, iy + 34], 4, BRAND_A)
        text(d, sb_x + 47, iy + 22, ts, font(10, "bold"), WHITE, anchor="mm")
        text(d, sb_x + 82, iy + 22, title, font(11), DARK_TEXT, anchor="lm")

    return canvas


def screen_translate():
    canvas = Image.new("RGB", (1280, 800), SURFACE_BG)
    fill_gradient_vertical(canvas, (250, 245, 255), (245, 232, 255))
    d = ImageDraw.Draw(canvas)
    text(d, 70, 90, "Translate to 5+ languages.", font(48, "bold"), DARK_TEXT)
    text(d, 70, 148, "Read every video. In your language.", font(48, "bold"), BRAND_A)
    text(d, 70, 230, "Don't speak Japanese? Summarize it in English.", font(18), MID_TEXT)

    sx, sy, sw, sh = 70, 320, 1140, 420
    rounded_rect(d, [sx, sy, sx + sw, sy + sh], 16, WHITE, outline=BORDER)
    inner_pad = 24
    half_w = (sw - 80) / 2
    rounded_rect(d, [sx + inner_pad, sy + inner_pad, sx + inner_pad + half_w, sy + sh - inner_pad],
                 12, (245, 245, 248))
    text(d, sx + inner_pad + 16, sy + inner_pad + 12, "Japanese (source)", font(14, "bold"), DARK_TEXT)
    y_cur = sy + inner_pad + 60
    src_lines = [
        "AI agents evolve rapidly in 2025.",
        "Tool Use + Memory is the key combo,",
        "Browser became a new battleground.",
        "Multi-agent frameworks often beat",
        "single agent on complex tasks that",
        "require multi-step reasoning."
    ]
    for ln in src_lines:
        rounded_rect(d, [sx + inner_pad + 16, y_cur, sx + inner_pad + 16 + (len(ln)*4.5), y_cur + 12], 4, MID_TEXT)
        y_cur += 18

    ax = sx + inner_pad + half_w + 24
    ay = sy + sh/2
    d.polygon([(ax, ay - 16), (ax + 40, ay), (ax, ay + 16)], fill=BRAND_A)
    rounded_rect(d, [ax - 60, ay + 24, ax + 40, ay + 50], 6, BRAND_A)
    text(d, ax - 10, ay + 38, "AI Translate", font(9, "bold"), WHITE, anchor="mm")

    rx = sx + inner_pad + half_w + 80
    rw = half_w
    rounded_rect(d, [rx, sy + inner_pad, rx + rw, sy + sh - inner_pad], 12, SURFACE_LT)
    text(d, rx + 16, sy + inner_pad + 12, "English (translated)", font(14, "bold"), BRAND_A)
    text(d, rx + 16, sy + inner_pad + 60, "AI agents evolve rapidly in 2025.", font(13), DARK_TEXT)
    text(d, rx + 16, sy + inner_pad + 84, "Tool Use + Memory = the winning combo.", font(13), DARK_TEXT)
    text(d, rx + 16, sy + inner_pad + 130, "KEY POINTS", font(9, "bold"), LIGHT_TEXT)
    target_bullets = [
        "Tool use is the key inflection in 2025",
        "Browser becomes the new battleground",
        "Multi-agent beats single-agent on complex tasks"
    ]
    for i, b in enumerate(target_bullets):
        cy = sy + inner_pad + 152 + i * 26
        d.polygon([(rx + 18, cy + 4), (rx + 24, cy + 10), (rx + 30, cy + 4)], fill=BRAND_A)
        text(d, rx + 36, cy + 6, b, font(12), DARK_TEXT)

    chip_y = 770
    langs = ["Auto", "English", "Chinese", "Japanese", "Spanish", "Korean", "French"]
    cx = 70
    for lang in langs:
        chip_w = 7 * len(lang) + 28
        rounded_rect(d, [cx, chip_y, cx + chip_w, chip_y + 36], 18,
                     BRAND_A if lang == "English" else WHITE,
                     outline=BRAND_A if lang != "English" else BORDER)
        col = WHITE if lang == "English" else DARK_TEXT
        text(d, cx + chip_w/2, chip_y + 18, lang, font(12, "bold"), col, anchor="mm")
        cx += chip_w + 8

    return canvas


def screen_pro():
    canvas = Image.new("RGB", (1280, 800), SURFACE_BG)
    fill_gradient_vertical(canvas, (255, 251, 235), (254, 243, 199))
    d = ImageDraw.Draw(canvas)

    draw_sparkle(d, 70, 70, 16, BRAND_A)
    text(d, 102, 58, "YouTube AI Summary", font(18, "bold"), DARK_TEXT)
    text(d, 70, 130, "Upgrade to Pro", font(56, "bold"), DARK_TEXT)
    text(d, 70, 200, "$5 / month. Cancel anytime.", font(40, "bold"), GOLD_DARK)
    text(d, 70, 280, "Unlimited summaries. Stronger models. Long videos.", font(18), MID_TEXT)

    cx, cy, cw, ch = 70, 350, 580, 380
    rounded_rect(d, [cx, cy, cx + cw, cy + ch], 20, WHITE, outline=GOLD)
    rounded_rect(d, [cx, cy, cx + cw, cy + 40], 20, GOLD)
    rounded_rect(d, [cx, cy + 20, cx + cw, cy + 60], 20, GOLD)
    text(d, cx + 24, cy + 20, "PRO", font(18, "bold"), WHITE)
    text(d, cx + cw - 24, cy + 20, "$5/mo", font(22, "bold"), WHITE, anchor="rt")

    feats = [
        ("v", "Unlimited summaries"),
        ("v", "GPT-4.1 (smarter than GPT-4o-mini)"),
        ("v", "Long videos (>1 hour) supported"),
        ("v", "Priority generation queue"),
        ("v", "Translate to 10+ languages"),
        ("v", "Export to Notion / Slack / Obsidian"),
    ]
    for i, (ic, txt) in enumerate(feats):
        iy = cy + 90 + i * 42
        ix = cx + 32
        rounded_rect(d, [ix, iy, ix + 36, iy + 28], 8, BRAND_SOFT)
        text(d, ix + 18, iy + 14, ic, font(14, "bold"), BRAND_A, anchor="mm")
        text(d, ix + 56, iy + 8, txt, font(15), DARK_TEXT)

    btn_y = cy + ch - 70
    rounded_rect(d, [cx + 32, btn_y, cx + cw - 32, btn_y + 48], 24, BRAND_A)
    text(d, cx + cw/2, btn_y + 24, "Start 7-day free trial", font(15, "bold"), WHITE, anchor="mm")

    sb_x, sb_y, sb_w, sb_h = 720, 130, 480, 600
    draw_sidebar(d, sb_x, sb_y, sb_w, sb_h, "light")
    mock_video(d, sb_x + 16, sb_y + 60, sb_w - 32, 200)
    text(d, sb_x + 16, sb_y + 272, "Why AI Agents Change Everything  -  47 min", font(11, "bold"), DARK_TEXT)
    draw_summary_section(d, sb_x + 18, sb_y + 320, sb_w - 36, 60, light=True)
    draw_keypoints(d, sb_x + 18, sb_y + 402, sb_w - 36, light=True)
    px = sb_x + 18
    py = sb_y + 480
    pw = sb_w - 36
    rounded_rect(d, [px, py, px + pw, py + 80], 12, (255, 247, 219))
    text(d, px + 12, py + 12, "Crown", font(16), GOLD_DARK)
    text(d, px + 12, py + 36, "You're on Free plan", font(13, "bold"), DARK_TEXT)
    text(d, px + 12, py + 56, "5 / 5 used today", font(11), MID_TEXT)
    bx = px + pw - 130
    by = py + 24
    rounded_rect(d, [bx, by, bx + 118, by + 38], 19, GOLD)
    text(d, bx + 59, by + 19, "Upgrade $5/mo", font(11, "bold"), WHITE, anchor="mm")

    return canvas


def screen_dark():
    canvas = Image.new("RGB", (1280, 800), DARK_BG)
    fill_gradient_vertical(canvas, (24, 24, 30), (10, 10, 14))
    d = ImageDraw.Draw(canvas)

    draw_sparkle(d, 70, 70, 16, BRAND_B)
    text(d, 102, 58, "YouTube AI Summary", font(18, "bold"), DARK_TEXT_2)
    text(d, 70, 130, "Light & dark themes.", font(48, "bold"), DARK_TEXT_2)
    text(d, 70, 188, "Auto. Always.", font(48, "bold"), BRAND_B)
    text(d, 70, 270, "Sidebar blends naturally with YouTube's", font(18), (160, 160, 160))
    text(d, 70, 296, "dark theme. Toggle once, never again.", font(18), (160, 160, 160))

    sx, sy, sw, sh = 750, 80, 460, 660
    draw_sidebar(d, sx, sy, sw, sh, "dark")
    rounded_rect(d, [sx + 16, sy + 60, sx + sw - 16, sy + 280], 8, (15, 15, 18))
    cxv, cyv, rv = sx + sw/2, sy + 170, 28
    d.ellipse([cxv - rv, cyv - rv, cxv + rv, cyv + rv], fill=(255, 0, 0))
    d.polygon([(cxv - 10, cyv - 14), (cxv + 16, cyv), (cxv - 10, cyv + 14)], fill=WHITE)

    text(d, sx + 18, sy + 320, "SUMMARY", font(8, "bold"), (130, 130, 140))
    rounded_rect(d, [sx + 18, sy + 340, sx + 18 + 320, sy + 352], 4, (200, 200, 200))
    rounded_rect(d, [sx + 18, sy + 358, sx + 18 + 280, sy + 370], 4, (200, 200, 200))
    rounded_rect(d, [sx + 18, sy + 376, sx + 18 + 200, sy + 388], 4, (200, 200, 200))

    text(d, sx + 18, sy + 410, "TIMELINE", font(8, "bold"), (130, 130, 140))
    items = [("0:00", "Intro"), ("2:35", "AI Agents"),
             ("6:48", "Tool Use"), ("11:20", "Multi-Agent")]
    for i, (ts, title) in enumerate(items):
        iy = sy + 430 + i * 18
        rounded_rect(d, [sx + 18, iy, sx + 50, iy + 12], 4, BRAND_C)
        text(d, sx + 34, iy + 6, ts, font(8, "bold"), WHITE, anchor="mm")
        text(d, sx + 58, iy + 4, title, font(9), (220, 220, 225))

    fx = sx + 18
    fy = sy + sh - 60
    fw = sw - 36
    rounded_rect(d, [fx, fy, fx + fw, fy + 40], 8, (60, 50, 110))
    text(d, fx + fw/2, fy + 20, "Auto-sync with YouTube dark mode",
         font(10), BRAND_B, anchor="mm")

    lcx, lcy, lc_w, lc_h = 90, 380, 320, 200
    rounded_rect(d, [lcx, lcy, lcx + lc_w, lcy + lc_h], 12, WHITE, outline=BORDER)
    text(d, lcx + 14, lcy + 14, "[ ] Light", font(13, "bold"), DARK_TEXT)
    rounded_rect(d, [lcx + 14, lcy + 40, lcx + 280, lcy + 50], 4, MID_TEXT)
    rounded_rect(d, [lcx + 14, lcy + 60, lcx + 260, lcy + 70], 4, MID_TEXT)
    rounded_rect(d, [lcx + 14, lcy + 80, lcx + 240, lcy + 90], 4, MID_TEXT)

    dcx, dcy = 90, 600
    rounded_rect(d, [dcx, dcy, dcx + lc_w, dcy + lc_h], 12, DARK_CARD, outline=(50, 50, 55))
    text(d, dcx + 14, dcy + 14, "[ ] Dark", font(13, "bold"), DARK_TEXT_2)
    rounded_rect(d, [dcx + 14, dcy + 40, dcx + 280, dcy + 50], 4, (180, 180, 185))
    rounded_rect(d, [dcx + 14, dcy + 60, dcx + 260, dcy + 70], 4, (180, 180, 185))
    rounded_rect(d, [dcx + 14, dcy + 80, dcx + 240, dcy + 90], 4, (180, 180, 185))

    return canvas


# ============================================================
# Run
# ============================================================

def main():
    print("=== LOGOS ===")
    for sz in [16, 32, 48, 128]:
        make_logo(sz).convert("RGB").save(f"{ASSETS}/icon-{sz}.png")
        print(f"  icon-{sz}.png")
    make_logo(512).convert("RGB").save(f"{ASSETS}/icon-512.png")
    print("  icon-512.png")
    make_mono_logo(128).save(f"{ASSETS}/icon-mono-128.png")
    print("  icon-mono-128.png")

    print()
    print("=== STORE SCREENSHOTS ===")
    screens = [
        ("01-hero",        screen_hero),
        ("02-timeline",    screen_timeline),
        ("03-translate",   screen_translate),
        ("04-pro-upgrade", screen_pro),
        ("05-dark-mode",   screen_dark),
    ]
    for name, fn in screens:
        img = fn()
        p1 = f"{SCREENS}/{name}.png"
        p2 = f"{ROOT}/api/public/store-screenshots/{name}.png"
        img.save(p1, "PNG", optimize=True)
        img.save(p2, "PNG", optimize=True)
        print(f"  {name}.png ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
