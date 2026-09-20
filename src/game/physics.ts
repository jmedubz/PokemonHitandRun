import * as THREE from 'three';
import { CollisionSystem } from './doors';
import { ParticleEffectsManager } from './particles';
import { playSoundEffect, soundManager } from './audio';

export interface CarInputs {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  boost: boolean;
  /** Analogue input for mobile touch controls */
  analogActive?: boolean;
  analogSteer?: number; // -1 to 1 (left to right)
  analogThrottle?: number; // -1 to 1 (reverse to forward)
}

export interface PlayerInputs {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  /** False for characters whose second airborne press is reserved for another action (e.g. Charizard flight). */
  allowAirborneJump?: boolean;
  sprint: boolean;
  kick: boolean;
  water: boolean;
  /** Temporary status-effect multiplier used by web/ice powers. */
  movementScale?: number;
  /** Keep externally supplied horizontal momentum (e.g. being thrown from a moving car). */
  preserveMomentum?: boolean;
  /** Optional per-character collision body. Defaults preserve the existing roster. */
  collisionRadius?: number;
  collisionHeight?: number;
  /** Analogue input for smooth mobile joystick movement */
  analogActive?: boolean;
  analogX?: number; // -1 to 1 (screen left/right)
  analogY?: number; // -1 to 1 (screen up/down)
  analogMagnitude?: number; // 0.0 to 1.0 (smooth distance curve)
  analogAngle?: number; // joystick angle in radians
}

export class CarPhysics {
  public position: THREE.Vector3;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  /** Short-lived lateral momentum transferred by another vehicle impact. */
  public collisionSlideVelocity: THREE.Vector3 = new THREE.Vector3();
  /** Short-lived yaw rate from an off-centre vehicle impact. */
  public collisionYawVelocity: number = 0;
  public yaw: number = 0;
  public speed: number = 0;
  public steerAngle: number = 0;
  public driftFactor: number = 0;
  public isDrifting: boolean = false;
  public isBoosting: boolean = false;
  public boostFuel: number = 100; // 0 - 100
  public isBurnout: boolean = false;
  public lastCollisionImpact: number = 0;
  /** Vertical recovery velocity used only when a land vehicle genuinely leaves the road surface. */
  public verticalVelocity: number = 0;
  private collisionCooldown: number = 0;

  // Physics tuning (Arcade Hit & Run feel)
  public maxSpeed: number = 38;
  public reverseSpeed: number = 14;
  public acceleration: number = 26;
  public braking: number = 34;
  public friction: number = 0.985;
  public steerSpeed: number = 2.4;
  public driftSteerMultiplier: number = 1.6;
  public driftSpeedRetention: number = 0.96;
  public highSpeedSteerScale: number = 0.68;
  /** Per-model broad-phase dimensions; defaults preserve every existing vehicle. */
  public collisionRadius: number = 1.8;
  public collisionHeight: number = 2.2;
  /** Tight oriented chassis footprint used for wall contact; avoids sedan-sized invisible corner circles. */
  public collisionHalfWidth: number = 0.98;
  public collisionHalfLength: number = 2.25;
  public boostMultiplier: number = 1.35;
  public boostDrainRate: number = 30;
  public boostRechargeRate: number = 8;
  public surfaceMode: 'ground' | 'water' = 'ground';
  public waterSurfaceY: number = 0.12;
  public waterMinX: number = -48;
  public waterMaxX: number = 48;
  public waterMinZ: number = -228;
  public waterMaxZ: number = 228;
  /** Optional land-vehicle navigation mask (open river water in the current map).
   * Boats ignore this entirely through surfaceMode='water'. */
  public groundForbidden: ((point: THREE.Vector3) => boolean) | null = null;
  private groundForbiddenProbe = new THREE.Vector3();

  constructor(initialPos: THREE.Vector3, initialYaw: number = 0) {
    this.position = initialPos.clone();
    this.yaw = initialYaw;
  }

  /** Apply the resolved world-space velocity from a car-to-car collision without
   * throwing away the lateral component. Normal steering still owns the forward
   * speed; the transferred side momentum and spin then decay naturally. */
  public applyVehicleCollisionResponse(worldVelocity: THREE.Vector3, yawVelocity = 0) {
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const forwardSpeed = worldVelocity.dot(forward);
    this.speed = THREE.MathUtils.clamp(forwardSpeed, -this.reverseSpeed * 1.15, this.maxSpeed * 1.12);
    this.collisionSlideVelocity.copy(worldVelocity).addScaledVector(forward, -this.speed).setY(0);
    if (this.collisionSlideVelocity.length() > 16) this.collisionSlideVelocity.setLength(16);
    this.collisionYawVelocity = THREE.MathUtils.clamp(this.collisionYawVelocity + yawVelocity, -3.2, 3.2);
    this.velocity.copy(worldVelocity).setY(0);
  }

  private groundVehicleFootprintForbidden(position: THREE.Vector3): boolean {
    if (!this.groundForbidden || this.surfaceMode !== 'ground') return false;
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const samples = [
      [0, 0],
      [this.collisionHalfLength, 0], [-this.collisionHalfLength * 0.82, 0],
      [0, this.collisionHalfWidth], [0, -this.collisionHalfWidth],
      [this.collisionHalfLength * 0.82, this.collisionHalfWidth * 0.88],
      [this.collisionHalfLength * 0.82, -this.collisionHalfWidth * 0.88],
    ] as const;
    for (const [forward, side] of samples) {
      this.groundForbiddenProbe.set(
        position.x + fwdX * forward + rightX * side,
        position.y,
        position.z + fwdZ * forward + rightZ * side,
      );
      if (this.groundForbidden(this.groundForbiddenProbe)) return true;
    }
    return false;
  }

