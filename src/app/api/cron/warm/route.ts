import { NextRequest, NextResponse } from "next/server";

/**
 * Background "warmer" endpoint.
 *
 * Calls our own /api/m3u proxy with the env-configured M3U URL so that the
 * Vercel edge CDN caches the response. Subsequent client visits — from any
 * device, anywhere on the planet — get served the M3U from the closest
 * Vercel edge POP instead of having to wait on the IPTV upstream.
 *
 * Triggered by:
 *   - Vercel's built-in cron (configured in vercel.json) — daily on Hobby,
 *     hourly on Pro.
 *   - An external cron service (cron-job.org, EasyCron, GitHub Actions …)
 *     for more frequent warm-ups on the free Hobby plan.
 *
 * Security: if `CRON_SECRET` is set in the environment, requests must include
 * `Authorization: Bearer <secret>`. Vercel's cron sends this header
 * automatically. Without the env var the endpoint is open so the user can
 * trigger it from any cron service of their choice.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Auth check (only enforced when CRON_SECRET is configured)
  const expected = process.env.CRON_SECRET?.trim();
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
  }

  const m3uUrl = process.env.DEFAULT_M3U_URL?.trim();
  if (!m3uUrl) {
    return NextResponse.json(
      {
        ok: false,
        reason: "DEFAULT_M3U_URL n'est pas configuré dans les variables d'environnement",
      },
      { status: 400 }
    );
  }

  const origin = req.nextUrl.origin;
  const proxyUrl = `${origin}/api/m3u?url=${encodeURIComponent(m3uUrl)}`;
  const startedAt = Date.now();

  try {
    const res = await fetch(proxyUrl, { cache: "no-store" });
    // Drain the body so the edge cache is fully populated
    const text = await res.text();
    const ms = Date.now() - startedAt;

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        bytes: text.length,
        sizeMb: (text.length / 1024 / 1024).toFixed(2),
        durationMs: ms,
        cachedAt: new Date().toISOString(),
        note: res.ok
          ? "Cache edge Vercel rafraîchi"
          : "Échec du warm — voir le statut upstream",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      },
      { status: 502 }
    );
  }
}
