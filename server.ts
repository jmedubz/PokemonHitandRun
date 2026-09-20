import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

interface RemotePlayer {
  id: string;
  ws: WebSocket;
  name: string;
  characterId: string;
  isHost: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  animState: string;
  isSprinting: boolean;
  isJumping: boolean;
  inVehicle: boolean;
  vehicleId: string | null;
  inAircraft: boolean;
  aircraftId: string | null;
  onToothless: boolean;
  toothlessMounting: boolean;
  hp: number;
  lastPing: number;
}

interface KnockedProp {
  id: string;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

interface Room {
  code: string;
  hostId: string;
  createdAt: number;
  players: Map<string, RemotePlayer>;
  vehicleOwners: Map<string, string>; // vehicleId -> playerId
  aircraftOwners: Map<string, string>; // aircraftId -> playerId
  toothlessOwner: string | null; // playerId
  toothlessState: any | null;
  knockedProps: Map<string, KnockedProp>;
}

const rooms = new Map<string, Room>();
const clientToRoom = new Map<WebSocket, { roomId: string; playerId: string }>();

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateRoomCode(): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return `R${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function safeSend(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Ignore broken socket send
    }
  }
}

function broadcastToRoom(room: Room, data: any, excludePlayerId?: string) {
  const payload = JSON.stringify(data);
  for (const [id, player] of room.players) {
    if (excludePlayerId && id === excludePlayerId) continue;
    if (player.ws.readyState === WebSocket.OPEN) {
      try {
        player.ws.send(payload);
      } catch {
        // Ignore send errors
      }
    }
  }
}

function distance3D(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dz = z1 - z2;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      multiplayer: true,
      activeRooms: rooms.size,
      uptime: process.uptime(),
    });
  });

  const wss = new WebSocketServer({ noServer: true });

  // Heartbeat keepalive every 12 seconds to prevent proxies / iOS Safari from dropping idle sockets
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((wsClient: any) => {
      if (wsClient.isAlive === false) {
        try { wsClient.terminate(); } catch {}
        return;
      }
      wsClient.isAlive = false;
      try {
        wsClient.ping();
        safeSend(wsClient, { type: 'heartbeat', timestamp: Date.now() });
      } catch {}
    });
  }, 12000);

  server.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || '127.0.0.1:3000';
      const url = new URL(request.url || '', `http://${host}`);
      const pathname = url.pathname.replace(/\/+$/, '') || '/';

