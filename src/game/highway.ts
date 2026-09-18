import * as THREE from 'three';
import { createMaterial, createSurfaceMaterial, createStylizedCityTreeModel } from './models';
import { DestructibleProp, MapLandmark } from '../types';
import { Door } from './doors';

export interface HighwayBuildResult {
  group: THREE.Group;
  landmarks: MapLandmark[];
  destructibles: DestructibleProp[];
  doors: Door[];
  update: (dt: number, activePosition?: THREE.Vector3) => void;
}

export function buildConnectingHighway(): HighwayBuildResult {
  const root = new THREE.Group();
  root.name = 'connecting_interstate_highway';
  const landmarks: MapLandmark[] = [];
  const destructibles: DestructibleProp[] = [];
  const doors: Door[] = [];

  const roadMat = createSurfaceMaterial(0x30343a, 'asphalt', 0.92, 0.03, 22, 22);
  roadMat.polygonOffset = true;
  roadMat.polygonOffsetFactor = -1;
  roadMat.polygonOffsetUnits = -1;
  const roadLineYellow = createMaterial(0xffd54f, 0.5, 0.1);
  const roadLineWhite = createMaterial(0xffffff, 0.5, 0.1);
  roadLineYellow.polygonOffset = roadLineWhite.polygonOffset = true;
  roadLineYellow.polygonOffsetFactor = roadLineWhite.polygonOffsetFactor = -2;
  roadLineYellow.polygonOffsetUnits = roadLineWhite.polygonOffsetUnits = -2;
  const bridgeOrangeMat = createMaterial(0xd84315, 0.4, 0.2); // Golden Gate orange-red
  const steelCableMat = createMaterial(0xb0bec5, 0.2, 0.9);
  const guardrailMat = createSurfaceMaterial(0x90a4ae, 'metal', 0.34, 0.72, 4, 3);
  // Procedural water texture: cheap enough for the open world but visually reads
  // as moving river water instead of a giant flat blue rectangle.
  const waterCanvas = document.createElement('canvas');
  waterCanvas.width = 256;
  waterCanvas.height = 256;
  const waterCtx = waterCanvas.getContext('2d');
  if (waterCtx) {
    const gradient = waterCtx.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, '#0b78c8');
    gradient.addColorStop(0.5, '#149bd3');
    gradient.addColorStop(1, '#075a9e');
    waterCtx.fillStyle = gradient;
    waterCtx.fillRect(0, 0, 256, 256);
    waterCtx.lineWidth = 2;
    for (let y = 8; y < 256; y += 14) {
      waterCtx.strokeStyle = y % 28 === 8 ? 'rgba(210,245,255,0.38)' : 'rgba(6,71,123,0.25)';
      waterCtx.beginPath();
      for (let x = -20; x <= 276; x += 8) {
        const yy = y + Math.sin((x + y) * 0.075) * 3.2;
        if (x === -20) waterCtx.moveTo(x, yy); else waterCtx.lineTo(x, yy);
      }
      waterCtx.stroke();
    }
  }
  const waterTexture = new THREE.CanvasTexture(waterCanvas);
  waterTexture.wrapS = THREE.RepeatWrapping;
  waterTexture.wrapT = THREE.RepeatWrapping;
  waterTexture.repeat.set(5, 20);
  waterTexture.colorSpace = THREE.SRGBColorSpace;
  const riverWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0d8dcc,
    map: waterTexture,
    roughness: 0.19,
    metalness: 0.03,
    transmission: 0.12,
    thickness: 0.18,
    ior: 1.333,
    clearcoat: 0.58,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.25,
    transparent: true,
    opacity: 0.90,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const riverBankMat = createSurfaceMaterial(0x33691e, 'grass', 0.96, 0.0, 14, 18);
  // Shared materials for the matching north/south outer viaducts. Keeping both
  // bridges on the exact same material instances prevents subtle colour/roughness
  // drift between the two sides of the map.
  const outerViaductPierMat = createMaterial(0x78909c);
  const outerViaductRailMat = createSurfaceMaterial(0x8d9398, 'concrete', 0.94, 0.01, 5, 4);
  const signGreenMat = createMaterial(0x1b5e20, 0.5, 0.1);
  const whiteMat = createMaterial(0xffffff, 0.3, 0.1);
  const woodMat = createSurfaceMaterial(0x5d4037, 'wood', 0.86, 0.02, 5, 5);
  const markRoadCritical = (...meshes: THREE.Object3D[]) => {
    for (const mesh of meshes) mesh.userData.roadCriticalDetail = true;
  };

  // -------------------------------------------------------------------------
  // 1. SCENIC DIVIDING RIVER & CANYON (X: -60 to 60, Z: -220 to 220)
  // -------------------------------------------------------------------------
  const riverGroup = new THREE.Group();
  riverGroup.name = 'canyon_river';

  // River water body
  const riverMesh = new THREE.Mesh(new THREE.PlaneGeometry(120, 480), riverWaterMat);
  riverMesh.name = 'river_water_surface';
  riverMesh.rotation.x = -Math.PI / 2;
  riverMesh.position.set(0, 0.075, 0);
  riverMesh.renderOrder = 1;
  riverMesh.userData.swimmableWater = true;
  riverGroup.add(riverMesh);

  // The river banks must never overlap the flat outer bridge decks. Previously
  // each bank was one 480m-long grass box whose top sat ABOVE the asphalt at
  // Z=-170 and Z=150. Around X≈±60 that grass literally rendered over the road,
  // creating the reported green-road bug. Build the banks as segmented shore
  // strips with real openings through both outer bridge corridors instead.
  const bankZSegments: Array<[number, number]> = [
    [-240, -180], // north of northern viaduct
    [-160, 140],  // between the two outer viaduct crossings
    [160, 240],   // south of southern viaduct
  ];
  for (const bankX of [-60, 60]) {
    for (const [zMin, zMax] of bankZSegments) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(20, 0.24, zMax - zMin), riverBankMat);
      bank.position.set(bankX, 0.11, (zMin + zMax) / 2);
      bank.userData.walkable = true;
      bank.userData.walkablePriority = 3;
      riverGroup.add(bank);
    }
  }

  // User-friendly public wharf. The old first plank stopped just short of the
  // east river bank, leaving a small but nasty gap that dropped the player into
  // the water. This version deliberately overlaps the shore and reaches right to
  // the boat's boarding side, so land -> wharf -> boat is one forgiving path.
  const dock = new THREE.Group();
  dock.name = 'river_boat_dock';
  const dockZ = 55;
  const dockPlankMat = createSurfaceMaterial(0x7b5a36, 'wood', 0.88, 0.02, 4, 3);
  const dockStartX = 52.0; // overlaps the x=50 river-bank edge
  const dockSpacing = 2.7;
  const dockPlankCount = 9;
  for (let i = 0; i < dockPlankCount; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.18, 3.0), dockPlankMat);
    plank.position.set(dockStartX - i * dockSpacing, 0.20, dockZ);
    plank.userData.walkable = true;
    plank.userData.walkablePriority = 12;
    dock.add(plank);
  }
  // Broad shore apron/ramp: also gives swimmers a simple exit next to the dock
  // instead of requiring a precise jump onto a thin plank.
  const shoreApron = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.16, 6.0), dockPlankMat);
  shoreApron.position.set(51.2, 0.18, dockZ);
  shoreApron.userData.walkable = true;
  shoreApron.userData.walkablePriority = 13;
  dock.add(shoreApron);
  const swimExit = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.12, 4.2), dockPlankMat);
  swimExit.position.set(48.7, 0.12, dockZ);
  swimExit.rotation.z = -0.035;
  swimExit.userData.walkable = true;
  swimExit.userData.walkablePriority = 14;
  dock.add(swimExit);

  // Posts sit outside the walking line, never in the middle of the route.
  for (const x of [52.8, 29.6]) {
    for (const z of [53.25, 56.75]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.7, 7), createMaterial(0x5d4037));
      post.position.set(x, -0.45, z);
      post.userData.solidCollider = true;
      dock.add(post);
    }
  }
  riverGroup.add(dock);

  root.add(riverGroup);

  // -------------------------------------------------------------------------
  // 2. MAIN 4-LANE INTERSTATE HIGHWAY (Connecting X = -120 to X = 120, Z = 0)
  // -------------------------------------------------------------------------
  const highwayRoadGroup = new THREE.Group();
  highwayRoadGroup.name = 'interstate_span';

  const highwayWidth = 18;

  // Proper city approach roads. Goldenrod remains a straight city connection,
  // while Springfield uses an angled connector into the east side of the civic
  // roundabout. This removes the old straight slab that clipped the monument area.
  const makeApproach = (centerX: number, length: number) => {
    const road = new THREE.Mesh(new THREE.BoxGeometry(length, 0.15, highwayWidth), roadMat);
    road.position.set(centerX, 0.08, 0);
    road.userData.walkable = true; road.userData.walkablePriority = 7;
    highwayRoadGroup.add(road);
    for (let x = centerX - length / 2 + 5; x < centerX + length / 2 - 4; x += 9) {
      for (const z of [-4.2, 4.2]) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.035, 0.24), roadLineWhite);
        dash.position.set(x, 0.172, z); markRoadCritical(dash); highwayRoadGroup.add(dash);
      }
    }
    return road;
  };

  // The old diagonal Springfield bridge connector is deliberately gone. Springfield
  // now owns a compact T-junction whose east edge is X=-96/Z=0; this bridge ramp
  // begins exactly at that seam. No triangular wedge or hidden second road remains.

  const highwayLength = 180; // True elevated span: X = -90 to X = 90

  // DRIVEABLE HUMP BRIDGE --------------------------------------------------
  // The centre road now rises smoothly over the river instead of staying almost
  // flat at water level. A cosine-powered profile gives zero-ish slope at both
  // road joins and at the crest, so walking/driving never hits a sharp angle.
  // The centre road surface is ~6.8m above world zero, leaving over 4m of clear
  // air above the river boat's highest point.
  const bridgeHalfSpan = highwayLength / 2;
  const bridgeEdgeTop = 0.34;
  const bridgeCrestTop = 6.8;
  const bridgeThickness = 0.38;
  const bridgeSegments = 20;
  const bridgeTopAt = (x: number) => {
    const normalized = THREE.MathUtils.clamp(Math.abs(x) / bridgeHalfSpan, 0, 1);
    const arch = Math.pow(Math.cos(normalized * Math.PI * 0.5), 1.65);
    return bridgeEdgeTop + (bridgeCrestTop - bridgeEdgeTop) * arch;
  };

  const archDeckGroup = new THREE.Group();
  archDeckGroup.name = 'driveable_hump_bridge_deck';
  const barrierMat = createMaterial(0xb0bec5);
  for (let i = 0; i < bridgeSegments; i++) {
    const x0 = -bridgeHalfSpan + (i / bridgeSegments) * highwayLength;
    const x1 = -bridgeHalfSpan + ((i + 1) / bridgeSegments) * highwayLength;
    const y0 = bridgeTopAt(x0);
    const y1 = bridgeTopAt(x1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLength = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    const segment = new THREE.Group();
    segment.name = `hump_bridge_segment_${i}`;
    segment.position.set((x0 + x1) / 2, (y0 + y1) / 2 - bridgeThickness * 0.5, 0);
    segment.rotation.z = angle;

    const road = new THREE.Mesh(new THREE.BoxGeometry(segLength + 0.16, bridgeThickness, highwayWidth), roadMat);
    road.name = `hump_bridge_road_${i}`;
    road.userData.walkable = true;
    road.userData.walkablePriority = 18;
    road.userData.walkableSnapFromBelow = 1.4;
    segment.add(road);

    // Centre divider and outer rails follow each road segment, so visible geometry
    // and collision remain aligned all the way over the arch.
    const centerBarrier = new THREE.Mesh(new THREE.BoxGeometry(segLength + 0.12, 0.8, 0.6), barrierMat);
    centerBarrier.position.set(0, bridgeThickness / 2 + 0.40, 0);
    centerBarrier.userData.solidCollider = true;
    centerBarrier.userData.colliderPadding = 0;
    segment.add(centerBarrier);

    const railNorth = new THREE.Mesh(new THREE.BoxGeometry(segLength + 0.12, 1.0, 0.3), guardrailMat);
    railNorth.position.set(0, bridgeThickness / 2 + 0.50, highwayWidth / 2 - 0.2);
    railNorth.userData.solidCollider = true;
    railNorth.userData.colliderPadding = 0;
    const railSouth = railNorth.clone();
    railSouth.position.z = -highwayWidth / 2 + 0.2;
    railSouth.userData.solidCollider = true;
    railSouth.userData.colliderPadding = 0;
    segment.add(railNorth, railSouth);

    // Lane markings are children of the sloped segment, preventing floating or
    // z-fighting stripes when the road rises.
    for (const z of [-4.2, 4.2]) {
      if (i % 2 === 0) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(segLength * 0.58, 0.045, 0.24), roadLineWhite);
        dash.position.set(0, bridgeThickness / 2 + 0.035, z);
        markRoadCritical(dash);
        segment.add(dash);
      }
    }
    for (const z of [-0.62, 0.62]) {
      const yellow = new THREE.Mesh(new THREE.BoxGeometry(segLength + 0.10, 0.045, 0.19), roadLineYellow);
      yellow.position.set(0, bridgeThickness / 2 + 0.038, z);
      markRoadCritical(yellow);
      segment.add(yellow);
    }

    archDeckGroup.add(segment);
  }
  highwayRoadGroup.add(archDeckGroup);

  // Smooth land-side ramps from normal street height to the elevated span. The
  // Springfield (west) ramp begins exactly at the compact T-junction east edge X=-96.
  // Goldenrod keeps its existing 24m approach.
  const connectorTopOuter = 0.16;
  const addArchConnector = (side: -1 | 1) => {
    const innerX = side * bridgeHalfSpan;
    const connectorLength = side === -1 ? 6 : 24;
    const outerX = side * (bridgeHalfSpan + connectorLength);
    const innerTop = bridgeTopAt(innerX);
    const outerTop = connectorTopOuter;
    const dx = innerX - outerX;
    const dy = innerTop - outerTop;
    // West/Springfield uses an exact edge-to-edge seam with the compact T-junction.
    // Keep the tiny legacy overlap only on Goldenrod's existing approach.
    const len = Math.hypot(dx, dy) + (side === -1 ? 0 : 0.3);
    const angle = Math.atan2(dy, dx);
    const connector = new THREE.Group();
    connector.position.set((innerX + outerX) / 2, (innerTop + outerTop) / 2 - bridgeThickness * 0.5, 0);
    connector.rotation.z = angle;
    const road = new THREE.Mesh(new THREE.BoxGeometry(len, bridgeThickness, highwayWidth), roadMat);
    road.userData.walkable = true;
    road.userData.walkablePriority = 17;
    road.userData.walkableSnapFromBelow = 1.0;
    connector.add(road);
    for (const z of [-4.2, 4.2]) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(len * 0.7, 0.04, 0.24), roadLineWhite);
      dash.position.set(0, bridgeThickness / 2 + 0.035, z);
      markRoadCritical(dash);
      connector.add(dash);
    }
    highwayRoadGroup.add(connector);
  };
  addArchConnector(-1);
  addArchConnector(1);

  // -------------------------------------------------------------------------
  // 3. SUSPENSION BRIDGE ARCHITECTURE (Two massive twin suspension towers)
  // -------------------------------------------------------------------------
  const bridgeTowersGroup = new THREE.Group();
  bridgeTowersGroup.name = 'golden_gate_suspension_towers';

  const createSuspensionTower = (xPos: number) => {
    const tower = new THREE.Group();
    tower.position.set(xPos, 0, 0);

    const towerHeight = 36;
    const legN = new THREE.Mesh(new THREE.BoxGeometry(2.4, towerHeight, 2.4), bridgeOrangeMat);
    legN.position.set(0, towerHeight / 2 - 1.5, highwayWidth / 2 + 1.2);
    const legS = new THREE.Mesh(new THREE.BoxGeometry(2.4, towerHeight, 2.4), bridgeOrangeMat);
    legS.position.set(0, towerHeight / 2 - 1.5, -highwayWidth / 2 - 1.2);

    // Cross portals/braces between tower legs
    const brace1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, highwayWidth + 4), bridgeOrangeMat);
    brace1.position.set(0, 12, 0);
    const brace2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, highwayWidth + 4), bridgeOrangeMat);
    brace2.position.set(0, 22, 0);
    const brace3 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, highwayWidth + 4), bridgeOrangeMat);
    brace3.position.set(0, 33, 0);

    // X-trusses
    const diag1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, highwayWidth, 4), bridgeOrangeMat);
    diag1.position.set(0, 17, 0);
    diag1.rotation.x = Math.PI / 4;
    const diag2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, highwayWidth, 4), bridgeOrangeMat);
    diag2.position.set(0, 17, 0);
    diag2.rotation.x = -Math.PI / 4;

    legN.userData.solidCollider = true;
    legS.userData.solidCollider = true;
    tower.add(legN, legS, brace1, brace2, brace3, diag1, diag2);
    return tower;
  };

  const towerWest = createSuspensionTower(-45);
  const towerEast = createSuspensionTower(45);
  bridgeTowersGroup.add(towerWest, towerEast);

  // Main suspension cables (Catenary curve approximation using segments)
  const cableSteps = 24;
  const cableNGroup = new THREE.Group();
  const cableSGroup = new THREE.Group();

  for (let i = 0; i < cableSteps; i++) {
    const t1 = i / cableSteps;
    const t2 = (i + 1) / cableSteps;
    const x1 = -45 + t1 * 90;
    const x2 = -45 + t2 * 90;
    // Catenary sag equation
    // Keep the suspension cable comfortably above the new raised road crest.
    const y1 = 33 - (1 - Math.pow(Math.abs(t1 - 0.5) * 2, 2)) * 18;
    const y2 = 33 - (1 - Math.pow(Math.abs(t2 - 0.5) * 2, 2)) * 18;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const segLen = Math.hypot(dx, dy);
    const segGeo = new THREE.CylinderGeometry(0.12, 0.12, segLen, 6);

    const segN = new THREE.Mesh(segGeo, steelCableMat);
    segN.position.set((x1 + x2) / 2, (y1 + y2) / 2, highwayWidth / 2 + 1.2);
    segN.rotation.z = Math.atan2(dx, dy) - Math.PI / 2;
    cableNGroup.add(segN);

    const segS = new THREE.Mesh(segGeo, steelCableMat);
    segS.position.set((x1 + x2) / 2, (y1 + y2) / 2, -highwayWidth / 2 - 1.2);
    segS.rotation.z = Math.atan2(dx, dy) - Math.PI / 2;
    cableSGroup.add(segS);

    // Vertical suspender cables down to highway deck
    if (i % 2 === 0 && i > 0 && i < cableSteps) {
      const suspX = (x1 + x2) / 2;
      const deckY = bridgeTopAt(suspX) + 0.65;
      const cableY = (y1 + y2) / 2;
      const suspHeight = Math.max(0.8, cableY - deckY);
      const suspGeo = new THREE.CylinderGeometry(0.04, 0.04, suspHeight, 4);

      const suspN = new THREE.Mesh(suspGeo, steelCableMat);
      suspN.position.set(suspX, deckY + suspHeight / 2, highwayWidth / 2 + 1.2);
      cableNGroup.add(suspN);

      const suspS = new THREE.Mesh(suspGeo, steelCableMat);
      suspS.position.set(suspX, deckY + suspHeight / 2, -highwayWidth / 2 - 1.2);
      cableSGroup.add(suspS);
    }
  }

  bridgeTowersGroup.add(cableNGroup, cableSGroup);
  highwayRoadGroup.add(bridgeTowersGroup);

  // -------------------------------------------------------------------------
  // 4. OVERHEAD HIGHWAY DIRECTIONAL SIGNS
  // -------------------------------------------------------------------------
  const addOverheadGantry = (xPos: number, isWestbound: boolean) => {
    const gantry = new THREE.Group();
    gantry.position.set(xPos, 0, 0);

    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 7.5, 6), createMaterial(0x78909c));
    postL.position.set(0, 3.75, highwayWidth / 2 + 0.8);
    const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 7.5, 6), createMaterial(0x78909c));
    postR.position.set(0, 3.75, -highwayWidth / 2 - 0.8);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, highwayWidth + 3), createMaterial(0x78909c));
    beam.position.set(0, 7.2, 0);

    // Green Interstate Signboard
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 12), signGreenMat);
    signBoard.position.set(0, 7.2, 0);
    const signTrim = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.35, 12.15), whiteMat);
    signTrim.position.set(0, 7.2, 0);

    postL.userData.solidCollider = true;
    postR.userData.solidCollider = true;
    gantry.add(postL, postR, beam, signTrim, signBoard);
    return gantry;
  };

  const gantryWest = addOverheadGantry(-75, true);
  const gantryEast = addOverheadGantry(75, false);
  highwayRoadGroup.add(gantryWest, gantryEast);

  // UPDATE 3: roads, lane markings, bridge deck and permanent highway kerbs are
  // fixed world geometry. Explicitly protect the whole hierarchy from any generic
  // interactive/destructible physics registration.
  highwayRoadGroup.traverse((obj) => {
    obj.userData.permanentRoadGeometry = true;
    obj.userData.interactivePhysicsObject = false;
    if (obj instanceof THREE.Mesh && obj.material === roadMat) obj.userData.mapRoadSurface = true;
  });
  root.add(highwayRoadGroup);

  // -------------------------------------------------------------------------
  // 5. NORTHERN HIGHWAY LOOP & VIADUCT (Z = -170, Connecting X: -130 to 130)
  // -------------------------------------------------------------------------
  const northViaductGroup = new THREE.Group();
  northViaductGroup.name = 'north_highway_viaduct';

  const viaductLength = 260;
  const viaductWidth = 14;
  const viaductDeck = new THREE.Mesh(new THREE.BoxGeometry(viaductLength, 0.16, viaductWidth), roadMat);
  viaductDeck.position.set(0, 0.08, -170);
  viaductDeck.userData.walkable = true;
  viaductDeck.userData.walkablePriority = 8;
  northViaductGroup.add(viaductDeck);

  // Viaduct concrete pillars across the river canyon
  for (let px = -80; px <= 80; px += 40) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.5, 6.0, viaductWidth + 1.0), outerViaductPierMat);
    pier.position.set(px, -2.92, -170);
    northViaductGroup.add(pier);
  }

  // Viaduct center dashed line & outer concrete guardrails
  for (let x = -120; x <= 120; x += 9) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.04, 0.24), roadLineWhite);
    stripe.position.set(x, 0.172, -170);
    markRoadCritical(stripe);
    northViaductGroup.add(stripe);
  }
  // Keep the concrete bridge-edge barriers over the actual river/canyon span only.
  // The previous rail still stretched almost the full 260m deck onto dry land and had
  // to be chopped around X≈±110. That looked artificial and could still crowd the
  // perpendicular road junctions. Both visible barrier and collision now terminate
  // close to the water, leaving the land-side approaches/intersections completely open.
  const addViaductRailRun = (
    group: THREE.Group,
    z: number,
    x1: number,
    x2: number,
    name: string
  ) => {
    const length = x2 - x1;
    if (length <= 0.05) return;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 1.0, 0.4), outerViaductRailMat);
    rail.name = name;
    rail.position.set((x1 + x2) / 2, 0.66, z);
    rail.userData.solidCollider = true;
    rail.userData.colliderPadding = 0;
    group.add(rail);
  };
  // River banks end around X=±60. An 80m half-span gives the bridge a believable
  // 20m barrier run onto each bank while keeping the X≈±110 perpendicular roads
  // more than 29m clear of the barrier ends.
  const viaductBarrierHalfSpan = 80;
  const viaductBarrierMinX = -viaductBarrierHalfSpan;
  const viaductBarrierMaxX = viaductBarrierHalfSpan;
  addViaductRailRun(
    northViaductGroup,
    -170 + viaductWidth / 2 - 0.2,
    viaductBarrierMinX,
    viaductBarrierMaxX,
    'north_viaduct_inner_concrete_barrier'
  );
  addViaductRailRun(
    northViaductGroup,
    -170 - viaductWidth / 2 + 0.2,
    viaductBarrierMinX,
    viaductBarrierMaxX,
    'north_viaduct_outer_concrete_barrier'
  );

  root.add(northViaductGroup);

  // The northern viaduct used to visually stop in the fields at x=±130. These
  // feeder roads connect it directly to Springfield Main Boulevard and Goldenrod
  // Main Avenue so the top bridge is part of the same drivable street network.
  const northFeeders = new THREE.Group();
  northFeeders.name = 'north_viaduct_city_feeders';
  const makeHorizontalFeeder = (x1:number, x2:number, z:number, width=14) => {
    const len=Math.abs(x2-x1);
    const road=new THREE.Mesh(new THREE.BoxGeometry(len,0.15,width),roadMat);
    road.position.set((x1+x2)/2,0.08,z);
    road.userData.walkable=true; road.userData.walkablePriority=8;
    northFeeders.add(road);
    for(let x=Math.min(x1,x2)+5;x<Math.max(x1,x2)-4;x+=9){
      const dash=new THREE.Mesh(new THREE.BoxGeometry(4.2,0.04,0.24),roadLineWhite);
      dash.position.set(x,0.172,z); markRoadCritical(dash); northFeeders.add(dash);
    }
    return road;
  };
  makeHorizontalFeeder(-185,-130,-170,14);
  makeHorizontalFeeder(130,200,-170,14);
  // Broad junction pads make turning from the city north-south streets onto the
  // bridge feel intentional instead of catching a tiny road edge.
  for(const x of [-185,200]){
    const junction=new THREE.Mesh(new THREE.CylinderGeometry(12,12,0.16,24),roadMat);
    junction.position.set(x,0.08,-170);
    junction.userData.walkable=true; junction.userData.walkablePriority=8;
    northFeeders.add(junction);
  }
  root.add(northFeeders);

  // -------------------------------------------------------------------------
  // 6. SOUTHERN MATCHING INTERSTATE VIADUCT (Z = 150)
  // -------------------------------------------------------------------------
  // FIX: the south crossing used to be a narrower 12m rustic stone bridge with
  // different markings, parapets and collision. Rebuild it from the northern
  // viaduct's exact proportions so both outer crossings look and drive alike.
  const southViaductGroup = new THREE.Group();
  southViaductGroup.name = 'south_highway_viaduct';

  const southViaductDeck = new THREE.Mesh(new THREE.BoxGeometry(viaductLength, 0.16, viaductWidth), roadMat);
  southViaductDeck.position.set(0, 0.08, 150);
  southViaductDeck.userData.walkable = true;
  southViaductDeck.userData.walkablePriority = 8;
  southViaductGroup.add(southViaductDeck);

  // Same pier spacing, dimensions and material as the northern viaduct.
  for (let px = -80; px <= 80; px += 40) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.5, 6.0, viaductWidth + 1.0), outerViaductPierMat);
    pier.position.set(px, -2.92, 150);
    southViaductGroup.add(pier);
  }

  // Same centre dashed marking pattern as the north bridge.
  for (let x = -120; x <= 120; x += 9) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.04, 0.24), roadLineWhite);
    stripe.position.set(x, 0.172, 150);
    markRoadCritical(stripe);
    southViaductGroup.add(stripe);
  }

  // Match the north bridge exactly: both concrete barriers live only over the
  // water/canyon span and end before the land-side perpendicular roads. There are
  // no segmented barrier remnants around the junctions and no hidden collider beyond
  // the visible concrete run.
  addViaductRailRun(
    southViaductGroup,
    150 + viaductWidth / 2 - 0.2,
    viaductBarrierMinX,
    viaductBarrierMaxX,
    'south_viaduct_outer_concrete_barrier'
  );
  addViaductRailRun(
    southViaductGroup,
    150 - viaductWidth / 2 + 0.2,
    viaductBarrierMinX,
    viaductBarrierMaxX,
    'south_viaduct_inner_concrete_barrier'
  );

  root.add(southViaductGroup);

  // Southern feeders use the same 14m road width, markings and 12m turning pads
  // as the north bridge. Their lengths differ only because the two city streets
  // meet the bridge at different world X positions.
  const southFeeders = new THREE.Group();
  southFeeders.name = 'south_viaduct_city_feeders';
  const makeSouthFeeder = (x1: number, x2: number) => {
    const len = Math.abs(x2 - x1);
    const road = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, viaductWidth), roadMat);
    road.position.set((x1 + x2) / 2, 0.08, 150);
    road.userData.walkable = true;
    road.userData.walkablePriority = 8;
    southFeeders.add(road);
    for (let x = Math.min(x1, x2) + 5; x < Math.max(x1, x2) - 4; x += 9) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.04, 0.24), roadLineWhite);
      dash.position.set(x, 0.172, 150);
      markRoadCritical(dash);
      southFeeders.add(dash);
    }
    return road;
  };
  makeSouthFeeder(-145, -130);
  // Goldenrod's north perimeter road now begins exactly at the bridge end X=130,
  // so a second highway-owned feeder/pad to X=200 would only stack duplicate asphalt.
  const southWestJunction = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.16, 24), roadMat);
  southWestJunction.position.set(-145, 0.08, 150);
  southWestJunction.userData.walkable = true;
  southWestJunction.userData.walkablePriority = 8;
  southFeeders.add(southWestJunction);
  root.add(southFeeders);

  // -------------------------------------------------------------------------
  // 7. ARTERIAL NORTH-SOUTH CONNECTOR ROADS (Outer Highway Loop)
  // -------------------------------------------------------------------------
  const arterialGroup = new THREE.Group();
  arterialGroup.name = 'highway_arterial_connectors';

  // Springfield outer arterial. The compact redesign keeps the large green verge,
  // but the user's final plan restores ONE narrow useful connection at X=-110: a
  // short 14m-wide link from the compact bridge junction (Z=9) to Evergreen's north
  // kerb (Z=53). This is intentionally just a normal road strip, not another asphalt
  // bowl, so all surrounding land remains grass.
  const westConnectorNorth = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 156), roadMat);
  westConnectorNorth.name = 'springfield_outer_arterial_north_approach';
  westConnectorNorth.position.set(-110, 0.08, -92); // Z -170 -> -14
  westConnectorNorth.userData.walkable = true;
  westConnectorNorth.userData.walkablePriority = 8;

  const westConnectorMiddle = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 44), roadMat);
  westConnectorMiddle.name = 'springfield_outer_arterial_compact_to_evergreen_link';
  westConnectorMiddle.position.set(-110, 0.08, 31); // Z 9 -> 53, exact edge seams
  westConnectorMiddle.userData.walkable = true;
  westConnectorMiddle.userData.walkablePriority = 8;

  const westConnectorSouth = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 83), roadMat);
  westConnectorSouth.name = 'springfield_outer_arterial_evergreen_local';
  westConnectorSouth.position.set(-110, 0.08, 108.5); // Z 67 -> 150
  westConnectorSouth.userData.walkable = true;
  westConnectorSouth.userData.walkablePriority = 8;
  arterialGroup.add(westConnectorNorth, westConnectorMiddle, westConnectorSouth);

  // Keep centre markings on real asphalt only, with a clean break through the
  // compact junction and Evergreen turning boxes.
  for (const [startZ, endZ] of [[-162, -20], [18, 44], [82, 142]] as const) {
    for (let z = startZ; z <= endZ; z += 10) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 4.6), roadLineYellow);
      dash.position.set(-110, 0.172, z);
      markRoadCritical(dash);
      arterialGroup.add(dash);
    }
  }

  // Give-way bars sit on the two inbound lanes of the compact four-way junction.
  // Evergreen at Z=60 is now a normal through intersection again, so the old T-only
  // give-way bar there is removed rather than floating across a continuous road.
  const compactNorthGiveWay = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.04, 0.30), roadLineWhite);
  compactNorthGiveWay.name = 'springfield_compact_bridge_north_give_way';
  compactNorthGiveWay.position.set(-106, 0.174, -18.0);
  markRoadCritical(compactNorthGiveWay);
  arterialGroup.add(compactNorthGiveWay);

  const compactSouthGiveWay = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.04, 0.30), roadLineWhite);
  compactSouthGiveWay.name = 'springfield_compact_bridge_south_give_way';
  compactSouthGiveWay.position.set(-114, 0.174, 13.0);
  markRoadCritical(compactSouthGiveWay);
  arterialGroup.add(compactSouthGiveWay);

  // Goldenrod already owns West Avenue at X=110 from Z=-150 to 150. The old
  // highway connector duplicated that entire 300m road on exactly the same plane,
  // causing Z-fighting/material swaps and duplicated markings. Keep only the 20m
  // missing link between the north bridge and the city avenue.
  const goldenrodNorthLink = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 20), roadMat);
  goldenrodNorthLink.name = 'goldenrod_north_bridge_link';
  goldenrodNorthLink.position.set(110, 0.08, -160);
  goldenrodNorthLink.userData.walkable = true;
  goldenrodNorthLink.userData.walkablePriority = 8;
  arterialGroup.add(goldenrodNorthLink);
  const goldenrodNorthLinkDash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 4.6), roadLineYellow);
  goldenrodNorthLinkDash.position.set(110, 0.172, -160);
  markRoadCritical(goldenrodNorthLinkDash);
  arterialGroup.add(goldenrodNorthLinkDash);

  // Every bridge/feeder/arterial road is permanent world geometry and every
  // lane marking is preload-critical. This keeps the rebuilt network visible
  // from driving distance and prevents road pieces ever entering prop physics.
  [northViaductGroup, northFeeders, southViaductGroup, southFeeders, arterialGroup].forEach((roadGroup) => {
    roadGroup.traverse((obj) => {
      obj.userData.permanentRoadGeometry = true;
      obj.userData.interactivePhysicsObject = false;
      if (obj instanceof THREE.Mesh && (obj.material === roadMat || obj.material === roadLineWhite || obj.material === roadLineYellow)) {
        obj.userData.roadCriticalDetail = true;
      }
      if (obj instanceof THREE.Mesh && obj.material === roadMat) obj.userData.mapRoadSurface = true;
    });
  });

  root.add(arterialGroup);

  // -------------------------------------------------------------------------
  // 8. COUNTRYSIDE FARMLAND: BIG RED BARN, SILO, WINDMILL & FIELDS
  // -------------------------------------------------------------------------
  const farmGroup = new THREE.Group();
  farmGroup.name = 'countryside_highway_features';

  // Keep the actual Red Barn composition under one transform so the visual
  // farm, its collision and its map footprint can never drift apart. The old
  // farm occupied X=12..60 / Z=70..130, which sits inside the authored river
  // water (X=-60..60 / Z=-240..240). Move the complete farmstead 180m south
  // to Z=250..310, safely beyond the river end and fully on the base grass.
  const redBarnFarmstead = new THREE.Group();
  redBarnFarmstead.name = 'countryside_farmland';
  redBarnFarmstead.position.set(0, 0, 180);
  farmGroup.add(redBarnFarmstead);

  const barnMat = createMaterial(0xb71c1c); // Deep barn red
  const barnTrimMat = createMaterial(0xffffff);
  const barnRoofMat = createMaterial(0x3e2723);
  const siloMat = createMaterial(0xe0e0e0);
  const hayMat = createMaterial(0xfbc02d);
  const woodFenceMat = createMaterial(0x6d4c41);

  // Big Classic American/Johto Red Barn (X = 35, Z = 80)
  const barn = new THREE.Group();
  barn.position.set(35, 0, 80);

  const barnWidth = 24;
  const barnDepth = 18;
  const barnHeight = 9.0;
  const barnBody = new THREE.Mesh(new THREE.BoxGeometry(barnWidth, barnHeight, barnDepth), barnMat);
  barnBody.position.y = barnHeight / 2;

  // Gambrel Barn Roof
  const barnRoof1 = new THREE.Mesh(new THREE.BoxGeometry(barnWidth + 1.2, 0.5, barnDepth + 1.0), barnRoofMat);
  barnRoof1.userData.landableRoof = true;
  barnRoof1.position.y = barnHeight + 0.25;
  const barnGable = new THREE.Mesh(new THREE.ConeGeometry(15, 6.0, 4), barnRoofMat);
  barnGable.userData.landableRoof = true;
  barnGable.rotation.y = Math.PI / 4;
  barnGable.scale.set(barnWidth / 20, 1.0, barnDepth / 16);
  barnGable.position.y = barnHeight + 3.0;

  // Barn Front Double Doors with White X-Brace
  const barnDoorL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 5.5, 0.3), woodMat);
  barnDoorL.position.set(-2.0, 2.75, barnDepth / 2 + 0.15);
  const barnDoorR = new THREE.Mesh(new THREE.BoxGeometry(3.6, 5.5, 0.3), woodMat);
  barnDoorR.position.set(2.0, 2.75, barnDepth / 2 + 0.15);
  const barnDoorFrame = new THREE.Mesh(new THREE.BoxGeometry(8.5, 6.2, 0.4), barnTrimMat);
  barnDoorFrame.position.set(0, 3.1, barnDepth / 2 + 0.1);

  // Hayloft window & hoist beam
  const loftWin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.3), barnTrimMat);
  loftWin.position.set(0, 8.5, barnDepth / 2 + 0.15);
  const hoistBeam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 2.4), woodMat);
  hoistBeam.position.set(0, 10.5, barnDepth / 2 + 1.2);

  // Hollow, usable barn interior. The previous giant red BoxGeometry became
  // invisible from inside and overlapped the decorative doors.
  const barnFloor = new THREE.Mesh(new THREE.BoxGeometry(barnWidth - 0.8, 0.22, barnDepth - 0.8), createMaterial(0x8d6e63));
  barnFloor.position.y = 0.11;
  barnFloor.userData.walkable = true;
  barnFloor.userData.walkablePriority = 8;
  const barnWallT = 0.55;
  const barnBack = new THREE.Mesh(new THREE.BoxGeometry(barnWidth, barnHeight, barnWallT), barnMat);
  barnBack.position.set(0, barnHeight / 2, -barnDepth / 2);
  const barnLeft = new THREE.Mesh(new THREE.BoxGeometry(barnWallT, barnHeight, barnDepth), barnMat);
  barnLeft.position.set(-barnWidth / 2, barnHeight / 2, 0);
  const barnRight = barnLeft.clone(); barnRight.position.x = barnWidth / 2;
  const barnFrontL = new THREE.Mesh(new THREE.BoxGeometry(8.0, barnHeight, barnWallT), barnMat);
  barnFrontL.position.set(-8.0, barnHeight / 2, barnDepth / 2);
  const barnFrontR = barnFrontL.clone(); barnFrontR.position.x = 8.0;
  const barnHeader = new THREE.Mesh(new THREE.BoxGeometry(8.0, 3.2, barnWallT), barnMat);
  barnHeader.position.set(0, 7.4, barnDepth / 2);
  for (const wall of [barnBack, barnLeft, barnRight, barnFrontL, barnFrontR, barnHeader]) {
    wall.userData.solidCollider = true;
    wall.userData.colliderPadding = 0.03;
  }
  // Hay stacks, work bench and a tiny tractor make the barn feel occupied.
  const workBench = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.0, 1.4), woodMat);
  workBench.position.set(-7.5, 0.5, -6.8); workBench.userData.solidCollider = true;
  const tractorBody = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.7, 5.4), createMaterial(0x2e7d32));
  tractorBody.position.set(5.8, 1.05, -3.4); tractorBody.userData.solidCollider = true;
  const tractorSeat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.2), createMaterial(0x212121));
  tractorSeat.position.set(5.8, 2.15, -4.3);
  for (const [x,z] of [[-7,-3],[-4,-5],[-7,2],[1,-6]] as const) {
    const hay = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.5, 2.1), hayMat);
    hay.position.set(x,0.75,z); hay.userData.solidCollider = true; barn.add(hay);
  }
  barn.add(barnFloor, barnBack, barnLeft, barnRight, barnFrontL, barnFrontR, barnHeader,
    barnRoof1, barnGable, loftWin, hoistBeam, workBench, tractorBody, tractorSeat);
  redBarnFarmstead.add(barn);

  // Grain Silo next to Barn (X = 52, Z = 80)
  const siloGroup = new THREE.Group();
  siloGroup.position.set(52, 0, 80);
  const siloCylinder = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.0, 16.0, 16), siloMat);
  siloCylinder.position.y = 8.0;
  siloCylinder.userData.solidCollider = true;
  siloCylinder.userData.colliderPadding = 0.04;
  const siloDome = new THREE.Mesh(new THREE.SphereGeometry(4.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), createMaterial(0x90a4ae));
  siloDome.position.y = 16.0;
  siloGroup.add(siloCylinder, siloDome);
  redBarnFarmstead.add(siloGroup);

  // Windmill / Wind Turbine (X = 35, Z = 115)
  const windmill = new THREE.Group();
  windmill.position.set(35, 0, 115);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.2, 16.0, 4), createMaterial(0x546e7a));
  tower.position.y = 8.0;
  tower.rotation.y = Math.PI / 4;
  const rotorHub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.8, 8), createMaterial(0x212121));
  rotorHub.rotation.x = Math.PI / 2;
  rotorHub.position.set(0, 16.0, 0.8);
  tower.userData.solidCollider = true;
  tower.userData.colliderPadding = 0.08;
  rotorHub.userData.solidCollider = true;
  windmill.add(tower, rotorHub);

  // 4 Windmill Blades
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6.5, 0.08), whiteMat);
    blade.position.set(0, 16.0, 0.9);
    blade.rotation.z = (b * Math.PI) / 2 + Math.PI / 4;
    windmill.add(blade);
  }
  redBarnFarmstead.add(windmill);

  // Rolled Hay Bales in the pastures
  const hayBaleCoords = [
    [20, 95],
    [26, 90],
    [15, 110],
    [45, 105],
    [40, 120],
  ];
  hayBaleCoords.forEach(([hx, hz]) => {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.0, 12), hayMat);
    bale.rotation.z = Math.PI / 2;
    bale.position.set(hx, 1.2, hz);
    bale.userData.solidCollider = true;
    bale.userData.colliderPadding = 0.03;
    redBarnFarmstead.add(bale);
  });

  // Post & Rail Wooden Pasture Fences around the farm
  const addFenceRow = (startX: number, startZ: number, endX: number, endZ: number) => {
    const dist = Math.hypot(endX - startX, endZ - startZ);
    const count = Math.floor(dist / 4);
    const angle = Math.atan2(endZ - startZ, endX - startX);

    for (let p = 0; p <= count; p++) {
      const px = startX + (p / count) * (endX - startX);
      const pz = startZ + (p / count) * (endZ - startZ);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), woodFenceMat);
      post.position.set(px, 0.8, pz);
      post.name = `farm_fence_post_${startX}_${startZ}_${p}`;
      post.userData.solidCollider = true;
      post.userData.colliderPadding = 0;
      redBarnFarmstead.add(post);
    }
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(dist, 0.12, 0.08), woodFenceMat);
    railTop.position.set((startX + endX) / 2, 1.2, (startZ + endZ) / 2);
    railTop.rotation.y = -angle;
    railTop.name = `farm_fence_top_${startX}_${startZ}_${endX}_${endZ}`;
    const railBot = new THREE.Mesh(new THREE.BoxGeometry(dist, 0.12, 0.08), woodFenceMat);
    railBot.position.set((startX + endX) / 2, 0.7, (startZ + endZ) / 2);
    railBot.rotation.y = -angle;
    railBot.name = `farm_fence_bottom_${startX}_${startZ}_${endX}_${endZ}`;
    railTop.userData.solidCollider = true;
    railBot.userData.solidCollider = true;
    // Visible post/rail dimensions are the collision dimensions.
    railTop.userData.colliderPadding = 0;
    railBot.userData.colliderPadding = 0;
    redBarnFarmstead.add(railTop, railBot);
  };

  addFenceRow(12, 70, 60, 70);
  addFenceRow(60, 70, 60, 130);
  addFenceRow(60, 130, 12, 130);
  addFenceRow(12, 130, 12, 70);

  // -------------------------------------------------------------------------
  // 9. ROUTE 34 POKÉMON DAY-CARE COTTAGE (X = -25, Z = 80)
  // -------------------------------------------------------------------------
  const daycareGroup = new THREE.Group();
  daycareGroup.position.set(-25, 0, 80);

  const dcBody = new THREE.Mesh(new THREE.BoxGeometry(16, 6.0, 12), createMaterial(0xfff9c4));
  dcBody.position.y = 3.0;
  const dcRoof = new THREE.Mesh(new THREE.ConeGeometry(13, 4.0, 4), createMaterial(0x1976d2));
  dcRoof.userData.landableRoof = true;
  dcRoof.rotation.y = Math.PI / 4;
  dcRoof.scale.set(1.2, 1.0, 0.95);
  dcRoof.position.y = 8.0;

  const dcSign = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 0.3), createMaterial(0x0288d1));
  dcSign.position.set(0, 4.8, 6.2);
  // Hollow daycare cottage with a real walk-in front opening.
  const dcFloor = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.2, 11.2), createMaterial(0xf0dfbd));
  dcFloor.position.y = 0.10; dcFloor.userData.walkable = true; dcFloor.userData.walkablePriority = 8;
  const dcWall = createMaterial(0xfff9c4);
  const dcBack = new THREE.Mesh(new THREE.BoxGeometry(16,6,0.5),dcWall); dcBack.position.set(0,3,-6);
  const dcLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5,6,12),dcWall); dcLeft.position.set(-8,3,0);
  const dcRight = dcLeft.clone(); dcRight.position.x=8;
  const dcFrontL = new THREE.Mesh(new THREE.BoxGeometry(6.7,6,0.5),dcWall); dcFrontL.position.set(-4.65,3,6);
  const dcFrontR = dcFrontL.clone(); dcFrontR.position.x=4.65;
  const dcHeader = new THREE.Mesh(new THREE.BoxGeometry(2.6,2.6,0.5),dcWall); dcHeader.position.set(0,4.7,6);
  for (const wall of [dcBack,dcLeft,dcRight,dcFrontL,dcFrontR,dcHeader]) wall.userData.solidCollider=true;
  const reception = new THREE.Mesh(new THREE.BoxGeometry(5.0,1.0,1.1),woodMat); reception.position.set(-3.4,0.5,-3.9); reception.userData.solidCollider=true;
  const toyBox = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.8,1.3),createMaterial(0x42a5f5)); toyBox.position.set(4.8,0.4,-3.8); toyBox.userData.solidCollider=true;
  const petBed1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,0.18,12),createMaterial(0xf48fb1)); petBed1.position.set(3.8,0.16,1.8);
  const petBed2 = petBed1.clone(); petBed2.position.set(-1.0,0.16,2.0);
  const dcCeiling = new THREE.Mesh(new THREE.BoxGeometry(15.2,0.18,11.2),createSurfaceMaterial(0xf4f0e8,'concrete',0.9,0.01,5,4));
  dcCeiling.position.set(0,4.15,0);
  daycareGroup.add(dcFloor,dcBack,dcLeft,dcRight,dcFrontL,dcFrontR,dcHeader,dcRoof,dcSign,reception,toyBox,petBed1,petBed2,dcCeiling);

  // This is a genuine walk-through pedestrian entrance, so it uses the same
  // airport-style automatic sliding-door component as every other normal building.
  // The wall slabs above already leave a real 2.6m opening; the moving panel
  // colliders therefore become the only collision across the threshold.
  const daycareDoor = new Door({
    id: 'route_34_daycare_door',
    name: 'Route 34 Day-Care Entrance',
    houseName: 'Route 34 Pokémon Day-Care',
    type: 'double_slide',
    width: 2.4,
    height: 3.2,
    worldPos: new THREE.Vector3(-25, 0, 86.03),
    frameColor: 0x1976d2,
    glassColor: 0xb2ebf2,
    depth: 0.20,
  });
  root.add(daycareDoor.group);
  doors.push(daycareDoor);

  // Daycare fenced outdoor Pokémon play paddock
  const paddockFence = new THREE.Mesh(new THREE.BoxGeometry(18, 1.1, 0.15), woodFenceMat);
  paddockFence.name = 'daycare_visible_paddock_fence';
  paddockFence.position.set(-10, 0.55, -8);
  paddockFence.userData.solidCollider = true;
  paddockFence.userData.colliderPadding = 0;
  daycareGroup.add(paddockFence);

  farmGroup.add(daycareGroup);

  // -------------------------------------------------------------------------
  // 10. SCENIC HIGHWAY BILLBOARD SIGNS
  // -------------------------------------------------------------------------
  const createBillboard = (x: number, z: number, rotationY: number, titleColor: number) => {
    const bb = new THREE.Group();
    bb.position.set(x, 0, z);
    bb.rotation.y = rotationY;

    // Steel support pillars
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 8.0, 6), createMaterial(0x455a64));
    p1.position.set(-4.5, 4.0, 0);
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 8.0, 6), createMaterial(0x455a64));
    p2.position.set(4.5, 4.0, 0);
    p1.userData.solidCollider = true;
    p2.userData.solidCollider = true;
    p1.userData.colliderPadding = 0.03;
    p2.userData.colliderPadding = 0.03;

    // Large Billboard Face
    const board = new THREE.Mesh(new THREE.BoxGeometry(12.0, 4.5, 0.4), createMaterial(titleColor));
    board.position.set(0, 8.5, 0);
    const border = new THREE.Mesh(new THREE.BoxGeometry(12.4, 4.9, 0.35), createMaterial(0x212121));
    border.position.set(0, 8.5, 0);

    // Billboard floodlights
    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.2, 0.8), createMaterial(0x78909c));
    lightBar.position.set(0, 6.1, 1.0);
    bb.add(p1, p2, border, board, lightBar);
    return bb;
  };

  // Billboard 1: Springfield Isotopes (approaching Springfield from Interstate)
  const bbSpringfield = createBillboard(-70, 15, Math.PI, 0x1565c0);
  farmGroup.add(bbSpringfield);

  // Billboard 2: Goldenrod City (approaching Goldenrod from Interstate)
  const bbGoldenrod = createBillboard(70, -15, 0, 0xd32f2f);
  farmGroup.add(bbGoldenrod);

  // Billboard 3: Duff Beer Billboard (along northern viaduct)
  const bbDuff = createBillboard(-40, -155, 0, 0xc62828);
  farmGroup.add(bbDuff);

  root.add(farmGroup);

  // -------------------------------------------------------------------------
  // 11. WESTERN VOLCANO REGION
  // Large geographic landmark in the open western green reserve. Its eastern
  // foothill stops well west of Springfield's authored street grid, so it does
  // not intersect cities, the airport, rail, highway or existing buildings.
  // -------------------------------------------------------------------------
  const volcanoRegion = new THREE.Group();
  volcanoRegion.name = 'western_volcano_region';
  volcanoRegion.position.set(-505, 0, -145);

  const volcanoHighDetail = new THREE.Group();
  volcanoHighDetail.name = 'western_volcano_high_detail';
  volcanoRegion.add(volcanoHighDetail);

  // Organic radial mountain mesh: concentric rings have independent deterministic
  // undulation so the silhouette is asymmetric and never reads as a perfect cone.
  const volcanoBaseRadius = 98;
  const craterRadius = 21;
  const volcanoHeight = 72;
  const radialRings = 16;
  const angularSegments = 64;

  // The exterior mountain and the inner crater MUST share the exact same lip.
  // Previously the mountain used a noisy inner radius while the crater wall ended
  // on a perfect circle. That left small open seams around the rim which could let
  // the player fall inside the one-sided shell and make the volcano appear to vanish.
  const volcanoRimRadius = (angle: number) =>
    craterRadius
    + Math.sin(angle * 3.0 + 0.55) * 1.75
    + Math.sin(angle * 7.0 - 0.8) * 0.82
    + Math.cos(angle * 11.0) * 0.42;
  const volcanoRimHeight = (angle: number) =>
    volcanoHeight
    + Math.sin(angle * 5.0) * 1.8
    + Math.cos(angle * 9.0) * 0.8;
  const mountainPositions: number[] = [];
  const mountainColors: number[] = [];
  const mountainIndices: number[] = [];
  const color = new THREE.Color();
  for (let ring = 0; ring <= radialRings; ring++) {
    const t = ring / radialRings;
    const baseR = craterRadius + (volcanoBaseRadius - craterRadius) * Math.pow(t, 0.92);
    for (let seg = 0; seg <= angularSegments; seg++) {
      const a = (seg / angularSegments) * Math.PI * 2;
      const ridge = Math.sin(a * 3.0 + 0.55) * 4.3 + Math.sin(a * 7.0 - 0.8) * 2.1 + Math.cos(a * 11.0) * 1.1;
      const ringWave = Math.sin(t * 19.0 + a * 4.0) * 2.0 + Math.cos(t * 11.0 - a * 5.0) * 1.2;
      const noisyRadius = baseR + ridge * (0.42 + 0.58 * t) + ringWave * (0.2 + t * 0.45);
      const r = ring === 0 ? volcanoRimRadius(a) : noisyRadius;
      const slope = volcanoHeight * Math.pow(1 - t, 1.48);
      const ridgeHeight = (Math.sin(a * 5.0 + t * 8.0) * 3.5 + Math.cos(a * 9.0 - t * 4.0) * 1.8) * (1 - t) * 0.72;
      const terrace = Math.sin(t * Math.PI * 7.0) * 1.0 * (0.25 + 0.75 * t);
      const noisyHeight = Math.max(0.12, slope + ridgeHeight + terrace);
      const y = ring === 0 ? volcanoRimHeight(a) : noisyHeight;
      mountainPositions.push(Math.cos(a) * r, y, Math.sin(a) * r);

      // Vertex colour blends dark volcanic upper slopes into scrubby brown/green
      // foothills without a square texture boundary.
      if (t < 0.32) color.set(0x383533);
      else if (t < 0.68) color.set(0x555048).lerp(new THREE.Color(0x665b47), (t - 0.32) / 0.36);
      else color.set(0x665b47).lerp(new THREE.Color(0x4f6f3d), (t - 0.68) / 0.32);
      mountainColors.push(color.r, color.g, color.b);
    }
  }
  const row = angularSegments + 1;
  for (let ring = 0; ring < radialRings; ring++) {
    for (let seg = 0; seg < angularSegments; seg++) {
      const a = ring * row + seg;
      const b = a + 1;
      const c = (ring + 1) * row + seg;
      const d = c + 1;
      mountainIndices.push(a, b, c, b, d, c);
    }
  }
  const mountainGeo = new THREE.BufferGeometry();
  mountainGeo.setAttribute('position', new THREE.Float32BufferAttribute(mountainPositions, 3));
  mountainGeo.setAttribute('color', new THREE.Float32BufferAttribute(mountainColors, 3));
  mountainGeo.setIndex(mountainIndices);
  mountainGeo.computeVertexNormals();
  mountainGeo.computeBoundingSphere();
  const mountainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0.0,
    flatShading: false,
    // Collision is fixed by the watertight shared rim below. DoubleSide is only a
    // targeted visual failsafe so a camera that clips a centimetre into the steep
    // rock face never sees the whole landmark disappear.
    side: THREE.DoubleSide,
  });
  const mountain = new THREE.Mesh(mountainGeo, mountainMat);
  mountain.name = 'western_volcano_mountain_mass';
  mountain.userData.walkable = true;
  mountain.userData.cameraTerrainSolid = true;
  mountain.userData.preserveAuthoredMaterial = true;
  mountain.userData.walkablePriority = 4;
  // If a foot lands just below the steep authored slope after a large frame, only
  // this exact visible mesh may recover it upward. This is not an invisible floor.
  mountain.userData.walkableSnapFromBelow = 8.0;
  mountain.receiveShadow = true;
  volcanoRegion.add(mountain);

  // Irregular inner crater wall slopes down to a recessed lava basin.
  const craterPositions: number[] = [];
  const craterIndices: number[] = [];
  const craterRings = 5;
  const lavaRadius = 13.8;
  for (let ring = 0; ring <= craterRings; ring++) {
    const t = ring / craterRings;
    const circularRadius = lavaRadius + (craterRadius - lavaRadius) * t;
    for (let seg = 0; seg <= angularSegments; seg++) {
      const a = (seg / angularSegments) * Math.PI * 2;
      // Blend from the clean lava basin into the SAME irregular lip used by the
      // exterior mountain. At t=1 both meshes now meet vertex-for-vertex.
      const rimOffset = volcanoRimRadius(a) - craterRadius;
      const radius = circularRadius + rimOffset * Math.pow(t, 2.15);
      const rimY = volcanoRimHeight(a);
      const y = THREE.MathUtils.lerp(46.5, rimY, Math.pow(t, 0.86));
      craterPositions.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    }
  }
  for (let ring = 0; ring < craterRings; ring++) {
    for (let seg = 0; seg < angularSegments; seg++) {
      const a = ring * row + seg, b = a + 1, c = (ring + 1) * row + seg, d = c + 1;
      craterIndices.push(a, b, c, b, d, c);
    }
  }
  const craterGeo = new THREE.BufferGeometry();
  craterGeo.setAttribute('position', new THREE.Float32BufferAttribute(craterPositions, 3));
  craterGeo.setIndex(craterIndices);
  craterGeo.computeVertexNormals();
  const craterWallMat = createSurfaceMaterial(0x2d2927, 'concrete', 0.99, 0.0, 8, 8);
  craterWallMat.side = THREE.DoubleSide;
  const craterWall = new THREE.Mesh(craterGeo, craterWallMat);
  craterWall.name = 'western_volcano_crater_wall';
  craterWall.userData.walkable = true;
  craterWall.userData.cameraTerrainSolid = true;
  craterWall.userData.walkablePriority = 5;
  craterWall.userData.walkableSnapFromBelow = 18.0;
  volcanoRegion.add(craterWall);

  // Physical crater floor sits immediately beneath the lava, so exploring the rim
  // never drops the player through the mountain onto the distant base terrain.
  const craterFloorGeo = new THREE.CircleGeometry(lavaRadius + 0.4, 48);
  craterFloorGeo.rotateX(-Math.PI / 2);
  const craterFloor = new THREE.Mesh(craterFloorGeo, createMaterial(0x241c18, 0.98, 0.0));
  craterFloor.position.y = 46.42;
  craterFloor.userData.walkable = true;
  craterFloor.userData.cameraTerrainSolid = true;
  craterFloor.userData.walkablePriority = 6;
  volcanoRegion.add(craterFloor);

  // Animated emissive lava texture. One tiny canvas texture is far cheaper than
  // a shader/particle simulation and still gives visible flow at close range.
  const lavaCanvas = document.createElement('canvas');
  lavaCanvas.width = 128; lavaCanvas.height = 128;
  const lavaCtx = lavaCanvas.getContext('2d');
  if (lavaCtx) {
    lavaCtx.fillStyle = '#d84000'; lavaCtx.fillRect(0,0,128,128);
    for (let i=0;i<95;i++) {
      const x = (i * 37) % 128;
      const y = (i * 71 + 19) % 128;
      const r = 2 + (i % 7) * 0.7;
      const grad = lavaCtx.createRadialGradient(x,y,0,x,y,r*2.2);
      grad.addColorStop(0,'rgba(255,244,120,0.95)');
      grad.addColorStop(0.45,'rgba(255,118,0,0.88)');
      grad.addColorStop(1,'rgba(120,20,0,0)');
      lavaCtx.fillStyle = grad; lavaCtx.beginPath(); lavaCtx.arc(x,y,r*2.2,0,Math.PI*2); lavaCtx.fill();
    }
  }
  const lavaTexture = new THREE.CanvasTexture(lavaCanvas);
  lavaTexture.wrapS = lavaTexture.wrapT = THREE.RepeatWrapping;
  lavaTexture.repeat.set(1.7,1.7);
  lavaTexture.colorSpace = THREE.SRGBColorSpace;
  const lavaMat = new THREE.MeshStandardMaterial({
    color: 0xff5a00, map: lavaTexture, emissive: 0xff3600, emissiveIntensity: 2.5,
    roughness: 0.42, metalness: 0.02, transparent: true, opacity: 0.98, side: THREE.DoubleSide
  });
  const lava = new THREE.Mesh(new THREE.CircleGeometry(lavaRadius, 48), lavaMat);
  lava.name = 'western_volcano_lava_pool';
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = 46.54;
  volcanoHighDetail.add(lava);
  const lavaGlow = new THREE.Mesh(
    new THREE.TorusGeometry(lavaRadius * 0.82, 0.42, 8, 42),
    new THREE.MeshBasicMaterial({color:0xff8a00, transparent:true, opacity:0.72})
  );
  lavaGlow.rotation.x = Math.PI / 2;
  lavaGlow.position.y = 46.70;
  volcanoHighDetail.add(lavaGlow);

  // Lightweight pooled lava activity ------------------------------------------------
  // The lava should look alive without allocating particles every frame. Both the
  // surface bubbles and ejected blobs are instanced meshes whose transforms are
  // recycled forever while the player is close enough to see the high-detail crater.
  const lavaBubbleCount = 10;
  const lavaBubbleMat = new THREE.MeshStandardMaterial({
    color: 0xff8a00,
    emissive: 0xff3d00,
    emissiveIntensity: 3.1,
    roughness: 0.32,
    metalness: 0.0,
  });
  const lavaBubbles = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.82, 10, 7),
    lavaBubbleMat,
    lavaBubbleCount
  );
  lavaBubbles.name = 'western_volcano_lava_bubbles';
  lavaBubbles.frustumCulled = false;
  volcanoHighDetail.add(lavaBubbles);

  const lavaDropletCount = 14;
  const lavaDropletMat = new THREE.MeshStandardMaterial({
    color: 0xff6d00,
    emissive: 0xff2400,
    emissiveIntensity: 3.5,
    roughness: 0.38,
    metalness: 0.0,
  });
  const lavaDroplets = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.62, 0),
    lavaDropletMat,
    lavaDropletCount
  );
  lavaDroplets.name = 'western_volcano_lava_ejecta';
  lavaDroplets.frustumCulled = false;
  volcanoHighDetail.add(lavaDroplets);

  // Circular terrain transition zones avoid a square biome stamp around the volcano.
  const outerScorch = new THREE.Mesh(
    new THREE.RingGeometry(78, 118, 64),
    new THREE.MeshStandardMaterial({color:0x5e553f, roughness:1.0, transparent:true, opacity:0.46, side:THREE.DoubleSide})
  );
  outerScorch.rotation.x = -Math.PI / 2; outerScorch.position.y = 0.026;
  const innerScorch = new THREE.Mesh(
    new THREE.RingGeometry(58, 88, 64),
    new THREE.MeshStandardMaterial({color:0x403b34, roughness:1.0, transparent:true, opacity:0.60, side:THREE.DoubleSide})
  );
  innerScorch.rotation.x = -Math.PI / 2; innerScorch.position.y = 0.034;
  volcanoRegion.add(outerScorch, innerScorch);

  // Volcanic boulders use individual solid meshes only for the larger pieces; small
  // visual scree stays non-colliding to keep traversal smooth and cheap.
  const rockMat = createSurfaceMaterial(0x3a3937, 'concrete', 0.98, 0.02, 4, 4);
  for (let i=0;i<22;i++) {
    const angle = i * 2.399963 + 0.4;
    const radius = 52 + (i % 6) * 8.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + (i%4)*0.48, 0), rockMat);
    rock.name = `volcanic_boulder_${i}`;
    rock.position.set(Math.cos(angle)*radius, 1.0 + (i%3)*0.22, Math.sin(angle)*radius);
    rock.rotation.set((i%5)*0.19, angle*0.4, (i%4)*0.13);
    rock.scale.set(1.0 + (i%3)*0.35, 0.75 + (i%4)*0.12, 1.05 + ((i+1)%3)*0.28);
    if (i < 12) { rock.userData.solidCollider = true; rock.userData.colliderPadding = 0.02; }
    volcanoHighDetail.add(rock);
  }

  // Volcano vegetation uses the SAME reusable kickable-tree hierarchy as the cities,
  // but vegetation belongs AROUND the volcano, never on the volcanic mountain itself.
  // Keep every tree beyond the mountain/scorch footprint so the rocky slopes/crater
  // remain completely barren while the surrounding reserve still reads as forested.
  const treeCount = 58;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  let volcanoTreeIndex = 0;
  for (let i = 0; i < treeCount; i++) {
    // The visible mountain ends at roughly radius 98 and the circular scorch blend at
    // radius 118. Start beyond both, then spread trees naturally through the grass.
    const band = i / Math.max(1, treeCount - 1);
    const radius = 124 + Math.pow(band, 0.76) * 70 + Math.sin(i * 2.73) * 4.8;
    const angle = i * goldenAngle + Math.sin(i * 1.31) * 0.25;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // Keep the western fast-travel/approach throat open and avoid a perfect ring.
    const westAngleDelta = Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI));
    const westApproach = Math.abs(westAngleDelta) < 0.24 && x < -118;
    if (westApproach) continue;

    const tree = new THREE.Group();
    tree.name = `kickable_tree_western_volcano_${volcanoTreeIndex}`;
    tree.userData.kickableTree = true;
    tree.userData.treePhysicsProfile = 'arcade_reusable';
    tree.userData.volcanoVegetation = true;
    tree.position.set(volcanoRegion.position.x + x, 0, volcanoRegion.position.z + z);
    tree.rotation.y = angle * 0.73 + i * 0.41;

    // Reuse the exact same stylised tree hierarchy as the city/landscaping trees.
    // WorldInteractionManager owns kick reaction, gravity, sleeping and the moving
    // trunk collider, so there is no volcano-specific physics implementation.
    const scale = 0.80 + ((i * 37) % 11) * 0.035;
    const visual = createStylizedCityTreeModel(scale, i % 3);
    visual.name = `western_volcano_tree_visual_${volcanoTreeIndex}`;
    tree.add(visual);
    root.add(tree);

    destructibles.push({
      id: `western_volcano_tree_${volcanoTreeIndex}`,
      mesh: tree,
      type: 'tree',
      position: { x: volcanoRegion.position.x + x, y: 0, z: volcanoRegion.position.z + z },
      destroyed: false,
    });
    volcanoTreeIndex++;
  }

  const smokeCount = 12;
  const smokeMat = new THREE.MeshStandardMaterial({
    color:0x5e5b59, roughness:1.0, transparent:true, opacity:0.32, depthWrite:false
  });
  const smoke = new THREE.InstancedMesh(new THREE.SphereGeometry(2.5,8,6), smokeMat, smokeCount);
  smoke.name = 'western_volcano_smoke';
  smoke.frustumCulled = true;
  volcanoHighDetail.add(smoke);

  root.add(volcanoRegion);

  let volcanoElapsed = 0;
  const volcanoDummy = new THREE.Object3D();
  const updateVolcano = (dt: number, activePosition?: THREE.Vector3) => {
    volcanoElapsed += Math.min(dt,0.05);
    lavaTexture.offset.x = (volcanoElapsed * 0.018) % 1;
    lavaTexture.offset.y = (volcanoElapsed * -0.011) % 1;
    lavaGlow.rotation.z = volcanoElapsed * 0.08;

    let distanceSq = 0;
    if (activePosition) {
      const dx = activePosition.x - volcanoRegion.position.x;
      const dz = activePosition.z - volcanoRegion.position.z;
      distanceSq = dx*dx + dz*dz;
    }
    volcanoHighDetail.visible = !activePosition || distanceSq < 430*430;
    smoke.visible = !activePosition || distanceSq < 340*340;

    if (volcanoHighDetail.visible) {
      // Surface bubbles swell, rise and collapse at different rates/positions.
      // Their bases remain inside the actual lava disc, so none float over rock.
      for (let i=0;i<lavaBubbleCount;i++) {
        const phase = (volcanoElapsed * (0.31 + (i % 4) * 0.025) + i / lavaBubbleCount) % 1;
        const angle = i * 2.399963 + 0.35;
        const radius = 2.0 + (i % 4) * 2.55;
        const swell = Math.sin(phase * Math.PI);
        const popFade = phase > 0.82 ? Math.max(0.04, (1 - phase) / 0.18) : 1;
        const bubbleScale = (0.22 + swell * 0.92) * (0.78 + (i % 3) * 0.10) * popFade;
        volcanoDummy.position.set(
          Math.cos(angle) * radius,
          46.47 + swell * 0.78,
          Math.sin(angle) * radius
        );
        volcanoDummy.scale.set(bubbleScale, bubbleScale * (0.72 + swell * 0.20), bubbleScale);
        volcanoDummy.rotation.set(0, angle, 0);
        volcanoDummy.updateMatrix();
        lavaBubbles.setMatrixAt(i, volcanoDummy.matrix);
      }
      lavaBubbles.instanceMatrix.needsUpdate = true;
      lavaBubbleMat.emissiveIntensity = 2.75 + Math.sin(volcanoElapsed * 2.1) * 0.35;

      // Recycled ballistic lava ejecta. Each blob keeps its own deterministic launch
      // angle/speed so the volcano spits irregularly rather than playing one scripted
      // identical fountain. Scale-to-zero hides a blob between launches.
      for (let i=0;i<lavaDropletCount;i++) {
        const cycle = 4.4 + (i % 4) * 0.42;
        const localTime = (volcanoElapsed + i * 0.73) % cycle;
        const flightTime = 3.25 + (i % 3) * 0.18;
        if (localTime <= flightTime) {
          const angle = i * 2.399963 + Math.floor((volcanoElapsed + i * 0.73) / cycle) * 0.47;
          const launchSpeed = 31.5 + (i % 5) * 1.45;
          const radialSpeed = 1.8 + (i % 4) * 0.72;
          const gravity = 18.0;
          const t = localTime;
          const radial = 0.9 + radialSpeed * t;
          const y = 47.0 + launchSpeed * t - 0.5 * gravity * t * t;
          const fadeIn = Math.min(1, t / 0.10);
          const fadeOut = Math.min(1, Math.max(0, (flightTime - t) / 0.30));
          const blobScale = (0.48 + (i % 4) * 0.075) * fadeIn * fadeOut;
          volcanoDummy.position.set(Math.cos(angle) * radial, y, Math.sin(angle) * radial);
          volcanoDummy.scale.set(blobScale, blobScale * 1.18, blobScale);
          volcanoDummy.rotation.set(t * (1.8 + (i % 3) * 0.25), angle + t * 0.55, t * 1.3);
        } else {
          volcanoDummy.position.set(0, 46.3, 0);
          volcanoDummy.scale.setScalar(0.001);
          volcanoDummy.rotation.set(0, 0, 0);
        }
        volcanoDummy.updateMatrix();
        lavaDroplets.setMatrixAt(i, volcanoDummy.matrix);
      }
      lavaDroplets.instanceMatrix.needsUpdate = true;
      lavaDropletMat.emissiveIntensity = 3.2 + Math.sin(volcanoElapsed * 2.8) * 0.45;
    }

    if (!smoke.visible) return;

    for (let i=0;i<smokeCount;i++) {
      const phase = (volcanoElapsed * (0.085 + (i%4)*0.008) + i/smokeCount) % 1;
      const swirl = volcanoElapsed*0.22 + i*2.18;
      const drift = phase * 11.0;
      volcanoDummy.position.set(
        Math.cos(swirl)*1.8 + drift*0.24,
        75 + phase*43,
        Math.sin(swirl)*1.8 - drift*0.10
      );
      const scale = 0.65 + phase*2.2 + (i%3)*0.08;
      volcanoDummy.scale.set(scale*1.15, scale*0.82, scale);
      volcanoDummy.rotation.set(0,swirl*0.2,0);
      volcanoDummy.updateMatrix();
      smoke.setMatrixAt(i,volcanoDummy.matrix);
    }
    smoke.instanceMatrix.needsUpdate = true;
  };
  updateVolcano(0);

  // Landmarks Registration for Map
  landmarks.push(
    {
      id: 'western_volcano',
      name: 'Western Volcano',
      category: 'countryside',
      x: -505,
      z: -145,
      icon: 'flame',
      color: '#ff7043',
      travelX: -610,
      travelZ: -145,
      travelYaw: Math.PI / 2,
    },
    {
      id: 'river_boat_dock',
      name: 'Springfield-Goldenrod River Boat Dock',
      category: 'countryside',
      x: 40,
      z: 55,
      icon: 'compass',
      color: '#29b6f6',
    },
    {
      id: 'golden_gate_bridge',
      name: 'Springfield-Goldenrod Interstate Suspension Bridge',
      category: 'highway',
      x: 0,
      z: 0,
      icon: 'compass',
      color: '#ff5722',
      // Dedicated CENTRAL BRIDGE arrival on the actual raised road deck. Under
      // Australian left-hand traffic, the +Z lane is the westbound left lane, so
      // spawn at that lane centre facing west instead of sampling the river below.
      travelX: 0,
      travelZ: 4.2,
      travelYaw: -Math.PI / 2,
    },
    {
      id: 'north_viaduct',
      name: 'Northern Interstate Viaduct',
      category: 'highway',
      x: 0,
      z: -170,
      icon: 'compass',
      color: '#78909c',
    },
    {
      id: 'country_bridge',
      name: 'Southern Interstate Viaduct',
      category: 'highway',
      x: 0,
      z: 150,
      icon: 'compass',
      color: '#78909c',
    },
    {
      id: 'country_farm',
      name: 'Countryside Red Barn & Farmland',
      category: 'highway',
      x: 35,
      z: 260,
      icon: 'store',
      color: '#b71c1c',
    },
    {
      id: 'route_34_daycare',
      name: 'Route 34 Pokémon Day-Care',
      category: 'highway',
      x: -25,
      z: 80,
      icon: 'home',
      color: '#0288d1',
    }
  );

  return {
    group: root,
    landmarks,
    destructibles,
    doors,
    update: updateVolcano,
  };
}
