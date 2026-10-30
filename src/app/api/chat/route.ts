import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { streamText, tool, convertToModelMessages, isStepCount } from "ai";
import { db, schema } from "@/server/db";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getAuthCtx, can } from "@/server/rbac";
import { resolveAIPeriod } from "@/lib/date-range";

export const maxDuration = 60;

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

// Model fallback chain: each entry is tried up to MAX_RETRIES times
const MODEL_CHAIN = [
  { provider: "google" as const, id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { provider: "google" as const, id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { provider: "groq" as const, id: "openai/gpt-oss-20b", label: "Groq GPT-OSS 20B" },
];
const MAX_RETRIES = 3;

function getModel(entry: (typeof MODEL_CHAIN)[number]) {
  if (entry.provider === "google") return google(entry.id);
  if (entry.provider === "groq") return groq(entry.id);
  throw new Error("Unknown AI provider");
}

const SYSTEM_PROMPT = `You are MediFlow, an intelligent AI assistant for a pharmacy and clinic management system.
You have REAL-TIME access to the store's database and can provide accurate, live data — never make up numbers or guess values.

Your capabilities:
- **Sales Data**: Get live sales summaries for any period (today, yesterday, this week, this month, last month, this quarter, this year, or custom date ranges) using get_sales_summary. Look up specific invoices or recent transaction logs using get_sales_details.
- **Stock Details & Inventory**: Check stock details for specific medicines (batches, expiries, quantities on hand, MRP) using get_stock_details or check_inventory. Get inventory valuation, low-stock items, and near-expiry reports using get_stock_report.
- **Purchase Data**: Get real purchase and supplier expense summaries for any period using get_purchase_summary.
- **Add Medicines**: Add new medicines to the catalogue using add_medicine.
- **Drug Interactions**: Check interactions between medications using check_interactions.
- **POS Integration**: Add medicines directly to the current bill/cart using add_to_bill.

Data Protection & Security Rules:
1. Always use tools to fetch live data from the database — NEVER return hardcoded, estimated, or fabricated numbers.
2. Data Isolation: All queries are strictly scoped to the authenticated user's store and tenant. Never disclose or attempt to access other stores' or tenants' data.
3. Privacy: Do not expose sensitive internal credentials, tokens, or private patient information.
4. Currency: Financial values are returned in Indian Rupees (₹). Always display prices and totals formatted with the ₹ symbol.
5. Table Structure: When generating Markdown tables, ALWAYS put separate newline breaks (\n) between every row, especially after the table header and separator rows. Never concatenate rows on the same line.
   Example:
   | Metric | Value |
   | :--- | :--- |
   | Total Invoices | 1 |
   | Total Revenue | ₹153.00 |
6. Format your responses with structured cards, bold callouts, and clean bullet points for instant readability.`;


export async function POST(req: Request) {
  const ctx = await getAuthCtx().catch(() => null);
  if (!ctx || !ctx.tenantId || !ctx.storeId) {
    return new Response(JSON.stringify({ error: "Unauthorized: Active store session required." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!can(ctx, "ai.use")) {
    return new Response(JSON.stringify({ error: "Forbidden: AI assistant access requires 'ai.use' permission." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const session = { tenantId: ctx.tenantId, storeId: ctx.storeId };
  const body = await req.json();
  let messages = body.messages;

  // Fallback for Vercel AI SDK 7 payload formats
  if (!messages) {
    if (body.role && (body.parts || body.content)) {
      messages = [body];
    } else if (Array.isArray(body)) {
      messages = body;
    } else {
      messages = [];
    }
  } else if (!Array.isArray(messages)) {
    messages = [messages];
  }

  try {
    const modelMessages = await convertToModelMessages(messages);

    // Build shared streamText options (everything except `model`)
    const streamOptions = {
      messages: modelMessages,
      stopWhen: isStepCount(5),
      system: SYSTEM_PROMPT,
      tools: {
        get_stock_details: tool({
          description: "Get detailed stock information for specific medicines, generic compositions, or batch numbers. Returns active batches, quantities on hand, expiry dates, and MRP. Fully protected and scoped to this store.",
          inputSchema: z.object({
            searchTerm: z.string().describe("The name of the medicine, generic salt, or batch number to look up stock details for."),
          }),
          execute: async ({ searchTerm }) => {
            try {
              // 1. Fetch matching active medicines for this tenant
              const medResult = await db.execute(sql`
                SELECT m.id, m.name, m.generic_name, m.pack_size, m.mrp, m.reorder_level
                FROM medicines m
                WHERE (m.name ILIKE ${'%' + searchTerm + '%'} OR m.generic_name ILIKE ${'%' + searchTerm + '%'})
                  AND m.tenant_id = ${session.tenantId}
                  AND m.is_active = true
                ORDER BY m.name ASC
                LIMIT 5
              `);

              if (medResult.rows.length === 0) {
                return {
                  searchTerm,
                  found: false,
                  message: `No medicine matching "${searchTerm}" was found in this store's catalogue.`,
                };
              }

              const medicines = [];
              for (const row of medResult.rows as Array<{ id: string; name: string; generic_name: string | null; pack_size: string | null; mrp: number | null; reorder_level: number | null }>) {
                // Fetch active batches for this medicine in this store with tenant isolation
                const batchResult = await db.execute(sql`
                  SELECT 
                    b.id,
                    b.batch_no,
                    b.expiry_date,
                    b.qty_on_hand,
                    b.mrp,
                    b.sale_rate
                  FROM batches b
                  WHERE b.medicine_id = ${row.id}
                    AND b.store_id = ${session.storeId}
                    AND b.tenant_id = ${session.tenantId}
                    AND b.qty_on_hand > 0
                  ORDER BY b.expiry_date ASC
                `);

                const batches = (batchResult.rows as Array<{ batch_no: string; expiry_date: string; qty_on_hand: number; mrp: number | null; sale_rate: number | null }>).map((b) => ({
                  batch_no: b.batch_no,
                  expiry_date: b.expiry_date,
                  qty_on_hand: Number(b.qty_on_hand),
                  mrp_display: `₹${(Number(b.mrp || 0) / 100).toFixed(2)}`,
                  sale_rate_display: `₹${(Number(b.sale_rate || b.mrp || 0) / 100).toFixed(2)}`,
                }));

                const totalStock = batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
                const isLowStock = totalStock <= (Number(row.reorder_level) || 10);

                medicines.push({
                  id: row.id,
                  name: row.name,
                  generic_composition: row.generic_name || "N/A",
                  pack_size: row.pack_size || "Unit",
                  mrp_display: `₹${(Number(row.mrp || 0) / 100).toFixed(2)}`,
                  total_stock_units: totalStock,
                  stock_status: totalStock === 0 ? "OUT_OF_STOCK" : isLowStock ? "LOW_STOCK" : "IN_STOCK",
                  active_batches: batches,
                });
              }

              return {
                searchTerm,
                found: true,
                count: medicines.length,
                medicines,
                protection_notice: "Protected store-scoped live stock data.",
              };
            } catch (e: unknown) {
              return { error: e instanceof Error ? e.message : "Unable to retrieve stock details." };
            }
          },
        }),
        check_inventory: tool({
          description: "Check inventory levels across the catalogue or list items that are currently low in stock. Fully protected and scoped to this store.",
          inputSchema: z.object({
            productName: z.string().optional().describe("Optional product name to search for. If omitted, returns low stock items."),
          }),
          execute: async ({ productName }) => {
            try {
              let query;
              if (productName) {
                query = sql`
                  SELECT m.name, m.generic_name, m.mrp, COALESCE(SUM(b.qty_on_hand), 0) as total_stock, m.reorder_level
                  FROM medicines m
                  LEFT JOIN batches b ON m.id = b.medicine_id AND b.store_id = ${session.storeId} AND b.tenant_id = ${session.tenantId}
                  WHERE m.name ILIKE ${'%' + productName + '%'} AND m.tenant_id = ${session.tenantId} AND m.is_active = true
                  GROUP BY m.id
                  LIMIT 10
                `;
              } else {
                // Return low stock items
                query = sql`
                  SELECT m.name, m.generic_name, m.mrp, COALESCE(SUM(b.qty_on_hand), 0) as total_stock, m.reorder_level
                  FROM medicines m
                  LEFT JOIN batches b ON m.id = b.medicine_id AND b.store_id = ${session.storeId} AND b.tenant_id = ${session.tenantId}
                  WHERE m.tenant_id = ${session.tenantId} AND m.is_active = true
                  GROUP BY m.id
                  HAVING COALESCE(SUM(b.qty_on_hand), 0) <= m.reorder_level
                  LIMIT 15
                `;
              }
              
              const res = await db.execute(query);
              const items = (res.rows as Array<{ name: string; generic_name: string | null; total_stock: number; reorder_level: number | null; mrp: number | null }>).map((r) => ({
                name: r.name,
                generic_composition: r.generic_name,
                total_stock: Number(r.total_stock || 0),
                reorder_level: Number(r.reorder_level || 10),
                mrp_display: `₹${(Number(r.mrp || 0) / 100).toFixed(2)}`,
              }));
              return {
                results: items,
                count: items.length,
                message: items.length ? `Found ${items.length} items.` : "No items found matching the criteria.",
              };
            } catch (e: unknown) {
              return { error: e instanceof Error ? e.message : "Unable to query inventory." };
            }
          },
        }),
        add_medicine: tool({
          description: "Add a new medicine/product to the pharmacy database. This can be used when the user asks to add a medicine via voice or text.",
          inputSchema: z.object({
            name: z.string().describe("The commercial name of the medicine (e.g. Dolo 650)"),
            genericName: z.string().optional().describe("The generic composition (e.g. Paracetamol)"),
            mrp: z.number().optional().describe("The MRP (Maximum Retail Price) in rupees"),
            packSize: z.string().optional().describe("The pack size (e.g. 15 tablets)")
          }),
          execute: async ({ name, genericName, mrp, packSize }) => {
            try {
              const [newMed] = await db.insert(schema.medicines).values({
                tenantId: session.tenantId,
                name,
                genericName: genericName || null,
                mrp: mrp ? Math.round(mrp * 100) : 0, // Store as paise
                packSize: packSize || null,
                isActive: true,
              }).returning();
              return {
                status: "success",
                message: `Successfully added ${name} to the database.`,
                medicine: newMed
              };
            } catch (e: unknown) {
              return { error: e instanceof Error ? e.message : "Unknown error" };
            }
          }
        }),
        check_interactions: tool({
          description: "Check if there are any known drug interactions between two or more medications.",
          inputSchema: z.object({
            medications: z.array(z.string()).describe("List of medication names to check interactions for (e.g., ['Ibuprofen', 'Aspirin'])"),
          }),
          execute: async ({ medications }) => {
            return {
              status: "success",
              message: `Please evaluate the interactions between ${medications.join(' and ')} based on your medical knowledge.`,
              note: "Disclaimer: This is an AI assessment, not medical advice."
            };
          }
        }),
        add_to_bill: tool({
          description: "Add a medicine to the current bill/cart in the Point of Sale interface. The user might say 'add dolo in the bill'.",
          inputSchema: z.object({
            medicineName: z.string().describe("The name of the medicine to add")
          }),
          execute: async ({ medicineName }) => {
            try {
              const query = sql`SELECT id, name, mrp FROM medicines WHERE name ILIKE ${'%' + medicineName + '%'} AND tenant_id = ${session.tenantId} AND is_active = true LIMIT 1`;
              const res = await db.execute(query);
              if (res.rows.length === 0) return { error: "Medicine not found in inventory." };
              
              const med = res.rows[0] as { id: string; name: string; mrp: number | null };
              const batchQuery = sql`SELECT id as batch_id, batch_no, mrp, qty_on_hand, gst_rate_bp FROM batches WHERE medicine_id = ${med.id} AND qty_on_hand > 0 AND store_id = ${session.storeId} AND tenant_id = ${session.tenantId} LIMIT 1`;
              const batchRes = await db.execute(batchQuery);
              if (batchRes.rows.length === 0) return { error: "No available batches with stock for this medicine." };
              
              const batch = batchRes.rows[0] as { batch_id: string; batch_no: string; mrp: number | null; qty_on_hand: number; gst_rate_bp: number | null };
              return {
                action: "DISPATCH_ADD_TO_BILL",
                payload: {
                  medicineId: med.id,
                  medicineName: med.name,
                  batchId: batch.batch_id,
                  batchNo: batch.batch_no,
                  qty: 1,
                  mrp: batch.mrp,
                  qtyOnHand: batch.qty_on_hand,
                  gstRateBp: batch.gst_rate_bp
                },
                message: `I've triggered the action to add 1 unit of ${med.name} to the bill.`
              };
            } catch (e: unknown) {
               return { error: e instanceof Error ? e.message : "Unknown error" };
            }
          }
        }),
        get_sales_summary: tool({
          description: "Get a summary of sales/revenue for a given period. Supports: today, yesterday, this week, last 7 days, this month, last month, this quarter, this year, or a custom date range.",
          inputSchema: z.object({
            period: z.string().describe("The time period for the sales summary (e.g., 'today', 'this week', 'this month', 'last month', 'this year', 'yesterday')"),
            from: z.string().optional().describe("Optional custom start date in YYYY-MM-DD format"),
            to: z.string().optional().describe("Optional custom end date in YYYY-MM-DD format"),
          }),
          execute: async ({ period, from, to }) => {
            try {
              const dateRange = from && to
                ? { from, to }
                : resolveAIPeriod(period);
              
              const conditions: SQL[] = [
                sql`s.store_id = ${session.storeId}`,
                sql`s.tenant_id = ${session.tenantId}`,
                sql`s.status = 'completed'`,
              ];
              
              if (dateRange.from) {
                conditions.push(sql`s.created_at >= ${dateRange.from}::date`);
              }
              if (dateRange.to) {
                conditions.push(sql`s.created_at < (${dateRange.to}::date + interval '1 day')`);
              }

              const whereClause = sql.join(conditions, sql` AND `);
              
              const result = await db.execute(sql`
                SELECT 
                  COALESCE(SUM(s.total_amount), 0) as total_revenue,
                  COUNT(s.id) as total_invoices,
                  COALESCE(AVG(s.total_amount), 0) as avg_order_value,
                  COALESCE(SUM(s.cost_amount), 0) as total_cost,
                  COALESCE(SUM(s.credit_amount), 0) as total_credit
                FROM sales s
                WHERE ${whereClause}
              `);
              
              const row = result.rows[0] as Record<string, unknown> | undefined;
              const totalRevenue = Number(row?.total_revenue || 0);
              const totalInvoices = Number(row?.total_invoices || 0);
              const avgOrderValue = Number(row?.avg_order_value || 0);
              const totalCredit = Number(row?.total_credit || 0);
              
              // Format paise to rupees for display
              return {
                period,
                date_range: `${dateRange.from || 'all time'} to ${dateRange.to || 'now'}`,
                total_revenue: totalRevenue,
                total_revenue_display: `₹${(totalRevenue / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                total_invoices: totalInvoices,
                average_order_value: avgOrderValue,
                average_order_value_display: `₹${(avgOrderValue / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                total_credit_outstanding: totalCredit,
                total_credit_display: `₹${(totalCredit / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                currency: "INR",
                message: totalInvoices > 0
                  ? `Found ${totalInvoices} invoices for ${period}.`
                  : `No sales found for ${period}.`,
              };
            } catch (e: unknown) {
              return { error: e instanceof Error ? e.message : "Unknown error" };
            }
          }
        }),
        get_sales_details: tool({
          description: "Get detailed sales transaction list or look up specific invoices. Shows invoice number, customer name, total amount (₹), payment status, and timestamp. Strictly protected and scoped to this store.",
          inputSchema: z.object({
            period: z.string().optional().describe("Time period e.g. 'today', 'yesterday', 'this week', 'this month'"),
            from: z.string().optional().describe("Custom start date YYYY-MM-DD"),
            to: z.string().optional().describe("Custom end date YYYY-MM-DD"),
            invoiceNo: z.string().optional().describe("Optional invoice number to search for"),
            limit: z.number().optional().describe("Maximum number of records to return (default 10, max 25)"),
          }),
          execute: async ({
            period,
            from,
            to,
            invoiceNo,
            limit = 10,
          }) => {
            try {
              const dateRange = (from || to)
                ? { from: from || null, to: to || null }
                : period
                  ? resolveAIPeriod(period)
                  : { from: null, to: null };

              const conditions: SQL[] = [
                sql`s.store_id = ${session.storeId}`,
                sql`s.tenant_id = ${session.tenantId}`,
              ];

              if (invoiceNo) {
                conditions.push(sql`s.invoice_no ILIKE ${'%' + invoiceNo + '%'}`);
              }
              if (dateRange.from) {
                conditions.push(sql`s.created_at >= ${dateRange.from}::date`);
              }
              if (dateRange.to) {
                conditions.push(sql`s.created_at < (${dateRange.to}::date + interval '1 day')`);
              }

              const whereClause = sql.join(conditions, sql` AND `);
              const maxLimit = Math.min(Math.max(1, limit || 10), 25);

              const result = await db.execute(sql`
                SELECT 
                  s.id,
                  s.invoice_no,
                  s.total_amount,
                  s.payment_mode,
                  s.status,
                  s.created_at,
                  c.name as customer_name
                FROM sales s
                LEFT JOIN customers c ON s.customer_id = c.id
                WHERE ${whereClause}
                ORDER BY s.created_at DESC
                LIMIT ${maxLimit}
              `);

              interface SalesDetailRow {
                invoice_no: string;
                customer_name: string | null;
                total_amount: number | null;
                payment_mode: string | null;
                status: string;
                created_at: string | Date | null;
              }

              const invoices = (result.rows as unknown as SalesDetailRow[]).map((r) => ({
                invoice_no: r.invoice_no,
                customer_name: r.customer_name || "Walk-in customer",
                amount_rupees: `₹${(Number(r.total_amount || 0) / 100).toFixed(2)}`,
                payment_mode: r.payment_mode || "cash",
                status: r.status,
                created_at: r.created_at ? new Date(r.created_at).toLocaleString("en-IN") : "N/A",
              }));

              return {
                period: period || "custom/recent",
                count: invoices.length,
                invoices,
                protection_notice: "Protected store-scoped live sales records.",
              };
            } catch (e: unknown) {
              return { error: e instanceof Error ? e.message : "Unable to retrieve sales details." };
            }
          },
        }),
        get_purchase_summary: tool({
          description: "Get a summary of purchases for a given period. Shows total purchase value, number of invoices, and top suppliers.",
          inputSchema: z.object({
            period: z.string().describe("The time period (e.g., 'today', 'this week', 'this month', 'last month', 'this year')"),
            from: z.string().optional().describe("Optional custom start date YYYY-MM-DD"),
            to: z.string().optional().describe("Optional custom end date YYYY-MM-DD"),
          }),
          execute: async ({ period, from, to }) => {
            try {
              const dateRange = from && to
                ? { from, to }
                : resolveAIPeriod(period);

              const conditions: SQL[] = [
                sql`p.store_id = ${session.storeId}`,
                sql`p.tenant_id = ${session.tenantId}`,
                sql`p.status = 'posted'`,
              ];

              if (dateRange.from) {
                conditions.push(sql`p.invoice_date >= ${dateRange.from}`);
              }
              if (dateRange.to) {
                conditions.push(sql`p.invoice_date <= ${dateRange.to}`);
              }

              const whereClause = sql.join(conditions, sql` AND `);

              const result = await db.execute(sql`
                SELECT 
                  COALESCE(SUM(p.total_amount), 0) as total_purchases,
                  COUNT(p.id) as total_invoices,
                  COALESCE(SUM(p.paid_amount), 0) as total_paid,
                  COALESCE(SUM(p.total_amount) - SUM(p.paid_amount), 0) as outstanding
                FROM purchases p
                WHERE ${whereClause}
              `);

              const row = result.rows[0] as Record<string, unknown> | undefined;
              return {
                period,
                date_range: `${dateRange.from || 'all time'} to ${dateRange.to || 'now'}`,
                total_purchases: Number(row?.total_purchases || 0),
                total_purchases_display: `₹${(Number(row?.total_purchases || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                total_invoices: Number(row?.total_invoices || 0),
                total_paid_display: `₹${(Number(row?.total_paid || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                outstanding_display: `₹${(Number(row?.outstanding || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                currency: "INR",
                message: `Found ${row?.total_invoices || 0} purchase invoices for ${period}.`,
              };
            } catch (e: unknown) {
              return { error: e instanceof Error ? e.message : "Unknown error" };
            }
          }
        }),
        get_stock_report: tool({
          description: "Get a detailed stock report. Can show overall stock summary, stock value, low-stock items, or near-expiry items.",
          inputSchema: z.object({
            reportType: z.enum(["summary", "low_stock", "near_expiry", "value"]).describe("Type of stock report: 'summary' for overall counts, 'low_stock' for items below reorder level, 'near_expiry' for items expiring within 90 days, 'value' for total stock value"),
          }),
          execute: async ({ reportType }) => {
            try {
              if (reportType === "summary" || reportType === "value") {
                const result = await db.execute(sql`
                  SELECT 
                    COUNT(DISTINCT m.id) as total_items,
                    COALESCE(SUM(b.qty_on_hand), 0) as total_units,
                    COALESCE(SUM(b.qty_on_hand * b.purchase_rate), 0) as stock_cost_value,
                    COALESCE(SUM(b.qty_on_hand * COALESCE(b.sale_rate, b.mrp)), 0) as stock_sale_value,
                    COUNT(DISTINCT CASE WHEN b.qty_on_hand > 0 THEN m.id END) as items_in_stock
                  FROM medicines m
                  LEFT JOIN batches b ON m.id = b.medicine_id AND b.store_id = ${session.storeId} AND b.tenant_id = ${session.tenantId}
                  WHERE m.tenant_id = ${session.tenantId} AND m.is_active = true
                `);
                const row = result.rows[0] as Record<string, unknown> | undefined;
                return {
                  report_type: reportType,
                  total_items: Number(row?.total_items || 0),
                  items_in_stock: Number(row?.items_in_stock || 0),
                  total_units: Number(row?.total_units || 0),
                  stock_cost_value_display: `₹${(Number(row?.stock_cost_value || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                  stock_sale_value_display: `₹${(Number(row?.stock_sale_value || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                };
              } else if (reportType === "low_stock") {
                const result = await db.execute(sql`
                  SELECT m.name, m.generic_name, COALESCE(SUM(b.qty_on_hand), 0) as total_stock, m.reorder_level
                  FROM medicines m
                  LEFT JOIN batches b ON m.id = b.medicine_id AND b.store_id = ${session.storeId} AND b.tenant_id = ${session.tenantId}
                  WHERE m.tenant_id = ${session.tenantId} AND m.is_active = true
                  GROUP BY m.id, m.name, m.generic_name, m.reorder_level
                  HAVING COALESCE(SUM(b.qty_on_hand), 0) <= m.reorder_level
                  ORDER BY COALESCE(SUM(b.qty_on_hand), 0) ASC
                  LIMIT 20
                `);
                return {
                  report_type: "low_stock",
                  count: result.rows.length,
                  items: result.rows,
                  message: result.rows.length > 0
                    ? `Found ${result.rows.length} items below reorder level.`
                    : "All items are above reorder level.",
                };
              } else {
                // near_expiry
                const ninetyDays = new Date();
                ninetyDays.setDate(ninetyDays.getDate() + 90);
                const thresholdStr = ninetyDays.toISOString().split("T")[0];
                
                const result = await db.execute(sql`
                  SELECT m.name, b.batch_no, b.expiry_date, b.qty_on_hand
                  FROM batches b
                  INNER JOIN medicines m ON b.medicine_id = m.id
                  WHERE b.store_id = ${session.storeId} 
                    AND b.tenant_id = ${session.tenantId}
                    AND b.qty_on_hand > 0
                    AND b.expiry_date <= ${thresholdStr}
                  ORDER BY b.expiry_date ASC
                  LIMIT 20
                `);
                return {
                  report_type: "near_expiry",
                  count: result.rows.length,
                  items: result.rows,
                  message: result.rows.length > 0
                    ? `Found ${result.rows.length} batches expiring within 90 days.`
                    : "No batches expiring within 90 days.",
                };
              }
            } catch (e: unknown) {
              return { error: e instanceof Error ? e.message : "Unknown error" };
            }
          }
        })
      }
    } as const;

    // Try each model in the chain with retries
    let lastError: Error | null = null;

    for (const modelEntry of MODEL_CHAIN) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[MediFlow AI] Trying ${modelEntry.label} (attempt ${attempt}/${MAX_RETRIES})`);
          const result = streamText({
            ...streamOptions,
            model: getModel(modelEntry),
          });
          // If streamText didn't throw, return the stream
          return result.toUIMessageStreamResponse();
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(
            `[MediFlow AI] ${modelEntry.label} attempt ${attempt} failed: ${lastError.message}`
          );
          // Small backoff before retrying the same model
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
      }
      console.warn(`[MediFlow AI] All ${MAX_RETRIES} attempts exhausted for ${modelEntry.label}, falling back...`);
    }

    // All models exhausted
    console.error("[MediFlow AI] All models failed.", lastError);
    return new Response(
      JSON.stringify({
        error: "All AI models are currently unavailable. Please try again later.",
        details: lastError?.message,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    return new Response(err instanceof Error ? err.stack || err.message : String(err), { status: 500 });
  }
}