      if (pathname === '/ws' || pathname.startsWith('/ws')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          (ws as any).isAlive = true;
          wss.emit('connection', ws, request);
        });
      }
    } catch (err) {
      console.warn('[Server] WebSocket upgrade error:', err);
      try { socket.destroy(); } catch {}
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    (ws as any).isAlive = true;
    const playerId = `p_${Math.random().toString(36).slice(2, 9)}`;

    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    const cleanupClient = () => {
      const mapping = clientToRoom.get(ws);
      if (!mapping) return;
      clientToRoom.delete(ws);

      const room = rooms.get(mapping.roomId);
      if (!room) return;

      const player = room.players.get(mapping.playerId);
      const wasHost = player?.isHost ?? false;
      const playerName = player?.name ?? 'Player';

      // Release any vehicles, aircraft, or Toothless dragon owned by this player
      for (const [vId, ownerId] of Array.from(room.vehicleOwners.entries())) {
        if (ownerId === mapping.playerId) {
          room.vehicleOwners.delete(vId);
          broadcastToRoom(room, { type: 'vehicle_owner_changed', vehicleId: vId, ownerId: null });
        }
      }
      for (const [aId, ownerId] of Array.from(room.aircraftOwners.entries())) {
        if (ownerId === mapping.playerId) {
          room.aircraftOwners.delete(aId);
          broadcastToRoom(room, { type: 'aircraft_owner_changed', aircraftId: aId, ownerId: null });
        }
      }
      if (room.toothlessOwner === mapping.playerId) {
        room.toothlessOwner = null;
        room.toothlessState = null;
        broadcastToRoom(room, { type: 'toothless_owner_changed', ownerId: null });
      }

      room.players.delete(mapping.playerId);

      if (wasHost) {
        // Host disconnected: inform all guests and close room
        broadcastToRoom(room, {
          type: 'host_disconnected',
          message: 'The host has disconnected. Returning to single-player.',
        });
        rooms.delete(mapping.roomId);
      } else {
        // Guest disconnected
        broadcastToRoom(room, {
          type: 'player_left',
          playerId: mapping.playerId,
          name: playerName,
          remainingCount: room.players.size,
        });

        if (room.players.size === 0) {
          rooms.delete(mapping.roomId);
        }
      }
    };

    ws.on('close', cleanupClient);
    ws.on('error', cleanupClient);

    ws.on('message', (raw: string) => {
      (ws as any).isAlive = true;
      let data: any;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (data.type === 'ping' || data.type === 'pong') {
        safeSend(ws, { type: 'pong', time: data.time || Date.now() });
        return;
      }

      if (data.type === 'create_room') {
        cleanupClient();

        const code = generateRoomCode();
        const playerName = (data.playerName || 'Host').trim().slice(0, 18);
        const characterId = data.characterId || 'pikachu';

        const newPlayer: RemotePlayer = {
          id: playerId,
          ws,
          name: playerName,
          characterId,
          isHost: true,
          x: Number(data.initialPos?.x) || 0,
          y: Number(data.initialPos?.y) || 0,
          z: Number(data.initialPos?.z) || 0,
          yaw: Number(data.initialPos?.yaw) || 0,
          animState: 'idle',
          isSprinting: false,
          isJumping: false,
          inVehicle: false,
          vehicleId: null,
          inAircraft: false,
          aircraftId: null,
          onToothless: false,
          toothlessMounting: false,
          hp: 100,
          lastPing: Date.now(),
        };

        const room: Room = {
          code,
          hostId: playerId,
          createdAt: Date.now(),
          players: new Map([[playerId, newPlayer]]),
          vehicleOwners: new Map(),
          aircraftOwners: new Map(),
          toothlessOwner: null,
          toothlessState: null,
          knockedProps: new Map(),
        };

        rooms.set(code, room);
        clientToRoom.set(ws, { roomId: code, playerId });

        safeSend(ws, {
          type: 'room_created',
          code,
          playerId,
          isHost: true,
          name: playerName,
        });
        return;
      }

      if (data.type === 'join_room') {
        cleanupClient();

        const code = (data.code || '').trim().toUpperCase();
        const room = rooms.get(code);

        if (!room) {
          safeSend(ws, {
            type: 'error',
            message: `Room "${code}" not found. Please verify the room code.`,
          });
          return;
        }

        const playerName = (data.playerName || 'Player').trim().slice(0, 18);
        const characterId = data.characterId || 'pikachu';

        const hostPlayer = room.players.get(room.hostId);

        const newPlayer: RemotePlayer = {
          id: playerId,
          ws,
          name: playerName,
          characterId,
          isHost: false,
          x: hostPlayer ? hostPlayer.x + 3.0 : 0,
          y: hostPlayer ? hostPlayer.y : 0.5,
          z: hostPlayer ? hostPlayer.z + 3.0 : 0,
          yaw: hostPlayer ? hostPlayer.yaw : 0,
          animState: 'idle',
          isSprinting: false,
          isJumping: false,
          inVehicle: false,
          vehicleId: null,
          inAircraft: false,
          aircraftId: null,
          onToothless: false,
          toothlessMounting: false,
          hp: 100,
          lastPing: Date.now(),
        };

        const existingPlayers = Array.from(room.players.values()).map((p) => ({
          id: p.id,
          name: p.name,
          characterId: p.characterId,
          isHost: p.isHost,
          x: p.x,
          y: p.y,
          z: p.z,
          yaw: p.yaw,
          animState: p.animState,
          isSprinting: p.isSprinting,
          isJumping: p.isJumping,
          inVehicle: p.inVehicle,
          vehicleId: p.vehicleId,
          inAircraft: p.inAircraft,
          aircraftId: p.aircraftId,
          onToothless: p.onToothless,
          toothlessMounting: p.toothlessMounting,
          hp: p.hp,
        }));

        room.players.set(playerId, newPlayer);
        clientToRoom.set(ws, { roomId: code, playerId });

        // Acknowledge join to joining client
        safeSend(ws, {
          type: 'room_joined',
          code,
          playerId,
          isHost: false,
          name: playerName,
          hostPos: hostPlayer ? { x: hostPlayer.x, y: hostPlayer.y, z: hostPlayer.z, yaw: hostPlayer.yaw } : null,
          players: existingPlayers,
          vehicleOwners: Object.fromEntries(room.vehicleOwners),
          aircraftOwners: Object.fromEntries(room.aircraftOwners),
          toothlessOwner: room.toothlessOwner,
          toothlessState: room.toothlessState,
          knockedProps: Array.from(room.knockedProps.values()),
        });

        // Notify existing players
        broadcastToRoom(
          room,
          {
            type: 'player_joined',
            player: {
              id: playerId,
              name: playerName,
              characterId,
              isHost: false,
              x: newPlayer.x,
              y: newPlayer.y,
              z: newPlayer.z,
              yaw: newPlayer.yaw,
            },
          },
          playerId
        );
        return;
      }

      if (data.type === 'leave_room') {
        cleanupClient();
        safeSend(ws, { type: 'left_room' });
        return;
      }

      // Room-based state messages
      const mapping = clientToRoom.get(ws);
      if (!mapping) return;
      const room = rooms.get(mapping.roomId);
      if (!room) return;

      if (data.type === 'player_state') {
        const player = room.players.get(mapping.playerId);
        if (player) {
          player.x = Number(data.x) || player.x;
          player.y = Number(data.y) || player.y;
          player.z = Number(data.z) || player.z;
          player.yaw = Number(data.yaw) || player.yaw;
          player.animState = data.animState || player.animState;
          player.isSprinting = !!data.isSprinting;
          player.isJumping = !!data.isJumping;
          player.inVehicle = !!data.inVehicle;
          player.vehicleId = data.vehicleId || null;
          player.inAircraft = !!data.inAircraft;
          player.aircraftId = data.aircraftId || null;
          player.onToothless = !!data.onToothless;
          player.toothlessMounting = !!data.toothlessMounting;
          player.hp = typeof data.hp === 'number' ? data.hp : player.hp;
          player.characterId = data.characterId || player.characterId;

          const broadcastData = {
            type: 'player_state',
            playerId: mapping.playerId,
            x: player.x,
            y: player.y,
            z: player.z,
            yaw: player.yaw,
            animState: player.animState,
            isSprinting: player.isSprinting,
            isJumping: player.isJumping,
            inVehicle: player.inVehicle,
            vehicleId: player.vehicleId,
            inAircraft: player.inAircraft,
            aircraftId: player.aircraftId,
            onToothless: player.onToothless,
            toothlessMounting: player.toothlessMounting,
            toothlessState: data.toothlessState || null,
            hp: player.hp,
            characterId: player.characterId,
            name: player.name,
            timestamp: data.timestamp || Date.now(),
          };

          if (data.toothlessState) {
            room.toothlessState = data.toothlessState;
            room.toothlessOwner = mapping.playerId;
          }

          const payload = JSON.stringify(broadcastData);
          for (const [targetId, targetPlayer] of room.players) {
            if (targetId === mapping.playerId) continue;
            if (targetPlayer.ws.readyState !== WebSocket.OPEN) continue;

            // Distance-based network throttling (do not throttle if flying or in vehicle)
            const dist = distance3D(player.x, player.y, player.z, targetPlayer.x, targetPlayer.y, targetPlayer.z);
            if (dist > 350 && !player.onToothless && !player.inAircraft) {
              if (Math.random() > 0.35) continue;
            }
            try {
              targetPlayer.ws.send(payload);
            } catch {
              // Ignore send error
            }
          }
        }
        return;
      }

      if (data.type === 'toothless_claim') {
        if (room.toothlessOwner && room.toothlessOwner !== mapping.playerId) {
          safeSend(ws, {
            type: 'toothless_claim_result',
            success: false,
            ownerId: room.toothlessOwner,
            message: 'Toothless is currently being flown by another player.',
          });
        } else {
          room.toothlessOwner = mapping.playerId;
          safeSend(ws, {
            type: 'toothless_claim_result',
            success: true,
            ownerId: mapping.playerId,
          });
          broadcastToRoom(room, {
            type: 'toothless_owner_changed',
            ownerId: mapping.playerId,
          });
        }
        return;
      }

      if (data.type === 'toothless_release') {
        if (room.toothlessOwner === mapping.playerId) {
          room.toothlessOwner = null;
          room.toothlessState = null;
          broadcastToRoom(room, {
            type: 'toothless_owner_changed',
            ownerId: null,
            landingPos: data.landingPos || null,
          });
        }
        return;
      }

      if (data.type === 'toothless_state') {
        if (!room.toothlessOwner || room.toothlessOwner === mapping.playerId) {
          room.toothlessOwner = mapping.playerId;
          room.toothlessState = data;
          broadcastToRoom(
            room,
            {
              type: 'toothless_state',
              playerId: mapping.playerId,
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
              timestamp: data.timestamp || Date.now(),
            },
            mapping.playerId
          );
        }
        return;
      }

      if (data.type === 'vehicle_claim') {
        const vId = String(data.vehicleId);
        const currentOwner = room.vehicleOwners.get(vId);

        if (currentOwner && currentOwner !== mapping.playerId) {
          safeSend(ws, {
            type: 'vehicle_claim_result',
            vehicleId: vId,
            success: false,
            ownerId: currentOwner,
            message: 'Vehicle is currently occupied by another player.',
          });
        } else {
          room.vehicleOwners.set(vId, mapping.playerId);
          safeSend(ws, {
            type: 'vehicle_claim_result',
            vehicleId: vId,
            success: true,
            ownerId: mapping.playerId,
          });
          broadcastToRoom(room, {
            type: 'vehicle_owner_changed',
            vehicleId: vId,
            ownerId: mapping.playerId,
          });
        }
        return;
      }

      if (data.type === 'vehicle_release') {
        const vId = String(data.vehicleId);
        if (room.vehicleOwners.get(vId) === mapping.playerId) {
          room.vehicleOwners.delete(vId);
          broadcastToRoom(room, {
            type: 'vehicle_owner_changed',
            vehicleId: vId,
            ownerId: null,
          });
        }
        return;
      }

      if (data.type === 'vehicle_state') {
        const vId = String(data.vehicleId);
        // Only broadcast if the sender is the registered owner (or no owner yet)
        const owner = room.vehicleOwners.get(vId);
        if (!owner || owner === mapping.playerId) {
          if (!owner) room.vehicleOwners.set(vId, mapping.playerId);
          broadcastToRoom(
            room,
            {
              type: 'vehicle_state',
              vehicleId: vId,
              playerId: mapping.playerId,
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
              timestamp: data.timestamp || Date.now(),
            },
            mapping.playerId
          );
        }
        return;
      }

      if (data.type === 'aircraft_claim') {
        const aId = String(data.aircraftId);
        const currentOwner = room.aircraftOwners.get(aId);

        if (currentOwner && currentOwner !== mapping.playerId) {
          safeSend(ws, {
            type: 'aircraft_claim_result',
            aircraftId: aId,
            success: false,
            ownerId: currentOwner,
            message: 'Aircraft is currently flown by another player.',
          });
        } else {
          room.aircraftOwners.set(aId, mapping.playerId);
          safeSend(ws, {
            type: 'aircraft_claim_result',
            aircraftId: aId,
            success: true,
            ownerId: mapping.playerId,
          });
          broadcastToRoom(room, {
            type: 'aircraft_owner_changed',
            aircraftId: aId,
            ownerId: mapping.playerId,
          });
        }
        return;
      }

      if (data.type === 'aircraft_release') {
        const aId = String(data.aircraftId);
        if (room.aircraftOwners.get(aId) === mapping.playerId) {
          room.aircraftOwners.delete(aId);
          broadcastToRoom(room, {
            type: 'aircraft_owner_changed',
            aircraftId: aId,
            ownerId: null,
          });
        }
        return;
      }

      if (data.type === 'aircraft_state') {
        const aId = String(data.aircraftId);
        const owner = room.aircraftOwners.get(aId);
        if (!owner || owner === mapping.playerId) {
          if (!owner) room.aircraftOwners.set(aId, mapping.playerId);
          broadcastToRoom(
            room,
            {
              type: 'aircraft_state',
              aircraftId: aId,
              playerId: mapping.playerId,
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
              timestamp: data.timestamp || Date.now(),
            },
            mapping.playerId
          );
        }
        return;
      }

      if (data.type === 'prop_knocked') {
        const pId = String(data.propId);
        const propData: KnockedProp = {
          id: pId,
          x: Number(data.x) || 0,
          y: Number(data.y) || 0,
          z: Number(data.z) || 0,
          qx: Number(data.qx) || 0,
          qy: Number(data.qy) || 0,
          qz: Number(data.qz) || 0,
          qw: Number(data.qw) ?? 1,
        };
        room.knockedProps.set(pId, propData);
        broadcastToRoom(
          room,
          {
            type: 'prop_knocked',
            propId: pId,
            ...propData,
            vx: data.vx,
            vy: data.vy,
            vz: data.vz,
          },
          mapping.playerId
        );
        return;
      }

      if (data.type === 'host_sync_world') {
        // Only host replicates world state
        if (room.hostId === mapping.playerId) {
          broadcastToRoom(
            room,
            {
              type: 'host_sync_world',
              traffic: data.traffic || [],
              timestamp: Date.now(),
            },
            mapping.playerId
          );
        }
        return;
      }

      if (data.type === 'player_action') {
        broadcastToRoom(
          room,
          {
            type: 'player_action',
            playerId: mapping.playerId,
            action: data.action, // 'attack' | 'special' | 'water_gun' | 'sound'
            position: data.position,
            timestamp: Date.now(),
          },
          mapping.playerId
        );
        return;
      }
    });
  });

  // Serve static imported game assets (e.g. Redline Rush) directly before SPA fallback.
  // This guarantees that files like game.js and sedan-model-XX.js are served with proper
  // JavaScript MIME types rather than falling through to index.html SPA rewriting.
  const publicImportedGames = path.resolve(process.cwd(), 'public', 'importedGames');
  const distImportedGames = path.resolve(process.cwd(), 'dist', 'importedGames');
  const importedGamesPath = fs.existsSync(publicImportedGames) ? publicImportedGames : distImportedGames;

  const serveStaticImportedGames = express.static(importedGamesPath, {
    index: ['index.html'],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
    },
  });

  app.use('/importedGames', serveStaticImportedGames);
  app.use('/public/importedGames', serveStaticImportedGames);

  // Missing imported game assets must return a 404, never the Pokémon SPA index.html
  app.use(['/importedGames', '/public/importedGames'], (_req, res) => {
    res.status(404).type('text/plain').send('Not Found');
  });

  // Vite middleware for development vs static files for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Game & Multiplayer WebSocket server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Failed to start server:', err);
  process.exit(1);
});
