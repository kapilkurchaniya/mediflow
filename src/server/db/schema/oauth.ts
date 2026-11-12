import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_helpers";
import { users } from "./platform";

/**
 * External OAuth provider accounts linked to MediFlow users (e.g., Google).
 * A user may link one account per provider; provider + provider_account_id is globally unique.
 */
export const userOauthAccounts = pgTable(
  "user_oauth_accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // e.g. "google"
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email").notNull(),
    emailVerified: text("email_verified"), // "true" | "false"
    avatarUrl: text("avatar_url"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("user_oauth_provider_account_uq").on(t.provider, t.providerAccountId),
    uniqueIndex("user_oauth_user_provider_uq").on(t.userId, t.provider),
    index("user_oauth_user_idx").on(t.userId),
  ],
);

