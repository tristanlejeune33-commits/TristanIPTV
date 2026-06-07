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
  const startedAt = Date.now();

  // Warm every catalog endpoint, not just the raw M3U.
  //
  // Vercel deploys each route handler as its own serverless function with its
  // own module-level memory, so the parsed-catalog cache in `server-catalog.ts`
  // lives independently in each. Hitting only `/api/m3u` warms the upstream
  // edge cache but does NOTHING for the catalog cache — so the first user to
  // call `/api/catalog/search` after a cold deploy waits 2-5s for the M3U to
  // be re-downloaded AND re-parsed. By pinging all the catalog routes here
  // we pre-parse the catalog inside every function instance.
  const targets: Array<{ label: string; url: string }> = [
    { label: "m3u", url: `${origin}/api/m3u?url=${encodeURIComponent(m3uUrl)}` },
    { label: "catalog/meta", url: `${origin}/api/catalog/meta` },
    { label: "catalog/shows", url: `${origin}/api/catalog/shows?pageSize=1` },
    { label: "catalog/list/live", url: `${origin}/api/catalog/list?type=live&pageSize=1` },
    { label: "catalog/list/movie", url: `${origin}/api/catalog/list?type=movie&pageSize=1` },
    { label: "catalog/search", url: `${origin}/api/catalog/search?q=fr` },
  ];

  const results = await Promise.all(
    targets.map(async (t) => {
      const t0 = Date.now();
      try {
        const res = await fetch(t.url, { cache: "no-store" });
        const text = await res.text();
        return {
          label: t.label,
          ok: res.ok,
          status: res.status,
          bytes: text.length,
          durationMs: Date.now() - t0,
        };
      } catch (err) {
        return {
          label: t.label,
          ok: false,
          status: 0,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - t0,
        };
      }
    })
  );

  return NextResponse.json(
    {
      ok: results.every((r) => r.ok),
      results,
      totalDurationMs: Date.now() - startedAt,
      cachedAt: new Date().toISOString(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
