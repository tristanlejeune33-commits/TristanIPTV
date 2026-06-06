"use client";

import { useEffect } from "react";

/**
 * Mounts a global keyboard listener that turns standard arrow-key behavior
 * into TV-remote-friendly spatial navigation:
 *
 * - Detects Android TV / Fire TV / WebOS / Tizen / Chromecast and toggles a
 *   `tv-mode` class on `<html>` (CSS bumps font size, hides cursor, beefs up
 *   focus rings).
 * - ArrowLeft / ArrowRight in a horizontal rail auto-scrolls the focused
 *   card into view.
 * - ArrowDown / ArrowUp jumps focus to the first focusable element in the
 *   next / previous rail or page section, mirroring how Netflix's TV app
 *   navigates vertically.
 * - Pressing Escape (= TV remote "Back") will let the page-level overlays
 *   close — they already listen for Escape.
 *
 * Mounted once at the root layout level. Returns nothing.
 */
export function TvNav() {
  useEffect(() => {
    // 1. TV-mode detection
    const ua = navigator.userAgent.toLowerCase();
    const isTv =
      /tv|aft[a-z]+|bravia|smart-tv|smarttv|googletv|appletv|hbbtv|webos|netcast|tizen|crkey|chromecast/.test(
        ua
      ) ||
      // Generic Android TV signal (no "mobile" in UA)
      (/android/.test(ua) && !/mobile/.test(ua));
    if (isTv) {
      document.documentElement.classList.add("tv-mode");
    }

    // 2. Scroll focused card into view inside horizontal rails
    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const rail = target.closest<HTMLElement>("[data-rail-scroller]");
      if (rail) {
        target.scrollIntoView({
          inline: "center",
          block: "nearest",
          behavior: "smooth",
        });
      } else {
        // Make sure the focused element is at least visible vertically
        target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    // 3. Vertical D-pad: ArrowUp / ArrowDown jumps between rails
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      const active = document.activeElement as HTMLElement | null;
      // If the user is typing in an input, let the browser handle it
      if (
        active &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)
      ) {
        return;
      }

      // Find all rail scrollers as the navigable "rows". We also include the
      // navigation nav and any standalone focusable section.
      const rails = Array.from(
        document.querySelectorAll<HTMLElement>("[data-rail-scroller]")
      );
      if (rails.length === 0) return;

      // Find the index of the currently focused rail
      const currentRail = active?.closest<HTMLElement>("[data-rail-scroller]");
      const currentIdx = currentRail ? rails.indexOf(currentRail) : -1;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const nextIdx = currentIdx === -1 ? 0 : currentIdx + dir;
      if (nextIdx < 0 || nextIdx >= rails.length) return;
      const nextRail = rails[nextIdx];
      const firstFocusable = nextRail.querySelector<HTMLElement>(
        "a, button, [tabindex]:not([tabindex='-1'])"
      );
      if (firstFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
