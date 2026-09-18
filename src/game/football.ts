import * as THREE from 'three';

export type FootballerId = 'haaland' | 'messi' | 'ronaldo' | 'yamal';

type TeamId = 'pink' | 'gold';
type PlayerState = 'shape' | 'chase' | 'dribble' | 'pass' | 'shoot' | 'celebrate' | 'recover' | 'throw_in' | 'goal_kick';

type ThrowInState = {
  team: TeamId;
  taker: Footballer;
  spot: THREE.Vector3;
  phase: 'approach' | 'pickup' | 'throw';
  timer: number;
  sidelineSign: -1 | 1;
};

type GoalKickState = {
  team: TeamId;
  taker: Footballer;
  outSpot: THREE.Vector3;
  placementSpot: THREE.Vector3;
  phase: 'approach_ball' | 'pickup' | 'carry' | 'place' | 'step_back' | 'kick';
  timer: number;
  endSign: -1 | 1;
};

type Footballer = {
  id: FootballerId;
  name: string;
  team: TeamId;
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  home: THREE.Vector3;
  state: PlayerState;
  stateTimer: number;
  kickCooldown: number;
  maxSpeed: number;
  shotPower: number;
  preferredFoot: 'left' | 'right';
  stridePhase: number;
};

export type FootballMatchUpdateContext = {
  playerPosition: THREE.Vector3;
  playerForward: THREE.Vector3;
  playerJoined: boolean;
};

const PITCH_CENTER = new THREE.Vector3(-235, 0, 148);
const PITCH_LENGTH = 46;
const PITCH_WIDTH = 28;
const HALF_L = PITCH_LENGTH / 2;
const HALF_W = PITCH_WIDTH / 2;
const BALL_RADIUS = 0.235;
const GOAL_WIDTH = 7.2;
const GOAL_DEPTH = 2.4;
const GOAL_HEIGHT = 2.45;
const TOUCH_BUFFER = 1.25;
const FOOTBALLER_WORLD_SCALE = 1.28; // Match the game's larger stylised human scale while preserving real height ratios.
const CROWD_PER_TOUCHLINE = 14;
const FOOTBALLER_BODY_RADIUS = 0.54;
const FOOTBALLER_MIN_SEPARATION = FOOTBALLER_BODY_RADIUS * 2;

const clamp = THREE.MathUtils.clamp;

function mat(color: number, roughness = 0.62, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function physicalSkin(color: number) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.53,
    metalness: 0,
    clearcoat: 0.04,
    clearcoatRoughness: 0.72,
  });
}

function makeTextPlane(text: string, fg: string, bg = 'transparent', width = 512, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  if (bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.font = `900 ${Math.floor(height * 0.58)}px Arial Black, Arial, sans-serif`;
  ctx.strokeStyle = 'rgba(0,0,0,0.34)';
  ctx.lineWidth = 8;
  ctx.strokeText(text, width / 2, height / 2 + 4);
  ctx.fillText(text, width / 2, height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
}

function makeNumberPanel(number: string, color: string, scale = 1) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.38 * scale, 0.48 * scale), makeTextPlane(number, color, 'transparent', 256, 320));
  mesh.renderOrder = 4;
  return mesh;
}

function addFacialFeatures(root: THREE.Group, cfg: {
  skin: number;
  eye: number;
  hair: number;
  beard?: number;
  headWidth?: number;
  headHeight?: number;
  jawWidth?: number;
  noseLength?: number;
  browTilt?: number;
  beardStyle?: 'full' | 'stubble' | 'none';
  hairStyle: 'haaland' | 'messi' | 'ronaldo' | 'yamal';
}) {
  const skinMat = physicalSkin(cfg.skin);
  const eyeWhite = mat(0xf8f7f1, 0.42);
  const irisMat = mat(cfg.eye, 0.28);
  const pupilMat = mat(0x111418, 0.3);
  const browMat = mat(cfg.hair, 0.74);
  const lipMat = mat(0x9b554e, 0.65);
  const hairMat = mat(cfg.hair, 0.76);
  const beardMat = mat(cfg.beard ?? cfg.hair, 0.79);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 18, 14), skinMat);
  head.name = 'head';
  head.scale.set(cfg.headWidth ?? 0.95, cfg.headHeight ?? 1.08, 0.92);
  head.position.y = 1.77;
  root.add(head);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), skinMat);
  jaw.scale.set(cfg.jawWidth ?? 0.92, 0.58, 0.86);
  jaw.position.set(0, 1.63, 0.025);
  root.add(jaw);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMat);
    ear.scale.set(0.55, 1.0, 0.48);
    ear.position.set(side * 0.292 * (cfg.headWidth ?? 0.95), 1.76, -0.005);
    root.add(ear);

    const eyeWhiteMesh = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 9), eyeWhite);
    eyeWhiteMesh.scale.set(1.25, 0.72, 0.38);
    eyeWhiteMesh.position.set(side * 0.104, 1.80, 0.267);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), irisMat);
    iris.scale.z = 0.36;
    iris.position.set(side * 0.104, 1.80, 0.305);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), pupilMat);
    pupil.scale.z = 0.32;
    pupil.position.set(side * 0.104, 1.80, 0.321);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.026), browMat);
    brow.position.set(side * 0.106, 1.878, 0.276);
    brow.rotation.z = side * (cfg.browTilt ?? 0.04);
    root.add(eyeWhiteMesh, iris, pupil, brow);
  }

  const nose = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, cfg.noseLength ?? 0.10, 6, 10), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.725, 0.30);
  root.add(nose);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.021, 0.018), lipMat);
  mouth.position.set(0, 1.615, 0.27);
  root.add(mouth);

  if ((cfg.beardStyle ?? 'none') !== 'none') {
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.258, 16, 11, 0, Math.PI * 2, Math.PI * 0.34, Math.PI * 0.54), beardMat);
    beard.scale.set(0.94, cfg.beardStyle === 'full' ? 0.92 : 0.78, 0.92);
    beard.position.set(0, 1.66, 0.035);
    root.add(beard);
  }

  if (cfg.hairStyle === 'haaland') {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.305, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.54), hairMat);
    crown.scale.set(1.0, 0.72, 0.95);
    crown.position.set(0, 1.935, -0.015);
    const tie = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), hairMat);
    tie.scale.set(0.8, 1.4, 0.8);
    tie.position.set(0, 1.875, -0.315);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.22, 5, 9), hairMat);
    tail.position.set(0, 1.78, -0.35);
    tail.rotation.x = 0.25;
    root.add(crown, tie, tail);
  } else if (cfg.hairStyle === 'messi') {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.304, 18, 13, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
    crown.scale.set(1.0, 0.72, 0.96);
    crown.position.set(0, 1.93, -0.025);
    for (let i = 0; i < 5; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 8), hairMat);
      tuft.position.set((i - 2) * 0.07, 2.005 - Math.abs(i - 2) * 0.008, 0.06);
      tuft.rotation.x = -0.52;
      root.add(tuft);
    }
    root.add(crown);
  } else if (cfg.hairStyle === 'ronaldo') {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.302, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.53), hairMat);
    crown.scale.set(0.98, 0.55, 0.94);
    crown.position.set(0, 1.945, -0.02);
    const swept = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.07, 0.14), hairMat);
    swept.position.set(0.055, 2.025, 0.04);
    swept.rotation.z = -0.10;
    root.add(crown, swept);
  } else {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.302, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.54), hairMat);
    crown.scale.set(1.0, 0.50, 0.96);
    crown.position.set(0, 1.93, -0.02);
    const fadeBand = new THREE.Mesh(new THREE.CylinderGeometry(0.286, 0.292, 0.11, 18), hairMat);
    fadeBand.position.set(0, 1.905, -0.015);
    root.add(crown, fadeBand);
  }
}

