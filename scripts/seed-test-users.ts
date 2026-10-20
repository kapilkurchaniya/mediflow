/**
 * Creates one login per system role for the demo pharmacy created by `npm run db:seed`, so permissions can be
 * tested by hand (see A_TEST_GUIDE.md / B_TEST_GUIDE.md). Idempotent. LOCAL TESTING ONLY: never run in production.
 *
 *   email:    <role key>@apollo.com      e.g. cashier@apollo.com, purchase_manager@apollo.com
 *   password: <role key>123              e.g. cashier123
 *   (the owner is admin@apollo.com / admin123 from db:seed)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/server/db/index";
import { seedSystemRoles } from "../src/server/roles";
import { SYSTEM_ROLES } from "../src/lib/permissions";

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(`Refusing to create test users on a non-local database (host: ${host}).`);
  }

  const [admin] = await db.select().from(schema.users).where(eq(schema.users.email, "admin@apollo.com")).limit(1);
  if (!admin) throw new Error("Run `npm run db:seed` first (it creates admin@apollo.com).");
  const [owner] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, admin.id)).limit(1);
  const tenantId = owner.tenantId;

  const roleIds = await seedSystemRoles(db, tenantId);

  for (const role of SYSTEM_ROLES.filter((r) => r.key !== "owner")) {
    const email = `${role.key}@apollo.com`;
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (!user) {
      [user] = await db
        .insert(schema.users)
        .values({
          name: `Test ${role.name}`,
          email,
          passwordHash: await bcrypt.hash(`${role.key}123`, 10),
          pharmacistRegNo: role.key === "pharmacist" ? "PH-12345" : null,
        })
        .returning();
    }
    await db
      .insert(schema.memberships)
      .values({ tenantId, userId: user.id, roleId: roleIds[role.key], allStores: true })
      .onConflictDoUpdate({ target: [schema.memberships.tenantId, schema.memberships.userId], set: { roleId: roleIds[role.key], status: "active" } });
    console.log(`✓ ${email}  (${role.name})`);
  }
  console.log("Passwords are '<role key>123', e.g. cashier123.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
