"use client";

import React from "react";

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
      <div className="glass-strong px-5 py-2.5 rounded-full text-sm font-medium text-white flex items-center gap-2.5 animate-toastIn">
        <span className="w-2 h-2 rounded-full bg-gradient-to-r from-[#ff2d78] to-[#7c3aed] shadow-[0_0_10px_rgba(255,45,120,0.8)]" />
        {message}
      </div>
    </div>
  );
}
