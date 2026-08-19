import type { ReactNode } from "react";

type PageShellProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: "4xl" | "5xl" | "6xl" | "7xl";
};

const maxWidthClass = {
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
} as const;

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  maxWidth = "5xl",
}: PageShellProps) {
  return (
    <main className="flex-1 overflow-x-hidden bg-surface px-4 pb-20 pt-20 sm:px-6 sm:pt-24 lg:px-10">
      <div className={`mx-auto ${maxWidthClass[maxWidth]}`}>
        <div className="mb-8 flex min-w-0 flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <p className="eyebrow">{eyebrow}</p>
            )}
            <h1 className="mt-3 max-w-4xl break-words font-display text-4xl leading-[1.08] text-primary sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            {description && (
              <div className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">{description}</div>
            )}
          </div>
          {actions && <div className="min-w-0 shrink-0">{actions}</div>}
        </div>
        {children}
      </div>
    </main>
  );
}
