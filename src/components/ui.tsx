import Link from "next/link";
import type { ReactNode } from "react";

import type { ProcessingStatus } from "@/lib/supabase/database.types";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>
      {children}
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
    >
      {children}
    </Link>
  );
}

const STATUS_STYLES: Record<ProcessingStatus, string> = {
  UPLOADING: "bg-blue-50 text-blue-700 ring-blue-200",
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  PROCESSING: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FAILED: "bg-red-50 text-red-700 ring-red-200",
};

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  UPLOADING: "Cargando",
  PENDING: "Pendiente de procesar",
  PROCESSING: "Procesando",
  COMPLETED: "Procesado",
  FAILED: "Con error",
};

export function StatusBadge({ status }: { status: ProcessingStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
