import * as THREE from 'three';
import { CollisionSystem } from './doors';
import { PlayerMovement } from './physics';

export type ParachuteMode = 'freefall' | 'parachute';

export type ParachuteInputs = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
};

export type ParachuteUpdateResult = {
  landed: boolean;
  impactSpeed: number;
  collided: boolean;
};

const clamp = THREE.MathUtils.clamp;

/**
 * Lightweight arcade freefall/parachute controller used only after an airborne
 * aircraft exit. It deliberately owns only the player's airborne movement and a
 * pooled canopy mesh; normal PlayerMovement regains control immediately on landing.
 */
export class ParachuteController {
  public mode: ParachuteMode = 'freefall';
  public yaw: number;
  public deployment = 0;
  public readonly canopy: THREE.Group;

  private readonly scene: THREE.Scene;
  private readonly velocity = new THREE.Vector3();
  private readonly desiredHorizontal = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly next = new THREE.Vector3();
  private elapsed = 0;
  private destroyed = false;

  constructor(scene: THREE.Scene, initialVelocity: THREE.Vector3, initialYaw: number) {
    this.scene = scene;
    this.velocity.copy(initialVelocity);
    this.yaw = initialYaw;
    this.canopy = this.createCanopy();
    this.canopy.visible = false;
    scene.add(this.canopy);
  }

