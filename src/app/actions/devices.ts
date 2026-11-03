"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { protectedAction } from "@/server/action";
import { requirePermission } from "@/server/rbac";
import {
  registerDevice,
  rotateDeviceToken,
  revokeDevice,
  listDevices,
  getNextAvailableDeviceCode,
} from "@/server/domain/devices";

const refresh = () => {
  revalidatePath("/dashboard/settings/devices");
};

export async function listDevicesAction(storeId?: string) {
  const ctx = await requirePermission("settings.manage");
  return listDevices(db, ctx.tenantId, storeId);
}

export async function getNextDeviceCodeAction(storeId: string) {
  const ctx = await requirePermission("settings.manage");
  return getNextAvailableDeviceCode(db, ctx.tenantId, storeId);
}

export const registerDeviceAction = protectedAction("settings.manage")
  .inputSchema(
    z.object({
      storeId: z.string().uuid("Invalid store ID"),
      code: z
        .string()
        .length(2, "Code must be exactly 2 characters")
        .regex(/^[0-9A-Z]{2}$/i, "Code must be alphanumeric"),
      name: z.string().min(1, "Name is required").max(100),
      platform: z.enum(["browser", "desktop", "mobile"]).optional(),
      appVersion: z.string().max(50).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await db.transaction((tx) =>
      registerDevice(tx, ctx, parsedInput),
    );
    refresh();
    return {
      success: true,
      device: result.device,
      rawToken: result.rawToken,
    };
  });

export const rotateDeviceTokenAction = protectedAction("settings.manage")
  .inputSchema(
    z.object({
      deviceId: z.string().uuid("Invalid device ID"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await db.transaction((tx) =>
      rotateDeviceToken(tx, ctx, parsedInput),
    );
    refresh();
    return {
      success: true,
      device: result.device,
      rawToken: result.rawToken,
    };
  });

export const revokeDeviceAction = protectedAction("settings.manage")
  .inputSchema(
    z.object({
      deviceId: z.string().uuid("Invalid device ID"),
      reason: z.string().max(255).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const device = await db.transaction((tx) =>
      revokeDevice(tx, ctx, parsedInput),
    );
    refresh();
    return { success: true, device };
  });
