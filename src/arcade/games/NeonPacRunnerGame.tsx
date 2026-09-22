import React, { useEffect, useRef, useState } from 'react';
import { ArcadeGameProps } from '../types';
import { Volume2, VolumeX, RotateCcw, X, Award, Sparkles, Cherry } from 'lucide-react';

// Tile types for grid
// 0 = Empty, 1 = Wall, 2 = Dot (Pellet), 3 = Energizer (Power Pellet), 4 = Ghost House Door
const MAZE_STAGE_1 = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 3, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 3, 1],
  [1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1],
  [1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 2, 1],
  [1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 1],
  [1, 1, 1, 1, 2, 1, 1, 1, 0, 1, 0, 1, 1, 1, 2, 1, 1, 1, 1],
  [0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0],
  [1, 1, 1, 1, 2, 1, 0, 1, 1, 4, 1, 1, 0, 1, 2, 1, 1, 1, 1],
  [0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0],
  [1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1],
  [0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0],
  [1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 1, 1, 0, 1, 2, 1, 1, 1, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 1, 1, 2, 1, 1, 1, 2, 1, 2, 1, 1, 1, 2, 1, 1, 2, 1],
  [1, 3, 2, 1, 2, 2, 2, 2, 2, 0, 2, 2, 2, 2, 2, 1, 2, 3, 1],
  [1, 1, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 1, 1],
  [1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 2, 1],
  [1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

interface Ghost {
  id: string;
  name: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  color: string;
  homeX: number;
  homeY: number;
  mode: 'chase' | 'frightened' | 'eaten';
}

export const NeonPacRunnerGame: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try {
      return Number(localStorage.getItem('pac_runner_hi') || '18500');
    } catch {
      return 18500;
    }
  });
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [frightenedTimer, setFrightenedTimer] = useState(0);
  const [fruitActive, setFruitActive] = useState(false);
  const [gameState, setGameState] = useState<'playing' | 'level_clear' | 'gameover'>('playing');
  const [soundMuted, setSoundMuted] = useState(false);

  const soundMutedRef = useRef(false);
  soundMutedRef.current = soundMuted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const resetGameRef = useRef<() => void>(() => {});
  const setNextDirRef = useRef<(dx: number, dy: number) => void>(() => {});

  // Web Audio Chiptune Synthesizer
  const playSfx = (type: 'dot' | 'energizer' | 'eat_ghost' | 'eat_fruit' | 'death' | 'win') => {
    if (soundMutedRef.current) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'dot') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.setValueAtTime(480, now + 0.04);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'energizer') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(850, now + 0.25);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'eat_ghost') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.35);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'eat_fruit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.08);
        osc.frequency.setValueAtTime(784, now + 0.16);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'death') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.6);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else if (type === 'win') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554, now + 0.1);
        osc.frequency.setValueAtTime(659, now + 0.2);
        osc.frequency.setValueAtTime(880, now + 0.3);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch {}
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const TILE_SIZE = 24;
    const COLS = 19;
    const ROWS = 21;

    let maze = MAZE_STAGE_1.map((row) => [...row]);
    let currentScore = 0;
    let currentLives = 3;
    let currentLevel = 1;
    let dotsRemaining = 0;

    // Count initial dots
    const countDots = () => {
      let count = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (maze[r][c] === 2 || maze[r][c] === 3) count++;
        }
      }
      return count;
    };
    dotsRemaining = countDots();

    // Pacman state (centered on tile 9, row 16 - open corridor)
    let pacX = 9;
    let pacY = 16;
    let pacDirX = -1;
    let pacDirY = 0;
    let nextDirX = -1;
    let nextDirY = 0;
    let lastFacingAngle = Math.PI;
    const pacSpeed = 4.8;
    let mouthAngle = 0.2;
    let mouthDir = 1;

    // Ghosts
    const ghosts: Ghost[] = [
      { id: 'blinky', name: 'Blinky', x: 9, y: 8, dirX: -1, dirY: 0, speed: 4.2, color: '#ef4444', homeX: 18, homeY: 0, mode: 'chase' },
      { id: 'pinky', name: 'Pinky', x: 9, y: 10, dirX: 0, dirY: -1, speed: 4.0, color: '#f472b6', homeX: 0, homeY: 0, mode: 'chase' },
      { id: 'inky', name: 'Inky', x: 8, y: 10, dirX: 1, dirY: 0, speed: 3.8, color: '#38bdf8', homeX: 18, homeY: 20, mode: 'chase' },
      { id: 'clyde', name: 'Clyde', x: 10, y: 10, dirX: -1, dirY: 0, speed: 3.6, color: '#fb923c', homeX: 0, homeY: 20, mode: 'chase' },
    ];

    let scareTime = 0;
    let ghostMultiplier = 1;
    let fruitSpawned = false;
    let fruitTimer = 0;
    let invulnerableTimer = 0;
    let isLevelClearing = false;

    setNextDirRef.current = (dx: number, dy: number) => {
      nextDirX = dx;
      nextDirY = dy;
    };

    const resetPositions = () => {
      pacX = 9;
      pacY = 16;
      pacDirX = -1;
      pacDirY = 0;
      nextDirX = -1;
      nextDirY = 0;
      lastFacingAngle = Math.PI;

      ghosts[0].x = 9; ghosts[0].y = 8; ghosts[0].dirX = -1; ghosts[0].dirY = 0; ghosts[0].mode = 'chase';
      ghosts[1].x = 9; ghosts[1].y = 10; ghosts[1].dirX = 0; ghosts[1].dirY = -1; ghosts[1].mode = 'chase';
      ghosts[2].x = 8; ghosts[2].y = 10; ghosts[2].dirX = 1; ghosts[2].dirY = 0; ghosts[2].mode = 'chase';
      ghosts[3].x = 10; ghosts[3].y = 10; ghosts[3].dirX = -1; ghosts[3].dirY = 0; ghosts[3].mode = 'chase';
    };

    const setupLevel = (lvl: number) => {
      currentLevel = lvl;
      setLevel(lvl);
      maze = MAZE_STAGE_1.map((row) => [...row]);
      dotsRemaining = countDots();
      scareTime = 0;
      invulnerableTimer = 2.0;
      isLevelClearing = false;
      fruitSpawned = false;
      fruitTimer = 0;
      setFruitActive(false);
      setGameState('playing');
      resetPositions();
    };

    const resetGame = () => {
      currentScore = 0;
      currentLives = 3;
      setScore(0);
      setLives(3);
      setupLevel(1);
    };
    resetGameRef.current = resetGame;

    // Helper: is tile solid
    const isSolid = (tileX: number, tileY: number, forGhost = false) => {
      if (tileX < 0 || tileX >= COLS) return false; // wrap tunnel
      if (tileY < 0 || tileY >= ROWS) return true;
      const tile = maze[tileY][tileX];
      if (tile === 1) return true;
      if (tile === 4 && !forGhost) return true; // Ghost house door
      return false;
    };

    // Keyboard handlers
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp' || e.code === 'KeyW') setNextDirRef.current(0, -1);
      if (e.code === 'ArrowDown' || e.code === 'KeyS') setNextDirRef.current(0, 1);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') setNextDirRef.current(-1, 0);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') setNextDirRef.current(1, 0);
      if (e.code === 'KeyR' || (currentLives <= 0 && (e.code === 'Space' || e.code === 'Enter'))) resetGame();
      if (e.code === 'Escape') onExit();
    };

    window.addEventListener('keydown', onKeyDown);

    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;

      // Frightened mode timer
      if (scareTime > 0) {
        scareTime -= dt;
        setFrightenedTimer(Math.ceil(scareTime));
        if (scareTime <= 0) {
          ghosts.forEach((g) => {
            if (g.mode === 'frightened') g.mode = 'chase';
          });
        }
      }

      if (invulnerableTimer > 0) {
        invulnerableTimer -= dt;
      }

      // Fruit spawn at 50% dots remaining
      if (!fruitSpawned && dotsRemaining < 80) {
        fruitSpawned = true;
        fruitTimer = 15;
        setFruitActive(true);
      }
      if (fruitTimer > 0) {
        fruitTimer -= dt;
        if (fruitTimer <= 0) {
          setFruitActive(false);
        }
      }

      // 1. Move Pacman
      // Immediate reversal if player presses opposite direction
      if (
        (nextDirX !== 0 || nextDirY !== 0) &&
        nextDirX === -pacDirX &&
        nextDirY === -pacDirY
      ) {
        pacDirX = nextDirX;
        pacDirY = nextDirY;
      }

      // If stopped, start moving immediately if target tile is not solid
      if (pacDirX === 0 && pacDirY === 0 && (nextDirX !== 0 || nextDirY !== 0)) {
        const curTx = Math.round(pacX);
        const curTy = Math.round(pacY);
        if (!isSolid(curTx + nextDirX, curTy + nextDirY)) {
          pacDirX = nextDirX;
          pacDirY = nextDirY;
          pacX = curTx;
          pacY = curTy;
        }
      }

      // Smooth arcade cornering: buffer turns when close to tile center
      const currentTileX = Math.round(pacX);
      const currentTileY = Math.round(pacY);
      const isAlignedX = Math.abs(pacX - currentTileX) < 0.28;
      const isAlignedY = Math.abs(pacY - currentTileY) < 0.28;

      if (nextDirX !== 0 || nextDirY !== 0) {
        if (nextDirX !== 0 && isAlignedY) {
          // Player wants to turn horizontally
          if (!isSolid(currentTileX + nextDirX, currentTileY)) {
            pacDirX = nextDirX;
            pacDirY = 0;
            pacY = currentTileY;
          }
        } else if (nextDirY !== 0 && isAlignedX) {
          // Player wants to turn vertically
          if (!isSolid(currentTileX, currentTileY + nextDirY)) {
            pacDirX = 0;
            pacDirY = nextDirY;
            pacX = currentTileX;
          }
        }
      }

      // Track last facing angle
      if (pacDirX === 1) lastFacingAngle = 0;
      else if (pacDirX === -1) lastFacingAngle = Math.PI;
      else if (pacDirY === 1) lastFacingAngle = Math.PI / 2;
      else if (pacDirY === -1) lastFacingAngle = (3 * Math.PI) / 2;

      // Advance along current direction
      if (pacDirX !== 0 || pacDirY !== 0) {
        const nextX = pacX + pacDirX * pacSpeed * dt;
        const nextY = pacY + pacDirY * pacSpeed * dt;

        // Check tunnel wrapping
        if (nextX < -0.5) {
          pacX = COLS - 0.5;
        } else if (nextX > COLS - 0.5) {
          pacX = -0.5;
        } else {
          // Check collision ahead
          const checkX = Math.round(nextX + pacDirX * 0.45);
          const checkY = Math.round(nextY + pacDirY * 0.45);
          if (!isSolid(checkX, checkY)) {
            pacX = nextX;
            pacY = nextY;
          } else {
            pacX = Math.round(pacX);
            pacY = Math.round(pacY);
            pacDirX = 0;
            pacDirY = 0;
          }
        }

        // Animate mouth
        mouthAngle += mouthDir * dt * 6;
        if (mouthAngle > 0.45) mouthDir = -1;
        if (mouthAngle < 0.05) mouthDir = 1;
      }

      // Eat Pellets
      const eatTileX = Math.round(pacX);
      const eatTileY = Math.round(pacY);
      if (eatTileX >= 0 && eatTileX < COLS && eatTileY >= 0 && eatTileY < ROWS) {
        const tile = maze[eatTileY][eatTileX];
        if (tile === 2) {
          // Normal Dot
          maze[eatTileY][eatTileX] = 0;
          dotsRemaining--;
          currentScore += 10;
          setScore(currentScore);
          playSfx('dot');
        } else if (tile === 3) {
          // Power Pellet
          maze[eatTileY][eatTileX] = 0;
          dotsRemaining--;
          currentScore += 50;
          setScore(currentScore);
          playSfx('energizer');
          scareTime = 9 - currentLevel * 0.8;
          ghostMultiplier = 1;
          ghosts.forEach((g) => {
            if (g.mode !== 'eaten') g.mode = 'frightened';
          });
        }
      }

      // Eat Fruit
      if (fruitTimer > 0 && Math.hypot(pacX - 9, pacY - 10) < 0.85) {
        fruitTimer = 0;
        setFruitActive(false);
        playSfx('eat_fruit');
        currentScore += 500 * currentLevel;
        setScore(currentScore);
      }

      // Check Level Clear
      if (dotsRemaining <= 0 && !isLevelClearing) {
        isLevelClearing = true;
        playSfx('win');
        setGameState('level_clear');
        setTimeout(() => {
          setupLevel(currentLevel + 1);
        }, 2200);
      }

      // 2. Move Ghosts
      ghosts.forEach((g) => {
        let targetX = pacX;
        let targetY = pacY;

        if (g.mode === 'frightened') {
          // Wander away to corners
          targetX = g.homeX;
          targetY = g.homeY;
        } else if (g.mode === 'eaten') {
          // Return to ghost house center
          targetX = 9;
          targetY = 10;
          if (Math.hypot(g.x - 9, g.y - 10) < 0.6) {
            g.mode = 'chase';
          }
        } else {
          // Ghost specific targeting
          if (g.id === 'pinky') {
            targetX = pacX + pacDirX * 4;
            targetY = pacY + pacDirY * 4;
          } else if (g.id === 'inky') {
            targetX = pacX + (pacX - ghosts[0].x);
            targetY = pacY + (pacY - ghosts[0].y);
          } else if (g.id === 'clyde') {
            if (Math.hypot(g.x - pacX, g.y - pacY) < 6) {
              targetX = g.homeX;
              targetY = g.homeY;
            }
          }
        }

        // At tile center, make turn choice
        const gTileX = Math.round(g.x);
        const gTileY = Math.round(g.y);
        const gAligned = Math.abs(g.x - gTileX) < 0.18 && Math.abs(g.y - gTileY) < 0.18;

        if (gAligned) {
          const dirs = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
          ];

          let bestDir = { dx: g.dirX, dy: g.dirY };
          let bestDist = 99999;

          // Pick direction closest to target without reversing
          for (const d of dirs) {
            if (d.dx === -g.dirX && d.dy === -g.dirY) continue; // Don't reverse
            const nextTx = gTileX + d.dx;
            const nextTy = gTileY + d.dy;
            if (!isSolid(nextTx, nextTy, true)) {
              const dist = Math.hypot(nextTx - targetX, nextTy - targetY);
              if (dist < bestDist) {
                bestDist = dist;
                bestDir = d;
              }
            }
          }

          if (bestDir.dx !== g.dirX || bestDir.dy !== g.dirY) {
            g.x = gTileX;
            g.y = gTileY;
            g.dirX = bestDir.dx;
            g.dirY = bestDir.dy;
          }
        }

        const effectiveSpeed = (g.mode === 'frightened' ? g.speed * 0.6 : g.mode === 'eaten' ? g.speed * 1.8 : g.speed) + currentLevel * 0.2;
        g.x += g.dirX * effectiveSpeed * dt;
        g.y += g.dirY * effectiveSpeed * dt;

        // Tunnel wrapping for ghosts
        if (g.x < -0.5) g.x = COLS - 0.5;
        else if (g.x > COLS - 0.5) g.x = -0.5;

        // Check collision with Pacman
        const distToPac = Math.hypot(g.x - pacX, g.y - pacY);
        if (distToPac < 0.65) {
          if (g.mode === 'frightened') {
            // Pacman eats ghost
            g.mode = 'eaten';
            playSfx('eat_ghost');
            const pts = 200 * ghostMultiplier;
            ghostMultiplier *= 2;
            currentScore += pts;
            setScore(currentScore);
          } else if (g.mode === 'chase' && invulnerableTimer <= 0) {
            // Ghost catches Pacman
            playSfx('death');
            currentLives--;
            setLives(currentLives);
            invulnerableTimer = 2.5; // Grace period
            resetPositions();

            if (currentLives <= 0) {
              setGameState('gameover');
              if (currentScore > highScore) {
                setHighScore(currentScore);
                try {
                  localStorage.setItem('pac_runner_hi', String(currentScore));
                } catch {}
              }
            }
          }
        }
      });

      // -------------------------------------------------------------
      // RENDERING PIPELINE
      // -------------------------------------------------------------
      ctx.fillStyle = '#050711';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Maze Tiles
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const tile = maze[r][c];
          const x = c * TILE_SIZE;
          const y = r * TILE_SIZE;

          if (tile === 1) {
            // Wall: Neon glow styled by level
            ctx.strokeStyle = currentLevel === 1 ? '#0284c7' : currentLevel === 2 ? '#10b981' : '#f59e0b';
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          } else if (tile === 2) {
            // Pellet
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (tile === 3) {
            // Power Pellet
            const pulse = 4 + Math.sin(now * 0.01) * 2;
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, pulse, 0, Math.PI * 2);
            ctx.fill();
          } else if (tile === 4) {
            // Ghost House Door
            ctx.fillStyle = '#ec4899';
            ctx.fillRect(x, y + 10, TILE_SIZE, 4);
          }
        }
      }

      // Draw Fruit Bonus
      if (fruitTimer > 0) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc((9 + 0.5) * TILE_SIZE, (10 + 0.5) * TILE_SIZE, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#22c55e';
        ctx.fillRect((9 + 0.5) * TILE_SIZE - 1, (10 + 0.5) * TILE_SIZE - 10, 2, 4);
      }

      // Draw Ghosts
      ghosts.forEach((g) => {
        const gx = (g.x + 0.5) * TILE_SIZE;
        const gy = (g.y + 0.5) * TILE_SIZE;

        ctx.save();
        ctx.translate(gx, gy);

        if (g.mode === 'frightened') {
          // Flashing blue / white
          const flash = scareTime < 2.5 && Math.floor(now * 0.01) % 2 === 0;
          ctx.fillStyle = flash ? '#ffffff' : '#2563eb';
        } else if (g.mode === 'eaten') {
          // Just eyes
          ctx.fillStyle = 'transparent';
        } else {
          ctx.fillStyle = g.color;
        }

        if (g.mode !== 'eaten') {
          ctx.beginPath();
          ctx.arc(0, -2, 9, Math.PI, 0, false);
          ctx.lineTo(9, 7);
          ctx.lineTo(6, 4);
          ctx.lineTo(3, 7);
          ctx.lineTo(0, 4);
          ctx.lineTo(-3, 7);
          ctx.lineTo(-6, 4);
          ctx.lineTo(-9, 7);
          ctx.closePath();
          ctx.fill();
        }

        // Eyes
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-3, -3, 3, 0, Math.PI * 2);
        ctx.arc(3, -3, 3, 0, Math.PI * 2);
        ctx.fill();

        // Pupils looking in movement direction
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-3 + g.dirX * 1.5, -3 + g.dirY * 1.5, 1.5, 0, Math.PI * 2);
        ctx.arc(3 + g.dirX * 1.5, -3 + g.dirY * 1.5, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      // Draw Pacman
      if (currentLives > 0) {
        const isFlickering = invulnerableTimer > 0 && Math.floor(now * 0.015) % 2 === 0;
        if (!isFlickering) {
          const px = (pacX + 0.5) * TILE_SIZE;
          const py = (pacY + 0.5) * TILE_SIZE;

          let angle = lastFacingAngle;
          if (pacDirX === 1) angle = 0;
          else if (pacDirX === -1) angle = Math.PI;
          else if (pacDirY === 1) angle = Math.PI / 2;
          else if (pacDirY === -1) angle = (3 * Math.PI) / 2;

          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(angle);
          ctx.fillStyle = '#eab308';
          ctx.beginPath();
          ctx.arc(0, 0, 10, mouthAngle * Math.PI, (2 - mouthAngle) * Math.PI);
          ctx.lineTo(0, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // Overlays
      if (gameState === 'level_clear') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('STAGE CLEARED!', canvas.width / 2, canvas.height / 2 - 10);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.fillText('PREPARING NEXT SECTOR...', canvas.width / 2, canvas.height / 2 + 20);
      } else if (gameState === 'gameover') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.fillText(`FINAL SCORE: ${currentScore}`, canvas.width / 2, canvas.height / 2 + 10);
        ctx.fillStyle = '#facc15';
        ctx.fillText('PRESS [R] OR TAP RETRY', canvas.width / 2, canvas.height / 2 + 40);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950 text-white font-mono select-none overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-950 via-neutral-900 to-indigo-950 border-b-2 border-yellow-500/70 px-3 sm:px-6 py-2 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Sparkles className="w-5 h-5 text-yellow-400 animate-spin" />
          <div>
            <h1 className="text-sm sm:text-lg font-black text-yellow-300 tracking-wider">
              NEON PAC-RUNNER <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-600/30 text-yellow-200 border border-yellow-500/50">8-BIT</span>
            </h1>
            <p className="text-[10px] text-neutral-400">Stage {level} • Maze Chase</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-xs">
          <div className="hidden sm:inline text-neutral-300">
            HI: <span className="text-amber-400 font-bold">{highScore}</span>
          </div>
          <div className="text-neutral-200">
            SCORE: <span className="text-yellow-400 font-black">{score}</span>
          </div>

          <button
            onClick={() => setSoundMuted(!soundMuted)}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
          >
            {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-yellow-400" />}
          </button>

          <button
            onClick={() => resetGameRef.current()}
            className="px-2.5 py-1.5 rounded-xl bg-yellow-800 hover:bg-yellow-700 text-xs font-bold transition flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Reset</span>
          </button>

          <button
            onClick={onExit}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black transition shadow flex items-center gap-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Main Playfield Canvas */}
      <div className="flex-1 relative flex items-center justify-center bg-black p-2 min-h-0">
        <canvas
          ref={canvasRef}
          width={456}
          height={504}
          className="max-h-full max-w-full aspect-[19/21] rounded-xl border-2 border-yellow-500/40 shadow-[0_0_35px_rgba(234,179,8,0.25)] bg-slate-950 object-contain"
        />

        {/* Top Floating Status */}
        <div className="absolute top-4 left-6 pointer-events-none flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-yellow-300">
            <span>LIVES:</span>
            {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
              <span key={i} className="text-sm">🟡</span>
            ))}
          </div>
          {frightenedTimer > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-blue-900/90 border border-blue-400 text-[10px] font-black text-blue-200 animate-pulse">
              FRIGHTENED: {frightenedTimer}s
            </span>
          )}
          {fruitActive && (
            <span className="px-2 py-0.5 rounded-full bg-rose-900/90 border border-rose-400 text-[10px] font-black text-rose-200 animate-bounce flex items-center gap-1">
              <Cherry className="w-3 h-3" /> BONUS FRUIT!
            </span>
          )}
        </div>

        {/* Game Over Interactive Overlay */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xs p-4 z-20">
            <div className="bg-neutral-900 border-2 border-rose-500 rounded-2xl p-6 text-center max-w-sm w-full shadow-[0_0_40px_rgba(244,63,94,0.4)]">
              <h2 className="text-3xl font-black text-rose-500 tracking-wider">GAME OVER</h2>
              <div className="mt-3 text-neutral-300 text-sm">
                FINAL SCORE: <span className="text-yellow-400 font-bold">{score}</span>
              </div>
              <div className="text-neutral-400 text-xs mt-1">
                HIGH SCORE: <span className="text-amber-400 font-bold">{highScore}</span>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => resetGameRef.current()}
                  className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm cursor-pointer shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>PLAY AGAIN (SPACE / ENTER)</span>
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs cursor-pointer"
                >
                  EXIT TO ARCADE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stage Clear Floating Banner */}
        {gameState === 'level_clear' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs pointer-events-none z-20">
            <div className="bg-neutral-900 border-2 border-yellow-400 rounded-2xl px-8 py-5 text-center shadow-[0_0_35px_rgba(250,204,21,0.5)] animate-pulse">
              <div className="text-2xl font-black text-yellow-300">STAGE {level} CLEARED!</div>
              <div className="text-xs text-neutral-300 mt-1 uppercase tracking-widest font-mono">
                Warping to Next Sector...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile D-Pad */}
      <div className="bg-neutral-900/95 border-t border-neutral-800 px-4 py-2 flex items-center justify-between text-xs text-neutral-400 shrink-0">
        <span className="hidden sm:inline text-[11px] text-neutral-400">
          WASD or Arrow Keys to Turn • Chomp all dots to advance
        </span>

        {/* Responsive Mobile D-Pad */}
        <div className="grid grid-cols-3 gap-1 mx-auto sm:mx-0">
          <div />
          <button
            type="button"
            onClick={() => setNextDirRef.current(0, -1)}
            onTouchStart={(e) => {
              e.preventDefault();
              setNextDirRef.current(0, -1);
            }}
            className="w-12 h-11 rounded-lg bg-neutral-800 active:bg-yellow-600 text-white font-black flex items-center justify-center cursor-pointer shadow active:scale-95 transition-transform"
          >
            ▲
          </button>
          <div />
          <button
            type="button"
            onClick={() => setNextDirRef.current(-1, 0)}
            onTouchStart={(e) => {
              e.preventDefault();
              setNextDirRef.current(-1, 0);
            }}
            className="w-12 h-11 rounded-lg bg-neutral-800 active:bg-yellow-600 text-white font-black flex items-center justify-center cursor-pointer shadow active:scale-95 transition-transform"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => setNextDirRef.current(0, 1)}
            onTouchStart={(e) => {
              e.preventDefault();
              setNextDirRef.current(0, 1);
            }}
            className="w-12 h-11 rounded-lg bg-neutral-800 active:bg-yellow-600 text-white font-black flex items-center justify-center cursor-pointer shadow active:scale-95 transition-transform"
          >
            ▼
          </button>
          <button
            type="button"
            onClick={() => setNextDirRef.current(1, 0)}
            onTouchStart={(e) => {
              e.preventDefault();
              setNextDirRef.current(1, 0);
            }}
            className="w-12 h-11 rounded-lg bg-neutral-800 active:bg-yellow-600 text-white font-black flex items-center justify-center cursor-pointer shadow active:scale-95 transition-transform"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
};
