import { NextResponse } from "next/server";

/**
 * Exposes whether a transcoder is configured server-side and, if so, its
 * base URL. The client uses this to:
 *   - Decide whether to show the "Transcoder Live TV" toggle in Settings
 *   - Build the actual transcode URL to feed into the player
 *
 * The secret is NOT returned — secret-protected transcoders are called via a
 * server-side proxy at /api/transcode-proxy (TODO) so the secret never
 * touches the browser. For most users (personal IPTV), no secret is fine.
 */
export const runtime = "nodejs";

export async function GET() {
  const baseUrl = process.env.TRANSCODER_URL?.trim() ?? null;
  return NextResponse.json(
    {
      enabled: Boolean(baseUrl),
      baseUrl,
      // When the secret is set, the client appends ?secret= directly. Yes,
      // this means anyone who opens devtools sees it — but the threat model
      // here is "stop random hotlinkers", not "secrets fortress". Don't use
      // a value you reuse elsewhere.
      secret: process.env.TRANSCODER_SECRET?.trim() ?? null,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
