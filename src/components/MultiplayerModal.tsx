import React, { useState, useEffect } from 'react';
import { Users, Copy, Check, LogOut, Play, ShieldAlert, Wifi, Sparkles } from 'lucide-react';
import { MultiplayerClientState } from '../game/multiplayerManager';

interface MultiplayerModalProps {
  mpState: MultiplayerClientState;
  onClose: () => void;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (code: string, playerName: string) => void;
  onLeaveRoom: () => void;
  defaultPlayerName: string;
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  mpState,
  onClose,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  defaultPlayerName,
}) => {
  const [tab, setTab] = useState<'host' | 'join'>('host');
  const [hostName, setHostName] = useState(defaultPlayerName || 'Trainer');
  const [joinName, setJoinName] = useState(defaultPlayerName || 'Player 2');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (defaultPlayerName && defaultPlayerName !== 'Trainer') {
      setHostName((prev) => (prev === 'Trainer' || !prev.trim() ? defaultPlayerName : prev));
      setJoinName((prev) => (prev === 'Player 2' || !prev.trim() ? defaultPlayerName : prev));
    }
  }, [defaultPlayerName]);

  const handleCopyCode = () => {
    if (mpState.roomCode) {
      navigator.clipboard.writeText(mpState.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateRoom(hostName.trim() || 'Trainer');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    onJoinRoom(joinCode.trim().toUpperCase(), joinName.trim() || 'Player 2');
  };

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-[min(560px,calc(100vw-2rem))] rounded-3xl border-2 border-indigo-400/70 bg-slate-950/95 p-6 text-white shadow-[0_0_60px_rgba(99,102,241,0.25)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/40">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-[0.25em] text-indigo-400 select-none">Multiplayer</div>
              <div className="text-xl font-black tracking-tight select-none">Full World Online</div>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-multiplayer-modal"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800 hover:text-white select-none cursor-pointer"
          >
            Close (ESC)
          </button>
        </div>

        {mpState.lastError && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-500/50 bg-rose-500/10 p-3 text-xs font-bold text-rose-300">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{mpState.lastError}</span>
          </div>
        )}

        {/* ACTIVE SESSION VIEW */}
        {mpState.isInRoom ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-indigo-500/40 bg-indigo-950/30 p-4 text-center">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-300 select-none">
                {mpState.isHost ? 'You are Hosting' : 'Connected to Host'}
              </div>
              <div className="mt-2 flex items-center justify-center gap-3">
                <span className="font-mono text-3xl font-black tracking-widest text-amber-300 select-text">
                  {mpState.roomCode}
                </span>
                <button
                  type="button"
                  id="btn-copy-room-code"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 rounded-xl border border-indigo-400/60 bg-indigo-500/20 px-3 py-1.5 text-xs font-bold text-indigo-200 transition hover:bg-indigo-500/30 select-none cursor-pointer"
                  title="Copy Room Code"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-400 select-none">
                Give this code to a friend so they can join your exact world and explore with you!
              </div>
            </div>

            {/* Players List */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                <span>Connected Players ({mpState.playerCount})</span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <Wifi className="h-3 w-3" /> Live
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-slate-800/80 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{mpState.localPlayerName} (You)</span>
                    {mpState.isHost && (
                      <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-black text-amber-300 select-none">
                        HOST
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 select-none">Active</span>
                </div>
                {mpState.players.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-800/50 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{p.name}</span>
                      {p.isHost && (
                        <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-black text-amber-300 select-none">
                          HOST
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 capitalize select-none">{p.characterId}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* In-game Pause Info */}
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-[11px] text-amber-200/90 select-none">
              💡 <b>Multiplayer Note:</b> While in multiplayer, opening this pause menu only disables your local controls so other players can continue playing in real time.
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                id="btn-resume-multiplayer"
                onClick={onClose}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/60 bg-emerald-500/20 py-3.5 text-sm font-black text-emerald-200 transition hover:bg-emerald-500/30 select-none cursor-pointer"
              >
                <Play className="h-4 w-4" />
                <span>Resume Game</span>
              </button>
              <button
                type="button"
                id="btn-leave-multiplayer"
                onClick={onLeaveRoom}
                className="flex items-center justify-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/15 px-5 py-3.5 text-sm font-black text-rose-300 transition hover:bg-rose-500/25 select-none cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Leave</span>
              </button>
            </div>
          </div>
        ) : (
          /* CREATE OR JOIN TABS */
          <div className="mt-5">
            {/* Tabs */}
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-1 select-none">
              <button
                type="button"
                id="tab-multiplayer-host"
                onClick={() => setTab('host')}
                className={`rounded-xl py-2 text-xs font-black transition cursor-pointer ${
                  tab === 'host' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                HOST GAME
              </button>
              <button
                type="button"
                id="tab-multiplayer-join"
                onClick={() => setTab('join')}
                className={`rounded-xl py-2 text-xs font-black transition cursor-pointer ${
                  tab === 'join' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                JOIN GAME
              </button>
            </div>

            {tab === 'host' ? (
              <form onSubmit={handleCreate} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="input-host-player-name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 select-none">
                    Your Player Name
                  </label>
                  <input
                    id="input-host-player-name"
                    type="text"
                    maxLength={16}
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Escape') {
                        e.currentTarget.blur();
                      }
                    }}
                    onKeyUp={(e) => e.stopPropagation()}
                    placeholder="Enter display name"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40 select-text cursor-text transition"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3.5 text-xs text-slate-300 space-y-1 select-none">
                  <div className="font-black text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Full Open-World Hosting
                  </div>
                  <p className="text-slate-400">
                    Creates a room code using your current game world. Other players can join directly and freely explore the entire map (Springfield, Goldenrod, Airport, Highway, Cars, and Aircraft).
                  </p>
                </div>

                <button
                  type="submit"
                  id="btn-create-multiplayer-room"
                  disabled={mpState.isConnecting}
                  className="w-full rounded-2xl border border-indigo-400/60 bg-indigo-600 px-5 py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-50 select-none cursor-pointer"
                >
                  {mpState.isConnecting ? 'Creating Room…' : 'Create Room & Host'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleJoin} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="input-join-player-name" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 select-none">
                    Your Player Name
                  </label>
                  <input
                    id="input-join-player-name"
                    type="text"
                    maxLength={16}
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Escape') {
                        e.currentTarget.blur();
                      }
                    }}
                    onKeyUp={(e) => e.stopPropagation()}
                    placeholder="Enter display name"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40 select-text cursor-text transition"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="input-join-room-code" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 select-none">
                    Room Code
                  </label>
                  <input
                    id="input-join-room-code"
                    type="text"
                    maxLength={8}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Escape') {
                        e.currentTarget.blur();
                      }
                    }}
                    onKeyUp={(e) => e.stopPropagation()}
                    placeholder="e.g. HAWK7"
                    className="w-full uppercase font-mono tracking-widest text-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg font-black text-amber-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40 select-text cursor-text transition"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3.5 text-xs text-slate-400 select-none">
                  Enter the 5-character session code provided by the host. You will spawn safely into the host's existing world!
                </div>

                <button
                  type="submit"
                  id="btn-join-multiplayer-room"
                  disabled={mpState.isConnecting || !joinCode.trim()}
                  className="w-full rounded-2xl border border-emerald-400/60 bg-emerald-600 px-5 py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-emerald-500 disabled:opacity-50 select-none cursor-pointer"
                >
                  {mpState.isConnecting ? 'Connecting…' : 'Join Session'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
