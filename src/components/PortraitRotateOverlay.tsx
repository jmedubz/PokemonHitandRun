import React from 'react';
import { Smartphone, Monitor } from 'lucide-react';

interface PortraitRotateOverlayProps {
  onSwitchToPcMode: () => void;
}

export const PortraitRotateOverlay: React.FC<PortraitRotateOverlayProps> = ({
  onSwitchToPcMode,
}) => {
  return (
    <div
      id="portrait-rotate-overlay"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/96 backdrop-blur-2xl p-6 text-center text-white select-none"
      style={{ touchAction: 'none' }}
    >
      {/* Animated Rotating Phone Illustration */}
      <div className="relative mb-8 flex items-center justify-center">
        <div className="absolute -inset-6 rounded-full bg-amber-500/10 blur-xl animate-pulse" />
        <div className="relative w-28 h-28 rounded-3xl border-2 border-amber-400/40 bg-slate-900/80 shadow-[0_0_30px_rgba(245,158,11,0.25)] flex items-center justify-center">
          <div className="animate-[spin_4s_ease-in-out_infinite] [animation-direction:alternate]">
            <Smartphone className="w-14 h-14 text-amber-400" strokeWidth={1.8} />
          </div>
        </div>
      </div>

      {/* Primary Message */}
      <h2 className="text-2xl sm:text-3xl font-black text-amber-300 tracking-tight leading-tight max-w-sm">
        Rotate your device to landscape to play
      </h2>

      {/* Subtext */}
      <p className="mt-3 text-sm text-slate-400 max-w-xs leading-relaxed">
        Pokémon Hit &amp; Run is engineered exclusively for widescreen landscape gameplay on iPhone and mobile devices.
      </p>

      {/* Manual switch to PC mode if testing or on desktop window */}
      <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col items-center gap-3">
        <span className="text-xs text-slate-500">Using a desktop or narrow browser window?</span>
        <button
          type="button"
          onClick={onSwitchToPcMode}
          onTouchEnd={(e) => {
            e.preventDefault();
            onSwitchToPcMode();
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 active:bg-slate-700 text-xs font-bold text-slate-300 transition flex items-center gap-2 shadow-sm cursor-pointer"
        >
          <Monitor className="w-4 h-4 text-amber-400" />
          Switch to PC Mode
        </button>
      </div>
    </div>
  );
};
