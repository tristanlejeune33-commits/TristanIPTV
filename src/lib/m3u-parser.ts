/**
 * M3U / M3U8 playlist parser tailored for IPTV playlists.
 * Handles `#EXTINF` attributes (tvg-id, tvg-name, tvg-logo, group-title, tvg-country, tvg-language)
 * and the optional `#EXTGRP` directive.
 */

export type Channel = {
  /** Stable id derived from tvg-id or generated from URL */
  id: string;
  name: string;
  logo?: string;
  group: string;
  url: string;
  tvgId?: string;
  country?: string;
  language?: string;
  /** Anything we couldn't parse but kept just in case */
  raw?: string;
};

export type ParsedPlaylist = {
  channels: Channel[];
  /** Map group-title -> channels */
  groups: Record<string, Channel[]>;
  /** Groups sorted by channel count desc */
  groupsSorted: string[];
};

const ATTR_REGEX = /([\w-]+)="([^"]*)"/g;

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = ATTR_REGEX.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h << 5) - h + url.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

export function parseM3U(text: string): ParsedPlaylist {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];

  let pendingName: string | null = null;
  let pendingAttrs: Record<string, string> = {};
  let pendingGroup: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXTM3U")) continue;

    if (line.startsWith("#EXTINF")) {
      // #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Display Name
      const commaIdx = line.indexOf(",");
      const head = commaIdx >= 0 ? line.slice(0, commaIdx) : line;
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "";

      pendingAttrs = parseAttributes(head);
      pendingName = name || pendingAttrs["tvg-name"] || "Sans nom";
      continue;
    }

    if (line.startsWith("#EXTGRP:")) {
      pendingGroup = line.slice("#EXTGRP:".length).trim();
      continue;
    }

    if (line.startsWith("#")) continue;

    // This is a URL line.
    const url = line;
    const name = pendingName ?? "Sans nom";
    const group =
      pendingAttrs["group-title"] || pendingGroup || "Non classé";
    const tvgId = pendingAttrs["tvg-id"];
    const logo = pendingAttrs["tvg-logo"];
    const country = pendingAttrs["tvg-country"];
    const language = pendingAttrs["tvg-language"];

    const baseId = tvgId && tvgId.length > 0 ? slugify(tvgId) : slugify(name);
    const id = `${baseId || "ch"}-${hashUrl(url)}`;

    channels.push({
      id,
      name,
      logo: logo || undefined,
      group,
      url,
      tvgId: tvgId || undefined,
      country: country || undefined,
      language: language || undefined,
    });

    pendingName = null;
    pendingAttrs = {};
    pendingGroup = null;
  }

  // Dedupe by id (last wins)
  const byId = new Map<string, Channel>();
  for (const ch of channels) byId.set(ch.id, ch);
  const dedup = Array.from(byId.values());

  const groups: Record<string, Channel[]> = {};
  for (const ch of dedup) {
    if (!groups[ch.group]) groups[ch.group] = [];
    groups[ch.group].push(ch);
  }

  const groupsSorted = Object.keys(groups).sort(
    (a, b) => groups[b].length - groups[a].length
  );

  return { channels: dedup, groups, groupsSorted };
}

/** Heuristic: does the URL look like an HLS stream? */
export function isHlsUrl(url: string): boolean {
  const u = url.toLowerCase().split("?")[0];
  return u.endsWith(".m3u8") || u.includes(".m3u8");
}
