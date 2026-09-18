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
  scorch: THREE.Mesh | null;
  intensity: number;
};

export class ParticleEffectsManager {
  private scene: THREE.Scene;

  // Water spray particles (Poliway)
  public waterPoints: THREE.Points | null = null;
  private waterPositions: Float32Array;
  private waterVelocities: THREE.Vector3[] = [];
  /** Bright continuous jet so Water Gun is unmistakably visible, even between particle ticks. */
  private waterBeam: THREE.Mesh | null = null;
  private waterBeamLife = 0;
  private readonly waterAxis = new THREE.Vector3(0, 1, 0);
  private readonly waterDirection = new THREE.Vector3();

  // Fire flame particles (Charmander)
  public firePoints: THREE.Points | null = null;
  private firePositions: Float32Array;
  private fireVelocities: THREE.Vector3[] = [];
  private fireLifetimes: number[] = [];
  /** Continuous flame core so Charmander's attack reads clearly even between particle ticks. */
  private fireBeam: THREE.Mesh | null = null;
  private fireBeamLife = 0;
  private readonly fireAxis = new THREE.Vector3(0, 1, 0);
  private readonly fireDirection = new THREE.Vector3();

  // Electric spark particles (Pikachu)
  public sparkPoints: THREE.Points | null = null;
  private sparkPositions: Float32Array;
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
      { geometry: this.crashFlameGeometry, material: this.crashFlameCoreMaterial },
      { geometry: this.crashSmokeGeometry, material: this.crashSmokeMaterial },
      { geometry: this.crashFlashGeometry, material: this.crashFlashMaterial },
      { geometry: this.crashScorchGeometry, material: this.crashScorchMaterial },
    ];
  }

  // Aircraft crash visuals are deliberately small, timed mesh pools rather than
  // permanent particle emitters. A maximum of five flyable aircraft exists in the
  // current world, so these short-lived groups stay dramatic without accumulating
  // unbounded draw/update work.
  private aircraftCrashVisuals: AircraftCrashVisual[] = [];
  private readonly crashFlameGeometry = new THREE.ConeGeometry(0.42, 1.55, 7);
  private readonly crashSmokeGeometry = new THREE.SphereGeometry(0.58, 8, 6);
  private readonly crashFlashGeometry = new THREE.SphereGeometry(0.68, 8, 6);
  private readonly crashScorchGeometry = new THREE.CircleGeometry(1, 18);
  private readonly crashFlameMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0.88, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly crashFlameCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly crashSmokeMaterial = new THREE.MeshBasicMaterial({ color: 0x27272a, transparent: true, opacity: 0.50, depthWrite: false });
  private readonly crashFlashMaterial = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending });
  private readonly crashScorchMaterial = new THREE.MeshBasicMaterial({ color: 0x171717, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide });
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
    // Dynamic point buffers begin far off-screen. Leaving frustum culling enabled can
    // cache that original bounding sphere and make later water completely invisible.
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

    // 2. Fire Particles
    const fireCount = 180;
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
      color: 0xff5722,
      size: 0.55,
      transparent: true,
      opacity: 0.9,
    });
    this.firePoints = new THREE.Points(fireGeo, fireMat);
    this.firePoints.frustumCulled = false;
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
    this.fireBeam.renderOrder = 23;
    this.scene.add(this.fireBeam);

    // 3. Electric Sparks
    const sparkCount = 100;
    this.sparkPositions = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount * 3; i++) {
      this.sparkPositions[i] = -9999;
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xffeb3b,
      size: 0.35,
      transparent: true,
      opacity: 0.95,
    });
    this.sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    this.sparkPoints.frustumCulled = false;
    this.sparkPoints.visible = false;
    this.scene.add(this.sparkPoints);

    const electricRingMat = new THREE.MeshBasicMaterial({
      color: 0xfff34d,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.electricRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 28), electricRingMat);
    this.electricRing.rotation.x = Math.PI / 2;
    this.electricRing.visible = false;
    this.electricRing.frustumCulled = false;
    this.electricRing.renderOrder = 26;
    this.scene.add(this.electricRing);

    // 4. Tire Smoke
    const smokeCount = 160;
    this.smokePositions = new Float32Array(smokeCount * 3);
    for (let i = 0; i < smokeCount * 3; i++) {
      this.smokePositions[i] = -9999;
    }
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    const smokeMat = new THREE.PointsMaterial({
      color: 0xeeeeee,
      size: 0.75,
      transparent: true,
      opacity: 0.45,
    });
    this.smokePoints = new THREE.Points(smokeGeo, smokeMat);
    this.smokePoints.frustumCulled = false;
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

  /** Cartoon crash burst: sparks + smoke without creating new meshes. */
  public emitCrashBurst(origin: THREE.Vector3, intensity = 1) {
    const power = THREE.MathUtils.clamp(intensity, 0.5, 2.5);
    this.sparkActivity = Math.max(this.sparkActivity, 0.7);
    this.smokeActivity = Math.max(this.smokeActivity, 1.35);
    if (this.sparkPoints) {
      this.sparkPoints.visible = true;
      const sparkCount = Math.floor(12 + power * 12);
      for (let i = 0; i < sparkCount; i++) {
        const idx = ((Math.random() * (this.sparkPositions.length / 3)) | 0) * 3;
        const angle = Math.random() * Math.PI * 2;
        const dist = 0.15 + Math.random() * 1.2 * power;
        this.sparkPositions[idx] = origin.x + Math.cos(angle) * dist;
        this.sparkPositions[idx + 1] = origin.y + 0.35 + Math.random() * 1.0 * power;
        this.sparkPositions[idx + 2] = origin.z + Math.sin(angle) * dist;
      }
      this.sparkPoints.geometry.attributes.position.needsUpdate = true;
    }
    if (this.smokePoints) {
      this.smokePoints.visible = true;
      const smokeCount = Math.floor(8 + power * 8);
      for (let i = 0; i < smokeCount; i++) {
        const idx = ((Math.random() * (this.smokePositions.length / 3)) | 0) * 3;
        this.smokePositions[idx] = origin.x + (Math.random() - 0.5) * 1.5 * power;
        this.smokePositions[idx + 1] = origin.y + 0.25 + Math.random() * 0.8;
        this.smokePositions[idx + 2] = origin.z + (Math.random() - 0.5) * 1.5 * power;
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
  ) {
    const group = new THREE.Group();
    group.name = parent ? 'aircraft_wreck_fire' : 'aircraft_impact_fire';
    group.position.copy(worldAnchor);
    group.renderOrder = 40;
    this.scene.add(group);

    // Emergency performance tier keeps the aftermath readable but avoids dozens of
    // overlapping transparent mesh submissions during exactly the kind of crash
    // sequence that previously triggered renderer stalls.
    const renderedFlameCount = this.performanceMode ? Math.min(flameCount, Math.max(flameCount > 0 ? 3 : 0, Math.ceil(flameCount * 0.48))) : flameCount;
    const renderedSmokeCount = this.performanceMode ? Math.min(smokeCount, Math.max(smokeCount > 0 ? 4 : 0, Math.ceil(smokeCount * 0.42))) : smokeCount;

    const flames: THREE.Mesh[] = [];
    for (let i = 0; i < renderedFlameCount; i++) {
      const flame = new THREE.Mesh(
        this.crashFlameGeometry,
        i % 3 === 0 ? this.crashFlameCoreMaterial : this.crashFlameMaterial,
      );
      const ring = i / Math.max(1, renderedFlameCount);
      const angle = i * 2.399963229728653;
      const radius = (0.18 + ring * 1.15) * intensity;
      flame.position.set(Math.cos(angle) * radius, 0.55 + (i % 4) * 0.18, Math.sin(angle) * radius);
      flame.scale.setScalar(0.72 + (i % 3) * 0.18);
      flame.userData.crashPhase = i * 0.83;
      flame.userData.crashBaseX = flame.position.x;
      flame.userData.crashBaseZ = flame.position.z;
      flame.renderOrder = 42;
      group.add(flame);
      flames.push(flame);
    }

    const smoke: THREE.Mesh[] = [];
    for (let i = 0; i < renderedSmokeCount; i++) {
      const puff = new THREE.Mesh(this.crashSmokeGeometry, this.crashSmokeMaterial);
      const angle = i * 2.399963229728653 + 0.7;
      const radius = (0.25 + (i % 5) * 0.28) * intensity;
      puff.position.set(Math.cos(angle) * radius, 1.0 + (i % 4) * 0.62, Math.sin(angle) * radius);
      const scale = 0.8 + (i % 4) * 0.25;
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
      // Keep crash flashes entirely mesh-based. Adding/removing real PointLights at
      // runtime changes Three.js' light topology and can force new shader variants
      // across thousands of MeshStandardMaterials. On the large open-world scene
      // that showed up as multi-second renderer.render() stalls after aircraft
      // impacts. The additive flash/flames already provide the intended visual hit
      // without mutating the renderer's light count.
      flash = new THREE.Mesh(this.crashFlashGeometry, this.crashFlashMaterial);
      flash.scale.setScalar(1.8 * intensity);
      flash.renderOrder = 45;
      group.add(flash);
    }

    let scorch: THREE.Mesh | null = null;
    if (addScorch) {
      scorch = new THREE.Mesh(this.crashScorchGeometry, this.crashScorchMaterial);
      this.crashNormal.copy(normal);
      if (this.crashNormal.lengthSq() < 1e-6) this.crashNormal.set(0, 0, 1);
      this.crashNormal.normalize();
      scorch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.crashNormal);
      scorch.position.copy(this.crashNormal).multiplyScalar(0.045);
      scorch.scale.setScalar(1.4 * intensity);
      scorch.renderOrder = 35;
      group.add(scorch);
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
      scorch,
      intensity,
    });
  }

  /**
   * Severity-aware aircraft impact visuals. The wreck emitter follows the actual
   * struck aircraft point, while a shorter fixed emitter marks the building/terrain
   * contact area. Minor scrapes intentionally stay as pooled sparks only.
   */
  public startAircraftCrashEffect(
    aircraftMesh: THREE.Object3D,
    impactPoint: THREE.Vector3,
    impactNormal: THREE.Vector3,
    severity: 'minor' | 'moderate' | 'major',
    lodged = false,
  ) {
    const power = lodged ? 3.4 : severity === 'major' ? 2.5 : severity === 'moderate' ? 1.35 : 0.72;
    this.emitCrashBurst(impactPoint, power);
    if (severity === 'minor') return;

    if (severity === 'moderate') {
      const recentAttachedSmoke = this.aircraftCrashVisuals.some((effect) => effect.parent === aircraftMesh && effect.age < 2.5);
      if (!recentAttachedSmoke) {
        this.createAircraftCrashVisual(aircraftMesh, impactPoint, impactNormal, 0, 6, 4.5, 0.9, false, false);
      }
      return;
    }

    // Major crash supersedes any earlier scrape/smoke emitter on the wreck, then
    // creates substantial attached fire plus a shorter impact-zone fire. Lodged
    // crashes deliberately get a larger but still time-bounded concentration around
    // the exact contact point so they read as an embedded wreck, not collider failure.
    this.clearAircraftCrashEffects(aircraftMesh);
    if (lodged) {
      this.createAircraftCrashVisual(aircraftMesh, impactPoint, impactNormal, 16, 20, 18.0, 1.72, false, true);
      const fuselageFirePoint = impactPoint.clone().addScaledVector(impactNormal.clone().normalize(), 1.25);
      this.createAircraftCrashVisual(aircraftMesh, fuselageFirePoint, impactNormal, 7, 9, 12.0, 1.08, false, false);
      const surfacePoint = impactPoint.clone().addScaledVector(impactNormal.clone().normalize(), 0.12);
      // Keep the fixed building-side aftermath alive beyond the seven-second
      // aircraft death camera before normal cleanup is allowed to reclaim it.
      this.createAircraftCrashVisual(null, surfacePoint, impactNormal, 9, 14, 9.0, 1.42, true, true);
    } else {
      this.createAircraftCrashVisual(aircraftMesh, impactPoint, impactNormal, 10, 13, 14.0, 1.35, false, true);
      const surfacePoint = impactPoint.clone().addScaledVector(impactNormal.clone().normalize(), 0.10);
      this.createAircraftCrashVisual(null, surfacePoint, impactNormal, 5, 9, 8.6, 1.05, true, true);
    }
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
      const flickerTime = effect.age * 13;
      const lodStride = this.performanceMode ? (effect.age > 7 ? 3 : 2) : effect.age > 11 ? 3 : effect.age > 7 ? 2 : 1;
      effect.flames.forEach((flame, index) => {
        flame.visible = index % lodStride === 0;
        if (!flame.visible) return;
        const phase = Number(flame.userData.crashPhase ?? 0);
        const flicker = 0.76 + Math.sin(flickerTime + phase) * 0.18 + Math.sin(flickerTime * 0.47 + phase) * 0.08;
        const taper = Math.max(0.18, life);
        flame.scale.set(
          (0.72 + (index % 3) * 0.18) * flicker * taper,
          (0.9 + (index % 4) * 0.22) * (0.82 + flicker * 0.35) * taper,
          (0.72 + (index % 3) * 0.18) * flicker * taper,
        );
        flame.position.x = Number(flame.userData.crashBaseX ?? flame.position.x) + Math.sin(flickerTime * 0.33 + phase) * 0.12;
        flame.position.z = Number(flame.userData.crashBaseZ ?? flame.position.z) + Math.cos(flickerTime * 0.29 + phase) * 0.12;
      });

      effect.smoke.forEach((puff, index) => {
        puff.visible = index % lodStride === 0;
        if (!puff.visible) return;
        const phase = Number(puff.userData.crashPhase ?? 0);
        const cycle = (effect.age * 0.34 + phase * 0.11) % 1;
        const baseY = Number(puff.userData.crashBaseY ?? 1);
        const baseScale = Number(puff.userData.crashBaseScale ?? 1);
        puff.position.y = baseY + cycle * (3.2 + effect.intensity * 1.6);
        const expand = baseScale * (0.9 + cycle * 1.15) * Math.max(0.35, life);
        puff.scale.setScalar(expand);
      });

      if (effect.flash) {
        effect.flash.visible = effect.age < 0.22;
        if (effect.flash.visible) {
          const flashLife = THREE.MathUtils.clamp(1 - effect.age / 0.22, 0, 1);
          effect.flash.scale.setScalar(1.8 * effect.intensity * (0.72 + flashLife * 0.28));
        }
      }
      if (effect.scorch) effect.scorch.visible = life > 0.02;

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
    this.crashSmokeGeometry.dispose();
    this.crashFlashGeometry.dispose();
    this.crashScorchGeometry.dispose();
    this.crashFlameMaterial.dispose();
    this.crashFlameCoreMaterial.dispose();
    this.crashSmokeMaterial.dispose();
    this.crashFlashMaterial.dispose();
    this.crashScorchMaterial.dispose();
  }
}
