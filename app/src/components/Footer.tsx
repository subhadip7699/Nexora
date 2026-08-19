import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-surface px-6 py-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 text-[11px] leading-5 text-faint sm:flex-row sm:items-center sm:justify-between">
        <p>Nexora, a reusable private credential gateway on Midnight.</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end">
          <Link href="/gate" className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Try the gate
          </Link>
          <Link href="/admin" className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            Operator console
          </Link>
          <a
            href="https://docs.midnight.network"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Midnight docs
          </a>
          <span className="font-mono">preprod, Apache 2.0</span>
        </div>
      </div>
    </footer>
  );
}