function createFootballerModel(id: FootballerId): THREE.Group {
  const root = new THREE.Group();
  root.name = `footballer_${id}`;
  root.userData.footballer = true;
  root.userData.movementMode = 'football';

  const details = {
    haaland: {
      heightM: 1.93,
      skin: 0xf0c2a2,
      eye: 0x7fa7b5,
      hair: 0xd9bd77,
      hairStyle: 'haaland' as const,
      beardStyle: 'stubble' as const,
      shirt: 0x7fc8eb,
      shorts: 0xffffff,
      socks: 0x7fc8eb,
      boots: 0xf2f2ee,
      number: '9',
      numberColor: '#172a45',
      chest: 'CITY',
      accent: 0xffffff,
      bodyWidth: 1.08,
      maxSpeed: 7.4,
      shotPower: 18.5,
      preferredFoot: 'left' as const,
      headWidth: 0.98,
      headHeight: 1.11,
      jawWidth: 0.95,
      noseLength: 0.11,
    },
    messi: {
      heightM: 1.70,
      skin: 0xd8a17e,
      eye: 0x594b38,
      hair: 0x3a2c25,
      beard: 0x3a2c25,
      hairStyle: 'messi' as const,
      beardStyle: 'full' as const,
      shirt: 0xf4a7c5,
      shorts: 0xf4a7c5,
      socks: 0xf4a7c5,
      boots: 0xf2f0e9,
      number: '10',
      numberColor: '#111111',
      chest: 'MIAMI',
      accent: 0x111111,
      bodyWidth: 0.96,
      maxSpeed: 7.1,
      shotPower: 16.7,
      preferredFoot: 'left' as const,
      headWidth: 1.00,
      headHeight: 1.03,
      jawWidth: 0.98,
      noseLength: 0.09,
    },
    ronaldo: {
      heightM: 1.87,
      skin: 0xc88f6f,
      eye: 0x4b3a2c,
      hair: 0x171614,
      hairStyle: 'ronaldo' as const,
      beardStyle: 'stubble' as const,
      shirt: 0xffdf28,
      shorts: 0x163a6b,
      socks: 0xffdf28,
      boots: 0x161616,
      number: '7',
      numberColor: '#111111',
      chest: 'AL NASSR',
      accent: 0x111111,
      bodyWidth: 1.04,
      maxSpeed: 7.35,
      shotPower: 18.0,
      preferredFoot: 'right' as const,
      headWidth: 0.95,
      headHeight: 1.09,
      jawWidth: 1.02,
      noseLength: 0.105,
    },
    yamal: {
      heightM: 1.78,
      skin: 0x9b6a50,
      eye: 0x3b2c25,
      hair: 0x171615,
      hairStyle: 'yamal' as const,
      beardStyle: 'none' as const,
      shirt: 0x1b3b8f,
      shorts: 0x17275f,
      socks: 0x1b3b8f,
      boots: 0xe9f236,
      number: '10',
      numberColor: '#f3da72',
      chest: 'BARÇA',
      accent: 0x8d1737,
      bodyWidth: 0.93,
      maxSpeed: 7.65,
      shotPower: 16.2,
      preferredFoot: 'left' as const,
      headWidth: 0.97,
      headHeight: 1.04,
      jawWidth: 0.92,
      noseLength: 0.085,
    },
  }[id];

  // Procedural body is authored at ~2.24 m from boot sole to hair crown. Scale from
  // that measured reference so the in-game silhouettes match the researched real heights.
  const baseScale = (details.heightM / 2.24) * FOOTBALLER_WORLD_SCALE;
  const shirtMat = mat(details.shirt, 0.58);
  const shortsMat = mat(details.shorts, 0.62);
  const sockMat = mat(details.socks, 0.60);
  const bootMat = mat(details.boots, 0.38, 0.05);
  const skinMat = physicalSkin(details.skin);
  const accentMat = mat(details.accent, 0.60);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27 * details.bodyWidth, 0.58, 8, 18), shirtMat);
  torso.position.y = 1.13;
  torso.scale.z = 0.72;
  root.add(torso);

  // Shirt identity bands. These are part of the kit geometry, not floating labels.
  if (id === 'yamal') {
    for (const x of [-0.18, 0.0, 0.18]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.70, 0.028), x === 0 ? accentMat : shirtMat);
      stripe.position.set(x, 1.17, 0.245);
      root.add(stripe);
    }
  } else if (id === 'ronaldo') {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.03), accentMat);
    shoulder.position.set(0, 1.43, 0.245);
    root.add(shoulder);
  } else if (id === 'haaland') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 7, 20, Math.PI), mat(0xffffff, 0.58));
    collar.position.set(0, 1.48, 0.18);
    collar.rotation.z = Math.PI;
    root.add(collar);
  } else if (id === 'messi') {
    const blackTrim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.045, 0.025), accentMat);
    blackTrim.position.set(0, 1.45, 0.235);
    root.add(blackTrim);
  }

  const chestMark = new THREE.Mesh(new THREE.PlaneGeometry(id === 'ronaldo' ? 0.42 : 0.36, 0.12), makeTextPlane(details.chest, id === 'yamal' ? '#f0dc72' : (id === 'haaland' ? '#172a45' : '#111111'), 'transparent', 512, 128));
  chestMark.position.set(0, 1.18, 0.278);
  chestMark.renderOrder = 5;
  root.add(chestMark);

  const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.55 * details.bodyWidth, 0.31, 0.39), shortsMat);
  shorts.position.y = 0.76;
  root.add(shorts);

  const limbData: Array<{ name: string; x: number }> = [
    { name: 'left', x: -0.18 }, { name: 'right', x: 0.18 },
  ];
  for (const limb of limbData) {
    const legGroup = new THREE.Group();
    legGroup.name = `football_leg_${limb.name}`;
    legGroup.position.set(limb.x, 0.68, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.33, 6, 12), skinMat);
    thigh.position.y = -0.17;
    const sock = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.30, 6, 12), sockMat);
    sock.position.y = -0.54;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.34), bootMat);
    boot.position.set(0, -0.76, 0.07);
    boot.rotation.x = -0.05;
    legGroup.add(thigh, sock, boot);
    root.add(legGroup);

    const arm = new THREE.Group();
    arm.name = `football_arm_${limb.name}`;
    arm.position.set(limb.x < 0 ? -0.37 * details.bodyWidth : 0.37 * details.bodyWidth, 1.36, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.27, 5, 10), shirtMat);
    upper.position.y = -0.14;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.25, 5, 10), skinMat);
    fore.position.y = -0.43;
    arm.add(upper, fore);
    root.add(arm);
  }

  addFacialFeatures(root, {
    skin: details.skin,
    eye: details.eye,
    hair: details.hair,
    beard: (details as any).beard,
    beardStyle: details.beardStyle,
    hairStyle: details.hairStyle,
    headWidth: details.headWidth,
    headHeight: details.headHeight,
    jawWidth: details.jawWidth,
    noseLength: details.noseLength,
    browTilt: id === 'ronaldo' ? 0.02 : id === 'haaland' ? 0.035 : 0.045,
  });

  const backNumber = makeNumberPanel(details.number, details.numberColor, 1.0);
  backNumber.position.set(0, 1.17, -0.285);
  backNumber.rotation.y = Math.PI;
  root.add(backNumber);
  const shortsNumber = makeNumberPanel(details.number, details.numberColor, 0.42);
  shortsNumber.position.set(-0.18, 0.77, 0.205);
  root.add(shortsNumber);

  root.scale.setScalar(baseScale);
  root.userData.realHeightM = details.heightM;
  root.userData.visualWorldHeightM = details.heightM * FOOTBALLER_WORLD_SCALE;
  root.userData.groundOffset = 0.14 * baseScale;
  root.userData.maxSpeed = details.maxSpeed;
  root.userData.shotPower = details.shotPower;
  root.userData.preferredFoot = details.preferredFoot;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return root;
}

function makeGoal(side: -1 | 1) {
  const group = new THREE.Group();
  group.name = side < 0 ? 'football_goal_west' : 'football_goal_east';
  const postMat = mat(0xf7f7f3, 0.42);
  const netMat = new THREE.MeshBasicMaterial({ color: 0xe9eef1, transparent: true, opacity: 0.44, side: THREE.DoubleSide, depthWrite: false });
  const goalX = side * HALF_L;
  const behindX = goalX + side * GOAL_DEPTH;

  for (const z of [-GOAL_WIDTH / 2, GOAL_WIDTH / 2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, GOAL_HEIGHT, 10), postMat);
    post.position.set(goalX, GOAL_HEIGHT / 2, z);
    post.userData.solidCollider = true;
    post.userData.colliderPadding = 0.02;
    group.add(post);
    const rear = post.clone();
    rear.position.x = behindX;
    rear.scale.y = 0.94;
    group.add(rear);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, GOAL_WIDTH + 0.14, 10), postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(goalX, GOAL_HEIGHT, 0);
  bar.userData.solidCollider = true;
  group.add(bar);

  // Visible net sheets with coarse grid-like line segments.
  const netBack = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_HEIGHT), netMat);
  netBack.position.set(behindX, GOAL_HEIGHT / 2, 0);
  netBack.rotation.y = Math.PI / 2;
  group.add(netBack);
  const netTop = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_WIDTH), netMat);
  netTop.rotation.x = Math.PI / 2;
  netTop.position.set((goalX + behindX) / 2, GOAL_HEIGHT, 0);
  group.add(netTop);
  for (const z of [-GOAL_WIDTH / 2, GOAL_WIDTH / 2]) {
    const netSide = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HEIGHT), netMat);
    netSide.position.set((goalX + behindX) / 2, GOAL_HEIGHT / 2, z);
    netSide.rotation.y = 0;
    group.add(netSide);
  }
  return group;
}

function addFieldLine(group: THREE.Group, w: number, d: number, x: number, z: number) {
  const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.018, d), new THREE.MeshBasicMaterial({ color: 0xf5f5ee, toneMapped: false }));
  line.position.set(x, 0.071, z);
  line.userData.walkable = true;
  line.userData.walkablePriority = 13;
  group.add(line);
}


function createCrowdSpectator(index: number, side: -1 | 1) {
  const root = new THREE.Group();
  root.name = `football_crowd_${side < 0 ? 'north' : 'south'}_${index}`;
  root.userData.footballCrowd = true;
  root.userData.cheerPhase = (index * 1.73 + (side > 0 ? 0.8 : 0)) % (Math.PI * 2);
  root.userData.baseY = 0;

  const palette = [0xe95454, 0x4b86d9, 0xf1cf4b, 0x56a46c, 0xb26bd2, 0xf08a4b, 0x65a9c9, 0xf0a9bf];
  const shirt = mat(palette[index % palette.length], 0.7);
  const trouser = mat(index % 3 === 0 ? 0x263341 : index % 3 === 1 ? 0x34312e : 0x56524b, 0.76);
  const skin = physicalSkin([0xf0c5a6, 0xd9a17f, 0xb87b5d, 0x8f5d46][index % 4]);
  const hair = mat([0x2b211b, 0x161514, 0x7b5430, 0xd3b774][(index * 3) % 4], 0.8);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.45, 5, 10), shirt);
  torso.position.y = 1.08;
  torso.scale.z = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.72;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.225, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.set(0, 1.82, -0.01);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.30), trouser);
  hips.position.y = 0.73;
  root.add(torso, head, hairCap, hips);

  for (const sideSign of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), trouser);
    leg.position.set(sideSign * 0.105, 0.38, 0);
    root.add(leg);
    const arm = new THREE.Group();
    arm.name = sideSign < 0 ? 'crowd_arm_left' : 'crowd_arm_right';
    arm.position.set(sideSign * 0.30, 1.28, 0);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.42, 4, 8), skin);
    limb.position.y = -0.20;
    arm.add(limb);
    root.add(arm);
  }

  const scale = 1.0 + ((index % 5) - 2) * 0.035;
  root.scale.setScalar(scale);
  root.rotation.y = side < 0 ? 0 : Math.PI;
  root.traverse((obj) => { if (obj instanceof THREE.Mesh) obj.castShadow = true; });
  return root;
}

function createFootballCrowd() {
  const crowd = new THREE.Group();
  crowd.name = 'football_sideline_crowd';
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < CROWD_PER_TOUCHLINE; i++) {
      const npc = createCrowdSpectator(i, side);
      const x = -HALF_L + 2.0 + (i / Math.max(1, CROWD_PER_TOUCHLINE - 1)) * (PITCH_LENGTH - 4.0);
      let z = side * (HALF_W + 3.0 + (i % 2) * 0.55);
      // The south sideline has two benches at x ±8. Put those spectators just
      // behind the benches instead of clipping through them.
      if (side > 0 && Math.abs(Math.abs(x) - 8) < 3.2) z += 1.8;
      npc.position.set(x, 0, z);
      crowd.add(npc);
    }
  }
  return crowd;
}

