import { parseM3U, type ParsedPlaylist } from "./m3u-parser";
import { buildFilterPredicate, filterM3U } from "./m3u-filter";

/**
 * Server-side cached catalog.
 *
 * The whole point of Phase 1 is to NEVER ship the full M3U to the client.
 * Instead this module:
 *
 *   1. Downloads + filters + parses the M3U on the SERVER, once per warm
 *      Vercel function instance.
 *   2. Holds the parsed result in a module-level singleton so subsequent
 *      requests (even from different API routes) reuse it instantly.
 *   3. Exposes light helpers so each `/api/catalog/*` endpoint slices the
 *      data it needs into JSON small enough for any mobile client.
 *
 * Cache lifecycle:
 *   - Vercel functions stay warm 5-15 min between requests → most users hit
 *     the warm cache, no re-parsing.
 *   - On cold start the parse takes 2-5 s for huge playlists; we accept it.
 *   - TTL: 10 min. After that we re-fetch the upstream M3U to pick up new
 *     content (the upstream itself is still edge-cached via /api/m3u).
 */

const UA = "VLC/3.0.20 LibVLC/3.0.20";
const PARSE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  playlist: ParsedPlaylist;
  m3uUrl: string;
  timestamp: number;
};

let cache: CacheEntry | null = null;
let inflight: Promise<ParsedPlaylist> | null = null;

async function fetchAndParse(m3uUrl: string): Promise<ParsedPlaylist> {
  const upstream = await fetch(m3uUrl, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    cache: "no-store",
    redirect: "follow",
  });
  if (!upstream.ok) {
    throw new Error(`Upstream returned ${upstream.status}`);
  }

  const rawText = await upstream.text();
  const { filtered } = filterM3U(rawText, buildFilterPredicate());
  return parseM3U(filtered);
}

/**
 * Get the parsed playlist for the configured M3U URL. Uses in-memory cache
 * with deduplication (multiple concurrent callers share the same fetch).
 */
export async function getCatalog(m3uUrl: string): Promise<ParsedPlaylist> {
  const now = Date.now();
  if (
    cache &&
    cache.m3uUrl === m3uUrl &&
    now - cache.timestamp < PARSE_TTL_MS
  ) {
    return cache.playlist;
  }

  // Coalesce concurrent fetches so a cold start with parallel API calls
  // only triggers one upstream download + parse.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const playlist = await fetchAndParse(m3uUrl);
      cache = { playlist, m3uUrl, timestamp: Date.now() };
      return playlist;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Returns the URL configured via DEFAULT_M3U_URL env, or null. */
export function getDefaultM3uUrl(): string | null {
  const url = process.env.DEFAULT_M3U_URL?.trim();
  if (!url) return null;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}
