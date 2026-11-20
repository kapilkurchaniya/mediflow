import os
import glob
import re
import html
from PIL import Image, ImageFont

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(PIPELINE_DIR))
TUTORIALS_DIR = os.path.join(PROJECT_DIR, "recordings", "tutorials")

font_en_bold = {
    16: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 16),
    17: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 17),
    18: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 18),
    22: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 22),
    24: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 24),
    25: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 25),
    26: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 26),
    28: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 28),
    46: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 46),
    52: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 52),
}
font_en_regular = {
    21: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Regular.ttf", 21),
    24: ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Regular.ttf", 24),
}

font_hi_bold = {
    16: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 16),
    17: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 17),
    18: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 18),
    22: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 22),
    24: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 24),
    25: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 25),
    26: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 26),
    28: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 28),
    46: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 46),
    52: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSansBold.otf", 52),
}
font_hi_regular = {
    21: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSans.otf", 21),
    24: ImageFont.truetype("/usr/share/fonts/gnu-free/FreeSans.otf", 24),
}

def get_font(is_hi, style, size):
    size_map = [16, 17, 18, 21, 22, 24, 25, 26, 28, 46, 52]
    closest_size = min(size_map, key=lambda x: abs(x - size))
    if style == 'bold':
        table = font_hi_bold if is_hi else font_en_bold
    else:
        table = font_hi_regular if is_hi else font_en_regular
    return table.get(closest_size, font_en_bold[18])

def measure_text(text, font, letter_spacing=0.0):
    bbox = font.getbbox(text)
    w = bbox[2] - bbox[0]
    if letter_spacing > 0:
        w += len(text) * letter_spacing
    return w

dirs = sorted(glob.glob(os.path.join(TUTORIALS_DIR, "VID-*")))

issues = []

