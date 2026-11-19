import os
import sys
import json
import time
import subprocess

def parse_vtt(vtt_path):
    cues = []
    if not os.path.exists(vtt_path):
        return cues
    try:
        with open(vtt_path, "r", encoding="utf-8") as f:
            content = f.read()
        blocks = content.strip().split("\n\n")
        for block in blocks:
            lines = [l.strip() for l in block.split("\n") if l.strip()]
            time_line_idx = -1
            for idx, line in enumerate(lines):
                if "-->" in line:
                    time_line_idx = idx
                    break
            if time_line_idx != -1 and time_line_idx + 1 < len(lines):
                time_str = lines[time_line_idx]
                cue_text = " ".join(lines[time_line_idx + 1:])
                parts = time_str.split("-->")
                def to_sec(s):
                    s = s.strip().replace(",", ".")
                    chunks = s.split(":")
                    return float(chunks[0]) * 3600 + float(chunks[1]) * 60 + float(chunks[2])
                c_start = to_sec(parts[0])
                c_end = to_sec(parts[1])
                cues.append({"start": round(c_start, 3), "end": round(c_end, 3), "text": cue_text})
    except Exception as err:
        print(f"Warning parsing VTT {vtt_path}: {err}")
    return cues

def prepare_audio(manifest_path, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    pipeline_dir = os.path.dirname(os.path.abspath(__file__))
    venv_tts = os.path.join(pipeline_dir, ".venv/bin/edge-tts")
    if not os.path.exists(venv_tts):
        venv_tts = "edge-tts"

    scenes = manifest["narration"]
    print(f"Generating audio for {len(scenes)} scenes with voice '{manifest['voice']}'...")

    scene_files = []
    durations = []
    scene_subtitles = []
    inputs = []
    filter_parts = []
    concat_inputs = []

    for i, sc in enumerate(scenes):
        sc_path = os.path.join(output_dir, f"scene_{i}.mp3")
        sc_vtt = os.path.join(output_dir, f"scene_{i}.vtt")
        scene_files.append(sc_path)
        print(f"  Generating Scene {i+1} audio & subtitles...")
        success = False
        for attempt in range(4):
            try:
                subprocess.run([
                    venv_tts,
                    "--voice", manifest["voice"],
                    "--text", sc["text"],
                    "--write-media", sc_path,
                    "--write-subtitles", sc_vtt
                ], check=True, timeout=25, stdout=subprocess.DEVNULL)
                success = True
                break
            except Exception as ex:
                print(f"    [TTS retry {attempt+1}/4] Scene {i+1} warning: {ex}")
                time.sleep(1.5)
        if not success:
            raise RuntimeError(f"Failed to generate TTS for scene {i+1} after 4 attempts")

        dur_out = subprocess.check_output([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            sc_path
        ]).decode().strip()
        dur = float(dur_out)
        durations.append(dur)

        cues = parse_vtt(sc_vtt)
        if not cues:
            cues = [{"start": 0.0, "end": round(dur, 3), "text": sc["text"]}]

        if i == 0:
            for c in cues:
                c["start"] = round(c["start"] + 0.5, 3)
                c["end"] = round(c["end"] + 0.5, 3)

        scene_subtitles.append(cues)

        inputs.extend(["-i", sc_path])

        # Formatting each scene audio with exact delays:
        # Scene 0: 500ms initial delay before speech, 400ms pause after
        # Scenes 1..N-2: 400ms pause after
        # Last Scene: 1000ms tail pause
        if i == 0:
            filter_parts.append(f"[{i}:a]adelay=500|500,apad=pad_dur=0.4[a{i}]")
        elif i < len(scenes) - 1:
            filter_parts.append(f"[{i}:a]apad=pad_dur=0.4[a{i}]")
        else:
            filter_parts.append(f"[{i}:a]apad=pad_dur=1.0[a{i}]")

        concat_inputs.append(f"[a{i}]")
        print(f"    Scene {i+1}: {dur:.2f}s ({len(cues)} subtitle cues)")

    filter_str = ";".join(filter_parts) + ";" + "".join(concat_inputs) + f"concat=n={len(scenes)}:v=0:a=1[outa]"
    master_audio = os.path.join(output_dir, "narration_master.m4a")

    print("Concatenating scenes into master narration audio (44.1kHz stereo AAC)...")
    cmd = ["ffmpeg", "-y"] + inputs + [
        "-filter_complex", filter_str,
        "-map", "[outa]",
        "-c:a", "aac", "-b:a", "192k",
        "-ar", "44100", "-ac", "2",
        master_audio
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    master_dur_out = subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        master_audio
    ]).decode().strip()
    master_dur = float(master_dur_out)
    print(f"Master narration audio ready: {master_dur:.2f}s")

    timings_path = os.path.join(output_dir, "scene_timings.json")
    scene_pads = [0.4] * (len(scenes) - 1) + [1.0] if len(scenes) > 0 else []
    with open(timings_path, "w", encoding="utf-8") as f:
        json.dump({
            "durations": durations,
            "initial_delay": 0.5,
            "scene_pads": scene_pads,
            "master_duration": master_dur,
            "scene_count": len(scenes),
            "scene_subtitles": scene_subtitles
        }, f, indent=2)
    print(f"Timings metadata with exact subtitle cues written to {timings_path}")

if __name__ == "__main__":
    pipeline_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(os.path.dirname(pipeline_dir))
    manifest_file = sys.argv[1] if len(sys.argv) > 1 else os.path.join(pipeline_dir, "manifests/VID-2.7.json")
    if len(sys.argv) > 2:
        out_dir = sys.argv[2]
    else:
        with open(manifest_file, "r", encoding="utf-8") as f:
            manifest_data = json.load(f)
        out_dir = os.path.join(project_dir, "recordings/tutorials", manifest_data["id"])
    prepare_audio(manifest_file, out_dir)
