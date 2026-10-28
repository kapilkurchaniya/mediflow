import Link from "next/link";
import { PageHeader, EmptyState } from "@/app/components/ui";
import { getAuditFilterOptions, getAuditLogs } from "@/app/actions/audit";
import { requirePagePermission } from "@/server/rbac";
import { describeChanges } from "@/lib/audit-diff";
import { ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log | MediFlow" };

type Search = { user?: string; entity?: string; action?: string; from?: string; to?: string; page?: string };

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Changed",
  delete: "Deleted",
  cancel: "Cancelled",
  login: "Signed in",
  price_change: "Price change",
  stock_adjust: "Stock change",
  permission_change: "Permission change",
  bulk_update: "Bulk change",
  discount_override: "Discount override",
};

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(d);

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePagePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(parseInt(sp.page ?? "1", 10) || 1, 1);

  const [options, result] = await Promise.all([
    getAuditFilterOptions(),
    getAuditLogs({ userId: sp.user, entityType: sp.entity, action: sp.action, from: sp.from, to: sp.to, page }),
  ]);

  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  const qs = (over: Partial<Search>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security & accountability"
        title="Audit log"
        description="A permanent record of important changes: who did what, when, and the old and new values. Entries cannot be edited or deleted."
      />

      <form method="get" className="card p-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
        <label className="text-xs font-medium text-ink-700">
          User
          <select name="user" defaultValue={sp.user ?? ""} className="input mt-1">
            <option value="">Everyone</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-700">
          Record type
          <select name="entity" defaultValue={sp.entity ?? ""} className="input mt-1">
            <option value="">All</option>
            {options.entityTypes.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-700">
          Action
          <select name="action" defaultValue={sp.action ?? ""} className="input mt-1">
            <option value="">All</option>
            {options.actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-700">
          From
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="input mt-1" />
        </label>
        <label className="text-xs font-medium text-ink-700">
          To
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="input mt-1" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Apply</button>
          <Link href="/dashboard/settings/audit" className="btn btn-secondary">Reset</Link>
        </div>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries found" description="Nothing matches these filters yet." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Record</th>
                <th>Changes</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => {
                const changes = describeChanges(r.oldValue, r.newValue);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-[12.5px]">{fmtTime(r.createdAt)}</td>
                    <td>{r.userName ?? "—"}</td>
                    <td><span className="badge">{ACTION_LABELS[r.action] ?? r.action}</span></td>
                    <td className="text-[12.5px]">
                      <span className="font-medium">{r.entityType}</span>
                      {r.entityId && <span className="block font-mono text-[11px] text-ink-500">{r.entityId.slice(0, 8)}</span>}
                    </td>
                    <td className="text-[12.5px]">
                      {changes.length === 0 ? (
                        <span className="text-ink-400">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {changes.slice(0, 6).map((c) => (
                            <li key={c.field}>
                              <span className="text-ink-500">{c.field}:</span> {c.from} <span className="text-ink-400">→</span> <strong>{c.to}</strong>
                            </li>
                          ))}
                          {changes.length > 6 && <li className="text-ink-400">+{changes.length - 6} more</li>}
                        </ul>
                      )}
                    </td>
                    <td className="text-[12.5px]">{r.reason ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-[13px] text-ink-600">
        <span>{result.total} entries · page {result.page} of {totalPages}</span>
        <span className="flex gap-2">
          {result.page > 1 && <Link className="btn btn-secondary btn-sm" href={qs({ page: String(result.page - 1) })}>Previous</Link>}
          {result.page < totalPages && <Link className="btn btn-secondary btn-sm" href={qs({ page: String(result.page + 1) })}>Next</Link>}
        </span>
      </div>
    </div>
  );
}
