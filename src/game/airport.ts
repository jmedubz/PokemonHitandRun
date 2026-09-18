import * as THREE from 'three';
import { Door, markWalkableStairSurface, WallBox } from './doors';
import { createMaterial, createSurfaceMaterial } from './models';
import { DestructibleProp, MapLandmark } from '../types';

export type AirportAircraftKind = 'trainer' | 'commuter' | 'jetliner' | 'zacks_plane';

export interface AirportAircraft {
  id: string;
  name: string;
  kind: AirportAircraftKind;
  mesh: THREE.Group;
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  throttle: number;
  verticalSpeed: number;
  maxSpeed: number;
  takeoffSpeed: number;
  acceleration: number;
  mass: number;
  liftFactor: number;
  dragFactor: number;
  turnResponsiveness: number;
  pitchResponsiveness: number;
  brakeStrength: number;
  reverseTaxiSpeed: number;
  wingspan: number;
  length: number;
  gearHeight: number;
  collisionRadius: number;
  inUse: boolean;
  crashed: boolean;
  damage: number;
  onGround: boolean;
  /** Authored stand pose used for safe crash/session recovery. */
  spawnPosition: THREE.Vector3;
  spawnYaw: number;
}

export interface AirportNpcSpawn {
  id: string;
  name: string;
  x: number;
  z: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  stationary?: boolean;
  variant: number;
  role: 'traveller' | 'staff' | 'ground_crew';
}

export interface AirportBaggageItem {
  mesh: THREE.Group;
  path: THREE.CatmullRomCurve3;
  progress: number;
  speed: number;
  rideHeight: number;
  lateralOffset: number;
  lateralVelocity: number;
}

export interface AirportBaggageCarousel {
  group: THREE.Group;
  path: THREE.CatmullRomCurve3;
  beltWidth: number;
  topY: number;
  progressPerSecond: number;
  markerMesh: THREE.InstancedMesh;
  markerProgress: number[];
}

export interface AirportParkingBay {
  id: string;
  position: THREE.Vector3;
  yaw: number;
  row: number;
  column: number;
}

