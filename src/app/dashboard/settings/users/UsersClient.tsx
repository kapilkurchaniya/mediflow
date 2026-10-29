"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionError } from "@/lib/action-result";
import { inviteUserAction, revokeInviteAction, setMemberStatusAction, updateMemberAction } from "@/app/actions/users";

type Role = { id: string; key: string; name: string; description: string | null };
type Store = { id: string; name: string };
type Member = { userId: string; name: string; email: string; roleId: string; roleName: string; status: string; allStores: boolean; storeIds: string[]; branches: string; lastLoginAt: string | null };
type Invite = { id: string; email: string; roleName: string; branches: string; expiresAt: string };
type Team = { members: Member[]; invites: Invite[]; roles: Role[]; stores: Store[] };

function AccessFields({
  roles, stores, roleId, setRoleId, allStores, setAllStores, storeIds, setStoreIds,
}: {
  roles: Role[]; stores: Store[]; roleId: string; setRoleId: (v: string) => void;
  allStores: boolean; setAllStores: (v: boolean) => void; storeIds: string[]; setStoreIds: (v: string[]) => void;
}) {
  return (
    <>
      <label className="block text-xs font-medium text-ink-700">
        Role
        <select className="input mt-1" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <span className="mt-1 block text-[11.5px] text-ink-500">{roles.find((r) => r.id === roleId)?.description}</span>
      </label>
      <fieldset className="text-xs font-medium text-ink-700">
        <legend>Branch access</legend>
        <label className="mt-1 flex items-center gap-2 text-[13px] font-normal">
          <input type="checkbox" checked={allStores} onChange={(e) => setAllStores(e.target.checked)} /> All branches
        </label>
        {!allStores && (
          <div className="mt-1 space-y-1 pl-1">
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-[13px] font-normal">
                <input
                  type="checkbox"
                  checked={storeIds.includes(s.id)}
                  onChange={(e) => setStoreIds(e.target.checked ? [...storeIds, s.id] : storeIds.filter((x) => x !== s.id))}
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </>
  );
}

export function UsersClient({ team, currentUserId }: { team: Team; currentUserId: string }) {
  const router = useRouter();
  const defaultRole = team.roles.find((r) => r.key === "cashier")?.id ?? team.roles[0]?.id ?? "";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // invite form
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(defaultRole);
  const [allStores, setAllStores] = useState(true);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [link, setLink] = useState<{ url: string; email: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // edit form
  const [editing, setEditing] = useState<Member | null>(null);
  const [eRole, setERole] = useState("");
  const [eAll, setEAll] = useState(true);
  const [eStores, setEStores] = useState<string[]>([]);

  const run = (fn: () => Promise<{ serverError?: string; validationErrors?: unknown } | undefined>, after?: () => void) => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const err = actionError(await fn());
      if (err) return setError(err);
      after?.();
      router.refresh();
    });
  };

  const invite = () =>
    startTransition(async () => {
      setError(null);
      setLink(null);
      const res = await inviteUserAction({ email, roleId, allStores, storeIds });
      const err = actionError(res);
      if (err) return setError(err);
      setLink({ url: `${window.location.origin}/invite/${res!.data!.token}`, email, expires: new Date(res!.data!.expiresAt).toLocaleDateString("en-IN") });
      setEmail("");
      setCopied(false);
      router.refresh();
    });

  const startEdit = (m: Member) => {
    setEditing(m);
    setERole(m.roleId);
    setEAll(m.allStores);
    setEStores(m.storeIds);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</div>}
      {note && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">{note}</div>}

      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink-900">Invite someone</h2>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowInvite((v) => !v); setLink(null); }}>
            {showInvite ? "Close" : "Invite person"}
          </button>
        </div>
        {showInvite && (
          <div className="grid gap-4 md:grid-cols-2 max-w-3xl">
            <label className="block text-xs font-medium text-ink-700 md:col-span-2">
              Email address
              <input className="input mt-1" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <AccessFields roles={team.roles} stores={team.stores} roleId={roleId} setRoleId={setRoleId} allStores={allStores} setAllStores={setAllStores} storeIds={storeIds} setStoreIds={setStoreIds} />
            <div className="md:col-span-2">
              <button className="btn btn-primary" disabled={pending || !email} onClick={invite}>Create invitation link</button>
            </div>
          </div>
        )}
        {link && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-[13px] space-y-2">
            <p className="text-ink-800">
              Invitation for <strong>{link.email}</strong> (valid until {link.expires}). <strong>Copy this link now and send it to them</strong>: for safety it is shown only once.
            </p>
            <div className="flex gap-2">
              <input readOnly className="input font-mono text-[12px]" value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" />
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  await navigator.clipboard?.writeText(link.url);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>

      {team.invites.length > 0 && (
        <div className="card p-4">
          <h2 className="text-[15px] font-semibold text-ink-900 mb-3">Waiting to join</h2>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Email</th><th>Role</th><th>Branches</th><th>Link expires</th><th /></tr></thead>
              <tbody>
                {team.invites.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td><td>{i.roleName}</td><td>{i.branches}</td>
                    <td>{new Date(i.expiresAt).toLocaleDateString("en-IN")}</td>
                    <td className="text-right">
                      <button className="btn btn-ghost btn-sm text-red-600" disabled={pending} onClick={() => run(() => revokeInviteAction({ inviteId: i.id }))}>Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-[15px] font-semibold text-ink-900 mb-3">Team ({team.members.length})</h2>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branches</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {team.members.map((m) => (
                <tr key={m.userId}>
                  <td className="font-medium">{m.name}{m.userId === currentUserId && <span className="ml-1 text-[11px] text-ink-400">(you)</span>}</td>
                  <td>{m.email}</td>
                  <td>{m.roleName}</td>
                  <td className="text-[12.5px]">{m.branches}</td>
                  <td><span className={`badge ${m.status === "active" ? "badge-success" : "badge-warning"}`}>{m.status === "active" ? "Active" : "Suspended"}</span></td>
                  <td className="text-[12.5px]">{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString("en-IN") : "Never"}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(m)}>Edit</button>
                    {m.status === "active" ? (
                      <button className="btn btn-ghost btn-sm text-red-600" disabled={pending || m.userId === currentUserId}
                        onClick={() => { if (confirm(`Suspend ${m.name}? They will be signed out and cannot sign in until re-activated.`)) run(() => setMemberStatusAction({ userId: m.userId, status: "suspended" }), () => setNote(`${m.name} was suspended.`)); }}>Suspend</button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setMemberStatusAction({ userId: m.userId, status: "active" }), () => setNote(`${m.name} can sign in again.`))}>Re-activate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="card p-4 space-y-4 max-w-xl border-brand-200">
          <h2 className="text-[15px] font-semibold text-ink-900">Edit {editing.name}</h2>
          <AccessFields roles={team.roles} stores={team.stores} roleId={eRole} setRoleId={setERole} allStores={eAll} setAllStores={setEAll} storeIds={eStores} setStoreIds={setEStores} />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={pending}
              onClick={() => run(() => updateMemberAction({ userId: editing.userId, roleId: eRole, allStores: eAll, storeIds: eStores }), () => { setNote(`${editing.name}'s access was updated.`); setEditing(null); })}>Save</button>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
          <p className="text-[12px] text-ink-500">A change applies the next time they open a page. There must always be at least one active owner.</p>
        </div>
      )}
    </div>
  );
}
