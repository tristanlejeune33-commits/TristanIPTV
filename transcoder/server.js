/**
 * TRISTAN IPTV — ffmpeg transcoder service.
 *
 * Deployed separately from the main Next.js app (typically on Railway with
 * the bundled ffmpeg binary). The Next.js app POSTS/GETs stream URLs here
 * and gets back a browser-friendly H.264 + AAC MPEG-TS stream — bypassing
 * the HEVC / AC-3 codec restrictions of Chrome / Firefox on Windows.
 *
 * Endpoints:
 *   GET /                      — health check (returns JSON status)
 *   GET /transcode?url=<URL>   — start a transcode session, pipes MPEG-TS
 *                                to the client
 *   GET /probe?url=<URL>       — quick codec inspection via ffprobe
 *
 * Optional protection:
 *   TRANSCODER_SECRET env var — when set, requests must include
 *   ?secret=<value> or Authorization: Bearer <value>
 *
 * The transcoder kills its ffmpeg subprocess as soon as the client
 * disconnects, so no orphaned ffmpeg eats CPU on Railway.
 */

const express = require("express");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.TRANSCODER_SECRET?.trim();
const UPSTREAM_UA = process.env.UPSTREAM_UA || "VLC/3.0.20 LibVLC/3.0.20";
// Track active sessions for the health endpoint
let activeSessions = 0;
let totalServed = 0;

function authorized(req) {
  if (!SECRET) return true;
  const fromQuery = req.query.secret;
  const auth = req.headers.authorization || "";
  return fromQuery === SECRET || auth === `Bearer ${SECRET}`;
}

function parseUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// CORS — wide open since this is meant to be called from the user's own
// Next.js deployment (URL is unknown / changes).
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type, Authorization");
  next();
});

app.options("*", (_req, res) => res.status(204).end());

// --- Health -----------------------------------------------------------------
app.get("/", (_req, res) => {
  res.json({
    service: "tristan-iptv-transcoder",
    version: "1.0.0",
    activeSessions,
    totalServed,
    secretProtected: !!SECRET,
    uptime: process.uptime(),
  });
});

// --- Codec inspection -------------------------------------------------------
app.get("/probe", (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });
  const url = parseUrl(req.query.url);
  if (!url) return res.status(400).json({ error: "missing or invalid url" });

  const probe = spawn("ffprobe", [
    "-user_agent", UPSTREAM_UA,
    "-loglevel", "error",
    "-print_format", "json",
    "-show_streams",
    "-timeout", "5000000", // 5s, in microseconds
    url,
  ]);

  let stdout = "";
  let stderr = "";
  probe.stdout.on("data", (d) => {
    stdout += d.toString();
  });
  probe.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  const timeout = setTimeout(() => {
    probe.kill("SIGKILL");
    res.status(504).json({ error: "probe timeout" });
  }, 8000);

  probe.on("close", (code) => {
    clearTimeout(timeout);
    if (code !== 0) {
      return res
        .status(502)
        .json({ error: "ffprobe failed", code, stderr: stderr.slice(0, 500) });
    }
    try {
      const data = JSON.parse(stdout);
      const summary = (data.streams || []).map((s) => ({
        type: s.codec_type,
        codec: s.codec_name,
        profile: s.profile,
        width: s.width,
        height: s.height,
        sample_rate: s.sample_rate,
        channels: s.channels,
      }));
      res.json({ streams: summary });
    } catch (e) {
      res.status(500).json({ error: "parse error", detail: String(e) });
    }
  });
});

// --- Transcoding ------------------------------------------------------------
app.get("/transcode", (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });
  const url = parseUrl(req.query.url);
  if (!url) return res.status(400).json({ error: "missing or invalid url" });

  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Connection", "keep-alive");

  // Try to copy video, transcode audio. Re-encode video to H.264 only if it
  // turns out to be HEVC (the most common offender). For a generic transcoder
  // we re-encode both — simpler, always works. CPU cost: ~1 core per 1080p
  // H.264 transcode.
  //
  // -tune zerolatency + ultrafast = lowest latency, smallest CPU spike
  // -g 60 + -sc_threshold 0 = predictable keyframe interval for smooth seek
  // -bsf:a aac_adtstoasc = needed when wrapping AAC in MPEG-TS
  const args = [
    "-hide_banner",
    "-loglevel", "warning",
    "-user_agent", UPSTREAM_UA,
    "-fflags", "+genpts+discardcorrupt+nobuffer",
    "-flags", "low_delay",
    "-rw_timeout", "10000000", // 10s read timeout
    "-i", url,
    // Video — re-encode to H.264 baseline-ish for max compatibility
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-tune", "zerolatency",
    "-profile:v", "main",
    "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-g", "60",
    "-sc_threshold", "0",
    "-b:v", "2500k",
    "-maxrate", "3000k",
    "-bufsize", "5000k",
    // Audio — always AAC stereo so Chrome / Firefox eat it happily
    "-c:a", "aac",
    "-ac", "2",
    "-b:a", "128k",
    "-ar", "48000",
    "-af", "aresample=async=1",
    // Container
    "-f", "mpegts",
    "-mpegts_copyts", "1",
    "pipe:1",
  ];

  const ff = spawn("ffmpeg", args);
  activeSessions++;
  totalServed++;
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(
    `[${sessionId}] start (active=${activeSessions}, total=${totalServed}) url=${url.slice(0, 80)}`
  );

  ff.stdout.pipe(res);

  // Surface ffmpeg warnings/errors in Railway logs so the user can debug
  let firstStderr = true;
  ff.stderr.on("data", (chunk) => {
    const line = chunk.toString().trim();
    if (firstStderr || /error|fatal|invalid|denied/i.test(line)) {
      console.error(`[${sessionId}] ffmpeg:`, line.slice(0, 300));
      firstStderr = false;
    }
  });

  function cleanup(reason) {
    if (ff.exitCode === null && !ff.killed) {
      try {
        ff.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
    activeSessions = Math.max(0, activeSessions - 1);
    console.log(
      `[${sessionId}] end (${reason}, active=${activeSessions})`
    );
  }

  ff.on("close", (code) => cleanup(`ffmpeg exit ${code}`));
  ff.on("error", (err) => {
    console.error(`[${sessionId}] spawn error:`, err.message);
    if (!res.headersSent) res.status(500).end();
    cleanup("spawn error");
  });

  // Kill the ffmpeg subprocess as soon as the client disconnects so we don't
  // leak CPU on Railway when the user closes the tab / changes channels.
  req.on("close", () => cleanup("client closed"));
});

app.listen(PORT, () => {
  console.log(`tristan-iptv-transcoder listening on :${PORT}`);
  console.log(`  secretProtected=${!!SECRET}`);
  console.log(`  upstreamUA="${UPSTREAM_UA}"`);
});