function makeSpeechBillboard(text: string, playerId: FootballerId) {
  // Proper speech-bubble texture with generous padding so the goal shout can never
  // be clipped by the canvas edge. The sprite is re-anchored to its player every frame.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const x = 40;
  const y = 34;
  const w = canvas.width - 80;
  const h = 258;
  const r = 58;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + w * 0.58, y + h);
  ctx.lineTo(x + w * 0.50, y + h + 58);
  ctx.lineTo(x + w * 0.43, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#171717';
  ctx.stroke();

  // Fit the full shout to the bubble rather than relying on a fixed font size.
  let fontSize = 144;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  do {
    ctx.font = `900 ${fontSize}px Arial Black, Arial, sans-serif`;
    if (ctx.measureText(text).width <= w - 90) break;
    fontSize -= 4;
  } while (fontSize > 72);
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#cf1f2e';
  ctx.strokeText(text, canvas.width / 2, y + h * 0.50 + 8);
  ctx.fillText(text, canvas.width / 2, y + h * 0.50 + 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.name = 'football_goal_shout';
  sprite.scale.set(4.5, 1.68, 1);
  sprite.renderOrder = 40;
  sprite.userData.life = 2.8;
  sprite.userData.playerId = playerId;
  return sprite;
}

function createCommunityFieldBannerMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  // Rich community-sports sign texture: deep green painted board, subtle vertical
  // grain, centre glow, cream pinstripes and a gold inner keyline. Everything is
  // baked into one texture so no separate text planes can clip at the edges.
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#123b28');
  gradient.addColorStop(0.48, '#1f6540');
  gradient.addColorStop(1, '#103521');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Painted-board texture/grain. Deterministic pattern avoids runtime flicker.
  ctx.globalAlpha = 0.12;
  for (let x = 0; x < canvas.width; x += 28) {
    ctx.fillStyle = (Math.floor(x / 28) % 2 === 0) ? '#ffffff' : '#071f14';
    ctx.fillRect(x, 0, 3, canvas.height);
  }
  ctx.globalAlpha = 1;

  // Soft centre highlight so the sign reads as a slightly curved painted panel.
  const glow = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.45, 40, canvas.width * 0.5, canvas.height * 0.45, canvas.width * 0.62);
  glow.addColorStop(0, 'rgba(255,255,255,0.10)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Strong layered border. The generous inset also gives the lettering a visual
  // safe zone at oblique camera angles.
  ctx.strokeStyle = '#efe7cd';
  ctx.lineWidth = 30;
  ctx.strokeRect(38, 38, canvas.width - 76, canvas.height - 76);
  ctx.strokeStyle = '#d6ad52';
  ctx.lineWidth = 10;
  ctx.strokeRect(72, 72, canvas.width - 144, canvas.height - 144);

  // Small football crests at either end give the board personality without
  // stealing width from the wording.
  const drawBall = (cx: number, cy: number, r: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#f7f3e7';
    ctx.strokeStyle = '#d6ad52';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#183b29';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      const rr = i % 2 === 0 ? r * 0.34 : r * 0.25;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  drawBall(168, canvas.height / 2, 86);
  drawBall(canvas.width - 168, canvas.height / 2, 86);

  // Auto-fit a line inside a strict text-safe rectangle. This is deliberately
  // measureText based rather than relying on font-size guesses, which fixes the
  // previous clipped first/last letters.
  const drawFittedLine = (text: string, centreY: number, maxWidth: number, maxFont: number) => {
    let fontSize = maxFont;
    do {
      ctx.font = `900 ${fontSize}px Arial Black, Impact, Arial, sans-serif`;
      if (ctx.measureText(text).width <= maxWidth) break;
      fontSize -= 4;
    } while (fontSize > 72);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(8, fontSize * 0.065);
    ctx.strokeStyle = '#092418';
    ctx.fillStyle = '#fff8df';
    ctx.strokeText(text, canvas.width / 2, centreY);
    ctx.fillText(text, canvas.width / 2, centreY);
  };

  // More than 300 px of safety margin on each side of the text area after the
  // football crests. Even COMMUNITY FIELD has room at the texture edges.
  const textSafeWidth = canvas.width - 720;
  drawFittedLine('SPRINGFIELD', 255, textSafeWidth, 194);
  drawFittedLine('COMMUNITY FIELD', 470, textSafeWidth, 166);

  // Small footer adds detail and keeps the main title uncluttered.
  ctx.font = '700 54px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e3c36e';
  ctx.fillText('HOME OF SPRINGFIELD COMMUNITY FOOTBALL', canvas.width / 2, 625);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createStandingFieldBanner() {
  const banner = new THREE.Group();
  banner.name = 'springfield_community_field_banner';

  const postMat = mat(0x343d43, 0.62, 0.18);
  const frameMat = mat(0x122d20, 0.54, 0.12);
  const goldMat = mat(0xcaa84f, 0.42, 0.32);
  const bannerMat = createCommunityFieldBannerMaterial();

  // Taller, wider freestanding stadium-style sign. The posts sit OUTSIDE the
  // panel so they cannot cover the first/last characters from angled views.
  for (const x of [-5.15, 5.15]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 3.9, 10), postMat);
    post.position.set(x, 1.95, 0);
    post.castShadow = true;
    post.userData.solidCollider = true;
    banner.add(post);

    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 7), goldMat);
    cap.position.set(x, 3.94, 0);
    banner.add(cap);
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(10.45, 2.62, 0.24), frameMat);
  frame.position.y = 2.42;
  frame.castShadow = true;
  frame.userData.solidCollider = true;
  banner.add(frame);

  // Decorative raised trim around the physical frame.
  for (const y of [1.18, 3.66]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(10.15, 0.10, 0.31), goldMat);
    rail.position.set(0, y, 0);
    banner.add(rail);
  }

  // One complete textured sign face per side. There are no individual text
  // planes anymore, eliminating the source of the clipping issue entirely.
  const faceGeometry = new THREE.PlaneGeometry(9.92, 2.26);
  const front = new THREE.Mesh(faceGeometry, bannerMat);
  front.position.set(0, 2.42, 0.131);
  front.renderOrder = 8;
  banner.add(front);

  const back = new THREE.Mesh(faceGeometry, bannerMat.clone());
  back.position.set(0, 2.42, -0.131);
  back.rotation.y = Math.PI;
  back.renderOrder = 8;
  banner.add(back);

  // Braced feet and diagonal support struts make it look like a real permanent
  // community-ground sign rather than a floating rectangle.
  for (const x of [-5.15, 5.15]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 1.05), postMat);
    foot.position.set(x, 0.09, 0);
    foot.castShadow = true;
    banner.add(foot);

    for (const z of [-0.36, 0.36]) {
      const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.25, 7), postMat);
      brace.position.set(x, 0.58, z * 0.60);
      brace.rotation.x = z > 0 ? -0.72 : 0.72;
      banner.add(brace);
    }
  }

  return banner;
}

function createPitchEnvironment() {
  const root = new THREE.Group();
  root.name = 'springfield_community_football_pitch';
  root.position.copy(PITCH_CENTER);

  const pitchMat = new THREE.MeshStandardMaterial({ color: 0x318b45, roughness: 0.96, metalness: 0 });
  const pitch = new THREE.Mesh(new THREE.BoxGeometry(PITCH_LENGTH + 2, 0.12, PITCH_WIDTH + 2), pitchMat);
  pitch.name = 'football_pitch_grass';
  pitch.position.y = 0.01;
  pitch.receiveShadow = true;
  pitch.userData.walkable = true;
  pitch.userData.walkablePriority = 12;
  root.add(pitch);

  // Subtle mowing bands, kept low-contrast so markings remain readable.
  for (let i = -5; i <= 5; i++) {
    if (i % 2 === 0) continue;
    const band = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.012, PITCH_WIDTH - 0.2), new THREE.MeshBasicMaterial({ color: 0x388f4b, transparent: true, opacity: 0.34, toneMapped: false }));
    band.position.set(i * 4.05, 0.066, 0);
    root.add(band);
  }

  const t = 0.11;
  addFieldLine(root, PITCH_LENGTH, t, 0, -HALF_W);
  addFieldLine(root, PITCH_LENGTH, t, 0, HALF_W);
  addFieldLine(root, t, PITCH_WIDTH, -HALF_L, 0);
  addFieldLine(root, t, PITCH_WIDTH, HALF_L, 0);
  addFieldLine(root, t, PITCH_WIDTH, 0, 0);

  const whiteBasic = new THREE.MeshBasicMaterial({ color: 0xf5f5ee, toneMapped: false, side: THREE.DoubleSide });
  const centreCircle = new THREE.Mesh(new THREE.RingGeometry(3.9, 4.02, 64), whiteBasic);
  centreCircle.rotation.x = -Math.PI / 2;
  centreCircle.position.y = 0.078;
  root.add(centreCircle);
  const centreSpot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 18), whiteBasic);
  centreSpot.rotation.x = -Math.PI / 2;
  centreSpot.position.y = 0.079;
  root.add(centreSpot);

  for (const side of [-1, 1] as const) {
    const boxX = side * (HALF_L - 3.5);
    addFieldLine(root, 7.0, t, boxX, -5.3);
    addFieldLine(root, 7.0, t, boxX, 5.3);
    addFieldLine(root, t, 10.6, side * (HALF_L - 7.0), 0);
    const sixX = side * (HALF_L - 1.8);
    addFieldLine(root, 3.6, t, sixX, -3.15);
    addFieldLine(root, 3.6, t, sixX, 3.15);
    addFieldLine(root, t, 6.3, side * (HALF_L - 3.6), 0);
    const penSpot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), whiteBasic);
    penSpot.rotation.x = -Math.PI / 2;
    penSpot.position.set(side * (HALF_L - 6.1), 0.079, 0);
    root.add(penSpot);
    root.add(makeGoal(side));
  }

  // Low fence only along the long touchlines; goal ends stay open and walkable.
  const fenceMat = mat(0x46535b, 0.62, 0.12);
  for (const z of [-HALF_W - 2.0, HALF_W + 2.0]) {
    for (let x = -HALF_L; x <= HALF_L; x += 5.5) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), fenceMat);
      post.position.set(x, 0.6, z);
      post.userData.solidCollider = true;
      root.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(PITCH_LENGTH + 0.2, 0.05, 0.05), fenceMat);
    rail.position.set(0, 1.05, z);
    rail.userData.solidCollider = true;
    root.add(rail);
  }

  // Sideline benches and a tiny equipment area.
  const benchMat = mat(0x3f4d56, 0.72, 0.04);
  for (const x of [-8, 8]) {
    const bench = new THREE.Group();
    bench.name = `football_bench_${x < 0 ? 'west' : 'east'}`;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.18, 0.72), benchMat);
    seat.position.y = 0.68;
    const back = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.72, 0.16), benchMat);
    back.position.set(0, 1.0, 0.34);
    bench.add(seat, back);
    bench.position.set(x, 0, HALF_W + 4.0);
    root.add(bench);
  }

  const banner = createStandingFieldBanner();
  banner.position.set(0, 0, HALF_W + 6.2);
  root.add(banner);
  root.add(createFootballCrowd());

  return root;
}