for d in dirs:
    vid = os.path.basename(d)
    is_hi = vid.endswith("-hi")
    
    intro_svg_path = os.path.join(d, "intro.svg")
    intro_png_path = os.path.join(d, "intro.png")
    outro_svg_path = os.path.join(d, "outro.svg")
    outro_png_path = os.path.join(d, "outro.png")
    
    vid_issues = []

    # 1. Audit INTRO
    if not os.path.exists(intro_svg_path):
        vid_issues.append({"type": "INTRO_SVG_MISSING", "desc": "intro.svg missing"})
    else:
        with open(intro_svg_path, 'r', encoding='utf-8') as f:
            intro_svg = f.read()

        # Top pill rect
        m_pill = re.search(r'y=\"-230\"\s+width=\"(\d+)\"', intro_svg) or re.search(r'width=\"(\d+)\"\s+height=\"48\"', intro_svg)
        m_series = re.search(r'y=\"-199\"[^>]*letter-spacing=\"([0-9.]+)\"[^>]*>\s*(.*?)\s*</text>', intro_svg, re.DOTALL) or re.search(r'y=\"-199\"[^>]*>\s*(.*?)\s*</text>', intro_svg, re.DOTALL)
        m_series_fs = re.search(r'y=\"-199\"[^>]*font-size=\"(\d+)\"', intro_svg)
        m_series_ls = re.search(r'y=\"-199\"[^>]*letter-spacing=\"([0-9.]+)\"', intro_svg)

        pill_w = int(m_pill.group(1)) if m_pill else 0
        series_text = html.unescape(m_series.group(2 if len(m_series.groups()) >= 2 else 1).strip()) if m_series else ""
        series_fs = int(m_series_fs.group(1)) if m_series_fs else 18
        series_ls = float(m_series_ls.group(1)) if m_series_ls else 0.0

        if series_text and pill_w > 0:
            f = get_font(is_hi, 'bold', series_fs)
            tw = measure_text(series_text, f, series_ls)
            # Pill has rounded caps rx=24 (48px combined). Safe inner width is pill_w - 40
            safe_pill_w = pill_w - 36
            if tw > safe_pill_w:
                vid_issues.append({
                    "card": "intro",
                    "type": "TOP_PILL_OVERFLOW",
                    "element": "series_pill",
                    "text": series_text,
                    "text_width": round(tw),
                    "container_width": pill_w,
                    "safe_width": safe_pill_w,
                    "overflow_px": round(tw - pill_w)
                })

        # Subtitle check
        m_sub = re.search(r'y=\"-10\"[^>]*>\s*(.*?)\s*</text>', intro_svg, re.DOTALL)
        m_sub_fs = re.search(r'y=\"-10\"[^>]*font-size=\"(\d+)\"', intro_svg)
        if m_sub:
            sub_text = html.unescape(m_sub.group(1).strip())
            sub_fs = int(m_sub_fs.group(1)) if m_sub_fs else 24
            f_sub = get_font(is_hi, 'regular', sub_fs)
            sub_w = measure_text(sub_text, f_sub)
            if sub_w > 1820:
                vid_issues.append({
                    "card": "intro",
                    "type": "SUBTITLE_BLEED",
                    "element": "subtitle",
                    "text": sub_text,
                    "text_width": round(sub_w),
                    "container_width": 1920,
                    "overflow_px": round(sub_w - 1820)
                })

        # Badge check
        m_badge_rect = re.search(r'y=\"-32\"\s+width=\"(\d+)\"', intro_svg)
        m_badge_text = re.search(r'y=\"11\"[^>]*>\s*(.*?)\s*</text>', intro_svg, re.DOTALL)
        if m_badge_rect and m_badge_text:
            badge_w = int(m_badge_rect.group(1))
            badge_t = html.unescape(m_badge_text.group(1).strip())
            # mono font at 24px is roughly 14.4px per char
            mono_w = len(badge_t) * 14.5
            if mono_w > (badge_w - 30):
                vid_issues.append({
                    "card": "intro",
                    "type": "BADGE_OVERFLOW",
                    "element": "shortcut_badge",
                    "text": badge_t,
                    "text_width": round(mono_w),
                    "container_width": badge_w,
                    "overflow_px": round(mono_w - badge_w)
                })

    # 2. Audit OUTRO
    if not os.path.exists(outro_svg_path):
        vid_issues.append({"type": "OUTRO_SVG_MISSING", "desc": "outro.svg missing"})
    else:
        with open(outro_svg_path, 'r', encoding='utf-8') as f:
            outro_svg = f.read()

        # Outro takeaway
        # Check if takeaway has multiple text lines or single line
        # Find all text tags between <!-- Takeaway Text ... --> and <!-- Next Part Banner
        takeaway_block_m = re.search(r'<!-- Takeaway Text.*?-->(.*?)<!-- Next Part Banner', outro_svg, re.DOTALL)
        if takeaway_block_m:
            tk_block = takeaway_block_m.group(1)
            t_lines = re.findall(r'<text\s+x=\"0\"\s+y=\"([-\d]+)\"[^>]*font-size=\"(\d+)\"[^>]*>\s*(.*?)\s*</text>', tk_block, re.DOTALL)
            if not t_lines:
                # older format without font-size in text tag or different attrs
                t_lines = re.findall(r'<text[^>]*y=\"([-\d]+)\"[^>]*>\s*(.*?)\s*</text>', tk_block, re.DOTALL)
                t_lines = [(tl[0], 25, tl[1]) for tl in t_lines]
            
            for y_str, fs_str, line_text in t_lines:
                clean_line = html.unescape(line_text.strip())
                if not clean_line:
                    continue
                fs = int(fs_str)
                f_tk = get_font(is_hi, 'bold', fs)
                lw = measure_text(clean_line, f_tk)
                if lw > 1780:
                    vid_issues.append({
                        "card": "outro",
                        "type": "OUTRO_TAKEAWAY_BLEED",
                        "element": "takeaway_line",
                        "text": clean_line,
                        "text_width": round(lw),
                        "container_width": 1920,
                        "overflow_px": round(lw - 1780)
                    })

        # Outro next part card
        m_card = re.search(r'y=\"-55\"\s+width=\"(\d+)\"', outro_svg) or re.search(r'width=\"(\d+)\"\s+height=\"135\"', outro_svg)
        m_next_title = re.search(r'y=\"44\"[^>]*>\s*(.*?)\s*</text>', outro_svg, re.DOTALL)
        m_next_fs = re.search(r'y=\"44\"[^>]*font-size=\"(\d+)\"', outro_svg)

        if m_card and m_next_title:
            card_w = int(m_card.group(1))
            next_t = html.unescape(m_next_title.group(1).strip())
            next_fs = int(m_next_fs.group(1)) if m_next_fs else 26
            f_next = get_font(is_hi, 'bold', next_fs)
            nw = measure_text(next_t, f_next)
            # card rx=24, safe width card_w - 48
            safe_card_w = card_w - 40
            if nw > safe_card_w:
                vid_issues.append({
                    "card": "outro",
                    "type": "OUTRO_NEXT_BANNER_OVERFLOW",
                    "element": "next_part_title",
                    "text": next_t,
                    "text_width": round(nw),
                    "container_width": card_w,
                    "safe_width": safe_card_w,
                    "overflow_px": round(nw - card_w)
                })

    # 3. Check PNG images directly
    if not os.path.exists(intro_png_path) or os.path.getsize(intro_png_path) == 0:
        vid_issues.append({"card": "intro", "type": "INTRO_PNG_MISSING", "element": "intro.png"})
    if not os.path.exists(outro_png_path) or os.path.getsize(outro_png_path) == 0:
        vid_issues.append({"card": "outro", "type": "OUTRO_PNG_MISSING", "element": "outro.png"})

    if vid_issues:
        issues.append((vid, vid_issues))

print(f"=== AUDIT SUMMARY ===")
print(f"Total video directories scanned: {len(dirs)}")
print(f"Total directories with issues: {len(issues)}")
print()

for vid, iss in issues:
    print(f"[{vid}] ({len(iss)} issue{'s' if len(iss)>1 else ''}):")
    for item in iss:
        if "overflow_px" in item:
            print(f"  - [{item['card'].upper()}] {item['type']} in {item['element']}: width={item['text_width']}px vs box={item['container_width']}px (OVERFLOW: {item['overflow_px']}px)")
            print(f"    Text: \"{item['text'][:75]}\"")
        else:
            print(f"  - {item}")
