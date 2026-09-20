import React, { useEffect, useRef, useState } from 'react';
import { ArcadeGameProps } from '../types';
import { Volume2, VolumeX, RotateCcw, Swords, Shield, Award, X } from 'lucide-react';

export const CyberBrawlerGame: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const [playerHp, setPlayerHp] = useState(100);
  const [opponentHp, setOpponentHp] = useState(100);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [fightState, setFightState] = useState<'ready' | 'fighting' | 'player_win' | 'player_ko'>('ready');
  const [playerStance, setPlayerStance] = useState<'idle' | 'punch_left' | 'punch_right' | 'block' | 'dodge_left' | 'dodge_right'>('idle');
  const [opponentStance, setOpponentStance] = useState<'idle' | 'windup' | 'punch' | 'hit' | 'block'>('idle');
  const [combatText, setCombatText] = useState('ROUND 1 - FIGHT!');

  const audioCtxRef = useRef<AudioContext | null>(null);

  const playSfx = (type: 'hit' | 'block' | 'ko' | 'whiff') => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;

      if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'block') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(240, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'ko') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.4);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'whiff') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.09);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.09);
      }
    } catch {}
  };

  const resetFight = () => {
    setPlayerHp(100);
    setOpponentHp(100);
    setFightState('fighting');
    setCombo(0);
    setCombatText('FIGHT!');
  };

  const handlePunch = (side: 'left' | 'right') => {
    if (fightState !== 'fighting') return;
    setPlayerStance(side === 'left' ? 'punch_left' : 'punch_right');

    setTimeout(() => {
      setPlayerStance('idle');
    }, 180);

    if (opponentStance === 'block') {
      playSfx('block');
      setCombatText('BLOCKED!');
      setCombo(0);
    } else {
      playSfx('hit');
      const dmg = 12 + Math.floor(Math.random() * 8);
      setOpponentStance('hit');
      setTimeout(() => setOpponentStance('idle'), 220);

      setCombo((c) => c + 1);
      setScore((s) => s + dmg * 10);
      setCombatText(`${side.toUpperCase()} JAB! -${dmg}`);

      setOpponentHp((prev) => {
        const next = Math.max(0, prev - dmg);
        if (next <= 0) {
          playSfx('ko');
          setFightState('player_win');
          setCombatText('K.O.! YOU WIN!');
        }
        return next;
      });
    }
  };

  const handleBlock = () => {
    if (fightState !== 'fighting') return;
    setPlayerStance('block');
    playSfx('block');
    setTimeout(() => setPlayerStance('idle'), 350);
  };

  const handleDodge = (side: 'left' | 'right') => {
    if (fightState !== 'fighting') return;
    setPlayerStance(side === 'left' ? 'dodge_left' : 'dodge_right');
    playSfx('whiff');
    setTimeout(() => setPlayerStance('idle'), 350);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (fightState === 'ready' && e.code === 'Space') {
        resetFight();
        return;
      }
      if (fightState !== 'fighting') return;

      if (e.code === 'KeyJ' || e.code === 'KeyZ') handlePunch('left');
      if (e.code === 'KeyK' || e.code === 'KeyX') handlePunch('right');
      if (e.code === 'KeyS' || e.code === 'ArrowDown') handleBlock();
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') handleDodge('left');
      if (e.code === 'KeyD' || e.code === 'ArrowRight') handleDodge('right');
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fightState, opponentStance]);

  // Opponent AI Attack Loop
  useEffect(() => {
    if (fightState !== 'fighting') return;

    const interval = setInterval(() => {
      const roll = Math.random();
      if (roll < 0.4) {
        // Opponent winds up
        setOpponentStance('windup');
        setCombatText('WATCH OUT! INCOMING HOOK!');

        setTimeout(() => {
          setOpponentStance('punch');
          // Check player defense
          setPlayerStance((curStance) => {
            if (curStance === 'block') {
              playSfx('block');
              setCombatText('BLOCKED!');
            } else if (curStance === 'dodge_left' || curStance === 'dodge_right') {
              playSfx('whiff');
              setCombatText('DODGED! COUNTER NOW!');
            } else {
              playSfx('hit');
              const dmg = 15 + Math.floor(Math.random() * 10);
              setCombatText(`OUCH! -${dmg}`);
              setPlayerHp((prev) => {
                const next = Math.max(0, prev - dmg);
                if (next <= 0) {
                  playSfx('ko');
                  setFightState('player_ko');
                  setCombatText('KNOCKED OUT! TRY AGAIN!');
                }
                return next;
              });
            }
            return curStance;
          });

          setTimeout(() => setOpponentStance('idle'), 250);
        }, 550);
      } else if (roll < 0.7) {
        // Opponent blocks
        setOpponentStance('block');
        setTimeout(() => setOpponentStance('idle'), 600);
      }
    }, 1800);

    return () => clearInterval(interval);
  }, [fightState]);

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950 text-white font-mono select-none overflow-y-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-900 via-neutral-900 to-amber-950 border-b-2 border-amber-500/70 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Swords className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 animate-pulse" />
          <div>
            <h1 className="text-sm sm:text-xl font-black text-amber-300 italic tracking-wider">
              CYBER PUNCHOUT <span className="hidden xs:inline text-[10px] px-1.5 py-0.5 rounded bg-amber-600/30 text-amber-200 border border-amber-500/50">ARCADE</span>
            </h1>
            <p className="text-[10px] sm:text-xs text-neutral-400">Title Bout • Championship</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="text-[10px] sm:text-xs text-neutral-300">
            SCORE: <span className="text-amber-300 font-bold">{score}</span>
          </div>
          <button
            onClick={resetFight}
            onTouchEnd={(e) => {
              e.preventDefault();
              resetFight();
            }}
            className="min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-600 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rematch</span>
          </button>
          <button
            onClick={onExit}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onExit();
            }}
            className="min-h-[44px] min-w-[44px] px-3 sm:px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-xs font-black transition flex items-center gap-1 cursor-pointer shadow-[0_0_15px_rgba(225,29,72,0.5)]"
            title="Exit Arcade Cabinet"
          >
            <X className="w-4 h-4" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Ring Stage */}
      <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 relative bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.15),transparent_70%)] min-h-0">
        {/* Health Bars */}
        <div className="w-full max-w-xl flex items-center justify-between gap-4 sm:gap-8 mb-3 sm:mb-6">
          <div className="flex-1">
            <div className="flex justify-between text-[11px] sm:text-xs font-bold mb-1">
              <span className="text-cyan-400">PLAYER</span>
              <span className="text-neutral-300">{playerHp}%</span>
            </div>
            <div className="h-3.5 sm:h-4 bg-neutral-800 rounded-full overflow-hidden border border-cyan-500/40">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-150"
                style={{ width: `${playerHp}%` }}
              />
            </div>
          </div>

          <div className="px-2.5 py-0.5 bg-amber-950/80 rounded-lg border border-amber-500 text-amber-300 font-black text-xs sm:text-sm">
            VS
          </div>

          <div className="flex-1 text-right">
            <div className="flex justify-between text-[11px] sm:text-xs font-bold mb-1">
              <span className="text-neutral-300">{opponentHp}%</span>
              <span className="text-rose-400">CYBER MOE</span>
            </div>
            <div className="h-3.5 sm:h-4 bg-neutral-800 rounded-full overflow-hidden border border-rose-500/40">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-red-600 transition-all duration-150 ml-auto"
                style={{ width: `${opponentHp}%` }}
              />
            </div>
          </div>
        </div>

        {/* Combat Announcement Banner */}
        <div className="px-4 sm:px-6 py-1 rounded-full bg-neutral-900/90 border border-amber-500/60 text-amber-300 font-black text-xs sm:text-sm mb-3 sm:mb-6 shadow-lg tracking-wider animate-pulse">
          {combatText}
        </div>

        {/* The Boxing Ring Visual Canvas */}
        <div className="relative w-full max-w-lg h-52 sm:h-64 rounded-2xl border-4 border-amber-600/40 bg-gradient-to-b from-neutral-900 via-neutral-950 to-amber-950/30 flex items-center justify-center overflow-hidden shadow-2xl">
          {/* Ring Ropes */}
          <div className="absolute inset-x-0 top-12 sm:top-16 h-1 bg-red-600/60 shadow-[0_0_8px_#ef4444]" />
          <div className="absolute inset-x-0 top-22 sm:top-28 h-1 bg-blue-600/60 shadow-[0_0_8px_#3b82f6]" />
          <div className="absolute inset-x-0 top-32 sm:top-40 h-1 bg-white/40" />

          {/* Opponent Sprite/Avatar */}
          <div
            className={`relative flex flex-col items-center transition-all duration-150 ${
              opponentStance === 'hit'
                ? 'translate-x-4 scale-95 opacity-80'
                : opponentStance === 'windup'
                ? '-translate-y-2 scale-110'
                : opponentStance === 'punch'
                ? 'translate-y-4 scale-125 text-red-500'
                : ''
            }`}
          >
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-b from-amber-600 to-amber-800 border-2 border-amber-400 flex items-center justify-center text-3xl sm:text-4xl shadow-xl">
              {opponentStance === 'hit' ? '😵' : opponentStance === 'windup' ? '😡' : opponentStance === 'punch' ? '💥' : opponentStance === 'block' ? '🛡️' : '🥊'}
            </div>
            <div className="mt-1.5 text-[10px] sm:text-xs font-bold text-neutral-300 bg-neutral-900/80 px-2 py-0.5 rounded border border-neutral-700">
              {opponentStance.toUpperCase()}
            </div>
          </div>

          {/* Player Gloves in Foreground */}
          <div className="absolute bottom-2 inset-x-0 flex justify-between px-10 sm:px-16 pointer-events-none">
            <div
              className={`text-4xl sm:text-5xl transition-all duration-100 ${
                playerStance === 'punch_left'
                  ? '-translate-y-12 sm:-translate-y-16 translate-x-6 sm:translate-x-8 scale-125'
                  : playerStance === 'block'
                  ? 'translate-x-8 sm:translate-x-12 -translate-y-4 sm:-translate-y-6'
                  : ''
              }`}
            >
              🥊
            </div>
            <div
              className={`text-4xl sm:text-5xl transition-all duration-100 ${
                playerStance === 'punch_right'
                  ? '-translate-y-12 sm:-translate-y-16 -translate-x-6 sm:-translate-x-8 scale-125'
                  : playerStance === 'block'
                  ? '-translate-x-8 sm:-translate-x-12 -translate-y-4 sm:-translate-y-6'
                  : ''
              }`}
            >
              🥊
            </div>
          </div>
        </div>

        {/* Interactive Controls Bar */}
        <div className="mt-4 flex flex-wrap gap-2 sm:gap-3 justify-center">
          <button
            onClick={() => handlePunch('left')}
            onTouchEnd={(e) => {
              e.preventDefault();
              handlePunch('left');
            }}
            className="min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-500 font-bold text-xs shadow-md active:scale-95 cursor-pointer"
          >
            Left Jab [J]
          </button>
          <button
            onClick={() => handlePunch('right')}
            onTouchEnd={(e) => {
              e.preventDefault();
              handlePunch('right');
            }}
            className="min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 active:bg-cyan-500 font-bold text-xs shadow-md active:scale-95 cursor-pointer"
          >
            Right Cross [K]
          </button>
          <button
            onClick={handleBlock}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleBlock();
            }}
            className="min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-600 active:bg-indigo-500 font-bold text-xs shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Guard [S]</span>
          </button>
          <button
            onClick={() => handleDodge('left')}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleDodge('left');
            }}
            className="min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 font-bold text-xs shadow-md active:scale-95 cursor-pointer"
          >
            Dodge L [A]
          </button>
          <button
            onClick={() => handleDodge('right')}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleDodge('right');
            }}
            className="min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 font-bold text-xs shadow-md active:scale-95 cursor-pointer"
          >
            Dodge R [D]
          </button>
        </div>
      </div>
    </div>
  );
};
