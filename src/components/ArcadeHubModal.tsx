import React, { useState, useMemo } from 'react';
import {
  Gamepad2,
  Zap,
  MapPin,
  X,
  Trophy,
  Flame,
  Search,
  Sparkles,
  Navigation,
  Compass,
  Play,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  Tv,
} from 'lucide-react';
import { getAllArcadeGames } from '../arcade/registry';
import { ArcadeMachineInfo } from '../types';

export interface ArcadeGameEntry {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  year: string;
  players: string;
  description: string;
  controlsHint: string;
  marqueeColor: string;
  accentColor: string;
  badge: string;
  locationName: string;
  district: string;
  worldPos: {
    x: number;
    z: number;
    travelX: number;
    travelZ: number;
    travelYaw?: number;
    name: string;
  };
}

export interface ArcadeWorldLocation {
  id: string;
  name: string;
  district: string;
  description: string;
  color: string;
  badge: string;
  icon: string;
  installedGamesCount: number;
  featuredGames: string[];
  worldPos: {
    x: number;
    z: number;
    travelX: number;
    travelZ: number;
    travelYaw?: number;
    name: string;
  };
}

// Complete catalog of games mapped to real physical locations
export const ARCADE_GAME_CATALOG: ArcadeGameEntry[] = [
  {
    id: 'retro_hit_and_run',
    title: 'Retro Hit & Run 8-Bit',
    subtitle: 'Turbo Highway Pursuit',
    genre: 'Racing / Action',
    year: '1986',
    players: '1 Player',
    badge: 'POPULAR RACER',
    marqueeColor: '#eab308',
    accentColor: '#f97316',
    description: 'High-speed 2.5D OutRun-style racer through Springfield and Goldenrod canyons. Dodge traffic, collect speed donuts, manage police alerts, and blast nitro boosters!',
    controlsHint: 'WASD or Arrow Keys: Steer & Throttle • Space / Nitro: Turbo Boost',
    locationName: 'Pixel Paradise Arcade (West Hall)',
    district: 'Countryside Plaza',
    worldPos: {
      x: 8 - 11,
      z: -305 - 4,
      travelX: 8 - 9.8,
      travelZ: -305 - 4,
      travelYaw: -Math.PI / 2,
      name: 'Retro Hit & Run 8-Bit Cabinet',
    },
  },
  {
    id: 'redline_rush',
    title: 'Redline Rush',
    subtitle: 'High-RPM Dual Cockpit Simulator',
    genre: 'Racing Simulator',
    year: 'Next-Gen',
    players: '1 - 2 Players',
    badge: 'DUAL COCKPIT EXCLUSIVE',
    marqueeColor: '#ef4444',
    accentColor: '#dc2626',
    description: 'Dedicated arcade racing rig featuring dual bucket seats, digital tachometer, force-feedback telemetry, shift lights, and intense high-RPM time attacks.',
    controlsHint: 'W / Up: Throttle • S / Down: Brake • E / Shift: Shift Up • Q / Ctrl: Shift Down',
    locationName: 'Pixel Paradise Arcade (Feature Stage)',
    district: 'Countryside Plaza',
    worldPos: {
      x: 8 - 4.5,
      z: -305 + 11.5,
      travelX: 8 - 4.5,
      travelZ: -305 + 11.5 + 1.8,
      travelYaw: Math.PI,
      name: 'Redline Rush Dual Cockpit Rig',
    },
  },
  {
    id: 'galaxy_defender',
    title: 'Galaxy Defender',
    subtitle: '8-Bit Vertical Space Combat',
    genre: 'Space Shooter',
    year: '1983',
    players: '1 Player',
    badge: 'CLASSIC 1983',
    marqueeColor: '#06b6d4',
    accentColor: '#3b82f6',
    description: 'Classic vertical space arcade shooter. Pilot your starfighter across 4 sectors, eliminate swooping alien swarms, grab plasma upgrades, and defeat the Dreadnought Core boss!',
    controlsHint: 'A / D or Left / Right: Pilot Ship • Space / J: Dual Plasma Blasters • R: Restart',
    locationName: 'Pixel Paradise Arcade (East Wing)',
    district: 'Countryside Plaza',
    worldPos: {
      x: 8 + 11,
      z: -305 - 4,
      travelX: 8 + 9.8,
      travelZ: -305 - 4,
      travelYaw: Math.PI / 2,
      name: 'Galaxy Defender Starfighter Cabinet',
    },
  },
  {
    id: 'cyber_punchout',
    title: 'Cyber Punchout',
    subtitle: 'Championship Ring Brawler',
    genre: 'Brawler / Boxing',
    year: '1989',
    players: '1 - 2 Players',
    badge: 'KNOCKOUT TOURNAMENT',
    marqueeColor: '#f59e0b',
    accentColor: '#d97706',
    description: 'Fast-paced arcade boxing championship. Step into the neon squared circle against Kid Neon, Crusher Kowalski, Shadow Viper, and Iron Titan Prime. Counter windups to unleash Super Uppercuts!',
    controlsHint: 'J / K: High Punch • U: Body Hook • S / Down: Guard • A / D: Dodge • Space: Super Uppercut',
    locationName: 'Pixel Paradise Arcade (Brawler Ring)',
    district: 'Countryside Plaza',
    worldPos: {
      x: 8 + 4.5,
      z: -305 + 11.5,
      travelX: 8 + 4.5,
      travelZ: -305 + 11.5 + 1.4,
      travelYaw: Math.PI,
      name: 'Cyber Punchout Championship Ring',
    },
  },
  {
    id: 'neon_pac_runner',
    title: 'Neon Pac-Runner Deluxe',
    subtitle: '8-Bit Cyber Maze Chase',
    genre: 'Maze / Chase',
    year: '1980',
    players: '1 Player',
    badge: 'ARCADE LEGEND',
    marqueeColor: '#eab308',
    accentColor: '#ca8a04',
    description: 'Navigate glowing neon mazes, chomp energy pellets, grab Springfield bonus donuts, and turn the tables on Blinky, Pinky, Inky, and Clyde with Energizer Power Pellets!',
    controlsHint: 'WASD or Arrow Keys: Turn in Maze • Clear all dots to advance stages',
    locationName: 'Pixel Paradise Arcade (Center Hall)',
    district: 'Countryside Plaza',
    worldPos: {
      x: 8 + 0,
      z: -305 + 11.5,
      travelX: 8 + 0,
      travelZ: -305 + 11.5 + 1.4,
      travelYaw: Math.PI,
      name: 'Neon Pac-Runner Deluxe Cabinet',
    },
  },
  {
    id: 'cyber_breakout',
    title: 'Cyber Breakout 2000',
    subtitle: 'Quantum Arkanoid Matrix',
    genre: 'Brick Breaker',
    year: '1986',
    players: '1 Player',
    badge: 'RETRO BRICK BREAKER',
    marqueeColor: '#06b6d4',
    accentColor: '#0891b2',
    description: 'Neon brick-shattering action with multi-balls, laser blasters, explosive TNT chain reactions, and fireball physics across 5 quantum matrix levels!',
    controlsHint: 'A / D or Left / Right: Move Paddle • Space: Launch Ball / Fire Twin Lasers',
    locationName: 'Pixel Paradise Arcade (Matrix Wing)',
    district: 'Countryside Plaza',
    worldPos: {
      x: 8 + 11,
      z: -305 + 5,
      travelX: 8 + 9.8,
      travelZ: -305 + 5,
      travelYaw: Math.PI / 2,
      name: 'Cyber Breakout 2000 Cabinet',
    },
  },
  {
    id: 'custom_modular_expansion',
    title: 'Modular Expansion Port #1',
    subtitle: 'Third-Party Simulator Deck',
    genre: 'Custom Import',
    year: '2026',
    players: '1 - 4 Players',
    badge: 'EXPANSION READY',
    marqueeColor: '#a855f7',
    accentColor: '#9333ea',
    description: 'Universal simulator port ready to host modular mini-games and external HTML5 / Canvas arcade ROMs.',
    controlsHint: 'Universal Controller & Keyboard Support',
    locationName: 'Pixel Paradise Arcade (Deck #1)',
    district: 'Countryside Plaza',
    worldPos: {
      x: 8 - 11,
      z: -305 + 8.5,
      travelX: 8 - 9.8,
      travelZ: -305 + 8.5,
      travelYaw: -Math.PI / 2,
      name: 'Modular Custom Game Slot',
    },
  },
];

