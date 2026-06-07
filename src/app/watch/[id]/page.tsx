// Server component wrapper. Route segment configs like `dynamic` cannot
// live in a `"use client"` file — splitting page.tsx (server) + watch-client.tsx
// (client) is the standard Next.js 15+ pattern for routes that need both a
// dynamic param and client-side hooks (useSearchParams, useStream, …).

import { Suspense } from "react";
import WatchClient from "./watch-client";

export const dynamic = "force-dynamic";

const SuspenseFallback = (
  <div className="fixed inset-0 bg-black grid place-items-center">
    <div className="h-10 w-10 border-4 border-border border-t-[var(--accent)] rounded-full animate-spin" />
  </div>
);

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  return (
    <Suspense fallback={SuspenseFallback}>
      <WatchClient id={id} />
    </Suspense>
  );
}
