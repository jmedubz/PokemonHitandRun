import * as THREE from 'three';

type AircraftCrashVisual = {
  group: THREE.Group;
  parent: THREE.Object3D | null;
  localAnchor: THREE.Vector3;
  worldAnchor: THREE.Vector3;
  age: number;
  duration: number;
  flames: THREE.Mesh[];
  smoke: THREE.Mesh[];
  flash: THREE.Mesh | null;
  shockwave: THREE.Mesh | null;
  scorch: THREE.Mesh | null;
  scorchGlow: THREE.Mesh | null;
  intensity: number;
};

export class ParticleEffectsManager {
  private scene: THREE.Scene;

  // Water spray particles (Poliwag)
  public waterPoints: THREE.Points | null = null;
  private waterPositions: Float32Array;
  private waterVelocities: THREE.Vector3[] = [];
  /** Bright continuous jet so Water Gun is unmistakably visible, even between particle ticks. */
  private waterBeam: THREE.Mesh | null = null;
  private waterBeamLife = 0;
  private readonly waterAxis = new THREE.Vector3(0, 1, 0);
  private readonly waterDirection = new THREE.Vector3();

  // Fire flame particles (Charmander & Explosions)
  public firePoints: THREE.Points | null = null;
  private firePositions: Float32Array;
  private fireVelocities: THREE.Vector3[] = [];
  private fireLifetimes: number[] = [];
  /** Continuous flame core so Charmander's attack reads clearly even between particle ticks. */
  private fireBeam: THREE.Mesh | null = null;
  private fireBeamLife = 0;
  private readonly fireAxis = new THREE.Vector3(0, 1, 0);
  private readonly fireDirection = new THREE.Vector3();

  // Electric spark particles (Pikachu & Crash Metal Sparks)
  public sparkPoints: THREE.Points | null = null;
  private sparkPositions: Float32Array;
  private sparkVelocities: THREE.Vector3[] = [];
  private electricRing: THREE.Mesh | null = null;
  private electricRingLife = 0;

  // Tire skid smoke particles
  public smokePoints: THREE.Points | null = null;
  private smokePositions: Float32Array;

