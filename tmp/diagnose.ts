import * as THREE from 'three';
import { buildGoldenrodCity } from './src/game/goldenrod';
import { buildSpringfield } from './src/game/springfield';
import { buildHighwaySystem } from './src/game/highway';
import { buildAirportDistrict } from './src/game/airport';
import { CollisionSystem } from './src/game/doors';
import { NPCManager } from './src/game/npcManager';
import { TrafficManager } from './src/game/trafficManager';
import { FootballMatchManager } from './src/game/football';
import { WorldInteractionManager } from './src/game/worldInteractions';
import { ParticleSystem } from './src/game/particles';
import { AshBattleManager } from './src/game/ashBattle';
import { OAK_LAB_NEW_GAME_START } from './src/game/spawnPoints';

console.log('--- DIAGNOSTIC SCRIPT START ---');

const collisionSystem = new CollisionSystem();
const particles = new ParticleSystem(new THREE.Scene());

console.time('buildGoldenrodCity');
const goldenrod = buildGoldenrodCity(collisionSystem);
console.timeEnd('buildGoldenrodCity');

console.time('buildSpringfield');
const springfield = buildSpringfield(collisionSystem);
console.timeEnd('buildSpringfield');

console.time('buildHighwaySystem');
const highway = buildHighwaySystem(collisionSystem);
console.timeEnd('buildHighwaySystem');

console.time('buildAirportDistrict');
const airport = buildAirportDistrict(collisionSystem);
console.timeEnd('buildAirportDistrict');

console.log('Colliders count:', collisionSystem.colliders.length);
console.log('Walkable surfaces count:', collisionSystem.walkableSurfaces.length);

const activePos = new THREE.Vector3(OAK_LAB_NEW_GAME_START.x, OAK_LAB_NEW_GAME_START.y, OAK_LAB_NEW_GAME_START.z);

// Let's test collision queries performance
console.time('1000 ground queries');
for (let i = 0; i < 1000; i++) {
  collisionSystem.getGroundHeightNear(activePos.x + (i % 20) - 10, activePos.z + Math.floor(i / 20) - 10, activePos.y, 0.12, 1.6, 4.0);
}
console.timeEnd('1000 ground queries');

console.time('1000 resolvePlayerCollision');
for (let i = 0; i < 1000; i++) {
  const p = activePos.clone().add(new THREE.Vector3((i % 20) * 0.1, 0, Math.floor(i / 20) * 0.1));
  collisionSystem.resolvePlayerCollision(p, 0.65, activePos);
}
console.timeEnd('1000 resolvePlayerCollision');

console.time('1000 resolveCameraPosition');
const target = activePos.clone().add(new THREE.Vector3(0, 1.1, 0));
const desiredCam = activePos.clone().add(new THREE.Vector3(0, 3, 6));
for (let i = 0; i < 1000; i++) {
  collisionSystem.resolveCameraPosition(target, desiredCam, 0.26, 0.20);
}
console.timeEnd('1000 resolveCameraPosition');

// Now let's test NPCManager, TrafficManager, etc.
const scene = new THREE.Scene();
scene.add(goldenrod.group);
scene.add(springfield.group);
scene.add(highway.group);
scene.add(airport.group);

const npcManager = new NPCManager(scene, collisionSystem, particles);
console.log('NPC count:', npcManager.npcs.length);

const trafficManager = new TrafficManager(scene, collisionSystem, particles);
trafficManager.init();
console.log('Vehicle count:', trafficManager.vehicles.length);

const footballManager = new FootballMatchManager(scene, collisionSystem, particles);
const worldInteractions = new WorldInteractionManager(scene, collisionSystem, particles);
const ashBattle = new AshBattleManager(scene, collisionSystem, particles, () => {});

console.log('Testing World Simulation Tick at Oak Lab Start (idle)...');
const dt = 1 / 30;

for (let frame = 0; frame < 5; frame++) {
  console.time(`WorldTick frame ${frame}`);
  
  const t0 = performance.now();
  footballManager.update(dt, {
    playerPosition: activePos,
    playerForward: new THREE.Vector3(0, 0, -1),
    playerJoined: false
  });
  const tFootball = performance.now() - t0;
  
  const t1 = performance.now();
  trafficManager.update(
    dt,
    null,
    activePos,
    npcManager.npcs,
    () => false,
    195,
    112,
    18
  );
  const tTraffic = performance.now() - t1;
  
  const t2 = performance.now();
  worldInteractions.update(dt);
  const tWorldInteractions = performance.now() - t2;
  
  const t3 = performance.now();
  particles.update(dt);
  const tParticles = performance.now() - t3;
  
  const t4 = performance.now();
  npcManager.update(dt, activePos, 0.92);
  const tNpc = performance.now() - t4;
  
  const t5 = performance.now();
  ashBattle.update(dt, activePos);
  const tAsh = performance.now() - t5;
  
  console.timeEnd(`WorldTick frame ${frame}`);
  console.log(`  Breakdown ms: football=${tFootball.toFixed(2)}, traffic=${tTraffic.toFixed(2)}, worldInteractions=${tWorldInteractions.toFixed(2)}, particles=${tParticles.toFixed(2)}, npc=${tNpc.toFixed(2)}, ash=${tAsh.toFixed(2)}`);
}

console.log('--- DIAGNOSTIC SCRIPT END ---');
