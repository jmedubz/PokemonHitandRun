import React, { useEffect, useRef, useState } from 'react';
import { ArcadeGameProps } from '../types';
import { Volume2, VolumeX, RotateCcw, Siren, Zap, X, Trophy, Play, Pause, ArrowRight } from 'lucide-react';

interface RoadSegment {
  index: number;
  z: number;
  worldY: number;
  curve: number;
  curveX: number;
}

interface ObstacleCar {
  z: number;
  lane: number; // -0.9 to 0.9
  speed: number;
  type: 'sedan' | 'cop' | 'donut';
  color: string;
  spinOut?: boolean;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export const RetroHitAndRunGame: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Gameplay state
  const [score, setScore] = useState(0);
  const [speedMph, setSpeedMph] = useState(0);
  const [stage, setStage] = useState(1);
  const [timeLeft, setTimeLeft] = useState(65);
  const [hitAndRunMeter, setHitAndRunMeter] = useState(0); // 0 to 100%
  const [turboActive, setTurboActive] = useState(false);
  const [turboCharges, setTurboCharges] = useState(2);
  const [gameState, setGameState] = useState<'racing' | 'stage_clear' | 'busted' | 'timeout' | 'victory'>('racing');
  const [soundMuted, setSoundMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const soundMutedRef = useRef(false);
  soundMutedRef.current = soundMuted;
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const triggerTurboRef = useRef<() => void>(() => {});
  const resetGameRef = useRef<() => void>(() => {});
  const nextStageRef = useRef<() => void>(() => {});
  const setSteerInputRef = useRef<(dir: number) => void>(() => {});
  const setGasInputRef = useRef<(gas: boolean) => void>(() => {});

  // Web Audio Sound System
  const playSfx = (type: 'rev' | 'drift' | 'crash' | 'siren' | 'donut' | 'turbo' | 'win' | 'checkpoint') => {
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

      if (type === 'rev') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.linearRampToValueAtTime(180, now + 0.15);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'drift') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.18);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'siren') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.linearRampToValueAtTime(960, now + 0.25);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'donut') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.08);
        osc.frequency.setValueAtTime(880, now + 0.16);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'turbo') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(750, now + 0.45);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'checkpoint') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554, now + 0.09);
        osc.frequency.setValueAtTime(659, now + 0.18);
        osc.frequency.setValueAtTime(880, now + 0.28);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.12);
        osc.frequency.setValueAtTime(784, now + 0.24);
        osc.frequency.setValueAtTime(1046, now + 0.36);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    } catch {}
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    // Pseudo 3D Road parameters
    const ROAD_SEGMENT_LENGTH = 180;
    const TOTAL_SEGMENTS = 1000;
    const FINISH_Z = (TOTAL_SEGMENTS - 70) * ROAD_SEGMENT_LENGTH;
    const segments: RoadSegment[] = [];

    let accumulatedCurve = 0;
    for (let i = 0; i < TOTAL_SEGMENTS; i++) {
      let curve = 0;
      if (i > 60 && i < 200) curve = 2.2;
      else if (i > 260 && i < 420) curve = -2.8;
      else if (i > 480 && i < 660) curve = 3.2;
      else if (i > 720 && i < 880) curve = -2.4;

      accumulatedCurve += curve * 0.15;
      const worldY = Math.sin(i / 16) * 120;
      segments.push({
        index: i,
        z: i * ROAD_SEGMENT_LENGTH,
        worldY,
        curve,
        curveX: accumulatedCurve,
      });
    }

    // Safe segment retrieval preventing undefined access
    const getSegment = (idx: number): RoadSegment => {
      const safeIdx = ((Math.floor(idx) % TOTAL_SEGMENTS) + TOTAL_SEGMENTS) % TOTAL_SEGMENTS;
      return segments[safeIdx] || segments[0];
    };

    // Player state
    let playerX = 0; // -1 to 1 across road
    let playerZ = 0;
    let playerSpeed = 80;
    const maxSpeed = 160;
    const turboSpeed = 220;
    let isAccelerating = true;
    let steerDir = 0;
    let invulnerableTimer = 0; // Grace period after crashing

    // Sparks
    const sparks: SparkParticle[] = [];
    const createSparks = (x: number, y: number, color = '#f59e0b', count = 15) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 50 + Math.random() * 140;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 0.25 + Math.random() * 0.25,
          color,
        });
      }
    };

    // Traffic cars
    const traffic: ObstacleCar[] = [];
    const spawnTraffic = () => {
      traffic.length = 0;
      for (let i = 12; i < TOTAL_SEGMENTS - 60; i += 18) {
        const isDonut = Math.random() < 0.25;
        const isCop = !isDonut && Math.random() < 0.28;
        traffic.push({
          z: i * ROAD_SEGMENT_LENGTH,
          lane: (Math.random() - 0.5) * 1.5,
          speed: isDonut ? 0 : 45 + Math.random() * 40,
          type: isDonut ? 'donut' : isCop ? 'cop' : 'sedan',
          color: isDonut ? '#f43f5e' : isCop ? '#1e3a8a' : ['#ef4444', '#eab308', '#10b981', '#a855f7', '#ec4899', '#06b6d4'][Math.floor(Math.random() * 6)],
          spinOut: false,
        });
      }
    };
    spawnTraffic();

    let curScore = 0;
    let curTime = 65;
    let curHnr = 0;
    let curTurbos = 2;
    let isTurbo = false;
    let turboDuration = 0;
    let currentStage = 1;
    let activeState: 'racing' | 'stage_clear' | 'busted' | 'timeout' | 'victory' = 'racing';

    setSteerInputRef.current = (dir: number) => {
      steerDir = dir;
    };
    setGasInputRef.current = (gas: boolean) => {
      isAccelerating = gas;
    };

    const triggerTurbo = () => {
      if (curTurbos <= 0 || isTurbo || activeState !== 'racing') return;
      curTurbos--;
      setTurboCharges(curTurbos);
      isTurbo = true;
      turboDuration = 3.5;
      setTurboActive(true);
      playSfx('turbo');
    };
    triggerTurboRef.current = triggerTurbo;

    const startNextStage = () => {
      if (currentStage >= 3) {
        activeState = 'victory';
        setGameState('victory');
        return;
      }
      currentStage += 1;
      setStage(currentStage);
      playerZ = 0;
      playerX = 0;
      playerSpeed = 90;
      curTime = Math.min(90, curTime + 35); // Bonus time for clearing stage
      setTimeLeft(Math.ceil(curTime));
      curTurbos = Math.min(3, curTurbos + 1);
      setTurboCharges(curTurbos);
      curHnr = Math.max(0, curHnr - 30);
      setHitAndRunMeter(Math.round(curHnr));
      spawnTraffic();
      activeState = 'racing';
      setGameState('racing');
      playSfx('checkpoint');
    };
    nextStageRef.current = startNextStage;

    const resetGame = () => {
      playerX = 0;
      playerZ = 0;
      playerSpeed = 80;
      curScore = 0;
      curTime = 65;
      curHnr = 0;
      curTurbos = 2;
      isTurbo = false;
      currentStage = 1;
      invulnerableTimer = 0;
      setScore(0);
      setTimeLeft(65);
      setHitAndRunMeter(0);
      setTurboCharges(2);
      setTurboActive(false);
      setStage(1);
      activeState = 'racing';
      setGameState('racing');
      spawnTraffic();
    };
    resetGameRef.current = resetGame;

    // Keyboard handlers
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeState !== 'racing') {
        if (e.code === 'KeyR') resetGame();
        if (e.code === 'Space' || e.code === 'Enter') {
          if (activeState === 'stage_clear') startNextStage();
          else resetGame();
        }
        if (e.code === 'Escape') onExit();
        return;
      }

      if (e.code === 'KeyP') {
        setIsPaused((prev) => !prev);
        return;
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') steerDir = -1;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') steerDir = 1;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') isAccelerating = true;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') isAccelerating = false;
      if (e.code === 'Space' || e.code === 'ShiftLeft') triggerTurbo();
      if (e.code === 'KeyR') resetGame();
      if (e.code === 'Escape') onExit();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (
        ((e.code === 'ArrowLeft' || e.code === 'KeyA') && steerDir === -1) ||
        ((e.code === 'ArrowRight' || e.code === 'KeyD') && steerDir === 1)
      ) {
        steerDir = 0;
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

      if (activeState === 'racing') {
        // Invulnerability timer countdown
        if (invulnerableTimer > 0) {
          invulnerableTimer -= dt;
        }

        // Turbo timer
        if (isTurbo) {
          turboDuration -= dt;
          if (turboDuration <= 0) {
            isTurbo = false;
            setTurboActive(false);
          }
        }

        // Hit & Run slow cooldown when driving clean
        if (curHnr > 0) {
          curHnr = Math.max(0, curHnr - dt * 3.2);
          setHitAndRunMeter(Math.round(curHnr));
        }

        // Countdown timer
        curTime -= dt;
        setTimeLeft(Math.max(0, Math.ceil(curTime)));
        if (curTime <= 0) {
          activeState = 'timeout';
          setGameState('timeout');
          playSfx('crash');
        }

        // Acceleration & cruising speed
        const topSpeed = isTurbo ? turboSpeed : maxSpeed;
        if (isAccelerating) {
          playerSpeed = Math.min(topSpeed, playerSpeed + (isTurbo ? 150 : 85) * dt);
        } else {
          // Coasting
          playerSpeed = Math.max(70, playerSpeed - 60 * dt);
        }
        setSpeedMph(Math.round(playerSpeed));

        // Steering with centrifugal curve force
        const currentSegment = getSegment(Math.floor(playerZ / ROAD_SEGMENT_LENGTH));
        const curveForce = (currentSegment?.curve || 0) * (playerSpeed / maxSpeed) * 1.4;

        playerX += steerDir * 2.5 * dt;
        playerX -= curveForce * dt * 0.45;
        playerX = Math.max(-1.4, Math.min(1.4, playerX));

        // Off-road penalty
        if (Math.abs(playerX) > 1.0) {
          playerSpeed = Math.max(35, playerSpeed - 110 * dt);
          if (Math.random() < 0.2) playSfx('drift');
        }

        // Advance along road
        playerZ += playerSpeed * 11 * dt;
        curScore += Math.round(playerSpeed * dt * 4);
        setScore(curScore);

        // Check Stage Finish Line
        if (playerZ >= FINISH_Z) {
          if (currentStage >= 3) {
            activeState = 'victory';
            setGameState('victory');
            curScore += 15000;
            setScore(curScore);
            playSfx('win');
          } else {
            activeState = 'stage_clear';
            setGameState('stage_clear');
            curScore += 5000 * currentStage;
            setScore(curScore);
            playSfx('checkpoint');
          }
        }

        // Traffic update, respawn ahead, and collisions
        traffic.forEach((car) => {
          if (!car) return;
          if (car.spinOut) {
            car.lane += (car.lane > 0 ? 1.5 : -1.5) * dt;
            car.speed = Math.max(0, car.speed - 75 * dt);
          } else {
            car.z += car.speed * 6 * dt;
          }

          // If car is far behind player, respawn it ahead
          if (car.z < playerZ - 300) {
            car.z = playerZ + 2000 + Math.random() * 1800;
            car.lane = (Math.random() - 0.5) * 1.5;
            car.spinOut = false;
            const isDonut = Math.random() < 0.25;
            const isCop = !isDonut && Math.random() < 0.28;
            car.type = isDonut ? 'donut' : isCop ? 'cop' : 'sedan';
            car.speed = isDonut ? 0 : 45 + Math.random() * 40;
            car.color = isDonut ? '#f43f5e' : isCop ? '#1e3a8a' : ['#ef4444', '#eab308', '#10b981', '#a855f7', '#ec4899', '#06b6d4'][Math.floor(Math.random() * 6)];
          }

          // Collision check
          const relZ = car.z - playerZ;
          const distX = Math.abs(car.lane - playerX);

          if (relZ > -30 && relZ < 140 && distX < 0.38) {
            if (car.type === 'donut') {
              // Collect bonus donut!
              playSfx('donut');
              curScore += 1200;
              curTurbos = Math.min(3, curTurbos + 1);
              setTurboCharges(curTurbos);
              curHnr = Math.max(0, curHnr - 20);
              setHitAndRunMeter(Math.round(curHnr));
              car.z = playerZ + 2400 + Math.random() * 1600; // respawn ahead safely
              car.lane = (Math.random() - 0.5) * 1.5;
              createSparks(canvas.width / 2, canvas.height - 70, '#f43f5e', 20);
            } else if (invulnerableTimer <= 0) {
              // Smash into traffic car!
              playSfx('crash');
              invulnerableTimer = 1.3; // 1.3 seconds grace period
              playerSpeed = Math.max(35, playerSpeed * 0.45);
              car.spinOut = true;
              car.lane += playerX > car.lane ? -0.8 : 0.8;
              createSparks(canvas.width / 2, canvas.height - 70, '#fbbf24', 25);

              // Fair Hit & Run penalty
              const penalty = car.type === 'cop' ? 24 : 15;
              curHnr = Math.min(100, curHnr + penalty);
              setHitAndRunMeter(Math.round(curHnr));

              if (curHnr >= 100) {
                playSfx('siren');
                activeState = 'busted';
                setGameState('busted');
              }
            }
          }
        });
      } else {
        // Slow down car when not racing
        playerSpeed = Math.max(0, playerSpeed - 120 * dt);
        setSpeedMph(Math.round(playerSpeed));
      }

      // Update sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.life -= dt;
        if (sp.life <= 0) sparks.splice(i, 1);
      }

      // -------------------------------------------------------------
      // 2.5D ROAD RENDERING
      // -------------------------------------------------------------
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Skyline based on stage
      const skyY = 160;
      if (currentStage === 1) {
        // Daytime Springfield
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(0, 0, canvas.width, skyY);
        // Sun
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(canvas.width * 0.8, 50, 28, 0, Math.PI * 2);
        ctx.fill();
      } else if (currentStage === 2) {
        // Dusk Nuclear Grid
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(0, 0, canvas.width, skyY);
        // Orange sunset horizon
        const grad = ctx.createLinearGradient(0, skyY - 60, 0, skyY);
        grad.addColorStop(0, 'rgba(234, 88, 12, 0)');
        grad.addColorStop(1, '#ea580c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, skyY - 60, canvas.width, 60);
      } else {
        // Neon Night Chase
        ctx.fillStyle = '#09090b';
        ctx.fillRect(0, 0, canvas.width, skyY);
        // Neon grid horizon
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, skyY);
        ctx.lineTo(canvas.width, skyY);
        ctx.stroke();
      }

      // Parallax Hills & Springfield Skyline
      ctx.fillStyle = currentStage === 3 ? '#18181b' : '#1e293b';
      ctx.beginPath();
      ctx.ellipse(canvas.width * 0.3 - playerX * 25, skyY, 160, 45, 0, 0, Math.PI);
      ctx.ellipse(canvas.width * 0.7 - playerX * 25, skyY, 220, 60, 0, 0, Math.PI);
      ctx.fill();

      // Springfield Cooling Towers
      const towerX = canvas.width * 0.2 - playerX * 30;
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(towerX - 25, skyY);
      ctx.lineTo(towerX - 18, skyY - 70);
      ctx.lineTo(towerX + 18, skyY - 70);
      ctx.lineTo(towerX + 25, skyY);
      ctx.closePath();
      ctx.fill();

      // Green nuclear glow on Stage 2
      if (currentStage === 2) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.4)';
        ctx.beginPath();
        ctx.arc(towerX, skyY - 70, 18, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ground (Grass / Roadside)
      ctx.fillStyle = currentStage === 1 ? '#15803d' : currentStage === 2 ? '#365314' : '#1e1b4b';
      ctx.fillRect(0, skyY, canvas.width, canvas.height - skyY);

      // Project Function for 2.5D road & objects
      const baseSegmentIdx = Math.floor(playerZ / ROAD_SEGMENT_LENGTH);
      const baseSeg = getSegment(baseSegmentIdx);

      const project = (z: number, xOffset: number, yOffset: number) => {
        const relZ = z - playerZ;
        if (relZ <= 30) return null;
        const p = 220 / relZ;
        const factor = Math.pow(Math.min(1.3, p), 0.76);
        const screenY = skyY + factor * (canvas.height - skyY) - yOffset * factor * 0.35;
        const screenX = (canvas.width / 2) + (xOffset - playerX * 260) * factor;
        const roadW = (canvas.width * 0.45) * factor * 1.95;
        return { screenX, screenY, roadW, factor, relZ };
      };

      // Draw Road Segments (Back to Front)
      const DRAW_DISTANCE = 140;
      for (let n = DRAW_DISTANCE; n > 0; n--) {
        const seg1 = getSegment(baseSegmentIdx + n);
        const seg2 = getSegment(baseSegmentIdx + n - 1);

        const p1 = project(seg1.z, seg1.curveX - baseSeg.curveX, seg1.worldY);
        const p2 = project(seg2.z, seg2.curveX - baseSeg.curveX, seg2.worldY);

        if (!p1 || !p2 || p2.screenY <= p1.screenY) continue;

        // Striped road pattern
        const isEven = Math.floor(seg2.index / 4) % 2 === 0;
        const roadColor = isEven ? '#334155' : '#1e293b';
        const rumbleColor = isEven ? '#ef4444' : '#ffffff';

        // Draw Asphalt
        ctx.fillStyle = roadColor;
        ctx.beginPath();
        ctx.moveTo(p1.screenX - p1.roadW, p1.screenY);
        ctx.lineTo(p1.screenX + p1.roadW, p1.screenY);
        ctx.lineTo(p2.screenX + p2.roadW, p2.screenY);
        ctx.lineTo(p2.screenX - p2.roadW, p2.screenY);
        ctx.closePath();
        ctx.fill();

        // Rumble Strips
        const r1 = p1.roadW * 0.12;
        const r2 = p2.roadW * 0.12;
        ctx.fillStyle = rumbleColor;
        // Left rumble
        ctx.beginPath();
        ctx.moveTo(p1.screenX - p1.roadW, p1.screenY);
        ctx.lineTo(p1.screenX - p1.roadW + r1, p1.screenY);
        ctx.lineTo(p2.screenX - p2.roadW + r2, p2.screenY);
        ctx.lineTo(p2.screenX - p2.roadW, p2.screenY);
        ctx.closePath();
        ctx.fill();
        // Right rumble
        ctx.beginPath();
        ctx.moveTo(p1.screenX + p1.roadW - r1, p1.screenY);
        ctx.lineTo(p1.screenX + p1.roadW, p1.screenY);
        ctx.lineTo(p2.screenX + p2.roadW, p2.screenY);
        ctx.lineTo(p2.screenX + p2.roadW - r2, p2.screenY);
        ctx.closePath();
        ctx.fill();

        // Center Yellow Dash
        if (isEven) {
          const dashW1 = p1.roadW * 0.025;
          const dashW2 = p2.roadW * 0.025;
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.moveTo(p1.screenX - dashW1 / 2, p1.screenY);
          ctx.lineTo(p1.screenX + dashW1 / 2, p1.screenY);
          ctx.lineTo(p2.screenX + dashW2 / 2, p2.screenY);
          ctx.lineTo(p2.screenX - dashW2 / 2, p2.screenY);
          ctx.closePath();
          ctx.fill();
        }

        // Finish Line Banner at FINISH_Z
        if (seg2.z >= FINISH_Z - ROAD_SEGMENT_LENGTH && seg2.z <= FINISH_Z + ROAD_SEGMENT_LENGTH) {
          ctx.fillStyle = isEven ? '#000000' : '#ffffff';
          ctx.fillRect(p2.screenX - p2.roadW, p2.screenY - 4, p2.roadW * 2, 8);
        }
      }

      // Draw Traffic Cars (Back to Front)
      const sortedTraffic = [...traffic].filter((c) => c && typeof c.z === 'number').sort((a, b) => b.z - a.z);
      sortedTraffic.forEach((car) => {
        const seg = getSegment(Math.floor(car.z / ROAD_SEGMENT_LENGTH));
        const proj = project(car.z, (seg ? seg.curveX - baseSeg.curveX : 0) + car.lane * 260, seg ? seg.worldY : 0);
        if (proj && proj.relZ > 40 && proj.relZ < 3500) {
          const carScreenX = proj.screenX;
          const carScreenY = proj.screenY;
          const carW = Math.max(16, 130 * proj.factor);
          const carH = carW * 0.52;

          if (car.type === 'donut') {
            // Giant spinning bonus donut
            ctx.fillStyle = '#f43f5e';
            ctx.beginPath();
            ctx.arc(carScreenX, carScreenY - carH * 0.6, carW * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fed7aa';
            ctx.beginPath();
            ctx.arc(carScreenX, carScreenY - carH * 0.6, carW * 0.2, 0, Math.PI * 2);
            ctx.fill();
            // Sprinkles
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(carScreenX - carW * 0.15, carScreenY - carH * 0.75, 4, 4);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(carScreenX + carW * 0.15, carScreenY - carH * 0.45, 4, 4);
            ctx.fillStyle = '#a855f7';
            ctx.fillRect(carScreenX - carW * 0.2, carScreenY - carH * 0.45, 4, 4);
          } else {
            // Vehicle body
            ctx.fillStyle = car.color;
            ctx.beginPath();
            ctx.roundRect(carScreenX - carW / 2, carScreenY - carH, carW, carH, 6 * proj.factor);
            ctx.fill();

            // Roof / Cabin
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.roundRect(carScreenX - carW * 0.35, carScreenY - carH * 1.5, carW * 0.7, carH * 0.6, [6 * proj.factor, 6 * proj.factor, 0, 0]);
            ctx.fill();

            // Rear window
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(carScreenX - carW * 0.28, carScreenY - carH * 1.45, carW * 0.56, carH * 0.45);

            // Cop roof light bar
            if (car.type === 'cop') {
              ctx.fillStyle = Math.floor(now / 140) % 2 === 0 ? '#ef4444' : '#3b82f6';
              ctx.fillRect(carScreenX - carW * 0.25, carScreenY - carH * 1.75, carW * 0.5, carH * 0.28);
            }

            // Tail lights
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(carScreenX - carW * 0.45, carScreenY - carH * 0.35, carW * 0.22, carH * 0.22);
            ctx.fillRect(carScreenX + carW * 0.23, carScreenY - carH * 0.35, carW * 0.22, carH * 0.22);
          }
        }
      });

      // Render Player Vehicle (Retro 70s Springfield Pink Sedan)
      const pW = 150;
      const pH = 75;
      const pX = canvas.width / 2;
      const pY = canvas.height - 35;

      // Invulnerability flicker
      const shouldDrawPlayer = invulnerableTimer <= 0 || Math.floor(now / 80) % 2 === 0;

      if (shouldDrawPlayer) {
        // Car shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(pX, pY + 10, pW * 0.55, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Nitro exhaust flames
        if (isTurbo) {
          ctx.fillStyle = Math.random() < 0.5 ? '#06b6d4' : '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(pX - pW * 0.3, pY);
          ctx.lineTo(pX - pW * 0.38, pY + 28 + Math.random() * 15);
          ctx.lineTo(pX - pW * 0.22, pY);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(pX + pW * 0.3, pY);
          ctx.lineTo(pX + pW * 0.38, pY + 28 + Math.random() * 15);
          ctx.lineTo(pX + pW * 0.22, pY);
          ctx.fill();
        }

        // Tires
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(pX - pW * 0.48, pY - 12, 22, 26);
        ctx.fillRect(pX + pW * 0.48 - 22, pY - 12, 22, 26);

        // Lower Chassis (Iconic Springfield Pink)
        ctx.fillStyle = '#ec4899';
        ctx.beginPath();
        ctx.roundRect(pX - pW * 0.5, pY - pH * 0.65, pW, pH * 0.65, 8);
        ctx.fill();

        // Rear Bumper & License Plate
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(pX - pW * 0.46, pY - 14, pW * 0.92, 12);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(pX - 22, pY - 12, 44, 8);

        // Roof / Cabin
        ctx.fillStyle = '#db2777';
        ctx.beginPath();
        ctx.roundRect(pX - pW * 0.38, pY - pH * 1.25, pW * 0.76, pH * 0.65, [10, 10, 0, 0]);
        ctx.fill();

        // Rear Window
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(pX - pW * 0.32, pY - pH * 1.18, pW * 0.64, pH * 0.45);

        // Taillights
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(pX - pW * 0.45, pY - pH * 0.45, 20, 14);
        ctx.fillRect(pX + pW * 0.45 - 20, pY - pH * 0.45, 20, 14);
      }

      // Draw Sparks
      sparks.forEach((sp) => {
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [stage]);

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950 text-white font-mono select-none overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-950 via-neutral-900 to-rose-950 border-b border-amber-500/70 px-2 py-1 sm:px-4 sm:py-1.5 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 truncate">
          <Siren className="w-4 h-4 text-rose-500 animate-pulse shrink-0" />
          <div className="truncate">
            <h1 className="text-xs sm:text-sm font-black text-amber-300 tracking-wider flex items-center gap-1.5 truncate">
              HIT & RUN <span className="hidden xs:inline text-[9px] px-1 py-0.2 rounded bg-amber-600/30 text-amber-200 border border-amber-500/50">TURBO</span>
            </h1>
            <p className="hidden sm:inline-block text-[10px] text-neutral-400">
              Stage {stage}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 text-xs shrink-0">
          <div className="text-[11px] text-neutral-200">
            MPH:<span className="text-amber-400 font-black ml-0.5">{speedMph}</span>
          </div>
          <div className="text-[11px] text-neutral-200">
            TIME:<span className={`${timeLeft < 15 ? 'text-rose-500 animate-pulse' : 'text-emerald-400'} font-black ml-0.5`}>{timeLeft}s</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSoundMuted((prev) => !prev);
            }}
            className="h-7 sm:h-8 w-7 sm:w-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-300 transition cursor-pointer touch-manipulation select-none flex items-center justify-center"
            title="Toggle Audio"
          >
            {soundMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsPaused((prev) => !prev);
            }}
            className="h-7 sm:h-8 px-2 rounded-lg bg-purple-900/80 hover:bg-purple-800 active:bg-purple-700 text-purple-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-purple-500/40 touch-manipulation select-none"
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
            className="h-7 sm:h-8 px-2 rounded-lg bg-amber-800 hover:bg-amber-700 active:bg-amber-600 text-xs font-bold transition flex items-center gap-1 cursor-pointer touch-manipulation select-none"
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
            className="h-7 sm:h-8 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs transition shadow flex items-center gap-1 cursor-pointer touch-manipulation select-none"
            title="Exit Cabinet"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Stage */}
      <div className="flex-1 relative flex items-center justify-center bg-black p-0.5 sm:p-2 min-h-0">
        <canvas
          ref={canvasRef}
          width={560}
          height={480}
          className="w-full h-full max-w-full max-h-full aspect-[7/6] rounded-xl border-2 border-amber-500/40 shadow-[0_0_35px_rgba(245,158,11,0.25)] bg-slate-950 object-contain"
        />

        {/* Floating In-Game Hit & Run Meter */}
        <div className="absolute top-4 right-6 pointer-events-none flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1 text-[10px] font-black text-rose-400">
            <Siren className="w-3.5 h-3.5 animate-bounce" />
            <span>HIT & RUN METER</span>
          </div>
          <div className="w-32 h-3.5 bg-neutral-900 rounded-full border border-rose-500/60 overflow-hidden shadow">
            <div
              className={`h-full transition-all duration-75 ${
                hitAndRunMeter > 70 ? 'bg-rose-600 animate-pulse' : hitAndRunMeter > 35 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${hitAndRunMeter}%` }}
            />
          </div>
        </div>

        {/* Top Left Score & Turbos */}
        <div className="absolute top-4 left-6 pointer-events-none flex flex-col gap-1">
          <span className="text-xs text-neutral-300 font-bold">
            SCORE: <span className="text-amber-400 font-black">{score}</span>
          </span>
          <div className="flex items-center gap-1 text-xs text-cyan-300">
            <span>NITRO:</span>
            {Array.from({ length: turboCharges }).map((_, i) => (
              <span key={i} className="text-amber-300">⚡</span>
            ))}
          </div>
        </div>

        {/* INTERACTIVE PAUSED OVERLAY */}
        {isPaused && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 z-30 backdrop-blur-xs">
            <div className="max-w-xs w-full bg-neutral-900 border-2 border-purple-500/80 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(168,85,247,0.4)]">
              <Pause className="w-12 h-12 text-amber-400 mx-auto mb-2 animate-pulse" />
              <h2 className="text-2xl font-black text-amber-300 tracking-wider">GAME PAUSED</h2>
              <p className="text-xs text-neutral-400 mt-1 mb-6">Take a breather, driver!</p>
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
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow flex items-center justify-center gap-1.5 touch-manipulation select-none"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESTART STAGE</span>
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

        {/* INTERACTIVE STAGE CLEAR OVERLAY */}
        {gameState === 'stage_clear' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 z-20 backdrop-blur-xs">
            <div className="max-w-sm w-full bg-gradient-to-b from-amber-950 to-neutral-900 border-2 border-amber-400 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(245,158,11,0.4)]">
              <Trophy className="w-12 h-12 text-amber-300 mx-auto mb-2" />
              <h2 className="text-2xl font-black text-amber-300">STAGE {stage} CLEARED!</h2>
              <p className="text-xs text-neutral-300 mt-1">Checkpoint reached with time to spare!</p>
              <div className="my-4 py-2 px-3 bg-neutral-800/80 rounded-xl text-xs space-y-1">
                <div className="text-neutral-400">Time Bonus: <span className="text-emerald-400 font-bold">+35 Seconds</span></div>
                <div className="text-neutral-400">Nitro Refill: <span className="text-cyan-400 font-bold">+1 Charge</span></div>
                <div className="text-amber-400 font-black text-sm pt-1">SCORE: {score}</div>
              </div>
              <button
                type="button"
                onClick={() => nextStageRef.current()}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-neutral-950 font-black text-sm cursor-pointer shadow flex items-center justify-center gap-1.5 transition"
              >
                <span>PROCEED TO STAGE {stage + 1}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* INTERACTIVE VICTORY OVERLAY */}
        {gameState === 'victory' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4 z-20 backdrop-blur-xs">
            <div className="max-w-sm w-full bg-gradient-to-b from-amber-950 via-slate-900 to-neutral-950 border-3 border-amber-300 rounded-2xl p-6 text-center shadow-[0_0_60px_rgba(250,204,21,0.5)]">
              <Trophy className="w-14 h-14 text-amber-300 mx-auto mb-2 animate-bounce" />
              <h2 className="text-2xl font-black text-amber-300">HIGHWAY LIBERATED!</h2>
              <p className="text-xs text-neutral-200 mt-1">You outran the entire Springfield police department and conquered all 3 stages!</p>
              <div className="my-4 text-xl font-black text-amber-400">FINAL SCORE: {score}</div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => resetGameRef.current()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    resetGameRef.current();
                  }}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-neutral-950 font-black text-sm cursor-pointer shadow flex items-center justify-center gap-1.5 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>RACE AGAIN</span>
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

        {/* INTERACTIVE BUSTED OVERLAY */}
        {gameState === 'busted' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4 z-20 backdrop-blur-xs">
            <div className="max-w-sm w-full bg-gradient-to-b from-rose-950 to-neutral-900 border-2 border-rose-500 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(239,68,68,0.4)]">
              <Siren className="w-12 h-12 text-rose-400 mx-auto mb-2 animate-pulse" />
              <h2 className="text-2xl font-black text-rose-400">BUSTED!</h2>
              <p className="text-xs text-neutral-300 mt-1">Hit & Run meter reached 100%! Springfield Police pulled you over!</p>
              <div className="my-4 p-3 bg-neutral-800/80 rounded-xl text-left text-xs text-neutral-300 space-y-1">
                <div className="text-amber-400 font-bold">DRIVER TIP:</div>
                <p>Snag floating pink Donuts to instantly cool down your Hit & Run heat and refill Nitro!</p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => resetGameRef.current()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    resetGameRef.current();
                  }}
                  className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-sm cursor-pointer shadow flex items-center justify-center gap-1.5 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>TRY AGAIN</span>
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

        {/* INTERACTIVE TIMEOUT OVERLAY */}
        {gameState === 'timeout' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4 z-20 backdrop-blur-xs">
            <div className="max-w-sm w-full bg-gradient-to-b from-amber-950 to-neutral-900 border-2 border-amber-500 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(245,158,11,0.4)]">
              <h2 className="text-2xl font-black text-amber-400">OUT OF TIME!</h2>
              <p className="text-xs text-neutral-300 mt-1">You ran out of clock before reaching the stage checkpoint.</p>
              <div className="my-4 text-lg font-black text-amber-300">SCORE: {score}</div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => resetGameRef.current()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    resetGameRef.current();
                  }}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-neutral-950 font-black text-sm cursor-pointer shadow flex items-center justify-center gap-1.5 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>RETRY STAGE</span>
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
      </div>

      {/* Mobile Racing Controls */}
      <div className="bg-neutral-900/95 border-t border-neutral-800 px-3 py-2 flex items-center justify-between text-xs text-neutral-400 shrink-0">
        {/* Left/Right Steer */}
        <div className="flex gap-2">
          <button
            type="button"
            onMouseDown={() => setSteerInputRef.current(-1)}
            onMouseUp={() => setSteerInputRef.current(0)}
            onTouchStart={(e) => {
              e.preventDefault();
              setSteerInputRef.current(-1);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              setSteerInputRef.current(0);
            }}
            className="w-13 h-11 rounded-xl bg-neutral-800 active:bg-amber-600 border border-neutral-700 text-white font-black text-base flex items-center justify-center cursor-pointer shadow"
          >
            ◀
          </button>
          <button
            type="button"
            onMouseDown={() => setSteerInputRef.current(1)}
            onMouseUp={() => setSteerInputRef.current(0)}
            onTouchStart={(e) => {
              e.preventDefault();
              setSteerInputRef.current(1);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              setSteerInputRef.current(0);
            }}
            className="w-13 h-11 rounded-xl bg-neutral-800 active:bg-amber-600 border border-neutral-700 text-white font-black text-base flex items-center justify-center cursor-pointer shadow"
          >
            ▶
          </button>
        </div>

        <span className="hidden sm:inline text-[11px] text-neutral-400">
          A/D or Arrows: Steer • W/S: Gas & Brake • Space: Nitro Turbo
        </span>

        {/* Gas / Nitro Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => triggerTurboRef.current()}
            disabled={turboCharges <= 0}
            className={`px-3 h-11 rounded-xl font-black text-xs flex items-center gap-1 cursor-pointer shadow ${
              turboCharges > 0
                ? 'bg-cyan-600 active:bg-cyan-500 border border-cyan-300 text-white animate-pulse'
                : 'bg-neutral-800 border border-neutral-700 text-neutral-500 cursor-not-allowed opacity-50'
            }`}
          >
            <Zap className="w-4 h-4 text-cyan-200" />
            <span>NITRO ({turboCharges})</span>
          </button>

          <button
            type="button"
            onMouseDown={() => setGasInputRef.current(false)}
            onMouseUp={() => setGasInputRef.current(true)}
            onTouchStart={(e) => {
              e.preventDefault();
              setGasInputRef.current(false);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              setGasInputRef.current(true);
            }}
            className="px-3 h-11 rounded-xl bg-amber-800/90 active:bg-amber-700 border border-amber-600/60 text-amber-200 font-black text-xs flex items-center gap-1 cursor-pointer shadow"
          >
            <span>BRAKE</span>
          </button>

          <button
            type="button"
            onMouseDown={() => setGasInputRef.current(true)}
            onMouseUp={() => setGasInputRef.current(true)}
            onTouchStart={(e) => {
              e.preventDefault();
              setGasInputRef.current(true);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              setGasInputRef.current(true);
            }}
            className="px-4 h-11 rounded-xl bg-emerald-600 active:bg-emerald-500 border border-emerald-300 text-white font-black text-xs flex items-center gap-1 cursor-pointer shadow"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>GAS</span>
          </button>
        </div>
      </div>
    </div>
  );
};
