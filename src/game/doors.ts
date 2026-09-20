import * as THREE from 'three';
import { playSoundEffect } from './audio';
import { createMaterial } from './models';

export interface WallBox {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Optional vertical bounds. Omitted means the blocker applies at every height. */
  minY?: number;
  maxY?: number;
  doorId?: string; // Collider is disabled if this door is open
  /** Optional oriented X/Z footprint for rotated authored geometry. min/max remain as broad-phase AABB bounds. */
  centerX?: number;
  centerZ?: number;
  halfX?: number;
  halfZ?: number;
  rotationY?: number;
  /** Collision ownership. Fixed world geometry may be de-duplicated against visible authored walls; interactive objects must never be rewritten into static scenery. */
  collisionRole?: 'fixed' | 'interactive' | 'door';
  /** Visible source mesh when this collider was generated from scene geometry. Used to prevent a movable hierarchy being registered twice as both static and interactive collision. */
  sourceObjectUuid?: string;
}


export interface WalkableSurface {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  /** Exact registered vertical bounds when backed by visible geometry. */
  minY?: number;
  maxY?: number;
  priority?: number;
  /** Optional bridge/ramp recovery height. Allows intentionally raised authored roads to lift a body that has fallen slightly below the visible deck. */
  snapFromBelow?: number;
  /** True for authored stair treads / precise stair support surfaces. */
  isStair?: boolean;
  /** True for a real visible roof surface that flying characters may land on. */
  isRoof?: boolean;
  /** Original authored mesh. Used for exact ray-tested road/floor/roof height when available. */
  object?: THREE.Object3D;
}

export type DoorType = 'swing' | 'double_slide';

/**
 * Author a stair tread/support surface once and keep the collision metadata
 * consistent everywhere. Future stairs should use this helper instead of only
 * creating visible geometry: the global stair audit and movement solver both
 * recognise `stairSurface`.
 */
export function markWalkableStairSurface(
  object: THREE.Object3D,
  priority = 60,
  snapFromBelow = 0.82
) {
  object.userData.walkable = true;
  object.userData.stairSurface = true;
  object.userData.walkablePriority = priority;
  object.userData.walkableSnapFromBelow = Math.max(
    Number(object.userData.walkableSnapFromBelow ?? 0) || 0,
    snapFromBelow
  );
  return object;
}

/** Stair/landing railings use compact authored collision rather than ad-hoc boxes. */
export function markStairRailing(...objects: THREE.Object3D[]) {
  objects.forEach((object) => {
    object.userData.solidCollider = true;
    object.userData.stairRailing = true;
    object.userData.colliderPadding = 0.012;
  });
}

export class Door {
  public id: string;
  public name: string;
  public houseName: string;
  public group: THREE.Group;
  public type: DoorType;
  public position: THREE.Vector3; // World position of center of doorway
  public worldPos: THREE.Vector3;
  public isOpen = false;
  public currentProgress = 0; // 0 = closed, 1 = open
  public targetProgress = 0;
  public interactionRadius = 3.8;
  public collider: WallBox;
  public automatic = false;
  public automaticLocked = false;
  public automaticSensorRadius = 5.6;
  private automaticCloseDelay = 1.25;
  private automaticCloseTimer = 0;
  private automaticMotionSpeed = 9.5;
  private doorwayWidth: number;
  private doorwayYaw: number;

  // Visual parts
  private pivotLeft?: THREE.Group;
  private pivotRight?: THREE.Group;
  private slideLeft?: THREE.Object3D;
  private slideRight?: THREE.Object3D;
  private slideClosedLeftX = 0;
  private slideClosedRightX = 0;
  private swingAngle: number;
  private slideDistance: number;

  constructor(config: {
    id: string;
    name: string;
    houseName: string;
    type: DoorType;
    width: number;
    height: number;
    worldPos: THREE.Vector3;
    rotationY?: number;
    frameColor?: number;
    glassColor?: number;
    swingAngle?: number;
    slideDistance?: number;
    depth?: number;
    /** Standard pedestrian doors are automatic by default. Set false only for a deliberately specialised/locked door controller. */
    automatic?: boolean;
    automaticSensorRadius?: number;
    automaticCloseDelay?: number;
    automaticMotionSpeed?: number;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.houseName = config.houseName;
    // Global pedestrian-door standard: every ordinary Door migrates onto the
    // airport sliding-panel system. A caller must explicitly opt out of automation
    // to preserve a specialised legacy swing mechanism.
    this.type = config.type === 'swing' && config.automatic === false ? 'swing' : 'double_slide';
    this.position = config.worldPos.clone();
    this.worldPos = config.worldPos.clone();
    this.swingAngle = config.swingAngle ?? Math.PI * 0.55;
    this.slideDistance = config.slideDistance ?? config.width * 0.45;
    this.doorwayWidth = config.width;
    this.doorwayYaw = config.rotationY ?? 0;

    this.group = new THREE.Group();
    this.group.name = `door_${config.id}`;
    this.group.position.copy(config.worldPos);
    if (config.rotationY !== undefined) {
      this.group.rotation.y = config.rotationY;
    }

    const frameMat = createMaterial(config.frameColor ?? 0x5d4037, 0.5, 0.1);
    const metalMat = createMaterial(0xdcdcdc, 0.2, 0.8);
    const goldHandleMat = createMaterial(0xffb300, 0.2, 0.8);

    // Lightweight cartoon glass. MeshPhysicalMaterial transmission was expensive
    // and its overlapping transparent surfaces caused doors/windows to shimmer.
    const glassMat = new THREE.MeshStandardMaterial({
      color: config.glassColor ?? 0xb2ebf2,
      transparent: true,
      opacity: 0.42,
      roughness: 0.22,
      metalness: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const depth = config.depth ?? 0.25;

    // Door Frame Outer Header and Posts
    const framePostW = 0.18;
    const postL = new THREE.Mesh(new THREE.BoxGeometry(framePostW, config.height, depth * 1.2), frameMat);
    postL.position.set(-config.width / 2, config.height / 2, 0);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(framePostW, config.height, depth * 1.2), frameMat);
    postR.position.set(config.width / 2, config.height / 2, 0);
    const postHeader = new THREE.Mesh(new THREE.BoxGeometry(config.width + framePostW * 2, framePostW, depth * 1.2), frameMat);
    postHeader.position.set(0, config.height, 0);
    this.group.add(postL, postR, postHeader);

    // Glowing subtle sign/indicator at top of door
    const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.04), createMaterial(0x00e676));
    indicator.position.set(0, config.height + 0.1, depth * 0.65);
    this.group.add(indicator);

    if (this.type === 'swing') {
      // Single swing door pivoted on left side
      const panelWidth = config.width - framePostW;
      const pivot = new THREE.Group();
      pivot.position.set(-config.width / 2 + framePostW / 2, 0, 0);

      const panelGroup = new THREE.Group();
      panelGroup.position.set(panelWidth / 2, 0, 0);

      // Glass pane
      const glass = new THREE.Mesh(new THREE.BoxGeometry(panelWidth - 0.14, config.height - 0.2, 0.06), glassMat);
      glass.position.y = config.height / 2;

      // Inner wood/metal subframe
      const subFrameBottom = new THREE.Mesh(new THREE.BoxGeometry(panelWidth, 0.25, 0.1), frameMat);
      subFrameBottom.position.y = 0.125;
      const subFrameTop = new THREE.Mesh(new THREE.BoxGeometry(panelWidth, 0.15, 0.1), frameMat);
      subFrameTop.position.y = config.height - 0.075;
      const subFrameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, config.height, 0.1), frameMat);
      subFrameLeft.position.set(-panelWidth / 2 + 0.06, config.height / 2, 0);
      const subFrameRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, config.height, 0.1), frameMat);
      subFrameRight.position.set(panelWidth / 2 - 0.06, config.height / 2, 0);

      // Door Handle (Brass lever)
      const handleGroup = new THREE.Group();
      handleGroup.position.set(panelWidth / 2 - 0.15, config.height * 0.45, 0);
      const handleStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), goldHandleMat);
      handleStem.rotation.x = Math.PI / 2;
      const handleBarF = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), goldHandleMat);
      handleBarF.position.set(-0.06, 0, 0.1);
      const handleBarB = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), goldHandleMat);
      handleBarB.position.set(-0.06, 0, -0.1);
      handleGroup.add(handleStem, handleBarF, handleBarB);

      panelGroup.add(glass, subFrameBottom, subFrameTop, subFrameLeft, subFrameRight, handleGroup);
      pivot.add(panelGroup);
      this.group.add(pivot);
      this.pivotLeft = pivot;
    } else {
      // Double automatic/manual sliding glass door
      const halfW = (config.width - framePostW) / 2;

      // Left Sliding Leaf
      const leafL = new THREE.Group();
      leafL.position.set(-halfW / 2, 0, 0);
      const glassL = new THREE.Mesh(new THREE.BoxGeometry(halfW - 0.06, config.height - 0.15, 0.06), glassMat);
      glassL.position.y = config.height / 2;
      const trimBottomL = new THREE.Mesh(new THREE.BoxGeometry(halfW, 0.2, 0.09), metalMat);
      trimBottomL.position.y = 0.1;
      const trimTopL = new THREE.Mesh(new THREE.BoxGeometry(halfW, 0.12, 0.09), metalMat);
      trimTopL.position.y = config.height - 0.06;
      const handleL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), metalMat);
      handleL.position.set(halfW / 2 - 0.1, config.height * 0.45, 0.06);
      leafL.add(glassL, trimBottomL, trimTopL, handleL);

      // Right Sliding Leaf
      const leafR = new THREE.Group();
      leafR.position.set(halfW / 2, 0, 0);
      const glassR = new THREE.Mesh(new THREE.BoxGeometry(halfW - 0.06, config.height - 0.15, 0.06), glassMat);
      glassR.position.y = config.height / 2;
      const trimBottomR = new THREE.Mesh(new THREE.BoxGeometry(halfW, 0.2, 0.09), metalMat);
      trimBottomR.position.y = 0.1;
      const trimTopR = new THREE.Mesh(new THREE.BoxGeometry(halfW, 0.12, 0.09), metalMat);
      trimTopR.position.y = config.height - 0.06;
      const handleR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), metalMat);
      handleR.position.set(-halfW / 2 + 0.1, config.height * 0.45, 0.06);
      leafR.add(glassR, trimBottomR, trimTopR, handleR);

      this.group.add(leafL, leafR);
      this.slideLeft = leafL;
      this.slideRight = leafR;
      this.slideClosedLeftX = leafL.position.x;
      this.slideClosedRightX = leafR.position.x;
    }

    // Closed-door collision follows the visible doorway orientation exactly. The
    // old truthy `rotationY ? ... : ...` test treated a 180-degree door as though
    // it were rotated 90 degrees and made several entrances feel blocked by air.
    const halfWidth = config.width / 2;
    const colDepth = Math.max(0.12, depth * 0.72);
    const yaw = config.rotationY ?? 0;
    const c = Math.abs(Math.cos(yaw));
    const s = Math.abs(Math.sin(yaw));
    const broadHalfX = c * halfWidth + s * colDepth;
    const broadHalfZ = s * halfWidth + c * colDepth;
    this.collider = {
      id: `door_col_${config.id}`,
      minX: config.worldPos.x - broadHalfX,
      maxX: config.worldPos.x + broadHalfX,
      minZ: config.worldPos.z - broadHalfZ,
      maxZ: config.worldPos.z + broadHalfZ,
      minY: config.worldPos.y,
      maxY: config.worldPos.y + config.height + 0.1,
      centerX: config.worldPos.x,
      centerZ: config.worldPos.z,
      halfX: halfWidth,
      halfZ: colDepth,
      rotationY: yaw,
      doorId: this.id,
      collisionRole: 'door',
    };

    // Airport-style automatic sliding doors are now the global standard for every
    // normal Door instance. Specific callers can still opt out for specialised
    // mechanisms, while airport/tower callers remain free to retune the values with
    // setAutomatic() after construction.
    if (config.automatic !== false) {
      this.setAutomatic(
        config.automaticSensorRadius ?? 5.6,
        config.automaticCloseDelay ?? 1.25,
        config.automaticMotionSpeed ?? 9.5,
      );
    }
  }

  public open() {
    if (this.automaticLocked || this.isOpen) return;
    this.isOpen = true;
    this.targetProgress = 1;
    playSoundEffect('door', this.worldPos);
  }

  /** Convert a normal sliding door into a sensor-driven automatic door. */
  public setAutomatic(sensorRadius = 5.6, closeDelay = 1.25, motionSpeed = 9.5) {
    this.automatic = true;
    this.automaticSensorRadius = Math.max(2.5, sensorRadius);
    this.automaticCloseDelay = Math.max(0.35, closeDelay);
    this.automaticMotionSpeed = THREE.MathUtils.clamp(motionSpeed, 6.0, 20.0);
    this.automaticCloseTimer = 0;
    this.group.userData.automaticDoor = true;
  }

  /** Temporarily lock an otherwise automatic pedestrian door (for scripted states). */
  public setAutomaticLocked(locked: boolean) {
    this.automaticLocked = locked;
    this.group.userData.automaticDoorLocked = locked;
    if (locked) {
      this.automaticCloseTimer = 0;
      this.close();
    }
  }

  /**
   * Oriented, two-sided sensor matching the actual doorway rather than a huge
   * spherical trigger. Speed adds a small forward look-ahead so a sprinting player
   * gets the same uninterrupted airport-style walk-through as a walking player.
   */
  public isWithinAutomaticSensor(worldPosition: THREE.Vector3, approachSpeed = 0) {
    if (!this.automatic || this.automaticLocked) return false;
    if (Math.abs(worldPosition.y - this.position.y) > 5.0) return false;
    const dx = worldPosition.x - this.position.x;
    const dz = worldPosition.z - this.position.z;
    const c = Math.cos(-this.doorwayYaw);
    const sn = Math.sin(-this.doorwayYaw);
    const localX = dx * c - dz * sn;
    const localZ = dx * sn + dz * c;
    const speedLead = THREE.MathUtils.clamp(Math.max(0, approachSpeed) * 0.32, 0, 2.6);
    const lateralHalf = this.doorwayWidth * 0.5 + 2.35;
    const depthHalf = this.automaticSensorRadius + speedLead;
    return Math.abs(localX) <= lateralHalf && Math.abs(localZ) <= depthHalf;
  }

  /**
   * Keep an automatic door open while an entity occupies its approach/threshold,
   * then wait a short clear period before closing. Locked scripted doors stay shut.
   */
  public updateAutomaticSensor(occupied: boolean, dt: number) {
    if (!this.automatic) return;
    if (this.automaticLocked) {
      this.automaticCloseTimer = 0;
      if (this.isOpen) this.close();
      return;
    }
    if (occupied) {
      this.automaticCloseTimer = this.automaticCloseDelay;
      this.open();
      return;
    }
    if (!this.isOpen) return;
    this.automaticCloseTimer = Math.max(0, this.automaticCloseTimer - dt);
    if (this.automaticCloseTimer <= 0) this.close();
  }

  /**
   * Exact current sliding-leaf collision. Unlike the legacy whole-doorway blocker,
   * these boxes move with the visible panels and remain solid beside an open portal.
   */
  public getSlidingPanelColliders(): WallBox[] {
    if (this.type !== 'double_slide' || !this.slideLeft || !this.slideRight) return [];
    this.group.updateWorldMatrix(true, true);
    const result: WallBox[] = [];
    for (const [suffix, panel] of [['left', this.slideLeft], ['right', this.slideRight]] as const) {
      const box = new THREE.Box3().setFromObject(panel);
      if (![box.min.x, box.max.x, box.min.z, box.max.z, box.min.y, box.max.y].every(Number.isFinite)) continue;
      result.push({
        id: `door_panel_${this.id}_${suffix}`,
        minX: box.min.x,
        maxX: box.max.x,
        minZ: box.min.z,
        maxZ: box.max.z,
        minY: box.min.y,
        maxY: box.max.y,
        collisionRole: 'door',
      });
    }
    return result;
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.targetProgress = 0;
    playSoundEffect('door', this.worldPos);
  }

  public toggle(): boolean {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
    return this.isOpen;
  }

  public update(dt: number) {
    const delta = Math.abs(this.currentProgress - this.targetProgress);
    if (delta <= 0.001) {
      // Snap to the exact resting state. This avoids tiny floating-point motion
      // causing door panels to shimmer/spasm forever when they are visually closed.
      this.currentProgress = this.targetProgress;
    } else {
      const motionSpeed = this.automatic ? this.automaticMotionSpeed : 9.5;
      this.currentProgress = THREE.MathUtils.damp(this.currentProgress, this.targetProgress, motionSpeed, dt);
      if (Math.abs(this.currentProgress - this.targetProgress) <= 0.001) {
        this.currentProgress = this.targetProgress;
      }
    }

    if (this.type === 'swing' && this.pivotLeft) {
      this.pivotLeft.rotation.y = this.currentProgress * this.swingAngle;
    } else if (this.type === 'double_slide' && this.slideLeft && this.slideRight) {
      const slideX = this.currentProgress * this.slideDistance;
      this.slideLeft.position.x = this.slideClosedLeftX - slideX;
      this.slideRight.position.x = this.slideClosedRightX + slideX;
    }
  }
}

