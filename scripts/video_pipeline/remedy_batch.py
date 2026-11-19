import os
import sys
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(PIPELINE_DIR))
MANIFESTS_DIR = os.path.join(PIPELINE_DIR, "manifests")

TARGET_VIDEOS = [
    # Phase 2 (1 video)
    "VID-2.13",
    # Phase 3 (6 videos)
    "VID-3.1", "VID-3.2", "VID-3.3", "VID-3.4", "VID-3.5", "VID-3.6",
    # Phase 5 (5 videos)
    "VID-5.3", "VID-5.4", "VID-5.5", "VID-5.6", "VID-5.7",
    # Phase 6 (9 videos)
    "VID-6.1-hi", "VID-6.2", "VID-6.2-hi", "VID-6.3", "VID-6.3-hi", "VID-6.4", "VID-6.4-hi", "VID-6.5", "VID-6.5-hi",
    # Phase 7 (9 videos)
    "VID-7.1-hi", "VID-7.2", "VID-7.2-hi", "VID-7.3", "VID-7.3-hi", "VID-7.4", "VID-7.4-hi", "VID-7.5", "VID-7.5-hi"
]

def process_video(vid):
    manifest_path = os.path.join(MANIFESTS_DIR, f"{vid}.json")
    if not os.path.exists(manifest_path):
        return vid, False, f"Manifest not found: {manifest_path}"
    
    cmd = [sys.executable, os.path.join(PIPELINE_DIR, "compose_video.py"), manifest_path]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return vid, True, "Success"
    except subprocess.CalledProcessError as e:
        return vid, False, f"Failed: {e.stderr or e.stdout}"

def main():
    print(f"=== Starting Batch Recomposition of {len(TARGET_VIDEOS)} Defective Videos ===")
    print("Concurrency: 3 workers")
    
    success_count = 0
    fail_count = 0
    
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(process_video, vid): vid for vid in TARGET_VIDEOS}
        for future in futures:
            vid = futures[future]
            try:
                v_id, success, msg = future.result()
                if success:
                    success_count += 1
                    print(f"[{success_count + fail_count}/{len(TARGET_VIDEOS)}] [OK] {v_id} perfected.")
                else:
                    fail_count += 1
                    print(f"[{success_count + fail_count}/{len(TARGET_VIDEOS)}] [FAIL] {v_id}: {msg}")
            except Exception as e:
                fail_count += 1
                print(f"[{success_count + fail_count}/{len(TARGET_VIDEOS)}] [ERR] {vid}: {e}")
                
    print(f"\nBatch recomposition completed: {success_count} succeeded, {fail_count} failed.")

if __name__ == "__main__":
    main()
