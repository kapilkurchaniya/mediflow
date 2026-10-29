import { PageHeader } from "@/app/components/ui";
import { getRolesOverview } from "@/app/actions/users";
import { requirePagePermission } from "@/server/rbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles & permissions | MediFlow" };

export default async function RolesPage() {
  await requirePagePermission("user.manage");
  const roles = await getRolesOverview();
  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/settings/users"
        eyebrow="People & access"
        title="Roles & permissions"
        description="What each built-in role is allowed to do. Roles are fixed for now; pick one for each person on the Staff & access page."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((r) => (
          <section key={r.key} className="card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink-900">{r.name}</h2>
              <span className="text-[12px] text-ink-500">{r.count} of {r.total} permissions</span>
            </div>
            <p className="mt-1 text-[13px] text-ink-500">{r.description}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {r.permissions.map((p) => (
                <li key={p.key} className="rounded-full border border-ink-150 bg-ink-50 px-2 py-0.5 text-[11.5px] text-ink-700" title={p.key}>
                  {p.label}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
