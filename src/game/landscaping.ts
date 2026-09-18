import * as THREE from 'three';
import { createMaterial, createStylizedCityTreeModel } from './models';
import { DestructibleProp } from '../types';

export interface LandscapingGrove {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  count: number;
}

export interface LandscapingReservedArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  padding?: number;
}

export interface RoadsideLandscapingOptions {
  root: THREE.Group;
  destructibles: DestructibleProp[];
  districtId: string;
  maxRoadsideTrees: number;
  seed?: number;
  groves?: LandscapingGrove[];
  reservedAreas?: LandscapingReservedArea[];
}

export interface RoadsideLandscapingResult {
  treesAdded: number;
  bushesAdded: number;
  roadCandidatesRejected: number;
}

type Candidate = {
  point: THREE.Vector3;
  outward: THREE.Vector3;
  sourceRoad: THREE.Object3D | null;
};

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _localPoint = new THREE.Vector3();
const _worldPoint = new THREE.Vector3();
const _outward = new THREE.Vector3();
const _matrix3 = new THREE.Matrix3();

function hashString(value: string) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hierarchyName(object: THREE.Object3D) {
  const names: string[] = [];
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (cursor.name) names.push(cursor.name);
    cursor = cursor.parent;
  }
  return names.join(' ').toLowerCase();
}

function containsXZ(box: THREE.Box3, x: number, z: number, margin = 0) {
  return x >= box.min.x - margin && x <= box.max.x + margin &&
    z >= box.min.z - margin && z <= box.max.z + margin;
}

function distanceSqXZ(a: THREE.Vector3, b: THREE.Vector3) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

let bushGeometry: THREE.DodecahedronGeometry | null = null;
let bushDarkMaterial: THREE.MeshStandardMaterial | null = null;
let bushMidMaterial: THREE.MeshStandardMaterial | null = null;
let flowerMaterial: THREE.MeshStandardMaterial | null = null;
let flowerGeometry: THREE.SphereGeometry | null = null;

function getBushAssets() {
  bushGeometry ??= new THREE.DodecahedronGeometry(1, 1);
  bushDarkMaterial ??= createMaterial(0x2f7d32, 0.86, 0.0);
  bushMidMaterial ??= createMaterial(0x4aa64d, 0.82, 0.0);
  flowerMaterial ??= createMaterial(0xf7b7d2, 0.72, 0.0);
  flowerGeometry ??= new THREE.SphereGeometry(0.09, 6, 5);
  return {
    geometry: bushGeometry,
    dark: bushDarkMaterial,
    mid: bushMidMaterial,
    flower: flowerMaterial,
    flowerGeometry,
  };
}

/**
 * Adds deterministic, environment-designed greenery using the live authored road and
 * pedestrian meshes as constraints. Trees are still individual destructible roots so
 * WorldInteractionManager owns their kick/fall/collider lifecycle exactly like every
 * other kickable tree. Static shrubs are deliberately visual-only and cheap.
 */
