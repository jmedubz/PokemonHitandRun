import React, { useEffect, useRef, useState } from 'react';
import { ArcadeGameProps } from '../types';
import { Play, RotateCcw, Gauge, Zap, Volume2, VolumeX, Code, ShieldCheck, Flag } from 'lucide-react';

export const RedlineRushSlot: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const [rpm, setRpm] = useState(1200);
  const [speed, setSpeed] = useState(0);
  const [gear, setGear] = useState(1);
  const [isRedlining, setIsRedlining] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [testDriveActive, setTestDriveActive] = useState(false);
  const [telemetryLogs, setTelemetryLogs] = useState<string[]>([
    'REDLINE RUSH OS v3.4.0 INITIALIZED',
    'Cockpit Dual-Seat Link: READY',
    'Force Feedback Steering: CONNECTED',
    'Pedal Rack (Thrott/Brake/Clutch): CALIBRATED',
    'External Game Bundle Slot: WAITING FOR USER DROP-IN',
  ]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});

  const MAX_RPM = 9500;
  const REDLINE_RPM = 8200;
  const MAX_SPEEDS = [0, 52, 98, 145, 192, 240, 295];

  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      const gain = audioCtxRef.current.createGain();
      gain.gain.value = soundEnabled ? 0.08 : 0;
      gain.connect(audioCtxRef.current.destination);
      gainRef.current = gain;

      const osc = audioCtxRef.current.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, audioCtxRef.current.currentTime);
      osc.connect(gain);
      osc.start();
      oscRef.current = osc;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const updateSoundFreq = (curRpm: number) => {
    if (oscRef.current && audioCtxRef.current) {
      const freq = 45 + (curRpm / MAX_RPM) * 360;
      oscRef.current.frequency.setTargetAtTime(freq, audioCtxRef.current.currentTime, 0.03);
    }
  };

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = soundEnabled ? (testDriveActive ? 0.12 : 0.04) : 0;
    }
  }, [soundEnabled, testDriveActive]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      ensureAudio();

      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        setTestDriveActive(true);
      }
      if (e.code === 'KeyE' || e.code === 'ShiftRight') {
        // Shift up
        setGear((prev) => Math.min(6, prev + 1));
      }
      if (e.code === 'KeyQ' || e.code === 'ControlRight') {
        // Shift down
        setGear((prev) => Math.max(1, prev - 1));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let lastTime = performance.now();
    let curRpm = 1200;
    let curSpeed = 0;
    let curGear = 1;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const keys = keysRef.current;
      const throttle = keys['KeyW'] || keys['ArrowUp'];
      const brake = keys['KeyS'] || keys['ArrowDown'] || keys['Space'];

      const maxGearSpeed = MAX_SPEEDS[curGear];

      if (throttle) {
        curRpm = Math.min(MAX_RPM, curRpm + 6500 * dt);
        const targetSpeed = (curRpm / MAX_RPM) * maxGearSpeed;
        curSpeed += (targetSpeed - curSpeed) * 3.5 * dt;
      } else if (brake) {
        curRpm = Math.max(900, curRpm - 9000 * dt);
        curSpeed = Math.max(0, curSpeed - 120 * dt);
      } else {
        // Coasting
        curRpm = Math.max(1100, curRpm - 3200 * dt);
        curSpeed = Math.max(0, curSpeed - 22 * dt);
      }

      const redlining = curRpm >= REDLINE_RPM;
      setIsRedlining(redlining);
      setRpm(Math.round(curRpm));
      setSpeed(Math.round(curSpeed));
      setGear(curGear);

      updateSoundFreq(curRpm);

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (oscRef.current) {
        try {
          oscRef.current.stop();
        } catch {}
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const rpmPercent = Math.min(100, (rpm / MAX_RPM) * 100);

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950 text-white font-mono select-none overflow-hidden">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-red-900 via-neutral-900 to-red-950 border-b-2 border-red-500/60 px-6 py-3 flex items-center justify-between shadow-[0_4px_20px_rgba(239,68,68,0.25)]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
          <div>
            <h1 className="text-xl font-black tracking-wider text-red-400 italic">
              REDLINE RUSH <span className="text-xs px-2 py-0.5 rounded bg-red-600/30 text-red-200 border border-red-500/50">COCKPIT SLOT</span>
            </h1>
            <p className="text-xs text-neutral-400">High-RPM Driving Simulator Framework • Ready for External Game Bundle</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-xs flex items-center gap-1.5"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-neutral-400" />}
            <span>Audio {soundEnabled ? 'ON' : 'OFF'}</span>
          </button>
          <button
            onClick={onExit}
            className="px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold text-xs shadow-lg transition"
          >
            Exit Cabinet (Esc)
          </button>
        </div>
      </div>

      {/* Main Screen: Dual-Seat Racing Cockpit Experience */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto">
        {/* Left: Gauge Cluster & Attract Telemetry */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Virtual Windshield / Attract Display */}
          <div className="relative h-64 rounded-xl border-2 border-red-500/40 bg-gradient-to-b from-neutral-900 via-neutral-950 to-red-950/40 overflow-hidden flex flex-col items-center justify-center p-6 shadow-inner">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.15),transparent_70%)] pointer-events-none" />

            {/* Road Grid lines simulating forward motion */}
            <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_bottom,transparent_0%,rgba(239,68,68,0.4)_100%),repeating-linear-gradient(0deg,#ff0000,#ff0000_2px,transparent_2px,transparent_40px)]" />

            <div className="relative z-10 text-center">
              <div className="inline-block px-4 py-1 rounded-full bg-red-600/20 border border-red-500 text-red-300 font-bold text-xs tracking-widest uppercase mb-2">
                ATTRACT MODE • MODULAR INTEGRATION READY
              </div>
              <h2 className="text-4xl lg:text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-red-400 to-rose-500">
                REDLINE RUSH
              </h2>
              <p className="text-sm text-neutral-300 mt-2 max-w-md mx-auto">
                Dedicated Twin-Cockpit Arcade Cabinet. Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-600 text-red-400">W</kbd> or <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-600 text-red-400">↑</kbd> to rev engine and test throttle telemetry.
              </p>
            </div>

            {/* Shift Light Bar */}
            <div className="absolute bottom-4 w-5/6 flex items-center justify-center gap-1.5 px-4 py-2 bg-neutral-900/90 rounded-xl border border-neutral-700">
              {Array.from({ length: 16 }).map((_, i) => {
                const threshold = (i / 16) * 100;
                const active = rpmPercent >= threshold;
                const isRed = i >= 12;
                const isYellow = i >= 8 && i < 12;
                return (
                  <div
                    key={i}
                    className={`flex-1 h-3 rounded transition-all duration-75 ${
                      active
                        ? isRed
                          ? 'bg-red-500 shadow-[0_0_8px_#ef4444]'
                          : isYellow
                          ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]'
                          : 'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                        : 'bg-neutral-800'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Real-Time Digital Instrument Cluster */}
          <div className="grid grid-cols-3 gap-4 bg-neutral-900/80 p-5 rounded-xl border border-neutral-800">
            {/* Speedometer */}
            <div className="flex flex-col items-center justify-center p-4 bg-neutral-950 rounded-xl border border-red-500/30">
              <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">SPEED</span>
              <div className="text-4xl lg:text-5xl font-black text-amber-300 font-sans tracking-tight my-1">
                {speed}
              </div>
              <span className="text-[10px] text-neutral-500">KM / H</span>
            </div>

            {/* Tachometer / RPM */}
            <div className={`flex flex-col items-center justify-center p-4 bg-neutral-950 rounded-xl border ${isRedlining ? 'border-red-500 animate-pulse bg-red-950/20' : 'border-neutral-800'}`}>
              <div className="flex items-center gap-1">
                <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">TACHOMETER</span>
                {isRedlining && <Zap className="w-3.5 h-3.5 text-red-500 animate-bounce" />}
              </div>
              <div className={`text-4xl lg:text-5xl font-black font-sans tracking-tight my-1 ${isRedlining ? 'text-red-500' : 'text-rose-400'}`}>
                {rpm}
              </div>
              <span className="text-[10px] text-neutral-500">RPM (REDLINE: 8200)</span>
            </div>

            {/* Gear Indicator */}
            <div className="flex flex-col items-center justify-center p-4 bg-neutral-950 rounded-xl border border-neutral-800">
              <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">CURRENT GEAR</span>
              <div className="text-4xl lg:text-5xl font-black text-emerald-400 font-sans tracking-tight my-1">
                {gear}
              </div>
              <span className="text-[10px] text-neutral-500">MANUAL 6-SPEED</span>
            </div>
          </div>

          {/* Interactive Cabinet Control Deck */}
          <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-bold text-neutral-300">W / ↑</kbd>
              <span className="text-neutral-400">Throttle</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-bold text-neutral-300">S / ↓</kbd>
              <span className="text-neutral-400">Brake</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-bold text-neutral-300">E / R-Shift</kbd>
              <span className="text-neutral-400">Shift Up</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-bold text-neutral-300">Q / R-Ctrl</kbd>
              <span className="text-neutral-400">Shift Down</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded font-bold text-neutral-300">ESC</kbd>
              <span className="text-neutral-400">Return to Arcade</span>
            </div>
          </div>
        </div>

        {/* Right: Technical Integration Guide for External Files */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-neutral-900/90 rounded-xl border border-red-500/40 p-5 shadow-lg flex flex-col flex-1">
            <div className="flex items-center gap-2 text-red-400 font-bold mb-3">
              <Code className="w-5 h-5" />
              <span>Redline Rush Import Slot</span>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              This arcade machine is architected as an isolated container for your <strong>Redline Rush</strong> driving game.
            </p>

            <div className="my-4 p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-[11px] text-neutral-400 font-mono space-y-1.5">
              <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Zero-Impact Suspension Engine:</span>
              </div>
              <div>• Main Springfield/Goldenrod world is frozen.</div>
              <div>• 0 Three.js loops or physics ticks while here.</div>
              <div>• Main memory state intact (vehicles, wanted level, player coordinates).</div>
              <div>• Clean audio hand-off when entering & exiting.</div>
            </div>

            <div className="mt-auto">
              <div className="text-xs font-bold text-neutral-200 mb-2 flex items-center gap-1.5">
                <Flag className="w-4 h-4 text-amber-400" />
                <span>How to drop in Redline Rush later:</span>
              </div>
              <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-[11px] text-neutral-400 font-mono">
                <p className="text-amber-300 font-bold mb-1">In <code>src/arcade/registry.ts</code>:</p>
                <code className="text-neutral-300 block bg-neutral-900 p-2 rounded border border-neutral-800">
                  {`import { RedlineRushMain } from './external/RedlineRush';\n\nregisterArcadeGame({\n  id: 'redline_rush',\n  component: RedlineRushMain,\n});`}
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
