import React, { useEffect, useRef } from 'react';
import { ArcadeGameProps } from '../types';

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
        onClick={onExit}
        className="absolute z-[100] top-3 left-1/2 -translate-x-1/2 rounded-lg border border-white/30 bg-black/75 px-4 py-2 text-xs font-black tracking-wider text-white shadow-lg backdrop-blur-sm transition hover:bg-black/90"
        aria-label="Exit Redline Rush and return to the arcade"
      >
        EXIT ARCADE
      </button>
    </div>
  );
};
