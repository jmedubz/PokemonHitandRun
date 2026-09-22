import React from 'react';
import { ArcadeGameModule } from './types';
import { RedlineRushSlot } from './games/RedlineRushSlot';
import { GalaxyDefenderGame } from './games/GalaxyDefenderGame';
import { CyberBrawlerGame } from './games/CyberBrawlerGame';
import { RetroHitAndRunGame } from './games/RetroHitAndRunGame';
import { NeonPacRunnerGame } from './games/NeonPacRunnerGame';
import { CyberBreakoutGame } from './games/CyberBreakoutGame';
import { ModularCustomGameSlot } from './games/ModularCustomGameSlot';

// Internal map storing all registered playable arcade games
const registry: Map<string, ArcadeGameModule> = new Map();

// Register the foundational games
export const REGISTERED_ARCADE_GAMES: ArcadeGameModule[] = [
  {
    id: 'retro_hit_and_run',
    title: 'Retro Hit & Run 8-Bit',
    subtitle: 'Turbo Highway Pursuit',
    genre: 'Racing',
    year: '1986',
    players: '1 Player',
    description: 'High-speed 2.5D OutRun-style racer through Springfield and Goldenrod canyons. Dodge traffic, collect speed donuts, manage your Hit & Run police alert meter, and set blistering track records!',
    controlsHint: 'A / D or Left / Right: Steer • W or Up: Accelerate • Space / Nitro: Turbo Boost',
    marqueeColor: '#eab308',
    accentColor: '#f97316',
    badge: 'POPULAR RACER',
    component: RetroHitAndRunGame,
  },
  {
    id: 'redline_rush',
    title: 'Redline Rush',
    subtitle: 'High-RPM Dual Cockpit Simulator',
    genre: 'Racing',
    year: 'Next-Gen',
    players: '1 - 2 Players',
    description: 'Dedicated arcade cabinet prepared for the external Redline Rush driving game. Includes dual bucket seats, digital tachometer, force-feedback telemetry, shift lights, and drop-in code hook.',
    controlsHint: 'W / Up: Throttle • S / Down: Brake • E / Shift: Shift Up • Q / Ctrl: Shift Down',
    marqueeColor: '#ef4444',
    accentColor: '#dc2626',
    badge: 'REDLINE RUSH EXCLUSIVE',
    component: RedlineRushSlot,
  },
  {
    id: 'galaxy_defender',
    title: 'Galaxy Defender',
    subtitle: '8-Bit Vertical Space Combat',
    genre: 'Space Shooter',
    year: '1983',
    players: '1 Player',
    description: 'Classic vertical space arcade shooter. Command your starfighter across 4 sectors, fight swooping alien swarms, collect power-ups, and face off against the Dreadnought Core boss!',
    controlsHint: 'A / D or Left / Right: Pilot Ship • Space or J: Dual Plasma Blasters • R: Restart',
    marqueeColor: '#06b6d4',
    accentColor: '#3b82f6',
    badge: 'CLASSIC 1983',
    component: GalaxyDefenderGame,
  },
  {
    id: 'cyber_punchout',
    title: 'Cyber Punchout',
    subtitle: 'Championship Ring Brawler',
    genre: 'Brawler / Fighting',
    year: '1989',
    players: '1 - 2 Players',
    description: 'Fast-paced arcade boxing championship. Step into the neon squared circle against Kid Neon, Crusher Kowalski, Shadow Viper, and Iron Titan Prime. Counter windups to earn Stars and unleash the Super Uppercut!',
    controlsHint: 'J / K: High Punch • U: Body Hook • S / Down: Guard • A / D: Dodge • Space: Super Uppercut',
    marqueeColor: '#f59e0b',
    accentColor: '#d97706',
    badge: 'KNOCKOUT TOURNAMENT',
    component: CyberBrawlerGame,
  },
  {
    id: 'neon_pac_runner',
    title: 'Neon Pac-Runner',
    subtitle: '8-Bit Cyber Maze Chase',
    genre: 'Maze / Chase',
    year: '1980',
    players: '1 Player',
    description: 'Navigate neon mazes, chomp energy pellets, grab Springfield bonus donuts, and turn the tables on Blinky, Pinky, Inky, and Clyde when grabbing Energizer Power Pellets!',
    controlsHint: 'WASD or Arrow Keys: Turn in Maze • Clear all dots to advance stages',
    marqueeColor: '#eab308',
    accentColor: '#ca8a04',
    badge: 'ARCADE LEGEND',
    component: NeonPacRunnerGame,
  },
  {
    id: 'cyber_breakout',
    title: 'Cyber Breakout 2000',
    subtitle: 'Quantum Arkanoid Matrix',
    genre: 'Brick Breaker',
    year: '1986',
    players: '1 Player',
    description: 'Neon brick-shattering action with multi-balls, laser blasters, explosive TNT chain reactions, and fireball physics across 5 quantum matrix levels!',
    controlsHint: 'A / D or Left / Right: Move Paddle • Space: Launch Ball / Fire Twin Lasers',
    marqueeColor: '#06b6d4',
    accentColor: '#0891b2',
    badge: 'RETRO BRICK BREAKER',
    component: CyberBreakoutGame,
  },
  {
    id: 'custom_modular_expansion',
    title: 'Expansion Port #1',
    subtitle: 'Third-Party Game Slot',
    genre: 'Custom Imported',
    year: '2026',
    players: '1 - 4 Players',
    description: 'Modular expansion port ready to host any imported WebGL, React, or Canvas mini-game.',
    controlsHint: 'Universal Controller Support',
    marqueeColor: '#a855f7',
    accentColor: '#9333ea',
    badge: 'EXPANSION READY',
    component: ModularCustomGameSlot,
  },
];

// Initialize registry
REGISTERED_ARCADE_GAMES.forEach((mod) => {
  registry.set(mod.id, mod);
});

/**
 * Register or override an arcade mini-game module.
 * Enables external developers to drop new games into the arcade seamlessly!
 */
export function registerArcadeGame(module: ArcadeGameModule): void {
  registry.set(module.id, module);
}

/**
 * Retrieve a registered game by its ID with safe fallback
 */
export function getArcadeGame(gameId?: string): ArcadeGameModule {
  if (gameId && registry.has(gameId)) {
    return registry.get(gameId)!;
  }
  // Default to Retro Hit & Run or first game
  return registry.get('retro_hit_and_run') ?? REGISTERED_ARCADE_GAMES[0];
}

/**
 * Get list of all registered arcade games
 */
export function getAllArcadeGames(): ArcadeGameModule[] {
  return Array.from(registry.values());
}
