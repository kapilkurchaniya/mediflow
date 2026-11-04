/** GST: tax documents and e-invoice logs. (Lane B) */
import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, money, createdAt, updatedAt } from "./_helpers";
import { storeId, tenantId } from "./platform";

export const gstDocuments = pgTable(
  "gst_documents",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    docType: text("doc_type").notNull(), // invoice | credit_note | debit_note
    docNo: text("doc_no").notNull(),
    docDate: date("doc_date").notNull(),
    partyGstin: text("party_gstin"),
    partyName: text("party_name"),
    partyStateCode: text("party_state_code"),
    placeOfSupply: text("place_of_supply"),
    supplyType: text("supply_type").notNull().default("B2C"), // B2B | B2C | EXPORT
    isReverseCharge: boolean("is_reverse_charge").notNull().default(false),
    taxableAmount: money("taxable_amount"),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    cess: money("cess"),
    total: money("total"),
    refType: text("ref_type"), // sale | purchase | return
    refId: uuid("ref_id"),
    irn: text("irn"), // 64-character e-invoice hash
    irnDate: timestamp("irn_date", { withTimezone: true }),
    ackNo: text("ack_no"),
    ackDate: timestamp("ack_date", { withTimezone: true }),
    signedQrCode: text("signed_qr_code"),
    signedInvoice: text("signed_invoice"), // NIC-signed JWT token payload
    einvoiceProvider: text("einvoice_provider"), // SIMULATOR | SANDBOX | PRODUCTION | provider name
    eWayBillNo: text("e_way_bill_no"),
    eWayBillDate: timestamp("e_way_bill_date", { withTimezone: true }),
    eWayBillValidTill: timestamp("e_way_bill_valid_till", { withTimezone: true }),
    status: text("status").notNull().default("active"), // active | cancelled | amended
    cancelledReason: text("cancelled_reason"), // 1: Duplicate | 2: Data entry mistake | 3: Order cancelled | 4: Other
    cancelledRemarks: text("cancelled_remarks"),
    createdAt: createdAt(),
  },
  (t) => [
    index("gst_docs_tenant_date_idx").on(t.tenantId, t.docDate),
    index("gst_docs_store_idx").on(t.storeId, t.docType),
    index("gst_docs_party_gstin_idx").on(t.partyGstin),
    index("gst_docs_irn_idx").on(t.irn),
    index("gst_docs_ref_idx").on(t.refType, t.refId),
  ],
);

export const eInvoiceLogs = pgTable(
  "e_invoice_logs",
  {
    id: id(),
    tenantId: tenantId(),
    gstDocumentId: uuid("gst_document_id")
      .notNull()
      .references(() => gstDocuments.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // generate | cancel | get_irn | generate_eway_bill | cancel_eway_bill
    requestPayload: jsonb("request_payload"),
    responsePayload: jsonb("response_payload"),
    status: text("status").notNull(), // success | failed
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (t) => [index("e_inv_logs_doc_idx").on(t.gstDocumentId)],
);

export const tenantGspCredentials = pgTable(
  "tenant_gsp_credentials",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id"), // null = tenant-wide default
    provider: text("provider").notNull().default("sandbox_co_in"), // sandbox_co_in | cleartax | masters_india | nic_direct
    clientIdEnc: text("client_id_enc").notNull(),
    clientSecretEnc: text("client_secret_enc").notNull(),
    portalUsernameEnc: text("portal_username_enc").notNull(),
    portalPasswordEnc: text("portal_password_enc").notNull(),
    cachedAuthTokenEnc: text("cached_auth_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    isSandbox: boolean("is_sandbox").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("gsp_creds_tenant_idx").on(t.tenantId),
    index("gsp_creds_store_idx").on(t.storeId),
  ],
);

export type GstDocument = typeof gstDocuments.$inferSelect;
export type NewGstDocument = typeof gstDocuments.$inferInsert;
export type EInvoiceLog = typeof eInvoiceLogs.$inferSelect;
export type NewEInvoiceLog = typeof eInvoiceLogs.$inferInsert;
export type TenantGspCredential = typeof tenantGspCredentials.$inferSelect;
export type NewTenantGspCredential = typeof tenantGspCredentials.$inferInsert;
