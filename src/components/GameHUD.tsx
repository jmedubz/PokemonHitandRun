import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  PokemonCharacterId,
  VehicleModelType,
  NPC,
  MapLandmark,
  WorldGoalView,
  WorldMapSnapshot,
  WorldMapRoadFeature,
  WorldMapAreaFeature,
} from '../types';
import { AshBattleState } from '../game/ashBattle';

const formatHealth = (value: number | null | undefined): number => {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.max(0, Math.round(value as number));
};

/**
 * Convert the game's world yaw into the CSS rotation used by the map arrow.
 *
 * Game/world convention:
 *   forward = (sin(yaw), 0, cos(yaw))
 * Map convention:
 *   +X is screen-right and +Z is screen-down.
 * Arrow artwork convention:
 *   rotation 0 points screen-up (map north / -Z).
 *
 * Therefore the exact world -> map conversion is PI - yaw.
 */
const worldYawToMapRotation = (yaw: number): number => Math.PI - yaw;

/** Return the equivalent target angle nearest to the previous displayed angle. */
const unwrapAngleNear = (target: number, previous: number): number => {
  const delta = Math.atan2(Math.sin(target - previous), Math.cos(target - previous));
  return previous + delta;
};
import {
  Shield,
  Zap,
  Flame,
  Droplets,
  Car,
  Compass,
  Volume2,
  VolumeX,
  RotateCcw,
  RefreshCw,
  Sparkles,
  MapPin,
  Layers,
  X,
  Navigation,
  Send,
  Search,
} from 'lucide-react';