  public update(
    dt: number,
    inputs: CarInputs,
    collisionSystem: CollisionSystem,
    particles?: ParticleEffectsManager,
    engineAudio = true
  ) {
    // Clamp delta
    const clampedDt = Math.min(dt, 0.1);
    this.collisionCooldown = Math.max(0, this.collisionCooldown - clampedDt);
    this.lastCollisionImpact = 0;

    // Boost logic (Nitro)
    if (inputs.boost && this.boostFuel > 5) {
      this.isBoosting = true;
      this.boostFuel = Math.max(0, this.boostFuel - this.boostDrainRate * clampedDt);
    } else {
      this.isBoosting = false;
      this.boostFuel = Math.min(100, this.boostFuel + this.boostRechargeRate * clampedDt);
    }

    const currentAccel = this.isBoosting ? this.acceleration * 1.8 : this.acceleration;
    const currentMaxSpeed = this.isBoosting ? this.maxSpeed * this.boostMultiplier : this.maxSpeed;

    // Acceleration / Braking
    if (inputs.analogActive && inputs.analogThrottle !== undefined && Math.abs(inputs.analogThrottle) > 0.05) {
      if (inputs.analogThrottle > 0) {
        const throttle = inputs.analogThrottle;
        this.speed += currentAccel * throttle * clampedDt;
        const targetSpeed = currentMaxSpeed * THREE.MathUtils.clamp(throttle, 0.35, 1.0);
        if (this.speed > targetSpeed) this.speed = targetSpeed;
      } else {
        const brake = -inputs.analogThrottle;
        if (this.speed > 1.0) {
          this.speed -= this.braking * brake * clampedDt;
        } else {
          this.speed -= currentAccel * 0.7 * brake * clampedDt;
          const targetRev = this.reverseSpeed * THREE.MathUtils.clamp(brake, 0.4, 1.0);
          if (this.speed < -targetRev) this.speed = -targetRev;
        }
      }
    } else if (inputs.forward) {
      this.speed += currentAccel * clampedDt;
      if (this.speed > currentMaxSpeed) this.speed = currentMaxSpeed;
    } else if (inputs.backward) {
      if (this.speed > 1.0) {
        // Braking while going forward
        this.speed -= this.braking * clampedDt;
      } else {
        // Reverse
        this.speed -= currentAccel * 0.7 * clampedDt;
        if (this.speed < -this.reverseSpeed) this.speed = -this.reverseSpeed;
      }
    } else {
      // Natural rolling friction
      this.speed *= Math.pow(this.friction, clampedDt * 60);
      if (Math.abs(this.speed) < 0.1) this.speed = 0;
    }

    // Burnout: hold throttle + handbrake at low speed. The car spins the tyres,
    // makes smoke, and then launches when the handbrake is released.
    this.isBurnout = (inputs.forward || (inputs.analogActive && (inputs.analogThrottle ?? 0) > 0.3)) && inputs.handbrake && Math.abs(this.speed) < 7;
    if (this.isBurnout) {
      this.speed = Math.min(this.speed, 4.5);
    }

    // Handbrake / Drift
    if (inputs.handbrake && Math.abs(this.speed) > 5) {
      this.isDrifting = true;
      this.speed *= Math.pow(this.driftSpeedRetention, clampedDt * 60); // Drift deceleration
      this.driftFactor = THREE.MathUtils.lerp(this.driftFactor, 1.0, 0.15);
    } else {
      this.isDrifting = false;
      this.driftFactor = THREE.MathUtils.lerp(this.driftFactor, 0.0, 0.1);
    }

    // Steering
    let steerDir = (inputs.left ? 1 : 0) - (inputs.right ? 1 : 0);
    if (inputs.analogActive && inputs.analogSteer !== undefined && Math.abs(inputs.analogSteer) > 0.05) {
      steerDir = -inputs.analogSteer;
    }
    const speedRatio = Math.min(Math.abs(this.speed) / 10, 1.0);
    const highSpeedRatio = THREE.MathUtils.clamp(Math.abs(this.speed) / Math.max(1, currentMaxSpeed), 0, 1);
    const speedSteerScale = THREE.MathUtils.lerp(1, this.highSpeedSteerScale, highSpeedRatio);
    const effectiveSteer = (this.isDrifting
      ? this.steerSpeed * this.driftSteerMultiplier
      : this.steerSpeed) * speedSteerScale;

    if (Math.abs(this.speed) > 0.2) {
      const reverseMultiplier = this.speed >= 0 ? 1 : -1;
      this.yaw += steerDir * effectiveSteer * speedRatio * clampedDt * reverseMultiplier;
    }

    // Vehicle-to-vehicle impacts can add a short-lived spin. Damping is deliberately
    // stronger than a simulator so the car visibly rotates from a quarter-panel hit
    // without continuing to pirouette down the street.
    if (Math.abs(this.collisionYawVelocity) > 0.001) {
      this.yaw += this.collisionYawVelocity * clampedDt;
      this.collisionYawVelocity *= Math.exp(-3.6 * clampedDt);
      if (Math.abs(this.collisionYawVelocity) < 0.01) this.collisionYawVelocity = 0;
    }

    // Forward direction vector
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);

    // Compute velocity. Keep a bounded lateral collision component so side impacts
    // physically shove the chassis instead of being projected away immediately.
    this.collisionSlideVelocity.multiplyScalar(Math.exp(-3.0 * clampedDt));
    if (this.collisionSlideVelocity.lengthSq() < 0.0025) this.collisionSlideVelocity.set(0, 0, 0);
    this.velocity.set(forwardX * this.speed, 0, forwardZ * this.speed).add(this.collisionSlideVelocity);

    // Candidate new position
    const nextPos = this.position.clone().addScaledVector(this.velocity, clampedDt);

    // Boats use the river as their driveable surface instead of snapping to road/terrain.
    // Keeping the boat inside authored water bounds also means it can pass naturally
    // beneath bridges without colliding with the roadway suspended above it.
    if (this.surfaceMode === 'water') {
      let hitBank = false;
      if (nextPos.x < this.waterMinX) { nextPos.x = this.waterMinX; hitBank = true; }
      if (nextPos.x > this.waterMaxX) { nextPos.x = this.waterMaxX; hitBank = true; }
      if (nextPos.z < this.waterMinZ) { nextPos.z = this.waterMinZ; hitBank = true; }
      if (nextPos.z > this.waterMaxZ) { nextPos.z = this.waterMaxZ; hitBank = true; }
      if (hitBank) {
        this.lastCollisionImpact = Math.abs(this.speed);
        this.speed *= -0.22;
        playSoundEffect('crash', this.position);
      }
      this.position.copy(nextPos);
      this.position.y = this.waterSurfaceY + Math.sin(performance.now() * 0.0026) * 0.035;
      if (particles && Math.abs(this.speed) > 3 && Math.random() < clampedDt * 5) {
        particles.emitWaterSpray(
          new THREE.Vector3(this.position.x - forwardX * 2.7, this.waterSurfaceY + 0.08, this.position.z - forwardZ * 2.7),
          new THREE.Vector3(-forwardX, 0.15, -forwardZ),
          1
        );
      }
      if (engineAudio) {
        if (Math.abs(this.speed) > 0.5) soundManager.playEngine(Math.abs(this.speed), currentMaxSpeed);
        else soundManager.stopEngine();
      }
      return;
    }

    // Open water is invalid terrain for every normal road vehicle, including a
    // hijacked/player-driven one. Test the full chassis footprint so the car cannot
    // hang a bumper into the river while its centre point remains on land.
    if (this.groundVehicleFootprintForbidden(nextPos)) {
      this.lastCollisionImpact = Math.abs(this.speed);
      this.speed *= -0.10;
      this.velocity.set(0, 0, 0);
      if (engineAudio) {
        if (Math.abs(this.speed) > 0.5) soundManager.playEngine(Math.abs(this.speed), currentMaxSpeed);
        else soundManager.stopEngine();
      }
      return;
    }

    // Check collision against city walls and closed doors
    // Player-driven cars treat destructible prop colliders as "soft". The player
    // still cannot walk through poles/trees/fences, but a moving car is allowed to
    // overlap them so WorldInteractionManager can launch the object dramatically.
    const resolved = collisionSystem.resolveOrientedVehicleCollision(
      this.position,
      nextPos,
      this.yaw,
      this.collisionHalfWidth,
      this.collisionHalfLength,
      this.collisionHeight,
      (collider) => collider.id.startsWith('prop_')
    );

