import * as THREE from 'three';
import { PokemonCharacterId } from '../types';

// Shared cartoon materials helper
export const createMaterial = (color: number, roughness = 0.56, metalness = 0.04) => {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    // Smooth shading is a major visual-quality win on the deliberately economical
    // procedural geometry used throughout the game. Silhouettes remain stylised,
    // but curved characters/props no longer read as faceted Roblox primitives.
    flatShading: false,
    envMapIntensity: metalness > 0.35 ? 1.0 : 0.58,
  });
};

// Permanent sidewalks deliberately use an unlit, non-tone-mapped solid material.
// The earlier 'stable' MeshStandardMaterial still became almost white under the
// game's strong sun/ambient lighting, even though its texture/LOD path had been
// removed. MeshBasicMaterial makes the authored pavement colour the final visible
// colour at every camera distance: no light blow-out, mipmaps, shader LOD, texture
// streaming or fog tint can turn a medium-grey footpath white as the player approaches.
// This is also cheaper than a lit material, which is useful because sidewalks cover
// large portions of both cities.
export const createStableSidewalkMaterial = (color = 0x737d82, _roughness = 0.9, _metalness = 0.01) => {
  const material = new THREE.MeshBasicMaterial({
    color,
    fog: false,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    // Sidewalks sit beside/over several legacy frontage slabs. Pull the authored
    // pedestrian surface slightly toward the camera in depth-buffer space so the
    // visible sidewalk always wins without physically floating above the kerb.
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  });
  material.toneMapped = false;
  material.name = `stable_sidewalk_${color.toString(16)}`;
  material.userData = { distanceStableSidewalk: true };
  return material;
};

/** Performance-conscious architectural glazing used by both cities. It keeps the
 * colourful blue tint but gains proper Fresnel/reflection/transmission response
 * from the world's shared environment map instead of looking like a flat cyan card. */
export const createGlassMaterial = (
  tint = 0x9eddf6,
  opacity = 0.46,
  transmission = 0.18
) => new THREE.MeshPhysicalMaterial({
  color: tint,
  roughness: 0.12,
  metalness: 0.0,
  transparent: true,
  opacity,
  transmission,
  thickness: 0.06,
  ior: 1.45,
  clearcoat: 0.35,
  clearcoatRoughness: 0.10,
  envMapIntensity: 1.15,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

// -----------------------------------------------------------------------------
// SHARED WORLD-SURFACE MATERIALS
// -----------------------------------------------------------------------------
// The map is intentionally stylised, but large single-colour planes made roads,
// concrete, lawns and walls read like grey/green cardboard. These tiny procedural
// textures are generated once in memory, reused across the whole game, and avoid
// external image assets or large texture downloads. They are subtle on purpose: the
// goal is material identity and scale, not photorealistic noise.
export type WorldSurfaceKind =
  | 'asphalt'
  | 'concrete'
  | 'brick'
  | 'grass'
  | 'wood'
  | 'roof'
  | 'tile'
  | 'carpet'
  | 'metal';

const worldTextureCache = new Map<string, THREE.CanvasTexture>();

function seededNoise(x: number, y: number, seed = 17) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

function makeWorldTexture(kind: WorldSurfaceKind, repeatX: number, repeatY: number) {
  const key = `${kind}:${repeatX.toFixed(2)}:${repeatY.toFixed(2)}`;
  const cached = worldTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const texture = new THREE.CanvasTexture(canvas);
    worldTextureCache.set(key, texture);
    return texture;
  }

  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, 128, 128);

  const speckle = (count: number, min = 145, max = 235, alpha = 0.16, size = 1.2) => {
    for (let i = 0; i < count; i++) {
      const x = seededNoise(i, 1, kind.length) * 128;
      const y = seededNoise(i, 2, kind.length + 9) * 128;
      const v = Math.round(min + seededNoise(i, 3, kind.length + 21) * (max - min));
      ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
      const s = Math.max(0.45, size * (0.55 + seededNoise(i, 4, 11) * 0.9));
      ctx.fillRect(x, y, s, s);
    }
  };

  if (kind === 'asphalt') {
    ctx.fillStyle = '#8c8f92'; ctx.fillRect(0, 0, 128, 128);
    speckle(720, 75, 225, 0.20, 1.15);
    ctx.strokeStyle = 'rgba(65,65,65,0.16)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const y = 22 + i * 29;
      ctx.moveTo(-8, y + seededNoise(i, 9) * 8);
      for (let x = 0; x <= 136; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.09 + i) * 2.2);
      ctx.stroke();
    }
  } else if (kind === 'concrete') {
    ctx.fillStyle = '#d6d3cb'; ctx.fillRect(0, 0, 128, 128);
    speckle(420, 120, 245, 0.13, 1.0);
    ctx.strokeStyle = 'rgba(95,90,82,0.11)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 128); ctx.moveTo(0, 64); ctx.lineTo(128, 64); ctx.stroke();
  } else if (kind === 'brick') {
    ctx.fillStyle = '#b9a7a0'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(70,58,52,0.28)'; ctx.lineWidth = 2;
    for (let y = 0; y <= 128; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
      const offset = (Math.floor(y / 16) % 2) * 16;
      for (let x = -offset; x <= 128; x += 32) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 16); ctx.stroke(); }
    }
    speckle(220, 120, 235, 0.10, 1.0);
  } else if (kind === 'grass') {
    ctx.fillStyle = '#b7c5a8'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 520; i++) {
      const x = seededNoise(i, 11, 8) * 128;
      const y = seededNoise(i, 12, 19) * 128;
      const v = 120 + Math.round(seededNoise(i, 13, 29) * 95);
      ctx.strokeStyle = `rgba(${Math.max(70,v-55)},${v},${Math.max(55,v-70)},0.24)`;
      ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x + (seededNoise(i,14)-0.5)*1.6, y - 2.5); ctx.stroke();
    }
  } else if (kind === 'wood') {
    ctx.fillStyle = '#c8aa85'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(85,52,30,0.24)';
    for (let y = 8; y < 128; y += 14) {
      ctx.beginPath();
      for (let x = 0; x <= 128; x += 8) {
        const yy = y + Math.sin(x * 0.10 + y) * 1.4;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(65,42,25,0.10)';
    for (let x = 0; x < 128; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
  } else if (kind === 'roof') {
    ctx.fillStyle = '#b9b9b9'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(55,55,55,0.24)'; ctx.lineWidth = 1.2;
    for (let y = 0; y <= 128; y += 12) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
      for (let x = (Math.floor(y/12)%2)*10; x < 128; x += 20) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(128,y+12)); ctx.stroke(); }
    }
  } else if (kind === 'tile') {
    ctx.fillStyle = '#eeeeea'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(90,100,110,0.18)'; ctx.lineWidth = 1;
    for (let x = 0; x <= 128; x += 16) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,128); ctx.stroke(); }
    for (let y = 0; y <= 128; y += 16) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(128,y); ctx.stroke(); }
  } else if (kind === 'carpet') {
    ctx.fillStyle = '#b7b2b0'; ctx.fillRect(0,0,128,128); speckle(760, 110, 235, 0.12, 0.8);
  } else {
    ctx.fillStyle = '#c7ccd0'; ctx.fillRect(0,0,128,128);
    const g = ctx.createLinearGradient(0,0,128,128); g.addColorStop(0,'rgba(255,255,255,0.16)'); g.addColorStop(0.5,'rgba(255,255,255,0)'); g.addColorStop(1,'rgba(40,50,60,0.12)');
    ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(0.25, repeatX), Math.max(0.25, repeatY));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  worldTextureCache.set(key, texture);
  return texture;
}

const worldDetailTextureCache = new Map<string, THREE.CanvasTexture>();

function makeWorldDetailTexture(
  kind: WorldSurfaceKind,
  repeatX: number,
  repeatY: number,
  channel: 'roughness' | 'bump'
) {
  const key = `${channel}:${kind}:${repeatX.toFixed(2)}:${repeatY.toFixed(2)}`;
  const cached = worldDetailTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    worldDetailTextureCache.set(key, fallback);
    return fallback;
  }

  const baseByKind: Record<WorldSurfaceKind, [number, number]> = {
    asphalt: [228, 126],
    concrete: [216, 128],
    brick: [232, 126],
    grass: [242, 126],
    wood: [205, 128],
    roof: [232, 126],
    tile: [178, 130],
    carpet: [244, 126],
    metal: [112, 128],
  };
  const [roughBase, bumpBase] = baseByKind[kind];
  const base = channel === 'roughness' ? roughBase : bumpBase;
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, 128, 128);

  const noiseCount = kind === 'asphalt' || kind === 'grass' || kind === 'carpet' ? 1300 : 600;
  for (let i = 0; i < noiseCount; i++) {
    const x = seededNoise(i, 31, kind.length + (channel === 'bump' ? 9 : 0)) * 128;
    const y = seededNoise(i, 32, kind.length + 13) * 128;
    const n = (seededNoise(i, 33, kind.length + 27) - 0.5);
    const spread = channel === 'roughness' ? 34 : 30;
    const value = Math.max(25, Math.min(250, Math.round(base + n * spread)));
    const alpha = kind === 'metal' ? 0.10 : 0.22;
    ctx.fillStyle = `rgba(${value},${value},${value},${alpha})`;
    const size = kind === 'grass' ? 1.4 : kind === 'asphalt' ? 1.0 : 0.8;
    ctx.fillRect(x, y, size, size);
  }

  // Macro surface structure: mortar, slab joints, timber grain and roof courses.
  if (kind === 'concrete' || kind === 'tile') {
    ctx.strokeStyle = channel === 'roughness' ? 'rgba(150,150,150,0.28)' : 'rgba(95,95,95,0.28)';
    ctx.lineWidth = channel === 'bump' ? 2.0 : 1.0;
    const step = kind === 'tile' ? 16 : 64;
    for (let x = step; x < 128; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
    for (let y = step; y < 128; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
  } else if (kind === 'brick') {
    ctx.strokeStyle = channel === 'roughness' ? 'rgba(245,245,245,0.34)' : 'rgba(82,82,82,0.40)';
    ctx.lineWidth = 2;
    for (let y = 0; y <= 128; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
      const offset = (Math.floor(y / 16) % 2) * 16;
      for (let x = -offset; x <= 128; x += 32) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(128, y + 16)); ctx.stroke(); }
    }
  } else if (kind === 'wood') {
    ctx.strokeStyle = channel === 'roughness' ? 'rgba(170,170,170,0.24)' : 'rgba(95,95,95,0.32)';
    for (let y = 7; y < 128; y += 13) {
      ctx.beginPath();
      for (let x = 0; x <= 128; x += 6) {
        const yy = y + Math.sin(x * 0.11 + y * 0.07) * 1.6;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (kind === 'roof') {
    ctx.strokeStyle = channel === 'roughness' ? 'rgba(185,185,185,0.25)' : 'rgba(88,88,88,0.34)';
    for (let y = 0; y <= 128; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
  } else if (kind === 'asphalt' && channel === 'bump') {
    ctx.strokeStyle = 'rgba(105,105,105,0.18)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const y = 24 + i * 33;
      ctx.beginPath(); ctx.moveTo(-8, y);
      for (let x = 0; x <= 136; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.08 + i) * 1.7);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(0.25, repeatX), Math.max(0.25, repeatY));
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  worldDetailTextureCache.set(key, texture);
  return texture;
}

export function createSurfaceMaterial(
  color: number,
  kind: WorldSurfaceKind,
  roughness = 0.82,
  metalness = 0.03,
  repeatX = 4,
  repeatY = 4
) {
  const bumpScaleByKind: Record<WorldSurfaceKind, number> = {
    asphalt: 0.032,
    concrete: 0.025,
    brick: 0.065,
    grass: 0.055,
    wood: 0.045,
    roof: 0.055,
    tile: 0.022,
    carpet: 0.018,
    metal: 0.012,
  };
  const material = new THREE.MeshStandardMaterial({
    color,
    map: makeWorldTexture(kind, repeatX, repeatY),
    roughnessMap: makeWorldDetailTexture(kind, repeatX, repeatY, 'roughness'),
    bumpMap: makeWorldDetailTexture(kind, repeatX, repeatY, 'bump'),
    bumpScale: bumpScaleByKind[kind],
    roughness,
    metalness,
    flatShading: false,
    envMapIntensity: kind === 'metal' ? 1.05 : kind === 'asphalt' ? 0.42 : 0.58,
  });
  // Preserve semantic surface type on the material. Collision authoring can then
  // recognise every roof that already uses the shared roof material without
  // relying on fragile variable names or giant hand-written collision boxes.
  material.userData.worldSurfaceKind = kind;
  return material;
}

// ----------------------------------------------------
// 1. POKEMON 3D MODELS
// ----------------------------------------------------
export function createPikachuModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'pikachu_root';

  const yellowMat = createMaterial(0xfad61d);
  const darkBrownMat = createMaterial(0x5c3317);
  const redMat = createMaterial(0xe82c2c);
  const blackMat = createMaterial(0x1a1a1a);
  const whiteMat = createMaterial(0xffffff);

  // Chubby body
  const bodyGeo = new THREE.SphereGeometry(0.7, 8, 8);
  bodyGeo.scale(1, 1.15, 0.9);
  const body = new THREE.Mesh(bodyGeo, yellowMat);
  body.position.y = 0.9;
  body.castShadow = true;
  root.add(body);

  // Big derpy eyes
  const eyeGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const eyeL = new THREE.Mesh(eyeGeo, blackMat);
  eyeL.position.set(-0.28, 1.05, 0.56);
  const eyeR = new THREE.Mesh(eyeGeo, blackMat);
  eyeR.position.set(0.28, 1.05, 0.56);
  root.add(eyeL, eyeR);

  // White eye highlights
  const pupilGeo = new THREE.SphereGeometry(0.04, 5, 5);
  const pupilL = new THREE.Mesh(pupilGeo, whiteMat);
  pupilL.position.set(-0.25, 1.08, 0.64);
  const pupilR = new THREE.Mesh(pupilGeo, whiteMat);
  pupilR.position.set(0.25, 1.08, 0.64);
  root.add(pupilL, pupilR);

  // Red Cheek pouches
  const cheekGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.05, 8);
  cheekGeo.rotateX(Math.PI / 2);
  const cheekL = new THREE.Mesh(cheekGeo, redMat);
  cheekL.position.set(-0.48, 0.9, 0.45);
  const cheekR = new THREE.Mesh(cheekGeo, redMat);
  cheekR.position.set(0.48, 0.9, 0.45);
  root.add(cheekL, cheekR);

  // Nose & mouth
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.05, 4), blackMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.98, 0.63);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 4, 8, Math.PI), redMat);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, 0.86, 0.61);
  root.add(nose, mouth);

  // Pointy Ears with black tips
  const earLGroup = new THREE.Group();
  earLGroup.position.set(-0.35, 1.6, 0);
  earLGroup.rotation.z = 0.35;
  earLGroup.rotation.x = -0.15;
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 6), yellowMat);
  earL.position.y = 0.35;
  const earTipL = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 6), blackMat);
  earTipL.position.y = 0.58;
  earLGroup.add(earL, earTipL);

  const earRGroup = new THREE.Group();
  earRGroup.position.set(0.35, 1.6, 0);
  earRGroup.rotation.z = -0.35;
  earRGroup.rotation.x = -0.15;
  const earR = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7, 6), yellowMat);
  earR.position.y = 0.35;
  const earTipR = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 6), blackMat);
  earTipR.position.y = 0.58;
  earRGroup.add(earR, earTipR);
  root.add(earLGroup, earRGroup);

  // Back stripes
  const stripeGeo = new THREE.BoxGeometry(0.7, 0.08, 0.1);
  const stripe1 = new THREE.Mesh(stripeGeo, darkBrownMat);
  stripe1.position.set(0, 1.1, -0.6);
  const stripe2 = new THREE.Mesh(stripeGeo, darkBrownMat);
  stripe2.position.set(0, 0.9, -0.62);
  root.add(stripe1, stripe2);

  // Zig-Zag Lightning Tail
  const tailGroup = new THREE.Group();
  tailGroup.name = 'tail';
  tailGroup.position.set(0, 0.6, -0.55);
  const tSeg1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.05), darkBrownMat);
  tSeg1.position.set(0, 0.15, -0.1);
  tSeg1.rotation.x = -0.5;
  const tSeg2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.05), yellowMat);
  tSeg2.position.set(0.08, 0.4, -0.22);
  tSeg2.rotation.z = -0.4;
  const tSeg3 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.06), yellowMat);
  tSeg3.position.set(0.14, 0.72, -0.26);
  tSeg3.rotation.z = 0.3;
  tailGroup.add(tSeg1, tSeg2, tSeg3);
  root.add(tailGroup);

  // Limbs
  const limbGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.35, 6);
  const footL = new THREE.Mesh(limbGeo, yellowMat);
  footL.name = 'leg_left';
  footL.position.set(-0.3, 0.18, 0.05);
  const footR = new THREE.Mesh(limbGeo, yellowMat);
  footR.name = 'leg_right';
  footR.position.set(0.3, 0.18, 0.05);

  const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.35, 6);
  const armL = new THREE.Mesh(armGeo, yellowMat);
  armL.name = 'arm_left';
  armL.position.set(-0.55, 0.85, 0.25);
  armL.rotation.z = 0.5;
  armL.rotation.x = 0.4;
  const armR = new THREE.Mesh(armGeo, yellowMat);
  armR.name = 'arm_right';
  armR.position.set(0.55, 0.85, 0.25);
  armR.rotation.z = -0.5;
  armR.rotation.x = 0.4;
  root.add(footL, footR, armL, armR);

  return root;
}

export function createCharmanderModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'charmander_root';

  const orangeMat = createMaterial(0xf76a14);
  const creamMat = createMaterial(0xfff0b3);
  const redMat = createMaterial(0xd42626);
  const flameYellowMat = createMaterial(0xffe600);
  const blackMat = createMaterial(0x1a1a1a);
  const whiteMat = createMaterial(0xffffff);

  // Body
  const bodyGeo = new THREE.SphereGeometry(0.65, 8, 8);
  bodyGeo.scale(1, 1.25, 0.95);
  const body = new THREE.Mesh(bodyGeo, orangeMat);
  body.position.y = 0.95;
  body.castShadow = true;
  root.add(body);

  // Cream belly
  const bellyGeo = new THREE.SphereGeometry(0.5, 8, 8);
  bellyGeo.scale(0.85, 1.1, 0.4);
  const belly = new THREE.Mesh(bellyGeo, creamMat);
  belly.position.set(0, 0.9, 0.48);
  root.add(belly);

  // Head
  const headGeo = new THREE.SphereGeometry(0.6, 8, 8);
  headGeo.scale(1.1, 0.95, 1.05);
  const head = new THREE.Mesh(headGeo, orangeMat);
  head.position.set(0, 1.6, 0.1);
  root.add(head);

  // Big eyes
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), whiteMat);
  eyeL.position.set(-0.3, 1.68, 0.58);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), whiteMat);
  eyeR.position.set(0.3, 1.68, 0.58);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 5), blackMat);
  pupilL.position.set(-0.3, 1.68, 0.68);
  const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 5), blackMat);
  pupilR.position.set(0.3, 1.68, 0.68);
  root.add(eyeL, eyeR, pupilL, pupilR);

  // Nostrils
  const nostrilL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), blackMat);
  nostrilL.position.set(-0.08, 1.55, 0.72);
  const nostrilR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), blackMat);
  nostrilR.position.set(0.08, 1.55, 0.72);
  root.add(nostrilL, nostrilR);

  // Tail with flame
  const tailGroup = new THREE.Group();
  tailGroup.name = 'tail';
  tailGroup.position.set(0, 0.55, -0.6);
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.8, 6), orangeMat);
  tailMesh.position.set(0, 0.35, -0.25);
  tailMesh.rotation.x = -1.1;
  tailGroup.add(tailMesh);

  // Animated tail flame
  const flameGroup = new THREE.Group();
  flameGroup.name = 'flame';
  flameGroup.position.set(0, 0.7, -0.55);
  const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 6), flameYellowMat);
  flameCore.rotation.x = 0.5;
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 6), redMat);
  flameOuter.rotation.x = 0.5;
  flameOuter.position.z = -0.05;
  flameGroup.add(flameOuter, flameCore);
  tailGroup.add(flameGroup);
  root.add(tailGroup);

  // Limbs
  const legGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.45, 6);
  const footL = new THREE.Mesh(legGeo, orangeMat);
  footL.name = 'leg_left';
  footL.position.set(-0.35, 0.22, 0.05);
  const footR = new THREE.Mesh(legGeo, orangeMat);
  footR.name = 'leg_right';
  footR.position.set(0.35, 0.22, 0.05);

  const armGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.38, 6);
  const armL = new THREE.Mesh(armGeo, orangeMat);
  armL.name = 'arm_left';
  armL.position.set(-0.55, 1.05, 0.2);
  armL.rotation.z = 0.6;
  const armR = new THREE.Mesh(armGeo, orangeMat);
  armR.name = 'arm_right';
  armR.position.set(0.55, 1.05, 0.2);
  armR.rotation.z = -0.6;
  root.add(footL, footR, armL, armR);

  return root;
}

export function createPoliwayModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'poliway_root';

  const blueMat = createMaterial(0x2774d8);
  const whiteMat = createMaterial(0xffffff);
  const blackMat = createMaterial(0x111111);
  const waterGunMat = createMaterial(0x00bcd4, 0.2, 0.3);
  const orangeAccentMat = createMaterial(0xff7700);

  // Big round blue body
  const bodyGeo = new THREE.SphereGeometry(0.85, 10, 10);
  const body = new THREE.Mesh(bodyGeo, blueMat);
  body.position.y = 0.95;
  body.castShadow = true;
  root.add(body);

  // White belly with swirl spiral
  const belly = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), whiteMat);
  belly.position.set(0, 0.9, 0.86);
  root.add(belly);

  const swirlGroup = new THREE.Group();
  swirlGroup.position.set(0, 0.9, 0.88);
  const swirl1 = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 4, 16, Math.PI * 1.5), blackMat);
  const swirl2 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 4, 12, Math.PI * 1.3), blackMat);
  swirl2.rotation.z = 1.2;
  const swirl3 = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.035, 4, 8, Math.PI * 1.2), blackMat);
  swirl3.rotation.z = 2.4;
  swirlGroup.add(swirl1, swirl2, swirl3);
  root.add(swirlGroup);

  // Derpy bulging eyes on top of head
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), whiteMat);
  eyeL.position.set(-0.4, 1.7, 0.25);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), whiteMat);
  eyeR.position.set(0.4, 1.7, 0.25);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), blackMat);
  pupilL.position.set(-0.4, 1.7, 0.46);
  const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), blackMat);
  pupilR.position.set(0.4, 1.7, 0.46);
  root.add(eyeL, eyeR, pupilL, pupilR);

  // Boxing glove hands
  const armL = new THREE.Group();
  armL.name = 'arm_left';
  armL.position.set(-0.8, 0.95, 0.1);
  const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), whiteMat);
  gloveL.position.set(-0.15, 0, 0.2);
  armL.add(gloveL);

  const armR = new THREE.Group();
  armR.name = 'arm_right';
  armR.position.set(0.8, 0.95, 0.1);
  const gloveR = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), whiteMat);
  gloveR.position.set(0.15, 0, 0.2);
  armR.add(gloveR);

  // EQUIPPED WATER GUN IN RIGHT HAND!
  const waterGun = new THREE.Group();
  waterGun.name = 'water_gun';
  waterGun.visible = false;
  waterGun.position.set(0.2, 0.05, 0.35);
  waterGun.rotation.y = 0.2;
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.45), waterGunMat);
  const gunTank = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 8), orangeAccentMat);
  gunTank.rotation.x = Math.PI / 2;
  gunTank.position.set(0, 0.12, -0.05);
  const gunNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.16, 6), orangeAccentMat);
  gunNozzle.rotation.x = Math.PI / 2;
  gunNozzle.position.set(0, 0, 0.3);
  waterGun.add(gunBody, gunTank, gunNozzle);
  armR.add(waterGun);

  // Feet
  const footL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.35, 6), blueMat);
  footL.name = 'leg_left';
  footL.position.set(-0.45, 0.18, 0.05);
  const footR = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.35, 6), blueMat);
  footR.name = 'leg_right';
  footR.position.set(0.45, 0.18, 0.05);
  root.add(footL, footR, armL, armR);

  return root;
}

export function createGeodudeWithLegsModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'geodude_legs_root';

  const rockMat = createMaterial(0x8a8a8a, 0.8, 0.1);
  const darkRockMat = createMaterial(0x5a5a5a, 0.9, 0.05);
  const skinMat = createMaterial(0xf4b788, 0.5, 0.05); // Flesh legs
  const sockMat = createMaterial(0xffffff);
  const sneakerMat = createMaterial(0xe82c2c);
  const blackMat = createMaterial(0x111111);

  // Rock boulder torso/head
  const rockGeo = new THREE.DodecahedronGeometry(0.85, 1);
  const rockBody = new THREE.Mesh(rockGeo, rockMat);
  rockBody.position.y = 1.7;
  rockBody.castShadow = true;
  root.add(rockBody);

  // Brow & intense eyes
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.25), darkRockMat);
  browL.position.set(-0.25, 2.05, 0.65);
  browL.rotation.z = -0.25;
  const browR = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.25), darkRockMat);
  browR.position.set(0.25, 2.05, 0.65);
  browR.rotation.z = 0.25;
  root.add(browL, browR);

  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, 0.1), createMaterial(0xffffff));
  eyeL.position.set(-0.28, 1.85, 0.75);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.16, 0.1), createMaterial(0xffffff));
  eyeR.position.set(0.28, 1.85, 0.75);
  const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), blackMat);
  pupilL.position.set(-0.25, 1.85, 0.8);
  const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), blackMat);
  pupilR.position.set(0.25, 1.85, 0.8);
  root.add(eyeL, eyeR, pupilL, pupilR);

  // Mouth
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.1), blackMat);
  mouth.position.set(0, 1.55, 0.78);
  root.add(mouth);

  // Fists
  const armL = new THREE.Group();
  armL.name = 'arm_left';
  armL.position.set(-0.95, 1.7, 0.1);
  const fistL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.5), darkRockMat);
  fistL.position.set(-0.35, 0, 0.2);
  armL.add(fistL);

  const armR = new THREE.Group();
  armR.name = 'arm_right';
  armR.position.set(0.95, 1.7, 0.1);
  const fistR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.5), darkRockMat);
  fistR.position.set(0.35, 0, 0.2);
  armR.add(fistR);
  root.add(armL, armR);

  // TWO COMICAL MUSCULAR HUMAN LEGS WITH SNEAKERS!
  const legLGroup = new THREE.Group();
  legLGroup.name = 'leg_left';
  legLGroup.position.set(-0.35, 1.0, 0);
  const thighL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.55, 8), skinMat);
  thighL.position.y = -0.27;
  const calfL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.5, 8), skinMat);
  calfL.position.y = -0.8;
  const sockL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.15, 8), sockMat);
  sockL.position.y = -1.0;
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.55), sneakerMat);
  shoeL.position.set(0, -1.08, 0.1);
  legLGroup.add(thighL, calfL, sockL, shoeL);

  const legRGroup = new THREE.Group();
  legRGroup.name = 'leg_right';
  legRGroup.position.set(0.35, 1.0, 0);
  const thighR = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.55, 8), skinMat);
  thighR.position.y = -0.27;
  const calfR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.5, 8), skinMat);
  calfR.position.y = -0.8;
  const sockR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.15, 8), sockMat);
  sockR.position.y = -1.0;
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.55), sneakerMat);
  shoeR.position.set(0, -1.08, 0.1);
  legRGroup.add(thighR, calfR, sockR, shoeR);

  root.add(legLGroup, legRGroup);

  // The original comedy legs were authored about 18 cm below the model origin,
  // so correct world-floor collision still made the shoes look buried in grass.
  // Keep the physics origin at the feet (like every other playable character) and
  // lift the visual hierarchy once here rather than adding a fake floor offset.
  root.children.forEach((child) => { child.position.y += 0.18; });
  root.userData.visualGroundCorrection = 0.18;
  return root;
}


// -----------------------------------------------------------------------------
// PLAYABLE CHARIZARD
// -----------------------------------------------------------------------------
// This is a dedicated player-character factory. Ash's/wild Charizard NPCs may share
// the same low-level anatomy builder, but every call returns a completely independent
// hierarchy so player state/animation can never leak into NPC AI or combat state.
function createDetailedCharizardModel(rootName: string): THREE.Group {
  const root = new THREE.Group();
  root.name = rootName;
  root.userData.isCharizardModel = true;
  root.userData.charizardFlying = false;

  const visual = new THREE.Group();
  visual.name = 'charizard_visual';
  root.add(visual);

  const orange = createMaterial(0xe66f2c, 0.52, 0.02);
  const orangeDark = createMaterial(0xc95022, 0.58, 0.01);
  const cream = createMaterial(0xf2c987, 0.60, 0.01);
  const wingMembrane = new THREE.MeshStandardMaterial({
    color: 0x2d948f,
    roughness: 0.48,
    metalness: 0.01,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const white = createMaterial(0xf7f4e8, 0.48, 0.01);
  const eyeBlue = createMaterial(0x5db7dc, 0.36, 0.03);
  const pupil = createMaterial(0x101418, 0.42, 0.02);
  const claw = createMaterial(0xf5eee0, 0.62, 0.01);
  const flameOuter = new THREE.MeshStandardMaterial({
    color: 0xff7a19,
    emissive: 0xff3d00,
    emissiveIntensity: 1.15,
    roughness: 0.35,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  });
  const flameInner = new THREE.MeshStandardMaterial({
    color: 0xffe052,
    emissive: 0xffb300,
    emissiveIntensity: 1.5,
    roughness: 0.25,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
  });

  // Torso: broad chest, rounded belly and cream ventral stripe.
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.64, 12, 10), orange);
  body.name = 'charizard_body';
  body.scale.set(0.86, 1.18, 0.78);
  body.position.set(0, 1.34, -0.04);
  visual.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.49, 12, 10), cream);
  belly.name = 'charizard_belly';
  belly.scale.set(0.75, 1.20, 0.26);
  belly.position.set(0, 1.31, 0.55);
  visual.add(belly);

  // Neck and angular head/snouted silhouette.
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.54, 5, 9), orange);
  neck.name = 'charizard_neck';
  neck.position.set(0, 1.93, 0.04);
  neck.rotation.x = -0.10;
  visual.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.39, 11, 9), orange);
  head.name = 'charizard_head';
  head.scale.set(0.94, 0.88, 1.02);
  head.position.set(0, 2.36, 0.18);
  visual.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.31, 0.56, 2, 2, 2), orange);
  snout.name = 'charizard_snout';
  snout.position.set(0, 2.27, 0.55);
  snout.scale.set(0.92, 0.78, 0.96);
  visual.add(snout);

  const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.16, 0.42), cream);
  lowerJaw.name = 'charizard_jaw';
  lowerJaw.position.set(0, 2.15, 0.57);
  visual.add(lowerJaw);

  // Rear-pointing horns.
  for (const sign of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.58, 6), orangeDark);
    horn.name = sign < 0 ? 'horn_left' : 'horn_right';
    horn.position.set(sign * 0.22, 2.67, -0.02);
    horn.rotation.x = -0.95;
    horn.rotation.z = sign * 0.16;
    visual.add(horn);

    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 7), white);
    eyeWhite.scale.set(0.68, 1.05, 0.45);
    eyeWhite.position.set(sign * 0.17, 2.42, 0.50);
    visual.add(eyeWhite);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.054, 7, 6), eyeBlue);
    iris.scale.set(0.7, 1.0, 0.42);
    iris.position.set(sign * 0.17, 2.42, 0.566);
    visual.add(iris);

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 5), pupil);
    dot.position.set(sign * 0.17, 2.42, 0.595);
    visual.add(dot);
  }

  // Two visible upper fangs.
  for (const sign of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.16, 5), claw);
    fang.position.set(sign * 0.17, 2.20, 0.79);
    fang.rotation.x = Math.PI;
    visual.add(fang);
  }

  // Shorter arms with three white claws.
  for (const sign of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = sign < 0 ? 'arm_left' : 'arm_right';
    arm.position.set(sign * 0.52, 1.66, 0.12);
    arm.rotation.z = sign * -0.22;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.34, 4, 7), orange);
    upper.position.y = -0.17;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.28, 4, 7), orange);
    fore.position.set(0, -0.47, 0.055);
    fore.rotation.x = -0.16;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.115, 7, 6), orange);
    hand.position.set(0, -0.69, 0.09);
    arm.add(upper, fore, hand);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.13, 5), claw);
      c.position.set((i - 1) * 0.055, -0.78, 0.14);
      c.rotation.x = Math.PI / 2;
      arm.add(c);
    }
    visual.add(arm);
  }

  // Stocky plantigrade legs and large three-clawed feet.
  for (const sign of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = sign < 0 ? 'leg_left' : 'leg_right';
    leg.position.set(sign * 0.32, 0.86, 0.0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.38, 5, 8), orange);
    thigh.position.y = -0.18;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.34, 4, 8), orange);
    shin.position.set(0, -0.52, 0.02);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.25, 9, 7), cream);
    foot.scale.set(0.90, 0.48, 1.30);
    foot.position.set(0, -0.76, 0.18);
    leg.add(thigh, shin, foot);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.19, 5), claw);
      c.position.set((i - 1) * 0.10, -0.77, 0.45);
      c.rotation.x = Math.PI / 2;
      leg.add(c);
    }
    visual.add(leg);
  }

  // Wings are built as articulated groups with actual membrane geometry rather
  // than solid orange triangles. The local Z-axis remains shallow so the player
  // collision body can stay close to Charizard's torso while the silhouette is wide.
  const makeWing = (sign: number) => {
    const wing = new THREE.Group();
    wing.name = sign < 0 ? 'wing_left' : 'wing_right';
    wing.position.set(sign * 0.38, 1.93, -0.24);
    wing.rotation.z = sign * 0.12;

    const membraneGeo = new THREE.BufferGeometry();
    const x = sign;
    const verts = new Float32Array([
      0, 0, 0,
      x * 0.86, 0.72, -0.02,
      x * 1.58, 0.98, -0.05,
      0, 0, 0,
      x * 1.58, 0.98, -0.05,
      x * 1.36, -0.16, -0.02,
      0, 0, 0,
      x * 1.36, -0.16, -0.02,
      x * 0.46, -0.82, 0.02,
    ]);
    membraneGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    membraneGeo.computeVertexNormals();
    const membrane = new THREE.Mesh(membraneGeo, wingMembrane);
    membrane.name = sign < 0 ? 'wing_membrane_left' : 'wing_membrane_right';
    wing.add(membrane);

    const addBone = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, name: string) => {
      const a = new THREE.Vector3(ax, ay, az);
      const b = new THREE.Vector3(bx, by, bz);
      const mid = a.clone().lerp(b, 0.5);
      const length = a.distanceTo(b);
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.072, length, 6), orangeDark);
      bone.name = name;
      bone.position.copy(mid);
      bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      wing.add(bone);
    };
    addBone(0, 0, 0, x * 0.86, 0.72, -0.02, 'wing_upper_bone');
    addBone(x * 0.86, 0.72, -0.02, x * 1.58, 0.98, -0.05, 'wing_tip_bone');
    addBone(0, 0, 0, x * 0.46, -0.82, 0.02, 'wing_lower_bone');

    const topHorn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 5), orangeDark);
    topHorn.position.set(x * 1.56, 1.08, -0.05);
    topHorn.rotation.z = sign * -0.18;
    wing.add(topHorn);
    return wing;
  };
  visual.add(makeWing(-1), makeWing(1));

  // Long curved tail with a layered emissive flame.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 1.02, -0.50);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.04, -0.16, -0.50),
    new THREE.Vector3(0.10, -0.30, -1.00),
    new THREE.Vector3(0.18, -0.20, -1.48),
    new THREE.Vector3(0.12, 0.02, -1.84),
  ]);
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 16, 0.12, 7, false), orange);
  tailMesh.name = 'charizard_tail_mesh';
  tail.add(tailMesh);

  const flame = new THREE.Group();
  flame.name = 'tail_flame';
  flame.position.set(0.12, 0.04, -1.88);
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.62, 7), flameOuter);
  outer.name = 'tail_flame_outer';
  outer.position.y = 0.22;
  outer.rotation.z = 0.16;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.38, 7), flameInner);
  inner.name = 'tail_flame_inner';
  inner.position.y = 0.19;
  inner.rotation.z = -0.10;
  flame.add(outer, inner);
  tail.add(flame);
  visual.add(tail);

  // Small nostrils are a high-value recognition detail at close range.
  for (const sign of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), pupil);
    nostril.position.set(sign * 0.12, 2.36, 0.84);
    visual.add(nostril);
  }

  // Close-up player model quality; distant NPC optimisation can still disable
  // shadows through the existing performance manager.
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  return root;
}

export function createCharizardPlayerModel(): THREE.Group {
  const root = createDetailedCharizardModel('charizard_player_root');
  root.userData.playerCharacter = true;
  return root;
}

export function createPokemonModel(id: PokemonCharacterId): THREE.Group {
  switch (id) {
    case 'pikachu':
      return createPikachuModel();
    case 'charmander':
      return createCharmanderModel();
    case 'poliway':
      return createPoliwayModel();
    case 'geodude':
    case 'geodude_legs':
      return createGeodudeWithLegsModel();
    case 'charizard':
      return createCharizardPlayerModel();
    default:
      return createPikachuModel();
  }
}

// ----------------------------------------------------
// 2. PROFESSOR OAK & SIMPSONS NPCS
// ----------------------------------------------------
export function createProfessorOakModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_professor_oak';

  const labCoatMat = createMaterial(0xf5f5f5);
  const redShirtMat = createMaterial(0xb71c1c);
  const brownPantsMat = createMaterial(0x4e342e);
  const grayHairMat = createMaterial(0xb0bec5);
  const skinMat = createMaterial(0xffdbac);
  const shoeMat = createMaterial(0x212121);
  const clipMat = createMaterial(0x8d6e63);

  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 1.25, 8), labCoatMat);
  coat.position.y = 1.35;
  coat.castShadow = true;
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.1), redShirtMat);
  shirt.position.set(0, 1.45, 0.38);
  root.add(coat, shirt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), skinMat);
  head.position.y = 2.25;
  const hair = new THREE.Mesh(new THREE.DodecahedronGeometry(0.44, 1), grayHairMat);
  hair.position.set(0, 2.38, -0.05);
  root.add(head, hair);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), createMaterial(0x111111));
  eyeL.position.set(-0.14, 2.28, 0.35);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), createMaterial(0x111111));
  eyeR.position.set(0.14, 2.28, 0.35);
  const smile = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), createMaterial(0x111111));
  smile.position.set(0, 2.12, 0.37);
  root.add(eyeL, eyeR, smile);

  const clipboard = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.04), clipMat);
  clipboard.position.set(0.45, 1.3, 0.4);
  clipboard.rotation.x = -0.4;
  clipboard.rotation.y = -0.3;
  root.add(clipboard);

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), labCoatMat);
  armL.position.set(-0.55, 1.25, 0);
  armL.rotation.z = 0.2;
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), labCoatMat);
  armR.position.set(0.55, 1.3, 0.2);
  armR.rotation.x = -0.6;
  root.add(armL, armR);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.75, 6), brownPantsMat);
  legL.name = 'leg_left';
  legL.position.set(-0.2, 0.4, 0);
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.42), shoeMat);
  shoeL.position.set(-0.2, 0.07, 0.08);

  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.75, 6), brownPantsMat);
  legR.name = 'leg_right';
  legR.position.set(0.2, 0.4, 0);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.42), shoeMat);
  shoeR.position.set(0.2, 0.07, 0.08);
  root.add(legL, shoeL, legR, shoeR);

  return root;
}

export function createHomerNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_homer';

  const yellowMat = createMaterial(0xfad02c);
  const whiteMat = createMaterial(0xf0f0f0);
  const blueMat = createMaterial(0x3565b8);
  const muzzleMat = createMaterial(0xd6a858);
  const blackMat = createMaterial(0x1a1a1a);
  const pinkDonutMat = createMaterial(0xff69b4);
  const doughMat = createMaterial(0xe8b87a);

  const bellyGeo = new THREE.SphereGeometry(0.75, 8, 8);
  bellyGeo.scale(1.1, 1.25, 1.2);
  const belly = new THREE.Mesh(bellyGeo, whiteMat);
  belly.position.y = 1.15;
  belly.castShadow = true;
  root.add(belly);

  const pants = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.55, 0.8, 8), blueMat);
  pants.position.y = 0.55;
  root.add(pants);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.9, 8), yellowMat);
  head.position.y = 2.15;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), yellowMat);
  dome.position.y = 2.6;
  root.add(head, dome);

  const muzzleGeo = new THREE.SphereGeometry(0.35, 8, 8);
  muzzleGeo.scale(1, 0.85, 1.2);
  const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
  muzzle.position.set(0, 1.95, 0.3);
  root.add(muzzle);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), whiteMat);
  eyeL.position.set(-0.16, 2.3, 0.38);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), whiteMat);
  eyeR.position.set(0.16, 2.3, 0.38);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), blackMat);
  pupilL.position.set(-0.16, 2.3, 0.54);
  const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), blackMat);
  pupilR.position.set(0.16, 2.3, 0.54);
  root.add(eyeL, eyeR, pupilL, pupilR);

  const donutGroup = new THREE.Group();
  donutGroup.position.set(0.7, 1.35, 0.45);
  const dough = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.08, 6, 12), doughMat);
  const frosting = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.085, 6, 12, Math.PI), pinkDonutMat);
  frosting.rotation.x = Math.PI / 2;
  donutGroup.add(dough, frosting);
  root.add(donutGroup);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.55, 6), blueMat);
  legL.name = 'leg_left';
  legL.position.set(-0.25, 0.28, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.55, 6), blueMat);
  legR.name = 'leg_right';
  legR.position.set(0.25, 0.28, 0);
  root.add(legL, legR);

  return root;
}

export function createMargeNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_marge';

  const yellowMat = createMaterial(0xfad02c);
  const blueHairMat = createMaterial(0x1976d2);
  const greenDressMat = createMaterial(0x7cb342);
  const redMat = createMaterial(0xd32f2f);
  const whiteMat = createMaterial(0xffffff);
  const blackMat = createMaterial(0x111111);

  const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.4, 8), greenDressMat);
  dress.position.y = 1.0;
  root.add(dress);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), yellowMat);
  head.position.y = 1.85;
  root.add(head);

  const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 1.7, 8), blueHairMat);
  hair.position.y = 2.75;
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), blueHairMat);
  hairTop.position.y = 3.6;
  root.add(hair, hairTop);

  const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 12), redMat);
  necklace.rotation.x = Math.PI / 2;
  necklace.position.y = 1.65;
  root.add(necklace);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), whiteMat);
  eyeL.position.set(-0.12, 1.95, 0.28);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), whiteMat);
  eyeR.position.set(0.12, 1.95, 0.28);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), blackMat);
  pupilL.position.set(-0.12, 1.95, 0.4);
  const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), blackMat);
  pupilR.position.set(0.12, 1.95, 0.4);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.06), redMat);
  mouth.position.set(0, 1.8, 0.32);
  root.add(eyeL, eyeR, pupilL, pupilR, mouth);

  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.35), redMat);
  shoeL.position.set(-0.16, 0.05, 0.05);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.35), redMat);
  shoeR.position.set(0.16, 0.05, 0.05);
  root.add(shoeL, shoeR);

  return root;
}

export function createBartNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_bart';

  const yellowMat = createMaterial(0xfad02c);
  const redMat = createMaterial(0xe53935);
  const blueMat = createMaterial(0x1e88e5);
  const whiteMat = createMaterial(0xffffff);
  const blackMat = createMaterial(0x111111);
  const woodMat = createMaterial(0x8d6e63);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 8), redMat);
  body.position.y = 0.85;
  root.add(body);

  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.35, 8), blueMat);
  shorts.position.y = 0.45;
  root.add(shorts);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.65, 8), yellowMat);
  head.position.y = 1.45;
  root.add(head);

  for (let i = 0; i < 7; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), yellowMat);
    const angle = (i / 7) * Math.PI * 2;
    spike.position.set(Math.cos(angle) * 0.22, 1.85, Math.sin(angle) * 0.22);
    root.add(spike);
  }

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), whiteMat);
  eyeL.position.set(-0.12, 1.55, 0.28);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), whiteMat);
  eyeR.position.set(0.12, 1.55, 0.28);
  const pL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), blackMat);
  pL.position.set(-0.12, 1.55, 0.39);
  const pR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), blackMat);
  pR.position.set(0.12, 1.55, 0.39);
  root.add(eyeL, eyeR, pL, pR);

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 1.2), woodMat);
  board.position.set(0.45, 0.85, 0.1);
  board.rotation.x = 0.5;
  root.add(board);

  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.35), blueMat);
  shoeL.position.set(-0.15, 0.06, 0.05);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.35), blueMat);
  shoeR.position.set(0.15, 0.06, 0.05);
  root.add(shoeL, shoeR);

  return root;
}

export function createLisaNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_lisa';

  const yellowMat = createMaterial(0xfad02c);
  const redMat = createMaterial(0xe53935);
  const goldMat = createMaterial(0xffb300, 0.2, 0.8);
  const whiteMat = createMaterial(0xffffff);

  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), redMat);
  dress.position.y = 0.7;
  root.add(dress);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), yellowMat);
  head.position.y = 1.35;
  root.add(head);

  for (let i = 0; i < 8; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 4), yellowMat);
    const a = (i / 8) * Math.PI * 2;
    cone.position.set(Math.cos(a) * 0.28, 1.55 + Math.sin(i) * 0.08, Math.sin(a) * 0.28);
    cone.rotation.z = Math.cos(a) * 0.5;
    root.add(cone);
  }

  const sax = new THREE.Group();
  sax.position.set(0.3, 0.85, 0.25);
  const saxTube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 6), goldMat);
  const saxBell = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.25, 6), goldMat);
  saxBell.position.set(0.1, -0.25, 0.1);
  saxBell.rotation.x = -1.2;
  sax.add(saxTube, saxBell);
  root.add(sax);

  return root;
}

export function createMaggieNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_maggie';

  const blueMat = createMaterial(0x42a5f5);
  const yellowMat = createMaterial(0xfad02c);
  const redMat = createMaterial(0xd32f2f);

  const onesie = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), blueMat);
  onesie.scale.set(1, 1.2, 0.9);
  onesie.position.y = 0.45;
  root.add(onesie);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), yellowMat);
  head.position.y = 0.95;
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.08), blueMat);
  bow.position.set(0, 1.25, 0);
  root.add(head, bow);

  const paci = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 6), redMat);
  paci.rotation.x = Math.PI / 2;
  paci.position.set(0, 0.88, 0.3);
  root.add(paci);

  return root;
}

export function createMoeNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_moe';

  const skin = createMaterial(0xf2c94c);
  const shirt = createMaterial(0x8fc8e8);
  const apron = createMaterial(0xf4f1e8);
  const pants = createMaterial(0x31527a);
  const shoe = createMaterial(0x1c1c1c);
  const hair = createMaterial(0x737373);
  const white = createMaterial(0xffffff);
  const black = createMaterial(0x111111);

  // Proper standing bartender silhouette instead of the old cylinder + floating stool.
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.72, 6), pants);
  legL.name = 'leg_left'; legL.position.set(-0.18, 0.36, 0);
  const legR = legL.clone(); legR.name = 'leg_right'; legR.position.x = 0.18;
  const footL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.48), shoe);
  footL.position.set(-0.18, 0.08, 0.11);
  const footR = footL.clone(); footR.position.x = 0.18;

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.05, 8), shirt);
  torso.position.y = 1.18;
  const apronFront = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.82, 0.055), apron);
  apronFront.position.set(0, 1.04, 0.37);
  const bowL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 3), black);
  bowL.position.set(-0.08, 1.60, 0.39); bowL.rotation.z = Math.PI / 2;
  const bowR = bowL.clone(); bowR.position.x = 0.08; bowR.rotation.z = -Math.PI / 2;

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.72, 6), skin);
  armL.name = 'arm_left'; armL.position.set(-0.46, 1.22, 0.05); armL.rotation.z = 0.18;
  const armR = armL.clone(); armR.name = 'arm_right'; armR.position.x = 0.46; armR.rotation.z = -0.18;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.37, 8, 8), skin);
  head.scale.set(0.86, 1.08, 0.88); head.position.y = 1.98;
  // Moe's long, hooked cartoon nose.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 7), skin);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.96, 0.48);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.105, 6, 6), white);
  eyeL.position.set(-0.14, 2.06, 0.31);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.14;
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 5), black);
  pupilL.position.set(-0.14, 2.04, 0.405);
  const pupilR = pupilL.clone(); pupilR.position.x = 0.14;
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.045, 0.045), hair);
  browL.position.set(-0.14, 2.18, 0.38); browL.rotation.z = -0.18;
  const browR = browL.clone(); browR.position.x = 0.14; browR.rotation.z = 0.18;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.035), black);
  mouth.position.set(0, 1.78, 0.35);

  // Dense curly grey Moe hair around the back/top of his head.
  for (const [x,y,z] of [[-0.23,2.28,-0.03],[0,2.34,-0.06],[0.23,2.28,-0.03],[-0.29,2.13,-0.15],[0.29,2.13,-0.15]] as const) {
    const curl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), hair);
    curl.position.set(x,y,z); root.add(curl);
  }

  root.add(legL, legR, footL, footR, torso, apronFront, bowL, bowR, armL, armR,
    head, nose, eyeL, eyeR, pupilL, pupilR, browL, browR, mouth);
  return root;
}

export function createKrustyClownNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_krusty_the_clown';

  const face = createMaterial(0xf6e1b8);
  const white = createMaterial(0xffffff);
  const black = createMaterial(0x111111);
  const red = createMaterial(0xe53935);
  const cyan = createMaterial(0x31c9df);
  const pink = createMaterial(0xe573b3);
  const green = createMaterial(0x43a047);
  const paleBlue = createMaterial(0xb3e5fc);
  const yellow = createMaterial(0xffd54f);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.72, 6), paleBlue);
  legL.name='leg_left'; legL.position.set(-0.2,0.36,0);
  const legR=legL.clone(); legR.name='leg_right'; legR.position.x=0.2;
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.18,0.58), yellow); shoeL.position.set(-0.2,0.08,0.12);
  const shoeR=shoeL.clone(); shoeR.position.x=0.2;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.48,8,7), pink); torso.scale.set(0.88,1.15,0.78); torso.position.y=1.22;
  const bowL = new THREE.Mesh(new THREE.ConeGeometry(0.18,0.30,3), green); bowL.position.set(-0.12,1.58,0.39); bowL.rotation.z=Math.PI/2;
  const bowR=bowL.clone(); bowR.position.x=0.12; bowR.rotation.z=-Math.PI/2;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.13,0.72,6), face); armL.name='arm_left'; armL.position.set(-0.51,1.25,0); armL.rotation.z=0.32;
  const armR=armL.clone(); armR.name='arm_right'; armR.position.x=0.51; armR.rotation.z=-0.32;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42,9,8), face); head.position.y=2.03;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.16,7,6), red); nose.position.set(0,2.02,0.42);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.13,6,6), white); eyeL.position.set(-0.15,2.12,0.34);
  const eyeR=eyeL.clone(); eyeR.position.x=0.15;
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.045,5,5), black); pupilL.position.set(-0.15,2.10,0.45);
  const pupilR=pupilL.clone(); pupilR.position.x=0.15;
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.19,0.035,5,10,Math.PI), red); smile.position.set(0,1.86,0.38); smile.rotation.z=Math.PI;
  // Krusty's signature blue side hair and bald crown.
  for (const x of [-0.42,0.42]) {
    const tuft1=new THREE.Mesh(new THREE.SphereGeometry(0.24,7,6),cyan); tuft1.position.set(x,2.18,-0.02);
    const tuft2=new THREE.Mesh(new THREE.SphereGeometry(0.20,7,6),cyan); tuft2.position.set(x*1.08,2.38,-0.05);
    root.add(tuft1,tuft2);
  }

  root.add(legL,legR,shoeL,shoeR,torso,bowL,bowR,armL,armR,head,nose,eyeL,eyeR,pupilL,pupilR,smile);
  return root;
}

export function createApuNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_apu';

  const skinMat = createMaterial(0x8d5524);
  const greenJacketMat = createMaterial(0x2e7d32);
  const blackMat = createMaterial(0x161616);
  const whiteMat = createMaterial(0xffffff);
  const hairMat = createMaterial(0x0d0d0d);
  const cupMat = createMaterial(0xd32f2f);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.72, 6), blackMat);
  legL.name = 'leg_left';
  legL.position.set(-0.18, 0.36, 0);
  const legR = legL.clone();
  legR.name = 'leg_right';
  legR.position.x = 0.18;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.43, 1.12, 8), greenJacketMat);
  body.position.y = 1.24;
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.72, 0.05), blackMat);
  shirt.position.set(0, 1.30, 0.40);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 9, 8), skinMat);
  head.scale.set(0.92, 1.15, 0.92);
  head.position.y = 2.06;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.52), hairMat);
  hair.position.set(0, 2.38, -0.04);
  const hairPeak = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 5), hairMat);
  hairPeak.position.set(0.12, 2.58, -0.02);
  hairPeak.rotation.z = -0.18;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.095, 6, 5), whiteMat);
  eyeL.position.set(-0.13, 2.13, 0.34);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.13;
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), blackMat);
  pupilL.position.set(-0.13, 2.13, 0.425);
  const pupilR = pupilL.clone();
  pupilR.position.x = 0.13;
  const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.06), hairMat);
  moustache.position.set(0, 1.94, 0.36);

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.82, 6), skinMat);
  armL.position.set(-0.50, 1.27, 0.03);
  armL.rotation.z = -0.16;
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.82, 6), skinMat);
  armR.position.set(0.50, 1.27, 0.03);
  armR.rotation.z = 0.16;

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.32, 8), cupMat);
  cup.position.set(0.58, 1.10, 0.28);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 4), whiteMat);
  straw.position.set(0.58, 1.42, 0.28);

  root.add(legL, legR, body, shirt, head, hair, hairPeak, eyeL, eyeR, pupilL, pupilR, moustache, armL, armR, cup, straw);
  return root;
}

export function createFlandersNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_flanders';

  const yellowMat = createMaterial(0xfad02c);
  const greenMat = createMaterial(0x388e3c);
  const grayMat = createMaterial(0x555555);
  const brownMat = createMaterial(0x5d4037);
  const whiteMat = createMaterial(0xffffff);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.4, 1.1, 8), greenMat);
  body.position.y = 1.25;
  root.add(body);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 8), yellowMat);
  head.position.y = 2.15;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.3, 0.65), brownMat);
  hair.position.y = 2.5;
  const stache = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.15), brownMat);
  stache.position.set(0, 1.95, 0.32);
  root.add(head, hair, stache);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), whiteMat);
  eyeL.position.set(-0.14, 2.2, 0.32);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), whiteMat);
  eyeR.position.set(0.14, 2.2, 0.32);
  root.add(eyeL, eyeR);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 6), grayMat);
  legL.name = 'leg_left';
  legL.position.set(-0.2, 0.35, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 6), grayMat);
  legR.name = 'leg_right';
  legR.position.set(0.2, 0.35, 0);
  root.add(legL, legR);

  return root;
}

export function createChiefWiggumNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_chief_wiggum';

  const yellowMat = createMaterial(0xfad02c);
  const blueUniformMat = createMaterial(0x1565c0);
  const darkBlueMat = createMaterial(0x0d47a1);
  const goldMat = createMaterial(0xffd700);
  const blackMat = createMaterial(0x111111);
  const whiteMat = createMaterial(0xffffff);

  const bellyGeo = new THREE.SphereGeometry(0.78, 8, 8);
  bellyGeo.scale(1.2, 1.25, 1.25);
  const belly = new THREE.Mesh(bellyGeo, blueUniformMat);
  belly.position.y = 1.15;
  root.add(belly);

  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 6), goldMat);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(-0.35, 1.45, 0.9);
  root.add(badge);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 8, 8), yellowMat);
  head.position.y = 2.15;
  root.add(head);

  const capCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.44, 0.35, 8), darkBlueMat);
  capCrown.position.y = 2.55;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.4), blackMat);
  visor.position.set(0, 2.45, 0.38);
  visor.rotation.x = 0.2;
  const capBadge = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), goldMat);
  capBadge.position.set(0, 2.65, 0.42);
  root.add(capCrown, visor, capBadge);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), whiteMat);
  eyeL.position.set(-0.16, 2.22, 0.36);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), whiteMat);
  eyeR.position.set(0.16, 2.22, 0.36);
  root.add(eyeL, eyeR);

  // Chief Wiggum is never truly on duty without a pink-frosted donut.
  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.68, 6), yellowMat);
  armR.name = 'arm_right';
  armR.rotation.z = -0.8;
  armR.position.set(0.67, 1.42, 0.14);
  const donut = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.105, 8, 14),
    createMaterial(0xff75b5, 0.3, 0.05)
  );
  donut.name = 'wiggum_pink_donut';
  donut.rotation.x = Math.PI / 2;
  donut.rotation.z = 0.25;
  donut.position.set(0.90, 1.17, 0.38);
  const sprinkleMat = createMaterial(0xfff176, 0.35, 0.02);
  for (let i = 0; i < 5; i++) {
    const sprinkle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.025), sprinkleMat);
    const a = (i / 5) * Math.PI * 2;
    sprinkle.position.set(0.90 + Math.cos(a) * 0.20, 1.17 + Math.sin(a) * 0.20, 0.49);
    sprinkle.rotation.z = a;
    root.add(sprinkle);
  }
  root.add(armR, donut);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.65, 6), darkBlueMat);
  legL.name = 'leg_left';
  legL.position.set(-0.28, 0.32, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.65, 6), darkBlueMat);
  legR.name = 'leg_right';
  legR.position.set(0.28, 0.32, 0);
  root.add(legL, legR);

  return root;
}

export function createOfficerLouNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_officer_lou';

  const skinMat = createMaterial(0x6d4c41);
  const blueShirtMat = createMaterial(0x1e88e5);
  const darkBlueMat = createMaterial(0x0d47a1);
  const goldMat = createMaterial(0xffd700);
  const blackMat = createMaterial(0x111111);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.36, 1.15, 8), blueShirtMat);
  torso.position.y = 1.25;
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 6), goldMat);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(-0.25, 1.45, 0.38);
  root.add(torso, badge);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), skinMat);
  head.position.y = 2.05;
  root.add(head);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.28, 8), darkBlueMat);
  cap.position.y = 2.38;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), blackMat);
  visor.position.set(0, 2.3, 0.32);
  root.add(cap, visor);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.8, 6), darkBlueMat);
  legL.name = 'leg_left';
  legL.position.set(-0.2, 0.4, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.8, 6), darkBlueMat);
  legR.name = 'leg_right';
  legR.position.set(0.2, 0.4, 0);
  root.add(legL, legR);

  return root;
}

export function createComicBookGuyNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_comic_book_guy';

  const yellowMat = createMaterial(0xfad02c);
  const tealMat = createMaterial(0x00897b);
  const shortsMat = createMaterial(0x795548);
  const brownHairMat = createMaterial(0x4e342e);
  const comicMat = createMaterial(0xff1744);

  const torsoGeo = new THREE.SphereGeometry(0.72, 8, 8);
  torsoGeo.scale(1.15, 1.25, 1.2);
  const torso = new THREE.Mesh(torsoGeo, tealMat);
  torso.position.y = 1.15;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), yellowMat);
  head.position.y = 2.05;
  const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.5, 6), brownHairMat);
  ponytail.position.set(0, 2.05, -0.45);
  ponytail.rotation.x = 0.5;
  root.add(head, ponytail);

  const comic = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.08), comicMat);
  comic.position.set(0.55, 1.2, 0.4);
  comic.rotation.y = 0.4;
  root.add(comic);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.6, 6), shortsMat);
  legL.name = 'leg_left';
  legL.position.set(-0.25, 0.3, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.6, 6), shortsMat);
  legR.name = 'leg_right';
  legR.position.set(0.25, 0.3, 0);
  root.add(legL, legR);

  return root;
}

export function createAshKetchumModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'ash_ketchum';

  const blueJacketMat = createMaterial(0x1976d2);
  const whiteMat = createMaterial(0xffffff);
  const redCapMat = createMaterial(0xd32f2f);
  const skinMat = createMaterial(0xffdbac);
  const jeansMat = createMaterial(0x37474f);
  const hairMat = createMaterial(0x111111);
  const gloveMat = createMaterial(0x2e7d32);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.35, 0.95, 8), blueJacketMat);
  torso.position.y = 1.35;
  const whiteShirt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.85, 0.1), whiteMat);
  whiteShirt.position.set(0, 1.35, 0.32);
  root.add(torso, whiteShirt);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), skinMat);
  head.position.y = 2.15;
  const hair = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 6), hairMat);
  hair.position.set(0, 2.35, -0.1);
  hair.rotation.x = -0.3;
  root.add(head, hair);

  const capCrown = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), redCapMat);
  capCrown.position.y = 2.32;
  const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.3), whiteMat);
  capBrim.position.set(0, 2.3, 0.38);
  capBrim.rotation.x = -0.15;
  root.add(capCrown, capBrim);

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.65, 6), blueJacketMat);
  armL.name = 'arm_left';
  armL.position.set(-0.55, 1.25, 0);
  const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), gloveMat);
  gloveL.name = 'glove_left';
  gloveL.position.set(-0.62, 0.9, 0);

  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.65, 6), blueJacketMat);
  armR.name = 'arm_right';
  armR.position.set(0.55, 1.25, 0);
  const gloveR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), gloveMat);
  gloveR.name = 'glove_right';
  gloveR.position.set(0.62, 0.9, 0);
  root.add(armL, armR, gloveL, gloveR);

  // Poké Ball held in hand
  const ballGroup = new THREE.Group();
  ballGroup.name = 'held_pokeball';
  ballGroup.position.set(0.62, 0.9, 0.15);
  const ballTop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), redCapMat);
  const ballBottom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), whiteMat);
  ballGroup.add(ballTop, ballBottom);
  root.add(ballGroup);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.85, 6), jeansMat);
  legL.position.set(-0.2, 0.45, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.85, 6), jeansMat);
  legR.position.set(0.2, 0.45, 0);
  root.add(legL, legR);

  return root;
}

// ----------------------------------------------------
// 3. VEHICLE VISUAL SYSTEM + REAL-WORLD HERO CARS
// ----------------------------------------------------
// The five garage cars below intentionally use different proportions, profiles,
// lights, grilles, wheel designs and cabin layouts. They are procedural meshes,
// but they are authored around the real generations rather than sharing one sedan.

type CarPoint = [number, number]; // [z, y]

type VehicleVisualNodes = {
  wheelSpins: THREE.Object3D[];
  wheelSteers: THREE.Object3D[];
  brakeLights: THREE.Mesh[];
  reverseLights: THREE.Mesh[];
  headlights: THREE.Mesh[];
};

interface HeroCarSpec {
  id: string;
  color: number;
  length: number;
  width: number;
  height: number;
  frontAxleZ: number;
  rearAxleZ: number;
  wheelRadius: number;
  rearWheelRadius?: number;
  wheelWidth: number;
  rearWheelWidth?: number;
  rimRadius: number;
  rearRimRadius?: number;
  rimColor: number;
  spokeCount: number;
  doubleSpoke?: boolean;
  bodyProfile: CarPoint[];
  glassProfile: CarPoint[];
  frontWindow: CarPoint[];
  rearWindow?: CarPoint[];
  rearSideWindow?: CarPoint[];
  twoDoor?: boolean;
  carbonRoof?: boolean;
  bodyStyle: 'f80' | 'g80' | 'f90' | 'aventador' | 'f12';
}

function vehiclePaint(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.19,
    metalness: 0.58,
    clearcoat: 1.0,
    clearcoatRoughness: 0.075,
    envMapIntensity: 1.45,
    reflectivity: 0.72,
    flatShading: false,
  });
}

function vehicleGlossBlack(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x08090b, roughness: 0.15, metalness: 0.42, flatShading: false,
    clearcoat: 0.92, clearcoatRoughness: 0.10, envMapIntensity: 1.32,
  });
}

function vehicleMatteBlack(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.68, metalness: 0.10, flatShading: false });
}

function vehicleCarbon(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x15171a, roughness: 0.30, metalness: 0.50, flatShading: false,
    clearcoat: 0.42, clearcoatRoughness: 0.16, envMapIntensity: 1.18,
  });
}

function vehicleChrome(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.075, metalness: 0.98, flatShading: false, envMapIntensity: 1.55 });
}

function vehicleRubber(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.92, metalness: 0.02, flatShading: false });
}

function vehicleGlass(tint = 0x7fa9bd, opacity = 0.34): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.08,
    metalness: 0.08,
    transparent: true,
    opacity,
    transmission: 0.28,
    thickness: 0.06,
    ior: 1.46,
    clearcoat: 0.82,
    clearcoatRoughness: 0.07,
    envMapIntensity: 1.38,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function vehicleLight(color: number, emissive: number, intensity = 1.2, transparent = true): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.16,
    metalness: 0.10,
    transparent,
    opacity: transparent ? 0.82 : 1,
    side: THREE.DoubleSide,
    depthWrite: !transparent,
  });
}

function shapeFromPoints(points: CarPoint[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
}

function makeSideProfileVolume(
  points: CarPoint[],
  width: number,
  material: THREE.Material,
  bevel = 0.055,
  name = 'body_profile'
): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(shapeFromPoints(points), {
    depth: width,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 2,
    steps: 1,
  });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(-Math.PI / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeSidePanel(points: CarPoint[], sideX: number, material: THREE.Material, name: string): THREE.Mesh {
  const geometry = new THREE.ShapeGeometry(shapeFromPoints(points), 6);
  geometry.rotateY(-Math.PI / 2);
  const panel = new THREE.Mesh(geometry, material);
  panel.name = name;
  panel.position.x = sideX;
  panel.renderOrder = 5;
  return panel;
}

function makeFacePanel(
  points: Array<[number, number]>,
  z: number,
  material: THREE.Material,
  name: string,
  depth = 0.035
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 1,
    curveSegments: 2,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = z;
  mesh.name = name;
  return mesh;
}

function addTubeLine(
  root: THREE.Group,
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
  name: string
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.15);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(6, points.length * 4), radius, 5, false), material);
  mesh.name = name;
  root.add(mesh);
  return mesh;
}

function addBMWRoundel(root: THREE.Group, x: number, y: number, z: number, radius = 0.105): void {
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.028, 20), vehicleChrome());
  outer.rotation.x = Math.PI / 2;
  outer.position.set(x, y, z);
  root.add(outer);

  const black = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.82, 20), new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.3, metalness: 0.35 }));
  black.position.set(x, y, z + (z >= 0 ? 0.018 : -0.018));
  if (z < 0) black.rotation.y = Math.PI;
  root.add(black);

  const quadMatBlue = new THREE.MeshBasicMaterial({ color: 0x2f7fc4, side: THREE.DoubleSide });
  const quadMatWhite = new THREE.MeshBasicMaterial({ color: 0xf3f5f7, side: THREE.DoubleSide });
  const faceZ = z + (z >= 0 ? 0.021 : -0.021);
  for (let i = 0; i < 4; i++) {
    const quarter = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.47, 8, i * Math.PI / 2, Math.PI / 2), i % 2 === 0 ? quadMatBlue : quadMatWhite);
    quarter.position.set(x, y, faceZ);
    if (z < 0) quarter.rotation.y = Math.PI;
    root.add(quarter);
  }
}

function addMBadge(root: THREE.Group, x: number, y: number, z: number, scale = 1): void {
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.24 * scale, 0.09 * scale, 0.025), vehicleGlossBlack());
  base.position.set(x, y, z);
  root.add(base);
  const stripeColors = [0x4aa3df, 0x3157a5, 0xe33a46];
  stripeColors.forEach((color, i) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.028 * scale, 0.065 * scale, 0.012), new THREE.MeshBasicMaterial({ color }));
    stripe.position.set(x - 0.075 * scale + i * 0.032 * scale, y, z + (z >= 0 ? 0.02 : -0.02));
    root.add(stripe);
  });
}

function makeTextBadge(text: string, width: number, height: number, foreground = '#e8eaec'): THREE.Mesh {
  if (typeof document === 'undefined') {
    return new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.018), vehicleChrome());
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.018), vehicleChrome());
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 72px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = foreground;
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 5;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.renderOrder = 7;
  return mesh;
}

function addIndicatorLens(root: THREE.Group, x: number, y: number, z: number, vertical = false): void {
  const material = vehicleLight(0xb96b08, 0xff8c12, 0.18, true);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.045 : 0.14, vertical ? 0.15 : 0.045, 0.025), material);
  lamp.position.set(x, y, z);
  lamp.name = 'indicator_lens';
  root.add(lamp);
}

function addKidneyGrille(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  vertical = false,
  slats = 7
): void {
  const black = vehicleGlossBlack();
  const frame = vehicleChrome();
  const grille = new THREE.Group();
  grille.position.set(x, y, z);

  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  shape.moveTo(-w * 0.82, h);
  shape.quadraticCurveTo(-w, h * 0.78, -w, h * 0.32);
  shape.lineTo(-w * 0.92, -h * 0.72);
  shape.quadraticCurveTo(-w * 0.72, -h, 0, -h * 0.94);
  shape.quadraticCurveTo(w * 0.72, -h, w * 0.92, -h * 0.72);
  shape.lineTo(w, h * 0.32);
  shape.quadraticCurveTo(w, h * 0.78, w * 0.82, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  geo.translate(0, 0, -0.0275);
  const fill = new THREE.Mesh(geo, black);
  grille.add(fill);

  const outline = new THREE.Mesh(new THREE.TorusGeometry(Math.min(width, height) * 0.53, 0.023, 5, 18), frame);
  outline.scale.set(vertical ? 0.62 : 1.00, vertical ? 1.16 : 0.62, 1);
  outline.position.z = 0.045;
  grille.add(outline);

  for (let i = 0; i < slats; i++) {
    const t = (i + 1) / (slats + 1) - 0.5;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.026, height * 0.78, 0.032), vehicleMatteBlack());
    bar.position.set(t * width * 0.78, -0.02, 0.06);
    grille.add(bar);
  }
  root.add(grille);
}

function addExhaustTube(root: THREE.Group, x: number, y: number, z: number, radius = 0.085, blackTip = false): void {
  const tipMat = blackTip ? vehicleGlossBlack() : vehicleChrome();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.30, 14, 1, true), tipMat);
  shell.rotation.x = Math.PI / 2;
  shell.position.set(x, y, z);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, 0.305, 12), vehicleMatteBlack());
  inner.rotation.x = Math.PI / 2;
  inner.position.set(x, y, z - 0.018);
  root.add(shell, inner);
}

function addWheelArch(root: THREE.Group, sideX: number, centerZ: number, centerY: number, radius: number, material: THREE.Material): void {
  const arch = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 5, 28, Math.PI), material);
  arch.rotation.y = Math.PI / 2;
  arch.position.set(sideX, centerY, centerZ);
  root.add(arch);
}

function buildDetailedWheel(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  width: number,
  rimRadius: number,
  rimColor: number,
  spokeCount: number,
  doubleSpoke: boolean,
  steerable: boolean,
  accentCaliper = 0x286fbd,
  brand: 'bmw' | 'lamborghini' | 'ferrari' | 'generic' = 'generic'
): THREE.Mesh {
  const steerPivot = new THREE.Group();
  steerPivot.name = steerable ? 'front_wheel_steer' : 'rear_wheel_mount';
  steerPivot.position.set(x, y, z);
  steerPivot.userData.vehicleWheelSteer = steerable;
  steerPivot.userData.baseSteerY = 0;

  const spin = new THREE.Group();
  spin.name = 'vehicle_wheel_spin';
  spin.userData.vehicleWheelSpin = true;
  spin.userData.wheelRadius = radius;
  steerPivot.add(spin);

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 28, 2), vehicleRubber());
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spin.add(tire);

  const rimMat = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.20, metalness: 0.90, flatShading: false });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.94, rimRadius * 0.94, width * 0.78, 24, 1, true), rimMat);
  barrel.rotation.z = Math.PI / 2;
  spin.add(barrel);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.18, rimRadius * 0.18, width * 0.88, 16), vehicleGlossBlack());
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);

  const faceX = x > 0 ? width * 0.36 : -width * 0.36;
  const spokeLen = rimRadius * 0.72;
  for (let i = 0; i < spokeCount; i++) {
    const baseAngle = (i / spokeCount) * Math.PI * 2;
    const offsets = doubleSpoke ? [-0.055, 0.055] : [0];
    offsets.forEach((offset) => {
      const angle = baseAngle + offset;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.040, spokeLen, 0.055), rimMat);
      spoke.rotation.x = -angle;
      spoke.position.set(faceX, Math.cos(angle) * spokeLen * 0.37, Math.sin(angle) * spokeLen * 0.37);
      spin.add(spoke);
    });
  }

  const capColor = brand === 'ferrari' ? 0xf0c316 : brand === 'lamborghini' ? 0xc9a426 : brand === 'bmw' ? 0x1d2730 : 0x4b5258;
  const centerCap = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.118, rimRadius * 0.118, width * 0.92, 18), new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.22, metalness: 0.50 }));
  centerCap.rotation.z = Math.PI / 2;
  spin.add(centerCap);
  if (brand === 'bmw') {
    const capFaceX = x > 0 ? width * 0.47 : -width * 0.47;
    const capRadius = rimRadius * 0.072;
    for (let q = 0; q < 4; q++) {
      const quarter = new THREE.Mesh(
        new THREE.CircleGeometry(capRadius, 7, q * Math.PI / 2, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: q % 2 === 0 ? 0x3e8dcc : 0xf0f3f5, side: THREE.DoubleSide })
      );
      quarter.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      quarter.position.x = capFaceX;
      spin.add(quarter);
    }
  }

  const brakeDisc = new THREE.Mesh(new THREE.CylinderGeometry(rimRadius * 0.70, rimRadius * 0.70, 0.055, 24), new THREE.MeshStandardMaterial({ color: 0x8e9398, roughness: 0.38, metalness: 0.84 }));
  brakeDisc.rotation.z = Math.PI / 2;
  brakeDisc.position.x = x > 0 ? width * 0.16 : -width * 0.16;
  spin.add(brakeDisc);

  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.075, rimRadius * 0.46, 0.12), new THREE.MeshStandardMaterial({ color: accentCaliper, roughness: 0.35, metalness: 0.35 }));
  caliper.position.set(x > 0 ? width * 0.12 : -width * 0.12, 0.02, rimRadius * 0.56);
  steerPivot.add(caliper);

  root.add(steerPivot);
  return tire;
}

function addDoorDetails(root: THREE.Group, width: number, wheelFrontZ: number, wheelRearZ: number, twoDoor = false): void {
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.45, metalness: 0.25 });
  const sides = [-1, 1];
  for (const side of sides) {
    const x = side * (width / 2 + 0.012);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, Math.abs(wheelFrontZ - wheelRearZ) * 0.92), dark);
    line.position.set(x, 0.90, (wheelFrontZ + wheelRearZ) * 0.5);
    root.add(line);

    const doorZs = twoDoor ? [(wheelFrontZ + wheelRearZ) * 0.5] : [0.46, -0.62];
    doorZs.forEach((z) => {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.52, 0.018), dark);
      seam.position.set(x, 0.72, z);
      root.add(seam);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.045, 0.24), vehicleGlossBlack());
      handle.position.set(x + side * 0.012, 0.96, z - 0.20);
      root.add(handle);
    });
  }
}

function addMirrors(root: THREE.Group, width: number, z: number, y: number, mStyle = false): void {
  const mirrorMat = vehicleGlossBlack();
  for (const side of [-1, 1]) {
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.16), mirrorMat);
    stem.position.set(side * (width / 2 + 0.04), y - 0.05, z);
    const housingGeo = new THREE.SphereGeometry(mStyle ? 0.16 : 0.15, 10, 7);
    housingGeo.scale(1.35, 0.52, 0.76);
    const housing = new THREE.Mesh(housingGeo, mirrorMat);
    housing.position.set(side * (width / 2 + 0.18), y, z - 0.02);
    if (mStyle) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 5), mirrorMat);
      horn.rotation.z = side * Math.PI / 2;
      horn.position.set(side * (width / 2 + 0.29), y + 0.05, z - 0.01);
      root.add(horn);
    }
    root.add(stem, housing);
  }
}

function addSedanInterior(root: THREE.Group, width: number, frontSeatZ: number, rearSeatZ: number, mStyle = false): void {
  const leather = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.66, metalness: 0.04 });
  const leatherAccent = new THREE.MeshStandardMaterial({ color: mStyle ? 0x332126 : 0x292b2e, roughness: 0.62, metalness: 0.03 });
  const trim = mStyle ? vehicleCarbon() : new THREE.MeshStandardMaterial({ color: 0x5d6268, roughness: 0.30, metalness: 0.64 });

  const dash = new THREE.Mesh(new THREE.BoxGeometry(width * 0.78, 0.16, 0.44), leather);
  dash.position.set(0, 1.03, 0.66);
  root.add(dash);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.22, 0.035), new THREE.MeshStandardMaterial({ color: 0x0c1821, emissive: 0x18384e, emissiveIntensity: 0.55, roughness: 0.2 }));
  screen.position.set(0.18, 1.17, 0.47);
  screen.rotation.x = -0.12;
  root.add(screen);

  const console = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 1.18), trim);
  console.position.set(0, 0.74, 0.02);
  root.add(console);

  for (const x of [-0.43, 0.43]) {
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.69, 0.20), leatherAccent);
    seatBack.position.set(x, 0.91, frontSeatZ - 0.12);
    seatBack.rotation.x = -0.09;
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.62), leather);
    seatBase.position.set(x, 0.57, frontSeatZ + 0.05);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.25, 0.16), leatherAccent);
    head.position.set(x, 1.31, frontSeatZ - 0.16);
    root.add(seatBack, seatBase, head);
  }
  const rearBench = new THREE.Mesh(new THREE.BoxGeometry(width * 0.70, 0.18, 0.62), leather);
  rearBench.position.set(0, 0.57, rearSeatZ);
  const rearBack = new THREE.Mesh(new THREE.BoxGeometry(width * 0.70, 0.56, 0.18), leatherAccent);
  rearBack.position.set(0, 0.86, rearSeatZ - 0.24);
  rearBack.rotation.x = -0.08;
  root.add(rearBench, rearBack);

  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.035, 7, 16), leather);
  steering.position.set(-0.42, 1.06, 0.43);
  steering.rotation.x = -0.22;
  root.add(steering);
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), trim);
  wheelHub.rotation.x = Math.PI / 2;
  wheelHub.position.set(-0.42, 1.06, 0.43);
  root.add(wheelHub);

  const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.18, 0.03), new THREE.MeshStandardMaterial({ color: 0x08131d, emissive: mStyle ? 0x4e1d1d : 0x16344f, emissiveIntensity: 0.55 }));
  cluster.position.set(-0.42, 1.18, 0.53);
  root.add(cluster);
}

function addTwoSeatInterior(root: THREE.Group, width: number, frontSeatZ: number, italian = false): void {
  const leather = new THREE.MeshStandardMaterial({ color: italian ? 0x321616 : 0x111316, roughness: 0.55, metalness: 0.03 });
  const trim = vehicleCarbon();
  const dash = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.17, 0.42), leather);
  dash.position.set(0, 0.91, 0.54);
  root.add(dash);
  for (const x of [-0.38, 0.38]) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.60, 0.19), leather);
    back.position.set(x, 0.80, frontSeatZ - 0.10);
    back.rotation.x = -0.14;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 0.58), leather);
    base.position.set(x, 0.48, frontSeatZ + 0.04);
    root.add(back, base);
  }
  const console = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.17, 0.98), trim);
  console.position.set(0, 0.61, frontSeatZ + 0.12);
  root.add(console);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 7, 14), leather);
  steering.position.set(-0.38, 0.97, 0.37);
  steering.rotation.x = -0.22;
  root.add(steering);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.03), new THREE.MeshStandardMaterial({ color: 0x08151c, emissive: 0x15344a, emissiveIntensity: 0.5 }));
  screen.position.set(0.16, 1.04, 0.38);
  root.add(screen);
}

function addBMWHeadlight(
  root: THREE.Group,
  side: number,
  z: number,
  y: number,
  width: number,
  height: number,
  lci = false,
  g80 = false
): void {
  const x = side * 0.60;
  const lensPoints: Array<[number, number]> = g80
    ? [[x - side * width * 0.52, y - height * 0.30], [x + side * width * 0.48, y - height * 0.25], [x + side * width * 0.55, y + height * 0.28], [x - side * width * 0.42, y + height * 0.34]]
    : [[x - side * width * 0.52, y - height * 0.32], [x + side * width * 0.50, y - height * 0.24], [x + side * width * 0.44, y + height * 0.34], [x - side * width * 0.40, y + height * 0.30]];
  const lens = makeFacePanel(lensPoints, z, vehicleGlass(0xd5e9f2, 0.42), 'headlight_lens', 0.026);
  lens.userData.lightRole = 'headlight';
  root.add(lens);

  // Separate projector / laser modules sit behind the clear lens so the lamp is
  // not one flat glowing polygon.
  const projectorMat = new THREE.MeshStandardMaterial({ color: 0x9aa7ad, emissive: 0x8ec7df, emissiveIntensity: 0.45, roughness: 0.12, metalness: 0.72 });
  for (const local of [-0.15, 0.15]) {
    const projector = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.16, height * 0.16, 0.035, 14), projectorMat);
    projector.rotation.x = Math.PI / 2;
    projector.position.set(x + side * local, y + 0.005, z + 0.045);
    root.add(projector);
  }
  if (lci) {
    const laserAccent = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.016), new THREE.MeshBasicMaterial({ color: 0x4ab6ef }));
    laserAccent.position.set(x + side * 0.03, y + height * 0.18, z + 0.058);
    root.add(laserAccent);
  }

  const drlMat = vehicleLight(0xf6fbff, 0xcdeeff, 2.6, false);
  if (lci) {
    addTubeLine(root, [
      new THREE.Vector3(x - side * width * 0.31, y + height * 0.16, z + 0.035),
      new THREE.Vector3(x - side * width * 0.10, y - height * 0.05, z + 0.038),
      new THREE.Vector3(x + side * width * 0.20, y - height * 0.04, z + 0.038),
    ], 0.018, drlMat, 'headlight_drl');
    addTubeLine(root, [
      new THREE.Vector3(x + side * width * 0.08, y + height * 0.17, z + 0.039),
      new THREE.Vector3(x + side * width * 0.26, y - height * 0.01, z + 0.039),
      new THREE.Vector3(x + side * width * 0.38, y - height * 0.01, z + 0.039),
    ], 0.015, drlMat, 'headlight_drl');
  } else {
    for (const dx of [-0.18, 0.16]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(height * 0.22, 0.018, 5, 14), drlMat);
      ring.position.set(x + side * dx, y, z + 0.042);
      root.add(ring);
    }
  }
}

function addBMWTaillight(root: THREE.Group, side: number, z: number, y: number, lci = false): void {
  const x = side * 0.63;
  const redLens = vehicleLight(0x8e0f16, 0xff1f2b, 0.70, true);
  const lens = makeFacePanel([
    [x - side * 0.46, y - 0.15], [x + side * 0.43, y - 0.12], [x + side * 0.50, y + 0.15], [x - side * 0.34, y + 0.18],
  ], z, redLens, 'brake_light', 0.024);
  lens.userData.lightRole = 'brake';
  root.add(lens);
  const lightBar = vehicleLight(0xff3948, 0xff2030, 2.0, false);
  const barPoints = lci
    ? [new THREE.Vector3(x - side * 0.33, y + 0.09, z - 0.028), new THREE.Vector3(x + side * 0.15, y + 0.08, z - 0.03), new THREE.Vector3(x + side * 0.32, y - 0.02, z - 0.03)]
    : [new THREE.Vector3(x - side * 0.30, y + 0.06, z - 0.028), new THREE.Vector3(x + side * 0.16, y + 0.05, z - 0.03), new THREE.Vector3(x + side * 0.28, y - 0.06, z - 0.03)];
  addTubeLine(root, barPoints, 0.018, lightBar, 'tail_led');
}

function addReverseLight(root: THREE.Group, x: number, y: number, z: number): void {
  const mat = vehicleLight(0xd8e7ec, 0xdff8ff, 0.18, true);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.025), mat);
  lamp.position.set(x, y, z);
  lamp.userData.lightRole = 'reverse';
  root.add(lamp);
}

function addBMWCommonSideDetails(root: THREE.Group, spec: HeroCarSpec, g80 = false): void {
  addDoorDetails(root, spec.width, spec.frontAxleZ, spec.rearAxleZ, false);
  addMirrors(root, spec.width, 0.62, spec.height * 0.78, true);
  const side = spec.width / 2 + 0.025;
  for (const s of [-1, 1]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 2.45), vehicleGlossBlack());
    sill.position.set(s * side, 0.35, -0.05);
    root.add(sill);

    const gill = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, g80 ? 0.42 : 0.34), vehicleGlossBlack());
    gill.position.set(s * (side + 0.01), 0.86, spec.frontAxleZ - 0.52);
    root.add(gill);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.075, 0.22), vehicleGlossBlack());
    badge.position.set(s * (side + 0.022), 0.91, spec.frontAxleZ - 0.52);
    root.add(badge);
    const stripeColors = [0x4aa3df, 0x3157a5, 0xe33a46];
    stripeColors.forEach((color, i) => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.052, 0.035), new THREE.MeshBasicMaterial({ color }));
      stripe.position.set(s * (side + 0.040), 0.91, spec.frontAxleZ - 0.59 + i * 0.043);
      root.add(stripe);
    });
  }
}

function addHeroWindows(root: THREE.Group, spec: HeroCarSpec): void {
  const glass = vehicleGlass(spec.bodyStyle === 'aventador' ? 0x607b89 : 0x789baa, 0.34);
  const sideX = spec.width * 0.43 + 0.012;
  for (const side of [-1, 1]) {
    const front = makeSidePanel(spec.frontWindow, side * sideX, glass, 'front_side_glass');
    root.add(front);
    if (spec.rearWindow) root.add(makeSidePanel(spec.rearWindow, side * sideX, glass, 'rear_side_glass'));
    if (spec.rearSideWindow) root.add(makeSidePanel(spec.rearSideWindow, side * sideX, glass, 'quarter_glass'));
  }
}

function addSimplifiedHeroLOD(root: THREE.Group, spec: HeroCarSpec): void {
  // Detailed geometry is kept close to the player. Medium/far shells preserve the
  // exact silhouette but drop badges, interior trim, brake hardware and light internals.
  const detailChildren = [...root.children];
  const near = new THREE.Group();
  near.name = `${spec.id}_near_detail`;
  detailChildren.forEach((child) => near.add(child));

  const paint = vehiclePaint(spec.color);
  const medium = new THREE.Group();
  medium.name = `${spec.id}_medium_lod`;
  medium.add(makeSideProfileVolume(spec.bodyProfile, spec.width, paint, 0.04, 'medium_body'));
  medium.add(makeSideProfileVolume(spec.glassProfile, spec.width * 0.84, vehicleGlass(0x718d9b, 0.42), 0.025, 'medium_glass'));
  const rearRadius = spec.rearWheelRadius ?? spec.wheelRadius;
  const rearWidth = spec.rearWheelWidth ?? spec.wheelWidth;
  for (const side of [-1, 1]) {
    const frontTire = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, spec.wheelWidth, 14), vehicleRubber());
    frontTire.rotation.z = Math.PI / 2;
    frontTire.position.set(side * (spec.width / 2 - spec.wheelWidth * 0.49), spec.wheelRadius, spec.frontAxleZ);
    medium.add(frontTire);
    const rearTire = new THREE.Mesh(new THREE.CylinderGeometry(rearRadius, rearRadius, rearWidth, 14), vehicleRubber());
    rearTire.rotation.z = Math.PI / 2;
    rearTire.position.set(side * (spec.width / 2 - rearWidth * 0.49), rearRadius, spec.rearAxleZ);
    medium.add(rearTire);
  }

  const far = new THREE.Group();
  far.name = `${spec.id}_far_lod`;
  far.add(makeSideProfileVolume(spec.bodyProfile, spec.width, paint, 0.025, 'far_body'));
  far.add(makeSideProfileVolume(spec.glassProfile, spec.width * 0.82, new THREE.MeshStandardMaterial({ color: 0x263944, roughness: 0.42, metalness: 0.20 }), 0.015, 'far_glass'));
  for (const side of [-1, 1]) {
    const frontDisc = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheelRadius * 0.94, spec.wheelRadius * 0.94, 0.16, 10), vehicleMatteBlack());
    frontDisc.rotation.z = Math.PI / 2;
    frontDisc.position.set(side * (spec.width / 2 - 0.08), spec.wheelRadius, spec.frontAxleZ);
    far.add(frontDisc);
    const rearDisc = new THREE.Mesh(new THREE.CylinderGeometry(rearRadius * 0.94, rearRadius * 0.94, 0.16, 10), vehicleMatteBlack());
    rearDisc.rotation.z = Math.PI / 2;
    rearDisc.position.set(side * (spec.width / 2 - 0.08), rearRadius, spec.rearAxleZ);
    far.add(rearDisc);
  }

  const lod = new THREE.LOD();
  lod.addLevel(near, 0);
  lod.addLevel(medium, 60);
  lod.addLevel(far, 120);
  lod.autoUpdate = true;
  root.add(lod);
}

function collectVehicleVisualNodes(root: THREE.Group): void {
  const nodes: VehicleVisualNodes = { wheelSpins: [], wheelSteers: [], brakeLights: [], reverseLights: [], headlights: [] };
  root.traverse((obj) => {
    if (obj.userData.vehicleWheelSpin) nodes.wheelSpins.push(obj);
    if (obj.userData.vehicleWheelSteer) nodes.wheelSteers.push(obj);
    if (obj instanceof THREE.Mesh) {
      if (obj.userData.lightRole === 'brake' || obj.name === 'brake_light') nodes.brakeLights.push(obj);
      if (obj.userData.lightRole === 'reverse') nodes.reverseLights.push(obj);
      if (obj.userData.lightRole === 'headlight' || obj.name === 'headlight_lens') nodes.headlights.push(obj);
    }
  });
  root.userData.vehicleVisualNodes = nodes;
  root.userData.isDetailedVehicle = true;
}

function buildHeroCar(spec: HeroCarSpec): { mesh: THREE.Group; wheels: THREE.Mesh[] } {
  const root = new THREE.Group();
  root.name = spec.id;
  root.userData.vehicleModelType = spec.id;
  root.userData.realWorldDimensions = { length: spec.length, width: spec.width, height: spec.height };

  const paint = vehiclePaint(spec.color);
  const black = vehicleGlossBlack();
  const carbon = vehicleCarbon();

  const body = makeSideProfileVolume(spec.bodyProfile, spec.width, paint, 0.06, `${spec.id}_body`);
  root.add(body);

  // Transparent greenhouse volume means the cabin is genuinely visible through the
  // windows instead of being represented by an opaque black box.
  const greenhouse = makeSideProfileVolume(spec.glassProfile, spec.width * 0.84, vehicleGlass(spec.bodyStyle === 'aventador' ? 0x526b77 : 0x7796a4, 0.31), 0.03, `${spec.id}_greenhouse`);
  greenhouse.renderOrder = 4;
  root.add(greenhouse);
  addHeroWindows(root, spec);

  const roofMat = spec.carbonRoof ? carbon : paint;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.70, 0.055, spec.twoDoor ? 1.10 : 1.48), roofMat);
  roof.position.set(0, spec.height - 0.035, spec.twoDoor ? -0.24 : -0.34);
  roof.rotation.x = spec.bodyStyle === 'aventador' ? -0.045 : 0;
  root.add(roof);

  // Painted pillars sit over the glass and create recognisable window proportions.
  const pillarMat = spec.carbonRoof ? carbon : black;
  const pillarPositions = spec.twoDoor ? [0.55, -0.92] : [0.55, -0.38, -1.18];
  for (const side of [-1, 1]) {
    pillarPositions.forEach((z, i) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.045, spec.twoDoor ? 0.47 : 0.50, i === 1 && !spec.twoDoor ? 0.085 : 0.065), pillarMat);
      pillar.position.set(side * (spec.width * 0.422), spec.height * 0.79, z);
      pillar.rotation.x = i === 0 ? -0.14 : i === pillarPositions.length - 1 ? 0.16 : 0;
      root.add(pillar);
    });
  }

  const wheels: THREE.Mesh[] = [];
  const rearWheelRadius = spec.rearWheelRadius ?? spec.wheelRadius;
  const rearWheelWidth = spec.rearWheelWidth ?? spec.wheelWidth;
  const rearRimRadius = spec.rearRimRadius ?? spec.rimRadius;
  const caliper = spec.bodyStyle === 'g80' ? 0xd6a22c : spec.bodyStyle === 'aventador' ? 0xd1a41e : spec.bodyStyle === 'f12' ? 0xd5b044 : 0x2a67b1;
  const brand: 'bmw' | 'lamborghini' | 'ferrari' = spec.bodyStyle === 'aventador' ? 'lamborghini' : spec.bodyStyle === 'f12' ? 'ferrari' : 'bmw';
  for (const side of [-1, 1]) {
    const frontWheelX = side * (spec.width / 2 - spec.wheelWidth * 0.49);
    const rearWheelX = side * (spec.width / 2 - rearWheelWidth * 0.49);
    wheels.push(buildDetailedWheel(root, frontWheelX, spec.wheelRadius, spec.frontAxleZ, spec.wheelRadius, spec.wheelWidth, spec.rimRadius, spec.rimColor, spec.spokeCount, !!spec.doubleSpoke, true, caliper, brand));
    wheels.push(buildDetailedWheel(root, rearWheelX, rearWheelRadius, spec.rearAxleZ, rearWheelRadius, rearWheelWidth, rearRimRadius, spec.rimColor, spec.spokeCount, !!spec.doubleSpoke, false, caliper, brand));
    addWheelArch(root, side * (spec.width / 2 + 0.028), spec.frontAxleZ, spec.wheelRadius, spec.wheelRadius * 1.11, paint);
    addWheelArch(root, side * (spec.width / 2 + 0.028), spec.rearAxleZ, rearWheelRadius, rearWheelRadius * 1.11, paint);
  }

  if (spec.bodyStyle === 'f80' || spec.bodyStyle === 'g80' || spec.bodyStyle === 'f90') {
    addSedanInterior(root, spec.width, 0.20, -0.88, true);
    addBMWCommonSideDetails(root, spec, spec.bodyStyle === 'g80');
  } else {
    addTwoSeatInterior(root, spec.width, -0.02, spec.bodyStyle === 'f12');
    addDoorDetails(root, spec.width, spec.frontAxleZ, spec.rearAxleZ, true);
    addMirrors(root, spec.width, 0.48, spec.height * 0.74, false);
  }

  switch (spec.bodyStyle) {
    case 'f80': {
      const frontZ = spec.length / 2 + 0.018;
      const rearZ = -spec.length / 2 - 0.018;
      // Wide F80 kidneys touch the headlamp line; lower bumper uses a centre intake
      // and Air Curtain openings rather than the later G80 vertical grille.
      addKidneyGrille(root, -0.25, 0.82, frontZ, 0.40, 0.28, false, 5);
      addKidneyGrille(root, 0.25, 0.82, frontZ, 0.40, 0.28, false, 5);
      addBMWHeadlight(root, -1, frontZ + 0.01, 0.85, 0.65, 0.27, false, false);
      addBMWHeadlight(root, 1, frontZ + 0.01, 0.85, 0.65, 0.27, false, false);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.25, 0.09), vehicleMatteBlack()); lower.position.set(0, 0.50, frontZ); root.add(lower);
      for (const side of [-1, 1]) {
        const intake = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.29, 0.08), vehicleMatteBlack()); intake.position.set(side * 0.71, 0.49, frontZ); root.add(intake);
      }
      const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.06, 0.25), carbon); splitter.position.set(0, 0.31, frontZ - 0.02); root.add(splitter);
      addBMWRoundel(root, 0, 1.04, frontZ + 0.055, 0.10);
      addIndicatorLens(root, -0.91, 0.78, frontZ + 0.065); addIndicatorLens(root, 0.91, 0.78, frontZ + 0.065);
      addBMWTaillight(root, -1, rearZ, 0.82, false); addBMWTaillight(root, 1, rearZ, 0.82, false);
      addBMWRoundel(root, 0, 0.98, rearZ - 0.035, 0.10);
      const f80Badge = makeTextBadge('M3', 0.28, 0.075); f80Badge.position.set(0.58, 0.94, rearZ - 0.062); f80Badge.rotation.y = Math.PI; root.add(f80Badge);
      addIndicatorLens(root, -0.83, 0.82, rearZ - 0.06); addIndicatorLens(root, 0.83, 0.82, rearZ - 0.06);
      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.24, 0.22), carbon); diffuser.position.set(0, 0.39, rearZ + 0.06); root.add(diffuser);
      for (const x of [-0.69, -0.49, 0.49, 0.69]) addExhaustTube(root, x, 0.35, rearZ - 0.10, 0.082, true);
      addReverseLight(root, -0.22, 0.73, rearZ - 0.04); addReverseLight(root, 0.22, 0.73, rearZ - 0.04);
      break;
    }
    case 'g80': {
      const frontZ = spec.length / 2 + 0.018;
      const rearZ = -spec.length / 2 - 0.018;
      // G80's signature is the tall, frameless double kidney occupying most of the
      // front fascia. Each half is modelled separately with real depth/slats.
      addKidneyGrille(root, -0.25, 0.67, frontZ, 0.39, 0.86, true, 6);
      addKidneyGrille(root, 0.25, 0.67, frontZ, 0.39, 0.86, true, 6);
      addBMWHeadlight(root, -1, frontZ + 0.012, 0.93, 0.63, 0.22, true, true);
      addBMWHeadlight(root, 1, frontZ + 0.012, 0.93, 0.63, 0.22, true, true);
      for (const side of [-1, 1]) {
        const intake = makeFacePanel([[side * 0.96, 0.34], [side * 0.57, 0.36], [side * 0.62, 0.72], [side * 1.00, 0.63]], frontZ, vehicleMatteBlack(), 'g80_side_intake', 0.06);
        root.add(intake);
      }
      const lip = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.055, 0.28), carbon); lip.position.set(0, 0.30, frontZ - 0.02); root.add(lip);
      addBMWRoundel(root, 0, 1.08, frontZ + 0.055, 0.10);
      addIndicatorLens(root, -0.91, 0.82, frontZ + 0.065); addIndicatorLens(root, 0.91, 0.82, frontZ + 0.065);
      addBMWTaillight(root, -1, rearZ, 0.82, true); addBMWTaillight(root, 1, rearZ, 0.82, true);
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.055, 0.24), carbon); spoiler.position.set(0, 1.02, rearZ + 0.12); root.add(spoiler);
      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.26, 0.24), carbon); diffuser.position.set(0, 0.38, rearZ + 0.06); root.add(diffuser);
      for (const x of [-0.72, -0.51, 0.51, 0.72]) addExhaustTube(root, x, 0.35, rearZ - 0.11, 0.084, true);
      addBMWRoundel(root, 0, 0.98, rearZ - 0.035, 0.10);
      const g80Badge = makeTextBadge('M3', 0.28, 0.075); g80Badge.position.set(0.59, 0.94, rearZ - 0.062); g80Badge.rotation.y = Math.PI; root.add(g80Badge);
      addIndicatorLens(root, -0.84, 0.82, rearZ - 0.06); addIndicatorLens(root, 0.84, 0.82, rearZ - 0.06);
      addReverseLight(root, -0.20, 0.72, rearZ - 0.04); addReverseLight(root, 0.20, 0.72, rearZ - 0.04);
      break;
    }
    case 'f90': {
      const frontZ = spec.length / 2 + 0.020;
      const rearZ = -spec.length / 2 - 0.020;
      // LCI M5: long bonnet, wide horizontal double kidneys, sharper laser/LED lamps,
      // three-part lower intake and black Competition exterior trim.
      addKidneyGrille(root, -0.27, 0.84, frontZ, 0.44, 0.31, false, 6);
      addKidneyGrille(root, 0.27, 0.84, frontZ, 0.44, 0.31, false, 6);
      addBMWHeadlight(root, -1, frontZ + 0.012, 0.88, 0.68, 0.24, true, false);
      addBMWHeadlight(root, 1, frontZ + 0.012, 0.88, 0.68, 0.24, true, false);
      const centreIntake = makeFacePanel([[-0.48, 0.36], [0.48, 0.36], [0.58, 0.63], [-0.58, 0.63]], frontZ, vehicleMatteBlack(), 'm5_centre_intake', 0.065); root.add(centreIntake);
      for (const side of [-1, 1]) {
        const intake = makeFacePanel([[side * 0.98, 0.35], [side * 0.60, 0.37], [side * 0.65, 0.69], [side * 1.00, 0.63]], frontZ, vehicleMatteBlack(), 'm5_side_intake', 0.065);
        root.add(intake);
        const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.025), vehicleLight(0xc8211e, 0x6a0c0a, 0.2));
        reflector.position.set(side * 0.90, 0.50, rearZ - 0.03); root.add(reflector);
      }
      const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.055, 0.30), carbon); splitter.position.set(0, 0.30, frontZ - 0.02); root.add(splitter);
      addBMWRoundel(root, 0, 1.07, frontZ + 0.060, 0.105);
      addMBadge(root, -0.05, 0.84, frontZ + 0.065, 0.55);
      addIndicatorLens(root, -0.91, 0.80, frontZ + 0.068); addIndicatorLens(root, 0.91, 0.80, frontZ + 0.068);

      addBMWTaillight(root, -1, rearZ, 0.85, true); addBMWTaillight(root, 1, rearZ, 0.85, true);
      addBMWRoundel(root, 0, 1.02, rearZ - 0.035, 0.105);
      const m5Badge = makeTextBadge('M5 COMPETITION', 0.52, 0.075); m5Badge.position.set(0.53, 0.96, rearZ - 0.064); m5Badge.rotation.y = Math.PI; root.add(m5Badge);
      addIndicatorLens(root, -0.85, 0.84, rearZ - 0.06); addIndicatorLens(root, 0.85, 0.84, rearZ - 0.06);
      const bootSpoiler = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.055, 0.23), carbon); bootSpoiler.position.set(0, 1.08, rearZ + 0.12); root.add(bootSpoiler);
      const diffuser = makeFacePanel([[-0.90, 0.29], [0.90, 0.29], [0.78, 0.58], [-0.78, 0.58]], rearZ + 0.06, carbon, 'm5_rear_diffuser', 0.11); root.add(diffuser);
      for (const x of [-0.75, -0.53, 0.53, 0.75]) addExhaustTube(root, x, 0.34, rearZ - 0.13, 0.086, true);
      addReverseLight(root, -0.20, 0.75, rearZ - 0.04); addReverseLight(root, 0.20, 0.75, rearZ - 0.04);

      // F90 bonnet shut lines / power bulges and shoulder line are physical geometry,
      // not a flat texture painted over the front half of the car.
      for (const x of [-0.46, 0.46]) {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.022, 1.48), paint);
        ridge.position.set(x, 1.055, 1.48);
        ridge.rotation.x = -0.018;
        root.add(ridge);
      }
      for (const side of [-1, 1]) {
        const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.028, 3.22), new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.14, metalness: 0.82 }));
        shoulder.position.set(side * (spec.width / 2 + 0.018), 0.98, -0.05);
        root.add(shoulder);
      }
      break;
    }
    case 'aventador': {
      const frontZ = spec.length / 2 + 0.02;
      const rearZ = -spec.length / 2 - 0.02;
      // Aventador's defining wedge is reinforced by a low pointed nose, Y-shaped
      // lamps, huge side intakes and a single central hexagonal exhaust outlet.
      const nose = makeFacePanel([[-0.94, 0.36], [0.94, 0.36], [0.72, 0.65], [0, 0.76], [-0.72, 0.65]], frontZ, paint, 'aventador_nose', 0.10); root.add(nose);
      for (const side of [-1, 1]) {
        const lens = makeFacePanel([[side * 0.92, 0.53], [side * 0.45, 0.58], [side * 0.28, 0.72], [side * 0.78, 0.70]], frontZ + 0.07, vehicleGlass(0xd9eef3, 0.40), 'headlight_lens', 0.025);
        lens.userData.lightRole = 'headlight'; root.add(lens);
        const yMat = vehicleLight(0xf9fdff, 0xdaf8ff, 2.7, false);
        addTubeLine(root, [new THREE.Vector3(side * 0.72, 0.65, frontZ + 0.10), new THREE.Vector3(side * 0.56, 0.60, frontZ + 0.105), new THREE.Vector3(side * 0.46, 0.67, frontZ + 0.105)], 0.018, yMat, 'aventador_y_drl');
        addTubeLine(root, [new THREE.Vector3(side * 0.56, 0.60, frontZ + 0.105), new THREE.Vector3(side * 0.60, 0.71, frontZ + 0.105)], 0.018, yMat, 'aventador_y_drl');
        const sideIntake = makeSidePanel([[0.36, 0.41], [-0.68, 0.40], [-0.98, 0.80], [-0.16, 0.76]], side * (spec.width / 2 + 0.035), vehicleMatteBlack(), 'aventador_side_intake');
        root.add(sideIntake);
      }
      addIndicatorLens(root, -0.91, 0.56, frontZ + 0.08); addIndicatorLens(root, 0.91, 0.56, frontZ + 0.08);
      const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.055, 0.36), carbon); splitter.position.set(0, 0.28, frontZ - 0.02); root.add(splitter);
      // Scissor-door cut lines.
      for (const side of [-1, 1]) {
        addTubeLine(root, [new THREE.Vector3(side * (spec.width / 2 + 0.025), 0.52, 0.75), new THREE.Vector3(side * (spec.width / 2 + 0.025), 0.90, 0.22), new THREE.Vector3(side * (spec.width / 2 + 0.025), 0.86, -0.74)], 0.008, vehicleMatteBlack(), 'scissor_door_seam');
      }
      const rearMesh = makeFacePanel([[-0.92, 0.40], [0.92, 0.40], [0.83, 0.82], [-0.83, 0.82]], rearZ, vehicleMatteBlack(), 'aventador_rear_grille', 0.07); root.add(rearMesh);
      for (const side of [-1, 1]) {
        const tail = makeFacePanel([[side * 0.87, 0.63], [side * 0.40, 0.64], [side * 0.55, 0.78], [side * 0.92, 0.76]], rearZ - 0.05, vehicleLight(0x8d1119, 0xff1b2d, 0.72, true), 'brake_light', 0.025);
        tail.userData.lightRole = 'brake'; root.add(tail);
        const yMat = vehicleLight(0xff3446, 0xff182a, 2.4, false);
        addTubeLine(root, [new THREE.Vector3(side * 0.76, 0.72, rearZ - 0.08), new THREE.Vector3(side * 0.60, 0.67, rearZ - 0.08), new THREE.Vector3(side * 0.51, 0.74, rearZ - 0.08)], 0.016, yMat, 'aventador_y_tail');
      }
      const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.34, 6, 1, true), vehicleChrome()); hex.rotation.x = Math.PI / 2; hex.position.set(0, 0.43, rearZ - 0.12); root.add(hex);
      const hexInner = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.35, 6), vehicleMatteBlack()); hexInner.rotation.x = Math.PI / 2; hexInner.position.set(0, 0.43, rearZ - 0.14); root.add(hexInner);
      const aventadorBadge = makeTextBadge('AVENTADOR', 0.46, 0.065); aventadorBadge.position.set(0, 0.86, rearZ - 0.068); aventadorBadge.rotation.y = Math.PI; root.add(aventadorBadge);
      addIndicatorLens(root, -0.83, 0.69, rearZ - 0.07); addIndicatorLens(root, 0.83, 0.69, rearZ - 0.07);
      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.12, 0.32), carbon); diffuser.position.set(0, 0.26, rearZ + 0.02); root.add(diffuser);
      addReverseLight(root, 0, 0.60, rearZ - 0.07);
      break;
    }
    case 'f12': {
      const frontZ = spec.length / 2 + 0.02;
      const rearZ = -spec.length / 2 - 0.02;
      // F12berlinetta: long front-engined bonnet, huge central grille, swept lamps,
      // Aero Bridge channels over the front flanks, round rear lamps and quad pipes.
      const grille = makeFacePanel([[-0.72, 0.35], [0.72, 0.35], [0.87, 0.67], [-0.87, 0.67]], frontZ, vehicleMatteBlack(), 'f12_front_grille', 0.075); root.add(grille);
      const grilleBar = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.035, 0.04), vehicleChrome()); grilleBar.position.set(0, 0.54, frontZ + 0.07); root.add(grilleBar);
      for (const side of [-1, 1]) {
        const lens = makeFacePanel([[side * 0.90, 0.62], [side * 0.43, 0.68], [side * 0.33, 0.94], [side * 0.72, 0.99]], frontZ + 0.05, vehicleGlass(0xd7edf3, 0.40), 'headlight_lens', 0.025);
        lens.userData.lightRole = 'headlight'; root.add(lens);
        addTubeLine(root, [new THREE.Vector3(side * 0.76, 0.73, frontZ + 0.08), new THREE.Vector3(side * 0.52, 0.79, frontZ + 0.08), new THREE.Vector3(side * 0.45, 0.90, frontZ + 0.08)], 0.014, vehicleLight(0xf8fcff, 0xe0f5ff, 2.2, false), 'f12_drl');
        const aeroBridge = makeSidePanel([[1.40, 0.91], [0.88, 0.92], [0.49, 0.67], [1.12, 0.70]], side * (spec.width / 2 + 0.035), vehicleMatteBlack(), 'f12_aero_bridge');
        root.add(aeroBridge);
      }
      addIndicatorLens(root, -0.89, 0.66, frontZ + 0.075); addIndicatorLens(root, 0.89, 0.66, frontZ + 0.075);
      const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.12, 0.025), new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.24, metalness: 0.30 })); emblem.position.set(0, 0.80, frontZ + 0.08); root.add(emblem);
      // Ferrari's F12 rear is immediately recognisable by the two single round lamps.
      for (const side of [-1, 1]) {
        const tailMat = vehicleLight(0xb2101b, 0xff1f32, 0.75, true);
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.045, 22), tailMat); tail.rotation.x = Math.PI / 2; tail.position.set(side * 0.66, 0.78, rearZ - 0.04); tail.userData.lightRole = 'brake'; tail.name = 'brake_light'; root.add(tail);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 6, 20), vehicleLight(0xff3548, 0xff172c, 2.2, false)); ring.position.set(side * 0.66, 0.78, rearZ - 0.08); root.add(ring);
      }
      const f12Badge = makeTextBadge('F12berlinetta', 0.46, 0.065); f12Badge.position.set(0.40, 0.91, rearZ - 0.068); f12Badge.rotation.y = Math.PI; root.add(f12Badge);
      addIndicatorLens(root, -0.87, 0.74, rearZ - 0.07); addIndicatorLens(root, 0.87, 0.74, rearZ - 0.07);
      const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.18, 0.07), vehicleMatteBlack()); rearPanel.position.set(0, 0.49, rearZ); root.add(rearPanel);
      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.15, 0.32), carbon); diffuser.position.set(0, 0.27, rearZ + 0.01); root.add(diffuser);
      for (const x of [-0.76, -0.56, 0.56, 0.76]) addExhaustTube(root, x, 0.38, rearZ - 0.11, 0.078, false);
      addReverseLight(root, 0, 0.52, rearZ - 0.06);
      break;
    }
  }

  addSimplifiedHeroLOD(root, spec);
  collectVehicleVisualNodes(root);
  return { mesh: root, wheels };
}

// 1. BMW F80 M3 (2014-era sedan proportions; Yas Marina Blue)
export function createBMWF80M3Model(): { mesh: THREE.Group; wheels: THREE.Mesh[] } {
  return buildHeroCar({
    id: 'bmw_f80_m3', bodyStyle: 'f80', color: 0x3c8fd3,
    length: 4.67, width: 1.88, height: 1.43,
    frontAxleZ: 1.43, rearAxleZ: -1.38,
    wheelRadius: 0.37, wheelWidth: 0.29, rimRadius: 0.285, rimColor: 0x313337,
    spokeCount: 5, doubleSpoke: true, carbonRoof: true,
    bodyProfile: [[2.34,0.34],[2.32,0.72],[2.07,0.90],[1.42,1.02],[0.72,1.05],[-0.76,1.05],[-1.56,1.00],[-2.18,0.82],[-2.34,0.54],[-2.29,0.32],[-1.82,0.29],[1.88,0.29]],
    glassProfile: [[0.72,1.02],[0.33,1.34],[-0.88,1.36],[-1.35,1.04]],
    frontWindow: [[0.64,1.06],[0.30,1.31],[-0.35,1.32],[-0.34,1.06]],
    rearWindow: [[-0.40,1.06],[-0.40,1.32],[-0.90,1.33],[-1.28,1.06]],
  });
}

// 2. BMW G80 M3 Competition xDrive (Isle of Man Green; vertical kidneys)
export function createBMWG80M3Model(): { mesh: THREE.Group; wheels: THREE.Mesh[] } {
  return buildHeroCar({
    id: 'bmw_g80_m3', bodyStyle: 'g80', color: 0x245c3a,
    length: 4.79, width: 1.90, height: 1.44,
    frontAxleZ: 1.46, rearAxleZ: -1.40,
    wheelRadius: 0.365, rearWheelRadius: 0.377, wheelWidth: 0.29, rearWheelWidth: 0.30, rimRadius: 0.282, rearRimRadius: 0.294, rimColor: 0xb18a44,
    spokeCount: 5, doubleSpoke: true, carbonRoof: true,
    bodyProfile: [[2.40,0.33],[2.39,0.73],[2.12,0.92],[1.49,1.03],[0.77,1.06],[-0.75,1.06],[-1.62,1.01],[-2.25,0.82],[-2.40,0.54],[-2.35,0.31],[-1.83,0.29],[1.92,0.29]],
    glassProfile: [[0.72,1.03],[0.31,1.36],[-0.89,1.38],[-1.39,1.04]],
    frontWindow: [[0.64,1.07],[0.29,1.33],[-0.35,1.34],[-0.34,1.07]],
    rearWindow: [[-0.41,1.07],[-0.42,1.34],[-0.92,1.35],[-1.31,1.07]],
  });
}

// 3. BMW F90 LCI M5 Competition (Marina Bay Blue; hero priority)
export function createBMWF90M5Model(): { mesh: THREE.Group; wheels: THREE.Mesh[] } {
  return buildHeroCar({
    id: 'bmw_f90_m5', bodyStyle: 'f90', color: 0x164b92,
    length: 4.97, width: 1.90, height: 1.47,
    frontAxleZ: 1.54, rearAxleZ: -1.44,
    wheelRadius: 0.375, rearWheelRadius: 0.382, wheelWidth: 0.30, rearWheelWidth: 0.31, rimRadius: 0.294, rearRimRadius: 0.300, rimColor: 0x34373a,
    spokeCount: 5, doubleSpoke: true, carbonRoof: true,
    bodyProfile: [[2.49,0.34],[2.48,0.73],[2.22,0.91],[1.61,1.04],[0.83,1.08],[-0.79,1.08],[-1.69,1.02],[-2.30,0.85],[-2.49,0.56],[-2.44,0.32],[-1.88,0.29],[2.00,0.29]],
    glassProfile: [[0.78,1.05],[0.35,1.40],[-0.93,1.42],[-1.47,1.05]],
    frontWindow: [[0.69,1.09],[0.33,1.37],[-0.35,1.38],[-0.34,1.09]],
    rearWindow: [[-0.41,1.09],[-0.42,1.38],[-0.98,1.39],[-1.38,1.09]],
  });
}

// 4. Lamborghini Aventador LP700-4-style wedge (Giallo Orion)
export function createLamborghiniAventadorModel(): { mesh: THREE.Group; wheels: THREE.Mesh[] } {
  return buildHeroCar({
    id: 'lamborghini_aventador', bodyStyle: 'aventador', color: 0xf0c400,
    length: 4.78, width: 2.03, height: 1.14,
    frontAxleZ: 1.39, rearAxleZ: -1.31,
    wheelRadius: 0.370, rearWheelRadius: 0.392, wheelWidth: 0.30, rearWheelWidth: 0.34, rimRadius: 0.282, rearRimRadius: 0.305, rimColor: 0x17191c,
    spokeCount: 5, doubleSpoke: true, carbonRoof: false, twoDoor: true,
    bodyProfile: [[2.39,0.30],[2.30,0.55],[1.58,0.74],[0.76,0.83],[0.22,0.87],[-0.66,0.87],[-1.30,0.78],[-2.20,0.65],[-2.39,0.43],[-2.32,0.28],[-1.74,0.26],[1.91,0.26]],
    glassProfile: [[0.64,0.78],[0.22,1.06],[-0.64,1.07],[-1.08,0.80]],
    frontWindow: [[0.58,0.81],[0.20,1.02],[-0.34,1.03],[-0.37,0.82]],
    rearSideWindow: [[-0.43,0.82],[-0.44,1.02],[-0.68,1.02],[-1.00,0.82]],
  });
}

// 5. Ferrari F12berlinetta (Rosso Corsa; front-engined V12 proportions)
export function createFerrariF12Model(): { mesh: THREE.Group; wheels: THREE.Mesh[] } {
  return buildHeroCar({
    id: 'ferrari_f12', bodyStyle: 'f12', color: 0xc80e18,
    length: 4.62, width: 1.94, height: 1.27,
    frontAxleZ: 1.34, rearAxleZ: -1.38,
    wheelRadius: 0.368, rearWheelRadius: 0.374, wheelWidth: 0.29, rearWheelWidth: 0.31, rimRadius: 0.284, rearRimRadius: 0.288, rimColor: 0xc8c8c8,
    spokeCount: 5, doubleSpoke: true, carbonRoof: false, twoDoor: true,
    bodyProfile: [[2.31,0.31],[2.28,0.65],[1.91,0.86],[1.17,0.97],[0.55,1.01],[-0.55,1.00],[-1.28,0.91],[-2.08,0.74],[-2.31,0.48],[-2.26,0.30],[-1.70,0.27],[1.82,0.27]],
    glassProfile: [[0.52,0.96],[0.12,1.20],[-0.66,1.21],[-1.09,0.96]],
    frontWindow: [[0.46,0.99],[0.10,1.17],[-0.36,1.18],[-0.38,0.99]],
    rearSideWindow: [[-0.44,0.99],[-0.46,1.17],[-0.68,1.16],[-1.00,0.98]],
  });
}

// 6. Photorealistic DeLorean DMC-12 Time Machine (Back to the Future 1.21 GW Edition)
export function createDeLoreanTimeMachineModel(): { mesh: THREE.Group; wheels: THREE.Mesh[] } {
  const car = buildHeroCar({
    id: 'delorean_time_machine', bodyStyle: 'aventador', color: 0xd2d7df,
    length: 4.27, width: 1.85, height: 1.14,
    frontAxleZ: 1.21, rearAxleZ: -1.21,
    wheelRadius: 0.350, rearWheelRadius: 0.370, wheelWidth: 0.28, rearWheelWidth: 0.32, rimRadius: 0.270, rearRimRadius: 0.290, rimColor: 0x94a3b8,
    spokeCount: 15, doubleSpoke: false, carbonRoof: false, twoDoor: true,
    bodyProfile: [[2.13,0.31],[2.08,0.52],[1.45,0.68],[0.72,0.76],[0.20,0.80],[-0.60,0.80],[-1.20,0.74],[-1.95,0.62],[-2.13,0.42],[-2.08,0.28],[-1.60,0.26],[1.75,0.26]],
    glassProfile: [[0.58,0.76],[0.20,1.02],[-0.58,1.03],[-0.98,0.78]],
    frontWindow: [[0.52,0.79],[0.18,0.99],[-0.30,1.00],[-0.34,0.80]],
    rearSideWindow: [[-0.38,0.80],[-0.40,0.99],[-0.62,0.99],[-0.92,0.80]],
  });

  const root = car.mesh;

  // Materials for Photorealistic BTTF DeLorean Finish
  const brushedSteel = new THREE.MeshStandardMaterial({
    color: 0xc4c9d2,
    metalness: 0.96,
    roughness: 0.16,
    envMapIntensity: 1.5,
  });
  const blackPlastics = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.82 });
  const neonCyanFlux = new THREE.MeshStandardMaterial({
    color: 0x00d8ff,
    emissive: 0x00c8ff,
    emissiveIntensity: 2.2,
    roughness: 0.1,
  });
  const goldEmissive = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffaa00,
    emissiveIntensity: 2.0,
  });
  const whiteMrFusion = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.1 });
  const chromeDetails = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.98, roughness: 0.08 });
  const ledRed = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const ledGreen = new THREE.MeshBasicMaterial({ color: 0x22ff22 });
  const ledAmber = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

  // Apply brushed stainless steel finish to body parts
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      if (obj.name.includes('body')) {
        obj.material = brushedSteel;
      }
    }
  });

  // 1. DMC Front Grille & Quad Headlights
  const grilleGroup = new THREE.Group();
  grilleGroup.name = 'delorean_dmc_grille';
  const grilleBg = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.22, 0.06), blackPlastics);
  grilleBg.position.set(0, 0.52, 2.12);
  grilleGroup.add(grilleBg);

  const dmcBadge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.08), chromeDetails);
  dmcBadge.position.set(0, 0.52, 2.14);
  grilleGroup.add(dmcBadge);

  [-1, 1].forEach((side) => {
    [0.52, 0.72].forEach((xOff) => {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.04), new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xe0f2fe,
        emissiveIntensity: 1.8,
        roughness: 0.05,
      }));
      headlight.position.set(side * xOff, 0.52, 2.14);
      grilleGroup.add(headlight);
    });

    const blinker = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.04), new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 1.2,
    }));
    blinker.position.set(side * 0.62, 0.34, 2.12);
    grilleGroup.add(blinker);
  });
  root.add(grilleGroup);

  // 2. Exterior Time Machine Blue Conduit Cables & Flux Coils
  const conduits = new THREE.Group();
  conduits.name = 'delorean_flux_conduits';

  [-1, 1].forEach((side) => {
    const sideTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.8, 8), neonCyanFlux);
    sideTube.rotation.x = Math.PI / 2;
    sideTube.position.set(side * 0.91, 0.38, 0);
    conduits.add(sideTube);

    const frontArch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 12, Math.PI), neonCyanFlux);
    frontArch.rotation.y = Math.PI / 2;
    frontArch.position.set(side * 0.92, 0.38, 1.21);
    conduits.add(frontArch);

    const rearArch = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.02, 6, 12, Math.PI), neonCyanFlux);
    rearArch.rotation.y = Math.PI / 2;
    rearArch.position.set(side * 0.92, 0.38, -1.21);
    conduits.add(rearArch);
  });

  const frontCoil = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.76, 8), neonCyanFlux);
  frontCoil.rotation.z = Math.PI / 2;
  frontCoil.position.set(0, 0.36, 2.08);
  conduits.add(frontCoil);

  const rearCoil = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.76, 8), neonCyanFlux);
  rearCoil.rotation.z = Math.PI / 2;
  rearCoil.position.set(0, 0.38, -2.08);
  conduits.add(rearCoil);
  root.add(conduits);

  // 3. Rear Deck Twin Reactor Exhaust Vents & Mr. Fusion
  const reactorGroup = new THREE.Group();
  reactorGroup.name = 'delorean_time_reactor';

  [-1, 1].forEach((side) => {
    const ventBody = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.65), blackPlastics);
    ventBody.position.set(side * 0.52, 0.88, -1.72);
    ventBody.rotation.x = -0.15;

    const ventInterior = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.36), neonCyanFlux);
    ventInterior.position.set(side * 0.52, 0.88, -2.04);
    ventInterior.rotation.y = Math.PI;

    reactorGroup.add(ventBody, ventInterior);
  });

  const mrFusionBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.35, 12), whiteMrFusion);
  mrFusionBase.position.set(0, 1.05, -1.25);
  const mrFusionLid = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 12), blackPlastics);
  mrFusionLid.position.set(0, 1.24, -1.25);
  const mrFusionLatch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.08), chromeDetails);
  mrFusionLatch.position.set(0, 1.20, -1.08);
  reactorGroup.add(mrFusionBase, mrFusionLid, mrFusionLatch);

  const junctionBox = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.42), chromeDetails);
  junctionBox.position.set(0, 0.82, -1.45);
  reactorGroup.add(junctionBox);
  root.add(reactorGroup);

  // 4. Cabin Interior Flux Capacitor & Time Circuits Dashboard
  const fluxCapacitorBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.12), blackPlastics);
  fluxCapacitorBox.position.set(0, 0.72, -0.42);

  const fluxYCore = new THREE.Group();
  for (let a = 0; a < 3; a++) {
    const angle = (a * 120 - 90) * (Math.PI / 180);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.10, 6), goldEmissive);
    tube.position.set(Math.cos(angle) * 0.04, Math.sin(angle) * 0.04, 0.06);
    tube.rotation.z = angle + Math.PI / 2;
    fluxYCore.add(tube);
  }
  fluxCapacitorBox.add(fluxYCore);
  root.add(fluxCapacitorBox);

  const timeCircuitsDash = new THREE.Group();
  timeCircuitsDash.position.set(0, 0.76, 0.42);
  const redLed = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.02), ledRed);
  redLed.position.y = 0.06;
  const greenLed = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.02), ledGreen);
  greenLed.position.y = 0.0;
  const amberLed = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.02), ledAmber);
  amberLed.position.y = -0.06;
  timeCircuitsDash.add(redLed, greenLed, amberLed);
  root.add(timeCircuitsDash);

  return car;
}

// Back to the Future Main Character 1: Dr. Emmett Brown (Doc Brown)
export function createDocBrownNPC(): THREE.Group {
  const root = createCameoHumanoid({
    name: 'npc_doc_brown',
    skin: 0xfce4d6, torso: 0xf8fafc, legs: 0xf1f5f9, boots: 0x1e293b,
    scale: 1.05, combatWeight: 1.0,
  });

  const whiteMat = createMaterial(0xffffff);
  const goldMat = createMaterial(0xfacc15);
  const darkMetal = createMaterial(0x334155, 0.3, 0.8);
  const antennaMat = createMaterial(0xe2e8f0, 0.1, 0.9);

  for (let i = 0; i < 9; i++) {
    const hairCluster = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 5), whiteMat);
    const angle = (i / 9) * Math.PI * 2;
    hairCluster.position.set(Math.cos(angle) * 0.28, 2.38 + Math.sin(i * 1.5) * 0.08, Math.sin(angle) * 0.28);
    hairCluster.rotation.x = Math.sin(angle) * 0.45;
    hairCluster.rotation.z = -Math.cos(angle) * 0.45;
    root.add(hairCluster);
  }

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 0.38), goldMat);
  belt.position.set(0, 1.02, 0);
  root.add(belt);

  const rcRemote = new THREE.Group();
  rcRemote.name = 'signature_prop';
  rcRemote.position.set(0.48, 1.15, 0.32);
  const rcBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.18), darkMetal);
  const rcAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 6), antennaMat);
  rcAntenna.position.set(-0.08, 0.48, 0);
  const redBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), createMaterial(0xef4444));
  redBtn.position.set(0.06, 0.12, 0.04);
  rcRemote.add(rcBox, rcAntenna, redBtn);
  root.add(rcRemote);

  return root;
}

// Back to the Future Main Character 2: Marty McFly
export function createMartyMcFlyNPC(): THREE.Group {
  const root = createCameoHumanoid({
    name: 'npc_marty_mcfly',
    skin: 0xfce4d6, torso: 0xea580c, legs: 0x1d4ed8, boots: 0xffffff, hair: 0x5c3d2e,
    scale: 0.96, combatWeight: 0.95,
  });

  const orangeVestMat = createMaterial(0xea580c);
  const denimBlueMat = createMaterial(0x2563eb);
  const pinkHoverMat = createMaterial(0xec4899);
  const yellowMat = createMaterial(0xfacc15);

  const puffyVest = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.72, 0.38), orangeVestMat);
  puffyVest.position.set(0, 1.35, 0.02);
  root.add(puffyVest);

  [-1, 1].forEach((sign) => {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.55, 8), denimBlueMat);
    sleeve.position.set(sign * 0.42, 1.28, 0);
    root.add(sleeve);
  });

  const hoverboard = new THREE.Group();
  hoverboard.name = 'signature_prop';
  hoverboard.position.set(0, 1.35, -0.28);
  hoverboard.rotation.z = -0.35;
  const boardDeck = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.04), pinkHoverMat);
  const pad1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8), yellowMat);
  pad1.position.set(0, 0.22, 0.02);
  pad1.rotation.x = Math.PI / 2;
  const pad2 = pad1.clone();
  pad2.position.set(0, -0.22, 0.02);
  hoverboard.add(boardDeck, pad1, pad2);
  root.add(hoverboard);

  return root;
}

// ----------------------------------------------------
// 4. OTHER VEHICLES — DISTINCT, CHEAPER TRAFFIC LODS
// ----------------------------------------------------
function buildSimpleWheelSet(root: THREE.Group, width: number, frontZ: number, rearZ: number, radius = 0.35, rimColor = 0xbfc2c5): void {
  const wheelWidth = 0.27;
  for (const side of [-1, 1]) {
    for (const z of [frontZ, rearZ]) {
      const steer = new THREE.Group();
      steer.position.set(side * (width / 2 - wheelWidth * 0.49), radius, z);
      steer.userData.vehicleWheelSteer = z === frontZ;
      steer.userData.baseSteerY = 0;
      const spin = new THREE.Group();
      spin.userData.vehicleWheelSpin = true;
      spin.userData.wheelRadius = radius;
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, wheelWidth, 14), vehicleRubber());
      tire.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.63, radius * 0.63, wheelWidth * 0.82, 10), new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.30, metalness: 0.72 }));
      rim.rotation.z = Math.PI / 2;
      spin.add(tire, rim);
      steer.add(spin);
      root.add(steer);
    }
  }
}

export function createPinkSedanModel(): THREE.Group {
  // Hit & Run-style Family Sedan: deliberately open-top and long/soft-edged rather
  // than a generic modern sedan recoloured pink. The old closed-roof pink car was
  // replaced so both the legacy `pink_sedan` alias and the new Simpsons vehicle ID
  // resolve to the recognisable family car.
  const root = new THREE.Group();
  root.name = 'car_simpsons_family_sedan';
  root.userData.vehicleModelType = 'simpsons_family_sedan';
  root.userData.realWorldDimensions = { length: 4.84, width: 1.92, height: 1.48 };
  root.userData.vehicleCollisionRadius = 1.82;
  root.userData.damageResistance = 1.0;
  root.userData.vehicleCollisionHeight = 2.05;
  root.userData.vehicleExitOffset = 2.35;
  root.userData.vehicleCamera = { baseDistance: 8.2, speedDistance: 3.9, height: 3.45, speedHeight: 1.55, lookHeight: 1.08 };

  const pink = vehiclePaint(0xe978a7);
  const darkerPink = new THREE.MeshStandardMaterial({ color: 0xb84f7b, roughness: 0.34, metalness: 0.42 });
  const chrome = vehicleChrome();
  const dark = vehicleMatteBlack();
  const tan = new THREE.MeshStandardMaterial({ color: 0x8a6e55, roughness: 0.78, metalness: 0.02 });

  // Broad 1970s/80s American family-car body with exaggerated Hit & Run proportions.
  root.add(makeSideProfileVolume([
    [2.42,0.31],[2.40,0.76],[1.88,0.95],[1.15,1.02],[0.70,1.00],
    [-0.92,1.00],[-1.70,0.90],[-2.42,0.66],[-2.39,0.30],[-1.82,0.27],[1.86,0.27]
  ], 1.92, pink, 0.065, 'family_sedan_body'));

  // Open cabin with a low black well; no fake opaque roof/window volume.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.58,0.34,1.76), dark);
  cabin.position.set(0,0.82,-0.18); root.add(cabin);
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.57,0.62,0.045), vehicleGlass(0x8bc1d6,0.24));
  windscreen.position.set(0,1.15,0.73); windscreen.rotation.x=-0.22; root.add(windscreen);
  const windscreenFrameTop = new THREE.Mesh(new THREE.BoxGeometry(1.68,0.055,0.065), chrome);
  windscreenFrameTop.position.set(0,1.46,0.66); root.add(windscreenFrameTop);
  for (const side of [-1,1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.055,0.65,0.065), chrome);
    frame.position.set(side*0.80,1.16,0.69); frame.rotation.x=-0.22; root.add(frame);
  }

  // Two rows of visible tan seats.
  for (const z of [0.10,-0.83]) {
    for (const x of [-0.43,0.43]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.56,0.20,0.54), tan);
      base.position.set(x,0.69,z); root.add(base);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.58,0.18), tan);
      back.position.set(x,0.94,z-0.20); back.rotation.x=-0.09; root.add(back);
    }
  }
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.48,0.20,0.37), darkerPink); dash.position.set(0,0.91,0.64); root.add(dash);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.19,0.032,8,18), dark);
  steering.position.set(-0.43,1.05,0.43); steering.rotation.x=Math.PI/2; root.add(steering);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.26,8), dark);
  column.rotation.x=Math.PI/2; column.position.set(-0.43,0.97,0.52); root.add(column);

  addDoorDetails(root, 1.92, 1.42, -1.39, false);
  addMirrors(root, 1.92, 0.63, 1.18, false);
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.94,0.16,0.20), chrome); frontBumper.position.set(0,0.43,2.44); root.add(frontBumper);
  const rearBumper = frontBumper.clone(); rearBumper.position.z=-2.44; root.add(rearBumper);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.18,0.28,0.055), dark); grille.position.set(0,0.66,2.45); root.add(grille);
  for (let i=-4;i<=4;i++) { const slat=new THREE.Mesh(new THREE.BoxGeometry(0.035,0.24,0.035),chrome); slat.position.set(i*0.12,0.66,2.49); root.add(slat); }
  for (const side of [-1,1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46,0.20,0.05), vehicleLight(0xf4f0c2,0xfff2a8,1.0,true)); head.position.set(side*0.62,0.78,2.44); head.userData.lightRole='headlight'; root.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.47,0.19,0.05), vehicleLight(0x9d1720,0xff2030,0.55,true)); tail.position.set(side*0.61,0.76,-2.44); tail.userData.lightRole='brake'; tail.name='brake_light'; root.add(tail);
  }
  // Front-right aerial is a small silhouette cue from the Hit & Run family car.
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.82,6), chrome);
  antenna.position.set(-0.75,1.20,1.06); antenna.rotation.z=-0.12; root.add(antenna);
  // A couple of stylised cans in the rear well as a tiny in-game nod, not external assets.
  for (let i=0;i<2;i++) { const can=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.18,10),new THREE.MeshStandardMaterial({color:0xb62b28,roughness:0.45,metalness:0.35})); can.position.set(-0.22+i*0.25,0.77,-1.34); root.add(can); }

  root.userData.driverSeat={x:-0.43,y:0.50,z:0.10,scale:0.45};
  root.userData.passengerSeat={x:0.43,y:0.50,z:0.10,scale:0.45};
  root.userData.openTop=true;
  buildSimpleWheelSet(root,1.92,1.42,-1.39,0.37,0xd6d7d8);
  collectVehicleVisualNodes(root);
  return root;
}


/**
 * Peppa Pig family's iconic original red open-top car.
 * Research notes: the long-running show vehicle is a simple rounded red convertible,
 * four seats in the original version, four wheels and a very clean preschool-cartoon
 * silhouette. Keep it intentionally softer/smaller than the Simpsons cars.
 */
export function createPeppaFamilyCarModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'car_peppa_family_car';
  root.userData.vehicleModelType = 'peppa_family_car';
  root.userData.realWorldDimensions = { length: 3.72, width: 1.70, height: 1.30 };
  root.userData.vehicleCollisionRadius = 1.46;
  root.userData.vehicleCollisionHeight = 1.72;
  root.userData.vehicleExitOffset = 2.05;
  root.userData.damageResistance = 0.92;
  root.userData.vehicleCamera = { baseDistance: 7.5, speedDistance: 3.0, height: 3.0, speedHeight: 1.15, lookHeight: 0.90 };
  root.userData.openTop = true;

  const red = vehiclePaint(0xe64b3f);
  const redDark = new THREE.MeshStandardMaterial({ color: 0xb93631, roughness: 0.42, metalness: 0.18 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf1d39a, roughness: 0.78, metalness: 0.02 });
  const dark = vehicleMatteBlack();
  const silver = new THREE.MeshStandardMaterial({ color: 0xb7c0c4, roughness: 0.32, metalness: 0.62 });

  // Rounded, toy-like body. The high belt line and short nose make the silhouette
  // read like the cartoon rather than a normal modern convertible.
  root.add(makeSideProfileVolume([
    [1.86,0.28],[1.82,0.72],[1.48,0.93],[0.72,1.02],[-0.98,1.02],
    [-1.55,0.88],[-1.84,0.58],[-1.82,0.28],[-1.28,0.24],[1.28,0.24]
  ], 1.70, red, 0.055, 'peppa_family_car_body'));

  // Open cabin and four visible seats.
  const cabinWell = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.30, 1.75), redDark);
  cabinWell.position.set(0, 0.76, -0.20); root.add(cabinWell);
  for (const z of [0.23, -0.58]) {
    for (const x of [-0.38, 0.38]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.48), cream);
      seat.position.set(x, 0.72, z); root.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.50, 0.15), cream);
      back.position.set(x, 0.94, z - 0.17); back.rotation.x = -0.08; root.add(back);
    }
  }

  // Low windscreen with a simple silver frame.
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.50, 0.04), vehicleGlass(0x9dd8e8, 0.23));
  glass.position.set(0, 1.12, 0.75); glass.rotation.x = -0.18; root.add(glass);
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.045, 0.055), silver);
  topBar.position.set(0, 1.36, 0.70); root.add(topBar);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.52, 0.055), silver);
    post.position.set(side * 0.71, 1.12, 0.73); post.rotation.x = -0.18; root.add(post);
  }

  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.17, 0.30), redDark);
  dash.position.set(0, 0.90, 0.69); root.add(dash);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 7, 16), dark);
  steering.position.set(-0.38, 1.01, 0.48); steering.rotation.x = Math.PI / 2; root.add(steering);

  // Two big round headlights and simple friendly front treatment.
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.045, 14), vehicleLight(0xfff4b8, 0xfff2a5, 0.95, true));
    head.rotation.x = Math.PI / 2; head.position.set(side * 0.47, 0.69, 1.85); head.userData.lightRole = 'headlight'; root.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.045), vehicleLight(0xb51f2a, 0xff2434, 0.55, true));
    tail.position.set(side * 0.53, 0.67, -1.84); tail.userData.lightRole = 'brake'; tail.name = 'brake_light'; root.add(tail);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.04), dark);
  grille.position.set(0, 0.48, 1.87); root.add(grille);

  // Small aerial mirrors the familiar simple cartoon silhouette.
  const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.62, 5), dark);
  aerial.position.set(0.72, 1.17, 0.86); aerial.rotation.z = -0.10; root.add(aerial);

  addDoorDetails(root, 1.70, 1.18, -1.02, false);
  buildSimpleWheelSet(root, 1.70, 1.18, -1.02, 0.31, 0x9ca6aa);

  root.userData.driverSeat = { x: -0.38, y: 0.48, z: 0.23, scale: 0.40 };
  root.userData.passengerSeat = { x: 0.38, y: 0.48, z: 0.23, scale: 0.40 };
  root.userData.rearPassengerSeats = [
    { x: -0.38, y: 0.48, z: -0.58, scale: 0.34 },
    { x: 0.38, y: 0.48, z: -0.58, scale: 0.34 },
  ];
  collectVehicleVisualNodes(root);
  return root;
}

/** Build one independently positioned cartoon wheel, used by asymmetric vehicles. */
function buildSimpleWheelAt(
  root: THREE.Group,
  x: number,
  y: number,
  z: number,
  radius: number,
  width: number,
  steerable: boolean,
  rimColor = 0xbfc2c5
): THREE.Group {
  const steer = new THREE.Group();
  steer.position.set(x,y,z);
  steer.userData.vehicleWheelSteer=steerable;
  steer.userData.baseSteerY=0;
  const spin=new THREE.Group();
  spin.userData.vehicleWheelSpin=true;
  spin.userData.wheelRadius=radius;
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,18,2),vehicleRubber()); tire.rotation.z=Math.PI/2; tire.castShadow=true;
  const rim=new THREE.Mesh(new THREE.CylinderGeometry(radius*0.62,radius*0.62,width*0.84,14),new THREE.MeshStandardMaterial({color:rimColor,roughness:0.28,metalness:0.76})); rim.rotation.z=Math.PI/2;
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*0.16,radius*0.16,width*0.92,12),vehicleMatteBlack()); hub.rotation.z=Math.PI/2;
  spin.add(tire,rim,hub); steer.add(spin); root.add(steer); return steer;
}

export function createSpeedRocketModel(): THREE.Group {
  const root=new THREE.Group(); root.name='car_speed_rocket'; root.userData.vehicleModelType='speed_rocket';
  root.userData.realWorldDimensions={length:5.05,width:1.70,height:1.18};
  root.userData.vehicleCollisionRadius=1.72; root.userData.vehicleCollisionHeight=1.65; root.userData.vehicleExitOffset=2.15; root.userData.damageResistance=0.78;
  root.userData.vehicleCamera={baseDistance:9.6,speedDistance:5.8,height:3.2,speedHeight:1.55,lookHeight:0.82};
  const white=vehiclePaint(0xf1f3f2), lightBlue=vehiclePaint(0x7bc6df), darkBlue=vehiclePaint(0x1c4f88), dark=vehicleMatteBlack(), chrome=vehicleChrome();

  // Purpose-built narrow rocket fuselage rather than a car shell.
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.62,3.55,8,18),white); body.rotation.x=Math.PI/2; body.position.y=0.60; body.castShadow=true; root.add(body);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(0.64,1.18,18),darkBlue); nose.rotation.x=Math.PI/2; nose.position.set(0,0.60,2.30); root.add(nose);
  const midBand=new THREE.Mesh(new THREE.CylinderGeometry(0.65,0.65,0.78,18),lightBlue); midBand.rotation.x=Math.PI/2; midBand.position.set(0,0.60,1.58); root.add(midBand);
  const cockpitTub=new THREE.Mesh(new THREE.BoxGeometry(0.88,0.30,1.15),dark); cockpitTub.position.set(0,0.83,-0.02); root.add(cockpitTub);
  const seat=new THREE.Mesh(new THREE.BoxGeometry(0.48,0.58,0.46),new THREE.MeshStandardMaterial({color:0x34383d,roughness:0.82})); seat.position.set(0,0.92,-0.18); seat.rotation.x=-0.10; root.add(seat);
  const smallWheel=new THREE.Mesh(new THREE.TorusGeometry(0.15,0.026,8,16),dark); smallWheel.position.set(0,1.02,0.28); smallWheel.rotation.x=Math.PI/2; root.add(smallWheel);
  const screen=new THREE.Mesh(new THREE.SphereGeometry(0.57,16,9,0,Math.PI*2,0,Math.PI*0.48),vehicleGlass(0x8fd7ee,0.22)); screen.scale.set(0.82,0.58,1.05); screen.position.set(0,1.13,0.05); root.add(screen);
  const fin=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.62,0.78),darkBlue); fin.position.set(0,1.04,-1.58); fin.rotation.x=-0.22; root.add(fin);
  const nozzleOuter=new THREE.Mesh(new THREE.CylinderGeometry(0.36,0.49,0.52,18),chrome); nozzleOuter.rotation.x=Math.PI/2; nozzleOuter.position.set(0,0.61,-2.38); root.add(nozzleOuter);
  const nozzleInner=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,0.54,16),dark); nozzleInner.rotation.x=Math.PI/2; nozzleInner.position.set(0,0.61,-2.49); root.add(nozzleInner);
  const flameMat=new THREE.MeshStandardMaterial({color:0xdcb6ff,emissive:0x8e55ff,emissiveIntensity:3.4,transparent:true,opacity:0.82,roughness:0.15,depthWrite:false});
  const flame=new THREE.Mesh(new THREE.ConeGeometry(0.30,1.25,14),flameMat); flame.rotation.x=-Math.PI/2; flame.position.set(0,0.61,-3.15); flame.visible=false; root.add(flame); root.userData.rocketFlame=flame;
  for (const side of [-1,1]) {
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.10,10,8),vehicleLight(0xf0f7da,0xeaffb3,1.0,true)); head.position.set(side*0.28,0.61,2.70); head.userData.lightRole='headlight'; root.add(head);
    const tail=new THREE.Mesh(new THREE.SphereGeometry(0.075,10,8),vehicleLight(0xa51322,0xff2035,0.65,true)); tail.position.set(side*0.28,0.62,-2.56); tail.userData.lightRole='brake'; tail.name='brake_light'; root.add(tail);
  }
  // True three-wheel layout: one front steering wheel, paired rear wheels.
  buildSimpleWheelAt(root,0,0.36,1.76,0.34,0.25,true,0xd5d7da);
  buildSimpleWheelAt(root,-0.66,0.38,-1.38,0.38,0.29,false,0xd5d7da);
  buildSimpleWheelAt(root,0.66,0.38,-1.38,0.38,0.29,false,0xd5d7da);
  root.userData.driverSeat={x:0,y:0.62,z:-0.12,scale:0.42};
  collectVehicleVisualNodes(root); return root;
}

export function createCanyoneroModel(): THREE.Group {
  const root=new THREE.Group(); root.name='car_canyonero'; root.userData.vehicleModelType='canyonero';
  root.userData.realWorldDimensions={length:5.35,width:2.34,height:2.08};
  root.userData.vehicleCollisionRadius=2.12; root.userData.vehicleCollisionHeight=2.65; root.userData.vehicleExitOffset=2.65; root.userData.damageResistance=1.55;
  root.userData.vehicleCamera={baseDistance:9.7,speedDistance:3.6,height:4.25,speedHeight:1.4,lookHeight:1.42};
  const red=vehiclePaint(0xc92d26), chrome=vehicleChrome(), dark=vehicleMatteBlack(), glass=vehicleGlass(0x325d77,0.32);
  root.add(makeSideProfileVolume([[2.67,0.39],[2.64,1.02],[2.20,1.30],[1.30,1.46],[-1.55,1.46],[-2.48,1.27],[-2.67,0.86],[-2.63,0.36],[-2.08,0.33],[2.12,0.33]],2.34,red,0.065,'canyonero_body'));
  root.add(makeSideProfileVolume([[1.33,1.43],[0.94,1.86],[-1.43,1.86],[-2.00,1.43]],2.02,glass,0.025,'canyonero_glass'));
  // Huge grille and bumpers.
  const grille=new THREE.Mesh(new THREE.BoxGeometry(1.62,0.52,0.08),dark); grille.position.set(0,0.88,2.70); root.add(grille);
  for(let i=-5;i<=5;i++){const bar=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.46,0.04),chrome);bar.position.set(i*0.13,0.88,2.75);root.add(bar);}
  const fb=new THREE.Mesh(new THREE.BoxGeometry(2.38,0.20,0.25),chrome);fb.position.set(0,0.48,2.70);root.add(fb);const rb=fb.clone();rb.position.z=-2.70;root.add(rb);
  // Roof bars + chrome lower trim + side steps.
  for(const z of [0.65,-1.05]){const cross=new THREE.Mesh(new THREE.BoxGeometry(2.10,0.07,0.10),dark);cross.position.set(0,1.96,z);root.add(cross);}
  for(const side of [-1,1]){const rail=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.10,3.25),dark);rail.position.set(side*0.93,1.96,-0.15);root.add(rail);const step=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.12,3.15),chrome);step.position.set(side*1.20,0.41,-0.20);root.add(step);const trim=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.14,4.25),chrome);trim.position.set(side*1.18,0.64,-0.06);root.add(trim);}
  const seatMat=new THREE.MeshStandardMaterial({color:0x4b3c33,roughness:0.80});
  for(const z of [0.35,-0.75]) for(const x of [-0.50,0.50]){const seat=new THREE.Mesh(new THREE.BoxGeometry(0.64,0.78,0.60),seatMat);seat.position.set(x,0.78,z);root.add(seat);}
  const dash=new THREE.Mesh(new THREE.BoxGeometry(1.72,0.24,0.40),dark);dash.position.set(0,1.05,0.95);root.add(dash);
  const sw=new THREE.Mesh(new THREE.TorusGeometry(0.21,0.035,8,18),dark);sw.position.set(-0.52,1.24,0.70);sw.rotation.x=Math.PI/2;root.add(sw);
  // Grocery bags in the cargo area.
  for(const [x,z,c] of [[-0.42,-1.70,0xc69a63],[0.34,-1.62,0xb78955]] as Array<[number,number,number]>){const bag=new THREE.Mesh(new THREE.BoxGeometry(0.50,0.55,0.44),new THREE.MeshStandardMaterial({color:c,roughness:0.90}));bag.position.set(x,0.68,z);root.add(bag);}
  for(const side of [-1,1]){const head=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.22,0.05),vehicleLight(0xf3edc8,0xfff1a0,0.8,true));head.position.set(side*0.69,1.05,2.70);head.userData.lightRole='headlight';root.add(head);const tail=new THREE.Mesh(new THREE.BoxGeometry(0.52,0.28,0.05),vehicleLight(0xa11519,0xff2027,0.55,true));tail.position.set(side*0.72,1.02,-2.70);tail.userData.lightRole='brake';tail.name='brake_light';root.add(tail);}
  root.userData.driverSeat={x:-0.50,y:0.55,z:0.33,scale:0.47};root.userData.passengerSeat={x:0.50,y:0.55,z:0.33,scale:0.47};
  buildSimpleWheelSet(root,2.34,1.58,-1.55,0.48,0x3c3f42); collectVehicleVisualNodes(root); return root;
}

export function createMrPlowModel(): THREE.Group {
  const root=new THREE.Group(); root.name='car_mr_plow'; root.userData.vehicleModelType='mr_plow';
  root.userData.realWorldDimensions={length:5.22,width:2.05,height:1.73};
  root.userData.vehicleCollisionRadius=2.05; root.userData.vehicleCollisionHeight=2.28; root.userData.vehicleExitOffset=2.45; root.userData.damageResistance=1.45;
  root.userData.vehicleCamera={baseDistance:9.2,speedDistance:3.4,height:3.85,speedHeight:1.35,lookHeight:1.20};
  const red=vehiclePaint(0xd82b24), dark=vehicleMatteBlack(), chrome=vehicleChrome(), glass=vehicleGlass(0x86bdd0,0.29);
  // Pickup chassis + single cab + proper open bed.
  root.add(makeSideProfileVolume([[2.34,0.33],[2.30,0.78],[1.78,0.96],[0.80,1.00],[0.42,0.94],[-2.25,0.88],[-2.40,0.58],[-2.36,0.31],[-1.86,0.28],[1.80,0.28]],2.05,red,0.055,'mr_plow_pickup_body'));
  root.add(makeSideProfileVolume([[0.75,0.97],[0.42,1.44],[-0.48,1.45],[-0.88,0.97]],1.82,glass,0.022,'mr_plow_cab_glass'));
  const bedFloor=new THREE.Mesh(new THREE.BoxGeometry(1.82,0.12,1.60),new THREE.MeshStandardMaterial({color:0x7e1715,roughness:0.62,metalness:0.32}));bedFloor.position.set(0,0.74,-1.45);root.add(bedFloor);
  for(const side of [-1,1]){const bedSide=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.54,1.62),red);bedSide.position.set(side*0.93,0.94,-1.45);root.add(bedSide);}
  const tailgate=new THREE.Mesh(new THREE.BoxGeometry(1.82,0.54,0.12),red);tailgate.position.set(0,0.94,-2.28);root.add(tailgate);
  const seatMat=new THREE.MeshStandardMaterial({color:0x34373b,roughness:0.84});const bench=new THREE.Mesh(new THREE.BoxGeometry(1.45,0.58,0.55),seatMat);bench.position.set(0,0.65,0.12);root.add(bench);
  const dash=new THREE.Mesh(new THREE.BoxGeometry(1.50,0.22,0.38),dark);dash.position.set(0,0.95,0.71);root.add(dash);const sw=new THREE.Mesh(new THREE.TorusGeometry(0.19,0.032,8,18),dark);sw.position.set(-0.43,1.12,0.47);sw.rotation.x=Math.PI/2;root.add(sw);
  // Curved metal snow-plough surface. Cylinder axis is turned sideways, creating a
  // wide concave blade instead of the old-game-dev trick of a flat red rectangle.
  const bladeMat=new THREE.MeshStandardMaterial({color:0xe8eaec,roughness:0.42,metalness:0.82,side:THREE.DoubleSide});
  const blade=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.15,2.34,22,1,true,Math.PI*0.62,Math.PI*0.73),bladeMat);blade.rotation.z=Math.PI/2;blade.position.set(0,0.57,2.88);blade.scale.z=0.52;root.add(blade);
  for(const side of [-1,1]){const arm=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.10,0.88),dark);arm.position.set(side*0.57,0.46,2.55);arm.rotation.x=-0.20;root.add(arm);}
  const badge=makeTextBadge('MR PLOW',0.78,0.20,'#fff5d6');badge.position.set(1.035,0.91,0.05);badge.rotation.y=Math.PI/2;root.add(badge);
  for(const side of [-1,1]){const head=new THREE.Mesh(new THREE.BoxGeometry(0.47,0.18,0.05),vehicleLight(0xf1ecc5,0xffef9d,0.8,true));head.position.set(side*0.60,0.82,2.37);head.userData.lightRole='headlight';root.add(head);const tail=new THREE.Mesh(new THREE.BoxGeometry(0.44,0.20,0.05),vehicleLight(0x9f1519,0xff2029,0.55,true));tail.position.set(side*0.62,0.76,-2.41);tail.userData.lightRole='brake';tail.name='brake_light';root.add(tail);}
  root.userData.driverSeat={x:-0.43,y:0.42,z:0.12,scale:0.45};root.userData.passengerSeat={x:0.43,y:0.42,z:0.12,scale:0.45};
  buildSimpleWheelSet(root,2.05,1.42,-1.48,0.41,0x3a3d40);collectVehicleVisualNodes(root);return root;
}

export function createCarBuiltForHomerModel(): THREE.Group {
  const root=new THREE.Group(); root.name='car_built_for_homer'; root.userData.vehicleModelType='car_built_for_homer';
  root.userData.realWorldDimensions={length:5.48,width:2.34,height:1.92};
  root.userData.vehicleCollisionRadius=2.12; root.userData.vehicleCollisionHeight=2.48; root.userData.vehicleExitOffset=2.65; root.userData.damageResistance=1.30;
  root.userData.vehicleCamera={baseDistance:10.0,speedDistance:4.0,height:4.0,speedHeight:1.45,lookHeight:1.28};
  const bodyMat=vehiclePaint(0xd9df48), dark=vehicleMatteBlack(), chrome=vehicleChrome(), glass=vehicleGlass(0x8fd7e2,0.22);
  root.add(makeSideProfileVolume([[2.73,0.32],[2.68,0.82],[2.05,1.02],[1.25,1.08],[0.70,1.04],[-1.15,1.04],[-2.10,0.92],[-2.73,0.67],[-2.68,0.30],[-2.08,0.27],[2.12,0.27]],2.34,bodyMat,0.075,'homer_body'));
  // Two unmistakable bubble domes.
  const frontDome=new THREE.Mesh(new THREE.SphereGeometry(0.88,18,12,0,Math.PI*2,0,Math.PI*0.53),glass);frontDome.scale.set(1.08,0.82,1.30);frontDome.position.set(0,1.33,0.48);root.add(frontDome);
  const rearDome=new THREE.Mesh(new THREE.SphereGeometry(0.74,18,12,0,Math.PI*2,0,Math.PI*0.53),glass);rearDome.scale.set(1.06,0.82,1.08);rearDome.position.set(0,1.25,-1.20);root.add(rearDome);
  const frontSeatMat=new THREE.MeshStandardMaterial({color:0x5a4938,roughness:0.78});
  for(const [x,z] of [[-0.43,0.38],[0.43,0.38],[-0.38,-1.14],[0.38,-1.14]] as Array<[number,number]>){const seat=new THREE.Mesh(new THREE.BoxGeometry(0.56,0.62,0.50),frontSeatMat);seat.position.set(x,0.74,z);root.add(seat);}
  const dash=new THREE.Mesh(new THREE.BoxGeometry(1.55,0.22,0.38),dark);dash.position.set(0,0.98,0.93);root.add(dash);const sw=new THREE.Mesh(new THREE.TorusGeometry(0.20,0.034,8,18),dark);sw.position.set(-0.44,1.16,0.69);sw.rotation.x=Math.PI/2;root.add(sw);
  // Huge rear spoiler and twin tail fins.
  const wing=new THREE.Mesh(new THREE.BoxGeometry(2.36,0.12,0.52),bodyMat);wing.position.set(0,1.56,-2.15);root.add(wing);
  for(const side of [-1,1]){const stay=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.62,0.12),dark);stay.position.set(side*0.70,1.25,-2.08);root.add(stay);const fin=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.78,0.72),bodyMat);fin.position.set(side*0.94,1.15,-2.28);fin.rotation.x=-0.18;root.add(fin);}
  // Large comic grille.
  const grille=new THREE.Mesh(new THREE.BoxGeometry(1.58,0.50,0.075),dark);grille.position.set(0,0.73,2.75);root.add(grille);for(let i=-5;i<=5;i++){const slat=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.43,0.04),chrome);slat.position.set(i*0.13,0.73,2.80);root.add(slat);}
  // Bowler-hat hood ornament: brim + squashed dome.
  const brim=new THREE.Mesh(new THREE.CylinderGeometry(0.19,0.19,0.035,18),dark);brim.position.set(0,1.13,1.68);root.add(brim);const hat=new THREE.Mesh(new THREE.SphereGeometry(0.14,14,8,0,Math.PI*2,0,Math.PI*0.66),dark);hat.scale.y=0.80;hat.position.set(0,1.20,1.68);root.add(hat);
  addMirrors(root,2.34,0.78,1.20,false);
  for(const side of [-1,1]){const head=new THREE.Mesh(new THREE.BoxGeometry(0.50,0.19,0.05),vehicleLight(0xf1edc8,0xffef9e,0.9,true));head.position.set(side*0.66,0.82,2.75);head.userData.lightRole='headlight';root.add(head);const tail=new THREE.Mesh(new THREE.BoxGeometry(0.49,0.21,0.05),vehicleLight(0xa1161b,0xff2030,0.55,true));tail.position.set(side*0.67,0.80,-2.75);tail.userData.lightRole='brake';tail.name='brake_light';root.add(tail);}
  root.userData.driverSeat={x:-0.43,y:0.50,z:0.38,scale:0.44};root.userData.passengerSeat={x:0.43,y:0.50,z:0.38,scale:0.44};
  buildSimpleWheelSet(root,2.34,1.55,-1.58,0.44,0x4a4d50);collectVehicleVisualNodes(root);return root;
}

// Full-size North-American police sedan silhouette (Crown-Victoria-inspired).
export function createPoliceCruiserModel(): THREE.Group {
  const root = new THREE.Group(); root.name='car_police_cruiser';
  const black=vehicleGlossBlack(); const white=new THREE.MeshStandardMaterial({color:0xe7eaed,roughness:0.32,metalness:0.24});
  root.add(makeSideProfileVolume([[2.55,0.34],[2.52,0.81],[1.86,0.98],[0.78,1.04],[-0.91,1.04],[-1.87,0.92],[-2.55,0.70],[-2.50,0.31],[-1.98,0.28],[2.02,0.28]],2.01,black,0.05,'police_body'));
  const doorBand=new THREE.Mesh(new THREE.BoxGeometry(2.04,0.54,2.05),white); doorBand.position.set(0,0.69,-0.08); root.add(doorBand);
  root.add(makeSideProfileVolume([[0.74,1.02],[0.34,1.43],[-0.99,1.43],[-1.46,1.02]],1.78,vehicleGlass(0x6f99ae,0.36),0.025,'police_glass'));
  addSedanInterior(root,2.01,0.13,-0.88,false); addDoorDetails(root,2.01,1.49,-1.46,false);
  const push = new THREE.Mesh(new THREE.BoxGeometry(1.56,0.50,0.12),vehicleMatteBlack()); push.position.set(0,0.54,2.60); root.add(push);
  const lightbarBase=new THREE.Mesh(new THREE.BoxGeometry(1.28,0.06,0.25),vehicleChrome()); lightbarBase.position.set(0,1.53,-0.20); root.add(lightbarBase);
  const red=new THREE.Mesh(new THREE.BoxGeometry(0.53,0.13,0.20),vehicleLight(0xb51220,0xff0019,1.5,false)); red.position.set(-0.29,1.61,-0.20); root.add(red);
  const blue=new THREE.Mesh(new THREE.BoxGeometry(0.53,0.13,0.20),vehicleLight(0x1749b9,0x1749ff,1.5,false)); blue.position.set(0.29,1.61,-0.20); root.add(blue);
  for (const side of [-1,1]) { const tail=new THREE.Mesh(new THREE.BoxGeometry(0.52,0.18,0.045),vehicleLight(0x961018,0xff1e2d,0.55,true)); tail.position.set(side*0.64,0.76,-2.56); tail.userData.lightRole='brake'; tail.name='brake_light'; root.add(tail); }
  buildSimpleWheelSet(root,2.01,1.49,-1.46,0.37,0x202225); collectVehicleVisualNodes(root); return root;
}

// Second pursuit shape is deliberately a modern muscular police sedan rather than
// recycling the same Crown-Vic body under another name.
export function createPoliceSUVModel(): THREE.Group {
  const root=new THREE.Group(); root.name='car_police_interceptor';
  const black=vehicleGlossBlack(); const white=new THREE.MeshStandardMaterial({color:0xebedef,roughness:0.30,metalness:0.25});
  root.add(makeSideProfileVolume([[2.49,0.32],[2.46,0.75],[1.90,0.94],[0.79,1.02],[-0.90,1.02],[-1.78,0.90],[-2.49,0.66],[-2.45,0.30],[-1.90,0.28],[1.93,0.28]],1.96,black,0.05,'interceptor_body'));
  const doorBand=new THREE.Mesh(new THREE.BoxGeometry(1.99,0.50,1.98),white); doorBand.position.set(0,0.68,-0.05); root.add(doorBand);
  root.add(makeSideProfileVolume([[0.70,1.00],[0.27,1.37],[-0.92,1.38],[-1.38,1.01]],1.73,vehicleGlass(0x6d93a6,0.35),0.025,'interceptor_glass'));
  addSedanInterior(root,1.96,0.10,-0.85,false); addDoorDetails(root,1.96,1.45,-1.43,false);
  const ram=new THREE.Mesh(new THREE.BoxGeometry(1.48,0.44,0.13),vehicleMatteBlack()); ram.position.set(0,0.53,2.54); root.add(ram);
  const red=new THREE.Mesh(new THREE.BoxGeometry(0.50,0.12,0.20),vehicleLight(0xb51220,0xff0019,1.5,false)); red.position.set(-0.27,1.49,-0.18); root.add(red);
  const blue=new THREE.Mesh(new THREE.BoxGeometry(0.50,0.12,0.20),vehicleLight(0x1749b9,0x1749ff,1.5,false)); blue.position.set(0.27,1.49,-0.18); root.add(blue);
  for (const side of [-1,1]) { const tail=new THREE.Mesh(new THREE.BoxGeometry(0.50,0.17,0.045),vehicleLight(0x961018,0xff1e2d,0.55,true)); tail.position.set(side*0.62,0.75,-2.50); tail.userData.lightRole='brake'; tail.name='brake_light'; root.add(tail); }
  buildSimpleWheelSet(root,1.96,1.45,-1.43,0.37,0x222428); collectVehicleVisualNodes(root); return root;
}

export function createTrafficSedanModel(colorHex = 0xff9800): THREE.Group {
  const root=new THREE.Group(); root.name='car_traffic_sedan'; const paint=vehiclePaint(colorHex);
  root.add(makeSideProfileVolume([[2.18,0.31],[2.15,0.70],[1.61,0.88],[0.67,0.98],[-0.78,0.98],[-1.57,0.87],[-2.18,0.63],[-2.14,0.29],[-1.69,0.27],[1.70,0.27]],1.78,paint,0.045,'traffic_body'));
  root.add(makeSideProfileVolume([[0.61,0.96],[0.23,1.29],[-0.76,1.31],[-1.22,0.97]],1.56,vehicleGlass(0x83aab9,0.29),0.02,'traffic_glass'));
  for (const side of [-1,1]) { const head=new THREE.Mesh(new THREE.BoxGeometry(0.44,0.15,0.035),vehicleLight(0xeef3d4,0xfff4b0,0.55,true)); head.position.set(side*0.52,0.73,2.19); head.userData.lightRole='headlight'; root.add(head); const tail=new THREE.Mesh(new THREE.BoxGeometry(0.43,0.15,0.035),vehicleLight(0x94111a,0xff1e2b,0.38,true)); tail.position.set(side*0.52,0.72,-2.19); tail.userData.lightRole='brake'; tail.name='brake_light'; root.add(tail); }
  const dash=new THREE.Mesh(new THREE.BoxGeometry(1.34,0.20,0.34),vehicleMatteBlack()); dash.position.set(0,0.82,0.72); root.add(dash);
  const seatMat=new THREE.MeshStandardMaterial({color:0x2f3338,roughness:0.82,metalness:0.02});
  for (const x of [-0.43,0.43]) { const seat=new THREE.Mesh(new THREE.BoxGeometry(0.52,0.58,0.52),seatMat); seat.position.set(x,0.54,0.04); root.add(seat); }
  root.userData.driverSeat={x:-0.40,y:0.37,z:0.04,scale:0.46}; root.userData.passengerSeat={x:0.40,y:0.37,z:0.04,scale:0.46};
  buildSimpleWheelSet(root,1.78,1.31,-1.27,0.34,0xb9bec2); collectVehicleVisualNodes(root); return root;
}

function createTrafficSUVModel(colorHex = 0x3c6f3d): THREE.Group {
  const root=new THREE.Group(); root.name='car_traffic_suv'; const paint=vehiclePaint(colorHex);
  root.add(makeSideProfileVolume([[2.30,0.33],[2.27,0.86],[1.75,1.08],[0.72,1.21],[-1.15,1.20],[-2.12,1.01],[-2.30,0.70],[-2.26,0.31],[-1.80,0.29],[1.82,0.29]],1.90,paint,0.05,'traffic_suv_body'));
  root.add(makeSideProfileVolume([[0.70,1.18],[0.35,1.55],[-1.08,1.55],[-1.61,1.17]],1.67,vehicleGlass(0x7fa6b5,0.30),0.02,'traffic_suv_glass'));
  const dash=new THREE.Mesh(new THREE.BoxGeometry(1.44,0.22,0.36),vehicleMatteBlack()); dash.position.set(0,0.95,0.73); root.add(dash);
  const seatMat=new THREE.MeshStandardMaterial({color:0x30343a,roughness:0.82,metalness:0.02});
  for (const x of [-0.45,0.45]) { const seat=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.66,0.55),seatMat); seat.position.set(x,0.63,0.02); root.add(seat); }
  root.userData.driverSeat={x:-0.43,y:0.45,z:0.02,scale:0.48}; root.userData.passengerSeat={x:0.43,y:0.45,z:0.02,scale:0.48};
  buildSimpleWheelSet(root,1.90,1.39,-1.36,0.38,0x3a3d40); collectVehicleVisualNodes(root); return root;
}

function createTrafficSportsCarModel(colorHex = 0xd65a24): THREE.Group {
  const root=new THREE.Group(); root.name='car_traffic_sports'; const paint=vehiclePaint(colorHex);
  root.add(makeSideProfileVolume([[2.16,0.28],[2.10,0.58],[1.52,0.75],[0.65,0.84],[-0.72,0.84],[-1.55,0.75],[-2.16,0.53],[-2.10,0.27],[-1.62,0.25],[1.70,0.25]],1.86,paint,0.045,'sports_body'));
  root.add(makeSideProfileVolume([[0.54,0.82],[0.16,1.12],[-0.70,1.13],[-1.13,0.82]],1.55,vehicleGlass(0x7296a6,0.28),0.02,'sports_glass'));
  const splitter=new THREE.Mesh(new THREE.BoxGeometry(1.56,0.05,0.24),vehicleGlossBlack()); splitter.position.set(0,0.25,2.13); root.add(splitter);
  const dash=new THREE.Mesh(new THREE.BoxGeometry(1.38,0.17,0.30),vehicleMatteBlack()); dash.position.set(0,0.72,0.66); root.add(dash);
  const seatMat=new THREE.MeshStandardMaterial({color:0x24272b,roughness:0.80,metalness:0.03});
  for (const x of [-0.42,0.42]) { const seat=new THREE.Mesh(new THREE.BoxGeometry(0.50,0.52,0.50),seatMat); seat.position.set(x,0.48,-0.02); root.add(seat); }
  root.userData.driverSeat={x:-0.40,y:0.31,z:-0.02,scale:0.43}; root.userData.passengerSeat={x:0.40,y:0.31,z:-0.02,scale:0.43};
  buildSimpleWheelSet(root,1.86,1.30,-1.28,0.35,0x25272a); collectVehicleVisualNodes(root); return root;
}


/** Open-top traffic roadster used sparingly so the streets have recognisable variety. */
export function createTrafficConvertibleModel(colorHex = 0x2d79c7): THREE.Group {
  const root=new THREE.Group(); root.name='car_traffic_convertible'; const paint=vehiclePaint(colorHex);
  root.add(makeSideProfileVolume([[2.10,0.27],[2.04,0.56],[1.45,0.72],[0.72,0.79],[-0.58,0.78],[-1.46,0.69],[-2.10,0.50],[-2.05,0.25],[-1.56,0.23],[1.66,0.23]],1.84,paint,0.045,'convertible_body'));
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.46,0.34,1.45),vehicleMatteBlack()); cabin.position.set(0,0.54,-0.12); root.add(cabin);
  const windscreen=new THREE.Mesh(new THREE.BoxGeometry(1.48,0.58,0.045),vehicleGlass(0x85b7ca,0.25)); windscreen.position.set(0,0.93,0.62); windscreen.rotation.x=-0.20; root.add(windscreen);
  const seatMat=new THREE.MeshStandardMaterial({color:0x25272b,roughness:0.78,metalness:0.02});
  for (const x of [-0.40,0.40]) { const seat=new THREE.Mesh(new THREE.BoxGeometry(0.50,0.54,0.50),seatMat); seat.position.set(x,0.48,-0.12); root.add(seat); }
  const rearDeck=new THREE.Mesh(new THREE.BoxGeometry(1.58,0.13,0.72),paint); rearDeck.position.set(0,0.76,-0.98); root.add(rearDeck);
  const splitter=new THREE.Mesh(new THREE.BoxGeometry(1.52,0.05,0.22),vehicleGlossBlack()); splitter.position.set(0,0.24,2.07); root.add(splitter);
  for (const side of [-1,1]) {
    const head=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.13,0.035),vehicleLight(0xeef3dc,0xfff4b5,0.55,true)); head.position.set(side*0.51,0.64,2.12); head.userData.lightRole='headlight'; root.add(head);
    const tail=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.13,0.035),vehicleLight(0x94111a,0xff1e2b,0.42,true)); tail.position.set(side*0.51,0.61,-2.11); tail.userData.lightRole='brake'; tail.name='brake_light'; root.add(tail);
  }
  root.userData.driverSeat={x:-0.40,y:0.30,z:-0.12,scale:0.44}; root.userData.passengerSeat={x:0.40,y:0.30,z:-0.12,scale:0.44}; root.userData.openTop=true;
  buildSimpleWheelSet(root,1.84,1.29,-1.27,0.35,0x25272a); collectVehicleVisualNodes(root); return root;
}


/**
 * Lightning McQueen is intentionally authored as a unique character-car rather than
 * a red skin on the generic traffic sedan. The low rounded Piston Cup silhouette,
 * windshield eyes, smiling front fascia, #95/lightning graphics and rear wing are
 * all readable even if the badges are ignored.
 */
export function createLightningMcQueenModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'car_lightning_mcqueen';
  root.userData.vehicleModelType = 'lightning_mcqueen';
  root.userData.npcVehicleHybrid = true;
  root.userData.isLightningMcQueen = true;
  root.userData.realWorldDimensions = { length: 4.72, width: 1.92, height: 1.22 };
  root.userData.vehicleCollisionRadius = 1.72;
  root.userData.vehicleCollisionHeight = 1.34;

  // REFERENCE-DRIVEN LIGHTNING MCQUEEN
  // The previous model already had the correct idea, but its constant-width extruded
  // shell still read as a generic red stock car from a distance.  This version uses
  // smooth longitudinal lofts so the nose, Coke-bottle flanks, roof and rear quarters
  // all change width/height like the supplied Cars reference image.
  const red = new THREE.MeshPhysicalMaterial({
    color: 0xd8171f,
    roughness: 0.20,
    metalness: 0.34,
    clearcoat: 1.0,
    clearcoatRoughness: 0.10,
  });
  const redDark = new THREE.MeshPhysicalMaterial({
    color: 0xa10f17,
    roughness: 0.24,
    metalness: 0.34,
    clearcoat: 0.82,
    clearcoatRoughness: 0.13,
  });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc928, roughness: 0.28, metalness: 0.18 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf28b1a, roughness: 0.32, metalness: 0.10 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xffe7a3, roughness: 0.35, metalness: 0.05 });
  const black = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.34, metalness: 0.20 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f8f3, roughness: 0.24, metalness: 0.02 });
  const eyeBlue = new THREE.MeshPhysicalMaterial({ color: 0x4c90d5, roughness: 0.14, metalness: 0.04, clearcoat: 0.65 });
  const eyeBlueLight = new THREE.MeshStandardMaterial({ color: 0x9bd8ff, roughness: 0.22, metalness: 0.01 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x202f3a,
    roughness: 0.16,
    metalness: 0.08,
    transparent: true,
    opacity: 0.90,
    clearcoat: 0.95,
    clearcoatRoughness: 0.08,
  });

  type LoftStation = { z: number; halfWidth: number; centerY: number; radiusY: number };
  const makeLoft = (stations: LoftStation[], material: THREE.Material, name: string, segments = 24): THREE.Mesh => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const station of stations) {
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        // Slightly square the lower half of the ellipse so the sill remains stock-car
        // flat while the shoulders/nose retain a smooth toy-film surface.
        const lowerFlatten = sn < -0.45 ? 0.91 : 1.0;
        positions.push(c * station.halfWidth, station.centerY + sn * station.radiusY * lowerFlatten, station.z);
      }
    }
    for (let s = 0; s < stations.length - 1; s++) {
      const a0 = s * segments;
      const b0 = (s + 1) * segments;
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        indices.push(a0 + i, b0 + i, b0 + j, a0 + i, b0 + j, a0 + j);
      }
    }
    // End caps keep the character solid when the camera is very low or close.
    const frontCenter = positions.length / 3;
    positions.push(0, stations[0].centerY, stations[0].z + 0.002);
    const rearCenter = positions.length / 3;
    const last = stations[stations.length - 1];
    positions.push(0, last.centerY, last.z - 0.002);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      indices.push(frontCenter, j, i);
      const base = (stations.length - 1) * segments;
      indices.push(rearCenter, base + i, base + j);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const body = makeLoft([
    { z: 2.43, halfWidth: 0.67, centerY: 0.54, radiusY: 0.24 },
    { z: 2.18, halfWidth: 0.87, centerY: 0.55, radiusY: 0.31 },
    { z: 1.66, halfWidth: 0.97, centerY: 0.57, radiusY: 0.34 },
    { z: 0.92, halfWidth: 1.00, centerY: 0.58, radiusY: 0.34 },
    { z: 0.08, halfWidth: 0.99, centerY: 0.58, radiusY: 0.33 },
    { z: -0.72, halfWidth: 0.99, centerY: 0.59, radiusY: 0.34 },
    { z: -1.48, halfWidth: 0.98, centerY: 0.58, radiusY: 0.34 },
    { z: -2.04, halfWidth: 0.90, centerY: 0.57, radiusY: 0.31 },
    { z: -2.40, halfWidth: 0.72, centerY: 0.55, radiusY: 0.26 },
  ], red, 'mcqueen_sculpted_body', 28);
  root.add(body);

  // A separate smooth greenhouse produces the high-eyed windshield and rounded roof
  // visible in the supplied photo.  Side window masks make the cabin read like Cars,
  // not like a transparent racing helmet.
  const greenhouse = makeLoft([
    { z: 0.72, halfWidth: 0.66, centerY: 0.99, radiusY: 0.18 },
    { z: 0.38, halfWidth: 0.73, centerY: 1.02, radiusY: 0.29 },
    { z: -0.38, halfWidth: 0.78, centerY: 1.03, radiusY: 0.31 },
    { z: -1.02, halfWidth: 0.73, centerY: 1.01, radiusY: 0.28 },
    { z: -1.38, halfWidth: 0.61, centerY: 0.94, radiusY: 0.16 },
  ], glass, 'mcqueen_greenhouse', 26);
  greenhouse.renderOrder = 3;
  root.add(greenhouse);

  // Red A/C pillars frame the windshield, matching the reference where the eyes are
  // embedded in the windscreen rather than floating on a generic white rectangle.
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.54, 0.10), redDark);
    pillar.position.set(side * 0.71, 1.03, 0.48);
    pillar.rotation.x = -0.32;
    pillar.rotation.z = side * -0.08;
    root.add(pillar);

    const sideWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.83, 0.34), glass);
    sideWindow.position.set(side * 0.785, 1.02, -0.45);
    sideWindow.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    sideWindow.rotation.z = side * 0.03;
    root.add(sideWindow);
  }

  // Windshield character face.  The pupils and catchlights are independent so the
  // existing eye animation can continue moving the pupil meshes.
  const eyeRig = new THREE.Group();
  eyeRig.name = 'mcqueen_eye_rig';
  eyeRig.position.set(0, 1.055, 0.708);
  eyeRig.rotation.x = -0.14;
  const pupils: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.275, 28, 18), white);
    sclera.scale.set(1.10, 0.70, 0.11);
    sclera.position.x = side * 0.31;
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.118, 22, 16), eyeBlue);
    iris.scale.set(1.0, 1.05, 0.18);
    iris.position.set(side * 0.31, -0.015, 0.253);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.058, 18, 12), black);
    pupil.scale.set(1.0, 1.08, 0.20);
    pupil.position.set(side * 0.31, -0.018, 0.281);
    const catchLight = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), eyeBlueLight);
    catchLight.position.set(side * 0.285, 0.030, 0.330);
    pupils.push(pupil);
    eyeRig.add(sclera, iris, pupil, catchLight);
  }
  // Slight upper eyelid/brow gives the confident McQueen expression from the photo.
  for (const side of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.065, 0.055), redDark);
    brow.position.set(side * 0.29, 0.17, 0.16);
    brow.rotation.z = side * 0.08;
    eyeRig.add(brow);
  }
  root.add(eyeRig);
  root.userData.mcqueenEyeRig = eyeRig;
  root.userData.mcqueenPupils = pupils;

  // Cars-style sticker headlamps, with warm indicator details rather than generic
  // rectangular working headlights.
  for (const side of [-1, 1]) {
    const head = makeFacePanel([
      [side * 0.80 - 0.18, 0.71], [side * 0.80 + 0.17, 0.69],
      [side * 0.80 + 0.14, 0.55], [side * 0.80 - 0.15, 0.56],
    ], 2.355, cream, 'mcqueen_headlight_decal', 0.012);
    head.userData.lightRole = 'headlight';
    root.add(head);
    const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), orange);
    indicator.position.set(side * 0.69, 0.625, 2.375);
    root.add(indicator);
  }

  // White smile/teeth panel plus dark curved smile.  This is substantially closer to
  // the supplied front fascia than the old single black torus floating on red paint.
  const teeth = makeFacePanel([
    [-0.60,0.53],[-0.47,0.40],[-0.24,0.35],[0.24,0.35],[0.47,0.40],[0.60,0.53],
    [0.44,0.58],[0.20,0.61],[-0.20,0.61],[-0.44,0.58],
  ], 2.405, white, 'mcqueen_teeth', 0.014);
  teeth.renderOrder = 6;
  root.add(teeth);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.032, 8, 40, Math.PI * 1.05), black);
  mouth.position.set(0, 0.50, 2.425);
  mouth.rotation.z = -Math.PI * 0.51;
  mouth.scale.y = 0.72;
  mouth.name = 'mcqueen_mouth';
  root.add(mouth);
  root.userData.mcqueenMouth = mouth;

  // Sculpted hood bulge and Rust-eze medallion.  The circular plaque, gold rim and
  // layered text read much more like the reference's hood artwork than flat yellow text.
  const hoodBulge = new THREE.Mesh(new THREE.SphereGeometry(0.78, 28, 16), red);
  hoodBulge.scale.set(1.00, 0.17, 1.18);
  hoodBulge.position.set(0, 0.84, 1.22);
  root.add(hoodBulge);

  const hoodDisc = new THREE.Mesh(new THREE.CircleGeometry(0.58, 40), redDark);
  hoodDisc.scale.set(1.16, 0.68, 1);
  hoodDisc.rotation.x = -Math.PI / 2;
  hoodDisc.position.set(0, 0.958, 1.36);
  hoodDisc.renderOrder = 8;
  root.add(hoodDisc);
  const hoodRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.028, 8, 40), yellow);
  hoodRing.scale.set(1.16, 0.68, 1);
  hoodRing.rotation.x = -Math.PI / 2;
  hoodRing.position.set(0, 0.967, 1.36);
  hoodRing.renderOrder = 9;
  root.add(hoodRing);
  const hoodLogo = makeTextBadge('RUST-EZE', 0.96, 0.19, '#ffd65a');
  hoodLogo.position.set(0, 0.976, 1.36);
  hoodLogo.rotation.x = -Math.PI / 2;
  hoodLogo.renderOrder = 10;
  root.add(hoodLogo);

  // Roof 95 from the supplied reference.
  const roofNumberShadow = makeTextBadge('95', 0.62, 0.38, '#7d1518');
  roofNumberShadow.position.set(0.02, 1.348, -0.26);
  roofNumberShadow.rotation.x = -Math.PI / 2;
  roofNumberShadow.renderOrder = 8;
  root.add(roofNumberShadow);
  const roofNumber = makeTextBadge('95', 0.55, 0.34, '#ffd23c');
  roofNumber.position.set(0, 1.356, -0.25);
  roofNumber.rotation.x = -Math.PI / 2;
  roofNumber.renderOrder = 9;
  root.add(roofNumber);

  // Large side lightning graphic, #95, small sponsor blocks and yellow rocker stripe.
  for (const side of [-1, 1]) {
    const sideX = side * 1.001;
    const boltOuter = makeSidePanel([
      [1.48,0.74],[0.65,0.78],[0.23,0.71],[-0.42,0.82],[-0.12,0.67],
      [-1.42,0.57],[-0.48,0.69],[-0.04,0.58],[0.38,0.65]
    ], sideX, yellow, `mcqueen_lightning_outer_${side}`);
    boltOuter.renderOrder = 8;
    root.add(boltOuter);
    const boltInner = makeSidePanel([
      [1.30,0.71],[0.62,0.74],[0.26,0.69],[-0.17,0.75],[0.07,0.65],
      [-1.12,0.59],[-0.30,0.66],[0.06,0.59],[0.38,0.64]
    ], side * 1.008, orange, `mcqueen_lightning_inner_${side}`);
    boltInner.renderOrder = 9;
    root.add(boltInner);

    const numberShadow = makeTextBadge('95', 0.82, 0.48, '#8a1016');
    numberShadow.position.set(side * 1.018, 0.73, -0.20);
    numberShadow.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    numberShadow.renderOrder = 10;
    root.add(numberShadow);
    const number = makeTextBadge('95', 0.72, 0.43, '#ffd23c');
    number.position.set(side * 1.024, 0.75, -0.19);
    number.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    number.renderOrder = 11;
    root.add(number);

    const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.075, 2.05), yellow);
    rocker.position.set(side * 1.006, 0.34, -0.05);
    root.add(rocker);

    // Sponsor sticker cluster just aft of the front wheel, as in the reference.
    const sponsorColors = [0x3c76c5,0xf3cf39,0xe7e7e7,0xd8472f,0x3f9f56,0x202020,0xed8a25,0xe8e8e8,0x6b70b8];
    sponsorColors.forEach((color, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.075), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      sticker.position.set(side * 1.032, 0.52 + row * 0.085, 0.88 - col * 0.14);
      sticker.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      sticker.renderOrder = 12;
      root.add(sticker);
    });
  }

  // Rust-eze rear spoiler: broad red wing, black supports and yellow branding.
  const spoilerBlade = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.16, 0.35), redDark);
  spoilerBlade.position.set(0, 1.04, -2.19);
  spoilerBlade.rotation.x = 0.07;
  root.add(spoilerBlade);
  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.34, 0.15), black);
    upright.position.set(side * 0.57, 0.84, -2.10);
    root.add(upright);
    const endPlate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.31, 0.39), redDark);
    endPlate.position.set(side * 0.88, 1.03, -2.19);
    root.add(endPlate);
  }
  const spoilerLogo = makeTextBadge('RUSTEZE', 0.82, 0.16, '#ffe19b');
  spoilerLogo.position.set(0, 1.135, -2.19);
  spoilerLogo.rotation.x = -Math.PI / 2;
  spoilerLogo.renderOrder = 9;
  root.add(spoilerLogo);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.065, 0.25), black);
  splitter.position.set(0, 0.255, 2.31);
  root.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.095, 0.30), black);
  diffuser.position.set(0, 0.30, -2.31);
  root.add(diffuser);

  // Custom Lightyear race wheels.  These preserve the exact wheel-spin / steering
  // metadata used by the vehicle system while adding red multi-piece rims and visible
  // white tyre branding like the supplied image.
  const wheelRadius = 0.39;
  const wheelWidth = 0.285;
  for (const side of [-1, 1]) {
    for (const z of [1.40, -1.38]) {
      const steer = new THREE.Group();
      steer.position.set(side * (1.92 / 2 - wheelWidth * 0.48), wheelRadius, z);
      steer.userData.vehicleWheelSteer = z > 0;
      steer.userData.baseSteerY = 0;
      const spin = new THREE.Group();
      spin.userData.vehicleWheelSpin = true;
      spin.userData.wheelRadius = wheelRadius;

      const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 28), vehicleRubber());
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, wheelWidth * 0.88, 20), redDark);
      rim.rotation.z = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.070, wheelWidth * 0.94, 16), black);
      hub.rotation.z = Math.PI / 2;
      spin.add(tire, rim, hub);

      // Five chunky red spokes make the wheels legible even while spinning.
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelWidth * 0.86, 0.055, 0.21), redDark);
        spoke.rotation.x = (i / 5) * Math.PI * 2;
        spoke.position.x = side * 0.008;
        spin.add(spoke);
      }

      // White branding bands suggest the LIGHTYEAR lettering without texture-heavy
      // tyre atlases and remain clear at gameplay distance.
      for (const a of [-0.95, 0.95]) {
        const lettering = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.016, 6, 36, Math.PI * 0.72), new THREE.MeshBasicMaterial({ color: 0xf6f4ed }));
        lettering.rotation.y = Math.PI / 2;
        lettering.rotation.x = a;
        lettering.position.x = side * (wheelWidth * 0.52);
        spin.add(lettering);
      }

      steer.add(spin);
      root.add(steer);
    }
  }

  // Two small side-exit polished race pipes, kept subtle like the reference model.
  for (const side of [-1, 1]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.074, 0.30, 16), vehicleChrome());
    exhaust.rotation.z = Math.PI / 2;
    exhaust.position.set(side * 1.00, 0.34, -1.44);
    root.add(exhaust);
  }

  root.userData.driverSeat = undefined;
  root.userData.mcqueenCharacter = true;
  collectVehicleVisualNodes(root);
  return root;
}

/** Stylised citizen avatar that can be seated inside traffic or shown getting in/out. */
export function createTrafficDriverAvatar(variant = 0, seated = true): THREE.Group {
  const root=createGenericCitizenNPC(variant);
  root.name=`traffic_driver_${variant}`;
  if (seated) {
    // The lower body sits below the window line, while the head/torso remain clearly visible.
    const scale=0.46;
    root.scale.setScalar(scale);
    const legL=root.getObjectByName('leg_left'); const legR=root.getObjectByName('leg_right');
    const armL=root.getObjectByName('arm_left'); const armR=root.getObjectByName('arm_right');
    if (legL) legL.rotation.x=-1.18; if (legR) legR.rotation.x=-1.18;
    if (armL) { armL.rotation.x=-0.88; armL.rotation.z=-0.22; }
    if (armR) { armR.rotation.x=-0.88; armR.rotation.z=0.22; }
  }
  root.userData.isTrafficDriver=true;
  return root;
}

export function createCityBusModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'city_bus';
  const bodyMat = vehiclePaint(0xe5b830);
  const lowerMat = vehicleMatteBlack();
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.48, metalness: 0.18 });
  const glassMat = vehicleGlass(0x77abc1, 0.38);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x355c7d, roughness: 0.78, metalness: 0.04 });
  const skinMat = createMaterial(0xf2b78d, 0.8, 0.02);

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.86, 2.30, 8.2), bodyMat); body.position.y=1.72; body.castShadow=true;
  const lower = new THREE.Mesh(new THREE.BoxGeometry(2.92,0.60,8.28),lowerMat); lower.position.y=0.55;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.90,0.20,8.18),trimMat); roof.position.y=2.97;
  root.add(body,lower,roof);
  const frontGlass=new THREE.Mesh(new THREE.BoxGeometry(2.48,1.20,0.055),glassMat); frontGlass.position.set(0,2.04,4.12); frontGlass.rotation.x=-0.06; root.add(frontGlass);
  const rearGlass=frontGlass.clone(); rearGlass.position.z=-4.12; rearGlass.rotation.x=0.03; root.add(rearGlass);
  for (const side of [-1,1]) for (let i=0;i<6;i++) { const window=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.90,1.00),glassMat); window.position.set(side*1.445,2.04,3.10-i*1.22); root.add(window); }
  const doorGlass=new THREE.Mesh(new THREE.BoxGeometry(0.05,1.55,1.15),glassMat); doorGlass.position.set(1.45,1.50,2.90); root.add(doorGlass);
  const passengerPositions:Array<[number,number,number]>=[[-0.70,1.17,2.6],[0.68,1.17,1.85],[-0.68,1.17,0.95],[0.68,1.17,0.05],[-0.68,1.17,-0.85],[0.68,1.17,-1.75],[-0.68,1.17,-2.65],[0.68,1.17,-3.2]];
  passengerPositions.forEach(([x,y,z],i)=>{ const passenger=new THREE.Group(); const seat=new THREE.Mesh(new THREE.BoxGeometry(0.68,0.70,0.66),seatMat); seat.position.y=0.35; const torso=new THREE.Mesh(new THREE.BoxGeometry(0.44,0.60,0.32),createMaterial(i%3===0?0xd84315:i%3===1?0x2e7d32:0x5e35b1)); torso.position.y=0.90; const head=new THREE.Mesh(new THREE.SphereGeometry(0.21,8,6),skinMat); head.position.y=1.38; passenger.add(seat,torso,head); passenger.position.set(x,y,z); root.add(passenger); });
  const driverSeat=new THREE.Mesh(new THREE.BoxGeometry(0.65,0.76,0.65),seatMat); driverSeat.position.set(-0.68,1.15,3.10); root.add(driverSeat);
  root.userData.driverSeat={x:-0.68,y:1.15,z:3.10,scale:0.46};
  buildSimpleWheelSet(root,2.86,2.55,-2.45,0.48,0x3a3d40); collectVehicleVisualNodes(root); root.userData.passengerCount=8; return root;
}

export function createRiverBoatModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'river_boat';

  // Purpose-built stylised runabout rather than a stack of car-like boxes. The
  // model origin sits on the waterline so CarPhysics can keep the craft at the
  // authored river height without visually sinking or hovering.
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.24, metalness: 0.12 });
  const accentMat = vehiclePaint(0xc9272f);
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xe7dfcb, roughness: 0.58, metalness: 0.02 });
  const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x222b31, roughness: 0.56, metalness: 0.08 });
  const upholsteryMat = new THREE.MeshStandardMaterial({ color: 0x235d7d, roughness: 0.62, metalness: 0.02 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.82, metalness: 0.01 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xc9d1d6, roughness: 0.28, metalness: 0.72 });
  const glassMat = vehicleGlass(0x79b6cf, 0.34);
  const redLightMat = new THREE.MeshStandardMaterial({ color: 0xd51f2a, emissive: 0x8a0810, emissiveIntensity: 0.75, roughness: 0.38 });
  const greenLightMat = new THREE.MeshStandardMaterial({ color: 0x39b66d, emissive: 0x126b35, emissiveIntensity: 0.75, roughness: 0.38 });

  type HullStation = { z: number; halfWidth: number; gunwaleY: number; chineY: number; keelY: number };
  const stations: HullStation[] = [
    { z: -3.35, halfWidth: 1.22, gunwaleY: 0.58, chineY: -0.08, keelY: -0.54 },
    { z: -1.65, halfWidth: 1.43, gunwaleY: 0.66, chineY: -0.12, keelY: -0.67 },
    { z:  0.55, halfWidth: 1.48, gunwaleY: 0.72, chineY: -0.10, keelY: -0.72 },
    { z:  2.35, halfWidth: 1.02, gunwaleY: 0.78, chineY: -0.02, keelY: -0.60 },
    { z:  3.55, halfWidth: 0.10, gunwaleY: 0.68, chineY:  0.05, keelY: -0.36 },
  ];

  const makeHullGeometry = () => {
    // Five points per cross-section: port gunwale -> port chine -> keel ->
    // starboard chine -> starboard gunwale. Longitudinal quads create a clean
    // V-bottom hull whose collision silhouette visually matches the boat.
    const verts: number[] = [];
    const indices: number[] = [];
    for (const station of stations) {
      verts.push(
        -station.halfWidth, station.gunwaleY, station.z,
        -station.halfWidth * 0.86, station.chineY, station.z,
        0, station.keelY, station.z,
        station.halfWidth * 0.86, station.chineY, station.z,
        station.halfWidth, station.gunwaleY, station.z,
      );
    }
    const cols = 5;
    for (let s = 0; s < stations.length - 1; s++) {
      const a = s * cols;
      const b = (s + 1) * cols;
      for (let c = 0; c < cols - 1; c++) {
        indices.push(a + c, b + c, b + c + 1, a + c, b + c + 1, a + c + 1);
      }
    }
    // Close stern and bow below the deck line.
    indices.push(0, 1, 2, 0, 2, 3, 0, 3, 4);
    const last = (stations.length - 1) * cols;
    indices.push(last, last + 2, last + 1, last, last + 3, last + 2, last, last + 4, last + 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  const hull = new THREE.Mesh(makeHullGeometry(), hullMat);
  hull.name = 'boat_hull';
  hull.castShadow = true;
  hull.receiveShadow = true;
  root.add(hull);

  // Red boot stripe follows the hull sides above the waterline and makes the
  // silhouette read clearly from the dock and chase camera.
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 5.95), accentMat);
    stripe.position.set(side * 1.37, 0.39, -0.12);
    stripe.rotation.x = -0.015;
    root.add(stripe);
  }

  // Deck pieces leave a dark recessed cockpit instead of covering the boat with
  // one flat rectangle.
  const bowDeck = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.12, 2.30), deckMat);
  bowDeck.position.set(0, 0.79, 2.15);
  bowDeck.rotation.x = -0.035;
  root.add(bowDeck);
  const rearDeck = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.12, 1.05), deckMat);
  rearDeck.position.set(0, 0.69, -2.72);
  root.add(rearDeck);
  for (const side of [-1, 1]) {
    const sideDeck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 4.35), deckMat);
    sideDeck.position.set(side * 1.27, 0.73, -0.24);
    root.add(sideDeck);
  }
  const cockpitWell = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.16, 3.35), cockpitMat);
  cockpitWell.position.set(0, 0.66, -0.55);
  root.add(cockpitWell);

  const makeSeat = (x: number, z: number, rotationY = 0) => {
    const seat = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.24, 0.70), upholsteryMat);
    base.position.y = 0.12;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.78, 0.18), upholsteryMat);
    back.position.set(0, 0.56, -0.30);
    back.rotation.x = -0.10;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.46, 10), metalMat);
    pedestal.position.y = -0.17;
    seat.add(base, back, pedestal);
    seat.position.set(x, 1.00, z);
    seat.rotation.y = rotationY;
    root.add(seat);
    return seat;
  };

  makeSeat(-0.62, 0.25);
  makeSeat(0.62, 0.25);
  makeSeat(-0.62, -1.22);
  makeSeat(0.62, -1.22);

  // Driver console and steering wheel.
  const consoleBody = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.66, 0.56), cockpitMat);
  consoleBody.position.set(-0.60, 1.26, 0.95);
  consoleBody.rotation.x = -0.10;
  root.add(consoleBody);
  const gauges = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.24, 0.035), new THREE.MeshStandardMaterial({ color: 0x7ca6b6, emissive: 0x16323d, emissiveIntensity: 0.35, roughness: 0.35 }));
  gauges.position.set(-0.60, 1.45, 0.64);
  gauges.rotation.x = -0.14;
  root.add(gauges);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.038, 8, 18), rubberMat);
  steering.position.set(-0.60, 1.35, 0.48);
  steering.rotation.x = Math.PI / 2 + 0.30;
  root.add(steering);

  // Three-piece wraparound windscreen. Clear glass lets the driver/seats remain
  // visible rather than hiding the unfinished interior behind black windows.
  const centerGlass = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.63, 0.055), glassMat);
  centerGlass.position.set(0, 1.63, 1.13);
  centerGlass.rotation.x = -0.18;
  root.add(centerGlass);
  for (const side of [-1, 1]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.58, 0.05), glassMat);
    sideGlass.position.set(side * 0.94, 1.59, 0.91);
    sideGlass.rotation.set(-0.14, side * 0.44, 0);
    root.add(sideGlass);
  }

  const addRail = (a: THREE.Vector3, b: THREE.Vector3, radius = 0.025) => {
    const delta = b.clone().sub(a);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), metalMat);
    rail.position.copy(a).add(b).multiplyScalar(0.5);
    rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    root.add(rail);
    return rail;
  };
  for (const side of [-1, 1]) {
    const x = side * 1.14;
    addRail(new THREE.Vector3(x, 0.84, 1.52), new THREE.Vector3(side * 0.78, 0.93, 3.00));
    addRail(new THREE.Vector3(x, 1.04, 1.52), new THREE.Vector3(side * 0.78, 1.13, 3.00));
    addRail(new THREE.Vector3(x, 0.84, 1.52), new THREE.Vector3(x, 1.04, 1.52));
    addRail(new THREE.Vector3(side * 0.78, 0.93, 3.00), new THREE.Vector3(side * 0.78, 1.13, 3.00));
  }

  // Navigation lights on the bow rails.
  const portLight = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), redLightMat);
  portLight.position.set(-0.78, 1.17, 2.96);
  const starboardLight = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), greenLightMat);
  starboardLight.position.set(0.78, 1.17, 2.96);
  root.add(portLight, starboardLight);

  // Proper outboard: cowl above the transom, narrow leg into the water and a
  // visible propeller. It remains decorative; propulsion still comes from the
  // stable existing water CarPhysics controller.
  const motor = new THREE.Group();
  motor.name = 'outboard_motor';
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.72, 0.68), rubberMat);
  cowl.position.y = 0.52;
  cowl.rotation.x = -0.05;
  const cowlCap = new THREE.Mesh(new THREE.BoxGeometry(0.79, 0.10, 0.62), accentMat);
  cowlCap.position.y = 0.89;
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.86, 0.18), metalMat);
  leg.position.y = -0.22;
  const gearbox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.44), metalMat);
  gearbox.position.set(0, -0.62, 0.06);
  const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 8), metalMat);
  propHub.rotation.z = Math.PI / 2;
  propHub.position.set(0, -0.62, -0.25);
  const bladeGeo = new THREE.BoxGeometry(0.05, 0.40, 0.12);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, metalMat);
    blade.position.copy(propHub.position);
    blade.rotation.z = (i / 3) * Math.PI * 2;
    motor.add(blade);
  }
  motor.add(cowl, cowlCap, leg, gearbox, propHub);
  motor.position.set(0, 0.16, -3.58);
  root.add(motor);

  // A soft rubber rub-rail protects the visible gunwale edge.
  for (const side of [-1, 1]) {
    const rubRail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 5.55), rubberMat);
    rubRail.position.set(side * 1.42, 0.68, -0.25);
    root.add(rubRail);
  }

  root.userData.isBoat = true;
  root.userData.realWorldDimensions = { length: 7.35, width: 2.90, height: 2.40 };
  root.userData.vehicleCollisionRadius = 1.48;
  root.userData.vehicleCollisionHeight = 2.25;
  root.userData.vehicleExitOffset = 2.25;
  root.userData.driverSeat = { x: -0.62, y: 1.10, z: 0.25, scale: 0.46 };
  root.userData.vehicleCamera = { baseDistance: 8.8, speedDistance: 3.6, height: 3.9, speedHeight: 1.2, lookHeight: 1.05 };
  collectVehicleVisualNodes(root);
  return root;
}

export function createVehicleModel(modelType: string, colorHex?: number): THREE.Group {
  switch (modelType) {
    case 'bmw_f80_m3':
      return createBMWF80M3Model().mesh;
    case 'bmw_g80_m3':
      return createBMWG80M3Model().mesh;
    case 'bmw_f90_m5':
      return createBMWF90M5Model().mesh;
    case 'lamborghini_aventador':
      return createLamborghiniAventadorModel().mesh;
    case 'ferrari_f12':
      return createFerrariF12Model().mesh;
    case 'delorean':
    case 'delorean_time_machine':
      return createDeLoreanTimeMachineModel().mesh;
    case 'homer_sedan':
    case 'pink_sedan':
    case 'simpsons_family_sedan':
      return createPinkSedanModel();
    case 'speed_rocket':
      return createSpeedRocketModel();
    case 'canyonero':
      return createCanyoneroModel();
    case 'mr_plow':
      return createMrPlowModel();
    case 'car_built_for_homer':
      return createCarBuiltForHomerModel();
    case 'peppa_family_car':
      return createPeppaFamilyCarModel();
    case 'police_cruiser':
      return createPoliceCruiserModel();
    case 'police_suv':
      return createPoliceSUVModel();
    case 'city_bus':
      return createCityBusModel();
    case 'lightning_mcqueen':
      return createLightningMcQueenModel();
    case 'traffic_convertible':
      return createTrafficConvertibleModel(colorHex);
    case 'traffic_sedan':
    default:
      return createTrafficSedanModel(colorHex);
  }
}

// ----------------------------------------------------
// 5. POKÉ BALL (FOR 1-SECOND SWITCH ANIMATION)
// ----------------------------------------------------
export function createPokeBallModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'pokeball_switch';

  const redMat = createMaterial(0xd32f2f, 0.2, 0.2);
  const whiteMat = createMaterial(0xffffff, 0.2, 0.2);
  const blackMat = createMaterial(0x111111, 0.5, 0.1);

  const topHalf = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    redMat
  );

  const bottomHalf = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    whiteMat
  );

  const centerBand = new THREE.Mesh(new THREE.CylinderGeometry(0.505, 0.505, 0.08, 16), blackMat);
  centerBand.position.y = 0;

  const buttonRing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 12), blackMat);
  buttonRing.rotation.x = Math.PI / 2;
  buttonRing.position.set(0, 0, 0.5);

  const buttonCore = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), whiteMat);
  buttonCore.rotation.x = Math.PI / 2;
  buttonCore.position.set(0, 0, 0.51);

  root.add(topHalf, bottomHalf, centerBand, buttonRing, buttonCore);
  return root;
}


// ----------------------------------------------------
// PHASE 2: LOW-POLY OPEN-WORLD CAMEOS & ROAMING POKÉMON
// ----------------------------------------------------
// These models intentionally use cheap primitive geometry so the world can contain
// lots of recognizable, goofy characters without destroying browser performance.

type CameoHumanoidOptions = {
  name: string;
  skin: number;
  torso: number;
  legs: number;
  boots?: number;
  hair?: number;
  scale?: number;
  cape?: number;
  combatWeight?: number;
};

function createCameoHumanoid(options: CameoHumanoidOptions): THREE.Group {
  const root = new THREE.Group();
  root.name = options.name;
  root.userData.combatWeight = options.combatWeight ?? 1;
  root.userData.movementMode = 'ground';

  const skinMat = createMaterial(options.skin);
  const torsoMat = createMaterial(options.torso);
  const legsMat = createMaterial(options.legs);
  const bootMat = createMaterial(options.boots ?? 0x27272a);
  const darkMat = createMaterial(0x111827);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.0, 0.42), torsoMat);
  torso.position.y = 1.25;
  torso.castShadow = true;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), skinMat);
  head.position.y = 2.05;
  head.castShadow = true;
  root.add(head);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 4), darkMat);
  eyeL.position.set(-0.12, 2.1, 0.32);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.12;
  root.add(eyeL, eyeR);

  if (options.hair !== undefined) {
    const hair = new THREE.Mesh(new THREE.DodecahedronGeometry(0.39, 0), createMaterial(options.hair));
    hair.scale.set(1, 0.55, 1);
    hair.position.set(0, 2.28, -0.03);
    root.add(hair);
  }

  const armGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.82, 6);
  const armL = new THREE.Mesh(armGeo, torsoMat);
  armL.name = 'arm_left';
  armL.position.set(-0.49, 1.25, 0);
  const armR = new THREE.Mesh(armGeo, torsoMat);
  armR.name = 'arm_right';
  armR.position.set(0.49, 1.25, 0);
  root.add(armL, armR);

  const legGeo = new THREE.CylinderGeometry(0.14, 0.13, 0.75, 6);
  const legL = new THREE.Mesh(legGeo, legsMat);
  legL.name = 'leg_left';
  legL.position.set(-0.2, 0.52, 0);
  const legR = new THREE.Mesh(legGeo, legsMat);
  legR.name = 'leg_right';
  legR.position.set(0.2, 0.52, 0);
  root.add(legL, legR);

  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.16, 0.45), bootMat);
  shoeL.position.set(-0.2, 0.10, 0.08);
  const shoeR = shoeL.clone();
  shoeR.position.x = 0.2;
  root.add(shoeL, shoeR);

  if (options.cape !== undefined) {
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.45), createMaterial(options.cape));
    cape.name = 'cape';
    cape.position.set(0, 1.35, -0.28);
    cape.rotation.x = -0.08;
    root.add(cape);
  }

  const s = options.scale ?? 1;
  root.scale.setScalar(s);
  return root;
}

export function createAnakinSkywalkerNPC(): THREE.Group {
  const root = createCameoHumanoid({
    name: 'npc_anakin_skywalker',
    skin: 0xf0c49a, torso: 0x72563f, legs: 0x3b2f2f, boots: 0x211915, hair: 0x3f2b20,
    combatWeight: 1.05,
  });
  const saber = new THREE.Group();
  saber.name = 'signature_prop';
  saber.position.set(0.58, 1.1, 0.25);
  saber.rotation.z = -0.18;
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 6), createMaterial(0x7c8791, 0.25, 0.8));
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), createMaterial(0x43a5ff, 0.05, 0.25));
  blade.position.y = 0.82;
  saber.add(hilt, blade);
  root.add(saber);
  return root;
}

export function createGordonRamsayNPC(): THREE.Group {
  const root = createCameoHumanoid({
    name: 'npc_gordon_ramsay',
    skin: 0xf0c7a5, torso: 0xf3f4f6, legs: 0x111827, boots: 0x111111, hair: 0xe5c07b,
    combatWeight: 1.05,
  });
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.08, 8), createMaterial(0x30343b, 0.4, 0.7));
  pan.rotation.x = Math.PI / 2;
  pan.position.set(0.65, 1.15, 0.35);
  root.add(pan);
  return root;
}

export function createShrekNPC(): THREE.Group {
  const root = createCameoHumanoid({
    name: 'npc_shrek',
    skin: 0x79a83b, torso: 0xe0d3ad, legs: 0x6b4f35, boots: 0x4b3621, hair: 0x4d6d2e,
    scale: 1.22, combatWeight: 2.1,
  });
  const earMat = createMaterial(0x79a83b);
  [-1, 1].forEach((sign) => {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.38, 6), earMat);
    ear.rotation.z = sign * Math.PI / 2;
    ear.position.set(sign * 0.48, 2.12, 0);
    root.add(ear);
  });
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.9, 0.08), createMaterial(0x5a4937));
  vest.position.set(0, 1.28, 0.25);
  root.add(vest);
  return root;
}

export function createBatmanNPC(): THREE.Group {
  const root = createCameoHumanoid({
    name: 'npc_batman',
    skin: 0xd5b08b, torso: 0x20242b, legs: 0x15181d, boots: 0x0b0d10, cape: 0x0d1015,
    combatWeight: 1.25,
  });
  const cowlMat = createMaterial(0x101318);
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.37, 6, 6), cowlMat);
  cowl.scale.set(1, 0.7, 1);
  cowl.position.y = 2.18;
  root.add(cowl);
  [-1, 1].forEach((sign) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 4), cowlMat);
    ear.position.set(sign * 0.2, 2.58, 0);
    root.add(ear);
  });
  const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.13, 0.04), createMaterial(0xf5c518));
  emblem.position.set(0, 1.48, 0.25);
  root.add(emblem);
  return root;
}

export function createSpiderManNPC(): THREE.Group {
  const root = createCameoHumanoid({
    name: 'npc_spiderman',
    skin: 0xe53935, torso: 0xd92525, legs: 0x174ea6, boots: 0xd92525,
    combatWeight: 0.85,
  });
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.37, 8, 8), createMaterial(0xd92525));
  mask.position.y = 2.08;
  root.add(mask);
  const eyeMat = createMaterial(0xffffff);
  [-1, 1].forEach((sign) => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.19, 0.04), eyeMat);
    eye.position.set(sign * 0.13, 2.12, 0.35);
    eye.rotation.z = sign * 0.24;
    root.add(eye);
  });
  return root;
}

export function createMarioNPC(): THREE.Group {
  const root = createCameoHumanoid({
    name: 'npc_mario',
    skin: 0xf1bf94, torso: 0xd92b2b, legs: 0x2454a6, boots: 0x5a3321, hair: 0x5a3321,
    scale: 0.92, combatWeight: 1.15,
  });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.39, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), createMaterial(0xd92b2b));
  cap.position.y = 2.30;
  root.add(cap);
  const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.05), createMaterial(0x3a2418));
  moustache.position.set(0, 1.97, 0.35);
  root.add(moustache);
  return root;
}

export function createSonicNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_sonic';
  root.userData.combatWeight = 0.7;
  root.userData.movementMode = 'ground';
  root.userData.speedMultiplier = 1.75;
  const blue = createMaterial(0x1769d1);
  const tan = createMaterial(0xf0c38e);
  const white = createMaterial(0xffffff);
  const red = createMaterial(0xe52b2b);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 8), blue);
  body.position.y = 1.1;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), tan);
  belly.scale.set(1, 1.2, 0.35);
  belly.position.set(0, 1.05, 0.42);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), blue);
  head.position.y = 1.75;
  root.add(body, belly, head);
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.65, 5), blue);
    spike.rotation.x = Math.PI / 2;
    spike.position.set((i - 1.5) * 0.08, 1.75 + i * 0.07, -0.43 - i * 0.07);
    root.add(spike);
  }
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.65, 6), blue);
  legL.name = 'leg_left'; legL.position.set(-0.16, 0.47, 0);
  const legR = legL.clone(); legR.name = 'leg_right'; legR.position.x = 0.16;
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.52), red);
  shoeL.position.set(-0.16, 0.1, 0.14);
  const shoeR = shoeL.clone(); shoeR.position.x = 0.16;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 6), tan);
  armL.name = 'arm_left'; armL.position.set(-0.48, 1.08, 0);
  const armR = armL.clone(); armR.name = 'arm_right'; armR.position.x = 0.48;
  root.add(legL, legR, shoeL, shoeR, armL, armR);
  return root;
}

export function createMasterChiefNPC(): THREE.Group {
  const root = createCameoHumanoid({
    name: 'npc_master_chief',
    skin: 0x596846, torso: 0x506b3f, legs: 0x425839, boots: 0x222b24,
    scale: 1.08, combatWeight: 1.65,
  });
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.48, 0.58), createMaterial(0x455b37, 0.35, 0.4));
  helmet.position.y = 2.12;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.14, 0.04), createMaterial(0xd9a52e, 0.15, 0.7));
  visor.position.set(0, 2.12, 0.31);
  root.add(helmet, visor);
  return root;
}



/** Dedicated Peppa Pig family models. These intentionally use rounded pig/dress
 * proportions instead of the generic humanoid cameo skeleton. */
type PigFamilyModelOptions = {
  name: string;
  scale: number;
  outfit: number;
  dress?: boolean;
  glasses?: boolean;
  eyelashes?: boolean;
  beardDots?: boolean;
  dinosaur?: boolean;
  weight: number;
  speed: number;
};

function createPigFamilyMemberModel(opts: PigFamilyModelOptions): THREE.Group {
  const root = new THREE.Group();
  root.name = opts.name;
  const skin = createMaterial(0xf4a6b8);
  const skinDark = createMaterial(0xe789a1);
  const outfit = createMaterial(opts.outfit);
  const black = createMaterial(0x171717);
  const white = createMaterial(0xffffff);
  const cheekMat = createMaterial(0xe97f9a);

  // Pear/dress body, deliberately non-human in proportion.
  if (opts.dress) {
    const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 0.82, 12), outfit);
    dress.position.y = 0.82; root.add(dress);
  } else {
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), outfit);
    torso.scale.set(opts.beardDots ? 1.18 : 1.02, opts.beardDots ? 1.12 : 0.96, 0.86);
    torso.position.y = 0.90; root.add(torso);
  }

  // Large oval pig head with a pronounced forward snout.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 9), skin);
  head.scale.set(1.10, 0.94, 0.98); head.position.set(0, 1.58, 0.04); root.add(head);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.36, 12), skinDark);
  snout.rotation.x = Math.PI / 2; snout.position.set(0, 1.53, 0.43); root.add(snout);
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.027, 5, 4), black);
    nostril.position.set(side * 0.064, 1.57, 0.615); root.add(nostril);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.080, 7, 6), white);
    eye.position.set(side * 0.16, 1.78, 0.38); root.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.031, 5, 4), black);
    pupil.position.set(side * 0.16, 1.78, 0.452); root.add(pupil);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), skin);
    ear.scale.set(0.72, 1.28, 0.62); ear.position.set(side * 0.25, 2.02, -0.01); root.add(ear);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), cheekMat);
    cheek.scale.set(1.18, 0.75, 0.30); cheek.position.set(side * 0.27, 1.54, 0.41); root.add(cheek);
  }

  // Small smile line.
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 4, 10, Math.PI), black);
  smile.rotation.set(Math.PI / 2, 0, Math.PI); smile.position.set(0.05, 1.39, 0.445); root.add(smile);

  // Thin stick-like arms and legs match the show's simple silhouettes while still
  // carrying the canonical limb names used by walking/ragdoll/get-up animation.
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.55, 6), skin);
    arm.name = side < 0 ? 'arm_left' : 'arm_right';
    arm.position.set(side * 0.47, 0.94, 0.03); arm.rotation.z = side * -0.22; root.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), skin);
    hand.position.set(side * 0.53, 0.68, 0.03); root.add(hand);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.48, 6), skinDark);
    leg.name = side < 0 ? 'leg_left' : 'leg_right'; leg.position.set(side * 0.17, 0.28, 0); root.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.36), black);
    shoe.position.set(side * 0.17, 0.055, 0.09); root.add(shoe);
  }

  // Curly tail behind the body.
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.026, 5, 12, Math.PI * 1.55), skinDark);
  tail.position.set(-0.34, 0.92, -0.42); tail.rotation.set(Math.PI / 2, 0.30, -0.40); root.add(tail);

  if (opts.glasses) {
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 5, 12), black);
      lens.rotation.x = Math.PI / 2; lens.position.set(side * 0.15, 1.78, 0.438); root.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.025, 0.025), black);
    bridge.position.set(0, 1.78, 0.45); root.add(bridge);
  }
  if (opts.eyelashes) {
    for (const side of [-1, 1]) for (let i = -1; i <= 1; i++) {
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.11, 0.018), black);
      lash.position.set(side * 0.16 + i * 0.035, 1.90, 0.43); lash.rotation.z = i * 0.18; root.add(lash);
    }
  }
  if (opts.beardDots) {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 4), createMaterial(0x8e6570));
      dot.position.set(Math.cos(a) * 0.22, 1.43 + Math.sin(a) * 0.10, 0.46); root.add(dot);
    }
  }
  if (opts.dinosaur) {
    const dino = new THREE.Group(); dino.name = 'george_toy_dinosaur'; dino.position.set(0.45, 0.70, 0.15); dino.scale.setScalar(0.55);
    const green = createMaterial(0x4aa84e);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5), green); body.scale.set(1.35, 0.75, 0.75); dino.add(body);
    const headD = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), green); headD.position.set(0, 0.13, 0.20); dino.add(headD);
    const tailD = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.36, 5), green); tailD.rotation.x = -Math.PI / 2; tailD.position.set(0, 0, -0.29); dino.add(tailD);
    root.add(dino);
  }

  root.scale.setScalar(opts.scale);
  root.userData.combatWeight = opts.weight;
  root.userData.speedMultiplier = opts.speed;
  root.userData.pigFamilyMember = true;
  return root;
}

export const createPeppaPigNPC = () => createPigFamilyMemberModel({
  name: 'npc_peppa_pig', scale: 0.80, outfit: 0xd93645, dress: true, weight: 0.56, speed: 1.08,
});
export const createGeorgePigNPC = () => createPigFamilyMemberModel({
  name: 'npc_george_pig', scale: 0.66, outfit: 0x3f7fc3, dinosaur: true, weight: 0.43, speed: 1.03,
});
export const createMummyPigNPC = () => createPigFamilyMemberModel({
  name: 'npc_mummy_pig', scale: 1.03, outfit: 0xe87939, dress: true, eyelashes: true, weight: 1.02, speed: 0.96,
});
export const createDaddyPigNPC = () => createPigFamilyMemberModel({
  name: 'npc_daddy_pig', scale: 1.13, outfit: 0x4e9bb5, glasses: true, beardDots: true, weight: 1.42, speed: 0.90,
});

// -----------------------------------------------------------------------------
// HIGH-DETAIL MUSIC / PUBLIC-FIGURE CAMEOS
// -----------------------------------------------------------------------------
// Most crossover NPCs intentionally stay low-poly. These few real-person cameos use
// smoother, slightly denser geometry because their hairline, face shape, beard and
// clothing silhouette need to read from normal third-person gameplay distance.
// They still use procedural geometry only (no heavyweight portrait textures/assets),
// so the browser performance profile and existing NPC animation system are preserved.
type DetailedPublicFigureOptions = {
  name: string;
  skin: number;
  top: number;
  trousers: number;
  shoes?: number;
  scale?: number;
  build?: 'slim' | 'average' | 'broad' | 'oversized';
  headScale?: [number, number, number];
  eyeColor?: number;
  speedMultiplier?: number;
  combatWeight?: number;
};

const createSmoothCharacterMaterial = (color: number, roughness = 0.48, metalness = 0.02) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: false });

function createDetailedPublicFigureBase(options: DetailedPublicFigureOptions): THREE.Group {
  const root = new THREE.Group();
  root.name = options.name;
  root.userData.movementMode = 'ground';
  root.userData.highDetailLikeness = true;
  root.userData.speedMultiplier = options.speedMultiplier ?? 1;
  root.userData.combatWeight = options.combatWeight ?? 1;

  const skin = createSmoothCharacterMaterial(options.skin, 0.58, 0.01);
  const top = createSmoothCharacterMaterial(options.top, 0.52, 0.025);
  const trousers = createSmoothCharacterMaterial(options.trousers, 0.56, 0.025);
  const shoes = createSmoothCharacterMaterial(options.shoes ?? 0x17191c, 0.42, 0.07);
  const white = createSmoothCharacterMaterial(0xf7f5ef, 0.50, 0.01);
  const dark = createSmoothCharacterMaterial(0x15171a, 0.48, 0.02);
  const iris = createSmoothCharacterMaterial(options.eyeColor ?? 0x49362c, 0.38, 0.03);

  const buildScale = options.build === 'slim' ? 0.90 : options.build === 'broad' ? 1.13 : options.build === 'oversized' ? 1.20 : 1;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34 * buildScale, 0.58, 8, 16), top);
  torso.name = 'torso';
  torso.position.set(0, 1.29, 0);
  torso.scale.z = 0.74;
  root.add(torso);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.145, 0.22, 12), skin);
  neck.position.set(0, 1.88, 0);
  root.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.355, 18, 14), skin);
  head.name = 'head';
  const hs = options.headScale ?? [0.96, 1.08, 0.90];
  head.scale.set(hs[0], hs[1], hs[2]);
  head.position.set(0, 2.13, 0.015);
  root.add(head);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.064, 10, 8), skin);
    ear.scale.set(0.58, 1.08, 0.48);
    ear.position.set(side * 0.345 * hs[0], 2.13, 0.005);
    root.add(ear);

    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), white);
    eyeWhite.scale.set(1.12, 0.72, 0.46);
    eyeWhite.position.set(side * 0.122, 2.17, 0.314);
    const eyeIris = new THREE.Mesh(new THREE.SphereGeometry(0.025, 9, 7), iris);
    eyeIris.position.set(side * 0.122, 2.168, 0.352);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), dark);
    pupil.position.set(side * 0.122, 2.168, 0.373);
    root.add(eyeWhite, eyeIris, pupil);

    const eyebrow = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.026, 0.021), dark);
    eyebrow.position.set(side * 0.122, 2.245, 0.325);
    eyebrow.rotation.z = side * -0.045;
    root.add(eyebrow);

    // Limb groups pivot from their natural joints so the existing NPC gait/get-up
    // animation can rotate these named nodes without deforming the likeness details.
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'arm_left' : 'arm_right';
    arm.position.set(side * (0.42 * buildScale), 1.63, 0);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.105 * buildScale, 0.43, 6, 10), top);
    sleeve.position.y = -0.29;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), skin);
    hand.scale.set(0.92, 1.08, 0.82);
    hand.position.set(0, -0.62, 0.01);
    arm.add(sleeve, hand);
    root.add(arm);

    const leg = new THREE.Group();
    leg.name = side < 0 ? 'leg_left' : 'leg_right';
    leg.position.set(side * (0.175 * Math.min(buildScale, 1.08)), 0.80, 0);
    const trouserLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.125 * Math.min(buildScale, 1.08), 0.45, 6, 10), trousers);
    trouserLeg.position.y = -0.34;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.16, 0.47), shoes);
    shoe.position.set(0, -0.73, 0.095);
    shoe.rotation.x = -0.02;
    leg.add(trouserLeg, shoe);
    root.add(leg);
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.073, 10, 8), skin);
  nose.scale.set(0.72, 1.22, 1.05);
  nose.position.set(0, 2.075, 0.342);
  root.add(nose);

  const lips = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.085, 4, 8), createSmoothCharacterMaterial(0x9b5c55, 0.58, 0.01));
  lips.rotation.z = Math.PI / 2;
  lips.position.set(0, 1.965, 0.322);
  root.add(lips);

  root.scale.setScalar(options.scale ?? 1);
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return root;
}

function addDetailedHairCap(root: THREE.Group, color: number, y = 2.36, scale: [number, number, number] = [1, 0.58, 1]) {
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.37, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.60), createSmoothCharacterMaterial(color, 0.68, 0.01));
  cap.position.set(0, y, -0.025);
  cap.scale.set(scale[0], scale[1], scale[2]);
  root.add(cap);
  return cap;
}

function addDetailedBeard(root: THREE.Group, color: number, fullness = 1) {
  const beardMat = createSmoothCharacterMaterial(color, 0.78, 0.01);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.245, 14, 10), beardMat);
  chin.scale.set(1.18 * fullness, 0.76, 0.72);
  chin.position.set(0, 1.975, 0.205);
  root.add(chin);
  for (const side of [-1, 1]) {
    const jaw = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.28, 5, 9), beardMat);
    jaw.position.set(side * 0.225, 2.035, 0.225);
    jaw.rotation.z = side * 0.44;
    root.add(jaw);
  }
  const moustache = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.16, 4, 8), beardMat);
  moustache.rotation.z = Math.PI / 2;
  moustache.position.set(0, 2.015, 0.342);
  root.add(moustache);
}

function addDetailedChain(root: THREE.Group, color = 0xd9bd66, radius = 0.22, y = 1.63) {
  const chain = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 6, 24, Math.PI * 1.18), createSmoothCharacterMaterial(color, 0.27, 0.72));
  chain.position.set(0, y, 0.30);
  chain.rotation.z = Math.PI * 0.91;
  root.add(chain);
  return chain;
}

function addDetailedSunglasses(root: THREE.Group) {
  const frameMat = createSmoothCharacterMaterial(0x111318, 0.34, 0.16);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x1b2329, roughness: 0.16, metalness: 0.30, transparent: true, opacity: 0.92 });
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 9), lensMat);
    lens.scale.set(1.18, 0.67, 0.20);
    lens.position.set(side * 0.125, 2.17, 0.355);
    root.add(lens);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.012, 5, 16), frameMat);
    rim.scale.set(1.18, 0.70, 1);
    rim.position.set(side * 0.125, 2.17, 0.374);
    root.add(rim);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.018, 0.018), frameMat);
  bridge.position.set(0, 2.17, 0.375);
  root.add(bridge);
}

function addHairStrand(root: THREE.Group, color: number, x: number, y: number, z: number, length: number, radius = 0.04, rotZ = 0, rotX = 0) {
  const strand = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.08, length - radius * 2), 5, 9), createSmoothCharacterMaterial(color, 0.76, 0.01));
  strand.position.set(x, y, z);
  strand.rotation.z = rotZ;
  strand.rotation.x = rotX;
  root.add(strand);
  return strand;
}

function createMortySmithCameo(): THREE.Group {
  const r = new THREE.Group();
  r.name = 'npc_morty_smith';
  r.userData.movementMode = 'ground';
  r.userData.combatWeight = 0.78;
  r.userData.speedMultiplier = 1.08;
  r.userData.highDetailLikeness = true;
  const skin = createSmoothCharacterMaterial(0xf2c29b, 0.62, 0.01);
  const yellow = createSmoothCharacterMaterial(0xf2d64b, 0.55, 0.01);
  const blue = createSmoothCharacterMaterial(0x315f94, 0.56, 0.02);
  const white = createSmoothCharacterMaterial(0xf8f7ef, 0.50, 0.01);
  const brown = createSmoothCharacterMaterial(0x5a3927, 0.72, 0.01);
  const dark = createSmoothCharacterMaterial(0x171719, 0.55, 0.01);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.45, 7, 14), yellow);
  torso.position.set(0, 1.18, 0); torso.scale.z = 0.78; r.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.40, 16, 13), skin);
  head.scale.set(0.94, 1.05, 0.91); head.position.set(0, 1.93, 0.02); r.add(head);
  addDetailedHairCap(r, 0x5a3927, 2.20, [1.00, 0.74, 1.02]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.24, 6), brown);
    tuft.position.set(Math.cos(a) * 0.28, 2.23 + Math.sin(a) * 0.025, Math.sin(a) * 0.23 - 0.04);
    tuft.rotation.z = Math.cos(a) * -0.52;
    tuft.rotation.x = Math.sin(a) * 0.45;
    r.add(tuft);
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.092, 10, 8), white);
    eye.scale.set(0.86, 1.18, 0.50); eye.position.set(side * 0.13, 2.01, 0.36); r.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 6), dark);
    pupil.position.set(side * 0.13, 2.00, 0.408); r.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.02), brown);
    brow.position.set(side * 0.13, 2.12, 0.36); brow.rotation.z = side * 0.18; r.add(brow);

    const arm = new THREE.Group(); arm.name = side < 0 ? 'arm_left' : 'arm_right'; arm.position.set(side * 0.39, 1.42, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 5, 9), skin); upper.position.y = -0.27;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 7), skin); hand.position.y = -0.53;
    arm.add(upper, hand); r.add(arm);

    const leg = new THREE.Group(); leg.name = side < 0 ? 'leg_left' : 'leg_right'; leg.position.set(side * 0.15, 0.72, 0);
    const pant = new THREE.Mesh(new THREE.CapsuleGeometry(0.10, 0.40, 5, 9), blue); pant.position.y = -0.31;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.42), white); shoe.position.set(0, -0.66, 0.09);
    leg.add(pant, shoe); r.add(leg);
  }
  const worriedMouth = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 5, 14, Math.PI), dark);
  worriedMouth.position.set(0, 1.79, 0.365); worriedMouth.rotation.z = 0; r.add(worriedMouth);
  r.scale.setScalar(0.92);
  r.traverse((obj) => { if (obj instanceof THREE.Mesh) { obj.castShadow = true; obj.receiveShadow = true; } });
  return r;
}


/**
 * Lightweight low-poly crossover cameo factory. The goal is recognisable silhouettes,
 * colours and signature props without importing heavy copyrighted meshes or textures.
 * This keeps dozens of surprise characters cheap enough for the browser open world.
 */
export function createPopCultureCameoNPC(kind: string): THREE.Group {
  const k = kind.toLowerCase();
  const humanoid = (name: string, torso: number, legs: number, skin = 0xf1bf94, hair = 0x3d2a1d, scale = 1, cape?: number) =>
    createCameoHumanoid({ name, skin, torso, legs, boots: 0x242424, hair, scale, cape });
  const addSaber = (root: THREE.Group, color: number, side = 1) => {
    const prop = new THREE.Group(); prop.name = 'signature_prop';
    prop.position.set(0.58 * side, 1.12, 0.20); prop.rotation.z = -0.18 * side;
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.30, 6), createMaterial(0x87939c, 0.2, 0.8));
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.45, 6), new THREE.MeshBasicMaterial({ color }));
    blade.position.y = 0.84; prop.add(hilt, blade); root.add(prop);
  };
  const addHat = (root: THREE.Group, color: number, tall = false) => {
    const hat = new THREE.Mesh(tall ? new THREE.CylinderGeometry(0.36,0.43,0.55,8) : new THREE.SphereGeometry(0.40,8,6,0,Math.PI*2,0,Math.PI*0.55), createMaterial(color));
    hat.position.y = tall ? 2.42 : 2.30; root.add(hat);
  };
  const addEyes = (root: THREE.Group, color = 0xffffff, y=2.10, z=0.36) => {
    for (const sign of [-1,1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09,5,5), createMaterial(color)); e.position.set(sign*0.13,y,z); root.add(e); }
  };
  const capsule = (name:string, bodyColor:number, scale=1) => {
    const r=new THREE.Group(); r.name=name;
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.38,0.9,4,8),createMaterial(bodyColor)); body.position.y=0.95; r.add(body);
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.11,6,6),createMaterial(0xffffff)); eye.position.set(0,1.22,0.37); r.add(eye);
    const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.05,5,5),createMaterial(0x111111)); pupil.position.set(0,1.22,0.46); r.add(pupil);
    r.scale.setScalar(scale); return r;
  };


  // MUSIC / PUBLIC-FIGURE LIKENESSES -------------------------------------------------
  // These are intentionally authored as distinct silhouettes rather than generic bodies
  // with name labels. Research cues are translated into hair, grooming, proportions and
  // era-appropriate clothing while keeping the game's procedural/browser-friendly format.
  if (k === 'doc_brown') {
    return createDocBrownNPC();
  }
  if (k === 'marty_mcfly') {
    return createMartyMcFlyNPC();
  }
  if (k === 'jeffrey_epstein') {
    const r = createDetailedPublicFigureBase({
      name: 'npc_jeffrey_epstein', skin: 0xd9b090, top: 0x202a3a, trousers: 0x1a2230,
      shoes: 0x151515, build: 'slim', headScale: [0.90, 1.16, 0.86], scale: 1.03, speedMultiplier: 0.91,
    });
    // Receding grey-white hair: keep the forehead exposed and concentrate hair at
    // the sides/back instead of using the normal full cap.
    const grey = createSmoothCharacterMaterial(0xb9b9b2, 0.74, 0.01);
    for (const side of [-1, 1]) {
      const sideHair = new THREE.Mesh(new THREE.SphereGeometry(0.17, 13, 10), grey);
      sideHair.scale.set(0.62, 1.12, 0.78);
      sideHair.position.set(side * 0.255, 2.34, -0.06);
      r.add(sideHair);
    }
    const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), grey);
    backHair.scale.set(1.0, 0.55, 0.58); backHair.position.set(0, 2.38, -0.22); r.add(backHair);
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.58, 0.045), createSmoothCharacterMaterial(0xbfd2e5));
    shirt.position.set(0, 1.48, 0.267); r.add(shirt);
    const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.25, 0.045), createSmoothCharacterMaterial(0xe9edf0));
    collarL.position.set(-0.10, 1.72, 0.29); collarL.rotation.z = -0.25;
    const collarR = collarL.clone(); collarR.position.x = 0.10; collarR.rotation.z = 0.25; r.add(collarL, collarR);
    r.userData.cameoBehavior = 'reserved_walk';
    return r;
  }

  if (k === 'diddy') {
    const r = createDetailedPublicFigureBase({
      name: 'npc_diddy', skin: 0x7a4a34, top: 0x141619, trousers: 0x111316, shoes: 0x111111,
      build: 'average', headScale: [0.98, 1.05, 0.92], scale: 1.04, speedMultiplier: 0.98,
    });
    addDetailedHairCap(r, 0x171514, 2.35, [0.98, 0.24, 0.96]);
    addDetailedBeard(r, 0x221914, 0.72);
    addDetailedSunglasses(r);
    addDetailedChain(r, 0xe0c46f, 0.235, 1.62);
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.045), createSmoothCharacterMaterial(0xf0efeb));
    shirt.position.set(0, 1.47, 0.278); r.add(shirt);
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.54, 0.04), createSmoothCharacterMaterial(0x15171a));
      lapel.position.set(side * 0.12, 1.50, 0.306); lapel.rotation.z = side * 0.22; r.add(lapel);
    }
    r.userData.cameoBehavior = 'music_idle';
    return r;
  }

  if (k === 'billie_eilish') {
    const r = createDetailedPublicFigureBase({
      name: 'npc_billie_eilish', skin: 0xe8c9b8, top: 0x111416, trousers: 0x14181a, shoes: 0x22252a,
      build: 'oversized', headScale: [0.96, 1.05, 0.90], scale: 1.00, eyeColor: 0x83a8b3, speedMultiplier: 0.96,
    });
    // Requested 2019/2020 black-hair + bright green roots era. The neon crown is
    // deliberately oversized enough to remain readable from the driving camera.
    addDetailedHairCap(r, 0x101214, 2.37, [1.08, 0.75, 1.03]);
    const roots = new THREE.Mesh(new THREE.SphereGeometry(0.377, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), createSmoothCharacterMaterial(0x83e12a, 0.62, 0.01));
    roots.scale.set(1.075, 0.53, 1.01); roots.position.set(0, 2.40, -0.015); r.add(roots);
    for (const side of [-1, 1]) {
      addHairStrand(r, 0x0e1011, side * 0.30, 2.10, -0.04, 0.76, 0.065, side * -0.10, 0.02);
      addHairStrand(r, 0x151719, side * 0.23, 2.02, 0.11, 0.62, 0.055, side * -0.12, 0.08);
    }
    // Slouchy black streetwear with acid-green graphic bars and layered chains.
    const oversized = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.68, 0.54), createSmoothCharacterMaterial(0x111416));
    oversized.position.set(0, 1.34, 0); oversized.scale.y = 1.08; r.add(oversized);
    for (const y of [1.55, 1.36]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.085, 0.035), createSmoothCharacterMaterial(0x72cf28, 0.54, 0.02));
      stripe.position.set(0, y, 0.293); r.add(stripe);
    }
    addDetailedChain(r, 0xbac0c4, 0.20, 1.73);
    addDetailedChain(r, 0x8f969c, 0.25, 1.69);
    r.userData.cameoBehavior = 'music_idle';
    return r;
  }

  if (k === 'drake') {
    const r = createDetailedPublicFigureBase({
      name: 'npc_drake', skin: 0x9a684d, top: 0x16191c, trousers: 0x22252a, shoes: 0x111214,
      build: 'broad', headScale: [1.02, 1.02, 0.92], scale: 1.05, speedMultiplier: 0.99, combatWeight: 1.08,
    });
    // Classic skin-fade Caesar + hook part reads more immediately than later hair eras.
    addDetailedHairCap(r, 0x191615, 2.35, [1.03, 0.30, 1.00]);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.010, 5, 12, Math.PI * 1.25), createSmoothCharacterMaterial(0xb88769));
    hook.position.set(-0.17, 2.405, 0.27); hook.rotation.z = -0.35; r.add(hook);
    addDetailedBeard(r, 0x211816, 1.08);
    addDetailedChain(r, 0xd9b45d, 0.23, 1.64);
    const bomber = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.20, 0.48), createSmoothCharacterMaterial(0x23272b, 0.48, 0.04));
    bomber.position.set(0, 1.63, 0); r.add(bomber);
    r.userData.cameoBehavior = 'music_idle';
    return r;
  }

  if (k === 'juice_wrld') {
    const r = createDetailedPublicFigureBase({
      name: 'npc_juice_wrld', skin: 0x80523d, top: 0x2a2529, trousers: 0x1c1b20, shoes: 0x242327,
      build: 'average', headScale: [0.98, 1.04, 0.91], scale: 1.02, speedMultiplier: 1.03,
    });
    addDetailedHairCap(r, 0x3a251b, 2.35, [1.02, 0.38, 1.0]);
    const rootsColor = 0x4a2c1f;
    const tipsColor = 0xcaa159;
    const locks = [
      [-0.30,2.20,0.02,0.52,-0.16],[-0.20,2.17,0.18,0.58,-0.10],[-0.08,2.20,0.22,0.50,-0.04],
      [0.08,2.20,0.22,0.54,0.04],[0.20,2.17,0.18,0.60,0.10],[0.30,2.20,0.02,0.50,0.16],
      [-0.27,2.18,-0.16,0.56,-0.20],[0.27,2.18,-0.16,0.56,0.20],
    ] as const;
    locks.forEach(([x,y,z,len,rz]) => {
      addHairStrand(r, rootsColor, x, y, z, len * 0.62, 0.043, rz, 0.02);
      addHairStrand(r, tipsColor, x + rz * 0.13, y - len * 0.29, z + 0.01, len * 0.42, 0.041, rz, 0.02);
    });
    const hoodie = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.075, 7, 18, Math.PI * 1.35), createSmoothCharacterMaterial(0x3e333f));
    hoodie.position.set(0, 1.75, -0.03); hoodie.rotation.z = Math.PI * 0.83; r.add(hoodie);
    addDetailedChain(r, 0xc8cbd0, 0.215, 1.61);
    // Subtle purple/blue chest panel gives his colorful streetwear a clear mid-distance read.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.035), createSmoothCharacterMaterial(0x6c4c8f));
    panel.position.set(0, 1.39, 0.295); r.add(panel);
    r.userData.cameoBehavior = 'music_idle';
    return r;
  }

  if (k === 'central_cee') {
    const r = createDetailedPublicFigureBase({
      name: 'npc_central_cee', skin: 0xa87659, top: 0x24282d, trousers: 0x20242a, shoes: 0xf0f0ed,
      build: 'slim', headScale: [0.97, 1.04, 0.91], scale: 1.03, speedMultiplier: 1.06,
    });
    addDetailedHairCap(r, 0x171514, 2.34, [1.01, 0.27, 0.98]);
    // Tight cornrow paths across the scalp plus short side braids.
    for (const x of [-0.20, -0.10, 0, 0.10, 0.20]) {
      const row = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.020, 5, 18, Math.PI * 0.80), createSmoothCharacterMaterial(0x171514, 0.78, 0.01));
      row.scale.set(0.30, 1, 1); row.position.set(x, 2.38, 0.02); row.rotation.x = Math.PI / 2; r.add(row);
    }
    for (const side of [-1, 1]) addHairStrand(r, 0x171514, side * 0.28, 2.18, -0.03, 0.40, 0.036, side * -0.14, 0.02);
    // Tracksuit striping and jewellery are key silhouette/style cues.
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.74, 0.035), createSmoothCharacterMaterial(0xd6d8da));
      stripe.position.set(side * 0.42, 1.36, 0.16); r.add(stripe);
    }
    addDetailedChain(r, 0xd8c68d, 0.23, 1.64);
    addDetailedChain(r, 0xbec5ca, 0.27, 1.60);
    // Small dark tattoo strokes on neck/forearms without expensive texture maps.
    for (const x of [-0.07, 0.04]) {
      const tattoo = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.11, 0.012), createSmoothCharacterMaterial(0x3b2d2a));
      tattoo.position.set(x, 1.91, 0.145); tattoo.rotation.z = x < 0 ? -0.28 : 0.22; r.add(tattoo);
    }
    r.userData.cameoBehavior = 'music_idle';
    return r;
  }

  if (k === 'travis_scott') {
    const r = createDetailedPublicFigureBase({
      name: 'npc_travis_scott', skin: 0x704631, top: 0x292521, trousers: 0x1b1c1e, shoes: 0x2d2925,
      build: 'slim', headScale: [0.96, 1.08, 0.91], scale: 1.05, speedMultiplier: 1.04,
    });
    addDetailedHairCap(r, 0x151311, 2.35, [1.00, 0.27, 0.98]);
    // Jumbo box braids, including two face-hanging strands, are his strongest
    // gameplay-distance hair cue.
    const braidData = [
      [-0.28,2.17,0.02,0.66,-0.14],[-0.15,2.18,0.20,0.72,-0.08],[-0.04,2.20,0.25,0.70,-0.02],
      [0.09,2.18,0.23,0.68,0.04],[0.20,2.18,0.12,0.70,0.10],[0.30,2.18,-0.03,0.62,0.15],
    ] as const;
    braidData.forEach(([x,y,z,len,rz]) => {
      const braid = addHairStrand(r, 0x151311, x, y, z, len, 0.050, rz, 0.02);
      // Segment beads/ridges make the primitive lock read as a braid rather than a tube.
      for (let j = 0; j < 3; j++) {
        const bead = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 4, 10), createSmoothCharacterMaterial(0x27221f));
        bead.position.set(x + rz * j * 0.035, y - len * (0.16 + j * 0.21), z + 0.01); bead.rotation.x = Math.PI / 2; r.add(bead);
      }
      braid.rotation.y = rz * 0.15;
    });
    addDetailedBeard(r, 0x1e1713, 0.52);
    addDetailedChain(r, 0xc8c4b7, 0.21, 1.66);
    addDetailedChain(r, 0xd0ac59, 0.25, 1.61);
    const graphic = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.34, 0.035), createSmoothCharacterMaterial(0x7c4b32));
    graphic.position.set(0, 1.38, 0.29); r.add(graphic);
    r.userData.cameoBehavior = 'music_idle';
    return r;
  }

  if (k === 'kid_laroi') {
    const r = createDetailedPublicFigureBase({
      name: 'npc_kid_laroi', skin: 0xe4bd9d, top: 0x77685d, trousers: 0x23252a, shoes: 0xe9e7df,
      build: 'slim', headScale: [0.96, 1.08, 0.90], scale: 1.04, eyeColor: 0x7897a5, speedMultiplier: 1.07,
    });
    // Shaggy sandy-blond curls: use overlapping rounded locks so the hair stays
    // recognisable even when the camera is several metres away.
    const hairMat = createSmoothCharacterMaterial(0xb99166, 0.78, 0.01);
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2;
      const radius = i % 3 === 0 ? 0.30 : 0.34;
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.105 + (i % 2) * 0.018, 10, 8), hairMat);
      curl.scale.set(1.05, 1.18, 0.92);
      curl.position.set(Math.cos(a) * radius, 2.36 + Math.sin(a * 2.0) * 0.10, Math.sin(a) * 0.24 - 0.04);
      r.add(curl);
    }
    for (const x of [-0.19, -0.07, 0.08, 0.19]) {
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), hairMat);
      fringe.scale.set(0.86, 1.28, 0.78); fringe.position.set(x, 2.27, 0.255); r.add(fringe);
    }
    // Knit-jumper ribs, kept subtle enough not to turn into visual noise.
    for (let x = -0.28; x <= 0.28; x += 0.14) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.70, 0.020), createSmoothCharacterMaterial(0x8a786a));
      rib.position.set(x, 1.37, 0.282); r.add(rib);
    }
    addDetailedChain(r, 0xbec2c4, 0.19, 1.65);
    r.userData.cameoBehavior = 'music_idle';
    return r;
  }

  if (k === 'morty_smith') return createMortySmithCameo();
  // ENHANCEMENT: recognisable political / pop-culture cameos. These remain
  // deliberately primitive-based so they are cheap enough for the open world, but
  // each silhouette has character-specific hair, clothing, face and/or signature props.
  if (k === 'donald_trump') {
    const r = humanoid('npc_donald_trump', 0x16213a, 0x202633, 0xe6ae7b, 0xe7b84b, 1.05);
    r.userData.cameoBehavior = 'public_wave';
    r.userData.speedMultiplier = 0.92;
    // White shirt + long red tie over the navy suit.
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.56, 0.055), createMaterial(0xf5f5f3));
    shirt.position.set(0, 1.44, 0.235);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.70, 0.045), createMaterial(0xc41f2b));
    tie.position.set(0, 1.34, 0.275);
    tie.rotation.z = -0.025;
    r.add(shirt, tie);
    // Swept blond hairstyle: broad crown plus a forward combed section.
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.40, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.60), createMaterial(0xe7b84b));
    crown.scale.set(1.08, 0.72, 1.02); crown.position.set(0, 2.29, -0.02);
    const sweep = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.15, 0.30), createMaterial(0xf0c75b));
    sweep.position.set(0.06, 2.30, 0.23); sweep.rotation.z = -0.13; sweep.rotation.x = -0.15;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), createMaterial(0xe1a477));
    nose.scale.set(0.88, 1.15, 1.22); nose.position.set(0, 2.04, 0.405);
    r.add(crown, sweep, nose);
    return r;
  }
  if (k === 'barack_obama') {
    const r = humanoid('npc_barack_obama', 0x18243f, 0x242936, 0x8b5a3d, 0x171514, 1.06);
    r.userData.cameoBehavior = 'public_wave';
    r.userData.speedMultiplier = 1.0;
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.56, 0.055), createMaterial(0xf7f7f5));
    shirt.position.set(0, 1.44, 0.235);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.64, 0.045), createMaterial(0x4b67a8));
    tie.position.set(0, 1.37, 0.275);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.375, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.54), createMaterial(0x171514));
    hairCap.scale.set(1.02, 0.48, 1.0); hairCap.position.set(0, 2.30, -0.03);
    // Slightly more prominent ears help the caricature read from the third-person camera.
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), createMaterial(0x8b5a3d));
      ear.scale.set(0.58, 1.0, 0.45); ear.position.set(side * 0.355, 2.07, 0.01); r.add(ear);
    }
    r.add(shirt, tie, hairCap);
    return r;
  }
  if (k === 'peter_griffin') {
    const r = humanoid('npc_peter_griffin', 0xf4f0e7, 0x3b7a57, 0xe7b99a, 0x5a3928, 1.08);
    r.userData.combatWeight = 1.65;
    r.userData.cameoBehavior = 'belly_chuckle';
    r.userData.speedMultiplier = 0.84;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.62, 9, 8), createMaterial(0xf4f0e7));
    belly.scale.set(1.05, 1.0, 0.78); belly.position.set(0, 1.12, 0.10);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.11, 0.45), createMaterial(0x3a2419));
    belt.position.set(0, 0.80, 0.03);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.055), createMaterial(0xd2ad4b));
    buckle.position.set(0, 0.80, 0.275);
    // Round glasses and the double-chin shape are his strongest face reads at this scale.
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.022, 5, 12), createMaterial(0x171717));
      lens.rotation.x = Math.PI / 2; lens.position.set(side * 0.145, 2.10, 0.345); r.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.025, 0.025), createMaterial(0x171717));
    bridge.position.set(0, 2.10, 0.352);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.20, 7, 6), createMaterial(0xe7b99a));
    chin.scale.set(1.15, 0.72, 0.65); chin.position.set(0, 1.90, 0.33);
    r.add(belly, belt, buckle, bridge, chin);
    return r;
  }
  if (k === 'rick_sanchez') {
    const r = humanoid('npc_rick_sanchez', 0xe9edf0, 0x78cbd0, 0x6b513d, 0xb9e4ed, 1.04);
    r.userData.cameoBehavior = 'portal_check';
    r.userData.speedMultiplier = 1.02;
    // Lab coat panels over cyan shirt.
    for (const side of [-1, 1]) {
      const coat = new THREE.Mesh(new THREE.BoxGeometry(0.33, 1.0, 0.09), createMaterial(0xf0f2ed));
      coat.position.set(side * 0.20, 1.24, 0.255); coat.rotation.z = side * 0.025; r.add(coat);
    }
    // Pale-blue starburst hair.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.52, 5), createMaterial(0xb9e4ed));
      spike.position.set(Math.cos(a) * 0.30, 2.32 + Math.sin(a) * 0.06, Math.sin(a) * 0.24 - 0.08);
      spike.rotation.z = Math.cos(a) * -0.75; spike.rotation.x = Math.sin(a) * 0.65; r.add(spike);
    }
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.055, 0.035), createMaterial(0x9dcad2));
    brow.position.set(0, 2.18, 0.35); brow.rotation.z = -0.04;
    const drool = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.20, 0.025), createMaterial(0x9bd8e5));
    drool.position.set(0.10, 1.92, 0.36); drool.rotation.z = -0.15;
    // Tiny portal gun held at the right side.
    const gun = new THREE.Group(); gun.name = 'signature_prop'; gun.position.set(0.62, 1.03, 0.20); gun.rotation.z = -0.18;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.38, 0.16), createMaterial(0xd8ddd7));
    const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), new THREE.MeshBasicMaterial({ color: 0x72ff71 }));
    emitter.position.y = 0.23; gun.add(body, emitter);
    r.add(brow, drool, gun);
    return r;
  }
  if (k === 'deadpool') {
    const r = humanoid('npc_deadpool', 0xb9232f, 0xa71925, 0xb9232f, 0x5b1118, 1.04);
    r.userData.cameoBehavior = 'fourth_wall';
    r.userData.speedMultiplier = 1.12;
    // Black eye patches over the red mask.
    for (const side of [-1, 1]) {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), createMaterial(0x171719));
      patch.scale.set(0.80, 1.25, 0.34); patch.position.set(side * 0.13, 2.10, 0.335); r.add(patch);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.025), createMaterial(0xf4f4f4));
      eye.position.set(side * 0.13, 2.10, 0.382); eye.rotation.z = side * -0.12; r.add(eye);
    }
    // Chest harness and twin crossed katanas.
    const harness1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.90, 0.055), createMaterial(0x2b2728));
    harness1.position.set(-0.18, 1.35, 0.245); harness1.rotation.z = -0.38;
    const harness2 = harness1.clone(); harness2.position.x = 0.18; harness2.rotation.z = 0.38; r.add(harness1, harness2);
    for (const side of [-1, 1]) {
      const sword = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.55, 5), createMaterial(0xaeb4ba, 0.25, 0.75));
      sword.position.set(side * 0.23, 1.65, -0.27); sword.rotation.z = side * 0.34; sword.rotation.x = 0.18; r.add(sword);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.34, 6), createMaterial(0x1b1b1d));
      handle.position.set(side * 0.49, 2.30, -0.10); handle.rotation.z = side * 0.34; r.add(handle);
    }
    return r;
  }
  if (k === 'goku') {
    const r = humanoid('npc_goku', 0xe76f28, 0x245fa8, 0xe8b58e, 0x161616, 1.07);
    r.userData.combatWeight = 1.25;
    r.userData.cameoBehavior = 'martial_idle';
    r.userData.speedMultiplier = 1.22;
    // Blue undershirt, belt/sash and wristbands.
    const undershirt = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.40, 0.055), createMaterial(0x245fa8));
    undershirt.position.set(0, 1.54, 0.24);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.14, 0.46), createMaterial(0x245fa8));
    sash.position.set(0, 0.92, 0.02);
    for (const side of [-1, 1]) {
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.17, 6), createMaterial(0x245fa8));
      wrist.position.set(side * 0.49, 0.92, 0); r.add(wrist);
    }
    // Iconic large black spike cluster.
    for (let i = 0; i < 9; i++) {
      const angle = -1.25 + (i / 8) * 2.5;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.66 + (i % 3) * 0.12, 5), createMaterial(0x111111));
      spike.position.set(Math.sin(angle) * 0.27, 2.39 + Math.cos(angle) * 0.12, -0.07 - Math.abs(Math.sin(angle)) * 0.08);
      spike.rotation.z = -Math.sin(angle) * 0.72; spike.rotation.x = Math.cos(angle) * 0.28; r.add(spike);
    }
    r.add(undershirt, sash);
    return r;
  }

  if (k === 'luigi') { const r=humanoid('npc_luigi',0x2e9b45,0x2454a6); addHat(r,0x2e9b45); return r; }
  if (k === 'peach') { const r=humanoid('npc_peach',0xff8fc7,0xffb3d7,0xf5c6a5,0xf4c95d,0.98); const crown=new THREE.Mesh(new THREE.ConeGeometry(0.34,0.35,5),createMaterial(0xffd54f)); crown.position.y=2.55; r.add(crown); return r; }
  if (k === 'bowser') { const r=humanoid('npc_bowser',0xd98b2b,0x5d8a38,0xc69a38,0xb35c23,1.28); const shell=new THREE.Mesh(new THREE.SphereGeometry(0.62,8,6),createMaterial(0x3f7b37)); shell.scale.set(1,1.15,0.42); shell.position.set(0,1.3,-0.42); r.add(shell); for(let i=0;i<5;i++){const sp=new THREE.Mesh(new THREE.ConeGeometry(0.08,0.32,5),createMaterial(0xf2e7c9)); sp.position.set((i-2)*0.19,1.35,-0.80); sp.rotation.x=-Math.PI/2; r.add(sp);} return r; }
  if (k === 'wario') { const r=humanoid('npc_wario',0xf2d339,0x6b3fa0); addHat(r,0xf2d339); return r; }
  if (k === 'waluigi') { const r=humanoid('npc_waluigi',0x6f3daa,0x252334,0xf1bf94,0x3d2a1d,1.15); addHat(r,0x6f3daa); return r; }
  if (k === 'toad') { const r=humanoid('npc_toad',0xf5f5f5,0xffffff,0xf1bf94,0x3d2a1d,0.72); const cap=new THREE.Mesh(new THREE.SphereGeometry(0.58,8,6),createMaterial(0xffffff)); cap.scale.y=0.6; cap.position.y=2.08; r.add(cap); for(const x of [-0.27,0.27]){const spot=new THREE.Mesh(new THREE.SphereGeometry(0.13,6,5),createMaterial(0xe53935)); spot.position.set(x,2.13,0.46); r.add(spot);} return r; }
  if (k === 'yoshi') { const r=capsule('npc_yoshi',0x4caf50,0.95); const snout=new THREE.Mesh(new THREE.SphereGeometry(0.30,7,6),createMaterial(0x78c850)); snout.position.set(0,1.28,0.42); r.add(snout); return r; }

  if (k === 'steve') { const r=humanoid('npc_minecraft_steve',0x3fa9b8,0x3358a8,0xc58c63,0x3b241a,1.02); r.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.computeBoundingBox?.();}}); return r; }
  if (k === 'villager') { const r=humanoid('npc_minecraft_villager',0x7b5b45,0x5a4636,0xb88965,0x4a3328,1.02); const nose=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.20,0.26),createMaterial(0xb88965)); nose.position.set(0,2.04,0.43); r.add(nose); return r; }
  if (k === 'creeper') { const r=new THREE.Group(); r.name='npc_creeper'; const green=createMaterial(0x4dae49); const body=new THREE.Mesh(new THREE.BoxGeometry(0.68,1.15,0.55),green); body.position.y=1.0; const head=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.72,0.72),green); head.position.y=1.86; r.add(body,head); for(const x of [-0.22,0.22]){const leg=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.55,0.22),green); leg.position.set(x,0.28,x); r.add(leg); const leg2=leg.clone(); leg2.position.z=-x; r.add(leg2);} return r; }
  if (k === 'minecraft_zombie') return humanoid('npc_minecraft_zombie',0x3c8f61,0x324c9b,0x55a86f,0x235336,1.02);

  if (k === 'dr_doom') { const r=humanoid('npc_dr_doom',0x456f48,0x3f593f,0xbfc5c8,0x8d9499,1.08,0x2f4c31); const mask=new THREE.Mesh(new THREE.BoxGeometry(0.48,0.46,0.38),createMaterial(0xa9b0b4,0.2,0.75)); mask.position.set(0,2.12,0.14); r.add(mask); return r; }
  if (k === 'miles_morales') {
    // Spider-Verse-inspired Miles silhouette: masked black suit under an oversized
    // blue/teal jacket with a red hood, loose shorts and chunky red/white sneakers.
    // This remains fully procedural/browser-friendly, but is deliberately much more
    // specific than the old generic black humanoid + red chest rectangle.
    const r = new THREE.Group();
    r.name = 'npc_miles_morales';
    r.userData.combatWeight = 0.94;
    r.userData.movementMode = 'ground';
    r.userData.speedMultiplier = 1.10;
    r.userData.referenceMiles = true;

    const suit = createMaterial(0x0b0d12, 0.72, 0.04);
    const suitSoft = createMaterial(0x151821, 0.74, 0.02);
    const red = createMaterial(0xf02b45, 0.58, 0.03);
    const redDark = createMaterial(0x9f152a, 0.64, 0.02);
    const jacket = createMaterial(0x315d72, 0.82, 0.01);
    const jacketDark = createMaterial(0x203c4c, 0.86, 0.01);
    const shorts = createMaterial(0x4f5c49, 0.88, 0.0);
    const white = createMaterial(0xf4f5f3, 0.42, 0.02);
    const shoeRed = createMaterial(0xdb2634, 0.58, 0.02);
    const shoeBlack = createMaterial(0x111217, 0.66, 0.01);
    const web = createMaterial(0x4a4d57, 0.86, 0.0);

    // Slim black spider suit base.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.92, 0.34), suit);
    torso.position.set(0, 1.43, 0);
    r.add(torso);

    // Mask: smooth elongated head rather than the old exposed cameo head.
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), suit);
    mask.scale.set(0.92, 1.10, 0.88);
    mask.position.set(0, 2.13, 0.015);
    r.add(mask);

    // Red hood shell behind the mask plus a thick rim framing the face.
    const hoodBack = new THREE.Mesh(new THREE.SphereGeometry(0.455, 14, 10), redDark);
    hoodBack.scale.set(1.05, 1.12, 0.78);
    hoodBack.position.set(0, 2.14, -0.125);
    r.add(hoodBack);
    const hoodOpening = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.075, 8, 24), red);
    hoodOpening.position.set(0, 2.14, 0.035);
    hoodOpening.scale.set(0.94, 1.08, 1.0);
    r.add(hoodOpening);
    // Re-add the mask after the hood shell so it remains visually in front.
    r.remove(mask); r.add(mask);

    // Large Spider-Verse eye shapes: red outer patch, white inner lens, dark inner bevel.
    for (const side of [-1, 1]) {
      const eyePatch = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), red);
      eyePatch.scale.set(0.72, 1.50, 0.20);
      eyePatch.position.set(side * 0.145, 2.16, 0.326);
      eyePatch.rotation.z = side * -0.18;
      r.add(eyePatch);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.123, 10, 8), white);
      eye.scale.set(0.67, 1.42, 0.18);
      eye.position.set(side * 0.145, 2.165, 0.352);
      eye.rotation.z = side * -0.18;
      r.add(eye);
      const eyeInner = new THREE.Mesh(new THREE.SphereGeometry(0.108, 9, 7), createMaterial(0xffffff, 0.32, 0.02));
      eyeInner.scale.set(0.55, 1.26, 0.12);
      eyeInner.position.set(side * 0.145, 2.165, 0.365);
      eyeInner.rotation.z = side * -0.18;
      r.add(eyeInner);
    }

    // Faint mask web accents — deliberately subtle so they do not read as a grey face.
    for (const side of [-1, 1]) {
      const webLine = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.31, 0.018), web);
      webLine.position.set(side * 0.225, 2.00, 0.286);
      webLine.rotation.z = side * 0.33;
      r.add(webLine);
    }
    const browWeb = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.009, 4, 12, Math.PI), web);
    browWeb.rotation.z = Math.PI;
    browWeb.position.set(0, 2.28, 0.302);
    r.add(browWeb);

    // Oversized blue/teal jacket. The front is split so the black suit and red spider
    // remain visible, matching the reference instead of covering the chest completely.
    const jacketBack = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.78, 0.42), jacketDark);
    jacketBack.position.set(0, 1.49, -0.08);
    r.add(jacketBack);
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.76, 0.18), jacket);
      panel.position.set(side * 0.285, 1.47, 0.235);
      panel.rotation.z = side * 0.035;
      r.add(panel);
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 0.055), redDark);
      lapel.position.set(side * 0.135, 1.61, 0.338);
      lapel.rotation.z = side * 0.24;
      r.add(lapel);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.10), jacket);
      tail.position.set(side * 0.26, 1.08, -0.18);
      tail.rotation.z = side * 0.10;
      tail.rotation.x = -0.12;
      r.add(tail);
    }

    // Red spider emblem: central body + abdomen + eight long, angular legs.
    const spiderBody = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), red);
    spiderBody.scale.set(0.72, 1.35, 0.35);
    spiderBody.position.set(0, 1.50, 0.354);
    r.add(spiderBody);
    const spiderAbdomen = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), red);
    spiderAbdomen.scale.set(0.72, 1.25, 0.30);
    spiderAbdomen.position.set(0, 1.34, 0.354);
    r.add(spiderAbdomen);
    const spiderLegData = [
      [-1, 1.58, -0.36], [1, 1.58, 0.36],
      [-1, 1.49, -0.52], [1, 1.49, 0.52],
      [-1, 1.37, -0.50], [1, 1.37, 0.50],
      [-1, 1.28, -0.34], [1, 1.28, 0.34],
    ] as const;
    for (const [side, y, rz] of spiderLegData) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.38, 0.028), red);
      leg.position.set(side * 0.14, y, 0.365);
      leg.rotation.z = side * rz;
      r.add(leg);
    }

    // Hoodie drawstrings curl forward from the collar like the illustrated references.
    for (const side of [-1, 1]) {
      const points = [
        new THREE.Vector3(side * 0.11, 1.83, 0.34),
        new THREE.Vector3(side * 0.17, 1.70, 0.39),
        new THREE.Vector3(side * 0.11, 1.58, 0.40),
        new THREE.Vector3(side * 0.20, 1.49, 0.37),
      ];
      const curve = new THREE.CatmullRomCurve3(points);
      const string = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.016, 5, false), red);
      r.add(string);
    }

    // Arms are shoulder pivots so both normal walk animation and Miles' special
    // shoulder-touch interaction rotate naturally from the shoulder.
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = side < 0 ? 'arm_left' : 'arm_right';
      pivot.position.set(side * 0.48, 1.70, -0.01);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.50, 4, 8), jacket);
      if (side > 0) upper.name = 'miles_forearm';
      upper.position.y = -0.31;
      upper.rotation.z = side * 0.045;
      pivot.add(upper);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.145, 0.16, 8), jacketDark);
      cuff.position.y = -0.65;
      pivot.add(cuff);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.135, 9, 7), red);
      hand.name = side < 0 ? 'miles_hand_left' : 'miles_hand';
      hand.position.y = -0.84;
      pivot.add(hand);
      // Black webbed palm patch gives the glove more Spider-Man identity.
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.10, 7, 6), suitSoft);
      palm.scale.set(0.75, 0.88, 0.30);
      palm.position.set(0, -0.79, 0.105);
      pivot.add(palm);
      r.add(pivot);
    }

    // Loose layered shorts over the suit.
    const waistband = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.13, 0.40), createMaterial(0xc8c8bf, 0.65, 0.01));
    waistband.position.set(0, 0.98, 0.01);
    r.add(waistband);
    const shortsBody = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.46, 0.48), shorts);
    shortsBody.position.set(0, 0.78, -0.01);
    r.add(shortsBody);
    for (const side of [-1, 1]) {
      const shortLeg = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.36, 0.50), shorts);
      shortLeg.position.set(side * 0.205, 0.60, -0.005);
      shortLeg.rotation.z = side * 0.035;
      r.add(shortLeg);
    }

    // Slim suited legs, animated from the hips.
    for (const side of [-1, 1]) {
      const legPivot = new THREE.Group();
      legPivot.name = side < 0 ? 'leg_left' : 'leg_right';
      legPivot.position.set(side * 0.205, 0.58, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.48, 4, 8), suitSoft);
      leg.position.y = -0.28;
      legPivot.add(leg);
      r.add(legPivot);
    }

    // Chunky red/white high-top sneakers with white sole, toe cap and black side mark.
    for (const side of [-1, 1]) {
      const shoe = new THREE.Group();
      shoe.name = side < 0 ? 'miles_shoe_left' : 'miles_shoe_right';
      shoe.position.set(side * 0.205, 0.105, 0.11);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.10, 0.56), white);
      sole.position.y = -0.035;
      shoe.add(sole);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.19, 0.49), shoeRed);
      upper.position.set(0, 0.08, -0.005);
      shoe.add(upper);
      const ankle = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 0.30), white);
      ankle.position.set(0, 0.20, -0.08);
      shoe.add(ankle);
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.10, 0.27), shoeRed);
      collar.position.set(0, 0.31, -0.08);
      shoe.add(collar);
      const toe = new THREE.Mesh(new THREE.BoxGeometry(0.275, 0.08, 0.20), white);
      toe.position.set(0, 0.12, 0.18);
      shoe.add(toe);
      const sideMark = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 0.025), shoeBlack);
      sideMark.position.set(side * 0.13, 0.15, 0.05);
      sideMark.rotation.z = side * -0.25;
      shoe.add(sideMark);
      for (let i = 0; i < 3; i++) {
        const lace = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.018, 0.018), white);
        lace.position.set(0, 0.17 + i * 0.042, 0.145 - i * 0.018);
        shoe.add(lace);
      }
      r.add(shoe);
    }

    r.scale.setScalar(1.03);
    r.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return r;
  }
  if (k === 'punk_spiderman') { const r=createSpiderManNPC(); r.name='npc_punk_spiderman'; const vest=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.80,0.12),createMaterial(0x202126)); vest.position.set(0,1.35,0.12); r.add(vest); for(let i=0;i<4;i++){const spike=new THREE.Mesh(new THREE.ConeGeometry(0.05,0.32,4),createMaterial(0xd9d9d9)); spike.position.set((i-1.5)*0.12,2.55,0); r.add(spike);} return r; }
  if (k === 'punisher') { const r=humanoid('npc_punisher',0x151515,0x1b1b1b); const skull=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.42,0.05),createMaterial(0xffffff)); skull.position.set(0,1.45,0.28); r.add(skull); return r; }

  if (k === 'darth_vader') { const r=humanoid('npc_darth_vader',0x111111,0x090909,0x222222,0x111111,1.12,0x090909); const helmet=new THREE.Mesh(new THREE.ConeGeometry(0.42,0.58,6),createMaterial(0x080808,0.2,0.65)); helmet.position.y=2.32; r.add(helmet); addSaber(r,0xff2020); return r; }
  if (k === 'stormtrooper') { const r=humanoid('npc_stormtrooper',0xf1f3f4,0xf1f3f4,0xffffff,0xffffff,1.04); const visor=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.10,0.05),createMaterial(0x111111)); visor.position.set(0,2.14,0.36); r.add(visor); return r; }
  if (k === 'yoda') { const r=humanoid('npc_yoda',0x6f8e3c,0xd7d0af,0x6f8e3c,0xd8d6b8,0.62); for(const side of [-1,1]){const ear=new THREE.Mesh(new THREE.ConeGeometry(0.11,0.55,5),createMaterial(0x6f8e3c)); ear.rotation.z=side*Math.PI/2; ear.position.set(side*0.48,2.03,0); r.add(ear);} addSaber(r,0x47ff5a); return r; }
  if (k === 'palpatine') { const r=humanoid('npc_palpatine',0x17121e,0x111015,0xd2c0af,0xeeeeee,0.95,0x17121e); for(const side of [-1,1]){const bolt=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.95,5),new THREE.MeshBasicMaterial({color:0x9ac5ff})); bolt.rotation.z=side*0.7; bolt.position.set(side*0.5,1.25,0.35); r.add(bolt);} return r; }
  if (k === 'mace_windu') { const r=humanoid('npc_mace_windu',0x7a4c37,0x5f4637,0x6d422f,0x1b1613,1.05); addSaber(r,0xbd58ff); return r; }

  if (k === 'pennywise') { const r=humanoid('npc_pennywise',0xf2eee5,0xe8e5dc,0xe8d2c5,0xd15431,1.05); const nose=new THREE.Mesh(new THREE.SphereGeometry(0.09,6,6),createMaterial(0xe32636)); nose.position.set(0,2.08,0.38); const balloon=new THREE.Mesh(new THREE.SphereGeometry(0.28,8,6),createMaterial(0xe32636)); balloon.position.set(0.9,2.8,0); r.add(nose,balloon); return r; }
  if (k === 'art_clown') { const r=humanoid('npc_art_clown',0xf4f4f4,0x111111,0xf0f0f0,0x111111,1.04); addHat(r,0x111111,true); return r; }

  if (k === 'donkey') { const r=new THREE.Group(); r.name='npc_donkey'; const gray=createMaterial(0x777777); const body=new THREE.Mesh(new THREE.BoxGeometry(1.25,0.8,0.55),gray); body.position.y=0.9; const head=new THREE.Mesh(new THREE.SphereGeometry(0.36,7,6),gray); head.position.set(0,1.25,0.65); r.add(body,head); for(const x of [-0.45,0.45]) for(const z of [-0.18,0.18]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.65,5),gray); leg.position.set(x,0.38,z); r.add(leg);} return r; }
  if (k === 'puss_in_boots') { const r=capsule('npc_puss_in_boots',0xd7832e,0.82); addHat(r,0x5b2b18,true); const sword=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,1.0,5),createMaterial(0xbfc5ca,0.2,0.8)); sword.rotation.z=-0.55; sword.position.set(0.48,1.0,0.15); r.add(sword); return r; }
  if (k === 'gru') { const r=humanoid('npc_gru',0x222222,0x202020,0xe3c6ad,0x111111,1.18); const scarf=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.08,6,10),createMaterial(0x666666)); scarf.rotation.x=Math.PI/2; scarf.position.y=1.82; r.add(scarf); return r; }
  if (k === 'minion') { const r=capsule('npc_minion',0xf2d13e,0.72); const overalls=new THREE.Mesh(new THREE.BoxGeometry(0.52,0.52,0.12),createMaterial(0x3465a4)); overalls.position.set(0,0.8,0.35); r.add(overalls); return r; }
  if (k === 'vector') {
    // Reference-driven Vector model: tall/slim orange tracksuit, popped white
    // collar, bowl haircut, huge nose, square black glasses and white trainers.
    // Kept low-poly to match the game, but proportions/details follow the supplied image.
    const r = new THREE.Group();
    r.name = 'npc_vector';
    r.userData.referenceVector = true;
    r.userData.combatWeight = 0.95;
    const orange = createMaterial(0xf57c16, 0.62, 0.08);
    const orangeDark = createMaterial(0xd9680f, 0.68, 0.06);
    const white = createMaterial(0xf7f7f2, 0.45, 0.08);
    const skin = createMaterial(0xf2b193, 0.72, 0.02);
    const hair = createMaterial(0x2b2826, 0.76, 0.03);
    const black = createMaterial(0x111111, 0.45, 0.12);
    const zipperMat = createMaterial(0x73777b, 0.22, 0.75);
    const brownEye = createMaterial(0x6b3f1f, 0.4, 0.18);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.47, 1.02, 10), orange);
    torso.position.y = 1.42; torso.scale.z = 0.72; r.add(torso);
    const jacketHem = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.14, 0.50), orangeDark);
    jacketHem.position.set(0, 0.93, 0); r.add(jacketHem);
    const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.88, 0.035), zipperMat);
    zipper.position.set(0, 1.45, 0.37); r.add(zipper);
    const zipperPull = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.035), zipperMat);
    zipperPull.position.set(0, 1.88, 0.39); zipperPull.rotation.z = 0.30; r.add(zipperPull);

    // High white popped collar/hood, the strongest silhouette cue in the reference.
    const collarBack = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.56, 0.16), white);
    collarBack.position.set(0, 1.96, -0.18); collarBack.rotation.x = -0.18; r.add(collarBack);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.70, 0.14), white);
      wing.position.set(side * 0.37, 1.98, -0.02);
      wing.rotation.z = side * -0.42;
      wing.rotation.x = -0.12;
      r.add(wing);
    }

    // Long slim tracksuit legs with the reference's white side piping.
    for (const side of [-1, 1]) {
      const legGroup = new THREE.Group();
      legGroup.name = side < 0 ? 'leg_left' : 'leg_right';
      legGroup.position.set(side * 0.20, 0.72, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.145, 0.98, 8), orange);
      leg.position.y = -0.24;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.88, 0.035), white);
      stripe.position.set(side * 0.125, -0.22, 0.08);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.18, 0.58), white);
      shoe.position.set(0, -0.79, 0.12);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.055, 0.61), createMaterial(0xd7d7d2));
      sole.position.set(0, -0.89, 0.12);
      for (let s = -1; s <= 1; s++) {
        const shoeStripe = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.105, 0.16), orange);
        shoeStripe.position.set(side * 0.145, -0.78, 0.13 + s * 0.12);
        shoe.add(shoeStripe);
      }
      legGroup.add(leg, stripe, shoe, sole); r.add(legGroup);
    }

    // Long sleeves and small hands, slightly splayed like the supplied pose.
    for (const side of [-1, 1]) {
      const armGroup = new THREE.Group();
      armGroup.name = side < 0 ? 'arm_left' : 'arm_right';
      armGroup.position.set(side * 0.50, 1.68, 0);
      armGroup.rotation.z = side * -0.13;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.88, 8), orange);
      arm.position.y = -0.34;
      const sleeveStripe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.78, 0.035), white);
      sleeveStripe.position.set(side * 0.09, -0.33, 0.03);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8), orangeDark);
      cuff.position.y = -0.80;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.105, 7, 6), skin);
      hand.scale.set(0.80, 1.35, 0.72); hand.position.y = -0.93;
      armGroup.add(arm, sleeveStripe, cuff, hand); r.add(armGroup);
    }

    // Tall oval head and very prominent nose.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), skin);
    head.scale.set(0.82, 1.08, 0.82); head.position.set(0, 2.31, 0.02); r.add(head);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 10), skin);
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.23, 0.48); r.add(nose);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), skin);
      ear.scale.set(0.70, 1.0, 0.55); ear.position.set(side * 0.36, 2.31, 0); r.add(ear);
    }

    // Dark bowl cut: broad cap plus thick straight fringe.
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
    bowl.scale.set(1.05, 0.66, 0.94); bowl.position.set(0, 2.61, -0.02); r.add(bowl);
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.73, 0.17, 0.16), hair);
    fringe.position.set(0, 2.49, 0.25); fringe.rotation.x = -0.10; r.add(fringe);

    // Thick square glasses with separate clear lenses, brown irises and temples.
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xe7f5ff, transparent: true, opacity: 0.13, roughness: 0.08, metalness: 0, depthWrite: false });
    const addFrame = (cx: number) => {
      const fw = 0.30, fh = 0.27, t = 0.045, z = 0.355, y = 2.33;
      const top = new THREE.Mesh(new THREE.BoxGeometry(fw, t, t), black); top.position.set(cx, y + fh / 2, z);
      const bottom = top.clone(); bottom.position.y = y - fh / 2;
      const leftBar = new THREE.Mesh(new THREE.BoxGeometry(t, fh, t), black); leftBar.position.set(cx - fw / 2, y, z);
      const rightBar = leftBar.clone(); rightBar.position.x = cx + fw / 2;
      const lens = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.055, fh - 0.055, 0.018), lensMat.clone()); lens.position.set(cx, y, z + 0.01); lens.renderOrder = 5;
      r.add(top, bottom, leftBar, rightBar, lens);
    };
    addFrame(-0.175); addFrame(0.175);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.045), black); bridge.position.set(0, 2.33, 0.355); r.add(bridge);
    for (const side of [-1, 1]) {
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.035, 0.035), black);
      temple.position.set(side * 0.34, 2.35, 0.19); temple.rotation.y = side * -0.72; r.add(temple);
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 7), createMaterial(0xffffff)); eyeWhite.scale.set(1.05, 0.90, 0.50); eyeWhite.position.set(side * 0.17, 2.33, 0.34); r.add(eyeWhite);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.043, 7, 6), brownEye); iris.position.set(side * 0.17, 2.33, 0.405); r.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.020, 6, 5), black); pupil.position.set(side * 0.17, 2.33, 0.438); r.add(pupil);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.025), createMaterial(0x9e5f5b));
    mouth.position.set(0.055, 2.03, 0.37); mouth.rotation.z = -0.08; r.add(mouth);

    r.scale.setScalar(1.07);
    return r;
  }
  if (k === 'mr_bean') { const r=humanoid('npc_mr_bean',0x6c3d2e,0x353535,0xe4b38e,0x2b211b,1.0); const tie=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.42,0.04),createMaterial(0xb91c1c)); tie.position.set(0,1.42,0.27); r.add(tie); return r; }

  if (k === 'sulley') { const r=humanoid('npc_sulley',0x3ca7d8,0x3ca7d8,0x3ca7d8,0x3ca7d8,1.35); for(const x of [-0.20,0.20]){const horn=new THREE.Mesh(new THREE.ConeGeometry(0.08,0.34,5),createMaterial(0xe8dfc8)); horn.position.set(x,2.50,0); r.add(horn);} return r; }
  if (k === 'mike_wazowski') { const r=new THREE.Group(); r.name='npc_mike_wazowski'; const body=new THREE.Mesh(new THREE.SphereGeometry(0.72,9,8),createMaterial(0x75bf42)); body.position.y=0.95; const eye=new THREE.Mesh(new THREE.SphereGeometry(0.25,7,7),createMaterial(0xffffff)); eye.position.set(0,1.08,0.60); const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.10,6,6),createMaterial(0x1c3f2e)); pupil.position.set(0,1.08,0.80); r.add(body,eye,pupil); return r; }
  if (k === 'mr_incredible') { const r=humanoid('npc_mr_incredible',0xd92b2b,0x151515,0xf1bf94,0xd8bf87,1.22); const belt=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.13,0.10),createMaterial(0xffd54f)); belt.position.set(0,1.05,0.28); r.add(belt); return r; }
  if (k === 'frozone') { const r=humanoid('npc_frozone',0xd8f3ff,0x8ed6ed,0x6e4b38,0x111111,1.06); const visor=new THREE.Mesh(new THREE.BoxGeometry(0.46,0.12,0.05),createMaterial(0xdff7ff)); visor.position.set(0,2.12,0.36); r.add(visor); return r; }
  if (k === 'lightning_mcqueen') { const r=new THREE.Group(); r.name='npc_lightning_mcqueen'; const body=new THREE.Mesh(new THREE.BoxGeometry(1.65,0.55,0.85),createMaterial(0xd92323,0.35,0.25)); body.position.y=0.52; r.add(body); for(const x of [-0.62,0.62]) for(const z of [-0.38,0.38]){const w=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,0.12,8),createMaterial(0x111111)); w.rotation.z=Math.PI/2; w.position.set(x,0.28,z); r.add(w);} const eye=new THREE.Mesh(new THREE.BoxGeometry(0.65,0.18,0.04),createMaterial(0xffffff)); eye.position.set(0,0.70,0.45); r.add(eye); return r; }
  if (k === 'po') { const r=humanoid('npc_po',0xf1f1e8,0x171717,0xf1f1e8,0x111111,1.28); const belly=new THREE.Mesh(new THREE.SphereGeometry(0.62,8,7),createMaterial(0xf4f0db)); belly.position.set(0,1.18,0.32); r.add(belly); return r; }
  if (k === 'tai_lung') return humanoid('npc_tai_lung',0x7d8792,0x59616b,0x8e9aa4,0x4f5962,1.15);
  if (k === 'master_shifu') { const r=humanoid('npc_master_shifu',0xb45d3a,0x79503c,0xc2754f,0xe8e1ce,0.70); return r; }
  if (k === 'toothless') {
    const r=new THREE.Group(); r.name='npc_toothless'; r.userData.movementMode='flying';
    const black=createMaterial(0x101318); const body=new THREE.Mesh(new THREE.SphereGeometry(0.62,8,7),black); body.scale.set(1.6,0.8,0.75); body.position.y=0.9;
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.42,8,7),black); head.position.set(0,1.0,0.75); r.add(body,head);
    for(const side of [-1,1]){const wing=new THREE.Mesh(new THREE.ConeGeometry(0.65,1.7,3),black); wing.name=side<0?'wing_left':'wing_right'; wing.rotation.z=side*1.25; wing.rotation.x=Math.PI/2; wing.position.set(side*0.75,0.95,0); r.add(wing);}
    // Lightweight saddle/harness gives the player a clear visual mounting point.
    const saddle=new THREE.Group(); saddle.name='toothless_saddle';
    const seat=new THREE.Mesh(new THREE.BoxGeometry(0.58,0.12,0.58),createMaterial(0x493328,0.35,0.75)); seat.position.set(0,1.38,-0.10); saddle.add(seat);
    const harness=new THREE.Mesh(new THREE.TorusGeometry(0.55,0.035,5,12),createMaterial(0x6e4b36,0.4,0.8)); harness.rotation.x=Math.PI/2; harness.scale.z=0.72; harness.position.set(0,1.10,-0.04); saddle.add(harness);
    r.add(saddle); addEyes(r,0x79ff55,1.08,1.10); return r;
  }

  if (k === 'iron_man') {
    const r = humanoid('npc_iron_man', 0xa71919, 0x7d1010, 0xd4af37, 0x6d1111, 1.04);
    // Ground-first NPC. npcManager owns his occasional low-altitude flight state.
    r.userData.movementMode = 'ground';
    const gold = createMaterial(0xd8af39, 0.25, 0.72);
    const redMetal = createMaterial(0xa71919, 0.24, 0.78);
    const glow = new THREE.MeshBasicMaterial({ color: 0xb9f6ff });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.39, 9, 7), redMetal);
    helmet.scale.set(0.95, 1.05, 0.86); helmet.position.y = 2.12; r.add(helmet);
    const faceplate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.08), gold); faceplate.position.set(0, 2.08, 0.33); r.add(faceplate);
    for (const x of [-0.13, 0.13]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.10,0.035,0.025), glow); eye.position.set(x,2.15,0.385); r.add(eye); }
    const reactor = new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,0.035,12), glow); reactor.rotation.x=Math.PI/2; reactor.position.set(0,1.48,0.34); r.add(reactor);
    for (const side of [-1,1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.24,7,6), redMetal); shoulder.position.set(side*0.52,1.58,0); r.add(shoulder);
      const repulsor = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.025,10), glow);
      repulsor.name = side < 0 ? 'iron_palm_repulsor_left' : 'iron_palm_repulsor_right';
      repulsor.rotation.x=Math.PI/2; repulsor.position.set(side*0.55,1.04,0.18); r.add(repulsor);
      const bootRepulsor = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.025,10), glow);
      bootRepulsor.name = side < 0 ? 'iron_boot_repulsor_left' : 'iron_boot_repulsor_right';
      bootRepulsor.position.set(side*0.20,0.015,0.08);
      r.add(bootRepulsor);
    }
    return r;
  }
  if (k === 'spongebob') {
    const r = new THREE.Group(); r.name='npc_spongebob';
    const yellow=createMaterial(0xf4d942,0.72,0.02); const white=createMaterial(0xffffff); const brown=createMaterial(0x8d5b32); const black=createMaterial(0x111111);
    const body=new THREE.Mesh(new THREE.BoxGeometry(0.92,1.05,0.34),yellow); body.position.y=1.22; r.add(body);
    const shirt=new THREE.Mesh(new THREE.BoxGeometry(0.93,0.24,0.35),white); shirt.position.y=0.78; r.add(shirt);
    const shorts=new THREE.Mesh(new THREE.BoxGeometry(0.93,0.32,0.36),brown); shorts.position.y=0.52; r.add(shorts);
    for(const side of [-1,1]) {
      const eye=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,7),white); eye.position.set(side*0.19,1.42,0.24); r.add(eye);
      const iris=new THREE.Mesh(new THREE.SphereGeometry(0.075,7,6),createMaterial(0x43a7e8)); iris.position.set(side*0.19,1.42,0.36); r.add(iris);
      const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.035,6,5),black); pupil.position.set(side*0.19,1.42,0.42); r.add(pupil);
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.52,6),yellow); leg.position.set(side*0.22,0.14,0); r.add(leg);
      const shoe=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.10,0.32),black); shoe.position.set(side*0.22,-0.10,0.08); r.add(shoe);
    }
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.055,0.03),createMaterial(0x8c3f36)); mouth.position.set(0,1.12,0.35); r.add(mouth);
    for(let i=0;i<7;i++){ const pore=new THREE.Mesh(new THREE.SphereGeometry(0.035+(i%2)*0.015,5,4),createMaterial(0xd3bd31)); pore.position.set(((i%3)-1)*0.27,1.02+Math.floor(i/3)*0.25,0.18); r.add(pore); }
    r.scale.setScalar(0.92); return r;
  }
  if (k === 'baymax') {
    const r = new THREE.Group(); r.name='npc_baymax'; r.userData.combatWeight=1.6;
    const white=createMaterial(0xf7fafc,0.48,0.02); const dark=createMaterial(0x171717,0.45,0.02);
    const torso=new THREE.Mesh(new THREE.SphereGeometry(0.72,10,8),white); torso.scale.set(0.92,1.18,0.72); torso.position.y=1.15; r.add(torso);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.43,9,7),white); head.scale.set(1.05,0.72,0.84); head.position.y=2.18; r.add(head);
    for(const side of [-1,1]) {
      const eye=new THREE.Mesh(new THREE.SphereGeometry(0.045,6,5),dark); eye.position.set(side*0.14,2.18,0.35); r.add(eye);
      const arm=new THREE.Mesh(new THREE.CapsuleGeometry(0.18,0.75,4,7),white); arm.position.set(side*0.75,1.18,0); arm.rotation.z=side*0.14; r.add(arm);
      const leg=new THREE.Mesh(new THREE.CapsuleGeometry(0.21,0.48,4,7),white); leg.position.set(side*0.30,0.28,0); r.add(leg);
    }
    const eyeLine=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.025,0.02),dark); eyeLine.position.set(0,2.18,0.31); r.add(eyeLine);
    const port=new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.065,0.025,10),dark); port.rotation.x=Math.PI/2; port.position.set(-0.24,1.36,0.61); r.add(port);
    return r;
  }

  if (k === 'c3po') return humanoid('npc_c3po',0xc79a32,0xb68a28,0xc9a13c,0xc79a32,1.02);
  if (k === 'r2d2') { const r=new THREE.Group(); r.name='npc_r2d2'; const body=new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.42,1.05,10),createMaterial(0xf1f1f1)); body.position.y=0.62; const dome=new THREE.Mesh(new THREE.SphereGeometry(0.39,8,6,0,Math.PI*2,0,Math.PI/2),createMaterial(0xbfc8cf,0.25,0.65)); dome.position.y=1.15; const panel=new THREE.Mesh(new THREE.BoxGeometry(0.30,0.25,0.05),createMaterial(0x235fc5)); panel.position.set(0,0.75,0.40); r.add(body,dome,panel); return r; }
  if (k === 'chewbacca') { const r=humanoid('npc_chewbacca',0x704526,0x5c371f,0x704526,0x5b351f,1.30); const band=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.6,0.08),createMaterial(0x4b3628)); band.rotation.z=-0.55; band.position.set(0,1.4,0.30); r.add(band); return r; }

  // Fall back to a deliberately generic crossover pedestrian rather than failing a spawn.
  return humanoid(`npc_${k.replace(/[^a-z0-9]+/g,'_')}`,0x546e7a,0x37474f);
}


/**
 * Second-pass art polish for the large Phase-8 crossover roster.
 * The first pass deliberately used ultra-cheap silhouettes. This adds distinctive
 * faces, clothing shapes and signature props while keeping geometry procedural and
 * lightweight enough for the browser open world.
 */


/**
 * Lightweight procedural models for the small "brainrot" cameo roster.
 * These deliberately focus on the unmistakable silhouette of each meme rather
 * than importing heavy external meshes.  Each character is a single unique NPC
 * and exposes a few named parts for NPCManager's cheap personality animation.
 */
export function createBrainrotNPC(kind: string): THREE.Group {
  const k = kind.toLowerCase();
  const root = new THREE.Group();
  root.name = `npc_brainrot_${k}`;
  root.userData.brainrotKind = k;
  root.userData.combatWeight = 1;

  const mat = (color: number, roughness = 0.68, metalness = 0.02) => createMaterial(color, roughness, metalness);
  const box = (w:number,h:number,d:number,color:number,x:number,y:number,z:number,parent:THREE.Object3D=root) => {
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color)); m.position.set(x,y,z); parent.add(m); return m;
  };
  const sphere = (r:number,color:number,x:number,y:number,z:number,sx=1,sy=1,sz=1,parent:THREE.Object3D=root) => {
    const m=new THREE.Mesh(new THREE.SphereGeometry(r,10,8),mat(color)); m.position.set(x,y,z); m.scale.set(sx,sy,sz); parent.add(m); return m;
  };
  const cyl = (rt:number,rb:number,h:number,color:number,x:number,y:number,z:number,parent:THREE.Object3D=root,segments=10) => {
    const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),mat(color)); m.position.set(x,y,z); parent.add(m); return m;
  };
  const cone = (r:number,h:number,color:number,x:number,y:number,z:number,parent:THREE.Object3D=root,segments=8) => {
    const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,segments),mat(color)); m.position.set(x,y,z); parent.add(m); return m;
  };
  const eyePair = (parent:THREE.Object3D,y:number,z:number,spacing=0.17,scale=1) => {
    for (const side of [-1,1]) {
      sphere(0.095*scale,0xf6f3e8,side*spacing,y,z,1,1,0.65,parent);
      sphere(0.043*scale,0x111111,side*spacing,y,z+0.065*scale,1,1,0.7,parent);
    }
  };

  if (k === 'tung_tung_sahur') {
    root.userData.combatWeight = 1.45;
    const wood=mat(0x9a6338,0.82,0.0), woodDark=mat(0x654126,0.88,0.0);
    const visual=new THREE.Group(); visual.name='brainrot_visual'; root.add(visual);
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.43,1.38,5,10),wood); body.position.y=1.37; body.scale.set(0.86,1,0.78); visual.add(body);
    // simple wood grain bands keep the character recognisable without a texture asset
    for (const y of [0.82,1.20,1.60,1.98]) { const ring=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.018,5,14),woodDark); ring.rotation.x=Math.PI/2; ring.position.y=y; visual.add(ring); }
    eyePair(visual,1.82,0.36,0.16,0.9);
    const mouth=box(0.28,0.055,0.035,0x351f17,0,1.60,0.39,visual); mouth.rotation.z=-0.04;
    for (const side of [-1,1]) {
      const armPivot=new THREE.Group(); armPivot.name=side<0?'arm_left':'arm_right'; armPivot.position.set(side*0.48,1.50,0); visual.add(armPivot);
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.09,0.78,7),wood); arm.position.y=-0.34; arm.rotation.z=side*0.10; armPivot.add(arm);
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.12,0.72,7),woodDark); leg.name=side<0?'leg_left':'leg_right'; leg.position.set(side*0.20,0.36,0); visual.add(leg);
      box(0.30,0.13,0.44,0x3b271d,side*0.20,0.08,0.07,visual);
    }
    const batPivot=new THREE.Group(); batPivot.name='brainrot_bat'; batPivot.position.set(0.50,1.54,0.08); visual.add(batPivot);
    const bat=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.12,1.45,9),mat(0x7b4b2a,0.78,0)); bat.position.y=-0.66; bat.rotation.z=-0.20; batPivot.add(bat);
    root.userData.speedMultiplier=0.92;
    return root;
  }

  if (k === 'tralalero_tralala') {
    root.userData.combatWeight=1.25;
    const visual=new THREE.Group(); visual.name='brainrot_visual'; visual.position.y=0.02; root.add(visual);
    const blue=mat(0x3a8fb7,0.62,0.03), pale=mat(0xc6dce3,0.72,0.0), shoe=mat(0x2d6fd3,0.45,0.04);
    const body=sphere(0.62,0x3a8fb7,0,1.25,0,0.82,0.78,1.65,visual); body.material=blue;
    const snout=sphere(0.40,0x4fa4c8,0,1.20,0.83,1.0,0.55,1.1,visual);
    sphere(0.34,0xc6dce3,0,1.06,0.28,0.78,0.38,1.28,visual).material=pale;
    eyePair(visual,1.48,0.84,0.22,0.86);
    const dorsal=cone(0.24,0.70,0x2f7193,0,1.88,-0.14,visual,5); dorsal.rotation.x=-0.08;
    const tailPivot=new THREE.Group(); tailPivot.name='brainrot_tail'; tailPivot.position.set(0,1.26,-0.96); visual.add(tailPivot);
    const tail=cone(0.31,0.86,0x3a8fb7,0,0,-0.36,tailPivot,4); tail.rotation.x=-Math.PI/2;
    // Three long fin-legs and bright blue sneaker silhouettes are the key meme cue.
    const legs=[[-0.30,0.26,0.18,'leg_left'],[0.30,0.26,0.18,'leg_right'],[0,0.28,-0.38,'leg_third']] as const;
    for (const [x,y,z,name] of legs) {
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,0.72,7),blue); leg.name=name; leg.position.set(x,y+0.34,z); visual.add(leg);
      const sneaker=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.17,0.52),shoe); sneaker.name=`${name}_shoe`; sneaker.position.set(x,0.10,z+0.11); sneaker.rotation.x=-0.05; visual.add(sneaker);
      box(0.28,0.045,0.54,0xffffff,x,0.035,z+0.11,visual);
    }
    root.userData.speedMultiplier=1.18;
    return root;
  }

  if (k === 'bombardiro_crocodilo') {
    root.userData.combatWeight=2.2;
    root.userData.movementMode='flying';
    const visual=new THREE.Group(); visual.name='brainrot_visual'; root.add(visual);
    const metal=mat(0x66715d,0.48,0.48), darkMetal=mat(0x363d35,0.42,0.62), croc=mat(0x5f8a47,0.78,0.0), belly=mat(0xb5aa72,0.76,0.0);
    const fuselage=new THREE.Mesh(new THREE.CapsuleGeometry(0.42,1.9,5,10),metal); fuselage.rotation.x=Math.PI/2; fuselage.position.set(0,1.10,-0.05); fuselage.scale.set(1.0,1.0,0.92); visual.add(fuselage);
    box(3.2,0.12,0.74,0x59634f,0,1.18,0.05,visual).material=metal;
    box(0.82,0.10,1.32,0x59634f,0,1.32,-1.06,visual).material=metal;
    // crocodile head replaces the bomber nose
    const head=sphere(0.38,0x5f8a47,0,1.20,1.25,1.0,0.72,1.25,visual); head.material=croc;
    const jaw=box(0.68,0.24,0.66,0xb5aa72,0,1.02,1.50,visual); jaw.material=belly;
    eyePair(visual,1.39,1.53,0.22,0.85);
    for (const side of [-1,1]) {
      const engine=cyl(0.22,0.24,0.55,0x363d35,side*0.90,1.02,0.12,visual,10); engine.material=darkMetal; engine.rotation.x=Math.PI/2;
      const rotor=new THREE.Group(); rotor.name=side<0?'brainrot_propeller_left':'brainrot_propeller_right'; rotor.position.set(side*0.90,1.02,0.43); visual.add(rotor);
      box(0.68,0.045,0.07,0x242824,0,0,0,rotor);
      const blade2=box(0.07,0.045,0.68,0x242824,0,0,0,rotor); blade2.rotation.y=Math.PI/2;
    }
    const bomb=cyl(0.12,0.16,0.72,0x262b27,0,0.55,0.02,visual,10); bomb.rotation.x=Math.PI/2;
    cone(0.17,0.22,0x262b27,0,0.55,0.47,visual,8).rotation.x=Math.PI/2;
    root.userData.speedMultiplier=1.0;
    return root;
  }

  if (k === 'ballerina_cappuccina') {
    root.userData.combatWeight=0.72;
    const spin=new THREE.Group(); spin.name='brainrot_pirouette'; root.add(spin);
    const pink=mat(0xf1a6c8,0.55,0.03), palePink=mat(0xffd8e9,0.62,0.0), white=mat(0xf7f2ea,0.45,0.06), coffee=mat(0x7c4b2b,0.60,0.02);
    const torso=cyl(0.22,0.28,0.86,0xf1a6c8,0,1.18,0,spin,10); torso.material=pink;
    // tutu discs
    const tutu=new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.28,0.18,18),palePink); tutu.position.y=0.82; spin.add(tutu);
    for (const side of [-1,1]) {
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.065,0.82,7),palePink); arm.name=side<0?'arm_left':'arm_right'; arm.position.set(side*0.40,1.42,0); arm.rotation.z=side*1.12; spin.add(arm);
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.075,0.88,7),palePink); leg.name=side<0?'leg_left':'leg_right'; leg.position.set(side*0.12,0.36,0); spin.add(leg);
      const shoeMesh=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.11,0.30),pink); shoeMesh.position.set(side*0.12,-0.07,0.07); spin.add(shoeMesh);
    }
    // ceramic cappuccino mug head, open coffee top and heart-like foam mark
    const cup=cyl(0.34,0.29,0.50,0xf7f2ea,0,1.90,0,spin,14); cup.material=white;
    const coffeeTop=new THREE.Mesh(new THREE.CylinderGeometry(0.315,0.315,0.025,16),coffee); coffeeTop.position.set(0,2.16,0); spin.add(coffeeTop);
    const handle=new THREE.Mesh(new THREE.TorusGeometry(0.20,0.055,6,12,Math.PI*1.5),white); handle.position.set(0.34,1.92,0); handle.rotation.y=Math.PI/2; spin.add(handle);
    sphere(0.075,0xf3dfc3,-0.075,2.18,0.02,1,0.55,1.2,spin); sphere(0.075,0xf3dfc3,0.075,2.18,0.02,1,0.55,1.2,spin);
    const steamL=new THREE.Mesh(new THREE.TorusGeometry(0.11,0.018,5,10,Math.PI),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.50})); steamL.name='brainrot_steam'; steamL.position.set(-0.08,2.43,0); steamL.rotation.z=Math.PI/2; spin.add(steamL);
    const steamR=steamL.clone(); steamR.position.x=0.10; steamR.position.y=2.50; spin.add(steamR);
    root.userData.speedMultiplier=0.78;
    return root;
  }

  if (k === 'cappuccino_assassino') {
    root.userData.combatWeight=0.9;
    const visual=new THREE.Group(); visual.name='brainrot_visual'; root.add(visual);
    const cupMat=mat(0xefe5d2,0.62,0.02), black=mat(0x151619,0.62,0.03), coffee=mat(0x60402b,0.65,0.01), steel=mat(0xcbd3d8,0.25,0.78);
    const cup=cyl(0.38,0.31,1.05,0xefe5d2,0,1.10,0,visual,14); cup.material=cupMat;
    const coffeeTop=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,0.035,14),coffee); coffeeTop.position.y=1.64; visual.add(coffeeTop);
    // black ninja wrap around the cup, white eyes peeking through
    box(0.74,0.34,0.06,0x151619,0,1.31,0.34,visual).material=black;
    eyePair(visual,1.34,0.39,0.16,0.76);
    const headband=box(0.86,0.10,0.07,0x22252a,0,1.52,0.37,visual); headband.material=black;
    const plate=box(0.28,0.08,0.025,0x9ca8af,0,1.52,0.42,visual); plate.material=steel;
    for (const side of [-1,1]) {
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.085,0.56,7),black); leg.name=side<0?'leg_left':'leg_right'; leg.position.set(side*0.17,0.31,0); visual.add(leg);
      box(0.25,0.12,0.35,0x151619,side*0.17,0.05,0.08,visual).material=black;
      const swordPivot=new THREE.Group(); swordPivot.name=side<0?'brainrot_sword_left':'brainrot_sword_right'; swordPivot.position.set(side*0.48,1.18,0.08); visual.add(swordPivot);
      const grip=cyl(0.04,0.04,0.26,0x3b2d25,0,-0.09,0,swordPivot,7); grip.material=black;
      const blade=box(0.055,0.86,0.035,0xcbd3d8,0,-0.62,0,swordPivot); blade.material=steel; blade.rotation.z=side*0.08;
    }
    root.userData.speedMultiplier=1.06;
    return root;
  }

  if (k === 'lirili_larila') {
    root.userData.combatWeight=1.55;
    const visual=new THREE.Group(); visual.name='brainrot_visual'; root.add(visual);
    const cactus=mat(0x54a85e,0.80,0.0), cactusDark=mat(0x3d7c48,0.84,0), sandal=mat(0x9d7146,0.78,0.0);
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.42,1.15,5,10),cactus); body.position.y=1.22; body.scale.set(1.0,1.0,0.92); visual.add(body);
    const head=sphere(0.42,0x54a85e,0,1.93,0.03,1.0,0.90,0.95,visual); head.material=cactus;
    // elephant ears and long cactus trunk
    for (const side of [-1,1]) { const ear=sphere(0.31,0x4c9657,side*0.43,1.92,-0.02,0.48,0.85,0.18,visual); ear.material=cactusDark; }
    eyePair(visual,2.02,0.38,0.16,0.78);
    const trunkPivot=new THREE.Group(); trunkPivot.name='brainrot_trunk'; trunkPivot.position.set(0,1.86,0.36); visual.add(trunkPivot);
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.13,0.88,8),cactus); trunk.position.set(0,-0.38,0.20); trunk.rotation.x=-0.42; trunkPivot.add(trunk);
    // sparse cactus spikes
    for (let i=0;i<8;i++) { const a=(i/8)*Math.PI*2; const spike=cone(0.035,0.18,0xe9dfbf,Math.cos(a)*0.42,1.25+(i%3)*0.30,Math.sin(a)*0.36,visual,5); spike.rotation.z=Math.cos(a)*0.8; spike.rotation.x=Math.sin(a)*0.8; }
    for (const side of [-1,1]) {
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.13,0.70,8),cactusDark); leg.name=side<0?'leg_left':'leg_right'; leg.position.set(side*0.22,0.34,0); visual.add(leg);
      const foot=box(0.34,0.13,0.48,0x9d7146,side*0.22,0.05,0.09,visual); foot.material=sandal;
      box(0.32,0.055,0.09,0x765032,side*0.22,0.13,0.08,visual).material=sandal;
    }
    root.userData.speedMultiplier=0.83;
    return root;
  }

  // Defensive fallback: a small neutral low-poly figure rather than an invisible NPC.
  box(0.65,1.3,0.55,0x9e9e9e,0,0.70,0);
  sphere(0.30,0xbdbdbd,0,1.58,0);
  return root;
}

export function polishPopCultureCameoNPC(root: THREE.Group, kind: string): THREE.Group {
  const k = kind.toLowerCase();
  // High-detail likenesses are already fully authored in the base factory. Avoid
  // stacking the generic low-poly polish layer over their face/hair/clothing.
  if (root.userData.highDetailLikeness) return root;
  // Vector is already built from the supplied reference image in the base factory.
  // Do not stack the old generic polish geometry over his face/outfit.
  if (k === 'vector' && root.userData.referenceVector) return root;
  // Miles is now fully reference-authored in the base factory. Do not layer the
  // old generic white eyes/red bars over the new mask, jacket and spider emblem.
  if (k === 'miles_morales' && root.userData.referenceMiles) return root;
  const mat = (color: number, roughness = 0.65, metalness = 0.05) => createMaterial(color, roughness, metalness);
  const add = (mesh: THREE.Object3D) => { root.add(mesh); return mesh; };
  const box = (w:number,h:number,d:number,color:number,x:number,y:number,z:number) => {
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color)); m.position.set(x,y,z); return add(m);
  };
  const sphere = (r:number,color:number,x:number,y:number,z:number,sx=1,sy=1,sz=1) => {
    const m=new THREE.Mesh(new THREE.SphereGeometry(r,8,7),mat(color)); m.position.set(x,y,z); m.scale.set(sx,sy,sz); return add(m);
  };
  const cone = (r:number,h:number,color:number,x:number,y:number,z:number) => {
    const m=new THREE.Mesh(new THREE.ConeGeometry(r,h,6),mat(color)); m.position.set(x,y,z); return add(m);
  };
  const eyePair=(y=2.10,z=0.39,white=0xffffff,pupil=0x111111,sep=0.13)=>{
    for(const sign of [-1,1]) { sphere(0.085,white,sign*sep,y,z); sphere(0.036,pupil,sign*sep,y,z+0.075); }
  };
  const glovePair=(color=0xffffff,y=1.05)=>{ sphere(0.13,color,-0.55,y,0); sphere(0.13,color,0.55,y,0); };
  const moustache=(color=0x3b2418,y=1.98,z=0.38,w=0.32)=>{ const m=box(w,0.075,0.06,color,0,y,z); m.rotation.z=0.02; };
  const badge=(color:number,y=1.48,w=0.30,h=0.30)=>box(w,h,0.045,color,0,y,0.31);
  const earPair=(color:number,y=2.28,wide=0.38)=>{ for(const sign of [-1,1]){const e=cone(0.12,0.38,color,sign*wide,y,0); e.rotation.z=sign*Math.PI/2;} };

  if (k === 'luigi') { moustache(); glovePair(); badge(0xffffff,1.52,0.20,0.20); sphere(0.11,0x2e9b45,0,2.32,0.36); box(0.12,0.08,0.04,0xffffff,0,2.32,0.47); }
  else if (k === 'peach') { const skirt=new THREE.Mesh(new THREE.ConeGeometry(0.72,1.15,10),mat(0xff8fc7)); skirt.position.set(0,0.82,0); add(skirt); sphere(0.22,0xffc1df,-0.52,1.48,0); sphere(0.22,0xffc1df,0.52,1.48,0); eyePair(2.10,0.38,0xffffff,0x3a65b7); box(0.18,0.25,0.05,0x42a5f5,0,1.58,0.31); for(const x of [-0.18,0,0.18]) sphere(0.055,x===0?0xe53935:0x42a5f5,x,2.68,0.02); }
  else if (k === 'bowser') { sphere(0.36,0xf2d39b,0,1.80,0.38,1.2,0.75,0.85); sphere(0.10,0x111111,-0.16,2.10,0.40); sphere(0.10,0x111111,0.16,2.10,0.40); for(const x of [-0.22,0.22]){const h=cone(0.10,0.45,0xf3e4c5,x,2.55,0); h.rotation.z=x<0?0.25:-0.25;} box(0.65,0.12,0.08,0xf0e0b8,0,1.28,0.35); }
  else if (k === 'wario') { moustache(0x342115,1.98,0.39,0.42); glovePair(); sphere(0.13,0xe59b69,0,2.03,0.48,1.3,0.95,1.15); badge(0xffffff,1.48,0.21,0.21); box(0.13,0.08,0.05,0x6b3fa0,0,2.34,0.48); }
  else if (k === 'waluigi') { moustache(0x2b1b17,1.98,0.39,0.45); glovePair(); sphere(0.10,0xe59b69,0,2.03,0.50,1.0,1.4,1.15); badge(0xffffff,1.50,0.18,0.18); box(0.10,0.07,0.05,0x6f3daa,0,2.35,0.48); }
  else if (k === 'toad') { box(0.70,0.70,0.08,0x2d63bd,0,1.33,0.28); box(0.18,0.65,0.10,0xffffff,-0.30,1.34,0.31); box(0.18,0.65,0.10,0xffffff,0.30,1.34,0.31); eyePair(1.98,0.37); box(0.28,0.15,0.42,0x6b4a2e,-0.18,0.10,0.08); box(0.28,0.15,0.42,0x6b4a2e,0.18,0.10,0.08); }
  else if (k === 'yoshi') { sphere(0.13,0xffffff,-0.13,1.50,0.40); sphere(0.13,0xffffff,0.13,1.50,0.40); sphere(0.05,0x111111,-0.13,1.50,0.50); sphere(0.05,0x111111,0.13,1.50,0.50); const saddle=sphere(0.30,0xe53935,0,1.05,-0.38,1.15,0.55,0.85); const tail=cone(0.16,0.55,0x4caf50,0,0.95,-0.72); tail.rotation.x=-Math.PI/2; box(0.24,0.18,0.42,0xf57c00,-0.18,0.13,0.10); box(0.24,0.18,0.42,0xf57c00,0.18,0.13,0.10); }
  else if (k === 'steve') { box(0.62,0.62,0.62,0xc58c63,0,2.05,0); box(0.14,0.07,0.05,0x4a79a8,-0.15,2.08,0.33); box(0.14,0.07,0.05,0x4a79a8,0.15,2.08,0.33); box(0.12,0.06,0.04,0x4b2c20,0,1.91,0.34); }
  else if (k === 'villager') { box(0.64,0.64,0.60,0xb88965,0,2.05,0); eyePair(2.10,0.34,0xffffff,0x2b6fb0,0.15); box(0.17,0.27,0.28,0xa66f50,0,2.00,0.44); box(0.78,0.15,0.08,0x5f422f,0,1.28,0.32); }
  else if (k === 'creeper') { box(0.15,0.18,0.05,0x111111,-0.18,1.93,0.38); box(0.15,0.18,0.05,0x111111,0.18,1.93,0.38); box(0.18,0.28,0.05,0x111111,0,1.70,0.38); }
  else if (k === 'minecraft_zombie') { box(0.64,0.64,0.60,0x55a86f,0,2.05,0); box(0.13,0.08,0.05,0x33295f,-0.15,2.10,0.33); box(0.13,0.08,0.05,0x33295f,0.15,2.10,0.33); }
  else if (k === 'dr_doom') { const hood=cone(0.48,0.65,0x355a39,0,2.38,-0.05); hood.rotation.y=Math.PI/6; box(0.13,0.055,0.04,0x172126,-0.13,2.14,0.36); box(0.13,0.055,0.04,0x172126,0.13,2.14,0.36); sphere(0.22,0xaeb5ba,-0.50,1.55,0); sphere(0.22,0xaeb5ba,0.50,1.55,0); box(0.44,0.18,0.08,0x795548,0,1.07,0.29); }
  else if (k === 'miles_morales') { eyePair(2.10,0.37,0xffffff,0x111111); const chest=box(0.08,0.52,0.05,0xe32636,0,1.46,0.32); chest.rotation.z=0.38; const chest2=chest.clone(); chest2.rotation.z=-0.38; root.add(chest2); box(0.13,0.42,0.04,0xe32636,-0.19,1.39,0.31); box(0.13,0.42,0.04,0xe32636,0.19,1.39,0.31); }
  else if (k === 'punk_spiderman') { sphere(0.10,0xffffff,-0.13,2.12,0.38,0.7,1.5,0.45); sphere(0.10,0xffffff,0.13,2.12,0.38,0.7,1.5,0.45); box(0.12,0.65,0.07,0xec407a,0,1.35,0.36); box(0.55,0.07,0.07,0xec407a,0,1.62,0.36); }
  else if (k === 'punisher') { sphere(0.05,0x111111,-0.10,1.52,0.36); sphere(0.05,0x111111,0.10,1.52,0.36); for(const x of [-0.13,-0.04,0.04,0.13]) box(0.035,0.22,0.03,0xffffff,x,1.22,0.33); }
  else if (k === 'darth_vader') { box(0.62,0.18,0.50,0x090909,0,2.18,0); box(0.12,0.06,0.04,0xe0e0e0,-0.13,2.16,0.31); box(0.12,0.06,0.04,0xe0e0e0,0.13,2.16,0.31); box(0.44,0.48,0.07,0x222222,0,1.48,0.32); sphere(0.045,0xe53935,-0.12,1.50,0.37); sphere(0.045,0x66bb6a,0.12,1.50,0.37); sphere(0.24,0x161616,-0.52,1.55,0); sphere(0.24,0x161616,0.52,1.55,0); }
  else if (k === 'stormtrooper') { sphere(0.40,0xf4f4f4,0,2.15,0,1.0,0.88,1.0); box(0.46,0.09,0.05,0x101010,0,2.17,0.37); box(0.30,0.08,0.05,0x222222,0,1.98,0.38); sphere(0.22,0xffffff,-0.48,1.55,0); sphere(0.22,0xffffff,0.48,1.55,0); }
  else if (k === 'yoda') { eyePair(2.06,0.34,0xe7e3b6,0x20331b); box(0.80,0.55,0.12,0xd7d0af,0,1.35,0.28); box(0.60,0.12,0.10,0x8d6e63,0,1.10,0.28); }
  else if (k === 'palpatine') { const hood=cone(0.48,0.72,0x17121e,0,2.40,-0.05); hood.rotation.y=Math.PI/4; sphere(0.055,0xffd54f,-0.12,2.11,0.37); sphere(0.055,0xffd54f,0.12,2.11,0.37); box(0.75,0.40,0.10,0x241b2a,0,1.45,0.25); }
  else if (k === 'mace_windu') { sphere(0.39,0x6d422f,0,2.11,0); eyePair(2.11,0.36,0xffffff,0x24180f); box(0.75,0.24,0.09,0xd8c4a6,0,1.52,0.28); }
  else if (k === 'pennywise') { for(const side of [-1,1]){sphere(0.24,0xd15431,side*0.34,2.20,0,1.0,1.3,0.8);} const collar=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.10,6,12),mat(0xf2eee5)); collar.rotation.x=Math.PI/2; collar.position.set(0,1.78,0); add(collar); box(0.025,0.32,0.03,0xe32636,-0.10,2.01,0.38); box(0.025,0.32,0.03,0xe32636,0.10,2.01,0.38); eyePair(2.12,0.37,0xffffff,0x4b8a5b); }
  else if (k === 'art_clown') { sphere(0.40,0xf7f7f7,0,2.10,0); sphere(0.055,0x111111,-0.13,2.12,0.38); sphere(0.055,0x111111,0.13,2.12,0.38); sphere(0.055,0x111111,0,2.02,0.40); const ruff=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.10,6,12),mat(0xf7f7f7)); ruff.rotation.x=Math.PI/2; ruff.position.y=1.78; add(ruff); }
  else if (k === 'donkey') { earPair(0x777777,1.68,0.24); sphere(0.28,0xb0a6a0,0,1.22,0.92,1.1,0.65,1.3); eyePair(1.42,0.83,0xffffff,0x202020,0.14); const tail=cone(0.08,0.85,0x555555,0,0.96,-0.92); tail.rotation.x=Math.PI/2; }
  else if (k === 'puss_in_boots') { earPair(0xd7832e,1.62,0.25); eyePair(1.38,0.39,0xe7f0a6,0x16331c); moustache(0xf5efe1,1.21,0.39,0.40); box(0.20,0.42,0.32,0x4f2c18,-0.20,0.25,0.08); box(0.20,0.42,0.32,0x4f2c18,0.20,0.25,0.08); }
  else if (k === 'gru') { sphere(0.11,0xe3c6ad,0,2.08,0.50,0.8,1.4,1.5); box(0.78,0.10,0.08,0x777777,0,1.78,0.31); box(0.78,0.10,0.08,0x222222,0,1.70,0.31); eyePair(2.12,0.38,0xffffff,0x617383); }
  else if (k === 'minion') { const goggles=new THREE.Mesh(new THREE.TorusGeometry(0.17,0.055,6,12),mat(0x9e9e9e,0.2,0.8)); goggles.rotation.x=Math.PI/2; goggles.position.set(0,1.23,0.39); add(goggles); sphere(0.075,0x6b4b2a,0,1.23,0.47); box(0.62,0.12,0.08,0x3465a4,0,0.78,0.39); box(0.15,0.16,0.26,0x111111,-0.18,0.12,0.06); box(0.15,0.16,0.26,0x111111,0.18,0.12,0.06); }
  else if (k === 'vector') { sphere(0.40,0xf1bf94,0,2.08,0); eyePair(2.12,0.37,0xffffff,0x2d4154); box(0.18,0.09,0.05,0xffffff,-0.12,1.45,0.31); box(0.18,0.09,0.05,0xffffff,0.12,1.45,0.31); box(0.08,0.42,0.05,0xffffff,0,1.32,0.31); }
  else if (k === 'mr_bean') { eyePair(2.12,0.37,0xffffff,0x2c1d15); sphere(0.08,0xe4b38e,0,2.04,0.45,0.9,1.25,1.2); box(0.76,0.07,0.04,0xd8d1c7,0,1.63,0.31); const teddy=sphere(0.18,0x7a4b2c,0.55,1.03,0.25); sphere(0.07,0x7a4b2c,0.43,1.20,0.25); sphere(0.07,0x7a4b2c,0.67,1.20,0.25); }
  else if (k === 'sulley') { for(const [x,y] of [[-0.28,1.65],[0.25,1.35],[-0.18,1.10],[0.32,1.82]] as const) sphere(0.13,0x8e5bb7,x,y,0.35); sphere(0.32,0x58b7df,0,2.10,0.25,1.2,0.85,1.0); eyePair(2.14,0.45,0xffffff,0x3a6b94); sphere(0.26,0x3ca7d8,-0.58,1.48,0); sphere(0.26,0x3ca7d8,0.58,1.48,0); }
  else if (k === 'mike_wazowski') { for(const side of [-1,1]){const horn=cone(0.08,0.30,0xe9dfc0,side*0.24,1.63,0); horn.rotation.z=side*0.35;} box(0.34,0.08,0.05,0x26391e,0,0.75,0.66); box(0.09,0.55,0.09,0x75bf42,-0.60,0.90,0); box(0.09,0.55,0.09,0x75bf42,0.60,0.90,0); box(0.11,0.52,0.11,0x75bf42,-0.25,0.30,0); box(0.11,0.52,0.11,0x75bf42,0.25,0.30,0); }
  else if (k === 'mr_incredible') { sphere(0.27,0xd92b2b,-0.55,1.55,0); sphere(0.27,0xd92b2b,0.55,1.55,0); sphere(0.14,0x111111,-0.55,1.02,0); sphere(0.14,0x111111,0.55,1.02,0); const emblem=new THREE.Mesh(new THREE.CylinderGeometry(0.20,0.20,0.04,12),mat(0xffd54f)); emblem.rotation.x=Math.PI/2; emblem.position.set(0,1.48,0.34); add(emblem); box(0.06,0.27,0.04,0x111111,0,1.48,0.38); }
  else if (k === 'frozone') { sphere(0.38,0xffffff,0,2.11,0); box(0.50,0.14,0.06,0x9eeaff,0,2.12,0.38); box(0.75,0.16,0.08,0xffffff,0,1.62,0.31); sphere(0.13,0xffffff,-0.55,1.04,0); sphere(0.13,0xffffff,0.55,1.04,0); }
  else if (k === 'lightning_mcqueen') { box(0.62,0.16,0.05,0xffffff,-0.34,0.72,0.46); box(0.62,0.16,0.05,0xffffff,0.34,0.72,0.46); sphere(0.06,0x4a89c7,-0.34,0.72,0.50); sphere(0.06,0x4a89c7,0.34,0.72,0.50); box(0.55,0.08,0.05,0x222222,0,0.43,0.47); const bolt=box(0.75,0.12,0.05,0xffd54f,0.45,0.55,0.44); bolt.rotation.z=-0.30; }
  else if (k === 'po') { sphere(0.18,0x111111,-0.22,2.08,0.30,1.2,0.8,0.5); sphere(0.18,0x111111,0.22,2.08,0.30,1.2,0.8,0.5); sphere(0.17,0x111111,-0.24,2.48,0); sphere(0.17,0x111111,0.24,2.48,0); box(0.85,0.36,0.10,0x8d6e63,0,0.88,0.32); }
  else if (k === 'tai_lung') { earPair(0x7d8792,2.42,0.22); eyePair(2.12,0.38,0xffd54f,0x202020); for(const x of [-0.28,0,0.28]){const stripe=box(0.06,0.46,0.04,0x4c5560,x,1.47,0.32); stripe.rotation.z=x*0.8;} const tail=cone(0.10,0.85,0x7d8792,0,0.95,-0.48); tail.rotation.x=Math.PI/2; }
  else if (k === 'master_shifu') { earPair(0xb45d3a,2.36,0.26); eyePair(2.08,0.37,0xffffff,0x2b241d); sphere(0.17,0xf1eee3,0,1.96,0.40,1.25,0.65,0.55); box(0.68,0.14,0.07,0xe8e1ce,0,1.50,0.31); }
  else if (k === 'toothless') { for(const side of [-1,1]){const ear=cone(0.13,0.52,0x101318,side*0.24,1.43,0.56); ear.rotation.z=side*0.32;} sphere(0.11,0x79ff55,-0.15,1.08,1.10); sphere(0.11,0x79ff55,0.15,1.08,1.10); sphere(0.035,0x111111,-0.15,1.08,1.20); sphere(0.035,0x111111,0.15,1.08,1.20); const tail=cone(0.17,1.45,0x101318,0,0.86,-1.42); tail.rotation.x=-Math.PI/2; }
  else if (k === 'c3po') { eyePair(2.12,0.37,0xffe082,0x111111); for(const y of [1.55,1.35,1.15]) box(0.62,0.035,0.035,0x5f4720,0,y,0.34); sphere(0.11,0x9c7627,-0.54,1.05,0); sphere(0.11,0x9c7627,0.54,1.05,0); }
  else if (k === 'r2d2') { box(0.18,0.85,0.28,0xe7e7e7,-0.48,0.48,0); box(0.18,0.85,0.28,0xe7e7e7,0.48,0.48,0); sphere(0.09,0xe53935,0,1.22,0.36); for(const x of [-0.18,0.18]) box(0.10,0.18,0.04,0x235fc5,x,1.05,0.36); }
  else if (k === 'chewbacca') { sphere(0.40,0x704526,0,2.10,0,1.05,1.15,0.95); sphere(0.20,0x9b7658,0,1.99,0.37,1.2,0.65,0.80); eyePair(2.15,0.34,0xd6bb86,0x111111); for(const y of [1.72,1.45,1.18]) box(0.22,0.12,0.08,0x9d7a4d,0.12,y,0.34); }

  return root;
}

export function createMagikarpNPC(): THREE.Group {
  const root = new THREE.Group(); root.name = 'npc_magikarp';
  const orange=createMaterial(0xe97824,0.55,0.06); const cream=createMaterial(0xf5e3b5); const white=createMaterial(0xffffff); const dark=createMaterial(0x171717);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.50,9,7),orange); body.scale.set(0.72,1.0,1.25); body.position.y=0.55; root.add(body);
  for(const side of [-1,1]) { const eye=new THREE.Mesh(new THREE.SphereGeometry(0.11,6,5),white); eye.position.set(side*0.25,0.72,0.43); root.add(eye); const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.045,5,4),dark); pupil.position.set(side*0.25,0.72,0.52); root.add(pupil); }
  const tail=new THREE.Group(); tail.name='water_tail'; tail.position.set(0,0.55,-0.62);
  const fin1=new THREE.Mesh(new THREE.ConeGeometry(0.30,0.62,3),cream); fin1.rotation.x=Math.PI/2; fin1.position.z=-0.18; tail.add(fin1); root.add(tail);
  for(const side of [-1,1]) { const whisker=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.48,4),cream); whisker.rotation.z=side*0.85; whisker.position.set(side*0.23,0.45,0.48); root.add(whisker); }
  const dorsal=new THREE.Mesh(new THREE.ConeGeometry(0.20,0.46,3),cream); dorsal.position.set(0,1.05,-0.08); root.add(dorsal);
  return markPokemonNPC(root,0.35,'swimming');
}

export function createLaprasNPC(): THREE.Group {
  const root=new THREE.Group(); root.name='npc_lapras';
  const blue=createMaterial(0x5aa5d8,0.58,0.04); const cream=createMaterial(0xe8dfc3); const shellMat=createMaterial(0x77818c,0.75,0.05); const dark=createMaterial(0x1f2d38);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.78,10,8),blue); body.scale.set(1.25,0.72,1.52); body.position.y=0.52; root.add(body);
  const neck=new THREE.Mesh(new THREE.CapsuleGeometry(0.24,0.92,5,8),blue); neck.position.set(0,1.18,0.62); neck.rotation.x=-0.18; root.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.34,8,7),blue); head.position.set(0,1.78,0.83); root.add(head);
  for(const side of [-1,1]) { const eye=new THREE.Mesh(new THREE.SphereGeometry(0.048,5,5),dark); eye.position.set(side*0.13,1.83,1.12); root.add(eye); const fin=new THREE.Mesh(new THREE.ConeGeometry(0.23,0.85,4),blue); fin.name=side<0?'water_fin_left':'water_fin_right'; fin.position.set(side*0.86,0.42,0); fin.rotation.z=side*0.55; root.add(fin); }
  const shell=new THREE.Mesh(new THREE.SphereGeometry(0.68,9,6),shellMat); shell.scale.set(1.0,0.45,1.08); shell.position.set(0,0.92,-0.12); root.add(shell);
  for(const x of [-0.34,0,0.34]) { const knob=new THREE.Mesh(new THREE.ConeGeometry(0.10,0.24,5),cream); knob.position.set(x,1.23,-0.10); root.add(knob); }
  const tail=new THREE.Group(); tail.name='water_tail'; tail.position.set(0,0.46,-1.03); const tailFin=new THREE.Mesh(new THREE.ConeGeometry(0.27,0.76,3),blue); tailFin.rotation.x=-Math.PI/2; tail.add(tailFin); root.add(tail);
  return markPokemonNPC(root,1.8,'swimming');
}

export function createGyaradosNPC(): THREE.Group {
  const root=new THREE.Group(); root.name='npc_gyarados';
  const blue=createMaterial(0x397dc1,0.52,0.06); const cream=createMaterial(0xf1e3bb); const white=createMaterial(0xffffff); const red=createMaterial(0xc62828);
  for(let i=0;i<7;i++){ const seg=new THREE.Mesh(new THREE.SphereGeometry(0.48-i*0.025,8,6),i%2?cream:blue); seg.scale.set(0.90,0.82,1.2); seg.position.set(Math.sin(i*0.65)*0.28,0.60-i*0.055,-i*0.72); root.add(seg); }
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.62,9,7),blue); head.scale.set(1.0,0.82,1.18); head.position.set(0,0.82,0.52); root.add(head);
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(0.68,0.26,0.44),cream); jaw.position.set(0,0.58,0.98); root.add(jaw);
  for(const side of [-1,1]) { const eye=new THREE.Mesh(new THREE.SphereGeometry(0.11,6,5),white); eye.position.set(side*0.25,0.94,0.98); root.add(eye); const pupil=new THREE.Mesh(new THREE.SphereGeometry(0.045,5,4),red); pupil.position.set(side*0.25,0.94,1.08); root.add(pupil); const horn=new THREE.Mesh(new THREE.ConeGeometry(0.08,0.46,5),cream); horn.position.set(side*0.30,1.45,0.45); horn.rotation.z=side*-0.25; root.add(horn); }
  const tail=new THREE.Group(); tail.name='water_tail'; tail.position.set(0,0.28,-4.70); const fin=new THREE.Mesh(new THREE.ConeGeometry(0.46,1.05,3),blue); fin.rotation.x=-Math.PI/2; tail.add(fin); root.add(tail);
  root.scale.setScalar(1.12); return markPokemonNPC(root,2.7,'swimming');
}

function markPokemonNPC(root: THREE.Group, weight = 1, movementMode: 'ground' | 'flying' | 'hover' | 'swimming' = 'ground') {
  root.userData.combatWeight = weight;
  root.userData.movementMode = movementMode;
  root.userData.isPokemonNPC = true;
  // Deliberately do NOT enable shadows on every primitive. A few hero meshes
  // already cast shadows, while the rest stay cheap enough for a busy street.
  return root;
}

export function createSnorlaxNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_snorlax';
  const teal = createMaterial(0x2e6f73);
  const cream = createMaterial(0xe8dfb8);
  const dark = createMaterial(0x172326);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), teal);
  body.scale.set(1.08, 1.22, 0.9);
  body.position.y = 1.2;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.83, 9, 8), cream);
  belly.scale.set(1, 1.18, 0.28);
  belly.position.set(0, 1.15, 0.92);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 8, 8), teal);
  head.position.y = 2.25;
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), dark);
  eyeL.position.set(-0.22, 2.33, 0.55);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.22;
  root.add(body, belly, head, eyeL, eyeR);
  const legL = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), cream);
  legL.name = 'leg_left'; legL.position.set(-0.48, 0.28, 0.2);
  const legR = legL.clone(); legR.name = 'leg_right'; legR.position.x = 0.48;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.72, 6), teal);
  armL.name = 'arm_left'; armL.position.set(-1.0, 1.2, 0); armL.rotation.z = -0.8;
  const armR = armL.clone(); armR.name = 'arm_right'; armR.position.x = 1.0; armR.rotation.z = 0.8;
  root.add(legL, legR, armL, armR);
  return markPokemonNPC(root, 3.5);
}

export function createCharizardNPC(): THREE.Group {
  const root = createDetailedCharizardModel('npc_charizard');
  root.userData.playerCharacter = false;
  return markPokemonNPC(root, 1.7, 'flying');
}

export function createHoOhNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_ho_oh';
  const red = createMaterial(0xcc3b2d);
  const gold = createMaterial(0xf4c542);
  const green = createMaterial(0x3aa76d);
  const white = createMaterial(0xf7f4df);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), red);
  body.scale.set(0.82, 1.2, 0.75); body.position.y = 1.3;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.3,0.8,6), gold);
  neck.position.set(0,2.05,0.05);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34,7,7), red);
  head.position.set(0,2.55,0.15);
  root.add(body,neck,head);
  [-1,1].forEach(sign=>{
    const w = new THREE.Mesh(new THREE.ConeGeometry(1.05,2.4,4), sign < 0 ? green : gold);
    w.name = sign < 0 ? 'wing_left' : 'wing_right';
    w.rotation.z = sign*1.08; w.rotation.x=Math.PI/2;
    w.position.set(sign*0.95,1.55,-0.15);
    root.add(w);
  });
  for (let i=0;i<5;i++){
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.22,1.4,4), i%2 ? green : gold);
    feather.rotation.x=-Math.PI/2;
    feather.position.set((i-2)*0.25,1.15,-1.1-i*0.06);
    root.add(feather);
  }
  return markPokemonNPC(root, 1.5, 'flying');
}

export function createBulbasaurNPC(): THREE.Group {
  const root = new THREE.Group(); root.name='npc_bulbasaur';
  const green=createMaterial(0x65b89a); const dark=createMaterial(0x2e7d4d);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.58,8,8),green); body.scale.set(1.25,0.8,1.35); body.position.y=0.55;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.45,8,8),green); head.position.set(0,0.82,0.58);
  const bulb=new THREE.Mesh(new THREE.DodecahedronGeometry(0.5,0),dark); bulb.position.set(0,1.02,-0.42);
  root.add(body,head,bulb);
  return markPokemonNPC(root,0.95);
}

export function createSquirtleNPC(): THREE.Group {
  const root=new THREE.Group(); root.name='npc_squirtle';
  const blue=createMaterial(0x63b9d5); const shell=createMaterial(0x8a5a32); const cream=createMaterial(0xf0d89e);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.48,8,8),blue); body.position.y=0.72;
  const belly=new THREE.Mesh(new THREE.SphereGeometry(0.34,7,7),cream); belly.scale.set(0.8,1,0.25); belly.position.set(0,0.72,0.42);
  const shellMesh=new THREE.Mesh(new THREE.SphereGeometry(0.42,7,7),shell); shellMesh.scale.set(0.9,1,0.3); shellMesh.position.set(0,0.72,-0.38);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.34,7,7),blue); head.position.set(0,1.3,0.12);
  root.add(body,belly,shellMesh,head);
  return markPokemonNPC(root,0.8);
}

export function createJigglypuffNPC(): THREE.Group {
  const root=new THREE.Group(); root.name='npc_jigglypuff';
  const pink=createMaterial(0xf29bc1); const teal=createMaterial(0x3aa0a0);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.62,9,9),pink); body.position.y=0.72; root.add(body);
  [-1,1].forEach(sign=>{
    const ear=new THREE.Mesh(new THREE.ConeGeometry(0.16,0.48,5),pink); ear.position.set(sign*0.35,1.3,0); root.add(ear);
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.09,5,5),teal); eye.position.set(sign*0.2,0.84,0.55); root.add(eye);
  });
  return markPokemonNPC(root,0.45);
}

export function createEeveeNPC(): THREE.Group {
  const root=new THREE.Group(); root.name='npc_eevee';
  const brown=createMaterial(0x9b6338); const cream=createMaterial(0xe7ca9a);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.48,8,8),brown); body.position.y=0.65;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.38,8,8),brown); head.position.set(0,1.15,0.25);
  const ruff=new THREE.Mesh(new THREE.TorusGeometry(0.36,0.13,5,9),cream); ruff.rotation.x=Math.PI/2; ruff.position.y=0.88;
  root.add(body,head,ruff);
  [-1,1].forEach(sign=>{const ear=new THREE.Mesh(new THREE.ConeGeometry(0.13,0.55,5),brown); ear.position.set(sign*0.25,1.62,0.1); root.add(ear);});
  return markPokemonNPC(root,0.5);
}

export function createPsyduckNPC(): THREE.Group {
  const root=new THREE.Group(); root.name='npc_psyduck';
  const yellow=createMaterial(0xe8c83a); const bill=createMaterial(0xe3b06f); const dark=createMaterial(0x252525);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.62,8,8),yellow); body.position.y=0.8;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.44,8,8),yellow); head.position.y=1.45;
  const beak=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.16,0.34),bill); beak.position.set(0,1.35,0.42);
  root.add(body,head,beak);
  for(let i=-1;i<=1;i++){const hair=new THREE.Mesh(new THREE.BoxGeometry(0.035,0.35,0.035),dark); hair.position.set(i*0.07,1.95,0); hair.rotation.z=i*0.16; root.add(hair);}
  return markPokemonNPC(root,0.75);
}

export function createGengarNPC(): THREE.Group {
  const root=new THREE.Group(); root.name='npc_gengar';
  const purple=createMaterial(0x65429b); const red=createMaterial(0xd84040); const white=createMaterial(0xffffff);
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.72,9,9),purple); body.scale.set(1.1,0.9,0.85); body.position.y=0.9; root.add(body);
  [-1,1].forEach(sign=>{const ear=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.5,5),purple); ear.position.set(sign*0.36,1.62,0); root.add(ear);});
  const eyeL=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.09,0.05),red); eyeL.position.set(-0.22,1.05,0.65); eyeL.rotation.z=-0.18;
  const eyeR=eyeL.clone(); eyeR.position.x=0.22; eyeR.rotation.z=0.18;
  const grin=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.08,0.05),white); grin.position.set(0,0.78,0.68);
  root.add(eyeL,eyeR,grin);
  return markPokemonNPC(root,0.8,'hover');
}

export function createMachampNPC(): THREE.Group {
  const root=new THREE.Group(); root.name='npc_machamp';
  const gray=createMaterial(0x8295a8); const dark=createMaterial(0x324050);
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.85,1.1,0.5),gray); torso.position.y=1.3;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.35,7,7),gray); head.position.y=2.1;
  root.add(torso,head);
  const armGeo=new THREE.CylinderGeometry(0.12,0.17,0.9,6);
  [[-0.58,1.58,-0.45],[-0.58,1.08,0.45],[0.58,1.58,0.45],[0.58,1.08,-0.45]].forEach((v,i)=>{
    const arm=new THREE.Mesh(armGeo,gray); arm.name=i<2?'arm_left':'arm_right'; arm.position.set(v[0],v[1],0); arm.rotation.z=v[2]; root.add(arm);
  });
  const legL=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.15,0.75,6),dark); legL.name='leg_left'; legL.position.set(-0.22,0.48,0);
  const legR=legL.clone(); legR.name='leg_right'; legR.position.x=0.22; root.add(legL,legR);
  return markPokemonNPC(root,2.2);
}


// Aliases and additional NPCs
export const createNedFlandersNPC = createFlandersNPC;


/** Visually varied ambient citizen that is deliberately NOT a disguised Ned Flanders. */
export function createGenericCitizenNPC(variant = 0): THREE.Group {
  const palettes = [
    [0x3f7cac, 0x37474f, 0xf0b88f, 0x3b2a20],
    [0xb04b5a, 0x263238, 0xd79a73, 0x171311],
    [0x5b8c4a, 0x5d4037, 0xf2c7a4, 0x6d4c41],
    [0x8e5db7, 0x334155, 0xc98968, 0x1f2937],
    [0xd18a32, 0x455a64, 0xe8b38d, 0x5a3a28],
    [0x2a9d8f, 0x6b4f3a, 0xf1bf94, 0x252525],
  ] as const;
  const [shirtColor, pantsColor, skinColor, hairColor] = palettes[Math.abs(variant) % palettes.length];
  const root = new THREE.Group(); root.name = `npc_generic_citizen_${variant}`;
  const shirt = createMaterial(shirtColor); const pants = createMaterial(pantsColor); const skin = createMaterial(skinColor); const hair = createMaterial(hairColor); const dark = createMaterial(0x202124);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.38, 0.95, 8), shirt); body.position.y = 1.20; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 9, 8), skin); head.position.y = 1.92; root.add(head);
  const style = Math.abs(variant) % 4;
  if (style === 0) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); cap.position.y = 2.08; root.add(cap);
  } else if (style === 1) {
    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.48), hair); hairTop.position.set(0, 2.12, -0.02); root.add(hairTop);
  } else if (style === 2) {
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hairTop.position.y = 2.08; root.add(hairTop);
    const pony = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), hair); pony.position.set(0, 1.95, -0.34); root.add(pony);
  } else {
    for (let i = -2; i <= 2; i++) { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 5), hair); spike.position.set(i * 0.11, 2.18 + Math.abs(i) * -0.02, -0.02); spike.rotation.z = i * -0.09; root.add(spike); }
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), createMaterial(0xffffff)); eye.position.set(side * 0.11, 1.95, 0.29); root.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), dark); pupil.position.set(side * 0.11, 1.95, 0.337); root.add(pupil);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.66, 6), shirt); arm.name = side < 0 ? 'arm_left' : 'arm_right'; arm.position.set(side * 0.43, 1.23, 0); root.add(arm);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.11, 0.70, 6), pants); leg.name = side < 0 ? 'leg_left' : 'leg_right'; leg.position.set(side * 0.16, 0.46, 0); root.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.43), dark); shoe.position.set(side * 0.16, 0.08, 0.09); root.add(shoe);
  }
  if (variant % 3 === 0) {
    const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.035), createMaterial(0xf5f5f5)); jacket.position.set(0, 1.24, 0.34); root.add(jacket);
  }
  if (variant % 5 === 0) {
    const glassesBar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.035), dark); glassesBar.position.set(0, 1.98, 0.325); root.add(glassesBar);
  }
  root.userData.combatWeight = 0.95;
  return root;
}

export function createArcadePrizeHostNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_arcade_prize_host';
  const shirtMat = createMaterial(0xd946ef); // Magenta arcade uniform
  const collarMat = createMaterial(0x38bdf8); // Cyan collar trim
  const pantsMat = createMaterial(0x1e1b4b); // Dark navy slacks
  const skinMat = createMaterial(0xf5d0b0); // Skin tone
  const hairMat = createMaterial(0x3e2723); // Dark hair
  const dark = createMaterial(0x18181b); // Shoes / pupils
  const badgeMat = createMaterial(0xfacc15); // Golden badge
  const visorMat = createMaterial(0x06b6d4, 0.4, 0.7); // Translucent retro cyan visor

  // Torso & uniform
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.36, 0.95, 8), shirtMat);
  body.position.y = 1.20;
  root.add(body);

  // Cyan collar trim & badge lanyard
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 8), collarMat);
  collar.position.y = 1.62;
  const lanyard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.04), badgeMat);
  lanyard.position.set(0, 1.28, 0.32);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.03), createMaterial(0xffffff));
  badge.position.set(0, 1.06, 0.34);
  root.add(collar, lanyard, badge);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 9, 8), skinMat);
  head.position.y = 1.92;
  root.add(head);

  // Hair
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.y = 2.08;
  root.add(hair);

  // Visor (Neon retro arcade visor)
  const visorBand = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12, 1, true), shirtMat);
  visorBand.position.y = 2.02;
  const visorBrim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.28), visorMat);
  visorBrim.position.set(0, 1.98, 0.30);
  visorBrim.rotation.x = 0.15;
  root.add(visorBand, visorBrim);

  // Face & Limbs
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), createMaterial(0xffffff));
    eye.position.set(side * 0.11, 1.95, 0.29);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), dark);
    pupil.position.set(side * 0.11, 1.95, 0.337);
    root.add(eye, pupil);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.66, 6), shirtMat);
    arm.name = side < 0 ? 'arm_left' : 'arm_right';
    arm.position.set(side * 0.43, 1.23, 0.06);
    arm.rotation.x = -0.25; // Friendly resting posture on desk
    root.add(arm);

    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.11, 0.70, 6), pantsMat);
    leg.name = side < 0 ? 'leg_left' : 'leg_right';
    leg.position.set(side * 0.16, 0.46, 0);
    root.add(leg);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.15, 0.43), dark);
    shoe.position.set(side * 0.16, 0.08, 0.09);
    root.add(shoe);
  }

  // Smile
  const smile = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.04), createMaterial(0xb91c1c));
  smile.position.set(0, 1.80, 0.31);
  root.add(smile);

  root.userData.combatWeight = 0.95;
  return root;
}

export function createBarneyNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_barney';
  const yellowMat = createMaterial(0xfad02c);
  const pinkShirtMat = createMaterial(0xf06292);
  const brownPantsMat = createMaterial(0x5d4037);
  const mugMat = createMaterial(0xffb300, 0.1, 0.8);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 8), pinkShirtMat);
  belly.scale.set(1.1, 1.25, 1.2);
  belly.position.y = 1.15;
  root.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), yellowMat);
  head.position.y = 2.15;
  root.add(head);

  const beerMug = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.35, 8), mugMat);
  beerMug.position.set(0.6, 1.2, 0.35);
  root.add(beerMug);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.6, 6), brownPantsMat);
  legL.name = 'leg_left';
  legL.position.set(-0.25, 0.3, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.6, 6), brownPantsMat);
  legR.name = 'leg_right';
  legR.position.set(0.25, 0.3, 0);
  root.add(legL, legR);

  return root;
}

export function createOfficerJennyNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_officer_jenny';
  const skinMat = createMaterial(0xffdbac);
  const tealHairMat = createMaterial(0x00838f);
  const blueUniformMat = createMaterial(0x1565c0);
  const whiteMat = createMaterial(0xffffff);

  const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.2, 8), blueUniformMat);
  dress.position.y = 1.1;
  root.add(dress);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), skinMat);
  head.position.y = 1.95;
  const hair = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), tealHairMat);
  hair.position.set(0, 2.1, -0.05);
  root.add(head, hair);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.35, 0.22, 8), blueUniformMat);
  cap.position.y = 2.3;
  const badge = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), whiteMat);
  badge.position.set(0, 2.32, 0.35);
  root.add(cap, badge);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.65, 6), blueUniformMat);
  legL.name = 'leg_left';
  legL.position.set(-0.16, 0.32, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.65, 6), blueUniformMat);
  legR.name = 'leg_right';
  legR.position.set(0.16, 0.32, 0);
  root.add(legL, legR);

  return root;
}

export function createYoungsterJoeyNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_youngster_joey';
  const skinMat = createMaterial(0xffdbac);
  const capMat = createMaterial(0xd32f2f);
  const shirtMat = createMaterial(0x7b1fa2);
  const shortsMat = createMaterial(0x1976d2);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.9, 8), shirtMat);
  torso.position.y = 1.05;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), skinMat);
  head.position.y = 1.75;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
  cap.position.y = 1.85;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.25), capMat);
  brim.position.set(0, 1.82, -0.3); // Backwards cap!
  root.add(head, cap, brim);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.6, 6), shortsMat);
  legL.name = 'leg_left';
  legL.position.set(-0.16, 0.3, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.6, 6), shortsMat);
  legR.name = 'leg_right';
  legR.position.set(0.16, 0.3, 0);
  root.add(legL, legR);

  return root;
}

export function createWhitneyNPC(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'npc_whitney';
  const skinMat = createMaterial(0xffdbac);
  const pinkHairMat = createMaterial(0xf48fb1);
  const topMat = createMaterial(0xffffff);
  const shortsMat = createMaterial(0x1e88e5);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.9, 8), topMat);
  torso.position.y = 1.1;
  root.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), skinMat);
  head.position.y = 1.85;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 8), pinkHairMat);
  hair.position.set(0, 1.95, -0.05);

  const pigtailL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), pinkHairMat);
  pigtailL.position.set(-0.45, 1.95, -0.1);
  const pigtailR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), pinkHairMat);
  pigtailR.position.set(0.45, 1.95, -0.1);
  root.add(head, hair, pigtailL, pigtailR);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.65, 6), shortsMat);
  legL.name = 'leg_left';
  legL.position.set(-0.16, 0.32, 0);
  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.65, 6), shortsMat);
  legR.name = 'leg_right';
  legR.position.set(0.16, 0.32, 0);
  root.add(legL, legR);

  return root;
}

/** Shared geometry/material pool for the street-tree family. Dozens of interactive
 * trees can exist in a district, so duplicating nine geometries and six materials per
 * tree wastes GPU/JS memory without improving visuals. Individual roots still exist
 * for kick/fall physics; only immutable render assets are shared. */
type StylizedCityTreeAssets = {
  bark: THREE.MeshStandardMaterial;
  barkDark: THREE.MeshStandardMaterial;
  leafDark: THREE.MeshStandardMaterial;
  leafMid: THREE.MeshStandardMaterial;
  leafLight: THREE.MeshStandardMaterial;
  trunkGeometry: THREE.CylinderGeometry;
  branchGeometries: THREE.CylinderGeometry[];
  canopyGeometry: THREE.DodecahedronGeometry;
};

let stylizedCityTreeAssets: StylizedCityTreeAssets | null = null;

function getStylizedCityTreeAssets(): StylizedCityTreeAssets {
  if (stylizedCityTreeAssets) return stylizedCityTreeAssets;
  stylizedCityTreeAssets = {
    bark: createSurfaceMaterial(0x6a4935, 'wood', 0.88, 0.01, 2.5, 5.5),
    barkDark: createSurfaceMaterial(0x4f3427, 'wood', 0.92, 0.01, 2.0, 4.0),
    leafDark: createMaterial(0x2e7d32, 0.82, 0.0),
    leafMid: createMaterial(0x43a047, 0.80, 0.0),
    leafLight: createMaterial(0x66bb4f, 0.78, 0.0),
    trunkGeometry: new THREE.CylinderGeometry(0.30, 0.48, 3.0, 10),
    branchGeometries: [
      new THREE.CylinderGeometry(0.12, 0.20, 1.28, 7),
      new THREE.CylinderGeometry(0.12, 0.20, 1.18, 7),
      new THREE.CylinderGeometry(0.12, 0.20, 1.00, 7),
    ],
    canopyGeometry: new THREE.DodecahedronGeometry(1, 1),
  };
  return stylizedCityTreeAssets;
}

/** Detailed but still cheap roadside tree. The root/pivot remains at ground level so
 * the shared kickable-tree physics continues to own movement/collision unchanged.
 * Geometry/materials are shared; silhouette variation is authored by callers through
 * root/canopy scale and rotation rather than separate heavy meshes. */
export function createStylizedCityTreeModel(scale = 1, variant = 0): THREE.Group {
  const tree = new THREE.Group();
  tree.name = 'stylized_city_tree_visual';
  tree.scale.setScalar(scale);
  const assets = getStylizedCityTreeAssets();

  const trunk = new THREE.Mesh(assets.trunkGeometry, assets.bark);
  trunk.name = 'tree_trunk';
  trunk.position.y = 1.50;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const style = ((Math.floor(variant) % 3) + 3) % 3;
  const branchSpecsByStyle: Array<Array<[number, number, number, number, number]>> = [
    [
      [-0.42, 2.55, 0.02, 0.72, 0],
      [ 0.40, 2.72, 0.08,-0.66, 1],
      [ 0.12, 2.80,-0.34, 0.24, 2],
    ],
    [
      [-0.32, 2.72, 0.04, 0.58, 1],
      [ 0.31, 2.91, 0.06,-0.52, 2],
      [ 0.08, 3.02,-0.28, 0.18, 2],
    ],
    [
      [-0.52, 2.48, 0.02, 0.82, 0],
      [ 0.52, 2.56, 0.12,-0.80, 0],
      [ 0.02, 2.72,-0.40, 0.14, 1],
    ],
  ];
  const branchSpecs = branchSpecsByStyle[style];
  branchSpecs.forEach(([x, y, z, rz, geometryIndex]) => {
    const branch = new THREE.Mesh(assets.branchGeometries[geometryIndex], assets.barkDark);
    branch.name = 'tree_branch_visual';
    branch.position.set(x, y, z);
    branch.rotation.z = rz;
    branch.rotation.x = z * 0.55;
    branch.castShadow = true;
    tree.add(branch);
  });

  const lobeSets: Array<Array<[number, number, number, number, THREE.Material]>> = [
    [
      [ 0.00, 3.72,  0.00, 1.38, assets.leafMid],
      [-0.88, 3.62,  0.18, 1.02, assets.leafDark],
      [ 0.82, 3.70,  0.24, 1.08, assets.leafLight],
      [-0.30, 4.48, -0.12, 1.02, assets.leafLight],
      [ 0.54, 4.38, -0.20, 0.93, assets.leafMid],
    ],
    [
      [ 0.00, 3.90,  0.00, 1.22, assets.leafMid],
      [-0.62, 3.82,  0.12, 0.92, assets.leafDark],
      [ 0.58, 3.92,  0.18, 0.96, assets.leafLight],
      [-0.18, 4.68, -0.08, 0.90, assets.leafLight],
      [ 0.32, 4.58, -0.18, 0.82, assets.leafMid],
    ],
    [
      [ 0.00, 3.55,  0.00, 1.44, assets.leafMid],
      [-1.00, 3.46,  0.16, 1.12, assets.leafDark],
      [ 0.98, 3.50,  0.20, 1.12, assets.leafLight],
      [-0.42, 4.16, -0.10, 1.08, assets.leafLight],
      [ 0.48, 4.12, -0.24, 1.04, assets.leafMid],
    ],
  ];
  const lobes = lobeSets[style];
  lobes.forEach(([x, y, z, radius, material], index) => {
    const crown = new THREE.Mesh(assets.canopyGeometry, material);
    crown.name = `tree_canopy_visual_${index}`;
    crown.position.set(x, y, z);
    crown.scale.set(radius * 1.10, radius * (0.90 + (index % 2) * 0.08), radius * 1.03);
    crown.castShadow = true;
    crown.receiveShadow = true;
    tree.add(crown);
  });

  return tree;
}

export function createOakTreeModel(): THREE.Group {
  const tree = new THREE.Group();
  tree.name = 'grown_oak_tree';

  const trunkMat = createSurfaceMaterial(0x5c4033, 'wood', 0.9, 0.01, 3, 7);
  const branchMat = createSurfaceMaterial(0x4a3329, 'wood', 0.92, 0.01, 2, 5);
  const leafMat = createMaterial(0x2e7d32, 0.82, 0.0);
  const leafMidMat = createMaterial(0x43a047, 0.80, 0.0);
  const leafLightMat = createMaterial(0x66bb55, 0.78, 0.0);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.68, 4.2, 10), trunkMat);
  trunk.name = 'tree_trunk';
  trunk.position.y = 2.1;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const branchSpecs: Array<[number, number, number, number, number]> = [
    [-0.58, 3.35,  0.06,  0.72, 1.75],
    [ 0.57, 3.52,  0.12, -0.68, 1.65],
    [ 0.14, 3.72, -0.52,  0.22, 1.45],
  ];
  branchSpecs.forEach(([x, y, z, rz, len]) => {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, len, 8), branchMat);
    branch.name = 'tree_branch_visual';
    branch.position.set(x, y, z);
    branch.rotation.z = rz;
    branch.rotation.x = z * 0.42;
    branch.castShadow = true;
    tree.add(branch);
  });

  const foliage: Array<[number, number, number, number, THREE.Material]> = [
    [ 0.0, 4.72,  0.0, 1.78, leafMidMat],
    [-1.10,4.65,  0.28,1.30, leafMat],
    [ 1.08,4.78,  0.18,1.34, leafLightMat],
    [-0.45,5.62, -0.20,1.28, leafLightMat],
    [ 0.68,5.55, -0.34,1.18, leafMidMat],
  ];
  foliage.forEach(([x, y, z, radius, material], index) => {
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), material);
    crown.name = `tree_canopy_visual_${index}`;
    crown.position.set(x, y, z);
    crown.scale.set(1.12, 0.90, 1.04);
    crown.castShadow = true;
    crown.receiveShadow = true;
    tree.add(crown);
  });
  return tree;
}

// Vehicle & Pokemon aliases
export const createGeodudeModel = createGeodudeWithLegsModel;
export const createBmwF80M3 = () => createBMWF80M3Model().mesh;
export const createBmwG80M3 = () => createBMWG80M3Model().mesh;
export const createBmwF90M5 = () => createBMWF90M5Model().mesh;
export const createLamborghiniAventador = () => createLamborghiniAventadorModel().mesh;
export const createFerrariF12 = () => createFerrariF12Model().mesh;
export const createDeLoreanTimeMachine = () => createDeLoreanTimeMachineModel().mesh;
export const createDocBrown = () => createDocBrownNPC();
export const createMartyMcFly = () => createMartyMcFlyNPC();
export const createPoliceCrownVic = () => createPoliceCruiserModel();
export const createPoliceCharger = () => createPoliceSUVModel();
export const createSimpsonsFamilySedan = () => createPinkSedanModel();
export const createSpeedRocket = () => createSpeedRocketModel();
export const createCanyonero = () => createCanyoneroModel();
export const createMrPlow = () => createMrPlowModel();
export const createCarBuiltForHomer = () => createCarBuiltForHomerModel();
export const createPeppaFamilyCar = () => createPeppaFamilyCarModel();
export const createSedanTraffic = () => createTrafficSedanModel(0xff9800);
export const createSuvTraffic = () => createTrafficSUVModel(0x388e3c);
export const createSportsCarTraffic = () => createTrafficSportsCarModel(0xd65a24);
export const createConvertibleTraffic = () => createTrafficConvertibleModel(0x2d79c7);
export const createCityBusTraffic = () => createCityBusModel();




// ----------------------------------------------------
// GAMEPLAY HELPERS: PLAYER AVATAR + SIMPLE PROCEDURAL ANIMATION
// ----------------------------------------------------
export type PokemonAnimState = 'idle' | 'walk' | 'run' | 'backward' | 'jump' | 'attack' | 'special' | 'hit';

/** Ash is the controllable trainer until Professor Oak assigns the first Pokémon. */
export function createTrainerAvatarModel(): THREE.Group {
  // Reuse the authored Ash model rather than showing a generic placeholder trainer.
  // He has not received his starter yet, so the held Poké Ball is deliberately hidden.
  const root = createAshKetchumModel();
  root.name = 'player_ash_avatar';
  const heldBall = root.getObjectByName('held_pokeball');
  if (heldBall) heldBall.visible = false;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  return root;
}

export function setPoliwagWaterGunDrawn(root: THREE.Object3D, drawn: boolean) {
  const gun = root.getObjectByName('water_gun');
  if (gun) gun.visible = drawn;
}

/**
 * Lightweight procedural animation so the low-poly characters do not simply slide.
 * The model builders already name common limbs, so this works without imported clips.
 */
export function animatePokemonModel(
  root: THREE.Object3D,
  id: PokemonCharacterId,
  state: PokemonAnimState,
  timeSeconds: number,
  intensity = 1
) {
  const legL = root.getObjectByName('leg_left');
  const legR = root.getObjectByName('leg_right');
  const armL = root.getObjectByName('arm_left');
  const armR = root.getObjectByName('arm_right');
  const tail = root.getObjectByName('tail');

  const moving = state === 'walk' || state === 'run' || state === 'backward';
  const charizardFlying = id === 'charizard' && root.userData.charizardFlying === true;
  const charizardJumpPreparing = id === 'charizard' && root.userData.charizardJumpPreparing === true;
  const pace = state === 'run' ? 11 : 7;
  const direction = state === 'backward' ? -1 : 1;
  const swing = moving ? Math.sin(timeSeconds * pace) * (state === 'run' ? 0.65 : 0.42) * direction * intensity : 0;

  const dampRot = (obj: THREE.Object3D | undefined, targetX: number, targetZ = 0) => {
    if (!obj) return;
    obj.rotation.x = THREE.MathUtils.lerp(obj.rotation.x, targetX, 0.32);
    obj.rotation.z = THREE.MathUtils.lerp(obj.rotation.z, targetZ, 0.32);
  };

  if (state === 'jump') {
    dampRot(legL, -0.45); dampRot(legR, -0.45);
    dampRot(armL, -0.55); dampRot(armR, -0.55);
  } else if (state === 'attack') {
    // Character-specific, deliberately exaggerated melee silhouettes.
    const punch = Math.sin(timeSeconds * 22) > 0 ? 1 : -1;
    if (id === 'pikachu') {
      // Tiny angry headbutt / spin-kick energy.
      dampRot(armL, -0.9, -0.35);
      dampRot(armR, -0.9, 0.35);
      dampRot(legL, punch > 0 ? -1.0 : 0.45);
      dampRot(legR, punch > 0 ? 0.45 : -1.0);
      root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, punch * 0.16, 0.35);
      root.scale.lerp(new THREE.Vector3(1.08, 0.94, 1.08), 0.28);
    } else if (id === 'charizard') {
      dampRot(armL, -0.72, -0.20);
      dampRot(armR, -0.72, 0.20);
      dampRot(legL, -0.22); dampRot(legR, 0.22);
      if (tail) tail.rotation.y = Math.sin(timeSeconds * 18) * 0.46;
      root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, punch * 0.08, 0.28);
    } else if (id === 'charmander') {
      dampRot(armL, -0.35);
      dampRot(armR, -0.55);
      dampRot(legL, 0.35); dampRot(legR, -0.35);
      if (tail) tail.rotation.y = Math.sin(timeSeconds * 25) * 1.25;
      root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, Math.sin(timeSeconds * 20) * 0.18, 0.32);
    } else if (id === 'poliway') {
      // Poliwag throws absurd alternating boxing-glove punches.
      dampRot(armL, punch > 0 ? -1.65 : -0.15, punch > 0 ? -0.4 : 0.1);
      dampRot(armR, punch < 0 ? -1.65 : -0.15, punch < 0 ? 0.4 : -0.1);
      dampRot(legL, -0.2); dampRot(legR, 0.2);
      root.scale.lerp(new THREE.Vector3(1.12, 0.9, 1.12), 0.3);
      root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, punch * 0.12, 0.4);
    } else {
      // Geodude's stupid human legs anchor a ridiculous uppercut.
      dampRot(armL, -0.25, -0.35);
      dampRot(armR, -2.0, 0.25);
      dampRot(legL, 0.5); dampRot(legR, -0.5);
      root.scale.lerp(new THREE.Vector3(1.16, 0.9, 1.16), 0.35);
    }
  } else if (state === 'special') {
    dampRot(armL, -0.25);
    dampRot(armR, -0.9);
    dampRot(legL, 0.08); dampRot(legR, -0.08);
  } else {
    dampRot(legL, swing);
    dampRot(legR, -swing);
    dampRot(armL, -swing * 0.75);
    dampRot(armR, swing * 0.75);
  }

  if (state !== 'attack') {
    root.scale.lerp(new THREE.Vector3(1, 1, 1), 0.18);
  }

  if (tail) {
    const tailWag = id === 'charizard' ? (charizardFlying ? 0.18 : 0.22) : id === 'charmander' ? 0.28 : id === 'pikachu' ? 0.18 : 0.08;
    tail.rotation.y = Math.sin(timeSeconds * (moving ? 7 : charizardFlying ? 4.2 : 3)) * tailWag;
  }

  if (id === 'charizard') {
    const wingLeft = root.getObjectByName('wing_left');
    const wingRight = root.getObjectByName('wing_right');
    const visual = root.getObjectByName('charizard_visual');
    const flame = root.getObjectByName('tail_flame');
    const flightPace = 7.4;
    const jumpReadyFlap = Math.sin(timeSeconds * 5.1) * 0.07;
    const flap = charizardFlying
      ? Math.sin(timeSeconds * flightPace) * 0.46
      : charizardJumpPreparing
      ? 0.20 + jumpReadyFlap
      : Math.sin(timeSeconds * 2.2) * 0.035;
    const wingBlend = charizardFlying ? 0.38 : charizardJumpPreparing ? 0.30 : 0.18;
    if (wingLeft) wingLeft.rotation.z = THREE.MathUtils.lerp(wingLeft.rotation.z, -0.12 - flap, wingBlend);
    if (wingRight) wingRight.rotation.z = THREE.MathUtils.lerp(wingRight.rotation.z, 0.12 + flap, wingBlend);
    if (visual) {
      // Deliberately tiny flight bob: readable wing lift without making the camera sick.
      visual.position.y = THREE.MathUtils.lerp(visual.position.y, charizardFlying ? Math.sin(timeSeconds * flightPace) * 0.035 : 0, 0.22);
      visual.rotation.x = THREE.MathUtils.lerp(visual.rotation.x, charizardFlying ? -0.055 + Math.sin(timeSeconds * flightPace) * 0.012 : 0, 0.18);
    }
    if (flame) {
      const flicker = 1 + Math.sin(timeSeconds * 15.5) * 0.10 + Math.sin(timeSeconds * 23.0) * 0.045;
      flame.scale.set(1 / Math.sqrt(flicker), flicker, 1 / Math.sqrt(flicker));
      flame.rotation.z = Math.sin(timeSeconds * 10.5) * 0.16;
    }
  }

  // Poliwag gets an intentionally goofy side wobble; Geodude's absurd legs pump harder.
  if (id === 'poliway') {
    root.rotation.z = moving ? Math.sin(timeSeconds * pace) * 0.07 * intensity : THREE.MathUtils.lerp(root.rotation.z, 0, 0.25);
  } else if (id === 'geodude' || id === 'geodude_legs') {
    if (legL) legL.rotation.x *= 1.35;
    if (legR) legR.rotation.x *= 1.35;
  }
}
