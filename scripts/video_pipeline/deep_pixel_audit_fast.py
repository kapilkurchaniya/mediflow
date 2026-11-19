import os
import glob
import re
import html
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(PIPELINE_DIR))
TUTORIALS_DIR = os.path.join(PROJECT_DIR, "recordings", "tutorials")

dirs = sorted(glob.glob(os.path.join(TUTORIALS_DIR, "VID-*")))

def audit_directory(d):
    vid = os.path.basename(d)
    is_hi = vid.endswith("-hi")
    
    intro_svg_path = os.path.join(d, "intro.svg")
    intro_png_path = os.path.join(d, "intro.png")
    outro_svg_path = os.path.join(d, "outro.svg")
    outro_png_path = os.path.join(d, "outro.png")
    
    issues = []

    # 1. PIXEL CHECK INTRO TOP PILL
    if os.path.exists(intro_svg_path) and os.path.exists(intro_png_path):
        with open(intro_svg_path, 'r', encoding='utf-8') as f:
            c = f.read()
        m_pill = re.search(r'y=\"-230\"\s+width=\"(\d+)\"', c) or re.search(r'width=\"(\d+)\"\s+height=\"48\"', c)
        m_series = re.search(r'y=\"-199\"[^>]*>\s*(.*?)\s*</text>', c, re.DOTALL)
        
        if m_pill and m_series:
            pill_w = int(m_pill.group(1))
            pill_left = 960 - pill_w // 2
            pill_right = 960 + pill_w // 2
            series_text = html.unescape(m_series.group(1).strip())

            img_intro = Image.open(intro_png_path).convert('RGB')
            crop = img_intro.crop((0, 332, 1920, 347))
            raw = crop.tobytes()
            cw, ch = crop.size
            
            cyan_xs = []
            for y in range(ch):
                row_off = y * cw * 3
                for x in range(cw):
                    idx = row_off + x * 3
                    r, g, b = raw[idx], raw[idx+1], raw[idx+2]
                    if g > 130 and b > 180 and r < 100:
                        cyan_xs.append(x)
            
            if cyan_xs:
                t_left = min(cyan_xs)
                t_right = max(cyan_xs)
                
                left_bleed = max(0, pill_left - t_left)
                right_bleed = max(0, t_right - pill_right)
                left_margin = t_left - pill_left
                right_margin = pill_right - t_right

                if left_bleed > 0 or right_bleed > 0:
                    issues.append({
                        "card": "intro",
                        "severity": "CRITICAL_OVERFLOW",
                        "element": "top_pill",
                        "desc": f"Top pill text overflows container: text [{t_left}..{t_right}] ({t_right-t_left}px) vs pill [{pill_left}..{pill_right}] ({pill_w}px). Left bleed={left_bleed}px, Right bleed={right_bleed}px",
                        "text": series_text,
                        "pill_w": pill_w,
                        "text_w": t_right - t_left
                    })
                elif left_margin < 18 or right_margin < 18:
                    issues.append({
                        "card": "intro",
                        "severity": "BORDER_COLLISION",
                        "element": "top_pill",
                        "desc": f"Top pill text crashes into rounded endcap borders (left margin: {left_margin}px, right margin: {right_margin}px; safe min 20px). Text [{t_left}..{t_right}], pill [{pill_left}..{pill_right}] ({pill_w}px)",
                        "text": series_text,
                        "pill_w": pill_w,
                        "text_w": t_right - t_left
                    })

    # 2. PIXEL CHECK OUTRO TAKEAWAY & BANNER
    if os.path.exists(outro_svg_path) and os.path.exists(outro_png_path):
        with open(outro_svg_path, 'r', encoding='utf-8') as f:
            c_out = f.read()

        img_outro = Image.open(outro_png_path).convert('RGB')
        crop_out = img_outro.crop((0, 360, 1920, 460))
        raw_out = crop_out.tobytes()
        ow, oh = crop_out.size
        
        white_xs = []
        for y in range(oh):
            row_off = y * ow * 3
            for x in range(ow):
                idx = row_off + x * 3
                r, g, b = raw_out[idx], raw_out[idx+1], raw_out[idx+2]
                if r > 200 and g > 200 and b > 200:
                    white_xs.append(x)
        
        if white_xs:
            w_left = min(white_xs)
            w_right = max(white_xs)
            total_w = w_right - w_left

            # Extract takeaway text snippet from svg
            m_tk = re.search(r'<!-- Takeaway Text.*?-->(.*?)<!-- Next Part Banner', c_out, re.DOTALL)
            tk_snippet = ""
            if m_tk:
                tk_lines = re.findall(r'<text[^>]*>\s*(.*?)\s*</text>', m_tk.group(1), re.DOTALL)
                tk_snippet = " // ".join(l.strip() for l in tk_lines)

            if w_left < 15 or w_right > 1905:
                issues.append({
                    "card": "outro",
                    "severity": "CRITICAL_CANVAS_BLEED",
                    "element": "takeaway_text",
                    "desc": f"Takeaway text bleeds offscreen / clips canvas border: text spans [{w_left}..{w_right}] (width {total_w}px) on 1920 canvas! Margins: left {w_left}px, right {1920-w_right}px",
                    "text": tk_snippet
                })
            elif w_left < 80 or w_right > 1840:
                issues.append({
                    "card": "outro",
                    "severity": "CANVAS_MARGIN_BREACH",
                    "element": "takeaway_text",
                    "desc": f"Takeaway text extends dangerously close to screen edge: text spans [{w_left}..{w_right}] (width {total_w}px, margin {w_left}px left / {1920-w_right}px right; recommended min 120px)",
                    "text": tk_snippet
                })

    return vid, issues

