import * as THREE from 'three';
import {
  MapLandmark,
  WorldMapAreaFeature,
  WorldMapAreaKind,
  WorldMapPoint,
  WorldMapRoadFeature,
  WorldMapSnapshot,
} from '../types';

const BASE_BOUNDS = { minX: -340, maxX: 340, minZ: -245, maxZ: 245 };

function finiteBox(box: THREE.Box3) {
  return [box.min.x, box.min.z, box.max.x, box.max.z].every(Number.isFinite);
}

function objectArea(object: THREE.Object3D, id: string, kind: WorldMapAreaKind): WorldMapAreaFeature | null {
  const box = new THREE.Box3().setFromObject(object);
  if (!finiteBox(box)) return null;
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  if (width < 0.1 || depth < 0.1) return null;
  return {
    id,
    kind,
    x: (box.min.x + box.max.x) * 0.5,
    z: (box.min.z + box.max.z) * 0.5,
    width,
    depth,
  };
}

function localPolygon(mesh: THREE.Mesh, width: number, depth: number): WorldMapPoint[] {
  const corners = [
    new THREE.Vector3(-width * 0.5, 0, -depth * 0.5),
    new THREE.Vector3(width * 0.5, 0, -depth * 0.5),
    new THREE.Vector3(width * 0.5, 0, depth * 0.5),
    new THREE.Vector3(-width * 0.5, 0, depth * 0.5),
  ];
  return corners.map((corner) => {
    const world = mesh.localToWorld(corner);
    return { x: world.x, z: world.z };
  });
}

function radialPolygon(mesh: THREE.Mesh, radius: number, segments = 20): WorldMapPoint[] {
  const points: WorldMapPoint[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const world = mesh.localToWorld(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    points.push({ x: world.x, z: world.z });
  }
  return points;
}

function roadFeature(mesh: THREE.Mesh): WorldMapRoadFeature | null {
  // Curved airport/public roads expose their actual ribbon outline rather than
  // falling back to one giant axis-aligned bounding rectangle on the map.
  const authoredPolygon = mesh.userData.mapRoadPolygon as Array<{ x: number; z: number }> | undefined;
  if (Array.isArray(authoredPolygon) && authoredPolygon.length >= 3) {
    const points = authoredPolygon.map((point) => {
      const world = mesh.localToWorld(new THREE.Vector3(point.x, 0, point.z));
      return { x: world.x, z: world.z };
    });
    return { id: mesh.uuid, shape: 'polygon', points };
  }

  const params = (mesh.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> }).parameters ?? {};
  if (mesh.geometry.type === 'RingGeometry') {
    const center = new THREE.Vector3();
    const scale = new THREE.Vector3();
    mesh.getWorldPosition(center);
    mesh.getWorldScale(scale);
    const inner = Number(params.innerRadius ?? 0) * (Math.abs(scale.x) + Math.abs(scale.z)) * 0.5;
    const outer = Number(params.outerRadius ?? 0) * (Math.abs(scale.x) + Math.abs(scale.z)) * 0.5;
    if (outer > 0.1) {
      return { id: mesh.uuid, shape: 'ring', x: center.x, z: center.z, innerRadius: inner, outerRadius: outer };
    }
  }

  if (mesh.geometry.type === 'BoxGeometry') {
    const width = Number(params.width ?? 0);
    const depth = Number(params.depth ?? 0);
    if (width > 0.05 && depth > 0.05) {
      return { id: mesh.uuid, shape: 'polygon', points: localPolygon(mesh, width, depth) };
    }
  }

  if (mesh.geometry.type === 'CylinderGeometry' || mesh.geometry.type === 'CircleGeometry') {
    const radius = Math.max(Number(params.radius ?? 0), Number(params.radiusTop ?? 0), Number(params.radiusBottom ?? 0));
    if (radius > 0.05) return { id: mesh.uuid, shape: 'polygon', points: radialPolygon(mesh, radius, 24) };
  }

  const box = new THREE.Box3().setFromObject(mesh);
  if (!finiteBox(box)) return null;
  return {
    id: mesh.uuid,
    shape: 'polygon',
    points: [
      { x: box.min.x, z: box.min.z },
      { x: box.max.x, z: box.min.z },
      { x: box.max.x, z: box.max.z },
      { x: box.min.x, z: box.max.z },
    ],
  };
}