    if (resolved.collided) {
      const impactSpeed = Math.abs(this.speed);
      // A scrape that still made useful forward progress is NOT a head-on crash.
      // Preserve momentum so the car naturally slides along the wall and steering
      // away immediately recovers it. Only near-zero progress gets a real bounce.
      const scrapeProgress = resolved.travelRatio;
      const impactSeverity = impactSpeed * THREE.MathUtils.lerp(1.0, 0.34, scrapeProgress);
      if (this.collisionCooldown <= 0 && impactSeverity > 4) {
        this.lastCollisionImpact = impactSeverity;
        this.collisionCooldown = scrapeProgress > 0.32 ? 0.18 : 0.28;
        playSoundEffect('crash', resolved.position);
        particles?.emitCrashBurst(
          resolved.position.clone().add(new THREE.Vector3(0, 0.65, 0)),
          Math.min(2.0, impactSeverity / 22)
        );
      }

      if (scrapeProgress >= 0.24) {
        const retention = THREE.MathUtils.lerp(0.62, 0.91, scrapeProgress);
        this.speed *= retention;
      } else {
        // Strong head-on contact: readable arcade bounce without embedding the car
        // or reversing it so violently that it ricochets across the road.
        this.speed = -this.speed * (impactSpeed > 24 ? 0.16 : 0.24);
      }
      this.collisionSlideVelocity.multiplyScalar(scrapeProgress >= 0.24 ? 0.58 : 0.28);
      this.collisionYawVelocity *= scrapeProgress >= 0.24 ? 0.72 : 0.45;
      this.position.copy(resolved.position);
    } else {
      this.position.copy(nextPos);
    }

    // Stay on the nearest reachable road/deck. This avoids snapping a car onto
    // a bridge simply because it happens to pass above the current road.
    const chassisGround = collisionSystem.getGroundHeightNear(
      this.position.x,
      this.position.z,
      this.position.y - 0.08,
      0.12,
      1.0,
      4.0
    );
    const targetChassisY = chassisGround + 0.08;
    // Corrupt save/crash states should re-enter a physical fall instead of allowing
    // a land vehicle to keep driving tens of metres above the road indefinitely.
    if (!Number.isFinite(this.position.y) || this.position.y > targetChassisY + 30) {
      this.position.y = targetChassisY + 16;
      this.verticalVelocity = Math.min(0, this.verticalVelocity);
    }
    const chassisDelta = targetChassisY - this.position.y;
    if (chassisDelta < -0.75) {
      // The chassis is genuinely above its reachable road/deck. Keep its horizontal
      // momentum but let gravity bring it back instead of navigation preserving a
      // floating Y or instantly teleporting it down. This also recovers corrupted
      // airborne states from crashes/spawns in a physically readable way.
      this.verticalVelocity = Math.max(-28, this.verticalVelocity - 25 * clampedDt);
      this.position.y += this.verticalVelocity * clampedDt;
      if (this.position.y <= targetChassisY) {
        this.position.y = targetChassisY;
        this.verticalVelocity = 0;
      }
    } else {
      this.verticalVelocity = 0;
      // Smooth tiny road/sidewalk seams instead of visually hopping the whole car.
      this.position.y = Math.abs(chassisDelta) < 0.75
        ? THREE.MathUtils.damp(this.position.y, targetChassisY, 20, clampedDt)
        : targetChassisY;
    }

    // Engine audio pitch modulation
    if (engineAudio) {
      if (Math.abs(this.speed) > 0.5) {
        soundManager.playEngine(Math.abs(this.speed), currentMaxSpeed);
      } else {
        soundManager.stopEngine();
      }
    }

    // Tire smoke particle emission during drift or hard braking
    if (particles && this.isBoosting && Math.random() < clampedDt * 35) {
      particles.emitNitroExhaust(this.position, this.yaw);
    }

    if (particles && (this.isDrifting || this.isBurnout || (inputs.backward && this.speed > 8))) {
      const rearOffset = 1.8;
      const wheelSpan = 0.9;
      const leftWheel = new THREE.Vector3(
        this.position.x - forwardX * rearOffset - forwardZ * wheelSpan,
        0.2,
        this.position.z - forwardZ * rearOffset + forwardX * wheelSpan
      );
      const rightWheel = new THREE.Vector3(
        this.position.x - forwardX * rearOffset + forwardZ * wheelSpan,
        0.2,
        this.position.z - forwardZ * rearOffset - forwardX * wheelSpan
      );
      particles.emitTireSmoke(leftWheel, 2);
      particles.emitTireSmoke(rightWheel, 2);
    }
  }
}

export interface PlayerMovementResult {
  cameraAngle: number;
  isWalkingBackward: boolean;
  /** One-frame movement events used for camera/FX without coupling world systems into physics. */
  didDoubleJump: boolean;
  didStompStart: boolean;
  didStompLand: boolean;
}

export class PlayerMovement {
  public position: THREE.Vector3;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public yaw: number = 0;
  public isGrounded: boolean = true;
  public isKicking: boolean = false;
  public kickTimer: number = 0;
  public isSprayingWater: boolean = false;
  public isWalkingBackward: boolean = false;

  public walkSpeed: number = 7.5;
  public runSpeed: number = 22.0; // Much faster forward sprint
  public backwardSpeed: number = 5.2;
  public sideSpeed: number = 4.2;
  public jumpForce: number = 9.5;
  public doubleJumpForce: number = 9.0;
  public gravity: number = 24.0;
  public stompGravity: number = 46.0;
  public stompFallSpeed: number = 31.0;
  public turnSpeed: number = 2.5;
  /** Number of upward jump impulses used since the last valid landing (0..2). */
  public jumpsUsed: number = 0;
  /** True only during the fast downward ground-pound phase. */
  public isStomping: boolean = false;
  private jumpWasHeld: boolean = false;

  constructor(initialPos: THREE.Vector3, initialYaw: number = 0) {
    this.position = initialPos.clone();
    this.yaw = initialYaw;
  }

  /**
   * Reset every transient locomotion/jump latch after an intentional teleport,
   * respawn or manual recovery. Merely moving `position`/zeroing `velocity` is not
   * enough: a reset performed during a jump can otherwise leave `isGrounded`,
   * `jumpsUsed`, the stomp state or the edge-triggered Space latch in their old
   * airborne values, which makes the first jump after recovery behave incorrectly.
   */
  public resetForTeleport(position: THREE.Vector3, yaw: number = this.yaw, grounded = true): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;

    this.isGrounded = grounded;
    this.jumpsUsed = 0;
    this.isStomping = false;
    this.jumpWasHeld = false;

