"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { protectedAction } from "@/server/action";
import { db } from "@/server/db";
import {
  getStoreMedicineSettings,
  updateStoreMedicineSettings,
  updateStoreMedicineSettingsSchema,
  type EffectiveStoreMedicineSettings,
} from "@/server/domain/catalog/store-settings";

const idSchema = z.string().uuid("Invalid UUID format");

export const getStoreMedicineSettingsAction = protectedAction("medicine.view")
  .inputSchema(
    z.object({
      storeId: idSchema.optional(),
      medicineIds: z.array(idSchema).min(1, "At least one medicine ID required"),
    }),
  )
  .action(async ({ parsedInput: { storeId, medicineIds }, ctx }) => {
    const targetStoreId = storeId ?? ctx.storeId;
    const settingsMap = await getStoreMedicineSettings(db, ctx, targetStoreId, medicineIds);
    // Maps cannot be directly serialized across server action JSON boundaries
    const settingsList: EffectiveStoreMedicineSettings[] = [];
    for (const id of medicineIds) {
      const setting = settingsMap.get(id);
      if (setting) {
        settingsList.push(setting);
      }
    }
    return { settings: settingsList };
  });

export const updateStoreMedicineSettingsAction = protectedAction("medicine.manage")
  .inputSchema(
    z.object({
      storeId: idSchema.optional(),
      medicineId: idSchema,
      settings: updateStoreMedicineSettingsSchema,
    }),
  )
  .action(async ({ parsedInput: { storeId, medicineId, settings }, ctx }) => {
    const targetStoreId = storeId ?? ctx.storeId;
    const updated = await updateStoreMedicineSettings(
      db,
      ctx,
      targetStoreId,
      medicineId,
      settings,
    );

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/sales/pos");
    revalidatePath(`/dashboard/inventory/${medicineId}`);

    return { setting: updated };
  });