export function addRoadsideLandscaping(options: RoadsideLandscapingOptions): RoadsideLandscapingResult {
  const {
    root,
    destructibles,
    districtId,
    maxRoadsideTrees,
    groves = [],
    reservedAreas = [],
  } = options;

  const random = makeRandom((options.seed ?? 0x9e3779b9) ^ hashString(districtId));
  root.updateMatrixWorld(true);

  const roadMeshes: THREE.Mesh[] = [];
  const roadBoxes: THREE.Box3[] = [];
  const sidewalkBoxes: THREE.Box3[] = [];
  const solidBoxes: THREE.Box3[] = [];
  const hardNoPlantBoxes: THREE.Box3[] = [];
  const crossingPoints: Array<{ point: THREE.Vector3; radius: number }> = [];
  const doorPoints: THREE.Vector3[] = [];

  root.traverse((object) => {
    if (object.userData.pedestrianCrossingMarker === true) {
      const point = new THREE.Vector3();
      object.getWorldPosition(point);
      crossingPoints.push({ point, radius: Math.max(8, Number(object.userData.roadWidth ?? 14) * 0.62) });
    }
    if (/^door_/i.test(object.name || '')) {
      const point = new THREE.Vector3();
      object.getWorldPosition(point);
      doorPoints.push(point);
    }
    if (!(object instanceof THREE.Mesh)) return;

    const worldBox = new THREE.Box3().setFromObject(object);
    if (!Number.isFinite(worldBox.min.x) || !Number.isFinite(worldBox.max.z)) return;

    if (object.userData.mapRoadSurface === true) {
      roadMeshes.push(object);
      roadBoxes.push(worldBox.clone());
    }
    if (object.userData.sidewalkSurface === true) sidewalkBoxes.push(worldBox.clone());
    if (object.userData.solidCollider === true) {
      const worldSize = worldBox.getSize(new THREE.Vector3());
      // Ignore tiny decorative solid details. Buildings, fences, signs and real
      // obstacles still reserve space, while a tiny bolt/trim does not erase a yard.
      if (worldSize.x > 0.35 || worldSize.z > 0.35) solidBoxes.push(worldBox.clone());
    }

    const name = hierarchyName(object);
    if (/(parking|car[_ -]?bay|driveway|forecourt|entrance[_ -]?apron|platform|magnet[_ -]?(track|rail|sleeper)|train[_ -]?track|station[_ -]?platform)/i.test(name)) {
      hardNoPlantBoxes.push(worldBox.clone());
    }
  });

  const occupiedPoints = destructibles.map((prop) => new THREE.Vector3(prop.position.x, prop.position.y, prop.position.z));
  const newTreePoints: THREE.Vector3[] = [];
  const landscapingGroup = new THREE.Group();
  landscapingGroup.name = `${districtId}_authored_landscaping`;
  landscapingGroup.userData.visualOnlyLandscaping = true;
  root.add(landscapingGroup);

  const isSafePlantingPoint = (point: THREE.Vector3, trunkRadius = 0.8) => {
    for (const reserved of reservedAreas) {
      const pad = reserved.padding ?? 0;
      if (point.x >= reserved.minX - pad && point.x <= reserved.maxX + pad && point.z >= reserved.minZ - pad && point.z <= reserved.maxZ + pad) return false;
    }
    // Road lanes get the widest protection. This prevents canopy/trunk placement in
    // traffic space even if a future road is widened without updating a coordinate list.
    if (roadBoxes.some((box) => containsXZ(box, point.x, point.z, trunkRadius + 1.0))) return false;
    // A tree must not occupy the actual pedestrian walking strip. A small buffer still
    // allows genuine verge planting beside a footpath without creating a shoulder wall.
    if (sidewalkBoxes.some((box) => containsXZ(box, point.x, point.z, trunkRadius + 0.35))) return false;
    if (hardNoPlantBoxes.some((box) => containsXZ(box, point.x, point.z, trunkRadius + 1.2))) return false;
    if (solidBoxes.some((box) => containsXZ(box, point.x, point.z, trunkRadius + 1.15))) return false;
    if (crossingPoints.some(({ point: crossing, radius }) => distanceSqXZ(point, crossing) < (radius + 2.3) ** 2)) return false;
    if (doorPoints.some((door) => distanceSqXZ(point, door) < 6.5 ** 2)) return false;
    // Keep enough room between trunks for player/vehicle movement and natural-looking
    // spacing. Existing authored props count too, so new landscaping never blankets a
    // mailbox, pole, hydrant or another kickable tree.
    if (occupiedPoints.some((other) => distanceSqXZ(point, other) < 3.1 ** 2)) return false;
    if (newTreePoints.some((other) => distanceSqXZ(point, other) < 7.2 ** 2)) return false;
    return true;
  };

  let treeIndex = 0;
  let bushCount = 0;
  let roadCandidatesRejected = 0;

  const addBushAccent = (treePoint: THREE.Vector3, outward: THREE.Vector3, index: number) => {
    if (index % 3 !== 1) return;
    const assets = getBushAssets();
    const tangent = new THREE.Vector3(-outward.z, 0, outward.x).normalize();
    const base = treePoint.clone().addScaledVector(outward, 2.25 + random() * 0.55);
    for (let i = 0; i < 2; i++) {
      const p = base.clone().addScaledVector(tangent, (i === 0 ? -1 : 1) * (0.55 + random() * 0.35));
      // Shrubs are lower priority than movement space: silently omit if this little
      // accent would spill back onto asphalt or a footpath.
      if (roadBoxes.some((box) => containsXZ(box, p.x, p.z, 0.35)) || sidewalkBoxes.some((box) => containsXZ(box, p.x, p.z, 0.22))) continue;
      const bush = new THREE.Mesh(assets.geometry, i === 0 ? assets.dark : assets.mid);
      bush.name = `${districtId}_landscape_bush_${bushCount}`;
      const s = 0.52 + random() * 0.24;
      bush.scale.set(s * (0.9 + random() * 0.2), s * 0.72, s * (0.9 + random() * 0.2));
      bush.position.set(p.x, s * 0.62, p.z);
      bush.rotation.y = random() * Math.PI * 2;
      bush.castShadow = true;
      bush.receiveShadow = true;
      landscapingGroup.add(bush);

      if ((index + i) % 5 === 0) {
        const flower = new THREE.Mesh(assets.flowerGeometry, assets.flower);
        flower.name = `${districtId}_landscape_flower_${bushCount}`;
        flower.position.set(p.x + 0.16, s * 1.02, p.z - 0.08);
        landscapingGroup.add(flower);
      }
      bushCount++;
    }
  };

  const addTree = (candidate: Candidate) => {
    if (!isSafePlantingPoint(candidate.point)) return false;

    const tree = new THREE.Group();
    tree.name = `kickable_tree_${districtId}_landscape_${treeIndex}`;
    tree.userData.kickableTree = true;
    tree.userData.treePhysicsProfile = 'arcade_reusable';
    tree.userData.authoredLandscapingTree = true;
    tree.position.set(candidate.point.x, 0, candidate.point.z);
    tree.rotation.y = random() * Math.PI * 2;

    const baseScale = 0.82 + random() * 0.28;
    const visual = createStylizedCityTreeModel(1, Math.floor(random() * 3));
    visual.name = `${districtId}_landscape_tree_visual_${treeIndex}`;
    // Small non-uniform variation gives different silhouette families without
    // creating a second physics implementation or expensive bespoke assets.
    visual.scale.set(
      baseScale * (0.90 + random() * 0.18),
      baseScale * (0.94 + random() * 0.18),
      baseScale * (0.90 + random() * 0.18),
    );
    visual.rotation.y = random() * Math.PI * 2;
    visual.traverse((object) => {
      if (!/^tree_canopy_visual_/.test(object.name)) return;
      object.scale.x *= 0.88 + random() * 0.24;
      object.scale.y *= 0.90 + random() * 0.20;
      object.scale.z *= 0.88 + random() * 0.24;
    });
    tree.add(visual);
    root.add(tree);

    destructibles.push({
      id: `${districtId}_landscape_tree_${treeIndex}`,
      mesh: tree,
      type: 'tree',
      position: { x: candidate.point.x, y: 0, z: candidate.point.z },
      destroyed: false,
    });
    newTreePoints.push(candidate.point.clone());
    occupiedPoints.push(candidate.point.clone());
    addBushAccent(candidate.point, candidate.outward, treeIndex);
    treeIndex++;
    return true;
  };

  // Use the actual current road slabs as authoring guides. We only generate beside
  // long surface streets; bridges, ramps, driveways, roundabouts and station access
  // geometry are deliberately excluded so vegetation cannot creep into critical
  // movement/visibility zones.
  const sourceRoads = roadMeshes.filter((road) => {
    const name = hierarchyName(road);
    if (/(roundabout|bridge|viaduct|highway|interstate|driveway|access|garage|station|ramp)/i.test(name)) return false;
    const geometry = road.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return false;
    const localSize = geometry.boundingBox.getSize(new THREE.Vector3());
    const length = Math.max(localSize.x, localSize.z);
    const width = Math.min(localSize.x, localSize.z);
    return length >= 55 && width >= 8 && width <= 24;
  });

  const roadCandidates: Candidate[] = [];
  for (const road of sourceRoads) {
    road.updateWorldMatrix(true, false);
    const geometry = road.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) continue;
    bounds.getSize(_size);
    const longAxis: 'x' | 'z' = _size.x >= _size.z ? 'x' : 'z';
    const shortAxis: 'x' | 'z' = longAxis === 'x' ? 'z' : 'x';
    const minLong = longAxis === 'x' ? bounds.min.x : bounds.min.z;
    const maxLong = longAxis === 'x' ? bounds.max.x : bounds.max.z;
    const halfWidth = (shortAxis === 'x' ? _size.x : _size.z) * 0.5;
    const usableStart = minLong + 13;
    const usableEnd = maxLong - 13;
    if (usableEnd <= usableStart) continue;

    const step = 23 + random() * 6;
    const phase = random() * Math.min(8, step * 0.35);
    for (let longitudinal = usableStart + phase; longitudinal <= usableEnd; longitudinal += step) {
      // Alternating omissions keep residential streets from becoming mechanical tree
      // tunnels. Denser rows are still possible where the live geometry provides room.
      for (const side of [-1, 1] as const) {
        if (random() < 0.24) continue;
        const jitter = (random() - 0.5) * 7.0;
        const baseLong = THREE.MathUtils.clamp(longitudinal + jitter, usableStart, usableEnd);
        let acceptedPoint: THREE.Vector3 | null = null;
        let acceptedOutward: THREE.Vector3 | null = null;
        // Start at a typical grass-verge/front-lawn setback and progressively move
        // outward if an authored footpath occupies that strip.
        for (const vergeOffset of [4.6, 6.3, 8.2, 10.4, 12.8]) {
          _localPoint.set(0, 0, 0);
          if (longAxis === 'x') {
            _localPoint.x = baseLong;
            _localPoint.z = side * (halfWidth + vergeOffset);
            _outward.set(0, 0, side);
          } else {
            _localPoint.z = baseLong;
            _localPoint.x = side * (halfWidth + vergeOffset);
            _outward.set(side, 0, 0);
          }
          _worldPoint.copy(_localPoint).applyMatrix4(road.matrixWorld);
          _matrix3.setFromMatrix4(road.matrixWorld);
          const worldOutward = _outward.clone().applyMatrix3(_matrix3).setY(0).normalize();
          _worldPoint.y = 0;
          if (isSafePlantingPoint(_worldPoint)) {
            acceptedPoint = _worldPoint.clone();
            acceptedOutward = worldOutward;
            break;
          }
          roadCandidatesRejected++;
        }
        if (acceptedPoint && acceptedOutward) roadCandidates.push({ point: acceptedPoint, outward: acceptedOutward, sourceRoad: road });
      }
    }
  }

  // Shuffle deterministically before applying the district budget so one early road
  // cannot consume every tree slot.
  for (let i = roadCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [roadCandidates[i], roadCandidates[j]] = [roadCandidates[j], roadCandidates[i]];
  }
  for (const candidate of roadCandidates) {
    if (treeIndex >= maxRoadsideTrees) break;
    addTree(candidate);
  }

  // Parks/open greens receive looser clusters rather than rows. These still pass the
  // exact same live road/sidewalk/solid/crossing validation as roadside trees.
  for (const grove of groves) {
    let placed = 0;
    let attempts = 0;
    while (placed < grove.count && attempts < grove.count * 18) {
      attempts++;
      const point = new THREE.Vector3(
        THREE.MathUtils.lerp(grove.minX, grove.maxX, random()),
        0,
        THREE.MathUtils.lerp(grove.minZ, grove.maxZ, random()),
      );
      // Random outward direction is only used to position optional shrub accents in
      // open spaces. It has no effect on tree physics.
      const angle = random() * Math.PI * 2;
      const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      if (addTree({ point, outward, sourceRoad: null })) placed++;
    }
  }

  if (treeIndex === 0) landscapingGroup.removeFromParent();
  return { treesAdded: treeIndex, bushesAdded: bushCount, roadCandidatesRejected };
}
