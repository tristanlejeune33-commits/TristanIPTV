import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Server-side persistence for the M3U URL.
 *
 * Why: localStorage is per-device and per-browser. When the user pastes their
 * link on the PC then opens the app on their iPhone over LAN, the URL is
 * empty there. Saving server-side lets every device that connects to this
 * Next.js instance share the same playlist URL automatically.
 *
 * Storage: a JSON file under `.le-jeune-iptv/state.json` in the project root
 * (gitignored by default since `.next/` isn't writable from runtime).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Detect serverless / read-only environments. On Vercel, Cloudflare Pages,
 * Netlify and similar, the filesystem either isn't writable or doesn't
 * persist between cold starts — so we silently fall back to "in-memory only"
 * behavior. Each device keeps using its own localStorage like before.
 */
const READ_ONLY = Boolean(
  process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.CF_PAGES ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
);

const STATE_DIR = path.join(process.cwd(), ".tristan-iptv");
const STATE_FILE = path.join(STATE_DIR, "state.json");
// Old location from the previous branding — migrate transparently if present.
const LEGACY_FILE = path.join(process.cwd(), ".le-jeune-iptv", "state.json");

type State = {
  m3uUrl: string | null;
  updatedAt: number;
};

function envDefault(): string | null {
  // Server-side default — let the deployer hard-code their M3U so every
  // device that opens the site is auto-configured. Read on every request so
  // a Vercel redeploy with a new value picks it up without rebuild.
  const url = process.env.DEFAULT_M3U_URL?.trim();
  if (!url) return null;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

async function readState(): Promise<State> {
  const envUrl = envDefault();

  if (READ_ONLY) {
    return envUrl
      ? { m3uUrl: envUrl, updatedAt: 0 }
      : { m3uUrl: null, updatedAt: 0 };
  }

  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "m3uUrl" in parsed) {
      const stored = parsed as State;
      // If admin removed the saved value, fall back to the env default
      if (!stored.m3uUrl && envUrl) {
        return { m3uUrl: envUrl, updatedAt: 0 };
      }
      return stored;
    }
  } catch {
    // fall through to legacy lookup
  }
  try {
    const raw = await fs.readFile(LEGACY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "m3uUrl" in parsed) {
      return parsed as State;
    }
  } catch {
    // ignore
  }

  return envUrl
    ? { m3uUrl: envUrl, updatedAt: 0 }
    : { m3uUrl: null, updatedAt: 0 };
}

async function writeState(next: State): Promise<void> {
  if (READ_ONLY) return; // silently no-op on serverless platforms
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // host filesystem refused (e.g. unexpected read-only mount) — silently
    // degrade to localStorage-only behavior on the client.
  }
}

export async function GET() {
  const state = await readState();
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("m3uUrl" in body) ||
    (typeof (body as { m3uUrl: unknown }).m3uUrl !== "string" &&
      (body as { m3uUrl: unknown }).m3uUrl !== null)
  ) {
    return NextResponse.json(
      { error: "expected { m3uUrl: string | null }" },
      { status: 400 }
    );
  }

  const m3uUrl = (body as { m3uUrl: string | null }).m3uUrl;
  if (m3uUrl) {
    try {
      new URL(m3uUrl);
    } catch {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }
  }

  const next: State = { m3uUrl, updatedAt: Date.now() };
  await writeState(next);
  return NextResponse.json(next, {
    headers: { "Cache-Control": "no-store" },
  });
}
