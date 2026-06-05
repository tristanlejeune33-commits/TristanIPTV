/**
 * Classification heuristics for an IPTV channel/item:
 * - Detect content type (live TV channel / movie / series episode)
 * - Detect French content (priority for the FR audience)
 * - Extract series metadata (show name, season, episode) from VOD entries
 *
 * IPTV M3U playlists are messy and unstandardized — these heuristics are
 * deliberately broad and based on patterns observed across major providers.
 */

export type ContentType = "live" | "movie" | "series" | "unknown";

export type SeriesInfo = {
  show: string;
  /** Slug for routing — stable across episodes of the same show */
  showSlug: string;
  season?: number;
  episode?: number;
  /** Episode title parsed from the part AFTER the season/episode marker */
  episodeTitle?: string;
};

export type LangVariant = "VF" | "VOSTFR" | "VO" | "MULTI";

export type Classification = {
  type: ContentType;
  isFrench: boolean;
  seriesInfo: SeriesInfo | null;
  /** Production year extracted from title (e.g. "Inception (2010)") if present */
  year: number | null;
  /** Language packaging tag detected in name/group (VF, VOSTFR, VO, MULTI) */
  langVariant: LangVariant | null;
};

// --- French detection --------------------------------------------------------

const FRENCH_GROUP_PATTERNS = [
  /\b(fr|fra|france|french|français|francais)\b/i,
  /\|fr\|/i,
  /\[fr\]/i,
  /\(fr\)/i,
];

const FRENCH_CHANNEL_PATTERNS = [
  /\btf1\b/i,
  /\bm6\b/i,
  /\bfrance\s*[2-5o]\b/i,
  /\bfrance\s*info\b/i,
  /\bc\s*8\b/i,
  /\bcstar\b/i,
  /\bgulli\b/i,
  /\bnrj\s*12\b/i,
  /\btmc\b/i,
  /\btfx\b/i,
  /\bw9\b/i,
  /\b6ter\b/i,
  /\barte\b/i,
  /\bbfm\b/i,
  /\bcnews\b/i,
  /\blci\b/i,
  /\bcanal\+/i,
  /\bocs\b/i,
  /\bparis\s*premiere\b/i,
  /\brmc\b/i,
  /\bequipe\b/i,
  /\beurosport\b/i,
];

export function isFrenchChannel(input: {
  name: string;
  group: string;
  country?: string;
  language?: string;
}): boolean {
  const country = (input.country ?? "").toLowerCase();
  if (country === "fr" || country.includes("france")) return true;

  const lang = (input.language ?? "").toLowerCase();
  if (lang === "fr" || lang === "fra" || lang.includes("french") || lang.includes("français") || lang.includes("francais")) {
    return true;
  }

  for (const re of FRENCH_GROUP_PATTERNS) {
    if (re.test(input.group)) return true;
  }

  for (const re of FRENCH_CHANNEL_PATTERNS) {
    if (re.test(input.name)) return true;
  }

  return false;
}

// --- Content type detection --------------------------------------------------

const SERIES_GROUP_KEYWORDS = ["serie", "séries", "series", "tv show", "shows", "épisode"];
const MOVIE_GROUP_KEYWORDS = ["film", "movie", "cinéma", "cinema", "vod"];
const LIVE_GROUP_KEYWORDS = ["live", "direct", "chaîne", "chaine", "tv ", "iptv", "channel", "news", "sport", "info", "kids", "musique", "music"];

function groupContainsAny(group: string, keywords: string[]): boolean {
  const g = group.toLowerCase();
  return keywords.some((kw) => g.includes(kw));
}

function looksLikeVodUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return /\.(mp4|mkv|avi|mov|webm|ts)$/.test(u) && !u.endsWith("/index.ts");
}

function looksLikeHlsUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return u.endsWith(".m3u8") || u.includes(".m3u8?");
}

export function detectType(input: {
  name: string;
  group: string;
  url: string;
}): ContentType {
  // 1. Group title is the strongest signal in IPTV playlists
  if (groupContainsAny(input.group, SERIES_GROUP_KEYWORDS)) return "series";
  if (groupContainsAny(input.group, MOVIE_GROUP_KEYWORDS)) return "movie";

  // 2. URL extension as fallback for VOD
  if (looksLikeVodUrl(input.url)) {
    // VOD with episode pattern in name → series
    if (extractSeriesInfo(input.name)) return "series";
    return "movie";
  }

  // 3. HLS or live-keyword group → live channel
  if (looksLikeHlsUrl(input.url) || groupContainsAny(input.group, LIVE_GROUP_KEYWORDS)) {
    return "live";
  }

  // 4. Default to live (most IPTV content is live)
  return "live";
}

// --- Series episode parsing --------------------------------------------------

