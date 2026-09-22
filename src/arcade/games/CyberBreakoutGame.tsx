import React, { useEffect, useRef, useState } from 'react';
import { ArcadeGameProps } from '../types';
import { Volume2, VolumeX, RotateCcw, X, Sparkles, Shield, Zap, Flame, Award, Pause, Play } from 'lucide-react';

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  color: string;
  type: 'normal' | 'steel' | 'tnt' | 'powerup' | 'boss';
  powerType?: 'multiball' | 'laser' | 'wide' | 'fireball' | 'shield';
  alive: boolean;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isFireball: boolean;
}

interface FallingPowerUp {
  x: number;
  y: number;
  vy: number;
  type: 'multiball' | 'laser' | 'wide' | 'fireball' | 'shield';
  alive: boolean;
}

interface LaserBullet {
  x: number;
  y: number;
  vy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

export const CyberBreakoutGame: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try {
      return Number(localStorage.getItem('cyber_breakout_hi') || '24000');
    } catch {
      return 24000;
    }
  });
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [laserAmmo, setLaserAmmo] = useState(0);
  const [hasFloorShield, setHasFloorShield] = useState(false);
  const [paddleWidthBonus, setPaddleWidthBonus] = useState(false);
  const [hasFireball, setHasFireball] = useState(false);
  const [combo, setCombo] = useState(1);
  const [gameState, setGameState] = useState<'serving' | 'playing' | 'level_clear' | 'gameover'>('serving');
  const [soundMuted, setSoundMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const soundMutedRef = useRef(false);
  soundMutedRef.current = soundMuted;
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const launchBallRef = useRef<() => void>(() => {});
  const fireLasersRef = useRef<() => void>(() => {});
  const resetGameRef = useRef<() => void>(() => {});
  const setPaddleInputRef = useRef<(dir: number) => void>(() => {});

  // Web Audio Chiptune Synthesizer
  const playSfx = (type: 'bounce' | 'brick' | 'tnt' | 'laser' | 'powerup' | 'death' | 'win') => {
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

      if (type === 'bounce') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'brick') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(540, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'tnt') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.35);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'laser') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.07);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'powerup') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.07);
        osc.frequency.setValueAtTime(880, now + 0.14);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'death') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.4);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'win') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.1);
        osc.frequency.setValueAtTime(783, now + 0.2);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch {}
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    // Paddle state
    let paddleX = canvas.width / 2;
    const paddleY = canvas.height - 35;
    const basePaddleWidth = 84;
    let currentPaddleWidth = basePaddleWidth;
    let paddleDir = 0;
    const paddleSpeed = 460;

    // Entities
    const balls: Ball[] = [];
    const bricks: Brick[] = [];
    const fallingPowerUps: FallingPowerUp[] = [];
    const laserBullets: LaserBullet[] = [];
    const particles: Particle[] = [];

    let currentScore = 0;
    let currentLives = 3;
    let currentLevel = 1;
    let curLasers = 0;
    let floorShield = false;
    let fireballActive = false;
    let fireballTimer = 0;
    let curCombo = 1;
    let comboTimer = 0;
    let activeGameState: 'serving' | 'playing' | 'level_clear' | 'gameover' = 'serving';
    let isLevelClearing = false;

    const createParticles = (x: number, y: number, color = '#38bdf8', count = 12) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 120;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          color,
          size: 2 + Math.random() * 3,
          life: 0.3 + Math.random() * 0.35,
          maxLife: 0.6,
        });
      }
    };

    const setupLevel = (lvl: number) => {
      currentLevel = lvl;
      setLevel(lvl);
      bricks.length = 0;
      balls.length = 0;
      fallingPowerUps.length = 0;
      laserBullets.length = 0;
      activeGameState = 'serving';
      isLevelClearing = false;
      setGameState('serving');

      const cols = 9;
      const rows = 4 + Math.min(lvl, 3);
      const brickW = 46;
      const brickH = 20;
      const startX = (canvas.width - cols * (brickW + 6)) / 2;
      const startY = 60;

      const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6'];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let type: Brick['type'] = 'normal';
          let hp = 1;
          let color = colors[r % colors.length];
          let powerType: Brick['powerType'] = undefined;

          // Special bricks based on layout
          if (lvl >= 2 && (r + c) % 5 === 0) {
            type = 'steel';
            hp = 2;
            color = '#94a3b8';
          } else if (lvl >= 3 && (r === 2 && (c === 2 || c === 6))) {
            type = 'tnt';
            hp = 1;
            color = '#f43f5e';
          } else if (Math.random() < 0.18) {
            type = 'powerup';
            const powers: NonNullable<Brick['powerType']>[] = ['multiball', 'laser', 'wide', 'fireball', 'shield'];
            powerType = powers[Math.floor(Math.random() * powers.length)];
            color = '#38bdf8';
          }

          bricks.push({
            x: startX + c * (brickW + 6),
            y: startY + r * (brickH + 6),
            w: brickW,
            h: brickH,
            hp,
            maxHp: hp,
            color,
            type,
            powerType,
            alive: true,
          });
        }
      }

      // Serve starting ball
      balls.push({
        x: paddleX,
        y: paddleY - 12,
        vx: 0,
        vy: 0,
        radius: 6,
        isFireball: false,
      });
    };

    const launchBall = () => {
      if (balls.length === 1 && balls[0].vx === 0 && balls[0].vy === 0) {
        const angle = -Math.PI / 3 + (Math.random() * Math.PI) / 3;
        const speed = 360 + currentLevel * 20;
        balls[0].vx = Math.sin(angle) * speed;
        balls[0].vy = -Math.cos(angle) * speed;
        activeGameState = 'playing';
        setGameState('playing');
        playSfx('bounce');
      }
    };
    launchBallRef.current = launchBall;

    const fireLasers = () => {
      if (curLasers <= 0) return;
      curLasers -= 2;
      setLaserAmmo(curLasers);
      laserBullets.push(
        { x: paddleX - currentPaddleWidth * 0.4, y: paddleY - 14, vy: -580 },
        { x: paddleX + currentPaddleWidth * 0.4, y: paddleY - 14, vy: -580 }
      );
      playSfx('laser');
    };
    fireLasersRef.current = fireLasers;

    setPaddleInputRef.current = (dir: number) => {
      paddleDir = dir;
    };

    const resetGame = () => {
      currentScore = 0;
      currentLives = 3;
      curLasers = 0;
      floorShield = false;
      fireballActive = false;
      activeGameState = 'serving';
      isLevelClearing = false;
      setScore(0);
      setLives(3);
      setLaserAmmo(0);
      setHasFloorShield(false);
      setHasFireball(false);
      setPaddleWidthBonus(false);
      setupLevel(1);
    };
    resetGameRef.current = resetGame;

    setupLevel(1);

    // Keyboard controls
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyP') setIsPaused((prev) => !prev);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') paddleDir = -1;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') paddleDir = 1;
      if (e.code === 'Space') {
        if (balls[0]?.vx === 0 || activeGameState === 'serving') launchBall();
        else if (curLasers > 0) fireLasers();
        else if (activeGameState === 'gameover') resetGame();
      }
      if (e.code === 'Enter' && activeGameState === 'gameover') resetGame();
      if (e.code === 'KeyR') resetGame();
      if (e.code === 'Escape') onExit();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (
        (e.code === 'ArrowLeft' || e.code === 'KeyA') && paddleDir === -1 ||
        (e.code === 'ArrowRight' || e.code === 'KeyD') && paddleDir === 1
      ) {
        paddleDir = 0;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let lastTime = performance.now();

    const loop = (now: number) => {
      if (isPausedRef.current) {
        lastTime = now;
        animId = requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;

      // Update Paddle
      paddleX = Math.max(
        currentPaddleWidth / 2 + 10,
        Math.min(canvas.width - currentPaddleWidth / 2 - 10, paddleX + paddleDir * paddleSpeed * dt)
      );

      // Fireball timer
      if (fireballActive) {
        fireballTimer -= dt;
        if (fireballTimer <= 0) {
          fireballActive = false;
          setHasFireball(false);
          balls.forEach((b) => (b.isFireball = false));
        }
      }

      // Combo timer
      if (curCombo > 1) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
          curCombo = 1;
          setCombo(1);
        }
      }

      // If serving ball, pin to paddle
      if (balls.length === 1 && balls[0].vx === 0 && balls[0].vy === 0) {
        balls[0].x = paddleX;
        balls[0].y = paddleY - 12;
      }

      // 1. Move Laser Bullets
      for (let i = laserBullets.length - 1; i >= 0; i--) {
        const lb = laserBullets[i];
        lb.y += lb.vy * dt;
        if (lb.y < -10) {
          laserBullets.splice(i, 1);
          continue;
        }

        // Check laser hitting brick
        for (const brk of bricks) {
          if (!brk.alive) continue;
          if (lb.x >= brk.x && lb.x <= brk.x + brk.w && lb.y >= brk.y && lb.y <= brk.y + brk.h) {
            laserBullets.splice(i, 1);
            brk.hp--;
            createParticles(lb.x, lb.y, brk.color, 8);
            playSfx('brick');
            if (brk.hp <= 0) {
              brk.alive = false;
              currentScore += 100 * curCombo;
              setScore(currentScore);
            }
            break;
          }
        }
      }

      // 2. Move Falling PowerUps
      for (let i = fallingPowerUps.length - 1; i >= 0; i--) {
        const pu = fallingPowerUps[i];
        pu.y += pu.vy * dt;
        if (pu.y > canvas.height + 20) {
          fallingPowerUps.splice(i, 1);
          continue;
        }

        // Catch with paddle
        if (
          pu.y >= paddleY - 10 &&
          pu.y <= paddleY + 16 &&
          pu.x >= paddleX - currentPaddleWidth / 2 &&
          pu.x <= paddleX + currentPaddleWidth / 2
        ) {
          playSfx('powerup');
          createParticles(pu.x, pu.y, '#38bdf8', 16);
          currentScore += 300;
          setScore(currentScore);

          if (pu.type === 'multiball') {
            const curB = balls[0] || { x: paddleX, y: paddleY - 20, vx: 0, vy: -360, radius: 6, isFireball: false };
            balls.push(
              { x: curB.x, y: curB.y, vx: curB.vx - 140, vy: curB.vy, radius: 6, isFireball: fireballActive },
              { x: curB.x, y: curB.y, vx: curB.vx + 140, vy: curB.vy, radius: 6, isFireball: fireballActive }
            );
          } else if (pu.type === 'laser') {
            curLasers = Math.min(20, curLasers + 10);
            setLaserAmmo(curLasers);
          } else if (pu.type === 'wide') {
            currentPaddleWidth = basePaddleWidth * 1.5;
            setPaddleWidthBonus(true);
            setTimeout(() => {
              currentPaddleWidth = basePaddleWidth;
              setPaddleWidthBonus(false);
            }, 18000);
          } else if (pu.type === 'fireball') {
            fireballActive = true;
            fireballTimer = 14;
            setHasFireball(true);
            balls.forEach((b) => (b.isFireball = true));
          } else if (pu.type === 'shield') {
            floorShield = true;
            setHasFloorShield(true);
          }

          fallingPowerUps.splice(i, 1);
        }
      }

      // 3. Move Balls & Collisions
      for (let bIdx = balls.length - 1; bIdx >= 0; bIdx--) {
        const b = balls[bIdx];
        if (b.vx === 0 && b.vy === 0) continue;

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Wall collisions
        if (b.x - b.radius < 10) {
          b.x = 10 + b.radius;
          b.vx = Math.abs(b.vx);
          playSfx('bounce');
        } else if (b.x + b.radius > canvas.width - 10) {
          b.x = canvas.width - 10 - b.radius;
          b.vx = -Math.abs(b.vx);
          playSfx('bounce');
        }

        // Ceiling collision
        if (b.y - b.radius < 10) {
          b.y = 10 + b.radius;
          b.vy = Math.abs(b.vy);
          playSfx('bounce');
        }

        // Paddle collision
        if (
          b.vy > 0 &&
          b.y + b.radius >= paddleY - 8 &&
          b.y - b.radius <= paddleY + 8 &&
          b.x >= paddleX - currentPaddleWidth / 2 - 4 &&
          b.x <= paddleX + currentPaddleWidth / 2 + 4
        ) {
          b.y = paddleY - 8 - b.radius;

          // English spin based on distance from paddle center (-1 to 1)
          const hitOffset = (b.x - paddleX) / (currentPaddleWidth / 2);
          const maxAngle = (Math.PI * 5) / 12; // 75 degrees max
          const newAngle = hitOffset * maxAngle;
          const currentSpeed = Math.hypot(b.vx, b.vy);

          b.vx = Math.sin(newAngle) * currentSpeed;
          b.vy = -Math.cos(newAngle) * currentSpeed;

          playSfx('bounce');
          createParticles(b.x, b.y, '#38bdf8', 6);
        }

        // Anti-stuck shallow angle prevention
        if (Math.abs(b.vy) < 60 && (b.vx !== 0 || b.vy !== 0)) {
          b.vy = (b.vy >= 0 ? 1 : -1) * 80;
        }

        // Floor Shield bounce or Ball Out of Bounds
        if (b.y - b.radius > canvas.height) {
          if (floorShield) {
            floorShield = false;
            setHasFloorShield(false);
            b.y = canvas.height - 15;
            b.vy = -Math.abs(b.vy);
            createParticles(b.x, canvas.height - 10, '#06b6d4', 25);
            playSfx('bounce');
          } else {
            balls.splice(bIdx, 1);
            if (balls.length === 0) {
              currentLives--;
              setLives(currentLives);
              playSfx('death');
              curCombo = 1;
              setCombo(1);

              if (currentLives > 0) {
                // Respawn single ball
                balls.push({
                  x: paddleX,
                  y: paddleY - 12,
                  vx: 0,
                  vy: 0,
                  radius: 6,
                  isFireball: false,
                });
                activeGameState = 'serving';
                setGameState('serving');
              } else {
                activeGameState = 'gameover';
                setGameState('gameover');
                if (currentScore > highScore) {
                  setHighScore(currentScore);
                  try {
                    localStorage.setItem('cyber_breakout_hi', String(currentScore));
                  } catch {}
                }
              }
            }
            continue;
          }
        }

        // Brick collisions
        for (const brk of bricks) {
          if (!brk.alive) continue;

          if (
            b.x + b.radius >= brk.x &&
            b.x - b.radius <= brk.x + brk.w &&
            b.y + b.radius >= brk.y &&
            b.y - b.radius <= brk.y + brk.h
          ) {
            // Hit brick!
            brk.hp--;
            createParticles(b.x, b.y, brk.color, 10);

            // Combo multiplier
            curCombo = Math.min(8, curCombo + 1);
            comboTimer = 2.5;
            setCombo(curCombo);

            if (brk.hp <= 0) {
              brk.alive = false;
              currentScore += (brk.type === 'steel' ? 200 : 100) * curCombo;
              setScore(currentScore);
              playSfx(brk.type === 'tnt' ? 'tnt' : 'brick');

              // TNT Explosion chain reaction
              if (brk.type === 'tnt') {
                createParticles(brk.x + brk.w / 2, brk.y + brk.h / 2, '#f43f5e', 28);
                bricks.forEach((other) => {
                  if (other.alive && Math.hypot(other.x - brk.x, other.y - brk.y) < 75) {
                    other.hp = 0;
                    other.alive = false;
                    currentScore += 150;
                  }
                });
              }

              // Power-up drop
              if (brk.type === 'powerup' && brk.powerType) {
                fallingPowerUps.push({
                  x: brk.x + brk.w / 2,
                  y: brk.y + brk.h / 2,
                  vy: 140,
                  type: brk.powerType,
                  alive: true,
                });
              }
            } else {
              playSfx('brick');
            }

            // Fireball pierces right through! Normal ball bounces back
            if (!b.isFireball) {
              // Determine collision side
              const overlapLeft = b.x + b.radius - brk.x;
              const overlapRight = brk.x + brk.w - (b.x - b.radius);
              const overlapTop = b.y + b.radius - brk.y;
              const overlapBottom = brk.y + brk.h - (b.y - b.radius);

              const minOverlapX = Math.min(overlapLeft, overlapRight);
              const minOverlapY = Math.min(overlapTop, overlapBottom);

              if (minOverlapX < minOverlapY) {
                b.vx *= -1;
              } else {
                b.vy *= -1;
              }
              break;
            }
          }
        }
      }

      // Check Level Clear (All destroyable bricks cleared)
      const destroyableBricks = bricks.filter((b) => b.alive && b.type !== 'steel');
      if (destroyableBricks.length === 0 && activeGameState === 'playing' && !isLevelClearing) {
        isLevelClearing = true;
        activeGameState = 'level_clear';
        playSfx('win');
        setGameState('level_clear');
        currentScore += 2000 * currentLevel;
        setScore(currentScore);
        setTimeout(() => {
          setupLevel(currentLevel + 1);
        }, 2000);
      }

      // 4. Particles Update
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) particles.splice(i, 1);
      }

      // -------------------------------------------------------------
      // RENDERING PIPELINE
      // -------------------------------------------------------------
      ctx.fillStyle = '#050711';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Playfield Border Frame
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

      // Floor Shield
      if (floorShield) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(10, canvas.height - 12);
        ctx.lineTo(canvas.width - 10, canvas.height - 12);
        ctx.stroke();
      }

      // Bricks
      bricks.forEach((brk) => {
        if (!brk.alive) return;
        ctx.fillStyle = brk.color;
        ctx.fillRect(brk.x, brk.y, brk.w, brk.h);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(brk.x + 1, brk.y + 1, brk.w - 2, brk.h - 2);

        if (brk.type === 'tnt') {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('TNT', brk.x + brk.w / 2, brk.y + brk.h / 2 + 3);
        } else if (brk.type === 'powerup') {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('★', brk.x + brk.w / 2, brk.y + brk.h / 2 + 3);
        }
      });

      // Falling PowerUps
      fallingPowerUps.forEach((pu) => {
        ctx.fillStyle = pu.type === 'multiball' ? '#38bdf8' : pu.type === 'laser' ? '#ef4444' : pu.type === 'fireball' ? '#f97316' : '#22c55e';
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = pu.type === 'multiball' ? 'M' : pu.type === 'laser' ? 'L' : pu.type === 'fireball' ? 'F' : pu.type === 'wide' ? 'W' : 'S';
        ctx.fillText(label, pu.x, pu.y);
      });

      // Laser Bullets
      laserBullets.forEach((lb) => {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(lb.x - 2, lb.y - 10, 4, 18);
      });

      // Paddle
      ctx.fillStyle = paddleWidthBonus ? '#06b6d4' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(paddleX - currentPaddleWidth / 2, paddleY - 7, currentPaddleWidth, 14, 6);
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Laser Blaster barrels on paddle
      if (curLasers > 0) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(paddleX - currentPaddleWidth * 0.4 - 2, paddleY - 12, 4, 6);
        ctx.fillRect(paddleX + currentPaddleWidth * 0.4 - 2, paddleY - 12, 4, 6);
      }

      // Balls
      balls.forEach((b) => {
        ctx.fillStyle = b.isFireball ? '#f97316' : '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        if (b.isFireball) {
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

      // Particles
      particles.forEach((pt) => {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Overlay states
      if (gameState === 'serving') {
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS SPACE OR TAP LAUNCH', canvas.width / 2, paddleY - 26);
      } else if (gameState === 'level_clear') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SECTOR CLEARED!', canvas.width / 2, canvas.height / 2 - 10);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.fillText('ADVANCING TO NEXT MATRIX...', canvas.width / 2, canvas.height / 2 + 18);
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
        ctx.fillText('PRESS [R] OR TAP RETRY', canvas.width / 2, canvas.height / 2 + 38);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950 text-white font-mono select-none overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-950 via-neutral-900 to-sky-950 border-b-2 border-cyan-500/70 px-3 sm:px-6 py-2 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Sparkles className="w-5 h-5 text-cyan-400 animate-spin" />
          <div>
            <h1 className="text-sm sm:text-lg font-black text-cyan-300 tracking-wider">
              CYBER BREAKOUT 2000 <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-600/30 text-cyan-200 border border-cyan-500/50">ARKANOID</span>
            </h1>
            <p className="text-[10px] text-neutral-400">Level {level} of 5 • Quantum Matrix</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-xs">
          <div className="hidden sm:inline text-neutral-300">
            HI: <span className="text-amber-400 font-bold">{highScore}</span>
          </div>
          <div className="text-neutral-200">
            SCORE: <span className="text-cyan-300 font-black">{score}</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSoundMuted((prev) => !prev);
            }}
            className="p-1.5 min-h-[38px] min-w-[38px] rounded-lg bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-300 transition cursor-pointer touch-manipulation select-none flex items-center justify-center"
            title="Toggle Sound"
          >
            {soundMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsPaused((prev) => !prev);
            }}
            className="px-2.5 py-1.5 min-h-[38px] rounded-xl bg-purple-900/80 hover:bg-purple-800 active:bg-purple-700 text-purple-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-purple-500/40 touch-manipulation select-none"
            title="Pause / Resume Game"
          >
            {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />}
            <span className="hidden xs:inline">{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsPaused(false);
              resetGameRef.current();
            }}
            className="px-2.5 py-1.5 min-h-[38px] rounded-xl bg-cyan-800 hover:bg-cyan-700 active:bg-cyan-600 text-xs font-bold transition flex items-center gap-1 cursor-pointer touch-manipulation select-none"
            title="Reset Game"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExit();
            }}
            className="min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs transition shadow flex items-center gap-1 cursor-pointer touch-manipulation select-none"
            title="Exit Cabinet"
          >
            <X className="w-4 h-4" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Stage */}
      <div className="flex-1 relative flex items-center justify-center bg-black p-0.5 sm:p-2 min-h-0">
        <canvas
          ref={canvasRef}
          width={520}
          height={600}
          className="w-full h-full max-w-full max-h-full aspect-[13/15] rounded-xl border-2 border-cyan-500/40 shadow-[0_0_40px_rgba(6,182,212,0.25)] bg-slate-950 object-contain"
        />

        {/* Floating In-Game HUD Badges */}
        <div className="absolute top-4 left-6 pointer-events-none flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-cyan-400">BALLS:</span>
            {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
              <span key={i} className="text-sm">⚪</span>
            ))}
          </div>
          {combo > 1 && (
            <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-400 text-[10px] font-black text-amber-300 w-fit animate-bounce">
              x{combo} COMBO!
            </span>
          )}
          {hasFireball && (
            <span className="px-2 py-0.5 rounded bg-orange-950 border border-orange-400 text-[10px] font-black text-orange-200 w-fit flex items-center gap-1 shadow">
              <Flame className="w-3 h-3 text-orange-400" /> FIREBALL ACTIVE
            </span>
          )}
          {hasFloorShield && (
            <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-400 text-[10px] font-black text-cyan-200 w-fit flex items-center gap-1 shadow">
              <Shield className="w-3 h-3 text-cyan-400" /> SAFETY BARRIER ON
            </span>
          )}
        </div>

        {/* INTERACTIVE PAUSED OVERLAY */}
        {isPaused && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 z-30 backdrop-blur-xs">
            <div className="max-w-xs w-full bg-neutral-900 border-2 border-purple-500/80 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(168,85,247,0.4)]">
              <Pause className="w-12 h-12 text-cyan-400 mx-auto mb-2 animate-pulse" />
              <h2 className="text-2xl font-black text-cyan-300 tracking-wider">GAME PAUSED</h2>
              <p className="text-xs text-neutral-400 mt-1 mb-6">Quantum balls held in stasis...</p>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPaused(false)}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm cursor-pointer shadow flex items-center justify-center gap-2 touch-manipulation select-none"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>RESUME GAME</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPaused(false);
                    resetGameRef.current();
                  }}
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-xs cursor-pointer shadow flex items-center justify-center gap-1.5 touch-manipulation select-none"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESTART LEVEL</span>
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-300 font-bold text-xs cursor-pointer shadow border border-neutral-700 touch-manipulation select-none"
                >
                  EXIT TO ARCADE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Game Over Interactive Overlay */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-xs p-4 z-20">
            <div className="bg-neutral-900 border-2 border-rose-500 rounded-2xl p-6 text-center max-w-sm w-full shadow-[0_0_40px_rgba(244,63,94,0.4)]">
              <h2 className="text-3xl font-black text-rose-500 tracking-wider">GAME OVER</h2>
              <div className="mt-3 text-neutral-300 text-sm">
                FINAL SCORE: <span className="text-cyan-400 font-bold">{score}</span>
              </div>
              <div className="text-neutral-400 text-xs mt-1">
                HIGH SCORE: <span className="text-amber-400 font-bold">{highScore}</span>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => resetGameRef.current()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    resetGameRef.current();
                  }}
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black font-black text-sm cursor-pointer shadow-lg transition flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>PLAY AGAIN</span>
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    onExit();
                  }}
                  className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-300 font-bold text-xs cursor-pointer shadow"
                >
                  EXIT TO ARCADE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Level Clear Floating Banner */}
        {gameState === 'level_clear' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs pointer-events-none z-20">
            <div className="bg-neutral-900 border-2 border-cyan-400 rounded-2xl px-8 py-5 text-center shadow-[0_0_35px_rgba(6,182,212,0.5)] animate-pulse">
              <div className="text-2xl font-black text-cyan-300">SECTOR {level} CLEARED!</div>
              <div className="text-xs text-neutral-300 mt-1 uppercase tracking-widest font-mono">
                INITIALIZING NEXT GRID...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Controls */}
      <div className="bg-neutral-900/95 border-t border-neutral-800 px-3 py-2 flex items-center justify-between text-xs text-neutral-400 shrink-0">
        {/* Left/Right Steering */}
        <div className="flex gap-2">
          <button
            type="button"
            onMouseDown={() => setPaddleInputRef.current(-1)}
            onMouseUp={() => setPaddleInputRef.current(0)}
            onTouchStart={(e) => {
              e.preventDefault();
              setPaddleInputRef.current(-1);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              setPaddleInputRef.current(0);
            }}
            className="w-13 h-11 rounded-xl bg-neutral-800 active:bg-cyan-600 border border-neutral-700 text-white font-black text-base flex items-center justify-center cursor-pointer shadow"
          >
            ◀
          </button>
          <button
            type="button"
            onMouseDown={() => setPaddleInputRef.current(1)}
            onMouseUp={() => setPaddleInputRef.current(0)}
            onTouchStart={(e) => {
              e.preventDefault();
              setPaddleInputRef.current(1);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              setPaddleInputRef.current(0);
            }}
            className="w-13 h-11 rounded-xl bg-neutral-800 active:bg-cyan-600 border border-neutral-700 text-white font-black text-base flex items-center justify-center cursor-pointer shadow"
          >
            ▶
          </button>
        </div>

        <span className="hidden sm:inline text-[11px] text-neutral-400">
          A/D or Arrows: Move Paddle • Space: Launch / Fire Lasers
        </span>

        {/* Action Buttons: Launch / Laser */}
        <div className="flex gap-2">
          {laserAmmo > 0 && (
            <button
              type="button"
              onClick={() => fireLasersRef.current()}
              className="px-3 h-11 rounded-xl bg-rose-600 active:bg-rose-500 border border-rose-400 text-white font-black text-xs flex items-center gap-1 cursor-pointer shadow animate-pulse"
            >
              <Zap className="w-4 h-4 text-rose-200" />
              <span>LASERS ({laserAmmo})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => launchBallRef.current()}
            className="px-4 h-11 rounded-xl bg-cyan-600 active:bg-cyan-500 border border-cyan-300 text-white font-black text-xs flex items-center gap-1 cursor-pointer shadow"
          >
            <span>LAUNCH BALL</span>
          </button>
        </div>
      </div>
    </div>
  );
};
