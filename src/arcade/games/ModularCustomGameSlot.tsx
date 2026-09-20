import React, { useState } from 'react';
import { ArcadeGameProps } from '../types';
import { Sparkles, Code2, Globe, FileCode, CheckCircle2, X } from 'lucide-react';

export const ModularCustomGameSlot: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'preview'>('info');

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950 text-white font-mono select-none overflow-y-auto">
      {/* Marquee */}
      <div className="bg-gradient-to-r from-purple-950 via-neutral-900 to-indigo-950 border-b-2 border-purple-500/60 px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400 animate-spin" />
          <div>
            <h1 className="text-sm sm:text-xl font-black text-purple-300 tracking-wider">
              {machineName.toUpperCase()} <span className="hidden xs:inline text-[10px] px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-200 border border-purple-500/50">PORT</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-neutral-400">Modular Game Import Slot</p>
          </div>
        </div>

        <button
          type="button"
          id="btn-exit-modular-cabinet"
          onClick={onExit}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onExit();
          }}
          className="min-h-[44px] min-w-[44px] px-3 sm:px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-xs font-black transition shadow flex items-center gap-1.5 cursor-pointer"
        >
          <X className="w-4 h-4 text-purple-200" />
          <span>Exit</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 p-8 flex flex-col items-center justify-center max-w-3xl mx-auto text-center">
        <div className="w-20 h-20 rounded-2xl bg-purple-900/40 border-2 border-purple-500 flex items-center justify-center text-purple-300 mb-4 shadow-[0_0_30px_rgba(168,85,247,0.3)]">
          <Code2 className="w-10 h-10" />
        </div>

        <h2 className="text-3xl font-black text-white tracking-tight mb-2">
          Modular Arcade Expansion Port
        </h2>
        <p className="text-sm text-neutral-300 leading-relaxed max-w-xl mb-6">
          This cabinet is connected to the arcade's modular registration framework. Any custom WebGL, HTML5 Canvas, or React mini-game can be linked directly to this machine.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left mb-6">
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mb-2" />
            <h3 className="text-xs font-bold text-white uppercase">1. Isolated Runtime</h3>
            <p className="text-[11px] text-neutral-400 mt-1">Freezes 3D world, 0 CPU waste while active, restores cleanly upon exit.</p>
          </div>
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <Globe className="w-5 h-5 text-cyan-400 mb-2" />
            <h3 className="text-xs font-bold text-white uppercase">2. Universal Input</h3>
            <p className="text-[11px] text-neutral-400 mt-1">Full keyboard, mouse, and gamepad event binding without leaking into open-world controls.</p>
          </div>
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <FileCode className="w-5 h-5 text-amber-400 mb-2" />
            <h3 className="text-xs font-bold text-white uppercase">3. Simple Registry</h3>
            <p className="text-[11px] text-neutral-400 mt-1">Drop component into <code>src/arcade/registry.ts</code> to assign to any cabinet.</p>
          </div>
        </div>

        <div className="p-4 bg-neutral-900/90 rounded-xl border border-purple-500/30 text-left w-full font-mono text-xs text-neutral-300">
          <p className="text-purple-300 font-bold mb-1">// Quick Register Snippet:</p>
          <code>registerArcadeGame&#40;&#123; id: 'my_imported_game', title: 'My Game', component: MyGameComponent &#125;&#41;;</code>
        </div>
      </div>
    </div>
  );
};
