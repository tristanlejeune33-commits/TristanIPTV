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

const STATE_DIR = path.join(process.cwd(), ".le-jeune-iptv");
const STATE_FILE = path.join(STATE_DIR, "state.json");

type State = {
  m3uUrl: string | null;
  updatedAt: number;
};

async function readState(): Promise<State> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "m3uUrl" in parsed) {
      return parsed as State;
    }
  } catch {
    // file missing or invalid — treat as empty state
  }
  return { m3uUrl: null, updatedAt: 0 };
}

async function writeState(next: State): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(next, null, 2), "utf8");
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