export class CollisionSystem {
  public colliders: WallBox[] = [];
  public doors: Door[] = [];
  public walkableSurfaces: WalkableSurface[] = [];
  /** Camera-only blockers such as roofs and upper-floor slabs. */
  public cameraOccluders: WallBox[] = [];
  /** Exact terrain meshes used only by the third-person camera solver. Unlike wall AABBs,
   * these preserve steep/curved terrain shape so the camera cannot cut through cliffs. */
  private cameraTerrainMeshes: THREE.Object3D[] = [];
  /** Cached world bounds for exact camera terrain. The volcano is the only current
   * user, but without a broad phase every normal third-person camera solve anywhere
   * in the map ray-tested its triangle meshes several times per frame. */
  private cameraTerrainBounds = new Map<THREE.Object3D, THREE.Box3>();
  private cameraTerrainRaycaster = new THREE.Raycaster();

  private disabledColliderIds = new Set<string>();
  private activeColliderCache: WallBox[] | null = null;
  private activeDoorSignature = -1;
  private groundRaycaster = new THREE.Raycaster();
  private rayOrigin = new THREE.Vector3();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly up = new THREE.Vector3(0, 1, 0);

  // PERFORMANCE: world collision/floor queries used to linearly scan every
  // registered collider/surface. With NPCs, traffic and police all querying the
  // world many times per second that became one of the dominant CPU costs. Keep
  // the exact same authored shapes, but broad-phase them through a coarse X/Z grid.
  private readonly spatialCellSize = 28;
  private colliderGrid = new Map<string, WallBox[]>();
  private cameraOccluderGrid = new Map<string, WallBox[]>();
  private walkableGrid = new Map<string, WalkableSurface[]>();
  private colliderSpatialDirty = true;
  private cameraOccluderSpatialDirty = true;
  private walkableSpatialDirty = true;

  private spatialKey(ix: number, iz: number) {
    return `${ix},${iz}`;
  }

  private cellCoord(value: number) {
    return Math.floor(value / this.spatialCellSize);
  }

