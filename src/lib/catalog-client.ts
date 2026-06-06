/**
 * Client-side wrapper around the /api/catalog/* endpoints.
 *
 * Pages call these functions instead of holding the full parsed M3U in
 * memory. Results are kept in a small Map cache (channels + shows by id /
 * slug) so re-visits inside a session are instant.
 */

export type CatalogType = "live" | "movie" | "series" | "all";
export type SortMode = "default" | "alpha" | "year" | "recent";
export type LangVariant = "VF" | "VOSTFR" | "VO" | "MULTI";

export type CatalogItem = {
  id: string;
  name: string;
  displayName: string;
  group: string;
  logo: string | null;
  type: "live" | "movie" | "series";
  isFrench: boolean;
  langVariant: string | null;
  year: number | null;
  showSlug?: string | null;
  season?: number | null;
  episode?: number | null;
  episodeTitle?: string | null;
};

export type StreamItem = CatalogItem & { url: string };

export type ShowItem = {
  showSlug: string;
  show: string;
  group: string;
  isFrench: boolean;
  episodeCount: number;
  latestYear: number | null;
  poster: string | null;
};

export type ShowDetail = {
  show: string;
  showSlug: string;
  group: string;
  isFrench: boolean;
  latestYear: number | null;
  episodes: Array<{
    id: string;
    name: string;
    displayName: string;
    group: string;
    logo: string | null;
    isFrench: boolean;
    langVariant: string | null;
    year: number | null;
    season: number | null;
    episode: number | null;
    episodeTitle: string | null;
  }>;
};

export type CatalogMeta = {
  totalChannels: number;
  totalLive: number;
  totalMovies: number;
  totalShows: number;
  totalEpisodes: number;
  totalFrench: number;
  totalGroups: number;
  groups: Array<{
    name: string;
    count: number;
    type: "live" | "movie" | "series";
    isFrench: boolean;
  }>;
  lastUpdated: string;
};

export type SearchResults = {
  live: CatalogItem[];
  movies: CatalogItem[];
  shows: ShowItem[];
  groups: Array<{ name: string; count: number }>;
  total: number;
};

export type ListResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

// --- Tiny in-memory cache so navigating Home → /live → Home is instant ---

const channelCache = new Map<string, CatalogItem>();
const showCache = new Map<string, ShowDetail>();
let metaCache: { value: CatalogMeta; timestamp: number } | null = null;

const META_TTL_MS = 5 * 60 * 1000;

async function jsonGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function fetchMeta(force = false): Promise<CatalogMeta> {
  if (!force && metaCache && Date.now() - metaCache.timestamp < META_TTL_MS) {
    return metaCache.value;
  }
  const value = await jsonGet<CatalogMeta>("/api/catalog/meta");
  metaCache = { value, timestamp: Date.now() };
  return value;
}

export type ListOpts = {
  type?: CatalogType;
  group?: string;
  variant?: LangVariant | null;
  french?: boolean;
  q?: string;
  sort?: SortMode;
  page?: number;
  pageSize?: number;
};

function buildQuery(opts: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    params.set(k, v === true ? "1" : String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function fetchList(
  opts: ListOpts = {},
  signal?: AbortSignal
): Promise<ListResult<CatalogItem>> {
  const qs = buildQuery({
    type: opts.type ?? "all",
    group: opts.group ?? undefined,
    variant: opts.variant ?? undefined,
    french: opts.french ?? undefined,
    q: opts.q ?? undefined,
    sort: opts.sort ?? undefined,
    page: opts.page ?? undefined,
    pageSize: opts.pageSize ?? undefined,
  });
  const data = await jsonGet<ListResult<CatalogItem>>(`/api/catalog/list${qs}`, signal);
  for (const item of data.items) channelCache.set(item.id, item);
  return data;
}

export async function fetchByIds(ids: string[]): Promise<CatalogItem[]> {
  if (ids.length === 0) return [];
  const missing = ids.filter((id) => !channelCache.has(id));
  if (missing.length > 0) {
    const data = await jsonGet<ListResult<CatalogItem>>(
      `/api/catalog/list?ids=${encodeURIComponent(missing.join(","))}`
    );
    for (const item of data.items) channelCache.set(item.id, item);
  }
  return ids
    .map((id) => channelCache.get(id))
    .filter((it): it is CatalogItem => it !== undefined);
}

export async function fetchShows(
  opts: {
    french?: boolean;
    q?: string;
    sort?: SortMode;
    page?: number;
    pageSize?: number;
  } = {},
  signal?: AbortSignal
): Promise<ListResult<ShowItem>> {
  const qs = buildQuery({
    french: opts.french ?? undefined,
    q: opts.q ?? undefined,
    sort: opts.sort ?? undefined,
    page: opts.page ?? undefined,
    pageSize: opts.pageSize ?? undefined,
  });
  return jsonGet<ListResult<ShowItem>>(`/api/catalog/shows${qs}`, signal);
}

export async function fetchShow(slug: string): Promise<ShowDetail> {
  const cached = showCache.get(slug);
  if (cached) return cached;
  const data = await jsonGet<ShowDetail>(
    `/api/catalog/show/${encodeURIComponent(slug)}`
  );
  showCache.set(slug, data);
  return data;
}

export async function fetchStream(id: string): Promise<StreamItem> {
  return jsonGet<StreamItem>(`/api/catalog/stream/${encodeURIComponent(id)}`);
}

export async function fetchSearch(q: string, limit = 20): Promise<SearchResults> {
  if (!q.trim() || q.trim().length < 2) {
    return { live: [], movies: [], shows: [], groups: [], total: 0 };
  }
  return jsonGet<SearchResults>(
    `/api/catalog/search?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}

/** Drop the in-memory cache (e.g. after the user changes the M3U URL). */
export function resetCatalogCache(): void {
  channelCache.clear();
  showCache.clear();
  metaCache = null;
}
