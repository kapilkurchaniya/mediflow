import { and, eq } from "drizzle-orm";
import { PageHeader } from "@/app/components/ui";
import { requireAuth } from "@/server/auth";
import { db, schema } from "@/server/db";
import { isGoogleOAuthConfigured } from "@/server/oauth/google";
import { ProfileClient } from "./ProfileClient";
import { GoogleLinkCard } from "./GoogleLinkCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "My profile | MediFlow" };

/** Any signed-in user may open their own profile; no permission is needed. */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; error_description?: string }>;
}) {
  const { user } = await requireAuth();
  const [googleAccount] = await db
    .select({ email: schema.userOauthAccounts.email })
    .from(schema.userOauthAccounts)
    .where(and(eq(schema.userOauthAccounts.userId, user.id), eq(schema.userOauthAccounts.provider, "google")));

  const sp = await searchParams;
  const statusBanner =
    sp.google === "linked"
      ? "Google account connected successfully."
      : sp.error_description || null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Your account" title="My profile" description="Your sign-in details and password." />

      <div className="card p-5 grid gap-4 sm:grid-cols-3 max-w-3xl">
        <div>
          <p className="eyebrow mb-1">Name</p>
          <p className="text-[14px] text-ink-900">{user.name}</p>
        </div>
        <div>
          <p className="eyebrow mb-1">Email</p>
          <p className="text-[14px] text-ink-900 break-all">{user.email}</p>
        </div>
        <div>
          <p className="eyebrow mb-1">Phone</p>
          <p className="text-[14px] text-ink-900">{user.phone || "—"}</p>
        </div>
      </div>

      <GoogleLinkCard
        googleEnabled={isGoogleOAuthConfigured()}
        linkedEmail={googleAccount?.email ?? null}
        hasPassword={Boolean(user.passwordHash)}
        statusBanner={statusBanner}
      />

      <ProfileClient hasPassword={Boolean(user.passwordHash)} />
    </div>
  );
}