// One unified regex with three alternatives. Anchored on a word boundary so
// the engine finds the EARLIEST marker, not just the first that fits a
// `^.*?` lazy pattern (which was matching the LAST season/episode in titles
// where the show name itself contained season text like "Jujutsu Kaisen S01").
const SERIES_MARKER_RE =
  /\b[Ss](\d{1,3})\s*[\.xEe]\s*(\d{1,3})\b|\b(\d{1,2})\s*x\s*(\d{1,3})\b|\b(?:saison|season)\s*(\d{1,3})\s*[-–|·]?\s*(?:episode|épisode|ep)\s*(\d{1,3})\b/i;

const EP_ONLY_RE = /[-–|·]\s*(?:episode|épisode|ep)\s*(\d{1,3})\b/i;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "show";
}

/**
 * Collapse "Foo Bar Foo Bar" → "Foo Bar". IPTV providers very often duplicate
 * the show name on each side of a season marker, e.g.
 * "Jujutsu Kaisen S01 Jujutsu Kaisen" → "Jujutsu Kaisen".
 */
function dedupeRepeats(s: string): string {
  const tokens = s.trim().split(/\s+/).filter(Boolean);
  const n = tokens.length;
  if (n < 2) return s.trim();
  // Try halves first (most common case)
  if (n % 2 === 0) {
    const half = n / 2;
    const a = tokens.slice(0, half).join(" ").toLowerCase();
    const b = tokens.slice(half).join(" ").toLowerCase();
    if (a === b) return tokens.slice(0, half).join(" ");
  }
  // Try thirds too — sometimes "Foo Foo Foo"
  if (n % 3 === 0) {
    const third = n / 3;
    const a = tokens.slice(0, third).join(" ").toLowerCase();
    const b = tokens.slice(third, third * 2).join(" ").toLowerCase();
    const c = tokens.slice(third * 2).join(" ").toLowerCase();
    if (a === b && b === c) return tokens.slice(0, third).join(" ");
  }
  return s.trim();
}

