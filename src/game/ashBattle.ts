import * as THREE from 'three';
import { AshBossFighter } from '../types';
import {
  createHomerNPC,
  createMargeNPC,
  createBartNPC,
  createLisaNPC,
  createMaggieNPC,
  createMoeNPC,
  createApuNPC,
} from './models';
import { playSoundEffect } from './audio';

export interface AshBattleState {
  isActive: boolean;
  currentBossIndex: number;
  currentBoss: AshBossFighter | null;
  defeatedBosses: string[];
  allDefeated: boolean;
  bossMesh: THREE.Group | null;
  ashMesh: THREE.Group | null;
  duelPrompt: string | null;
  battleLog: string;
}

export class AshBattleManager {
  public state: AshBattleState = {
    isActive: false,
    currentBossIndex: 0,
    currentBoss: null,
    defeatedBosses: [],
    allDefeated: false,
    bossMesh: null,
    ashMesh: null,
    duelPrompt: null,
    battleLog: '',
  };

  private scene: THREE.Scene;
  private arenaCenter: THREE.Vector3;
  private onBossDefeatedCallback?: (unlockedGeodude: boolean) => void;
  private onPlayerHitCallback?: (amount: number, fighter: AshBossFighter) => void;
  private nextBossTimeout: number | null = null;
  private tempScale = new THREE.Vector3(1, 1, 1);
  // One-time progression reward state is deliberately separate from battle activity.
  // Ash can be rematched forever, but only the first clear can grant progression.
  private rewardClaimed = false;

  private bossRoster: {
    id: string;
    name: string;
    maxHp: number;
    speed: number;
    specialMove: string;
    dialogue: string;
    modelFactory: () => THREE.Group;
    weight: number;
    maxVerticalReach: number;
    minVerticalReach: number;
    attackRange3D: number;
    isRanged: boolean;
  }[] = [
    {
      id: 'homer',
      name: 'Homer Simpson',
      maxHp: 125,
      speed: 9.2,
      specialMove: 'Donut Belly Tackle',
      dialogue: "D'OH! Why you little Pokémon!",
      modelFactory: createHomerNPC,
      weight: 1.8,
      maxVerticalReach: 1.9,
      minVerticalReach: -1.2,
      attackRange3D: 3.4,
      isRanged: false,
    },
    {
      id: 'marge',
      name: 'Marge Simpson',
      maxHp: 115,
      speed: 9.8,
      specialMove: 'Beehive Hair Whip',
      dialogue: 'Mmm-mmph! Put that thunderbolt away this instant!',
      modelFactory: createMargeNPC,
      weight: 1.1,
      maxVerticalReach: 2.6,
      minVerticalReach: -1.2,
      attackRange3D: 3.2,
      isRanged: false,
    },
    {
      id: 'bart',
      name: 'Bart Simpson',
      maxHp: 95,
      speed: 13.5,
      specialMove: 'Skateboard Ollie Rush',
      dialogue: 'Eat my shorts, pocket monster!',
      modelFactory: createBartNPC,
      weight: 0.75,
      maxVerticalReach: 2.2,
      minVerticalReach: -1.2,
      attackRange3D: 3.8,
      isRanged: false,
    },
    {
      id: 'lisa',
      name: 'Lisa Simpson',
      maxHp: 90,
      speed: 10.8,
      specialMove: 'Saxophone Sonic Blast',
      dialogue: "According to vegetarian ethics, you shouldn't fight!",
      modelFactory: createLisaNPC,
      weight: 0.7,
      maxVerticalReach: 3.8,
      minVerticalReach: -1.8,
      attackRange3D: 6.5,
      isRanged: true,
    },
    {
      id: 'maggie',
      name: 'Maggie Simpson',
      maxHp: 75,
      speed: 9.0,
      specialMove: 'Pacifier Laser Burst',
      dialogue: '*Suck suck suck* (somehow threatening)',
      modelFactory: createMaggieNPC,
      weight: 0.35,
      maxVerticalReach: 4.2,
      minVerticalReach: -1.8,
      attackRange3D: 6.0,
      isRanged: true,
    },
    {
      id: 'moe',
      name: 'Moe Szyslak',
      maxHp: 130,
      speed: 10.4,
      specialMove: 'Bar Stool Overhead Slam',
      dialogue: "Alright pal, you're 86'd from Moe's Tavern!",
      modelFactory: createMoeNPC,
      weight: 1.25,
      maxVerticalReach: 2.4,
      minVerticalReach: -1.2,
      attackRange3D: 3.2,
      isRanged: false,
    },
    {
      id: 'apu',
      name: 'Apu Nahasapeetilon',
      maxHp: 110,
      speed: 11.2,
      specialMove: 'Frozen Squishee Barrage',
      dialogue: 'Thank you, come again and taste my wrath!',
      modelFactory: createApuNPC,
      weight: 0.95,
      maxVerticalReach: 3.5,
      minVerticalReach: -1.8,
      attackRange3D: 5.2,
      isRanged: true,
    },
  ];