export interface AirportDistrict {
  group: THREE.Group;
  doors: Door[];
  wallColliders: WallBox[];
  landmarks: MapLandmark[];
  aircraft: AirportAircraft[];
  npcSpawns: AirportNpcSpawn[];
  baggageItems: AirportBaggageItem[];
  baggageCarousel: AirportBaggageCarousel;
  destructibles: DestructibleProp[];
  parkingBays: AirportParkingBay[];
  terminalCenter: THREE.Vector3;
  runwayCenter: THREE.Vector3;
  runwayHeading: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

const AIRPORT_Z = -505;
const RUNWAY_Z = -720;
const SPRINGFIELD_AIRPORT_LINK_X = -185; // actual centreline of the user's ~X -184 intersection
const GOLDENROD_AIRPORT_LINK_X = 310;
const AIRPORT_HALF_WIDTH = 650;
const RUNWAY_LENGTH = 1100;
const RUNWAY_WIDTH = 52;

function markRoad(mesh: THREE.Mesh) {
  mesh.userData.walkable = true;
  mesh.userData.walkablePriority = 15;
  mesh.userData.mapRoadSurface = true;
  mesh.userData.permanentRoadGeometry = true;
  mesh.userData.roadCriticalDetail = true;
}

function markWalkable(mesh: THREE.Mesh, priority = 10) {
  mesh.userData.walkable = true;
  mesh.userData.walkablePriority = priority;
}

function markSolid(mesh: THREE.Object3D, padding = 0.02) {
  mesh.userData.solidCollider = true;
  mesh.userData.colliderPadding = padding;
}

function markMapArea(object: THREE.Object3D, kind: string) {
  object.userData.mapAreaKind = kind;
}

function createLabelTexture(text: string, width: number, height: number, color = '#ffffff', background = '#123047', embossed = false) {
  const canvas = document.createElement('canvas');
  const aspect = THREE.MathUtils.clamp(width / Math.max(0.1, height), 1.5, 12);
  canvas.height = 256;
  canvas.width = Math.round(THREE.MathUtils.clamp(canvas.height * aspect, 512, 3072));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // A real manufactured-sign border: dark outer keyline plus a lighter inset lip.
    ctx.strokeStyle = 'rgba(8,18,28,0.88)';
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
    ctx.strokeStyle = 'rgba(235,245,250,0.78)';
    ctx.lineWidth = 7;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

    const explicitLines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const lines = explicitLines.length ? explicitLines : [text];
    const maxTextWidth = canvas.width - 112;
    const maxTextHeight = canvas.height - 76;
    const lineCount = Math.max(1, lines.length);
    let fontSize = Math.min(92, Math.floor(maxTextHeight / lineCount * 0.82));
    const fontFamily = 'Arial Black, Arial, sans-serif';
    const setFont = () => { ctx.font = `900 ${fontSize}px ${fontFamily}`; };
    setFont();
    while (fontSize > 24 && lines.some((line) => ctx.measureText(line).width > maxTextWidth)) {
      fontSize -= 2;
      setFont();
    }
    const lineHeight = Math.min(maxTextHeight / lineCount, fontSize * 1.14);
    const startY = canvas.height / 2 - ((lineCount - 1) * lineHeight) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    lines.forEach((line, index) => {
      const y = startY + index * lineHeight;
      if (embossed) {
        // Two tiny offset passes give the lettering a raised/engraved metal-sign feel
        // while keeping the texture cheap and perfectly readable at distance.
        ctx.lineWidth = Math.max(3, fontSize * 0.075);
        ctx.strokeStyle = 'rgba(0,0,0,0.68)';
        ctx.strokeText(line, canvas.width / 2 + 3, y + 4);
        ctx.strokeStyle = 'rgba(255,255,255,0.24)';
        ctx.strokeText(line, canvas.width / 2 - 2, y - 2);
      }
      ctx.fillStyle = color;
      ctx.fillText(line, canvas.width / 2, y);
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

/** Flat painted/screen label. Used for runway paint, stand paint and the FIDS only. */
function addLabelPlane(text: string, width: number, height: number, color = '#ffffff', background = '#123047') {
  const mat = new THREE.MeshBasicMaterial({ map: createLabelTexture(text, width, height, color, background, false), transparent: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.userData.roadCriticalDetail = true;
  return mesh;
}

/**
 * Thick, framed physical airport sign.  Text is auto-fit to the face so no word or
 * letter can be clipped, and the front sits proud of the metal backing rather than
 * looking like floating text on a plane.
 */
function createPhysicalSign(
  text: string,
  width: number,
  height: number,
  color = '#ffffff',
  background = '#123047',
  mount: 'none' | 'posts' | 'ceiling' | 'wall' = 'none',
) {
  const group = new THREE.Group();
  group.name = `airport_sign_${text.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
  const frameMat = createMaterial(0x8e9ba5, 0.38, 0.78);
  const backingMat = createMaterial(0x24313a, 0.46, 0.68);
  const backing = new THREE.Mesh(new THREE.BoxGeometry(width + 0.28, height + 0.28, 0.22), backingMat);
  backing.position.z = -0.07;
  markSolid(backing, 0.004);
  group.add(backing);

  const faceMat = new THREE.MeshBasicMaterial({ map: createLabelTexture(text, width, height, color, background, true), toneMapped: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), faceMat);
  face.position.z = 0.055;
  face.userData.roadCriticalDetail = true;
  group.add(face);

  const edge = 0.10;
  const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.40, edge, 0.30), frameMat);
  const bottom = top.clone();
  top.position.set(0, height / 2 + 0.12, -0.02);
  bottom.position.set(0, -height / 2 - 0.12, -0.02);
  const left = new THREE.Mesh(new THREE.BoxGeometry(edge, height + 0.40, 0.30), frameMat);
  const right = left.clone();
  left.position.set(-width / 2 - 0.12, 0, -0.02);
  right.position.set(width / 2 + 0.12, 0, -0.02);
  group.add(top, bottom, left, right);

  if (mount === 'posts') {
    for (const sx of [-Math.min(width * 0.32, 2.8), Math.min(width * 0.32, 2.8)]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.20, 4.4, 0.20), frameMat);
      post.position.set(sx, -height / 2 - 2.15, -0.11);
      markSolid(post, 0.004);
      group.add(post);
    }
  } else if (mount === 'ceiling') {
    for (const sx of [-Math.min(width * 0.30, 2.5), Math.min(width * 0.30, 2.5)]) {
      const hangerLength = 4.0;
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, hangerLength, 7), frameMat);
      hanger.position.set(sx, height / 2 + hangerLength / 2, -0.08);
      group.add(hanger);
    }
  } else if (mount === 'wall') {
    for (const sx of [-Math.min(width * 0.34, 3.0), Math.min(width * 0.34, 3.0)]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.52), frameMat);
      bracket.position.set(sx, 0, -0.33);
      group.add(bracket);
    }
  }
  return group;
}

function createFlightBoardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#07141d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d2635';
    ctx.fillRect(34, 34, canvas.width - 68, canvas.height - 68);

    ctx.fillStyle = '#d9f5ff';
    ctx.font = '900 72px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('FLIGHT INFORMATION', 82, 92);
    ctx.fillStyle = '#7fd6ff';
    ctx.font = '700 34px Arial, sans-serif';
    ctx.fillText('SPRINGFIELD REGIONAL AIRPORT', 84, 150);

    const columns = [84, 920, 1215, 1430];
    const headers = ['DESTINATION', 'FLIGHT', 'GATE', 'STATUS'];
    ctx.fillStyle = '#8da9b6';
    ctx.font = '800 31px Arial, sans-serif';
    headers.forEach((header, i) => ctx.fillText(header, columns[i], 210));
    ctx.fillStyle = '#38505d';
    ctx.fillRect(78, 238, canvas.width - 156, 3);

    const rows = [
      ['PALLET TOWN', 'PK 025', '1', 'BOARDING'],
      ['GOLDENROD CITY', 'JO 151', '2', 'ON TIME'],
      ['GOTHAM CITY', 'GC 193', '4', 'DELAYED'],
      ['MUSHROOM KINGDOM', 'MK 064', '5', 'FINAL CALL'],
      ['FAR FAR AWAY', 'FA 221', '3', 'ON TIME'],
      ['MONSTROPOLIS', 'MI 231', '6', 'BOARDING'],
      ['TATOOINE', 'SW 113', '4', 'ON TIME'],
    ] as const;
    const statusColour: Record<string, string> = {
      'BOARDING': '#66f0a5',
      'ON TIME': '#9de7ff',
      'DELAYED': '#ffcc72',
      'FINAL CALL': '#ff7f7f',
    };
    const rowTop = 292;
    const rowHeight = 62;
    rows.forEach((row, rowIndex) => {
      const y = rowTop + rowIndex * rowHeight;
      if (rowIndex % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        ctx.fillRect(70, y - 27, canvas.width - 140, 54);
      }
      ctx.font = '700 34px "Courier New", monospace';
      ctx.fillStyle = '#f2fbff';
      ctx.fillText(row[0], columns[0], y);
      ctx.fillStyle = '#c8e4ee';
      ctx.fillText(row[1], columns[1], y);
      ctx.fillText(row[2], columns[2], y);
      ctx.fillStyle = statusColour[row[3]] ?? '#f2fbff';
      ctx.fillText(row[3], columns[3], y);
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function createFlightInformationBoard() {
  const group = new THREE.Group();
  group.name = 'airport_terminal_flight_information_board';
  const frameMat = createMaterial(0x202a31, 0.32, 0.78);
  const trimMat = createMaterial(0x9aa7ae, 0.28, 0.84);
  const backing = new THREE.Mesh(new THREE.BoxGeometry(30.0, 8.6, 0.55), frameMat);
  backing.position.z = -0.20;
  markSolid(backing, 0.004);
  group.add(backing);
  const screenMat = new THREE.MeshBasicMaterial({ map: createFlightBoardTexture(), toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(29.0, 7.6), screenMat);
  screen.position.z = 0.105;
  screen.userData.interiorDetail = true;
  group.add(screen);
  const edge = 0.24;
  const top = new THREE.Mesh(new THREE.BoxGeometry(30.4, edge, 0.72), trimMat);
  const bottom = top.clone();
  top.position.set(0, 4.32, -0.03);
  bottom.position.set(0, -4.32, -0.03);
  const left = new THREE.Mesh(new THREE.BoxGeometry(edge, 8.7, 0.72), trimMat);
  const right = left.clone();
  left.position.set(-15.08, 0, -0.03);
  right.position.set(15.08, 0, -0.03);
  group.add(top, bottom, left, right);
  for (const sx of [-11.5, 11.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.2, 10), trimMat);
    post.position.set(sx, -5.45, -0.18);
    markSolid(post, 0.004);
    group.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.18, 12), trimMat);
    foot.position.set(sx, -6.58, -0.18);
    group.add(foot);
  }
  return group;
}

function createCurveRibbon(
  curve: THREE.CatmullRomCurve3,
  width: number,
  y: number,
  material: THREE.Material,
  segments = 96,
  thickness = 0.10,
) {
  // Build the ribbon as a shallow closed prism rather than a single plane. The old
  // baggage ribbon used reversed top-face winding, so Three.js correctly culled the
  // entire conveyor when viewed from normal player/camera height. A physical prism
  // gives us upward-facing top normals plus visible metal/belt edges from close and
  // medium third-person angles without globally disabling back-face culling.
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const normal = new THREE.Vector3();
  const bottomY = y - Math.max(0.035, thickness);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t).setY(0);
    if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
    tangent.normalize();
    normal.set(tangent.z, 0, -tangent.x).normalize();
    const left = p.clone().addScaledVector(normal, width * 0.5);
    const right = p.clone().addScaledVector(normal, -width * 0.5);
    // LT, RT, LB, RB
    positions.push(
      left.x, y, left.z,
      right.x, y, right.z,
      left.x, bottomY, left.z,
      right.x, bottomY, right.z,
    );
    const u = t * 12;
    uvs.push(u, 0, u, 1, u, 0, u, 1);
    if (i < segments) {
      const a = i * 4, b = a + 1, lb = a + 2, rb = a + 3;
      const c = a + 4, d = a + 5, lc = a + 6, rc = a + 7;
      // Top faces wind counter-clockwise from above -> +Y normals.
      indices.push(a, b, c, b, d, c);
      // Bottom faces.
      indices.push(lb, lc, rb, rb, lc, rc);
      // Outer/inner vertical skirts keep the conveyor physical from side angles.
      indices.push(a, c, lb, lb, c, lc);
      indices.push(b, rb, d, rb, rc, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = true;
  return mesh;
}

function createAirportLuggage(index: number) {
  const group = new THREE.Group();
  group.name = `airport_baggage_item_${index}`;
  const colours = [0xc74444, 0x245a98, 0x30363d, 0xe9b949, 0x6d4ba8, 0x2c8a67, 0xd56f2d, 0x8a5c3e];
  const colour = colours[index % colours.length];
  const bodyMat = createMaterial(colour, 0.58, 0.12);
  const trimMat = createMaterial(0x20252a, 0.70, 0.12);
  const variant = index % 3;
  const w = variant === 0 ? 1.0 : variant === 1 ? 1.25 : 0.82;
  const h = variant === 0 ? 1.35 : variant === 1 ? 0.88 : 0.72;
  const d = variant === 0 ? 0.48 : variant === 1 ? 0.62 : 0.78;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
  body.position.y = h * 0.5;
  body.rotation.z = variant === 2 ? -0.10 : 0;
  group.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(Math.min(0.28, w * 0.26), 0.045, 6, 12, Math.PI), trimMat);
  handle.rotation.z = Math.PI;
  handle.position.set(0, h + 0.08, 0);
  group.add(handle);
  if (variant !== 2) {
    for (const sx of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), trimMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * w * 0.32, 0.04, d * 0.28);
      group.add(wheel);
    }
  } else {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, d * 1.05), trimMat);
    strap.position.set(0, h * 0.72, 0);
    group.add(strap);
  }
  group.userData.interiorDetail = true;
  return group;
}


function createAirportBaggageTrolley(index: number) {
  const cart = new THREE.Group();
  cart.name = `airport_baggage_trolley_${index}`;
  const frameMat = createMaterial(0xcfd3c8, 0.62, 0.28);
  const railMat = createMaterial(0x68727a, 0.42, 0.72);
  const tyreMat = createMaterial(0x17191c, 0.90, 0.02);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.42, 2.2), frameMat);
  deck.name = `${cart.name}_deck`;
  deck.position.y = 0.70;
  markSolid(deck, 0.01);
  cart.add(deck);

  // Low rails make the cart read as a real baggage compartment while keeping all
  // authored bags visibly inside the trolley footprint.
  for (const sz of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(5.25, 0.58, 0.10), railMat);
    side.name = `${cart.name}_side_${sz}`;
    side.position.set(0, 1.15, sz * 1.03);
    markSolid(side, 0.005);
    cart.add(side);
  }
  for (const sx of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.68, 2.15), railMat);
    end.name = `${cart.name}_end_${sx}`;
    end.position.set(sx * 2.55, 1.18, 0);
    markSolid(end, 0.005);
    cart.add(end);
  }

  for (const sx of [-2, 2]) for (const sz of [-0.8, 0.8]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.24, 10), tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, 0.30, sz);
    cart.add(wheel);
  }

  const layouts = [
    [-1.65, -0.38, 0.58, 0.06],
    [-0.65,  0.34, 0.54, -0.08],
    [ 0.36, -0.32, 0.60, 0.12],
    [ 1.42,  0.30, 0.52, -0.04],
    [ 0.92, -0.10, 0.44, 0.18],
  ] as const;
  layouts.forEach(([lx, lz, scale, yaw], bagIndex) => {
    const bag = createAirportLuggage(index * 7 + bagIndex + 20);
    bag.name = `${cart.name}_luggage_${bagIndex}`;
    bag.scale.setScalar(scale);
    bag.position.set(lx, 0.92, lz);
    bag.rotation.y = yaw;
    cart.add(bag);
  });

  return cart;
}

type RoadSample = {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
};

function sampleSmoothRoad(points: Array<[number, number]>, spacing = 2.8) {
  const anchors = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  if (anchors.length < 2) return { curve: null as THREE.CatmullRomCurve3 | null, samples: [] as RoadSample[], length: 0 };
  const curve = new THREE.CatmullRomCurve3(anchors, false, 'centripetal', 0.35);
  const length = curve.getLength();
  const divisions = Math.max(2, Math.ceil(length / spacing));
  const samples: RoadSample[] = [];
  let travelled = 0;
  let previous: THREE.Vector3 | null = null;
  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t).setY(0);
    if (tangent.lengthSq() < 1e-6 && previous) tangent.copy(point).sub(previous).setY(0);
    if (tangent.lengthSq() < 1e-6) tangent.set(0, 0, 1);
    tangent.normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    if (previous) travelled += point.distanceTo(previous);
    samples.push({ point, tangent, normal, distance: travelled });
    previous = point.clone();
  }
  return { curve, samples, length };
}

function createRoadStrip(
  samples: RoadSample[],
  material: THREE.Material,
  centerOffset: number,
  width: number,
  y: number,
  name: string,
  thickness = 0.15,
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half = width / 2;
  const bottomY = y - Math.max(0.02, thickness);
  for (const sample of samples) {
    const center = sample.point.clone().addScaledVector(sample.normal, centerOffset);
    const left = center.clone().addScaledVector(sample.normal, half);
    const right = center.clone().addScaledVector(sample.normal, -half);
    // TL, TR, BL, BR. A closed shallow prism prevents low camera angles from
    // seeing grass through/under the edge of a curved road.
    positions.push(
      left.x, y, left.z,
      right.x, y, right.z,
      left.x, bottomY, left.z,
      right.x, bottomY, right.z,
    );
    const v = sample.distance / 7.5;
    uvs.push(0, v, 1, v, 0, v, 1, v);
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 4;
    const b = a + 1;
    const bl = a + 2;
    const br = a + 3;
    const c = a + 4;
    const d = a + 5;
    const cl = a + 6;
    const cr = a + 7;
    // Top, bottom, left edge, right edge.
    indices.push(a, b, c, b, d, c);
    indices.push(bl, cl, br, br, cl, cr);
    indices.push(a, c, bl, bl, c, cl);
    indices.push(b, br, d, br, cr, d);
  }
  if (samples.length >= 2) {
    const first = 0;
    const last = (samples.length - 1) * 4;
    indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
    indices.push(last, last + 1, last + 2, last + 1, last + 3, last + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = true;
  return mesh;
}

function roadMapPolygon(samples: RoadSample[], width: number) {
  const half = width / 2;
  const left = samples.map((s) => ({ x: s.point.x + s.normal.x * half, z: s.point.z + s.normal.z * half }));
  const right = [...samples].reverse().map((s) => ({ x: s.point.x - s.normal.x * half, z: s.point.z - s.normal.z * half }));
  // The atlas does not need every 2.8m road sample. Downsample long curves while
  // retaining the first/last vertices so the full map stays cheap and accurate.
  const polygon = [...left, ...right];
  const stride = Math.max(1, Math.floor(polygon.length / 180));
  return polygon.filter((_, i) => i === 0 || i === polygon.length - 1 || i % stride === 0);
}

/**
 * One continuous, smoothly sampled road surface.  Curves are real triangle strips,
 * not overlapping rectangular tiles, so corners cannot expose grass triangles.
 */
function addRoadRibbon(
  parent: THREE.Group,
  name: string,
  points: Array<[number, number]>,
  width: number,
  roadMat: THREE.Material,
  lineMat: THREE.Material,
  addLights = true,
  addSidewalks = true,
  addCenterLine = true,
  destructibles?: DestructibleProp[],
  lightIdPrefix = name,
) {
  const group = new THREE.Group();
  group.name = name;
  const { curve, samples, length } = sampleSmoothRoad(points);
  if (!curve || samples.length < 2) {
    parent.add(group);
    return group;
  }

  const road = createRoadStrip(samples, roadMat, 0, width, 0.171, `${name}_continuous_surface`, 0.16);
  markRoad(road);
  road.userData.mapRoadPolygon = roadMapPolygon(samples, width);
  group.add(road);

  // Clean dashed centre guidance follows the same spline as the asphalt. Markings
  // stop short of the endpoints so connected roads never stack dashes at joins.
  if (addCenterLine && length > 14) {
    const dashLength = 4.2;
    for (let s = 8.0; s <= length - 8.0; s += 18.0) {
      const t = THREE.MathUtils.clamp(s / length, 0, 1);
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).setY(0).normalize();
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.026, dashLength), lineMat);
      dash.position.set(p.x, 0.205, p.z);
      dash.rotation.y = Math.atan2(tangent.x, tangent.z);
      dash.name = `${name}_centre_dash_${Math.round(s)}`;
      dash.userData.roadCriticalDetail = true;
      group.add(dash);
    }
  }

  if (addSidewalks) {
    const sidewalkMat = createSurfaceMaterial(0xb9b8ad, 'concrete', 0.88, 0.01, 7, 24);
    const curbMat = createSurfaceMaterial(0x9c9b91, 'concrete', 0.84, 0.02, 5, 20);
    for (const side of [-1, 1]) {
      const footpathOffset = side * (width / 2 + 1.65);
      const footpath = createRoadStrip(samples, sidewalkMat, footpathOffset, 2.7, 0.205, `${name}_sidewalk_${side}`, 0.13);
      footpath.userData.walkable = true;
      footpath.userData.walkablePriority = 8;
      footpath.userData.sidewalkSurface = true;
      footpath.userData.roadCriticalDetail = true;
      group.add(footpath);

      const curbOffset = side * (width / 2 + 0.18);
      const curb = createRoadStrip(samples, curbMat, curbOffset, 0.30, 0.225, `${name}_curb_${side}`, 0.22);
      curb.userData.curbSurface = true;
      curb.userData.roadCriticalDetail = true;
      group.add(curb);
    }
  }

  if (addLights) {
    for (let s = 30; s < length - 12; s += 58) {
      const t = s / length;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).setY(0).normalize();
      const sideVector = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);
      for (const side of [-1, 1]) {
        const light = new THREE.Group();
        const lightIndex = destructibles?.length ?? Math.round(s * 10 + side);
        light.name = `${lightIdPrefix}_kickable_light_${Math.round(s)}_${side < 0 ? 'left' : 'right'}`;
        light.position.copy(p).addScaledVector(sideVector, side * (width / 2 + 4.2));
        light.userData.colliderPadding = 0.01;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 7.5, 8), createMaterial(0x60717f, 0.45, 0.65));
        pole.name = `${light.name}_shaft`;
        pole.position.y = 3.75;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.20, 1.25), createMaterial(0xdfeaf2, 0.25, 0.25));
        head.position.y = 7.45;
        head.rotation.y = yaw;
        const glow = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.06, 0.85), new THREE.MeshBasicMaterial({ color: 0xfff2bd, toneMapped: false }));
        glow.position.set(0, 7.34, 0);
        glow.rotation.y = yaw;
        light.add(pole, head, glow);
        group.add(light);
        if (destructibles) {
          destructibles.push({
            id: `${lightIdPrefix}_lamp_${lightIndex}`,
            mesh: light,
            type: 'lamp',
            position: { x: light.position.x, y: 0, z: light.position.z },
            destroyed: false,
          });
        } else {
          // Roads that do not opt into shared prop physics retain their legacy solid pole.
          markSolid(pole, 0.01);
        }
      }
    }
  }
  parent.add(group);
  return group;
}


function createInteractiveFencePanel(
  length: number,
  yaw: number,
  x: number,
  z: number,
  id: string,
  destructibles: DestructibleProp[],
  metal: THREE.Material,
  wireMaterial: THREE.Material,
) {
  const panel = new THREE.Group();
  panel.name = `airport_kickable_fence_${id}`;
  panel.position.set(x, 0, z);
  panel.rotation.y = yaw;
  panel.userData.colliderPadding = 0;
  // Airport chain-link panels are authored in the local Y-Z plane: the long rails
  // run along local Z, so the broad panel face normal is local X. Tell the shared
  // fence-settling system which axis is actually the thin/face-normal axis; without
  // this, the global flat-rest torque would try to stand the long rail vertically.
  panel.userData.physicsFenceFaceAxis = 'x';

  const horizontalSegments = Math.max(3, Math.min(20, Math.ceil(length / 1.8)));
  const chain = new THREE.Mesh(new THREE.PlaneGeometry(length, 2.35, horizontalSegments, 5), wireMaterial);
  chain.rotation.y = Math.PI / 2;
  chain.position.y = 1.34;
  chain.castShadow = false;
  panel.add(chain);

  const postGeometry = new THREE.CylinderGeometry(0.075, 0.085, 3.0, 6);
  const posts = new THREE.InstancedMesh(postGeometry, metal, 2);
  const m = new THREE.Matrix4();
  m.makeTranslation(0, 1.5, -length / 2);
  posts.setMatrixAt(0, m);
  m.makeTranslation(0, 1.5, length / 2);
  posts.setMatrixAt(1, m);
  posts.instanceMatrix.needsUpdate = true;
  posts.castShadow = false;
  panel.add(posts);

  const railGeometry = new THREE.BoxGeometry(0.085, 0.085, length);
  const rails = new THREE.InstancedMesh(railGeometry, metal, 2);
  m.makeTranslation(0, 0.34, 0);
  rails.setMatrixAt(0, m);
  m.makeTranslation(0, 2.58, 0);
  rails.setMatrixAt(1, m);
  rails.instanceMatrix.needsUpdate = true;
  rails.castShadow = false;
  panel.add(rails);

  destructibles.push({
    id: `airport_fence_${id}`,
    mesh: panel,
    type: 'fence',
    position: { x, y: 0, z },
    destroyed: false,
  });
  return panel;
}

function createInteractiveFenceRun(
  parent: THREE.Group,
  totalLength: number,
  yaw: number,
  centerX: number,
  centerZ: number,
  idPrefix: string,
  destructibles: DestructibleProp[],
  targetPanelLength = 18,
) {
  const run = new THREE.Group();
  run.name = `airport_interactive_fence_run_${idPrefix}`;
  const metal = createMaterial(0x81909a, 0.58, 0.72);
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0xaebbc2,
    wireframe: true,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    toneMapped: false,
  });
  const count = Math.max(1, Math.ceil(totalLength / targetPanelLength));
  const panelLength = totalLength / count;
  const axisX = Math.sin(yaw);
  const axisZ = Math.cos(yaw);
  for (let i = 0; i < count; i++) {
    const offset = -totalLength / 2 + panelLength * (i + 0.5);
    run.add(createInteractiveFencePanel(
      panelLength,
      yaw,
      centerX + axisX * offset,
      centerZ + axisZ * offset,
      `${idPrefix}_${i}`,
      destructibles,
      metal,
      wireMaterial,
    ));
  }
  parent.add(run);
  return run;
}

function createFenceSegment(length: number, yaw: number, x: number, z: number) {
  const group = new THREE.Group();
  group.name = 'airport_perimeter_fence';
  group.position.set(x, 0, z);
  group.rotation.y = yaw;

  const metal = createMaterial(0x81909a, 0.58, 0.72);
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0xaebbc2,
    wireframe: true,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    toneMapped: false,
  });

  // A subdivided wireframe plane reads like chain-link from normal gameplay distance
  // without creating hundreds of individual diagonal wire meshes. Local plane X is
  // rotated onto the fence's Z axis; the parent yaw then places the whole segment.
  const horizontalSegments = Math.min(220, Math.max(8, Math.ceil(length / 4.0)));
  const chain = new THREE.Mesh(new THREE.PlaneGeometry(length, 2.35, horizontalSegments, 5), wireMaterial);
  chain.rotation.y = Math.PI / 2;
  chain.position.y = 1.34;
  chain.castShadow = false;
  group.add(chain);

  // Posts are instanced so even the kilometre-scale far perimeter remains one draw
  // call instead of hundreds of Cylinder meshes.
  const spacing = 6.0;
  const postCount = Math.max(2, Math.ceil(length / spacing) + 1);
  const postGeometry = new THREE.CylinderGeometry(0.065, 0.075, 3.0, 6);
  const posts = new THREE.InstancedMesh(postGeometry, metal, postCount);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < postCount; i++) {
    const t = postCount <= 1 ? 0.5 : i / (postCount - 1);
    matrix.makeTranslation(0, 1.5, -length / 2 + t * length);
    posts.setMatrixAt(i, matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.castShadow = false;
  group.add(posts);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, length), metal);
  topRail.position.y = 2.58;
  topRail.castShadow = false;
  group.add(topRail);

  // One exact aligned collision sheet backs the visible mesh. It writes no colour or
  // depth, but it is not a random invisible wall: its bounds are exactly the visible
  // perimeter fence, so the physical and visual barrier stay coincident.
  const collisionMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.10, 2.62, length), collisionMaterial);
  blocker.position.y = 1.31;
  blocker.name = 'airport_fence_collision';
  markSolid(blocker, 0.005);
  group.add(blocker);
  return group;
}


function createTaperedWingGeometry(span: number, rootChord: number, tipChordRatio = 0.38, sweep = 0.14, thickness = 0.20) {
  const half = span * 0.5;
  const tipChord = rootChord * tipChordRatio;
  const tipSweep = rootChord * sweep;
  const y0 = -thickness * 0.5;
  const y1 = thickness * 0.5;
  // Per side: root LE/root TE -> swept tip LE/tip TE.  Duplicate top/bottom
  // vertices make a closed low-cost prism that catches highlights like a proper
  // wing while keeping the procedural airport cheap enough to view from the air.
  const plan = [
    [-half, -rootChord * 0.42], [-half, rootChord * 0.58],
    [ half, -rootChord * 0.42], [ half, rootChord * 0.58],
  ];
  // Pull both tips rearward and taper their chord around the swept centre line.
  plan[0] = [-half, tipSweep - tipChord * 0.42];
  plan[1] = [-half, tipSweep + tipChord * 0.58];
  plan[2] = [ half, tipSweep - tipChord * 0.42];
  plan[3] = [ half, tipSweep + tipChord * 0.58];
  const rootLeftLE = [-0.01, -rootChord * 0.42];
  const rootLeftTE = [-0.01, rootChord * 0.58];
  const rootRightLE = [0.01, -rootChord * 0.42];
  const rootRightTE = [0.01, rootChord * 0.58];
  const footprint = [plan[0], plan[1], rootLeftTE, rootLeftLE, rootRightLE, rootRightTE, plan[3], plan[2]];
  const vertices: number[] = [];
  for (const y of [y0, y1]) for (const [x,z] of footprint) vertices.push(x,y,z);
  const n = footprint.length;
  const indices: number[] = [];
  // bottom / top
  for (let i=1;i<n-1;i++) indices.push(0,i+1,i);
  for (let i=1;i<n-1;i++) indices.push(n,n+i,n+i+1);
  // perimeter
  for (let i=0;i<n;i++) {
    const j=(i+1)%n;
    indices.push(i,j,n+j, i,n+j,n+i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createAircraftModel(kind: AirportAircraftKind) {
  const group = new THREE.Group();
  group.name = `airport_aircraft_${kind}`;

  const specs = kind === 'trainer'
    ? { length: 11, wingspan: 13, radius: 0.72, chord: 2.4, body: 0xf5f4e8, accent: 0x1769aa, engines: 1, highWing: true }
    : kind === 'commuter'
    ? { length: 22, wingspan: 24, radius: 1.25, chord: 4.1, body: 0xf7f9fb, accent: 0x16856b, engines: 2, highWing: true }
    : kind === 'zacks_plane'
    ? { length: 14, wingspan: 18, radius: 1.0, chord: 3.2, body: 0xc92127, accent: 0xf7d34a, engines: 1, highWing: true }
    : { length: 43, wingspan: 38, radius: 2.05, chord: 7.0, body: 0xf5f7fb, accent: 0x3b6cb7, engines: 2, highWing: false };

  const bodyMat = createMaterial(specs.body, 0.30, 0.22);
  const accentMat = createMaterial(specs.accent, 0.32, 0.20);
  const darkMat = createMaterial(0x202a35, 0.30, 0.45);
  const metalMat = createMaterial(0xa9b4bd, 0.36, 0.75);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x6fb5d9,
    roughness: 0.18,
    metalness: 0.0,
    transparent: true,
    opacity: 0.52,
    depthWrite: true,
    envMapIntensity: 0.9,
  });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(specs.radius, specs.radius * 0.90, specs.length, 18), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.y = 2.2 + specs.radius * 0.55;
  fuselage.castShadow = true;
  fuselage.receiveShadow = true;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(specs.radius * 0.98, 16, 10), bodyMat);
  nose.scale.z = 1.55;
  nose.position.set(0, fuselage.position.y, specs.length / 2 + specs.radius * 0.28);
  nose.castShadow = true;
  group.add(nose);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(specs.radius * 0.88, specs.radius * 2.5, 16), bodyMat);
  tailCone.rotation.x = -Math.PI / 2;
  tailCone.position.set(0, fuselage.position.y, -specs.length / 2 - specs.radius * 0.72);
  group.add(tailCone);

  const wingY = fuselage.position.y + (specs.highWing ? specs.radius * 0.75 : -specs.radius * 0.12);
  const wing = new THREE.Mesh(createTaperedWingGeometry(specs.wingspan, specs.chord, kind === 'jetliner' ? 0.30 : 0.42, kind === 'jetliner' ? 0.24 : 0.13, 0.28 + specs.radius * 0.10), bodyMat);
  wing.position.set(0, wingY, kind === 'jetliner' ? 0.0 : -0.4);
  wing.castShadow = true;
  group.add(wing);
  const wingAccent = new THREE.Mesh(new THREE.BoxGeometry(specs.wingspan * 0.92, 0.05, 0.34), accentMat);
  wingAccent.position.set(0, wingY + 0.19, wing.position.z + specs.chord * 0.32);
  group.add(wingAccent);

  const hTail = new THREE.Mesh(createTaperedWingGeometry(specs.wingspan * 0.34, specs.chord * 0.45, 0.46, 0.17, 0.20), bodyMat);
  hTail.position.set(0, fuselage.position.y + 0.3, -specs.length * 0.42);
  group.add(hTail);
  const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.34, specs.radius * 3.3 + 1.0, specs.chord * 0.38), accentMat);
  vTail.position.set(0, fuselage.position.y + specs.radius * 1.5 + 0.5, -specs.length * 0.42);
  group.add(vTail);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(specs.radius * 0.82, 14, 8), glassMat);
  cockpit.scale.set(0.82, 0.45, 1.20);
  cockpit.position.set(0, fuselage.position.y + specs.radius * 0.46, specs.length * 0.40);
  group.add(cockpit);

  if (kind === 'jetliner' || kind === 'commuter') {
    const windowCount = kind === 'jetliner' ? 12 : 6;
    for (const side of [-1, 1]) {
      for (let i = 0; i < windowCount; i++) {
        const z = THREE.MathUtils.lerp(-specs.length * 0.33, specs.length * 0.30, i / Math.max(1, windowCount - 1));
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.09, specs.radius * 0.28, specs.radius * 0.40), glassMat);
        w.position.set(side * (specs.radius * 0.98), fuselage.position.y + specs.radius * 0.22, z);
        group.add(w);
      }
    }
  }

  if (specs.engines === 2) {
    for (const side of [-1, 1]) {
      const engine = new THREE.Mesh(new THREE.CylinderGeometry(specs.radius * 0.42, specs.radius * 0.50, specs.chord * 1.15, 14), metalMat);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(side * specs.wingspan * 0.28, wingY - specs.radius * 0.72, wing.position.z + 0.25);
      group.add(engine);
      const intake = new THREE.Mesh(new THREE.TorusGeometry(specs.radius * 0.45, 0.08, 6, 14), darkMat);
      intake.position.set(engine.position.x, engine.position.y, engine.position.z + specs.chord * 0.58);
      group.add(intake);
    }
  } else {
    const propHub = new THREE.Mesh(new THREE.CylinderGeometry(specs.radius * 0.26, specs.radius * 0.30, 0.72, 12), metalMat);
    propHub.rotation.x = Math.PI / 2;
    propHub.position.set(0, fuselage.position.y, specs.length / 2 + specs.radius * 1.45);
    const prop = new THREE.Group();
    prop.name = 'aircraft_propeller';
    prop.position.copy(propHub.position);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(specs.radius * 0.18, specs.radius * 3.4, 0.10), darkMat);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(specs.radius * 3.4, specs.radius * 0.18, 0.10), darkMat);
    prop.add(blade1, blade2);
    group.add(propHub, prop);
  }

  // Landing gear is deliberately visible and aligned with the physics gear height.
  const wheelMat = createMaterial(0x161a1f, 0.88, 0.05);
  const strutMat = createMaterial(0x9aa4ae, 0.32, 0.82);
  const gearY = 0.62;
  const mainGearZ = kind === 'jetliner' ? -1.4 : -0.7;
  const gearXs = kind === 'jetliner' ? [-4.1, 4.1] : [-specs.wingspan * 0.20, specs.wingspan * 0.20];
  gearXs.forEach((x) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, fuselage.position.y - gearY, 8), strutMat);
    strut.position.set(x, (fuselage.position.y + gearY) / 2, mainGearZ);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.33 + specs.radius * 0.06, 0.12, 8, 12), wheelMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, gearY, mainGearZ);
    group.add(strut, wheel);
  });
  const noseWheel = new THREE.Mesh(new THREE.TorusGeometry(0.28 + specs.radius * 0.04, 0.10, 8, 12), wheelMat);
  noseWheel.rotation.y = Math.PI / 2;
  noseWheel.position.set(0, gearY, specs.length * 0.32);
  group.add(noseWheel);

  const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2b2b, toneMapped: false }));
  const greenLight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x42ff8a, toneMapped: false }));
  redLight.position.set(-specs.wingspan / 2, wingY, wing.position.z);
  greenLight.position.set(specs.wingspan / 2, wingY, wing.position.z);
  group.add(redLight, greenLight);

  // Zack/Norbert reference: the Simpsons episode has him arrive in his own red
  // biplane. Keep that unmistakable two-wing silhouette instead of making a generic
  // red monoplane with a name attached to it.
  if (kind === 'zacks_plane') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(specs.radius * 2.04, 0.22, specs.length * 0.70), accentMat);
    stripe.position.set(0, fuselage.position.y + 0.14, 0.4);
    group.add(stripe);
    const lowerWing = new THREE.Mesh(createTaperedWingGeometry(specs.wingspan * 0.93, specs.chord * 0.88, 0.44, 0.08, 0.24), bodyMat);
    lowerWing.position.set(0, fuselage.position.y - 0.85, -0.2);
    lowerWing.castShadow = true;
    group.add(lowerWing);
    for (const side of [-1, 1]) {
      for (const xScale of [0.25, 0.42]) {
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.25, 0.13), metalMat);
        brace.position.set(side * specs.wingspan * xScale, fuselage.position.y + 0.10, -0.2);
        brace.rotation.z = side * 0.08;
        group.add(brace);
      }
    }
    const yellowTips = new THREE.Mesh(new THREE.BoxGeometry(specs.wingspan * 0.96, 0.06, 0.28), accentMat);
    yellowTips.position.set(0, lowerWing.position.y + 0.17, lowerWing.position.z + specs.chord * 0.30);
    group.add(yellowTips);
  }

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  group.userData.aircraftKind = kind;
  group.userData.aircraftLength = specs.length;
  group.userData.aircraftWingspan = specs.wingspan;
  return { group, specs };
}

function airportAircraft(
  id: string,
  name: string,
  kind: AirportAircraftKind,
  x: number,
  z: number,
  yaw: number,
): AirportAircraft {
  const { group, specs } = createAircraftModel(kind);
  group.position.set(x, -0.16, z);
  group.rotation.y = yaw;
  const maxSpeed = kind === 'trainer' ? 54 : kind === 'commuter' ? 72 : kind === 'zacks_plane' ? 63 : 92;
  const takeoffSpeed = kind === 'trainer' ? 24 : kind === 'commuter' ? 32 : kind === 'zacks_plane' ? 27 : 43;
  const acceleration = kind === 'trainer' ? 12 : kind === 'commuter' ? 10.5 : kind === 'zacks_plane' ? 13 : 8.5;
  const mass = kind === 'trainer' ? 0.75 : kind === 'commuter' ? 1.6 : kind === 'zacks_plane' ? 1.05 : 4.2;
  const liftFactor = kind === 'trainer' ? 1.10 : kind === 'commuter' ? 1.02 : kind === 'zacks_plane' ? 1.08 : 0.98;
  const dragFactor = kind === 'trainer' ? 1.05 : kind === 'commuter' ? 0.96 : kind === 'zacks_plane' ? 1.02 : 0.88;
  const turnResponsiveness = kind === 'trainer' ? 1.22 : kind === 'commuter' ? 0.90 : kind === 'zacks_plane' ? 1.12 : 0.68;
  const pitchResponsiveness = kind === 'trainer' ? 1.18 : kind === 'commuter' ? 0.94 : kind === 'zacks_plane' ? 1.10 : 0.72;
  const brakeStrength = kind === 'trainer' ? 7.0 : kind === 'commuter' ? 5.8 : kind === 'zacks_plane' ? 6.6 : 4.3;
  const reverseTaxiSpeed = kind === 'jetliner' ? 3.2 : kind === 'commuter' ? 4.0 : 4.8;
  const gearHeight = -0.62;
  return {
    id, name, kind, mesh: group, position: group.position.clone(), yaw, pitch: 0, roll: 0,
    speed: 0, throttle: 0, verticalSpeed: 0, maxSpeed, takeoffSpeed, acceleration, mass,
    liftFactor, dragFactor, turnResponsiveness, pitchResponsiveness, brakeStrength, reverseTaxiSpeed,
    wingspan: specs.wingspan, length: specs.length, gearHeight,
    collisionRadius: kind === 'jetliner' ? 3.0 : kind === 'commuter' ? 2.0 : 1.3,
    inUse: false, crashed: false, damage: 0, onGround: true,
    spawnPosition: new THREE.Vector3(x, -0.62, z), spawnYaw: yaw,
  };
}

export function buildAirportDistrict(): AirportDistrict {
  const root = new THREE.Group();
  root.name = 'airport_district';
  const doors: Door[] = [];
  const wallColliders: WallBox[] = [];
  const landmarks: MapLandmark[] = [];
  const aircraft: AirportAircraft[] = [];
  const npcSpawns: AirportNpcSpawn[] = [];
  const baggageItems: AirportBaggageItem[] = [];
  const destructibles: DestructibleProp[] = [];
  const parkingBays: AirportParkingBay[] = [];

  const roadMat = createSurfaceMaterial(0x30343b, 'asphalt', 0.93, 0.02, 36, 36);
  const apronMat = createSurfaceMaterial(0x666c70, 'concrete', 0.94, 0.02, 44, 28);
  const concreteMat = createSurfaceMaterial(0xc7c6bd, 'concrete', 0.91, 0.02, 20, 20);
  const whiteMat = createMaterial(0xf8fbff, 0.56, 0.08);
  const yellowMat = createMaterial(0xffc928, 0.52, 0.08);
  // Airport paint always renders as one stable layer above pavement. Polygon offset
  // is a second line of defence against distant-camera z-fighting on thin markings.
  for (const markingMat of [whiteMat, yellowMat]) {
    markingMat.polygonOffset = true;
    markingMat.polygonOffsetFactor = -2;
    markingMat.polygonOffsetUnits = -2;
  }
  const blueMat = createMaterial(0x2b5f91, 0.48, 0.20);
  const terminalWallMat = createSurfaceMaterial(0xe7e0cc, 'concrete', 0.72, 0.03, 18, 12);
  const terminalInteriorWallMat = createSurfaceMaterial(0xf1eee4, 'concrete', 0.82, 0.01, 14, 10);
  // Targeted terminal-only insurance against imported/generated normal winding
  // inconsistencies. Major walls are still thick box geometry with explicit inner
  // finish faces; this does not disable culling across the rest of the world.
  terminalWallMat.side = THREE.DoubleSide;
  terminalInteriorWallMat.side = THREE.DoubleSide;
  const terminalDarkMat = createMaterial(0x304858, 0.52, 0.44);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x82c8e8, roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.42,
    depthWrite: true, envMapIntensity: 1.15, side: THREE.DoubleSide,
  });

  // -----------------------------------------------------------------------
  // AIRPORT TERRAIN TRANSITION / GREEN BELT
  // -----------------------------------------------------------------------
  const districtGrass = new THREE.Mesh(
    new THREE.BoxGeometry(AIRPORT_HALF_WIDTH * 2, 0.10, 730),
    createSurfaceMaterial(0x629b3b, 'grass', 0.98, 0.0, 56, 56)
  );
  districtGrass.name = 'airport_district_grass';
  districtGrass.position.set(0, -0.035, -535);
  markWalkable(districtGrass, 1);
  // Do not paint the whole 1.3 km grass reserve as an "airport" block on the full
  // map. The actual terminal/apron/taxiway/runway footprints below define the airport
  // at the same world scale as the two cities.
  root.add(districtGrass);

  // -----------------------------------------------------------------------
  // ONE CLEAN PUBLIC ROAD SPINE
  // -----------------------------------------------------------------------
  // Springfield still leaves the real X≈-184/-185 intersection. Goldenrod now
  // continues from East Avenue at X=310, completely bypassing Professor Oak's Lab
  // at X=200/Z≈-200. The old X=200 airport spur no longer exists visually,
  // physically or in the traffic graph. A single spline runs city -> terminal ->
  // city, eliminating the stacked rectangle feeds/return loop that caused grass
  // wedges, duplicate asphalt, stray pavement and crossing lane markings.
  const publicRoadSpine: Array<[number, number]> = [
    [SPRINGFIELD_AIRPORT_LINK_X, -170],
    [SPRINGFIELD_AIRPORT_LINK_X, -214],
    [-178, -248], [-164, -280], [-142, -312], [-116, -340], [-86, -365], [-68, -389], [-82, -414], [-88, -432],
    [-70, -438], [-40, -441], [0, -442], [40, -441], [70, -438], [88, -432],
    [96, -412], [126, -394], [162, -376], [196, -354], [228, -328], [255, -298], [278, -266], [296, -230],
    [GOLDENROD_AIRPORT_LINK_X, -194], [GOLDENROD_AIRPORT_LINK_X, -150],
  ];
  addRoadRibbon(root, 'airport_public_access_spine', publicRoadSpine, 15.5, roadMat, yellowMat, true, true, true, destructibles, 'airport_access_road');

  // Physical manufactured direction signs. The faces auto-fit their wording and
  // have thickness, metal frames and real mounts instead of floating text planes.
  const westRoadSign = createPhysicalSign('AIRPORT\nTERMINAL →', 9.4, 2.5, '#ffffff', '#176c43', 'posts');
  westRoadSign.rotation.y = 0.48;
  // Keep the directional sign parallel to the approach road, but move it backwards
  // from its readable face onto the footpath instead of leaving its posts in the
  // traffic lane.  Y=5.81 plants the post feet on the ~0.21m-high sidewalk.
  westRoadSign.position.set(-115.62, 5.81, -354.87);
  root.add(westRoadSign);

  const eastRoadSign = createPhysicalSign('← AIRPORT\nTERMINAL', 9.4, 2.5, '#ffffff', '#176c43', 'posts');
  eastRoadSign.rotation.y = -0.64;
  // Same treatment on the Goldenrod-side approach: roadside footpath, facing back
  // toward the road, with no sign/post collision left in the driving surface.
  eastRoadSign.position.set(225.97, 5.81, -345.02);
  root.add(eastRoadSign);

  // -----------------------------------------------------------------------
  // PUBLIC PARKING AND LANDSIDE DETAIL
  // -----------------------------------------------------------------------
  // Parking is deliberately off the main approach spine. The previous 176x54 slab
  // sat directly underneath the terminal roads and was one of the largest sources
  // of stacked asphalt / white-line z-fighting in the approach area.
  const parking = new THREE.Mesh(new THREE.BoxGeometry(96, 0.15, 70), apronMat);
  parking.name = 'airport_public_parking_surface';
  parking.position.set(260, 0.075, -397);
  markWalkable(parking, 8);
  markMapArea(parking, 'paved');
  root.add(parking);
  for (let x = 220; x <= 300; x += 8) {
    for (const z of [-378, -397, -416]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 5.2), whiteMat);
      stripe.position.set(x, 0.172, z);
      stripe.userData.roadCriticalDetail = true;
      root.add(stripe);
    }
  }
  // Parking bay centres are authored from the SAME divider geometry above so any
  // parked vehicles added by App stay mathematically aligned with the painted bays.
  // Each row points toward its nearest circulation aisle rather than scattering
  // cars at arbitrary angles.  The list includes every bay; population deliberately
  // chooses only a subset so the airport never looks jammed or completely full.
  const parkingBayXs = [224,232,240,248,256,264,272,280,288,296];
  const parkingRows = [
    { z: -378, yaw: Math.PI },
    { z: -397, yaw: 0 },
    { z: -416, yaw: Math.PI },
  ];
  parkingRows.forEach((row, rowIndex) => {
    parkingBayXs.forEach((x, column) => {
      parkingBays.push({
        id: `airport_parking_r${rowIndex}_c${column}`,
        position: new THREE.Vector3(x, 0.15, row.z),
        yaw: row.yaw,
        row: rowIndex,
        column,
      });
    });
  });
  // A short driveway connects the east approach to the parking lot without
  // becoming part of the through-traffic route or laying another lane over the
  // terminal frontage.
  const parkingAccess = addRoadRibbon(root, 'airport_parking_access', [[198,-355],[207,-365],[214,-382],[214,-397]], 7.0, roadMat, yellowMat, false, false, false);
  parkingAccess.position.y = 0.008;

  // Taxi/pick-up is a signed kerb zone on the SAME frontage road, not a second
  // coplanar asphalt rectangle. That removes the old flashing white/grey surface.
  const taxiSign = createPhysicalSign('TAXI / PICK-UP', 10.8, 1.9, '#ffffff', '#315a7b', 'posts');
  taxiSign.position.set(-55, 5.4, -455.2);
  taxiSign.rotation.y = Math.PI;
  root.add(taxiSign);


  // Pedestrian forecourt begins AFTER the kerb and ends exactly at the terminal
  // facade. It no longer intrudes into the traffic lane.
  const forecourt = new THREE.Mesh(new THREE.BoxGeometry(126, 0.14, 7.5), concreteMat);
  forecourt.name = 'airport_terminal_forecourt';
  forecourt.position.set(0, 0.10, -454.0);
  markWalkable(forecourt, 18);
  markMapArea(forecourt, 'paved');
  root.add(forecourt);
  for (const x of [-42,-14,14,42]) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.19,0.85,8), terminalDarkMat);
    bollard.position.set(x,0.50,-450.6);
    markSolid(bollard,0.005);
    root.add(bollard);
  }

  // Low-maintenance airport landscaping stays outside the swept road envelope.
  const planterMat = createSurfaceMaterial(0xa9a28e, 'concrete', 0.88, 0.01, 4, 4);
  const shrubMat = createMaterial(0x4f8a3a, 0.92, 0.02);
  for (const [x,z] of [[-118,-370],[-112,-410],[120,-370],[145,-430],[-108,-438],[112,-438]] as const) {
    const planter = new THREE.Group(); planter.position.set(x,0,z); planter.name='airport_landscape_planter';
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.8,0.65,2.6), planterMat); base.position.y=0.33; markSolid(base,0.01);
    const shrubA = new THREE.Mesh(new THREE.SphereGeometry(1.15,8,6), shrubMat); shrubA.scale.set(1.65,0.72,0.82); shrubA.position.set(-1.2,1.0,0);
    const shrubB = shrubA.clone(); shrubB.position.x=1.2;
    planter.add(base,shrubA,shrubB); root.add(planter);
  }

  // -----------------------------------------------------------------------
  // TERMINAL - ENTERABLE, CAMERA-FRIENDLY, AUTHORED OPENINGS
  // -----------------------------------------------------------------------
  const terminal = new THREE.Group();
  terminal.name = 'airport_terminal_building';
  terminal.position.set(0, 0, AIRPORT_Z + 15);
  const tw = 128, td = 64, th = 12;
  const terminalFloor = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.24, td), concreteMat);
  terminalFloor.name = 'airport_terminal_floor';
  terminalFloor.position.y = 0.10;
  markWalkable(terminalFloor, 30);
  markMapArea(terminalFloor, 'terminal');
  terminal.add(terminalFloor);

  // Terminal structure is made from genuinely thick box walls, then receives a
  // separate room-facing finish skin. This keeps an exterior concrete face,
  // interior face and real wall thickness instead of relying on single-sided planes
  // that can disappear when viewed from inside the building.
  const addBackWallSegment = (a: number, b: number, name: string) => {
    const width = b - a;
    if (width <= 0.2) return;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, th, 0.45), terminalWallMat);
    wall.name = name;
    wall.position.set((a + b) / 2, th / 2, -td / 2);
    markSolid(wall);
    terminal.add(wall);
    const interior = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1, width - 0.04), th - 0.18, 0.035), terminalInteriorWallMat);
    interior.name = `${name}_interior_face`;
    interior.position.set((a + b) / 2, th / 2, -td / 2 + 0.245);
    interior.userData.interiorDetail = true;
    terminal.add(interior);
  };
  const addSideWallSegment = (x: number, zCenter: number, depth: number, name: string) => {
    if (depth <= 0.2) return;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.45, th, depth), terminalWallMat);
    wall.name = name;
    wall.position.set(x, th / 2, zCenter);
    markSolid(wall);
    terminal.add(wall);
    const interiorX = x + (x < 0 ? 0.245 : -0.245);
    const interior = new THREE.Mesh(new THREE.BoxGeometry(0.035, th - 0.18, Math.max(0.1, depth - 0.04)), terminalInteriorWallMat);
    interior.name = `${name}_interior_face`;
    interior.position.set(interiorX, th / 2, zCenter);
    interior.userData.interiorDetail = true;
    terminal.add(interior);
  };

  // Airside wall is split around three real gate portals. The earlier monolithic
  // wall visually showed jet bridges but physically blocked every one of them.
  const gatePortalXs = [-38, 0, 38];
  const gatePortalWidth = 8.0;
  const backEdges = [-tw/2, ...gatePortalXs.flatMap((x) => [x - gatePortalWidth/2, x + gatePortalWidth/2]), tw/2];
  for (let i = 0; i < backEdges.length - 1; i += 2) {
    const a = backEdges[i], b = backEdges[i + 1];
    addBackWallSegment(a, b, `airport_terminal_airside_wall_${i / 2}`);
  }
  // Headers retain the façade above each open passenger gate without blocking the
  // walkable opening below.
  for (const x of gatePortalXs) {
    const header = new THREE.Mesh(new THREE.BoxGeometry(gatePortalWidth, 5.0, 0.45), terminalWallMat);
    header.position.set(x, 9.5, -td/2);
    markSolid(header);
    terminal.add(header);
    const headerInterior = new THREE.Mesh(new THREE.BoxGeometry(gatePortalWidth - 0.06, 4.82, 0.035), terminalInteriorWallMat);
    headerInterior.position.set(x, 9.5, -td / 2 + 0.245);
    headerInterior.userData.interiorDetail = true;
    terminal.add(headerInterior);
  }

  // Baggage handling now penetrates a real service opening in the LEFT terminal
  // wall. Split the wall around that opening instead of hiding a conveyor inside a
  // solid box. The high header keeps the building structurally/visually continuous.
  const baggageOpeningMinZ = -20.5;
  const baggageOpeningMaxZ = -8.5;
  const baggageOpeningHeight = 3.0;
  addSideWallSegment(-tw / 2, (-td / 2 + baggageOpeningMinZ) / 2, baggageOpeningMinZ - (-td / 2), 'airport_terminal_left_wall_rear');
  addSideWallSegment(-tw / 2, (baggageOpeningMaxZ + td / 2) / 2, td / 2 - baggageOpeningMaxZ, 'airport_terminal_left_wall_front');
  const baggageHeader = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, th - baggageOpeningHeight, baggageOpeningMaxZ - baggageOpeningMinZ),
    terminalWallMat
  );
  baggageHeader.name = 'airport_terminal_baggage_wall_header';
  baggageHeader.position.set(-tw / 2, baggageOpeningHeight + (th - baggageOpeningHeight) / 2, (baggageOpeningMinZ + baggageOpeningMaxZ) / 2);
  markSolid(baggageHeader);
  terminal.add(baggageHeader);
  const baggageHeaderInterior = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, th - baggageOpeningHeight - 0.12, baggageOpeningMaxZ - baggageOpeningMinZ - 0.06),
    terminalInteriorWallMat
  );
  baggageHeaderInterior.position.set(-tw / 2 + 0.245, baggageHeader.position.y, baggageHeader.position.z);
  baggageHeaderInterior.userData.interiorDetail = true;
  terminal.add(baggageHeaderInterior);
  addSideWallSegment(tw / 2, 0, td, 'airport_terminal_right_wall');

  // Front façade uses separate glass/wall bays so there is physically open space at the two entrance doors.
  const entranceXs = [-27, 27];
  const frontZ = td/2;
  // Derive the glass spans from the ACTUAL 7 m sliding-door portals. This avoids
  // the old half-metre decorative-glass overlap that could make an apparently open
  // terminal entrance physically catch the player/camera. Leave 0.35 m extra
  // clearance at each jamb for the door frame/third-person capsule.
  const doorClearHalf = 7.0 * 0.5 + 0.35;
  const facadeMin = -tw / 2;
  const facadeMax = tw / 2;
  const openings = entranceXs.map((x) => ({ min: x - doorClearHalf, max: x + doorClearHalf }));
  const facadeRuns: Array<[number, number]> = [
    [facadeMin, openings[0].min],
    [openings[0].max, openings[1].min],
    [openings[1].max, facadeMax],
  ];
  const frontSegments = facadeRuns
    .filter(([a,b]) => b - a > 0.2)
    .map(([a,b]) => ({ x:(a+b)/2, w:b-a }));
  frontSegments.forEach((seg, i) => {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(seg.w, 8.2, 0.20), glassMat);
    glass.position.set(seg.x, 4.55, frontZ);
    glass.name = `airport_terminal_front_glass_${i}`;
    markSolid(glass, 0.005);
    terminal.add(glass);
    const header = new THREE.Mesh(new THREE.BoxGeometry(seg.w, 2.6, 0.45), terminalWallMat);
    header.position.set(seg.x, 10.7, frontZ);
    markSolid(header);
    terminal.add(header);
  });

  entranceXs.forEach((x, index) => {
    const door = new Door({
      id: `airport_terminal_entry_${index}`,
      name: index === 0 ? 'Arrivals Entrance' : 'Departures Entrance',
      houseName: 'Springfield Regional Airport',
      type: 'double_slide', width: 7.0, height: 4.4,
      worldPos: new THREE.Vector3(x, 0, terminal.position.z + frontZ + 0.03),
      rotationY: 0,
      frameColor: 0x36566a,
      glassColor: 0x83c9e6,
      slideDistance: 2.8,
      depth: 0.20,
    });
    door.setAutomatic(5.6, 1.25);
    doors.push(door);
    root.add(door.group);
  });

  // Three real automatic sliding doors protect the airside portals. Their moving
  // leaves receive dynamic collision in CollisionSystem, so an opened doorway is
  // physically open while the panels themselves remain solid beside it.
  gatePortalXs.forEach((x, index) => {
    const gateDoor = new Door({
      id: `airport_gate_auto_${index + 1}`,
      name: index === 1 ? 'Runway Access Automatic Doors' : `Gate ${index === 0 ? 1 : 6} Automatic Doors`,
      houseName: 'Springfield Regional Airport',
      type: 'double_slide', width: 7.6, height: 4.5,
      worldPos: new THREE.Vector3(x, 0, terminal.position.z - td / 2 + 0.03),
      rotationY: 0,
      frameColor: 0x71828b,
      glassColor: 0x98d9ee,
      slideDistance: 3.25,
      depth: 0.18,
    });
    gateDoor.setAutomatic(5.4, 1.4);
    doors.push(gateDoor);
    root.add(gateDoor.group);
  });

  const roof = new THREE.Mesh(new THREE.BoxGeometry(tw + 1.5, 0.42, td + 1.5), terminalDarkMat);
  roof.name = 'airport_terminal_roof';
  roof.position.set(0, th + 0.16, 0);
  roof.userData.cameraCeiling = true;
  terminal.add(roof);

  // Entrance canopy and large airport title.
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(82, 0.38, 10), terminalDarkMat);
  canopy.position.set(0, 5.3, frontZ + 5.0);
  terminal.add(canopy);
  const terminalTitle = createPhysicalSign('SPRINGFIELD REGIONAL AIRPORT', 50, 4.2, '#fff6b0', '#29485f', 'wall');
  terminalTitle.position.set(0, 9.0, frontZ + 0.28);
  terminal.add(terminalTitle);
  const arrivalsExterior = createPhysicalSign('ARRIVALS / PICK-UP', 13.5, 1.55, '#ffffff', '#405d70', 'wall');
  arrivalsExterior.position.set(entranceXs[0], 5.8, frontZ + 0.32);
  terminal.add(arrivalsExterior);
  const departuresExterior = createPhysicalSign('DEPARTURES / DROP-OFF', 15.5, 1.55, '#ffffff', '#315a7b', 'wall');
  departuresExterior.position.set(entranceXs[1], 5.8, frontZ + 0.32);
  terminal.add(departuresExterior);

  // Check-in desks / departures side.
  for (let i = 0; i < 7; i++) {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.05, 1.5), createMaterial(0x547487, 0.58, 0.18));
    desk.position.set(-45 + i * 7.2, 0.63, 15.0);
    markSolid(desk, 0.015);
    terminal.add(desk);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 0.12), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x3bc7ff : 0xffd43b, toneMapped: false }));
    screen.position.set(desk.position.x, 2.4, 14.45);
    terminal.add(screen);
  }
  const departures = createPhysicalSign('DEPARTURES • CHECK-IN', 28, 2.2, '#ffffff', '#315a7b', 'ceiling');
  departures.position.set(-31, 6.7, 12.0);
  terminal.add(departures);

  // Security lanes leave broad gaps for third-person navigation.
  for (let i = 0; i < 5; i++) {
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.1, 12), createMaterial(0xb1bbc2, 0.45, 0.72));
    railL.position.set(-14 + i * 7.0, 0.65, 1.0);
    markSolid(railL, 0.005);
    terminal.add(railL);
  }
  const security = createPhysicalSign('SECURITY  →  GATES 1–6', 27, 2.0, '#ffffff', '#235c73', 'ceiling');
  security.position.set(0, 7.1, -1.0);
  terminal.add(security);

  // ---------------------------------------------------------------------
  // BAGGAGE CLAIM - CONTINUOUS LEFT-WALL LOOP WITH POOLED MOVING LUGGAGE
  // ---------------------------------------------------------------------
  const baggageGroup = new THREE.Group();
  baggageGroup.name = 'airport_terminal_baggage_claim';
  const baggagePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-69.0, 0, -17.2),
    new THREE.Vector3(-61.0, 0, -17.3),
    new THREE.Vector3(-57.2, 0, -23.0),
    new THREE.Vector3(-47.0, 0, -25.0),
    new THREE.Vector3(-37.0, 0, -22.6),
    new THREE.Vector3(-33.6, 0, -16.2),
    new THREE.Vector3(-36.6, 0, -9.3),
    new THREE.Vector3(-47.0, 0, -6.3),
    new THREE.Vector3(-57.5, 0, -8.1),
    new THREE.Vector3(-61.0, 0, -12.0),
    new THREE.Vector3(-69.0, 0, -12.0),
  ], true, 'centripetal', 0.35);
  const baggageBaseMat = createMaterial(0x4b5359, 0.58, 0.66);
  const baggageEdgeMat = createMaterial(0xa7b0b6, 0.34, 0.78);
  const baggageBeltMat = createMaterial(0x1a1f23, 0.74, 0.22);
  const baseRibbon = createCurveRibbon(baggagePath, 6.0, 0.47, baggageBaseMat, 112, 0.44);
  baseRibbon.name = 'airport_baggage_carousel_base';
  const edgeRibbon = createCurveRibbon(baggagePath, 5.55, 0.72, baggageEdgeMat, 112, 0.27);
  edgeRibbon.name = 'airport_baggage_carousel_metal_edge';
  const beltRibbon = createCurveRibbon(baggagePath, 4.72, 0.78, baggageBeltMat, 112, 0.12);
  beltRibbon.name = 'airport_baggage_carousel_belt';
  markWalkable(beltRibbon, 38);
  beltRibbon.userData.baggageCarouselBelt = true;
  baggageGroup.add(baseRibbon, edgeRibbon, beltRibbon);

  // Collision follows the curved visible body in short tangent-aligned pieces. This
  // deliberately avoids the old failure mode of one giant invisible baggage-claim
  // cube while still making the metal base/outer conveyor body physically solid.
  const carouselCollisionMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const carouselCollisionSegments = 44;
  const carouselPathLength = baggagePath.getLength();
  const carouselSegmentLength = carouselPathLength / carouselCollisionSegments * 1.18;
  const carouselPoint = new THREE.Vector3();
  const carouselTangent = new THREE.Vector3();
  for (let i = 0; i < carouselCollisionSegments; i++) {
    const t = (i + 0.5) / carouselCollisionSegments;
    baggagePath.getPoint(t, carouselPoint);
    baggagePath.getTangent(t, carouselTangent).setY(0).normalize();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.86, 0.74, carouselSegmentLength), carouselCollisionMaterial);
    body.name = `airport_baggage_carousel_body_collider_${i}`;
    body.position.set(carouselPoint.x, 0.37, carouselPoint.z);
    body.rotation.y = Math.atan2(carouselTangent.x, carouselTangent.z);
    markSolid(body, 0.004);
    baggageGroup.add(body);
  }

  // One instanced draw call provides clear moving belt slats. They use the exact same
  // path speed/direction as the luggage and player conveyor velocity below.
  const beltMarkerCount = 28;
  const beltMarkerProgress = Array.from({ length: beltMarkerCount }, (_, i) => i / beltMarkerCount);
  const beltMarkers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(3.6, 0.025, 0.11),
    createMaterial(0x697078, 0.52, 0.34),
    beltMarkerCount,
  );
  beltMarkers.name = 'airport_baggage_carousel_moving_slats';
  beltMarkers.castShadow = false;
  beltMarkers.receiveShadow = false;
  const beltMarkerMatrix = new THREE.Matrix4();
  const beltMarkerQuat = new THREE.Quaternion();
  const beltMarkerScale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < beltMarkerCount; i++) {
    baggagePath.getPoint(beltMarkerProgress[i], carouselPoint);
    baggagePath.getTangent(beltMarkerProgress[i], carouselTangent).setY(0).normalize();
    beltMarkerQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(carouselTangent.x, carouselTangent.z));
    beltMarkerMatrix.compose(new THREE.Vector3(carouselPoint.x, 0.846, carouselPoint.z), beltMarkerQuat, beltMarkerScale);
    beltMarkers.setMatrixAt(i, beltMarkerMatrix);
  }
  beltMarkers.instanceMatrix.needsUpdate = true;
  baggageGroup.add(beltMarkers);

  // The service throat hides the recycle portion of the loop beyond the wall while
  // leaving the visible opening genuinely open for the moving bags.
  const baggageServiceMat = createMaterial(0x242d33, 0.78, 0.12);
  const serviceFloor = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.16, 12.0), baggageServiceMat);
  serviceFloor.position.set(-68.7, 0.12, -14.5);
  baggageGroup.add(serviceFloor);
  const serviceRoof = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.20, 12.0), baggageServiceMat);
  serviceRoof.position.set(-68.7, 3.05, -14.5);
  baggageGroup.add(serviceRoof);
  for (const z of [baggageOpeningMinZ, baggageOpeningMaxZ]) {
    const serviceSide = new THREE.Mesh(new THREE.BoxGeometry(10.0, 3.0, 0.20), baggageServiceMat);
    serviceSide.position.set(-68.7, 1.5, z);
    markSolid(serviceSide, 0.003);
    baggageGroup.add(serviceSide);
  }
  const serviceBack = new THREE.Mesh(new THREE.BoxGeometry(0.20, 3.0, baggageOpeningMaxZ - baggageOpeningMinZ), baggageServiceMat);
  serviceBack.position.set(-73.6, 1.5, (baggageOpeningMinZ + baggageOpeningMaxZ) * 0.5);
  markSolid(serviceBack, 0.003);
  baggageGroup.add(serviceBack);

  // Metal frame around the real wall opening.
  const openingFrameMat = createMaterial(0x8f9ca4, 0.32, 0.82);
  for (const z of [baggageOpeningMinZ, baggageOpeningMaxZ]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.38, baggageOpeningHeight, 0.30), openingFrameMat);
    jamb.position.set(-tw / 2 + 0.04, baggageOpeningHeight / 2, z);
    baggageGroup.add(jamb);
  }
  const openingHeader = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, baggageOpeningMaxZ - baggageOpeningMinZ), openingFrameMat);
  openingHeader.position.set(-tw / 2 + 0.04, baggageOpeningHeight - 0.12, (baggageOpeningMinZ + baggageOpeningMaxZ) * 0.5);
  baggageGroup.add(openingHeader);

  const baggageSign = createPhysicalSign('BAGGAGE CLAIM 1', 12.5, 1.55, '#ffffff', '#45545f', 'wall');
  baggageSign.position.set(-tw / 2 + 0.34, 5.0, -14.5);
  baggageSign.rotation.y = Math.PI / 2;
  baggageGroup.add(baggageSign);
  const bagInstruction = createPhysicalSign('BAGS EMERGE HERE  →', 8.8, 1.05, '#d8f5ff', '#2c414e', 'wall');
  bagInstruction.position.set(-tw / 2 + 0.36, 2.25, -21.3);
  bagInstruction.rotation.y = Math.PI / 2;
  baggageGroup.add(bagInstruction);

  const bagProgress = [0.025, 0.118, 0.247, 0.382, 0.515, 0.674, 0.796, 0.905, 0.963];
  // One physical conveyor = one belt speed. Irregular authored progress offsets
  // preserve natural-looking spacing without bags slowly bunching/stacking over time.
  const bagSpeeds = [0.0295, 0.0295, 0.0295, 0.0295, 0.0295, 0.0295, 0.0295, 0.0295, 0.0295];
  const bagPoint = new THREE.Vector3();
  const bagTangent = new THREE.Vector3();
  bagProgress.forEach((progress, index) => {
    const bag = createAirportLuggage(index);
    baggagePath.getPoint(progress, bagPoint);
    baggagePath.getTangent(progress, bagTangent);
    bag.position.set(bagPoint.x, 0.82, bagPoint.z);
    bag.rotation.y = Math.atan2(bagTangent.x, bagTangent.z);
    baggageGroup.add(bag);
    baggageItems.push({ mesh: bag, path: baggagePath, progress, speed: bagSpeeds[index], rideHeight: 0.82, lateralOffset: 0, lateralVelocity: 0 });
  });
  terminal.add(baggageGroup);

  // ---------------------------------------------------------------------
  // KRUSTY AIRSIDE CAFÉ - REAL TAKEAWAY COUNTER / DISPLAY / STAFF SPACE
  // ---------------------------------------------------------------------
  const cafe = new THREE.Group();
  cafe.name = 'airport_terminal_krusty_takeaway_cafe';
  const cafeWallMat = createSurfaceMaterial(0xe7b35b, 'concrete', 0.70, 0.04, 7, 5);
  const cafeTrimMat = createMaterial(0x6b2926, 0.52, 0.24);
  const cafeCounterMat = createMaterial(0x74462d, 0.58, 0.18);
  const cafeSteelMat = createMaterial(0xb8c1c6, 0.28, 0.86);
  const cafeBackZ = -20.2;
  const cafeFrontZ = -7.9;
  const cafeLeftX = 35.0;
  const cafeRightX = 59.0;
  const cafeHeight = 5.7;
  const cafeBack = new THREE.Mesh(new THREE.BoxGeometry(cafeRightX - cafeLeftX, cafeHeight, 0.34), cafeWallMat);
  cafeBack.position.set(47, cafeHeight / 2, cafeBackZ);
  markSolid(cafeBack, 0.005);
  cafe.add(cafeBack);
  for (const x of [cafeLeftX, cafeRightX]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.34, cafeHeight, cafeFrontZ - cafeBackZ), cafeWallMat);
    side.position.set(x, cafeHeight / 2, (cafeBackZ + cafeFrontZ) / 2);
    markSolid(side, 0.005);
    cafe.add(side);
  }
  const cafeCeiling = new THREE.Mesh(new THREE.BoxGeometry(cafeRightX - cafeLeftX, 0.24, cafeFrontZ - cafeBackZ), cafeTrimMat);
  cafeCeiling.position.set(47, cafeHeight, (cafeBackZ + cafeFrontZ) / 2);
  cafe.add(cafeCeiling);
  const cafeCounter = new THREE.Mesh(new THREE.BoxGeometry(20.5, 1.12, 1.25), cafeCounterMat);
  cafeCounter.name = 'airport_cafe_service_counter';
  cafeCounter.position.set(47, 0.58, cafeFrontZ + 0.18);
  markSolid(cafeCounter, 0.008);
  cafe.add(cafeCounter);
  const cafeTop = new THREE.Mesh(new THREE.BoxGeometry(21.0, 0.16, 1.52), createMaterial(0xeee5d3, 0.48, 0.08));
  cafeTop.position.set(47, 1.19, cafeFrontZ + 0.18);
  cafe.add(cafeTop);

  // Food display case on the customer-facing counter.
  const displayX = 41.8;
  const displayBase = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.28, 1.45), cafeSteelMat);
  displayBase.position.set(displayX, 1.40, cafeFrontZ + 0.10);
  cafe.add(displayBase);
  const displayGlassMat = glassMat.clone();
  displayGlassMat.opacity = 0.28;
  displayGlassMat.depthWrite = false;
  const displayFrontGlass = new THREE.Mesh(new THREE.BoxGeometry(8.0, 1.45, 0.07), displayGlassMat);
  displayFrontGlass.position.set(displayX, 2.05, cafeFrontZ + 0.82);
  cafe.add(displayFrontGlass);
  const displayTopGlass = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.07, 1.35), displayGlassMat);
  displayTopGlass.position.set(displayX, 2.78, cafeFrontZ + 0.12);
  cafe.add(displayTopGlass);
  for (const x of [displayX - 3.95, displayX + 3.95]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.45, 1.35), displayGlassMat);
    sideGlass.position.set(x, 2.05, cafeFrontZ + 0.12);
    cafe.add(sideGlass);
  }

  const pastryMat = createMaterial(0xd99a4e, 0.72, 0.02);
  const cookieMat = createMaterial(0xb77838, 0.78, 0.01);
  const sandwichBreadMat = createMaterial(0xe4c68c, 0.76, 0.01);
  for (let i = 0; i < 5; i++) {
    const croissant = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.10, 6, 12, Math.PI * 1.45), pastryMat);
    croissant.rotation.x = Math.PI / 2;
    croissant.rotation.z = 0.25;
    croissant.position.set(displayX - 3.0 + i * 0.72, 1.62, cafeFrontZ + 0.13);
    cafe.add(croissant);
  }
  for (let i = 0; i < 4; i++) {
    const cookie = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.08, 10), cookieMat);
    cookie.rotation.z = Math.PI / 2;
    cookie.position.set(displayX + 0.55 + i * 0.52, 1.64, cafeFrontZ + 0.12);
    cafe.add(cookie);
  }
  for (let i = 0; i < 3; i++) {
    const sandwich = new THREE.Group();
    const breadA = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.10, 0.45), sandwichBreadMat);
    const filling = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.08, 0.41), createMaterial(i === 1 ? 0x8ac267 : 0xc84a3c, 0.74, 0.01));
    const breadB = breadA.clone();
    breadA.position.y = 0.10; filling.position.y = 0.19; breadB.position.y = 0.28;
    sandwich.add(breadA, filling, breadB);
    sandwich.position.set(displayX + 2.35 + i * 0.66, 1.52, cafeFrontZ + 0.12);
    sandwich.rotation.y = (i - 1) * 0.10;
    cafe.add(sandwich);
  }

  // Drinks fridge and stocked bottles/cans.
  const fridge = new THREE.Group();
  fridge.position.set(55.0, 0, -18.55);
  const fridgeBody = new THREE.Mesh(new THREE.BoxGeometry(4.0, 4.4, 1.7), createMaterial(0x43505a, 0.48, 0.58));
  fridgeBody.position.y = 2.2;
  markSolid(fridgeBody, 0.004);
  fridge.add(fridgeBody);
  const fridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.75, 0.06), displayGlassMat);
  fridgeGlass.position.set(0, 2.25, 0.88);
  fridge.add(fridgeGlass);
  const drinkColours = [0x47a9ff, 0xe64c3c, 0x63c66c, 0xf4c542, 0xb4e5ff];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
    const isWater = (row + col) % 5 === 0;
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(isWater ? 0.10 : 0.12, isWater ? 0.13 : 0.14, 0.62, 8),
      new THREE.MeshPhysicalMaterial({
        color: isWater ? 0xa9ddff : drinkColours[(row + col) % drinkColours.length],
        roughness: isWater ? 0.24 : 0.46,
        metalness: 0.04,
        transparent: isWater,
        opacity: isWater ? 0.72 : 1,
      })
    );
    bottle.position.set(-1.25 + col * 0.62, 0.75 + row * 0.95, 0.98);
    fridge.add(bottle);
  }
  // A few shorter cans stop the fridge reading as rows of identical bottles.
  for (let i = 0; i < 4; i++) {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.42, 10),
      createMaterial([0xd83f36, 0x3b77c4, 0xe0b536, 0x4eaf68][i], 0.34, 0.62)
    );
    can.position.set(-0.95 + i * 0.64, 3.63, 0.98);
    fridge.add(can);
  }
  cafe.add(fridge);

  // Coffee machine, grinder, cups, till and condiment shelf.
  const coffeeMachine = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.85, 1.25), cafeSteelMat);
  coffeeMachine.position.set(46.8, 1.32, -19.25);
  markSolid(coffeeMachine, 0.004);
  cafe.add(coffeeMachine);
  for (const x of [45.8, 47.8]) {
    const groupHead = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.46, 10), createMaterial(0x30363a, 0.40, 0.70));
    groupHead.rotation.x = Math.PI / 2;
    groupHead.position.set(x, 1.15, -18.58);
    cafe.add(groupHead);
  }
  const grinder = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.58, 1.2, 12), createMaterial(0x3b4045, 0.42, 0.58));
  grinder.position.set(43.8, 1.05, -19.1);
  cafe.add(grinder);
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.22, 0.78, 10), new THREE.MeshPhysicalMaterial({ color: 0x8b6e4f, transparent: true, opacity: 0.55, roughness: 0.2, side: THREE.DoubleSide }));
  hopper.position.set(43.8, 2.02, -19.1);
  cafe.add(hopper);
  const till = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.52, 0.82), createMaterial(0x343b40, 0.52, 0.32));
  till.position.set(52.2, 1.50, cafeFrontZ + 0.02);
  till.rotation.x = -0.10;
  cafe.add(till);
  for (let i = 0; i < 4; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.42, 10), createMaterial(0xf5efe4, 0.76, 0.01));
    cup.position.set(49.0 + i * 0.38, 1.48, -19.0);
    cafe.add(cup);
  }
  const condimentShelf = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.18, 0.75), cafeTrimMat);
  condimentShelf.position.set(47, 3.55, -19.75);
  cafe.add(condimentShelf);
  for (let i = 0; i < 6; i++) {
    const syrup = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.58, 8), createMaterial([0x9d5d35,0xc79245,0x7f4d2f][i % 3], 0.62, 0.02));
    syrup.position.set(44.7 + i * 0.9, 3.92, -19.5);
    cafe.add(syrup);
  }
  const napkinHolder = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.48, 0.42), cafeSteelMat);
  napkinHolder.position.set(53.8, 1.48, cafeFrontZ + 0.10);
  cafe.add(napkinHolder);

  // Small service details: milk jugs, cup lids and a second shelf. These are simple
  // reusable primitives so they add atmosphere without turning the café into a
  // high-draw-call clutter pile.
  for (let i = 0; i < 3; i++) {
    const milk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.56, 8), createMaterial(0xe9eef0, 0.56, 0.08));
    milk.position.set(51.1 + i * 0.45, 1.51, -19.05);
    cafe.add(milk);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.045, 10), createMaterial(0xf8f8f2, 0.68, 0.01));
    lid.position.set(49.0 + i * 0.34, 1.27, -18.72);
    cafe.add(lid);
  }
  const upperShelf = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.16, 0.68), cafeTrimMat);
  upperShelf.position.set(47, 4.55, -19.74);
  cafe.add(upperShelf);
  for (let i = 0; i < 5; i++) {
    const cupStack = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.10, 0.55, 10), createMaterial(0xf2eadc, 0.72, 0.01));
    cupStack.position.set(44.6 + i * 1.18, 4.90, -19.52);
    cafe.add(cupStack);
  }

  const cafeTitle = createPhysicalSign('KRUSTY AIRSIDE CAFÉ', 18.0, 1.9, '#fff7cf', '#b42e2e', 'wall');
  cafeTitle.position.set(47, 4.85, cafeFrontZ + 0.24);
  cafe.add(cafeTitle);
  const menuA = createPhysicalSign('COFFEE • TEA • COLD DRINKS', 9.4, 1.25, '#fff4c5', '#293841', 'wall');
  menuA.position.set(42.0, 4.35, cafeBackZ + 0.22);
  cafe.add(menuA);
  const menuB = createPhysicalSign('SANDWICHES • PASTRIES • COOKIES', 10.4, 1.25, '#fff4c5', '#293841', 'wall');
  menuB.position.set(52.7, 4.35, cafeBackZ + 0.22);
  cafe.add(menuB);
  cafe.traverse((obj) => { if (obj instanceof THREE.Mesh && !obj.userData.solidCollider) obj.userData.interiorDetail = true; });
  terminal.add(cafe);

  // Gate seating: efficient repeated benches with generous circulation paths.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.38, 1.0), createMaterial(0x356c87, 0.62, 0.15));
      seat.position.set(-27 + col * 9.0, 0.65, -20 - row * 4.0);
      seat.userData.sittable = true;
      seat.userData.seatName = 'Airport gate seating';
      markSolid(seat, 0.01);
      terminal.add(seat);
    }
  }
  for (let gate = 1; gate <= 6; gate++) {
    const gateSign = createPhysicalSign(`GATE ${gate}`, 7.5, 1.7, '#ffffff', gate % 2 ? '#315a7b' : '#426f4e', 'ceiling');
    gateSign.position.set(-48 + (gate - 1) * 19.2, 6.2, -29.5);
    terminal.add(gateSign);
  }

  // Proper front-of-terminal FIDS. One pooled canvas-backed screen keeps this much
  // cheaper than dozens of DOM/live displays while still presenting readable
  // destination / flight / gate / status rows inspired by worlds already represented
  // by characters in the crossover roster.
  const fids = createFlightInformationBoard();
  fids.position.set(0, 6.75, 23.3);
  terminal.add(fids);
  const arrivals = createPhysicalSign('ARRIVALS  •  BAGGAGE  ←', 21, 1.8, '#ffffff', '#405d70', 'ceiling');
  arrivals.position.set(-39, 6.8, -4.6); terminal.add(arrivals);
  const toilets = createPhysicalSign('TOILETS  ↑', 11, 1.6, '#ffffff', '#405d70', 'wall');
  toilets.position.set(52, 6.3, 13.4); terminal.add(toilets);

  // Ceiling light panels are emissive meshes, not dozens of real lights.
  const ceilingLightMat = new THREE.MeshBasicMaterial({ color: 0xfff7d6, toneMapped: false });
  for (const x of [-48,-24,0,24,48]) for (const z of [-22,-8,8,22]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(8.5,0.05,1.0), ceilingLightMat);
    panel.position.set(x, th - 0.10, z);
    panel.userData.interiorDetail = true;
    terminal.add(panel);
  }

  // Mark small terminal furniture/signage as interior detail so the existing
  // distance-culling system does not render every chair/screen from across the map.
  terminal.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.userData.walkable !== true && obj.userData.solidCollider !== true) {
      obj.userData.interiorDetail = true;
    }
  });

  // Mezzanine + genuinely usable staircase.
  const mezz = new THREE.Mesh(new THREE.BoxGeometry(31, 0.30, 21), concreteMat);
  mezz.position.set(45, 5.0, 5.0);
  markWalkable(mezz, 52);
  terminal.add(mezz);
  const stepCount = 12;
  const stairWidth = 5.6;
  const rise = 5.0 / stepCount;
  const run = 0.72;
  for (let i = 0; i < stepCount; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, rise, run + 0.04), concreteMat);
    const topY = (i + 1) * rise;
    step.position.set(27.5, topY - rise/2, 17 - i * run);
    markWalkableStairSurface(step, 65, 0.75);
    step.userData.interiorDetail = true;
    terminal.add(step);
  }
  const mezzRail = new THREE.Mesh(new THREE.BoxGeometry(31, 1.1, 0.14), terminalDarkMat);
  mezzRail.position.set(45, 5.55, -5.4);
  markSolid(mezzRail, 0.005);
  terminal.add(mezzRail);

  // Airside gates at the runway-facing wall. Open corridors intentionally penetrate
  // the back wall via the authored portals above. The two side gates keep glass jet
  // bridges; the centre route is rebuilt as the clearly readable RUNWAY ACCESS
  // tunnel the player sees from inside the terminal.
  for (const x of [-38, 38]) {
    const bridge = new THREE.Group();
    bridge.name = `airport_gate_jetbridge_${x}`;
    bridge.position.set(x, 3.1, -td/2 - 8.0);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.22, 16), concreteMat);
    floor.position.y = -2.8;
    markWalkable(floor, 28);
    const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4.4, 16), glassMat);
    leftGlass.position.set(-3.45, -0.6, 0); markSolid(leftGlass, 0.003);
    const rightGlass = leftGlass.clone(); rightGlass.position.x = 3.45;
    const roofB = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.20, 16), terminalDarkMat);
    roofB.position.y = 1.6;
    bridge.add(floor, leftGlass, rightGlass, roofB);
    terminal.add(bridge);
  }

  // Detailed centre access tunnel. Collision exists ONLY on the visible floor,
  // side walls/supports and roof. There is intentionally no hidden portal blocker,
  // oversized AABB or invisible wall spanning the open 6.6 m walking/driving path.
  const runwayTunnel = new THREE.Group();
  runwayTunnel.name = 'airport_runway_access_tunnel';
  runwayTunnel.position.set(0, 0, -td/2 - 14.0);
  const tunnelLength = 28;
  const tunnelWidth = 7.4;
  const tunnelFloor = new THREE.Mesh(new THREE.BoxGeometry(tunnelWidth, 0.22, tunnelLength), concreteMat);
  tunnelFloor.position.y = 0.11;
  markWalkable(tunnelFloor, 32);
  runwayTunnel.add(tunnelFloor);

  const lowerWallMat = createSurfaceMaterial(0x65727a, 'concrete', 0.78, 0.08, 5, 18);
  for (const sx of [-1, 1]) {
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.15, tunnelLength), lowerWallMat);
    lower.position.set(sx * (tunnelWidth / 2 - 0.14), 0.70, 0);
    markSolid(lower, 0.003);
    runwayTunnel.add(lower);
    const upperGlass = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.65, tunnelLength), glassMat);
    upperGlass.position.set(sx * (tunnelWidth / 2 - 0.08), 2.55, 0);
    markSolid(upperGlass, 0.002);
    runwayTunnel.add(upperGlass);
  }
  const tunnelRoof = new THREE.Mesh(new THREE.BoxGeometry(tunnelWidth + 0.35, 0.24, tunnelLength), terminalDarkMat);
  tunnelRoof.position.y = 4.05;
  markSolid(tunnelRoof, 0.002);
  runwayTunnel.add(tunnelRoof);

  const ribMat = createMaterial(0x8d9aa3, 0.42, 0.76);
  for (let z = -tunnelLength / 2 + 2.0; z <= tunnelLength / 2 - 2.0; z += 4.0) {
    for (const sx of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.0, 0.22), ribMat);
      rib.position.set(sx * (tunnelWidth / 2 + 0.04), 2.0, z);
      markSolid(rib, 0.002);
      runwayTunnel.add(rib);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(tunnelWidth + 0.35, 0.18, 0.22), ribMat);
    cross.position.set(0, 4.0, z);
    runwayTunnel.add(cross);
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.30), new THREE.MeshBasicMaterial({ color: 0xfff4c7, toneMapped: false }));
    light.position.set(0, 3.88, z);
    runwayTunnel.add(light);
  }
  const tunnelSign = createPhysicalSign('AIRSIDE / RUNWAY ACCESS', 6.4, 1.05, '#ffffff', '#29485f', 'ceiling');
  tunnelSign.position.set(0, 3.0, tunnelLength / 2 - 1.5);
  runwayTunnel.add(tunnelSign);
  terminal.add(runwayTunnel);

  root.add(terminal);

  // -----------------------------------------------------------------------
  // AIRSIDE: APRON, TAXIWAYS, RUNWAY, HANGARS, TOWER
  // -----------------------------------------------------------------------
  const apron = new THREE.Mesh(new THREE.BoxGeometry(1120, 0.17, 180), apronMat);
  apron.name = 'airport_apron_surface';
  apron.position.set(0, 0.055, -580);
  markWalkable(apron, 12);
  markMapArea(apron, 'apron');
  root.add(apron);

  // Terminal stands plus four deliberately EMPTY heavy-aircraft reserve stands. The apron is
  // intentionally much wider than today's fleet so future realistic large aircraft can be
  // added without rebuilding the terminal/runway geometry.
  for (const x of [-120,-60,0,60,120]) {
    const stand = new THREE.Mesh(new THREE.RingGeometry(8, 8.3, 40), yellowMat);
    stand.rotation.x = -Math.PI/2;
    stand.position.set(x, 0.155, -570);
    stand.name = `airport_aircraft_stand_${x}`;
    root.add(stand);
    const lead = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 42), yellowMat);
    lead.position.set(x, 0.16, -542);
    root.add(lead);
  }
  for (const x of [-390, -270, 270, 390]) {
    const reserve = new THREE.Mesh(new THREE.RingGeometry(40.5, 41.0, 64), yellowMat);
    reserve.rotation.x = -Math.PI/2;
    reserve.position.set(x, 0.156, -585);
    reserve.name = `airport_future_widebody_stand_${x}`;
    reserve.userData.futureAircraftExpansion = true;
    reserve.userData.reservedWingspan = 90;
    reserve.userData.reservedLength = 85;
    root.add(reserve);
    const lead = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 86), yellowMat);
    lead.position.set(x, 0.16, -548);
    lead.userData.futureAircraftExpansion = true;
    root.add(lead);

    // Keep the reserve bays visibly intentional while leaving the full aircraft
    // footprint empty. These are sized for future ~90 m wingspan / ~85 m length
    // aircraft, considerably larger than the current procedural jetliner.
    const standLabel = addLabelPlane('HEAVY\nRESERVE', 13.5, 5.0, '#f8d54a', '#555b60');
    standLabel.rotation.x = -Math.PI / 2;
    standLabel.rotation.z = Math.PI;
    standLabel.position.set(x + 18, 0.18, -608);
    standLabel.userData.futureAircraftExpansion = true;
    root.add(standLabel);
  }

  const runway = new THREE.Mesh(new THREE.BoxGeometry(RUNWAY_LENGTH, 0.20, RUNWAY_WIDTH), roadMat);
  runway.name = 'airport_runway_surface';
  runway.position.set(0, 0.06, RUNWAY_Z);
  markWalkable(runway, 18);
  markMapArea(runway, 'runway');
  root.add(runway);
  // Runway centreline / threshold / designation markings.
  for (let x = -490; x <= 490; x += 30) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(10, 0.03, 0.55), whiteMat);
    dash.position.set(x, 0.18, RUNWAY_Z);
    root.add(dash);
  }
  for (const side of [-1,1]) {
    const thresholdX = side * 520;
    for (let z = -16; z <= 16; z += 4.5) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.03, 1.2), whiteMat);
      bar.position.set(thresholdX, 0.18, RUNWAY_Z + z);
      root.add(bar);
    }
    const numbers = addLabelPlane(side < 0 ? '09' : '27', 11, 5.4, '#ffffff', '#30343b');
    numbers.rotation.x = -Math.PI/2;
    numbers.rotation.z = side < 0 ? -Math.PI/2 : Math.PI/2;
    numbers.position.set(side * 478, 0.19, RUNWAY_Z);
    root.add(numbers);
  }

  // Runway edge stripes and aiming points. Real runway markings are white while
  // taxiway guidance is yellow; keeping that visual language makes the airside easy
  // to read even from the third-person aircraft camera.
  for (const dz of [-24.4, 24.4]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(RUNWAY_LENGTH - 20, 0.028, 0.42), whiteMat);
    edge.position.set(0, 0.182, RUNWAY_Z + dz);
    root.add(edge);
  }
  for (const side of [-1, 1]) {
    const aimX = side * 390;
    for (const dz of [-7.0, 7.0]) {
      const aim = new THREE.Mesh(new THREE.BoxGeometry(13.0, 0.03, 2.6), whiteMat);
      aim.position.set(aimX, 0.183, RUNWAY_Z + dz);
      root.add(aim);
    }
  }

  // Parallel taxiway and curved-feeling connector segments.
  const taxiMain = new THREE.Mesh(new THREE.BoxGeometry(1050, 0.17, 24), apronMat);
  taxiMain.name = 'airport_taxiway_alpha';
  taxiMain.position.set(0, 0.055, -650);
  markWalkable(taxiMain, 14); markMapArea(taxiMain, 'taxiway'); root.add(taxiMain);
  const taxiLine = new THREE.Mesh(new THREE.BoxGeometry(1038, 0.025, 0.28), yellowMat);
  taxiLine.position.set(0, 0.16, -650); root.add(taxiLine);
  for (const x of [-500, -250, 0, 250, 500]) {
    addRoadRibbon(root, `airport_taxi_connector_${x}`, [[x,-620],[x,-635],[x + (x === 0 ? 0 : Math.sign(x)*8),-658],[x + (x === 0 ? 0 : Math.sign(x)*13),-694]], 20, apronMat, yellowMat, false, false)
      .traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.userData.mapRoadSurface === true) {
          delete obj.userData.mapRoadSurface;
          obj.userData.permanentRoadGeometry = false;
          obj.userData.walkable = true;
          obj.userData.walkablePriority = 14;
          obj.userData.mapAreaKind = 'taxiway';
        }
      });
  }
  for (const x of [-500, -250, 0, 250, 500]) {
    for (const offset of [-1.1, 1.1]) {
      const hold = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.03, 0.30), yellowMat);
      hold.position.set(x, 0.19, -692 + offset);
      root.add(hold);
    }
  }

  // Runway/taxiway edge lights are emissive-looking meshes rather than real point
  // lights, and each family is instanced into ONE draw call. This matters when the
  // player is flying and the full airfield can be visible at once.
  const runwayLightPositions: Array<[number, number, number]> = [];
  for (let x = -545; x <= 545; x += 12) {
    for (const dz of [-26.6, 26.6]) runwayLightPositions.push([x, 0.26, RUNWAY_Z + dz]);
  }
  const runwayLights = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.13, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xf7f7df, toneMapped: false }),
    runwayLightPositions.length
  );
  const lightMatrix = new THREE.Matrix4();
  runwayLightPositions.forEach(([x,y,z], index) => {
    lightMatrix.makeTranslation(x,y,z);
    runwayLights.setMatrixAt(index, lightMatrix);
  });
  runwayLights.instanceMatrix.needsUpdate = true;
  runwayLights.name = 'airport_runway_edge_lights';
  runwayLights.castShadow = false;
  root.add(runwayLights);

  const taxiLightPositions: Array<[number, number, number]> = [];
  for (let x = -515; x <= 515; x += 16) {
    for (const dz of [-11.4, 11.4]) taxiLightPositions.push([x, 0.25, -650 + dz]);
  }
  const taxiLights = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.11, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0x39a9ff, toneMapped: false }),
    taxiLightPositions.length
  );
  taxiLightPositions.forEach(([x,y,z], index) => {
    lightMatrix.makeTranslation(x,y,z);
    taxiLights.setMatrixAt(index, lightMatrix);
  });
  taxiLights.instanceMatrix.needsUpdate = true;
  taxiLights.name = 'airport_taxiway_edge_lights';
  taxiLights.castShadow = false;
  root.add(taxiLights);

  // Control tower: tapered shaft + substantial glazed cab.
  const tower = new THREE.Group();
  tower.name = 'airport_control_tower';
  tower.position.set(185, 0, -488);
  const towerBase = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 17), terminalWallMat);
  towerBase.position.y = 3; markSolid(towerBase); tower.add(towerBase);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 7.2, 28, 10), concreteMat);
  shaft.position.y = 18; markSolid(shaft, 0.01); tower.add(shaft);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(10.0, 8.5, 5.0, 10), glassMat);
  cab.position.y = 34.5; markSolid(cab, 0.005); tower.add(cab);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(10.5,10.5,0.7,10), terminalDarkMat);
  cap.position.y = 37.3; tower.add(cap);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35,8,6), new THREE.MeshBasicMaterial({color:0xff3838,toneMapped:false}));
  beacon.position.y = 38.2; tower.add(beacon);
  root.add(tower);

  // Large open-mouthed hangars are positioned beyond the clear terminal stands. The
  // western building is deliberately wide-body sized to protect future expansion room.
  for (const spec of [
    {x:-555,z:-585,name:'Widebody Maintenance Hangar',w:132,d:96,h:22},
    {x:555,z:-580,name:'General Aviation Hangar',w:96,d:72,h:16},
  ]) {
    const hangar = new THREE.Group(); hangar.name = 'airport_hangar'; hangar.position.set(spec.x,0,spec.z);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(spec.w,0.20,spec.d), concreteMat); floor.position.y=0.08; markWalkable(floor,16); hangar.add(floor);
    const back = new THREE.Mesh(new THREE.BoxGeometry(spec.w,spec.h,0.45), terminalWallMat); back.position.set(0,spec.h/2,-spec.d/2); markSolid(back); hangar.add(back);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.45,spec.h,spec.d), terminalWallMat); sideL.position.set(-spec.w/2,spec.h/2,0); markSolid(sideL); hangar.add(sideL);
    const sideR = sideL.clone(); sideR.position.x=spec.w/2; hangar.add(sideR);
    const roofH = new THREE.Mesh(new THREE.BoxGeometry(spec.w+2,0.5,spec.d+2), terminalDarkMat); roofH.position.y=spec.h+0.1; hangar.add(roofH);
    const nameSign = createPhysicalSign(spec.name.toUpperCase(), Math.min(46,spec.w*0.58),2.6,'#ffffff','#405d70','wall'); nameSign.position.set(0,spec.h-2.8,spec.d/2+0.1); hangar.add(nameSign);
    root.add(hangar);
  }

  // Airside service roads are visually narrower/lighter and are intentionally NOT public traffic routes.
  const serviceRoad = new THREE.Mesh(new THREE.BoxGeometry(1080,0.12,7.5), createSurfaceMaterial(0x4a4e50,'asphalt',0.94,0.01,26,5));
  serviceRoad.name='airport_airside_service_road'; serviceRoad.position.set(0,0.11,-620); markWalkable(serviceRoad,8); markMapArea(serviceRoad,'paved'); root.add(serviceRoad);

  // Visible perimeter fence around the airside. Player-reachable apron/public
  // sections use the SAME shared fence destructible physics as Springfield; the
  // remote runway-end fence remains static for performance. Side runs are split so
  // only the apron-facing portion is dynamic rather than waking a kilometre of fence.
  root.add(
    createFenceSegment(225, 0, -635, -757.5),
    createFenceSegment(225, 0, 635, -757.5),
    createFenceSegment(1270, Math.PI/2, 0, -870),
  );
  createInteractiveFenceRun(root, 140, 0, -635, -575, 'west_apron_side', destructibles, 12.0);
  createInteractiveFenceRun(root, 140, 0, 635, -575, 'east_apron_side', destructibles, 12.0);
  createInteractiveFenceRun(root, 571, Math.PI/2, -349.5, -525, 'west_public_boundary', destructibles, 12.0);
  createInteractiveFenceRun(root, 571, Math.PI/2, 349.5, -525, 'east_public_boundary', destructibles, 12.0);

  // Ground service cones use the global lightweight-prop lifecycle: kick/car/NPC
  // impacts, gravity, world collision, sleep and re-kick all come from
  // WorldInteractionManager rather than an airport-specific physics loop.
  for (let i = 0; i < 18; i++) {
    const coneRoot = new THREE.Group();
    coneRoot.name = `airport_kickable_cone_${i}`;
    coneRoot.position.set(-150 + (i % 9) * 9.0, 0, -530 - Math.floor(i / 9) * 7.0);
    coneRoot.userData.colliderPadding = 0.01;
    const orange = createMaterial(0xf47b20, 0.72, 0.02);
    const white = createMaterial(0xf6f1df, 0.60, 0.03);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.68, 8), orange);
    cone.position.y = 0.38;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.205, 0.11, 8), white);
    stripe.position.y = 0.29;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.62), orange);
    base.position.y = 0.035;
    coneRoot.add(base, cone, stripe);
    root.add(coneRoot);
    destructibles.push({
      id: `airport_cone_${i}`,
      mesh: coneRoot,
      type: 'cone',
      position: { x: coneRoot.position.x, y: 0, z: coneRoot.position.z },
      destroyed: false,
    });
  }

  // Tarmac baggage dollies use the SAME shared movable-prop system as fences,
  // poles, cones and mailboxes. Cars and aircraft can therefore push/launch the
  // whole loaded cart out of the way while one live collider follows the cart.
  // They remain asleep until hit, so four baggage carriers do not add permanent
  // active rigid-body cost to the airport.
  ([[-145,-548],[145,-548],[-85,-605],[90,-605]] as const).forEach(([x, z], index) => {
    const cart = createAirportBaggageTrolley(index);
    cart.position.set(x, 0, z);
    cart.userData.colliderPadding = 0.015;
    cart.userData.airportBaggageCarrier = true;
    root.add(cart);
    destructibles.push({
      id: `airport_baggage_cart_${index}`,
      mesh: cart,
      type: 'baggage_cart',
      position: { x, y: 0, z },
      destroyed: false,
    });
  });

  // -----------------------------------------------------------------------
  // PARKED, FLYABLE AIRCRAFT - VISUALLY DIFFERENT SILHOUETTES
  // -----------------------------------------------------------------------
  aircraft.push(
    airportAircraft('airport_trainer_1','Goldenrod Flying Club Trainer','trainer',-125,-568,Math.PI),
    airportAircraft('airport_commuter_1','Johto Connect Commuter','commuter',-62,-571,Math.PI),
    airportAircraft('airport_jetliner_1','Springfield Air Jetliner','jetliner',26,-572,Math.PI),
    airportAircraft('airport_zacks_plane',"Zack's Red Biplane",'zacks_plane',112,-568,Math.PI),
    airportAircraft('airport_trainer_2','Airport Flight School Trainer','trainer',420,-535,Math.PI),
  );
  aircraft.forEach((plane) => root.add(plane.mesh));

  // -----------------------------------------------------------------------
  // AIRPORT POPULATION SPAWNS - PASSENGERS STAY TERMINAL/LANDSIDE;
  // ONLY GROUND CREW RECEIVE AIRSIDE BOUNDS, AND NEVER THE RUNWAY/TAXIWAY.
  // -----------------------------------------------------------------------
  const travellerSpawns = [
    [-44,-468],[-30,-476],[-17,-465],[5,-474],[18,-482],[34,-470],[48,-484],[-12,-506],[20,-508],[-50,-507],
  ];
  travellerSpawns.forEach(([x,z],i) => npcSpawns.push({
    id:`airport_traveller_${i}`, name:i%3===0?'Airport Traveller':'Passenger', x,z,
    minX:-55,maxX:55,minZ:-515,maxZ:-462,variant:60+i,role:'traveller',stationary:i===2||i===7,
  }));
  const staffSpawns = [[-35,-476],[0,-478],[39,-476],[25,-501]];
  staffSpawns.forEach(([x,z],i)=>npcSpawns.push({
    id:`airport_staff_${i}`, name:i===0?'Check-in Agent':i===1?'Security Officer':'Airport Staff',x,z,
    minX:-52,maxX:52,minZ:-512,maxZ:-465,variant:80+i,role:'staff',stationary:i<2,
  }));
  npcSpawns.push({
    id:'airport_cafe_worker', name:'Krusty Café Worker', x:52.2, z:terminal.position.z - 9.55,
    // Register is at local X=52.2 on the service counter. Keep the worker directly
    // behind it, inside the staff side of the counter and away from the customer gap.
    minX:51.3,maxX:53.1,minZ:terminal.position.z - 10.35,maxZ:terminal.position.z - 8.85,
    variant:88,role:'staff',stationary:true,
  });
  const crewSpawns = [[-150,-545],[-95,-548],[95,-548],[150,-545],[-350,-548],[350,-548]];
  crewSpawns.forEach(([x,z],i)=>npcSpawns.push({
    id:`airport_ground_crew_${i}`, name:'Ground Crew',x,z,minX:x-10,maxX:x+10,minZ:-555,maxZ:-532,variant:95+i,role:'ground_crew',stationary:false,
  }));

  // Map landmarks / safe fast-travel points.
  landmarks.push(
    {
      id:'springfield_regional_airport', name:'Springfield Regional Airport', category:'airport',
      x:0,z:-490,icon:'plane',color:'#38bdf8',travelX:0,travelZ:-425,travelYaw:Math.PI,
    },
    {
      id:'airport_terminal', name:'Airport Terminal', category:'airport',
      x:0,z:-490,icon:'terminal',color:'#facc15',travelX:0,travelZ:-451,travelYaw:Math.PI,
    },
    {
      id:'airport_control_tower', name:'Airport Control Tower', category:'airport',
      x:185,z:-488,icon:'tower',color:'#fb7185',travelX:166,travelZ:-468,travelYaw:Math.atan2(19,-20),
    },
    {
      id:'airport_runway', name:'Runway 09/27', category:'airport',
      x:0,z:RUNWAY_Z,icon:'runway',color:'#e2e8f0',travelX:0,travelZ:-665,travelYaw:Math.PI,
    },
  );

  // Invisible-to-render map bounds anchors keep the complete airport playable
  // footprint inside the TAB map without drawing the old enormous green airport
  // rectangle. They influence scale only, never collision or visibility.
  for (const [x, z] of [[-665,-890],[665,-890],[-665,-165],[665,-165]] as const) {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, 0, z);
    anchor.userData.mapBoundsAnchor = true;
    root.add(anchor);
  }

  // Give large static surfaces/maps deterministic names and critical render flags.
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && (obj.userData.mapRoadSurface || obj.userData.mapAreaKind)) {
      obj.userData.roadCriticalDetail = true;
      obj.frustumCulled = true;
      obj.receiveShadow = true;
    }
  });

  return {
    group:root, doors, wallColliders, landmarks, aircraft, npcSpawns, baggageItems,
    baggageCarousel: {
      group: baggageGroup,
      path: baggagePath,
      beltWidth: 4.72,
      topY: 0.78,
      progressPerSecond: 0.0295,
      markerMesh: beltMarkers,
      markerProgress: beltMarkerProgress,
    },
    destructibles,
    parkingBays,
    terminalCenter:new THREE.Vector3(0,0,-490),
    runwayCenter:new THREE.Vector3(0,0,RUNWAY_Z), runwayHeading:Math.PI/2,
    bounds:{minX:-670,maxX:670,minZ:-900,maxZ:-165},
  };
}
