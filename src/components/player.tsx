"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls, { type ErrorData, type Level } from "hls.js";
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
} from "lucide-react";

type Props = {
  src: string;
  poster?: string;
  /** Seek to this position (seconds) when the video is ready. Used for VOD resume. */
  startTime?: number;
  onError?: (msg: string) => void;
  onTimeUpdate?: (seconds: number, duration: number) => void;
};

export function Player({ src, poster, startTime, onError, onTimeUpdate }: Props) {
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
  const [levels, setLevels] = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showLevels, setShowLevels] = useState(false);

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

    // Native HLS (Safari/iOS)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      });
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls.levels ?? []);
        setCurrentLevel(hls.currentLevel);
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        setCurrentLevel(data.level);
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
    const onTime = () => onTimeUpdate?.(video.currentTime, video.duration);
    const onWait = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnterPip = () => setPip(true);
    const onLeavePip = () => setPip(false);
    const onLoadedMeta = () => trySeek();

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolume);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("waiting", onWait);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onPlaying);
    video.addEventListener("enterpictureinpicture", onEnterPip);
    video.addEventListener("leavepictureinpicture", onLeavePip);
    video.addEventListener("loadedmetadata", onLoadedMeta);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolume);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("waiting", onWait);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onPlaying);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      video.removeEventListener("leavepictureinpicture", onLeavePip);
      video.removeEventListener("loadedmetadata", onLoadedMeta);
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

  function pickLevel(idx: number) {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = idx;
    setCurrentLevel(idx);
    setShowLevels(false);
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
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleMute, toggleFullscreen, togglePip]);

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
          <Loader2 size={40} className="animate-spin text-white/70" />
        </div>
      ) : null}

      {errorMsg ? (
        <div className="absolute inset-0 grid place-items-center bg-black/80 backdrop-blur-sm">
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
      <div className="controls-fade absolute inset-x-0 bottom-0 p-4 md:p-6 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover/player:opacity-100 focus-within:opacity-100">
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
            className="w-28 accent-[var(--accent)] hidden md:block"
          />

          <div className="ml-auto flex items-center gap-2">
            {levels.length > 1 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowLevels((v) => !v)}
                  aria-label="Qualité"
                  className="h-10 px-3 rounded-full border border-border bg-black/50 hover:bg-card-hover transition-colors text-xs flex items-center gap-1.5"
                >
                  <SettingsIcon size={14} />
                  {currentLevel === -1 ? "Auto" : `${levels[currentLevel]?.height ?? "?"}p`}
                </button>

                {showLevels ? (
                  <div className="absolute right-0 bottom-12 w-44 bg-card border border-border rounded-lg shadow-xl py-1 text-sm">
                    <LevelOption
                      label="Auto"
                      active={currentLevel === -1}
                      onClick={() => pickLevel(-1)}
                    />
                    {levels
                      .map((lvl, idx) => ({ lvl, idx }))
                      .sort((a, b) => (b.lvl.height ?? 0) - (a.lvl.height ?? 0))
                      .map(({ lvl, idx }) => (
                        <LevelOption
                          key={idx}
                          label={`${lvl.height ?? "?"}p · ${Math.round((lvl.bitrate ?? 0) / 1000)} kbps`}
                          active={currentLevel === idx}
                          onClick={() => pickLevel(idx)}
                        />
                      ))}
                  </div>
                ) : null}
              </div>
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

        <p className="text-[10px] text-muted/80 mt-3 hidden md:block">
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5">Espace</kbd> lecture ·
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5 ml-1">M</kbd> muet ·
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5 ml-1">F</kbd> plein écran ·
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5 ml-1">P</kbd> PiP ·
          <kbd className="bg-background/80 border border-border rounded px-1.5 py-0.5 ml-1">↑↓</kbd> volume
        </p>
      </div>
    </div>
  );
}

function LevelOption({
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
      className={`w-full text-left px-3 py-2 hover:bg-card-hover transition-colors flex items-center justify-between ${
        active ? "text-[var(--accent)]" : ""
      }`}
    >
      {label}
      {active ? <span className="text-xs">✓</span> : null}
    </button>
  );
}
