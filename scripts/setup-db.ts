import "dotenv/config";
import { db, schema } from "../src/server/db/index";
import bcrypt from "bcryptjs";
import { seedSystemRoles } from "../src/server/roles";

async function setup() {
  console.log("Setting up default user and tenant...");
  
  // 1. Create Tenant
  const [tenant] = await db.insert(schema.tenants).values({
    name: "Apollo Pharmacy",
    legalName: "Apollo Pharmacy Pvt Ltd",
  }).returning();

  // 2. Create Store
  const [store] = await db.insert(schema.stores).values({
    tenantId: tenant.id,
    name: "Apollo Main Branch",
    code: "APL001",
    stateCode: "MH"
  }).returning();

  // 3. Create User
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const [user] = await db.insert(schema.users).values({
    name: "Admin User",
    email: "admin@apollo.com",
    passwordHash: hashedPassword,
  }).returning();

  const roleIds = await seedSystemRoles(db, tenant.id);

  // 4. Link User to Tenant as Owner
  await db.insert(schema.memberships).values({
    tenantId: tenant.id,
    userId: user.id,
    roleId: roleIds.owner,
    storeIds: [store.id],
  });

  console.log("Done! You can login with admin@apollo.com / admin123");
  process.exit(0);
}
setup().catch(console.error);
