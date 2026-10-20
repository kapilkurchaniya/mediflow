import { config } from "dotenv";

// .env.test is optional: CI passes DATABASE_URL through the environment (dotenv never overrides it).
config({ path: ".env.test", quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.test.example to .env.test (see docs/09-testing-strategy.md).");
}

// Tests create and drop their own schemas, so insist on a database that is clearly a test one.
const dbName = new URL(process.env.DATABASE_URL).pathname.replace("/", "");
if (!/test|ci/i.test(dbName)) {
  throw new Error(`Refusing to run tests against database "${dbName}": its name must contain "test" or "ci".`);
}
