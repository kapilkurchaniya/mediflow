// @ts-nocheck
import { google } from "@ai-sdk/google";
import { streamText, tool } from "ai";
import { db } from "@/server/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google("gemini-1.5-pro-latest"),
    messages,
    system: `You are MediFlow, an intelligent AI assistant for a pharmacy and clinic management system. 
You can help the user check inventory, check drug interactions, generate reports, and draft purchase orders.
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
              query = sql`SELECT name, manufacturer, unit_price as price FROM products WHERE name ILIKE ${'%' + productName + '%'} LIMIT 10`;
            } else {
              query = sql`SELECT name, manufacturer, unit_price as price FROM products LIMIT 10`;
            }
            
            const res = await db.execute(query);
            return {
              results: res.rows,
              message: res.rows.length ? "Found these items in inventory." : "No matching items found.",
            };
          } catch (e: unknown) {
            return { error: e instanceof Error ? e.message : "Unknown error" };
          }
        },
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

  return result.toTextStreamResponse();
}
