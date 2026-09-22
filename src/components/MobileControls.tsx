import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  RotateCcw,
  Compass,
  Layers,
  Flame,
  Zap,
  Car,
  Plane,
  Footprints,
  LogOut,
  Shield,
  Crosshair,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Disc,
  Target,
} from 'lucide-react';
import {
  MapLandmark,
  WorldMapSnapshot,
  WorldMapRoadFeature,
  WorldMapAreaFeature,
  WorldGoalView,
  PokemonCharacterId,
} from '../types';

const getAreaColor = (area: WorldMapAreaFeature): string => {
  if (area.kind === 'water') return '#2b5c8f';
  if (area.kind === 'park') return '#416b3f';
  if (area.kind === 'sports') return '#357a38';
  if (area.kind === 'farmland') return '#557a32';
  if (area.kind === 'rail') return '#58646d';
  if (area.kind === 'airport') return '#48663f';
  if (area.kind === 'terminal') return '#d7dde5';
  if (area.kind === 'apron') return '#858d94';
  if (area.kind === 'taxiway') return '#5c646b';
  if (area.kind === 'runway') return '#30363b';
  return '#8b8173';
};

const renderMiniRoad = (road: WorldMapRoadFeature) => {
  if (road.shape === 'ring') {
    const midRadius = (road.innerRadius + road.outerRadius) * 0.5;
    return (
      <circle
        key={`m_mini_road_${road.id}`}
        cx={road.x}
        cy={road.z}
        r={midRadius}
        fill="none"
        stroke="#475569"
        strokeWidth={Math.max(1.5, road.outerRadius - road.innerRadius)}
      />
    );
  }
  if (!('points' in road) || !Array.isArray(road.points) || road.points.length === 0) return null;
  return (
    <polygon
      key={`m_mini_road_${road.id}`}
      points={road.points.map((p) => `${p.x},${p.z}`).join(' ')}
      fill="#475569"
      stroke="#334155"
      strokeWidth={0.65}
      vectorEffect="non-scaling-stroke"
    />
  );
};

export function cleanPromptForMobile(text: string | null): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\[(?:E|F|G|Q|H|W|A|S|D|SPACE|SHIFT|ENTER|ESC|W\/S|A\/D|←\/→|↑\/↓)\]\s*/gi, '')
    .replace(/\[[A-Z0-9/←→↑↓\s]+\]\s*/g, '')
    .replace(/(^|\s)•\s*•/g, ' •')
    .replace(/^\s*•\s*/, '')
    .replace(/\s*•\s*$/, '')
    .trim();
  return cleaned || null;
}

export interface AnalogInputData {
  active: boolean;
  x: number; // -1 to 1 (left to right)
  y: number; // -1 to 1 (up to down)
  magnitude: number; // 0.0 to 1.0 (smooth gradient distance)
  angle: number; // joystick angle in radians
}

