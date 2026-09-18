import * as THREE from 'three';
import { CollisionSystem, type WallBox } from './doors';
import { AirportAircraft } from './airport';
import type { WorldInteractionManager } from './worldInteractions';

export type AircraftInputs = {
  throttleUp: boolean;
  throttleDown: boolean;
  pitchUp: boolean;
  pitchDown: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  brake: boolean;
};

export type AircraftImpactSeverity = 'minor' | 'moderate' | 'major';
export type AircraftImpactRegion =
  | 'nose'
  | 'fuselage'
  | 'left_wing'
  | 'right_wing'
  | 'left_engine'
  | 'right_engine'
  | 'tail'
  | 'unknown';

export type AircraftImpactInfo = {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  normalSpeed: number;
  energy: number;
  severity: AircraftImpactSeverity;
  surface: 'structure' | 'ground' | 'aircraft';
  region: AircraftImpactRegion;
  lodged: boolean;
};

export type AircraftUpdateResult = {
  crashedThisFrame: boolean;
  hardLanding: boolean;
  collision: boolean;
  impact: AircraftImpactInfo | null;
  /** True only when this specific impact should kill an onboard player immediately. */
  pilotFatalThisFrame: boolean;
};

type AircraftRegionalDamage = {
  leftWing: number;
  rightWing: number;
  leftEngine: number;
  rightEngine: number;
  tail: number;
  fuselage: number;
};

const freshRegionalDamage = (): AircraftRegionalDamage => ({
  leftWing: 0,
  rightWing: 0,
  leftEngine: 0,
  rightEngine: 0,
  tail: 0,
  fuselage: 0,
});

const clamp = THREE.MathUtils.clamp;

export const NEUTRAL_AIRCRAFT_INPUTS: AircraftInputs = {
  throttleUp: false,
  throttleDown: false,
  pitchUp: false,
  pitchDown: false,
  turnLeft: false,
  turnRight: false,
  brake: false,
};

export class AircraftController {
  public readonly aircraft: AirportAircraft;
  private readonly collision: CollisionSystem;
  private readonly worldInteractions?: WorldInteractionManager;
  private readonly ignoreKickableCollider = (collider: WallBox) => collider.collisionRole === 'interactive';
  private velocity = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private next = new THREE.Vector3();
  private euler = new THREE.Euler(0,0,0,'YXZ');
  private quat = new THREE.Quaternion();
  private sample = new THREE.Vector3();
  private sweepSample = new THREE.Vector3();
  private sweepPosition = new THREE.Vector3();
  private crashVelocity = new THREE.Vector3();
  private crashAngularVelocity = new THREE.Vector3();
  private crashAge = 0;
  private crashSettled = false;
  private lodgedCrash = false;
  private lodgingAge = 0;
  private lodgingDuration = 0.42;
  private lodgingStart = new THREE.Vector3();
  private lodgingTarget = new THREE.Vector3();
  private lodgingStartAttitude = new THREE.Vector3();
  private lodgingTargetAttitude = new THREE.Vector3();
  private regionalDamage: AircraftRegionalDamage;
  private damagePhase = 0;
  private lastGroundY = 0.08;
  /**
   * Short hysteresis after a valid runway rotation. Without this, the old
   * `nearGround` snap could classify the aircraft as grounded again on the very
   * next frame because the wheels had only risen a few centimetres. That made
   * takeoff timing/frame-rate dependent.
   */
  private takeoffGraceTimer = 0;
  private readonly allAircraft: AirportAircraft[];

  constructor(
    aircraft: AirportAircraft,
    collision: CollisionSystem,
    allAircraft: AirportAircraft[] = [aircraft],
    worldInteractions?: WorldInteractionManager,
  ) {
    this.aircraft = aircraft;
    this.collision = collision;
    this.allAircraft = allAircraft;
    this.worldInteractions = worldInteractions;
    const persistedDamage = aircraft.mesh.userData.aircraftRegionalDamage as AircraftRegionalDamage | undefined;
    this.regionalDamage = persistedDamage ?? freshRegionalDamage();
    aircraft.mesh.userData.aircraftRegionalDamage = this.regionalDamage;
    this.lastGroundY = this.groundHeight(aircraft.position);
    // A newly-created parked aircraft should sit on its wheels. Re-creating a
    // controller for an already-airborne abandoned aircraft must NOT snap it down.
    if (aircraft.onGround) {
      aircraft.position.y = this.lastGroundY + aircraft.gearHeight;
      aircraft.mesh.position.copy(aircraft.position);
    }
  }

  private groundHeight(pos: THREE.Vector3) {
    return this.collision.getGroundHeightNear(pos.x, pos.z, pos.y, this.lastGroundY, 8.0, 260.0);
  }

  private orientVectors() {
    const a = this.aircraft;
    // Aircraft state uses positive pitch = nose/climb up. Three.js rotation around
    // local X needs the opposite sign for a +Z-forward model, so render/collision
    // orientation uses -pitch. Roll is already authored in the visual sign expected
    // by the chase camera: LEFT => negative roll, RIGHT => positive roll.
    this.euler.set(-a.pitch, a.yaw, a.roll, 'YXZ');
    this.quat.setFromEuler(this.euler);
    this.forward.set(0,0,1).applyQuaternion(this.quat).normalize();
    this.right.set(1,0,0).applyQuaternion(this.quat).normalize();
  }

  private probeOverlapsCollider(position: THREE.Vector3, radius: number, height: number, collider: WallBox) {
    if (collider.minY !== undefined && position.y + height < collider.minY) return false;
    if (collider.maxY !== undefined && position.y > collider.maxY) return false;

    if (
      collider.centerX !== undefined && collider.centerZ !== undefined &&
      collider.halfX !== undefined && collider.halfZ !== undefined &&
      collider.rotationY !== undefined
    ) {
      const dx = position.x - collider.centerX;
      const dz = position.z - collider.centerZ;
      const c = Math.cos(-collider.rotationY);
      const s = Math.sin(-collider.rotationY);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const closestX = clamp(lx, -collider.halfX, collider.halfX);
      const closestZ = clamp(lz, -collider.halfZ, collider.halfZ);
      const qx = lx - closestX;
      const qz = lz - closestZ;
      return qx * qx + qz * qz < radius * radius;
    }

    return (
      position.x + radius > collider.minX && position.x - radius < collider.maxX &&
      position.z + radius > collider.minZ && position.z - radius < collider.maxZ
    );
  }

  /**
   * Return the fixed world collider responsible for a fly-volume failure when one
   * exists. Roof meshes and other aircraft deliberately return null: they can crash
   * the plane, but can never opt into the special building-lodging response.
   */
  private findBlockingStructure(position: THREE.Vector3, radius: number, height: number): WallBox | null {
    for (const collider of this.collision.getActiveColliders()) {
      if (collider.collisionRole !== 'fixed' || collider.doorId) continue;
      if (this.probeOverlapsCollider(position, radius, height, collider)) return collider;
    }
    return null;
  }

