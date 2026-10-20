import { bigint, timestamp, uuid } from "drizzle-orm/pg-core";

/** Column helpers shared by every schema file. Must not import any table (keeps import cycles out). */
export const id = () => uuid("id").primaryKey().defaultRandom();
export const money = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);
export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
