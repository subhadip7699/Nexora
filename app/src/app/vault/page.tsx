import { Suspense } from "react";
import { PageLoadingFallback } from "@/components/ui/LoadingState";
import { GateConsole } from "@/components/GateConsole";

export default function VaultPage() {
  return (
    <Suspense fallback={<PageLoadingFallback title="Loading vault" />}>
      <GateConsole mode="vault" />
    </Suspense>
  );
}
