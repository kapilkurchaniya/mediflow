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

def audit_video(d):
    vid = os.path.basename(d)
    is_hi = vid.endswith("-hi")
    
    intro_svg_path = os.path.join(d, "intro.svg")
    intro_png_path = os.path.join(d, "intro.png")
    outro_svg_path = os.path.join(d, "outro.svg")
    outro_png_path = os.path.join(d, "outro.png")
    
    defects = []

    # 1. INTRO AUDIT
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
            
            # Find text pixels (cyan, G>130, B>180, R<100)
            # Separate outer overflow from inner text
            outer_left_xs = []
            outer_right_xs = []
            inner_xs = []

            for y in range(ch):
                row_off = y * cw * 3
                for x in range(cw):
                    idx = row_off + x * 3
                    r, g, b = raw[idx], raw[idx+1], raw[idx+2]
                    if g > 130 and b > 180 and r < 100:
                        # Exclude pill stroke at [pill_left-2..pill_left+2] and [pill_right-2..pill_right+2]
                        if x < pill_left - 3:
                            outer_left_xs.append(x)
                        elif x > pill_right + 3:
                            outer_right_xs.append(x)
                        elif (pill_left + 2) < x < (pill_right - 2):
                            inner_xs.append(x)
            
            if outer_left_xs or outer_right_xs:
                t_min = min(outer_left_xs) if outer_left_xs else min(inner_xs)
                t_max = max(outer_right_xs) if outer_right_xs else max(inner_xs)
                l_bleed = max(0, pill_left - t_min)
                r_bleed = max(0, t_max - pill_right)
                defects.append({
                    "type": "INTRO_PILL_OVERFLOW",
                    "card": "intro",
                    "severity": "CRITICAL",
                    "pill_width": pill_w,
                    "text_span": [t_min, t_max],
                    "text_width": t_max - t_min,
                    "left_bleed": l_bleed,
                    "right_bleed": r_bleed,
                    "text": series_text,
                    "desc": f"Top pill text overflows container: text spans [{t_min}..{t_max}] ({t_max-t_min}px) vs pill [{pill_left}..{pill_right}] ({pill_w}px). Left bleed={l_bleed}px, right bleed={r_bleed}px."
                })
            elif inner_xs:
                t_min = min(inner_xs)
                t_max = max(inner_xs)
                l_margin = t_min - pill_left
                r_margin = pill_right - t_max
                if l_margin < 15 or r_margin < 15:
                    defects.append({
                        "type": "INTRO_PILL_COLLISION",
                        "card": "intro",
                        "severity": "WARNING",
                        "pill_width": pill_w,
                        "text_span": [t_min, t_max],
                        "text_width": t_max - t_min,
                        "left_margin": l_margin,
                        "right_margin": r_margin,
                        "text": series_text,
                        "desc": f"Top pill text crashes into rounded endcap borders: margins are {l_margin}px left / {r_margin}px right (min 20px required for rx=24). Pill [{pill_left}..{pill_right}] ({pill_w}px)."
                    })

    # 2. OUTRO AUDIT
    if os.path.exists(outro_svg_path) and os.path.exists(outro_png_path):
        with open(outro_svg_path, 'r', encoding='utf-8') as f:
            c_out = f.read()

        img_outro = Image.open(outro_png_path).convert('RGB')
        crop_out = img_outro.crop((0, 360, 460, 1920))
        # Note: crop box is (left, upper, right, lower)
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

            m_tk = re.search(r'<!-- Takeaway Text.*?-->(.*?)<!-- Next Part Banner', c_out, re.DOTALL)
            tk_snippet = ""
            if m_tk:
                tk_lines = re.findall(r'<text[^>]*>\s*(.*?)\s*</text>', m_tk.group(1), re.DOTALL)
                tk_snippet = " // ".join(l.strip() for l in tk_lines)

            # Canvas width 1920:
            # Critical clipping: left < 15 or right > 1905
            if w_left < 15 or w_right > 1905:
                defects.append({
                    "type": "OUTRO_TAKEAWAY_CLIPPED",
                    "card": "outro",
                    "severity": "CRITICAL",
                    "text_span": [w_left, w_right],
                    "text_width": total_w,
                    "left_margin": w_left,
                    "right_margin": 1920 - w_right,
                    "text": tk_snippet,
                    "desc": f"Outro takeaway text clips / bleeds offscreen: span [{w_left}..{w_right}] (width {total_w}px). Left margin={w_left}px, right margin={1920-w_right}px."
                })
            elif w_left < 80 or w_right > 1840:
                defects.append({
                    "type": "OUTRO_TAKEAWAY_MARGIN_BREACH",
                    "card": "outro",
                    "severity": "WARNING",
                    "text_span": [w_left, w_right],
                    "text_width": total_w,
                    "left_margin": w_left,
                    "right_margin": 1920 - w_right,
                    "text": tk_snippet,
                    "desc": f"Outro takeaway text extends dangerously close to canvas edge: span [{w_left}..{w_right}] (width {total_w}px). Left margin={w_left}px, right margin={1920-w_right}px (recommended min 120px)."
                })

    return vid, defects

with ThreadPoolExecutor(max_workers=8) as executor:
    results = list(executor.map(audit_video, dirs))

report = {vid: defs for vid, defs in results if defs}

import json
with open(os.path.join(PIPELINE_DIR, "audit_results.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)

print(f"Audit completed across {len(dirs)} tutorials.")
print(f"Total videos with defects: {len(report)}")
