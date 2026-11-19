import os
import sys
import glob
import subprocess
import json
import html
import textwrap

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(PIPELINE_DIR))
TUTORIAL_DIR = os.path.join(PROJECT_DIR, "recordings", "tutorials", "VID-2.7")
RAW_DIR = os.path.join(TUTORIAL_DIR, "raw")
MANIFEST_PATH = os.path.join(PIPELINE_DIR, "manifests", "VID-2.7.json")

def create_intro_svg(manifest, out_svg_path):
    title = html.escape(manifest["intro"]["title"])
    subtitle = html.escape(manifest["intro"]["subtitle"])
    badge = html.escape(manifest["intro"]["badge"])
    is_hi = manifest.get("voice", "").startswith("hi-") or manifest.get("id", "").endswith("-hi")
    
    if is_hi:
        series_text = f"{manifest['series']} · भाग {manifest['part']} / {manifest['totalParts']}"
        footer = "MEDIFLOW फ़ार्मेसी ट्यूटोरियल गाइड"
    else:
        series_text = f"{manifest['series']} · PART {manifest['part']} OF {manifest['totalParts']}"
        footer = "MEDIFLOW QUICK TUTORIAL GUIDES"

    series = html.escape(series_text)
    series_len = len(series_text)

    # Dynamic Top Pill Sizing to avoid any text overflow
    if series_len > 60:
        series_font_size = 16
        letter_spacing = 1.2
        char_w = 12.0
    elif series_len > 45:
        series_font_size = 17
        letter_spacing = 1.5
        char_w = 13.0
    else:
        series_font_size = 18
        letter_spacing = 2.0
        char_w = 14.5

    pill_w = max(440, min(1400, int(series_len * char_w + 72)))
    pill_x = -pill_w // 2

    # Title & Subtitle font size scaling
    title_font_size = 46 if len(manifest["intro"]["title"]) > 52 else 52
    subtitle_font_size = 21 if len(manifest["intro"]["subtitle"]) > 85 else 24

    # Shortcut Pill badge sizing
    badge_w = max(340, len(badge) * 18 + 50)
    badge_x = -badge_w // 2

    svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
  </defs>

  <rect width="1920" height="1080" fill="url(#bg)"/>
  <circle cx="200" cy="200" r="300" fill="#0284c7" opacity="0.12"/>
  <circle cx="1700" cy="800" r="400" fill="#0369a1" opacity="0.15"/>

  <g transform="translate(960, 540)" text-anchor="middle" font-family="Liberation Sans, sans-serif">
    <!-- Top Pill: Dynamic width {pill_w}px housing {series_len} chars with {series_font_size}px text -->
    <rect x="{pill_x}" y="-230" width="{pill_w}" height="48" rx="24" fill="#0284c7" fill-opacity="0.2" stroke="#38bdf8" stroke-width="2"/>
    <text x="0" y="-199" fill="#38bdf8" font-size="{series_font_size}" font-weight="bold" letter-spacing="{letter_spacing}">
      {series}
    </text>

    <!-- Main Title -->
    <text x="0" y="-80" fill="#ffffff" font-size="{title_font_size}" font-weight="bold">
      {title}
    </text>

    <!-- Subtitle -->
    <text x="0" y="-10" fill="#94a3b8" font-size="{subtitle_font_size}">
      {subtitle}
    </text>

    <!-- Shortcut Pill -->
    <g transform="translate(0, 90)">
      <rect x="{badge_x}" y="-32" width="{badge_w}" height="64" rx="16" fill="#0f172a" stroke="#38bdf8" stroke-width="2.5"/>
      <text x="0" y="11" fill="#38bdf8" font-size="24" font-weight="bold" font-family="Liberation Mono, monospace">
        {badge}
      </text>
    </g>

    <text x="0" y="240" fill="#64748b" font-size="18" font-weight="bold" letter-spacing="2">
      {footer}
    </text>
  </g>