function makeFootball() {
  const group = new THREE.Group();
  group.name = 'football_match_ball';
  const ballMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f1e8, roughness: 0.52, clearcoat: 0.08, clearcoatRoughness: 0.7 });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 22, 16), ballMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);
  const blackMat = mat(0x15181a, 0.62);
  const directions = [
    [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  ];
  for (const [x, y, z] of directions) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(BALL_RADIUS * 0.34, 5), blackMat);
    patch.position.set(x * BALL_RADIUS * 0.93, y * BALL_RADIUS * 0.93, z * BALL_RADIUS * 0.93);
    patch.lookAt(new THREE.Vector3(x * 2, y * 2, z * 2));
    group.add(patch);
  }
  return group;
}

export class FootballMatchManager {
  public readonly group = new THREE.Group();
  public readonly pitchGroup = createPitchEnvironment();
  public readonly ball = makeFootball();
  public readonly ballVelocity = new THREE.Vector3();
  public readonly players: Footballer[] = [];
  public playerJoined = false;
  public scorePink = 0;
  public scoreGold = 0;
  private ballOwner: Footballer | null = null;
  private lastTouch: FootballerId | 'player' | null = null;
  private resetTimer = 0;
  private playerKickCooldown = 0;
  private celebrationTimer = 0;
  private readonly goalShouts: THREE.Sprite[] = [];
  private readonly fireworkBursts: Array<{ points: THREE.Points; velocities: Float32Array; life: number; age: number }> = [];
  private crowdCheerBoost = 0;
  private throwIn: ThrowInState | null = null;
  private goalKick: GoalKickState | null = null;
  // After a legal throw-in the ball begins in the taker's hands outside the touchline.
  // Give that restart a short re-entry window so the ordinary out-of-bounds detector
  // cannot immediately award another throw before the airborne ball crosses the line.
  private throwInGraceTimer = 0;
  private throwInReentryPending = false;
  private sidelineStallTimer = 0;
  private tempA = new THREE.Vector3();
  private tempB = new THREE.Vector3();

