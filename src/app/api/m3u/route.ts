import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint to fetch an M3U playlist server-side.
 * Avoids browser CORS errors when the playlist host doesn't send permissive headers.
 *
 * Usage: GET /api/m3u?url=https%3A%2F%2Fhost%2Fplaylist.m3u
 */
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

  try {
    const upstream = await fetch(target.toString(), {
      // Many IPTV providers block default Node UA — send something neutral
      headers: { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" },
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `upstream returned ${upstream.status}`,
        },
        { status: 502 }
      );
    }

    const text = await upstream.text();

    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        "Cache-Control": "no-store",
      },
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
}
