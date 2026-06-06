import type { CatalogItem, ShowItem } from "./catalog-client";
import type { Channel, ShowGroup } from "./m3u-parser";

/**
 * Adapt the lightweight CatalogItem returned by /api/catalog/* into the
 * Channel shape the legacy cards/rails expect. URLs are intentionally left
 * empty — the stream URL is fetched lazily via /api/catalog/stream/:id when
 * the user hits Play.
 */
export function itemToChannel(item: CatalogItem): Channel {
  return {
    id: item.id,
    name: item.name,
    displayName: item.displayName,
    logo: item.logo ?? undefined,
    group: item.group,
    url: "",
    type: item.type,
    isFrench: item.isFrench,
    langVariant: (item.langVariant as Channel["langVariant"]) ?? null,
    year: item.year,
    seriesInfo: item.showSlug
      ? {
          show: item.episodeTitle ? item.displayName : item.displayName,
          showSlug: item.showSlug,
          season: item.season ?? undefined,
          episode: item.episode ?? undefined,
          episodeTitle: item.episodeTitle ?? undefined,
        }
      : null,
    orderIndex: 0,
  };
}

export function showItemToGroup(item: ShowItem): ShowGroup {
  return {
    show: item.show,
    showSlug: item.showSlug,
    isFrench: item.isFrench,
    group: item.group,
    episodes: [
      // Single synthetic episode just to provide a poster via ChannelThumbnail
      {
        id: `${item.showSlug}-poster`,
        name: item.show,
        displayName: item.show,
        logo: item.poster ?? undefined,
        group: item.group,
        url: "",
        type: "series",
        isFrench: item.isFrench,
        langVariant: null,
        year: item.latestYear,
        seriesInfo: {
          show: item.show,
          showSlug: item.showSlug,
        },
        orderIndex: 0,
      },
    ],
    latestYear: item.latestYear,
    firstOrderIndex: 0,
  };
}