</svg>"""

    with open(out_svg_path, "w", encoding="utf-8") as f:
        f.write(svg_content)

def create_outro_svg(manifest, out_svg_path):
    next_title = manifest["outro"]["nextPart"]["title"]
    next_id = manifest["outro"]["nextPart"].get("id", "")
    is_hi = manifest.get("voice", "").startswith("hi-") or manifest.get("id", "").endswith("-hi")

    if is_hi:
        next_part_num = manifest["part"] + 1
        tag_label = "प्रमुख वैधानिक नियम"
        next_label = f"जारी रहेगा - पार्ट {next_part_num}" if manifest.get("part") and manifest.get("totalParts", 1) > manifest.get("part", 1) else "अगला ट्यूटोरियल"
        footer = "MEDIFLOW · आधुनिक भारतीय फ़ार्मेसी ERP"
    else:
        next_part_num = manifest["part"] + 1
        tag_label = "KEY REGULATORY RULE"
        next_label = f"TO BE CONTINUED IN PART {next_part_num}" if manifest.get("part") and manifest.get("totalParts", 1) > manifest.get("part", 1) else "NEXT TUTORIAL IN THIS SERIES"
        footer = "MEDIFLOW · NEXT GENERATION INDIAN PHARMACY ERP"

    # Dynamic Tag Pill
    tag_w = max(340, len(tag_label) * 14 + 60)
    tag_x = -tag_w // 2

    # Dynamic Multiline Takeaway Text (Wrap to 78 chars)
    raw_takeaway = manifest["outro"]["takeaway"]
    t_lines = textwrap.wrap(raw_takeaway, width=78)
    if len(t_lines) <= 1:
        takeaway_xml = f'<text x="0" y="-120" fill="#ffffff" font-size="28" font-weight="bold">{html.escape(t_lines[0] if t_lines else raw_takeaway)}</text>'
    elif len(t_lines) == 2:
        takeaway_xml = f"""<text x="0" y="-138" fill="#ffffff" font-size="25" font-weight="bold">{html.escape(t_lines[0])}</text>
    <text x="0" y="-102" fill="#ffffff" font-size="25" font-weight="bold">{html.escape(t_lines[1])}</text>"""
    else:
        takeaway_xml = f"""<text x="0" y="-154" fill="#ffffff" font-size="22" font-weight="bold">{html.escape(t_lines[0])}</text>
    <text x="0" y="-122" fill="#ffffff" font-size="22" font-weight="bold">{html.escape(t_lines[1])}</text>
    <text x="0" y="-90" fill="#ffffff" font-size="22" font-weight="bold">{html.escape(t_lines[2])}</text>"""

    # Dynamic Next Part Banner
    next_font_size = 22 if len(next_title) > 65 else 26
    card_w = max(1120, min(1440, int(len(next_title) * 15) + 120))
    card_x = -card_w // 2

    svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
  </defs>

  <rect width="1920" height="1080" fill="url(#bg)"/>
  <circle cx="1700" cy="200" r="300" fill="#10b981" opacity="0.12"/>
  <circle cx="200" cy="800" r="400" fill="#059669" opacity="0.15"/>

  <g transform="translate(960, 540)" text-anchor="middle" font-family="Liberation Sans, sans-serif">
    <!-- Takeaway Pill -->
    <rect x="{tag_x}" y="-240" width="{tag_w}" height="44" rx="22" fill="#10b981" fill-opacity="0.2" stroke="#34d399" stroke-width="2"/>
    <text x="0" y="-211" fill="#34d399" font-size="16" font-weight="bold" letter-spacing="2">
      {tag_label}
    </text>

    <!-- Takeaway Text (Wrapped) -->
    {takeaway_xml}

    <!-- Next Part Banner -->
    <g transform="translate(0, 40)">
      <rect x="{card_x}" y="-55" width="{card_w}" height="135" rx="24" fill="#0f172a" fill-opacity="0.9" stroke="#34d399" stroke-width="2.5"/>
      <text x="0" y="-12" fill="#34d399" font-size="18" font-weight="bold" letter-spacing="3">
        {next_label}
      </text>
      <text x="0" y="44" fill="#f8fafc" font-size="{next_font_size}" font-weight="bold">
        {html.escape(next_title)}
      </text>
    </g>

    <!-- Footer -->
    <text x="0" y="240" fill="#64748b" font-size="18" font-weight="bold" letter-spacing="2">
      {footer}
    </text>
  </g>
</svg>"""

    with open(out_svg_path, "w", encoding="utf-8") as f:
        f.write(svg_content)