interface GameHUDProps {
  currentPokemon: {
    id: PokemonCharacterId;
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    waterLevel: number;
  };
  hasChosenStarter: boolean;
  inVehicle: boolean;
  currentVehicle: {
    type: VehicleModelType;
    name: string;
    speed: number;
    maxSpeed: number;
    boostFuel: number;
    isDrifting: boolean;
    isBoosting: boolean;
    damage: number;
    wrecked: boolean;
  } | null;
  aircraft: {
    name: string;
    kind: string;
    speed: number;
    maxSpeed: number;
    throttle: number;
    altitude: number;
    verticalSpeed: number;
    onGround: boolean;
    damage: number;
    crashed: boolean;
  } | null;
  parachute: {
    mode: 'freefall' | 'parachute';
    altitude: number;
    verticalSpeed: number;
    deployment: number;
  } | null;
  wantedHeat: number; // 0 to 100 Hit & Run chaos meter
  hitAndRunActive: boolean;
  hitAndRunWarning: boolean;
  fps: number;
  isBusted: boolean;
  interactionPrompt: string | null;
  activeDialogue: { speaker: string; text: string } | null;
  onDismissDialogue: () => void;
  starterSelectionCandidate: { id: PokemonCharacterId; name: string } | null;
  onConfirmStarterSelection: () => void;
  onCancelStarterSelection: () => void;
  temporaryNotification: { id: number; speaker: string; text: string } | null;
  onDismissTemporaryNotification: () => void;
  ashBattleState: AshBattleState;
  showAshVictory: boolean;
  onDismissAshVictory: () => void;
  playerPos: { x: number; y: number; z: number };
  playerYaw: number;
  landmarks: MapLandmark[];
  worldMap: WorldMapSnapshot;
  policePositions: { x: number; z: number }[];
  isMuted: boolean;
  onToggleMute: () => void;
  onResetPlayer: () => void;
  onRestartWorld: () => void;
  onFastTravel: (target: { x: number; z: number; name?: string; travelX?: number; travelZ?: number; travelYaw?: number; mapClick?: boolean }) => void;
  onSelectStarter: (id: PokemonCharacterId) => void;
  unlockedGeodude: boolean;
  treesGrownCount: number;
  worldGoal: WorldGoalView | null;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  currentPokemon,
  hasChosenStarter,
  inVehicle,
  currentVehicle,
  aircraft,
  parachute,
  wantedHeat,
  hitAndRunActive,
  hitAndRunWarning,
  fps,
  isBusted,
  interactionPrompt,
  activeDialogue,
  onDismissDialogue,
  starterSelectionCandidate,
  onConfirmStarterSelection,
  onCancelStarterSelection,
  temporaryNotification,
  onDismissTemporaryNotification,
  ashBattleState,
  showAshVictory,
  onDismissAshVictory,
  playerPos,
  playerYaw,
  landmarks,
  worldMap,
  policePositions,
  isMuted,
  onToggleMute,
  onResetPlayer,
  onRestartWorld,
  onFastTravel,
  onSelectStarter,
  unlockedGeodude,
  treesGrownCount,
  worldGoal,
}) => {
  const [showBigMap, setShowBigMap] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [mapFilter, setMapFilter] = useState<'all' | 'springfield' | 'goldenrod' | 'highway' | 'airport'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoverWorldCoords, setHoverWorldCoords] = useState<{ x: number; z: number } | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [fullMapZoom, setFullMapZoom] = useState(1);
  const [fullMapViewCenter, setFullMapViewCenter] = useState<{ x: number; z: number } | null>(null);
  const [isFullMapDragging, setIsFullMapDragging] = useState(false);
  const fullMapDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startCenterX: number;
    startCenterZ: number;
    moved: boolean;
  } | null>(null);

  // Keep the map heading continuous across the +/-PI yaw wrap so the marker
  // takes the short path through a full 360-degree turn instead of visibly
  // spinning backwards when the gameplay yaw wraps from +PI to -PI.
  const mapArrowRotationRef = useRef(worldYawToMapRotation(playerYaw));
  const mapArrowRotation = unwrapAngleNear(
    worldYawToMapRotation(playerYaw),
    mapArrowRotationRef.current,
  );
  mapArrowRotationRef.current = mapArrowRotation;

  // HUD safe-area system. Bottom HUD elements each get their own lane instead
  // of being stacked into one box that can be pushed into the middle of gameplay.
  const topLeftRef = useRef<HTMLDivElement>(null);
  const topRightRef = useRef<HTMLDivElement>(null);
  const bottomLeftRef = useRef<HTMLDivElement>(null);
  const bottomRightRef = useRef<HTMLDivElement>(null);
  const [topHudClearance, setTopHudClearance] = useState(112);
  const [bottomHudMetrics, setBottomHudMetrics] = useState({
    leftWidth: 0,
    rightWidth: 0,
    leftHeight: 0,
    rightHeight: 0,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1200,
  });

  useLayoutEffect(() => {
    const measureHud = () => {
      const topLeftRect = topLeftRef.current?.getBoundingClientRect();
      const topRightRect = topRightRef.current?.getBoundingClientRect();
      const bottomLeftRect = bottomLeftRef.current?.getBoundingClientRect();
      const bottomRightRect = bottomRightRef.current?.getBoundingClientRect();

      setTopHudClearance(Math.max(topLeftRect?.height ?? 0, topRightRect?.height ?? 0) + 28);
      setBottomHudMetrics({
        leftWidth: bottomLeftRect?.width ?? 0,
        rightWidth: bottomRightRect?.width ?? 0,
        leftHeight: bottomLeftRect?.height ?? 0,
        rightHeight: bottomRightRect?.height ?? 0,
        viewportWidth: window.innerWidth,
      });
    };

    measureHud();

    const observer = new ResizeObserver(measureHud);
    [topLeftRef.current, topRightRef.current, bottomLeftRef.current, bottomRightRef.current]
      .filter((element): element is HTMLDivElement => Boolean(element))
      .forEach((element) => observer.observe(element));

    window.addEventListener('resize', measureHud);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureHud);
    };
  }, [inVehicle]);

  const bottomSideGap = 12;
  const bottomOuterMargin = 10;
  const bottomLeftInset = bottomHudMetrics.leftWidth + bottomOuterMargin + bottomSideGap;
  const bottomRightInset = bottomHudMetrics.rightWidth + bottomOuterMargin + bottomSideGap;
  const bottomCenterWidth = bottomHudMetrics.viewportWidth - bottomLeftInset - bottomRightInset;

  // With the compact controls panel there is normally a wide lane between radar
  // and controls. On narrow screens the same lanes move just above the bottom HUD.
  const bottomCenterHasRoom = bottomCenterWidth >= 320;
  const safeBottomBase = bottomCenterHasRoom
    ? bottomOuterMargin
    : Math.max(bottomHudMetrics.leftHeight, bottomHudMetrics.rightHeight) + bottomOuterMargin + 10;
  const laneLeft = bottomCenterHasRoom ? `${bottomLeftInset}px` : '8px';
  const laneRight = bottomCenterHasRoom ? `${bottomRightInset}px` : '8px';

  const interactionPromptStyle: React.CSSProperties = {
    left: laneLeft,
    right: laneRight,
    bottom: `${safeBottomBase}px`,
  };
  const notificationBottom = safeBottomBase + (interactionPrompt ? 48 : 0);
  const temporaryNotificationStyle: React.CSSProperties = {
    left: laneLeft,
    right: laneRight,
    bottom: `${notificationBottom}px`,
  };
  const dialogueBottom = notificationBottom + (temporaryNotification ? 82 : 0);
  const persistentDialogueStyle: React.CSSProperties = {
    left: laneLeft,
    right: laneRight,
    bottom: `${dialogueBottom}px`,
  };

  useEffect(() => {
    if (!showBigMap) {
      fullMapDragRef.current = null;
      setIsFullMapDragging(false);
      setHoverWorldCoords(null);
    }
  }, [showBigMap]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setShowBigMap((prev) => !prev);
      }
      if (e.code === 'Escape' && showBigMap) {
        setShowBigMap(false);
      }
      const keyTarget = e.target as HTMLElement | null;
      const isTypingIntoMapField = Boolean(
        keyTarget && (
          keyTarget.tagName === 'INPUT' ||
          keyTarget.tagName === 'TEXTAREA' ||
          keyTarget.tagName === 'SELECT' ||
          keyTarget.isContentEditable
        ),
      );
      if (e.code === 'KeyR' && showBigMap && !isTypingIntoMapField) {
        e.preventDefault();
        e.stopPropagation();
        setFullMapViewCenter({ x: playerPos.x, z: playerPos.z });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showBigMap, playerPos.x, playerPos.z]);

  // The corner radar is a LOCAL moving map rather than a shrunken copy of the
  // entire 680m+ world. This keeps roads readable everywhere and guarantees the
  // player never falls outside old hard-coded atlas bounds as the world expands.
  const mapWidth = 200;
  const mapHeight = 160;
  // District-scale radar: wide enough that the Springfield Town Square/statue
  // and Community Soccer Field are visible together (they are ~168 world units
  // apart north/south), while still remaining substantially more local/readable
  // than the full TAB atlas. Keep the 1.25 world aspect ratio matched to the
  // 200x160 HUD viewport so roads are not visually stretched.
  const miniWorldWidth = 470;
  const miniWorldHeight = 376;
  const miniMinX = playerPos.x - miniWorldWidth / 2;
  const miniMinZ = playerPos.z - miniWorldHeight / 2;
  const miniWorldToMap = (wx: number, wz: number) => ({
    x: ((wx - miniMinX) / miniWorldWidth) * mapWidth,
    y: ((wz - miniMinZ) / miniWorldHeight) * mapHeight,
  });
  const miniVisible = (wx: number, wz: number, margin = 3) =>
    wx >= miniMinX - margin && wx <= miniMinX + miniWorldWidth + margin &&
    wz >= miniMinZ - margin && wz <= miniMinZ + miniWorldHeight + margin;

  // Full map uses ONE uniform world scale for X and Z. The old responsive rectangle
  // stretched the 2D atlas independently in each axis, making the long airport
  // appear disproportionately huge next to the cities. Pad the shorter world axis
  // to a fixed 8:5 canvas instead of stretching real geometry.
  const sourceFullBounds = worldMap.bounds;
  const targetMapAspect = 8 / 5;
  const sourceWidth = Math.max(1, sourceFullBounds.maxX - sourceFullBounds.minX);
  const sourceHeight = Math.max(1, sourceFullBounds.maxZ - sourceFullBounds.minZ);
  const sourceCx = (sourceFullBounds.minX + sourceFullBounds.maxX) * 0.5;
  const sourceCz = (sourceFullBounds.minZ + sourceFullBounds.maxZ) * 0.5;
  let paddedWidth = sourceWidth;
  let paddedHeight = sourceHeight;
  if (sourceWidth / sourceHeight > targetMapAspect) paddedHeight = sourceWidth / targetMapAspect;
  else paddedWidth = sourceHeight * targetMapAspect;
  const baseFullBounds = {
    minX: sourceCx - paddedWidth * 0.5,
    maxX: sourceCx + paddedWidth * 0.5,
    minZ: sourceCz - paddedHeight * 0.5,
    maxZ: sourceCz + paddedHeight * 0.5,
  };
  // TAB map starts at the same uniform-scale complete-world atlas as before, but can
  // now zoom toward the cursor/trackpad position. This is presentation-only: world
  // geometry, fast-travel coordinates and the local minimap remain unchanged.
  const clampedFullMapZoom = Math.max(1, Math.min(5, fullMapZoom));
  const fullWorldWidth = paddedWidth / clampedFullMapZoom;
  const fullWorldHeight = paddedHeight / clampedFullMapZoom;
  const clampFullMapCenter = (wantedX: number, wantedZ: number, viewWidth = fullWorldWidth, viewHeight = fullWorldHeight) => {
    // Allow a small amount of edge breathing room, but never enough to drag the
    // authored world completely off-screen. At most ~8% of the current viewport
    // may expose the padded map background along an edge.
    const edgePaddingX = viewWidth * 0.08;
    const edgePaddingZ = viewHeight * 0.08;
    const minCenterX = baseFullBounds.minX + viewWidth * 0.5 - edgePaddingX;
    const maxCenterX = baseFullBounds.maxX - viewWidth * 0.5 + edgePaddingX;
    const minCenterZ = baseFullBounds.minZ + viewHeight * 0.5 - edgePaddingZ;
    const maxCenterZ = baseFullBounds.maxZ - viewHeight * 0.5 + edgePaddingZ;
    return {
      x: minCenterX <= maxCenterX
        ? Math.max(minCenterX, Math.min(maxCenterX, wantedX))
        : sourceCx,
      z: minCenterZ <= maxCenterZ
        ? Math.max(minCenterZ, Math.min(maxCenterZ, wantedZ))
        : sourceCz,
    };
  };
  const rawCenterX = fullMapViewCenter?.x ?? sourceCx;
  const rawCenterZ = fullMapViewCenter?.z ?? sourceCz;
  const clampedMapCenter = clampFullMapCenter(rawCenterX, rawCenterZ);
  const centerX = clampedMapCenter.x;
  const centerZ = clampedMapCenter.z;
  const fullBounds = {
    minX: centerX - fullWorldWidth * 0.5,
    maxX: centerX + fullWorldWidth * 0.5,
    minZ: centerZ - fullWorldHeight * 0.5,
    maxZ: centerZ + fullWorldHeight * 0.5,
  };

  const setFullMapZoomAt = (nextZoom: number, anchorX = 0.5, anchorY = 0.5) => {
    const zoom = Math.max(1, Math.min(5, nextZoom));
    const nx = Math.max(0, Math.min(1, anchorX));
    const ny = Math.max(0, Math.min(1, anchorY));
    const anchorWorldX = fullBounds.minX + nx * fullWorldWidth;
    const anchorWorldZ = fullBounds.minZ + ny * fullWorldHeight;
    const nextWidth = paddedWidth / zoom;
    const nextHeight = paddedHeight / zoom;
    const wantedCenterX = anchorWorldX + (0.5 - nx) * nextWidth;
    const wantedCenterZ = anchorWorldZ + (0.5 - ny) * nextHeight;
    const nextCenter = clampFullMapCenter(wantedCenterX, wantedCenterZ, nextWidth, nextHeight);
    setFullMapZoom(zoom);
    setFullMapViewCenter(nextCenter);
  };

  const resetFullMapZoom = () => {
    setFullMapZoom(1);
    setFullMapViewCenter({ x: sourceCx, z: sourceCz });
  };
  const worldToFullPercent = (wx: number, wz: number) => ({
    x: ((wx - fullBounds.minX) / fullWorldWidth) * 100,
    y: ((wz - fullBounds.minZ) / fullWorldHeight) * 100,
  });
  const fullPercentToWorld = (nx: number, ny: number) => ({
    // Padded map margins are presentation-only; map-click travel is clamped back
    // to the actual authored world bounds.
    x: Math.max(sourceFullBounds.minX, Math.min(sourceFullBounds.maxX, fullBounds.minX + nx * fullWorldWidth)),
    z: Math.max(sourceFullBounds.minZ, Math.min(sourceFullBounds.maxZ, fullBounds.minZ + ny * fullWorldHeight)),
  });

  const travelToLandmark = (lm: MapLandmark) => onFastTravel({
    x: lm.x,
    z: lm.z,
    name: lm.name,
    travelX: lm.travelX,
    travelZ: lm.travelZ,
    travelYaw: lm.travelYaw,
  });

  const mapAreaFill = (area: WorldMapAreaFeature) => {
    if (area.kind === 'water') return '#155e75';
    if (area.kind === 'park') return '#2f6b3a';
    if (area.kind === 'sports') return '#238a45';
    if (area.kind === 'farmland') return '#557a32';
    if (area.kind === 'rail') return '#58646d';
    if (area.kind === 'airport') return '#48663f';
    if (area.kind === 'terminal') return '#d7dde5';
    if (area.kind === 'apron') return '#858d94';
    if (area.kind === 'taxiway') return '#5c646b';
    if (area.kind === 'runway') return '#30363b';
    return '#8b8173';
  };

  const renderRoadFeature = (road: WorldMapRoadFeature, keyPrefix: string) => {
    if (road.shape === 'ring') {
      const midRadius = (road.innerRadius + road.outerRadius) * 0.5;
      return (
        <circle
          key={`${keyPrefix}_${road.id}`}
          cx={road.x}
          cy={road.z}
          r={midRadius}
          fill="none"
          stroke="#3f4850"
          strokeWidth={Math.max(1.5, road.outerRadius - road.innerRadius)}
        />
      );
    }
    return (
      <polygon
        key={`${keyPrefix}_${road.id}`}
        points={road.points.map((point) => `${point.x},${point.z}`).join(' ')}
        fill="#3f4850"
        stroke="#242b31"
        strokeWidth={0.65}
        vectorEffect="non-scaling-stroke"
      />
    );
  };

  const isSpringfieldLandmark = (category: MapLandmark['category']) =>
    category === 'homer_city' || category === 'police_jail' || category === 'simpsons_house' || category === 'suburbs' || category === 'sports';
  const isGoldenrodLandmark = (category: MapLandmark['category']) =>
    category === 'goldenrod' || category === 'oak_lab' || category === 'player_garage';
  const isHighwayLandmark = (category: MapLandmark['category']) =>
    category === 'highway' || category === 'countryside';
  const isAirportLandmark = (category: MapLandmark['category']) => category === 'airport';

  const fullMapLabelIds = new Set([
    'oak_lab',
    'goldenrod_center',
    'player_garage',
    'goldenrod_dept_store',
    'goldenrod_radio_studios_east',
    'magnet_train_station',
    'springfield_train_terminal',
    'simpsons_house',
    'police_jail',
    'springfield_town_square',
    'springfield_soccer_field',
    'golden_gate_bridge',
    'north_viaduct',
    'country_bridge',
    'springfield_regional_airport',
    'airport_terminal',
    'airport_control_tower',
    'airport_runway',
  ]);
  const shortMapLabel = (lm: MapLandmark) => {
    const overrides: Record<string, string> = {
      oak_lab: "OAK'S LAB",
      goldenrod_center: 'POKÉMON CENTER / HOSPITAL',
      player_garage: 'PLAYER HOUSE',
      goldenrod_dept_store: 'DEPT. STORE',
      goldenrod_radio_studios_east: 'RADIO STUDIOS',
      magnet_train_station: 'GOLDENROD STATION',
      springfield_train_terminal: 'SPRINGFIELD STATION',
      simpsons_house: 'SIMPSONS HOUSE',
      police_jail: 'POLICE / JAIL',
      springfield_town_square: 'TOWN SQUARE',
      springfield_soccer_field: 'SOCCER FIELD',
      golden_gate_bridge: 'CENTRAL BRIDGE',
      north_viaduct: 'NORTH VIADUCT',
      country_bridge: 'SOUTH BRIDGE',
      springfield_regional_airport: 'REGIONAL AIRPORT',
      airport_terminal: 'AIRPORT TERMINAL',
      airport_control_tower: 'CONTROL TOWER',
      airport_runway: 'RUNWAY 09 / 27',
    };
    return overrides[lm.id] ?? lm.name.toUpperCase();
  };
  const soccerLandmark = landmarks.find((lm) => lm.id === 'springfield_soccer_field');
  // Keep the large town titles in a lower, quieter map band so they do not
  // cover the permanent POI/location labels around the town centres.
  const springfieldTitlePos = worldToFullPercent(-225, 212);
  const goldenrodTitlePos = worldToFullPercent(220, 212);
  const airportTitlePos = worldToFullPercent(0, -845);

  const specialMeta = currentPokemon.id === 'pikachu'
    ? { label: 'Electric Burst', icon: <Zap className="w-3 h-3 text-yellow-300" />, detail: 'Shock NPCs & disable cars' }
    : currentPokemon.id === 'charmander'
    ? { label: 'Fire Breath', icon: <Flame className="w-3 h-3 text-orange-400" />, detail: 'Burn props & grass' }
    : currentPokemon.id === 'poliway'
    ? { label: 'Water Pistol', icon: <Droplets className="w-3 h-3 text-sky-400" />, detail: 'Soak NPCs, grow trees, put out fires' }
    : currentPokemon.id === 'charizard'
    ? { label: 'Fire Breath', icon: <Flame className="w-3 h-3 text-orange-300" />, detail: 'Fire breath • Space jump • Space again to fly • Shift descend/land' }
    : { label: 'Ground Slam', icon: <Shield className="w-3 h-3 text-emerald-300" />, detail: 'Launch everyone nearby' };

  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden font-sans">
      {/* ---------------- TOP LEFT: POKÉMON STATUS & WATER LEVEL ---------------- */}
      <div ref={topLeftRef} className="absolute top-4 left-4 pointer-events-auto flex flex-col gap-2">
        {!hasChosenStarter ? (
          <div className="bg-slate-900/90 border-2 border-red-500/80 rounded-xl px-3.5 py-3 shadow-2xl backdrop-blur-md text-white min-w-[240px] max-w-[290px]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-red-600 border-2 border-white/80 flex items-center justify-center text-white font-black text-sm shadow-md">
                A
              </div>
              <div>
                <div className="font-black text-base leading-tight tracking-wide text-red-300">ASH KETCHUM</div>
                <div className="text-[10px] uppercase tracking-[0.12em] font-black text-slate-400">No active Pokémon yet</div>
              </div>
            </div>
            <div className="mt-2.5 rounded-lg border border-amber-400/40 bg-amber-950/35 px-2.5 py-2">
              <div className="text-xs font-black text-amber-300">Choose your starter</div>
              <div className="mt-0.5 text-[10px] leading-snug text-slate-300">Walk up to Pikachu, Charmander or Poliwag in Oak's Lab and press E.</div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/90 border-2 border-amber-400 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-white min-w-[240px]">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-slate-900 font-black text-sm">
                  {currentPokemon.id === 'pikachu' && '⚡'}
                  {currentPokemon.id === 'charmander' && '🔥'}
                  {currentPokemon.id === 'poliway' && '💧'}
                  {currentPokemon.id === 'geodude_legs' && '💪'}
                  {currentPokemon.id === 'charizard' && '🐉'}
                </div>
                <div>
                  <div className="font-bold text-base leading-tight tracking-wide text-amber-300">
                    {currentPokemon.name}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold">
                    Lv. {currentPokemon.level} Pokémon
                  </div>
                </div>
              </div>

              {/* Quick Character Select Pill */}
              <div className="flex gap-1">
                <button
                  id="btn-select-pikachu"
                  onClick={() => onSelectStarter('pikachu')}
                  disabled={!hasChosenStarter}
                  className={`w-6 h-6 rounded-md text-xs font-bold transition flex items-center justify-center ${
                    currentPokemon.id === 'pikachu'
                      ? 'bg-amber-400 text-slate-900 ring-2 ring-white'
                      : 'bg-slate-750 hover:bg-slate-700 text-amber-300'
                  }`}
                  title="Switch to Pikachu"
                >
                  P
                </button>
                <button
                  id="btn-select-charmander"
                  onClick={() => onSelectStarter('charmander')}
                  disabled={!hasChosenStarter}
                  className={`w-6 h-6 rounded-md text-xs font-bold transition flex items-center justify-center ${
                    currentPokemon.id === 'charmander'
                      ? 'bg-orange-500 text-white ring-2 ring-white'
                      : 'bg-slate-750 hover:bg-slate-700 text-orange-400'
                  }`}
                  title="Switch to Charmander"
                >
                  C
                </button>
                <button
                  id="btn-select-poliway"
                  onClick={() => onSelectStarter('poliway')}
                  disabled={!hasChosenStarter}
                  className={`w-6 h-6 rounded-md text-xs font-bold transition flex items-center justify-center ${
                    currentPokemon.id === 'poliway'
                      ? 'bg-blue-500 text-white ring-2 ring-white'
                      : 'bg-slate-750 hover:bg-slate-700 text-blue-400'
                  }`}
                  title="Switch to Poliwag"
                >
                  W
                </button>
                {unlockedGeodude && (
                  <button
                    id="btn-select-geodude"
                    onClick={() => onSelectStarter('geodude_legs')}
                    disabled={!hasChosenStarter}
                    className={`w-6 h-6 rounded-md text-xs font-bold transition flex items-center justify-center ${
                      currentPokemon.id === 'geodude_legs'
                        ? 'bg-emerald-500 text-white ring-2 ring-white'
                        : 'bg-slate-750 hover:bg-slate-700 text-emerald-400'
                    }`}
                    title="Geodude with Legs (Unlocked!)"
                  >
                    G
                  </button>
                )}
                <button
                  id="btn-select-charizard"
                  onClick={() => onSelectStarter('charizard')}
                  disabled={!hasChosenStarter}
                  className={`w-6 h-6 rounded-md text-xs font-bold transition flex items-center justify-center ${
                    currentPokemon.id === 'charizard'
                      ? 'bg-orange-600 text-white ring-2 ring-white'
                      : 'bg-slate-750 hover:bg-slate-700 text-orange-300'
                  }`}
                  title="Switch to playable Charizard (5)"
                >
                  Z
                </button>
              </div>
            </div>

            {/* Health Bar */}
            <div className="mb-2">
              <div className="flex justify-between text-xs font-bold text-slate-300 mb-0.5">
                <span>HP</span>
                <span>
                  {formatHealth(currentPokemon.hp)}/{formatHealth(currentPokemon.maxHp)}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.max(5, (currentPokemon.hp / currentPokemon.maxHp) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Character-specific Q ability */}
            <div className="rounded-lg bg-slate-950/55 border border-slate-700 px-2.5 py-2">
              <div className="flex justify-between text-xs font-bold text-slate-200 mb-1">
                <span className="flex items-center gap-1.5">
                  {specialMeta.icon} {hasChosenStarter ? specialMeta.label : 'Choose starter in Oak\'s Lab'}
                </span>
                {hasChosenStarter && <span className="text-amber-300">[Q]</span>}
              </div>
              {hasChosenStarter && (
                <>
                  <div className="text-[10px] text-slate-400 mb-1">{specialMeta.detail}</div>
                  {currentPokemon.id === 'poliway' && (
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                      <div
                        className="h-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-200 rounded-full"
                        style={{ width: `${currentPokemon.waterLevel}%` }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Grown Trees Counter */}
            <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-emerald-400">
              <span>Trees Grown:</span>
              <span className="bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-700">
                🌳 {treesGrownCount}
              </span>
            </div>
          </div>
        )}

        {hasChosenStarter && worldGoal && (
          <div className="bg-slate-950/90 border border-cyan-500/60 rounded-xl px-3 py-2.5 shadow-xl backdrop-blur-md text-white w-[270px] max-w-[32vw]">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="text-[10px] uppercase tracking-[0.16em] font-black text-cyan-300 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> World Goal
              </span>
              <span className="text-[9px] font-black text-slate-400">
                {worldGoal.completedCount}/{worldGoal.totalCount}
              </span>
            </div>
            <div className={`text-xs font-black leading-tight ${worldGoal.completed ? 'text-emerald-300' : 'text-white'}`}>
              {worldGoal.title}
            </div>
            <div className="mt-0.5 text-[10px] leading-snug text-slate-400">
              {worldGoal.description}
            </div>
            <div className="mt-2 h-1.5 rounded-full overflow-hidden bg-slate-800 border border-slate-700">
              <div
                className={`h-full transition-all duration-300 ${worldGoal.completed ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                style={{
                  width: `${Math.max(
                    worldGoal.completed ? 100 : 4,
                    Math.min(100, (worldGoal.current / Math.max(1, worldGoal.target)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ---------------- TOP RIGHT: PERFORMANCE & CONTROLS ---------------- */}
      <div ref={topRightRef} className="absolute top-4 right-4 pointer-events-auto flex flex-col items-end gap-2.5">
        <div className="flex items-stretch justify-end gap-2">
          <div
            className={`bg-slate-900/90 border-2 rounded-xl px-3 py-2 shadow-xl backdrop-blur-md min-w-[72px] text-center ${
              fps >= 50
                ? 'border-emerald-500/80'
                : fps >= 30
                ? 'border-amber-500/80'
                : 'border-red-500/90'
            }`}
            title="Live frames per second"
          >
            <div className="text-[9px] font-black tracking-widest text-slate-400 uppercase">FPS</div>
            <div
              className={`font-mono font-black text-xl leading-none ${
                fps >= 50 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-red-400'
              }`}
            >
              {fps}
            </div>
          </div>
          <button
            id="btn-restart-world"
            onClick={() => setShowRestartConfirm(true)}
            className="px-3 py-2 bg-rose-950/90 hover:bg-rose-900 border-2 border-rose-600/80 rounded-xl text-rose-100 shadow-xl backdrop-blur-md transition flex flex-col items-center justify-center min-w-[78px]"
            title="Restart temporary world state"
          >
            <RefreshCw className="w-4 h-4 text-rose-300 mb-0.5" />
            <span className="text-[9px] font-black tracking-wide uppercase">Restart</span>
          </button>
        </div>

        {/* Quick Utility Buttons */}
        <div className="flex gap-2">
          <button
            id="btn-toggle-sound"
            onClick={onToggleMute}
            className="p-2.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 shadow-md transition"
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
          <button
            id="btn-reset-player"
            type="button"
            onMouseDown={(event) => {
              // Mouse clicks should perform the recovery without making this HUD
              // control the browser's active keyboard target. Keep Tab/keyboard
              // accessibility intact; keyboard activation is blurred in onClick.
              event.preventDefault();
            }}
            onClick={(event) => {
              // A focused HTML button treats Space as another click on key release.
              // Reset Pos must immediately give keyboard control back to gameplay,
              // otherwise a normal jump tap re-triggers this button when Space is
              // released and teleports the character straight back to the ground.
              event.currentTarget.blur();
              onResetPlayer();
            }}
            className="p-2.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-200 shadow-md transition flex items-center gap-1.5 text-xs font-bold"
            title="Recover to last safe position"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" /> Reset Pos
          </button>
        </div>
      </div>

      {/* ---------------- BOTTOM RIGHT: INSTRUCTION BAR & VEHICLE SPEEDOMETER ---------------- */}
      <div ref={bottomRightRef} className="absolute bottom-2 right-2 pointer-events-auto flex flex-col-reverse items-end gap-1.5 z-30 max-w-[390px] sm:max-w-[420px]">
        {/* Instruction Bar containing the controls */}
        <div
          id="instruction-bar-controls"
          className="hud-controls bg-slate-900/90 border border-slate-700/80 rounded-xl px-2 py-1.5 text-[9px] sm:text-[10px] font-bold text-slate-300 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 w-fit max-w-full"
        >
          <span className="text-[10px] uppercase tracking-wider text-amber-400 font-extrabold flex items-center gap-1">
            CONTROLS
          </span>
          {aircraft ? (
            <>
              <span><b className="text-amber-400">W/S</b> Throttle / ground reverse</span>
              <span><b className="text-amber-400">←/→</b> Turn / taxi steer</span>
              <span><b className="text-amber-400">↑/↓</b> Climb / descend</span>
              <span><b className="text-amber-400">Space</b> Ground brake</span>
              <span><b className="text-amber-400">E</b> Exit / bail out</span>
              <span><b className="text-amber-400">TAB</b> Map</span>
            </>
          ) : parachute ? (
            parachute.mode === 'freefall' ? (
              <>
                <span><b className="text-amber-400">SPACE</b> Deploy parachute</span>
                <span><b className="text-amber-400">WASD / Arrows</b> Air steer</span>
              </>
            ) : (
              <>
                <span><b className="text-amber-400">W / ↑</b> Glide forward</span>
                <span><b className="text-amber-400">A/D / ←/→</b> Steer</span>
                <span><b className="text-amber-400">S / ↓</b> Slow / steeper descent</span>
              </>
            )
          ) : (
            <>
              <span><b className="text-amber-400">WASD</b> Move/Drive</span>
              <span><b className="text-amber-400">E</b> Interact/Car</span>
              <span><b className="text-amber-400">F</b> Attack</span>
              {!inVehicle && <span><b className="text-amber-400">G</b> Grab/Throw</span>}
              <span><b className="text-amber-400">Q</b> Special</span>
              <span><b className="text-amber-400">Space</b> {inVehicle ? 'Brake' : 'Jump ×2 / Stomp'}</span>
              <span><b className="text-amber-400">Shift</b> Sprint/Nitro</span>
              <span><b className="text-amber-400">TAB</b> Map</span>
            </>
          )}
        </div>

        {/* Aircraft HUD only while actively piloting an aircraft. */}
        {inVehicle && aircraft && (
          <div className="bg-slate-950/95 border-2 border-sky-400 rounded-2xl p-3 shadow-[0_0_30px_rgba(56,189,248,0.28)] backdrop-blur-lg text-white min-w-[245px] max-w-[310px]">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-black text-sky-300">Aircraft</div>
                <div className="text-sm font-black text-white leading-tight">{aircraft.name}</div>
                <div className="text-[9px] uppercase tracking-wider text-slate-400">{aircraft.kind.replace(/_/g, ' ')}</div>
              </div>
              <div className={`text-[10px] font-black rounded-full border px-2 py-1 ${aircraft.crashed ? 'border-red-500/70 bg-red-950/70 text-red-300' : aircraft.onGround ? 'border-emerald-500/60 bg-emerald-950/60 text-emerald-300' : 'border-sky-400/60 bg-sky-950/70 text-sky-300'}`}>
                {aircraft.crashed ? 'CRASHED' : aircraft.onGround ? 'GROUND' : 'AIRBORNE'}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-900/85 border border-slate-800 px-2 py-1.5">
                <div className="text-lg font-black text-sky-300 leading-none">{Math.round(Math.abs(aircraft.speed) * 3.6)}</div>
                <div className="text-[8px] uppercase font-bold text-slate-500 mt-1">km/h</div>
              </div>
              <div className="rounded-lg bg-slate-900/85 border border-slate-800 px-2 py-1.5">
                <div className="text-lg font-black text-amber-300 leading-none">{Math.round(aircraft.throttle * 100)}%</div>
                <div className="text-[8px] uppercase font-bold text-slate-500 mt-1">Throttle</div>
              </div>
              <div className="rounded-lg bg-slate-900/85 border border-slate-800 px-2 py-1.5">
                <div className="text-lg font-black text-emerald-300 leading-none">{Math.round(aircraft.altitude)}</div>
                <div className="text-[8px] uppercase font-bold text-slate-500 mt-1">Altitude m</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] font-bold">
              <span className="text-slate-400">Vertical speed <b className={aircraft.verticalSpeed < -3 ? 'text-amber-300' : 'text-slate-200'}>{aircraft.verticalSpeed.toFixed(1)} m/s</b></span>
              <span className={aircraft.damage >= 70 ? 'text-red-300' : aircraft.damage >= 35 ? 'text-amber-300' : 'text-emerald-300'}>Damage {Math.round(aircraft.damage)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full overflow-hidden bg-slate-800"><div className="h-full bg-sky-400 transition-all" style={{ width: `${Math.max(0, Math.min(100, (Math.abs(aircraft.speed) / Math.max(1, aircraft.maxSpeed)) * 100))}%` }} /></div>
          </div>
        )}

        {parachute && (
          <div className="bg-slate-950/95 border-2 border-violet-400 rounded-2xl p-3 shadow-[0_0_30px_rgba(167,139,250,0.24)] backdrop-blur-lg text-white min-w-[235px] max-w-[300px]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-black text-violet-300">{parachute.mode === 'freefall' ? 'Freefall' : 'Parachute'}</div>
                <div className="text-sm font-black text-white">{parachute.mode === 'freefall' ? 'SPACE TO DEPLOY' : 'Canopy deployed'}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-emerald-300 leading-none">{Math.round(parachute.altitude)}</div>
                <div className="text-[8px] uppercase font-bold text-slate-500 mt-1">Altitude m</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] font-bold text-slate-300">
              <span>Vertical <b className={parachute.verticalSpeed < -12 ? 'text-red-300' : parachute.verticalSpeed < -7 ? 'text-amber-300' : 'text-emerald-300'}>{parachute.verticalSpeed.toFixed(1)} m/s</b></span>
              {parachute.mode === 'parachute' && <span>Open <b className="text-violet-300">{Math.round(parachute.deployment * 100)}%</b></span>}
            </div>
          </div>
        )}

        {/* Speedometer when in vehicle */}
        {inVehicle && currentVehicle && (
          <div className="bg-slate-950/95 border-2 border-cyan-500 rounded-2xl p-3 shadow-[0_0_30px_rgba(6,182,212,0.3)] backdrop-blur-lg text-white min-w-[230px] max-w-[300px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-extrabold text-cyan-400 tracking-wider flex items-center gap-1.5">
                <Car className="w-4 h-4 text-cyan-400" /> {currentVehicle.name}
              </span>
              <div className="flex items-center gap-1.5">
                {currentVehicle.wrecked && (
                  <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest animate-pulse">
                    WRECKED
                  </span>
                )}
                {currentVehicle.isDrifting && !currentVehicle.wrecked && (
                  <span className="bg-amber-500 text-slate-950 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest animate-pulse">
                    DRIFT!
                  </span>
                )}
              </div>
            </div>

            {/* Digital Speed Display */}
            <div className="flex items-baseline justify-between my-2">
              <div className="font-black text-4xl tracking-tight text-white font-mono">
                {Math.round(Math.abs(currentVehicle.speed * 2.5))}
              </div>
              <div className="text-xs font-black text-slate-400 tracking-widest uppercase">
                KM/H
              </div>
            </div>

            {/* Speedometer Gauge Bar */}
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800 mb-2">
              <div
                className={`h-full transition-all duration-75 rounded-full ${
                  currentVehicle.isBoosting
                    ? 'bg-gradient-to-r from-amber-500 via-red-500 to-yellow-400'
                    : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-400'
                }`}
                style={{
                  width: `${Math.min(100, (Math.abs(currentVehicle.speed) / currentVehicle.maxSpeed) * 100)}%`,
                }}
              />
            </div>

            {/* Vehicle condition */}
            <div className="mb-2">
              <div className="flex justify-between text-[10px] font-bold mb-0.5">
                <span className={currentVehicle.damage >= 75 ? 'text-red-400' : currentVehicle.damage >= 40 ? 'text-amber-300' : 'text-emerald-300'}>
                  VEHICLE DAMAGE
                </span>
                <span className="text-slate-300">{Math.round(currentVehicle.damage)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-150 ${currentVehicle.damage >= 75 ? 'bg-red-500' : currentVehicle.damage >= 40 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.max(0, Math.min(100, currentVehicle.damage))}%` }}
                />
              </div>
            </div>

            {/* Nitrous Oxide (NOS) Gauge */}
            <div>
              <div className="flex justify-between text-[11px] font-bold text-amber-300 mb-0.5">
                <span className="flex items-center gap-1">
                  <Flame className="w-3 h-3 text-amber-400" /> NITRO BOOST (SHIFT)
                </span>
                <span>{Math.round(currentVehicle.boostFuel)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-red-500 transition-all duration-100 rounded-full"
                  style={{ width: `${currentVehicle.boostFuel}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------- BOTTOM LEFT: HIT & RUN + INTERACTIVE MINIMAP ---------------- */}
      <div ref={bottomLeftRef} className="absolute bottom-3 left-3 pointer-events-auto flex items-end gap-2">
        {/* Thick clockwise meter inspired by the original game's radar-adjacent gauge,
            rebuilt with original CSS rather than copied HUD artwork. */}
        <div className={`flex flex-col items-center gap-1 ${hitAndRunActive ? 'animate-pulse' : ''}`} title="Cause chaos to fill the meter. Police only chase when it is completely full.">
          <div
            className={`relative w-[88px] h-[88px] rounded-full p-[7px] border-[4px] shadow-2xl transition-all duration-200 ${
              hitAndRunActive ? 'border-red-500 shadow-[0_0_26px_rgba(239,68,68,0.9)]' : 'border-black/90 shadow-[0_0_14px_rgba(250,204,21,0.28)]'
            }`}
            style={{
              background: `conic-gradient(from -90deg, ${hitAndRunActive ? '#ef1d1d' : wantedHeat >= 75 ? '#ff5a1f' : '#f7d21e'} 0deg, ${hitAndRunActive ? '#ffcf21' : wantedHeat >= 75 ? '#ff2d21' : '#ffd91c'} ${Math.max(0, Math.min(100, wantedHeat)) * 3.6}deg, #27272a ${Math.max(0, Math.min(100, wantedHeat)) * 3.6}deg 360deg)`,
            }}
          >
            <div className="w-full h-full rounded-full bg-slate-950 border-[3px] border-black flex flex-col items-center justify-center text-center">
              <div className={`text-[10px] leading-none font-black tracking-tight ${hitAndRunActive ? 'text-red-400' : 'text-yellow-300'}`}>HIT & RUN</div>
              <div className="mt-1 font-black text-lg leading-none text-white">{Math.round(wantedHeat)}%</div>
            </div>
          </div>
          <div className={`px-2 py-0.5 rounded border text-[9px] font-black tracking-wider uppercase ${
            hitAndRunActive
              ? 'bg-red-600 border-yellow-300 text-yellow-100'
              : wantedHeat >= 75
              ? 'bg-red-950/90 border-red-500 text-red-300'
              : 'bg-slate-950/90 border-yellow-500/60 text-yellow-300'
          }`}>
            {hitAndRunActive ? 'POLICE PURSUIT' : wantedHeat >= 75 ? 'DANGER' : 'CHAOS METER'}
          </div>
        </div>
        <div className="bg-slate-950/90 border-2 border-slate-700 rounded-2xl p-2 shadow-2xl backdrop-blur-md relative overflow-hidden group">
          <div className="text-[11px] font-bold text-slate-300 mb-1 px-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1">
              <Compass className="w-3 h-3 text-amber-400" /> REGION RADAR
            </span>
            <button
              id="btn-open-big-map"
              onClick={() => setShowBigMap(true)}
              className="text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded transition flex items-center gap-1 shadow-sm"
              title="Open full interactive map (Press TAB)"
            >
              <Layers className="w-2.5 h-2.5" /> MAP [TAB]
            </button>
            <span className="text-[9px] text-slate-400 font-mono">
              X:{Math.round(playerPos.x)} Z:{Math.round(playerPos.z)}
            </span>
          </div>

          {/* Local moving minimap generated from the current world snapshot. */}
          <div
            id="interactive-minimap-container"
            className="relative bg-[#263d2f] rounded-xl overflow-hidden border border-slate-700 group/map"
            style={{ width: `${mapWidth}px`, height: `${mapHeight}px` }}
            title="Local navigation radar. Landmark pins can be used for safe fast travel."
          >
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`${miniMinX} ${miniMinZ} ${miniWorldWidth} ${miniWorldHeight}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect x={miniMinX} y={miniMinZ} width={miniWorldWidth} height={miniWorldHeight} fill="#294b36" />
              {worldMap.areas.map((area) => (
                <rect
                  key={`mini_area_${area.id}`}
                  x={area.x - area.width * 0.5}
                  y={area.z - area.depth * 0.5}
                  width={area.width}
                  height={area.depth}
                  rx={area.kind === 'sports' || area.kind === 'park' ? 1.5 : 0}
                  fill={mapAreaFill(area)}
                  opacity={area.kind === 'water' ? 0.95 : 0.78}
                  stroke={area.kind === 'sports' ? '#d7f7d0' : area.kind === 'rail' ? '#cbd5e1' : 'none'}
                  strokeWidth={area.kind === 'sports' ? 0.65 : area.kind === 'rail' ? 0.45 : 0}
                  strokeDasharray={area.kind === 'rail' ? '2 1.5' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {worldMap.roads.map((road) => renderRoadFeature(road, 'mini'))}
            </svg>

            {/* Nearby POIs only; the full atlas carries the complete label set. */}
            {landmarks.filter((lm) => miniVisible(lm.x, lm.z)).map((lm) => {
              const mPos = miniWorldToMap(lm.x, lm.z);
              return (
                <button
                  type="button"
                  key={lm.id}
                  onMouseDown={(event) => {
                    // Keep mouse fast-travel from becoming the browser's keyboard
                    // target. Otherwise Space on key-up can activate this pin again.
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    travelToLandmark(lm);
                  }}
                  className="absolute w-3 h-3 rounded-full transform -translate-x-1/2 -translate-y-1/2 border border-white/90 shadow-[0_0_5px_rgba(0,0,0,0.85)] hover:scale-150 transition-transform z-10"
                  style={{ left: `${mPos.x}px`, top: `${mPos.y}px`, backgroundColor: lm.color }}
                  title={`${lm.name} • click for safe fast travel`}
                  aria-label={`Fast travel to ${lm.name}`}
                />
              );
            })}

            {policePositions.filter((pos) => miniVisible(pos.x, pos.z)).map((pos, i) => {
              const pMap = miniWorldToMap(pos.x, pos.z);
              return (
                <div
                  key={`cop_${i}`}
                  className="absolute w-2.5 h-2.5 rounded-full bg-red-500 border border-white transform -translate-x-1/2 -translate-y-1/2 animate-pulse pointer-events-none z-10"
                  style={{ left: `${pMap.x}px`, top: `${pMap.y}px` }}
                />
              );
            })}

            {/* Player stays centred while the world scrolls beneath them. */}
            <div
              className="absolute w-4 h-4 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-20"
              style={{ left: `${mapWidth / 2}px`, top: `${mapHeight / 2}px` }}
            >
              <div className="absolute w-5 h-5 rounded-full bg-yellow-300/15 border border-yellow-300/25" />
              <div
                className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[11px] border-b-yellow-300 drop-shadow-[0_0_5px_#facc15]"
                style={{ transform: `rotate(${mapArrowRotation}rad)`, transition: 'transform 110ms linear' }}
              />
            </div>

            <div className="absolute top-1 left-1.5 rounded bg-slate-950/70 px-1.5 py-0.5 text-[8px] font-black tracking-wide text-slate-200 pointer-events-none">
              {playerPos.z < -300 ? 'AIRPORT DISTRICT' : playerPos.x < -70 ? 'SPRINGFIELD' : playerPos.x > 70 ? 'GOLDENROD' : 'ROUTE / RIVER'}
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-slate-950/78 text-[8px] text-slate-300 text-center py-0.5 pointer-events-none">
              LOCAL RADAR • TAB = FULL WORLD MAP
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- ASH BATTLE VICTORY NOTIFICATION ---------------- */}
      {showAshVictory && (
        <div
          className="absolute left-1/2 transform -translate-x-1/2 pointer-events-auto w-full max-w-lg px-4 z-40 transition-[top] duration-200"
          style={{ top: `${topHudClearance}px` }}
        >
          <button
            type="button"
            onClick={onDismissAshVictory}
            className="relative w-full bg-gradient-to-r from-amber-600 to-yellow-500 border-2 border-yellow-200 rounded-2xl p-4 shadow-[0_0_40px_rgba(234,179,8,0.9)] text-slate-950 font-bold text-center cursor-pointer hover:brightness-110 transition overflow-hidden"
            title="Click to dismiss • Auto-closes after 6 seconds"
          >
            <X className="absolute top-2 right-2 w-4 h-4 opacity-70" />
            <div className="text-2xl font-black tracking-wide mb-1">🎉 ASH WAS DEFEATED! 🎉</div>
            <div className="text-sm">
              You triumphed over Ash Ketchum's Springfield Dream Team!
              <br />
              <span className="font-extrabold underline">GEODUDE WITH LEGS</span> is now unlocked!
            </div>
            <div className="mt-2 text-[10px] font-black uppercase tracking-wider opacity-70">
              Click to dismiss • Auto-closes in 6s
            </div>
            <div className="hud-notification-life absolute bottom-0 left-0 h-[3px] bg-slate-950/70" />
          </button>
        </div>
      )}

      {/* ---------------- HIT & RUN TRIGGER WARNING ---------------- */}
      {hitAndRunWarning && (
        <div className="absolute inset-0 z-[70] pointer-events-none flex items-center justify-center">
          <div className="relative -translate-y-16 px-10 py-5 bg-black/80 border-y-[6px] border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.9)] animate-pulse -rotate-2">
            <div className="text-[clamp(3.5rem,9vw,8rem)] leading-none font-black italic tracking-[-0.06em] text-yellow-300 drop-shadow-[5px_5px_0_#dc2626]">
              HIT & RUN!
            </div>
            <div className="mt-2 text-center text-sm md:text-lg font-black uppercase tracking-[0.32em] text-white">
              Police pursuit triggered
            </div>
          </div>
        </div>
      )}

      {/* ---------------- BUSTED OVERLAY SCREEN ---------------- */}
      {isBusted && (
        <div className="absolute inset-0 bg-red-950/80 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none animate-fadeIn">
          <div className="text-6xl font-black text-red-500 tracking-widest drop-shadow-[0_0_20px_#ef4444] mb-4">
            BUSTED!
          </div>
          <div className="text-xl font-bold text-white mb-2">
            Chief Wiggum & Springfield Police captured you!
          </div>
          <div className="text-sm text-slate-300">
            Transporting to Springfield Police Station Jail cell...
          </div>
        </div>
      )}

      {/* ---------------- TEMPORARY DIALOGUE / ASH BATTLE LANE ----------------
          Character talking cards auto-close after six seconds (or can be dismissed
          manually). The live Ash battle status panel is state-driven and remains
          visible for the duration of the battle.
      */}
      {((ashBattleState.isActive && ashBattleState.currentBoss) || activeDialogue) && (
        <div
          className="absolute z-40 pointer-events-none transition-[left,right,bottom] duration-150 flex justify-center"
          style={persistentDialogueStyle}
        >
          <div className="w-full max-w-2xl flex flex-col items-center gap-2">
            {ashBattleState.isActive && ashBattleState.currentBoss && (
              <div className="pointer-events-none w-full bg-slate-950/95 border-2 border-red-500 rounded-xl px-4 py-2.5 shadow-[0_0_24px_rgba(239,68,68,0.45)] backdrop-blur-xl text-white">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">🥊</span>
                    <span className="font-black text-sm text-red-400 tracking-wide truncate">
                      {ashBattleState.currentBoss.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-yellow-300 uppercase tracking-wider bg-red-950/80 px-2 py-0.5 rounded border border-red-800 whitespace-nowrap">
                    Ash Battle
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-red-900/80">
                  <div
                    className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 transition-all duration-150 rounded-full"
                    style={{
                      width: `${Math.max(
                        0,
                        ((ashBattleState.currentBoss.hp ?? 0) / ashBattleState.currentBoss.maxHp) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 mt-1 text-[10px] font-semibold text-slate-300">
                  <span className="truncate">Move: {ashBattleState.currentBoss.specialMove}</span>
                  <span className="whitespace-nowrap">
                    HP {formatHealth(ashBattleState.currentBoss.hp)}/{formatHealth(ashBattleState.currentBoss.maxHp)}
                  </span>
                </div>
              </div>
            )}

            {activeDialogue && (
              <button
                type="button"
                onClick={onDismissDialogue}
                className="group relative pointer-events-auto w-full bg-slate-950/95 border-2 border-amber-400 rounded-xl px-4 py-3 pr-10 shadow-2xl backdrop-blur-xl text-white text-left cursor-pointer hover:border-amber-300 hover:bg-slate-950 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/50 overflow-hidden"
                title="Click to dismiss dialogue • Auto-closes after 6 seconds"
                aria-label={`Dismiss dialogue from ${activeDialogue.speaker}`}
              >
                <X className="absolute top-3 right-3 w-4 h-4 text-slate-400 group-hover:text-white transition" />
                <div className="font-black text-xs text-amber-400 tracking-wide mb-1">
                  {activeDialogue.speaker}:
                </div>
                <div className="text-sm font-semibold leading-snug text-slate-100 whitespace-normal break-words overflow-visible">
                  "{activeDialogue.text}"
                </div>
                <div className="mt-1.5 text-[9px] uppercase tracking-wider font-bold text-slate-500 group-hover:text-slate-300 transition">
                  Click to dismiss • Auto-closes in 6s
                </div>
                <div className="hud-notification-life absolute bottom-0 left-0 h-[2px] bg-amber-300/90" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- SIX-SECOND TEMPORARY NOTIFICATION LANE ---------------- */}
      {temporaryNotification && (
        <div
          className="absolute z-50 pointer-events-none transition-[left,right,bottom] duration-150 flex justify-end"
          style={temporaryNotificationStyle}
        >
          <button
            key={temporaryNotification.id}
            type="button"
            onClick={onDismissTemporaryNotification}
            className="hud-temporary-notification group relative pointer-events-auto w-fit max-w-[440px] min-w-[240px] bg-slate-950/95 border border-cyan-400/80 rounded-xl px-3.5 py-2.5 pr-9 shadow-[0_0_22px_rgba(34,211,238,0.25)] backdrop-blur-xl text-white text-left cursor-pointer hover:border-cyan-300 transition overflow-hidden"
            title="Click to close"
            aria-label={`Close notification from ${temporaryNotification.speaker}`}
          >
            <X className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-slate-400 group-hover:text-white transition" />
            <div className="text-[10px] uppercase tracking-wider font-black text-cyan-300 mb-0.5">
              {temporaryNotification.speaker}
            </div>
            <div className="text-xs sm:text-sm font-semibold leading-snug text-slate-100 break-words">
              {temporaryNotification.text}
            </div>
            <div className="hud-notification-life absolute bottom-0 left-0 h-[2px] bg-cyan-300/80" />
          </button>
        </div>
      )}

      {/* ---------------- INTERACTION PROMPT LANE ---------------- */}
      {interactionPrompt && (
        <div
          className="absolute z-[45] pointer-events-none transition-[left,right,bottom] duration-150 flex justify-center"
          style={interactionPromptStyle}
        >
          <div className="max-w-[620px] bg-slate-900/95 border-2 border-amber-400 text-white px-3.5 py-1.5 rounded-full shadow-[0_0_18px_rgba(251,191,36,0.45)] backdrop-blur-md font-bold text-xs sm:text-sm flex items-center justify-center gap-2 text-center">
            <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-300" />
            <span className="break-words">{interactionPrompt}</span>
          </div>
        </div>
      )}

      {/* ---------------- OAK LAB WALK-UP POKÉMON CONFIRMATION ---------------- */}
      {starterSelectionCandidate && (
        <div className="absolute inset-0 z-[110] pointer-events-none flex items-end justify-center px-4 pb-[clamp(108px,16vh,168px)]">
          <div className="pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-2xl border-2 border-sky-300/85 bg-slate-950/95 p-4 text-white shadow-[0_0_34px_rgba(56,189,248,0.28)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-black ${
                starterSelectionCandidate.id === 'pikachu'
                  ? 'bg-amber-400 text-slate-950'
                  : starterSelectionCandidate.id === 'charmander'
                  ? 'bg-orange-500 text-white'
                  : 'bg-sky-500 text-white'
              }`}>
                {starterSelectionCandidate.id === 'pikachu' ? '⚡' : starterSelectionCandidate.id === 'charmander' ? '🔥' : '💧'}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-300">Professor Oak's Lab</div>
                <div className="truncate text-xl font-black text-white">{starterSelectionCandidate.name}</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-300">Select this Pokémon as your active character?</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onCancelStarterSelection}
                className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-700"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={onConfirmStarterSelection}
                className="rounded-xl border border-sky-300 bg-sky-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-sky-400"
              >
                SELECT {starterSelectionCandidate.name.toUpperCase()}
              </button>
            </div>
            <div className="mt-2 text-center text-[9px] font-bold uppercase tracking-wider text-slate-500">Enter confirms • Esc cancels</div>
          </div>
        </div>
      )}

      {/* ---------------- FULL-SCREEN INTERACTIVE WORLD MAP (TAB) ---------------- */}
      {showRestartConfirm && (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-slate-950/55 backdrop-blur-sm pointer-events-auto">
          <div className="w-[min(360px,calc(100vw-2rem))] rounded-2xl border-2 border-rose-500/70 bg-slate-950/95 p-5 text-white shadow-2xl">
            <div className="flex items-center gap-2 text-rose-300">
              <RefreshCw className="h-5 w-5" />
              <div className="text-lg font-black">Restart world?</div>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Reset temporary world state and return to Professor Oak's Lab? Permanent unlocks and saved progression will be kept.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                id="btn-restart-world-no"
                onClick={() => setShowRestartConfirm(false)}
                className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-700 transition"
              >
                NO
              </button>
              <button
                id="btn-restart-world-yes"
                onClick={() => {
                  setShowRestartConfirm(false);
                  onRestartWorld();
                }}
                className="rounded-xl border border-rose-400 bg-rose-600 px-4 py-2.5 text-sm font-black text-white hover:bg-rose-500 transition"
              >
                YES
              </button>
            </div>
          </div>
        </div>
      )}

      {showBigMap && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 pointer-events-auto select-none animate-fadeIn">
          <div className="bg-slate-900 border-2 border-amber-400/90 rounded-3xl shadow-[0_0_50px_rgba(251,191,36,0.3)] w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden text-white">
            {/* Map Header */}
            <div className="p-3.5 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-400 shadow-inner">
                  <Compass className="w-6 h-6 animate-spin-slow" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black tracking-wide text-amber-300">
                      CURRENT WORLD MAP & FAST TRAVEL
                    </h2>
                    <span className="hidden sm:inline-flex items-center gap-1 bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-full animate-pulse">
                      <Zap className="w-2.5 h-2.5" /> Current-world atlas
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Detailed roads, terrain, landmarks and safe destination travel
                  </p>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700">
                <button
                  id="tab-filter-all"
                  onClick={() => setMapFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    mapFilter === 'all'
                      ? 'bg-amber-400 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  id="tab-filter-springfield"
                  onClick={() => setMapFilter('springfield')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    mapFilter === 'springfield'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Springfield
                </button>
                <button
                  id="tab-filter-goldenrod"
                  onClick={() => setMapFilter('goldenrod')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    mapFilter === 'goldenrod'
                      ? 'bg-cyan-400 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Goldenrod City
                </button>
                <button
                  id="tab-filter-highway"
                  onClick={() => setMapFilter('highway')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    mapFilter === 'highway'
                      ? 'bg-emerald-400 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Countryside & Bridges
                </button>
                <button
                  id="tab-filter-airport"
                  onClick={() => setMapFilter('airport')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    mapFilter === 'airport'
                      ? 'bg-sky-400 text-slate-950 shadow'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Airport
                </button>
              </div>

              {/* Close Button */}
              <button
                id="btn-close-big-map"
                onClick={() => setShowBigMap(false)}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition flex items-center gap-1.5 text-xs font-bold"
                title="Close Map (TAB or ESC)"
              >
                <span className="hidden sm:inline bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">ESC</span>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Map Body Content: Split into Canvas and Fast Travel Destination Drawer */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-950">
              {/* Left/Center: Interactive Map Canvas */}
              <div className="flex-1 relative overflow-hidden flex items-center justify-center p-3">
                <div
                  id="interactive-world-map-canvas"
                  onWheel={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                    // Trackpads produce many small deltas while mouse wheels produce
                    // fewer large ones. Exponential scaling keeps both smooth and makes
                    // zoom direction platform-independent.
                    const scale = Math.exp(-e.deltaY * 0.0018);
                    setFullMapZoomAt(clampedFullMapZoom * scale, normX, normY);
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    // Buttons/fields/POI markers own their own clicks. Do not start a
                    // background-map pan when the press began on an interactive control.
                    const target = e.target as Element | null;
                    if (target?.closest('button, input, select, textarea, a, [role="button"]')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    fullMapDragRef.current = {
                      pointerId: e.pointerId,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      startCenterX: centerX,
                      startCenterZ: centerZ,
                      moved: false,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsFullMapDragging(true);
                  }}
                  onPointerMove={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                    setHoverWorldCoords(fullPercentToWorld(normX, normY));

                    const drag = fullMapDragRef.current;
                    if (!drag || drag.pointerId !== e.pointerId) return;
                    const dx = e.clientX - drag.startClientX;
                    const dy = e.clientY - drag.startClientY;
                    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
                    drag.moved = true;
                    // Presentation-only pan. These values are React map-view state and
                    // never write to playerPos, a vehicle/aircraft transform or camera.
                    // Content follows the hand: dragging left moves the map left, which
                    // means the world-space viewport centre moves right.
                    const wantedX = drag.startCenterX - (dx / Math.max(1, rect.width)) * fullWorldWidth;
                    const wantedZ = drag.startCenterZ - (dy / Math.max(1, rect.height)) * fullWorldHeight;
                    setFullMapViewCenter(clampFullMapCenter(wantedX, wantedZ));
                  }}
                  onPointerUp={(e) => {
                    const drag = fullMapDragRef.current;
                    // If this press began on a POI/button/control, the map never took
                    // ownership of the pointer. Leave its native click completely alone.
                    if (!drag || drag.pointerId !== e.pointerId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const wasMoved = drag.moved;
                    fullMapDragRef.current = null;
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                    setIsFullMapDragging(false);

                    // A real drag ONLY pans the UI map. A stationary press/release is
                    // the one and only path that converts screen coordinates into an
                    // explicit map-click fast-travel request.
                    if (wasMoved) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                    const world = fullPercentToWorld(normX, normY);
                    onFastTravel({
                      x: world.x,
                      z: world.z,
                      name: `Map point [${Math.round(world.x)}, ${Math.round(world.z)}]`,
                      mapClick: true,
                    });
                    setShowBigMap(false);
                  }}
                  onPointerCancel={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    fullMapDragRef.current = null;
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                    setIsFullMapDragging(false);
                  }}
                  onPointerLeave={() => {
                    if (!fullMapDragRef.current) setHoverWorldCoords(null);
                  }}
                  className={`relative bg-[#294434] border-2 border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl w-full max-w-[900px] ${isFullMapDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{ aspectRatio: '8 / 5', touchAction: 'none' }}
                >
                  <div
                    className="absolute right-2 top-2 z-50 flex items-center gap-1 rounded-xl border border-slate-600/80 bg-slate-950/88 p-1 shadow-lg"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="h-7 w-7 rounded-lg bg-slate-800 text-sm font-black text-white hover:bg-slate-700"
                      onClick={() => setFullMapZoomAt(clampedFullMapZoom / 1.35)}
                      aria-label="Zoom map out"
                      title="Zoom out"
                    >−</button>
                    <button
                      type="button"
                      className="min-w-[52px] h-7 rounded-lg bg-slate-900 px-2 text-[10px] font-black text-amber-300 hover:bg-slate-800"
                      onClick={resetFullMapZoom}
                      aria-label="Reset map zoom"
                      title="Fit complete world"
                    >{Math.round(clampedFullMapZoom * 100)}%</button>
                    <button
                      type="button"
                      className="h-7 w-7 rounded-lg bg-slate-800 text-sm font-black text-white hover:bg-slate-700"
                      onClick={() => setFullMapZoomAt(clampedFullMapZoom * 1.35)}
                      aria-label="Zoom map in"
                      title="Zoom in"
                    >+</button>
                    <button
                      type="button"
                      className="h-7 min-w-[34px] rounded-lg bg-slate-800 px-1.5 text-[10px] font-black text-cyan-200 hover:bg-slate-700"
                      onClick={() => setFullMapViewCenter({ x: playerPos.x, z: playerPos.z })}
                      aria-label="Recenter map on player"
                      title="Recenter on player (R)"
                    >YOU</button>
                  </div>
                  {/* Cached static geometry is generated once from the current authored world. */}
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox={`${fullBounds.minX} ${fullBounds.minZ} ${fullWorldWidth} ${fullWorldHeight}`}
                    preserveAspectRatio="none"
                    aria-label="Detailed world road and terrain map"
                  >
                    <defs>
                      <pattern id="world-map-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#b7c7b322" strokeWidth="0.45" />
                      </pattern>
                    </defs>
                    <rect x={fullBounds.minX} y={fullBounds.minZ} width={fullWorldWidth} height={fullWorldHeight} fill="#31533b" />
                    <rect x={fullBounds.minX} y={fullBounds.minZ} width={fullWorldWidth} height={fullWorldHeight} fill="url(#world-map-grid)" />

                    {worldMap.areas.filter((area) => area.kind !== 'rail').map((area) => (
                      <rect
                        key={`full_area_${area.id}`}
                        x={area.x - area.width * 0.5}
                        y={area.z - area.depth * 0.5}
                        width={area.width}
                        height={area.depth}
                        rx={area.kind === 'sports' || area.kind === 'park' ? 2.5 : 0}
                        fill={mapAreaFill(area)}
                        opacity={area.kind === 'water' ? 0.98 : 0.86}
                        stroke={area.kind === 'sports' ? '#d9f99d' : area.kind === 'park' ? '#65a30d' : '#11182744'}
                        strokeWidth={area.kind === 'sports' ? 1.2 : 0.65}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}

                    {worldMap.roads.map((road) => renderRoadFeature(road, 'full'))}

                    {/* Rail is drawn over roads so station corridors remain legible. */}
                    {worldMap.areas.filter((area) => area.kind === 'rail').map((area) => (
                      <rect
                        key={`full_rail_${area.id}`}
                        x={area.x - area.width * 0.5}
                        y={area.z - area.depth * 0.5}
                        width={area.width}
                        height={area.depth}
                        fill="#64748b"
                        opacity={0.88}
                        stroke="#e2e8f0"
                        strokeWidth={0.8}
                        strokeDasharray="3 2"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>

                  {/* District titles are anchored to their real world positions so expanding
                      the map for the airport does not leave city labels floating over the runway. */}
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none rounded-xl bg-slate-950/72 border border-amber-400/25 px-3 py-0.5" style={{ left: `${springfieldTitlePos.x}%`, top: `${springfieldTitlePos.y}%` }}>
                    <div className="text-sm font-black text-amber-300 tracking-wider">SPRINGFIELD</div>
                    <div className="text-[8px] leading-tight font-bold text-slate-300">Evergreen Terrace • Downtown • Community Field</div>
                  </div>
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 text-right pointer-events-none rounded-xl bg-slate-950/72 border border-cyan-400/25 px-3 py-0.5" style={{ left: `${goldenrodTitlePos.x}%`, top: `${goldenrodTitlePos.y}%` }}>
                    <div className="text-sm font-black text-cyan-300 tracking-wider">GOLDENROD CITY</div>
                    <div className="text-[8px] leading-tight font-bold text-slate-300">Civic district • Stations • Oak's Lab</div>
                  </div>
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none rounded-xl bg-slate-950/78 border border-sky-400/30 px-3 py-1.5" style={{ left: `${airportTitlePos.x}%`, top: `${airportTitlePos.y}%` }}>
                    <div className="text-sm font-black text-sky-300 tracking-wider">SPRINGFIELD REGIONAL AIRPORT</div>
                    <div className="text-[9px] font-bold text-slate-300">Terminal • Apron • Expansion stands • Runway 09/27</div>
                  </div>

                  {/* Landmark pins and selected always-visible labels. */}
                  {landmarks
                    .filter((lm) => {
                      if (mapFilter === 'springfield') return isSpringfieldLandmark(lm.category);
                      if (mapFilter === 'goldenrod') return isGoldenrodLandmark(lm.category);
                      if (mapFilter === 'highway') return isHighwayLandmark(lm.category);
                      if (mapFilter === 'airport') return isAirportLandmark(lm.category);
                      return true;
                    })
                    .map((lm) => {
                      const pos = worldToFullPercent(lm.x, lm.z);
                      const isHighlighted = activeHighlightId === lm.id;
                      const showPermanentLabel = fullMapLabelIds.has(lm.id);
                      return (
                        <button
                          type="button"
                          key={lm.id}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); travelToLandmark(lm); setShowBigMap(false); }}
                          onMouseEnter={() => setActiveHighlightId(lm.id)}
                          onMouseLeave={() => setActiveHighlightId(null)}
                          className="group absolute transform -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center"
                          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                          title={`${lm.name} • safe fast travel`}
                          aria-label={`Fast travel to ${lm.name}`}
                        >
                          {isHighlighted && <span className="absolute w-8 h-8 rounded-full border-2 border-amber-300 animate-ping pointer-events-none" />}
                          <span
                            className={`block w-4 h-4 rounded-[4px] border-2 border-white shadow-[0_0_8px_rgba(0,0,0,0.9)] transition-transform ${isHighlighted ? 'scale-150 ring-2 ring-amber-300' : 'group-hover:scale-150'}`}
                            style={{ backgroundColor: lm.color }}
                          />
                          {(showPermanentLabel || isHighlighted) && (
                            <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 rounded bg-slate-950/88 border border-slate-600/80 px-1.5 py-0.5 text-[8px] leading-tight font-black tracking-wide text-white whitespace-nowrap shadow-lg pointer-events-none">
                              {shortMapLabel(lm)}
                            </span>
                          )}
                        </button>
                      );
                    })}

                  {policePositions.map((pos, i) => {
                    const p = worldToFullPercent(pos.x, pos.z);
                    if (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) return null;
                    return (
                      <div
                        key={`cop_big_${i}`}
                        className="absolute w-3 h-3 rounded-full bg-red-600 border border-white transform -translate-x-1/2 -translate-y-1/2 animate-pulse z-20 pointer-events-none"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                        title="Police cruiser"
                      />
                    );
                  })}

                  {(() => {
                    const p = worldToFullPercent(playerPos.x, playerPos.z);
                    return (
                      <div
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center pointer-events-none"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      >
                        <div className="relative flex items-center justify-center">
                          <div className="absolute w-8 h-8 rounded-full bg-amber-400/25 animate-pulse" />
                          <div
                            className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[14px] border-b-amber-300 drop-shadow-[0_0_8px_#f59e0b]"
                            style={{ transform: `rotate(${mapArrowRotation}rad)`, transition: 'transform 110ms linear' }}
                          />
                        </div>
                        <span className="bg-slate-950/90 border border-amber-400 text-amber-300 px-1.5 py-0.5 rounded text-[9px] font-black uppercase mt-1 shadow-md">YOU</span>
                      </div>
                    );
                  })()}

                  {hoverWorldCoords && (() => {
                    const p = worldToFullPercent(hoverWorldCoords.x, hoverWorldCoords.z);
                    return (
                      <div
                        className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40 flex flex-col items-center"
                        style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      >
                        <div className="w-4 h-4 rounded-full border border-slate-200/70 bg-slate-950/20 flex items-center justify-center">
                          <div className="w-1 h-1 rounded-full bg-slate-100" />
                        </div>
                        <div className="bg-slate-950/85 border border-slate-600 text-[8px] text-slate-300 font-mono px-1.5 py-0.5 rounded whitespace-nowrap mt-1">
                          X {Math.round(hoverWorldCoords.x)} • Z {Math.round(hoverWorldCoords.z)}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="absolute bottom-2 left-2 rounded-lg bg-slate-950/78 border border-slate-700 px-2 py-1 text-[8px] text-slate-300 pointer-events-none">
                    Wheel/trackpad to zoom • Drag to pan • R / YOU to recenter • click without dragging to travel
                  </div>
                </div>
              </div>

              {/* Right: Fast Travel Destination Explorer Drawer */}
              <div className="w-full lg:w-80 bg-slate-900/90 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col p-4 overflow-hidden">
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-black text-amber-400 tracking-wide uppercase flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-amber-400" /> Fast Travel Destinations
                    </h3>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {landmarks.length} Places
                    </span>
                  </div>

                  {/* Search bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 transform -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search landmarks or buildings..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                    />
                  </div>
                </div>

                {/* Destinations Scrollable List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {landmarks
                    .filter((lm) => {
                      if (searchQuery.trim()) {
                        return lm.name.toLowerCase().includes(searchQuery.toLowerCase());
                      }
                      if (mapFilter === 'springfield') return isSpringfieldLandmark(lm.category);
                      if (mapFilter === 'goldenrod') return isGoldenrodLandmark(lm.category);
                      if (mapFilter === 'highway') return isHighwayLandmark(lm.category);
                      if (mapFilter === 'airport') return isAirportLandmark(lm.category);
                      return true;
                    })
                    .map((lm) => {
                      const isSpringfield = isSpringfieldLandmark(lm.category);
                      const isGoldenrod = isGoldenrodLandmark(lm.category);
                      const isBridge = lm.category === 'highway';
                      const isAirport = isAirportLandmark(lm.category);

                      return (
                        <div
                          key={lm.id}
                          onClick={() => {
                            travelToLandmark(lm);
                            setShowBigMap(false);
                          }}
                          onMouseEnter={() => setActiveHighlightId(lm.id)}
                          onMouseLeave={() => setActiveHighlightId(null)}
                          className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-between group ${
                            activeHighlightId === lm.id
                              ? 'bg-amber-500/20 border-amber-400'
                              : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span
                              className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                              style={{ backgroundColor: lm.color }}
                            />
                            <div className="truncate">
                              <div className="font-bold text-slate-100 group-hover:text-amber-300 truncate">
                                {lm.name}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                                <span>{isAirport ? 'Airport District' : isSpringfield ? 'Springfield' : isGoldenrod ? 'Goldenrod' : 'Highway/Bridge'}</span>
                                <span>•</span>
                                <span>[{Math.round(lm.x)}, {Math.round(lm.z)}]</span>
                              </div>
                            </div>
                          </div>

                          <button
                            id={`btn-warp-${lm.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              travelToLandmark(lm);
                              setShowBigMap(false);
                            }}
                            className="shrink-0 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-400 hover:text-slate-950 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-black uppercase tracking-wider transition flex items-center gap-1 shadow-sm"
                          >
                            <Send className="w-2.5 h-2.5" /> Warp
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Map Footer Bar with Quick Hub Teleport Buttons */}
            <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Springfield
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Goldenrod City
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Bridges & Farmland
                </span>
              </div>

              {/* Quick Jump Shortcuts */}
              <div className="flex items-center gap-2">
                <button
                  id="btn-quick-warp-goldenrod"
                  onClick={() => {
                    onFastTravel({ x: 170, z: -25, name: 'Goldenrod Civic Plaza' });
                    setShowBigMap(false);
                  }}
                  className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-cyan-500/50 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                >
                  ⚡ Warp Goldenrod
                </button>
                <button
                  id="btn-quick-warp-springfield"
                  onClick={() => {
                    onFastTravel({ x: -210, z: -20, name: 'Springfield Town Square' });
                    setShowBigMap(false);
                  }}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/50 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                >
                  ⚡ Warp Springfield
                </button>
                {soccerLandmark && (
                  <button
                    id="btn-quick-warp-soccer"
                    onClick={() => {
                      travelToLandmark(soccerLandmark);
                      setShowBigMap(false);
                    }}
                    className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/50 rounded-lg text-[10px] font-bold transition flex items-center gap-1"
                  >
                    ⚽ Soccer Field
                  </button>
                )}
                <div className="font-semibold text-slate-300 pl-2">
                  Player: <b className="text-amber-400 font-mono">[{Math.round(playerPos.x)}, {Math.round(playerPos.z)}]</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
