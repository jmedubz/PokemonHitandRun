// Setup minimal DOM mocks before importing game modules
const ctxProxy: any = new Proxy({}, {
  get: () => (...args: any[]) => {
    return ctxProxy;
  }
});
const fakeCanvas: any = {
  width: 128,
  height: 128,
  getContext: () => ctxProxy,
};
(globalThis as any).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return { ...fakeCanvas };
    return {};
  },
};
(globalThis as any).window = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
};

import * as THREE from 'three';
import { buildGoldenrodCity } from './game/goldenrod';
import { buildSpringfield } from './game/springfield';
import { buildConnectingHighway } from './game/highway';
import { buildAirportDistrict } from './game/airport';
import { CollisionSystem } from './game/doors';
import { NPCManager } from './game/npcManager';
import { TrafficManager } from './game/trafficManager';
import { FootballMatchManager } from './game/football';
import { WorldInteractionManager } from './game/worldInteractions';
import { ParticleEffectsManager } from './game/particles';
import { AshBattleManager } from './game/ashBattle';
import { OAK_LAB_NEW_GAME_START } from './game/spawnPoints';

console.log('--- DIAGNOSTIC SCRIPT START ---');


const collisionSystem = new CollisionSystem();
const scene = new THREE.Scene();
const particles = new ParticleEffectsManager(scene);

console.time('buildGoldenrodCity');
const goldenrod = buildGoldenrodCity(collisionSystem);
console.timeEnd('buildGoldenrodCity');

console.time('buildSpringfield');
const springfield = buildSpringfield(collisionSystem);
console.timeEnd('buildSpringfield');

console.time('buildConnectingHighway');
const highway = buildConnectingHighway(collisionSystem);
console.timeEnd('buildConnectingHighway');

console.time('buildAirportDistrict');
const airport = buildAirportDistrict(collisionSystem);
console.timeEnd('buildAirportDistrict');

scene.add(goldenrod.group);
scene.add(springfield.group);
scene.add(highway.group);
scene.add(airport.group);

let hMeshes = 0, aMeshes = 0, gMeshes = 0, sMeshes = 0;
goldenrod.group.traverse(o => { if (o instanceof THREE.Mesh) gMeshes++; });
springfield.group.traverse(o => { if (o instanceof THREE.Mesh) sMeshes++; });
highway.group.traverse(o => { if (o instanceof THREE.Mesh) hMeshes++; });
airport.group.traverse(o => { if (o instanceof THREE.Mesh) aMeshes++; });
console.log('District meshes:', { gMeshes, sMeshes, hMeshes, aMeshes });


    goldenrod.wallColliders.forEach((w) => collisionSystem.addWall(w));
    airport.wallColliders.forEach((w) => collisionSystem.addWall(w));
    springfield.wallColliders.forEach((w) => {
      if (w.id !== 'ps_jail_wall') collisionSystem.addWall(w);
    });
    collisionSystem.addWalkableRoot(goldenrod.group, 'goldenrod');
    collisionSystem.addWalkableRoot(springfield.group, 'springfield');
    collisionSystem.addWalkableRoot(highway.group, 'highway');
    collisionSystem.addWalkableRoot(airport.group, 'airport');

console.log('Colliders count:', collisionSystem.colliders.length);
let flat = 0, curved = 0;
collisionSystem.walkableSurfaces.forEach(s => {
  const diff = Math.abs((s.maxY ?? s.y) - (s.minY ?? s.y));
  if (diff < 0.05) flat++; else curved++;
});
console.log('Walkable surfaces flatness:', { flat, curved });


const activePos = new THREE.Vector3(OAK_LAB_NEW_GAME_START.x, OAK_LAB_NEW_GAME_START.y, OAK_LAB_NEW_GAME_START.z);

// Let's test collision queries performance
// Test optimized ground queries:
const origSample = (collisionSystem as any).sampleSurfaceHeight.bind(collisionSystem);
(collisionSystem as any).sampleSurfaceHeight = function(surface: any, x: number, z: number) {
  if (!this.containsSurfaceXZ(surface, x, z)) return null;
  if (!surface.isStair && !surface.isRoof && ((surface.maxY ?? surface.y) - (surface.minY ?? surface.y) <= 0.55)) {
    return surface.y;
  }
  return origSample(surface, x, z);
};

console.time('1000 ground queries (optimized)');
for (let i = 0; i < 1000; i++) {
  collisionSystem.getGroundHeightNear(activePos.x + (i % 20) - 10, activePos.z + Math.floor(i / 20) - 10, activePos.y, 0.12, 1.6, 4.0);
}
console.timeEnd('1000 ground queries (optimized)');


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

const npcManager = new NPCManager(
  scene,
  (x, z, currentY = 0.12, maxDrop = 3.5, fallbackY = currentY) => collisionSystem.getGroundHeightNear(x, z, currentY, fallbackY, 0.8, maxDrop),
  (position, radius = 0.48, height = 1.75) => collisionSystem.canOccupy(position, radius, height),
  (position, radius = 0.48, height = 1.75) => collisionSystem.canFlyOccupy(position, radius, height),
  (x, z, clearance = 0) => collisionSystem.isRoadSurfaceAt(x, z, clearance),
  (x, z) => collisionSystem.isPedestrianSurfaceAt(x, z)
);
console.log('NPC count:', npcManager.npcs.length);

const trafficManager = new TrafficManager(scene, collisionSystem, () => false);
console.log('Vehicle count:', trafficManager.vehicles.length);

const footballManager = new FootballMatchManager();
const allDestructibles = [
  ...goldenrod.destructibles,
  ...springfield.destructibles,
  ...highway.destructibles,
  ...airport.destructibles,
];
const worldInteractions = new WorldInteractionManager(scene, collisionSystem, particles, npcManager.npcs, allDestructibles);
const ashBattle = new AshBattleManager(scene, springfield.simpsonsHouse.livingRoomPos, () => {});

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

