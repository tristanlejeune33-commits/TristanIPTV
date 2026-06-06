import { NextRequest, NextResponse } from "next/server";
import { getCatalog, getDefaultM3uUrl } from "@/lib/server-catalog";

/**
 * Get a single show with all its episodes (sorted by season + episode).
 *
 * GET /api/catalog/show/jujutsu-kaisen
 */
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const url = req.nextUrl.searchParams.get("url") ?? getDefaultM3uUrl();
  if (!url) {
    return NextResponse.json(
      { error: "no M3U URL configured" },
      { status: 400 }
    );
  }

  try {
    const playlist = await getCatalog(url);
    const show = playlist.shows[slug];
    if (!show) {
      return NextResponse.json({ error: "show not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        show: show.show,
        showSlug: show.showSlug,
        group: show.group,
        isFrench: show.isFrench,
        latestYear: show.latestYear,
        episodes: show.episodes.map((ep) => ({
          id: ep.id,
          name: ep.name,
          displayName: ep.displayName,
          group: ep.group,
          logo: ep.logo ?? null,
          isFrench: ep.isFrench,
          langVariant: ep.langVariant,
          year: ep.year,
          season: ep.seriesInfo?.season ?? null,
          episode: ep.seriesInfo?.episode ?? null,
          episodeTitle: ep.seriesInfo?.episodeTitle ?? null,
        })),
      },
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