with ThreadPoolExecutor(max_workers=8) as executor:
    results = list(executor.map(audit_directory, dirs))

report = {vid: iss for vid, iss in results if iss}

print(f"=== FAST DEEP PIXEL AUDIT COMPLETE ===")
print(f"Scanned: {len(dirs)} tutorials")
print(f"Tutorials with issues: {len(report)}")
print()

categories = {
    "CRITICAL_OVERFLOW": [],
    "BORDER_COLLISION": [],
    "CRITICAL_CANVAS_BLEED": [],
    "CANVAS_MARGIN_BREACH": []
}

for vid in sorted(report.keys()):
    for item in report[vid]:
        categories[item["severity"]].append((vid, item))

print(f"### 1. CRITICAL CONTAINER OVERFLOWS ({len(categories['CRITICAL_OVERFLOW'])} videos)")
for vid, item in categories["CRITICAL_OVERFLOW"]:
    print(f"  - [{vid}] [{item['card'].upper()}] {item['desc']}")
    if "text" in item:
        print(f"    Text: \"{item['text'][:80]}\"")

print(f"\n### 2. CRITICAL CANVAS BLEEDS (Text clipped off-screen) ({len(categories['CRITICAL_CANVAS_BLEED'])} videos)")
for vid, item in categories["CRITICAL_CANVAS_BLEED"]:
    print(f"  - [{vid}] [{item['card'].upper()}] {item['desc']}")
    if "text" in item:
        print(f"    Text: \"{item['text'][:80]}\"")

print(f"\n### 3. BORDER COLLISIONS (Text smashing into rounded pill caps) ({len(categories['BORDER_COLLISION'])} videos)")
for vid, item in categories["BORDER_COLLISION"]:
    print(f"  - [{vid}] [{item['card'].upper()}] {item['desc']}")
    if "text" in item:
        print(f"    Text: \"{item['text'][:80]}\"")

print(f"\n### 4. CANVAS MARGIN BREACHES (Single-line takeaways stretching wall-to-wall) ({len(categories['CANVAS_MARGIN_BREACH'])} videos)")
for vid, item in categories["CANVAS_MARGIN_BREACH"]:
    print(f"  - [{vid}] [{item['card'].upper()}] {item['desc']}")
    if "text" in item:
        print(f"    Text: \"{item['text'][:80]}\"")