    this.isKicking = false;
    this.kickTimer = 0;
    this.isSprayingWater = false;
    this.isWalkingBackward = false;
  }

  public update(
    dt: number,
    inputs: PlayerInputs,
    cameraAngle: number,
    collisionSystem: CollisionSystem,
    particles?: ParticleEffectsManager,
    dynamicGroundY?: number
  ): PlayerMovementResult {
    const clampedDt = Math.min(dt, 0.1);
    const playerRadius = THREE.MathUtils.clamp(inputs.collisionRadius ?? 0.65, 0.45, 1.25);
    const playerHeight = THREE.MathUtils.clamp(inputs.collisionHeight ?? 1.9, 1.4, 3.3);
    let didDoubleJump = false;
    let didStompStart = false;
    let didStompLand = false;

    // Jump actions are edge-triggered. Holding Space cannot accidentally fire the
    // first jump, double jump and stomp in consecutive frames. The intended chain is:
    // Space -> release -> Space -> release -> Space (stomp).
    const jumpPressed = inputs.jump && !this.jumpWasHeld;
    this.jumpWasHeld = inputs.jump;
    if (this.isGrounded && !this.isStomping) this.jumpsUsed = 0;

    // Kick timer
    if (this.isKicking) {
      this.kickTimer -= clampedDt;
      if (this.kickTimer <= 0) {
        this.isKicking = false;
      }
    } else if (inputs.kick) {
      this.isKicking = true;
      this.kickTimer = 0.4;
      playSoundEffect('kick', this.position);
    }

    // Water spray
    this.isSprayingWater = inputs.water;
    if (this.isSprayingWater && particles) {
      const sprayOrigin = this.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const sprayDir = new THREE.Vector3(Math.sin(this.yaw), 0.1, Math.cos(this.yaw)).normalize();
      particles.emitWaterSpray(sprayOrigin, sprayDir, 3);
      if (Math.random() < 0.2) playSoundEffect('water', sprayOrigin);
    }

    let updatedCameraAngle = cameraAngle;
    const effectiveTurnRate = inputs.sprint ? this.turnSpeed * 1.25 : this.turnSpeed;

    this.isWalkingBackward = false;
    let targetVx = 0;
    let targetVz = 0;
    let hasMovement = false;

    if (inputs.analogActive && inputs.analogMagnitude !== undefined && inputs.analogMagnitude > 0.01) {
      // =========================================================================
      // ANALOGUE MOBILE JOYSTICK MOVEMENT (Smooth 360° Angle + Continuous Speed)
      // =========================================================================
      // Screen joystick: analogX (-1 left to +1 right), analogY (-1 up/forward to +1 down/backward)
      // Negate analogX to match camera-relative horizontal orientation in Three.js world space
      const stickAngle = Math.atan2(-(inputs.analogX ?? 0), -(inputs.analogY ?? 0));
      const desiredWorldYaw = updatedCameraAngle + stickAngle;

      // Smoothly rotate character to face the direction of movement
      let yawDiff = desiredWorldYaw - this.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const turnResponsiveness = 14.0;
      this.yaw += yawDiff * Math.min(clampedDt * turnResponsiveness, 1.0);
      while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
      while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

      // Continuous speed curve:
      // - Near centre (mag 0.05-0.3): slow, precise micro-walk (1.6 - 3.5 m/s)
      // - Halfway (mag ~0.5): steady walk (~7.5 m/s)
      // - Further out (mag 0.75): fast walk (~14 m/s)
      // - Outer edge (mag 1.0): full sprint speed (22.0 m/s)
      const mag = THREE.MathUtils.clamp(inputs.analogMagnitude, 0, 1);
      const movementScale = THREE.MathUtils.clamp(inputs.movementScale ?? 1, 0.28, 1);
      let targetSpeed: number;
      if (mag <= 0.45) {
        const t = mag / 0.45;
        targetSpeed = THREE.MathUtils.lerp(1.6, this.walkSpeed, t * t);
      } else {
        const t = (mag - 0.45) / 0.55;
        targetSpeed = THREE.MathUtils.lerp(this.walkSpeed, this.runSpeed, t * (2 - t));
      }
      targetSpeed *= movementScale;

      targetVx = Math.sin(desiredWorldYaw) * targetSpeed;
      targetVz = Math.cos(desiredWorldYaw) * targetSpeed;
      hasMovement = true;
    } else if (inputs.analogActive) {
      // Analogue joystick is active, but thumb is within center deadzone -> smooth stop
      hasMovement = false;
    } else {
      // =========================================================================
      // STANDARD PC / KEYBOARD CONTROLS (WASD / Arrow Keys) - 100% PRESERVED
      // =========================================================================
      // 1. Sideways steering (Left / Right turning & camera follow):
      if (inputs.left && !inputs.right) {
        this.yaw += effectiveTurnRate * clampedDt;
        updatedCameraAngle += effectiveTurnRate * clampedDt;
      } else if (inputs.right && !inputs.left) {
        this.yaw -= effectiveTurnRate * clampedDt;
        updatedCameraAngle -= effectiveTurnRate * clampedDt;
      }

      // Wrap yaw and updatedCameraAngle in [-PI, PI] to keep angles normalized
      while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
      while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
      while (updatedCameraAngle > Math.PI) updatedCameraAngle -= Math.PI * 2;
      while (updatedCameraAngle < -Math.PI) updatedCameraAngle += Math.PI * 2;

      // 2. Align forward orientation if moving forward and not actively steering
      if (inputs.forward && !inputs.left && !inputs.right) {
        let angleDiff = updatedCameraAngle - this.yaw;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        this.yaw += angleDiff * Math.min(clampedDt * 10, 1.0);
      }

      // 3. Movement Direction & Speed Calculation
      const fX = Math.sin(this.yaw);
      const fZ = Math.cos(this.yaw);
      const lX = Math.cos(this.yaw);
      const lZ = -Math.sin(this.yaw);
      const rX = -Math.cos(this.yaw);
      const rZ = Math.sin(this.yaw);

      const movementScale = THREE.MathUtils.clamp(inputs.movementScale ?? 1, 0.28, 1);
      const forwardSpeed = (inputs.sprint ? this.runSpeed : this.walkSpeed) * movementScale;
      const backwardSpeed = (inputs.sprint ? this.backwardSpeed * 1.7 : this.backwardSpeed) * movementScale;
      const sideSpeed = (inputs.sprint ? this.sideSpeed * 1.3 : this.sideSpeed) * movementScale;

      if (inputs.forward && !inputs.backward) {
        // FORWARD MOVEMENT (W / ArrowUp)
        targetVx += fX * forwardSpeed;
        targetVz += fZ * forwardSpeed;
        hasMovement = true;

        // Blend sideways if holding A or D
        if (inputs.left && !inputs.right) {
          targetVx += lX * sideSpeed * 0.7;
          targetVz += lZ * sideSpeed * 0.7;
        } else if (inputs.right && !inputs.left) {
          targetVx += rX * sideSpeed * 0.7;
          targetVz += rZ * sideSpeed * 0.7;
        }
      } else if (inputs.backward && !inputs.forward) {
        // BACKWARDS MOVEMENT (S / ArrowDown)
        this.isWalkingBackward = true;
        targetVx -= fX * backwardSpeed;
        targetVz -= fZ * backwardSpeed;
        hasMovement = true;

        // Blend sideways if holding A or D
        if (inputs.left && !inputs.right) {
          targetVx += lX * sideSpeed * 0.7;
          targetVz += lZ * sideSpeed * 0.7;
        } else if (inputs.right && !inputs.left) {
          targetVx += rX * sideSpeed * 0.7;
          targetVz += rZ * sideSpeed * 0.7;
        }
      } else if (inputs.left && !inputs.right) {
        // ONLY LEFT (A / ArrowLeft): slowly moves left
        targetVx += lX * sideSpeed;
        targetVz += lZ * sideSpeed;
        hasMovement = true;
      } else if (inputs.right && !inputs.left) {
        // ONLY RIGHT (D / ArrowRight): slowly moves right
        targetVx += rX * sideSpeed;
        targetVz += rZ * sideSpeed;
        hasMovement = true;
      }
    }

    if (this.isStomping) {
      // Ground-pound keeps a little steering for arcade control, but the player should
      // commit to the drop instead of air-strafing across an entire street.
      targetVx *= 0.34;
      targetVz *= 0.34;
    }

    if (hasMovement) {
      // Responsive acceleration to target velocity
      const airResponsiveness = this.isStomping ? 7 : 16;
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVx, Math.min(clampedDt * airResponsiveness, 1.0));
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVz, Math.min(clampedDt * airResponsiveness, 1.0));
    } else {
      // Natural deceleration. External knockback/ejection momentum deliberately
      // uses much lighter drag so a character thrown from a moving vehicle keeps
      // travelling/rolling instead of having their horizontal speed erased in one
      // or two frames. Collision/gravity below still remain fully authoritative.
      const dragBase = inputs.preserveMomentum ? 0.74 : 0.1;
      const dragRate = inputs.preserveMomentum ? 3.0 : 8.0;
      this.velocity.x *= Math.pow(dragBase, clampedDt * dragRate);
      this.velocity.z *= Math.pow(dragBase, clampedDt * dragRate);
      if (Math.abs(this.velocity.x) < 0.05) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.05) this.velocity.z = 0;
    }

    // Simpsons-style movement chain: first jump -> double jump -> stomp.
    if (jumpPressed) {
      if (this.isGrounded) {
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        this.isStomping = false;
        this.jumpsUsed = 1;
        playSoundEffect('jump', this.position);
      } else if (inputs.allowAirborneJump !== false && !this.isStomping && this.jumpsUsed === 1) {
        // Reset most downward/upward carry so the second jump feels immediate and
        // consistent whether pressed near the apex or during the fall.
        this.velocity.y = Math.max(this.doubleJumpForce, this.velocity.y * 0.22 + this.doubleJumpForce * 0.78);
        this.jumpsUsed = 2;
        didDoubleJump = true;
        playSoundEffect('doubleJump', this.position);
      } else if (inputs.allowAirborneJump !== false && !this.isStomping && this.jumpsUsed >= 2) {
        // A third fresh Space press is a ground-pound, never a third upward jump.
        this.isStomping = true;
        this.velocity.y = -this.stompFallSpeed;
        this.velocity.x *= 0.58;
        this.velocity.z *= 0.58;
        didStompStart = true;
      }
    }

    // Gravity. Stomp uses a stronger acceleration and terminal speed so the move is
    // snappy rather than floaty, while retaining bounded velocities for stability.
    if (!this.isGrounded) {
      const gravity = this.isStomping ? this.stompGravity : this.gravity;
      const terminal = this.isStomping ? -38 : -28;
      this.velocity.y = Math.max(terminal, this.velocity.y - gravity * clampedDt);
    }

    // Candidate new position
    const nextPos = this.position.clone().addScaledVector(this.velocity, clampedDt);

    // Indoor ceiling safety. Upper floors/roof slabs and authored collider bottoms
    // cap the player's FEET so double-jumping cannot push the character through a
    // ceiling in rooms that do not have enough vertical clearance.
    if (this.velocity.y > 0) {
      const ceiling = collisionSystem.getCeilingHeightNear(nextPos.x, nextPos.z, this.position.y, 6.5);
      if (ceiling !== null) {
        const maxFeetY = ceiling - (playerHeight + 0.04);
        if (nextPos.y > maxFeetY) {
          nextPos.y = Math.max(this.position.y, maxFeetY);
          this.velocity.y = Math.min(0, this.velocity.y);
        }
      }
    }

    // Use the nearest REACHABLE authored surface, not simply the highest surface
    // at this X/Z. This fixes roads/bridges appearing through the character and
    // removes sudden jumps when surfaces overlap in the map.
    const hasDynamicGround = dynamicGroundY !== undefined && Number.isFinite(dynamicGroundY) && this.isGrounded && !inputs.jump;
    const stationaryGrounded =
      this.isGrounded &&
      !inputs.jump &&
      !hasMovement &&
      !this.isStomping &&
      Math.abs(this.velocity.x) < 0.0001 &&
      Math.abs(this.velocity.y) < 0.0001 &&
      Math.abs(this.velocity.z) < 0.0001;
    // A car roof/bonnet is a legitimate moving floor. Previously the static-ground
    // query saw the road underneath it and briefly put the player into a falling
    // state every frame before App reattached them to the car, causing the jittery
    // "can't stand on cars" behaviour. Keep the dynamic floor for this movement
    // step; App still verifies the rendered roof again after horizontal movement.
    const currentGround = hasDynamicGround
      ? dynamicGroundY!
      : collisionSystem.getGroundHeightNear(
          this.position.x,
          this.position.z,
          this.position.y,
          0.12,
          0.7,
          3.0
        );
    const normalTargetGround = hasDynamicGround
      ? dynamicGroundY!
      : stationaryGrounded
        ? currentGround
        : collisionSystem.getGroundHeightNear(
            nextPos.x,
            nextPos.z,
            currentGround,
            0.12,
            0.62,
            3.0
          );
    // Airborne movement needs a deeper downward search than walking. This is
    // essential for a stomp from a roof/platform: the nearest authored surface below
    // (platform, vehicle handled in App, then ground) must be found before the body
    // can tunnel through it.
    const airborneTargetGround = !this.isGrounded
      ? collisionSystem.getGroundHeightNear(
          nextPos.x, nextPos.z, this.position.y, normalTargetGround, 0.72, this.isStomping ? 120 : 42
        )
      : normalTargetGround;
    const maxStepUp = 0.62;
    const maxSnapDown = 0.55;

    // GLOBAL STAIR REPAIR: sprinting can move farther than one tread per frame.
    // Sample the authored staircase continuously so each individual rise/drop is
    // validated instead of incorrectly comparing the bottom with a tread several
    // steps ahead. Non-stair movement still uses the normal ledge rules below.
    const stairTargetGround = this.isGrounded && !inputs.jump && !hasDynamicGround && !stationaryGrounded
      ? collisionSystem.traceWalkableStairPath(
          this.position, nextPos, currentGround, maxStepUp, maxSnapDown
        )
      : null;
    const usedStairPath = stairTargetGround !== null;
    const targetGround = stairTargetGround ?? (this.isGrounded ? normalTargetGround : airborneTargetGround);

    if (this.isGrounded && !inputs.jump) {
      const stepDelta = targetGround - currentGround;
      if (stepDelta > maxStepUp && !usedStairPath) {
        // This is a wall/ledge, not a curb. Don't climb it by accident.
        nextPos.x = this.position.x;
        nextPos.z = this.position.z;
        nextPos.y = currentGround;
        this.velocity.x = 0;
        this.velocity.z = 0;
      } else if (stepDelta < -maxSnapDown && !usedStairPath) {
        // Walked off a real ledge. Begin falling rather than teleporting downward.
        nextPos.y = this.position.y;
        this.isGrounded = false;
      } else {
        // Small road/sidewalk seams are smoothed. Stair paths are already validated
        // tread-by-tread, so a fast sprint can legitimately climb several steps in
        // one frame without being treated as a vertical wall.
        const smoothThreshold = usedStairPath ? 0.72 : 0.4;
        nextPos.y = Math.abs(targetGround - this.position.y) < smoothThreshold
          ? THREE.MathUtils.damp(this.position.y, targetGround, usedStairPath ? 32 : 24, clampedDt)
          : targetGround;
        this.velocity.y = 0;
      }
    } else if (nextPos.y <= targetGround && this.velocity.y <= 0) {
      const stompLanding = this.isStomping;
      nextPos.y = targetGround;
      this.velocity.y = 0;
      this.isGrounded = true;
      this.isStomping = false;
      this.jumpsUsed = 0;
      if (stompLanding) didStompLand = true;
    }

    // Swept collision is unnecessary when the grounded player has literally not
    // moved. The old idle path still did a wall sweep plus three equivalent ground
    // probes every render frame, which becomes significant in a world with hundreds
    // of authored walkable surfaces. Keep one authoritative floor probe so teleports
    // or changing authored support remain safe, but skip duplicate exact work at rest.
    if (stationaryGrounded) {
      this.position.copy(nextPos);
    } else {
      const resolved = collisionSystem.resolveCollision(this.position, nextPos, playerRadius, playerHeight);
      this.position.copy(resolved.position);

      // If a wall blocked the horizontal move, recompute the floor at the actual
      // resolved position so the player cannot hover at the rejected target height.
      if (this.isGrounded) {
        const resolvedGround = collisionSystem.getGroundHeightNear(
          this.position.x,
          this.position.z,
          this.position.y,
          0.12,
          0.62,
          3.0
        );
        if (Math.abs(resolvedGround - this.position.y) < 0.7) this.position.y = resolvedGround;
      }
    }

    return {
      cameraAngle: updatedCameraAngle,
      isWalkingBackward: this.isWalkingBackward,
      didDoubleJump,
      didStompStart,
      didStompLand,
    };
  }

  /** Called when App's dynamic vehicle-top solver catches a stomp before static ground. */
  public completeDynamicStompLanding(): boolean {
    if (!this.isStomping) return false;
    this.isStomping = false;
    this.isGrounded = true;
    this.velocity.y = 0;
    this.jumpsUsed = 0;
    return true;
  }
}

