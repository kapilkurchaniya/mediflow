import Link from "next/link";
import { Activity } from "lucide-react";
import { db } from "@/server/db";
import { describeInvite } from "@/server/domain/users";
import { isGoogleOAuthConfigured } from "@/server/oauth/google";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join your team | MediFlow" };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error_description?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const info = await describeInvite(db, token);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 bg-brand-100 text-brand-600 rounded-2xl mb-4">
            <Activity className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Join your team</h1>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
          {!info.valid ? (
            <div className="space-y-4 text-center">
              <p className="text-slate-700">{info.error}</p>
              <Link href="/login" className="font-medium text-brand-600 hover:text-brand-500">Go to sign in</Link>
            </div>
          ) : (
            <>
              <p className="mb-5 text-slate-600">
                You have been invited to <strong>{info.pharmacyName}</strong> as <strong>{info.roleName}</strong>.
                Your sign-in email is <strong>{info.email}</strong>.
              </p>
              <AcceptInviteForm
                token={token}
                existingUser={info.existingUser}
                email={info.email}
                googleEnabled={isGoogleOAuthConfigured()}
                oauthError={sp.error_description ?? null}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
