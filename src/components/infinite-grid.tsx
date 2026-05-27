"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders the first N items immediately and progressively loads more as the
 * sentinel at the bottom enters the viewport. Avoids rendering tens of
 * thousands of cards in one pass (which makes the page sluggish on big IPTV
 * playlists).
 */
export function InfiniteGrid<T>({
  items,
  pageSize = 60,
  render,
  className = "",
}: {
  items: T[];
  pageSize?: number;
  render: (item: T, index: number) => React.ReactNode;
  className?: string;
}) {
  const [visible, setVisible] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when the items array identity changes — using the
  // render-time "reset state when input changes" pattern instead of an effect.
  const [lastItems, setLastItems] = useState(items);
  if (lastItems !== items) {
    setLastItems(items);
    setVisible(pageSize);
  }

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (visible >= items.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible((v) => Math.min(items.length, v + pageSize));
          }
        }
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, items.length, pageSize]);

  const slice = items.slice(0, visible);

  return (
    <>
      <div className={className}>
        {slice.map((item, i) => render(item, i))}
      </div>
      {visible < items.length ? (
        <div
          ref={sentinelRef}
          className="h-20 grid place-items-center text-xs text-muted"
        >
          Chargement…
        </div>
      ) : null}
    </>
  );
}
