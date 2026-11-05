"use client";

import React from "react";

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="px-4 py-2 rounded-full shadow-2xl border border-white/10 text-xs font-medium text-white flex items-center gap-2 bg-[#12131a]/95 backdrop-blur-xl animate-fadeIn">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        {message}
      </div>
    </div>
  );
}