export interface MobileControlsProps {
  inVehicle: boolean;
  currentVehicle: any;
  aircraft: any;
  parachute: any;
  charizardFlightActive: boolean;
  currentPokemonId: string;
  grabbedNpcId: string | null;
  interactionPrompt: string | null;
  onAction: (action: 'attack' | 'grab' | 'special' | 'interact' | 'jump' | 'sprint' | 'horn' | 'chute_deploy' | 'chute_cut') => void;
  onKeyChange: (code: string, isDown: boolean) => void;
  onAnalogMove?: (data: AnalogInputData) => void;
  onCameraDrag: (dx: number, dy: number) => void;
  onTogglePause: () => void;
  onOpenBigMap: () => void;
  onToggleMute: () => void;
  onResetPlayer: () => void;
  onSelectPokemon?: (id: PokemonCharacterId) => void;
  unlockedGeodude?: boolean;
  isMuted: boolean;
  playerPos: { x: number; z: number };
  playerYaw: number;
  worldMap: WorldMapSnapshot;
  landmarks: MapLandmark[];
  policePositions: { x: number; z: number }[];
  pokemonHp: number;
  pokemonWater: number;
  wantedHeat: number;
  hitAndRunActive: boolean;
  treesGrownCount: number;
  hasChosenStarter?: boolean;
  worldGoal?: WorldGoalView | null;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  inVehicle,
  currentVehicle,
  aircraft,
  parachute,
  charizardFlightActive,
  currentPokemonId,
  grabbedNpcId,
  interactionPrompt,
  onAction,
  onKeyChange,
  onAnalogMove,
  onCameraDrag,
  onTogglePause,
  onOpenBigMap,
  onToggleMute,
  onResetPlayer,
  onSelectPokemon,
  unlockedGeodude = false,
  isMuted,
  playerPos,
  playerYaw,
  worldMap,
  landmarks,
  policePositions,
  pokemonHp,
  pokemonWater,
  wantedHeat,
  hitAndRunActive,
  treesGrownCount,
  hasChosenStarter = false,
  worldGoal = null,
}) => {
  // Floating Dynamic Joystick state
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickCenter, setJoystickCenter] = useState<{ x: number; y: number } | null>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joystickCenterRef = useRef<{ x: number; y: number } | null>(null);
  const joystickTouchIdRef = useRef<number | null>(null);
  const activeKeysRef = useRef<Set<string>>(new Set());

  // Camera swipe tracking (multi-touch)
  const cameraTouchIdRef = useRef<number | null>(null);
  const lastCameraPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Safe refs to avoid recreation and re-render cleanup resets
  const onKeyChangeRef = useRef(onKeyChange);
  onKeyChangeRef.current = onKeyChange;
  const onAnalogMoveRef = useRef(onAnalogMove);
  onAnalogMoveRef.current = onAnalogMove;
  const aircraftRef = useRef(aircraft);
  aircraftRef.current = aircraft;
  const inVehicleRef = useRef(inVehicle);
  inVehicleRef.current = inVehicle;

  // Safe helper to set key state
  const setKey = useCallback((code: string, down: boolean) => {
    if (down) {
      if (!activeKeysRef.current.has(code)) {
        activeKeysRef.current.add(code);
        onKeyChangeRef.current(code, true);
      }
    } else {
      if (activeKeysRef.current.has(code)) {
        activeKeysRef.current.delete(code);
        onKeyChangeRef.current(code, false);
      }
    }
  }, []);

  // Clean up all active keys ONLY on component unmount
  useEffect(() => {
    return () => {
      activeKeysRef.current.forEach((code) => {
        onKeyChangeRef.current(code, false);
      });
      activeKeysRef.current.clear();
      onAnalogMoveRef.current?.({ active: false, x: 0, y: 0, magnitude: 0, angle: 0 });
    };
  }, []);

  // ---------------------------------------------------------------------------
  // DYNAMIC FLOATING JOYSTICK LOGIC (Full Analogue Speed & Direction)
  // ---------------------------------------------------------------------------
  const maxTravel = 52; // Max displacement of knob from center
  const baseRadius = 66; // Visual radius of the base circle
  const deadzone = 5; // Small precise deadzone in px

  const applyJoystickInputs = useCallback((knobX: number, knobY: number, dist: number) => {
    if (dist < deadzone) {
      onAnalogMoveRef.current?.({ active: true, x: 0, y: 0, magnitude: 0, angle: 0 });
      setKey('KeyW', false);
      setKey('KeyS', false);
      setKey('KeyA', false);
      setKey('KeyD', false);
      setKey('ArrowUp', false);
      setKey('ArrowDown', false);
      setKey('ArrowLeft', false);
      setKey('ArrowRight', false);
      setKey('ShiftLeft', false);
      return;
    }

    const angle = Math.atan2(knobY, knobX);
    const clampedDist = Math.min(dist, maxTravel);
    // Smooth continuous gradient from deadzone to outer rim (0.0 to 1.0)
    const normalizedMag = Math.min(1.0, Math.max(0.0, (clampedDist - deadzone) / (maxTravel - deadzone)));
    const nx = Math.cos(angle) * normalizedMag; // -1 to 1 (right is > 0, left is < 0)
    const ny = Math.sin(angle) * normalizedMag; // -1 to 1 (down is > 0, up/forward is < 0)

    // Notify analogue movement system with continuous values
    onAnalogMoveRef.current?.({
      active: true,
      x: nx,
      y: ny,
      magnitude: normalizedMag,
      angle,
    });

    const threshold = 0.20;
    if (aircraftRef.current) {
      // Aircraft controls: X turns/roll, Y pitches nose up/down
      setKey('ArrowLeft', nx < -threshold);
      setKey('ArrowRight', nx > threshold);
      setKey('ArrowDown', ny < -threshold); // push forward -> nose down
      setKey('ArrowUp', ny > threshold);    // pull back -> climb
    } else if (inVehicleRef.current) {
      // Vehicle driving fallback keys
      setKey('KeyA', nx < -threshold);
      setKey('KeyD', nx > threshold);
      setKey('KeyW', ny < -threshold);
      setKey('KeyS', ny > threshold);
      setKey('ShiftLeft', normalizedMag >= 0.88);
    } else {
      // On foot fallback keys
      setKey('KeyW', ny < -threshold);
      setKey('KeyS', ny > threshold);
      setKey('KeyA', nx < -threshold);
      setKey('KeyD', nx > threshold);
      setKey('ShiftLeft', normalizedMag >= 0.88);
    }
  }, [setKey]);

  const updateJoystickFromTouch = useCallback((clientX: number, clientY: number) => {
    const center = joystickCenterRef.current;
    if (!center) return;
    const rawDx = clientX - center.x;
    const rawDy = clientY - center.y;
    const dist = Math.hypot(rawDx, rawDy);
    const clampedDist = Math.min(dist, maxTravel);
    const angle = Math.atan2(rawDy, rawDx);
    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    setKnobPos({ x: knobX, y: knobY });
    applyJoystickInputs(knobX, knobY, dist);
  }, [applyJoystickInputs]);

  const releaseJoystick = useCallback(() => {
    joystickTouchIdRef.current = null;
    joystickCenterRef.current = null;
    setJoystickCenter(null);
    setJoystickActive(false);
    setKnobPos({ x: 0, y: 0 });

    onAnalogMoveRef.current?.({ active: false, x: 0, y: 0, magnitude: 0, angle: 0 });

    setKey('KeyW', false);
    setKey('KeyS', false);
    setKey('KeyA', false);
    setKey('KeyD', false);
    setKey('ArrowUp', false);
    setKey('ArrowDown', false);
    setKey('ArrowLeft', false);
    setKey('ArrowRight', false);
    setKey('ShiftLeft', false);
  }, [setKey]);

  const handleJoystickZoneTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchIdRef.current = touch.identifier;

    // Edge clamping: clamp initial center inward so base circle is always comfortably inside the screen
    const safeLeft = baseRadius + 14;
    const safeBottom = window.innerHeight - baseRadius - 14;
    const safeTop = Math.max(baseRadius + 14, window.innerHeight * 0.32);
    const safeRight = Math.min(window.innerWidth * 0.44 - baseRadius, window.innerWidth - baseRadius - 14);

    const clampedCenterX = Math.max(safeLeft, Math.min(safeRight, touch.clientX));
    const clampedCenterY = Math.max(safeTop, Math.min(safeBottom, touch.clientY));

    const center = { x: clampedCenterX, y: clampedCenterY };
    joystickCenterRef.current = center;
    setJoystickCenter(center);
    setJoystickActive(true);

    updateJoystickFromTouch(touch.clientX, touch.clientY);
  };

  const handleJoystickZoneTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current === null || !joystickCenterRef.current) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchIdRef.current) {
        updateJoystickFromTouch(touch.clientX, touch.clientY);
        break;
      }
    }
  };

  const handleJoystickZoneTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchIdRef.current) {
        releaseJoystick();
        break;
      }
    }
  };

  // Window-level touch event listeners to ensure finger tracking is never lost even if dragged outside container
  useEffect(() => {
    const handleWindowTouchMove = (e: TouchEvent) => {
      if (joystickTouchIdRef.current === null || !joystickCenterRef.current) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchIdRef.current) {
          updateJoystickFromTouch(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const handleWindowTouchEnd = (e: TouchEvent) => {
      if (joystickTouchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchIdRef.current) {
          releaseJoystick();
          break;
        }
      }
    };

    window.addEventListener('touchmove', handleWindowTouchMove, { passive: true });
    window.addEventListener('touchend', handleWindowTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleWindowTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleWindowTouchEnd);
      window.removeEventListener('touchcancel', handleWindowTouchEnd);
    };
  }, [updateJoystickFromTouch, releaseJoystick]);

  // ---------------------------------------------------------------------------
  // FULLSCREEN CAMERA DRAG (Touches on right-side background)
  // ---------------------------------------------------------------------------
  const handleCameraTouchStart = (e: React.TouchEvent) => {
    // Only capture touch if camera is not already being dragged
    if (cameraTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    cameraTouchIdRef.current = touch.identifier;
    lastCameraPosRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleCameraTouchMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === cameraTouchIdRef.current) {
        const dx = touch.clientX - lastCameraPosRef.current.x;
        const dy = touch.clientY - lastCameraPosRef.current.y;
        lastCameraPosRef.current = { x: touch.clientX, y: touch.clientY };
        onCameraDrag(dx, dy);
        break;
      }
    }
  };

  const handleCameraTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === cameraTouchIdRef.current) {
        cameraTouchIdRef.current = null;
        break;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // ACTION BUTTON PRESS HANDLERS
  // ---------------------------------------------------------------------------
  const lastTouchTimeRef = useRef<number>(0);
  const lastGrabTapTimeRef = useRef<number>(0);
  const createButtonHandlers = (
    onPress: () => void,
    onRelease?: () => void
  ) => {
    return {
      onTouchStart: (e: React.TouchEvent) => {
        e.stopPropagation();
        lastTouchTimeRef.current = Date.now();
        onPress();
      },
      onTouchEnd: (e: React.TouchEvent) => {
        e.stopPropagation();
        if (onRelease) onRelease();
      },
      onTouchCancel: (e: React.TouchEvent) => {
        e.stopPropagation();
        if (onRelease) onRelease();
      },
      onMouseDown: (e: React.MouseEvent) => {
        e.stopPropagation();
        // Ignore synthetic mouse events caused by recent touch taps
        if (Date.now() - lastTouchTimeRef.current < 450) return;
        onPress();
      },
      onMouseUp: (e: React.MouseEvent) => {
        e.stopPropagation();
        if (Date.now() - lastTouchTimeRef.current < 450) return;
        if (onRelease) onRelease();
      },
    };
  };

  // ---------------------------------------------------------------------------
  // MINIMAP COMPUTATION
  // ---------------------------------------------------------------------------
  const miniMapSize = 92;
  const miniWorldRadius = 140;
  const miniMinX = playerPos.x - miniWorldRadius;
  const miniMinZ = playerPos.z - miniWorldRadius;
  const miniWorldWidth = miniWorldRadius * 2;
  const miniWorldHeight = miniWorldRadius * 2;

  const miniWorldToMap = (wx: number, wz: number) => ({
    x: ((wx - miniMinX) / miniWorldWidth) * miniMapSize,
    y: ((wz - miniMinZ) / miniWorldHeight) * miniMapSize,
  });

  const mapRotation = Math.PI - playerYaw;

  const currentDistrict =
    playerPos.z < -300
      ? 'AIRPORT'
      : playerPos.x < -70
      ? 'SPRINGFIELD'
      : playerPos.x > 70
      ? 'GOLDENROD'
      : 'RIVERWAY';

  const cleanedPrompt = cleanPromptForMobile(interactionPrompt);

  return (
    <div
      className="fixed inset-0 z-[120] select-none pointer-events-none overflow-hidden"
      style={{
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        paddingTop: 'max(8px, env(safe-area-inset-top))',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}
    >
      {/* ================= RIGHT CAMERA SWIPE ZONE ================= */}
      <div
        id="mobile-camera-zone"
        onTouchStart={handleCameraTouchStart}
        onTouchMove={handleCameraTouchMove}
        onTouchEnd={handleCameraTouchEnd}
        onTouchCancel={handleCameraTouchEnd}
        className="absolute top-0 right-0 w-[58vw] h-full pointer-events-auto touch-none z-10 select-none"
        style={{ touchAction: 'none' }}
      />

      {/* ================= LEFT-BOTTOM JOYSTICK ACTIVATION ZONE ================= */}
      <div
        id="mobile-joystick-zone"
        onTouchStart={handleJoystickZoneTouchStart}
        onTouchMove={handleJoystickZoneTouchMove}
        onTouchEnd={handleJoystickZoneTouchEnd}
        onTouchCancel={handleJoystickZoneTouchEnd}
        className="absolute left-0 bottom-0 w-[42vw] h-[68vh] pointer-events-auto touch-none z-20 select-none"
        style={{ touchAction: 'none' }}
      />

      {/* ================= UNIFIED VIRTUAL JOYSTICK ================= */}
      {/* 1. Idle Thumb Guide (Shown when not touching) */}
      {!joystickActive && (
        <div className="fixed left-7 bottom-6 pointer-events-none z-20 flex flex-col items-center justify-center transition-opacity duration-200">
          <div className="relative w-24 h-24 rounded-full border border-white/15 bg-slate-950/20 backdrop-blur-[2px] flex items-center justify-center shadow-md">
            {/* Inner Resting Thumb Knob */}
            <div className="w-10 h-10 rounded-full border border-white/20 bg-white/5 flex items-center justify-center shadow-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
            </div>

            {/* Subtle Direction Indicator Notches */}
            <div className="absolute top-1.5 w-1 h-1.5 bg-white/15 rounded-full" />
            <div className="absolute bottom-1.5 w-1 h-1.5 bg-white/15 rounded-full" />
            <div className="absolute left-1.5 h-1 w-1.5 bg-white/15 rounded-full" />
            <div className="absolute right-1.5 h-1 w-1.5 bg-white/15 rounded-full" />
          </div>
        </div>
      )}

      {/* 2. Floating Translucent Joystick (Dynamic Under Thumb while actively touching) */}
      {joystickActive && joystickCenter && (
        <div
          className="fixed pointer-events-none z-30 transition-opacity duration-150 animate-in fade-in"
          style={{
            left: `${joystickCenter.x}px`,
            top: `${joystickCenter.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Base Ring */}
          <div className="relative w-26 h-26 rounded-full border border-white/25 bg-slate-950/40 backdrop-blur-xs shadow-[0_0_16px_rgba(0,0,0,0.4)] flex items-center justify-center">
            {/* Subtle Crosshair accents */}
            <div className="absolute top-1.5 w-1 h-2 bg-white/30 rounded-full" />
            <div className="absolute bottom-1.5 w-1 h-2 bg-white/30 rounded-full" />
            <div className="absolute left-1.5 h-1 w-2 bg-white/30 rounded-full" />
            <div className="absolute right-1.5 h-1 w-2 bg-white/30 rounded-full" />

            {/* Inner Thumb Knob */}
            <div
              id="virtual-joystick-knob"
              className="absolute w-12 h-12 rounded-full border border-white/70 bg-gradient-to-b from-white/75 to-slate-200/50 backdrop-blur-sm shadow-[0_0_12px_rgba(255,255,255,0.35)] flex items-center justify-center will-change-transform"
              style={{
                transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
              }}
            >
              <div className="w-3.5 h-3.5 rounded-full bg-white/40 border border-white/40 shadow-inner" />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TOP MISSION BANNER (iPhone / Mobile) ---------------- */}
      {!hasChosenStarter && (
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 pointer-events-none z-40 w-[92vw] max-w-md">
          <div className="rounded-2xl border-2 border-amber-400/95 bg-slate-950/95 px-3.5 py-1.5 text-center shadow-[0_0_24px_rgba(251,191,36,0.6)] backdrop-blur-md flex flex-col items-center justify-center animate-pulse">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-amber-300">
              <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>ACTIVE MISSION: CHOOSE YOUR POKÉMON</span>
            </div>
            <div className="mt-0.5 text-[10.5px] sm:text-xs font-bold text-white leading-tight">
              Walk up to Pikachu (⚡), Charmander (🔥), or Squirtle (💧) in Prof. Oak's Lab & tap to select!
            </div>
          </div>
        </div>
      )}

      {hasChosenStarter && worldGoal && !worldGoal.completed && (
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 pointer-events-none z-40 w-[88vw] max-w-sm">
          <div className="rounded-xl border border-cyan-400/70 bg-slate-950/92 px-3 py-1 text-center shadow-lg backdrop-blur-md flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-wider text-cyan-300">
              <Target className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>MISSION:</span>
              <span className="text-white">{worldGoal.title}</span>
              <span className="text-cyan-400 font-mono">({worldGoal.completedCount}/{worldGoal.totalCount})</span>
            </div>
            <div className="text-[9.5px] font-medium text-slate-300 truncate max-w-full">
              {worldGoal.description}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TOP BAR (Safe & Compact) ---------------- */}
      <div className="flex items-start justify-between w-full pointer-events-none z-30 relative pt-1 px-1">
        {/* Top-Left: Compact Minimap & Status */}
        <div className="flex flex-col items-start gap-1 pointer-events-auto">
          {/* Quick Pokemon Selector on Mobile directly above Hit & Run / Minimap */}
          <div className="flex items-center gap-1.5 bg-slate-950/95 border-2 border-amber-400/80 rounded-full px-2.5 py-1 shadow-[0_0_20px_rgba(251,191,36,0.35)] backdrop-blur-md z-20 relative">
            {/* Pikachu */}
            <button
              type="button"
              id="mobile-select-pikachu"
              onClick={(e) => { e.stopPropagation(); onSelectPokemon?.('pikachu'); }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onSelectPokemon?.('pikachu'); }}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs font-black transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                currentPokemonId === 'pikachu'
                  ? 'bg-amber-400 text-slate-950 ring-2 ring-white scale-110 shadow-lg'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300'
              }`}
              title="Pikachu ⚡"
            >
              ⚡
            </button>
            {/* Charmander */}
            <button
              type="button"
              id="mobile-select-charmander"
              onClick={(e) => { e.stopPropagation(); onSelectPokemon?.('charmander'); }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onSelectPokemon?.('charmander'); }}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs font-black transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                currentPokemonId === 'charmander'
                  ? 'bg-orange-500 text-white ring-2 ring-white scale-110 shadow-lg'
                  : 'bg-slate-800 hover:bg-slate-700 text-orange-400'
              }`}
              title="Charmander 🔥"
            >
              🔥
            </button>
            {/* Poliwag */}
            <button
              type="button"
              id="mobile-select-poliway"
              onClick={(e) => { e.stopPropagation(); onSelectPokemon?.('poliway'); }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onSelectPokemon?.('poliway'); }}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs font-black transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                currentPokemonId === 'poliway'
                  ? 'bg-blue-500 text-white ring-2 ring-white scale-110 shadow-lg'
                  : 'bg-slate-800 hover:bg-slate-700 text-blue-400'
              }`}
              title="Poliwag 💧"
            >
              💧
            </button>
            {/* Geodude (if unlocked) */}
            {unlockedGeodude && (
              <button
                type="button"
                id="mobile-select-geodude"
                onClick={(e) => { e.stopPropagation(); onSelectPokemon?.('geodude_legs'); }}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onSelectPokemon?.('geodude_legs'); }}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs font-black transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                  currentPokemonId === 'geodude_legs'
                    ? 'bg-emerald-500 text-white ring-2 ring-white scale-110 shadow-lg'
                    : 'bg-slate-800 hover:bg-slate-700 text-emerald-400'
                }`}
                title="Geodude with Legs 💪"
              >
                💪
              </button>
            )}
            {/* Charizard */}
            <button
              type="button"
              id="mobile-select-charizard"
              onClick={(e) => { e.stopPropagation(); onSelectPokemon?.('charizard'); }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onSelectPokemon?.('charizard'); }}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs font-black transition-all flex items-center justify-center cursor-pointer active:scale-95 ${
                currentPokemonId === 'charizard'
                  ? 'bg-red-500 text-white ring-2 ring-white scale-110 shadow-lg'
                  : 'bg-slate-800 hover:bg-slate-700 text-red-400'
              }`}
              title="Charizard 🐉 (Fly)"
            >
              🐉
            </button>
          </div>

          {/* Minimap & Status with clear spacing so siren doesn't overlap */}
          <div className="flex items-start gap-2.5 mt-3.5">
            {/* COMPACT MINIMAP: Simpsons Hit & Run Style with Outer Gauge & Police Siren */}
          <div className="flex flex-col items-center">
            <div
              id="mobile-minimap-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenBigMap();
              }}
              className="relative rounded-full border-2 border-slate-700/80 bg-slate-950 p-1.5 shadow-2xl backdrop-blur-md cursor-pointer group active:scale-95 transition-transform"
              style={{ width: `${miniMapSize + 16}px`, height: `${miniMapSize + 16}px` }}
              title="Tap to open full world map"
              role="button"
              tabIndex={0}
            >
              {/* Police Siren Light Bar Fixture on Top (12 o'clock) - Simpsons Hit & Run Style */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center justify-center">
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border-2 bg-gradient-to-b from-slate-700 via-slate-900 to-black shadow-2xl transition-all ${
                  hitAndRunActive || wantedHeat > 85
                    ? 'border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.95)] scale-110'
                    : wantedHeat > 0
                    ? 'border-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.65)]'
                    : 'border-slate-500 shadow-md'
                }`}>
                  {/* Left Blue Siren Light Dome */}
                  <div className={`w-4 h-3 rounded-l-full border flex items-center justify-center relative overflow-hidden ${
                    wantedHeat > 0 || hitAndRunActive
                      ? 'bg-blue-500 border-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.95)] animate-pulse'
                      : 'bg-blue-900/80 border-blue-700/60'
                  }`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-100/90 shadow-inner" />
                  </div>

                  {/* Center Police Badge / Speaker Emblem */}
                  <div className="w-3.5 h-4 rounded-sm bg-gradient-to-b from-slate-100 via-slate-300 to-slate-400 border border-slate-300 flex items-center justify-center shadow-inner">
                    <div className="w-2 h-2 rounded-full bg-amber-400 border border-amber-600 flex items-center justify-center shadow-xs">
                      <div className="w-1 h-1 rounded-full bg-yellow-100" />
                    </div>
                  </div>

                  {/* Right Red Siren Light Dome */}
                  <div className={`w-4 h-3 rounded-r-full border flex items-center justify-center relative overflow-hidden ${
                    wantedHeat > 0 || hitAndRunActive
                      ? 'bg-red-500 border-red-200 shadow-[0_0_12px_rgba(239,68,68,0.95)] animate-pulse'
                      : 'bg-red-900/80 border-red-700/60'
                  }`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-100/90 shadow-inner" />
                  </div>
                </div>
              </div>

              {/* Outer Hit & Run Circular Ring Gauge (Simpsons Hit & Run Style) */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-20"
                viewBox="0 0 116 116"
              >
                {/* Background Dark Outer Bezel */}
                <circle
                  cx="58"
                  cy="58"
                  r="52"
                  fill="none"
                  stroke="#020617"
                  strokeWidth="8"
                />
                <circle
                  cx="58"
                  cy="58"
                  r="52"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth="5.5"
                />

                {/* Outer Gauge Track Segment Marks */}
                {Array.from({ length: 24 }).map((_, idx) => {
                  const angle = (idx * 360) / 24;
                  const rad = (angle * Math.PI) / 180;
                  const r1 = 49;
                  const r2 = 55;
                  const x1 = 58 + Math.cos(rad) * r1;
                  const y1 = 58 + Math.sin(rad) * r1;
                  const x2 = 58 + Math.cos(rad) * r2;
                  const y2 = 58 + Math.sin(rad) * r2;
                  return (
                    <line
                      key={idx}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#0f172a"
                      strokeWidth="1.2"
                    />
                  );
                })}

                {/* Active Heat Gauge Fill Arc */}
                {wantedHeat > 0 && (
                  <circle
                    cx="58"
                    cy="58"
                    r="52"
                    fill="none"
                    stroke={
                      hitAndRunActive || wantedHeat > 85
                        ? '#ef4444'
                        : wantedHeat > 45
                        ? '#f97316'
                        : '#facc15'
                    }
                    strokeWidth="6"
                    strokeDasharray="326.72"
                    strokeDashoffset={326.72 - (wantedHeat / 100) * 326.72}
                    strokeLinecap="round"
                    style={{
                      transform: 'rotate(-90deg)',
                      transformOrigin: '58px 58px',
                      transition: 'stroke-dashoffset 0.25s ease-out, stroke 0.25s ease',
                      filter:
                        hitAndRunActive || wantedHeat > 85
                          ? 'drop-shadow(0 0 8px #ef4444)'
                          : wantedHeat > 45
                          ? 'drop-shadow(0 0 5px #f97316)'
                          : 'drop-shadow(0 0 5px #facc15)',
                    }}
                  />
                )}

                {/* Bevel Notch Quadrant Ticks (12, 3, 6, 9 o'clock) */}
                <line x1="58" y1="2" x2="58" y2="10" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="114" y1="58" x2="106" y2="58" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="58" y1="114" x2="58" y2="106" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="2" y1="58" x2="10" y2="58" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round" />
              </svg>

              {/* Circular Minimap Inner Display */}
              <div
                className="relative rounded-full overflow-hidden bg-[#243c2e] border border-slate-700/80 shadow-inner"
                style={{ width: `${miniMapSize}px`, height: `${miniMapSize}px` }}
              >
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox={`${miniMinX} ${miniMinZ} ${miniWorldWidth} ${miniWorldHeight}`}
                  preserveAspectRatio="none"
                >
                  <rect x={miniMinX} y={miniMinZ} width={miniWorldWidth} height={miniWorldHeight} fill="#243c2e" />
                  {(worldMap?.areas ?? []).map((area) => {
                    if (area.radius) {
                      return (
                        <circle
                          key={`m_mini_area_${area.id}`}
                          cx={area.x}
                          cy={area.z}
                          r={area.radius}
                          fill={getAreaColor(area)}
                          opacity={0.8}
                        />
                      );
                    }
                    return (
                      <rect
                        key={`m_mini_area_${area.id}`}
                        x={area.x - area.width * 0.5}
                        y={area.z - area.depth * 0.5}
                        width={area.width}
                        height={area.depth}
                        fill={getAreaColor(area)}
                        opacity={area.kind === 'water' ? 0.8 : 0.65}
                      />
                    );
                  })}
                  {(worldMap?.roads ?? []).map((road) => renderMiniRoad(road))}
                </svg>

                {/* Landmark pins - purely visual, pointer-events-none */}
                {landmarks
                  .filter((lm) => Math.hypot(lm.x - playerPos.x, lm.z - playerPos.z) < miniWorldRadius)
                  .map((lm) => {
                    const mPos = miniWorldToMap(lm.x, lm.z);
                    return (
                      <div
                        key={`m_pin_${lm.id}`}
                        className="absolute w-2 h-2 rounded-full border border-white/80 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                        style={{ left: `${mPos.x}px`, top: `${mPos.y}px`, backgroundColor: lm.color }}
                      />
                    );
                  })}

                {/* Police positions */}
                {policePositions
                  .filter((pos) => Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z) < miniWorldRadius)
                  .map((pos, i) => {
                    const pMap = miniWorldToMap(pos.x, pos.z);
                    return (
                      <div
                        key={`m_cop_${i}`}
                        className="absolute w-2 h-2 rounded-full bg-red-500 border border-white transform -translate-x-1/2 -translate-y-1/2 animate-pulse pointer-events-none z-10"
                        style={{ left: `${pMap.x}px`, top: `${pMap.y}px` }}
                      />
                    );
                  })}

                {/* Player Arrow */}
                <div
                  className="absolute w-3.5 h-3.5 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20"
                  style={{ left: `${miniMapSize / 2}px`, top: `${miniMapSize / 2}px` }}
                >
                  <div
                    className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[9px] border-b-yellow-300 drop-shadow-[0_0_4px_#facc15]"
                    style={{ transform: `rotate(${mapRotation}rad)` }}
                  />
                </div>

                {/* District Label */}
                <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[6.5px] font-black uppercase text-white/90 bg-black/70 px-1 py-0.2 rounded pointer-events-none whitespace-nowrap">
                  {currentDistrict}
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-black/80 text-[6px] font-bold text-center text-amber-300 py-0.2 pointer-events-none uppercase tracking-wider">
                  Tap for Map
                </div>
              </div>
            </div>

            {/* Hit & Run Heat Banner below minimap */}
            {wantedHeat > 0 && (
              <div className="mt-1 flex flex-col items-center pointer-events-none">
                <div className={`px-2 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider shadow-md ${
                  hitAndRunActive || wantedHeat > 85
                    ? 'bg-red-600 border-red-300 text-white animate-bounce shadow-[0_0_12px_rgba(239,68,68,0.8)]'
                    : 'bg-amber-500/90 border-amber-200 text-slate-950 font-black'
                }`}>
                  {hitAndRunActive ? '🚨 HIT & RUN!' : `HIT & RUN ${Math.round(wantedHeat)}%`}
                </div>
              </div>
            )}
          </div>

          {/* Compact HP & Water readout */}
          <div className="flex flex-col gap-1.5 py-0.5">
            {/* HP Pill */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-emerald-400/40 rounded-full px-2.5 py-1 backdrop-blur-md shadow-md">
              <span className="text-[10px] font-black text-emerald-400">HP</span>
              <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all duration-200"
                  style={{ width: `${Math.max(5, pokemonHp)}%` }}
                />
              </div>
              <span className="text-[9px] font-black text-white">{Math.round(pokemonHp)}%</span>
            </div>

            {/* Water / Special Bar (if Poliwag) */}
            {currentPokemonId === 'poliway' && (
              <div className="flex items-center gap-1.5 bg-slate-950/80 border border-sky-400/40 rounded-full px-2.5 py-1 backdrop-blur-md shadow-md">
                <span className="text-[10px] font-black text-sky-400">💧</span>
                <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-blue-500 rounded-full transition-all duration-200"
                    style={{ width: `${Math.max(5, pokemonWater)}%` }}
                  />
                </div>
                <span className="text-[9px] font-black text-white">{Math.round(pokemonWater)}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

        {/* Top-Right: Quick Action Icons (Mute, Reset, Pause) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            id="mobile-btn-mute"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            className="w-10 h-10 rounded-full border border-slate-600/70 bg-slate-950/80 flex items-center justify-center text-slate-200 shadow-md backdrop-blur-md active:bg-slate-800 cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-slate-200" />}
          </button>

          <button
            type="button"
            id="mobile-btn-reset-pos"
            onClick={(e) => {
              e.stopPropagation();
              onResetPlayer();
            }}
            className="w-10 h-10 rounded-full border border-amber-400/40 bg-slate-950/80 flex items-center justify-center text-amber-300 shadow-md backdrop-blur-md active:bg-amber-500/20 cursor-pointer"
            title="Reset position"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* PAUSE BUTTON (ESC equivalent) */}
          <button
            type="button"
            id="mobile-btn-pause"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePause();
            }}
            className="h-10 px-3.5 rounded-full border border-amber-400/70 bg-slate-950/90 flex items-center gap-1.5 text-amber-300 shadow-lg backdrop-blur-md active:bg-amber-400/20 cursor-pointer"
            title="Pause Game"
          >
            <Pause className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span className="text-[11px] font-black uppercase tracking-wider">PAUSE</span>
          </button>
        </div>
      </div>

      {/* ---------------- INTERACTION PROMPT BANNER (Top-Middle) ---------------- */}
      {cleanedPrompt && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-auto z-30">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction('interact');
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAction('interact');
            }}
            className="rounded-full border border-yellow-400/80 bg-slate-950/95 px-4 py-1.5 text-center shadow-xl backdrop-blur-md cursor-pointer active:scale-95 transition-transform flex items-center gap-1.5"
          >
            <span className="text-xs font-black text-yellow-300 tracking-wide">
              {cleanedPrompt}
            </span>
            <span className="text-[9px] text-amber-200/80 font-bold bg-amber-500/20 px-1.5 py-0.5 rounded-full uppercase">Tap</span>
          </button>
        </div>
      )}

      {/* ---------------- BOTTOM AREA: CONTROLS ---------------- */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none flex items-end justify-between px-4 pb-2 z-30">
        {/* ================= LEFT SIDE: SPACING RESERVED FOR JOYSTICK ================= */}
        <div className="pointer-events-none relative mb-2 w-32 h-10" />

        {/* ================= CENTER: COMPACT TELEMETRY (If Vehicle/Plane) ================= */}
        {inVehicle && (
          <div className="pointer-events-none mb-2 flex flex-col items-center">
            {aircraft ? (
              <div className="rounded-xl border border-sky-400/50 bg-slate-950/80 px-3 py-1.5 text-center backdrop-blur-md shadow-lg">
                <div className="text-[9px] font-black uppercase tracking-widest text-sky-300">{aircraft.name}</div>
                <div className="flex items-center gap-3 mt-0.5">
                  <div>
                    <span className="text-sm font-black text-white">{Math.round(Math.abs(aircraft.speed) * 3.6)}</span>
                    <span className="text-[8px] text-slate-400 ml-0.5">km/h</span>
                  </div>
                  <div>
                    <span className="text-sm font-black text-sky-300">{Math.round(aircraft.throttle * 100)}%</span>
                    <span className="text-[8px] text-slate-400 ml-0.5">THR</span>
                  </div>
                </div>
              </div>
            ) : currentVehicle ? (
              <div className="rounded-xl border border-amber-400/50 bg-slate-950/80 px-3 py-1.5 text-center backdrop-blur-md shadow-lg">
                <div className="text-[9px] font-black uppercase tracking-widest text-amber-300">{currentVehicle.name}</div>
                <div className="flex items-center gap-3 mt-0.5">
                  <div>
                    <span className="text-sm font-black text-white">{Math.round(Math.abs(currentVehicle.speed))}</span>
                    <span className="text-[8px] text-slate-400 ml-0.5">km/h</span>
                  </div>
                  {currentVehicle.gear && (
                    <div>
                      <span className="text-sm font-black text-amber-400">{currentVehicle.gear}</span>
                    </div>
                  )}
                  {currentVehicle.boostFuel !== undefined && (
                    <div className="w-12 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-red-500"
                        style={{ width: `${currentVehicle.boostFuel}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ================= RIGHT SIDE: CONTEXT-SENSITIVE ACTION BUTTONS ================= */}
        <div className="pointer-events-auto relative mb-2 flex items-end gap-3">
          {/* AIRCRAFT BUTTONS */}
          {aircraft ? (
            <div className="flex items-end gap-2.5">
              {/* Throttle Down (S) */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  id="btn-aircraft-throttle-down"
                  {...createButtonHandlers(
                    () => setKey('KeyS', true),
                    () => setKey('KeyS', false)
                  )}
                  className="w-14 h-14 rounded-full border-2 border-orange-400/70 bg-orange-500/20 active:bg-orange-500/50 shadow-lg backdrop-blur-md flex flex-col items-center justify-center text-orange-200"
                >
                  <ArrowDown className="w-5 h-5" />
                  <span className="text-[8px] font-black">SLOW</span>
                </button>
                {/* Ground Brake (Space) */}
                <button
                  type="button"
                  id="btn-aircraft-brake"
                  {...createButtonHandlers(
                    () => setKey('Space', true),
                    () => setKey('Space', false)
                  )}
                  className="w-14 h-14 rounded-full border-2 border-red-500/70 bg-red-500/20 active:bg-red-500/50 shadow-lg backdrop-blur-md flex flex-col items-center justify-center text-red-200"
                >
                  <Disc className="w-5 h-5" />
                  <span className="text-[8px] font-black">BRAKE</span>
                </button>
              </div>

              {/* Throttle Up (W) & Exit (E) */}
              <div className="flex flex-col gap-2.5">
                {/* Exit Aircraft */}
                <button
                  type="button"
                  id="btn-aircraft-exit"
                  {...createButtonHandlers(() => onAction('interact'))}
                  className="w-14 h-14 rounded-full border-2 border-red-400/80 bg-red-600/30 active:bg-red-600/60 shadow-lg backdrop-blur-md flex flex-col items-center justify-center text-white"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="text-[8px] font-black">EXIT</span>
                </button>
                {/* Throttle Up (W) */}
                <button
                  type="button"
                  id="btn-aircraft-throttle-up"
                  {...createButtonHandlers(
                    () => setKey('KeyW', true),
                    () => setKey('KeyW', false)
                  )}
                  className="w-16 h-16 rounded-full border-2 border-emerald-400/80 bg-emerald-500/30 active:bg-emerald-500/60 shadow-xl backdrop-blur-md flex flex-col items-center justify-center text-emerald-100"
                >
                  <ArrowUp className="w-6 h-6" />
                  <span className="text-[9px] font-black">THRUST</span>
                </button>
              </div>
            </div>
          ) : inVehicle ? (
            /* CAR / MOTORCYCLE CONTROLS */
            <div className="flex items-end gap-2.5">
              {/* Nitro Boost (Shift) & Horn (H) */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  id="btn-car-horn"
                  {...createButtonHandlers(() => onAction('horn'))}
                  className="w-12 h-12 rounded-full border-2 border-yellow-400/60 bg-yellow-500/20 active:bg-yellow-500/50 shadow-md backdrop-blur-md flex flex-col items-center justify-center text-yellow-200"
                >
                  <span className="text-xs">📢</span>
                  <span className="text-[7.5px] font-black">HORN</span>
                </button>
                <button
                  type="button"
                  id="btn-car-nitro"
                  {...createButtonHandlers(
                    () => setKey('ShiftLeft', true),
                    () => setKey('ShiftLeft', false)
                  )}
                  className="w-13 h-13 rounded-full border-2 border-cyan-400/70 bg-cyan-500/20 active:bg-cyan-500/50 shadow-lg backdrop-blur-md flex flex-col items-center justify-center text-cyan-200"
                >
                  <Flame className="w-5 h-5" />
                  <span className="text-[8px] font-black">NITRO</span>
                </button>
              </div>

              {/* Handbrake (Space) & Brake/Reverse (S) */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  id="btn-car-handbrake"
                  {...createButtonHandlers(
                    () => setKey('Space', true),
                    () => setKey('Space', false)
                  )}
                  className="w-13 h-13 rounded-full border-2 border-amber-400/70 bg-amber-500/20 active:bg-amber-500/50 shadow-lg backdrop-blur-md flex flex-col items-center justify-center text-amber-200"
                >
                  <Disc className="w-4 h-4" />
                  <span className="text-[8px] font-black">DRIFT</span>
                </button>
                <button
                  type="button"
                  id="btn-car-reverse"
                  {...createButtonHandlers(
                    () => setKey('KeyS', true),
                    () => setKey('KeyS', false)
                  )}
                  className="w-15 h-15 rounded-full border-2 border-rose-500/80 bg-rose-600/25 active:bg-rose-600/55 shadow-xl backdrop-blur-md flex flex-col items-center justify-center text-rose-100"
                >
                  <ArrowDown className="w-6 h-6" />
                  <span className="text-[9px] font-black">BRAKE</span>
                </button>
              </div>

              {/* Exit Vehicle & Gas Pedal (W) */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  id="btn-car-exit"
                  {...createButtonHandlers(() => onAction('interact'))}
                  className="w-13 h-13 rounded-full border-2 border-red-400/80 bg-red-600/30 active:bg-red-600/60 shadow-lg backdrop-blur-md flex flex-col items-center justify-center text-white"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-[8px] font-black">EXIT</span>
                </button>
                <button
                  type="button"
                  id="btn-car-accelerate"
                  {...createButtonHandlers(
                    () => setKey('KeyW', true),
                    () => setKey('KeyW', false)
                  )}
                  className="w-16 h-16 rounded-full border-2 border-emerald-400/90 bg-emerald-500/35 active:bg-emerald-500/70 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center text-emerald-100"
                >
                  <ArrowUp className="w-7 h-7" />
                  <span className="text-[10px] font-black">GAS</span>
                </button>
              </div>
            </div>
          ) : parachute ? (
            /* PARACHUTE CONTROLS */
            <div className="flex items-end gap-3 pointer-events-auto">
              {parachute.mode === 'freefall' ? (
                <button
                  type="button"
                  id="btn-deploy-chute"
                  {...createButtonHandlers(() => onAction('chute_deploy'))}
                  className="w-20 h-20 rounded-full border-2 border-emerald-400 bg-emerald-500/50 active:bg-emerald-500/80 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center text-white pointer-events-auto active:scale-95 transition-transform"
                >
                  <Disc className="w-8 h-8 text-emerald-200" />
                  <span className="text-[10px] font-black tracking-wider">DEPLOY</span>
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-cut-chute"
                  {...createButtonHandlers(() => onAction('chute_cut'))}
                  className="w-20 h-20 rounded-full border-2 border-rose-500 bg-rose-600/50 active:bg-rose-600/80 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center text-white pointer-events-auto active:scale-95 transition-transform"
                >
                  <LogOut className="w-8 h-8 text-rose-200" />
                  <span className="text-[10px] font-black tracking-wider">CUT CHUTE</span>
                </button>
              )}
            </div>
          ) : charizardFlightActive ? (
            /* CHARIZARD FLIGHT CONTROLS */
            <div className="flex items-end gap-2.5">
              {/* Descend & Boost */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  id="btn-charizard-descend"
                  {...createButtonHandlers(
                    () => setKey('ShiftLeft', true),
                    () => setKey('ShiftLeft', false)
                  )}
                  className="w-13 h-13 rounded-full border-2 border-indigo-400/70 bg-indigo-500/25 active:bg-indigo-500/55 shadow-lg backdrop-blur-md flex flex-col items-center justify-center text-indigo-200"
                >
                  <ArrowDown className="w-5 h-5" />
                  <span className="text-[8px] font-black">DESCEND</span>
                </button>
                <button
                  type="button"
                  id="btn-charizard-flame"
                  {...createButtonHandlers(
                    () => {
                      setKey('KeyQ', true);
                      onAction('special');
                    },
                    () => setKey('KeyQ', false)
                  )}
                  className="w-14 h-14 rounded-full border-2 border-orange-500/80 bg-orange-600/30 active:bg-orange-600/60 shadow-xl backdrop-blur-md flex flex-col items-center justify-center text-orange-100"
                >
                  <Flame className="w-6 h-6" />
                  <span className="text-[8px] font-black">FLAME</span>
                </button>
              </div>

              {/* Land & Ascend */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  id="btn-charizard-land"
                  {...createButtonHandlers(() => onAction('interact'))}
                  className="w-13 h-13 rounded-full border-2 border-yellow-400/80 bg-yellow-500/25 active:bg-yellow-500/55 shadow-lg backdrop-blur-md flex flex-col items-center justify-center text-yellow-100"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-[8px] font-black">LAND</span>
                </button>
                <button
                  type="button"
                  id="btn-charizard-ascend"
                  {...createButtonHandlers(
                    () => setKey('Space', true),
                    () => setKey('Space', false)
                  )}
                  className="w-16 h-16 rounded-full border-2 border-amber-400/90 bg-amber-500/35 active:bg-amber-500/70 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center text-white"
                >
                  <ArrowUp className="w-7 h-7" />
                  <span className="text-[10px] font-black">FLY UP</span>
                </button>
              </div>
            </div>
          ) : (
            /* ON FOOT / GROUND POKÉMON CONTROLS */
            <div className="flex items-end gap-2.5">
              {/* Secondary Column: Grab / Throw & Special Ability (Q) */}
              <div className="flex flex-col gap-2.5">
                {/* Grab / Throw (G) - only show when relevant */}
                {grabbedNpcId ? (
                  <button
                    type="button"
                    id="btn-throw-npc"
                    {...createButtonHandlers(() => {
                      onAction('grab');
                    })}
                    className="w-13 h-13 rounded-full border-2 border-purple-400/90 bg-purple-600/60 active:bg-purple-600/90 shadow-xl backdrop-blur-md flex flex-col items-center justify-center text-white animate-bounce pointer-events-auto active:scale-95 transition-transform"
                  >
                    <span className="text-xs">🤾</span>
                    <span className="text-[7.5px] font-black">THROW</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    id="btn-grab-npc"
                    {...createButtonHandlers(() => {
                      onAction('grab');
                    })}
                    className="w-12 h-12 rounded-full border border-purple-400/50 bg-purple-900/50 active:bg-purple-600/70 shadow-md backdrop-blur-md flex flex-col items-center justify-center text-purple-200 pointer-events-auto active:scale-95 transition-transform"
                  >
                    <span className="text-xs">✋</span>
                    <span className="text-[7px] font-black">GRAB</span>
                  </button>
                )}

                {/* Special Ability (Q) (Water Gun, Thunder, Fire, Stomp) */}
                <button
                  type="button"
                  id="btn-special-ability"
                  {...createButtonHandlers(
                    () => {
                      setKey('KeyQ', true);
                      onAction('special');
                    },
                    () => setKey('KeyQ', false)
                  )}
                  className="w-14 h-14 rounded-full border-2 border-sky-400/70 bg-sky-500/25 active:bg-sky-500/60 shadow-lg backdrop-blur-md flex flex-col items-center justify-center text-sky-200"
                >
                  <Zap className="w-5 h-5 text-sky-300" />
                  <span className="text-[8px] font-black">SPECIAL</span>
                </button>
              </div>

              {/* Main Column: Interact (E) & Attack / Kick (F) */}
              <div className="flex flex-col gap-2.5">
                {/* Interact (E) */}
                <button
                  type="button"
                  id="btn-mobile-interact"
                  {...createButtonHandlers(() => onAction('interact'))}
                  className={`w-14 h-14 rounded-full border-2 shadow-xl backdrop-blur-md flex flex-col items-center justify-center transition-all ${
                    interactionPrompt
                      ? 'border-emerald-400 bg-emerald-500/40 active:bg-emerald-500/70 text-emerald-100 scale-105 animate-pulse'
                      : 'border-emerald-500/40 bg-emerald-900/25 active:bg-emerald-600/50 text-emerald-200'
                  }`}
                >
                  <Car className="w-5 h-5" />
                  <span className="text-[8px] font-black">ACTION</span>
                </button>

                {/* Kick / Punch / Attack (F) */}
                <button
                  type="button"
                  id="btn-mobile-attack"
                  {...createButtonHandlers(() => onAction('attack'))}
                  className="w-15 h-15 rounded-full border-2 border-rose-500/80 bg-rose-600/30 active:bg-rose-600/70 shadow-xl backdrop-blur-md flex flex-col items-center justify-center text-rose-100"
                >
                  <Footprints className="w-6 h-6 text-rose-300" />
                  <span className="text-[8.5px] font-black">KICK</span>
                </button>
              </div>

              {/* Primary Column: JUMP (Space) */}
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  id="btn-mobile-jump"
                  {...createButtonHandlers(
                    () => {
                      setKey('Space', true);
                      onAction('jump');
                    },
                    () => setKey('Space', false)
                  )}
                  className="w-18 h-18 rounded-full border-2 border-amber-400/90 bg-amber-500/35 active:bg-amber-500/70 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center text-white"
                >
                  <ArrowUp className="w-8 h-8 text-amber-200" />
                  <span className="text-[10.5px] font-black tracking-wider">JUMP</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
