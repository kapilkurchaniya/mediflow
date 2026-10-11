// @ts-nocheck
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { streamText, tool, convertToModelMessages, isStepCount } from "ai";
import { db, schema } from "@/server/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth";
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
  throw new Error(`Unknown provider: ${entry.provider}`);
}

const SYSTEM_PROMPT = `You are MediFlow, an intelligent AI assistant for a pharmacy and clinic management system.
You have REAL-TIME access to the store's database and can provide accurate, live data — never make up numbers.

Your capabilities:
- **Sales Data**: Get real sales summaries for any period (today, yesterday, this week, this month, last month, this quarter, this year, or custom date ranges). Always use the get_sales_summary tool.
- **Purchase Data**: Get real purchase summaries for any period using the get_purchase_summary tool.
- **Stock & Inventory**: Check inventory levels, search for specific products, get low-stock alerts, near-expiry reports, and stock valuation using check_inventory and get_stock_report tools.
- **Add Medicines**: Add new medicines to the catalogue using add_medicine.
- **Drug Interactions**: Check interactions between medications using check_interactions.
- **POS Integration**: Add medicines to the current bill using add_to_bill.

Important rules:
1. Always use tools to fetch data — NEVER return hardcoded or estimated values.
2. When the user asks about sales, revenue, or billing data, call get_sales_summary with the appropriate period.
3. When asked about purchases, call get_purchase_summary.
4. When asked about stock, inventory value, low-stock or expiry, call get_stock_report.
5. Money values from the database are in PAISE (1/100th of a rupee). Convert to rupees for display using the _display fields.
6. Format responses using markdown tables where appropriate. Be concise and professional.
7. All data is automatically scoped to the user's store/tenant for security — never expose data from other tenants.`;


