"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  Music,
  Download,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { MediaItem } from "@/lib/types";
import { resolveServerUrl } from "@/lib/api";
import { formatDuration, getCleanTitle, formatBytes } from "@/lib/utils";

interface AudioPlayerModalProps {
  item: MediaItem;
  currentPath: string;
  onClose: () => void;
}

export function AudioPlayerModal({
  item,
  currentPath,
  onClose,
}: AudioPlayerModalProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const fileUrl = `${currentPath.endsWith("/") ? currentPath : currentPath + "/"}${item.url}`;
  const audioSrc = resolveServerUrl(fileUrl);
  const cleanTitle = getCleanTitle(item);

  const togglePlay = () => {
    const aud = audioRef.current;
    if (!aud) return;
    if (aud.paused) {
      aud.play().catch(console.error);
    } else {
      aud.pause();
    }
  };

  const handleSeek = (newTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleVolume = (vol: number) => {
    if (audioRef.current) {
      audioRef.current.volume = vol;
      audioRef.current.muted = vol === 0;
    }
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-full max-w-md bg-[#13131c] border border-white/10 rounded-2xl shadow-2xl p-4 text-white flex flex-col gap-3 animate-fade-in backdrop-blur-xl">
      <audio
        ref={audioRef}
        src={audioSrc}
        autoPlay
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onDurationChange={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
      />

      {/* Track info & Close */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
            <Music className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold truncate">{cleanTitle}</h4>
            <p className="text-xs text-slate-400">{formatBytes(item.size)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <a
            href={audioSrc}
            download
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            title="Download track"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress slider */}
      <div className="flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-white/10 rounded cursor-pointer"
        />
        <div className="flex justify-between text-[11px] text-slate-400 font-mono">
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSeek(currentTime - 10)}
            className="p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-white" />
            ) : (
              <Play className="w-4 h-4 fill-white translate-x-0.5" />
            )}
          </button>
          <button
            onClick={() => handleSeek(currentTime + 10)}
            className="p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleVolume(isMuted ? 1 : 0)}
            className="p-1.5 text-slate-400 hover:text-white"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolume(parseFloat(e.target.value))}
            className="w-16 h-1 bg-white/20 rounded cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

