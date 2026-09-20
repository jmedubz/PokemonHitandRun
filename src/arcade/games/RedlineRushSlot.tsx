import React, { useEffect, useRef } from 'react';
import { ArcadeGameProps } from '../types';
import { X } from 'lucide-react';

export const RedlineRushSlot: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onExit();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onExit]);

  const handleGameLoad = () => {
    // Redline Rush is served from the same site, so we can also listen for Esc
    // inside the iframe while the game itself has keyboard focus.
    try {
      const gameWindow = iframeRef.current?.contentWindow;
      if (!gameWindow) return;

      gameWindow.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onExit();
        }
      });

      gameWindow.focus();
    } catch {
      // The visible Exit Arcade button remains available if iframe access is blocked.
    }
  };

  return (
    <div className="relative w-full h-full min-h-0 bg-black overflow-hidden">
      <iframe
        ref={iframeRef}
        src="/importedGames/RedlineRush/index.html"
        title={machineName || 'Redline Rush'}
        className="absolute inset-0 w-full h-full border-0 bg-black"
        allow="autoplay; fullscreen"
        allowFullScreen
        onLoad={handleGameLoad}
      />

      <button
        type="button"
        id="btn-exit-redline-rush"
        onClick={onExit}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onExit();
        }}
        className="absolute z-[100] top-3 right-4 min-h-[44px] rounded-xl border border-rose-400/60 bg-rose-950/85 hover:bg-rose-900 active:bg-rose-800 px-3.5 py-2 text-xs font-black tracking-wider text-rose-100 shadow-[0_0_15px_rgba(225,29,72,0.4)] backdrop-blur-md transition flex items-center gap-1.5 cursor-pointer"
        aria-label="Exit Redline Rush and return to the arcade"
      >
        <X className="w-4 h-4 text-rose-300" />
        <span>EXIT ARCADE</span>
      </button>
    </div>
  );
};
