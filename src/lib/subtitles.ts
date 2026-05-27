/**
 * Minimal subtitle helpers — convert SRT to WebVTT (the only format the
 * HTML5 <track> element supports natively) and produce a Blob URL ready to
 * feed into the player.
 */

export type SubtitleFormat = "vtt" | "srt" | "unknown";

export function detectSubtitleFormat(content: string): SubtitleFormat {
  const trimmed = content.trim();
  if (/^WEBVTT/i.test(trimmed)) return "vtt";
  // SRT: 1\n00:00:00,000 --> 00:00:01,000\nText
  if (/^\d+\s*[\r\n]+\d{2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/m.test(trimmed)) return "srt";
  return "unknown";
}

/**
 * Convert SubRip (SRT) text to WebVTT.
 * - Strip cue numbers
 * - Replace `HH:MM:SS,mmm` with `HH:MM:SS.mmm`
 * - Normalize CRLF
 */
export function srtToVtt(srt: string): string {
  const normalized = srt.replace(/\r+/g, "").replace(/^\s+|\s+$/g, "");
  const body = normalized
    // remove plain cue numbers on their own line (between blank lines)
    .replace(/(^|\n)\d+\n(?=\d{2}:\d{2}:\d{2})/g, "$1")
    // convert SRT timestamp separator to VTT
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{1,3})/g, "$1.$2");
  return `WEBVTT\n\n${body}\n`;
}

/** Returns a Blob URL serving the subtitle as WebVTT regardless of input format. */
export function toVttBlobUrl(content: string): string | null {
  const format = detectSubtitleFormat(content);
  let vtt: string;
  if (format === "vtt") {
    vtt = content;
  } else if (format === "srt") {
    vtt = srtToVtt(content);
  } else {
    return null;
  }
  const blob = new Blob([vtt], { type: "text/vtt;charset=utf-8" });
  return URL.createObjectURL(blob);
}
