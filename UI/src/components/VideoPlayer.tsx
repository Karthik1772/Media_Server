"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Subtitles,
  Settings,
  X,
  Download,
  ExternalLink,
  Loader2,
  Sliders,
  UploadCloud,
  Check,
} from "lucide-react";
import { MediaItem, TracksResponse, AudioTrack, SubtitleTrack } from "@/lib/types";
import {
  fetchTracks,
  getSubtitleUrl,
  prepareAudioTrack,
  resolveServerUrl,
} from "@/lib/api";
import {
  formatDuration,
  getCleanTitle,
  cn,
} from "@/lib/utils";
import {
  savePlaybackPosition,
  getPlaybackPosition,
  clearPlaybackPosition,
} from "@/lib/storage";

interface VideoPlayerProps {
  item: MediaItem;
  currentPath: string;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

export function VideoPlayer({
  item,
  currentPath,
  onClose,
  onNext,
  onPrev,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [fitMode, setFitMode] = useState<"contain" | "cover" | "fill">("contain");
  const [isBuffering, setIsBuffering] = useState(true);

  // Resume state
  const [resumePrompt, setResumePrompt] = useState<{ time: number } | null>(null);

  // Tracks & Subtitles
  const [tracks, setTracks] = useState<TracksResponse | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<number>(0);
  const [activeSubtitle, setActiveSubtitle] = useState<string>("off");
  const [subtitleTracksList, setSubtitleTracksList] = useState<SubtitleTrack[]>([]);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [audioPrepMessage, setAudioPrepMessage] = useState("");

  // Subtitle styling
  const [subtitleSize, setSubtitleSize] = useState<"sm" | "md" | "lg">("md");
  const [subtitleDelay, setSubtitleDelay] = useState<number>(0);

  // Modals & Panels
  const [activePanel, setActivePanel] = useState<"tracks" | "speed" | "fit" | null>(null);

  // Skip indicator ripples
  const [skipNotice, setSkipNotice] = useState<{ type: "forward" | "backward"; count: number } | null>(null);

  const cleanTitle = getCleanTitle(item);
  const fileUrl = `${currentPath.endsWith("/") ? currentPath : currentPath + "/"}${item.url}`;
  const videoSrc = resolveServerUrl(fileUrl);

  // Load Tracks info from backend
  useEffect(() => {
    if (!item.key) return;
    let isMounted = true;
    fetchTracks(item.key)
      .then((data) => {
        if (!isMounted) return;
        setTracks(data);
        if (data.subtitles?.length) {
          setSubtitleTracksList(data.subtitles);
          const defaultSub = data.subtitles.find((s) => s.default);
          if (defaultSub) {
            setActiveSubtitle(defaultSub.id);
          }
        }
      })
      .catch((err) => {
        console.warn("No extra audio/subtitle tracks found or ffprobe unavailable", err);
      });

    return () => {
      isMounted = false;
    };
  }, [item.key]);

  // Check previous playback resume point
  useEffect(() => {
    if (item.key) {
      const pos = getPlaybackPosition(item.key);
      if (pos && pos.time > 15 && pos.percentage < 95) {
        setResumePrompt({ time: pos.time });
      }
    }
  }, [item.key]);

  // Handle Controls Timeout on Inactivity
  const triggerControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setActivePanel(null);
      }
    }, 3500);
  }, [isPlaying]);

  const handleMouseMove = () => {
    triggerControls();
  };

  // Play / Pause Toggle
  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (vid.paused) {
      vid.play().catch(console.error);
      audioRef.current?.play().catch(() => {});
    } else {
      vid.pause();
      audioRef.current?.pause();
    }
  }, []);

  // Seek
  const handleSeek = (newTime: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = Math.max(0, Math.min(newTime, duration));
    if (audioRef.current) {
      audioRef.current.currentTime = vid.currentTime;
    }
  };

  const skipSeconds = useCallback(
    (seconds: number) => {
      const vid = videoRef.current;
      if (!vid) return;
      handleSeek(vid.currentTime + seconds);
      setSkipNotice({
        type: seconds > 0 ? "forward" : "backward",
        count: Math.abs(seconds),
      });
      setTimeout(() => setSkipNotice(null), 700);
      triggerControls();
    },
    [duration, triggerControls]
  );

  // Volume
  const handleVolumeChange = (newVol: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    const clamped = Math.max(0, Math.min(1, newVol));
    vid.volume = clamped;
    vid.muted = clamped === 0;
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = clamped === 0;
    }
    setVolume(clamped);
    setIsMuted(clamped === 0);
  };

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isMuted) {
      vid.muted = false;
      if (audioRef.current) audioRef.current.muted = false;
      setIsMuted(false);
      setVolume(vid.volume || 1);
    } else {
      vid.muted = true;
      if (audioRef.current) audioRef.current.muted = true;
      setIsMuted(true);
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      switch (e.code) {
        case "Space":
        case "KeyK":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
        case "KeyJ":
          e.preventDefault();
          skipSeconds(-10);
          break;
        case "ArrowRight":
        case "KeyL":
          e.preventDefault();
          skipSeconds(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeChange(volume + 0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange(volume - 0.05);
          break;
        case "KeyM":
          e.preventDefault();
          toggleMute();
          break;
        case "KeyF":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "Escape":
          if (activePanel) {
            setActivePanel(null);
          } else if (!document.fullscreenElement) {
            onClose();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, skipSeconds, volume, isMuted, activePanel, onClose]);

  // Save Progress periodically
  useEffect(() => {
    if (!item.key || !duration || currentTime < 5) return;
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        savePlaybackPosition(item.key!, videoRef.current.currentTime, duration);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [item.key, currentTime, duration]);

  // Audio Track Selection
  const handleSelectAudio = async (trackIndex: number) => {
    setSelectedAudio(trackIndex);
    setActivePanel(null);

    const vid = videoRef.current;
    const aud = audioRef.current;
    if (!vid || !item.key) return;

    if (trackIndex === 0) {
      // Default video track
      vid.muted = isMuted;
      if (aud) {
        aud.pause();
        aud.src = "";
      }
      return;
    }

    // Secondary track extracted via audio-prepare
    try {
      setIsPreparingAudio(true);
      setAudioPrepMessage("Extracting audio stream...");
      const prep = await prepareAudioTrack(item.key, trackIndex);
      if (prep.ready && prep.url && aud) {
        vid.muted = true;
        aud.src = resolveServerUrl(prep.url);
        aud.currentTime = vid.currentTime;
        aud.volume = volume;
        if (!vid.paused) aud.play().catch(console.error);
      }
    } catch (err: any) {
      console.error("Audio preparation failed:", err);
      alert("Could not load alternate audio track: " + (err.message || "Unknown error"));
      setSelectedAudio(0);
      vid.muted = isMuted;
    } finally {
      setIsPreparingAudio(false);
      setAudioPrepMessage("");
    }
  };

  // Subtitle Selection
  const handleSelectSubtitle = (subId: string) => {
    setActiveSubtitle(subId);
    setActivePanel(null);

    const vid = videoRef.current;
    if (!vid) return;

    // Toggle native text tracks
    for (let i = 0; i < vid.textTracks.length; i++) {
      const track = vid.textTracks[i];
      if (subId === "off") {
        track.mode = "disabled";
      } else if (track.id === subId || track.label === subId) {
        track.mode = "showing";
      } else {
        track.mode = "disabled";
      }
    }
  };

  // Custom User Subtitle File Drop / Upload
  const handleCustomSubtitleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !videoRef.current) return;

    const url = URL.createObjectURL(file);
    const newTrack: SubtitleTrack = {
      id: "custom-" + Date.now(),
      label: file.name.replace(/\.[^.]+$/, ""),
      lang: "Custom",
      external: true,
    };

    setSubtitleTracksList((prev) => [...prev, newTrack]);
    setActiveSubtitle(newTrack.id);

    // Add track element dynamically
    const trackEl = document.createElement("track");
    trackEl.id = newTrack.id;
    trackEl.label = newTrack.label;
    trackEl.kind = "subtitles";
    trackEl.src = url;
    trackEl.default = true;
    videoRef.current.appendChild(trackEl);
    trackEl.track.mode = "showing";
    setActivePanel(null);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={videoSrc}
        playsInline
        autoPlay
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
            // Sync secondary audio if running
            if (audioRef.current && Math.abs(audioRef.current.currentTime - videoRef.current.currentTime) > 0.3) {
              audioRef.current.currentTime = videoRef.current.currentTime;
            }
          }
        }}
        onDurationChange={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration);
          }
        }}
        onProgress={() => {
          const vid = videoRef.current;
          if (vid && vid.buffered.length > 0) {
            setBufferedEnd(vid.buffered.end(vid.buffered.length - 1));
          }
        }}
        className={cn(
          "w-full h-full transition-all duration-200",
          fitMode === "contain" && "object-contain",
          fitMode === "cover" && "object-cover",
          fitMode === "fill" && "object-fill"
        )}
      >
        {/* Render available server subtitles */}
        {item.key &&
          subtitleTracksList.map((sub) => (
            <track
              key={sub.id}
              id={sub.id}
              label={sub.label || sub.lang}
              kind="subtitles"
              src={getSubtitleUrl(item.key!, sub.id)}
              default={activeSubtitle === sub.id}
            />
          ))}
      </video>

      {/* Secondary Audio for AAC extraction */}
      <audio ref={audioRef} preload="auto" />

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 flex flex-col items-center gap-2">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
            <span className="text-xs font-medium text-slate-300">Buffering media...</span>
          </div>
        </div>
      )}

      {/* Alternate Audio Processing Notice */}
      {isPreparingAudio && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30">
          <div className="px-4 py-2 rounded-xl bg-indigo-900/80 border border-indigo-500/30 text-white backdrop-blur-md flex items-center gap-2 shadow-xl">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-300" />
            <span className="text-xs font-semibold">{audioPrepMessage}</span>
          </div>
        </div>
      )}

      {/* Skip Feedback Notice */}
      {skipNotice && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="p-6 rounded-full bg-black/60 backdrop-blur-md border border-white/10 animate-fade-in flex items-center gap-2 text-white">
            {skipNotice.type === "forward" ? (
              <>
                <RotateCw className="w-8 h-8 text-indigo-400" />
                <span className="text-lg font-bold">+{skipNotice.count}s</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-8 h-8 text-indigo-400" />
                <span className="text-lg font-bold">-{skipNotice.count}s</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Resume Banner */}
      {resumePrompt && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 bg-black/80 border border-indigo-500/40 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4">
          <div className="text-xs">
            <p className="font-semibold text-slate-200">Resume Watching?</p>
            <p className="text-slate-400">Jump to {formatDuration(resumePrompt.time)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                handleSeek(resumePrompt.time);
                setResumePrompt(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md transition-colors"
            >
              Resume
            </button>
            <button
              onClick={() => {
                if (item.key) clearPlaybackPosition(item.key);
                setResumePrompt(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-slate-300 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-300 bg-gradient-to-t from-black/80 via-transparent to-black/60",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Top Bar: Title, VLC, Download, Close */}
        <div className="p-4 sm:p-6 flex items-center justify-between gap-4 pointer-events-auto">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-colors"
              title="Close player"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate drop-shadow-md">
                {cleanTitle}
              </h2>
              {item.year && (
                <span className="text-xs text-indigo-300 font-medium">
                  {item.year}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`vlc://${window?.location?.origin || ""}${fileUrl}`}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold text-white backdrop-blur-md transition-colors flex items-center gap-1.5"
              title="Launch in VLC media player"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>VLC</span>
            </a>
            <a
              href={fileUrl}
              download
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white backdrop-blur-md transition-colors"
              title="Download movie file"
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Bottom Bar: Seekbar & Controls */}
        <div className="p-4 sm:p-6 flex flex-col gap-3 pointer-events-auto">
          {/* Timeline / Seek Bar */}
          <div className="relative group/timeline w-full flex items-center py-2 cursor-pointer">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              className="w-full h-1.5 group-hover/timeline:h-2.5 bg-white/20 rounded-lg appearance-none cursor-pointer transition-all outline-none"
              style={{
                background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${
                  duration ? (currentTime / duration) * 100 : 0
                }%, rgba(255,255,255,0.3) ${
                  duration ? (currentTime / duration) * 100 : 0
                }%, rgba(255,255,255,0.3) ${
                  duration ? (bufferedEnd / duration) * 100 : 0
                }%, rgba(255,255,255,0.15) ${
                  duration ? (bufferedEnd / duration) * 100 : 0
                }%, rgba(255,255,255,0.15) 100%)`,
              }}
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between gap-4">
            {/* Left Controls: Play, Skip, Time, Volume */}
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={togglePlay}
                className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-white" />
                ) : (
                  <Play className="w-5 h-5 fill-white translate-x-0.5" />
                )}
              </button>

              <button
                onClick={() => skipSeconds(-10)}
                className="p-2 text-slate-300 hover:text-white transition-colors"
                title="Rewind 10s"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => skipSeconds(10)}
                className="p-2 text-slate-300 hover:text-white transition-colors"
                title="Forward 10s"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Time display */}
              <div className="text-xs font-medium text-slate-300 font-mono tracking-tight">
                <span>{formatDuration(currentTime)}</span>
                <span className="text-slate-500 mx-1">/</span>
                <span>{formatDuration(duration)}</span>
              </div>

              {/* Volume */}
              <div className="hidden sm:flex items-center gap-2 group/volume pl-2">
                <button
                  onClick={toggleMute}
                  className="p-1.5 text-slate-300 hover:text-white transition-colors"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-16 sm:w-20 h-1 bg-white/20 rounded cursor-pointer transition-all"
                />
              </div>
            </div>

            {/* Right Controls: Subtitles/Audio, Speed, Picture Fit, Fullscreen */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              {/* Audio & Subtitles Menu */}
              <div className="relative">
                <button
                  onClick={() =>
                    setActivePanel(activePanel === "tracks" ? null : "tracks")
                  }
                  className={cn(
                    "p-2 rounded-xl border transition-colors flex items-center gap-1 text-xs font-medium",
                    activeSubtitle !== "off" || selectedAudio !== 0
                      ? "bg-indigo-600/80 border-indigo-400 text-white"
                      : "bg-white/10 hover:bg-white/20 border-white/10 text-slate-300"
                  )}
                  title="Audio & Subtitles"
                >
                  <Subtitles className="w-4 h-4" />
                  <span className="hidden md:inline">Audio & Subs</span>
                </button>

                {/* Audio & Subtitles Dropdown Panel */}
                {activePanel === "tracks" && (
                  <div className="absolute bottom-12 right-0 w-72 sm:w-80 glass-dropdown rounded-2xl p-4 shadow-2xl text-xs flex flex-col gap-4 z-40 max-h-96 overflow-y-auto">
                    {/* Audio Section */}
                    <div>
                      <h4 className="font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Audio Track
                      </h4>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleSelectAudio(0)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors",
                            selectedAudio === 0
                              ? "bg-indigo-600 text-white font-semibold"
                              : "hover:bg-white/5 text-slate-300"
                          )}
                        >
                          <span>Original (Default Stream)</span>
                          {selectedAudio === 0 && <Check className="w-3.5 h-3.5" />}
                        </button>
                        {tracks?.audio?.map((aud) => (
                          <button
                            key={aud.index}
                            onClick={() => handleSelectAudio(aud.index)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors",
                              selectedAudio === aud.index
                                ? "bg-indigo-600 text-white font-semibold"
                                : "hover:bg-white/5 text-slate-300"
                            )}
                          >
                            <span>
                              {aud.label || aud.lang} ({aud.codec})
                            </span>
                            {selectedAudio === aud.index && (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Subtitle Section */}
                    <div className="border-t border-white/10 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-slate-400 uppercase tracking-wider">
                          Subtitles
                        </h4>
                        <label className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer flex items-center gap-1">
                          <UploadCloud className="w-3 h-3" />
                          <span>Add .srt/.vtt</span>
                          <input
                            type="file"
                            accept=".srt,.vtt"
                            onChange={handleCustomSubtitleFile}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleSelectSubtitle("off")}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors",
                            activeSubtitle === "off"
                              ? "bg-indigo-600 text-white font-semibold"
                              : "hover:bg-white/5 text-slate-300"
                          )}
                        >
                          <span>Off</span>
                          {activeSubtitle === "off" && (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {subtitleTracksList.map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => handleSelectSubtitle(sub.id)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors",
                              activeSubtitle === sub.id
                                ? "bg-indigo-600 text-white font-semibold"
                                : "hover:bg-white/5 text-slate-300"
                            )}
                          >
                            <span>{sub.label || sub.lang}</span>
                            {activeSubtitle === sub.id && (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Speed Button */}
              <div className="relative">
                <button
                  onClick={() =>
                    setActivePanel(activePanel === "speed" ? null : "speed")
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                  title="Playback speed"
                >
                  {playbackSpeed}x
                </button>

                {activePanel === "speed" && (
                  <div className="absolute bottom-12 right-0 glass-dropdown rounded-2xl p-2 shadow-2xl flex flex-col gap-1 z-40 w-28">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setPlaybackSpeed(s);
                          if (videoRef.current) videoRef.current.playbackRate = s;
                          if (audioRef.current) audioRef.current.playbackRate = s;
                          setActivePanel(null);
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-left text-xs font-medium transition-colors",
                          playbackSpeed === s
                            ? "bg-indigo-600 text-white"
                            : "hover:bg-white/10 text-slate-300"
                        )}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Picture Fit Toggle */}
              <button
                onClick={() => {
                  const modes: ("contain" | "cover" | "fill")[] = [
                    "contain",
                    "cover",
                    "fill",
                  ];
                  const nextIndex = (modes.indexOf(fitMode) + 1) % modes.length;
                  setFitMode(modes[nextIndex]);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white capitalize transition-colors hidden sm:block"
                title="Picture mode: Contain / Cover / Fill"
              >
                {fitMode}
              </button>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-colors"
                title="Toggle Fullscreen (F)"
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4" />
                ) : (
                  <Maximize className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

