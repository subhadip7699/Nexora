"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Try it" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#privacy", label: "Why Midnight" },
  { href: "/admin", label: "Install" },
];

export function Navigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setNavigating(false);
      setOpen(false);
    });
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (href === pathname) return;
      setNavigating(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || (href !== "/" && !href.includes("#") && pathname.startsWith(href));

  return (
    <nav className="sticky inset-x-0 top-0 z-50 border-b border-border-subtle bg-surface/95 backdrop-blur-md" aria-label="Primary navigation">
      {navigating && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-secondary" role="status" aria-live="polite" aria-label="Loading page">
          <div className="nav-progress-bar h-full w-1/3" />
        </div>
      )}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <span className="flex h-7 w-7 items-center justify-center" aria-hidden="true">
            <Image src="/logo.svg" alt="Nexora Logo" width={28} height={28} className="h-full w-full" priority />
          </span>
          <span className="font-display text-lg text-primary">Nexora</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                isActive(link.href) ? "text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {pathname !== "/gate" && (
            <Link
              href="/gate"
              className="hidden rounded-full bg-dark px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:inline-flex"
            >
              Connect wallet
            </Link>
          )}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-navigation" className="border-t border-border-subtle bg-surface px-6 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-full px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isActive(link.href) ? "bg-accent-dim text-accent" : "text-muted hover:bg-secondary hover:text-primary"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/gate"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-dark px-4 py-3 text-center text-sm font-semibold text-white"
            >
              Connect wallet
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
