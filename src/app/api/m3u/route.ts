import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint to fetch (and optionally filter) an M3U playlist.
 *
 * - Bypasses browser CORS / UA filters on the IPTV host.
 * - Streams the upstream into memory then BUFFERS the response so Vercel's
 *   edge CDN can cache it.
 * - Applies server-side filtering driven by env vars so massive bouquets
 *   (the user we built this for has a 136 MB playlist!) get trimmed to
 *   something a mobile client can actually download and parse:
 *     M3U_INCLUDE  — comma-separated keywords; if set, only EXTINF lines
 *                    containing at least one of these (case-insensitive) are
 *                    kept. Empty = keep all.
 *     M3U_EXCLUDE  — comma-separated keywords; matching EXTINF lines are
 *                    dropped. Defaults to a sensible adult-content blacklist.
 *
 * Usage: GET /api/m3u?url=https%3A%2F%2Fhost%2Fplaylist.m3u
 */
export const runtime = "nodejs";

const UA = "VLC/3.0.20 LibVLC/3.0.20";

// Edge cache: 10 min browser, 1h CDN, 24h stale-while-revalidate
const CACHE_HEADER =
  "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

const DEFAULT_EXCLUDE =
  "xxx,porn,adult,18+,erotic,erotique,adulte,for_adults,brazzers";

function parseKeywords(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;|\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

function buildFilterPredicate(): (extinf: string) => boolean {
  const include = parseKeywords(process.env.M3U_INCLUDE);
  const exclude = parseKeywords(process.env.M3U_EXCLUDE ?? DEFAULT_EXCLUDE);

  return (extinf: string) => {
    const lower = extinf.toLowerCase();
    if (exclude.length > 0 && exclude.some((k) => lower.includes(k))) {
      return false;
    }
    if (include.length === 0) return true;
    return include.some((k) => lower.includes(k));
  };
}

/**
 * Walk the raw M3U line by line and keep only entries whose EXTINF passes
 * the predicate. An "entry" is the EXTINF directive + any continuation
 * directive lines (EXTGRP, EXTVLCOPT, …) + the URL line that follows.
 */
function filterM3U(
  text: string,
  shouldKeep: (extinf: string) => boolean
): { filtered: string; kept: number; dropped: number } {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let pendingExtinf: string | null = null;
  let pendingDirectives: string[] = [];
  let pendingPasses = true;
  let kept = 0;
  let dropped = 0;

  function flush(urlLine: string | null) {
    if (pendingExtinf && pendingPasses && urlLine) {
      out.push(pendingExtinf);
      out.push(...pendingDirectives);
      out.push(urlLine);
      kept++;
    } else if (pendingExtinf) {
      dropped++;
    } else if (urlLine) {
      // URL line with no EXTINF — uncommon, keep it as-is
      out.push(urlLine);
    }
    pendingExtinf = null;
    pendingDirectives = [];
    pendingPasses = true;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#EXTM3U")) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith("#EXTINF")) {
      // New entry begins — but we might have a previous EXTINF without URL
      if (pendingExtinf) {
        // Orphan EXTINF, drop it
        dropped++;
        pendingExtinf = null;
        pendingDirectives = [];
      }
      pendingExtinf = line;
      pendingPasses = shouldKeep(line);
      continue;
    }

    if (trimmed.startsWith("#")) {
      // Auxiliary directive (#EXTGRP, #EXTVLCOPT, #EXT-X-…) — attach to pending entry
      if (pendingExtinf) {
        pendingDirectives.push(line);
      } else {
        out.push(line);
      }
      continue;
    }

    // URL line — completes the pending entry
    flush(line);
  }

  // Trailing orphan EXTINF, if any
  if (pendingExtinf) dropped++;

  return { filtered: out.join("\n"), kept, dropped };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "missing url param" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!/^https?:$/.test(target.protocol)) {
    return NextResponse.json(
      { error: "only http(s) protocols allowed" },
      { status: 400 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: { "User-Agent": UA, Accept: "*/*" },
      cache: "no-store",
      redirect: "follow",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "fetch failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `upstream returned ${upstream.status}` },
      { status: 502 }
    );
  }

  const rawText = await upstream.text();

  // Apply filtering — typically takes 100-500ms even on a 100MB+ M3U
  const predicate = buildFilterPredicate();
  const { filtered, kept, dropped } = filterM3U(rawText, predicate);

  return new NextResponse(filtered, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Cache-Control": CACHE_HEADER,
      "Access-Control-Allow-Origin": "*",
      // Debug headers — visible in browser devtools / `curl -I`
      "X-Tristan-Original-Bytes": String(rawText.length),
      "X-Tristan-Filtered-Bytes": String(filtered.length),
      "X-Tristan-Entries-Kept": String(kept),
      "X-Tristan-Entries-Dropped": String(dropped),
    },
  });
}