  private rebuildColliderGrid() {
    if (!this.colliderSpatialDirty) return;
    this.colliderGrid.clear();
    for (const collider of this.colliders) {
      const minX = this.cellCoord(collider.minX);
      const maxX = this.cellCoord(collider.maxX);
      const minZ = this.cellCoord(collider.minZ);
      const maxZ = this.cellCoord(collider.maxZ);
      for (let ix = minX; ix <= maxX; ix++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const key = this.spatialKey(ix, iz);
          const cell = this.colliderGrid.get(key);
          if (cell) cell.push(collider);
          else this.colliderGrid.set(key, [collider]);
        }
      }
    }
    this.colliderSpatialDirty = false;
  }

  /** Incrementally maintain the live collider grid for moving props. Rebuilding the
   * entire world grid every time a kicked tree/pole moved was a major frame-spike
   * source: one dynamic collider dirtied hundreds of otherwise-static colliders. */
  private removeColliderFromLiveGrid(collider: WallBox) {
    if (this.colliderSpatialDirty) return;
    const minX = this.cellCoord(collider.minX);
    const maxX = this.cellCoord(collider.maxX);
    const minZ = this.cellCoord(collider.minZ);
    const maxZ = this.cellCoord(collider.maxZ);
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const key = this.spatialKey(ix, iz);
        const cell = this.colliderGrid.get(key);
        if (!cell) continue;
        const index = cell.indexOf(collider);
        if (index >= 0) cell.splice(index, 1);
        if (cell.length === 0) this.colliderGrid.delete(key);
      }
    }
  }

  private addColliderToLiveGrid(collider: WallBox) {
    if (this.colliderSpatialDirty) return;
    const minX = this.cellCoord(collider.minX);
    const maxX = this.cellCoord(collider.maxX);
    const minZ = this.cellCoord(collider.minZ);
    const maxZ = this.cellCoord(collider.maxZ);
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const key = this.spatialKey(ix, iz);
        const cell = this.colliderGrid.get(key);
        if (cell) cell.push(collider);
        else this.colliderGrid.set(key, [collider]);
      }
    }
  }

  private rebuildCameraOccluderGrid() {
    if (!this.cameraOccluderSpatialDirty) return;
    this.cameraOccluderGrid.clear();
    for (const collider of this.cameraOccluders) {
      const minX = this.cellCoord(collider.minX);
      const maxX = this.cellCoord(collider.maxX);
      const minZ = this.cellCoord(collider.minZ);
      const maxZ = this.cellCoord(collider.maxZ);
      for (let ix = minX; ix <= maxX; ix++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const key = this.spatialKey(ix, iz);
          const cell = this.cameraOccluderGrid.get(key);
          if (cell) cell.push(collider);
          else this.cameraOccluderGrid.set(key, [collider]);
        }
      }
    }
    this.cameraOccluderSpatialDirty = false;
  }

  private rebuildWalkableGrid() {
    if (!this.walkableSpatialDirty) return;
    this.walkableGrid.clear();
    for (const surface of this.walkableSurfaces) {
      const minX = this.cellCoord(surface.minX);
      const maxX = this.cellCoord(surface.maxX);
      const minZ = this.cellCoord(surface.minZ);
      const maxZ = this.cellCoord(surface.maxZ);
      for (let ix = minX; ix <= maxX; ix++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const key = this.spatialKey(ix, iz);
          const cell = this.walkableGrid.get(key);
          if (cell) cell.push(surface);
          else this.walkableGrid.set(key, [surface]);
        }
      }
    }
    this.walkableSpatialDirty = false;
  }

  private walkablesAt(x: number, z: number): WalkableSurface[] {
    this.rebuildWalkableGrid();
    return this.walkableGrid.get(this.spatialKey(this.cellCoord(x), this.cellCoord(z))) ?? [];
  }

  private isColliderActive(collider: WallBox, treatInteractiveDoorsAsClosed = false) {
    if (this.disabledColliderIds.has(collider.id)) return false;
    if (!treatInteractiveDoorsAsClosed && collider.doorId) {
      const door = this.doors.find((entry) => entry.id === collider.doorId);
      if (door?.isOpen) return false;
    }
    return true;
  }

  private collidersInBounds(
    minWorldX: number,
    maxWorldX: number,
    minWorldZ: number,
    maxWorldZ: number,
    treatInteractiveDoorsAsClosed = false,
    ignoreCollider?: (collider: WallBox) => boolean
  ): WallBox[] {
    this.rebuildColliderGrid();
    const minX = this.cellCoord(minWorldX);
    const maxX = this.cellCoord(maxWorldX);
    const minZ = this.cellCoord(minWorldZ);
    const maxZ = this.cellCoord(maxWorldZ);
    const result: WallBox[] = [];
    const seen = new Set<WallBox>();
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const cell = this.colliderGrid.get(this.spatialKey(ix, iz));
        if (!cell) continue;
        for (const collider of cell) {
          if (seen.has(collider)) continue;
          seen.add(collider);
          if (!this.isColliderActive(collider, treatInteractiveDoorsAsClosed) || ignoreCollider?.(collider)) continue;
          if (collider.maxX < minWorldX || collider.minX > maxWorldX || collider.maxZ < minWorldZ || collider.minZ > maxWorldZ) continue;
          result.push(collider);
        }
      }
    }
    return result;
  }

  private cameraOccludersInBounds(minWorldX: number, maxWorldX: number, minWorldZ: number, maxWorldZ: number): WallBox[] {
    this.rebuildCameraOccluderGrid();
    const minX = this.cellCoord(minWorldX);
    const maxX = this.cellCoord(maxWorldX);
    const minZ = this.cellCoord(minWorldZ);
    const maxZ = this.cellCoord(maxWorldZ);
    const result: WallBox[] = [];
    const seen = new Set<WallBox>();
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const cell = this.cameraOccluderGrid.get(this.spatialKey(ix, iz));
        if (!cell) continue;
        for (const collider of cell) {
          if (seen.has(collider)) continue;
          seen.add(collider);
          if (collider.maxX < minWorldX || collider.minX > maxWorldX || collider.maxZ < minWorldZ || collider.minZ > maxWorldZ) continue;
          result.push(collider);
        }
      }
    }
    return result;
  }

  /**
   * Register a horizontal walkable mesh (roads, footpaths, floors, bridge decks).
   * We retain its world AABB for a cheap broad-phase and the mesh itself for an
   * exact downward ray test. That prevents a rotated road's AABB from becoming
   * a fake raised floor beside the visible road.
   */
  public addWalkableObject(object: THREE.Object3D, id?: string, priority = 0) {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.y)) return;
    const authoredSnap = Number(object.userData?.walkableSnapFromBelow ?? 0) || 0;
    const size = new THREE.Vector3();
    box.getSize(size);
    // Broad, thin authored floors/roads get a small automatic recovery allowance.
    // This is not an invisible floor: exact ray tests still have to hit the visible
    // mesh. It only lets a body that slipped a few centimetres below a seam snap
    // back onto that real mesh instead of continuing through the world.
    const seamRecovery = size.y <= 0.7 && size.x >= 2.5 && size.z >= 2.5 ? 0.42 : 0;
    const surface: WalkableSurface = {
      id: id ?? object.name ?? `walkable_${this.walkableSurfaces.length}`,
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
      y: box.max.y + 0.012,
      minY: box.min.y,
      maxY: box.max.y,
      priority,
      snapFromBelow: Math.max(authoredSnap, seamRecovery),
      isStair: object.userData?.stairSurface === true,
      isRoof: object.userData?.landableRoof === true,
      object,
    };
    const existing = this.walkableSurfaces.findIndex((s) => s.id === surface.id);
    if (existing >= 0) this.walkableSurfaces[existing] = surface;
    else this.walkableSurfaces.push(surface);
    this.walkableSpatialDirty = true;
  }

  /**
   * Register descendants explicitly tagged walkable. As a safety net for legacy
   * and future world authoring, clearly named stair treads are repaired here too.
   * Rails/posts are deliberately excluded so they never become accidental floors.
   */
  public addWalkableRoot(root: THREE.Object3D, prefix = 'surface') {
    root.updateWorldMatrix(true, true);
    let index = 0;
    root.traverse((obj) => {
      const lowerName = (obj.name || '').toLowerCase();
      const namedStairTread =
        obj instanceof THREE.Mesh &&
        /(stair|steps?)/.test(lowerName) &&
        !/(rail|handrail|post|sign|frame|door|wall)/.test(lowerName);

      if (namedStairTread && obj.userData?.walkable !== true) {
        markWalkableStairSurface(obj, 58, 0.82);
      } else if (namedStairTread) {
        obj.userData.stairSurface = true;
        obj.userData.walkableSnapFromBelow = Math.max(
          Number(obj.userData.walkableSnapFromBelow ?? 0) || 0,
          0.82
        );
      }

      if (obj.userData?.walkable === true) {
        this.addWalkableObject(
          obj,
          `${prefix}_${obj.name || index++}`,
          obj.userData.walkablePriority ?? 0
        );
      }
    });
  }

  /**
   * Register actual visible roof meshes as exact ray-tested landing surfaces.
   * Roofs stay OUT of the normal wall registry, so pitched/gabled roofs never turn
   * into oversized invisible AABBs around the building. The same exact mesh is
   * sampled for landing height and for flight-through-roof prevention.
   */
  public addLandableRoofsFromRoot(root: THREE.Object3D, prefix = 'roof') {
    root.updateWorldMatrix(true, true);
    let index = 0;
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      const materialRoof = materials.some((m) => m?.userData?.worldSurfaceKind === 'roof');
      if (obj.userData?.landableRoof !== true && !materialRoof) return;

      // Moving vehicle/train roofs are handled by their dynamic systems and must
      // never be frozen into the static world collision registry.
      if (obj.userData?.dynamicRoof === true) return;

      obj.userData.landableRoof = true;
      obj.userData.walkableSnapFromBelow = Math.max(
        Number(obj.userData.walkableSnapFromBelow ?? 0) || 0,
        0.22
      );
      // If the roof was already explicitly tagged walkable (for example the
      // department-store roof deck), upgrade that exact surface instead of
      // registering a duplicate under another id.
      const existing = this.walkableSurfaces.find((entry) => entry.object === obj);
      if (existing) {
        existing.isRoof = true;
        existing.priority = Math.max(existing.priority ?? 0, obj.userData.walkablePriority ?? 44);
        existing.snapFromBelow = Math.max(existing.snapFromBelow ?? 0, obj.userData.walkableSnapFromBelow ?? 0.22);
        return;
      }

      const id = `${prefix}_${obj.name || index++}`;
      this.addWalkableObject(obj, id, obj.userData.walkablePriority ?? 44);
      const surface = this.walkableSurfaces.find((entry) => entry.id === id);
      if (surface) surface.isRoof = true;
    });
  }

  public addWalkableSurface(surface: WalkableSurface) {
    const existing = this.walkableSurfaces.findIndex((s) => s.id === surface.id);
    if (existing >= 0) this.walkableSurfaces[existing] = surface;
    else this.walkableSurfaces.push(surface);
    this.walkableSpatialDirty = true;
  }

  /**
   * Build collision directly from visible authored geometry. Rotated box-like
   * meshes keep an oriented footprint instead of becoming a huge world-aligned
   * rectangle. The world AABB is still retained for cheap broad-phase queries.
   */
  public addSolidObject(
    object: THREE.Object3D,
    id?: string,
    padding = 0.02,
    collisionRole: 'fixed' | 'interactive' = 'fixed'
  ) {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.z)) return;

    const collider: WallBox = {
      id: id ?? object.name ?? `visual_solid_${this.colliders.length}`,
      minX: box.min.x - padding,
      maxX: box.max.x + padding,
      minZ: box.min.z - padding,
      maxZ: box.max.z + padding,
      minY: box.min.y - padding,
      maxY: box.max.y + padding,
      collisionRole,
      sourceObjectUuid: object.uuid,
    };

    // Most authored architecture is BoxGeometry rotated only around world Y. For
    // those meshes we can preserve the true footprint exactly enough for gameplay.
    // Sloped handrails/ramps keep the conservative AABB because their vertical
    // projection is no longer a simple rectangle.
    if (object instanceof THREE.Mesh && object.geometry) {
      object.geometry.computeBoundingBox();
      const local = object.geometry.boundingBox;
      if (local) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        object.getWorldPosition(worldPos);
        object.getWorldQuaternion(worldQuat);
        object.getWorldScale(worldScale);

        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
        if (Math.abs(up.y) > 0.985) {
          const size = new THREE.Vector3();
          local.getSize(size);
          const localCenter = new THREE.Vector3();
          local.getCenter(localCenter);
          localCenter.multiply(worldScale).applyQuaternion(worldQuat).add(worldPos);
          const euler = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
          collider.centerX = localCenter.x;
          collider.centerZ = localCenter.z;
          collider.halfX = Math.abs(size.x * worldScale.x) * 0.5 + padding;
          collider.halfZ = Math.abs(size.z * worldScale.z) * 0.5 + padding;
          collider.rotationY = euler.y;
        }
      }
    }

    this.addWall(collider);
  }

  /** Register an object-sized collider for something that is intentionally movable/kickable.
   * It participates in collision while intact, but the world-collision audit will never
   * reinterpret it as permanent architecture or remove it in favour of a nearby wall. */
  public addInteractiveObject(object: THREE.Object3D, id?: string, padding = 0.02) {
    const colliderId = id ?? object.name ?? `interactive_${this.colliders.length}`;

    // A movable hierarchy must own exactly ONE live collider. Older call paths could
    // register a geometry-derived static child collider and then add another
    // interactive collider for the root. Once the prop moved, that stale fixed copy
    // became the classic invisible wall at the spawn position. Purge only colliders
    // proven to originate from this exact object hierarchy; hand-authored building
    // walls nearby are deliberately untouched.
    const hierarchyUuids = new Set<string>();
    object.traverse((child) => hierarchyUuids.add(child.uuid));
    const before = this.colliders.length;
    this.colliders = this.colliders.filter((collider) => {
      if (collider.id === colliderId) return false;
      if (collider.collisionRole === 'interactive') return true;
      return !collider.sourceObjectUuid || !hierarchyUuids.has(collider.sourceObjectUuid);
    });
    if (this.colliders.length !== before) {
      this.colliderSpatialDirty = true;
      this.invalidateColliderCache();
    }

    // Upsert from the CURRENT visible transform instead of blindly appending.
    // syncInteractiveObject() uses replaceCollider(), whose duplicate-safe semantics
    // guarantee later re-registration can never leave a stale collider behind.
    this.syncInteractiveObject(object, colliderId, padding);
  }

  /**
   * Sync a movable object's collider from an explicit physical proxy instead of
   * its full rendered bounds. Tall foliage-heavy props (trees in particular) use
   * this so soft leaves never become a giant invisible hard box while the trunk
   * still follows the visible physics body exactly.
   */
  public syncInteractiveProxy(
    id: string,
    proxy: {
      minX: number; maxX: number; minZ: number; maxZ: number;
      minY?: number; maxY?: number;
      centerX?: number; centerZ?: number; halfX?: number; halfZ?: number; rotationY?: number;
    },
    padding = 0.02
  ) {
    if (![proxy.minX, proxy.maxX, proxy.minZ, proxy.maxZ].every((value) => Number.isFinite(value))) return;
    const safePadding = Math.max(0, padding);
    const collider: WallBox = {
      id,
      minX: proxy.minX - safePadding,
      maxX: proxy.maxX + safePadding,
      minZ: proxy.minZ - safePadding,
      maxZ: proxy.maxZ + safePadding,
      minY: proxy.minY !== undefined ? proxy.minY - safePadding : undefined,
      maxY: proxy.maxY !== undefined ? proxy.maxY + safePadding : undefined,
      collisionRole: 'interactive',
    };
    if (
      proxy.centerX !== undefined && proxy.centerZ !== undefined &&
      proxy.halfX !== undefined && proxy.halfZ !== undefined &&
      proxy.rotationY !== undefined
    ) {
      collider.centerX = proxy.centerX;
      collider.centerZ = proxy.centerZ;
      collider.halfX = Math.max(0.01, proxy.halfX + safePadding);
      collider.halfZ = Math.max(0.01, proxy.halfZ + safePadding);
      collider.rotationY = proxy.rotationY;
    }
    this.replaceCollider(collider);
    this.setColliderEnabled(id, true);
  }

  /**
   * Rebuild a movable object's interactive collider from its CURRENT visible world
   * transform. Interactive scenery keeps the same collider id while it tumbles, so
   * collision follows the prop instead of being disabled at the first impact or
   * left behind as a ghost wall at its original spawn.
   */
  public syncInteractiveObject(object: THREE.Object3D, id: string, padding = 0.02) {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.z)) return;

    const collider: WallBox = {
      id,
      minX: box.min.x - padding,
      maxX: box.max.x + padding,
      minZ: box.min.z - padding,
      maxZ: box.max.z + padding,
      minY: box.min.y - padding,
      maxY: box.max.y + padding,
      collisionRole: 'interactive',
      sourceObjectUuid: object.uuid,
    };

    // Preserve a tight oriented footprint for simple box-like movable meshes.
    // Groups and fully-tumbled props fall back to their exact current world AABB,
    // which is still vastly safer than a stale collider at the old position.
    if (object instanceof THREE.Mesh && object.geometry) {
      object.geometry.computeBoundingBox();
      const local = object.geometry.boundingBox;
      if (local) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        object.getWorldPosition(worldPos);
        object.getWorldQuaternion(worldQuat);
        object.getWorldScale(worldScale);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat);
        if (Math.abs(up.y) > 0.985) {
          const size = new THREE.Vector3();
          const localCenter = new THREE.Vector3();
          local.getSize(size);
          local.getCenter(localCenter);
          localCenter.multiply(worldScale).applyQuaternion(worldQuat).add(worldPos);
          const euler = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
          collider.centerX = localCenter.x;
          collider.centerZ = localCenter.z;
          collider.halfX = Math.abs(size.x * worldScale.x) * 0.5 + padding;
          collider.halfZ = Math.abs(size.z * worldScale.z) * 0.5 + padding;
          collider.rotationY = euler.y;
        }
      }
    }

    this.replaceCollider(collider);
    this.setColliderEnabled(id, true);
  }

  /**
   * Register broad horizontal roofs / upper-floor slabs as camera-only blockers.
   * They do not affect player movement, but stop an indoor camera from escaping
   * through a ceiling that was intentionally left non-solid for gameplay.
   */
  public addCameraCeilingsFromRoot(root: THREE.Object3D, prefix = 'camera_ceiling') {
    root.updateWorldMatrix(true, true);
    let index = 0;
    const size = new THREE.Vector3();
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const material = obj.material;
      const materials = Array.isArray(material) ? material : [material];
      if (materials.some((m) => m.transparent && m.opacity < 0.22)) return;
      const box = new THREE.Box3().setFromObject(obj);
      if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.y)) return;
      box.getSize(size);
      if (size.y > 0.9 || size.x < 2.8 || size.z < 2.8 || box.max.y < 2.2) return;
      this.cameraOccluders.push({
        id: `${prefix}_${obj.name || index++}`,
        minX: box.min.x, maxX: box.max.x,
        minY: box.min.y, maxY: box.max.y,
        minZ: box.min.z, maxZ: box.max.z,
      });
      this.cameraOccluderSpatialDirty = true;
    });
  }

  /** Register descendants explicitly tagged userData.solidCollider = true. */
  public addSolidRoot(root: THREE.Object3D, prefix = 'solid') {
    root.updateWorldMatrix(true, true);
    let index = 0;
    root.traverse((obj) => {
      // Dynamic/kickable props own their collider through the interactive physics
      // system. Never also freeze one into the static architecture registry or the
      // player will hit a ghost wall after the visible prop has been launched away.
      if (obj.userData?.interactivePhysicsObject === true) return;
      if (obj.userData?.solidCollider === true) {
        this.addSolidObject(obj, `${prefix}_${obj.name || index++}`, obj.userData.colliderPadding ?? 0.02);
      }
    });
  }

  private containsSurfaceXZ(surface: WalkableSurface, x: number, z: number) {
    return x >= surface.minX && x <= surface.maxX && z >= surface.minZ && z <= surface.maxZ;
  }

  /** Exact TOP height on a tagged authored mesh, or null if its AABB contains the point but the mesh does not. */
  private sampleSurfaceHeight(surface: WalkableSurface, x: number, z: number): number | null {
    if (!this.containsSurfaceXZ(surface, x, z)) return null;
    if (!surface.object) return surface.y;

    // Fast-path: flat horizontal floor/road/sidewalk slabs have a constant top height.
    // Avoid expensive triangle raycasts when there is no pitch/roll slope.
    if (!surface.isStair && !surface.isRoof) {
      const top = surface.maxY ?? surface.y;
      const bottom = surface.minY ?? (surface.y - 0.25);
      if (top - bottom <= 0.75) {
        const rot = surface.object.rotation;
        if (!rot || (Math.abs(rot.x) < 0.02 && Math.abs(rot.z) < 0.02)) {
          return surface.y;
        }
      }
    }

    // Walkable city geometry is static after registration, so its world matrix was
    // already updated in addWalkableObject. Avoid recursively updating it every frame.
    const top = surface.maxY ?? surface.y;
    const bottom = surface.minY ?? (surface.y - 0.25);
    this.rayOrigin.set(x, top + 1.5, z);
    this.groundRaycaster.set(this.rayOrigin, this.down);
    this.groundRaycaster.near = 0;
    this.groundRaycaster.far = Math.max(8, (top - bottom) + 4);
    const hit = this.groundRaycaster.intersectObject(surface.object, true)[0];
    return hit ? hit.point.y + 0.012 : null;
  }

  /**
   * Exact BOTTOM height of a visible roof at X/Z. This makes the whole roof volume
   * solid to flyers instead of only testing its top skin. A thick flat roof or a
   * closed cone/gable therefore blocks ascent as soon as the body reaches the real
   * underside, while landing still uses sampleSurfaceHeight() on the top face.
   */
  private sampleRoofBottomHeight(surface: WalkableSurface, x: number, z: number): number | null {
    if (!surface.isRoof || !this.containsSurfaceXZ(surface, x, z)) return null;
    if (!surface.object) return surface.minY ?? surface.y;
    const bottom = surface.minY ?? (surface.y - 0.25);
    const top = surface.maxY ?? surface.y;
    this.rayOrigin.set(x, bottom - 1.5, z);
    this.groundRaycaster.set(this.rayOrigin, this.up);
    this.groundRaycaster.near = 0;
    this.groundRaycaster.far = Math.max(8, (top - bottom) + 4);
    const hit = this.groundRaycaster.intersectObject(surface.object, true)[0];
    // If a one-sided decorative roof cannot be hit from below, fall back to the
    // exact registered lower AABB. It is still far tighter than a building-sized
    // collider and prevents flying through the visible roof thickness.
    return hit ? hit.point.y - 0.012 : bottom;
  }

  /**
   * Topmost exact authored surface. Good for spawning / fast travel where there
   * is no previous floor context.
   */
  public getGroundHeight(x: number, z: number, fallback = 0.12, includeRoofs = false): number {
    let bestY = fallback;
    let bestPriority = -Infinity;
    for (const surface of this.walkablesAt(x, z)) {
      // Spawn/teleport callers historically expect street/interior ground, not the
      // highest roof over the same X/Z. Flight uses getGroundHeightNear(), which
      // keeps roofs available when the current altitude makes them reachable.
      if (surface.isRoof && !includeRoofs) continue;
      if (!this.containsSurfaceXZ(surface, x, z)) continue;
      const sampled = this.sampleSurfaceHeight(surface, x, z);
      if (sampled === null) continue;
      const priority = surface.priority ?? 0;
      if (sampled > bestY + 0.001 || (Math.abs(sampled - bestY) < 0.001 && priority > bestPriority)) {
        bestY = sampled;
        bestPriority = priority;
      }
    }
    return bestY;
  }

  /**
   * Context-aware floor selection for moving bodies. It chooses the closest
   * reachable authored surface instead of blindly snapping to the highest one.
   * This is what prevents a road/bridge above the player from suddenly pulling
   * the player upward and removes most curb/road popping.
   */
  public getGroundHeightNear(
    x: number,
    z: number,
    currentY: number,
    fallback = 0.12,
    maxStepUp = 0.65,
    maxDrop = 3.0,
    skipSeamAssist = false
  ): number {
    let bestY: number | null = null;
    let bestScore = Infinity;
    let bestPriority = -Infinity;

    for (const surface of this.walkablesAt(x, z)) {
      if (!this.containsSurfaceXZ(surface, x, z)) continue;
      const sampled = this.sampleSurfaceHeight(surface, x, z);
      if (sampled === null) continue;
      const recoveryAllowance = Math.max(maxStepUp, surface.snapFromBelow ?? 0);
      if (sampled > currentY + recoveryAllowance + 0.03) continue;
      if (sampled < currentY - maxDrop) continue;

      const priority = surface.priority ?? 0;
      // Raised authored roads (bridge deck + approach ramps) deliberately outrank
      // any low terrain/connector surface occupying the same X/Z. Without this,
      // the "closest floor" rule can keep the player UNDER the visible bridge.
      const raisedSurfaceBias = (surface.snapFromBelow ?? 0) > 0 && !surface.isRoof ? 10 : 0;
      const score = Math.abs(sampled - currentY) - raisedSurfaceBias;
      if (score < bestScore - 0.005 || (Math.abs(score - bestScore) <= 0.005 && priority > bestPriority)) {
        bestY = sampled;
        bestScore = score;
        bestPriority = priority;
      }
    }

    if (bestY !== null) return bestY;
    // Multi-point dynamic-prop support probes already sample neighbouring footprint
    // positions themselves. They can opt out of the four extra seam rays here so a
    // single tumbling prop cannot multiply one support query into five exact raycasts.
    if (skipSeamAssist) return fallback;

    // Edge-seam assist: at road/sidewalk boundaries the exact ray can land a few
    // centimetres outside a mesh due to floating-point precision. Probe a tiny
    // cross around the point so feet/wheels glide across the seam instead of
    // dropping to terrain for one frame.
    const seamOffsets = [
      [0.16, 0],
      [-0.16, 0],
      [0, 0.16],
      [0, -0.16],
    ] as const;
    for (const [ox, oz] of seamOffsets) {
      for (const surface of this.walkablesAt(x + ox, z + oz)) {
        const sampled = this.sampleSurfaceHeight(surface, x + ox, z + oz);
        if (sampled === null) continue;
        const recoveryAllowance = Math.max(maxStepUp, surface.snapFromBelow ?? 0);
        if (sampled > currentY + recoveryAllowance + 0.03 || sampled < currentY - maxDrop) continue;
        const raisedSurfaceBias = (surface.snapFromBelow ?? 0) > 0 && !surface.isRoof ? 10 : 0;
        const score = Math.abs(sampled - currentY) - raisedSurfaceBias;
        if (score < bestScore) {
          bestY = sampled;
          bestScore = score;
        }
      }
    }

    return bestY ?? fallback;
  }

  /**
   * Find the nearest authored solid surface ABOVE the player's feet. Used by the
   * double-jump controller so low indoor ceilings/upper floors stop upward motion
   * instead of allowing the character capsule to pass through them.
   */
  public getCeilingHeightNear(x: number, z: number, feetY: number, maxRise = 6.5): number | null {
    let best = Infinity;
    const minGap = 0.32;

    // Upper walkable floors are also real ceilings for the room below. Using the
    // exact sampled mesh height keeps this aligned with rotated/stepped geometry.
    for (const surface of this.walkablesAt(x, z)) {
      if (!this.containsSurfaceXZ(surface, x, z)) continue;
      // For a roof, the room below collides with the real UNDERSIDE while a
      // character standing/flying above lands on the exact top surface.
      const sampled = surface.isRoof
        ? this.sampleRoofBottomHeight(surface, x, z)
        : this.sampleSurfaceHeight(surface, x, z);
      if (sampled === null || sampled <= feetY + minGap || sampled > feetY + maxRise) continue;
      if (sampled < best) best = sampled;
    }

    // Ceiling slabs/roof meshes may be registered only as colliders rather than
    // walkable floors. Their lower face is the meaningful clearance limit.
    for (const collider of this.collidersInBounds(x, x, z, z)) {
      if (x < collider.minX || x > collider.maxX || z < collider.minZ || z > collider.maxZ) continue;
      const underside = collider.minY;
      if (underside === undefined || underside <= feetY + minGap || underside > feetY + maxRise) continue;
      if (underside < best) best = underside;
    }

    // Authored interior ceilings are deliberately camera-only in horizontal
    // movement, but they are still real overhead geometry: jumps/flyers must not
    // pass vertically through them. Using only their underside here does not turn
    // them into ground-level invisible walls.
    for (const ceiling of this.cameraOccludersInBounds(x, x, z, z)) {
      if (x < ceiling.minX || x > ceiling.maxX || z < ceiling.minZ || z > ceiling.maxZ) continue;
      const underside = ceiling.minY;
      if (underside === undefined || underside <= feetY + minGap || underside > feetY + maxRise) continue;
      if (underside < best) best = underside;
    }

    return Number.isFinite(best) ? best : null;
  }

  /**
   * Follow a staircase continuously between two horizontal positions. A fast run
   * can cross several treads in one rendered frame; checking only the final tread
   * incorrectly turns a valid staircase into a >maxStepUp ledge. We sample the
   * authored stair path in small increments, validating each rise/drop separately.
   * Returns null when the movement segment never touches a stair surface, so normal
   * ledge behaviour remains unchanged everywhere else.
   */
  public traceWalkableStairPath(
    start: THREE.Vector3,
    end: THREE.Vector3,
    currentGround: number,
    maxStepUp = 0.62,
    maxStepDown = 0.58
  ): number | null {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const horizontalDistance = Math.hypot(dx, dz);
    if (horizontalDistance < 0.001) return null;

    // 18-24cm samples are comfortably smaller than every authored tread depth in
    // the current game, while the hard cap prevents pathological frame spikes.
    const sampleCount = THREE.MathUtils.clamp(Math.ceil(horizontalDistance / 0.20), 1, 28);
    let ground = currentGround;
    let touchedStair = false;

    for (let i = 1; i <= sampleCount; i++) {
      const t = i / sampleCount;
      const x = start.x + dx * t;
      const z = start.z + dz * t;

      // Detect exact authored stair geometry at this sample, not its broad AABB.
      for (const surface of this.walkablesAt(x, z)) {
        if (!surface.isStair || !this.containsSurfaceXZ(surface, x, z)) continue;
        const stairY = this.sampleSurfaceHeight(surface, x, z);
        if (stairY === null) continue;
        if (stairY <= ground + maxStepUp + 0.08 && stairY >= ground - maxStepDown - 0.12) {
          touchedStair = true;
          break;
        }
      }

      // Once the segment has touched stairs, continue sampling all authored floors
      // so the final tread connects cleanly onto its real landing. Passing `ground`
      // as fallback prevents unrelated terrain/default Y from stealing the stair.
      if (touchedStair) {
        const sampled = this.getGroundHeightNear(
          x, z, ground, ground, maxStepUp + 0.08, Math.max(maxStepDown + 0.15, 1.0)
        );
        const delta = sampled - ground;
        if (delta > maxStepUp + 0.12 || delta < -Math.max(maxStepDown + 0.18, 1.1)) {
          return null;
        }
        ground = sampled;
      }
    }

    return touchedStair ? ground : null;
  }

  public isOnAuthoredSurface(x: number, z: number): boolean {
    return this.walkablesAt(x, z).some((surface) => this.sampleSurfaceHeight(surface, x, z) !== null);
  }

  /**
   * Pedestrian-preferred surfaces are the authored sidewalks, footpaths, promenades
   * and public plazas. NPC navigation uses this only as a preference; parks/grass
   * remain legal, while asphalt is separately treated as restricted.
   */
  public isPedestrianSurfaceAt(x: number, z: number): boolean {
    for (const surface of this.walkablesAt(x, z)) {
      const obj = surface.object;
      if (!obj || this.sampleSurfaceHeight(surface, x, z) === null) continue;
      if (obj.userData?.sidewalkSurface === true) return true;
      if (/(sidewalk|footpath|promenade|plaza|pedestrian)/i.test(obj.name || '')) return true;
    }
    return false;
  }

  /**
   * Exact CURRENT road test used by scenery-placement audits. This deliberately
   * samples only meshes tagged mapRoadSurface by the world builders, so sidewalks,
   * lawns and plazas remain legal roadside placement. A clearance radius checks a
   * small ring too, keeping trunks/poles out of the lane edge rather than merely
   * putting their pivot one centimetre beyond the asphalt.
   */
  public isRoadSurfaceAt(x: number, z: number, clearance = 0): boolean {
    const samples: Array<[number, number]> = [[0, 0]];
    if (clearance > 0.001) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        samples.push([Math.cos(a) * clearance, Math.sin(a) * clearance]);
      }
    }
    for (const [ox, oz] of samples) {
      const sx = x + ox;
      const sz = z + oz;
      for (const surface of this.walkablesAt(sx, sz)) {
        if (surface.object?.userData?.mapRoadSurface !== true) continue;
        if (this.sampleSurfaceHeight(surface, sx, sz) !== null) return true;
      }
    }
    return false;
  }

  /**
   * Move accidental road furniture to the nearest usable verge/lawn. The first
   * pass prefers ordinary terrain (grass) so trees do not migrate onto a doorway or
   * footpath. A second pass permits non-road authored paving if no terrain solution
   * exists. Roads, intersections, access roads and bridge decks are all excluded by
   * querying the current tagged road geometry rather than an outdated coordinate list.
   */
  public findNearestRoadsidePosition(
    target: THREE.Vector3,
    radius = 0.65,
    height = 2.0,
    searchRadius = 16,
    roadClearance = 0.9
  ): THREE.Vector3 | null {
    const test = (x: number, z: number, preferTerrain: boolean) => {
      if (this.isRoadSurfaceAt(x, z, roadClearance)) return null;
      if (preferTerrain && this.isOnAuthoredSurface(x, z)) return null;
      const y = this.getGroundHeightNear(x, z, target.y, target.y, 2.5, 8.0);
      const candidate = new THREE.Vector3(x, y, z);
      return this.canOccupy(candidate, radius, height) ? candidate : null;
    };

    const step = Math.max(0.9, radius * 1.35);
    for (const preferTerrain of [true, false]) {
      for (let r = Math.max(step, roadClearance + 0.65); r <= searchRadius; r += step) {
        const samples = Math.max(16, Math.ceil((Math.PI * 2 * r) / step));
        for (let i = 0; i < samples; i++) {
          const a = (i / samples) * Math.PI * 2;
          const candidate = test(target.x + Math.cos(a) * r, target.z + Math.sin(a) * r, preferTerrain);
          if (candidate) return candidate;
        }
      }
    }
    return null;
  }

  private invalidateColliderCache() {
    this.activeColliderCache = null;
  }

  private getDoorSignature() {
    // Usually only a handful of doors exist. A tiny numeric signature is far
    // cheaper than rebuilding/filtering hundreds of wall colliders for every NPC.
    let signature = 0;
    for (let i = 0; i < this.doors.length; i++) {
      signature = ((signature * 33) ^ (this.doors[i].isOpen ? i + 1 : 0)) | 0;
    }
    return signature;
  }

  public addCollider(box: WallBox) {
    this.colliders.push({ ...box, collisionRole: box.collisionRole ?? (box.doorId ? 'door' : 'fixed') });
    this.colliderSpatialDirty = true;
    this.invalidateColliderCache();
  }

  public addWall(box: WallBox) {
    // Legacy hand-authored building walls predate vertical bounds. Leaving those
    // boxes infinite-height made an ordinary ground-floor wall able to block an
    // elevated platform/railway directly above it. Give legacy walls a sensible
    // building-height range; geometry-derived colliders keep their exact bounds.
    const normalised: WallBox = {
      ...box,
      minY: box.minY ?? -0.5,
      maxY: box.maxY ?? 10.5,
      collisionRole: box.collisionRole ?? (box.doorId ? 'door' : 'fixed'),
    };
    this.colliders.push(normalised);
    this.colliderSpatialDirty = true;
    this.invalidateColliderCache();
  }

  public addColliders(boxes: WallBox[]) {
    this.colliders.push(...boxes.map((box) => ({ ...box, collisionRole: box.collisionRole ?? (box.doorId ? 'door' : 'fixed') })));
    this.colliderSpatialDirty = true;
    this.invalidateColliderCache();
  }

  /** Enable/disable a static collider without deleting it. Used by the physical jail-cell door. */
  public setColliderEnabled(id: string, enabled: boolean) {
    // Do not invalidate the active-collider cache when the requested state is
    // already current. Moving interactive props call this after every collider sync.
    let changed = false;
    if (enabled) changed = this.disabledColliderIds.delete(id);
    else if (!this.disabledColliderIds.has(id)) {
      this.disabledColliderIds.add(id);
      changed = true;
    }
    if (changed) this.invalidateColliderCache();
  }

  public removeCollider(id: string) {
    const removed = this.colliders.filter((c) => c.id === id);
    if (removed.length === 0) return;
    if (!this.colliderSpatialDirty) removed.forEach((collider) => this.removeColliderFromLiveGrid(collider));
    this.colliders = this.colliders.filter((c) => c.id !== id);
    this.disabledColliderIds.delete(id);
    // The live grid was updated incrementally when available; if it was already
    // dirty, leave it dirty so the next query performs the normal one-time rebuild.
    this.invalidateColliderCache();
  }

  public replaceCollider(box: WallBox) {
    // Collider IDs are unique ownership keys. Moving trees/poles can update every
    // simulation tick, so replacing them must NOT dirty and rebuild the entire static
    // world spatial grid. Mutate the existing collider object in place (which also
    // keeps active-collider cache references valid) and move only that one object
    // between the affected grid cells. Historic duplicate IDs are still purged.
    const normalised: WallBox = {
      ...box,
      collisionRole: box.collisionRole ?? (box.doorId ? 'door' : 'fixed'),
    };
    let firstIndex = -1;
    const duplicateIndices: number[] = [];
    for (let i = 0; i < this.colliders.length; i++) {
      if (this.colliders[i].id !== box.id) continue;
      if (firstIndex < 0) firstIndex = i;
      else duplicateIndices.push(i);
    }

    if (firstIndex < 0) {
      this.colliders.push(normalised);
      if (this.colliderSpatialDirty) {
        // Initial world construction will rebuild once on first query.
      } else {
        this.addColliderToLiveGrid(normalised);
      }
      this.invalidateColliderCache();
      return;
    }

    const existing = this.colliders[firstIndex];
    if (!this.colliderSpatialDirty) this.removeColliderFromLiveGrid(existing);
    // Optional oriented/provenance fields must disappear when the new proxy omits
    // them; Object.assign alone would otherwise retain stale shape metadata.
    delete existing.centerX; delete existing.centerZ; delete existing.halfX; delete existing.halfZ;
    delete existing.rotationY; delete existing.sourceObjectUuid; delete existing.doorId;
    Object.assign(existing, normalised);
    if (!this.colliderSpatialDirty) this.addColliderToLiveGrid(existing);

    if (duplicateIndices.length) {
      for (let i = duplicateIndices.length - 1; i >= 0; i--) {
        const index = duplicateIndices[i];
        const duplicate = this.colliders[index];
        if (!this.colliderSpatialDirty) this.removeColliderFromLiveGrid(duplicate);
        this.colliders.splice(index, 1);
      }
      this.invalidateColliderCache();
    }
  }

  public addDoor(door: Door) {
    this.doors.push(door);
    // Global airport-style pedestrian doors use live per-panel collision. The
    // doorway itself therefore becomes physically clear as the visible leaves move,
    // with no invisible whole-door blocker left behind.
    if (door.type === 'double_slide' && door.automatic) {
      this.colliders.push(...door.getSlidingPanelColliders());
    } else {
      this.colliders.push({ ...door.collider, collisionRole: 'door' });
    }
    this.colliderSpatialDirty = true;
    this.activeDoorSignature = this.getDoorSignature();
    this.invalidateColliderCache();
  }

  /** Update only the two lightweight moving panel proxies for a sliding door. */
  public syncSlidingDoorPanels(door: Door) {
    if (door.type !== 'double_slide' || !door.automatic) return;
    for (const collider of door.getSlidingPanelColliders()) this.replaceCollider(collider);
  }

  public setDoorState(doorId: string, isOpen: boolean) {
    const door = this.doors.find((d) => d.id === doorId);
    if (door) {
      door.isOpen = isOpen;
      door.targetProgress = isOpen ? 1 : 0;
      this.invalidateColliderCache();
    }
  }

  public getActiveColliders(): WallBox[] {
    const doorSignature = this.getDoorSignature();
    if (doorSignature !== this.activeDoorSignature) {
      this.activeDoorSignature = doorSignature;
      this.invalidateColliderCache();
    }
    if (this.activeColliderCache) return this.activeColliderCache;

    const openDoors = new Set<string>();
    for (const door of this.doors) {
      if (door.isOpen) openDoors.add(door.id);
    }

    this.activeColliderCache = this.colliders.filter((c) => {
      if (this.disabledColliderIds.has(c.id)) return false;
      if (c.doorId) return !openDoors.has(c.doorId);
      return true;
    });
    return this.activeColliderCache;
  }

  private overlapsCollider(x: number, z: number, y: number, radius: number, collider: WallBox, height = 2.0) {
    if (collider.minY !== undefined && y + height < collider.minY) return false;
    if (collider.maxY !== undefined && y > collider.maxY) return false;

    if (
      collider.centerX !== undefined && collider.centerZ !== undefined &&
      collider.halfX !== undefined && collider.halfZ !== undefined &&
      collider.rotationY !== undefined
    ) {
      // Circle-vs-oriented-rectangle test. This is much tighter than the AABB of
      // a rotated railing/wall and removes the classic invisible-corner blocker.
      const dx = x - collider.centerX;
      const dz = z - collider.centerZ;
      const c = Math.cos(-collider.rotationY);
      const s = Math.sin(-collider.rotationY);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const closestX = THREE.MathUtils.clamp(lx, -collider.halfX, collider.halfX);
      const closestZ = THREE.MathUtils.clamp(lz, -collider.halfZ, collider.halfZ);
      const qx = lx - closestX;
      const qz = lz - closestZ;
      return qx * qx + qz * qz < radius * radius;
    }

    return (
      x + radius > collider.minX &&
      x - radius < collider.maxX &&
      z + radius > collider.minZ &&
      z - radius < collider.maxZ
    );
  }

  /** Return the smallest X/Z push that separates a circle from one collider. */
  private separationFromCollider(
    x: number,
    z: number,
    y: number,
    radius: number,
    height: number,
    collider: WallBox
  ): THREE.Vector2 | null {
    if (collider.minY !== undefined && y + height < collider.minY) return null;
    if (collider.maxY !== undefined && y > collider.maxY) return null;

    const centerX = collider.centerX ?? (collider.minX + collider.maxX) * 0.5;
    const centerZ = collider.centerZ ?? (collider.minZ + collider.maxZ) * 0.5;
    const halfX = collider.halfX ?? Math.max(0.001, (collider.maxX - collider.minX) * 0.5);
    const halfZ = collider.halfZ ?? Math.max(0.001, (collider.maxZ - collider.minZ) * 0.5);
    const yaw = collider.rotationY ?? 0;
    const c = Math.cos(-yaw);
    const s = Math.sin(-yaw);
    const dx = x - centerX;
    const dz = z - centerZ;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const closestX = THREE.MathUtils.clamp(lx, -halfX, halfX);
    const closestZ = THREE.MathUtils.clamp(lz, -halfZ, halfZ);
    const qx = lx - closestX;
    const qz = lz - closestZ;
    const distSq = qx * qx + qz * qz;
    if (distSq >= radius * radius) return null;

    let pushLX = 0;
    let pushLZ = 0;
    if (distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist + 0.012;
      pushLX = (qx / dist) * push;
      pushLZ = (qz / dist) * push;
    } else {
      // Centre is inside the rectangle. Push through the nearest face rather than
      // leaving a saved/spawned body permanently trapped in solid geometry.
      const toEdgeX = halfX - Math.abs(lx);
      const toEdgeZ = halfZ - Math.abs(lz);
      if (toEdgeX <= toEdgeZ) {
        pushLX = (lx < 0 ? -1 : 1) * (toEdgeX + radius + 0.012);
      } else {
        pushLZ = (lz < 0 ? -1 : 1) * (toEdgeZ + radius + 0.012);
      }
    }

    const wc = Math.cos(yaw);
    const ws = Math.sin(yaw);
    return new THREE.Vector2(pushLX * wc - pushLZ * ws, pushLX * ws + pushLZ * wc);
  }

  /**
   * Recover a body that somehow begins inside collision (bad legacy save, moving
   * prop, old spawn coordinate, etc.). A handful of tiny minimum-translation passes
   * are safer and more predictable than teleporting to an unrelated fallback point.
   */
  public recoverPenetration(
    position: THREE.Vector3,
    radius = 0.6,
    height = 2.0,
    treatInteractiveDoorsAsClosed = false,
    ignoreCollider?: (collider: WallBox) => boolean
  ): THREE.Vector3 {
    const result = position.clone();

    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      const source = this.collidersInBounds(
        result.x - radius - 1.0, result.x + radius + 1.0,
        result.z - radius - 1.0, result.z + radius + 1.0,
        treatInteractiveDoorsAsClosed, ignoreCollider
      );
      for (const collider of source) {
        const push = this.separationFromCollider(result.x, result.z, result.y, radius, height, collider);
        if (!push) continue;
        result.x += push.x;
        result.z += push.y;
        moved = true;
      }
      if (!moved) break;
    }
    return result;
  }

  public canOccupy(
    position: THREE.Vector3,
    radius = 0.6,
    height = 2.0,
    ignoreCollider?: (collider: WallBox) => boolean,
  ): boolean {
    const nearby = this.collidersInBounds(
      position.x - radius, position.x + radius,
      position.z - radius, position.z + radius
    );
    return !nearby.some((c) => !ignoreCollider?.(c) && this.overlapsCollider(position.x, position.z, position.y, radius, c, height));
  }

  /**
   * 3D clearance used by flying characters. Ground characters intentionally ignore
   * camera-only roof/ceiling slabs, but a flyer must not pass through those same
   * visible structures. This keeps the normal player collision rules unchanged
   * while giving Charizard/Iron Man/future flyers a proper solid-world volume.
   */
  public canFlyOccupy(
    position: THREE.Vector3,
    radius = 0.6,
    height = 2.0,
    ignoreCollider?: (collider: WallBox) => boolean,
  ): boolean {
    if (!this.canOccupy(position, radius, height, ignoreCollider)) return false;
    const overhead = this.cameraOccludersInBounds(
      position.x - radius, position.x + radius,
      position.z - radius, position.z + radius
    );
    if (overhead.some((c) => this.overlapsCollider(position.x, position.z, position.y, radius, c, height))) return false;

    // Pitched roofs cannot be represented accurately by a world-aligned box. Probe
    // the exact visible roof mesh at the body centre + footprint edges instead. A
    // flyer may stand with its feet ON the roof, but cannot cross the roof plane
    // from above or below. This is the same surface later used as landing ground.
    const roofProbes = [
      [0, 0],
      [radius * 0.72, 0], [-radius * 0.72, 0],
      [0, radius * 0.72], [0, -radius * 0.72],
    ] as const;
    const feetY = position.y;
    const headY = position.y + height;
    for (const [ox, oz] of roofProbes) {
      const x = position.x + ox;
      const z = position.z + oz;
      for (const surface of this.walkablesAt(x, z)) {
        if (!surface.isRoof || !this.containsSurfaceXZ(surface, x, z)) continue;
        const roofTop = this.sampleSurfaceHeight(surface, x, z);
        if (roofTop === null) continue;
        const roofBottom = this.sampleRoofBottomHeight(surface, x, z) ?? roofTop;
        // The whole visible roof volume is solid. A small top tolerance allows a
        // landed Charizard's feet to rest on the sampled top without being treated
        // as embedded, but ascending from below is stopped at the true underside.
        const bodyBottom = feetY + 0.055;
        const bodyTop = headY - 0.035;
        const solidBottom = Math.min(roofBottom, roofTop);
        const solidTop = Math.max(roofBottom, roofTop);
        if (bodyTop > solidBottom && bodyBottom < solidTop - 0.02) return false;
      }
    }
    return true;
  }

  /**
   * Swept collision for road vehicles using a row of small circles across the
   * actual oriented chassis footprint. The old single large circle had to cover
   * both the width and length of a car, so its corners extended well beyond the
   * visible body and created "invisible wall" contact on narrow roads/buildings.
   *
   * The multi-probe footprint stays close to the rendered sides while retaining
   * the same robust swept/sub-stepped collision and wall sliding used elsewhere.
   */
  public resolveOrientedVehicleCollision(
    currentPos: THREE.Vector3,
    nextPos: THREE.Vector3,
    yaw: number,
    halfWidth: number,
    halfLength: number,
    height = 2.2,
    ignoreCollider?: (collider: WallBox) => boolean,
    treatInteractiveDoorsAsClosed = false
  ): { position: THREE.Vector3; collided: boolean; travelRatio: number } {
    const result = currentPos.clone();
    const probeRadius = Math.max(0.46, halfWidth * 0.93);
    // Keep the end probes almost exactly inside the visible chassis length. The old
    // capsule extension was deliberately generous, but that made long cars touch
    // walls before their bumpers visually arrived. A tiny overlap between probes is
    // enough for robust sweeping without recreating an invisible bumper.
    const usableHalfLength = Math.max(0, halfLength - probeRadius * 0.96);
    const probeCount = Math.max(3, Math.min(7, Math.ceil((halfLength * 2) / Math.max(0.8, probeRadius * 1.55))));
    const offsets: number[] = [];
    for (let i = 0; i < probeCount; i++) {
      const t = probeCount === 1 ? 0.5 : i / (probeCount - 1);
      offsets.push(THREE.MathUtils.lerp(-usableHalfLength, usableHalfLength, t));
    }

    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const dx = nextPos.x - currentPos.x;
    const dy = nextPos.y - currentPos.y;
    const dz = nextPos.z - currentPos.z;
    const planarDistance = Math.hypot(dx, dz);
    const broadRadius = halfLength + probeRadius + 0.2;
    const sweepMinX = Math.min(currentPos.x, nextPos.x) - broadRadius;
    const sweepMaxX = Math.max(currentPos.x, nextPos.x) + broadRadius;
    const sweepMinZ = Math.min(currentPos.z, nextPos.z) - broadRadius;
    const sweepMaxZ = Math.max(currentPos.z, nextPos.z) + broadRadius;
    const active = this.collidersInBounds(
      sweepMinX, sweepMaxX, sweepMinZ, sweepMaxZ,
      treatInteractiveDoorsAsClosed, ignoreCollider
    );

    const overlapsAt = (cx: number, cz: number, y: number) => {
      for (const offset of offsets) {
        const px = cx + fwdX * offset;
        const pz = cz + fwdZ * offset;
        if (active.some((c) => this.overlapsCollider(px, pz, y, probeRadius, c, height))) return true;
      }
      return false;
    };

    // Recover a bad save/spawn locally using the same oriented probes instead of
    // expanding a huge centre circle and making the recovery itself over-correct.
    for (let pass = 0; pass < 5; pass++) {
      let moved = false;
      for (const offset of offsets) {
        const px = result.x + fwdX * offset;
        const pz = result.z + fwdZ * offset;
        for (const collider of active) {
          const push = this.separationFromCollider(px, pz, result.y, probeRadius, height, collider);
          if (!push) continue;
          result.x += push.x;
          result.z += push.y;
          moved = true;
        }
      }
      if (!moved) break;
    }

    const maxStepDistance = Math.max(0.18, probeRadius * 0.48);
    const steps = Math.max(1, Math.min(42, Math.ceil(planarDistance / maxStepDistance)));
    const stepX = dx / steps;
    const stepY = dy / steps;
    const stepZ = dz / steps;
    let collided = false;

    for (let i = 0; i < steps; i++) {
      const y = result.y + stepY;
      const candidateX = result.x + stepX;
      if (!overlapsAt(candidateX, result.z, y)) result.x = candidateX;
      else collided = true;

      const candidateZ = result.z + stepZ;
      if (!overlapsAt(result.x, candidateZ, y)) result.z = candidateZ;
      else collided = true;
      result.y = y;
    }

    let travelRatio = 1;
    if (planarDistance > 1e-5) {
      const movedX = result.x - currentPos.x;
      const movedZ = result.z - currentPos.z;
      const forwardProgress = (movedX * dx + movedZ * dz) / planarDistance;
      travelRatio = THREE.MathUtils.clamp(forwardProgress / planarDistance, 0, 1);
    }
    return { position: result, collided, travelRatio };
  }

  /**
   * Normalise and de-duplicate the static collision registry after all districts
   * are loaded. This catches stale/invalid authoring data before gameplay rather
   * than letting a NaN or reversed box become an invisible map-wide blocker.
   */
  public auditAndRepair(): { colliders: number; walkableSurfaces: number; repaired: number; removed: number } {
    let repaired = 0;
    let removed = 0;
    const seen = new Set<string>();
    const clean: WallBox[] = [];

    for (const original of this.colliders) {
      const c = { ...original };
      const values = [c.minX, c.maxX, c.minZ, c.maxZ, c.minY ?? 0, c.maxY ?? 0];
      if (!values.every(Number.isFinite)) { removed++; continue; }
      if (c.minX > c.maxX) { [c.minX, c.maxX] = [c.maxX, c.minX]; repaired++; }
      if (c.minZ > c.maxZ) { [c.minZ, c.maxZ] = [c.maxZ, c.minZ]; repaired++; }
      if (c.minY !== undefined && c.maxY !== undefined && c.minY > c.maxY) { [c.minY, c.maxY] = [c.maxY, c.minY]; repaired++; }
      const key = [c.id, c.minX.toFixed(4), c.maxX.toFixed(4), c.minZ.toFixed(4), c.maxZ.toFixed(4), c.minY?.toFixed(4), c.maxY?.toFixed(4)].join('|');
      if (seen.has(key)) { removed++; continue; }
      seen.add(key);
      clean.push(c);
    }
    // Remove stale FIXED-WORLD colliders that physically cover the centre of a real
    // interactive doorway. Dynamic/kickable props are explicitly excluded: a pole,
    // tree, bin or sign near a door remains its own physical object and is never
    // converted into (or deleted as though it were) permanent architecture.
    const doorwayClean = clean.filter((c) => {
      if (c.collisionRole === 'interactive') return true;
      if (c.doorId || c.collisionRole === 'door' || c.id.startsWith('door_col_')) return true;

      for (const door of this.doors) {
        const dc = door.collider;
        const yaw = dc.rotationY ?? 0;
        const cos = Math.cos(-yaw);
        const sin = Math.sin(-yaw);
        const corners = [
          [c.minX, c.minZ], [c.minX, c.maxZ],
          [c.maxX, c.minZ], [c.maxX, c.maxZ],
        ] as const;
        let minLX = Infinity, maxLX = -Infinity, minLZ = Infinity, maxLZ = -Infinity;
        for (const [wx, wz] of corners) {
          const dx = wx - door.position.x;
          const dz = wz - door.position.z;
          const lx = dx * cos - dz * sin;
          const lz = dx * sin + dz * cos;
          minLX = Math.min(minLX, lx); maxLX = Math.max(maxLX, lx);
          minLZ = Math.min(minLZ, lz); maxLZ = Math.max(maxLZ, lz);
        }

        const doorHalfWidth = Math.max(0.8, dc.halfX ?? 1.2);
        const doorMinY = dc.minY ?? door.position.y;
        const doorMaxY = dc.maxY ?? doorMinY + 3.2;
        const verticalOverlap = (c.maxY ?? 10.5) > doorMinY + 0.25 &&
          (c.minY ?? -0.5) < doorMaxY - 0.35;
        const nearDoorPlane = maxLZ >= -0.60 && minLZ <= 0.60 && (maxLZ - minLZ) <= 1.05;
        const spansDoorCentre = minLX < -Math.min(0.55, doorHalfWidth * 0.35) &&
          maxLX > Math.min(0.55, doorHalfWidth * 0.35);
        const overlapsUsefulOpening = maxLX > -doorHalfWidth * 0.72 && minLX < doorHalfWidth * 0.72;

        if (verticalOverlap && nearDoorPlane && spansDoorCentre && overlapsUsefulOpening) {
          removed++;
          return false;
        }
      }
      return true;
    });
    // Many older buildings still register both a hand-written broad wall box AND
    // a collider generated directly from the visible wall mesh. Keeping both means
    // the older padded box wins first and recreates an invisible strip outside the
    // rendered wall. When a thin legacy wall is clearly represented by a tighter
    // visible-geometry collider on the same plane, keep the visible collider only.
    const visibleDerived = doorwayClean.filter((c) =>
      c.id.startsWith('goldenrod_visible_wall_') ||
      c.id.startsWith('springfield_visible_wall_') ||
      c.id.startsWith('highway_visible_wall_') ||
      c.id.startsWith('magnet_train_route_wall_')
    );
    const overlapsSpan = (a0: number, a1: number, b0: number, b1: number) =>
      Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const collisionClean = doorwayClean.filter((c) => {
      if (visibleDerived.includes(c)) return true;
      // The visible-wall de-duplication pass is FIXED WORLD GEOMETRY ONLY.
      // Interactive objects retain their own collider until their gameplay system
      // moves/destroys them, at which point that exact collider is disabled.
      if (c.collisionRole === 'interactive') return true;
      if (c.doorId || c.collisionRole === 'door' || c.id.startsWith('door_col_') || c.id.startsWith('prop_') || c.id.includes('lift_') || c.id.startsWith('ps_jail_')) return true;
      // Truly rotated manual/special colliders are deliberate and should not be
      // guessed away. Geometry-derived walls at 0/90 degrees are still safe to
      // compare using their exact world AABB.
      if (c.rotationY !== undefined && Math.abs(Math.sin(c.rotationY * 2)) > 0.08) return true;

      const width = c.maxX - c.minX;
      const depth = c.maxZ - c.minZ;
      const thinX = width <= depth;
      const thickness = Math.min(width, depth);
      const length = Math.max(width, depth);
      if (thickness > 1.15 || length < 1.5) return true;

      const centreX = (c.minX + c.maxX) * 0.5;
      const centreZ = (c.minZ + c.maxZ) * 0.5;
      for (const v of visibleDerived) {
        if (v.rotationY !== undefined && Math.abs(Math.sin(v.rotationY * 2)) > 0.08) continue;
        const vw = v.maxX - v.minX;
        const vd = v.maxZ - v.minZ;
        const vThinX = vw <= vd;
        if (vThinX !== thinX) continue;
        const vThickness = Math.min(vw, vd);
        const vLength = Math.max(vw, vd);
        if (vThickness > 1.15 || vLength < 1.2) continue;

        const vCentreX = (v.minX + v.maxX) * 0.5;
        const vCentreZ = (v.minZ + v.maxZ) * 0.5;
        const normalDelta = thinX ? Math.abs(centreX - vCentreX) : Math.abs(centreZ - vCentreZ);
        if (normalDelta > 0.62) continue;
        const overlap = thinX
          ? overlapsSpan(c.minZ, c.maxZ, v.minZ, v.maxZ)
          : overlapsSpan(c.minX, c.maxX, v.minX, v.maxX);
        const coverage = overlap / Math.max(0.001, length);
        const verticalOverlap = (c.maxY ?? 10.5) >= (v.minY ?? -0.5) && (v.maxY ?? 10.5) >= (c.minY ?? -0.5);
        // The visible wall should be at least as precise as the broad legacy one.
        if (coverage >= 0.78 && verticalOverlap && vThickness <= thickness + 0.16) {
          removed++;
          return false;
        }
      }
      return true;
    });
    this.colliders = collisionClean;

    const seenWalkableObjects = new Set<THREE.Object3D>();
    const seenWalkableGeometry = new Set<string>();
    this.walkableSurfaces = this.walkableSurfaces.filter((surface) => {
      const valid = [surface.minX, surface.maxX, surface.minZ, surface.maxZ, surface.y].every(Number.isFinite) &&
        surface.minX <= surface.maxX && surface.minZ <= surface.maxZ;
      if (!valid) { removed++; return false; }
      if (surface.object) {
        if (seenWalkableObjects.has(surface.object)) { removed++; return false; }
        seenWalkableObjects.add(surface.object);
      } else {
        const key = [surface.minX, surface.maxX, surface.minZ, surface.maxZ, surface.y]
          .map((v) => Number(v).toFixed(4)).join('|');
        if (seenWalkableGeometry.has(key)) { removed++; return false; }
        seenWalkableGeometry.add(key);
      }
      return true;
    });

    // Camera/flight roof blockers are generated from visible meshes. Keep only exact
    // unique slabs so old duplicate registrations cannot create stacked invisible
    // barriers or waste collision work. This does not affect dynamic props.
    const seenCamera = new Set<string>();
    this.cameraOccluders = this.cameraOccluders.filter((c) => {
      const key = [c.minX, c.maxX, c.minY ?? -999, c.maxY ?? 999, c.minZ, c.maxZ]
        .map((v) => Number(v).toFixed(4)).join('|');
      if (seenCamera.has(key)) { removed++; return false; }
      seenCamera.add(key);
      return true;
    });

    this.invalidateColliderCache();
    this.colliderSpatialDirty = true;
    this.cameraOccluderSpatialDirty = true;
    this.walkableSpatialDirty = true;
    return { colliders: this.colliders.length, walkableSurfaces: this.walkableSurfaces.length, repaired, removed };
  }


  /**
   * Register authored terrain that should physically occlude the third-person camera.
   * This is intentionally opt-in rather than applied to every walkable mesh: roads,
   * interiors, vehicles and aircraft keep their established camera behaviour, while
   * steep natural terrain can use exact triangle collision instead of a huge AABB.
   */
  public addCameraTerrainFromRoot(root: THREE.Object3D) {
    root.updateWorldMatrix(true, true);
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData?.cameraTerrainSolid !== true) return;
      if (this.cameraTerrainMeshes.includes(obj)) return;
      this.cameraTerrainMeshes.push(obj);
      // Camera terrain is authored static world geometry. Cache its world AABB once
      // so distant city cameras can reject it before invoking THREE.Raycaster.
      this.cameraTerrainBounds.set(obj, new THREE.Box3().setFromObject(obj));
    });
  }

  /**
   * Pull a third-person camera forward when solid world geometry sits between the
   * player and the requested camera position. This uses the same authored wall
   * boxes as gameplay collision, so indoor camera behaviour stays in sync with
   * the actual building layout instead of relying on a separate visual guess.
   */
  public resolveCameraPosition(
    focus: THREE.Vector3,
    desired: THREE.Vector3,
    radius = 0.24,
    surfacePadding = 0.16
  ): THREE.Vector3 {
    const delta = desired.clone().sub(focus);
    const distance = delta.length();
    if (distance < 0.001) return desired.clone();

    let bestT = 1;
    const epsilon = 1e-7;
    const segMinX = Math.min(focus.x, desired.x) - radius;
    const segMaxX = Math.max(focus.x, desired.x) + radius;
    const segMinY = Math.min(focus.y, desired.y) - radius;
    const segMaxY = Math.max(focus.y, desired.y) + radius;
    const segMinZ = Math.min(focus.z, desired.z) - radius;
    const segMaxZ = Math.max(focus.z, desired.z) + radius;

    const testCollider = (c: WallBox) => {
      const rawMinY = c.minY ?? -1000;
      const rawMaxY = c.maxY ?? 1000;
      if (c.maxX < segMinX || c.minX > segMaxX || rawMaxY < segMinY || rawMinY > segMaxY || c.maxZ < segMinZ || c.minZ > segMaxZ) return;

      let startX = focus.x;
      let startZ = focus.z;
      let deltaX = delta.x;
      let deltaZ = delta.z;
      let minX = c.minX - radius;
      let maxX = c.maxX + radius;
      let minZ = c.minZ - radius;
      let maxZ = c.maxZ + radius;
      const minY = rawMinY - radius;
      const maxY = rawMaxY + radius;

      if (
        c.centerX !== undefined && c.centerZ !== undefined &&
        c.halfX !== undefined && c.halfZ !== undefined && c.rotationY !== undefined
      ) {
        const cs = Math.cos(-c.rotationY);
        const sn = Math.sin(-c.rotationY);
        const dx0 = focus.x - c.centerX;
        const dz0 = focus.z - c.centerZ;
        startX = dx0 * cs - dz0 * sn;
        startZ = dx0 * sn + dz0 * cs;
        deltaX = delta.x * cs - delta.z * sn;
        deltaZ = delta.x * sn + delta.z * cs;
        minX = -c.halfX - radius; maxX = c.halfX + radius;
        minZ = -c.halfZ - radius; maxZ = c.halfZ + radius;
      }

      // A camera ray is allowed to START inside the object currently containing
      // the player/focus (for example a solid chair cushion or bench seat). Treating
      // that collider as an immediate obstruction collapses the camera to t≈0 and
      // puts the view inside the character. We still test every OTHER collider along
      // the ray, so walls/ceilings behind the seat continue to block the camera.
      const focusStartsInside =
        startX >= minX && startX <= maxX &&
        focus.y >= minY && focus.y <= maxY &&
        startZ >= minZ && startZ <= maxZ;
      if (focusStartsInside) return;

      let tEnter = 0;
      let tExit = bestT;
      let intersects = true;

      const testAxis = (start: number, d: number, min: number, max: number) => {
        if (Math.abs(d) < epsilon) {
          if (start < min || start > max) intersects = false;
          return;
        }
        let t1 = (min - start) / d;
        let t2 = (max - start) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tEnter = Math.max(tEnter, t1);
        tExit = Math.min(tExit, t2);
        if (tEnter > tExit) intersects = false;
      };

      testAxis(startX, deltaX, minX, maxX);
      if (!intersects) return;
      testAxis(focus.y, delta.y, minY, maxY);
      if (!intersects) return;
      testAxis(startZ, deltaZ, minZ, maxZ);
      if (!intersects || tExit < 0 || tEnter > 1) return;

      const padT = surfacePadding / distance;
      bestT = Math.min(bestT, THREE.MathUtils.clamp(tEnter - padT, 0.04, 1));
    };

    for (const c of this.collidersInBounds(segMinX, segMaxX, segMinZ, segMaxZ)) testCollider(c);
    for (const c of this.cameraOccludersInBounds(segMinX, segMaxX, segMinZ, segMaxZ)) testCollider(c);

    // Curved/steep terrain cannot be represented safely by a single wall box.
    // Sweep a small camera-radius bundle against the exact opted-in terrain rather
    // than testing only the centre ray. The old centre-only ray could miss a steep
    // volcano face while the camera sphere itself crossed the surface, leaving the
    // view behind the mountain shell and exposing its dark backside.
    if (this.cameraTerrainMeshes.length > 0) {
      // Broad-phase exact terrain before doing any triangle raycasts. Previously the
      // volcano's mountain/crater meshes were intersected by a five-ray camera bundle
      // on every camera solve in Goldenrod/Springfield/airport too. Normal on-foot
      // camera code can solve 2-3 times per frame, so those completely irrelevant
      // distant raycasts could dominate idle frame CPU time.
      const terrainPadding = Math.max(radius, 0.35);
      const terrainCandidates = this.cameraTerrainMeshes.filter((obj) => {
        const bounds = this.cameraTerrainBounds.get(obj);
        if (!bounds) return true;
        return !(
          bounds.max.x < segMinX - terrainPadding ||
          bounds.min.x > segMaxX + terrainPadding ||
          bounds.max.y < segMinY - terrainPadding ||
          bounds.min.y > segMaxY + terrainPadding ||
          bounds.max.z < segMinZ - terrainPadding ||
          bounds.min.z > segMaxZ + terrainPadding
        );
      });

      if (terrainCandidates.length > 0) {
        const viewDirection = delta.clone().normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(viewDirection, worldUp);
        if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
        else side.normalize();
        const cameraUp = new THREE.Vector3().crossVectors(side, viewDirection).normalize();
        const sweepRadius = Math.max(0.08, radius * 0.92);
        const targets = [
          desired,
          desired.clone().addScaledVector(side, sweepRadius),
          desired.clone().addScaledVector(side, -sweepRadius),
          desired.clone().addScaledVector(cameraUp, sweepRadius),
          desired.clone().addScaledVector(cameraUp, -sweepRadius),
        ];

        for (let i = 0; i < targets.length; i++) {
          const rayDelta = targets[i].clone().sub(focus);
          const rayDistance = rayDelta.length();
          if (rayDistance < 0.001) continue;
          this.cameraTerrainRaycaster.set(focus, rayDelta.normalize());
          this.cameraTerrainRaycaster.near = 0.08;
          this.cameraTerrainRaycaster.far = rayDistance * bestT;
          const terrainHits = this.cameraTerrainRaycaster.intersectObjects(terrainCandidates, false);
          if (terrainHits.length === 0) continue;

          const hit = terrainHits[0];
          // The four offset rays already represent the camera radius. The centre ray
          // keeps the additional radius margin so frontal terrain approaches remain
          // conservative as well.
          const clearance = surfacePadding + (i === 0 ? radius : 0.04);
          const safeDistance = Math.max(0.18, hit.distance - clearance);
          const hitT = THREE.MathUtils.clamp(safeDistance / rayDistance, 0.04, 1);
          bestT = Math.min(bestT, hitT);
        }
      }
    }

    return focus.clone().addScaledVector(delta, bestT);
  }

  /**
   * Find a nearby legal landing point for fast travel / scripted teleports.
   * Map landmarks often sit on top of furniture, counters or walls. Teleporting to
   * the raw marker can therefore trap the player. This searches an outward spiral,
   * snaps every candidate to its authored floor, and returns the first position with
   * enough clearance for the requested body radius.
   */
  /**
   * Strict safe-position search that never changes floors unexpectedly.
   * Returns null when no clear point exists on the requested vertical level.
   *
   * This is intentionally used by vehicle exits and other systems where silently
   * resolving to an elevated bridge/rail deck would be worse than refusing the move.
   */
  public findSafePositionOnLevel(
    target: THREE.Vector3,
    radius = 0.65,
    height = 2.0,
    searchRadius = 10,
    maxVerticalDelta = 1.75,
    requireAuthoredSurface = true
  ): THREE.Vector3 | null {
    const test = (x: number, z: number) => {
      const y = this.getGroundHeightNear(
        x,
        z,
        target.y,
        target.y,
        maxVerticalDelta,
        maxVerticalDelta
      );
      if (Math.abs(y - target.y) > maxVerticalDelta) return null;
      // Scripted teleports normally require a tagged authored floor. Vehicle exits
      // are different: cars can legitimately stop on ordinary terrain/road surfaces
      // that are resolved by the contextual ground solver but are not individually
      // tagged as authored meshes. Allow callers to opt into that same-level terrain.
      if (requireAuthoredSurface && !this.isOnAuthoredSurface(x, z)) return null;
      const candidate = new THREE.Vector3(x, y, z);
      return this.canOccupy(candidate, radius, height) ? candidate : null;
    };

    const direct = test(target.x, target.z);
    if (direct) return direct;

    const ringStep = Math.max(0.8, radius * 1.35);
    for (let r = ringStep; r <= searchRadius; r += ringStep) {
      const samples = Math.max(12, Math.ceil((Math.PI * 2 * r) / ringStep));
      for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const candidate = test(target.x + Math.cos(angle) * r, target.z + Math.sin(angle) * r);
        if (candidate) return candidate;
      }
    }

    return null;
  }

  public findSafePosition(target: THREE.Vector3, radius = 0.65, height = 2.0, searchRadius = 10): THREE.Vector3 {
    const sameLevel = this.findSafePositionOnLevel(target, radius, height, searchRadius, 4.0);
    if (sameLevel) return sameLevel;

    // Open lawns/terrain are valid gameplay space even when they are not a tagged
    // authored floor mesh. Search them on the SAME vertical context before giving
    // up. This prevents a bad landmark/door marker from spawning inside furniture
    // while still refusing to jump onto an overhead bridge or Magnet Train deck.
    const testContextual = (x: number, z: number) => {
      const y = this.getGroundHeightNear(x, z, target.y, target.y, 1.6, 4.0);
      const candidate = new THREE.Vector3(x, y, z);
      return this.canOccupy(candidate, radius, height) ? candidate : null;
    };

    const direct = testContextual(target.x, target.z);
    if (direct) return direct;

    const ringStep = Math.max(0.9, radius * 1.4);
    const maxRadius = Math.max(searchRadius, 12);
    for (let r = ringStep; r <= maxRadius; r += ringStep) {
      const samples = Math.max(14, Math.ceil((Math.PI * 2 * r) / ringStep));
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        const candidate = testContextual(target.x + Math.cos(a) * r, target.z + Math.sin(a) * r);
        if (candidate) return candidate;
      }
    }

    // Catastrophic authoring fallback: keep the requested floor context and return
    // a finite position. Callers also retain their rolling last-safe checkpoint, so
    // this can never become a hardcoded train-track/Oak-Lab global spawn.
    const contextualY = this.getGroundHeightNear(target.x, target.z, target.y, target.y, 1.6, 4.0);
    return new THREE.Vector3(target.x, contextualY, target.z);
  }

  /**
   * Swept 2D circle-vs-wall collision. The old single end-point test could tunnel
   * straight through thin walls at high speed. Sub-stepping also gives clean wall
   * sliding instead of randomly popping the player to the other side.
   */
  public resolveCollision(
    currentPos: THREE.Vector3,
    nextPos: THREE.Vector3,
    radius = 0.6,
    height = 2.0,
    ignoreCollider?: (collider: WallBox) => boolean,
    treatInteractiveDoorsAsClosed = false,
    skipInitialRecovery = false
  ): { position: THREE.Vector3; collided: boolean } {
    // First recover legacy/spawn penetrations locally. High-frequency physics
    // substeps that are already sweeping from the previous VALID position can opt
    // out of this expensive recovery scan; doing six recovery passes for every
    // tiny tree/pole probe was a major intermittent world-interaction stall.
    const result = skipInitialRecovery
      ? currentPos.clone()
      : this.recoverPenetration(
          currentPos, radius, height, treatInteractiveDoorsAsClosed, ignoreCollider
        );
    const dx = nextPos.x - currentPos.x;
    const dy = nextPos.y - currentPos.y;
    const dz = nextPos.z - currentPos.z;
    const planarDistance = Math.hypot(dx, dz);

    // Broad-phase: only test walls that overlap the swept movement box. This keeps
    // swept collision cheap even when the city contains hundreds of colliders.
    const sweepMinX = Math.min(result.x, nextPos.x) - radius;
    const sweepMaxX = Math.max(result.x, nextPos.x) + radius;
    const sweepMinZ = Math.min(result.z, nextPos.z) - radius;
    const sweepMaxZ = Math.max(result.z, nextPos.z) + radius;
    // Normal player movement respects opened interactive doors. Autonomous road
    // traffic can opt into treating those same doorway colliders as closed so AI
    // vehicles never follow a route or collision slide into an enterable interior.
    const active = this.collidersInBounds(
      sweepMinX, sweepMaxX, sweepMinZ, sweepMaxZ,
      treatInteractiveDoorsAsClosed, ignoreCollider
    );
    const maxStepDistance = Math.max(0.22, radius * 0.55);
    const steps = Math.max(1, Math.min(36, Math.ceil(planarDistance / maxStepDistance)));
    const stepX = dx / steps;
    const stepY = dy / steps;
    const stepZ = dz / steps;
    let collided = false;

    for (let i = 0; i < steps; i++) {
      const y = result.y + stepY;
      const candidateX = result.x + stepX;
      const blockedX = active.some((c) => this.overlapsCollider(candidateX, result.z, y, radius, c, height));
      if (!blockedX) result.x = candidateX;
      else collided = true;

      const candidateZ = result.z + stepZ;
      const blockedZ = active.some((c) => this.overlapsCollider(result.x, candidateZ, y, radius, c, height));
      if (!blockedZ) result.z = candidateZ;
      else collided = true;

      result.y = y;
    }

    return { position: result, collided };
  }

  /**
   * Autonomous road traffic must never use an open shop/house door as a shortcut.
   * This uses the exact same swept collision as every other vehicle but keeps
   * interactive doorway colliders active even while a pedestrian has opened them.
   */
  public resolveTrafficCollision(
    currentPos: THREE.Vector3,
    nextPos: THREE.Vector3,
    radius = 1.45,
    height = 2.2
  ): { position: THREE.Vector3; collided: boolean } {
    return this.resolveCollision(currentPos, nextPos, radius, height, undefined, true);
  }

  public resolvePlayerCollision(
    playerPos: THREE.Vector3,
    arg2: number | THREE.Vector3 = 0.55,
    arg3?: THREE.Vector3 | number,
    arg4?: number
  ): void {
    if (typeof arg2 === 'number') {
      const radius = arg2;
      const prevPos = arg3 instanceof THREE.Vector3 ? arg3 : playerPos.clone();
      const resolved = this.resolveCollision(prevPos, playerPos, radius, 2.0);
      playerPos.copy(resolved.position);
      return;
    }

    const velocity = arg2;
    const dt = typeof arg3 === 'number' ? arg3 : 0.016;
    const radius = arg4 ?? 0.55;
    const start = playerPos.clone();
    const desired = start.clone().addScaledVector(velocity, dt);
    const resolved = this.resolveCollision(start, desired, radius, 2.0);
    if (Math.abs(resolved.position.x - desired.x) > 0.001) velocity.x = 0;
    if (Math.abs(resolved.position.z - desired.z) > 0.001) velocity.z = 0;
    playerPos.copy(resolved.position);
  }

  public resolveVehicleCollision(
    vPos: THREE.Vector3,
    carRadiusOrSpeed: number | { value: number } = 1.8,
    _dtOrLength = 2.6,
    prevPos?: THREE.Vector3
  ): boolean {
    const carRadius = typeof carRadiusOrSpeed === 'number' ? carRadiusOrSpeed : 1.8;
    const start = prevPos?.clone() ?? vPos.clone();
    const resolved = this.resolveCollision(start, vPos, carRadius, 2.2);
    const collided = resolved.collided;
    vPos.copy(resolved.position);
    if (collided && typeof carRadiusOrSpeed === 'object' && 'value' in carRadiusOrSpeed) {
      carRadiusOrSpeed.value = -carRadiusOrSpeed.value * 0.3;
    }
    if (collided) playSoundEffect('crash', vPos);
    return collided;
  }

  public getNearbyDoor(playerPos: THREE.Vector3): Door | null {
    for (const door of this.doors) {
      // Normal automatic doors never need an E prompt. A deliberately locked
      // automatic door may still be returned so scripted interactions can explain
      // why it is locked (for example the Springfield jailbreak exit).
      if (door.automatic && !door.automaticLocked) continue;
      if (playerPos.distanceTo(door.position) <= door.interactionRadius) return door;
    }
    return null;
  }

  public update(dt: number) {
    for (const door of this.doors) door.update(dt);
  }
}
