"use client";

import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="config-error">
      <p className="eyebrow">The desk stopped safely</p>
      <h1>Nothing was submitted.</h1>
      <p>{error.message || "An unexpected application error occurred."}</p>
      <Button onClick={reset}>Try this view again</Button>
    </main>
  );
}