  // Skid marks on road (pooled mesh ribbons)
  private skidMarkMeshes: THREE.Mesh[] = [];
  private skidPoolCursor = 0;
  private readonly skidGeometry = new THREE.PlaneGeometry(0.35, 1.8);
  private readonly skidMaterial = new THREE.MeshBasicMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });

  // Activity timers let completely idle particle buffers stop updating/rendering.
  private waterActivity = 0;
  private fireActivity = 0;
  private sparkActivity = 0;
  private smokeActivity = 0;
  private performanceMode = false;

  public setPerformanceMode(enabled: boolean) {
    this.performanceMode = enabled;
  }

  public getWarmupRenderPairs(): Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> {
    return [
      { geometry: this.crashFlameGeometry, material: this.crashFlameMaterial },
      { geometry: this.crashFlameCoreGeometry, material: this.crashFlameCoreMaterial },
      { geometry: this.crashFlameLargeGeometry, material: this.crashFlameMaterial },
      { geometry: this.crashSmokeGeometry, material: this.crashSmokeMaterial },
      { geometry: this.crashFlashGeometry, material: this.crashFlashMaterial },
      { geometry: this.crashShockwaveGeometry, material: this.crashShockwaveMaterial },
      { geometry: this.crashScorchGeometry, material: this.crashScorchMaterial },
      { geometry: this.crashScorchGlowGeometry, material: this.crashScorchGlowMaterial },
    ];
  }

  // Aircraft crash visuals: dynamic multi-node fiery wreck infernos and impact zone blazes.
  private aircraftCrashVisuals: AircraftCrashVisual[] = [];
  private readonly crashFlameGeometry = new THREE.ConeGeometry(0.52, 2.2, 8);
  private readonly crashFlameCoreGeometry = new THREE.ConeGeometry(0.34, 1.65, 8);
  private readonly crashFlameLargeGeometry = new THREE.ConeGeometry(0.88, 3.6, 8);
  private readonly crashSmokeGeometry = new THREE.SphereGeometry(0.72, 8, 6);
  private readonly crashFlashGeometry = new THREE.SphereGeometry(1.6, 8, 6);
  private readonly crashShockwaveGeometry = new THREE.RingGeometry(0.2, 1.6, 24);
  private readonly crashScorchGeometry = new THREE.CircleGeometry(2.4, 20);
  private readonly crashScorchGlowGeometry = new THREE.CircleGeometry(1.2, 16);

  private readonly crashFlameMaterial = new THREE.MeshBasicMaterial({ color: 0xff3b00, transparent: true, opacity: 0.94, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly crashFlameCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xffea40, transparent: true, opacity: 0.98, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly crashSmokeMaterial = new THREE.MeshBasicMaterial({ color: 0x18181b, transparent: true, opacity: 0.62, depthWrite: false });
  private readonly crashFlashMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.96, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly crashShockwaveMaterial = new THREE.MeshBasicMaterial({ color: 0xff7700, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  private readonly crashScorchMaterial = new THREE.MeshBasicMaterial({ color: 0x09090b, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide });
  private readonly crashScorchGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xff4d00, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  private readonly crashWorldPoint = new THREE.Vector3();
  private readonly crashNormal = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Water Particles
    const waterCount = 180;
    this.waterPositions = new Float32Array(waterCount * 3);
    for (let i = 0; i < waterCount * 3; i++) {
      this.waterPositions[i] = -9999;
      if (i % 3 === 0) {
        this.waterVelocities.push(new THREE.Vector3());
      }
    }
    const waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position', new THREE.BufferAttribute(this.waterPositions, 3));
    const waterMat = new THREE.PointsMaterial({
      color: 0x4fc3f7,
      size: 0.32,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.waterPoints = new THREE.Points(waterGeo, waterMat);
    this.waterPoints.frustumCulled = false;
    this.waterPoints.renderOrder = 25;
    this.waterPoints.visible = false;
    this.scene.add(this.waterPoints);

    const waterBeamMaterial = new THREE.MeshBasicMaterial({
      color: 0x40cfff,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.waterBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.085, 1, 8, 1, true),
      waterBeamMaterial
    );
    this.waterBeam.visible = false;
    this.waterBeam.frustumCulled = false;
    this.waterBeam.renderOrder = 24;
    this.scene.add(this.waterBeam);

    // 2. Fire Particles (Expanded capacity for massive explosion bursts & ember sprays)
    const fireCount = 450;
    this.firePositions = new Float32Array(fireCount * 3);
    for (let i = 0; i < fireCount * 3; i++) {
      this.firePositions[i] = -9999;
      if (i % 3 === 0) {
        this.fireVelocities.push(new THREE.Vector3());
        this.fireLifetimes.push(0);
      }
    }
    const fireGeo = new THREE.BufferGeometry();
    fireGeo.setAttribute('position', new THREE.BufferAttribute(this.firePositions, 3));
    const fireMat = new THREE.PointsMaterial({
      color: 0xff4d00,
      size: 0.65,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.firePoints = new THREE.Points(fireGeo, fireMat);
    this.firePoints.frustumCulled = false;
    this.firePoints.renderOrder = 28;
    this.firePoints.visible = false;
    this.scene.add(this.firePoints);

    const fireBeamMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6a00,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fireBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.48, 1, 10, 1, true),
      fireBeamMaterial
    );
    this.fireBeam.visible = false;
    this.fireBeam.frustumCulled = false;
    this.fireBeam.renderOrder = 27;
    this.scene.add(this.fireBeam);

    // 3. Electric Spark Particles (Sparks & Metallic Impact Embers)
    const sparkCount = 320;
    this.sparkPositions = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount * 3; i++) {
      this.sparkPositions[i] = -9999;
      if (i % 3 === 0) {
        this.sparkVelocities.push(new THREE.Vector3());
      }
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xffe066,
      size: 0.42,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    this.sparkPoints.frustumCulled = false;
    this.sparkPoints.renderOrder = 29;
    this.sparkPoints.visible = false;
    this.scene.add(this.sparkPoints);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.electricRing = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.45, 20), ringMat);
    this.electricRing.rotation.x = -Math.PI / 2;
    this.electricRing.visible = false;
    this.electricRing.renderOrder = 28;
    this.scene.add(this.electricRing);

    // 4. Smoke Particles
    const smokeCount = 320;
    this.smokePositions = new Float32Array(smokeCount * 3);
    for (let i = 0; i < smokeCount * 3; i++) {
      this.smokePositions[i] = -9999;
    }
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    const smokeMat = new THREE.PointsMaterial({
      color: 0x333338,
      size: 0.85,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.smokePoints = new THREE.Points(smokeGeo, smokeMat);
    this.smokePoints.frustumCulled = false;
    this.smokePoints.renderOrder = 22;
    this.smokePoints.visible = false;
    this.scene.add(this.smokePoints);

    this.skidGeometry.rotateX(-Math.PI / 2);
  }

  // Emit water spray from Poliwag's water pistol.
  // This uses BOTH a continuous translucent jet and droplets. The beam solves the
  // old issue where the particle system could be culled and appear to fire nothing.
  public emitWater(origin: THREE.Vector3, forward: THREE.Vector3, count = 24, length = 8.2) {
    if (!this.waterPoints) return;
    this.waterActivity = Math.max(this.waterActivity, 1.25);
    this.waterPoints.visible = true;
    this.waterDirection.copy(forward);
    if (this.waterDirection.lengthSq() < 0.0001) this.waterDirection.set(0, 0, 1);
    this.waterDirection.normalize();

    if (this.waterBeam) {
      this.waterBeam.visible = true;
      this.waterBeamLife = 0.12;
      this.waterBeam.position.copy(origin).addScaledVector(this.waterDirection, length * 0.5);
      this.waterBeam.quaternion.setFromUnitVectors(this.waterAxis, this.waterDirection);
      this.waterBeam.scale.set(1, length, 1);
    }

    const total = Math.max(8, Math.min(36, count));
    for (let i = 0; i < total; i++) {
      const idx = ((Math.random() * (this.waterPositions.length / 3)) | 0) * 3;
      const along = 0.25 + Math.random() * 2.6;
      const spreadX = (Math.random() - 0.5) * 0.16;
      const spreadY = (Math.random() - 0.5) * 0.12;
      const spreadZ = (Math.random() - 0.5) * 0.16;
      this.waterPositions[idx] = origin.x + this.waterDirection.x * along + spreadX;
      this.waterPositions[idx + 1] = origin.y + this.waterDirection.y * along + spreadY;
      this.waterPositions[idx + 2] = origin.z + this.waterDirection.z * along + spreadZ;

      const vIdx = idx / 3;
      const speed = 12 + Math.random() * 8;
      this.waterVelocities[vIdx]?.set(
        this.waterDirection.x * speed + spreadX * 5,
        this.waterDirection.y * speed + 0.25 + spreadY * 3,
        this.waterDirection.z * speed + spreadZ * 5
      );
    }
    this.waterPoints.geometry.attributes.position.needsUpdate = true;
  }

  public emitWaterSpray(origin: THREE.Vector3, forward: THREE.Vector3, count = 24) {
    this.emitWater(origin, forward, count);
  }


  /** Small switch/impact burst used by Poké Ball recalls and releases. */
  public emitRecallSpark(origin: THREE.Vector3, _color = 0xffffff) {
    if (!this.sparkPoints) return;
    this.sparkActivity = Math.max(this.sparkActivity, 0.65);
    this.sparkPoints.visible = true;
    for (let i = 0; i < 20; i++) {
      const idx = ((Math.random() * (this.sparkPositions.length / 3)) | 0) * 3;
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.15 + Math.random() * 1.25;
      this.sparkPositions[idx] = origin.x + Math.cos(angle) * dist;
      this.sparkPositions[idx + 1] = origin.y + (Math.random() - 0.5) * 1.3;
      this.sparkPositions[idx + 2] = origin.z + Math.sin(angle) * dist;
    }
    this.sparkPoints.geometry.attributes.position.needsUpdate = true;
  }

  /** Dramatic crash explosion burst: intense fire particles, glowing embers, sparks, and dense billowing smoke. */
  public emitCrashBurst(origin: THREE.Vector3, intensity = 1, normal?: THREE.Vector3) {
    const power = THREE.MathUtils.clamp(intensity, 0.5, 4.0);
    this.fireActivity = Math.max(this.fireActivity, 2.5);
    this.sparkActivity = Math.max(this.sparkActivity, 1.8);
    this.smokeActivity = Math.max(this.smokeActivity, 3.0);

    // 1. Explosive Fire Particles & Rising Embers
    if (this.firePoints) {
      this.firePoints.visible = true;
      const fireCount = Math.floor(28 + power * 22);
      const norm = normal ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < fireCount; i++) {
        const idx = ((Math.random() * (this.firePositions.length / 3)) | 0) * 3;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.5; // Upper hemisphere
        const speed = (6.0 + Math.random() * 14.0) * (0.8 + power * 0.4);
        const dir = new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi) * 0.85 + 0.3,
          Math.sin(phi) * Math.sin(theta),
        ).normalize();
        if (normal && Math.random() < 0.6) {
          dir.addScaledVector(norm, 0.8).normalize();
        }

        const startDist = 0.2 + Math.random() * 0.8 * power;
        this.firePositions[idx] = origin.x + dir.x * startDist;
        this.firePositions[idx + 1] = origin.y + Math.max(0.1, dir.y * startDist);
        this.firePositions[idx + 2] = origin.z + dir.z * startDist;

        const vIdx = idx / 3;
        if (this.fireVelocities[vIdx]) {
          this.fireVelocities[vIdx].copy(dir).multiplyScalar(speed);
          this.fireLifetimes[vIdx] = 0.8 + Math.random() * 0.9 * (power * 0.5);
        }
      }
      this.firePoints.geometry.attributes.position.needsUpdate = true;
    }

    // 2. Flying Metal Sparks & Impact Flares
    if (this.sparkPoints) {
      this.sparkPoints.visible = true;
      const sparkCount = Math.floor(30 + power * 25);
      for (let i = 0; i < sparkCount; i++) {
        const idx = ((Math.random() * (this.sparkPositions.length / 3)) | 0) * 3;
        const angle = Math.random() * Math.PI * 2;
        const elevation = 0.2 + Math.random() * 1.6;
        const dist = 0.2 + Math.random() * 2.2 * power;
        this.sparkPositions[idx] = origin.x + Math.cos(angle) * dist;
        this.sparkPositions[idx + 1] = origin.y + elevation * power;
        this.sparkPositions[idx + 2] = origin.z + Math.sin(angle) * dist;
      }
      this.sparkPoints.geometry.attributes.position.needsUpdate = true;
    }

    // 3. Thick Billowing Smoke Cloud
    if (this.smokePoints) {
      this.smokePoints.visible = true;
      const smokeCount = Math.floor(24 + power * 18);
      for (let i = 0; i < smokeCount; i++) {
        const idx = ((Math.random() * (this.smokePositions.length / 3)) | 0) * 3;
        const rad = 0.4 + Math.random() * 2.8 * power;
        const angle = Math.random() * Math.PI * 2;
        this.smokePositions[idx] = origin.x + Math.cos(angle) * rad;
        this.smokePositions[idx + 1] = origin.y + 0.3 + Math.random() * 1.8 * power;
        this.smokePositions[idx + 2] = origin.z + Math.sin(angle) * rad;
      }
      this.smokePoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  /** Small orange exhaust spit while nitro is active. Uses the pooled fire buffer. */
  public emitNitroExhaust(carPos: THREE.Vector3, yaw: number) {
    if (!this.firePoints) return;
    this.fireActivity = Math.max(this.fireActivity, 0.5);
    this.firePoints.visible = true;
    const backX = -Math.sin(yaw);
    const backZ = -Math.cos(yaw);
    for (let i = 0; i < 5; i++) {
      const idx = ((Math.random() * (this.firePositions.length / 3)) | 0) * 3;
      const side = (Math.random() - 0.5) * 0.7;
      this.firePositions[idx] = carPos.x + backX * (1.6 + Math.random() * 0.8) + Math.cos(yaw) * side;
      this.firePositions[idx + 1] = carPos.y + 0.35 + Math.random() * 0.25;
      this.firePositions[idx + 2] = carPos.z + backZ * (1.6 + Math.random() * 0.8) - Math.sin(yaw) * side;
      const vIdx = idx / 3;
      this.fireVelocities[vIdx]?.set(backX * (5 + Math.random() * 4), 0.4 + Math.random(), backZ * (5 + Math.random() * 4));
      this.fireLifetimes[vIdx] = 0.18 + Math.random() * 0.12;
    }
    this.firePoints.geometry.attributes.position.needsUpdate = true;
  }

  /** Steam/splash feedback when Poliwag puts out a fire. */
  public emitSteam(origin: THREE.Vector3) {
    if (!this.smokePoints) return;
    this.smokeActivity = Math.max(this.smokeActivity, 1.5);
    this.smokePoints.visible = true;
    for (let i = 0; i < 18; i++) {
      const idx = ((Math.random() * (this.smokePositions.length / 3)) | 0) * 3;
      this.smokePositions[idx] = origin.x + (Math.random() - 0.5) * 1.3;
      this.smokePositions[idx + 1] = origin.y + 0.2 + Math.random() * 0.6;
      this.smokePositions[idx + 2] = origin.z + (Math.random() - 0.5) * 1.3;
    }
    this.smokePoints.geometry.attributes.position.needsUpdate = true;
  }

  // Emit roaring fire stream from Charmander
  public emitFire(origin: THREE.Vector3, forward: THREE.Vector3, length = 6.2, count = 24) {
    if (!this.firePoints) return;
    this.fireActivity = Math.max(this.fireActivity, 1.0);
    this.firePoints.visible = true;
    this.fireDirection.copy(forward);
    if (this.fireDirection.lengthSq() < 0.0001) this.fireDirection.set(0, 0, 1);
    this.fireDirection.normalize();

    if (this.fireBeam) {
      this.fireBeam.visible = true;
      this.fireBeamLife = 0.12;
      this.fireBeam.position.copy(origin).addScaledVector(this.fireDirection, length * 0.5);
      this.fireBeam.quaternion.setFromUnitVectors(this.fireAxis, this.fireDirection);
      this.fireBeam.scale.set(1, length, 1);
      const mat = this.fireBeam.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.56 + Math.random() * 0.16;
    }

    for (let i = 0; i < count; i++) {
      const idx = ((Math.random() * (this.firePositions.length / 3)) | 0) * 3;
      const along = 0.4 + Math.random() * 3.5;
      const spreadScale = 0.12 + along * 0.055;
      const spreadX = (Math.random() - 0.5) * spreadScale;
      const spreadY = (Math.random() - 0.5) * spreadScale;
      const spreadZ = (Math.random() - 0.5) * spreadScale;

      this.firePositions[idx] = origin.x + this.fireDirection.x * along + spreadX;
      this.firePositions[idx + 1] = origin.y + this.fireDirection.y * along + spreadY;
      this.firePositions[idx + 2] = origin.z + this.fireDirection.z * along + spreadZ;

      const vIdx = idx / 3;
      if (this.fireVelocities[vIdx]) {
        const speed = 12 + Math.random() * 9;
        this.fireVelocities[vIdx].set(
          this.fireDirection.x * speed + spreadX * 4,
          this.fireDirection.y * speed + 0.8 + spreadY * 4,
          this.fireDirection.z * speed + spreadZ * 4
        );
        this.fireLifetimes[vIdx] = 0.55 + Math.random() * 0.25;
      }
    }
    this.firePoints.geometry.attributes.position.needsUpdate = true;
  }

  // Emit electric shockwave sparks from Pikachu
  public emitElectricity(origin: THREE.Vector3, radius = 6.0) {
    if (!this.sparkPoints) return;
    this.sparkActivity = Math.max(this.sparkActivity, 0.9);
    this.sparkPoints.visible = true;
    if (this.electricRing) {
      this.electricRing.visible = true;
      this.electricRingLife = 0.34;
      this.electricRing.position.copy(origin).setY(origin.y + 0.08);
      this.electricRing.scale.setScalar(0.25);
      const mat = this.electricRing.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.92;
    }
    const count = 40;
    for (let i = 0; i < count; i++) {
      const idx = ((Math.random() * (this.sparkPositions.length / 3)) | 0) * 3;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      this.sparkPositions[idx] = origin.x + Math.cos(angle) * dist;
      this.sparkPositions[idx + 1] = origin.y + 0.3 + Math.random() * 1.5;
      this.sparkPositions[idx + 2] = origin.z + Math.sin(angle) * dist;
    }
    this.sparkPoints.geometry.attributes.position.needsUpdate = true;
  }

  // Emit tire smoke and leave skid marks on the road
  public emitSkid(carPos: THREE.Vector3, carRotationY: number, _speed: number) {
    if (!this.smokePoints) return;
    this.smokeActivity = Math.max(this.smokeActivity, 1.1);
    this.smokePoints.visible = true;
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotationY);
    const side = new THREE.Vector3(1.1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), carRotationY);

    // Left and right rear wheel positions
    const rearL = carPos.clone().sub(forward.clone().multiplyScalar(1.4)).sub(side);
    const rearR = carPos.clone().sub(forward.clone().multiplyScalar(1.4)).add(side);

    // Smoke particles
    for (let i = 0; i < 6; i++) {
      const idx = ((Math.random() * (this.smokePositions.length / 3)) | 0) * 3;
      const targetPos = i % 2 === 0 ? rearL : rearR;
      this.smokePositions[idx] = targetPos.x + (Math.random() - 0.5) * 0.4;
      this.smokePositions[idx + 1] = 0.25 + Math.random() * 0.5;
      this.smokePositions[idx + 2] = targetPos.z + (Math.random() - 0.5) * 0.4;
    }
    this.smokePoints.geometry.attributes.position.needsUpdate = true;

    // Reuse a small fixed skid-mark pool instead of allocating geometry/materials while driving.
    if (Math.random() < 0.35) {
      const placeMark = (position: THREE.Vector3) => {
        let mark: THREE.Mesh;
        if (this.skidMarkMeshes.length < 48) {
          mark = new THREE.Mesh(this.skidGeometry, this.skidMaterial);
          mark.renderOrder = 2;
          this.scene.add(mark);
          this.skidMarkMeshes.push(mark);
        } else {
          mark = this.skidMarkMeshes[this.skidPoolCursor % this.skidMarkMeshes.length];
          this.skidPoolCursor = (this.skidPoolCursor + 1) % this.skidMarkMeshes.length;
        }
        mark.position.set(position.x, 0.11, position.z);
        mark.rotation.y = carRotationY;
        mark.visible = true;
      };
      placeMark(rearL);
      placeMark(rearR);
    }
  }

  public emitTireSmoke(wheelPos: THREE.Vector3, _count = 2) {
    if (!this.smokePoints) return;
    this.smokeActivity = Math.max(this.smokeActivity, 1.0);
    this.smokePoints.visible = true;
    for (let i = 0; i < 4; i++) {
      const idx = ((Math.random() * (this.smokePositions.length / 3)) | 0) * 3;
      this.smokePositions[idx] = wheelPos.x + (Math.random() - 0.5) * 0.4;
      this.smokePositions[idx + 1] = wheelPos.y + (Math.random() - 0.5) * 0.3;
      this.smokePositions[idx + 2] = wheelPos.z + (Math.random() - 0.5) * 0.4;
    }
    this.smokePoints.geometry.attributes.position.needsUpdate = true;
  }

  private createAircraftCrashVisual(
    parent: THREE.Object3D | null,
    worldAnchor: THREE.Vector3,
    normal: THREE.Vector3,
    flameCount: number,
    smokeCount: number,
    duration: number,
    intensity: number,
    addScorch: boolean,
    addFlash: boolean,
    addShockwave = false,
    isLargeCentral = false,
  ) {
    const group = new THREE.Group();
    group.name = parent ? 'aircraft_wreck_fire' : 'aircraft_impact_fire';
    group.position.copy(worldAnchor);
    group.renderOrder = 40;
    this.scene.add(group);

    const renderedFlameCount = this.performanceMode ? Math.min(flameCount, Math.max(flameCount > 0 ? 3 : 0, Math.ceil(flameCount * 0.48))) : flameCount;
    const renderedSmokeCount = this.performanceMode ? Math.min(smokeCount, Math.max(smokeCount > 0 ? 4 : 0, Math.ceil(smokeCount * 0.42))) : smokeCount;

    const flames: THREE.Mesh[] = [];
    for (let i = 0; i < renderedFlameCount; i++) {
      let geo = this.crashFlameGeometry;
      let mat = this.crashFlameMaterial;
      if (i === 0 && isLargeCentral) {
        geo = this.crashFlameLargeGeometry;
        mat = this.crashFlameCoreMaterial;
      } else if (i % 3 === 0) {
        geo = this.crashFlameCoreGeometry;
        mat = this.crashFlameCoreMaterial;
      }

      const flame = new THREE.Mesh(geo, mat);
      const ring = i / Math.max(1, renderedFlameCount);
      const angle = i * 2.399963229728653;
      const radius = (0.16 + ring * (isLargeCentral ? 1.45 : 1.15)) * intensity;
      const initialHeight = (isLargeCentral ? 0.8 : 0.55) + (i % 4) * 0.22;
      flame.position.set(Math.cos(angle) * radius, initialHeight, Math.sin(angle) * radius);
      
      const baseScale = (isLargeCentral ? 1.1 : 0.85) + (i % 3) * 0.25;
      flame.scale.setScalar(baseScale * intensity);
      flame.userData.crashPhase = i * 0.83;
      flame.userData.crashBaseX = flame.position.x;
      flame.userData.crashBaseZ = flame.position.z;
      flame.userData.crashBaseScale = baseScale;
      flame.renderOrder = 42;
      group.add(flame);
      flames.push(flame);
    }

    const smoke: THREE.Mesh[] = [];
    for (let i = 0; i < renderedSmokeCount; i++) {
      const puff = new THREE.Mesh(this.crashSmokeGeometry, this.crashSmokeMaterial);
      const angle = i * 2.399963229728653 + 0.7;
      const radius = (0.28 + (i % 5) * 0.35) * intensity;
      puff.position.set(Math.cos(angle) * radius, 1.1 + (i % 4) * 0.75, Math.sin(angle) * radius);
      const scale = (0.95 + (i % 4) * 0.38) * intensity;
      puff.scale.setScalar(scale);
      puff.userData.crashPhase = i * 0.57;
      puff.userData.crashBaseY = puff.position.y;
      puff.userData.crashBaseScale = scale;
      puff.renderOrder = 39;
      group.add(puff);
      smoke.push(puff);
    }

    let flash: THREE.Mesh | null = null;
    if (addFlash) {
      flash = new THREE.Mesh(this.crashFlashGeometry, this.crashFlashMaterial);
      flash.scale.setScalar(2.6 * intensity);
      flash.renderOrder = 45;
      group.add(flash);
    }

    let shockwave: THREE.Mesh | null = null;
    if (addShockwave) {
      shockwave = new THREE.Mesh(this.crashShockwaveGeometry, this.crashShockwaveMaterial);
      this.crashNormal.copy(normal);
      if (this.crashNormal.lengthSq() < 1e-6) this.crashNormal.set(0, 1, 0);
      this.crashNormal.normalize();
      shockwave.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.crashNormal);
      shockwave.position.copy(this.crashNormal).multiplyScalar(0.06);
      shockwave.scale.setScalar(0.2);
      shockwave.renderOrder = 44;
      group.add(shockwave);
    }

    let scorch: THREE.Mesh | null = null;
    let scorchGlow: THREE.Mesh | null = null;
    if (addScorch) {
      this.crashNormal.copy(normal);
      if (this.crashNormal.lengthSq() < 1e-6) this.crashNormal.set(0, 1, 0);
      this.crashNormal.normalize();

      scorch = new THREE.Mesh(this.crashScorchGeometry, this.crashScorchMaterial);
      scorch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.crashNormal);
      scorch.position.copy(this.crashNormal).multiplyScalar(0.04);
      scorch.scale.setScalar(1.8 * intensity);
      scorch.renderOrder = 35;
      group.add(scorch);

      scorchGlow = new THREE.Mesh(this.crashScorchGlowGeometry, this.crashScorchGlowMaterial);
      scorchGlow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.crashNormal);
      scorchGlow.position.copy(this.crashNormal).multiplyScalar(0.048);
      scorchGlow.scale.setScalar(1.3 * intensity);
      scorchGlow.renderOrder = 36;
      group.add(scorchGlow);
    }

    let localAnchor = worldAnchor.clone();
    if (parent) {
      parent.updateWorldMatrix(true, false);
      localAnchor = parent.worldToLocal(worldAnchor.clone());
    }

    this.aircraftCrashVisuals.push({
      group,
      parent,
      localAnchor,
      worldAnchor: worldAnchor.clone(),
      age: 0,
      duration,
      flames,
      smoke,
      flash,
      shockwave,
      scorch,
      scorchGlow,
      intensity,
    });
  }

  /**
   * Severity-aware aircraft impact visuals. Engulfs the aircraft in blazing fire across
   * the nose, fuselage, wings, and tail, while turning the impact surface/ground into
   * an intense multi-patch flaming conflagration with shockwaves and glowing scorch craters.
   */
  public startAircraftCrashEffect(
    aircraftMesh: THREE.Object3D,
    impactPoint: THREE.Vector3,
    impactNormal: THREE.Vector3,
    severity: 'minor' | 'moderate' | 'major',
    lodged = false,
  ) {
    const power = lodged ? 4.2 : severity === 'major' ? 3.2 : severity === 'moderate' ? 1.6 : 0.85;
    this.emitCrashBurst(impactPoint, power, impactNormal);
    if (severity === 'minor') return;

    if (severity === 'moderate') {
      const recentAttachedSmoke = this.aircraftCrashVisuals.some((effect) => effect.parent === aircraftMesh && effect.age < 3.0);
      if (!recentAttachedSmoke) {
        this.createAircraftCrashVisual(aircraftMesh, impactPoint, impactNormal, 8, 10, 8.5, 1.25, false, true, false);
        const surfacePoint = impactPoint.clone().addScaledVector(impactNormal.clone().normalize(), 0.08);
        this.createAircraftCrashVisual(null, surfacePoint, impactNormal, 6, 8, 7.0, 1.1, true, false, false);
      }
      return;
    }

    // Major / Lodged crash: Clear previous minor effects from the aircraft mesh.
    this.clearAircraftCrashEffects(aircraftMesh);

    // Compute plane orientation vectors to place roaring fire nodes across the whole airplane
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(aircraftMesh.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraftMesh.quaternion).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(aircraftMesh.quaternion).normalize();
    const planeCenter = aircraftMesh.position.clone();

    // 1. AIRCRAFT WRECK INFERNO (Engulfing the plane from nose to tail)
    const flameDuration = lodged ? 28.0 : 22.0;

    // A. Impact Contact Zone on Plane
    this.createAircraftCrashVisual(aircraftMesh, impactPoint, impactNormal, lodged ? 22 : 16, lodged ? 20 : 16, flameDuration, lodged ? 2.1 : 1.7, false, true, false, true);

    // B. Fuselage Mid / Cabin Inferno
    const midFuselagePoint = planeCenter.clone().addScaledVector(up, 0.4);
    this.createAircraftCrashVisual(aircraftMesh, midFuselagePoint, impactNormal, lodged ? 18 : 14, lodged ? 16 : 12, flameDuration, 1.75, false, false, false, true);

    // C. Left Wing & Engine Fire
    const leftWingPoint = planeCenter.clone().addScaledVector(right, -2.4).addScaledVector(forward, -0.6);
    this.createAircraftCrashVisual(aircraftMesh, leftWingPoint, impactNormal, 14, 12, flameDuration * 0.9, 1.45, false, true, false, false);

    // D. Right Wing & Engine Fire
    const rightWingPoint = planeCenter.clone().addScaledVector(right, 2.4).addScaledVector(forward, -0.6);
    this.createAircraftCrashVisual(aircraftMesh, rightWingPoint, impactNormal, 14, 12, flameDuration * 0.9, 1.45, false, true, false, false);

    // E. Tail / Empennage Fire & Smoke Plume
    const tailPoint = planeCenter.clone().addScaledVector(forward, -3.2).addScaledVector(up, 0.8);
    this.createAircraftCrashVisual(aircraftMesh, tailPoint, impactNormal, 12, 14, flameDuration, 1.5, false, false, false, false);

    // 2. IMPACT ZONE CONFLAGRATION (Ground / Wall Surface)
    const norm = impactNormal.clone().normalize();
    if (norm.lengthSq() < 1e-6) norm.set(0, 1, 0);
    const surfaceCenter = impactPoint.clone().addScaledVector(norm, 0.08);

    // Main Impact Crater - Towering central bonfire + shockwave + molten scorch
    this.createAircraftCrashVisual(null, surfaceCenter, norm, lodged ? 26 : 20, lodged ? 22 : 18, lodged ? 24.0 : 18.0, lodged ? 2.4 : 1.9, true, true, true, true);

    // Tangent vectors on the impact surface to scatter satellite blaze patches
    let tangentU = new THREE.Vector3(0, 1, 0).cross(norm);
    if (tangentU.lengthSq() < 0.001) tangentU = new THREE.Vector3(1, 0, 0).cross(norm);
    tangentU.normalize();
    const tangentV = norm.clone().cross(tangentU).normalize();

    // Satellite Burning Fire Patches around the impact zone
    const patchOffsets = [
      { u: 2.2, v: 0.8, scale: 1.35, flames: 10, smoke: 8, dur: 14.0 },
      { u: -2.0, v: 1.4, scale: 1.25, flames: 9, smoke: 8, dur: 13.0 },
      { u: 0.9, v: -2.2, scale: 1.4, flames: 11, smoke: 9, dur: 15.0 },
      { u: -1.4, v: -1.8, scale: 1.15, flames: 8, smoke: 7, dur: 12.0 },
    ];

    patchOffsets.forEach((patch) => {
      const patchPos = surfaceCenter.clone()
        .addScaledVector(tangentU, patch.u * (lodged ? 1.3 : 1.0))
        .addScaledVector(tangentV, patch.v * (lodged ? 1.3 : 1.0));
      this.createAircraftCrashVisual(null, patchPos, norm, patch.flames, patch.smoke, patch.dur, patch.scale, true, false, false, false);
    });
  }

  public clearAircraftCrashEffects(aircraftMesh: THREE.Object3D) {
    for (let i = this.aircraftCrashVisuals.length - 1; i >= 0; i--) {
      const effect = this.aircraftCrashVisuals[i];
      if (effect.parent !== aircraftMesh) continue;
      this.scene.remove(effect.group);
      this.aircraftCrashVisuals.splice(i, 1);
    }
  }

  private updateAircraftCrashVisuals(dt: number) {
    for (let i = this.aircraftCrashVisuals.length - 1; i >= 0; i--) {
      const effect = this.aircraftCrashVisuals[i];
      effect.age += dt;
      if (effect.parent) {
        effect.parent.updateWorldMatrix(true, false);
        effect.group.position.copy(effect.parent.localToWorld(this.crashWorldPoint.copy(effect.localAnchor)));
      } else {
        effect.group.position.copy(effect.worldAnchor);
      }

      const life = THREE.MathUtils.clamp(1 - effect.age / effect.duration, 0, 1);
      const flickerTime = effect.age * 15;
      const lodStride = this.performanceMode ? (effect.age > 7 ? 3 : 2) : effect.age > 12 ? 3 : effect.age > 7 ? 2 : 1;

      // Animate roaring flames
      effect.flames.forEach((flame, index) => {
        flame.visible = index % lodStride === 0;
        if (!flame.visible) return;
        const phase = Number(flame.userData.crashPhase ?? 0);
        const baseScale = Number(flame.userData.crashBaseScale ?? 0.85);
        const flicker = 0.78 + Math.sin(flickerTime + phase) * 0.22 + Math.sin(flickerTime * 0.53 + phase * 1.3) * 0.12;
        const sway = Math.sin(flickerTime * 0.4 + phase) * 0.14;
        const taper = Math.max(0.15, Math.pow(life, 0.7));

        flame.scale.set(
          baseScale * flicker * taper,
          baseScale * (0.85 + flicker * 0.45) * taper * 1.25,
          baseScale * flicker * taper,
        );
        flame.position.x = Number(flame.userData.crashBaseX ?? flame.position.x) + sway;
        flame.position.z = Number(flame.userData.crashBaseZ ?? flame.position.z) + Math.cos(flickerTime * 0.35 + phase) * 0.12;
      });

      // Animate rising billowing smoke
      effect.smoke.forEach((puff, index) => {
        puff.visible = index % lodStride === 0;
        if (!puff.visible) return;
        const phase = Number(puff.userData.crashPhase ?? 0);
        const cycle = (effect.age * 0.32 + phase * 0.12) % 1;
        const baseY = Number(puff.userData.crashBaseY ?? 1.1);
        const baseScale = Number(puff.userData.crashBaseScale ?? 1);
        puff.position.y = baseY + cycle * (4.2 + effect.intensity * 2.2);
        const expand = baseScale * (0.9 + cycle * 1.6) * Math.max(0.3, life);
        puff.scale.setScalar(expand);
      });

      // Animate expanding shockwave ring
      if (effect.shockwave) {
        const shockLife = THREE.MathUtils.clamp(1 - effect.age / 0.48, 0, 1);
        effect.shockwave.visible = shockLife > 0;
        if (effect.shockwave.visible) {
          const progress = 1 - shockLife;
          effect.shockwave.scale.setScalar((0.5 + progress * 7.5) * effect.intensity);
          const mat = effect.shockwave.material as THREE.MeshBasicMaterial;
          mat.opacity = shockLife * 0.88;
        }
      }

      // Animate explosive fireball flash
      if (effect.flash) {
        effect.flash.visible = effect.age < 0.32;
        if (effect.flash.visible) {
          const flashLife = THREE.MathUtils.clamp(1 - effect.age / 0.32, 0, 1);
          effect.flash.scale.setScalar(2.6 * effect.intensity * (0.65 + flashLife * 0.45));
          const mat = effect.flash.material as THREE.MeshBasicMaterial;
          mat.opacity = flashLife * 0.95;
        }
      }

      // Scorch mark & glowing ember center
      if (effect.scorch) effect.scorch.visible = life > 0.01;
      if (effect.scorchGlow) {
        const glowLife = THREE.MathUtils.clamp(1 - effect.age / (effect.duration * 0.65), 0, 1);
        effect.scorchGlow.visible = glowLife > 0.02;
        if (effect.scorchGlow.visible) {
          const glowMat = effect.scorchGlow.material as THREE.MeshBasicMaterial;
          glowMat.opacity = glowLife * (0.65 + Math.sin(effect.age * 8) * 0.15);
        }
      }

      if (effect.age >= effect.duration) {
        this.scene.remove(effect.group);
        this.aircraftCrashVisuals.splice(i, 1);
      }
    }
  }

  public getDebugStats() {
    let water = 0;
    for (let i = 1; i < this.waterPositions.length; i += 3) if (this.waterPositions[i] > 0.05) water++;
    let fire = 0;
    for (const life of this.fireLifetimes) if (life > 0) fire++;
    let sparks = 0;
    for (let i = 1; i < this.sparkPositions.length; i += 3) if (this.sparkPositions[i] > -9000) sparks++;
    let smoke = 0;
    for (let i = 1; i < this.smokePositions.length; i += 3) if (this.smokePositions[i] > -9000) smoke++;
    return {
      activeParticles: water + fire + sparks + smoke,
      water,
      fire,
      sparks,
      smoke,
      crashEffects: this.aircraftCrashVisuals.length,
    };
  }

  // Update physics for all active particles
  public update(dt: number) {
    this.updateAircraftCrashVisuals(dt);
    if (this.waterBeam?.visible) {
      this.waterBeamLife -= dt;
      if (this.waterBeamLife <= 0) this.waterBeam.visible = false;
    }
    if (this.fireBeam?.visible) {
      this.fireBeamLife -= dt;
      if (this.fireBeamLife <= 0) this.fireBeam.visible = false;
    }
    if (this.electricRing?.visible) {
      this.electricRingLife -= dt;
      const life = Math.max(0, this.electricRingLife / 0.34);
      const progress = 1 - life;
      this.electricRing.scale.setScalar(0.25 + progress * 6.5);
      const mat = this.electricRing.material as THREE.MeshBasicMaterial;
      mat.opacity = life * 0.9;
      if (this.electricRingLife <= 0) this.electricRing.visible = false;
    }

    // 1. Water update - completely sleep the buffer when no droplets are alive.
    this.waterActivity = Math.max(0, this.waterActivity - dt);
    if (this.waterPoints && this.waterActivity > 0) {
      for (let i = 0; i < this.waterVelocities.length; i++) {
        const idx = i * 3;
        if (this.waterPositions[idx + 1] > 0.05) {
          this.waterPositions[idx] += this.waterVelocities[i].x * dt;
          this.waterPositions[idx + 1] += this.waterVelocities[i].y * dt;
          this.waterPositions[idx + 2] += this.waterVelocities[i].z * dt;
          this.waterVelocities[i].y -= 14 * dt; // Gravity
        } else {
          this.waterPositions[idx] = -9999; // Recycle offscreen
        }
      }
      this.waterPoints.geometry.attributes.position.needsUpdate = true;
    } else if (this.waterPoints?.visible) {
      this.waterPoints.visible = false;
      this.waterPositions.fill(-9999);
    }

    // 2. Fire update
    this.fireActivity = Math.max(0, this.fireActivity - dt);
    if (this.firePoints && this.fireActivity > 0) {
      for (let i = 0; i < this.fireVelocities.length; i++) {
        const idx = i * 3;
        if (this.fireLifetimes[i] > 0) {
          this.fireLifetimes[i] -= dt;
          this.firePositions[idx] += this.fireVelocities[i].x * dt;
          this.firePositions[idx + 1] += this.fireVelocities[i].y * dt;
          this.firePositions[idx + 2] += this.fireVelocities[i].z * dt;
          this.fireVelocities[i].y += 2.0 * dt; // Rise like hot smoke
        } else {
          this.firePositions[idx] = -9999;
        }
      }
      this.firePoints.geometry.attributes.position.needsUpdate = true;
    } else if (this.firePoints?.visible) {
      this.firePoints.visible = false;
      this.firePositions.fill(-9999);
      this.fireLifetimes.fill(0);
    }

    // 3. Sparks fade
    this.sparkActivity = Math.max(0, this.sparkActivity - dt);
    if (this.sparkPoints && this.sparkActivity > 0) {
      for (let i = 0; i < this.sparkPositions.length; i += 3) {
        if (this.sparkPositions[i + 1] > -9000) {
          if (Math.random() < 0.25) {
            this.sparkPositions[i] = -9999;
          }
        }
      }
      this.sparkPoints.geometry.attributes.position.needsUpdate = true;
    } else if (this.sparkPoints?.visible) {
      this.sparkPoints.visible = false;
      this.sparkPositions.fill(-9999);
    }

    // 4. Smoke dissipate
    this.smokeActivity = Math.max(0, this.smokeActivity - dt);
    if (this.smokePoints && this.smokeActivity > 0) {
      for (let i = 0; i < this.smokePositions.length; i += 3) {
        if (this.smokePositions[i + 1] > -9000) {
          this.smokePositions[i + 1] += 1.2 * dt;
          if (Math.random() < 0.15) {
            this.smokePositions[i] = -9999;
          }
        }
      }
      this.smokePoints.geometry.attributes.position.needsUpdate = true;
    } else if (this.smokePoints?.visible) {
      this.smokePoints.visible = false;
      this.smokePositions.fill(-9999);
    }
  }

  public cleanup() {
    this.aircraftCrashVisuals.forEach((effect) => this.scene.remove(effect.group));
    this.aircraftCrashVisuals.length = 0;
    if (this.waterBeam) this.scene.remove(this.waterBeam);
    if (this.fireBeam) this.scene.remove(this.fireBeam);
    if (this.electricRing) this.scene.remove(this.electricRing);
    if (this.waterPoints) this.scene.remove(this.waterPoints);
    if (this.firePoints) this.scene.remove(this.firePoints);
    if (this.sparkPoints) this.scene.remove(this.sparkPoints);
    if (this.smokePoints) this.scene.remove(this.smokePoints);
    this.skidMarkMeshes.forEach((m) => this.scene.remove(m));
    this.skidGeometry.dispose();
    this.skidMaterial.dispose();
    this.crashFlameGeometry.dispose();
    this.crashFlameCoreGeometry.dispose();
    this.crashFlameLargeGeometry.dispose();
    this.crashSmokeGeometry.dispose();
    this.crashFlashGeometry.dispose();
    this.crashShockwaveGeometry.dispose();
    this.crashScorchGeometry.dispose();
    this.crashScorchGlowGeometry.dispose();
    this.crashFlameMaterial.dispose();
    this.crashFlameCoreMaterial.dispose();
    this.crashSmokeMaterial.dispose();
    this.crashFlashMaterial.dispose();
    this.crashShockwaveMaterial.dispose();
    this.crashScorchMaterial.dispose();
    this.crashScorchGlowMaterial.dispose();
  }
}
