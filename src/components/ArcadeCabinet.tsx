import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Play, RotateCcw, X, Tv } from 'lucide-react';
import { getArcadeGame } from '../arcade/registry';

export interface ArcadeCabinetProps {
  onExit: () => void;
  machineName?: string;
  gameId?: string;
}

// Retro 8-bit sound synthesizer using Web Audio API
class ArcadeSoundSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private isMuted: boolean = false;
  private musicInterval: number | null = null;

  constructor() {
    // AudioContext will be lazily initialized on first user interaction
  }

  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.28;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private safeSetTargetAtTime(
    param: AudioParam,
    target: number,
    startTime: number,
    timeConstant: number,
    fallback: number = 0
  ) {
    try {
      const safeTarget = Number.isFinite(target) ? target : fallback;
      const safeStart = Number.isFinite(startTime) && startTime >= 0 ? startTime : (this.ctx?.currentTime ?? 0);
      const safeTc = Number.isFinite(timeConstant) && timeConstant > 0 ? timeConstant : 0.05;
      param.setTargetAtTime(safeTarget, safeStart, safeTc);
    } catch {
      try {
        if (Number.isFinite(target)) {
          param.value = target;
        }
      } catch {}
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain) {
      try {
        this.masterGain.gain.value = muted ? 0 : 0.28;
      } catch {}
    }
  }

  startEngine() {
    this.ensureContext();
    if (!this.ctx || !this.masterGain || this.engineOsc) return;

    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
      this.engineOsc.frequency.setValueAtTime(55, now);
      this.engineGain.gain.setValueAtTime(0.04, now);
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);
      this.engineOsc.start();
    } catch {
      // Ignored
    }
  }

  updateEngine(speedRatio: number) {
    if (!this.ctx || !this.engineOsc) return;
    const safeRatio = Number.isFinite(speedRatio) ? Math.max(0, Math.min(2.5, speedRatio)) : 0;
    const targetFreq = 48 + safeRatio * 180;
    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    this.safeSetTargetAtTime(this.engineOsc.frequency, targetFreq, now, 0.05, 48);
  }

  stopEngine() {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
      } catch {}
      this.engineOsc = null;
    }
  }

  playCoin() {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(987.77, t); // B5
      osc.frequency.setValueAtTime(1318.51, t + 0.08); // E6
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.35);
    } catch {}
  }

  playBoost() {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.3);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch {}
  }

  playCrash() {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
      // Noise crunch
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * 0.3));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, t);
      filter.frequency.exponentialRampToValueAtTime(80, t + 0.25);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(t);
    } catch {}
  }

  playGameOver() {
    this.ensureContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const t = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
      const notes = [440, 415, 392, 349, 330];
      notes.forEach((freq, idx) => {
        try {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, t + idx * 0.15);
          gain.gain.setValueAtTime(0.15, t + idx * 0.15);
          gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.15 + 0.2);
          osc.connect(gain);
          gain.connect(this.masterGain!);
          osc.start(t + idx * 0.15);
          osc.stop(t + idx * 0.15 + 0.2);
        } catch {}
      });
    } catch {}
  }

  startChiptuneBGM() {
    this.ensureContext();
    if (this.musicInterval) return;
    const melody = [261.63, 293.66, 329.63, 392.00, 523.25, 392.00, 329.63, 293.66];
    let noteIdx = 0;
    this.musicInterval = window.setInterval(() => {
      if (!this.ctx || !this.masterGain || this.isMuted) return;
      try {
        const t = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(melody[noteIdx], t);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.18);
        noteIdx = (noteIdx + 1) % melody.length;
      } catch {}
    }, 220);
  }

  stopChiptuneBGM() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  destroy() {
    this.stopEngine();
    this.stopChiptuneBGM();
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
  }
}

interface RoadSegment {
  index: number;
  p1: { world: { z: number }; screen: { x: number; y: number; w: number } };
  p2: { world: { z: number }; screen: { x: number; y: number; w: number } };
  curve: number;
  hill: number;
  color: { road: string; grass: string; rumble: string; lane: string };
  sprites: { type: 'tree' | 'billboard' | 'cone' | 'coin' | 'pad' | 'tower'; offset: number; collected?: boolean }[];
}

interface TrafficCar {
  z: number;
  x: number;
  speed: number;
  type: 'sedan' | 'police' | 'van';
  color: string;
}

