"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls, {
  type ErrorData,
  type Level,
  type MediaPlaylist,
} from "hls.js";
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
} from "lucide-react";

type Props = {
  src: string;
  poster?: string;
  /** Seek to this position (seconds) when the video is ready. Used for VOD resume. */
  startTime?: number;
  /** Hint that this is a VOD source (movie/episode) — enables seek bar, speed, etc. */
  isVod?: boolean;
  onError?: (msg: string) => void;
  onTimeUpdate?: (seconds: number, duration: number) => void;
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

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
  onError,
  onTimeUpdate,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
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

  // Playback time
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [panel, setPanel] = useState<Panel>("none");

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

  // Setup HLS / native playback
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

    // Native HLS (Safari/iOS)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return;
    }

    if (Hls.isSupported()) {
      // Fast-start tuning: small initial buffer, allow quick start at lowest level,
      // then ABR ramps up. Lower latency and faster perceived startup.
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 20,
        maxMaxBufferLength: 60,
        startLevel: -1, // let ABR pick — but the first fragment loads immediately
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

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // Non-HLS fallback
    video.src = src;
    video.play().catch(() => {});
  }, [src, retryNonce, onError]);

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTimeUpdate, startTime]);

  // Fullscreen state sync
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

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
    if (!hls) return;
    hls.subtitleTrack = idx;
    hls.subtitleDisplay = idx >= 0;
    setSubtitleTrack(idx);
    setPanel("none");
  }

  function pickRate(rate: number) {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
    setPanel("none");
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
            seek((videoRef.current?.currentTime ?? 0) - 10);
          }
          break;
        case "l":
          // L is reserved for favorite in the parent watch page — skip when VOD
          // seek is the only handler intended in the player itself.
          break;
        case "c":
          // toggle subtitles off/on (cycle through tracks)
          if (subtitleTracks.length > 0) {
            e.preventDefault();
            const next =
              subtitleTrack === -1
                ? 0
                : subtitleTrack + 1 >= subtitleTracks.length
                  ? -1
                  : subtitleTrack + 1;
            pickSubtitle(next);
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleMute, toggleFullscreen, togglePip, isVod, subtitleTracks, subtitleTrack]);

  // Click-on-progress-bar to seek
  function onProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!isVod || duration === 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seek(pct * duration);
  }

  const hasMultiAudio = audioTracks.length > 1;
  const hasSubs = subtitleTracks.length > 0;
  const hasMultiQuality = levels.length > 1;

  return (
    <div ref={wrapperRef} className="relative w-full h-full bg-black group/player">
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        controls={false}
        className="w-full h-full object-contain bg-black"
        onClick={togglePlay}
      />

      {buffering && !errorMsg ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3 bg-black/40 backdrop-blur-sm px-6 py-4 rounded-2xl">
            <Loader2 size={36} className="animate-spin text-white" />
            <span className="text-xs text-white/80 uppercase tracking-widest">
              Chargement…
            </span>
          </div>
        </div>
      ) : null}

      {errorMsg ? (
        <div className="absolute inset-0 grid place-items-center bg-black/85 backdrop-blur-sm">
          <div className="text-center max-w-md px-6">
            <p className="text-red-300 mb-2 font-semibold">Lecture impossible</p>
            <p className="text-sm text-muted mb-4">{errorMsg}</p>
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
          </div>
        </div>
      ) : null}

      {/* Controls overlay */}
      <div className="controls-fade absolute inset-x-0 bottom-0 p-4 md:p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent opacity-0 group-hover/player:opacity-100 focus-within:opacity-100">
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
              className="group/seek relative h-1.5 rounded-full bg-white/20 cursor-pointer"
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

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Lecture"}
            className="h-11 w-11 grid place-items-center rounded-full bg-foreground text-background hover:bg-foreground/85 transition-colors"
          >
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Activer le son" : "Couper le son"}
            className="h-10 w-10 grid place-items-center rounded-full border border-border bg-black/50 hover:bg-card-hover transition-colors"
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

          <div className="ml-auto flex items-center gap-2">
            {hasMultiAudio ? (
              <ToolbarButton
                active={panel === "audio"}
                onClick={() => setPanel((p) => (p === "audio" ? "none" : "audio"))}
                aria-label="Pistes audio"
                title="Audio"
                icon={<Languages size={16} />}
                label={audioTrack >= 0 ? labelForTrack(audioTracks[audioTrack]) : ""}
              />
            ) : null}

            {hasSubs ? (
              <ToolbarButton
                active={subtitleTrack !== -1 || panel === "subtitles"}
                onClick={() => setPanel((p) => (p === "subtitles" ? "none" : "subtitles"))}
                aria-label="Sous-titres"
                title="Sous-titres"
                icon={<Subtitles size={16} />}
                label={subtitleTrack >= 0 ? labelForTrack(subtitleTracks[subtitleTrack]) : "Off"}
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
              className={`h-10 w-10 grid place-items-center rounded-full border transition-colors ${
                pip
                  ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "border-border bg-black/50 hover:bg-card-hover"
              }`}
            >
              <PictureInPicture2 size={16} />
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
              className="h-10 w-10 grid place-items-center rounded-full border border-border bg-black/50 hover:bg-card-hover transition-colors"
            >
              {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </div>

        {/* Panels */}
        {panel !== "none" ? (
          <div className="absolute right-4 md:right-6 bottom-20 w-60 bg-card border border-border rounded-xl shadow-2xl text-sm overflow-hidden">
            <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-widest text-muted">
              {panel === "quality" && "Qualité"}
              {panel === "audio" && "Audio"}
              {panel === "subtitles" && "Sous-titres"}
              {panel === "speed" && "Vitesse"}
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {panel === "quality" && (
                <>
                  <Option
                    label="Auto"
                    active={currentLevel === -1}
                    onClick={() => pickLevel(-1)}
                  />
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
                    active={subtitleTrack === -1}
                    onClick={() => pickSubtitle(-1)}
                  />
                  {subtitleTracks.map((t, idx) => (
                    <Option
                      key={idx}
                      label={labelForTrack(t)}
                      active={subtitleTrack === idx}
                      onClick={() => pickSubtitle(idx)}
                    />
                  ))}
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

        <p className="text-[10px] text-muted/80 mt-3 hidden md:block">
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5">Espace</kbd> lecture ·
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5 ml-1">M</kbd> muet ·
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5 ml-1">F</kbd> plein écran ·
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5 ml-1">P</kbd> PiP ·
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5 ml-1">↑↓</kbd> volume
          {isVod ? (
            <>
              {" · "}
              <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5">J/L</kbd> -10s/+10s
            </>
          ) : null}
          {hasSubs ? (
            <>
              {" · "}
              <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5">C</kbd> sous-titres
            </>
          ) : null}
        </p>
      </div>
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
      className={`h-10 px-3 rounded-full border transition-colors text-xs flex items-center gap-1.5 ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)]"
          : "border-border bg-black/50 hover:bg-card-hover"
      }`}
      {...rest}
    >
      {icon}
      {label ? <span className="hidden md:inline">{label}</span> : null}
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