// Physical World Locations that have Arcade Machines installed
export const ARCADE_WORLD_LOCATIONS: ArcadeWorldLocation[] = [
  {
    id: 'pixel_paradise_arcade',
    name: 'Pixel Paradise Grand Arcade',
    district: 'Countryside Plaza (Highway Junction)',
    description: 'Massive 2-story arcade palace featuring 8 coin-op cabinets, racing cockpit simulators, neon marquee ceiling, and prize counters.',
    color: '#e040fb',
    badge: 'GRAND ARCADE PALACE',
    icon: '🏰',
    installedGamesCount: 7,
    featuredGames: ['Retro Hit & Run', 'Redline Rush', 'Galaxy Defender', 'Cyber Punchout', 'Neon Pac-Runner', 'Cyber Breakout'],
    worldPos: {
      x: 8,
      z: -305,
      travelX: 8,
      travelZ: -281,
      travelYaw: Math.PI,
      name: 'Pixel Paradise Grand Arcade Entrance',
    },
  },
  {
    id: 'oak_lab_arcade',
    name: "Professor Oak's Research Lab",
    district: 'Pallet Town / Goldenrod Outskirts',
    description: "Professor Oak's personal retro coin-op machine stationed right next to the starter Pokémon research desks.",
    color: '#ef4444',
    badge: 'RESEARCH LAB',
    icon: '🔬',
    installedGamesCount: 1,
    featuredGames: ['Retro Hit & Run 8-Bit'],
    worldPos: {
      x: 200,
      z: -200,
      travelX: 207.8,
      travelZ: -195.2,
      travelYaw: -Math.PI * 0.75,
      name: "Professor Oak's Lab Arcade Machine",
    },
  },
  {
    id: 'goldenrod_game_corner',
    name: 'Goldenrod Game Corner & Casino',
    district: 'Downtown Goldenrod City',
    description: 'Vibrant casino hall filled with double rows of glowing arcade cabinets, slot machines, prize counter, and neon gaming lights.',
    color: '#a855f7',
    badge: 'CASINO ARCADE HALL',
    icon: '🎰',
    installedGamesCount: 8,
    featuredGames: ['Retro Hit & Run', 'Cyber Punchout', 'Neon Pac-Runner', 'Casino Slots'],
    worldPos: {
      x: 150,
      z: -60,
      travelX: 147.5,
      travelZ: -56.5,
      travelYaw: 0,
      name: 'Goldenrod Game Corner Arcade Cabinets',
    },
  },
  {
    id: 'kwik_e_mart_arcade',
    name: 'The Kwik-E-Mart',
    district: 'Downtown Springfield',
    description: "The classic green-lit convenience store arcade cabinet right by Apu's Squishee dispenser machine.",
    color: '#22c55e',
    badge: 'SPRINGFIELD RETRO CAB',
    icon: '🏪',
    installedGamesCount: 1,
    featuredGames: ['Retro Hit & Run 8-Bit'],
    worldPos: {
      x: -210,
      z: -130,
      travelX: -217.5,
      travelZ: -134.5,
      travelYaw: Math.PI * 0.25,
      name: 'Kwik-E-Mart Arcade Cabinet',
    },
  },
];

