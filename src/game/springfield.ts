import * as THREE from 'three';
import { createMaterial, createSurfaceMaterial, createStableSidewalkMaterial, createGlassMaterial, createAshKetchumModel } from './models';
import { ArcadeMachineInfo, DestructibleProp, GrassPatch, MapLandmark } from '../types';
import { Door, WallBox, markWalkableStairSurface, markStairRailing } from './doors';
import { addRoadsideLandscaping } from './landscaping';
import { createSimpsonsFamilyOnCouch } from './simpsonsFamily';

export interface SpringfieldBuildResult {
  group: THREE.Group;
  destructibles: DestructibleProp[];
  grassPatches: GrassPatch[];
  doors: Door[];
  wallColliders: WallBox[];
  simpsonsHouse: {
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    livingRoomPos: THREE.Vector3;
    ashPos: THREE.Vector3;
    ashMesh: THREE.Group;
  };
  jail: {
    cellSpawnPos: THREE.Vector3;
    cellDoor: {
      mesh: THREE.Group;
      isOpen: boolean;
      pos: THREE.Vector3;
    };
    guards: { name: string; pos: THREE.Vector3; rotationY: number }[];
    guardFightPos: THREE.Vector3;
    exitPos: THREE.Vector3;
  };
  tvLight: THREE.PointLight;
  cloudsGroup: THREE.Group;
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

/** Generic sittable metadata. App.tsx reads this instead of hard-coding chair coordinates. */
function markSittable(seat: THREE.Object3D, label = 'Seat', facingX = 0, facingZ = 1) {
  seat.userData.sittable = true;
  seat.userData.seatLabel = label;
  seat.userData.sitFacingLocal = [facingX, facingZ];
}

/** Build a hollow, actually-enterable commercial shell with visible interior walls. */
function addEnterableShell(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  wallMaterial: THREE.Material,
  floorMaterial: THREE.Material,
  doorWidth: number,
  doorHeight = 3.8,
  centerZ = 0
) {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(width - 0.7, 0.22, depth - 0.7), floorMaterial);
  floor.position.set(0, 0.11, centerZ);
  floor.userData.walkable = true;
  floor.userData.walkablePriority = 20;

  const wallT = 0.65;
  const backZ = centerZ - depth / 2;
  const frontZ = centerZ + depth / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallT), wallMaterial);
  back.position.set(0, height / 2, backZ);
  const left = new THREE.Mesh(new THREE.BoxGeometry(wallT, height, depth), wallMaterial);
  left.position.set(-width / 2, height / 2, centerZ);
  const right = new THREE.Mesh(new THREE.BoxGeometry(wallT, height, depth), wallMaterial);
  right.position.set(width / 2, height / 2, centerZ);
  const frontPieceW = Math.max(0.5, (width - doorWidth) / 2);
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(frontPieceW, height, wallT), wallMaterial);
  frontL.position.set(-(doorWidth / 2 + frontPieceW / 2), height / 2, frontZ);
  const frontR = new THREE.Mesh(new THREE.BoxGeometry(frontPieceW, height, wallT), wallMaterial);
  frontR.position.set(doorWidth / 2 + frontPieceW / 2, height / 2, frontZ);
  const headerH = Math.max(0.4, height - doorHeight);
  const header = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, headerH, wallT), wallMaterial);
  header.position.set(0, doorHeight + headerH / 2, frontZ);
  // A real ceiling keeps the third-person camera inside the shop instead of
  // drifting through the roof. It is camera-only (not a player blocker).
  const ceilingY = Math.min(height - 0.22, 4.35);
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.7, 0.18, depth - 0.7),
    createSurfaceMaterial(0xf1eee7, 'concrete', 0.9, 0.01, Math.max(3, width / 4), Math.max(3, depth / 4))
  );
  ceiling.position.set(0, ceilingY, centerZ);
  group.add(floor, back, left, right, frontL, frontR, header, ceiling);
  markSolid(back, left, right, frontL, frontR, header);
}

