import { createSafeActionClient } from "next-safe-action";
import { requireAuth } from "./auth";

export const actionClient = createSafeActionClient();

export const authActionClient = actionClient.use(async ({ next }) => {
  const { session, user } = await requireAuth();
  return next({ ctx: { session, user } });
});
