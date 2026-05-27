"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders a placeholder until it nears the viewport, then mounts its children.
 * Used for stacking many rails on the home page without paying the cost of
 * rendering all of them upfront.
 */
export function LazySection({
  children,
  estimatedHeight = 320,
  rootMargin = "400px 0px",
}: {
  children: React.ReactNode;
  estimatedHeight?: number;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            return;
          }
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;

  return (
    <div
      ref={ref}
      style={{ minHeight: estimatedHeight }}
      aria-hidden
      className="w-full"
    />
  );
}
