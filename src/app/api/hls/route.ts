import { NextRequest } from "next/server";

/**
 * Universal HLS / media proxy.
 *
 * Why: most IPTV providers either block browser User-Agents, don't send
 * permissive CORS headers, or both. Without this, hls.js can fetch the
 * playlist through /api/m3u but the .ts segments fail in the browser and
 * the player loops on "loading" forever.
 *
 * What it does:
 * - GET /api/hls?url=<absolute_url>
 * - Forwards Range header for seeking, returns 206 when upstream does
 * - Sends a VLC User-Agent (which most IPTV providers accept)
 * - If the response looks like an .m3u8 manifest, rewrites every segment,
 *   key, init-segment and alternate-media URL to also go through this
 *   proxy. The browser then sees a same-origin playlist with same-origin
 *   segments — no CORS issues, no UA filtering.
 * - For any other content (binary .ts / .mp4 / .mkv / etc.) it just
 *   streams the bytes back.
 */

const UPSTREAM_UA = "VLC/3.0.20 LibVLC/3.0.20";

// Use Node runtime so streaming + Range headers work reliably with binary bodies.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
]);

function buildUpstreamHeaders(req: NextRequest): HeadersInit {
  const h: Record<string, string> = {
    "User-Agent": UPSTREAM_UA,
    Accept: "*/*",
  };
  const range = req.headers.get("range");
  if (range) h.Range = range;
  return h;
}

function buildResponseHeaders(upstream: Response): Headers {
  const out = new Headers();
  upstream.headers.forEach((v, k) => {
    if (HOP_BY_HOP.has(k.toLowerCase())) return;
    if (k.toLowerCase() === "content-encoding") return; // fetch decoded already
    out.set(k, v);
  });
  out.set("Access-Control-Allow-Origin", "*");
  out.set("Cache-Control", "no-store");
  return out;
}

function looksLikeM3U8(contentType: string, urlPath: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes("mpegurl") || ct.includes("x-mpegurl") || ct.includes("vnd.apple.mpegurl")) {
    return true;
  }
  const path = urlPath.toLowerCase();
  return path.endsWith(".m3u8") || path.endsWith(".m3u");
}

function rewriteM3U8(text: string, baseUrl: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  const proxify = (rawUrl: string): string => {
    if (!rawUrl) return rawUrl;
    try {
      const abs = new URL(rawUrl, baseUrl).toString();
      return `/api/hls?url=${encodeURIComponent(abs)}`;
    } catch {
      return rawUrl;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    if (trimmed.startsWith("#")) {
      // Rewrite all URI="..." attributes (#EXT-X-KEY, #EXT-X-MEDIA,
      // #EXT-X-MAP, #EXT-X-SESSION-KEY, #EXT-X-I-FRAME-STREAM-INF, ...).
      const rewritten = line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxify(uri)}"`);
      // Variant streams (#EXT-X-I-FRAME-STREAM-INF) use URI= too — already covered above.
      out.push(rewritten);
      continue;
    }

    // Plain URL line (segment or variant playlist)
    out.push(proxify(trimmed));
  }

  return out.join("\n");
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new Response("missing url param", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new Response("invalid url", { status: 400 });
  }

  if (!/^https?:$/.test(target.protocol)) {
    return new Response("only http(s) allowed", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: buildUpstreamHeaders(req),
      redirect: "follow",
      cache: "no-store",
    });
  } catch (err) {
    return new Response(
      `upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 502 }
    );
  }

  // Forward errors with their status so hls.js can decide whether to retry.
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`upstream returned ${upstream.status}`, {
      status: upstream.status,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "";

  if (looksLikeM3U8(contentType, target.pathname)) {
    const text = await upstream.text();
    const rewritten = rewriteM3U8(text, target.toString());
    return new Response(rewritten, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Stream binary segments / VOD files back as-is.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildResponseHeaders(upstream),
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
