"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/actions/users";
import { GoogleAuthButton } from "@/app/components/GoogleAuthButton";

export function AcceptInviteForm({
  token,
  existingUser,
  email,
  googleEnabled,
  oauthError,
}: {
  token: string;
  existingUser: boolean;
  email: string;
  googleEnabled: boolean;
  oauthError?: string | null;
}) {
  const [state, formAction, pending] = useActionState(acceptInviteAction.bind(null, token), null);
  const field = "w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
  const errorMessage = state?.error || oauthError;

  return (
    <div className="space-y-5">
      {errorMessage && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl">{errorMessage}</div>
      )}

      {googleEnabled && (
        <>
          <GoogleAuthButton
            mode="invite"
            label="Accept with Google"
            inviteToken={token}
            loginHint={email}
          />
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-white px-3 text-slate-400 font-medium">or join with password</span>
            </div>
          </div>
        </>
      )}

      <form action={formAction} className="space-y-5">
        {existingUser ? (
          <p className="text-sm text-slate-600">You already have a MediFlow account with this email. Enter its password to join.</p>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Your name</label>
            <input name="name" type="text" required className={field} placeholder="Rahul Sharma" autoComplete="name" />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{existingUser ? "Your password" : "Choose a password (8 or more characters)"}</label>
          <input name="password" type="password" required minLength={existingUser ? undefined : 8} className={field} autoComplete={existingUser ? "current-password" : "new-password"} />
        </div>
        <button type="submit" disabled={pending} className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 px-4 rounded-xl disabled:opacity-70">
          {pending ? "Joining…" : "Join and sign in"}
        </button>
      </form>
    </div>
  );
}
