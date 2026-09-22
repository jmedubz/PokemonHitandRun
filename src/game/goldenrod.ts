import * as THREE from 'three';
import { createMaterial, createSurfaceMaterial, createStableSidewalkMaterial, createGlassMaterial, createStylizedCityTreeModel } from './models';
import {
  ArcadeMachineInfo,
  DestructibleProp,
  GrassPatch,
  MapLandmark,
  PokemonCharacterId,
  VehicleModelType,
} from '../types';
import {
  createProfessorOakModel,
  createPikachuModel,
  createCharmanderModel,
  createPoliwayModel,
} from './models';
import { Door, WallBox, markWalkableStairSurface, markStairRailing } from './doors';
import { addRoadsideLandscaping } from './landscaping';
import { OAK_LAB_NEW_GAME_START } from './spawnPoints';

export interface GoldenrodBuildResult {
  group: THREE.Group;
  destructibles: DestructibleProp[];
  grassPatches: GrassPatch[];
  doors: Door[];
  wallColliders: WallBox[];
  oakLab: {
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    oakPos: THREE.Vector3;
    starters: { id: PokemonCharacterId; name: string; pos: THREE.Vector3; mesh: THREE.Group; highlight: THREE.Mesh }[];
    exitPos: THREE.Vector3;
  };
  pokemonCenter: {
    receptionistPos: THREE.Vector3;
    bedPos: THREE.Vector3;
    recoveryPos: THREE.Vector3;
  };
  playerGarage: {
    pos: THREE.Vector3;
    servicePos: THREE.Vector3;
    resetPos: THREE.Vector3;
    carBays: { type: VehicleModelType; name: string; pos: THREE.Vector3; rotationY: number }[];
  };
  trainService: {
    update: (dt: number) => void;
    serviceGroup: THREE.Group;
    eastElevatorGround: THREE.Vector3;
    eastElevatorPlatform: THREE.Vector3;
    westElevatorGround: THREE.Vector3;
    westElevatorPlatform: THREE.Vector3;
    eastPlatformPos: THREE.Vector3;
    westPlatformPos: THREE.Vector3;
    trainMesh: THREE.Group;
    trainInteriorFloorY: number;
    trainInteriorBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    trainInteriorBlockers: { minX: number; maxX: number; minZ: number; maxZ: number }[];
    trainDoorLocalPositions: THREE.Vector3[];
    getTrainDoorWorldPositions: () => THREE.Vector3[];
    isTrainStopped: () => boolean;
    getStoppedStation: () => 'goldenrod' | 'springfield' | null;
    passengers: { name: string; localPos: THREE.Vector3; mesh: THREE.Group; dialogues: string[] }[];
    elevator: {
      cabin: THREE.Group;
      groundPos: THREE.Vector3;
      platformPos: THREE.Vector3;
      requestLevel: (level: 'ground' | 'platform') => void;
      getState: () => { y: number; level: 'ground' | 'platform' | 'between'; moving: boolean; doorsOpen: boolean; target: 'ground' | 'platform' };
    };
    springfieldElevator: {
      cabin: THREE.Group;
      groundPos: THREE.Vector3;
      platformPos: THREE.Vector3;
      requestLevel: (level: 'ground' | 'platform') => void;
      getState: () => { y: number; level: 'ground' | 'platform' | 'between'; moving: boolean; doorsOpen: boolean; target: 'ground' | 'platform' };
    };
  };
  twinTowerService: {
    update: (dt: number) => void;
    elevators: Record<'west' | 'east', {
      cabin: THREE.Group;
      groundPos: THREE.Vector3;
      roofPos: THREE.Vector3;
      requestLevel: (level: 'ground' | 'roof') => void;
      getState: () => { y: number; level: 'ground' | 'roof' | 'between'; moving: boolean; doorsOpen: boolean; target: 'ground' | 'roof' };
    }>;
  };
  landmarks: MapLandmark[];
  arcadeMachines?: ArcadeMachineInfo[];
}

function enableInteriorFaces(group: THREE.Object3D) {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const makeDoubleSided = (material: THREE.Material) => {
      const clone = material.clone();
      clone.side = THREE.DoubleSide;
      clone.needsUpdate = true;
      return clone;
    };
    if (Array.isArray(obj.material)) obj.material = obj.material.map(makeDoubleSided);
    else obj.material = makeDoubleSided(obj.material);
  });
}

function markSolid(...meshes: THREE.Object3D[]) {
  meshes.forEach((mesh) => {
    mesh.userData.solidCollider = true;
    mesh.userData.colliderPadding = 0.015;
  });
}

/** Reusable seat metadata consumed by App.tsx. The visible seat stays solid, while
 * the player is placed on its actual top surface and faces the authored local direction. */
function markSittable(seat: THREE.Object3D, label = 'Seat', facingX = 0, facingZ = 1) {
  seat.userData.sittable = true;
  seat.userData.seatLabel = label;
  seat.userData.sitFacingLocal = [facingX, facingZ];
}

// Shared interior authoring rules for a third-person game. Keep these values in one
// place so future rooms do not slowly regress into cramped, camera-hostile spaces.
const THIRD_PERSON_INTERIOR = {
  minDoorWidth: 2.8,
  radioStudioDoorWidth: 3.8,
  entranceClearDepth: 4.0,
  centralAisleHalfWidth: 1.45,
  furnitureWallMargin: 0.75,
} as const;


/**
 * Build a genuinely hollow enterable building instead of using one giant BoxGeometry.
 * A single box looks fine outside but disappears/turns inside-out when the camera enters it.
 * Separate wall slabs give every room real visible interior surfaces and an actual doorway.
 */
function addEnterableShell(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  wallMaterial: THREE.Material,
  floorMaterial: THREE.Material,
  doorWidth: number,
  doorHeight = 3.8
) {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(width - 0.7, 0.22, depth - 0.7), floorMaterial);
  floor.position.set(0, 0.11, 0);
  floor.userData.walkable = true;
  floor.userData.walkablePriority = 20;

  const wallT = 0.65;
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallT), wallMaterial);
  back.position.set(0, height / 2, -depth / 2);
  const left = new THREE.Mesh(new THREE.BoxGeometry(wallT, height, depth), wallMaterial);
  left.position.set(-width / 2, height / 2, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(wallT, height, depth), wallMaterial);
  right.position.set(width / 2, height / 2, 0);

  const frontPieceW = Math.max(0.5, (width - doorWidth) / 2);
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(frontPieceW, height, wallT), wallMaterial);
  frontL.position.set(-(doorWidth / 2 + frontPieceW / 2), height / 2, depth / 2);
  const frontR = new THREE.Mesh(new THREE.BoxGeometry(frontPieceW, height, wallT), wallMaterial);
  frontR.position.set(doorWidth / 2 + frontPieceW / 2, height / 2, depth / 2);
  const headerH = Math.max(0.4, height - doorHeight);
  const header = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, headerH, wallT), wallMaterial);
  header.position.set(0, doorHeight + headerH / 2, depth / 2);

  group.add(floor, back, left, right, frontL, frontR, header);
  markSolid(back, left, right, frontL, frontR, header);
  return { floor, back, left, right, frontL, frontR, header };
}