interface ArcadeHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayGame: (gameId: string, machineName?: string) => void;
  onTeleportToLocation: (target: { x: number; z: number; travelX?: number; travelZ?: number; travelYaw?: number; name: string }) => void;
  playerPos?: { x: number; y: number; z: number };
}

export const ArcadeHubModal: React.FC<ArcadeHubModalProps> = ({
  isOpen,
  onClose,
  onPlayGame,
  onTeleportToLocation,
  playerPos,
}) => {
  const [activeTab, setActiveTab] = useState<'games' | 'locations' | 'racing' | 'action'>('games');
  const [searchQuery, setSearchQuery] = useState('');

  const calculateDistance = (targetX: number, targetZ: number) => {
    if (!playerPos) return null;
    const dx = playerPos.x - targetX;
    const dz = playerPos.z - targetZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return Math.round(dist);
  };

  const filteredGames = useMemo(() => {
    return ARCADE_GAME_CATALOG.filter((game) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        game.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.genre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.locationName.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === 'racing') {
        return game.genre.toLowerCase().includes('racing') || game.genre.toLowerCase().includes('sim');
      }
      if (activeTab === 'action') {
        return (
          game.genre.toLowerCase().includes('shooter') ||
          game.genre.toLowerCase().includes('brawler') ||
          game.genre.toLowerCase().includes('breaker') ||
          game.genre.toLowerCase().includes('maze')
        );
      }
      return true;
    });
  }, [activeTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="arcade-hub-modal"
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border-2 border-purple-500/40 bg-gradient-to-b from-slate-950 via-purple-950/40 to-slate-950 shadow-[0_0_50px_rgba(168,85,247,0.35)] text-slate-100 overflow-hidden"
      >
        {/* Top Header Marquee */}
        <div className="relative border-b border-purple-500/30 bg-slate-900/90 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 select-none">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-purple-600 to-indigo-600 p-0.5 shadow-[0_0_20px_rgba(234,179,8,0.5)]">
              <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-slate-950">
                <Gamepad2 className="h-6 w-6 text-amber-300 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-purple-300 to-cyan-300 drop-shadow-[0_2px_10px_rgba(234,179,8,0.4)]">
                  ARCADE LOUNGE & HUB
                </h2>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-400/40 uppercase tracking-widest">
                  COIN-OP FREE PLAY
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Play instant retro arcade games or teleport directly to physical machines across the map
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Quick warp to Grand Arcade building */}
            <button
              id="btn-warp-grand-arcade"
              type="button"
              onClick={() => {
                const grand = ARCADE_WORLD_LOCATIONS[0];
                onTeleportToLocation(grand.worldPos);
                onClose();
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-purple-300/40 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Teleport to Pixel Paradise Grand Arcade Building"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Pixel Paradise Arcade</span>
            </button>

            <button
              id="btn-close-arcade-hub"
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
              title="Close Arcade Hub"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation & Search Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-purple-500/20 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('games')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'games'
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                  : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>All Games ({ARCADE_GAME_CATALOG.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('locations')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'locations'
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                  : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Map Locations ({ARCADE_WORLD_LOCATIONS.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('racing')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'racing'
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                  : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Racing & Sims</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('action')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'action'
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                  : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Action & Retro</span>
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search games or locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/90 border border-purple-500/30 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
            />
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-h-[calc(92vh-160px)]">
          {activeTab === 'locations' ? (
            /* Map Locations View */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ARCADE_WORLD_LOCATIONS.map((loc) => {
                const dist = calculateDistance(loc.worldPos.x, loc.worldPos.z);
                return (
                  <div
                    key={loc.id}
                    className="relative flex flex-col rounded-2xl border border-purple-500/30 bg-gradient-to-br from-slate-900/90 via-slate-950/90 to-purple-950/30 p-5 shadow-lg hover:border-purple-400/60 transition group"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{loc.icon}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-white group-hover:text-amber-300 transition">
                              {loc.name}
                            </h3>
                          </div>
                          <span className="text-xs font-semibold text-purple-300 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-purple-400" />
                            {loc.district}
                          </span>
                        </div>
                      </div>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider"
                        style={{ backgroundColor: `${loc.color}22`, color: loc.color, borderColor: `${loc.color}55` }}
                      >
                        {loc.badge}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mb-4 line-clamp-2 leading-relaxed">
                      {loc.description}
                    </p>

                    <div className="mt-auto pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Tv className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{loc.installedGamesCount} {loc.installedGamesCount === 1 ? 'Cabinet' : 'Cabinets'}</span>
                        {dist !== null && (
                          <span className="text-emerald-400 font-bold ml-2">📍 {dist}m away</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        <button
                          type="button"
                          onClick={() => {
                            onTeleportToLocation(loc.worldPos);
                            onClose();
                          }}
                          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-[0_0_15px_rgba(245,158,11,0.35)] transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                          title={`Teleport directly to ${loc.name}`}
                        >
                          <Zap className="w-3.5 h-3.5 fill-slate-950" />
                          <span>Teleport There</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Games Catalog Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGames.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400">
                  <Gamepad2 className="w-12 h-12 mx-auto mb-3 text-purple-400 opacity-50" />
                  <p className="text-base font-bold">No arcade games found matching "{searchQuery}"</p>
                  <p className="text-xs text-slate-500 mt-1">Try another search term or click "All Games"</p>
                </div>
              ) : (
                filteredGames.map((game) => {
                  const dist = calculateDistance(game.worldPos.x, game.worldPos.z);
                  return (
                    <div
                      key={game.id}
                      className="relative flex flex-col rounded-2xl border border-purple-500/30 bg-gradient-to-br from-slate-900/95 via-slate-950/90 to-purple-950/40 p-4 sm:p-5 shadow-xl hover:border-purple-400/60 transition group"
                    >
                      {/* Marquee Header */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base sm:text-lg font-black text-white group-hover:text-amber-300 transition">
                              {game.title}
                            </h3>
                          </div>
                          <p className="text-xs font-semibold text-purple-300">
                            {game.subtitle}
                          </p>
                        </div>
                        <span
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 border"
                          style={{
                            backgroundColor: `${game.marqueeColor}20`,
                            color: game.marqueeColor,
                            borderColor: `${game.marqueeColor}60`,
                          }}
                        >
                          {game.badge}
                        </span>
                      </div>

                      {/* Meta Tags */}
                      <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] font-medium text-slate-400">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                          🕹️ {game.genre}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                          📅 {game.year}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                          👥 {game.players}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-300 mb-3 line-clamp-2 leading-relaxed">
                        {game.description}
                      </p>

                      {/* Controls Hint */}
                      <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 font-mono">
                        <span className="text-purple-400 font-bold">🎮 Controls: </span>
                        {game.controlsHint}
                      </div>

                      {/* Location Pin & Action Buttons */}
                      <div className="mt-auto pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-col text-[11px]">
                          <span className="text-purple-300 font-semibold flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-purple-400" />
                            {game.locationName}
                          </span>
                          {dist !== null && (
                            <span className="text-emerald-400 text-[10px] font-bold">
                              📍 {dist}m from you
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                          {/* Teleport Button */}
                          <button
                            type="button"
                            onClick={() => {
                              onTeleportToLocation(game.worldPos);
                              onClose();
                            }}
                            className="px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-amber-400/40 hover:border-amber-400 transition flex items-center gap-1 cursor-pointer active:scale-95"
                            title={`Warp to ${game.title} machine`}
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span>Teleport</span>
                          </button>

                          {/* Play Button */}
                          <button
                            type="button"
                            onClick={() => {
                              onPlayGame(game.id, game.title);
                              onClose();
                            }}
                            className="px-3.5 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-purple-400/40 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                            title={`Play ${game.title} directly`}
                          >
                            <Play className="w-3.5 h-3.5 fill-white" />
                            <span>Play Now</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="px-4 sm:px-6 py-3 border-t border-purple-500/20 bg-slate-900/90 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold text-slate-300">Arcade Cabinets Active & Ready to Play</span>
          </div>
          <div className="text-slate-500 text-[11px]">
            Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">ESC</kbd> to return to game world
          </div>
        </div>
      </div>
    </div>
  );
};