export function buildSpringfield(): SpringfieldBuildResult {
  const root = new THREE.Group();
  root.name = 'springfield_district';

  const destructibles: DestructibleProp[] = [];
  const grassPatches: GrassPatch[] = [];
  const landmarks: MapLandmark[] = [];
  const arcadeMachines: ArcadeMachineInfo[] = [];
  const doors: Door[] = [];
  const wallColliders: WallBox[] = [];

  // Cartoon Suburban & Municipal Materials
  const asphaltMat = createSurfaceMaterial(0x30343a, 'asphalt', 0.92, 0.03, 22, 22);
  asphaltMat.polygonOffset = true;
  asphaltMat.polygonOffsetFactor = -1;
  asphaltMat.polygonOffsetUnits = -1;
  const roadYellowLineMat = createMaterial(0xffd54f, 0.5, 0.1);
  roadYellowLineMat.polygonOffset = true;
  roadYellowLineMat.polygonOffsetFactor = -2;
  roadYellowLineMat.polygonOffsetUnits = -2;
  const roadWhiteLineMat = createMaterial(0xffffff, 0.52, 0.06);
  roadWhiteLineMat.polygonOffset = true;
  roadWhiteLineMat.polygonOffsetFactor = -3;
  roadWhiteLineMat.polygonOffsetUnits = -3;
  const concreteMat = createSurfaceMaterial(0xcfd8dc, 'concrete', 0.88, 0.02, 10, 10);
  const curbMat = createSurfaceMaterial(0x90a4ae, 'concrete', 0.9, 0.02, 7, 7);
  // Dedicated footpath/promenade material used by sidewalks and the Town Square ring.
  // Keep this separate from curbMat so pedestrian surfaces read clearly without
  // relying on an undeclared material at runtime.
  const sidewalkMat = createStableSidewalkMaterial(0x737d82, 0.9, 0.01);
  const grassMat = createSurfaceMaterial(0x7cb342, 'grass', 0.96, 0.0, 12, 12);
  const woodMat = createSurfaceMaterial(0x6d4c41, 'wood', 0.84, 0.02, 5, 5);
  const darkWoodMat = createSurfaceMaterial(0x4e342e, 'wood', 0.86, 0.02, 5, 5);
  const brickMat = createSurfaceMaterial(0xbf360c, 'brick', 0.9, 0.02, 7, 7);
  const whiteMat = createMaterial(0xf5f5f5, 0.4, 0.05);
  const glassMat = createGlassMaterial(0x9eddf6, 0.46, 0.16);

  // Homer's House colors (canonical Simpsons scheme)
  const homerWallMat = createSurfaceMaterial(0xe4a6ad, 'concrete', 0.82, 0.02, 5, 5); // canonical warm Simpsons pink
  const homerRoofMat = createSurfaceMaterial(0x7b5b4a, 'roof', 0.9, 0.02, 7, 5);
  const homerTrimMat = createMaterial(0x5d4037, 0.75, 0.05);
  const homerCouchMat = createMaterial(0x8d5b4c, 0.85, 0.05);
  const simpsonRugMat = createMaterial(0x42a5f5, 0.8, 0.05);
  const flandersWallMat = createMaterial(0xab47bc, 0.75, 0.05);

  // -------------------------------------------------------------------------
  // 1. SPRINGFIELD STREET NETWORK (X: -320 to -90, Z: -180 to 160)
  // -------------------------------------------------------------------------
  const streetsGroup = new THREE.Group();
  streetsGroup.name = 'springfield_streets';

  // Evergreen reaches all the way to the EAST edge of the X=-110 arterial.
  // The previous road ended at X=-110 (the arterial centreline), leaving the
  // eastern half of this T-junction as grass after the old circular apron was
  // removed. Extending to X=-103 completes the full 14x14 driving surface without
  // adding any unnecessary road beyond the arterial's visible east kerb.
  const evergreenSt = new THREE.Mesh(new THREE.BoxGeometry(207, 0.15, 14), asphaltMat);
  evergreenSt.name = 'springfield_evergreen_terrace';
  evergreenSt.position.set(-206.5, 0.08, 60); // X -310 -> -103
  streetsGroup.add(evergreenSt);

  // PHYSICAL ROAD REBUILD: the south boulevard runs from the north viaduct into
  // the civic roundabout and the east central bridge approach with real building clearance.
  // Extending to Z=-20 creates a 100% continuous, seamless road corridor through X=-181, Z=-34.
  const mainBlvdSouth = new THREE.Mesh(new THREE.BoxGeometry(16, 0.15, 150), asphaltMat);
  mainBlvdSouth.name = 'springfield_main_boulevard_south';
  mainBlvdSouth.position.set(-185, 0.08, -95); // Z -170 -> -20; meets civic roundabout and bridge road seamlessly

  // COMPACT CENTRAL BRIDGE T-JUNCTION --------------------------------------------
  // The previous 66m x 84m "grand intersection" solved the disconnected-road
  // problem by paving the entire space between the civic road, two local south
  // streets, the outer arterial and the bridge. Visually that became an asphalt
  // field. The marked screenshots make the intended hierarchy clearer:
  //
  //   * the X=-145 residential collector is a LOCAL road that ends at Evergreen;
  //   * the X=-110 south arterial is also a LOCAL approach that ends at Evergreen;
  //   * only the west civic approach, NORTH arterial and central bridge need to meet
  //     here.
  //
  // Build one compact T-junction at X=-110/Z=0, then use a single smooth curved road
  // from the roundabout tangent to its west edge. Everything south of the junction
  // is ordinary grass/verge again rather than hidden/stacked asphalt.

  const makeRibbonMesh = (
    name: string,
    centerline: THREE.Vector2[],
    halfWidth: number,
    material: THREE.Material,
    depth: number,
    baseY: number,
  ) => {
    const left: THREE.Vector2[] = [];
    const right: THREE.Vector2[] = [];
    for (let i = 0; i < centerline.length; i++) {
      const prev = centerline[Math.max(0, i - 1)];
      const next = centerline[Math.min(centerline.length - 1, i + 1)];
      const tx = next.x - prev.x;
      const tz = next.y - prev.y;
      const inv = 1 / Math.max(0.0001, Math.hypot(tx, tz));
      // World-space perpendicular in the X/Z plane.
      const nx = tz * inv;
      const nz = -tx * inv;
      left.push(new THREE.Vector2(centerline[i].x + nx * halfWidth, centerline[i].y + nz * halfWidth));
      right.push(new THREE.Vector2(centerline[i].x - nx * halfWidth, centerline[i].y - nz * halfWidth));
    }
    const outline = [...left, ...right.reverse()];
    const shape = new THREE.Shape();
    shape.moveTo(outline[0].x, -outline[0].y);
    for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i].x, -outline[i].y);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.y = baseY;
    return mesh;
  };

  // Build a one-sided strip directly from the SAME source centreline as the road.
  // This avoids the old "offset an offset curve" approach, which changed the
  // effective tangent around bends and left little grass wedges / concrete tongues
  // between the asphalt and its footpath. innerOffset/outerOffset are measured from
  // the road centreline, so the verge edge remains mathematically consistent.
  const makeOneSidedStripMesh = (
    name: string,
    centerline: THREE.Vector2[],
    side: 1 | -1,
    innerOffset: number,
    outerOffset: number,
    material: THREE.Material,
    depth: number,
    baseY: number,
  ) => {
    const inner: THREE.Vector2[] = [];
    const outer: THREE.Vector2[] = [];
    for (let i = 0; i < centerline.length; i++) {
      const prev = centerline[Math.max(0, i - 1)];
      const next = centerline[Math.min(centerline.length - 1, i + 1)];
      const tx = next.x - prev.x;
      const tz = next.y - prev.y;
      const inv = 1 / Math.max(0.0001, Math.hypot(tx, tz));
      const nx = tz * inv * side;
      const nz = -tx * inv * side;
      inner.push(new THREE.Vector2(centerline[i].x + nx * innerOffset, centerline[i].y + nz * innerOffset));
      outer.push(new THREE.Vector2(centerline[i].x + nx * outerOffset, centerline[i].y + nz * outerOffset));
    }
    const outline = [...outer, ...inner.reverse()];
    const shape = new THREE.Shape();
    shape.moveTo(outline[0].x, -outline[0].y);
    for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i].x, -outline[i].y);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.y = baseY;
    return mesh;
  };

  // East tangent of the civic roundabout -> west edge of the compact bridge junction.
  // Cubic controls keep both ends tangent to their adjoining straight roads, so buses
  // and police cars do not encounter a kink or triangular asphalt wedge.
  const springfieldBridgeApproachCurve = new THREE.CubicBezierCurve(
    new THREE.Vector2(-180.5, -20),
    new THREE.Vector2(-158.0, -20),
    new THREE.Vector2(-140.0, 0),
    new THREE.Vector2(-124.0, 0),
  );
  const springfieldBridgeApproachPoints = springfieldBridgeApproachCurve.getPoints(28);
  const compactWestApproach = makeRibbonMesh(
    'springfield_compact_bridge_west_approach',
    springfieldBridgeApproachPoints,
    7,
    asphaltMat,
    0.15,
    0.005,
  );
  compactWestApproach.userData.walkable = true;
  compactWestApproach.userData.walkablePriority = 9;
  compactWestApproach.userData.roadCriticalDetail = true;
  compactWestApproach.userData.mapRoadSurface = true;

  // Compact T footprint. Do NOT use a rounded rectangle here: that used to round
  // across the road mouths and could leave tiny grass notches where the 14m west
  // approach and 18m bridge ramp met the junction. This custom outline gives every
  // approach an exact full-width seam, with only the OUTSIDE corners curved:
  //
  //   west mouth  X=-124, Z=-7..7   (14m road)
  //   north mouth Z=-14, X=-117..-103 (14m road)
  //   east mouth  X=-96,  Z=-9..9   (18m bridge ramp)
  //
  // The final compact plan adds one narrow south mouth only at X=-117..-103. It
  // connects to the short X=-110 road link while the rest of the former oversized
  // intersection remains genuine grass/verge.
  const compactShape = new THREE.Shape();
  const shapePoint = (x: number, z: number) => new THREE.Vector2(x, -z);
  const westNorth = shapePoint(-124, -7);
  compactShape.moveTo(westNorth.x, westNorth.y);
  // Smooth outside corner from the west road's north kerb to the north arterial.
  compactShape.quadraticCurveTo(-124, 14, -117, 14); // world control (-124,-14), end (-117,-14)
  compactShape.lineTo(-103, 14);                    // north road mouth
  // Smooth outside corner from the north arterial into the wider bridge approach.
  compactShape.quadraticCurveTo(-96, 14, -96, 9);  // world control (-96,-14), end (-96,-9)
  compactShape.lineTo(-96, -9);                    // east mouth south edge, world Z=9
  compactShape.lineTo(-119, -9);                   // compact south verge edge, world Z=9
  // Gentle taper back to the narrower 14m west road.
  compactShape.quadraticCurveTo(-123, -9, -124, -7); // world end (-124,7)
  compactShape.lineTo(-124, 7);                    // west road mouth north edge, world Z=-7
  compactShape.closePath();
  const compactJunctionGeometry = new THREE.ExtrudeGeometry(compactShape, {
    depth: 0.15,
    bevelEnabled: false,
    curveSegments: 20,
  });
  compactJunctionGeometry.rotateX(-Math.PI / 2);
  const compactBridgeTJunction = new THREE.Mesh(compactJunctionGeometry, asphaltMat);
  compactBridgeTJunction.name = 'springfield_compact_bridge_t_junction';
  compactBridgeTJunction.position.y = 0.005; // top 0.155m, identical to all adjoining roads
  compactBridgeTJunction.userData.walkable = true;
  compactBridgeTJunction.userData.walkablePriority = 10;
  compactBridgeTJunction.userData.roadCriticalDetail = true;
  compactBridgeTJunction.userData.mapRoadSurface = true;
  compactBridgeTJunction.userData.compactIntersection = true;

  // The residential collector no longer runs into the bridge junction. It starts at
  // Evergreen Terrace's south kerb (Z=67) and remains a useful local road to the
  // southern perimeter. Removing Z=42..67 deletes the screenshot's redundant stub.
  const residentialBypassNS = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 83), asphaltMat);
  residentialBypassNS.name = 'springfield_residential_collector_local';
  residentialBypassNS.position.set(-145, 0.08, 108.5); // Z 67 -> 150

  streetsGroup.add(mainBlvdSouth, compactWestApproach, compactBridgeTJunction, residentialBypassNS);

  // Proper civic roundabout around the monument. The plaza remains a pedestrian
  // island while cars travel around it rather than through it. The outer radius
  // meets the interstate approach cleanly at the east side.
  const civicRoundabout = new THREE.Mesh(new THREE.RingGeometry(19.5, 29.5, 72, 1), asphaltMat);
  civicRoundabout.name = 'springfield_civic_roundabout_road';
  civicRoundabout.rotation.x = -Math.PI / 2;
  civicRoundabout.position.set(-210, 0.165, -20);
  civicRoundabout.userData.walkable = true;
  civicRoundabout.userData.walkablePriority = 7;
  civicRoundabout.userData.roadCriticalDetail = true;
  streetsGroup.add(civicRoundabout);

  const roundaboutInnerCurb = new THREE.Mesh(new THREE.TorusGeometry(19.25, 0.26, 6, 64), curbMat);
  roundaboutInnerCurb.name = 'springfield_roundabout_inner_curb';
  roundaboutInnerCurb.rotation.x = Math.PI / 2;
  roundaboutInnerCurb.position.set(-210, 0.20, -20);
  // The outer curb and pedestrian promenade are split into arcs so the north,
  // south and east approaches have genuine openings.
  // The north-east entrance where Main Boulevard South merges into the roundabout
  // and central bridge road (angles 344° through 0° to 60°) is a continuous vehicular corridor
  // and is kept open with zero concrete or curb across the driving lanes.
  const roundaboutOuterCurb = new THREE.Group();
  roundaboutOuterCurb.name = 'springfield_roundabout_outer_curb';
  const roundaboutOuterWalk = new THREE.Group();
  roundaboutOuterWalk.name = 'springfield_roundabout_outer_pedestrian_walk';
  const approachGapArcs = [
    { start: THREE.MathUtils.degToRad(60), length: THREE.MathUtils.degToRad(284) },
  ];
  approachGapArcs.forEach(({ start, length }, index) => {
    const curbGeo = new THREE.TorusGeometry(29.82, 0.24, 6, Math.max(18, Math.round(72 * length / (Math.PI * 2))), length);
    curbGeo.rotateZ(start);
    const curbArc = new THREE.Mesh(curbGeo, curbMat);
    curbArc.name = `springfield_roundabout_outer_curb_arc_${index}`;
    curbArc.rotation.x = Math.PI / 2;
    curbArc.position.set(-210, 0.20, -20);
    roundaboutOuterCurb.add(curbArc);

    const walkArc = new THREE.Mesh(
      new THREE.RingGeometry(30.25, 34.0, Math.max(18, Math.round(72 * length / (Math.PI * 2))), 1, start, length),
      sidewalkMat
    );
    walkArc.name = `springfield_roundabout_outer_walk_arc_${index}`;
    walkArc.rotation.x = -Math.PI / 2;
    walkArc.position.set(-210, 0.17, -20);
    walkArc.userData.walkable = true;
    walkArc.userData.walkablePriority = 8;
    walkArc.userData.sidewalkSurface = true;
    walkArc.userData.roadCriticalDetail = true;
    roundaboutOuterWalk.add(walkArc);
  });
  streetsGroup.add(roundaboutInnerCurb, roundaboutOuterCurb, roundaboutOuterWalk);

  // Readable dashed guidance around the circle. These are deliberately thin decal-
  // like meshes above the asphalt so they cannot z-fight with the road surface.
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const radius = 24.5;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.026, 2.15), roadWhiteLineMat);
    dash.name = `springfield_roundabout_marking_${i}`;
    dash.position.set(-210 + Math.cos(angle) * radius, 0.192, -20 + Math.sin(angle) * radius);
    dash.rotation.y = -angle;
    dash.userData.roadCriticalDetail = true;
    streetsGroup.add(dash);
  }

  const policeWay = new THREE.Mesh(new THREE.BoxGeometry(200, 0.15, 14), asphaltMat);
  policeWay.name = 'springfield_police_way';
  policeWay.position.set(-210, 0.08, -60);
  streetsGroup.add(policeWay);

  // Commercial Way used to run through the actual Krusty/Kwik-E-Mart/Moe building
  // shells at Z=-130. Put the street in front of the storefronts at Z=-110, leaving
  // a proper frontage/sidewalk zone between the kerb and each entrance.
  const commWay = new THREE.Mesh(new THREE.BoxGeometry(200, 0.15, 14), asphaltMat);
  commWay.name = 'springfield_commercial_way';
  commWay.position.set(-210, 0.08, -110);

  // West collector closes Commercial Way, Police Way and Evergreen into one loop.
  // Its southern endpoint follows the rebuilt commercial street so there is no
  // meaningless asphalt tail behind the shops.
  const westCollector = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 170), asphaltMat);
  westCollector.name = 'springfield_west_collector';
  westCollector.position.set(-310, 0.08, -25); // Z -110 -> 60
  streetsGroup.add(commWay, westCollector);

  // Rounded junction pads replace the old hard rectangular overlap look at the
  // commercial intersections. The tiny vertical offset is visual-only (millimetres),
  // keeping vehicle suspension smooth while hiding seams and giving turn paths a
  // deliberate curved edge.
  const springfieldIntersections = new THREE.Group();
  springfieldIntersections.name = 'springfield_rounded_intersections';
  const addSpringfieldIntersection = (x: number, z: number, radius = 8.1) => {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.16, 28), asphaltMat);
    pad.name = `springfield_intersection_${x}_${z}`;
    pad.position.set(x, 0.083, z);
    pad.userData.walkable = true;
    pad.userData.walkablePriority = 7;
    pad.userData.roadCriticalDetail = true;
    springfieldIntersections.add(pad);
  };
  for (const z of [-110, -60]) {
    addSpringfieldIntersection(-310, z);
    addSpringfieldIntersection(-185, z, 8.5);
    addSpringfieldIntersection(-110, z);
  }
  // Bus-sized turning apron at the Evergreen / west-collector junction.
  addSpringfieldIntersection(-310, 60, 11.5);
  // X=-110 / Evergreen no longer needs a circular asphalt apron. Evergreen now
  // extends to X=-103 (the arterial's far/east road edge), so the two 14m roads
  // form a complete rectangular T-junction with no missing grass quadrant and no
  // oversized asphalt lobe.
  addSpringfieldIntersection(-145, 60);
  // The east tangent of the civic roundabout keeps one transition apron. From here
  // the new curved approach leaves smoothly toward the compact bridge T-junction.
  addSpringfieldIntersection(-180.5, -20, 11.5);
  streetsGroup.add(springfieldIntersections);

  for (let x = -305; x <= -115; x += 9) {
    if (Math.abs(x - -210) < 10) continue;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.026, 0.24), roadYellowLineMat);
    stripe.position.set(x, 0.172, 60);
    stripe.userData.roadCriticalDetail = true;
    streetsGroup.add(stripe);
  }

  // Main Boulevard markings stop before the civic roundabout. The former loop ran
  // straight through the monument and was also small enough to be culled close to
  // the camera, creating the 'road assembles in front of me' effect.
  for (let z = -165; z <= -39; z += 9) {
    if (Math.abs(z + 60) < 10 || Math.abs(z + 110) < 10) continue;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.026, 4.5), roadYellowLineMat);
    stripe.name = `springfield_main_road_marking_${z}`;
    stripe.position.set(-185, 0.172, z);
    stripe.userData.roadCriticalDetail = true;
    streetsGroup.add(stripe);
  }

  // Centre-line guidance follows the ACTUAL curved west approach. Keep the last few
  // metres before the compact T clear so turning paths remain visually uncluttered.
  for (const t of [0.10, 0.25, 0.40, 0.55, 0.70, 0.82]) {
    const point = springfieldBridgeApproachCurve.getPoint(t);
    const tangent = springfieldBridgeApproachCurve.getTangent(t).normalize();
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.026, 0.24), roadYellowLineMat);
    stripe.name = `springfield_compact_bridge_curve_marking_${Math.round(t * 100)}`;
    stripe.position.set(point.x, 0.172, point.y);
    stripe.rotation.y = -Math.atan2(tangent.y, tangent.x);
    stripe.userData.roadCriticalDetail = true;
    streetsGroup.add(stripe);
  }

  // The local X=-145 collector now begins at Evergreen Terrace, so its centre line
  // and give-way control begin south of that T-junction rather than floating in the
  // grass where the old oversized bridge intersection used to be.
  for (let z = 84; z <= 142; z += 9) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.026, 4.2), roadYellowLineMat);
    stripe.name = `springfield_collector_local_marking_${z}`;
    stripe.position.set(-145, 0.172, z);
    stripe.userData.roadCriticalDetail = true;
    streetsGroup.add(stripe);
  }
  const residentialGiveWay = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.026, 0.30), roadWhiteLineMat);
  residentialGiveWay.name = 'springfield_collector_evergreen_give_way';
  residentialGiveWay.position.set(-148.1, 0.174, 70.8);
  residentialGiveWay.userData.roadCriticalDetail = true;
  streetsGroup.add(residentialGiveWay);

  // Complete centre-line guidance on the rebuilt commercial loop. Keep lane
  // markings out of the actual turning boxes so intersections do not become a
  // pile of overlapping decals.
  for (const roadZ of [-60, -110]) {
    for (let x = -301; x <= -119; x += 9) {
      if (Math.abs(x + 185) < 10 || Math.abs(x + 310) < 10 || Math.abs(x + 110) < 10) continue;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.026, 0.24), roadYellowLineMat);
      stripe.position.set(x, 0.172, roadZ);
      stripe.userData.roadCriticalDetail = true;
      streetsGroup.add(stripe);
    }
  }
  for (let z = -101; z <= 51; z += 9) {
    if (Math.abs(z + 60) < 10) continue;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.026, 4.5), roadYellowLineMat);
    stripe.position.set(-310, 0.172, z);
    stripe.userData.roadCriticalDetail = true;
    streetsGroup.add(stripe);
  }

  // Crosswalk geometry is derived from the road axis and actual road width.
  // This removes the old 4.2m decals that only covered part of a 14-16m road and
  // makes every zebra crossing run curb-to-curb, perpendicular to traffic.
  let pedestrianCrossingIndex = 0;
  const addCrosswalkAcrossRoad = (cx: number, cz: number, roadAxis: 'x' | 'z', roadWidth: number) => {
    const stripeLength = Math.max(5, roadWidth - 1.0);
    for (let i = -3; i <= 3; i++) {
      const offset = i * 1.15;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(roadAxis === 'x' ? 0.72 : stripeLength, 0.026, roadAxis === 'x' ? stripeLength : 0.72),
        roadWhiteLineMat
      );
      if (roadAxis === 'x') stripe.position.set(cx + offset, 0.174, cz);
      else stripe.position.set(cx, 0.174, cz + offset);
      stripe.userData.roadCriticalDetail = true;
      streetsGroup.add(stripe);
    }

    const marker = new THREE.Object3D();
    marker.name = `springfield_pedestrian_crossing_${pedestrianCrossingIndex++}`;
    marker.position.set(cx, 0.18, cz);
    marker.userData.pedestrianCrossingMarker = true;
    marker.userData.roadAxis = roadAxis;
    marker.userData.roadWidth = roadWidth;
    streetsGroup.add(marker);
  };

  // Residential crossings on Evergreen Terrace.
  addCrosswalkAcrossRoad(-222, 60, 'x', 14);
  addCrosswalkAcrossRoad(-198, 60, 'x', 14);
  // Main Boulevard x commercial/civic-road intersections. Crossings are placed
  // outside the turning box and are perpendicular to the traffic lane they cross.
  for (const z of [-60, -110]) {
    addCrosswalkAcrossRoad(-197, z, 'x', 14);
    addCrosswalkAcrossRoad(-173, z, 'x', 14);
    addCrosswalkAcrossRoad(-185, z - 12, 'z', 16);
    addCrosswalkAcrossRoad(-185, z + 12, 'z', 16);
  }
  // Evergreen/local-road crossings. The old Z=49 crossing sat on the redundant road
  // stub that has now been removed. New crossings sit just south of Evergreen at the
  // actual mouths of the two local roads and connect their side footpaths directly.
  addCrosswalkAcrossRoad(-157, 60, 'x', 14);
  addCrosswalkAcrossRoad(-145, 76, 'z', 14);
  addCrosswalkAcrossRoad(-110, 76, 'z', 14);

  [evergreenSt, mainBlvdSouth, compactWestApproach, compactBridgeTJunction, residentialBypassNS, civicRoundabout, roundaboutOuterWalk, policeWay, commWay, westCollector].forEach((mesh) => {
    mesh.userData.walkable = true;
    mesh.userData.walkablePriority = 5;
  });

  // Permanent road infrastructure is authored world geometry. Explicitly tag the
  // full street hierarchy so no future generic destructible/physics scan can ever
  // turn asphalt, lane markings or kerbs into loose objects.
  streetsGroup.traverse((obj) => {
    obj.userData.permanentRoadGeometry = true;
    obj.userData.interactivePhysicsObject = false;
    if (obj instanceof THREE.Mesh && obj.material === asphaltMat) obj.userData.mapRoadSurface = true;
  });
  root.add(streetsGroup);

  // Continuous pedestrian paths along Springfield's civic/commercial roads. The
  // original map only had sidewalks on Evergreen Terrace, so the town centre and
  // shops often opened straight onto asphalt or grass. These are low, walkable
  // slabs with visual curbs only, so vehicles do not snag on hard curb collision.
  const sidewalkGroup = new THREE.Group();
  sidewalkGroup.name = 'springfield_continuous_footpaths';
  type SidewalkGap = { center: number; halfGap: number };
  const splitSidewalkSpan = (min: number, max: number, gaps: SidewalkGap[]) => {
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
  const addVerticalSidewalks = (
    x:number, length:number, roadWidth:number, centerZ:number, gaps: SidewalkGap[] = []
  ) => {
    const minZ = centerZ - length / 2 - 1;
    const maxZ = centerZ + length / 2 + 1;
    for (const [z1, z2] of splitSidewalkSpan(minZ, maxZ, gaps)) {
      const segLength = z2 - z1;
      for (const side of [-1,1]) {
        const path = new THREE.Mesh(new THREE.BoxGeometry(3.6,0.22,segLength), sidewalkMat);
        path.name = `springfield_sidewalk_v_${x}_${side}_${z1.toFixed(1)}_${z2.toFixed(1)}`;
        // Keep the visible pedestrian slab comfortably above legacy frontage/lot
        // surfaces while still below the 30 cm kerb crown. The old 4.5 cm clearance
        // over shop lots was small enough to become depth-ambiguous at distance.
        path.position.set(x + side*(roadWidth/2+1.85),0.165,(z1+z2)/2);
        path.renderOrder = 20;
        path.userData.walkable=true; path.userData.walkablePriority=6; path.userData.sidewalkSurface=true; path.userData.roadCriticalDetail=true;
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.30,segLength),curbMat);
        curb.position.set(x + side*(roadWidth/2+0.16),0.15,(z1+z2)/2);
        curb.userData.curbSurface=true; curb.userData.roadCriticalDetail=true;
        sidewalkGroup.add(path,curb);
      }
    }
  };
  const addHorizontalSidewalks = (
    z:number, length:number, roadWidth:number, centerX:number, gaps: SidewalkGap[] = []
  ) => {
    const minX = centerX - length / 2 - 1;
    const maxX = centerX + length / 2 + 1;
    for (const [x1, x2] of splitSidewalkSpan(minX, maxX, gaps)) {
      const segLength = x2 - x1;
      for (const side of [-1,1]) {
        const path = new THREE.Mesh(new THREE.BoxGeometry(segLength,0.22,3.6), sidewalkMat);
        path.name = `springfield_sidewalk_h_${z}_${side}_${x1.toFixed(1)}_${x2.toFixed(1)}`;
        path.position.set((x1+x2)/2,0.165,z + side*(roadWidth/2+1.85));
        path.renderOrder = 20;
        path.userData.walkable=true; path.userData.walkablePriority=6; path.userData.sidewalkSurface=true; path.userData.roadCriticalDetail=true;
        const curb = new THREE.Mesh(new THREE.BoxGeometry(segLength,0.30,0.28),curbMat);
        curb.position.set((x1+x2)/2,0.15,z + side*(roadWidth/2+0.16));
        curb.userData.curbSurface=true; curb.userData.roadCriticalDetail=true;
        sidewalkGroup.add(path,curb);
      }
    }
  };
  // Stop sidewalks/curbs at every intersection opening. The old continuous strips
  // physically crossed perpendicular roads and rendered as pale floor panels above
  // the asphalt. These segmented runs preserve the pedestrian network without ever
  // laying concrete across a driving lane.
  addVerticalSidewalks(-185,141,16,-100.5,[{center:-170,halfGap:9.5},{center:-110,halfGap:8.4},{center:-60,halfGap:8.4},{center:-20,halfGap:31.5}]);
  addHorizontalSidewalks(-60,202,14,-210,[{center:-310,halfGap:8.2},{center:-185,halfGap:9.2},{center:-110,halfGap:8.2}]);
  addHorizontalSidewalks(-110,202,14,-210,[{center:-310,halfGap:8.2},{center:-185,halfGap:9.2},{center:-110,halfGap:8.2}]);
  addVerticalSidewalks(-310,172,14,-25,[{center:-110,halfGap:8.2},{center:-60,halfGap:8.2},{center:60,halfGap:8.2}]);
  // LOCAL SOUTH ROADS. X=-145 still begins at Evergreen. X=-110 now has the small
  // user-requested road link from the compact junction to Evergreen, so its footpaths
  // continue through that short connection while the large surrounding area stays grass.
  addVerticalSidewalks(-145,81,14,108.5,[{center:150,halfGap:8.2}]);
  addVerticalSidewalks(-110,38.3,14,31.0); // Z 10.85 -> 51.15
  addVerticalSidewalks(-110,81,14,108.5,[{center:150,halfGap:8.2}]);

  // EAST-SIDE T-JUNCTION FOOTPATH. Evergreen approaches only from the west and
  // terminates at the arterial's east road edge (X=-103), so pedestrians on the
  // east side of X=-110 should have one straight north/south footpath through the
  // junction. The old split sidewalks stopped at Z=51.15 and restarted at Z=67,
  // leaving the disconnected concrete/grass notch shown in the screenshot.
  const evergreenEastPathBridge = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 15.85), sidewalkMat);
  evergreenEastPathBridge.name = 'springfield_evergreen_east_sidewalk_bridge';
  evergreenEastPathBridge.position.set(-101.15, 0.165, 59.075); // Z 51.15 -> 67.00
  evergreenEastPathBridge.renderOrder = 20;
  evergreenEastPathBridge.userData.walkable = true;
  evergreenEastPathBridge.userData.walkablePriority = 7;
  evergreenEastPathBridge.userData.sidewalkSurface = true;
  evergreenEastPathBridge.userData.roadCriticalDetail = true;
  const evergreenEastCurbBridge = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.30, 15.85), curbMat);
  evergreenEastCurbBridge.name = 'springfield_evergreen_east_curb_bridge';
  evergreenEastCurbBridge.position.set(-102.84, 0.15, 59.075);
  evergreenEastCurbBridge.userData.curbSurface = true;
  evergreenEastCurbBridge.userData.roadCriticalDetail = true;
  sidewalkGroup.add(evergreenEastPathBridge, evergreenEastCurbBridge);

  // CURVED WEST APPROACH FOOTPATHS. Derive the road edge, curb and footpath from
  // one shared centreline normal. This removes the small triangular grass notch and
  // concrete tongue that appeared where the curve tightened near the compact junction.
  for (const [side, label] of [[1, 'north'], [-1, 'south']] as const) {
    const pts = side === 1
      ? springfieldBridgeApproachPoints.filter((p) => p.x >= -174.0)
      : springfieldBridgeApproachPoints;
    const path = makeOneSidedStripMesh(
      `springfield_compact_bridge_${label}_path`,
      pts, side, 7.32, 10.65, sidewalkMat, 0.22, 0.055,
    );
    path.renderOrder = 20;
    path.userData.walkable = true;
    path.userData.walkablePriority = 7;
    path.userData.sidewalkSurface = true;
    path.userData.roadCriticalDetail = true;

    const curb = makeOneSidedStripMesh(
      `springfield_compact_bridge_${label}_curb`,
      pts, side, 7.00, 7.32, curbMat, 0.30, 0.0,
    );
    curb.userData.curbSurface = true;
    curb.userData.roadCriticalDetail = true;
    sidewalkGroup.add(path, curb);
  }

  const addCompactPathH = (name:string, x1:number, x2:number, pathZ:number, curbZ:number) => {
    if (x2 <= x1 + 0.1) return;
    const len=x2-x1;
    const path=new THREE.Mesh(new THREE.BoxGeometry(len,0.22,3.6),sidewalkMat);
    path.name=`${name}_path`; path.position.set((x1+x2)/2,0.165,pathZ); path.renderOrder=20;
    path.userData.walkable=true; path.userData.walkablePriority=7; path.userData.sidewalkSurface=true; path.userData.roadCriticalDetail=true;
    const curb=new THREE.Mesh(new THREE.BoxGeometry(len,0.30,0.28),curbMat);
    curb.name=`${name}_curb`; curb.position.set((x1+x2)/2,0.15,curbZ); curb.userData.curbSurface=true; curb.userData.roadCriticalDetail=true;
    sidewalkGroup.add(path,curb);
  };
  const addCompactPathV = (name:string, z1:number, z2:number, pathX:number, curbX:number) => {
    if (z2 <= z1 + 0.1) return;
    const len=z2-z1;
    const path=new THREE.Mesh(new THREE.BoxGeometry(3.6,0.22,len),sidewalkMat);
    path.name=`${name}_path`; path.position.set(pathX,0.165,(z1+z2)/2); path.renderOrder=20;
    path.userData.walkable=true; path.userData.walkablePriority=7; path.userData.sidewalkSurface=true; path.userData.roadCriticalDetail=true;
    const curb=new THREE.Mesh(new THREE.BoxGeometry(0.28,0.30,len),curbMat);
    curb.name=`${name}_curb`; curb.position.set(curbX,0.15,(z1+z2)/2); curb.userData.curbSurface=true; curb.userData.roadCriticalDetail=true;
    sidewalkGroup.add(path,curb);
  };

  // Compact T-junction perimeter. The paths follow the SAME tapered/curved outside
  // boundary as the road rather than placing a rectangular sidewalk partly over the
  // asphalt. The south edge is intentionally continuous because there is no south
  // road here anymore.
  const addCompactRibbon = (
    name: string,
    points: THREE.Vector2[],
    halfWidth: number,
    material: THREE.Material,
    depth: number,
    baseY: number,
    sidewalk = false,
  ) => {
    const ribbon = makeRibbonMesh(name, points, halfWidth, material, depth, baseY);
    ribbon.renderOrder = sidewalk ? 20 : ribbon.renderOrder;
    if (sidewalk) {
      ribbon.userData.walkable = true;
      ribbon.userData.walkablePriority = 7;
      ribbon.userData.sidewalkSurface = true;
    } else {
      ribbon.userData.curbSurface = true;
    }
    ribbon.userData.roadCriticalDetail = true;
    sidewalkGroup.add(ribbon);
  };

  // North-west corner: curved west-road footpath -> west side of north arterial.
  const nwPathCurve = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(-124, -8.85), new THREE.Vector2(-125.85, -14), new THREE.Vector2(-118.85, -14)
  ).getPoints(8);
  const nwCurbCurve = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(-124, -7.16), new THREE.Vector2(-124.16, -14.16), new THREE.Vector2(-117.16, -14)
  ).getPoints(8);
  addCompactRibbon('springfield_compact_t_northwest_path', nwPathCurve, 1.8, sidewalkMat, 0.22, 0.055, true);
  addCompactRibbon('springfield_compact_t_northwest_curb', nwCurbCurve, 0.14, curbMat, 0.30, 0.0);

  // North-east corner: east side of arterial wraps cleanly toward the bridge mouth.
  const nePathCurve = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(-101.15, -14), new THREE.Vector2(-94.15, -14), new THREE.Vector2(-96, -10.85)
  ).getPoints(8);
  const neCurbCurve = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(-102.84, -14), new THREE.Vector2(-95.84, -14.16), new THREE.Vector2(-96, -9.16)
  ).getPoints(8);
  addCompactRibbon('springfield_compact_t_northeast_path', nePathCurve, 1.8, sidewalkMat, 0.22, 0.055, true);
  addCompactRibbon('springfield_compact_t_northeast_curb', neCurbCurve, 0.14, curbMat, 0.30, 0.0);

  // South edge: the west corner still tapers cleanly, but the new X=-110 road mouth
  // must remain open. Its two vertical footpaths meet this perimeter instead of a
  // sidewalk slab running across the road. Only the short south-east verge remains.
  const swPathCurve = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(-124, 8.85), new THREE.Vector2(-122.0, 10.85), new THREE.Vector2(-119, 10.85)
  ).getPoints(6);
  const swCurbCurve = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(-124, 7.16), new THREE.Vector2(-122.5, 9.16), new THREE.Vector2(-119, 9.16)
  ).getPoints(6);
  addCompactRibbon('springfield_compact_t_southwest_path', swPathCurve, 1.8, sidewalkMat, 0.22, 0.055, true);
  addCompactRibbon('springfield_compact_t_southwest_curb', swCurbCurve, 0.14, curbMat, 0.30, 0.0);
  addCompactPathH('springfield_compact_t_southeast', -101.15, -96, 10.85, 9.16);

  // Straight sidewalks up the north arterial approach.
  addCompactPathV('springfield_compact_t_arterial_west', -32, -14, -118.85, -117.16);
  addCompactPathV('springfield_compact_t_arterial_east', -32, -14, -101.15, -102.84);

  // Evergreen Terrace remains the local-road distributor. X=-110 is a through road
  // again, so keep its north-side opening. Only X=-145 gets the restored north
  // sidewalk because that collector still terminates at Evergreen.
  addHorizontalSidewalks(60,198,14,-210,[{center:-310,halfGap:8.2},{center:-145,halfGap:8.2},{center:-110,halfGap:8.2}]);
  for (const x of [-145]) {
    const northPath=new THREE.Mesh(new THREE.BoxGeometry(16.4,0.22,3.6),sidewalkMat);
    northPath.name=`springfield_evergreen_north_sidewalk_restore_${x}`;
    northPath.position.set(x,0.165,51.15); northPath.renderOrder=20;
    northPath.userData.walkable=true; northPath.userData.walkablePriority=7; northPath.userData.sidewalkSurface=true; northPath.userData.roadCriticalDetail=true;
    const northCurb=new THREE.Mesh(new THREE.BoxGeometry(16.4,0.30,0.28),curbMat);
    northCurb.name=`springfield_evergreen_north_curb_restore_${x}`;
    northCurb.position.set(x,0.15,52.84); northCurb.userData.curbSurface=true; northCurb.userData.roadCriticalDetail=true;
    sidewalkGroup.add(northPath,northCurb);
  }
  sidewalkGroup.traverse((obj) => {
    obj.userData.permanentRoadGeometry = true;
    obj.userData.interactivePhysicsObject = false;
  });
  root.add(sidewalkGroup);

  // Short residential/commercial access lanes. Front doors no longer open onto
  // isolated lawns with no practical connection to the street grid.
  const drivewayGroup=new THREE.Group(); drivewayGroup.name='springfield_driveways';
  const addDriveway=(x1:number,z1:number,x2:number,z2:number,width=4.8)=>{
    const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz);
    const road=new THREE.Mesh(new THREE.BoxGeometry(width,0.12,len),asphaltMat);
    road.position.set((x1+x2)/2,0.075,(z1+z2)/2); road.rotation.y=Math.atan2(dx,dz);
    road.userData.walkable=true; road.userData.walkablePriority=6; drivewayGroup.add(road);
  };
  // Evergreen Terrace front paths -> Evergreen Street. Keep these pedestrian
  // approaches inside the actual doorway openings instead of laying a car-width
  // asphalt slab across the house facade.
  addDriveway(-170,37.5,-170,53,2.0);
  addDriveway(-250,37,-250,53,2.0);
  // Commercial/civic frontage lanes terminate at the entrance threshold and are
  // narrower than the real door opening, so neither edge cuts into the wall.
  addDriveway(-270,-122,-270,-110,4.0);
  addDriveway(-270,-70,-270,-60,2.0);
  addDriveway(-210,-122,-210,-110,4.4);
  addDriveway(-140,-122,-140,-110,2.0);
  addDriveway(-150,-71,-150,-60,4.1);
  drivewayGroup.traverse((obj) => {
    obj.userData.permanentRoadGeometry = true;
    obj.userData.interactivePhysicsObject = false;
    if (obj instanceof THREE.Mesh && obj.material === asphaltMat) obj.userData.mapRoadSurface = true;
  });
  root.add(drivewayGroup);

  // Large Simpsons-style cloud silhouettes. These complement the world layer
  // with a few closer Springfield cloud banks, still as one instanced draw call.
  // They sit much higher than buildings/bridges and use several lobe arrangements
  // so the skyline stays bright and cartoony without looking copy-pasted.
  const cloudsGroup = new THREE.Group();
  cloudsGroup.name = 'springfield_moving_clouds';
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0.0,
    fog: false,
    emissive: 0xeef8ff,
    emissiveIntensity: 0.03,
    envMapIntensity: 0.08,
    flatShading: false,
    dithering: true,
  });
  type SpringfieldCloudPuff = [number, number, number, number, number];
  const cloudSeeds = [
    { x: -315, y: 138, z: -135, scale: 3.40, speed: 0.16, width: 1.20, depth: 0.92, rotation:  0.20, variant: 0 },
    { x: -235, y: 164, z:   30, scale: 4.45, speed: 0.12, width: 1.42, depth: 0.82, rotation: -0.52, variant: 1 },
    { x: -145, y: 146, z:  135, scale: 3.25, speed: 0.18, width: 1.08, depth: 1.02, rotation:  0.72, variant: 2 },
    { x:  -75, y: 176, z:  -72, scale: 4.05, speed: 0.13, width: 1.30, depth: 0.88, rotation: -0.18, variant: 1 },
  ];
  const cloudPuffVariants: SpringfieldCloudPuff[][] = [
    [
      [ 0.00,  0.00,  0.00, 3.35, 0.98], [ 2.70, -0.30,  0.10, 2.30, 0.93],
      [-2.55, -0.26, -0.08, 2.20, 0.92], [ 0.95,  1.42,  0.02, 2.40, 1.04],
      [-1.20,  1.18,  0.10, 2.05, 1.02], [ 3.95, -0.44, -0.02, 1.55, 0.91],
      [-3.75, -0.42,  0.05, 1.48, 0.90], [ 0.08, -0.58,  0.32, 2.15, 0.89],
    ],
    [
      [ 0.00, -0.05,  0.00, 3.15, 0.97], [ 2.90, -0.20, -0.10, 2.12, 0.92],
      [-2.20, -0.34,  0.20, 2.38, 0.91], [ 0.30,  1.52,  0.02, 2.48, 1.05],
      [-1.72,  0.94, -0.10, 1.85, 1.01], [ 4.05,  0.14,  0.15, 1.42, 0.94],
      [-3.55, -0.18, -0.22, 1.60, 0.91], [ 1.32, -0.64,  0.28, 2.02, 0.88],
    ],
    [
      [ 0.00, -0.06,  0.00, 3.08, 0.97], [ 2.05, -0.40,  0.28, 2.42, 0.91],
      [-2.88, -0.18, -0.16, 1.98, 0.92], [ 1.45,  1.10, -0.08, 1.98, 1.03],
      [-0.68,  1.58,  0.16, 2.30, 1.05], [ 3.72, -0.18, -0.20, 1.68, 0.93],
      [-4.00, -0.42,  0.18, 1.38, 0.89], [-0.30, -0.66, -0.36, 2.08, 0.88],
    ],
  ];
  const cloudInstances = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1.0, 11, 8),
    cloudMat,
    cloudSeeds.length * cloudPuffVariants[0].length
  );
  cloudInstances.name = 'springfield_cloud_instances';
  cloudInstances.frustumCulled = false;
  cloudInstances.castShadow = false;
  cloudInstances.receiveShadow = false;
  const cloudDummy = new THREE.Object3D();
  const cloudTint = new THREE.Color();
  let cloudInstanceIndex = 0;
  cloudSeeds.forEach((seed) => {
    const puffs = cloudPuffVariants[seed.variant % cloudPuffVariants.length];
    const cosR = Math.cos(seed.rotation);
    const sinR = Math.sin(seed.rotation);
    puffs.forEach(([px, py, pz, puffScale, brightness]) => {
      const rx = px * cosR + pz * sinR;
      const rz = -px * sinR + pz * cosR;
      cloudDummy.position.set(
        seed.x + rx * seed.scale * seed.width,
        seed.y + py * seed.scale,
        seed.z + rz * seed.scale * seed.depth
      );
      cloudDummy.rotation.set(0, seed.rotation, 0);
      cloudDummy.scale.set(
        puffScale * 1.60 * seed.scale * seed.width,
        puffScale * 0.72 * seed.scale,
        puffScale * 0.90 * seed.scale * seed.depth
      );
      cloudDummy.updateMatrix();
      cloudInstances.setMatrixAt(cloudInstanceIndex, cloudDummy.matrix);
      cloudTint.setRGB(brightness, brightness, Math.min(1.0, brightness * 1.025));
      cloudInstances.setColorAt(cloudInstanceIndex, cloudTint);
      cloudInstanceIndex += 1;
    });
  });
  cloudInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (cloudInstances.instanceColor) cloudInstances.instanceColor.needsUpdate = true;
  cloudsGroup.userData.cloudSeeds = cloudSeeds;
  cloudsGroup.userData.cloudPuffVariants = cloudPuffVariants;
  cloudsGroup.add(cloudInstances);
  root.add(cloudsGroup);

  // -------------------------------------------------------------------------
  // 2. SUBURBAN PROPS: WOODEN POWER POLES, MAILBOXES, HEDGES
  // -------------------------------------------------------------------------
  const subProps = new THREE.Group();
  subProps.name = 'springfield_suburban_props';

  for (const px of [-290, -270, -230, -190, -130]) {
    const pole = new THREE.Group();
    pole.position.set(px, 0, 50);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 9.0, 6), woodMat);
    post.position.y = 4.5;
    const crossArm = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 0.2), woodMat);
    crossArm.position.y = 8.5;
    const insL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 4), createMaterial(0x00acc1));
    insL.position.set(-1.2, 8.7, 0);
    const insR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 4), createMaterial(0x00acc1));
    insR.position.set(1.2, 8.7, 0);
    pole.add(post, crossArm, insL, insR);
    subProps.add(pole);
    destructibles.push({
      id: `springfield_power_pole_${px}`, mesh: pole, type: 'lamp',
      position: { x: px, y: 0, z: 50 }, destroyed: false,
    });
  }

  root.add(subProps);

  // -------------------------------------------------------------------------
  // UPDATE 5: HIGH-QUALITY, REUSABLE RESIDENTIAL PICKET FENCES
  // -------------------------------------------------------------------------
  // These are authored as SMALL interactive sections instead of one enormous
  // fence mesh. That gives them Simpsons-style knock-over physics while keeping
  // driveways, front paths and gates genuinely open. Every section is pushed
  // through the reusable prop lifecycle, so its collider travels with it after
  // an impact and remains physical after it settles.
  const picketFenceMaterials = new Map<number, THREE.MeshStandardMaterial>();
  const picketMaterial = (color: number) => {
    const existing = picketFenceMaterials.get(color);
    if (existing) return existing;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02 });
    picketFenceMaterials.set(color, mat);
    return mat;
  };

  const createPicketFenceSection = (
    id: string,
    cx: number,
    cz: number,
    length: number,
    rotationY = 0,
    color = 0xfff8dc
  ) => {
    const section = new THREE.Group();
    section.name = `interactive_picket_fence_${id}`;
    section.position.set(cx, 0, cz);
    section.rotation.y = rotationY;
    // Fence collision must begin exactly at the visible fence. The invisible
    // envelope below already matches the outer posts/rails, so add no padding.
    section.userData.colliderPadding = 0;
    section.userData.interactivePhysicsObject = true;

    const mat = picketMaterial(color);
    const railMat = picketMaterial(Math.max(0, color - 0x080808));
    const sectionHeight = 1.42;
    const railDepth = 0.13;
    const railThickness = 0.13;

    // Two continuous rails give the panel a believable timber frame.
    for (const ry of [0.48, 0.98]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, railThickness, railDepth), railMat);
      rail.position.set(0, ry, 0);
      rail.castShadow = true;
      section.add(rail);
    }

    // Individual tapered pickets keep the silhouette readable up close. Use
    // instancing inside each knockable panel so the neighbourhood does not undo
    // the earlier performance optimisation with hundreds of tiny draw calls.
    const spacing = 0.47;
    const count = Math.max(3, Math.floor(length / spacing));
    const usable = Math.max(0.1, length - 0.32);
    const boardGeo = new THREE.BoxGeometry(0.16, 1.14, 0.12);
    const tipGeo = new THREE.ConeGeometry(0.13, 0.24, 4);
    const boards = new THREE.InstancedMesh(boardGeo, mat, count);
    const tips = new THREE.InstancedMesh(tipGeo, mat, count);
    boards.name = `${id}_picket_boards`;
    tips.name = `${id}_picket_tips`;
    boards.castShadow = tips.castShadow = true;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const px = -usable / 2 + usable * t;
      matrix.compose(new THREE.Vector3(px, 0.62, 0), quat, scale);
      boards.setMatrixAt(i, matrix);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      matrix.compose(new THREE.Vector3(px, 1.31, 0), quat, scale);
      tips.setMatrixAt(i, matrix);
      quat.identity();
    }
    boards.instanceMatrix.needsUpdate = true;
    tips.instanceMatrix.needsUpdate = true;
    section.add(boards, tips);

    // Slightly taller end posts make each opening read visually as a gate/yard
    // boundary without putting a collision mesh across the actual opening.
    const postGeo = new THREE.BoxGeometry(0.24, sectionHeight, 0.24);
    const capGeo = new THREE.ConeGeometry(0.19, 0.26, 4);
    const posts = new THREE.InstancedMesh(postGeo, railMat, 2);
    const caps = new THREE.InstancedMesh(capGeo, railMat, 2);
    posts.castShadow = caps.castShadow = true;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const px = side * Math.max(0, length / 2 - 0.12);
      quat.identity();
      matrix.compose(new THREE.Vector3(px, sectionHeight / 2, 0), quat, scale);
      posts.setMatrixAt(i, matrix);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      matrix.compose(new THREE.Vector3(px, sectionHeight + 0.13, 0), quat, scale);
      caps.setMatrixAt(i, matrix);
    }
    posts.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    section.add(posts, caps);

    // Invisible, zero-draw collision envelope: Box3-based interactive collision
    // remains exact even though the pickets themselves are instanced.
    const colliderEnvelope = new THREE.Mesh(
      new THREE.BoxGeometry(length, sectionHeight + 0.26, 0.24),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    colliderEnvelope.name = `${id}_collision_envelope`;
    colliderEnvelope.position.y = (sectionHeight + 0.26) / 2;
    section.add(colliderEnvelope);

    root.add(section);
    destructibles.push({
      id: `picket_${id}`,
      mesh: section,
      type: 'fence',
      position: { x: cx, y: 0, z: cz },
      destroyed: false,
    });
    return section;
  };

  const addPicketRunX = (
    idPrefix: string,
    z: number,
    ranges: Array<[number, number]>,
    color = 0xfff8dc,
    maxPanel = 3.8
  ) => {
    let panelIndex = 0;
    for (const [a, b] of ranges) {
      const total = Math.max(0, b - a);
      if (total < 0.65) continue;
      const panels = Math.max(1, Math.ceil(total / maxPanel));
      const panelLength = total / panels;
      for (let i = 0; i < panels; i++) {
        createPicketFenceSection(
          `${idPrefix}_${panelIndex++}`,
          a + panelLength * (i + 0.5),
          z,
          Math.max(0.7, panelLength - 0.08),
          0,
          color
        );
      }
    }
  };

  const addPicketRunZ = (
    idPrefix: string,
    x: number,
    ranges: Array<[number, number]>,
    color = 0xfff8dc,
    maxPanel = 3.8
  ) => {
    let panelIndex = 0;
    for (const [a, b] of ranges) {
      const total = Math.max(0, b - a);
      if (total < 0.65) continue;
      const panels = Math.max(1, Math.ceil(total / maxPanel));
      const panelLength = total / panels;
      for (let i = 0; i < panels; i++) {
        createPicketFenceSection(
          `${idPrefix}_${panelIndex++}`,
          x,
          a + panelLength * (i + 0.5),
          Math.max(0.7, panelLength - 0.08),
          Math.PI / 2,
          color
        );
      }
    }
  };

  // -------------------------------------------------------------------------
  // 3. IMPORTANT LANDMARK 1: 742 EVERGREEN TERRACE (THE SIMPSONS HOUSE)
  // -------------------------------------------------------------------------
  const homerHouse = new THREE.Group();
  homerHouse.name = '742_evergreen_terrace_simpsons_house';
  const houseCenter = new THREE.Vector3(-210, 0, 30);
  homerHouse.position.copy(houseCenter);

  const lawn = new THREE.Mesh(new THREE.BoxGeometry(40, 0.2, 45), grassMat);
  lawn.position.set(0, 0.05, 0);
  lawn.userData.walkable = true;
  homerHouse.add(lawn);

  const driveway = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.22, 28), concreteMat);
  driveway.position.set(12, 0.06, 12);
  driveway.userData.walkable = true;
  homerHouse.add(driveway);

  const footpath = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.22, 14), sidewalkMat);
  footpath.position.set(-3, 0.06, 15);
  footpath.userData.walkable = true;
  footpath.userData.sidewalkSurface = true;
  footpath.userData.roadCriticalDetail = true;
  homerHouse.add(footpath);

  // FIX 1 fence audit: the old Simpsons side boundaries were single 15 cm
  // box strips. They were technically visible, but read like invisible collision
  // from normal third-person camera distance and were a frequent source of
  // "ghost fence" reports. Replace them with the SAME segmented picket system
  // used at the front so visible geometry and reusable physics collision agree.
  // Keep the rear 3 m+ open beside the former road alignment instead of silently
  // restoring the deleted rear fence from Update 3.

  // A proper front-yard picket fence, with two deliberate openings: the front
  // path at X≈-213 and the garage driveway at X≈-198.
  addPicketRunX('simpsons_front', 51.25, [
    [-229.0, -215.2],
    [-210.8, -202.7],
    [-193.3, -191.0],
  ], 0xfff4c2);
  addPicketRunZ('simpsons_left_side', -229.0, [[11.8, 51.25]], 0xfff4c2);
  addPicketRunZ('simpsons_right_side', -191.0, [[11.8, 51.25]], 0xfff4c2);

  const houseWidth = 22;
  const houseDepth = 16;
  const houseHeight = 7.5;

  const intFloor = new THREE.Mesh(new THREE.BoxGeometry(houseWidth - 0.4, 0.22, houseDepth - 0.4), createMaterial(0xd7ccc8));
  intFloor.position.set(0, 0.11, 0);
  intFloor.userData.walkable = true;
  intFloor.userData.walkablePriority = 10;
  homerHouse.add(intFloor);

  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(houseWidth, houseHeight, 0.6), homerWallMat);
  wallBack.position.set(0, houseHeight / 2, -houseDepth / 2);
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, houseHeight, houseDepth), homerWallMat);
  wallLeft.position.set(-houseWidth / 2, houseHeight / 2, 0);
  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, houseHeight, houseDepth), homerWallMat);
  wallRight.position.set(houseWidth / 2, houseHeight / 2, 0);

  const simpsonsFrontDoorWidth = 3.2;
  const simpsonsDoorCenterX = -3;
  const leftFrontWidth = (simpsonsDoorCenterX - simpsonsFrontDoorWidth / 2) - (-houseWidth / 2);
  const rightFrontStart = simpsonsDoorCenterX + simpsonsFrontDoorWidth / 2;
  const rightFrontWidth = houseWidth / 2 - rightFrontStart;
  const wallFrontLeft = new THREE.Mesh(new THREE.BoxGeometry(leftFrontWidth, houseHeight, 0.6), homerWallMat);
  wallFrontLeft.position.set(-houseWidth / 2 + leftFrontWidth / 2, houseHeight / 2, houseDepth / 2);
  const wallFrontRight = new THREE.Mesh(new THREE.BoxGeometry(rightFrontWidth, houseHeight, 0.6), homerWallMat);
  wallFrontRight.position.set(rightFrontStart + rightFrontWidth / 2, houseHeight / 2, houseDepth / 2);
  const wallFrontHeader = new THREE.Mesh(new THREE.BoxGeometry(simpsonsFrontDoorWidth, houseHeight - 3.5, 0.6), homerWallMat);
  wallFrontHeader.position.set(simpsonsDoorCenterX, 3.5 + (houseHeight - 3.5) / 2, houseDepth / 2);
  homerHouse.add(wallBack, wallLeft, wallRight, wallFrontLeft, wallFrontRight, wallFrontHeader);
  markSolid(wallBack, wallLeft, wallRight, wallFrontLeft, wallFrontRight, wallFrontHeader);

  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.4, 2.8), homerRoofMat);
  porchRoof.userData.landableRoof = true;
  porchRoof.position.set(-3, 3.8, houseDepth / 2 + 1.4);
  const porchPostL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 6), whiteMat);
  porchPostL.position.set(-4.6, 1.8, houseDepth / 2 + 2.5);
  const porchPostR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 6), whiteMat);
  porchPostR.position.set(-1.4, 1.8, houseDepth / 2 + 2.5);
  markSolid(porchPostL, porchPostR);
  homerHouse.add(porchRoof, porchPostL, porchPostR);

  // Stable Simpsons gable roof. The previous two thick boxes physically overlapped
  // through the ridge, which caused obvious z-fighting/flicker from several angles.
  // These panels meet at a shared ridge without intersecting, then a small ridge cap
  // hides the seam. The visible roof panels are registered later as exact landable
  // roof meshes; they are NOT converted into one giant building-sized collision box.
  const roofRun = houseDepth / 2 + 1.0;
  const roofRise = 3.85;
  const roofSlope = Math.atan2(roofRise, roofRun);
  const roofLength = Math.hypot(roofRun, roofRise) - 0.08;
  const roofCenterY = houseHeight + roofRise / 2;
  const roofCenterZ = roofRun / 2 + 0.025;
  const stableRoofMat = homerRoofMat.clone();
  stableRoofMat.side = THREE.DoubleSide;
  stableRoofMat.polygonOffset = true;
  stableRoofMat.polygonOffsetFactor = -1;
  stableRoofMat.polygonOffsetUnits = -1;
  const roofFront = new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.18, roofLength), stableRoofMat);
  roofFront.userData.landableRoof = true;
  roofFront.position.set(0, roofCenterY, roofCenterZ);
  roofFront.rotation.x = roofSlope;
  const roofBack = new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.18, roofLength), stableRoofMat);
  roofBack.userData.landableRoof = true;
  roofBack.position.set(0, roofCenterY, -roofCenterZ);
  roofBack.rotation.x = -roofSlope;
  const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(24.8, 0.22, 0.32), homerTrimMat);
  ridgeCap.position.set(0, houseHeight + roofRise + 0.02, 0);
  homerHouse.add(roofFront, roofBack, ridgeCap);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.6, 11.5, 2.2), brickMat);
  chimney.position.set(-houseWidth / 2 - 0.4, 5.75, 1.0);
  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 2.6), createMaterial(0x37474f));
  chimneyCap.position.set(-houseWidth / 2 - 0.4, 11.7, 1.0);
  homerHouse.add(chimney, chimneyCap);

  const bayWin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 1.4), homerTrimMat);
  bayWin.position.set(-8, 2.2, houseDepth / 2 + 0.6);
  const bayGlass = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.0, 0.08), glassMat);
  bayGlass.position.set(-8, 2.2, houseDepth / 2 + 1.43);
  homerHouse.add(bayWin, bayGlass);

  const winPositions = [-7, -2, 3, 8];
  winPositions.forEach((wx) => {
    const sash = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 0.08), glassMat);
    sash.position.set(wx, 5.4, houseDepth / 2 + 0.38);
    const shutterL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.1), homerTrimMat);
    shutterL.position.set(wx - 1.25, 5.4, houseDepth / 2 + 0.43);
    const shutterR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.1), homerTrimMat);
    shutterR.position.set(wx + 1.25, 5.4, houseDepth / 2 + 0.43);
    homerHouse.add(sash, shutterL, shutterR);
  });

  const garageBody = new THREE.Mesh(new THREE.BoxGeometry(8, 5.0, 14), homerWallMat);
  garageBody.position.set(houseWidth / 2 + 4, 2.5, 0);
  const garageRoof = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 14.6), homerRoofMat);
  garageRoof.userData.landableRoof = true;
  garageRoof.position.set(houseWidth / 2 + 4, 5.25, 0);
  const garageDoor = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.0, 0.3), homerTrimMat);
  garageDoor.position.set(houseWidth / 2 + 4, 2.0, 7.15);
  markSolid(garageBody, garageDoor);
  homerHouse.add(garageBody, garageRoof, garageDoor);

  // Classic segmented garage door + front garden details.
  for (let row = 0; row < 4; row++) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.055, 0.045), createMaterial(0xc0a38b));
    seam.position.set(houseWidth / 2 + 4, 0.6 + row * 0.9, 7.34);
    homerHouse.add(seam);
  }
  for (const sx of [-8.7, -6.2, 4.6, 7.2]) {
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), createMaterial(0x4f8a3f));
    shrub.scale.set(1.35, 0.72, 0.82);
    shrub.position.set(sx, 0.65, houseDepth / 2 + 1.0);
    markSolid(shrub);
    homerHouse.add(shrub);
  }
  const numberPlaque = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 0.08), createMaterial(0xf3dfae));
  numberPlaque.position.set(-5.0, 2.65, houseDepth / 2 + 0.36);
  homerHouse.add(numberPlaque);

  // --- FULLY MODELED WALK-IN INTERIOR ---
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.05, 16), simpsonRugMat);
  rug.scale.set(1.3, 1, 1.0);
  rug.position.set(-4, 0.24, 0);
  homerHouse.add(rug);

  const couchGroup = new THREE.Group();
  couchGroup.position.set(-4, 0.2, -3.2);
  const couchSeat = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 1.4), homerCouchMat);
  couchSeat.position.y = 0.35;
  const couchBack = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 0.4), homerCouchMat);
  couchBack.position.set(0, 0.95, -0.6);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 1.6), homerCouchMat);
  armL.position.set(-1.8, 0.55, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 1.6), homerCouchMat);
  armR.position.set(1.8, 0.55, 0);
  couchGroup.add(couchSeat, couchBack, armL, armR);
  markSolid(couchSeat, couchBack, armL, armR);

  const familyGroup = createSimpsonsFamilyOnCouch();
  couchGroup.add(familyGroup);
  homerHouse.add(couchGroup);

  const tvGroup = new THREE.Group();
  tvGroup.position.set(-4, 0.2, 3.0);
  const tvStand = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.0), darkWoodMat);
  tvStand.position.y = 0.4;
  const tvBox = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 1.0), createMaterial(0x424242));
  tvBox.position.y = 1.45;
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshBasicMaterial({ color: 0x66c7ff }));
  tvScreen.name = 'simpsons_tv_screen';
  tvScreen.userData.tvOn = true;
  tvScreen.position.set(0, 1.45, -0.51);
  tvScreen.rotation.y = Math.PI;

  const tvLight = new THREE.PointLight(0x80d8ff, 2.4, 9.0);
  tvLight.position.set(0, 1.45, -0.4);
  tvGroup.add(tvLight);

  const antL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), createMaterial(0x9e9e9e));
  antL.rotation.z = Math.PI / 4;
  antL.position.set(-0.3, 2.3, 0);
  const antR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), createMaterial(0x9e9e9e));
  antR.rotation.z = -Math.PI / 4;
  antR.position.set(0.3, 2.3, 0);
  // Tiny bright cartoon silhouettes on the screen make it unmistakably switched on.
  const tvCartoonYellow = new THREE.Mesh(new THREE.CircleGeometry(0.13, 8), new THREE.MeshBasicMaterial({ color: 0xffdf3d }));
  tvCartoonYellow.position.set(-0.22, 1.50, -0.525); tvCartoonYellow.rotation.y = Math.PI;
  const tvCartoonPink = new THREE.Mesh(new THREE.CircleGeometry(0.10, 8), new THREE.MeshBasicMaterial({ color: 0xff5d9e }));
  tvCartoonPink.position.set(0.23, 1.40, -0.526); tvCartoonPink.rotation.y = Math.PI;
  tvGroup.add(tvStand, tvBox, tvScreen, tvCartoonYellow, tvCartoonPink, antL, antR);
  markSolid(tvStand, tvBox);
  homerHouse.add(tvGroup);

  const paintingGroup = new THREE.Group();
  paintingGroup.position.set(-4, 3.2, -houseDepth / 2 + 0.35);
  const pFrame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.08), createMaterial(0xffb300));
  const pCanvas = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), createMaterial(0x90caf9));
  pCanvas.position.z = 0.05;
  const boat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 3), createMaterial(0xffffff));
  boat.position.set(0, 0.1, 0.07);
  paintingGroup.add(pFrame, pCanvas, boat);
  homerHouse.add(paintingGroup);

  // Rebuilt staircase for normal walking. It is intentionally wider than the
  // player's collision diameter and starts flush with the downstairs floor, so
  // there is no jump-only first step. A thin hidden walkable ramp sits just under
  // the visible treads to give smooth up/down collision while the steps still look
  // like real stairs.
  const stairGroup = new THREE.Group();
  const stairStartZ = -5.75;
  const stairWidth = 3.05;
  const stairCount = 14;
  const lowerFloorY = 0.22;
  const upperFloorY = 4.08;
  const stairRise = (upperFloorY - lowerFloorY) / stairCount;
  const stairRun = 0.43;
  stairGroup.position.set(1.35, 0, stairStartZ);
  for (let si = 0; si < stairCount; si++) {
    const stepTop = lowerFloorY + stairRise * (si + 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, stairRise, stairRun + 0.05), woodMat);
    step.name = `simpsons_house_stair_${si}`;
    step.position.set(0, stepTop - stairRise / 2, si * stairRun + stairRun / 2);
    markWalkableStairSurface(step, 38, 0.82);
    stairGroup.add(step);
  }
  const totalRun = stairCount * stairRun;
  const totalRise = upperFloorY - lowerFloorY;
  const stairAngle = Math.atan2(totalRise, totalRun);
  const smoothRampMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const smoothRamp = new THREE.Mesh(new THREE.BoxGeometry(stairWidth - 0.12, 0.08, Math.hypot(totalRun, totalRise)), smoothRampMat);
  smoothRamp.name = 'simpsons_stair_collision_ramp';
  smoothRamp.position.set(0, (lowerFloorY + upperFloorY) / 2 - 0.035, totalRun / 2);
  smoothRamp.rotation.x = -stairAngle;
  markWalkableStairSurface(smoothRamp, 40, 0.86);
  stairGroup.add(smoothRamp);
  const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, Math.hypot(totalRun, totalRise) + 0.3), darkWoodMat);
  handrail.position.set(stairWidth / 2 + 0.08, (lowerFloorY + upperFloorY) / 2 + 0.55, totalRun / 2);
  handrail.rotation.x = -stairAngle;
  const handrailLeft = handrail.clone();
  handrailLeft.position.x = -stairWidth / 2 - 0.08;
  markStairRailing(handrail, handrailLeft);
  stairGroup.add(handrail, handrailLeft);
  homerHouse.add(stairGroup);

  const table = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.1, 12), woodMat);
  table.position.set(6.0, 1.05, 1.5);
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.0, 6), woodMat);
  tableLeg.position.set(6.0, 0.5, 1.5);
  markSolid(table, tableLeg);
  homerHouse.add(table, tableLeg);

  // Iconic Simpsons-style interior: living room left, archway/hall centre,
  // green kitchen + dining area on the right. The TV/couch above are preserved.
  const interiorPink = createMaterial(0xe9a2a6, 0.86, 0.02);
  const archTrim = createMaterial(0x7b4f3c, 0.8, 0.03);
  const kitchenGreen = createMaterial(0x9acb79, 0.82, 0.03);
  const kitchenMint = createMaterial(0xc8e6c9, 0.75, 0.02);
  const applianceMat = createMaterial(0xe8edf0, 0.42, 0.18);

  // Partial dividing wall with a wide arch opening from living room to hall/dining.
  // Keep the rear divider well clear of the staircase approach. The previous
  // section ran beside the first several treads and made the usable width feel
  // much tighter than the visible stairs.
  const dividerA = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.8, 1.6), interiorPink);
  dividerA.position.set(2.1, 1.9, -7.0);
  const dividerB = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.8, 4.0), interiorPink);
  dividerB.position.set(2.1, 1.9, 5.7);
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 3.4), archTrim);
  archTop.position.set(2.1, 3.45, 0);
  markSolid(dividerA, dividerB);
  homerHouse.add(dividerA, dividerB, archTop);

  // Green kitchen along the rear-right wall.
  for (let i = 0; i < 4; i++) {
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 0.65), kitchenGreen);
    cabinet.position.set(4.3 + i * 1.75, 0.48, -6.9);
    homerHouse.add(cabinet);
    markSolid(cabinet);
  }
  const counter = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.18, 0.9), kitchenMint);
  counter.position.set(6.9, 1.03, -6.85);
  const fridge = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.9, 1.25), applianceMat);
  fridge.position.set(9.0, 1.45, -5.6);
  const oven = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 1.15), createMaterial(0x90a4ae, 0.35, 0.45));
  oven.position.set(4.2, 0.62, -5.8);
  const sink = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.7), createMaterial(0xb0bec5, 0.25, 0.5));
  sink.position.set(6.7, 1.16, -6.55);
  markSolid(fridge, oven);
  markSolid(counter);
  homerHouse.add(counter, fridge, oven, sink);

  // Four dining chairs around the round table.
  [[4.5, 1.5], [7.5, 1.5], [6.0, 0.0], [6.0, 3.0]].forEach(([cx, cz], i) => {
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.72), createMaterial(0x5d4037));
    seat.position.y = 0.55;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.12), createMaterial(0x5d4037));
    back.position.set(0, 0.95, -0.3);
    chair.add(seat, back);
    chair.position.set(cx, 0, cz);
    chair.rotation.y = i * Math.PI / 2;
    markSolid(seat, back);
    markSittable(seat, 'Dining chair');
    homerHouse.add(chair);
  });

  // Entry side table and lamp near the front door.
  const entryTable = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.55), darkWoodMat);
  entryTable.position.set(-7.9, 0.4, 6.7);
  const entryLamp = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 8), createMaterial(0xffe082));
  entryLamp.position.set(-7.9, 1.15, 6.7);
  markSolid(entryTable);
  homerHouse.add(entryTable, entryLamp);

  // PLAYABLE SECOND STOREY -------------------------------------------------
  // Three slabs leave an open stairwell instead of sealing the staircase with a
  // single floor box. The player can actually walk upstairs into the bedrooms.
  const upperFloorMat = createMaterial(0xd6b58c, 0.82, 0.02);
  const upperLeft = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 15.0), upperFloorMat);
  upperLeft.position.set(-5.25, 4.08, 0);
  const upperRight = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.22, 15.0), upperFloorMat);
  upperRight.position.set(7.25, 4.08, 0);
  const upperFrontBridge = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.22, 5.2), upperFloorMat);
  upperFrontBridge.position.set(1.55, 4.08, 4.9);
  [upperLeft, upperRight, upperFrontBridge].forEach((floor) => {
    floor.userData.walkable = true;
    floor.userData.walkablePriority = 30;
    homerHouse.add(floor);
  });

  // Stair-top landing patches the previous 2m hole between the final stair and
  // the upstairs bridge. It is intentionally just large enough to step onto while
  // leaving the stairwell open behind the player.
  const upperLanding = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.22, 2.5), upperFloorMat);
  upperLanding.position.set(1.55, 4.08, 1.15);
  upperLanding.name = 'simpsons_house_stair_upper_landing';
  markWalkableStairSurface(upperLanding, 39, 0.86);
  homerHouse.add(upperLanding);
  const landingRailL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 2.4), homerTrimMat);
  landingRailL.position.set(-0.17, 4.6, 1.15);
  const landingRailR = landingRailL.clone(); landingRailR.position.x = 3.27;
  markStairRailing(landingRailL, landingRailR); homerHouse.add(landingRailL, landingRailR);

  const upperWallMat = createMaterial(0xf0b0b4, 0.84, 0.02);
  // Upstairs navigation wall. The old layout used two long solid wall slabs and
  // effectively trapped the player in a bedroom. Two generous 3.6m openings now
  // connect both left bedrooms to the hall; with a 0.65m player radius this leaves
  // over a metre of forgiving clearance on either side of the character.
  const upperHallRear = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.1, 1.3), upperWallMat);
  upperHallRear.position.set(-1.6, 5.62, -6.85);
  const upperHallMiddle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.1, 5.5), upperWallMat);
  upperHallMiddle.position.set(-1.6, 5.62, 0.15);
  const upperHallFront = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.1, 1.0), upperWallMat);
  upperHallFront.position.set(-1.6, 5.62, 7.0);
  const upperCross = new THREE.Mesh(new THREE.BoxGeometry(9.2, 3.1, 0.28), upperWallMat);
  upperCross.position.set(-6.1, 5.62, 0.7);
  markSolid(upperHallRear, upperHallMiddle, upperHallFront, upperCross);
  homerHouse.add(upperHallRear, upperHallMiddle, upperHallFront, upperCross);

  // Visible doorway trim makes the intended bedroom paths obvious without adding
  // extra collision inside the openings.
  for (const dz of [-4.4, 4.7]) {
    const topTrim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 3.75), homerTrimMat);
    topTrim.position.set(-1.6, 7.08, dz);
    homerHouse.add(topTrim);
  }

  const makeBed = (x: number, z: number, color: number) => {
    const bed = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.42, 1.75), darkWoodMat);
    base.position.y = 0.24;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.34, 1.6), createMaterial(color));
    mattress.position.y = 0.60;
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.18, 1.2), createMaterial(0xf5f5f5));
    pillow.position.set(-0.9, 0.86, 0);
    bed.add(base, mattress, pillow);
    bed.position.set(x, 4.18, z);
    markSolid(base, mattress);
    homerHouse.add(bed);
  };
  // Bart's blue room, Lisa's warmer room, Homer & Marge's larger bedroom.
  makeBed(-7.7, -4.4, 0x42a5f5);
  makeBed(-7.7, 4.8, 0xf48fb1);
  makeBed(6.6, -4.4, 0x81c784);

  const bartDesk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.0), darkWoodMat);
  bartDesk.position.set(-7.1, 4.63, -6.5);
  const lisaDesk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.0), darkWoodMat);
  lisaDesk.position.set(-7.0, 4.63, 6.0);
  markSolid(bartDesk, lisaDesk);
  homerHouse.add(bartDesk, lisaDesk);

  // The stair landing is protected by side rails above. Do not place a cross-rail
  // across the landing-to-hall seam: that was an invisible-feeling blocker at the
  // exact place the player needs to walk after climbing the stairs.

  const intCeilingLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff3d0 }));
  intCeilingLamp.position.set(-4, 3.8, 0);
  homerHouse.add(intCeilingLamp);

  const mbGroup = new THREE.Group();
  mbGroup.position.set(-1.2, 0, 16);
  const mbPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), woodMat);
  mbPost.position.y = 0.6;
  const mbBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.8), createMaterial(0x1976d2));
  mbBox.position.y = 1.2;
  const mbFlag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.15), createMaterial(0xd32f2f));
  mbFlag.position.set(0.28, 1.3, 0.2);
  mbGroup.add(mbPost, mbBox, mbFlag);
  homerHouse.add(mbGroup);

  root.add(homerHouse);

  const simpsonsDoor = new Door({
    id: 'simpsons_front_door',
    name: 'Simpsons Front Glass Door',
    houseName: '742 Evergreen Terrace (Simpsons)',
    type: 'double_slide',
    width: 3.2,
    height: 3.4,
    worldPos: new THREE.Vector3(-213, 0, 38),
    frameColor: 0x5d4037,
    glassColor: 0x80deea,
  });
  root.add(simpsonsDoor.group);
  doors.push(simpsonsDoor);

  const ashMesh = createAshKetchumModel();
  ashMesh.position.set(-217.0, 0.12, 42.2);
  // Face out toward Evergreen Terrace, away from the house.
  ashMesh.rotation.y = 0;
  root.add(ashMesh);

  wallColliders.push(
    { id: 'simpson_wall_back', minX: -221.5, maxX: -198.5, minZ: 21.6, maxZ: 22.4 },
    { id: 'simpson_wall_left', minX: -221.4, maxX: -220.6, minZ: 21.6, maxZ: 38.4 },
    { id: 'simpson_wall_right', minX: -199.4, maxX: -198.6, minZ: 21.6, maxZ: 38.4 },
    { id: 'simpson_wall_front_l', minX: -221.4, maxX: -214.65, minZ: 37.6, maxZ: 38.4 },
    { id: 'simpson_wall_front_r', minX: -211.35, maxX: -198.6, minZ: 37.6, maxZ: 38.4 },
    { id: 'simpson_garage_right', minX: -191.4, maxX: -190.6, minZ: 22.6, maxZ: 37.4 },
    { id: 'simpson_garage_back', minX: -199.4, maxX: -190.6, minZ: 22.6, maxZ: 23.4 },
    { id: 'simpson_garage_front', minX: -199.4, maxX: -190.6, minZ: 36.6, maxZ: 37.4 }
  );

  landmarks.push({
    id: 'simpsons_house',
    name: '742 Evergreen Terrace (Simpsons House / Ash Duel)',
    category: 'simpsons_house',
    x: -210,
    z: 30,
    icon: 'home',
    color: '#ffb300',
  });

  // -------------------------------------------------------------------------
  // 4. SUBURBAN HOUSES ON EVERGREEN TERRACE
  // -------------------------------------------------------------------------
  const flandersHouse = new THREE.Group();
  flandersHouse.name = '744_evergreen_terrace_flanders_house';
  flandersHouse.position.set(-170, 0, 30);
  const flLawn = new THREE.Mesh(new THREE.BoxGeometry(32, 0.2, 45), grassMat);
  flLawn.position.set(0, 0.05, 0);
  const flFloor = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.2, 14.2), createMaterial(0x7e57c2, 0.7, 0.1));
  flFloor.position.set(0, 0.1, 0);
  flFloor.userData.walkable = true;

  const flWallW = 20;
  const flWallD = 15;
  const flWallH = 8.0;
  const flBack = new THREE.Mesh(new THREE.BoxGeometry(flWallW, flWallH, 0.6), flandersWallMat);
  flBack.position.set(0, flWallH / 2, -flWallD / 2);
  const flLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, flWallH, flWallD), flandersWallMat);
  flLeft.position.set(-flWallW / 2, flWallH / 2, 0);
  const flRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, flWallH, flWallD), flandersWallMat);
  flRight.position.set(flWallW / 2, flWallH / 2, 0);

  const flFrontL = new THREE.Mesh(new THREE.BoxGeometry((flWallW - 2.4) / 2, flWallH, 0.6), flandersWallMat);
  flFrontL.position.set(-(flWallW / 2 + 1.2) / 2, flWallH / 2, flWallD / 2);
  const flFrontR = new THREE.Mesh(new THREE.BoxGeometry((flWallW - 2.4) / 2, flWallH, 0.6), flandersWallMat);
  flFrontR.position.set((flWallW / 2 + 1.2) / 2, flWallH / 2, flWallD / 2);
  const flFrontHeader = new THREE.Mesh(new THREE.BoxGeometry(2.4, flWallH - 3.5, 0.6), flandersWallMat);
  flFrontHeader.position.set(0, 3.5 + (flWallH - 3.5) / 2, flWallD / 2);
  flandersHouse.add(flFloor, flBack, flLeft, flRight, flFrontL, flFrontR, flFrontHeader);
  markSolid(flBack, flLeft, flRight, flFrontL, flFrontR, flFrontHeader);

  const flRug = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.04, 16), createMaterial(0x81c784));
  flRug.position.set(0, 0.12, -1);
  const flChair = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.8), createMaterial(0x5e35b1));
  flChair.position.set(0, 0.5, -3.5);
  const flBibleDesk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.2), woodMat);
  flBibleDesk.position.set(4.5, 0.45, 0);
  const flLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff4b8 }));
  flLamp.position.set(0, 4.0, 0);
  flandersHouse.add(flRug, flChair, flBibleDesk, flLamp);

  // Flanders' house should read as a lived-in neighbour house, not an empty shell.
  const flSofa = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.0, 1.65), createMaterial(0x6a4c93));
  flSofa.position.set(-3.6, 0.52, -3.9); markSolid(flSofa);
  const flCoffee = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 1.35), woodMat);
  flCoffee.position.set(-3.6, 0.25, -1.7); markSolid(flCoffee);
  const flTVBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.65, 0.65), createMaterial(0x5d4037));
  flTVBody.position.set(-3.6, 0.86, 5.6); markSolid(flTVBody);
  const flTVScreen = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 0.06), new THREE.MeshBasicMaterial({ color: 0x81d4fa }));
  flTVScreen.position.set(-3.6, 1.0, 5.27);
  // Ned's tidy kitchen on the east side.
  const flKitchenBack = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.05, 1.1), createMaterial(0xf5f5f5));
  flKitchenBack.position.set(5.7, 0.53, -5.8); markSolid(flKitchenBack);
  const flKitchenSide = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.05, 5.4), createMaterial(0xf5f5f5));
  flKitchenSide.position.set(8.0, 0.53, -3.1); markSolid(flKitchenSide);
  const flDining = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.18, 2.0), woodMat);
  flDining.position.set(4.2, 0.9, 1.7); markSolid(flDining);
  for (const [x,z] of [[2.3,1.7],[6.1,1.7],[4.2,0.1],[4.2,3.3]] as const) {
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.75,0.85,0.75),createMaterial(0x8d6e63));
    chair.position.set(x,0.43,z); markSolid(chair); markSittable(chair, 'Chair'); flandersHouse.add(chair);
  }
  const flBookcase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.9, 4.4), createMaterial(0x6d4c41));
  flBookcase.position.set(-9.1,1.45,0.8); markSolid(flBookcase);
  // Stable facade windows offset away from the wall plane to avoid flicker.
  const flWindowMat = new THREE.MeshStandardMaterial({color:0x9fe8ff,roughness:0.18,metalness:0.08});
  for (const x of [-5.8,5.8]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(3.0,2.1,0.10),flWindowMat);
    win.position.set(x,4.7,flWallD/2+0.36); flandersHouse.add(win);
  }
  flandersHouse.add(flSofa,flCoffee,flTVBody,flTVScreen,flKitchenBack,flKitchenSide,flDining,flBookcase);

  const flRoof = new THREE.Mesh(new THREE.ConeGeometry(17, 5.0, 4), createMaterial(0x546e7a));
  flRoof.userData.landableRoof = true;
  flRoof.rotation.y = Math.PI / 4;
  flRoof.position.y = 10.5;

  const vanePost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), createMaterial(0xffd54f));
  vanePost.position.y = 13.5;
  const vaneRooster = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.1), createMaterial(0xffd54f));
  vaneRooster.position.y = 14.3;

  const hedgeMat = createMaterial(0x2e7d32);
  const hedgeL = new THREE.Mesh(new THREE.BoxGeometry(10, 1.0, 1.0), hedgeMat);
  hedgeL.position.set(-5, 0.5, 12);
  const hedgeR = new THREE.Mesh(new THREE.BoxGeometry(10, 1.0, 1.0), hedgeMat);
  hedgeR.position.set(5, 0.5, 12);
  flandersHouse.add(flLawn, flRoof, vanePost, vaneRooster, hedgeL, hedgeR);
  root.add(flandersHouse);

  const flandersDoor = new Door({
    id: 'flanders_door',
    name: "Flanders' Front Glass Door",
    houseName: "744 Evergreen Terrace (Flanders)",
    type: 'double_slide',
    width: 2.4,
    height: 3.4,
    worldPos: new THREE.Vector3(-170, 0, 37.5),
    frameColor: 0x388e3c,
    glassColor: 0xa7ffeb,
  });
  root.add(flandersDoor.group);
  doors.push(flandersDoor);

  wallColliders.push(
    { id: 'fl_wall_back', minX: -180.5, maxX: -159.5, minZ: 22.1, maxZ: 22.9 },
    { id: 'fl_wall_left', minX: -180.4, maxX: -179.6, minZ: 22.1, maxZ: 37.9 },
    { id: 'fl_wall_right', minX: -160.4, maxX: -159.6, minZ: 22.1, maxZ: 37.9 },
    { id: 'fl_wall_front_l', minX: -180.4, maxX: -171.3, minZ: 37.1, maxZ: 37.9 },
    { id: 'fl_wall_front_r', minX: -168.7, maxX: -159.6, minZ: 37.1, maxZ: 37.9 }
  );

  const winfieldHouse = new THREE.Group();
  winfieldHouse.name = '740_evergreen_terrace_winfield_house';
  winfieldHouse.position.set(-250, 0, 30);
  const wfLawn = new THREE.Mesh(new THREE.BoxGeometry(32, 0.2, 45), grassMat);
  wfLawn.position.set(0, 0.05, 0);
  const wfFloor = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.2, 13.2), createMaterial(0x90caf9, 0.7, 0.1));
  wfFloor.position.set(0, 0.1, 0);
  wfFloor.userData.walkable = true;
  const wfWallW = 18;
  const wfWallD = 14;
  const wfWallH = 7.0;
  const wfBack = new THREE.Mesh(new THREE.BoxGeometry(wfWallW, wfWallH, 0.6), createMaterial(0x90caf9));
  wfBack.position.set(0, wfWallH / 2, -wfWallD / 2);
  const wfLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, wfWallH, wfWallD), createMaterial(0x90caf9));
  wfLeft.position.set(-wfWallW / 2, wfWallH / 2, 0);
  const wfRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, wfWallH, wfWallD), createMaterial(0x90caf9));
  wfRight.position.set(wfWallW / 2, wfWallH / 2, 0);
  const wfFrontL = new THREE.Mesh(new THREE.BoxGeometry((wfWallW - 2.4) / 2, wfWallH, 0.6), createMaterial(0x90caf9));
  wfFrontL.position.set(-(wfWallW / 2 + 1.2) / 2, wfWallH / 2, wfWallD / 2);
  const wfFrontR = new THREE.Mesh(new THREE.BoxGeometry((wfWallW - 2.4) / 2, wfWallH, 0.6), createMaterial(0x90caf9));
  wfFrontR.position.set((wfWallW / 2 + 1.2) / 2, wfWallH / 2, wfWallD / 2);
  const wfFrontHeader = new THREE.Mesh(new THREE.BoxGeometry(2.4, wfWallH - 3.5, 0.6), createMaterial(0x90caf9));
  wfFrontHeader.position.set(0, 3.5 + (wfWallH - 3.5) / 2, wfWallD / 2);
  winfieldHouse.add(wfFloor, wfBack, wfLeft, wfRight, wfFrontL, wfFrontR, wfFrontHeader);
  markSolid(wfBack, wfLeft, wfRight, wfFrontL, wfFrontR, wfFrontHeader);

  const wfCouch = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 1.4), createMaterial(0x1976d2));
  wfCouch.position.set(0, 0.45, -3.0); markSolid(wfCouch);
  const wfTable = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.6, 12), woodMat);
  wfTable.position.set(0, 0.3, 0); markSolid(wfTable);
  const wfLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe0a8 }));
  wfLamp.position.set(0, 3.5, 0);
  winfieldHouse.add(wfCouch, wfTable, wfLamp);
  const wfTv = new THREE.Mesh(new THREE.BoxGeometry(2.2,1.4,0.55),createMaterial(0x3e2723));
  wfTv.position.set(-4.5,0.72,5.2); markSolid(wfTv);
  const wfScreen = new THREE.Mesh(new THREE.BoxGeometry(1.75,0.95,0.05),new THREE.MeshBasicMaterial({color:0x90caf9}));
  wfScreen.position.set(-4.5,0.82,4.91);
  const wfCounter = new THREE.Mesh(new THREE.BoxGeometry(5.5,1.0,1.0),createMaterial(0xeeeeee));
  wfCounter.position.set(4.8,0.5,-5.2); markSolid(wfCounter);
  const wfShelf = new THREE.Mesh(new THREE.BoxGeometry(0.9,2.5,3.8),createMaterial(0x795548));
  wfShelf.position.set(8.2,1.25,1.4); markSolid(wfShelf);
  winfieldHouse.add(wfTv,wfScreen,wfCounter,wfShelf);
  const wfRoof = new THREE.Mesh(new THREE.BoxGeometry(19.5, 1.2, 15.5), createMaterial(0x1565c0));
  wfRoof.userData.landableRoof = true;
  wfRoof.position.y = 7.5;
  winfieldHouse.add(wfLawn, wfRoof);
  root.add(winfieldHouse);

  const winfieldDoor = new Door({
    id: 'winfield_door',
    name: 'Winfield Front Glass Door',
    houseName: '740 Evergreen Terrace (Winfield)',
    type: 'double_slide',
    width: 2.4,
    height: 3.4,
    worldPos: new THREE.Vector3(-250, 0, 37),
    frameColor: 0x1565c0,
    glassColor: 0xb3e5fc,
  });
  root.add(winfieldDoor.group);
  doors.push(winfieldDoor);

  wallColliders.push(
    { id: 'wf_wall_back', minX: -259.5, maxX: -240.5, minZ: 22.6, maxZ: 23.4 },
    { id: 'wf_wall_left', minX: -259.4, maxX: -258.6, minZ: 22.6, maxZ: 37.4 },
    { id: 'wf_wall_right', minX: -241.4, maxX: -240.6, minZ: 22.6, maxZ: 37.4 },
    { id: 'wf_wall_front_l', minX: -259.4, maxX: -251.3, minZ: 36.6, maxZ: 37.4 },
    { id: 'wf_wall_front_r', minX: -248.7, maxX: -240.6, minZ: 36.6, maxZ: 37.4 }
  );

  // Winfield front yard: one broad pedestrian gate centred on the front door.
  // The opening is wider than the player/NPC body so the third-person camera
  // never feels pinched when entering the property.
  addPicketRunX('winfield_front', 51.35, [
    [-266.0, -252.2],
    [-247.8, -234.0],
  ], 0xf8f3dc);

  const createSuburbanHouseWithDoor = (
    houseId: string,
    x: number,
    z: number,
    wallColor: number,
    roofColor: number,
    houseName: string
  ) => {
    const hGroup = new THREE.Group();
    hGroup.name = `${houseId}_interior_house`;
    hGroup.position.set(x, 0, z);
    const hLawn = new THREE.Mesh(new THREE.BoxGeometry(32, 0.2, 45), grassMat);
    hLawn.position.set(0, 0.05, 0);
    const flr = new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.2, 13.2), woodMat);
    flr.position.set(0, 0.1, 0);
    flr.userData.walkable = true;
    flr.userData.walkablePriority = 10;
    const w = 18;
    const d = 14;
    const h = 7.0;
    const wMat = createSurfaceMaterial(wallColor, 'concrete', 0.86, 0.02, 6, 5);

    const bWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), wMat);
    bWall.position.set(0, h / 2, d / 2);
    const lWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, d), wMat);
    lWall.position.set(-w / 2, h / 2, 0);
    const rWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, d), wMat);
    rWall.position.set(w / 2, h / 2, 0);
    const fWallL = new THREE.Mesh(new THREE.BoxGeometry((w - 2.4) / 2, h, 0.6), wMat);
    fWallL.position.set(-(w / 2 + 1.2) / 2, h / 2, -d / 2);
    const fWallR = new THREE.Mesh(new THREE.BoxGeometry((w - 2.4) / 2, h, 0.6), wMat);
    fWallR.position.set((w / 2 + 1.2) / 2, h / 2, -d / 2);
    const fHeader = new THREE.Mesh(new THREE.BoxGeometry(2.4, h - 3.5, 0.6), wMat);
    fHeader.position.set(0, 3.5 + (h - 3.5) / 2, -d / 2);
    hGroup.add(hLawn, flr, bWall, lWall, rWall, fWallL, fWallR, fHeader);
    markSolid(bWall, lWall, rWall, fWallL, fWallR, fHeader);

    const intRug = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.04, 16), createMaterial(roofColor, 0.7));
    intRug.position.set(-2.6, 0.12, 1.2);
    const intSofa = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 1.45), createMaterial(0x455a64));
    intSofa.position.set(-3.2, 0.45, 3.6); markSolid(intSofa);
    const intCoffee = new THREE.Mesh(new THREE.BoxGeometry(2.0,0.4,1.15),woodMat);
    intCoffee.position.set(-3.2,0.23,1.5); markSolid(intCoffee);
    const intTv = new THREE.Mesh(new THREE.BoxGeometry(2.2,1.45,0.55),createMaterial(0x3e2723));
    intTv.position.set(-3.2,0.74,-4.8); markSolid(intTv);
    const intScreen = new THREE.Mesh(new THREE.BoxGeometry(1.75,1.0,0.05),new THREE.MeshBasicMaterial({color:0x64b5f6}));
    intScreen.position.set(-3.2,0.84,-4.51);
    // Compact kitchen + dining side gives every house a believable purpose.
    const intCounter = new THREE.Mesh(new THREE.BoxGeometry(6.0,1.0,1.0),createMaterial(0xeeeeee));
    intCounter.position.set(4.9,0.5,-5.3); markSolid(intCounter);
    const intFridge = new THREE.Mesh(new THREE.BoxGeometry(1.4,2.7,1.2),createMaterial(0xe0e0e0));
    intFridge.position.set(7.2,1.35,-3.8); markSolid(intFridge);
    const intTable = new THREE.Mesh(new THREE.BoxGeometry(2.5,0.16,1.7),woodMat);
    intTable.position.set(4.4,0.82,1.5); markSolid(intTable);
    const intShelf = new THREE.Mesh(new THREE.BoxGeometry(0.8,2.6,3.4),createMaterial(0x795548));
    intShelf.position.set(8.3,1.3,2.8); markSolid(intShelf);
    const intLamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffedc0 }));
    intLamp.position.set(0, 3.5, 0);
    hGroup.add(intRug, intSofa, intCoffee, intTv, intScreen, intCounter, intFridge, intTable, intShelf, intLamp);

    const r = new THREE.Mesh(new THREE.ConeGeometry(16, 4.0, 4), createSurfaceMaterial(roofColor, 'roof', 0.9, 0.02, 7, 5));
    r.rotation.y = Math.PI / 4;
    r.position.y = 9.0;
    const dWay = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.22, 24), concreteMat);
    dWay.position.set(8, 0.06, -10);
    dWay.userData.walkable = true;
    dWay.userData.walkablePriority = 6;

    // Interior ceiling gives the third-person camera a believable room envelope.
    const houseCeiling = new THREE.Mesh(new THREE.BoxGeometry(w - 0.7, 0.18, d - 0.7), createSurfaceMaterial(0xf2efe8, 'concrete', 0.9, 0.01, 5, 4));
    houseCeiling.position.set(0, 4.15, 0);

    // Recognisable suburban architecture: framed windows, gutters, downpipes,
    // chimney and porch light. Keep the middle front bay clear for the real door.
    const houseGlass = new THREE.MeshStandardMaterial({ color: 0xa9dff4, roughness: 0.18, metalness: 0.04, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide });
    const windowFrameMat = createMaterial(0xf5f5f5, 0.55, 0.08);
    for (const wx of [-5.2, 5.2]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.8, 0.10), houseGlass);
      win.position.set(wx, 2.15, -d / 2 - 0.34);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.34), windowFrameMat);
      sill.position.set(wx, 1.22, -d / 2 - 0.34);
      hGroup.add(win, sill);
    }
    for (const side of [-1, 1]) {
      const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.7, 2.6), houseGlass);
      sideWin.position.set(side * (w / 2 + 0.34), 2.25, 1.4);
      hGroup.add(sideWin);
    }
    const gutterMat = createSurfaceMaterial(0x8d9aa0, 'metal', 0.38, 0.58, 3, 2);
    const gutterFront = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.15, 0.18), gutterMat);
    gutterFront.position.set(0, 6.55, -d / 2 - 0.35);
    const gutterBack = gutterFront.clone(); gutterBack.position.z = d / 2 + 0.35;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.9, 6), gutterMat);
    pipe.position.set(-w / 2 - 0.20, 3.0, -d / 2 - 0.28);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.0, 1.4), brickMat);
    chimney.position.set(4.6, 8.0, 1.5);
    const porchLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffe3a2 }));
    porchLight.position.set(0, 3.7, -d / 2 - 0.62);
    hGroup.add(r, dWay, houseCeiling, gutterFront, gutterBack, pipe, chimney, porchLight);
    enableInteriorFaces(hGroup);
    root.add(hGroup);

    const houseDoor = new Door({
      id: `${houseId}_door`,
      name: `${houseName} Glass Door`,
      houseName,
      type: 'double_slide',
      width: 2.4,
      height: 3.4,
      worldPos: new THREE.Vector3(x, 0, z - 7),
      frameColor: roofColor,
      glassColor: 0xe0f7fa,
    });
    root.add(houseDoor.group);
    doors.push(houseDoor);

    wallColliders.push(
      { id: `${houseId}_back`, minX: x - w / 2 - 0.5, maxX: x + w / 2 + 0.5, minZ: z + d / 2 - 0.4, maxZ: z + d / 2 + 0.4 },
      { id: `${houseId}_left`, minX: x - w / 2 - 0.4, maxX: x - w / 2 + 0.4, minZ: z - d / 2, maxZ: z + d / 2 },
      { id: `${houseId}_right`, minX: x + w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2, maxZ: z + d / 2 },
      { id: `${houseId}_front_l`, minX: x - w / 2, maxX: x - 1.3, minZ: z - d / 2 - 0.4, maxZ: z - d / 2 + 0.4 },
      { id: `${houseId}_front_r`, minX: x + 1.3, maxX: x + w / 2, minZ: z - d / 2 - 0.4, maxZ: z - d / 2 + 0.4 }
    );
  };

  createSuburbanHouseWithDoor('north_house_1', -250, 95, 0xfff59d, 0x388e3c, '741 Evergreen Terrace');
  createSuburbanHouseWithDoor('north_house_2', -210, 95, 0xc8e6c9, 0xc62828, '743 Evergreen Terrace');
  createSuburbanHouseWithDoor('north_house_3', -170, 95, 0xffccbc, 0x4527a0, '745 Evergreen Terrace');
  createSuburbanHouseWithDoor('south_house_west', -285, 30, 0xb3e5fc, 0x0277bd, '740 Evergreen Terrace');
  createSuburbanHouseWithDoor('north_house_west', -285, 95, 0xdcedc8, 0x33691e, '738 Evergreen Terrace');

  // Selected north-side homes get front-yard fences. Each one keeps BOTH the
  // centre path to the front door and the east-side driveway completely clear.
  // We intentionally skip several other homes (including Flanders' hedge-lined
  // lot) so the neighbourhood does not look copy-pasted or over-fenced.
  const addNorthHouseFence = (houseId: string, x: number, color: number) => {
    const frontZ = 72.9;
    const lotMin = x - 16;
    const lotMax = x + 16;
    const pathGap: [number, number] = [x - 1.9, x + 1.9];
    const drivewayGap: [number, number] = [x + 4.6, x + 11.6];
    addPicketRunX(`${houseId}_front`, frontZ, [
      [lotMin, pathGap[0]],
      [pathGap[1], drivewayGap[0]],
      [drivewayGap[1], lotMax],
    ], color);
  };
  addNorthHouseFence('north_house_1', -250, 0xfff8dc);
  // 743 Evergreen Terrace uses the same front-yard geometry/driveway layout as
  // its neighbours, so leaving it unfenced made the streetscape inconsistent.
  addNorthHouseFence('north_house_2', -210, 0xfff5e6);
  addNorthHouseFence('north_house_3', -170, 0xffefd6);
  addNorthHouseFence('north_house_west', -285, 0xf6f2e8);

  // -------------------------------------------------------------------------
  // 5. IMPORTANT LANDMARK 2: SPRINGFIELD TOWN SQUARE & JEBEDIAH STATUE (X = -210, Z = -20)
  // -------------------------------------------------------------------------
  const townSquareGroup = new THREE.Group();
  townSquareGroup.position.set(-210, 0, -20);
  townSquareGroup.name = 'springfield_town_square_jebediah';

  // Springfield Park / Town Square is the civic green from the Hit & Run downtown map.
  // Keep the centre fully pedestrian while the Fix 10 roundabout carries traffic around it.
  const tsPlaza = new THREE.Mesh(new THREE.CylinderGeometry(18.35, 18.35, 0.22, 48), grassMat);
  tsPlaza.name = 'springfield_park_civic_green';
  tsPlaza.position.y = 0.11;
  tsPlaza.userData.walkable = true;
  tsPlaza.userData.walkablePriority = 7;
  townSquareGroup.add(tsPlaza);

  // A broad perimeter promenade plus four radial paths makes the monument feel deliberately
  // placed in a park rather than dropped into a lawn. The cardinal paths line up with the
  // surrounding pedestrian approaches but stay completely inside the traffic-free island.
  const tsWalk = new THREE.Mesh(new THREE.TorusGeometry(16.8, 1.0, 6, 48), sidewalkMat);
  tsWalk.userData.sidewalkSurface = true; tsWalk.userData.roadCriticalDetail = true;
  tsWalk.name = 'springfield_park_perimeter_walk';
  tsWalk.rotation.x = Math.PI / 2;
  tsWalk.position.y = 0.235;
  tsWalk.userData.walkable = true;
  tsWalk.userData.walkablePriority = 8;
  townSquareGroup.add(tsWalk);

  const radialPathSpecs = [
    { name: 'north', x: 0, z: 11.1, w: 3.6, d: 10.7 },
    { name: 'south', x: 0, z: -11.1, w: 3.6, d: 10.7 },
    { name: 'east', x: 11.1, z: 0, w: 10.7, d: 3.6 },
    { name: 'west', x: -11.1, z: 0, w: 10.7, d: 3.6 },
  ];
  radialPathSpecs.forEach((spec) => {
    const path = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.10, spec.d), sidewalkMat);
    path.name = `springfield_park_path_${spec.name}`;
    path.userData.sidewalkSurface = true; path.userData.roadCriticalDetail = true;
    path.position.set(spec.x, 0.245, spec.z);
    path.userData.walkable = true;
    path.userData.walkablePriority = 9;
    townSquareGroup.add(path);
  });

  // Four landscaped beds stay in the quadrants, leaving all four main walking routes clear.
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    const planter = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.35, 0.24, 16), grassMat);
    planter.name = `springfield_park_planter_${i}`;
    planter.position.set(Math.cos(angle) * 13.7, 0.24, Math.sin(angle) * 13.7);
    townSquareGroup.add(planter);

    const shrubMat = createMaterial(i % 2 === 0 ? 0x2e7d32 : 0x388e3c, 0.9, 0.0);
    const shrub = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 7), shrubMat);
    shrub.scale.set(1.2, 0.72, 1.0);
    shrub.position.set(Math.cos(angle) * 13.7, 0.86, Math.sin(angle) * 13.7);
    townSquareGroup.add(shrub);
  }

  // -----------------------------------------------------------------------
  // JEBEDIAH SPRINGFIELD MONUMENT — Hit & Run-inspired accuracy pass.
  // The original landmark depicts Jebediah standing victoriously over the
  // defeated bear, with a prominent pointing arm and the famous town motto
  // on the plaque. The shapes remain stylised to match this procedural world.
  // -----------------------------------------------------------------------
  const monumentGroup = new THREE.Group();
  monumentGroup.name = 'jebediah_hit_and_run_monument';
  townSquareGroup.add(monumentGroup);

  const monumentStone = createSurfaceMaterial(0x8d8a80, 'concrete', 0.82, 0.04, 4, 4);
  const monumentStoneDark = createSurfaceMaterial(0x706d66, 'concrete', 0.86, 0.03, 4, 4);
  const bronzeMat = createMaterial(0x74623f, 0.46, 0.72);
  const bronzeDarkMat = createMaterial(0x3f3526, 0.58, 0.58);

  // Square stepped pedestal: broad enough to read as a civic monument while leaving a
  // generous walking ring around it. Horizontal steps are walkable, vertical faces solid.
  const plinthStep1 = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.42, 6.0), monumentStoneDark);
  plinthStep1.name = 'jebediah_pedestal_lower_step';
  plinthStep1.position.y = 0.42;
  plinthStep1.userData.walkable = true;
  plinthStep1.userData.walkablePriority = 10;

  const plinthStep2 = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.44, 5.1), monumentStone);
  plinthStep2.name = 'jebediah_pedestal_upper_step';
  plinthStep2.position.y = 0.85;
  plinthStep2.userData.walkable = true;
  plinthStep2.userData.walkablePriority = 11;

  const plinthColumn = new THREE.Mesh(new THREE.BoxGeometry(3.85, 2.65, 3.85), monumentStone);
  plinthColumn.name = 'jebediah_pedestal_column';
  plinthColumn.position.y = 2.38;

  const plinthCap = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.38, 4.35), monumentStoneDark);
  plinthCap.name = 'jebediah_pedestal_cap';
  plinthCap.position.y = 3.90;
  plinthCap.userData.walkable = true;
  plinthCap.userData.walkablePriority = 12;

  markSolid(plinthStep1, plinthStep2, plinthColumn, plinthCap);
  monumentGroup.add(plinthStep1, plinthStep2, plinthColumn, plinthCap);

  // Exact Hit & Run plaque wording. Bookman Old Style is also the documented typeface
  // used by the game's Jebediah Springfield plaque, with a serif fallback for browsers
  // that do not have that font installed.
  const plaqueCanvas = document.createElement('canvas');
  plaqueCanvas.width = 1024;
  plaqueCanvas.height = 448;
  const plaqueCtx = plaqueCanvas.getContext('2d');
  if (plaqueCtx) {
    plaqueCtx.fillStyle = '#463d2d';
    plaqueCtx.fillRect(0, 0, plaqueCanvas.width, plaqueCanvas.height);
    plaqueCtx.strokeStyle = '#b59a60';
    plaqueCtx.lineWidth = 18;
    plaqueCtx.strokeRect(18, 18, plaqueCanvas.width - 36, plaqueCanvas.height - 36);
    plaqueCtx.strokeStyle = '#6e5a36';
    plaqueCtx.lineWidth = 5;
    plaqueCtx.strokeRect(42, 42, plaqueCanvas.width - 84, plaqueCanvas.height - 84);
    plaqueCtx.fillStyle = '#e5d2a1';
    plaqueCtx.textAlign = 'center';
    plaqueCtx.textBaseline = 'middle';
    plaqueCtx.font = '700 74px "Bookman Old Style", Georgia, serif';
    plaqueCtx.fillText('A NOBLE SPIRIT', plaqueCanvas.width / 2, 126);
    plaqueCtx.fillText('EMBIGGENS THE', plaqueCanvas.width / 2, 222);
    plaqueCtx.fillText('SMALLEST MAN', plaqueCanvas.width / 2, 318);
  }
  const plaqueTexture = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTexture.colorSpace = THREE.SRGBColorSpace;
  plaqueTexture.needsUpdate = true;

  const plaqueBacking = new THREE.Mesh(
    new THREE.BoxGeometry(3.18, 1.38, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x6b5835, roughness: 0.48, metalness: 0.60 })
  );
  plaqueBacking.name = 'jebediah_plaque_backing';
  plaqueBacking.position.set(0, 2.48, -1.965);

  const plaqueText = new THREE.Mesh(
    new THREE.PlaneGeometry(2.94, 1.16),
    new THREE.MeshBasicMaterial({ map: plaqueTexture, side: THREE.DoubleSide, toneMapped: false })
  );
  plaqueText.name = 'jebediah_plaque_exact_quote';
  plaqueText.position.set(0, 2.48, -2.016);
  plaqueText.rotation.y = Math.PI;
  monumentGroup.add(plaqueBacking, plaqueText);

  // Stylised dead bear lying on the pedestal beneath Jebediah's raised foot.
  const bearGroup = new THREE.Group();
  bearGroup.name = 'jebediah_defeated_bear';
  bearGroup.position.y = 4.18;

  const bearBody = new THREE.Mesh(new THREE.SphereGeometry(0.82, 12, 8), bronzeMat);
  bearBody.name = 'jebediah_bear_body';
  bearBody.scale.set(1.55, 0.62, 0.82);
  bearBody.position.set(-0.15, 0.47, 0.22);
  bearBody.rotation.y = -0.18;

  const bearHead = new THREE.Mesh(new THREE.SphereGeometry(0.56, 12, 9), bronzeMat);
  bearHead.name = 'jebediah_bear_head';
  bearHead.scale.set(1.1, 0.88, 0.96);
  bearHead.position.set(1.02, 0.54, 0.02);

  const bearMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 7), bronzeMat);
  bearMuzzle.scale.set(1.15, 0.72, 0.80);
  bearMuzzle.position.set(1.27, 0.47, -0.34);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), bronzeMat);
    ear.position.set(0.92 + side * 0.31, 0.84, 0.00);
    bearGroup.add(ear);
  });

  // The cartoon statue traditionally gives the bear X eyes. Dark inset bars retain that
  // readable gag while keeping the overall object bronze rather than brightly coloured.
  const addBearEyeX = (x: number) => {
    [-1, 1].forEach((dir) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.035), bronzeDarkMat);
      bar.position.set(x, 0.64, -0.535);
      bar.rotation.z = dir * Math.PI / 4;
      bearGroup.add(bar);
    });
  };
  addBearEyeX(0.83);
  addBearEyeX(1.14);

  bearGroup.add(bearBody, bearHead, bearMuzzle);
  bearBody.userData.walkable = true;
  bearBody.userData.walkablePriority = 13;
  bearHead.userData.walkable = true;
  bearHead.userData.walkablePriority = 13;
  markSolid(bearBody, bearHead);
  monumentGroup.add(bearGroup);

  // Helper for properly angled sculpted limbs. Three.js cylinders point along +Y, so
  // each limb is rotated from that axis to the requested end point.
  const addBronzeLimb = (
    parent: THREE.Object3D,
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    material: THREE.Material,
    name: string
  ) => {
    const delta = to.clone().sub(from);
    const length = delta.length();
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.06, length, 8), material);
    limb.name = name;
    limb.position.copy(from).add(to).multiplyScalar(0.5);
    limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    parent.add(limb);
    return limb;
  };

  const jebediah = new THREE.Group();
  jebediah.name = 'jebediah_statue_sculpture';
  // The final Hit & Run statue points across the civic square. Rotate the whole sculpture
  // so the extended arm reads clearly from the southern park approach.
  jebediah.rotation.y = -Math.PI / 2;
  jebediah.position.y = 4.18;

  // Legs: one planted, one raised victoriously onto the bear's head.
  const leftHip = new THREE.Vector3(-0.34, 1.88, 0.08);
  const rightHip = new THREE.Vector3(0.34, 1.88, 0.05);
  const leftFoot = new THREE.Vector3(-0.46, 0.26, 0.18);
  const rightFoot = new THREE.Vector3(0.92, 1.00, 0.02);
  addBronzeLimb(jebediah, leftHip, leftFoot, 0.22, bronzeMat, 'jebediah_left_leg');
  addBronzeLimb(jebediah, rightHip, rightFoot, 0.22, bronzeMat, 'jebediah_raised_leg');

  const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.76), bronzeMat);
  leftBoot.name = 'jebediah_left_boot';
  leftBoot.position.copy(leftFoot).add(new THREE.Vector3(0, 0.05, -0.12));
  const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.72), bronzeMat);
  rightBoot.name = 'jebediah_bear_boot';
  rightBoot.position.copy(rightFoot).add(new THREE.Vector3(0, 0.04, -0.08));
  jebediah.add(leftBoot, rightBoot);

  // Pioneer coat/body with broad shoulders and tapered waist.
  const jebTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.78, 1.72, 8), bronzeMat);
  jebTorso.name = 'jebediah_torso';
  jebTorso.position.set(0, 2.56, 0.02);
  const coatTail = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.82, 0.24), bronzeMat);
  coatTail.name = 'jebediah_coat_tail';
  coatTail.position.set(0, 1.95, 0.34);
  coatTail.rotation.x = -0.12;
  jebediah.add(jebTorso, coatTail);

  // Head and iconic coonskin cap.
  const jebHead = new THREE.Mesh(new THREE.SphereGeometry(0.43, 12, 10), bronzeMat);
  jebHead.name = 'jebediah_head';
  jebHead.scale.set(0.92, 1.08, 0.94);
  jebHead.position.set(0, 3.66, -0.02);

  const jebNose = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), bronzeMat);
  jebNose.name = 'jebediah_nose';
  jebNose.position.set(0, 3.65, -0.41);
  jebNose.scale.set(0.78, 0.86, 1.25);

  const capCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.50, 0.30, 10), bronzeMat);
  capCrown.name = 'jebediah_coonskin_cap';
  capCrown.position.set(0, 4.06, 0.00);
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.43, 10, 6), bronzeMat);
  capTop.scale.y = 0.34;
  capTop.position.set(0, 4.20, 0.0);
  const capTail = addBronzeLimb(
    jebediah,
    new THREE.Vector3(0.28, 4.03, 0.22),
    new THREE.Vector3(0.43, 3.18, 0.54),
    0.10,
    bronzeMat,
    'jebediah_coonskin_tail'
  );
  capTail.scale.x = 0.90;
  jebediah.add(jebHead, jebNose, capCrown, capTop);

  // Strong pointing pose: the forward arm is deliberately long/readable because the Hit & Run
  // statue is used as a navigation landmark and walkthroughs explicitly describe the statue
  // as pointing toward a civic building.
  const shoulderR = new THREE.Vector3(0.55, 2.98, -0.02);
  const elbowR = new THREE.Vector3(0.70, 2.93, -0.86);
  const handR = new THREE.Vector3(0.72, 2.92, -1.70);
  addBronzeLimb(jebediah, shoulderR, elbowR, 0.18, bronzeMat, 'jebediah_pointing_upper_arm');
  addBronzeLimb(jebediah, elbowR, handR, 0.15, bronzeMat, 'jebediah_pointing_forearm');
  const pointingHand = new THREE.Mesh(new THREE.SphereGeometry(0.19, 9, 7), bronzeMat);
  pointingHand.position.copy(handR);
  const finger = addBronzeLimb(
    jebediah,
    new THREE.Vector3(handR.x, handR.y, handR.z - 0.08),
    new THREE.Vector3(handR.x, handR.y, handR.z - 0.47),
    0.055,
    bronzeMat,
    'jebediah_pointing_finger'
  );
  finger.scale.x = 0.82;
  jebediah.add(pointingHand);

  // Opposite arm rests confidently at the hip rather than carrying the incorrect musket
  // used by the old generic statue.
  const shoulderL = new THREE.Vector3(-0.55, 2.98, 0.02);
  const elbowL = new THREE.Vector3(-0.78, 2.42, 0.22);
  const handL = new THREE.Vector3(-0.56, 2.12, 0.18);
  addBronzeLimb(jebediah, shoulderL, elbowL, 0.18, bronzeMat, 'jebediah_left_upper_arm');
  addBronzeLimb(jebediah, elbowL, handL, 0.15, bronzeMat, 'jebediah_left_forearm');
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.18, 9, 7), bronzeMat);
  leftHand.position.copy(handL);
  jebediah.add(leftHand);

  monumentGroup.add(jebediah);

  // Benches sit in the quadrants rather than across the radial paths. They face the statue
  // and leave a broad clear circulation ring for the player and NPCs.
  for (let b = 0; b < 4; b++) {
    const angle = Math.PI / 4 + (b * Math.PI) / 2;
    const bench = new THREE.Group();
    bench.name = `springfield_park_bench_${b}`;
    bench.position.set(Math.cos(angle) * 9.4, 0.15, Math.sin(angle) * 9.4);
    bench.rotation.y = -angle + Math.PI / 2;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.30, 0.72), woodMat);
    seat.position.y = 0.42;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.52, 0.11), woodMat);
    back.position.set(0, 0.82, -0.32);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.46, 0.55), monumentStoneDark);
    legL.position.set(-0.78, 0.20, 0);
    const legR = legL.clone();
    legR.position.x = 0.78;
    bench.add(seat, back, legL, legR);
    markSolid(seat, back, legL, legR);
    markSittable(seat, 'Springfield Park bench');
    townSquareGroup.add(bench);
  }

  root.add(townSquareGroup);
  landmarks.push({
    id: 'springfield_town_square',
    name: 'Springfield Park – Jebediah Springfield Statue',
    category: 'homer_city',
    x: -210,
    z: -20,
    icon: 'compass',
    color: '#8d6e63',
  });

  // -------------------------------------------------------------------------
  // 6. IMPORTANT LANDMARK 3: KRUSTY BURGER (X = -270, Z = -130)
  // -------------------------------------------------------------------------
  const krustyGroup = new THREE.Group();
  krustyGroup.position.set(-270, 0, -130);
  krustyGroup.name = 'springfield_krusty_burger';

  // Keep the restaurant lot BEHIND the public footpath. The old 34 m slab reached
  // forward to Z=-113 and sat only ~4.5 cm below the Commercial Way sidewalk at
  // Z≈-118.85 (including the reported X=-285/-258 area). That near-coplanar overlap
  // caused the asphalt/sidewalk depth winner to change with camera distance.
  const kbLot = new THREE.Mesh(new THREE.BoxGeometry(40, 0.2, 26.2), asphaltMat);
  kbLot.name = 'krusty_burger_parking_lot';
  kbLot.position.set(0, 0.08, -3.9); // world front edge ≈ Z -120.8, just behind footpath
  krustyGroup.add(kbLot);

  addEnterableShell(krustyGroup, 20, 16, 6.5, createSurfaceMaterial(0xd32f2f, 'concrete', 0.84, 0.02, 6, 5), createSurfaceMaterial(0xf5e7d5, 'tile', 0.86, 0.02, 7, 6), 4.4, 3.8);
  const kbMansard = new THREE.Mesh(new THREE.BoxGeometry(21.4, 1.6, 17.4), createMaterial(0xffeb3b)); // Golden trim
  kbMansard.position.set(0, 7.0, 0);
  krustyGroup.add(kbMansard);

  // Giant Krusty Clown Face Rooftop Sign
  const clownFace = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 12), whiteMat);
  clownFace.position.set(0, 10.5, 0);
  const clownNose = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), createMaterial(0xd50000));
  clownNose.position.set(0, 10.5, 2.5);
  const clownHairL = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), createMaterial(0x00e5ff));
  clownHairL.position.set(-2.6, 11.2, 0);
  const clownHairR = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), createMaterial(0x00e5ff));
  clownHairR.position.set(2.6, 11.2, 0);
  krustyGroup.add(clownFace, clownNose, clownHairL, clownHairR);

  // Drive-Thru Speaker Post
  const dtPost = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 6), createMaterial(0x424242));
  dtPost.position.set(-14, 1.1, -2);
  const dtMenu = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 2.0), createMaterial(0xffeb3b));
  dtMenu.position.set(-14, 2.2, -2);
  krustyGroup.add(dtPost, dtMenu);
  markSolid(dtPost, dtMenu);

  // Krusty Burger interior: service counter, kitchen pass and booth seating.
  const kbCounter = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.15, 1.0), createMaterial(0xffc107));
  kbCounter.position.set(0, 0.58, -5.6);
  const kbKitchenPass = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.8, 0.35), createMaterial(0xd32f2f));
  kbKitchenPass.position.set(0, 2.1, -7.4);
  markSolid(kbCounter, kbKitchenPass);
  krustyGroup.add(kbCounter, kbKitchenPass);
  for (const [tx, tz] of [[-5.5, -0.5], [0, -0.5], [5.5, -0.5], [-3.0, 4.0], [3.0, 4.0]] as const) {
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 10), createMaterial(0xf5f5f5));
    table.position.set(tx, 0.85, tz);
    const seatL = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 0.7), createMaterial(0x42a5f5));
    seatL.position.set(tx - 1.45, 0.38, tz);
    const seatR = seatL.clone();
    seatR.position.x = tx + 1.45;
    markSolid(table, seatL, seatR);
    markSittable(seatL, 'Krusty Burger booth seat', 1, 0);
    markSittable(seatR, 'Krusty Burger booth seat', -1, 0);
    krustyGroup.add(table, seatL, seatR);
  }

  const kbDoor = new Door({
    id: 'krusty_burger_door',
    name: 'Krusty Burger Entrance',
    houseName: 'Krusty Burger',
    type: 'double_slide',
    width: 4.4,
    height: 3.8,
    worldPos: new THREE.Vector3(-270, 0, -122),
    frameColor: 0xffeb3b,
    glassColor: 0xfff9c4,
  });
  root.add(kbDoor.group);
  doors.push(kbDoor);

  wallColliders.push(
    { id: 'kb_back', minX: -280.5, maxX: -259.5, minZ: -138.4, maxZ: -137.6 },
    { id: 'kb_left', minX: -280.4, maxX: -279.6, minZ: -138, maxZ: -122 },
    { id: 'kb_right', minX: -260.4, maxX: -259.6, minZ: -138, maxZ: -122 },
    { id: 'kb_front_l', minX: -280.4, maxX: -272.4, minZ: -122.4, maxZ: -121.6 },
    { id: 'kb_front_r', minX: -267.6, maxX: -259.6, minZ: -122.4, maxZ: -121.6 }
  );

  root.add(krustyGroup);
  landmarks.push({
    id: 'krusty_burger',
    name: 'Krusty Burger Fast Food',
    category: 'homer_city',
    x: -270,
    z: -130,
    icon: 'store',
    color: '#d32f2f',
  });

  // -------------------------------------------------------------------------
  // 7. IMPORTANT LANDMARK 4: THE ANDROID'S DUNGEON COMIC BOOK SHOP (X = -270, Z = -60)
  // -------------------------------------------------------------------------
  const comicGroup = new THREE.Group();
  comicGroup.position.set(-270, 0, -78);
  comicGroup.name = 'springfield_androids_dungeon';

  addEnterableShell(comicGroup, 18, 16, 6.0, createSurfaceMaterial(0x5c6bc0, 'concrete', 0.84, 0.02, 6, 5), createSurfaceMaterial(0xd9d4c7, 'carpet', 0.9, 0.01, 7, 6), 2.4, 3.4);
  const cbAwning = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 2.8), createMaterial(0x8e24aa));
  cbAwning.userData.landableRoof = true;
  cbAwning.position.set(0, 3.8, 8.8);
  const cbSign = new THREE.Mesh(new THREE.BoxGeometry(14, 1.4, 0.3), createMaterial(0xffd600));
  cbSign.position.set(0, 5.0, 8.2);
  comicGroup.add(cbAwning, cbSign);

  // Comic shop interior: cramped racks, display case and a rear collector wall.
  const comicShelfMat = createMaterial(0x4e342e, 0.82, 0.02);
  [-5.2, 0, 5.2].forEach((sx, shelfIndex) => {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 6.0), comicShelfMat);
    rack.position.set(sx, 1.1, -1.5);
    markSolid(rack);
    comicGroup.add(rack);
    for (let i = 0; i < 4; i++) {
      const comic = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.48, 0.34),
        createMaterial([0xef5350, 0x42a5f5, 0xffca28, 0xab47bc][(shelfIndex + i) % 4])
      );
      comic.position.set(sx + 0.60, 0.65 + i * 0.45, -3.3 + i * 1.3);
      comicGroup.add(comic);
    }
  });
  const cbDisplay = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.0, 1.1), createMaterial(0x8e24aa));
  cbDisplay.position.set(-2.8, 0.5, -6.4);
  markSolid(cbDisplay);
  comicGroup.add(cbDisplay);

  const cbDoor = new Door({
    id: 'comic_shop_door',
    name: "The Android's Dungeon Door",
    houseName: "The Android's Dungeon & Baseball Card Shop",
    type: 'double_slide',
    width: 2.4,
    height: 3.4,
    worldPos: new THREE.Vector3(-270, 0, -70),
    frameColor: 0x8e24aa,
    glassColor: 0xe1bee7,
  });
  root.add(cbDoor.group);
  doors.push(cbDoor);

  wallColliders.push(
    { id: 'cb_back', minX: -279.5, maxX: -260.5, minZ: -86.4, maxZ: -85.6 },
    { id: 'cb_left', minX: -279.4, maxX: -278.6, minZ: -86, maxZ: -70 },
    { id: 'cb_right', minX: -261.4, maxX: -260.6, minZ: -86, maxZ: -70 },
    { id: 'cb_front_l', minX: -279.4, maxX: -271.3, minZ: -70.4, maxZ: -69.6 },
    { id: 'cb_front_r', minX: -268.7, maxX: -260.6, minZ: -70.4, maxZ: -69.6 }
  );

  root.add(comicGroup);
  landmarks.push({
    id: 'androids_dungeon',
    name: "The Android's Dungeon Comic Shop",
    category: 'homer_city',
    x: -270,
    z: -78,
    icon: 'star',
    color: '#8e24aa',
  });

  // -------------------------------------------------------------------------
  // 8. IMPORTANT LANDMARK 5: THE KWIK-E-MART (X = -210, Z = -130)
  // -------------------------------------------------------------------------
  const kwikGroup = new THREE.Group();
  kwikGroup.position.set(-210, 0, -130);
  kwikGroup.name = 'springfield_kwik_e_mart';

  // Same frontage cleanup as Krusty Burger. The old 38 m slab extended all the
  // way to Z=-111, underneath the sidewalk and into Commercial Way itself.
  const kemLot = new THREE.Mesh(new THREE.BoxGeometry(45, 0.2, 28.2), asphaltMat);
  kemLot.name = 'kwik_e_mart_parking_lot';
  kemLot.position.set(0, 0.08, -4.9); // world front edge ≈ Z -120.8
  kwikGroup.add(kemLot);

  // Align visible shell to the existing door/colliders. The old body was offset by
  // six metres, which created a visible/collision mismatch inside the shop.
  addEnterableShell(kwikGroup, 22, 16, 6.5, createSurfaceMaterial(0x00897b, 'concrete', 0.84, 0.02, 7, 5), createSurfaceMaterial(0xe6dfc9, 'tile', 0.86, 0.02, 8, 6), 4.8, 3.8);

  const kemParapet = new THREE.Mesh(new THREE.BoxGeometry(23, 1.4, 17), createMaterial(0xf57c00));
  kemParapet.position.set(0, 6.8, 0);
  kwikGroup.add(kemParapet);

  const kemSign = new THREE.Mesh(new THREE.BoxGeometry(16, 2.2, 0.4), createMaterial(0xffeb3b));
  kemSign.position.set(0, 8.5, 2.3);
  kwikGroup.add(kemSign);

  const kemDoor = new Door({
    id: 'kwik_e_mart_door',
    name: 'Kwik-E-Mart Double Glass Doors',
    houseName: 'The Kwik-E-Mart',
    type: 'double_slide',
    width: 4.8,
    height: 3.8,
    worldPos: new THREE.Vector3(-210, 0, -122),
    frameColor: 0xf57c00,
    glassColor: 0x80deea,
  });
  root.add(kemDoor.group);
  doors.push(kemDoor);

  wallColliders.push(
    { id: 'kem_back', minX: -221.5, maxX: -198.5, minZ: -138.4, maxZ: -137.6 },
    { id: 'kem_left', minX: -221.4, maxX: -220.6, minZ: -138, maxZ: -122 },
    { id: 'kem_right', minX: -199.4, maxX: -198.6, minZ: -138, maxZ: -122 },
    { id: 'kem_front_l', minX: -221.4, maxX: -212.5, minZ: -122.4, maxZ: -121.6 },
    { id: 'kem_front_r', minX: -207.5, maxX: -198.6, minZ: -122.4, maxZ: -121.6 }
  );

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8, 8), createMaterial(0xf57c00));
  canopy.userData.landableRoof = true;
  canopy.position.set(0, 5.0, 9);
  const canopyPillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4.6, 6), createMaterial(0xffffff));
  canopyPillarL.position.set(-6, 2.3, 9);
  const canopyPillarR = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4.6, 6), createMaterial(0xffffff));
  canopyPillarR.position.set(6, 2.3, 9);
  kwikGroup.add(canopy, canopyPillarL, canopyPillarR);

  const pumpMat = createMaterial(0xd32f2f);
  const pump1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 1.0), pumpMat);
  pump1.position.set(-3.5, 1.2, 9);
  const pump2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 1.0), pumpMat);
  pump2.position.set(3.5, 1.2, 9);
  kwikGroup.add(pump1, pump2);
  markSolid(canopyPillarL, canopyPillarR, pump1, pump2);

  // Recognizable convenience-store interior: checkout, aisles, Squishee machine.
  const kemShelfMat = createMaterial(0xeeeeee, 0.72, 0.05);
  const kemProductMats = [createMaterial(0xe53935), createMaterial(0x1e88e5), createMaterial(0xfdd835), createMaterial(0x43a047)];
  [-4.0, 0, 4.0].forEach((sx, shelfIdx) => {
    const shelf = new THREE.Group();
    shelf.position.set(sx, 0, -2.0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.25, 5.8), kemShelfMat);
    frame.position.y = 1.12;
    shelf.add(frame);
    for (let row = 0; row < 3; row++) {
      for (let item = 0; item < 4; item++) {
        const product = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.42), kemProductMats[(shelfIdx + row + item) % kemProductMats.length]);
        product.position.set(0.82, 0.55 + row * 0.58, -2.0 + item * 1.25);
        shelf.add(product);
      }
    }
    markSolid(frame);
    kwikGroup.add(shelf);
  });
  const kemCounter = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.15, 1.0), createMaterial(0xf57c00));
  kemCounter.position.set(-3.0, 0.58, -6.2);
  const register = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.55), createMaterial(0x37474f));
  register.position.set(-1.3, 1.35, -6.2);
  const squishee = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.8), createMaterial(0x8e24aa));
  squishee.position.set(7.8, 1.05, -6.2);
  const squisheeTop = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), createMaterial(0x00bcd4));
  squisheeTop.position.set(7.8, 2.2, -6.2);

  // Kwik-E-Mart Classic Coin-Op Arcade Cabinet
  const kemArcadeCab = new THREE.Group();
  kemArcadeCab.position.set(-7.5, 0, -4.5);
  const kemCabBody = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.2, 0.95), createMaterial(0xbf360c));
  kemCabBody.position.y = 1.1;
  const kemCabScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.62), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
  kemCabScreen.position.set(0, 1.45, 0.486);
  const kemMarquee = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.35, 0.28), new THREE.MeshBasicMaterial({ color: 0x76ff03 }));
  kemMarquee.position.set(0, 2.25, 0.38);
  kemArcadeCab.add(kemCabBody, kemCabScreen, kemMarquee);
  markSolid(kemCabBody);
  kwikGroup.add(kemArcadeCab);
  arcadeMachines.push({
    id: 'kwik_e_mart_arcade',
    name: 'Kwik-E-Mart Arcade',
    position: new THREE.Vector3(-210 - 7.5, 0.12, -130 - 4.5),
  });

  markSolid(kemCounter, squishee);
  kwikGroup.add(kemCounter, register, squishee, squisheeTop);

  root.add(kwikGroup);
  landmarks.push({
    id: 'kwik_e_mart',
    name: 'The Kwik-E-Mart',
    category: 'homer_city',
    x: -210,
    z: -130,
    icon: 'store',
    color: '#00897b',
  });

  // -------------------------------------------------------------------------
  // 6. IMPORTANT LANDMARK 3: MOE'S TAVERN (X = -140, Z = -130)
  // -------------------------------------------------------------------------
  const moesGroup = new THREE.Group();
  moesGroup.position.set(-140, 0, -130);
  moesGroup.name = 'springfield_moes_tavern';

  addEnterableShell(moesGroup, 18, 16, 6.0, brickMat, createSurfaceMaterial(0x4a3d35, 'wood', 0.9, 0.01, 7, 6), 2.4, 3.4);
  const moeRoof = new THREE.Mesh(new THREE.BoxGeometry(19, 0.8, 17), createMaterial(0x2e7d32));
  moeRoof.userData.landableRoof = true;
  moeRoof.position.y = 6.4;
  moesGroup.add(moeRoof);

  const moeWinL = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 0.2), glassMat);
  moeWinL.position.set(-5, 2.8, 8.1);
  const moeWinR = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 0.2), glassMat);
  moeWinR.position.set(5, 2.8, 8.1);
  moesGroup.add(moeWinL, moeWinR);

  const moeDoor = new Door({
    id: 'moes_door',
    name: "Moe's Tavern Glass Door",
    houseName: "Moe's Tavern",
    type: 'double_slide',
    width: 2.4,
    height: 3.4,
    worldPos: new THREE.Vector3(-140, 0, -122),
    frameColor: 0x1b5e20,
    glassColor: 0xffecb3,
  });
  root.add(moeDoor.group);
  doors.push(moeDoor);

  wallColliders.push(
    { id: 'moe_back', minX: -149.5, maxX: -130.5, minZ: -138.4, maxZ: -137.6 },
    { id: 'moe_left', minX: -149.4, maxX: -148.6, minZ: -138, maxZ: -122 },
    { id: 'moe_right', minX: -131.4, maxX: -130.6, minZ: -138, maxZ: -122 },
    { id: 'moe_front_l', minX: -149.4, maxX: -141.3, minZ: -122.4, maxZ: -121.6 },
    { id: 'moe_front_r', minX: -138.7, maxX: -130.6, minZ: -122.4, maxZ: -121.6 }
  );

  const moeSign = new THREE.Mesh(new THREE.BoxGeometry(8.0, 1.4, 0.3), createMaterial(0xff4081));
  moeSign.position.set(0, 4.8, 8.2);
  moesGroup.add(moeSign);

  // Moe's interior: long timber bar, stools, bottle wall and pool table.
  const barWood = createMaterial(0x5d4037, 0.86, 0.03);
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(7.8, 1.05, 1.15), barWood);
  barTop.position.set(-3.5, 0.53, -5.6);
  markSolid(barTop);
  moesGroup.add(barTop);
  for (let i = 0; i < 5; i++) {
    const stool = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.7, 6), createMaterial(0x424242));
    leg.position.y = 0.35;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 10), createMaterial(0x8d2b2b));
    seat.position.y = 0.78;
    stool.add(leg, seat);
    stool.position.set(-6.4 + i * 1.45, 0, -4.3);
    markSolid(leg, seat);
    markSittable(seat, "Moe's bar stool", 0, -1);
    moesGroup.add(stool);
  }
  const bottleShelf = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.4, 0.35), createMaterial(0x3e2723));
  bottleShelf.position.set(-3.5, 2.5, -7.35);
  moesGroup.add(bottleShelf);
  const bottleColors = [0x43a047, 0xffc107, 0x1e88e5, 0xd32f2f];
  for (let i = 0; i < 14; i++) {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.55, 6), createMaterial(bottleColors[i % bottleColors.length]));
    bottle.position.set(-6.5 + (i % 7) * 0.95, 2.0 + Math.floor(i / 7) * 0.75, -7.62);
    moesGroup.add(bottle);
  }
  const pool = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.65, 2.5), createMaterial(0x2e7d32));
  pool.position.set(4.6, 1.0, -1.0);
  const poolBase = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.35, 2.8), barWood);
  poolBase.position.set(4.6, 0.62, -1.0);
  markSolid(pool, poolBase);
  moesGroup.add(poolBase, pool);

  root.add(moesGroup);
  landmarks.push({
    id: 'moes_tavern',
    name: "Moe's Tavern",
    category: 'homer_city',
    x: -140,
    z: -130,
    icon: 'beer',
    color: '#d84315',
  });

  // -------------------------------------------------------------------------
  // 7. IMPORTANT LANDMARK 4: SPRINGFIELD POLICE STATION & JAIL (X = -150, Z = -60)
  // -------------------------------------------------------------------------
  const jailGroup = new THREE.Group();
  jailGroup.name = 'springfield_police_station_jail';
  const jailPos = new THREE.Vector3(-150, 0, -82);
  jailGroup.position.copy(jailPos);

  const jailWallMat = createMaterial(0x546e7a);
  const jailBarMat = createMaterial(0x263238, 0.2, 0.9);

  // Hollow police station shell. The old version was one giant BoxGeometry,
  // which looked fine outside but became invisible/inside-out when the camera
  // entered it. Separate wall pieces give a real interior and a real doorway.
  const psWallH = 7.5;
  const psWidth = 26;
  const psDepth = 22;
  const psDoorWidth = 4.8;
  const psBackWall = new THREE.Mesh(new THREE.BoxGeometry(psWidth, psWallH, 0.65), jailWallMat);
  psBackWall.position.set(0, psWallH / 2, -psDepth / 2);
  const psLeftWall = new THREE.Mesh(new THREE.BoxGeometry(0.65, psWallH, psDepth), jailWallMat);
  psLeftWall.position.set(-psWidth / 2, psWallH / 2, 0);
  const psRightWall = new THREE.Mesh(new THREE.BoxGeometry(0.65, psWallH, psDepth), jailWallMat);
  psRightWall.position.set(psWidth / 2, psWallH / 2, 0);
  const frontPieceW = (psWidth - psDoorWidth) / 2;
  const psFrontLeft = new THREE.Mesh(new THREE.BoxGeometry(frontPieceW, psWallH, 0.65), jailWallMat);
  psFrontLeft.position.set(-(psDoorWidth / 2 + frontPieceW / 2), psWallH / 2, psDepth / 2);
  const psFrontRight = new THREE.Mesh(new THREE.BoxGeometry(frontPieceW, psWallH, 0.65), jailWallMat);
  psFrontRight.position.set(psDoorWidth / 2 + frontPieceW / 2, psWallH / 2, psDepth / 2);
  const psFrontHeader = new THREE.Mesh(new THREE.BoxGeometry(psDoorWidth, psWallH - 4.0, 0.65), jailWallMat);
  psFrontHeader.position.set(0, 4.0 + (psWallH - 4.0) / 2, psDepth / 2);
  markSolid(psBackWall, psLeftWall, psRightWall, psFrontLeft, psFrontRight, psFrontHeader);

  const psRoof = new THREE.Mesh(new THREE.BoxGeometry(27, 0.8, 23), createMaterial(0x37474f));
  psRoof.userData.landableRoof = true;
  psRoof.position.y = 7.75;
  const psSign = new THREE.Mesh(new THREE.BoxGeometry(18, 1.4, 0.3), createMaterial(0x0d47a1));
  psSign.position.set(0, 6.0, 11.2);
  jailGroup.add(psBackWall, psLeftWall, psRightWall, psFrontLeft, psFrontRight, psFrontHeader, psRoof, psSign);

  const policeDoor = new Door({
    id: 'police_station_door',
    name: 'Police Station Glass Doors',
    houseName: 'Springfield Police Station & Jail',
    type: 'double_slide',
    width: 4.5,
    height: 4.0,
    worldPos: new THREE.Vector3(-150, 0, -71),
    frameColor: 0x1976d2,
    glassColor: 0xb2ebf2,
  });
  root.add(policeDoor.group);
  doors.push(policeDoor);

  wallColliders.push(
    { id: 'ps_back', minX: -163.5, maxX: -136.5, minZ: -93.4, maxZ: -92.6 },
    { id: 'ps_left', minX: -163.4, maxX: -162.6, minZ: -93, maxZ: -71 },
    { id: 'ps_right', minX: -137.4, maxX: -136.6, minZ: -93, maxZ: -71 },
    { id: 'ps_front_l', minX: -163.4, maxX: -152.4, minZ: -71.4, maxZ: -70.6 },
    { id: 'ps_front_r', minX: -147.6, maxX: -136.6, minZ: -71.4, maxZ: -70.6 },
    { id: 'ps_jail_wall', minX: -163, maxX: -150.5, minZ: -78.5, maxZ: -77.5 }
  );

  const cellFloor = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.2, 7.8), createMaterial(0x455a64));
  cellFloor.position.set(-7, 0.1, -3);
  cellFloor.userData.walkable = true;
  cellFloor.userData.walkablePriority = 10;
  jailGroup.add(cellFloor);

  const barMeshGroup = new THREE.Group();
  for (let i = -3.5; i <= 3.5; i += 0.6) {
    if (Math.abs(i - 1.5) < 1.85) continue;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.5, 6), jailBarMat);
    bar.position.set(i, 2.25, 0);
    barMeshGroup.add(bar);
  }
  barMeshGroup.position.set(-7, 0, 0.9);
  jailGroup.add(barMeshGroup);

  const cellDoorGroup = new THREE.Group();
  cellDoorGroup.position.set(-7.15, 0, 0.9);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 4.4, 0.08), createMaterial(0x212121));
  doorFrame.position.set(1.65, 2.2, 0);
  cellDoorGroup.add(doorFrame);
  cellDoorGroup.rotation.y = 0.35;
  jailGroup.add(cellDoorGroup);

  // Make the cell read unmistakably as a jail: concrete rear/side walls, bunk and toilet.
  const cellBlockMat = createMaterial(0x9aa4aa, 0.95, 0.02);
  const cellBack = new THREE.Mesh(new THREE.BoxGeometry(8.2, 4.8, 0.35), cellBlockMat);
  cellBack.position.set(-7, 2.4, -6.9);
  const cellLeft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.8, 7.8), cellBlockMat);
  cellLeft.position.set(-11.0, 2.4, -3.0);
  const cellRight = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.8, 7.8), cellBlockMat);
  cellRight.position.set(-3.0, 2.4, -3.0);
  markSolid(cellBack, cellLeft, cellRight);
  jailGroup.add(cellBack, cellLeft, cellRight);

  const bunkFrame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 1.4), createMaterial(0x37474f));
  bunkFrame.position.set(-8.8, 0.55, -5.6);
  const bunkMattress = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.28, 1.25), createMaterial(0x78909c));
  bunkMattress.position.set(-8.8, 0.83, -5.6);
  const toilet = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, 0.7, 10), createMaterial(0xe0e0e0));
  toilet.position.set(-4.2, 0.35, -5.6);
  markSolid(bunkFrame, toilet);
  jailGroup.add(bunkFrame, bunkMattress, toilet);

  root.add(jailGroup);
  landmarks.push({
    id: 'police_jail',
    name: 'Springfield Police Station & Jail',
    category: 'police_jail',
    x: -150,
    z: -82,
    icon: 'shield',
    color: '#1e88e5',
  });

  // -------------------------------------------------------------------------
  // 8. DESTRUCTIBLE PROPS IN SPRINGFIELD
  // -------------------------------------------------------------------------
  const redMat = createMaterial(0xd32f2f);
  const yellowMat = createMaterial(0xffd600);
  const blueMat = createMaterial(0x1976d2);

  const shCoords = [
    [-212, 50.5],
    [-208, 50.5],
    [-175, 50],
    [-255, 50],
    [-150, -48],
    [-220.5, -100],
    [-140, -100],
  ];
  shCoords.forEach(([hx, hz], idx) => {
    const hGroup = new THREE.Group();
    hGroup.position.set(hx, 0.5, hz);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.0, 8), redMat);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), yellowMat);
    cap.position.y = 0.55;
    hGroup.add(body, cap);
    root.add(hGroup);
    destructibles.push({
      id: `sh_hydrant_${idx}`,
      mesh: hGroup,
      type: 'hydrant',
      position: { x: hx, y: 0.5, z: hz },
      destroyed: false,
    });
  });

  const smCoords = [
    [-175, 50],
    [-255, 50],
    [-212, 68],
    [-172, 68],
    [-252, 68],
    [-145, -70],
  ];
  smCoords.forEach(([mx, mz], idx) => {
    const mGroup = new THREE.Group();
    mGroup.position.set(mx, 0.6, mz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), woodMat);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.8), blueMat);
    box.position.y = 0.65;
    mGroup.add(post, box);
    root.add(mGroup);
    destructibles.push({
      id: `sm_mailbox_${idx}`,
      mesh: mGroup,
      type: 'mailbox',
      position: { x: mx, y: 0.6, z: mz },
      destroyed: false,
    });
  });

  const sdCoords = [
    [-198, 42],
    [-198, 20],
    [-220.5, -120],
    [-132, -120],
    [-150, -50],
    [-177, 42],
  ];
  sdCoords.forEach(([dx, dz], idx) => {
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
      id: `sd_donut_${idx}`,
      mesh: dGroup,
      type: 'donut_box',
      position: { x: dx, y: 1.0, z: dz },
      destroyed: false,
    });
  });

  const spPatches = [
    [-247, 6],
    [-170, 10],
    [-250, 10],
    [-198, 115],
    [-130, -50],
  ];
  const patchMat = createMaterial(0x8bc34a, 0.95);
  spPatches.forEach(([px, pz], idx) => {
    const patchGeo = new THREE.CircleGeometry(4.0, 16);
    patchGeo.rotateX(-Math.PI / 2);
    const pMesh = new THREE.Mesh(patchGeo, patchMat);
    pMesh.position.set(px, 0.08, pz);
    root.add(pMesh);
    grassPatches.push({
      id: `springfield_patch_${idx}`,
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
  // Generate extra kickable street/yard trees from the CURRENT road geometry rather
  // than scattering coordinates blindly. The helper rejects asphalt, footpaths,
  // crossings, doors, solid building/fence geometry and critical access areas.
  // Reserve the football pitch itself, then add a loose perimeter grove so the
  // northern sports district feels landscaped without putting trunks on the field.
  const springfieldLandscaping = addRoadsideLandscaping({
    root,
    destructibles,
    districtId: 'springfield',
    maxRoadsideTrees: 24,
    seed: 0x51f13d,
    reservedAreas: [
      { minX: -261.5, maxX: -208.5, minZ: 131.0, maxZ: 165.0, padding: 2.5 },
      // Keep the compact bridge T-junction and curved civic approach sightlines open.
      // The former giant reserve is deliberately gone so the restored south-side land
      // can read as normal grass/verge again; live road checks still reject asphalt.
      { minX: -185, maxX: -89, minZ: -34, maxZ: 18, padding: 1.5 },
    ],
    groves: [
      { minX: -286, maxX: -266, minZ: 124, maxZ: 176, count: 5 },
      { minX: -205, maxX: -190, minZ: 126, maxZ: 174, count: 4 },
      { minX: -298, maxX: -270, minZ: 78, maxZ: 132, count: 4 },
    ],
  });
  console.info('[Springfield landscaping]', springfieldLandscaping);

  // Render enterable buildings correctly from both outside and inside.
  [homerHouse, flandersHouse, winfieldHouse, krustyGroup, comicGroup, kwikGroup, moesGroup, jailGroup].forEach(enableInteriorFaces);

  return {
    group: root,
    destructibles,
    grassPatches,
    doors,
    wallColliders,
    simpsonsHouse: {
      bounds: { minX: -225, maxX: -195, minZ: 15, maxZ: 45 },
      livingRoomPos: new THREE.Vector3(-214, 0.12, 30),
      ashPos: new THREE.Vector3(-217.0, 0.12, 42.2),
      ashMesh,
    },
    jail: {
      cellSpawnPos: new THREE.Vector3(-157, 0.12, -85),
      cellDoor: {
        mesh: cellDoorGroup,
        isOpen: false,
        pos: new THREE.Vector3(-155.5, 0, -81.1),
      },
      guards: [
        { name: 'Officer Lou', pos: new THREE.Vector3(-152, 0.12, -79), rotationY: Math.PI / 2 },
        { name: 'Chief Wiggum', pos: new THREE.Vector3(-148, 0.12, -79), rotationY: Math.PI / 2 },
      ],
      guardFightPos: new THREE.Vector3(-151.5, 0.12, -77.5),
      exitPos: new THREE.Vector3(-150, 0.12, -72),
    },
    tvLight,
    cloudsGroup,
    landmarks,
    arcadeMachines,
  };
}
