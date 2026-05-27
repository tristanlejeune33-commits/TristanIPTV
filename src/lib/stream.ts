/**
 * Wrap a remote stream URL through our same-origin proxy so the browser
 * doesn't have to deal with CORS / UA restrictions from the IPTV provider.
 */
export function proxiedStreamUrl(originalUrl: string): string {
  return `/api/hls?url=${encodeURIComponent(originalUrl)}`;
}
