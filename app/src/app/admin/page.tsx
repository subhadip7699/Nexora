import { Suspense } from "react";
import { PageLoadingFallback } from "@/components/ui/LoadingState";
import { GateConsole } from "@/components/GateConsole";

export default function AdminPage() {
  return (
    <Suspense fallback={<PageLoadingFallback title="Loading console" />}>
      <GateConsole mode="admin" />
    </Suspense>
  );
}