  private createCanopy(): THREE.Group {
    const root = new THREE.Group();
    root.name = 'player_parachute';

    // Six original coloured canopy panels form one broad, readable arcade canopy.
    // The half-sphere geometry provides real curvature rather than a flat triangle.
    const panelColors = [0x2367c9, 0xf5c84c, 0x2f8ad8, 0xf0e7ca, 0x2367c9, 0xf5c84c];
    const panelCount = panelColors.length;
    for (let i = 0; i < panelCount; i++) {
      const geometry = new THREE.SphereGeometry(
        3.75,
        10,
        7,
        (i / panelCount) * Math.PI * 2,
        (Math.PI * 2) / panelCount + 0.018,
        0,
        Math.PI * 0.5,
      );
      const material = new THREE.MeshStandardMaterial({
        color: panelColors[i],
        roughness: 0.48,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });
      const panel = new THREE.Mesh(geometry, material);
      panel.scale.set(1.0, 0.45, 0.72);
      panel.castShadow = true;
      panel.receiveShadow = true;
      root.add(panel);
    }

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(3.72, 0.055, 6, 32),
      new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.42, metalness: 0.04 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.72;
    root.add(rim);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xf1f4f7, transparent: true, opacity: 0.86 });
    const anchors = [
      [-2.75, 0.18, 1.20], [2.75, 0.18, 1.20],
      [-2.75, 0.18, -1.20], [2.75, 0.18, -1.20],
    ];
    for (const [x, y, z] of anchors) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(x * 0.13, -4.15, z * 0.08),
      ]);
      root.add(new THREE.Line(geometry, lineMaterial));
    }

    const harness = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.045, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0x252a32, roughness: 0.72, metalness: 0.10 }),
    );
    harness.rotation.x = Math.PI / 2;
    harness.position.y = -4.1;
    root.add(harness);

    root.scale.setScalar(0.08);
    return root;
  }

  public deploy(): boolean {
    if (this.destroyed || this.mode !== 'freefall') return false;
    this.mode = 'parachute';
    this.deployment = 0;
    this.canopy.visible = true;
    this.canopy.scale.setScalar(0.08);
    return true;
  }

  /**
   * Cut the currently deployed canopy and return to freefall. The same packed
   * canopy can be redeployed later with deploy(), which gives the player the
   * arcade-style drop/redeploy loop without allocating another controller.
   */
  public cutAway(): boolean {
    if (this.destroyed || this.mode !== 'parachute') return false;
    this.mode = 'freefall';
    this.deployment = 0;
    this.canopy.visible = false;
    this.canopy.scale.setScalar(0.08);
    return true;
  }

  public getVelocity(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.velocity);
  }

  public update(
    dt: number,
    inputs: ParachuteInputs,
    movement: PlayerMovement,
    collisionSystem: CollisionSystem,
  ): ParachuteUpdateResult {
    const frameDt = Math.min(dt, 0.05);
    this.elapsed += frameDt;
    const result: ParachuteUpdateResult = { landed: false, impactSpeed: 0, collided: false };

    const turnInput = (inputs.left ? 1 : 0) - (inputs.right ? 1 : 0);
    const steerRate = this.mode === 'parachute' ? 1.18 : 0.72;
    this.yaw += turnInput * steerRate * frameDt;
    while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.right.set(this.forward.z, 0, -this.forward.x);

    if (this.mode === 'freefall') {
      // Preserve most aircraft ejection momentum while permitting mild player input.
      const glideInput = (inputs.forward ? 1 : 0) - (inputs.backward ? 1 : 0);
      this.desiredHorizontal.copy(this.forward).multiplyScalar(glideInput * 5.4);
      this.desiredHorizontal.addScaledVector(this.right, turnInput * 1.7);
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, this.desiredHorizontal.x, 0.72, frameDt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, this.desiredHorizontal.z, 0.72, frameDt);
      this.velocity.y = Math.max(-36, this.velocity.y - 18.5 * frameDt);
    } else {
      this.deployment = clamp(this.deployment + frameDt / 0.52, 0, 1);
      const opening = this.deployment * this.deployment * (3 - 2 * this.deployment);
      const glideSpeed = inputs.forward ? 10.2 : inputs.backward ? 3.2 : 6.8;
      this.desiredHorizontal.copy(this.forward).multiplyScalar(glideSpeed);
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, this.desiredHorizontal.x, 2.7 * opening + 0.35, frameDt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, this.desiredHorizontal.z, 2.7 * opening + 0.35, frameDt);

      // Opening is progressive. Deploying two metres above the ground therefore
      // cannot instantly erase a lethal freefall speed.
      this.velocity.y = Math.max(-38, this.velocity.y - 12.0 * (1 - opening) * frameDt);
      const targetDescent = inputs.backward ? -7.6 : inputs.forward ? -5.1 : -6.1;
      this.velocity.y = THREE.MathUtils.damp(this.velocity.y, targetDescent, 3.6 * opening, frameDt);

      const openScale = THREE.MathUtils.lerp(0.08, 1, opening);
      this.canopy.scale.setScalar(openScale);
      this.canopy.position.copy(movement.position).add(new THREE.Vector3(0, 5.05, 0));
      this.canopy.rotation.y = this.yaw;
      this.canopy.rotation.x = THREE.MathUtils.damp(this.canopy.rotation.x, inputs.forward ? -0.10 : inputs.backward ? 0.08 : 0, 4.5, frameDt);
      this.canopy.rotation.z = THREE.MathUtils.damp(this.canopy.rotation.z, -turnInput * 0.13, 5.0, frameDt);
    }

    this.next.copy(movement.position).addScaledVector(this.velocity, frameDt);
    // Use the normal player body for meaningful wall contact. The visual canopy
    // deliberately has no heavy collider, preventing canopy/building explosions.
    const resolved = collisionSystem.resolveCollision(movement.position, this.next, 0.62, 1.9);
    if (resolved.collided) {
      result.collided = true;
      this.velocity.x *= 0.34;
      this.velocity.z *= 0.34;
    }

    const ground = collisionSystem.getGroundHeightNear(
      resolved.position.x,
      resolved.position.z,
      resolved.position.y,
      0.12,
      1.2,
      400,
    );

    // Flying-body collision catches roofs/ceilings and other major 3D structures
    // that ordinary on-foot wall collision intentionally ignores. Keep the previous
    // position if the next body volume is obstructed; the canopy itself stays visual.
    if (resolved.position.y > ground + 0.04 && !collisionSystem.canFlyOccupy(resolved.position, 0.62, 1.9)) {
      result.collided = true;
      this.velocity.x *= 0.24;
      this.velocity.z *= 0.24;
      this.velocity.y = Math.min(-0.8, this.velocity.y * 0.32);
    } else {
      movement.position.copy(resolved.position);
    }

    if (movement.position.y <= ground + 0.02 && this.velocity.y <= 0) {
      result.landed = true;
      result.impactSpeed = Math.abs(this.velocity.y);
      movement.position.y = ground;
      movement.velocity.set(0, 0, 0);
      movement.isGrounded = true;
      this.canopy.visible = false;
      return result;
    }

    movement.velocity.copy(this.velocity);
    movement.yaw = this.yaw;
    movement.isGrounded = false;
    movement.isStomping = false;
    movement.jumpsUsed = 0;
    return result;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.remove(this.canopy);
    this.canopy.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Line)) return;
      const geometry = obj.geometry as THREE.BufferGeometry | undefined;
      geometry?.dispose();
      const material = obj.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
  }
}
