"use client";

export function SkeletonRail() {
  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 mb-3">
        <div className="h-6 w-48 rounded bg-card animate-pulse" />
      </div>
      <div className="flex gap-3 md:gap-4 px-4 md:px-8 pb-6 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="shrink-0">
            <div className="w-56 h-32 rounded-lg bg-card animate-pulse" />
            <div className="mt-2 h-3 w-32 rounded bg-card animate-pulse" />
            <div className="mt-1.5 h-2.5 w-20 rounded bg-card animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonHero() {
  return (
    <div className="relative h-[68vh] min-h-[460px] w-full bg-gradient-to-br from-[#1a0e0e] via-[#0a0a0a] to-[#0a0a0a]">
      <div className="absolute bottom-24 left-4 md:left-12 max-w-2xl space-y-4">
        <div className="h-3 w-32 rounded bg-card animate-pulse" />
        <div className="h-12 w-96 rounded bg-card animate-pulse" />
        <div className="h-4 w-[28rem] rounded bg-card animate-pulse" />
        <div className="flex gap-3 pt-4">
          <div className="h-12 w-32 rounded-md bg-card animate-pulse" />
          <div className="h-12 w-40 rounded-md bg-card animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className="aspect-video rounded-lg bg-card animate-pulse" />
          <div className="mt-2 h-3 w-3/4 rounded bg-card animate-pulse" />
          <div className="mt-1.5 h-2.5 w-1/2 rounded bg-card animate-pulse" />
        </div>
      ))}
    </div>
  );
}
