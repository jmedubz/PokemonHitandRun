import * as THREE from 'three';
import { CollisionSystem } from './doors';
import { NPCManager } from './npcManager';
import { ParticleEffectsManager } from './particles';
import { createMaterial, createOakTreeModel } from './models';
import { DestructibleProp, Vehicle } from '../types';
import { playSoundEffect } from './audio';
import { disposeTransientObject3D } from './dispose';
import { getAircraftCollisionProbes } from './aircraft';

type GrowthSpot = {
  key: string;
  position: THREE.Vector3;
  waterSeconds: number;
  growSeconds: number;
  wetDisc: THREE.Mesh;
  tree: THREE.Group | null;
  complete: boolean;
};

type FireZone = {
  id: string;
  position: THREE.Vector3;
  timer: number;
  marker: THREE.Mesh;
};

type DestructibleImpactContext = {
  /** World-space point where the force contacts the object. */
  impactPoint?: THREE.Vector3;
  /** World-space source of the impact (player/car/etc.). */
  source?: THREE.Vector3;
  /** Apply the prop-type mass response to the requested launch velocity. */
  applyMassResponse?: boolean;
  /** Lets the shared tree profile keep melee/car reactions deliberately punchy. */
  kind?: 'melee' | 'vehicle' | 'aircraft' | 'power' | 'generic';
  /** Carries ownership through a kicked/launched prop into a later NPC impact. */
  playerCaused?: boolean;
};

type DynamicPropBody = {
  root: THREE.Vector3;
  centerX: number;
  centerZ: number;
  minY: number;
  maxY: number;
  height: number;
  radius: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Optional main-axis capsule proxy used by trees, poles/signs and mailboxes. */
  axisStart?: THREE.Vector3;
  axisEnd?: THREE.Vector3;
  trunkRadius?: number;
};

type AircraftSoftPropProfile = {
  tier: 'very_light' | 'light' | 'medium';
  /** Minimum same-frame separation so taxi-speed contact cannot turn scenery into a wall. */
  baseYield: number;
  /** Additional same-frame separation contributed by aircraft speed. */
  speedYield: number;
  maxYield: number;
};

function planarDistance(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function isInForwardCone(origin: THREE.Vector3, forward: THREE.Vector3, target: THREE.Vector3, range: number, minDot = 0.45) {
  const delta = target.clone().sub(origin);
  delta.y = 0;
  const distance = delta.length();
  if (distance <= 0.001 || distance > range) return false;
  delta.normalize();
  const flatForward = forward.clone().setY(0).normalize();
  return delta.dot(flatForward) >= minDot;
}

/** Distance from a point to the actual Water Gun stream segment. */
function distanceToSegment(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq <= 0.00001) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  const closest = start.clone().addScaledVector(segment, t);
  return point.distanceTo(closest);
}

/** Shared fire/water/electric/destruction state so the abilities interact with one world. */
export class WorldInteractionManager {
  private debugAwakePropCount = 0;
  private debugPropSubsteps = 0;

  public getDebugStats() {
    return {
      awakeProps: this.debugAwakePropCount,
      propSubsteps: this.debugPropSubsteps,
      totalProps: this.destructibles.length,
    };
  }
  public grownTrees: DestructibleProp[] = [];
  private scene: THREE.Scene;
  private collision: CollisionSystem;
  private particles: ParticleEffectsManager;
  private npcs: NPCManager;
  private destructibles: DestructibleProp[];
  private growthSpots = new Map<string, GrowthSpot>();
  private fireZones: FireZone[] = [];
  private lastWaterSfx = 0;
  private lastFireSeed = 0;
  /** Periodic sleeping-tree support audit, deliberately amortised across ticks. */
  private treeSupportAuditTimer = 0;
  private treeSupportAuditCursor = 0;
  private propImpactMidpoint = new THREE.Vector3();
  private propImpactVelocity = new THREE.Vector3();
  private propImpactAngularVelocity = new THREE.Vector3();
  private propImpactArm = new THREE.Vector3();
  private propImpactContact = new THREE.Vector3();
  private onTreeCount?: (count: number) => void;

  constructor(
    scene: THREE.Scene,
    collision: CollisionSystem,
    particles: ParticleEffectsManager,
    npcs: NPCManager,
    destructibles: DestructibleProp[],
    onTreeCount?: (count: number) => void
  ) {
    this.scene = scene;
    this.collision = collision;
    this.particles = particles;
    this.npcs = npcs;
    // Permanent road/kerb/lane geometry must never enter the destructible physics
    // loop. App already filters these, but keep the invariant here as well so a
    // future caller cannot accidentally make a road slab fly when hit by a car.
    const isPermanentRoad = (root: THREE.Object3D) => {
      let permanent = root.userData.permanentRoadGeometry === true;
      if (!permanent) root.traverse((obj) => {
        if (obj.userData.permanentRoadGeometry === true) permanent = true;
      });
      return permanent;
    };
    this.destructibles = destructibles.filter((prop) => !isPermanentRoad(prop.mesh));
    this.destructibles.forEach((prop) => this.standardiseInteractivePhysics(prop));
    this.onTreeCount = onTreeCount;
  }

  private isPoleLike(prop: DestructibleProp) {
    return prop.type === 'lamp' || prop.type === 'sign';
  }

  /** Tall/flat scenery must finish collapsed after it has been knocked over. */
  private isToppleLike(prop: DestructibleProp) {
    return prop.type === 'tree' || prop.type === 'lamp' || prop.type === 'sign' || prop.type === 'fence' || prop.type === 'mailbox';
  }

  /** Props represented by a narrow moving main-axis proxy instead of a full AABB. */
  private usesAxisCollider(prop: DestructibleProp) {
    return prop.type === 'tree' || this.isPoleLike(prop) || prop.type === 'mailbox';
  }

  /** Apply one reusable arcade-rigid-body philosophy to every movable prop. */
  private standardiseInteractivePhysics(prop: DestructibleProp) {
    prop.mesh.userData.arcadePhysicsProfile = 'shared_knockable_v4_natural_rest';
    prop.mesh.userData.aircraftSoftPropClass = this.aircraftSoftPropProfile(prop).tier;
    prop.mesh.userData.physicsGroundContactSeconds = 0;
    prop.mesh.userData.physicsHasBeenKnocked = false;
    prop.mesh.userData.settled = true;
    prop.mesh.traverse((obj) => {
      obj.userData.interactivePhysicsObject = true;
      obj.userData.arcadePhysicsProfile = 'shared_knockable_v4_natural_rest';
      obj.userData.aircraftSoftPropClass = prop.mesh.userData.aircraftSoftPropClass;
    });

    if (prop.type === 'tree') this.standardiseTreePhysics(prop);
    else if (this.isPoleLike(prop)) this.standardisePolePhysics(prop);
    else if (prop.type === 'mailbox') this.standardiseMailboxPhysics(prop);
    else {
      // Fences and compact props keep their actual visible bounds as collision.
      // No extra proxy is created, so there is still exactly one moving collider.
      prop.mesh.userData.colliderPadding = Number(prop.mesh.userData.colliderPadding ?? (prop.type === 'fence' ? 0.0 : 0.025));
      this.syncPropCollider(prop);
    }

    if (this.isToppleLike(prop)) this.cacheToppleProfile(prop);
  }

  /**
   * Cache shape-aware toppling data once. Tall objects use a low/mid centre of mass
   * so an impact produces a readable base-tip, but once airborne they rotate around
   * their body rather than orbiting around the authored ground pivot.
   */
  private cacheToppleProfile(prop: DestructibleProp) {
    prop.mesh.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(prop.mesh);
    const size = box.getSize(new THREE.Vector3());
    const shape = this.propPhysicsShape(prop);
    const height = prop.type === 'tree'
      ? Number(prop.mesh.userData.treePhysicsHeight ?? shape.height)
      : this.isPoleLike(prop)
        ? Number(prop.mesh.userData.polePhysicsHeight ?? Math.max(shape.height, size.y))
        : Math.max(0.4, size.y || shape.height);
    const fraction = prop.type === 'tree' ? 0.40 : prop.type === 'fence' ? 0.44 : prop.type === 'mailbox' ? 0.38 : 0.42;
    prop.mesh.userData.physicsToppleHeight = height;
    // Mailboxes are top-heavy because the metal box carries far more visual mass than
    // the narrow post. Their authored root sits around the post midpoint, so keep the
    // COM moderately above that root rather than at half the full visible AABB.
    prop.mesh.userData.physicsComHeight = prop.type === 'mailbox'
      ? Math.max(0.30, Number(prop.mesh.userData.mailboxPhysicsComOffset ?? height * fraction))
      : Math.max(0.18, height * fraction);
    prop.mesh.userData.physicsLyingAxisY = prop.type === 'fence' ? 0.22 : prop.type === 'tree' ? 0.13 : prop.type === 'mailbox' ? 0.24 : 0.16;
    // A thin fence can have its local up axis horizontal while still balancing on
    // its long edge. Sleeping therefore also requires the broad panel face (local Z)
    // to be nearly parallel with the ground, i.e. its face normal is near vertical.
    if (prop.type === 'fence') {
      // One degree from perfectly flat. The earlier 0.97 (~14 degrees) tolerance
      // was mathematically 'fallen' but still visibly propped up at one edge on a
      // long fence section. Keep the final rest pose visually flush with the ground.
      prop.mesh.userData.physicsFenceFaceNormalY = Math.cos(THREE.MathUtils.degToRad(1));
      prop.mesh.userData.physicsFenceRestFaceSign = undefined;
    }
  }

