import { NextRequest, NextResponse } from "next/server";
import { buildFilterPredicate, filterM3U } from "@/lib/m3u-filter";

/**
 * Legacy raw-M3U proxy.
 *
 * Kept around for backwards compatibility with the old client (and so the
 * /api/cron/warm endpoint can pre-warm the edge cache). New clients should
 * prefer /api/catalog/* which never ships the giant M3U to the browser.
 */
export const runtime = "nodejs";

const UA = "VLC/3.0.20 LibVLC/3.0.20";

// Short TTL while we iterate on filter config — 60s
const CACHE_HEADER =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

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
  const { filtered: filteredAttempt, stats } = filterM3U(
    rawText,
    buildFilterPredicate()
  );

  // Fail-open if filter wiped everything
  const tooAggressive = stats.kept === 0 && stats.dropped > 0;
  const filtered = tooAggressive ? rawText : filteredAttempt;

  return new NextResponse(filtered, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Cache-Control": CACHE_HEADER,
      "Access-Control-Allow-Origin": "*",
      "X-Tristan-Original-Bytes": String(rawText.length),
      "X-Tristan-Filtered-Bytes": String(filtered.length),
      "X-Tristan-Entries-Kept": String(stats.kept),
      "X-Tristan-Entries-Dropped": String(stats.dropped),
      "X-Tristan-Live-Kept": String(stats.byType.live.kept),
      "X-Tristan-Movies-Kept": String(stats.byType.movie.kept),
      "X-Tristan-Series-Kept": String(stats.byType.series.kept),
      "X-Tristan-Filter-FailOpen": tooAggressive ? "true" : "false",
    },
  });
}
