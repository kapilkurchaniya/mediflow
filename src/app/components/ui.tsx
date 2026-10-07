import Link from "next/link";
import { ArrowLeft, Search, type LucideIcon } from "lucide-react";
import clsx from "clsx";

/* -------------------------------------------------------------------------- */
/* Brand mark                                                                 */
/* -------------------------------------------------------------------------- */

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("h-7 w-7", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-brand-600" />
      <path
        d="M9 21.5V10.5l7 7 7-7v11"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span
        className={clsx(
          "text-[15px] font-semibold tracking-[-0.02em]",
          inverted ? "text-white" : "text-ink-900",
        )}
      >
        MediFlow
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Page header                                                                */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Go back"
            className="btn btn-secondary btn-icon mt-0.5 shrink-0"
          >
            <ArrowLeft />
          </Link>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-ink-900 leading-tight">
            {title}
          </h1>
          {description && <p className="mt-1 text-[13.5px] text-ink-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI / stat card                                                            */
/* -------------------------------------------------------------------------- */

type Tone = "neutral" | "brand" | "warning" | "danger" | "info";

const toneIcon: Record<Tone, string> = {
  neutral: "text-ink-500 bg-ink-50 ring-ink-150",
  brand: "text-brand-700 bg-brand-50 ring-brand-100",
  warning: "text-amber-700 bg-amber-50 ring-amber-100",
  danger: "text-red-600 bg-red-50 ring-red-100",
  info: "text-sky-700 bg-sky-50 ring-sky-100",
};

export function StatCard({
  label,
  value,
  footnote,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: React.ReactNode;
  footnote?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-500">{label}</span>
        {Icon && (
          <span className={clsx("grid h-7 w-7 place-items-center rounded-md ring-1 ring-inset", toneIcon[tone])}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-3 text-[26px] font-semibold tracking-[-0.03em] text-ink-900 num leading-none">
        {value}
      </div>
      {footnote && <div className="mt-2.5 text-[12.5px] text-ink-500">{footnote}</div>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="card card-interactive group block p-5"
      >
        {body}
      </Link>
    );
  }
  return <div className="card p-5">{body}</div>;
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={clsx("flex flex-col items-center text-center px-6", compact ? "py-10" : "py-16")}>
      <div className="relative mb-4">
        <div className="grid h-11 w-11 place-items-center rounded-lg border border-ink-150 bg-white shadow-xs">
          <Icon className="h-5 w-5 text-ink-400" />
        </div>
      </div>
      <h3 className="text-[14px] font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toolbar search (GET form, works without JS)                                */
/* -------------------------------------------------------------------------- */

export function SearchForm({
  defaultValue,
  placeholder,
  children,
}: {
  defaultValue?: string;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-ink-150 px-4 py-3 sm:flex-row sm:items-center">
      <form method="GET" className="relative flex-1 max-w-md" role="search">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="input pl-8"
          aria-label={placeholder}
        />
      </form>
      {children && <div className="flex items-center gap-2 sm:ml-auto">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form section (two-column settings-style layout)                            */
/* -------------------------------------------------------------------------- */

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-x-10 gap-y-4 py-7 first:pt-0 last:pb-0 border-b border-ink-150 last:border-b-0 lg:grid-cols-[240px_1fr]">
      <div>
        <h2 className="text-[14px] font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function Field({
  label,
  required,
  hint,
  className,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */

const avatarPalette = [
  "bg-brand-50 text-brand-700",
  "bg-sky-50 text-sky-700",
  "bg-amber-50 text-amber-700",
  "bg-violet-50 text-violet-700",
  "bg-rose-50 text-rose-700",
  "bg-ink-100 text-ink-700",
];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % avatarPalette.length;
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-md font-semibold",
        size === "sm" ? "h-7 w-7 text-[11px]" : "h-8 w-8 text-[12px]",
        avatarPalette[idx],
      )}
    >
      {letters || "—"}
    </span>
  );
}
