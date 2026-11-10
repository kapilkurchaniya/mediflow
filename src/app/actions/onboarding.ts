"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import {
  type BusinessDetailsInput,
  type StoreProfileInput,
  type StaffInviteInput,
  type OnboardingStatus,
} from "@/server/domain/onboarding/types";
import {
  getOnboardingStatus,
  saveBusinessDetails,
  saveStoreProfile,
  bootstrapStarterCatalogue,
  completeOnboarding,
} from "@/server/domain/onboarding/service";
import { inviteUser } from "@/server/domain/users";
import { requirePermission } from "@/server/rbac";

export async function getOnboardingStatusAction(): Promise<OnboardingStatus> {
  const ctx = await requirePermission("settings.manage");
  return getOnboardingStatus(db, ctx.tenantId, ctx.storeId);
}

export async function saveBusinessDetailsAction(
  input: BusinessDetailsInput,
): Promise<{ success: boolean; stateCode: string; stateName: string; error?: string }> {
  try {
    const ctx = await requirePermission("settings.manage");
    const result = await saveBusinessDetails(db, ctx.tenantId, ctx.storeId, input);
    revalidatePath("/onboarding");
    return result;
  } catch (err: unknown) {
    return {
      success: false,
      stateCode: "",
      stateName: "",
      error: err instanceof Error ? err.message : "Failed to save business details",
    };
  }
}

export async function saveStoreProfileAction(
  input: StoreProfileInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requirePermission("store.manage");
    const storeId = input.storeId || ctx.storeId;
    if (!storeId) throw new Error("Store ID is required");

    const result = await saveStoreProfile(db, ctx.tenantId, storeId, input);
    revalidatePath("/onboarding");
    return result;
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save store profile",
    };
  }
}

export async function bootstrapInventoryAction(): Promise<{
  success: boolean;
  insertedCount: number;
  error?: string;
}> {
  try {
    const ctx = await requirePermission("medicine.manage");
    if (!ctx.storeId) throw new Error("Store ID required");

    const result = await db.transaction((tx) =>
      bootstrapStarterCatalogue(tx, ctx.tenantId, ctx.storeId),
    );
    revalidatePath("/onboarding");
    return { success: true, insertedCount: result.insertedCount };
  } catch (err: unknown) {
    return {
      success: false,
      insertedCount: 0,
      error: err instanceof Error ? err.message : "Failed to bootstrap starter inventory",
    };
  }
}

export async function inviteOnboardingStaffAction(
  input: StaffInviteInput,
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const ctx = await requirePermission("user.manage");
    const roleKey = input.role === "manager" ? "manager" : "cashier";

    const [role] = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(and(eq(schema.roles.tenantId, ctx.tenantId), eq(schema.roles.key, roleKey)))
      .limit(1);

    if (!role) throw new Error(`Role ${roleKey} not found`);

    const result = await db.transaction(async (tx) => {
      const invite = await inviteUser(tx, ctx, {
        email: input.email.trim().toLowerCase(),
        roleId: role.id,
        allStores: true,
        storeIds: [],
      });
      return invite;
    });

    revalidatePath("/onboarding");
    return { success: true, token: result.token };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to invite staff member",
    };
  }
}

export async function completeOnboardingAction(): Promise<{
  success: boolean;
  redirectUrl: string;
  error?: string;
}> {
  try {
    const ctx = await requirePermission("settings.manage");
    await completeOnboarding(db, ctx.tenantId);
    revalidatePath("/dashboard");
    return { success: true, redirectUrl: "/dashboard" };
  } catch (err: unknown) {
    return {
      success: false,
      redirectUrl: "",
      error: err instanceof Error ? err.message : "Failed to complete onboarding",
    };
  }
}
