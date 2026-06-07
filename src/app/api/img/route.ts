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

function emptyImage(): Response {
  // Always 200 — the browser shouldn't log a console warning for an image
  // that the upstream couldn't serve. The component already swaps in a
  // gradient fallback via onError, so a 200 transparent PNG is the friendliest
  // way to short-circuit it.
  return new Response(TRANSPARENT_PNG as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return emptyImage();

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return emptyImage();
  }

  if (!/^https?:$/.test(target.protocol)) {
    return emptyImage();
  }

  // Bound the upstream fetch so a slow IPTV image host (covers-f.ddns.me is
  // famously slow under load) can't burn the whole Vercel function budget.
  // Better to give up at 6 s and show the gradient fallback than to 504 and
  // pollute the browser's console with cascading errors.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent": UPSTREAM_UA,
        Accept: "image/*,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!upstream.ok) {
      // Don't propagate 4xx/5xx as image errors — return transparent so the
      // UI shows the gradient fallback cleanly instead of a broken icon.
      return emptyImage();
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
    clearTimeout(timeoutId);
    return emptyImage();
  }
}