export function buildGoldenrodCity(): GoldenrodBuildResult {
  const root = new THREE.Group();
  const doors: Door[] = [];
  const wallColliders: WallBox[] = [];
  root.name = 'goldenrod_city_district';

  const destructibles: DestructibleProp[] = [];
  const grassPatches: GrassPatch[] = [];
  const landmarks: MapLandmark[] = [];
  const arcadeMachines: ArcadeMachineInfo[] = [];

  // Materials for Japanese Pokémon City aesthetic (PS2/GameCube palette)
  const roadMat = createSurfaceMaterial(0x30343a, 'asphalt', 0.92, 0.03, 22, 22);
  roadMat.polygonOffset = true;
  roadMat.polygonOffsetFactor = -1;
  roadMat.polygonOffsetUnits = -1;
  const roadYellowLineMat = createMaterial(0xffd54f, 0.5, 0.1);
  const roadWhiteLineMat = createMaterial(0xffffff, 0.5, 0.1);
  roadYellowLineMat.polygonOffset = true;
  roadYellowLineMat.polygonOffsetFactor = -2;
  roadYellowLineMat.polygonOffsetUnits = -2;
  roadWhiteLineMat.polygonOffset = true;
  roadWhiteLineMat.polygonOffsetFactor = -2;
  roadWhiteLineMat.polygonOffsetUnits = -2;
  const sidewalkMat = createStableSidewalkMaterial(0x737d82, 0.9, 0.01);
  const curbMat = createSurfaceMaterial(0xb0a89c, 'concrete', 0.88, 0.02, 7, 7);
  const pokeRedMat = createMaterial(0xe53935, 0.6, 0.1);
  const pokeDarkRedMat = createMaterial(0xb71c1c, 0.6, 0.1);
  const pokeWhiteMat = createMaterial(0xf5f5f5, 0.4, 0.1);
  const pokeBlueMat = createMaterial(0x1e88e5, 0.5, 0.1);
  const pokeCyanMat = createMaterial(0x00acc1, 0.4, 0.2);
  const pokeYellowMat = createMaterial(0xfdd835, 0.5, 0.1);
  const pokeCreamMat = createSurfaceMaterial(0xfff8e7, 'concrete', 0.74, 0.02, 5, 5);
  const pokePinkMat = createMaterial(0xf06292, 0.6, 0.1);
  const pokeMintMat = createMaterial(0x80cbc4, 0.6, 0.1);
  const pokeIndigoMat = createMaterial(0x3949ab, 0.6, 0.1);
  const pokeOrangeRoofMat = createMaterial(0xf57c00, 0.6, 0.1);
  const steelMat = createSurfaceMaterial(0x90a4ae, 'metal', 0.32, 0.72, 3, 3);
  const glassMat = createGlassMaterial(0x9eddf6, 0.46, 0.16);
  const woodMat = createSurfaceMaterial(0x6d4c41, 'wood', 0.82, 0.02, 5, 5);
  const grassMat = createSurfaceMaterial(0x43a047, 'grass', 0.96, 0.0, 12, 12);
  const markRoadCritical = (...meshes: THREE.Object3D[]) => {
    for (const mesh of meshes) mesh.userData.roadCriticalDetail = true;
  };

  // -------------------------------------------------------------------------
  // 1. ROAD NETWORK & SIDEWALKS FOR GOLDENROD CITY (X: 100 to 320, Z: -180 to 180)
  // -------------------------------------------------------------------------
  const streetsGroup = new THREE.Group();
  streetsGroup.name = 'goldenrod_streets';

  // Goldenrod Main Avenue (North-South): terminate exactly at the northern
  // viaduct junction (Z=-170) and southern country-road junction (Z=150).
  // Older versions continued past both junctions as unexplained road stubs.
  const mainAve = new THREE.Mesh(new THREE.BoxGeometry(16, 0.15, 320), roadMat);
  mainAve.position.set(200, 0.08, -10);
  streetsGroup.add(mainAve);

  // Main Avenue Center Double Yellow Line
  for (let z = -165; z <= 145; z += 10) {
    const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.026, 5), roadYellowLineMat);
    stripeL.position.set(199.6, 0.172, z);
    const stripeR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.026, 5), roadYellowLineMat);
    stripeR.position.set(200.4, 0.172, z);
    markRoadCritical(stripeL, stripeR);
    streetsGroup.add(stripeL, stripeR);
  }

  // Rebuilt Goldenrod grid: every secondary road now terminates at another road,
  // never as a short asphalt stub in grass. The west/east avenues extend to the
  // north/south perimeter streets, creating a complete rectangular loop around
  // the three cross streets and Main Avenue.
  const crossNorth = new THREE.Mesh(new THREE.BoxGeometry(200, 0.15, 14), roadMat);
  crossNorth.name = 'goldenrod_radio_tower_boulevard';
  crossNorth.position.set(210, 0.08, 90);

  const crossCenter = new THREE.Mesh(new THREE.BoxGeometry(200, 0.15, 14), roadMat);
  crossCenter.name = 'goldenrod_gym_flower_way';
  crossCenter.position.set(210, 0.08, 0);

  const crossSouth = new THREE.Mesh(new THREE.BoxGeometry(200, 0.15, 14), roadMat);
  crossSouth.name = 'goldenrod_station_garage_way';
  crossSouth.position.set(210, 0.08, -90);

  const westAve = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 300), roadMat);
  westAve.name = 'goldenrod_west_avenue';
  westAve.position.set(110, 0.08, 0);

  const eastAve = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 300), roadMat);
  eastAve.name = 'goldenrod_east_avenue';
  eastAve.position.set(310, 0.08, 0);

  // The south bridge already supplies asphalt up to X=130 at Z=150. Start the
  // city-owned perimeter road exactly there instead of stacking another coplanar
  // road over the bridge/old highway feeder from X=110..200.
  const northPerimeter = new THREE.Mesh(new THREE.BoxGeometry(180, 0.15, 14), roadMat);
  northPerimeter.name = 'goldenrod_north_perimeter_road';
  northPerimeter.position.set(220, 0.08, 150);
  const southPerimeter = new THREE.Mesh(new THREE.BoxGeometry(200, 0.15, 14), roadMat);
  southPerimeter.name = 'goldenrod_south_perimeter_road';
  southPerimeter.position.set(210, 0.08, -150);

  streetsGroup.add(crossNorth, crossCenter, crossSouth, westAve, eastAve, northPerimeter, southPerimeter);

  // Rounded junction pads hide rectangular seam corners and provide a generous,
  // continuous turning surface. They sit only a few millimetres above the base
  // roads, too small to create a driving bump but enough to prevent coplanar
  // overlap flicker at the intersections.
  const goldenrodIntersections = new THREE.Group();
  goldenrodIntersections.name = 'goldenrod_rounded_intersections';
  const addGoldenrodIntersection = (x: number, z: number, radius = 8.4) => {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.16, 28), roadMat);
    pad.name = `goldenrod_intersection_${x}_${z}`;
    pad.position.set(x, 0.083, z);
    pad.userData.walkable = true;
    pad.userData.walkablePriority = 7;
    pad.userData.roadCriticalDetail = true;
    goldenrodIntersections.add(pad);
  };
  for (const x of [110, 200, 310]) {
    for (const z of [-150, -90, 0, 90, 150]) {
      // The west-avenue/south-bridge seam already has overlapping 14 m asphalt.
      // Keep its cosmetic rounding inside the visible rail rather than letting
      // the junction pad extend into the bridge-edge barrier at Z=156.8.
      const radius = x === 200 ? 8.6 : (x === 110 && z === 150 ? 6.25 : 8.2);
      addGoldenrodIntersection(x, z, radius);
    }
  }
  streetsGroup.add(goldenrodIntersections);

  // Consistent dashed centre guidance on every two-way secondary street. Main
  // Avenue keeps its existing double-yellow treatment. Markings sit above the
  // asphalt with polygon offset, so the rebuilt joins do not z-fight.
  const addHorizontalRoadDashes = (z: number, xMin: number, xMax: number) => {
    for (let x = xMin + 7; x <= xMax - 7; x += 10) {
      if (Math.abs(x - 200) < 10 || Math.abs(x - 110) < 9 || Math.abs(x - 310) < 9) continue;
      const dash = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.026, 0.24), roadYellowLineMat);
      dash.position.set(x, 0.172, z);
      markRoadCritical(dash);
      streetsGroup.add(dash);
    }
  };
  const addVerticalRoadDashes = (x: number, zMin: number, zMax: number) => {
    for (let z = zMin + 7; z <= zMax - 7; z += 10) {
      if ([ -150, -90, 0, 90, 150 ].some((crossZ) => Math.abs(z - crossZ) < 9)) continue;
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.026, 4.6), roadYellowLineMat);
      dash.position.set(x, 0.172, z);
      markRoadCritical(dash);
      streetsGroup.add(dash);
    }
  };
  [-150, -90, 0, 90].forEach((z) => addHorizontalRoadDashes(z, 110, 310));
  addHorizontalRoadDashes(150, 130, 310);
  addVerticalRoadDashes(110, -150, 150);
  addVerticalRoadDashes(310, -150, 150);

  // Pedestrian crossings are authored from the ROAD AXIS, not by manually
  // rotating a generic decal. An east-west road gets north-south stripes and a
  // north-south road gets east-west stripes, so every crossing actually runs from
  // footpath to footpath across the traffic lanes.
  let pedestrianCrossingIndex = 0;
  const addCrosswalkAcrossRoad = (cx: number, cz: number, roadAxis: 'x' | 'z', roadWidth: number) => {
    const stripeLength = Math.max(5.0, roadWidth - 1.0);
    for (let i = -3; i <= 3; i++) {
      const offset = i * 1.15;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(roadAxis === 'x' ? 0.72 : stripeLength, 0.026, roadAxis === 'x' ? stripeLength : 0.72),
        roadWhiteLineMat
      );
      if (roadAxis === 'x') stripe.position.set(cx + offset, 0.174, cz);
      else stripe.position.set(cx, 0.174, cz + offset);
      markRoadCritical(stripe);
      streetsGroup.add(stripe);
    }

    const marker = new THREE.Object3D();
    marker.name = `goldenrod_pedestrian_crossing_${pedestrianCrossingIndex++}`;
    marker.position.set(cx, 0.18, cz);
    marker.userData.pedestrianCrossingMarker = true;
    marker.userData.roadAxis = roadAxis;
    marker.userData.roadWidth = roadWidth;
    streetsGroup.add(marker);
  };

  // Main Avenue intersections: two crossings across Main and two across each
  // cross street. Offsetting them outside the turning box leaves the junction
  // itself clear for vehicles.
  for (const junctionZ of [-90, 0, 90]) {
    addCrosswalkAcrossRoad(200, junctionZ - 10.5, 'z', 16);
    addCrosswalkAcrossRoad(200, junctionZ + 10.5, 'z', 16);
    addCrosswalkAcrossRoad(188.5, junctionZ, 'x', 14);
    addCrosswalkAcrossRoad(211.5, junctionZ, 'x', 14);
  }

  [mainAve, crossNorth, crossCenter, crossSouth, westAve, eastAve, northPerimeter, southPerimeter].forEach((mesh) => {
    mesh.userData.walkable = true;
    mesh.userData.walkablePriority = 5;
  });
  streetsGroup.traverse((obj) => {
    obj.userData.permanentRoadGeometry = true;
    obj.userData.interactivePhysicsObject = false;
    if (obj instanceof THREE.Mesh && obj.material === roadMat) obj.userData.mapRoadSurface = true;
  });
  root.add(streetsGroup);

  // Complete the pedestrian network around the secondary/cross streets. Earlier
  // versions only gave Main Avenue continuous pavements, leaving several shops and
  // stations fronting directly onto asphalt/grass. Every footpath/curb run is now
  // split at real road junctions so pale concrete never lies across a traffic lane.
  const pedestrianGroup = new THREE.Group();
  pedestrianGroup.name = 'goldenrod_continuous_footpaths';
  type FootpathGap = { center: number; halfGap: number };
  const splitFootpathSpan = (min: number, max: number, gaps: FootpathGap[]) => {
    const sorted = gaps
      .map((gap) => ({ min: Math.max(min, gap.center - gap.halfGap), max: Math.min(max, gap.center + gap.halfGap) }))
      .filter((gap) => gap.max > min && gap.min < max)
      .sort((a, b) => a.min - b.min);
    const spans: Array<[number, number]> = [];
    let cursor = min;
    for (const gap of sorted) {
      if (gap.min > cursor + 0.05) spans.push([cursor, gap.min]);
      cursor = Math.max(cursor, gap.max);
    }
    if (cursor < max - 0.05) spans.push([cursor, max]);
    return spans;
  };
  const addHorizontalFootpaths = (
    z: number, length: number, roadWidth: number, centerX = 200, gaps: FootpathGap[] = []
  ) => {
    const minX = centerX - length / 2 - 1;
    const maxX = centerX + length / 2 + 1;
    for (const [x1, x2] of splitFootpathSpan(minX, maxX, gaps)) {
      const segLength = x2 - x1;
      for (const side of [-1, 1]) {
        const path = new THREE.Mesh(new THREE.BoxGeometry(segLength, 0.22, 3.4), sidewalkMat);
        path.name = `goldenrod_sidewalk_h_${z}_${side}_${x1.toFixed(1)}_${x2.toFixed(1)}`;
        path.position.set((x1 + x2) / 2, 0.165, z + side * (roadWidth / 2 + 1.75));
        path.renderOrder = 20;
        path.userData.walkable = true; path.userData.walkablePriority = 6; path.userData.sidewalkSurface = true; path.userData.roadCriticalDetail = true;
        const curb = new THREE.Mesh(new THREE.BoxGeometry(segLength, 0.30, 0.28), curbMat);
        curb.position.set((x1 + x2) / 2, 0.15, z + side * (roadWidth / 2 + 0.16));
        curb.userData.curbSurface = true; curb.userData.roadCriticalDetail = true;
        pedestrianGroup.add(path, curb);
      }
    }
  };
  const addVerticalFootpaths = (
    x: number, length: number, roadWidth: number, centerZ = 0, gaps: FootpathGap[] = []
  ) => {
    const minZ = centerZ - length / 2 - 1;
    const maxZ = centerZ + length / 2 + 1;
    for (const [z1, z2] of splitFootpathSpan(minZ, maxZ, gaps)) {
      const segLength = z2 - z1;
      for (const side of [-1, 1]) {
        const path = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, segLength), sidewalkMat);
        path.name = `goldenrod_sidewalk_v_${x}_${side}_${z1.toFixed(1)}_${z2.toFixed(1)}`;
        path.position.set(x + side * (roadWidth / 2 + 1.75), 0.165, (z1 + z2) / 2);
        path.renderOrder = 20;
        path.userData.walkable = true; path.userData.walkablePriority = 6; path.userData.sidewalkSurface = true; path.userData.roadCriticalDetail = true;
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.30, segLength), curbMat);
        curb.position.set(x + side * (roadWidth / 2 + 0.16), 0.15, (z1 + z2) / 2);
        curb.userData.curbSurface = true; curb.userData.roadCriticalDetail = true;
        pedestrianGroup.add(path, curb);
      }
    }
  };
  const horizontalJunctionGaps: FootpathGap[] = [
    { center: 110, halfGap: 8.2 }, { center: 200, halfGap: 9.2 }, { center: 310, halfGap: 8.2 },
  ];
  const verticalJunctionGaps: FootpathGap[] = [-170, -150, -90, 0, 90, 150].map((center) => ({ center, halfGap: center === -170 ? 9.5 : 8.2 }));
  // Every path/curb now stops at the edge of an intersecting road. Continuous
  // sidewalk boxes previously crossed the junctions and sat ~7cm ABOVE asphalt,
  // creating the random pale/white floor panels seen while driving.
  addHorizontalFootpaths(150, 182, 14, 220, horizontalJunctionGaps);
  addHorizontalFootpaths(90, 202, 14, 210, horizontalJunctionGaps);
  addHorizontalFootpaths(0, 202, 14, 210, horizontalJunctionGaps);
  addHorizontalFootpaths(-90, 202, 14, 210, horizontalJunctionGaps);
  addHorizontalFootpaths(-150, 202, 14, 210, horizontalJunctionGaps);
  addVerticalFootpaths(110, 302, 14, 0, verticalJunctionGaps);
  addVerticalFootpaths(310, 302, 14, 0, verticalJunctionGaps);
  // Main Avenue uses the same segmented system instead of two uninterrupted
  // sidewalk/curb slabs cutting across all five cross streets.
  addVerticalFootpaths(200, 322, 16, -10, verticalJunctionGaps);
  pedestrianGroup.traverse((obj) => {
    obj.userData.permanentRoadGeometry = true;
    obj.userData.interactivePhysicsObject = false;
  });
  root.add(pedestrianGroup);

  // Practical access lanes from the street grid to the front doors of major
  // buildings. They sit a hair above the terrain to avoid z-fighting and make
  // the city read as one connected road network instead of isolated landmarks.
  const accessRoads = new THREE.Group();
  accessRoads.name = 'goldenrod_building_access_roads';
  const addAccessRoad = (x1:number, z1:number, x2:number, z2:number, width=5.5) => {
    const dx=x2-x1, dz=z2-z1;
    const len=Math.hypot(dx,dz);
    const road=new THREE.Mesh(new THREE.BoxGeometry(width,0.12,len),roadMat);
    road.position.set((x1+x2)/2,0.075,(z1+z2)/2);
    road.rotation.y=Math.atan2(dx,dz);
    road.userData.walkable=true;
    road.userData.walkablePriority=6;
    accessRoads.add(road);
    return road;
  };
  // Building approaches first leave each doorway along its outward facade normal,
  // then turn toward the nearest street. This prevents the access asphalt itself
  // from cutting sideways through the building shell. These are intentionally
  // narrow frontage/driveway lanes rather than main traffic arterials.
  // Radio Tower (south-facing entrance) -> Radio Tower Boulevard.
  addAccessRoad(260,108,260,90,4.2);
  // Pokémon Center -> central cross street.
  addAccessRoad(250,-21,250,0,4.4);
  // Department Store -> north cross street.
  addAccessRoad(140,82,140,90,5.6);
  // Gym -> central cross street.
  addAccessRoad(140,-20,140,0,4.0);
  // Magnet Train station -> south cross street.
  addAccessRoad(240,-101,240,-90,4.5);
  // Bike Shop: leave the door first, then turn west to West Avenue.
  addAccessRoad(150,27,150,32.5,3.2);
  addAccessRoad(150,32.5,110,32.5,4.0);
  // Flower Shop: relocated to the east side of Main Avenue so the new skyline
  // plaza has a clean footprint. The florist now faces WEST toward Main Avenue,
  // and this short apron meets the road edge without cutting through the shop.
  addAccessRoad(213,16,208,16,3.6);
  // Liberty Plaza Offices (the former Florist Apartments at 250/60) was moved
  // east/back to clear the Twin Towers site and now connects north to Z=90.
  addAccessRoad(286,71,286,83,3.6);
  // Game Corner: leave the facade first, then turn west to West Avenue.
  addAccessRoad(150,-52,150,-45,4.4);
  addAccessRoad(150,-45,110,-45,4.0);
  // Bill's House: leave the door first, then turn east to East Avenue.
  addAccessRoad(285,-63,285,-55,2.2);
  addAccessRoad(285,-55,310,-55,4.0);
  // Professor Oak's relocated lab -> the north-viaduct/Main Avenue junction.
  addAccessRoad(200,-185,200,-170,5.6);
  accessRoads.traverse((obj) => {
    obj.userData.permanentRoadGeometry = true;
    obj.userData.interactivePhysicsObject = false;
    if (obj instanceof THREE.Mesh && obj.material === roadMat) obj.userData.mapRoadSurface = true;
  });
  root.add(accessRoads);

  // -------------------------------------------------------------------------
  // 2. STREET FURNITURE, PLANTERS & TREES (Pokémon style)
  // -------------------------------------------------------------------------
  const propsGroup = new THREE.Group();
  propsGroup.name = 'goldenrod_props';

  const lampGeo = new THREE.CylinderGeometry(0.08, 0.12, 4.5, 8);
  const lampLanternGeo = new THREE.BoxGeometry(0.6, 0.8, 0.6);
  const lampLanternMat = createMaterial(0xfff59d, 0.2, 0.8);

  let streetLampIndex = 0;
  const addStreetLamp = (x: number, z: number) => {
    const lamp = new THREE.Group();
    lamp.position.set(x, 0, z);
    const post = new THREE.Mesh(lampGeo, steelMat);
    post.position.y = 2.25;
    const lantern = new THREE.Mesh(lampLanternGeo, lampLanternMat);
    lantern.position.y = 4.6;
    lamp.add(post, lantern);
    propsGroup.add(lamp);
    destructibles.push({
      id: `goldenrod_lamp_${streetLampIndex++}`,
      mesh: lamp,
      type: 'lamp',
      position: { x, y: 0, z },
      destroyed: false,
    });
  };

  // Street lamps along Main Avenue. Never put a lamp in the swept footprint of
  // a cross street/perimeter junction; the road-clearance audit treats those
  // intersections as full turning envelopes for buses and police vehicles.
  for (let z = -120; z <= 120; z += 30) {
    if ([-90, 0, 90].includes(z)) continue;
    addStreetLamp(188.5, z);
    // The east-side Z=60 lamp used to sit directly in the new Liberty Plaza
    // approach. The west-side lamp still lights the junction, so leave this bay clear.
    if (z !== 60) addStreetLamp(211.5, z);
  }

  // Pokémon Flower Planters with colorful blooming flowers
  const planterGeo = new THREE.BoxGeometry(3.5, 0.7, 1.2);
  const soilGeo = new THREE.BoxGeometry(3.3, 0.15, 1.0);
  const flowerGeo = new THREE.SphereGeometry(0.25, 6, 6);

  const addPlanter = (x: number, z: number, rotationY = 0) => {
    const planter = new THREE.Group();
    planter.position.set(x, 0, z);
    planter.rotation.y = rotationY;
    const box = new THREE.Mesh(planterGeo, pokeCreamMat);
    box.position.y = 0.35;
    const soil = new THREE.Mesh(soilGeo, createMaterial(0x3e2723));
    soil.position.y = 0.72;
    planter.add(box, soil);
    markSolid(box);

    const flowerColors = [0xf44336, 0xffeb3b, 0x2196f3, 0xe91e63, 0xff9800];
    for (let i = 0; i < 5; i++) {
      const fMat = createMaterial(flowerColors[i % flowerColors.length]);
      const flower = new THREE.Mesh(flowerGeo, fMat);
      flower.position.set(-1.2 + i * 0.6, 0.95, (i % 2 === 0 ? 0.15 : -0.15));
      planter.add(flower);
    }
    propsGroup.add(planter);
  };

  addPlanter(187.8, 15, 0);
  addPlanter(187.8, -15, 0);
  addPlanter(212.2, 15, 0);
  addPlanter(212.2, -15, 0);
  addPlanter(187.8, 75, 0);
  addPlanter(212.2, 75, 0);
  addPlanter(187.8, -75, 0);
  addPlanter(212.2, -75, 0);

  // Park Benches
  const benchGeo = new THREE.BoxGeometry(2.0, 0.5, 0.8);
  const addBench = (x: number, z: number, rotationY = 0) => {
    const bench = new THREE.Group();
    bench.position.set(x, 0, z);
    bench.rotation.y = rotationY;
    const seat = new THREE.Mesh(benchGeo, woodMat);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.15), woodMat);
    back.position.set(0, 0.9, -0.35);
    bench.add(seat, back);
    markSolid(seat, back);
    markSittable(seat, 'Park bench');
    propsGroup.add(bench);
  };

  addBench(186.5, 35, Math.PI / 2);
  addBench(186.5, -35, Math.PI / 2);
  addBench(213.5, 35, -Math.PI / 2);
  addBench(213.5, -35, -Math.PI / 2);

  // Pokémon Rounded Spherical Trees along city footpaths
  let cityTreeIndex = 0;
  const addPokeCityTree = (x: number, z: number) => {
    const tree = new THREE.Group();
    tree.name = `kickable_tree_goldenrod_${cityTreeIndex}`;
    tree.userData.kickableTree = true;
    tree.userData.treePhysicsProfile = 'arcade_reusable';
    tree.position.set(x, 0, z);
    // Visual-only detail hierarchy. The destructible root/pivot and shared tree
    // physics metadata are unchanged, so kick/fall/landing behaviour remains owned
    // by WorldInteractionManager rather than by the decorative branches/leaves.
    const visual = createStylizedCityTreeModel(0.92);
    visual.name = 'goldenrod_tree_visual';
    tree.add(visual);
    propsGroup.add(tree);
    destructibles.push({
      id: `goldenrod_tree_${cityTreeIndex++}`,
      mesh: tree,
      type: 'tree',
      position: { x, y: 0, z },
      destroyed: false,
    });
  };

  for (let z = -140; z <= 140; z += 40) {
    if (Math.abs(z) === 0 || Math.abs(z) === 90) continue;
    addPokeCityTree(185.5, z);
    // Keep the new Liberty Plaza entrance throat free of the legacy east-side tree.
    if (z !== 60) addPokeCityTree(214.5, z);
  }

  root.add(propsGroup);

  // -------------------------------------------------------------------------
  // 3. IMPORTANT LANDMARK 1: GOLDENROD RADIO TOWER (X = 260, Z = 90)
  // -------------------------------------------------------------------------
  const radioTowerGroup = new THREE.Group();
  radioTowerGroup.position.set(260, 0, 120);
  // Face the entrance toward Radio Tower Boulevard. Previously the tower was
  // moved north but kept facing +Z, leaving its doorway on the far side and an
  // access road that physically crossed the building footprint.
  radioTowerGroup.rotation.y = Math.PI;
  radioTowerGroup.name = 'goldenrod_radio_tower';

  const rtPlaza = new THREE.Mesh(new THREE.BoxGeometry(42, 0.2, 38), sidewalkMat);
  rtPlaza.userData.sidewalkSurface = true; rtPlaza.userData.roadCriticalDetail = true;
  rtPlaza.position.y = 0.1;
  radioTowerGroup.add(rtPlaza);

  const rtBaseWidth = 26;
  const rtBaseDepth = 24;
  const rtBaseHeight = 12;
  addEnterableShell(radioTowerGroup, rtBaseWidth, rtBaseDepth, rtBaseHeight, pokeCreamMat, sidewalkMat, 5.0, 4.0);

  // The interactive Door below owns the entrance glass. Do not add a second
  // permanent pane here: it visually covered the opening even when the real door
  // was open and previously made the Radio Tower entrance look broken.
  const rtCanopy = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.6, 3.5), pokeRedMat);
  rtCanopy.userData.landableRoof = true;
  rtCanopy.position.set(0, 4.5, rtBaseDepth / 2 + 1.8);
  const rtSign = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 0.3), pokeDarkRedMat);
  rtSign.position.set(0, 7.5, rtBaseDepth / 2 + 0.2);
  radioTowerGroup.add(rtCanopy, rtSign);
  const radioTowerDoor = new Door({
    id: 'radio_tower_door', name: 'Radio Tower Lobby Doors', houseName: 'Goldenrod Radio Tower',
    type: 'double_slide', width: 4.8, height: 4.0,
    worldPos: new THREE.Vector3(260, 0, 108), rotationY: Math.PI, frameColor: 0xe53935, glassColor: 0x81d4fa,
  });
  root.add(radioTowerDoor.group); doors.push(radioTowerDoor);

  for (let f = 0; f < 2; f++) {
    const winRow = new THREE.Mesh(new THREE.BoxGeometry(22, 1.8, 0.3), glassMat);
    winRow.position.set(0, 3.5 + f * 4.0, -rtBaseDepth / 2 - 0.38);
    radioTowerGroup.add(winRow);
  }

  const rtTier2 = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 16), createMaterial(0x78909c));
  rtTier2.position.y = rtBaseHeight + 4;
  const rtBalconyRail = new THREE.Mesh(new THREE.BoxGeometry(24, 1.1, 22), steelMat);
  rtBalconyRail.position.y = rtBaseHeight + 0.55;
  radioTowerGroup.add(rtTier2, rtBalconyRail);

  const addDish = (dx: number, dz: number) => {
    const dishGroup = new THREE.Group();
    dishGroup.position.set(dx, rtBaseHeight + 1.5, dz);
    const dishStand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 6), steelMat);
    dishStand.position.y = 1.0;
    const dishBowl = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 12), pokeWhiteMat);
    dishBowl.rotation.x = -Math.PI / 3;
    dishBowl.position.set(0, 2.2, 0.4);
    dishGroup.add(dishStand, dishBowl);
    radioTowerGroup.add(dishGroup);
  };
  addDish(-9, 8);
  addDish(9, 8);
  addDish(9, -8);

  const mastHeight = 45;
  const mastY = rtBaseHeight + 8;
  const mastCore = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4.5, mastHeight, 4), steelMat);
  mastCore.position.y = mastY + mastHeight / 2;
  mastCore.rotation.y = Math.PI / 4;
  radioTowerGroup.add(mastCore);

  for (let h = 8; h < mastHeight; h += 9) {
    const ringScale = 4.5 - (h / mastHeight) * 3.3;
    const brace = new THREE.Mesh(new THREE.BoxGeometry(ringScale * 2, 0.4, ringScale * 2), pokeRedMat);
    brace.position.y = mastY + h;
    radioTowerGroup.add(brace);
  }

  const spireHeight = 22;
  const spireY = mastY + mastHeight;
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.8, spireHeight, 8), pokeWhiteMat);
  spire.position.y = spireY + spireHeight / 2;
  radioTowerGroup.add(spire);

  for (let s = 3; s < spireHeight; s += 5) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.8, 8), pokeRedMat);
    band.position.y = spireY + s;
    radioTowerGroup.add(band);
  }

  const beaconMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3344 })
  );
  beaconMesh.position.y = spireY + spireHeight + 0.5;
  radioTowerGroup.add(beaconMesh);

  root.add(radioTowerGroup);
  landmarks.push({
    id: 'goldenrod_radio_tower',
    name: 'Goldenrod Radio Tower',
    category: 'goldenrod',
    x: 260,
    z: 120,
    icon: 'radio',
    color: '#e53935',
  });

  // -------------------------------------------------------------------------
  // 4. IMPORTANT LANDMARK 2: GOLDENROD POKÉMON CENTER (X = 250, Z = -30)
  // -------------------------------------------------------------------------
  const pkmnCenterGroup = new THREE.Group();
  pkmnCenterGroup.position.set(250, 0, -30);
  pkmnCenterGroup.name = 'goldenrod_pokemon_center';

  const pcPlaza = new THREE.Mesh(new THREE.BoxGeometry(32, 0.2, 28), sidewalkMat);
  pcPlaza.userData.sidewalkSurface = true; pcPlaza.userData.roadCriticalDetail = true;
  pcPlaza.position.y = 0.1;
  pkmnCenterGroup.add(pcPlaza);

  // Real hollow Pokémon Center interior. The previous single BoxGeometry made
  // the walls disappear as soon as the camera crossed inside the building.
  addEnterableShell(
    pkmnCenterGroup,
    22,
    18,
    8,
    pokeWhiteMat,
    createMaterial(0xf2f6f8, 0.72, 0.05),
    4.8,
    4.0
  );

  const pcRoof = new THREE.Mesh(new THREE.ConeGeometry(17, 5.5, 4), pokeRedMat);
  pcRoof.userData.landableRoof = true;
  pcRoof.rotation.y = Math.PI / 4;
  pcRoof.scale.set(1.15, 1.0, 0.95);
  pcRoof.position.y = 8.0 + 2.75;
  const pcRoofTrim = new THREE.Mesh(new THREE.BoxGeometry(23.5, 0.8, 19.5), pokeWhiteMat);
  pcRoofTrim.userData.landableRoof = true;
  pcRoofTrim.position.y = 8.0;
  pkmnCenterGroup.add(pcRoof, pcRoofTrim);

  const pballOuter = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 16), pokeWhiteMat);
  pballOuter.rotation.x = Math.PI / 2;
  pballOuter.position.set(0, 8.8, 9.2);
  const pballRedHalf = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.22, 16, 1, false, 0, Math.PI), pokeRedMat);
  pballRedHalf.rotation.x = Math.PI / 2;
  pballRedHalf.position.set(0, 8.8, 9.22);
  const pballCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 12), pokeWhiteMat);
  pballCenter.rotation.x = Math.PI / 2;
  pballCenter.position.set(0, 8.8, 9.24);
  pkmnCenterGroup.add(pballOuter, pballRedHalf, pballCenter);

  // Decorative doorway FRAME only. The moving Door object below owns the actual
  // glass panels, so there must not be a permanent opaque box across the entrance.
  const pcDoorPostL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.0, 0.3), pokeCyanMat);
  pcDoorPostL.position.set(-2.55, 2.0, 9.15);
  const pcDoorPostR = pcDoorPostL.clone();
  pcDoorPostR.position.x = 2.55;
  const pcDoorHeader = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 0.3), pokeCyanMat);
  pcDoorHeader.position.set(0, 4.0, 9.15);
  const pcAwning = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.5, 2.5), pokeRedMat);
  pcAwning.userData.landableRoof = true;
  pcAwning.position.set(0, 4.3, 10.3);
  pkmnCenterGroup.add(pcDoorPostL, pcDoorPostR, pcDoorHeader, pcAwning);

  const pcWinL = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.2, 0.2), glassMat);
  pcWinL.position.set(-6.5, 3.0, 9.1);
  const pcWinR = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.2, 0.2), glassMat);
  pcWinR.position.set(6.5, 3.0, 9.1);
  pkmnCenterGroup.add(pcWinL, pcWinR);

  const pcLampMat = new THREE.MeshBasicMaterial({ color: 0xffe0a3 });
  const pcLampL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), pcLampMat);
  pcLampL.position.set(-3.5, 4.5, 10.0);
  const pcLampR = pcLampL.clone();
  pcLampR.position.x = 3.5;
  pkmnCenterGroup.add(pcLampL, pcLampR);

  // ---------------- Pokémon Center healing interior ----------------
  const pcCounterMat = createMaterial(0xe53935, 0.55, 0.08);
  const pcCounter = new THREE.Mesh(new THREE.BoxGeometry(11.5, 1.25, 1.4), pcCounterMat);
  pcCounter.position.set(0, 0.63, -2.7);
  pkmnCenterGroup.add(pcCounter);

  // Friendly receptionist / Nurse Joy-inspired low-poly attendant.
  const receptionist = new THREE.Group();
  receptionist.name = 'pokemon_center_receptionist';
  receptionist.position.set(0, 0, -4.7);
  const nurseBody = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.7, 8), createMaterial(0xfff7fb));
  nurseBody.position.y = 1.05;
  const nurseHead = new THREE.Mesh(new THREE.SphereGeometry(0.56, 10, 8), createMaterial(0xffd6c7));
  nurseHead.position.y = 2.15;
  const nurseHairL = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 7), createMaterial(0xf48fb1));
  nurseHairL.position.set(-0.48, 2.2, 0);
  const nurseHairR = nurseHairL.clone();
  nurseHairR.position.x = 0.48;
  const nurseCap = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.18, 0.48), createMaterial(0xffffff));
  nurseCap.position.set(0, 2.67, 0);
  const nurseCrossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.06), createMaterial(0xe53935));
  nurseCrossV.position.set(0, 2.68, 0.25);
  const nurseCrossH = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), createMaterial(0xe53935));
  nurseCrossH.position.set(0, 2.68, 0.25);
  receptionist.add(nurseBody, nurseHead, nurseHairL, nurseHairR, nurseCap, nurseCrossV, nurseCrossH);
  pkmnCenterGroup.add(receptionist);

  // Waiting-room benches are real reusable seats. They stay against the west wall
  // so the reception, healing-bed and entrance paths remain comfortably clear.
  for (const waitingZ of [-0.2, 3.0]) {
    const waitingBench = new THREE.Group();
    waitingBench.position.set(-8.25, 0, waitingZ);
    waitingBench.rotation.y = Math.PI / 2;
    const waitingSeat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.34, 0.82), createMaterial(0x90caf9, 0.72, 0.04));
    waitingSeat.position.y = 0.47;
    const waitingBack = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.85, 0.16), createMaterial(0xe3f2fd, 0.78, 0.02));
    waitingBack.position.set(0, 0.91, -0.34);
    waitingBench.add(waitingSeat, waitingBack);
    markSolid(waitingSeat, waitingBack);
    markSittable(waitingSeat, 'Pokémon Center waiting seat');
    pkmnCenterGroup.add(waitingBench);
  }

  // Healing bed / machine. The player is visually converted into a Poké Ball and
  // rests here for three seconds before being returned at full health.
  const healBed = new THREE.Group();
  healBed.name = 'pokemon_center_healing_bed';
  healBed.position.set(5.8, 0, -4.6);
  const bedBase = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.65, 2.4), createMaterial(0xe0e7ef));
  bedBase.position.y = 0.42;
  const bedPad = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 2.05), createMaterial(0x80deea, 0.5, 0.1));
  bedPad.position.y = 0.86;
  const bedHead = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.35, 2.4), createMaterial(0xef5350));
  bedHead.position.set(-1.95, 0.9, 0);
  const healGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0x66ffff })
  );
  healGlow.position.set(0, 2.1, 0);
  healBed.add(bedBase, bedPad, bedHead, healGlow);
  pkmnCenterGroup.add(healBed);

  const pcDoor = new Door({
    id: 'poke_center_door',
    name: 'Pokémon Center Glass Doors',
    houseName: 'Goldenrod Pokémon Center',
    type: 'double_slide',
    width: 4.8,
    height: 3.8,
    worldPos: new THREE.Vector3(250, 0, -21),
    frameColor: 0xe91e63,
    glassColor: 0x80deea,
  });
  root.add(pcDoor.group);
  doors.push(pcDoor);

  wallColliders.push(
    { id: 'pc_back', minX: 237, maxX: 263, minZ: -39.4, maxZ: -38.6 },
    { id: 'pc_left', minX: 236.6, maxX: 237.4, minZ: -39, maxZ: -21 },
    { id: 'pc_right', minX: 262.6, maxX: 263.4, minZ: -39, maxZ: -21 },
    { id: 'pc_front_l', minX: 236.6, maxX: 247.5, minZ: -21.4, maxZ: -20.6 },
    { id: 'pc_front_r', minX: 252.5, maxX: 263.4, minZ: -21.4, maxZ: -20.6 }
  );

  root.add(pkmnCenterGroup);
  landmarks.push({
    id: 'goldenrod_center',
    name: 'Goldenrod Pokémon Center',
    category: 'goldenrod',
    x: 250,
    z: -30,
    icon: 'heart',
    color: '#e91e63',
  });

  // -------------------------------------------------------------------------
  // 5. IMPORTANT LANDMARK 3: GOLDENROD DEPARTMENT STORE (X = 140, Z = 70)
  // -------------------------------------------------------------------------
  const deptStoreGroup = new THREE.Group();
  deptStoreGroup.position.set(140, 0, 70);
  deptStoreGroup.name = 'goldenrod_department_store';

  const dsWidth = 28;
  const dsDepth = 24;
  const dsHeight = 22;
  const dsEntranceWidth = 6.4;

  // Enterable multi-floor department store rather than a solid box.
  addEnterableShell(
    deptStoreGroup,
    dsWidth,
    dsDepth,
    dsHeight,
    pokeIndigoMat,
    createMaterial(0xe8e0d2, 0.82, 0.02),
    dsEntranceWidth,
    4.2
  );

  // Five usable retail levels. Instead of full slabs that accidentally block
  // the stairwell, each upper floor is built around a dedicated open stair bay.
  const dsFloorMat = createMaterial(0xd9d2c3, 0.8, 0.02);
  const dsShelfMat = createMaterial(0xf5f5f5, 0.7, 0.04);
  const dsFloorY = (floor:number) => floor * 4.4;

  const addUpperFloorAroundStairs = (floor:number) => {
    const y = dsFloorY(floor);
    // Main sales floor stops before the dedicated staircase bay on the east side.
    const main = new THREE.Mesh(new THREE.BoxGeometry(20.2,0.20,dsDepth-1.2),dsFloorMat);
    main.position.set(-3.4,y,0); main.userData.walkable=true; main.userData.walkablePriority=34;
    // Proper landings at both ends let alternate floors reverse direction naturally.
    const landingN = new THREE.Mesh(new THREE.BoxGeometry(6.2,0.20,4.2),dsFloorMat);
    landingN.name = `department_store_stair_landing_n_${floor}`;
    landingN.position.set(10.2,y,-8.8); markWalkableStairSurface(landingN, 45, 0.82);
    const landingS = landingN.clone(); landingS.name = `department_store_stair_landing_s_${floor}`; landingS.position.z=8.8;
    const bridgeN = new THREE.Mesh(new THREE.BoxGeometry(5.6,0.20,2.8),dsFloorMat);
    bridgeN.name = `department_store_stair_bridge_n_${floor}`;
    bridgeN.position.set(7.4,y,-8.6); markWalkableStairSurface(bridgeN, 46, 0.82);
    const bridgeS = bridgeN.clone(); bridgeS.name = `department_store_stair_bridge_s_${floor}`; bridgeS.position.z=8.6;
    deptStoreGroup.add(main,landingN,landingS,bridgeN,bridgeS);
  };
  for(let floor=1; floor<=4; floor++) addUpperFloorAroundStairs(floor);

  // Real broad switchback stairs. The previous single tilted slab technically
  // climbed between floors, but looked like a construction ramp and could catch the
  // controller where it intersected landings. Each level now has visible treads,
  // generous rails, a real landing, and a smooth walkable under-ramp just beneath
  // the treads so Pokémon can climb without precision jumping.
  const stairRise = 4.4;
  const stairRun = 14.4;
  const stairSteps = 12;
  const stepDepth = stairRun / stairSteps;
  const stepRise = stairRise / stairSteps;
  const stairWidth = 4.4;
  const stairX = 10.2;
  const stairAngle = Math.atan2(stairRise, stairRun);
  const stairLength = Math.hypot(stairRun, stairRise);
  const stairMat = createMaterial(0xb0bec5,0.55,0.20);
  const stairEdgeMat = createMaterial(0x607d8b,0.4,0.55);

  for(let floor=0; floor<5; floor++) {
    const baseY = dsFloorY(floor);
    const direction = floor % 2 === 0 ? -1 : 1; // south->north, then north->south
    const startZ = direction < 0 ? 7.2 : -7.2;
    for(let i=0;i<stairSteps;i++) {
      const height = stepRise * (i + 1);
      const step = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, height, stepDepth + 0.04), stairMat);
      step.name = `department_store_stair_${floor}_${i}`;
      step.position.set(stairX, baseY + height / 2, startZ + direction * (i + 0.5) * stepDepth);
      markWalkableStairSurface(step, 48, 0.82);
      deptStoreGroup.add(step);
    }

    // Smooth collision/walking surface sits a few centimetres below the visible
    // step noses. It does not replace the visible stairs; it only eliminates snagging.
    const smooth = new THREE.Mesh(
      new THREE.BoxGeometry(stairWidth - 0.28,0.12,stairLength),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.001, depthWrite: false })
    );
    smooth.position.set(stairX, baseY + stairRise/2 - 0.12, 0);
    smooth.rotation.x = direction < 0 ? stairAngle : -stairAngle;
    smooth.name = `department_store_stair_support_${floor}`;
    markWalkableStairSurface(smooth, 50, 0.82);
    deptStoreGroup.add(smooth);

    // Sloped handrails + periodic posts. Rails are real collision, but positioned
    // outside the 4.4m walking lane so they guide rather than trap the player.
    for(const side of [-1,1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,stairLength), stairEdgeMat);
      rail.position.set(stairX + side*(stairWidth/2 + 0.13), baseY + stairRise/2 + 0.78, 0);
      rail.rotation.x = direction < 0 ? stairAngle : -stairAngle;
      markStairRailing(rail);
      deptStoreGroup.add(rail);
      for(let i=0;i<=4;i++) {
        const t=i/4;
        const z=startZ + direction*t*stairRun;
        const post=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.82,0.10),stairEdgeMat);
        post.position.set(stairX + side*(stairWidth/2 + 0.13), baseY + t*stairRise + 0.41, z);
        markStairRailing(post); deptStoreGroup.add(post);
      }
    }
  }

  const addDepartmentSign=(floor:number,color:number,accent:number)=>{
    const y=dsFloorY(floor)+2.4;
    const sign=new THREE.Mesh(new THREE.BoxGeometry(8.5,1.0,0.16),createMaterial(color));
    sign.position.set(-5.0,y,-dsDepth/2+0.45);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(6.7,0.18,0.18),createMaterial(accent));
    stripe.position.set(-5.0,y,-dsDepth/2+0.56);
    deptStoreGroup.add(sign,stripe);
  };

  // Floor 1: Poké Balls & medicine.
  addDepartmentSign(0,0xe53935,0xffffff);
  [-7,-2,3].forEach((sx,aisle)=>{
    const shelf=new THREE.Mesh(new THREE.BoxGeometry(2.3,1.6,6.2),dsShelfMat); shelf.position.set(sx,0.82,-2); markSolid(shelf); deptStoreGroup.add(shelf);
    for(let i=0;i<5;i++){
      const ball=new THREE.Mesh(new THREE.SphereGeometry(0.20,8,6),createMaterial(i%2?0xe53935:0xffffff)); ball.position.set(sx,1.78,-4.2+i*1.1); deptStoreGroup.add(ball);
      const bottle=new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.13,0.36,7),createMaterial([0x42a5f5,0xef5350,0x66bb6a][(aisle+i)%3])); bottle.position.set(sx+0.45,1.74,-4.2+i*1.1); deptStoreGroup.add(bottle);
    }
  });
  const dsCheckout = new THREE.Mesh(new THREE.BoxGeometry(8.0,1.0,1.1),createMaterial(0x5c6bc0));
  dsCheckout.position.set(-4.0,0.5,8.6); markSolid(dsCheckout); deptStoreGroup.add(dsCheckout);

  // Floor 2: TMs and battle items.
  addDepartmentSign(1,0x42a5f5,0xffd54f);
  for(let x=-7;x<=4;x+=3.7){
    const rack=new THREE.Mesh(new THREE.BoxGeometry(2.6,1.8,5.8),createMaterial(0x546e7a)); rack.position.set(x,dsFloorY(1)+0.9,-1.5); markSolid(rack); deptStoreGroup.add(rack);
    for(let i=0;i<4;i++){ const tm=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.08,12),createMaterial([0x7e57c2,0x26c6da,0xff7043,0x9ccc65][i])); tm.rotation.x=Math.PI/2; tm.position.set(x,dsFloorY(1)+1.95,-3.4+i*1.25); deptStoreGroup.add(tm); }
  }

  // Floor 3: clothes, bags and trainer accessories.
  addDepartmentSign(2,0xf06292,0xffffff);
  for(const x of [-7,-2,3]){
    const rail=new THREE.Mesh(new THREE.BoxGeometry(2.8,1.7,0.18),steelMat); rail.position.set(x,dsFloorY(2)+1.1,-2.2); deptStoreGroup.add(rail);
    for(let i=0;i<3;i++){ const shirt=new THREE.Mesh(new THREE.BoxGeometry(0.70,0.75,0.12),createMaterial([0xef5350,0x42a5f5,0xffca28][i])); shirt.position.set(x-0.7+i*0.7,dsFloorY(2)+1.45,-2.0); deptStoreGroup.add(shirt); }
    const bag=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.65,0.35),createMaterial(0x6d4c41)); bag.position.set(x,dsFloorY(2)+0.55,2.0); deptStoreGroup.add(bag);
  }

  // Floor 4: evolution stones / collectibles under glass.
  addDepartmentSign(3,0x7e57c2,0x80deea);
  for(let x=-7;x<=4;x+=3.7){
    const caseBase=new THREE.Mesh(new THREE.BoxGeometry(2.8,0.75,3.0),createMaterial(0x37474f)); caseBase.position.set(x,dsFloorY(3)+0.38,-1.0); markSolid(caseBase); deptStoreGroup.add(caseBase);
    for(let i=0;i<4;i++){ const gem=new THREE.Mesh(new THREE.OctahedronGeometry(0.28),createMaterial([0xffca28,0x42a5f5,0xef5350,0x66bb6a][i],0.25,0.5)); gem.position.set(x-0.65+(i%2)*1.3,dsFloorY(3)+1.0,-1.6+Math.floor(i/2)*1.2); deptStoreGroup.add(gem); }
  }

  // Floor 5: home electronics and premium trainer gear.
  addDepartmentSign(4,0x26a69a,0xffd54f);
  for(const x of [-7,-2,3]){
    const appliance=new THREE.Mesh(new THREE.BoxGeometry(2.0,1.6,1.5),createMaterial(0xeceff1)); appliance.position.set(x,dsFloorY(4)+0.82,-2.5); markSolid(appliance); deptStoreGroup.add(appliance);
    const screen=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.75,0.05),new THREE.MeshBasicMaterial({color:[0x42a5f5,0xf06292,0x66bb6a][(x+7)/5]??0x42a5f5})); screen.position.set(x,dsFloorY(4)+1.1,-1.72); deptStoreGroup.add(screen);
  }

  const dsWindowMat = new THREE.MeshStandardMaterial({
    color: 0x9edfff, transparent: true, opacity: 0.38, roughness: 0.18,
    metalness: 0.06, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let floor = 1; floor <= 4; floor++) {
    const floorY = floor * 4.4;
    // Exterior trim is now four narrow strips instead of one giant box slicing
    // through the entire interior/stairwell.
    const bandFront = new THREE.Mesh(new THREE.BoxGeometry(dsWidth + 0.8, 0.34, 0.34), pokeCreamMat);
    bandFront.position.set(0, floorY, dsDepth/2 + 0.22);
    const bandBack = bandFront.clone(); bandBack.position.z = -dsDepth/2 - 0.22;
    const bandL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, dsDepth), pokeCreamMat);
    bandL.position.set(-dsWidth/2 - 0.22, floorY, 0);
    const bandR = bandL.clone(); bandR.position.x = dsWidth/2 + 0.22;
    deptStoreGroup.add(bandFront, bandBack, bandL, bandR);

    const win = new THREE.Mesh(new THREE.BoxGeometry(dsWidth - 6, 2.2, 0.16), dsWindowMat);
    // `floorY - 1.8` accidentally put the first upper-floor glass strip at
    // ground-floor height, directly across the entrance. Centre each pane within
    // the actual upper storey instead.
    win.position.set(0, floorY + 2.0, dsDepth / 2 + 0.38);
    // Visible facade glass is genuinely solid and its collider comes from this exact
    // mesh, so there is no invisible oversized wall around it.
    markSolid(win);
    deptStoreGroup.add(win);
  }

  // Ground-floor storefront glazing is deliberately split around the doorway.
  // This keeps the shopfront looking like glass while guaranteeing a full-width
  // physical entrance corridor when the sliding doors open.
  const dsStorefrontMargin = 1.0;
  const dsStorefrontPaneW = (dsWidth - dsEntranceWidth - dsStorefrontMargin * 2) / 2;
  for (const side of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(dsStorefrontPaneW, 3.0, 0.14), dsWindowMat);
    pane.position.set(
      side * (dsEntranceWidth / 2 + dsStorefrontPaneW / 2 + dsStorefrontMargin / 2),
      2.0,
      dsDepth / 2 + 0.36
    );
    pane.name = `department_store_ground_glass_${side < 0 ? 'left' : 'right'}`;
    markSolid(pane);
    deptStoreGroup.add(pane);
  }

  const dsDoorPostL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.3, 0.35), pokeCyanMat);
  dsDoorPostL.position.set(-(dsEntranceWidth/2 + 0.15), 2.15, dsDepth / 2 + 0.18);
  const dsDoorPostR = dsDoorPostL.clone();
  dsDoorPostR.position.x = dsEntranceWidth/2 + 0.15;
  const dsDoorHeader = new THREE.Mesh(new THREE.BoxGeometry(dsEntranceWidth + 0.6, 0.3, 0.35), pokeCyanMat);
  dsDoorHeader.position.set(0, 4.3, dsDepth / 2 + 0.18);
  const dsMarquee = new THREE.Mesh(new THREE.BoxGeometry(18, 2.0, 0.6), pokeYellowMat);
  dsMarquee.position.set(0, 5.1, dsDepth / 2 + 0.8);
  deptStoreGroup.add(dsDoorPostL, dsDoorPostR, dsDoorHeader, dsMarquee);
  const dsEntryMat = new THREE.Mesh(new THREE.BoxGeometry(dsEntranceWidth + 1.2, 0.08, 3.6), createMaterial(0x455a64));
  dsEntryMat.position.set(0, 0.25, dsDepth/2 - 1.55); dsEntryMat.userData.walkable = true; dsEntryMat.userData.walkablePriority = 38;
  deptStoreGroup.add(dsEntryMat);

  const dsDoor = new Door({
    id: 'goldenrod_department_store_door',
    name: 'Goldenrod Department Store Doors',
    houseName: 'Goldenrod Department Store',
    type: 'double_slide',
    width: dsEntranceWidth,
    height: 4.2,
    worldPos: new THREE.Vector3(140, 0, 82),
    frameColor: 0x00acc1,
    glassColor: 0xb3e5fc,
  });
  root.add(dsDoor.group);
  doors.push(dsDoor);

  // Accessible rooftop: the final stair flight reaches a real walkable roof deck.
  // The old 'railing' was one giant solid box covering the roof, which made the
  // top effectively inaccessible. Use a thin deck + four perimeter rails instead.
  const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(dsWidth - 1.0, 0.22, dsDepth - 1.0), dsFloorMat);
  roofDeck.position.y = dsHeight;
  roofDeck.userData.walkable = true;
  roofDeck.userData.landableRoof = true;
  roofDeck.userData.walkablePriority = 46;
  deptStoreGroup.add(roofDeck);
  const roofRailN = new THREE.Mesh(new THREE.BoxGeometry(dsWidth, 1.0, 0.18), steelMat);
  roofRailN.position.set(0, dsHeight + 0.55, -dsDepth / 2 + 0.2);
  const roofRailS = roofRailN.clone(); roofRailS.position.z = dsDepth / 2 - 0.2;
  const roofRailW = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, dsDepth), steelMat);
  roofRailW.position.set(-dsWidth / 2 + 0.2, dsHeight + 0.55, 0);
  const roofRailE = roofRailW.clone(); roofRailE.position.x = dsWidth / 2 - 0.2;
  markSolid(roofRailN, roofRailS, roofRailW, roofRailE);
  deptStoreGroup.add(roofRailN, roofRailS, roofRailW, roofRailE);

  const addVendingMachine = (vx: number, vz: number, vcolor: number) => {
    const vm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.0), createMaterial(vcolor));
    vm.position.set(vx, dsHeight + 1.2, vz);
    markSolid(vm);
    deptStoreGroup.add(vm);
  };
  addVendingMachine(-6, 4, 0x0288d1);
  addVendingMachine(-4, 4, 0xd32f2f);
  addVendingMachine(-2, 4, 0x388e3c);

  const umbrella = new THREE.Mesh(new THREE.ConeGeometry(2.5, 0.8, 8), pokePinkMat);
  umbrella.position.set(6, dsHeight + 3.0, 0);
  const umbrellaPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 6), steelMat);
  umbrellaPole.position.set(6, dsHeight + 1.5, 0);
  deptStoreGroup.add(umbrella, umbrellaPole);

  root.add(deptStoreGroup);
  landmarks.push({
    id: 'goldenrod_dept_store',
    name: 'Goldenrod Dept. Store',
    category: 'goldenrod',
    x: 140,
    z: 70,
    icon: 'bag',
    color: '#3f51b5',
  });

  // -------------------------------------------------------------------------
  // 6. IMPORTANT LANDMARK 4: GOLDENROD GYM (WHITNEY'S GYM) (X = 140, Z = -30)
  // -------------------------------------------------------------------------
  const gymGroup = new THREE.Group();
  gymGroup.position.set(140, 0, -30);
  gymGroup.name = 'goldenrod_gym';

  const gymPlaza = new THREE.Mesh(new THREE.BoxGeometry(32, 0.2, 28), sidewalkMat);
  gymPlaza.userData.sidewalkSurface = true; gymPlaza.userData.roadCriticalDetail = true;
  gymPlaza.position.y = 0.1;
  gymGroup.add(gymPlaza);

  addEnterableShell(
    gymGroup,
    22,
    20,
    9,
    pokeCreamMat,
    createMaterial(0xf7eadf, 0.75, 0.05),
    4.5,
    5.0
  );

  const gymDome = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), pokePinkMat);
  gymDome.scale.set(1.0, 0.5, 0.9);
  gymDome.position.y = 9.0;
  gymGroup.add(gymDome);

  const pillarGeo = new THREE.CylinderGeometry(0.6, 0.7, 7.0, 12);
  const pillarL = new THREE.Mesh(pillarGeo, pokeWhiteMat);
  pillarL.position.set(-4.5, 3.5, 10.8);
  const pillarR = new THREE.Mesh(pillarGeo, pokeWhiteMat);
  pillarR.position.set(4.5, 3.5, 10.8);
  const porticoHeader = new THREE.Mesh(new THREE.BoxGeometry(11, 1.2, 2.5), pokePinkMat);
  porticoHeader.position.set(0, 7.6, 10.8);
  gymGroup.add(pillarL, pillarR, porticoHeader);

  const badgePlaque = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 16), pokeYellowMat);
  badgePlaque.rotation.x = Math.PI / 2;
  badgePlaque.position.set(0, 8.8, 11.2);
  gymGroup.add(badgePlaque);

  // The interactive Door below supplies the visible moving panels. Keep only a
  // slim frame here so opening the Gym door never leaves a fake solid door behind.
  const gymDoorPostL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.0, 0.3), woodMat);
  gymDoorPostL.position.set(-2.4, 2.5, 10.1);
  const gymDoorPostR = gymDoorPostL.clone();
  gymDoorPostR.position.x = 2.4;
  const gymDoorHeader = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.28, 0.3), woodMat);
  gymDoorHeader.position.set(0, 5.0, 10.1);
  gymGroup.add(gymDoorPostL, gymDoorPostR, gymDoorHeader);

  const urnGeo = new THREE.CylinderGeometry(0.7, 0.5, 1.2, 8);
  const urnL = new THREE.Mesh(urnGeo, pokeWhiteMat);
  urnL.position.set(-7.5, 0.6, 11.5);
  const flowersL = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6), pokePinkMat);
  flowersL.position.set(-7.5, 1.6, 11.5);
  const urnR = new THREE.Mesh(urnGeo, pokeWhiteMat);
  urnR.position.set(7.5, 0.6, 11.5);
  const flowersR = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6), pokePinkMat);
  flowersR.position.set(7.5, 1.6, 11.5);
  gymGroup.add(urnL, flowersL, urnR, flowersR);

  // Full gym interior: battle court, raised leader platform and walkable stairs.
  const gymCourt = new THREE.Mesh(new THREE.BoxGeometry(18.5, 0.10, 14.5), createMaterial(0xe8d9e8, 0.88, 0.02));
  gymCourt.position.set(0, 0.28, -1.4);
  gymCourt.userData.walkable = true;
  gymCourt.userData.walkablePriority = 25;
  const courtLine = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.95, 28), new THREE.MeshBasicMaterial({ color: 0xf06292, side: THREE.DoubleSide }));
  courtLine.rotation.x = -Math.PI / 2;
  courtLine.position.set(0, 0.345, -0.8);
  gymGroup.add(gymCourt, courtLine);

  const leaderPlatform = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.5, 5.2), createMaterial(0xf8bbd0, 0.75, 0.04));
  leaderPlatform.position.set(0, 4.15, -6.7);
  leaderPlatform.userData.walkable = true;
  leaderPlatform.userData.walkablePriority = 40;
  gymGroup.add(leaderPlatform);

  const railMat = createMaterial(0xad1457, 0.5, 0.15);
  const platformRail = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.05, 0.18), railMat);
  platformRail.position.set(0, 4.92, -9.15);
  markSolid(platformRail);
  gymGroup.add(platformRail);

  // Staircase to the leader's upper platform. Every tread is an authored stair
  // surface, so walking/running samples the visible steps rather than ghosting
  // through them. Thin side rails sit outside the 2.3m walking lane.
  const gymStairMat = createMaterial(0xf2c8d8, 0.8, 0.02);
  for (let i = 0; i < 10; i++) {
    const height = 0.42 + i * 0.40;
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.2, height, 0.65), gymStairMat);
    step.name = `goldenrod_gym_stair_${i}`;
    step.position.set(6.2, height / 2, -1.8 - i * 0.58);
    markWalkableStairSurface(step, 45, 0.82);
    gymGroup.add(step);
  }
  const gymStairRun = 9 * 0.58 + 0.65;
  const gymStairRise = 4.02;
  const gymRailLength = Math.hypot(gymStairRun, gymStairRise);
  const gymRailAngle = Math.atan2(gymStairRise, gymStairRun);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, gymRailLength), railMat);
    rail.name = `goldenrod_gym_stair_rail_${side}`;
    rail.position.set(6.2 + side * 1.74, 2.58, -4.75);
    rail.rotation.x = -gymRailAngle;
    markStairRailing(rail);
    gymGroup.add(rail);
    for (let p = 0; p <= 4; p++) {
      const t = p / 4;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.82, 0.09), railMat);
      post.name = `goldenrod_gym_stair_post_${side}_${p}`;
      post.position.set(6.2 + side * 1.74, 0.42 + t * 3.6 + 0.42, -1.8 - t * 5.22);
      markStairRailing(post);
      gymGroup.add(post);
    }
  }

  const trainerPadL = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 20), pokeBlueMat);
  trainerPadL.position.set(-4.8, 0.38, -1.0);
  const trainerPadR = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 20), pokeRedMat);
  trainerPadR.position.set(4.8, 0.38, -1.0);
  gymGroup.add(trainerPadL, trainerPadR);

  const gymDoor = new Door({
    id: 'goldenrod_gym_door',
    name: 'Goldenrod Gym Glass Doors',
    houseName: 'Goldenrod Pokémon Gym',
    type: 'double_slide',
    width: 4.5,
    height: 4.5,
    worldPos: new THREE.Vector3(140, 0, -20),
    frameColor: 0xad1457,
    glassColor: 0xf8bbd0,
  });
  root.add(gymDoor.group);
  doors.push(gymDoor);

  wallColliders.push(
    { id: 'gym_back', minX: 128.5, maxX: 151.5, minZ: -40.4, maxZ: -39.6 },
    { id: 'gym_left', minX: 128.6, maxX: 129.4, minZ: -40, maxZ: -20 },
    { id: 'gym_right', minX: 150.6, maxX: 151.4, minZ: -40, maxZ: -20 },
    { id: 'gym_front_l', minX: 128.6, maxX: 137.5, minZ: -20.4, maxZ: -19.6 },
    { id: 'gym_front_r', minX: 142.5, maxX: 151.4, minZ: -20.4, maxZ: -19.6 }
  );

  root.add(gymGroup);
  landmarks.push({
    id: 'goldenrod_gym',
    name: 'Goldenrod Pokémon Gym',
    category: 'goldenrod',
    x: 140,
    z: -30,
    icon: 'shield',
    color: '#f06292',
  });

  // -------------------------------------------------------------------------
  // 7. IMPORTANT LANDMARK 5: FUNCTIONAL MAGNET TRAIN SERVICE
  // -------------------------------------------------------------------------
  const trainStationGroup = new THREE.Group();
  trainStationGroup.position.set(240, 0, -110);
  trainStationGroup.name = 'goldenrod_magnet_train_station';
  addEnterableShell(trainStationGroup, 28, 18, 8, createMaterial(0x37474f), sidewalkMat, 5.2, 4.0);
  const stationDoor = new Door({
    id: 'magnet_station_door', name: 'Magnet Train Station Doors', houseName: 'Goldenrod Magnet Train Station',
    type: 'double_slide', width: 5.0, height: 4.0,
    worldPos: new THREE.Vector3(240, 0, -101), frameColor: 0x00acc1, glassColor: 0xb2ebf2,
  });
  root.add(stationDoor.group); doors.push(stationDoor);
  const stationSign = new THREE.Mesh(new THREE.BoxGeometry(20, 1.5, 0.3), pokeCyanMat);
  stationSign.position.set(0, 6.2, 9.2);
  trainStationGroup.add(stationSign);

  // Ticket counter, benches and departures board.
  const ticketCounter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 1.2), createMaterial(0x607d8b));
  ticketCounter.position.set(-5, 0.55, -5.5); markSolid(ticketCounter); trainStationGroup.add(ticketCounter);
  for (const z of [-2.5, 1.5]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.6, 1.1), woodMat);
    bench.position.set(-4, 0.45, z); markSolid(bench); markSittable(bench, 'Magnet Train waiting bench'); trainStationGroup.add(bench);
  }
  const departures = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.4, 0.14), new THREE.MeshBasicMaterial({ color: 0x102a43 }));
  departures.position.set(4.5, 4.7, -8.55); trainStationGroup.add(departures);
  for (let i = 0; i < 4; i++) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.18, 0.03), new THREE.MeshBasicMaterial({ color: i === 0 ? 0x66ffff : 0xffffff }));
    row.position.set(4.5, 5.4 - i * 0.45, -8.46); trainStationGroup.add(row);
  }

  // --- Proper functional lift ------------------------------------------------
  // The old lift was visually just a floor plus three glass planes and then the
  // interaction teleported the player. This is now an actual cabin in a shaft.
  const elevatorShaft = new THREE.Group();
  elevatorShaft.name = 'magnet_station_elevator_shaft';
  const eastElevatorLocalZ = 10.5; // south/platform side; deliberately clear of the train tracks
  elevatorShaft.position.set(8, 0, eastElevatorLocalZ);
  const shaftMetal = createMaterial(0x455a64, 0.35, 0.65);
  const shaftGlass = new THREE.MeshStandardMaterial({ color: 0xa9e9f4, transparent: true, opacity: 0.18, roughness: 0.2, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  // The cabin reaches ~16 m at platform level, so the shaft must surround the
  // raised cabin rather than ending halfway up it. Keep the north face open in
  // the middle for the platform-side doors; slim glass side panels retain the
  // transparent lift-shaft look without blocking the exit.
  const shaftL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 16.2, 4.7), shaftMetal); shaftL.position.set(-2.35, 8.1, 0);
  const shaftR = shaftL.clone(); shaftR.position.x = 2.35;
  const shaftBackL = new THREE.Mesh(new THREE.BoxGeometry(0.62, 16.0, 0.12), shaftGlass); shaftBackL.position.set(-2.02, 8.0, -2.25);
  const shaftBackR = shaftBackL.clone(); shaftBackR.position.x = 2.02;
  const shaftTop = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.22, 4.7), shaftMetal); shaftTop.position.set(0, 16.15, 0);
  elevatorShaft.add(shaftL, shaftR, shaftBackL, shaftBackR, shaftTop);
  markSolid(shaftL, shaftR);
  trainStationGroup.add(elevatorShaft);

  const elevatorCab = new THREE.Group();
  elevatorCab.name = 'magnet_station_elevator_cabin';
  elevatorCab.position.set(8, 0, eastElevatorLocalZ);
  const elevFloor = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.24, 4.05), createMaterial(0x90a4ae));
  elevFloor.name = 'elevator_floor'; elevFloor.position.y = 0.12; elevFloor.userData.walkable = true; elevFloor.userData.walkablePriority = 70;
  const elevL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.35, 4.05), createMaterial(0x607d8b)); elevL.position.set(-1.98, 1.82, 0);
  const elevR = elevL.clone(); elevR.position.x = 1.98;
  const elevCeiling = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.18, 4.05), createMaterial(0x455a64)); elevCeiling.position.set(0, 3.48, 0);
  const elevLight = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.7), new THREE.MeshBasicMaterial({ color: 0xfff5c4 })); elevLight.position.set(0, 3.37, 0);
  const controlPanel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.12), createMaterial(0x263238, 0.2, 0.7)); controlPanel.position.set(1.82, 1.45, 1.25);
  const controlButton1 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0x66ff99 })); controlButton1.position.set(1.75, 1.62, 1.34);
  const controlButton2 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd54f })); controlButton2.position.set(1.75, 1.35, 1.34);
  const elevatorDoorMat = createMaterial(0xb0bec5, 0.25, 0.75);
  // Through-lift cabin: south doors serve the concourse and north doors serve
  // the elevated platform. There is no fake back wall blocking the second exit.
  const elevatorSouthLeft = new THREE.Mesh(new THREE.BoxGeometry(1.85, 3.1, 0.12), elevatorDoorMat); elevatorSouthLeft.position.set(-0.94, 1.66, 2.02);
  const elevatorSouthRight = elevatorSouthLeft.clone(); elevatorSouthRight.position.x = 0.94;
  const elevatorNorthLeft = elevatorSouthLeft.clone(); elevatorNorthLeft.position.z = -2.02;
  const elevatorNorthRight = elevatorSouthRight.clone(); elevatorNorthRight.position.z = -2.02;
  elevatorCab.add(elevFloor, elevL, elevR, elevCeiling, elevLight, controlPanel, controlButton1, controlButton2, elevatorSouthLeft, elevatorSouthRight, elevatorNorthLeft, elevatorNorthRight);
  // Cabin moves, so do not register its walls as static world colliders. The
  // player is contained by the scripted lift ride while the shaft/frame remains solid.
  trainStationGroup.add(elevatorCab);

  // Landing frames make the through-lift direction obvious: south at concourse,
  // opposite/north at platform level. This avoids a door that opens into nowhere.
  const makeElevatorLanding = (y: number, side: 1 | -1) => {
    const frame = new THREE.Group(); frame.position.set(8, y, eastElevatorLocalZ + side * 2.08);
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.7, 0.28), shaftMetal); pL.position.set(-2.18, 1.85, 0);
    const pR = pL.clone(); pR.position.x = 2.18;
    const header = new THREE.Mesh(new THREE.BoxGeometry(4.58, 0.22, 0.28), shaftMetal); header.position.set(0, 3.6, 0);
    const callPanel = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.62, 0.12), createMaterial(0x263238)); callPanel.position.set(2.38, 1.35, side * 0.08);
    const callLight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd54f })); callLight.position.set(2.38, 1.45, side * 0.16);
    frame.add(pL, pR, header, callPanel, callLight); trainStationGroup.add(frame);
  };
  makeElevatorLanding(0, 1);
  makeElevatorLanding(12.45, -1);

  // Broad ground apron so the relocated lift is easy to walk into from the
  // station frontage instead of sitting in grass with a precision-sized threshold.
  const elevatorGroundApron = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.16, 5.0), createMaterial(0x90a4ae));
  elevatorGroundApron.name = 'magnet_elevator_ground_apron';
  elevatorGroundApron.position.set(8, 0.08, eastElevatorLocalZ + 3.2);
  elevatorGroundApron.userData.walkable = true;
  elevatorGroundApron.userData.walkablePriority = 68;
  trainStationGroup.add(elevatorGroundApron);

  // Upper skybridge now leaves from the NORTH/platform side of the cabin, so a
  // rider genuinely enters on one side and exits the other.
  const elevatorSkybridge = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.32, 4.2), createMaterial(0x78909c));
  elevatorSkybridge.name = 'magnet_elevator_platform_apron'; elevatorSkybridge.position.set(8, 12.36, eastElevatorLocalZ - 2.25);
  elevatorSkybridge.userData.walkable = true; elevatorSkybridge.userData.walkablePriority = 68;
  const skyRailL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 4.2), shaftMetal); skyRailL.position.set(5.68, 12.95, eastElevatorLocalZ - 2.25);
  const skyRailR = skyRailL.clone(); skyRailR.position.x = 10.32;
  markSolid(skyRailL, skyRailR);
  trainStationGroup.add(elevatorSkybridge, skyRailL, skyRailR);

  let elevatorY = 0;
  let elevatorTargetY = 0;
  let elevatorTargetLevel: 'ground' | 'platform' = 'ground';
  let elevatorMoving = false;
  let elevatorSouthDoorProgress = 1;
  let elevatorNorthDoorProgress = 0;
  const updateElevator = (dt: number) => {
    const atTarget = Math.abs(elevatorY - elevatorTargetY) < 0.025;
    const atGround = atTarget && !elevatorMoving && elevatorTargetY < 1;
    const atPlatform = atTarget && !elevatorMoving && elevatorTargetY > 10;
    elevatorSouthDoorProgress = THREE.MathUtils.damp(elevatorSouthDoorProgress, atGround ? 1 : 0, 8.5, dt);
    elevatorNorthDoorProgress = THREE.MathUtils.damp(elevatorNorthDoorProgress, atPlatform ? 1 : 0, 8.5, dt);
    elevatorSouthLeft.position.x = -0.94 - elevatorSouthDoorProgress * 1.30;
    elevatorSouthRight.position.x = 0.94 + elevatorSouthDoorProgress * 1.30;
    elevatorNorthLeft.position.x = -0.94 - elevatorNorthDoorProgress * 1.30;
    elevatorNorthRight.position.x = 0.94 + elevatorNorthDoorProgress * 1.30;
    // Never move with either doorway partly open.
    if (elevatorMoving && elevatorSouthDoorProgress < 0.06 && elevatorNorthDoorProgress < 0.06) {
      const direction = Math.sign(elevatorTargetY - elevatorY);
      elevatorY += direction * Math.min(Math.abs(elevatorTargetY - elevatorY), 5.0 * dt);
      if (Math.abs(elevatorTargetY - elevatorY) < 0.025) {
        elevatorY = elevatorTargetY;
        elevatorMoving = false;
      }
    }
    elevatorCab.position.y = elevatorY;
  };
  const requestElevatorLevel = (level: 'ground' | 'platform') => {
    elevatorTargetLevel = level;
    elevatorTargetY = level === 'platform' ? 12.45 : 0;
    if (Math.abs(elevatorTargetY - elevatorY) > 0.05) elevatorMoving = true;
  };
  const getElevatorState = () => {
    const level = Math.abs(elevatorY) < 0.08 ? 'ground' as const : Math.abs(elevatorY - 12.45) < 0.08 ? 'platform' as const : 'between' as const;
    const activeDoorProgress = level === 'ground' ? elevatorSouthDoorProgress : level === 'platform' ? elevatorNorthDoorProgress : 0;
    return {
      y: elevatorY,
      level,
      moving: elevatorMoving,
      doorsOpen: activeDoorProgress > 0.82 && !elevatorMoving,
      target: elevatorTargetLevel,
    };
  };

  // --- Cross-map rail service -----------------------------------------------
  // This group is exposed separately and re-parented directly to the Scene in
  // App.tsx, so Springfield-side track/station geometry cannot become invisible
  // merely because the Goldenrod district is distance-culled.
  const railServiceGroup = new THREE.Group(); railServiceGroup.name = 'magnet_train_cross_map_route';
  const railZ = -110; const railY = 12.8; const railLength = 570;
  const railDeck = new THREE.Mesh(new THREE.BoxGeometry(railLength, 0.85, 9.0), createMaterial(0x455a64, 0.55, 0.35));
  railDeck.name = 'magnet_track_walkable_deck'; railDeck.position.set(0, 12.0, railZ);
  railDeck.userData.walkable = true; railDeck.userData.walkablePriority = 52;
  railServiceGroup.add(railDeck);

  // Continuous sleepers + raised rails. Every visible part of the track has the
  // broad deck immediately underneath it, so there are no gaps to fall through.
  for (let x = -278; x <= 278; x += 8) {
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 6.7), createMaterial(0x5d4037, 0.8, 0.05));
    sleeper.name = `magnet_sleeper_${x}`; sleeper.position.set(x, 12.50, railZ);
    sleeper.userData.walkable = true; sleeper.userData.walkablePriority = 53;
    railServiceGroup.add(sleeper);
  }
  for (let x = -264; x <= 264; x += 32) {
    // X=-104 used to put a 2.3m-wide train pylon partly inside the X=-110 outer
    // arterial. Shift only that support outside the road envelope while preserving
    // the elevated track spacing everywhere else.
    // The pylon at x=152 serves as the central support pillar through the player's 6-car garage.
    const pylonX = x === -104 ? -99 : x;
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.3, 11.7, 2.3), createMaterial(0x78909c));
    pylon.name = `magnet_pylon_${x}`; pylon.position.set(pylonX, 5.85, railZ); markSolid(pylon); railServiceGroup.add(pylon);
  }
  for (const zOff of [-2.45, 2.45]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(railLength, 0.32, 0.32), createMaterial(0x90a4ae, 0.18, 0.85));
    rail.name = `magnet_rail_${zOff}`; rail.position.set(0, railY, zOff + railZ);
    rail.userData.walkable = true; rail.userData.walkablePriority = 55;
    railServiceGroup.add(rail);
  }

  // Platforms at both cities. Goldenrod keeps the compact deck; Springfield gets
  // a dedicated station platform group below so its visible floor, access points
  // and collision are authored together instead of relying on a loose slab/ramp.
  const makePlatform = (x: number, color: number) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(46, 0.72, 14), createMaterial(color));
    p.position.set(x, 12.24, railZ + 8.0);
    p.userData.walkable = true;
    p.userData.walkablePriority = 64;
    railServiceGroup.add(p);
    return p;
  };
  makePlatform(240, 0x546e7a);

  const springfieldPlatform = new THREE.Group();
  springfieldPlatform.name = 'springfield_magnet_platform_complete';
  const westPlatformFloor = new THREE.Mesh(new THREE.BoxGeometry(52, 0.82, 14.2), createSurfaceMaterial(0x777d82, 'concrete', 0.88, 0.03, 14, 5));
  westPlatformFloor.name = 'springfield_platform_floor';
  westPlatformFloor.position.set(-240, 12.18, railZ + 9.5);
  westPlatformFloor.userData.walkable = true;
  westPlatformFloor.userData.walkablePriority = 72;
  // If a sprint/jump lands a few centimetres below the visible slab because of a
  // frame seam, recover onto THIS actual platform mesh rather than falling through.
  westPlatformFloor.userData.walkableSnapFromBelow = 1.35;
  springfieldPlatform.add(westPlatformFloor);

  // Tactile/yellow safety strip sits just back from the train-facing edge.
  const westSafetyStrip = new THREE.Mesh(new THREE.BoxGeometry(50.5, 0.08, 0.58), createMaterial(0xffc107));
  westSafetyStrip.position.set(-240, 12.64, railZ + 2.85);
  westSafetyStrip.userData.walkable = true;
  westSafetyStrip.userData.walkablePriority = 73;
  westSafetyStrip.userData.walkableSnapFromBelow = 1.0;
  springfieldPlatform.add(westSafetyStrip);

  // Back/far-side railing and end barriers. The train-facing side deliberately
  // remains open along the marked boarding zone.
  const platformRailMat = createMaterial(0x455a64, 0.3, 0.65);
  const westBackRail = new THREE.Mesh(new THREE.BoxGeometry(51.5, 1.15, 0.16), platformRailMat);
  westBackRail.position.set(-240, 13.15, railZ + 16.55);
  const westEndRailA = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.15, 13.6), platformRailMat);
  westEndRailA.position.set(-265.7, 13.15, railZ + 9.5);
  const westEndRailB = westEndRailA.clone(); westEndRailB.position.x = -214.3;
  markSolid(westBackRail, westEndRailA, westEndRailB);
  springfieldPlatform.add(westBackRail, westEndRailA, westEndRailB);

  // Covered waiting area, benches and readable station details.
  const shelterRoof = new THREE.Mesh(new THREE.BoxGeometry(22, 0.28, 5.8), createSurfaceMaterial(0x607d8b, 'metal', 0.48, 0.45, 8, 3));
  shelterRoof.userData.landableRoof = true;
  shelterRoof.position.set(-244, 16.0, railZ + 11.2);
  springfieldPlatform.add(shelterRoof);
  // Keep the east end of the shelter clear of the Springfield lift exit.
  for (const x of [-253.5, -246.5, -239.5, -235.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.20, 3.0, 0.20), platformRailMat);
    post.position.set(x, 14.45, railZ + 13.2);
    markSolid(post);
    springfieldPlatform.add(post);
  }
  // Do not place a bench at x≈-234: it sits directly in the walking path from
  // the upper lift door. Two benches remain under the shelter with a clear lift zone.
  for (const x of [-250, -242]) {
    const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.28, 1.0), woodMat);
    benchSeat.position.set(x, 13.15, railZ + 12.0);
    const benchBack = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.25, 0.18), woodMat);
    benchBack.position.set(x, 13.72, railZ + 12.45);
    markSolid(benchSeat, benchBack);
    markSittable(benchSeat, 'Springfield platform bench');
    springfieldPlatform.add(benchSeat, benchBack);
  }
  const platformSign = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.15, 0.18), pokeCyanMat);
  platformSign.position.set(-220.5, 15.0, railZ + 14.4);
  springfieldPlatform.add(platformSign);
  railServiceGroup.add(springfieldPlatform);

  // Springfield-side terminal. It lives in the always-visible rail service group.
  // The north/rear wall has a broad pedestrian opening centred around x=-236,
  // directly fixing the stale collider that blocked the previously open path at
  // approximately X -236 / Z -98.
  const westStation = new THREE.Group(); westStation.position.set(-240, 0, railZ + 22); westStation.name = 'springfield_magnet_terminal';
  const westShell = addEnterableShell(westStation, 26, 18, 7, createMaterial(0x8d6e63), createMaterial(0xd6c7a8), 5.2, 4.0);
  westStation.remove(westShell.back);
  // Back opening: local x=4, width=7.2 -> world X -239.6..-232.4.
  const backZ = -9;
  const backMat = createMaterial(0x8d6e63);
  const backLeft = new THREE.Mesh(new THREE.BoxGeometry(13.4, 7, 0.65), backMat); backLeft.position.set(-6.3, 3.5, backZ);
  const backRight = new THREE.Mesh(new THREE.BoxGeometry(5.4, 7, 0.65), backMat); backRight.position.set(10.3, 3.5, backZ);
  const backHeader = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.8, 0.65), backMat); backHeader.position.set(4.0, 5.6, backZ);
  markSolid(backLeft, backRight, backHeader); westStation.add(backLeft, backRight, backHeader);
  const westSign = new THREE.Mesh(new THREE.BoxGeometry(18, 1.3, 0.25), pokeCyanMat); westSign.position.set(0, 5.5, -9.1); westStation.add(westSign);
  const westCounter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.0, 1.2), woodMat); westCounter.position.set(-3, 0.5, 4.8); markSolid(westCounter); westStation.add(westCounter);
  railServiceGroup.add(westStation);

  // Wide Springfield station spiral staircase. The previous three-flight
  // switchback finished with a bridge that physically crossed the terminal's
  // solid rear wall before reaching the platform. That made the final landing
  // look open while still being blocked by real architecture. Keep the staircase
  // completely outside the terminal shell instead and let its upper landing
  // overlap the real platform floor directly.
  const stationStairMat = createSurfaceMaterial(0x9aa4aa, 'metal', 0.60, 0.32, 5, 5);
  const stationStairRailMat = createMaterial(0x455a64, 0.26, 0.72);
  const spiralCenterX = -259.1;
  const spiralCenterZ = -92.0;
  const spiralCenterRadius = 3.15;
  const spiralWalkWidth = 3.0;
  const spiralInnerRadius = spiralCenterRadius - spiralWalkWidth * 0.5;
  const spiralOuterRadius = spiralCenterRadius + spiralWalkWidth * 0.5;
  const spiralBottomY = 0.10;
  const spiralTopY = 12.60;
  const spiralStepCount = 60;
  const spiralTurns = 2.25;
  const spiralEndAngle = Math.PI; // final travel direction is north, straight onto the platform
  const spiralStartAngle = spiralEndAngle - Math.PI * 2 * spiralTurns;
  const spiralAngleStep = (spiralEndAngle - spiralStartAngle) / spiralStepCount;
  const spiralRise = (spiralTopY - spiralBottomY) / spiralStepCount;
  // Slight overlap between consecutive treads removes catch points when running.
  const spiralTreadDepth = Math.max(0.72, spiralCenterRadius * spiralAngleStep * 1.14);

  const spiralGroup = new THREE.Group();
  spiralGroup.name = 'springfield_station_spiral_stairs';

  // A visible central mast gives the large public staircase believable support and
  // prevents shortcuts through the open core. Its collision exactly matches the mast.
  const spiralMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.50, spiralTopY + 0.9, 14),
    stationStairRailMat
  );
  spiralMast.name = 'springfield_station_spiral_center_mast';
  spiralMast.position.set(spiralCenterX, (spiralTopY + 0.9) * 0.5, spiralCenterZ);
  markSolid(spiralMast);
  spiralGroup.add(spiralMast);

  const spiralStepAngles: number[] = [];
  const spiralStepHeight = Math.max(0.17, spiralRise);
  const spiralStepGeometry = new THREE.BoxGeometry(spiralWalkWidth, spiralStepHeight, spiralTreadDepth);
  // Render all 60 visible treads as one instanced mesh. Individual invisible tread
  // meshes remain available to the exact stair-height raycaster, so this keeps the
  // precise walking collision without adding sixty permanent draw calls to the
  // always-loaded cross-map rail service.
  const spiralStepVisuals = new THREE.InstancedMesh(spiralStepGeometry, stationStairMat, spiralStepCount);
  spiralStepVisuals.name = 'springfield_station_spiral_treads_visual';
  const spiralStepMatrix = new THREE.Matrix4();
  const spiralStepQuaternion = new THREE.Quaternion();
  const spiralStepScale = new THREE.Vector3(1, 1, 1);
  const spiralCollisionMaterial = new THREE.MeshBasicMaterial({ visible: false });
  for (let i = 0; i < spiralStepCount; i++) {
    const angle = spiralStartAngle + (i + 0.5) * spiralAngleStep;
    const topY = spiralBottomY + (i + 1) * spiralRise;
    const stepPosition = new THREE.Vector3(
      spiralCenterX + Math.cos(angle) * spiralCenterRadius,
      topY - spiralStepHeight * 0.5,
      spiralCenterZ + Math.sin(angle) * spiralCenterRadius
    );
    // Local X points radially across the stair width; local Z follows the curve.
    spiralStepQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
    spiralStepMatrix.compose(stepPosition, spiralStepQuaternion, spiralStepScale);
    spiralStepVisuals.setMatrixAt(i, spiralStepMatrix);

    const stepCollider = new THREE.Mesh(spiralStepGeometry, spiralCollisionMaterial);
    stepCollider.name = `springfield_station_spiral_step_${i}`;
    stepCollider.position.copy(stepPosition);
    stepCollider.rotation.y = -angle;
    markWalkableStairSurface(stepCollider, 78, 0.90);
    spiralGroup.add(stepCollider);
    spiralStepAngles.push(angle);
  }
  spiralStepVisuals.instanceMatrix.needsUpdate = true;
  spiralGroup.add(spiralStepVisuals);

  // Public-station handrails on both sides. Compact posts provide physical
  // collision; the continuous upper rails are visual only so their rotated AABBs
  // can never become broad invisible blockers across the walking lane.
  const makeSpiralRailSegment = (a: THREE.Vector3, b: THREE.Vector3, radius = 0.075) => {
    const dir = b.clone().sub(a);
    const length = dir.length();
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 7), stationStairRailMat);
    rail.position.copy(a).add(b).multiplyScalar(0.5);
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return rail;
  };
  const railPostEvery = 3;
  for (const railRadius of [spiralInnerRadius - 0.10, spiralOuterRadius + 0.10]) {
    let previousRailPoint: THREE.Vector3 | null = null;
    for (let i = 0; i < spiralStepCount; i += railPostEvery) {
      const angle = spiralStepAngles[i];
      const topY = spiralBottomY + (i + 1) * spiralRise;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.04, 0.11), stationStairRailMat);
      post.name = `springfield_station_spiral_rail_post_${railRadius > spiralCenterRadius ? 'outer' : 'inner'}_${i}`;
      post.position.set(
        spiralCenterX + Math.cos(angle) * railRadius,
        topY + 0.52,
        spiralCenterZ + Math.sin(angle) * railRadius
      );
      markStairRailing(post);
      spiralGroup.add(post);

      const railPoint = post.position.clone().add(new THREE.Vector3(0, 0.48, 0));
      if (previousRailPoint) {
        const rail = makeSpiralRailSegment(previousRailPoint, railPoint);
        rail.name = `springfield_station_spiral_top_rail_${railRadius > spiralCenterRadius ? 'outer' : 'inner'}_${i}`;
        spiralGroup.add(rail);
      }
      previousRailPoint = railPoint;
    }
    // Finish the visual rail at the final tread height.
    const endAngle = spiralEndAngle;
    const finalPoint = new THREE.Vector3(
      spiralCenterX + Math.cos(endAngle) * railRadius,
      spiralTopY + 1.0,
      spiralCenterZ + Math.sin(endAngle) * railRadius
    );
    if (previousRailPoint) spiralGroup.add(makeSpiralRailSegment(previousRailPoint, finalPoint));
  }

  // Bottom apron gives a generous approach from the station forecourt. The south
  // approach remains completely open so a player/camera can enter without squeezing
  // between rails or the terminal wall.
  const spiralBottomLanding = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 3.4), stationStairMat);
  spiralBottomLanding.name = 'springfield_station_spiral_bottom_landing';
  spiralBottomLanding.position.set(spiralCenterX, 0.09, spiralCenterZ + spiralCenterRadius + 0.65);
  markWalkableStairSurface(spiralBottomLanding, 77, 0.72);
  spiralGroup.add(spiralBottomLanding);

  // Upper landing overlaps the actual Springfield platform floor. There is no
  // cross-rail on the platform-facing/north edge and no station wall between it
  // and the platform, so walking/running off the final tread requires no jump.
  const spiralTopLanding = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.30, 3.4), stationStairMat);
  spiralTopLanding.name = 'springfield_station_spiral_upper_landing';
  spiralTopLanding.position.set(spiralCenterX - spiralCenterRadius, 12.45, -93.10);
  markWalkableStairSurface(spiralTopLanding, 80, 1.0);
  spiralGroup.add(spiralTopLanding);

  // Side rails protect the upper landing without blocking either the spiral entry
  // or the direct northward walk onto the platform.
  for (const side of [-1, 1]) {
    const landingRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 3.0), stationStairRailMat);
    landingRail.name = `springfield_station_spiral_upper_landing_rail_${side}`;
    landingRail.position.set(spiralCenterX - spiralCenterRadius + side * 2.22, 13.10, -93.10);
    markStairRailing(landingRail);
    spiralGroup.add(landingRail);
  }

  railServiceGroup.add(spiralGroup);

  // Springfield gets the same proper lift treatment as Goldenrod. It is positioned
  // beside the platform, never on the rails, and is now paired with real stairs.
  const westElevatorX = -233.5;
  const westElevatorZ = -92.5;
  const westLiftMetal = createMaterial(0x5d4037, 0.35, 0.55);
  const westLiftPanel = createMaterial(0x37474f, 0.25, 0.70);
  const westShaft = new THREE.Group();
  westShaft.name = 'springfield_train_elevator_shaft';
  westShaft.position.set(westElevatorX, 0, westElevatorZ);
  const westShaftBack = new THREE.Mesh(new THREE.BoxGeometry(4.9,13.2,0.16), shaftGlass); westShaftBack.position.set(0,6.6,0);
  const westShaftL = new THREE.Mesh(new THREE.BoxGeometry(0.18,13.2,4.7), westLiftMetal); westShaftL.position.set(-2.35,6.6,0);
  const westShaftR = westShaftL.clone(); westShaftR.position.x = 2.35;
  const westShaftTop = new THREE.Mesh(new THREE.BoxGeometry(4.9,0.22,4.7), westLiftMetal); westShaftTop.position.set(0,13.1,0);
  westShaft.add(westShaftBack,westShaftL,westShaftR,westShaftTop);
  markSolid(westShaftL,westShaftR);
  railServiceGroup.add(westShaft);

  const westElevatorCab = new THREE.Group();
  westElevatorCab.name = 'springfield_train_elevator_cabin';
  westElevatorCab.position.set(westElevatorX,0,westElevatorZ);
  const westFloor = new THREE.Mesh(new THREE.BoxGeometry(4.15,0.24,4.05),createMaterial(0x9e9e9e)); westFloor.position.y=0.12; westFloor.userData.walkable=true; westFloor.userData.walkablePriority=70;
  const westBack = new THREE.Mesh(new THREE.BoxGeometry(4.15,3.35,0.18),westLiftPanel); westBack.position.set(0,1.82,0);
  const westL = new THREE.Mesh(new THREE.BoxGeometry(0.18,3.35,4.05),westLiftMetal); westL.position.set(-1.98,1.82,0);
  const westR = westL.clone(); westR.position.x=1.98;
  const westCeil = new THREE.Mesh(new THREE.BoxGeometry(4.15,0.18,4.05),westLiftMetal); westCeil.position.set(0,3.48,0);
  const westLight = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.05,0.7),new THREE.MeshBasicMaterial({color:0xfff1b8})); westLight.position.set(0,3.37,0);
  const westPanel = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.8,0.12),createMaterial(0x212121)); westPanel.position.set(1.82,1.45,1.25);
  const westButton = new THREE.Mesh(new THREE.SphereGeometry(0.07,6,5),new THREE.MeshBasicMaterial({color:0xffd54f})); westButton.position.set(1.75,1.48,1.34);
  const westDoorMat = createMaterial(0xb0bec5,0.25,0.75);
  const westSouthL = new THREE.Mesh(new THREE.BoxGeometry(1.85,3.1,0.12),westDoorMat); westSouthL.position.set(-0.94,1.66,2.02);
  const westSouthR = westSouthL.clone(); westSouthR.position.x=0.94;
  const westNorthL = westSouthL.clone(); westNorthL.position.z=-2.02;
  const westNorthR = westSouthR.clone(); westNorthR.position.z=-2.02;
  westElevatorCab.add(westFloor,westBack,westL,westR,westCeil,westLight,westPanel,westButton,westSouthL,westSouthR,westNorthL,westNorthR);
  railServiceGroup.add(westElevatorCab);

  // Readable landing frames on both sides of the cabin, with an upper skybridge
  // that meets the Springfield platform cleanly.
  const makeWestLiftLanding=(y:number,z:number)=>{
    const frame=new THREE.Group(); frame.position.set(westElevatorX,y,z);
    const l=new THREE.Mesh(new THREE.BoxGeometry(0.22,3.7,0.28),westLiftMetal); l.position.set(-2.18,1.85,0);
    const r=l.clone(); r.position.x=2.18;
    const h=new THREE.Mesh(new THREE.BoxGeometry(4.58,0.22,0.28),westLiftMetal); h.position.set(0,3.6,0);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(0.30,0.62,0.12),createMaterial(0x263238)); panel.position.set(2.38,1.35,0.08);
    const light=new THREE.Mesh(new THREE.SphereGeometry(0.065,6,5),new THREE.MeshBasicMaterial({color:0xffd54f})); light.position.set(2.38,1.45,0.16);
    frame.add(l,r,h,panel,light); railServiceGroup.add(frame);
  };
  makeWestLiftLanding(0,westElevatorZ+2.15);
  makeWestLiftLanding(12.45,westElevatorZ-2.15);
  const westSkybridge = new THREE.Mesh(new THREE.BoxGeometry(4.6,0.32,7.6),createMaterial(0x78909c));
  westSkybridge.name='springfield_elevator_skybridge'; westSkybridge.position.set(westElevatorX,12.36,westElevatorZ-5.7);
  westSkybridge.userData.walkable=true; westSkybridge.userData.walkablePriority=68; westSkybridge.userData.walkableSnapFromBelow=1.2;
  const westSkyRailL=new THREE.Mesh(new THREE.BoxGeometry(0.15,1.1,7.6),westLiftMetal); westSkyRailL.position.set(westElevatorX-2.22,12.95,westElevatorZ-5.7);
  const westSkyRailR=westSkyRailL.clone(); westSkyRailR.position.x=westElevatorX+2.22;
  markSolid(westSkyRailL,westSkyRailR); railServiceGroup.add(westSkybridge,westSkyRailL,westSkyRailR);

  let westElevatorY=0;
  let westElevatorTargetY=0;
  let westElevatorTargetLevel:'ground'|'platform'='ground';
  let westElevatorMoving=false;
  let westElevatorDoorProgress=1;
  const updateWestElevator=(dt:number)=>{
    const atTarget=Math.abs(westElevatorY-westElevatorTargetY)<0.025;
    const desiredDoor=atTarget&&!westElevatorMoving?1:0;
    westElevatorDoorProgress=THREE.MathUtils.damp(westElevatorDoorProgress,desiredDoor,8.5,dt);
    const slide=westElevatorDoorProgress*1.30;
    westSouthL.position.x=-0.94-slide; westSouthR.position.x=0.94+slide;
    westNorthL.position.x=-0.94-slide; westNorthR.position.x=0.94+slide;
    if(westElevatorMoving&&westElevatorDoorProgress<0.06){
      const direction=Math.sign(westElevatorTargetY-westElevatorY);
      westElevatorY+=direction*Math.min(Math.abs(westElevatorTargetY-westElevatorY),5.0*dt);
      if(Math.abs(westElevatorTargetY-westElevatorY)<0.025){westElevatorY=westElevatorTargetY;westElevatorMoving=false;}
    }
    westElevatorCab.position.y=westElevatorY;
  };
  const requestWestElevatorLevel=(level:'ground'|'platform')=>{
    westElevatorTargetLevel=level;
    westElevatorTargetY=level==='platform'?12.45:0;
    if(Math.abs(westElevatorTargetY-westElevatorY)>0.05) westElevatorMoving=true;
  };
  const getWestElevatorState=()=>({
    y:westElevatorY,
    level:Math.abs(westElevatorY)<0.08?'ground' as const:Math.abs(westElevatorY-12.45)<0.08?'platform' as const:'between' as const,
    moving:westElevatorMoving,
    doorsOpen:westElevatorDoorProgress>0.82&&!westElevatorMoving,
    target:westElevatorTargetLevel,
  });

  // --- Train carriages -------------------------------------------------------
  const trainMesh = new THREE.Group(); trainMesh.name = 'magnet_train_service'; trainMesh.position.set(240, 14.6, railZ);
  const trainInteriorFloorY = -1.31;
  const trainInteriorBounds = { minX: -30.0, maxX: 30.0, minZ: -1.62, maxZ: 1.62 };
  const trainInteriorBlockers: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  const trainDoorLocalPositions = [new THREE.Vector3(-16, trainInteriorFloorY, 2.25), new THREE.Vector3(16, trainInteriorFloorY, 2.25)];
  const trainDoorLeaves: { left: THREE.Object3D; right: THREE.Object3D; baseLeft: number; baseRight: number }[] = [];
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fdcff, transparent: true, opacity: 0.24, roughness: 0.16, metalness: 0.05,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const trainBodyMat = createMaterial(0xf5f5f5, 0.35, 0.16);
  const trainTrimMat = createMaterial(0x263238, 0.35, 0.55);
  const seatMat = createMaterial(0x2f73a8, 0.65, 0.12);

  for (const offset of [-16, 16]) {
    const carriage = new THREE.Group(); carriage.position.x = offset; carriage.name = `train_carriage_${offset}`;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(30, 0.26, 4.25), createMaterial(0x9aa7ad, 0.7, 0.12)); floor.position.y = -1.44;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(30, 0.24, 4.25), trainBodyMat); roof.position.y = 1.68;
    const lowerL = new THREE.Mesh(new THREE.BoxGeometry(30, 0.68, 0.20), trainBodyMat); lowerL.position.set(0, -0.99, -2.08);
    const lowerR = lowerL.clone(); lowerR.position.z = 2.08;
    const topL = new THREE.Mesh(new THREE.BoxGeometry(30, 0.34, 0.20), trainBodyMat); topL.position.set(0, 1.39, -2.08);
    const topR = topL.clone(); topR.position.z = 2.08;
    carriage.add(floor, roof, lowerL, lowerR, topL, topR);

    // Window pillars and genuinely transparent glass panels. The carriage is a
    // shell rather than one opaque box, so passengers are actually visible through it.
    for (let w = -13.6; w <= 13.6; w += 4.55) {
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.20, 2.08, 0.18), trainTrimMat); pillar.position.set(w, 0.24, side * 2.09); carriage.add(pillar);
      }
    }
    for (let w = -11.35; w <= 11.35; w += 4.55) {
      for (const side of [-1, 1]) {
        // Leave the centre of the platform side free for the boarding doorway.
        if (side === 1 && Math.abs(w) < 2.35) continue;
        const win = new THREE.Mesh(new THREE.BoxGeometry(4.18, 1.82, 0.045), glassMaterial.clone());
        win.renderOrder = 4; win.position.set(w, 0.26, side * 2.105); carriage.add(win);
      }
    }

    // Visible sliding train door with glass upper section on the platform side.
    const doorGroup = new THREE.Group(); doorGroup.position.set(0, 0, 2.12);
    const makeTrainDoorLeaf = (x: number) => {
      const leaf = new THREE.Group(); leaf.position.x = x;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.08, 0.10), pokeCyanMat); lower.position.y = -0.72;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.72, 0.045), glassMaterial.clone()); glass.position.y = 0.68; glass.renderOrder = 5;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.85, 0.12), trainTrimMat); edge.position.set(Math.sign(x) * -0.73, 0.18, 0);
      leaf.add(lower, glass, edge); return leaf;
    };
    const doorL = makeTrainDoorLeaf(-0.80); const doorR = makeTrainDoorLeaf(0.80); doorGroup.add(doorL, doorR); carriage.add(doorGroup);
    trainDoorLeaves.push({ left: doorL, right: doorR, baseLeft: -0.80, baseRight: 0.80 });

    // End walls. Inner ends have a central gangway opening between carriages.
    for (const localX of [-14.85, 14.85]) {
      const isInner = (offset < 0 && localX > 0) || (offset > 0 && localX < 0);
      if (isInner) {
        const sideA = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 1.15), trainBodyMat); sideA.position.set(localX, 0.10, -1.52);
        const sideB = sideA.clone(); sideB.position.z = 1.52; carriage.add(sideA, sideB);
      } else {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 4.15), trainBodyMat); wall.position.set(localX, 0.10, 0); carriage.add(wall);
      }
    }

    // Side benches leave a wide central aisle. Their local AABBs are mirrored into
    // App.tsx so the player slides around seats instead of walking through them.
    for (const sx of [-10.5, -5.3, 5.3, 10.5]) {
      for (const side of [-1, 1]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.52, 0.72), seatMat); seat.position.set(sx, -0.78, side * 1.30); carriage.add(seat);
        trainInteriorBlockers.push({ minX: offset + sx - 1.18, maxX: offset + sx + 1.18, minZ: side * 1.30 - 0.45, maxZ: side * 1.30 + 0.45 });
      }
    }
    trainMesh.add(carriage);
  }

  // Flexible gangway floor/roof between the two carriages.
  const gangFloor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 2.5), createMaterial(0x707b80)); gangFloor.position.set(0, -1.43, 0);
  const gangRoof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.20, 2.5), trainTrimMat); gangRoof.position.set(0, 1.62, 0);
  trainMesh.add(gangFloor, gangRoof);

  const noseE = new THREE.Mesh(new THREE.ConeGeometry(2.25, 6.0, 8), pokeBlueMat); noseE.rotation.z = -Math.PI / 2; noseE.position.set(34.8, 0, 0); trainMesh.add(noseE);
  const noseW = noseE.clone(); noseW.rotation.z = Math.PI / 2; noseW.position.x = -34.8; trainMesh.add(noseW);

  const passengerPalette = [0xef5350, 0x42a5f5, 0xffca28, 0x66bb6a, 0xab47bc, 0x26a69a];
  const passengerDefs = [
    ['Pokéfan Mira', -26.5, -1.20, ['I take the Magnet Train just to watch Goldenrod fly past.', 'Please do not battle inside the carriage.']],
    ['Office Worker Ken', -21.0, 1.20, ['This commute is still faster than driving through Springfield.', 'Next stop: another meeting.']],
    ['School Kid Emi', -11.0, -1.20, ['I can see the whole map from up here!', 'Do you think Pikachu needs a train ticket?']],
    ['Backpacker Leo', -5.6, 1.20, ['Two cities, one train. Pretty good deal.', 'The windows are way clearer now.']],
    ['Pokéfan June', 5.6, -1.20, ['I am trying to spot a flying Charizard.', 'Do not miss your stop!']],
    ['Tourist Max', 11.0, 1.20, ['Springfield is... not what the brochure promised.', 'I heard the police chases here are intense.']],
    ['Commuter Ana', 21.0, -1.20, ['I always sit near the door.', 'Goldenrod Department Store is my stop.']],
    ['Trainer Theo', 26.5, 1.20, ['My Pokémon loves the train.', 'No, I am not battling in the aisle.']],
  ] as const;
  const trainPassengers: { name: string; localPos: THREE.Vector3; mesh: THREE.Group; dialogues: string[] }[] = [];
  passengerDefs.forEach((def, i) => {
    const [name, x, z, dialogues] = def;
    const person = new THREE.Group(); person.name = `train_passenger_${i}`;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.75, 7), createMaterial(passengerPalette[i % passengerPalette.length])); body.position.y = -0.30;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 7), createMaterial(0xf1bf94)); head.position.y = 0.23;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), createMaterial(i % 2 ? 0x4a3328 : 0x2a211f)); hair.position.y = 0.34;
    person.add(body, head, hair); person.position.set(x, 0, z); trainMesh.add(person);
    trainPassengers.push({ name, localPos: new THREE.Vector3(x, trainInteriorFloorY, z), mesh: person, dialogues: [...dialogues] });
  });
  railServiceGroup.add(trainMesh);

  // Waiting/dismounting passengers become visible at whichever station the train
  // is dwelling at. These are separate from the passengers who remain inside.
  const eastPassengers = new THREE.Group(); const westPassengers = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const makeP = () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.70, 6), createMaterial(passengerPalette[(i + 2) % passengerPalette.length])); b.position.y = 0.45; const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), createMaterial(0xe8b38d)); h.position.y = 0.95; g.add(b, h); return g; };
    const ep = makeP(); ep.position.set(226 + i * 4.5, 12.7, railZ + 8); eastPassengers.add(ep);
    const wp = makeP(); wp.position.set(-254 + i * 4.5, 12.7, railZ + 8); westPassengers.add(wp);
  }
  railServiceGroup.add(eastPassengers, westPassengers); westPassengers.visible = false;

  let trainDirection = -1;
  let trainDwell = 4.5;
  let trainDoorProgress = 1;
  const trainSpeed = 28;
  const isTrainStopped = () => trainDwell > 0.02;
  const getStoppedStation = (): 'goldenrod' | 'springfield' | null => {
    if (!isTrainStopped()) return null;
    if (trainMesh.position.x >= 239.5) return 'goldenrod';
    if (trainMesh.position.x <= -239.5) return 'springfield';
    return null;
  };
  const getTrainDoorWorldPositions = () => {
    trainMesh.updateWorldMatrix(true, false);
    return trainDoorLocalPositions.map((local) => trainMesh.localToWorld(local.clone()));
  };
  const updateTrainService = (dt: number) => {
    updateElevator(dt);
    updateWestElevator(dt);
    const stopped = trainDwell > 0;
    trainDoorProgress = THREE.MathUtils.damp(trainDoorProgress, stopped ? 1 : 0, 8.5, dt);
    for (const leaf of trainDoorLeaves) {
      leaf.left.position.x = leaf.baseLeft - trainDoorProgress * 1.18;
      leaf.right.position.x = leaf.baseRight + trainDoorProgress * 1.18;
    }
    if (trainDwell > 0) { trainDwell = Math.max(0, trainDwell - dt); return; }
    trainMesh.position.x += trainDirection * trainSpeed * dt;
    eastPassengers.visible = false; westPassengers.visible = false;
    if (trainMesh.position.x <= -240) { trainMesh.position.x = -240; trainDirection = 1; trainDwell = 5.5; westPassengers.visible = true; }
    else if (trainMesh.position.x >= 240) { trainMesh.position.x = 240; trainDirection = -1; trainDwell = 5.5; eastPassengers.visible = true; }
  };

  root.add(trainStationGroup);
  // railServiceGroup is temporarily added to root so its world matrix is authored
  // correctly. App.tsx immediately re-parents it directly to the Scene before
  // collision registration, keeping it visible across both districts.
  root.add(railServiceGroup);

  landmarks.push({ id: 'magnet_train_station', name: 'Goldenrod Magnet Train Station', category: 'goldenrod', x: 240, z: -110, icon: 'train', color: '#00acc1' });
  landmarks.push({ id: 'springfield_train_terminal', name: 'Springfield Magnet Train Terminal', category: 'homer_city', x: -240, z: -88, icon: 'train', color: '#26c6da' });

  // -------------------------------------------------------------------------
  // 8. IMPORTANT LANDMARK 6: BIKE SHOP ("MIRACLE CYCLE") (X = 150, Z = 20)
  // -------------------------------------------------------------------------
  const bikeShopGroup = new THREE.Group();
  bikeShopGroup.position.set(150, 0, 20);
  bikeShopGroup.name = 'goldenrod_bike_shop';

  addEnterableShell(bikeShopGroup, 16, 14, 7, pokeYellowMat, sidewalkMat, 3.6, 3.6);
  const bikeDoor = new Door({
    id: 'bike_shop_door', name: 'Miracle Cycle Door', houseName: 'Miracle Cycle Bike Shop',
    type: 'double_slide', width: 3.4, height: 3.6,
    worldPos: new THREE.Vector3(150, 0, 27), frameColor: 0xe53935, glassColor: 0x81d4fa,
  });
  root.add(bikeDoor.group); doors.push(bikeDoor);

  const bsRoof = new THREE.Mesh(new THREE.BoxGeometry(17.5, 1.2, 15.5), pokeBlueMat);
  bsRoof.userData.landableRoof = true;
  bsRoof.position.y = 7.5;
  bikeShopGroup.add(bsRoof);

  const bsAwning = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 3.2), pokeRedMat);
  bsAwning.userData.landableRoof = true;
  bsAwning.position.set(0, 4.2, 8.2);
  bikeShopGroup.add(bsAwning);

  const bsSign = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 0.3), pokeDarkRedMat);
  bsSign.position.set(0, 5.8, 7.2);
  bikeShopGroup.add(bsSign);

  const bsWindow = new THREE.Mesh(new THREE.BoxGeometry(12, 2.8, 0.2), glassMat);
  bsWindow.position.set(0, 2.0, 7.38);
  bikeShopGroup.add(bsWindow);

  const createBikeProp = (color: number) => {
    const bike = new THREE.Group();
    const bMat = createMaterial(color);
    const wheel1 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 6, 12), steelMat);
    wheel1.position.set(-0.6, 0.4, 0);
    const wheel2 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 6, 12), steelMat);
    wheel2.position.set(0.6, 0.4, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), bMat);
    frame.position.set(0, 0.6, 0);
    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.6), steelMat);
    handlebar.position.set(0.5, 0.9, 0);
    bike.add(wheel1, wheel2, frame, handlebar);
    return bike;
  };

  const bike1 = createBikeProp(0xe53935);
  bike1.position.set(-3.0, 0, 2.5);
  const bike2 = createBikeProp(0x1e88e5);
  bike2.position.set(3.0, 0, 2.5);
  bikeShopGroup.add(bike1, bike2);

  root.add(bikeShopGroup);
  landmarks.push({
    id: 'goldenrod_bike_shop',
    name: 'Miracle Cycle Bike Shop',
    category: 'goldenrod',
    x: 150,
    z: 20,
    icon: 'bike',
    color: '#fdd835',
  });

  // -------------------------------------------------------------------------
  // 9. IMPORTANT LANDMARK 7: FLOWER SHOP (relocated beside Main Avenue)
  // -------------------------------------------------------------------------
  const flowerShopGroup = new THREE.Group();
  flowerShopGroup.position.set(221, 0, 16);
  // Face the entrance west toward Main Avenue instead of into the city block.
  flowerShopGroup.rotation.y = -Math.PI / 2;
  flowerShopGroup.name = 'goldenrod_flower_shop';

  // Rebuilt as a real hollow florist instead of a solid box under an enormous
  // greenhouse cone. The old geometry overlapped the lawn/road and looked broken.
  addEnterableShell(flowerShopGroup, 18, 16, 6.5, pokeMintMat, createMaterial(0xe7d7b1), 3.6, 3.5);
  const floristDoor = new Door({
    id: 'goldenrod_florist_door', name: 'Flower Shop Door', houseName: 'Goldenrod Flower Shop',
    type: 'double_slide', width: 3.4, height: 3.5,
    worldPos: new THREE.Vector3(213, 0, 16), rotationY: -Math.PI / 2, frameColor: 0xff6fae, glassColor: 0xc8f7e8,
  });
  root.add(floristDoor.group); doors.push(floristDoor);

  // Simple greenhouse-style pitched roof with two separated panes so there is no
  // z-fighting against the wall shell.
  const roofL = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.28, 17.2), glassMat);
  roofL.userData.landableRoof = true;
  roofL.position.set(-4.45, 7.65, 0); roofL.rotation.z = -0.48;
  const roofR = roofL.clone(); roofR.userData.landableRoof = true; roofR.position.x = 4.45; roofR.rotation.z = 0.48;
  flowerShopGroup.add(roofL, roofR);

  const fsSign = new THREE.Mesh(new THREE.BoxGeometry(11.5, 1.1, 0.22), pokePinkMat);
  fsSign.position.set(0, 5.1, 8.42);
  flowerShopGroup.add(fsSign);

  // Interior counter + flower racks.
  const counter = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.0, 1.1), woodMat);
  counter.position.set(0, 0.5, -4.7); markSolid(counter); flowerShopGroup.add(counter);
  const flowerBlooms = [0xf44336, 0xffeb3b, 0x9c27b0, 0x42a5f5, 0xff9800, 0xff6fae];
  for (let row = 0; row < 3; row++) {
    for (let side = -1; side <= 1; side += 2) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 4.0), createMaterial(0x8d6e63));
      rack.position.set(side * 4.8, 0.34, -1.6 + row * 2.3); markSolid(rack); flowerShopGroup.add(rack);
      for (let j = 0; j < 5; j++) {
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.26, 5, 5), createMaterial(flowerBlooms[(row * 2 + j) % flowerBlooms.length]));
        bloom.position.set(side * 4.8 + (j - 2) * 0.25, 0.78, -2.8 + row * 2.3 + (j % 2) * 0.35);
        flowerShopGroup.add(bloom);
      }
    }
  }

  // Outdoor beds are small, deliberate soil plots rather than one huge grass plane
  // laid on top of the city terrain.
  for (const bx of [-8.0, 8.0]) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.18, 5.5), createMaterial(0x5d4037));
    bed.position.set(bx, 0.11, 5.0); flowerShopGroup.add(bed);
  }

  root.add(flowerShopGroup);
  landmarks.push({
    id: 'goldenrod_flower_shop',
    name: 'Goldenrod Flower Shop',
    category: 'goldenrod',
    x: 221,
    z: 16,
    icon: 'flower',
    color: '#80cbc4',
  });

  // -------------------------------------------------------------------------
  // 10. MAJOR SKYLINE LANDMARK: TWIN TOWERS / LIBERTY PLAZA
  // Approximate requested centre: X≈224, Z≈60. The two tower cores sit fully
  // inside the existing Main Avenue / East Avenue / Z=0 / Z=90 city block.
  // -------------------------------------------------------------------------
  const twinTowers = new THREE.Group();
  twinTowers.name = 'goldenrod_twin_towers_landmark';

  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(58, 0.18, 44),
    createSurfaceMaterial(0xa9adb0, 'concrete', 0.84, 0.04, 15, 12)
  );
  plaza.name = 'liberty_plaza_paving';
  plaza.position.set(245, 0.09, 60);
  plaza.userData.walkable = true;
  plaza.userData.walkablePriority = 9;
  plaza.userData.mapAreaKind = 'paved';
  plaza.userData.roadCriticalDetail = true;
  twinTowers.add(plaza);

  // A short paved throat joins the plaza to Main Avenue without occupying the road.
  const plazaApproach = new THREE.Mesh(
    new THREE.BoxGeometry(7.5, 0.16, 10),
    createSurfaceMaterial(0xb8bbbd, 'concrete', 0.86, 0.03, 3, 4)
  );
  plazaApproach.position.set(212.5, 0.085, 60);
  plazaApproach.userData.walkable = true;
  plazaApproach.userData.walkablePriority = 10;
  plazaApproach.userData.sidewalkSurface = true;
  plazaApproach.userData.roadCriticalDetail = true;
  twinTowers.add(plazaApproach);

  const towerBodyMat = new THREE.MeshStandardMaterial({
    color: 0xaeb4b5, roughness: 0.28, metalness: 0.48, envMapIntensity: 1.15
  });
  const towerGlassMat = new THREE.MeshStandardMaterial({
    color: 0x58656d, roughness: 0.18, metalness: 0.52, envMapIntensity: 1.30
  });
  const towerRibMat = new THREE.MeshStandardMaterial({
    color: 0xd3d6d6, roughness: 0.22, metalness: 0.78
  });
  const towerDarkMat = createMaterial(0x424a50, 0.42, 0.42);
  const lobbyGlassMat = createGlassMaterial(0x9fd5df, 0.40, 0.12);

  type TowerKey = 'west' | 'east';
  type TowerLift = GoldenrodBuildResult['twinTowerService']['elevators']['west'];
  const towerElevators = {} as Record<TowerKey, TowerLift>;
  const towerElevatorUpdaters: Array<(dt: number) => void> = [];

  const makeTower = (key: TowerKey, name: string, x: number, z: number, height: number, antenna = false) => {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, 0, z);
    const width = 18.5;
    const depth = 18.5;
    const lobbyH = 8.0;
    const wallT = 0.62;
    const lobbyOuter = 19.3;
    const entranceWidth = 5.0;
    const entranceHeight = 4.25;

    // The old towers used one solid lobby cube, which made the visible lobby
    // impossible to enter. Build a genuine hollow podium with a west-facing portal
    // toward Liberty Plaza/Main Avenue instead. Only the visible wall slabs collide.
    const lobbyFloor = new THREE.Mesh(new THREE.BoxGeometry(lobbyOuter - 0.5, 0.28, lobbyOuter - 0.5), towerRibMat);
    lobbyFloor.name = `${name}_lobby_floor`;
    lobbyFloor.position.y = 0.14;
    lobbyFloor.userData.walkable = true;
    lobbyFloor.userData.walkablePriority = 64;
    group.add(lobbyFloor);

    const lobbyEast = new THREE.Mesh(new THREE.BoxGeometry(wallT, lobbyH, lobbyOuter), towerDarkMat);
    lobbyEast.position.set(lobbyOuter / 2, lobbyH / 2, 0);
    const lobbyNorth = new THREE.Mesh(new THREE.BoxGeometry(lobbyOuter, lobbyH, wallT), towerDarkMat);
    lobbyNorth.position.set(0, lobbyH / 2, -lobbyOuter / 2);
    const lobbySouth = lobbyNorth.clone(); lobbySouth.position.z = lobbyOuter / 2;
    const westSideDepth = (lobbyOuter - entranceWidth) / 2;
    const lobbyWestN = new THREE.Mesh(new THREE.BoxGeometry(wallT, lobbyH, westSideDepth), towerDarkMat);
    lobbyWestN.position.set(-lobbyOuter / 2, lobbyH / 2, -(entranceWidth / 2 + westSideDepth / 2));
    const lobbyWestS = lobbyWestN.clone(); lobbyWestS.position.z = entranceWidth / 2 + westSideDepth / 2;
    const lobbyWestHeader = new THREE.Mesh(new THREE.BoxGeometry(wallT, lobbyH - entranceHeight, entranceWidth), towerDarkMat);
    lobbyWestHeader.position.set(-lobbyOuter / 2, entranceHeight + (lobbyH - entranceHeight) / 2, 0);
    markSolid(lobbyEast, lobbyNorth, lobbySouth, lobbyWestN, lobbyWestS, lobbyWestHeader);
    group.add(lobbyEast, lobbyNorth, lobbySouth, lobbyWestN, lobbyWestS, lobbyWestHeader);

    // Glazing is inset from the structural shell so the lobby still reads like the
    // existing glass podium without putting an invisible/visual pane across the door.
    const lobbyGlassY = 4.2;
    for (const side of [-1, 1]) {
      const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(12.8, 5.4, 0.12), lobbyGlassMat);
      frontGlass.position.set(0, lobbyGlassY, side * (lobbyOuter / 2 - 0.08));
      group.add(frontGlass);
    }
    const eastGlass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.4, 12.8), lobbyGlassMat);
    eastGlass.position.set(lobbyOuter / 2 - 0.08, lobbyGlassY, 0);
    group.add(eastGlass);
    const westGlassSpan = (12.8 - entranceWidth) / 2;
    for (const side of [-1, 1]) {
      const westGlass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.4, westGlassSpan), lobbyGlassMat);
      westGlass.position.set(-lobbyOuter / 2 + 0.08, lobbyGlassY, side * (entranceWidth / 2 + westGlassSpan / 2));
      group.add(westGlass);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.72, 7.5, 0.72), towerRibMat);
      pier.position.set(sx * 9.35, 3.95, sz * 9.35);
      markSolid(pier);
      group.add(pier);
    }

    const entranceDoor = new Door({
      id: `liberty_tower_${key}_entrance`,
      name: `${key === 'west' ? 'West' : 'East'} Twin Tower entrance`,
      houseName: `${key === 'west' ? 'West' : 'East'} Twin Tower`,
      type: 'double_slide', width: 4.7, height: entranceHeight,
      worldPos: new THREE.Vector3(x - lobbyOuter / 2 - 0.02, 0, z),
      rotationY: Math.PI / 2,
      frameColor: 0xcfd8dc,
      glassColor: 0xa9e9f4,
    });
    entranceDoor.setAutomatic(5.8, 1.35, 10.5);
    root.add(entranceDoor.group);
    doors.push(entranceDoor);

    const lobbyCrown = new THREE.Mesh(new THREE.BoxGeometry(21.0, 0.65, 21.0), towerRibMat);
    lobbyCrown.position.y = lobbyH;
    lobbyCrown.userData.landableRoof = false;
    group.add(lobbyCrown);

    // Hollow four-wall shaft rather than one enormous solid box. This keeps the
    // exterior fully collision-solid for Charizard/aircraft while leaving real
    // interior volume for the lift to travel through.
    const shaftH = height - lobbyH;
    const shaftWallT = 0.72;
    const shaftNorth = new THREE.Mesh(new THREE.BoxGeometry(width, shaftH, shaftWallT), towerBodyMat);
    shaftNorth.position.set(0, lobbyH + shaftH / 2, -depth / 2);
    const shaftSouth = shaftNorth.clone(); shaftSouth.position.z = depth / 2;
    const shaftWest = new THREE.Mesh(new THREE.BoxGeometry(shaftWallT, shaftH, depth - shaftWallT * 2), towerBodyMat);
    shaftWest.position.set(-width / 2, lobbyH + shaftH / 2, 0);
    const shaftEast = shaftWest.clone(); shaftEast.position.x = width / 2;
    for (const wall of [shaftNorth, shaftSouth, shaftWest, shaftEast]) {
      wall.userData.preserveAuthoredMaterial = true;
      markSolid(wall);
    }
    group.add(shaftNorth, shaftSouth, shaftWest, shaftEast);

    // Dark inset curtain-wall planes make the dense silver vertical mullions read
    // clearly at both street and skyline distance.
    const inset = width / 2 + 0.045;
    const glassFront = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.7, shaftH - 1.4), towerGlassMat);
    glassFront.position.set(0, lobbyH + shaftH / 2, inset);
    const glassBack = glassFront.clone(); glassBack.position.z = -inset; glassBack.rotation.y = Math.PI;
    const glassLeft = new THREE.Mesh(new THREE.PlaneGeometry(depth - 0.7, shaftH - 1.4), towerGlassMat);
    glassLeft.position.set(-inset, lobbyH + shaftH / 2, 0); glassLeft.rotation.y = -Math.PI / 2;
    const glassRight = glassLeft.clone(); glassRight.position.x = inset; glassRight.rotation.y = Math.PI / 2;
    group.add(glassFront, glassBack, glassLeft, glassRight);

    // Repeating facade: instancing keeps hundreds of vertical lines / floor bands
    // cheap while giving the towers the recognisable closely-spaced exterior grid.
    const ribGeo = new THREE.BoxGeometry(0.13, shaftH - 0.8, 0.11);
    const ribCountPerFace = 23;
    const ribs = new THREE.InstancedMesh(ribGeo, towerRibMat, ribCountPerFace * 4);
    ribs.name = `${name}_vertical_facade_ribs`;
    ribs.userData.preserveAuthoredMaterial = true;
    const dummy = new THREE.Object3D();
    let ri = 0;
    for (let i = 0; i < ribCountPerFace; i++) {
      const t = i / (ribCountPerFace - 1);
      const offset = THREE.MathUtils.lerp(-width / 2 + 0.35, width / 2 - 0.35, t);
      for (const face of [0, 1]) {
        dummy.position.set(offset, lobbyH + shaftH / 2, face === 0 ? width / 2 + 0.12 : -width / 2 - 0.12);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); ribs.setMatrixAt(ri++, dummy.matrix);
      }
      for (const face of [0, 1]) {
        dummy.position.set(face === 0 ? width / 2 + 0.12 : -width / 2 - 0.12, lobbyH + shaftH / 2, offset);
        dummy.rotation.set(0, Math.PI / 2, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); ribs.setMatrixAt(ri++, dummy.matrix);
      }
    }
    ribs.instanceMatrix.needsUpdate = true;
    group.add(ribs);

    const floors = Math.floor((height - 11) / 4.0);
    const bandGeoFront = new THREE.BoxGeometry(width + 0.32, 0.10, 0.10);
    const bandsFront = new THREE.InstancedMesh(bandGeoFront, towerRibMat, floors * 2);
    bandsFront.userData.preserveAuthoredMaterial = true;
    const bandGeoSide = new THREE.BoxGeometry(0.10, 0.10, depth + 0.32);
    const bandsSide = new THREE.InstancedMesh(bandGeoSide, towerRibMat, floors * 2);
    bandsSide.userData.preserveAuthoredMaterial = true;
    for (let i = 0; i < floors; i++) {
      const y = 11.0 + i * 4.0;
      dummy.position.set(0, y, width / 2 + 0.14); dummy.rotation.set(0,0,0); dummy.updateMatrix(); bandsFront.setMatrixAt(i*2, dummy.matrix);
      dummy.position.z = -width / 2 - 0.14; dummy.rotation.y = 0; dummy.updateMatrix(); bandsFront.setMatrixAt(i*2+1, dummy.matrix);
      dummy.position.set(width / 2 + 0.14, y, 0); dummy.rotation.set(0,0,0); dummy.updateMatrix(); bandsSide.setMatrixAt(i*2, dummy.matrix);
      dummy.position.x = -width / 2 - 0.14; dummy.updateMatrix(); bandsSide.setMatrixAt(i*2+1, dummy.matrix);
    }
    bandsFront.instanceMatrix.needsUpdate = true; bandsSide.instanceMatrix.needsUpdate = true;
    group.add(bandsFront, bandsSide);

    // Fully walkable/landable roof deck with solid parapets around all four edges.
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(width + 0.9, 0.75, depth + 0.9), towerRibMat);
    roofSlab.name = `${name}_walkable_rooftop`;
    roofSlab.position.y = height + 0.38;
    roofSlab.userData.walkable = true;
    roofSlab.userData.walkablePriority = 88;
    roofSlab.userData.landableRoof = true;
    const roofTopY = height + 0.755;
    const parapetH = 1.18;
    const parapetT = 0.28;
    const parapetN = new THREE.Mesh(new THREE.BoxGeometry(width + 0.9, parapetH, parapetT), towerRibMat);
    parapetN.position.set(0, roofTopY + parapetH / 2, -(depth + 0.9) / 2 + parapetT / 2);
    const parapetS = parapetN.clone(); parapetS.position.z = (depth + 0.9) / 2 - parapetT / 2;
    const parapetW = new THREE.Mesh(new THREE.BoxGeometry(parapetT, parapetH, depth + 0.9), towerRibMat);
    parapetW.position.set(-(width + 0.9) / 2 + parapetT / 2, roofTopY + parapetH / 2, 0);
    const parapetE = parapetW.clone(); parapetE.position.x = (width + 0.9) / 2 - parapetT / 2;
    markSolid(parapetN, parapetS, parapetW, parapetE);
    group.add(roofSlab, parapetN, parapetS, parapetW, parapetE);

    // Compact rooftop utilities, deliberately kept away from the lift doorway and
    // central landing area so Charizard has a clear place to touch down.
    const utilityA = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.25, 2.2), towerDarkMat);
    utilityA.position.set(-4.5, roofTopY + 0.63, -4.4); markSolid(utilityA);
    const utilityB = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 2.0), towerDarkMat);
    utilityB.position.set(-4.0, roofTopY + 0.43, 4.3); markSolid(utilityB);
    const roofLightA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.8, 0.18), towerRibMat);
    roofLightA.position.set(6.0, roofTopY + 0.9, -6.0);
    const roofLightGlowA = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 6), new THREE.MeshBasicMaterial({ color: 0xffe7b0 }));
    roofLightGlowA.position.set(6.0, roofTopY + 1.82, -6.0);
    group.add(utilityA, utilityB, roofLightA, roofLightGlowA);

    // Purpose-built two-stop lift. The cabin travels through the hollow shaft and
    // carries the player using the same ride ownership model as the magnet lifts.
    const elevatorX = 3.8;
    const elevatorZ = 0.0;
    const cabin = new THREE.Group();
    cabin.name = `${name}_elevator_cabin`;
    cabin.position.set(elevatorX, 0, elevatorZ);
    const elevMetal = createMaterial(0x607d8b, 0.30, 0.66);
    const elevDark = createMaterial(0x263238, 0.26, 0.58);
    const elevFloor = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.24, 4.2), createMaterial(0x90a4ae));
    elevFloor.position.y = 0.12;
    const elevLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.55, 4.2), elevMetal); elevLeft.position.set(-2.08, 1.88, 0);
    const elevRight = elevLeft.clone(); elevRight.position.x = 2.08;
    const elevBack = new THREE.Mesh(new THREE.BoxGeometry(4.35, 3.55, 0.18), elevMetal); elevBack.position.set(0, 1.88, -2.02);
    const elevCeiling = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.18, 4.2), elevDark); elevCeiling.position.set(0, 3.60, 0);
    const elevLight = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.72), new THREE.MeshBasicMaterial({ color: 0xfff3c4 })); elevLight.position.set(0, 3.49, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.05, 0.13), elevDark); panel.position.set(1.84, 1.45, 1.74);
    const groundButton = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), new THREE.MeshBasicMaterial({ color: 0x66ff99 })); groundButton.position.set(1.82, 1.64, 1.82);
    const roofButton = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffd54f })); roofButton.position.set(1.82, 1.34, 1.82);
    const elevatorDoorMat = createMaterial(0xb0bec5, 0.22, 0.78);
    const doorLeft = new THREE.Mesh(new THREE.BoxGeometry(1.95, 3.2, 0.14), elevatorDoorMat); doorLeft.position.set(-0.99, 1.72, 2.04);
    const doorRight = doorLeft.clone(); doorRight.position.x = 0.99;
    cabin.add(elevFloor, elevLeft, elevRight, elevBack, elevCeiling, elevLight, panel, groundButton, roofButton, doorLeft, doorRight);
    group.add(cabin);

    // Ground and roof portal frames give the two stops a finished, intentional look.
    const makeLandingFrame = (y: number) => {
      const landing = new THREE.Group(); landing.position.set(elevatorX, y, elevatorZ + 2.10);
      const pL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.75, 0.30), elevDark); pL.position.set(-2.18, 1.88, 0);
      const pR = pL.clone(); pR.position.x = 2.18;
      const header = new THREE.Mesh(new THREE.BoxGeometry(4.58, 0.24, 0.30), elevDark); header.position.set(0, 3.66, 0);
      const callPanel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.68, 0.13), elevDark); callPanel.position.set(2.42, 1.42, 0.10);
      const callLight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd54f })); callLight.position.set(2.42, 1.53, 0.18);
      landing.add(pL, pR, header, callPanel, callLight);
      group.add(landing);
    };
    makeLandingFrame(0);
    makeLandingFrame(roofTopY);

    // Rooftop lift surround hides the shaft transition and gives the cabin a real
    // architectural terminus without blocking the south-facing exit.
    const roofLiftBack = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.9, 0.25), elevDark); roofLiftBack.position.set(elevatorX, roofTopY + 1.95, elevatorZ - 2.25);
    const roofLiftLeft = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.9, 4.5), elevDark); roofLiftLeft.position.set(elevatorX - 2.28, roofTopY + 1.95, elevatorZ);
    const roofLiftRight = roofLiftLeft.clone(); roofLiftRight.position.x = elevatorX + 2.28;
    const roofLiftCap = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.25, 4.5), elevDark); roofLiftCap.position.set(elevatorX, roofTopY + 3.88, elevatorZ);
    markSolid(roofLiftBack, roofLiftLeft, roofLiftRight, roofLiftCap);
    group.add(roofLiftBack, roofLiftLeft, roofLiftRight, roofLiftCap);

    let elevatorY = 0;
    let elevatorTargetY = 0;
    let elevatorTargetLevel: 'ground' | 'roof' = 'ground';
    let elevatorMoving = false;
    let elevatorDoorProgress = 1;
    const updateElevator = (dt: number) => {
      const atTarget = Math.abs(elevatorY - elevatorTargetY) < 0.03;
      const shouldOpen = atTarget && !elevatorMoving;
      elevatorDoorProgress = THREE.MathUtils.damp(elevatorDoorProgress, shouldOpen ? 1 : 0, 9.0, dt);
      doorLeft.position.x = -0.99 - elevatorDoorProgress * 1.35;
      doorRight.position.x = 0.99 + elevatorDoorProgress * 1.35;
      if (elevatorMoving && elevatorDoorProgress < 0.055) {
        const delta = elevatorTargetY - elevatorY;
        const direction = Math.sign(delta);
        elevatorY += direction * Math.min(Math.abs(delta), 18.0 * dt);
        if (Math.abs(elevatorTargetY - elevatorY) < 0.03) {
          elevatorY = elevatorTargetY;
          elevatorMoving = false;
        }
      }
      cabin.position.y = elevatorY;
    };
    const requestLevel = (level: 'ground' | 'roof') => {
      elevatorTargetLevel = level;
      elevatorTargetY = level === 'roof' ? roofTopY : 0;
      if (Math.abs(elevatorTargetY - elevatorY) > 0.05) elevatorMoving = true;
    };
    const getState = () => {
      const level = Math.abs(elevatorY) < 0.08 ? 'ground' as const : Math.abs(elevatorY - roofTopY) < 0.08 ? 'roof' as const : 'between' as const;
      return {
        y: elevatorY,
        level,
        moving: elevatorMoving,
        doorsOpen: elevatorDoorProgress > 0.82 && !elevatorMoving,
        target: elevatorTargetLevel,
      };
    };
    towerElevatorUpdaters.push(updateElevator);
    towerElevators[key] = {
      cabin,
      groundPos: new THREE.Vector3(x + elevatorX, 0.14, z + elevatorZ + 3.8),
      roofPos: new THREE.Vector3(x + elevatorX, roofTopY, z + elevatorZ + 3.8),
      requestLevel,
      getState,
    };

    if (antenna) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 23, 8), towerRibMat);
      mast.position.y = height + 14.5;
      const antennaTop = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.18, 15, 7), towerRibMat);
      antennaTop.position.y = height + 33.0;
      const antennaRing = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 5.5, 10, 1, true), towerDarkMat);
      antennaRing.position.y = height + 20.0;
      group.add(mast, antennaTop, antennaRing);
    }

    enableInteriorFaces(group);
    twinTowers.add(group);
    return group;
  };

  // West tower is deliberately close to the requested X≈224/Z≈60 point.
  makeTower('west', 'liberty_tower_west', 230, 60, 146, false);
  makeTower('east', 'liberty_tower_east', 258, 60, 152, true);

  // Designed public-space details: planters/trees at the outer plaza corners and
  // low bollard lights. They remain outside both tower footprints and the approach.
  const plazaPlanterMat = createMaterial(0x59665a, 0.82, 0.02);
  const plazaSoilMat = createMaterial(0x4b3528, 0.96, 0.0);
  for (const [px, pz] of [[220,40],[270,40],[220,80],[270,80]] as Array<[number,number]>) {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.75, 4.0), plazaPlanterMat);
    planter.position.set(px, 0.38, pz); markSolid(planter);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.18, 3.5), plazaSoilMat);
    soil.position.set(px, 0.82, pz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.38,3.4,7), createMaterial(0x6d4c41));
    trunk.position.set(px,2.5,pz); markSolid(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.1,9,7), createMaterial(0x3f7d3d,0.88,0.01));
    crown.position.set(px,5.0,pz);
    twinTowers.add(planter, soil, trunk, crown);
  }
  for (const [lx,lz] of [[217,47],[217,73],[273,47],[273,73]] as Array<[number,number]>) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,2.8,7), towerDarkMat);
    post.position.set(lx,1.4,lz);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22,7,6), new THREE.MeshBasicMaterial({color:0xffe0a6}));
    lamp.position.set(lx,2.9,lz);
    twinTowers.add(post,lamp);
  }
  // Only two local lights: enough atmosphere without turning the plaza into a
  // permanent forward-rendering cost across the whole map.
  for (const lx of [226, 264]) {
    const plazaLight = new THREE.PointLight(0xffd59b, 0.75, 30, 2.0);
    plazaLight.position.set(lx, 7.0, 60);
    twinTowers.add(plazaLight);
  }

  root.add(twinTowers);
  landmarks.push({
    id: 'goldenrod_twin_towers',
    name: 'Twin Towers – Liberty Plaza',
    category: 'goldenrod',
    x: 244,
    z: 60,
    icon: 'building',
    color: '#cfd8dc',
    travelX: 214,
    travelZ: 60,
    travelYaw: Math.PI / 2,
  });

  // -------------------------------------------------------------------------
  // 11. IMPORTANT LANDMARK 8: GOLDENROD UNDERGROUND ENTRANCES
  // -------------------------------------------------------------------------
  const addUndergroundEntrance = (x: number, z: number, rotationY = 0) => {
    const ugGroup = new THREE.Group();
    ugGroup.position.set(x, 0, z);
    ugGroup.rotation.y = rotationY;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 7.2), curbMat);
    frame.position.y = 0.2;
    const pit = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 6.6), createMaterial(0x1a1a1a));
    pit.position.y = 0.05;
    ugGroup.add(frame, pit);

    for (let step = 0; step < 5; step++) {
      const stair = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 0.7), sidewalkMat);
      stair.name = `goldenrod_underground_stair_${x}_${z}_${step}`;
      stair.userData.sidewalkSurface = true; stair.userData.roadCriticalDetail = true;
      stair.position.set(0, 0.2 - step * 0.2, -2.5 + step * 0.8);
      markWalkableStairSurface(stair, 54, 0.72);
      ugGroup.add(stair);
    }

    const railMat = steelMat;
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 7.0), railMat);
    railL.position.set(-2.0, 0.8, 0);
    const railR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 7.0), railMat);
    railR.position.set(2.0, 0.8, 0);
    const railBack = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.2, 0.1), railMat);
    railBack.position.set(0, 0.8, -3.5);
    markStairRailing(railL, railR, railBack);
    ugGroup.add(railL, railR, railBack);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.8, 0.2), pokeIndigoMat);
    sign.position.set(0, 2.2, 3.4);
    ugGroup.add(sign);
    root.add(ugGroup);
  };

  addUndergroundEntrance(190, 50, 0);
  addUndergroundEntrance(210, -50, Math.PI);

  // -------------------------------------------------------------------------
  // 11. PROFESSOR OAK'S RESEARCH LAB (GOLDENROD SOUTH GATEWAY, X = 200, Z = -200)
  // -------------------------------------------------------------------------
  const labGroup = new THREE.Group();
  labGroup.name = 'professor_oak_laboratory';
  const labCenter = new THREE.Vector3(200, 0, -200);
  labGroup.position.copy(labCenter);
  const labWidth = 24;
  const labDepth = 30;
  const labHeight = 7.5;

  const labFloor = new THREE.Mesh(new THREE.BoxGeometry(labWidth - 0.8, 0.25, labDepth - 0.8), createMaterial(0xeeeeee, 0.3, 0.2));
  labFloor.position.set(0, 0.12, 0);
  labFloor.userData.walkable = true;
  labFloor.userData.walkablePriority = 10;
  labGroup.add(labFloor);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(labWidth, labHeight, 0.8), pokeCreamMat);
  backWall.position.set(0, labHeight / 2, -labDepth / 2);
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, labHeight, labDepth), pokeCreamMat);
  leftWall.position.set(-labWidth / 2, labHeight / 2, 0);
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, labHeight, labDepth), pokeCreamMat);
  rightWall.position.set(labWidth / 2, labHeight / 2, 0);

  const frontWallL = new THREE.Mesh(new THREE.BoxGeometry((labWidth - 6) / 2, labHeight, 0.8), pokeCreamMat);
  frontWallL.position.set(-(labWidth / 2 + 3) / 2, labHeight / 2, labDepth / 2);
  const frontWallR = new THREE.Mesh(new THREE.BoxGeometry((labWidth - 6) / 2, labHeight, 0.8), pokeCreamMat);
  frontWallR.position.set((labWidth / 2 + 3) / 2, labHeight / 2, labDepth / 2);
  const frontHeader = new THREE.Mesh(new THREE.BoxGeometry(6, labHeight - 4.5, 0.8), pokeCreamMat);
  frontHeader.position.set(0, 4.5 + (labHeight - 4.5) / 2, labDepth / 2);
  labGroup.add(backWall, leftWall, rightWall, frontWallL, frontWallR, frontHeader);
  markSolid(backWall, leftWall, rightWall, frontWallL, frontWallR, frontHeader);

  const labRoof = new THREE.Mesh(new THREE.ConeGeometry(20, 4.5, 4), pokeRedMat);
  labRoof.userData.landableRoof = true;
  labRoof.rotation.y = Math.PI / 4;
  labRoof.position.set(0, labHeight + 2, 0);
  labRoof.scale.set(1.1, 1, 1.3);
  labGroup.add(labRoof);

  const oakLabDoor = new Door({
    id: 'oak_lab_door',
    name: "Prof. Oak's Lab Glass Doors",
    houseName: "Prof. Oak's Research Lab",
    type: 'double_slide',
    width: 6.0,
    height: 4.5,
    worldPos: new THREE.Vector3(200, 0, -185),
    frameColor: 0x1565c0,
    glassColor: 0xb3e5fc,
  });
  root.add(oakLabDoor.group);
  doors.push(oakLabDoor);

  wallColliders.push(
    { id: 'oak_lab_back', minX: 187.5, maxX: 212.5, minZ: -215.5, maxZ: -214.5 },
    { id: 'oak_lab_left', minX: 187.5, maxX: 188.5, minZ: -215, maxZ: -185 },
    { id: 'oak_lab_right', minX: 211.5, maxX: 212.5, minZ: -215, maxZ: -185 },
    { id: 'oak_lab_front_l', minX: 187.5, maxX: 196.8, minZ: -185.5, maxZ: -184.5 },
    { id: 'oak_lab_front_r', minX: 203.2, maxX: 212.5, minZ: -185.5, maxZ: -184.5 }
  );

  const oakSign = new THREE.Mesh(new THREE.BoxGeometry(12, 1.4, 0.2), pokeBlueMat);
  oakSign.position.set(0, 5.2, labDepth / 2 + 0.5);
  labGroup.add(oakSign);

  const oakDesk = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.2, 1.8), woodMat);
  oakDesk.position.set(0, 0.6, -9);
  const computer = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.6), createMaterial(0x212121));
  computer.position.set(-1.8, 1.6, -9);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), pokeCyanMat);
  screen.position.set(-1.8, 1.6, -8.69);
  screen.rotation.y = Math.PI;
  labGroup.add(oakDesk, computer, screen);
  markSolid(oakDesk);

  const shelf1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.5, 6.0), woodMat);
  shelf1.position.set(-10.5, 2.25, -4);
  const shelf2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.5, 6.0), woodMat);
  shelf2.position.set(10.5, 2.25, -4);
  labGroup.add(shelf1, shelf2);
  markSolid(shelf1, shelf2);

  // Keep the starter-selection floor visually distinct without turning it into a menu.
  // The broad open mat also makes the intended circulation space obvious to the player.
  const starterArea = new THREE.Mesh(
    new THREE.PlaneGeometry(16.5, 8.6),
    new THREE.MeshStandardMaterial({ color: 0xddeeff, roughness: 0.72, metalness: 0.02, transparent: true, opacity: 0.72 })
  );
  starterArea.rotation.x = -Math.PI / 2;
  starterArea.position.set(0, 0.255, -4.3);
  starterArea.name = 'oak_lab_starter_selection_floor';
  labGroup.add(starterArea);

  const oakMesh = createProfessorOakModel();
  oakMesh.position.set(0, 0.12, -10.8);
  oakMesh.rotation.y = 0;
  labGroup.add(oakMesh);

  const starterList: { id: PokemonCharacterId; name: string; pos: THREE.Vector3; mesh: THREE.Group; highlight: THREE.Mesh }[] = [];
  const starterConfigs = [
    { id: 'pikachu' as PokemonCharacterId, name: 'Pikachu', x: -5.2, color: 0xffd600 },
    { id: 'charmander' as PokemonCharacterId, name: 'Charmander', x: 0.0, color: 0xff5722 },
    { id: 'poliway' as PokemonCharacterId, name: 'Poliwag', x: 5.2, color: 0x1976d2 },
  ];

  starterConfigs.forEach((sc) => {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.22, 0.82, 20), pokeWhiteMat);
    ped.position.set(sc.x, 0.41, -4.2);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.10, 1.10, 0.12, 20), pokeBlueMat);
    ring.position.set(sc.x, 0.84, -4.2);
    labGroup.add(ped, ring);
    markSolid(ped);

    const pedestalGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 6, 5),
      new THREE.MeshBasicMaterial({ color: sc.color })
    );
    pedestalGlow.position.set(sc.x, 0.94, -4.2);
    labGroup.add(pedestalGlow);

    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 384;
    nameCanvas.height = 96;
    const nameCtx = nameCanvas.getContext('2d');
    if (nameCtx) {
      nameCtx.fillStyle = '#10233f';
      nameCtx.fillRect(0, 0, nameCanvas.width, nameCanvas.height);
      nameCtx.strokeStyle = '#8fd8ff';
      nameCtx.lineWidth = 6;
      nameCtx.strokeRect(3, 3, nameCanvas.width - 6, nameCanvas.height - 6);
      nameCtx.fillStyle = '#ffffff';
      nameCtx.font = '700 42px Arial, sans-serif';
      nameCtx.textAlign = 'center';
      nameCtx.textBaseline = 'middle';
      nameCtx.fillText(sc.name.toUpperCase(), nameCanvas.width / 2, nameCanvas.height / 2 + 2);
    }
    const nameTexture = new THREE.CanvasTexture(nameCanvas);
    nameTexture.colorSpace = THREE.SRGBColorSpace;
    const namePlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.72, 0.43),
      new THREE.MeshBasicMaterial({ map: nameTexture, transparent: false })
    );
    namePlate.position.set(sc.x, 0.50, -2.94);
    namePlate.name = `oak_starter_name_${sc.id}`;
    labGroup.add(namePlate);

    // Subtle walk-up targeting ring. App.tsx toggles/animates this only for the
    // nearest starter so the Pokémon themselves remain the selection interface.
    const selectionHighlight = new THREE.Mesh(
      new THREE.RingGeometry(1.28, 1.48, 32),
      new THREE.MeshBasicMaterial({
        color: sc.color,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    selectionHighlight.rotation.x = -Math.PI / 2;
    selectionHighlight.position.set(sc.x, 0.285, -4.2);
    selectionHighlight.visible = false;
    selectionHighlight.name = `oak_starter_highlight_${sc.id}`;
    labGroup.add(selectionHighlight);

    let pokeModel: THREE.Group;
    if (sc.id === 'pikachu') pokeModel = createPikachuModel();
    else if (sc.id === 'charmander') pokeModel = createCharmanderModel();
    else pokeModel = createPoliwayModel();

    pokeModel.position.set(sc.x, 0.90, -4.2);
    // Face each starter toward Ash's authoritative new-game position rather than
    // leaving the side Pokémon parallel to the centre pedestal. This keeps all
    // three visibly engaged with the player in the opening composition.
    const ashLocalX = OAK_LAB_NEW_GAME_START.x - labCenter.x;
    const ashLocalZ = OAK_LAB_NEW_GAME_START.z - labCenter.z;
    pokeModel.rotation.y = Math.atan2(ashLocalX - sc.x, ashLocalZ - (-4.2));
    pokeModel.scale.set(0.88, 0.88, 0.88);
    labGroup.add(pokeModel);

    const worldPokePos = new THREE.Vector3(labCenter.x + sc.x, 0.90, labCenter.z - 4.2);
    starterList.push({
      id: sc.id,
      name: sc.name,
      pos: worldPokePos,
      mesh: pokeModel,
      highlight: selectionHighlight,
    });
  });

  // Retro Coin-Op Arcade Machine inside Professor Oak's Research Lab
  const oakArcadeCab = new THREE.Group();
  oakArcadeCab.position.set(7.8, 0, 4.8);
  const oakCabBody = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.2, 0.95), createMaterial(0x1a237e));
  oakCabBody.position.y = 1.1;
  const oakCabScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.62), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
  oakCabScreen.position.set(0, 1.45, 0.486);
  const oakMarquee = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.35, 0.28), new THREE.MeshBasicMaterial({ color: 0xffd600 }));
  oakMarquee.position.set(0, 2.25, 0.38);
  oakArcadeCab.add(oakCabBody, oakCabScreen, oakMarquee);
  markSolid(oakCabBody);
  labGroup.add(oakArcadeCab);
  arcadeMachines.push({
    id: 'oak_lab_arcade',
    name: "Professor Oak's Arcade",
    position: new THREE.Vector3(labCenter.x + 7.8, 0.12, labCenter.z + 4.8),
  });

  root.add(labGroup);
  landmarks.push({
    id: 'oak_lab',
    name: "Prof. Oak's Research Lab",
    category: 'oak_lab',
    x: 200,
    z: -200,
    icon: 'flask',
    color: '#e53935',
  });

  // -------------------------------------------------------------------------
  // 12. PLAYER'S 6-CAR HERO GARAGE (GOLDENROD CITY, X = 150, Z = -110)
  // -------------------------------------------------------------------------
  const garageGroup = new THREE.Group();
  garageGroup.name = 'player_hero_garage';
  const garagePos = new THREE.Vector3(150, 0, -110);
  garageGroup.position.copy(garagePos);

  const gFloor = new THREE.Mesh(new THREE.BoxGeometry(42, 0.2, 22), createMaterial(0x263238, 0.3, 0.3));
  gFloor.position.set(0, 0.1, 0);
  gFloor.userData.walkable = true;
  gFloor.userData.walkablePriority = 10;
  garageGroup.add(gFloor);

  const gBack = new THREE.Mesh(new THREE.BoxGeometry(42, 6, 0.6), createMaterial(0x37474f));
  gBack.position.set(0, 3, -11);
  const gLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 22), createMaterial(0x37474f));
  gLeft.position.set(-21, 3, 0);
  const gRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 22), createMaterial(0x37474f));
  gRight.position.set(21, 3, 0);
  const gRoof = new THREE.Mesh(new THREE.BoxGeometry(43, 0.5, 23), createMaterial(0x212121));
  gRoof.userData.landableRoof = true;
  gRoof.position.set(0, 6.25, 0);
  garageGroup.add(gBack, gLeft, gRight, gRoof);
  markSolid(gBack, gLeft, gRight);

  const neonSign = new THREE.Mesh(new THREE.BoxGeometry(22, 1.4, 0.3), pokeCyanMat);
  neonSign.position.set(0, 5.2, 11.2);
  garageGroup.add(neonSign);

  const gDrive = new THREE.Mesh(new THREE.PlaneGeometry(42, 16), roadMat);
  gDrive.rotateX(-Math.PI / 2);
  gDrive.position.set(0, 0.09, 19);
  garageGroup.add(gDrive);

  wallColliders.push(
    { id: 'garage_back', minX: 128.5, maxX: 171.5, minZ: -121.5, maxZ: -120.5 },
    { id: 'garage_left', minX: 128.5, maxX: 129.5, minZ: -121, maxZ: -99 },
    { id: 'garage_right', minX: 170.5, maxX: 171.5, minZ: -121, maxZ: -99 }
  );

  const carBays: { type: VehicleModelType; name: string; pos: THREE.Vector3; rotationY: number }[] = [];
  const heroCarConfigs: { type: VehicleModelType; name: string; xOffset: number }[] = [
    { type: 'bmw_f80_m3', name: 'BMW F80 M3 (RWD)', xOffset: -15.5 },
    { type: 'bmw_g80_m3', name: 'BMW G80 M3 xDrive', xOffset: -9.8 },
    { type: 'bmw_f90_m5', name: 'BMW F90 LCI M5', xOffset: -4.1 },
    { type: 'lamborghini_aventador', name: 'Lamborghini Aventador V12', xOffset: 6.0 },
    { type: 'ferrari_f12', name: 'Ferrari F12 Berlinetta', xOffset: 11.3 },
    { type: 'delorean_time_machine', name: 'DeLorean DMC-12 Time Machine (1.21 GW)', xOffset: 16.6 },
  ];

  heroCarConfigs.forEach((hc) => {
    // Narrowed parking spot width (3.9m total) ensures each car has clean margins
    // and ample clearance around the central support pillar and outer walls
    const lineL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.22, 10), roadYellowLineMat);
    lineL.position.set(hc.xOffset - 1.95, 0.12, 0);
    const lineR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.22, 10), roadYellowLineMat);
    lineR.position.set(hc.xOffset + 1.95, 0.12, 0);
    garageGroup.add(lineL, lineR);

    const spot = new THREE.SpotLight(0xffffff, 1.8, 18, Math.PI / 4, 0.4);
    spot.position.set(hc.xOffset, 5.8, 0);
    spot.target.position.set(hc.xOffset, 0, 0);
    garageGroup.add(spot);
    garageGroup.add(spot.target);

    const bayWorldPos = new THREE.Vector3(garagePos.x + hc.xOffset, 0, garagePos.z + 1.0);
    carBays.push({
      type: hc.type,
      name: hc.name,
      pos: bayWorldPos,
      rotationY: 0,
    });
  });

  // Interactive hero-garage service terminal. This gives the six special cars a
  // useful home-base function instead of the garage being only decorative.
  const serviceConsole = new THREE.Group();
  serviceConsole.name = 'hero_garage_service_console';
  serviceConsole.position.set(0, 0, -8.2);

  const consoleBase = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.6, 1.0),
    createMaterial(0x17212b, 0.55, 0.15)
  );
  consoleBase.position.y = 0.8;
  const consoleScreen = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.72, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x19e6ff })
  );
  consoleScreen.position.set(0, 1.1, 0.56);
  serviceConsole.add(consoleBase, consoleScreen);
  garageGroup.add(serviceConsole);

  const garageServicePos = new THREE.Vector3(
    garagePos.x + serviceConsole.position.x,
    0.12,
    garagePos.z + serviceConsole.position.z + 1.2
  );

  // Dedicated CAR RESET MACHINE beside the service terminal. It is deliberately
  // separate from the repair machine so resetting positions never implies repairing,
  // replacing or changing ownership/custom vehicle settings.
  const resetConsole = new THREE.Group();
  resetConsole.name = 'hero_garage_car_reset_machine';
  resetConsole.position.set(-3.8, 0, -8.2);

  const resetBase = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.7, 1.05),
    createMaterial(0x25182f, 0.52, 0.18)
  );
  resetBase.position.y = 0.85;
  const resetScreenMat = new THREE.MeshStandardMaterial({
    color: 0xff8c32,
    emissive: 0xff5a18,
    emissiveIntensity: 1.5,
    roughness: 0.28,
    metalness: 0.12,
  });
  const resetScreen = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.74, 0.12), resetScreenMat);
  resetScreen.position.set(0, 1.13, 0.59);
  resetScreen.name = 'car_reset_machine_screen';

  const resetLabelCanvas = document.createElement('canvas');
  resetLabelCanvas.width = 512;
  resetLabelCanvas.height = 220;
  const resetLabelCtx = resetLabelCanvas.getContext('2d');
  if (resetLabelCtx) {
    resetLabelCtx.fillStyle = '#2a102e';
    resetLabelCtx.fillRect(0, 0, 512, 220);
    resetLabelCtx.strokeStyle = '#ffb347';
    resetLabelCtx.lineWidth = 14;
    resetLabelCtx.strokeRect(8, 8, 496, 204);
    resetLabelCtx.textAlign = 'center';
    resetLabelCtx.textBaseline = 'middle';
    resetLabelCtx.fillStyle = '#fff3c7';
    resetLabelCtx.font = 'bold 68px sans-serif';
    resetLabelCtx.fillText('CAR RESET', 256, 92);
    resetLabelCtx.fillStyle = '#ffb347';
    resetLabelCtx.font = 'bold 32px sans-serif';
    resetLabelCtx.fillText('ALL 6 GARAGE CARS', 256, 157);
  }
  const resetLabelTexture = new THREE.CanvasTexture(resetLabelCanvas);
  resetLabelTexture.colorSpace = THREE.SRGBColorSpace;
  resetLabelTexture.needsUpdate = true;
  const resetLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.66, 0.62),
    new THREE.MeshBasicMaterial({ map: resetLabelTexture, transparent: false })
  );
  resetLabel.position.set(0, 1.13, 0.656);
  resetLabel.name = 'car_reset_machine_label';

  const resetButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0xe83d35, emissive: 0x5c0804, emissiveIntensity: 0.6, roughness: 0.35 })
  );
  resetButton.rotation.x = Math.PI / 2;
  resetButton.position.set(0.68, 0.62, 0.59);

  // Simple readable machine identity without depending on an external font/texture.
  const resetHeader = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.22, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffd067 })
  );
  resetHeader.position.set(0, 1.58, 0.58);
  resetHeader.name = 'car_reset_machine_header';

  resetConsole.add(resetBase, resetScreen, resetLabel, resetButton, resetHeader);
  garageGroup.add(resetConsole);

  const garageResetPos = new THREE.Vector3(
    garagePos.x + resetConsole.position.x,
    0.12,
    garagePos.z + resetConsole.position.z + 1.2
  );

  root.add(garageGroup);
  landmarks.push({
    id: 'player_garage',
    name: 'Player House & Hero Garage (6 Cars)',
    category: 'player_garage',
    x: 150,
    z: -110,
    icon: 'car',
    color: '#00bcd4',
  });

  // -------------------------------------------------------------------------
  // 13. CENTRAL CIVIC PLAZA & GRAND MARBLE FOUNTAIN (X = 245, Z = 0)
  // -------------------------------------------------------------------------
  const plazaGroup = new THREE.Group();
  plazaGroup.name = 'goldenrod_civic_plaza_fountain';
  plazaGroup.position.set(170, 0, -25);

  // Large octagonal paved pedestrian plaza
  const plazaPaving = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.25, 8), sidewalkMat);
  plazaPaving.userData.sidewalkSurface = true; plazaPaving.userData.roadCriticalDetail = true;
  plazaPaving.position.y = 0.12;
  plazaGroup.add(plazaPaving);

  // Rosette stone ring
  const rosetteRing = new THREE.Mesh(new THREE.TorusGeometry(12, 0.35, 6, 16), curbMat);
  rosetteRing.rotation.x = Math.PI / 2;
  rosetteRing.position.y = 0.26;
  plazaGroup.add(rosetteRing);

  // Polished functioning fountain -------------------------------------------------
  // The previous version used solid blue cylinders and one cone, which read more
  // like plastic scenery than flowing water. The stone and water are now authored
  // separately: water never creates gameplay collision, while the visible marble
  // rim is approximated with small tangent colliders that closely follow the circle.
  const fountainWaterCanvas = document.createElement('canvas');
  fountainWaterCanvas.width = 256;
  fountainWaterCanvas.height = 256;
  const fountainWaterCtx = fountainWaterCanvas.getContext('2d');
  if (fountainWaterCtx) {
    const gradient = fountainWaterCtx.createRadialGradient(128, 128, 18, 128, 128, 176);
    gradient.addColorStop(0, '#d8fbff');
    gradient.addColorStop(0.28, '#81dff3');
    gradient.addColorStop(0.72, '#249dcc');
    gradient.addColorStop(1, '#147aa8');
    fountainWaterCtx.fillStyle = gradient;
    fountainWaterCtx.fillRect(0, 0, 256, 256);
    fountainWaterCtx.lineCap = 'round';
    for (let ring = 0; ring < 12; ring++) {
      const radius = 16 + ring * 10.5;
      fountainWaterCtx.strokeStyle = `rgba(225,252,255,${0.20 - ring * 0.008})`;
      fountainWaterCtx.lineWidth = ring % 3 === 0 ? 2.2 : 1.15;
      fountainWaterCtx.beginPath();
      fountainWaterCtx.arc(128 + Math.sin(ring * 1.7) * 13, 128 + Math.cos(ring * 1.23) * 11, radius, 0, Math.PI * 2);
      fountainWaterCtx.stroke();
    }
    for (let i = 0; i < 22; i++) {
      const y = 8 + i * 11;
      fountainWaterCtx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(10,100,145,0.12)';
      fountainWaterCtx.lineWidth = 1.2;
      fountainWaterCtx.beginPath();
      for (let x = -8; x <= 264; x += 8) {
        const yy = y + Math.sin((x + i * 17) * 0.055) * 3.2;
        if (x === -8) fountainWaterCtx.moveTo(x, yy); else fountainWaterCtx.lineTo(x, yy);
      }
      fountainWaterCtx.stroke();
    }
  }
  const fountainWaterTexture = new THREE.CanvasTexture(fountainWaterCanvas);
  fountainWaterTexture.wrapS = THREE.RepeatWrapping;
  fountainWaterTexture.wrapT = THREE.RepeatWrapping;
  fountainWaterTexture.repeat.set(1.35, 1.35);
  fountainWaterTexture.colorSpace = THREE.SRGBColorSpace;

  const makeFountainWaterMaterial = (opacity = 0.72) => new THREE.MeshPhysicalMaterial({
    color: 0x77dcf4,
    map: fountainWaterTexture,
    roughness: 0.09,
    metalness: 0.0,
    transparent: true,
    opacity,
    transmission: 0.08,
    clearcoat: 0.88,
    clearcoatRoughness: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fountainWaterMat = makeFountainWaterMaterial(0.72);

  // Low marble plinth and a shallow real basin. The plinth is walkable, while
  // the circular rim is the only outer wall collision; the water itself is not.
  const fountainPlinth = new THREE.Mesh(new THREE.CylinderGeometry(6.1, 6.35, 0.34, 32), pokeWhiteMat);
  fountainPlinth.name = 'pokemon_center_fountain_plinth';
  fountainPlinth.position.y = 0.42;
  fountainPlinth.userData.walkable = true;
  fountainPlinth.userData.walkablePriority = 8;

  const basinFloor = new THREE.Mesh(new THREE.CylinderGeometry(5.28, 5.28, 0.16, 32), createMaterial(0xdde8eb, 0.42, 0.04));
  basinFloor.name = 'pokemon_center_fountain_basin_floor';
  basinFloor.position.y = 0.58;
  basinFloor.userData.walkable = true;
  basinFloor.userData.walkablePriority = 9;

  const lowerRim = new THREE.Mesh(new THREE.TorusGeometry(5.55, 0.31, 12, 48), pokeWhiteMat);
  lowerRim.name = 'pokemon_center_fountain_rim';
  lowerRim.rotation.x = Math.PI / 2;
  lowerRim.position.y = 0.88;

  // Twenty small tangent colliders follow the visible curved rim closely. This
  // prevents both the player and walking NPCs entering through the marble wall
  // without creating the giant square invisible blocker a torus AABB would cause.
  const rimColliders: THREE.Mesh[] = [];
  const rimColliderMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const rimColliderCount = 20;
  for (let i = 0; i < rimColliderCount; i++) {
    const angle = (i / rimColliderCount) * Math.PI * 2;
    const segment = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.76, 0.34), rimColliderMat);
    segment.name = `pokemon_center_fountain_rim_collider_${i}`;
    segment.position.set(Math.cos(angle) * 5.55, 0.82, Math.sin(angle) * 5.55);
    segment.rotation.y = Math.PI / 2 - angle;
    segment.userData.solidCollider = true;
    segment.userData.colliderPadding = 0.005;
    rimColliders.push(segment);
  }

  const lowerWater = new THREE.Mesh(new THREE.CircleGeometry(5.18, 48), fountainWaterMat);
  lowerWater.name = 'fountain_water_surface_lower';
  lowerWater.rotation.x = -Math.PI / 2;
  lowerWater.position.y = 0.78;
  lowerWater.renderOrder = 4;
  lowerWater.userData.fountainBaseY = lowerWater.position.y;

  // Raised centre bowl with a real column and lip.
  const centreColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.82, 1.52, 16), pokeWhiteMat);
  centreColumn.name = 'pokemon_center_fountain_centre_column';
  centreColumn.position.y = 1.48;

  const upperBowl = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 3.18, 0.42, 28), pokeWhiteMat);
  upperBowl.name = 'pokemon_center_fountain_upper_bowl';
  upperBowl.position.y = 2.02;

  const upperRim = new THREE.Mesh(new THREE.TorusGeometry(2.93, 0.20, 10, 40), pokeWhiteMat);
  upperRim.rotation.x = Math.PI / 2;
  upperRim.position.y = 2.27;

  const upperWater = new THREE.Mesh(new THREE.CircleGeometry(2.72, 40), makeFountainWaterMaterial(0.70));
  upperWater.name = 'fountain_water_surface_upper';
  upperWater.rotation.x = -Math.PI / 2;
  upperWater.position.y = 2.255;
  upperWater.renderOrder = 4;
  upperWater.userData.fountainBaseY = upperWater.position.y;

  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 1.35, 12), pokeWhiteMat);
  crown.name = 'pokemon_center_fountain_crown';
  crown.position.y = 2.85;

  markSolid(centreColumn, upperBowl, crown);

  // Water streams use real curved geometry for silhouette and a few animated
  // droplets layered over each stream so the water visibly travels rather than
  // looking like a frozen translucent pipe.
  const streamMat = new THREE.MeshPhysicalMaterial({
    color: 0xc5f7ff,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.58,
    transmission: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    depthWrite: false,
  });
  const dropletMat = new THREE.MeshBasicMaterial({ color: 0xe7fbff, transparent: true, opacity: 0.76, depthWrite: false });
  const rippleMatTemplate = new THREE.MeshBasicMaterial({ color: 0xe6fcff, transparent: true, opacity: 0.46, depthWrite: false, side: THREE.DoubleSide });

  const fountainJets = new THREE.Group();
  fountainJets.name = 'pokemon_center_fountain_animated_water';
  const jetCount = 8;
  for (let i = 0; i < jetCount; i++) {
    const angle = (i / jetCount) * Math.PI * 2;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const start = radial.clone().multiplyScalar(0.52).setY(3.18);
    const end = radial.clone().multiplyScalar(4.36).setY(0.84);
    const control = radial.clone().multiplyScalar(2.35).setY(4.32 + (i % 2) * 0.16);
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);

    const stream = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.055, 6, false), streamMat);
    stream.name = `fountain_stream_${i}`;
    stream.renderOrder = 5;
    stream.userData.fountainStreamPhase = i / jetCount;
    fountainJets.add(stream);

    for (let d = 0; d < 2; d++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), dropletMat);
      drop.name = `fountain_droplet_${i}_${d}`;
      drop.userData.fountainJetCurve = curve;
      drop.userData.fountainDropPhase = (i / jetCount + d * 0.47) % 1;
      drop.userData.fountainDropSpeed = 0.54 + (i % 3) * 0.025;
      drop.renderOrder = 6;
      fountainJets.add(drop);
    }

    const ripple = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.024, 5, 18), rippleMatTemplate.clone());
    ripple.name = `fountain_ripple_${i}`;
    ripple.rotation.x = Math.PI / 2;
    ripple.position.copy(end);
    ripple.position.y = 0.805;
    ripple.userData.fountainRipplePhase = i / jetCount;
    ripple.renderOrder = 6;
    fountainJets.add(ripple);

    // Tiny static splash crown at the point where each stream strikes the basin.
    for (let s = 0; s < 3; s++) {
      const splash = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), dropletMat);
      const spread = (s - 1) * 0.13;
      const tangent = new THREE.Vector3(-radial.z, 0, radial.x);
      splash.position.copy(end).addScaledVector(tangent, spread);
      splash.position.y = 0.88 + (s === 1 ? 0.10 : 0.03);
      splash.scale.set(0.8, 1.5, 0.8);
      fountainJets.add(splash);
    }
  }

  // Central vertical jet with a soft halo at its crest.
  const centralJet = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.115, 2.25, 8), streamMat);
  centralJet.name = 'fountain_central_jet';
  centralJet.position.y = 4.20;
  centralJet.renderOrder = 5;
  centralJet.userData.fountainBaseScaleY = 1;
  fountainJets.add(centralJet);
  const crest = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), dropletMat);
  crest.name = 'fountain_jet_crest';
  crest.position.y = 5.30;
  crest.scale.set(1.2, 0.55, 1.2);
  fountainJets.add(crest);

  plazaGroup.add(
    fountainPlinth,
    basinFloor,
    lowerRim,
    ...rimColliders,
    lowerWater,
    centreColumn,
    upperBowl,
    upperRim,
    upperWater,
    crown,
    fountainJets,
  );
  // 4 Plaza Park Benches surrounding the fountain
  const createPlazaBench = (angle: number) => {
    const bench = new THREE.Group();
    const bx = Math.cos(angle) * 9.5;
    const bz = Math.sin(angle) * 9.5;
    bench.position.set(bx, 0.15, bz);
    bench.rotation.y = -angle + Math.PI / 2;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.8), woodMat);
    seat.position.y = 0.4;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.12), woodMat);
    back.position.set(0, 0.85, -0.34);
    bench.add(seat, back);
    markSolid(seat, back);
    markSittable(seat, 'Civic plaza bench');
    return bench;
  };
  for (let i = 0; i < 4; i++) {
    plazaGroup.add(createPlazaBench((i * Math.PI) / 2 + Math.PI / 4));
  }

  root.add(plazaGroup);
  landmarks.push({
    id: 'goldenrod_civic_plaza',
    name: 'Goldenrod Central Civic Plaza & Fountain',
    category: 'goldenrod',
    x: 170,
    z: -25,
    icon: 'star',
    color: '#00bcd4',
  });

  // -------------------------------------------------------------------------
  // 14. IMPORTANT LANDMARK 9: GOLDENROD GAME CORNER (X = 150, Z = -60)
  // -------------------------------------------------------------------------
  const gameCornerGroup = new THREE.Group();
  gameCornerGroup.position.set(150, 0, -60);
  gameCornerGroup.name = 'goldenrod_game_corner';

  const gcWidth = 20;
  const gcDepth = 16;
  const gcHeight = 10.0;
  addEnterableShell(gameCornerGroup, gcWidth, gcDepth, gcHeight, createMaterial(0x6a1b9a), createMaterial(0x241b35), 5.0, 4.0);
  // Rows of glowing arcade/slot cabinets make the Game Corner an actual interior.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const cab = new THREE.Group();
      cab.position.set(-6 + col * 4, 0, -4.7 + row * 4.2);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.15, 0.95), createMaterial(0x263238));
      body.position.y = 1.08;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.62), new THREE.MeshBasicMaterial({ color: (row + col) % 2 ? 0x00e5ff : 0xff4dd2 }));
      screen.position.set(0, 1.42, 0.486);
      cab.add(body, screen); markSolid(body); gameCornerGroup.add(cab);

      const gcCabWorldPos = new THREE.Vector3(150 - 6 + col * 4, 0.12, -60 - 4.7 + row * 4.2);
      arcadeMachines.push({
        id: `gc_arcade_${row}_${col}`,
        name: `Game Corner Arcade Cabinet #${row * 4 + col + 1}`,
        position: gcCabWorldPos,
      });
    }
  }

  // Casino/prize-counter details: the Game Corner should feel like a real venue,
  // not just an empty purple shell with arcade boxes.
  const gcPrizeCounter = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.05, 1.2), createMaterial(0xffc107));
  gcPrizeCounter.position.set(0,0.53,-6.2); markSolid(gcPrizeCounter); gameCornerGroup.add(gcPrizeCounter);
  const gcPrizeWall = new THREE.Mesh(new THREE.BoxGeometry(8.2,2.5,0.25),createMaterial(0x4a148c));
  gcPrizeWall.position.set(0,2.0,-7.45); gameCornerGroup.add(gcPrizeWall);
  for (const x of [-5.2,0,5.2]) {
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.55,1.55,0.75,12),createMaterial(0x1b5e20));
    table.position.set(x,0.55,4.2); markSolid(table); gameCornerGroup.add(table);
    for (let i=0;i<4;i++) {
      const a=(i/4)*Math.PI*2;
      const stool=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.5,9),createMaterial(0xb71c1c));
      stool.position.set(x+Math.cos(a)*2.1,0.32,4.2+Math.sin(a)*2.1); markSolid(stool); gameCornerGroup.add(stool);
    }
  }
  const gcCeiling = new THREE.Mesh(new THREE.BoxGeometry(gcWidth-0.8,0.18,gcDepth-0.8),createMaterial(0x25142f));
  gcCeiling.position.y=6.1; gameCornerGroup.add(gcCeiling);
  for (const x of [-6,-2,2,6]) {
    const neon = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.06,0.25),new THREE.MeshBasicMaterial({color:x%4?0x00e5ff:0xff4dd2}));
    neon.position.set(x,5.95,0); gameCornerGroup.add(neon);
  }

  // Gold Mansard Roof with illuminated cornice
  const gcRoof = new THREE.Mesh(new THREE.BoxGeometry(gcWidth + 1.2, 2.2, gcDepth + 1.2), createMaterial(0xffd600));
  gcRoof.userData.landableRoof = true;
  gcRoof.position.y = gcHeight + 1.1;
  const gcRoofCrest = new THREE.Mesh(new THREE.BoxGeometry(gcWidth - 4, 1.2, gcDepth - 4), createMaterial(0x4a148c));
  gcRoofCrest.userData.landableRoof = true;
  gcRoofCrest.position.y = gcHeight + 2.4;
  gameCornerGroup.add(gcRoof, gcRoofCrest);

  // Flashing Neon Marquee Banner
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(16, 2.4, 0.12), createMaterial(0xffeb3b));
  marquee.position.set(0, 8.2, gcDepth / 2 + 0.42);
  const marqueeTrim = new THREE.Mesh(new THREE.BoxGeometry(16.4, 2.6, 0.12), createMaterial(0xd500f9));
  marqueeTrim.position.set(0, 8.2, gcDepth / 2 + 0.27);
  gameCornerGroup.add(marquee, marqueeTrim);

  // Double Glass Entrance Doors
  const gcCanopy = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.5, 3.0), createMaterial(0xab47bc));
  gcCanopy.userData.landableRoof = true;
  gcCanopy.position.set(0, 4.4, gcDepth / 2 + 1.5);
  gameCornerGroup.add(gcCanopy);

  // Arcade display windows
  const gcWinL = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.0, 0.2), glassMat);
  gcWinL.position.set(-6.0, 2.6, gcDepth / 2 + 0.38);
  const gcWinR = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.0, 0.2), glassMat);
  gcWinR.position.set(6.0, 2.6, gcDepth / 2 + 0.38);
  gameCornerGroup.add(gcWinL, gcWinR);

  const gcDoor = new Door({
    id: 'game_corner_door',
    name: 'Game Corner Double Glass Doors',
    houseName: 'Goldenrod Game Corner',
    type: 'double_slide',
    width: 4.8,
    height: 3.8,
    worldPos: new THREE.Vector3(150, 0, -52),
    frameColor: 0xffd600,
    glassColor: 0xba68c8,
  });
  root.add(gcDoor.group);
  doors.push(gcDoor);

  wallColliders.push(
    { id: 'gc_back', minX: 139.5, maxX: 160.5, minZ: -68.4, maxZ: -67.6 },
    { id: 'gc_left', minX: 139.6, maxX: 140.4, minZ: -68, maxZ: -52 },
    { id: 'gc_right', minX: 159.6, maxX: 160.4, minZ: -68, maxZ: -52 },
    { id: 'gc_front_l', minX: 139.6, maxX: 147.5, minZ: -52.4, maxZ: -51.6 },
    { id: 'gc_front_r', minX: 152.5, maxX: 160.4, minZ: -52.4, maxZ: -51.6 }
  );

  root.add(gameCornerGroup);
  landmarks.push({
    id: 'goldenrod_game_corner',
    name: 'Goldenrod Game Corner',
    category: 'goldenrod',
    x: 150,
    z: -60,
    icon: 'star',
    color: '#ab47bc',
  });

  // -------------------------------------------------------------------------
  // 15. IMPORTANT LANDMARK 10: BILL'S HOUSE (X = 285, Z = -70)
  // -------------------------------------------------------------------------
  const billsHouseGroup = new THREE.Group();
  billsHouseGroup.position.set(285, 0, -70);
  billsHouseGroup.name = 'bills_house_cottage';

  // Bill's cottage used to be one opaque BoxGeometry, so even when its interactive
  // door moved away the front face still visually filled the doorway. Build the
  // visible shell around the already-authored collision opening instead.
  const bhWallMat = createMaterial(0xfff8e1);
  const bhFloor = new THREE.Mesh(new THREE.BoxGeometry(15.3, 0.20, 13.3), woodMat);
  bhFloor.position.y = 0.10;
  bhFloor.userData.walkable = true;
  bhFloor.userData.walkablePriority = 12;
  const bhBack = new THREE.Mesh(new THREE.BoxGeometry(16, 6.5, 0.6), bhWallMat); bhBack.position.set(0, 3.25, -7);
  const bhLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6.5, 14), bhWallMat); bhLeft.position.set(-8, 3.25, 0);
  const bhRight = bhLeft.clone(); bhRight.position.x = 8;
  const bhFrontL = new THREE.Mesh(new THREE.BoxGeometry(6.8, 6.5, 0.6), bhWallMat); bhFrontL.position.set(-4.6, 3.25, 7);
  const bhFrontR = bhFrontL.clone(); bhFrontR.position.x = 4.6;
  const bhHeader = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.3, 0.6), bhWallMat); bhHeader.position.set(0, 4.85, 7);

  // Blue pitched Johto gable roof
  const bhRoof = new THREE.Mesh(new THREE.ConeGeometry(14, 4.5, 4), createMaterial(0x1565c0));
  bhRoof.userData.landableRoof = true;
  bhRoof.rotation.y = Math.PI / 4;
  bhRoof.scale.set(1.25, 1.0, 1.05);
  bhRoof.position.y = 8.5;

  const bhPorch = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.3, 2.5), woodMat);
  bhPorch.position.set(0, 0.15, 8.2);

  const bhChimney = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8.5, 1.4), createMaterial(0x8d6e63));
  bhChimney.position.set(6.5, 4.25, -2.0);

  const bhSign = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.0, 0.2), createMaterial(0x0288d1));
  bhSign.position.set(0, 4.8, 7.2);

  billsHouseGroup.add(bhFloor, bhBack, bhLeft, bhRight, bhFrontL, bhFrontR, bhHeader, bhRoof, bhPorch, bhChimney, bhSign);

  const billsDoor = new Door({
    id: 'bills_house_door',
    name: "Bill's Front Door",
    houseName: "Bill's House",
    type: 'double_slide',
    width: 2.4,
    height: 3.2,
    worldPos: new THREE.Vector3(285, 0, -63),
    frameColor: 0x1565c0,
    glassColor: 0xb3e5fc,
  });
  root.add(billsDoor.group);
  doors.push(billsDoor);

  wallColliders.push(
    { id: 'bh_back', minX: 276.5, maxX: 293.5, minZ: -77.4, maxZ: -76.6 },
    { id: 'bh_left', minX: 276.6, maxX: 277.4, minZ: -77, maxZ: -63 },
    { id: 'bh_right', minX: 292.6, maxX: 293.4, minZ: -77, maxZ: -63 },
    { id: 'bh_front_l', minX: 276.6, maxX: 283.7, minZ: -63.4, maxZ: -62.6 },
    { id: 'bh_front_r', minX: 286.3, maxX: 293.4, minZ: -63.4, maxZ: -62.6 }
  );

  root.add(billsHouseGroup);
  landmarks.push({
    id: 'bills_house',
    name: "Bill's House (PC Creator)",
    category: 'goldenrod',
    x: 285,
    z: -70,
    icon: 'home',
    color: '#1565c0',
  });

  // -------------------------------------------------------------------------
  // 16. DETAILED ARCHITECTURAL POKÉMON CITY RESIDENTIAL & COMMERCIAL BLOCKS
  // -------------------------------------------------------------------------
  const createDetailedCityBuilding = (
    bldgId: string,
    x: number,
    z: number,
    w: number,
    d: number,
    floors: number,
    wallColor: number,
    roofColor: number,
    bldgName: string,
    style: 'traditional_tile' | 'modern_spandrel' | 'boutique_awning' = 'traditional_tile',
    entranceSide: 'north' | 'south' | 'east' | 'west' = 'north'
  ) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(x, 0, z);
    const entranceYaw = entranceSide === 'south'
      ? Math.PI
      : entranceSide === 'east'
      ? Math.PI / 2
      : entranceSide === 'west'
      ? -Math.PI / 2
      : 0;
    bGroup.rotation.y = entranceYaw;
    bGroup.name = bldgId;
    const floorH = 3.6;
    const totalH = floors * floorH;
    const isRadioStudio = bldgName.includes('Radio Studios');
    const entranceWidth = isRadioStudio
      ? THIRD_PERSON_INTERIOR.radioStudioDoorWidth
      : THIRD_PERSON_INTERIOR.minDoorWidth;
    bGroup.userData.isEnterableBuilding = true;
    bGroup.userData.roomClearance = THIRD_PERSON_INTERIOR;

    // 1. Granite baseboard trim. Build it around the perimeter instead of using
    // one filled box under the entire room: the old version visibly filled the
    // doorway/interior up to knee height even though collision correctly allowed
    // entry, so the visual geometry and collision disagreed.
    const plinthH = 0.8;
    const plinthT = 0.42;
    const plinthBack = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, plinthH, plinthT), curbMat);
    plinthBack.position.set(0, plinthH / 2, -d / 2);
    const plinthLeft = new THREE.Mesh(new THREE.BoxGeometry(plinthT, plinthH, d), curbMat);
    plinthLeft.position.set(-w / 2, plinthH / 2, 0);
    const plinthRight = plinthLeft.clone();
    plinthRight.position.x = w / 2;
    const plinthFrontW = Math.max(0.6, (w - entranceWidth) / 2);
    const plinthFrontL = new THREE.Mesh(new THREE.BoxGeometry(plinthFrontW, plinthH, plinthT), curbMat);
    plinthFrontL.position.set(-(entranceWidth / 2 + plinthFrontW / 2), plinthH / 2, d / 2);
    const plinthFrontR = plinthFrontL.clone();
    plinthFrontR.position.x = entranceWidth / 2 + plinthFrontW / 2;
    bGroup.add(plinthBack, plinthLeft, plinthRight, plinthFrontL, plinthFrontR);

    // 2. Real hollow building shell. These shops have interactive doors, so they
    // must have actual interior-facing walls instead of one solid exterior cube.
    addEnterableShell(
      bGroup,
      w,
      d,
      totalH,
      createSurfaceMaterial(wallColor, 'concrete', 0.86, 0.02, Math.max(4, w / 3), Math.max(4, d / 3)),
      createSurfaceMaterial(0xddd6c8, 'tile', 0.84, 0.02, Math.max(4, w / 2.5), Math.max(4, d / 2.5)),
      entranceWidth,
      3.2
    );

    // Give every enterable shop an enclosed ground-floor room instead of a tall,
    // empty exterior shell. The ceiling also prevents the camera from seeing the
    // roof/upper facade from below, which was often mistaken for invisible walls.
    const roomCeiling = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.9, 0.18, d - 0.9),
      createSurfaceMaterial(0xf3efe7, 'concrete', 0.9, 0.01, Math.max(3, w / 4), Math.max(3, d / 4))
    );
    roomCeiling.position.y = Math.min(3.7, totalH - 0.35);
    bGroup.add(roomCeiling);

    const addSolidFurnishing = (mesh: THREE.Mesh) => {
      mesh.userData.solidCollider = true;
      mesh.userData.colliderPadding = 0.02;
      bGroup.add(mesh);
      return mesh;
    };
    const interiorWood = createMaterial(0x6d4c41, 0.82, 0.03);
    const interiorDark = createMaterial(0x263238, 0.72, 0.06);

    if (bldgName.includes('Poké-Boutique')) {
      // Clothing / accessory boutique: checkout, display islands and colourful racks.
      const checkout = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.05, 1.1), interiorWood));
      checkout.position.set(0, 0.53, -d / 2 + 2.0);
      for (const [rx, rz, color] of [[-4.2,0.2,0xef5350],[4.2,0.2,0x42a5f5],[-4.2,3.0,0xab47bc],[4.2,3.0,0x66bb6a]] as const) {
        const rack = new THREE.Group();
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.12), interiorDark);
        rail.position.y = 1.65;
        const postL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.1), interiorDark); postL.position.set(-1.25,0.85,0);
        const postR = postL.clone(); postR.position.x = 1.25;
        rack.add(rail,postL,postR);
        for (let i=0;i<4;i++) {
          const item = new THREE.Mesh(new THREE.BoxGeometry(0.45,0.65,0.12),createMaterial(color));
          item.position.set(-0.9+i*0.6,1.25,0); rack.add(item);
        }
        rack.position.set(rx,0,rz-d*0.08); bGroup.add(rack);
      }
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(2.4,2.2,0.08),new THREE.MeshStandardMaterial({color:0xbfe7f5,roughness:0.12,metalness:0.3}));
      mirror.position.set(w/2-0.38,1.5,-1.5); mirror.rotation.y=Math.PI/2; bGroup.add(mirror);
    } else if (bldgName.includes('Name Rater')) {
      const desk = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(5.2,1.05,1.3),interiorWood));
      desk.position.set(-2.7,0.53,-d/2+2.0);
      const bookcase = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(1.1,2.7,5.0),createMaterial(0x795548)));
      bookcase.position.set(w/2-1.0,1.35,-0.8);
      const daycareMat = new THREE.Mesh(new THREE.BoxGeometry(5.8,0.08,4.0),createMaterial(0x81d4fa));
      daycareMat.position.set(2.7,0.16,2.8); bGroup.add(daycareMat);
      for (const [x,z,c] of [[1.2,2.2,0xffeb3b],[3.3,3.1,0xef5350],[4.0,1.7,0x66bb6a]] as const) {
        const toy = new THREE.Mesh(new THREE.SphereGeometry(0.32,7,6),createMaterial(c)); toy.position.set(x,0.48,z); bGroup.add(toy);
      }
      const nameBoard = new THREE.Mesh(new THREE.BoxGeometry(5.8,1.35,0.12),createMaterial(0x3949ab));
      nameBoard.position.set(0,2.65,-d/2+0.38); bGroup.add(nameBoard);
    } else if (bldgName.includes('Radio Studios')) {
      // Properly usable control room: the central entrance aisle remains clear,
      // furniture stays against the back/sides, and the recording booth has a real
      // walk-through opening rather than one unbroken pane of ghost glass.
      const consoleDesk = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(6.4,1.0,1.5),interiorDark));
      consoleDesk.position.set(-1.0,0.5,-d/2+2.2);
      for (let i=0;i<6;i++) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.06,0.18),new THREE.MeshBasicMaterial({color:i%2?0x00e676:0xff5252}));
        light.position.set(-3.3+i*0.9,1.04,-d/2+1.65); bGroup.add(light);
      }

      const boothGlassMat = new THREE.MeshStandardMaterial({
        color:0x9fe7ff, roughness:0.15, transparent:true, opacity:0.46,
        depthWrite:false, side:THREE.DoubleSide,
      });
      const boothX = 3.35;
      const boothOpening = 2.2;
      const boothTotalDepth = 6.2;
      const boothSegmentDepth = (boothTotalDepth - boothOpening) / 2;
      for (const side of [-1, 1]) {
        const boothGlass = new THREE.Mesh(new THREE.BoxGeometry(0.10,2.8,boothSegmentDepth),boothGlassMat);
        boothGlass.position.set(boothX,1.5,side*(boothOpening/2 + boothSegmentDepth/2));
        boothGlass.name = `radio_studio_booth_glass_${side < 0 ? 'south' : 'north'}`;
        markSolid(boothGlass);
        bGroup.add(boothGlass);
      }
      const boothHeader = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.35,boothOpening),interiorDark);
      boothHeader.position.set(boothX,2.82,0);
      markSolid(boothHeader);
      bGroup.add(boothHeader);

      const micStand = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.07,1.5,7),interiorDark);
      micStand.position.set(Math.min(w/2-2.0,5.8),0.78,1.2); bGroup.add(micStand);
      const mic = new THREE.Mesh(new THREE.SphereGeometry(0.18,7,6),createMaterial(0x111111));
      mic.position.set(micStand.position.x,1.55,1.2); bGroup.add(mic);
      const onAir = new THREE.Mesh(new THREE.BoxGeometry(2.6,0.75,0.08),new THREE.MeshBasicMaterial({color:0xff1744}));
      onAir.position.set(-1.0,2.8,-d/2+0.36); bGroup.add(onAir);

      // Side seating keeps the doorway/camera corridor clear.
      const studioBench = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(3.2,0.58,1.0),createMaterial(0x455a64)));
      studioBench.position.set(-w/2+2.2,0.32,2.0);
      markSittable(studioBench, 'Radio Studios bench');
    } else if (bldgName.includes('Route 34 Gate Lodge')) {
      const gateDesk = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(5.0,1.0,1.3),interiorWood));
      gateDesk.position.set(0,0.5,-d/2+2.0);
      for (const x of [-4.0,4.0]) {
        const bench = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(3.2,0.55,1.0),createMaterial(0x5d4037)));
        bench.position.set(x,0.34,2.8);
        markSittable(bench, 'Gate lodge bench');
      }
      const routeMap = new THREE.Mesh(new THREE.BoxGeometry(6.4,2.2,0.08),createMaterial(0x66bb6a));
      routeMap.position.set(0,2.0,-d/2+0.38); bGroup.add(routeMap);
      const vending = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(1.5,2.3,1.0),createMaterial(0x1e88e5)));
      vending.position.set(w/2-1.3,1.15,-1.5);
    } else {
      // Every other house/shop gets a believable minimum interior rather than a
      // completely empty box: counter, shelving and a small seating area.
      const counter = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(4.3,0.95,1.1),interiorWood));
      counter.position.set(0,0.48,-d/2+2.0);
      const shelfL = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(1.0,2.3,4.4),createMaterial(0x8d6e63)));
      shelfL.position.set(-w/2+1.0,1.15,-0.6);
      const shelfR = shelfL.clone(); shelfR.position.x=w/2-1.0; shelfR.userData.solidCollider=true; bGroup.add(shelfR);
      const seat = addSolidFurnishing(new THREE.Mesh(new THREE.BoxGeometry(2.8,0.6,1.0),createMaterial(roofColor)));
      seat.position.set(Math.min(w/2-2.2, w*0.23),0.32,2.4);
      markSittable(seat, `${bldgName} seat`);
    }

    // 3. Molded Cornice Band between floors
    for (let f = 1; f < floors; f++) {
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.35, d + 0.6), pokeCreamMat);
      cornice.position.y = f * floorH;
      bGroup.add(cornice);
    }

    // 4. Roof Architecture based on style
    if (style === 'traditional_tile') {
      // Classic Johto ceramic tile hipped roof with eaves overhang
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.72, 3.8, 4), createSurfaceMaterial(roofColor, 'roof', 0.9, 0.02, 7, 5));
      roof.rotation.y = Math.PI / 4;
      roof.scale.set((w / Math.hypot(w, d)) * 1.45, 1.0, (d / Math.hypot(w, d)) * 1.45);
      roof.position.y = totalH + 1.9;

      const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.4, d + 1.4), createSurfaceMaterial(roofColor, 'roof', 0.9, 0.02, 7, 5));
      roofTrim.position.y = totalH + 0.2;
      bGroup.add(roof, roofTrim);
    } else if (style === 'modern_spandrel') {
      // Modern flat roof with decorative parapet, HVAC unit, and satellite dish
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 1.2, d + 0.4), createSurfaceMaterial(roofColor, 'concrete', 0.82, 0.06, 5, 5));
      parapet.userData.landableRoof = true;
      parapet.position.y = totalH + 0.6;

      const hvac = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 2.8), createMaterial(0x78909c));
      hvac.position.set(-w * 0.2, totalH + 0.9, -d * 0.1);
      const dish = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.5, 8), pokeWhiteMat);
      dish.rotation.x = -Math.PI / 3;
      dish.position.set(w * 0.25, totalH + 1.4, d * 0.15);
      bGroup.add(parapet, hvac, dish);
    } else {
      // Mansard boutique roof with dormer windows
      const mansard = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 2.4, d + 0.8), createSurfaceMaterial(roofColor, 'roof', 0.9, 0.02, 7, 5));
      mansard.position.y = totalH + 1.2;
      const dormer = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.2), pokeCreamMat);
      dormer.position.set(0, totalH + 1.2, d / 2 + 0.4);
      bGroup.add(mansard, dormer);
    }

    // 5. Storefront glazing leaves the actual doorway physically and visually clear.
    // The old single glass strip ran straight across the entrance, so the door opened
    // onto a pane the player could ghost through. Two framed panes now flank the door.
    const storefrontGap = entranceWidth + 0.8;
    const storefrontMargin = 0.9;
    const paneW = Math.max(1.2, (w - storefrontGap - storefrontMargin * 2) / 2);
    for (const side of [-1, 1]) {
      const paneX = side * (storefrontGap / 2 + paneW / 2);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(paneW, 2.4, 0.12), glassMat);
      pane.position.set(paneX, 2.2, d / 2 + 0.38);
      pane.userData.solidCollider = true;
      pane.userData.colliderPadding = 0.01;
      const frameMat = createMaterial(0x37474f, 0.45, 0.25);
      const frameTop = new THREE.Mesh(new THREE.BoxGeometry(paneW + 0.22, 0.11, 0.16), frameMat);
      frameTop.position.set(paneX, 3.46, d / 2 + 0.31);
      const frameBottom = frameTop.clone(); frameBottom.position.y = 0.94;
      const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.62, 0.16), frameMat);
      frameLeft.position.set(paneX - paneW / 2 - 0.055, 2.2, d / 2 + 0.31);
      const frameRight = frameLeft.clone(); frameRight.position.x = paneX + paneW / 2 + 0.055;
      // Frame is only visual; the exact glass pane owns the collision footprint.
      bGroup.add(frameTop, frameBottom, frameLeft, frameRight, pane);
    }

    const awning = new THREE.Mesh(new THREE.BoxGeometry(w - 3.0, 0.35, 2.6), createSurfaceMaterial(roofColor, 'carpet', 0.84, 0.01, 6, 2));
    awning.userData.landableRoof = true;
    awning.position.set(0, 3.4, d / 2 + 1.3);
    bGroup.add(awning);

    // Small architectural details shared by the whole block: gutters/downpipes and
    // a porch light make the buildings read as actual structures without heavy meshes.
    const gutterMat = createSurfaceMaterial(0x78909c, 'metal', 0.38, 0.62, 3, 2);
    const gutterFront = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.16, 0.18), gutterMat);
    gutterFront.position.set(0, totalH - 0.25, d / 2 + 0.38);
    const gutterBack = gutterFront.clone(); gutterBack.position.z = -d / 2 - 0.38;
    const downpipeL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, totalH - 0.5, 6), gutterMat);
    downpipeL.position.set(-w / 2 - 0.18, (totalH - 0.5) / 2, d / 2 + 0.30);
    const downpipeR = downpipeL.clone(); downpipeR.position.x = w / 2 + 0.18;
    const porchLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffe6a6 }));
    porchLight.position.set(0, 3.65, d / 2 + 0.62);
    bGroup.add(gutterFront, gutterBack, downpipeL, downpipeR, porchLight);

    // 6. Upper Floor Windows with Sills and Trim
    for (let f = 1; f < floors; f++) {
      const wy = f * floorH + 2.0;
      const winL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.2), glassMat);
      winL.position.set(-w * 0.26, wy, d / 2 + 0.38);
      const sillL = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 0.4), pokeWhiteMat);
      sillL.position.set(-w * 0.26, wy - 0.9, d / 2 + 0.2);

      const winR = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.2), glassMat);
      winR.position.set(w * 0.26, wy, d / 2 + 0.38);
      const sillR = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 0.4), pokeWhiteMat);
      sillR.position.set(w * 0.26, wy - 0.9, d / 2 + 0.2);

      bGroup.add(winL, sillL, winR, sillR);
    }

    // 7. Interactive Door & Colliders. The Door object owns the visible panel;
    // do not leave a second static door coplanar with it (that caused flickering).
    const entranceOffset = new THREE.Vector3(0, 0, d / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), entranceYaw);
    const bldgDoor = new Door({
      id: `${bldgId}_door`,
      name: `${bldgName} Entrance`,
      houseName: bldgName,
      type: 'double_slide',
      width: entranceWidth,
      height: 3.2,
      worldPos: new THREE.Vector3(x + entranceOffset.x, 0, z + entranceOffset.z),
      rotationY: entranceYaw,
      frameColor: roofColor,
      glassColor: 0xb2ebf2,
    });
    root.add(bldgDoor.group);
    doors.push(bldgDoor);

    // A small walkable entrance apron rotates with the facade. It keeps the door
    // clear of decorative props and makes the intended public approach obvious.
    const entranceApron = new THREE.Mesh(
      new THREE.BoxGeometry(entranceWidth + 2.2, 0.08, 5.0),
      sidewalkMat
    );
    entranceApron.position.set(0, 0.16, d / 2 + 2.45);
    entranceApron.userData.walkable = true;
    entranceApron.userData.walkablePriority = 8;
    entranceApron.userData.sidewalkSurface = true;
    entranceApron.userData.roadCriticalDetail = true;
    entranceApron.name = `${bldgId}_entrance_apron`;
    bGroup.add(entranceApron);

    // Convert each local wall slab into a world-space AABB after the building's
    // cardinal rotation. Collision therefore follows the rotated visible walls;
    // no stale invisible collider remains where the old facade used to be.
    const worldWall = (id: string, minLX: number, maxLX: number, minLZ: number, maxLZ: number): WallBox => {
      const corners = [
        new THREE.Vector3(minLX, 0, minLZ), new THREE.Vector3(maxLX, 0, minLZ),
        new THREE.Vector3(minLX, 0, maxLZ), new THREE.Vector3(maxLX, 0, maxLZ),
      ].map((corner) => corner.applyAxisAngle(new THREE.Vector3(0, 1, 0), entranceYaw));
      return {
        id,
        minX: x + Math.min(...corners.map((c) => c.x)),
        maxX: x + Math.max(...corners.map((c) => c.x)),
        minZ: z + Math.min(...corners.map((c) => c.z)),
        maxZ: z + Math.max(...corners.map((c) => c.z)),
      };
    };
    wallColliders.push(
      worldWall(`${bldgId}_back`, -w / 2 - 0.4, w / 2 + 0.4, -d / 2 - 0.4, -d / 2 + 0.4),
      worldWall(`${bldgId}_left`, -w / 2 - 0.4, -w / 2 + 0.4, -d / 2, d / 2),
      worldWall(`${bldgId}_right`, w / 2 - 0.4, w / 2 + 0.4, -d / 2, d / 2),
      worldWall(`${bldgId}_front_l`, -w / 2, -entranceWidth / 2 - 0.12, d / 2 - 0.4, d / 2 + 0.4),
      worldWall(`${bldgId}_front_r`, entranceWidth / 2 + 0.12, w / 2, d / 2 - 0.4, d / 2 + 0.4)
    );

    return bGroup;
  };

  const detailedBuildings = [
    // West Avenue Blocks (Shopping & Residential)
    createDetailedCityBuilding('bldg_w1', 175, -70, 18, 14, 3, 0xd1c4e9, 0xad1457, 'Goldenrod Poké-Boutique', 'traditional_tile', 'south'),
    createDetailedCityBuilding('bldg_w2', 150, 45, 18, 14, 3, 0xb2dfdb, 0xe65100, 'Goldenrod Café & Bakery', 'boutique_awning', 'west'),
    createDetailedCityBuilding('bldg_w3', 170, 110, 20, 15, 4, 0xffccbc, 0x2e7d32, 'Silph Co. Johto Regional Offices', 'modern_spandrel', 'south'),
    createDetailedCityBuilding('bldg_w4', 145, 128, 20, 16, 3, 0xc8e6c9, 0x303f9f, 'Name Rater & Daycare Agency', 'traditional_tile', 'west'),

    // East Avenue Blocks (Residential & Civic)
    createDetailedCityBuilding('bldg_e1', 250, -60, 18, 14, 3, 0xffe0b2, 0xc2185b, 'Goldenrod City Suites (North)', 'traditional_tile', 'south'),
    createDetailedCityBuilding('bldg_e2', 225, -70, 18, 14, 3, 0xd7ccc8, 0x00838f, 'Goldenrod Resident Townhouse', 'traditional_tile', 'south'),
    createDetailedCityBuilding('bldg_e3', 286, 64, 18, 14, 3, 0xf8bbd0, 0x512da8, 'Liberty Plaza Offices', 'boutique_awning', 'north'),
    createDetailedCityBuilding('bldg_e4', 285, 125, 20, 16, 4, 0xc5cae9, 0xd84315, 'Goldenrod Radio Studios East', 'modern_spandrel', 'south'),
    createDetailedCityBuilding('bldg_e5', 225, 128, 22, 16, 3, 0xb0bec5, 0x1976d2, 'Grand Metropolitan Plaza North', 'modern_spandrel', 'west'),

    // Outer Avenues (Boundary blocks): sit BESIDE the avenues rather than on top of them.
    createDetailedCityBuilding('bldg_ow1', 90, -30, 16, 14, 2, 0xffecb3, 0x5d4037, 'Route 34 Gate Lodge', 'traditional_tile', 'east'),
    createDetailedCityBuilding('bldg_ow2', 90, 30, 16, 14, 3, 0xdcedc8, 0x4527a0, 'Whitney Gym Trainer Annex', 'boutique_awning', 'east'),
    createDetailedCityBuilding('bldg_oe1', 290, -30, 16, 14, 3, 0xe1bee7, 0xbf360c, 'Magnet Train Crew Quarters', 'traditional_tile', 'east'),
    createDetailedCityBuilding('bldg_oe2', 290, 30, 16, 14, 2, 0xb3e5fc, 0x2e7d32, 'Goldenrod Botanical Conservatory', 'boutique_awning', 'east'),
  ];
  detailedBuildings.forEach((b) => root.add(b));
  landmarks.push({
    id: 'goldenrod_radio_studios_east',
    name: 'Goldenrod Radio Studios',
    category: 'goldenrod',
    x: 285,
    z: 125,
    icon: 'radio',
    color: '#d84315',
  });

  // -------------------------------------------------------------------------
  // 17. ALLEY DETAILS (Dumpsters, Vending Machines, Crates, Bicycle Racks)
  // -------------------------------------------------------------------------
  const alleyPropsGroup = new THREE.Group();
  alleyPropsGroup.name = 'goldenrod_alley_props';

  // Pokémon Soda Pop / Fresh Water Vending Machines along alleys and sidewalks
  const addStreetVendingMachine = (x: number, z: number, color: number) => {
    const vm = new THREE.Group();
    vm.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.0), createMaterial(color));
    body.position.y = 1.2;
    markSolid(body);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.1), glassMat);
    screen.position.set(0, 1.4, 0.52);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.1), createMaterial(0x212121));
    slot.position.set(0, 0.4, 0.52);
    vm.add(body, screen, slot);
    alleyPropsGroup.add(vm);
  };

  addStreetVendingMachine(161, 45, 0x0288d1); // Fresh Water blue
  addStreetVendingMachine(163, 45, 0xd32f2f); // Soda Pop red
  addStreetVendingMachine(165, 45, 0xfbc02d); // Lemonade yellow
  addStreetVendingMachine(280, 42, 0x388e3c);
  addStreetVendingMachine(282, 42, 0x7b1fa2);

  // Wooden Shipping Crates stacked in side alleys
  const addCrateStack = (x: number, z: number) => {
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), woodMat);
    c1.position.set(x, 0.7, z);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), woodMat);
    c2.position.set(x + 0.4, 0.7, z + 1.2);
    const c3 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), woodMat);
    c3.position.set(x + 0.2, 2.0, z + 0.6);
    markSolid(c1, c2, c3);
    alleyPropsGroup.add(c1, c2, c3);
  };
  addCrateStack(161, -45);
  addCrateStack(239, -45);
  addCrateStack(161, 115);

  root.add(alleyPropsGroup);

  // -------------------------------------------------------------------------
  // 18. DESTRUCTIBLE PROPS IN GOLDENROD (Hydrants, Mailboxes, Donut Boxes)
  // -------------------------------------------------------------------------
  const redMat = createMaterial(0xd32f2f);
  const yellowMat = createMaterial(0xffd600);
  const blueMat = createMaterial(0x1976d2);

  const ghCoords = [
    [190.2, 20],
    [209.8, 20],
    [190.2, -20],
    [209.8, -20],
    [190.2, 80],
    [209.8, 80],
    [190.2, -80],
    [209.8, -80],
  ];
  ghCoords.forEach(([hx, hz], idx) => {
    const hGroup = new THREE.Group();
    hGroup.position.set(hx, 0.5, hz);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.0, 8), redMat);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), yellowMat);
    cap.position.y = 0.55;
    hGroup.add(body, cap);
    root.add(hGroup);
    destructibles.push({
      id: `gh_hydrant_${idx}`,
      mesh: hGroup,
      type: 'hydrant',
      position: { x: hx, y: 0.5, z: hz },
      destroyed: false,
    });
  });

  const gmCoords = [
    [189, 30],
    [211, 30],
    [189, -30],
    [211, -30],
    [189, 70],
    [211, 70],
  ];
  gmCoords.forEach(([mx, mz], idx) => {
    const mGroup = new THREE.Group();
    mGroup.position.set(mx, 0.6, mz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), woodMat);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.8), blueMat);
    box.position.y = 0.65;
    mGroup.add(post, box);
    root.add(mGroup);
    destructibles.push({
      id: `gm_mailbox_${idx}`,
      mesh: mGroup,
      type: 'mailbox',
      position: { x: mx, y: 0.6, z: mz },
      destroyed: false,
    });
  });

  const gdCoords = [
    [188.8, 45],
    [211.2, -45],
    [278, 78],
    [140, 60],
    [242.0, -20],
    [175, 25],
  ];
  gdCoords.forEach(([dx, dz], idx) => {
    const dGroup = new THREE.Group();
    dGroup.position.set(dx, 1.0, dz);
    const dMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.25, 8, 16),
      createMaterial(0xff4081, 0.3)
    );
    dMesh.rotation.x = Math.PI / 3;
    dGroup.add(dMesh);
    root.add(dGroup);
    destructibles.push({
      id: `gd_donut_${idx}`,
      mesh: dGroup,
      type: 'donut_box',
      position: { x: dx, y: 1.0, z: dz },
      destroyed: false,
    });
  });

  // -------------------------------------------------------------------------
  // 15. GRASS PATCHES IN GOLDENROD
  // -------------------------------------------------------------------------
  const patchCoords = [
    [175, 20],
    [278, 18],
    [175, -20],
    [225, -20],
    [276, 16],
    [130, -50],
    [176, 120],
  ];
  const patchMat = createMaterial(0x8bc34a, 0.95);
  patchCoords.forEach(([px, pz], idx) => {
    const patchGeo = new THREE.CircleGeometry(4.0, 16);
    patchGeo.rotateX(-Math.PI / 2);
    const pMesh = new THREE.Mesh(patchGeo, patchMat);
    pMesh.position.set(px, 0.08, pz);
    root.add(pMesh);
    grassPatches.push({
      id: `goldenrod_patch_${idx}`,
      mesh: pMesh,
      position: { x: px, y: 0.08, z: pz },
      radius: 4.0,
      waterLevel: 0,
      growthStage: 0,
    });
  });

  // -------------------------------------------------------------------------
  // AUTHORED GREENERY PASS
  // -------------------------------------------------------------------------
  // Goldenrod already has a small Main Avenue tree row. Extend that language across
  // the live street grid with irregular spacing and several looser park-edge groves.
  // Every added tree is a normal destructible tree, so it uses the same reusable
  // kick/fall/fallen-rest/collider-sync physics as the original city trees.
  const goldenrodLandscaping = addRoadsideLandscaping({
    root,
    destructibles,
    districtId: 'goldenrod',
    maxRoadsideTrees: 26,
    seed: 0x60d13d,
    groves: [
      { minX: 120, maxX: 154, minZ: 104, maxZ: 138, count: 4 },
      { minX: 262, maxX: 298, minZ: 104, maxZ: 140, count: 5 },
      { minX: 105, maxX: 126, minZ: -140, maxZ: -108, count: 3 },
      { minX: 270, maxX: 300, minZ: -136, maxZ: -106, count: 3 },
    ],
  });
  console.info('[Goldenrod landscaping]', goldenrodLandscaping);

  // Enterable / walk-in spaces must render their wall faces from the inside.
  // Clone materials only for these groups so the rest of the city keeps normal
  // one-sided rendering performance.
  [
    labGroup, pkmnCenterGroup, deptStoreGroup, gymGroup, garageGroup, radioTowerGroup,
    trainStationGroup, westStation, elevatorCab, westElevatorCab, bikeShopGroup, flowerShopGroup, gameCornerGroup,
    billsHouseGroup, ...detailedBuildings,
  ].forEach(enableInteriorFaces);

  return {
    group: root,
    destructibles,
    grassPatches,
    doors,
    wallColliders,
    oakLab: {
      bounds: { minX: 188, maxX: 212, minZ: -215, maxZ: -185 },
      oakPos: new THREE.Vector3(200, 0.12, -210.8),
      starters: starterList,
      exitPos: new THREE.Vector3(200, 0.12, -185),
    },
    pokemonCenter: {
      receptionistPos: new THREE.Vector3(250, 0.12, -34.7),
      bedPos: new THREE.Vector3(255.8, 1.18, -34.6),
      recoveryPos: new THREE.Vector3(252.3, 0.12, -31.5),
    },
    playerGarage: {
      pos: garagePos,
      servicePos: garageServicePos,
      resetPos: garageResetPos,
      carBays,
    },
    trainService: {
      update: updateTrainService,
      serviceGroup: railServiceGroup,
      eastElevatorGround: new THREE.Vector3(248, 0.12, -97.0),
      eastElevatorPlatform: new THREE.Vector3(248, 12.95, -102.0),
      westElevatorGround: new THREE.Vector3(westElevatorX, 0.12, westElevatorZ + 2.8),
      westElevatorPlatform: new THREE.Vector3(westElevatorX, 12.95, westElevatorZ - 2.8),
      eastPlatformPos: new THREE.Vector3(240, 12.95, -102),
      westPlatformPos: new THREE.Vector3(-240, 12.95, -102),
      trainMesh,
      trainInteriorFloorY,
      trainInteriorBounds,
      trainInteriorBlockers,
      trainDoorLocalPositions,
      getTrainDoorWorldPositions,
      isTrainStopped,
      getStoppedStation,
      passengers: trainPassengers,
      elevator: {
        cabin: elevatorCab,
        groundPos: new THREE.Vector3(248, 0.12, -97.0),
        platformPos: new THREE.Vector3(248, 12.95, -102.0),
        requestLevel: requestElevatorLevel,
        getState: getElevatorState,
      },
      springfieldElevator: {
        cabin: westElevatorCab,
        groundPos: new THREE.Vector3(westElevatorX, 0.12, westElevatorZ + 2.8),
        platformPos: new THREE.Vector3(westElevatorX, 12.95, westElevatorZ - 2.8),
        requestLevel: requestWestElevatorLevel,
        getState: getWestElevatorState,
      },
    },
    twinTowerService: {
      update: (dt: number) => {
        for (const updater of towerElevatorUpdaters) updater(dt);
      },
      elevators: towerElevators,
    },
    landmarks,
    arcadeMachines,
  };
}
