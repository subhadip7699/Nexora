"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

type LoadingStateProps = {
  label?: string;
  detail?: string;
  compact?: boolean;
  className?: string;
};

export function LoadingState({
  label = "Loading",
  detail,
  compact = false,
  className = "",
}: LoadingStateProps) {
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 text-sm text-muted ${className}`} role="status" aria-live="polite">
        <LoaderCircle size={16} className="animate-spin text-accent" aria-hidden="true" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className={`paper-card p-6 sm:p-8 ${className}`} role="status" aria-live="polite">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent-soft/40 bg-accent-dim text-accent" aria-hidden="true">
          <LoaderCircle size={22} className="animate-spin" />
        </span>
        <div>
          <p className="eyebrow">Working</p>
          <p className="mt-2 text-lg font-semibold text-primary">{label}</p>
          {detail && <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>}
        </div>
      </div>
      <div className="mt-6 space-y-2" aria-hidden="true">
        <div className="h-2 w-full animate-pulse rounded-full bg-secondary" />
        <div className="h-2 w-[80%] animate-pulse rounded-full bg-secondary" />
        <div className="h-2 w-[65%] animate-pulse rounded-full bg-secondary" />
      </div>
    </div>
  );
}

export function PageLoadingFallback({ title = "Loading page" }: { title?: string }) {
  return (
    <main className="flex-1 bg-surface px-6 pb-20 pt-24 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <LoadingState label={title} detail="Preparing the Midnight interface for this route." />
      </div>
    </main>
  );
}

type BusyButtonContentProps = {
  busy: boolean;
  busyLabel: string;
  idleLabel: ReactNode;
  icon?: ReactNode;
};

export function BusyButtonContent({ busy, busyLabel, idleLabel, icon }: BusyButtonContentProps) {
  if (busy) {
    return (
      <>
        <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
        {busyLabel}
      </>
    );
  }
  return (
    <>
      {icon}
      {idleLabel}
    </>
  );
}
