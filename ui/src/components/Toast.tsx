"use client";

import React from "react";

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="glass px-5 py-2.5 rounded-full shadow-2xl border border-white/10 text-sm font-medium text-white flex items-center gap-2 bg-[#151522]/90 backdrop-blur-xl animate-toastIn">
        <span className="w-2 h-2 rounded-full bg-gradient-to-r from-[#ff2d78] to-[#7c3aed]" />
        {message}
      </div>
    </div>
  );
}

