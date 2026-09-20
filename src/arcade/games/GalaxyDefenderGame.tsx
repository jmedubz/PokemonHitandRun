import React, { useEffect, useRef, useState } from 'react';
import { ArcadeGameProps } from '../types';
import { Volume2, VolumeX, RotateCcw, X, ArrowLeft, ArrowRight, Zap } from 'lucide-react';

interface Invader {
  x: number;
  y: number;
  type: number;
  alive: boolean;
  width: number;
  height: number;
}

interface Bullet {
  x: number;
  y: number;
  fromPlayer: boolean;
  vy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
}

export const GalaxyDefenderGame: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(12850);
  const [lives, setLives] = useState(3);
  const [wave, setWave] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const soundMutedRef = useRef(false);
  soundMutedRef.current = soundMuted;
  const keysRef = useRef<Record<string, boolean>>({});

  const audioCtxRef = useRef<AudioContext | null>(null);

  const playChiptune = (type: 'laser' | 'boom' | 'invader' | 'start') => {
    if (soundMuted) return;
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
      if (type === 'laser') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'boom') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'invader') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch {}
  };

  const initGameRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let playerX = canvas.width / 2;
    const playerY = canvas.height - 40;
    const playerSpeed = 320;
    let canShootTimer = 0;
    const bullets: Bullet[] = [];
    const particles: Particle[] = [];
    const stars: { x: number; y: number; s: number; b: number }[] = [];

    // Init stars
    for (let i = 0; i < 90; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        s: 0.5 + Math.random() * 2,
        b: 0.3 + Math.random() * 0.7,
      });
    }

    let invaders: Invader[] = [];
    let invaderDir = 1;
    let invaderSpeed = 38;
    let invaderDropPending = false;
    let invaderStepTimer = 0;

    const setupWave = (w: number) => {
      invaders = [];
      const rows = 4;
      const cols = 8;
      const startX = 60;
      const startY = 60;
      const spacingX = 48;
      const spacingY = 36;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          invaders.push({
            x: startX + c * spacingX,
            y: startY + r * spacingY,
            type: r % 3,
            alive: true,
            width: 28,
            height: 20,
          });
        }
      }
      invaderSpeed = 35 + w * 10;
      invaderDir = 1;
    };

    const resetGame = () => {
      setScore(0);
      setLives(3);
      setWave(1);
      setGameOver(false);
      setupWave(1);
      bullets.length = 0;
      particles.length = 0;
      playerX = canvas.width / 2;
    };

    initGameRef.current = resetGame;
    setupWave(1);

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'KeyR' && gameOver) {
        resetGame();
      }
      if (e.code === 'Escape') {
        onExit();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Update Stars
      for (const s of stars) {
        s.y += s.s * 40 * dt;
        if (s.y > canvas.height) {
          s.y = 0;
          s.x = Math.random() * canvas.width;
        }
      }

      if (!gameOver) {
        const keys = keysRef.current;
        // Player movement
        if (keys['KeyA'] || keys['ArrowLeft']) {
          playerX = Math.max(25, playerX - playerSpeed * dt);
        }
        if (keys['KeyD'] || keys['ArrowRight']) {
          playerX = Math.min(canvas.width - 25, playerX + playerSpeed * dt);
        }

        // Firing
        canShootTimer -= dt;
        if ((keys['Space'] || keys['KeyJ']) && canShootTimer <= 0) {
          bullets.push({
            x: playerX,
            y: playerY - 14,
            fromPlayer: true,
            vy: -480,
          });
          canShootTimer = 0.22;
          playChiptune('laser');
        }

        // Invaders march
        invaderStepTimer += dt;
        let leftmost = 9999;
        let rightmost = -9999;
        let aliveCount = 0;

        for (const inv of invaders) {
          if (!inv.alive) continue;
          aliveCount++;
          if (inv.x < leftmost) leftmost = inv.x;
          if (inv.x + inv.width > rightmost) rightmost = inv.x + inv.width;
        }

        if (aliveCount === 0) {
          // Next wave
          setWave((w) => {
            const nextW = w + 1;
            setupWave(nextW);
            return nextW;
          });
        }

        if (invaderDropPending) {
          for (const inv of invaders) {
            inv.y += 18;
            if (inv.alive && inv.y + inv.height >= playerY) {
              setGameOver(true);
              playChiptune('boom');
            }
          }
          invaderDropPending = false;
          invaderDir *= -1;
          invaderSpeed *= 1.05;
        } else {
          for (const inv of invaders) {
            inv.x += invaderDir * invaderSpeed * dt;
          }
          if (rightmost >= canvas.width - 20 || leftmost <= 20) {
            invaderDropPending = true;
          }
        }

        // Alien shooting randomly
        if (Math.random() < 0.025 * dt * aliveCount) {
          const livingInvaders = invaders.filter((i) => i.alive);
          if (livingInvaders.length > 0) {
            const shooter = livingInvaders[Math.floor(Math.random() * livingInvaders.length)];
            bullets.push({
              x: shooter.x + shooter.width / 2,
              y: shooter.y + shooter.height,
              fromPlayer: false,
              vy: 220,
            });
            playChiptune('invader');
          }
        }

        // Update bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.y += b.vy * dt;

          if (b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
            continue;
          }

          if (b.fromPlayer) {
            // Hit invader?
            for (const inv of invaders) {
              if (
                inv.alive &&
                b.x >= inv.x &&
                b.x <= inv.x + inv.width &&
                b.y >= inv.y &&
                b.y <= inv.y + inv.height
              ) {
                inv.alive = false;
                bullets.splice(i, 1);
                playChiptune('boom');

                // Explosion particles
                for (let p = 0; p < 12; p++) {
                  particles.push({
                    x: inv.x + inv.width / 2,
                    y: inv.y + inv.height / 2,
                    vx: (Math.random() - 0.5) * 160,
                    vy: (Math.random() - 0.5) * 160,
                    color: inv.type === 0 ? '#00e5ff' : inv.type === 1 ? '#ff0055' : '#ffff00',
                    life: 0.35,
                  });
                }

                setScore((s) => {
                  const newS = s + (inv.type === 0 ? 30 : inv.type === 1 ? 20 : 10);
                  setHighScore((h) => Math.max(h, newS));
                  return newS;
                });
                break;
              }
            }
          } else {
            // Hit player?
            const dist = Math.hypot(b.x - playerX, b.y - playerY);
            if (dist < 18) {
              bullets.splice(i, 1);
              playChiptune('boom');

              for (let p = 0; p < 20; p++) {
                particles.push({
                  x: playerX,
                  y: playerY,
                  vx: (Math.random() - 0.5) * 220,
                  vy: (Math.random() - 0.5) * 220,
                  color: '#38bdf8',
                  life: 0.5,
                });
              }

              setLives((l) => {
                const nextL = l - 1;
                if (nextL <= 0) {
                  setGameOver(true);
                }
                return nextL;
              });
            }
          }
        }
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }

      // RENDER
      ctx.fillStyle = '#050714';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Stars
      for (const s of stars) {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.b})`;
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }

      // Invaders
      for (const inv of invaders) {
        if (!inv.alive) continue;
        const color = inv.type === 0 ? '#00e5ff' : inv.type === 1 ? '#ff0077' : '#ffea00';
        ctx.fillStyle = color;

        // Retro pixelated shape
        ctx.fillRect(inv.x + 4, inv.y, inv.width - 8, 4);
        ctx.fillRect(inv.x, inv.y + 4, inv.width, 10);
        ctx.fillRect(inv.x + 2, inv.y + 14, 6, 6);
        ctx.fillRect(inv.x + inv.width - 8, inv.y + 14, 6, 6);

        // Eyes
        ctx.fillStyle = '#050714';
        ctx.fillRect(inv.x + 6, inv.y + 6, 4, 4);
        ctx.fillRect(inv.x + inv.width - 10, inv.y + 6, 4, 4);
      }

      // Player Ship
      if (!gameOver || lives > 0) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(playerX, playerY - 14);
        ctx.lineTo(playerX - 16, playerY + 12);
        ctx.lineTo(playerX - 6, playerY + 8);
        ctx.lineTo(playerX + 6, playerY + 8);
        ctx.lineTo(playerX + 16, playerY + 12);
        ctx.closePath();
        ctx.fill();

        // Cockpit
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(playerX - 3, playerY - 4, 6, 6);
      }

      // Bullets
      for (const b of bullets) {
        ctx.fillStyle = b.fromPlayer ? '#38bdf8' : '#ef4444';
        ctx.shadowColor = b.fromPlayer ? '#38bdf8' : '#ef4444';
        ctx.shadowBlur = 6;
        ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
        ctx.shadowBlur = 0;
      }

      // Particles
      for (const p of particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
      }

      // Game Over Overlay
      if (gameOver) {
        ctx.fillStyle = 'rgba(5, 7, 20, 0.78)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0055';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '16px monospace';
        ctx.fillText('PRESS [R] TO INSERT COIN & RESTART', canvas.width / 2, canvas.height / 2 + 30);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      cancelAnimationFrame(animId);
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, [gameOver, soundMuted]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white font-mono select-none overflow-y-auto">
      {/* Marquee Header */}
      <div className="bg-gradient-to-r from-blue-950 via-indigo-900 to-purple-950 border-b-2 border-cyan-400 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2 sm:gap-4">
          <h1 className="text-sm sm:text-xl font-black text-cyan-300 tracking-wider">
            GALAXY DEFENDER <span className="hidden xs:inline text-[10px] text-cyan-400 border border-cyan-400 px-1.5 py-0.5 rounded ml-1">1983</span>
          </h1>
          <div className="flex items-center gap-3 sm:gap-6 text-[10px] sm:text-xs text-slate-300">
            <div>SCORE: <span className="text-amber-300 font-bold">{score}</span></div>
            <div>SHIPS: <span className="text-rose-400 font-bold">{'▲'.repeat(Math.max(0, lives))}</span></div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <button
            onClick={() => setSoundMuted(!soundMuted)}
            onTouchEnd={(e) => {
              e.preventDefault();
              setSoundMuted(!soundMuted);
            }}
            className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs flex items-center justify-center text-slate-300 cursor-pointer"
            title="Toggle Audio"
          >
            {soundMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
          <button
            onClick={() => initGameRef.current()}
            onTouchEnd={(e) => {
              e.preventDefault();
              initGameRef.current();
            }}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
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

      {/* Screen Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 bg-slate-900/50 min-h-0">
        <div className="relative border-4 border-slate-700 rounded-xl overflow-hidden shadow-2xl bg-black max-w-full max-h-[55vh] aspect-[14/13]">
          <canvas ref={canvasRef} width={560} height={520} className="w-full h-full block cursor-crosshair object-contain" />
        </div>

        {/* On-Screen Mobile Controls */}
        <div className="mt-2.5 flex items-center justify-between w-full max-w-sm px-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onPointerDown={() => { keysRef.current['KeyA'] = true; }}
              onPointerUp={() => { keysRef.current['KeyA'] = false; }}
              onPointerLeave={() => { keysRef.current['KeyA'] = false; }}
              className="w-13 h-13 rounded-2xl border-2 border-cyan-400/70 bg-cyan-600/30 active:bg-cyan-500/70 text-white flex items-center justify-center shadow-lg cursor-pointer select-none"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onPointerDown={() => { keysRef.current['KeyD'] = true; }}
              onPointerUp={() => { keysRef.current['KeyD'] = false; }}
              onPointerLeave={() => { keysRef.current['KeyD'] = false; }}
              className="w-13 h-13 rounded-2xl border-2 border-cyan-400/70 bg-cyan-600/30 active:bg-cyan-500/70 text-white flex items-center justify-center shadow-lg cursor-pointer select-none"
            >
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>

          <button
            type="button"
            onPointerDown={() => { keysRef.current['Space'] = true; }}
            onPointerUp={() => { keysRef.current['Space'] = false; }}
            onPointerLeave={() => { keysRef.current['Space'] = false; }}
            className="w-15 h-15 rounded-full border-2 border-rose-400/80 bg-rose-600/40 active:bg-rose-500/80 text-white flex flex-col items-center justify-center shadow-xl cursor-pointer select-none"
          >
            <Zap className="w-5 h-5 text-yellow-300" />
            <span className="text-[8px] font-black">FIRE</span>
          </button>
        </div>
      </div>

      {/* Footer Controls Bar */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 sm:px-6 py-2 flex items-center justify-between text-[11px] sm:text-xs text-slate-400 shrink-0">
        <div>[A / D / Buttons] Move • [Space / Fire] Plasma • [X / Esc] Exit</div>
        <div className="text-cyan-400 font-bold hidden xs:block">CREDIT 01</div>
      </div>
    </div>
  );
};
