import os
import glob
import re
import html
from PIL import Image

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(PIPELINE_DIR))
TUTORIALS_DIR = os.path.join(PROJECT_DIR, "recordings", "tutorials")

dirs = sorted(glob.glob(os.path.join(TUTORIALS_DIR, "VID-*")))

print(f"Starting deep pixel-level and boundary audit across {len(dirs)} tutorials...")

report = {}

for d in dirs:
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
            # Scan text row around y = 330 to 348 (SVG y=-199 in 960,540 is y=341)
            # Pill border is at y=310 to 358
            # Look for cyan text pixels: G > 130, B > 180, R < 100
            cyan_xs = []
            for y in range(332, 347):
                for x in range(200, 1720):
                    r, g, b = img_intro.getpixel((x, y))
                    if g > 130 and b > 180 and r < 100:
                        cyan_xs.append(x)
            
            if cyan_xs:
                t_left = min(cyan_xs)
                t_right = max(cyan_xs)
                
                # Check absolute overflow past outer pill boundary
                left_bleed = max(0, pill_left - t_left)
                right_bleed = max(0, t_right - pill_right)
                
                # Check collision with rounded caps (within 16px of cap)
                left_margin = t_left - pill_left
                right_margin = pill_right - t_right

                if left_bleed > 0 or right_bleed > 0:
                    issues.append({
                        "card": "intro",
                        "severity": "CRITICAL_OVERFLOW",
                        "element": "top_pill",
                        "desc": f"Top pill text overflows container: text [{t_left}..{t_right}] ({t_right-t_left}px) vs pill [{pill_left}..{pill_right}] ({pill_w}px). Left bleed={left_bleed}px, Right bleed={right_bleed}px",
                        "text": series_text
                    })
                elif left_margin < 18 or right_margin < 18:
                    issues.append({
                        "card": "intro",
                        "severity": "BORDER_COLLISION",
                        "element": "top_pill",
                        "desc": f"Top pill text crashes into rounded endcap borders (left margin: {left_margin}px, right margin: {right_margin}px; safe min 20px). Text [{t_left}..{t_right}], pill [{pill_left}..{pill_right}] ({pill_w}px)",
                        "text": series_text
                    })

    # 2. PIXEL CHECK OUTRO TAKEAWAY & BANNER
    if os.path.exists(outro_svg_path) and os.path.exists(outro_png_path):
        with open(outro_svg_path, 'r', encoding='utf-8') as f:
            c_out = f.read()

        img_outro = Image.open(outro_png_path).convert('RGB')
        
        # Scan takeaway text region: y between 360 and 460
        # Text is white: R>200, G>200, B>200
        white_xs = []
        for y in range(360, 460):
            for x in range(0, 1920):
                r, g, b = img_outro.getpixel((x, y))
                if r > 200 and g > 200 and b > 200:
                    white_xs.append(x)
        
        if white_xs:
            w_left = min(white_xs)
            w_right = max(white_xs)
            total_w = w_right - w_left

            # If text is within 60px of canvas edges, or clips off-screen (<10px or >1910px)
            if w_left < 15 or w_right > 1905:
                issues.append({
                    "card": "outro",
                    "severity": "CRITICAL_CANVAS_BLEED",
                    "element": "takeaway_text",
                    "desc": f"Takeaway text bleeds offscreen / clips canvas border: text spans [{w_left}..{w_right}] (width {total_w}px) on 1920 canvas!",
                })
            elif w_left < 80 or w_right > 1840:
                issues.append({
                    "card": "outro",
                    "severity": "CANVAS_MARGIN_BREACH",
                    "element": "takeaway_text",
                    "desc": f"Takeaway text extends dangerously close to screen edge: text spans [{w_left}..{w_right}] (width {total_w}px, margin {w_left}px left / {1920-w_right}px right; recommended min 120px)",
                })

        # Scan Next Part Banner title in outro: y between 560 and 640
        m_card = re.search(r'y=\"-55\"\s+width=\"(\d+)\"', c_out) or re.search(r'width=\"(\d+)\"\s+height=\"135\"', c_out)
        if m_card:
            card_w = int(m_card.group(1))
            card_left = 960 - card_w // 2
            card_right = 960 + card_w // 2
            
            card_white_xs = []
            for y in range(570, 630):
                for x in range(100, 1820):
                    r, g, b = img_outro.getpixel((x, y))
                    if r > 220 and g > 220 and b > 220:
                        card_white_xs.append(x)
            
            if card_white_xs:
                c_left = min(card_white_xs)
                c_right = max(card_white_xs)
                if c_left < card_left or c_right > card_right:
                    issues.append({
                        "card": "outro",
                        "severity": "CRITICAL_OVERFLOW",
                        "element": "next_part_card",
                        "desc": f"Next part title overflows card banner: text [{c_left}..{c_right}] vs card [{card_left}..{card_right}] ({card_w}px)"
                    })

    if issues:
        report[vid] = issues

print(f"\n================ AUDIT RESULTS ================")
print(f"Total video directories with pixel or container defects: {len(report)}")
print("===============================================\n")

categories = {
    "CRITICAL_OVERFLOW": [],
    "BORDER_COLLISION": [],
    "CRITICAL_CANVAS_BLEED": [],
    "CANVAS_MARGIN_BREACH": []
}

for vid, iss in sorted(report.items()):
    for item in iss:
        categories[item["severity"]].append((vid, item))

print(f"1. CRITICAL CONTAINER OVERFLOWS ({len(categories['CRITICAL_OVERFLOW'])} items):")
for vid, item in categories["CRITICAL_OVERFLOW"]:
    print(f"  - [{vid}] [{item['card'].upper()}] {item['desc']}")
    if "text" in item:
        print(f"    Text: \"{item['text']}\"")

print(f"\n2. CRITICAL CANAVAS BLEEDS (Text clipped off-screen) ({len(categories['CRITICAL_CANVAS_BLEED'])} items):")
for vid, item in categories["CRITICAL_CANVAS_BLEED"]:
    print(f"  - [{vid}] [{item['card'].upper()}] {item['desc']}")

print(f"\n3. BORDER COLLISIONS (Text smashing into rounded pill caps) ({len(categories['BORDER_COLLISION'])} items):")
for vid, item in categories["BORDER_COLLISION"]:
    print(f"  - [{vid}] [{item['card'].upper()}] {item['desc']}")
    if "text" in item:
        print(f"    Text: \"{item['text']}\"")

print(f"\n4. CANVAS MARGIN BREACHES (Single-line takeaways stretching wall-to-wall) ({len(categories['CANVAS_MARGIN_BREACH'])} items):")
for vid, item in categories["CANVAS_MARGIN_BREACH"]:
    print(f"  - [{vid}] [{item['card'].upper()}] {item['desc']}")