  constructor() {
    this.group.name = 'football_activity_root';
    this.group.add(this.pitchGroup);
    this.ball.position.copy(PITCH_CENTER).add(new THREE.Vector3(0, BALL_RADIUS + 0.075, 0));
    this.group.add(this.ball);

    const defs: Array<[FootballerId, string, TeamId, number, number, number]> = [
      ['messi', 'Lionel Messi', 'pink', -6.5, -4.0, 0.45],
      ['yamal', 'Lamine Yamal', 'pink', -8.0, 5.5, 0.65],
      ['ronaldo', 'Cristiano Ronaldo', 'gold', 6.5, 4.0, Math.PI + 0.45],
      ['haaland', 'Erling Haaland', 'gold', 9.5, -5.5, Math.PI - 0.45],
    ];
    for (const [id, name, team, x, z, rot] of defs) {
      const mesh = createFootballerModel(id);
      mesh.position.copy(PITCH_CENTER).add(new THREE.Vector3(x, Number(mesh.userData.groundOffset ?? 0.11), z));
      mesh.rotation.y = rot;
      this.group.add(mesh);
      this.players.push({
        id, name, team, mesh, velocity: new THREE.Vector3(), home: mesh.position.clone(),
        state: 'shape', stateTimer: 0, kickCooldown: 0,
        maxSpeed: Number(mesh.userData.maxSpeed ?? 7),
        shotPower: Number(mesh.userData.shotPower ?? 17),
        preferredFoot: mesh.userData.preferredFoot === 'right' ? 'right' : 'left',
        stridePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  public dispose() {
    this.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((m) => {
        if (m instanceof THREE.MeshBasicMaterial && m.map) m.map.dispose();
        m.dispose();
      });
    });
    for (const burst of this.fireworkBursts) {
      burst.points.geometry.dispose();
      if (burst.points.material instanceof THREE.Material) burst.points.material.dispose();
    }
    this.fireworkBursts.length = 0;
    this.goalShouts.length = 0;
  }

  public isPlayerNearPitch(pos: THREE.Vector3, margin = 4.0) {
    const dx = Math.abs(pos.x - PITCH_CENTER.x);
    const dz = Math.abs(pos.z - PITCH_CENTER.z);
    return dx <= HALF_L + margin && dz <= HALF_W + margin && pos.y < 4.5;
  }

  public getInteractionPrompt(pos: THREE.Vector3): string | null {
    if (!this.isPlayerNearPitch(pos, 5.5)) return null;
    if (this.playerJoined) return '[E] Leave football match  •  [F] Kick / pass / shoot near ball';
    return '[E] Join Springfield football match';
  }

  public togglePlayerJoin(pos: THREE.Vector3): { changed: boolean; joined: boolean; message: string } {
    if (!this.isPlayerNearPitch(pos, 5.5)) return { changed: false, joined: this.playerJoined, message: '' };
    this.playerJoined = !this.playerJoined;
    return {
      changed: true,
      joined: this.playerJoined,
      message: this.playerJoined
        ? 'You joined Messi and Yamal. Get near the ball and press F to pass or shoot.'
        : 'You left the match. The four footballers will keep playing.',
    };
  }

  public tryPlayerKick(position: THREE.Vector3, forward: THREE.Vector3, powerMultiplier = 1): boolean {
    if (!this.playerJoined || this.playerKickCooldown > 0 || this.throwIn || this.goalKick) return false;
    const dist = this.tempA.copy(this.ball.position).sub(position).setY(0).length();
    if (dist > 2.05) return false;
    const dir = this.tempB.copy(forward).setY(0);
    if (dir.lengthSq() < 0.001) dir.set(1, 0, 0);
    dir.normalize();
    const goalX = PITCH_CENTER.x + HALF_L;
    const towardGoal = new THREE.Vector3(goalX - this.ball.position.x, 0, PITCH_CENTER.z - this.ball.position.z).normalize();
    dir.lerp(towardGoal, dist < 1.15 ? 0.10 : 0.04).normalize();
    const power = clamp(13.5 * powerMultiplier, 9, 20.5);
    this.ballVelocity.set(dir.x * power, clamp(1.1 + power * 0.12, 1.5, 3.8), dir.z * power);
    this.ballOwner = null;
    this.lastTouch = 'player';
    this.playerKickCooldown = 0.36;
    return true;
  }

  private insidePlayable(x: number, z: number, buffer = 0) {
    return Math.abs(x - PITCH_CENTER.x) <= HALF_L + buffer && Math.abs(z - PITCH_CENTER.z) <= HALF_W + buffer;
  }

  private nearestOpponent(player: Footballer) {
    let best: Footballer | null = null;
    let bestD = Infinity;
    for (const other of this.players) {
      if (other.team === player.team) continue;
      const d = other.mesh.position.distanceToSquared(player.mesh.position);
      if (d < bestD) { bestD = d; best = other; }
    }
    return best;
  }

  private teammate(player: Footballer) {
    return this.players.find((p) => p.team === player.team && p !== player) ?? null;
  }

  private teamAttackDirection(team: TeamId) {
    return team === 'pink' ? 1 : -1;
  }

  private teamForTouch(touch: FootballerId | 'player' | null): TeamId | null {
    if (touch === 'player') return 'pink';
    if (!touch) return null;
    return this.players.find((p) => p.id === touch)?.team ?? null;
  }

  private startThrowIn(outPosition: THREE.Vector3, sidelineSign: -1 | 1) {
    if (this.throwIn || this.goalKick || this.resetTimer > 0 || this.celebrationTimer > 0) return;

    const touchingTeam = this.teamForTouch(this.lastTouch);
    // Association-football rule: the throw goes to the opponents of the player
    // who last touched the ball. If touch history is unavailable, award it to the
    // team whose player is currently closest so play can never deadlock.
    let awardedTeam: TeamId;
    if (touchingTeam) awardedTeam = touchingTeam === 'pink' ? 'gold' : 'pink';
    else {
      const nearest = [...this.players].sort((a, b) =>
        a.mesh.position.distanceToSquared(outPosition) - b.mesh.position.distanceToSquared(outPosition))[0];
      awardedTeam = nearest?.team ?? 'pink';
    }

    const spot = new THREE.Vector3(
      clamp(outPosition.x, PITCH_CENTER.x - HALF_L + 1.0, PITCH_CENTER.x + HALF_L - 1.0),
      BALL_RADIUS + 0.075,
      // Keep the dead ball only just beyond the touchline. The previous 0.72 m
      // offset placed it (and therefore the taker) so far outside that the released
      // ball could still be fully out on the next physics tick.
      PITCH_CENTER.z + sidelineSign * (HALF_W + BALL_RADIUS + 0.12),
    );
    const candidates = this.players.filter((p) => p.team === awardedTeam);
    const taker = [...candidates].sort((a, b) =>
      a.mesh.position.distanceToSquared(spot) - b.mesh.position.distanceToSquared(spot))[0];
    if (!taker) return;

    this.ballOwner = null;
    this.ballVelocity.set(0, 0, 0);
    this.ball.position.copy(spot);
    this.throwIn = { team: awardedTeam, taker, spot, phase: 'approach', timer: 0, sidelineSign };
    this.sidelineStallTimer = 0;
    for (const p of this.players) {
      p.state = p === taker ? 'throw_in' : 'shape';
      p.stateTimer = 0;
      p.velocity.multiplyScalar(0.25);
    }
  }

  private updateThrowIn(dt: number, ctx: FootballMatchUpdateContext) {
    const restart = this.throwIn;
    if (!restart) return false;
    const taker = restart.taker;
    const pos = taker.mesh.position;
    const groundY = Number(taker.mesh.userData.groundOffset ?? 0.11);
    taker.state = 'throw_in';
    taker.kickCooldown = Math.max(taker.kickCooldown, 0.15);

    if (restart.phase === 'approach') {
      const target = restart.spot.clone();
      // Stand just outside the touchline, as a real throw-in taker would. Keep the
      // feet close enough that the ball leaves the hands near the line rather than
      // more than a metre outside the field.
      target.z = PITCH_CENTER.z + restart.sidelineSign * (HALF_W + 0.52);
      target.y = groundY;
      const desired = target.sub(pos).setY(0);
      const distance = desired.length();
      if (distance > 0.12) {
        desired.normalize().multiplyScalar(Math.min(taker.maxSpeed * 0.78, distance * 4.2));
        taker.velocity.lerp(desired, Math.min(1, dt * 6.5));
        pos.addScaledVector(taker.velocity, dt);
        taker.mesh.rotation.y = Math.atan2(taker.velocity.x, taker.velocity.z);
        this.animatePlayer(taker, dt);
      } else {
        taker.velocity.set(0, 0, 0);
        restart.phase = 'pickup';
        restart.timer = 0;
      }
      this.ball.position.copy(restart.spot);
      this.ballVelocity.set(0, 0, 0);
      return true;
    }

    restart.timer += dt;
    const playerHeight = Number(taker.mesh.userData.visualWorldHeightM ?? 2.2);
    const forwardIntoPitch = new THREE.Vector3(0, 0, -restart.sidelineSign);
    taker.mesh.rotation.y = Math.atan2(forwardIntoPitch.x, forwardIntoPitch.z);
    taker.velocity.set(0, 0, 0);

    const leftArm = taker.mesh.getObjectByName('football_arm_left');
    const rightArm = taker.mesh.getObjectByName('football_arm_right');
    if (leftArm) { leftArm.rotation.x = -2.65; leftArm.rotation.z = -0.18; }
    if (rightArm) { rightArm.rotation.x = -2.65; rightArm.rotation.z = 0.18; }

    // Ball visibly travels from the ground into both hands, then remains above the
    // head for a beat before the legal two-handed throw-in.
    const handPos = pos.clone();
    handPos.y += playerHeight + 0.18;
    // Hold/release the ball slightly toward the field, not farther away from it.
    handPos.addScaledVector(forwardIntoPitch, 0.18);
    if (restart.phase === 'pickup') {
      const t = clamp(restart.timer / 0.55, 0, 1);
      this.ball.position.lerpVectors(restart.spot, handPos, t);
      this.ballVelocity.set(0, 0, 0);
      if (t >= 1) { restart.phase = 'throw'; restart.timer = 0; }
      return true;
    }

    this.ball.position.copy(handPos);
    this.ballVelocity.set(0, 0, 0);
    if (restart.timer < 0.42) return true;

    const teammate = this.players.find((p) => p.team === restart.team && p !== taker) ?? null;
    let target: THREE.Vector3;
    if (restart.team === 'pink' && ctx.playerJoined && ctx.playerPosition.distanceTo(pos) < 13.5) {
      target = ctx.playerPosition.clone().addScaledVector(ctx.playerForward.clone().setY(0).normalize(), 0.8);
    } else if (teammate) {
      target = teammate.mesh.position.clone().addScaledVector(new THREE.Vector3(this.teamAttackDirection(restart.team), 0, 0), 1.0);
    } else {
      target = pos.clone().addScaledVector(forwardIntoPitch, 6);
    }
    target.x = clamp(target.x, PITCH_CENTER.x - HALF_L + 1.0, PITCH_CENTER.x + HALF_L - 1.0);
    target.z = clamp(target.z, PITCH_CENTER.z - HALF_W + 1.2, PITCH_CENTER.z + HALF_W - 1.2);
    const dir = target.sub(this.ball.position);
    const horizontal = new THREE.Vector3(dir.x, 0, dir.z);
    if (horizontal.lengthSq() < 0.01) horizontal.copy(forwardIntoPitch);
    horizontal.normalize();
    const power = 8.8;
    // Make sure every throw has a meaningful inward component even if the chosen
    // teammate/player target happens to be almost parallel with the touchline.
    horizontal.lerp(forwardIntoPitch, 0.18).normalize();
    this.ballVelocity.set(horizontal.x * power, 3.2, horizontal.z * power);
    this.lastTouch = taker.id;
    taker.kickCooldown = 0.55;
    this.throwIn = null;
    this.throwInGraceTimer = 0.72;
    this.throwInReentryPending = true;
    this.sidelineStallTimer = 0;
    return true;
  }

  private startGoalKick(outPosition: THREE.Vector3, endSign: -1 | 1) {
    if (this.throwIn || this.goalKick || this.resetTimer > 0 || this.celebrationTimer > 0) return;

    // The goal at +X is defended by gold; the goal at -X is defended by pink.
    // For this small arcade match, every non-goal end-line exit uses the requested
    // defending-team goal-kick restart rather than adding a separate corner system.
    const awardedTeam: TeamId = endSign > 0 ? 'gold' : 'pink';
    const groundY = BALL_RADIUS + 0.075;
    const outSpot = outPosition.clone();
    outSpot.y = groundY;
    // Keep the retrieval point close to where the ball actually crossed, but stop
    // absurd far-behind-goal coordinates from sending the taker out of the activity.
    outSpot.x = PITCH_CENTER.x + endSign * clamp(Math.abs(outSpot.x - PITCH_CENTER.x), HALF_L + BALL_RADIUS + 0.04, HALF_L + GOAL_DEPTH + 2.0);
    outSpot.z = clamp(outSpot.z, PITCH_CENTER.z - HALF_W - 2.0, PITCH_CENTER.z + HALF_W + 2.0);

    // Place it clearly inside the marked goal/penalty area, not on the end line.
    // The visible small box reaches 3.6 m into the pitch, so 2.65 m is an obvious,
    // legal-looking goal-kick spot while leaving plenty of room for the run-up.
    const placementSpot = new THREE.Vector3(
      PITCH_CENTER.x + endSign * (HALF_L - 2.65),
      groundY,
      PITCH_CENTER.z + clamp(outSpot.z - PITCH_CENTER.z, -2.25, 2.25),
    );

    const candidates = this.players.filter((p) => p.team === awardedTeam);
    const taker = [...candidates].sort((a, b) =>
      a.mesh.position.distanceToSquared(outSpot) - b.mesh.position.distanceToSquared(outSpot))[0];
    if (!taker) return;

    this.ballOwner = null;
    this.ballVelocity.set(0, 0, 0);
    this.ball.position.copy(outSpot);
    this.goalKick = { team: awardedTeam, taker, outSpot, placementSpot, phase: 'approach_ball', timer: 0, endSign };
    this.sidelineStallTimer = 0;
    this.throwInGraceTimer = 0;
    this.throwInReentryPending = false;
    for (const p of this.players) {
      p.state = p === taker ? 'goal_kick' : 'shape';
      p.stateTimer = 0;
      p.velocity.multiplyScalar(0.2);
    }
  }

  private moveRestartPlayer(player: Footballer, target: THREE.Vector3, dt: number, speedScale: number) {
    const pos = player.mesh.position;
    const groundY = Number(player.mesh.userData.groundOffset ?? 0.11);
    const desired = target.clone().sub(pos).setY(0);
    const distance = desired.length();
    if (distance > 0.08) {
      desired.normalize().multiplyScalar(Math.min(player.maxSpeed * speedScale, distance * 4.5));
      player.velocity.lerp(desired, Math.min(1, dt * 7.0));
      pos.addScaledVector(player.velocity, dt);
      if (player.velocity.lengthSq() > 0.025) player.mesh.rotation.y = Math.atan2(player.velocity.x, player.velocity.z);
    } else {
      player.velocity.multiplyScalar(Math.max(0, 1 - dt * 12));
    }
    pos.y = groundY;
    this.animatePlayer(player, dt);
    return distance;
  }

  private updateGoalKick(dt: number, ctx: FootballMatchUpdateContext) {
    const restart = this.goalKick;
    if (!restart) return false;
    const taker = restart.taker;
    const pos = taker.mesh.position;
    const groundY = Number(taker.mesh.userData.groundOffset ?? 0.11);
    const intoPlay = new THREE.Vector3(-restart.endSign, 0, 0);
    taker.state = 'goal_kick';
    taker.kickCooldown = Math.max(taker.kickCooldown, 0.18);

    if (restart.phase === 'approach_ball') {
      const target = restart.outSpot.clone();
      target.x -= restart.endSign * 0.38;
      target.y = groundY;
      const distance = this.moveRestartPlayer(taker, target, dt, 0.82);
      this.ball.position.copy(restart.outSpot);
      this.ballVelocity.set(0, 0, 0);
      if (distance <= 0.18) {
        restart.phase = 'pickup';
        restart.timer = 0;
        taker.velocity.set(0, 0, 0);
      }
      return true;
    }

    restart.timer += dt;
    const playerHeight = Number(taker.mesh.userData.visualWorldHeightM ?? 2.2);
    const carryPos = pos.clone();
    carryPos.y += playerHeight * 0.52;
    carryPos.addScaledVector(intoPlay, 0.24);

    if (restart.phase === 'pickup') {
      const t = clamp(restart.timer / 0.42, 0, 1);
      this.ball.position.lerpVectors(restart.outSpot, carryPos, t);
      this.ballVelocity.set(0, 0, 0);
      if (t >= 1) {
        restart.phase = 'carry';
        restart.timer = 0;
      }
      return true;
    }

    if (restart.phase === 'carry') {
      const carryTarget = restart.placementSpot.clone();
      carryTarget.x += restart.endSign * 0.34;
      carryTarget.y = groundY;
      const distance = this.moveRestartPlayer(taker, carryTarget, dt, 0.72);
      const held = taker.mesh.position.clone().addScaledVector(intoPlay, 0.24);
      held.y += playerHeight * 0.52;
      this.ball.position.copy(held);
      this.ballVelocity.set(0, 0, 0);
      if (distance <= 0.18) {
        restart.phase = 'place';
        restart.timer = 0;
        taker.velocity.set(0, 0, 0);
      }
      return true;
    }

    if (restart.phase === 'place') {
      const t = clamp(restart.timer / 0.34, 0, 1);
      const from = taker.mesh.position.clone().addScaledVector(intoPlay, 0.24);
      from.y += playerHeight * 0.52;
      this.ball.position.lerpVectors(from, restart.placementSpot, t);
      this.ballVelocity.set(0, 0, 0);
      taker.mesh.rotation.y = Math.atan2(intoPlay.x, intoPlay.z);
      taker.velocity.set(0, 0, 0);
      this.animatePlayer(taker, dt);
      if (t >= 1) {
        this.ball.position.copy(restart.placementSpot);
        restart.phase = 'step_back';
        restart.timer = 0;
      }
      return true;
    }

    if (restart.phase === 'step_back') {
      this.ball.position.copy(restart.placementSpot);
      this.ballVelocity.set(0, 0, 0);
      // Step toward the end line to create a visible run-up before striking the ball.
      const runUp = restart.placementSpot.clone().add(new THREE.Vector3(restart.endSign * 1.45, groundY - restart.placementSpot.y, 0));
      const distance = this.moveRestartPlayer(taker, runUp, dt, 0.58);
      if (distance <= 0.13) {
        restart.phase = 'kick';
        restart.timer = 0;
        taker.velocity.set(0, 0, 0);
      }
      return true;
    }

    // Brief set before the kick makes the restart readable instead of instantly firing.
    this.ball.position.copy(restart.placementSpot);
    this.ballVelocity.set(0, 0, 0);
    taker.mesh.rotation.y = Math.atan2(intoPlay.x, intoPlay.z);
    taker.velocity.set(0, 0, 0);
    this.animatePlayer(taker, dt);
    if (restart.timer < 0.24) return true;

    const teammate = this.players.find((p) => p.team === restart.team && p !== taker) ?? null;
    let target: THREE.Vector3;
    if (restart.team === 'pink' && ctx.playerJoined && ctx.playerPosition.distanceTo(restart.placementSpot) < 18) {
      target = ctx.playerPosition.clone().addScaledVector(ctx.playerForward.clone().setY(0).normalize(), 1.3);
    } else if (teammate) {
      target = teammate.mesh.position.clone().addScaledVector(intoPlay, 3.2);
    } else {
      target = restart.placementSpot.clone().addScaledVector(intoPlay, 13);
    }
    // Force the target well into the pitch even if a teammate is standing behind the ball.
    const minimumInfieldX = restart.placementSpot.x - restart.endSign * 8.0;
    if (restart.endSign > 0) target.x = Math.min(target.x, minimumInfieldX);
    else target.x = Math.max(target.x, minimumInfieldX);
    target.z = clamp(target.z, PITCH_CENTER.z - HALF_W + 2.0, PITCH_CENTER.z + HALF_W - 2.0);

    this.kickBall(taker, target, Math.max(13.8, taker.shotPower * 0.78), 1.15);
    taker.kickCooldown = 0.72;
    this.goalKick = null;
    return true;
  }

  private kickBall(player: Footballer, target: THREE.Vector3, power: number, lift = 0.8) {
    const dir = target.clone().sub(this.ball.position).setY(0);
    if (dir.lengthSq() < 0.001) dir.set(this.teamAttackDirection(player.team), 0, 0);
    dir.normalize();
    this.ballVelocity.set(dir.x * power, lift, dir.z * power);
    this.ballOwner = null;
    this.lastTouch = player.id;
    player.kickCooldown = 0.48;
  }


  private spawnGoalShouts(scoringTeam: TeamId) {
    for (const player of this.players) {
      if (player.team !== scoringTeam) continue;
      const shout = makeSpeechBillboard('GOOOAAAAAL!', player.id);
      shout.position.copy(player.mesh.position);
      shout.position.y += Number(player.mesh.userData.visualWorldHeightM ?? 2.2) + 0.72;
      this.group.add(shout);
      this.goalShouts.push(shout);
    }
  }

  private spawnGoalFireworks(scoringTeam: TeamId) {
    const attackSign = this.teamAttackDirection(scoringTeam);
    const goalX = PITCH_CENTER.x + attackSign * HALF_L;
    const baseZ = PITCH_CENTER.z;
    const palette = [0xffd23f, 0xff5a5f, 0x59c3ff, 0xffffff, 0x9bff8a];
    for (let burstIndex = 0; burstIndex < 4; burstIndex++) {
      const count = 34;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      const origin = new THREE.Vector3(goalX + attackSign * (0.15 + burstIndex * 0.20), GOAL_HEIGHT + 1.0 + burstIndex * 0.55, baseZ + (burstIndex - 1.5) * 1.45);
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        positions[idx] = origin.x;
        positions[idx + 1] = origin.y;
        positions[idx + 2] = origin.z;
        const c = new THREE.Color(palette[(i + burstIndex) % palette.length]);
        colors[idx] = c.r; colors[idx + 1] = c.g; colors[idx + 2] = c.b;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
        const speed = 3.8 + Math.random() * 4.8;
        velocities[idx] = Math.sin(phi) * Math.cos(theta) * speed;
        velocities[idx + 1] = Math.abs(Math.cos(phi)) * speed + 2.2;
        velocities[idx + 2] = Math.sin(phi) * Math.sin(theta) * speed;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({
        size: 0.18,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, material);
      points.name = 'football_goal_fireworks';
      points.renderOrder = 30;
      this.group.add(points);
      this.fireworkBursts.push({ points, velocities, life: 2.2 + burstIndex * 0.18, age: 0 });
    }
  }

  private updateGoalEffects(dt: number) {
    for (let i = this.goalShouts.length - 1; i >= 0; i--) {
      const shout = this.goalShouts[i];
      shout.userData.life = Number(shout.userData.life ?? 0) - dt;
      const playerId = shout.userData.playerId as FootballerId | undefined;
      const attachedPlayer = playerId ? this.players.find((p) => p.id === playerId) : undefined;
      if (attachedPlayer) {
        // Follow the celebrating player's actual world position so the bubble moves
        // with running/jumping celebrations rather than drifting independently.
        shout.position.copy(attachedPlayer.mesh.position);
        shout.position.y += Number(attachedPlayer.mesh.userData.visualWorldHeightM ?? 2.2) + 0.72;
      }
      if (shout.userData.life <= 0) {
        this.group.remove(shout);
        const m = shout.material;
        if (m instanceof THREE.SpriteMaterial && m.map) m.map.dispose();
        if (m instanceof THREE.Material) m.dispose();
        this.goalShouts.splice(i, 1);
      }
    }

    for (let b = this.fireworkBursts.length - 1; b >= 0; b--) {
      const burst = this.fireworkBursts[b];
      burst.age += dt;
      const attr = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const idx = i * 3;
        burst.velocities[idx + 1] -= 7.0 * dt;
        attr.array[idx] = Number(attr.array[idx]) + burst.velocities[idx] * dt;
        attr.array[idx + 1] = Number(attr.array[idx + 1]) + burst.velocities[idx + 1] * dt;
        attr.array[idx + 2] = Number(attr.array[idx + 2]) + burst.velocities[idx + 2] * dt;
        burst.velocities[idx] *= Math.max(0, 1 - 0.55 * dt);
        burst.velocities[idx + 2] *= Math.max(0, 1 - 0.55 * dt);
      }
      attr.needsUpdate = true;
      const mat = burst.points.material;
      if (mat instanceof THREE.PointsMaterial) mat.opacity = Math.max(0, 1 - burst.age / burst.life);
      if (burst.age >= burst.life) {
        this.group.remove(burst.points);
        burst.points.geometry.dispose();
        if (burst.points.material instanceof THREE.Material) burst.points.material.dispose();
        this.fireworkBursts.splice(b, 1);
      }
    }
  }

  private animateCrowd(dt: number) {
    const boost = this.crowdCheerBoost;
    this.pitchGroup.getObjectByName('football_sideline_crowd')?.children.forEach((npc) => {
      const phase = Number(npc.userData.cheerPhase ?? 0) + dt * (3.0 + boost * 2.2);
      npc.userData.cheerPhase = phase;
      const left = npc.getObjectByName('crowd_arm_left');
      const right = npc.getObjectByName('crowd_arm_right');
      const armLift = -1.15 - Math.sin(phase * 1.7) * (0.35 + boost * 0.22);
      if (left) { left.rotation.z = -0.42; left.rotation.x = armLift; }
      if (right) { right.rotation.z = 0.42; right.rotation.x = armLift; }
      const jump = Math.max(0, Math.sin(phase * 1.3)) * (0.025 + boost * 0.12);
      npc.position.y = Number(npc.userData.baseY ?? 0) + jump;
    });
    this.crowdCheerBoost = Math.max(0, this.crowdCheerBoost - dt * 0.34);
  }

  private scoreGoal(scoringTeam: TeamId) {
    if (scoringTeam === 'pink') this.scorePink += 1;
    else this.scoreGold += 1;
    this.spawnGoalFireworks(scoringTeam);
    this.spawnGoalShouts(scoringTeam);
    this.crowdCheerBoost = 1;
    this.celebrationTimer = 3.2;
    for (const p of this.players) {
      p.state = p.team === scoringTeam ? 'celebrate' : 'recover';
      p.stateTimer = 2.5 + Math.random() * 0.5;
    }
    this.resetTimer = 2.6;
    this.ballOwner = null;
    this.ballVelocity.set(0, 0, 0);
  }

  private resetBall() {
    this.ball.position.copy(PITCH_CENTER).add(new THREE.Vector3(0, BALL_RADIUS + 0.075, 0));
    this.ball.rotation.set(0, 0, 0);
    this.ballVelocity.set(0, 0, 0);
    this.ballOwner = null;
    this.lastTouch = null;
    this.throwIn = null;
    this.goalKick = null;
    this.throwInGraceTimer = 0;
    this.throwInReentryPending = false;
    this.sidelineStallTimer = 0;
    for (const p of this.players) {
      p.state = 'shape';
      p.stateTimer = 0;
      p.mesh.position.y = Number(p.mesh.userData.groundOffset ?? 0.11);
    }
  }

  private animatePlayer(player: Footballer, dt: number) {
    const speed = player.velocity.length();
    player.stridePhase += dt * (2.2 + speed * 1.15);
    const stride = Math.sin(player.stridePhase) * clamp(speed / Math.max(1, player.maxSpeed), 0, 1) * 0.58;
    const leftLeg = player.mesh.getObjectByName('football_leg_left');
    const rightLeg = player.mesh.getObjectByName('football_leg_right');
    const leftArm = player.mesh.getObjectByName('football_arm_left');
    const rightArm = player.mesh.getObjectByName('football_arm_right');
    if (leftLeg) leftLeg.rotation.x = stride;
    if (rightLeg) rightLeg.rotation.x = -stride;
    if (leftArm) leftArm.rotation.x = -stride * 0.72;
    if (rightArm) rightArm.rotation.x = stride * 0.72;
    if (player.state === 'celebrate') {
      if (leftArm) leftArm.rotation.x = -2.25;
      if (rightArm) rightArm.rotation.x = -2.25;
      const groundY = Number(player.mesh.userData.groundOffset ?? 0.11);
      player.mesh.position.y = groundY + Math.max(0, Math.sin(player.stridePhase * 1.6)) * 0.12;
    } else {
      const groundY = Number(player.mesh.userData.groundOffset ?? 0.11);
      player.mesh.position.y = THREE.MathUtils.lerp(player.mesh.position.y, groundY, Math.min(1, dt * 9));
    }
  }

  private updateAI(player: Footballer, dt: number, ctx: FootballMatchUpdateContext) {
    player.kickCooldown = Math.max(0, player.kickCooldown - dt);
    player.stateTimer = Math.max(0, player.stateTimer - dt);
    const pos = player.mesh.position;
    const ball2D = this.tempA.copy(this.ball.position).setY(pos.y);
    const distBall = pos.distanceTo(ball2D);
    const attackSign = this.teamAttackDirection(player.team);
    const opponentGoal = new THREE.Vector3(PITCH_CENTER.x + attackSign * HALF_L, Number(player.mesh.userData.groundOffset ?? 0.11), PITCH_CENTER.z);
    const teammate = this.teammate(player);
    const opponent = this.nearestOpponent(player);

    let target = player.home.clone();
    let desiredSpeed = player.maxSpeed * 0.48;

    if (this.celebrationTimer > 0) {
      if (player.state === 'celebrate') {
        target.copy(pos).add(new THREE.Vector3(attackSign * 1.5, 0, Math.sin(player.stridePhase) * 1.2));
        desiredSpeed = player.maxSpeed * 0.38;
      } else {
        target.copy(player.home);
        desiredSpeed = player.maxSpeed * 0.34;
      }
    } else if (this.ballOwner === player) {
      player.state = 'dribble';
      const goalDistance = Math.abs(opponentGoal.x - pos.x);
      const underPressure = opponent ? opponent.mesh.position.distanceTo(pos) < 3.2 : false;
      if (goalDistance < 12.5 && player.kickCooldown <= 0) {
        player.state = 'shoot';
        const aimZ = clamp(PITCH_CENTER.z + (Math.random() - 0.5) * GOAL_WIDTH * 0.64, PITCH_CENTER.z - GOAL_WIDTH / 2 + 0.35, PITCH_CENTER.z + GOAL_WIDTH / 2 - 0.35);
        this.kickBall(player, new THREE.Vector3(opponentGoal.x + attackSign * 0.9, 0, aimZ), player.shotPower, 1.2 + Math.random() * 1.4);
        return;
      }
      if (ctx.playerJoined && player.team === 'pink' && player.kickCooldown <= 0) {
        const humanDelta = ctx.playerPosition.clone().sub(pos).setY(0);
        const humanDistance = humanDelta.length();
        const humanAhead = humanDelta.x * attackSign > 1.0;
        if (humanDistance > 3.0 && humanDistance < 13.0 && humanAhead && (underPressure || Math.random() < 0.12)) {
          player.state = 'pass';
          const passLead = ctx.playerPosition.clone().addScaledVector(ctx.playerForward.clone().setY(0).normalize(), 1.0);
          this.kickBall(player, passLead, 10.6 + Math.random() * 1.4, 0.42);
          return;
        }
      }
      if (underPressure && teammate && player.kickCooldown <= 0 && Math.random() < 0.32) {
        player.state = 'pass';
        const passLead = teammate.mesh.position.clone().addScaledVector(new THREE.Vector3(attackSign, 0, 0), 1.6);
        this.kickBall(player, passLead, 10.2 + Math.random() * 1.6, 0.48);
        return;
      }
      target.copy(opponentGoal);
      target.z += Math.sin(player.stridePhase * 0.33 + (player.id === 'messi' ? 0.4 : 1.6)) * 3.2;
      desiredSpeed = player.maxSpeed * (underPressure ? 0.82 : 0.72);
      // Controlled dribble: keep the ball just ahead of the preferred foot.
      const ahead = new THREE.Vector3(attackSign, 0, 0).multiplyScalar(0.68);
      ahead.z = (player.preferredFoot === 'left' ? -1 : 1) * 0.16;
      const desiredBall = pos.clone().add(ahead);
      this.ball.position.x = THREE.MathUtils.lerp(this.ball.position.x, desiredBall.x, Math.min(1, dt * 7.8));
      this.ball.position.z = THREE.MathUtils.lerp(this.ball.position.z, desiredBall.z, Math.min(1, dt * 7.8));
      this.ball.position.y = BALL_RADIUS + 0.075;
      this.ballVelocity.set(0, 0, 0);
      this.lastTouch = player.id;
    } else {
      const teamMates = this.players.filter((p) => p.team === player.team);
      const nearestTeam = [...teamMates].sort((a, b) => a.mesh.position.distanceToSquared(ball2D) - b.mesh.position.distanceToSquared(ball2D))[0];
      if (nearestTeam === player && (!this.ballOwner || this.ballOwner.team !== player.team)) {
        player.state = 'chase';
        target.copy(ball2D);
        desiredSpeed = player.maxSpeed;
      } else {
        player.state = 'shape';
        const ballInfluenceX = clamp((this.ball.position.x - PITCH_CENTER.x) * 0.35, -7, 7);
        const ballInfluenceZ = clamp((this.ball.position.z - PITCH_CENTER.z) * 0.24, -3.8, 3.8);
        target.copy(player.home).add(new THREE.Vector3(ballInfluenceX, 0, ballInfluenceZ));
        desiredSpeed = player.maxSpeed * 0.52;
      }

      if (!this.ballOwner && distBall < 0.92 && player.kickCooldown <= 0 && this.ball.position.y < 0.72) {
        this.ballOwner = player;
        this.lastTouch = player.id;
        this.ballVelocity.set(0, 0, 0);
      }
    }

    // Steering layer prevents obvious body-overlap before the hard separation pass.
    this.addPlayerAvoidance(player, target, ctx);

    // Keep AI strictly inside the playing area.
    target.x = clamp(target.x, PITCH_CENTER.x - HALF_L + 1.0, PITCH_CENTER.x + HALF_L - 1.0);
    target.z = clamp(target.z, PITCH_CENTER.z - HALF_W + 0.9, PITCH_CENTER.z + HALF_W - 0.9);

    const desired = target.sub(pos).setY(0);
    const distance = desired.length();
    if (distance > 0.06) desired.normalize().multiplyScalar(Math.min(desiredSpeed, distance * 3.2));
    else desired.set(0, 0, 0);
    player.velocity.lerp(desired, Math.min(1, dt * 5.6));
    pos.addScaledVector(player.velocity, dt);
    if (player.velocity.lengthSq() > 0.04) {
      player.mesh.rotation.y = Math.atan2(player.velocity.x, player.velocity.z);
    }
    this.animatePlayer(player, dt);
  }

  private addPlayerAvoidance(player: Footballer, target: THREE.Vector3, ctx: FootballMatchUpdateContext) {
    const pos = player.mesh.position;
    for (const other of this.players) {
      if (other === player) continue;
      const delta = pos.clone().sub(other.mesh.position).setY(0);
      const distance = delta.length();
      if (distance < 0.001 || distance >= 2.0) continue;
      const strength = (2.0 - distance) * (distance < FOOTBALLER_MIN_SEPARATION + 0.18 ? 1.45 : 0.65);
      target.addScaledVector(delta.normalize(), strength);
    }

    // The user's character is a real body too. Teammates give slightly more room;
    // opponents may challenge closely, but neither side deliberately paths through it.
    if (ctx.playerJoined) {
      const delta = pos.clone().sub(ctx.playerPosition).setY(0);
      const distance = delta.length();
      const preferred = player.team === 'pink' ? 1.25 : 0.92;
      if (distance > 0.001 && distance < preferred + 0.75) {
        target.addScaledVector(delta.normalize(), (preferred + 0.75 - distance) * 1.25);
      }
    }
  }

  private resolveFootballerCollisions(ctx: FootballMatchUpdateContext) {
    for (let i = 0; i < this.players.length; i++) {
      const a = this.players[i];
      for (let j = i + 1; j < this.players.length; j++) {
        const b = this.players[j];
        const delta = a.mesh.position.clone().sub(b.mesh.position).setY(0);
        let distance = delta.length();
        if (distance >= FOOTBALLER_MIN_SEPARATION) continue;
        if (distance < 0.001) {
          // Stable deterministic direction avoids jitter if two centres somehow match.
          delta.set(i % 2 === 0 ? 1 : -1, 0, j % 2 === 0 ? 0.35 : -0.35).normalize();
          distance = 0.001;
        } else {
          delta.multiplyScalar(1 / distance);
        }

        const overlap = FOOTBALLER_MIN_SEPARATION - distance;
        const correction = overlap * 0.5 + 0.002;
        a.mesh.position.addScaledVector(delta, correction);
        b.mesh.position.addScaledVector(delta, -correction);

        // Remove only the inward component of relative velocity. Tangential motion
        // remains, so players slide around one another instead of sticking/bouncing.
        const relative = a.velocity.clone().sub(b.velocity);
        const closingSpeed = relative.dot(delta);
        if (closingSpeed < 0) {
          a.velocity.addScaledVector(delta, -closingSpeed * 0.5);
          b.velocity.addScaledVector(delta, closingSpeed * 0.5);
        }
      }
    }

    // Keep AI bodies from occupying the human player's body while they challenge.
    if (ctx.playerJoined) {
      for (const player of this.players) {
        const delta = player.mesh.position.clone().sub(ctx.playerPosition).setY(0);
        let distance = delta.length();
        const minimum = player.team === 'pink' ? 1.02 : 0.88;
        if (distance >= minimum) continue;
        if (distance < 0.001) {
          delta.set(player.team === 'pink' ? -1 : 1, 0, player.id === 'haaland' || player.id === 'messi' ? 0.22 : -0.22).normalize();
          distance = 0.001;
        } else {
          delta.multiplyScalar(1 / distance);
        }
        player.mesh.position.addScaledVector(delta, minimum - distance + 0.002);
        const inward = player.velocity.dot(delta);
        if (inward < 0) player.velocity.addScaledVector(delta, -inward);
      }
    }

    // During open play, collision correction must not push anyone outside the pitch.
    // Restart takers are allowed beyond the line while retrieving the dead ball.
    for (const player of this.players) {
      const isRestartTaker = (this.throwIn?.taker === player) || (this.goalKick?.taker === player);
      if (!isRestartTaker) {
        player.mesh.position.x = clamp(player.mesh.position.x, PITCH_CENTER.x - HALF_L + 0.72, PITCH_CENTER.x + HALF_L - 0.72);
        player.mesh.position.z = clamp(player.mesh.position.z, PITCH_CENTER.z - HALF_W + 0.72, PITCH_CENTER.z + HALF_W - 0.72);
      }
    }
  }

  private updateBall(dt: number, ctx: FootballMatchUpdateContext) {
    if (this.ballOwner) return;
    const p = this.ball.position;
    const v = this.ballVelocity;
    const groundY = BALL_RADIUS + 0.075;

    // Player body can nudge the ball even before explicitly joining, but only gently.
    const playerDelta = this.tempA.copy(p).sub(ctx.playerPosition).setY(0);
    const playerDist = playerDelta.length();
    if (playerDist < 0.75 && p.y < 0.7) {
      if (playerDist < 0.01) playerDelta.set(1, 0, 0); else playerDelta.normalize();
      v.addScaledVector(playerDelta, (0.75 - playerDist) * 4.2);
    }

    v.y -= 9.81 * dt;
    const speed = v.length();
    if (speed > 0.01) {
      // Air drag; mild enough for powerful shots to cross the pitch.
      v.multiplyScalar(Math.max(0, 1 - (0.015 + speed * 0.0016) * dt));
    }
    p.addScaledVector(v, dt);

    if (p.y <= groundY) {
      p.y = groundY;
      if (v.y < -0.35) v.y = -v.y * 0.52;
      else v.y = 0;
      const horizontal = Math.hypot(v.x, v.z);
      if (horizontal > 0.001) {
        const rollingDecel = 2.15 * dt;
        const newSpeed = Math.max(0, horizontal - rollingDecel);
        const ratio = newSpeed / horizontal;
        v.x *= ratio;
        v.z *= ratio;
        const axis = new THREE.Vector3(v.z, 0, -v.x).normalize();
        this.ball.rotateOnWorldAxis(axis, (horizontal * dt) / BALL_RADIUS);
      }
    }

    const localX = p.x - PITCH_CENTER.x;
    const localZ = p.z - PITCH_CENTER.z;
    const inGoalMouth = Math.abs(localZ) < GOAL_WIDTH / 2 && p.y < GOAL_HEIGHT;

    // Goals take priority over all out-of-play restarts.
    if (localX > HALF_L + 0.28 && inGoalMouth) {
      this.scoreGoal('pink');
      return;
    }
    if (localX < -HALF_L - 0.28 && inGoalMouth) {
      this.scoreGoal('gold');
      return;
    }

    // End-line restart: once the whole ball has crossed behind either goal OUTSIDE
    // the goal mouth, the defending side retrieves it and takes a goal kick.
    if (Math.abs(localX) > HALF_L + BALL_RADIUS && !inGoalMouth) {
      this.startGoalKick(p.clone(), localX > 0 ? 1 : -1);
      return;
    }

    // Throw-ins: once the whole ball has crossed either long touchline, stop play
    // and award the throw to the opponents of whoever touched it last. A freshly
    // released throw-in is exempt for a fraction of a second because its centre
    // legitimately begins outside the field in the taker's hands.
    if (this.throwInReentryPending) {
      // End the restart protection as soon as the thrown ball is safely back inside.
      if (Math.abs(localZ) <= HALF_W - BALL_RADIUS * 0.15) {
        this.throwInGraceTimer = 0;
        this.throwInReentryPending = false;
      } else if (this.throwInGraceTimer <= 0) {
        // Absolute anti-loop failsafe: if unusual frame timing/collision somehow kept
        // the ball outside for the whole grace window, complete this SAME throw-in
        // by placing it just inside with inward momentum. Never award a second throw.
        const side = localZ >= 0 ? 1 : -1;
        p.z = PITCH_CENTER.z + side * (HALF_W - BALL_RADIUS - 0.10);
        v.z = -side * Math.max(3.6, Math.abs(v.z));
        this.throwInReentryPending = false;
        this.throwInGraceTimer = 0;
      }
      this.sidelineStallTimer = 0;
    } else if (Math.abs(localZ) > HALF_W + BALL_RADIUS) {
      this.startThrowIn(p.clone(), localZ > 0 ? 1 : -1);
      return;
    }

    // Dead-ball failsafe for the original bug: if a nearly stationary ball sits on
    // the paint/edge for over a second, treat it as having completed the crossing.
    // This avoids a permanent equilibrium where rolling friction leaves it stranded.
    const nearTouchline = Math.abs(Math.abs(localZ) - HALF_W) <= BALL_RADIUS + 0.16;
    const horizontalSpeed = Math.hypot(v.x, v.z);
    if (!this.throwInReentryPending && this.throwInGraceTimer <= 0 && nearTouchline && p.y <= groundY + 0.08 && horizontalSpeed < 0.24) {
      this.sidelineStallTimer += dt;
      if (this.sidelineStallTimer > 1.0) {
        const side: -1 | 1 = localZ >= 0 ? 1 : -1;
        const forcedOut = p.clone();
        forcedOut.z = PITCH_CENTER.z + side * (HALF_W + BALL_RADIUS + 0.03);
        this.startThrowIn(forcedOut, side);
        return;
      }
    } else {
      this.sidelineStallTimer = 0;
    }

    // Goal frames / side-net effect. The pitch remains open: no invisible field walls.
    if (Math.abs(localX) > HALF_L && inGoalMouth) {
      const maxX = HALF_L + GOAL_DEPTH - BALL_RADIUS;
      if (Math.abs(localX) > maxX) {
        p.x = PITCH_CENTER.x + Math.sign(localX) * maxX;
        v.x *= -0.35;
      }
      if (Math.abs(localZ) > GOAL_WIDTH / 2 - BALL_RADIUS) {
        p.z = PITCH_CENTER.z + Math.sign(localZ) * (GOAL_WIDTH / 2 - BALL_RADIUS);
        v.z *= -0.42;
      }
    }

    // Recover balls that genuinely leave the activity area. This is a gameplay reset,
    // not an invisible wall: the ball can cross the touchline visibly first.
    if (!this.insidePlayable(p.x, p.z, TOUCH_BUFFER + 4.0) || p.y < -1.2 || p.y > 11) {
      const nearestX = clamp(p.x, PITCH_CENTER.x - HALF_L + 1.2, PITCH_CENTER.x + HALF_L - 1.2);
      const nearestZ = clamp(p.z, PITCH_CENTER.z - HALF_W + 1.2, PITCH_CENTER.z + HALF_W - 1.2);
      p.set(nearestX, groundY, nearestZ);
      v.multiplyScalar(0.18);
      v.y = 0;
      this.ballOwner = null;
    }
  }

  public update(dt: number, ctx: FootballMatchUpdateContext) {
    this.updateGoalEffects(Math.min(dt, 1 / 20));
    this.animateCrowd(Math.min(dt, 1 / 20));
    const step = Math.min(dt, 1 / 30);
    this.playerKickCooldown = Math.max(0, this.playerKickCooldown - step);
    this.throwInGraceTimer = Math.max(0, this.throwInGraceTimer - step);
    this.celebrationTimer = Math.max(0, this.celebrationTimer - step);
    if (this.resetTimer > 0) {
      this.resetTimer -= step;
      if (this.resetTimer <= 0) this.resetBall();
    }

    // Two substeps make ball collisions/rolling stable when the game frame-rate dips.
    const substeps = dt > 1 / 45 ? 2 : 1;
    const subDt = Math.min(dt / substeps, 1 / 45);
    for (let i = 0; i < substeps; i++) {
      const throwActive = this.resetTimer <= 0 && this.updateThrowIn(subDt, ctx);
      const goalKickActive = !throwActive && this.resetTimer <= 0 && this.updateGoalKick(subDt, ctx);
      if (throwActive || goalKickActive) {
        // During a restart the taker owns the dead ball. Everyone else drops toward
        // shape and cannot steal/kick it before the restart is completed.
        const activeTaker = this.throwIn?.taker ?? this.goalKick?.taker ?? null;
        for (const player of this.players) {
          if (player === activeTaker) continue;
          player.kickCooldown = Math.max(0, player.kickCooldown - subDt);
          const towardHomeTarget = player.home.clone();
          this.addPlayerAvoidance(player, towardHomeTarget, ctx);
          const towardHome = towardHomeTarget.sub(player.mesh.position).setY(0);
          if (towardHome.lengthSq() > 0.04) {
            towardHome.normalize().multiplyScalar(player.maxSpeed * 0.28);
            player.velocity.lerp(towardHome, Math.min(1, subDt * 4));
            player.mesh.position.addScaledVector(player.velocity, subDt);
            if (player.velocity.lengthSq() > 0.04) player.mesh.rotation.y = Math.atan2(player.velocity.x, player.velocity.z);
          } else player.velocity.multiplyScalar(0.75);
          this.animatePlayer(player, subDt);
        }
        this.resolveFootballerCollisions(ctx);
        continue;
      }
      if (this.resetTimer <= 0) this.updateBall(subDt, ctx);
      if (!this.throwIn && !this.goalKick) {
        for (const player of this.players) this.updateAI(player, subDt, ctx);
        this.resolveFootballerCollisions(ctx);
      }
    }
  }
}

export const FOOTBALL_PITCH_CENTER = PITCH_CENTER.clone();