def generate_sonic_branding(tutorial_dir):
    """
    Synthesizes gentle corporate ambient audio stings using ffmpeg audio synthesizers.
    Intro (4.0s): soft swelling pad + gentle corporate two-note chime (C5 -> E5)
    Outro (4.0s): warm closing chord pad + subtle descending chime (E5 -> C5)
    """
    intro_audio = os.path.join(tutorial_dir, "intro_audio.wav")
    outro_audio = os.path.join(tutorial_dir, "outro_audio.wav")

    # 1. Subtle, Warm Intro Stinger (4.0s: soft sine chord pad + two-note chime C5->E5)
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "aevalsrc=0.015*sin(2*PI*261.63*t)+0.012*sin(2*PI*329.63*t)+0.010*sin(2*PI*392*t):s=44100:d=4.0:c=stereo",
        "-f", "lavfi", "-i", "sine=frequency=523.25:duration=0.6:sample_rate=44100",
        "-f", "lavfi", "-i", "sine=frequency=659.25:duration=0.8:sample_rate=44100",
        "-filter_complex",
        "[0:a]afade=t=in:st=0:d=0.8:curve=hsin,afade=t=out:st=2.8:d=1.2:curve=hsin,volume=0.32[pad];"
        "[1:a]afade=t=in:st=0:d=0.04,afade=t=out:st=0.3:d=0.3,volume=0.09[chime1];"
        "[2:a]afade=t=in:st=0:d=0.04,afade=t=out:st=0.5:d=0.3,adelay=180|180,volume=0.10[chime2];"
        "[chime1][chime2]amix=inputs=2:normalize=0[chimes];"
        "[pad][chimes]amix=inputs=2:normalize=0,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[out]",
        "-map", "[out]", "-t", "4.0", intro_audio
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 2. Subtle, Warm Outro Stinger (4.0s: soft resolving pad + descending two-note chime E5->C5)
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "aevalsrc=0.015*sin(2*PI*261.63*t)+0.012*sin(2*PI*329.63*t)+0.010*sin(2*PI*392*t):s=44100:d=4.0:c=stereo",
        "-f", "lavfi", "-i", "sine=frequency=659.25:duration=0.6:sample_rate=44100",
        "-f", "lavfi", "-i", "sine=frequency=523.25:duration=0.8:sample_rate=44100",
        "-filter_complex",
        "[0:a]afade=t=in:st=0:d=0.5:curve=hsin,afade=t=out:st=2.8:d=1.2:curve=hsin,volume=0.32[pad];"
        "[1:a]afade=t=in:st=0:d=0.04,afade=t=out:st=0.3:d=0.3,volume=0.09[chime1];"
        "[2:a]afade=t=in:st=0:d=0.04,afade=t=out:st=0.5:d=0.3,adelay=180|180,volume=0.10[chime2];"
        "[chime1][chime2]amix=inputs=2:normalize=0[chimes];"
        "[pad][chimes]amix=inputs=2:normalize=0,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[out]",
        "-map", "[out]", "-t", "4.0", outro_audio
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    return intro_audio, outro_audio

