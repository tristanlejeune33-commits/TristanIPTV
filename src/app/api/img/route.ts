import { NextRequest } from "next/server";

/**
 * Image proxy.
 *
 * IPTV providers very often serve their channel/movie logos with hotlink
 * protection (Referer check, User-Agent filter, no CORS). The browser then
 * receives 403/404 and we have to fall back to placeholder gradients — even
 * though the image exists. This proxy fetches the image server-side with a
 * VLC User-Agent and a stripped Referer, then streams the bytes back with
 * permissive CORS headers and a long browser cache.
 *
 * Usage: GET /api/img?url=<absolute-image-url>
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20";
// 24h browser cache — IPTV logos almost never change at a given URL
const CACHE_HEADER = "public, max-age=86400, stale-while-revalidate=604800";
// 1x1 transparent PNG used as the last-resort response
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

function emptyImage(status: number): Response {
  return new Response(TRANSPARENT_PNG as unknown as BodyInit, {
    status,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return emptyImage(400);

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return emptyImage(400);
  }

  if (!/^https?:$/.test(target.protocol)) {
    return emptyImage(400);
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent": UPSTREAM_UA,
        Accept: "image/*,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!upstream.ok) {
      // Don't propagate 4xx/5xx as image errors — return transparent so the
      // UI shows the gradient fallback cleanly instead of a broken icon.
      return emptyImage(upstream.status);
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_HEADER,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return emptyImage(502);
  }
}
