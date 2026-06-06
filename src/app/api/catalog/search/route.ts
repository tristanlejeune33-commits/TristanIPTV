import { NextRequest, NextResponse } from "next/server";
import { getCatalog, getDefaultM3uUrl } from "@/lib/server-catalog";

/**
 * Server-side fuzzy search across the catalog. Returns results already
 * grouped by type so the client renders them in sections without doing
 * any heavy lifting.
 *
 * GET /api/catalog/search?q=jujutsu&limit=20
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? getDefaultM3uUrl();
  if (!url) {
    return NextResponse.json(
      { error: "no M3U URL configured" },
      { status: 400 }
    );
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q || q.length < 2) {
    return NextResponse.json({
      live: [],
      movies: [],
      shows: [],
      groups: [],
      total: 0,
    });
  }

  const limit = Math.min(
    50,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10))
  );
  const tokens = q.split(/\s+/).filter(Boolean);
  const match = (hay: string) => tokens.every((t) => hay.toLowerCase().includes(t));

  try {
    const playlist = await getCatalog(url);

    const live: ReturnType<typeof toChannelItem>[] = [];
    for (const c of playlist.liveChannels) {
      if (live.length >= limit) break;
      if (match(`${c.displayName} ${c.name} ${c.group}`)) {
        live.push(toChannelItem(c));
      }
    }

    const movies: ReturnType<typeof toChannelItem>[] = [];
    for (const c of playlist.movieChannels) {
      if (movies.length >= limit) break;
      if (match(`${c.displayName} ${c.name} ${c.group}`)) {
        movies.push(toChannelItem(c));
      }
    }

    const shows: ReturnType<typeof toShowItem>[] = [];
    for (const slug of playlist.showsSorted) {
      if (shows.length >= limit) break;
      const s = playlist.shows[slug];
      if (match(s.show)) {
        shows.push(toShowItem(s));
      }
    }

    const groups: { name: string; count: number }[] = [];
    for (const g of playlist.groupsSorted) {
      if (groups.length >= limit) break;
      if (match(g)) {
        groups.push({ name: g, count: playlist.groups[g]?.length ?? 0 });
      }
    }

    return NextResponse.json(
      {
        live,
        movies,
        shows,
        groups,
        total: live.length + movies.length + shows.length + groups.length,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=120",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toChannelItem(c: any) {
  return {
    id: c.id,
    name: c.name,
    displayName: c.displayName,
    group: c.group,
    logo: c.logo ?? null,
    type: c.type,
    isFrench: c.isFrench,
    langVariant: c.langVariant,
    year: c.year,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toShowItem(s: any) {
  return {
    showSlug: s.showSlug,
    show: s.show,
    group: s.group,
    isFrench: s.isFrench,
    episodeCount: s.episodes.length,
    latestYear: s.latestYear,
    poster: s.episodes[0]?.logo ?? null,
  };
}
