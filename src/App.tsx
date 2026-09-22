import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  PokemonCharacterId,
  VehicleModelType,
  Vehicle,
  NPC,
  DestructibleProp,
  GrassPatch,
  MapLandmark,
  GameSaveState,
  WorldGoalId,
  WorldGoalView,
  WorldProgressState,
  WorldMapSnapshot,
  ArcadeMachineInfo,
} from './types';
import { ArcadeCabinet } from './components/ArcadeCabinet';
import {
  createPokemonModel,
  createTrainerAvatarModel,
  setPoliwagWaterGunDrawn,
  animatePokemonModel,
  createBmwF80M3,
  createBmwG80M3,
  createBmwF90M5,
  createLamborghiniAventador,
  createFerrariF12,
  createPoliceCrownVic,
  createPoliceCharger,
  createOfficerLouNPC,
  createPokeBallModel,
  createRiverBoatModel,
  createSurfaceMaterial,
  createStableSidewalkMaterial,
  createVehicleModel,
} from './game/models';
import { CollisionSystem, Door } from './game/doors';
import { ParticleEffectsManager } from './game/particles';
import { CarPhysics, PlayerMovement, PoliceAI, CarInputs, PlayerInputs } from './game/physics';
import { NPCManager } from './game/npcManager';
import { AshBattleManager } from './game/ashBattle';
import { PokemonSwitchAnimator } from './game/pokemonSwitch';
import { TrafficManager } from './game/trafficManager';
import { WorldInteractionManager } from './game/worldInteractions';
import { FootballMatchManager, FOOTBALL_PITCH_CENTER } from './game/football';
import { buildWorldMapSnapshot } from './game/worldMap';
import { buildGoldenrodCity } from './game/goldenrod';
import { buildSpringfield } from './game/springfield';
import { buildConnectingHighway } from './game/highway';
import { buildAirportDistrict, AirportAircraft } from './game/airport';
import { buildArcadeBuilding, ArcadeBuildingResult } from './game/arcadeBuilding';
import { AircraftController, NEUTRAL_AIRCRAFT_INPUTS } from './game/aircraft';
import { ParachuteController } from './game/parachute';
import { solveVehicleCollision, VehicleCollisionBody, VehicleCollisionResult } from './game/vehicleCollision';
import { DEFAULT_WORLD_PROGRESS, loadGameSave, saveGame } from './game/saveGame';
import { OAK_LAB_NEW_GAME_START } from './game/spawnPoints';
import { playSoundEffect, soundManager } from './game/audio';
import { GameHUD } from './components/GameHUD';
import { MobileControls, AnalogInputData } from './components/MobileControls';
import { PortraitRotateOverlay } from './components/PortraitRotateOverlay';
import { Smartphone, Monitor, X } from 'lucide-react';
import { disposeTransientObject3D } from './game/dispose';
import { MultiplayerManager, MultiplayerClientState } from './game/multiplayerManager';
import { MultiplayerModal } from './components/MultiplayerModal';

type VehicleHudInfo = {
  type: VehicleModelType;
  name: string;
  speed: number;
  maxSpeed: number;
  boostFuel: number;
  isDrifting: boolean;
  isBoosting: boolean;
  damage: number;
  wrecked: boolean;
};

type AircraftHudInfo = {
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
};

type ParachuteHudInfo = {
  mode: 'freefall' | 'parachute';
  altitude: number;
  verticalSpeed: number;
  deployment: number;
};

type WorldTickBreakdown = {
  football: number;
  traffic: number;
  vehicleContacts: number;
  worldInteractions: number;
  vehicleDamage: number;
  particles: number;
  npcs: number;
  jailGuard: number;
  ashRoam: number;
  ashBattle: number;
  other: number;
};

type FrameCpuBreakdown = {
  preControl: number;
  controlCamera: number;
  visibilityLod: number;
  worldSimulation: number;
  postWorld: number;
  render: number;
  other: number;
};

type DeveloperDebugSnapshot = {
  paused: boolean;
  qualityTier: 'high' | 'balanced' | 'performance';
  fps: number;
  frameMs: number;
  frameCpuMs: number;
  frameCpuBreakdown: FrameCpuBreakdown;
  worldTickMs: number;
  worldTickBreakdown: WorldTickBreakdown;
  worstRecentWorldTick: { ageSeconds: number; totalMs: number; breakdown: WorldTickBreakdown } | null;
  recentMaxFrameMs: number;
  player: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  cameraToPlayer: number;
  district: string;
  roots: { goldenrod: boolean; springfield: boolean; airport: boolean; airportCore: boolean; highway: boolean; arcade?: boolean };
  npcs: { visible: number; total: number };
  vehicles: { visible: number; total: number };
  props: { awake: number; total: number; substeps: number };
  particles: { active: number; water: number; fire: number; sparks: number; smoke: number; crashEffects: number };
  collision: { colliders: number; walkableSurfaces: number };
  render: { calls: number; triangles: number; geometries: number; textures: number; programs: number; staticLightsDisabled: number; staticBatches: number; batchedMeshes: number; canonicalizedMeshes: number; deduplicatedMeshes: number; deduplicatedGeometries: number; warmupDone: number; warmupTotal: number; renderMs: number; sceneMeshes: number; sceneGeometries: number };
  resourceGrowth: { geometryBaseline: number | null; geometryDelta: number | null; heapBaselineMb: number | null; heapDeltaMb: number | null };
  jsHeapMb: number | null;
  watchdogRecoveries: number;
  lastRecoveryReason: string;
  recentStalls: Array<{ ageSeconds: number; frameMs: number; reason: string }>;
};

type Roadblock = {
  mesh: THREE.Group;
  position: THREE.Vector3;
};

type VehicleSurfaceSupport = {
  mesh: THREE.Object3D;
  localAnchor: THREE.Vector3;
  lastWorldAnchor: THREE.Vector3;
  lastYaw: number;
};

type SeatWorldPose = {
  position: THREE.Vector3;
  yaw: number;
  forward: THREE.Vector3;
};

type ReleasedVehicleCoast = {
  vehicle: Vehicle;
  physics: CarPhysics;
  timer: number;
  resumeHybridAfter: boolean;
};

type AircraftDeathAftermath = {
  aircraftId: string;
  impactPoint: THREE.Vector3;
  impactNormal: THREE.Vector3;
  lodged: boolean;
};

type EngineState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  collisionSystem: CollisionSystem;
  particles: ParticleEffectsManager;
  npcManager: NPCManager;
  ashBattle: AshBattleManager;
  switchAnimator: PokemonSwitchAnimator;
  trafficManager: TrafficManager;
  worldInteractions: WorldInteractionManager;
  footballManager: FootballMatchManager;
  arcadeBuilding: ArcadeBuildingResult;
  playerMesh: THREE.Group;
  playerMovement: PlayerMovement;
  currentPokemonId: PokemonCharacterId;
  hasChosenStarter: boolean;
  activeCarPhysics: CarPhysics | null;
  activeVehicle: Vehicle | null;
  activeAircraft: AirportAircraft | null;
  aircraftController: AircraftController | null;
  freeAircraftControllers: Map<string, AircraftController>;
  parachuteController: ParachuteController | null;
  airportAircraft: AirportAircraft[];
  vehicles: Vehicle[];
  policeAIs: PoliceAI[];
  roadblocks: Roadblock[];
  destructibles: DestructibleProp[];
  grassPatches: GrassPatch[];
  doors: Door[];
  cameraAngle: number;
  cameraPitch: number;
  cameraDistance: number;
  cameraTargetDistance: number;
  keys: Record<string, boolean>;
  attackTimer: number;
  specialTimer: number;
  specialCooldown: number;
  specialDamageCooldown: number;
  specialCrimeCooldown: number;
  lastCrimeAt: number;
  lastWantedDecayAt: number;
  lastRoadblockLevel: number;
  playerInvulnerableUntil: number;
  lastUiUpdate: number;
  cellDoorOpen: boolean;
  cellDoorTargetRotation: number;
  autosaveElapsed: number;
  cameraShake: number;
  healingActive: boolean;
  healingTimer: number;
  healingBall: THREE.Group | null;
  wantedHeat: number;
  hitAndRunActive: boolean;
  hitAndRunEscapeTimer: number;
  vehicleEntryActive: boolean;
  vehicleEntryTimer: number;
  vehicleEntryDuration: number;
  pendingVehicle: Vehicle | null;
  vehicleExitTumbleTimer: number;
  vehicleExitTumbleDuration: number;
  vehicleExitTumbleSpinX: number;
  vehicleExitTumbleSpinZ: number;
  coastingVehicles: ReleasedVehicleCoast[];
  lastRoadblockAt: number;
  lastRoadblockPos: THREE.Vector3 | null;
  jailGuardAttackCooldown: number;
  trainRideActive: boolean;
  trainRideLocalPosition: THREE.Vector3;
  trainRideLastPassenger: number;
  trainRideJumpOffset: number;
  trainRideVerticalVelocity: number;
  trainRideJumpLatch: boolean;
  elevatorRideActive: boolean;
  elevatorRideDestination: 'ground' | 'platform' | 'roof' | null;
  elevatorRideLift: 'goldenrod' | 'springfield' | 'tower_west' | 'tower_east' | null;
  lastSafePosition: THREE.Vector3;
  lastSafeYaw: number;
  /** Dedicated checkpoint used only by the HUD Reset Pos action. Fast travel must not overwrite it. */
  resetPosPosition: THREE.Vector3;
  resetPosYaw: number;
  /** While true, automatic safe-checkpoint updates cannot redefine Reset Pos after a map/warp travel. */
  resetPosLockedByTravel: boolean;
  safePositionTimer: number;
  deathSequenceActive: boolean;
  deathSequenceTimer: number;
  deathSequenceStage: 'none' | 'aftermath' | 'death' | 'fade' | 'hospital';
  aircraftDeathAftermath: AircraftDeathAftermath | null;
  hospitalRecoveryActive: boolean;
  hospitalRecoveryTimer: number;
  hospitalRecoveryLastHp: number;
  playerGaragePos: THREE.Vector3;
  ashHostileActive: boolean;
  ashHostilePhase: 'none' | 'throw' | 'fight' | 'recall';
  ashHostileTimer: number;
  ashHostileBall: THREE.Group | null;
  ashHostileRecallEffect: THREE.Group | null;
  milesInteractionActive: boolean;
  milesInteractionTimer: number;
  milesInteractionStart: THREE.Vector3 | null;
  milesInteractionTarget: THREE.Vector3 | null;
  milesInteractionSaidHey: boolean;
  toothlessMounting: boolean;
  toothlessMounted: boolean;
  toothlessMountTimer: number;
  toothlessMountStart: THREE.Vector3 | null;
  toothlessFlightSpeed: number;
  toothlessVerticalSpeed: number;
  toothlessYaw: number;
  charizardFlightActive: boolean;
  charizardFlightSpeed: number;
  charizardVerticalSpeed: number;
  charizardSpaceWasHeld: boolean;
  vehicleSurfaceSupport: VehicleSurfaceSupport | null;
  sittableSeats: THREE.Object3D[];
  seated: boolean;
  activeSeat: THREE.Object3D | null;
  seatStartPosition: THREE.Vector3 | null;
  seatTargetPosition: THREE.Vector3 | null;
  seatStandPosition: THREE.Vector3 | null;
  seatYaw: number;
  seatTransitionTimer: number;
  seatTransitionDuration: number;
  grabbedNpcId: string | null;
  grabLiftTimer: number;
  grabLiftDuration: number;
  grabStartPosition: THREE.Vector3 | null;
  grabThrowPoseTimer: number;
  grabThrowQueued: boolean;
  grabThrowLockoutUntil: number;
};

const SAVE_INTERVAL = 10;
const UI_INTERVAL = 0.20;
// Tallest authored skyline geometry is the east Twin Tower antenna (~185 m).
// Keep a finite safety ceiling, but comfortably above every normal building so
// playable Charizard can approach, overfly and land on skyscraper rooftops.
const CHARIZARD_WORLD_CEILING_Y = 260;

function pokemonName(id: PokemonCharacterId) {
  if (id === 'pikachu') return 'Pikachu';
  if (id === 'charmander') return 'Charmander';
  if (id === 'poliway') return 'Poliwag';
  if (id === 'charizard') return 'Charizard';
  return 'Geodude (with Legs)';
}

const OAK_LAB_START = OAK_LAB_NEW_GAME_START;

function planarDistance(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}


/**
 * Record a normal safety checkpoint. `lastSafePosition` is allowed to move after
 * travel so automatic invalid-position recovery remains local. The manual Reset
 * Pos checkpoint is deliberately frozen after fast travel until the user actually
 * invokes Reset Pos, preventing map warps from silently redefining that button.
 */
function recordSafeCheckpoint(engine: EngineState, position: THREE.Vector3, yaw: number) {
  engine.lastSafePosition.copy(position);
  engine.lastSafeYaw = yaw;
  if (!engine.resetPosLockedByTravel) {
    engine.resetPosPosition.copy(position);
    engine.resetPosYaw = yaw;
  }
}

/** Swept 3D player-flight movement. Small substeps stop thin-wall tunnelling at low FPS. */
function resolvePlayableCharizardFlight(
  collisionSystem: CollisionSystem,
  start: THREE.Vector3,
  desired: THREE.Vector3,
  radius = 0.82,
  height = 2.72
): { position: THREE.Vector3; blocked: boolean } {
  const delta = desired.clone().sub(start);
  const distance = delta.length();
  const steps = THREE.MathUtils.clamp(Math.ceil(distance / 0.28), 1, 48);
  const accepted = start.clone();
  let blocked = false;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const sample = start.clone().lerp(desired, t);
    const terrain = collisionSystem.getGroundHeightNear(sample.x, sample.z, sample.y, 0.12, 4.0, 120);
    if (sample.y < terrain) sample.y = terrain;
    if (!collisionSystem.canFlyOccupy(sample, radius, height)) {
      blocked = true;
      break;
    }
    accepted.copy(sample);
  }
  return { position: accepted, blocked };
}

function getSeatWorldPose(seat: THREE.Object3D): SeatWorldPose {
  seat.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(seat);
  const center = bounds.getCenter(new THREE.Vector3());
  const localFacing = Array.isArray(seat.userData.sitFacingLocal) ? seat.userData.sitFacingLocal : [0, 1];
  const forward = new THREE.Vector3(Number(localFacing[0] ?? 0), 0, Number(localFacing[1] ?? 1));
  if (forward.lengthSq() < 0.001) forward.set(0, 0, 1);
  forward.normalize();
  const worldQuat = seat.getWorldQuaternion(new THREE.Quaternion());
  forward.applyQuaternion(worldQuat).setY(0).normalize();
  return {
    position: new THREE.Vector3(center.x, bounds.max.y, center.z),
    yaw: Math.atan2(forward.x, forward.z),
    forward,
  };
}

function applyPlayerSittingPose(root: THREE.Group) {
  const legL = root.getObjectByName('leg_left');
  const legR = root.getObjectByName('leg_right');
  const armL = root.getObjectByName('arm_left');
  const armR = root.getObjectByName('arm_right');
  if (legL) { legL.rotation.x = -1.12; legL.rotation.z = -0.08; }
  if (legR) { legR.rotation.x = -1.12; legR.rotation.z = 0.08; }
  if (armL) { armL.rotation.x = -0.18; armL.rotation.z = -0.12; }
  if (armR) { armR.rotation.x = -0.18; armR.rotation.z = 0.12; }
  root.rotation.x = 0;
  root.rotation.z = 0;
}

/**
 * The procedural cars are mostly single-piece meshes, so they do not all expose
 * a separately hinged door. Build one tiny render-only door panel lazily when a
 * conventional car is exited. It is attached to the vehicle, opens/closes in under
 * a second, and never participates in collision. Odd vehicles without doors keep
 * their authored body and only use the door sound.
 */
function triggerVehicleExitDoorVisual(vehicle: Vehicle, halfWidth: number, halfLength: number, collisionHeight: number) {
  const type = vehicle.type ?? vehicle.modelType;
  if (type === 'river_boat' || type === 'speed_rocket' || type === 'lightning_mcqueen') return;

  let pivot = vehicle.mesh.userData.runtimeExitDoorPivot as THREE.Group | undefined;
  if (!pivot) {
    let sourceMaterial: THREE.MeshStandardMaterial | null = null;
    vehicle.mesh.traverse((obj) => {
      if (sourceMaterial || !(obj instanceof THREE.Mesh)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial && !material.transparent && material.opacity > 0.95) {
          sourceMaterial = material;
          break;
        }
      }
    });
    const material = sourceMaterial
      ? sourceMaterial.clone()
      : new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.48, metalness: 0.22 });
    material.transparent = false;
    material.opacity = 1;

    pivot = new THREE.Group();
    pivot.name = 'runtime_driver_exit_door';
    const doorDepth = THREE.MathUtils.clamp(halfLength * 0.72, 0.92, 1.55);
    const doorHeight = THREE.MathUtils.clamp(collisionHeight * 0.38, 0.62, 0.98);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.055, doorHeight, doorDepth), material);
    // Hinge is toward the front edge. Positive yaw swings the left-side panel outward.
    panel.position.set(-0.02, 0, -doorDepth * 0.48);
    panel.castShadow = false;
    panel.receiveShadow = false;
    pivot.add(panel);
    pivot.position.set(-halfWidth * 0.99, Math.max(0.46, doorHeight * 0.72), Math.min(halfLength * 0.42, 0.88));
    vehicle.mesh.add(pivot);
    vehicle.mesh.userData.runtimeExitDoorPivot = pivot;
  }

  pivot.visible = true;
  pivot.rotation.y = 0;
  vehicle.mesh.userData.runtimeExitDoorTimer = 0.96;
}

function updateVehicleExitDoorVisual(vehicle: Vehicle, dt: number) {
  const pivot = vehicle.mesh.userData.runtimeExitDoorPivot as THREE.Group | undefined;
  let timer = Number(vehicle.mesh.userData.runtimeExitDoorTimer ?? 0);
  if (!pivot || timer <= 0) return;
  timer = Math.max(0, timer - dt);
  vehicle.mesh.userData.runtimeExitDoorTimer = timer;
  const elapsed = 0.96 - timer;
  let openness = 0;
  if (elapsed < 0.18) {
    const u = THREE.MathUtils.clamp(elapsed / 0.18, 0, 1);
    openness = u * u * (3 - 2 * u);
  } else if (elapsed < 0.54) {
    openness = 1;
  } else {
    const u = THREE.MathUtils.clamp((elapsed - 0.54) / 0.42, 0, 1);
    openness = 1 - u * u * (3 - 2 * u);
  }
  pivot.rotation.y = 1.02 * openness;
  if (timer <= 0) {
    pivot.rotation.y = 0;
    pivot.visible = false;
  }
}

type GrabPoseProfile = {
  holdHeight: number;
  holdForward: number;
  handSpread: number;
  handRadius: number;
  pullbackHeight: number;
  pullbackForward: number;
  releaseForward: number;
};

function getGrabPoseProfile(id: PokemonCharacterId, root: THREE.Group): GrabPoseProfile {
  if (id === 'charmander') return { holdHeight: 1.48, holdForward: 0.44, handSpread: 0.20, handRadius: 0.105, pullbackHeight: 1.72, pullbackForward: 0.16, releaseForward: 0.88 };
  if (id === 'pikachu') return { holdHeight: 1.24, holdForward: 0.40, handSpread: 0.18, handRadius: 0.09, pullbackHeight: 1.47, pullbackForward: 0.14, releaseForward: 0.82 };
  if (id === 'poliway') return { holdHeight: 1.28, holdForward: 0.42, handSpread: 0.20, handRadius: 0.10, pullbackHeight: 1.50, pullbackForward: 0.15, releaseForward: 0.84 };
  if (id === 'geodude' || id === 'geodude_legs') return { holdHeight: 1.56, holdForward: 0.50, handSpread: 0.42, handRadius: 0.14, pullbackHeight: 1.74, pullbackForward: 0.20, releaseForward: 0.98 };
  if (id === 'charizard') return { holdHeight: 1.72, holdForward: 0.54, handSpread: 0.28, handRadius: 0.11, pullbackHeight: 1.98, pullbackForward: 0.18, releaseForward: 1.05 };

  // Fallback for any future playable character: derive a sensible chest-height hold
  // from the visible model instead of assuming human proportions.
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  return {
    holdHeight: THREE.MathUtils.clamp(size.y * 0.58, 1.15, 1.85),
    holdForward: THREE.MathUtils.clamp(size.z * 0.48 + 0.28, 0.38, 0.68),
    handSpread: THREE.MathUtils.clamp(size.x * 0.22, 0.18, 0.44),
    handRadius: THREE.MathUtils.clamp(size.x * 0.055, 0.085, 0.14),
    pullbackHeight: THREE.MathUtils.clamp(size.y * 0.70, 1.35, 2.05),
    pullbackForward: 0.18,
    releaseForward: THREE.MathUtils.clamp(size.z * 0.55 + 0.58, 0.78, 1.12),
  };
}

function findGrabArmMaterial(arm: THREE.Object3D | null): THREE.Material {
  let material: THREE.Material | null = null;
  arm?.traverse((obj) => {
    if (material) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const candidate = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (candidate) material = candidate;
  });
  return material ?? new THREE.MeshStandardMaterial({ color: 0xf2c7a5, roughness: 0.75 });
}

function getOrCreateRuntimeGrabHand(root: THREE.Group, side: 'left' | 'right', radius: number, arm: THREE.Object3D | null) {
  const name = `runtime_grab_hand_${side}`;
  let hand = root.getObjectByName(name) as THREE.Mesh | null;
  if (!hand) {
    hand = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 6), findGrabArmMaterial(arm));
    hand.name = name;
    hand.castShadow = true;
    hand.receiveShadow = false;
    root.add(hand);
  }
  hand.scale.setScalar(radius);
  hand.visible = true;
  return hand;
}

function aimGrabArmAtWorldTarget(arm: THREE.Object3D | null, worldTarget: THREE.Vector3) {
  if (!arm?.parent) return;
  arm.parent.updateWorldMatrix(true, false);
  const targetLocal = arm.parent.worldToLocal(worldTarget.clone());
  const direction = targetLocal.sub(arm.position);
  if (direction.lengthSq() < 0.0001) return;
  // Every current playable arm is authored primarily along its local Y axis.
  // Point the lower/hand end (-Y) at the live grip target. This works for short
  // Pokémon arms, large Geodude hands, Charizard's articulated claw groups and
  // conventional humanoid arms without maintaining separate hard-coded rotations.
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.normalize());
}

function clearPlayerGrabPose(root: THREE.Group) {
  const left = root.getObjectByName('runtime_grab_hand_left');
  const right = root.getObjectByName('runtime_grab_hand_right');
  if (left) left.visible = false;
  if (right) right.visible = false;
}

function applyPlayerGrabPose(
  root: THREE.Group,
  characterId: PokemonCharacterId,
  leftWorldTarget: THREE.Vector3,
  rightWorldTarget: THREE.Vector3,
  throwProgress = 0,
) {
  const armL = root.getObjectByName('arm_left');
  const armR = root.getObjectByName('arm_right');
  const profile = getGrabPoseProfile(characterId, root);

  aimGrabArmAtWorldTarget(armL, leftWorldTarget);
  aimGrabArmAtWorldTarget(armR, rightWorldTarget);

  // Several older Pokémon models only authored an arm cylinder and no separate
  // hand mesh. These small runtime hands make the actual contact points readable
  // and move with the NPC instead of leaving the arms frozen beside the body.
  const handL = getOrCreateRuntimeGrabHand(root, 'left', profile.handRadius, armL);
  const handR = getOrCreateRuntimeGrabHand(root, 'right', profile.handRadius, armR);
  handL.position.copy(root.worldToLocal(leftWorldTarget.clone()));
  handR.position.copy(root.worldToLocal(rightWorldTarget.clone()));

  const swing = THREE.MathUtils.clamp(throwProgress, 0, 1);
  if (swing > 0.48) {
    // Small torso follow-through sells the release without altering the player's
    // physics/collision body or producing a nauseating camera motion.
    const follow = Math.sin(THREE.MathUtils.clamp((swing - 0.48) / 0.52, 0, 1) * Math.PI);
    root.rotation.x = -0.16 * follow;
  }
}

function isInCone(
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  target: THREE.Vector3,
  range: number,
  minDot = 0.45,
  maxVerticalDelta = 3.5
) {
  const delta3D = target.clone().sub(origin);
  if (Math.abs(delta3D.y) > maxVerticalDelta) return false;
  const dist3D = delta3D.length();
  if (dist3D <= 0.001 || dist3D > range) return false;
  const delta2D = delta3D.clone().setY(0);
  if (delta2D.length() <= 0.001) return true;
  return delta2D.normalize().dot(forward.clone().setY(0).normalize()) >= minDot;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [selectedPokemonId, setSelectedPokemonId] = useState<PokemonCharacterId>('pikachu');
  const [hasChosenStarter, setHasChosenStarter] = useState(false);
  const [pokemonHp, setPokemonHp] = useState(100);
  const [pokemonWater, setPokemonWater] = useState(100);
  const [inVehicle, setInVehicle] = useState(false);
  const [currentVehicleInfo, setCurrentVehicleInfo] = useState<VehicleHudInfo | null>(null);
  const [aircraftHud, setAircraftHud] = useState<AircraftHudInfo | null>(null);
  const [parachuteHud, setParachuteHud] = useState<ParachuteHudInfo | null>(null);
  const [wantedLevel, setWantedLevel] = useState(0);
  const [wantedHeat, setWantedHeat] = useState(0);
  const [hitAndRunActive, setHitAndRunActive] = useState(false);
  const [hitAndRunWarning, setHitAndRunWarning] = useState(false);
  const [isBusted, setIsBusted] = useState(false);
  const [interactionPrompt, setInteractionPrompt] = useState<string | null>(null);
  const [activeDialogue, setActiveDialogue] = useState<{ speaker: string; text: string } | null>(null);
  const [starterSelectionCandidate, setStarterSelectionCandidate] = useState<{ id: PokemonCharacterId; name: string } | null>(null);
  const [temporaryNotification, setTemporaryNotification] = useState<{ id: number; speaker: string; text: string; duration?: number } | null>(null);
  const [unlockedGeodude, setUnlockedGeodude] = useState(false);
  const [treesGrownCount, setTreesGrownCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playerPos, setPlayerPos] = useState<{ x: number; y: number; z: number }>({
    x: OAK_LAB_START.x,
    y: OAK_LAB_START.y,
    z: OAK_LAB_START.z,
  });
  const [playerYaw, setPlayerYaw] = useState(OAK_LAB_START.yaw);
  const [landmarks, setLandmarks] = useState<MapLandmark[]>([]);
  const [worldMap, setWorldMap] = useState<WorldMapSnapshot>({
    bounds: { minX: -340, maxX: 340, minZ: -245, maxZ: 245 },
    roads: [],
    areas: [],
  });
  const [policePositions, setPolicePositions] = useState<{ x: number; z: number }[]>([]);
  const [fps, setFps] = useState(60);
  const [worldGoal, setWorldGoal] = useState<WorldGoalView | null>(null);
  const [showAshVictory, setShowAshVictory] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showMultiplayerModal, setShowMultiplayerModal] = useState(false);

  const [controlMode, setControlMode] = useState<'pc' | 'mobile'>(() => {
    if (typeof window === 'undefined') return 'pc';
    const saved = localStorage.getItem('pokemon_hit_and_run_control_mode');
    if (saved === 'pc' || saved === 'mobile') return saved;
    const isTouchOrMobile =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return isTouchOrMobile ? 'mobile' : 'pc';
  });

  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });

  const [showBigMap, setShowBigMap] = useState(false);
  const [charizardFlightActive, setCharizardFlightActive] = useState(false);
  const [grabbedNpcId, setGrabbedNpcId] = useState<string | null>(null);

  const mobileKeyChangeRef = useRef<(code: string, isDown: boolean) => void>(() => {});
  const mobileAnalogMoveRef = useRef<(data: AnalogInputData) => void>(() => {});
  const analogInputStateRef = useRef<AnalogInputData>({ active: false, x: 0, y: 0, magnitude: 0, angle: 0 });
  const mobileCameraDragRef = useRef<(dx: number, dy: number) => void>(() => {});
  const mobileActionRef = useRef<(action: 'attack' | 'grab' | 'special' | 'interact' | 'jump' | 'sprint' | 'horn' | 'chute_cut') => void>(() => {});

  useEffect(() => {
    const handleOrientationCheck = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', handleOrientationCheck);
    window.addEventListener('orientationchange', handleOrientationCheck);
    return () => {
      window.removeEventListener('resize', handleOrientationCheck);
      window.removeEventListener('orientationchange', handleOrientationCheck);
    };
  }, []);
  const showMultiplayerModalRef = useRef(false);
  useEffect(() => {
    showMultiplayerModalRef.current = showMultiplayerModal;
  }, [showMultiplayerModal]);
  const handleFastTravelRef = useRef<(target: any) => void>(() => {});
  const [mpState, setMpState] = useState<MultiplayerClientState>({
    isConnected: false,
    isConnecting: false,
    isInRoom: false,
    roomCode: null,
    isHost: false,
    localPlayerId: null,
    localPlayerName: 'Trainer',
    players: [],
    playerCount: 1,
    lastError: null,
  });
  const multiplayerRef = useRef<MultiplayerManager>(new MultiplayerManager());
  const togglePauseRef = useRef<() => void>(() => {});
  const [developerDebugOpen, setDeveloperDebugOpen] = useState(false);
  const [debugSnapshot, setDebugSnapshot] = useState<DeveloperDebugSnapshot | null>(null);
  const [copySnapshotStatus, setCopySnapshotStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [deathPresentation, setDeathPresentation] = useState<'none' | 'death' | 'fade' | 'hospital'>('none');
  const [ashBattleState, setAshBattleState] = useState<any>({
    isActive: false,
    currentBoss: null,
    allDefeated: false,
    battleLog: '',
  });

  const [isArcadeActive, setIsArcadeActive] = useState(false);
  const [activeArcadeMachine, setActiveArcadeMachine] = useState<ArcadeMachineInfo | null>(null);
  const arcadeActiveRef = useRef(false);
  const activeArcadeMachineRef = useRef<ArcadeMachineInfo | null>(null);
  const enterArcadeModeRef = useRef<(machine?: ArcadeMachineInfo) => void>(() => {});
  const exitArcadeModeRef = useRef<() => void>(() => {});

  const engineRef = useRef<EngineState | null>(null);
  const pauseRef = useRef(false);
  const developerDebugOpenRef = useRef(false);
  const debugSnapshotRef = useRef<DeveloperDebugSnapshot | null>(null);
  const debugRecoverRef = useRef<() => void>(() => {});
  const wantedRef = useRef(0);
  const wantedHeatRef = useRef(0);
  const bustedRef = useRef(false);
  const hpRef = useRef(100);
  const waterRef = useRef(100);
  const unlockedGeodudeRef = useRef(false);
  const hasChosenStarterRef = useRef(false);
  const selectedPokemonRef = useRef<PokemonCharacterId>('pikachu');
  const worldProgressRef = useRef<WorldProgressState>({
    ...DEFAULT_WORLD_PROGRESS,
    visitedLandmarks: [],
    completedGoals: [],
  });
  const requestSwitchRef = useRef<(id: PokemonCharacterId) => void>(() => {});
  const starterSelectionCandidateRef = useRef<{ id: PokemonCharacterId; name: string } | null>(null);
  const confirmStarterSelectionRef = useRef<() => void>(() => {});
  const saveNowRef = useRef<() => void>(() => {});
  const temporaryNotificationTimerRef = useRef<number | null>(null);
  const temporaryNotificationSequenceRef = useRef(0);
  const activeDialogueTimerRef = useRef<number | null>(null);
  const activeDialogueSequenceRef = useRef(0);
  const ashVictoryTimerRef = useRef<number | null>(null);
  const ashVictorySequenceRef = useRef(0);
  // A world restart writes its own deliberately sanitised save immediately before
  // reloading. Suppress the normal beforeunload/unmount autosave during that one
  // transition so the old player position cannot overwrite the Oak's Lab spawn.
  const worldRestartPendingRef = useRef(false);

  const dismissTemporaryNotification = () => {
    if (temporaryNotificationTimerRef.current !== null) {
      window.clearTimeout(temporaryNotificationTimerRef.current);
      temporaryNotificationTimerRef.current = null;
    }
    setTemporaryNotification(null);
  };

  const showTemporaryNotification = (speaker: string, text: string) => {
    const id = ++temporaryNotificationSequenceRef.current;
    if (temporaryNotificationTimerRef.current !== null) {
      window.clearTimeout(temporaryNotificationTimerRef.current);
    }
    const durationMs = 6000;
    let formattedText = text;
    if (controlMode === 'mobile') {
      formattedText = text
        .replace(/Press G(?: again)? to throw/gi, 'Tap Throw to throw')
        .replace(/Press E to bail out/gi, 'Tap Exit to bail out')
        .replace(/Press E to choose/gi, 'Tap Action to choose')
        .replace(/Press SPACE whenever you want to redeploy/gi, 'Tap Deploy whenever you want to redeploy')
        .replace(/Press SPACE to redeploy/gi, 'Tap Deploy to redeploy')
        .replace(/Press E/gi, 'Tap Action')
        .replace(/Press G/gi, 'Tap Throw')
        .replace(/Press F/gi, 'Tap Kick')
        .replace(/Press Q/gi, 'Tap Special')
        .replace(/Press SPACE/gi, 'Tap Jump')
        .replace(/Press TAB/gi, 'Tap Map')
        .replace(/\[E\]/gi, 'Action')
        .replace(/\[G\]/gi, 'Throw')
        .replace(/\[F\]/gi, 'Kick')
        .replace(/\[Q\]/gi, 'Special')
        .replace(/\[H\]/gi, 'Horn')
        .replace(/\[SPACE\]/gi, 'Jump')
        .replace(/\[SHIFT\]/gi, 'Descend')
        .replace(/\[TAB\]/gi, 'Map')
        .replace(/Joystick \/ W\/S to fly • Space climb • Shift descend/gi, 'Use Joystick to steer • Fly Up to climb • Descend to lower')
        .replace(/W\/S controls speed, A\/D turns, Space climbs and Shift descends/gi, 'Use Joystick to steer, Fly Up to climb and Descend to lower')
        .replace(/E drops back into freefall, SPACE can redeploy it again/gi, 'CUT CHUTE drops back into freefall, DEPLOY can redeploy it again')
        .replace(/\bTAB\b/g, 'Map');
    }
    setTemporaryNotification({ id, speaker, text: formattedText, duration: durationMs });
    temporaryNotificationTimerRef.current = window.setTimeout(() => {
      // Guard against an older timeout ever closing a newer replacement message.
      setTemporaryNotification((current) => (current?.id === id ? null : current));
      if (temporaryNotificationSequenceRef.current === id) {
        temporaryNotificationTimerRef.current = null;
      }
    }, durationMs);
  };

  const dismissActiveDialogue = () => {
    // Invalidate the current timeout before hiding the card. This means a stale
    // timeout from an older line can never close a newer replacement dialogue.
    activeDialogueSequenceRef.current += 1;
    if (activeDialogueTimerRef.current !== null) {
      window.clearTimeout(activeDialogueTimerRef.current);
      activeDialogueTimerRef.current = null;
    }
    setActiveDialogue(null);
  };

  const dismissAshVictory = () => {
    ashVictorySequenceRef.current += 1;
    if (ashVictoryTimerRef.current !== null) {
      window.clearTimeout(ashVictoryTimerRef.current);
      ashVictoryTimerRef.current = null;
    }
    setShowAshVictory(false);
  };

  // All black/amber character-talking cards are temporary information. Keeping
  // this timeout at the shared state boundary means every current and future
  // setActiveDialogue(...) call automatically follows the six-second rule without
  // needing individual timers scattered around gameplay code.
  useEffect(() => {
    if (!activeDialogue) {
      if (activeDialogueTimerRef.current !== null) {
        window.clearTimeout(activeDialogueTimerRef.current);
        activeDialogueTimerRef.current = null;
      }
      return;
    }

    const sequence = ++activeDialogueSequenceRef.current;
    if (activeDialogueTimerRef.current !== null) {
      window.clearTimeout(activeDialogueTimerRef.current);
    }
    activeDialogueTimerRef.current = window.setTimeout(() => {
      if (activeDialogueSequenceRef.current !== sequence) return;
      activeDialogueTimerRef.current = null;
      setActiveDialogue(null);
    }, 6000);

    return () => {
      if (activeDialogueTimerRef.current !== null) {
        window.clearTimeout(activeDialogueTimerRef.current);
        activeDialogueTimerRef.current = null;
      }
    };
  }, [activeDialogue]);

  // Ash's victory banner is also informational rather than an input/decision
  // screen, so it follows the same temporary-popup lifetime. Starter selection,
  // restart confirmations, maps, menus and other decision UI remain untouched.
  useEffect(() => {
    if (!showAshVictory) {
      if (ashVictoryTimerRef.current !== null) {
        window.clearTimeout(ashVictoryTimerRef.current);
        ashVictoryTimerRef.current = null;
      }
      return;
    }

    const sequence = ++ashVictorySequenceRef.current;
    if (ashVictoryTimerRef.current !== null) {
      window.clearTimeout(ashVictoryTimerRef.current);
    }
    ashVictoryTimerRef.current = window.setTimeout(() => {
      if (ashVictorySequenceRef.current !== sequence) return;
      ashVictoryTimerRef.current = null;
      setShowAshVictory(false);
    }, 6000);

    return () => {
      if (ashVictoryTimerRef.current !== null) {
        window.clearTimeout(ashVictoryTimerRef.current);
        ashVictoryTimerRef.current = null;
      }
    };
  }, [showAshVictory]);

  useEffect(() => () => {
    if (temporaryNotificationTimerRef.current !== null) {
      window.clearTimeout(temporaryNotificationTimerRef.current);
      temporaryNotificationTimerRef.current = null;
    }
    if (activeDialogueTimerRef.current !== null) {
      window.clearTimeout(activeDialogueTimerRef.current);
      activeDialogueTimerRef.current = null;
    }
    if (ashVictoryTimerRef.current !== null) {
      window.clearTimeout(ashVictoryTimerRef.current);
      ashVictoryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    wantedRef.current = wantedLevel;
  }, [wantedLevel]);
  useEffect(() => {
    bustedRef.current = isBusted;
  }, [isBusted]);
  useEffect(() => {
    hpRef.current = pokemonHp;
  }, [pokemonHp]);
  useEffect(() => {
    waterRef.current = pokemonWater;
  }, [pokemonWater]);
  useEffect(() => {
    unlockedGeodudeRef.current = unlockedGeodude;
  }, [unlockedGeodude]);
  useEffect(() => {
    hasChosenStarterRef.current = hasChosenStarter;
  }, [hasChosenStarter]);
  useEffect(() => {
    selectedPokemonRef.current = selectedPokemonId;
  }, [selectedPokemonId]);

  useEffect(() => {
    if (!mountRef.current) return;

    // ---------------------------------------------------------------------
    // SCENE, LIGHTING & LARGE OPEN WORLD
    // ---------------------------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.00165);

    multiplayerRef.current.initScene(scene);
    multiplayerRef.current.onStateChange = (state) => {
      setMpState(state);
    };
    multiplayerRef.current.onNotification = (title, msg) => {
      showTemporaryNotification(title, msg);
    };
    multiplayerRef.current.onHostDisconnected = () => {
      handleResumeGame();
    };
    multiplayerRef.current.onSpawnJoiner = (pos) => {
      handleFastTravelRef.current({
        x: pos.x,
        z: pos.z,
        travelYaw: pos.yaw,
        name: 'Session Spawn',
      });
    };

    const initialW = Math.max(mountRef.current.clientWidth || window.innerWidth || 800, 320);
    const initialH = Math.max(mountRef.current.clientHeight || window.innerHeight || 600, 240);
    const camera = new THREE.PerspectiveCamera(60, initialW / initialH, 0.35, 330);
    camera.position.set(200, 6, -174);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(initialW, initialH);
    // Retina displays can render 4x as many pixels at DPR 2. A capped DPR is a
    // huge performance win while still looking clean on a desktop monitor.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 0.95));
    renderer.setClearColor(0x87ceeb, 1);
    // Start with real sunlight shadows and KEEP them in every adaptive quality
    // tier. Performance mode now reduces shadow resolution / radius / refresh rate
    // instead of making the whole world suddenly look flat after startup.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mountRef.current.appendChild(renderer.domElement);

    // ---------------------------------------------------------------------
    // MODERN OUTDOOR LIGHTING / REFLECTION FOUNDATION
    // ---------------------------------------------------------------------
    // A small procedural HDR-like environment is convolved once through PMREM.
    // It costs almost nothing at runtime but gives car clearcoat, glass and metal
    // something coherent to reflect instead of relying on direct-light highlights.
    const environmentCanvas = document.createElement('canvas');
    environmentCanvas.width = 512;
    environmentCanvas.height = 256;
    const environmentCtx = environmentCanvas.getContext('2d');
    if (environmentCtx) {
      const skyGradient = environmentCtx.createLinearGradient(0, 0, 0, 256);
      skyGradient.addColorStop(0.00, '#246fbd');
      skyGradient.addColorStop(0.38, '#6fb9ee');
      skyGradient.addColorStop(0.54, '#d7eff8');
      skyGradient.addColorStop(0.57, '#91b873');
      skyGradient.addColorStop(1.00, '#365b2d');
      environmentCtx.fillStyle = skyGradient;
      environmentCtx.fillRect(0, 0, 512, 256);
      const glow = environmentCtx.createRadialGradient(360, 78, 2, 360, 78, 92);
      glow.addColorStop(0, 'rgba(255,246,206,0.95)');
      glow.addColorStop(0.22, 'rgba(255,218,151,0.52)');
      glow.addColorStop(1, 'rgba(255,210,145,0)');
      environmentCtx.fillStyle = glow;
      environmentCtx.fillRect(250, 0, 220, 180);
    }
    const environmentSourceTexture = new THREE.CanvasTexture(environmentCanvas);
    environmentSourceTexture.mapping = THREE.EquirectangularReflectionMapping;
    environmentSourceTexture.colorSpace = THREE.SRGBColorSpace;
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const environmentRT = pmremGenerator.fromEquirectangular(environmentSourceTexture);
    scene.environment = environmentRT.texture;
    pmremGenerator.dispose();

    // A camera-centred gradient dome gives the open world an actual atmospheric
    // zenith/horizon/sun response while remaining one cheap draw call. Clouds stay
    // stylised and readable in front of it rather than being replaced by realism.
    const skyUniforms = {
      zenithColor: { value: new THREE.Color(0x3f91d4) },
      horizonColor: { value: new THREE.Color(0xb9e2f4) },
      groundColor: { value: new THREE.Color(0x6f9d55) },
      sunColor: { value: new THREE.Color(0xffe4a8) },
      sunDirection: { value: new THREE.Vector3(0.46, 0.70, 0.34).normalize() },
      sunStrength: { value: 0.72 },
    };
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(180, 24, 14),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 zenithColor;
          uniform vec3 horizonColor;
          uniform vec3 groundColor;
          uniform vec3 sunColor;
          uniform vec3 sunDirection;
          uniform float sunStrength;
          varying vec3 vWorldPosition;
          void main() {
            vec3 dir = normalize(vWorldPosition - cameraPosition);
            float y = dir.y;
            float skyT = pow(clamp(y, 0.0, 1.0), 0.55);
            vec3 colour = mix(horizonColor, zenithColor, skyT);
            if (y < 0.0) {
              colour = mix(horizonColor, groundColor, smoothstep(0.0, -0.34, y));
            }
            float sunDisc = pow(max(dot(dir, normalize(sunDirection)), 0.0), 520.0);
            float sunHalo = pow(max(dot(dir, normalize(sunDirection)), 0.0), 18.0) * 0.14;
            colour += sunColor * (sunDisc * 1.45 + sunHalo) * sunStrength;
            gl_FragColor = vec4(colour, 1.0);
          }
        `,
      })
    );
    skyDome.name = 'modern_atmospheric_sky_dome';
    skyDome.frustumCulled = false;
    skyDome.renderOrder = -1000;
    scene.add(skyDome);

    const hemisphere = new THREE.HemisphereLight(0xbfe7ff, 0x587540, 1.16);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffe7bc, 2.25);
    sun.position.set(120, 190, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 240;
    // Keep the shadow volume focused around the player instead of wasting one
    // shadow texture across the entire 1km world.
    sun.shadow.camera.left = -55;
    sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55;
    sun.shadow.camera.bottom = -55;
    sun.shadow.bias = -0.00024;
    sun.shadow.normalBias = 0.024;
    sun.shadow.radius = 2.0;
    const sunTarget = new THREE.Object3D();
    scene.add(sunTarget);
    sun.target = sunTarget;
    scene.add(sun);

    // Very low-cost cool fill from the opposite side keeps shaded façades readable
    // without flattening them with a huge ambient light.
    const skyFill = new THREE.DirectionalLight(0xb7d9ff, 0.28);
    skyFill.position.set(-135, 95, -120);
    skyFill.castShadow = false;
    scene.add(skyFill);

    const terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1900),
      createSurfaceMaterial(0x5c9937, 'grass', 0.98, 0.0, 70, 58)
    );
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.set(0, 0, -250);
    terrain.receiveShadow = true;
    scene.add(terrain);

    const collisionSystem = new CollisionSystem();
    const particles = new ParticleEffectsManager(scene);

    const goldenrod = buildGoldenrodCity();
    const springfield = buildSpringfield();
    const highway = buildConnectingHighway();
    const airport = buildAirportDistrict();
    const arcadeBuilding = buildArcadeBuilding();
    scene.add(goldenrod.group, springfield.group, highway.group, airport.group, arcadeBuilding.group);

    const allArcadeMachines: ArcadeMachineInfo[] = [
      ...(goldenrod.arcadeMachines ?? []),
      ...(springfield.arcadeMachines ?? []),
      ...(arcadeBuilding.arcadeMachines ?? []),
    ];
    // Aircraft are dynamic world actors, not static airport scenery. Keep them as
    // direct scene children so their simulation/visibility is independent from the
    // airport's structural/detail rendering policy.
    airport.aircraft.forEach((plane) => scene.add(plane.mesh));
    const footballManager = new FootballMatchManager();
    scene.add(footballManager.group);
    // The cross-map train/track/West terminal must stay visible in both cities.
    // Re-parent it out of the Goldenrod district before district visibility culling
    // and before collision registration. This also fixes the old Springfield-side
    // invisible collider near X -236 / Z -98 that belonged to a hidden station wall.
    scene.add(goldenrod.trainService.serviceGroup);

    // WORLD-WIDE SKY LAYER -------------------------------------------------
    // Big, rounded Simpsons-style cloud banks. These stay deliberately cheap:
    // one instanced draw call, opaque lit geometry, no volumetric raymarching.
    // The banks are fewer but much larger, with three silhouette variants so the
    // sky reads as authored rather than repeated puffs.
    const worldClouds = new THREE.Group();
    worldClouds.name = 'world_moving_cloud_layer';
    const worldCloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.0,
      transparent: false,
      depthWrite: true,
      fog: false,
      emissive: 0xeef8ff,
      emissiveIntensity: 0.035,
      envMapIntensity: 0.08,
      flatShading: false,
      dithering: true,
    });
    type CloudSeed = {
      x: number; y: number; z: number; scale: number; speed: number;
      width: number; depth: number; rotation: number; variant: number;
    };
    type CloudPuff = [number, number, number, number, number];
    const cloudSeeds: CloudSeed[] = [
      // Fewer centres, much larger average scale, higher altitude. This keeps
      // broad blue-sky gaps while making every visible cloud feel substantial.
      { x: -500, y: 158, z: -260, scale: 4.05, speed: 0.14, width: 1.30, depth: 0.90, rotation:  0.12, variant: 0 },
      { x: -340, y: 186, z:  125, scale: 5.10, speed: 0.10, width: 1.52, depth: 0.78, rotation:  0.58, variant: 1 },
      { x: -175, y: 146, z:  305, scale: 3.65, speed: 0.16, width: 1.14, depth: 1.06, rotation: -0.34, variant: 2 },
      { x:   15, y: 174, z: -205, scale: 4.55, speed: 0.12, width: 1.38, depth: 0.88, rotation:  0.86, variant: 1 },
      { x:  185, y: 198, z:   18, scale: 5.35, speed: 0.09, width: 1.58, depth: 0.76, rotation: -0.16, variant: 0 },
      { x:  350, y: 160, z:  275, scale: 3.95, speed: 0.15, width: 1.18, depth: 1.02, rotation:  0.40, variant: 2 },
      { x:  500, y: 184, z: -150, scale: 4.75, speed: 0.11, width: 1.46, depth: 0.84, rotation: -0.64, variant: 1 },
      { x:  585, y: 150, z:  315, scale: 3.45, speed: 0.17, width: 1.08, depth: 1.08, rotation:  0.26, variant: 0 },
    ];
    // x/z offsets, vertical offset, lobe scale, brightness multiplier. Lower
    // lobes are subtly cooler/darker so the banks have readable shaded undersides.
    const worldCloudPuffVariants: CloudPuff[][] = [
      [
        [ 0.00,  0.00,  0.00, 3.55, 0.98], [ 2.85, -0.34,  0.10, 2.45, 0.93],
        [-2.75, -0.28, -0.08, 2.35, 0.92], [ 1.05,  1.52,  0.02, 2.55, 1.04],
        [-1.30,  1.28,  0.10, 2.25, 1.02], [ 4.20, -0.48, -0.02, 1.65, 0.91],
        [-4.05, -0.44,  0.05, 1.55, 0.90], [ 0.10, -0.62,  0.36, 2.30, 0.89],
      ],
      [
        [ 0.00, -0.05,  0.00, 3.35, 0.97], [ 3.05, -0.24, -0.12, 2.25, 0.92],
        [-2.30, -0.36,  0.22, 2.55, 0.91], [ 0.35,  1.62,  0.02, 2.65, 1.05],
        [-1.85,  1.00, -0.12, 1.95, 1.01], [ 4.35,  0.18,  0.18, 1.50, 0.94],
        [-3.75, -0.18, -0.24, 1.70, 0.91], [ 1.45, -0.70,  0.32, 2.15, 0.88],
      ],
      [
        [ 0.00, -0.08,  0.00, 3.25, 0.97], [ 2.20, -0.42,  0.32, 2.60, 0.91],
        [-3.05, -0.20, -0.18, 2.05, 0.92], [ 1.55,  1.20, -0.10, 2.10, 1.03],
        [-0.75,  1.72,  0.18, 2.45, 1.05], [ 3.95, -0.18, -0.24, 1.80, 0.93],
        [-4.25, -0.46,  0.20, 1.45, 0.89], [-0.35, -0.72, -0.40, 2.20, 0.88],
      ],
    ];
    const worldCloudInstances = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 12, 9),
      worldCloudMat,
      cloudSeeds.length * worldCloudPuffVariants[0].length
    );
    worldCloudInstances.name = 'world_cloud_instances';
    worldCloudInstances.frustumCulled = false;
    worldCloudInstances.castShadow = false;
    worldCloudInstances.receiveShadow = false;
    worldCloudInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const worldCloudDummy = new THREE.Object3D();
    const worldCloudTint = new THREE.Color();
    let worldCloudInstanceIndex = 0;
    cloudSeeds.forEach((seed) => {
      const puffs = worldCloudPuffVariants[seed.variant % worldCloudPuffVariants.length];
      const cosR = Math.cos(seed.rotation);
      const sinR = Math.sin(seed.rotation);
      puffs.forEach(([px, py, pz, puffScale, brightness]) => {
        const rx = px * cosR + pz * sinR;
        const rz = -px * sinR + pz * cosR;
        worldCloudDummy.position.set(
          seed.x + rx * seed.scale * seed.width,
          seed.y + py * seed.scale,
          seed.z + rz * seed.scale * seed.depth
        );
        worldCloudDummy.rotation.set(0, seed.rotation, 0);
        worldCloudDummy.scale.set(
          puffScale * 1.72 * seed.scale * seed.width,
          puffScale * 0.74 * seed.scale,
          puffScale * 0.94 * seed.scale * seed.depth
        );
        worldCloudDummy.updateMatrix();
        worldCloudInstances.setMatrixAt(worldCloudInstanceIndex, worldCloudDummy.matrix);
        worldCloudTint.setRGB(brightness, brightness, Math.min(1.0, brightness * 1.025));
        worldCloudInstances.setColorAt(worldCloudInstanceIndex, worldCloudTint);
        worldCloudInstanceIndex += 1;
      });
    });
    if (worldCloudInstances.instanceColor) worldCloudInstances.instanceColor.needsUpdate = true;
    worldClouds.userData.cloudSeeds = cloudSeeds;
    worldClouds.userData.cloudPuffVariants = worldCloudPuffVariants;
    worldClouds.add(worldCloudInstances);
    scene.add(worldClouds);

    const springfieldCloudInstancesForLighting = springfield.cloudsGroup.getObjectByName('springfield_cloud_instances') as THREE.InstancedMesh | undefined;
    const springfieldCloudMat = springfieldCloudInstancesForLighting?.material instanceof THREE.MeshStandardMaterial
      ? springfieldCloudInstancesForLighting.material
      : null;

    // Upgrade legacy large static surfaces that still use one flat colour. This
    // catches older houses/interiors without touching vehicles, characters, glass,
    // emissive signs or materials that already have an authored/procedural texture.
    const materialAuditBox = new THREE.Box3();
    const materialAuditSize = new THREE.Vector3();
    const materialAuditCenter = new THREE.Vector3();
    const staticMaterialUpgradeCache = new Map<string, THREE.MeshStandardMaterial>();
    const upgradeLargeWorldMaterials = (root: THREE.Object3D) => {
      root.updateWorldMatrix(true, true);
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        // Authored road/sidewalk/curb materials are navigation-critical and must remain
        // visually identical at every camera distance. In particular, do not replace a
        // stable solid sidewalk material with the generic procedural concrete texture.
        if (
          obj.userData.permanentRoadGeometry === true ||
          obj.userData.roadCriticalDetail === true ||
          obj.userData.sidewalkSurface === true ||
          obj.userData.curbSurface === true ||
          obj.userData.preserveAuthoredMaterial === true
        ) return;
        const original = obj.material;
        if (Array.isArray(original) || !(original instanceof THREE.MeshStandardMaterial)) return;
        if (original.map || original.transparent || original.opacity < 0.98 || original.emissiveIntensity > 0.4) return;
        materialAuditBox.setFromObject(obj);
        materialAuditBox.getSize(materialAuditSize);
        materialAuditBox.getCenter(materialAuditCenter);
        const footprint = Math.max(materialAuditSize.x, materialAuditSize.z);
        const maxDim = Math.max(materialAuditSize.x, materialAuditSize.y, materialAuditSize.z);
        if (maxDim < 5.0) return;

        const hsl = { h: 0, s: 0, l: 0 };
        original.color.getHSL(hsl);
        let kind: Parameters<typeof createSurfaceMaterial>[1] = 'concrete';
        if (obj.userData.walkable === true && materialAuditSize.y < 0.75) {
          if (hsl.h > 0.20 && hsl.h < 0.46 && hsl.s > 0.22) kind = 'grass';
          else if (hsl.l < 0.32 && hsl.s < 0.32) kind = 'asphalt';
          else if (hsl.h > 0.04 && hsl.h < 0.13 && hsl.s > 0.18 && hsl.l < 0.58) kind = 'wood';
          else kind = 'concrete';
        } else if (materialAuditCenter.y > 4.0 && materialAuditSize.y < 2.6 && footprint > 5.0) {
          kind = 'roof';
        } else if ((hsl.h < 0.08 || hsl.h > 0.96) && hsl.s > 0.32 && hsl.l < 0.62) {
          kind = 'brick';
        } else if (hsl.h > 0.045 && hsl.h < 0.13 && hsl.s > 0.18 && hsl.l < 0.50) {
          kind = 'wood';
        }

        const repeatsX = THREE.MathUtils.clamp(materialAuditSize.x / 4.5, 2, 26);
        const repeatsY = THREE.MathUtils.clamp(Math.max(materialAuditSize.z, materialAuditSize.y) / 4.5, 2, 26);
        const materialKey = [original.uuid, kind, repeatsX.toFixed(2), repeatsY.toFixed(2), original.side, original.polygonOffset ? 1 : 0].join('|');
        let upgraded = staticMaterialUpgradeCache.get(materialKey);
        if (!upgraded) {
          upgraded = createSurfaceMaterial(original.color.getHex(), kind, original.roughness, original.metalness, repeatsX, repeatsY);
          upgraded.side = original.side;
          upgraded.polygonOffset = original.polygonOffset;
          upgraded.polygonOffsetFactor = original.polygonOffsetFactor;
          upgraded.polygonOffsetUnits = original.polygonOffsetUnits;
          staticMaterialUpgradeCache.set(materialKey, upgraded);
        }
        obj.material = upgraded;
      });
    };
    upgradeLargeWorldMaterials(goldenrod.group);
    upgradeLargeWorldMaterials(springfield.group);
    upgradeLargeWorldMaterials(highway.group);

    // FINAL SIDEWALK AUTHORITY PASS -------------------------------------------------
    // Sidewalks are assembled by several world builders and some older frontage
    // geometry predates the shared material system. Do one final pass AFTER generic
    // world-material upgrades so every actual pedestrian surface uses one canonical
    // material/depth policy. This also prevents a future builder from accidentally
    // reintroducing the grey-at-distance -> pale-up-close swap.
    const canonicalSidewalkMaterial = createStableSidewalkMaterial(0x737d82, 0.9, 0.01);
    const sidewalkAuditBox = new THREE.Box3();
    const sidewalkProbeResults: Array<Record<string, unknown>> = [];
    let canonicalSidewalkCount = 0;
    const sidewalkNamePattern = /(sidewalk|footpath|pedestrian[_ -]?(walk|path)|promenade)/i;
    const finalizeSidewalkSurfaces = (root: THREE.Object3D) => {
      root.updateWorldMatrix(true, true);
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const isSidewalk = obj.userData.sidewalkSurface === true || sidewalkNamePattern.test(obj.name || '');
        if (!isSidewalk) return;
        obj.material = canonicalSidewalkMaterial;
        obj.renderOrder = Math.max(obj.renderOrder, 20);
        obj.userData.sidewalkSurface = true;
        obj.userData.roadCriticalDetail = true;
        obj.userData.permanentRoadGeometry = true;
        obj.visible = true;
        canonicalSidewalkCount++;

        // Runtime regression probe for both the original report and the screenshot
        // coordinate. Console output identifies the exact surface if this ever
        // regresses again, without changing gameplay or drawing debug geometry.
        sidewalkAuditBox.setFromObject(obj);
        for (const [label, x, z] of [
          ['original', -285, -121],
          ['screenshot', -258, -119],
        ] as const) {
          if (x >= sidewalkAuditBox.min.x && x <= sidewalkAuditBox.max.x && z >= sidewalkAuditBox.min.z && z <= sidewalkAuditBox.max.z) {
            sidewalkProbeResults.push({
              label, name: obj.name || '(unnamed sidewalk)',
              material: canonicalSidewalkMaterial.name,
              color: `#${canonicalSidewalkMaterial.color.getHexString()}`,
              minY: Number(sidewalkAuditBox.min.y.toFixed(3)),
              maxY: Number(sidewalkAuditBox.max.y.toFixed(3)),
              renderOrder: obj.renderOrder,
            });
          }
        }
      });
    };
    finalizeSidewalkSurfaces(goldenrod.group);
    finalizeSidewalkSurfaces(springfield.group);
    finalizeSidewalkSurfaces(highway.group);
    finalizeSidewalkSurfaces(airport.group);
    console.info('[Sidewalk surface audit]', { canonicalSidewalkCount, probes: sidewalkProbeResults });

    // Configure static world rendering once. Floors receive shadows, visible solid
    // architecture casts/receives them, while transparent glazing stays cheap.
    const worldBox = new THREE.Box3();
    const worldSize = new THREE.Vector3();
    const shadowCenter = new THREE.Vector3();
    const staticShadowEntries: { mesh: THREE.Mesh; x: number; z: number }[] = [];
    const configureWorldRendering = (root: THREE.Object3D) => {
      root.updateWorldMatrix(true, true);
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            for (const texture of [material.map, material.roughnessMap, material.bumpMap, material.normalMap]) {
              if (texture) texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            }
          }
        }
        const mostlyTransparent = materials.some((m) => m.transparent && m.opacity < 0.72);
        if (obj.userData.walkable === true) obj.receiveShadow = true;

        // Eliminate redundant micro-shadows from interior tree branches and secondary canopy lobes
        if (
          obj.name === 'tree_branch_visual' ||
          (obj.name.startsWith('tree_canopy_visual_') && obj.name !== 'tree_canopy_visual_0')
        ) {
          obj.castShadow = false;
        }

        if (obj.userData.solidCollider === true) {
          obj.receiveShadow = !mostlyTransparent;
          worldBox.setFromObject(obj);
          worldBox.getSize(worldSize);
          const footprint = Math.max(worldSize.x, worldSize.z);
          obj.castShadow = !mostlyTransparent && worldSize.y > 0.35 && footprint < 55;
        }

        if (obj.castShadow) {
          worldBox.setFromObject(obj);
          worldBox.getCenter(shadowCenter);
          staticShadowEntries.push({ mesh: obj, x: shadowCenter.x, z: shadowCenter.z });
        }
      });
    };
    configureWorldRendering(goldenrod.group);
    configureWorldRendering(springfield.group);
    configureWorldRendering(highway.group);
    configureWorldRendering(airport.group);
    airport.aircraft.forEach((plane) => configureWorldRendering(plane.mesh));
    configureWorldRendering(goldenrod.trainService.serviceGroup);
    configureWorldRendering(footballManager.group);
    configureWorldRendering(arcadeBuilding.group);

    // Keep the renderer's light topology FIXED. Three.js bakes the active light
    // counts into MeshStandardMaterial shader variants. Toggling authored local
    // Point/Spot lights (and especially adding crash lights) caused shader-program
    // churn across the huge scene and was captured as multi-second renderer.render()
    // stalls. The visible lamp/TV/garage fixtures remain, but their real local lights
    // are disabled permanently; the stable hemisphere + two directional lights are
    // the only world lighting topology submitted to WebGL.
    const disabledStaticLocalLights: THREE.Light[] = [];
    const disableVariableLocalLights = (root: THREE.Object3D) => {
      root.traverse((obj) => {
        if (!(obj instanceof THREE.PointLight) && !(obj instanceof THREE.SpotLight)) return;
        obj.visible = false;
        obj.userData.performanceDisabledVariableLight = true;
        disabledStaticLocalLights.push(obj);
      });
    };
    disableVariableLocalLights(goldenrod.group);
    disableVariableLocalLights(springfield.group);
    disableVariableLocalLights(airport.group);

    const riverWaterSurface = highway.group.getObjectByName('river_water_surface') as THREE.Mesh | undefined;

    // Pokémon Center plaza fountain animation references. These are collected once
    // instead of traversing the whole Goldenrod scene every render frame.
    const pokemonCenterFountain = goldenrod.group.getObjectByName('goldenrod_civic_plaza_fountain') as THREE.Group | undefined;
    const fountainWaterSurfaces: THREE.Mesh[] = [];
    const fountainDroplets: THREE.Mesh[] = [];
    const fountainRipples: THREE.Mesh[] = [];
    const fountainStreams: THREE.Mesh[] = [];
    let fountainCentralJet: THREE.Mesh | undefined;
    let fountainJetCrest: THREE.Mesh | undefined;
    pokemonCenterFountain?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.name.startsWith('fountain_water_surface_')) fountainWaterSurfaces.push(object);
      else if (object.name.startsWith('fountain_droplet_')) fountainDroplets.push(object);
      else if (object.name.startsWith('fountain_ripple_')) fountainRipples.push(object);
      else if (object.name.startsWith('fountain_stream_')) fountainStreams.push(object);
      else if (object.name === 'fountain_central_jet') fountainCentralJet = object;
      else if (object.name === 'fountain_jet_crest') fountainJetCrest = object;
    });
    const fountainWaterTexture = fountainWaterSurfaces.length
      ? ((fountainWaterSurfaces[0].material as THREE.MeshPhysicalMaterial).map ?? null)
      : null;
    const fountainWorldPosition = new THREE.Vector3(245, 0.8, 0);
    pokemonCenterFountain?.getWorldPosition(fountainWorldPosition);
    // Separate the physical river WATER COLUMN from the road-vehicle water mask.
    // Swimmers may pass underneath bridges, while cars on the authored bridge decks
    // must remain legal. Keeping these predicates separate prevents either system
    // from borrowing the other's exception and ending up in the wrong medium.
    const isArcadeCauseway = (position: THREE.Vector3) => (
      Math.abs(position.x - 8) < 14 && position.z >= -265 && position.z <= -160
    );
    const isRiverWaterColumn = (position: THREE.Vector3) => (
      Math.abs(position.x) < 49 && position.z >= -228 && position.z <= 228 && !isArcadeCauseway(position)
    );
    const isOpenRiverWater = (position: THREE.Vector3) => {
      if (!isRiverWaterColumn(position)) return false;
      // These corridors contain actual bridge/viaduct road surfaces. Road vehicles
      // and pedestrians on the deck must never be classified as being in water.
      if (Math.abs(position.z) < 12) return false;
      if (Math.abs(position.z + 170) < 11) return false;
      if (Math.abs(position.z - 150) < 12) return false;
      if (isArcadeCauseway(position)) return false;
      return true;
    };

    const getPoliceShoreTarget = (cop: PoliceAI, index: number, playerPos: THREE.Vector3) => {
      // The river runs north/south through the centre of the map. Park each unit on
      // the bank it is already approaching, then stagger units along Z so multiple
      // police cars do not stack into one shoreline point.
      const vehiclePos = cop.getVehiclePosition();
      const bankSign = Math.abs(vehiclePos.x) > 3 ? Math.sign(vehiclePos.x) : (index % 2 === 0 ? -1 : 1);
      const slotOffsets = [0, 6.5, -6.5, 13, -13, 19.5, -19.5];
      const bridgeBands = [0, -170, 150];
      const baseZ = THREE.MathUtils.clamp(playerPos.z, -216, 216);
      for (let attempt = 0; attempt < slotOffsets.length; attempt++) {
        let z = THREE.MathUtils.clamp(baseZ + slotOffsets[(index + attempt) % slotOffsets.length], -216, 216);
        for (const bridgeZ of bridgeBands) {
          if (Math.abs(z - bridgeZ) < 16) z = bridgeZ + (z >= bridgeZ ? 18 : -18);
        }
        const candidate = new THREE.Vector3(bankSign * 54.5, 0, z);
        candidate.y = collisionSystem.getGroundHeightNear(candidate.x, candidate.z, vehiclePos.y, 0.12, 1.1, 4.0) + 0.08;
        if (isOpenRiverWater(candidate) || !collisionSystem.canOccupy(candidate, 1.25, 2.2)) continue;
        const tooClose = engine.policeAIs.some((other) => {
          if (other === cop) return false;
          return planarDistance(other.getVehiclePosition(), candidate) < 7.0;
        });
        if (!tooClose) return candidate;
      }
      const fallback = new THREE.Vector3(bankSign * 56.5, 0, baseZ);
      fallback.y = collisionSystem.getGroundHeightNear(fallback.x, fallback.z, vehiclePos.y, 0.12, 1.1, 4.0) + 0.08;
      return fallback;
    };

    goldenrod.wallColliders.forEach((w) => collisionSystem.addWall(w));
    airport.wallColliders.forEach((w) => collisionSystem.addWall(w));
    arcadeBuilding.wallColliders.forEach((w) => collisionSystem.addWall(w));

    // The original Springfield jail had one large collider several metres in front
    // of the visible bars. That created the 'invisible jail wall'. Skip that stale
    // collider and rebuild collision directly on the visible bars + cell door.
    springfield.wallColliders.forEach((w) => {
      if (w.id !== 'ps_jail_wall') collisionSystem.addWall(w);
    });
    const jailBarZ = springfield.jail.cellDoor.pos.z;
    const jailCenterX = springfield.jail.cellSpawnPos.x;
    let jailBarIndex = 0;
    for (let i = -3.5; i <= 3.5001; i += 0.6) {
      if (Math.abs(i - 1.5) < 1.85) continue; // same opening used by the visible model
      const x = jailCenterX + i;
      collisionSystem.addWall({
        id: `ps_jail_bar_${jailBarIndex++}`,
        minX: x - 0.09,
        maxX: x + 0.09,
        minZ: jailBarZ - 0.12,
        maxZ: jailBarZ + 0.12,
        minY: 0,
        maxY: 4.6,
      });
    }
    collisionSystem.addWall({
      id: 'ps_jail_cell_door',
      minX: springfield.jail.cellDoor.pos.x - 1.75,
      maxX: springfield.jail.cellDoor.pos.x + 1.75,
      minZ: jailBarZ - 0.16,
      maxZ: jailBarZ + 0.16,
      minY: 0,
      maxY: 4.6,
    });

    const allDoors = [...goldenrod.doors, ...springfield.doors, ...airport.doors, ...highway.doors, ...arcadeBuilding.doors];
    allDoors.forEach((d) => collisionSystem.addDoor(d));

    // Critical repair: collision height is taken from the visible authored road/floor/deck.
    // This stops raised roads and the bridge from passing through the Pokémon's torso.
    collisionSystem.addWalkableRoot(goldenrod.group, 'goldenrod');
    collisionSystem.addWalkableRoot(springfield.group, 'springfield');
    collisionSystem.addWalkableRoot(highway.group, 'highway');
    collisionSystem.addWalkableRoot(airport.group, 'airport');
    collisionSystem.addWalkableRoot(arcadeBuilding.group, 'arcade_building');
    collisionSystem.addWalkableRoot(goldenrod.trainService.serviceGroup, 'magnet_train_route');
    collisionSystem.addWalkableRoot(footballManager.group, 'springfield_football_pitch');

    // UPDATE 2: visible fixed roofs are real world surfaces, not just camera
    // decoration. Register the exact roof meshes for Charizard/future flyers so
    // they can land and stand on roofs without passing into the building below.
    // Moving train roofs remain dynamic and are intentionally excluded.
    collisionSystem.addLandableRoofsFromRoot(goldenrod.group, 'goldenrod_roof');
    collisionSystem.addLandableRoofsFromRoot(springfield.group, 'springfield_roof');
    collisionSystem.addLandableRoofsFromRoot(highway.group, 'highway_roof');
    collisionSystem.addLandableRoofsFromRoot(airport.group, 'airport_roof');
    collisionSystem.addLandableRoofsFromRoot(arcadeBuilding.group, 'arcade_building_roof');

    // Dynamic/kickable scenery must never be captured by the static-world pass.
    // Some legacy prop meshes also carry `solidCollider` tags from before the
    // destructible system existed; registering both a fixed + interactive collider
    // leaves an invisible ghost wall after the prop gets kicked away. Mark the whole
    // hierarchy up front so addSolidRoot() can categorically skip it.
    // UPDATE 3: permanent roads/kerbs/lane markings are never interactive physics.
    // World builders tag road hierarchies explicitly; this defensive filter makes
    // it impossible for an accidentally registered road mesh to become a kickable/
    // vehicle-launched destructible later.
    const isPermanentRoadHierarchy = (root: THREE.Object3D) => {
      let permanent = root.userData.permanentRoadGeometry === true;
      if (!permanent) root.traverse((obj) => {
        if (obj.userData.permanentRoadGeometry === true) permanent = true;
      });
      return permanent;
    };
    const rawInteractiveProps = [...goldenrod.destructibles, ...springfield.destructibles, ...highway.destructibles, ...airport.destructibles, ...arcadeBuilding.destructibles];
    const collisionInteractiveProps = rawInteractiveProps.filter((prop) => !isPermanentRoadHierarchy(prop.mesh));
    const rejectedRoadProps = rawInteractiveProps.length - collisionInteractiveProps.length;
    if (rejectedRoadProps > 0) console.warn(`[Road audit] ignored ${rejectedRoadProps} road meshes incorrectly registered as destructibles`);
    collisionInteractiveProps.forEach((prop) => {
      prop.mesh.traverse((obj) => { obj.userData.interactivePhysicsObject = true; });
    });

    // Important enterable walls are tagged in the world builders and get their
    // collision boxes directly from the visible geometry. This keeps "what you see"
    // and "what blocks you" aligned instead of relying only on hand-written boxes.
    collisionSystem.addSolidRoot(goldenrod.group, 'goldenrod_visible_wall');
    collisionSystem.addSolidRoot(springfield.group, 'springfield_visible_wall');
    collisionSystem.addSolidRoot(highway.group, 'highway_visible_wall');
    collisionSystem.addSolidRoot(airport.group, 'airport_visible_wall');
    collisionSystem.addSolidRoot(arcadeBuilding.group, 'arcade_building_visible_wall');
    collisionSystem.addSolidRoot(goldenrod.trainService.serviceGroup, 'magnet_train_route_wall');
    collisionSystem.addSolidRoot(footballManager.group, 'springfield_football_pitch_wall');

    // Roofs and upper-floor slabs are camera blockers even when they are not
    // gameplay colliders. This keeps the third-person camera inside buildings
    // without turning ceilings into invisible barriers for the player.
    collisionSystem.addCameraCeilingsFromRoot(goldenrod.group, 'goldenrod_camera_ceiling');
    collisionSystem.addCameraCeilingsFromRoot(springfield.group, 'springfield_camera_ceiling');
    collisionSystem.addCameraCeilingsFromRoot(highway.group, 'highway_camera_ceiling');
    // Exact steep-terrain camera collision is opt-in so city/vehicle/aircraft camera
    // behaviour stays unchanged. The volcano marks only its mountain/crater surfaces.
    collisionSystem.addCameraTerrainFromRoot(highway.group);
    collisionSystem.addCameraCeilingsFromRoot(airport.group, 'airport_camera_ceiling');

    // Springfield lift doors are moving geometry, so they cannot be captured once as
    // static mesh colliders. Register narrow doorway blockers at each landing and
    // toggle them with the real lift-door state every frame. This keeps closed doors
    // solid without leaving an invisible wall behind when the doors open.
    // Door blockers are derived from the actual cabin geometry rather than the
    // interaction/exit points. That keeps collision aligned with the visible
    // sliding leaves while still allowing exit points to sit safely outside.
    goldenrod.trainService.elevator.cabin.updateWorldMatrix(true, false);
    const eastCabinWorld = new THREE.Vector3();
    goldenrod.trainService.elevator.cabin.getWorldPosition(eastCabinWorld);
    const eastSouthDoorZ = eastCabinWorld.z + 2.02;
    const eastNorthDoorZ = eastCabinWorld.z - 2.02;
    // Goldenrod is a through-lift: enter from the south/concourse side at ground
    // level and leave through the opposite north side at platform level.
    collisionSystem.addWall({
      id: 'goldenrod_train_lift_ground_door',
      minX: eastCabinWorld.x - 2.05, maxX: eastCabinWorld.x + 2.05,
      minZ: eastSouthDoorZ - 0.12, maxZ: eastSouthDoorZ + 0.12,
      minY: 0, maxY: 3.5,
    });
    collisionSystem.addWall({
      id: 'goldenrod_train_lift_ground_opposite_door',
      minX: eastCabinWorld.x - 2.05, maxX: eastCabinWorld.x + 2.05,
      minZ: eastNorthDoorZ - 0.12, maxZ: eastNorthDoorZ + 0.12,
      minY: 0, maxY: 3.5,
    });
    collisionSystem.addWall({
      id: 'goldenrod_train_lift_platform_door',
      minX: eastCabinWorld.x - 2.05, maxX: eastCabinWorld.x + 2.05,
      minZ: eastNorthDoorZ - 0.12, maxZ: eastNorthDoorZ + 0.12,
      minY: 12.2, maxY: 16.0,
    });
    collisionSystem.addWall({
      id: 'goldenrod_train_lift_platform_opposite_door',
      minX: eastCabinWorld.x - 2.05, maxX: eastCabinWorld.x + 2.05,
      minZ: eastSouthDoorZ - 0.12, maxZ: eastSouthDoorZ + 0.12,
      minY: 12.2, maxY: 16.0,
    });

    goldenrod.trainService.springfieldElevator.cabin.updateWorldMatrix(true, false);
    const westCabinWorld = new THREE.Vector3();
    goldenrod.trainService.springfieldElevator.cabin.getWorldPosition(westCabinWorld);
    const westGroundDoorZ = westCabinWorld.z + 2.02;
    const westPlatformDoorZ = westCabinWorld.z - 2.02;
    collisionSystem.addWall({
      id: 'springfield_train_lift_ground_door',
      minX: westCabinWorld.x - 2.05, maxX: westCabinWorld.x + 2.05,
      minZ: westGroundDoorZ - 0.12, maxZ: westGroundDoorZ + 0.12,
      minY: 0, maxY: 3.5,
    });
    collisionSystem.addWall({
      id: 'springfield_train_lift_platform_door',
      minX: westCabinWorld.x - 2.05, maxX: westCabinWorld.x + 2.05,
      minZ: westPlatformDoorZ - 0.12, maxZ: westPlatformDoorZ + 0.12,
      minY: 12.2, maxY: 16.0,
    });

    // Twin Tower lift leaves are moving geometry just like the train lifts. Keep
    // one narrow landing blocker per stop and toggle it from the live door state;
    // this prevents both invisible-open-door walls and walking into a closed shaft.
    for (const towerKey of ['west', 'east'] as const) {
      const lift = goldenrod.twinTowerService.elevators[towerKey];
      lift.cabin.updateWorldMatrix(true, false);
      const cabinWorld = new THREE.Vector3();
      lift.cabin.getWorldPosition(cabinWorld);
      const doorZ = cabinWorld.z + 2.04;
      collisionSystem.addWall({
        id: `liberty_tower_${towerKey}_lift_ground_door`,
        minX: cabinWorld.x - 2.08, maxX: cabinWorld.x + 2.08,
        minZ: doorZ - 0.13, maxZ: doorZ + 0.13,
        minY: 0, maxY: 3.65,
      });
      collisionSystem.addWall({
        id: `liberty_tower_${towerKey}_lift_roof_door`,
        minX: cabinWorld.x - 2.08, maxX: cabinWorld.x + 2.08,
        minZ: doorZ - 0.13, maxZ: doorZ + 0.13,
        minY: lift.roofPos.y, maxY: lift.roofPos.y + 3.65,
      });
      // Moving cabin walls are live proxies rather than static world geometry.
      // They keep the player/camera inside the lift when normal movement resumes
      // after arrival, while the front proxy opens with the visible door leaves.
      collisionSystem.addWall({
        id: `liberty_tower_${towerKey}_cabin_left`,
        minX: cabinWorld.x - 2.17, maxX: cabinWorld.x - 1.99,
        minZ: cabinWorld.z - 2.10, maxZ: cabinWorld.z + 2.10,
        minY: cabinWorld.y, maxY: cabinWorld.y + 3.62,
      });
      collisionSystem.addWall({
        id: `liberty_tower_${towerKey}_cabin_right`,
        minX: cabinWorld.x + 1.99, maxX: cabinWorld.x + 2.17,
        minZ: cabinWorld.z - 2.10, maxZ: cabinWorld.z + 2.10,
        minY: cabinWorld.y, maxY: cabinWorld.y + 3.62,
      });
      collisionSystem.addWall({
        id: `liberty_tower_${towerKey}_cabin_back`,
        minX: cabinWorld.x - 2.17, maxX: cabinWorld.x + 2.17,
        minZ: cabinWorld.z - 2.12, maxZ: cabinWorld.z - 1.94,
        minY: cabinWorld.y, maxY: cabinWorld.y + 3.62,
      });
      collisionSystem.addWall({
        id: `liberty_tower_${towerKey}_cabin_front`,
        minX: cabinWorld.x - 2.02, maxX: cabinWorld.x + 2.02,
        minZ: cabinWorld.z + 1.97, maxZ: cabinWorld.z + 2.11,
        minY: cabinWorld.y, maxY: cabinWorld.y + 3.35,
      });
      // Remember the exact height used for the initial live cabin proxies. The
      // runtime loop only needs to rewrite these four colliders while the cabin
      // actually changes height; doing it every rendered frame needlessly scans
      // the entire collider registry several times while the lift is parked.
      lift.cabin.userData.collisionProxyWorldY = cabinWorld.y;
    }

    const allDestructibles = collisionInteractiveProps;

    // Whole-map roadside placement audit driven by the CURRENT authored road meshes.
    // The previous version hard-coded a handful of old road corridors, so after the
    // road network was rebuilt it could miss a new street (or move props relative to
    // a road that no longer existed). This queries mapRoadSurface geometry directly,
    // which automatically covers intersections, curved roads/roundabouts, access
    // roads, driveways authored as roads and raised bridge decks.
    const roadFurnitureTypes = new Set(['lamp', 'tree', 'mailbox', 'hydrant', 'donut_box']);
    const roadClearanceForProp = (type: string) => {
      switch (type) {
        case 'tree': return 1.15;
        case 'lamp': return 0.45;
        case 'mailbox': return 0.50;
        case 'hydrant': return 0.48;
        default: return 0.42;
      }
    };
    const bodyRadiusForPlacement = (type: string) => {
      switch (type) {
        case 'tree': return 0.74;
        case 'lamp': return 0.28;
        case 'mailbox': return 0.44;
        case 'hydrant': return 0.38;
        default: return 0.48;
      }
    };
    const moveRoadFurniture = (prop: (typeof allDestructibles)[number]) => {
      if (!roadFurnitureTypes.has(prop.type)) return;
      const clearance = roadClearanceForProp(prop.type);
      if (!collisionSystem.isRoadSurfaceAt(prop.position.x, prop.position.z, clearance)) return;

      const target = new THREE.Vector3(prop.position.x, prop.position.y, prop.position.z);
      const roadside = collisionSystem.findNearestRoadsidePosition(
        target,
        bodyRadiusForPlacement(prop.type),
        prop.type === 'tree' || prop.type === 'lamp' ? 2.2 : 1.5,
        18,
        clearance
      );
      if (!roadside) {
        console.warn(`[Roadside audit] could not relocate ${prop.id} away from live road geometry`);
        return;
      }

      const dx = roadside.x - prop.position.x;
      const dz = roadside.z - prop.position.z;
      prop.mesh.position.x += dx;
      prop.mesh.position.z += dz;
      prop.position.x = roadside.x;
      prop.position.z = roadside.z;
      console.info(`[Roadside audit] moved ${prop.id} off the driving surface to`, roadside.x.toFixed(2), roadside.z.toFixed(2));
    };
    allDestructibles.forEach(moveRoadFurniture);

    // Hydrants, mailboxes and other kickable props remain physical for their whole
    // lifetime. WorldInteractionManager keeps these collider ids synced to the moved
    // meshes while awake, then leaves the final collider active while physics sleeps.
    allDestructibles.forEach((prop) => {
      // Pink donut floaties are deliberately loose clutter: walking into them
      // pushes them around instead of treating them like concrete walls.
      if (prop.type !== 'donut_box') {
        // Interactive collision follows the visible prop itself. Individual props
        // may request tighter padding (for example the very thin Simpsons fence
        // near X=-230/Z=31) without becoming static world geometry.
        const padding = Number(prop.mesh.userData.colliderPadding ?? 0.035);
        collisionSystem.addInteractiveObject(prop.mesh, `prop_${prop.id}`, Math.max(0, padding));
      }
    });

    // One final world-wide registry audit after every district, door, station, prop
    // and train-route collider has been registered. Invalid/reversed/duplicate data
    // is repaired before the first gameplay frame instead of becoming a mystery wall.
    const collisionAudit = collisionSystem.auditAndRepair();
    if (collisionAudit.repaired || collisionAudit.removed) {
      console.info('[World collision audit]', collisionAudit);
    }

    // FIX 1: named fixed-fence colliders must still have visible fence geometry.
    // This catches stale authoring from moved/deleted permanent fences without ever
    // touching reusable interactive picket panels (those are collisionRole=interactive
    // and are synchronised by WorldInteractionManager).
    const visibleFixedFenceBoxes: THREE.Box3[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.InstancedMesh)) return;
      if (!/fence/i.test(obj.name || '')) return;
      const meshMat = (obj as THREE.Mesh).material;
      const mats = (Array.isArray(meshMat) ? meshMat : [meshMat]) as THREE.Material[];
      if (mats.length > 0 && mats.every((mat) => mat && mat.visible === false)) return;
      const box = new THREE.Box3().setFromObject(obj);
      if (Number.isFinite(box.min.x) && Number.isFinite(box.max.z)) visibleFixedFenceBoxes.push(box);
    });
    const overlapsVisibleFence = (c: (typeof collisionSystem.colliders)[number]) =>
      visibleFixedFenceBoxes.some((box) =>
        c.maxX >= box.min.x - 0.03 && c.minX <= box.max.x + 0.03 &&
        c.maxZ >= box.min.z - 0.03 && c.minZ <= box.max.z + 0.03 &&
        (c.maxY ?? 20) >= box.min.y - 0.05 && (c.minY ?? -1) <= box.max.y + 0.05
      );
    const orphanFenceIds = collisionSystem.colliders
      .filter((c) => c.collisionRole !== 'interactive' && /fence/i.test(c.id) && !overlapsVisibleFence(c))
      .map((c) => c.id);
    orphanFenceIds.forEach((id) => collisionSystem.removeCollider(id));
    if (orphanFenceIds.length) {
      console.warn('[Fence collision audit] removed orphaned fixed fence colliders', orphanFenceIds);
    }
    // Road surfaces are fixed authored geometry. Count the protected road nodes so
    // regressions are visible in the console during future map work.
    let permanentRoadNodes = 0;
    [goldenrod.group, springfield.group, highway.group, airport.group].forEach((district) => district.traverse((obj) => {
      if (obj.userData.permanentRoadGeometry === true) permanentRoadNodes++;
    }));
    console.info('[Road geometry audit]', { permanentRoadNodes, interactiveRoadPropsRejected: rejectedRoadProps });
    // Regression probe for the reported Springfield blocker. This is intentionally
    // diagnostic only: the audit must never delete a real interactive object just
    // because a coordinate was reported. The thin fence at this location now uses
    // exact visible-object padding, while any stale fixed collider is removed by the
    // geometry-matching audit above.
    const springfieldProbe = new THREE.Vector3(-230, 0.12, 31);
    const probeSafe = collisionSystem.canOccupy(springfieldProbe, 0.18, 1.8);
    console.info('[Collision probe X=-230 Z=31]', { openForPointBody: probeSafe });

    const allPatches = [...goldenrod.grassPatches, ...springfield.grassPatches];
    const soccerTravelX = FOOTBALL_PITCH_CENTER.x - 28.0;
    const soccerTravelZ = FOOTBALL_PITCH_CENTER.z - 7.0;
    const soccerTravelYaw = Math.atan2(
      FOOTBALL_PITCH_CENTER.x - soccerTravelX,
      FOOTBALL_PITCH_CENTER.z - soccerTravelZ
    );
    const soccerFieldLandmark: MapLandmark = {
      id: 'springfield_soccer_field',
      name: 'Springfield Community Soccer Field',
      category: 'sports',
      x: FOOTBALL_PITCH_CENTER.x,
      z: FOOTBALL_PITCH_CENTER.z,
      icon: 'soccer',
      color: '#4ade80',
      // Dedicated open goal-end arrival point: outside the playing surface, away
      // from the sideline crowd/benches/fence, and already looking into the match.
      travelX: soccerTravelX,
      travelZ: soccerTravelZ,
      travelYaw: soccerTravelYaw,
    };
    const allLandmarks = [...goldenrod.landmarks, ...springfield.landmarks, ...highway.landmarks, ...airport.landmarks, ...arcadeBuilding.landmarks, soccerFieldLandmark];
    setLandmarks(allLandmarks);
    setWorldMap(buildWorldMapSnapshot(
      [goldenrod.group, springfield.group, highway.group, airport.group, arcadeBuilding.group, goldenrod.trainService.serviceGroup, footballManager.group],
      allLandmarks
    ));

    // Reusable sitting registry. World builders only tag the actual cushion/seat
    // meshes; all interaction, camera and stand-up logic lives here in one system.
    const sittableSeats: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj.userData.sittable === true) sittableSeats.push(obj);
    });

    // Distance-LOD for tiny static decoration. Thousands of little flowers, window
    // trims, bottles, signs and similar meshes do not need to be submitted to WebGL
    // from the opposite end of a district. Solid gameplay objects are never culled.
    const dynamicCullRoots = new Set<THREE.Object3D>([
      ...allDoors.map((door) => door.group),
      ...allDestructibles.map((prop) => prop.mesh),
      ...goldenrod.grassPatches.map((patch) => patch.mesh),
      ...springfield.grassPatches.map((patch) => patch.mesh),
      ...goldenrod.oakLab.starters.map((starter) => starter.mesh),
      springfield.jail.cellDoor.mesh,
      springfield.simpsonsHouse.ashMesh,
      goldenrod.trainService.trainMesh,
      ...airport.aircraft.map((plane) => plane.mesh),
      goldenrod.trainService.elevator.cabin,
      goldenrod.trainService.springfieldElevator.cabin,
      goldenrod.twinTowerService.elevators.west.cabin,
      goldenrod.twinTowerService.elevators.east.cabin,
    ]);
    // Batch repeated *static visual-only* primitives into local InstancedMesh
    // cells. The world was previously submitting thousands of tiny boxes/planes/
    // cylinders as individual draw calls even though many were visually identical.
    // Collision has already been registered above, and every gameplay/dynamic root is
    // excluded here, so this changes rendering only -- not interaction or physics.
    const staticBatchStats = { sourceMeshes: 0, canonicalizedMeshes: 0, batchedMeshes: 0, batches: 0, disposedGeometries: 0, disposedMaterials: 0 };
    const batchableGeometryTypes = new Set([
      'BoxGeometry', 'PlaneGeometry', 'CylinderGeometry', 'SphereGeometry',
      'ConeGeometry', 'CircleGeometry', 'TorusGeometry',
    ]);
    const batchRound = (value: unknown) => typeof value === 'number' ? Number(value.toFixed(5)) : value;
    const primitiveGeometrySignature = (geometry: THREE.BufferGeometry) => {
      if (!batchableGeometryTypes.has(geometry.type) || geometry.groups.length > 1) return null;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box) return null;
      const rawParams = (geometry as THREE.BufferGeometry & { parameters?: Record<string, unknown> }).parameters ?? {};
      const params = Object.fromEntries(Object.entries(rawParams).map(([key, value]) => [key, batchRound(value)]));
      return JSON.stringify({
        type: geometry.type,
        params,
        bounds: [
          batchRound(box.min.x), batchRound(box.min.y), batchRound(box.min.z),
          batchRound(box.max.x), batchRound(box.max.y), batchRound(box.max.z),
        ],
      });
    };
    const batchableMaterialSignature = (material: THREE.Material) => {
      if (material.transparent || material.opacity < 0.999 || material.visible === false) return null;
      if (material.clippingPlanes?.length || material.stencilWrite || material.alphaTest > 0) return null;
      const mat = material as THREE.Material & {
        color?: THREE.Color; emissive?: THREE.Color; roughness?: number; metalness?: number;
        map?: THREE.Texture | null; normalMap?: THREE.Texture | null; roughnessMap?: THREE.Texture | null;
        metalnessMap?: THREE.Texture | null; emissiveMap?: THREE.Texture | null; aoMap?: THREE.Texture | null;
        vertexColors?: boolean; fog?: boolean;
      };
      return JSON.stringify({
        type: material.type,
        color: mat.color?.getHex() ?? null,
        emissive: mat.emissive?.getHex() ?? null,
        roughness: batchRound(mat.roughness),
        metalness: batchRound(mat.metalness),
        opacity: batchRound(material.opacity),
        side: material.side,
        depthTest: material.depthTest,
        depthWrite: material.depthWrite,
        blending: material.blending,
        polygonOffset: material.polygonOffset,
        polygonOffsetFactor: batchRound(material.polygonOffsetFactor),
        polygonOffsetUnits: batchRound(material.polygonOffsetUnits),
        toneMapped: material.toneMapped,
        vertexColors: mat.vertexColors ?? false,
        fog: mat.fog ?? true,
        map: mat.map?.uuid ?? null,
        normalMap: mat.normalMap?.uuid ?? null,
        roughnessMap: mat.roughnessMap?.uuid ?? null,
        metalnessMap: mat.metalnessMap?.uuid ?? null,
        emissiveMap: mat.emissiveMap?.uuid ?? null,
        aoMap: mat.aoMap?.uuid ?? null,
      });
    };
    const dynamicVisualNamePattern = /(door|vehicle|car|truck|bus|plane|aircraft|train|elevator|npc|player|pokemon|starter|baggage|trolley|cart|boat|parachute|character|driver|officer|police|traffic_light)/i;
    const isBatchUnsafeUserData = (obj: THREE.Object3D) => (
      obj.userData.walkable === true || obj.userData.solidCollider === true || obj.userData.sittable === true ||
      obj.userData.interactive === true || obj.userData.kickable === true || obj.userData.destructible === true ||
      obj.userData.cameraTerrainSolid === true || obj.userData.cameraCeiling === true || obj.userData.landableRoof === true ||
      obj.userData.playerGrownTree === true || obj.userData.physicsCenterOfMass instanceof THREE.Vector3
    );

    // Scene-wide exact primitive geometry deduplication. Procedural character and
    // vehicle builders create the same wheel/head/limb/body primitive many times.
    // Those meshes must remain independently movable, but their immutable vertex
    // buffers do not need to be duplicated thousands of times on the GPU. Unlike the
    // static normaliser below, this does NOT alter transforms or merge objects; it
    // only rebinds byte-for-byte-equivalent primitive geometry to one shared buffer.
    const sharedGeometryStats = { meshesRebound: 0, geometriesDisposed: 0, signatures: 0 };
    const primitiveAttributeSample = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined) => {
      if (!attribute) return 'none';
      const values: number[] = [];
      const count = Math.min(attribute.count, 4);
      for (let i = 0; i < count; i++) {
        if (attribute.itemSize > 0) values.push(Number(attribute.getX(i).toFixed(5)));
        if (attribute.itemSize > 1) values.push(Number(attribute.getY(i).toFixed(5)));
        if (attribute.itemSize > 2) values.push(Number(attribute.getZ(i).toFixed(5)));
        if (attribute.itemSize > 3) values.push(Number(attribute.getW(i).toFixed(5)));
      }
      return `${attribute.itemSize}:${attribute.count}:${values.join(',')}`;
    };
    const exactPrimitiveGeometrySignature = (geometry: THREE.BufferGeometry) => {
      if (!batchableGeometryTypes.has(geometry.type) || geometry.groups.length > 1 || Object.keys(geometry.morphAttributes).length > 0) return null;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box) return null;
      const rawParams = (geometry as THREE.BufferGeometry & { parameters?: Record<string, unknown> }).parameters ?? {};
      const params = Object.fromEntries(Object.entries(rawParams).map(([key, value]) => [key, batchRound(value)]));
      return JSON.stringify({
        type: geometry.type,
        params,
        bounds: [
          batchRound(box.min.x), batchRound(box.min.y), batchRound(box.min.z),
          batchRound(box.max.x), batchRound(box.max.y), batchRound(box.max.z),
        ],
        index: geometry.index ? `${geometry.index.count}:${primitiveAttributeSample(geometry.index)}` : 'none',
        position: primitiveAttributeSample(geometry.getAttribute('position')),
        normal: primitiveAttributeSample(geometry.getAttribute('normal')),
        uv: primitiveAttributeSample(geometry.getAttribute('uv')),
      });
    };
    const primitiveGeometryOwners = new Map<THREE.BufferGeometry, THREE.Mesh[]>();
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const owners = primitiveGeometryOwners.get(obj.geometry);
      if (owners) owners.push(obj);
      else primitiveGeometryOwners.set(obj.geometry, [obj]);
    });
    const sharedPrimitiveGeometryCache = new Map<string, THREE.BufferGeometry>();
    for (const [geometry, owners] of primitiveGeometryOwners) {
      const signature = exactPrimitiveGeometrySignature(geometry);
      if (!signature) continue;
      const shared = sharedPrimitiveGeometryCache.get(signature);
      if (!shared) {
        sharedPrimitiveGeometryCache.set(signature, geometry);
        sharedGeometryStats.signatures++;
        continue;
      }
      if (shared === geometry) continue;
      owners.forEach((mesh) => { mesh.geometry = shared; });
      geometry.dispose();
      sharedGeometryStats.meshesRebound += owners.length;
      sharedGeometryStats.geometriesDisposed++;
    }
    console.info('[Shared primitive geometry]', sharedGeometryStats);


    // Thousands of authored primitive meshes use a freshly-created geometry even when
    // they differ only by width/height/radius. That explodes WebGL resource count and
    // causes large lazy-upload stalls the first time a district enters the camera.
    // Convert safe visual-only primitives to a small canonical geometry cache and move
    // their dimensions into the mesh scale. Besides cutting GPU resources, this makes
    // differently-sized boxes/planes eligible for the same InstancedMesh batch.
    const canonicalGeometryCache = new Map<string, THREE.BufferGeometry>();
    const canonicalGeometryScale = new THREE.Vector3();
    const canonicalBounds = new THREE.Box3();
    const canonicalCenter = new THREE.Vector3();
    const makeCanonicalGeometry = (geometry: THREE.BufferGeometry): { key: string; geometry: THREE.BufferGeometry; scale: THREE.Vector3 } | null => {
      if (!batchableGeometryTypes.has(geometry.type) || geometry.groups.length > 1 || Object.keys(geometry.morphAttributes).length > 0) return null;
      geometry.computeBoundingBox();
      if (!geometry.boundingBox) return null;
      canonicalBounds.copy(geometry.boundingBox);
      canonicalBounds.getCenter(canonicalCenter);
      // Skip authored geometries that have been translated away from their local origin.
      if (canonicalCenter.lengthSq() > 0.000001) return null;
      const params = (geometry as THREE.BufferGeometry & { parameters?: Record<string, any> }).parameters ?? {};
      let key = '';
      let factory: (() => THREE.BufferGeometry) | null = null;
      canonicalGeometryScale.set(1, 1, 1);
      if (geometry.type === 'BoxGeometry') {
        const w = Number(params.width ?? 1), h = Number(params.height ?? 1), d = Number(params.depth ?? 1);
        key = `box:${params.widthSegments ?? 1}:${params.heightSegments ?? 1}:${params.depthSegments ?? 1}`;
        canonicalGeometryScale.set(w, h, d);
        factory = () => new THREE.BoxGeometry(1, 1, 1, params.widthSegments ?? 1, params.heightSegments ?? 1, params.depthSegments ?? 1);
      } else if (geometry.type === 'PlaneGeometry') {
        const w = Number(params.width ?? 1), h = Number(params.height ?? 1);
        key = `plane:${params.widthSegments ?? 1}:${params.heightSegments ?? 1}`;
        canonicalGeometryScale.set(w, h, 1);
        factory = () => new THREE.PlaneGeometry(1, 1, params.widthSegments ?? 1, params.heightSegments ?? 1);
      } else if (geometry.type === 'CylinderGeometry') {
        const rt = Number(params.radiusTop ?? 1), rb = Number(params.radiusBottom ?? 1), h = Number(params.height ?? 1);
        const radius = Math.max(Math.abs(rt), Math.abs(rb), 0.0001);
        const topRatio = rt / radius, bottomRatio = rb / radius;
        key = `cyl:${batchRound(topRatio)}:${batchRound(bottomRatio)}:${params.radialSegments ?? 32}:${params.heightSegments ?? 1}:${params.openEnded ? 1 : 0}:${batchRound(params.thetaStart ?? 0)}:${batchRound(params.thetaLength ?? Math.PI * 2)}`;
        canonicalGeometryScale.set(radius, h, radius);
        factory = () => new THREE.CylinderGeometry(topRatio, bottomRatio, 1, params.radialSegments ?? 32, params.heightSegments ?? 1, !!params.openEnded, params.thetaStart ?? 0, params.thetaLength ?? Math.PI * 2);
      } else if (geometry.type === 'ConeGeometry') {
        const r = Number(params.radius ?? 1), h = Number(params.height ?? 1);
        key = `cone:${params.radialSegments ?? 32}:${params.heightSegments ?? 1}:${params.openEnded ? 1 : 0}:${batchRound(params.thetaStart ?? 0)}:${batchRound(params.thetaLength ?? Math.PI * 2)}`;
        canonicalGeometryScale.set(r, h, r);
        factory = () => new THREE.ConeGeometry(1, 1, params.radialSegments ?? 32, params.heightSegments ?? 1, !!params.openEnded, params.thetaStart ?? 0, params.thetaLength ?? Math.PI * 2);
      } else if (geometry.type === 'SphereGeometry') {
        const r = Number(params.radius ?? 1);
        key = `sphere:${params.widthSegments ?? 32}:${params.heightSegments ?? 16}:${batchRound(params.phiStart ?? 0)}:${batchRound(params.phiLength ?? Math.PI * 2)}:${batchRound(params.thetaStart ?? 0)}:${batchRound(params.thetaLength ?? Math.PI)}`;
        canonicalGeometryScale.setScalar(r);
        factory = () => new THREE.SphereGeometry(1, params.widthSegments ?? 32, params.heightSegments ?? 16, params.phiStart ?? 0, params.phiLength ?? Math.PI * 2, params.thetaStart ?? 0, params.thetaLength ?? Math.PI);
      } else if (geometry.type === 'CircleGeometry') {
        const r = Number(params.radius ?? 1);
        key = `circle:${params.segments ?? 32}:${batchRound(params.thetaStart ?? 0)}:${batchRound(params.thetaLength ?? Math.PI * 2)}`;
        canonicalGeometryScale.set(r, r, 1);
        factory = () => new THREE.CircleGeometry(1, params.segments ?? 32, params.thetaStart ?? 0, params.thetaLength ?? Math.PI * 2);
      } else if (geometry.type === 'TorusGeometry') {
        const r = Number(params.radius ?? 1), tube = Number(params.tube ?? 0.4);
        const base = Math.max(Math.abs(r), 0.0001);
        const tubeRatio = tube / base;
        key = `torus:${batchRound(tubeRatio)}:${params.radialSegments ?? 12}:${params.tubularSegments ?? 48}:${batchRound(params.arc ?? Math.PI * 2)}`;
        canonicalGeometryScale.setScalar(base);
        factory = () => new THREE.TorusGeometry(1, tubeRatio, params.radialSegments ?? 12, params.tubularSegments ?? 48, params.arc ?? Math.PI * 2);
      }
      if (!factory || !Number.isFinite(canonicalGeometryScale.x + canonicalGeometryScale.y + canonicalGeometryScale.z)) return null;
      let canonical = canonicalGeometryCache.get(key);
      if (!canonical) {
        canonical = factory();
        canonical.userData.performanceCanonicalGeometry = true;
        canonicalGeometryCache.set(key, canonical);
      }
      return { key, geometry: canonical, scale: canonicalGeometryScale.clone() };
    };

    // Track original ownership before replacement. An old geometry is disposed only
    // when every mesh that referenced it was safely canonicalised.
    const originalGeometryRefs = new Map<THREE.BufferGeometry, number>();
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !(obj instanceof THREE.InstancedMesh)) {
        originalGeometryRefs.set(obj.geometry, (originalGeometryRefs.get(obj.geometry) ?? 0) + 1);
      }
    });
    const replacedGeometryRefs = new Map<THREE.BufferGeometry, number>();
    const canonicalizeRoot = (root: THREE.Object3D) => {
      const visit = (obj: THREE.Object3D, inheritedDynamic: boolean) => {
        const dynamic = inheritedDynamic || dynamicCullRoots.has(obj) || dynamicVisualNamePattern.test(obj.name || '');
        if (obj instanceof THREE.Mesh && !(obj instanceof THREE.InstancedMesh)) {
          const material = Array.isArray(obj.material) ? null : obj.material;
          const safe = !dynamic && !!obj.parent && obj.children.length === 0 && obj.visible && obj.frustumCulled && obj.renderOrder === 0 &&
            !isBatchUnsafeUserData(obj) && !!material && !!batchableMaterialSignature(material);
          if (safe) {
            const result = makeCanonicalGeometry(obj.geometry);
            if (result && result.geometry !== obj.geometry) {
              const previous = obj.geometry;
              obj.geometry = result.geometry;
              obj.scale.multiply(result.scale);
              obj.updateMatrix();
              obj.matrixWorldNeedsUpdate = true;
              replacedGeometryRefs.set(previous, (replacedGeometryRefs.get(previous) ?? 0) + 1);
              staticBatchStats.canonicalizedMeshes++;
            }
          }
        }
        obj.children.forEach((child) => visit(child, dynamic));
      };
      visit(root, false);
    };
    canonicalizeRoot(goldenrod.group);
    canonicalizeRoot(springfield.group);
    canonicalizeRoot(highway.group);
    canonicalizeRoot(airport.group);
    for (const [geometry, count] of replacedGeometryRefs) {
      if (count === (originalGeometryRefs.get(geometry) ?? 0) && !geometry.userData.performanceCanonicalGeometry) {
        geometry.dispose();
        staticBatchStats.disposedGeometries++;
      }
    }

    // Count resource ownership again after canonicalisation. Disposal during batching
    // is only allowed for resources with one owner globally, so gameplay meshes can
    // never lose a geometry/material they still reference.
    const staticBatchGeometryRefs = new Map<THREE.BufferGeometry, number>();
    const staticBatchMaterialRefs = new Map<THREE.Material, number>();
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh) return;
      staticBatchGeometryRefs.set(obj.geometry, (staticBatchGeometryRefs.get(obj.geometry) ?? 0) + 1);
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((material) => staticBatchMaterialRefs.set(material, (staticBatchMaterialRefs.get(material) ?? 0) + 1));
    });
    const batchStaticDecorationRoot = (root: THREE.Object3D, rootLabel: string) => {
      root.updateWorldMatrix(true, true);
      type BatchCandidate = { mesh: THREE.Mesh; parent: THREE.Object3D; localMatrix: THREE.Matrix4; worldX: number; worldZ: number };
      type BatchGroup = { parent: THREE.Object3D; geometry: THREE.BufferGeometry; material: THREE.Material; castShadow: boolean; receiveShadow: boolean; layersMask: number; candidates: BatchCandidate[] };
      const groups = new Map<string, BatchGroup>();
      const worldPos = new THREE.Vector3();
      const localMatrix = new THREE.Matrix4();
      const parentInverse = new THREE.Matrix4();
      const size = new THREE.Vector3();
      const box = new THREE.Box3();
      const cellSize = 72;

      const visit = (obj: THREE.Object3D, inheritedDynamic: boolean) => {
        const dynamic = inheritedDynamic || dynamicCullRoots.has(obj) || dynamicVisualNamePattern.test(obj.name || '');
        if (obj instanceof THREE.Mesh && !(obj instanceof THREE.InstancedMesh)) {
          staticBatchStats.sourceMeshes++;
          const material = Array.isArray(obj.material) ? null : obj.material;
          const geometrySignature = primitiveGeometrySignature(obj.geometry);
          const materialSignature = material ? batchableMaterialSignature(material) : null;
          const safe = !dynamic && !!obj.parent && obj.children.length === 0 && obj.visible && obj.frustumCulled && obj.renderOrder === 0 &&
            !isBatchUnsafeUserData(obj) && !!geometrySignature && !!materialSignature;
          if (safe && material) {
            box.setFromObject(obj);
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0.015 && maxDim <= 18.0) {
              obj.getWorldPosition(worldPos);
              const cellX = Math.floor(worldPos.x / cellSize);
              const cellZ = Math.floor(worldPos.z / cellSize);
              // Keep each batch under the same authored parent as its source meshes.
              // This preserves parent visibility toggles/transforms (for example hidden
              // interiors) while still collapsing repeated decoration within that group.
              const key = `${obj.parent.uuid}:${cellX}:${cellZ}:${geometrySignature}:${materialSignature}:c${obj.castShadow ? 1 : 0}:r${obj.receiveShadow ? 1 : 0}:l${obj.layers.mask}`;
              let group = groups.get(key);
              if (!group) {
                group = { parent: obj.parent, geometry: obj.geometry, material, castShadow: obj.castShadow, receiveShadow: obj.receiveShadow, layersMask: obj.layers.mask, candidates: [] };
                groups.set(key, group);
              }
              parentInverse.copy(obj.parent.matrixWorld).invert();
              localMatrix.multiplyMatrices(parentInverse, obj.matrixWorld);
              group.candidates.push({ mesh: obj, parent: obj.parent, localMatrix: localMatrix.clone(), worldX: worldPos.x, worldZ: worldPos.z });
            }
          }
        }
        obj.children.forEach((child) => visit(child, dynamic));
      };
      visit(root, false);

      let batchIndex = 0;
      for (const group of groups.values()) {
        // Two meshes save only one call and are not worth replacing with an instance
        // buffer. Three or more gives a clear CPU/render win.
        if (group.candidates.length < 2) continue;
        const batch = new THREE.InstancedMesh(group.geometry, group.material, group.candidates.length);
        batch.name = `performance_static_batch_${rootLabel}_${batchIndex++}`;
        batch.userData.performanceStaticBatch = true;
        batch.receiveShadow = group.receiveShadow;
        batch.castShadow = group.castShadow;
        batch.layers.mask = group.layersMask;
        batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        group.candidates.forEach((candidate, index) => batch.setMatrixAt(index, candidate.localMatrix));
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
        group.parent.add(batch);
        if (group.castShadow) {
          const centerX = group.candidates.reduce((sum, candidate) => sum + candidate.worldX, 0) / group.candidates.length;
          const centerZ = group.candidates.reduce((sum, candidate) => sum + candidate.worldZ, 0) / group.candidates.length;
          staticShadowEntries.push({ mesh: batch, x: centerX, z: centerZ });
        }
        staticBatchStats.batches++;
        staticBatchStats.batchedMeshes += group.candidates.length;

        const representativeGeometry = group.geometry;
        const representativeMaterial = group.material;
        for (const candidate of group.candidates) {
          candidate.parent.remove(candidate.mesh);
          if (candidate.mesh.geometry !== representativeGeometry && (staticBatchGeometryRefs.get(candidate.mesh.geometry) ?? 0) === 1) {
            candidate.mesh.geometry.dispose();
            staticBatchStats.disposedGeometries++;
          }
          const candidateMaterials = Array.isArray(candidate.mesh.material) ? candidate.mesh.material : [candidate.mesh.material];
          for (const candidateMaterial of candidateMaterials) {
            if (candidateMaterial !== representativeMaterial && (staticBatchMaterialRefs.get(candidateMaterial) ?? 0) === 1) {
              candidateMaterial.dispose();
              staticBatchStats.disposedMaterials++;
            }
          }
        }
      }
    };
    batchStaticDecorationRoot(goldenrod.group, 'goldenrod');
    batchStaticDecorationRoot(springfield.group, 'springfield');
    batchStaticDecorationRoot(highway.group, 'highway');
    batchStaticDecorationRoot(airport.group, 'airport');
    for (let i = staticShadowEntries.length - 1; i >= 0; i--) {
      if (!staticShadowEntries[i].mesh.parent) staticShadowEntries.splice(i, 1);
    }
    console.info('[Render batching]', staticBatchStats);

    // Pre-compile the scene's shader variants using Three's asynchronous path where
    // the browser supports parallel shader compilation. Geometry buffers are warmed
    // separately below in tiny batches so first-time district visibility cannot dump
    // thousands of WebGL uploads into one gameplay frame.
    void renderer.compileAsync(scene, camera).catch(() => undefined);

    const gpuWarmupScene = new THREE.Scene();
    const gpuWarmupCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    gpuWarmupCamera.position.set(0, 0, 6);
    gpuWarmupCamera.lookAt(0, 0, 0);
    gpuWarmupScene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.0));
    const gpuWarmupSun = new THREE.DirectionalLight(0xffffff, 1.0);
    gpuWarmupSun.position.set(3, 5, 4);
    gpuWarmupScene.add(gpuWarmupSun);
    // Match the main scene's stable two-directional-light topology so warm-up
    // compiles the shader variant actually used during gameplay.
    const gpuWarmupFill = new THREE.DirectionalLight(0xc8ddff, 0.25);
    gpuWarmupFill.position.set(-4, 3, -2);
    gpuWarmupScene.add(gpuWarmupFill);
    const gpuWarmupTarget = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: true, stencilBuffer: false });
    gpuWarmupTarget.texture.generateMipmaps = false;
    type GpuWarmupItem = { geometry: THREE.BufferGeometry; material: THREE.Material };
    const gpuWarmupQueue: GpuWarmupItem[] = [];
    const gpuWarmupSeen = new Set<string>();
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || Array.isArray(obj.material)) return;
      const key = `${obj.geometry.uuid}:${obj.material.uuid}`;
      if (gpuWarmupSeen.has(key)) return;
      gpuWarmupSeen.add(key);
      gpuWarmupQueue.push({ geometry: obj.geometry, material: obj.material });
    });
    // Crash aftermath resources are created lazily and therefore are not attached to
    // the scene during the traversal above. Explicitly warm their shared geometry /
    // materials so the first major aircraft impact cannot introduce a new shader or
    // GPU-buffer upload spike.
    for (const item of particles.getWarmupRenderPairs()) {
      const key = `${item.geometry.uuid}:${item.material.uuid}`;
      if (gpuWarmupSeen.has(key)) continue;
      gpuWarmupSeen.add(key);
      gpuWarmupQueue.push(item);
    }
    let gpuWarmupCursor = 0;
    const gpuWarmupBatchSize = 8;
    // IMPORTANT: do not submit the off-screen GPU warm-up renderer during live
    // gameplay. Captured debug snapshots showed ~170ms of frame CPU outside both
    // worldTickMs and the measured main renderer.render(), exactly while the first
    // warm-up batch was running (8 / ~6700). A hidden renderer.render() here can
    // synchronously compile/upload resources and tank otherwise healthy gameplay.
    // The queue is retained for diagnostics/future loading-screen use, but active
    // gameplay now relies on normal demand-driven uploads.
    const liveGpuWarmupEnabled = false;
    const warmupScale = new THREE.Vector3();
    const warmupBox = new THREE.Box3();
    const runGpuWarmupBatch = () => {
      if (gpuWarmupCursor >= gpuWarmupQueue.length) return;
      const priorTarget = renderer.getRenderTarget();
      const temporaryMeshes: THREE.Mesh[] = [];
      for (let i = 0; i < gpuWarmupBatchSize && gpuWarmupCursor < gpuWarmupQueue.length; i++, gpuWarmupCursor++) {
        const item = gpuWarmupQueue[gpuWarmupCursor];
        const dummy = new THREE.Mesh(item.geometry, item.material);
        dummy.frustumCulled = false;
        dummy.castShadow = false;
        dummy.receiveShadow = false;
        const warmupPosition = item.geometry.getAttribute('position');
        if (warmupPosition) {
          warmupBox.setFromBufferAttribute(warmupPosition as THREE.BufferAttribute);
          warmupBox.getSize(warmupScale);
        } else {
          warmupScale.set(1, 1, 1);
        }
        const largest = Math.max(warmupScale.x, warmupScale.y, warmupScale.z, 0.001);
        dummy.scale.setScalar(0.45 / largest);
        const slot = temporaryMeshes.length;
        dummy.position.set(-0.65 + (slot % 4) * 0.43, 0.35 - Math.floor(slot / 4) * 0.7, 0);
        gpuWarmupScene.add(dummy);
        temporaryMeshes.push(dummy);
      }
      renderer.setRenderTarget(gpuWarmupTarget);
      renderer.render(gpuWarmupScene, gpuWarmupCamera);
      renderer.setRenderTarget(priorTarget);
      temporaryMeshes.forEach((mesh) => gpuWarmupScene.remove(mesh));
    };

    // Cached structural bounds used only for emergency performance-tier parent
    // culling. The complete airport bounds include the enormous green belt and the
    // public road spine that reaches both cities, so using the whole airport Box3 as
    // an on/off test keeps the terminal/runway/hangars render-active from Goldenrod.
    // Keep those lightweight connector pieces resident, but collect heavy static
    // airport-core children separately so Three.js can skip their entire subtrees
    // until the camera/player is actually approaching the airport proper.
    const airportCorePerformanceBounds = new THREE.Box3();
    const airportCorePerformanceEntries: Array<{ object: THREE.Object3D; baseVisible: boolean }> = [];
    const airportChildBounds = new THREE.Box3();
    const airportCoreExcludePattern = /airport_district_grass|airport_public_access_spine|airport_sign_/i;
    for (const child of airport.group.children) {
      if (dynamicCullRoots.has(child) || airportCoreExcludePattern.test(child.name || '')) continue;
      airportChildBounds.setFromObject(child);
      if (airportChildBounds.isEmpty() || !Number.isFinite(airportChildBounds.max.z)) continue;
      // Everything wholly south of this line belongs to the expensive airport core
      // (parking/terminal/apron/runway/taxiways/hangars). The connector road/signage
      // north of it stays live so driving toward the airport never loses the route.
      if (airportChildBounds.max.z < -300) {
        airportCorePerformanceEntries.push({ object: child, baseVisible: child.visible });
        airportCorePerformanceBounds.union(airportChildBounds);
      }
    }
    let airportCorePerformanceVisible = true;
    const setAirportCorePerformanceVisible = (visible: boolean) => {
      if (airportCorePerformanceVisible === visible) return;
      airportCorePerformanceVisible = visible;
      for (const entry of airportCorePerformanceEntries) {
        entry.object.visible = visible ? entry.baseVisible : false;
      }
    };
    const highwayPerformanceBounds = new THREE.Box3().setFromObject(highway.group);

    const detailCullEntries: { object: THREE.Mesh; x: number; z: number; roadCritical: boolean; interior: boolean }[] = [];
    const detailBox = new THREE.Box3();
    const detailSize = new THREE.Vector3();
    const detailCenter = new THREE.Vector3();
    const roadDetailNamePattern = /(road|street|footpath|sidewalk|driveway|curb|crosswalk|interstate|bridge[_ -]?deck|junction|roundabout)/i;
    const collectDetailMeshes = (root: THREE.Object3D) => {
      root.updateWorldMatrix(true, true);
      const visit = (obj: THREE.Object3D, inheritedDynamic: boolean, inheritedRoadCritical: boolean, inheritedInterior: boolean) => {
        const dynamic = inheritedDynamic || dynamicCullRoots.has(obj);
        const objectName = (obj.name || '').toLowerCase();
        const roadCritical =
          inheritedRoadCritical ||
          obj.userData.roadCriticalDetail === true ||
          roadDetailNamePattern.test(obj.name || '');
        const interior = inheritedInterior || obj.userData.interiorDetail === true || /interior_house|interior_detail|living_room|bedroom|kitchen_interior|shop_interior|store_interior|jail_cell/.test(objectName);
        // Road markings, crossings, kerbs and other navigation-critical road detail
        // must never pop into existence as the player approaches. Previously these
        // meshes were merely given a longer cull distance (260-360m), so white road
        // stripes/crossings could suddenly appear on otherwise stable asphalt. Keep
        // roadCritical detail permanently visible and only distance-cull non-road
        // decoration/interior micro-detail.
        if (!roadCritical && !dynamic && obj instanceof THREE.Mesh && !(obj instanceof THREE.InstancedMesh) && !obj.userData.walkable && !obj.userData.solidCollider) {
          detailBox.setFromObject(obj);
          detailBox.getSize(detailSize);
          const maxDim = Math.max(detailSize.x, detailSize.y, detailSize.z);
          if (maxDim > 0.02 && maxDim <= 5.5) {
            detailBox.getCenter(detailCenter);
            detailCullEntries.push({ object: obj, x: detailCenter.x, z: detailCenter.z, roadCritical: false, interior });
          }
        }
        obj.children.forEach((child) => visit(child, dynamic, roadCritical, interior));
      };
      visit(root, false, false, false);
    };
    collectDetailMeshes(goldenrod.group);
    collectDetailMeshes(springfield.group);
    collectDetailMeshes(highway.group);
    collectDetailMeshes(airport.group);
    collectDetailMeshes(arcadeBuilding.group);

    // ---------------------------------------------------------------------
    // SAVE / STARTER STATE
    // ---------------------------------------------------------------------
    const loadedSave = loadGameSave();
    hasChosenStarterRef.current = loadedSave.hasChosenStarter;
    unlockedGeodudeRef.current = loadedSave.unlockedGeodude;
    selectedPokemonRef.current = loadedSave.currentPokemon;
    setHasChosenStarter(loadedSave.hasChosenStarter);
    setUnlockedGeodude(loadedSave.unlockedGeodude);
    setSelectedPokemonId(loadedSave.currentPokemon);

    worldProgressRef.current = {
      ...DEFAULT_WORLD_PROGRESS,
      ...(loadedSave.worldProgress ?? {}),
      visitedLandmarks: [...(loadedSave.worldProgress?.visitedLandmarks ?? [])],
      completedGoals: [...(loadedSave.worldProgress?.completedGoals ?? [])],
    };

    // New games deliberately begin as a trainer inside Oak's lab so selection is physical.
    const rawStart = loadedSave.hasChosenStarter
      ? new THREE.Vector3(loadedSave.playerPos.x, loadedSave.playerPos.y, loadedSave.playerPos.z)
      : new THREE.Vector3(OAK_LAB_START.x, OAK_LAB_START.y, OAK_LAB_START.z);
    rawStart.y = collisionSystem.getGroundHeightNear(rawStart.x, rawStart.z, rawStart.y, 0.12, 1.6, 4.0);

    // Saves can legitimately be written while the player is inside a furnished
    // building. If later world/detail changes put a bed, wall or cabinet over that
    // exact coordinate, loading the save must not strand the player inside it. Keep
    // the recovery deliberately local so an upstairs bedroom save stays upstairs,
    // but move a few steps to the nearest clear authored floor when necessary.
    const safeStart = loadedSave.hasChosenStarter
      ? collisionSystem.findSafePosition(rawStart, 0.72, 2.0, 4.8)
      : rawStart.clone();
    rawStart.copy(safeStart);

    let playerMesh = loadedSave.hasChosenStarter
      ? createPokemonModel(loadedSave.currentPokemon)
      : createTrainerAvatarModel();
    playerMesh.position.copy(rawStart);
    playerMesh.rotation.y = loadedSave.hasChosenStarter ? loadedSave.playerRotationY : OAK_LAB_START.yaw;
    scene.add(playerMesh);

    const playerMovement = new PlayerMovement(rawStart, loadedSave.hasChosenStarter ? loadedSave.playerRotationY : OAK_LAB_START.yaw);

    // Do not let a brand-new game inherit the generic camera position that is
    // created before save/world state is known. Stage the actual third-person
    // camera behind Ash now, before the first gameplay render, so there is no
    // one-frame road/outside-lab flash and the starter row is immediately ahead.
    if (!loadedSave.hasChosenStarter) {
      const introLookTarget = rawStart.clone().add(new THREE.Vector3(0, 1.1, 0));
      const introDesiredCamera = new THREE.Vector3(
        rawStart.x - Math.sin(OAK_LAB_START.yaw) * Math.cos(OAK_LAB_START.cameraPitch) * OAK_LAB_START.cameraDistance,
        rawStart.y + Math.sin(OAK_LAB_START.cameraPitch) * OAK_LAB_START.cameraDistance + 1.0,
        rawStart.z - Math.cos(OAK_LAB_START.yaw) * Math.cos(OAK_LAB_START.cameraPitch) * OAK_LAB_START.cameraDistance,
      );
      camera.position.copy(collisionSystem.resolveCameraPosition(introLookTarget, introDesiredCamera, 0.26, 0.20));
      camera.lookAt(introLookTarget);
    }

    // ---------------------------------------------------------------------
    // POPULATION, BATTLE, TRAFFIC & WORLD INTERACTIONS
    // ---------------------------------------------------------------------
    const npcManager = new NPCManager(
      scene,
      (x, z, currentY = 0.12, maxDrop = 3.5, fallbackY = currentY) => collisionSystem.getGroundHeightNear(x, z, currentY, fallbackY, 0.8, maxDrop),
      (position, radius = 0.48, height = 1.75) => collisionSystem.canOccupy(position, radius, height),
      (position, radius = 0.48, height = 1.75) => collisionSystem.canFlyOccupy(position, radius, height),
      (x, z, clearance = 0) => collisionSystem.isRoadSurfaceAt(x, z, clearance),
      (x, z) => collisionSystem.isPedestrianSurfaceAt(x, z)
    );
    npcManager.setGroundForbiddenPredicate(isOpenRiverWater);
    npcManager.setAquaticSurfacePredicate(isRiverWaterColumn);
    npcManager.spawnAirportPopulation(airport.npcSpawns);

    const clearSeatState = (current: EngineState) => {
      current.seated = false;
      current.activeSeat = null;
      current.seatStartPosition = null;
      current.seatTargetPosition = null;
      current.seatStandPosition = null;
      current.seatTransitionTimer = 0;
    };

    const clearParachuteState = (current: EngineState) => {
      current.parachuteController?.destroy();
      current.parachuteController = null;
      setParachuteHud(null);
    };

    const clearActiveAircraft = (current: EngineState) => {
      const leavingAircraft = current.activeAircraft;
      if (leavingAircraft) {
        leavingAircraft.inUse = false;
        current.freeAircraftControllers.delete(leavingAircraft.id);
        // A severe crash must remain a disabled physical wreck instead of snapping
        // back to normal flight as soon as the player's death sequence detaches them.
        // Transfer the existing shared controller to the free-aircraft loop so the
        // wreck can fall/slide/burn and only the normal timed cleanup later restores it.
        if (leavingAircraft.crashed) {
          const wreckController = current.aircraftController ?? new AircraftController(leavingAircraft, current.collisionSystem, current.airportAircraft, current.worldInteractions);
          current.freeAircraftControllers.set(leavingAircraft.id, wreckController);
        }
      }
      current.activeAircraft = null;
      current.aircraftController = null;
      setAircraftHud(null);
      if (!current.activeVehicle) {
        setInVehicle(false);
        current.playerMesh.visible = true;
      }
    };

    const dropHeldNpcForTransition = (current: EngineState) => {
      if (!current.grabbedNpcId) return;
      const held = current.npcManager.getNPCById(current.grabbedNpcId);
      if (held) {
        const forward = new THREE.Vector3(Math.sin(current.playerMovement.yaw), 0, Math.cos(current.playerMovement.yaw));
        const side = new THREE.Vector3(forward.z, 0, -forward.x);
        const desired = current.playerMovement.position.clone().addScaledVector(side, 1.35);
        desired.y = current.collisionSystem.getGroundHeightNear(desired.x, desired.z, current.playerMovement.position.y, current.playerMovement.position.y, 1.2, 4.5);
        const safe = current.collisionSystem.findSafePositionOnLevel(desired, 0.56, 1.75, 2.6, 1.4) ?? desired;
        current.npcManager.releaseGrabbedNPC(held, safe);
      }
      current.grabbedNpcId = null;
      current.grabLiftTimer = 0;
      current.grabStartPosition = null;
      current.grabThrowPoseTimer = 0;
      current.grabThrowQueued = false;
      current.grabThrowLockoutUntil = 0;
      clearPlayerGrabPose(current.playerMesh);
    };

    const recoverPlayerToSafeCheckpoint = (reason: 'knockout' | 'manual_reset' | 'invalid_position' = 'invalid_position') => {
      const current = engineRef.current;
      if (!current) return;

      dropHeldNpcForTransition(current);
      clearSeatState(current);
      clearParachuteState(current);

      if (current.activeAircraft) clearActiveAircraft(current);
      if (current.activeVehicle) {
        current.activeVehicle.inUse = false;
        current.activeVehicle = null;
        current.activeCarPhysics = null;
        setInVehicle(false);
        setCurrentVehicleInfo(null);
      }
      current.trainRideActive = false;
      current.vehicleSurfaceSupport = null;
      current.elevatorRideActive = false;
      current.elevatorRideDestination = null;
      current.elevatorRideLift = null;
      current.charizardFlightActive = false;
      current.charizardFlightSpeed = 0;
      current.charizardVerticalSpeed = 0;
      current.charizardSpaceWasHeld = false;
      current.playerMesh.userData.charizardFlying = false;
      current.playerMesh.userData.charizardJumpPreparing = false;
      current.playerMesh.userData.charizardBank = 0;
      current.playerMesh.userData.charizardPitch = 0;

      // Oak's Lab is only the deliberate new-game starter spawn. Once a starter has
      // been chosen, recovery returns to the most recent genuinely safe gameplay
      // position instead of using Oak's exterior as a hidden universal default.
      const fallback = current.hasChosenStarter
        ? current.lastSafePosition.clone()
        : new THREE.Vector3(OAK_LAB_START.x, OAK_LAB_START.y, OAK_LAB_START.z);
      const safe =
        current.collisionSystem.findSafePositionOnLevel(fallback, 0.72, 2.0, 7.0, 1.8) ??
        current.collisionSystem.findSafePosition(fallback, 0.72, 2.0, 7.0);
      safe.y = current.collisionSystem.getGroundHeightNear(safe.x, safe.z, safe.y, 0.12, 1.8, 4.5);
      const recoveryYaw = current.hasChosenStarter ? current.lastSafeYaw : OAK_LAB_START.yaw;
      current.playerMovement.resetForTeleport(safe, recoveryYaw, true);
      current.playerMesh.position.copy(safe);
      current.playerMesh.rotation.set(0, recoveryYaw, 0);
      current.playerMesh.visible = true;
      current.cameraAngle = recoveryYaw;

      // Invalid-position recovery is a true teleport. If the camera was following a
      // bad physics position (for example briefly below terrain), letting the normal
      // third-person lerp travel hundreds of metres back to the recovered player can
      // leave the screen showing only the atmospheric dome for several seconds. Snap
      // the camera to the recovered character immediately so the world never appears
      // to "vanish" while the camera catches up.
      const recoveryLookHeight = current.currentPokemonId === 'charizard' ? 1.38 : 1.1;
      const recoveryLookTarget = safe.clone().add(new THREE.Vector3(0, recoveryLookHeight, 0));
      const recoveryCameraDistance = THREE.MathUtils.clamp(current.cameraDistance, 3.0, 12.0);
      const recoveryDesiredCamera = new THREE.Vector3(
        safe.x - Math.sin(current.cameraAngle) * Math.cos(current.cameraPitch) * recoveryCameraDistance,
        safe.y + Math.sin(current.cameraPitch) * recoveryCameraDistance + (current.currentPokemonId === 'charizard' ? 1.25 : 1.0),
        safe.z - Math.cos(current.cameraAngle) * Math.cos(current.cameraPitch) * recoveryCameraDistance,
      );
      current.camera.position.copy(
        current.collisionSystem.resolveCameraPosition(recoveryLookTarget, recoveryDesiredCamera, 0.26, 0.20)
      );
      current.camera.lookAt(recoveryLookTarget);
      if (reason !== 'invalid_position') playSoundEffect('click');
    };

    const beginDeathSequence = (reason = 'impact') => {
      const engine = engineRef.current;
      if (!engine || engine.deathSequenceActive || engine.hospitalRecoveryActive) return;

      // Only a player-controlled aircraft that actually killed the player in a
      // structure impact gets the extended crash-site aftermath. Abandoned aircraft
      // continue through the free-aircraft loop without stealing the player's camera.
      const aircraftAftermathActive = !!(
        engine.aircraftDeathAftermath &&
        engine.activeAircraft &&
        engine.activeAircraft.crashed &&
        engine.activeAircraft.id === engine.aircraftDeathAftermath.aircraftId
      );
      if (!aircraftAftermathActive) engine.aircraftDeathAftermath = null;

      dropHeldNpcForTransition(engine);
      clearSeatState(engine);

      // A death is also a loss/exit from any active challenge. Clear these states
      // BEFORE the cinematic begins so nothing can keep attacking the player while
      // they are fading out or after they wake up in Goldenrod Hospital.
      if (engine.ashBattle.state.isActive) {
        engine.ashBattle.abortBattle('Challenge lost — you fainted. Talk to Ash when you are ready to try again.');
        setAshBattleState({ ...engine.ashBattle.state });
      }

      // Free-roam Ash retaliation is a completely separate encounter. Death must
      // recall its Charizard immediately so it cannot follow the player to hospital.
      if (engine.ashHostileActive) endAshHostileEncounter();

      // Abort any non-combat character cinematic cleanly on death.
      if (engine.milesInteractionActive) {
        const miles = engine.npcManager.getNPCById('cameo_miles');
        if (miles) {
          miles.mesh.userData.specialInteractionActive = false;
          const arm = miles.mesh.getObjectByName('arm_right');
          if (arm) arm.rotation.set(0, 0, 0);
          miles.mesh.rotation.z = 0;
        }
        engine.milesInteractionActive = false;
        engine.milesInteractionTimer = 0;
        engine.milesInteractionStart = null;
        engine.milesInteractionTarget = null;
      }

      // A death while riding Toothless forcibly ends the ride and lands Toothless
      // locally. The player still goes through the normal hospital flow.
      if (engine.toothlessMounted || engine.toothlessMounting) {
        const toothless = engine.npcManager.getNPCById('cameo_toothless');
        if (toothless) {
          const ground = engine.collisionSystem.getGroundHeightNear(toothless.mesh.position.x, toothless.mesh.position.z, toothless.mesh.position.y, 0.12, 4.0, 14);
          toothless.mesh.position.y = ground;
          toothless.mesh.rotation.x = 0;
          toothless.mesh.rotation.z = 0;
          toothless.mesh.userData.specialInteractionActive = false;
          toothless.mesh.userData.mounted = false;
          toothless.mesh.userData.home = toothless.mesh.position.clone();
          toothless.state = 'idle';
        }
        engine.toothlessMounted = false;
        engine.toothlessMounting = false;
        engine.toothlessMountTimer = 0;
        engine.toothlessFlightSpeed = 0;
        engine.toothlessVerticalSpeed = 0;
        engine.toothlessMountStart = null;
      }

      if (engine.charizardFlightActive) {
        engine.charizardFlightActive = false;
        engine.charizardFlightSpeed = 0;
        engine.charizardVerticalSpeed = 0;
        engine.charizardSpaceWasHeld = false;
        engine.playerMesh.userData.charizardFlying = false;
        engine.playerMesh.userData.charizardJumpPreparing = false;
        engine.playerMesh.userData.charizardBank = 0;
        engine.playerMesh.userData.charizardPitch = 0;
      }

      if (worldProgressRef.current.jailbreakActive) {
        worldProgressRef.current.jailbreakActive = false;
        engine.cellDoorOpen = true;
        engine.cellDoorTargetRotation = -1.1;
        engine.collisionSystem.setColliderEnabled('ps_jail_cell_door', false);

        // Death serves the remainder of the sentence: both station exits return to
        // normal gameplay state and the special jailbreak guard is despawned.
        const stationDoor = engine.doors.find((door) => door.id === 'police_station_door');
        stationDoor?.setAutomaticLocked(false);
        stationDoor?.open();
        const jailGuard = engine.npcManager.getNPCById('jail_escape_guard');
        if (jailGuard) {
          jailGuard.mesh.visible = false;
          jailGuard.mesh.userData.hostileJailGuard = false;
          jailGuard.mesh.userData.noRecover = false;
          jailGuard.mesh.userData.pendingKnockout = false;
          jailGuard.mesh.userData.guardDefeated = false;
          jailGuard.kickedVelocity?.set(0, 0, 0);
          jailGuard.knockoutTimer = 0;
          jailGuard.combatHp = jailGuard.combatMaxHp ?? 185;
          jailGuard.state = 'idle';
        }
        window.setTimeout(() => saveNowRef.current(), 50);
      }

      // Death is a real state transition, not a delayed generic reset. Freeze the
      // player's current situation, detach from moving vehicles/platforms, clear the
      // wanted pursuit, and let the cinematic own the camera until hospital recovery.
      // Aircraft crashes may occur well above ground, so never leave the hidden player
      // attached to an aircraft during the death cinematic. Keep the crashed aircraft
      // in the world, but anchor the character/camera to the last safe on-foot point.
      if (engine.activeAircraft) {
        // Keep the hidden character state somewhere safe, but preserve the actual
        // crashed aircraft/controller in-world. clearActiveAircraft transfers a
        // crashed controller to the free-aircraft simulation so lodged wrecks stay
        // lodged and deflected wrecks can visibly fall/settle during the aftermath.
        engine.playerMovement.position.copy(engine.lastSafePosition);
        engine.playerMovement.yaw = engine.lastSafeYaw;
        clearActiveAircraft(engine);
        soundManager.stopEngine();
      }
      if (engine.activeVehicle) {
        engine.activeVehicle.speed = engine.activeCarPhysics?.speed ?? engine.activeVehicle.speed;
        engine.activeVehicle.inUse = false;
        if (engine.activeCarPhysics) {
          engine.activeVehicle.mesh.position.copy(engine.activeCarPhysics.position);
          engine.activeVehicle.mesh.rotation.y = engine.activeCarPhysics.yaw;
          const carPos = engine.activeCarPhysics.position.clone();
          const carYaw = engine.activeCarPhysics.yaw;
          engine.activeCarPhysics.speed = 0;
          const deathSide = new THREE.Vector3(Math.cos(carYaw), 0, -Math.sin(carYaw));
          const besideCar = carPos.clone().addScaledVector(deathSide, -2.8);
          const safeBesideCar = engine.collisionSystem.findSafePositionOnLevel(
            besideCar,
            0.72,
            2.0,
            3.6,
            1.35
          );
          // If the immediate side is blocked, keep the cinematic anchored to the
          // player's last known on-foot point rather than putting them inside the car.
          engine.playerMovement.position.copy(safeBesideCar ?? engine.lastSafePosition);
        }
        engine.activeVehicle = null;
        engine.activeCarPhysics = null;
        setInVehicle(false);
        setCurrentVehicleInfo(null);
        soundManager.stopEngine();
      }
      engine.trainRideActive = false;
      engine.trainRideJumpOffset = 0;
      engine.trainRideVerticalVelocity = 0;
      engine.elevatorRideActive = false;
      engine.elevatorRideDestination = null;
      engine.elevatorRideLift = null;
      engine.vehicleEntryActive = false;
      engine.pendingVehicle = null;
      engine.vehicleExitTumbleTimer = 0;
      engine.vehicleExitTumbleDuration = 0;
      // During the special aircraft aftermath the character body is irrelevant and
      // may be kilometres away at the last safe on-foot checkpoint. Hide it until
      // the existing hospital transition places it on the recovery bed.
      engine.playerMesh.visible = !aircraftAftermathActive;
      engine.playerMesh.position.copy(engine.playerMovement.position);
      engine.playerMovement.velocity.set(0, 0, 0);
      engine.playerMovement.isGrounded = true;
      // A held movement/attack key must not carry through the cinematic and make
      // the player instantly run off the hospital bed on the first recovered frame.
      for (const code of Object.keys(engine.keys)) engine.keys[code] = false;

      engine.vehicleSurfaceSupport = null;
      engine.deathSequenceActive = true;
      engine.deathSequenceTimer = 0;
      engine.deathSequenceStage = aircraftAftermathActive ? 'aftermath' : 'death';
      engine.hospitalRecoveryActive = false;
      engine.hospitalRecoveryTimer = 0;
      engine.hospitalRecoveryLastHp = 0;
      engine.playerInvulnerableUntil = performance.now() * 0.001 + 12;

      wantedHeatRef.current = 0;
      wantedRef.current = 0;
      engine.wantedHeat = 0;
      engine.hitAndRunActive = false;
      engine.hitAndRunEscapeTimer = 0;
      setWantedHeat(0);
      setWantedLevel(0);
      setHitAndRunActive(false);
      soundManager.setSiren(false);
      setActiveDialogue(null);
      setInteractionPrompt(null);
      // Leave the first part of an aircraft-building death unobstructed so the player
      // can actually see the wreck/fire. WASTED appears only near the end, followed
      // by the normal fade and unchanged hospital recovery presentation.
      setDeathPresentation(aircraftAftermathActive ? 'none' : 'death');
      engine.playerMesh.userData.deathReason = reason;
      playSoundEffect('impact');
    };

    const damagePlayer = (amount: number, reason = 'impact', aircraftAftermath: AircraftDeathAftermath | null = null) => {
      const engine = engineRef.current;
      if (!engine || bustedRef.current || engine.deathSequenceActive || engine.hospitalRecoveryActive) return;
      const now = performance.now() * 0.001;
      if (now < engine.playerInvulnerableUntil) return;
      engine.playerInvulnerableUntil = now + 0.6;
      const next = Math.max(0, hpRef.current - amount);
      engine.cameraShake = Math.max(engine.cameraShake, Math.min(0.55, 0.12 + amount * 0.012));
      hpRef.current = next;
      setPokemonHp(next);
      engine.specialTimer = Math.max(engine.specialTimer, 0.25);
      if (engine.playerMesh && !engine.activeVehicle) {
        engine.playerMesh.rotation.x = -0.2;
      }
      if (next <= 0) {
        hpRef.current = 0;
        setPokemonHp(0);
        engine.aircraftDeathAftermath = aircraftAftermath;
        beginDeathSequence(reason);
      }
    };

    npcManager.setPlayerPowerEffectHandler((effect) => {
      const engine = engineRef.current;
      if (!engine || engine.deathSequenceActive || engine.hospitalRecoveryActive || engine.activeVehicle || engine.activeAircraft) return;
      damagePlayer(effect.damage, effect.reason);
      if (engine.deathSequenceActive || engine.hospitalRecoveryActive) return;
      // Powers remain punchy, but cap the resulting player impulse so a single
      // revenge move cannot corrupt physics or launch the player through the map.
      const planarImpulse = new THREE.Vector2(effect.impulse.x, effect.impulse.z);
      if (planarImpulse.length() > 9.5) planarImpulse.setLength(9.5);
      engine.playerMovement.velocity.x = THREE.MathUtils.clamp(engine.playerMovement.velocity.x + planarImpulse.x, -14, 14);
      engine.playerMovement.velocity.y = Math.max(engine.playerMovement.velocity.y, THREE.MathUtils.clamp(effect.impulse.y, -2, 7.5));
      engine.playerMovement.velocity.z = THREE.MathUtils.clamp(engine.playerMovement.velocity.z + planarImpulse.y, -14, 14);
      engine.playerMovement.isGrounded = false;
      engine.cameraShake = Math.max(engine.cameraShake, Math.min(0.48, 0.16 + effect.impulse.length() * 0.025));
      if (effect.slowSeconds) {
        engine.playerMesh.userData.powerSlowUntil = performance.now() * 0.001 + effect.slowSeconds;
      }
    });

    npcManager.setWorldPowerEffectHandler((effect) => {
      const engine = engineRef.current;
      if (!engine) return;
      const direction = effect.direction.clone().setY(0);
      if (direction.lengthSq() < 0.001) direction.set(0, 0, 1);
      direction.normalize();
      const worldPos = new THREE.Vector3();
      for (const prop of engine.destructibles) {
        if (prop.destroyed) continue;
        prop.mesh.getWorldPosition(worldPos);
        const planar = Math.hypot(worldPos.x - effect.source.x, worldPos.z - effect.source.z);
        if (planar > effect.radius) continue;
        const localAway = worldPos.clone().sub(effect.source).setY(0);
        if (localAway.lengthSq() < 0.001) localAway.copy(direction);
        localAway.normalize();
        const blend = effect.kind === 'force' ? localAway.lerp(direction, 0.45).normalize() : localAway;
        const impactPoint = worldPos.clone().setY(effect.source.y + 0.6);
        engine.worldInteractions.launchDestructible(
          prop,
          blend.multiplyScalar(effect.power * 0.62).setY(effect.power * 0.42),
          0.34,
          0.6,
          { source: effect.source, impactPoint, applyMassResponse: true, kind: 'power' }
        );
      }
    });

    const ashBattle = new AshBattleManager(
      scene,
      springfield.simpsonsHouse.livingRoomPos,
      (firstClear) => {
        if (!firstClear) {
          setActiveDialogue({ speaker: 'Ash Ketchum', text: 'Good rematch! No duplicate prize this time — come battle me again whenever you want.' });
          return;
        }
        unlockedGeodudeRef.current = true;
        setUnlockedGeodude(true);
        // This is an EVENT notification, not saved state. Loading a save where Ash
        // was already beaten must never replay the victory banner on every restart.
        setShowAshVictory(true);
        setActiveDialogue({
          speaker: 'Ash Ketchum',
          text: 'NO WAY! You beat all seven! Geodude with the stupid legs is yours!',
        });
        playSoundEffect('fanfare');
        window.setTimeout(() => saveNowRef.current(), 50);
      },
      (amount, fighter) => damagePlayer(amount, fighter.specialMove)
    );
    ashBattle.setAshMesh(springfield.simpsonsHouse.ashMesh);
    ashBattle.setRewardClaimed(!!loadedSave.ashDefeated);

    const vehicles: Vehicle[] = [];
    const policeAIs: PoliceAI[] = [];
    const roadblocks: Roadblock[] = [];

    // Procedural vehicle models expose a tiny render-only node cache. This keeps
    // wheel rotation, front-wheel steering and segmented lamp states visual only;
    // it never feeds back into handling, collision, ownership or spawn logic.
    const updateVehicleVisuals = (
      mesh: THREE.Group,
      speed: number,
      visualDt: number,
      steerTarget = 0,
      braking = false,
      reversing = false
    ) => {
      const nodes = mesh.userData.vehicleVisualNodes as
        | {
            wheelSpins?: THREE.Object3D[];
            wheelSteers?: THREE.Object3D[];
            brakeLights?: THREE.Mesh[];
            reverseLights?: THREE.Mesh[];
          }
        | undefined;
      if (!nodes) return;

      for (const spin of nodes.wheelSpins ?? []) {
        const radius = Math.max(0.16, Number(spin.userData.wheelRadius) || 0.36);
        spin.rotation.x -= (speed / radius) * visualDt;
      }
      for (const steer of nodes.wheelSteers ?? []) {
        const base = Number(steer.userData.baseSteerY) || 0;
        steer.rotation.y = THREE.MathUtils.damp(steer.rotation.y, base + steerTarget, 12, visualDt);
      }
      for (const lamp of nodes.brakeLights ?? []) {
        const materials = Array.isArray(lamp.material) ? lamp.material : [lamp.material];
        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissiveIntensity = THREE.MathUtils.damp(material.emissiveIntensity, braking ? 3.2 : 0.72, 16, visualDt);
          }
        });
      }
      for (const lamp of nodes.reverseLights ?? []) {
        const materials = Array.isArray(lamp.material) ? lamp.material : [lamp.material];
        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissiveIntensity = THREE.MathUtils.damp(material.emissiveIntensity, reversing ? 2.7 : 0.16, 16, visualDt);
          }
        });
      }
      const rocketFlame = mesh.userData.rocketFlame as THREE.Mesh | undefined;
      if (rocketFlame) {
        const thrust = THREE.MathUtils.clamp((Math.abs(speed) - 1.5) / 18, 0, 1);
        rocketFlame.visible = thrust > 0.02;
        if (rocketFlame.visible) {
          rocketFlame.scale.set(0.80 + thrust * 0.35, 0.75 + thrust * 1.35, 0.80 + thrust * 0.35);
          const mat = rocketFlame.material;
          if (mat instanceof THREE.MeshStandardMaterial) mat.emissiveIntensity = 2.6 + thrust * 2.4;
        }
      }
    };


    type VehiclePerformanceNodes = {
      interior: THREE.Object3D[];
      micro: THREE.Object3D[];
      shadow: THREE.Mesh[];
    };
    const ensureVehiclePerformanceNodes = (mesh: THREE.Group): VehiclePerformanceNodes => {
      const cached = mesh.userData.performanceNodes as VehiclePerformanceNodes | undefined;
      if (cached) return cached;
      const nodes: VehiclePerformanceNodes = { interior: [], micro: [], shadow: [] };
      mesh.traverse((obj) => {
        const name = (obj.name || '').toLowerCase();
        if (obj instanceof THREE.Mesh && obj.castShadow) nodes.shadow.push(obj);
        // Occupant visibility is controlled by traffic/player systems, so only
        // hide permanent cabin geometry here, never driver/passenger avatars.
        if (!/driver|passenger/.test(name) && /seat|dashboard|dash_|steering|headrest|gauge|center_console/.test(name)) {
          nodes.interior.push(obj);
        } else if (/badge|emblem|brake_disc|caliper|door_handle|wiper|tiny_trim|tail_led|grille_detail|exhaust_tip/.test(name)) {
          nodes.micro.push(obj);
        }
      });
      mesh.userData.performanceNodes = nodes;
      return nodes;
    };

    const heroFactories: Partial<Record<VehicleModelType, () => THREE.Group>> = {
      bmw_f80_m3: createBmwF80M3,
      bmw_g80_m3: createBmwG80M3,
      bmw_f90_m5: createBmwF90M5,
      lamborghini_aventador: createLamborghiniAventador,
      ferrari_f12: createFerrariF12,
    };
    const heroTuning: Partial<Record<VehicleModelType, { maxSpeed: number; acceleration: number }>> = {
      bmw_f80_m3: { maxSpeed: 100, acceleration: 39 },
      bmw_g80_m3: { maxSpeed: 116, acceleration: 45 },
      bmw_f90_m5: { maxSpeed: 124, acceleration: 49 },
      lamborghini_aventador: { maxSpeed: 140, acceleration: 53 },
      ferrari_f12: { maxSpeed: 136, acceleration: 51 },
    };

    const parkedHeroBounds: THREE.Box3[] = [];
    const heroParkingOffsets = [0, -0.6, 0.6, -1.2, 1.2, -1.8, 1.8, -2.4, 2.4];

    const overlapsStaticCollider = (bounds: THREE.Box3) =>
      collisionSystem.getActiveColliders().some((collider) => {
        const minY = collider.minY ?? -Infinity;
        const maxY = collider.maxY ?? Infinity;
        return (
          bounds.max.y > minY && bounds.min.y < maxY &&
          bounds.max.x > collider.minX && bounds.min.x < collider.maxX &&
          bounds.max.z > collider.minZ && bounds.min.z < collider.maxZ
        );
      });

    goldenrod.playerGarage.carBays.forEach((bay, idx) => {
      const factory = heroFactories[bay.type];
      if (!factory) return;
      const mesh = factory();
      mesh.rotation.y = bay.rotationY;

      // Validate the REAL rendered/collision bounds rather than trusting the model's
      // visual centre. This is especially important for the F90 beside the rail pylon.
      // If a future model revision becomes wider, parking automatically searches a
      // nearby point inside the same bay instead of spawning through the pole.
      let finalBounds: THREE.Box3 | null = null;
      for (const xOffset of heroParkingOffsets) {
        const x = bay.pos.x + xOffset;
        const ground = collisionSystem.getGroundHeightNear(x, bay.pos.z, bay.pos.y + 0.25, bay.pos.y, 0.9, 2.5);
        mesh.position.set(x, ground + 0.08, bay.pos.z);
        mesh.updateMatrixWorld(true);

        const bounds = new THREE.Box3().setFromObject(mesh).expandByVector(new THREE.Vector3(0.35, 0.08, 0.35));
        if (overlapsStaticCollider(bounds)) continue;
        if (parkedHeroBounds.some((other) => other.intersectsBox(bounds))) continue;

        // Confirm both door-side pedestrian zones are usable. This prevents a car
        // from technically clearing the pylon while still trapping the player on exit.
        const side = new THREE.Vector3(Math.cos(bay.rotationY), 0, -Math.sin(bay.rotationY));
        const leftExit = mesh.position.clone().addScaledVector(side, -3.15);
        const rightExit = mesh.position.clone().addScaledVector(side, 3.15);
        const leftSafe = collisionSystem.findSafePositionOnLevel(leftExit, 0.72, 2.0, 0.9, 1.35);
        const rightSafe = collisionSystem.findSafePositionOnLevel(rightExit, 0.72, 2.0, 0.9, 1.35);
        if (!leftSafe || !rightSafe) continue;

        finalBounds = bounds;
        break;
      }

      // Authored bays are expected to pass the checks above. Keep a deterministic
      // same-floor fallback rather than ever asking for the topmost surface.
      if (!finalBounds) {
        const ground = collisionSystem.getGroundHeightNear(bay.pos.x, bay.pos.z, bay.pos.y + 0.25, bay.pos.y, 0.9, 2.5);
        mesh.position.set(bay.pos.x, ground + 0.08, bay.pos.z);
        mesh.updateMatrixWorld(true);
        finalBounds = new THREE.Box3().setFromObject(mesh).expandByVector(new THREE.Vector3(0.35, 0.08, 0.35));
        console.warn(`[Garage] Could not find fully clear parking for ${bay.name}; using authored same-floor bay.`);
      }

      parkedHeroBounds.push(finalBounds.clone());
      scene.add(mesh);
      const tuning = heroTuning[bay.type] ?? { maxSpeed: 100, acceleration: 38 };
      vehicles.push({
        id: `hero_car_${idx}`,
        type: bay.type,
        name: bay.name,
        mesh,
        position: mesh.position.clone(),
        yaw: bay.rotationY,
        speed: 0,
        maxSpeed: tuning.maxSpeed,
        acceleration: tuning.acceleration,
        isHeroCar: true,
        inUse: false,
        isOccupied: false,
        damage: 0,
      });
    });

    // Airport public car park ---------------------------------------------------
    // Use the authored bay centres from airport.ts rather than scattering decorative
    // cars by eye.  These are ordinary unoccupied vehicles: they cost no autonomous
    // traffic update while parked, but still participate in the normal shared vehicle
    // collision/entry system if the player walks up and takes one.  Occupancy stays
    // intentionally below 60% with irregular gaps so the lot reads as a real airport
    // car park rather than a perfectly-filled showroom grid.
    const airportParkingPlan: Array<{
      row: number; column: number; type: 'traffic_sedan' | 'traffic_convertible';
      color: number; xJitter: number; zJitter: number; yawJitter: number;
    }> = [
      { row: 0, column: 1, type: 'traffic_sedan',       color: 0xe7e7e2, xJitter: -0.12, zJitter:  0.10, yawJitter: -0.018 },
      { row: 0, column: 2, type: 'traffic_sedan',       color: 0x2c3137, xJitter:  0.18, zJitter: -0.06, yawJitter:  0.012 },
      { row: 0, column: 4, type: 'traffic_sedan',       color: 0x6c747c, xJitter: -0.20, zJitter:  0.04, yawJitter:  0.020 },
      { row: 0, column: 5, type: 'traffic_convertible', color: 0x345f91, xJitter:  0.10, zJitter: -0.12, yawJitter: -0.015 },
      { row: 0, column: 7, type: 'traffic_sedan',       color: 0x8f2624, xJitter:  0.16, zJitter:  0.08, yawJitter:  0.008 },
      { row: 0, column: 9, type: 'traffic_sedan',       color: 0xd8d5cf, xJitter: -0.08, zJitter: -0.05, yawJitter: -0.010 },
      { row: 1, column: 0, type: 'traffic_sedan',       color: 0x1e2833, xJitter:  0.14, zJitter:  0.05, yawJitter:  0.014 },
      { row: 1, column: 2, type: 'traffic_sedan',       color: 0xb4b7b8, xJitter: -0.16, zJitter: -0.10, yawJitter: -0.020 },
      { row: 1, column: 3, type: 'traffic_sedan',       color: 0x3c5f45, xJitter:  0.08, zJitter:  0.12, yawJitter:  0.011 },
      { row: 1, column: 6, type: 'traffic_convertible', color: 0xc7a63b, xJitter: -0.10, zJitter: -0.04, yawJitter: -0.013 },
      { row: 1, column: 8, type: 'traffic_sedan',       color: 0x4a4d53, xJitter:  0.20, zJitter:  0.09, yawJitter:  0.016 },
      { row: 2, column: 1, type: 'traffic_sedan',       color: 0xf0eee9, xJitter:  0.10, zJitter: -0.08, yawJitter: -0.011 },
      { row: 2, column: 3, type: 'traffic_sedan',       color: 0x375879, xJitter: -0.14, zJitter:  0.11, yawJitter:  0.019 },
      { row: 2, column: 5, type: 'traffic_sedan',       color: 0x7b2e31, xJitter:  0.16, zJitter: -0.06, yawJitter: -0.017 },
      { row: 2, column: 6, type: 'traffic_sedan',       color: 0x9b9da0, xJitter: -0.08, zJitter:  0.05, yawJitter:  0.009 },
      { row: 2, column: 8, type: 'traffic_sedan',       color: 0x25272a, xJitter:  0.12, zJitter: -0.11, yawJitter: -0.014 },
      { row: 2, column: 9, type: 'traffic_sedan',       color: 0xc9c3b9, xJitter: -0.18, zJitter:  0.07, yawJitter:  0.012 },
    ];

    airportParkingPlan.forEach((plan, index) => {
      const bay = airport.parkingBays.find((candidate) =>
        candidate.row === plan.row && candidate.column === plan.column
      );
      if (!bay) return;

      const mesh = createVehicleModel(plan.type, plan.color);
      const yaw = bay.yaw + plan.yawJitter;
      const x = bay.position.x + plan.xJitter;
      const z = bay.position.z + plan.zJitter;
      const ground = collisionSystem.getGroundHeightNear(x, z, bay.position.y + 0.6, bay.position.y, 0.9, 2.2);
      mesh.position.set(x, ground + 0.015, z);
      mesh.rotation.y = yaw;
      mesh.userData.vehicleId = `airport_parked_car_${index}`;
      mesh.userData.airportParkedCar = true;
      scene.add(mesh);

      vehicles.push({
        id: `airport_parked_car_${index}`,
        type: plan.type,
        modelType: plan.type,
        name: plan.type === 'traffic_convertible' ? 'Airport Convertible' : 'Airport Parked Car',
        mesh,
        position: mesh.position.clone(),
        yaw,
        speed: 0,
        maxSpeed: plan.type === 'traffic_convertible' ? 44 : 34,
        acceleration: plan.type === 'traffic_convertible' ? 24 : 18,
        weight: 1.0,
        inUse: false,
        isOccupied: false,
        damage: 0,
        wrecked: false,
      });
    });

    const trafficManager = new TrafficManager(scene, collisionSystem, isOpenRiverWater);
    vehicles.push(...trafficManager.vehicles);

    // Driveable river boat parked beside the public dock. It participates in the
    // normal E-to-enter vehicle flow but uses water physics instead of road physics.
    const riverBoatMesh = createRiverBoatModel();
    riverBoatMesh.position.set(27.5, 0.18, 55);
    riverBoatMesh.rotation.y = 0;
    scene.add(riverBoatMesh);
    vehicles.push({
      id: 'river_boat_1',
      type: 'river_boat',
      name: 'Springfield River Boat',
      mesh: riverBoatMesh,
      position: riverBoatMesh.position.clone(),
      yaw: 0,
      speed: 0,
      maxSpeed: 30,
      acceleration: 15,
      inUse: false,
      isOccupied: false,
      damage: 0,
      wrecked: false,
    });
    npcManager.setAquaticDynamicObstacles([
      {
        // Reference the live mesh position so no per-frame obstacle array/allocation
        // is needed while the player drives the boat around the river.
        position: riverBoatMesh.position,
        radius: 3.85,
        height: 3.6,
        enabled: () => riverBoatMesh.visible,
      },
    ]);

    const worldInteractions = new WorldInteractionManager(
      scene,
      collisionSystem,
      particles,
      npcManager,
      allDestructibles,
      (count) => setTreesGrownCount(count)
    );
    worldInteractions.loadGrownTrees(loadedSave.grownTrees ?? []);
    setTreesGrownCount(worldInteractions.grownTrees.length);

    // Downed NPC recovery has to account for BOTH kickable props and vehicles. Props
    // are gently pushed through WorldInteractionManager; cars remain authoritative to
    // their own vehicle/traffic systems, so NPCs roll/crawl away from them instead.
    npcManager.setRecoveryDynamicBlockerHandlers(
      (position, radius, height) => {
        const propProbe = worldInteractions.probeNPCRecoveryBlockers(position, radius, height);
        const escape = propProbe.escapeDirection?.clone() ?? new THREE.Vector3();
        let blockerCount = propProbe.blockerCount;
        const charTop = position.y + height;

        const seenVehicleMeshes = new Set<THREE.Object3D>();
        const addVehicleBlocker = (mesh: THREE.Object3D, fallbackYaw = mesh.rotation.y) => {
          if (!mesh.visible || seenVehicleMeshes.has(mesh)) return;
          seenVehicleMeshes.add(mesh);
          // Cheap root-distance gate before the more expensive rendered Box3. Recovery
          // probes run only for downed NPCs, but this keeps large traffic populations cheap.
          const rootDx = mesh.position.x - position.x;
          const rootDz = mesh.position.z - position.z;
          if (rootDx * rootDx + rootDz * rootDz > 12 * 12) return;
          const box = new THREE.Box3().setFromObject(mesh);
          if (!Number.isFinite(box.min.x) || charTop < box.min.y - 0.05 || position.y > box.max.y + 0.05) return;
          const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
          const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
          let dx = position.x - closestX;
          let dz = position.z - closestZ;
          const distSq = dx * dx + dz * dz;
          if (distSq > (radius + 0.05) * (radius + 0.05)) return;

          blockerCount++;
          if (distSq < 0.000001) {
            const center = box.getCenter(new THREE.Vector3());
            dx = position.x - center.x;
            dz = position.z - center.z;
            if (dx * dx + dz * dz < 0.000001) {
              dx = Math.cos(fallbackYaw);
              dz = -Math.sin(fallbackYaw);
            }
          }
          const len = Math.hypot(dx, dz) || 1;
          escape.x += dx / len;
          escape.z += dz / len;
        };

        for (const vehicle of vehicles) addVehicleBlocker(vehicle.mesh, vehicle.mesh.rotation.y);
        for (const vehicle of trafficManager.vehicles) addVehicleBlocker(vehicle.mesh, vehicle.mesh.rotation.y);
        for (const cop of policeAIs) addVehicleBlocker(cop.mesh, cop.yaw);

        if (escape.lengthSq() > 0.0001) escape.normalize();
        return {
          blocked: blockerCount > 0,
          blockerCount,
          escapeDirection: blockerCount > 0 ? escape : undefined,
        };
      },
      (position, radius, height, strength) =>
        worldInteractions.nudgeNPCRecoveryBlockers(position, radius, height, strength)
    );

    const switchAnimator = new PokemonSwitchAnimator(scene, particles);

    const engine: EngineState = {
      scene,
      camera,
      renderer,
      collisionSystem,
      particles,
      npcManager,
      ashBattle,
      switchAnimator,
      trafficManager,
      worldInteractions,
      footballManager,
      arcadeBuilding,
      playerMesh,
      playerMovement,
      currentPokemonId: loadedSave.currentPokemon,
      hasChosenStarter: loadedSave.hasChosenStarter,
      activeCarPhysics: null,
      activeVehicle: null,
      activeAircraft: null,
      aircraftController: null,
      freeAircraftControllers: new Map(),
      parachuteController: null,
      airportAircraft: airport.aircraft,
      vehicles,
      policeAIs,
      roadblocks,
      destructibles: allDestructibles,
      grassPatches: allPatches,
      doors: allDoors,
      cameraAngle: loadedSave.hasChosenStarter ? loadedSave.playerRotationY : OAK_LAB_START.yaw,
      cameraPitch: loadedSave.hasChosenStarter ? 0.35 : OAK_LAB_START.cameraPitch,
      cameraDistance: loadedSave.hasChosenStarter ? 6.5 : OAK_LAB_START.cameraDistance,
      cameraTargetDistance: loadedSave.hasChosenStarter ? 6.5 : OAK_LAB_START.cameraDistance,
      keys: {},
      attackTimer: 0,
      specialTimer: 0,
      specialCooldown: 0,
      specialDamageCooldown: 0,
      specialCrimeCooldown: 0,
      lastCrimeAt: performance.now() * 0.001,
      lastWantedDecayAt: performance.now() * 0.001,
      lastRoadblockLevel: 0,
      playerInvulnerableUntil: 0,
      lastUiUpdate: 0,
      cellDoorOpen: false,
      cellDoorTargetRotation: 0.35,
      autosaveElapsed: 0,
      cameraShake: 0,
      healingActive: false,
      healingTimer: 0,
      healingBall: null,
      wantedHeat: 0,
      hitAndRunActive: false,
      hitAndRunEscapeTimer: 0,
      vehicleEntryActive: false,
      vehicleEntryTimer: 0,
      vehicleEntryDuration: 0,
      pendingVehicle: null,
      vehicleExitTumbleTimer: 0,
      vehicleExitTumbleDuration: 0,
      vehicleExitTumbleSpinX: 0,
      vehicleExitTumbleSpinZ: 0,
      coastingVehicles: [],
      lastRoadblockAt: 0,
      lastRoadblockPos: null,
      jailGuardAttackCooldown: 0,
      trainRideActive: false,
      trainRideLocalPosition: new THREE.Vector3(0, goldenrod.trainService.trainInteriorFloorY, 0),
      trainRideLastPassenger: -1,
      trainRideJumpOffset: 0,
      trainRideVerticalVelocity: 0,
      trainRideJumpLatch: false,
      elevatorRideActive: false,
      elevatorRideDestination: null,
      elevatorRideLift: null,
      lastSafePosition: rawStart.clone(),
      lastSafeYaw: loadedSave.hasChosenStarter ? loadedSave.playerRotationY : OAK_LAB_START.yaw,
      resetPosPosition: rawStart.clone(),
      resetPosYaw: loadedSave.hasChosenStarter ? loadedSave.playerRotationY : OAK_LAB_START.yaw,
      resetPosLockedByTravel: false,
      safePositionTimer: 0,
      deathSequenceActive: false,
      deathSequenceTimer: 0,
      deathSequenceStage: 'none',
      aircraftDeathAftermath: null,
      hospitalRecoveryActive: false,
      hospitalRecoveryTimer: 0,
      hospitalRecoveryLastHp: 0,
      playerGaragePos: goldenrod.playerGarage.pos.clone(),
      ashHostileActive: false,
      ashHostilePhase: 'none',
      ashHostileTimer: 0,
      ashHostileBall: null,
      ashHostileRecallEffect: null,
      milesInteractionActive: false,
      milesInteractionTimer: 0,
      milesInteractionStart: null,
      milesInteractionTarget: null,
      milesInteractionSaidHey: false,
      toothlessMounting: false,
      toothlessMounted: false,
      toothlessMountTimer: 0,
      toothlessMountStart: null,
      toothlessFlightSpeed: 0,
      toothlessVerticalSpeed: 0,
      toothlessYaw: 0,
      charizardFlightActive: false,
      charizardFlightSpeed: 0,
      charizardVerticalSpeed: 0,
      charizardSpaceWasHeld: false,
      vehicleSurfaceSupport: null,
      sittableSeats,
      seated: false,
      activeSeat: null,
      seatStartPosition: null,
      seatTargetPosition: null,
      seatStandPosition: null,
      seatYaw: 0,
      seatTransitionTimer: 0,
      seatTransitionDuration: 0.34,
      grabbedNpcId: null,
      grabLiftTimer: 0,
      grabLiftDuration: 0.34,
      grabStartPosition: null,
      grabThrowPoseTimer: 0,
      grabThrowQueued: false,
      grabThrowLockoutUntil: 0,
    };
    engineRef.current = engine;

    const buildSave = (): GameSaveState => {
      const e = engineRef.current;
      // Never persist an airborne Toothless rider as the raw player spawn point.
      // Reloading should resume from the most recent safe ground checkpoint rather
      // than materialising the Pokémon tens of metres in the air without the dragon.
      const pos = e && (e.deathSequenceActive || e.hospitalRecoveryActive || e.toothlessMounted || e.toothlessMounting || e.charizardFlightActive || !!e.activeAircraft || !!e.parachuteController)
        ? e.lastSafePosition
        : (e?.activeCarPhysics?.position ?? e?.playerMovement.position ?? rawStart);
      return {
        hasChosenStarter: hasChosenStarterRef.current,
        currentPokemon: selectedPokemonRef.current,
        unlockedGeodude: unlockedGeodudeRef.current,
        ashDefeated: !!e?.ashBattle.state.allDefeated,
        treesGrown: e?.worldInteractions.grownTrees.filter((t) => !t.destroyed).length ?? 0,
        playerPos: { x: pos.x, y: pos.y, z: pos.z },
        playerRotationY: (e?.activeAircraft || e?.parachuteController) ? e.lastSafeYaw : (e?.activeCarPhysics?.yaw ?? e?.playerMovement.yaw ?? 0),
        grownTrees: e?.worldInteractions.getGrownTreePositions() ?? [],
        worldProgress: {
          ...worldProgressRef.current,
          visitedLandmarks: [...worldProgressRef.current.visitedLandmarks],
          completedGoals: [...worldProgressRef.current.completedGoals],
        },
      };
    };
    const saveNow = () => {
      if (worldRestartPendingRef.current) return;
      saveGame(buildSave());
    };
    saveNowRef.current = saveNow;

    const WORLD_GOAL_IDS: WorldGoalId[] = [
      'goldenrod_explorer',
      'green_thumb',
      'interstate_road_trip',
      'springfield_heat',
      'jailbreak',
      'ash_showdown',
    ];
    const TOUR_LANDMARK_IDS = [
      'goldenrod_radio_tower',
      'goldenrod_center',
      'goldenrod_dept_store',
      'goldenrod_gym',
    ];

    const isGoalComplete = (id: WorldGoalId) => worldProgressRef.current.completedGoals.includes(id);

    const completeWorldGoal = (id: WorldGoalId, message: string, announce = true) => {
      if (isGoalComplete(id)) return false;
      worldProgressRef.current.completedGoals.push(id);
      worldProgressRef.current.completedGoals = [...new Set(worldProgressRef.current.completedGoals)];
      if (announce) {
        showTemporaryNotification('World Goal Complete', message);
        playSoundEffect('fanfare');
      }
      window.setTimeout(() => saveNowRef.current(), 20);
      return true;
    };

    const getWorldGoalView = (): WorldGoalView => {
      const progress = worldProgressRef.current;
      const completedCount = progress.completedGoals.length;
      const base = { completedCount, totalCount: WORLD_GOAL_IDS.length };

      if (completedCount >= WORLD_GOAL_IDS.length) {
        return {
          id: 'world_complete',
          title: 'Open World Complete',
          description: 'All six world goals finished. Keep causing chaos.',
          current: WORLD_GOAL_IDS.length,
          target: WORLD_GOAL_IDS.length,
          completed: true,
          ...base,
        };
      }

      if (!isGoalComplete('goldenrod_explorer')) {
        const current = TOUR_LANDMARK_IDS.filter((id) => progress.visitedLandmarks.includes(id)).length;
        return {
          id: 'goldenrod_explorer',
          title: 'Goldenrod Explorer',
          description: `Visit Radio Tower, Pokémon Center, Dept. Store and Gym (${current}/4).`,
          current,
          target: 4,
          completed: false,
          ...base,
        };
      }

      if (!isGoalComplete('green_thumb')) {
        const current = Math.min(3, engine.worldInteractions.grownTrees.filter((tree) => !tree.destroyed).length);
        return {
          id: 'green_thumb',
          title: 'Green Thumb',
          description: `Use Poliwag to grow three full trees (${current}/3).`,
          current,
          target: 3,
          completed: false,
          ...base,
        };
      }

      if (!isGoalComplete('interstate_road_trip')) {
        return {
          id: 'interstate_road_trip',
          title: 'Interstate Road Trip',
          description: progress.roadTripOrigin
            ? `Drive all the way from ${progress.roadTripOrigin === 'goldenrod' ? 'Goldenrod' : 'Springfield'} to the other city.`
            : 'Enter a car in Goldenrod or Springfield, then drive to the other city.',
          current: progress.roadTripOrigin ? 1 : 0,
          target: 2,
          completed: false,
          ...base,
        };
      }

      if (!isGoalComplete('springfield_heat')) {
        return {
          id: 'springfield_heat',
          title: 'Hit & Run Escape',
          description: progress.chaosEscapeArmed
            ? 'HIT & RUN triggered. Escape the police pursuit.'
            : `Fill the Hit & Run meter to 100% (${Math.round(engine.wantedHeat)}%).`,
          current: progress.chaosEscapeArmed ? (engine.hitAndRunActive ? 1 : 2) : Math.min(1, engine.wantedHeat / 100),
          target: 2,
          completed: false,
          ...base,
        };
      }

      if (!isGoalComplete('jailbreak')) {
        return {
          id: 'jailbreak',
          title: 'The Worst Jail Ever',
          description: progress.jailbreakActive
            ? 'Open the suspiciously unlocked cell and walk out past Wiggum and Lou.'
            : 'Get busted by Springfield Police, then escape their jail.',
          current: progress.jailbreakActive ? 1 : 0,
          target: 2,
          completed: false,
          ...base,
        };
      }

      return {
        id: 'ash_showdown',
        title: 'Ash Showdown',
        description: 'Find Ash at 742 Evergreen Terrace and defeat his ridiculous seven-character team.',
        current: engine.ashBattle.state.allDefeated ? 1 : 0,
        target: 1,
        completed: false,
        ...base,
      };
    };

    const updateWorldProgress = (activePos: THREE.Vector3) => {
      const progress = worldProgressRef.current;

      for (const id of TOUR_LANDMARK_IDS) {
        if (progress.visitedLandmarks.includes(id)) continue;
        const landmark = allLandmarks.find((item) => item.id === id);
        if (!landmark) continue;
        if (Math.hypot(activePos.x - landmark.x, activePos.z - landmark.z) <= 17) {
          progress.visitedLandmarks.push(id);
        }
      }
      if (TOUR_LANDMARK_IDS.every((id) => progress.visitedLandmarks.includes(id))) {
        completeWorldGoal('goldenrod_explorer', 'Goldenrod explored! You found the four major city landmarks.');
      }

      const grownCount = engine.worldInteractions.grownTrees.filter((tree) => !tree.destroyed).length;
      if (grownCount >= 3) {
        completeWorldGoal('green_thumb', 'Three full trees grown. Goldenrod council is confused but impressed.');
      }

      if (engine.activeVehicle) {
        const side: 'goldenrod' | 'springfield' | null =
          activePos.x >= 90 ? 'goldenrod' : activePos.x <= -90 ? 'springfield' : null;
        if (side && !progress.roadTripOrigin) {
          progress.roadTripOrigin = side;
        } else if (side && progress.roadTripOrigin && side !== progress.roadTripOrigin) {
          completeWorldGoal('interstate_road_trip', 'You drove between Goldenrod and Springfield without fast travel.');
          progress.roadTripOrigin = null;
        }
      } else if (!isGoalComplete('interstate_road_trip')) {
        // The road-trip challenge requires one continuous drive. Getting out cancels it.
        progress.roadTripOrigin = null;
      }

      // World goal follows the player-facing Hit & Run system now: fill the meter,
      // trigger the full pursuit, then actually escape it. There are no intermediate stars.
      if (engine.hitAndRunActive) {
        progress.maxWantedReached = 5;
        progress.chaosEscapeArmed = true;
      }
      if (progress.chaosEscapeArmed && !engine.hitAndRunActive && wantedRef.current === 0) {
        completeWorldGoal('springfield_heat', 'HIT & RUN triggered and escaped. Chief Wiggum has already forgotten your description.');
        progress.chaosEscapeArmed = false;
      }

      const escapeGuard = engine.npcManager.getNPCById('jail_escape_guard');
      const guardDefeated = !escapeGuard || escapeGuard.state === 'knocked_out' || !!escapeGuard.mesh.userData.guardDefeated;
      if (progress.jailbreakActive && guardDefeated && engine.cellDoorOpen && activePos.distanceTo(springfield.jail.exitPos) <= 5.5) {
        progress.jailbreakActive = false;
        progress.jailEscapes += 1;
        completeWorldGoal('jailbreak', 'You knocked out the prison guard and escaped Springfield Police Station.');
      }

      if (engine.ashBattle.state.allDefeated) {
        completeWorldGoal('ash_showdown', 'Ash and his seven completely legal Pokémon were defeated.', false);
      }
    };

    setWorldGoal(getWorldGoalView());

    if (!loadedSave.hasChosenStarter) {
      setActiveDialogue({
        speaker: 'Professor Oak',
        text: 'Welcome! Walk up to Pikachu, Charmander or Poliwag, press E, then confirm your choice!',
      });
    }

    const syncWantedHeat = (heat: number, markCrime = false) => {
      // The official Ash challenge is a protected gameplay bubble. Battle-required
      // attacks never add chaos and the meter stays empty until the challenge ends.
      if (engine.ashBattle.state.isActive) heat = 0;
      // The same meter now drives both phases of Hit & Run: it fills to 100 before
      // activation, then visibly drains back toward zero during the pursuit.
      const clampedHeat = THREE.MathUtils.clamp(heat, 0, 100);
      wantedHeatRef.current = clampedHeat;
      engine.wantedHeat = clampedHeat;
      if (markCrime) {
        engine.lastCrimeAt = performance.now() * 0.001;
        engine.lastWantedDecayAt = engine.lastCrimeAt;
      }
    };

    const removePolicePursuitObjects = () => {
      for (const ai of engine.policeAIs) {
        scene.remove(ai.mesh);
        disposeTransientObject3D(ai.mesh);
        if (ai.officerMesh) {
          scene.remove(ai.officerMesh);
          disposeTransientObject3D(ai.officerMesh);
        }
      }
      engine.policeAIs.length = 0;
      for (const block of engine.roadblocks) {
        scene.remove(block.mesh);
        disposeTransientObject3D(block.mesh);
      }
      engine.roadblocks.length = 0;
      engine.lastRoadblockPos = null;
      engine.lastRoadblockLevel = 0;
      soundManager.setSiren(false);
    };

    const clearPolicePursuit = (resetMeter = true, escaped = false) => {
      removePolicePursuitObjects();
      engine.hitAndRunActive = false;
      engine.hitAndRunEscapeTimer = 0;
      wantedRef.current = 0;
      setWantedLevel(0);
      setHitAndRunActive(false);
      if (resetMeter || escaped) {
        wantedHeatRef.current = 0;
        engine.wantedHeat = 0;
        setWantedHeat(0);
      }
      if (escaped) {
        showTemporaryNotification('HIT & RUN', 'Escaped! The meter cooled to 0% and the police have ended the pursuit.');
      }
    };

    const triggerHitAndRun = () => {
      if (engine.hitAndRunActive || engine.ashBattle.state.isActive || bustedRef.current) return;
      engine.hitAndRunActive = true;
      engine.hitAndRunEscapeTimer = 0;
      wantedHeatRef.current = 100;
      engine.wantedHeat = 100;
      wantedRef.current = 5;
      setWantedHeat(100);
      setWantedLevel(5);
      setHitAndRunActive(true);
      setHitAndRunWarning(true);
      playSoundEffect('hitRun');
      soundManager.setSiren(true);
      // The large warning is deliberately brief; the meter stays red for the chase.
      window.setTimeout(() => setHitAndRunWarning(false), 2200);
    };

    // Existing gameplay calls use relative incident weights. A normal kick is a
    // small rise; repeated hits, vehicle impacts and destruction accumulate faster.
    // Crucially, none of this can spawn police until the meter reaches 100%.
    const addWanted = (amount = 1) => {
      if (amount <= 0 || engine.ashBattle.state.isActive) return;
      const nextHeat = wantedHeatRef.current + amount * 9;
      syncWantedHeat(nextHeat, true);
      setWantedHeat(wantedHeatRef.current);
      // Police are never created while the meter is merely filling. Only crossing
      // the 100% threshold starts the pursuit. Once active, further chaos simply
      // tops the same meter back up and delays escape instead of spawning a second chase.
      if (!engine.hitAndRunActive && wantedHeatRef.current >= 100) triggerHitAndRun();
    };

    // One shared rule for direct player-on-NPC attacks. Kick and body slam both
    // call this, so they cannot silently drift into different Hit & Run behaviour.
    const playerNpcAttackWantedWeight = (npc: NPC): number => {
      if (npc.id === 'jail_escape_guard') return 0;
      return engine.currentPokemonId === 'geodude_legs' || engine.currentPokemonId === 'geodude' ? 2 : 1;
    };

    const setWanted = (value: number) => {
      const next = THREE.MathUtils.clamp(Math.round(value), 0, 5);
      if (next <= 0) {
        clearPolicePursuit(true, false);
        return;
      }
      // Compatibility path for any legacy script that explicitly requests maximum
      // wanted. Intermediate values intentionally only raise meter heat, never police.
      if (next >= 5) {
        syncWantedHeat(100, false);
        triggerHitAndRun();
      } else {
        syncWantedHeat(Math.max(engine.wantedHeat, next * 18), false);
        setWantedHeat(engine.wantedHeat);
      }
    };

    const getActivePosition = () => {
      const e = engineRef.current;
      if (!e) return new THREE.Vector3();

      // During an aircraft-building death the player is intentionally detached from
      // the crashed plane and parked at the last safe on-foot checkpoint. That hidden
      // checkpoint must NOT become the render/LOD anchor for the aftermath cinematic:
      // doing so can unload the district containing the actual crash (for example the
      // Twin Towers) and distance-cull the wreck while the camera is still looking at it.
      // Keep all spatial streaming/culling/radar decisions centred on the viewed wreck
      // (or the recorded impact point if the wreck cannot be resolved) until the normal
      // hospital transition begins.
      if (e.deathSequenceActive && e.aircraftDeathAftermath) {
        const aftermathPlane = e.airportAircraft.find(
          (plane) => plane.id === e.aircraftDeathAftermath!.aircraftId
        );
        return aftermathPlane?.position ?? e.aircraftDeathAftermath.impactPoint;
      }

      return e.activeAircraft?.position ?? e.activeCarPhysics?.position ?? e.playerMovement.position;
    };

    const findNearbySeat = (pos: THREE.Vector3, range = 2.35): THREE.Object3D | null => {
      let best: THREE.Object3D | null = null;
      let bestDistance = range;
      for (const seat of engine.sittableSeats) {
        if (!seat.visible) continue;
        const pose = getSeatWorldPose(seat);
        const planar = Math.hypot(pose.position.x - pos.x, pose.position.z - pos.z);
        if (planar >= bestDistance || Math.abs(pose.position.y - pos.y) > 2.2) continue;
        best = seat;
        bestDistance = planar;
      }
      return best;
    };

    const standUpFromSeat = () => {
      const e = engineRef.current;
      if (!e || !e.seated) return;
      const fallback = e.seatStandPosition?.clone() ?? e.lastSafePosition.clone();
      fallback.y = e.collisionSystem.getGroundHeightNear(fallback.x, fallback.z, e.playerMovement.position.y, fallback.y, 1.5, 4.5);
      const safe = e.collisionSystem.findSafePositionOnLevel(fallback, 0.68, 1.9, 3.0, 1.5) ?? fallback;
      e.playerMovement.position.copy(safe);
      e.playerMovement.velocity.set(0, 0, 0);
      e.playerMovement.isGrounded = true;
      e.playerMovement.yaw = e.seatYaw;
      e.playerMesh.position.copy(safe);
      e.playerMesh.rotation.set(0, e.seatYaw, 0);
      clearSeatState(e);
      recordSafeCheckpoint(e, safe, e.playerMovement.yaw);
      playSoundEffect('click');
    };

    const startSitting = (seat: THREE.Object3D) => {
      const e = engineRef.current;
      if (!e || e.seated || e.grabbedNpcId || e.activeVehicle || e.trainRideActive || e.elevatorRideActive || e.milesInteractionActive || e.toothlessMounted || e.toothlessMounting) return;
      const pose = getSeatWorldPose(seat);
      const target = pose.position.clone();
      target.y = e.collisionSystem.getGroundHeightNear(target.x, target.z, e.playerMovement.position.y, e.playerMovement.position.y, 1.6, 4.5);

      // Standing up happens in front of the seat. If that exact spot is blocked,
      // try the two sides before falling back to the player's last safe point.
      const side = new THREE.Vector3(pose.forward.z, 0, -pose.forward.x);
      const standCandidates = [
        target.clone().addScaledVector(pose.forward, 1.35),
        target.clone().addScaledVector(pose.forward, 1.05).addScaledVector(side, 0.8),
        target.clone().addScaledVector(pose.forward, 1.05).addScaledVector(side, -0.8),
      ];
      let standPosition: THREE.Vector3 | null = null;
      for (const candidate of standCandidates) {
        candidate.y = e.collisionSystem.getGroundHeightNear(candidate.x, candidate.z, target.y, target.y, 1.5, 4.0);
        const safe = e.collisionSystem.findSafePositionOnLevel(candidate, 0.68, 1.9, 1.4, 1.2);
        if (safe) { standPosition = safe; break; }
      }
      if (!standPosition) standPosition = e.lastSafePosition.clone();

      e.seated = true;
      e.activeSeat = seat;
      e.seatStartPosition = e.playerMovement.position.clone();
      e.seatTargetPosition = target;
      e.seatStandPosition = standPosition;
      e.seatYaw = pose.yaw;
      e.seatTransitionTimer = 0;
      e.playerMovement.velocity.set(0, 0, 0);
      e.playerMovement.isGrounded = true;
      e.vehicleSurfaceSupport = null;
      setInteractionPrompt('[E] Stand up');
      playSoundEffect('click');
    };

    const handleGrab = () => {
      const e = engineRef.current;
      if (!e || !e.hasChosenStarter || e.deathSequenceActive || e.hospitalRecoveryActive || e.healingActive || e.switchAnimator.active) return;

      if (e.grabbedNpcId) {
        // Prevent accidental instant throw right after grabbing
        if (Date.now() < (e.grabThrowLockoutUntil ?? 0)) return;
        if (!e.grabThrowQueued) {
          e.grabThrowQueued = true;
          e.grabThrowPoseTimer = 0.62;
          e.grabLiftTimer = e.grabLiftDuration;
          playSoundEffect('click');
        }
        return;
      }

      if (e.seated || e.activeVehicle || e.vehicleEntryActive || e.trainRideActive || e.elevatorRideActive || e.toothlessMounted || e.toothlessMounting || e.milesInteractionActive || e.ashBattle.state.isActive) return;
      const forward = new THREE.Vector3(Math.sin(e.playerMovement.yaw), 0, Math.cos(e.playerMovement.yaw));
      const npc = e.npcManager.getNPCInFront(e.playerMovement.position, forward, 3.8, -0.25) ?? e.npcManager.getNearbyNPC(e.playerMovement.position, 3.2);
      if (!npc || !e.npcManager.canPlayerGrab(npc)) {
        showTemporaryNotification('Grab', 'Move closer to any NPC and tap Grab.');
        return;
      }
      if (!e.npcManager.beginPlayerGrab(npc)) return;
      e.grabbedNpcId = npc.id;
      setGrabbedNpcId(npc.id);
      e.grabLiftTimer = 0;
      e.grabStartPosition = npc.mesh.position.clone();
      e.grabThrowQueued = false;
      e.grabThrowPoseTimer = 0;
      e.grabThrowLockoutUntil = Date.now() + 300; // 300ms debounce prevents accidental double-tap throw
      e.playerMovement.velocity.x *= 0.35;
      e.playerMovement.velocity.z *= 0.35;
      playSoundEffect('click');
    };

    const currentForward = () => {
      const e = engineRef.current;
      if (!e) return new THREE.Vector3(0, 0, 1);
      const yaw = e.activeCarPhysics?.yaw ?? e.playerMovement.yaw;
      return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    };

    const endAshHostileEncounter = (showMessage = false) => {
      const e = engineRef.current;
      if (!e) return;
      if (e.ashHostileBall) {
        e.scene.remove(e.ashHostileBall);
        disposeTransientObject3D(e.ashHostileBall);
        e.ashHostileBall = null;
      }
      if (e.ashHostileRecallEffect) {
        e.scene.remove(e.ashHostileRecallEffect);
        disposeTransientObject3D(e.ashHostileRecallEffect);
        e.ashHostileRecallEffect = null;
      }
      const defender = e.npcManager.getNPCById('ash_defender_charizard');
      if (defender) {
        const originalScale = defender.mesh.userData.recallOriginalScale as THREE.Vector3 | undefined;
        if (originalScale) defender.mesh.scale.copy(originalScale);
        delete defender.mesh.userData.recallOriginalScale;
        delete defender.mesh.userData.recallStartPosition;
      }
      e.npcManager.dismissAshDefenderCharizard();
      const ash = springfield.simpsonsHouse.ashMesh;
      const ashArm = ash.getObjectByName('arm_right');
      const heldBall = ash.getObjectByName('held_pokeball');
      if (ashArm) ashArm.rotation.set(0, 0, 0);
      if (heldBall) heldBall.visible = true;
      e.ashHostileActive = false;
      e.ashHostilePhase = 'none';
      e.ashHostileTimer = 0;
      if (showMessage) {
        setActiveDialogue({ speaker: 'Ash Ketchum', text: 'Okay, okay! We can battle properly when you are ready.' });
      }
    };

    const startAshHostileEncounter = () => {
      const e = engineRef.current;
      if (!e || e.ashBattle.state.isActive || e.ashHostileActive || e.deathSequenceActive || e.hospitalRecoveryActive) return;
      e.ashHostileActive = true;
      e.ashHostilePhase = 'throw';
      e.ashHostileTimer = 0;

      const ash = springfield.simpsonsHouse.ashMesh;
      const ball = createPokeBallModel();
      ball.name = 'ash_hostile_pokeball';
      ball.scale.setScalar(0.48);
      const start = ash.position.clone().add(new THREE.Vector3(0.55, 1.55, 0.15));
      const towardPlayer = e.playerMovement.position.clone().sub(ash.position).setY(0);
      if (towardPlayer.lengthSq() < 0.001) towardPlayer.set(0, 0, 1);
      towardPlayer.normalize();
      const end = ash.position.clone().addScaledVector(towardPlayer, 3.0);
      end.y = e.collisionSystem.getGroundHeightNear(end.x, end.z, ash.position.y, 0.12, 1.2, 3.0) + 0.25;
      ball.position.copy(start);
      ball.userData.throwStart = start;
      const ashArm = ash.getObjectByName('arm_right');
      const heldBall = ash.getObjectByName('held_pokeball');
      if (ashArm) { ashArm.rotation.x = -0.95; ashArm.rotation.z = -0.42; }
      if (heldBall) heldBall.visible = false;
      ball.userData.throwEnd = end;
      e.ashHostileBall = ball;
      e.scene.add(ball);
      setActiveDialogue({ speaker: 'Ash Ketchum', text: 'HEY! Charizard, I choose you!' });
      playSoundEffect('click');
    };

    const updateAshHostileEncounter = (dt: number) => {
      const e = engineRef.current;
      if (!e || !e.ashHostileActive) return;
      e.ashHostileTimer += dt;

      if (e.ashHostilePhase === 'throw') {
        const ball = e.ashHostileBall;
        if (!ball) {
          endAshHostileEncounter();
          return;
        }
        const start = ball.userData.throwStart as THREE.Vector3;
        const end = ball.userData.throwEnd as THREE.Vector3;
        const t = THREE.MathUtils.clamp(e.ashHostileTimer / 0.66, 0, 1);
        const ashArm = springfield.simpsonsHouse.ashMesh.getObjectByName('arm_right');
        if (ashArm) {
          // A quick follow-through sells the throw instead of making the ball appear
          // from a completely static Ash pose.
          ashArm.rotation.x = THREE.MathUtils.lerp(-0.95, 0.42, t);
          ashArm.rotation.z = THREE.MathUtils.lerp(-0.42, 0.18, t);
        }
        ball.position.lerpVectors(start, end, t);
        ball.position.y += Math.sin(t * Math.PI) * 2.0;
        ball.rotation.x += dt * 10;
        ball.rotation.z += dt * 7;
        if (t >= 1) {
          e.scene.remove(ball);
          e.ashHostileBall = null;
          const spawn = end.clone();
          spawn.y = e.collisionSystem.getGroundHeightNear(spawn.x, spawn.z, spawn.y, 0.12, 1.2, 3.0);
          const charizard = e.npcManager.spawnAshDefenderCharizard(spawn);
          charizard.mesh.rotation.y = Math.atan2(
            e.playerMovement.position.x - spawn.x,
            e.playerMovement.position.z - spawn.z
          );
          e.particles.emitRecallSpark(spawn.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xff7a22);
          playSoundEffect('fire');
          const ashArm = springfield.simpsonsHouse.ashMesh.getObjectByName('arm_right');
          if (ashArm) ashArm.rotation.set(0, 0, 0);
          e.ashHostilePhase = 'fight';
          e.ashHostileTimer = 0;
        }
        return;
      }

      const charizard = e.npcManager.getNPCById('ash_defender_charizard');
      if (!charizard || !charizard.mesh.visible) {
        endAshHostileEncounter();
        return;
      }

      if (charizard.state === 'knocked_out' || charizard.state === 'defeated' || (charizard.combatHp ?? 1) <= 0 || e.ashHostilePhase === 'recall') {
        if (e.ashHostilePhase !== 'recall') {
          // Free-roam retaliation only: stop every Charizard combat path immediately,
          // but keep the model visible long enough to play an intentional recall.
          e.npcManager.beginAshDefenderRecall();
          e.ashHostilePhase = 'recall';
          e.ashHostileTimer = 0;
          charizard.mesh.userData.recallStartPosition = charizard.mesh.position.clone();
          charizard.mesh.userData.recallOriginalScale = charizard.mesh.scale.clone();

          const ash = springfield.simpsonsHouse.ashMesh;
          const heldBall = ash.getObjectByName('held_pokeball');
          const ashArm = ash.getObjectByName('arm_right');
          if (heldBall) heldBall.visible = true;
          if (ashArm) {
            ashArm.rotation.x = -0.62;
            ashArm.rotation.z = -0.20;
          }

          const effect = new THREE.Group();
          effect.name = 'ash_hostile_recall_effect';
          const outer = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.28, 1, 10, 1, true),
            new THREE.MeshBasicMaterial({
              color: 0xff4f76,
              transparent: true,
              opacity: 0.34,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          );
          outer.name = 'recall_beam_outer';
          const inner = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.085, 1, 8, 1, true),
            new THREE.MeshBasicMaterial({
              color: 0xffd8e4,
              transparent: true,
              opacity: 0.9,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          );
          inner.name = 'recall_beam_inner';
          effect.add(outer, inner);
          e.scene.add(effect);
          e.ashHostileRecallEffect = effect;

          setActiveDialogue({ speaker: 'Ash Ketchum', text: "Charizard, That's enough, return!" });
          playSoundEffect('powerEnergy');
        }

        const recallDuration = 1.55;
        const t = THREE.MathUtils.clamp(e.ashHostileTimer / recallDuration, 0, 1);
        const eased = t * t * (3 - 2 * t);
        const ash = springfield.simpsonsHouse.ashMesh;
        const heldBall = ash.getObjectByName('held_pokeball');
        const ballWorld = new THREE.Vector3();
        if (heldBall) heldBall.getWorldPosition(ballWorld);
        else ballWorld.copy(ash.position).add(new THREE.Vector3(0.5, 1.45, 0.1));

        const startPos = (charizard.mesh.userData.recallStartPosition as THREE.Vector3 | undefined) ?? charizard.mesh.position.clone();
        const originalScale = (charizard.mesh.userData.recallOriginalScale as THREE.Vector3 | undefined) ?? new THREE.Vector3(1, 1, 1);

        // The first half reads as an energy conversion, then Charizard visibly gets
        // pulled toward the ball while shrinking instead of disappearing abruptly.
        const pull = THREE.MathUtils.clamp((t - 0.22) / 0.78, 0, 1);
        const pullEase = pull * pull * (3 - 2 * pull);
        charizard.mesh.position.lerpVectors(startPos, ballWorld, pullEase * 0.94);
        const shrink = THREE.MathUtils.lerp(1, 0.055, eased);
        charizard.mesh.scale.copy(originalScale).multiplyScalar(shrink);
        charizard.mesh.rotation.y += dt * (2.4 + eased * 8.0);

        // Ash visibly tracks the recall instead of freezing after saying the line.
        const ashArm = ash.getObjectByName('arm_right');
        if (ashArm) {
          ashArm.rotation.x = THREE.MathUtils.lerp(-0.62, -0.34, eased);
          ashArm.rotation.z = THREE.MathUtils.lerp(-0.20, -0.06, eased);
        }

        const currentCenter = charizard.mesh.position.clone().add(new THREE.Vector3(0, 1.15 * Math.max(0.08, charizard.mesh.scale.y), 0));
        const beamDir = currentCenter.clone().sub(ballWorld);
        const beamLength = Math.max(0.08, beamDir.length());
        const midpoint = ballWorld.clone().add(currentCenter).multiplyScalar(0.5);
        if (e.ashHostileRecallEffect) {
          e.ashHostileRecallEffect.position.copy(midpoint);
          e.ashHostileRecallEffect.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            beamDir.normalize()
          );
          e.ashHostileRecallEffect.scale.set(1 - eased * 0.45, beamLength, 1 - eased * 0.45);
          const outer = e.ashHostileRecallEffect.getObjectByName('recall_beam_outer') as THREE.Mesh | null;
          const inner = e.ashHostileRecallEffect.getObjectByName('recall_beam_inner') as THREE.Mesh | null;
          if (outer?.material instanceof THREE.MeshBasicMaterial) outer.material.opacity = (1 - t * 0.45) * 0.34;
          if (inner?.material instanceof THREE.MeshBasicMaterial) inner.material.opacity = (1 - t * 0.28) * 0.9;
        }

        // Reuse the pooled particle system: no per-frame particle objects are created.
        e.particles.emitRecallSpark(currentCenter, 0xff4f76);
        if (t > 0.35) {
          const alongBeam = ballWorld.clone().lerp(currentCenter, 0.45 + Math.sin(t * 18) * 0.12);
          e.particles.emitRecallSpark(alongBeam, 0xffd8e4);
        }

        if (t >= 1) {
          // Only now is the defender hidden/reset. The official Ash challenge manager
          // is completely separate and is never touched by this free-roam cleanup.
          endAshHostileEncounter();
        }
        return;
      }

      const ashDistance = e.playerMovement.position.distanceTo(springfield.simpsonsHouse.ashMesh.position);
      const charizardDistance = e.playerMovement.position.distanceTo(charizard.mesh.position);
      if (e.ashHostileTimer > 4.0 && (ashDistance > 48 || charizardDistance > 52)) {
        endAshHostileEncounter(true);
      }
    };

    const startMilesShoulderInteraction = (miles: NPC) => {
      const e = engineRef.current;
      if (!e || e.milesInteractionActive || e.activeVehicle || e.trainRideActive || e.elevatorRideActive || e.deathSequenceActive || e.hospitalRecoveryActive) return;
      const now = performance.now() * 0.001;
      if (now < Number(miles.mesh.userData.milesInteractionCooldownUntil ?? 0)) {
        // Never emit the standalone "hey." outside the authored gesture. The
        // interaction is one cinematic beat: movement + eye contact + arm motion + line.
        return;
      }

      const player = e.playerMovement.position;
      const initialPlayerYaw = e.playerMovement.yaw;
      const forward = new THREE.Vector3(Math.sin(initialPlayerYaw), 0, Math.cos(initialPlayerYaw)).normalize();

      // The interaction is deliberately staged directly in front of the player.
      // We only vary the distance along the player's forward line; we never search
      // sideways because that would recreate the old "Miles standing beside me" bug.
      let target: THREE.Vector3 | null = null;
      for (const distance of [1.45, 1.60, 1.78, 1.95, 2.15]) {
        const candidate = player.clone().addScaledVector(forward, distance);
        candidate.y = e.collisionSystem.getGroundHeightNear(candidate.x, candidate.z, player.y, player.y, 1.0, 2.5);
        if (e.collisionSystem.canOccupy(candidate, 0.43, 1.85)) {
          target = candidate;
          break;
        }
      }

      // Never move Miles to a strange side angle or through scenery just to force
      // the cinematic. If there is no safe face-to-face position, leave him where he
      // is and allow the player to try again from a clearer spot.
      if (!target) {
        // If there is no safe face-to-face mark, do not fall back to a detached
        // dialogue bubble. The player can reposition and trigger the full action.
        return;
      }

      // Validate the entire walk-in path, not only the destination, so Miles never
      // glides through a wall, counter or prop on his way into the cinematic mark.
      let approachPathClear = true;
      for (let i = 1; i <= 8; i++) {
        const sample = miles.mesh.position.clone().lerp(target, i / 8);
        sample.y = e.collisionSystem.getGroundHeightNear(sample.x, sample.z, miles.mesh.position.y, miles.mesh.position.y, 1.0, 2.5);
        if (!e.collisionSystem.canOccupy(sample, 0.40, 1.82)) {
          approachPathClear = false;
          break;
        }
      }
      if (!approachPathClear) {
        // Keep the line inseparable from the gesture. A blocked cinematic should
        // fail quietly rather than playing "hey." as an unrelated notification.
        return;
      }

      e.milesInteractionActive = true;
      e.milesInteractionTimer = 0;
      e.milesInteractionStart = miles.mesh.position.clone();
      e.milesInteractionTarget = target.clone();
      e.milesInteractionSaidHey = false;
      miles.mesh.userData.specialInteractionActive = true;
      miles.mesh.userData.milesInteractionStartYaw = miles.mesh.rotation.y;
      miles.mesh.userData.milesInteractionPlayerStartYaw = initialPlayerYaw;
      miles.state = 'idle';
      miles.kickedVelocity?.set(0, 0, 0);
      e.playerMovement.velocity.set(0, 0, 0);
    };

    const updateMilesShoulderInteraction = (dt: number) => {
      const e = engineRef.current;
      if (!e || !e.milesInteractionActive) return;
      const miles = e.npcManager.getNPCById('cameo_miles');
      if (!miles || !e.milesInteractionStart || !e.milesInteractionTarget) {
        e.milesInteractionActive = false;
        return;
      }

      e.milesInteractionTimer += dt;
      const t = e.milesInteractionTimer;
      const smooth = (v: number) => {
        const c = THREE.MathUtils.clamp(v, 0, 1);
        return c * c * (3 - 2 * c);
      };
      const dampAngle = (current: number, target: number, lambda: number) => {
        const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
        return current + delta * (1 - Math.exp(-lambda * dt));
      };

      // Freeze player translation during the short cinematic, but rotate both
      // characters smoothly so they are visibly looking straight at each other.
      e.playerMovement.velocity.set(0, 0, 0);

      const approachEnd = 0.95;
      const settleEnd = 1.18;
      const armRaiseStart = 1.12;
      const armFull = 1.72;
      // The line belongs to the gesture itself. Trigger it while the arm is still
      // actively lifting/reaching, then let the attached speech bubble expire before
      // Miles lowers his arm. This avoids the old "animation -> popup" rhythm.
      const heyGestureCue = 1.38;
      const heyGestureEnd = 3.54;
      const holdEnd = 2.34;
      const armLowerEnd = 2.82;
      const returnStart = 2.72;
      const returnEnd = 3.62;

      if (t < approachEnd) {
        miles.mesh.position.lerpVectors(e.milesInteractionStart, e.milesInteractionTarget, smooth(t / approachEnd));
      } else if (t > returnStart) {
        miles.mesh.position.lerpVectors(e.milesInteractionTarget, e.milesInteractionStart, smooth((t - returnStart) / (returnEnd - returnStart)));
      } else {
        miles.mesh.position.copy(e.milesInteractionTarget);
      }

      const toMiles = miles.mesh.position.clone().sub(e.playerMovement.position);
      toMiles.y = 0;
      if (toMiles.lengthSq() > 0.0001) {
        toMiles.normalize();
        const playerFaceYaw = Math.atan2(toMiles.x, toMiles.z);
        const milesFaceYaw = Math.atan2(-toMiles.x, -toMiles.z);
        e.playerMovement.yaw = dampAngle(e.playerMovement.yaw, playerFaceYaw, t < settleEnd ? 10 : 16);
        e.playerMesh.rotation.y = e.playerMovement.yaw;
        miles.mesh.rotation.y = dampAngle(miles.mesh.rotation.y, milesFaceYaw, t < settleEnd ? 10 : 16);
      }

      const arm = miles.mesh.getObjectByName('arm_right');
      if (arm) {
        let reach = 0;
        if (t >= armRaiseStart && t < armFull) reach = smooth((t - armRaiseStart) / (armFull - armRaiseStart));
        else if (t >= armFull && t < holdEnd) reach = 1;
        else if (t >= holdEnd && t < armLowerEnd) reach = 1 - smooth((t - holdEnd) / (armLowerEnd - holdEnd));

        // Aim the shoulder pivot toward the player's upper torso instead of using
        // a canned angle. The arm's authored rest axis points down (-Y), so we rotate
        // that axis smoothly into the face-to-face reach direction.
        const shoulderWorld = new THREE.Vector3();
        arm.getWorldPosition(shoulderWorld);
        const playerUpperBody = e.playerMovement.position.clone().add(new THREE.Vector3(0, 1.18, 0));
        const worldDirection = playerUpperBody.sub(shoulderWorld).normalize();
        const parentWorldQ = new THREE.Quaternion();
        arm.parent?.getWorldQuaternion(parentWorldQ);
        parentWorldQ.invert();
        const localDirection = worldDirection.applyQuaternion(parentWorldQ).normalize();
        const targetArmQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), localDirection);
        const posedQ = new THREE.Quaternion().identity().slerp(targetArmQ, reach);
        arm.quaternion.slerp(posedQ, 1 - Math.exp(-14 * dt));

        // A tiny extension keeps the hand close to the player without pushing the
        // two character bodies into each other or teleporting the hand.
        const forearm = arm.getObjectByName('miles_forearm');
        const hand = arm.getObjectByName('miles_hand');
        if (forearm) forearm.scale.y = 1 + 0.10 * reach;
        if (hand) hand.position.y = -0.84 - 0.08 * reach;
      }

      // Miles' line is part of the physical interaction itself. It is rendered by
      // NPCManager as a world-space sprite parented to Miles, never as bottom HUD UI.
      // Keep it alive for the remainder of the cinematic so it follows him while he
      // moves, then let the normal speech timer remove it as the interaction ends.
      if (!e.milesInteractionSaidHey && t >= heyGestureCue) {
        e.milesInteractionSaidHey = true;
        e.npcManager.say(miles, 'hey...', Math.max(0.35, heyGestureEnd - t));
      }

      if (t >= returnEnd) {
        if (arm) {
          arm.quaternion.identity();
          const forearm = arm.getObjectByName('miles_forearm');
          const hand = arm.getObjectByName('miles_hand');
          if (forearm) forearm.scale.set(1, 1, 1);
          if (hand) hand.position.y = -0.84;
        }
        miles.mesh.rotation.z = 0;
        miles.mesh.position.copy(e.milesInteractionStart);
        miles.mesh.rotation.y = Number(miles.mesh.userData.milesInteractionStartYaw ?? miles.mesh.rotation.y);
        miles.mesh.userData.specialInteractionActive = false;
        miles.mesh.userData.milesInteractionCooldownUntil = performance.now() * 0.001 + 7.0;
        e.milesInteractionActive = false;
        e.milesInteractionTimer = 0;
        e.milesInteractionStart = null;
        e.milesInteractionTarget = null;
      }
    };

    const startToothlessMount = () => {
      const e = engineRef.current;
      if (!e || e.toothlessMounted || e.toothlessMounting || e.activeVehicle || e.trainRideActive || e.elevatorRideActive || e.deathSequenceActive || e.hospitalRecoveryActive) return;
      const toothless = e.npcManager.getNPCById('cameo_toothless');
      if (!toothless || !toothless.mesh.visible || toothless.state === 'knocked_out' || toothless.state === 'defeated') return;
      if (e.playerMovement.position.distanceTo(toothless.mesh.position) > 4.2) return;

      if (multiplayerRef.current.state.isInRoom) {
        const check = multiplayerRef.current.canMountToothless();
        if (!check.allowed) {
          showTemporaryNotification('Toothless Occupied', check.reason || 'Toothless is currently being flown by another player.');
          return;
        }
        multiplayerRef.current.claimToothless();
      }

      e.toothlessMounting = true;
      e.toothlessMountTimer = 0;
      e.toothlessMountStart = e.playerMovement.position.clone();
      e.toothlessFlightSpeed = 0;
      e.toothlessVerticalSpeed = 0;
      e.toothlessYaw = toothless.mesh.rotation.y;
      toothless.mesh.userData.specialInteractionActive = true;
      toothless.mesh.userData.mounted = true;
      toothless.state = 'idle';
      toothless.kickedVelocity?.set(0, 0, 0);
      e.playerMovement.velocity.set(0, 0, 0);
      e.npcManager.say(toothless, '*happy dragon chirp*', 1.5);
      playSoundEffect('click');
    };

    const attemptToothlessDismount = () => {
      const e = engineRef.current;
      if (!e || !e.toothlessMounted) return;
      const toothless = e.npcManager.getNPCById('cameo_toothless');
      if (!toothless) return;
      // Flight can be dozens of metres above the world. Use a deep downward
      // ground search here; a short maxDrop would incorrectly use the dragon's
      // current altitude as the fallback and could allow a mid-air dismount.
      const ground = e.collisionSystem.getGroundHeightNear(toothless.mesh.position.x, toothless.mesh.position.z, toothless.mesh.position.y, 0.12, 4.0, 120);
      const altitude = toothless.mesh.position.y - ground;
      if (altitude > 1.75) {
        showTemporaryNotification('Toothless', 'Too high to dismount safely — descend and land first.');
        e.npcManager.say(toothless, '*glances down and refuses to drop you*', 1.8);
        return;
      }

      const side = new THREE.Vector3(Math.cos(e.toothlessYaw), 0, -Math.sin(e.toothlessYaw));
      const desired = toothless.mesh.position.clone().addScaledVector(side, 2.1);
      desired.y = ground;
      const safe = e.collisionSystem.findSafePositionOnLevel(desired, 0.72, 2.0, 4.0, 1.4) ?? e.collisionSystem.findSafePosition(desired, 0.72, 2.0, 4.0);
      safe.y = e.collisionSystem.getGroundHeightNear(safe.x, safe.z, ground, ground, 1.3, 3.0);
      e.playerMovement.position.copy(safe);
      e.playerMovement.velocity.set(0, 0, 0);
      e.playerMovement.isGrounded = true;
      e.playerMovement.yaw = e.toothlessYaw;
      e.playerMesh.position.copy(safe);
      e.playerMesh.rotation.set(0, e.toothlessYaw, 0);
      e.playerMesh.visible = true;
      e.toothlessMounted = false;
      e.toothlessMounting = false;
      e.toothlessFlightSpeed = 0;
      e.toothlessVerticalSpeed = 0;
      e.toothlessMountStart = null;
      toothless.mesh.userData.specialInteractionActive = false;
      toothless.mesh.userData.mounted = false;
      toothless.mesh.position.y = ground;
      toothless.mesh.rotation.x = 0;
      toothless.mesh.rotation.z = 0;
      toothless.mesh.userData.home = toothless.mesh.position.clone();
      toothless.state = 'idle';
      if (multiplayerRef.current.state.isInRoom) {
        multiplayerRef.current.releaseToothless(toothless.mesh.position);
      }
      playSoundEffect('jump');
    };

    // Ash is a persistent challenge NPC rather than a pooled pedestrian, so give
    // him the same cartoon hit/vehicle reaction explicitly. He always recovers and
    // drifts back to his authored challenge spot so knocking him around can never
    // make the rematch interaction disappear permanently.
    const ashHome = springfield.simpsonsHouse.ashPos.clone();
    const hitAshFreeRoam = (source: THREE.Vector3, horizontalForce = 12, verticalForce = 7, triggerHostile = true) => {
      const e = engineRef.current;
      if (!e || e.ashBattle.state.isActive) return false;
      const ash = springfield.simpsonsHouse.ashMesh;
      const now = performance.now() * 0.001;
      if (now - (ash.userData.lastFreeHitAt ?? 0) < 0.30) return false;
      ash.userData.lastFreeHitAt = now;
      let velocity = ash.userData.freeHitVelocity as THREE.Vector3 | undefined;
      if (!velocity) {
        velocity = new THREE.Vector3();
        ash.userData.freeHitVelocity = velocity;
      }
      const away = ash.position.clone().sub(source).setY(0);
      if (away.lengthSq() < 0.001) away.set(0, 0, 1);
      away.normalize();
      velocity.set(away.x * horizontalForce, verticalForce, away.z * horizontalForce);
      ash.userData.freeHitActive = true;
      ash.userData.freeHitBounced = false;
      ash.userData.freeHitRecoverDelay = 1.15;
      ash.userData.freeHitSpin = Math.random() < 0.5 ? -1 : 1;
      if (triggerHostile && !e.ashHostileActive) startAshHostileEncounter();
      else if (!e.ashHostileActive) setActiveDialogue({ speaker: 'Ash Ketchum', text: 'HEY! Save that energy for the battle!' });
      return true;
    };

    const updateAshFreeRoam = (dt: number) => {
      const e = engineRef.current;
      if (!e || e.ashBattle.state.isActive) return;
      const ash = springfield.simpsonsHouse.ashMesh;
      const velocity = ash.userData.freeHitVelocity as THREE.Vector3 | undefined;
      if (ash.userData.freeHitActive && velocity) {
        const next = ash.position.clone().addScaledVector(velocity, dt);
        // Ash respects the surrounding house/world walls just like other launched NPCs.
        if (e.collisionSystem.canOccupy(next, 0.46, 1.75)) {
          ash.position.copy(next);
        } else {
          velocity.x *= -0.35;
          velocity.z *= -0.35;
        }
        velocity.y -= 21 * dt;
        ash.rotation.z += dt * 7 * (ash.userData.freeHitSpin ?? 1);
        ash.rotation.x += dt * 4;
        const ground = e.collisionSystem.getGroundHeightNear(ash.position.x, ash.position.z, ash.position.y, 0.12, 1.0, 6.0);
        if (ash.position.y <= ground) {
          ash.position.y = ground;
          if (!ash.userData.freeHitBounced && Math.abs(velocity.y) > 4.5) {
            ash.userData.freeHitBounced = true;
            velocity.y = Math.min(4.8, Math.abs(velocity.y) * 0.24);
            velocity.x *= 0.48;
            velocity.z *= 0.48;
          } else {
            velocity.set(0, 0, 0);
            ash.userData.freeHitActive = false;
            ash.rotation.x = 0;
            ash.rotation.z = 0;
          }
        }
        return;
      }

      ash.userData.freeHitRecoverDelay = Math.max(0, (ash.userData.freeHitRecoverDelay ?? 0) - dt);
      if ((ash.userData.freeHitRecoverDelay ?? 0) <= 0) {
        const homeGround = e.collisionSystem.getGroundHeight(ashHome.x, ashHome.z, ashHome.y);
        ashHome.y = homeGround;
        const planarDist = Math.hypot(ash.position.x - ashHome.x, ash.position.z - ashHome.z);
        if (planarDist > 0.08) {
          ash.position.x = THREE.MathUtils.damp(ash.position.x, ashHome.x, 3.8, dt);
          ash.position.z = THREE.MathUtils.damp(ash.position.z, ashHome.z, 3.8, dt);
          ash.position.y = THREE.MathUtils.damp(ash.position.y, ashHome.y, 6, dt);
        }
        // Authored orientation faces the street, away from Homer's house.
        ash.rotation.y = THREE.MathUtils.damp(ash.rotation.y, 0, 5, dt);
      }
    };

    const configureCarPhysics = (physics: CarPhysics, vehicle: Vehicle) => {
      physics.groundForbidden = vehicle.type === 'river_boat' ? null : isOpenRiverWater;
      physics.maxSpeed = vehicle.maxSpeed ?? 38;
      physics.acceleration = vehicle.acceleration ?? 24;
      physics.collisionRadius = Math.max(1.1, Number(vehicle.mesh.userData.vehicleCollisionRadius) || 1.8);
      physics.collisionHeight = Math.max(1.5, Number(vehicle.mesh.userData.vehicleCollisionHeight) || 2.2);
      // Wall collision uses a tight oriented chassis rather than the old one-circle
      // approximation. Prefer authored real dimensions; fall back to the rendered
      // bounds once at vehicle entry so every legacy/special car still works.
      const authoredDims = vehicle.mesh.userData.realWorldDimensions as { length?: number; width?: number; height?: number } | undefined;
      let vehicleLength = Number(authoredDims?.length) || 0;
      let vehicleWidth = Number(authoredDims?.width) || 0;
      if (!(vehicleLength > 0 && vehicleWidth > 0)) {
        const bounds = new THREE.Box3().setFromObject(vehicle.mesh);
        const size = bounds.getSize(new THREE.Vector3());
        vehicleLength = Math.max(size.x, size.z);
        vehicleWidth = Math.min(size.x, size.z);
      }
      physics.collisionHalfWidth = THREE.MathUtils.clamp(vehicleWidth * 0.47, 0.62, 1.34);
      physics.collisionHalfLength = THREE.MathUtils.clamp(vehicleLength * 0.46, 1.35, 4.35);
      switch (vehicle.type) {
        case 'bmw_f80_m3':
          physics.steerSpeed = 2.7;
          physics.driftSteerMultiplier = 1.95;
          physics.friction = 0.982;
          physics.braking = 39;
          physics.driftSpeedRetention = 0.985;
          physics.highSpeedSteerScale = 0.57;
          physics.boostMultiplier = 1.32;
          break;
        case 'bmw_g80_m3':
          physics.steerSpeed = 2.35;
          physics.driftSteerMultiplier = 1.25;
          physics.friction = 0.989;
          physics.braking = 42;
          physics.driftSpeedRetention = 0.955;
          physics.highSpeedSteerScale = 0.72;
          physics.boostMultiplier = 1.31;
          break;
        case 'bmw_f90_m5':
          physics.steerSpeed = 2.45;
          physics.driftSteerMultiplier = 1.65;
          physics.friction = 0.986;
          physics.braking = 43;
          physics.driftSpeedRetention = 0.978;
          physics.highSpeedSteerScale = 0.63;
          physics.boostMultiplier = 1.36;
          break;
        case 'lamborghini_aventador':
          physics.steerSpeed = 2.5;
          physics.driftSteerMultiplier = 1.22;
          physics.friction = 0.991;
          physics.braking = 47;
          physics.driftSpeedRetention = 0.95;
          physics.highSpeedSteerScale = 0.76;
          physics.boostMultiplier = 1.40;
          break;
        case 'ferrari_f12':
          physics.steerSpeed = 2.62;
          physics.driftSteerMultiplier = 1.38;
          physics.friction = 0.988;
          physics.braking = 46;
          physics.driftSpeedRetention = 0.968;
          physics.highSpeedSteerScale = 0.68;
          physics.boostMultiplier = 1.38;
          break;
        case 'peppa_family_car':
          physics.steerSpeed = 2.55;
          physics.driftSteerMultiplier = 1.20;
          physics.friction = 0.987;
          physics.braking = 35;
          physics.driftSpeedRetention = 0.945;
          physics.highSpeedSteerScale = 0.72;
          physics.boostMultiplier = 1.16;
          physics.reverseSpeed = 11;
          break;
        case 'simpsons_family_sedan':
        case 'pink_sedan':
        case 'homer_sedan':
          physics.steerSpeed = 2.48;
          physics.driftSteerMultiplier = 1.48;
          physics.friction = 0.985;
          physics.braking = 34;
          physics.driftSpeedRetention = 0.962;
          physics.highSpeedSteerScale = 0.69;
          physics.boostMultiplier = 1.24;
          physics.reverseSpeed = 13;
          break;
        case 'speed_rocket':
          physics.steerSpeed = 2.12;
          physics.driftSteerMultiplier = 1.12;
          physics.friction = 0.991;
          physics.braking = 29;
          physics.driftSpeedRetention = 0.945;
          physics.highSpeedSteerScale = 0.42;
          physics.boostMultiplier = 1.20;
          physics.reverseSpeed = 12;
          physics.boostDrainRate = 42;
          break;
        case 'canyonero':
          physics.steerSpeed = 1.82;
          physics.driftSteerMultiplier = 0.92;
          physics.friction = 0.993;
          physics.braking = 32;
          physics.driftSpeedRetention = 0.90;
          physics.highSpeedSteerScale = 0.56;
          physics.boostMultiplier = 1.14;
          physics.reverseSpeed = 11;
          break;
        case 'mr_plow':
          physics.steerSpeed = 1.98;
          physics.driftSteerMultiplier = 0.88;
          physics.friction = 0.992;
          physics.braking = 33;
          physics.driftSpeedRetention = 0.89;
          physics.highSpeedSteerScale = 0.60;
          physics.boostMultiplier = 1.12;
          physics.reverseSpeed = 12;
          break;
        case 'car_built_for_homer':
          physics.steerSpeed = 2.18;
          physics.driftSteerMultiplier = 1.16;
          physics.friction = 0.990;
          physics.braking = 38;
          physics.driftSpeedRetention = 0.945;
          physics.highSpeedSteerScale = 0.61;
          physics.boostMultiplier = 1.25;
          physics.reverseSpeed = 13;
          break;
        case 'lightning_mcqueen':
          // Quick, responsive arcade racer tuning. This only applies while the
          // player is driving him; autonomous movement stays owned by TrafficManager.
          physics.steerSpeed = 2.72;
          physics.driftSteerMultiplier = 1.42;
          physics.friction = 0.988;
          physics.braking = 44;
          physics.driftSpeedRetention = 0.972;
          physics.highSpeedSteerScale = 0.66;
          physics.boostMultiplier = 1.34;
          physics.maxSpeed = Math.min(vehicle.maxSpeed ?? 52, 52);
          physics.acceleration = Math.min(vehicle.acceleration ?? 28, 28);
          break;
        case 'river_boat':
          physics.surfaceMode = 'water';
          physics.waterSurfaceY = 0.18;
          physics.steerSpeed = 1.75;
          physics.driftSteerMultiplier = 0.65;
          physics.friction = 0.992;
          physics.braking = 18;
          physics.driftSpeedRetention = 0.92;
          physics.highSpeedSteerScale = 0.72;
          physics.boostMultiplier = 1.10;
          physics.maxSpeed = Math.min(physics.maxSpeed, 30);
          physics.acceleration = Math.min(physics.acceleration, 15);
          break;
        case 'city_bus':
          physics.steerSpeed = 1.35;
          physics.driftSteerMultiplier = 0.45;
          physics.friction = 0.994;
          physics.braking = 30;
          physics.driftSpeedRetention = 0.82;
          physics.highSpeedSteerScale = 0.52;
          physics.boostMultiplier = 1.08;
          physics.maxSpeed = Math.min(physics.maxSpeed, 25);
          physics.acceleration = Math.min(physics.acceleration, 10);
          break;
        default:
          physics.steerSpeed = 2.45;
          physics.driftSteerMultiplier = 1.55;
          physics.friction = 0.985;
          physics.driftSpeedRetention = 0.965;
          physics.highSpeedSteerScale = 0.67;
          physics.boostMultiplier = 1.32;
      }
    };

    const chooseStarter = (id: PokemonCharacterId) => {
      const e = engineRef.current;
      if (!e || e.hasChosenStarter || e.activeVehicle) return;
      if (!['pikachu', 'charmander', 'poliway'].includes(id)) return;
      const old = e.playerMesh;
      const newMesh = createPokemonModel(id);
      newMesh.position.copy(e.playerMovement.position);
      newMesh.rotation.y = e.playerMovement.yaw;
      scene.remove(old);
      scene.add(newMesh);
      e.playerMesh = newMesh;
      e.currentPokemonId = id;
      e.hasChosenStarter = true;
      hasChosenStarterRef.current = true;
      selectedPokemonRef.current = id;
      setHasChosenStarter(true);
      setSelectedPokemonId(id);
      hpRef.current = 100;
      setPokemonHp(100);
      // Keep the three lab display Pokémon visible permanently. They are physical
      // walk-up selectors, not consumable world objects.
      const labDoor = e.doors.find((d) => d.id === 'oak_lab_door');
      labDoor?.open();
      particles.emitRecallSpark(e.playerMovement.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xffffff);
      setActiveDialogue({ speaker: 'Professor Oak', text: `Excellent! ${pokemonName(id)} is yours. Hit the road!` });
      playSoundEffect('fanfare');
      saveNow();
    };

    const requestPokemonSwitch = (id: PokemonCharacterId) => {
      const e = engineRef.current;
      if (!e) return;
      if (e.healingActive || e.vehicleEntryActive || e.deathSequenceActive || e.hospitalRecoveryActive || e.seated || e.grabbedNpcId) return;
      // Starter choice is the hard unlock for the entire Pokémon-switch system.
      // Before Oak has actually assigned the first Pokémon, switch requests are ignored
      // at the command layer as well as hidden in the HUD. This prevents keyboard/UI
      // shortcuts from bypassing the physical walk-up starter sequence.
      if (!e.hasChosenStarter) return;
      if (e.activeVehicle) {
        showTemporaryNotification('Poké Ball', 'Get out of the car before switching Pokémon!');
        return;
      }
      if (e.charizardFlightActive) {
        showTemporaryNotification('Charizard', 'Land before switching Pokémon.');
        return;
      }
      const normalized: PokemonCharacterId = id === 'geodude' ? 'geodude_legs' : id;
      if (normalized === 'geodude_legs' && !unlockedGeodudeRef.current) {
        showTemporaryNotification('Poké Ball', 'Beat Ash and his ridiculous Springfield team to unlock Geodude!');
        return;
      }
      if (normalized === e.currentPokemonId || e.switchAnimator.active) return;

      const newMesh = createPokemonModel(normalized);
      const started = e.switchAnimator.start({
        fromMesh: e.playerMesh,
        toMesh: newMesh,
        position: e.playerMovement.position.clone(),
        yaw: e.playerMovement.yaw,
        onComplete: (completedMesh) => {
          const current = engineRef.current;
          if (!current) return;
          current.playerMesh = completedMesh;
          current.currentPokemonId = normalized;
          current.charizardFlightActive = false;
          current.charizardFlightSpeed = 0;
          current.charizardVerticalSpeed = 0;
          current.charizardSpaceWasHeld = false;
          current.playerMesh.userData.charizardFlying = false;
          current.playerMesh.userData.charizardJumpPreparing = false;
          selectedPokemonRef.current = normalized;
          setSelectedPokemonId(normalized);
          setPoliwagWaterGunDrawn(completedMesh, false);
          playSoundEffect('fanfare');
          saveNowRef.current();
        },
      });
      if (started) setPoliwagWaterGunDrawn(e.playerMesh, false);
    };
    requestSwitchRef.current = requestPokemonSwitch;

    const clearStarterSelection = () => {
      starterSelectionCandidateRef.current = null;
      setStarterSelectionCandidate(null);
      goldenrod.oakLab.starters.forEach((starter) => {
        starter.highlight.visible = false;
        const material = starter.highlight.material as THREE.MeshBasicMaterial;
        material.opacity = 0;
      });
    };

    const openStarterSelection = (starter: { id: PokemonCharacterId; name: string }) => {
      const current = engineRef.current;
      if (!current || current.activeVehicle || current.switchAnimator.active) return;
      starterSelectionCandidateRef.current = { id: starter.id, name: starter.name };
      setStarterSelectionCandidate({ id: starter.id, name: starter.name });
      setActiveDialogue(null);
      for (const code of Object.keys(current.keys)) current.keys[code] = false;
      setInteractionPrompt(null);
      playSoundEffect('click');
    };

    confirmStarterSelectionRef.current = () => {
      const candidate = starterSelectionCandidateRef.current;
      const current = engineRef.current;
      if (!candidate || !current) return;
      clearStarterSelection();

      if (!current.hasChosenStarter) {
        chooseStarter(candidate.id);
        return;
      }

      if (current.currentPokemonId === candidate.id) {
        showTemporaryNotification('Professor Oak', `${candidate.name} is already your active Pokémon.`);
        return;
      }

      requestPokemonSwitch(candidate.id);
      showTemporaryNotification('Professor Oak', `${candidate.name} selected. Poké Ball switch initiated!`);
    };

    const damageBossWithSpecialIfAimed = (amount: number, range: number, forward: THREE.Vector3, minDot = 0.4) => {
      const e = engineRef.current;
      if (!e || e.specialDamageCooldown > 0) return;
      const boss = e.ashBattle.state.currentBoss;
      if (e.ashBattle.state.isActive && boss?.mesh) {
        if (isInCone(e.playerMovement.position, forward, boss.mesh.position, range, minDot, 7.5)) {
          e.ashBattle.damageBoss(amount, 'special', e.playerMovement.position, Math.max(9, amount * 0.45));
          e.cameraShake = Math.max(e.cameraShake, 0.18);
          e.specialDamageCooldown = 0.42;
        }
        return;
      }
      const ash = springfield.simpsonsHouse.ashMesh;
      if (isInCone(e.playerMovement.position, forward, ash.position, range, minDot, 7.5)) {
        hitAshFreeRoam(e.playerMovement.position, Math.max(8, amount * 0.75), 6.5);
        e.cameraShake = Math.max(e.cameraShake, 0.14);
        e.specialDamageCooldown = 0.42;
      }
    };

    const performInstantSpecial = () => {
      const e = engineRef.current;
      if (!e || !e.hasChosenStarter || e.activeVehicle || e.vehicleEntryActive || e.switchAnimator.active || e.healingActive || e.deathSequenceActive || e.hospitalRecoveryActive || e.toothlessMounted || e.toothlessMounting || e.milesInteractionActive || e.seated || e.grabbedNpcId || e.specialCooldown > 0) return;
      const pos = e.playerMovement.position.clone();
      const id = e.currentPokemonId;
      if (id === 'pikachu') {
        const hits = e.worldInteractions.electricBurst(pos, e.vehicles);
        const boss = e.ashBattle.state.currentBoss;
        if (boss?.mesh && e.ashBattle.state.isActive && boss.mesh.position.distanceTo(pos) <= 7.5) {
          e.ashBattle.damageBoss(27, 'special', pos, 13);
          e.cameraShake = Math.max(e.cameraShake, 0.22);
        } else if (!e.ashBattle.state.isActive && springfield.simpsonsHouse.ashMesh.position.distanceTo(pos) <= 7.5) {
          hitAshFreeRoam(pos, 15, 8);
        }
        if (hits > 0) addWanted(1);
        e.specialCooldown = 1.1;
        e.specialTimer = 0.65;
      } else if (id === 'geodude' || id === 'geodude_legs') {
        const hits = e.worldInteractions.groundSlam(pos, e.vehicles);
        const boss = e.ashBattle.state.currentBoss;
        if (boss?.mesh && e.ashBattle.state.isActive && boss.mesh.position.distanceTo(pos) <= 9.5) {
          e.ashBattle.damageBoss(40, 'special', pos, 19);
          e.cameraShake = Math.max(e.cameraShake, 0.32);
        } else if (!e.ashBattle.state.isActive && springfield.simpsonsHouse.ashMesh.position.distanceTo(pos) <= 9.5) {
          hitAshFreeRoam(pos, 19, 10);
        }
        if (hits > 0) addWanted(2);
        e.specialCooldown = 1.8;
        e.specialTimer = 0.8;
      }
    };

    const handleAttack = () => {
      const e = engineRef.current;
      if (!e || !e.hasChosenStarter || e.activeVehicle || e.vehicleEntryActive || e.switchAnimator.active || e.healingActive || e.deathSequenceActive || e.hospitalRecoveryActive || e.toothlessMounted || e.toothlessMounting || e.milesInteractionActive || e.seated) return;

      if (e.grabbedNpcId) {
        handleGrab();
        return;
      }

      const pPos = e.playerMovement.position;
      const forward = currentForward();

      if (e.footballManager.tryPlayerKick(pPos, forward, e.keys['ShiftLeft'] || e.keys['ShiftRight'] ? 1.28 : 1.0)) {
        e.attackTimer = 0.34;
        playSoundEffect('kick');
        return;
      }

      const profile =
        e.currentPokemonId === 'geodude_legs' || e.currentPokemonId === 'geodude'
          ? {
              horizontalForce: 38,
              verticalForce: 15,
              damage: 78,
              range: 4.0,
              bossDamage: 46,
              style: 'uppercut' as const,
              color: 0xb8c1cc,
              shake: 0.38,
            }
          : e.currentPokemonId === 'charizard'
          ? {
              horizontalForce: 33,
              verticalForce: 12,
              damage: 60,
              range: 4.05,
              bossDamage: 36,
              style: 'tail' as const,
              color: 0xff7a24,
              shake: 0.29,
            }
          : e.currentPokemonId === 'charmander'
          ? {
              horizontalForce: 27,
              verticalForce: 10.5,
              damage: 48,
              range: 3.6,
              bossDamage: 30,
              style: 'tail' as const,
              color: 0xff7a24,
              shake: 0.24,
            }
          : e.currentPokemonId === 'poliway'
          ? {
              horizontalForce: 24,
              verticalForce: 10,
              damage: 44,
              range: 3.55,
              bossDamage: 28,
              style: 'punch' as const,
              color: 0x42c8ff,
              shake: 0.22,
            }
          : {
              horizontalForce: 26,
              verticalForce: 11,
              damage: 46,
              range: 3.6,
              bossDamage: 29,
              style: 'headbutt' as const,
              color: 0xffe33b,
              shake: 0.23,
            };

      e.attackTimer = 0.52;

      const boss = e.ashBattle.state.currentBoss;
      if (
        e.ashBattle.state.isActive &&
        boss?.mesh &&
        isInCone(pPos, forward, boss.mesh.position, profile.range + 0.4, -0.05, 2.4)
      ) {
        e.ashBattle.damageBoss(
          profile.bossDamage,
          'kick',
          pPos,
          profile.horizontalForce * 0.62
        );
        e.cameraShake = Math.max(e.cameraShake, profile.shake);
        return;
      }

      // Ash is also a physical free-roam NPC outside battle. Hitting him does not
      // start the fight or change progression; it just uses the same cartoon knockback
      // language as the rest of the world and he returns to his challenge spot.
      if (!e.ashBattle.state.isActive && isInCone(pPos, forward, springfield.simpsonsHouse.ashMesh.position, profile.range + 0.3, -0.08)) {
        if (hitAshFreeRoam(pPos, profile.horizontalForce * 0.55, profile.verticalForce * 0.72)) {
          e.cameraShake = Math.max(e.cameraShake, profile.shake * 0.8);
          addWanted(0.55);
          return;
        }
      }

      // Aim melee attacks in front of the Pokémon rather than hitting somebody
      // standing behind them simply because they happen to be nearby.
      const nearby = e.npcManager.getAttackableNPCInFront(pPos, forward, profile.range, -0.08);
      if (nearby) {
        e.npcManager.applyMeleeHit(nearby, {
          source: pPos.clone(),
          direction: forward,
          horizontalForce: profile.horizontalForce,
          verticalForce: profile.verticalForce,
          damage: profile.damage,
          style: profile.style,
          attackerName: pokemonName(e.currentPokemonId),
          color: profile.color,
        });
        e.cameraShake = Math.max(e.cameraShake, profile.shake);
        const attackCrime = playerNpcAttackWantedWeight(nearby);
        if (attackCrime > 0) addWanted(attackCrime);
        return;
      }

      // Target props through WorldInteractionManager's LIVE registry. This includes
      // trees grown after startup and uses each object's current physical bounds, so
      // a fallen tree can be kicked again where it actually lies instead of being
      // targeted at its old/root pivot.
      const prop = e.worldInteractions.getDestructibleInFront(pPos, forward, profile.range, -0.15);
      if (prop) {
        const propWorld = prop.mesh.getWorldPosition(new THREE.Vector3());
        const kickDirection = forward.clone().setY(0);
        if (kickDirection.lengthSq() < 0.001) kickDirection.set(0, 0, 1);
        kickDirection.normalize();
        // Every kickable prop should move AWAY from the actual contact/source.
        // Player facing remains the dominant arcade direction, but the physical
        // source->object normal prevents an off-centre hit from launching sideways
        // or back toward the player. Tall objects keep the strongest facing bias so
        // their fall direction remains readable.
        const awayFromPlayer = propWorld.clone().sub(pPos).setY(0);
        if (awayFromPlayer.lengthSq() > 0.001) {
          awayFromPlayer.normalize();
          const facingWeight = prop.type === 'tree' ? 0.76 : (prop.type === 'lamp' || prop.type === 'sign' || prop.type === 'fence') ? 0.64 : 0.56;
          kickDirection.multiplyScalar(facingWeight).addScaledVector(awayFromPlayer, 1 - facingWeight).normalize();
        }
        // Contact sits low on tall props so poles/trees visibly tip AWAY from the
        // player's foot instead of receiving an arbitrary spin axis.
        const impactPoint = propWorld.clone().setY(pPos.y + 0.58);
        const launched = e.worldInteractions.launchDestructible(
          prop,
          kickDirection.multiplyScalar(profile.horizontalForce * 0.72).setY(profile.verticalForce * 0.72),
          0.30,
          prop.type === 'tree' ? 0.78 : 0.55,
          { source: pPos, impactPoint, applyMassResponse: true, kind: 'melee', playerCaused: true }
        );
        if (launched) {
          playSoundEffect('crash');
          e.cameraShake = Math.max(e.cameraShake, profile.shake * (prop.type === 'tree' ? 1.0 : 0.8));
          addWanted(e.worldInteractions.wantedWeightForDestructibleType(prop.type));
        }
      }
    };

    const finishVehicleEntry = (vehicle: Vehicle) => {
      const e = engineRef.current;
      if (!e || e.activeVehicle) return;
      if (vehicle.wrecked) { e.vehicleEntryActive = false; e.pendingVehicle = null; e.playerMesh.visible = true; return; }
      vehicle.inUse = true;
      vehicle.isOccupied = false;
      e.vehicleSurfaceSupport = null;
      e.activeVehicle = vehicle;
      const physics = new CarPhysics(vehicle.mesh.position, vehicle.yaw ?? vehicle.rotationY ?? vehicle.mesh.rotation.y);
      configureCarPhysics(physics, vehicle);
      if ((vehicle.damage ?? 0) >= 70) {
        physics.maxSpeed *= 0.72;
        physics.acceleration *= 0.68;
      }
      e.activeCarPhysics = physics;
      e.playerMesh.visible = false;
      e.vehicleEntryActive = false;
      e.pendingVehicle = null;
      vehicle.mesh.rotation.z = 0;
      if (multiplayerRef.current.state.isInRoom) {
        multiplayerRef.current.claimVehicle(vehicle.id);
      }
      setInVehicle(true);
      setCurrentVehicleInfo({
        type: vehicle.type ?? 'civilian_sedan',
        name: vehicle.name ?? 'Vehicle',
        speed: 0,
        maxSpeed: physics.maxSpeed,
        boostFuel: physics.boostFuel,
        isDrifting: false,
        isBoosting: false,
        damage: vehicle.damage ?? 0,
        wrecked: !!vehicle.wrecked,
      });
      setInteractionPrompt('[E] Exit Vehicle');
      playSoundEffect('engineStart');
    };

    const enterVehicle = (vehicle: Vehicle) => {
      const e = engineRef.current;
      if (!e || e.activeVehicle || e.vehicleEntryActive || !e.hasChosenStarter) return;
      if (multiplayerRef.current.state.isInRoom) {
        const check = multiplayerRef.current.canEnterVehicle(vehicle.id);
        if (!check.allowed) {
          showTemporaryNotification('Occupied', check.reason || 'This vehicle is being driven by another player.');
          return;
        }
      }
      // If the player catches a recently abandoned rolling car, hand it back to the
      // normal entry flow and stop its background coast controller immediately.
      e.coastingVehicles = e.coastingVehicles.filter((entry) => entry.vehicle !== vehicle);
      vehicle.mesh.userData.unoccupiedCoasting = false;
      if (vehicle.wrecked || (vehicle.damage ?? 0) >= 100) {
        showTemporaryNotification('Vehicle', 'That thing is absolutely cooked. Find another car.');
        return;
      }

      const npcVehicleHybrid = e.trafficManager.isNpcVehicleHybrid(vehicle);
      const occupied = npcVehicleHybrid ? false : !!vehicle.isOccupied;
      // Player hijacking is deliberately allowed anywhere. Intersection/roundabout/
      // crossing restrictions apply only to AI drivers deciding to leave on their own.
      // Pressing E is an explicit gameplay override and immediately hands this traffic
      // vehicle out of the autonomous traffic state machine.
      e.vehicleEntryActive = true;
      e.pendingVehicle = vehicle;
      e.vehicleEntryDuration = occupied ? 0.82 : 0.50;
      e.vehicleEntryTimer = e.vehicleEntryDuration;
      e.playerMovement.velocity.set(0, 0, 0);

      if (occupied) {
        const driver = e.npcManager.spawnEjectedDriver(
          vehicle.mesh.position.clone(),
          vehicle.yaw ?? vehicle.mesh.rotation.y,
          vehicle.driverName ?? 'Angry Driver'
        );
        e.npcManager.say(driver, 'HEY! THAT POKÉMON STOLE MY CAR!', 2.8);
        e.trafficManager.markHijacked(vehicle);
        vehicle.hijacked = true;
        addWanted(1.25);
        setInteractionPrompt('[HIJACKING] Driver ejected...');
      } else {
        setInteractionPrompt(npcVehicleHybrid ? '[ENTERING] Taking control of Lightning McQueen...' : '[ENTERING] Getting in...');
      }
      playSoundEffect('doorOpen');
    };

    const exitVehicle = () => {
      const e = engineRef.current;
      if (!e?.activeVehicle || !e.activeCarPhysics) return;
      const cp = e.activeCarPhysics;
      const exitingVehicle = e.activeVehicle;
      exitingVehicle.speed = cp.speed;
      exitingVehicle.yaw = cp.yaw;
      exitingVehicle.mesh.rotation.z = exitingVehicle.wrecked ? exitingVehicle.mesh.rotation.z : 0;

      // Vehicle exit must stay on the same *reachable* floor as the car. The garage
      // sits directly beneath the elevated railway, so using a topmost-floor query
      // here used to snap the player onto the tracks. Try driver side, passenger
      // side, then nearby rear/diagonal positions, always resolving from the car's Y.
      const side = new THREE.Vector3(Math.cos(cp.yaw), 0, -Math.sin(cp.yaw));
      const forward = new THREE.Vector3(Math.sin(cp.yaw), 0, Math.cos(cp.yaw));
      const authoredExit = Number(exitingVehicle.mesh.userData.vehicleExitOffset);
      // Use the actual driving-collision footprint, NOT a world AABB of the rendered
      // model. Mirrors, spoilers, ploughs, rocket flames and a rotated long chassis can
      // make Box3.setFromObject enormously wider than the physical car and previously
      // caused every exit candidate to be rejected even in visibly open space.
      const exitHalfWidth = Math.max(0.75, cp.collisionHalfWidth);
      const exitHalfLength = Math.max(1.15, cp.collisionHalfLength);
      const sideExit = Math.max(2.05, Number.isFinite(authoredExit) ? authoredExit : 0, exitHalfWidth + 0.92);
      const foreExit = Math.max(2.75, exitHalfLength + 1.05);
      const rawCandidates = [
        cp.position.clone().addScaledVector(side, -sideExit), // driver's side first
        cp.position.clone().addScaledVector(side, sideExit),  // passenger side
        cp.position.clone().addScaledVector(side, -sideExit).addScaledVector(forward, -1.6),
        cp.position.clone().addScaledVector(side, sideExit).addScaledVector(forward, -1.6),
        cp.position.clone().addScaledVector(forward, -foreExit),
        cp.position.clone().addScaledVector(forward, foreExit),
      ];

      const clearOfOtherVehicles = (candidate: THREE.Vector3, minimumDistance = 1.75) => {
        for (const vehicle of e.vehicles) {
          if (vehicle === exitingVehicle) continue;
          const other = vehicle.mesh.position;
          // Keep a modest body-sized gap from another vehicle. This is intentionally
          // smaller than the old blanket 2.35 m centre radius so two parked cars do
          // not make an otherwise valid door-side exit impossible.
          if (Math.abs(candidate.y - other.y) < 2.0 && Math.hypot(candidate.x - other.x, candidate.z - other.z) < minimumDistance) {
            return false;
          }
        }
        return true;
      };

      const clearOfExitingVehicle = (candidate: THREE.Vector3) => {
        // Point-vs-oriented chassis test. A world AABB grows dramatically when a
        // long car is rotated and was the main reason the player could be trapped
        // inside a perfectly ordinary parked vehicle.
        const dx = candidate.x - cp.position.x;
        const dz = candidate.z - cp.position.z;
        const c = Math.cos(-cp.yaw);
        const s = Math.sin(-cp.yaw);
        const localX = dx * c - dz * s;
        const localZ = dx * s + dz * c;
        const padding = 0.66;
        return Math.abs(localX) > exitHalfWidth + padding || Math.abs(localZ) > exitHalfLength + padding;
      };

      let exitPos: THREE.Vector3 | null = null;
      for (const raw of rawCandidates) {
        raw.y = cp.position.y;
        const safe = e.collisionSystem.findSafePositionOnLevel(raw, 0.68, 2.0, 2.4, 1.35, false);
        if (!safe) continue;
        if (!clearOfExitingVehicle(safe) || !clearOfOtherVehicles(safe)) continue;
        exitPos = safe;
        break;
      }

      // Last resort: radial search around the actual vehicle rather than an unrelated
      // global spawn. Every candidate must resolve onto a real authored surface on
      // the SAME vertical level as the car.
      if (!exitPos) {
        const radialStart = Math.max(3.2, sideExit);
        for (let radius = radialStart; radius <= radialStart + 4.8 && !exitPos; radius += 0.8) {
          for (let i = 0; i < 16; i++) {
            const angle = cp.yaw + (i / 16) * Math.PI * 2;
            const raw = cp.position.clone().add(
              new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
            );
            const candidate = e.collisionSystem.findSafePositionOnLevel(raw, 0.64, 2.0, 1.4, 1.35, false);
            if (!candidate) continue;
            if (!clearOfExitingVehicle(candidate) || !clearOfOtherVehicles(candidate)) continue;
            exitPos = candidate;
            break;
          }
        }
      }

      // Final SAME-LEVEL emergency pass. This still requires real world clearance
      // and staying outside the current chassis, but it stops a nearby parked car or
      // decorative vehicle from trapping the player forever. No global teleporting.
      if (!exitPos) {
        const emergencyStart = Math.max(2.4, exitHalfWidth + 0.9);
        for (let radius = emergencyStart; radius <= emergencyStart + 5.2 && !exitPos; radius += 0.55) {
          for (let i = 0; i < 24; i++) {
            const angle = cp.yaw + (i / 24) * Math.PI * 2;
            const raw = cp.position.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
            const candidate = e.collisionSystem.findSafePositionOnLevel(raw, 0.58, 1.95, 0.9, 1.45, false);
            if (!candidate || !clearOfExitingVehicle(candidate) || !clearOfOtherVehicles(candidate, 1.05)) continue;
            exitPos = candidate;
            break;
          }
        }
      }

      // Only refuse an exit when actual FIXED WORLD geometry genuinely surrounds
      // the vehicle. Open terrain no longer fails just because it lacks a tagged floor.
      if (!exitPos) {
        setInteractionPrompt('[EXIT BLOCKED] No safe space beside the vehicle. Move slightly and try E again.');
        return;
      }

      const exitSpeed = Math.abs(cp.speed);
      const highSpeedExit = exitSpeed >= 7.5 && cp.surfaceMode === 'ground';
      const resumeHybridAfter = e.trafficManager.isNpcVehicleHybrid(exitingVehicle);

      exitingVehicle.inUse = false;
      triggerVehicleExitDoorVisual(exitingVehicle, exitHalfWidth, exitHalfLength, cp.collisionHeight);

      // A released vehicle keeps the SAME CarPhysics body for a short coast. This is
      // what prevents a 100 km/h car from magically stopping the instant the player
      // presses E. Traffic AI remains paused while the unoccupied car rolls, then a
      // special NPC hybrid (McQueen) can safely resume its authored route afterwards.
      if (exitSpeed > 1.2) {
        exitingVehicle.mesh.userData.unoccupiedCoasting = true;
        e.coastingVehicles = e.coastingVehicles.filter((entry) => entry.vehicle !== exitingVehicle);
        e.coastingVehicles.push({
          vehicle: exitingVehicle,
          physics: cp,
          timer: THREE.MathUtils.clamp(1.8 + exitSpeed * 0.085, 2.2, 5.4),
          resumeHybridAfter,
        });
      } else {
        exitingVehicle.mesh.userData.unoccupiedCoasting = false;
        if (resumeHybridAfter) e.trafficManager.resumeNpcVehicleHybrid(exitingVehicle);
      }

      e.playerMovement.position.copy(exitPos);
      e.playerMovement.yaw = cp.yaw;
      e.playerMesh.position.copy(exitPos);
      e.playerMesh.rotation.set(0, cp.yaw, 0);
      e.playerMesh.visible = true;
      e.activeVehicle = null;
      e.activeCarPhysics = null;
      if (multiplayerRef.current.state.isInRoom) {
        multiplayerRef.current.releaseVehicle(exitingVehicle.id);
      }
      setInVehicle(false);
      setCurrentVehicleInfo(null);
      soundManager.stopEngine();
      playSoundEffect('doorOpen');

      if (highSpeedExit) {
        // Preserve most of the car's world momentum and add a small outward shove so
        // the character clears the open door before gravity/character collision take
        // over. Speeds are bounded so even the Rocket cannot launch the player forever.
        const signedForward = forward.clone().multiplyScalar(cp.speed);
        const doorOut = side.clone().multiplyScalar(-THREE.MathUtils.clamp(1.8 + exitSpeed * 0.045, 2.0, 3.8));
        const planarMomentum = signedForward.multiplyScalar(0.82).add(doorOut);
        if (planarMomentum.length() > 30) planarMomentum.setLength(30);
        e.playerMovement.velocity.set(
          planarMomentum.x,
          THREE.MathUtils.clamp(1.6 + exitSpeed * 0.055, 2.0, 4.6),
          planarMomentum.z
        );
        e.playerMovement.isGrounded = false;
        e.playerMovement.isStomping = false;
        e.playerMovement.jumpsUsed = 2;
        e.vehicleExitTumbleDuration = THREE.MathUtils.clamp(0.78 + (exitSpeed - 7.5) * 0.035, 0.82, 1.72);
        e.vehicleExitTumbleTimer = e.vehicleExitTumbleDuration;
        const spinDirection = cp.speed >= 0 ? 1 : -1;
        e.vehicleExitTumbleSpinX = THREE.MathUtils.clamp(5.5 + exitSpeed * 0.18, 6.0, 11.0) * spinDirection;
        e.vehicleExitTumbleSpinZ = (Math.random() < 0.5 ? -1 : 1) * THREE.MathUtils.clamp(3.0 + exitSpeed * 0.10, 3.5, 7.0);
        e.cameraShake = Math.max(e.cameraShake, THREE.MathUtils.clamp(0.18 + exitSpeed * 0.008, 0.22, 0.46));

        // Damage starts gently around urban speeds, then ramps into a serious hit at
        // motorway/Rocket speeds. A tiny rolling exit can never produce lethal damage.
        const exitDamage = THREE.MathUtils.clamp((exitSpeed - 6.5) * 0.95, 2, 38);
        damagePlayer(exitDamage, 'a high-speed vehicle exit');
        showTemporaryNotification('Bail Out!', `${Math.round(exitSpeed * 3.6)} km/h exit — ${Math.round(exitDamage)} damage`);
      } else {
        e.playerMovement.velocity.set(0, 0, 0);
        e.playerMovement.isGrounded = true;
        e.vehicleExitTumbleTimer = 0;
        e.vehicleExitTumbleDuration = 0;
        recordSafeCheckpoint(e, exitPos, cp.yaw);
      }
    };

    const getNearbyAircraft = (pos: THREE.Vector3, radius = 9.0): AirportAircraft | null => {
      let best: AirportAircraft | null = null;
      let bestDist = radius;
      for (const plane of engine.airportAircraft) {
        if (plane.inUse || !plane.onGround || Math.abs(plane.speed) > 3.2 || engine.freeAircraftControllers.has(plane.id)) continue;
        const planar = Math.hypot(pos.x - plane.position.x, pos.z - plane.position.z);
        const interactionRadius = Math.min(radius, Math.max(5.2, plane.wingspan * 0.26));
        if (planar < interactionRadius && planar < bestDist && Math.abs(pos.y - plane.position.y) < 5.5) {
          best = plane;
          bestDist = planar;
        }
      }
      return best;
    };

    const enterAircraft = (plane: AirportAircraft) => {
      const e = engineRef.current;
      if (!e || !e.hasChosenStarter || e.activeAircraft || e.activeVehicle || plane.inUse) return;
      if (multiplayerRef.current.state.isInRoom) {
        const check = multiplayerRef.current.canEnterAircraft(plane.id);
        if (!check.allowed) {
          showTemporaryNotification('Occupied', check.reason || 'This aircraft is being piloted by another player.');
          return;
        }
        multiplayerRef.current.claimAircraft(plane.id);
      }
      if (plane.crashed || plane.damage >= 100) {
        showTemporaryNotification(plane.name, 'This aircraft is disabled after a crash. Try another plane.');
        return;
      }
      plane.inUse = true;
      e.freeAircraftControllers.delete(plane.id);
      e.activeAircraft = plane;
      e.aircraftController = new AircraftController(plane, e.collisionSystem, e.airportAircraft, e.worldInteractions);
      e.vehicleSurfaceSupport = null;
      e.playerMovement.velocity.set(0,0,0);
      e.playerMesh.visible = false;
      setInVehicle(true);
      setCurrentVehicleInfo(null);
      setAircraftHud({
        name: plane.name, kind: plane.kind, speed: plane.speed, maxSpeed: plane.maxSpeed,
        throttle: plane.throttle, altitude: 0, verticalSpeed: plane.verticalSpeed,
        onGround: plane.onGround, damage: plane.damage, crashed: plane.crashed,
      });
      setInteractionPrompt('[W/S] Throttle  •  [←/→] Turn/Taxi  •  [↑/↓] Climb/Descend  •  [SPACE] Brake  •  [E] Exit');
      playSoundEffect('engineStart');
      soundManager.playEngine(Math.max(2, plane.speed), plane.maxSpeed);
    };

    const exitAircraft = () => {
      const e = engineRef.current;
      const plane = e?.activeAircraft;
      if (!e || !plane) return;

      // Airborne E is a deliberate bailout. Keep the aircraft's existing controller
      // alive as an unpiloted dynamic actor so it preserves momentum instead of
      // freezing in the sky, while spawning the character well clear of the airframe.
      if (!plane.onGround) {
        const controller = e.aircraftController ?? new AircraftController(plane, e.collisionSystem, e.airportAircraft, e.worldInteractions);
        const forward = new THREE.Vector3(
          Math.sin(plane.yaw) * Math.cos(plane.pitch),
          Math.sin(plane.pitch),
          Math.cos(plane.yaw) * Math.cos(plane.pitch),
        ).normalize();
        const right = new THREE.Vector3(Math.cos(plane.yaw), 0, -Math.sin(plane.yaw)).normalize();
        const sideSign = plane.id.length % 2 === 0 ? 1 : -1;
        const sideClearance = Math.max(5.8, plane.wingspan * 0.58 + 2.0);
        const tailClearance = Math.max(2.5, plane.length * 0.14);
        const exitPos = plane.position.clone()
          .addScaledVector(right, sideClearance * sideSign)
          .addScaledVector(forward, -tailClearance);
        exitPos.y += 0.55;

        const inheritedVelocity = controller.getWorldVelocity()
          .multiplyScalar(0.82)
          .addScaledVector(right, sideSign * 3.2);
        inheritedVelocity.y = Math.min(inheritedVelocity.y - 2.4, -1.6);

        plane.inUse = false;
        if (multiplayerRef.current.state.isInRoom) {
          multiplayerRef.current.releaseAircraft(plane.id);
        }
        e.freeAircraftControllers.set(plane.id, controller);
        e.activeAircraft = null;
        e.aircraftController = null;
        e.playerMovement.resetForTeleport(exitPos, plane.yaw, false);
        e.playerMovement.velocity.copy(inheritedVelocity);
        e.playerMovement.isGrounded = false;
        e.playerMesh.position.copy(exitPos);
        e.playerMesh.rotation.set(-0.28, plane.yaw, sideSign * 0.10);
        e.playerMesh.visible = true;
        e.parachuteController?.destroy();
        e.parachuteController = new ParachuteController(e.scene, inheritedVelocity, plane.yaw);
        // Start the parachute camera directly behind the bailout heading, then let
        // the player orbit it freely with the normal mouse-drag camera controls.
        e.cameraAngle = plane.yaw;
        e.cameraPitch = 0.32;
        e.cameraDistance = 7.2;
        e.cameraTargetDistance = 7.2;
        setAircraftHud(null);
        setParachuteHud({ mode: 'freefall', altitude: 0, verticalSpeed: inheritedVelocity.y, deployment: 0 });
        setInVehicle(false);
        soundManager.stopEngine();
        playSoundEffect('jump');
        showTemporaryNotification('Bailout', 'FREEFALL — press SPACE to deploy your parachute.');
        return;
      }

      if (Math.abs(plane.speed) > 3.2 || Math.abs(plane.verticalSpeed) > 1.2) {
        showTemporaryNotification(plane.name, 'Come to a near stop before exiting on the ground.');
        return;
      }
      const right = new THREE.Vector3(Math.cos(plane.yaw),0,-Math.sin(plane.yaw));
      const forward = new THREE.Vector3(Math.sin(plane.yaw),0,Math.cos(plane.yaw));
      const ground = e.collisionSystem.getGroundHeightNear(plane.position.x, plane.position.z, plane.position.y, 0.12, 4.0, 18);
      const sideDistance = Math.max(3.4, plane.wingspan * 0.36);
      const candidates = [
        plane.position.clone().addScaledVector(right,-sideDistance),
        plane.position.clone().addScaledVector(right,sideDistance),
        plane.position.clone().addScaledVector(right,-sideDistance).addScaledVector(forward,-2.0),
        plane.position.clone().addScaledVector(right,sideDistance).addScaledVector(forward,-2.0),
      ];
      let safe: THREE.Vector3 | null = null;
      for (const raw of candidates) {
        raw.y = ground;
        safe = e.collisionSystem.findSafePositionOnLevel(raw,0.68,2.0,3.0,1.8,false);
        if (safe) break;
      }
      if (!safe) {
        showTemporaryNotification(plane.name, 'No safe space beside the aircraft. Taxi somewhere clear and try again.');
        return;
      }
      plane.inUse = false;
      e.freeAircraftControllers.delete(plane.id);
      e.activeAircraft = null;
      e.aircraftController = null;
      e.playerMovement.resetForTeleport(safe, plane.yaw, true);
      e.playerMesh.position.copy(safe);
      e.playerMesh.rotation.set(0,plane.yaw,0);
      e.playerMesh.visible = true;
      setAircraftHud(null);
      setParachuteHud(null);
      setInVehicle(false);
      soundManager.stopEngine();
      playSoundEffect('doorOpen');
      recordSafeCheckpoint(e,safe,plane.yaw);
    };

    const getNearbyVehicle = (pos: THREE.Vector3, radius = 4.2) => {
      let best: Vehicle | null = null;
      let bestDist = radius;

      // TrafficManager owns the authoritative live traffic registry. engine.vehicles
      // is also kept for shared collision/damage systems, but using only that snapshot
      // can make a later-added/recovered route car (notably airport traffic) visible
      // yet impossible to interact with. Query both registries and de-duplicate by
      // object identity so hijacking is location-independent.
      const candidates = new Set<Vehicle>([...engine.vehicles, ...engine.trafficManager.vehicles]);
      const bodyBox = new THREE.Box3();
      const closest = new THREE.Vector3();
      for (const vehicle of candidates) {
        if (vehicle.inUse) continue;
        const dy = Math.abs(pos.y - vehicle.mesh.position.y);
        if (dy > 3.5) continue;

        // Use distance to the rendered vehicle body rather than just its root pivot.
        // This keeps ordinary cars easy to enter beside wide airport roads while
        // retaining the same interaction radius around the actual body.
        bodyBox.setFromObject(vehicle.mesh);
        bodyBox.clampPoint(pos, closest);
        const bodyDistance = Math.hypot(pos.x - closest.x, pos.z - closest.z);
        const centerDistance = Math.hypot(pos.x - vehicle.mesh.position.x, pos.z - vehicle.mesh.position.z);
        const d = Math.min(bodyDistance, centerDistance);
        if (d < bestDist) {
          bestDist = d;
          best = vehicle;
        }
      }

      // Keep the shared vehicle registry coherent if TrafficManager supplied a live
      // car that was not present in the original snapshot. This means subsequent
      // collision, damage and exit logic treats the hijacked airport car identically
      // to a city traffic car.
      if (best && !engine.vehicles.includes(best)) engine.vehicles.push(best);
      return best;
    };

    const getNearbyLandmark = (pos: THREE.Vector3, radius = 7.0) => {
      let best: MapLandmark | null = null;
      let bestDist = radius;
      for (const landmark of allLandmarks) {
        const d = Math.hypot(pos.x - landmark.x, pos.z - landmark.z);
        if (d < bestDist) {
          bestDist = d;
          best = landmark;
        }
      }
      return best;
    };

    const serviceHeroGarage = () => {
      const e = engineRef.current;
      if (!e || e.activeVehicle) return;
      let repaired = 0;
      for (const vehicle of e.vehicles) {
        if (!vehicle.isHeroCar) continue;
        if ((vehicle.damage ?? 0) > 0 || vehicle.wrecked) repaired += 1;
        vehicle.damage = 0;
        vehicle.wrecked = false;
        vehicle.mesh.userData.wrecked = false;
        vehicle.mesh.userData.wreckMessageShown = false;
        vehicle.mesh.rotation.z = 0;
        vehicle.speed = 0;
      }
      playSoundEffect('fanfare');
      showTemporaryNotification(
        'Hero Garage Service',
        repaired > 0
          ? `Service complete. ${repaired} hero car${repaired === 1 ? '' : 's'} repaired and ready to cause more problems.`
          : 'All five hero cars are already in perfect condition.'
      );
    };


    const resetHeroGarageCars = () => {
      const e = engineRef.current;
      if (!e || e.activeVehicle || e.vehicleEntryActive) return;

      const assigned = goldenrod.playerGarage.carBays;
      const heroCars = e.vehicles.filter((vehicle) => vehicle.isHeroCar);
      const canonicalCars = new Set<Vehicle>();
      const placedBounds: THREE.Box3[] = [];
      let duplicatesRemoved = 0;
      let missingRestored = 0;

      const syncVehicleTransform = (vehicle: Vehicle, bay: (typeof assigned)[number], position: THREE.Vector3) => {
        vehicle.mesh.position.copy(position);
        vehicle.mesh.rotation.set(0, bay.rotationY, 0);
        vehicle.mesh.updateMatrixWorld(true);
        vehicle.speed = 0;
        vehicle.yaw = bay.rotationY;
        vehicle.rotationY = bay.rotationY;
        vehicle.inUse = false;
        if (vehicle.position instanceof THREE.Vector3) vehicle.position.copy(position);
        else vehicle.position = position.clone();
        // Intentionally DO NOT touch damage, wrecked, tuning, ownership or other
        // custom state. This machine is only a physical garage-position reset.
      };

      assigned.forEach((bay, bayIndex) => {
        const expectedId = `hero_car_${bayIndex}`;
        const matches = heroCars.filter((vehicle) => (vehicle.type ?? vehicle.modelType) === bay.type);
        let vehicle = matches.find((candidate) => candidate.id === expectedId) ?? matches[0];

        // If a hero car somehow disappeared entirely, recreate only that missing
        // model so the machine still fulfils its promise to restore all five bays.
        if (!vehicle) {
          const factory = heroFactories[bay.type];
          if (!factory) return;
          const mesh = factory();
          const tuning = heroTuning[bay.type] ?? { maxSpeed: 100, acceleration: 38 };
          vehicle = {
            id: expectedId,
            type: bay.type,
            name: bay.name,
            mesh,
            position: bay.pos.clone(),
            yaw: bay.rotationY,
            rotationY: bay.rotationY,
            speed: 0,
            maxSpeed: tuning.maxSpeed,
            acceleration: tuning.acceleration,
            isHeroCar: true,
            inUse: false,
            isOccupied: false,
            damage: 0,
          };
          scene.add(mesh);
          e.vehicles.push(vehicle);
          missingRestored += 1;
        }

        canonicalCars.add(vehicle);

        // Start at the authored bay centre. Only nudge within that same bay when
        // real rendered bounds would overlap static geometry (for example a pylon)
        // or another already-reset hero car.
        const xOffsets = [0, -0.55, 0.55, -1.1, 1.1, -1.65, 1.65, -2.2, 2.2];
        const zOffsets = [0, 0.45, -0.45];
        let chosen: { position: THREE.Vector3; bounds: THREE.Box3 } | null = null;

        for (const zOffset of zOffsets) {
          for (const xOffset of xOffsets) {
            const x = bay.pos.x + xOffset;
            const z = bay.pos.z + zOffset;
            const ground = e.collisionSystem.getGroundHeightNear(x, z, bay.pos.y + 0.3, bay.pos.y, 0.9, 2.5);
            const candidate = new THREE.Vector3(x, ground + 0.08, z);
            vehicle.mesh.position.copy(candidate);
            vehicle.mesh.rotation.set(0, bay.rotationY, 0);
            vehicle.mesh.updateMatrixWorld(true);
            const bounds = new THREE.Box3().setFromObject(vehicle.mesh).expandByVector(new THREE.Vector3(0.32, 0.06, 0.32));
            if (overlapsStaticCollider(bounds)) continue;
            if (placedBounds.some((other) => other.intersectsBox(bounds))) continue;
            chosen = { position: candidate, bounds };
            break;
          }
          if (chosen) break;
        }

        if (!chosen) {
          // Deterministic same-floor fallback: never use a world origin, train-track
          // coordinate or unrelated generic spawn location.
          const ground = e.collisionSystem.getGroundHeightNear(bay.pos.x, bay.pos.z, bay.pos.y + 0.3, bay.pos.y, 0.9, 2.5);
          const candidate = new THREE.Vector3(bay.pos.x, ground + 0.08, bay.pos.z);
          vehicle.mesh.position.copy(candidate);
          vehicle.mesh.rotation.set(0, bay.rotationY, 0);
          vehicle.mesh.updateMatrixWorld(true);
          chosen = {
            position: candidate,
            bounds: new THREE.Box3().setFromObject(vehicle.mesh).expandByVector(new THREE.Vector3(0.32, 0.06, 0.32)),
          };
        }

        syncVehicleTransform(vehicle, bay, chosen.position);
        placedBounds.push(chosen.bounds.clone());
      });

      // Remove only accidental duplicate hero-car instances. Traffic vehicles and
      // the five canonical owned cars are untouched.
      for (let i = e.vehicles.length - 1; i >= 0; i--) {
        const vehicle = e.vehicles[i];
        if (!vehicle.isHeroCar || canonicalCars.has(vehicle)) continue;
        scene.remove(vehicle.mesh);
        disposeTransientObject3D(vehicle.mesh);
        e.vehicles.splice(i, 1);
        duplicatesRemoved += 1;
      }

      playSoundEffect('fanfare');
      const details: string[] = ['All five personal cars returned to their assigned garage bays.'];
      if (duplicatesRemoved > 0) details.push(`${duplicatesRemoved} accidental duplicate${duplicatesRemoved === 1 ? '' : 's'} removed.`);
      if (missingRestored > 0) details.push(`${missingRestored} missing car${missingRestored === 1 ? '' : 's'} restored.`);
      details.push('Damage, tuning and ownership settings were preserved.');
      showTemporaryNotification('CAR RESET MACHINE', details.join(' '));
    };

    const toggleJailCell = () => {
      const e = engineRef.current;
      if (!e) return;
      e.cellDoorOpen = !e.cellDoorOpen;
      e.cellDoorTargetRotation = e.cellDoorOpen ? -1.1 : 0.35;
      // Collision now follows the visible door instead of leaving an invisible wall.
      e.collisionSystem.setColliderEnabled('ps_jail_cell_door', !e.cellDoorOpen);
      playSoundEffect('doorOpen');
      if (e.cellDoorOpen) {
        const guards = e.npcManager.getNPCsInRadius(springfield.jail.cellDoor.pos, 14)
          .filter((n) => n.name.includes('Wiggum') || n.name.includes('Lou'));
        guards.forEach((guard, idx) => {
          e.npcManager.say(guard, idx === 0 ? 'HEY! YOU CAN\'T DO THAT!' : 'Wait... was that unlocked?', 3);
        });
        setActiveDialogue({ speaker: 'Officer Lou', text: 'The cell is open, but you are NOT leaving the station. Get through me first!' });
      }
    };

    const startPokemonCenterHealing = () => {
      const e = engineRef.current;
      if (!e || e.healingActive || !e.hasChosenStarter || e.activeVehicle || e.switchAnimator.active) return;

      e.healingActive = true;
      e.healingTimer = 3.0;
      e.playerMovement.velocity.set(0, 0, 0);
      e.keys['KeyQ'] = false;
      e.keys['KeyF'] = false;
      setPoliwagWaterGunDrawn(e.playerMesh, false);

      const ball = createPokeBallModel();
      ball.name = 'pokemon_center_healing_ball';
      ball.scale.setScalar(1.45);
      ball.position.copy(goldenrod.pokemonCenter.bedPos);
      scene.add(ball);
      e.healingBall = ball;
      e.playerMesh.visible = false;

      const floorAtBed = e.collisionSystem.getGroundHeight(
        goldenrod.pokemonCenter.bedPos.x,
        goldenrod.pokemonCenter.bedPos.z,
        0.12
      );
      e.playerMovement.position.set(goldenrod.pokemonCenter.bedPos.x, floorAtBed, goldenrod.pokemonCenter.bedPos.z);
      e.playerMesh.position.copy(e.playerMovement.position);

      particles.emitRecallSpark(goldenrod.pokemonCenter.bedPos.clone(), 0xff6f91);
      playSoundEffect('fanfare');
      showTemporaryNotification(
        'Pokémon Center',
        'Healing started. Three seconds on the healing bed and you’ll be good as new!'
      );
      setInteractionPrompt('[Pokémon Center] Healing... 3');
    };


    const trainLocalBlocked = (x: number, z: number, radius = 0.46) => {
      const b = goldenrod.trainService.trainInteriorBounds;
      if (x - radius < b.minX || x + radius > b.maxX || z - radius < b.minZ || z + radius > b.maxZ) return true;
      return goldenrod.trainService.trainInteriorBlockers.some((box) =>
        x + radius > box.minX && x - radius < box.maxX && z + radius > box.minZ && z - radius < box.maxZ
      );
    };

    /**
     * Find a legal train-local spawn just inside the selected doorway. The old
     * boarding position used z=1.28 even though the interior bounds + player
     * radius only allow the player centre to reach about z=1.16. That meant the
     * player began every ride already penetrating the carriage boundary and tiny
     * movement steps were rejected until they appeared to "unstick". Always
     * validate the entry point against the exact same rules used while walking.
     */
    const getSafeTrainBoardingLocalPosition = (doorIndex: number) => {
      const localDoor = goldenrod.trainService.trainDoorLocalPositions[doorIndex] ?? goldenrod.trainService.trainDoorLocalPositions[0];
      const inwardSign = localDoor.z >= 0 ? 1 : -1;
      // Start comfortably inside the aisle, then progressively try the centre.
      const candidateDepths = [0.92, 0.72, 0.50, 0.25, 0.0];
      for (const depth of candidateDepths) {
        const z = inwardSign * depth;
        if (!trainLocalBlocked(localDoor.x, z)) {
          return new THREE.Vector3(localDoor.x, goldenrod.trainService.trainInteriorFloorY, z);
        }
      }
      // The carriage-door centre is intentionally kept clear of seats. This is a
      // deterministic in-car fallback, never an unrelated world coordinate.
      return new THREE.Vector3(
        THREE.MathUtils.clamp(localDoor.x, goldenrod.trainService.trainInteriorBounds.minX + 0.6, goldenrod.trainService.trainInteriorBounds.maxX - 0.6),
        goldenrod.trainService.trainInteriorFloorY,
        0
      );
    };

    const getNearestTrainDoor = (worldPos: THREE.Vector3) => {
      if (!goldenrod.trainService.isTrainStopped()) return null;
      const doors = goldenrod.trainService.getTrainDoorWorldPositions();
      let bestIndex = -1;
      let bestDistance = Infinity;
      doors.forEach((doorPos, i) => {
        const d = worldPos.distanceTo(doorPos);
        if (d < bestDistance) { bestDistance = d; bestIndex = i; }
      });
      return bestIndex >= 0 ? { index: bestIndex, distance: bestDistance, world: doors[bestIndex] } : null;
    };

    const boardMagnetTrain = (doorIndex: number) => {
      const e = engineRef.current;
      if (!e || !goldenrod.trainService.isTrainStopped()) return;
      const safeEntry = getSafeTrainBoardingLocalPosition(doorIndex);
      e.vehicleSurfaceSupport = null;
      e.trainRideActive = true;
      e.trainRideLocalPosition.copy(safeEntry);
      e.trainRideJumpOffset = 0;
      e.trainRideVerticalVelocity = 0;
      e.trainRideJumpLatch = false;
      // Platform is on the +Z side, so face down the aisle on boarding. This means
      // W immediately walks into the carriage instead of accidentally pressing
      // the player back against the door because of their outside-world heading.
      e.playerMovement.yaw = Math.PI;
      e.cameraAngle = Math.PI;
      e.playerMovement.velocity.set(0, 0, 0);
      e.playerMovement.isGrounded = true;
      goldenrod.trainService.trainMesh.updateWorldMatrix(true, false);
      const world = goldenrod.trainService.trainMesh.localToWorld(e.trainRideLocalPosition.clone());
      e.playerMovement.position.copy(world);
      e.playerMesh.position.copy(world);
      e.playerMesh.visible = true;
      setInteractionPrompt('Magnet Train • WASD move inside • E talk/exit at a station');
      const station = goldenrod.trainService.getStoppedStation();
      showTemporaryNotification(
        'Magnet Train',
        station === 'goldenrod'
          ? 'All aboard for Springfield! You can walk around the carriage while we travel.'
          : 'All aboard for Goldenrod! Feel free to move around and talk to passengers.'
      );
      playSoundEffect('doorOpen');
    };

    const exitMagnetTrain = (doorIndex: number) => {
      const e = engineRef.current;
      if (!e || !e.trainRideActive || !goldenrod.trainService.isTrainStopped()) return;
      const doorWorld = goldenrod.trainService.getTrainDoorWorldPositions()[doorIndex];
      if (!doorWorld) return;
      const exit = doorWorld.clone();
      // Platforms are on the +Z side of the train. Place the player well inside
      // the platform rather than directly on the door threshold.
      exit.z += 2.5;
      exit.y = e.collisionSystem.getGroundHeightNear(exit.x, exit.z, 12.95, 12.95, 1.2, 3.0);
      e.trainRideActive = false;
      e.trainRideJumpOffset = 0;
      e.trainRideVerticalVelocity = 0;
      e.trainRideJumpLatch = false;
      e.playerMovement.position.copy(exit);
      e.playerMovement.velocity.set(0, 0, 0);
      e.playerMovement.isGrounded = true;
      e.playerMesh.position.copy(exit);
      e.playerMesh.visible = true;
      showTemporaryNotification(
        'Magnet Train',
        goldenrod.trainService.getStoppedStation() === 'goldenrod'
          ? 'Welcome to Goldenrod City.'
          : 'Welcome to Springfield.'
      );
      playSoundEffect('door');
    };

    const moveInsideTrain = (dx: number, dz: number) => {
      const e = engineRef.current;
      if (!e) return;
      const current = e.trainRideLocalPosition;
      const nx = current.x + dx;
      const nz = current.z + dz;
      if (!trainLocalBlocked(nx, nz)) {
        current.x = nx; current.z = nz;
      } else if (!trainLocalBlocked(nx, current.z)) {
        current.x = nx;
      } else if (!trainLocalBlocked(current.x, nz)) {
        current.z = nz;
      }
      current.y = goldenrod.trainService.trainInteriorFloorY;
    };

    const nearestTrainPassenger = () => {
      const e = engineRef.current;
      if (!e || !e.trainRideActive) return null;
      let best: { index: number; distance: number } | null = null;
      goldenrod.trainService.passengers.forEach((passenger, index) => {
        const dx = passenger.localPos.x - e.trainRideLocalPosition.x;
        const dz = passenger.localPos.z - e.trainRideLocalPosition.z;
        const distance = Math.hypot(dx, dz);
        if (!best || distance < best.distance) best = { index, distance };
      });
      return best;
    };

    type ElevatorLiftKey = NonNullable<EngineState['elevatorRideLift']>;
    type ElevatorLevel = NonNullable<EngineState['elevatorRideDestination']>;
    const getElevatorLift = (key: ElevatorLiftKey) => {
      if (key === 'tower_west' || key === 'tower_east') {
        const towerKey = key === 'tower_west' ? 'west' : 'east';
        const lift = goldenrod.twinTowerService.elevators[towerKey];
        return {
          cabin: lift.cabin,
          groundPos: lift.groundPos,
          upperPos: lift.roofPos,
          upperLevel: 'roof' as const,
          requestLevel: (level: ElevatorLevel) => lift.requestLevel(level === 'roof' ? 'roof' : 'ground'),
          getState: () => lift.getState(),
          label: `${towerKey === 'west' ? 'West' : 'East'} Twin Tower Lift`,
        };
      }
      const lift = key === 'springfield' ? goldenrod.trainService.springfieldElevator : goldenrod.trainService.elevator;
      return {
        cabin: lift.cabin,
        groundPos: lift.groundPos,
        upperPos: lift.platformPos,
        upperLevel: 'platform' as const,
        requestLevel: (level: ElevatorLevel) => lift.requestLevel(level === 'platform' ? 'platform' : 'ground'),
        getState: () => lift.getState(),
        label: 'Magnet Train Lift',
      };
    };

    const startElevatorInteraction = (liftKey: ElevatorLiftKey, from: ElevatorLevel) => {
      const e = engineRef.current;
      if (!e) return;
      const lift = getElevatorLift(liftKey);
      const state = lift.getState();
      if (state.moving) {
        showTemporaryNotification(lift.label, 'Lift is moving. It will be here in a moment.');
        return;
      }
      if (state.level !== from) {
        lift.requestLevel(from);
        showTemporaryNotification(lift.label, `Lift called to ${from === 'ground' ? 'lobby' : from} level.`);
        playSoundEffect('door');
        return;
      }
      if (!state.doorsOpen) {
        showTemporaryNotification(lift.label, 'Doors are opening.');
        return;
      }
      const isTowerLift = liftKey === 'tower_west' || liftKey === 'tower_east';
      if (isTowerLift) {
        lift.cabin.updateWorldMatrix(true, false);
        const cabinCenter = lift.cabin.getWorldPosition(new THREE.Vector3());
        const insideCabin = Math.hypot(
          e.playerMovement.position.x - cabinCenter.x,
          e.playerMovement.position.z - cabinCenter.z
        ) < 1.72 && Math.abs(e.playerMovement.position.y - cabinCenter.y) < 1.45;
        if (!insideCabin) {
          showTemporaryNotification(lift.label, 'Doors are open — walk inside and use the control panel.');
          return;
        }
      }
      const destination: ElevatorLevel = from === 'ground' ? lift.upperLevel : 'ground';
      e.vehicleSurfaceSupport = null;
      e.elevatorRideActive = true;
      e.elevatorRideDestination = destination;
      e.elevatorRideLift = liftKey;
      e.playerMovement.velocity.set(0, 0, 0);
      lift.cabin.updateWorldMatrix(true, false);
      const ridePos = lift.cabin.localToWorld(new THREE.Vector3(0, 0.34, 0.25));
      e.playerMovement.position.copy(ridePos);
      e.playerMesh.position.copy(ridePos);
      lift.requestLevel(destination);
      showTemporaryNotification(lift.label, destination === 'roof' ? 'Going up to the rooftop.' : destination === 'platform' ? 'Going up to the platform.' : 'Going down to the lobby.');
      playSoundEffect('door');
    };

    const handleInteraction = () => {
      const e = engineRef.current;
      if (!e) return;
      if (e.healingActive || e.vehicleEntryActive || e.elevatorRideActive || e.deathSequenceActive || e.hospitalRecoveryActive) return;
      if (e.seated) {
        standUpFromSeat();
        return;
      }
      if (e.grabbedNpcId) {
        handleGrab();
        return;
      }
      if (e.toothlessMounted) {
        attemptToothlessDismount();
        return;
      }
      if (e.charizardFlightActive) {
        showTemporaryNotification('Charizard', 'Land before interacting with doors, seats or vehicles.');
        return;
      }
      if (e.parachuteController) return;
      if (e.toothlessMounting || e.milesInteractionActive) return;
      if (e.activeAircraft) {
        exitAircraft();
        return;
      }
      if (e.activeVehicle) {
        exitVehicle();
        return;
      }
      const pos = e.playerMovement.position;

      // Check Arcade Machine interaction
      for (const machine of allArcadeMachines) {
        if (pos.distanceTo(machine.position) < 3.2) {
          enterArcadeModeRef.current(machine);
          return;
        }
      }

      if (e.hasChosenStarter) {
        const nearbyPlane = getNearbyAircraft(pos);
        if (nearbyPlane) {
          enterAircraft(nearbyPlane);
          return;
        }
      }

      const footballToggle = e.footballManager.togglePlayerJoin(pos);
      if (footballToggle.changed) {
        showTemporaryNotification('Springfield Football', footballToggle.message);
        playSoundEffect(footballToggle.joined ? 'fanfare' : 'doorOpen');
        return;
      }

      // Inside the moving train, E talks to a nearby passenger. At a station,
      // standing near either carriage door lets the player step back onto the platform.
      if (e.trainRideActive) {
        const nearestDoorLocal = goldenrod.trainService.trainDoorLocalPositions
          .map((door, index) => ({ index, distance: Math.hypot(door.x - e.trainRideLocalPosition.x, door.z - e.trainRideLocalPosition.z) }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (goldenrod.trainService.isTrainStopped() && nearestDoorLocal && nearestDoorLocal.distance < 3.5) {
          exitMagnetTrain(nearestDoorLocal.index);
          return;
        }
        const passengerHit = nearestTrainPassenger();
        if (passengerHit && passengerHit.distance < 2.15) {
          const passenger = goldenrod.trainService.passengers[passengerHit.index];
          const last = Number(passenger.mesh.userData.lastDialogueIndex ?? -1);
          let next = Math.floor(Math.random() * passenger.dialogues.length);
          if (passenger.dialogues.length > 1 && next === last) next = (next + 1) % passenger.dialogues.length;
          passenger.mesh.userData.lastDialogueIndex = next;
          setActiveDialogue({ speaker: passenger.name, text: passenger.dialogues[next] });
          e.trainRideLastPassenger = passengerHit.index;
          return;
        }
        showTemporaryNotification('Magnet Train', goldenrod.trainService.isTrainStopped() ? 'Move closer to a carriage door to exit.' : 'The train is moving. Walk around, enjoy the view, or talk to a passenger.');
        return;
      }

      // User-friendly boarding radius while the train is dwelling at a platform.
      if (goldenrod.trainService.isTrainStopped()) {
        const trainDoor = getNearestTrainDoor(pos);
        if (trainDoor && trainDoor.distance < 4.8 && pos.y > 10.5) {
          boardMagnetTrain(trainDoor.index);
          return;
        }
      }

      if (e.hasChosenStarter && pos.distanceTo(goldenrod.pokemonCenter.receptionistPos) < 3.8) {
        startPokemonCenterHealing();
        return;
      }

      if (e.hasChosenStarter) {
        const garageServiceDistance = pos.distanceTo(goldenrod.playerGarage.servicePos);
        const garageResetDistance = pos.distanceTo(goldenrod.playerGarage.resetPos);
        if (garageResetDistance < 3.4 || garageServiceDistance < 3.4) {
          if (garageResetDistance <= garageServiceDistance) resetHeroGarageCars();
          else serviceHeroGarage();
          return;
        }
      }

      const nearbyStarter = goldenrod.oakLab.starters
        .map((s) => ({ ...s, distance: pos.distanceTo(s.pos) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearbyStarter && nearbyStarter.distance < 3.35) {
        openStarterSelection(nearbyStarter);
        return;
      }
      if (pos.distanceTo(goldenrod.oakLab.oakPos) < 4.0) {
        setActiveDialogue({
          speaker: 'Professor Oak',
          text: e.hasChosenStarter
            ? 'Walk up to Pikachu, Charmander or Poliwag whenever you want to change your active Pokémon.'
            : 'Walk up to Pikachu, Charmander or Poliwag, press E, then confirm your choice!',
        });
        return;
      }

      // Actual moving lift. If it is on the other level, the same button first
      // calls it; once the cabin arrives and opens, E starts the ride.
      for (const towerKey of ['west', 'east'] as const) {
        const lift = goldenrod.twinTowerService.elevators[towerKey];
        if (pos.distanceTo(lift.groundPos) < 4.15) {
          startElevatorInteraction(towerKey === 'west' ? 'tower_west' : 'tower_east', 'ground');
          return;
        }
        if (pos.distanceTo(lift.roofPos) < 4.35) {
          startElevatorInteraction(towerKey === 'west' ? 'tower_west' : 'tower_east', 'roof');
          return;
        }
      }
      if (pos.distanceTo(goldenrod.trainService.eastElevatorGround) < 4.1) {
        startElevatorInteraction('goldenrod', 'ground');
        return;
      }
      if (pos.distanceTo(goldenrod.trainService.eastElevatorPlatform) < 4.6) {
        startElevatorInteraction('goldenrod', 'platform');
        return;
      }
      if (pos.distanceTo(goldenrod.trainService.westElevatorGround) < 4.2) {
        startElevatorInteraction('springfield', 'ground');
        return;
      }
      if (pos.distanceTo(goldenrod.trainService.westElevatorPlatform) < 4.7) {
        startElevatorInteraction('springfield', 'platform');
        return;
      }

      if (pos.distanceTo(springfield.jail.cellDoor.pos) < 3.5) {
        toggleJailCell();
        return;
      }

      const nearDoor = e.collisionSystem.getNearbyDoor(pos);
      if (nearDoor) {
        if (nearDoor.id === 'police_station_door' && worldProgressRef.current.jailbreakActive) {
          const guard = e.npcManager.getNPCById('jail_escape_guard');
          const guardAlive = !!guard && guard.state !== 'knocked_out' && !guard.mesh.userData.guardDefeated;
          if (guardAlive) {
            setActiveDialogue({ speaker: 'Officer Lou', text: 'EXIT LOCKED. You want out? Beat me first!' });
            e.npcManager.say(guard, 'BACK IN THE CELL!', 1.8);
            return;
          }
        }
        const opened = nearDoor.toggle();
        showTemporaryNotification(nearDoor.houseName, opened ? `${nearDoor.name} opened.` : `${nearDoor.name} closed.`);
        return;
      }

      if (e.hasChosenStarter) {
        const ashDist = pos.distanceTo(springfield.simpsonsHouse.ashMesh.position);
        if (ashDist < 4.5 && !e.ashBattle.state.isActive) {
          if (e.ashHostileActive) {
            setActiveDialogue({ speaker: 'Ash Ketchum', text: 'Charizard is defending me right now! Finish this or back off before starting the proper challenge.' });
            return;
          }
          // Official challenge is police-free. Clear any pursuit and meter before
          // Ash creates the first boss so battle actions cannot inherit police state.
          clearPolicePursuit(true, false);
          const log = e.ashBattle.startBattle(pos);
          setActiveDialogue({ speaker: 'Ash Ketchum', text: log });
          return;
        }

        const toothless = e.npcManager.getNPCById('cameo_toothless');
        if (toothless && toothless.mesh.visible && pos.distanceTo(toothless.mesh.position) < 4.2 && toothless.state !== 'knocked_out') {
          startToothlessMount();
          return;
        }

        const miles = e.npcManager.getNPCById('cameo_miles');
        if (miles && miles.mesh.visible && pos.distanceTo(miles.mesh.position) < 3.8 && miles.state !== 'knocked_out') {
          startMilesShoulderInteraction(miles);
          return;
        }

        const vehicle = getNearbyVehicle(pos);
        if (vehicle) {
          enterVehicle(vehicle);
          return;
        }
      }

      const nearbySeat = findNearbySeat(pos, 2.25);
      if (nearbySeat) {
        startSitting(nearbySeat);
        return;
      }

      const npc = e.npcManager.getNearbyNPC(pos, 3.6);
      if (npc) {
        const text = e.npcManager.getDialogue(npc);
        // NPCManager already renders the character's world-space speech bubble.
        // Do not duplicate the same line in the global bottom HUD dialogue card.
        setActiveDialogue(null);
        e.npcManager.say(npc, text, 3.4);
        playSoundEffect('click');
        return;
      }

      const landmark = getNearbyLandmark(pos);
      if (landmark) {
        showTemporaryNotification(
          landmark.name,
          landmark.id === 'springfield_town_square'
            ? 'Jebediah Springfield watches over the town. He is probably judging your driving.'
            : landmark.id === 'goldenrod_radio_tower'
            ? 'Goldenrod Radio Tower. One of the city landmarks tracked by your World Goals.'
            : landmark.id === 'player_garage'
            ? 'Your five-car hero garage. The blue terminal services your cars; the orange CAR RESET MACHINE returns all five to their assigned bays.'
            : `You discovered ${landmark.name}.`
        );
        playSoundEffect('click');
      }
    };

    const spawnPoliceUnit = (player: THREE.Vector3, index: number) => {
      const factory = index % 3 === 2 ? createPoliceCharger : createPoliceCrownVic;
      const mesh = factory();

      // Find a genuinely clear spawn around the pursuit instead of dropping a cop
      // inside a building/wall and letting physics explode on the first tick.
      let pos: THREE.Vector3 | null = null;
      for (let attempt = 0; attempt < 14; attempt++) {
        const angle = index * 1.7 + attempt * 0.74 + Math.random() * 0.25;
        const distance = 40 + (index % 3) * 10 + (attempt % 3) * 5;
        const candidate = player.clone().add(new THREE.Vector3(Math.sin(angle) * distance, 0, Math.cos(angle) * distance));
        const roadSpawn = engine.trafficManager.getNearestRoadPose(candidate, 18);
        if (roadSpawn) candidate.copy(roadSpawn.point);
        candidate.y = collisionSystem.getGroundHeightNear(candidate.x, candidate.z, player.y, player.y, 1.2, 3.5) + 0.08;
        if (isOpenRiverWater(candidate)) continue;
        const clearOfPolice = engine.policeAIs.every((unit) => planarDistance(unit.getVehiclePosition(), candidate) > 7.5);
        if (clearOfPolice && collisionSystem.canOccupy(candidate, 1.8, 2.2)) {
          pos = candidate;
          break;
        }
      }
      if (!pos) {
        if (isOpenRiverWater(player)) {
          // Pursuit began while the player was already in the river. Spawn the road
          // unit on dry land rather than letting the generic radial fallback put a
          // police cruiser on the water surface.
          const bankSign = index % 2 === 0 ? -1 : 1;
          pos = new THREE.Vector3(bankSign * 58, 0, THREE.MathUtils.clamp(player.z + (index - 2) * 7, -216, 216));
        } else {
          const fallbackAngle = index * 1.9;
          pos = player.clone().add(new THREE.Vector3(Math.sin(fallbackAngle) * 42, 0, Math.cos(fallbackAngle) * 42));
        }
        pos = collisionSystem.findSafePosition(pos, 1.8, 2.2, 12);
        if (isOpenRiverWater(pos)) pos.x = (pos.x < 0 ? -1 : 1) * 56;
        pos.y = collisionSystem.getGroundHeightNear(pos.x, pos.z, player.y, player.y, 1.2, 3.5) + 0.08;
      }

      mesh.position.copy(pos);
      // Spawn ordinary pursuit units aligned with the legal Australian lane heading
      // whenever the spawn came from an authored traffic route. Close-range chase AI
      // may still leave the lane later when intercepting the player.
      const legalRoadPose = engine.trafficManager.getNearestRoadPose(pos, 4.5);
      const spawnYaw = legalRoadPose?.yaw ?? 0;
      mesh.rotation.y = spawnYaw;
      scene.add(mesh);
      const officerMesh = createOfficerLouNPC();
      officerMesh.name = `pursuit_officer_${index}`;
      officerMesh.visible = false;
      scene.add(officerMesh);
      const ai = new PoliceAI(mesh, pos, index, spawnYaw, officerMesh);
      // Pursuit caps are intentionally only modestly above normal traffic/player
      // pace. Police should catch and contain the player, not behave like missiles.
      ai.maxSpeed = 35; // full HIT & RUN response only
      engine.policeAIs.push(ai);
    };

    const ensurePoliceCount = (level: number, player: THREE.Vector3) => {
      const desiredByLevel = [0, 1, 2, 3, 4, 5];
      const desired = desiredByLevel[level] ?? 0;
      while (engine.policeAIs.length < desired) spawnPoliceUnit(player, engine.policeAIs.length);
      while (engine.policeAIs.length > desired) {
        const ai = engine.policeAIs.pop();
        if (ai) {
          scene.remove(ai.mesh);
          disposeTransientObject3D(ai.mesh);
          if (ai.officerMesh) {
            scene.remove(ai.officerMesh);
            disposeTransientObject3D(ai.officerMesh);
          }
        }
      }
    };

    const spawnRoadblock = (level: number, player: THREE.Vector3, yaw: number) => {
      if (level < 3 || !engine.activeVehicle) return;
      // Boats are valid player vehicles, but roadblocks are ROAD-vehicle systems.
      // Never deploy cruisers/barricades onto open river water.
      if (isOpenRiverWater(player)) return;
      const now = performance.now() * 0.001;
      const cooldown = level >= 5 ? 8.5 : level === 4 ? 11 : 14;
      if (now - engine.lastRoadblockAt < cooldown) return;
      if (engine.lastRoadblockPos && planarDistance(engine.lastRoadblockPos, player) < 34) return;

      const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const desiredCenter = player.clone().addScaledVector(forward, 42 + level * 3);
      // Roadblocks are ROAD objects. If the ahead-of-player point lands in the river
      // (or simply off the authored lane network), snap to the nearest legal traffic
      // lane instead of allowing cruisers/barricades to float on the water surface.
      const roadPose = engine.trafficManager.getNearestRoadPose(desiredCenter, 52)
        ?? engine.trafficManager.getNearestRoadPose(player, 60);
      if (!roadPose || isOpenRiverWater(roadPose.point)) return;
      const center = roadPose.point.clone();
      const blockYaw = roadPose.yaw;
      const side = new THREE.Vector3(Math.cos(blockYaw), 0, -Math.sin(blockYaw));
      center.y = collisionSystem.getGroundHeightNear(center.x, center.z, player.y, player.y, 1.2, 3.5) + 0.08;
      if (isOpenRiverWater(center) || !collisionSystem.canOccupy(center, 1.3, 2.0)) return;
      const barricadeHalfWidth = level >= 5 ? 4.0 : 3.25;
      const barrierEdgeA = center.clone().addScaledVector(side, barricadeHalfWidth);
      const barrierEdgeB = center.clone().addScaledVector(side, -barricadeHalfWidth);
      if (isOpenRiverWater(barrierEdgeA) || isOpenRiverWater(barrierEdgeB)) return;
      engine.lastRoadblockAt = now;
      engine.lastRoadblockLevel = level;
      engine.lastRoadblockPos = center.clone();

      const laneOffsets = level >= 5 ? [-4.8, 0, 4.8] : [-4.2, 4.2];
      laneOffsets.forEach((offset, idx) => {
        const pos = center.clone().addScaledVector(side, offset);
        if (isOpenRiverWater(pos)) return;
        pos.y = collisionSystem.getGroundHeightNear(pos.x, pos.z, center.y, center.y, 1.0, 2.5) + 0.08;
        if (!collisionSystem.canOccupy(pos, 1.45, 2.2)) return;
        const mesh = idx % 2 === 0 ? createPoliceCrownVic() : createPoliceCharger();
        mesh.position.copy(pos);
        mesh.rotation.y = blockYaw + Math.PI / 2;
        scene.add(mesh);
        engine.roadblocks.push({ mesh, position: pos.clone() });
      });

      // A visible striped barricade closes the visual gap between police cars.
      const barricade = new THREE.Group();
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(level >= 5 ? 8 : 6.5, 0.55, 0.32),
        new THREE.MeshLambertMaterial({ color: 0xffe066 })
      );
      beam.position.y = 0.75;
      barricade.add(beam);
      for (const x of [-2.6, 2.6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 0.22), new THREE.MeshLambertMaterial({ color: 0x222222 }));
        leg.position.set(x, 0.45, 0);
        barricade.add(leg);
      }
      barricade.position.copy(center);
      barricade.rotation.y = blockYaw;
      scene.add(barricade);
      engine.roadblocks.push({ mesh: barricade, position: center.clone() });

      // Keep old roadblocks from accumulating forever.
      while (engine.roadblocks.length > 6) {
        const old = engine.roadblocks.shift();
        if (old) {
          scene.remove(old.mesh);
          disposeTransientObject3D(old.mesh);
        }
      }
      showTemporaryNotification('Police Radio', level === 5 ? 'MAXIMUM CHAOS! Heavy roadblock deployed ahead!' : 'Roadblock deployed ahead!');
    };

    const handlePlayerBusted = () => {
      if (bustedRef.current) return;
      const current = engineRef.current;
      if (current) {
        dropHeldNpcForTransition(current);
        clearSeatState(current);
      }
      bustedRef.current = true;
      setIsBusted(true);
      playSoundEffect('siren');
      window.setTimeout(() => {
        const e = engineRef.current;
        if (!e) return;
        if (e.activeVehicle) {
          e.activeVehicle.inUse = false;
          e.activeVehicle = null;
          e.activeCarPhysics = null;
          setInVehicle(false);
          setCurrentVehicleInfo(null);
        }
        e.playerMesh.visible = true;
        const jailPos = springfield.jail.cellSpawnPos.clone();
        jailPos.y = e.collisionSystem.getGroundHeight(jailPos.x, jailPos.z, 0.12);
        e.playerMovement.position.copy(jailPos);
        e.playerMovement.velocity.set(0, 0, 0);
        e.playerMesh.position.copy(jailPos);
        e.cellDoorOpen = false;
        e.cellDoorTargetRotation = 0.35;
        e.collisionSystem.setColliderEnabled('ps_jail_cell_door', true);
        worldProgressRef.current.jailbreakActive = true;
        const guard = e.npcManager.spawnJailEscapeGuard(springfield.jail.guardFightPos.clone());
        e.jailGuardAttackCooldown = 0.8;
        guard.mesh.userData.defeatAnnounced = false;
        // The station exit stays physically closed until this guard is beaten.
        const stationDoor = e.doors.find((door) => door.id === 'police_station_door');
        stationDoor?.setAutomaticLocked(true);
        stationDoor?.close();
        setWanted(0);
        bustedRef.current = false;
        setIsBusted(false);
        setActiveDialogue({
          speaker: 'Chief Wiggum',
          text: "You're in jail. The cell door is wide enough to escape now... but Officer Lou is guarding the station exit.",
        });
      }, 2200);
    };

    const updateJailEscapeGuard = (dt: number, playerPos: THREE.Vector3) => {
      if (!worldProgressRef.current.jailbreakActive) return;
      const guard = engine.npcManager.getNPCById('jail_escape_guard');
      if (!guard || !guard.mesh.visible) return;

      if (guard.state === 'knocked_out' || (guard.combatHp ?? 1) <= 0) {
        guard.mesh.userData.guardDefeated = true;
        if (!guard.mesh.userData.defeatAnnounced) {
          guard.mesh.userData.defeatAnnounced = true;
          setActiveDialogue({ speaker: 'Officer Lou', text: 'UGH... fine. The front door is unlocked. Get out of here.' });
          const stationDoor = engine.doors.find((door) => door.id === 'police_station_door');
          stationDoor?.setAutomaticLocked(false);
          stationDoor?.open();
          playSoundEffect('fanfare');
        }
        return;
      }

      // Guard becomes aggressive only after the cell door opens. Before that he
      // visibly waits in the corridor rather than wandering away.
      if (!engine.cellDoorOpen) {
        guard.state = 'hostile_guard';
        return;
      }

      guard.state = 'hostile_guard';
      const toPlayer = playerPos.clone().sub(guard.mesh.position).setY(0);
      const dist = toPlayer.length();
      if (dist > 0.001) toPlayer.normalize();
      if (dist > 1.9 && dist < 22) {
        // Still dangerous, but no longer able to sprint-lock the player in a
        // near-continuous baton combo inside the narrow police-station corridor.
        const next = guard.mesh.position.clone().addScaledVector(toPlayer, 5.9 * dt);
        next.y = engine.collisionSystem.getGroundHeightNear(next.x, next.z, guard.mesh.position.y, 0.12, 1.0, 2.5);
        if (engine.collisionSystem.canOccupy(next, 0.48, 1.8)) guard.mesh.position.copy(next);
        guard.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      }

      engine.jailGuardAttackCooldown = Math.max(0, engine.jailGuardAttackCooldown - dt);
      if (dist < 2.25 && engine.jailGuardAttackCooldown <= 0) {
        engine.jailGuardAttackCooldown = 1.15;
        guard.mesh.rotation.z = -0.25;
        engine.npcManager.say(guard, ['STOP!', 'BACK IN THE CELL!', 'YOU ARE NOT ESCAPING!'][Math.floor(Math.random() * 3)], 1.1);
        damagePlayer(8, 'Officer Lou prison baton');
        playSoundEffect('kick');
        engine.cameraShake = Math.max(engine.cameraShake, 0.12);
      }
    };

    const updateInteractionPrompt = (pos: THREE.Vector3) => {
      // Clear walk-up starter targeting before resolving this frame's nearest
      // interaction. The starter branch below enables exactly one ring again.
      for (const starter of goldenrod.oakLab.starters) starter.highlight.visible = false;

      if (engine.trainRideActive) {
        const nearestDoorLocal = goldenrod.trainService.trainDoorLocalPositions
          .map((door, index) => ({ index, distance: Math.hypot(door.x - engine.trainRideLocalPosition.x, door.z - engine.trainRideLocalPosition.z) }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (goldenrod.trainService.isTrainStopped() && nearestDoorLocal && nearestDoorLocal.distance < 3.5) {
          setInteractionPrompt('[E] Exit Magnet Train');
          return;
        }
        const passenger = nearestTrainPassenger();
        if (passenger && passenger.distance < 2.15) {
          setInteractionPrompt(`[E] Talk to ${goldenrod.trainService.passengers[passenger.index].name}`);
          return;
        }
        setInteractionPrompt(goldenrod.trainService.isTrainStopped()
          ? 'Magnet Train stopped • move near a door to exit'
          : 'Magnet Train moving • WASD walk inside • E talk');
        return;
      }
      if (engine.elevatorRideActive) {
        setInteractionPrompt('[Lift] Moving between concourse and platform...');
        return;
      }
      if (engine.healingActive) {
        setInteractionPrompt(`[Pokémon Center] Healing... ${Math.max(1, Math.ceil(engine.healingTimer))}`);
        return;
      }
      if (engine.toothlessMounting) {
        setInteractionPrompt('[Toothless] Climbing onto the saddle...');
        return;
      }
      if (engine.toothlessMounted) {
        setInteractionPrompt('[W/S] Speed  •  [A/D] Turn  •  [SPACE] Ascend  •  [SHIFT] Descend/Land  •  [E] Dismount');
        return;
      }
      if (engine.milesInteractionActive) {
        setInteractionPrompt('[Miles Morales] Special interaction...');
        return;
      }
      if (engine.seated) {
        setInteractionPrompt('[E] Stand up');
        return;
      }
      if (engine.grabbedNpcId) {
        const held = engine.npcManager.getNPCById(engine.grabbedNpcId);
        setInteractionPrompt(`[G] Throw ${held?.name ?? 'NPC'}`);
        return;
      }
      if (engine.parachuteController) {
        setInteractionPrompt(engine.parachuteController.mode === 'freefall'
          ? '[SPACE] DEPLOY PARACHUTE  •  [W/A/S/D] Air steer  •  [LMB DRAG] Look around'
          : '[E] DROP / CUT CHUTE  •  [W] Glide  •  [A/D] Steer  •  [LMB DRAG] Look around');
        return;
      }
      if (engine.activeAircraft) {
        setInteractionPrompt(engine.activeAircraft.onGround
          ? '[W/S] Throttle/Reverse  •  [←/→] Taxi  •  [↑] Rotate  •  [SPACE] Brake  •  [E] Exit'
          : '[W/S] Throttle  •  [↑/↓] Climb/Descend  •  [←/→] Turn  •  [E] Jump out');
        return;
      }
      if (engine.activeVehicle) {
        setInteractionPrompt('[H] Horn  •  [E] Exit Vehicle');
        return;
      }

      // Check Arcade Machine proximity
      for (const machine of allArcadeMachines) {
        if (pos.distanceTo(machine.position) < 3.2) {
          setInteractionPrompt(`[E] Play ${machine.name}  •  Insert Coin`);
          return;
        }
      }
      const footballPrompt = engine.footballManager.getInteractionPrompt(pos);
      if (footballPrompt) {
        setInteractionPrompt(footballPrompt);
        return;
      }
      if (engine.hasChosenStarter && pos.distanceTo(goldenrod.pokemonCenter.receptionistPos) < 3.8) {
        setInteractionPrompt('[E] Ask the Pokémon Center receptionist to heal you');
        return;
      }
      if (engine.hasChosenStarter) {
        const garageServiceDistance = pos.distanceTo(goldenrod.playerGarage.servicePos);
        const garageResetDistance = pos.distanceTo(goldenrod.playerGarage.resetPos);
        if (garageResetDistance < 3.4 || garageServiceDistance < 3.4) {
          setInteractionPrompt(garageResetDistance <= garageServiceDistance
            ? '[E] CAR RESET MACHINE — return all five cars to their garage bays'
            : '[E] Service all five hero cars');
          return;
        }
      }
      // The display Pokémon themselves are the selector. Only the nearest one gets
      // a subtle floor highlight and named interaction prompt.
      let targetedStarter: typeof goldenrod.oakLab.starters[number] | null = null;
      let targetedStarterDistance = Infinity;
      for (const starter of goldenrod.oakLab.starters) {
        starter.highlight.visible = false;
        const distance = pos.distanceTo(starter.pos);
        if (distance < targetedStarterDistance) {
          targetedStarter = starter;
          targetedStarterDistance = distance;
        }
      }
      if (targetedStarter && targetedStarterDistance < 3.45) {
        targetedStarter.highlight.visible = true;
        setInteractionPrompt(`[E] Inspect ${targetedStarter.name}${engine.currentPokemonId === targetedStarter.id && engine.hasChosenStarter ? '  •  ACTIVE' : ''}`);
        return;
      }
      if (goldenrod.trainService.isTrainStopped()) {
        const trainDoor = getNearestTrainDoor(pos);
        if (trainDoor && trainDoor.distance < 4.8 && pos.y > 10.5) {
          setInteractionPrompt(`[E] Board Magnet Train to ${goldenrod.trainService.getStoppedStation() === 'goldenrod' ? 'Springfield' : 'Goldenrod'}`);
          return;
        }
      }
      for (const towerKey of ['west', 'east'] as const) {
        const lift = goldenrod.twinTowerService.elevators[towerKey];
        const state = lift.getState();
        const label = towerKey === 'west' ? 'West Twin Tower' : 'East Twin Tower';
        if (pos.distanceTo(lift.groundPos) < 4.15) {
          lift.cabin.updateWorldMatrix(true, false);
          const center = lift.cabin.getWorldPosition(new THREE.Vector3());
          const inside = Math.hypot(pos.x - center.x, pos.z - center.z) < 1.72 && Math.abs(pos.y - center.y) < 1.45;
          setInteractionPrompt(state.level === 'ground' && state.doorsOpen
            ? (inside ? `[E] Use ${label} lift controls — rooftop` : `${label} lift open — walk inside`)
            : `[E] Call ${label} lift`);
          return;
        }
        if (pos.distanceTo(lift.roofPos) < 4.35) {
          lift.cabin.updateWorldMatrix(true, false);
          const center = lift.cabin.getWorldPosition(new THREE.Vector3());
          const inside = Math.hypot(pos.x - center.x, pos.z - center.z) < 1.72 && Math.abs(pos.y - center.y) < 1.45;
          setInteractionPrompt(state.level === 'roof' && state.doorsOpen
            ? (inside ? `[E] Use ${label} lift controls — lobby` : `${label} lift open — walk inside`)
            : `[E] Call ${label} lift`);
          return;
        }
      }
      if (pos.distanceTo(goldenrod.trainService.eastElevatorGround) < 4.1) {
        const liftState = goldenrod.trainService.elevator.getState();
        setInteractionPrompt(liftState.level === 'ground' && liftState.doorsOpen ? '[E] Ride lift to Magnet Train platform' : '[E] Call Magnet Train lift');
        return;
      }
      if (pos.distanceTo(goldenrod.trainService.eastElevatorPlatform) < 4.6) {
        const liftState = goldenrod.trainService.elevator.getState();
        setInteractionPrompt(liftState.level === 'platform' && liftState.doorsOpen ? '[E] Ride lift to station concourse' : '[E] Call Magnet Train lift');
        return;
      }
      if (pos.distanceTo(goldenrod.trainService.westElevatorGround) < 4.2) {
        const liftState = goldenrod.trainService.springfieldElevator.getState();
        setInteractionPrompt(liftState.level === 'ground' && liftState.doorsOpen ? '[E] Ride Springfield lift to train platform' : '[E] Call Springfield train lift');
        return;
      }
      if (pos.distanceTo(goldenrod.trainService.westElevatorPlatform) < 4.7) {
        const liftState = goldenrod.trainService.springfieldElevator.getState();
        setInteractionPrompt(liftState.level === 'platform' && liftState.doorsOpen ? '[E] Ride Springfield lift to ground level' : '[E] Call Springfield train lift');
        return;
      }
      if (pos.distanceTo(springfield.jail.cellDoor.pos) < 4.2) {
        setInteractionPrompt(engine.cellDoorOpen ? '[E] Close the wide jail cell door' : '[E] Open the wide jail cell door');
        return;
      }
      if (worldProgressRef.current.jailbreakActive) {
        const guard = engine.npcManager.getNPCById('jail_escape_guard');
        if (guard && guard.state !== 'knocked_out' && pos.distanceTo(guard.mesh.position) < 7) {
          setInteractionPrompt('[F] DEFEAT OFFICER LOU TO UNLOCK THE EXIT');
          return;
        }
      }
      const door = engine.collisionSystem.getNearbyDoor(pos);
      if (door) {
        setInteractionPrompt(`[E] ${door.isOpen ? 'Close' : 'Open'} ${door.houseName}`);
        return;
      }
      if (engine.hasChosenStarter && pos.distanceTo(springfield.simpsonsHouse.ashMesh.position) < 4.5 && !engine.ashBattle.state.isActive) {
        setInteractionPrompt(engine.ashHostileActive
          ? '[F] Ash is defending himself — deal with Charizard or back away'
          : '[E] Challenge Ash and his illegal seven-character team');
        return;
      }
      if (engine.ashBattle.state.isActive && engine.ashBattle.state.currentBoss) {
        setInteractionPrompt('[F] Attack  •  [Q] Special Ability');
        return;
      }
      if (engine.hasChosenStarter) {
        const toothless = engine.npcManager.getNPCById('cameo_toothless');
        if (toothless && toothless.mesh.visible && toothless.state !== 'knocked_out' && pos.distanceTo(toothless.mesh.position) < 4.2) {
          if (multiplayerRef.current.state.isInRoom) {
            const check = multiplayerRef.current.canMountToothless();
            if (!check.allowed) {
              setInteractionPrompt('[Toothless] Flown by another player');
              return;
            }
          }
          setInteractionPrompt('[E] Mount Toothless');
          return;
        }
        const miles = engine.npcManager.getNPCById('cameo_miles');
        if (miles && miles.mesh.visible && miles.state !== 'knocked_out' && pos.distanceTo(miles.mesh.position) < 3.8) {
          setInteractionPrompt('[E] Special interaction with Miles Morales  •  [F] Attack');
          return;
        }
        const nearbyPlane = getNearbyAircraft(pos);
        if (nearbyPlane) {
          setInteractionPrompt(nearbyPlane.crashed ? `${nearbyPlane.name} • DISABLED` : `[E] Fly ${nearbyPlane.name}`);
          return;
        }
        const vehicle = getNearbyVehicle(pos, 4.0);
        if (vehicle) {
          if (engine.trafficManager.isNpcVehicleHybrid(vehicle)) {
            setInteractionPrompt('[E] Drive Lightning McQueen');
          } else {
            setInteractionPrompt(vehicle.isOccupied ? `[E] Hijack ${vehicle.name ?? 'Vehicle'}` : `[E] Drive ${vehicle.name ?? 'Vehicle'}`);
          }
          return;
        }
      }
      const nearbySeat = findNearbySeat(pos, 2.15);
      if (nearbySeat) {
        setInteractionPrompt(`[E] Sit on ${nearbySeat.userData.seatLabel ?? 'seat'}`);
        return;
      }
      const npc = engine.npcManager.getNearbyNPC(pos, 3.2);
      if (npc) {
        const grabbable = engine.hasChosenStarter && engine.npcManager.canPlayerGrab(npc);
        setInteractionPrompt(`[E] Talk to ${npc.name}${engine.hasChosenStarter ? '  •  [F] Attack' : ''}${grabbable ? '  •  [G] Grab' : ''}`);
        return;
      }
      const landmark = getNearbyLandmark(pos, 6.5);
      if (landmark) {
        setInteractionPrompt(`[E] Explore ${landmark.name}`);
        return;
      }
      setInteractionPrompt(null);
    };

    const applyVehicleDamage = (vehicle: Vehicle, amount: number, impactPos?: THREE.Vector3) => {
      if (amount <= 0 || vehicle.wrecked) return;
      const resistance = THREE.MathUtils.clamp(Number(vehicle.mesh.userData.damageResistance) || 1, 0.55, 2.0);
      const adjustedAmount = amount / resistance;
      vehicle.damage = THREE.MathUtils.clamp((vehicle.damage ?? 0) + adjustedAmount, 0, 100);
      if (impactPos) particles.emitCrashBurst(impactPos.clone().add(new THREE.Vector3(0, 0.6, 0)), Math.min(2.4, 0.7 + amount / 12));

      if ((vehicle.damage ?? 0) >= 100) {
        vehicle.wrecked = true;
        vehicle.mesh.userData.wrecked = true;
        vehicle.speed = 0;
        vehicle.mesh.rotation.z += (Math.random() < 0.5 ? -1 : 1) * 0.10;
        particles.emitSteam(vehicle.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)));
        playSoundEffect('crash', vehicle.mesh.position);
        if (vehicle === engine.activeVehicle && engine.activeCarPhysics) {
          engine.activeCarPhysics.speed = 0;
          engine.activeCarPhysics.maxSpeed = 0;
          engine.activeCarPhysics.acceleration = 0;
          engine.activeCarPhysics.boostFuel = 0;
          if (!vehicle.mesh.userData.wreckMessageShown) {
            vehicle.mesh.userData.wreckMessageShown = true;
            showTemporaryNotification(vehicle.name ?? 'Vehicle', 'WRECKED! The car is dead. Press E to bail out.');
          }
        }
      }
    };

    const updateVehicleDamageEffects = (dt: number) => {
      for (const vehicle of engine.vehicles) {
        const damage = vehicle.damage ?? 0;
        if (damage < 42) continue;
        const rate = vehicle.wrecked ? 7 : damage >= 75 ? 4 : 1.6;
        if (Math.random() < dt * rate) {
          particles.emitSteam(vehicle.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0)));
        }
      }
    };

    const getVehicleImpactFootprint = (vehicle: Vehicle): { halfWidth: number; halfLength: number } => {
      const dims = vehicle.mesh.userData.realWorldDimensions as { length?: number; width?: number } | undefined;
      const length = Number(dims?.length);
      const width = Number(dims?.width);
      if (length > 0 && width > 0) {
        return {
          halfWidth: THREE.MathUtils.clamp(width * 0.48, 0.62, 1.42),
          halfLength: THREE.MathUtils.clamp(length * 0.47, 1.35, 4.55),
        };
      }
      if (vehicle.type === 'city_bus') return { halfWidth: 1.48, halfLength: 4.25 };
      const radius = Math.max(1.25, Number(vehicle.mesh.userData.vehicleCollisionRadius) || 1.65);
      return { halfWidth: Math.min(1.16, radius * 0.60), halfLength: Math.max(1.75, radius * 1.34) };
    };

    const getVehicleCollisionMass = (vehicle: Vehicle): number => {
      const explicit = Number(vehicle.weight ?? vehicle.specs?.weight);
      if (Number.isFinite(explicit) && explicit > 0) return THREE.MathUtils.clamp(explicit, 0.55, 4.5);
      switch (vehicle.type) {
        case 'city_bus': return 3.2;
        case 'canyonero': return 1.85;
        case 'mr_plow': return 1.75;
        case 'police_suv': return 1.95;
        case 'police_cruiser': return 1.82;
        case 'bmw_f90_m5': return 1.90;
        case 'bmw_g80_m3': return 1.78;
        case 'bmw_f80_m3': return 1.70;
        case 'ferrari_f12': return 1.63;
        case 'lamborghini_aventador': return 1.58;
        case 'speed_rocket': return 0.72;
        case 'traffic_convertible': return 0.88;
        default: return 1.0;
      }
    };

    const getVehiclePreviousPosition = (vehicle: Vehicle, current = vehicle.mesh.position) => {
      const stored = vehicle.mesh.userData.vehicleCollisionPreviousPosition as THREE.Vector3 | undefined;
      return stored instanceof THREE.Vector3 ? stored.clone() : current.clone();
    };

    const getVehicleFramePreviousPosition = (vehicle: Vehicle, current = vehicle.mesh.position) => {
      const stored = vehicle.mesh.userData.vehicleActiveCollisionPreviousPosition as THREE.Vector3 | undefined;
      return stored instanceof THREE.Vector3 ? stored.clone() : current.clone();
    };

    const storeVehicleFramePosition = (vehicle: Vehicle, current = vehicle.mesh.position) => {
      let stored = vehicle.mesh.userData.vehicleActiveCollisionPreviousPosition as THREE.Vector3 | undefined;
      if (!(stored instanceof THREE.Vector3)) {
        stored = current.clone();
        vehicle.mesh.userData.vehicleActiveCollisionPreviousPosition = stored;
      } else stored.copy(current);
    };

    const getVehicleWorldVelocity = (vehicle: Vehicle, yaw: number) => {
      const recovery = vehicle.mesh.userData.vehicleCollisionVelocity as THREE.Vector3 | undefined;
      if (recovery instanceof THREE.Vector3 && Number(vehicle.mesh.userData.vehicleCollisionRecoveryUntil ?? 0) > performance.now() * 0.001) {
        return recovery.clone();
      }
      const coast = engine.coastingVehicles.find((entry) => entry.vehicle === vehicle);
      if (coast) return coast.physics.velocity.clone().setY(0);
      return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(vehicle.speed ?? 0);
    };

    const vehicleCollisionPairTimes = new Map<string, number>();
    const vehiclePairKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

    const roadVehicleFootprintTouchesWater = (vehicle: Vehicle, position: THREE.Vector3, yaw: number) => {
      if (vehicle.type === 'river_boat') return false;
      const fp = getVehicleImpactFootprint(vehicle);
      const forwardX = Math.sin(yaw);
      const forwardZ = Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const probes = [
        [0, 0], [fp.halfLength, 0], [-fp.halfLength * 0.86, 0],
        [0, fp.halfWidth], [0, -fp.halfWidth],
        [fp.halfLength * 0.82, fp.halfWidth * 0.82],
        [fp.halfLength * 0.82, -fp.halfWidth * 0.82],
      ] as const;
      for (const [forward, side] of probes) {
        const probe = new THREE.Vector3(
          position.x + forwardX * forward + rightX * side,
          position.y,
          position.z + forwardZ * forward + rightZ * side,
        );
        if (isOpenRiverWater(probe)) return true;
      }
      return false;
    };

    const applyNonPlayerVehicleCollisionResponse = (
      vehicle: Vehicle,
      position: THREE.Vector3,
      worldVelocity: THREE.Vector3,
      yawRate: number,
      impactSpeed: number,
      now: number,
    ) => {
      const coast = engine.coastingVehicles.find((entry) => entry.vehicle === vehicle);
      if (coast) {
        coast.physics.position.copy(position);
        coast.physics.applyVehicleCollisionResponse(worldVelocity, yawRate);
        vehicle.mesh.position.copy(position);
        vehicle.speed = coast.physics.speed;
        vehicle.yaw = coast.physics.yaw;
        return;
      }

      vehicle.mesh.position.copy(position);
      if (vehicle.position instanceof THREE.Vector3) vehicle.position.copy(position);
      else {
        vehicle.position.x = position.x;
        vehicle.position.y = position.y;
        vehicle.position.z = position.z;
      }
      const yaw = vehicle.yaw ?? vehicle.rotationY ?? vehicle.mesh.rotation.y;
      const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      vehicle.speed = worldVelocity.dot(forward);
      let recoveryVelocity = vehicle.mesh.userData.vehicleCollisionVelocity as THREE.Vector3 | undefined;
      if (!(recoveryVelocity instanceof THREE.Vector3)) {
        recoveryVelocity = new THREE.Vector3();
        vehicle.mesh.userData.vehicleCollisionVelocity = recoveryVelocity;
      }
      recoveryVelocity.copy(worldVelocity).setY(0);
      vehicle.mesh.userData.vehicleCollisionYawVelocity = THREE.MathUtils.clamp(
        Number(vehicle.mesh.userData.vehicleCollisionYawVelocity ?? 0) + yawRate,
        -3.0,
        3.0,
      );
      vehicle.mesh.userData.vehicleCollisionRecoveryUntil = Math.max(
        Number(vehicle.mesh.userData.vehicleCollisionRecoveryUntil ?? 0),
        now + THREE.MathUtils.clamp(0.16 + impactSpeed * 0.018, 0.18, 0.86),
      );
    };

    const makeVehicleCollisionBody = (
      vehicle: Vehicle,
      currentPosition: THREE.Vector3,
      previousPosition: THREE.Vector3,
      yaw: number,
      velocity: THREE.Vector3,
      footprint?: { halfWidth: number; halfLength: number },
    ): VehicleCollisionBody => {
      const fp = footprint ?? getVehicleImpactFootprint(vehicle);
      return {
        position: currentPosition,
        previousPosition,
        yaw,
        velocity,
        mass: getVehicleCollisionMass(vehicle),
        halfWidth: fp.halfWidth,
        halfLength: fp.halfLength,
      };
    };

    /** Aircraft use the same swept OBB momentum solver as road vehicles when they
     * meet a car/boat. This is deliberately separate from kickable scenery: a real
     * vehicle remains a substantial dynamic body, but it also must not become an
     * invisible concrete wall or be ghosted through at high speed. */
    const resolveAircraftVehicleContacts = (
      plane: AirportAircraft,
      previousPosition: THREE.Vector3,
      dt: number,
    ) => {
      const velocity = new THREE.Vector3(
        Math.sin(plane.yaw) * Math.cos(plane.pitch) * plane.speed,
        plane.verticalSpeed,
        Math.cos(plane.yaw) * Math.cos(plane.pitch) * plane.speed,
      );
      const planarVelocity = velocity.clone().setY(0);
      const planeBottom = Math.min(previousPosition.y, plane.position.y) - plane.gearHeight - 0.12;
      const planeHeight = plane.kind === 'jetliner' ? 7.8 : plane.kind === 'commuter' ? 5.7 : plane.kind === 'zacks_plane' ? 5.3 : 4.5;
      const planeTop = Math.max(previousPosition.y, plane.position.y) - plane.gearHeight + planeHeight + 0.12;
      const planeBody: VehicleCollisionBody = {
        position: plane.position.clone(),
        previousPosition: previousPosition.clone(),
        yaw: plane.yaw,
        velocity: planarVelocity,
        mass: THREE.MathUtils.clamp(plane.mass * 2.7, 2.6, 8.5),
        halfWidth: Math.max(plane.collisionRadius, plane.wingspan * 0.43),
        halfLength: Math.max(plane.collisionRadius * 1.2, plane.length * 0.44),
      };

      const candidates: Vehicle[] = [];
      const seen = new Set<string>();
      for (const vehicle of [...engine.vehicles, ...engine.trafficManager.vehicles]) {
        if (seen.has(vehicle.id) || !vehicle.mesh.visible || vehicle.inUse) continue;
        seen.add(vehicle.id);
        candidates.push(vehicle);
      }

      let hits = 0;
      const now = performance.now() * 0.001;
      for (const vehicle of candidates) {
        const vehiclePos = vehicle.mesh.position.clone();
        const collisionHeight = Math.max(1.25, Number(vehicle.mesh.userData.vehicleCollisionHeight) || (vehicle.type === 'city_bus' ? 3.0 : 2.1));
        const vehicleBottom = vehiclePos.y - 0.12;
        const vehicleTop = vehiclePos.y + collisionHeight;
        if (planeTop < vehicleBottom || planeBottom > vehicleTop) continue;

        const yaw = vehicle.yaw ?? vehicle.rotationY ?? vehicle.mesh.rotation.y;
        const body = makeVehicleCollisionBody(
          vehicle,
          vehiclePos,
          getVehicleFramePreviousPosition(vehicle),
          yaw,
          getVehicleWorldVelocity(vehicle, yaw),
        );
        const result = solveVehicleCollision(planeBody, body);
        if (!result) {
          storeVehicleFramePosition(vehicle);
          continue;
        }

        plane.position.copy(result.positionA);
        const forward = new THREE.Vector3(Math.sin(plane.yaw), 0, Math.cos(plane.yaw));
        plane.speed = result.velocityA.dot(forward);
        plane.yaw += result.yawRateA * Math.min(0.05, Math.max(0, dt));
        planeBody.position.copy(result.positionA);
        planeBody.velocity.copy(result.velocityA);
        planeBody.yaw = plane.yaw;

        applyNonPlayerVehicleCollisionResponse(
          vehicle,
          result.positionB,
          result.velocityB,
          result.yawRateB,
          result.relativeNormalSpeed,
          now,
        );
        if (result.relativeNormalSpeed > 4.5) {
          applyVehicleDamage(
            vehicle,
            THREE.MathUtils.clamp((result.relativeNormalSpeed - 3.5) * 0.24, 0.6, 20),
            result.contactPoint,
          );
          playSoundEffect('crash', result.contactPoint);
        }
        engine.cameraShake = Math.max(engine.cameraShake, THREE.MathUtils.clamp(result.relativeNormalSpeed * 0.008, 0.03, 0.42));
        storeVehicleFramePosition(vehicle);
        hits++;
        if (hits >= 3) break;
      }

      if (hits > 0) {
        plane.mesh.position.copy(plane.position);
        plane.mesh.rotation.set(-plane.pitch, plane.yaw, plane.roll, 'YXZ');
      }
      return hits;
    };

    const recordVehicleCrashFeedback = (
      a: Vehicle,
      b: Vehicle,
      result: VehicleCollisionResult,
      now: number,
      playerInvolved: boolean,
    ) => {
      if (result.relativeNormalSpeed < 0.35) return;
      const key = vehiclePairKey(a.id, b.id);
      const last = vehicleCollisionPairTimes.get(key) ?? -Infinity;
      if (now - last < 0.24) return;
      vehicleCollisionPairTimes.set(key, now);

      const massA = getVehicleCollisionMass(a);
      const massB = getVehicleCollisionMass(b);
      const impact = result.relativeNormalSpeed;
      // Parking-speed nudges are physical but essentially cosmetic. Damage starts
      // above roughly 20 km/h and grows smoothly instead of every touch costing HP.
      if (impact > 7.5) {
        applyVehicleDamage(a, THREE.MathUtils.clamp((impact - 6.5) * 0.15 * Math.sqrt(massB / massA), 0.7, 18), result.contactPoint);
        applyVehicleDamage(b, THREE.MathUtils.clamp((impact - 6.0) * 0.18 * Math.sqrt(massA / massB), 0.8, 24), result.contactPoint);
      }
      if (impact > 2.3) playSoundEffect('crash', result.contactPoint);
      if (playerInvolved) {
        engine.cameraShake = Math.max(engine.cameraShake, THREE.MathUtils.clamp((impact - 1.5) * 0.009, 0.025, 0.52));
        if (!b.isPolice && impact > 8) addWanted(impact > 28 ? 1.15 : 0.65);
      }
    };

    const updateVehicleImpacts = (dt: number, activePreviousPosition: THREE.Vector3) => {
      if (!engine.activeCarPhysics || !engine.activeVehicle) return;
      const cp = engine.activeCarPhysics;
      // The boat can pass underneath road bridges; road-car dynamic collision is a
      // separate system and must never turn the boat into a giant invisible car box.
      if (engine.activeVehicle.type === 'river_boat') return;
      const now = performance.now() * 0.001;
      let forward = new THREE.Vector3(Math.sin(cp.yaw), 0, Math.cos(cp.yaw));

      // Car-to-car collision runs even at parking speed. The previous implementation
      // returned below ~12.5 km/h, which is exactly why a slow bumper contact could
      // ghost through another vehicle. Swept OBB contact also catches high-speed hits
      // that cross an entire chassis between rendered frames.
      let activeContactCount = 0;
      for (const other of engine.vehicles) {
        if (other === engine.activeVehicle || other.inUse || other.type === 'river_boat' || !other.mesh.visible) continue;
        if (Math.abs(other.mesh.position.y - cp.position.y) > 3.2) continue;
        const otherYaw = other.yaw ?? other.rotationY ?? other.mesh.rotation.y;
        const otherFootprint = getVehicleImpactFootprint(other);
        const activeBody = makeVehicleCollisionBody(
          engine.activeVehicle,
          cp.position.clone(),
          activePreviousPosition.clone(),
          cp.yaw,
          cp.velocity.clone().setY(0),
          { halfWidth: cp.collisionHalfWidth, halfLength: cp.collisionHalfLength },
        );
        const otherBody = makeVehicleCollisionBody(
          other,
          other.mesh.position.clone(),
          getVehicleFramePreviousPosition(other),
          otherYaw,
          getVehicleWorldVelocity(other, otherYaw),
          otherFootprint,
        );
        const result = solveVehicleCollision(activeBody, otherBody);
        if (!result) {
          storeVehicleFramePosition(other);
          continue;
        }

        cp.position.copy(result.positionA);
        cp.applyVehicleCollisionResponse(result.velocityA, result.yawRateA);
        engine.activeVehicle.mesh.position.copy(cp.position);
        engine.activeVehicle.mesh.rotation.y = cp.yaw;
        engine.activeVehicle.speed = cp.speed;
        engine.activeVehicle.yaw = cp.yaw;
        applyNonPlayerVehicleCollisionResponse(
          other,
          result.positionB,
          result.velocityB,
          result.yawRateB,
          result.relativeNormalSpeed,
          now,
        );
        recordVehicleCrashFeedback(engine.activeVehicle, other, result, now, true);
        storeVehicleFramePosition(other);
        forward = new THREE.Vector3(Math.sin(cp.yaw), 0, Math.cos(cp.yaw));
        activeContactCount++;
        if (activeContactCount >= 3) break;
      }

      const absSpeed = Math.abs(cp.speed);
      if (absSpeed < 5) return;

      // Ash participates in the same vehicle-hit language as nearby NPCs while he
      // is waiting for a challenge. He recovers to his home spot afterwards.
      if (!engine.ashBattle.state.isActive) {
        const ash = springfield.simpsonsHouse.ashMesh;
        if (planarDistance(cp.position, ash.position) < 2.35 && now - (ash.userData.lastCarHitAt ?? 0) > 1.1) {
          ash.userData.lastCarHitAt = now;
          hitAshFreeRoam(cp.position.clone().addScaledVector(forward, -1), Math.min(25, 10 + absSpeed * 0.32), 7 + Math.min(7, absSpeed * 0.10), false);
          cp.speed *= 0.84;
          applyVehicleDamage(engine.activeVehicle, 2.5, ash.position);
          addWanted(1);
        }
      }

      // Pedestrians get dramatic, cartoon-safe launches.
      for (const npc of engine.npcManager.getNPCsInRadius(cp.position, 2.2)) {
        const lastHit = npc.mesh.userData.lastCarHitAt ?? 0;
        if (now - lastHit < 1.4) continue;
        npc.mesh.userData.lastCarHitAt = now;
        engine.npcManager.blastNPC(npc, cp.position.clone().addScaledVector(forward, -1), Math.min(30, 10 + absSpeed * 0.35), 8 + Math.min(8, absSpeed * 0.12), true);
        cp.speed *= 0.82;
        applyVehicleDamage(engine.activeVehicle, 2.5, npc.mesh.position);
        addWanted(1);
      }

      const propImpact = engine.worldInteractions.hitDestructiblesFromCar(cp.position, cp.speed, forward);
      if (propImpact.hitCount > 0) {
        applyVehicleDamage(engine.activeVehicle, propImpact.hitCount * Math.min(7, 1.5 + absSpeed * 0.08), cp.position);
        if (propImpact.wantedWeight > 0) addWanted(propImpact.wantedWeight);
      }

      for (const block of engine.roadblocks) {
        if (planarDistance(cp.position, block.mesh.position) < 3.2) {
          const impact = Math.abs(cp.speed);
          cp.speed *= -0.18;
          block.mesh.rotation.z += (Math.random() - 0.5) * 0.18;
          applyVehicleDamage(engine.activeVehicle, THREE.MathUtils.clamp(impact * 0.24, 4, 20), cp.position);
          engine.cameraShake = Math.max(engine.cameraShake, 0.34);
          playSoundEffect('crash', cp.position);
        }
      }
    };


    const updateVehicleCollisionRecovery = (dt: number) => {
      const now = performance.now() * 0.001;
      const clampedDt = Math.min(dt, 0.075);
      for (const vehicle of engine.vehicles) {
        if (vehicle === engine.activeVehicle || vehicle.inUse || vehicle.type === 'river_boat') continue;
        if (engine.coastingVehicles.some((entry) => entry.vehicle === vehicle)) continue;
        const until = Number(vehicle.mesh.userData.vehicleCollisionRecoveryUntil ?? 0);
        const velocity = vehicle.mesh.userData.vehicleCollisionVelocity as THREE.Vector3 | undefined;
        if (!(velocity instanceof THREE.Vector3) || until <= now) continue;

        let previous = vehicle.mesh.userData.vehicleCollisionPreviousPosition as THREE.Vector3 | undefined;
        if (!(previous instanceof THREE.Vector3)) {
          previous = vehicle.mesh.position.clone();
          vehicle.mesh.userData.vehicleCollisionPreviousPosition = previous;
        } else previous.copy(vehicle.mesh.position);

        let yaw = vehicle.yaw ?? vehicle.rotationY ?? vehicle.mesh.rotation.y;
        let yawRate = Number(vehicle.mesh.userData.vehicleCollisionYawVelocity ?? 0);
        yaw += yawRate * clampedDt;
        const fp = getVehicleImpactFootprint(vehicle);
        const candidate = vehicle.mesh.position.clone().addScaledVector(velocity, clampedDt);
        let blockedByWater = roadVehicleFootprintTouchesWater(vehicle, candidate, yaw);
        let resolvedPosition = vehicle.mesh.position.clone();
        let hitStatic = false;
        if (!blockedByWater) {
          const resolved = engine.collisionSystem.resolveOrientedVehicleCollision(
            vehicle.mesh.position,
            candidate,
            yaw,
            fp.halfWidth,
            fp.halfLength,
            Math.max(1.6, Number(vehicle.mesh.userData.vehicleCollisionHeight) || 2.2),
            (collider) => collider.id.startsWith('prop_'),
          );
          resolvedPosition.copy(resolved.position);
          hitStatic = resolved.collided;
        }

        if (blockedByWater) {
          velocity.multiplyScalar(0.18);
          yawRate *= 0.45;
        } else {
          vehicle.mesh.position.copy(resolvedPosition);
          if (hitStatic) {
            velocity.multiplyScalar(0.36);
            yawRate *= 0.52;
          }
        }

        // Crash momentum is deliberately less damped than normal traffic steering for
        // the first fraction of a second, then dies away quickly enough to avoid toy cars.
        velocity.multiplyScalar(Math.exp(-1.75 * clampedDt));
        yawRate *= Math.exp(-3.1 * clampedDt);
        vehicle.mesh.userData.vehicleCollisionYawVelocity = yawRate;
        vehicle.yaw = yaw;
        vehicle.mesh.rotation.y = yaw;
        const fwdX = Math.sin(yaw);
        const fwdZ = Math.cos(yaw);
        vehicle.speed = velocity.x * fwdX + velocity.z * fwdZ;
        if (vehicle.position instanceof THREE.Vector3) vehicle.position.copy(vehicle.mesh.position);
        else {
          vehicle.position.x = vehicle.mesh.position.x;
          vehicle.position.y = vehicle.mesh.position.y;
          vehicle.position.z = vehicle.mesh.position.z;
        }
        const ground = engine.collisionSystem.getGroundHeightNear(
          vehicle.mesh.position.x, vehicle.mesh.position.z, vehicle.mesh.position.y, 0.12, 1.1, 4.5,
        );
        if (Math.abs(vehicle.mesh.position.y - (ground + 0.08)) < 1.2) vehicle.mesh.position.y = ground + 0.08;
        if (velocity.lengthSq() < 0.05 && Math.abs(yawRate) < 0.03) {
          vehicle.mesh.userData.vehicleCollisionRecoveryUntil = 0;
          velocity.set(0, 0, 0);
          if (Math.abs(vehicle.speed) < 0.3) vehicle.speed = 0;
        }
      }

      for (const cop of engine.policeAIs) {
        if (!cop.isVehicleDriving()) continue;
        const until = Number(cop.mesh.userData.vehicleCollisionRecoveryUntil ?? 0);
        const velocity = cop.mesh.userData.vehicleCollisionVelocity as THREE.Vector3 | undefined;
        if (!(velocity instanceof THREE.Vector3) || until <= now) continue;
        let previous = cop.mesh.userData.vehicleCollisionPreviousPosition as THREE.Vector3 | undefined;
        if (!(previous instanceof THREE.Vector3)) {
          previous = cop.position.clone();
          cop.mesh.userData.vehicleCollisionPreviousPosition = previous;
        } else previous.copy(cop.position);

        let yawRate = Number(cop.mesh.userData.vehicleCollisionYawVelocity ?? 0);
        cop.yaw += yawRate * clampedDt;
        const candidate = cop.position.clone().addScaledVector(velocity, clampedDt);
        const policeWaterProbeVehicle = {
          id: 'police_recovery_probe', mesh: cop.mesh, position: cop.position, speed: cop.speed,
          type: 'police_cruiser' as VehicleModelType, yaw: cop.yaw,
        } as Vehicle;
        const waterBlocked = roadVehicleFootprintTouchesWater(policeWaterProbeVehicle, candidate, cop.yaw);
        if (!waterBlocked) {
          const resolved = engine.collisionSystem.resolveOrientedVehicleCollision(
            cop.position, candidate, cop.yaw, 1.02, 2.48, 2.25,
            (collider) => collider.id.startsWith('prop_'),
          );
          cop.position.copy(resolved.position);
          if (resolved.collided) {
            velocity.multiplyScalar(0.36);
            yawRate *= 0.52;
          }
        } else {
          velocity.multiplyScalar(0.16);
          yawRate *= 0.42;
        }
        velocity.multiplyScalar(Math.exp(-1.75 * clampedDt));
        yawRate *= Math.exp(-3.1 * clampedDt);
        cop.mesh.userData.vehicleCollisionYawVelocity = yawRate;
        cop.speed = velocity.x * Math.sin(cop.yaw) + velocity.z * Math.cos(cop.yaw);
        cop.mesh.position.copy(cop.position);
        cop.mesh.rotation.y = cop.yaw;
        if (velocity.lengthSq() < 0.05 && Math.abs(yawRate) < 0.03) {
          cop.mesh.userData.vehicleCollisionRecoveryUntil = 0;
          velocity.set(0, 0, 0);
          if (Math.abs(cop.speed) < 0.3) cop.speed = 0;
        }
      }
    };

    // Ambient car-to-car collision used to compare every visible vehicle against every
    // other visible vehicle on every world tick. With city traffic + hero cars + airport
    // parking this became O(n²) even when cars were hundreds of metres apart, producing
    // occasional CPU spikes. A tiny reusable X/Z grid keeps the exact swept OBB solver
    // but only creates expensive collision bodies for genuinely nearby pairs.
    const ambientVehicleCellSize = 14;
    const ambientVehicleCandidates: Vehicle[] = [];
    const ambientVehicleIndex = new Map<Vehicle, number>();
    const ambientVehicleGrid = new Map<string, Vehicle[]>();
    const ambientVehicleContactCounts = new Map<string, number>();
    const ambientVehicleCellKey = (ix: number, iz: number) => `${ix},${iz}`;
    const resolveAmbientVehicleContacts = (dt: number) => {
      const now = performance.now() * 0.001;
      ambientVehicleCandidates.length = 0;
      ambientVehicleIndex.clear();
      ambientVehicleGrid.clear();
      ambientVehicleContactCounts.clear();

      for (const vehicle of engine.vehicles) {
        if (vehicle === engine.activeVehicle || vehicle.inUse || vehicle.type === 'river_boat' || !vehicle.mesh.visible) continue;
        const index = ambientVehicleCandidates.length;
        ambientVehicleCandidates.push(vehicle);
        ambientVehicleIndex.set(vehicle, index);
        const ix = Math.floor(vehicle.mesh.position.x / ambientVehicleCellSize);
        const iz = Math.floor(vehicle.mesh.position.z / ambientVehicleCellSize);
        const key = ambientVehicleCellKey(ix, iz);
        const cell = ambientVehicleGrid.get(key);
        if (cell) cell.push(vehicle);
        else ambientVehicleGrid.set(key, [vehicle]);
      }

      for (let i = 0; i < ambientVehicleCandidates.length; i++) {
        const a = ambientVehicleCandidates[i];
        if ((ambientVehicleContactCounts.get(a.id) ?? 0) >= 3) continue;
        const aYaw = a.yaw ?? a.rotationY ?? a.mesh.rotation.y;
        const aBody = makeVehicleCollisionBody(
          a, a.mesh.position.clone(), getVehiclePreviousPosition(a), aYaw, getVehicleWorldVelocity(a, aYaw),
        );
        const cellX = Math.floor(a.mesh.position.x / ambientVehicleCellSize);
        const cellZ = Math.floor(a.mesh.position.z / ambientVehicleCellSize);

        let stopA = false;
        for (let ox = -1; ox <= 1 && !stopA; ox++) {
          for (let oz = -1; oz <= 1 && !stopA; oz++) {
            const cell = ambientVehicleGrid.get(ambientVehicleCellKey(cellX + ox, cellZ + oz));
            if (!cell) continue;
            for (const b of cell) {
              const j = ambientVehicleIndex.get(b) ?? -1;
              if (j <= i || (ambientVehicleContactCounts.get(b.id) ?? 0) >= 3) continue;
              if (Math.abs(a.mesh.position.y - b.mesh.position.y) > 3.2) continue;
              const dx = a.mesh.position.x - b.mesh.position.x;
              const dz = a.mesh.position.z - b.mesh.position.z;
              // Even the city bus cannot physically contact another road vehicle from
              // more than this distance; reject before allocating a second collision body.
              if (dx * dx + dz * dz > 12.5 * 12.5) continue;

              const bYaw = b.yaw ?? b.rotationY ?? b.mesh.rotation.y;
              const bBody = makeVehicleCollisionBody(
                b, b.mesh.position.clone(), getVehiclePreviousPosition(b), bYaw, getVehicleWorldVelocity(b, bYaw),
              );
              const result = solveVehicleCollision(aBody, bBody);
              if (!result) continue;
              applyNonPlayerVehicleCollisionResponse(a, result.positionA, result.velocityA, result.yawRateA, result.relativeNormalSpeed, now);
              applyNonPlayerVehicleCollisionResponse(b, result.positionB, result.velocityB, result.yawRateB, result.relativeNormalSpeed, now);
              recordVehicleCrashFeedback(a, b, result, now, false);
              ambientVehicleContactCounts.set(a.id, (ambientVehicleContactCounts.get(a.id) ?? 0) + 1);
              ambientVehicleContactCounts.set(b.id, (ambientVehicleContactCounts.get(b.id) ?? 0) + 1);
              aBody.position.copy(result.positionA);
              aBody.velocity.copy(result.velocityA);
              if ((ambientVehicleContactCounts.get(a.id) ?? 0) >= 3) stopA = true;
            }
          }
        }
      }
    };

    const getPolicePreviousPosition = (cop: PoliceAI) => {
      const stored = cop.mesh.userData.vehicleCollisionPreviousPosition as THREE.Vector3 | undefined;
      return stored instanceof THREE.Vector3 ? stored.clone() : cop.position.clone();
    };

    const getPoliceWorldVelocity = (cop: PoliceAI) => {
      const recovery = cop.mesh.userData.vehicleCollisionVelocity as THREE.Vector3 | undefined;
      if (recovery instanceof THREE.Vector3 && Number(cop.mesh.userData.vehicleCollisionRecoveryUntil ?? 0) > performance.now() * 0.001) {
        return recovery.clone();
      }
      return new THREE.Vector3(Math.sin(cop.yaw), 0, Math.cos(cop.yaw)).multiplyScalar(cop.speed);
    };

    const makePoliceCollisionBody = (cop: PoliceAI): VehicleCollisionBody => ({
      position: cop.position.clone(),
      previousPosition: getPolicePreviousPosition(cop),
      yaw: cop.yaw,
      velocity: getPoliceWorldVelocity(cop),
      mass: 1.9,
      halfWidth: 1.02,
      halfLength: 2.48,
    });

    const applyPoliceCollisionResponse = (
      cop: PoliceAI,
      position: THREE.Vector3,
      worldVelocity: THREE.Vector3,
      yawRate: number,
      impactSpeed: number,
      now: number,
    ) => {
      cop.position.copy(position);
      cop.mesh.position.copy(position);
      cop.speed = worldVelocity.x * Math.sin(cop.yaw) + worldVelocity.z * Math.cos(cop.yaw);
      let recovery = cop.mesh.userData.vehicleCollisionVelocity as THREE.Vector3 | undefined;
      if (!(recovery instanceof THREE.Vector3)) {
        recovery = new THREE.Vector3();
        cop.mesh.userData.vehicleCollisionVelocity = recovery;
      }
      recovery.copy(worldVelocity).setY(0);
      cop.mesh.userData.vehicleCollisionYawVelocity = THREE.MathUtils.clamp(
        Number(cop.mesh.userData.vehicleCollisionYawVelocity ?? 0) + yawRate, -3.0, 3.0,
      );
      cop.mesh.userData.vehicleCollisionRecoveryUntil = Math.max(
        Number(cop.mesh.userData.vehicleCollisionRecoveryUntil ?? 0),
        now + THREE.MathUtils.clamp(0.18 + impactSpeed * 0.018, 0.2, 0.88),
      );
      cop.ramCooldown = Math.max(cop.ramCooldown, 0.32);
    };

    const resolvePoliceVehicleContacts = () => {
      const now = performance.now() * 0.001;
      const activeVehicle = engine.activeVehicle;
      const cp = engine.activeCarPhysics;
      let activePolicePrev: THREE.Vector3 | null = null;
      if (activeVehicle && cp && activeVehicle.type !== 'river_boat') {
        const stored = activeVehicle.mesh.userData.policeCollisionPreviousPosition as THREE.Vector3 | undefined;
        activePolicePrev = stored instanceof THREE.Vector3 ? stored.clone() : cp.position.clone();
      }

      for (let i = 0; i < engine.policeAIs.length; i++) {
        const cop = engine.policeAIs[i];
        if (!cop.isVehicleDriving()) continue;
        let copBody = makePoliceCollisionBody(cop);

        if (activeVehicle && cp && activeVehicle.type !== 'river_boat' && activePolicePrev) {
          const activeBody = makeVehicleCollisionBody(
            activeVehicle,
            cp.position.clone(),
            activePolicePrev,
            cp.yaw,
            cp.velocity.clone().setY(0),
            { halfWidth: cp.collisionHalfWidth, halfLength: cp.collisionHalfLength },
          );
          const result = solveVehicleCollision(activeBody, copBody);
          if (result) {
            cp.position.copy(result.positionA);
            cp.applyVehicleCollisionResponse(result.velocityA, result.yawRateA);
            activeVehicle.mesh.position.copy(cp.position);
            activeVehicle.mesh.rotation.y = cp.yaw;
            activeVehicle.speed = cp.speed;
            activeVehicle.yaw = cp.yaw;
            applyPoliceCollisionResponse(cop, result.positionB, result.velocityB, result.yawRateB, result.relativeNormalSpeed, now);
            if (result.relativeNormalSpeed > 7.5) {
              applyVehicleDamage(activeVehicle, THREE.MathUtils.clamp((result.relativeNormalSpeed - 6.5) * 0.18, 0.8, 20), result.contactPoint);
            }
            if (result.relativeNormalSpeed > 2.3) playSoundEffect('crash', result.contactPoint);
            engine.cameraShake = Math.max(engine.cameraShake, THREE.MathUtils.clamp(result.relativeNormalSpeed * 0.009, 0.025, 0.5));
            copBody = makePoliceCollisionBody(cop);
          }
        }

        for (const vehicle of engine.vehicles) {
          if (vehicle === activeVehicle || vehicle.inUse || vehicle.type === 'river_boat' || !vehicle.mesh.visible) continue;
          if (Math.abs(vehicle.mesh.position.y - cop.position.y) > 3.2) continue;
          const yaw = vehicle.yaw ?? vehicle.rotationY ?? vehicle.mesh.rotation.y;
          const vehicleBody = makeVehicleCollisionBody(
            vehicle, vehicle.mesh.position.clone(), getVehiclePreviousPosition(vehicle), yaw, getVehicleWorldVelocity(vehicle, yaw),
          );
          const result = solveVehicleCollision(vehicleBody, copBody);
          if (!result) continue;
          applyNonPlayerVehicleCollisionResponse(vehicle, result.positionA, result.velocityA, result.yawRateA, result.relativeNormalSpeed, now);
          applyPoliceCollisionResponse(cop, result.positionB, result.velocityB, result.yawRateB, result.relativeNormalSpeed, now);
          if (result.relativeNormalSpeed > 7.5) {
            applyVehicleDamage(vehicle, THREE.MathUtils.clamp((result.relativeNormalSpeed - 6.5) * 0.16, 0.8, 18), result.contactPoint);
          }
          if (result.relativeNormalSpeed > 2.3) playSoundEffect('crash', result.contactPoint);
          copBody = makePoliceCollisionBody(cop);
        }

        for (let j = i + 1; j < engine.policeAIs.length; j++) {
          const other = engine.policeAIs[j];
          if (!other.isVehicleDriving()) continue;
          const result = solveVehicleCollision(copBody, makePoliceCollisionBody(other));
          if (!result) continue;
          applyPoliceCollisionResponse(cop, result.positionA, result.velocityA, result.yawRateA, result.relativeNormalSpeed, now);
          applyPoliceCollisionResponse(other, result.positionB, result.velocityB, result.yawRateB, result.relativeNormalSpeed, now);
          if (result.relativeNormalSpeed > 2.3) playSoundEffect('crash', result.contactPoint);
          copBody = makePoliceCollisionBody(cop);
        }
      }

      if (activeVehicle && cp && activeVehicle.type !== 'river_boat') {
        let stored = activeVehicle.mesh.userData.policeCollisionPreviousPosition as THREE.Vector3 | undefined;
        if (!(stored instanceof THREE.Vector3)) {
          stored = cp.position.clone();
          activeVehicle.mesh.userData.policeCollisionPreviousPosition = stored;
        } else stored.copy(cp.position);
      }
    };

    const vehicleSurfaceRaycaster = new THREE.Raycaster();
    const vehicleSurfaceRayOrigin = new THREE.Vector3();
    const vehicleSurfaceRayDown = new THREE.Vector3(0, -1, 0);
    const vehicleSurfaceBox = new THREE.Box3();
    const vehicleSurfaceLocal = new THREE.Vector3();

    type DynamicVehicleBody = {
      mesh: THREE.Object3D;
      speed: number;
      yaw: number;
      type?: VehicleModelType | string;
      hitKey: string;
    };

    const getDynamicVehicleBodies = (): DynamicVehicleBody[] => {
      const bodies: DynamicVehicleBody[] = [];
      for (const vehicle of engine.vehicles) {
        if (!vehicle.mesh.visible || vehicle.inUse || vehicle.type === 'river_boat') continue;
        bodies.push({
          mesh: vehicle.mesh,
          speed: vehicle.speed ?? 0,
          yaw: vehicle.yaw ?? vehicle.rotationY ?? vehicle.mesh.rotation.y,
          type: vehicle.type,
          hitKey: 'lastPlayerBodyHitAt',
        });
      }
      for (const cop of engine.policeAIs) {
        if (!cop.mesh.visible) continue;
        bodies.push({
          mesh: cop.mesh,
          speed: cop.speed ?? 0,
          yaw: cop.yaw ?? cop.mesh.rotation.y,
          type: 'police_sedan',
          hitKey: 'lastPlayerBodyHitAt',
        });
      }
      return bodies;
    };

    const getVehicleFootprint = (body: DynamicVehicleBody) => {
      const real = body.mesh.userData.realWorldDimensions as { length?: number; width?: number; height?: number } | undefined;
      if (real?.length && real?.width) {
        return { halfWidth: real.width * 0.5, halfLength: real.length * 0.5 };
      }
      if (body.type === 'city_bus') return { halfWidth: 1.52, halfLength: 4.25 };
      if (body.type === 'police_suv') return { halfWidth: 1.10, halfLength: 2.62 };
      if (body.type === 'police_sedan') return { halfWidth: 1.04, halfLength: 2.45 };
      if (body.type === 'traffic_suv') return { halfWidth: 1.03, halfLength: 2.52 };
      return { halfWidth: 1.02, halfLength: 2.45 };
    };

    /**
     * Sample the REAL rendered upper surface of a vehicle at the player's X/Z.
     * This is deliberately a downward ray instead of one giant invisible roof box:
     * bonnet, roof, boot and bus roof can all sit at their actual visible heights.
     */
    const getVehicleTopAt = (body: DynamicVehicleBody, x: number, z: number): number | null => {
      const mesh = body.mesh;
      if (!mesh.visible) return null;
      mesh.updateWorldMatrix(true, true);
      vehicleSurfaceBox.setFromObject(mesh);
      if (
        x < vehicleSurfaceBox.min.x - 0.08 || x > vehicleSurfaceBox.max.x + 0.08 ||
        z < vehicleSurfaceBox.min.z - 0.08 || z > vehicleSurfaceBox.max.z + 0.08
      ) return null;

      // An open-top car has no walkable roof through the passenger compartment.
      // Keep its bonnet/rear deck usable without pretending the empty cabin is a roof.
      if (mesh.userData.openTop) {
        vehicleSurfaceLocal.set(x, mesh.position.y, z);
        mesh.worldToLocal(vehicleSurfaceLocal);
        if (vehicleSurfaceLocal.z > -0.88 && vehicleSurfaceLocal.z < 0.78) return null;
      }

      vehicleSurfaceRayOrigin.set(x, vehicleSurfaceBox.max.y + 1.25, z);
      vehicleSurfaceRaycaster.set(vehicleSurfaceRayOrigin, vehicleSurfaceRayDown);
      vehicleSurfaceRaycaster.near = 0;
      vehicleSurfaceRaycaster.far = Math.max(4, vehicleSurfaceBox.max.y - vehicleSurfaceBox.min.y + 3);
      const hits = vehicleSurfaceRaycaster.intersectObject(mesh, true);
      for (const hit of hits) {
        const name = hit.object.name.toLowerCase();
        // Do not let a ray through an open cabin land on a driver's head or seat.
        if (/driver|passenger|seat|dashboard|dash|steering|headrest|interior/.test(name)) continue;
        if (hit.point.y < vehicleSurfaceBox.min.y + 0.24) continue;
        return hit.point.y + 0.025;
      }
      return null;
    };

    /** Carry the player with a slowly moving vehicle they are already standing on. */
    const prepareVehicleSurfaceSupport = (dt: number, jumpPressed: boolean): number | null => {
      const support = engine.vehicleSurfaceSupport;
      if (!support) return null;
      const body = getDynamicVehicleBodies().find((entry) => entry.mesh === support.mesh);
      if (!body) {
        engine.vehicleSurfaceSupport = null;
        return null;
      }

      body.mesh.updateWorldMatrix(true, true);
      const carried = body.mesh.localToWorld(support.localAnchor.clone());
      engine.playerMovement.position.copy(carried);

      let yawDelta = body.yaw - support.lastYaw;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      const turnRate = Math.abs(yawDelta) / Math.max(0.001, dt);
      support.lastYaw = body.yaw;
      support.lastWorldAnchor.copy(carried);

      if (jumpPressed) {
        // Leave isGrounded true for this frame so the normal jump code supplies the
        // upward impulse, then immediately stop treating the car as the floor.
        engine.vehicleSurfaceSupport = null;
        return null;
      }

      // Slow traffic is a moving platform. Hard acceleration/high-speed turning is
      // intentionally allowed to throw the rider off in an arcade-readable way.
      if (Math.abs(body.speed) > 19 || (Math.abs(body.speed) > 6 && turnRate > 2.8)) {
        engine.vehicleSurfaceSupport = null;
        engine.playerMovement.isGrounded = false;
        engine.playerMovement.velocity.x += Math.sin(body.yaw) * body.speed * 0.24;
        engine.playerMovement.velocity.z += Math.cos(body.yaw) * body.speed * 0.24;
        engine.playerMovement.velocity.y = Math.max(engine.playerMovement.velocity.y, 0.6);
        return null;
      }

      engine.playerMovement.isGrounded = true;
      engine.playerMovement.velocity.y = 0;
      return carried.y;
    };


    const baggageSupportLocalPoint = new THREE.Vector3();
    const baggageSupportWorldPoint = new THREE.Vector3();
    const baggageSupportLocalTangent = new THREE.Vector3();
    const baggageSupportWorldTangent = new THREE.Vector3();
    const baggageSupportCandidate = new THREE.Vector3();
    const baggageSupportQuaternion = new THREE.Quaternion();
    const baggageCarouselPathLength = airport.baggageCarousel.path.getLength();
    const baggageCarouselLinearSpeed = baggageCarouselPathLength * airport.baggageCarousel.progressPerSecond;

    /**
     * Conveyor support is additive, not a teleport/lock. The belt advances the
     * player's existing ground point first, through normal world collision, then
     * PlayerMovement applies WASD/jump on top of that displaced position.
     */
    const prepareBaggageCarouselSupport = (dt: number, jumpPressed: boolean): number | null => {
      if (!engine.playerMovement.isGrounded) return null;
      if (engine.playerMovement.position.distanceToSquared(airport.terminalCenter) > 95 * 95) return null;

      const carousel = airport.baggageCarousel;
      let bestT = 0;
      let bestDistanceSq = Infinity;
      const sampleCount = 56;
      for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleCount;
        carousel.path.getPoint(t, baggageSupportLocalPoint);
        baggageSupportWorldPoint.copy(baggageSupportLocalPoint);
        carousel.group.localToWorld(baggageSupportWorldPoint);
        const dx = engine.playerMovement.position.x - baggageSupportWorldPoint.x;
        const dz = engine.playerMovement.position.z - baggageSupportWorldPoint.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistanceSq) {
          bestDistanceSq = d2;
          bestT = t;
        }
      }

      const supportHalfWidth = Math.max(0.4, carousel.beltWidth * 0.5 - 0.12);
      if (bestDistanceSq > supportHalfWidth * supportHalfWidth) return null;

      carousel.path.getPoint(bestT, baggageSupportLocalPoint);
      baggageSupportLocalPoint.y = carousel.topY;
      baggageSupportWorldPoint.copy(baggageSupportLocalPoint);
      carousel.group.localToWorld(baggageSupportWorldPoint);
      const topY = baggageSupportWorldPoint.y + 0.012;
      if (Math.abs(engine.playerMovement.position.y - topY) > 0.48) return null;

      carousel.path.getTangent(bestT, baggageSupportLocalTangent).setY(0);
      if (baggageSupportLocalTangent.lengthSq() < 1e-8) return topY;
      baggageSupportLocalTangent.normalize();
      carousel.group.getWorldQuaternion(baggageSupportQuaternion);
      baggageSupportWorldTangent.copy(baggageSupportLocalTangent).applyQuaternion(baggageSupportQuaternion).setY(0).normalize();

      const start = engine.playerMovement.position;
      baggageSupportCandidate.copy(start).addScaledVector(baggageSupportWorldTangent, baggageCarouselLinearSpeed * Math.min(dt, 0.075));
      // Carry cannot push the player through the service throat, terminal wall or
      // any other solid structure. It uses the same swept player collision as WASD.
      engine.collisionSystem.resolvePlayerCollision(baggageSupportCandidate, 0.56, start);
      engine.playerMovement.position.copy(baggageSupportCandidate);

      if (jumpPressed) {
        // Preserve a modest amount of belt momentum on take-off without glueing the
        // character to the conveyor once airborne.
        engine.playerMovement.velocity.x += baggageSupportWorldTangent.x * baggageCarouselLinearSpeed * 0.42;
        engine.playerMovement.velocity.z += baggageSupportWorldTangent.z * baggageCarouselLinearSpeed * 0.42;
        return null;
      }
      engine.playerMovement.isGrounded = true;
      engine.playerMovement.velocity.y = 0;
      return topY;
    };

    const triggerPlayerStompImpact = (position: THREE.Vector3) => {
      const stompRadius = 5.4;
      // Count criminal NPC targets before the impact mutates their states. The actual
      // hit still goes through NPCManager.applyMeleeHit(), exactly like a kick, so
      // retaliation/aggression behaviour stays unified instead of being reimplemented.
      const slamNpcTargets = engine.npcManager.getNPCsInRadius(position, stompRadius).filter((npc) =>
        npc.id !== 'jail_escape_guard' && Math.abs(npc.mesh.position.y - position.y) <= 3.0
      );
      const allSlamNpcTargets = engine.npcManager.getNPCsInRadius(position, stompRadius).filter((npc) =>
        Math.abs(npc.mesh.position.y - position.y) <= 3.0
      );
      let hits = engine.worldInteractions.playerStompImpact(position);
      const propHits = Math.max(0, hits - allSlamNpcTargets.length);
      let ashFreeRoamHit = false;

      // Keep movement stomp consistent with the existing kick/special rules for Ash:
      // during the official challenge it can damage the active Pokémon but wanted
      // gain remains suppressed; outside the challenge, landing beside Ash counts as
      // a physical attack and can trigger his separate defensive Charizard encounter.
      const boss = engine.ashBattle.state.currentBoss;
      if (engine.ashBattle.state.isActive && boss?.mesh) {
        if (planarDistance(position, boss.mesh.position) <= stompRadius && Math.abs(position.y - boss.mesh.position.y) <= 3.2) {
          engine.ashBattle.damageBoss(24, 'special', position, 11);
          hits += 1;
        }
      } else {
        const ash = springfield.simpsonsHouse.ashMesh;
        if (planarDistance(position, ash.position) <= stompRadius && Math.abs(position.y - ash.position.y) <= 3.2) {
          if (hitAshFreeRoam(position, 12.5, 6.8)) {
            hits += 1;
            ashFreeRoamHit = true;
          }
        }
      }

      engine.cameraShake = Math.max(engine.cameraShake, hits > 0 ? 0.32 : 0.24);
      // BODY SLAM/STOMP uses the same one-hit crime weight as kicking each NPC.
      // Loose property destroyed by the slam also contributes normally. addWanted()
      // itself suppresses all of this during the official Ash challenge.
      const npcCrimeWeight = slamNpcTargets.reduce((sum, npc) => sum + playerNpcAttackWantedWeight(npc), 0);
      const crimeWeight = npcCrimeWeight + propHits + (ashFreeRoamHit ? 0.55 : 0);
      if (crimeWeight > 0) addWanted(crimeWeight);
    };

    /**
     * Dynamic player/vehicle interaction. Top contact is walkable; side contact is
     * solid. This replaces the old radial repel that pushed the player away even
     * when their feet were clearly landing on a bonnet or roof. Returns true when
     * a stomp lands on a dynamic vehicle top before the static-ground solver sees it.
     */
    const resolvePlayerVehicleBodies = (previousPlayerPos: THREE.Vector3, dt: number, jumpPressed: boolean): boolean => {
      if (engine.activeVehicle || !engine.hasChosenStarter) return false;
      const player = engine.playerMovement.position;
      const bodies = getDynamicVehicleBodies();
      const now = performance.now() * 0.001;
      const oldSupport = engine.vehicleSurfaceSupport;
      let bestTop: { body: DynamicVehicleBody; y: number } | null = null;

      for (const body of bodies) {
        if (planarDistance(player, body.mesh.position) > (body.type === 'city_bus' ? 6.0 : 4.2)) continue;
        const topY = getVehicleTopAt(body, player.x, player.z);
        if (topY === null) continue;
        const descending = engine.playerMovement.velocity.y <= 0.35 || engine.playerMovement.isGrounded;
        const crossedSurface = previousPlayerPos.y >= topY - 0.22 && player.y <= topY + 0.52;
        const maintainingSupport = oldSupport?.mesh === body.mesh && !jumpPressed;
        if ((descending && crossedSurface) || maintainingSupport) {
          if (!bestTop || topY > bestTop.y) bestTop = { body, y: topY };
        }
      }

      if (bestTop && !jumpPressed) {
        const { body, y } = bestTop;
        const stomped = engine.playerMovement.completeDynamicStompLanding();
        player.y = y;
        engine.playerMovement.velocity.y = 0;
        engine.playerMovement.isGrounded = true;
        body.mesh.updateWorldMatrix(true, true);
        const anchorWorld = new THREE.Vector3(player.x, y, player.z);
        const localAnchor = body.mesh.worldToLocal(anchorWorld.clone());
        engine.vehicleSurfaceSupport = {
          mesh: body.mesh,
          localAnchor,
          lastWorldAnchor: anchorWorld,
          lastYaw: body.yaw,
        };
        return stomped;
      }

      // Walking off a roof should begin an actual fall from roof height, not snap
      // instantly to the road just because the static ground solver cannot see cars.
      if (oldSupport && !jumpPressed) {
        player.y = Math.max(player.y, previousPlayerPos.y);
        engine.playerMovement.isGrounded = false;
        engine.playerMovement.velocity.y = Math.min(0, engine.playerMovement.velocity.y);
        engine.vehicleSurfaceSupport = null;
      }

      const playerRadius = engine.currentPokemonId === 'charizard' ? 0.82 : 0.65;
      const playerHeight = engine.currentPokemonId === 'charizard' ? 2.72 : 1.9;
      for (const body of bodies) {
        const maxRange = body.type === 'city_bus' ? 5.4 : 3.9;
        if (planarDistance(player, body.mesh.position) > maxRange) continue;
        const topY = getVehicleTopAt(body, player.x, player.z) ?? (() => {
          body.mesh.updateWorldMatrix(true, true);
          vehicleSurfaceBox.setFromObject(body.mesh);
          return vehicleSurfaceBox.max.y;
        })();
        // Feet safely above the body are not a side collision. While rising, give
        // the player enough clearance to vault the bonnet edge instead of having
        // the side solver repel a perfectly good jump just before the feet clear it.
        if (player.y >= topY - 0.10) continue;
        // While airborne near the upper surface, let the jump/landing solver own
        // contact. Side-body separation used to shove the player away from bonnets
        // just before their feet cleared the edge, making car roofs feel repulsive.
        if (!engine.playerMovement.isGrounded && player.y >= topY - 0.98) continue;
        if (Math.abs(body.mesh.position.y - player.y) > 3.4) continue;

        const { halfWidth, halfLength } = getVehicleFootprint(body);
        const cos = Math.cos(body.yaw);
        const sin = Math.sin(body.yaw);
        const dx = player.x - body.mesh.position.x;
        const dz = player.z - body.mesh.position.z;
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        const limitX = halfWidth + playerRadius;
        const limitZ = halfLength + playerRadius;
        if (Math.abs(localX) >= limitX || Math.abs(localZ) >= limitZ) continue;

        // Work out the ACTUAL contact face before deciding whether this is a vehicle
        // strike. Touching a moving car is not enough: the vehicle itself must have
        // meaningful velocity INTO the player along that contact normal. This makes
        // running into a boot/rear bumper, parked car or glancing side contact harmless
        // while preserving real front-on (and genuine reversing) impacts.
        const overlapX = limitX - Math.abs(localX);
        const overlapZ = limitZ - Math.abs(localZ);
        const contactLocalX = overlapX < overlapZ ? (localX >= 0 ? 1 : -1) : 0;
        const contactLocalZ = overlapX < overlapZ ? 0 : (localZ >= 0 ? 1 : -1);
        const contactNx = contactLocalX * cos + contactLocalZ * sin;
        const contactNz = -contactLocalX * sin + contactLocalZ * cos;
        const forwardX = Math.sin(body.yaw);
        const forwardZ = Math.cos(body.yaw);
        const vehicleVx = forwardX * body.speed;
        const vehicleVz = forwardZ * body.speed;
        const relativeVx = vehicleVx - engine.playerMovement.velocity.x;
        const relativeVz = vehicleVz - engine.playerMovement.velocity.z;
        const vehicleIntoPlayerSpeed = vehicleVx * contactNx + vehicleVz * contactNz;
        const relativeClosingSpeed = relativeVx * contactNx + relativeVz * contactNz;
        const vehicleCausedImpact = vehicleIntoPlayerSpeed >= 4.0 && relativeClosingSpeed >= 4.8;
        const lastHit = Number(body.mesh.userData[body.hitKey] ?? 0);
        if (vehicleCausedImpact && now - lastHit > 1.15) {
          body.mesh.userData[body.hitKey] = now;
          const planarVehicleSpeed = Math.max(0.001, Math.hypot(vehicleVx, vehicleVz));
          const knockX = vehicleVx / planarVehicleSpeed;
          const knockZ = vehicleVz / planarVehicleSpeed;
          const knockSpeed = THREE.MathUtils.clamp(5.2 + relativeClosingSpeed * 0.30, 6.2, 13.5);
          engine.playerMovement.velocity.set(
            knockX * knockSpeed,
            THREE.MathUtils.clamp(3.8 + relativeClosingSpeed * 0.17, 4.6, 9.0),
            knockZ * knockSpeed
          );
          engine.playerMovement.isGrounded = false;
          engine.vehicleSurfaceSupport = null;
          // Low-speed genuine strikes are deliberately mild; fast direct hits still hurt.
          const impactDamage = THREE.MathUtils.clamp(
            2.0 + (relativeClosingSpeed - 4.8) * 1.30,
            2.0,
            34
          );
          damagePlayer(impactDamage, 'a moving vehicle');
          engine.cameraShake = Math.max(
            engine.cameraShake,
            THREE.MathUtils.clamp(0.12 + relativeClosingSpeed * 0.011, 0.14, 0.38)
          );
          return false;
        }

        // Nearest-side resolution in VEHICLE LOCAL SPACE. Unlike the old circular
        // repel this respects long bonnets/boots and does not kick the player away
        // from a roof just because they are near the vehicle centre. It still runs
        // when NO damage is dealt, so sprinting into a parked/rear/side surface is
        // physically blocked without costing health.
        let resolvedLocalX = localX;
        let resolvedLocalZ = localZ;
        if (overlapX < overlapZ) resolvedLocalX = (localX >= 0 ? 1 : -1) * (limitX + 0.015);
        else resolvedLocalZ = (localZ >= 0 ? 1 : -1) * (limitZ + 0.015);

        const targetX = body.mesh.position.x + resolvedLocalX * cos + resolvedLocalZ * sin;
        const targetZ = body.mesh.position.z - resolvedLocalX * sin + resolvedLocalZ * cos;
        const ground = engine.collisionSystem.getGroundHeightNear(targetX, targetZ, player.y, player.y, 0.8, 2.4);
        const candidate = new THREE.Vector3(targetX, ground, targetZ);
        if (engine.collisionSystem.canOccupy(candidate, playerRadius, playerHeight)) player.copy(candidate);
        engine.playerMovement.velocity.x *= 0.16;
        engine.playerMovement.velocity.z *= 0.16;
        engine.vehicleSurfaceSupport = null;
        break;
      }
      return false;
    };

    /**
     * Parked aircraft are dynamic scene actors, so they cannot be captured by the
     * static world-collision pass. Give their fuselages a lightweight oriented body
     * while the player is on foot. Wings intentionally remain mostly walk-under
     * geometry; the important rule is that the player cannot ghost through the cabin,
     * nose or tail while approaching the E-to-enter interaction.
     */
    const resolvePlayerAircraftBodies = () => {
      if (engine.activeVehicle || engine.activeAircraft || !engine.hasChosenStarter) return;
      const player = engine.playerMovement.position;
      const playerRadius = engine.currentPokemonId === 'charizard' ? 0.82 : 0.65;
      const playerHeight = engine.currentPokemonId === 'charizard' ? 2.72 : 1.9;

      for (const plane of engine.airportAircraft) {
        if (plane.inUse || !plane.onGround) continue;
        const dx = player.x - plane.position.x;
        const dz = player.z - plane.position.z;
        const broadRange = plane.length * 0.55 + playerRadius + 2.0;
        if (dx * dx + dz * dz > broadRange * broadRange) continue;

        // The rendered fuselage is centred a few metres above the gear, but its plan
        // footprint is a long narrow capsule-like body. An OBB is a much better
        // gameplay proxy than a circle based on wingspan, which would incorrectly
        // prevent the player from walking beneath wings.
        const cos = Math.cos(plane.yaw);
        const sin = Math.sin(plane.yaw);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        const fuselageHalfWidth = Math.max(0.78, plane.collisionRadius * 0.72) + playerRadius;
        const fuselageHalfLength = plane.length * 0.52 + playerRadius;
        if (Math.abs(localX) >= fuselageHalfWidth || Math.abs(localZ) >= fuselageHalfLength) continue;

        // If the player's feet are well above the fuselage proxy (for example after
        // deliberately jumping onto geometry) don't side-repel them down to ground.
        // For ordinary approach/contact the fuselage remains solid.
        const fuselageTop = plane.position.y + Math.max(2.8, plane.collisionRadius * 1.55 + 2.1);
        if (player.y > fuselageTop + 0.25) continue;

        const overlapX = fuselageHalfWidth - Math.abs(localX);
        const overlapZ = fuselageHalfLength - Math.abs(localZ);
        let resolvedLocalX = localX;
        let resolvedLocalZ = localZ;
        if (overlapX < overlapZ) resolvedLocalX = (localX >= 0 ? 1 : -1) * (fuselageHalfWidth + 0.025);
        else resolvedLocalZ = (localZ >= 0 ? 1 : -1) * (fuselageHalfLength + 0.025);

        const targetX = plane.position.x + resolvedLocalX * cos + resolvedLocalZ * sin;
        const targetZ = plane.position.z - resolvedLocalX * sin + resolvedLocalZ * cos;
        const ground = engine.collisionSystem.getGroundHeightNear(targetX, targetZ, player.y, player.y, 1.2, 4.0);
        const candidate = new THREE.Vector3(targetX, ground, targetZ);
        if (engine.collisionSystem.canOccupy(candidate, playerRadius, playerHeight)) player.copy(candidate);
        engine.playerMovement.velocity.x *= 0.14;
        engine.playerMovement.velocity.z *= 0.14;
        engine.vehicleSurfaceSupport = null;
        break;
      }
    };

    /** Player and NPCs have soft body collision: solid enough not to ghost through,
     * but the NPC yields/stumbles instead of behaving like a concrete bollard. */
    const resolvePlayerNpcBodies = (dt: number) => {
      if (!engine.hasChosenStarter || engine.activeVehicle || engine.playerMovement.position.y < -2) return;
      const player = engine.playerMovement.position;
      const playerRadius = engine.currentPokemonId === 'charizard' ? 0.82 : 0.62;
      const playerHeight = engine.currentPokemonId === 'charizard' ? 2.72 : 1.9;
      const planarSpeed = Math.hypot(engine.playerMovement.velocity.x, engine.playerMovement.velocity.z);
      const nearbyNPCs = engine.npcManager.getNPCsInRadius(player, engine.currentPokemonId === 'charizard' ? 1.9 : 1.55);
      // Swimming NPCs can sit below the player's root Y, so add a cheap planar
      // aquatic query rather than relying on the ordinary 3D-radius query alone.
      for (const aquatic of engine.npcManager.getAquaticNPCsNear(player, 2.45)) {
        if (!nearbyNPCs.includes(aquatic)) nearbyNPCs.push(aquatic);
      }
      for (const npc of nearbyNPCs) {
        if (!npc.mesh.visible || npc.state === 'kicked') continue;
        const aquatic = npc.movementMode === 'swimming' || npc.mesh.userData.aquatic === true;
        if (npc.movementMode === 'flying' || npc.mesh.userData.specialInteractionActive) continue;
        // Do not collide with a swimmer THROUGH an authored bridge deck while the
        // player is standing/driving on the road above. A genuinely swimming player
        // is airborne from the ground controller and still gets normal aquatic contact.
        if (aquatic && engine.playerMovement.isGrounded && engine.collisionSystem.isRoadSurfaceAt(player.x, player.z, 0.7)) continue;
        if (Math.abs(npc.mesh.position.y - player.y) > (aquatic ? 1.65 : 1.45)) continue;
        let dx = npc.mesh.position.x - player.x;
        let dz = npc.mesh.position.z - player.z;
        let dist = Math.hypot(dx, dz);
        const weight = Math.max(0.45, npc.combatWeight ?? npc.mesh.userData.combatWeight ?? 1);
        const downed = npc.state === 'knocked_out' || npc.state === 'recovering' || npc.state === 'defeated' || (npc.combatHp ?? 1) <= 0;
        const standingRadius = aquatic
          ? (npc.id === 'water_gyarados' ? 1.35 : npc.id === 'water_lapras' ? 1.05 : THREE.MathUtils.clamp(0.50 + Math.sqrt(weight) * 0.12, 0.54, 0.88))
          : THREE.MathUtils.clamp(0.43 + (Math.sqrt(weight) - 1) * 0.15, 0.40, 0.76);
        // A person on the floor still has a physical body, just a smaller footprint
        // than somebody standing upright. Aquatic NPCs keep their authored swim body.
        const npcRadius = aquatic ? standingRadius : (downed ? Math.min(0.56, standingRadius * 0.78) : standingRadius);
        const minDistance = playerRadius + npcRadius;
        if (dist >= minDistance) continue;
        if (dist < 0.001) {
          dx = Math.sin(engine.playerMovement.yaw);
          dz = Math.cos(engine.playerMovement.yaw);
          dist = 1;
        }
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDistance - dist;
        const contactPush = THREE.MathUtils.clamp(overlap * 0.72 + planarSpeed * dt * 0.22, 0.045, 0.38);
        const pushed = downed
          ? false
          : aquatic
          ? engine.npcManager.pushSwimmingNPCFromPlayer(npc, new THREE.Vector3(nx, 0, nz), Math.min(0.26, contactPush * 0.62))
          : engine.npcManager.pushNPCFromPlayer(npc, player, new THREE.Vector3(nx, 0, nz), contactPush);

        // Water Pokémon are physical but not concrete walls: they yield a little,
        // while the player gives up the remaining overlap without being snapped to
        // the river floor. Ground NPC behaviour remains unchanged.
        const playerShare = aquatic
          ? (pushed ? overlap * 0.58 : overlap * 0.82 + 0.015)
          : downed ? overlap * 0.74 + 0.01 : (pushed ? overlap * 0.34 : overlap + 0.025);
        const candidate = player.clone();
        candidate.x -= nx * playerShare;
        candidate.z -= nz * playerShare;
        if (!aquatic) {
          candidate.y = engine.collisionSystem.getGroundHeightNear(candidate.x, candidate.z, player.y, player.y, 0.75, 2.4);
        }
        const playerClear = aquatic
          ? engine.collisionSystem.canFlyOccupy(candidate, playerRadius, playerHeight)
          : engine.collisionSystem.canOccupy(candidate, playerRadius, playerHeight);
        if (playerClear) player.copy(candidate);

        // Kill only the component that is driving directly INTO the NPC. Tangential
        // movement remains, so the contact feels like sliding/pushing rather than a wall.
        const into = engine.playerMovement.velocity.x * nx + engine.playerMovement.velocity.z * nz;
        if (into > 0) {
          engine.playerMovement.velocity.x -= nx * into * 0.74;
          engine.playerMovement.velocity.z -= nz * into * 0.74;
        }
        break;
      }
    };

    const handleContinuousSpecials = (dt: number) => {
      if (!engine.hasChosenStarter || engine.activeVehicle || engine.vehicleEntryActive || engine.switchAnimator.active || engine.healingActive || engine.deathSequenceActive || engine.hospitalRecoveryActive || engine.toothlessMounted || engine.toothlessMounting || engine.milesInteractionActive || engine.seated || engine.grabbedNpcId) {
        setPoliwagWaterGunDrawn(engine.playerMesh, false);
        return;
      }
      const qHeld = !!engine.keys['KeyQ'];
      const id = engine.currentPokemonId;
      const pos = engine.playerMovement.position;
      const forward = new THREE.Vector3(Math.sin(engine.playerMovement.yaw), 0, Math.cos(engine.playerMovement.yaw));

      if (id === 'poliway') {
        setPoliwagWaterGunDrawn(engine.playerMesh, qHeld && waterRef.current > 0);
        if (qHeld && waterRef.current > 0) {
          const affected = engine.worldInteractions.sprayWater(pos, forward, dt);
          waterRef.current = Math.max(0, waterRef.current - dt * 18);
          engine.specialTimer = 0.12;
          damageBossWithSpecialIfAimed(8, 8, forward, 0.52);
          if (affected > 0 && engine.specialCrimeCooldown <= 0) {
            // Spraying someone is naughty, but much less serious than setting them on fire.
            addWanted(1);
            engine.specialCrimeCooldown = 2.5;
          }
        } else {
          waterRef.current = Math.min(100, waterRef.current + dt * 11);
        }
      } else {
        setPoliwagWaterGunDrawn(engine.playerMesh, false);
        waterRef.current = Math.min(100, waterRef.current + dt * 14);
      }

      if ((id === 'charmander' || id === 'charizard') && qHeld) {
        const affected = engine.worldInteractions.sprayFire(pos, forward, dt);
        engine.specialTimer = 0.12;
        damageBossWithSpecialIfAimed(id === 'charizard' ? 15 : 11, id === 'charizard' ? 10.5 : 7.5, forward, 0.52);
        if (affected > 0 && engine.specialCrimeCooldown <= 0) {
          addWanted(1);
          engine.specialCrimeCooldown = 1.8;
        }
      }
    };

    // ---------------------------------------------------------------------
    // INPUT - user's existing forward/back/side movement semantics are preserved.
    // ---------------------------------------------------------------------
    const keys: Record<string, boolean> = {};
    engine.keys = keys;
    let mouseDown = false;

    const togglePause = () => {
      if (starterSelectionCandidateRef.current) return;
      if (showMultiplayerModalRef.current) {
        setShowMultiplayerModal(false);
        return;
      }
      if (developerDebugOpenRef.current) {
        developerDebugOpenRef.current = false;
        setDeveloperDebugOpen(false);
        return;
      }
      const nextPaused = !pauseRef.current;
      pauseRef.current = nextPaused;
      setIsPaused(nextPaused);
      if (!nextPaused) {
        developerDebugOpenRef.current = false;
        setDeveloperDebugOpen(false);
      } else {
        soundManager.stopEngine();
        soundManager.setSiren(false);
      }
      clearHeldInputs();
    };
    togglePauseRef.current = togglePause;

    const onKeyDown = (event: KeyboardEvent) => {
      soundManager.unlock();
      const target = event.target as HTMLElement | null;
      const isInput = Boolean(
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )
      );
      if (isInput) {
        if (event.code === 'Escape') {
          target?.blur();
          if (showMultiplayerModalRef.current) {
            setShowMultiplayerModal(false);
          }
        }
        return;
      }
      if (starterSelectionCandidateRef.current) {
        event.preventDefault();
        if (!event.repeat && event.code === 'Enter') confirmStarterSelectionRef.current();
        if (!event.repeat && event.code === 'Escape') {
          starterSelectionCandidateRef.current = null;
          setStarterSelectionCandidate(null);
        }
        return;
      }
      if (!event.repeat && event.code === 'Escape') {
        event.preventDefault();
        togglePause();
        return;
      }
      if (arcadeActiveRef.current) {
        return;
      }
      if (pauseRef.current) {
        return;
      }
      keys[event.code] = true;
      if (event.repeat) return;
      const activeInputEngine = engineRef.current;
      if (activeInputEngine?.parachuteController) {
        if (['KeyE','KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(event.code)) event.preventDefault();
        if (event.code === 'Space' && activeInputEngine.parachuteController.mode === 'freefall') {
          if (activeInputEngine.parachuteController.deploy()) {
            playSoundEffect('jump');
            showTemporaryNotification('Parachute', 'Canopy deployed — E drops back into freefall, SPACE can redeploy it again.');
          }
        } else if (event.code === 'KeyE' && activeInputEngine.parachuteController.mode === 'parachute') {
          if (activeInputEngine.parachuteController.cutAway()) {
            showTemporaryNotification('Parachute', 'Canopy cut — FREEFALL. Press SPACE whenever you want to redeploy.');
          }
        }
        // Freefall/parachute owns movement. Do not leak attack/special/switch keys
        // into normal character gameplay while suspended in the air.
        return;
      }
      if (activeInputEngine?.activeAircraft) {
        if (['KeyE','KeyW','KeyS','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(event.code)) event.preventDefault();
        if (event.code === 'KeyE') handleInteraction();
        // All other aircraft controls are continuous key-state inputs. Do not let
        // F/Q/G/number shortcuts fire character actions while piloting.
        return;
      }
      if (event.code === 'KeyE') handleInteraction();
      if (event.code === 'KeyH') {
        const current = engineRef.current;
        if (current?.activeVehicle && !current.deathSequenceActive && !current.hospitalRecoveryActive) {
          soundManager.playVehicleHorn(
            current.activeVehicle.type ?? current.activeVehicle.modelType ?? 'civilian_sedan',
            current.activeVehicle.mesh.position
          );
        }
      }
      if (event.code === 'KeyF') handleAttack();
      if (event.code === 'KeyG') {
        if (!event.repeat) handleGrab();
      }
      if (event.code === 'KeyQ') performInstantSpecial();
      // Number-key Pokémon shortcuts do not exist until the starter has been
      // confirmed. Do not even dispatch a switch request during the intro state.
      if (engine.hasChosenStarter) {
        if (event.code === 'Digit1') requestPokemonSwitch('pikachu');
        if (event.code === 'Digit2') requestPokemonSwitch('charmander');
        if (event.code === 'Digit3') requestPokemonSwitch('poliway');
        if (event.code === 'Digit4') requestPokemonSwitch('geodude_legs');
        if (event.code === 'Digit5') requestPokemonSwitch('charizard');
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (arcadeActiveRef.current) return;
      const target = event.target as HTMLElement | null;
      if (
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )
      ) {
        return;
      }
      keys[event.code] = false;
    };

    let lastMouseX = 0;
    let lastMouseY = 0;
    const onMouseDown = (event: MouseEvent) => {
      soundManager.unlock();
      if (arcadeActiveRef.current || pauseRef.current || event.button !== 0) return;
      mouseDown = true;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (
        arcadeActiveRef.current ||
        !mouseDown ||
        pauseRef.current ||
        !engineRef.current ||
        engineRef.current.activeVehicle ||
        engineRef.current.activeAircraft ||
        engineRef.current.deathSequenceActive ||
        engineRef.current.hospitalRecoveryActive
      ) return;
      const dx = event.clientX - lastMouseX;
      const dy = event.clientY - lastMouseY;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      engineRef.current.cameraAngle -= dx * 0.005;
      // Normal on-foot orbit can now travel almost underneath the look pivot so the
      // player can genuinely look high into the sky. Seated and active Charizard
      // flight keep their established narrower orbit; their authored camera branches
      // are tuned separately and should not inherit the ground-skimming sky view.
      const parachuteOrbit = !!engineRef.current.parachuteController;
      const wideSkyOrbit = !engineRef.current.seated && !(
        engineRef.current.currentPokemonId === 'charizard' && engineRef.current.charizardFlightActive
      );
      // Parachuting uses the same mouse-drag orbit as normal third person, but keep
      // the camera from travelling excessively below the falling player.
      const minPitch = parachuteOrbit ? -0.55 : wideSkyOrbit ? -1.48 : 0.10;
      const maxPitch = parachuteOrbit ? 1.08 : wideSkyOrbit ? 1.02 : 0.85;
      engineRef.current.cameraPitch = THREE.MathUtils.clamp(
        engineRef.current.cameraPitch + dy * 0.003,
        minPitch,
        maxPitch
      );
    };
    const onMouseUp = () => {
      mouseDown = false;
    };

    const onWheel = (event: WheelEvent) => {
      const e = engineRef.current;
      if (arcadeActiveRef.current || pauseRef.current || !e || e.activeVehicle || e.activeAircraft || e.elevatorRideActive || e.deathSequenceActive || e.hospitalRecoveryActive) return;
      event.preventDefault();
      // Trackpad/mouse-wheel zoom keeps the existing close view but now allows a
      // genuinely wide third-person view outdoors. Indoor collision will
      // automatically pull the camera back in when there is not enough room.
      e.cameraTargetDistance = THREE.MathUtils.clamp(
        e.cameraTargetDistance + event.deltaY * 0.012,
        4.2,
        18.0
      );
    };

    const clearHeldInputs = () => {
      for (const code of Object.keys(keys)) keys[code] = false;
      mouseDown = false;
      analogInputStateRef.current = { active: false, x: 0, y: 0, magnitude: 0, angle: 0 };
    };

    const enterArcadeMode = (machine?: ArcadeMachineInfo) => {
      if (multiplayerRef.current.state.isInRoom) {
        showTemporaryNotification('Arcade Restricted', 'Arcade minigames are disabled during active multiplayer sessions.');
        return;
      }
      const e = engineRef.current;
      const pos = e ? e.playerMovement.position.clone() : new THREE.Vector3();
      const targetMachine: ArcadeMachineInfo = machine ?? {
        id: 'arcade_quick_launch',
        name: 'Retro Hit & Run 8-Bit',
        position: pos,
        gameId: 'retro_hit_and_run',
      };

      clearHeldInputs();
      soundManager.setArcadeMode(true);
      soundManager.stopEngine();
      soundManager.setSiren(false);
      soundManager.stopMusic();
      soundManager.stopFountainAmbience();

      // Smooth camera transition toward machine cabinet screen
      if (e && machine) {
        e.cameraTargetDistance = 1.8;
        e.cameraPitch = 0.12;
      }

      setTimeout(() => {
        arcadeActiveRef.current = true;
        activeArcadeMachineRef.current = targetMachine;
        setActiveArcadeMachine(targetMachine);
        setIsArcadeActive(true);
      }, machine ? 200 : 0);
    };

    const exitArcadeMode = () => {
      arcadeActiveRef.current = false;
      activeArcadeMachineRef.current = null;
      setActiveArcadeMachine(null);
      setIsArcadeActive(false);
      soundManager.setArcadeMode(false);

      const e = engineRef.current;
      if (e) {
        e.cameraTargetDistance = 6.5;
        e.cameraPitch = 0.35;
      }

      lastTime = performance.now();
      fpsWindowStart = performance.now();
      fpsFrames = 0;

      clearHeldInputs();
    };

    enterArcadeModeRef.current = enterArcadeMode;
    exitArcadeModeRef.current = exitArcadeMode;
    const onVisibilityChange = () => {
      if (document.hidden) clearHeldInputs();
    };

    const onResize = () => {
      if (!mountRef.current) return;
      const width = Math.max(mountRef.current.clientWidth || window.innerWidth || 800, 320);
      const height = Math.max(mountRef.current.clientHeight || window.innerHeight || 600, 240);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mountRef.current);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('blur', clearHeldInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeunload', saveNow);

    mobileKeyChangeRef.current = (code: string, isDown: boolean) => {
      soundManager.unlock();
      keys[code] = isDown;
    };

    mobileAnalogMoveRef.current = (data: AnalogInputData) => {
      analogInputStateRef.current = data;
    };

    mobileCameraDragRef.current = (dx: number, dy: number) => {
      const e = engineRef.current;
      if (!e || e.deathSequenceActive || e.hospitalRecoveryActive) return;
      e.cameraAngle -= dx * 0.005;
      if (e.cameraPitch !== undefined) {
        e.cameraPitch = Math.max(-0.25, Math.min(1.1, e.cameraPitch + dy * 0.004));
      }
    };

    mobileActionRef.current = (action) => {
      soundManager.unlock();
      const activeInputEngine = engineRef.current;
      if (!activeInputEngine || activeInputEngine.deathSequenceActive || activeInputEngine.hospitalRecoveryActive) return;

      if (action === 'interact') {
        handleInteraction();
      } else if (action === 'attack') {
        handleAttack();
      } else if (action === 'grab') {
        handleGrab();
      } else if (action === 'special') {
        performInstantSpecial();
      } else if (action === 'chute_deploy') {
        if (activeInputEngine.parachuteController) {
          if (activeInputEngine.parachuteController.mode === 'freefall') {
            if (activeInputEngine.parachuteController.deploy()) {
              showTemporaryNotification('Parachute', 'Canopy deployed — CUT CHUTE drops back into freefall.');
            }
          }
        } else {
          const groundY = activeInputEngine.collisionSystem.getGroundHeightNear(
            activeInputEngine.playerMovement.position.x,
            activeInputEngine.playerMovement.position.z,
            activeInputEngine.playerMovement.position.y,
            0.12, 1.2, 400
          );
          const altitude = activeInputEngine.playerMovement.position.y - groundY;
          if (!activeInputEngine.playerMovement.isGrounded || altitude > 1.6 || activeInputEngine.playerMovement.velocity.y < -2.0) {
            activeInputEngine.playerMovement.isGrounded = false;
            activeInputEngine.parachuteController = new ParachuteController(
              activeInputEngine.scene,
              activeInputEngine.playerMovement.velocity,
              activeInputEngine.playerMovement.yaw
            );
            activeInputEngine.parachuteController.deploy();
            setParachuteHud({
              mode: 'parachute',
              altitude: Math.max(0, altitude),
              verticalSpeed: activeInputEngine.playerMovement.velocity.y,
              deployment: 0.95,
            });
            showTemporaryNotification('Parachute', 'Canopy deployed!');
          }
        }
      } else if (action === 'jump') {
        if (activeInputEngine.parachuteController && activeInputEngine.parachuteController.mode === 'freefall') {
          if (activeInputEngine.parachuteController.deploy()) {
            showTemporaryNotification('Parachute', 'Canopy deployed — CUT CHUTE drops back into freefall.');
          }
        } else {
          keys['Space'] = true;
          setTimeout(() => {
            keys['Space'] = false;
          }, 120);
        }
      } else if (action === 'sprint') {
        keys['ShiftLeft'] = !keys['ShiftLeft'];
      } else if (action === 'horn') {
        if (activeInputEngine.activeVehicle) {
          soundManager.playVehicleHorn(
            activeInputEngine.activeVehicle.type ?? activeInputEngine.activeVehicle.modelType ?? 'civilian_sedan',
            activeInputEngine.activeVehicle.mesh.position
          );
        }
      } else if (action === 'chute_cut') {
        if (activeInputEngine.parachuteController && activeInputEngine.parachuteController.mode === 'parachute') {
          activeInputEngine.parachuteController.cutAway();
          showTemporaryNotification('Parachute', 'Canopy cut — FREEFALL. Press DEPLOY whenever you want to redeploy.');
        }
      }
    };

    // ---------------------------------------------------------------------
    // MAIN LOOP
    // ---------------------------------------------------------------------
    let animationFrameId = 0;
    let lastTime = performance.now();

    // Reuse temporary math objects instead of allocating new Vector3/Color
    // instances every rendered frame. This avoids garbage-collection stutter.
    const tempCameraTarget = new THREE.Vector3();
    const tempLookTarget = new THREE.Vector3();
    const tempGroundCameraProbe = new THREE.Vector3();
    const tempShake = new THREE.Vector3();
    const tempAudioForward = new THREE.Vector3();
    const tempAudioRight = new THREE.Vector3();

    // Keep a low upward-looking third-person orbit above the authored floor without
    // changing its look angle. Rather than clamping Y (which would flatten the view),
    // pull the camera toward the look pivot along the SAME orbit ray until the camera
    // sphere clears the ground. This naturally makes the camera lower AND closer as
    // pitch approaches straight-up, matching a modern collision-aware orbit camera.
    const constrainOnFootCameraAboveGround = (
      focus: THREE.Vector3,
      desired: THREE.Vector3,
      playerFeetY: number,
      clearance = 0.34,
    ) => {
      const originalX = desired.x;
      const originalY = desired.y;
      const originalZ = desired.z;
      const isClear = (point: THREE.Vector3) => {
        const ground = collisionSystem.getGroundHeightNear(
          point.x,
          point.z,
          playerFeetY,
          point.y - clearance,
          1.8,
          18.0,
        );
        return point.y >= ground + clearance - 0.005;
      };

      if (isClear(desired)) return desired;

      // Focus is the character's chest/head pivot and is expected to be clear. Find
      // the furthest legal point along the orbit ray with a short binary search.
      // Eight iterations is sub-centimetre precision at normal camera distances and
      // costs far less than adding another physics body to the scene.
      let safeT = 0;
      let blockedT = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (safeT + blockedT) * 0.5;
        tempGroundCameraProbe.set(
          focus.x + (originalX - focus.x) * mid,
          focus.y + (originalY - focus.y) * mid,
          focus.z + (originalZ - focus.z) * mid,
        );
        if (isClear(tempGroundCameraProbe)) safeT = mid;
        else blockedT = mid;
      }

      desired.set(
        focus.x + (originalX - focus.x) * safeT,
        focus.y + (originalY - focus.y) * safeT,
        focus.z + (originalZ - focus.z) * safeT,
      );
      return desired;
    };
    const skyDay = new THREE.Color(0x87ceeb);
    const skySunset = new THREE.Color(0xffb56b);
    const skyWorking = new THREE.Color(0x87ceeb);
    const cloudDay = new THREE.Color(0xffffff);
    const cloudSunset = new THREE.Color(0xffdfc2);
    const cloudWorking = new THREE.Color(0xffffff);
    const skyHorizonDay = new THREE.Color(0xeaf5ef);
    const skyGroundSunset = new THREE.Color(0x9a7654);
    const tempCloudDummy = new THREE.Object3D();
    const lastShadowFocus = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, Number.POSITIVE_INFINITY);

    // Expensive world AI/particles do not need to run at monitor refresh rate.
    let worldTickAccumulator = 0;
    let interactionAccumulator = 0;
    let dayNightAccumulator = 0;
    let policeTickAccumulator = 0;
    let detailCullAccumulator = 0;
    let shadowUpdateAccumulator = 0;
    let detailCullCursor = 0;
    let staticShadowCursor = 0;
    let propCullCursor = 0;
    let vehicleCullCursor = 0;
    let npcShadowCursor = 0;
    // Static detail/shadow LOD is position-dependent, not animation-dependent. A
    // low-FPS feedback loop used to process ~20% of thousands of static entries on
    // every frame once frame time exceeded the 0.10s maintenance interval. Track a
    // bounded amount of pending static work and only schedule a fresh pass after the
    // player/camera meaningfully moves or the quality tier changes.
    let detailCullWorkRemaining = detailCullEntries.length;
    let staticShadowWorkRemaining = staticShadowEntries.length;
    const lastStaticLodAnchor = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, Number.POSITIVE_INFINITY);
    const lastStaticLodCamera = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, Number.POSITIVE_INFINITY);
    let lastStaticLodTier = '';
    let cloudTickAccumulator = 0;
    let fountainTickAccumulator = 0;
    let riverTickAccumulator = 0;
    let pursuitSenseAccumulator = 0;
    let cachedNearestPolice = Infinity;
    let cachedPoliceLineOfSight = false;
    let perfTelemetryAccumulator = 0;
    let perfMaxFrameMs = 0;
    let perfSlowFrameCount = 0;

    // Adaptive quality keeps the game playable on Retina/high-DPI displays without
    // permanently making the game look worse for faster machines.
    type QualityTier = 'high' | 'balanced' | 'performance';
    let qualityTier: QualityTier = 'balanced';
    let appliedQualityTier: QualityTier | null = null;
    let lowFpsWindows = 0;
    let highFpsWindows = 0;
    let qualityChangeCooldownUntil = 0;
    const nativeDpr = window.devicePixelRatio || 1;

    // Spread large visibility/shadow-maintenance arrays across several short slices
    // instead of processing every decorative mesh, prop and NPC on one 300ms beat.
    // This targets frame pacing: total work stays similar, but large periodic spikes
    // while driving quickly disappear.
    const processCyclicBatch = (
      length: number,
      cursor: number,
      budget: number,
      visitor: (index: number) => void
    ) => {
      if (length <= 0 || budget <= 0) return 0;
      const count = Math.min(length, budget);
      let next = cursor % length;
      for (let i = 0; i < count; i++) {
        visitor(next);
        next = (next + 1) % length;
      }
      return next;
    };

    const applyQualityTier = (next: QualityTier) => {
      if (appliedQualityTier === next) return;
      qualityTier = next;
      appliedQualityTier = next;
      const ratio = next === 'high'
        ? Math.min(nativeDpr, 1.18)
        : next === 'balanced'
        ? Math.min(nativeDpr, 0.95)
        : Math.min(nativeDpr, 0.70);
      renderer.setPixelRatio(ratio);
      // Never remove sunlight shadows just because the adaptive controller drops
      // to Performance. That was the reason the world looked beautiful during the
      // first loading frames and then suddenly went flat. Performance instead uses
      // a smaller/cheaper local shadow budget below.
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // Shadow maps are expensive because they redraw every shadow caster in a
      // second render pass. Update them at a stable gameplay cadence rather than
      // automatically on every monitor frame; normal colour rendering stays full-rate.
      renderer.shadowMap.autoUpdate = false;
      // Keep the same 1024px shadow target across tier changes. The startup look the
      // user likes already uses this size, and reallocating/discarding the shadow map
      // during an emergency quality transition can itself create a renderer hitch.
      // Performance savings come from caster radius + refresh cadence instead.
      const shadowSize = 1024;
      if (sun.shadow.mapSize.x !== shadowSize) {
        sun.shadow.mapSize.set(shadowSize, shadowSize);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      const inAir = !!(
        engineRef.current?.activeAircraft ||
        engineRef.current?.charizardFlightActive ||
        (engineRef.current?.playerMovement && engineRef.current.playerMovement.position.y > 25)
      );
      const cameraFar = inAir
        ? (next === 'high' ? 780 : next === 'balanced' ? 620 : 460)
        : (next === 'high' ? 460 : next === 'balanced' ? 350 : 280);
      if (Math.abs(camera.far - cameraFar) > 1) {
        camera.far = cameraFar;
        camera.updateProjectionMatrix();
      }
      renderer.shadowMap.needsUpdate = true;
      particles.setPerformanceMode(next === 'performance');

      // Apply the tier's static shadow radius and detail culling immediately, including the initial
      // Balanced setup. Previously every authored mesh/caster started enabled and was only
      // corrected in tiny background batches, leaving thousands of remote meshes submitting
      // draw calls on frame 1.
      const anchor = getActivePosition();
      const immediateShadowDistance = next === 'high' ? 82 : next === 'balanced' ? 58 : 42;
      const immediateShadowDistanceSq = immediateShadowDistance * immediateShadowDistance;
      for (const entry of staticShadowEntries) {
        const dx = entry.x - anchor.x;
        const dz = entry.z - anchor.z;
        entry.mesh.castShadow = dx * dx + dz * dz <= immediateShadowDistanceSq;
      }
      staticShadowCursor = 0;
      staticShadowWorkRemaining = 0;

      const immediateDetailDistance = next === 'high' ? 118 : next === 'balanced' ? 82 : 58;
      const immediateInteriorDistance = next === 'high' ? 62 : next === 'balanced' ? 50 : 34;
      const immediateDetailDistanceSq = immediateDetailDistance * immediateDetailDistance;
      const immediateInteriorDistanceSq = immediateInteriorDistance * immediateInteriorDistance;
      for (let i = 0; i < detailCullEntries.length; i++) {
        const entry = detailCullEntries[i];
        const dx = entry.x - anchor.x;
        const dz = entry.z - anchor.z;
        const limitSq = entry.interior ? immediateInteriorDistanceSq : immediateDetailDistanceSq;
        entry.object.visible = dx * dx + dz * dz <= limitSq;
      }
      detailCullCursor = 0;
      detailCullWorkRemaining = 0;

      if (engineRef.current) {
        const propDistance = next === 'high' ? 180 : next === 'balanced' ? 145 : 108;
        const propDistanceSq = propDistance * propDistance;
        for (let i = 0; i < engineRef.current.destructibles.length; i++) {
          const prop = engineRef.current.destructibles[i];
          const dx = prop.mesh.position.x - anchor.x;
          const dz = prop.mesh.position.z - anchor.z;
          prop.mesh.visible = dx * dx + dz * dz <= propDistanceSq;
        }
      }
    };

    // Apply the balanced defaults immediately; do not wait for the first adaptive tier change.
    applyQualityTier('balanced');

    // FPS is measured every ~0.5s so the HUD itself does not cause extra lag.
    let fpsWindowStart = performance.now();
    let fpsFrames = 0;
    const coastCarInputs: CarInputs = {
      forward: false, backward: false, left: false, right: false, handbrake: false, boost: false,
    };
    let airportBaggageAccumulator = 0;
    const airportBaggagePoint = new THREE.Vector3();
    const airportBaggageTangent = new THREE.Vector3();
    const airportBaggageNormal = new THREE.Vector3();
    const airportBaggageWorldPoint = new THREE.Vector3();
    const airportBaggageWorldNormal = new THREE.Vector3();
    const airportBaggagePush = new THREE.Vector3();
    const airportBaggagePlayerCandidate = new THREE.Vector3();
    const airportBaggageGroupQuaternion = new THREE.Quaternion();
    const airportBeltMarkerMatrix = new THREE.Matrix4();
    const airportBeltMarkerQuaternion = new THREE.Quaternion();
    const airportBeltMarkerScale = new THREE.Vector3(1, 1, 1);
    const airportBeltMarkerPosition = new THREE.Vector3();
    const airportBeltYAxis = new THREE.Vector3(0, 1, 0);
    const activeVehiclePreviousPosition = new THREE.Vector3();
    // This node never changes identity. Looking it up by recursively walking the
    // Springfield tree every render frame is pure overhead, especially while the
    // whole Springfield district is hidden.
    const simpsonsTvScreen = springfield.group.getObjectByName('simpsons_tv_screen');

    // Developer diagnostics are sampled at a low cadence and surfaced only when the
    // pause-menu debug panel is open. They intentionally reuse existing counters and
    // renderer.info so normal gameplay does not pay for an always-on profiler UI.
    let lastMeasuredFps = 60;
    let lastActiveFrameMs = 16.7;
    let lastFrameCpuMs = 0;
    let lastRenderSubmitMs = 0;
    let lastFrameCpuBreakdown: FrameCpuBreakdown = {
      preControl: 0,
      controlCamera: 0,
      visibilityLod: 0,
      worldSimulation: 0,
      postWorld: 0,
      render: 0,
      other: 0,
    };
    let lastWorldTickMs = 0;
    let lastWorldTickBreakdown: WorldTickBreakdown = {
      football: 0, traffic: 0, vehicleContacts: 0, worldInteractions: 0, vehicleDamage: 0,
      particles: 0, npcs: 0, jailGuard: 0, ashRoam: 0, ashBattle: 0, other: 0,
    };
    const recentWorldTicks: Array<{ at: number; totalMs: number; breakdown: WorldTickBreakdown }> = [];
    let debugLastPublishAt = 0;
    let resourceBaselineGeometries: number | null = null;
    let resourceBaselineHeapMb: number | null = null;
    const resourceBaselineCaptureAt = lastTime + 12000;
    let watchdogRecoveries = 0;
    let lastRecoveryReason = 'none';
    const debugStalls: Array<{ at: number; frameMs: number; reason: string }> = [];
    const recordDebugStall = (at: number, frameMs: number, reason: string) => {
      const previous = debugStalls[debugStalls.length - 1];
      if (previous && at - previous.at < 450 && Math.abs(frameMs - previous.frameMs) < 8) return;
      debugStalls.push({ at, frameMs, reason });
      while (debugStalls.length > 12) debugStalls.shift();
    };
    const countAttachedSceneResources = () => {
      let meshes = 0;
      const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          meshes++;
          geometries.add(obj.geometry);
        }
      });
      return { meshes, geometries: geometries.size };
    };
    const publishDeveloperDebug = (time: number, frameMs: number, paused: boolean) => {
      if (!developerDebugOpenRef.current || time - debugLastPublishAt < 220) return;
      debugLastPublishAt = time;
      const current = engineRef.current;
      if (!current) return;
      const active = getActivePosition();
      const propStats = current.worldInteractions.getDebugStats();
      const particleStats = current.particles.getDebugStats();
      const info = current.renderer.info;
      const attachedScene = countAttachedSceneResources();
      const performanceMemory = (performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }).memory;
      const heapMb = performanceMemory ? performanceMemory.usedJSHeapSize / (1024 * 1024) : null;
      const roundWorldBreakdown = (value: WorldTickBreakdown): WorldTickBreakdown => ({
        football: Number(value.football.toFixed(2)),
        traffic: Number(value.traffic.toFixed(2)),
        vehicleContacts: Number(value.vehicleContacts.toFixed(2)),
        worldInteractions: Number(value.worldInteractions.toFixed(2)),
        vehicleDamage: Number(value.vehicleDamage.toFixed(2)),
        particles: Number(value.particles.toFixed(2)),
        npcs: Number(value.npcs.toFixed(2)),
        jailGuard: Number(value.jailGuard.toFixed(2)),
        ashRoam: Number(value.ashRoam.toFixed(2)),
        ashBattle: Number(value.ashBattle.toFixed(2)),
        other: Number(value.other.toFixed(2)),
      });
      const recentMaxFrameMs = Math.max(
        paused ? lastActiveFrameMs : frameMs,
        ...debugStalls.filter((stall) => time - stall.at <= 10000).map((stall) => stall.frameMs),
      );
      const recentWorld = recentWorldTicks.filter((sample) => time - sample.at <= 15000);
      const worstWorld = recentWorld.reduce<(typeof recentWorld)[number] | null>(
        (worst, sample) => !worst || sample.totalMs > worst.totalMs ? sample : worst,
        null,
      );
      const district = active.z < -360
        ? 'Airport District'
        : active.x < -340
          ? 'Highway / Volcano'
          : active.z < -330
            ? 'South Connector'
            : active.x > 270
              ? 'Springfield'
              : 'Goldenrod / Route 34';
      const snapshot: DeveloperDebugSnapshot = {
        paused,
        qualityTier,
        fps: lastMeasuredFps,
        frameMs: Number((paused ? lastActiveFrameMs : frameMs).toFixed(2)),
        frameCpuMs: Number(lastFrameCpuMs.toFixed(2)),
        frameCpuBreakdown: {
          preControl: Number(lastFrameCpuBreakdown.preControl.toFixed(2)),
          controlCamera: Number(lastFrameCpuBreakdown.controlCamera.toFixed(2)),
          visibilityLod: Number(lastFrameCpuBreakdown.visibilityLod.toFixed(2)),
          worldSimulation: Number(lastFrameCpuBreakdown.worldSimulation.toFixed(2)),
          postWorld: Number(lastFrameCpuBreakdown.postWorld.toFixed(2)),
          render: Number(lastFrameCpuBreakdown.render.toFixed(2)),
          other: Number(lastFrameCpuBreakdown.other.toFixed(2)),
        },
        worldTickMs: Number(lastWorldTickMs.toFixed(2)),
        worldTickBreakdown: roundWorldBreakdown(lastWorldTickBreakdown),
        worstRecentWorldTick: worstWorld ? {
          ageSeconds: Number(Math.max(0, (time - worstWorld.at) / 1000).toFixed(1)),
          totalMs: Number(worstWorld.totalMs.toFixed(2)),
          breakdown: roundWorldBreakdown(worstWorld.breakdown),
        } : null,
        recentMaxFrameMs: Number(recentMaxFrameMs.toFixed(2)),
        player: { x: Number(active.x.toFixed(2)), y: Number(active.y.toFixed(2)), z: Number(active.z.toFixed(2)) },
        camera: {
          x: Number(current.camera.position.x.toFixed(2)),
          y: Number(current.camera.position.y.toFixed(2)),
          z: Number(current.camera.position.z.toFixed(2)),
        },
        cameraToPlayer: Number(current.camera.position.distanceTo(active).toFixed(2)),
        district,
        roots: {
          goldenrod: goldenrod.group.visible,
          springfield: springfield.group.visible,
          airport: airport.group.visible,
          airportCore: airportCorePerformanceVisible,
          highway: highway.group.visible,
          arcade: arcadeBuilding.group.visible,
        },
        npcs: {
          visible: current.npcManager.npcs.reduce((count, npc) => count + (npc.mesh.visible ? 1 : 0), 0),
          total: current.npcManager.npcs.length,
        },
        vehicles: {
          visible: current.vehicles.reduce((count, vehicle) => count + (vehicle.mesh.visible ? 1 : 0), 0),
          total: current.vehicles.length,
        },
        props: { awake: propStats.awakeProps, total: propStats.totalProps, substeps: propStats.propSubsteps },
        particles: {
          active: particleStats.activeParticles,
          water: particleStats.water,
          fire: particleStats.fire,
          sparks: particleStats.sparks,
          smoke: particleStats.smoke,
          crashEffects: particleStats.crashEffects,
        },
        collision: {
          colliders: current.collisionSystem.colliders.length,
          walkableSurfaces: current.collisionSystem.walkableSurfaces.length,
        },
        render: {
          calls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: Array.isArray((info as unknown as { programs?: unknown[] }).programs) ? ((info as unknown as { programs?: unknown[] }).programs?.length ?? 0) : 0,
          staticLightsDisabled: disabledStaticLocalLights.length,
          staticBatches: staticBatchStats.batches,
          batchedMeshes: staticBatchStats.batchedMeshes,
          canonicalizedMeshes: staticBatchStats.canonicalizedMeshes,
          deduplicatedMeshes: sharedGeometryStats.meshesRebound,
          deduplicatedGeometries: sharedGeometryStats.geometriesDisposed,
          warmupDone: liveGpuWarmupEnabled ? gpuWarmupCursor : 0,
          warmupTotal: liveGpuWarmupEnabled ? gpuWarmupQueue.length : 0,
          renderMs: Number(lastRenderSubmitMs.toFixed(2)),
          sceneMeshes: attachedScene.meshes,
          sceneGeometries: attachedScene.geometries,
        },
        resourceGrowth: {
          geometryBaseline: resourceBaselineGeometries,
          geometryDelta: resourceBaselineGeometries === null ? null : info.memory.geometries - resourceBaselineGeometries,
          heapBaselineMb: resourceBaselineHeapMb === null ? null : Number(resourceBaselineHeapMb.toFixed(1)),
          heapDeltaMb: heapMb === null || resourceBaselineHeapMb === null ? null : Number((heapMb - resourceBaselineHeapMb).toFixed(1)),
        },
        jsHeapMb: heapMb === null ? null : Number(heapMb.toFixed(1)),
        watchdogRecoveries,
        lastRecoveryReason,
        recentStalls: debugStalls.slice(-8).reverse().map((stall) => ({
          ageSeconds: Number(Math.max(0, (time - stall.at) / 1000).toFixed(1)),
          frameMs: Number(stall.frameMs.toFixed(1)),
          reason: stall.reason,
        })),
      };
      debugSnapshotRef.current = snapshot;
      setDebugSnapshot(snapshot);
    };

    debugRecoverRef.current = () => {
      const current = engineRef.current;
      if (!current) return;
      goldenrod.group.visible = true;
      springfield.group.visible = true;
      airport.group.visible = true;
      highway.group.visible = true;
      arcadeBuilding.group.visible = true;
      let reason = 'manual world-root recovery';
      if (
        !current.activeVehicle &&
        !current.activeAircraft &&
        !current.parachuteController &&
        !current.deathSequenceActive &&
        !current.hospitalRecoveryActive
      ) {
        const pos = current.playerMovement.position;
        const lookHeight = current.currentPokemonId === 'charizard' ? 1.38 : 1.1;
        const focus = new THREE.Vector3(pos.x, pos.y + lookHeight, pos.z);
        const camDist = THREE.MathUtils.clamp(current.cameraDistance, 4.2, 18);
        const desired = new THREE.Vector3(
          pos.x - Math.sin(current.cameraAngle) * Math.cos(current.cameraPitch) * camDist,
          pos.y + Math.sin(current.cameraPitch) * camDist + (current.currentPokemonId === 'charizard' ? 1.25 : 1.0),
          pos.z - Math.cos(current.cameraAngle) * Math.cos(current.cameraPitch) * camDist,
        );
        if (current.cameraPitch < 0.12) constrainOnFootCameraAboveGround(focus, desired, pos.y);
        const safe = current.collisionSystem.resolveCameraPosition(focus, desired, 0.26, 0.20);
        current.camera.position.copy(safe);
        current.camera.lookAt(focus);
        reason = 'manual camera + world-root recovery';
      }
      watchdogRecoveries++;
      lastRecoveryReason = reason;
      recordDebugStall(performance.now(), 0, reason);
      publishDeveloperDebug(performance.now(), 0, true);
    };

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);
      const frameCpuStarted = performance.now();
      let framePhaseStarted = frameCpuStarted;
      let framePreControlMs = 0;
      let frameControlCameraMs = 0;
      let frameVisibilityLodMs = 0;
      let frameWorldSimulationMs = 0;
      let framePostWorldMs = 0;
      const frameMs = Math.max(0, time - lastTime);
      const rawDt = Math.min(frameMs / 1000, 0.075);
      lastTime = time;
      perfMaxFrameMs = Math.max(perfMaxFrameMs, frameMs);
      if (frameMs > 34) perfSlowFrameCount++;
      if (frameMs > 80) recordDebugStall(time, frameMs, frameMs > 180 ? 'severe frame stall' : 'slow frame');
      // A single pathological 140ms+ frame is enough to start a browser feedback
      // loop (late frame -> more work -> another late frame). Once the scene has
      // actually rendered a few frames, immediately shed expensive rendering work
      // instead of waiting several 500ms FPS windows for the normal hysteresis.
      // The normal quality controller can promote the tier again after recovery.
      if (!pauseRef.current && fpsFrames > 8 && frameMs > 140 && qualityTier !== 'performance') {
        applyQualityTier('performance');
        lowFpsWindows = 0;
        highFpsWindows = 0;
        qualityChangeCooldownUntil = time + 15000;
      }
      const e = engineRef.current;
      if (!e) return;
      if (arcadeActiveRef.current) {
        // Freeze gameplay/simulation time completely while arcade game is active.
        lastTime = time;
        fpsWindowStart = time;
        fpsFrames = 0;
        return;
      }
      if (pauseRef.current) {
        if (!multiplayerRef.current.state.isInRoom) {
          // Freeze gameplay/simulation time completely while paused in single player. Keep requestAnimationFrame
          // alive for the React menu/debug UI, but reset frame/FPS windows so unpausing
          // cannot produce one giant catch-up delta or falsely trigger performance mode.
          lastTime = time;
          fpsWindowStart = time;
          fpsFrames = 0;
          publishDeveloperDebug(time, frameMs, true);
          return;
        }
        // In multiplayer: do not freeze the simulation! World, physics, traffic, other players,
        // and rendering continue, while local player controls remain paused.
      }
      lastActiveFrameMs = frameMs;
      // GTA-style knockout sequence runs the world in brief slow motion while the
      // death/hospital timers themselves continue in real time.
      const dt = rawDt * (e.deathSequenceActive ? 0.30 : 1);

      e.attackTimer = Math.max(0, e.attackTimer - dt);
      e.specialTimer = Math.max(0, e.specialTimer - dt);
      // Use the same authoritative spatial anchor as district/detail culling. In a
      // crash aftermath this follows the wreck rather than the hidden player checkpoint.
      const earlyActivePos = getActivePosition();

      // Continue abandoned-vehicle momentum independently of player control. Reuse
      // the exact CarPhysics body that was active before exit so wall collision,
      // gravity and handling dimensions stay identical; engine audio is suppressed
      // because the player is no longer sitting in the car.
      for (let i = e.coastingVehicles.length - 1; i >= 0; i--) {
        const coast = e.coastingVehicles[i];
        if (coast.vehicle === e.activeVehicle || coast.vehicle.inUse) {
          coast.vehicle.mesh.userData.unoccupiedCoasting = false;
          e.coastingVehicles.splice(i, 1);
          continue;
        }
        coast.timer = Math.max(0, coast.timer - dt);
        coast.physics.update(dt, coastCarInputs, e.collisionSystem, undefined, false);
        coast.vehicle.mesh.position.copy(coast.physics.position);
        coast.vehicle.mesh.rotation.y = coast.physics.yaw;
        coast.vehicle.speed = coast.physics.speed;
        coast.vehicle.yaw = coast.physics.yaw;
        coast.vehicle.position.x = coast.physics.position.x;
        coast.vehicle.position.y = coast.physics.position.y;
        coast.vehicle.position.z = coast.physics.position.z;
        if (coast.physics.lastCollisionImpact > 0) {
          applyVehicleDamage(
            coast.vehicle,
            THREE.MathUtils.clamp((coast.physics.lastCollisionImpact - 4) * 0.28, 1.5, 16),
            coast.physics.position
          );
        }
        if (coast.timer <= 0 || Math.abs(coast.physics.speed) < 0.32 || coast.vehicle.wrecked) {
          coast.physics.speed = 0;
          coast.vehicle.speed = 0;
          coast.vehicle.mesh.userData.unoccupiedCoasting = false;
          e.coastingVehicles.splice(i, 1);
          if (coast.resumeHybridAfter && !coast.vehicle.wrecked) e.trafficManager.resumeNpcVehicleHybrid(coast.vehicle);
        }
      }

      updateVehicleCollisionRecovery(dt);

      // Runtime exit-door panels are render-only and usually hidden; this branch is
      // effectively free unless a door is in its sub-second open/close animation.
      for (const vehicle of e.vehicles) {
        if (Number(vehicle.mesh.userData.runtimeExitDoorTimer ?? 0) > 0) updateVehicleExitDoorVisual(vehicle, dt);
      }

      riverTickAccumulator += dt;
      // The river texture only needs a modest update cadence. Its material is
      // static otherwise, so do not dirty the texture transform every render frame.
      if (riverWaterSurface && Math.abs(earlyActivePos.x) < 330 && riverTickAccumulator >= 1 / 18) {
        const riverDt = Math.min(0.12, riverTickAccumulator);
        riverTickAccumulator = 0;
        const material = riverWaterSurface.material as THREE.MeshStandardMaterial;
        if (material.map) {
          material.map.offset.x = (material.map.offset.x + riverDt * 0.018) % 1;
          material.map.offset.y = (material.map.offset.y + riverDt * 0.032) % 1;
        }
      } else if (riverTickAccumulator > 0.2) {
        riverTickAccumulator = 0.2;
      }
      // Functioning Pokémon Center fountain: scroll the procedural water texture,
      // keep the basin surface subtly alive, move droplets along the authored
      // parabolic streams, and repeatedly expand/fade impact ripples. The stream
      // geometry itself stays static, so the effect remains inexpensive.
      fountainTickAccumulator += dt;
      const fountainNear = earlyActivePos.distanceToSquared(fountainWorldPosition) < 105 * 105;
      if (fountainNear && fountainTickAccumulator >= 1 / 30) {
        const fountainDt = Math.min(0.08, fountainTickAccumulator);
        fountainTickAccumulator = 0;
        const fountainTime = time * 0.001;
        if (fountainWaterTexture) {
          fountainWaterTexture.offset.x = (fountainWaterTexture.offset.x + fountainDt * 0.026) % 1;
          fountainWaterTexture.offset.y = (fountainWaterTexture.offset.y + fountainDt * 0.041) % 1;
          fountainWaterTexture.rotation = Math.sin(fountainTime * 0.18) * 0.025;
          fountainWaterTexture.center.set(0.5, 0.5);
        }
        for (let i = 0; i < fountainWaterSurfaces.length; i++) {
          const surface = fountainWaterSurfaces[i];
          const baseY = Number(surface.userData.fountainBaseY ?? surface.position.y);
          surface.position.y = baseY + Math.sin(fountainTime * (1.35 + i * 0.17) + i * 1.6) * 0.012;
        }
        for (const drop of fountainDroplets) {
          const curve = drop.userData.fountainJetCurve as THREE.Curve<THREE.Vector3> | undefined;
          if (!curve) continue;
          const phase = Number(drop.userData.fountainDropPhase ?? 0);
          const speed = Number(drop.userData.fountainDropSpeed ?? 0.55);
          const progress = (fountainTime * speed + phase) % 1;
          curve.getPoint(progress, drop.position);
          const stretch = 0.75 + Math.sin(progress * Math.PI) * 0.55;
          drop.scale.set(0.82, stretch, 0.82);
        }
        for (const ripple of fountainRipples) {
          const phaseOffset = Number(ripple.userData.fountainRipplePhase ?? 0);
          const phase = (fountainTime * 0.72 + phaseOffset) % 1;
          const scale = 0.65 + phase * 3.0;
          ripple.scale.setScalar(scale);
          const material = ripple.material as THREE.MeshBasicMaterial;
          material.opacity = (1 - phase) * 0.42;
        }
        if (fountainCentralJet) {
          fountainCentralJet.scale.y = 0.97 + Math.sin(fountainTime * 3.2) * 0.035;
        }
        if (fountainJetCrest) {
          fountainJetCrest.position.y = 5.30 + Math.sin(fountainTime * 3.2) * 0.055;
          fountainJetCrest.scale.x = fountainJetCrest.scale.z = 1.12 + Math.sin(fountainTime * 4.1) * 0.10;
        }
        if (fountainStreams.length) {
          const streamMaterial = fountainStreams[0].material as THREE.MeshPhysicalMaterial;
          streamMaterial.opacity = 0.56 + Math.sin(fountainTime * 2.1) * 0.035;
        }
      } else if (!fountainNear) {
        fountainTickAccumulator = Math.min(fountainTickAccumulator, 0.25);
      }

      // Subtle starter targeting pulse. Only the ring toggled by the interaction
      // resolver is animated, so this costs almost nothing and never covers gameplay.
      for (const starter of goldenrod.oakLab.starters) {
        if (!starter.highlight.visible) continue;
        const pulse = 1 + Math.sin(time * 0.006) * 0.06;
        starter.highlight.scale.setScalar(pulse);
        starter.highlight.rotation.z += dt * 0.75;
        const material = starter.highlight.material as THREE.MeshBasicMaterial;
        material.opacity = 0.42 + Math.sin(time * 0.008) * 0.14;
      }
      e.specialCooldown = Math.max(0, e.specialCooldown - dt);
      e.specialDamageCooldown = Math.max(0, e.specialDamageCooldown - dt);
      e.specialCrimeCooldown = Math.max(0, e.specialCrimeCooldown - dt);

      // Special-character scripted sequences update at render cadence so throws,
      // approaches and shoulder animation remain smooth even when world AI ticks
      // are intentionally reduced for performance.
      updateAshHostileEncounter(dt);
      updateMilesShoulderInteraction(dt);

      for (const door of e.doors) {
        if (door.automatic) {
          // Shared airport-style pedestrian-door sensing. Only doors near the active
          // gameplay area perform entity queries; distant doors simply sleep closed.
          // This avoids an O(doors × NPCs) whole-world scan every render frame.
          const doorActivationDistance = 82;
          const sensorActive = earlyActivePos.distanceToSquared(door.position) <= doorActivationDistance * doorActivationDistance;
          let occupied = false;
          if (sensorActive) {
            // Player look-ahead scales with actual walking/running speed, while the
            // oriented doorway zone prevents someone beside the wall from opening it.
            if (!e.activeVehicle && !e.activeAircraft && e.playerMesh.visible && !e.deathSequenceActive) {
              const planarPlayerSpeed = Math.hypot(e.playerMovement.velocity.x, e.playerMovement.velocity.z);
              occupied = door.isWithinAutomaticSensor(earlyActivePos, planarPlayerSpeed);
            }
            if (!occupied && !door.automaticLocked) {
              const npcSearchRadius = door.automaticSensorRadius + 3.0;
              occupied = e.npcManager.getNPCsInRadius(door.position, npcSearchRadius)
                .some((npc) => npc.state !== 'knocked_out' && npc.mesh.visible && door.isWithinAutomaticSensor(npc.mesh.position, 1.8));
            }
          }
          door.updateAutomaticSensor(occupied, dt);
        }
        const beforeProgress = door.currentProgress;
        door.update(dt);
        if (door.type === 'double_slide' && Math.abs(door.currentProgress - beforeProgress) > 0.00001) {
          e.collisionSystem.syncSlidingDoorPanels(door);
        }
      }

      // Pooled baggage + conveyor animation. Luggage, moving slats and physical
      // player support all use the same path direction/speed, so visual clockwise/
      // counter-clockwise motion can never disagree with conveyor physics.
      airportBaggageAccumulator += dt;
      const baggageNear = earlyActivePos.distanceToSquared(airport.terminalCenter) <= 105 * 105;
      if (baggageNear && airportBaggageAccumulator >= 1 / 30) {
        const baggageDt = Math.min(0.10, airportBaggageAccumulator);
        airportBaggageAccumulator = 0;
        const carousel = airport.baggageCarousel;
        carousel.group.getWorldQuaternion(airportBaggageGroupQuaternion);

        for (const item of airport.baggageItems) {
          item.progress = (item.progress + item.speed * baggageDt) % 1;
          // A suitcase can be nudged sideways by a player on the belt, then softly
          // returns toward its normal lane rather than phasing through them or being
          // launched across the terminal.
          item.lateralVelocity *= Math.pow(0.18, baggageDt * 2.4);
          item.lateralOffset += item.lateralVelocity * baggageDt;
          item.lateralOffset = THREE.MathUtils.clamp(item.lateralOffset, -1.20, 1.20);
          item.lateralOffset = THREE.MathUtils.damp(item.lateralOffset, 0, 1.55, baggageDt);

          item.path.getPoint(item.progress, airportBaggagePoint);
          item.path.getTangent(item.progress, airportBaggageTangent).setY(0).normalize();
          airportBaggageNormal.set(airportBaggageTangent.z, 0, -airportBaggageTangent.x).normalize();
          item.mesh.position.set(
            airportBaggagePoint.x + airportBaggageNormal.x * item.lateralOffset,
            item.rideHeight,
            airportBaggagePoint.z + airportBaggageNormal.z * item.lateralOffset,
          );
          item.mesh.rotation.y = Math.atan2(airportBaggageTangent.x, airportBaggageTangent.z);

          // Lightweight luggage/player contact only while both occupy the belt deck.
          // The player receives a bounded nudge; the suitcase yields sideways too.
          if (!e.activeVehicle && !e.activeAircraft && !e.deathSequenceActive && e.playerMesh.visible) {
            item.mesh.getWorldPosition(airportBaggageWorldPoint);
            const dy = Math.abs(e.playerMovement.position.y - airportBaggageWorldPoint.y);
            airportBaggagePush.copy(e.playerMovement.position).sub(airportBaggageWorldPoint).setY(0);
            const d2 = airportBaggagePush.lengthSq();
            if (dy < 1.25 && d2 < 0.78 * 0.78) {
              if (d2 < 0.0001) airportBaggagePush.set(1, 0, 0);
              airportBaggagePush.normalize();
              const overlap = 0.78 - Math.sqrt(Math.max(0.0001, d2));
              airportBaggagePlayerCandidate.copy(e.playerMovement.position).addScaledVector(
                airportBaggagePush,
                THREE.MathUtils.clamp(overlap * 0.18, 0.012, 0.055),
              );
              e.collisionSystem.resolvePlayerCollision(airportBaggagePlayerCandidate, 0.56, e.playerMovement.position);
              e.playerMovement.position.copy(airportBaggagePlayerCandidate);

              airportBaggageWorldNormal.copy(airportBaggageNormal).applyQuaternion(airportBaggageGroupQuaternion).setY(0).normalize();
              const bagAwaySide = -airportBaggagePush.dot(airportBaggageWorldNormal);
              item.lateralVelocity += THREE.MathUtils.clamp(bagAwaySide * 0.72, -0.72, 0.72);
            }
          }
        }

        // Animate one instanced family of belt slats with the exact conveyor speed.
        for (let i = 0; i < carousel.markerProgress.length; i++) {
          const progress = (carousel.markerProgress[i] + carousel.progressPerSecond * baggageDt) % 1;
          carousel.markerProgress[i] = progress;
          carousel.path.getPoint(progress, airportBaggagePoint);
          carousel.path.getTangent(progress, airportBaggageTangent).setY(0).normalize();
          airportBeltMarkerQuaternion.setFromAxisAngle(
            airportBeltYAxis,
            Math.atan2(airportBaggageTangent.x, airportBaggageTangent.z),
          );
          airportBeltMarkerPosition.set(airportBaggagePoint.x, 0.846, airportBaggagePoint.z);
          airportBeltMarkerMatrix.compose(
            airportBeltMarkerPosition,
            airportBeltMarkerQuaternion,
            airportBeltMarkerScale,
          );
          carousel.markerMesh.setMatrixAt(i, airportBeltMarkerMatrix);
        }
        carousel.markerMesh.instanceMatrix.needsUpdate = true;
      } else if (!baggageNear) {
        airportBaggageAccumulator = Math.min(airportBaggageAccumulator, 0.20);
      }

      // Iconic Springfield clouds drift slowly across the sky. Pure transform work,
      // no lights/physics, so it is effectively free compared with extra NPC AI.
      cloudTickAccumulator += dt;
      if (cloudTickAccumulator >= 0.12) {
        const cloudDt = Math.min(0.20, cloudTickAccumulator);
        cloudTickAccumulator = 0;
        const updateInstancedClouds = (
          group: THREE.Group,
          meshName: string,
          wrapMin: number,
          wrapMax: number,
          speedMultiplier: number
        ) => {
          const instances = group.getObjectByName(meshName) as THREE.InstancedMesh | undefined;
          const seeds = group.userData.cloudSeeds as Array<{
            x: number; y: number; z: number; speed: number;
            scale?: number; width?: number; depth?: number; rotation?: number; variant?: number;
          }> | undefined;
          const puffVariants = group.userData.cloudPuffVariants as Array<Array<[number, number, number, number, number]>> | undefined;
          if (!instances || !seeds || !puffVariants?.length) return;
          const dummy = tempCloudDummy;
          let index = 0;
          for (const seed of seeds) {
            seed.x += (seed.speed ?? 0.14) * cloudDt * speedMultiplier;
            if (seed.x > wrapMax) seed.x = wrapMin;
            const cloudScale = seed.scale ?? 1;
            const cloudWidth = seed.width ?? 1;
            const cloudDepth = seed.depth ?? 1;
            const rotation = seed.rotation ?? 0;
            const cosR = Math.cos(rotation);
            const sinR = Math.sin(rotation);
            const puffs = puffVariants[(seed.variant ?? 0) % puffVariants.length];
            for (const [px, py, pz, ps] of puffs) {
              const rx = px * cosR + pz * sinR;
              const rz = -px * sinR + pz * cosR;
              dummy.position.set(
                seed.x + rx * cloudScale * cloudWidth,
                seed.y + py * cloudScale,
                seed.z + rz * cloudScale * cloudDepth
              );
              dummy.rotation.set(0, rotation, 0);
              if (meshName === 'world_cloud_instances') {
                dummy.scale.set(
                  ps * 1.72 * cloudScale * cloudWidth,
                  ps * 0.74 * cloudScale,
                  ps * 0.94 * cloudScale * cloudDepth
                );
              } else {
                dummy.scale.set(
                  ps * 1.60 * cloudScale * cloudWidth,
                  ps * 0.72 * cloudScale,
                  ps * 0.90 * cloudScale * cloudDepth
                );
              }
              dummy.updateMatrix();
              instances.setMatrixAt(index++, dummy.matrix);
            }
          }
          instances.instanceMatrix.needsUpdate = true;
        };
        updateInstancedClouds(springfield.cloudsGroup, 'springfield_cloud_instances', -430, 430, 0.92);
        updateInstancedClouds(worldClouds, 'world_cloud_instances', -650, 650, 0.88);
      }

      // Follow the active player/vehicle with the focused sunlight shadow volume.
      // Keep shadow refresh comfortably above the visibly-stepped range while still
      // preserving the existing static-caster radius/culling optimisations. The old
      // performance cadence (0.24s ~= 4 FPS) made dynamic shadows visibly trail the
      // player, cars and aircraft even when the actual game was running smoothly.
      const shadowFocus = e.activeAircraft?.position ?? e.activeCarPhysics?.position ?? e.playerMovement.position;
      shadowUpdateAccumulator += dt;
      const shadowInterval = qualityTier === 'high' ? 1 / 60 : qualityTier === 'balanced' ? 1 / 45 : 1 / 30;
      const shadowMovedSq = Number.isFinite(lastShadowFocus.x)
        ? (shadowFocus.x - lastShadowFocus.x) ** 2 + (shadowFocus.z - lastShadowFocus.z) ** 2
        : Number.POSITIVE_INFINITY;
      if (shadowUpdateAccumulator >= shadowInterval || shadowMovedSq > 8 * 8) {
        shadowUpdateAccumulator = 0;
        sunTarget.position.set(shadowFocus.x, 0, shadowFocus.z);
        sun.position.set(shadowFocus.x + 88, 150, shadowFocus.z + 72);
        lastShadowFocus.set(shadowFocus.x, 0, shadowFocus.z);
        if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
      }
      if (simpsonsTvScreen instanceof THREE.Mesh && simpsonsTvScreen.material instanceof THREE.MeshBasicMaterial) {
        const phase = Math.floor(time * 0.0025) % 3;
        simpsonsTvScreen.material.color.setHex(phase === 0 ? 0x66c7ff : phase === 1 ? 0xffd95a : 0x8ee58b);
      }

      springfield.jail.cellDoor.mesh.rotation.y = THREE.MathUtils.damp(
        springfield.jail.cellDoor.mesh.rotation.y,
        e.cellDoorTargetRotation,
        9,
        dt
      );

      e.switchAnimator.update(dt);
      goldenrod.trainService.update(dt);
      goldenrod.twinTowerService.update(dt);
      for (const towerKey of ['west', 'east'] as const) {
        const lift = goldenrod.twinTowerService.elevators[towerKey];
        const liftState = lift.getState();
        // The cabin is stationary almost all of the time. Rebuilding its four live
        // wall proxies every render frame made replaceCollider repeatedly scan the
        // ~1,800-collider registry even while the player was standing still on the
        // other side of the map. Sync only while the lift moves (or after an actual
        // height change/initialisation), while door enablement below still updates
        // independently from the current door state.
        if (liftState.moving || !Number.isFinite(Number(lift.cabin.userData.collisionProxyWorldY))) {
          lift.cabin.updateWorldMatrix(true, false);
          const cabinWorld = new THREE.Vector3();
          lift.cabin.getWorldPosition(cabinWorld);
          const lastProxyY = Number(lift.cabin.userData.collisionProxyWorldY);
          if (!Number.isFinite(lastProxyY) || Math.abs(cabinWorld.y - lastProxyY) > 0.001) {
            e.collisionSystem.replaceCollider({
              id: `liberty_tower_${towerKey}_cabin_left`,
              minX: cabinWorld.x - 2.17, maxX: cabinWorld.x - 1.99,
              minZ: cabinWorld.z - 2.10, maxZ: cabinWorld.z + 2.10,
              minY: cabinWorld.y, maxY: cabinWorld.y + 3.62,
            });
            e.collisionSystem.replaceCollider({
              id: `liberty_tower_${towerKey}_cabin_right`,
              minX: cabinWorld.x + 1.99, maxX: cabinWorld.x + 2.17,
              minZ: cabinWorld.z - 2.10, maxZ: cabinWorld.z + 2.10,
              minY: cabinWorld.y, maxY: cabinWorld.y + 3.62,
            });
            e.collisionSystem.replaceCollider({
              id: `liberty_tower_${towerKey}_cabin_back`,
              minX: cabinWorld.x - 2.17, maxX: cabinWorld.x + 2.17,
              minZ: cabinWorld.z - 2.12, maxZ: cabinWorld.z - 1.94,
              minY: cabinWorld.y, maxY: cabinWorld.y + 3.62,
            });
            e.collisionSystem.replaceCollider({
              id: `liberty_tower_${towerKey}_cabin_front`,
              minX: cabinWorld.x - 2.02, maxX: cabinWorld.x + 2.02,
              minZ: cabinWorld.z + 1.97, maxZ: cabinWorld.z + 2.11,
              minY: cabinWorld.y, maxY: cabinWorld.y + 3.35,
            });
            lift.cabin.userData.collisionProxyWorldY = cabinWorld.y;
          }
        }
      }
      const eastLiftState = goldenrod.trainService.elevator.getState();
      e.collisionSystem.setColliderEnabled(
        'goldenrod_train_lift_ground_door',
        !(eastLiftState.level === 'ground' && eastLiftState.doorsOpen && !eastLiftState.moving)
      );
      e.collisionSystem.setColliderEnabled(
        'goldenrod_train_lift_platform_door',
        !(eastLiftState.level === 'platform' && eastLiftState.doorsOpen && !eastLiftState.moving)
      );
      // The opposite landing side is deliberately locked at each level. This
      // prevents walking through the visibly closed half of the through-lift.
      e.collisionSystem.setColliderEnabled('goldenrod_train_lift_ground_opposite_door', true);
      e.collisionSystem.setColliderEnabled('goldenrod_train_lift_platform_opposite_door', true);
      const westLiftState = goldenrod.trainService.springfieldElevator.getState();
      e.collisionSystem.setColliderEnabled(
        'springfield_train_lift_ground_door',
        !(westLiftState.level === 'ground' && westLiftState.doorsOpen && !westLiftState.moving)
      );
      e.collisionSystem.setColliderEnabled(
        'springfield_train_lift_platform_door',
        !(westLiftState.level === 'platform' && westLiftState.doorsOpen && !westLiftState.moving)
      );
      for (const towerKey of ['west', 'east'] as const) {
        const towerLiftState = goldenrod.twinTowerService.elevators[towerKey].getState();
        e.collisionSystem.setColliderEnabled(
          `liberty_tower_${towerKey}_lift_ground_door`,
          !(towerLiftState.level === 'ground' && towerLiftState.doorsOpen && !towerLiftState.moving)
        );
        e.collisionSystem.setColliderEnabled(
          `liberty_tower_${towerKey}_lift_roof_door`,
          !(towerLiftState.level === 'roof' && towerLiftState.doorsOpen && !towerLiftState.moving)
        );
        e.collisionSystem.setColliderEnabled(
          `liberty_tower_${towerKey}_cabin_front`,
          !towerLiftState.doorsOpen || towerLiftState.moving
        );
      }

      // -------------------------------------------------------------------
      // DEATH CINEMATIC -> GOLDENROD HOSPITAL RECOVERY
      // -------------------------------------------------------------------
      if (e.deathSequenceActive) {
        e.deathSequenceTimer += rawDt;
        const aircraftAftermathActive = !!e.aircraftDeathAftermath;

        // Normal deaths retain the existing collapse. Aircraft-building deaths hide
        // the detached character and spend their cinematic budget on the crash site.
        e.playerMovement.velocity.set(0, 0, 0);
        if (aircraftAftermathActive) {
          e.playerMesh.visible = false;
        } else {
          e.playerMesh.rotation.x = THREE.MathUtils.damp(e.playerMesh.rotation.x, -1.12, 4.8, rawDt);
          e.playerMesh.rotation.z = THREE.MathUtils.damp(e.playerMesh.rotation.z, 0.34, 4.2, rawDt);
        }

        // Aircraft aftermath: ~4.8 s unobstructed crash viewing, ~1.2 s with the
        // existing WASTED treatment, then a one-second fade. Normal deaths keep their
        // original 2.05 s / 3.0 s timing exactly.
        if (aircraftAftermathActive && e.deathSequenceTimer >= 4.8 && e.deathSequenceStage === 'aftermath') {
          e.deathSequenceStage = 'death';
          setDeathPresentation('death');
        }
        const fadeAt = aircraftAftermathActive ? 6.0 : 2.05;
        const hospitalAt = aircraftAftermathActive ? 7.0 : 3.0;
        if (e.deathSequenceTimer >= fadeAt && e.deathSequenceStage === 'death') {
          e.deathSequenceStage = 'fade';
          setDeathPresentation('fade');
        }

        if (e.deathSequenceTimer >= hospitalAt) {
          e.deathSequenceActive = false;
          e.deathSequenceStage = 'hospital';
          e.hospitalRecoveryActive = true;
          e.hospitalRecoveryTimer = 0;
          e.hospitalRecoveryLastHp = 0;
          e.aircraftDeathAftermath = null;

          const bed = goldenrod.pokemonCenter.bedPos.clone();
          bed.y += 0.30;
          e.playerMovement.position.copy(bed);
          e.playerMovement.velocity.set(0, 0, 0);
          e.playerMovement.isGrounded = true;
          e.playerMovement.yaw = Math.PI / 2;
          e.playerMesh.position.copy(bed);
          e.playerMesh.rotation.set(0, Math.PI / 2, -Math.PI / 2);
          e.playerMesh.visible = true;
          hpRef.current = 0;
          setPokemonHp(0);
          setDeathPresentation('hospital');
        }
      } else if (e.hospitalRecoveryActive) {
        e.hospitalRecoveryTimer += rawDt;
        e.playerMovement.velocity.set(0, 0, 0);
        e.playerMovement.isGrounded = true;

        // Heal visibly over a few seconds rather than instantly setting HP to 100.
        const healProgress = THREE.MathUtils.clamp(e.hospitalRecoveryTimer / 2.8, 0, 1);
        const healedHp = Math.round(healProgress * 100);
        if (healedHp !== e.hospitalRecoveryLastHp) {
          e.hospitalRecoveryLastHp = healedHp;
          hpRef.current = healedHp;
          setPokemonHp(healedHp);
        }

        // During the final second the Pokémon visibly sits/stands back up.
        if (e.hospitalRecoveryTimer > 2.15) {
          const rise = THREE.MathUtils.clamp((e.hospitalRecoveryTimer - 2.15) / 0.85, 0, 1);
          e.playerMesh.rotation.z = THREE.MathUtils.lerp(-Math.PI / 2, 0, rise);
          e.playerMesh.rotation.y = THREE.MathUtils.lerp(Math.PI / 2, 0, rise);
        }

        if (e.hospitalRecoveryTimer >= 3.05) {
          const recovery = goldenrod.pokemonCenter.recoveryPos.clone();
          recovery.y = e.collisionSystem.getGroundHeightNear(recovery.x, recovery.z, recovery.y, recovery.y, 1.2, 3.0);
          const safeRecovery =
            e.collisionSystem.findSafePositionOnLevel(recovery, 0.72, 2.0, 4.5, 1.4) ??
            recovery;
          e.playerMovement.position.copy(safeRecovery);
          e.playerMovement.velocity.set(0, 0, 0);
          e.playerMovement.isGrounded = true;

          // Align the regular third-person camera to the hospital shot before
          // releasing control. The normal camera then continues from the same side
          // of the player instead of snapping 180 degrees on the first live frame.
          const releaseOffset = camera.position.clone().sub(safeRecovery);
          const horizontalRelease = Math.max(0.1, Math.hypot(releaseOffset.x, releaseOffset.z));
          e.cameraAngle = Math.atan2(-releaseOffset.x, -releaseOffset.z);
          e.cameraPitch = THREE.MathUtils.clamp(Math.atan2(releaseOffset.y - 1.0, horizontalRelease), -0.05, 0.92);
          e.cameraDistance = THREE.MathUtils.clamp(Math.hypot(horizontalRelease, releaseOffset.y - 1.0), 3.0, 9.0);
          e.cameraTargetDistance = e.cameraDistance;
          e.playerMovement.yaw = 0;
          e.playerMesh.position.copy(safeRecovery);
          e.playerMesh.rotation.set(0, 0, 0);
          e.hospitalRecoveryActive = false;
          e.deathSequenceStage = 'none';
          e.aircraftDeathAftermath = null;
          e.playerInvulnerableUntil = performance.now() * 0.001 + 2.0;
          recordSafeCheckpoint(e, safeRecovery, 0);
          hpRef.current = 100;
          setPokemonHp(100);
          setDeathPresentation('none');
          playSoundEffect('fanfare');
        }
      }

      if (e.healingActive) {
        e.healingTimer = Math.max(0, e.healingTimer - dt);
        if (e.healingBall) {
          e.healingBall.rotation.y += dt * 3.8;
          e.healingBall.rotation.z = Math.sin(time * 0.006) * 0.12;
          e.healingBall.position.y = goldenrod.pokemonCenter.bedPos.y + Math.sin(time * 0.007) * 0.08;
        }

        if (e.healingTimer <= 0) {
          if (e.healingBall) {
            scene.remove(e.healingBall);
            disposeTransientObject3D(e.healingBall);
          }
          e.healingBall = null;
          e.healingActive = false;
          hpRef.current = 100;
          setPokemonHp(100);

          const recovery = goldenrod.pokemonCenter.recoveryPos.clone();
          recovery.y = e.collisionSystem.getGroundHeightNear(recovery.x, recovery.z, recovery.y, recovery.y, 1.0, 3.0);
          e.playerMovement.position.copy(recovery);
          e.playerMovement.velocity.set(0, 0, 0);
          e.playerMesh.position.copy(recovery);
          e.playerMesh.visible = true;
          particles.emitRecallSpark(recovery.clone().add(new THREE.Vector3(0, 1, 0)), 0x80deea);
          playSoundEffect('fanfare');
          setInteractionPrompt(null);
          showTemporaryNotification(
            'Pokémon Center',
            `${pokemonName(e.currentPokemonId)} is fully healed!`
          );
        }
      }

      framePreControlMs = performance.now() - framePhaseStarted;
      framePhaseStarted = performance.now();

      const movementLocked =
        pauseRef.current ||
        e.switchAnimator.active ||
        e.healingActive ||
        e.vehicleEntryActive ||
        !!e.activeAircraft ||
        !!e.parachuteController ||
        e.elevatorRideActive ||
        e.deathSequenceActive ||
        e.hospitalRecoveryActive ||
        e.milesInteractionActive ||
        e.toothlessMounting ||
        e.toothlessMounted ||
        e.seated ||
        e.vehicleExitTumbleTimer > 0 ||
        !!starterSelectionCandidateRef.current ||
        bustedRef.current;
      // Playable Charizard takeoff flow:
      // Jump from ground, then press Jump again in air (or tap JUMP/FLY on mobile) to spread wings and engage flight!
      const charizardSpaceHeld = !!keys['Space'];
      const charizardSpacePressed = charizardSpaceHeld && !e.charizardSpaceWasHeld;
      e.charizardSpaceWasHeld = charizardSpaceHeld;
      const analog = analogInputStateRef.current;
      if (
        e.currentPokemonId === 'charizard' &&
        !e.charizardFlightActive &&
        !movementLocked &&
        charizardSpacePressed &&
        (!e.playerMovement.isGrounded || e.playerMovement.jumpsUsed >= 1) &&
        !e.playerMovement.isStomping
      ) {
        // Do not teleport upward. Flight inherits current momentum and engages fluidly.
        const current = e.playerMovement.position.clone();
        const clearanceProbe = current.clone().add(new THREE.Vector3(0, 0.28, 0));
        if (e.collisionSystem.canFlyOccupy(clearanceProbe, 0.82, 2.72)) {
          e.charizardFlightActive = true;
          const currentPlanarSpeed = Math.hypot(e.playerMovement.velocity.x, e.playerMovement.velocity.z);
          const hasForwardInput = !!keys['KeyW'] || !!keys['ArrowUp'] || (analog.active && -analog.y > 0.2);
          e.charizardFlightSpeed = hasForwardInput ? Math.max(16.0, currentPlanarSpeed) : Math.max(4.0, currentPlanarSpeed);
          e.charizardVerticalSpeed = Math.max(2.5, e.playerMovement.velocity.y);
          e.playerMovement.velocity.y = e.charizardVerticalSpeed;
          e.playerMovement.isGrounded = false;
          e.playerMovement.isStomping = false;
          e.playerMesh.userData.charizardFlying = true;
          e.playerMesh.userData.charizardJumpPreparing = false;
          playSoundEffect('doubleJump');
          showTemporaryNotification('Charizard', 'Flight engaged: Joystick / W/S to fly • Space climb • Shift descend');
        } else {
          const now = performance.now() * 0.001;
          if (now >= Number(e.playerMesh.userData.takeoffBlockedUntil ?? 0)) {
            e.playerMesh.userData.takeoffBlockedUntil = now + 1.0;
            showTemporaryNotification('Charizard', 'Not enough clearance to spread your wings here.');
          }
        }
      }

      const pInputs: PlayerInputs = {
        forward: !movementLocked && (!!keys['KeyW'] || !!keys['ArrowUp']),
        backward: !movementLocked && (!!keys['KeyS'] || !!keys['ArrowDown']),
        left: !movementLocked && (!!keys['KeyA'] || !!keys['ArrowLeft']),
        right: !movementLocked && (!!keys['KeyD'] || !!keys['ArrowRight']),
        jump: !movementLocked && !e.charizardFlightActive && !!keys['Space'],
        allowAirborneJump: e.currentPokemonId !== 'charizard',
        sprint: !movementLocked && (!!keys['ShiftLeft'] || !!keys['ShiftRight'] || (analog.active && analog.magnitude >= 0.88)),
        // F/Q are handled explicitly so one key press cannot accidentally double-trigger effects.
        kick: false,
        water: false,
        movementScale: (performance.now() * 0.001 < Number(e.playerMesh.userData.powerSlowUntil ?? 0) ? 0.48 : 1) * (e.grabbedNpcId ? 0.78 : 1),
        collisionRadius: e.currentPokemonId === 'charizard' ? 0.82 : 0.65,
        collisionHeight: e.currentPokemonId === 'charizard' ? 2.72 : 1.9,
        analogActive: !movementLocked && analog.active,
        analogX: analog.x,
        analogY: analog.y,
        analogMagnitude: analog.magnitude,
        analogAngle: analog.angle,
      };
      const cInputs: CarInputs = {
        forward: !movementLocked && (!!keys['KeyW'] || !!keys['ArrowUp']),
        backward: !movementLocked && (!!keys['KeyS'] || !!keys['ArrowDown']),
        left: !movementLocked && (!!keys['KeyA'] || !!keys['ArrowLeft']),
        right: !movementLocked && (!!keys['KeyD'] || !!keys['ArrowRight']),
        handbrake: !movementLocked && !!keys['Space'],
        boost: !movementLocked && (!!keys['ShiftLeft'] || !!keys['ShiftRight'] || (analog.active && analog.magnitude >= 0.88)),
        analogActive: !movementLocked && analog.active,
        analogSteer: analog.x,
        analogThrottle: -analog.y,
      };
      const aircraftInputs = {
        throttleUp: !!keys['KeyW'],
        throttleDown: !!keys['KeyS'],
        pitchUp: !!keys['ArrowUp'],
        pitchDown: !!keys['ArrowDown'],
        turnLeft: !!keys['ArrowLeft'],
        turnRight: !!keys['ArrowRight'],
        brake: !!keys['Space'],
      };

      // Aircraft abandoned in mid-air remain physical actors. Their existing momentum
      // carries them forward while engine power slowly decays; the shared stall/gravity
      // model then removes controlled flight and brings them down into terrain/structures.
      for (const [planeId, controller] of e.freeAircraftControllers) {
        const plane = controller.aircraft;
        if (plane.inUse || plane === e.activeAircraft) {
          e.freeAircraftControllers.delete(planeId);
          continue;
        }
        if (!plane.crashed && !plane.onGround) plane.throttle = THREE.MathUtils.damp(plane.throttle, 0, 0.09, dt);
        // The world normally slows during the generic death cinematic, but a crash
        // aftermath specifically needs the wreck to finish its fall/settling motion
        // at readable real-time speed. Only the viewed crash gets this exception.
        const freeAircraftDt = e.aircraftDeathAftermath?.aircraftId === plane.id ? rawDt : dt;
        const freeAircraftPreviousPosition = plane.position.clone();
        const freeResult = controller.update(freeAircraftDt, NEUTRAL_AIRCRAFT_INPUTS, false);
        if (!(freeResult.impact?.surface === 'structure')) {
          resolveAircraftVehicleContacts(plane, freeAircraftPreviousPosition, freeAircraftDt);
        }
        if (freeResult.impact) {
          e.particles.startAircraftCrashEffect(
            plane.mesh,
            freeResult.impact.point,
            freeResult.impact.normal,
            freeResult.impact.severity,
            freeResult.impact.lodged,
          );
          if (freeResult.impact.severity !== 'minor') playSoundEffect('crash', freeResult.impact.point ?? plane.mesh.position);
        }
        if (controller.isCrashCleanupReady()) {
          e.particles.clearAircraftCrashEffects(plane.mesh);
          controller.reset(plane.spawnPosition.clone(), plane.spawnYaw);
          e.freeAircraftControllers.delete(planeId);
        } else if (!plane.crashed && plane.onGround && Math.abs(plane.speed) < 0.12) {
          plane.speed = 0;
          e.freeAircraftControllers.delete(planeId);
        }
      }

      if (e.vehicleEntryActive && e.pendingVehicle) {
        const vehicle = e.pendingVehicle;
        e.vehicleEntryTimer = Math.max(0, e.vehicleEntryTimer - dt);
        const yaw = vehicle.yaw ?? vehicle.rotationY ?? vehicle.mesh.rotation.y;
        const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        vehicle.mesh.updateMatrixWorld(true);
        const entryBounds = new THREE.Box3().setFromObject(vehicle.mesh);
        const entryWidth = entryBounds.getSize(new THREE.Vector3()).x;
        const entrySideOffset = Math.max(1.55, entryWidth * 0.5 + 0.52);
        const approach = vehicle.mesh.position.clone().addScaledVector(side, entrySideOffset);
        approach.y = e.collisionSystem.getGroundHeightNear(approach.x, approach.z, e.playerMovement.position.y, 0.12, 1.1, 3.5);
        const progress = 1 - e.vehicleEntryTimer / Math.max(0.01, e.vehicleEntryDuration);
        e.playerMovement.position.lerp(approach, Math.min(1, dt * 9));
        e.playerMovement.yaw = Math.atan2(vehicle.mesh.position.x - e.playerMovement.position.x, vehicle.mesh.position.z - e.playerMovement.position.z);
        e.playerMesh.position.copy(e.playerMovement.position);
        e.playerMesh.rotation.y = e.playerMovement.yaw;
        e.playerMesh.rotation.z = Math.sin(progress * Math.PI) * 0.12;
        vehicle.mesh.rotation.z = Math.sin(progress * Math.PI) * -0.035;
        if (progress > 0.78) e.playerMesh.visible = false;
        if (e.vehicleEntryTimer <= 0) {
          e.playerMesh.rotation.z = 0;
          finishVehicleEntry(vehicle);
        }
      }

      // Smooth user zoom rather than snapping directly to each wheel notch.
      e.cameraDistance = THREE.MathUtils.damp(e.cameraDistance, e.cameraTargetDistance, 5.5, dt);

      if (e.deathSequenceActive) {
        const t = e.deathSequenceTimer;
        const aftermath = e.aircraftDeathAftermath;
        const aftermathPlane = aftermath
          ? e.airportAircraft.find((plane) => plane.id === aftermath.aircraftId) ?? null
          : null;

        if (aftermath && aftermathPlane) {
          // Keep the camera on the exterior/playable side of the struck facade. The
          // impact normal points out of the building, so it provides a stable reveal
          // direction for both lodged wrecks and aircraft that deflect/fall away.
          const outward = aftermath.impactNormal.clone();
          outward.y = THREE.MathUtils.clamp(outward.y, -0.10, 0.20);
          if (outward.lengthSq() < 0.08) {
            outward.set(-Math.sin(aftermathPlane.yaw), 0, -Math.cos(aftermathPlane.yaw));
          }
          outward.normalize();
          const side = new THREE.Vector3(-outward.z, 0, outward.x).normalize();

          // Follow the wreck's visible/tangential movement without allowing the look
          // target itself to migrate through the wall when a lodged fuselage centre
          // sits partly inside the structure.
          const visibleDelta = aftermathPlane.position.clone().sub(aftermath.impactPoint);
          const inwardAmount = visibleDelta.dot(outward);
          if (inwardAmount < 0) visibleDelta.addScaledVector(outward, -inwardAmount);
          const followWeight = aftermath.lodged ? 0.52 : THREE.MathUtils.clamp(0.58 + t * 0.035, 0.58, 0.80);
          const focus = aftermath.impactPoint.clone().addScaledVector(visibleDelta, followWeight);
          focus.addScaledVector(outward, 1.05);
          focus.y += Math.max(0.8, aftermathPlane.length * 0.022);

          const separation = aftermathPlane.position.distanceTo(aftermath.impactPoint);
          const reveal = THREE.MathUtils.smoothstep(t, 0.25, 3.0);
          const closeDistance = THREE.MathUtils.clamp(aftermathPlane.length * 0.48 + 7.5, 11.5, 21);
          const pullBack = closeDistance + reveal * Math.min(12, 3.5 + separation * 0.30);
          const lateralSweep = Math.sin(THREE.MathUtils.clamp((t - 1.2) / 4.8, 0, 1) * Math.PI * 0.68)
            * Math.min(7.0, pullBack * 0.23);
          const deathCam = focus.clone()
            .addScaledVector(outward, pullBack)
            .addScaledVector(side, lateralSweep);
          deathCam.y += 4.2 + reveal * 2.4 + Math.min(7.0, separation * 0.14);

          const safeDeathCam = e.collisionSystem.resolveCameraPosition(focus, deathCam, 0.38, 0.26);
          camera.position.lerp(safeDeathCam, Math.min(1, rawDt * (t < 1.0 ? 6.5 : 3.4)));
          camera.lookAt(focus);
          const aftermathFov = 66 + reveal * 3.0;
          if (Math.abs(camera.fov - aftermathFov) > 0.03) {
            camera.fov = THREE.MathUtils.damp(camera.fov, aftermathFov, 4.2, rawDt);
            camera.updateProjectionMatrix();
          }
        } else {
          const focus = e.playerMovement.position.clone().add(new THREE.Vector3(0, 0.85, 0));
          const orbit = t * 0.78 + e.playerMovement.yaw;
          const deathCam = focus.clone().add(new THREE.Vector3(
            Math.sin(orbit) * 5.4,
            2.5 + Math.sin(t * 1.2) * 0.18,
            Math.cos(orbit) * 5.4
          ));
          const safeDeathCam = e.collisionSystem.resolveCameraPosition(focus, deathCam, 0.24, 0.18);
          camera.position.lerp(safeDeathCam, Math.min(1, rawDt * 4.8));
          camera.lookAt(focus);
        }
      } else if (e.hospitalRecoveryActive) {
        const bed = goldenrod.pokemonCenter.bedPos;
        tempLookTarget.set(bed.x, bed.y + 0.72, bed.z);

        // The bed sits close to the Pokémon Center's rear/right walls. Instead of
        // trusting one hard-coded camera point, test several inside-room angles
        // against the SAME wall/ceiling collision used by normal gameplay and pick
        // the shot with the most unobstructed distance from the waking player.
        const hospitalCameraCandidates = [
          new THREE.Vector3(bed.x + 4.35, bed.y + 2.55, bed.z + 3.35),
          new THREE.Vector3(bed.x - 3.55, bed.y + 2.45, bed.z + 3.15),
          new THREE.Vector3(bed.x + 3.15, bed.y + 2.75, bed.z - 2.35),
          new THREE.Vector3(bed.x - 3.25, bed.y + 2.65, bed.z - 2.25),
        ];
        let bedsideCamera = e.collisionSystem.resolveCameraPosition(
          tempLookTarget,
          hospitalCameraCandidates[0],
          0.26,
          0.22
        );
        let bestHospitalView = bedsideCamera.distanceTo(tempLookTarget);
        for (let i = 1; i < hospitalCameraCandidates.length; i++) {
          const candidate = e.collisionSystem.resolveCameraPosition(
            tempLookTarget,
            hospitalCameraCandidates[i],
            0.26,
            0.22
          );
          const viewDistance = candidate.distanceTo(tempLookTarget);
          if (viewDistance > bestHospitalView + 0.08) {
            bedsideCamera = candidate;
            bestHospitalView = viewDistance;
          }
        }

        camera.position.lerp(bedsideCamera, Math.min(1, rawDt * 5.8));
        camera.lookAt(tempLookTarget);
      } else if (e.milesInteractionActive) {
        const miles = e.npcManager.getNPCById('cameo_miles');
        e.playerMovement.velocity.set(0, 0, 0);
        e.playerMesh.position.copy(e.playerMovement.position);
        e.playerMesh.rotation.y = e.playerMovement.yaw;
        e.playerMesh.visible = true;

        if (miles) {
          // Frame the interaction as a small two-character cinematic, but bias the
          // composition upward enough that Miles' world-space speech bubble is always
          // in shot. The bubble itself remains parented to Miles, so it follows any
          // small movement automatically.
          const playerPos = e.playerMovement.position;
          const pairDir = miles.mesh.position.clone().sub(playerPos);
          pairDir.y = 0;
          if (pairDir.lengthSq() < 0.0001) pairDir.set(0, 0, 1);
          pairDir.normalize();
          const side = new THREE.Vector3(-pairDir.z, 0, pairDir.x);

          const bodyMid = playerPos.clone().lerp(miles.mesh.position, 0.5);
          const milesHead = miles.mesh.position.clone().add(new THREE.Vector3(0, 2.18, 0));
          const bubbleAnchor = miles.mesh.position.clone().add(new THREE.Vector3(0, 3.25, 0));
          const focus = bodyMid.clone();
          focus.y = 1.48;
          // Pull the look target slightly toward the area between Miles' head and the
          // bubble. This keeps the bubble readable without covering/cropping his face.
          const framingTarget = focus.clone().lerp(milesHead.clone().lerp(bubbleAnchor, 0.42), 0.30);

          const candidates = [
            focus.clone().addScaledVector(side, 4.10).addScaledVector(pairDir, -0.45).add(new THREE.Vector3(0, 1.72, 0)),
            focus.clone().addScaledVector(side, -4.10).addScaledVector(pairDir, -0.45).add(new THREE.Vector3(0, 1.72, 0)),
            focus.clone().addScaledVector(side, 3.55).addScaledVector(pairDir, -1.55).add(new THREE.Vector3(0, 1.95, 0)),
            focus.clone().addScaledVector(side, -3.55).addScaledVector(pairDir, -1.55).add(new THREE.Vector3(0, 1.95, 0)),
          ];

          let safeCamera = e.collisionSystem.resolveCameraPosition(framingTarget, candidates[0], 0.24, 0.18);
          let bestClearance = safeCamera.distanceTo(framingTarget);
          for (let i = 1; i < candidates.length; i++) {
            const resolved = e.collisionSystem.resolveCameraPosition(framingTarget, candidates[i], 0.24, 0.18);
            const clearance = resolved.distanceTo(framingTarget);
            if (clearance > bestClearance + 0.08) {
              safeCamera = resolved;
              bestClearance = clearance;
            }
          }

          camera.position.lerp(safeCamera, Math.min(1, rawDt * 7.0));
          camera.lookAt(framingTarget);
        }
      } else if (e.toothlessMounting || e.toothlessMounted) {
        const toothless = e.npcManager.getNPCById('cameo_toothless');
        if (!toothless || !toothless.mesh.visible) {
          e.toothlessMounting = false;
          e.toothlessMounted = false;
          e.toothlessMountStart = null;
          e.playerMesh.visible = true;
        } else {
          const dragon = toothless.mesh;
          dragon.userData.specialInteractionActive = true;
          dragon.userData.mounted = true;
          toothless.state = 'idle';
          toothless.kickedVelocity?.set(0, 0, 0);
          e.playerMesh.visible = true;

          if (e.toothlessMounting) {
            e.toothlessMountTimer += dt;
            const duration = 0.92;
            const u = THREE.MathUtils.clamp(e.toothlessMountTimer / duration, 0, 1);
            const smoothU = u * u * (3 - 2 * u);
            dragon.updateWorldMatrix(true, false);
            const saddle = dragon.localToWorld(new THREE.Vector3(0, 1.62, -0.10));
            const start = e.toothlessMountStart ?? e.playerMovement.position.clone();
            const ridePos = start.clone().lerp(saddle, smoothU);
            ridePos.y += Math.sin(u * Math.PI) * 0.62;
            e.playerMovement.position.copy(ridePos);
            e.playerMovement.velocity.set(0, 0, 0);
            e.playerMovement.isGrounded = false;
            e.playerMovement.yaw = e.toothlessYaw;
            e.playerMesh.position.copy(ridePos);
            e.playerMesh.rotation.set(-0.10 * smoothU, e.toothlessYaw, 0);

            const focus = dragon.position.clone().add(new THREE.Vector3(0, 1.15, 0));
            const mountCam = focus.clone().add(new THREE.Vector3(
              -Math.sin(e.toothlessYaw) * 7.0,
              3.25,
              -Math.cos(e.toothlessYaw) * 7.0
            ));
            const safeMountCam = e.collisionSystem.resolveCameraPosition(focus, mountCam, 0.28, 0.20);
            camera.position.lerp(safeMountCam, Math.min(1, rawDt * 7.5));
            camera.lookAt(focus);

            if (u >= 1) {
              e.toothlessMounting = false;
              e.toothlessMounted = true;
              e.toothlessMountTimer = 0;
              e.toothlessMountStart = null;
              e.toothlessYaw = dragon.rotation.y;
              showTemporaryNotification('Toothless', 'Ready! W/S controls speed, A/D turns, Space climbs and Shift descends.');
              playSoundEffect('fanfare');
            }
          } else {
            // Arcade dragon flight: intentionally easy to control and kept at a
            // sensible ceiling so the game world remains readable.
            const nowGround = e.collisionSystem.getGroundHeightNear(
              dragon.position.x, dragon.position.z, dragon.position.y, 0.12, 4.0, 120.0
            );
            const altitude = Math.max(0, dragon.position.y - nowGround);
            const forwardHeld = !!keys['KeyW'] || !!keys['ArrowUp'];
            const backHeld = !!keys['KeyS'] || !!keys['ArrowDown'];
            const leftHeld = !!keys['KeyA'] || !!keys['ArrowLeft'];
            const rightHeld = !!keys['KeyD'] || !!keys['ArrowRight'];
            const ascendHeld = !!keys['Space'];
            const descendHeld = !!keys['ShiftLeft'] || !!keys['ShiftRight'];

            const targetSpeed = forwardHeld && !backHeld ? 22.0 : backHeld && !forwardHeld ? -5.0 : 0.0;
            e.toothlessFlightSpeed = THREE.MathUtils.damp(e.toothlessFlightSpeed, targetSpeed, targetSpeed === 0 ? 2.7 : 3.8, dt);
            const turnInput = (leftHeld ? 1 : 0) - (rightHeld ? 1 : 0);
            const turnRate = 1.55 * (0.55 + Math.min(1, Math.abs(e.toothlessFlightSpeed) / 12));
            e.toothlessYaw += turnInput * turnRate * dt;
            while (e.toothlessYaw > Math.PI) e.toothlessYaw -= Math.PI * 2;
            while (e.toothlessYaw < -Math.PI) e.toothlessYaw += Math.PI * 2;

            let targetVertical = 0;
            if (ascendHeld && !descendHeld) targetVertical = 7.5;
            else if (descendHeld && !ascendHeld) targetVertical = -8.0;
            else if (altitude < 0.20 && Math.abs(e.toothlessFlightSpeed) > 6.0) targetVertical = 1.1;
            e.toothlessVerticalSpeed = THREE.MathUtils.damp(e.toothlessVerticalSpeed, targetVertical, 5.0, dt);

            const forward = new THREE.Vector3(Math.sin(e.toothlessYaw), 0, Math.cos(e.toothlessYaw));
            const next = dragon.position.clone().addScaledVector(forward, e.toothlessFlightSpeed * dt);
            next.x = THREE.MathUtils.clamp(next.x, -650, 650);
            next.z = THREE.MathUtils.clamp(next.z, -920, 520);
            const nextGround = e.collisionSystem.getGroundHeightNear(next.x, next.z, dragon.position.y, nowGround, 4.0, 120.0);
            next.y += e.toothlessVerticalSpeed * dt;
            const maxAltitude = nextGround + 72.0;
            next.y = THREE.MathUtils.clamp(next.y, nextGround, maxAltitude);

            // At walking/landing altitude, buildings and props remain solid. Once
            // airborne, vertical clearance lets Toothless pass over scenery rather
            // than hitting an invisible full-height wall.
            // Use the authored vertical bounds at every altitude. This blocks flying
            // through a tall building while still allowing Toothless to clear its roof.
            if (e.collisionSystem.canOccupy(next, 0.95, 1.65)) {
              dragon.position.copy(next);
            } else {
              e.toothlessFlightSpeed *= 0.28;
              e.toothlessVerticalSpeed = Math.max(e.toothlessVerticalSpeed, 2.5);
            }

            const groundAfter = e.collisionSystem.getGroundHeightNear(
              dragon.position.x, dragon.position.z, dragon.position.y, nextGround, 4.0, 120.0
            );
            if (dragon.position.y <= groundAfter + 0.06) {
              dragon.position.y = groundAfter;
              if (e.toothlessVerticalSpeed < 0) e.toothlessVerticalSpeed = 0;
            }

            const newAltitude = Math.max(0, dragon.position.y - groundAfter);
            const airborne = newAltitude > 0.16 || Math.abs(e.toothlessVerticalSpeed) > 0.6;
            dragon.rotation.y = e.toothlessYaw;
            dragon.rotation.x = THREE.MathUtils.damp(
              dragon.rotation.x,
              airborne ? THREE.MathUtils.clamp(-e.toothlessVerticalSpeed * 0.025, -0.18, 0.16) : 0,
              6,
              dt
            );
            dragon.rotation.z = THREE.MathUtils.damp(dragon.rotation.z, -turnInput * (airborne ? 0.18 : 0.06), 7, dt);

            const wingLeft = dragon.getObjectByName('wing_left');
            const wingRight = dragon.getObjectByName('wing_right');
            if (wingLeft && wingRight) {
              const flap = airborne ? Math.sin(time * 0.014) * 0.38 : Math.sin(time * 0.005) * 0.06;
              wingLeft.rotation.z = -0.14 + flap;
              wingRight.rotation.z = 0.14 - flap;
            }

            dragon.updateWorldMatrix(true, false);
            const rider = dragon.localToWorld(new THREE.Vector3(0, 1.61, -0.12));
            e.playerMovement.position.copy(rider);
            e.playerMovement.velocity.set(
              forward.x * e.toothlessFlightSpeed,
              e.toothlessVerticalSpeed,
              forward.z * e.toothlessFlightSpeed
            );
            e.playerMovement.isGrounded = !airborne;
            e.playerMovement.yaw = e.toothlessYaw;
            e.playerMesh.position.copy(rider);
            e.playerMesh.rotation.set(-0.12, e.toothlessYaw, 0);

            const speedRatio = Math.min(1, Math.abs(e.toothlessFlightSpeed) / 22);
            const focus = dragon.position.clone().add(new THREE.Vector3(0, 1.15, 0));
            const cameraDistance = 8.0 + speedRatio * 2.0;
            const desiredCam = focus.clone().add(new THREE.Vector3(
              -Math.sin(e.toothlessYaw) * cameraDistance,
              3.4 + newAltitude * 0.025,
              -Math.cos(e.toothlessYaw) * cameraDistance
            ));
            const safeDragonCam = e.collisionSystem.resolveCameraPosition(focus, desiredCam, 0.30, 0.20);
            camera.position.lerp(safeDragonCam, Math.min(1, rawDt * 6.8));
            camera.lookAt(focus);

            const targetFov = 60 + speedRatio * 8;
            if (Math.abs(targetFov - camera.fov) > 0.05) {
              camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, dt);
              camera.updateProjectionMatrix();
            }
          }
        }
      } else if (e.activeAircraft && e.aircraftController) {
        const plane = e.activeAircraft;
        const aircraftPreviousPosition = plane.position.clone();
        const result = e.aircraftController.update(dt, aircraftInputs, true);
        // Dynamic cars/boats are substantial physical bodies, not kickable props. Use
        // the game's existing swept vehicle solver, but never interfere with a real
        // structure impact handled by AircraftController's established crash system.
        if (!(result.impact?.surface === 'structure')) {
          resolveAircraftVehicleContacts(plane, aircraftPreviousPosition, dt);
        }
        e.playerMovement.position.copy(plane.position);
        e.playerMovement.velocity.set(
          Math.sin(plane.yaw) * plane.speed,
          plane.verticalSpeed,
          Math.cos(plane.yaw) * plane.speed
        );
        e.playerMovement.yaw = plane.yaw;
        e.playerMovement.isGrounded = plane.onGround;
        e.playerMesh.position.copy(plane.position);
        e.playerMesh.visible = false;

        const ground = e.collisionSystem.getGroundHeightNear(plane.position.x, plane.position.z, plane.position.y, 0.12, 12, 260);
        const altitude = Math.max(0, plane.position.y - ground - plane.gearHeight);
        const speedRatio = Math.min(1.2, Math.abs(plane.speed) / Math.max(1, plane.maxSpeed));
        const forward3 = new THREE.Vector3(
          Math.sin(plane.yaw) * Math.cos(plane.pitch),
          Math.sin(plane.pitch),
          Math.cos(plane.yaw) * Math.cos(plane.pitch)
        ).normalize();
        const cameraDistance = Math.max(13, Math.min(30, plane.length * 0.52 + 8)) + speedRatio * 7;
        const cameraHeight = Math.max(5.0, Math.min(11, plane.wingspan * 0.18 + 3.8));
        tempLookTarget.copy(plane.position).addScaledVector(forward3, Math.max(3, plane.length * 0.12));
        tempLookTarget.y += Math.max(1.6, plane.length * 0.035);
        tempCameraTarget.copy(plane.position).addScaledVector(forward3, -cameraDistance);
        tempCameraTarget.y += cameraHeight;
        const safeAirCam = e.collisionSystem.resolveCameraPosition(tempLookTarget, tempCameraTarget, 0.38, 0.25);
        camera.position.lerp(safeAirCam, Math.min(1, rawDt * 5.2));
        camera.lookAt(tempLookTarget);
        const aircraftFov = 62 + speedRatio * 12;
        if (Math.abs(camera.fov - aircraftFov) > 0.03) {
          camera.fov = THREE.MathUtils.damp(camera.fov, aircraftFov, 4.5, dt);
          camera.updateProjectionMatrix();
        }

        soundManager.playEngine(Math.max(2, plane.speed + plane.throttle * plane.maxSpeed * 0.22), plane.maxSpeed, plane.mesh.position);
        if (result.impact) {
          const severityShake = result.impact.severity === 'major' ? 0.92 : result.impact.severity === 'moderate' ? 0.58 : 0.28;
          e.cameraShake = Math.max(e.cameraShake, severityShake);
          e.particles.startAircraftCrashEffect(
            plane.mesh,
            result.impact.point,
            result.impact.normal,
            result.impact.severity,
            result.impact.lodged,
          );
          if (result.impact.severity !== 'minor') playSoundEffect('crash', result.impact.point ?? plane.mesh.position);
        }
        if (result.hardLanding && !result.crashedThisFrame) {
          showTemporaryNotification(plane.name, `Hard landing • ${Math.round(plane.damage)}% damage`);
        }
        if (result.crashedThisFrame) {
          const nonFatalStructuralFailure = !result.pilotFatalThisFrame;
          showTemporaryNotification(
            plane.name,
            result.impact?.lodged
              ? 'AIRCRAFT LODGED IN STRUCTURE!'
              : nonFatalStructuralFailure
                ? 'SEVERE STRUCTURAL DAMAGE — BAIL OUT OR BRACE!'
                : 'AIRCRAFT CRASHED!',
          );
        } else if (result.impact && result.impact.surface === 'structure' && result.impact.severity !== 'minor') {
          const regionLabel = result.impact.region.replace(/_/g, ' ').toUpperCase();
          showTemporaryNotification(plane.name, `${regionLabel} HIT • ${Math.round(plane.damage)}% damage`);
        }

        if (result.pilotFatalThisFrame) {
          const crashAftermath = result.impact
            ? {
                aircraftId: plane.id,
                impactPoint: result.impact.point.clone(),
                impactNormal: result.impact.normal.clone(),
                lodged: result.impact.lodged,
              } satisfies AircraftDeathAftermath
            : null;
          damagePlayer(100, 'an aircraft crash', crashAftermath);
        }

      } else if (e.parachuteController) {
        const parachute = e.parachuteController;
        const parachuteInputs = {
          forward: !!keys['KeyW'] || !!keys['ArrowUp'],
          backward: !!keys['KeyS'] || !!keys['ArrowDown'],
          left: !!keys['KeyA'] || !!keys['ArrowLeft'],
          right: !!keys['KeyD'] || !!keys['ArrowRight'],
        };
        // Match the normal on-foot steering camera behaviour: when A/D turns the
        // parachute/player, carry that same yaw delta into the camera. This keeps
        // any mouse-orbit offset the player chose, while the whole third-person
        // view naturally follows the turn instead of being left behind.
        const parachuteYawBeforeUpdate = parachute.yaw;
        const parachuteResult = parachute.update(dt, parachuteInputs, e.playerMovement, e.collisionSystem);
        let parachuteTurnDelta = parachute.yaw - parachuteYawBeforeUpdate;
        while (parachuteTurnDelta > Math.PI) parachuteTurnDelta -= Math.PI * 2;
        while (parachuteTurnDelta < -Math.PI) parachuteTurnDelta += Math.PI * 2;
        e.cameraAngle += parachuteTurnDelta;
        while (e.cameraAngle > Math.PI) e.cameraAngle -= Math.PI * 2;
        while (e.cameraAngle < -Math.PI) e.cameraAngle += Math.PI * 2;

        e.playerMesh.visible = true;
        e.playerMesh.position.copy(e.playerMovement.position);
        e.playerMesh.rotation.y = parachute.yaw;
        const steerPose = (parachuteInputs.left ? 1 : 0) - (parachuteInputs.right ? 1 : 0);
        e.playerMesh.rotation.x = THREE.MathUtils.damp(
          e.playerMesh.rotation.x,
          parachute.mode === 'freefall' ? -0.46 : -0.08,
          7.5,
          dt,
        );
        e.playerMesh.rotation.z = THREE.MathUtils.damp(
          e.playerMesh.rotation.z,
          parachute.mode === 'freefall' ? -steerPose * 0.18 : -steerPose * 0.08,
          8,
          dt,
        );
        if (e.hasChosenStarter) {
          animatePokemonModel(e.playerMesh, e.currentPokemonId, 'jump', time * 0.001, parachute.mode === 'freefall' ? 1.3 : 0.72);
        }

        const parachuteGround = e.collisionSystem.getGroundHeightNear(
          e.playerMovement.position.x,
          e.playerMovement.position.z,
          e.playerMovement.position.y,
          0.12,
          1.2,
          400,
        );
        const parachuteAltitude = Math.max(0, e.playerMovement.position.y - parachuteGround);
        // Keep parachute steering/yaw independent from camera yaw. Previously this
        // branch forced cameraAngle back to parachute.yaw every frame, which meant
        // mouse dragging technically changed the camera value but it was immediately
        // overwritten and the view felt locked behind the player.
        const cameraDistance = parachute.mode === 'freefall' ? 7.2 : 9.2;
        const cameraPitch = THREE.MathUtils.clamp(e.cameraPitch, -0.55, 1.08);
        const horizontalDistance = Math.cos(cameraPitch) * cameraDistance;
        tempLookTarget.copy(e.playerMovement.position);
        tempLookTarget.y += 1.0;
        tempCameraTarget.set(
          e.playerMovement.position.x - Math.sin(e.cameraAngle) * horizontalDistance,
          tempLookTarget.y + Math.sin(cameraPitch) * cameraDistance,
          e.playerMovement.position.z - Math.cos(e.cameraAngle) * horizontalDistance,
        );
        const safeParachuteCam = e.collisionSystem.resolveCameraPosition(tempLookTarget, tempCameraTarget, 0.30, 0.20);
        camera.position.lerp(safeParachuteCam, Math.min(1, rawDt * (parachute.mode === 'freefall' ? 5.8 : 4.8)));
        camera.lookAt(tempLookTarget);
        const parachuteFov = parachute.mode === 'freefall' ? 68 : 62;
        if (Math.abs(camera.fov - parachuteFov) > 0.03) {
          camera.fov = THREE.MathUtils.damp(camera.fov, parachuteFov, 5, dt);
          camera.updateProjectionMatrix();
        }
        e.worldInteractions.pushLightweightProps(e.playerMovement.position, e.playerMovement.velocity, dt);

        if (parachuteResult.landed) {
          const landingMode = parachute.mode;
          const openAmount = parachute.deployment;
          const impactSpeed = parachuteResult.impactSpeed;
          parachute.destroy();
          e.parachuteController = null;
          setParachuteHud(null);
          e.playerMovement.resetForTeleport(e.playerMovement.position.clone(), parachute.yaw, true);
          e.playerMesh.position.copy(e.playerMovement.position);
          e.playerMesh.rotation.set(0, parachute.yaw, 0);
          keys['Space'] = false;

          const safeImpact = landingMode === 'parachute' && openAmount >= 0.72 ? 9.5 : 7.0;
          if (impactSpeed > safeImpact) {
            const fallDamage = THREE.MathUtils.clamp((impactSpeed - safeImpact) * 4.4, 4, 100);
            damagePlayer(fallDamage, landingMode === 'parachute' ? 'a hard parachute landing' : 'a freefall impact');
            e.cameraShake = Math.max(e.cameraShake, Math.min(0.62, impactSpeed * 0.018));
          }
          if (!e.deathSequenceActive && !e.hospitalRecoveryActive) {
            recordSafeCheckpoint(e, e.playerMovement.position, parachute.yaw);
            showTemporaryNotification(
              landingMode === 'parachute' ? 'Parachute' : 'Freefall',
              landingMode === 'parachute' ? 'Landed safely.' : 'You hit the ground without a fully deployed parachute.',
            );
          }
        }

      } else if (e.activeCarPhysics && e.activeVehicle) {
        activeVehiclePreviousPosition.copy(e.activeCarPhysics.position);
        const disabledUntil = e.activeVehicle.mesh.userData.disabledUntil ?? 0;
        if (disabledUntil > performance.now() * 0.001) {
          e.activeCarPhysics.speed *= Math.pow(0.5, dt * 5);
        } else {
          e.activeCarPhysics.update(dt, cInputs, e.collisionSystem, e.particles);
          if (e.activeCarPhysics.lastCollisionImpact > 0) {
            const impact = e.activeCarPhysics.lastCollisionImpact;
            applyVehicleDamage(e.activeVehicle, THREE.MathUtils.clamp((impact - 4) * 0.34, 2, 22), e.activeCarPhysics.position);
            e.cameraShake = Math.max(e.cameraShake, Math.min(0.62, impact * 0.014));
          }
        }
        e.activeVehicle.mesh.position.copy(e.activeCarPhysics.position);
        e.activeVehicle.mesh.rotation.y = e.activeCarPhysics.yaw;
        e.activeVehicle.speed = e.activeCarPhysics.speed;
        e.activeVehicle.yaw = e.activeCarPhysics.yaw;
        soundManager.playEngine(e.activeCarPhysics.speed, e.activeCarPhysics.maxSpeed, e.activeCarPhysics.position);
        e.playerMovement.position.copy(e.activeCarPhysics.position);
        e.playerMesh.position.copy(e.activeCarPhysics.position);
        e.playerMesh.visible = false;

        const speedRatio = Math.min(1.25, Math.abs(e.activeCarPhysics.speed) / Math.max(1, e.activeCarPhysics.maxSpeed));
        const targetFov = e.activeCarPhysics.isBoosting ? 77 : 60 + speedRatio * 8;
        const nextFov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 5));
        if (Math.abs(nextFov - camera.fov) > 0.02) {
          camera.fov = nextFov;
          camera.updateProjectionMatrix();
        }

        const yaw = e.activeCarPhysics.yaw;
        const cameraProfile = e.activeVehicle.mesh.userData.vehicleCamera as
          | { baseDistance?: number; speedDistance?: number; height?: number; speedHeight?: number; lookHeight?: number }
          | undefined;
        const distance = (cameraProfile?.baseDistance ?? 8.0) + speedRatio * (cameraProfile?.speedDistance ?? 4.2);
        const height = (cameraProfile?.height ?? 3.5) + speedRatio * (cameraProfile?.speedHeight ?? 1.7);
        tempCameraTarget.set(
          e.activeCarPhysics.position.x - Math.sin(yaw) * distance,
          e.activeCarPhysics.position.y + height,
          e.activeCarPhysics.position.z - Math.cos(yaw) * distance
        );
        if (e.activeCarPhysics.isBoosting) {
          tempCameraTarget.x += (Math.random() - 0.5) * 0.08;
          tempCameraTarget.y += (Math.random() - 0.5) * 0.06;
        }
        camera.position.lerp(tempCameraTarget, Math.min(1, dt * 7));
        tempLookTarget.copy(e.activeCarPhysics.position).y += cameraProfile?.lookHeight ?? 1.1;
        camera.lookAt(tempLookTarget);
        updateVehicleImpacts(dt, activeVehiclePreviousPosition);
      } else if (e.elevatorRideActive) {
        const liftKey = e.elevatorRideLift ?? 'goldenrod';
        const lift = getElevatorLift(liftKey);
        const liftState = lift.getState();
        lift.cabin.updateWorldMatrix(true, false);
        const rideWorld = lift.cabin.localToWorld(new THREE.Vector3(0, 0.34, 0.25));
        e.playerMovement.position.copy(rideWorld);
        e.playerMovement.velocity.set(0, 0, 0);
        e.playerMovement.isGrounded = true;
        e.playerMesh.position.copy(rideWorld);
        e.playerMesh.rotation.y = 0;
        e.playerMesh.visible = true;
        const liftCamTarget = rideWorld.clone().add(new THREE.Vector3(0, 2.2, 3.6));
        camera.position.lerp(liftCamTarget, Math.min(1, dt * 8));
        tempLookTarget.copy(rideWorld).y += 1.1;
        camera.lookAt(tempLookTarget);

        if (!liftState.moving && liftState.doorsOpen && e.elevatorRideDestination && liftState.level === e.elevatorRideDestination) {
          const isTowerLift = liftKey === 'tower_west' || liftKey === 'tower_east';
          if (isTowerLift) {
            // Tower lifts release control INSIDE the stopped cabin. The player then
            // physically walks through the now-open doorway onto the lobby/roof,
            // instead of being visibly teleported out as the train lifts do.
            e.playerMovement.position.copy(rideWorld);
            e.playerMovement.velocity.set(0, 0, 0);
            e.playerMovement.isGrounded = true;
            e.playerMesh.position.copy(rideWorld);
          } else {
            const exit = (e.elevatorRideDestination === 'ground' ? lift.groundPos : lift.upperPos).clone();
            exit.y = e.collisionSystem.getGroundHeightNear(exit.x, exit.z, exit.y, exit.y, 1.4, 3.0);
            e.playerMovement.position.copy(exit);
            e.playerMovement.velocity.set(0, 0, 0);
            e.playerMesh.position.copy(exit);
          }
          e.elevatorRideActive = false;
          const arrived = e.elevatorRideDestination;
          e.elevatorRideDestination = null;
          e.elevatorRideLift = null;
          showTemporaryNotification(lift.label, arrived === 'roof' ? 'Rooftop. Doors open — walk out.' : arrived === 'platform' ? 'Platform level. Mind the gap.' : isTowerLift ? 'Lobby level. Doors open — walk out.' : 'Lobby level.');
          playSoundEffect('doorOpen');
        }
      } else if (e.trainRideActive) {
        // Player movement is simulated in train-local coordinates. The final world
        // transform is rebuilt from the moving train every frame, so the player is
        // physically carried with the carriage instead of sliding backwards or
        // being left behind as the train moves.
        const turnRate = pInputs.sprint ? 3.0 : 2.55;
        if (pInputs.left && !pInputs.right) {
          e.playerMovement.yaw += turnRate * dt;
          e.cameraAngle += turnRate * dt;
        } else if (pInputs.right && !pInputs.left) {
          e.playerMovement.yaw -= turnRate * dt;
          e.cameraAngle -= turnRate * dt;
        }
        while (e.playerMovement.yaw > Math.PI) e.playerMovement.yaw -= Math.PI * 2;
        while (e.playerMovement.yaw < -Math.PI) e.playerMovement.yaw += Math.PI * 2;
        while (e.cameraAngle > Math.PI) e.cameraAngle -= Math.PI * 2;
        while (e.cameraAngle < -Math.PI) e.cameraAngle += Math.PI * 2;

        const yaw = e.playerMovement.yaw;
        const fX = Math.sin(yaw), fZ = Math.cos(yaw);
        const lX = Math.cos(yaw), lZ = -Math.sin(yaw);
        const indoorSpeed = pInputs.sprint ? 9.0 : 5.8;
        const backwardSpeed = pInputs.sprint ? 6.5 : 4.2;
        const sideSpeed = pInputs.sprint ? 6.2 : 4.0;
        let stepX = 0, stepZ = 0;
        let walkingBackward = false;
        if (pInputs.forward && !pInputs.backward) {
          stepX += fX * indoorSpeed * dt; stepZ += fZ * indoorSpeed * dt;
          if (pInputs.left && !pInputs.right) { stepX += lX * sideSpeed * 0.45 * dt; stepZ += lZ * sideSpeed * 0.45 * dt; }
          if (pInputs.right && !pInputs.left) { stepX -= lX * sideSpeed * 0.45 * dt; stepZ -= lZ * sideSpeed * 0.45 * dt; }
        } else if (pInputs.backward && !pInputs.forward) {
          stepX -= fX * backwardSpeed * dt; stepZ -= fZ * backwardSpeed * dt; walkingBackward = true;
        } else if (pInputs.left && !pInputs.right) {
          stepX += lX * sideSpeed * dt; stepZ += lZ * sideSpeed * dt;
        } else if (pInputs.right && !pInputs.left) {
          stepX -= lX * sideSpeed * dt; stepZ -= lZ * sideSpeed * dt;
        }
        moveInsideTrain(stepX, stepZ);

        // Train-local jumping. Vertical motion stays in the carriage's coordinate
        // system, so jumping at full train speed cannot leave the Pokémon behind.
        if (!pInputs.jump) e.trainRideJumpLatch = false;
        if (pInputs.jump && !e.trainRideJumpLatch && e.trainRideJumpOffset <= 0.001) {
          e.trainRideVerticalVelocity = 7.2;
          e.trainRideJumpLatch = true;
          playSoundEffect('jump');
        }
        if (e.trainRideJumpOffset > 0.001 || e.trainRideVerticalVelocity > 0) {
          e.trainRideVerticalVelocity -= 21.0 * dt;
          e.trainRideJumpOffset += e.trainRideVerticalVelocity * dt;
          if (e.trainRideJumpOffset <= 0) {
            e.trainRideJumpOffset = 0;
            e.trainRideVerticalVelocity = 0;
          }
        }
        e.trainRideLocalPosition.y = goldenrod.trainService.trainInteriorFloorY + e.trainRideJumpOffset;

        e.playerMovement.velocity.set(
          dt > 0 ? stepX / dt : 0,
          e.trainRideVerticalVelocity,
          dt > 0 ? stepZ / dt : 0
        );
        e.playerMovement.isGrounded = e.trainRideJumpOffset <= 0.001;
        goldenrod.trainService.trainMesh.updateWorldMatrix(true, false);
        const trainWorld = goldenrod.trainService.trainMesh.localToWorld(e.trainRideLocalPosition.clone());
        e.playerMovement.position.copy(trainWorld);
        e.playerMesh.position.copy(trainWorld);
        e.playerMesh.rotation.y = e.playerMovement.yaw;
        e.playerMesh.rotation.z = 0;
        e.playerMesh.visible = true;

        if (e.hasChosenStarter) {
          const planarSpeed = Math.hypot(e.playerMovement.velocity.x, e.playerMovement.velocity.z);
          animatePokemonModel(
            e.playerMesh,
            e.currentPokemonId,
            e.trainRideJumpOffset > 0.03 ? 'jump' : walkingBackward && planarSpeed > 0.25 ? 'backward' : planarSpeed > 6.2 ? 'run' : planarSpeed > 0.25 ? 'walk' : 'idle',
            time * 0.001,
            pInputs.sprint ? 1.25 : 1
          );
        }

        // Keep the train camera physically inside the carriage instead of letting
        // it pass through the shell when the player looks sideways.
        const trainCamDist = THREE.MathUtils.clamp(e.cameraDistance, 2.0, 3.15);
        const trainCamLocal = e.trainRideLocalPosition.clone();
        trainCamLocal.x -= Math.sin(e.cameraAngle) * Math.cos(e.cameraPitch) * trainCamDist;
        trainCamLocal.z -= Math.cos(e.cameraAngle) * Math.cos(e.cameraPitch) * trainCamDist;
        trainCamLocal.y += Math.sin(e.cameraPitch) * trainCamDist + 0.95;
        const trainBounds = goldenrod.trainService.trainInteriorBounds;
        trainCamLocal.x = THREE.MathUtils.clamp(trainCamLocal.x, trainBounds.minX + 0.40, trainBounds.maxX - 0.40);
        trainCamLocal.z = THREE.MathUtils.clamp(trainCamLocal.z, trainBounds.minZ + 0.36, trainBounds.maxZ - 0.36);
        trainCamLocal.y = THREE.MathUtils.clamp(trainCamLocal.y, goldenrod.trainService.trainInteriorFloorY + 0.75, 1.28);
        goldenrod.trainService.trainMesh.updateWorldMatrix(true, false);
        const trainCamWorld = goldenrod.trainService.trainMesh.localToWorld(trainCamLocal);
        camera.position.lerp(trainCamWorld, Math.min(1, dt * 10));
        tempLookTarget.set(trainWorld.x, trainWorld.y + 1.05, trainWorld.z);
        camera.lookAt(tempLookTarget);
      } else {
        const movementFovTarget = e.charizardFlightActive ? 64 + Math.min(4, Math.abs(e.charizardFlightSpeed) / 7) : e.playerMovement.isStomping ? 67 : (!e.playerMovement.isGrounded && e.playerMovement.jumpsUsed >= 2 ? 62.5 : (pInputs.sprint ? 64 : 60));
        const walkingFov = THREE.MathUtils.lerp(camera.fov, movementFovTarget, Math.min(1, dt * (e.playerMovement.isStomping ? 7 : 4)));
        if (Math.abs(walkingFov - camera.fov) > 0.02) {
          camera.fov = walkingFov;
          camera.updateProjectionMatrix();
        }
        let result = {
          cameraAngle: e.cameraAngle,
          isWalkingBackward: false,
          didDoubleJump: false,
          didStompStart: false,
          didStompLand: false,
        };
        let swimming = false;

        if (e.currentPokemonId === 'charizard' && e.charizardFlightActive && !movementLocked) {
          const forwardHeld = !!keys['KeyW'] || !!keys['ArrowUp'];
          const backHeld = !!keys['KeyS'] || !!keys['ArrowDown'];
          const leftHeld = !!keys['KeyA'] || !!keys['ArrowLeft'];
          const rightHeld = !!keys['KeyD'] || !!keys['ArrowRight'];
          const ascendHeld = !!keys['Space'];
          const descendHeld = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
          const analog = analogInputStateRef.current;

          // Process both keyboard and mobile analog joystick inputs
          let forwardFactor = (forwardHeld ? 1 : 0) - (backHeld ? 1 : 0);
          let turnInput = (leftHeld ? 1 : 0) - (rightHeld ? 1 : 0);

          if (analog.active && analog.magnitude > 0.05) {
            // analog.y: negative is forward / up, positive is backward / down
            // analog.x: negative is left, positive is right
            forwardFactor = -analog.y * analog.magnitude;
            turnInput = -analog.x * analog.magnitude;
          }

          let targetSpeed = 0;
          if (forwardFactor > 0.05) {
            targetSpeed = 24.0 * Math.min(1.0, forwardFactor * 1.15);
          } else if (forwardFactor < -0.05) {
            targetSpeed = -6.0 * Math.min(1.0, -forwardFactor);
          }

          e.charizardFlightSpeed = THREE.MathUtils.damp(
            e.charizardFlightSpeed,
            targetSpeed,
            targetSpeed === 0 ? 3.0 : 4.5,
            dt
          );

          const turnRate = 2.2 * (0.65 + Math.min(1.0, Math.abs(e.charizardFlightSpeed) / 10));
          e.playerMovement.yaw += turnInput * turnRate * dt;
          while (e.playerMovement.yaw > Math.PI) e.playerMovement.yaw -= Math.PI * 2;
          while (e.playerMovement.yaw < -Math.PI) e.playerMovement.yaw += Math.PI * 2;
          e.cameraAngle = e.playerMovement.yaw;
          result.cameraAngle = e.cameraAngle;

          let targetVertical = 0;
          if (ascendHeld && !descendHeld) targetVertical = 8.5;
          else if (descendHeld && !ascendHeld) targetVertical = -8.5;
          e.charizardVerticalSpeed = THREE.MathUtils.damp(e.charizardVerticalSpeed, targetVertical, 5.5, dt);
          e.playerMesh.userData.charizardBank = -turnInput * 0.25;
          e.playerMesh.userData.charizardPitch = THREE.MathUtils.clamp(-e.charizardVerticalSpeed * 0.024, -0.20, 0.18);

          const forward = new THREE.Vector3(Math.sin(e.playerMovement.yaw), 0, Math.cos(e.playerMovement.yaw));
          const start = e.playerMovement.position.clone();
          const desired = start.clone().addScaledVector(forward, e.charizardFlightSpeed * dt);
          desired.y += e.charizardVerticalSpeed * dt;
          desired.x = THREE.MathUtils.clamp(desired.x, -650, 650);
          desired.z = THREE.MathUtils.clamp(desired.z, -920, 520);
          const desiredGround = e.collisionSystem.getGroundHeightNear(desired.x, desired.z, desired.y, 0.12, 4.0, 120);
          const charizardCeiling = Math.max(CHARIZARD_WORLD_CEILING_Y, desiredGround + 96.0);
          desired.y = THREE.MathUtils.clamp(desired.y, desiredGround, charizardCeiling);

          let resolvedFlight = resolvePlayableCharizardFlight(e.collisionSystem, start, desired);
          if (resolvedFlight.blocked) {
            // If the obstacle is low and there is genuinely free space above it,
            // permit a small arcade-style climb. Tall walls/ceilings simply stop
            // the body and force the player to turn or gain altitude manually.
            const climbDesired = desired.clone();
            climbDesired.y = Math.min(charizardCeiling, Math.max(start.y, desired.y) + 1.05);
            const climb = resolvePlayableCharizardFlight(e.collisionSystem, start, climbDesired);
            const normalProgress = planarDistance(start, resolvedFlight.position);
            const climbProgress = planarDistance(start, climb.position);
            if (!descendHeld && climbProgress > normalProgress + 0.35) {
              resolvedFlight = climb;
              e.charizardVerticalSpeed = Math.max(e.charizardVerticalSpeed, 2.2);
            } else {
              e.charizardFlightSpeed *= 0.30;
              if (e.charizardVerticalSpeed > 0 && climb.position.y <= start.y + 0.08) e.charizardVerticalSpeed = 0;
            }
          }

          e.playerMovement.position.copy(resolvedFlight.position);
          const groundAfter = e.collisionSystem.getGroundHeightNear(
            e.playerMovement.position.x, e.playerMovement.position.z, e.playerMovement.position.y, desiredGround, 4.0, 120
          );
          if (e.playerMovement.position.y < groundAfter) e.playerMovement.position.y = groundAfter;
          const altitude = Math.max(0, e.playerMovement.position.y - groundAfter);
          const shouldLand = descendHeld && altitude <= 0.16;
          if (shouldLand) {
            e.playerMovement.position.y = groundAfter;
            e.playerMovement.velocity.set(0, 0, 0);
            e.playerMovement.isGrounded = true;
            e.playerMovement.jumpsUsed = 0;
            e.charizardFlightActive = false;
            e.charizardFlightSpeed = 0;
            e.charizardVerticalSpeed = 0;
            e.playerMesh.userData.charizardFlying = false;
            e.playerMesh.userData.charizardJumpPreparing = false;
            e.playerMesh.userData.charizardBank = 0;
            e.playerMesh.userData.charizardPitch = 0;
            recordSafeCheckpoint(e, e.playerMovement.position, e.playerMovement.yaw);
            playSoundEffect('jump');
          } else {
            e.playerMovement.velocity.set(
              forward.x * e.charizardFlightSpeed,
              e.charizardVerticalSpeed,
              forward.z * e.charizardFlightSpeed
            );
            e.playerMovement.isGrounded = false;
            e.playerMovement.isStomping = false;
            e.playerMovement.jumpsUsed = 0;
            e.playerMesh.userData.charizardFlying = true;
          }
          e.vehicleSurfaceSupport = null;
          e.worldInteractions.pushLightweightProps(e.playerMovement.position, e.playerMovement.velocity, dt);
        } else if (e.seated && e.activeSeat && e.seatTargetPosition && e.seatStartPosition) {
          // Seats own the player transform while occupied. The short interpolation
          // makes sitting feel intentional without letting collision shove the player
          // back out of the solid chair/bench they're visibly using.
          const livePose = getSeatWorldPose(e.activeSeat);
          const liveTarget = e.seatTargetPosition.clone();
          liveTarget.x = livePose.position.x;
          liveTarget.z = livePose.position.z;
          liveTarget.y = e.collisionSystem.getGroundHeightNear(liveTarget.x, liveTarget.z, e.playerMovement.position.y, liveTarget.y, 1.6, 4.5);
          e.seatTargetPosition.copy(liveTarget);
          e.seatYaw = livePose.yaw;
          e.seatTransitionTimer = Math.min(e.seatTransitionDuration, e.seatTransitionTimer + dt);
          const rawSitT = e.seatTransitionDuration > 0 ? e.seatTransitionTimer / e.seatTransitionDuration : 1;
          const sitT = rawSitT * rawSitT * (3 - 2 * rawSitT);
          e.playerMovement.position.lerpVectors(e.seatStartPosition, liveTarget, sitT);
          e.playerMovement.velocity.set(0, 0, 0);
          e.playerMovement.isGrounded = true;
          e.playerMovement.isStomping = false;
          e.playerMovement.jumpsUsed = 0;
          e.playerMovement.yaw = e.seatYaw;
          e.vehicleSurfaceSupport = null;
          // Sitting is a locked-facing interaction: keep the third-person camera
          // aligned behind the seated character instead of letting stale mouse orbit
          // angles put the view through their torso when they sit down.
          e.cameraAngle = e.seatYaw;
          result.cameraAngle = e.seatYaw;
        } else if (e.vehicleExitTumbleTimer > 0) {
          if (e.seated) clearSeatState(e);
          const previousOnFootPosition = e.playerMovement.position.clone();
          const tumbleInputs: PlayerInputs = {
            forward: false, backward: false, left: false, right: false, jump: false, sprint: false,
            kick: false, water: false, movementScale: 1, preserveMomentum: true,
          };
          result = e.playerMovement.update(
            dt, tumbleInputs, e.cameraAngle, e.collisionSystem, e.particles
          );
          e.cameraAngle = result.cameraAngle;
          resolvePlayerVehicleBodies(previousOnFootPosition, dt, false);
          resolvePlayerAircraftBodies();
          resolvePlayerNpcBodies(dt);
          e.worldInteractions.pushLightweightProps(e.playerMovement.position, e.playerMovement.velocity, dt);

          e.vehicleExitTumbleTimer = Math.max(0, e.vehicleExitTumbleTimer - dt);
          // Once the player has hit the road, keep a short sliding/rolling recovery
          // instead of instantly standing. Ground friction then bleeds off the last
          // bit of inherited vehicle momentum smoothly.
          if (e.playerMovement.isGrounded) {
            e.playerMovement.velocity.x *= Math.pow(0.46, dt * 2.0);
            e.playerMovement.velocity.z *= Math.pow(0.46, dt * 2.0);
          }
          swimming = isOpenRiverWater(e.playerMovement.position) && e.playerMovement.position.y < 0.58;
          if (swimming) {
            e.playerMovement.velocity.x *= Math.pow(0.72, dt * 10);
            e.playerMovement.velocity.z *= Math.pow(0.72, dt * 10);
            e.playerMovement.velocity.y = 0;
            e.playerMovement.isGrounded = true;
            e.playerMovement.position.y = 0.11;
          }
          e.safePositionTimer += dt;
          if (e.playerMovement.position.y < -12 || e.playerMovement.position.x < -675 || e.playerMovement.position.x > 675 || e.playerMovement.position.z < -980 || e.playerMovement.position.z > 560) {
            e.vehicleExitTumbleTimer = 0;
            recoverPlayerToSafeCheckpoint('invalid_position');
          }
        } else {
          if (e.seated) clearSeatState(e);
          // Moving support is additive to ordinary player control. Vehicles keep first
          // priority; otherwise the baggage belt advances the player's support point
          // before WASD/jump are applied, exactly like a moving platform.
          const dynamicVehicleGroundY = prepareVehicleSurfaceSupport(dt, pInputs.jump);
          const baggageCarouselGroundY = dynamicVehicleGroundY === null
            ? prepareBaggageCarouselSupport(dt, pInputs.jump)
            : null;
          const previousOnFootPosition = e.playerMovement.position.clone();

          result = e.playerMovement.update(
            dt, pInputs, e.cameraAngle, e.collisionSystem, e.particles,
            dynamicVehicleGroundY ?? baggageCarouselGroundY ?? undefined
          );
        e.cameraAngle = result.cameraAngle;
        if (result.didDoubleJump) {
          e.cameraShake = Math.max(e.cameraShake, 0.09);
          e.particles.emitRecallSpark(e.playerMovement.position.clone().add(new THREE.Vector3(0, 0.45, 0)), 0xbfe8ff);
        }
        if (result.didStompStart) e.cameraShake = Math.max(e.cameraShake, 0.06);

        // Cars are dynamic collision: the upper rendered surface can be stood on,
        // while side bodywork remains solid. NPCs use soft body collision so they
        // can be pushed/stumbled instead of acting like ghosts or concrete walls.
        const stompedOnVehicle = resolvePlayerVehicleBodies(previousOnFootPosition, dt, pInputs.jump);
        resolvePlayerAircraftBodies();
        if (result.didStompLand || stompedOnVehicle) triggerPlayerStompImpact(e.playerMovement.position.clone());
        resolvePlayerNpcBodies(dt);

        // Dynamic vehicle/NPC bodies are checked every rendered frame so even a fast
        // sprint cannot tunnel through them between lower-rate world simulation ticks.

          swimming = isOpenRiverWater(e.playerMovement.position) && e.playerMovement.position.y < 0.58;
        if (swimming) {
          e.playerMovement.velocity.x *= Math.pow(0.72, dt * 10);
          e.playerMovement.velocity.z *= Math.pow(0.72, dt * 10);
          e.playerMovement.velocity.y = 0;
          e.playerMovement.isGrounded = true;
          e.playerMovement.position.y = 0.11;
        }
        e.worldInteractions.pushLightweightProps(e.playerMovement.position, e.playerMovement.velocity, dt);

        // Maintain a rolling safe checkpoint from real gameplay instead of using
        // Professor Oak's Lab as a hidden catch-all respawn. Only stable, grounded,
        // non-water positions are recorded. If corrupted physics ever sends the
        // player far below/outside the authored world, recover to this local point.
        e.safePositionTimer += dt;
        if (e.playerMovement.position.y < -12 || e.playerMovement.position.x < -675 || e.playerMovement.position.x > 675 || e.playerMovement.position.z < -980 || e.playerMovement.position.z > 560) {
          recoverPlayerToSafeCheckpoint('invalid_position');
        } else if (
          e.safePositionTimer >= 0.75 &&
          e.playerMovement.isGrounded &&
          !swimming &&
          !e.healingActive &&
          !e.vehicleEntryActive &&
          e.vehicleExitTumbleTimer <= 0 &&
          e.collisionSystem.canOccupy(e.playerMovement.position, e.currentPokemonId === 'charizard' ? 0.82 : 0.68, e.currentPokemonId === 'charizard' ? 2.72 : 1.9)
        ) {
          e.safePositionTimer = 0;
          recordSafeCheckpoint(e, e.playerMovement.position, e.playerMovement.yaw);
        }
        }

        if (!e.switchAnimator.active && !e.healingActive && !e.vehicleEntryActive) {
          e.playerMesh.visible = true;
          e.playerMesh.position.copy(e.playerMovement.position);
          if (swimming) {
            // Lower the model into the water and add a gentle swim bob while keeping
            // the gameplay/camera origin stable at water level.
            e.playerMesh.position.y -= 0.48 + Math.sin(time * 0.006) * 0.05;
            e.playerMesh.rotation.z = Math.sin(time * 0.004) * 0.08;
          } else if (e.vehicleExitTumbleTimer <= 0 && Math.abs(e.playerMesh.rotation.z) < 0.12) {
            e.playerMesh.rotation.z = 0;
          }
          e.playerMesh.rotation.y = e.playerMovement.yaw;
          if (e.currentPokemonId === 'charizard') {
            e.playerMesh.userData.charizardFlying = e.charizardFlightActive;
          }
          // Ground-pound pitches the whole character forward/downward, then eases
          // cleanly upright on landing instead of snapping the model orientation.
          // A high-speed vehicle bailout owns root rotation temporarily so the same
          // stabiliser does not fight the visible tumble every frame.
          if (e.vehicleExitTumbleTimer <= 0) {
            const charizardPitch = e.currentPokemonId === 'charizard' && e.charizardFlightActive
              ? Number(e.playerMesh.userData.charizardPitch ?? 0)
              : e.playerMovement.isStomping ? -0.82 : 0;
            e.playerMesh.rotation.x = THREE.MathUtils.damp(
              e.playerMesh.rotation.x,
              charizardPitch,
              e.playerMovement.isStomping ? 18 : 14,
              dt
            );
            if (e.currentPokemonId === 'charizard' && e.charizardFlightActive) {
              e.playerMesh.rotation.z = THREE.MathUtils.damp(
                e.playerMesh.rotation.z,
                Number(e.playerMesh.userData.charizardBank ?? 0),
                8,
                dt
              );
            } else if (e.currentPokemonId === 'charizard') {
              e.playerMesh.rotation.z = THREE.MathUtils.damp(e.playerMesh.rotation.z, 0, 10, dt);
            }
          }
          if (e.hasChosenStarter) {
            if (e.currentPokemonId === 'charizard') {
              e.playerMesh.userData.charizardJumpPreparing = !e.charizardFlightActive && !e.playerMovement.isGrounded && e.playerMovement.jumpsUsed === 1;
            }
            const planarSpeed = Math.hypot(e.playerMovement.velocity.x, e.playerMovement.velocity.z);
            const animState = e.vehicleExitTumbleTimer > 0
              ? 'jump'
              : e.attackTimer > 0
              ? 'attack'
              : e.playerMovement.isStomping || e.specialTimer > 0 || ((e.currentPokemonId === 'poliway' || e.currentPokemonId === 'charmander' || e.currentPokemonId === 'charizard') && !!keys['KeyQ'])
              ? 'special'
              : !e.playerMovement.isGrounded
              ? 'jump'
              : result.isWalkingBackward && planarSpeed > 0.3
              ? 'backward'
              : planarSpeed > 10
              ? 'run'
              : planarSpeed > 0.35
              ? 'walk'
              : 'idle';
            animatePokemonModel(e.playerMesh, e.currentPokemonId, animState, time * 0.001, pInputs.sprint ? 1.55 : 1);
          }

          if (e.vehicleExitTumbleTimer > 0) {
            if (!e.playerMovement.isGrounded) {
              e.playerMesh.rotation.x += e.vehicleExitTumbleSpinX * dt;
              e.playerMesh.rotation.z += e.vehicleExitTumbleSpinZ * dt;
            } else {
              // Road contact transitions from the airborne flail into a short roll,
              // then smoothly returns the root upright before controls unlock.
              const remaining = e.vehicleExitTumbleDuration > 0
                ? THREE.MathUtils.clamp(e.vehicleExitTumbleTimer / e.vehicleExitTumbleDuration, 0, 1)
                : 0;
              const recoveryRoll = remaining > 0.28 ? Math.sign(e.vehicleExitTumbleSpinZ || 1) * 0.82 : 0;
              e.playerMesh.rotation.x = THREE.MathUtils.damp(e.playerMesh.rotation.x, remaining > 0.28 ? -0.48 : 0, 9, dt);
              e.playerMesh.rotation.z = THREE.MathUtils.damp(e.playerMesh.rotation.z, recoveryRoll, 9, dt);
            }
          }

          if (e.seated) {
            applyPlayerSittingPose(e.playerMesh);
          }

          if (e.grabbedNpcId) {
            const held = e.npcManager.getNPCById(e.grabbedNpcId);
            if (!held || !held.mesh.visible) {
              e.grabbedNpcId = null;
              e.grabLiftTimer = 0;
              e.grabStartPosition = null;
              e.grabThrowPoseTimer = 0;
              e.grabThrowQueued = false;
              clearPlayerGrabPose(e.playerMesh);
            } else {
              const profile = getGrabPoseProfile(e.currentPokemonId, e.playerMesh);
              const forward = new THREE.Vector3(Math.sin(e.playerMovement.yaw), 0, Math.cos(e.playerMovement.yaw)).normalize();
              const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
              let animationT = 0;
              let heldHeight = profile.holdHeight;
              let heldForward = profile.holdForward;

              if (!e.grabThrowQueued) {
                e.grabLiftTimer = Math.min(e.grabLiftDuration, e.grabLiftTimer + dt);
                const rawGrabT = e.grabLiftDuration > 0 ? e.grabLiftTimer / e.grabLiftDuration : 1;
                animationT = rawGrabT * rawGrabT * (3 - 2 * rawGrabT);
              } else {
                const totalThrowTime = 0.62;
                e.grabThrowPoseTimer = Math.max(0, e.grabThrowPoseTimer - dt);
                const throwT = THREE.MathUtils.clamp(1 - e.grabThrowPoseTimer / totalThrowTime, 0, 1);

                if (throwT < 0.40) {
                  // Wind-up: pull the held NPC closer and slightly upward while the
                  // two hands stay visibly attached to the body.
                  const u = throwT / 0.40;
                  const ease = u * u * (3 - 2 * u);
                  heldHeight = THREE.MathUtils.lerp(profile.holdHeight, profile.pullbackHeight, ease);
                  heldForward = THREE.MathUtils.lerp(profile.holdForward, profile.pullbackForward, ease);
                } else {
                  // Forward swing. Release near the end of this phase, not on key-down.
                  const u = THREE.MathUtils.clamp((throwT - 0.40) / 0.34, 0, 1);
                  const ease = u * u * (3 - 2 * u);
                  heldHeight = THREE.MathUtils.lerp(profile.pullbackHeight, profile.holdHeight + 0.04, ease);
                  heldForward = THREE.MathUtils.lerp(profile.pullbackForward, profile.releaseForward, ease);
                }
                animationT = throwT;

                if (throwT >= 0.70) {
                  const thrown = held;
                  e.grabbedNpcId = null;
                  e.grabLiftTimer = 0;
                  e.grabStartPosition = null;
                  e.grabThrowQueued = false;
                  e.npcManager.throwGrabbedNPC(thrown, e.playerMovement.position.clone(), forward);
                  addWanted(0.8);
                  e.cameraShake = Math.max(e.cameraShake, 0.08);
                  playSoundEffect('kick');
                  // Keep the remaining timer alive for an arm follow-through.
                }
              }

              if (e.grabbedNpcId) {
                const heldTarget = e.playerMovement.position.clone()
                  .add(new THREE.Vector3(0, heldHeight, 0))
                  .addScaledVector(forward, heldForward);
                const heldStart = e.grabStartPosition ?? held.mesh.position.clone();
                const blend = e.grabThrowQueued ? 1 : animationT;
                held.mesh.position.lerpVectors(heldStart, heldTarget, blend);
                held.mesh.rotation.x = THREE.MathUtils.lerp(held.mesh.rotation.x, 0, Math.min(1, dt * 12));
                held.mesh.rotation.y = e.playerMovement.yaw;
                held.mesh.rotation.z = THREE.MathUtils.lerp(held.mesh.rotation.z, Math.PI / 2, Math.min(1, dt * 10));

                // Two live grip points on the held NPC. Arms and visible hands track
                // these every frame, so turning or moving while holding somebody no
                // longer leaves the hands frozen beside the player's body.
                const handCenter = heldTarget.clone().add(new THREE.Vector3(0, 0.04, 0));
                const leftHandTarget = handCenter.clone().addScaledVector(right, -profile.handSpread);
                const rightHandTarget = handCenter.clone().addScaledVector(right, profile.handSpread);
                applyPlayerGrabPose(e.playerMesh, e.currentPokemonId, leftHandTarget, rightHandTarget, e.grabThrowQueued ? animationT : 0);
              }
            }
          } else if (e.grabThrowPoseTimer > 0) {
            const totalThrowTime = 0.62;
            e.grabThrowPoseTimer = Math.max(0, e.grabThrowPoseTimer - dt);
            const throwT = THREE.MathUtils.clamp(1 - e.grabThrowPoseTimer / totalThrowTime, 0, 1);
            const profile = getGrabPoseProfile(e.currentPokemonId, e.playerMesh);
            const forward = new THREE.Vector3(Math.sin(e.playerMovement.yaw), 0, Math.cos(e.playerMovement.yaw)).normalize();
            const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
            const followCenter = e.playerMovement.position.clone()
              .add(new THREE.Vector3(0, profile.holdHeight, 0))
              .addScaledVector(forward, profile.releaseForward);
            applyPlayerGrabPose(
              e.playerMesh,
              e.currentPokemonId,
              followCenter.clone().addScaledVector(right, -profile.handSpread),
              followCenter.clone().addScaledVector(right, profile.handSpread),
              throwT,
            );
            if (e.grabThrowPoseTimer <= 0) clearPlayerGrabPose(e.playerMesh);
          } else {
            clearPlayerGrabPose(e.playerMesh);
          }
        }

        handleContinuousSpecials(dt);

        const pos = e.playerMovement.position;
        const charizardCameraBoost = e.currentPokemonId === 'charizard' ? (e.charizardFlightActive ? 2.2 : 0.8) : 0;
        const camDist = e.cameraDistance + (pInputs.sprint ? 0.65 : 0) + charizardCameraBoost;
        let resolvedCamera: THREE.Vector3;

        if (e.seated && e.activeSeat) {
          // Seated camera: use the ACTUAL posed model bounds, not a hard-coded low
          // stomach target. Different Pokémon have very different body proportions
          // (Geodude in particular is wide through the arms), so a fixed Y offset can
          // make an otherwise valid third-person camera look as though it is inside
          // the character.
          const seatedAngle = e.seatYaw;
          const seatedPitch = THREE.MathUtils.clamp(e.cameraPitch, 0.28, 0.58);
          const seatedBounds = new THREE.Box3().setFromObject(e.playerMesh);
          const seatedSize = seatedBounds.getSize(new THREE.Vector3());
          const seatedCenter = seatedBounds.getCenter(new THREE.Vector3());
          const bodyRadius = Math.max(0.7, Math.max(seatedSize.x, seatedSize.z) * 0.5);
          const seatedDist = THREE.MathUtils.clamp(
            Math.max(e.cameraDistance * 0.92, bodyRadius + 3.35),
            4.75,
            7.4
          );
          const focusY = THREE.MathUtils.clamp(
            seatedBounds.min.y + seatedSize.y * 0.62,
            pos.y + 0.98,
            pos.y + 1.55
          );
          tempLookTarget.set(seatedCenter.x, focusY, seatedCenter.z);

          // Stay in the rear hemisphere. Wider rear-shoulder options are important
          // for benches/chairs placed against walls: the camera can slide sideways
          // rather than being forced straight forward into the player's body.
          const angleOffsets = [0, 0.30, -0.30, 0.62, -0.62, 0.94, -0.94, 1.18, -1.18];
          let bestCamera: THREE.Vector3 | null = null;
          let bestScore = -Infinity;
          for (const offset of angleOffsets) {
            const angle = seatedAngle + offset;
            const pitch = Math.min(0.78, seatedPitch + (Math.abs(offset) > 0.6 ? 0.12 : 0));
            const desired = new THREE.Vector3(
              tempLookTarget.x - Math.sin(angle) * Math.cos(pitch) * seatedDist,
              tempLookTarget.y + Math.sin(pitch) * seatedDist + 0.62,
              tempLookTarget.z - Math.cos(angle) * Math.cos(pitch) * seatedDist
            );
            const candidate = e.collisionSystem.resolveCameraPosition(tempLookTarget, desired, 0.28, 0.22);
            const distance = candidate.distanceTo(tempLookTarget);
            const bodyClearance = candidate.distanceTo(seatedCenter) - bodyRadius;
            // Prefer genuinely clear camera positions. A small penalty for wider
            // shoulder angles keeps straight-behind as the default when both work.
            const score = distance + Math.min(1.4, Math.max(0, bodyClearance)) * 0.45 - Math.abs(offset) * 0.12;
            if (bodyClearance > 0.65 && score > bestScore) {
              bestScore = score;
              bestCamera = candidate;
            }
          }

          // If the normal rear candidates are all cramped, use a higher rear-quarter
          // shot. This still stays behind the facing direction and is collision-tested.
          if (!bestCamera) {
            for (const offset of [0.72, -0.72, 1.12, -1.12]) {
              const angle = seatedAngle + offset;
              const desired = new THREE.Vector3(
                tempLookTarget.x - Math.sin(angle) * (bodyRadius + 3.0),
                tempLookTarget.y + 2.75,
                tempLookTarget.z - Math.cos(angle) * (bodyRadius + 3.0)
              );
              const candidate = e.collisionSystem.resolveCameraPosition(tempLookTarget, desired, 0.24, 0.18);
              const clearance = candidate.distanceTo(seatedCenter) - bodyRadius;
              if (clearance > 0.55) {
                bestCamera = candidate;
                break;
              }
            }
          }

          resolvedCamera = bestCamera ?? new THREE.Vector3(
            tempLookTarget.x - Math.sin(seatedAngle) * (bodyRadius + 2.0),
            tempLookTarget.y + 2.2,
            tempLookTarget.z - Math.cos(seatedAngle) * (bodyRadius + 2.0)
          );
        } else {
          const lookHeight = e.currentPokemonId === 'charizard' ? (e.charizardFlightActive ? 1.55 : 1.38) : 1.1;
          tempLookTarget.set(pos.x, pos.y + lookHeight, pos.z);
          tempCameraTarget.set(
            pos.x - Math.sin(e.cameraAngle) * Math.cos(e.cameraPitch) * camDist,
            pos.y + Math.sin(e.cameraPitch) * camDist + (e.currentPokemonId === 'charizard' ? 1.25 : 1.0),
            pos.z - Math.cos(e.cameraAngle) * Math.cos(e.cameraPitch) * camDist
          );

          const wideSkyOrbit = !(e.currentPokemonId === 'charizard' && e.charizardFlightActive);
          if (wideSkyOrbit && e.cameraPitch < 0.12) {
            constrainOnFootCameraAboveGround(tempLookTarget, tempCameraTarget, pos.y);
          }

          // Collision-aware third-person camera. The same wall boxes that stop the
          // Pokémon also stop the camera, so indoor walls pull the camera closer
          // instead of disappearing between the player and view.
          resolvedCamera = e.collisionSystem.resolveCameraPosition(tempLookTarget, tempCameraTarget, 0.26, 0.20);
          const resolvedDistance = resolvedCamera.distanceTo(tempLookTarget);

          // In very tight rooms, try a slightly higher shoulder angle and keep the
          // option that exposes more of the player. This avoids a wall forcing the
          // camera onto the character's head while still respecting ceilings/walls.
          if (e.cameraPitch > -0.08 && resolvedDistance < Math.min(4.0, camDist * 0.56)) {
            const raisedPitch = Math.min(0.98, e.cameraPitch + 0.22);
            const raisedDist = Math.min(camDist, 8.5);
            const raisedDesired = new THREE.Vector3(
              pos.x - Math.sin(e.cameraAngle) * Math.cos(raisedPitch) * raisedDist,
              pos.y + Math.sin(raisedPitch) * raisedDist + 1.15,
              pos.z - Math.cos(e.cameraAngle) * Math.cos(raisedPitch) * raisedDist
            );
            const raisedResolved = e.collisionSystem.resolveCameraPosition(tempLookTarget, raisedDesired, 0.26, 0.20);
            if (raisedResolved.distanceTo(tempLookTarget) > resolvedDistance + 0.35) resolvedCamera = raisedResolved;
          }
        }

        const obstructionRatio = e.seated ? 1 : (resolvedCamera.distanceTo(tempCameraTarget) > 0.25 ? 1 : 0);

        // Camera sanity guard. Most normal third-person frames keep the camera only
        // a few metres from the player. If some earlier state transition/recovery
        // leaves the camera tens or hundreds of metres away (or underneath the
        // recovered character), slowly lerping back can show nothing but the sky
        // dome for several seconds even though gameplay itself is fine. Treat that
        // separation as an invalid camera state and snap to the already collision-
        // resolved third-person position. This is deliberately limited to the normal
        // on-foot/seated camera branch so aircraft, vehicles, parachutes and death
        // cinematics retain their authored camera motion.
        const cameraSeparation = camera.position.distanceTo(tempLookTarget);
        const cameraSolutionError = camera.position.distanceTo(resolvedCamera);
        // The old guard only rejected cameras >24m from the player. That was too
        // permissive: a camera 10-20m above/aside the correct orbit can show almost
        // nothing but the atmospheric dome/ground while still being numerically
        // "close enough". Compare against the collision-resolved solution itself.
        // Normal smoothing trails it by only a small amount, so a large solution
        // error is always a stale/bad camera state and is safe to snap immediately.
        const maxFocusSeparation = camDist + 3.5;
        const maxSolutionError = Math.max(5.5, camDist * 0.72);
        const maxVerticalSolutionError = Math.max(4.5, camDist * 0.52);
        const outsideNormalOrbitShell = cameraSeparation > camDist + 1.5;
        const cameraStateInvalid =
          !Number.isFinite(camera.position.x) ||
          !Number.isFinite(camera.position.y) ||
          !Number.isFinite(camera.position.z) ||
          cameraSeparation > maxFocusSeparation ||
          (outsideNormalOrbitShell && cameraSolutionError > maxSolutionError) ||
          (outsideNormalOrbitShell && Math.abs(camera.position.y - resolvedCamera.y) > maxVerticalSolutionError) ||
          camera.position.y > pos.y + camDist + 4.0 ||
          camera.position.y < pos.y - 2.2;
        if (cameraStateInvalid) {
          camera.position.copy(resolvedCamera);
          watchdogRecoveries++;
          lastRecoveryReason = 'automatic on-foot camera recovery';
          recordDebugStall(time, Math.max(frameMs, cameraSolutionError), lastRecoveryReason);
        } else camera.position.lerp(resolvedCamera, Math.min(1, dt * (obstructionRatio ? 13 : 7.5)));

        // The desired endpoint may be collision-safe while the interpolation path
        // from last frame is not. Re-resolve the ACTUAL smoothed camera position so
        // a fast downhill/crater movement cannot lerp the camera through the volcano
        // between two otherwise-valid endpoints. In unobstructed areas this returns
        // the same point, preserving the established city/vehicle camera behaviour.
        // If smoothing has already converged onto the collision-safe endpoint, a
        // second full camera collision solve cannot improve the result. Skipping that
        // duplicate solve is particularly important while standing still, where the
        // old code repeatedly queried the same walls/terrain every render frame.
        if (camera.position.distanceToSquared(resolvedCamera) > 0.000004) {
          const postSmoothSafeCamera = e.collisionSystem.resolveCameraPosition(
            tempLookTarget,
            camera.position,
            e.seated ? 0.28 : 0.26,
            e.seated ? 0.22 : 0.20,
          );
          if (postSmoothSafeCamera.distanceToSquared(camera.position) > 0.000001) {
            camera.position.copy(postSmoothSafeCamera);
          }
        }

        // Smoothing can cut a slightly different path from the ideal orbit ray. Give
        // the ACTUAL final on-foot camera the same floor protection, then keep the
        // existing volcano/building resolver authoritative for major geometry.
        if (!e.seated && !(e.currentPokemonId === 'charizard' && e.charizardFlightActive) && e.cameraPitch < 0.12) {
          constrainOnFootCameraAboveGround(tempLookTarget, camera.position, pos.y);
          const finalCollisionSafe = e.collisionSystem.resolveCameraPosition(
            tempLookTarget, camera.position, 0.26, 0.20
          );
          if (finalCollisionSafe.distanceToSquared(camera.position) > 0.000001) {
            camera.position.copy(finalCollisionSafe);
          }
        }
        camera.lookAt(tempLookTarget);
      }

      // Short, decaying combat shake makes punches/kicks feel heavy without
      // permanently fighting the user's camera controls.
      e.cameraShake = Math.max(0, e.cameraShake - dt * 1.8);
      if (e.cameraShake > 0.001) {
        tempShake.set(
          (Math.random() - 0.5) * e.cameraShake,
          (Math.random() - 0.5) * e.cameraShake * 0.65,
          (Math.random() - 0.5) * e.cameraShake
        );
        camera.position.add(tempShake);
      }

      // Spatial Audio Listener Update: Feed 3D camera world position, forward, and right vectors
      camera.getWorldDirection(tempAudioForward);
      tempAudioRight.crossVectors(tempAudioForward, camera.up).normalize();
      soundManager.updateListener(camera.position, tempAudioForward, tempAudioRight);

      const activePos = getActivePosition();
      // Landmark-local animation/LOD. The volcano keeps its large silhouette resident
      // while only lava/smoke/rocks/trees animate/render at useful distances.
      highway.update(dt, activePos);
      // Fountain ambience with 3D world position
      soundManager.setFountainAmbience(activePos.distanceTo(fountainWorldPosition), fountainWorldPosition);

      // Western volcano seismic deep rumble
      const volcanoPos = { x: -505, y: 15, z: -145 };
      soundManager.setVolcanoAmbience(activePos.distanceTo(volcanoPos), volcanoPos);

      // River shoreline water ambience
      const nearRiver = isOpenRiverWater(activePos) || Math.abs(activePos.x - 20) < 35;
      soundManager.setWaterShoreAmbience(nearRiver ? 6 : 70, { x: 20, y: 0, z: activePos.z });

      // Keep visual wheel spin and lamp response at render rate even though traffic
      // and police AI can simulate more cheaply at fixed lower frequencies.
      const visualPlayerSteer = e.activeVehicle
        ? (cInputs.left && !cInputs.right ? 0.34 : cInputs.right && !cInputs.left ? -0.34 : 0)
        : 0;
      for (const vehicle of e.vehicles) {
        const isActive = vehicle === e.activeVehicle;
        const dx = vehicle.mesh.position.x - earlyActivePos.x;
        const dz = vehicle.mesh.position.z - earlyActivePos.z;
        // Wheel/lamp animation on a tiny vehicle 150m away is invisible but still
        // dirties transforms/materials. Keep full-rate visuals only in the useful range.
        if (!isActive && dx * dx + dz * dz > 115 * 115) continue;
        updateVehicleVisuals(
          vehicle.mesh,
          vehicle.speed ?? 0,
          dt,
          isActive ? visualPlayerSteer : 0,
          isActive && (cInputs.handbrake || (cInputs.backward && (vehicle.speed ?? 0) > -0.5)),
          isActive && (vehicle.speed ?? 0) < -0.45
        );
      }
      for (const police of e.policeAIs) {
        const dx = police.position.x - earlyActivePos.x;
        const dz = police.position.z - earlyActivePos.z;
        if (dx * dx + dz * dz <= 130 * 130) updateVehicleVisuals(police.mesh, police.speed, dt);
      }

      frameControlCameraMs = performance.now() - framePhaseStarted;
      framePhaseStarted = performance.now();

      // The two cities are hundreds of metres apart and separated by fog/highway.
      // Do not submit the entire opposite city to WebGL when it cannot meaningfully
      // contribute to the current view. Collision remains registered and unaffected.
      const cityVisibilityNorthEdge = -330;
      const positionNeedsGoldenrod = (position: THREE.Vector3) =>
        position.z > cityVisibilityNorthEdge && position.x > -70;
      const positionNeedsSpringfield = (position: THREE.Vector3) =>
        position.z > cityVisibilityNorthEdge && position.x < 70;

      // Parent-level district culling must account for BOTH the gameplay anchor and
      // the actual camera. Teleports/recovery/cinematics can legitimately separate
      // those two for a short time. If only the player position is considered, the
      // district currently underneath the camera can be hidden wholesale, producing
      // the reported "everything vanished, then came back" sky-dome view. Aircraft
      // crash aftermaths are even more important: keep both city roots resident for
      // the short 7-second sequence so any building impact remains visible regardless
      // of which district/boundary the wreck ended up on.
      // getActivePosition() already follows the crash wreck/impact point during an
      // aircraft aftermath, so there is no longer any need to force BOTH cities
      // resident for the full cinematic. Doing that doubled scene traversal exactly
      // when crash effects were already active. Keep only the city required by the
      // wreck/camera positions.
      const shouldShowGoldenrod =
        positionNeedsGoldenrod(activePos) ||
        positionNeedsGoldenrod(camera.position);
      const shouldShowSpringfield =
        positionNeedsSpringfield(activePos) ||
        positionNeedsSpringfield(camera.position);
      if (goldenrod.group.visible !== shouldShowGoldenrod) goldenrod.group.visible = shouldShowGoldenrod;
      if (springfield.group.visible !== shouldShowSpringfield) springfield.group.visible = shouldShowSpringfield;

      const inAirHigh = Boolean(
        e.activeAircraft ||
        e.charizardFlightActive ||
        (e.parachuteController && (activePos.y > 30 || camera.position.y > 30))
      );

      // Airport is far to the north (Z = -380 to -900). Only render its 1,500+ meshes when
      // the player/camera is approaching the northern sector or flying high in the air.
      const shouldShowAirport = inAirHigh || activePos.z < -130 || camera.position.z < -130;
      if (airport.group.visible !== shouldShowAirport) airport.group.visible = shouldShowAirport;

      // Arcade building is at X = 8, Z = -305. Only render its 450+ meshes when nearby,
      // inside arcade mode, or high in the air.
      const distArcadeZ = Math.min(Math.abs(activePos.z - (-305)), Math.abs(camera.position.z - (-305)));
      const shouldShowArcade = arcadeActiveRef.current || inAirHigh || distArcadeZ < (qualityTier === 'performance' ? 180 : 250);
      if (arcadeBuilding.group.visible !== shouldShowArcade) arcadeBuilding.group.visible = shouldShowArcade;

      const distanceSqToRootBoundsXZ = (bounds: THREE.Box3, position: THREE.Vector3) => {
        if (bounds.isEmpty()) return Number.POSITIVE_INFINITY;
        const dx = position.x < bounds.min.x ? bounds.min.x - position.x : position.x > bounds.max.x ? position.x - bounds.max.x : 0;
        const dz = position.z < bounds.min.z ? bounds.min.z - position.z : position.z > bounds.max.z ? position.z - bounds.max.z : 0;
        return dx * dx + dz * dz;
      };

      if (qualityTier === 'performance') {
        const rootMarginSq = 135 * 135;
        const airportCoreMarginSq = 115 * 115;
        const airportCoreNeeded = airportCorePerformanceEntries.length === 0 || Math.min(
          distanceSqToRootBoundsXZ(airportCorePerformanceBounds, activePos),
          distanceSqToRootBoundsXZ(airportCorePerformanceBounds, camera.position)
        ) <= airportCoreMarginSq;
        const highwayNeeded = Math.min(distanceSqToRootBoundsXZ(highwayPerformanceBounds, activePos), distanceSqToRootBoundsXZ(highwayPerformanceBounds, camera.position)) <= rootMarginSq;
        setAirportCorePerformanceVisible(airportCoreNeeded);
        if (highway.group.visible !== highwayNeeded) highway.group.visible = highwayNeeded;
      } else {
        setAirportCorePerformanceVisible(true);
        if (!highway.group.visible) highway.group.visible = true;
      }

      // Parked planes are direct scene children so the ACTIVE aircraft can fly back
      // over either city independently of airport detail LOD. Hide only the inactive
      // parked fleet when it is far enough away to be irrelevant.
      for (const plane of e.airportAircraft) {
        const pdx = plane.position.x - activePos.x;
        const pdz = plane.position.z - activePos.z;
        const isViewedAftermathWreck = !!(
          e.deathSequenceActive &&
          e.aircraftDeathAftermath?.aircraftId === plane.id
        );
        // A crash cinematic owns this wreck visually until the hospital handoff.
        // Never let the parked-fleet distance culler hide it just because the player
        // body was detached or the damaged aircraft moved away from the impact point.
        const shouldShowPlane = plane === e.activeAircraft || isViewedAftermathWreck || pdx * pdx + pdz * pdz <= 380 * 380;
        if (plane.mesh.visible !== shouldShowPlane) plane.mesh.visible = shouldShowPlane;
      }

      // Visibility LOD should follow what is actually on screen as well as the
      // gameplay anchor. During a teleport/recovery/camera correction those can be
      // separated briefly; using player position alone can hide the entire local
      // detail set around the camera and produce a blank-looking world.
      const distanceSqToViewAnchor = (x: number, z: number) => {
        const adx = x - activePos.x;
        const adz = z - activePos.z;
        const cdx = x - camera.position.x;
        const cdz = z - camera.position.z;
        return Math.min(adx * adx + adz * adz, cdx * cdx + cdz * cdz);
      };

      detailCullAccumulator += dt;
      const staticLodAnchorMovedSq = Number.isFinite(lastStaticLodAnchor.x)
        ? (activePos.x - lastStaticLodAnchor.x) ** 2 + (activePos.z - lastStaticLodAnchor.z) ** 2
        : Number.POSITIVE_INFINITY;
      const staticLodCameraMovedSq = Number.isFinite(lastStaticLodCamera.x)
        ? (camera.position.x - lastStaticLodCamera.x) ** 2 + (camera.position.z - lastStaticLodCamera.z) ** 2
        : Number.POSITIVE_INFINITY;
      const staticLodTierChanged = lastStaticLodTier !== qualityTier;
      if (staticLodTierChanged || staticLodAnchorMovedSq > 2.5 * 2.5 || staticLodCameraMovedSq > 2.5 * 2.5) {
        // Do not restart a partially completed sweep while continuously moving. The
        // entries are evaluated against the CURRENT anchor when visited, so finishing
        // the existing bounded pass is both cheaper and sufficiently current.
        if (detailCullWorkRemaining <= 0) detailCullWorkRemaining = detailCullEntries.length;
        if (staticShadowWorkRemaining <= 0) staticShadowWorkRemaining = staticShadowEntries.length;
        lastStaticLodAnchor.set(activePos.x, 0, activePos.z);
        lastStaticLodCamera.set(camera.position.x, 0, camera.position.z);
        lastStaticLodTier = qualityTier;
      }

      if (detailCullAccumulator >= 0.10) {
        // Subtract one interval rather than zeroing the accumulator, but cap the
        // backlog. A 500ms stall must never cause five maintenance batches to run on
        // the recovery frame.
        detailCullAccumulator = Math.min(0.10, Math.max(0, detailCullAccumulator - 0.10));
        const detailDistance = qualityTier === 'high' ? 118 : qualityTier === 'balanced' ? 82 : 58;
        const interiorDistance = qualityTier === 'high' ? 62 : qualityTier === 'balanced' ? 50 : 34;
        const detailDistanceSq = detailDistance * detailDistance;
        const interiorDistanceSq = interiorDistance * interiorDistance;
        const shadowDistance = qualityTier === 'high' ? 82 : qualityTier === 'balanced' ? 58 : 42;
        const shadowDistanceSq = shadowDistance * shadowDistance;

        // Hard caps keep maintenance frame time bounded even when render FPS has
        // already fallen. The previous `length / 5` budgets could mean thousands of
        // visibility/castShadow mutations on every 150ms frame, trapping the game in
        // a self-sustaining low-FPS state while the player was completely idle.
        if (detailCullWorkRemaining > 0) {
          const detailBudget = Math.min(detailCullWorkRemaining, qualityTier === 'performance' ? 240 : 360);
          detailCullCursor = processCyclicBatch(detailCullEntries.length, detailCullCursor, detailBudget, (index) => {
            const entry = detailCullEntries[index];
            const distanceSq = distanceSqToViewAnchor(entry.x, entry.z);
            const limitSq = entry.interior ? interiorDistanceSq : detailDistanceSq;
            entry.object.visible = distanceSq <= limitSq;
          });
          detailCullWorkRemaining -= detailBudget;
        }

        if (staticShadowWorkRemaining > 0) {
          const shadowBudget = Math.min(staticShadowWorkRemaining, qualityTier === 'performance' ? 120 : 180);
          staticShadowCursor = processCyclicBatch(staticShadowEntries.length, staticShadowCursor, shadowBudget, (index) => {
            const entry = staticShadowEntries[index];
            const dx = entry.x - activePos.x;
            const dz = entry.z - activePos.z;
            entry.mesh.castShadow = dx * dx + dz * dz <= shadowDistanceSq;
          });
          staticShadowWorkRemaining -= shadowBudget;
        }

        // Dynamic objects can move while the player stands still, so keep their LOD
        // maintenance periodic but bounded to small fixed batches.
        const propDrawDistance = qualityTier === 'high' ? 180 : qualityTier === 'balanced' ? 145 : 108;
        const propDrawDistanceSq = propDrawDistance * propDrawDistance;
        const propBudget = Math.min(e.destructibles.length, qualityTier === 'performance' ? 60 : 100);
        propCullCursor = processCyclicBatch(e.destructibles.length, propCullCursor, propBudget, (index) => {
          const prop = e.destructibles[index];
          prop.mesh.visible = distanceSqToViewAnchor(prop.mesh.position.x, prop.mesh.position.z) <= propDrawDistanceSq;
        });

        const trainDx = goldenrod.trainService.trainMesh.position.x - activePos.x;
        const trainDz = goldenrod.trainService.trainMesh.position.z - activePos.z;
        const trainDrawDistance = qualityTier === 'high' ? 430 : qualityTier === 'balanced' ? 350 : 290;
        goldenrod.trainService.trainMesh.visible = e.trainRideActive || trainDx * trainDx + trainDz * trainDz <= trainDrawDistance * trainDrawDistance;

        const vehicleInteriorDistanceSq = (qualityTier === 'high' ? 76 : qualityTier === 'balanced' ? 58 : 32) ** 2;
        const vehicleMicroDistanceSq = (qualityTier === 'high' ? 112 : qualityTier === 'balanced' ? 82 : 42) ** 2;
        const vehicleBudget = Math.min(e.vehicles.length, qualityTier === 'performance' ? 10 : 16);
        vehicleCullCursor = processCyclicBatch(e.vehicles.length, vehicleCullCursor, vehicleBudget, (index) => {
          const vehicle = e.vehicles[index];
          const isActive = vehicle === e.activeVehicle;
          const dx = vehicle.mesh.position.x - activePos.x;
          const dz = vehicle.mesh.position.z - activePos.z;
          const d2 = dx * dx + dz * dz;
          const nodes = ensureVehiclePerformanceNodes(vehicle.mesh);
          const showInterior = isActive || d2 <= vehicleInteriorDistanceSq;
          const showMicro = isActive || d2 <= vehicleMicroDistanceSq;
          nodes.interior.forEach((node) => { node.visible = showInterior; });
          nodes.micro.forEach((node) => { node.visible = showMicro; });
          nodes.shadow.forEach((mesh) => { mesh.castShadow = qualityTier !== 'performance' && (isActive || d2 <= shadowDistanceSq); });
        });

        const npcBudget = Math.min(e.npcManager.npcs.length, qualityTier === 'performance' ? 18 : 28);
        npcShadowCursor = processCyclicBatch(e.npcManager.npcs.length, npcShadowCursor, npcBudget, (index) => {
          const npc = e.npcManager.npcs[index];
          const dx = npc.mesh.position.x - activePos.x;
          const dz = npc.mesh.position.z - activePos.z;
          const d2 = dx * dx + dz * dz;
          let shadowMeshes = npc.mesh.userData.performanceShadowMeshes as THREE.Mesh[] | undefined;
          if (!shadowMeshes) {
            shadowMeshes = [];
            npc.mesh.traverse((obj) => { if (obj instanceof THREE.Mesh && obj.castShadow) shadowMeshes!.push(obj); });
            npc.mesh.userData.performanceShadowMeshes = shadowMeshes;
          }
          const cast = qualityTier !== 'performance' && d2 <= shadowDistanceSq;
          shadowMeshes.forEach((mesh) => { mesh.castShadow = cast; });
        });
      }

      frameVisibilityLodMs = performance.now() - framePhaseStarted;
      framePhaseStarted = performance.now();

      // Run world simulation below render rate. If FPS stays low for several
      // measurement windows, the simulation automatically becomes cheaper too.
      worldTickAccumulator += dt;
      const worldTickHz = qualityTier === 'high' ? 30 : qualityTier === 'balanced' ? 24 : 20;
      const WORLD_TICK = 1 / worldTickHz;
      if (worldTickAccumulator >= WORLD_TICK) {
        const worldTickStarted = performance.now();
        const simDt = Math.min(worldTickAccumulator, 0.066);
        worldTickAccumulator = 0;
        const breakdown: WorldTickBreakdown = {
          football: 0, traffic: 0, vehicleContacts: 0, worldInteractions: 0, vehicleDamage: 0,
          particles: 0, npcs: 0, jailGuard: 0, ashRoam: 0, ashBattle: 0, other: 0,
        };
        const measureWorld = (key: keyof Omit<WorldTickBreakdown, 'other'>, task: () => void) => {
          const started = performance.now();
          task();
          breakdown[key] += performance.now() - started;
        };

        e.arcadeBuilding.update(simDt);

        measureWorld('football', () => e.footballManager.update(simDt, {
          playerPosition: e.playerMovement.position,
          playerForward: currentForward(),
          playerJoined: e.footballManager.playerJoined,
        }));
        measureWorld('traffic', () => e.trafficManager.update(
          simDt,
          e.activeVehicle,
          activePos,
          e.npcManager.npcs,
          isOpenRiverWater,
          qualityTier === 'high' ? 245 : qualityTier === 'balanced' ? 195 : 120,
          qualityTier === 'high' ? 145 : qualityTier === 'balanced' ? 112 : 78,
          qualityTier === 'high' ? 28 : qualityTier === 'balanced' ? 18 : 12,
        ));
        measureWorld('vehicleContacts', () => resolveAmbientVehicleContacts(simDt));
        const hybridGreeting = e.trafficManager.consumeHybridGreeting();
        if (hybridGreeting && !e.activeVehicle && !e.deathSequenceActive && !e.hospitalRecoveryActive) {
          showTemporaryNotification(hybridGreeting.name, hybridGreeting.text);
          const mcqueen = e.trafficManager.vehicles.find(v => v.type === 'lightning_mcqueen' || v.id === 'lightning_mcqueen');
          soundManager.playVehicleHorn('lightning_mcqueen', mcqueen?.mesh.position);
        }

        // Realistic proximity & spatial audio for traffic, aircraft, and magnet train
        soundManager.updateTrafficAudio(
          e.trafficManager.vehicles
            .filter((v) => v !== e.activeVehicle)
            .map((v) => ({
              position: v.mesh.position,
              speed: v.speed ?? 0,
            }))
        );
        soundManager.updateAircraftAudio(
          e.airportAircraft.map((plane) => ({
            position: plane.mesh.position,
            speed: plane.speed,
            maxSpeed: plane.maxSpeed,
            inFlight: plane.inFlight,
          }))
        );
        if (goldenrod?.trainService) {
          soundManager.updateTrainAudio(
            goldenrod.trainService.trainMesh.position,
            !goldenrod.trainService.isTrainStopped()
          );
        }

        measureWorld('worldInteractions', () => e.worldInteractions.update(simDt));
        measureWorld('vehicleDamage', () => updateVehicleDamageEffects(simDt));
        measureWorld('particles', () => e.particles.update(simDt));
        measureWorld('npcs', () => e.npcManager.update(simDt, activePos, qualityTier === 'high' ? 1 : qualityTier === 'balanced' ? 0.92 : 0.68));
        measureWorld('jailGuard', () => updateJailEscapeGuard(simDt, activePos));
        measureWorld('ashRoam', () => updateAshFreeRoam(simDt));
        measureWorld('ashBattle', () => e.ashBattle.update(simDt, activePos));
        const worldTickEnded = performance.now();
        lastWorldTickMs = worldTickEnded - worldTickStarted;
        const measuredMs = breakdown.football + breakdown.traffic + breakdown.vehicleContacts + breakdown.worldInteractions +
          breakdown.vehicleDamage + breakdown.particles + breakdown.npcs + breakdown.jailGuard + breakdown.ashRoam + breakdown.ashBattle;
        breakdown.other = Math.max(0, lastWorldTickMs - measuredMs);
        lastWorldTickBreakdown = breakdown;
        recentWorldTicks.push({ at: worldTickEnded, totalMs: lastWorldTickMs, breakdown: { ...breakdown } });
        while (recentWorldTicks.length && worldTickEnded - recentWorldTicks[0].at > 15000) recentWorldTicks.shift();
      }

      frameWorldSimulationMs = performance.now() - framePhaseStarted;
      framePhaseStarted = performance.now();

      // The official Ash battle completely suppresses the wanted system. This is
      // enforced every frame as a safety net in addition to addWanted() ignoring it.
      const now = performance.now() * 0.001;
      if (e.ashBattle.state.isActive) {
        if (e.hitAndRunActive || e.wantedHeat > 0 || e.policeAIs.length || e.roadblocks.length) {
          clearPolicePursuit(true, false);
        }
      } else if (!e.hitAndRunActive) {
        pursuitSenseAccumulator = 0;
        cachedNearestPolice = Infinity;
        cachedPoliceLineOfSight = false;
        // Pre-trigger meter cool-down. It waits a few seconds after the last incident,
        // then falls gradually instead of snapping back to zero.
        if (e.wantedHeat > 0 && now - e.lastCrimeAt > 6) {
          syncWantedHeat(e.wantedHeat - dt * 3.0, false);
        }
        if (e.wantedHeat >= 100) triggerHitAndRun();
      } else {
        // Active HIT & RUN is now governed by the visible meter itself. Crime pauses
        // cooling for a moment and can refill the meter through addWanted(). Once the
        // player creates distance and/or breaks sight, the meter progressively drains.
        // Police stay active until the value reaches exactly zero.
        pursuitSenseAccumulator += dt;
        if (pursuitSenseAccumulator >= 0.22 || !Number.isFinite(cachedNearestPolice)) {
          pursuitSenseAccumulator = 0;
          cachedNearestPolice = e.policeAIs.reduce((best, cop) => Math.min(best, planarDistance(cop.getPursuitPosition(), activePos)), Infinity);
          const playerEye = activePos.clone().add(new THREE.Vector3(0, 1.15, 0));
          cachedPoliceLineOfSight = false;
          for (const cop of e.policeAIs) {
            const pursuitPos = cop.getPursuitPosition();
            if (planarDistance(pursuitPos, activePos) > 82) continue;
            const copEye = pursuitPos.clone().add(new THREE.Vector3(0, 1.15, 0));
            const visiblePoint = e.collisionSystem.resolveCameraPosition(playerEye, copEye, 0.08, 0.05);
            if (visiblePoint.distanceTo(copEye) < 1.25) {
              cachedPoliceLineOfSight = true;
              break;
            }
          }
        }
        const nearestPolice = cachedNearestPolice;
        const policeHasLineOfSight = cachedPoliceLineOfSight;

        const secondsSinceCrime = now - e.lastCrimeAt;
        let drainPerSecond = 0;
        if (secondsSinceCrime >= 2.75) {
          if (nearestPolice < 16) drainPerSecond = 0.30;
          else if (nearestPolice < 32) drainPerSecond = policeHasLineOfSight ? 0.70 : 1.10;
          else if (nearestPolice < 55) drainPerSecond = policeHasLineOfSight ? 1.25 : 1.90;
          else if (nearestPolice < 78) drainPerSecond = policeHasLineOfSight ? 1.85 : 2.70;
          else drainPerSecond = 3.25;
        }

        // A short hidden/out-of-range streak earns a modest arcade escape bonus, but
        // there is no separate secret escape timer: only reaching 0% ends the chase.
        const genuinelyHidden = nearestPolice > 58 && !policeHasLineOfSight && secondsSinceCrime > 4.0;
        if (genuinelyHidden) e.hitAndRunEscapeTimer = Math.min(6, e.hitAndRunEscapeTimer + dt);
        else e.hitAndRunEscapeTimer = Math.max(0, e.hitAndRunEscapeTimer - dt * 1.5);
        if (e.hitAndRunEscapeTimer > 2.5) drainPerSecond += 0.65;

        if (drainPerSecond > 0) {
          syncWantedHeat(e.wantedHeat - drainPerSecond * dt, false);
          e.lastWantedDecayAt = now;
        }
        if (e.wantedHeat <= 0.001) clearPolicePursuit(true, true);
      }

      // Police simulation only exists during an actual triggered HIT & RUN. There
      // are no hidden 1–4 star patrols and no police while the meter is merely filling.
      if (!e.hitAndRunActive && (e.policeAIs.length || e.roadblocks.length)) removePolicePursuitObjects();
      if (e.hitAndRunActive && qualityTier !== 'performance') applyQualityTier('performance');
      policeTickAccumulator += dt;
      const policeTickHz = qualityTier === 'performance' ? 15 : 20;
      if (policeTickAccumulator >= 1 / policeTickHz) {
        const policeDt = Math.min(policeTickAccumulator, 0.08);
        policeTickAccumulator = 0;
        const pursuitLevel = !e.hitAndRunActive ? 0 : e.wantedHeat > 72 ? 5 : e.wantedHeat > 46 ? 4 : e.wantedHeat > 22 ? 3 : 2;
        if (wantedRef.current !== pursuitLevel) {
          wantedRef.current = pursuitLevel;
          setWantedLevel(pursuitLevel);
        }
        ensurePoliceCount(pursuitLevel, activePos);
        let nearestCopPos: THREE.Vector3 | undefined = undefined;
        let minCopDist = Infinity;
        for (const cop of e.policeAIs) {
          const d = activePos.distanceTo(cop.position);
          if (d < minCopDist) {
            minCopDist = d;
            nearestCopPos = cop.position;
          }
        }
        soundManager.setSiren(e.hitAndRunActive, nearestCopPos);
        if (e.hitAndRunActive) spawnRoadblock(pursuitLevel, activePos, e.activeCarPhysics?.yaw ?? e.playerMovement.yaw);
        let gotBusted = false;
        const pursuitSpeed = e.activeCarPhysics ? e.activeCarPhysics.speed : 0;
        const pursuitYaw = e.activeCarPhysics?.yaw ?? e.playerMovement.yaw;
        const playerInPoliceWater = isOpenRiverWater(activePos);
        const policePeerPositions = e.policeAIs
          .filter((unit) => unit.isVehicleDriving())
          .map((unit) => unit.getVehiclePosition());
        const pursuitRoadTarget = playerInPoliceWater ? null : e.trafficManager.getNearestRoadPoint(activePos, 25);
        for (let copIndex = 0; copIndex < e.policeAIs.length; copIndex++) {
          const cop = e.policeAIs[copIndex];
          const policeRecoveryActive = Number(cop.mesh.userData.vehicleCollisionRecoveryUntil ?? 0) > now;
          let policePrevious = cop.mesh.userData.vehicleCollisionPreviousPosition as THREE.Vector3 | undefined;
          if (!(policePrevious instanceof THREE.Vector3)) {
            policePrevious = cop.position.clone();
            cop.mesh.userData.vehicleCollisionPreviousPosition = policePrevious;
          } else if (!policeRecoveryActive) policePrevious.copy(cop.position);
          const shoreTarget = playerInPoliceWater ? getPoliceShoreTarget(cop, copIndex, activePos) : null;
          const busted = cop.update(
            policeDt,
            activePos,
            pursuitLevel,
            e.collisionSystem,
            pursuitSpeed,
            pursuitYaw,
            policePeerPositions,
            pursuitRoadTarget,
            {
              playerInWater: playerInPoliceWater,
              isWater: isOpenRiverWater,
              shoreTarget,
              waterSurfaceY: 0.075,
            }
          );
          if (busted) gotBusted = true;

          // Police cars are physical participants in the world, not ghost pursuit
          // markers. At meaningful speed they can knock pedestrians and light street
          // clutter aside using the same bounded cartoon impulses as player vehicles.
          const copAbsSpeed = Math.abs(cop.speed);
          if (cop.isVehicleDriving() && copAbsSpeed > 4.5) {
            const copForward = new THREE.Vector3(Math.sin(cop.yaw), 0, Math.cos(cop.yaw));
            for (const npc of e.npcManager.getNPCsInRadius(cop.position, 2.15)) {
              const lastPoliceHit = Number(npc.mesh.userData.lastPoliceCarHitAt ?? 0);
              if (now - lastPoliceHit < 1.35) continue;
              npc.mesh.userData.lastPoliceCarHitAt = now;
              e.npcManager.blastNPC(
                npc,
                cop.position.clone().addScaledVector(copForward, -0.9),
                THREE.MathUtils.clamp(7 + copAbsSpeed * 0.28, 8, 18),
                THREE.MathUtils.clamp(4.8 + copAbsSpeed * 0.08, 5, 8.5),
                false
              );
              cop.speed *= 0.82;
              break;
            }
            const policePropHits = e.worldInteractions.hitLooseDestructiblesFromVehicle(cop.position, cop.speed, copForward, 2);
            if (policePropHits > 0) cop.speed *= Math.max(0.62, 1 - policePropHits * 0.12);
          }

          if (!e.activeVehicle && cop.isVehicleDriving()) {
            const policeCarPos = cop.getVehiclePosition();
            const dx = e.playerMovement.position.x - policeCarPos.x;
            const dz = e.playerMovement.position.z - policeCarPos.z;
            const dSq = dx * dx + dz * dz;
            if (dSq < 8.0 && cop.ramCooldown <= 0) {
              const d = Math.max(0.001, Math.sqrt(dSq));
              const contactNx = dx / d;
              const contactNz = dz / d;
              const forwardX = Math.sin(cop.yaw);
              const forwardZ = Math.cos(cop.yaw);
              const vehicleVx = forwardX * cop.speed;
              const vehicleVz = forwardZ * cop.speed;
              const vehicleIntoPlayerSpeed = vehicleVx * contactNx + vehicleVz * contactNz;
              const relativeClosingSpeed =
                (vehicleVx - e.playerMovement.velocity.x) * contactNx +
                (vehicleVz - e.playerMovement.velocity.z) * contactNz;

              // Police use the same causality rule as civilian traffic: proximity or
              // the player running into the rear/side of a cruiser is NOT a car hit.
              if (vehicleIntoPlayerSpeed >= 4.0 && relativeClosingSpeed >= 4.8) {
                cop.ramCooldown = 1.25;
                const planarVehicleSpeed = Math.max(0.001, Math.hypot(vehicleVx, vehicleVz));
                const knock = THREE.MathUtils.clamp(1.2 + relativeClosingSpeed * 0.12, 1.6, 4.2);
                e.playerMovement.velocity.x += (vehicleVx / planarVehicleSpeed) * knock;
                e.playerMovement.velocity.z += (vehicleVz / planarVehicleSpeed) * knock;
                e.playerMovement.velocity.y = Math.max(
                  e.playerMovement.velocity.y,
                  THREE.MathUtils.clamp(1.5 + relativeClosingSpeed * 0.07, 2.0, 4.2)
                );
                e.playerMovement.isGrounded = false;
                damagePlayer(
                  THREE.MathUtils.clamp(2 + (relativeClosingSpeed - 4.8) * 0.42, 2, 8),
                  'controlled police impact'
                );
                cop.speed *= 0.45;
              }
            }
          }
        }

        resolvePoliceVehicleContacts();
        if (gotBusted && !bustedRef.current) handlePlayerBusted();
      }

      interactionAccumulator += dt;
      if (interactionAccumulator >= 0.10) {
        interactionAccumulator = 0;
        updateInteractionPrompt(activePos);
      }

      e.autosaveElapsed += dt;
      if (e.autosaveElapsed >= SAVE_INTERVAL) {
        e.autosaveElapsed = 0;
        saveNow();
      }

      e.lastUiUpdate += dt;
      if (e.lastUiUpdate >= UI_INTERVAL) {
        e.lastUiUpdate = 0;
        const uiPos = getActivePosition();
        updateWorldProgress(uiPos);
        setWorldGoal(getWorldGoalView());
        setPlayerPos({ x: uiPos.x, y: uiPos.y, z: uiPos.z });
        setPlayerYaw(e.activeAircraft?.yaw ?? e.activeCarPhysics?.yaw ?? e.playerMovement.yaw);
        setPokemonWater(waterRef.current);
        setWantedHeat(Math.round(e.wantedHeat));
        setPolicePositions(e.policeAIs.map((cop) => {
          const p = cop.getPursuitPosition();
          return { x: p.x, z: p.z };
        }));
        setAshBattleState({ ...e.ashBattle.state });
        setCharizardFlightActive(Boolean(e.charizardFlightActive));
        setGrabbedNpcId(e.grabbedNpcId ?? null);
        if (e.activeAircraft) {
          const plane = e.activeAircraft;
          const planeGround = e.collisionSystem.getGroundHeightNear(plane.position.x, plane.position.z, plane.position.y, 0.12, 12, 260);
          setAircraftHud({
            name: plane.name, kind: plane.kind, speed: plane.speed, maxSpeed: plane.maxSpeed,
            throttle: plane.throttle, altitude: Math.max(0, plane.position.y - planeGround - plane.gearHeight),
            verticalSpeed: plane.verticalSpeed, onGround: plane.onGround, damage: plane.damage, crashed: plane.crashed,
          });
          setParachuteHud(null);
          setCurrentVehicleInfo(null);
        } else if (e.parachuteController) {
          const parachuteGround = e.collisionSystem.getGroundHeightNear(
            e.playerMovement.position.x, e.playerMovement.position.z, e.playerMovement.position.y, 0.12, 1.2, 400
          );
          setAircraftHud(null);
          setCurrentVehicleInfo(null);
          setParachuteHud({
            mode: e.parachuteController.mode,
            altitude: Math.max(0, e.playerMovement.position.y - parachuteGround),
            verticalSpeed: e.playerMovement.velocity.y,
            deployment: e.parachuteController.deployment,
          });
        } else if (e.activeCarPhysics && e.activeVehicle) {
          setAircraftHud(null);
          setParachuteHud(null);
          setCurrentVehicleInfo({
            type: e.activeVehicle.type ?? 'civilian_sedan',
            name: e.activeVehicle.name ?? 'Vehicle',
            speed: e.activeCarPhysics.speed,
            maxSpeed: e.activeCarPhysics.maxSpeed,
            boostFuel: e.activeCarPhysics.boostFuel,
            isDrifting: e.activeCarPhysics.isDrifting,
            isBoosting: e.activeCarPhysics.isBoosting,
            damage: e.activeVehicle.damage ?? 0,
            wrecked: !!e.activeVehicle.wrecked,
          });
        } else {
          setAircraftHud(null);
          setParachuteHud(null);
          setCurrentVehicleInfo(null);
        }
      }

      // Day/night lighting changes slowly, so updating it four times per second
      // looks identical while avoiding needless Color allocations every frame.
      dayNightAccumulator += dt;
      if (dayNightAccumulator >= 0.25) {
        dayNightAccumulator = 0;
        const cycle = (time * 0.000012) % 1;
        const sunset = Math.max(0, Math.sin(cycle * Math.PI * 2 - Math.PI * 0.25));
        sun.intensity = 2.05 + sunset * 0.78;
        hemisphere.intensity = 1.08 + sunset * 0.14;
        skyFill.intensity = 0.24 + sunset * 0.08;
        const sunsetBlend = Math.max(0, sunset - 0.55) * 0.5;
        skyWorking.copy(skyDay).lerp(skySunset, sunsetBlend);
        cloudWorking.copy(cloudDay).lerp(cloudSunset, Math.min(1, sunsetBlend * 1.8));
        worldCloudMat.color.copy(cloudWorking);
        if (springfieldCloudMat) springfieldCloudMat.color.copy(cloudWorking);
        skyUniforms.zenithColor.value.copy(skyWorking).multiplyScalar(0.92);
        skyUniforms.horizonColor.value.copy(skyWorking).lerp(skyHorizonDay, 0.46);
        skyUniforms.groundColor.value.setHex(0x6f9d55).lerp(skyGroundSunset, sunsetBlend * 0.45);
        skyUniforms.sunStrength.value = 0.70 + sunset * 0.32;
        scene.background = skyWorking;
        if (scene.fog) scene.fog.color.copy(skyWorking);
      }

      // Keep the atmospheric dome centred on the active camera so it never clips at
      // the outer edges of the playable world, even on the shorter performance far plane.
      if (multiplayerRef.current.state.isInRoom) {
        const toothlessNpc = e.npcManager.getNPCById('cameo_toothless');
        multiplayerRef.current.update(
          dt,
          {
            position: e.playerMovement.position,
            yaw: e.playerMovement.yaw,
            animState: e.playerMovement.animState,
            isSprinting: e.playerMovement.isSprinting,
            isJumping: !e.playerMovement.isGrounded,
            characterId: selectedPokemonRef.current,
            inVehicle: !!e.activeVehicle,
            vehicleId: e.activeVehicle?.id || null,
            inAircraft: !!e.activeAircraft,
            aircraftId: e.activeAircraft?.id || null,
            onToothless: e.toothlessMounted,
            toothlessMounting: e.toothlessMounting,
            toothlessState: (e.toothlessMounted || e.toothlessMounting) && toothlessNpc ? {
              x: toothlessNpc.mesh.position.x,
              y: toothlessNpc.mesh.position.y,
              z: toothlessNpc.mesh.position.z,
              yaw: e.toothlessYaw,
              pitch: toothlessNpc.mesh.rotation.x,
              roll: toothlessNpc.mesh.rotation.z,
              speed: e.toothlessFlightSpeed,
              verticalSpeed: e.toothlessVerticalSpeed,
              wingFlap: Math.sin(time * 0.008 * 8.0),
              airborne: toothlessNpc.mesh.position.y > 0.3,
            } : null,
            hp: hpRef.current,
            activeVehicle: e.activeVehicle,
            activeAircraft: e.activeAircraft,
          },
          camera,
          e.vehicles,
          e.airportAircraft,
          toothlessNpc
        );
      }

      skyDome.position.copy(camera.position);

      const inAir = !!(
        e.activeAircraft ||
        e.charizardFlightActive ||
        (e.playerMovement && e.playerMovement.position.y > 25)
      );
      const targetFar = inAir
        ? (qualityTier === 'high' ? 780 : qualityTier === 'balanced' ? 620 : 460)
        : (qualityTier === 'high' ? 460 : qualityTier === 'balanced' ? 350 : 280);
      if (Math.abs(camera.far - targetFar) > 1) {
        camera.far = targetFar;
        camera.updateProjectionMatrix();
      }
      // Spread first-use GPU uploads over healthy frames instead of allowing a new
      // district to upload hundreds of buffers in one 300-1200 ms hitch. Never warm
      // while the game is already struggling or during an active crash/death sequence.
      if (liveGpuWarmupEnabled && gpuWarmupCursor < gpuWarmupQueue.length && lastMeasuredFps >= 55 && lastRenderSubmitMs < 22 && !e.deathSequenceActive) {
        runGpuWarmupBatch();
      }
      framePostWorldMs = performance.now() - framePhaseStarted;
      const renderSubmitStarted = performance.now();
      renderer.render(scene, camera);
      lastRenderSubmitMs = performance.now() - renderSubmitStarted;
      if (resourceBaselineGeometries === null && time >= resourceBaselineCaptureAt) {
        resourceBaselineGeometries = renderer.info.memory.geometries;
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        resourceBaselineHeapMb = memory ? memory.usedJSHeapSize / (1024 * 1024) : null;
      }
      lastFrameCpuMs = performance.now() - frameCpuStarted;
      const accountedFrameMs = framePreControlMs + frameControlCameraMs + frameVisibilityLodMs + frameWorldSimulationMs + framePostWorldMs + lastRenderSubmitMs;
      lastFrameCpuBreakdown = {
        preControl: framePreControlMs,
        controlCamera: frameControlCameraMs,
        visibilityLod: frameVisibilityLodMs,
        worldSimulation: frameWorldSimulationMs,
        postWorld: framePostWorldMs,
        render: lastRenderSubmitMs,
        other: Math.max(0, lastFrameCpuMs - accountedFrameMs),
      };
      publishDeveloperDebug(time, frameMs, false);

      // Lightweight profiler telemetry. This is deliberately console-only so the HUD
      // remains cheap, but it exposes draw calls/triangles/memory when diagnosing a
      // specific location without needing a browser extension.
      perfTelemetryAccumulator += dt;
      if (perfTelemetryAccumulator >= 4.0) {
        perfTelemetryAccumulator = 0;
        const info = renderer.info;
        console.debug('[Performance]', {
          tier: qualityTier,
          calls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          visibleNPCs: e.npcManager.npcs.reduce((count, npc) => count + (npc.mesh.visible ? 1 : 0), 0),
          visibleVehicles: e.vehicles.reduce((count, vehicle) => count + (vehicle.mesh.visible ? 1 : 0), 0),
          colliders: e.collisionSystem.colliders.length,
          walkableSurfaces: e.collisionSystem.walkableSurfaces.length,
          maxFrameMs: Number(perfMaxFrameMs.toFixed(1)),
          slowFramesOver34ms: perfSlowFrameCount,
        });
        perfMaxFrameMs = 0;
        perfSlowFrameCount = 0;
      }

      fpsFrames += 1;
      const fpsElapsed = time - fpsWindowStart;
      if (fpsElapsed >= 500) {
        const measuredFps = Math.round((fpsFrames * 1000) / Math.max(1, fpsElapsed));
        lastMeasuredFps = measuredFps;
        setFps(measuredFps);

        // Hysteresis is deliberate: quality only changes after sustained poor/good
        // performance, preventing resolution from bouncing up and down every second.
        if (measuredFps < 34) {
          lowFpsWindows += 2;
          highFpsWindows = 0;
        } else if (measuredFps < 48) {
          lowFpsWindows += 1;
          highFpsWindows = 0;
        } else if (measuredFps >= 57) {
          highFpsWindows += 1;
          lowFpsWindows = Math.max(0, lowFpsWindows - 1);
        } else {
          lowFpsWindows = Math.max(0, lowFpsWindows - 1);
          highFpsWindows = 0;
        }

        if (time >= qualityChangeCooldownUntil) {
          if (lowFpsWindows >= 6 && qualityTier !== 'performance') {
            applyQualityTier('performance');
            lowFpsWindows = 0;
            highFpsWindows = 0;
            qualityChangeCooldownUntil = time + 5000;
          } else if (lowFpsWindows >= 4 && qualityTier === 'high') {
            applyQualityTier('balanced');
            lowFpsWindows = 0;
            qualityChangeCooldownUntil = time + 4000;
          } else if (highFpsWindows >= 30 && qualityTier === 'performance') {
            applyQualityTier('balanced');
            highFpsWindows = 0;
            qualityChangeCooldownUntil = time + 12000;
          } else if (highFpsWindows >= 40 && qualityTier === 'balanced') {
            applyQualityTier('high');
            highFpsWindows = 0;
            qualityChangeCooldownUntil = time + 12000;
          }
        }

        fpsFrames = 0;
        fpsWindowStart = time;
      }
    };
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      saveNow();
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', clearHeldInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeunload', saveNow);
      soundManager.stopEngine();
      soundManager.stopFountainAmbience();
      particles.cleanup();
      debugRecoverRef.current = () => {};

      // Vite hot-reloads this component constantly while the game is being built.
      // Three.js does not automatically release GPU buffers/materials on unmount,
      // so repeated code replacements used to leak resources until a full refresh.
      const disposedGeometries = new Set<THREE.BufferGeometry>();
      const disposedMaterials = new Set<THREE.Material>();
      const disposedTextures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        const renderable = object as THREE.Mesh | THREE.Points | THREE.Sprite;
        const geometry = (renderable as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        if (geometry && !disposedGeometries.has(geometry)) {
          disposedGeometries.add(geometry);
          geometry.dispose();
        }

        const materialValue = (renderable as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        const materials = Array.isArray(materialValue) ? materialValue : materialValue ? [materialValue] : [];
        for (const material of materials) {
          if (disposedMaterials.has(material)) continue;
          disposedMaterials.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
              disposedTextures.add(value);
              value.dispose();
            }
          }
          material.dispose();
        }
      });

      environmentRT.dispose();
      environmentSourceTexture.dispose();
      if (mountRef.current?.contains(renderer.domElement)) mountRef.current.removeChild(renderer.domElement);
      renderer.renderLists.dispose();
      gpuWarmupTarget.dispose();
      renderer.dispose();
      multiplayerRef.current.destroy();
      footballManager.dispose();
      engineRef.current = null;
    };
  }, []);

  const switchStarterPokemon = (newId: PokemonCharacterId) => {
    // React/UI guard mirrors the engine-level lock. A stale or externally-triggered
    // HUD callback cannot select a Pokémon before Oak's starter confirmation.
    if (!hasChosenStarterRef.current) return;
    requestSwitchRef.current(newId);
  };

  const handleRestartWorld = () => {
    const engine = engineRef.current;
    if (!engine || worldRestartPendingRef.current) return;

    // Restart reconstructs the entire Three.js world once rather than manually
    // re-spawning entities into the existing scene. That guarantees moved props,
    // traffic, NPCs, trains, police, loose physics and temporary combat objects are
    // restored without ever duplicating an existing runtime object.
    //
    // Preserve permanent progression/unlocks, but write the deliberate Oak's Lab
    // restart spawn and clear only temporary world/challenge fields.
    const permanentSave: GameSaveState = {
      hasChosenStarter: hasChosenStarterRef.current,
      currentPokemon: selectedPokemonRef.current,
      unlockedGeodude: unlockedGeodudeRef.current,
      ashDefeated: !!engine.ashBattle.state.allDefeated,
      treesGrown: engine.worldInteractions.grownTrees.filter((tree) => !tree.destroyed).length,
      playerPos: { x: OAK_LAB_START.x, y: OAK_LAB_START.y, z: OAK_LAB_START.z },
      playerRotationY: OAK_LAB_START.yaw, // -Z: clear view toward the three starter Pokémon.
      grownTrees: engine.worldInteractions.getGrownTreePositions(),
      worldProgress: {
        ...worldProgressRef.current,
        visitedLandmarks: [...worldProgressRef.current.visitedLandmarks],
        completedGoals: [...worldProgressRef.current.completedGoals],
        // These are active-session/challenge fields, not permanent unlocks.
        chaosEscapeArmed: false,
        roadTripOrigin: null,
        jailbreakActive: false,
      },
    };

    worldRestartPendingRef.current = true;
    if (temporaryNotificationTimerRef.current !== null) {
      window.clearTimeout(temporaryNotificationTimerRef.current);
      temporaryNotificationTimerRef.current = null;
    }
    saveGame(permanentSave);
    window.location.reload();
  };

  const handleResetPlayer = () => {
    const engine = engineRef.current;
    if (!engine) return;

    // "Reset Pos" is intentionally CAMERA-ONLY. It must never move the player,
    // vehicle, aircraft, parachute, NPCs or any gameplay state. The button simply
    // restores a predictable third-person camera zoom/angle around the entity the
    // player is currently controlling.
    const focusedElement = document.activeElement;
    if (focusedElement instanceof HTMLButtonElement) focusedElement.blur();

    const resetCameraDistance = 6.5;
    const resetYaw = engine.activeAircraft?.yaw
      ?? engine.activeCarPhysics?.yaw
      ?? engine.activeVehicle?.yaw
      ?? engine.parachuteController?.yaw
      ?? engine.playerMovement.yaw;

    engine.cameraAngle = resetYaw;
    engine.cameraPitch = 0.35;
    engine.cameraDistance = resetCameraDistance;
    engine.cameraTargetDistance = resetCameraDistance;
    engine.cameraShake = 0;

    // Snap the current camera immediately so the reset feels instant. State-specific
    // chase cameras (car/aircraft/parachute/train) may take over again on the next
    // simulation frame, but no world transform or controller state is changed here.
    const focus = engine.activeAircraft?.position.clone()
      ?? engine.activeCarPhysics?.position.clone()
      ?? engine.activeVehicle?.mesh.position.clone()
      ?? engine.playerMovement.position.clone();
    const lookHeight = engine.activeAircraft
      ? Math.max(1.6, engine.activeAircraft.length * 0.035)
      : engine.activeVehicle
        ? 1.2
        : engine.currentPokemonId === 'charizard'
          ? 1.38
          : 1.1;
    const lookTarget = focus.clone().add(new THREE.Vector3(0, lookHeight, 0));
    const desiredCamera = new THREE.Vector3(
      focus.x - Math.sin(engine.cameraAngle) * Math.cos(engine.cameraPitch) * resetCameraDistance,
      focus.y + Math.sin(engine.cameraPitch) * resetCameraDistance + (engine.currentPokemonId === 'charizard' ? 1.25 : 1.0),
      focus.z - Math.cos(engine.cameraAngle) * Math.cos(engine.cameraPitch) * resetCameraDistance,
    );
    const snappedCamera = engine.collisionSystem.resolveCameraPosition(lookTarget, desiredCamera, 0.26, 0.20);
    engine.camera.position.copy(snappedCamera);
    engine.camera.fov = 60;
    engine.camera.updateProjectionMatrix();
    engine.camera.lookAt(lookTarget);

    playSoundEffect('click');
  };

  const handleFastTravel = (target: {
    x: number;
    z: number;
    name?: string;
    travelX?: number;
    travelZ?: number;
    travelYaw?: number;
    /** True for a raw click on the TAB map rather than a named POI. */
    mapClick?: boolean;
  }) => {
    handleFastTravelRef.current = handleFastTravel;
    // Fast-travel controls are clickable HTML elements. Browsers keep a clicked
    // button focused, and Space activates the focused button again on key-up.
    // That used to make a normal jump tap immediately re-fire fast travel and
    // snap the character back to the ground. Give keyboard ownership straight
    // back to gameplay before touching any movement/teleport state.
    if (typeof document !== 'undefined') {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) focused.blur();
    }

    const engine = engineRef.current;
    if (!engine) return;
    if (engine.activeAircraft) {
      showTemporaryNotification('Aircraft', 'Land or jump out before fast travelling.');
      return;
    }
    const parachutingDuringTravel = engine.parachuteController;
    // Fast travel remains available during freefall/parachuting. Preserve the
    // player's current height above the local ground so a map warp moves the
    // airborne player horizontally to the new district instead of cancelling the
    // parachute or snapping them onto the ground.
    let parachuteTravelAltitude = 0;
    if (parachutingDuringTravel) {
      const currentParachuteGround = engine.collisionSystem.getGroundHeightNear(
        engine.playerMovement.position.x,
        engine.playerMovement.position.z,
        engine.playerMovement.position.y,
        0.12,
        1.2,
        400,
      );
      parachuteTravelAltitude = Math.max(0.5, engine.playerMovement.position.y - currentParachuteGround);
    }

    // Fast travel must preserve the player's current third-person camera setup.
    // The old travel code forced cameraDistance/cameraTargetDistance/cameraPitch
    // back to fixed defaults (6.5 / 6.5 / 0.22), which made every minimap or
    // TAB-map warp look like Reset Pos had also been pressed. Snapshot the live
    // camera settings before any teleport work and restore the same relative view
    // at the destination. Named POIs may still change cameraAngle so the character
    // and camera face the destination together, but zoom and pitch belong to the
    // player and must survive travel unchanged.
    const preTravelCameraDistance = engine.cameraDistance;
    const preTravelCameraTargetDistance = engine.cameraTargetDistance;
    const preTravelCameraPitch = engine.cameraPitch;

    // Fast travel is NOT Reset Pos. The manual Reset Pos checkpoint must remain
    // byte-for-byte the same as it was BEFORE the travel began. Do not capture the
    // player's current position here and do not rebase it to the destination. The
    // travel lock exists only to stop the normal grounded checkpoint updater from
    // overwriting that already-established manual checkpoint after we arrive.
    //
    // This is intentionally strict: map clicks, minimap pins, landmark Warps and
    // quick-travel buttons may move the player, but NONE of them are allowed to
    // write resetPosPosition/resetPosYaw. Only handleResetPlayer may consume/rebase
    // that manual checkpoint and unlock normal checkpoint tracking again.
    if (!engine.resetPosLockedByTravel) {
      engine.resetPosLockedByTravel = true;
    }

    // Drop stale gameplay keys at the teleport boundary too. This mirrors Reset
    // Pos and prevents a mouse-triggered travel from inheriting an old Space/WASD
    // state into the freshly-reset jump controller.
    for (const code of Object.keys(engine.keys)) engine.keys[code] = false;

    // Map pins describe the POI itself, while travelX/travelZ describe an authored
    // arrival point. Buildings without an authored point still use their nearest
    // real doorway so fast travel never drops the player into a wall/counter/roof.
    const landmarkCenter = new THREE.Vector3(target.x, 0.12, target.z);
    const isMapClick = target.mapClick === true;
    const hasDedicatedArrival = Number.isFinite(target.travelX) && Number.isFinite(target.travelZ);
    let requested = hasDedicatedArrival
      ? new THREE.Vector3(target.travelX!, 0.12, target.travelZ!)
      : landmarkCenter.clone();

    const garageCenter = engine.playerGaragePos;
    const isPlayerGarageTravel =
      !hasDedicatedArrival && (
        Math.hypot(target.x - garageCenter.x, target.z - garageCenter.z) < 5.0 ||
        /hero garage|player house/i.test(target.name ?? '')
      );

    let closestDoor: Door | null = null;
    if (isPlayerGarageTravel) {
      requested.set(garageCenter.x, 0.18, garageCenter.z + (engine.activeVehicle ? 17.0 : 14.0));
    } else if (!hasDedicatedArrival && !isMapClick) {
      let closestDoorDist = 18;
      for (const door of engine.doors) {
        const d = Math.hypot(door.position.x - target.x, door.position.z - target.z);
        if (d < closestDoorDist) {
          closestDoorDist = d;
          closestDoor = door;
        }
      }
      if (closestDoor) {
        const outward = closestDoor.position.clone().sub(landmarkCenter).setY(0);
        if (outward.lengthSq() < 0.01) {
          outward.set(Math.sin(closestDoor.group.rotation.y), 0, Math.cos(closestDoor.group.rotation.y));
        } else {
          outward.normalize();
        }
        requested.copy(closestDoor.position).addScaledVector(outward, engine.activeVehicle ? 5.0 : 3.0);
      }
    }

    // Fast travel has no previous floor context, so use the TOPMOST non-roof authored
    // walkable at the selected X/Z. `getGroundHeightNear()` is intentionally biased
    // toward the caller's current height and previously caused the centre-bridge pin
    // to choose the river/terrain under the raised deck. This spawn-oriented sampler
    // correctly resolves bridge decks, roads, plazas and normal ground.
    requested.y = engine.collisionSystem.getGroundHeight(requested.x, requested.z, 0.12, false);

    // Final clearance pass handles street furniture, fences, traffic props and odd
    // geometry around the arrival. Preserve the exact clicked/authored coordinate
    // whenever it is already occupiable; only search outward when that exact point
    // would put the player/car inside solid geometry.
    const radius = engine.activeVehicle ? 2.15 : 0.78;
    const bodyHeight = engine.activeVehicle ? 2.4 : 2.0;
    const requestedIsSafe = engine.collisionSystem.canOccupy(requested, radius, bodyHeight);
    const safe = requestedIsSafe
      ? requested.clone()
      : (
          engine.collisionSystem.findSafePositionOnLevel(
            requested,
            radius,
            bodyHeight,
            engine.activeVehicle ? 16 : 11,
            engine.activeVehicle ? 1.6 : 1.8
          ) ??
          engine.collisionSystem.findSafePosition(
            requested,
            radius,
            bodyHeight,
            engine.activeVehicle ? 16 : 11
          )
        );

    // Named destinations face their landmark/building (or an explicitly-authored
    // heading). A raw map click has no semantic target, so preserve the player's
    // current heading rather than making them face an arbitrary compass direction.
    const currentTravelYaw = engine.activeVehicle && engine.activeCarPhysics
      ? engine.activeCarPhysics.yaw
      : engine.playerMovement.yaw;
    const faceYaw = isMapClick
      ? currentTravelYaw
      : Number.isFinite(target.travelYaw)
      ? target.travelYaw!
      : Math.atan2(target.x - safe.x, target.z - safe.z);

    const playerTravelPosition = safe.clone();
    if (parachutingDuringTravel) {
      playerTravelPosition.y = safe.y + parachuteTravelAltitude;
    }

    if (engine.activeVehicle && engine.activeCarPhysics) {
      worldProgressRef.current.roadTripOrigin = null;
      engine.activeCarPhysics.position.set(safe.x, safe.y + 0.08, safe.z);
      engine.activeCarPhysics.speed = 0;
      engine.activeCarPhysics.velocity.set(0, 0, 0);
      engine.activeCarPhysics.verticalVelocity = 0;
      engine.activeCarPhysics.yaw = faceYaw;
      engine.activeVehicle.mesh.position.copy(engine.activeCarPhysics.position);
      engine.activeVehicle.mesh.rotation.y = faceYaw;
    } else {
      engine.charizardFlightActive = false;
      engine.charizardFlightSpeed = 0;
      engine.charizardVerticalSpeed = 0;
      engine.playerMesh.userData.charizardFlying = false;
      if (parachutingDuringTravel) {
        // Keep the existing controller/mode/velocity alive. PlayerMovement is only
        // the shared transform while airborne, so reset it to the new position as
        // ungrounded and let the parachute controller resume on the next frame.
        engine.playerMovement.resetForTeleport(playerTravelPosition, faceYaw, false);
        parachutingDuringTravel.yaw = faceYaw;
        engine.playerMesh.position.copy(playerTravelPosition);
        engine.playerMesh.rotation.y = faceYaw;
        if (parachutingDuringTravel.mode === 'parachute') {
          parachutingDuringTravel.canopy.position.copy(playerTravelPosition).add(new THREE.Vector3(0, 5.05, 0));
          parachutingDuringTravel.canopy.rotation.y = faceYaw;
        }
      } else {
        // Reuse the same complete teleport reset used by Reset Pos so fast travel
        // cannot leave jump/stomp/grounded state behind.
        engine.playerMovement.resetForTeleport(safe, faceYaw, true);
        engine.playerMesh.position.copy(safe);
        engine.playerMesh.rotation.y = faceYaw;
      }
    }

    // Re-anchor the camera BEHIND the arrival heading without changing the user's
    // zoom or pitch. Reset Pos is the only manual action that is allowed to restore
    // the default camera distance/pitch. Fast travel merely moves the existing
    // third-person rig to the new character position. This applies equally to
    // minimap pins, full-map pins, raw map clicks and quick-travel buttons.
    //
    // `cameraAngle` intentionally follows `faceYaw` for named destinations so a
    // player arriving at a building still sees that building in front of them.
    // Distance/target-distance/pitch, however, remain byte-for-byte what they were
    // immediately before travel.
    const focus = engine.activeVehicle && engine.activeCarPhysics
      ? engine.activeCarPhysics.position.clone()
      : playerTravelPosition.clone();
    const focusHeight = engine.activeVehicle ? 1.45 : (engine.currentPokemonId === 'charizard' ? 1.38 : 1.1);
    engine.cameraAngle = faceYaw;
    engine.cameraPitch = preTravelCameraPitch;
    engine.cameraDistance = preTravelCameraDistance;
    engine.cameraTargetDistance = preTravelCameraTargetDistance;
    engine.cameraShake = 0;
    const lookTarget = focus.clone().add(new THREE.Vector3(0, focusHeight, 0));
    const desiredCamera = new THREE.Vector3(
      focus.x - Math.sin(engine.cameraAngle) * Math.cos(engine.cameraPitch) * engine.cameraDistance,
      focus.y + Math.sin(engine.cameraPitch) * engine.cameraDistance + (engine.activeVehicle ? 1.2 : 1.0),
      focus.z - Math.cos(engine.cameraAngle) * Math.cos(engine.cameraPitch) * engine.cameraDistance,
    );
    engine.camera.position.copy(engine.collisionSystem.resolveCameraPosition(lookTarget, desiredCamera, 0.26, 0.20));
    engine.camera.lookAt(lookTarget);

    setPlayerPos({ x: playerTravelPosition.x, y: playerTravelPosition.y, z: playerTravelPosition.z });
    setPlayerYaw(faceYaw);
    if (target.name) {
      showTemporaryNotification(
        'World Map',
        isMapClick
          ? `Fast travelled to X ${Math.round(safe.x)}, Z ${Math.round(safe.z)}.`
          : `Fast travelled safely near ${target.name}.`
      );
    }
    // Some browsers can restore focus while React is closing the map overlay.
    // Re-check on the next frame so Space can only reach the game after travel.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      window.requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement) focused.blur();
      });
    }

    playSoundEffect('fanfare');
  };
  handleFastTravelRef.current = handleFastTravel;

  const handleToggleMute = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  const handleResumeGame = () => {
    pauseRef.current = false;
    developerDebugOpenRef.current = false;
    setDeveloperDebugOpen(false);
    setShowMultiplayerModal(false);
    setIsPaused(false);
  };

  const handleTogglePause = () => {
    togglePauseRef.current();
  };

  const handleCreateMultiplayerRoom = (playerName: string) => {
    const e = engineRef.current;
    const initialPos = {
      x: e?.playerMovement.position.x ?? 200,
      y: e?.playerMovement.position.y ?? 0.5,
      z: e?.playerMovement.position.z ?? -174,
      yaw: e?.playerMovement.yaw ?? 0,
    };
    multiplayerRef.current.createRoom(playerName, selectedPokemonRef.current, initialPos);
  };

  const handleJoinMultiplayerRoom = (code: string, playerName: string) => {
    const e = engineRef.current;
    const initialPos = {
      x: e?.playerMovement.position.x ?? 200,
      y: e?.playerMovement.position.y ?? 0.5,
      z: e?.playerMovement.position.z ?? -174,
      yaw: e?.playerMovement.yaw ?? 0,
    };
    multiplayerRef.current.joinRoom(code, playerName, selectedPokemonRef.current, initialPos);
  };

  const handleLeaveMultiplayerRoom = () => {
    multiplayerRef.current.leaveRoom();
    setShowMultiplayerModal(false);
  };

  const handleToggleDeveloperDebug = () => {
    const next = !developerDebugOpenRef.current;
    developerDebugOpenRef.current = next;
    setDeveloperDebugOpen(next);
    if (next && debugSnapshotRef.current) setDebugSnapshot(debugSnapshotRef.current);
  };

  const handleRecoverCameraAndWorld = () => {
    debugRecoverRef.current();
    if (debugSnapshotRef.current) setDebugSnapshot(debugSnapshotRef.current);
  };

  const handleCopyDebugSnapshot = async () => {
    const snapshot = debugSnapshotRef.current ?? debugSnapshot;
    if (!snapshot) return;

    const text = JSON.stringify(snapshot, null, 2);
    let copied = false;

    // Preferred path: modern Clipboard API. Chrome only exposes this reliably in a
    // secure context and may reject it depending on local permissions, so failure
    // here must not make the button silently useless.
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (error) {
      console.debug('[Developer Debug] Clipboard API rejected; trying legacy copy fallback.', error);
    }

    // Fallback for localhost / browser permission edge cases. The textarea exists
    // only for the synchronous copy command and is removed immediately afterwards.
    if (!copied && typeof document !== 'undefined') {
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.setAttribute('aria-hidden', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-10000px';
      textarea.style.top = '0';
      textarea.style.width = '1px';
      textarea.style.height = '1px';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      try {
        copied = document.execCommand('copy');
      } catch (error) {
        console.debug('[Developer Debug] Legacy clipboard fallback failed.', error);
      } finally {
        textarea.remove();
        previousFocus?.focus({ preventScroll: true });
      }
    }

    if (copied) {
      setCopySnapshotStatus('copied');
      showTemporaryNotification('Developer Debug', 'Snapshot copied to clipboard. Paste it into ChatGPT if the glitch happens again.');
    } else {
      setCopySnapshotStatus('failed');
      console.debug('[Developer Debug Snapshot]', snapshot);
      showTemporaryNotification('Developer Debug', 'Clipboard copy was blocked by the browser. Snapshot was printed to the console.');
    }

    window.setTimeout(() => setCopySnapshotStatus('idle'), 1800);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      <div
        ref={mountRef}
        className={`w-full h-full cursor-grab active:cursor-grabbing ${isArcadeActive ? 'hidden pointer-events-none' : ''}`}
      />

      {deathPresentation !== 'none' && (
        <div
          className="pointer-events-none absolute inset-0 z-[95] flex items-center justify-center transition-all duration-700"
          style={{
            backdropFilter: deathPresentation === 'hospital' ? 'grayscale(0.35) saturate(0.8)' : 'grayscale(1) saturate(0.05)',
            WebkitBackdropFilter: deathPresentation === 'hospital' ? 'grayscale(0.35) saturate(0.8)' : 'grayscale(1) saturate(0.05)',
            backgroundColor:
              deathPresentation === 'fade'
                ? 'rgba(0,0,0,1)'
                : deathPresentation === 'hospital'
                ? 'rgba(0,0,0,0.18)'
                : 'rgba(0,0,0,0.16)',
          }}
        >
          {(deathPresentation === 'death' || deathPresentation === 'fade') && (
            <div className="text-center drop-shadow-[0_6px_18px_rgba(0,0,0,0.95)]">
              <div className="text-[clamp(4rem,10vw,9rem)] leading-none font-black tracking-[0.12em] text-red-500/95">
                WASTED
              </div>
              <div className="mt-4 text-sm md:text-lg font-bold uppercase tracking-[0.35em] text-white/70">
                {pokemonName(selectedPokemonId)} fainted spectacularly
              </div>
            </div>
          )}
          {deathPresentation === 'hospital' && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-xl border border-cyan-200/30 bg-slate-950/70 px-5 py-3 text-center shadow-2xl backdrop-blur-md">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Goldenrod City Hospital</div>
              <div className="mt-1 text-sm font-semibold text-white/85">Recovering... {pokemonHp}%</div>
            </div>
          )}
        </div>
      )}

      {!isArcadeActive && (
        <GameHUD
          currentPokemon={{
            id: selectedPokemonId,
            name: hasChosenStarter ? pokemonName(selectedPokemonId) : 'Choose a Starter',
            level: 25,
            hp: pokemonHp,
            maxHp: 100,
            waterLevel: pokemonWater,
          }}
          hasChosenStarter={hasChosenStarter}
          inVehicle={inVehicle}
          currentVehicle={currentVehicleInfo}
          aircraft={aircraftHud}
          parachute={parachuteHud}
          wantedHeat={wantedHeat}
          hitAndRunActive={hitAndRunActive}
          hitAndRunWarning={hitAndRunWarning}
          fps={fps}
          isBusted={isBusted}
          interactionPrompt={interactionPrompt}
          activeDialogue={activeDialogue}
          onDismissDialogue={dismissActiveDialogue}
          starterSelectionCandidate={starterSelectionCandidate}
          onConfirmStarterSelection={() => confirmStarterSelectionRef.current()}
          onCancelStarterSelection={() => {
            starterSelectionCandidateRef.current = null;
            setStarterSelectionCandidate(null);
          }}
          temporaryNotification={temporaryNotification}
          onDismissTemporaryNotification={dismissTemporaryNotification}
          ashBattleState={ashBattleState}
          showAshVictory={showAshVictory}
          onDismissAshVictory={dismissAshVictory}
          playerPos={playerPos}
          playerYaw={playerYaw}
          landmarks={landmarks}
          worldMap={worldMap}
          policePositions={policePositions}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onEnterArcade={() => enterArcadeModeRef.current()}
          onResetPlayer={handleResetPlayer}
          onRestartWorld={handleRestartWorld}
          onFastTravel={handleFastTravel}
          onSelectStarter={switchStarterPokemon}
          unlockedGeodude={unlockedGeodude}
          treesGrownCount={treesGrownCount}
          worldGoal={worldGoal}
          onTogglePause={handleTogglePause}
          isPaused={isPaused}
          isMultiplayerActive={mpState.isInRoom}
          roomCode={mpState.roomCode}
          playerCount={mpState.playerCount}
          onOpenMultiplayer={() => setShowMultiplayerModal(true)}
          controlMode={controlMode}
          showBigMap={showBigMap}
          onToggleBigMap={setShowBigMap}
        />
      )}

      {controlMode === 'mobile' && !isPortrait && !isArcadeActive && !isPaused && (
        <MobileControls
          inVehicle={inVehicle}
          currentVehicle={currentVehicleInfo}
          aircraft={aircraftHud}
          parachute={parachuteHud}
          charizardFlightActive={charizardFlightActive}
          currentPokemonId={selectedPokemonId}
          grabbedNpcId={grabbedNpcId}
          interactionPrompt={interactionPrompt}
          onAction={(action) => mobileActionRef.current(action)}
          onKeyChange={(code, isDown) => mobileKeyChangeRef.current(code, isDown)}
          onAnalogMove={(data) => mobileAnalogMoveRef.current(data)}
          onCameraDrag={(dx, dy) => mobileCameraDragRef.current(dx, dy)}
          onTogglePause={handleTogglePause}
          onOpenBigMap={() => setShowBigMap(true)}
          onToggleMute={handleToggleMute}
          onResetPlayer={handleResetPlayer}
          onSelectPokemon={switchStarterPokemon}
          unlockedGeodude={unlockedGeodude}
          isMuted={isMuted}
          playerPos={playerPos}
          playerYaw={playerYaw}
          worldMap={worldMap}
          landmarks={landmarks}
          policePositions={policePositions}
          pokemonHp={pokemonHp}
          pokemonWater={pokemonWater}
          wantedHeat={wantedHeat}
          hitAndRunActive={hitAndRunActive}
          treesGrownCount={treesGrownCount}
          hasChosenStarter={hasChosenStarter}
          worldGoal={worldGoal}
        />
      )}

      {controlMode === 'mobile' && isPortrait && (
        <PortraitRotateOverlay
          onSwitchToPcMode={() => {
            setControlMode('pc');
            localStorage.setItem('pokemon_hit_and_run_control_mode', 'pc');
          }}
        />
      )}

      {isArcadeActive && (
        <ArcadeCabinet
          onExit={() => exitArcadeModeRef.current()}
          machineName={activeArcadeMachine?.name ?? 'Retro Hit & Run 8-Bit'}
          gameId={activeArcadeMachine?.gameId}
        />
      )}

      {isPaused && (
        <div className="absolute inset-0 z-[220] flex items-center justify-center bg-slate-950/72 p-2 sm:p-4 backdrop-blur-md pointer-events-auto select-none">
          {!developerDebugOpen ? (
            <div className="w-[min(540px,calc(100vw-1.5rem))] max-h-[92vh] overflow-y-auto overscroll-contain rounded-3xl border-2 border-amber-400/80 bg-slate-950/95 p-4 sm:p-6 text-white shadow-[0_0_55px_rgba(245,158,11,0.22)]">
              {/* Header with Title and Pressable X Close Button */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3 sm:pb-4">
                <div className="text-left">
                  <div className="text-[10px] sm:text-xs font-black uppercase tracking-[0.32em] text-amber-300">
                    {mpState.isInRoom ? 'Multiplayer Session Active' : 'Game Paused'}
                  </div>
                  <div className="mt-1 text-2xl sm:text-4xl font-black tracking-tight">PAUSE</div>
                  <div className="mt-1 text-xs sm:text-sm text-slate-400">
                    {mpState.isInRoom
                      ? 'Local controls paused. Other players and the shared world continue live.'
                      : 'Gameplay, physics, AI and world simulation are frozen.'}
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-close-pause-menu"
                  onClick={handleResumeGame}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleResumeGame();
                  }}
                  className="min-h-[44px] min-w-[44px] shrink-0 rounded-2xl border border-amber-400/60 bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/30 active:bg-amber-500/40 cursor-pointer flex items-center justify-center gap-1"
                  title="Resume Game / Close Pause Menu"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden xs:inline font-black">RESUME</span>
                </button>
              </div>

              <div className="mt-4 sm:mt-6 grid gap-3">
                {/* CONTROL MODE TOGGLE REQUIRED BY USER */}
                <div className="rounded-2xl border border-amber-400/60 bg-slate-900/90 p-3 sm:p-4 shadow-inner">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      🎮 Control Mode
                    </div>
                    <span className="text-[11px] text-amber-200/80 font-bold">
                      {controlMode === 'mobile' ? 'iPhone / Mobile' : 'PC (Keyboard & Mouse)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      id="btn-control-mode-pc"
                      onClick={() => {
                        setControlMode('pc');
                        localStorage.setItem('pokemon_hit_and_run_control_mode', 'pc');
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        setControlMode('pc');
                        localStorage.setItem('pokemon_hit_and_run_control_mode', 'pc');
                      }}
                      className={`min-h-[44px] rounded-xl py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-black transition cursor-pointer ${
                        controlMode === 'pc'
                          ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20 ring-2 ring-amber-300'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 active:bg-slate-700'
                      }`}
                    >
                      <Monitor className="w-4 h-4" />
                      <span>PC</span>
                    </button>
                    <button
                      type="button"
                      id="btn-control-mode-mobile"
                      onClick={() => {
                        setControlMode('mobile');
                        localStorage.setItem('pokemon_hit_and_run_control_mode', 'mobile');
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        setControlMode('mobile');
                        localStorage.setItem('pokemon_hit_and_run_control_mode', 'mobile');
                      }}
                      className={`min-h-[44px] rounded-xl py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-black transition cursor-pointer ${
                        controlMode === 'mobile'
                          ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20 ring-2 ring-amber-300'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 active:bg-slate-700'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>iPhone / Mobile</span>
                    </button>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400 leading-tight">
                    {controlMode === 'mobile'
                      ? 'Landscape only touch controls: virtual analog stick, camera drag, and responsive action buttons.'
                      : 'WASD / Arrow keys for movement, Space to jump, E to interact, F to attack, G to grab, Q for special move.'}
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-pause-resume"
                  onClick={handleResumeGame}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleResumeGame();
                  }}
                  className="min-h-[44px] rounded-2xl border border-emerald-400/60 bg-emerald-500/15 px-4 sm:px-5 py-3 sm:py-4 text-left transition hover:bg-emerald-500/25 active:bg-emerald-500/35 cursor-pointer"
                >
                  <div className="font-black text-emerald-200">▶ Resume Game</div>
                  <div className="mt-1 text-xs text-slate-400">Continue exactly where you paused.</div>
                </button>

                <button
                  type="button"
                  id="btn-pause-multiplayer"
                  onClick={() => setShowMultiplayerModal(true)}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    setShowMultiplayerModal(true);
                  }}
                  className="min-h-[44px] rounded-2xl border border-indigo-400/60 bg-indigo-500/15 px-4 sm:px-5 py-3 sm:py-4 text-left transition hover:bg-indigo-500/25 active:bg-indigo-500/35 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-black text-indigo-200">👥 Multiplayer (Host / Join)</div>
                    {mpState.isInRoom && (
                      <span className="rounded bg-indigo-500/40 px-2 py-0.5 text-xs font-black text-amber-300">
                        Room {mpState.roomCode} ({mpState.playerCount})
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {mpState.isInRoom
                      ? 'Connected to session. View players, share code, or leave.'
                      : 'Host or join an online session in the full game world.'}
                  </div>
                </button>

                <button
                  type="button"
                  id="btn-pause-arcade"
                  onClick={() => {
                    if (mpState.isInRoom) {
                      showTemporaryNotification('Arcade Restricted', 'Arcade minigames are disabled during active multiplayer sessions.');
                      return;
                    }
                    handleResumeGame();
                    enterArcadeModeRef.current();
                  }}
                  onTouchEnd={(e) => {
                    if (mpState.isInRoom) {
                      showTemporaryNotification('Arcade Restricted', 'Arcade minigames are disabled during active multiplayer sessions.');
                      return;
                    }
                    e.preventDefault();
                    handleResumeGame();
                    enterArcadeModeRef.current();
                  }}
                  className={`min-h-[44px] rounded-2xl border border-purple-400/60 bg-purple-500/15 px-4 sm:px-5 py-3 sm:py-4 text-left transition hover:bg-purple-500/25 active:bg-purple-500/35 cursor-pointer ${mpState.isInRoom ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="font-black text-purple-200">🎮 Play Arcade Machine (Coin-Op)</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {mpState.isInRoom ? 'Disabled during multiplayer to protect shared world state.' : 'Suspend main world and play the retro arcade machine.'}
                  </div>
                </button>

                <button
                  type="button"
                  id="btn-pause-developer-debug"
                  onClick={handleToggleDeveloperDebug}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleToggleDeveloperDebug();
                  }}
                  className="min-h-[44px] rounded-2xl border border-cyan-400/60 bg-cyan-500/10 px-4 sm:px-5 py-3 sm:py-4 text-left transition hover:bg-cyan-500/20 active:bg-cyan-500/30 cursor-pointer"
                >
                  <div className="font-black text-cyan-200">🔧 Developer / Performance Debug</div>
                  <div className="mt-1 text-xs text-slate-400">Inspect camera, world visibility, renderer, physics, memory and recent stalls.</div>
                </button>
              </div>
              <div className="mt-4 text-center text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">ESC, Tap X, or Pause button to resume</div>
            </div>
          ) : (
            <div className="flex max-h-[92vh] w-[min(1050px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border-2 border-cyan-400/70 bg-slate-950/95 text-white shadow-[0_0_60px_rgba(34,211,238,0.20)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 px-4 sm:px-5 py-3 sm:py-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Developer / Performance Debug</div>
                  <div className="mt-1 text-xs sm:text-sm text-slate-400">Pause immediately when a glitch occurs, then copy this snapshot before recovering.</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDebugSnapshot}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      handleCopyDebugSnapshot();
                    }}
                    className={`min-h-[40px] rounded-xl border px-3 py-2 text-xs font-black transition cursor-pointer ${
                      copySnapshotStatus === 'copied'
                        ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100'
                        : copySnapshotStatus === 'failed'
                        ? 'border-rose-400/70 bg-rose-500/20 text-rose-100'
                        : 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'
                    }`}
                  >
                    {copySnapshotStatus === 'copied' ? 'Copied ✓' : copySnapshotStatus === 'failed' ? 'Copy Failed' : 'Copy Snapshot'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRecoverCameraAndWorld}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      handleRecoverCameraAndWorld();
                    }}
                    className="min-h-[40px] rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-100 hover:bg-amber-500/20 cursor-pointer"
                  >
                    Recover Camera / World
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleDeveloperDebug}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      handleToggleDeveloperDebug();
                    }}
                    className="min-h-[40px] rounded-xl border border-slate-500/60 bg-slate-800 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-700 cursor-pointer flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto p-5">
                {!debugSnapshot ? (
                  <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 text-center text-slate-400">Collecting debug snapshot…</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      {[
                        ['FPS', String(debugSnapshot.fps)],
                        ['Frame', `${debugSnapshot.frameMs} ms`],
                        ['CPU', `${debugSnapshot.frameCpuMs} ms`],
                        ['World tick', `${debugSnapshot.worldTickMs} ms`],
                        ['Recent max', `${debugSnapshot.recentMaxFrameMs} ms`],
                        ['Quality', debugSnapshot.qualityTier],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-slate-700/80 bg-slate-900/80 p-3">
                          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
                          <div className="mt-1 text-lg font-black text-white">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
                      <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Full Frame CPU Breakdown</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                        {Object.entries(debugSnapshot.frameCpuBreakdown).map(([name, value]) => (
                          <div key={name} className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{name}</div>
                            <div className="mt-1 text-sm font-black text-white">{value} ms</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Camera / World</div>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div className="text-slate-400">District</div><div className="font-bold">{debugSnapshot.district}</div>
                          <div className="text-slate-400">Player XYZ</div><div className="font-mono text-xs">{debugSnapshot.player.x}, {debugSnapshot.player.y}, {debugSnapshot.player.z}</div>
                          <div className="text-slate-400">Camera XYZ</div><div className="font-mono text-xs">{debugSnapshot.camera.x}, {debugSnapshot.camera.y}, {debugSnapshot.camera.z}</div>
                          <div className="text-slate-400">Camera distance</div><div className="font-bold">{debugSnapshot.cameraToPlayer} m</div>
                          <div className="text-slate-400">Watchdog recoveries</div><div className="font-bold">{debugSnapshot.watchdogRecoveries}</div>
                          <div className="text-slate-400">Last recovery</div><div className="text-xs font-semibold">{debugSnapshot.lastRecoveryReason}</div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {Object.entries(debugSnapshot.roots).map(([name, visible]) => (
                            <div key={name} className={`rounded-lg border px-2 py-2 text-center text-[10px] font-black uppercase ${visible ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200' : 'border-red-500/60 bg-red-500/10 text-red-200'}`}>
                              {name}<br />{visible ? 'VISIBLE' : 'HIDDEN'}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Simulation / Renderer</div>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div className="text-slate-400">NPCs</div><div className="font-bold">{debugSnapshot.npcs.visible} visible / {debugSnapshot.npcs.total}</div>
                          <div className="text-slate-400">Vehicles</div><div className="font-bold">{debugSnapshot.vehicles.visible} visible / {debugSnapshot.vehicles.total}</div>
                          <div className="text-slate-400">Dynamic props</div><div className="font-bold">{debugSnapshot.props.awake} awake / {debugSnapshot.props.total}</div>
                          <div className="text-slate-400">Prop substeps</div><div className="font-bold">{debugSnapshot.props.substeps}</div>
                          <div className="text-slate-400">Particles</div><div className="font-bold">{debugSnapshot.particles.active} active + {debugSnapshot.particles.crashEffects} crash FX</div>
                          <div className="text-slate-400">Colliders</div><div className="font-bold">{debugSnapshot.collision.colliders}</div>
                          <div className="text-slate-400">Walkable surfaces</div><div className="font-bold">{debugSnapshot.collision.walkableSurfaces}</div>
                          <div className="text-slate-400">Draw calls</div><div className="font-bold">{debugSnapshot.render.calls}</div>
                          <div className="text-slate-400">renderer.render()</div><div className="font-bold">{debugSnapshot.render.renderMs} ms</div>
                          <div className="text-slate-400">Shader programs</div><div className="font-bold">{debugSnapshot.render.programs}</div>
                          <div className="text-slate-400">Variable lights disabled</div><div className="font-bold">{debugSnapshot.render.staticLightsDisabled}</div>
                          <div className="text-slate-400">Triangles</div><div className="font-bold">{debugSnapshot.render.triangles.toLocaleString()}</div>
                          <div className="text-slate-400">GPU resources</div><div className="font-bold">{debugSnapshot.render.geometries} geo / {debugSnapshot.render.textures} tex</div>
                          <div className="text-slate-400">Primitive normalisation</div><div className="font-bold">{debugSnapshot.render.canonicalizedMeshes} meshes</div>
                          <div className="text-slate-400">Shared geometry</div><div className="font-bold">{debugSnapshot.render.deduplicatedMeshes} meshes / -{debugSnapshot.render.deduplicatedGeometries} geo</div>
                          <div className="text-slate-400">GPU warm-up</div><div className="font-bold">{debugSnapshot.render.warmupDone} / {debugSnapshot.render.warmupTotal}</div>
                          <div className="text-slate-400">Static batching</div><div className="font-bold">{debugSnapshot.render.batchedMeshes} meshes → {debugSnapshot.render.staticBatches} batches</div>
                          <div className="text-slate-400">Attached scene</div><div className="font-bold">{debugSnapshot.render.sceneMeshes} meshes / {debugSnapshot.render.sceneGeometries} unique geo</div>
                          <div className="text-slate-400">Geometry growth</div><div className="font-bold">{debugSnapshot.resourceGrowth.geometryDelta === null ? 'Calibrating…' : `${debugSnapshot.resourceGrowth.geometryDelta >= 0 ? '+' : ''}${debugSnapshot.resourceGrowth.geometryDelta}`}</div>
                          <div className="text-slate-400">JS heap</div><div className="font-bold">{debugSnapshot.jsHeapMb === null ? 'Unavailable' : `${debugSnapshot.jsHeapMb} MB`}</div>
                          <div className="text-slate-400">Heap growth</div><div className="font-bold">{debugSnapshot.resourceGrowth.heapDeltaMb === null ? 'Unavailable' : `${debugSnapshot.resourceGrowth.heapDeltaMb >= 0 ? '+' : ''}${debugSnapshot.resourceGrowth.heapDeltaMb} MB`}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">World Tick Breakdown</div>
                        <div className="text-[10px] text-slate-500">Last tick · worst tick retained for 15s</div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        {Object.entries(debugSnapshot.worldTickBreakdown).map(([name, value]) => (
                          <div key={name} className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{name.replace(/([A-Z])/g, ' $1')}</div>
                            <div className="mt-1 font-mono text-sm font-bold text-cyan-100">{value} ms</div>
                          </div>
                        ))}
                      </div>
                      {debugSnapshot.worstRecentWorldTick && (
                        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-slate-300">
                          Worst recent world tick: <span className="font-mono font-black text-amber-300">{debugSnapshot.worstRecentWorldTick.totalMs} ms</span> · {debugSnapshot.worstRecentWorldTick.ageSeconds}s ago. Biggest subsystem: <span className="font-bold text-white">{(Object.entries(debugSnapshot.worstRecentWorldTick.breakdown) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown'}</span> ({(Object.entries(debugSnapshot.worstRecentWorldTick.breakdown) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[1] ?? 0} ms)
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Recent Stalls / Recoveries</div>
                        <div className="text-[10px] text-slate-500">Newest first</div>
                      </div>
                      {debugSnapshot.recentStalls.length === 0 ? (
                        <div className="mt-3 text-sm text-emerald-300">No recorded 80ms+ stalls in the recent session window.</div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {debugSnapshot.recentStalls.map((stall, index) => (
                            <div key={`${stall.ageSeconds}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs">
                              <span className="font-semibold text-slate-300">{stall.reason}</span>
                              <span className="font-mono text-amber-300">{stall.frameMs} ms · {stall.ageSeconds}s ago</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-700/70 bg-slate-950/80 px-4 py-3 text-xs leading-relaxed text-slate-400">
                      Best workflow when the game glitches: <span className="font-bold text-white">ESC → Developer Debug → Copy Snapshot</span> before pressing Recover. Paste the copied JSON into ChatGPT so the broken state can be diagnosed directly.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showMultiplayerModal && (
        <MultiplayerModal
          mpState={mpState}
          defaultPlayerName={pokemonName(selectedPokemonId)}
          onClose={() => setShowMultiplayerModal(false)}
          onCreateRoom={handleCreateMultiplayerRoom}
          onJoinRoom={handleJoinMultiplayerRoom}
          onLeaveRoom={handleLeaveMultiplayerRoom}
        />
      )}
    </div>
  );
}
