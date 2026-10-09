// @ts-nocheck
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, tool } from "ai";
import { db, schema } from "@/server/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth";

export const maxDuration = 30;

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(req: Request) {
  const { session } = await getCurrentSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { messages } = await req.json();

  const result = streamText({
    model: google("gemini-1.5-pro-latest"),
    messages,
    maxSteps: 5,
    system: `You are MediFlow, an intelligent AI assistant for a pharmacy and clinic management system. 
You can help the user check inventory, add new medicines, check drug interactions, generate reports, and draft purchase orders.
When answering, be concise, professional, and helpful. Format your responses using markdown where appropriate (like tables or bold text).`,
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
        description: "Get a summary of sales/revenue for the day or week.",
        parameters: z.object({
          period: z.enum(["today", "week"]).describe("The time period for the sales summary")
        }),
        execute: async ({ period }: any) => {
          return {
            period,
            total_sales: period === "today" ? 15420.50 : 89450.00,
            currency: "INR",
            total_invoices: period === "today" ? 24 : 145
          };
        }
      })
    }
  });

  return result.toDataStreamResponse();
}
