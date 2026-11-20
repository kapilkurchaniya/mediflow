import os
import glob
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor, as_completed

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(PIPELINE_DIR))
COMPOSE_SCRIPT = os.path.join(PIPELINE_DIR, "compose_video.py")

def process_manifest(manifest_path):
    t0 = time.time()
    cmd = ["python3", COMPOSE_SCRIPT, manifest_path]
    res = subprocess.run(cmd, capture_output=True, text=True)
    dt = time.time() - t0
    base = os.path.basename(manifest_path)
    if res.returncode == 0:
        return True, base, dt, ""
    else:
        return False, base, dt, res.stderr[-300:]

def main():
    # Collect all manifests from Phase 4 to Phase 8 that have screencast_clean.mp4
    all_manifests = sorted(glob.glob(os.path.join(PIPELINE_DIR, "manifests", "VID-[4-8].*.json")))
    eligible = []
    for m in all_manifests:
        with open(m, "r", encoding="utf-8") as f:
            import json
            data = json.load(f)
        vid = data["id"]
        clean_mp4 = os.path.join(PROJECT_DIR, "recordings", "tutorials", vid, "screencast_clean.mp4")
        if os.path.exists(clean_mp4) and os.path.getsize(clean_mp4) > 100000:
            eligible.append(m)

    print(f"Total eligible videos to recompose: {len(eligible)}")

    # Run with 4 concurrent workers
    success_count = 0
    fail_count = 0
    with ProcessPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(process_manifest, m): m for m in eligible}
        for future in as_completed(futures):
            ok, name, dt, err = future.result()
            if ok:
                success_count += 1
                print(f"[{success_count + fail_count}/{len(eligible)}] ✓ Recomposed {name} in {dt:.1f}s")
            else:
                fail_count += 1
                print(f"[{success_count + fail_count}/{len(eligible)}] ✗ FAILED {name} in {dt:.1f}s: {err}")

    print(f"\nRecomposition summary: {success_count} succeeded, {fail_count} failed out of {len(eligible)}.")

if __name__ == "__main__":
    main()