export interface PoliceWaterPursuitContext {
  /** True while the pursued player/boat is actually inside open swimmable river water. */
  playerInWater: boolean;
  /** Road vehicles must never enter points for which this returns true. Bridge decks are excluded by App. */
  isWater: (position: THREE.Vector3) => boolean;
  /** Per-unit land-side staging point used to spread police cars along the shoreline. */
  shoreTarget: THREE.Vector3 | null;
  waterSurfaceY: number;
}

export class PoliceAI {
  public mesh: THREE.Group;
  /** Police CAR position. Kept separate from the officer after they exit. */
  public position: THREE.Vector3;
  public yaw: number = 0;
  public speed: number = 0;
  public maxSpeed: number = 32;
  public sirenLightTimer: number = 0;
  public isRedLight: boolean = true;
  public sirenRedLight: THREE.Mesh;
  public sirenBlueLight: THREE.Mesh;
  public bustTimer: number = 0;
  public ramCooldown: number = 0;
  public pursuitSlot: number;
  public officerMesh: THREE.Group | null;

  private recoveryTimer = 0;
  private motionlessTimer = 0;
  private predicted = new THREE.Vector3();
  private toTarget = new THREE.Vector3();
  private nextPos = new THREE.Vector3();
  private lookAhead = new THREE.Vector3();
  private lastPosition = new THREE.Vector3();
  private avoidance = new THREE.Vector3();
  private officerNext = new THREE.Vector3();
  private waterProbe = new THREE.Vector3();
  private officerExitStart = new THREE.Vector3();
  private officerExitEnd = new THREE.Vector3();
  private officerExitTimer = 0;
  private officerAnimTime = 0;
  private pursuitMode: 'vehicle' | 'exiting' | 'foot' | 'swimming' = 'vehicle';

