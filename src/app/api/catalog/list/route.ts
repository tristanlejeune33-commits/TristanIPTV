import { NextRequest, NextResponse } from "next/server";
import { getCatalog, getDefaultM3uUrl } from "@/lib/server-catalog";
import type { Channel } from "@/lib/m3u-parser";

/**
 * Paginated listing of channels, optionally filtered by type / group /
 * language / langVariant. Returns lightweight items WITHOUT the streaming
 * URL (use /api/catalog/stream/:id for that when the user hits play).
 *
 * Query params:
 *   type       = live | movie | series | all                (default all)
 *   group      = exact group-title to filter on               (optional)
 *   variant    = VF | VOSTFR | MULTI | VO                     (optional)
 *   french     = "1" to only French entries                   (optional)
 *   q          = text search (any token must match)           (optional)
 *   sort       = default | year | alpha                       (default default)
 *   page       = 1-based page index                           (default 1)
 *   pageSize   = items per page, max 200                      (default 60)
 *   ids        = comma-separated ids — when set, returns just those entries
 */
export const runtime = "nodejs";

type Item = {
  id: string;
  name: string;
  displayName: string;
  group: string;
  logo: string | null;
  type: Channel["type"];
  isFrench: boolean;
  langVariant: string | null;
  year: number | null;
  showSlug: string | null;
  season: number | null;
  episode: number | null;
  episodeTitle: string | null;
};

function toItem(ch: Channel): Item {
  return {
    id: ch.id,
    name: ch.name,
    displayName: ch.displayName,
    group: ch.group,
    logo: ch.logo ?? null,
    type: ch.type,
    isFrench: ch.isFrench,
    langVariant: ch.langVariant,
    year: ch.year,
    showSlug: ch.seriesInfo?.showSlug ?? null,
    season: ch.seriesInfo?.season ?? null,
    episode: ch.seriesInfo?.episode ?? null,
    episodeTitle: ch.seriesInfo?.episodeTitle ?? null,
  };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? getDefaultM3uUrl();
  if (!url) {
    return NextResponse.json(
      { error: "no M3U URL configured" },
      { status: 400 }
    );
  }

  try {
    const playlist = await getCatalog(url);

    // Resolve the base list according to `type`
    const type = req.nextUrl.searchParams.get("type") ?? "all";
    let base: Channel[];
    switch (type) {
      case "live":
        base = playlist.liveChannels;
        break;
      case "movie":
      case "movies":
        base = playlist.movieChannels;
        break;
      case "series":
        base = playlist.seriesEpisodes;
        break;
      default:
        base = playlist.channels;
    }

    // Optional explicit-ids mode (used by Favorites / Continue Watching to
    // resolve a known set of channel ids without scanning everything client-side)
    const idsParam = req.nextUrl.searchParams.get("ids");
    if (idsParam) {
      const ids = new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean));
      const items = playlist.channels.filter((c) => ids.has(c.id)).map(toItem);
      return NextResponse.json(
        { items, total: items.length, page: 1, pageSize: items.length },
        {
          headers: {
            "Cache-Control": "public, max-age=60, s-maxage=300",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Filter
    const group = req.nextUrl.searchParams.get("group");
    const variant = req.nextUrl.searchParams.get("variant");
    const french = req.nextUrl.searchParams.get("french") === "1";
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    let items = base;
    if (group) items = items.filter((c) => c.group === group);
    if (variant) items = items.filter((c) => c.langVariant === variant);
    if (french) items = items.filter((c) => c.isFrench);
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      items = items.filter((c) => {
        const hay = `${c.displayName} ${c.name} ${c.group}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }

    // Sort
    const sort = req.nextUrl.searchParams.get("sort") ?? "default";
    if (sort === "alpha") {
      items = [...items].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, "fr")
      );
    } else if (sort === "year") {
      items = [...items].sort((a, b) => (b.year ?? -1) - (a.year ?? -1));
    }

    // Paginate
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(req.nextUrl.searchParams.get("pageSize") ?? "60", 10))
    );
    const total = items.length;
    const slice = items.slice((page - 1) * pageSize, page * pageSize).map(toItem);

    return NextResponse.json(
      { items: slice, total, page, pageSize },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300",
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
