import { NextRequest, NextResponse } from "next/server";
import { getCatalog, getDefaultM3uUrl } from "@/lib/server-catalog";

/**
 * Resolve a channel id to its full record (incl. streaming URL).
 *
 * The browse / list endpoints intentionally omit the stream URL so a paginated
 * list response stays as small as possible. The client calls this only when
 * the user actually hits Play.
 *
 * GET /api/catalog/stream/tf1-abc123
 */
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const url = req.nextUrl.searchParams.get("url") ?? getDefaultM3uUrl();
  if (!url) {
    return NextResponse.json(
      { error: "no M3U URL configured" },
      { status: 400 }
    );
  }

  try {
    const playlist = await getCatalog(url);
    const channel = playlist.channels.find((c) => c.id === id);
    if (!channel) {
      return NextResponse.json({ error: "channel not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        id: channel.id,
        name: channel.name,
        displayName: channel.displayName,
        group: channel.group,
        url: channel.url,
        logo: channel.logo ?? null,
        type: channel.type,
        isFrench: channel.isFrench,
        langVariant: channel.langVariant,
        year: channel.year,
        showSlug: channel.seriesInfo?.showSlug ?? null,
        season: channel.seriesInfo?.season ?? null,
        episode: channel.seriesInfo?.episode ?? null,
        episodeTitle: channel.seriesInfo?.episodeTitle ?? null,
      },
      {
        headers: {
          // Stream URLs can be sensitive — short-cache only
          "Cache-Control": "public, max-age=30, s-maxage=60",
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
