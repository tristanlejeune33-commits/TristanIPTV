"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls, {
  type ErrorData,
  type Level,
  type MediaPlaylist,
} from "hls.js";
import mpegts from "mpegts.js";
import type { StreamType } from "@/lib/stream";
import type { LangVariant } from "@/lib/classify";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCw,
  PictureInPicture2,
  Settings as SettingsIcon,
  Loader2,
  Subtitles,
  Languages,
  Gauge,
  Check,
  Rewind,
  FastForward,
  Upload,
  Keyboard,
  X,
  ArrowLeft,
} from "lucide-react";
import { toVttBlobUrl } from "@/lib/subtitles";

type ExternalSub = {
  id: string;
  label: string;
  blobUrl: string;
};

type Props = {
  src: string;
  poster?: string;
  /** Seek to this position (seconds) when the video is ready. Used for VOD resume. */
  startTime?: number;
  /** Hint that this is a VOD source (movie/episode) — enables seek bar, speed, etc. */
  isVod?: boolean;
  /** Stream type — picks the right engine (hls.js, mpegts.js or native). Default: "hls". */
  streamType?: StreamType;
  /** Free-form text (channel name + group) used to surface codec hints (HEVC, etc.). */
  codecHint?: string;
  /** Language packaging detected on the source (drives auto-subtitle behavior). */
  langVariant?: LangVariant | null;
  /** Default audio preference — "fr" picks the French dub if available. */
  preferredAudio?: "fr" | "original";
  /** Subtitle behavior: "off" never; "auto" on for VOSTFR; "always-fr" always show FR. */
  subtitleMode?: "off" | "auto" | "always-fr";
  /** When set, called when the user clicks "Essayer sans proxy" in an error state. */
  onTryDirect?: () => void;
  /** When set, called when the user clicks "Forcer HLS" — try hls.js even on .ts URLs. */
  onForceHls?: () => void;
  /** Title shown in the always-visible top bar (especially useful in fullscreen). */
  title?: string;
  /** Subtitle / context shown under the title in the top bar. */
  subtitle?: string;
  /** Optional back action — when provided, a back arrow appears in the top bar. */
  onBack?: () => void;
  /** Extra buttons rendered on the right side of the top bar (prev/next, favorite, etc.). */
  topActions?: React.ReactNode;
  onError?: (msg: string) => void;
  onTimeUpdate?: (seconds: number, duration: number) => void;
  /** Fires when playback reaches the end (used by the watch page for autoplay next). */
  onEnded?: () => void;
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const SKIP_SECONDS = 15;

type Panel = "none" | "quality" | "audio" | "subtitles" | "speed";

function fmt(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Player({
  src,
  poster,
  startTime,
  isVod,
  streamType = "hls",
  codecHint,
  langVariant,
  preferredAudio = "fr",
  subtitleMode = "auto",
  onTryDirect,
  onForceHls,
  title,
  subtitle,
  onBack,
  topActions,
  onError,
  onTimeUpdate,
  onEnded,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<ReturnType<typeof mpegts.createPlayer> | null>(null);
  const seekedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [buffering, setBuffering] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Tracks / quality
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [audioTracks, setAudioTracks] = useState<MediaPlaylist[]>([]);
  const [audioTrack, setAudioTrack] = useState(-1);
  const [subtitleTracks, setSubtitleTracks] = useState<MediaPlaylist[]>([]);
  const [subtitleTrack, setSubtitleTrack] = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1);

  // External subtitles (uploaded by user)
  const [externalSubs, setExternalSubs] = useState<ExternalSub[]>([]);
  const [activeExternalId, setActiveExternalId] = useState<string | null>(null);

  // Playback time
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [panel, setPanel] = useState<Panel>("none");
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<number | null>(null);
  const [seekFlash, setSeekFlash] = useState<{ side: "left" | "right"; nonce: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Detect MSE support for MPEG-TS once — derive a static capability flag
  const mpegtsSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return mpegts.getFeatureList().mseLivePlayback === true;
    } catch {
      return false;
    }
  }, []);
  const capabilityError =
    streamType === "mpegts" && !mpegtsSupported
      ? "MPEG-TS non supporté par ce navigateur (MSE indisponible)"
      : null;
  const displayedError = errorMsg ?? capabilityError;

  // Codec hints — most browsers can't play H.265/HEVC in MSE without OS-level
  // support. Detect from the channel name / group string AND only surface the
  // tip when the actual error looks codec-related (Media/Decode/Format), not
  // for plain network/URL failures.
  const hevcInName = useMemo(() => {
    if (!codecHint) return false;
    return /\b(hevc|h\.?265|x265)\b/i.test(codecHint);
  }, [codecHint]);
  const errorLooksCodec = useMemo(() => {
    if (!displayedError) return false;
    return /media|decode|format|codec|appendBuffer|addSourceBuffer|unsupported/i.test(
      displayedError
    );
  }, [displayedError]);
  // AC-3 / E-AC-3 (Dolby Digital) is used by most live IPTV channels but
  // Chrome / Firefox refuse it without OS-level licensing. Detect from the
  // actual error string (mpegts.js / MSE produce "audio/mp4;codecs=ac-3
  // unsupported" or similar).
  const showAc3Hint = useMemo(() => {
    if (!displayedError) return false;
    return /ac-?3|e-?ac-?3|dolby/i.test(displayedError);
  }, [displayedError]);
  const showHevcHint = hevcInName && errorLooksCodec;

  const subUploadRef = useRef<HTMLInputElement>(null);

  // Seek to startTime once the video is ready
  function trySeek() {
    const v = videoRef.current;
    if (!v || seekedRef.current) return;
    if (!startTime || startTime < 1) return;
    if (!Number.isFinite(v.duration) || v.duration === 0) return;
    if (startTime >= v.duration - 5) return;
    v.currentTime = startTime;
    seekedRef.current = true;
  }

  // Setup playback (HLS / MPEG-TS / native) based on streamType
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setErrorMsg(null);
    setBuffering(true);
    seekedRef.current = false;
    setLevels([]);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setCurrentLevel(-1);
    setAudioTrack(-1);
    setSubtitleTrack(-1);

    function destroyAll() {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        try {
          mpegtsRef.current.pause();
          mpegtsRef.current.unload();
          mpegtsRef.current.detachMediaElement();
          mpegtsRef.current.destroy();
        } catch {}
        mpegtsRef.current = null;
      }
    }

    // ------- MPEG-TS (live IPTV with raw .ts streams) -------
    if (streamType === "mpegts") {
      // Capability is checked at render time — `displayedError` will show the
      // unsupported message without us touching state here.
      if (!mpegts.getFeatureList().mseLivePlayback) return;

      const player = mpegts.createPlayer(
        {
          type: "mse",
          isLive: !isVod,
          url: src,
        },
        {
          enableWorker: true,
          enableStashBuffer: false, // lower latency for live
          lazyLoad: false,
          autoCleanupSourceBuffer: true,
          liveBufferLatencyChasing: !isVod,
          liveBufferLatencyMaxLatency: 4,
          liveBufferLatencyMinRemain: 0.5,
        }
      );
      mpegtsRef.current = player;
      player.attachMediaElement(video);
      player.load();

      player.on(
        mpegts.Events.ERROR,
        (type: string, detail: string, info?: { msg?: string; code?: number }) => {
          const extra = info?.msg ? ` — ${info.msg}` : "";
          const msg = `${type} · ${detail}${extra}`;
          setErrorMsg(msg);
          onError?.(msg);
        }
      );

      video.play().catch(() => {});

      return () => destroyAll();
    }

    // ------- Native (mp4/mkv/webm) -------
    if (streamType === "native") {
      video.src = src;
      video.play().catch(() => {});
      return () => destroyAll();
    }

    // ------- HLS (default) -------
    // Safari has native HLS support — use that.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return () => destroyAll();
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 20,
        maxMaxBufferLength: 60,
        startLevel: -1,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetry: 4,
        startFragPrefetch: true,
        renderTextTracksNatively: true,
      });
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls.levels ?? []);
        setCurrentLevel(hls.currentLevel);
        setAudioTracks(hls.audioTracks ?? []);
        setAudioTrack(hls.audioTrack);
        setSubtitleTracks(hls.subtitleTracks ?? []);
        setSubtitleTrack(hls.subtitleTrack);

        // --- Auto-apply user audio preference (pick French track if available) ---
        if (preferredAudio === "fr" && (hls.audioTracks?.length ?? 0) > 1) {
          const frIdx = hls.audioTracks.findIndex(
            (t) =>
              /^(fr|fra|fre)$/i.test(t.lang ?? "") ||
              /french|français|francais/i.test(t.name ?? "")
          );
          if (frIdx >= 0 && frIdx !== hls.audioTrack) {
            hls.audioTrack = frIdx;
            setAudioTrack(frIdx);
          }
        }

        // --- Auto-apply user subtitle preference ---
        const wantSubs =
          subtitleMode === "always-fr" ||
          (subtitleMode === "auto" && langVariant === "VOSTFR");
        if (wantSubs && (hls.subtitleTracks?.length ?? 0) > 0) {
          const frIdx = hls.subtitleTracks.findIndex((t) =>
            /^(fr|fra|fre)$/i.test(t.lang ?? "")
          );
          const targetIdx = frIdx >= 0 ? frIdx : 0;
          hls.subtitleTrack = targetIdx;
          hls.subtitleDisplay = true;
          setSubtitleTrack(targetIdx);
        } else if (subtitleMode === "off") {
          hls.subtitleTrack = -1;
          hls.subtitleDisplay = false;
          setSubtitleTrack(-1);
        }

        video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        setCurrentLevel(data.level);
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        setAudioTracks(hls.audioTracks ?? []);
        setAudioTrack(hls.audioTrack);
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) => {
        setAudioTrack(data.id);
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        setSubtitleTracks(hls.subtitleTracks ?? []);
        setSubtitleTrack(hls.subtitleTrack);
      });
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_e, data) => {
        setSubtitleTrack(data.id);
      });

      hls.on(Hls.Events.ERROR, (_e: unknown, data: ErrorData) => {
        if (!data.fatal) return;
        const msg = `Erreur lecteur (${data.type}/${data.details})`;
        setErrorMsg(msg);
        onError?.(msg);
        try {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.destroy();
          }
        } catch {
          // ignore
        }
      });

      return () => destroyAll();
    }

    // Last-resort fallback
    video.src = src;
    video.play().catch(() => {});
    return () => destroyAll();
  }, [src, streamType, isVod, retryNonce, onError]);

  // Native video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolume = () => {
      setMuted(video.muted);
      setVolume(video.volume);
    };
    const onTime = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime, video.duration);
    };
    const onDur = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onWait = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnterPip = () => setPip(true);
    const onLeavePip = () => setPip(false);
    const onLoadedMeta = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      trySeek();
    };
    const onRate = () => setPlaybackRate(video.playbackRate);
    const onEnd = () => onEnded?.();

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolume);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("waiting", onWait);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onPlaying);
    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("leavepictureinpicture", onLeavePip);
    video.addEventListener("loadedmetadata", onLoadedMeta);
    video.addEventListener("ratechange", onRate);
    video.addEventListener("ended", onEnd);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolume);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("waiting", onWait);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onPlaying);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("leavepictureinpicture", onLeavePip);
      video.removeEventListener("loadedmetadata", onLoadedMeta);
      video.removeEventListener("ratechange", onRate);
      video.removeEventListener("ended", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTimeUpdate, onEnded, startTime]);

  // Fullscreen state sync
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Auto-hide controls after inactivity (only while playing)
  function showControls() {
    setControlsVisible(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => {
      if (playing && panel === "none") setControlsVisible(false);
    }, 3000);
  }
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    };
  }, []);
  // Keep controls visible whenever the video is paused (no effect needed — derive
  // visibility in render via the `playing` state directly when reading it).
  const [lastPlaying, setLastPlaying] = useState(playing);
  if (lastPlaying !== playing) {
    setLastPlaying(playing);
    if (!playing) setControlsVisible(true);
  }

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
      }
    } catch {
      // ignore
    }
  }, []);

  function changeVolume(v: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, v));
    if (v > 0 && video.muted) video.muted = false;
  }

  function seek(seconds: number) {
    const v = videoRef.current;
    if (!v) return;
    if (!Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, seconds));
  }

  function skip(deltaSeconds: number) {
    const v = videoRef.current;
    if (!v) return;
    seek(v.currentTime + deltaSeconds);
    setSeekFlash({ side: deltaSeconds < 0 ? "left" : "right", nonce: Date.now() });
  }

  // Auto-hide the seek flash
  useEffect(() => {
    if (!seekFlash) return;
    const id = window.setTimeout(() => setSeekFlash(null), 500);
    return () => window.clearTimeout(id);
  }, [seekFlash]);

  function pickLevel(idx: number) {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = idx;
    setCurrentLevel(idx);
    setPanel("none");
  }

  function pickAudio(idx: number) {
    if (!hlsRef.current) return;
    hlsRef.current.audioTrack = idx;
    setAudioTrack(idx);
    setPanel("none");
  }

  function pickSubtitle(idx: number) {
    const hls = hlsRef.current;
    if (hls) {
      hls.subtitleTrack = idx;
      hls.subtitleDisplay = idx >= 0;
      setSubtitleTrack(idx);
    }
    // Disable any external subtitle while a HLS one is selected
    if (idx >= 0) {
      setActiveExternalId(null);
      setVideoTextTracks(null);
    }
    setPanel("none");
  }

  function pickExternalSubtitle(id: string | null) {
    setActiveExternalId(id);
    // Disable HLS subtitle if external is on
    const hls = hlsRef.current;
    if (hls && id !== null) {
      hls.subtitleTrack = -1;
      hls.subtitleDisplay = false;
      setSubtitleTrack(-1);
    }
    setVideoTextTracks(id);
    setPanel("none");
  }

  // Manage native video.textTracks for our externally-injected <track>s
  function setVideoTextTracks(activeId: string | null) {
    const v = videoRef.current;
    if (!v) return;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      // Our custom tracks carry their id in `id`; HLS-injected ones get a different label
      if (!t.id) continue;
      t.mode = t.id === activeId ? "showing" : "disabled";
    }
  }

  function pickRate(rate: number) {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
    setPanel("none");
  }

  async function onSubtitleFile(file: File) {
    try {
      const text = await file.text();
      const blobUrl = toVttBlobUrl(text);
      if (!blobUrl) {
        onError?.("Format de sous-titre non reconnu (utilise .srt ou .vtt)");
        return;
      }
      const id = `ext-${Date.now()}`;
      const entry: ExternalSub = { id, label: file.name.replace(/\.(srt|vtt)$/i, ""), blobUrl };
      setExternalSubs((arr) => [...arr, entry]);
      // Activate the new track on next paint (after the <track> element exists)
      requestAnimationFrame(() => pickExternalSubtitle(id));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Erreur de lecture du fichier");
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "p":
          e.preventDefault();
          togglePip();
          break;
        case "arrowup":
          e.preventDefault();
          changeVolume((videoRef.current?.volume ?? 0) + 0.1);
          break;
        case "arrowdown":
          e.preventDefault();
          changeVolume((videoRef.current?.volume ?? 0) - 0.1);
          break;
        case "j":
          if (isVod) {
            e.preventDefault();
            skip(-SKIP_SECONDS);
          }
          break;
        case "l":
          // L is reserved by the parent watch page for favorite — handled there.
          break;
        case "c":
          if (subtitleTracks.length > 0 || externalSubs.length > 0) {
            e.preventDefault();
            // Cycle: off -> first external -> first HLS -> ... -> off
            if (activeExternalId !== null) {
              const i = externalSubs.findIndex((s) => s.id === activeExternalId);
              if (i + 1 < externalSubs.length) pickExternalSubtitle(externalSubs[i + 1].id);
              else if (subtitleTracks.length > 0) pickSubtitle(0);
              else pickExternalSubtitle(null);
            } else if (subtitleTrack === -1) {
              if (externalSubs.length > 0) pickExternalSubtitle(externalSubs[0].id);
              else pickSubtitle(0);
            } else {
              const next =
                subtitleTrack + 1 >= subtitleTracks.length ? -1 : subtitleTrack + 1;
              pickSubtitle(next);
            }
          }
          break;
        case "?":
        case "h":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
        default:
          break;
      }
      showControls();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePlay, toggleMute, toggleFullscreen, togglePip, isVod, subtitleTracks, subtitleTrack, externalSubs, activeExternalId]);

  // Click-on-progress-bar to seek
  function onProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!isVod || duration === 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seek(pct * duration);
  }

  // Mobile double-tap zones (left = -10s, right = +10s)
  const lastTapRef = useRef<{ side: "left" | "right" | "center"; t: number } | null>(null);
  function onTapZone(side: "left" | "right") {
    if (!isVod) return;
    const now = Date.now();
    const prev = lastTapRef.current;
    if (prev && prev.side === side && now - prev.t < 350) {
      skip(side === "left" ? -10 : 10);
      lastTapRef.current = null;
      return;
    }
    lastTapRef.current = { side, t: now };
    // Single tap behaves like a click on video — toggle controls / play
    showControls();
  }

  // Subtitle progress bar position relative to resume mark (visual cue) — skip for now
  const hasMultiAudio = audioTracks.length > 1;
  const totalSubs = subtitleTracks.length + externalSubs.length;
  const hasSubs = totalSubs > 0 || isVod; // VOD allows upload even if no built-in
  const hasMultiQuality = levels.length > 1;

  // Build a list of HLS audio tracks with display labels — memoized
  const audioLabels = useMemo(
    () => audioTracks.map((t, idx) => ({ idx, label: labelForTrack(t) })),
    [audioTracks]
  );

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full bg-black group/player"
      onMouseMove={showControls}
      onMouseLeave={() => playing && panel === "none" && setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        controls={false}
        className="absolute inset-0 w-full h-full object-contain bg-black"
        onClick={togglePlay}
      >
        {externalSubs.map((s) => (
          <track
            key={s.id}
            id={s.id}
            kind="subtitles"
            label={s.label}
            srcLang="fr"
            src={s.blobUrl}
            default={activeExternalId === s.id}
          />
        ))}
      </video>

      {/* Mobile tap zones */}
      <div className="absolute inset-y-0 left-0 w-1/3 md:hidden" onClick={() => onTapZone("left")} />
      <div className="absolute inset-y-0 right-0 w-1/3 md:hidden" onClick={() => onTapZone("right")} />

      {/* Hidden subtitle file input */}
      <input
        ref={subUploadRef}
        type="file"
        accept=".srt,.vtt,text/vtt,text/srt,application/x-subrip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSubtitleFile(f);
          if (e.target) e.target.value = "";
        }}
      />

      {/* Seek flash (visual feedback for ±15s and double-tap) */}
      {seekFlash ? (
        <div
          key={seekFlash.nonce}
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${
            seekFlash.side === "left" ? "left-[20%]" : "right-[20%]"
          } seek-flash`}
        >
          <div className="bg-black/70 backdrop-blur rounded-full px-4 py-2 text-white text-sm font-mono flex items-center gap-2">
            {seekFlash.side === "left" ? (
              <>
                <Rewind size={16} />
                -{SKIP_SECONDS}s
              </>
            ) : (
              <>
                +{SKIP_SECONDS}s
                <FastForward size={16} />
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Buffering spinner */}
      {buffering && !displayedError ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3 bg-black/40 backdrop-blur-sm px-6 py-4 rounded-2xl">
            <Loader2 size={36} className="animate-spin text-white" />
            <span className="text-xs text-white/80 uppercase tracking-widest">
              Chargement…
            </span>
          </div>
        </div>
      ) : null}

      {displayedError ? (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/90 backdrop-blur-sm px-4">
          <div className="text-center max-w-lg w-full">
            <p className="text-red-300 mb-2 font-semibold text-lg">Lecture impossible</p>
            <p className="text-sm text-muted mb-4 font-mono break-words">
              {displayedError}
            </p>

            {showHevcHint ? (
              <div className="text-left text-sm bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-lg p-3 mb-4">
                <p className="font-semibold mb-1">
                  ⚠️ Cette chaîne est probablement encodée en HEVC (H.265)
                </p>
                <p className="text-xs text-amber-200/80">
                  Chrome et Firefox sur Windows ne décodent pas HEVC sans les
                  extensions OS payantes. Cherche la même chaîne dans un groupe
                  <code className="mx-1 px-1 bg-black/40 rounded">H264</code>
                  ou <code className="px-1 bg-black/40 rounded">SD/HD</code>{" "}
                  classique — elles marchent partout.
                </p>
              </div>
            ) : null}

            {showAc3Hint ? (
              <div className="text-left text-sm bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-lg p-3 mb-4">
                <p className="font-semibold mb-1">
                  🔊 Audio Dolby (AC-3) non supporté par ce navigateur
                </p>
                <p className="text-xs text-amber-200/80">
                  La vidéo se décode (H.264) mais Chrome / Firefox refusent
                  l&apos;audio AC-3 sans licence Dolby. C&apos;est très commun sur
                  les chaînes IPTV live. Solutions :
                </p>
                <ul className="text-xs text-amber-200/80 mt-2 ml-4 list-disc space-y-0.5">
                  <li>Ouvrir cette chaîne dans <strong>VLC</strong> (paste le lien M3U → chercher la chaîne)</li>
                  <li>Utiliser <strong>Safari</strong> (macOS / iOS) qui supporte AC-3 nativement</li>
                  <li>Chercher la même chaîne dans un autre bouquet avec audio AAC</li>
                  <li>Sur Android TV : utiliser <strong>IPTV Smarters</strong> ou <strong>TiviMate</strong> (décodeurs natifs)</li>
                </ul>
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setRetryNonce((n) => n + 1);
                }}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-foreground text-background font-semibold hover:bg-foreground/85 transition-colors"
              >
                <RotateCw size={14} />
                Réessayer
              </button>
              {onTryDirect ? (
                <button
                  type="button"
                  onClick={onTryDirect}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border bg-card hover:bg-card-hover text-sm transition-colors"
                  title="Essayer sans passer par le proxy local"
                >
                  Sans proxy
                </button>
              ) : null}
              {onForceHls && streamType === "mpegts" ? (
                <button
                  type="button"
                  onClick={onForceHls}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border bg-card hover:bg-card-hover text-sm transition-colors"
                  title="Essayer de lire avec hls.js (au cas où le flux est en réalité du HLS)"
                >
                  Essayer en HLS
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Top info bar — always visible when controls show, critical in fullscreen */}
      <div
        className={`absolute inset-x-0 top-0 z-20 transition-opacity duration-300 ${
          controlsVisible || !playing || panel !== "none"
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="bg-gradient-to-b from-black/85 via-black/40 to-transparent px-4 md:px-8 pt-3 pb-10 flex items-start gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Retour"
              className="shrink-0 h-10 w-10 grid place-items-center rounded-full bg-black/50 hover:bg-card-hover border border-white/15 text-white transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? (
              <h1 className="text-base md:text-xl font-bold text-white truncate drop-shadow">
                {title}
              </h1>
            ) : null}
            {subtitle ? (
              <p className="text-xs md:text-sm text-white/70 truncate">{subtitle}</p>
            ) : null}
          </div>
          {topActions ? <div className="shrink-0 flex items-center gap-2">{topActions}</div> : null}
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            aria-label="Raccourcis clavier"
            title="Raccourcis (?)"
            className="shrink-0 h-10 w-10 grid place-items-center rounded-full bg-black/50 hover:bg-card-hover border border-white/15 text-white transition-colors"
          >
            <Keyboard size={16} />
          </button>
        </div>
      </div>

      {/* Center primary controls — large, always-visible touch targets */}
      <div
        className={`absolute inset-0 z-10 grid place-items-center pointer-events-none transition-opacity duration-300 ${
          controlsVisible || !playing || panel !== "none"
            ? "opacity-100"
            : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-6 md:gap-10 pointer-events-auto">
          {isVod ? (
            <button
              type="button"
              onClick={() => skip(-SKIP_SECONDS)}
              aria-label={`Reculer de ${SKIP_SECONDS} secondes`}
              title={`-${SKIP_SECONDS}s (J)`}
              className="h-14 w-14 md:h-16 md:w-16 grid place-items-center rounded-full bg-black/40 hover:bg-black/70 backdrop-blur border border-white/20 text-white transition-all hover:scale-105 active:scale-95 relative"
            >
              <Rewind size={26} fill="currentColor" />
              <span className="absolute -bottom-1 right-1.5 text-[10px] font-bold bg-black/80 rounded px-1">
                {SKIP_SECONDS}
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Lecture"}
            className="h-16 w-16 md:h-20 md:w-20 grid place-items-center rounded-full bg-foreground text-background hover:bg-foreground/85 transition-all hover:scale-105 active:scale-95 shadow-2xl"
          >
            {playing ? (
              <Pause size={32} fill="currentColor" />
            ) : (
              <Play size={32} fill="currentColor" />
            )}
          </button>

          {isVod ? (
            <button
              type="button"
              onClick={() => skip(SKIP_SECONDS)}
              aria-label={`Avancer de ${SKIP_SECONDS} secondes`}
              title={`+${SKIP_SECONDS}s (L)`}
              className="h-14 w-14 md:h-16 md:w-16 grid place-items-center rounded-full bg-black/40 hover:bg-black/70 backdrop-blur border border-white/20 text-white transition-all hover:scale-105 active:scale-95 relative"
            >
              <FastForward size={26} fill="currentColor" />
              <span className="absolute -bottom-1 left-1.5 text-[10px] font-bold bg-black/80 rounded px-1">
                {SKIP_SECONDS}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Bottom controls overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 px-4 md:px-6 pb-3 pt-16 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
          controlsVisible || !playing || panel !== "none"
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Seek bar (VOD only) */}
        {isVod && duration > 0 ? (
          <div className="mb-3">
            <div
              role="slider"
              aria-label="Position de lecture"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={currentTime}
              onClick={onProgressClick}
              className="group/seek relative h-1.5 hover:h-2 transition-all rounded-full bg-white/20 cursor-pointer"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] group-hover/seek:bg-[var(--accent-hover)] transition-colors"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-[var(--accent)] opacity-0 group-hover/seek:opacity-100 transition-opacity shadow-lg"
                style={{ left: `calc(${(currentTime / duration) * 100}% - 6px)` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-white/70 font-mono">
              <span>{fmt(currentTime)}</span>
              <span>-{fmt(Math.max(0, duration - currentTime))}</span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Activer le son" : "Couper le son"}
            className="h-9 w-9 grid place-items-center rounded-full border border-white/15 bg-black/40 hover:bg-black/70 text-white transition-colors"
          >
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => changeVolume(parseFloat(e.target.value))}
            aria-label="Volume"
            className="w-24 accent-[var(--accent)] hidden md:block"
          />

          {isVod && duration > 0 ? (
            <span className="text-xs text-white/80 font-mono ml-1 hidden md:inline-block">
              {fmt(currentTime)} / {fmt(duration)}
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {hasMultiAudio ? (
              <ToolbarButton
                active={panel === "audio"}
                onClick={() => setPanel((p) => (p === "audio" ? "none" : "audio"))}
                aria-label="Pistes audio"
                title="Audio"
                icon={<Languages size={16} />}
                label={audioTrack >= 0 ? audioLabels[audioTrack]?.label ?? "" : ""}
              />
            ) : null}

            {hasSubs ? (
              <ToolbarButton
                active={
                  subtitleTrack !== -1 || activeExternalId !== null || panel === "subtitles"
                }
                onClick={() => setPanel((p) => (p === "subtitles" ? "none" : "subtitles"))}
                aria-label="Sous-titres"
                title="Sous-titres"
                icon={<Subtitles size={16} />}
                label={
                  activeExternalId
                    ? externalSubs.find((s) => s.id === activeExternalId)?.label ?? "Fichier"
                    : subtitleTrack >= 0
                      ? labelForTrack(subtitleTracks[subtitleTrack])
                      : "Off"
                }
              />
            ) : null}

            {isVod ? (
              <ToolbarButton
                active={panel === "speed"}
                onClick={() => setPanel((p) => (p === "speed" ? "none" : "speed"))}
                aria-label="Vitesse de lecture"
                title="Vitesse"
                icon={<Gauge size={16} />}
                label={`${playbackRate}×`}
              />
            ) : null}

            {hasMultiQuality ? (
              <ToolbarButton
                active={panel === "quality"}
                onClick={() => setPanel((p) => (p === "quality" ? "none" : "quality"))}
                aria-label="Qualité"
                title="Qualité"
                icon={<SettingsIcon size={16} />}
                label={currentLevel === -1 ? "Auto" : `${levels[currentLevel]?.height ?? "?"}p`}
              />
            ) : null}

            <button
              type="button"
              onClick={togglePip}
              aria-label="Picture-in-picture"
              className={`h-9 w-9 grid place-items-center rounded-full border transition-colors ${
                pip
                  ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "border-white/15 bg-black/40 hover:bg-black/70 text-white"
              }`}
            >
              <PictureInPicture2 size={16} />
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
              title="Plein écran (F)"
              className="h-9 px-3 grid place-items-center rounded-full border border-white/15 bg-black/40 hover:bg-black/70 text-white transition-colors text-xs gap-1.5 flex items-center"
            >
              {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              <span className="hidden md:inline">
                {fullscreen ? "Quitter" : "Plein écran"}
              </span>
            </button>
          </div>
        </div>

        {/* Panels */}
        {panel !== "none" ? (
          <div className="absolute right-4 md:right-6 bottom-20 w-64 bg-card border border-border rounded-xl shadow-2xl text-sm overflow-hidden z-30">
            <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-widest text-muted flex items-center justify-between">
              <span>
                {panel === "quality" && "Qualité"}
                {panel === "audio" && "Audio"}
                {panel === "subtitles" && "Sous-titres"}
                {panel === "speed" && "Vitesse"}
              </span>
              <button
                type="button"
                onClick={() => setPanel("none")}
                aria-label="Fermer"
                className="h-6 w-6 grid place-items-center rounded hover:bg-card-hover"
              >
                <X size={14} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {panel === "quality" && (
                <>
                  <Option label="Auto" active={currentLevel === -1} onClick={() => pickLevel(-1)} />
                  {levels
                    .map((lvl, idx) => ({ lvl, idx }))
                    .sort((a, b) => (b.lvl.height ?? 0) - (a.lvl.height ?? 0))
                    .map(({ lvl, idx }) => (
                      <Option
                        key={idx}
                        label={`${lvl.height ?? "?"}p · ${Math.round((lvl.bitrate ?? 0) / 1000)} kbps`}
                        active={currentLevel === idx}
                        onClick={() => pickLevel(idx)}
                      />
                    ))}
                </>
              )}

              {panel === "audio" &&
                audioTracks.map((t, idx) => (
                  <Option
                    key={idx}
                    label={labelForTrack(t)}
                    active={audioTrack === idx}
                    onClick={() => pickAudio(idx)}
                  />
                ))}

              {panel === "subtitles" && (
                <>
                  <Option
                    label="Désactivés"
                    active={subtitleTrack === -1 && activeExternalId === null}
                    onClick={() => {
                      pickSubtitle(-1);
                      pickExternalSubtitle(null);
                    }}
                  />
                  {subtitleTracks.map((t, idx) => (
                    <Option
                      key={`hls-${idx}`}
                      label={`${labelForTrack(t)} · embarqué`}
                      active={subtitleTrack === idx}
                      onClick={() => pickSubtitle(idx)}
                    />
                  ))}
                  {externalSubs.map((s) => (
                    <Option
                      key={s.id}
                      label={`${s.label} · fichier`}
                      active={activeExternalId === s.id}
                      onClick={() => pickExternalSubtitle(s.id)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => subUploadRef.current?.click()}
                    className="w-full text-left px-3 py-2.5 hover:bg-card-hover transition-colors flex items-center gap-2 text-[var(--accent)] border-t border-border mt-1"
                  >
                    <Upload size={14} />
                    Charger un fichier .srt / .vtt
                  </button>
                </>
              )}

              {panel === "speed" &&
                PLAYBACK_RATES.map((r) => (
                  <Option
                    key={r}
                    label={`${r}×`}
                    active={playbackRate === r}
                    onClick={() => pickRate(r)}
                  />
                ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Shortcuts cheat-sheet modal */}
      {showShortcuts ? (
        <div
          className="absolute inset-0 z-40 bg-black/80 backdrop-blur grid place-items-center p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-md w-full"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Keyboard size={18} /> Raccourcis clavier
              </h2>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="h-8 w-8 grid place-items-center rounded hover:bg-card-hover"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <Shortcut keys={["Espace", "K"]} label="Lecture / pause" />
              <Shortcut keys={["F"]} label="Plein écran" />
              <Shortcut keys={["M"]} label="Couper le son" />
              <Shortcut keys={["P"]} label="Picture-in-picture" />
              <Shortcut keys={["↑", "↓"]} label="Volume" />
              {isVod ? (
                <>
                  <Shortcut keys={["J", "L"]} label={`Reculer / avancer de ${SKIP_SECONDS}s`} />
                  <Shortcut keys={["← →"]} label="Épisode / chaîne précédent ou suivant" />
                </>
              ) : (
                <Shortcut keys={["← →"]} label="Chaîne précédente / suivante" />
              )}
              {hasSubs ? <Shortcut keys={["C"]} label="Cycler les sous-titres" /> : null}
              <Shortcut keys={["L (hors player)"]} label="Ajouter aux favoris" />
              <Shortcut keys={["?", "H"]} label="Afficher cette aide" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function labelForTrack(t: MediaPlaylist | undefined): string {
  if (!t) return "—";
  const name = t.name || t.lang || "Piste";
  const lang = t.lang ? ` (${t.lang.toUpperCase()})` : "";
  return name.includes(t.lang ?? "") ? name : `${name}${lang}`;
}

function ToolbarButton({
  active,
  onClick,
  icon,
  label,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  "aria-label"?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-3 rounded-full border transition-colors text-xs flex items-center gap-1.5 ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
          : "border-white/15 bg-black/40 hover:bg-black/70 text-white"
      }`}
      {...rest}
    >
      {icon}
      {label ? <span className="hidden md:inline truncate max-w-[100px]">{label}</span> : null}
    </button>
  );
}

function Option({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 hover:bg-card-hover transition-colors flex items-center justify-between gap-2 ${
        active ? "text-[var(--accent)]" : ""
      }`}
    >
      <span className="truncate">{label}</span>
      {active ? <Check size={14} className="shrink-0" /> : null}
    </button>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-background border border-border rounded-md">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="text-xs bg-card border border-border rounded px-1.5 py-0.5 font-mono"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}