  constructor(
    scene: THREE.Scene,
    arenaCenter: THREE.Vector3,
    onDefeatAll?: (unlocked: boolean) => void,
    onPlayerHit?: (amount: number, fighter: AshBossFighter) => void
  ) {
    this.scene = scene;
    this.arenaCenter = arenaCenter.clone();
    this.onBossDefeatedCallback = onDefeatAll;
    this.onPlayerHitCallback = onPlayerHit;
  }

  public setAshMesh(mesh: THREE.Group) {
    this.state.ashMesh = mesh;
  }

  public setRewardClaimed(claimed: boolean) {
    this.rewardClaimed = claimed;
    if (claimed) this.state.allDefeated = true;
  }

  public startBattle(playerPos?: THREE.Vector3): string {
    if (this.nextBossTimeout !== null) {
      window.clearTimeout(this.nextBossTimeout);
      this.nextBossTimeout = null;
    }
    // Anchor the arena to where the challenge actually starts. Previously the
    // fixed living-room centre could leash bosses away from the player and make
    // them slowly walk against an invisible radius instead of fighting.
    if (playerPos) this.arenaCenter.copy(playerPos);
    this.state.isActive = true;
    this.state.currentBossIndex = 0;
    this.state.defeatedBosses = [];
    // `allDefeated` is the permanent progression flag. Do not clear it for rematches.
    this.state.battleLog = this.rewardClaimed
      ? 'Ash: "Rematch time! Springfield Dream Team, I choose you!"'
      : 'Ash: "Springfield Dream Team, I choose you!"';
    playSoundEffect('fanfare');
    this.summonNextBoss();
    return this.state.battleLog;
  }

  private summonNextBoss() {
    if (this.state.currentBossIndex >= this.bossRoster.length) {
      this.state.isActive = false;
      this.state.currentBoss = null;
      this.state.bossMesh = null;
      const firstClear = !this.rewardClaimed;
      this.state.allDefeated = true;
      if (firstClear) {
        this.rewardClaimed = true;
        this.state.battleLog = 'Ash: "WHAT?! You beat all seven! Fine. Take the Geodude with the stupid legs!"';
      } else {
        this.state.battleLog = 'Ash: "Okay, okay! You win the rematch. Same time again later?"';
      }
      playSoundEffect('fanfare');
      // The callback receives whether this was the FIRST clear. Repeat clears never
      // duplicate Geodude, save rewards, progression events or victory banners.
      this.onBossDefeatedCallback?.(firstClear);
      return;
    }

    if (this.state.bossMesh) {
      this.scene.remove(this.state.bossMesh);
      this.state.bossMesh = null;
    }

    const rosterEntry = this.bossRoster[this.state.currentBossIndex];
    const mesh = rosterEntry.modelFactory();
    mesh.position.copy(this.arenaCenter);
    mesh.position.x += (Math.random() - 0.5) * 3;
    mesh.position.z += (Math.random() - 0.5) * 3;
    mesh.position.y = 0.12;
    mesh.userData.hitVelocity = new THREE.Vector3();
    mesh.userData.hitTimer = 0;
    mesh.userData.weight = rosterEntry.weight;
    mesh.userData.defeated = false;
    mesh.userData.attackAnimTimer = 0;
    mesh.userData.spinDirection = Math.random() > 0.5 ? 1 : -1;
    this.scene.add(mesh);
    this.state.bossMesh = mesh;

    this.state.currentBoss = {
      id: rosterEntry.id,
      name: rosterEntry.name,
      hp: rosterEntry.maxHp,
      maxHp: rosterEntry.maxHp,
      mesh,
      position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      speed: rosterEntry.speed,
      specialMove: rosterEntry.specialMove,
      dialogue: rosterEntry.dialogue,
      state: 'idle',
      attackCooldown: 0.55,
    };

    this.state.battleLog = `Ash sent out ${rosterEntry.name}! "${rosterEntry.dialogue}"`;
    playSoundEffect('kick');
  }

