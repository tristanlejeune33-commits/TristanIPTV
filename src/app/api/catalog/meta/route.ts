import { NextRequest, NextResponse } from "next/server";
import { getCatalog, getDefaultM3uUrl } from "@/lib/server-catalog";

/**
 * Lightweight catalog summary — fetched once at app boot to render the
 * top-level navigation and to know what's available.
 *
 * Response shape:
 *   {
 *     totalChannels, totalLive, totalMovies, totalShows, totalEpisodes,
 *     totalFrench,
 *     groups: [{ name, count, type }],  // top 200 groups by size
 *     lastUpdated: ISO timestamp
 *   }
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

    // Compute group metadata (name + count + dominant type)
    const groups = playlist.groupsSorted.slice(0, 200).map((name) => {
      const channels = playlist.groups[name] ?? [];
      let live = 0,
        movies = 0,
        series = 0;
      for (const c of channels) {
        if (c.type === "movie") movies++;
        else if (c.type === "series") series++;
        else live++;
      }
      const dominant =
        movies >= series && movies >= live
          ? "movie"
          : series >= live
            ? "series"
            : "live";
      const isFrench = channels.some((c) => c.isFrench);
      return { name, count: channels.length, type: dominant, isFrench };
    });

    return NextResponse.json(
      {
        totalChannels: playlist.channels.length,
        totalLive: playlist.liveChannels.length,
        totalMovies: playlist.movieChannels.length,
        totalShows: playlist.showsSorted.length,
        totalEpisodes: playlist.seriesEpisodes.length,
        totalFrench: playlist.channels.filter((c) => c.isFrench).length,
        totalGroups: playlist.groupsSorted.length,
        groups,
        lastUpdated: new Date().toISOString(),
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
