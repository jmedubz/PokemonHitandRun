import * as THREE from 'three';

export type PokemonCharacterId = 'pikachu' | 'charmander' | 'poliway' | 'geodude' | 'geodude_legs' | 'charizard';

export interface PokemonCharacter {
  id: PokemonCharacterId;
  name: string;
  species: string;
  title: string;
  description: string;
  color: string;
  accentColor: string;
  unlocked: boolean;
  specialAbility: string;
  stats: {
    speed: number;
    kickPower: number;
    weight: number;
    quirkiness: number;
  };
}

export type VehicleModelType =
  | 'bmw_f80_m3'
  | 'bmw_g80_m3'
  | 'bmw_f90_m5'
  | 'lamborghini_aventador'
  | 'ferrari_f12'
  | 'pink_sedan'
  | 'homer_sedan'
  | 'police_cruiser'
  | 'police_suv'
  | 'traffic_sedan'
  | 'traffic_convertible'
  | 'civilian_sedan'
  | 'city_bus'
  | 'river_boat'
  | 'lightning_mcqueen'
  | 'simpsons_family_sedan'
  | 'speed_rocket'
  | 'canyonero'
  | 'mr_plow'
  | 'car_built_for_homer'
  | 'peppa_family_car'
  | 'arcade_visitor_sports'
  | 'arcade_visitor_convertible'
  | 'arcade_visitor_suv'
  | 'delorean_time_machine';

export interface Vehicle {
  id: string;
  mesh: THREE.Group;
  type?: VehicleModelType;
  modelType?: VehicleModelType;
  name?: string;
  displayName?: string;
  position: { x: number; y: number; z: number } | THREE.Vector3;
  rotationY?: number;
  yaw?: number;
  inUse?: boolean;
  speed: number;
  maxSpeed?: number;
  baseMaxSpeed?: number;
  acceleration?: number;
  turnSpeed?: number;
  steerAngle?: number;
  drift?: number;
  weight?: number;
  color?: number;
  isHeroCar?: boolean;
  isPolice?: boolean;
  isOccupied?: boolean;
  driverName?: string;
  damage?: number; // 0 to 100
  wrecked?: boolean;
  hijacked?: boolean;
  lastImpactAt?: number;
  wheels?: THREE.Mesh[];
  sirenLight?: THREE.PointLight;
  headlights?: THREE.SpotLight[];
  brakeLights?: THREE.Mesh[];
  exhaustPoints?: THREE.Vector3[];
  specs?: {
    topSpeed: number;
    acceleration?: number;
    accel?: number;
    handling: number;
    driftFactor?: number;
    drift?: number;
    weight: number;
  };
}

export type NPCType =
  | 'oak'
  | 'homer'
  | 'marge'
  | 'bart'
  | 'lisa'
  | 'maggie'
  | 'flanders'
  | 'moe'
  | 'apu'
  | 'citizen'
  | 'cop'
  | 'wiggum'
  | 'ash'
  | 'lou'
  | 'comic_book_guy'
  | 'barney'
  | 'officer_jenny'
  | 'youngster_joey'
  | 'whitney'
  | 'lass'
  | 'cooltrainer'
  | string;

export interface NPC {
  id: string;
  mesh: THREE.Group;
  name: string;
  type?: NPCType;
  position: { x: number; y: number; z: number };
  targetPos?: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  rotationY?: number;
  state?: 'idle' | 'walking' | 'kicked' | 'wet' | 'panicking' | 'attacking' | 'knocked_out' | 'defeated' | string;
  stateTimer?: number;
  walkTimer?: number;
  walkDirection?: THREE.Vector3;
  kickedVelocity?: THREE.Vector3;
  hp?: number;
  maxHp?: number;
  isWet?: boolean;
  isKicked?: boolean;
  kickTimer?: number;
  voiceQuotes?: string[];
  dialogue?: string | string[];
  speechBubbleText?: string | null;
  speechBubbleTimer?: number;
  combatHp?: number;
  combatMaxHp?: number;
  combatWeight?: number;
  movementMode?: 'ground' | 'flying' | 'hover' | 'swimming';
  knockoutTimer?: number;
  isCameo?: boolean;
}