  public damageBoss(
    amount: number,
    hitType: 'kick' | 'special',
    sourcePos?: THREE.Vector3,
    launchForce = 10
  ): boolean {
    if (!this.state.isActive || !this.state.currentBoss || !this.state.bossMesh) return false;
    const boss = this.state.currentBoss;
    const mesh = this.state.bossMesh;
    if (boss.isDefeated) return false;

    boss.hp = Math.max(0, (boss.hp ?? boss.maxHp) - amount);
    playSoundEffect(hitType === 'kick' ? 'kick' : 'thunder');

    const source = sourcePos ?? this.arenaCenter.clone().add(new THREE.Vector3(0, 0, -2));
    const direction = mesh.position.clone().sub(source).setY(0);
    if (direction.lengthSq() < 0.001) direction.set(0, 0, 1);
    direction.normalize();

    const weight = Math.max(0.35, mesh.userData.weight ?? 1);
    const forceScale = 1 / Math.sqrt(weight);
    const velocity = mesh.userData.hitVelocity as THREE.Vector3;
    velocity.set(
      direction.x * launchForce * forceScale,
      (hitType === 'special' ? 8.5 : 6.5) * Math.max(0.62, forceScale),
      direction.z * launchForce * forceScale
    );
    mesh.userData.hitTimer = 0.48;
    mesh.userData.spinDirection = Math.random() > 0.5 ? 1 : -1;
    mesh.scale.set(hitType === 'special' ? 1.22 : 1.12, 0.82, hitType === 'special' ? 1.22 : 1.12);

    if ((boss.hp ?? 0) <= 0) {
      boss.isDefeated = true;
      boss.state = 'defeated';
      mesh.userData.defeated = true;
      velocity.multiplyScalar(1.35);
      velocity.y += 4.5;
      this.state.defeatedBosses.push(boss.name);
      this.state.battleLog = `${boss.name} got absolutely launched and fainted!`;
      playSoundEffect('fanfare');

      this.nextBossTimeout = window.setTimeout(() => {
        this.nextBossTimeout = null;
        this.state.currentBossIndex++;
        this.summonNextBoss();
      }, 1350);
      return true;
    }

    this.state.battleLog = `${boss.name} took ${Math.round(amount)} DMG! HP: ${Math.max(0, Math.round(boss.hp ?? 0))}/${Math.max(0, Math.round(boss.maxHp))}`;
    return false;
  }

