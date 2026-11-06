/**
 * CLI Entrypoint for Performance Stock and Ledger Seeding (Phase 6.2).
 * Usage:
 *   npx tsx scripts/generate-stock.ts --preset benchmark
 *   npx tsx scripts/generate-stock.ts --preset full
 */

import "dotenv/config";
import { runSeederEngine } from "./perf/seeder-engine";

async function main() {
  const args = process.argv.slice(2);
  const presetArg = args.find((a) => a.startsWith("--preset="));
  const presetFlagIdx = args.indexOf("--preset");

  let preset: "full" | "benchmark" = "full";
  if (presetArg) {
    preset = presetArg.split("=")[1] === "benchmark" ? "benchmark" : "full";
  } else if (presetFlagIdx !== -1 && args[presetFlagIdx + 1]) {
    preset = args[presetFlagIdx + 1] === "benchmark" ? "benchmark" : "full";
  }

  const forceSeed = args.includes("--force-seed");
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("❌ Error: DATABASE_URL environment variable is unset.");
    process.exit(1);
  }

  try {
    const res = await runSeederEngine({
      connectionString,
      preset,
      forceSeed,
    });

    console.log("\nSummary:");
    console.log(`- Medicines: ${res.medicinesCount.toLocaleString()}`);
    console.log(`- Batches:   ${res.batchesCount.toLocaleString()}`);
    console.log(`- Movements: ${res.movementsCount.toLocaleString()}`);
    console.log(`- Time:      ${(res.durationMs / 1000).toFixed(2)}s\n`);
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Seeding failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
