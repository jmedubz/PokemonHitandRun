import {
  GameSaveState,
  PokemonCharacterId,
  WorldGoalId,
  WorldProgressState,
} from '../types';
import { OAK_LAB_NEW_GAME_START } from './spawnPoints';

const SAVE_KEY = 'pokemon_hit_run_save_v3';

export const DEFAULT_WORLD_PROGRESS: WorldProgressState = {
  visitedLandmarks: [],
  completedGoals: [],
  maxWantedReached: 0,
  chaosEscapeArmed: false,
  roadTripOrigin: null,
  jailbreakActive: false,
  jailEscapes: 0,
};

function normaliseWorldProgress(raw?: Partial<WorldProgressState>): WorldProgressState {
  const validGoals: WorldGoalId[] = [
    'goldenrod_explorer',
    'green_thumb',
    'interstate_road_trip',
    'springfield_heat',
    'jailbreak',
    'ash_showdown',
  ];
  const visitedLandmarks = Array.isArray(raw?.visitedLandmarks)
    ? raw!.visitedLandmarks.filter((value): value is string => typeof value === 'string')
    : [];
  const completedGoals = Array.isArray(raw?.completedGoals)
    ? raw!.completedGoals.filter((value): value is WorldGoalId => validGoals.includes(value as WorldGoalId))
    : [];
  return {
    ...DEFAULT_WORLD_PROGRESS,
    ...raw,
    visitedLandmarks: [...new Set(visitedLandmarks)],
    completedGoals: [...new Set(completedGoals)],
    maxWantedReached: Math.max(0, Math.min(5, Number(raw?.maxWantedReached ?? 0) || 0)),
    roadTripOrigin: raw?.roadTripOrigin === 'goldenrod' || raw?.roadTripOrigin === 'springfield'
      ? raw.roadTripOrigin
      : null,
    jailbreakActive: Boolean(raw?.jailbreakActive),
    chaosEscapeArmed: Boolean(raw?.chaosEscapeArmed),
    jailEscapes: Math.max(0, Math.floor(Number(raw?.jailEscapes ?? 0) || 0)),
  };
}

export const DEFAULT_SAVE: GameSaveState = {
  hasChosenStarter: false,
  currentPokemon: 'pikachu',
  unlockedGeodude: false,
  ashDefeated: false,
  treesGrown: 0,
  playerPos: {
    x: OAK_LAB_NEW_GAME_START.x,
    y: OAK_LAB_NEW_GAME_START.y,
    z: OAK_LAB_NEW_GAME_START.z,
  },
  playerRotationY: OAK_LAB_NEW_GAME_START.yaw,
  grownTrees: [],
  worldProgress: { ...DEFAULT_WORLD_PROGRESS, visitedLandmarks: [], completedGoals: [] },
};

export function loadGameSave(): GameSaveState {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SAVE };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return {
      ...DEFAULT_SAVE,
      playerPos: { ...DEFAULT_SAVE.playerPos },
      grownTrees: [],
      worldProgress: normaliseWorldProgress(),
    };
    const parsed = JSON.parse(raw) as Partial<GameSaveState>;
    const validPokemon: PokemonCharacterId[] = ['pikachu', 'charmander', 'poliway', 'geodude', 'geodude_legs', 'charizard'];
    return {
      ...DEFAULT_SAVE,
      ...parsed,
      currentPokemon: validPokemon.includes(parsed.currentPokemon as PokemonCharacterId)
        ? (parsed.currentPokemon as PokemonCharacterId)
        : 'pikachu',
      playerPos: parsed.playerPos ?? { ...DEFAULT_SAVE.playerPos },
      grownTrees: Array.isArray(parsed.grownTrees) ? parsed.grownTrees : [],
      worldProgress: normaliseWorldProgress(parsed.worldProgress),
    };
  } catch {
    return {
      ...DEFAULT_SAVE,
      playerPos: { ...DEFAULT_SAVE.playerPos },
      grownTrees: [],
      worldProgress: normaliseWorldProgress(),
    };
  }
}

export function saveGame(state: GameSaveState) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // A full local-storage quota should never break the actual game loop.
  }
}

export function clearGameSave() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(SAVE_KEY);
}
