import { NextRequest, NextResponse } from "next/server";
import { getCatalog, getDefaultM3uUrl } from "@/lib/server-catalog";

/**
 * Paginated list of TV shows (one entry per show, not per episode).
 *
 * Query params:
 *   french   = "1" to only French
 *   q        = search by show name
 *   sort     = default | alpha | recent
 *   page, pageSize
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

  try {
    const playlist = await getCatalog(url);
    let items = playlist.showsSorted.map((slug) => playlist.shows[slug]);

    const french = req.nextUrl.searchParams.get("french") === "1";
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    if (french) items = items.filter((s) => s.isFrench);
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      items = items.filter((s) =>
        tokens.every((t) => s.show.toLowerCase().includes(t))
      );
    }

    const sort = req.nextUrl.searchParams.get("sort") ?? "default";
    if (sort === "alpha") {
      items = [...items].sort((a, b) => a.show.localeCompare(b.show, "fr"));
    } else if (sort === "recent") {
      items = [...items].sort(
        (a, b) => (b.latestYear ?? -1) - (a.latestYear ?? -1)
      );
    }

    const page = Math.max(
      1,
      parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10)
    );
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(req.nextUrl.searchParams.get("pageSize") ?? "60", 10))
    );
    const total = items.length;
    const slice = items.slice((page - 1) * pageSize, page * pageSize).map((s) => ({
      showSlug: s.showSlug,
      show: s.show,
      group: s.group,
      isFrench: s.isFrench,
      episodeCount: s.episodes.length,
      latestYear: s.latestYear,
      poster: s.episodes[0]?.logo ?? null,
    }));

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