export async function POST(req: Request) {
  const { session } = await getCurrentSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
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
        // @ts-ignore - Ignore zod v4 / ai SDK v7 type incompatibility
        check_inventory: tool({
          description: "Check the current inventory levels for all products, or a specific product if provided. Identifies low-stock items.",
          parameters: z.object({
            productName: z.string().optional().describe("Optional product name to search for. If omitted, returns low stock items."),
          }),
          execute: async ({ productName }: any) => {
            try {
              let query;
              if (productName) {
                query = sql`
                  SELECT m.name, m.generic_name, m.mrp, SUM(b.qty_on_hand) as total_stock, m.reorder_level
                  FROM medicines m
                  LEFT JOIN batches b ON m.id = b.medicine_id
                  WHERE m.name ILIKE ${'%' + productName + '%'} AND m.tenant_id = ${session.tenantId}
                  GROUP BY m.id
                  LIMIT 10
                `;
              } else {
                // Return low stock items
                query = sql`
                  SELECT m.name, m.generic_name, m.mrp, COALESCE(SUM(b.qty_on_hand), 0) as total_stock, m.reorder_level
                  FROM medicines m
                  LEFT JOIN batches b ON m.id = b.medicine_id
                  WHERE m.tenant_id = ${session.tenantId}
                  GROUP BY m.id
                  HAVING COALESCE(SUM(b.qty_on_hand), 0) <= m.reorder_level
                  LIMIT 10
                `;
              }
              
              const res = await db.execute(query);
              return {
                results: res.rows,
                message: res.rows.length ? "Found these items." : "No low stock items found.",
              };
            } catch (e: unknown) {
              return { error: e instanceof Error ? e.message : "Unknown error" };
            }
          },
        }),
        // @ts-ignore
        add_medicine: tool({
          description: "Add a new medicine/product to the pharmacy database. This can be used when the user asks to add a medicine via voice or text.",
          parameters: z.object({
            name: z.string().describe("The commercial name of the medicine (e.g. Dolo 650)"),
            genericName: z.string().optional().describe("The generic composition (e.g. Paracetamol)"),
            mrp: z.number().optional().describe("The MRP (Maximum Retail Price) in rupees"),
            packSize: z.string().optional().describe("The pack size (e.g. 15 tablets)")
          }),
          execute: async ({ name, genericName, mrp, packSize }: any) => {
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
        // @ts-ignore
        check_interactions: tool({
          description: "Check if there are any known drug interactions between two or more medications.",
          parameters: z.object({
            medications: z.array(z.string()).describe("List of medication names to check interactions for (e.g., ['Ibuprofen', 'Aspirin'])"),
          }),
          execute: async ({ medications }: any) => {
            return {
              status: "success",
              message: `Please evaluate the interactions between ${medications.join(' and ')} based on your medical knowledge.`,
              note: "Disclaimer: This is an AI assessment, not medical advice."
            };
          }
        }),
        // @ts-ignore
        add_to_bill: tool({
          description: "Add a medicine to the current bill/cart in the Point of Sale interface. The user might say 'add dolo in the bill'.",
          parameters: z.object({
            medicineName: z.string().describe("The name of the medicine to add")
          }),
          execute: async ({ medicineName }: any) => {
            try {
              const query = sql`SELECT id, name, mrp FROM medicines WHERE name ILIKE ${'%' + medicineName + '%'} AND tenant_id = ${session.tenantId} AND is_active = true LIMIT 1`;
              const res = await db.execute(query);
              if (res.rows.length === 0) return { error: "Medicine not found in inventory." };
              
              const med = res.rows[0];
              const batchQuery = sql`SELECT id as batch_id, batch_no, mrp, qty_on_hand, gst_rate_bp FROM batches WHERE medicine_id = ${med.id} AND qty_on_hand > 0 LIMIT 1`;
              const batchRes = await db.execute(batchQuery);
              if (batchRes.rows.length === 0) return { error: "No available batches with stock for this medicine." };
              
              const batch = batchRes.rows[0];
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
        // @ts-ignore
        get_sales_summary: tool({
          description: "Get a summary of sales/revenue for a given period. Supports: today, yesterday, this week, last 7 days, this month, last month, this quarter, this year, or a custom date range.",
          parameters: z.object({
            period: z.string().describe("The time period for the sales summary (e.g., 'today', 'this week', 'this month', 'last month', 'this year', 'yesterday')"),
            from: z.string().optional().describe("Optional custom start date in YYYY-MM-DD format"),
            to: z.string().optional().describe("Optional custom end date in YYYY-MM-DD format"),
          }),
          execute: async ({ period, from, to }: any) => {
            try {
              const dateRange = from && to
                ? { from, to }
                : resolveAIPeriod(period);
              
              const conditions: any[] = [
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
              
              const row = result.rows[0] as any;
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
        // @ts-ignore
        get_purchase_summary: tool({
          description: "Get a summary of purchases for a given period. Shows total purchase value, number of invoices, and top suppliers.",
          parameters: z.object({
            period: z.string().describe("The time period (e.g., 'today', 'this week', 'this month', 'last month', 'this year')"),
            from: z.string().optional().describe("Optional custom start date YYYY-MM-DD"),
            to: z.string().optional().describe("Optional custom end date YYYY-MM-DD"),
          }),
          execute: async ({ period, from, to }: any) => {
            try {
              const dateRange = from && to
                ? { from, to }
                : resolveAIPeriod(period);

              const conditions: any[] = [
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

              const row = result.rows[0] as any;
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
        // @ts-ignore
        get_stock_report: tool({
          description: "Get a detailed stock report. Can show overall stock summary, stock value, low-stock items, or near-expiry items.",
          parameters: z.object({
            reportType: z.enum(["summary", "low_stock", "near_expiry", "value"]).describe("Type of stock report: 'summary' for overall counts, 'low_stock' for items below reorder level, 'near_expiry' for items expiring within 90 days, 'value' for total stock value"),
          }),
          execute: async ({ reportType }: any) => {
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
                  LEFT JOIN batches b ON m.id = b.medicine_id AND b.store_id = ${session.storeId}
                  WHERE m.tenant_id = ${session.tenantId} AND m.is_active = true
                `);
                const row = result.rows[0] as any;
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
                  LEFT JOIN batches b ON m.id = b.medicine_id AND b.store_id = ${session.storeId}
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
  } catch (err: any) {
    return new Response(err.stack || String(err), { status: 500 });
  }
}
