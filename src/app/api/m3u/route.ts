import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint to fetch an M3U playlist server-side.
 *
 * - Bypasses browser CORS / UA filters on the IPTV host.
 * - STREAMS the response back so a slow upstream doesn't make Safari iOS
 *   give up with "Load failed" while waiting for the full body to buffer
 *   on the server side.
 *
 * Usage: GET /api/m3u?url=https%3A%2F%2Fhost%2Fplaylist.m3u
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      // Many IPTV providers block default Node UA — send something neutral
      headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", Accept: "*/*" },
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

  // Forward useful headers (notably Content-Length for progress) and stream
  // the body straight through. The client sees bytes immediately, the server
  // never has to buffer the whole multi-MB playlist in memory.
  const headers = new Headers({
    "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  const upstreamLen = upstream.headers.get("content-length");
  if (upstreamLen) headers.set("Content-Length", upstreamLen);

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
