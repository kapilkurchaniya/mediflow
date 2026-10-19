/**
 * scripts/fetch-dataset.ts
 *
 * Downloads the Indian Medicine Dataset CSV from GitHub and saves it to
 * scripts/Indian-Medicine-Dataset/ (git-ignored).
 *
 * Usage:
 *   npx tsx scripts/fetch-dataset.ts
 *
 * Afterwards run: npm run db:seed  (which reads from that folder)
 *
 * NOTE: Verify the dataset licence before distributing it to customers.
 * The source repo is: https://github.com/mpharmacode/Indian-Medicine-Dataset
 * Licence: check the repo's LICENSE file — confirm it allows commercial use.
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const DATASET_URL =
  "https://raw.githubusercontent.com/mpharmacode/Indian-Medicine-Dataset/main/medicines.csv";

const OUTPUT_DIR = path.resolve(__dirname, "Indian-Medicine-Dataset");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "medicines.csv");

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // follow one redirect
          file.close();
          fs.unlinkSync(dest);
          download(res.headers.location!, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (fs.existsSync(OUTPUT_FILE)) {
    console.log(`✅ Dataset already present at ${OUTPUT_FILE}. Delete it to re-download.`);
    return;
  }

  console.log(`⬇️  Downloading medicine dataset from:\n   ${DATASET_URL}`);
  await download(DATASET_URL, OUTPUT_FILE);
  const size = fs.statSync(OUTPUT_FILE).size;
  console.log(`✅ Saved ${(size / 1024).toFixed(1)} KB → ${OUTPUT_FILE}`);
  console.log(`\nNext step: npm run db:seed`);
}

main().catch((e) => {
  console.error("❌ fetch-dataset failed:", e);
  process.exit(1);
});
