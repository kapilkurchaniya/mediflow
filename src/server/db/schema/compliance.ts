/** Compliance: doctors, prescriptions, statutory dispensing registers. (Lane B) */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./_helpers";
import { medicines } from "./catalog";
import { customers } from "./crm";
import { batches } from "./inventory";
import { storeId, tenantId, users } from "./platform";
import { saleItems, sales } from "./sales";

export const doctors = pgTable(
  "doctors",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    regNo: text("reg_no").notNull(),
    qualification: text("qualification"),
    specialization: text("specialization"),
    hospital: text("hospital"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("doctors_tenant_reg_uq").on(t.tenantId, sql`lower(${t.regNo})`),
    index("doctors_tenant_name_idx").on(t.tenantId, sql`lower(${t.name})`),
    index("doctors_tenant_updated_idx").on(t.tenantId, t.updatedAt, t.id),
  ],
);

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    customerId: uuid("customer_id").references(() => customers.id),
    patientName: text("patient_name").notNull(),
    patientAge: integer("patient_age"),
    patientGender: text("patient_gender"), // male | female | other
    patientPhone: text("patient_phone"),
    patientAddress: text("patient_address"),
    doctorId: uuid("doctor_id").references(() => doctors.id),
    doctorName: text("doctor_name").notNull(),
    doctorRegNo: text("doctor_reg_no"),
    doctorAddress: text("doctor_address"),
    rxNumber: text("rx_number"),
    prescriptionDate: date("prescription_date").notNull(),
    diagnosis: text("diagnosis"),
    notes: text("notes"),
    imageUrl: text("image_url"),
    status: text("status").notNull().default("active"), // active | partially_dispensed | fully_dispensed | cancelled
    validUntil: date("valid_until"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("prescriptions_store_idx").on(t.storeId, t.prescriptionDate),
    index("prescriptions_customer_idx").on(t.customerId),
  ],
);

export const prescriptionItems = pgTable(
  "prescription_items",
  {
    id: id(),
    tenantId: tenantId(),
    prescriptionId: uuid("prescription_id").notNull().references(() => prescriptions.id, { onDelete: "cascade" }),
    medicineId: uuid("medicine_id").references(() => medicines.id),
    medicineName: text("medicine_name").notNull(),
    dosage: text("dosage"),
    frequency: text("frequency"),
    durationDays: integer("duration_days"),
    quantityPrescribed: integer("quantity_prescribed").notNull(),
    quantityDispensed: integer("quantity_dispensed").notNull().default(0),
    instructions: text("instructions"),
  },
  (t) => [index("prescription_items_rx_idx").on(t.prescriptionId)],
);

export const dispensingLogs = pgTable(
  "dispensing_logs",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    saleItemId: uuid("sale_item_id").notNull().references(() => saleItems.id, { onDelete: "cascade" }),
    medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    medicineName: text("medicine_name").notNull(),
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date").notNull(),
    manufacturerName: text("manufacturer_name"),
    schedule: text("schedule").notNull(), // H | H1 | X | narcotic
    patientName: text("patient_name").notNull(),
    patientAge: integer("patient_age"),
    patientGender: text("patient_gender"),
    patientAddress: text("patient_address"),
    patientPhone: text("patient_phone"),
    doctorName: text("doctor_name").notNull(),
    doctorRegNo: text("doctor_reg_no"),
    doctorAddress: text("doctor_address"),
    prescriptionRef: text("prescription_ref"),
    prescriptionDate: date("prescription_date"),
    quantityDispensed: integer("quantity_dispensed").notNull(),
    pharmacistId: uuid("pharmacist_id").references(() => users.id),
    pharmacistName: text("pharmacist_name"),
    pharmacistRegNo: text("pharmacist_reg_no"),
    statutoryRegister: text("statutory_register").notNull(), // schedule_h | schedule_h1 | schedule_x | narcotics
    dispensedAt: timestamp("dispensed_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("dispensing_logs_reg_idx").on(t.storeId, t.statutoryRegister, t.dispensedAt),
    index("dispensing_logs_med_idx").on(t.medicineId, t.dispensedAt),
    index("dispensing_logs_sale_idx").on(t.saleId),
  ],
);
