"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { protectedAction } from "@/server/action";
import { can } from "@/server/rbac";
import {
  RecordExpenseInputSchema,
  recordExpense,
  createExpenseAccount,
  listExpenseAccounts,
  getExpenseSummaryStats,
} from "@/server/domain/expenses";

export const recordExpenseAction = protectedAction("accounting.post")
  .inputSchema(RecordExpenseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await db.transaction((tx) => recordExpense(tx, ctx, parsedInput));
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/accounting/expenses");
    revalidatePath("/dashboard/sales/pos");
    return result;
  });

export const createExpenseAccountAction = protectedAction("accounting.post")
  .inputSchema(
    z.object({
      name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
      code: z.string().trim().regex(/^\d{4}$/, "Code must be 4 digits").optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const account = await createExpenseAccount(db, ctx, parsedInput);
    revalidatePath("/dashboard/accounting/expenses");
    revalidatePath("/dashboard/accounting/expenses/new");
    return account;
  });

export const getExpenseAccountsAction = protectedAction("accounting.view")
  .inputSchema(z.object({}))
  .action(async ({ ctx }) => {
    return listExpenseAccounts(db, ctx.tenantId);
  });

export const getExpenseStatsAction = protectedAction("accounting.view")
  .inputSchema(
    z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const canViewAllStores = can(ctx, "report.all_stores");
    return getExpenseSummaryStats(db, ctx, {
      ...parsedInput,
      canViewAllStores,
    });
  });
