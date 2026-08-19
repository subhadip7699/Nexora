import { Suspense } from "react";
import { PageLoadingFallback } from "@/components/ui/LoadingState";
import { GateConsole } from "@/components/GateConsole";

export default function GatePage() {
  return (
    <Suspense fallback={<PageLoadingFallback title="Loading gate" />}>
      <GateConsole mode="gate" />
    </Suspense>
  );
}
