import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy endpoint to fetch (and optionally filter) an M3U playlist.
 *
 * Filters (all comma-separated, case-insensitive, applied on the #EXTINF line):
 *
 *   M3U_INCLUDE          — Global allow-list. If set, only entries matching
 *                          at least one keyword survive (any type).
 *   M3U_EXCLUDE          — Global deny-list. Defaults to adult-content
 *                          blacklist. Always applied first.
 *
 *   M3U_LIVE_INCLUDE     — Extra allow-list, applied only to live TV entries.
 *   M3U_MOVIE_INCLUDE    — Extra allow-list, applied only to movies.
 *   M3U_SERIES_INCLUDE   — Extra allow-list, applied only to series episodes.
 *
 * Example for "all live + all movies + only French series":
 *   M3U_EXCLUDE=XXX,porn,adult,AR|,EN|,DE|,IT|,RU|,TR|,US|, …
 *   M3U_SERIES_INCLUDE=VF,VOSTFR,VFF,VFQ,MULTI
 */
export const runtime = "nodejs";

const UA = "VLC/3.0.20 LibVLC/3.0.20";

const CACHE_HEADER =
  "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400";

const DEFAULT_EXCLUDE =
  "xxx,porn,adult,18+,erotic,erotique,adulte,for_adults,brazzers";

function parseKeywords(value: string | undefined): string[] {
  if (!value) return [];
  // Split on comma, semicolon, or newline ONLY. The pipe character `|` is
  // legitimately part of many IPTV group prefixes ("FR|", "AL|", "EN|", …)
  // and must survive intact, otherwise a filter like "AL|,AR|" would match
  // the substring "en" everywhere ("vendetta", "henson", …) and wipe the
  // whole catalog.
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

type EntryType = "live" | "movie" | "series";

const SERIES_KEYWORDS = [
  "serie",
  "series",
  "séries",
  "show",
  "tv show",
  "épisode",
  "episode",
];
const MOVIE_KEYWORDS = [
  "film",
  "movie",
  "cinéma",
  "cinema",
  "vod",
  "affiche",
  "4k",
  "uhd",
  "fhd",
  "hd",
];

function detectType(extinf: string): EntryType {
  const lower = extinf.toLowerCase();
  if (SERIES_KEYWORDS.some((kw) => lower.includes(kw))) return "series";
  // Episode-pattern in the name (S01E01, 1x05, etc.) → series even if group
  // didn't say so
  if (/\bs\d{1,3}\s*[\.xee]\s*\d{1,3}\b/i.test(lower)) return "series";
  if (MOVIE_KEYWORDS.some((kw) => lower.includes(kw))) return "movie";
  return "live";
}

function buildFilterPredicate(): (extinf: string) => boolean {
  const globalInclude = parseKeywords(process.env.M3U_INCLUDE);
  const globalExclude = parseKeywords(
    process.env.M3U_EXCLUDE ?? DEFAULT_EXCLUDE
  );
  const liveInclude = parseKeywords(process.env.M3U_LIVE_INCLUDE);
  const movieInclude = parseKeywords(process.env.M3U_MOVIE_INCLUDE);
  const seriesInclude = parseKeywords(process.env.M3U_SERIES_INCLUDE);

  return (extinf: string) => {
    const lower = extinf.toLowerCase();

    // 1. Global exclude blacklist — always wins
    if (globalExclude.length > 0 && globalExclude.some((k) => lower.includes(k))) {
      return false;
    }

    // 2. Global include allow-list — if set, must match
    if (globalInclude.length > 0 && !globalInclude.some((k) => lower.includes(k))) {
      return false;
    }

    // 3. Type-specific include — if set FOR THIS TYPE, must match
    const type = detectType(extinf);
    if (type === "series" && seriesInclude.length > 0) {
      return seriesInclude.some((k) => lower.includes(k));
    }
    if (type === "movie" && movieInclude.length > 0) {
      return movieInclude.some((k) => lower.includes(k));
    }
    if (type === "live" && liveInclude.length > 0) {
      return liveInclude.some((k) => lower.includes(k));
    }

    return true;
  };
}

function filterM3U(
  text: string,
  shouldKeep: (extinf: string) => boolean
): {
  filtered: string;
  kept: number;
  dropped: number;
  byType: Record<EntryType, { kept: number; dropped: number }>;
} {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let pendingExtinf: string | null = null;
  let pendingDirectives: string[] = [];
  let pendingPasses = true;
  let pendingType: EntryType = "live";
  let kept = 0;
  let dropped = 0;
  const byType: Record<EntryType, { kept: number; dropped: number }> = {
    live: { kept: 0, dropped: 0 },
    movie: { kept: 0, dropped: 0 },
    series: { kept: 0, dropped: 0 },
  };

  function flush(urlLine: string | null) {
    if (pendingExtinf && pendingPasses && urlLine) {
      out.push(pendingExtinf);
      out.push(...pendingDirectives);
      out.push(urlLine);
      kept++;
      byType[pendingType].kept++;
    } else if (pendingExtinf) {
      dropped++;
      byType[pendingType].dropped++;
    } else if (urlLine) {
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
      if (pendingExtinf) {
        dropped++;
        byType[pendingType].dropped++;
        pendingExtinf = null;
        pendingDirectives = [];
      }
      pendingExtinf = line;
      pendingType = detectType(line);
      pendingPasses = shouldKeep(line);
      continue;
    }

    if (trimmed.startsWith("#")) {
      if (pendingExtinf) {
        pendingDirectives.push(line);
      } else {
        out.push(line);
      }
      continue;
    }

    flush(line);
  }

  if (pendingExtinf) {
    dropped++;
    byType[pendingType].dropped++;
  }

  return { filtered: out.join("\n"), kept, dropped, byType };
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
  const predicate = buildFilterPredicate();
  const { filtered: filteredAttempt, kept, dropped, byType } = filterM3U(
    rawText,
    predicate
  );

  // Safety net : if the filter wiped out literally everything (typically
  // because of a too-broad keyword like "en" or "fr"), fall back to the raw
  // upstream so the user at least sees the catalog. A header signals the
  // fail-open so devtools can spot the misconfiguration.
  const tooAggressive = kept === 0 && dropped > 0;
  const filtered = tooAggressive ? rawText : filteredAttempt;

  return new NextResponse(filtered, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Cache-Control": CACHE_HEADER,
      "Access-Control-Allow-Origin": "*",
      "X-Tristan-Original-Bytes": String(rawText.length),
      "X-Tristan-Filtered-Bytes": String(filtered.length),
      "X-Tristan-Entries-Kept": String(kept),
      "X-Tristan-Entries-Dropped": String(dropped),
      "X-Tristan-Live-Kept": String(byType.live.kept),
      "X-Tristan-Movies-Kept": String(byType.movie.kept),
      "X-Tristan-Series-Kept": String(byType.series.kept),
      "X-Tristan-Filter-FailOpen": tooAggressive ? "true" : "false",
    },
  });
}