  public update(dt: number, playerPos: THREE.Vector3) {
    if (!this.state.isActive || !this.state.currentBoss || !this.state.bossMesh) return;

    const boss = this.state.currentBoss;
    const mesh = this.state.bossMesh;
    const velocity = mesh.userData.hitVelocity as THREE.Vector3;

    // Player hits actually throw bosses around instead of only nudging them upward.
    if (mesh.userData.hitTimer > 0 || velocity.lengthSq() > 0.05) {
      mesh.userData.hitTimer = Math.max(0, (mesh.userData.hitTimer ?? 0) - dt);
      mesh.position.addScaledVector(velocity, dt);
      velocity.y -= 20 * dt;
      const spin = mesh.userData.spinDirection ?? 1;
      mesh.rotation.z += dt * 7 * spin;
      mesh.rotation.x += dt * 4.5;

      if (mesh.position.y <= 0.12) {
        mesh.position.y = 0.12;
        if (Math.abs(velocity.y) > 5 && !mesh.userData.defeated) {
          velocity.y = Math.abs(velocity.y) * 0.22;
          velocity.x *= 0.55;
          velocity.z *= 0.55;
        } else {
          velocity.set(0, 0, 0);
          if (!mesh.userData.defeated) {
            mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0, 0.65);
            mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, 0, 0.65);
          }
        }
      }