  private probeAircraftAt(pos: THREE.Vector3): {
    clear: boolean;
    contactPoint: THREE.Vector3;
    contactSide: number;
    contactFore: number;
    structure: WallBox | null;
    contactSurface: 'structure' | 'aircraft' | null;
  } {
    const a = this.aircraft;
    this.orientVectors();
    const halfLength = a.length * 0.46;
    const halfWing = a.wingspan * 0.46;
    const samples: Array<readonly [number, number]> = [
      [0, 0],
      [0, halfLength], [0, halfLength * 0.68],
      [0, -halfLength], [0, -halfLength * 0.68],
      [halfWing, 0], [-halfWing, 0],
      [halfWing * 0.72, a.length * 0.08], [-halfWing * 0.72, a.length * 0.08],
      [halfWing * 0.62, -a.length * 0.12], [-halfWing * 0.62, -a.length * 0.12],
    ];
    // Twin-engine aircraft get dedicated nacelle probes so a genuine engine strike
    // can be distinguished from a generic wing strike. Single-engine trainers and
    // Zack's biplane keep their powerplant in the nose/fuselage damage region.
    if (a.kind === 'commuter' || a.kind === 'jetliner') {
      samples.splice(5, 0,
        [a.wingspan * 0.28, a.length * 0.015],
        [-a.wingspan * 0.28, a.length * 0.015],
      );
    }
    const probeRadius = Math.max(0.72, a.collisionRadius * 0.54);
    const bodyHeight = a.kind === 'jetliner' ? 7.8 : a.kind === 'commuter' ? 5.7 : a.kind === 'zacks_plane' ? 5.3 : 4.5;
    const collisionBaseOffset = Math.max(0, -a.gearHeight - 0.03);

    for (const [side, fore] of samples) {
      this.sample.copy(pos).addScaledVector(this.right, side).addScaledVector(this.forward, fore);
      this.sample.y += collisionBaseOffset;
      if (!this.collision.canFlyOccupy(this.sample, probeRadius, bodyHeight, this.ignoreKickableCollider)) {
        return {
          clear: false,
          contactPoint: this.sample.clone(),
          contactSide: side,
          contactFore: fore,
          structure: this.findBlockingStructure(this.sample, probeRadius, bodyHeight),
          contactSurface: 'structure',
        };
      }
    }

    for (const other of this.allAircraft) {
      if (other === a) continue;
      const dy = Math.abs(pos.y - other.position.y);
      if (dy > 8.5) continue;
      const dx = pos.x - other.position.x;
      const dz = pos.z - other.position.z;
      const ownRadius = Math.max(3.2, a.length * 0.22, a.wingspan * 0.20);
      const otherRadius = Math.max(3.2, other.length * 0.22, other.wingspan * 0.20);
      const limit = ownRadius + otherRadius;
      if (dx * dx + dz * dz < limit * limit) {
        this.sample.set((pos.x + other.position.x) * 0.5, (pos.y + other.position.y) * 0.5, (pos.z + other.position.z) * 0.5);
        return { clear: false, contactPoint: this.sample.clone(), contactSide: 0, contactFore: 0, structure: null, contactSurface: 'aircraft' };
      }
    }
    return { clear: true, contactPoint: pos.clone(), contactSide: 0, contactFore: 0, structure: null, contactSurface: null };
  }

  private resolveSoftContacts(
    start: THREE.Vector3,
    end: THREE.Vector3,
    velocity: THREE.Vector3,
    playerCaused: boolean,
  ) {
    if (!this.worldInteractions || velocity.lengthSq() < 0.20) {
      return { speedLoss: 0, contactFraction: 1 };
    }
    this.orientVectors();
    return this.worldInteractions.hitDestructiblesFromAircraft(
      start,
      end,
      velocity,
      this.forward,
      this.right,
      this.aircraft,
      playerCaused,
    );
  }

  /** Stop this frame's translation at a soft-body contact without destroying the
   * aircraft's momentum. The prop/NPC receives the impulse now, WorldInteraction /
   * NPC physics moves it clear later in the same frame, and the aircraft can keep
   * going next frame. This is the key distinction between NO DAMAGE and NO COLLISION. */
  private clampMotionToSoftContact(start: THREE.Vector3, desiredEnd: THREE.Vector3, contactFraction: number) {
    if (contactFraction >= 0.999) return;
    const travel = desiredEnd.clone().sub(start);
    const travelLength = travel.length();
    if (travelLength <= 0.0001) return;
    const skinFraction = Math.min(0.025, 0.16 / travelLength);
    const safeT = THREE.MathUtils.clamp(contactFraction - skinFraction, 0, 1);
    desiredEnd.copy(start).addScaledVector(travel, safeT);
  }

  private canOccupyAircraft(pos: THREE.Vector3) {
    return this.probeAircraftAt(pos).clear;
  }

