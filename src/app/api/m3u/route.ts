import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint to fetch an M3U playlist server-side.
 *
 * - Bypasses browser CORS / UA filters on the IPTV host.
 * - Buffers the upstream response so Vercel's edge CDN can cache it. After
 *   any device loads the M3U once, every subsequent request — from a phone
 *   on slow 4G, a TV on the same network, an iPad anywhere — gets served
 *   from the CDN in tens of milliseconds instead of waiting on the IPTV
 *   provider again.
 *
 * Usage: GET /api/m3u?url=https%3A%2F%2Fhost%2Fplaylist.m3u
 */
export const runtime = "nodejs";
// No `force-dynamic` — we want Vercel to cache this response at the edge.
// The query string (?url=…) is part of the cache key so different M3U URLs
// don't collide.

const UA = "VLC/3.0.20 LibVLC/3.0.20";

// Edge cache TTLs:
//   public, max-age=600           → browser cache 10 min
//   s-maxage=3600                 → Vercel edge cache 1 hour
//   stale-while-revalidate=86400  → serve stale up to 24h while revalidating
const CACHE_HEADER =
  "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

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

  // BUFFER the upstream so the edge CDN can cache the full body. Streaming
  // responses bypass the cache entirely, defeating the whole point of going
  // through this proxy on subsequent visits.
  const text = await upstream.text();

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Cache-Control": CACHE_HEADER,
      "Access-Control-Allow-Origin": "*",
      // Help debugging: tag responses so we can spot cache hits in the headers
      "X-Tristan-Cache-Source": "origin",
    },
  });
}
