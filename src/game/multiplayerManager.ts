import * as THREE from 'three';
import { PokemonCharacterId, Vehicle } from '../types';
import { AirportAircraft } from './airport';
import { createPokemonModel, animatePokemonModel } from './models';
import { PokemonAnimState } from './models';

export interface RemotePlayer {
  id: string;
  name: string;
  characterId: PokemonCharacterId;
  isHost: boolean;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  animState: PokemonAnimState;
  isSprinting: boolean;
  isJumping: boolean;
  inVehicle: boolean;
  vehicleId: string | null;
  inAircraft: boolean;
  aircraftId: string | null;
  onToothless: boolean;
  toothlessMounting: boolean;
  hp: number;
  animTime: number;
  lastUpdate: number;
  mesh?: THREE.Group;
  nameTag?: THREE.Sprite;
  collisionRadius: number;
}

export interface MultiplayerClientState {
  isConnected: boolean;
  isConnecting: boolean;
  isInRoom: boolean;
  roomCode: string | null;
  isHost: boolean;
  localPlayerId: string | null;
  localPlayerName: string;
  players: RemotePlayer[];
  playerCount: number;
  lastError: string | null;
}

export interface LocalPlayerSyncData {
  position: THREE.Vector3;
  yaw: number;
  animState: PokemonAnimState;
  isSprinting: boolean;
  isJumping: boolean;
  characterId: PokemonCharacterId;
  inVehicle: boolean;
  vehicleId: string | null;
  inAircraft: boolean;
  aircraftId: string | null;
  onToothless: boolean;
  toothlessMounting: boolean;
  toothlessState?: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    roll: number;
    speed: number;
    verticalSpeed: number;
    wingFlap: number;
    airborne: boolean;
  } | null;
  hp: number;
  activeVehicle?: Vehicle | null;
  activeAircraft?: AirportAircraft | null;
}

/** Create a crisp billboard canvas sprite for a floating name tag */
function createNameTagSprite(name: string, isHost: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 64);

    // Pill background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(8, 12, 240, 40, 20);
    ctx.fill();

    // Border
    ctx.strokeStyle = isHost ? 'rgba(251, 191, 36, 0.9)' : 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(8, 12, 240, 40, 20);
    ctx.stroke();

    // Text
    ctx.font = 'bold 20px "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isHost) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`👑 ${name}`, 128, 32);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, 128, 32);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.4, 0.6, 1.0);
  return sprite;
}

