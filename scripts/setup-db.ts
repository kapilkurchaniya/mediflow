import "dotenv/config";
import { db, schema } from "../src/server/db/index";
import bcrypt from "bcryptjs";

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

  const [role] = await db.insert(schema.roles).values({
    tenantId: tenant.id,
    name: "Owner",
    key: "owner",
    description: "System Owner"
  }).returning();

  // 4. Link User to Tenant
  await db.insert(schema.memberships).values({
    tenantId: tenant.id,
    userId: user.id,
    roleId: role.id,
    storeIds: [store.id]
  });

  console.log("Done! You can login with admin@apollo.com / admin123");
  process.exit(0);
}
setup().catch(console.error);
