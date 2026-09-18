import * as THREE from 'three';
import { createPokeBallModel } from './models';
import { ParticleEffectsManager } from './particles';
import { disposeTransientObject3D } from './dispose';

interface SwitchRequest {
  fromMesh: THREE.Group;
  toMesh: THREE.Group;
  position: THREE.Vector3;
  yaw: number;
  onComplete: (newMesh: THREE.Group) => void;
}

/**
 * Fast, readable Pokémon switch animation:
 * ball flies in -> old Pokémon is recalled -> ball shakes -> new Pokémon bursts out.
 */
export class PokemonSwitchAnimator {
  public active = false;
  private scene: THREE.Scene;
  private particles: ParticleEffectsManager;
  private request: SwitchRequest | null = null;
  private ball: THREE.Group | null = null;
  private timer = 0;
  private fromScale = new THREE.Vector3(1, 1, 1);
  private toBaseScale = new THREE.Vector3(1, 1, 1);
  private flash: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, particles: ParticleEffectsManager) {
    this.scene = scene;
    this.particles = particles;
  }

  public start(request: SwitchRequest): boolean {
    if (this.active) return false;
    this.active = true;
    this.timer = 0;
    this.request = request;
    this.fromScale.copy(request.fromMesh.scale);
    this.toBaseScale.copy(request.toMesh.scale);

    const ball = createPokeBallModel();
    ball.scale.setScalar(0.72);
    ball.position.copy(request.position).add(new THREE.Vector3(-1.2, 3.2, -1.8));
    ball.rotation.y = request.yaw;
    this.scene.add(ball);
    this.ball = ball;

    request.toMesh.visible = false;
    request.toMesh.position.copy(request.position);
    request.toMesh.rotation.y = request.yaw;
    this.scene.add(request.toMesh);

    // Mesh-based flash instead of a transient PointLight. Runtime light-count
    // changes can invalidate Three.js shader-light variants for the whole scene and
    // caused severe renderer stalls on the large world. Additive geometry keeps the
    // same readable switch flash with a stable renderer light topology.
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xff3344,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.flash.position.copy(request.position).add(new THREE.Vector3(0, 1.0, 0));
    this.flash.renderOrder = 46;
    this.scene.add(this.flash);
    return true;
  }

  private setFlashStrength(strength: number, color = 0xff3344) {
    if (!this.flash || !(this.flash.material instanceof THREE.MeshBasicMaterial)) return;
    const level = THREE.MathUtils.clamp(strength, 0, 6);
    this.flash.visible = level > 0.01;
    this.flash.material.color.setHex(color);
    this.flash.material.opacity = THREE.MathUtils.clamp(level / 6, 0, 0.92);
    this.flash.scale.setScalar(0.65 + level * 0.16);
  }

  public update(dt: number) {
    if (!this.active || !this.request || !this.ball) return;
    this.timer += Math.min(dt, 0.05);

    const { fromMesh, toMesh, position, onComplete } = this.request;
    const ball = this.ball;

    // 0.00 - 0.35: throw/fly ball toward the current Pokémon and recall it.
    if (this.timer < 0.35) {
      const t = THREE.MathUtils.smoothstep(this.timer / 0.35, 0, 1);
      const start = position.clone().add(new THREE.Vector3(-1.2, 3.2, -1.8));
      const end = position.clone().add(new THREE.Vector3(0.25, 1.05, 0.25));
      ball.position.lerpVectors(start, end, t);
      ball.rotation.x += dt * 8;
      ball.rotation.z += dt * 10;

      const shrink = Math.max(0.03, 1 - t * 0.97);
      fromMesh.scale.copy(this.fromScale).multiplyScalar(shrink);
      fromMesh.position.y = position.y + t * 0.8;
      this.setFlashStrength(2.8 * Math.sin(t * Math.PI), 0xff3344);
      if (t > 0.45 && Math.random() < 0.35) {
        this.particles.emitRecallSpark(fromMesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xff3344);
      }
      return;
    }

    // 0.35 - 1.05: Pokémon is inside. Ball drops and gives three obvious shakes.
    fromMesh.visible = false;
    const shakeT = (this.timer - 0.35) / 0.70;
    if (shakeT <= 1) {
      ball.position.copy(position).add(new THREE.Vector3(0, 0.58 + Math.abs(Math.sin(shakeT * Math.PI * 3)) * 0.08, 0));
      ball.rotation.z = Math.sin(shakeT * Math.PI * 6) * 0.38 * (1 - shakeT * 0.25);
      ball.rotation.x = 0;
      this.setFlashStrength(0);
      return;
    }

    // 1.05 - 1.40: ball opens in a flash and the next Pokémon expands out of it.
    const releaseT = THREE.MathUtils.clamp((this.timer - 1.05) / 0.35, 0, 1);
    if (releaseT < 1) {
      toMesh.visible = true;
      toMesh.position.copy(position);
      toMesh.position.y = position.y + (1 - releaseT) * 0.45;
      toMesh.scale.copy(this.toBaseScale).multiplyScalar(Math.max(0.05, THREE.MathUtils.smoothstep(releaseT, 0, 1)));
      ball.scale.setScalar(0.72 + Math.sin(releaseT * Math.PI) * 0.22);
      ball.position.y = position.y + 0.65 + releaseT * 0.5;
      this.setFlashStrength(5.5 * Math.sin(releaseT * Math.PI), 0xffffff);
      if (Math.random() < 0.55) {
        this.particles.emitRecallSpark(position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffffff);
      }
      return;
    }

    toMesh.scale.copy(this.toBaseScale);
    toMesh.position.copy(position);
    toMesh.rotation.y = this.request.yaw;
    this.scene.remove(fromMesh);
    this.scene.remove(ball);
    disposeTransientObject3D(ball);
    if (this.flash) {
      this.scene.remove(this.flash);
      disposeTransientObject3D(this.flash);
    }

    this.ball = null;
    this.flash = null;
    this.request = null;
    this.active = false;
    onComplete(toMesh);
  }

  public cancel() {
    if (!this.request) return;
    this.request.fromMesh.visible = true;
    this.request.fromMesh.scale.copy(this.fromScale);
    if (this.ball) {
      this.scene.remove(this.ball);
      disposeTransientObject3D(this.ball);
    }
    if (this.flash) {
      this.scene.remove(this.flash);
      disposeTransientObject3D(this.flash);
    }
    this.scene.remove(this.request.toMesh);
    this.ball = null;
    this.flash = null;
    this.request = null;
    this.active = false;
  }
}