  /**
   * Thin poles/sign posts use their real shaft as the hard body instead of the full
   * decorative AABB (lantern, crossarm, sign face). This is what makes a thin pole
   * feel thin when walking/driving beside it, while the same axis proxy rotates and
   * travels with the prop after a kick or vehicle hit.
   */
  private standardisePolePhysics(prop: DestructibleProp) {
    prop.mesh.userData.polePhysicsProfile = 'moving_axis_capsule_v1';
    prop.mesh.userData.colliderPadding = Number(prop.mesh.userData.colliderPadding ?? 0.015);
    prop.mesh.updateWorldMatrix(true, true);

    let shaftHeight = 0;
    let shaftRadius = Infinity;
    prop.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const geometry = obj.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> };
      const params = geometry?.parameters;
      if (!params || geometry.type !== 'CylinderGeometry') return;
      const localHeight = Number(params.height ?? 0);
      const localRadius = Math.max(Number(params.radiusTop ?? 0), Number(params.radiusBottom ?? 0));
      if (!(localHeight >= 1.0) || !(localRadius > 0 && localRadius <= 0.7)) return;
      const scale = obj.getWorldScale(new THREE.Vector3());
      const h = localHeight * Math.abs(scale.y);
      const r = localRadius * Math.max(Math.abs(scale.x), Math.abs(scale.z));
      // Prefer the tallest narrow cylinder: on a power pole/street lamp this is the
      // actual shaft, not the decorative lantern/insulator/crossarm.
      if (h > shaftHeight) {
        shaftHeight = h;
        shaftRadius = r;
      }
    });

    if (!(shaftHeight > 0.8)) {
      const box = new THREE.Box3().setFromObject(prop.mesh);
      const size = box.getSize(new THREE.Vector3());
      shaftHeight = THREE.MathUtils.clamp(size.y, 1.6, 11.0);
    }
    if (!Number.isFinite(shaftRadius)) shaftRadius = prop.type === 'sign' ? 0.13 : 0.18;

    prop.mesh.userData.polePhysicsHeight = THREE.MathUtils.clamp(shaftHeight, 1.4, 11.0);
    prop.mesh.userData.polePhysicsRadius = THREE.MathUtils.clamp(shaftRadius + 0.018, 0.10, 0.30);
    prop.mesh.traverse((obj) => {
      obj.userData.interactivePhysicsObject = true;
      obj.userData.movingPolePhysics = true;
    });
    this.syncPropCollider(prop);
  }

  /**
   * Mailboxes are post-mounted, top-heavy props. Cache a compact main-axis capsule
   * from their actual authored bounds while upright so the moving collider follows
   * both the post and mailbox head without turning a diagonal fall into a giant AABB.
   */
  private standardiseMailboxPhysics(prop: DestructibleProp) {
    if (prop.type !== 'mailbox') return;
    prop.mesh.userData.mailboxPhysicsProfile = 'topheavy_axis_capsule_v1';
    prop.mesh.userData.colliderPadding = Number(prop.mesh.userData.colliderPadding ?? 0.018);
    prop.mesh.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(prop.mesh);
    const root = prop.mesh.getWorldPosition(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const minOffset = Number.isFinite(box.min.y) ? box.min.y - root.y : -0.60;
    const maxOffset = Number.isFinite(box.max.y) ? box.max.y - root.y : 0.88;
    const totalHeight = Math.max(0.9, maxOffset - minOffset);

    // The visible box is roughly 0.5 x 0.8 m while its supporting post is thin. A
    // 0.34 m capsule is a useful physical compromise: large enough to represent the
    // mailbox head, but far tighter than the full world AABB while tumbling.
    const horizontalHeadRadius = Math.max(size.x, size.z) * 0.42;
    prop.mesh.userData.mailboxPhysicsRadius = THREE.MathUtils.clamp(horizontalHeadRadius, 0.28, 0.36);
    prop.mesh.userData.mailboxPhysicsMinOffset = THREE.MathUtils.clamp(minOffset, -0.9, -0.15);
    prop.mesh.userData.mailboxPhysicsMaxOffset = THREE.MathUtils.clamp(maxOffset, 0.35, 1.25);
    prop.mesh.userData.mailboxPhysicsHeight = totalHeight;
    // Approximate the top-heavy visible mass (box + post) relative to the authored
    // root. This is used by the shared COM integrator, not as an orientation snap.
    prop.mesh.userData.mailboxPhysicsComOffset = THREE.MathUtils.clamp(maxOffset * 0.66, 0.42, 0.62);
    prop.mesh.traverse((obj) => {
      obj.userData.interactivePhysicsObject = true;
      obj.userData.movingMailboxPhysics = true;
    });
    this.syncPropCollider(prop);
  }

  /**
   * Every full-size environmental tree uses one reusable arcade-physics profile.
   * This metadata is intentionally applied from the shared manager rather than in
   * individual map call sites so authored city trees and player-grown trees cannot
   * silently drift into different interaction/collision behaviour later.
   */
  private standardiseTreePhysics(prop: DestructibleProp) {
    if (prop.type !== 'tree') return;
    prop.mesh.userData.kickableTree = true;
    prop.mesh.userData.treePhysicsProfile = 'arcade_reusable_v4_natural_torque_rest';
    prop.mesh.userData.colliderPadding = Number(prop.mesh.userData.colliderPadding ?? 0.025);

    // Cache one trunk-centred physical profile from the authored full-size tree.
    // The canopy remains purely visual/soft: it must never become the enormous hard
    // AABB that used to make trees hover or kick back from invisible leaf corners.
    prop.mesh.updateWorldMatrix(true, true);
    const authoredBounds = new THREE.Box3().setFromObject(prop.mesh);
    const authoredSize = authoredBounds.getSize(new THREE.Vector3());
    if (Number.isFinite(authoredSize.y) && authoredSize.y > 0.5) {
      const height = THREE.MathUtils.clamp(authoredSize.y, 4.0, 7.5);
      const radius = THREE.MathUtils.clamp(
        Math.min(authoredSize.x, authoredSize.z) * 0.18,
        0.46,
        0.82
      );
      prop.mesh.userData.treePhysicsHeight = height;
      prop.mesh.userData.treePhysicsRadius = radius;
      // A tree is top-heavy, but not so top-heavy that it rotates around the crown.
      // Keeping COM around 40% of trunk height produces a readable base-tip first,
      // then a smooth free tumble once the tree actually leaves the ground.
      prop.mesh.userData.treePhysicsComHeight = height * 0.40;
    }

    prop.mesh.userData.treeGroundImpacts = 0;
    prop.mesh.userData.settleSeconds = 0;
    prop.mesh.traverse((obj) => {
      obj.userData.interactivePhysicsObject = true;
      obj.userData.kickableTree = true;
    });

    // Saved/player-grown trees can be restored with a stale Y value. Repair every
    // tree from the same support query at startup rather than hand-moving one known
    // floating specimen in Springfield/Simpsons City.
    this.repairTreeSupport(prop, true);
    this.syncPropCollider(prop);
  }

  private propUpAxisWorld(prop: DestructibleProp) {
    const worldQ = prop.mesh.getWorldQuaternion(new THREE.Quaternion());
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQ);
    if (axis.lengthSq() < 0.000001) axis.set(0, 1, 0);
    return axis.normalize();
  }

  /**
   * Broad-face normal for a fence panel. Most authored fences are thin on local Z,
   * but some shared-system fences (notably the airport chain-link panels) are thin
   * on local X because their rails run along local Z. The model declares that one
   * axis once; all settling/sleep/audit logic then remains shared.
   */
  private fenceFaceNormalWorld(prop: DestructibleProp) {
    const worldQ = prop.mesh.getWorldQuaternion(new THREE.Quaternion());
    const declaredAxis = String(prop.mesh.userData.physicsFenceFaceAxis ?? 'z').toLowerCase();
    const localFaceNormal = declaredAxis === 'x'
      ? new THREE.Vector3(1, 0, 0)
      : declaredAxis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
    const axis = localFaceNormal.clone().applyQuaternion(worldQ);
    if (axis.lengthSq() < 0.000001) axis.copy(localFaceNormal);
    return axis.normalize();
  }

  private fenceFlatFaceLimit(prop: DestructibleProp) {
    return Number(prop.mesh.userData.physicsFenceFaceNormalY ?? Math.cos(THREE.MathUtils.degToRad(1)));
  }

  private treeAxisWorld(prop: DestructibleProp) {
    return this.propUpAxisWorld(prop);
  }

  /** Physical centre of mass, separate from the authored ground/base pivot. */
  private propCenterOfMassWorld(prop: DestructibleProp) {
    const root = prop.mesh.getWorldPosition(new THREE.Vector3());
    const fallback = prop.type === 'tree' ? Number(prop.mesh.userData.treePhysicsComHeight ?? 2.2) : 0.55;
    const comHeight = Math.max(0.12, Number(prop.mesh.userData.physicsComHeight ?? fallback));
    return root.addScaledVector(this.propUpAxisWorld(prop), comHeight);
  }

  private treeCenterOfMassWorld(prop: DestructibleProp) {
    return this.propCenterOfMassWorld(prop);
  }

  /** Keep the authored root positioned from a world-space COM after rotation. */
  private setPropRootFromCenterOfMass(prop: DestructibleProp, centerOfMass: THREE.Vector3) {
    const fallback = prop.type === 'tree' ? Number(prop.mesh.userData.treePhysicsComHeight ?? 2.2) : 0.55;
    const comHeight = Math.max(0.12, Number(prop.mesh.userData.physicsComHeight ?? fallback));
    const desiredWorldRoot = centerOfMass.clone().addScaledVector(this.propUpAxisWorld(prop), -comHeight);
    if (prop.mesh.parent && prop.mesh.parent !== this.scene) prop.mesh.parent.worldToLocal(desiredWorldRoot);
    prop.mesh.position.copy(desiredWorldRoot);
  }

  private setTreeRootFromCenterOfMass(prop: DestructibleProp, centerOfMass: THREE.Vector3) {
    this.setPropRootFromCenterOfMass(prop, centerOfMass);
  }

  private applyPropWorldCorrection(prop: DestructibleProp, correction: THREE.Vector3) {
    if (correction.lengthSq() <= 0.00000001) return;
    prop.mesh.position.add(correction);
    const com = prop.mesh.userData.physicsCenterOfMass;
    if (com instanceof THREE.Vector3) com.add(correction);
  }

  private applyTreeWorldCorrection(prop: DestructibleProp, correction: THREE.Vector3) {
    this.applyPropWorldCorrection(prop, correction);
  }

  /**
   * Sync the ONE authoritative collider to the current rendered physics body. Trees
   * and poles use a tight oriented axis proxy; other props use their live visible
   * bounds. No collider is ever intentionally left at the spawn transform.
   */
  private syncPropCollider(prop: DestructibleProp) {
    const colliderId = `prop_${prop.id}`;
    if (!this.usesAxisCollider(prop)) {
      this.collision.syncInteractiveObject(prop.mesh, colliderId, this.propColliderPadding(prop));
      return;
    }

    const body = this.dynamicPropBody(prop);
    const radius = Math.max(0.08, body.trunkRadius ?? 0.2);
    if (!body.axisStart || !body.axisEnd) {
      this.collision.syncInteractiveProxy(colliderId, {
        minX: body.minX, maxX: body.maxX, minZ: body.minZ, maxZ: body.maxZ,
        minY: body.minY, maxY: body.maxY,
      }, this.propColliderPadding(prop));
      return;
    }

    // Project the 3D capsule axis onto X/Z and represent it as a thin oriented
    // rectangle with circular player/vehicle collision around it. Upright poles are
    // effectively radius-sized circles; fallen poles/trees become long, narrow
    // blockers aligned with the visible shaft/trunk rather than a huge square AABB.
    const dx = body.axisEnd.x - body.axisStart.x;
    const dz = body.axisEnd.z - body.axisStart.z;
    const planarLength = Math.hypot(dx, dz);
    const centerX = (body.axisStart.x + body.axisEnd.x) * 0.5;
    const centerZ = (body.axisStart.z + body.axisEnd.z) * 0.5;
    const rotationY = planarLength > 0.0001 ? Math.atan2(dz, dx) : 0;
    const halfX = planarLength * 0.5 + radius;
    const halfZ = radius;
    const c = Math.cos(rotationY);
    const sn = Math.sin(rotationY);
    const broadHalfX = Math.abs(c) * halfX + Math.abs(sn) * halfZ;
    const broadHalfZ = Math.abs(sn) * halfX + Math.abs(c) * halfZ;

    this.collision.syncInteractiveProxy(colliderId, {
      minX: centerX - broadHalfX, maxX: centerX + broadHalfX,
      minZ: centerZ - broadHalfZ, maxZ: centerZ + broadHalfZ,
      minY: body.minY, maxY: body.maxY,
      centerX, centerZ, halfX, halfZ, rotationY,
    }, this.propColliderPadding(prop));
  }

  /**
   * Ground/support repair shared by startup, save restore and the sleeping audit.
   * Returns true when the transform changed.
   */
  private repairTreeSupport(prop: DestructibleProp, snapFloating: boolean) {
    if (prop.type !== 'tree') return false;
    const body = this.dynamicPropBody(prop);
    const support = this.propSupportHeight(body, body.minY + 0.25);
    const gap = body.minY - support;
    if (!Number.isFinite(gap)) return false;

    // Buried trees are always corrected. A sleeping tree more than 10 cm above its
    // support is invalid too; at startup/load snap it safely to support, while the
    // runtime audit wakes it so gravity owns the visible fall.
    if (gap < -0.10 || (snapFloating && gap > 0.10)) {
      const correction = new THREE.Vector3(0, (support + 0.004) - body.minY, 0);
      prop.mesh.position.y += correction.y;
      const com = prop.mesh.userData.physicsCenterOfMass;
      if (com instanceof THREE.Vector3) com.y += correction.y;
      prop.position = { x: prop.mesh.position.x, y: prop.mesh.position.y, z: prop.mesh.position.z };
      return true;
    }
    return false;
  }

  /**
   * Preferred final fallen direction for a knocked tree. A fresh impact records the
   * away-from-hit direction, but late settling is allowed to choose the nearest
   * horizontal side if the tree has already tumbled past it. This avoids a visible
   * 180-degree correction while still preventing upright/diagonal final rests.
   */
  private propPreferredRestAxis(prop: DestructibleProp) {
    const stored = prop.mesh.userData.physicsRestDirection ?? prop.mesh.userData.treeRestDirection;
    if (stored instanceof THREE.Vector3) {
      const flat = stored.clone().setY(0);
      if (flat.lengthSq() > 0.0001) return flat.normalize();
    }

    const current = this.propUpAxisWorld(prop).setY(0);
    if (current.lengthSq() > 0.0001) return current.normalize();

    // Deterministic imperfection: a perfectly vertical rigid body has mathematically
    // zero gravity torque, but a knocked street prop is never supported on an ideal
    // frictionless point. This tiny stable direction avoids impossible balancing
    // without introducing random forces or a visible orientation snap.
    let hash = 0;
    for (let i = 0; i < prop.id.length; i++) hash = ((hash * 31) + prop.id.charCodeAt(i)) | 0;
    const angle = ((Math.abs(hash) % 6283) / 1000);
    return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize();
  }

  private treePreferredRestAxis(prop: DestructibleProp) {
    return this.propPreferredRestAxis(prop);
  }

  // No orientation snap/lerp helper lives here anymore. Toppling props finish
  // falling through continuous gravity torque + contact/friction only.

  /** Frame-rate-independent angular damping. Twist is suppressed more than tumble. */
  private dampPropAngular(prop: DestructibleProp, dt: number, grounded: boolean, collapsed = false) {
    const angular = prop.mesh.userData.angularVelocity;
    if (!(angular instanceof THREE.Vector3)) return;
    const axis = this.propUpAxisWorld(prop);
    const twistAmount = angular.dot(axis);
    const twist = axis.clone().multiplyScalar(twistAmount);
    const tumble = angular.clone().sub(twist);

    let tumbleRate = grounded ? 2.15 : 0.20;
    let twistRate = grounded ? 3.85 : 1.55;
    if (prop.type === 'fence') {
      // A fresh kick gets a brief free-tumble phase so contact with the ground during
      // the initial break-away cannot immediately damp away the satisfying launch.
      // After that short window, the proven flat-settle damping below is unchanged.
      const freeTumble = performance.now() * 0.001 < Number(prop.mesh.userData.physicsFenceFreeTumbleUntil ?? 0);
      tumbleRate = freeTumble
        ? (grounded ? 0.72 : 0.10)
        : (grounded ? (collapsed ? 3.10 : 1.60) : 0.25);
      twistRate = freeTumble
        ? (grounded ? 1.15 : 0.62)
        : (grounded ? (collapsed ? 4.55 : 3.10) : 1.75);
    } else if (this.isPoleLike(prop)) {
      tumbleRate = grounded ? 2.30 : 0.22;
      twistRate = grounded ? 4.05 : 1.70;
    } else if (prop.type === 'mailbox') {
      // Keep enough tumble energy for the top-heavy box to finish falling instead of
      // damping itself into an upright balance. Once collapsed, the multiplier below
      // removes the last wobble naturally before sleep.
      tumbleRate = grounded ? 2.05 : 0.28;
      twistRate = grounded ? 3.70 : 1.35;
    } else if (prop.type !== 'tree') {
      tumbleRate = grounded ? 3.15 : 0.35;
      twistRate = grounded ? 3.55 : 1.20;
    }
    if (collapsed) {
      tumbleRate *= 1.30;
      twistRate *= 1.20;
    }

    tumble.multiplyScalar(Math.exp(-tumbleRate * dt));
    twist.multiplyScalar(Math.exp(-twistRate * dt));
    angular.copy(tumble.add(twist));
  }

  private dampTreeAngular(prop: DestructibleProp, dt: number, grounded: boolean) {
    this.dampPropAngular(prop, dt, grounded, false);
  }

  /**
   * Sweep several small points along a tree trunk / pole shaft instead of one huge
   * circle around its projected length. This preserves continuous wall collision
   * without turning a diagonal fallen object into a giant invisible bumper.
   */
  private resolveAxisPropWorldSweep(prop: DestructibleProp, before: DynamicPropBody, colliderId: string) {
    if (!before.axisStart || !before.axisEnd) return { hitX: false, hitZ: false, collided: false };
    let hitX = false;
    let hitZ = false;
    let collided = false;
    const samples = [0.08, 0.27, 0.50, 0.73, 0.92];

    let desiredBody = this.dynamicPropBody(prop);
    for (const t of samples) {
      if (!desiredBody.axisStart || !desiredBody.axisEnd) break;
      const rawRadius = desiredBody.trunkRadius ?? before.trunkRadius ?? (prop.type === 'tree' ? 0.62 : 0.18);
      const radius = prop.type === 'tree'
        ? Math.max(0.42, Math.min(0.90, rawRadius))
        : prop.type === 'mailbox'
          ? Math.max(0.28, Math.min(0.36, rawRadius))
          : Math.max(0.10, Math.min(0.30, rawRadius));
      const from = before.axisStart.clone().lerp(before.axisEnd, t);
      const to = desiredBody.axisStart.clone().lerp(desiredBody.axisEnd, t);
      const currentPos = new THREE.Vector3(from.x, from.y - radius, from.z);
      const desiredPos = new THREE.Vector3(to.x, to.y - radius, to.z);
      const resolved = this.collision.resolveCollision(
        currentPos,
        desiredPos,
        radius,
        radius * 2,
        (collider) => collider.id === colliderId,
        false,
        true
      );
      const dx = resolved.position.x - desiredPos.x;
      const dz = resolved.position.z - desiredPos.z;
      if (Math.abs(dx) > 0.003 || Math.abs(dz) > 0.003 || resolved.collided) {
        const correction = new THREE.Vector3(dx, 0, dz);
        if (prop.type === 'tree') this.applyTreeWorldCorrection(prop, correction);
        else prop.mesh.position.add(correction);
        hitX ||= Math.abs(dx) > 0.003;
        hitZ ||= Math.abs(dz) > 0.003;
        collided = true;
        // Only a collision correction changes the desired body for the remaining
        // axis probes. Avoid rebuilding the same body five times when nothing hit.
        desiredBody = this.dynamicPropBody(prop);
      }
    }

    return { hitX, hitZ, collided };
  }

  /**
   * Shared melee target query over the LIVE destructible registry. Player-grown
   * trees are added after initial world construction, so App.tsx must not target the
   * stale startup array. Using current visible bounds also means a tree can be kicked
   * again after it has fallen several metres away from its original root pivot.
   */
  public getDestructibleInFront(
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    range: number,
    minDot = -0.15
  ): DestructibleProp | null {
    const flatForward = forward.clone().setY(0);
    if (flatForward.lengthSq() < 0.0001) flatForward.set(0, 0, 1);
    flatForward.normalize();

    let best: DestructibleProp | null = null;
    let bestScore = Infinity;
    for (const prop of this.destructibles) {
      if (prop.destroyed) continue;
      const body = this.dynamicPropBody(prop);
      const dx = body.centerX - origin.x;
      const dz = body.centerZ - origin.z;
      const distance = Math.hypot(dx, dz);
      const interactionRadius = prop.type === 'tree'
        ? Math.min(0.95, Math.max(0.42, this.propPhysicsShape(prop).radius))
        : Math.min(0.65, Math.max(0.22, this.propPhysicsShape(prop).radius * 0.65));
      if (distance > range + interactionRadius) continue;

      if (distance > 0.001) {
        const dot = (dx * flatForward.x + dz * flatForward.z) / distance;
        if (dot < minDot) continue;
      }

      // Prefer the closest physical body surface, not whichever prop happened to
      // be inserted first into the map builder's destructible array.
      const score = Math.max(0, distance - interactionRadius);
      if (score < bestScore) {
        best = prop;
        bestScore = score;
      }
    }
    return best;
  }

  private propColliderPadding(prop: DestructibleProp) {
    return Math.max(0, Number(prop.mesh.userData.colliderPadding ?? 0.035));
  }

  private propPhysicsShape(prop: DestructibleProp) {
    switch (prop.type) {
      case 'tree': return { radius: 0.85, height: 5.8 };
      case 'fence': return { radius: 0.62, height: 1.8 };
      case 'lamp': return { radius: 0.46, height: 2.5 };
      case 'sign': return { radius: 0.44, height: 2.2 };
      case 'bench': return { radius: 0.78, height: 1.15 };
      case 'bin': return { radius: 0.50, height: 1.15 };
      case 'hydrant': return { radius: 0.46, height: 1.05 };
      case 'mailbox': return { radius: 0.55, height: 1.45 };
      case 'cone': return { radius: 0.34, height: 0.85 };
      case 'baggage_cart': return { radius: 2.85, height: 1.95 };
      default: return { radius: 0.46, height: 1.2 };
    }
  }

  /**
   * Conservative CURRENT body bounds used only while a prop is awake.  The old
   * physics capsule always stood upright at mesh.position, so a tumbling tree/pole
   * could visually rotate several metres outside that capsule and clip through a
   * wall or bury its visible geometry under the floor.  Deriving the sweep body
   * from the current rendered bounds keeps collision paired with what the player
   * can actually see, while still using a cheap circle-vs-world solve.
   */
  private dynamicPropBody(prop: DestructibleProp): DynamicPropBody {
    prop.mesh.updateWorldMatrix(true, true);
    const root = prop.mesh.getWorldPosition(new THREE.Vector3());
    const shape = this.propPhysicsShape(prop);

    // Trees, narrow poles and mailboxes use a main-axis capsule rather than their full
    // decorative AABB. Leaves/lanterns/sign faces stay soft, while a mailbox gets a
    // compact post+head proxy that rotates and travels with the visible object.
    if (this.usesAxisCollider(prop)) {
      const isTree = prop.type === 'tree';
      const isMailbox = prop.type === 'mailbox';
      const height = Number(isTree
        ? (prop.mesh.userData.treePhysicsHeight ?? shape.height)
        : isMailbox
          ? (prop.mesh.userData.mailboxPhysicsHeight ?? shape.height)
          : (prop.mesh.userData.polePhysicsHeight ?? shape.height));
      const trunkRadius = Number(isTree
        ? (prop.mesh.userData.treePhysicsRadius ?? shape.radius)
        : isMailbox
          ? (prop.mesh.userData.mailboxPhysicsRadius ?? 0.34)
          : (prop.mesh.userData.polePhysicsRadius ?? Math.min(shape.radius, 0.20)));
      const worldQ = prop.mesh.getWorldQuaternion(new THREE.Quaternion());
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQ);
      if (axis.lengthSq() < 0.0001) axis.set(0, 1, 0);
      axis.normalize();

      const r = isTree
        ? THREE.MathUtils.clamp(trunkRadius, 0.46, 0.92)
        : isMailbox
          ? THREE.MathUtils.clamp(trunkRadius, 0.28, 0.36)
          : THREE.MathUtils.clamp(trunkRadius, 0.10, 0.30);
      const h = Math.max(r * 2.2, height);
      const minOffset = isMailbox ? Number(prop.mesh.userData.mailboxPhysicsMinOffset ?? -0.60) : 0;
      const maxOffset = isMailbox ? Number(prop.mesh.userData.mailboxPhysicsMaxOffset ?? (minOffset + h)) : h;
      const p0 = root.clone().addScaledVector(axis, minOffset + r);
      const p1 = root.clone().addScaledVector(axis, maxOffset - r);
      const center = p0.clone().add(p1).multiplyScalar(0.5);
      const halfAxisPlanar = Math.hypot(p1.x - p0.x, p1.z - p0.z) * 0.5;
      const radius = Math.max(r, halfAxisPlanar + r);
      const minX = Math.min(p0.x, p1.x) - r;
      const maxX = Math.max(p0.x, p1.x) + r;
      const minZ = Math.min(p0.z, p1.z) - r;
      const maxZ = Math.max(p0.z, p1.z) + r;
      const minY = Math.min(p0.y, p1.y) - r;
      const maxY = Math.max(p0.y, p1.y) + r;

      return {
        root,
        centerX: center.x,
        centerZ: center.z,
        minY,
        maxY,
        height: Math.max(0.22, maxY - minY),
        radius,
        minX,
        maxX,
        minZ,
        maxZ,
        axisStart: p0,
        axisEnd: p1,
        trunkRadius: r,
      };
    }

    // Only broad, irregular props need a full visible-world AABB. Axis-collider props
    // above (trees/poles/mailboxes) are by far the most common awake objects and used
    // to pay for Box3.setFromObject() on EVERY physics substep even though that result
    // was immediately discarded. Avoiding that scene-graph traversal removes a major
    // allocation/GC hotspot during chain reactions and aircraft prop impacts.
    const box = new THREE.Box3().setFromObject(prop.mesh);

    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.y)) {
      return {
        root,
        centerX: root.x,
        centerZ: root.z,
        minY: root.y,
        maxY: root.y + shape.height,
        height: shape.height,
        radius: shape.radius,
        minX: root.x - shape.radius,
        maxX: root.x + shape.radius,
        minZ: root.z - shape.radius,
        maxZ: root.z + shape.radius,
      };
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // A circle around the CURRENT X/Z projection is deliberately conservative.
    // Unlike the old upright capsule it still covers a pole/tree after it tips over.
    const projectedHalfDiagonal = Math.hypot(size.x, size.z) * 0.5;
    const maxProjectedRadius = prop.type === 'fence' ? 6.5 : 3.4;
    const radius = THREE.MathUtils.clamp(
      Math.max(shape.radius, projectedHalfDiagonal),
      Math.max(0.22, shape.radius * 0.82),
      maxProjectedRadius
    );
    const height = Math.max(0.22, size.y);

    return {
      root,
      centerX: center.x,
      centerZ: center.z,
      minY: box.min.y,
      maxY: box.max.y,
      height,
      radius,
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
    };
  }


  /** Contact between a recovering character capsule and the CURRENT physical body
   * of a kickable prop. This is deliberately separate from impact detection: a
   * settled fence/tree can pin somebody even when it has almost zero velocity. */
  private recoveryPropContact(
    prop: DestructibleProp,
    position: THREE.Vector3,
    radius: number,
    height: number
  ): { away: THREE.Vector3; penetration: number } | null {
    if (prop.destroyed || !prop.mesh.visible) return null;
    const body = this.dynamicPropBody(prop);
    const charMinY = position.y + 0.02;
    const charMaxY = position.y + height;
    if (charMaxY < body.minY - 0.04 || charMinY > body.maxY + 0.04) return null;

    let closestX: number;
    let closestZ: number;
    let limit = radius + 0.02;

    if (body.axisStart && body.axisEnd) {
      const ax = body.axisStart.x;
      const az = body.axisStart.z;
      const bx = body.axisEnd.x;
      const bz = body.axisEnd.z;
      const abx = bx - ax;
      const abz = bz - az;
      const lenSq = abx * abx + abz * abz;
      const t = lenSq > 0.000001
        ? THREE.MathUtils.clamp(((position.x - ax) * abx + (position.z - az) * abz) / lenSq, 0, 1)
        : 0;
      closestX = ax + abx * t;
      closestZ = az + abz * t;
      limit += Math.max(0.08, body.trunkRadius ?? 0.20);
    } else {
      closestX = THREE.MathUtils.clamp(position.x, body.minX, body.maxX);
      closestZ = THREE.MathUtils.clamp(position.z, body.minZ, body.maxZ);
    }

    let dx = position.x - closestX;
    let dz = position.z - closestZ;
    let distSq = dx * dx + dz * dz;
    if (distSq > limit * limit) return null;

    let penetration: number;
    if (distSq < 0.000001) {
      // Character centre is inside the X/Z projection. Pick the shortest way out of
      // the prop footprint so the recovery roll is deterministic and visibly local.
      const choices = [
        { d: Math.abs(position.x - body.minX), x: -1, z: 0 },
        { d: Math.abs(body.maxX - position.x), x: 1, z: 0 },
        { d: Math.abs(position.z - body.minZ), x: 0, z: -1 },
        { d: Math.abs(body.maxZ - position.z), x: 0, z: 1 },
      ].sort((a, b) => a.d - b.d);
      dx = choices[0].x;
      dz = choices[0].z;
      penetration = limit + choices[0].d;
    } else {
      const dist = Math.sqrt(distSq);
      dx /= dist;
      dz /= dist;
      penetration = Math.max(0, limit - dist);
    }

    return {
      away: new THREE.Vector3(dx, 0, dz),
      penetration,
    };
  }

  /** Cheap recovery-only probe. It runs only for downed/recovering NPCs, so scanning
   * the interactive prop roster here is far cheaper than adding every prop to a new
   * global broad phase. */
  public probeNPCRecoveryBlockers(
    position: THREE.Vector3,
    radius = 0.43,
    height = 1.62
  ): { blocked: boolean; blockerCount: number; escapeDirection?: THREE.Vector3 } {
    const escape = new THREE.Vector3();
    let blockerCount = 0;
    for (const prop of this.destructibles) {
      const contact = this.recoveryPropContact(prop, position, radius, height);
      if (!contact) continue;
      blockerCount++;
      escape.addScaledVector(contact.away, Math.max(0.08, contact.penetration + 0.06));
    }
    if (escape.lengthSq() > 0.0001) escape.normalize();
    return {
      blocked: blockerCount > 0,
      blockerCount,
      escapeDirection: blockerCount > 0 ? escape : undefined,
    };
  }

  /** First-line escape for a pinned ragdoll: wake and gently shove the covering
   * kickable prop AWAY from the NPC. The existing prop physics/collider system owns
   * the actual movement, so fence/tree/pole impacts remain exactly the same system. */
  public nudgeNPCRecoveryBlockers(
    position: THREE.Vector3,
    radius = 0.43,
    height = 0.82,
    strength = 1
  ): boolean {
    let moved = false;
    for (const prop of this.destructibles) {
      const contact = this.recoveryPropContact(prop, position, radius, height);
      if (!contact) continue;
      const now = performance.now() * 0.001;
      if (now < Number(prop.mesh.userData.npcRecoveryNudgeAfter ?? 0)) continue;
      prop.mesh.userData.npcRecoveryNudgeAfter = now + 0.22;

      const typeScale = prop.type === 'tree'
        ? 0.62
        : prop.type === 'fence'
          ? 0.90
          : (prop.type === 'lamp' || prop.type === 'sign')
            ? 0.78
            : 1.0;
      const shoveSpeed = THREE.MathUtils.clamp((1.8 + strength * 1.9) * typeScale, 1.4, 5.2);
      const push = contact.away.clone().multiplyScalar(-shoveSpeed);
      push.y = THREE.MathUtils.clamp(0.35 + strength * 0.24, 0.35, 0.85);
      const impactPoint = new THREE.Vector3(position.x, position.y + 0.35, position.z);
      if (this.launchDestructible(
        prop,
        push,
        0.12,
        THREE.MathUtils.clamp(0.08 + strength * 0.06, 0.08, 0.22),
        { source: position, impactPoint, kind: 'generic', playerCaused: false }
      )) {
        moved = true;
      }
    }
    return moved;
  }

  /**
   * Highest real support under a moving/tumbling prop footprint.  Sampling the
   * centre plus the current visible extents means a fallen tree cannot have its root
   * sitting on the road while its trunk/branches are visibly underneath the terrain.
   */
  private propSupportHeight(body: ReturnType<WorldInteractionManager['dynamicPropBody']>, referenceY: number) {
    const samples: Array<[number, number]> = [];

    if (body.axisStart && body.axisEnd) {
      // Trees/poles/mailboxes already have an exact physical main-axis proxy.
      // Sampling the two load-bearing ends + centre is both cheaper and more
      // representative than ray-testing all nine corners of their world AABB.
      samples.push(
        [0, 0],
        [body.axisStart.x - body.centerX, body.axisStart.z - body.centerZ],
        [body.axisEnd.x - body.centerX, body.axisEnd.z - body.centerZ],
      );
    } else {
      const halfX = Math.max(0.08, (body.maxX - body.minX) * 0.5);
      const halfZ = Math.max(0.08, (body.maxZ - body.minZ) * 0.5);
      const ox = Math.min(halfX * 0.82, 1.8);
      const oz = Math.min(halfZ * 0.82, 1.8);
      // Broad props still sample their centre + four cardinal support points.
      // The previous nine-point pattern repeated exact raycasts on every substep
      // and could spend hundreds of milliseconds on ONE tumbling object.
      samples.push([0, 0], [ox, 0], [-ox, 0], [0, oz], [0, -oz]);
    }

    let support = -Infinity;
    for (const [dx, dz] of samples) {
      const y = this.collision.getGroundHeightNear(
        body.centerX + dx, body.centerZ + dz, referenceY, 0.12, 2.4, 140, true
      );
      if (Number.isFinite(y)) support = Math.max(support, y);
    }
    return Number.isFinite(support) ? support : 0.12;
  }

  /** Lowest solid ceiling/roof underside above the CURRENT prop footprint. */
  private propCeilingHeight(body: ReturnType<WorldInteractionManager['dynamicPropBody']>, referenceTop: number, rise: number) {
    const samples: Array<[number, number]> = [];
    if (body.axisStart && body.axisEnd) {
      samples.push(
        [0, 0],
        [body.axisStart.x - body.centerX, body.axisStart.z - body.centerZ],
        [body.axisEnd.x - body.centerX, body.axisEnd.z - body.centerZ],
      );
    } else {
      const halfX = Math.max(0.08, (body.maxX - body.minX) * 0.5);
      const halfZ = Math.max(0.08, (body.maxZ - body.minZ) * 0.5);
      const ox = Math.min(halfX * 0.78, 1.6);
      const oz = Math.min(halfZ * 0.78, 1.6);
      samples.push([0, 0], [ox, 0], [-ox, 0], [0, oz], [0, -oz]);
    }

    let ceiling = Infinity;
    for (const [dx, dz] of samples) {
      // getCeilingHeightNear deliberately ignores a surface closer than ~0.32 m
      // to its reference point. Offset the probe downward by that tolerance so a
      // prop already brushing a ceiling still sees it on the next substep.
      const y = this.collision.getCeilingHeightNear(
        body.centerX + dx, body.centerZ + dz, referenceTop - 0.36, Math.max(1.0, rise + 1.0)
      );
      if (y !== null) ceiling = Math.min(ceiling, y);
    }
    return Number.isFinite(ceiling) ? ceiling : null;
  }

  /**
   * Aircraft-specific yield classes for already-kickable scenery.  This does NOT
   * decide whether something is solid architecture; only DestructibleProp entries
   * reach this code.  The tier controls how aggressively the prop is moved out of
   * an aircraft's swept body before the aircraft is ever asked to give way.
   */
  private aircraftSoftPropProfile(prop: DestructibleProp): AircraftSoftPropProfile {
    switch (prop.type) {
      case 'cone':
      case 'donut_box':
      case 'bin':
        return { tier: 'very_light', baseYield: 0.46, speedYield: 0.050, maxYield: 1.45 };
      case 'fence':
      case 'mailbox':
      case 'sign':
      case 'lamp':
      case 'bench':
      case 'hydrant':
      case 'tree':
        return { tier: 'light', baseYield: 0.34, speedYield: 0.036, maxYield: 1.08 };
      case 'baggage_cart':
        return { tier: 'medium', baseYield: 0.22, speedYield: 0.024, maxYield: 0.72 };
      default:
        return { tier: 'light', baseYield: 0.30, speedYield: 0.032, maxYield: 0.92 };
    }
  }

  /**
   * Same-frame depenetration for soft aircraft contacts.  The prop gets priority to
   * move; the aircraft is intentionally not teleported.  We try the true impact
   * direction first, then two shallow side escapes so a cone/fence/cart caught
   * between landing gear and a wall can still find a nearby clear position.
   * Fixed-world collision remains authoritative; neighbouring interactive scenery
   * is ignored only for this tiny break-away displacement.
   */
  private yieldPropFromAircraft(prop: DestructibleProp, impactDirection: THREE.Vector3, distance: number) {
    if (distance <= 0.001 || prop.destroyed) return 0;
    this.scene.attach(prop.mesh);
    const before = this.dynamicPropBody(prop);
    const colliderId = `prop_${prop.id}`;
    const dir = impactDirection.clone().setY(0);
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const attempts = [
      dir.clone(),
      dir.clone().multiplyScalar(0.82).addScaledVector(side, 0.57).normalize(),
      dir.clone().multiplyScalar(0.82).addScaledVector(side, -0.57).normalize(),
      side.clone(),
      side.clone().multiplyScalar(-1),
    ];

    const shape = this.propPhysicsShape(prop);
    // Safety relocation should match the load-bearing part of the object rather than
    // a decorative AABB (long fence rails / tree canopies otherwise look immovable).
    const sweepRadius = prop.type === 'baggage_cart'
      ? 1.18
      : prop.type === 'fence'
        ? 0.74
        : this.usesAxisCollider(prop)
          ? Math.min(0.92, Math.max(0.16, before.trunkRadius ?? shape.radius))
          : Math.min(before.radius, Math.max(0.28, shape.radius));
    const sweepHeight = prop.type === 'baggage_cart'
      ? Math.min(before.height, 1.65)
      : prop.type === 'fence'
        ? Math.min(before.height, 1.55)
        : Math.min(before.height, Math.max(0.75, shape.height));
    const from = new THREE.Vector3(before.centerX, before.minY, before.centerZ);

    let bestMove = new THREE.Vector3();
    let bestDistance = 0;
    for (const attempt of attempts) {
      const desired = from.clone().addScaledVector(attempt, distance);
      const resolved = this.collision.resolveCollision(
        from, desired, sweepRadius, sweepHeight,
        (collider) => collider.id === colliderId || collider.collisionRole === 'interactive'
      );
      const movement = resolved.position.clone().sub(from);
      movement.y = 0;
      const moved = movement.length();
      if (moved > bestDistance) {
        bestDistance = moved;
        bestMove.copy(movement);
      }
      if (moved >= distance * 0.92) break;
    }

    if (bestDistance <= 0.012) return 0;
    this.applyPropWorldCorrection(prop, bestMove);
    prop.mesh.userData.settled = false;
    prop.mesh.userData.settleSeconds = 0;
    prop.mesh.userData.physicsGroundContactSeconds = 0;
    this.syncPropCollider(prop);
    return bestDistance;
  }

  /** Relative resistance used only for directional kick/car impacts. */
  private propMassResponse(prop: DestructibleProp) {
    // Multiplier applied to the authored arcade impulse. Heavier objects resist more,
    // lighter clutter reacts more, while tree minimum-launch rules still guarantee a
    // satisfying Hit & Run-style response to a direct kick/car hit.
    switch (prop.type) {
      case 'tree': return 0.92;
      case 'hydrant': return 0.95;
      case 'bench': return 0.98;
      case 'lamp': return 1.02;
      case 'mailbox': return 1.12;
      case 'sign': return 1.16;
      case 'fence': return 1.18;
      case 'bin': return 1.20;
      case 'cone': return 1.35;
      case 'donut_box': return 1.40;
      case 'baggage_cart': return 0.62;
      default: return 1.0;
    }
  }

  /** Relative collision mass used when a moving prop hits a character. This is
   * deliberately separate from `propMassResponse`: the latter controls how easily
   * the prop itself launches, while this value controls how much momentum it can
   * transfer into an NPC once it is already moving. */
  private propImpactMass(prop: DestructibleProp) {
    switch (prop.type) {
      case 'tree': return 2.8;
      case 'lamp': return 2.0;
      case 'fence': return 1.75;
      case 'bench': return 1.45;
      case 'hydrant': return 1.25;
      case 'sign': return 1.05;
      case 'mailbox': return 0.95;
      case 'bin': return 0.68;
      case 'donut_box': return 0.32;
      case 'cone': return 0.26;
      case 'baggage_cart': return 2.20;
      default: return 0.8;
    }
  }

  /** Swept prop-vs-NPC secondary impact. Broad phase uses NPCManager's existing
   * nearby spatial grid; force/contact calculations only happen for candidates whose
   * body volume overlaps the prop's actual swept physical bounds. */
  private resolveMovingPropNPCImpacts(
    prop: DestructibleProp,
    startBody: DynamicPropBody,
    endBody: DynamicPropBody,
    frameLinearVelocity: THREE.Vector3,
    frameAngularVelocity: THREE.Vector3
  ) {
    if (!prop.velocity) return;
    const startCenterY = (startBody.minY + startBody.maxY) * 0.5;
    const endCenterY = (endBody.minY + endBody.maxY) * 0.5;
    const travelX = endBody.centerX - startBody.centerX;
    const travelZ = endBody.centerZ - startBody.centerZ;
    const travel = Math.hypot(travelX, travelZ);
    const bodyRadius = Math.max(startBody.radius, endBody.radius);

    this.propImpactMidpoint.set(
      (startBody.centerX + endBody.centerX) * 0.5,
      (startCenterY + endCenterY) * 0.5,
      (startBody.centerZ + endBody.centerZ) * 0.5
    );
    const candidates = this.npcs.getNPCsNearPhysicalImpact(
      this.propImpactMidpoint,
      Math.min(7.5, bodyRadius + travel * 0.5 + 1.15)
    );
    if (!candidates.length) return;

    const segLenSq = travelX * travelX + travelZ * travelZ;
    const sweptMinY = Math.min(startBody.minY, endBody.minY) - 0.10;
    const sweptMaxY = Math.max(startBody.maxY, endBody.maxY) + 0.10;
    const now = performance.now() * 0.001;
    const sourceMass = this.propImpactMass(prop);
    let impacts = 0;

    for (const npc of candidates) {
      if (impacts >= 3 || npc.state === 'defeated' || npc.state === 'grabbed' || npc.mesh.userData.heldByPlayer) continue;
      const targetWeight = Math.max(0.45, npc.combatWeight ?? npc.mesh.userData.combatWeight ?? 1);
      const targetDown = npc.state === 'knocked_out' || npc.state === 'recovering';
      const targetRadius = targetDown ? 0.42 : THREE.MathUtils.clamp(0.37 + targetWeight * 0.075, 0.42, 0.66);
      const targetBottom = npc.mesh.position.y - 0.04;
      const targetTop = npc.mesh.position.y + (targetDown ? 0.82 : 1.82);
      if (sweptMaxY < targetBottom || sweptMinY > targetTop) continue;

      let t = 0;
      if (segLenSq > 0.000001) {
        t = THREE.MathUtils.clamp(
          ((npc.mesh.position.x - startBody.centerX) * travelX + (npc.mesh.position.z - startBody.centerZ) * travelZ) / segLenSq,
          0,
          1
        );
      }
      const closestX = startBody.centerX + travelX * t;
      const closestZ = startBody.centerZ + travelZ * t;
      const targetCenterY = npc.mesh.position.y + (targetDown ? 0.38 : 0.92);

      // Detailed narrow phase against the prop's REAL proxy shape. The broad circle
      // above only discovers candidates; it is never enough by itself to cause a hit.
      let contactX = closestX;
      let contactY = THREE.MathUtils.lerp(startCenterY, endCenterY, t);
      let contactZ = closestZ;
      let shapeHit = false;
      if (startBody.axisStart && startBody.axisEnd && endBody.axisStart && endBody.axisEnd) {
        const ax = THREE.MathUtils.lerp(startBody.axisStart.x, endBody.axisStart.x, t);
        const ay = THREE.MathUtils.lerp(startBody.axisStart.y, endBody.axisStart.y, t);
        const az = THREE.MathUtils.lerp(startBody.axisStart.z, endBody.axisStart.z, t);
        const bx = THREE.MathUtils.lerp(startBody.axisEnd.x, endBody.axisEnd.x, t);
        const by = THREE.MathUtils.lerp(startBody.axisEnd.y, endBody.axisEnd.y, t);
        const bz = THREE.MathUtils.lerp(startBody.axisEnd.z, endBody.axisEnd.z, t);
        const abx = bx - ax;
        const aby = by - ay;
        const abz = bz - az;
        const abLenSq = abx * abx + aby * aby + abz * abz;
        const along = abLenSq > 0.000001
          ? THREE.MathUtils.clamp(
              ((npc.mesh.position.x - ax) * abx + (targetCenterY - ay) * aby + (npc.mesh.position.z - az) * abz) / abLenSq,
              0,
              1
            )
          : 0;
        contactX = ax + abx * along;
        contactY = ay + aby * along;
        contactZ = az + abz * along;
        const ddx = npc.mesh.position.x - contactX;
        const ddy = targetCenterY - contactY;
        const ddz = npc.mesh.position.z - contactZ;
        const proxyRadius = Math.max(startBody.trunkRadius ?? 0.18, endBody.trunkRadius ?? 0.18);
        const hitRadius = proxyRadius + targetRadius;
        shapeHit = ddx * ddx + ddy * ddy + ddz * ddz <= hitRadius * hitRadius;
      } else {
        const minX = THREE.MathUtils.lerp(startBody.minX, endBody.minX, t);
        const maxX = THREE.MathUtils.lerp(startBody.maxX, endBody.maxX, t);
        const minY = THREE.MathUtils.lerp(startBody.minY, endBody.minY, t);
        const maxY = THREE.MathUtils.lerp(startBody.maxY, endBody.maxY, t);
        const minZ = THREE.MathUtils.lerp(startBody.minZ, endBody.minZ, t);
        const maxZ = THREE.MathUtils.lerp(startBody.maxZ, endBody.maxZ, t);
        contactX = THREE.MathUtils.clamp(npc.mesh.position.x, minX, maxX);
        contactY = THREE.MathUtils.clamp(targetCenterY, minY, maxY);
        contactZ = THREE.MathUtils.clamp(npc.mesh.position.z, minZ, maxZ);
        const ddx = npc.mesh.position.x - contactX;
        const ddy = targetCenterY - contactY;
        const ddz = npc.mesh.position.z - contactZ;
        shapeHit = ddx * ddx + ddy * ddy + ddz * ddz <= targetRadius * targetRadius;
      }
      if (!shapeHit) continue;

      const dx = npc.mesh.position.x - contactX;
      const dz = npc.mesh.position.z - contactZ;

      // Contact velocity = linear motion + angular tangential velocity at the NPC.
      const centerY = THREE.MathUtils.lerp(startCenterY, endCenterY, t);
      this.propImpactArm.set(
        npc.mesh.position.x - closestX,
        targetCenterY - centerY,
        npc.mesh.position.z - closestZ
      );
      const currentAngular = prop.mesh.userData.angularVelocity;
      this.propImpactAngularVelocity.copy(frameAngularVelocity);
      if (currentAngular instanceof THREE.Vector3) this.propImpactAngularVelocity.lerp(currentAngular, t);
      this.propImpactAngularVelocity.cross(this.propImpactArm);
      this.propImpactVelocity.copy(frameLinearVelocity).lerp(prop.velocity, t).add(this.propImpactAngularVelocity);
      if (this.propImpactVelocity.lengthSq() < 0.45 * 0.45) continue;

      const normalX = Math.abs(dx) + Math.abs(dz) > 0.0001 ? dx : this.propImpactVelocity.x;
      const normalZ = Math.abs(dx) + Math.abs(dz) > 0.0001 ? dz : this.propImpactVelocity.z;
      const normalLen = Math.hypot(normalX, normalZ);
      if (normalLen > 0.0001) {
        const closing = (this.propImpactVelocity.x * normalX + this.propImpactVelocity.z * normalZ) / normalLen;
        if (closing < 0.20 && Math.abs(this.propImpactVelocity.y) < 2.5) continue;
      }

      this.propImpactContact.set(
        contactX,
        contactY,
        contactZ
      );
      const reaction = this.npcs.applySecondaryImpact(npc, {
        sourceId: `prop:${prop.id}`,
        sourceKind: 'prop',
        sourcePosition: this.propImpactMidpoint,
        velocity: this.propImpactVelocity,
        sourceMass,
        contactPoint: this.propImpactContact,
        playerCaused: now < Number(prop.mesh.userData.playerImpactCreditUntil ?? 0),
      });
      if (reaction === 'none') continue;
      impacts++;

      // Momentum transfer is lossy by design. Big props can bowl somebody over,
      // but each successful hit costs energy so a single fence does not launch an
      // entire crowd at full strength.
      const retain = reaction === 'knockdown' ? 0.62 : reaction === 'fall' ? 0.70 : reaction === 'stumble' ? 0.80 : 0.88;
      prop.velocity.multiplyScalar(retain);
      const angular = prop.mesh.userData.angularVelocity;
      if (angular instanceof THREE.Vector3) angular.multiplyScalar(Math.min(0.94, retain + 0.10));
    }
  }

  /**
   * Build angular velocity from the ACTUAL impact direction/contact point. Linear
   * direction is never randomised; only the amount of cartoon spin varies by shape.
   */
  private directionalAngularVelocity(
    prop: DestructibleProp,
    linearVelocity: THREE.Vector3,
    rotationKick: number,
    context?: DestructibleImpactContext
  ) {
    const flat = linearVelocity.clone().setY(0);
    if (flat.lengthSq() < 0.0001) flat.set(0, 0, 1);
    flat.normalize();

    const shape = this.propPhysicsShape(prop);
    const tallObject = prop.type === 'tree' || prop.type === 'lamp' || prop.type === 'sign' || prop.type === 'fence' || prop.type === 'mailbox';
    const worldPos = prop.mesh.getWorldPosition(new THREE.Vector3());
    const physicalHeight = this.isToppleLike(prop)
      ? Number(prop.mesh.userData.physicsToppleHeight
          ?? (prop.type === 'tree' ? prop.mesh.userData.treePhysicsHeight : prop.mesh.userData.polePhysicsHeight)
          ?? shape.height)
      : shape.height;
    const impactY = context?.impactPoint?.y ?? (worldPos.y + physicalHeight * (tallObject ? 0.28 : 0.45));
    const contact01 = THREE.MathUtils.clamp((impactY - worldPos.y) / Math.max(0.2, physicalHeight), 0, 1);

    // To make a vertical object fall AWAY from the hit, rotate around the horizontal
    // axis perpendicular to the force. This is deterministic: no random X/Y/Z spin.
    const tipAxis = new THREE.Vector3(flat.z, 0, -flat.x).normalize();

    if (prop.type === 'tree') {
      // A low trunk kick should read as a strong base-tip, not a helicopter spin.
      // Vehicle hits can be a little wilder, but still preserve one dominant tumble
      // axis. The old ~7-10 rad/s tip + ~2 rad/s yaw was visually jerky and made the
      // base-pivot sweep enormous between frames.
      const lowContactBoost = THREE.MathUtils.lerp(1.0, 0.72, contact01);
      const impactBoost = context?.kind === 'aircraft' ? 1.28 : context?.kind === 'vehicle' ? 1.14 : 1.0;
      const tipStrength = (3.35 + rotationKick * 1.35) * lowContactBoost * impactBoost;

      let yawSign = 1;
      if (context?.source) {
        const sourceToProp = worldPos.clone().sub(context.source).setY(0);
        if (sourceToProp.lengthSq() > 0.001) {
          sourceToProp.normalize();
          const crossY = sourceToProp.x * flat.z - sourceToProp.z * flat.x;
          if (Math.abs(crossY) > 0.02) yawSign = Math.sign(crossY);
        }
      }
      const yaw = yawSign * (context?.kind === 'aircraft' ? 0.52 : context?.kind === 'vehicle' ? 0.42 : 0.24) * (0.8 + rotationKick * 0.35);
      return tipAxis.multiplyScalar(tipStrength).add(new THREE.Vector3(0, yaw, 0));
    }

    if (prop.type === 'baggage_cart') {
      // Loaded baggage dollies are pushable but heavy/low. They should skid, yaw and
      // rock rather than helicopter-spin like a tiny cone or fence panel.
      const yawSign = (flat.x * 0.63 + flat.z * 0.41) >= 0 ? 1 : -1;
      return tipAxis.multiplyScalar(0.55 + rotationKick * 0.85)
        .add(new THREE.Vector3(0, yawSign * (0.42 + rotationKick * 0.55), 0));
    }

    const tipStrength = tallObject
      ? THREE.MathUtils.lerp(6.8, 4.8, contact01) * (0.72 + rotationKick)
      : (4.0 + rotationKick * 4.0);

    let sideSign = 1;
    if (context?.source) {
      const sourceToProp = worldPos.clone().sub(context.source).setY(0);
      if (sourceToProp.lengthSq() > 0.001) {
        sourceToProp.normalize();
        const crossY = sourceToProp.x * flat.z - sourceToProp.z * flat.x;
        if (Math.abs(crossY) > 0.02) sideSign = Math.sign(crossY);
      }
    } else {
      sideSign = (flat.x * 0.71 + flat.z * 0.37) >= 0 ? 1 : -1;
    }

    return tipAxis.multiplyScalar(tipStrength).add(new THREE.Vector3(0, sideSign * (1.0 + rotationKick * 2.2), 0));
  }

  /**
   * Wake/re-launch a kickable world prop without ever deleting its physical body.
   * The visual mesh and collider remain paired for the entire lifetime of the prop.
   * A short re-hit cooldown prevents one continuous car overlap from applying the
   * same impact every frame, while still allowing the object to be hit repeatedly.
   */
  public launchDestructible(
    prop: DestructibleProp,
    velocity: THREE.Vector3,
    cooldownSeconds = 0.42,
    rotationKick = 0.45,
    impact?: DestructibleImpactContext
  ): boolean {
    if (prop.destroyed) return false;
    const now = performance.now() * 0.001;
    const rehitAfter = Number(prop.mesh.userData.physicsRehitAfter ?? 0);
    if (now < rehitAfter) return false;

    this.scene.attach(prop.mesh);
    prop.mesh.userData.settleSeconds = 0;
    prop.mesh.userData.settled = false;
    prop.mesh.userData.physicsRehitAfter = now + Math.max(0.05, cooldownSeconds);
    if (impact?.playerCaused) prop.mesh.userData.playerImpactCreditUntil = now + 4.0;

    // Preserve a little existing momentum so repeated impacts remain meaningful,
    // but NEVER let stale reverse momentum overpower a fresh directional hit.
    // This was one part of the old "boomerang tree" failure: a prop could carry
    // a previous opposite velocity into the next launch and curve back at the hitter.
    const inherited = prop.velocity?.clone().multiplyScalar(0.16) ?? new THREE.Vector3();
    const requested = velocity.clone();
    if (impact?.applyMassResponse) requested.multiplyScalar(this.propMassResponse(prop));

    // Trees are intentionally arcade-light. The previous 0.72 mass response stacked
    // with the player's 0.72 prop-force multiplier, leaving an ordinary kick at only
    // about half of the authored melee strength. That is why some trees merely
    // twitched. Keep direction unchanged but guarantee a readable Simpsons-style
    // launch for direct melee/car impacts.
    if (prop.type === 'tree' && (impact?.kind === 'melee' || impact?.kind === 'vehicle' || impact?.kind === 'aircraft')) {
      const horizontal = Math.hypot(requested.x, requested.z);
      // Aircraft are allowed to TAXI-push a tree. The old unconditional 20.5 m/s
      // minimum turned even a crawling contact into a huge launch, which also made
      // low-speed depenetration harder. High-speed aircraft already exceed this
      // naturally through the authored speed/mass scaling.
      const minimumHorizontal = impact.kind === 'aircraft' ? 3.2 : impact.kind === 'vehicle' ? 17.5 : 18.5;
      if (horizontal > 0.001 && horizontal < minimumHorizontal) {
        const scale = minimumHorizontal / horizontal;
        requested.x *= scale;
        requested.z *= scale;
      }
      requested.y = Math.max(requested.y, impact.kind === 'aircraft' ? 2.8 : impact.kind === 'vehicle' ? 8.2 : 7.8);
    }

    // Fence melee hits need a clean arcade break-away, not a bottom-hinged collapse.
    // The authored fence panels are light scenery, so preserve the player's exact
    // kick direction but guarantee enough whole-body translation and lift to separate
    // the panel from the run before gravity/flat-settling takes over. Vehicle hits keep
    // their existing tuning; this boost is deliberately limited to direct player kicks.
    if (prop.type === 'fence' && impact?.kind === 'melee') {
      const horizontal = Math.hypot(requested.x, requested.z);
      if (horizontal > 0.001) {
        const targetHorizontal = THREE.MathUtils.clamp(Math.max(27.5, horizontal * 1.32), 27.5, 36.0);
        const scale = targetHorizontal / horizontal;
        requested.x *= scale;
        requested.z *= scale;
      }
      requested.y = THREE.MathUtils.clamp(Math.max(8.8, requested.y * 1.08), 8.8, 14.5);

      // For only the first fraction of a second, let the newly-detached panel clear
      // adjacent *interactive* fence/prop colliders using a tighter body sweep. Fixed
      // buildings/walls are still solid. This prevents neighbouring picket sections
      // from absorbing the kick at frame zero without making fences ghost through the
      // actual world. The normal full panel collision resumes immediately afterwards.
      prop.mesh.userData.physicsFenceLaunchGraceUntil = now + 0.22;
      prop.mesh.userData.physicsFenceFreeTumbleUntil = now + 0.34;
    }

    const requestedFlat = requested.clone().setY(0);
    if (requestedFlat.lengthSq() > 0.0001) {
      const launchDir = requestedFlat.clone().normalize();
      const inheritedFlat = inherited.clone().setY(0);
      const inheritedAlong = inheritedFlat.dot(launchDir);
      // Keep same-direction carry and sideways carry, but strip any component that
      // would send the object back toward the new impact source.
      if (inheritedAlong < 0) inherited.addScaledVector(launchDir, -inheritedAlong);

      prop.mesh.userData.lastLaunchDirection = launchDir.clone();
      prop.mesh.userData.lastLaunchTime = performance.now() * 0.001;
      if (this.isToppleLike(prop)) {
        prop.mesh.userData.physicsRestDirection = launchDir.clone();
        prop.mesh.userData.physicsHasBeenKnocked = true;
        // A fresh kick can flip the panel onto either broad face. Re-select the
        // nearest face once it reaches the ground instead of carrying a stale rest
        // side from an earlier knock.
        if (prop.type === 'fence') prop.mesh.userData.physicsFenceRestFaceSign = undefined;
        prop.mesh.userData.physicsGroundContactSeconds = 0;
      }
      if (prop.type === 'tree') {
        // Retain the legacy tree fields for save/support-audit compatibility while
        // the active solver now uses the shared topple state above.
        prop.mesh.userData.treeRestDirection = launchDir.clone();
        prop.mesh.userData.treeHasBeenKnocked = true;
      }
    }
    prop.velocity = inherited.add(requested);

    // Angular motion follows the same contact/force direction. This keeps the big
    // Hit & Run-style tumble without a random sideways launch or random fall side.
    const previousAngular = prop.mesh.userData.angularVelocity instanceof THREE.Vector3
      ? (prop.mesh.userData.angularVelocity as THREE.Vector3).clone().multiplyScalar(0.22)
      : new THREE.Vector3();
    prop.mesh.userData.angularVelocity = previousAngular.add(
      this.directionalAngularVelocity(prop, requested, rotationKick, impact)
    );

    if (this.isToppleLike(prop)) {
      // Tall/flat props rotate around a persistent body COM once awake. This keeps
      // trees, poles, signs and fence panels from orbiting around their authored
      // ground pivot during a launch while still allowing the ground to constrain
      // the lower edge naturally during the tip/fall.
      prop.mesh.userData.physicsCenterOfMass = this.propCenterOfMassWorld(prop);
      prop.mesh.userData.physicsGroundContactSeconds = 0;
      prop.mesh.userData.physicsHasBeenKnocked = true;
    }
    if (prop.type === 'tree') {
      prop.mesh.userData.treeHasBeenKnocked = true;
      prop.mesh.userData.treeGroundImpacts = 0;
      prop.mesh.userData.treeGroundContactSeconds = 0;
    }

    this.syncPropCollider(prop);
    return true;
  }

  public loadGrownTrees(positions: { x: number; y: number; z: number }[] = []) {
    for (const p of positions) {
      this.spawnCompletedTree(new THREE.Vector3(p.x, p.y, p.z), false);
    }
    this.onTreeCount?.(this.grownTrees.length);
  }

  public getGrownTreePositions() {
    return this.grownTrees
      .filter((t) => !t.destroyed)
      .map((t) => {
        // Save/load stores position but not tree rotation. A fallen tree's authored
        // base pivot can sit well above the floor, so persisting that raw Y and then
        // reloading an UPRIGHT model recreates a floating tree. Persist the physical
        // support height instead; current X/Z still follow wherever the tree landed.
        const body = this.dynamicPropBody(t);
        const supportY = this.propSupportHeight(body, body.minY + 0.25);
        return { x: t.mesh.position.x, y: supportY, z: t.mesh.position.z };
      });
  }

  /** Poliwag's literal water pistol. Returns number of NPCs/objects affected this frame. */
  public sprayWater(origin: THREE.Vector3, forward: THREE.Vector3, dt: number): number {
    const flatForward = forward.clone().setY(0);
    if (flatForward.lengthSq() < 0.0001) flatForward.set(0, 0, 1);
    flatForward.normalize();

    // Poliwag's visible gun is held in the right hand. Offset the stream so it
    // actually starts at the pistol rather than magically coming from his belly.
    const right = new THREE.Vector3(flatForward.z, 0, -flatForward.x);
    const sprayOrigin = origin.clone()
      .addScaledVector(right, 0.92)
      .addScaledVector(flatForward, 0.72)
      .add(new THREE.Vector3(0, 1.04, 0));
    const sprayDirection = flatForward.clone().add(new THREE.Vector3(0, -0.025, 0)).normalize();
    const sprayEnd = sprayOrigin.clone().addScaledVector(sprayDirection, 8.2);

    this.particles.emitWaterSpray(sprayOrigin, sprayDirection, 26);
    const now = performance.now() * 0.001;
    if (now - this.lastWaterSfx > 0.22) {
      playSoundEffect('water');
      this.lastWaterSfx = now;
    }

    let affected = 0;
    for (const npc of this.npcs.getNPCsInRadius(origin, 9.2)) {
      const chest = npc.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
      if (distanceToSegment(chest, sprayOrigin, sprayEnd) <= 1.05) {
        const extinguished = this.npcs.applyWaterHit(npc, origin);
        if (extinguished) this.particles.emitSteam(chest);
        affected++;
      }
    }

    // Water extinguishes the exact same burning world state Charmander creates.
    for (const prop of this.destructibles) {
      if (!prop.isBurning) continue;
      const target = prop.mesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.65, 0));
      if (distanceToSegment(target, sprayOrigin, sprayEnd) <= 1.25) {
        prop.isBurning = false;
        prop.burnTimer = 0;
        this.particles.emitSteam(target);
        affected++;
      }
    }
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const fire = this.fireZones[i];
      const target = fire.position.clone().add(new THREE.Vector3(0, 0.3, 0));
      if (distanceToSegment(target, sprayOrigin, sprayEnd) <= 1.2) {
        this.particles.emitSteam(target);
        this.scene.remove(fire.marker);
        disposeTransientObject3D(fire.marker);
        this.fireZones.splice(i, 1);
        affected++;
      }
    }

    // Tree growth still targets the grass in front of Poliwag rather than the
    // elevated visual beam. The exact authored-surface check prevents trees from
    // growing through roads, floors or bridge decks.
    const target = origin.clone().addScaledVector(flatForward, 5.2);
    target.y = this.collision.getGroundHeightNear(target.x, target.z, origin.y, 0.12, 0.7, 3.0);
    if (!this.collision.isOnAuthoredSurface(target.x, target.z)) this.waterGrass(target, dt);

    return affected;
  }

  private waterGrass(target: THREE.Vector3, dt: number) {
    const qx = Math.round(target.x / 2) * 2;
    const qz = Math.round(target.z / 2) * 2;
    const key = `${qx}:${qz}`;
    let spot = this.growthSpots.get(key);
    if (!spot) {
      const wetMat = new THREE.MeshBasicMaterial({
        color: 0x315f50,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      });
      const wetDisc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 18), wetMat);
      wetDisc.rotation.x = -Math.PI / 2;
      wetDisc.position.set(qx, target.y + 0.018, qz);
      this.scene.add(wetDisc);
      spot = {
        key,
        position: new THREE.Vector3(qx, target.y, qz),
        waterSeconds: 0,
        growSeconds: 0,
        wetDisc,
        tree: null,
        complete: false,
      };
      this.growthSpots.set(key, spot);
    }
    if (spot.complete) return;
    spot.waterSeconds += dt;
    const wetMat = spot.wetDisc.material as THREE.MeshBasicMaterial;
    wetMat.opacity = THREE.MathUtils.clamp(0.3 + spot.waterSeconds * 0.15, 0.3, 0.72);

    // After a couple seconds the soil 'bulges' and a tiny tree begins emerging.
    if (spot.waterSeconds >= 1.8 && !spot.tree) {
      const tree = createOakTreeModel();
      tree.position.copy(spot.position);
      tree.scale.setScalar(0.025);
      tree.userData.playerGrownTree = true;
      this.scene.add(tree);
      spot.tree = tree;
      playSoundEffect('treeGrow');
    }
  }

  /** Charmander fire breath. Returns number of affected entities. */
  public sprayFire(origin: THREE.Vector3, forward: THREE.Vector3, dt: number): number {
    const mouth = origin.clone().add(new THREE.Vector3(0, 1.0, 0));
    this.particles.emitFire(mouth, forward.clone().add(new THREE.Vector3(0, 0.04, 0)).normalize());
    let affected = 0;

    const fireTarget = origin.clone().addScaledVector(forward.clone().setY(0).normalize(), 4.6);
    fireTarget.y = this.collision.getGroundHeightNear(fireTarget.x, fireTarget.z, origin.y, origin.y, 0.8, 3.0);

    for (const npc of this.npcs.getNPCsInRadius(origin, 8)) {
      if (isInForwardCone(origin, forward, npc.mesh.position, 7.5, 0.58)) {
        this.npcs.applyFireHit(npc, origin);
        this.npcs.panicNear(npc.mesh.position, 2.5, 'fire');
        affected++;
      }
    }

    for (const prop of this.destructibles) {
      const propWorld = prop.mesh.getWorldPosition(new THREE.Vector3());
      if (!prop.destroyed && isInForwardCone(origin, forward, propWorld, 7, 0.58)) {
        prop.isBurning = true;
        prop.burnTimer = 7;
        affected++;
      }
    }

    const now = performance.now() * 0.001;
    if (!this.collision.isOnAuthoredSurface(fireTarget.x, fireTarget.z) && now - this.lastFireSeed > 0.45) {
      const tooClose = this.fireZones.some((f) => planarDistance(f.position, fireTarget) < 2.0);
      if (!tooClose) {
        const marker = new THREE.Mesh(
          new THREE.CircleGeometry(0.8, 14),
          new THREE.MeshBasicMaterial({ color: 0x2a1a12, transparent: true, opacity: 0.78, depthWrite: false })
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.copy(fireTarget).add(new THREE.Vector3(0, 0.022, 0));

        const flameMat = new THREE.MeshBasicMaterial({
          color: 0xff5a00,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.15, 7), flameMat);
        flame.position.set(0, 0.58, 0);
        flame.name = 'world_fire_flame';
        marker.add(flame);

        this.scene.add(marker);
        this.fireZones.push({ id: `fire_${now}`, position: fireTarget.clone(), timer: 6.5, marker });
        this.lastFireSeed = now;
      }
    }
    this.npcs.panicNear(fireTarget, 5, 'fire');
    return affected;
  }

  public electricBurst(origin: THREE.Vector3, vehicles: Vehicle[]): number {
    this.particles.emitElectricity(origin.clone().add(new THREE.Vector3(0, 0.8, 0)), 7);
    playSoundEffect('thunder');
    let hits = 0;
    for (const npc of this.npcs.getNPCsInRadius(origin, 7)) {
      this.npcs.applyElectricHit(npc, origin);
      hits++;
    }
    const now = performance.now() * 0.001;
    for (const vehicle of vehicles) {
      if (vehicle.mesh.position.distanceTo(origin) <= 8) {
        vehicle.mesh.userData.disabledUntil = now + 3.5;
        vehicle.mesh.traverse((o) => {
          if (o instanceof THREE.Light) o.intensity *= 0.25;
        });
        hits++;
      }
    }
    return hits;
  }

  /**
   * Player movement stomp impact. This is intentionally smaller than Geodude's
   * combat Ground Slam: nearby characters and genuinely loose street props react,
   * but hero cars/buildings/permanent scenery are not launched by normal movement.
   */
  public playerStompImpact(origin: THREE.Vector3): number {
    const impact = origin.clone().add(new THREE.Vector3(0, 0.16, 0));
    this.particles.emitCrashBurst(impact, 1.55);
    this.particles.emitRecallSpark(impact, 0xffd36a);
    playSoundEffect('stomp');

    let hits = 0;
    for (const npc of this.npcs.getNPCsInRadius(origin, 5.4)) {
      if (Math.abs(npc.mesh.position.y - origin.y) > 3.0) continue;
      const direction = npc.mesh.position.clone().sub(origin).setY(0);
      // A movement stomp is a real player attack, not just visual knockback. It
      // damages characters and records player aggression so powered NPCs can use
      // their normal one-shot revenge response. Keep it weaker than Geodude's
      // dedicated Ground Slam special, but strong enough to be useful and funny.
      this.npcs.applyMeleeHit(npc, {
        source: origin.clone(),
        direction,
        horizontalForce: 12.5,
        verticalForce: 6.8,
        damage: 30,
        style: 'slam',
        attackerName: 'Stomp',
        color: 0xffd36a,
        playImpactSound: false,
      });
      hits++;
    }

    const looseTypes = new Set<DestructibleProp['type']>(['hydrant', 'mailbox', 'cone', 'bench', 'bin', 'sign', 'donut_box']);
    for (const prop of this.destructibles) {
      if (prop.destroyed || !looseTypes.has(prop.type)) continue;
      const propWorld = prop.mesh.getWorldPosition(new THREE.Vector3());
      if (planarDistance(origin, propWorld) > 5.7 || Math.abs(propWorld.y - origin.y) > 3.0) continue;
      const away = propWorld.clone().sub(origin).setY(0);
      const distance = Math.max(0.05, away.length());
      if (away.lengthSq() < 0.001) away.copy(this.propPreferredRestAxis(prop));
      away.normalize();
      const falloff = THREE.MathUtils.clamp(1 - distance / 7.0, 0.18, 1);
      const horizontalForce = 9.5 + 5.0 * falloff;
      const verticalForce = 5.6 + 2.7 * falloff;
      const launched = this.launchDestructible(
        prop,
        away.multiplyScalar(horizontalForce).setY(verticalForce),
        0.32,
        0.5,
        { source: origin, impactPoint: propWorld.clone(), applyMassResponse: true, kind: 'power', playerCaused: true }
      );
      if (launched) hits++;
    }
    return hits;
  }

  public groundSlam(origin: THREE.Vector3, vehicles: Vehicle[]): number {
    this.particles.emitElectricity(origin.clone().add(new THREE.Vector3(0, 0.3, 0)), 10);
    playSoundEffect('crash');
    let hits = 0;
    for (const npc of this.npcs.getNPCsInRadius(origin, 9)) {
      this.npcs.blastNPC(npc, origin, 24, 13, true);
      hits++;
    }
    for (const prop of this.destructibles) {
      if (prop.destroyed) continue;
      const propWorld = prop.mesh.getWorldPosition(new THREE.Vector3());
      if (planarDistance(origin, propWorld) > 9) continue;
      const away = propWorld.clone().sub(origin).setY(0);
      const distance = Math.max(0.05, away.length());
      if (away.lengthSq() < 0.001) away.copy(this.propPreferredRestAxis(prop));
      away.normalize();
      const falloff = THREE.MathUtils.clamp(1 - distance / 10.5, 0.16, 1);
      const horizontalForce = 16.5 + 7.0 * falloff;
      const verticalForce = 9.0 + 4.0 * falloff;
      const launched = this.launchDestructible(
        prop,
        away.multiplyScalar(horizontalForce).setY(verticalForce),
        0.36,
        0.72,
        { source: origin, impactPoint: propWorld.clone(), applyMassResponse: true, kind: 'power', playerCaused: true }
      );
      if (launched) hits++;
    }
    for (const v of vehicles) {
      const d = planarDistance(origin, v.mesh.position);
      if (d > 8 || v.isHeroCar) continue;
      const away = v.mesh.position.clone().sub(origin).setY(0).normalize();
      v.mesh.position.addScaledVector(away, 1.5);
      v.mesh.rotation.z += (Math.random() - 0.5) * 0.35;
      v.speed *= 0.5;
      hits++;
    }
    return hits;
  }


  /** Shared Hit & Run crime weighting for destructible street props. Tiny clutter
   * should barely move the meter compared with people, cars or substantial objects.
   * addWanted() converts a weight of 1.0 into 9 visible heat points, so 1/3 = 3. */
  public wantedWeightForDestructibleType(type: DestructibleProp['type']): number {
    return type === 'cone' || type === 'fence' || type === 'mailbox' ? 1 / 3 : 1;
  }

  /** Hit props/trees with a moving car. Returns physical hit count separately from Hit & Run weight. */
  public hitDestructiblesFromCar(
    carPos: THREE.Vector3,
    speed: number,
    forward: THREE.Vector3
  ): { hitCount: number; wantedWeight: number } {
    // Loaded baggage carriers should start rolling even from a slow parking/tarmac
    // shove. Other scenery keeps the existing ~5 u/s vehicle-impact threshold.
    if (Math.abs(speed) < 2.0) return { hitCount: 0, wantedWeight: 0 };
    let hitCount = 0;
    let wantedWeight = 0;
    const worldPos = new THREE.Vector3();
    for (const prop of this.destructibles) {
      if (prop.destroyed) continue;
      if (Math.abs(speed) < 5 && prop.type !== 'baggage_cart') continue;
      prop.mesh.getWorldPosition(worldPos);
      const hitRadius =
        prop.type === 'tree' ? 3.15 :
        prop.type === 'fence' ? 3.0 :
        prop.type === 'baggage_cart' ? 3.35 :
        prop.type === 'lamp' ? 2.55 : 2.0;
      if (planarDistance(carPos, worldPos) > hitRadius) continue;
      // Linear force follows the vehicle's ACTUAL signed momentum. Reverse impacts
      // therefore launch backward too. A small contact-normal blend makes glancing
      // hits peel props away from the bodywork without ever reversing the force.
      const momentumDir = forward.clone().multiplyScalar(Math.sign(speed) || 1).setY(0);
      if (momentumDir.lengthSq() < 0.001) momentumDir.set(0, 0, 1);
      momentumDir.normalize();
      const contactNormal = worldPos.clone().sub(carPos).setY(0);
      if (contactNormal.lengthSq() < 0.001) contactNormal.copy(momentumDir);
      contactNormal.normalize();
      const impactDir = momentumDir.clone().multiplyScalar(0.88).addScaledVector(contactNormal, 0.12).normalize();
      // Never allow contact geometry to turn a forward impact into a backwards launch.
      if (impactDir.dot(momentumDir) < 0.72) impactDir.copy(momentumDir);

      const launch = prop.type === 'tree'
        ? Math.min(36, 12 + Math.abs(speed) * 0.88)
        : prop.type === 'baggage_cart'
          ? Math.min(12.5, 2.8 + Math.abs(speed) * 0.38)
          : Math.min(35, Math.abs(speed) * 0.95);
      const impactPoint = worldPos.clone().setY(carPos.y + (prop.type === 'tree' || prop.type === 'lamp' ? 0.55 : prop.type === 'baggage_cart' ? 0.72 : 0.42));
      const launched = this.launchDestructible(
        prop,
        impactDir.multiplyScalar(launch).setY(prop.type === 'tree' ? 8.4 : prop.type === 'baggage_cart' ? 1.9 : 6),
        0.62,
        0.72,
        { source: carPos, impactPoint, applyMassResponse: true, kind: 'vehicle', playerCaused: true }
      );
      if (!launched) continue;
      playSoundEffect('crash');
      hitCount++;
      wantedWeight += this.wantedWeightForDestructibleType(prop.type);
    }
    return { hitCount, wantedWeight };
  }


  /**
   * Aircraft use the same shared destructible bodies/colliders as cars and melee.
   * This is deliberately a PROP interaction pass, not an aircraft crash collision:
   * movable scenery absorbs an impulse and is then ignored by the aircraft's solid
   * world sweep, while buildings/terrain/vehicles remain authoritative obstacles.
   *
   * The footprint is swept with the same nose/wing/tail-style probe layout used by
   * AircraftController, so a wing can clip a fence or tree without requiring the
   * fuselage centre to pass directly through it.
   */
  public hitDestructiblesFromAircraft(
    start: THREE.Vector3,
    end: THREE.Vector3,
    velocity: THREE.Vector3,
    forward: THREE.Vector3,
    right: THREE.Vector3,
    aircraft: { id?: string; mass: number; wingspan: number; length: number; collisionRadius: number; gearHeight: number; kind?: string },
    playerCaused = false,
  ): { hitCount: number; speedLoss: number; contactFraction: number } {
    const speed = velocity.length();
    // Even a crawling/taxiing aircraft must be able to push a cone or trolley out
    // of the way.  Keep only a tiny dead-zone for numerical jitter.
    if (speed < 0.08) return { hitCount: 0, speedLoss: 0, contactFraction: 1 };

    const flatVelocity = velocity.clone().setY(0);
    if (flatVelocity.lengthSq() < 0.0001) flatVelocity.copy(forward).setY(0);
    if (flatVelocity.lengthSq() < 0.0001) flatVelocity.set(0, 0, 1);
    flatVelocity.normalize();

    const upVector = new THREE.Vector3().crossVectors(forward, right).normalize();
    const halfWing = aircraft.wingspan * 0.50;
    const probes = getAircraftCollisionProbes(aircraft);

    const source = start.clone().lerp(end, 0.5);
    const frameTravel = end.clone().sub(start);
    const travelPlanarLenSq = frameTravel.x * frameTravel.x + frameTravel.z * frameTravel.z;
    const massFactor = THREE.MathUtils.clamp(Math.sqrt(Math.max(0.2, aircraft.mass) / 1.05), 0.78, 1.85);

    let hitCount = 0;
    let speedLoss = 0;
    let earliestContactFraction = 1;
    const candidatePoint = new THREE.Vector3();
    const probeStart = new THREE.Vector3();
    const probeEnd = new THREE.Vector3();
    const closest = new THREE.Vector3();
    const contactNormal = new THREE.Vector3();
    const impactDir = new THREE.Vector3();

    for (const prop of this.destructibles) {
      if (prop.destroyed) continue;

      // Extremely cheap root-position broad phase first. dynamicPropBody() may need
      // a rendered Box3 for a tumbling prop, so never pay that cost for hundreds of
      // distant street props every aircraft frame.
      prop.mesh.getWorldPosition(candidatePoint);
      let centreT = 0;
      if (travelPlanarLenSq > 0.00001) {
        centreT = THREE.MathUtils.clamp(
          ((candidatePoint.x - start.x) * frameTravel.x + (candidatePoint.z - start.z) * frameTravel.z) / travelPlanarLenSq,
          0,
          1,
        );
      }
      closest.copy(start).lerp(end, centreT);
      const approximatePropRadius = prop.type === 'fence' ? 7.0
        : prop.type === 'baggage_cart' ? 3.5
        : prop.type === 'tree' ? 1.6
        : prop.type === 'lamp' || prop.type === 'sign' ? 1.25
        : 1.0;
      if (Math.hypot(candidatePoint.x - closest.x, candidatePoint.z - closest.z) > halfWing + approximatePropRadius + 2.0) continue;

      const body = this.dynamicPropBody(prop);
      const broadRadius = halfWing + body.radius + 2.0;
      if (Math.hypot(body.centerX - closest.x, body.centerZ - closest.z) > broadRadius) continue;

      let bestDistanceSq = Infinity;
      let bestContact: THREE.Vector3 | null = null;
      let bestContactFraction = 1;

      for (const probe of probes) {
        probeStart.copy(start)
          .addScaledVector(right, probe.local.x)
          .addScaledVector(upVector, probe.local.y)
          .addScaledVector(forward, probe.local.z);
        probeEnd.copy(end)
          .addScaledVector(right, probe.local.x)
          .addScaledVector(upVector, probe.local.y)
          .addScaledVector(forward, probe.local.z);

        const segment = probeEnd.clone().sub(probeStart);
        const segLenSq = segment.lengthSq();
        const propCentre = new THREE.Vector3(
          body.centerX,
          THREE.MathUtils.clamp((body.minY + body.maxY) * 0.5, Math.min(probeStart.y, probeEnd.y), Math.max(probeStart.y, probeEnd.y)),
          body.centerZ,
        );
        const t = segLenSq > 0.00001 ? THREE.MathUtils.clamp(propCentre.clone().sub(probeStart).dot(segment) / segLenSq, 0, 1) : 0;
        const pathPoint = probeStart.clone().lerp(probeEnd, t);
        const closestX = THREE.MathUtils.clamp(pathPoint.x, body.minX, body.maxX);
        const closestY = THREE.MathUtils.clamp(pathPoint.y, body.minY, body.maxY);
        const closestZ = THREE.MathUtils.clamp(pathPoint.z, body.minZ, body.maxZ);
        const dx = pathPoint.x - closestX;
        const dy = pathPoint.y - closestY;
        const dz = pathPoint.z - closestZ;
        const horizontalSq = dx * dx + dz * dz;
        const verticalDist = Math.abs(dy);

        // Precise 3D cylinder/disc probe check: horizontal distance must be within probe radius
        // and vertical clearance must be within probe half-height
        if (horizontalSq <= probe.radius * probe.radius && verticalDist <= probe.height * 0.5) {
          const totalDistSq = horizontalSq + verticalDist * verticalDist;
          if (totalDistSq < bestDistanceSq) {
            bestDistanceSq = totalDistSq;
            bestContactFraction = t;
            bestContact = new THREE.Vector3(closestX, closestY, closestZ);
          }
        }
      }
      if (!bestContact) continue;
      const propCentre = new THREE.Vector3(body.centerX, (body.minY + body.maxY) * 0.5, body.centerZ);
      contactNormal.copy(propCentre).sub(bestContact).setY(0);
      if (contactNormal.lengthSq() < 0.0001) contactNormal.copy(flatVelocity);
      contactNormal.normalize();
      impactDir.copy(flatVelocity).multiplyScalar(0.90).addScaledVector(contactNormal, 0.10).normalize();
      if (impactDir.dot(flatVelocity) < 0.78) impactDir.copy(flatVelocity);

      const isCart = prop.type === 'baggage_cart';
      const isTree = prop.type === 'tree';
      const isHeavy = isTree || prop.type === 'lamp' || isCart;
      const speedScaled = speed * (isCart ? 0.34 : isTree ? 0.60 : 0.68) * massFactor;
      const maxHorizontal = isCart ? 14.0 : isTree ? 30.0 : prop.type === 'cone' ? 34.0 : 32.0;
      const minHorizontal = isCart ? 2.0 : speed < 4 ? 1.4 : isHeavy ? 4.5 : 5.5;
      const horizontal = THREE.MathUtils.clamp(speedScaled + (isCart ? 1.4 : 2.8), minHorizontal, maxHorizontal);
      const lift = isCart
        ? THREE.MathUtils.clamp(0.45 + speed * 0.055, 0.45, 2.2)
        : isTree
          ? THREE.MathUtils.clamp(4.0 + speed * 0.16, 4.0, 9.5)
          : THREE.MathUtils.clamp(1.7 + speed * 0.13, 1.7, prop.type === 'cone' ? 7.2 : 6.2);

      const launchVelocity = impactDir.clone().multiplyScalar(horizontal).setY(lift);
      let launched = this.launchDestructible(
        prop,
        launchVelocity,
        0.34,
        isCart ? 0.24 : isTree ? 0.78 : 0.62,
        {
          source,
          impactPoint: bestContact,
          applyMassResponse: true,
          kind: 'aircraft',
          playerCaused,
        },
      );

      // A continuous low-speed push often happens inside the normal re-hit cooldown.
      // Cooldown may suppress another cartoon launch, but it must NEVER make the prop
      // temporarily rigid. Reinforce its existing velocity and wake state so it keeps
      // yielding away from landing gear / wing / fuselage contact.
      if (!launched) {
        this.scene.attach(prop.mesh);
        prop.mesh.userData.settled = false;
        prop.mesh.userData.settleSeconds = 0;
        prop.mesh.userData.physicsGroundContactSeconds = 0;
        if (!prop.velocity) prop.velocity = new THREE.Vector3();
        const pushDir = impactDir.clone().setY(0).normalize();
        const currentAlong = prop.velocity.x * pushDir.x + prop.velocity.z * pushDir.z;
        const desiredAlong = horizontal * (isCart ? 0.42 : 0.55);
        if (currentAlong < desiredAlong) prop.velocity.addScaledVector(pushDir, desiredAlong - currentAlong);
        prop.velocity.y = Math.max(prop.velocity.y, lift * (isCart ? 0.18 : 0.28));
        const angular = prop.mesh.userData.angularVelocity;
        if (angular instanceof THREE.Vector3) {
          angular.add(this.directionalAngularVelocity(prop, launchVelocity, isCart ? 0.10 : 0.20, {
            source, impactPoint: bestContact, kind: 'aircraft', playerCaused,
          }).multiplyScalar(0.18));
        }
        this.syncPropCollider(prop);
        launched = true;
      }

      const yieldProfile = this.aircraftSoftPropProfile(prop);
      const overlapBoost = bestContactFraction <= 0.055
        ? (yieldProfile.tier === 'very_light' ? 0.34 : yieldProfile.tier === 'light' ? 0.26 : 0.16)
        : 0;
      const requestedYield = THREE.MathUtils.clamp(
        yieldProfile.baseYield + speed * yieldProfile.speedYield + overlapBoost,
        yieldProfile.baseYield,
        yieldProfile.maxYield,
      );
      const yieldedDistance = this.yieldPropFromAircraft(prop, impactDir, requestedYield);
      const clearedImmediately = yieldedDistance >= Math.max(0.10, requestedYield * 0.46);

      // At taxi/low speed, successful same-frame prop depenetration is enough: the
      // aircraft keeps pushing naturally instead of stopping against the same fence
      // or trolley every frame. At higher speed retain one swept contact hold so the
      // launch is visibly a collision rather than a ghost-through. If clearance
      // fails against fixed architecture, also hold at contact and try again next tick.
      const fastContactHold = speed >= (isCart ? 9.0 : 7.5) && bestContactFraction > 0.055;
      if (!clearedImmediately || fastContactHold) {
        earliestContactFraction = Math.min(earliestContactFraction, bestContactFraction);
      }

      if (!launched && yieldedDistance <= 0.012) continue;
      hitCount++;
      // Lightweight clutter barely changes aircraft momentum. Trees/poles and loaded
      // baggage dollies provide a small readable bump, but never become crash damage.
      const lossFactor = prop.type === 'cone' ? 0.002
        : prop.type === 'mailbox' || prop.type === 'sign' ? 0.0045
        : prop.type === 'fence' ? 0.006
        : prop.type === 'lamp' ? 0.009
        : prop.type === 'tree' ? 0.014
        : isCart ? 0.012
        : 0.005;
      speedLoss += THREE.MathUtils.clamp(speed * lossFactor, 0.01, isHeavy ? 0.58 : 0.28);
    }

    // NPCs use the same swept 3D aircraft footprint. They are intentionally resolved
    // here, alongside movable props, because WorldInteractionManager already owns the
    // shared NPC impact/ragdoll language. This keeps the solid-building crash sweep
    // completely separate and unchanged.
    const sweepMid = start.clone().lerp(end, 0.5);
    const sweepLength = start.distanceTo(end);
    const nearbyNPCs = this.npcs.getNPCsInRadius(sweepMid, sweepLength * 0.5 + halfWing + 3.6);
    for (const npc of nearbyNPCs) {
      if (!npc.mesh.visible || npc.state === 'grabbed' || npc.mesh.userData.heldByPlayer) continue;
      const weight = Math.max(0.45, npc.combatWeight ?? npc.mesh.userData.combatWeight ?? 1);
      const npcRadius = THREE.MathUtils.clamp(0.42 + Math.sqrt(weight) * 0.11, 0.48, 1.05);
      const npcHeight = npc.state === 'kicked' || npc.state === 'knocked_out' || npc.state === 'recovering' || npc.state === 'defeated' || (npc.combatHp ?? 1) <= 0
        ? 0.95
        : THREE.MathUtils.clamp(1.55 + Math.sqrt(weight) * 0.28, 1.65, 2.65);
      const npcBottom = npc.mesh.position.y;
      const npcTop = npcBottom + npcHeight;

      let bestNpcT = 1;
      let bestNpcContact: THREE.Vector3 | null = null;
      for (const probe of probes) {
        probeStart.copy(start)
          .addScaledVector(right, probe.local.x)
          .addScaledVector(upVector, probe.local.y)
          .addScaledVector(forward, probe.local.z);
        probeEnd.copy(end)
          .addScaledVector(right, probe.local.x)
          .addScaledVector(upVector, probe.local.y)
          .addScaledVector(forward, probe.local.z);
        const dx = probeEnd.x - probeStart.x;
        const dz = probeEnd.z - probeStart.z;
        const planarLenSq = dx * dx + dz * dz;
        const t = planarLenSq > 0.00001
          ? THREE.MathUtils.clamp(((npc.mesh.position.x - probeStart.x) * dx + (npc.mesh.position.z - probeStart.z) * dz) / planarLenSq, 0, 1)
          : 0;
        const px = THREE.MathUtils.lerp(probeStart.x, probeEnd.x, t);
        const py = THREE.MathUtils.lerp(probeStart.y, probeEnd.y, t);
        const pz = THREE.MathUtils.lerp(probeStart.z, probeEnd.z, t);
        const combinedRadius = probe.radius + npcRadius;
        const pdx = npc.mesh.position.x - px;
        const pdz = npc.mesh.position.z - pz;
        if (pdx * pdx + pdz * pdz > combinedRadius * combinedRadius) continue;
        const clampedNpcY = THREE.MathUtils.clamp(py, npcBottom, npcTop);
        const verticalDist = Math.abs(py - clampedNpcY);
        if (verticalDist > probe.height * 0.5) continue;
        if (t < bestNpcT) {
          bestNpcT = t;
          bestNpcContact = new THREE.Vector3(px, clampedNpcY, pz);
        }
      }
      if (!bestNpcContact) continue;

      const impactDirection = flatVelocity.clone();
      const sourcePosition = start.clone().lerp(end, bestNpcT);

      // Separate the character BEFORE the ragdoll/knockdown state is applied.
      const immediateClearance = THREE.MathUtils.clamp(0.20 + speed * 0.035, 0.20, 0.84);
      let npcYielded = this.npcs.pushNPCFromPlayer(npc, sourcePosition, impactDirection, immediateClearance, true);
      if (npcYielded && immediateClearance > 0.40) {
        this.npcs.pushNPCFromPlayer(npc, sourcePosition, impactDirection, immediateClearance * 0.72, true);
      }

      this.npcs.applySecondaryImpact(npc, {
        sourceId: `aircraft:${aircraft.id ?? aircraft.kind ?? 'generic'}`,
        sourceKind: 'prop',
        sourcePosition,
        velocity: velocity.clone(),
        sourceMass: Math.max(1.4, aircraft.mass * 2.6),
        contactPoint: bestNpcContact,
        playerCaused,
      });

      // Preserve one-frame swept contact at meaningful speed, or whenever the NPC
      // could not find a valid displacement. At taxi speed a successful yield lets
      // the aircraft continue naturally instead of repeatedly pinning the pedestrian.
      if (!npcYielded || (speed >= 7.5 && bestNpcT > 0.055)) {
        earliestContactFraction = Math.min(earliestContactFraction, bestNpcT);
      }
      speedLoss += THREE.MathUtils.clamp(speed * 0.0018 * Math.sqrt(weight), 0.005, 0.16);
      hitCount++;
    }

    if (hitCount > 0) playSoundEffect('crash');
    return {
      hitCount,
      speedLoss: Math.min(speedLoss, Math.max(0.35, speed * 0.08)),
      contactFraction: earliestContactFraction,
    };
  }


  /** Police/AI vehicles use this narrower collision path so they can physically
   * knock over bins, signs and other loose street clutter without flattening whole
   * buildings/trees or accidentally creating player crime. */
  public hitLooseDestructiblesFromVehicle(
    carPos: THREE.Vector3,
    speed: number,
    forward: THREE.Vector3,
    maxHits = 2
  ): number {
    if (Math.abs(speed) < 4.5 || maxHits <= 0) return 0;
    const looseTypes = new Set<DestructibleProp['type']>([
      'hydrant', 'mailbox', 'cone', 'bench', 'bin', 'sign', 'donut_box'
    ]);
    let hits = 0;
    const worldPos = new THREE.Vector3();
    for (const prop of this.destructibles) {
      if (hits >= maxHits || prop.destroyed || !looseTypes.has(prop.type)) continue;
      prop.mesh.getWorldPosition(worldPos);
      const hitRadius = prop.type === 'bench' ? 2.25 : prop.type === 'hydrant' ? 1.85 : 1.65;
      if (planarDistance(carPos, worldPos) > hitRadius) continue;
      const away = forward.clone().multiplyScalar(Math.sign(speed) || 1).setY(0);
      if (away.lengthSq() < 0.001) away.set(0, 0, 1);
      away.normalize();
      const contactNormal = worldPos.clone().sub(carPos).setY(0);
      if (contactNormal.lengthSq() > 0.001) {
        contactNormal.normalize();
        away.multiplyScalar(0.90).addScaledVector(contactNormal, 0.10).normalize();
      }
      const impactPoint = worldPos.clone().setY(carPos.y + 0.42);
      const launched = this.launchDestructible(
        prop,
        away.multiplyScalar(Math.min(18, 6.5 + Math.abs(speed) * 0.42)).setY(4.8),
        0.58,
        0.48,
        { source: carPos, impactPoint, applyMassResponse: true }
      );
      if (launched) hits++;
    }
    if (hits > 0) playSoundEffect('crash');
    return hits;
  }

  /**
   * Lightweight loose props (the pink donut floaties) should behave like physical
   * clutter, not concrete bollards. Walking into them gently shoves/rolls them.
   */
  public pushLightweightProps(playerPos: THREE.Vector3, playerVelocity: THREE.Vector3, dt: number) {
    const planarSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
    // No shove is possible when the player is stationary. Avoid scanning the entire
    // destructible registry and allocating scratch vectors on every idle render frame.
    // Moving/falling props still use the normal WorldInteractionManager physics path.
    if (planarSpeed < 0.05) return;
    const worldPos = new THREE.Vector3();
    const away = new THREE.Vector3();
    for (const prop of this.destructibles) {
      if (prop.destroyed || prop.type !== 'donut_box') continue;
      prop.mesh.getWorldPosition(worldPos);
      const dx = worldPos.x - playerPos.x;
      const dz = worldPos.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 1.75 * 1.75) continue;

      away.set(dx, 0, dz);
      if (away.lengthSq() < 0.0001) away.set(-playerVelocity.z || 1, 0, playerVelocity.x || 0);
      away.normalize();
      // Direct shove while walking; no destroyed state, so the prop remains reusable.
      const shove = Math.max(1.8, planarSpeed * 0.62) * dt;
      prop.mesh.position.addScaledVector(away, shove);
      prop.mesh.rotation.y += dt * (2.5 + planarSpeed * 0.2);
      prop.mesh.rotation.z = Math.sin(performance.now() * 0.009 + prop.mesh.position.x) * 0.18;
      prop.position = { x: prop.mesh.position.x, y: prop.mesh.position.y, z: prop.mesh.position.z };
    }
  }
  public update(dt: number) {
    // Amortised sleeping-toppler support audit. Trees are the largest population,
    // but poles/signs/fences use the same validity rule now: a previously knocked
    // object may not remain asleep while floating or balanced upright/diagonally.
    // Keep the work budgeted so the greenery population cannot reintroduce hitches.
    this.treeSupportAuditTimer += dt;
    if (this.treeSupportAuditTimer >= 0.10 && this.destructibles.length) {
      this.treeSupportAuditTimer = 0;
      const total = this.destructibles.length;
      const maxEntriesVisited = Math.min(total, 12);
      let entriesVisited = 0;
      let expensiveTreeChecks = 0;
      while (entriesVisited < maxEntriesVisited && expensiveTreeChecks < 3) {
        if (this.treeSupportAuditCursor >= total) this.treeSupportAuditCursor = 0;
        const prop = this.destructibles[this.treeSupportAuditCursor++];
        entriesVisited++;
        if (!prop || prop.destroyed || !this.isToppleLike(prop) || prop.velocity) continue;
        expensiveTreeChecks++;

        const body = this.dynamicPropBody(prop);
        const support = this.propSupportHeight(body, body.minY + 0.25);
        const gap = body.minY - support;
        const knocked = prop.mesh.userData.physicsHasBeenKnocked === true || (prop.type === 'tree' && prop.mesh.userData.treeHasBeenKnocked === true);
        const restingAxisY = Math.abs(this.propUpAxisWorld(prop).y);
        const lyingLimit = Number(prop.mesh.userData.physicsLyingAxisY ?? (prop.type === 'fence' ? 0.22 : 0.16));
        const fenceFaceVertical = prop.type === 'fence' ? Math.abs(this.fenceFaceNormalWorld(prop).y) : 1;
        const fenceFaceLimit = prop.type === 'fence' ? this.fenceFlatFaceLimit(prop) : 0;
        // Do not let the audit bless a visibly raised edge. With a 1-degree active
        // rest target, only a tiny numerical allowance is appropriate here.
        const invalidFenceEdgeRest = prop.type === 'fence' && fenceFaceVertical < fenceFaceLimit - 0.00015;
        const invalidKnockedRest = knocked && (restingAxisY > lyingLimit + 0.035 || invalidFenceEdgeRest);
        if (gap > 0.10 || invalidKnockedRest) {
          this.scene.attach(prop.mesh);
          prop.mesh.userData.physicsCenterOfMass = this.propCenterOfMassWorld(prop);
          prop.mesh.userData.angularVelocity = new THREE.Vector3();
          prop.mesh.userData.settleSeconds = 0;
          prop.mesh.userData.physicsGroundContactSeconds = invalidKnockedRest ? 0.35 : 0;
          if (prop.type === 'tree') prop.mesh.userData.treeGroundContactSeconds = invalidKnockedRest ? 0.35 : 0;
          prop.mesh.userData.settled = false;
          prop.velocity = new THREE.Vector3();
          this.syncPropCollider(prop);
        } else if (gap < -0.10) {
          if (prop.type === 'tree') {
            if (this.repairTreeSupport(prop, true)) this.syncPropCollider(prop);
          } else {
            prop.mesh.position.y += (support + 0.004) - body.minY;
            prop.position = { x: prop.mesh.position.x, y: prop.mesh.position.y, z: prop.mesh.position.z };
            this.syncPropCollider(prop);
          }
        }
      }
    }

    // Automatic seed -> sapling -> full tree growth once Poliwag has watered enough.
    for (const spot of this.growthSpots.values()) {
      if (!spot.tree || spot.complete) continue;
      spot.growSeconds += dt;
      const t = THREE.MathUtils.clamp(spot.growSeconds / 6.2, 0, 1);
      // Slow seed/sprout stage, then a satisfying final burst.
      const eased = t * t * (3 - 2 * t);
      const scale = THREE.MathUtils.lerp(0.025, 1, eased);
      spot.tree.scale.set(scale * (0.9 + 0.1 * t), scale, scale * (0.9 + 0.1 * t));
      if (t >= 1) {
        spot.complete = true;
        this.scene.remove(spot.wetDisc);
        disposeTransientObject3D(spot.wetDisc);
        this.spawnCompletedTree(spot.position, true, spot.tree);
      }
    }

    // Burning props and grass patches.
    for (const prop of this.destructibles) {
      if (!prop.isBurning || prop.destroyed) continue;
      prop.burnTimer = Math.max(0, (prop.burnTimer ?? 0) - dt);
      const burnWorld = prop.mesh.getWorldPosition(new THREE.Vector3());
      this.particles.emitFire(burnWorld.clone().add(new THREE.Vector3(0, 0.45, 0)), new THREE.Vector3(0, 1, 0), 1.7, 10);
      this.npcs.panicNear(burnWorld, 4.5, 'fire');
      if ((prop.burnTimer ?? 0) <= 0) prop.isBurning = false;
    }

    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const zone = this.fireZones[i];
      zone.timer -= dt;
      const flame = zone.marker.getObjectByName('world_fire_flame');
      if (flame) {
        const pulse = 0.85 + Math.sin(performance.now() * 0.018 + i) * 0.18;
        flame.scale.set(pulse, 0.9 + pulse * 0.25, pulse);
        flame.rotation.y += dt * 2.5;
      }
      this.particles.emitFire(zone.position.clone().add(new THREE.Vector3(0, 0.12, 0)), new THREE.Vector3(0, 1, 0), 1.4, 8);
      if (zone.timer <= 0) {
        this.scene.remove(zone.marker);
        disposeTransientObject3D(zone.marker);
        this.fireZones.splice(i, 1);
      }
    }

    // Cartoon prop flight after kicks, Geodude shockwaves, or car impacts.
    // The visible mesh AND its interactive collider stay alive throughout motion.
    //
    // IMPORTANT: this is a 3D continuous-ish sweep, not a destination-only move.
    // Substep count includes both linear travel and tumble arc travel, so a prop
    // cannot cross a thin wall/floor between low-FPS frames simply because its root
    // jumped from one side to the other.  The dynamic collision body is rebuilt from
    // the CURRENT visible bounds while awake, so a fallen tree/pole is no longer
    // represented by an upright capsule at its original pivot.
    const movedPropsToSync: DestructibleProp[] = [];
    // A large aircraft/Geodude chain reaction can wake dozens of props at once. The old
    // fixed 72-substep ceiling allowed one bad frame to generate thousands of expensive
    // bounds/collision queries, which then made the NEXT frame slower again. Preserve
    // continuous collision, but lower per-prop precision progressively only while many
    // bodies are simultaneously awake. Normal one/few-object interactions keep the
    // highest precision; large chaos events stay bounded instead of freezing the tab.
    let awakePropCount = 0;
    for (const candidate of this.destructibles) {
      if (!candidate.destroyed && candidate.velocity) awakePropCount++;
    }
    this.debugAwakePropCount = awakePropCount;
    this.debugPropSubsteps = 0;
    const maxSubstepsPerProp = awakePropCount <= 6
      ? 32
      : awakePropCount <= 12
        ? 20
        : awakePropCount <= 24
          ? 12
          : awakePropCount <= 40
            ? 8
            : 6;

    for (const prop of this.destructibles) {
      if (prop.destroyed || !prop.velocity) continue;

      const isTree = prop.type === 'tree';
      const isPole = this.isPoleLike(prop);
      const isTopple = this.isToppleLike(prop);
      prop.velocity.x = THREE.MathUtils.clamp(prop.velocity.x, -38, 38);
      prop.velocity.z = THREE.MathUtils.clamp(prop.velocity.z, -38, 38);
      prop.velocity.y = THREE.MathUtils.clamp(prop.velocity.y, -30, 18);
      if (prop.mesh.position.y > 55) prop.velocity.y = Math.min(prop.velocity.y, -13);

      let angular = prop.mesh.userData.angularVelocity instanceof THREE.Vector3
        ? prop.mesh.userData.angularVelocity as THREE.Vector3
        : new THREE.Vector3(4.2, 1.1, 3.6);
      prop.mesh.userData.angularVelocity = angular;

      if (isTopple && !(prop.mesh.userData.physicsCenterOfMass instanceof THREE.Vector3)) {
        prop.mesh.userData.physicsCenterOfMass = this.propCenterOfMassWorld(prop);
      }

      const initialBody = this.dynamicPropBody(prop);
      const frameLinearVelocity = prop.velocity.clone();
      const frameAngularVelocity = angular.clone();
      const linearTravel = prop.velocity.length() * dt;
      const angularTravel = angular.length() * Math.min(3.0, Math.max(initialBody.radius, initialBody.height * 0.45)) * dt;
      // Continuous/sub-stepped collision remains enabled, but use an adaptive work
      // ceiling so a pile of simultaneously tumbling scenery cannot monopolise the
      // main thread. Translational travel remains the safety priority; angular-only
      // tumble precision is what degrades first during unusually large chaos events.
      const desiredSubsteps = Math.max(1, Math.ceil((linearTravel + angularTravel) / 0.20));
      const linearSafetySteps = Math.max(1, Math.ceil(linearTravel / 0.30));
      const substeps = Math.max(1, Math.min(maxSubstepsPerProp, Math.max(linearSafetySteps, desiredSubsteps)));
      this.debugPropSubsteps += substeps;
      const stepDt = dt / substeps;
      const colliderId = `prop_${prop.id}`;
      let touchedGround = false;
      let touchedWall = false;

      for (let step = 0; step < substeps; step++) {
        if (!prop.velocity) break;

        const before = this.dynamicPropBody(prop);
        const rootBefore = prop.mesh.position.clone();
        const comBefore = isTopple && prop.mesh.userData.physicsCenterOfMass instanceof THREE.Vector3
          ? (prop.mesh.userData.physicsCenterOfMass as THREE.Vector3).clone()
          : null;

        // Gravity is active for the ENTIRE awake reaction. Slightly softer than
        // real-world gravity acceleration in game units so the exaggerated launch is
        // readable, but never disabled while an object is airborne or balancing.
        const gravity = isTree ? 19.2 : isTopple ? 18.8 : 18.0;
        prop.velocity.y = Math.max(-30, prop.velocity.y - gravity * stepDt);

        if (isTopple) {
          // All tall/flat knockables use quaternion integration around a persistent
          // body centre of mass. This is the same physical philosophy as trees and
          // prevents poles/fences from orbiting around an authored ground pivot.
          const angularSpeed = angular.length();
          if (angularSpeed > 0.00001) {
            const spinAxis = angular.clone().multiplyScalar(1 / angularSpeed);
            const dq = new THREE.Quaternion().setFromAxisAngle(spinAxis, angularSpeed * stepDt);
            prop.mesh.quaternion.premultiply(dq).normalize();
          }

          const com = prop.mesh.userData.physicsCenterOfMass as THREE.Vector3;
          com.addScaledVector(prop.velocity, stepDt);
          this.setPropRootFromCenterOfMass(prop, com);

          if (isTree || isPole || prop.type === 'mailbox') {
            // Trees, poles and mailboxes use several probes along the actual main axis.
            const sweep = this.resolveAxisPropWorldSweep(prop, before, colliderId);
            if (sweep.hitX) prop.velocity.x *= isTree ? -0.18 : prop.type === 'mailbox' ? -0.17 : -0.20;
            if (sweep.hitZ) prop.velocity.z *= isTree ? -0.18 : prop.type === 'mailbox' ? -0.17 : -0.20;
            if (sweep.collided) {
              touchedWall = true;
              prop.mesh.userData.lastLaunchDirection = undefined;
              angular.multiplyScalar(isTree ? 0.76 : prop.type === 'mailbox' ? 0.82 : 0.79);
            }
          } else {
            // Fence panels keep their full visible rectangular collision rather
            // than pretending to be a pole. Resolve only the translation correction
            // here; rotation already happened around the shared COM above.
            const desiredBody = this.dynamicPropBody(prop);
            const from = new THREE.Vector3(before.centerX, before.minY, before.centerZ);
            const to = new THREE.Vector3(desiredBody.centerX, desiredBody.minY, desiredBody.centerZ);
            const fenceLaunchGrace = prop.type === 'fence'
              && performance.now() * 0.001 < Number(prop.mesh.userData.physicsFenceLaunchGraceUntil ?? 0);
            // The normal full-panel circle is intentionally conservative, but while
            // the panel is still inside its authored fence run that large radius can
            // overlap the neighbouring interactive sections and pin the kick in place.
            // Use a short, compact break-away sweep until the panel has separated.
            const sweepRadius = fenceLaunchGrace ? Math.min(desiredBody.radius, 0.72) : desiredBody.radius;
            const sweepHeight = fenceLaunchGrace ? Math.min(desiredBody.height, 1.45) : desiredBody.height;
            const resolved = this.collision.resolveCollision(
              from, to, sweepRadius, sweepHeight,
              (collider) => collider.id === colliderId || (fenceLaunchGrace && collider.collisionRole === 'interactive'),
              false,
              true
            );
            const correction = new THREE.Vector3(resolved.position.x - to.x, 0, resolved.position.z - to.z);
            if (Math.abs(correction.x) > 0.006) prop.velocity.x *= -0.20;
            if (Math.abs(correction.z) > 0.006) prop.velocity.z *= -0.20;
            if (correction.lengthSq() > 0.00002 || resolved.collided) {
              this.applyPropWorldCorrection(prop, correction);
              touchedWall = true;
              prop.mesh.userData.lastLaunchDirection = undefined;
              angular.multiplyScalar(0.78);
            }
          }
        } else {
          // Compact props may tumble freely into any stable orientation. Keep the
          // inexpensive visible-bounds sweep, but use quaternion angular integration
          // so their motion is frame-rate independent and gimbal-free too.
          const angularSpeed = angular.length();
          if (angularSpeed > 0.00001) {
            const spinAxis = angular.clone().multiplyScalar(1 / angularSpeed);
            const dq = new THREE.Quaternion().setFromAxisAngle(spinAxis, angularSpeed * stepDt);
            prop.mesh.quaternion.premultiply(dq).normalize();
          }

          const rotatedBefore = this.dynamicPropBody(prop);
          const centerOffsetX = rotatedBefore.centerX - rotatedBefore.root.x;
          const centerOffsetZ = rotatedBefore.centerZ - rotatedBefore.root.z;
          const bottomOffset = rotatedBefore.minY - rotatedBefore.root.y;
          const currentBodyPos = new THREE.Vector3(rotatedBefore.centerX, rotatedBefore.minY, rotatedBefore.centerZ);
          const desiredBodyPos = currentBodyPos.clone().addScaledVector(prop.velocity, stepDt);
          const resolved = this.collision.resolveCollision(
            currentBodyPos, desiredBodyPos, rotatedBefore.radius, rotatedBefore.height,
            (collider) => collider.id === colliderId
          );
          const hitX = Math.abs(resolved.position.x - desiredBodyPos.x) > 0.006;
          const hitZ = Math.abs(resolved.position.z - desiredBodyPos.z) > 0.006;
          if (hitX) prop.velocity.x *= -0.22;
          if (hitZ) prop.velocity.z *= -0.22;
          if (hitX || hitZ || resolved.collided) {
            touchedWall = true;
            prop.mesh.userData.lastLaunchDirection = undefined;
            angular.multiplyScalar(0.84);
          }
          prop.mesh.position.set(
            resolved.position.x - centerOffsetX,
            resolved.position.y - bottomOffset,
            resolved.position.z - centerOffsetZ
          );
        }

        let after = this.dynamicPropBody(prop);

        // FLOOR / ROOF-TOP CCD. Rotation and translation are both represented in
        // before/after, so a trunk tip that crosses the floor is resolved in the
        // same small substep rather than being allowed to penetrate then snap back.
        const support = this.propSupportHeight(after, Math.max(before.minY, after.minY) + 0.08);
        if (after.minY <= support + 0.015 && before.minY >= support - 0.10) {
          const lift = (support + 0.004) - after.minY;
          if (isTopple) this.applyPropWorldCorrection(prop, new THREE.Vector3(0, lift, 0));
          else prop.mesh.position.y += lift;

          const impactSpeed = Math.max(0, -prop.velocity.y);
          if (isTree) {
            const impacts = Number(prop.mesh.userData.treeGroundImpacts ?? 0) + (impactSpeed > 0.8 ? 1 : 0);
            prop.mesh.userData.treeGroundImpacts = impacts;
            const restitution = impacts <= 1 ? 0.12 : 0.065;
            prop.velocity.y = impactSpeed > 1.15 ? Math.min(2.65, impactSpeed * restitution) : 0;
          } else if (isTopple) {
            const restitution = prop.type === 'fence' ? 0.10 : prop.type === 'mailbox' ? 0.105 : 0.12;
            prop.velocity.y = impactSpeed > 1.0 ? Math.min(3.0, impactSpeed * restitution) : 0;
            angular.multiplyScalar(0.90);
          } else {
            prop.velocity.y = impactSpeed > 1.0 ? Math.min(4.2, impactSpeed * 0.15) : 0;
          }
          touchedGround = true;
          after = this.dynamicPropBody(prop);
        } else if (after.minY < support - 0.10) {
          const lift = (support + 0.004) - after.minY;
          if (isTopple) this.applyPropWorldCorrection(prop, new THREE.Vector3(0, lift, 0));
          else prop.mesh.position.y += lift;
          if (prop.velocity.y < 0) {
            prop.velocity.y = isTree
              ? Math.min(1.25, Math.abs(prop.velocity.y) * 0.055)
              : isTopple
                ? Math.min(1.8, Math.abs(prop.velocity.y) * 0.07)
                : Math.min(2.8, Math.abs(prop.velocity.y) * 0.10);
          }
          touchedGround = true;
          after = this.dynamicPropBody(prop);
        }

        // Ceiling / roof underside CCD.
        if (prop.velocity.y > 0.01) {
          const predictedRise = Math.abs(prop.velocity.y * stepDt) + Math.abs(after.maxY - before.maxY);
          const ceiling = this.propCeilingHeight(after, before.maxY, predictedRise);
          if (ceiling !== null && after.maxY >= ceiling - 0.012 && before.maxY <= ceiling + 0.10) {
            const drop = after.maxY - (ceiling - 0.004);
            if (isTopple) this.applyPropWorldCorrection(prop, new THREE.Vector3(0, -drop, 0));
            else prop.mesh.position.y -= drop;
            const ceilingBounce = isTopple ? 0.13 : 0.18;
            prop.velocity.y = -Math.max(0.7, Math.min(isTopple ? 2.8 : 4.0, prop.velocity.y * ceilingBounce));
            touchedWall = true;
            angular.multiplyScalar(isTopple ? 0.80 : 0.86);
          }
        }

        // Fresh kicks continue generally away from the source until a genuine
        // environment impact redirects them.
        if (!touchedWall && prop.mesh.userData.lastLaunchDirection instanceof THREE.Vector3) {
          const launchDir = prop.mesh.userData.lastLaunchDirection as THREE.Vector3;
          const along = prop.velocity.x * launchDir.x + prop.velocity.z * launchDir.z;
          if (along < 0) {
            prop.velocity.x -= launchDir.x * along;
            prop.velocity.z -= launchDir.z * along;
          }
        }

        // Corruption guard: restore this exact local substep, not a distant spawn.
        if (!Number.isFinite(prop.mesh.position.x) || !Number.isFinite(prop.mesh.position.y) || !Number.isFinite(prop.mesh.position.z)) {
          prop.mesh.position.copy(rootBefore);
          if (isTopple && comBefore) prop.mesh.userData.physicsCenterOfMass = comBefore;
          prop.velocity.set(0, 0, 0);
          angular.set(0, 0, 0);
          touchedGround = true;
          break;
        }
      }

      if (!prop.velocity) continue;

      const finalBody = this.dynamicPropBody(prop);
      this.resolveMovingPropNPCImpacts(prop, initialBody, finalBody, frameLinearVelocity, frameAngularVelocity);
      const support = this.propSupportHeight(finalBody, finalBody.minY + 0.18);
      const supportGap = finalBody.minY - support;
      const supportedNow = supportGap >= -0.08 && supportGap <= 0.060;

      if (isTopple) {
        const airborne = !supportedNow || prop.velocity.y > 0.55;
        if (airborne) {
          // Gravity remains active in the substep loop above. Only mild aerodynamic
          // damping is applied here so a launched object never freezes in mid-air.
          const airLinear = Math.exp(-(isTree ? 0.16 : 0.20) * dt);
          prop.velocity.x *= airLinear;
          prop.velocity.z *= airLinear;
          this.dampPropAngular(prop, dt, false, false);
          prop.mesh.userData.settleSeconds = 0;
          prop.mesh.userData.physicsGroundContactSeconds = 0;
          if (isTree) prop.mesh.userData.treeGroundContactSeconds = 0;
        } else {
          const contactSeconds = Number(prop.mesh.userData.physicsGroundContactSeconds ?? 0) + dt;
          prop.mesh.userData.physicsGroundContactSeconds = contactSeconds;
          if (isTree) prop.mesh.userData.treeGroundContactSeconds = contactSeconds;

          // Shape-aware gravity torque. There is intentionally NO late quaternion
          // interpolation/snap here. A knocked tree/pole/sign/fence remains awake and
          // keeps receiving physical angular acceleration until its local up axis is
          // genuinely close to horizontal. The tiny minimum instability represents
          // imperfect real support and prevents impossible exact-upright balancing.
          const upAxis = this.propUpAxisWorld(prop);
          const axisVertical = Math.abs(upAxis.y);
          const lyingLimit = Number(prop.mesh.userData.physicsLyingAxisY ?? (isTree ? 0.13 : 0.16));
          const isFence = prop.type === 'fence';
          const fenceFaceNormal = isFence ? this.fenceFaceNormalWorld(prop) : null;
          const fenceFaceVertical = fenceFaceNormal ? Math.abs(fenceFaceNormal.y) : 1;
          const fenceFaceLimit = isFence ? this.fenceFlatFaceLimit(prop) : 0;
          const knocked = prop.mesh.userData.physicsHasBeenKnocked === true || (isTree && prop.mesh.userData.treeHasBeenKnocked === true);
          if (knocked && axisVertical > lyingLimit) {
            const horizontalTop = new THREE.Vector3(upAxis.x, 0, upAxis.z);
            const fallDirection = horizontalTop.lengthSq() > 0.004
              ? horizontalTop.normalize()
              : this.propPreferredRestAxis(prop);
            const gravityTipAxis = new THREE.Vector3(fallDirection.z, 0, -fallDirection.x)
              .multiplyScalar(Math.sign(upAxis.y) || 1);
            const lean = Math.sqrt(Math.max(0, 1 - axisVertical * axisVertical));
            const instability = Math.max(isTree ? 0.24 : 0.20, lean);
            const angularAccel = isTree ? 4.7 : prop.type === 'fence' ? 6.3 : prop.type === 'mailbox' ? 5.9 : 5.6;
            angular.addScaledVector(gravityTipAxis, angularAccel * instability * dt);
          }

          // A fence can reach the ground in many chaotic orientations. Driving the
          // final roll around its *long rail* only works when that rail itself is
          // already horizontal; after an in-plane tumble that assumption is false and
          // the panel can stall visibly propped up. Instead, use the actual broad-face
          // normal and continuously torque it toward the nearest vertical normal.
          // That is geometry-independent: whichever edge is currently supporting the
          // panel becomes the effective pivot and the visible XY panel approaches the
          // ground plane. This is a damped physical rotation, never a quaternion snap.
          if (knocked && isFence && fenceFaceNormal && fenceFaceVertical < fenceFaceLimit) {
            let faceTargetSign = Number(prop.mesh.userData.physicsFenceRestFaceSign ?? 0);
            if (faceTargetSign !== 1 && faceTargetSign !== -1) {
              if (Math.abs(fenceFaceNormal.y) >= 0.05) {
                faceTargetSign = Math.sign(fenceFaceNormal.y) || 1;
              } else {
                // An exact edge balance has two equally short ways down. Choose one
                // deterministically so there is no frame-to-frame/random jitter.
                let hash = 0;
                for (let i = 0; i < prop.id.length; i++) hash = ((hash * 31) + prop.id.charCodeAt(i)) | 0;
                faceTargetSign = (hash & 1) === 0 ? 1 : -1;
              }
              prop.mesh.userData.physicsFenceRestFaceSign = faceTargetSign;
            }

            const targetFaceNormal = new THREE.Vector3(0, faceTargetSign, 0);
            const correctionAxis = new THREE.Vector3().crossVectors(fenceFaceNormal, targetFaceNormal);
            const sinError = correctionAxis.length();
            if (sinError > 0.00001) {
              correctionAxis.multiplyScalar(1 / sinError);
              const cosError = THREE.MathUtils.clamp(fenceFaceNormal.dot(targetFaceNormal), -1, 1);
              const angleError = Math.acos(cosError);
              const angularTowardFlat = angular.dot(correctionAxis);

              // PD-style gravity/contact settling: strong enough to finish the last
              // visible few degrees, while braking as it reaches the floor so the
              // panel does not endlessly rock from face to face.
              const settleAccel = THREE.MathUtils.clamp(
                angleError * 13.5 - angularTowardFlat * 4.8,
                -9.0,
                14.0
              );
              angular.addScaledVector(correctionAxis, settleAccel * dt);

              // Suppress unrelated spin gradually while the broad face is trying to
              // settle. This keeps funny launch tumble intact but prevents a low-speed
              // yaw/twist component from holding one edge visibly in the air forever.
              const offAxis = angular.clone().addScaledVector(correctionAxis, -angular.dot(correctionAxis));
              angular.addScaledVector(offAxis, -Math.min(1, dt * 2.2));
            }
          }

          // Friction is exponential/frame-rate independent. Crucially it is weaker
          // while a toppling object is still visibly upright so damping cannot kill
          // the fall halfway through and leave a 45-degree frozen prop.
          const collapsed = axisVertical <= lyingLimit && (!isFence || fenceFaceVertical >= fenceFaceLimit);
          const groundRate = collapsed
            ? (isTree ? 3.35 : prop.type === 'fence' ? 4.0 : prop.type === 'mailbox' ? 3.45 : 3.65)
            : (isTree ? 2.20 : prop.type === 'fence' ? 2.45 : prop.type === 'mailbox' ? 1.95 : 2.30);
          const groundLinear = Math.exp(-groundRate * dt);
          prop.velocity.x *= groundLinear;
          prop.velocity.z *= groundLinear;
          if (Math.abs(prop.velocity.y) < (collapsed ? 0.24 : 0.34)) prop.velocity.y = 0;
          this.dampPropAngular(prop, dt, true, collapsed);

          const horizontalSq = prop.velocity.x * prop.velocity.x + prop.velocity.z * prop.velocity.z;
          const angularSpeed = angular.length();
          const stable = collapsed
            && horizontalSq < (isTree ? 0.12 : 0.16)
            && Math.abs(prop.velocity.y) < 0.26
            && angularSpeed < (prop.type === 'fence' ? 0.50 : prop.type === 'mailbox' ? 0.40 : 0.44);
          prop.mesh.userData.settleSeconds = stable
            ? Number(prop.mesh.userData.settleSeconds ?? 0) + dt
            : 0;

          if (Number(prop.mesh.userData.settleSeconds ?? 0) >= (prop.type === 'fence' ? 0.72 : prop.type === 'mailbox' ? 0.78 : 0.64)) {
            const settledBody = this.dynamicPropBody(prop);
            const settledSupport = this.propSupportHeight(settledBody, settledBody.minY + 0.18);
            const settledGap = settledBody.minY - settledSupport;
            const settledAxisVertical = Math.abs(this.propUpAxisWorld(prop).y);
            const settledFenceFaceVertical = isFence ? Math.abs(this.fenceFaceNormalWorld(prop).y) : 1;
            if (
              settledGap >= -0.08 && settledGap <= 0.060
              && settledAxisVertical <= lyingLimit
              && (!isFence || settledFenceFaceVertical >= fenceFaceLimit)
            ) {
              // Only translate onto the support plane; never rotate into a canned pose.
              this.applyPropWorldCorrection(prop, new THREE.Vector3(0, (settledSupport + 0.004) - settledBody.minY, 0));
              prop.velocity = undefined;
              prop.mesh.userData.angularVelocity = undefined;
              prop.mesh.userData.physicsCenterOfMass = undefined;
              prop.mesh.userData.lastLaunchDirection = undefined;
              if (isFence) {
                prop.mesh.userData.physicsFenceLaunchGraceUntil = undefined;
                prop.mesh.userData.physicsFenceFreeTumbleUntil = undefined;
              }
              prop.mesh.userData.settled = true;
              prop.position = { x: prop.mesh.position.x, y: prop.mesh.position.y, z: prop.mesh.position.z };
            }
          }
        }
      } else {
        // Compact props (bins, hydrants, cones, benches, donut clutter)
        // may settle in whichever stable orientation their actual shape reaches.
        // They still use gravity continuously and frame-rate-independent friction;
        // there is no timer that force-sleeps a still-moving object.
        const airborne = !supportedNow || prop.velocity.y > 0.48;
        if (airborne) {
          const airLinear = Math.exp(-0.24 * dt);
          prop.velocity.x *= airLinear;
          prop.velocity.z *= airLinear;
          this.dampPropAngular(prop, dt, false, false);
          prop.mesh.userData.settleSeconds = 0;
          prop.mesh.userData.physicsGroundContactSeconds = 0;
        } else {
          prop.mesh.userData.physicsGroundContactSeconds = Number(prop.mesh.userData.physicsGroundContactSeconds ?? 0) + dt;
          const groundRate = prop.type === 'cone' || prop.type === 'donut_box' ? 3.0 : 3.8;
          const groundLinear = Math.exp(-groundRate * dt);
          prop.velocity.x *= groundLinear;
          prop.velocity.z *= groundLinear;
          if (Math.abs(prop.velocity.y) < 0.26) prop.velocity.y = 0;
          this.dampPropAngular(prop, dt, true, true);

          const horizontalSq = prop.velocity.x * prop.velocity.x + prop.velocity.z * prop.velocity.z;
          const angularSpeed = angular.length();
          const stable = horizontalSq < 0.14 && Math.abs(prop.velocity.y) < 0.25 && angularSpeed < 0.42;
          prop.mesh.userData.settleSeconds = stable
            ? Number(prop.mesh.userData.settleSeconds ?? 0) + dt
            : 0;
          if (Number(prop.mesh.userData.settleSeconds ?? 0) >= 0.62) {
            const settledBody = this.dynamicPropBody(prop);
            const settledSupport = this.propSupportHeight(settledBody, settledBody.minY + 0.18);
            const settledGap = settledBody.minY - settledSupport;
            if (settledGap >= -0.08 && settledGap <= 0.060) {
              prop.mesh.position.y += (settledSupport + 0.004) - settledBody.minY;
              prop.velocity = undefined;
              prop.mesh.userData.angularVelocity = undefined;
              prop.mesh.userData.lastLaunchDirection = undefined;
              prop.mesh.userData.settled = true;
              prop.position = { x: prop.mesh.position.x, y: prop.mesh.position.y, z: prop.mesh.position.z };
            }
          }
        }
      }

      movedPropsToSync.push(prop);
    }

    // Sync every moved prop from its FINAL physical proxy. Tree foliage never enters
    // the collider; the trunk/main body remains solid after sleep and can be kicked
    // or hit by a vehicle again from its new resting pose.
    for (const prop of movedPropsToSync) this.syncPropCollider(prop);
  }

  private spawnCompletedTree(position: THREE.Vector3, notify: boolean, existingTree?: THREE.Group) {
    const tree = existingTree ?? createOakTreeModel();

    // Old saves can contain a grown tree authored before road-placement validation
    // existed. Never recreate that tree in a live lane: move it to the nearest real
    // verge/lawn using the CURRENT road meshes, preserving the tree rather than
    // deleting it. Newly-grown legal trees pass through unchanged.
    let spawnPosition = position.clone();
    if (this.collision.isRoadSurfaceAt(spawnPosition.x, spawnPosition.z, 0.85)) {
      const roadside = this.collision.findNearestRoadsidePosition(spawnPosition, 0.72, 2.0, 18, 1.05);
      if (roadside) spawnPosition = roadside;
    }

    if (!existingTree) {
      tree.position.copy(spawnPosition);
      this.scene.add(tree);
    } else {
      tree.position.copy(spawnPosition);
    }
    tree.scale.setScalar(1);
    tree.userData.playerGrownTree = true;
    const prop: DestructibleProp = {
      id: `grown_tree_${this.grownTrees.length}_${Math.round(position.x)}_${Math.round(position.z)}`,
      mesh: tree,
      type: 'tree',
      position: { x: spawnPosition.x, y: spawnPosition.y, z: spawnPosition.z },
      destroyed: false,
    };
    this.standardiseInteractivePhysics(prop);
    this.grownTrees.push(prop);
    this.destructibles.push(prop);
    // Grown trees become real physical world objects once fully grown. The same
    // collider follows the tree while it is launched and stays active after it settles.
    this.collision.addInteractiveObject(tree, `prop_${prop.id}`, 0.06);
    // addInteractiveObject derives a full visible AABB; immediately replace it with
    // the shared trunk-only proxy so grown trees behave exactly like authored ones.
    this.syncPropCollider(prop);
    if (notify) this.onTreeCount?.(this.grownTrees.filter((t) => !t.destroyed).length);
  }
}