export const ArcadeCabinet: React.FC<ArcadeCabinetProps> = ({ onExit, machineName = 'Retro Hit & Run 8-Bit', gameId }) => {
  const mod = getArcadeGame(gameId);
  const ModularComponent = mod?.component;

  if (ModularComponent) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 select-none overflow-hidden p-2 md:p-6 font-mono">
        <div className="relative w-full max-w-5xl h-full max-h-[92vh] flex flex-col rounded-3xl border-8 border-purple-900 bg-slate-950 shadow-[0_0_80px_rgba(168,85,247,0.45)] overflow-hidden">
          <div className="flex-1 relative overflow-hidden">
            <ModularComponent onExit={onExit} machineName={machineName || mod.title} />
          </div>
          <div className="px-6 py-2.5 bg-gradient-to-r from-slate-950 via-purple-950 to-slate-950 border-t-2 border-purple-500/40 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-slate-300">MAIN GAME STATUS:</span>
              <span className="text-amber-400 font-black uppercase tracking-wider">
                PAUSED &amp; FROZEN IN MEMORY (0% CPU LOAD)
              </span>
            </div>
            <div className="text-purple-300 text-[11px]">
              Press <kbd className="px-1.5 py-0.5 rounded bg-purple-900 text-amber-300 font-mono">ESC</kbd> to unfreeze world &amp; resume gameplay
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const synthRef = useRef<ArcadeSoundSynth | null>(null);

  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try {
      return Number(localStorage.getItem('arcade_retro_high_score') || '15000');
    } catch {
      return 15000;
    }
  });
  const [speed, setSpeed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [nitro, setNitro] = useState(100);
  const [lives, setLives] = useState(3);
  const [stage, setStage] = useState(1);
  const [gameState, setGameState] = useState<'attract' | 'playing' | 'gameover' | 'cleared'>('attract');
  const [scanlines, setScanlines] = useState(true);
  const [muted, setMuted] = useState(false);

  // Game internal state refs for 60fps loop
  const gameLoopRef = useRef<number | null>(null);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const playerXRef = useRef(0);
  const playerZRef = useRef(0);
  const playerSpeedRef = useRef(0);
  const nitroActiveRef = useRef(false);
  const nitroMeterRef = useRef(100);
  const scoreRef = useRef(0);
  const timeRef = useRef(60);
  const livesRef = useRef(3);
  const stageRef = useRef(1);
  const cameraShakeRef = useRef(0);
  const trafficRef = useRef<TrafficCar[]>([]);
  const segmentsRef = useRef<RoadSegment[]>([]);

  // Initialize synth
  useEffect(() => {
    const synth = new ArcadeSoundSynth();
    synthRef.current = synth;
    return () => {
      synth.destroy();
    };
  }, []);

  // Sync mute state
  useEffect(() => {
    synthRef.current?.setMuted(muted);
  }, [muted]);

  // Build road track
  const buildRoad = () => {
    const segments: RoadSegment[] = [];
    const numSegments = 1600;
    const segmentLength = 200;

    for (let i = 0; i < numSegments; i++) {
      const isDark = Math.floor(i / 3) % 2 === 0;
      let curve = 0;
      let hill = 0;

      // Curves
      if (i > 100 && i < 280) curve = 2.5;
      if (i > 320 && i < 500) curve = -3.2;
      if (i > 600 && i < 850) curve = 4.0;
      if (i > 950 && i < 1200) curve = -2.8;

      // Hills
      if (i > 200 && i < 400) hill = Math.sin((i - 200) / 100 * Math.PI) * 1200;
      if (i > 700 && i < 950) hill = Math.sin((i - 700) / 125 * Math.PI) * 1500;

      const sprites: RoadSegment['sprites'] = [];
      // Roadside scenery
      if (i % 12 === 0) {
        sprites.push({ type: 'tree', offset: -1.6 - Math.random() * 0.5 });
        sprites.push({ type: 'tree', offset: 1.6 + Math.random() * 0.5 });
      }
      if (i % 80 === 0) {
        sprites.push({ type: 'billboard', offset: -2.0 });
      }
      if (i % 120 === 0) {
        sprites.push({ type: 'tower', offset: 2.4 });
      }
      // Pickups & Coins on the road
      if (i % 25 === 0 && i > 40) {
        const laneX = [-0.5, 0, 0.5][Math.floor(Math.random() * 3)];
        sprites.push({ type: 'coin', offset: laneX });
      }
      if (i % 90 === 0 && i > 60) {
        sprites.push({ type: 'pad', offset: 0 });
      }
      if (i % 110 === 0 && i > 80) {
        const laneX = [-0.6, 0.6][Math.floor(Math.random() * 2)];
        sprites.push({ type: 'cone', offset: laneX });
      }

      segments.push({
        index: i,
        p1: { world: { z: i * segmentLength }, screen: { x: 0, y: 0, w: 0 } },
        p2: { world: { z: (i + 1) * segmentLength }, screen: { x: 0, y: 0, w: 0 } },
        curve,
        hill,
        color: {
          road: isDark ? '#282b30' : '#32363e',
          grass: isDark ? '#1e5e2e' : '#237338',
          rumble: isDark ? '#d32f2f' : '#f5f5f5',
          lane: isDark ? '#ffeb3b' : 'transparent',
        },
        sprites,
      });
    }

    // Traffic cars
    const traffic: TrafficCar[] = [];
    for (let i = 0; i < 28; i++) {
      const z = 8000 + i * 11000 + Math.random() * 4000;
      const lane = [-0.55, -0.2, 0.2, 0.55][Math.floor(Math.random() * 4)];
      const types: TrafficCar['type'][] = ['sedan', 'police', 'van'];
      const type = types[Math.floor(Math.random() * types.length)];
      const colors = ['#e91e63', '#2196f3', '#ff9800', '#9c27b0', '#ffffff'];
      traffic.push({
        z,
        x: lane,
        speed: 60 + Math.random() * 45,
        type,
        color: type === 'police' ? '#ffffff' : colors[Math.floor(Math.random() * colors.length)],
      });
    }

    segmentsRef.current = segments;
    trafficRef.current = traffic;
  };

  const startGame = () => {
    buildRoad();
    playerXRef.current = 0;
    playerZRef.current = 0;
    playerSpeedRef.current = 0;
    nitroActiveRef.current = false;
    nitroMeterRef.current = 100;
    scoreRef.current = 0;
    timeRef.current = 60;
    livesRef.current = 3;
    stageRef.current = 1;

    setScore(0);
    setTimeLeft(60);
    setNitro(100);
    setLives(3);
    setStage(1);
    setGameState('playing');

    synthRef.current?.startEngine();
    synthRef.current?.startChiptuneBGM();
  };

  // Keyboard handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Exit on Escape key
      if (e.code === 'Escape') {
        e.preventDefault();
        synthRef.current?.stopEngine();
        synthRef.current?.stopChiptuneBGM();
        onExit();
        return;
      }
      keysRef.current[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        nitroActiveRef.current = true;
      }
      if (e.code === 'KeyM') {
        setMuted((m) => !m);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
      if (e.code === 'Space') {
        nitroActiveRef.current = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onExit]);

  // Main 60fps Arcade Game loop
  useEffect(() => {
    let lastTimestamp = performance.now();
    let timeAccumulator = 0;

    const loop = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
      lastTimestamp = timestamp;

      const canvas = canvasRef.current;
      if (canvas && gameState === 'playing') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // --- Physics update ---
          const keys = keysRef.current;
          const maxNormalSpeed = 160;
          const maxNitroSpeed = 235;
          const accel = 65;
          const brake = 110;
          const decel = 35;

          const isAccelerating = keys['ArrowUp'] || keys['KeyW'];
          const isBraking = keys['ArrowDown'] || keys['KeyS'];
          const isSteeringLeft = keys['ArrowLeft'] || keys['KeyA'];
          const isSteeringRight = keys['ArrowRight'] || keys['KeyD'];

          // Nitro handling
          if (nitroActiveRef.current && nitroMeterRef.current > 0 && isAccelerating) {
            nitroMeterRef.current = Math.max(0, nitroMeterRef.current - dt * 25);
            playerSpeedRef.current = Math.min(maxNitroSpeed, playerSpeedRef.current + accel * 1.8 * dt);
            cameraShakeRef.current = Math.max(cameraShakeRef.current, 2.5);
          } else {
            // Recharge nitro slowly
            nitroMeterRef.current = Math.min(100, nitroMeterRef.current + dt * 4);
            if (isAccelerating) {
              playerSpeedRef.current = Math.min(maxNormalSpeed, playerSpeedRef.current + accel * dt);
            } else if (isBraking) {
              playerSpeedRef.current = Math.max(0, playerSpeedRef.current - brake * dt);
            } else {
              playerSpeedRef.current = Math.max(0, playerSpeedRef.current - decel * dt);
            }
          }

          // Off-road penalty
          if (Math.abs(playerXRef.current) > 1.05) {
            playerSpeedRef.current = Math.max(25, playerSpeedRef.current - 90 * dt);
          }

          // Steering physics
          const speedFactor = playerSpeedRef.current / maxNitroSpeed;
          if (isSteeringLeft) {
            playerXRef.current -= 1.6 * speedFactor * dt;
          }
          if (isSteeringRight) {
            playerXRef.current += 1.6 * speedFactor * dt;
          }
          playerXRef.current = Math.max(-2.2, Math.min(2.2, playerXRef.current));

          // Camera shake decay
          cameraShakeRef.current = Math.max(0, cameraShakeRef.current - dt * 10);

          // Update position along track
          playerZRef.current += playerSpeedRef.current * 18 * dt;
          const totalTrackLength = segmentsRef.current.length * 200;
          if (playerZRef.current >= totalTrackLength - 4000) {
            // Stage Complete!
            synthRef.current?.playBoost();
            stageRef.current += 1;
            setStage(stageRef.current);
            playerZRef.current = 0;
            scoreRef.current += 5000;
            timeRef.current += 30;
          }

          // Audio engine update
          const rawSpeedRatio = maxNormalSpeed > 0 ? playerSpeedRef.current / maxNormalSpeed : 0;
          const safeSpeedRatio = Number.isFinite(rawSpeedRatio) ? rawSpeedRatio : 0;
          synthRef.current?.updateEngine(safeSpeedRatio);

          // Timer update
          timeAccumulator += dt;
          if (timeAccumulator >= 1.0) {
            timeAccumulator -= 1.0;
            timeRef.current = Math.max(0, timeRef.current - 1);
            setTimeLeft(timeRef.current);
            if (timeRef.current <= 0) {
              // Out of time
              synthRef.current?.playGameOver();
              setGameState('gameover');
            }
          }

          // Score update
          scoreRef.current += Math.floor(playerSpeedRef.current * 0.12);
          setScore(scoreRef.current);
          if (scoreRef.current > highScore) {
            setHighScore(scoreRef.current);
            try {
              localStorage.setItem('arcade_retro_high_score', String(scoreRef.current));
            } catch {}
          }
          setSpeed(Math.floor(playerSpeedRef.current));
          setNitro(Math.floor(nitroMeterRef.current));

          // Update traffic positions
          for (const car of trafficRef.current) {
            car.z += car.speed * 16 * dt;
            // Loop traffic cars forward
            if (car.z < playerZRef.current - 1000) {
              car.z = playerZRef.current + 18000 + Math.random() * 5000;
              car.x = [-0.6, -0.2, 0.2, 0.6][Math.floor(Math.random() * 4)];
            }

            // Collision check with player
            const dz = Math.abs(car.z - playerZRef.current);
            const dx = Math.abs(car.x - playerXRef.current);
            if (dz < 280 && dx < 0.45) {
              // Crash!
              synthRef.current?.playCrash();
              cameraShakeRef.current = 14;
              playerSpeedRef.current = Math.max(15, playerSpeedRef.current * 0.25);
              car.z += 600; // Bump traffic forward
              livesRef.current = Math.max(0, livesRef.current - 1);
              setLives(livesRef.current);
              if (livesRef.current <= 0) {
                synthRef.current?.playGameOver();
                setGameState('gameover');
              }
            }
          }

          // --- Rendering 2.5D Retro Highway ---
          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          // Sky gradient (Retro dusk/twilight)
          const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.55);
          if (stageRef.current === 1) {
            skyGrad.addColorStop(0, '#0f051d');
            skyGrad.addColorStop(0.6, '#391249');
            skyGrad.addColorStop(1, '#ff5722');
          } else if (stageRef.current === 2) {
            skyGrad.addColorStop(0, '#020b1e');
            skyGrad.addColorStop(0.6, '#1a237e');
            skyGrad.addColorStop(1, '#00e5ff');
          } else {
            skyGrad.addColorStop(0, '#000000');
            skyGrad.addColorStop(0.7, '#1b002c');
            skyGrad.addColorStop(1, '#d500f9');
          }
          ctx.fillStyle = skyGrad;
          ctx.fillRect(0, 0, width, height * 0.55);

          // Retro 8-bit Sun / Moon
          ctx.fillStyle = '#ffe082';
          ctx.beginPath();
          ctx.arc(width * 0.68, height * 0.28, 48, 0, Math.PI * 2);
          ctx.fill();

          // Mountains / Springfield City Skyline silhouette
          ctx.fillStyle = '#180a29';
          ctx.beginPath();
          ctx.moveTo(0, height * 0.55);
          for (let m = 0; m <= width; m += 60) {
            const my = height * 0.55 - Math.sin(m * 0.015 + playerZRef.current * 0.0001) * 35 - 20;
            ctx.lineTo(m, my);
          }
          ctx.lineTo(width, height * 0.55);
          ctx.closePath();
          ctx.fill();

          // Camera setup
          const cameraHeight = 1000;
          const cameraDepth = 0.84;
          const shakeX = (Math.random() - 0.5) * cameraShakeRef.current;
          const shakeY = (Math.random() - 0.5) * cameraShakeRef.current;

          const baseSegmentIndex = Math.floor(playerZRef.current / 200) % segmentsRef.current.length;
          const drawDistance = 240;

          let maxY = height;
          let currentCurve = 0;

          // Project & Draw segments back-to-front
          for (let n = 0; n < drawDistance; n++) {
            const segment = segmentsRef.current[(baseSegmentIndex + n) % segmentsRef.current.length];
            if (!segment) continue;

            const looped = segment.index < baseSegmentIndex;
            const segmentZ = segment.p1.world.z + (looped ? totalTrackLength : 0);
            const cameraZ = playerZRef.current;

            const relativeZ1 = segmentZ - cameraZ;
            const relativeZ2 = relativeZ1 + 200;

            if (relativeZ1 <= 10) continue;

            currentCurve += segment.curve * 0.06;

            const scale1 = cameraDepth / relativeZ1;
            const scale2 = cameraDepth / relativeZ2;

            const project = (relZ: number, scale: number, hill: number) => {
              const x = width / 2 + (shakeX - playerXRef.current * 1400 + currentCurve) * scale * width;
              const y = height / 2 + (cameraHeight + shakeY - hill) * scale * height;
              const w = 1800 * scale * width;
              return { x, y, w };
            };

            const p1 = project(relativeZ1, scale1, segment.hill);
            const p2 = project(relativeZ2, scale2, segment.hill);

            if (p2.y >= maxY) continue;
            maxY = p2.y;

            // Draw grass
            ctx.fillStyle = segment.color.grass;
            ctx.fillRect(0, p2.y, width, p1.y - p2.y + 1);

            // Draw rumble strips
            const r1 = p1.w * 1.15;
            const r2 = p2.w * 1.15;
            ctx.fillStyle = segment.color.rumble;
            ctx.beginPath();
            ctx.moveTo(p1.x - r1, p1.y);
            ctx.lineTo(p1.x + r1, p1.y);
            ctx.lineTo(p2.x + r2, p2.y);
            ctx.lineTo(p2.x - r2, p2.y);
            ctx.closePath();
            ctx.fill();

            // Draw road surface
            ctx.fillStyle = segment.color.road;
            ctx.beginPath();
            ctx.moveTo(p1.x - p1.w, p1.y);
            ctx.lineTo(p1.x + p1.w, p1.y);
            ctx.lineTo(p2.x + p2.w, p2.y);
            ctx.lineTo(p2.x - p2.w, p2.y);
            ctx.closePath();
            ctx.fill();

            // Center lane markings
            if (segment.color.lane !== 'transparent') {
              const lw1 = p1.w * 0.04;
              const lw2 = p2.w * 0.04;
              ctx.fillStyle = segment.color.lane;
              ctx.beginPath();
              ctx.moveTo(p1.x - lw1, p1.y);
              ctx.lineTo(p1.x + lw1, p1.y);
              ctx.lineTo(p2.x + lw2, p2.y);
              ctx.lineTo(p2.x - lw2, p2.y);
              ctx.closePath();
              ctx.fill();
            }

            // Draw road sprites (trees, billboards, coins, etc.)
            for (const sp of segment.sprites) {
              const spX = p1.x + sp.offset * p1.w;
              const spY = p1.y;
              const spSize = 750 * scale1 * width;

              if (sp.type === 'coin' && !sp.collected) {
                // Collect coin check
                if (relativeZ1 < 320 && Math.abs(playerXRef.current - sp.offset) < 0.35) {
                  sp.collected = true;
                  scoreRef.current += 150;
                  synthRef.current?.playCoin();
                } else {
                  ctx.fillStyle = '#ffd700';
                  ctx.beginPath();
                  ctx.arc(spX, spY - spSize * 0.4, spSize * 0.35, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.strokeStyle = '#fff59d';
                  ctx.lineWidth = 3;
                  ctx.stroke();
                }
              } else if (sp.type === 'pad') {
                // Turbo pad check
                if (relativeZ1 < 300 && Math.abs(playerXRef.current) < 0.4) {
                  playerSpeedRef.current = maxNitroSpeed;
                  cameraShakeRef.current = 6;
                  synthRef.current?.playBoost();
                }
                ctx.fillStyle = '#00e5ff';
                ctx.fillRect(spX - spSize * 0.8, spY - 6, spSize * 1.6, 12);
              } else if (sp.type === 'tree') {
                ctx.fillStyle = '#4e342e';
                ctx.fillRect(spX - spSize * 0.08, spY - spSize * 0.6, spSize * 0.16, spSize * 0.6);
                ctx.fillStyle = '#2e7d32';
                ctx.beginPath();
                ctx.arc(spX, spY - spSize * 0.75, spSize * 0.45, 0, Math.PI * 2);
                ctx.fill();
              } else if (sp.type === 'billboard') {
                ctx.fillStyle = '#d500f9';
                ctx.fillRect(spX - spSize * 0.6, spY - spSize * 0.9, spSize * 1.2, spSize * 0.6);
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(10, Math.floor(spSize * 0.18))}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('ARCADE', spX, spY - spSize * 0.55);
              } else if (sp.type === 'cone') {
                ctx.fillStyle = '#ff6f00';
                ctx.beginPath();
                ctx.moveTo(spX, spY - spSize * 0.5);
                ctx.lineTo(spX + spSize * 0.25, spY);
                ctx.lineTo(spX - spSize * 0.25, spY);
                ctx.closePath();
                ctx.fill();
              }
            }
          }

          // Draw Traffic Cars
          for (const car of trafficRef.current) {
            const relZ = car.z - playerZRef.current;
            if (relZ > 20 && relZ < 22000) {
              const scale = cameraDepth / relZ;
              const carX = width / 2 + (shakeX - playerXRef.current * 1400 + car.x * 1400) * scale * width;
              const carY = height / 2 + (cameraHeight + shakeY) * scale * height;
              const carW = 1200 * scale * width;
              const carH = carW * 0.58;

              // Car Body
              ctx.fillStyle = car.color;
              ctx.fillRect(carX - carW / 2, carY - carH, carW, carH);
              // Roof / Windows
              ctx.fillStyle = '#1a237e';
              ctx.fillRect(carX - carW * 0.38, carY - carH * 1.5, carW * 0.76, carH * 0.6);
              // Tail Lights
              ctx.fillStyle = '#f44336';
              ctx.fillRect(carX - carW * 0.45, carY - carH * 0.5, carW * 0.2, carH * 0.3);
              ctx.fillRect(carX + carW * 0.25, carY - carH * 0.5, carW * 0.2, carH * 0.3);
              // Tires
              ctx.fillStyle = '#212121';
              ctx.fillRect(carX - carW * 0.55, carY - carH * 0.35, carW * 0.16, carH * 0.45);
              ctx.fillRect(carX + carW * 0.39, carY - carH * 0.35, carW * 0.16, carH * 0.45);

              // Police Siren bar
              if (car.type === 'police') {
                const flash = Math.floor(timestamp / 120) % 2 === 0;
                ctx.fillStyle = flash ? '#f44336' : '#2196f3';
                ctx.fillRect(carX - carW * 0.25, carY - carH * 1.75, carW * 0.5, carH * 0.22);
              }
            }
          }

          // --- Draw Player Kart (Pikachu Racer) ---
          const playerCarW = Math.min(220, width * 0.26);
          const playerCarH = playerCarW * 0.62;
          const playerScreenX = width / 2 + shakeX;
          const playerScreenY = height - 42 + shakeY;

          // Nitro Exhaust Flames
          if (nitroActiveRef.current && nitroMeterRef.current > 0) {
            ctx.fillStyle = Math.random() > 0.5 ? '#00e5ff' : '#ffeb3b';
            ctx.beginPath();
            ctx.moveTo(playerScreenX - playerCarW * 0.25, playerScreenY);
            ctx.lineTo(playerScreenX - playerCarW * 0.15, playerScreenY + 28 + Math.random() * 15);
            ctx.lineTo(playerScreenX - playerCarW * 0.05, playerScreenY);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(playerScreenX + playerCarW * 0.05, playerScreenY);
            ctx.lineTo(playerScreenX + playerCarW * 0.15, playerScreenY + 28 + Math.random() * 15);
            ctx.lineTo(playerScreenX + playerCarW * 0.25, playerScreenY);
            ctx.closePath();
            ctx.fill();
          }

          // Player Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.beginPath();
          ctx.ellipse(playerScreenX, playerScreenY + 4, playerCarW * 0.58, 14, 0, 0, Math.PI * 2);
          ctx.fill();

          // Player Body (Golden Yellow Pikachu Roadster)
          ctx.fillStyle = '#fbc02d';
          ctx.beginPath();
          ctx.roundRect(playerScreenX - playerCarW / 2, playerScreenY - playerCarH, playerCarW, playerCarH, 12);
          ctx.fill();
          ctx.strokeStyle = '#f57f17';
          ctx.lineWidth = 4;
          ctx.stroke();

          // Rear Spoiler / Fin
          ctx.fillStyle = '#d32f2f';
          ctx.fillRect(playerScreenX - playerCarW * 0.46, playerScreenY - playerCarH * 1.15, playerCarW * 0.92, 10);

          // Cockpit & Windshield
          ctx.fillStyle = '#0288d1';
          ctx.beginPath();
          ctx.roundRect(playerScreenX - playerCarW * 0.32, playerScreenY - playerCarH * 1.25, playerCarW * 0.64, playerCarH * 0.55, 8);
          ctx.fill();

          // Pikachu Ears on spoiler
          ctx.fillStyle = '#fbc02d';
          ctx.beginPath();
          ctx.moveTo(playerScreenX - playerCarW * 0.36, playerScreenY - playerCarH * 1.15);
          ctx.lineTo(playerScreenX - playerCarW * 0.44, playerScreenY - playerCarH * 1.7);
          ctx.lineTo(playerScreenX - playerCarW * 0.28, playerScreenY - playerCarH * 1.15);
          ctx.closePath();
          ctx.fill();
          // Black tip
          ctx.fillStyle = '#212121';
          ctx.beginPath();
          ctx.moveTo(playerScreenX - playerCarW * 0.40, playerScreenY - playerCarH * 1.45);
          ctx.lineTo(playerScreenX - playerCarW * 0.44, playerScreenY - playerCarH * 1.7);
          ctx.lineTo(playerScreenX - playerCarW * 0.34, playerScreenY - playerCarH * 1.45);
          ctx.closePath();
          ctx.fill();

          // Right Ear
          ctx.fillStyle = '#fbc02d';
          ctx.beginPath();
          ctx.moveTo(playerScreenX + playerCarW * 0.28, playerScreenY - playerCarH * 1.15);
          ctx.lineTo(playerScreenX + playerCarW * 0.44, playerScreenY - playerCarH * 1.7);
          ctx.lineTo(playerScreenX + playerCarW * 0.36, playerScreenY - playerCarH * 1.15);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#212121';
          ctx.beginPath();
          ctx.moveTo(playerScreenX + playerCarW * 0.34, playerScreenY - playerCarH * 1.45);
          ctx.lineTo(playerScreenX + playerCarW * 0.44, playerScreenY - playerCarH * 1.7);
          ctx.lineTo(playerScreenX + playerCarW * 0.40, playerScreenY - playerCarH * 1.45);
          ctx.closePath();
          ctx.fill();

          // Red Taillights
          ctx.fillStyle = '#d50000';
          ctx.fillRect(playerScreenX - playerCarW * 0.45, playerScreenY - playerCarH * 0.45, playerCarW * 0.18, 12);
          ctx.fillRect(playerScreenX + playerCarW * 0.27, playerScreenY - playerCarH * 0.45, playerCarW * 0.18, 12);

          // Wide Rubber Tires
          ctx.fillStyle = '#111111';
          ctx.fillRect(playerScreenX - playerCarW * 0.56, playerScreenY - playerCarH * 0.4, playerCarW * 0.14, playerCarH * 0.6);
          ctx.fillRect(playerScreenX + playerCarW * 0.42, playerScreenY - playerCarH * 0.4, playerCarW * 0.14, playerCarH * 0.6);
        }
      }

      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, highScore]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 select-none overflow-hidden p-2 md:p-6 font-mono">
      {/* Outer Arcade Cabinet Chassis */}
      <div className="relative w-full max-w-5xl h-full max-h-[92vh] flex flex-col rounded-3xl border-8 border-purple-900 bg-slate-950 shadow-[0_0_80px_rgba(168,85,247,0.45)] overflow-hidden">
        
        {/* Top Marquee Banner */}
        <div className="relative flex items-center justify-between px-6 py-3 bg-gradient-to-r from-fuchsia-950 via-purple-900 to-fuchsia-950 border-b-4 border-amber-400 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="inline-block w-3 h-3 rounded-full bg-red-500 animate-ping" />
            <div className="text-sm md:text-xl font-black uppercase tracking-[0.25em] text-amber-300 drop-shadow-[0_2px_10px_rgba(245,158,11,0.8)]">
              ★ {machineName} ★
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setScanlines(!scanlines)}
              onTouchEnd={(e) => {
                e.preventDefault();
                setScanlines(!scanlines);
              }}
              className="min-h-[36px] flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg border border-purple-400/40 bg-purple-950/60 text-purple-200 hover:bg-purple-800 active:bg-purple-700 transition cursor-pointer"
              title="Toggle CRT Scanline Effect"
            >
              <Tv className="w-3.5 h-3.5" />
              {scanlines ? 'CRT: ON' : 'CRT: OFF'}
            </button>
            <button
              onClick={() => setMuted(!muted)}
              onTouchEnd={(e) => {
                e.preventDefault();
                setMuted(!muted);
              }}
              className="min-h-[36px] flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg border border-purple-400/40 bg-purple-950/60 text-purple-200 hover:bg-purple-800 active:bg-purple-700 transition cursor-pointer"
              title="Toggle 8-Bit Audio"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              {muted ? 'MUTED' : 'AUDIO'}
            </button>
            <button
              onClick={() => {
                synthRef.current?.stopEngine();
                synthRef.current?.stopChiptuneBGM();
                onExit();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                synthRef.current?.stopEngine();
                synthRef.current?.stopChiptuneBGM();
                onExit();
              }}
              className="min-h-[44px] min-w-[44px] flex items-center gap-1 px-3 sm:px-4 py-1.5 rounded-lg border-2 border-red-500 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs shadow-[0_0_15px_rgba(239,68,68,0.7)] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span className="hidden xs:inline">EXIT</span>
            </button>
          </div>
        </div>

        {/* Arcade Screen Frame with CRT Curvature Effect */}
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={960}
            height={540}
            className="w-full h-full object-contain"
          />

          {/* CRT Scanline and Vignette Overlay */}
          {scanlines && (
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.85)_100%)] opacity-85 z-20">
              <div className="w-full h-full bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.22),rgba(0,0,0,0.22)_2px,transparent_2px,transparent_4px)]" />
            </div>
          )}

          {/* In-Game Arcade HUD Overlays */}
          {gameState === 'playing' && (
            <div className="pointer-events-none absolute inset-0 p-4 md:p-6 flex flex-col justify-between z-10 text-white">
              {/* Top Stat Bar */}
              <div className="flex items-center justify-between text-xs md:text-sm font-black tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                <div className="flex gap-4 md:gap-8">
                  <div>
                    <div className="text-amber-400 text-[10px]">SCORE</div>
                    <div className="text-lg md:text-2xl text-yellow-200">{String(score).padStart(6, '0')}</div>
                  </div>
                  <div>
                    <div className="text-amber-400 text-[10px]">HIGH</div>
                    <div className="text-lg md:text-2xl text-purple-300">{String(highScore).padStart(6, '0')}</div>
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-cyan-400 text-[10px]">STAGE {stage}</div>
                  <div className={`text-xl md:text-3xl ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-cyan-200'}`}>
                    {timeLeft}s
                  </div>
                </div>

                <div className="flex gap-4 md:gap-8 text-right">
                  <div>
                    <div className="text-emerald-400 text-[10px]">SPEED</div>
                    <div className="text-lg md:text-2xl text-emerald-200">{speed} <span className="text-xs">MPH</span></div>
                  </div>
                  <div>
                    <div className="text-red-400 text-[10px]">LIVES</div>
                    <div className="text-lg md:text-2xl text-red-300">{'♥'.repeat(lives)}</div>
                  </div>
                </div>
              </div>

              {/* Bottom Turbo Gauge & Controls */}
              <div className="flex items-end justify-between">
                <div className="bg-slate-950/75 p-2 rounded-xl border border-cyan-500/30 backdrop-blur-sm">
                  <div className="text-[10px] uppercase text-cyan-300 tracking-wider mb-1 font-bold">
                    NITRO BOOST [SPACE]
                  </div>
                  <div className="w-32 md:w-48 h-3.5 bg-slate-800 rounded-full overflow-hidden border border-cyan-400/50">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-all duration-75"
                      style={{ width: `${nitro}%` }}
                    />
                  </div>
                </div>

                <div className="hidden md:block bg-slate-950/75 px-3 py-1.5 rounded-lg border border-amber-400/30 text-[11px] text-amber-300">
                  [W/↑] Gas  •  [S/↓] Brake  •  [A/D/←/→] Steer  •  [SPACE] Nitro  •  [ESC] Exit
                </div>
              </div>
            </div>
          )}

          {/* Attract / Start Screen */}
          {gameState === 'attract' && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center z-30">
              <div className="text-xs font-black uppercase tracking-[0.4em] text-amber-400 mb-2">
                COIN-OP ARCADE CLASSIC
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-fuchsia-400 to-cyan-300 drop-shadow-[0_4px_20px_rgba(217,70,239,0.7)]">
                POKÉ HIT & RUN
              </h1>
              <div className="text-sm md:text-lg font-bold text-cyan-300 tracking-widest mt-2">
                8-BIT OUTRUN EDITION
              </div>

              <div className="mt-8 grid gap-2 text-xs md:text-sm text-slate-300 max-w-md bg-purple-950/60 p-4 rounded-xl border border-purple-400/30">
                <div>⚡ Accelerate with <span className="text-amber-300 font-bold">[W]</span> or <span className="text-amber-300 font-bold">[↑]</span></div>
                <div>⚡ Steer with <span className="text-amber-300 font-bold">[A/D]</span> or <span className="text-amber-300 font-bold">[←/→]</span></div>
                <div>⚡ Collect Coins & Turbo Boost Pads</div>
                <div>⚡ Avoid Traffic Cars & Roadblocks</div>
                <div>⚡ Main World is completely frozen while you play!</div>
              </div>

              <div className="mt-8 flex flex-col items-center gap-4">
                <button
                  onClick={startGame}
                  className="flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black text-lg shadow-[0_0_30px_rgba(16,185,129,0.6)] hover:scale-105 transition active:scale-95 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  INSERT COIN • START GAME
                </button>
                <div className="text-xs text-amber-400/90 tracking-widest animate-pulse">
                  1 CREDIT READY • FREE PLAY
                </div>
              </div>
            </div>
          )}

          {/* Game Over Screen */}
          {gameState === 'gameover' && (
            <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center p-6 text-center z-30">
              <div className="text-5xl md:text-7xl font-black text-red-500 drop-shadow-[0_0_25px_rgba(239,68,68,0.9)] animate-bounce">
                GAME OVER
              </div>
              <div className="mt-4 text-xl text-amber-300 font-bold">
                FINAL SCORE: {score}
              </div>
              <div className="text-sm text-purple-300 mt-1">
                HIGH SCORE: {highScore}
              </div>

              <div className="mt-8 flex gap-4">
                <button
                  onClick={startGame}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm shadow-lg transition cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  TRY AGAIN (INSERT COIN)
                </button>
                <button
                  onClick={() => {
                    synthRef.current?.stopEngine();
                    synthRef.current?.stopChiptuneBGM();
                    onExit();
                  }}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm border border-slate-600 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  RETURN TO MAIN WORLD
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Cabinet Bezel Control Deck */}
        <div className="px-6 py-2.5 bg-gradient-to-r from-slate-950 via-purple-950 to-slate-950 border-t-2 border-purple-500/40 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-slate-300">MAIN GAME STATUS:</span>
            <span className="text-amber-400 font-black uppercase tracking-wider">
              PAUSED &amp; FROZEN IN MEMORY (0% CPU LOAD)
            </span>
          </div>
          <div className="text-purple-300 text-[11px]">
            Press <kbd className="px-1.5 py-0.5 rounded bg-purple-900 text-amber-300 font-mono">ESC</kbd> to unfreeze world &amp; resume gameplay
          </div>
        </div>
      </div>
    </div>
  );
};
