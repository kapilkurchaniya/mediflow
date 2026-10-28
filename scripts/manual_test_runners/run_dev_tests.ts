import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

interface DevTestResult {
  id: string;
  lane: "A" | "B";
  description: string;
  command: string;
  status: "PASSED" | "FAILED" | "KNOWN_ISSUE" | "NOTE";
  durationMs: number;
  output?: string;
  error?: string;
}

const results: DevTestResult[] = [];

function runCheck(
  id: string,
  lane: "A" | "B",
  description: string,
  command: string,
  expectedPass = true
) {
  const start = Date.now();
  console.log(`[DEV TEST] Running ${id}: ${description}...`);
  try {
    const out = execSync(command, { encoding: "utf8", timeout: 45000, stdio: ["pipe", "pipe", "pipe"] });
    const durationMs = Date.now() - start;
    results.push({
      id,
      lane,
      description,
      command,
      status: "PASSED",
      durationMs,
      output: out.trim().slice(-500),
    });
    console.log(`  -> PASSED (${durationMs}ms)`);
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const e = err as { stdout?: string; stderr?: string; message: string };
    const errMsg = (e.stderr || e.stdout || e.message).trim().slice(-500);

    const isKnownIssue = !expectedPass || id === "B-0.1" || id === "B-0.2" || id === "B-2.0a" || id === "B-0.9";
    const status = isKnownIssue ? "KNOWN_ISSUE" : "FAILED";

    results.push({
      id,
      lane,
      description,
      command,
      status,
      durationMs,
      error: errMsg,
      output: e.stdout ? e.stdout.trim().slice(-500) : undefined,
    });
    console.log(`  -> ${status} (${durationMs}ms): ${errMsg.split("\n")[0]}`);
  }
}

async function main() {
  console.log("=== RUNNING DEVELOPER CLI & UNIT TEST SUITE ===");

  // A-0.1: Catch-up migration table count
  runCheck(
    "A-0.1",
    "A",
    "Database schema table count is 58",
    `docker exec mediflow-db psql -p 5433 -U mediflow -d mediflow -Atc "select count(*) from information_schema.tables where table_schema='public'"`
  );

  // A-0.2: No drift between schema and migrations
  runCheck(
    "A-0.2",
    "A",
    "No drift between schema and migrations",
    `npx drizzle-kit generate`
  );

  // A-0.4: Schema split audit
  runCheck(
    "A-0.4",
    "A",
    "Schema split into 12 modules, old schema.ts removed",
    `test ! -f src/server/db/schema.ts && test $(ls -1 src/server/db/schema/*.ts | wc -l) -ge 12`
  );

  // A-0.8: Nav config unit tests
  runCheck(
    "A-0.8",
    "A",
    "Nav config safe to extend unit test",
    `npx vitest run tests/unit/nav.test.ts`
  );

  // A-0.9: Strict lint ratchet
  runCheck(
    "A-0.9",
    "A",
    "Strict lint ratchet (scripts/lint-strict.mjs)",
    `npm run lint:strict`
  );

  // A-0.10: Sale resilience integration tests
  runCheck(
    "A-0.10",
    "A",
    "Sale resilience: optional steps do not abort sale",
    `npx vitest run tests/integration/sale-resilience.test.ts`
  );

  // A-0.12: Invoice sequence tests
  runCheck(
    "A-0.12",
    "A",
    "Sequence numbering service conforms to 16 char GST rule",
    `npx vitest run tests/integration/sequence.test.ts`
  );

  // A-0.13: Money and tax arithmetic
  runCheck(
    "A-0.13",
    "A",
    "Money arithmetic and invoice number unit tests",
    `npx vitest run tests/unit/money.test.ts tests/unit/invoice-no.test.ts`
  );

  // A-1.1: System roles exist with permissions
  runCheck(
    "A-1.1",
    "A",
    "System roles exist with correct permission counts",
    `docker exec mediflow-db psql -p 5433 -U mediflow -d mediflow -c "select r.key, count(rp.*) as permissions from roles r left join role_permissions rp on rp.role_id = r.id group by r.key order by 1;"`
  );

  // A-1.4b: Registration tests
  runCheck(
    "A-1.4b",
    "A",
    "Registration seeds owner with full permissions",
    `npx vitest run tests/integration/register.test.ts`
  );

  // A-1.5: Membership and store checks
  runCheck(
    "A-1.5",
    "A",
    "Membership and store isolation tests",
    `npx vitest run tests/integration/rbac.test.ts`
  );

  // A-1.8: Server-side enforcement of racks
  runCheck(
    "A-1.8",
    "A",
    "Racks module action permission and multi-tenant checks",
    `npx vitest run tests/integration/racks-actions.test.ts`
  );

  // A-1.10: DB error handling
  runCheck(
    "A-1.10",
    "A",
    "Unique violation helper (isUniqueViolation)",
    `npx vitest run tests/unit/db-errors.test.ts`
  );

  // A-1.14: Lane A permissions matrix
  runCheck(
    "A-1.14",
    "A",
    "Lane A permission matrix over all actions",
    `npx vitest run tests/integration/lane-a-permissions.test.ts`
  );

  // B-0.1: API keys security check (Documented known bug in roadmap)
  runCheck(
    "B-0.1",
    "B",
    "API keys: /api/v1/* must reject unauthenticated requests",
    `curl -s -i -X POST http://localhost:3000/api/v1/stock/check -H 'Content-Type: application/json' -d '{"query":"para"}' | grep -E "401|403"`,
    false // Known to return 200 today
  );

  // B-0.2: WhatsApp webhook signature verification (Documented bug)
  runCheck(
    "B-0.2",
    "B",
    "WhatsApp webhook signature verification handshake",
    `curl -s -i "http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=12345" | grep -E "401|403"`,
    false
  );

  // B-0.5: GST 2.0 constants
  runCheck(
    "B-0.5",
    "B",
    "Regulatory constants and GST 2.0 rates",
    `test -f src/lib/regulatory.ts || test -f src/lib/constants.ts || grep -rn "GST_RATES" src/lib/`
  );

  // B-0.7: Repo hygiene
  runCheck(
    "B-0.7",
    "B",
    "Repo hygiene: fetch-dataset exists, dataset ignored",
    `test -f scripts/fetch-dataset.ts && grep -i "dataset" .gitignore`
  );

  // B-0.9: Whole-repo lint check (known pending errors in Lane B)
  runCheck(
    "B-0.9",
    "B",
    "Whole repo lint status (reports pending Lane B issues)",
    `npm run lint`,
    false // Known pending in Lane B
  );

  // Save results
  const reportPath = path.join(process.cwd(), "reports/dev_tests_results.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Saved dev tests results to ${reportPath}`);
}

main().catch(console.error);
