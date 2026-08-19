import Link from "next/link";
import { ArrowRight, BadgeCheck, KeyRound, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { StageBadge } from "@/components/ui/StatusBanner";

const steps = [
  {
    icon: BadgeCheck,
    title: "Publish a gate",
    body: "An administrator sets up the member experience, connects Lace or 1AM, and publishes the gate on Preprod.",
  },
  {
    icon: KeyRound,
    title: "Issue access",
    body: "Nexora generates a private credential locally and enrolls only its hash for the member.",
  },
  {
    icon: ShieldCheck,
    title: "Verify privately",
    body: "Members open the gate link, connect a wallet, and prove access without revealing the credential.",
  },
];

export default function Home() {
  return (
    <PageShell
      eyebrow="Midnight Preprod"
      title="Private access, proven without disclosure."
      description="Nexora helps teams publish a private gate, issue member credentials, and verify access on Midnight Preprod."
      actions={
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-dark px-5 text-sm font-semibold text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Operator console
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      }
      maxWidth="7xl"
    >
      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="paper-card p-6 sm:p-8">
          <div className="flex flex-wrap gap-2">
            <StageBadge label="Preprod" tone="success" />
            <StageBadge label="Lace / 1AM" tone="info" />
            <StageBadge label="Compact ZK" tone="neutral" />
          </div>
          <h2 className="mt-8 max-w-2xl font-display text-3xl leading-tight text-primary sm:text-4xl">
            A private gateway with a clear admin and member path.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            Admins configure and publish a gate, then members use a private credential to prove access from their own wallet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/gate" className="inline-flex min-h-11 items-center justify-center rounded-full border border-primary px-5 text-sm font-semibold text-primary transition-colors hover:bg-secondary">
              Open gate
            </Link>
            <Link href="/vault" className="inline-flex min-h-11 items-center justify-center rounded-full border border-border-subtle px-5 text-sm font-semibold text-muted transition-colors hover:bg-secondary hover:text-primary">
              Member vault
            </Link>
          </div>
        </div>
        <div id="how-it-works" className="grid gap-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <article key={step.title} className="paper-card p-5">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent-soft/50 bg-accent-dim text-accent">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-primary">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section id="privacy" className="mt-6 paper-card p-6 sm:p-8">
        <p className="eyebrow">Privacy model</p>
        <p className="mt-3 max-w-4xl text-base leading-7 text-muted">
          Raw credentials stay in the browser. Nexora submits only the credential hash for enrollment, then uses a private proof when members verify access.
        </p>
      </section>
    </PageShell>
  );
}