      mesh.scale.lerp(this.tempScale, Math.min(1, dt * 8));
      this.updateBossPosition();
      return;
    }

    if (boss.isDefeated) {
      mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, Math.PI / 2, Math.min(1, dt * 4));
      this.updateBossPosition();
      return;
    }

    const deltaY = playerPos.y - mesh.position.y;
    const dist3D = playerPos.distanceTo(mesh.position);
    const toPlayer = playerPos.clone().sub(mesh.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const direction = dist > 0.001 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1);

    const rosterEntry = this.bossRoster[this.state.currentBossIndex];
    const maxVertReach = rosterEntry?.maxVerticalReach ?? 2.2;
    const minVertReach = rosterEntry?.minVerticalReach ?? -1.4;
    const attackRange3D = rosterEntry?.attackRange3D ?? 3.4;
    const isRanged = rosterEntry?.isRanged ?? false;

    const isPlayerOutOfVerticalReach = deltaY > maxVertReach || deltaY < minVertReach;
    const isPlayerIn3DAttackRange = dist3D <= attackRange3D && !isPlayerOutOfVerticalReach;

    // Aggressive boss pursuit. They now sprint at the player instead of slowly
    // shuffling toward a fixed point. Close-range fighters deliberately lunge,
    // while Lisa/Maggie/Apu keep just enough distance for their ranged specials.
    const preferredRange =
      boss.id === 'lisa' ? 4.2 :
      boss.id === 'maggie' ? 4.0 :
      boss.id === 'apu' ? 3.6 : 1.65;
    if (dist > preferredRange) {
      const sprintMultiplier =
        boss.id === 'bart' ? 1.18 :
        boss.id === 'homer' ? 0.96 :
        boss.id === 'maggie' ? 1.05 : 1.0;
      mesh.position.addScaledVector(direction, boss.speed * sprintMultiplier * dt);
      mesh.rotation.y = Math.atan2(direction.x, direction.z);
      mesh.position.y = 0.12 + Math.abs(Math.sin(performance.now() * 0.012)) * (boss.id === 'homer' ? 0.10 : 0.18);
    } else if (dist < preferredRange * 0.55 && isRanged && !isPlayerOutOfVerticalReach) {
      // Ranged fighters back-step rather than standing motionless inside the player.
      mesh.position.addScaledVector(direction, -boss.speed * 0.45 * dt);
      mesh.rotation.y = Math.atan2(direction.x, direction.z);
    } else {
      mesh.rotation.y = Math.atan2(direction.x, direction.z);
    }

    // If the player is airborne high above, ground bosses tilt/look up towards the player
    if (deltaY > 1.2 && (mesh.userData.attackAnimTimer ?? 0) <= 0) {
      const lookUpAngle = THREE.MathUtils.clamp((deltaY - 1.2) * 0.08, 0, 0.45);
      mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, -lookUpAngle, Math.min(1, dt * 6));
    }

    // A generous arena leash keeps the brawl around the Simpsons property without
    // ever preventing a boss from reaching the player inside/around the house.
    const arenaDelta = mesh.position.clone().sub(this.arenaCenter).setY(0);
    if (arenaDelta.length() > 22) {
      arenaDelta.setLength(22);
      mesh.position.x = this.arenaCenter.x + arenaDelta.x;
      mesh.position.z = this.arenaCenter.z + arenaDelta.z;
    }

    boss.attackCooldown -= dt;
    mesh.userData.attackAnimTimer = Math.max(0, (mesh.userData.attackAnimTimer ?? 0) - dt);

    if (boss.attackCooldown <= 0) {
      if (isPlayerIn3DAttackRange) {
        const damageByBoss: Record<string, number> = {
          homer: 14, marge: 12, bart: 10, lisa: 9, maggie: 8, moe: 15, apu: 11,
        };
        const damage = damageByBoss[boss.id] ?? 10;
        boss.attackCooldown = boss.id === 'bart' ? 0.62 : boss.id === 'maggie' ? 0.78 : boss.id === 'homer' ? 0.92 : 0.82;
        mesh.userData.attackAnimTimer = 0.38;
        this.state.battleLog = `${boss.name} used ${boss.specialMove}! -${damage} HP`;
        playSoundEffect('kick');

        if (boss.id === 'homer') {
          mesh.scale.set(1.38, 0.78, 1.38);
          mesh.position.addScaledVector(direction, 1.2);
        } else if (boss.id === 'marge') {
          mesh.rotation.y += Math.PI * 1.7;
          mesh.scale.set(1.0, 1.18, 1.0);
        } else if (boss.id === 'bart') {
          mesh.position.addScaledVector(direction, 1.5);
          mesh.rotation.z = -0.48;
        } else if (boss.id === 'lisa') {
          mesh.rotation.z = 0.35;
          mesh.scale.set(1.12, 1.12, 1.12);
        } else if (boss.id === 'maggie') {
          mesh.position.y += 0.75;
          mesh.scale.set(1.35, 1.35, 1.35);
        } else if (boss.id === 'moe') {
          mesh.rotation.x = -0.55;
          mesh.scale.set(1.18, 1.0, 1.18);
        } else if (boss.id === 'apu') {
          mesh.rotation.z = -0.34;
          mesh.position.addScaledVector(direction, 1.0);
        }

        this.onPlayerHitCallback?.(damage, boss);
      } else if (deltaY > maxVertReach && dist < 4.0) {
        // Player is flying safely above the team's reach: attack cannot hit or damage player
        boss.attackCooldown = 0.55;
        mesh.userData.attackAnimTimer = 0.22;
        if (Math.random() < 0.12) {
          this.state.battleLog = `${boss.name} cannot reach you while you are flying above!`;
        }
      }
    }

    mesh.scale.lerp(this.tempScale, Math.min(1, dt * 7));
    if ((mesh.userData.attackAnimTimer ?? 0) <= 0) {
      mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0, Math.min(1, dt * 7));
      mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, 0, Math.min(1, dt * 7));
    }

    this.updateBossPosition();
  }

  private updateBossPosition() {
    if (!this.state.currentBoss || !this.state.bossMesh) return;
    this.state.currentBoss.position = {
      x: this.state.bossMesh.position.x,
      y: this.state.bossMesh.position.y,
      z: this.state.bossMesh.position.z,
    };
  }

  /**
   * End the current challenge without counting it as a win. Used when the player
   * faints/leaves the challenge so no boss can keep attacking after a respawn.
   * Permanent reward/progression state is deliberately preserved, allowing both
   * first attempts and rematches to be started again normally later.
   */
  public abortBattle(reason = 'Ash challenge ended. Talk to Ash to try again.'): string {
    if (this.nextBossTimeout !== null) {
      window.clearTimeout(this.nextBossTimeout);
      this.nextBossTimeout = null;
    }
    if (this.state.bossMesh) {
      this.scene.remove(this.state.bossMesh);
      this.state.bossMesh = null;
    }
    this.state.isActive = false;
    this.state.currentBossIndex = 0;
    this.state.currentBoss = null;
    this.state.defeatedBosses = [];
    this.state.duelPrompt = null;
    this.state.battleLog = reason;
    return reason;
  }

  public cleanup() {
    this.abortBattle('');
  }
}
