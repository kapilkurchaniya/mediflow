 /** Communications and jobs: WhatsApp, SMS, reminders, outbox, notifications. (Lane B) */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, createdAt } from "./_helpers";
import { medicines } from "./catalog";
import { customers } from "./crm";
import { stores, tenantId } from "./platform";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantId(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending | done | failed
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("outbox_pending_idx").on(t.status, t.nextAttemptAt, t.id)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id"),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"), // info | warning | critical
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_tenant_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq").on(t.tenantId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

export const whatsappConfigs = pgTable("whatsapp_configs", {
  id: id(),
  tenantId: tenantId(),
  phoneNumberId: text("phone_number_id"),
  businessAccountId: text("business_account_id"),
  accessToken: text("access_token"),
  webhookVerifyToken: text("webhook_verify_token"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: createdAt(),
});

export const whatsappTemplates = pgTable("whatsapp_templates", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  category: text("category").notNull().default("UTILITY"), // MARKETING | UTILITY | AUTHENTICATION
  languageCode: text("language_code").notNull().default("en"),
  header: text("header"),
  body: text("body").notNull(),
  footer: text("footer"),
  variables: jsonb("variables"),
  status: text("status").notNull().default("approved"), // pending | approved | rejected
  metaTemplateId: text("meta_template_id"),
  createdAt: createdAt(),
});

export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id"),
    direction: text("direction").notNull().default("outbound"), // inbound | outbound
    customerId: uuid("customer_id").references(() => customers.id),
    customerPhone: text("customer_phone").notNull(),
    templateId: uuid("template_id").references(() => whatsappTemplates.id),
    messageBody: text("message_body").notNull(),
    messageType: text("message_type").notNull().default("text"), // text | template | document | image
    status: text("status").notNull().default("sent"), // sent | delivered | read | failed
    metaMessageId: text("meta_message_id"),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [
    index("wa_messages_tenant_phone_idx").on(t.tenantId, t.customerPhone),
    index("wa_messages_customer_idx").on(t.customerId),
  ],
);

export const smsConfigs = pgTable("sms_configs", {
  id: id(),
  tenantId: tenantId(),
  provider: text("provider").notNull().default("msg91"), // msg91 | textlocal | twilio
  apiKey: text("api_key"),
  senderId: text("sender_id"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: createdAt(),
});

export const reminders = pgTable(
  "reminders",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id").references(() => stores.id),
    customerId: uuid("customer_id").references(() => customers.id),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone").notNull(),
    type: text("type").notNull().default("refill"), // refill | followup | payment | custom
    medicineId: uuid("medicine_id").references(() => medicines.id),
    scheduledDate: date("scheduled_date").notNull(),
    message: text("message").notNull(),
    channel: text("channel").notNull().default("both"), // sms | whatsapp | both
    status: text("status").notNull().default("pending"), // pending | sent | failed | cancelled
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("reminders_tenant_date_idx").on(t.tenantId, t.scheduledDate, t.status),
    index("reminders_customer_idx").on(t.customerId),
  ],
);

export type WhatsAppConfig = typeof whatsappConfigs.$inferSelect;
export type NewWhatsAppConfig = typeof whatsappConfigs.$inferInsert;
export type WhatsAppTemplate = typeof whatsappTemplates.$inferSelect;
export type NewWhatsAppTemplate = typeof whatsappTemplates.$inferInsert;
export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type NewWhatsAppMessage = typeof whatsappMessages.$inferInsert;
export type SmsConfig = typeof smsConfigs.$inferSelect;
export type NewSmsConfig = typeof smsConfigs.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