def main():
    print("=== MediFlow Tutorial Video Compositor (High-Fidelity) ===")
    manifest_arg = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PIPELINE_DIR, "manifests", "VID-2.7.json")
    if os.path.exists(manifest_arg):
        manifest_arg = os.path.abspath(manifest_arg)
    elif not os.path.isabs(manifest_arg):
        manifest_arg = os.path.join(PIPELINE_DIR, manifest_arg)

    with open(manifest_arg, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    tutorial_dir = os.path.join(PROJECT_DIR, "recordings", "tutorials", manifest["id"])
    raw_dir = os.path.join(tutorial_dir, "raw")

    intro_svg = os.path.join(tutorial_dir, "intro.svg")
    outro_svg = os.path.join(tutorial_dir, "outro.svg")
    intro_png = os.path.join(tutorial_dir, "intro.png")
    outro_png = os.path.join(tutorial_dir, "outro.png")
    intro_mp4 = os.path.join(tutorial_dir, "intro_bumper.mp4")
    outro_mp4 = os.path.join(tutorial_dir, "outro_bumper.mp4")
    screencast_mp4 = os.path.join(tutorial_dir, "screencast_clean.mp4")
    clean_title = "".join(c if c.isalnum() or c in (" ", "_", "-") else "" for c in manifest["title"]).strip().replace(" ", "_")
    final_output = os.path.join(tutorial_dir, f"{manifest['id']}_{clean_title}.mp4")
    master_audio = os.path.join(tutorial_dir, "narration_master.m4a")
    if not os.path.exists(master_audio):
        master_audio = os.path.join(tutorial_dir, "narration.mp3")

    master_dur = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", master_audio
    ]).decode().strip())
    print(f"Master narration audio duration: {master_dur:.2f}s")

    # 1. Generate updated Intro/Outro cards (Liberation Sans)
    print("Generating updated Intro/Outro cards (Liberation Sans)...")
    create_intro_svg(manifest, intro_svg)
    create_outro_svg(manifest, outro_svg)

    subprocess.run(["ffmpeg", "-y", "-i", intro_svg, intro_png], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["ffmpeg", "-y", "-i", outro_svg, outro_png], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 2. Generate Sonic Branding (gentle corporate ambient stings)
    print("Synthesizing subtle MediFlow audio stings (Intro / Outro sonic branding)...")
    intro_audio, outro_audio = generate_sonic_branding(tutorial_dir)

    # 3. Render 4s Ambient Intro Video (44100Hz stereo AAC)
    print("Rendering 4s Intro Bumper with sonic sting...")
    subprocess.run([
        "ffmpeg", "-y", "-loop", "1", "-framerate", "30", "-i", intro_png,
        "-i", intro_audio,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-t", "4",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", intro_mp4
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 4. Render 4s Ambient Outro Video (44100Hz stereo AAC)
    print("Rendering 4s Outro Bumper with sonic sting...")
    subprocess.run([
        "ffmpeg", "-y", "-loop", "1", "-framerate", "30", "-i", outro_png,
        "-i", outro_audio,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-t", "4",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-shortest", outro_mp4
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 5. Check if screencast_clean already exists
    reencode_screencast = True
    if os.path.exists(screencast_mp4) and os.path.getsize(screencast_mp4) > 100000 and "--force-screencast" not in sys.argv:
        print(f"Reusing existing normalized screencast: {screencast_mp4} ({os.path.getsize(screencast_mp4)/(1024*1024):.2f} MB)")
        reencode_screencast = False

    if reencode_screencast:
        # Pick latest raw webm
        webm_files = glob.glob(os.path.join(raw_dir, "*.webm"))
        if not webm_files:
            print("No raw .webm files found in", raw_dir)
            sys.exit(1)
        webm_files.sort(key=os.path.getmtime, reverse=True)
        raw_webm = webm_files[0]
        print(f"Using raw screencast: {raw_webm} ({os.path.getsize(raw_webm)/(1024*1024):.2f} MB)")

        timings_file = os.path.join(tutorial_dir, "scene_timings.json")
        trim_offset = 0.0
        if os.path.exists(timings_file):
            with open(timings_file, "r", encoding="utf-8") as f:
                tdata = json.load(f)
                trim_offset = tdata.get("pageReadyOffsetSec", 0.0)
        print(f"Applying screencast trim offset: {trim_offset:.2f}s | Target duration: {master_dur:.2f}s")

        print("Normalizing screencast video and syncing narration audio (44.1kHz stereo)...")
        cmd_screencast = ["ffmpeg", "-y"]
        if trim_offset > 0:
            cmd_screencast.extend(["-ss", f"{trim_offset:.2f}"])
        cmd_screencast.extend([
            "-i", raw_webm,
            "-i", master_audio,
            "-filter_complex", "[1:a]apad[a]",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", "30",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
            "-map", "0:v:0", "-map", "[a]",
            "-t", str(master_dur),
            screencast_mp4
        ])
        subprocess.run(cmd_screencast, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 6. Re-encode concatenation with filter_complex to eliminate all audio jitter & desync
    print("Seamlessly concatenating [Intro + Screencast + Outro] via filter_complex...")
    subprocess.run([
        "ffmpeg", "-y",
        "-i", intro_mp4,
        "-i", screencast_mp4,
        "-i", outro_mp4,
        "-filter_complex",
        "[0:v]setsar=1[v0];"
        "[1:v]setsar=1[v1];"
        "[2:v]setsar=1[v2];"
        "[0:a]aformat=channel_layouts=stereo:sample_rates=44100[a0];"
        "[1:a]aformat=channel_layouts=stereo:sample_rates=44100[a1];"
        "[2:a]aformat=channel_layouts=stereo:sample_rates=44100[a2];"
        "[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]",
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-movflags", "+faststart", final_output
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    duration = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", final_output
    ]).decode().strip()

    file_size_mb = os.path.getsize(final_output) / (1024 * 1024)
    print("\n=======================================================")
    print(f"🎉 PERFECTED TUTORIAL VIDEO GENERATED SUCCESSFULLY!")
    print(f"File:     {final_output}")
    print(f"Duration: {float(duration):.2f} seconds")
    print(f"Size:     {file_size_mb:.2f} MB")
    print(f"Format:   1080p Full HD (1920x1080) @ 30 FPS · H.264 / AAC 44.1kHz")
    print("=======================================================\n")

if __name__ == "__main__":
    main()