/**
 * Build one cached 2D atlas snapshot from the CURRENT authored Three.js world.
 * Roads come from actual meshes tagged by the world builders, so changing the
 * physical road geometry automatically changes the map on the next load.
 */
export function buildWorldMapSnapshot(roots: THREE.Object3D[], landmarks: MapLandmark[]): WorldMapSnapshot {
  roots.forEach((root) => root.updateWorldMatrix(true, true));

  const roads: WorldMapRoadFeature[] = [];
  const seenRoads = new Set<string>();
  for (const root of roots) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.mapRoadSurface !== true || seenRoads.has(object.uuid)) return;
      if (!object.visible) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.length > 0 && materials.every((material) => !material || material.visible === false)) return;
      const feature = roadFeature(object);
      if (!feature) return;
      seenRoads.add(object.uuid);
      roads.push(feature);
    });
  }

  const areas: WorldMapAreaFeature[] = [];
  const addNamedArea = (name: string, kind: WorldMapAreaKind) => {
    for (const root of roots) {
      const object = root.getObjectByName(name);
      if (!object) continue;
      const feature = objectArea(object, name, kind);
      if (feature) areas.push(feature);
      return;
    }
  };

  addNamedArea('river_water_surface', 'water');
  addNamedArea('springfield_town_square_jebediah', 'park');
  addNamedArea('goldenrod_civic_plaza_fountain', 'paved');
  addNamedArea('countryside_farmland', 'farmland');
  addNamedArea('football_pitch_grass', 'sports');
  addNamedArea('magnet_track_walkable_deck', 'rail');

  // District builders can tag authored surfaces/footprints directly. This keeps
  // the map data source-driven as the world expands (the airport uses this for
  // terminal/apron/taxiway/runway footprints) instead of maintaining a second
  // hard-coded 2D atlas.
  const seenAreas = new Set(areas.map((area) => area.id));
  for (const root of roots) {
    root.traverse((object) => {
      const rawKind = object.userData.mapAreaKind as WorldMapAreaKind | undefined;
      if (!rawKind || seenAreas.has(object.uuid) || !object.visible) return;
      const feature = objectArea(object, object.uuid, rawKind);
      if (!feature) return;
      seenAreas.add(object.uuid);
      areas.push(feature);
    });
  }

  const bounds = { ...BASE_BOUNDS };
  const expand = (x: number, z: number, margin = 0) => {
    bounds.minX = Math.min(bounds.minX, x - margin);
    bounds.maxX = Math.max(bounds.maxX, x + margin);
    bounds.minZ = Math.min(bounds.minZ, z - margin);
    bounds.maxZ = Math.max(bounds.maxZ, z + margin);
  };
  for (const road of roads) {
    if (road.shape === 'polygon') road.points.forEach((point) => expand(point.x, point.z, 8));
    else {
      expand(road.x - road.outerRadius, road.z - road.outerRadius, 8);
      expand(road.x + road.outerRadius, road.z + road.outerRadius, 8);
    }
  }
  for (const area of areas) {
    expand(area.x - area.width * 0.5, area.z - area.depth * 0.5, 5);
    expand(area.x + area.width * 0.5, area.z + area.depth * 0.5, 5);
  }
  // Some large districts need map coverage beyond their visible map-area surfaces
  // (for example the airport perimeter/future expansion reserve). Builders can add
  // zero-render Object3D anchors instead of drawing an oversized fake footprint.
  for (const root of roots) {
    root.traverse((object) => {
      if (object.userData.mapBoundsAnchor !== true) return;
      const world = object.getWorldPosition(new THREE.Vector3());
      expand(world.x, world.z, 0);
    });
  }
  landmarks.forEach((landmark) => expand(landmark.x, landmark.z, 18));

  // Round outward to stable ten-metre boundaries so the atlas does not twitch if
  // a decorative mesh changes by a few centimetres in a later revision.
  bounds.minX = Math.floor(bounds.minX / 10) * 10;
  bounds.maxX = Math.ceil(bounds.maxX / 10) * 10;
  bounds.minZ = Math.floor(bounds.minZ / 10) * 10;
  bounds.maxZ = Math.ceil(bounds.maxZ / 10) * 10;

  return { bounds, roads, areas };
}
