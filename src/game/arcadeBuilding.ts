import * as THREE from 'three';
import { Door, WallBox } from './doors';
import { ArcadeMachineInfo, DestructibleProp, MapLandmark } from '../types';
import { createMaterial, createSurfaceMaterial, createStylizedCityTreeModel } from './models';

function markSolid(mesh: THREE.Object3D, _margin = 0) {
  mesh.userData.solidCollider = true;
}

function markWalkable(mesh: THREE.Object3D, maxSlope = 8) {
  mesh.userData.walkable = true;
  mesh.userData.maxSlope = maxSlope;
}

export interface ArcadeBuildingResult {
  group: THREE.Group;
  landmarks: MapLandmark[];
  destructibles: DestructibleProp[];
  doors: Door[];
  wallColliders: WallBox[];
  arcadeMachines: ArcadeMachineInfo[];
  update: (dt: number, activePosition?: THREE.Vector3) => void;
}

/**
 * Creates a canvas texture for signs, posters, and marquee displays.
 */
function createArcadeLabelTexture(
  text: string,
  width: number,
  height: number,
  color: string,
  bg: string,
  subtitle?: string,
  accent = '#e040fb'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round(512 * (height / width));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, '#05030a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Neon border
    ctx.strokeStyle = accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

    // Main Text
    ctx.font = '900 46px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    const yPos = subtitle ? canvas.height * 0.42 : canvas.height * 0.5;
    ctx.fillText(text, canvas.width / 2, yPos);

    if (subtitle) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ffffff';
      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(subtitle, canvas.width / 2, canvas.height * 0.74);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Creates an authentic retro 80s/90s cosmic geometric arcade carpet texture.
 */
function createArcadeCarpetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Deep midnight purple-black background
    ctx.fillStyle = '#080514';
    ctx.fillRect(0, 0, 512, 512);

    // Vibrant fluorescent confetti & geometric starbursts
    const colors = ['#f43f5e', '#38bdf8', '#a855f7', '#fbbf24', '#34d399', '#ec4899'];
    for (let i = 0; i < 90; i++) {
      ctx.save();
      const x = (i * 59) % 512;
      const y = (i * 83) % 512;
      ctx.translate(x, y);
      ctx.rotate((i * 47 * Math.PI) / 180);

      ctx.fillStyle = colors[i % colors.length];
      if (i % 3 === 0) {
        // Neon triangle
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(8, 8);
        ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fill();
      } else if (i % 3 === 1) {
        // Neon starburst
        ctx.fillRect(-6, -2, 12, 4);
        ctx.fillRect(-2, -6, 4, 12);
      } else {
        // Neon circle dot
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 7);
  return texture;
}

export function buildArcadeBuilding(): ArcadeBuildingResult {
  const root = new THREE.Group();
  root.name = 'pixel_paradise_arcade_complex';

  const landmarks: MapLandmark[] = [];
  const destructibles: DestructibleProp[] = [];
  const doors: Door[] = [];
  const wallColliders: WallBox[] = [];
  const arcadeMachines: ArcadeMachineInfo[] = [];

  // -------------------------------------------------------------------------
  // LOCATION & BOUNDS
  // Positioned around X = 8, Z = -305 in the open reserve between the main
  // cities and the airport, connecting north to the highway and south to airport.
  // -------------------------------------------------------------------------
  const BUILDING_X = 8;
  const BUILDING_Z = -305;
  const BUILDING_W = 38;  // Width X: -11 to +27
  const BUILDING_D = 32;  // Depth Z: -321 to -289
  const BUILDING_H = 6.8; // Height Y: 0 to 6.8
  const FRONT_Z = BUILDING_Z + BUILDING_D / 2; // Z = -289 (North Entrance Wall facing towards cities)

  // Materials
  const asphaltMat = createSurfaceMaterial(0x23272d, 'asphalt', 0.94, 0.02, 18, 18);
  const concretePaveMat = createSurfaceMaterial(0x9ca3af, 'concrete', 0.88, 0.02, 12, 12);
  const curbYellowMat = createMaterial(0xf59e0b, 0.5, 0.1);
  const exteriorWallMat = createSurfaceMaterial(0x1e1b2e, 'concrete', 0.85, 0.05, 14, 8);
  const interiorWallMat = createSurfaceMaterial(0x2a243d, 'concrete', 0.90, 0.02, 10, 6);
  const ceilingMat = createMaterial(0x110f1c, 0.95, 0.05);
  const metalFrameMat = createMaterial(0x374151, 0.35, 0.85);
  const neonPinkMat = new THREE.MeshBasicMaterial({ color: 0xff007f, toneMapped: false });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false });
  const neonGoldMat = new THREE.MeshBasicMaterial({ color: 0xffb703, toneMapped: false });
  const neonPurpleMat = new THREE.MeshBasicMaterial({ color: 0xbc13fe, toneMapped: false });

  const carpetMat = new THREE.MeshStandardMaterial({
    map: createArcadeCarpetTexture(),
    roughness: 0.96,
    metalness: 0.02,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x8be9fd,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // -------------------------------------------------------------------------
  // 1. ACCESS ROADS & ARTERIAL BOULEVARD (Linking Highway, Arcade, and Airport)
  // Connects smoothly from Northern Highway (Z = -170) down to the Arcade plaza,
  // with causeway bridge piers and guardrails over river water, plus extended
  // East and West connector roads linking directly to the Airport road network.
  // -------------------------------------------------------------------------
  // North Access Boulevard Causeway: from Z = -161 to Z = -260 (length: 99m)
  const accessRoadNorth = new THREE.Mesh(new THREE.BoxGeometry(14, 0.16, 99), asphaltMat);
  accessRoadNorth.name = 'arcade_access_boulevard_north';
  accessRoadNorth.position.set(BUILDING_X, 0.08, -210.5);
  markWalkable(accessRoadNorth, 8);
  accessRoadNorth.userData.mapRoadSurface = true;
  accessRoadNorth.userData.permanentRoadGeometry = true;
  accessRoadNorth.userData.roadCriticalDetail = true;
  accessRoadNorth.userData.walkablePriority = 8;
  root.add(accessRoadNorth);

  // Smooth, wide approach apron with Northern Viaduct (Z = -161 to -178)
  // Generous 40m wide asphalt apron ensures seamless transition with no concrete obstruction
  const junctionDeck = new THREE.Mesh(new THREE.BoxGeometry(40, 0.16, 17), asphaltMat);
  junctionDeck.name = 'arcade_bridge_approach_apron';
  junctionDeck.position.set(BUILDING_X, 0.08, -169.5);
  markWalkable(junctionDeck, 8);
  junctionDeck.userData.mapRoadSurface = true;
  junctionDeck.userData.permanentRoadGeometry = true;
  junctionDeck.userData.roadCriticalDetail = true;
  root.add(junctionDeck);

  // Causeway concrete support piers in the river (Z = -190, -210, -230)
  // Positioned well below the asphalt deck (top at Y = -0.25) so concrete never pokes into the roadway
  for (const pz of [-190, -210, -230]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(13.2, 5.0, 3.0), concretePaveMat);
    pier.name = `arcade_causeway_pier_${pz}`;
    pier.position.set(BUILDING_X, -2.75, pz);
    root.add(pier);
  }

  // -------------------------------------------------------------------------
  // CAUSEWAY BRIDGE BARRIERS (STRICTLY OVER RIVER WATER: Z = -183 to Z = -237)
  // The intersection and approach zone between Z = -161 and Z = -182 is completely
  // open with ZERO barriers, allowing turning vehicles and players free transit.
  // -------------------------------------------------------------------------
  const bridgeBarrierMat = createMaterial(0x9ca3af, 0.35, 0.3); // Reinforced highway concrete
  const steelRailMat = createMaterial(0xe5e7eb, 0.25, 0.85); // Galvanized steel
  const steelPostMat = createMaterial(0x4b5563, 0.3, 0.7); // Dark treated steel posts

  const barrierGroup = new THREE.Group();
  barrierGroup.name = 'arcade_causeway_realistic_barriers';

  // Causeway straight runs: strictly between Z = -183 and Z = -237 (54m length, center Z = -210)
  // Placed at X = 0.75 (West) and X = 15.25 (East), safely outside the 14m road deck (X = 1.0 to 15.0)
  const straightLen = 54;
  const straightCenterZ = -210;

  const buildBridgeBarrierSection = (x: number, isWest: boolean) => {
    const sec = new THREE.Group();

    // 1. Concrete Parapet Base (0.72m high, 0.46m wide)
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.72, straightLen), bridgeBarrierMat);
    base.position.set(x, 0.44, straightCenterZ);
    markSolid(base, 0);
    sec.add(base);

    // 2. Dual Galvanized Steel Tubular Guardrails on top of parapet
    const lowerPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, straightLen, 8), steelRailMat);
    lowerPipe.rotation.x = Math.PI / 2;
    lowerPipe.position.set(x, 0.95, straightCenterZ);
    const upperPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, straightLen, 8), steelRailMat);
    upperPipe.rotation.x = Math.PI / 2;
    upperPipe.position.set(x, 1.25, straightCenterZ);
    sec.add(lowerPipe, upperPipe);

    // 3. Vertical Steel Mounting Stanchions every 5.4m
    for (let z = -235; z <= -185; z += 5.4) {
      const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 0.12), steelPostMat);
      stanchion.position.set(x, 1.05, z);
      sec.add(stanchion);

      // Reflector delineators
      const delineatorMat = isWest ? neonCyanMat : neonPinkMat;
      const delineator = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), delineatorMat);
      const faceOffset = isWest ? 0.25 : -0.25;
      delineator.position.set(x + faceOffset, 0.95, z);
      sec.add(delineator);
    }

    // 4. Outward-flared impact crash terminals at northern end (Z = -183) and southern end (Z = -237)
    // Flaring outward away from the road prevents vehicle snagging
    const flareDir = isWest ? -1 : 1;
    for (const termZ of [-183, -237]) {
      const termBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 1.8), bridgeBarrierMat);
      termBase.position.set(x + flareDir * 0.35, 0.42, termZ);
      markSolid(termBase, 0);
      sec.add(termBase);
    }

    return sec;
  };

  const westBarrier = buildBridgeBarrierSection(BUILDING_X - 7.25, true); // X = 0.75
  const eastBarrier = buildBridgeBarrierSection(BUILDING_X + 7.25, false); // X = 15.25
  barrierGroup.add(westBarrier, eastBarrier);
  root.add(barrierGroup);

  // Dashed lane dividers along north access road
  for (let z = -256; z <= -168; z += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 3.8), createMaterial(0xffffff, 0.4, 0.1));
    dash.position.set(BUILDING_X, 0.17, z);
    dash.userData.roadCriticalDetail = true;
    root.add(dash);
  }

  // -------------------------------------------------------------------------
  // WEST EXTENDED ROAD (Connecting Car Park to Airport West Approach Road)
  // From X = -18 (Car Park West edge) to X = -168 (Airport West road), along Z = -273
  // -------------------------------------------------------------------------
  const westRoadLen = 150;
  const westRoadX = (-18 + -168) / 2; // -93
  const roadWest = new THREE.Mesh(new THREE.BoxGeometry(westRoadLen, 0.16, 14), asphaltMat);
  roadWest.name = 'arcade_extended_road_west';
  roadWest.position.set(westRoadX, 0.08, -273);
  markWalkable(roadWest, 8);
  roadWest.userData.mapRoadSurface = true;
  roadWest.userData.permanentRoadGeometry = true;
  roadWest.userData.roadCriticalDetail = true;
  roadWest.userData.walkablePriority = 8;
  root.add(roadWest);

  // West Road Dashed Lane Centerline
  for (let wx = -164; wx <= -22; wx += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.04, 0.24), createMaterial(0xffffff, 0.4, 0.1));
    dash.position.set(wx, 0.17, -273);
    dash.userData.roadCriticalDetail = true;
    root.add(dash);
  }

  // West Road Junction Connector Fillet with Airport Road (at X = -168, Z = -273)
  const westJunction = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 18), asphaltMat);
  westJunction.name = 'arcade_west_airport_junction';
  westJunction.position.set(-168, 0.08, -273);
  markWalkable(westJunction, 8);
  westJunction.userData.mapRoadSurface = true;
  westJunction.userData.permanentRoadGeometry = true;
  westJunction.userData.roadCriticalDetail = true;
  root.add(westJunction);

  // Streetlamps along West Extended Road
  for (let lx = -155; lx <= -35; lx += 30) {
    const lamp = new THREE.Group();
    lamp.position.set(lx, 0, -280.5);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 8), metalFrameMat);
    pole.position.y = 3.25;
    markSolid(pole, 0.05);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.4), metalFrameMat);
    arm.position.set(0.6, 6.4, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), createMaterial(0xfffbeb, 0.1, 0.9));
    bulb.position.set(1.2, 6.2, 0);
    lamp.add(pole, arm, bulb);
    root.add(lamp);
  }

  // -------------------------------------------------------------------------
  // EAST EXTENDED ROAD (Connecting Car Park to Airport East Approach Road)
  // From X = +34 (Car Park East edge) to X = +273 (Airport East road), along Z = -273
  // -------------------------------------------------------------------------
  const eastRoadLen = 239;
  const eastRoadX = (34 + 273) / 2; // 153.5
  const roadEast = new THREE.Mesh(new THREE.BoxGeometry(eastRoadLen, 0.16, 14), asphaltMat);
  roadEast.name = 'arcade_extended_road_east';
  roadEast.position.set(eastRoadX, 0.08, -273);
  markWalkable(roadEast, 8);
  roadEast.userData.mapRoadSurface = true;
  roadEast.userData.permanentRoadGeometry = true;
  roadEast.userData.roadCriticalDetail = true;
  roadEast.userData.walkablePriority = 8;
  root.add(roadEast);

  // East Road Dashed Lane Centerline
  for (let ex = 38; ex <= 269; ex += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.04, 0.24), createMaterial(0xffffff, 0.4, 0.1));
    dash.position.set(ex, 0.17, -273);
    dash.userData.roadCriticalDetail = true;
    root.add(dash);
  }

  // East Road Junction Connector Fillet with Airport Road (at X = +273, Z = -273)
  const eastJunction = new THREE.Mesh(new THREE.BoxGeometry(18, 0.16, 18), asphaltMat);
  eastJunction.name = 'arcade_east_airport_junction';
  eastJunction.position.set(273, 0.08, -273);
  markWalkable(eastJunction, 8);
  eastJunction.userData.mapRoadSurface = true;
  eastJunction.userData.permanentRoadGeometry = true;
  eastJunction.userData.roadCriticalDetail = true;
  root.add(eastJunction);

  // Streetlamps along East Extended Road
  for (let lx = 48; lx <= 255; lx += 32) {
    const lamp = new THREE.Group();
    lamp.position.set(lx, 0, -280.5);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 8), metalFrameMat);
    pole.position.y = 3.25;
    markSolid(pole, 0.05);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.4), metalFrameMat);
    arm.position.set(0.6, 6.4, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), createMaterial(0xfffbeb, 0.1, 0.9));
    bulb.position.set(1.2, 6.2, 0);
    lamp.add(pole, arm, bulb);
    root.add(lamp);
  }

  // South Access Boulevard: from Z = -321 down to Airport spine at Z = -441 (length: 120m)
  const accessRoadSouth = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 120), asphaltMat);
  accessRoadSouth.name = 'arcade_access_boulevard_south';
  accessRoadSouth.position.set(BUILDING_X, 0.08, -381);
  markWalkable(accessRoadSouth, 8);
  accessRoadSouth.userData.mapRoadSurface = true;
  accessRoadSouth.userData.permanentRoadGeometry = true;
  accessRoadSouth.userData.roadCriticalDetail = true;
  root.add(accessRoadSouth);

  // Dashed lane dividers along south access road
  for (let z = -436; z <= -326; z += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 3.8), createMaterial(0xffffff, 0.4, 0.1));
    dash.position.set(BUILDING_X, 0.17, z);
    dash.userData.roadCriticalDetail = true;
    root.add(dash);
  }

  // Large Arcade Forecourt & Parking Plaza (Z = -260 to -286, X = -18 to +34)
  const plazaWidth = 52;
  const plazaDepth = 26;
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(plazaWidth, 0.16, plazaDepth), asphaltMat);
  plaza.name = 'arcade_forecourt_plaza';
  plaza.position.set(BUILDING_X, 0.09, -273);
  markWalkable(plaza, 8);
  plaza.userData.mapRoadSurface = true;
  plaza.userData.permanentRoadGeometry = true;
  plaza.userData.roadCriticalDetail = true;
  root.add(plaza);

  // Concrete sidewalk apron in front of the arcade entrance (Z = -289 to -285)
  const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W + 6, 0.22, 4), concretePaveMat);
  sidewalk.name = 'arcade_entrance_sidewalk';
  sidewalk.position.set(BUILDING_X, 0.12, -287);
  markWalkable(sidewalk, 8);
  root.add(sidewalk);

  // Curb yellow boundary
  const curbL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.26, 4), curbYellowMat);
  curbL.position.set(BUILDING_X - (BUILDING_W + 6) / 2, 0.13, -287);
  const curbR = curbL.clone();
  curbR.position.x = BUILDING_X + (BUILDING_W + 6) / 2;
  root.add(curbL, curbR);

  // Parking Stalls (marked with white painted lines) located along entrance sidewalk (Z = -282)
  for (let px = -14; px <= 28; px += 4.5) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 5.0), createMaterial(0xffffff));
    line.position.set(px, 0.18, -282);
    root.add(line);
  }

  // Decorative Palm Trees & Neon Streetlamps around the Forecourt
  const lampPositions = [
    [-15, -266],
    [31, -266],
    [-15, -280],
    [31, -280],
  ];
  lampPositions.forEach(([lx, lz], idx) => {
    const lamp = new THREE.Group();
    lamp.position.set(lx, 0, lz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 6.5, 8), metalFrameMat);
    pole.position.y = 3.25;
    markSolid(pole, 0.05);

    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.6), metalFrameMat);
    head.position.y = 6.4;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), idx % 2 === 0 ? neonPinkMat : neonCyanMat);
    bulb.position.y = 6.2;
    lamp.add(pole, head, bulb);
    root.add(lamp);

    // Decorative planter with stylized city tree
    const planter = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.0, 0.65, 12), concretePaveMat);
    planter.position.set(lx - 2.5, 0.32, lz);
    markSolid(planter);
    const tree = createStylizedCityTreeModel(1.1);
    tree.position.set(lx - 2.5, 0.65, lz);
    root.add(planter, tree);
  });

  // -------------------------------------------------------------------------
  // 2. ROADSIDE MONUMENT SIGN ("PIXEL PARADISE ARCADE")
  // -------------------------------------------------------------------------
  const monument = new THREE.Group();
  monument.position.set(BUILDING_X - 18, 0, -262);
  monument.rotation.y = -Math.PI / 6;

  const monBase = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.2, 1.2), concretePaveMat);
  monBase.position.y = 0.6;
  markSolid(monBase);

  const monPillar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 7.5, 0.8), createMaterial(0x1e1b2e));
  monPillar.position.y = 4.8;
  markSolid(monPillar);

  // Glowing Marquee Billboard
  const monSignMat = new THREE.MeshBasicMaterial({
    map: createArcadeLabelTexture('PIXEL PARADISE', 4.4, 2.2, '#00f0ff', '#2d0a4e', '★ RETRO ARCADE & MINI-GAMES ★', '#ff007f'),
    toneMapped: false,
  });
  const monSignFront = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), monSignMat);
  monSignFront.position.set(0, 5.8, 0.42);
  const monSignBack = monSignFront.clone();
  monSignBack.rotation.y = Math.PI;
  monSignBack.position.z = -0.42;

  // Flashing Star Topper
  const starTopper = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), neonGoldMat);
  starTopper.position.y = 9.0;

  monument.add(monBase, monPillar, monSignFront, monSignBack, starTopper);
  root.add(monument);

  // -------------------------------------------------------------------------
  // 3. ARCADE BUILDING EXTERIOR STRUCTURE
  // -------------------------------------------------------------------------
  const bldgGroup = new THREE.Group();
  bldgGroup.name = 'arcade_building_structure';
  bldgGroup.position.set(BUILDING_X, 0, BUILDING_Z);
  bldgGroup.rotation.y = Math.PI;

  const halfW = BUILDING_W / 2; // 19
  const halfD = BUILDING_D / 2; // 16

  // Floor Slab
  const floor = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W - 0.4, 0.22, BUILDING_D - 0.4), carpetMat);
  floor.name = 'arcade_interior_floor';
  floor.position.y = 0.11;
  markWalkable(floor, 8);
  bldgGroup.add(floor);

  // Landable Roof Slab
  const roof = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W + 1.2, 0.45, BUILDING_D + 1.2), exteriorWallMat);
  roof.name = 'arcade_rooftop_slab';
  roof.position.y = BUILDING_H;
  roof.userData.landableRoof = true;
  markWalkable(roof, 9);
  bldgGroup.add(roof);

  // Roof Parapet / Guardrails
  const roofRailMat = createMaterial(0x4b5563, 0.4, 0.7);
  const roofRailFront = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W + 1.2, 0.9, 0.35), roofRailMat);
  roofRailFront.position.set(0, BUILDING_H + 0.45, -halfD - 0.5);
  const roofRailBack = roofRailFront.clone();
  roofRailBack.position.z = halfD + 0.5;
  const roofRailLeft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, BUILDING_D + 1.2), roofRailMat);
  roofRailLeft.position.set(-halfW - 0.5, BUILDING_H + 0.45, 0);
  const roofRailRight = roofRailLeft.clone();
  roofRailRight.position.x = halfW + 0.5;
  for (const r of [roofRailFront, roofRailBack, roofRailLeft, roofRailRight]) markSolid(r);
  bldgGroup.add(roofRailFront, roofRailBack, roofRailLeft, roofRailRight);

  // Rooftop HVAC units & Antenna
  const hvac1 = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 2.5), metalFrameMat);
  hvac1.position.set(-6, BUILDING_H + 0.9, 0);
  const hvac2 = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.0, 3.0), metalFrameMat);
  hvac2.position.set(8, BUILDING_H + 1.0, 4);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.2, 0.4, 16), metalFrameMat);
  dish.rotation.x = Math.PI / 4;
  dish.position.set(0, BUILDING_H + 1.8, -4);
  markSolid(hvac1);
  markSolid(hvac2);
  bldgGroup.add(hvac1, hvac2, dish);

  // Exterior Walls (Solid box geometry with real openings)
  // Back Wall (South, Z = +halfD)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W, BUILDING_H, 0.6), exteriorWallMat);
  backWall.position.set(0, BUILDING_H / 2, halfD);
  markSolid(backWall);
  bldgGroup.add(backWall);

  // Left Wall (West, X = -halfW)
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, BUILDING_H, BUILDING_D), exteriorWallMat);
  leftWall.position.set(-halfW, BUILDING_H / 2, 0);
  markSolid(leftWall);
  bldgGroup.add(leftWall);

  // Right Wall (East, X = +halfW)
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, BUILDING_H, BUILDING_D), exteriorWallMat);
  rightWall.position.set(halfW, BUILDING_H / 2, 0);
  markSolid(rightWall);
  bldgGroup.add(rightWall);

  // Front Wall (North, Z = -halfD)
  // Leaves 6.4m central opening for entrance doors (X: -3.2 to +3.2)
  const doorWidth = 6.4;
  const sideWallWidth = (BUILDING_W - doorWidth) / 2; // 15.8m on each side
  const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(sideWallWidth, BUILDING_H, 0.6), exteriorWallMat);
  frontLeft.position.set(-halfW + sideWallWidth / 2, BUILDING_H / 2, -halfD);
  markSolid(frontLeft);

  const frontRight = new THREE.Mesh(new THREE.BoxGeometry(sideWallWidth, BUILDING_H, 0.6), exteriorWallMat);
  frontRight.position.set(halfW - sideWallWidth / 2, BUILDING_H / 2, -halfD);
  markSolid(frontRight);

  // Entrance Door Header
  const doorHeaderH = BUILDING_H - 4.2; // 2.6m header
  const frontHeader = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeaderH, 0.6), exteriorWallMat);
  frontHeader.position.set(0, 4.2 + doorHeaderH / 2, -halfD);
  markSolid(frontHeader);

  bldgGroup.add(frontLeft, frontRight, frontHeader);

  // Front Display Windows (Cutout glass panels on front left and right walls)
  const windowLeft = new THREE.Mesh(new THREE.PlaneGeometry(10.0, 3.4), glassMat);
  windowLeft.position.set(-8.5, 2.5, -halfD - 0.32);
  const windowRight = windowLeft.clone();
  windowRight.position.x = 8.5;
  bldgGroup.add(windowLeft, windowRight);

  // Giant Main Marquee Exterior Sign: "PIXEL PARADISE ARCADE"
  const marqueeWidth = 24;
  const marqueeHeight = 3.2;
  const mainSignTex = createArcadeLabelTexture(
    'PIXEL PARADISE ARCADE',
    marqueeWidth,
    marqueeHeight,
    '#00f0ff',
    '#170329',
    '★ RETRO COIN-OP • MINI-GAMES • REDLINE RUSH ★',
    '#ff007f'
  );
  const marqueeSignMat = new THREE.MeshBasicMaterial({ map: mainSignTex, toneMapped: false });
  const marqueeSign = new THREE.Mesh(new THREE.BoxGeometry(marqueeWidth, marqueeHeight, 0.5), marqueeSignMat);
  marqueeSign.position.set(0, 5.2, -halfD - 0.4);
  bldgGroup.add(marqueeSign);

  // Neon Portico Canopy over entrance
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 2.4, 0.4, 3.2), createMaterial(0x1e1b2e));
  canopy.position.set(0, 4.3, -halfD - 1.6);
  markSolid(canopy);
  const canopyNeon = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 2.5, 0.12, 3.3), neonPinkMat);
  canopyNeon.position.set(0, 4.15, -halfD - 1.6);
  bldgGroup.add(canopy, canopyNeon);

  // Exterior Wall Posters
  const posterSpecs = [
    { title: 'REDLINE RUSH', sub: 'DUAL COCKPIT SIM', x: -14, col: '#ef4444' },
    { title: 'RETRO HIT & RUN', sub: '8-BIT HIGHWAY', x: -5, col: '#eab308' },
    { title: 'GALAXY DEFENDER', sub: 'SPACE COMBAT 1983', x: 5, col: '#06b6d4' },
    { title: 'CYBER PUNCHOUT', sub: 'CHAMPIONSHIP RING', x: 14, col: '#f59e0b' },
  ];
  posterSpecs.forEach((spec) => {
    const posterMat = new THREE.MeshBasicMaterial({
      map: createArcadeLabelTexture(spec.title, 2.0, 3.0, spec.col, '#0d071d', spec.sub, spec.col),
      toneMapped: false,
    });
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), posterMat);
    poster.position.set(spec.x, 2.6, -halfD - 0.32);
    bldgGroup.add(poster);
  });

  // -------------------------------------------------------------------------
  // 4. ENTRANCE AUTOMATIC GLASS SLIDING DOOR
  // -------------------------------------------------------------------------
  const entranceDoor = new Door({
    id: 'pixel_paradise_arcade_entrance_door',
    name: 'Pixel Paradise Arcade Main Entrance',
    houseName: 'Pixel Paradise Arcade',
    type: 'double_slide',
    width: doorWidth,
    height: 4.2,
    worldPos: new THREE.Vector3(BUILDING_X, 0, FRONT_Z + 0.05),
    rotationY: 0,
    frameColor: 0x2a1b4e,
    glassColor: 0x8be9fd,
    slideDistance: 2.6,
    depth: 0.20,
  });
  entranceDoor.setAutomatic(5.8, 1.25);
  doors.push(entranceDoor);
  root.add(entranceDoor.group);

  // -------------------------------------------------------------------------
  // 5. INTERIOR ARCHITECTURE & DECORATION
  // -------------------------------------------------------------------------
  // Ceiling with exposed steel trusses & neon geometric chandeliers
  for (let z = -halfD + 4; z <= halfD - 4; z += 6) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W - 1.2, 0.25, 0.45), metalFrameMat);
    truss.position.set(0, BUILDING_H - 0.3, z);
    bldgGroup.add(truss);

    // Hanging Neon Hexagon / Ring
    const neonRing = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.06, 8, 24), z % 12 === 0 ? neonPinkMat : neonCyanMat);
    neonRing.rotation.x = Math.PI / 2;
    neonRing.position.set(0, BUILDING_H - 1.2, z);
    bldgGroup.add(neonRing);
  }

  // -------------------------------------------------------------------------
  // 6. ZONE 4: PRIZE COUNTER & TOKEN REDEMPTION (Front-Right, X: 12 to 17, Z: -12 to -14)
  // -------------------------------------------------------------------------
  const counterGroup = new THREE.Group();
  counterGroup.position.set(13.5, 0, -11.5);

  const counterDesk = new THREE.Mesh(new THREE.BoxGeometry(7.0, 1.1, 1.2), createMaterial(0x3730a3, 0.4, 0.2));
  counterDesk.position.set(0, 0.55, 0);
  markSolid(counterDesk);

  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.12, 1.4), createMaterial(0xf3f4f6, 0.2, 0.8));
  counterTop.position.set(0, 1.15, 0);
  counterGroup.add(counterDesk, counterTop);

  // Prize Showcase Shelves Behind Counter
  const shelfBack = new THREE.Mesh(new THREE.BoxGeometry(7.0, 3.2, 0.6), createMaterial(0x1e1b4b));
  shelfBack.position.set(0, 2.2, -2.4);
  markSolid(shelfBack);
  counterGroup.add(shelfBack);

  // Giant Plushies on shelves
  const plush1 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), createMaterial(0xfacc15)); // Pikachu yellow
  plush1.position.set(-1.8, 1.8, -2.0);
  const plush2 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.2, 12, 20), createMaterial(0xf472b6)); // Donut pink
  plush2.position.set(0, 1.8, -2.0);
  const plush3 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), createMaterial(0x38bdf8)); // Snorlax / blue plush
  plush3.position.set(1.8, 1.8, -2.0);
  counterGroup.add(plush1, plush2, plush3);

  // "TICKETS & PRIZES" Overhead Sign
  const prizeSignTex = createArcadeLabelTexture('TICKETS & PRIZES', 5.0, 1.2, '#fde047', '#311042', '★ REDEEM TICKETS HERE ★', '#a855f7');
  const prizeSign = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.2, 0.2), new THREE.MeshBasicMaterial({ map: prizeSignTex, toneMapped: false }));
  prizeSign.position.set(0, 3.6, -1.2);
  counterGroup.add(prizeSign);

  bldgGroup.add(counterGroup);

  // -------------------------------------------------------------------------
  // 7. ZONE 5: ARCADE LOUNGE & SEATING (Front-Left, X: -13.5, Z: -11.5)
  // -------------------------------------------------------------------------
  const loungeGroup = new THREE.Group();
  loungeGroup.position.set(-13.5, 0, -11.5);

  const boothTable = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.6), createMaterial(0x111827));
  boothTable.position.set(0, 0.45, 0);
  const benchL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.8), createMaterial(0xdc2626)); // Red vinyl
  benchL.position.set(0, 0.3, -1.4);
  const benchR = benchL.clone();
  benchR.position.set(0, 0.3, 1.4);
  markSolid(boothTable);
  markSolid(benchL);
  markSolid(benchR);
  loungeGroup.add(boothTable, benchL, benchR);

  // Snack / Soda Machines
  const sodaMachine = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.2), createMaterial(0xb91c1c));
  sodaMachine.position.set(-3.5, 1.2, 0);
  markSolid(sodaMachine);
  loungeGroup.add(sodaMachine);

  bldgGroup.add(loungeGroup);

  // -------------------------------------------------------------------------
  // 8. MODULAR ARCADE CABINET SYSTEM
  // Custom 3D builders for upright cabinets and twin-cockpit racing rigs!
  // -------------------------------------------------------------------------
  const buildUprightCabinetMesh = (
    title: string,
    subtitle: string,
    bodyColor: number,
    screenGlowColor: number,
    accentColor: string
  ): THREE.Group => {
    const cab = new THREE.Group();

    const bodyMat = createMaterial(bodyColor, 0.4, 0.2);
    const darkInteriorMat = createMaterial(0x0f172a);
    const marqueeTex = createArcadeLabelTexture(title, 2.0, 0.8, '#ffffff', '#090514', subtitle, accentColor);
    const marqueeMat = new THREE.MeshBasicMaterial({ map: marqueeTex, toneMapped: false });

    // Main angled side panels
    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 1.2), bodyMat);
    leftSide.position.set(-0.54, 1.15, 0);
    const rightSide = leftSide.clone();
    rightSide.position.x = 0.54;
    markSolid(leftSide, 0.02);
    markSolid(rightSide, 0.02);

    // Back Panel
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.3, 0.08), darkInteriorMat);
    back.position.set(0, 1.15, -0.56);
    markSolid(back, 0.02);

    // Lower Coin Door
    const coinDoor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.08), createMaterial(0x1e293b, 0.3, 0.8));
    coinDoor.position.set(0, 0.45, 0.5);
    markSolid(coinDoor, 0.02);

    // Control Panel (Angled surface with joysticks & buttons)
    const controlDeck = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.15, 0.55), createMaterial(0x0f172a));
    controlDeck.position.set(0, 0.95, 0.42);
    controlDeck.rotation.x = 0.15;
    markSolid(controlDeck, 0.02);

    // Joysticks & Buttons
    const stickShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), metalFrameMat);
    stickShaft.position.set(-0.25, 1.08, 0.42);
    const stickBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), neonPinkMat);
    stickBall.position.set(-0.25, 1.16, 0.42);
    cab.add(stickShaft, stickBall);

    // Buttons
    for (let b = 0; b < 4; b++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), b % 2 === 0 ? neonCyanMat : neonGoldMat);
      btn.position.set(0.1 + (b % 2) * 0.12, 1.04, 0.36 + Math.floor(b / 2) * 0.1);
      cab.add(btn);
    }

    // Angled CRT Screen Bezel
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.75, 0.1), createMaterial(0x0a0a0a));
    bezel.position.set(0, 1.48, 0.18);
    bezel.rotation.x = -0.25;

    // Glowing CRT Display (Attract Screen)
    const crtScreenMat = new THREE.MeshBasicMaterial({
      map: createArcadeLabelTexture(title, 1.6, 1.2, '#ffffff', '#05020c', 'INSERT COIN', accentColor),
      toneMapped: false,
    });
    const crtScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.65), crtScreenMat);
    crtScreen.position.set(0, 1.48, 0.24);
    crtScreen.rotation.x = -0.25;

    // Top Illuminated Marquee
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.15), marqueeMat);
    marquee.position.set(0, 2.05, 0.38);

    cab.add(leftSide, rightSide, back, coinDoor, controlDeck, bezel, crtScreen, marquee);
    return cab;
  };

  const buildCockpitRacingRigMesh = (
    title: string,
    isDual: boolean,
    bodyColor: number,
    accentColor: string
  ): THREE.Group => {
    const rig = new THREE.Group();

    const bodyMat = createMaterial(bodyColor, 0.3, 0.3);
    const carbonMat = createMaterial(0x18181b, 0.6, 0.4);
    const seatRedMat = createMaterial(0xdc2626, 0.5, 0.2);

    const rigWidth = isDual ? 2.4 : 1.3;

    // Base Chassis
    const base = new THREE.Mesh(new THREE.BoxGeometry(rigWidth, 0.35, 2.5), carbonMat);
    base.position.set(0, 0.18, 0);
    markSolid(base, 0.05);

    // Front Dashboard & Display Console
    const dashConsole = new THREE.Mesh(new THREE.BoxGeometry(rigWidth, 1.4, 0.8), bodyMat);
    dashConsole.position.set(0, 0.9, -0.8);
    markSolid(dashConsole, 0.05);

    // Dual Dashboard Screens
    const screenCount = isDual ? 2 : 1;
    const xOffsets = isDual ? [-0.58, 0.58] : [0];

    xOffsets.forEach((ox) => {
      // Screen
      const screenTex = createArcadeLabelTexture(title, 1.4, 0.9, '#ef4444', '#1c0404', 'REDLINE RUSH SIM', '#f59e0b');
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
      screen.position.set(ox, 1.25, -0.38);
      screen.rotation.x = -0.2;

      // Steering Wheel
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 20), metalFrameMat);
      wheel.position.set(ox, 0.95, -0.32);
      wheel.rotation.x = Math.PI / 3.5;

      // Racing Bucket Seat
      const seatBottom = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.28, 0.65), seatRedMat);
      seatBottom.position.set(ox, 0.45, 0.55);
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.2), seatRedMat);
      seatBack.position.set(ox, 0.95, 0.85);
      seatBack.rotation.x = -0.15;
      markSolid(seatBottom);
      markSolid(seatBack);

      rig.add(screen, wheel, seatBottom, seatBack);
    });

    // Overhead Rig Marquee
    const marqueeTex = createArcadeLabelTexture(title, 2.6, 0.7, '#ff3333', '#110202', 'DUAL RACING SIMULATOR', accentColor);
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(rigWidth + 0.2, 0.4, 0.3), new THREE.MeshBasicMaterial({ map: marqueeTex, toneMapped: false }));
    marquee.position.set(0, 2.1, -0.8);

    const pillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), metalFrameMat);
    pillarL.position.set(-rigWidth / 2 + 0.1, 1.7, -0.8);
    const pillarR = pillarL.clone();
    pillarR.position.x = rigWidth / 2 - 0.1;

    rig.add(base, dashConsole, marquee, pillarL, pillarR);
    return rig;
  };

  // -------------------------------------------------------------------------
  // 9. AUTHORING THE CABINET PLACEMENTS IN THE INTERIOR
  // Zone 1: Speedway Simulators (Left Wing, facing East +X towards aisle)
  // Zone 2: Action & Sci-Fi (Right Wing, facing West -X towards aisle)
  // Zone 3: Championship Showcase (Center-Back, facing North -Z)
  // -------------------------------------------------------------------------
  interface CabinetPlacement {
    id: string;
    name: string;
    gameId: string;
    type: 'cockpit_twin' | 'upright';
    localX: number;
    localZ: number;
    rotY: number;
    color: number;
    glow: number;
    accent: string;
    sub: string;
  }

  const cabinetConfigs: CabinetPlacement[] = [
    // LEFT WING (Facing East: rotY = Math.PI / 2)
    {
      id: 'arcade_cab_redline_rush_twin',
      name: 'Redline Rush • Dual Cockpit Sim',
      gameId: 'redline_rush',
      type: 'cockpit_twin',
      localX: -11.0,
      localZ: -4.0,
      rotY: Math.PI / 2,
      color: 0xdc2626,
      glow: 0xff0000,
      accent: '#ef4444',
      sub: 'DUAL RACER',
    },
    {
      id: 'arcade_cab_retro_hit_run_1',
      name: 'Retro Hit & Run 8-Bit',
      gameId: 'retro_hit_and_run',
      type: 'upright',
      localX: -11.0,
      localZ: 1.5,
      rotY: Math.PI / 2,
      color: 0xeab308,
      glow: 0xfacc15,
      accent: '#eab308',
      sub: '8-BIT RACER',
    },
    {
      id: 'arcade_cab_turbo_highway',
      name: 'Turbo Highway 8-Bit',
      gameId: 'retro_hit_and_run',
      type: 'upright',
      localX: -11.0,
      localZ: 5.0,
      rotY: Math.PI / 2,
      color: 0xf97316,
      glow: 0xf97316,
      accent: '#f97316',
      sub: 'OUTRUN PURSUIT',
    },
    {
      id: 'arcade_cab_modular_expansion',
      name: 'Custom Sim Expansion Port',
      gameId: 'custom_modular_expansion',
      type: 'upright',
      localX: -11.0,
      localZ: 8.5,
      rotY: Math.PI / 2,
      color: 0x9333ea,
      glow: 0xa855f7,
      accent: '#a855f7',
      sub: 'IMPORT PORT',
    },

    // RIGHT WING (Facing West: rotY = -Math.PI / 2)
    {
      id: 'arcade_cab_galaxy_defender_1',
      name: 'Galaxy Defender (1983)',
      gameId: 'galaxy_defender',
      type: 'upright',
      localX: 11.0,
      localZ: -4.0,
      rotY: -Math.PI / 2,
      color: 0x0284c7,
      glow: 0x38bdf8,
      accent: '#06b6d4',
      sub: 'SPACE SHOOTER',
    },
    {
      id: 'arcade_cab_cyber_punchout_1',
      name: 'Cyber Punchout: Ring Masters',
      gameId: 'cyber_punchout',
      type: 'upright',
      localX: 11.0,
      localZ: 1.5,
      rotY: -Math.PI / 2,
      color: 0xd97706,
      glow: 0xfbbf24,
      accent: '#f59e0b',
      sub: 'BRAWLER / BOXING',
    },
    {
      id: 'arcade_cab_retro_hit_run_tour',
      name: 'Hit & Run: Springfield Tour',
      gameId: 'retro_hit_and_run',
      type: 'upright',
      localX: 11.0,
      localZ: 5.0,
      rotY: -Math.PI / 2,
      color: 0x16a34a,
      glow: 0x4ade80,
      accent: '#10b981',
      sub: 'CITY PURSUIT',
    },
    {
      id: 'arcade_cab_galaxy_defender_2',
      name: 'Galaxy Defender II: Super Nova',
      gameId: 'galaxy_defender',
      type: 'upright',
      localX: 11.0,
      localZ: 8.5,
      rotY: -Math.PI / 2,
      color: 0x4f46e5,
      glow: 0x818cf8,
      accent: '#6366f1',
      sub: 'SPACE SHOOTER II',
    },

    // BACK CENTER FEATURE ROW (Facing South / turned around 180 degrees: rotY = Math.PI)
    {
      id: 'arcade_cab_redline_rush_champ',
      name: 'Redline Rush • Championship Edition',
      gameId: 'redline_rush',
      type: 'cockpit_twin',
      localX: -3.2,
      localZ: 11.5,
      rotY: Math.PI,
      color: 0xb91c1c,
      glow: 0xef4444,
      accent: '#ef4444',
      sub: 'PRO COCKPIT',
    },
    {
      id: 'arcade_cab_cyber_punchout_champ',
      name: 'Cyber Punchout • Title Match',
      gameId: 'cyber_punchout',
      type: 'upright',
      localX: 3.2,
      localZ: 11.5,
      rotY: Math.PI,
      color: 0xb45309,
      glow: 0xf59e0b,
      accent: '#f59e0b',
      sub: 'TITLE FIGHT',
    },
  ];

  cabinetConfigs.forEach((cfg) => {
    let mesh: THREE.Group;
    if (cfg.type === 'cockpit_twin') {
      mesh = buildCockpitRacingRigMesh(cfg.name, true, cfg.color, cfg.accent);
    } else {
      mesh = buildUprightCabinetMesh(cfg.name, cfg.sub, cfg.color, cfg.glow, cfg.accent);
    }

    mesh.name = cfg.id;
    mesh.position.set(cfg.localX, 0, cfg.localZ);
    mesh.rotation.y = cfg.rotY;
    bldgGroup.add(mesh);

    // Calculate player interaction target position (standing in front of machine)
    const forwardOffset = cfg.type === 'cockpit_twin' ? 1.6 : 1.2;
    const targetObj = new THREE.Object3D();
    targetObj.position.set(0, 0.1, forwardOffset);
    mesh.add(targetObj);
    mesh.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    targetObj.getWorldPosition(worldPos);
    mesh.remove(targetObj);

    arcadeMachines.push({
      id: cfg.id,
      name: cfg.name,
      position: worldPos,
      gameId: cfg.gameId,
    });
  });

  root.add(bldgGroup);

  // -------------------------------------------------------------------------
  // 10. LANDMARK REGISTRATION FOR MAP & FAST TRAVEL
  // -------------------------------------------------------------------------
  landmarks.push({
    id: 'pixel_paradise_arcade',
    name: 'Pixel Paradise Arcade & Mini-Games',
    category: 'countryside',
    x: BUILDING_X,
    z: BUILDING_Z,
    icon: 'star',
    color: '#e040fb',
    travelX: BUILDING_X,
    travelZ: -281, // plaza sidewalk right outside entrance
    travelYaw: Math.PI, // facing south towards the arcade entrance
  });

  // -------------------------------------------------------------------------
  // 11. WALL COLLIDERS REGISTRATION
  // -------------------------------------------------------------------------
  // Building Outer Boundary Boxes for BUILDING_X = 8, BUILDING_Z = -305
  // Front entrance at Z = -289 (North), Back wall at Z = -321 (South)
  wallColliders.push(
    // Back Wall (South, Z = -321)
    {
      id: 'arcade_back_wall',
      minX: BUILDING_X - halfW,
      maxX: BUILDING_X + halfW,
      minZ: BUILDING_Z - halfD - 0.4,
      maxZ: BUILDING_Z - halfD + 0.4,
      collisionRole: 'fixed',
    },
    // Left Wall (West, X = -11)
    {
      id: 'arcade_left_wall',
      minX: BUILDING_X - halfW - 0.4,
      maxX: BUILDING_X - halfW + 0.4,
      minZ: BUILDING_Z - halfD,
      maxZ: BUILDING_Z + halfD,
      collisionRole: 'fixed',
    },
    // Right Wall (East, X = 27)
    {
      id: 'arcade_right_wall',
      minX: BUILDING_X + halfW - 0.4,
      maxX: BUILDING_X + halfW + 0.4,
      minZ: BUILDING_Z - halfD,
      maxZ: BUILDING_Z + halfD,
      collisionRole: 'fixed',
    },
    // Front Left Wall (leaves central entrance opening at X = 8 ± 3.2)
    {
      id: 'arcade_front_left_wall',
      minX: BUILDING_X - halfW,
      maxX: BUILDING_X - 3.2,
      minZ: BUILDING_Z + halfD - 0.4,
      maxZ: BUILDING_Z + halfD + 0.4,
      collisionRole: 'fixed',
    },
    // Front Right Wall (leaves central entrance opening at X = 8 ± 3.2)
    {
      id: 'arcade_front_right_wall',
      minX: BUILDING_X + 3.2,
      maxX: BUILDING_X + halfW,
      minZ: BUILDING_Z + halfD - 0.4,
      maxZ: BUILDING_Z + halfD + 0.4,
      collisionRole: 'fixed',
    }
  );

  return {
    group: root,
    landmarks,
    destructibles,
    doors,
    wallColliders,
    arcadeMachines,
    update: (dt: number) => {
      // Subtle pulse on neon star topper
      starTopper.rotation.y += dt * 1.5;
    },
  };
}
