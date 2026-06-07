/**
 * Build the URL to use when handing a stream off to the ffmpeg transcoder
 * (deployed separately, typically on Railway). Returns null if no transcoder
 * is configured — the caller should fall back to the regular HLS/mpegts path.
 */
export function transcodedStreamUrl(
  originalUrl: string,
  config: { baseUrl: string | null; secret: string | null } | null
): string | null {
  if (!config?.baseUrl) return null;
  const base = config.baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({ url: originalUrl });
  if (config.secret) params.set("secret", config.secret);
  return `${base}/transcode?${params.toString()}`;
}

/**
 * Wrap a remote image URL through our same-origin proxy so the browser
 * doesn't get blocked by Referer/UA hotlink protection.
 */
export function proxiedImageUrl(originalUrl: string): string {
  const path = `/api/img?url=${encodeURIComponent(originalUrl)}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/**
 * Wrap a remote stream URL through our same-origin proxy so the browser
 * doesn't have to deal with CORS / UA restrictions from the IPTV provider.
 *
 * IMPORTANT: must be an absolute URL when used from a Web Worker context
 * (mpegts.js + hls.js workers cannot resolve relative URLs because their
 * `self.location` doesn't carry the page origin).
 */
export function proxiedStreamUrl(originalUrl: string): string {
  const path = `/api/hls?url=${encodeURIComponent(originalUrl)}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export type StreamType = "hls" | "mpegts" | "native";

/**
 * Decide which engine should handle the stream. IPTV providers serve:
 * - `.m3u8` → HLS, played by hls.js (or natively on Safari)
 * - `.ts` or extensionless live URLs → raw MPEG-TS over HTTP, needs mpegts.js
 * - `.mp4` / `.mkv` / `.webm` / `.mov` → native <video src>
 */
export function detectStreamType(originalUrl: string, isLive: boolean): StreamType {
  const u = originalUrl.toLowerCase().split("?")[0];

  if (u.endsWith(".m3u8") || u.includes(".m3u8/")) return "hls";

  if (
    u.endsWith(".mp4") ||
    u.endsWith(".mkv") ||
    u.endsWith(".webm") ||
    u.endsWith(".mov") ||
    u.endsWith(".m4v")
  ) {
    return "native";
  }

  if (u.endsWith(".ts") || u.endsWith(".m2ts") || u.endsWith(".mts")) return "mpegts";

  // No / unknown extension: live channels are almost always raw MPEG-TS on
  // most IPTV providers (`/live/user/pass/12345`). VOD without extension is
  // usually MP4 served by the provider — let the browser try.
  return isLive ? "mpegts" : "native";
}
