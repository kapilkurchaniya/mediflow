import { createSafeActionClient } from "next-safe-action";
import type { Permission } from "@/lib/permissions";
import { requirePermission } from "./rbac";
import { DomainError } from "./errors";

/**
 * Base client for every Server Action. Errors thrown inside an action become `serverError` on the result:
 * a DomainError (incl. ForbiddenError) shows its own message, anything else a generic one and is logged.
 */
export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (e instanceof DomainError) return e.message;
    console.error("[server action]", e);
    return "Something went wrong. Please try again.";
  },
});

/**
 * An action that needs a signed-in user holding `permission`. `ctx` carries tenantId, storeId, userId and
 * the permission set, so actions never trust ids from the client:
 *
 *   export const createRack = protectedAction("medicine.manage")
 *     .inputSchema(z.object({ code: z.string().min(1) }))
 *     .action(async ({ parsedInput, ctx }) => { ...use ctx.tenantId, ctx.storeId... });
 */
export const protectedAction = (permission: Permission) =>
  actionClient.use(async ({ next }) => next({ ctx: await requirePermission(permission) }));