export interface AshBossFighter {
  id: string;
  name: string;
  maxHp: number;
  currentHp?: number;
  hp?: number;
  mesh: THREE.Group;
  speed: number;
  specialMove: string;
  dialogue: string;
  isDefeated?: boolean;
  attackCooldown: number;
  state?: string;
  position?: { x: number; y: number; z: number } | THREE.Vector3;
}

export interface DestructibleProp {
  id: string;
  mesh: THREE.Group | THREE.Mesh;
  type: 'hydrant' | 'mailbox' | 'cone' | 'fence' | 'lamp' | 'bench' | 'bin' | 'sign' | 'donut_box' | 'tree' | 'baggage_cart';
  position: { x: number; y: number; z: number };
  destroyed: boolean;
  velocity?: THREE.Vector3;
  respawnTimer?: number;
  isBurning?: boolean;
  burnTimer?: number;
}

export interface ArcadeMachineInfo {
  id: string;
  name: string;
  position: THREE.Vector3;
  gameId?: string;
}

export interface GrassPatch {
  id: string;
  mesh: THREE.Mesh;
  position: { x: number; y: number; z: number };
  radius: number;
  waterLevel: number; // 0 to 100
  growthStage: number; // 0: dry, 1: wet, 2: soil bulging, 3: sprout, 4: sapling, 5: full tree
  treeMesh?: THREE.Group;
  isBurning?: boolean;
  burnTimer?: number;
}

export interface MapLandmark {
  id: string;
  name: string;
  category: 'oak_lab' | 'goldenrod' | 'player_garage' | 'suburbs' | 'countryside' | 'highway' | 'homer_city' | 'simpsons_house' | 'police_jail' | 'sports' | 'airport';
  x: number;
  z: number;
  icon: string;
  color: string;
  /** Optional dedicated fast-travel spawn. Landmark x/z remain the actual POI centre. */
  travelX?: number;
  travelZ?: number;
  /** World yaw to use after fast travel. If omitted, face back toward the landmark. */
  travelYaw?: number;
}

export type WorldMapPoint = { x: number; z: number };

export type WorldMapRoadFeature =
  | { id: string; shape: 'polygon'; points: WorldMapPoint[] }
  | { id: string; shape: 'ring'; x: number; z: number; innerRadius: number; outerRadius: number };

export type WorldMapAreaKind = 'water' | 'park' | 'sports' | 'farmland' | 'rail' | 'paved' | 'terminal' | 'runway' | 'taxiway' | 'apron' | 'airport';

export interface WorldMapAreaFeature {
  id: string;
  kind: WorldMapAreaKind;
  x: number;
  z: number;
  width: number;
  depth: number;
  radius?: number;
}

export interface WorldMapSnapshot {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  roads: WorldMapRoadFeature[];
  areas: WorldMapAreaFeature[];
}


export type WorldGoalId =
  | 'goldenrod_explorer'
  | 'green_thumb'
  | 'interstate_road_trip'
  | 'springfield_heat'
  | 'jailbreak'
  | 'ash_showdown';

export interface WorldProgressState {
  visitedLandmarks: string[];
  completedGoals: WorldGoalId[];
  maxWantedReached: number;
  chaosEscapeArmed: boolean;
  roadTripOrigin: 'goldenrod' | 'springfield' | null;
  jailbreakActive: boolean;
  jailEscapes: number;
}

export interface WorldGoalView {
  id: WorldGoalId | 'world_complete';
  title: string;
  description: string;
  current: number;
  target: number;
  completed: boolean;
  completedCount: number;
  totalCount: number;
}

export interface GameSaveState {
  hasChosenStarter: boolean;
  currentPokemon: PokemonCharacterId;
  unlockedGeodude: boolean;
  ashDefeated: boolean;
  treesGrown: number;
  playerPos: { x: number; y: number; z: number };
  playerRotationY: number;
  grownTrees?: { x: number; y: number; z: number }[];
  worldProgress?: WorldProgressState;
}