  /**
   * Continuous/swept aircraft collision. Aircraft can cover several metres during a
   * single rendered frame, especially the jetliner, so testing only the end position
   * allows a thin wall/tower to be skipped completely. Sub-stepping the actual 3D
   * travel path keeps the existing world collider system authoritative while making
   * fast aircraft collision frame-rate independent.
   */
  private sweepAircraftMotion(start: THREE.Vector3, end: THREE.Vector3) {
    const delta = this.sweepSample.copy(end).sub(start);
    const distance = delta.length();
    if (distance < 1e-5) {
      const probe = this.probeAircraftAt(end);
      return {
        position: start.clone(), collided: !probe.clear, contactPoint: probe.contactPoint,
        contactSide: probe.contactSide, contactFore: probe.contactFore, structure: probe.structure,
        contactSurface: probe.contactSurface, travelRatio: probe.clear ? 1 : 0,
      };
    }

    const maxStepDistance = THREE.MathUtils.clamp(this.aircraft.collisionRadius * 0.42, 0.38, 0.90);
    const steps = Math.max(1, Math.ceil(distance / maxStepDistance));
    const lastSafe = start.clone();
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.sweepPosition.copy(start).lerp(end, t);
      const probe = this.probeAircraftAt(this.sweepPosition);
      if (!probe.clear) {
        return {
          position: lastSafe.clone(),
          collided: true,
          contactPoint: probe.contactPoint,
          contactSide: probe.contactSide,
          contactFore: probe.contactFore,
          structure: probe.structure,
          contactSurface: probe.contactSurface,
          travelRatio: (i - 1) / steps,
        };
      }
      lastSafe.copy(this.sweepPosition);
    }
    return { position: end.clone(), collided: false, contactPoint: end.clone(), contactSide: 0, contactFore: 0, structure: null, contactSurface: null, travelRatio: 1 };
  }

  private estimateCollisionNormal(contactPoint: THREE.Vector3, incomingVelocity: THREE.Vector3) {
    const a = this.aircraft;
    const incomingDirection = incomingVelocity.lengthSq() > 1e-6
      ? incomingVelocity.clone().normalize()
      : new THREE.Vector3(0, 0, 1);
    const probeRadius = Math.max(0.72, a.collisionRadius * 0.54);
    const bodyHeight = a.kind === 'jetliner' ? 7.8 : a.kind === 'commuter' ? 5.7 : a.kind === 'zacks_plane' ? 5.3 : 4.5;
    const step = THREE.MathUtils.clamp(probeRadius * 0.72, 0.42, 1.8);
    const directions = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    ];

    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (const direction of directions) {
      this.sample.copy(contactPoint).addScaledVector(direction, step);
      if (!this.collision.canFlyOccupy(this.sample, probeRadius, bodyHeight, this.ignoreKickableCollider)) continue;
      const score = -incomingDirection.dot(direction);
      if (score > bestScore) {
        bestScore = score;
        best = direction;
      }
    }
    return best?.clone() ?? incomingDirection.multiplyScalar(-1);
  }

  private classifyImpactRegion(contactSide: number, contactFore: number): AircraftImpactRegion {
    const a = this.aircraft;
    const absSide = Math.abs(contactSide);
    const sideSign = Math.sign(contactSide);
    const halfLength = Math.max(0.1, a.length * 0.46);
    const foreRatio = contactFore / halfLength;

    if (foreRatio >= 0.58 && absSide <= a.wingspan * 0.18) return 'nose';
    if (foreRatio <= -0.54 && absSide <= a.wingspan * 0.24) return 'tail';

    if (a.kind === 'commuter' || a.kind === 'jetliner') {
      const engineX = a.wingspan * 0.28;
      const engineTolerance = Math.max(0.8, a.wingspan * 0.055);
      if (
        Math.abs(absSide - engineX) <= engineTolerance &&
        contactFore >= -a.length * 0.07 &&
        contactFore <= a.length * 0.10
      ) {
        return sideSign >= 0 ? 'right_engine' : 'left_engine';
      }
    }

    if (absSide >= a.wingspan * 0.20) return sideSign >= 0 ? 'right_wing' : 'left_wing';
    if (Math.abs(foreRatio) <= 0.56) return 'fuselage';
    return foreRatio > 0 ? 'nose' : 'tail';
  }

  private regionalDamageFor(region: AircraftImpactRegion) {
    switch (region) {
      case 'left_wing': return this.regionalDamage.leftWing;
      case 'right_wing': return this.regionalDamage.rightWing;
      case 'left_engine': return this.regionalDamage.leftEngine;
      case 'right_engine': return this.regionalDamage.rightEngine;
      case 'tail': return this.regionalDamage.tail;
      case 'nose':
      case 'fuselage': return this.regionalDamage.fuselage;
      default: return 0;
    }
  }

  private setRegionalDamage(region: AircraftImpactRegion, value: number) {
    const next = clamp(value, 0, 1);
    switch (region) {
      case 'left_wing': this.regionalDamage.leftWing = next; break;
      case 'right_wing': this.regionalDamage.rightWing = next; break;
      case 'left_engine': this.regionalDamage.leftEngine = next; break;
      case 'right_engine': this.regionalDamage.rightEngine = next; break;
      case 'tail': this.regionalDamage.tail = next; break;
      case 'nose':
      case 'fuselage': this.regionalDamage.fuselage = next; break;
    }
  }

  private applyRegionalImpactDamage(impact: AircraftImpactInfo) {
    const a = this.aircraft;
    const directness = clamp(impact.normalSpeed / Math.max(0.01, impact.speed), 0, 1);
    const speedLoad = clamp(impact.normalSpeed / Math.max(8, a.maxSpeed * 0.58), 0, 1.45);
    const base = impact.severity === 'minor' ? 0.07 : impact.severity === 'moderate' ? 0.22 : 0.43;
    const regionScale = impact.region === 'nose' ? 1.18
      : impact.region === 'fuselage' ? 1.10
      : impact.region === 'tail' ? 0.92
      : (impact.region === 'left_engine' || impact.region === 'right_engine') ? 1.02
      : 0.96;
    const delta = clamp(base * regionScale * (0.72 + speedLoad * 0.56) * (0.70 + directness * 0.42), 0.035, 0.68);
    this.setRegionalDamage(impact.region, this.regionalDamageFor(impact.region) + delta);

    const totalDamageDelta = delta * (impact.severity === 'minor' ? 28 : impact.severity === 'moderate' ? 58 : 82);
    a.damage = clamp(a.damage + totalDamageDelta, 0, 100);
    return this.regionalDamageFor(impact.region);
  }

  private isPilotFatalStructureImpact(impact: AircraftImpactInfo) {
    if (impact.surface !== 'structure') return false;
    const a = this.aircraft;
    const directness = clamp(impact.normalSpeed / Math.max(0.01, impact.speed), 0, 1);
    if (impact.region === 'nose') {
      const fatalNormalSpeed = Math.max(20, a.maxSpeed * 0.30);
      return impact.normalSpeed >= fatalNormalSpeed && directness >= 0.52 && impact.energy >= Math.max(140, a.mass * 210);
    }
    if (impact.region === 'fuselage') {
      const fatalNormalSpeed = Math.max(28, a.maxSpeed * 0.42);
      return impact.normalSpeed >= fatalNormalSpeed && directness >= 0.62 && impact.energy >= Math.max(260, a.mass * 360);
    }
    return false;
  }

  private shouldPeripheralImpactCauseStructuralFailure(impact: AircraftImpactInfo, regionDamage: number) {
    const a = this.aircraft;
    const directness = clamp(impact.normalSpeed / Math.max(0.01, impact.speed), 0, 1);
    if (impact.region === 'left_wing' || impact.region === 'right_wing') {
      return regionDamage >= 0.97 && impact.normalSpeed >= Math.max(40, a.maxSpeed * 0.72) && directness >= 0.58;
    }
    if (impact.region === 'tail') {
      return regionDamage >= 0.99 && impact.normalSpeed >= Math.max(42, a.maxSpeed * 0.74) && directness >= 0.62;
    }
    // Engine failures reduce thrust and can burn, but a single nacelle strike does
    // not automatically turn the whole aircraft into an uncontrollable wreck.
    return false;
  }

  private applySurvivableImpactResponse(impact: AircraftImpactInfo, contactSide: number) {
    const a = this.aircraft;
    const directness = clamp(impact.normalSpeed / Math.max(0.01, impact.speed), 0, 1);
    const sideSign = Math.sign(contactSide || (impact.region.startsWith('right_') ? 1 : impact.region.startsWith('left_') ? -1 : 0));
    const severityRetention = impact.severity === 'minor' ? 0.82 : impact.severity === 'moderate' ? 0.62 : 0.44;
    const engineRetention = impact.region === 'left_engine' || impact.region === 'right_engine' ? 0.10 : 0;
    a.speed *= clamp(severityRetention + engineRetention + (1 - directness) * 0.10, 0.30, 0.90);
    a.verticalSpeed *= impact.severity === 'minor' ? 0.88 : impact.severity === 'moderate' ? 0.70 : 0.52;

    if (impact.region === 'left_wing' || impact.region === 'right_wing') {
      a.roll += sideSign * (impact.severity === 'major' ? 0.46 : impact.severity === 'moderate' ? 0.27 : 0.11);
      if (impact.severity === 'major') a.verticalSpeed = Math.min(a.verticalSpeed, -2.2 - directness * 2.4);
    } else if (impact.region === 'left_engine' || impact.region === 'right_engine') {
      a.roll += sideSign * (impact.severity === 'major' ? 0.25 : 0.13);
      a.yaw += sideSign * (impact.severity === 'major' ? 0.16 : 0.08);
    } else if (impact.region === 'tail') {
      a.yaw += (sideSign || Math.sign(impact.normal.x + impact.normal.z || 1)) * (impact.severity === 'major' ? 0.34 : 0.17);
      a.pitch += impact.severity === 'major' ? -0.12 : -0.05;
    } else {
      // Non-fatal fuselage/nose glances still deflect the aircraft instead of
      // allowing it to keep flying straight into the same wall on the next frame.
      const flatNormal = impact.normal.clone().setY(0);
      if (flatNormal.lengthSq() > 1e-5) {
        flatNormal.normalize();
        const heading = new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw));
        heading.addScaledVector(flatNormal, 0.26 + directness * 0.24).normalize();
        a.yaw = Math.atan2(heading.x, heading.z);
      }
      a.roll += sideSign * 0.12;
    }
  }

  private classifyImpact(normalSpeed: number, energy: number): AircraftImpactSeverity {
    if (normalSpeed >= 22 || energy >= 320) return 'major';
    if (normalSpeed >= 8 || energy >= 45) return 'moderate';
    return 'minor';
  }

  private estimateStructureNormal(collider: WallBox, contactPoint: THREE.Vector3, incomingVelocity: THREE.Vector3) {
    const centerX = collider.centerX ?? (collider.minX + collider.maxX) * 0.5;
    const centerZ = collider.centerZ ?? (collider.minZ + collider.maxZ) * 0.5;
    const halfX = collider.halfX ?? Math.max(0.001, (collider.maxX - collider.minX) * 0.5);
    const halfZ = collider.halfZ ?? Math.max(0.001, (collider.maxZ - collider.minZ) * 0.5);
    const yaw = collider.rotationY ?? 0;
    const c = Math.cos(-yaw);
    const s = Math.sin(-yaw);
    const dx = contactPoint.x - centerX;
    const dz = contactPoint.z - centerZ;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const incomingLX = incomingVelocity.x * c - incomingVelocity.z * s;
    const incomingLZ = incomingVelocity.x * s + incomingVelocity.z * c;
    const distX = Math.abs(halfX - Math.abs(lx));
    const distZ = Math.abs(halfZ - Math.abs(lz));

    const localNormal = distX <= distZ
      ? new THREE.Vector3(Math.sign(lx || -incomingLX || 1), 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(lz || -incomingLZ || 1));
    const wc = Math.cos(yaw);
    const ws = Math.sin(yaw);
    const normal = new THREE.Vector3(
      localNormal.x * wc + localNormal.z * ws,
      0,
      -localNormal.x * ws + localNormal.z * wc,
    ).normalize();
    // Surface normal must point out of the structure, against the incoming motion.
    if (normal.dot(incomingVelocity) > 0) normal.multiplyScalar(-1);
    return normal;
  }

  private isSubstantialLodgingStructure(collider: WallBox | null): collider is WallBox {
    if (!collider || collider.collisionRole !== 'fixed' || collider.doorId) return false;
    const sizeX = Math.max(0, (collider.halfX ?? (collider.maxX - collider.minX) * 0.5) * 2);
    const sizeZ = Math.max(0, (collider.halfZ ?? (collider.maxZ - collider.minZ) * 0.5) * 2);
    const height = collider.minY !== undefined && collider.maxY !== undefined
      ? Math.max(0, collider.maxY - collider.minY)
      : 11;
    const longFace = Math.max(sizeX, sizeZ);

    // Towers and major structural walls qualify. Typical houses, sheds, props,
    // signs and interactive scenery intentionally do not.
    return (height >= 12 && longFace >= 6) || (height >= 8.5 && longFace >= 18);
  }

  private hasLodgingSurfaceRoom(collider: WallBox, impactPoint: THREE.Vector3) {
    const centerX = collider.centerX ?? (collider.minX + collider.maxX) * 0.5;
    const centerZ = collider.centerZ ?? (collider.minZ + collider.maxZ) * 0.5;
    const halfX = collider.halfX ?? Math.max(0.001, (collider.maxX - collider.minX) * 0.5);
    const halfZ = collider.halfZ ?? Math.max(0.001, (collider.maxZ - collider.minZ) * 0.5);
    const yaw = collider.rotationY ?? 0;
    const c = Math.cos(-yaw);
    const s = Math.sin(-yaw);
    const dx = impactPoint.x - centerX;
    const dz = impactPoint.z - centerZ;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const hitsXFace = Math.abs(halfX - Math.abs(lx)) <= Math.abs(halfZ - Math.abs(lz));
    const tangentHalf = hitsXFace ? halfZ : halfX;
    const tangentPosition = hitsXFace ? Math.abs(lz) : Math.abs(lx);
    const edgeMargin = Math.min(tangentHalf * 0.32, Math.max(1.0, this.aircraft.collisionRadius * 0.85));
    if (tangentHalf - tangentPosition < edgeMargin) return false;

    if (collider.minY !== undefined && collider.maxY !== undefined) {
      const verticalMargin = Math.min(2.4, Math.max(0.8, this.aircraft.collisionRadius * 0.65));
      if (impactPoint.y < collider.minY + verticalMargin || impactPoint.y > collider.maxY - verticalMargin) return false;
    }
    return true;
  }

  private shouldLodgeImpact(
    impact: AircraftImpactInfo,
    structure: WallBox | null,
    contactFore: number,
  ) {
    if (!this.isSubstantialLodgingStructure(structure)) return false;
    if (!this.hasLodgingSurfaceRoom(structure, impact.point)) return false;
    if (Math.abs(impact.normal.y) > 0.42) return false;

    this.orientVectors();
    const directness = impact.normalSpeed / Math.max(0.01, impact.speed);
    const forwardIntoSurface = Math.max(0, -this.forward.dot(impact.normal));
    const noseLed = contactFore / Math.max(0.1, this.aircraft.length * 0.46);
    const minNormalSpeed = Math.max(46, this.aircraft.maxSpeed * 0.62);
    const minEnergy = Math.max(700, this.aircraft.mass * 520);

    return (
      impact.speed >= this.aircraft.maxSpeed * 0.68 &&
      impact.normalSpeed >= minNormalSpeed &&
      impact.energy >= minEnergy &&
      directness >= 0.78 &&
      forwardIntoSurface >= 0.72 &&
      noseLed >= 0.45
    );
  }

  private enterLodgedCrashState(impact: AircraftImpactInfo) {
    const a = this.aircraft;
    this.enterCrashState(impact);
    this.lodgedCrash = true;
    this.lodgingAge = 0;
    this.crashSettled = false;
    this.lodgingStart.copy(a.position);

    const incomingDirection = impact.velocity.lengthSq() > 1e-6
      ? impact.velocity.clone().normalize()
      : this.forward.clone();
    const maxPenetration = clamp(a.length * 0.16, 1.15, 4.25);
    const energyFactor = THREE.MathUtils.smoothstep(impact.energy, 1100, 6500);
    const directness = clamp(impact.normalSpeed / Math.max(0.01, impact.speed), 0, 1);
    const penetrationDepth = maxPenetration * THREE.MathUtils.lerp(0.42, 1.0, energyFactor) * THREE.MathUtils.lerp(0.78, 1.0, directness);
    this.lodgingTarget.copy(a.position).addScaledVector(incomingDirection, penetrationDepth);

    this.lodgingStartAttitude.set(a.pitch, a.yaw, a.roll);
    const lever = impact.point.clone().sub(a.position);
    const settleTorque = lever.cross(impact.velocity.clone()).multiplyScalar(0.0017 / Math.max(0.75, a.mass));
    this.lodgingTargetAttitude.set(
      a.pitch + clamp(settleTorque.x, -0.11, 0.11),
      a.yaw + clamp(settleTorque.y, -0.08, 0.08),
      a.roll + clamp(settleTorque.z, -0.15, 0.15),
    );

    // Momentum is visually absorbed by the short lodging transition rather than
    // continuing through the structure. Flight/AI controls are already disabled by
    // the common crashed state.
    this.crashVelocity.set(0, 0, 0);
    this.crashAngularVelocity.set(0, 0, 0);
    a.speed = 0;
    a.verticalSpeed = 0;
    impact.lodged = true;
  }

  private enterCrashState(impact: AircraftImpactInfo) {
    const a = this.aircraft;
    a.crashed = true;
    a.damage = 100;
    a.throttle = 0;
    a.onGround = false;
    this.crashAge = 0;
    this.crashSettled = false;
    this.lodgedCrash = false;
    this.lodgingAge = 0;

    const normal = impact.normal.clone().normalize();
    const incoming = impact.velocity.clone();
    const normalSpeed = incoming.dot(normal);
    const tangential = incoming.clone().addScaledVector(normal, -normalSpeed);
    const massRetention = THREE.MathUtils.lerp(0.16, 0.28, THREE.MathUtils.clamp(a.mass / 4.2, 0, 1));
    this.crashVelocity.copy(tangential).multiplyScalar(massRetention);
    if (normalSpeed < 0) this.crashVelocity.addScaledVector(normal, -normalSpeed * 0.08);
    this.crashVelocity.y = Math.min(this.crashVelocity.y, 3.5);

    // Contact point + incoming momentum determine the tumble. Heavy aircraft resist
    // angular acceleration more than trainers; centre-line nose impacts spin less than
    // asymmetric wing/engine strikes without needing random crash rotation.
    const lever = impact.point.clone().sub(a.position);
    this.crashAngularVelocity.copy(lever).cross(incoming).multiplyScalar(0.012 / Math.max(0.7, a.mass));
    this.crashAngularVelocity.x = clamp(this.crashAngularVelocity.x, -2.2, 2.2);
    this.crashAngularVelocity.y = clamp(this.crashAngularVelocity.y, -1.4, 1.4);
    this.crashAngularVelocity.z = clamp(this.crashAngularVelocity.z, -2.2, 2.2);
    if (this.crashAngularVelocity.lengthSq() < 0.012) {
      this.crashAngularVelocity.set(-0.34, Math.sign(normal.x + normal.z || 1) * 0.18, normal.x * 0.24 - normal.z * 0.24);
    }
  }

  public isCrashCleanupReady() {
    return this.aircraft.crashed && this.crashAge >= 18 && this.crashSettled;
  }

  public getWorldVelocity(target = new THREE.Vector3()): THREE.Vector3 {
    this.orientVectors();
    target.copy(this.forward).multiplyScalar(this.aircraft.speed);
    target.y = this.aircraft.verticalSpeed;
    return target;
  }

  public reset(position?: THREE.Vector3, yaw?: number) {
    const a = this.aircraft;
    if (position) a.position.copy(position);
    if (yaw !== undefined) a.yaw = yaw;
    a.pitch = 0; a.roll = 0; a.speed = 0; a.throttle = 0; a.verticalSpeed = 0;
    a.crashed = false; a.damage = 0; a.onGround = true;
    this.takeoffGraceTimer = 0;
    this.crashVelocity.set(0, 0, 0);
    this.crashAngularVelocity.set(0, 0, 0);
    this.crashAge = 0;
    this.crashSettled = false;
    this.lodgedCrash = false;
    this.lodgingAge = 0;
    Object.assign(this.regionalDamage, freshRegionalDamage());
    a.mesh.userData.aircraftRegionalDamage = this.regionalDamage;
    this.damagePhase = 0;
    this.lastGroundY = this.groundHeight(a.position);
    a.position.y = this.lastGroundY + a.gearHeight;
    a.mesh.position.copy(a.position);
    a.mesh.rotation.set(0,a.yaw,0,'YXZ');
  }

  public update(dt: number, input: AircraftInputs, playerCausedPropHits = false): AircraftUpdateResult {
    const a = this.aircraft;
    const result: AircraftUpdateResult = { crashedThisFrame:false, hardLanding:false, collision:false, impact:null, pilotFatalThisFrame:false };
    const frameDt = Math.min(dt, 0.05);
    this.takeoffGraceTimer = Math.max(0, this.takeoffGraceTimer - frameDt);
    this.damagePhase += frameDt;

    if (a.crashed) {
      this.crashAge += frameDt;
      a.throttle = THREE.MathUtils.damp(a.throttle, 0, 4.5, frameDt);

      if (this.lodgedCrash) {
        this.lodgingAge += frameDt;
        const t = clamp(this.lodgingAge / this.lodgingDuration, 0, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        a.position.lerpVectors(this.lodgingStart, this.lodgingTarget, eased);
        a.pitch = THREE.MathUtils.lerp(this.lodgingStartAttitude.x, this.lodgingTargetAttitude.x, eased);
        a.yaw = THREE.MathUtils.lerp(this.lodgingStartAttitude.y, this.lodgingTargetAttitude.y, eased);
        a.roll = THREE.MathUtils.lerp(this.lodgingStartAttitude.z, this.lodgingTargetAttitude.z, eased);
        a.speed = 0;
        a.verticalSpeed = 0;
        a.onGround = false;
        this.crashSettled = t >= 1;
        a.mesh.position.copy(a.position);
        a.mesh.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
        return result;
      }

      this.crashVelocity.y -= 9.8 * frameDt;
      this.next.copy(a.position).addScaledVector(this.crashVelocity, frameDt);

      // A falling/burning wreck still treats kickable scenery as lightweight props.
      // This lets an abandoned or already-disabled aircraft plough through cones,
      // fences, poles and trees without those props becoming a fake concrete wall.
      const crashSoftContact = this.resolveSoftContacts(a.position, this.next, this.crashVelocity, playerCausedPropHits);
      if (crashSoftContact.speedLoss > 0 && this.crashVelocity.lengthSq() > 0.01) {
        this.crashVelocity.setLength(Math.max(0, this.crashVelocity.length() - crashSoftContact.speedLoss));
      }
      this.clampMotionToSoftContact(a.position, this.next, crashSoftContact.contactFraction);

      const swept = this.sweepAircraftMotion(a.position, this.next);
      if (swept.collided) {
        a.position.copy(swept.position);
        const impactVelocity = this.crashVelocity.clone();
        const impactNormal = swept.structure
          ? this.estimateStructureNormal(swept.structure, swept.contactPoint, impactVelocity)
          : this.estimateCollisionNormal(swept.contactPoint, impactVelocity);
        const signedNormalSpeed = impactVelocity.dot(impactNormal);
        const normalImpactSpeed = Math.abs(signedNormalSpeed);
        const tangential = impactVelocity.clone().addScaledVector(impactNormal, -signedNormalSpeed);
        this.crashVelocity.copy(tangential).multiplyScalar(0.30);
        if (signedNormalSpeed < 0) this.crashVelocity.addScaledVector(impactNormal, -signedNormalSpeed * 0.06);
        this.crashAngularVelocity.multiplyScalar(0.82);

        if (normalImpactSpeed >= 5.5) {
          const impactEnergy = 0.5 * a.mass * normalImpactSpeed * normalImpactSpeed;
          const region = this.classifyImpactRegion(swept.contactSide, swept.contactFore);
          const impactInfo: AircraftImpactInfo = {
            point: swept.contactPoint.clone().addScaledVector(impactNormal, -Math.max(0.72, a.collisionRadius * 0.54)),
            normal: impactNormal,
            velocity: impactVelocity,
            speed: impactVelocity.length(),
            normalSpeed: normalImpactSpeed,
            energy: impactEnergy,
            severity: this.classifyImpact(normalImpactSpeed, impactEnergy),
            surface: swept.contactSurface ?? 'structure',
            region,
            lodged: false,
          };
          result.collision = true;
          result.impact = impactInfo;
          // A peripheral strike can disable the aircraft without killing the pilot.
          // If that disabled wreck subsequently slams into another structure hard,
          // that second real crash is the fatal event.
          result.pilotFatalThisFrame = impactInfo.surface === 'structure' && (
            normalImpactSpeed >= Math.max(14, a.maxSpeed * 0.20) ||
            impactEnergy >= Math.max(140, a.mass * 190)
          );
        }
      } else {
        a.position.copy(this.next);
      }

      const ground = this.groundHeight(a.position);
      const contactY = ground + a.gearHeight;
      if (a.position.y <= contactY) {
        const groundImpactSpeed = Math.max(0, -this.crashVelocity.y);
        const groundImpactVelocity = this.crashVelocity.clone();
        a.position.y = contactY;
        if (this.crashVelocity.y < -2.0) this.crashVelocity.y *= -0.10;
        else this.crashVelocity.y = 0;
        const groundDrag = Math.exp(-4.4 * frameDt);
        this.crashVelocity.x *= groundDrag;
        this.crashVelocity.z *= groundDrag;
        this.crashAngularVelocity.multiplyScalar(Math.exp(-2.8 * frameDt));
        a.onGround = true;
        if (!result.pilotFatalThisFrame && groundImpactSpeed >= 9.5) {
          const impactEnergy = 0.5 * a.mass * groundImpactSpeed * groundImpactSpeed;
          const severity: AircraftImpactSeverity = (groundImpactSpeed >= 14 || impactEnergy >= 240) ? 'major' : 'moderate';
          result.impact = {
            point: a.position.clone().setY(ground + 0.12),
            normal: new THREE.Vector3(0, 1, 0),
            velocity: groundImpactVelocity,
            speed: groundImpactVelocity.length(),
            normalSpeed: groundImpactSpeed,
            energy: impactEnergy,
            severity,
            surface: 'ground',
            region: 'fuselage',
            lodged: false,
          };
          result.collision = true;
          result.pilotFatalThisFrame = severity === 'major' || (a.damage >= 95 && groundImpactSpeed >= 11);
        }
      } else {
        a.onGround = false;
        this.crashAngularVelocity.multiplyScalar(Math.exp(-0.75 * frameDt));
      }

      a.pitch += this.crashAngularVelocity.x * frameDt;
      a.yaw += this.crashAngularVelocity.y * frameDt;
      a.roll += this.crashAngularVelocity.z * frameDt;
      a.speed = Math.hypot(this.crashVelocity.x, this.crashVelocity.z);
      a.verticalSpeed = this.crashVelocity.y;
      this.crashSettled = a.onGround && this.crashVelocity.lengthSq() < 0.10 && this.crashAngularVelocity.lengthSq() < 0.010;
      a.mesh.position.copy(a.position);
      a.mesh.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
      return result;
    }

    const throttleRate = a.kind === 'jetliner' ? 0.25 : 0.34;
    if (input.throttleUp && !input.throttleDown) a.throttle += throttleRate * frameDt;
    if (input.throttleDown && !input.throttleUp) a.throttle -= throttleRate * frameDt;
    a.throttle = clamp(a.throttle, 0, 1);

    // Positive turnCommand means "player intends to turn left". The original
    // implementation applied the opposite yaw sign, which made the arrow keys feel
    // reversed from the chase camera. Keep this semantic command consistent on the
    // ground and in the air so LEFT always changes heading left and RIGHT always
    // changes heading right.
    const turnCommand = (input.turnLeft ? 1 : 0) - (input.turnRight ? 1 : 0);
    const pitchInput = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0);

    const leftWingDamage = this.regionalDamage.leftWing;
    const rightWingDamage = this.regionalDamage.rightWing;
    const wingAverageDamage = (leftWingDamage + rightWingDamage) * 0.5;
    const wingRollBias = (rightWingDamage - leftWingDamage) * 0.46;
    const leftEngineDamage = this.regionalDamage.leftEngine;
    const rightEngineDamage = this.regionalDamage.rightEngine;
    const engineAverageDamage = (leftEngineDamage + rightEngineDamage) * 0.5;
    const engineYawBias = (leftEngineDamage - rightEngineDamage) * 0.19;
    const tailDamage = this.regionalDamage.tail;
    const fuselageDamage = this.regionalDamage.fuselage;
    const damageTurnResponsiveness = a.turnResponsiveness * (1 - wingAverageDamage * 0.30) * (1 - tailDamage * 0.58);
    const damagePitchResponsiveness = a.pitchResponsiveness * (1 - tailDamage * 0.62) * (1 - wingAverageDamage * 0.24);
    const enginePowerFactor = clamp(1 - engineAverageDamage * 0.68 - fuselageDamage * 0.10, 0.28, 1);
    const damagedLiftFactor = clamp(1 - wingAverageDamage * 0.64 - fuselageDamage * 0.10, 0.28, 1);

    this.lastGroundY = this.groundHeight(a.position);
    const wheelY = this.lastGroundY + a.gearHeight;

    // IMPORTANT: only an aircraft that is genuinely in the grounded state is
    // clamped to the runway here. The previous proximity-based ground rule
    // re-captured a plane immediately after rotation because its first airborne
    // frame was naturally still close to the runway. Landing is already handled
    // by the real contact test later in this update, so a proximity-only ground
    // snap is both unnecessary and the source of intermittent failed takeoffs.
    if (a.onGround) {
      a.position.y = wheelY;
      a.verticalSpeed = 0;
      a.roll = THREE.MathUtils.damp(a.roll, 0, 6.5, frameDt);

      const rollingDrag = 0.72 + Math.abs(a.speed) * 0.012;
      const thrust = a.acceleration * enginePowerFactor * (0.12 + a.throttle * 0.88) * a.throttle;

      // W always works toward forward taxi/flight. S first reduces throttle; once
      // throttle and forward speed are effectively zero, continuing to hold S engages
      // a deliberately slow ground-only reverse. Airborne code never permits reverse.
      if (input.throttleUp && a.speed < -0.05) {
        a.speed = THREE.MathUtils.damp(a.speed, 0, 5.5, frameDt);
      } else if (a.speed >= -0.05) {
        a.speed += thrust * frameDt;
      }
      const reverseEligible = input.throttleDown && !input.throttleUp && a.throttle <= 0.015 && a.speed <= 0.65;
      if (reverseEligible) {
        a.speed -= a.acceleration * enginePowerFactor * 0.34 * frameDt;
      }

      if (Math.abs(a.speed) > 0.015) {
        const dragStep = Math.min(Math.abs(a.speed), rollingDrag * frameDt);
        a.speed -= Math.sign(a.speed) * dragStep;
      } else {
        a.speed = 0;
      }
      if (input.brake) a.speed = THREE.MathUtils.damp(a.speed, 0, a.brakeStrength, frameDt);
      a.speed = clamp(a.speed, -a.reverseTaxiSpeed, a.maxSpeed * 0.86);

      const steerAuthority = 0.30 + Math.min(1, Math.abs(a.speed) / 16) * 0.52;
      const reverseDirection = a.speed >= 0 ? 1 : -1;
      a.yaw += turnCommand * steerAuthority * damageTurnResponsiveness * frameDt * reverseDirection;

      const liftRatio = Math.max(0, a.speed) / Math.max(0.1, a.takeoffSpeed);
      const rotateCommand = pitchInput > 0 ? pitchInput : 0;
      const rotationAuthority = THREE.MathUtils.smoothstep(liftRatio, 0.76, 0.98);

      // Rotation starts before the actual liftoff threshold so UP gives immediate,
      // readable feedback instead of appearing dead until one exact speed. Releasing
      // UP smoothly lowers the nose again while the aircraft remains on its wheels.
      const rotationTarget = rotateCommand > 0 && liftRatio >= 0.76
        ? rotateCommand * THREE.MathUtils.lerp(0.075, 0.225, rotationAuthority)
        : 0;
      a.pitch = THREE.MathUtils.damp(
        a.pitch,
        rotationTarget,
        (rotateCommand > 0 ? 4.8 : 5.5) * damagePitchResponsiveness,
        frameDt,
      );

      // Treat takeoffSpeed as the nominal Vr/Vlof configuration value, not a
      // frame-perfect gate. Once the aircraft is in a small valid window below it,
      // UP + positive rotation commits the grounded -> airborne transition. The
      // existing per-aircraft liftFactor then affects how strongly it climbs away.
      const liftoffReady = liftRatio >= 0.94 && rotateCommand > 0 && a.pitch > 0.025;
      if (liftoffReady) {
        a.onGround = false;
        const takeoffLift = ((liftRatio - 0.84) * 8.0 + a.pitch * 9.0) * a.liftFactor * damagedLiftFactor;
        a.verticalSpeed = Math.max(2.0, takeoffLift);
        // A small physical wheel-unloading step prevents numerical ground contact
        // from immediately re-triggering while the positive climb velocity takes over.
        // This is centimetre-scale separation, not a runway-end/vertical teleport.
        a.position.y = Math.max(a.position.y, wheelY + 0.10);
        this.takeoffGraceTimer = 0.55;
      }
    } else {
      // SIMPLE ARCADE FLIGHT -------------------------------------------------
      // W/S own engine power and forward speed. Arrow keys express where the
      // player wants the aircraft to go. Airspeed still controls whether those
      // commands have enough aerodynamic authority to work, so a stalled aircraft
      // cannot climb simply because UP is held.
      const damageWobble = Math.sin(this.damagePhase * 4.7) * tailDamage * 0.055;
      const targetRoll = -turnCommand * 0.42 + wingRollBias + engineYawBias * 0.42 + damageWobble;
      const visualPitchTarget = clamp(pitchInput * 0.22, -0.22, 0.22);
      a.roll = THREE.MathUtils.damp(a.roll, targetRoll, 3.0 * damageTurnResponsiveness, frameDt);
      a.pitch = THREE.MathUtils.damp(a.pitch, visualPitchTarget - tailDamage * 0.035, 3.2 * damagePitchResponsiveness, frameDt);

      // The heading command is explicit instead of being inferred primarily from
      // bank angle. This makes LEFT/RIGHT predictable while the bank remains a
      // natural-looking visual part of the coordinated turn.
      const turnRate = 0.34 * damageTurnResponsiveness;
      const tailYawWobble = Math.sin(this.damagePhase * 3.1 + 0.8) * tailDamage * 0.085;
      a.yaw += (turnCommand * turnRate + engineYawBias + tailYawWobble) * frameDt;

      // Zero throttle is allowed to bleed all the way down to a true stall. The old
      // minimum-speed clamp of 8 units meant an aircraft could never genuinely run
      // out of airspeed. Extra idle drag makes a power-off stall arrive in a useful
      // arcade timeframe without making powered flight feel excessively draggy.
      const idleDrag = a.throttle <= 0.03 ? 0.78 : a.throttle < 0.18 ? 0.28 : 0;
      const damageDrag = wingAverageDamage * 0.52 + tailDamage * 0.24 + fuselageDamage * 0.26;
      const drag = (0.38 + idleDrag + damageDrag + a.speed * a.speed * 0.00092) * a.dragFactor;
      a.speed += (a.acceleration * enginePowerFactor * a.throttle - drag) * frameDt;
      const damagedMaxSpeed = a.maxSpeed * clamp(1 - engineAverageDamage * 0.42 - fuselageDamage * 0.12, 0.42, 1);
      a.speed = clamp(a.speed, 0, damagedMaxSpeed);

      const stallSpeed = a.takeoffSpeed * (a.kind === 'jetliner' ? 0.72 : a.kind === 'commuter' ? 0.68 : a.kind === 'zacks_plane' ? 0.64 : 0.62);
      const controlStartSpeed = stallSpeed * 0.68;
      const fullControlSpeed = Math.max(controlStartSpeed + 0.1, a.takeoffSpeed * 0.96);
      const aerodynamicDamageAuthority = clamp((1 - wingAverageDamage * 0.46) * (1 - tailDamage * 0.52), 0.28, 1);
      const controlAuthority = THREE.MathUtils.smoothstep(a.speed, controlStartSpeed, fullControlSpeed) * aerodynamicDamageAuthority;
      const stallRatio = clamp(a.speed / Math.max(0.1, stallSpeed), 0, 1);
      const stallSeverity = 1 - stallRatio;

      const climbRate = (a.kind === 'jetliner' ? 8.2 : a.kind === 'commuter' ? 9.8 : a.kind === 'zacks_plane' ? 11.0 : 12.0) * damagedLiftFactor;
      const descentRate = a.kind === 'jetliner' ? 9.0 : a.kind === 'commuter' ? 10.0 : 10.8;
      const damageSink = wingAverageDamage * 5.2 + Math.max(leftEngineDamage, rightEngineDamage) * 1.8 + fuselageDamage * 1.2;

      if (pitchInput > 0.01 && controlAuthority > 0.04) {
        // UP = clearly gain altitude, but only while the wings have enough airspeed.
        const targetClimb = climbRate * controlAuthority;
        a.verticalSpeed = THREE.MathUtils.damp(
          a.verticalSpeed,
          targetClimb,
          2.8 * damagePitchResponsiveness,
          frameDt,
        );
      } else if (pitchInput < -0.01) {
        // DOWN remains deliberately authoritative so lining up a runway is easy.
        // At low speed the aircraft can always descend; it just cannot climb back
        // out until forward speed is restored.
        const targetDescent = -descentRate * (0.72 + controlAuthority * 0.28);
        a.verticalSpeed = THREE.MathUtils.damp(
          a.verticalSpeed,
          targetDescent,
          2.6 * damagePitchResponsiveness,
          frameDt,
        );
      } else if (stallSeverity > 0.001) {
        // Smooth stall progression: first a gentle sink, then a rapidly increasing
        // fall as the aircraft loses the last of its useful airspeed.
        const stallSink = -THREE.MathUtils.lerp(2.2, 19.0, stallSeverity * stallSeverity);
        a.verticalSpeed = THREE.MathUtils.damp(
          a.verticalSpeed,
          stallSink,
          1.4 + stallSeverity * 2.4,
          frameDt,
        );
        a.pitch = THREE.MathUtils.damp(a.pitch, -0.10 - stallSeverity * 0.13, 1.6, frameDt);
      } else {
        // With adequate speed and no altitude command, gradually trim toward level
        // flight instead of forcing the player to constantly fight pitch.
        a.verticalSpeed = THREE.MathUtils.damp(a.verticalSpeed, -damageSink, 0.62 + wingAverageDamage * 0.9, frameDt);
      }

      a.verticalSpeed = clamp(a.verticalSpeed, -30, 24);
    }

    this.orientVectors();
    this.velocity.copy(this.forward).multiplyScalar(a.speed);
    this.velocity.y = a.verticalSpeed;
    this.next.copy(a.position).addScaledVector(this.velocity, frameDt);
    this.next.x = clamp(this.next.x, -800, 800);
    this.next.z = clamp(this.next.z, -980, 520);
    const nextGround = this.groundHeight(this.next);
    const maximumAltitude = nextGround + 220;
    this.next.y = Math.min(this.next.y, maximumAltitude);

    // Movable scenery is resolved BEFORE the solid-world sweep. The shared prop
    // manager receives the aircraft's true swept footprint/momentum, while the
    // aircraft collision query ignores only interactive prop colliders. Buildings,
    // terrain, roofs, vehicles and other aircraft remain fully solid.
    const softContact = this.resolveSoftContacts(a.position, this.next, this.velocity, playerCausedPropHits);
    if (softContact.speedLoss > 0) {
      if (a.speed > 0) a.speed = Math.max(0, a.speed - softContact.speedLoss);
      else if (a.speed < 0) a.speed = Math.min(0, a.speed + softContact.speedLoss);
    }
    this.clampMotionToSoftContact(a.position, this.next, softContact.contactFraction);

    const sweptMotion = this.sweepAircraftMotion(a.position, this.next);
    if (sweptMotion.collided) {
      result.collision = true;
      const impactVelocity = this.velocity.clone();
      const impactSpeed = impactVelocity.length();
      const impactNormal = sweptMotion.structure
        ? this.estimateStructureNormal(sweptMotion.structure, sweptMotion.contactPoint, impactVelocity)
        : this.estimateCollisionNormal(sweptMotion.contactPoint, impactVelocity);
      const normalImpactSpeed = Math.abs(impactVelocity.dot(impactNormal));
      const impactEnergy = 0.5 * a.mass * normalImpactSpeed * normalImpactSpeed;
      const severity = this.classifyImpact(normalImpactSpeed, impactEnergy);
      const impactRegion = this.classifyImpactRegion(sweptMotion.contactSide, sweptMotion.contactFore);
      const surfaceContactPoint = sweptMotion.contactPoint.clone().addScaledVector(
        impactNormal,
        -Math.max(0.72, a.collisionRadius * 0.54),
      );
      const impactInfo: AircraftImpactInfo = {
        point: surfaceContactPoint,
        normal: impactNormal,
        velocity: impactVelocity,
        speed: impactSpeed,
        normalSpeed: normalImpactSpeed,
        energy: impactEnergy,
        severity,
        surface: sweptMotion.contactSurface ?? 'structure',
        region: impactRegion,
        lodged: false,
      };
      result.impact = impactInfo;
      a.position.copy(sweptMotion.position);
      const regionalDamage = this.applyRegionalImpactDamage(impactInfo);
      const fatalPilotImpact = this.isPilotFatalStructureImpact(impactInfo);

      if (fatalPilotImpact) {
        // Catastrophic cockpit/front-fuselage impacts are the reliable instant-death
        // case. Promote the visual severity even if the raw speed sat just below the
        // generic "major" threshold so the aftermath matches the fatal physics.
        impactInfo.severity = 'major';
        if (this.shouldLodgeImpact(impactInfo, sweptMotion.structure, sweptMotion.contactFore)) {
          this.enterLodgedCrashState(impactInfo);
        } else {
          this.enterCrashState(impactInfo);
        }
        result.crashedThisFrame = true;
        result.pilotFatalThisFrame = true;
      } else {
        // Peripheral contacts damage the aircraft first. A wing/engine/tail strike
        // can be violent and burning while the pilot remains alive long enough to
        // counter-steer, recover, land, or bail out.
        this.applySurvivableImpactResponse(impactInfo, sweptMotion.contactSide);

        const fuselageStructuralFailure = impactInfo.region === 'fuselage' &&
          impactInfo.severity === 'major' && regionalDamage >= 0.95 &&
          impactInfo.normalSpeed >= Math.max(34, a.maxSpeed * 0.55);
        const peripheralStructuralFailure = impactInfo.severity === 'major' &&
          this.shouldPeripheralImpactCauseStructuralFailure(impactInfo, regionalDamage);

        if (fuselageStructuralFailure || peripheralStructuralFailure) {
          this.enterCrashState(impactInfo);
          result.crashedThisFrame = true;
          // Structural failure is not itself pilot death. The player may still bail
          // out; a later severe ground/building strike from the falling wreck becomes
          // the fatal event via the crashed-state impact path above.
        } else if (a.damage >= 100) {
          // 100% is reserved for a fully disabled wreck. A badly damaged but still
          // controllable aircraft remains just below that state until a real follow-on
          // failure/crash occurs.
          a.damage = 99;
        }
      }
    } else {
      a.position.copy(sweptMotion.position);
    }

    const groundAfter = this.groundHeight(a.position);
    const contactY = groundAfter + a.gearHeight;
    const protectedTakeoffContact = this.takeoffGraceTimer > 0 && a.verticalSpeed > 0.1;
    if (a.position.y <= contactY && !protectedTakeoffContact) {
      const landingSpeed = Math.abs(a.verticalSpeed);
      const badAttitude = Math.abs(a.roll) > 0.34 || Math.abs(a.pitch) > 0.28;
      const hard = landingSpeed > 8.5 || badAttitude;
      a.position.y = contactY;
      if (hard) {
        result.hardLanding = true;
        const landingVelocity = this.velocity.clone();
        const impactSpeed = landingVelocity.length();
        const impactEnergy = 0.5 * a.mass * landingSpeed * landingSpeed;
        const severity = (landingSpeed > 15 || impactEnergy >= 320) ? 'major' : 'moderate';
        const impactInfo: AircraftImpactInfo = {
          point: a.position.clone().setY(groundAfter + 0.12),
          normal: new THREE.Vector3(0, 1, 0),
          velocity: landingVelocity,
          speed: impactSpeed,
          normalSpeed: landingSpeed,
          energy: impactEnergy,
          severity,
          surface: 'ground',
          region: 'fuselage',
          lodged: false,
        };
        result.impact = impactInfo;
        a.damage = clamp(a.damage + landingSpeed * 3.2 + (badAttitude ? 18 : 0),0,100);
        a.speed *= 0.72;
        if (severity === 'major' || a.damage >= 100) {
          impactInfo.severity = 'major';
          this.enterCrashState(impactInfo);
          result.crashedThisFrame = true;
          result.pilotFatalThisFrame = landingSpeed >= 15 || impactEnergy >= 320 || (a.damage >= 95 && landingSpeed >= 10.5);
        }
      }
      if (!a.crashed) {
        a.verticalSpeed = 0;
        a.onGround = true;
        a.roll = THREE.MathUtils.damp(a.roll,0,5,frameDt);
        a.pitch = THREE.MathUtils.damp(a.pitch,0,5,frameDt);
      }
    }

    a.mesh.position.copy(a.position);
    // Match the visible model to the semantic flight controls: UP noses the plane
    // up, DOWN noses it down, LEFT banks left and RIGHT banks right. Movement/yaw
    // signs stay unchanged; only the previously inverted visual attitude is fixed.
    a.mesh.rotation.set(-a.pitch, a.yaw, a.roll, 'YXZ');
    const prop = a.mesh.getObjectByName('aircraft_propeller');
    if (prop) prop.rotation.z += frameDt * (5 + a.throttle * 32 + Math.abs(a.speed) * 0.12);
    return result;
  }
}