function lerpAngle(start: number, end: number, factor: number): number {
  const diff = (end - start + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return start + diff * factor;
}

export class MultiplayerManager {
  private ws: WebSocket | null = null;
  public state: MultiplayerClientState = {
    isConnected: false,
    isConnecting: false,
    isInRoom: false,
    roomCode: null,
    isHost: false,
    localPlayerId: null,
    localPlayerName: 'Trainer',
    players: [],
    playerCount: 1,
    lastError: null,
  };

  private remotePlayers = new Map<string, RemotePlayer>();
  private vehicleOwners = new Map<string, string>(); // vehicleId -> playerId
  private aircraftOwners = new Map<string, string>(); // aircraftId -> playerId
  public toothlessOwner: string | null = null; // playerId of toothless rider
  public remoteToothlessState: {
    playerId: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    roll: number;
    speed: number;
    verticalSpeed: number;
    wingFlap: number;
    airborne: boolean;
    lastTime: number;
  } | null = null;
  private remoteVehicleStates = new Map<string, {
    x: number; y: number; z: number; yaw: number; pitch: number; roll: number;
    speed: number; steer: number; wrecked: boolean; damage: number; lastTime: number;
  }>();
  private remoteAircraftStates = new Map<string, {
    x: number; y: number; z: number; yaw: number; pitch: number; roll: number;
    speed: number; throttle: number; crashed: boolean; damage: number; onGround: boolean; lastTime: number;
  }>();

  private lastLocalSyncTime = 0;
  private lastLocalPos = new THREE.Vector3();
  private scene: THREE.Scene | null = null;
  private pingTimer: number | null = null;
  private visibilityListener: (() => void) | null = null;

  public onStateChange?: (state: MultiplayerClientState) => void;
  public onNotification?: (title: string, message: string) => void;
  public onHostDisconnected?: () => void;
  public onSpawnJoiner?: (spawnPos: { x: number; y: number; z: number; yaw: number }) => void;
  public onPropKnocked?: (propId: string, pos: THREE.Vector3, rot: THREE.Quaternion, vel: THREE.Vector3) => void;

  constructor() {
    // Keepalive and iOS Safari background tab recovery
    if (typeof window !== 'undefined') {
      this.visibilityListener = () => {
        if (document.visibilityState === 'visible' && this.state.isInRoom) {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('[Multiplayer] Tab became visible, reconnecting socket...');
            this.connect(() => {});
          }
        }
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  public destroy() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.visibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
    this.leaveRoom();
  }

  public initScene(scene: THREE.Scene) {
    this.scene = scene;
  }

  private emitState() {
    this.state.players = Array.from(this.remotePlayers.values());
    this.state.playerCount = (this.state.isInRoom ? 1 : 0) + this.remotePlayers.size;
    if (this.onStateChange) {
      this.onStateChange({ ...this.state, players: [...this.state.players] });
    }
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  private connect(callback: (success: boolean) => void) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.ws.readyState === WebSocket.OPEN) {
        callback(true);
      } else {
        const onOpen = () => {
          this.ws?.removeEventListener('open', onOpen);
          callback(true);
        };
        this.ws.addEventListener('open', onOpen);
      }
      return;
    }

    this.state.isConnecting = true;
    this.state.lastError = null;
    this.emitState();

    try {
      const url = this.getWebSocketUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.state.isConnected = true;
        this.state.isConnecting = false;
        this.emitState();
        callback(true);
      };

      this.ws.onclose = () => {
        this.handleDisconnect();
        callback(false);
      };

      this.ws.onerror = (err) => {
        console.warn('[Multiplayer] WebSocket connection error:', err);
        this.state.isConnecting = false;
        this.state.lastError = 'Could not connect to multiplayer server.';
        this.emitState();
        callback(false);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (e: any) {
      this.state.isConnecting = false;
      this.state.lastError = e?.message || 'Connection failed.';
      this.emitState();
      callback(false);
    }
  }

  private handleDisconnect() {
    const wasInRoom = this.state.isInRoom;
    this.state.isConnected = false;
    this.state.isConnecting = false;
    this.state.isInRoom = false;
    this.state.roomCode = null;
    this.state.isHost = false;
    this.state.localPlayerId = null;

    this.removeAllRemotePlayers();
    this.vehicleOwners.clear();
    this.aircraftOwners.clear();
    this.remoteVehicleStates.clear();
    this.remoteAircraftStates.clear();

    this.emitState();

    if (wasInRoom) {
      this.onNotification?.('Disconnected', 'Disconnected from multiplayer server.');
    }
  }

  public createRoom(
    playerName: string,
    characterId: PokemonCharacterId,
    initialPos: { x: number; y: number; z: number; yaw: number }
  ) {
    const cleanName = playerName.trim().slice(0, 16) || 'Host';
    this.state.localPlayerName = cleanName;

    this.connect((success) => {
      if (!success || !this.ws) {
        this.onNotification?.('Connection Error', 'Failed to reach multiplayer server.');
        return;
      }

      this.ws.send(
        JSON.stringify({
          type: 'create_room',
          playerName: cleanName,
          characterId,
          initialPos,
        })
      );
    });
  }

  public joinRoom(
    code: string,
    playerName: string,
    characterId: PokemonCharacterId,
    initialPos: { x: number; y: number; z: number; yaw: number }
  ) {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = playerName.trim().slice(0, 16) || 'Player';
    this.state.localPlayerName = cleanName;

    this.connect((success) => {
      if (!success || !this.ws) {
        this.onNotification?.('Connection Error', 'Failed to reach multiplayer server.');
        return;
      }

      this.ws.send(
        JSON.stringify({
          type: 'join_room',
          code: cleanCode,
          playerName: cleanName,
          characterId,
          initialPos,
        })
      );
    });
  }

  public leaveRoom() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'leave_room' }));
      } catch {
        // Ignore
      }
    }
    this.state.isInRoom = false;
    this.state.roomCode = null;
    this.state.isHost = false;
    this.state.localPlayerId = null;

    this.removeAllRemotePlayers();
    this.vehicleOwners.clear();
    this.aircraftOwners.clear();
    this.remoteVehicleStates.clear();
    this.remoteAircraftStates.clear();

    this.emitState();
    this.onNotification?.('Multiplayer', 'Left multiplayer session. Single-player mode active.');
  }

  private handleMessage(raw: string) {
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data.type) {
      case 'room_created': {
        this.state.isInRoom = true;
        this.state.roomCode = data.code;
        this.state.isHost = true;
        this.state.localPlayerId = data.playerId;
        this.state.lastError = null;
        this.emitState();
        this.onNotification?.('Session Created', `Room Code: ${data.code}. Share with others to join!`);
        break;
      }

      case 'room_joined': {
        this.state.isInRoom = true;
        this.state.roomCode = data.code;
        this.state.isHost = false;
        this.state.localPlayerId = data.playerId;
        this.state.lastError = null;

        // Initialize existing players
        if (Array.isArray(data.players)) {
          for (const p of data.players) {
            this.addOrUpdateRemotePlayer(p);
          }
        }

        // Initialize vehicle and aircraft ownership
        if (data.vehicleOwners) {
          for (const [vId, oId] of Object.entries(data.vehicleOwners)) {
            if (oId) this.vehicleOwners.set(vId, String(oId));
          }
        }
        if (data.aircraftOwners) {
          for (const [aId, oId] of Object.entries(data.aircraftOwners)) {
            if (oId) this.aircraftOwners.set(aId, String(oId));
          }
        }
        if (data.toothlessOwner) {
          this.toothlessOwner = String(data.toothlessOwner);
        }

        this.emitState();
        this.onNotification?.('Session Joined', `Joined Room ${data.code}! Exploring together.`);

        // Safely spawn joining player near host if position provided
        if (data.hostPos && this.onSpawnJoiner) {
          this.onSpawnJoiner({
            x: data.hostPos.x + 3.0,
            y: data.hostPos.y + 0.5,
            z: data.hostPos.z + 3.0,
            yaw: data.hostPos.yaw,
          });
        }
        break;
      }

      case 'player_joined': {
        if (data.player) {
          this.addOrUpdateRemotePlayer(data.player);
          this.emitState();
          this.onNotification?.('Player Joined', `${data.player.name} entered the world!`);
        }
        break;
      }

      case 'player_left': {
        this.removeRemotePlayer(data.playerId);
        this.emitState();
        this.onNotification?.('Player Left', `${data.name || 'A player'} left the session.`);
        break;
      }

      case 'host_disconnected': {
        this.onNotification?.('Host Disconnected', 'The host ended the session. Returning to single-player.');
        this.leaveRoom();
        this.onHostDisconnected?.();
        break;
      }

      case 'error': {
        this.state.lastError = data.message;
        this.emitState();
        this.onNotification?.('Error', data.message);
        break;
      }

      case 'player_state': {
        const player = this.remotePlayers.get(data.playerId);
        if (player) {
          player.targetPosition.set(data.x, data.y, data.z);
          player.targetYaw = data.yaw;
          player.animState = data.animState || 'idle';
          player.isSprinting = !!data.isSprinting;
          player.isJumping = !!data.isJumping;
          player.inVehicle = !!data.inVehicle;
          player.vehicleId = data.vehicleId || null;
          player.inAircraft = !!data.inAircraft;
          player.aircraftId = data.aircraftId || null;
          player.onToothless = !!data.onToothless;
          player.toothlessMounting = !!data.toothlessMounting;
          player.hp = data.hp ?? 100;
          player.lastUpdate = Date.now();

          // If character model changed, update mesh
          if (data.characterId && data.characterId !== player.characterId) {
            player.characterId = data.characterId;
            this.rebuildRemotePlayerMesh(player);
          }
        }
        break;
      }

      case 'vehicle_owner_changed': {
        if (data.ownerId) {
          this.vehicleOwners.set(data.vehicleId, data.ownerId);
        } else {
          this.vehicleOwners.delete(data.vehicleId);
        }
        break;
      }

      case 'vehicle_state': {
        this.remoteVehicleStates.set(data.vehicleId, {
          x: data.x,
          y: data.y,
          z: data.z,
          yaw: data.yaw,
          pitch: data.pitch || 0,
          roll: data.roll || 0,
          speed: data.speed || 0,
          steer: data.steer || 0,
          wrecked: !!data.wrecked,
          damage: data.damage ?? 0,
          lastTime: Date.now(),
        });
        break;
      }

      case 'aircraft_owner_changed': {
        if (data.ownerId) {
          this.aircraftOwners.set(data.aircraftId, data.ownerId);
        } else {
          this.aircraftOwners.delete(data.aircraftId);
        }
        break;
      }

      case 'aircraft_state': {
        this.remoteAircraftStates.set(data.aircraftId, {
          x: data.x,
          y: data.y,
          z: data.z,
          yaw: data.yaw,
          pitch: data.pitch || 0,
          roll: data.roll || 0,
          speed: data.speed || 0,
          throttle: data.throttle || 0,
          crashed: !!data.crashed,
          damage: data.damage ?? 0,
          onGround: !!data.onGround,
          lastTime: Date.now(),
        });
        break;
      }

      case 'prop_knocked': {
        if (this.onPropKnocked) {
          this.onPropKnocked(
            data.propId,
            new THREE.Vector3(data.x, data.y, data.z),
            new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw),
            new THREE.Vector3(data.vx || 0, data.vy || 0, data.vz || 0)
          );
        }
        break;
      }

      case 'toothless_owner_changed': {
        this.toothlessOwner = data.ownerId || null;
        if (!data.ownerId) {
          this.remoteToothlessState = null;
        }
        break;
      }

      case 'toothless_claim_result': {
        if (!data.success) {
          this.toothlessOwner = data.ownerId || null;
          this.onNotification?.('Toothless Occupied', data.message || 'Toothless is currently being flown by another player.');
        } else {
          this.toothlessOwner = this.state.localPlayerId;
        }
        break;
      }

      case 'toothless_state': {
        this.remoteToothlessState = {
          playerId: data.playerId,
          x: data.x,
          y: data.y,
          z: data.z,
          yaw: data.yaw,
          pitch: data.pitch || 0,
          roll: data.roll || 0,
          speed: data.speed || 0,
          verticalSpeed: data.verticalSpeed || 0,
          wingFlap: data.wingFlap || 0,
          airborne: !!data.airborne,
          lastTime: Date.now(),
        };
        this.toothlessOwner = data.playerId;
        break;
      }
    }
  }

  private addOrUpdateRemotePlayer(data: any) {
    if (data.id === this.state.localPlayerId) return;

    let player = this.remotePlayers.get(data.id);
    if (!player) {
      player = {
        id: data.id,
        name: data.name || 'Player',
        characterId: data.characterId || 'pikachu',
        isHost: !!data.isHost,
        position: new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0),
        targetPosition: new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0),
        yaw: data.yaw || 0,
        targetYaw: data.yaw || 0,
        animState: data.animState || 'idle',
        isSprinting: !!data.isSprinting,
        isJumping: !!data.isJumping,
        inVehicle: !!data.inVehicle,
        vehicleId: data.vehicleId || null,
        inAircraft: !!data.inAircraft,
        aircraftId: data.aircraftId || null,
        onToothless: !!data.onToothless,
        toothlessMounting: !!data.toothlessMounting,
        hp: data.hp ?? 100,
        animTime: 0,
        lastUpdate: Date.now(),
        collisionRadius: 0.65,
      };

      this.buildRemotePlayerMesh(player);
      this.remotePlayers.set(data.id, player);
    } else {
      player.name = data.name || player.name;
      player.isHost = !!data.isHost;
      player.targetPosition.set(data.x || 0, data.y || 0, data.z || 0);
      player.targetYaw = data.yaw || 0;
      if (data.characterId && data.characterId !== player.characterId) {
        player.characterId = data.characterId;
        this.rebuildRemotePlayerMesh(player);
      }
    }
  }

  private buildRemotePlayerMesh(player: RemotePlayer) {
    if (!this.scene) return;

    try {
      const mesh = createPokemonModel(player.characterId);
      mesh.name = `remote_player_${player.id}`;
      mesh.position.copy(player.position);
      mesh.rotation.set(0, player.yaw, 0);

      // Add floating name tag
      const nameTag = createNameTagSprite(player.name, player.isHost);
      const tagHeight = player.characterId === 'charizard' ? 2.4 : 1.35;
      nameTag.position.set(0, tagHeight, 0);
      mesh.add(nameTag);

      this.scene.add(mesh);
      player.mesh = mesh;
      player.nameTag = nameTag;
    } catch (e) {
      console.warn('[Multiplayer] Failed to build remote player mesh:', e);
    }
  }

  private rebuildRemotePlayerMesh(player: RemotePlayer) {
    if (player.mesh && this.scene) {
      this.scene.remove(player.mesh);
    }
    this.buildRemotePlayerMesh(player);
  }

  private removeRemotePlayer(playerId: string) {
    const player = this.remotePlayers.get(playerId);
    if (player) {
      if (player.mesh && this.scene) {
        this.scene.remove(player.mesh);
      }
      this.remotePlayers.delete(playerId);
    }
  }

  private removeAllRemotePlayers() {
    for (const [id] of Array.from(this.remotePlayers.entries())) {
      this.removeRemotePlayer(id);
    }
  }

  // Check if a vehicle can be entered
  public canEnterVehicle(vehicleId: string): { allowed: boolean; reason?: string } {
    if (!this.state.isInRoom) return { allowed: true };

    const ownerId = this.vehicleOwners.get(vehicleId);
    if (!ownerId || ownerId === this.state.localPlayerId) {
      return { allowed: true };
    }

    const owner = this.remotePlayers.get(ownerId);
    return {
      allowed: false,
      reason: `Vehicle is occupied by ${owner?.name || 'another player'}.`,
    };
  }

  public claimVehicle(vehicleId: string) {
    if (!this.state.isInRoom || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'vehicle_claim', vehicleId }));
  }

  public releaseVehicle(vehicleId: string) {
    if (!this.state.isInRoom || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'vehicle_release', vehicleId }));
  }

  // Check if an aircraft can be boarded
  public canEnterAircraft(aircraftId: string): { allowed: boolean; reason?: string } {
    if (!this.state.isInRoom) return { allowed: true };

    const ownerId = this.aircraftOwners.get(aircraftId);
    if (!ownerId || ownerId === this.state.localPlayerId) {
      return { allowed: true };
    }

    const owner = this.remotePlayers.get(ownerId);
    return {
      allowed: false,
      reason: `Aircraft is piloted by ${owner?.name || 'another player'}.`,
    };
  }

  public claimAircraft(aircraftId: string) {
    if (!this.state.isInRoom || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'aircraft_claim', aircraftId }));
  }

  public releaseAircraft(aircraftId: string) {
    if (!this.state.isInRoom || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'aircraft_release', aircraftId }));
  }

  // Check if Toothless can be mounted
  public canMountToothless(): { allowed: boolean; reason?: string } {
    if (!this.state.isInRoom) return { allowed: true };
    if (!this.toothlessOwner || this.toothlessOwner === this.state.localPlayerId) {
      return { allowed: true };
    }
    const owner = this.remotePlayers.get(this.toothlessOwner);
    return {
      allowed: false,
      reason: `Toothless is currently being flown by ${owner?.name || 'another player'}.`,
    };
  }

  public claimToothless() {
    if (!this.state.isInRoom || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'toothless_claim' }));
  }

  public releaseToothless(landingPos?: THREE.Vector3) {
    if (!this.state.isInRoom || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'toothless_release',
        landingPos: landingPos ? { x: landingPos.x, y: landingPos.y, z: landingPos.z } : null,
      })
    );
    this.toothlessOwner = null;
    this.remoteToothlessState = null;
  }

  public notifyPropKnocked(
    propId: string,
    pos: THREE.Vector3,
    rot: THREE.Quaternion,
    vel?: THREE.Vector3
  ) {
    if (!this.state.isInRoom || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'prop_knocked',
        propId,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        qx: rot.x,
        qy: rot.y,
        qz: rot.z,
        qw: rot.w,
        vx: vel?.x,
        vy: vel?.y,
        vz: vel?.z,
      })
    );
  }

  /**
   * Main per-frame update loop called inside requestAnimationFrame
   */
  public update(
    dt: number,
    localState: LocalPlayerSyncData,
    camera: THREE.Camera,
    vehicles: Vehicle[],
    aircraft: AirportAircraft[],
    toothlessNpc?: any
  ) {
    if (!this.state.isInRoom) return;

    const now = performance.now();

    // 1. Broadcast local player state (20Hz when active, 2Hz when stationary)
    const distMoved = this.lastLocalPos.distanceTo(localState.position);
    const syncInterval = distMoved > 0.05 ? 50 : 500;

    if (now - this.lastLocalSyncTime >= syncInterval && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.lastLocalSyncTime = now;
      this.lastLocalPos.copy(localState.position);

      this.ws.send(
        JSON.stringify({
          type: 'player_state',
          x: Number(localState.position.x.toFixed(3)),
          y: Number(localState.position.y.toFixed(3)),
          z: Number(localState.position.z.toFixed(3)),
          yaw: Number(localState.yaw.toFixed(3)),
          animState: localState.animState,
          isSprinting: localState.isSprinting,
          isJumping: localState.isJumping,
          inVehicle: localState.inVehicle,
          vehicleId: localState.vehicleId,
          inAircraft: localState.inAircraft,
          aircraftId: localState.aircraftId,
          onToothless: localState.onToothless,
          toothlessMounting: localState.toothlessMounting,
          hp: localState.hp,
          characterId: localState.characterId,
          timestamp: Date.now(),
        })
      );

      // If local player is flying Toothless, broadcast Toothless state
      if ((localState.onToothless || localState.toothlessMounting) && localState.toothlessState) {
        const ts = localState.toothlessState;
        this.ws.send(
          JSON.stringify({
            type: 'toothless_state',
            x: Number(ts.x.toFixed(3)),
            y: Number(ts.y.toFixed(3)),
            z: Number(ts.z.toFixed(3)),
            yaw: Number(ts.yaw.toFixed(3)),
            pitch: Number((ts.pitch || 0).toFixed(3)),
            roll: Number((ts.roll || 0).toFixed(3)),
            speed: Number((ts.speed || 0).toFixed(2)),
            verticalSpeed: Number((ts.verticalSpeed || 0).toFixed(2)),
            wingFlap: Number((ts.wingFlap || 0).toFixed(3)),
            airborne: !!ts.airborne,
            timestamp: Date.now(),
          })
        );
      }

      // If local player is driving vehicle, broadcast vehicle transform
      if (localState.activeVehicle && localState.vehicleId) {
        const v = localState.activeVehicle;
        this.ws.send(
          JSON.stringify({
            type: 'vehicle_state',
            vehicleId: localState.vehicleId,
            x: Number(v.mesh.position.x.toFixed(3)),
            y: Number(v.mesh.position.y.toFixed(3)),
            z: Number(v.mesh.position.z.toFixed(3)),
            yaw: Number((v.yaw ?? v.mesh.rotation.y).toFixed(3)),
            pitch: Number(v.mesh.rotation.x.toFixed(3)),
            roll: Number(v.mesh.rotation.z.toFixed(3)),
            speed: Number((v.speed ?? 0).toFixed(2)),
            steer: Number((v.steerAngle ?? 0).toFixed(3)),
            wrecked: !!v.wrecked,
            damage: v.damage ?? 0,
            timestamp: Date.now(),
          })
        );
      }

      // If local player is flying aircraft, broadcast aircraft transform
      if (localState.activeAircraft && localState.aircraftId) {
        const p = localState.activeAircraft;
        this.ws.send(
          JSON.stringify({
            type: 'aircraft_state',
            aircraftId: localState.aircraftId,
            x: Number(p.position.x.toFixed(3)),
            y: Number(p.position.y.toFixed(3)),
            z: Number(p.position.z.toFixed(3)),
            yaw: Number(p.yaw.toFixed(3)),
            pitch: Number(p.pitch.toFixed(3)),
            roll: Number(p.roll.toFixed(3)),
            speed: Number(p.speed.toFixed(2)),
            throttle: Number(p.throttle.toFixed(2)),
            crashed: !!p.crashed,
            damage: p.damage ?? 0,
            onGround: !!p.onGround,
            timestamp: Date.now(),
          })
        );
      }
    }

    // 2. Interpolate & animate remote players with distance-based culling
    for (const player of this.remotePlayers.values()) {
      if (!player.mesh) continue;

      const distToCamera = camera.position.distanceTo(player.targetPosition);

      // Distance culling: hide mesh if > 180m away to preserve maximum FPS
      if (distToCamera > 180) {
        player.mesh.visible = false;
        continue;
      }

      player.mesh.visible = true;
      player.animTime += dt;

      // Smooth position & rotation interpolation
      const lerpSpeed = Math.min(1.0, dt * 14.0);
      player.position.lerp(player.targetPosition, lerpSpeed);
      player.yaw = lerpAngle(player.yaw, player.targetYaw, lerpSpeed);

      player.mesh.position.copy(player.position);
      player.mesh.rotation.set(0, player.yaw, 0);

      // If remote player is in a vehicle or plane, hide their standing mesh
      if (player.inVehicle || player.inAircraft) {
        player.mesh.visible = false;
      } else {
        // Animate limbs
        animatePokemonModel(player.mesh, player.characterId, player.animState, player.animTime);
      }

      // Soft player-to-player collision with local player (never traps in doorways)
      if (!localState.inVehicle && !localState.inAircraft && !player.inVehicle && !player.inAircraft) {
        const dx = localState.position.x - player.position.x;
        const dz = localState.position.z - player.position.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 1.0;
        if (distSq > 0.0001 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const push = Math.min(0.25, (minDist - dist) * 0.5);
          localState.position.x += (dx / dist) * push;
          localState.position.z += (dz / dist) * push;
        }
      }
    }

    // 3. Update remote-controlled vehicles
    for (const [vehicleId, state] of this.remoteVehicleStates.entries()) {
      // Find matching vehicle
      const v = vehicles.find((item) => item.id === vehicleId);
      if (v) {
        v.inUse = true;
        v.isOccupied = true;
        const lerpSpeed = Math.min(1.0, dt * 12.0);
        v.mesh.position.lerp(new THREE.Vector3(state.x, state.y, state.z), lerpSpeed);
        v.mesh.rotation.y = lerpAngle(v.mesh.rotation.y, state.yaw, lerpSpeed);
        v.mesh.rotation.x = THREE.MathUtils.lerp(v.mesh.rotation.x, state.pitch, lerpSpeed);
        v.mesh.rotation.z = THREE.MathUtils.lerp(v.mesh.rotation.z, state.roll, lerpSpeed);
        v.speed = state.speed;
        v.steerAngle = state.steer;
        v.wrecked = state.wrecked;
        v.damage = state.damage;
      }
    }

    // 4. Update remote-controlled aircraft
    for (const [aircraftId, state] of this.remoteAircraftStates.entries()) {
      const plane = aircraft.find((item) => item.id === aircraftId);
      if (plane) {
        plane.inUse = true;
        const lerpSpeed = Math.min(1.0, dt * 12.0);
        plane.position.lerp(new THREE.Vector3(state.x, state.y, state.z), lerpSpeed);
        plane.mesh.position.copy(plane.position);
        plane.yaw = lerpAngle(plane.yaw, state.yaw, lerpSpeed);
        plane.pitch = THREE.MathUtils.lerp(plane.pitch, state.pitch, lerpSpeed);
        plane.roll = THREE.MathUtils.lerp(plane.roll, state.roll, lerpSpeed);
        plane.mesh.rotation.set(plane.pitch, plane.yaw, plane.roll);
        plane.speed = state.speed;
        plane.throttle = state.throttle;
        plane.crashed = state.crashed;
        plane.damage = state.damage;
        plane.onGround = state.onGround;
      }
    }

    // 5. Update Toothless 3D position & remote rider attachment
    if (toothlessNpc && toothlessNpc.mesh) {
      if (this.toothlessOwner && this.toothlessOwner !== this.state.localPlayerId && this.remoteToothlessState) {
        const ts = this.remoteToothlessState;
        toothlessNpc.mesh.visible = true;
        toothlessNpc.mesh.userData.specialInteractionActive = true;
        toothlessNpc.mesh.userData.mounted = true;
        toothlessNpc.state = 'idle';

        const lerpSpeed = Math.min(1.0, dt * 14.0);
        toothlessNpc.mesh.position.lerp(new THREE.Vector3(ts.x, ts.y, ts.z), lerpSpeed);
        toothlessNpc.mesh.rotation.y = lerpAngle(toothlessNpc.mesh.rotation.y, ts.yaw, lerpSpeed);
        toothlessNpc.mesh.rotation.x = THREE.MathUtils.lerp(toothlessNpc.mesh.rotation.x, ts.pitch, lerpSpeed);
        toothlessNpc.mesh.rotation.z = THREE.MathUtils.lerp(toothlessNpc.mesh.rotation.z, ts.roll, lerpSpeed);

        const wingLeft = toothlessNpc.mesh.getObjectByName('wing_left');
        const wingRight = toothlessNpc.mesh.getObjectByName('wing_right');
        if (wingLeft && wingRight) {
          const flap = ts.wingFlap || Math.sin(performance.now() * 0.008 * 8.0);
          wingLeft.rotation.z = 1.25 + flap * 0.28;
          wingRight.rotation.z = -1.25 - flap * 0.28;
        }

        const rider = this.remotePlayers.get(this.toothlessOwner);
        if (rider && rider.mesh) {
          rider.mesh.visible = true;
          const saddleOffset = new THREE.Vector3(0, 1.38, -0.10).applyEuler(toothlessNpc.mesh.rotation);
          rider.mesh.position.copy(toothlessNpc.mesh.position).add(saddleOffset);
          rider.mesh.rotation.copy(toothlessNpc.mesh.rotation);
          rider.targetPosition.copy(rider.mesh.position);
          rider.targetYaw = toothlessNpc.mesh.rotation.y;
        }
      } else if (!this.toothlessOwner) {
        toothlessNpc.mesh.userData.specialInteractionActive = false;
        toothlessNpc.mesh.userData.mounted = false;
      }
    }
  }
}
