import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function Forbidden() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h1 className="text-lg font-semibold text-ink-900">You don&apos;t have access to this page</h1>
      <p className="text-sm text-ink-500">
        Your role doesn&apos;t include this feature. Ask the pharmacy owner to change your role if you need it.
      </p>
      <Link href="/dashboard" className="btn btn-primary mt-2">
        Back to dashboard
      </Link>
    </div>
  );
}