  constructor(
    mesh: THREE.Group,
    spawnPos: THREE.Vector3,
    pursuitSlot = 0,
    spawnYaw = 0,
    officerMesh: THREE.Group | null = null,
  ) {
    this.mesh = mesh;
    this.position = spawnPos.clone();
    this.lastPosition.copy(spawnPos);
    this.pursuitSlot = pursuitSlot;
    this.yaw = spawnYaw;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = spawnYaw;
    this.officerMesh = officerMesh;
    if (this.officerMesh) {
      this.officerMesh.visible = false;
      this.officerMesh.position.copy(spawnPos);
    }

    // Cheap emissive-style lightbar geometry rather than real PointLights.
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2070ff });
    this.sirenRedLight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.22), redMat);
    this.sirenBlueLight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.22), blueMat);
    this.sirenRedLight.position.set(-0.28, 1.62, 0);
    this.sirenBlueLight.position.set(0.28, 1.62, 0);
    this.mesh.add(this.sirenRedLight, this.sirenBlueLight);
  }

  public getPursuitPosition(): THREE.Vector3 {
    return this.pursuitMode === 'vehicle' || !this.officerMesh ? this.position : this.officerMesh.position;
  }

  public getVehiclePosition(): THREE.Vector3 {
    return this.position;
  }

  public isVehicleDriving(): boolean {
    return this.pursuitMode === 'vehicle';
  }

  public isOfficerSwimming(): boolean {
    return this.pursuitMode === 'swimming';
  }

  private vehicleFootprintTouchesWater(position: THREE.Vector3, yaw: number, isWater: (point: THREE.Vector3) => boolean): boolean {
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const probes = [
      [0, 0], [2.45, 0], [-2.0, 0], [0, 1.02], [0, -1.02],
      [2.1, 0.92], [2.1, -0.92],
    ] as const;
    for (const [forward, side] of probes) {
      this.waterProbe.set(
        position.x + fwdX * forward + rightX * side,
        position.y,
        position.z + fwdZ * forward + rightZ * side,
      );
      if (isWater(this.waterProbe)) return true;
    }
    return false;
  }

  private beginOfficerExit(collisionSystem: CollisionSystem, water?: PoliceWaterPursuitContext | null) {
    if (!this.officerMesh || this.pursuitMode !== 'vehicle') return;
    this.pursuitMode = 'exiting';
    this.speed = 0;
    this.recoveryTimer = 0;
    this.motionlessTimer = 0;
    this.officerExitTimer = 0.72;

    // Australian/right-hand-drive flavour prefers the vehicle's right side, but at
    // a shoreline that side may face the river. Try both doors and choose a clear
    // LAND position so the officer never spawns directly into the water.
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    let chosenSide = 1;
    for (const side of [1, -1]) {
      const candidate = new THREE.Vector3(
        this.position.x + rightX * 1.75 * side,
        this.position.y,
        this.position.z + rightZ * 1.75 * side,
      );
      candidate.y = collisionSystem.getGroundHeightNear(candidate.x, candidate.z, this.position.y, this.position.y, 1.0, 3.5);
      if (water?.isWater(candidate)) continue;
      if (!collisionSystem.canOccupy(candidate, 0.38, 1.8)) continue;
      chosenSide = side;
      break;
    }
    this.officerExitStart.set(
      this.position.x + rightX * 0.48 * chosenSide,
      this.position.y,
      this.position.z + rightZ * 0.48 * chosenSide,
    );
    this.officerExitEnd.set(
      this.position.x + rightX * 1.75 * chosenSide,
      this.position.y,
      this.position.z + rightZ * 1.75 * chosenSide,
    );
    this.officerExitEnd.y = collisionSystem.getGroundHeightNear(
      this.officerExitEnd.x,
      this.officerExitEnd.z,
      this.position.y,
      this.position.y,
      1.0,
      3.5,
    );
    this.officerMesh.visible = true;
    this.officerMesh.position.copy(this.officerExitStart);
    this.officerMesh.rotation.set(0, this.yaw + Math.PI / 2, 0);
  }

  private animateOfficer(speed01: number, swimming: boolean) {
    if (!this.officerMesh) return;
    const legL = this.officerMesh.getObjectByName('leg_left');
    const legR = this.officerMesh.getObjectByName('leg_right');
    const armL = this.officerMesh.getObjectByName('arm_left');
    const armR = this.officerMesh.getObjectByName('arm_right');
    const phase = this.officerAnimTime * (swimming ? 7.2 : 8.5);
    const swing = Math.sin(phase) * speed01;
    if (legL) legL.rotation.x = THREE.MathUtils.damp(legL.rotation.x, swing * (swimming ? 0.75 : 0.65), 12, 1 / 60);
    if (legR) legR.rotation.x = THREE.MathUtils.damp(legR.rotation.x, -swing * (swimming ? 0.75 : 0.65), 12, 1 / 60);
    if (armL) armL.rotation.x = THREE.MathUtils.damp(armL.rotation.x, swimming ? -0.7 - swing * 0.9 : -swing * 0.55, 12, 1 / 60);
    if (armR) armR.rotation.x = THREE.MathUtils.damp(armR.rotation.x, swimming ? -0.7 + swing * 0.9 : swing * 0.55, 12, 1 / 60);
    this.officerMesh.rotation.x = THREE.MathUtils.damp(this.officerMesh.rotation.x, swimming ? -0.30 : 0, 8, 1 / 60);
  }

  private updateOfficerPursuit(
    dt: number,
    playerPos: THREE.Vector3,
    collisionSystem: CollisionSystem,
    water: PoliceWaterPursuitContext,
  ): boolean {
    if (!this.officerMesh) return false;
    this.speed = 0;
    this.officerAnimTime += dt;

    if (this.pursuitMode === 'exiting') {
      this.officerExitTimer = Math.max(0, this.officerExitTimer - dt);
      const alpha = 1 - this.officerExitTimer / 0.72;
      this.officerMesh.position.lerpVectors(this.officerExitStart, this.officerExitEnd, THREE.MathUtils.smoothstep(alpha, 0, 1));
      this.officerMesh.position.y = collisionSystem.getGroundHeightNear(
        this.officerMesh.position.x,
        this.officerMesh.position.z,
        this.position.y,
        this.officerMesh.position.y,
        1.0,
        3.2,
      );
      if (this.officerExitTimer <= 0) this.pursuitMode = 'foot';
      return false;
    }

    const officerPos = this.officerMesh.position;
    this.toTarget.copy(playerPos).sub(officerPos).setY(0);
    const planarDistance = this.toTarget.length();
    if (planarDistance > 0.001) this.toTarget.multiplyScalar(1 / planarDistance);
    const officerYaw = planarDistance > 0.001 ? Math.atan2(this.toTarget.x, this.toTarget.z) : this.officerMesh.rotation.y;
    this.officerMesh.rotation.y = officerYaw;

    const moveSpeed = this.pursuitMode === 'swimming' ? 4.15 : 5.15;
    this.officerNext.copy(officerPos).addScaledVector(this.toTarget, moveSpeed * dt);

    if (this.pursuitMode === 'swimming') {
      if (water.isWater(this.officerNext)) {
        officerPos.x = this.officerNext.x;
        officerPos.z = this.officerNext.z;
        officerPos.y = water.waterSurfaceY - 0.38 + Math.sin(this.officerAnimTime * 4.2 + this.pursuitSlot) * 0.045;
        this.animateOfficer(1, true);
      } else {
        // Player returned to land or the officer reached the shore: climb out and
        // continue the pursuit on foot. Never walk along the river bottom.
        this.pursuitMode = 'foot';
        const resolved = collisionSystem.resolveCollision(officerPos, this.officerNext, 0.36, 1.8);
        officerPos.copy(resolved.position);
        officerPos.y = collisionSystem.getGroundHeightNear(officerPos.x, officerPos.z, officerPos.y, officerPos.y, 1.0, 3.2);
        this.animateOfficer(0.8, false);
      }
    } else {
      if (water.isWater(this.officerNext)) {
        this.pursuitMode = 'swimming';
        officerPos.x = this.officerNext.x;
        officerPos.z = this.officerNext.z;
        officerPos.y = water.waterSurfaceY - 0.38;
        this.animateOfficer(1, true);
      } else {
        const resolved = collisionSystem.resolveCollision(officerPos, this.officerNext, 0.36, 1.8);
        officerPos.copy(resolved.position);
        officerPos.y = collisionSystem.getGroundHeightNear(officerPos.x, officerPos.z, officerPos.y, officerPos.y, 1.0, 3.2);
        this.animateOfficer(planarDistance > 0.6 ? 1 : 0, false);
      }
    }

    const arrestDistance = this.pursuitMode === 'swimming' ? 2.25 : 2.05;
    const finalDistance = Math.hypot(playerPos.x - officerPos.x, playerPos.z - officerPos.z);
    if (finalDistance < arrestDistance) {
      this.bustTimer += dt;
      if (this.bustTimer >= 1.45) {
        this.bustTimer = 0;
        return true;
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2.3);
    }
    return false;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    wantedLevel: number,
    collisionSystem: CollisionSystem,
    playerSpeed: number = 0,
    playerYaw: number = 0,
    peerPositions: readonly THREE.Vector3[] = [],
    roadTarget: THREE.Vector3 | null = null,
    water: PoliceWaterPursuitContext | null = null,
  ): boolean {
    if (wantedLevel <= 0) {
      this.sirenRedLight.visible = false;
      this.sirenBlueLight.visible = false;
      this.speed = THREE.MathUtils.damp(this.speed, 0, 4, dt);
      return false;
    }

    this.sirenLightTimer += dt * 8;
    this.isRedLight = Math.floor(this.sirenLightTimer) % 2 === 0;
    this.sirenRedLight.visible = this.isRedLight;
    this.sirenBlueLight.visible = !this.isRedLight;
    if (Math.random() < dt * 0.055) playSoundEffect('siren', this.mesh.position);

    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    this.recoveryTimer = Math.max(0, this.recoveryTimer - dt);

    // Car-to-car crash momentum is integrated by App at render cadence so a police
    // cruiser cannot instantly overwrite a transferred shove/spin with pursuit AI.
    // Once the short recovery window expires, normal pursuit steering resumes.
    if (Number(this.mesh.userData.vehicleCollisionRecoveryUntil ?? 0) > performance.now() * 0.001) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.yaw;
      return false;
    }

    if (water && this.pursuitMode !== 'vehicle') {
      return this.updateOfficerPursuit(dt, playerPos, collisionSystem, water);
    }

    const playerDist = this.position.distanceTo(playerPos);
    const absPlayerSpeed = Math.abs(playerSpeed);
    const playerForwardX = Math.sin(playerYaw);
    const playerForwardZ = Math.cos(playerYaw);
    const playerRightX = Math.cos(playerYaw);
    const playerRightZ = -Math.sin(playerYaw);

    // If the player is in open water, the POLICE CAR pursues a per-unit land-side
    // shoreline staging point. The officer takes over once the car has parked.
    const shoreTarget = water?.playerInWater ? water.shoreTarget : null;
    const chaseTarget = shoreTarget ?? playerPos;
    const dist = this.position.distanceTo(chaseTarget);

    const leadSeconds = THREE.MathUtils.clamp(dist / 70, 0.12, 0.85) * (0.45 + wantedLevel * 0.06);
    this.predicted.copy(chaseTarget);
    if (!shoreTarget) {
      this.predicted.add(new THREE.Vector3(
        playerForwardX * playerSpeed * leadSeconds,
        0,
        playerForwardZ * playerSpeed * leadSeconds
      ));
      if (roadTarget && dist > 24) this.predicted.lerp(roadTarget, dist > 55 ? 0.68 : 0.48);
      if (dist < 18) {
        const sideSign = this.pursuitSlot % 2 === 0 ? 1 : -1;
        const sideOffset = absPlayerSpeed > 4 ? 2.7 : 3.6;
        const rearOffset = absPlayerSpeed > 4 ? 3.0 : 1.2;
        this.predicted.x = playerPos.x - playerForwardX * rearOffset + playerRightX * sideOffset * sideSign;
        this.predicted.z = playerPos.z - playerForwardZ * rearOffset + playerRightZ * sideOffset * sideSign;
      }
    }

    // Keep police cars from forming one giant physics blob.
    this.avoidance.set(0, 0, 0);
    let nearestPeer = Infinity;
    for (const peer of peerPositions) {
      if (peer === this.position) continue;
      const dx = this.position.x - peer.x;
      const dz = this.position.z - peer.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < 0.0001) continue;
      const d = Math.sqrt(dSq);
      nearestPeer = Math.min(nearestPeer, d);
      if (d < 8.5) {
        const strength = (8.5 - d) / 8.5;
        this.avoidance.x += (dx / d) * strength * 6.0;
        this.avoidance.z += (dz / d) * strength * 6.0;
      }
    }
    this.predicted.add(this.avoidance);

    this.toTarget.copy(this.predicted).sub(this.position).setY(0);
    const targetYaw = Math.atan2(this.toTarget.x, this.toTarget.z);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const turnRate = 1.65 + wantedLevel * 0.10;
    const maxTurn = turnRate * dt;
    this.yaw += THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);

    const chaseCap = Math.min(this.maxSpeed, 25 + wantedLevel * 2.4);
    let targetSpeed = chaseCap;
    if (shoreTarget) {
      // Arrive deliberately rather than charging the shoreline at pursuit speed.
      targetSpeed = THREE.MathUtils.clamp((dist - 2.8) * 2.4, 0, Math.min(chaseCap, 16));
    } else {
      if (playerDist < 28) targetSpeed = Math.min(targetSpeed, Math.max(10, absPlayerSpeed + 8));
      if (playerDist < 15) targetSpeed = Math.min(targetSpeed, Math.max(7.5, absPlayerSpeed + 4.0));
      if (playerDist < 8.0) targetSpeed = Math.min(targetSpeed, Math.max(4.5, absPlayerSpeed + 1.8));
      if (playerDist < 5.0) targetSpeed = Math.min(targetSpeed, Math.max(2.5, absPlayerSpeed + 0.8));
    }
    if (nearestPeer < 5.0) targetSpeed *= THREE.MathUtils.clamp((nearestPeer - 2.3) / 2.7, 0.12, 1);
    if (Math.abs(diff) > 0.9) targetSpeed *= 0.62;

    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    this.lookAhead.set(this.position.x + forwardX * 5.0, this.position.y, this.position.z + forwardZ * 5.0);

    // Water is a hard navigation mask for road vehicles. Bridge corridors are
    // excluded by App's predicate, so legitimate bridge driving remains possible.
    const waterAhead = !!water?.isWater(this.lookAhead);
    if (waterAhead) {
      targetSpeed = 0;
      this.recoveryTimer = 0;
    }

    const forwardProbe = collisionSystem.resolveOrientedVehicleCollision(
      this.position, this.lookAhead, this.yaw, 1.02, 2.35, 2.25,
      (collider) => collider.id.startsWith('prop_')
    );
    if (!waterAhead && forwardProbe.collided && this.recoveryTimer <= 0) {
      let bestYaw: number | null = null;
      for (const offset of [0.72, -0.72, 1.15, -1.15]) {
        const testYaw = this.yaw + offset;
        const test = new THREE.Vector3(
          this.position.x + Math.sin(testYaw) * 5.0,
          this.position.y,
          this.position.z + Math.cos(testYaw) * 5.0
        );
        if (water?.isWater(test)) continue;
        if (!collisionSystem.resolveOrientedVehicleCollision(
          this.position, test, testYaw, 1.02, 2.35, 2.25,
          (collider) => collider.id.startsWith('prop_')
        ).collided) {
          bestYaw = testYaw;
          break;
        }
      }
      if (bestYaw !== null) {
        this.yaw = bestYaw;
        targetSpeed = Math.min(targetSpeed, 7.0);
      } else {
        this.recoveryTimer = 0.8;
      }
    }

    if (this.recoveryTimer > 0 && !waterAhead && !shoreTarget) {
      targetSpeed = -5.5;
      this.yaw += (this.pursuitSlot % 2 === 0 ? 1 : -1) * dt * 0.9;
    }
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, targetSpeed < this.speed ? 4.8 : 2.2, dt);

    const moveX = Math.sin(this.yaw);
    const moveZ = Math.cos(this.yaw);
    this.nextPos.set(
      this.position.x + moveX * this.speed * dt,
      this.position.y,
      this.position.z + moveZ * this.speed * dt
    );

    const policeWaterBlocked = !!water && this.vehicleFootprintTouchesWater(this.nextPos, this.yaw, water.isWater);
    if (policeWaterBlocked) {
      // Never allow any part of the police chassis to enter open water. The officer
      // takes over on foot/swimming once the car has safely stopped on land.
      this.speed = 0;
      this.nextPos.copy(this.position);
      if (water.playerInWater) this.beginOfficerExit(collisionSystem, water);
    } else {
      const resolved = collisionSystem.resolveOrientedVehicleCollision(
        this.position, this.nextPos, this.yaw, 1.02, 2.35, 2.25,
        (collider) => collider.id.startsWith('prop_')
      );
      this.position.copy(resolved.position);
      if (resolved.collided) {
        if (resolved.travelRatio >= 0.22) {
          this.speed *= THREE.MathUtils.lerp(0.58, 0.84, resolved.travelRatio);
          this.recoveryTimer = Math.max(this.recoveryTimer, 0.18);
        } else {
          this.speed *= -0.08;
          this.recoveryTimer = Math.max(this.recoveryTimer, 0.65);
        }
      }
    }

    if (shoreTarget && dist < 4.2 && Math.abs(this.speed) < 1.35) {
      this.speed = 0;
      this.beginOfficerExit(collisionSystem, water);
    }

    // Detect a car that is technically trying to move but has not made progress.
    const moved = this.position.distanceTo(this.lastPosition);
    if (this.pursuitMode === 'vehicle' && Math.abs(this.speed) > 3 && moved < 0.045 && !shoreTarget) this.motionlessTimer += dt;
    else this.motionlessTimer = Math.max(0, this.motionlessTimer - dt * 2);
    if (this.motionlessTimer > 0.75) {
      this.recoveryTimer = 1.0;
      this.motionlessTimer = 0;
    }
    this.lastPosition.copy(this.position);

    this.position.y = collisionSystem.getGroundHeightNear(
      this.position.x,
      this.position.z,
      this.position.y - 0.08,
      0.12,
      1.0,
      4.0
    ) + 0.08;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;

    if (this.pursuitMode !== 'vehicle' && water) {
      return this.updateOfficerPursuit(dt, playerPos, collisionSystem, water);
    }

    // Vehicle bust still requires an actual controlled stop/pin.
    if (playerDist < 4.7 && absPlayerSpeed < 4.2 && Math.abs(this.speed) < 8.5) {
      this.bustTimer += dt;
      if (this.bustTimer >= 2.8) {
        this.bustTimer = 0;
        return true;
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2.2);
    }
    return false;
  }
}
