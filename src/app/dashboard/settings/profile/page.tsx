import { PageHeader } from "@/app/components/ui";
import { requireAuth } from "@/server/auth";
import { ProfileClient } from "./ProfileClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "My profile | MediFlow" };

/** Any signed-in user may open their own profile; no permission is needed. */
export default async function ProfilePage() {
  const { user } = await requireAuth();
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

      <ProfileClient />
    </div>
  );
}