/** Strip standalone season markers ("S01", "Saison 1") from the show name. */
function stripSeasonNoise(s: string): string {
  return s
    .replace(/\b[Ss]\d{1,3}\b/g, "")
    .replace(/\b(?:saison|season)\s*\d{1,3}\b/gi, "")
    .replace(/[-–|·:]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractSeriesInfo(name: string): SeriesInfo | null {
  const m = name.match(SERIES_MARKER_RE);
  let season: number | undefined;
  let episode: number | undefined;
  let markerIndex: number | undefined;
  let markerLength = 0;

  if (m && m.index !== undefined) {
    markerIndex = m.index;
    markerLength = m[0].length;
    if (m[1] !== undefined) {
      season = parseInt(m[1], 10);
      episode = parseInt(m[2], 10);
    } else if (m[3] !== undefined) {
      season = parseInt(m[3], 10);
      episode = parseInt(m[4], 10);
    } else if (m[5] !== undefined) {
      season = parseInt(m[5], 10);
      episode = parseInt(m[6], 10);
    }
  } else {
    const epOnly = name.match(EP_ONLY_RE);
    if (epOnly && epOnly.index !== undefined) {
      markerIndex = epOnly.index;
      markerLength = epOnly[0].length;
      episode = parseInt(epOnly[1], 10);
    }
  }

  if (markerIndex === undefined) return null;

  // Show name = everything BEFORE the earliest marker
  const beforeRaw = name.slice(0, markerIndex);
  const before = stripSeasonNoise(beforeRaw)
    .replace(/[-–|·:]+\s*$/, "")
    .trim();
  const show = dedupeRepeats(before);
  if (!show) return null;

  // Episode title = part AFTER the marker, cleaned
  const afterRaw = name.slice(markerIndex + markerLength);
  let episodeTitle = afterRaw
    .replace(/^[\s\-–|·:]+/, "")
    .replace(/[-–|·:]+\s*$/, "")
    .trim();
  // If the episode title repeats the show name, drop it (avoids "Jujutsu Kaisen Jujutsu Kaisen")
  if (
    episodeTitle &&
    episodeTitle.toLowerCase().startsWith(show.toLowerCase())
  ) {
    episodeTitle = episodeTitle
      .slice(show.length)
      .replace(/^[\s\-–|·:]+/, "")
      .trim();
  }

  return {
    show,
    showSlug: slugify(show),
    season:
      season !== undefined && Number.isFinite(season) ? season : undefined,
    episode:
      episode !== undefined && Number.isFinite(episode) ? episode : undefined,
    episodeTitle: episodeTitle || undefined,
  };
}

// --- Combined ---------------------------------------------------------------

const YEAR_REGEX = /(?:^|[\s\(\[\.\-])((?:19|20)\d{2})(?:[\s\)\]\.\-]|$)/;

/**
 * Detect a French-IPTV language packaging tag inside the name/group.
 * Order matters: VOSTFR must be tested before VO (it contains "VO") and
 * before VF (the "FR" variant of VO).
 */
export function extractLangVariant(
  name: string,
  group?: string
): LangVariant | null {
  const hay = `${name} ${group ?? ""}`;
  // VOSTFR — original audio + French subtitles (also written VOST-FR, VOST.FR, VO ST FR…)
  if (/\b(VOSTF?R?|VO\s*ST\s*FR?|VO\.?ST\.?FR?|SUB[\s\-_]?FR|SUBFR)\b/i.test(hay)) {
    return "VOSTFR";
  }
  // VF — French dub. VFF (true French), VFQ (Quebec French), MULTI handled separately.
  if (/\b(VFF?|VFQ|MULTI[\s\-_]?VF)\b/i.test(hay)) {
    return "VF";
  }
  // MULTI — multi-language audio tracks (often VF + VO)
  if (/\b(MULTI(LANG)?|MULTI\.?AUDIO)\b/i.test(hay)) {
    return "MULTI";
  }
  // VO — original audio, no subs
  if (/\b(VO|V\.O\.?|ORIGINAL|ORIG|OG)\b/i.test(hay)) {
    return "VO";
  }
  return null;
}

/** Extract a 4-digit production year from a title if it looks plausible. */
export function extractYear(name: string): number | null {
  const now = new Date().getFullYear();
  const m = name.match(YEAR_REGEX);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  if (!Number.isFinite(y)) return null;
  if (y < 1920 || y > now + 1) return null;
  return y;
}

/**
 * Strip the noise that IPTV providers stuff into titles so they read like
 * regular movie/series names. Removes country prefixes ("FR| "), year
 * markers, language tags, quality / codec mentions, file extensions, and
 * leftover separators.
 *
 * Falls back to the raw name if cleaning would empty the string.
 */
export function cleanDisplayName(raw: string): string {
  let s = raw;

  // 1. Country / group prefix:  "FR| ", "EN | ", "[FR] ", "[EN] "
  s = s.replace(/^\s*[A-Z]{2,4}\s*[\|:\-]\s*/i, "");
  s = s.replace(/^\s*\[[A-Z]{2,4}\]\s*/i, "");

  // 2. File extension at the end
  s = s.replace(/\.(mp4|mkv|avi|webm|mov|m4v|ts)\s*$/i, "");

  // 3. Language packaging tags (whole-word so we don't gut titles like "Subway")
  s = s.replace(/\s*\b(VOSTFR?|VOST[\s\.\-]?FR|SUB[\s\-]?FR|SUBFR)\b/gi, "");
  s = s.replace(/\s*\b(VFF?|VFQ|MULTI(?:LANG)?|MULTI[\s\-_]?AUDIO|MULTI[\s\-_]?VF)\b/gi, "");
  s = s.replace(/\s*\b(VO|V\.O\.?)\b(?![a-zA-Z])/gi, "");

  // 4. Quality / codec markers (4K, HEVC, 1080p, etc.) — never legit in movie titles
  s = s.replace(/\s*\b(4K|UHD|HDR10?|HEVC|H[\.\s]?265|H[\.\s]?264|x265|x264|1080p|720p|480p|2160p|FHD|HDTV|WEB-?DL|WEBRip|BluRay|BD[Rr]ip|REMUX)\b/gi, "");

  // 5. Standalone SD/HD at the end or before a bracket
  s = s.replace(/\s+\b(SD|HD)\b(?=\s*$|\s*[\(\[])/gi, "");

  // 6. Year in parens / brackets — keep it via Channel.year, no need in title
  s = s.replace(/\s*[\(\[](?:19|20)\d{2}[\)\]]\s*/g, " ");

  // 7. Trailing year without parens ("Title 2024")
  s = s.replace(/\s+(?:19|20)\d{2}\s*$/g, "");

  // 8. Remaining empty brackets ()  [] {}
  s = s.replace(/\s*[\(\[\{][\s\.\-]*[\)\]\}]\s*/g, " ");

  // 9. Collapse leftover separators at the edges
  s = s.replace(/^\s*[\-\|:·–]+\s*/, "");
  s = s.replace(/\s*[\-\|:·–]+\s*$/, "");

  // 10. Collapse multiple spaces
  s = s.replace(/\s{2,}/g, " ").trim();

  return s || raw;
}

export function classify(input: {
  name: string;
  group: string;
  url: string;
  country?: string;
  language?: string;
}): Classification {
  const type = detectType(input);
  const seriesInfo = type === "series" ? extractSeriesInfo(input.name) : null;
  return {
    type,
    isFrench: isFrenchChannel(input),
    seriesInfo,
    year: type === "movie" || type === "series" ? extractYear(input.name) : null,
    langVariant:
      type === "movie" || type === "series"
        ? extractLangVariant(input.name, input.group)
        : null,
  };
}

/**
 * Build a stable sort comparator that puts French items first, then by name.
 */
export function frenchFirst<T extends { isFrench: boolean; name: string }>(a: T, b: T): number {
  if (a.isFrench && !b.isFrench) return -1;
  if (!a.isFrench && b.isFrench) return 1;
  return a.name.localeCompare(b.name, "fr");
}