let totalObjects = 0;
let totalMeshes = 0;
let totalInstancedMeshes = 0;
let totalInstancedCount = 0;
let totalVertices = 0;
let totalTriangles = 0;
let castShadowCount = 0;
let receiveShadowCount = 0;
const uniqueMaterials = new Set();
const uniqueGeometries = new Set();

scene.traverse((obj) => {
  totalObjects++;
  if (obj instanceof THREE.Mesh) {
    totalMeshes++;
    if (obj.castShadow) castShadowCount++;
    if (obj.receiveShadow) receiveShadowCount++;
    if (obj.geometry) {
      uniqueGeometries.add(obj.geometry);
      const pos = obj.geometry.getAttribute('position');
      if (pos) {
        totalVertices += pos.count;
        if (obj.geometry.index) {
          totalTriangles += obj.geometry.index.count / 3;
        } else {
          totalTriangles += pos.count / 3;
        }
      }
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => uniqueMaterials.add(m));
  }
  if (obj instanceof THREE.InstancedMesh) {
    totalInstancedMeshes++;
    totalInstancedCount += obj.count;
  }
});

const materialTypes = new Map();
const materialShaderNames = new Map();
for (const mat of uniqueMaterials) {
  const type = (mat as any).type;
  materialTypes.set(type, (materialTypes.get(type) || 0) + 1);
  const name = (mat as any).name || 'unnamed';
  materialShaderNames.set(name, (materialShaderNames.get(name) || 0) + 1);
}
console.log('Material Types:', Object.fromEntries(materialTypes));
const sortedNames = [...materialShaderNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
const materialMap = new Map();
let deduplicatedMaterialCount = 0;
scene.traverse(o => {
  if (o instanceof THREE.Mesh) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const newMats = mats.map(m => {
      const key = `${m.type}_${m.color?.getHex()}_${m.roughness}_${m.metalness}_${m.map?.uuid}_${m.transparent}_${m.opacity}`;
      if (!materialMap.has(key)) {
        materialMap.set(key, m);
      }
      return materialMap.get(key);
    });
    o.material = Array.isArray(o.material) ? newMats : newMats[0];
  }
});
let goldenrodClose = 0;
let goldenrodFar = 0;
const p = new THREE.Vector3(200, 0, -196.8);
const meshCenter = new THREE.Vector3();
const meshBox = new THREE.Box3();
goldenrod.group.traverse(o => {
  if (o instanceof THREE.Mesh) {
    meshBox.setFromObject(o);
    meshBox.getCenter(meshCenter);
    const d = meshCenter.distanceTo(p);
    if (d <= 120) goldenrodClose++;
    else goldenrodFar++;
  }
});
// Test batching potential
const testGroups = new Map();
let eligibleMeshes = 0;
goldenrod.group.traverse(obj => {
  if (obj instanceof THREE.Mesh && !(obj instanceof THREE.InstancedMesh) && !obj.userData.solidCollider && !obj.userData.walkable) {
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const geom = obj.geometry;
    const cellX = Math.floor(obj.position.x / 60);
    const cellZ = Math.floor(obj.position.z / 60);
    const key = `${cellX}:${cellZ}:${geom.type}_${geom.parameters?.width || geom.parameters?.radius || ''}:${mat?.type}_${mat?.color?.getHex()}`;
    if (!testGroups.has(key)) testGroups.set(key, []);
    testGroups.get(key).push(obj);
    eligibleMeshes++;
  }
});
let batchedMeshes = 0;
let batchesCount = 0;
for (const [k, list] of testGroups) {
  if (list.length >= 2) {
    batchesCount++;
    batchedMeshes += list.length;
  }
}
console.log('Batching test in Goldenrod:', { eligibleMeshes, batchesCount, batchedMeshes });




springfield.group.visible = false;
goldenrod.group.visible = true;
highway.group.visible = true;
airport.group.visible = true;

let visibleMeshesCount = 0;
let visibleTriangles = 0;
let visibleCastShadowCount = 0;
const visibleUniqueMaterials = new Set();

scene.traverse((obj) => {
  if (!obj.visible) return;
  // Check hierarchy visibility
  let curr = obj.parent;
  let hidden = false;
  while (curr) {
    if (!curr.visible) { hidden = true; break; }
    curr = curr.parent;
  }
  if (hidden) return;

  if (obj instanceof THREE.Mesh) {
    visibleMeshesCount++;
    if (obj.castShadow) visibleCastShadowCount++;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => visibleUniqueMaterials.add(m));
    const pos = obj.geometry?.getAttribute('position');
    if (pos) {
      visibleTriangles += obj.geometry.index ? obj.geometry.index.count / 3 : pos.count / 3;
    }
  }
});

let solidShadow = 0;
let anyShadow = 0;
scene.traverse(o => {
  if (o instanceof THREE.Mesh) {
    if (o.castShadow) anyShadow++;
    if (o.userData.solidCollider) solidShadow++;
  }
});
const nonSolidShadowNames = new Map();
scene.traverse(o => {
  if (o instanceof THREE.Mesh && o.castShadow && !o.userData.solidCollider) {
    const name = o.name || o.parent?.name || 'unnamed';
    nonSolidShadowNames.set(name, (nonSolidShadowNames.get(name) || 0) + 1);
  }
});
console.log('Non-solid shadow casters top names:', [...nonSolidShadowNames.entries()].sort((a,b) => b[1] - a[1]).slice(0, 25));


console.log({
  visibleMeshesCount,
  visibleTriangles,
  visibleCastShadowCount,
  visibleUniqueMaterials: visibleUniqueMaterials.size,
});

