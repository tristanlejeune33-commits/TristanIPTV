"use client";

import { useEffect, useRef, useState } from "react";
import Hls, { type ErrorData } from "hls.js";
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCw } from "lucide-react";

type Props = {
  src: string;
  poster?: string;
  onError?: (msg: string) => void;
  onTimeUpdate?: (seconds: number) => void;
};

export function Player({ src, poster, onError, onTimeUpdate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setErrorMsg(null);

    // Native HLS support (Safari/iOS)
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
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_e: unknown, data: ErrorData) => {
        if (data.fatal) {
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
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // Try native fallback for non-HLS (mp4, etc.)
    video.src = src;
    video.play().catch(() => {});
  }, [src, retryNonce, onError]);

  // Wire native events for UI state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolume = () => setMuted(video.muted);
    const onTime = () => onTimeUpdate?.(video.currentTime);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolume);
    video.addEventListener("timeupdate", onTime);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolume);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [onTimeUpdate]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }

  function fullscreen() {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      v.requestFullscreen().catch(() => {});
    }
  }

  return (
    <div className="relative w-full h-full bg-black group/player">
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        controls={false}
        className="w-full h-full object-contain bg-black"
      />

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
        <div className="flex items-center gap-3">
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
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <div className="ml-auto">
            <button
              type="button"
              onClick={fullscreen}
              aria-label="Plein écran"
              className="h-10 w-10 grid place-items-center rounded-full border border-border bg-black/50 hover:bg-card-hover transition-colors"
            >
              <Maximize size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
