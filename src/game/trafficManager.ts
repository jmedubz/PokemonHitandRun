import * as THREE from 'three';
import { CollisionSystem } from './doors';
import { NPC, Vehicle } from '../types';
import {
  createSedanTraffic,
  createSuvTraffic,
  createSportsCarTraffic,
  createConvertibleTraffic,
  createCityBusTraffic,
  createTrafficDriverAvatar,
  createLightningMcQueenModel,
  createSimpsonsFamilySedan,
  createSpeedRocket,
  createCanyonero,
  createMrPlow,
  createCarBuiltForHomer,
  createPeppaFamilyCar,
} from './models';
import { disposeTransientObject3D } from './dispose';

type TrafficRoute = {
  id: string;
  points: THREE.Vector3[];
  speed: number;
  bus?: boolean;
};

type DriverState = 'seated' | 'outside' | 'boarding';

type TrafficControlZone = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  kind: 'intersection' | 'roundabout' | 'crossing';
};

type TrafficRuntime = {
  vehicle: Vehicle;
  route: TrafficRoute;
  routeIndex: number;
  cruiseSpeed: number;
  disabledUntil: number;
  hijacked: boolean;
  accidentTimer: number;
  recoveryTimer: number;
  stuckTimer: number;
  /** Short bounded reverse used only to clear a physical blockage; never changes route direction. */
  reverseRecoveryTimer: number;
  /** Progress is sampled over a window so a normal queue/brief slowdown is never mistaken for being stuck. */
  stuckSampleTimer: number;
  stuckSamplePosition: THREE.Vector3;
  /** Once a car enters a junction/roundabout it is committed to the existing authored route until clear. */
  committedZoneId: string | null;
  committedSince: number;
  /** Temporary safe pass around a genuinely stopped/unoccupied car on a straight section. */
  overtakeTargetId: string | null;
  overtakeTimer: number;
  overtakeOffset: number;
  lastPosition: THREE.Vector3;
  driverVisual: THREE.Group | null;
  outsideDriver: THREE.Group | null;
  driverState: DriverState;
  driverTimer: number;
  nextDriverEvent: number;
  driverVariant: number;
  groundY: number;
  verticalVelocity: number;
  specialHybrid: boolean;
  greetingCooldown: number;
  /** Accumulates cheap far-traffic simulation so distant cars update at ~5 Hz. */
  lodAccumulator?: number;
};

/**
 * Arcade traffic inspired by a busy cartoon city rather than a rigid simulation.
 * Cars stay on authored lane-centre routes, yield to people, queue behind traffic,
 * respect building collision and recover if an obstacle leaves them stuck.
 */
export class TrafficManager {
  public vehicles: Vehicle[] = [];
  private runtimes: TrafficRuntime[] = [];
  private scene: THREE.Scene;
  private collision: CollisionSystem;
  private tempNext = new THREE.Vector3();
  private tempRoute = new THREE.Vector3();
  private pursuitRoadRoutes: TrafficRoute[] = [];
  private pendingHybridGreeting: { name: string; text: string } | null = null;
  /** Live world-derived no-spawn / intersection-control areas. Rebuilt from the same
   * authored geometry that the player sees, so traffic rules stay aligned after map edits. */
  private trafficControlZones: TrafficControlZone[] = [];
  /** Per-update short-range junction claim so two approaches cannot both decide an
   * empty intersection is theirs on the same frame. Cleared every simulation tick. */
  private intersectionReservations = new Map<string, string>();
  /** Per-tick broad phase for nearby traffic/pedestrian queries. Following/yielding
   * used to scan the complete car roster and complete NPC roster for every car. */
  private readonly trafficSpatialCellSize = 28;
  private trafficSpatialGrid = new Map<number, TrafficRuntime[]>();
  private pedestrianSpatialGrid = new Map<number, NPC[]>();
  /** Traffic-control zones used to be linearly scanned several times per car. Keep
   * them in a coarse grid too so junction/crossing tests only inspect local boxes. */
  private readonly trafficZoneCellSize = 72;
  private trafficControlZoneGrid = new Map<number, TrafficControlZone[]>();
  private trafficControlZoneById = new Map<string, TrafficControlZone>();
  /** Optional runtime navigation mask supplied by App. Only ROAD traffic uses it;
   * boats are simulated elsewhere and are deliberately unaffected. */
  private roadVehicleForbidden: ((point: THREE.Vector3) => boolean) | null = null;

  private trafficSpatialKey(ix: number, iz: number) {
    return ix * 8192 + iz;
  }

  private trafficSpatialCoord(value: number) {
    return Math.floor(value / this.trafficSpatialCellSize);
  }

  private rebuildTrafficSpatialIndex(pedestrians?: NPC[]) {
    this.trafficSpatialGrid.clear();
    this.pedestrianSpatialGrid.clear();
    for (const rt of this.runtimes) {
      const p = rt.vehicle.mesh.position;
      const key = this.trafficSpatialKey(this.trafficSpatialCoord(p.x), this.trafficSpatialCoord(p.z));
      const cell = this.trafficSpatialGrid.get(key);
      if (cell) cell.push(rt);
      else this.trafficSpatialGrid.set(key, [rt]);
    }
    if (!pedestrians) return;
    for (const npc of pedestrians) {
      if (!npc.mesh.visible || npc.mesh.userData.stationary || npc.movementMode === 'flying' || npc.movementMode === 'swimming') continue;
      const p = npc.mesh.position;
      const key = this.trafficSpatialKey(this.trafficSpatialCoord(p.x), this.trafficSpatialCoord(p.z));
      const cell = this.pedestrianSpatialGrid.get(key);
      if (cell) cell.push(npc);
      else this.pedestrianSpatialGrid.set(key, [npc]);
    }
  }

  private forEachNearbyTraffic(position: THREE.Vector3, radius: number, visitor: (rt: TrafficRuntime) => boolean | void) {
    const minX = this.trafficSpatialCoord(position.x - radius);
    const maxX = this.trafficSpatialCoord(position.x + radius);
    const minZ = this.trafficSpatialCoord(position.z - radius);
    const maxZ = this.trafficSpatialCoord(position.z + radius);
    const radiusSq = radius * radius;
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const cell = this.trafficSpatialGrid.get(this.trafficSpatialKey(ix, iz));
        if (!cell) continue;
        for (const rt of cell) {
          const dx = rt.vehicle.mesh.position.x - position.x;
          const dz = rt.vehicle.mesh.position.z - position.z;
          if (dx * dx + dz * dz > radiusSq) continue;
          if (visitor(rt) === false) return;
        }
      }
    }
  }

  private forEachNearbyPedestrian(position: THREE.Vector3, radius: number, visitor: (npc: NPC) => boolean | void) {
    const minX = this.trafficSpatialCoord(position.x - radius);
    const maxX = this.trafficSpatialCoord(position.x + radius);
    const minZ = this.trafficSpatialCoord(position.z - radius);
    const maxZ = this.trafficSpatialCoord(position.z + radius);
    const radiusSq = radius * radius;
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const cell = this.pedestrianSpatialGrid.get(this.trafficSpatialKey(ix, iz));
        if (!cell) continue;
        for (const npc of cell) {
          const dx = npc.mesh.position.x - position.x;
          const dz = npc.mesh.position.z - position.z;
          if (dx * dx + dz * dz > radiusSq) continue;
          if (visitor(npc) === false) return;
        }
      }
    }
  }

  private trafficZoneSpatialCoord(value: number) {
    return Math.floor(value / this.trafficZoneCellSize);
  }

  private rebuildTrafficControlZoneSpatialIndex() {
    this.trafficControlZoneGrid.clear();
    this.trafficControlZoneById.clear();
    for (const zone of this.trafficControlZones) {
      this.trafficControlZoneById.set(zone.id, zone);
      const minX = this.trafficZoneSpatialCoord(zone.minX);
      const maxX = this.trafficZoneSpatialCoord(zone.maxX);
      const minZ = this.trafficZoneSpatialCoord(zone.minZ);
      const maxZ = this.trafficZoneSpatialCoord(zone.maxZ);
      for (let ix = minX; ix <= maxX; ix++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const key = this.trafficSpatialKey(ix, iz);
          const cell = this.trafficControlZoneGrid.get(key);
          if (cell) cell.push(zone);
          else this.trafficControlZoneGrid.set(key, [zone]);
        }
      }
    }
  }

  private forEachNearbyTrafficControlZone(
    position: THREE.Vector3,
    radius: number,
    visitor: (zone: TrafficControlZone) => boolean | void,
  ) {
    const minX = this.trafficZoneSpatialCoord(position.x - radius);
    const maxX = this.trafficZoneSpatialCoord(position.x + radius);
    const minZ = this.trafficZoneSpatialCoord(position.z - radius);
    const maxZ = this.trafficZoneSpatialCoord(position.z + radius);
    const seen = new Set<TrafficControlZone>();
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const cell = this.trafficControlZoneGrid.get(this.trafficSpatialKey(ix, iz));
        if (!cell) continue;
        for (const zone of cell) {
          if (seen.has(zone)) continue;
          seen.add(zone);
          if (visitor(zone) === false) return;
        }
      }
    }
  }

  constructor(
    scene: THREE.Scene,
    collision: CollisionSystem,
    roadVehicleForbidden?: (point: THREE.Vector3) => boolean,
  ) {
    this.scene = scene;
    this.collision = collision;
    // Install the navigation mask BEFORE traffic is spawned. Previously App only
    // supplied the water predicate during update(), which meant initial spawn
    // validation could still accept an authored point over open water.
    this.roadVehicleForbidden = roadVehicleForbidden ?? null;
    this.rebuildTrafficControlZones();
    this.spawnDefaultTraffic();
  }

  public setRoadVehicleForbiddenPredicate(predicate: ((point: THREE.Vector3) => boolean) | null) {
    this.roadVehicleForbidden = predicate;
  }

  /**
   * AUSTRALIAN TRAFFIC RULE: every MOVING authored route is normalised onto the
   * left-hand lane of the existing road it already follows. This deliberately does
   * not move roads/buildings/collision and does not touch zero-speed parked routes.
   *
   * World convention in this map: negative Z is north, positive Z is south.
   * Therefore:
   *   eastbound  (+X) -> north/negative-Z lane
   *   westbound  (-X) -> south/positive-Z lane
   *   southbound (+Z) -> east/positive-X lane
   *   northbound (-Z) -> west/negative-X lane
   */
  private route(id: string, speed: number, points: [number, number][], bus = false): TrafficRoute {
    const vectors = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
    if (speed > 0.01) this.applyAustralianLeftHandLanes(vectors);
    return { id, speed, points: vectors, bus };
  }

  private applyAustralianLeftHandLanes(points: THREE.Vector3[]): void {
    if (points.length < 2) return;

    type VerticalRoad = { x: number; minZ: number; maxZ: number; lane: number };
    type HorizontalRoad = { z: number; minX: number; maxX: number; lane: number };

    // These are the existing physical road centrelines. Only navigation lanes move.
    const verticalRoads: VerticalRoad[] = [
      // Springfield
      { x: -310, minZ: -112, maxZ: 62, lane: 4 },
      { x: -185, minZ: -172, maxZ: -30, lane: 4 },
      // X=-145 remains local. X=-110 is continuous again via the user's small
      // compact-to-Evergreen connector, so lane normalisation can treat it as one
      // coherent Australian left-hand road from the north perimeter to the south.
      { x: -145, minZ: 67, maxZ: 152, lane: 4 },
      { x: -110, minZ: -172, maxZ: 152, lane: 4 },
      // Arcade Boulevard & Causeway (X = 8, connecting Northern Viaduct at Z = -168 to Forecourt at Z = -273)
      { x: 8, minZ: -273, maxZ: -168, lane: 3.5 },
      // Goldenrod
      { x: 110, minZ: -172, maxZ: 152, lane: 4 },
      { x: 200, minZ: -172, maxZ: 152, lane: 4 },
      { x: 310, minZ: -152, maxZ: 152, lane: 4 },
    ];
    const horizontalRoads: HorizontalRoad[] = [
      // Shared outer roads / Springfield
      { z: -170, minX: -312, maxX: 312, lane: 4 },
      { z: -110, minX: -312, maxX: -108, lane: 4 },
      { z: -60, minX: -312, maxX: -108, lane: 4 },
      // The west bridge approach is now a curve and is authored directly at lane
      // position in the traffic routes below. The horizontal central bridge itself
      // uses the standard left-hand lane offset from the compact T eastward.
      { z: 0, minX: -124, maxX: 90, lane: 4.2 },
      // Evergreen now reaches the far/east edge of the X=-110 road (X=-103),
      // completing the T-junction rather than ending at its centreline.
      { z: 60, minX: -312, maxX: -102, lane: 4 },
      { z: 150, minX: -312, maxX: 312, lane: 4 },
      // Goldenrod cross streets
      { z: -150, minX: 108, maxX: 312, lane: 4 },
      { z: -90, minX: 108, maxX: 312, lane: 4 },
      { z: 0, minX: 108, maxX: 312, lane: 4 },
      { z: 90, minX: 108, maxX: 312, lane: 4 },
      // Arcade Extended Connectors (Z = -273, from West Airport connector X = -168 to East Airport connector X = 278)
      { z: -273, minX: -168, maxX: 278, lane: 3.5 },
    ];

    const laneTolerance = 5.4;
    const rangePad = 8;
    const original = points.map((p) => p.clone());
    const closed = original.length > 2 && original[0].distanceToSquared(original[original.length - 1]) < 0.01;
    const segmentCount = closed ? original.length - 1 : original.length;
    const rebuilt: THREE.Vector3[] = [];

    const pushDistinct = (point: THREE.Vector3) => {
      const last = rebuilt[rebuilt.length - 1];
      if (!last || last.distanceToSquared(point) > 0.0025) rebuilt.push(point.clone());
    };

    for (let i = 0; i < segmentCount; i++) {
      const a = original[i];
      const b = original[(i + 1) % segmentCount];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      if (dx * dx + dz * dz < 0.01) continue;

      const shiftedA = a.clone();
      const shiftedB = b.clone();
      const midX = (a.x + b.x) * 0.5;
      const midZ = (a.z + b.z) * 0.5;

      // Keep the deliberately curved roundabout connector segments curved. Their
      // circulation direction is fixed in the dedicated pass below.
      const midRoundaboutDistance = Math.hypot(midX + 210, midZ + 20);
      const isRoundaboutCurve = midRoundaboutDistance > 17 && midRoundaboutDistance < 38 && Math.abs(dx) > 0.2 && Math.abs(dz) > 0.2;

      if (!isRoundaboutCurve && Math.abs(dz) >= Math.abs(dx) * 1.8) {
        let best: VerticalRoad | null = null;
        let bestDistance = Infinity;
        for (const road of verticalRoads) {
          if (midZ < road.minZ - rangePad || midZ > road.maxZ + rangePad) continue;
          const distance = Math.abs(midX - road.x);
          if (distance <= laneTolerance && distance < bestDistance) { best = road; bestDistance = distance; }
        }
        if (best) {
          // +Z is southbound -> Australian left lane is east (+X).
          // -Z is northbound -> Australian left lane is west (-X).
          const laneX = best.x + (dz > 0 ? best.lane : -best.lane);
          shiftedA.x = laneX;
          shiftedB.x = laneX;
        }
      } else if (!isRoundaboutCurve && Math.abs(dx) >= Math.abs(dz) * 1.8) {
        let best: HorizontalRoad | null = null;
        let bestDistance = Infinity;
        for (const road of horizontalRoads) {
          if (midX < road.minX - rangePad || midX > road.maxX + rangePad) continue;
          const distance = Math.abs(midZ - road.z);
          if (distance <= laneTolerance && distance < bestDistance) { best = road; bestDistance = distance; }
        }
        if (best) {
          // +X is eastbound -> Australian left lane is north (-Z).
          // -X is westbound -> Australian left lane is south (+Z).
          const laneZ = best.z + (dx > 0 ? -best.lane : best.lane);
          shiftedA.z = laneZ;
          shiftedB.z = laneZ;
        }
      }

      // Each straight is shifted as a WHOLE segment. At a turn, the short connector
      // between the previous segment end and this segment start stays inside the
      // authored intersection pad instead of diagonally crossing lanes for 100m.
      pushDistinct(shiftedA);
      pushDistinct(shiftedB);
    }

    if (rebuilt.length >= 2) {
      if (closed) pushDistinct(rebuilt[0]);
      points.splice(0, points.length, ...rebuilt);
    }

    // The curved west bridge approach and compact T turns are authored directly at
    // legal left-hand lane positions in spawnDefaultTraffic(). Do not invent a generic
    // intersection shortcut here; that could send cars through the restored grass.
    this.forceClockwiseSpringfieldRoundabout(points);

    // Segment-by-segment lane shifting can leave a tiny connector between the end of
    // one shifted road and the start of the next. At a normal 90-degree junction that
    // connector can become a 135/180-degree hairpin: the car turns a little, then its
    // next waypoint is effectively behind it and the anti-U-turn guard stops the car
    // in the middle of the intersection. Clean those artefacts once, when the route is
    // authored, instead of asking the runtime steering state machine to fight them.
    this.cleanLaneShiftHairpins(points);
    // The old lane normaliser stopped here, leaving ordinary 90-degree turns as
    // one sharp lane-line waypoint. A finite-size car then had to rotate toward that
    // inside point and routinely clipped the kerb. Replace only genuine intersection
    // corners with road-validated, lane-to-lane curves derived from the live junction.
    this.smoothIntersectionTurns(points);
  }

  private routeTurnAngle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const bcx = c.x - b.x;
    const bcz = c.z - b.z;
    const abLen = Math.hypot(abx, abz);
    const bcLen = Math.hypot(bcx, bcz);
    if (abLen < 0.001 || bcLen < 0.001) return 0;
    const dot = THREE.MathUtils.clamp((abx * bcx + abz * bcz) / (abLen * bcLen), -1, 1);
    return Math.acos(dot);
  }

  private laneLineIntersection(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
  ): THREE.Vector3 | null {
    const x1 = a.x, z1 = a.z;
    const x2 = b.x, z2 = b.z;
    const x3 = c.x, z3 = c.z;
    const x4 = d.x, z4 = d.z;
    const den = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
    if (Math.abs(den) < 0.0001) return null;
    const cross12 = x1 * z2 - z1 * x2;
    const cross34 = x3 * z4 - z3 * x4;
    const x = (cross12 * (x3 - x4) - (x1 - x2) * cross34) / den;
    const z = (cross12 * (z3 - z4) - (z1 - z2) * cross34) / den;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return new THREE.Vector3(x, (b.y + c.y) * 0.5, z);
  }

  /**
   * Remove only the short lane-shift spikes created by applyAustralianLeftHandLanes.
   * This is deliberately conservative: long authored curves/roundabout arcs are kept.
   * The invariant after this pass is that no normal route corner asks traffic to make
   * a >100-degree instantaneous change of heading because of a 4-12m connector.
   */
  private cleanLaneShiftHairpins(points: THREE.Vector3[]): void {
    if (points.length < 4) return;
    const closed = points[0].distanceToSquared(points[points.length - 1]) < 0.01;
    const core = (closed ? points.slice(0, -1) : points).map((point) => point.clone());
    if (core.length < 3) return;

    const sharp = THREE.MathUtils.degToRad(100);
    const connectorMax = 14.0;

    // First collapse the classic four-point artefact:
    // long lane -> short diagonal bridge -> long lane. Replace the two bad bridge
    // endpoints with the intersection of the surrounding lane centre-lines.
    for (let pass = 0; pass < 24 && core.length >= 4; pass++) {
      let changed = false;
      for (let i = 1; i < core.length - 2; i++) {
        const a = core[i - 1];
        const b = core[i];
        const c = core[i + 1];
        const d = core[i + 2];
        const ab = a.distanceTo(b);
        const bc = b.distanceTo(c);
        const cd = c.distanceTo(d);
        if (bc > connectorMax || ab < 3 || cd < 3) continue;
        if (this.routeTurnAngle(a, b, c) <= sharp || this.routeTurnAngle(b, c, d) <= sharp) continue;
        const intersection = this.laneLineIntersection(a, b, c, d);
        if (!intersection) continue;
        if (intersection.distanceTo(b) > 18 || intersection.distanceTo(c) > 18) continue;
        core.splice(i, 2, intersection);
        changed = true;
        break;
      }
      if (!changed) break;
    }

    // Then remove any remaining tiny sharp spike, including one that straddles the
    // closing point of a loop. This catches old route data that contained an 8m
    // centre-line crossover before the next lane segment.
    for (let pass = 0; pass < 36 && core.length >= 3; pass++) {
      let changed = false;
      const count = core.length;
      for (let i = 0; i < count; i++) {
        if (!closed && (i === 0 || i === count - 1)) continue;
        const prev = core[(i - 1 + count) % count];
        const current = core[i];
        const next = core[(i + 1) % count];
        const incoming = prev.distanceTo(current);
        const outgoing = current.distanceTo(next);
        if (Math.min(incoming, outgoing) > 12.0) continue;
        if (this.routeTurnAngle(prev, current, next) <= sharp) continue;
        core.splice(i, 1);
        changed = true;
        break;
      }
      if (!changed) break;
    }

    points.splice(0, points.length, ...core);
    if (closed && core.length) points.push(core[0].clone());
  }

  /** True only for the actual authored traffic surface. The legacy navigation mask
   * only rejected open water, so a car could legally steer onto pavement/grass.
   * A tiny tolerance absorbs mesh seams without turning the sidewalk into a lane. */
  private isTrafficRoadPoint(point: THREE.Vector3, tolerance = 0.16): boolean {
    if (this.roadVehicleForbidden?.(point)) return false;
    if (this.collision.isRoadSurfaceAt(point.x, point.z)) return true;
    if (tolerance <= 0.001) return false;
    // Do not use CollisionSystem's eight-point clearance ring here: this predicate is
    // called for several chassis samples per traffic car. Four seam probes are enough
    // to absorb sub-decimetre road-mesh joins without multiplying raycasts 9x.
    const offsets = [[tolerance, 0], [-tolerance, 0], [0, tolerance], [0, -tolerance]] as const;
    for (const [ox, oz] of offsets) {
      if (this.collision.isRoadSurfaceAt(point.x + ox, point.z + oz)) return true;
    }
    return false;
  }

  /** Conservative generic car envelope used while authoring turn curves before a
   * specific spawned vehicle exists. This validates the BODY, not just its pivot. */
  private routeEnvelopeOnRoad(position: THREE.Vector3, yaw: number): boolean {
    const halfWidth = 1.28;
    const halfLength = 3.45;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const samples = [
      [0, 0],
      [halfLength, 0], [-halfLength, 0],
      [0, halfWidth], [0, -halfWidth],
      [halfLength * 0.82, halfWidth], [halfLength * 0.82, -halfWidth],
      [-halfLength * 0.72, halfWidth], [-halfLength * 0.72, -halfWidth],
    ] as const;
    for (const [forward, side] of samples) {
      this.tempRoute.set(
        position.x + fwdX * forward + rightX * side,
        position.y,
        position.z + fwdZ * forward + rightZ * side,
      );
      if (!this.isTrafficRoadPoint(this.tempRoute, 0.20)) return false;
    }
    return true;
  }

  /**
   * Convert sharp point-to-point junction corners into smooth lane-to-lane arcs.
   * The control point is the centre of the LIVE rendered intersection, not an old
   * coordinate table. Every generated sample is rejected unless a conservative car
   * envelope remains on tagged road geometry, so curves cannot cut a sidewalk.
   */
  private smoothIntersectionTurns(points: THREE.Vector3[]): void {
    if (points.length < 4) return;
    const closed = points[0].distanceToSquared(points[points.length - 1]) < 0.01;
    const core = (closed ? points.slice(0, -1) : points).map((point) => point.clone());
    if (core.length < 3) return;

    const output: THREE.Vector3[] = [];
    const pushDistinct = (point: THREE.Vector3) => {
      const last = output[output.length - 1];
      if (!last || last.distanceToSquared(point) > 0.0025) output.push(point.clone());
    };
    const minTurn = THREE.MathUtils.degToRad(34);
    const maxTurn = THREE.MathUtils.degToRad(148);

    for (let i = 0; i < core.length; i++) {
      if (!closed && (i === 0 || i === core.length - 1)) { pushDistinct(core[i]); continue; }
      const prev = core[(i - 1 + core.length) % core.length];
      const corner = core[i];
      const next = core[(i + 1) % core.length];
      const turn = this.routeTurnAngle(prev, corner, next);
      const inLen = prev.distanceTo(corner);
      const outLen = corner.distanceTo(next);
      // Authored compact curves/roundabouts already contain closely-spaced points.
      // Only replace the old long-straight -> sharp-waypoint -> long-straight pattern.
      if (turn < minTurn || turn > maxTurn || Math.min(inLen, outLen) < 15.0) {
        pushDistinct(corner);
        continue;
      }

      const zone = this.trafficZoneAt(corner, ['intersection'], 6.0);
      if (!zone) { pushDistinct(corner); continue; }
      const inDir = corner.clone().sub(prev).setY(0).normalize();
      const outDir = next.clone().sub(corner).setY(0).normalize();
      const zoneCenter = new THREE.Vector3(
        (zone.minX + zone.maxX) * 0.5,
        corner.y,
        (zone.minZ + zone.maxZ) * 0.5,
      );

      // Start turning before the junction and finish after it. This is deliberately
      // based on vehicle-scale clearance rather than a cosmetic steering tweak.
      const maxApproach = Math.min(9.0, inLen * 0.34, outLen * 0.34);
      const attempts = [maxApproach, maxApproach * 0.84, maxApproach * 0.68];
      let curve: THREE.Vector3[] | null = null;
      for (const approach of attempts) {
        if (approach < 4.5) continue;
        const entry = corner.clone().addScaledVector(inDir, -approach);
        const exit = corner.clone().addScaledVector(outDir, approach);
        const samples: THREE.Vector3[] = [];
        let valid = true;
        const steps = 6;
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          const omt = 1 - t;
          const point = new THREE.Vector3(
            omt * omt * entry.x + 2 * omt * t * zoneCenter.x + t * t * exit.x,
            corner.y,
            omt * omt * entry.z + 2 * omt * t * zoneCenter.z + t * t * exit.z,
          );
          const derivX = 2 * omt * (zoneCenter.x - entry.x) + 2 * t * (exit.x - zoneCenter.x);
          const derivZ = 2 * omt * (zoneCenter.z - entry.z) + 2 * t * (exit.z - zoneCenter.z);
          if (derivX * derivX + derivZ * derivZ < 0.0001 || !this.routeEnvelopeOnRoad(point, Math.atan2(derivX, derivZ))) {
            valid = false;
            break;
          }
          samples.push(point);
        }
        if (valid) { curve = samples; break; }
      }

      if (curve) curve.forEach(pushDistinct);
      else pushDistinct(corner);
    }

    points.splice(0, points.length, ...output);
    if (closed && output.length) points.push(output[0].clone());
  }

  /**
   * Springfield's civic roundabout is the only circular traffic feature. In map
   * coordinates (+Z points south), increasing polar angle is CLOCKWISE on screen.
   * Any short counter-clockwise connector is expanded into the legal clockwise arc
   * while preserving the same entry/exit roads.
   */
  private forceClockwiseSpringfieldRoundabout(points: THREE.Vector3[]): void {
    const cx = -210;
    const cz = -20;
    const isRingPoint = (p: THREE.Vector3) => {
      const r = Math.hypot(p.x - cx, p.z - cz);
      return r >= 18 && r <= 37;
    };

    // Work backwards so replacing one group never invalidates indices still to scan.
    const groups: Array<{ start: number; end: number }> = [];
    let start = -1;
    for (let i = 0; i < points.length; i++) {
      if (isRingPoint(points[i])) { if (start < 0) start = i; }
      else if (start >= 0) { if (i - start >= 3) groups.push({ start, end: i - 1 }); start = -1; }
    }
    if (start >= 0 && points.length - start >= 3) groups.push({ start, end: points.length - 1 });

    for (let g = groups.length - 1; g >= 0; g--) {
      const { start: a, end: b } = groups[g];
      const first = points[a];
      const last = points[b];
      let prevAngle = Math.atan2(first.z - cz, first.x - cx);
      let signedTravel = 0;
      for (let i = a + 1; i <= b; i++) {
        let angle = Math.atan2(points[i].z - cz, points[i].x - cx);
        let delta = angle - prevAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        signedTravel += delta;
        prevAngle = angle;
      }
      if (signedTravel >= -0.04) continue; // already clockwise or effectively straight

      let startAngle = Math.atan2(first.z - cz, first.x - cx);
      let endAngle = Math.atan2(last.z - cz, last.x - cx);
      while (endAngle <= startAngle) endAngle += Math.PI * 2;
      // A counter-clockwise shortcut must take the complementary clockwise path.
      if (endAngle - startAngle < Math.PI * 0.55) endAngle += Math.PI * 2;

      const radius = 24.5;
      const travel = endAngle - startAngle;
      const steps = Math.max(8, Math.ceil(travel / THREE.MathUtils.degToRad(18)));
      const replacement: THREE.Vector3[] = [first.clone()];
      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        const angle = startAngle + travel * t;
        replacement.push(new THREE.Vector3(cx + Math.cos(angle) * radius, 0, cz + Math.sin(angle) * radius));
      }
      replacement.push(last.clone());
      points.splice(a, b - a + 1, ...replacement);
    }
  }

  /** Build traffic-control areas from the live scene rather than a second hard-coded
   * coordinate table. Intersections/roundabouts come from their rendered meshes and
   * zebra crossings come from the exact markers used by pedestrian navigation. */
  private rebuildTrafficControlZones(): void {
    this.trafficControlZones = [];
    this.scene.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    const ordinaryRoadBoxes: Array<{ id: string; box: THREE.Box3 }> = [];

    this.scene.traverse((obj) => {
      if (obj.userData.pedestrianCrossingMarker === true) {
        obj.getWorldPosition(world);
        const roadAxis = obj.userData.roadAxis === 'z' ? 'z' : 'x';
        const roadWidth = Math.max(8, Number(obj.userData.roadWidth) || 14);
        // The painted stripe band is ~7m wide along the road. Add a small buffer so
        // a newly spawned car never materialises directly on top of a zebra crossing.
        const alongHalf = 5.2;
        const acrossHalf = roadWidth * 0.5 + 2.4;
        this.trafficControlZones.push({
          id: obj.name || `crossing_${this.trafficControlZones.length}`,
          minX: world.x - (roadAxis === 'x' ? alongHalf : acrossHalf),
          maxX: world.x + (roadAxis === 'x' ? alongHalf : acrossHalf),
          minZ: world.z - (roadAxis === 'x' ? acrossHalf : alongHalf),
          maxZ: world.z + (roadAxis === 'x' ? acrossHalf : alongHalf),
          kind: 'crossing',
        });
        return;
      }

      if (!(obj instanceof THREE.Mesh)) return;
      const name = obj.name.toLowerCase();
      const isRoundabout = name.includes('roundabout') && name.includes('road');
      const isNamedIntersection = obj.userData.compactIntersection === true ||
        name.includes('_intersection_') || name.includes('_junction') || name.endsWith('_intersection');
      if (obj.userData.mapRoadSurface === true && !isRoundabout && !isNamedIntersection) {
        const roadBox = new THREE.Box3().setFromObject(obj);
        if (!roadBox.isEmpty()) ordinaryRoadBoxes.push({ id: obj.name || `road_${ordinaryRoadBoxes.length}`, box: roadBox });
      }
      const isIntersection = isNamedIntersection;
      if (!isRoundabout && !isIntersection) return;

      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      const sizeX = box.max.x - box.min.x;
      const sizeZ = box.max.z - box.min.z;
      // Ignore tiny decorative pieces that happen to contain "junction" in a name.
      if (sizeX < 5 || sizeZ < 5) return;
      this.trafficControlZones.push({
        id: obj.name || `intersection_${this.trafficControlZones.length}`,
        minX: box.min.x,
        maxX: box.max.x,
        minZ: box.min.z,
        maxZ: box.max.z,
        kind: isRoundabout ? 'roundabout' : 'intersection',
      });
    });

    // Some clean T-junctions no longer need a dedicated intersection-pad mesh: the
    // two visible road slabs simply overlap. Detect those directly from the CURRENT
    // road geometry so box-blocking/spawn rules still apply after visual cleanups.
    for (let i = 0; i < ordinaryRoadBoxes.length; i++) {
      for (let j = i + 1; j < ordinaryRoadBoxes.length; j++) {
        const a = ordinaryRoadBoxes[i];
        const b = ordinaryRoadBoxes[j];
        // Grade-separated bridge/highway crossings are not intersections. Only
        // derive a control box when the actual road surfaces occupy the same level.
        const separatedVertically = Math.min(a.box.max.y, b.box.max.y) < Math.max(a.box.min.y, b.box.min.y) - 0.35;
        if (separatedVertically) continue;
        const minX = Math.max(a.box.min.x, b.box.min.x);
        const maxX = Math.min(a.box.max.x, b.box.max.x);
        const minZ = Math.max(a.box.min.z, b.box.min.z);
        const maxZ = Math.min(a.box.max.z, b.box.max.z);
        const overlapX = maxX - minX;
        const overlapZ = maxZ - minZ;
        if (overlapX < 5 || overlapZ < 5 || overlapX > 28 || overlapZ > 28) continue;
        const cx = (minX + maxX) * 0.5;
        const cz = (minZ + maxZ) * 0.5;
        const alreadyCovered = this.trafficControlZones.some((zone) =>
          zone.kind === 'intersection' && cx >= zone.minX - 2 && cx <= zone.maxX + 2 && cz >= zone.minZ - 2 && cz <= zone.maxZ + 2
        );
        if (alreadyCovered) continue;
        this.trafficControlZones.push({
          id: `road_overlap_${a.id}_${b.id}`,
          minX,
          maxX,
          minZ,
          maxZ,
          kind: 'intersection',
        });
      }
    }
    this.rebuildTrafficControlZoneSpatialIndex();
  }

  private pointInsideTrafficZone(point: THREE.Vector3, zone: TrafficControlZone, pad = 0): boolean {
    return point.x >= zone.minX - pad && point.x <= zone.maxX + pad &&
      point.z >= zone.minZ - pad && point.z <= zone.maxZ + pad;
  }

  /** Moving ambient traffic must start on an ordinary road segment, not inside a
   * turning box, roundabout or pedestrian crossing. */
  private isSafeTrafficSpawnPoint(point: THREE.Vector3): boolean {
    return !this.trafficControlZones.some((zone) => this.pointInsideTrafficZone(point, zone, zone.kind === 'crossing' ? 1.0 : 3.5));
  }

  private trafficZoneAt(
    point: THREE.Vector3,
    kinds: TrafficControlZone['kind'][] = ['intersection', 'roundabout', 'crossing'],
    pad = 0,
  ): TrafficControlZone | null {
    let found: TrafficControlZone | null = null;
    this.forEachNearbyTrafficControlZone(point, Math.max(1, pad + 2), (zone) => {
      if (!kinds.includes(zone.kind)) return;
      if (!this.pointInsideTrafficZone(point, zone, pad)) return;
      found = zone;
      return false;
    });
    return found;
  }

  private nearTrafficControlZone(
    point: THREE.Vector3,
    pad = 0,
    kinds: TrafficControlZone['kind'][] = ['intersection', 'roundabout', 'crossing'],
  ): boolean {
    return this.trafficZoneAt(point, kinds, pad) !== null;
  }

  /**
   * Junction commitment is intentionally tiny state, not a new pathfinder. Routes are
   * already authored. We only lock out behaviours that used to fight the route while
   * the car was in the turning box: reversing, driver exits and broad route reacquire.
   */
  private updateJunctionCommit(rt: TrafficRuntime, now: number): TrafficControlZone | null {
    const pos = rt.vehicle.mesh.position;
    const current = this.trafficZoneAt(pos, ['intersection', 'roundabout', 'crossing'], 0.2);
    if (current) {
      if (rt.committedZoneId !== current.id) {
        rt.committedZoneId = current.id;
        rt.committedSince = now;
      }
      // A queued/recovery reverse from outside must never survive into a junction.
      rt.reverseRecoveryTimer = 0;
      return current;
    }

    if (rt.committedZoneId) {
      const old = this.trafficControlZoneById.get(rt.committedZoneId);
      // Keep the lock for a small apron beyond the visual box so steering/recovery
      // cannot change state while the rear of a long bus is still clearing it.
      if (old && this.pointInsideTrafficZone(pos, old, 3.0)) return old;
      rt.committedZoneId = null;
      rt.committedSince = 0;
    }
    return null;
  }

  private routeLocallyStraight(rt: TrafficRuntime, steps = 3, maxTurnRadians = THREE.MathUtils.degToRad(13)): boolean {
    const points = rt.route.points;
    if (points.length < 3) return false;
    let lastX = 0;
    let lastZ = 0;
    let haveDirection = false;
    for (let step = 0; step < Math.min(steps, points.length - 1); step++) {
      const a = points[this.wrapRouteIndex(rt.route, rt.routeIndex + step)];
      const b = points[this.wrapRouteIndex(rt.route, rt.routeIndex + step + 1)];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      dx /= len;
      dz /= len;
      if (haveDirection) {
        const dot = THREE.MathUtils.clamp(lastX * dx + lastZ * dz, -1, 1);
        if (Math.acos(dot) > maxTurnRadians) return false;
      }
      lastX = dx;
      lastZ = dz;
      haveDirection = true;
    }
    return haveDirection;
  }

  private isSafeDriverExitPosition(rt: TrafficRuntime): boolean {
    if (rt.route.bus || rt.specialHybrid || rt.hijacked || rt.vehicle.inUse) return false;
    if (Math.abs(rt.vehicle.speed) > 0.8) return false;
    if (rt.committedZoneId || this.nearTrafficControlZone(rt.vehicle.mesh.position, 11)) return false;
    const id = rt.route.id.toLowerCase();
    if (id.includes('bridge') || id.includes('roundabout') || id.includes('highway_ramp')) return false;
    if (!this.routeLocallyStraight(rt, 3)) return false;

    const door = this.getDriverDoorWorld(rt, 0.55);
    if (!this.collision.canOccupy(door, 0.42, 1.78)) return false;

    // Do not create a pedestrian directly beside a following queue. The car behind
    // needs reaction/overtake room before an explicit future driver-exit event.
    let crowded = false;
    this.forEachNearbyTraffic(rt.vehicle.mesh.position, 13, (otherRt) => {
      if (otherRt === rt) return;
      crowded = true;
      return false;
    });
    return !crowded;
  }

  public canNpcDriverExitHere(vehicle: Vehicle): boolean {
    const rt = this.runtimes.find((r) => r.vehicle.id === vehicle.id);
    return !rt || this.isSafeDriverExitPosition(rt);
  }

  public isNpcDriverExitRestricted(vehicle: Vehicle): boolean {
    const rt = this.runtimes.find((r) => r.vehicle.id === vehicle.id);
    if (!rt) return false;
    if (rt.committedZoneId || this.nearTrafficControlZone(vehicle.mesh.position, 3.5)) return true;
    const id = rt.route.id.toLowerCase();
    return id.includes('bridge') || id.includes('roundabout') || id.includes('highway_ramp');
  }

  /** Advance missed control points in route order only. Unlike broad route reacquire,
   * this cannot choose another nearby segment/turn while a car is inside a junction. */
  private advanceCommittedRouteProgress(rt: TrafficRuntime): void {
    const pos = rt.vehicle.mesh.position;
    this.advanceForwardRouteProgress(rt, pos, 6.5);
    const yaw = rt.vehicle.yaw ?? rt.vehicle.mesh.rotation.y;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const maxCommittedTurn = THREE.MathUtils.degToRad(104);

    // A committed vehicle may only move FORWARD through points on the same authored
    // route. If an impact/overshoot leaves one tiny control point behind or sharply
    // to the side, skip that point instead of stopping in the box and waiting for a
    // reverse/U-turn recovery that is intentionally forbidden inside intersections.
    for (let step = 0; step < 6; step++) {
      const target = this.routeTarget(rt);
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.001) {
        rt.routeIndex = this.wrapRouteIndex(rt.route, rt.routeIndex + 1);
        continue;
      }
      const ahead = dx * fwdX + dz * fwdZ;
      const targetYaw = Math.atan2(dx, dz);
      const headingDiff = Math.abs(this.normaliseAngle(targetYaw - yaw));
      const definitelyPassed = ahead < -0.8 && dist <= 18;
      const shortHairpin = headingDiff > maxCommittedTurn && dist <= 18;
      if (!definitelyPassed && !shortHairpin) break;
      rt.routeIndex = this.wrapRouteIndex(rt.route, rt.routeIndex + 1);
    }
  }

  /** Pick an authored waypoint by PHYSICAL distance around the loop rather than by
   * raw point index. Curves/intersections contain many closely-spaced control points;
   * index-based distribution used to stack several startup cars in the same junction. */
  private routeIndexAtFraction(route: TrafficRoute, fraction: number): number {
    const points = route.points;
    if (points.length < 2) return 0;
    const lengths: number[] = [];
    let total = 0;
    for (let i = 0; i < points.length; i++) {
      const next = points[(i + 1) % points.length];
      const length = Math.hypot(next.x - points[i].x, next.z - points[i].z);
      lengths.push(length);
      total += length;
    }
    if (total < 0.01) return 0;
    let target = (((fraction % 1) + 1) % 1) * total;
    for (let i = 0; i < lengths.length; i++) {
      if (target <= lengths[i]) {
        // resolveRoadSpawn works from route points, so choose whichever endpoint of
        // this segment is physically closer to the requested arc-length position.
        return target <= lengths[i] * 0.5 ? i : (i + 1) % points.length;
      }
      target -= lengths[i];
    }
    return 0;
  }

  private tryStartSafeOvertake(
    rt: TrafficRuntime,
    blockerRt: TrafficRuntime,
    pos: THREE.Vector3,
    fwdX: number,
    fwdZ: number,
    longitudinal: number,
  ): boolean {
    if (rt.overtakeTargetId || rt.committedZoneId || rt.route.bus || rt.specialHybrid) return false;
    if (longitudinal < 5.5 || longitudinal > 20) return false;
    if (Math.abs(blockerRt.vehicle.speed) > 0.75) return false;
    const blockerIsActuallyStopped = blockerRt.driverState !== 'seated' || !blockerRt.vehicle.isOccupied ||
      !!blockerRt.vehicle.wrecked || !!blockerRt.vehicle.mesh.userData.unoccupiedCoasting;
    if (!blockerIsActuallyStopped) return false;
    if (!this.routeLocallyStraight(rt, 4, THREE.MathUtils.degToRad(9))) return false;
    if (this.nearTrafficControlZone(pos, 20) || this.nearTrafficControlZone(blockerRt.vehicle.mesh.position, 14)) return false;

    // Australian traffic passes a stopped lane obstruction on its RIGHT. This is a
    // temporary lane-centre offset only; it never changes the authored route.
    const passOffset = 3.35;
    let unsafe = false;
    this.forEachNearbyTraffic(pos, 42, (otherRt) => {
      if (otherRt === rt || otherRt === blockerRt) return;
      const other = otherRt.vehicle;
      const dx = other.mesh.position.x - pos.x;
      const dz = other.mesh.position.z - pos.z;
      const ahead = dx * fwdX + dz * fwdZ;
      if (ahead < -8 || ahead > 38) return;
      // True physical RIGHT vector is (-fwdZ,+fwdX) in this map convention.
      const signedRight = dz * fwdX - dx * fwdZ;
      if (Math.abs(signedRight - passOffset) > 2.8) return;
      const otherYaw = other.yaw ?? other.mesh.rotation.y;
      const headingDot = fwdX * Math.sin(otherYaw) + fwdZ * Math.cos(otherYaw);
      // Oncoming traffic in the temporary passing lane, or a same-direction car
      // already occupying it, means stay queued instead.
      if (headingDot < 0.15 || (ahead > -2 && ahead < 28)) {
        unsafe = true;
        return false;
      }
    });
    if (unsafe) return false;

    rt.overtakeTargetId = blockerRt.vehicle.id;
    rt.overtakeTimer = 6.5;
    return true;
  }

  private updateOvertakeState(rt: TrafficRuntime, dt: number): void {
    const vehicle = rt.vehicle;
    if (!rt.overtakeTargetId) {
      rt.overtakeOffset = THREE.MathUtils.damp(rt.overtakeOffset, 0, 4.0, dt);
      if (Math.abs(rt.overtakeOffset) < 0.025) rt.overtakeOffset = 0;
      return;
    }

    rt.overtakeTimer -= dt;
    const targetRt = this.runtimes.find((candidate) => candidate.vehicle.id === rt.overtakeTargetId);
    const pos = vehicle.mesh.position;
    const fwdX = Math.sin(vehicle.yaw ?? vehicle.mesh.rotation.y);
    const fwdZ = Math.cos(vehicle.yaw ?? vehicle.mesh.rotation.y);
    let finish = rt.overtakeTimer <= 0 || !targetRt || !!rt.committedZoneId || this.nearTrafficControlZone(pos, 11) || !this.routeLocallyStraight(rt, 3);
    if (targetRt) {
      const dx = targetRt.vehicle.mesh.position.x - pos.x;
      const dz = targetRt.vehicle.mesh.position.z - pos.z;
      const ahead = dx * fwdX + dz * fwdZ;
      if (ahead < -5.5 || Math.abs(targetRt.vehicle.speed) > 2.0) finish = true;
    }
    if (finish) {
      rt.overtakeTargetId = null;
      rt.overtakeTimer = 0;
    }
    rt.overtakeOffset = THREE.MathUtils.damp(rt.overtakeOffset, rt.overtakeTargetId ? 3.35 : 0, 3.4, dt);
  }

  private offsetRouteTargetForOvertake(rt: TrafficRuntime, target: THREE.Vector3): THREE.Vector3 {
    if (Math.abs(rt.overtakeOffset) < 0.01) return target;
    const yaw = rt.vehicle.yaw ?? rt.vehicle.mesh.rotation.y;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    // Australian overtaking moves RIGHT toward the road centre/opposing lane, never
    // LEFT toward the kerb. The old sign was reversed and could literally aim the
    // passing car at the sidewalk. Clamp the pass offset against the live asphalt.
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const original = target.clone();
    for (const scale of [1, 0.82, 0.64, 0.46, 0.28]) {
      target.copy(original);
      target.x += rightX * rt.overtakeOffset * scale;
      target.z += rightZ * rt.overtakeOffset * scale;
      if (!this.roadVehicleFootprintForbidden(rt.vehicle, target, yaw)) return target;
    }
    return original;
  }

  /** Speed-sensitive same-lane following. This uses bumper-to-bumper space rather
   * than centre distance, so buses and long novelty cars naturally reserve more room. */
  private trafficFollowingFactor(
    rt: TrafficRuntime,
    pos: THREE.Vector3,
    fwdX: number,
    fwdZ: number,
  ): number {
    const vehicle = rt.vehicle;
    const own = this.trafficFootprint(vehicle);
    const speed = Math.max(0, vehicle.speed);
    let factor = 1;

    const scanRadius = 55 + speed * 1.4;
    let hardBlocked = false;
    this.forEachNearbyTraffic(pos, scanRadius, (otherRt) => {
      const other = otherRt.vehicle;
      if (other === vehicle || other.inUse) return;
      if (rt.overtakeTargetId === other.id && rt.overtakeOffset > 1.2) return;
      const dx = other.mesh.position.x - pos.x;
      const dz = other.mesh.position.z - pos.z;
      const longitudinal = dx * fwdX + dz * fwdZ;
      if (longitudinal <= 0.2) return;

      const otherYaw = other.yaw ?? other.mesh.rotation.y;
      const otherFwdX = Math.sin(otherYaw);
      const otherFwdZ = Math.cos(otherYaw);
      const headingDot = fwdX * otherFwdX + fwdZ * otherFwdZ;
      // Same-direction lane following only. Cross traffic is handled by the
      // intersection gate below; opposite-direction traffic is in the other lane.
      const physicalObstacle = !!other.wrecked || !!other.mesh.userData.unoccupiedCoasting;
      if (headingDot < 0.42 && !physicalObstacle) return;

      const lateral = Math.abs(dx * fwdZ - dz * fwdX);
      const otherFootprint = this.trafficFootprint(other);
      const laneWidth = own.halfWidth + otherFootprint.halfWidth + 0.65;
      if (lateral > laneWidth) return;

      const otherSpeed = Math.max(0, other.speed);
      const closingSpeed = Math.max(0, speed - otherSpeed);
      const hardCenterGap = own.halfLength + otherFootprint.halfLength + (vehicle.type === 'city_bus' ? 2.2 : 1.65);
      const timeGap = vehicle.type === 'city_bus' ? 1.18 : 1.02;
      const desiredBumperGap = 4.0 + speed * timeGap + closingSpeed * 0.85;
      const desiredCenterGap = own.halfLength + otherFootprint.halfLength + desiredBumperGap;
      const lookAhead = desiredCenterGap + 7.0 + speed * 0.42;
      if (longitudinal > lookAhead) return;

      if (longitudinal < desiredCenterGap + 4 && this.tryStartSafeOvertake(rt, otherRt, pos, fwdX, fwdZ, longitudinal)) {
        factor = Math.min(factor, 0.55);
        return;
      }

      if (longitudinal <= hardCenterGap) {
        factor = 0;
        hardBlocked = true;
        return false;
      }
      const response = THREE.MathUtils.clamp(
        (longitudinal - hardCenterGap) / Math.max(1, lookAhead - hardCenterGap),
        0,
        1,
      );
      factor = Math.min(factor, response);
    });
    return hardBlocked ? 0 : factor;
  }

  private routeExitPointForZone(rt: TrafficRuntime, zone: TrafficControlZone): THREE.Vector3 | null {
    const points = rt.route.points;
    if (points.length < 2) return null;
    let entered = false;
    for (let step = 1; step <= Math.min(points.length, 18); step++) {
      const point = points[this.wrapRouteIndex(rt.route, rt.routeIndex + step)];
      const inside = this.pointInsideTrafficZone(point, zone, 0.75);
      if (inside) {
        entered = true;
        continue;
      }
      if (entered) return point;
    }
    return null;
  }

  /** Prevent "blocking the box". A car approaching a normal intersection waits at
   * the edge while another vehicle occupies the turning area or while the immediate
   * exit lane is queued. Roundabouts keep their normal give-way/following behaviour. */
  private intersectionQueueFactor(
    rt: TrafficRuntime,
    pos: THREE.Vector3,
    fwdX: number,
    fwdZ: number,
    activeVehicle?: Vehicle | null,
  ): number {
    const own = this.trafficFootprint(rt.vehicle);
    const speed = Math.max(0, rt.vehicle.speed);
    const scanDistance = 18 + speed * 0.65;
    let selected: { zone: TrafficControlZone; entryDistance: number } | null = null;

    this.forEachNearbyTrafficControlZone(pos, scanDistance + 18, (zone) => {
      if (zone.kind !== 'intersection') return;
      if (this.pointInsideTrafficZone(pos, zone, 0.25)) return; // already committed: clear the box

      // Sample the current lane centreline ahead. This works for both N/S and E/W
      // approaches and avoids hard-coding every junction orientation.
      let entryDistance = Number.POSITIVE_INFINITY;
      for (let d = 2; d <= scanDistance; d += 2) {
        const probeX = pos.x + fwdX * d;
        const probeZ = pos.z + fwdZ * d;
        if (probeX >= zone.minX && probeX <= zone.maxX && probeZ >= zone.minZ && probeZ <= zone.maxZ) {
          entryDistance = d;
          break;
        }
      }
      if (!Number.isFinite(entryDistance)) return;
      if (!selected || entryDistance < selected.entryDistance) selected = { zone, entryDistance };
    });
    if (!selected) return 1;

    const { zone, entryDistance } = selected;
    let blocked = false;
    const reservation = this.intersectionReservations.get(zone.id);
    if (reservation && reservation !== rt.vehicle.id) blocked = true;
    const routeExit = this.routeExitPointForZone(rt, zone);
    const inspectVehicle = (other: Vehicle) => {
      if (other === rt.vehicle) return;
      const otherPos = other.mesh.position;
      if (this.pointInsideTrafficZone(otherPos, zone, 0.5)) {
        blocked = true;
        return;
      }
      // Also reserve a little space beyond the intersection. This is what prevents
      // cars entering when the exit is already occupied by a stopped queue.
      const dx = otherPos.x - pos.x;
      const dz = otherPos.z - pos.z;
      const ahead = dx * fwdX + dz * fwdZ;
      const lateral = Math.abs(dx * fwdZ - dz * fwdX);
      const otherFootprint = this.trafficFootprint(other);
      const sameLaneWidth = own.halfWidth + otherFootprint.halfWidth + 0.75;
      const exitLookAhead = entryDistance + own.halfLength + otherFootprint.halfLength + 14 + speed * 0.35;
      if (ahead > entryDistance && ahead < exitLookAhead && lateral < sameLaneWidth && Math.abs(other.speed) < 5.5) {
        blocked = true;
      }

      // Turning traffic can leave the box in a direction very different from the
      // approach heading, so a forward-only probe can miss a blocked exit. Check the
      // actual authored route point immediately beyond the junction as well.
      if (!blocked && routeExit && Math.abs(other.speed) < 5.5) {
        const exitDx = otherPos.x - routeExit.x;
        const exitDz = otherPos.z - routeExit.z;
        const exitClearance = own.halfLength + otherFootprint.halfLength + 6.5;
        if (exitDx * exitDx + exitDz * exitDz < exitClearance * exitClearance) blocked = true;
      }
    };
    const queueScanRadius = Math.max(38, entryDistance + 32 + speed * 0.5);
    this.forEachNearbyTraffic(pos, queueScanRadius, (otherRt) => {
      if (blocked) return false;
      inspectVehicle(otherRt.vehicle);
    });
    if (!blocked && activeVehicle) inspectVehicle(activeVehicle);
    if (!blocked) {
      // Claim only when close to the mouth. Cars farther back do not monopolise the
      // junction while they are still travelling down the approach road.
      if (entryDistance <= 10.5) this.intersectionReservations.set(zone.id, rt.vehicle.id);
      return 1;
    }

    const stopBeforeEdge = own.halfLength + 2.5;
    if (entryDistance <= stopBeforeEdge + 0.5) return 0;
    return THREE.MathUtils.clamp((entryDistance - stopBeforeEdge) / 7.5, 0, 1);
  }

  /** Sample a route segment against the current road-vehicle exclusion mask.
   * A route point on dry land is not enough: a long/diagonal segment could still
   * cut across open river water between its endpoints. Bridge corridors remain
   * legal because App's predicate deliberately excludes authored bridge decks. */
  private routeSegmentCrossesForbidden(a: THREE.Vector3, b: THREE.Vector3, samples = 8): boolean {
    const probe = this.tempRoute;
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(samples, Math.min(36, Math.ceil(distance / 3.0)));
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      probe.set(
        THREE.MathUtils.lerp(a.x, b.x, t),
        THREE.MathUtils.lerp(a.y, b.y, t),
        THREE.MathUtils.lerp(a.z, b.z, t),
      );
      if (!this.isTrafficRoadPoint(probe, 0.18)) return true;
    }
    return false;
  }

  /**
   * UPDATE 13: Initial vehicle placement is validated against the CURRENT world
   * rather than blindly trusting coordinates authored several map revisions ago.
   * Moving traffic still spawns only on sampled segments of its lane-centre route,
   * so a collision repair can never "fix" a car by pushing it onto grass or a footpath.
   */
  private resolveRoadSpawn(route: TrafficRoute, preferredIndex: number, mesh: THREE.Group) {
    const pointCount = route.points.length;
    const preferred = ((preferredIndex % pointCount) + pointCount) % pointCount;
    const collisionRadius = Math.max(1.05, Number(mesh.userData.vehicleCollisionRadius) || 1.42);
    const collisionHeight = Math.max(1.4, Number(mesh.userData.vehicleCollisionHeight) || 2.0);
    const colliders = this.collision.getActiveColliders();

    const candidateOrder: number[] = [];
    // Search outward around the preferred arc-length position instead of only
    // marching forward. This keeps startup traffic distributed around the road
    // network while still finding a nearby safe segment if the first point is busy.
    for (let step = 0; step < pointCount; step++) {
      const offset = step === 0 ? 0 : Math.ceil(step / 2) * (step % 2 === 1 ? 1 : -1);
      const index = ((preferred + offset) % pointCount + pointCount) % pointCount;
      if (!candidateOrder.includes(index)) candidateOrder.push(index);
    }

    const candidate = new THREE.Vector3();
    // Most authored route points are deliberately located at corners/intersections.
    // Sample the ROAD SEGMENT between them so traffic can spawn halfway down a clear
    // block instead of being forced to choose a junction waypoint.
    const samples = route.speed > 0.01 ? [0.50, 0.25, 0.75, 0.12, 0.88, 0] : [0];
    for (const index of candidateOrder) {
      const a = route.points[index];
      const b = route.points[(index + 1) % pointCount];
      const segX = b.x - a.x;
      const segZ = b.z - a.z;
      const segLenSq = segX * segX + segZ * segZ;
      if (segLenSq < 0.01) continue;
      const yaw = Math.atan2(segX, segZ);
      if (this.routeSegmentCrossesForbidden(a, b)) continue;

      for (const t of samples) {
        const x = THREE.MathUtils.lerp(a.x, b.x, t);
        const z = THREE.MathUtils.lerp(a.z, b.z, t);
        // Road traffic in this world is ground-level. Reject a point if an old map
        // edit would make the floor query resolve to an elevated roof/train deck.
        const ground = this.collision.getGroundHeightNear(x, z, 0.18, 0.12, 0.9, 2.8);
        if (!Number.isFinite(ground) || ground < -0.8 || ground > 2.25) continue;
        candidate.set(x, ground + 0.08, z);
        if (!this.isTrafficRoadPoint(candidate, 0.18)) continue;

        // Ambient moving traffic never spawns inside a turning box, roundabout or
        // zebra crossing. Parked authored vehicles retain their explicit parking spots.
        if (route.speed > 0.01 && !this.isSafeTrafficSpawnPoint(candidate)) continue;

        // Use the actual vehicle collision footprint, not a giant render-box margin.
        const half = collisionRadius * 0.78;
        const minY = ground + 0.02;
        const maxY = minY + collisionHeight;
        const blockedByWorld = colliders.some((c) => {
          const cMinY = c.minY ?? -Infinity;
          const cMaxY = c.maxY ?? Infinity;
          if (maxY <= cMinY || minY >= cMaxY) return false;
          return candidate.x + half > c.minX && candidate.x - half < c.maxX &&
            candidate.z + half > c.minZ && candidate.z - half < c.maxZ;
        });
        if (blockedByWorld) continue;

        // Spawn spacing is deliberately much larger than the physical collision
        // radius. A car should enter the world with an actual traffic gap, not merely
        // avoid intersecting another bumper. Faster routes reserve more road space.
        const overlapsVehicle = this.vehicles.some((other) => {
          const otherRadius = Math.max(1.0, Number(other.mesh.userData.vehicleCollisionRadius) || 1.42);
          const dx = other.mesh.position.x - candidate.x;
          const dz = other.mesh.position.z - candidate.z;
          const movingGap = route.speed > 0.01
            ? Math.max(9.5, route.speed * 0.72 + 5.0)
            : 3.0;
          const minGap = collisionRadius + otherRadius + movingGap;
          return dx * dx + dz * dz < minGap * minGap;
        });
        if (overlapsVehicle) continue;

        return { index, start: candidate.clone(), yaw };
      }
    }

    // Never "solve" a bad spawn by putting the vehicle inside a wall/roof. If a
    // future map edit blocks an entire authored loop, skip this vehicle and surface a
    // warning instead. A missing ambient car is far better than a corrupt world spawn.
    console.warn(`[Traffic] No clear road spawn found for ${route.id}; vehicle skipped.`);
    return null;
  }

  private getDriverDoorWorld(rt: TrafficRuntime, extraDistance = 0): THREE.Vector3 {
    const v = rt.vehicle;
    const yaw = v.yaw ?? v.mesh.rotation.y;
    const driverSide = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const doorOffset = Math.max(1.2, Number(v.mesh.userData.vehicleExitOffset) || 1.35);
    const p = v.mesh.position.clone().addScaledVector(driverSide, doorOffset + extraDistance).addScaledVector(forward, 0.15);
    p.y = this.collision.getGroundHeightNear(p.x, p.z, rt.groundY, rt.groundY, 1.0, 4.0);
    return p;
  }

  private seatDriver(mesh: THREE.Group, variant: number): THREE.Group {
    const seat = mesh.userData.driverSeat as { x: number; y: number; z: number; scale?: number } | undefined;
    const avatar = createTrafficDriverAvatar(variant, true);
    const scale = seat?.scale ?? 0.46;
    avatar.scale.setScalar(scale);
    avatar.position.set(seat?.x ?? -0.40, seat?.y ?? 0.36, seat?.z ?? 0.02);
    avatar.rotation.y = 0;
    mesh.add(avatar);
    mesh.userData.driverAvatar = avatar;
    return avatar;
  }

  private addOptionalPassenger(mesh: THREE.Group, variant: number, forceVisible = false) {
    const seat = mesh.userData.passengerSeat as { x: number; y: number; z: number; scale?: number } | undefined;
    if (!seat || (!forceVisible && variant % 4 !== 0)) return;
    const passenger = createTrafficDriverAvatar(variant + 37, true);
    passenger.name = `traffic_passenger_${variant}`;
    passenger.scale.setScalar(seat.scale ?? 0.45);
    passenger.position.set(seat.x, seat.y, seat.z);
    passenger.rotation.y = 0;
    mesh.add(passenger);
  }

  private beginDriverOutside(rt: TrafficRuntime, initialBoarding = false) {
    if (rt.hijacked || rt.vehicle.inUse || rt.route.bus) return;
    if (!initialBoarding && !this.isSafeDriverExitPosition(rt)) return;
    if (rt.outsideDriver) {
      this.scene.remove(rt.outsideDriver);
      disposeTransientObject3D(rt.outsideDriver);
    }
    rt.driverVisual && (rt.driverVisual.visible = false);
    const outside = createTrafficDriverAvatar(rt.driverVariant, false);
    const door = this.getDriverDoorWorld(rt, initialBoarding ? 2.1 : 0.55);
    outside.position.copy(door);
    outside.rotation.y = (rt.vehicle.yaw ?? rt.vehicle.mesh.rotation.y) + Math.PI / 2;
    outside.userData.trafficDriverRuntime = rt.vehicle.id;
    this.scene.add(outside);
    rt.outsideDriver = outside;
    rt.driverState = initialBoarding ? 'boarding' : 'outside';
    rt.driverTimer = initialBoarding ? 3.8 : 3.2 + Math.random() * 2.2;
    rt.vehicle.isOccupied = false;
  }

  private finishDriverBoarding(rt: TrafficRuntime, now: number) {
    if (rt.outsideDriver) {
      this.scene.remove(rt.outsideDriver);
      disposeTransientObject3D(rt.outsideDriver);
      rt.outsideDriver = null;
    }
    if (rt.driverVisual) rt.driverVisual.visible = true;
    rt.driverState = 'seated';
    rt.vehicle.isOccupied = true;
    rt.nextDriverEvent = now + 42 + Math.random() * 55;
  }

  private updateDriverLifecycle(rt: TrafficRuntime, dt: number, now: number): boolean {
    if (rt.hijacked || rt.vehicle.inUse) return false;
    if (rt.route.bus) return false;

    if (rt.driverState === 'outside') {
      rt.driverTimer -= dt;
      rt.vehicle.speed = THREE.MathUtils.lerp(rt.vehicle.speed, 0, Math.min(1, dt * 6));
      if (rt.outsideDriver) {
        const idleBob = Math.sin(now * 3.5 + rt.driverVariant) * 0.02;
        rt.outsideDriver.position.y = this.collision.getGroundHeightNear(
          rt.outsideDriver.position.x,
          rt.outsideDriver.position.z,
          rt.vehicle.mesh.position.y,
          rt.outsideDriver.position.y,
          1.0,
          2.8
        ) + idleBob;
      }
      if (rt.driverTimer <= 0) {
        rt.driverState = 'boarding';
        rt.driverTimer = 4.0;
      }
      return true;
    }

    if (rt.driverState === 'boarding') {
      rt.driverTimer -= dt;
      rt.vehicle.speed = THREE.MathUtils.lerp(rt.vehicle.speed, 0, Math.min(1, dt * 6));
      if (!rt.outsideDriver) {
        this.finishDriverBoarding(rt, now);
        return false;
      }
      const door = this.getDriverDoorWorld(rt, 0.2);
      const delta = door.clone().sub(rt.outsideDriver.position);
      delta.y = 0;
      const dist = delta.length();
      if (dist > 0.001) {
        const step = Math.min(dist, dt * 2.4);
        delta.normalize();
        rt.outsideDriver.position.addScaledVector(delta, step);
        rt.outsideDriver.rotation.y = Math.atan2(delta.x, delta.z);
        rt.outsideDriver.position.y = this.collision.getGroundHeightNear(
          rt.outsideDriver.position.x,
          rt.outsideDriver.position.z,
          rt.vehicle.mesh.position.y,
          rt.outsideDriver.position.y,
          1.0,
          2.8
        );
      }
      if (dist < 0.28 || rt.driverTimer <= 0) this.finishDriverBoarding(rt, now);
      return true;
    }

    // Ambient moving traffic no longer performs random roadside breaks. That old
    // flavour event could fire simply because a car had slowed near a waypoint and
    // was a direct source of drivers stepping out in junction queues. Explicit future
    // driver-exit events must call beginDriverOutside(), which enforces the safe-stop
    // checks above (straight road, clear of crossings/junctions/bridges and traffic).
    return false;
  }

  private addVehicle(
    route: TrafficRoute,
    pointIndex: number,
    idCounter: number,
    factory: () => THREE.Group,
    isBus = false,
    profile?: {
      type: NonNullable<Vehicle['type']>;
      name: string;
      maxSpeed: number;
      acceleration: number;
      weight: number;
      cruiseScale?: number;
      driverName?: string;
      forcePassenger?: boolean;
      noDriver?: boolean;
    }
  ) {
    const mesh = factory();
    const spawn = this.resolveRoadSpawn(route, pointIndex, mesh);
    if (!spawn) return;
    const start = spawn.start;
    pointIndex = spawn.index;
    const yaw = spawn.yaw;
    mesh.position.copy(start);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);

    const isSports = factory === createSportsCarTraffic || factory === createConvertibleTraffic;
    const isConvertible = factory === createConvertibleTraffic;
    const vehicle: Vehicle = {
      id: profile ? `simpsons_${profile.type}_${idCounter}` : isBus ? `city_bus_${idCounter}` : `traffic_${idCounter}`,
      type: profile?.type ?? (isBus ? 'city_bus' : isConvertible ? 'traffic_convertible' : isSports ? 'civilian_sedan' : 'traffic_sedan'),
      modelType: profile?.type,
      name: profile?.name ?? (isBus
        ? 'Springfield City Bus'
        : isConvertible
        ? 'City Convertible'
        : isSports
        ? 'Springfield Sports Car'
        : route.id.startsWith('golden')
        ? 'Goldenrod Traffic Car'
        : 'Springfield Traffic Car'),
      mesh,
      position: start.clone(),
      yaw,
      speed: route.speed,
      maxSpeed: profile?.maxSpeed ?? (isBus ? 24 : isSports ? 44 : 32),
      acceleration: profile?.acceleration ?? (isBus ? 9 : isSports ? 24 : 18),
      isHeroCar: false,
      inUse: false,
      isOccupied: !profile?.noDriver,
      driverName: profile?.driverName ?? (isBus ? 'Springfield Bus Driver' : `City Driver ${idCounter + 1}`),
      damage: 0,
      weight: profile?.weight ?? (isBus ? 3.2 : 1),
    };
    mesh.userData.vehicleId = vehicle.id;
    mesh.userData.disabledUntil = 0;
    mesh.userData.trafficRouteId = route.id;
    mesh.userData.isBus = isBus;
    mesh.userData.isConvertible = isConvertible;

    const driverVisual = profile?.noDriver ? null : this.seatDriver(mesh, idCounter);
    if (!profile?.noDriver) this.addOptionalPassenger(mesh, idCounter, !!profile?.forcePassenger || (isConvertible && idCounter % 2 === 0));

    const rt: TrafficRuntime = {
      vehicle,
      route,
      routeIndex: pointIndex,
      cruiseSpeed: route.speed * (profile?.cruiseScale ?? (isBus ? 0.96 : 0.86 + Math.random() * 0.18)),
      disabledUntil: 0,
      hijacked: false,
      accidentTimer: 0,
      recoveryTimer: 0,
      stuckTimer: 0,
      reverseRecoveryTimer: 0,
      stuckSampleTimer: 0,
      stuckSamplePosition: start.clone(),
      committedZoneId: null,
      committedSince: 0,
      overtakeTargetId: null,
      overtakeTimer: 0,
      overtakeOffset: 0,
      lastPosition: start.clone(),
      driverVisual,
      outsideDriver: null,
      driverState: 'seated',
      driverTimer: 0,
      nextDriverEvent: profile?.noDriver ? Number.POSITIVE_INFINITY : performance.now() * 0.001 + 35 + Math.random() * 55,
      driverVariant: idCounter,
      groundY: start.y - 0.08,
      verticalVelocity: 0,
      specialHybrid: false,
      greetingCooldown: 0,
    };

    this.vehicles.push(vehicle);
    this.runtimes.push(rt);

    // Moving ambient traffic starts with its driver already seated. Only genuinely
    // parked routes may use the walk-to-car presentation, so no live lane starts with
    // a stationary unoccupied car obstructing traffic.
    if (!profile?.noDriver && !isBus && route.speed <= 0.01 && idCounter % 7 === 2) this.beginDriverOutside(rt, true);
  }

  private addLightningMcQueen(route: TrafficRoute, pointIndex = 0) {
    const mesh = createLightningMcQueenModel();
    const spawn = this.resolveRoadSpawn(route, pointIndex, mesh);
    if (!spawn) return;
    const start = spawn.start;
    pointIndex = spawn.index;
    const yaw = spawn.yaw;
    mesh.position.copy(start);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);

    const vehicle: Vehicle = {
      id: 'npc_lightning_mcqueen',
      type: 'lightning_mcqueen',
      modelType: 'lightning_mcqueen',
      name: 'Lightning McQueen',
      displayName: 'Lightning McQueen',
      mesh,
      position: start.clone(),
      yaw,
      speed: route.speed,
      maxSpeed: 52,
      baseMaxSpeed: 52,
      acceleration: 28,
      turnSpeed: 2.45,
      weight: 1.08,
      isHeroCar: false,
      inUse: false,
      isOccupied: false,
      driverName: 'Lightning McQueen',
      damage: 0,
      wrecked: false,
      hijacked: false,
    };
    mesh.userData.vehicleId = vehicle.id;
    mesh.userData.trafficRouteId = route.id;
    mesh.userData.npcVehicleHybrid = true;
    mesh.userData.isLightningMcQueen = true;
    mesh.userData.disabledUntil = 0;

    const rt: TrafficRuntime = {
      vehicle,
      route,
      routeIndex: pointIndex,
      cruiseSpeed: route.speed,
      disabledUntil: 0,
      hijacked: false,
      accidentTimer: 0,
      recoveryTimer: 0,
      stuckTimer: 0,
      reverseRecoveryTimer: 0,
      stuckSampleTimer: 0,
      stuckSamplePosition: start.clone(),
      committedZoneId: null,
      committedSince: 0,
      overtakeTargetId: null,
      overtakeTimer: 0,
      overtakeOffset: 0,
      lastPosition: start.clone(),
      driverVisual: null,
      outsideDriver: null,
      driverState: 'seated',
      driverTimer: 0,
      nextDriverEvent: Number.POSITIVE_INFINITY,
      driverVariant: -95,
      groundY: start.y - 0.08,
      verticalVelocity: 0,
      specialHybrid: true,
      greetingCooldown: 4,
    };
    this.vehicles.push(vehicle);
    this.runtimes.push(rt);
  }

  private spawnDefaultTraffic() {
    // Lane-centre loops. Density is deliberately uneven so downtown feels alive while
    // bridges/highway remain readable at speed.
    //
    // COMPACT BRIDGE JUNCTION ROUTING. The oversized asphalt bowl is gone. The west
    // approach is still compact, but X=-110 now has one narrow south connection to
    // Evergreen exactly as marked by the user. Every waypoint remains on visible road.
    const sfWestToCompactEastbound: [number, number][] = [
      [-180.5,-24.0],[-168.6,-22.4],[-157.8,-18.5],[-147.9,-13.5],
      [-139.0,-8.8],[-130.9,-5.3],[-124.0,-4.2],
    ];
    const sfCompactToWestWestbound: [number, number][] = [
      [-124.0,4.2],[-133.4,2.3],[-142.6,-1.6],[-151.7,-6.5],
      [-161.1,-11.2],[-170.6,-14.7],[-180.5,-16.0],
    ];

    // Legal left-hand turns contained inside the compact X=-124..-96 junction.
    // The new south link is narrow and uses its own explicit turn below rather than
    // reopening the former giant asphalt footprint.
    const sfWestToNorthTurn: [number, number][] = [
      [-124.0,-4.2],[-119.0,-4.3],[-115.8,-7.0],[-114.0,-10.5],[-114.0,-14.0],
    ];
    const sfNorthToWestTurn: [number, number][] = [
      [-106.0,-14.0],[-106.0,-9.5],[-108.5,-3.5],[-114.0,2.0],[-124.0,4.2],
    ];
    const sfNorthToBridgeTurn: [number, number][] = [
      [-106.0,-14.0],[-105.2,-10.0],[-102.5,-7.0],[-99.0,-5.0],[-96.0,-4.2],
    ];
    const sfSouthToWestTurn: [number, number][] = [
      [-114.0,9.0],[-114.0,6.0],[-116.0,4.5],[-120.0,4.2],[-124.0,4.2],
    ];
    // Main Springfield compact loop: Main Boulevard -> roundabout -> curved east
    // approach -> compact T -> north arterial -> northern perimeter -> Main Boulevard.
    // It closes around a real block; no lane-to-lane U-turn is needed.
    const springfieldMainCompactLoop: [number, number][] = [
      [-181,-166],[-181,-112],[-181,-64],[-181,-42],[-181,-36],[-184,-31],[-180.5,-24],
      ...sfWestToCompactEastbound.slice(1),
      ...sfWestToNorthTurn.slice(1),
      [-114,-64],[-114,-106],[-114,-166],[-134,-166],[-181,-166],
    ];

    // Reverse-direction companion used by the bus: north arterial -> compact T ->
    // west curve -> roundabout -> Main Boulevard -> north perimeter -> arterial.
    const springfieldBusCompactLoop: [number, number][] = [
      [-110,-170],[-110,-64],[-110,-14],
      ...sfNorthToWestTurn.slice(1),
      ...sfCompactToWestWestbound.slice(1),
      [-183,-18],[-186,-22],[-185,-27],[-185,-32],[-185,-64],[-185,-110],[-185,-170],
      [-110,-170],
    ];

    // Local green-neighbourhood loop. Both vertical streets begin at Evergreen and
    // connect to the southern perimeter, so no vehicle ever crosses the restored
    // grass north of Z=67.
    const springfieldEvergreenLocalLoop: [number, number][] = [
      [-310,60],[-145,60],[-145,150],[-110,150],[-110,60],[-310,60],
    ];

    // AIRPORT PUBLIC-ROAD NETWORK. This uses the same single clean centreline as
    // buildAirportDistrict(): Springfield X=-185 -> terminal frontage -> Goldenrod
    // East Avenue X=310. The route then closes over EXISTING Goldenrod perimeter / Main
    // Avenue / north-viaduct asphalt. No waypoint remains on the deleted X=200 airport
    // spur through Professor Oak's Lab, and normal traffic never receives airside points.
    const airportWestApproach: [number, number][] = [
      [-185,-170],[-185,-214],[-178,-248],[-164,-280],[-142,-312],[-116,-340],[-86,-365],[-68,-389],[-82,-414],[-88,-432],
      [-70,-438],[-40,-441],[0,-442],[40,-441],[70,-438],[88,-432],
      [96,-412],[126,-394],[162,-376],[196,-354],[228,-328],[255,-298],[278,-266],[296,-230],[310,-194],[310,-150],
      // Existing Goldenrod roads close the city-to-city loop without a U-turn.
      [260,-150],[204,-150],[200,-154],[200,-170],[134,-170],[-134,-170],[-185,-170],
    ];
    const makeLeftLaneRoute = (id: string, speed: number, center: [number, number][], lane = 3.25): TrafficRoute => {
      const raw = center.map(([x,z]) => new THREE.Vector3(x,0,z));
      const points = raw.map((point, i) => {
        const prev = raw[(i - 1 + raw.length) % raw.length];
        const next = raw[(i + 1) % raw.length];
        const tangent = next.clone().sub(prev).setY(0);
        if (tangent.lengthSq() < 0.001) return point.clone();
        tangent.normalize();
        // For heading (dx,dz), this left vector matches the game's established
        // Australian convention: +Z/southbound traffic sits east/+X.
        const left = new THREE.Vector3(tangent.z,0,-tangent.x);
        return point.clone().addScaledVector(left,lane);
      });
      // Explicitly close the loop after offsetting; runtime route following expects
      // the final waypoint to lead naturally back to the first.
      if (points.length && points[0].distanceToSquared(points[points.length-1]) > 0.01) points.push(points[0].clone());
      this.smoothIntersectionTurns(points);
      return { id, speed, points };
    };
    const airportOutboundRoute = makeLeftLaneRoute('airport_two_city_access_loop', 14.2, airportWestApproach);
    const airportReturnRoute = makeLeftLaneRoute('airport_two_city_access_return', 13.6, [...airportWestApproach].reverse());

    const routes: TrafficRoute[] = [
      // Goldenrod east lane moved with East Avenue from X=290 to X=310.
      this.route('goldenrod_city_loop', 13.2, [
        [114,-86],[196,-86],[306,-86],[306,86],[204,86],[114,86],[114,-86],
      ]),
      // Main Avenue traffic uses the proper perimeter block rather than a mid-road U-turn.
      this.route('goldenrod_main_lane', 13.4, [
        [196,-154],[196,-92],[196,-4],[196,86],[196,154],
        [204,154],[306,154],[306,86],[306,-4],[306,-94],[306,-154],
        [204,-154],[196,-154],
      ]),
      this.route('springfield_main_lane', 11.8, springfieldMainCompactLoop),
      this.route('springfield_evergreen_loop', 10.6, springfieldEvergreenLocalLoop),
      // Clockwise outer loop uses existing city blocks on the Springfield side. The
      // compact bridge T is not required for this perimeter journey.
      this.route('outer_highway_lane', 19.5, [
        [-185,-170],[-134,-170],[134,-170],[200,-170],
        [200,-90],[200,0],[200,90],[200,150],[134,150],[-134,150],[-145,150],
        [-145,60],[-310,60],[-310,-60],[-185,-60],[-185,-170],
      ]),
      // Counter-clockwise companion follows the same physical network in reverse.
      this.route('outer_highway_return_lane', 18.8, [
        [-185,-170],[-185,-60],[-310,-60],[-310,60],[-145,60],[-145,150],
        [-134,150],[134,150],[200,150],[200,90],[200,0],[200,-90],[200,-170],
        [134,-170],[-134,-170],[-185,-170],
      ]),
      // Bus uses the compact north-city loop. Its longer wheelbase gets the same
      // authored curved approach and legal left-hand turn as normal traffic.
      this.route('springfield_bus_route', 9.8, springfieldBusCompactLoop, true),
      this.route('goldenrod_perimeter_loop', 11.6, [
        [114,-146],[196,-146],[306,-146],[306,-94],[306,-4],[306,86],[306,146],
        [204,146],[114,146],[114,86],[114,-4],[114,-94],[114,-146],
      ]),
      this.route('springfield_commercial_loop', 10.4, [
        [-306,-106],[-189,-106],[-114,-106],[-114,-64],[-189,-64],[-306,-64],[-306,-106],
      ]),
      // Central-bridge loop: north arterial -> compact T -> central bridge ->
      // Goldenrod -> north bridge -> back to the Springfield north arterial. The
      // south side of the compact T is never referenced because it is now grass.
      this.route('central_bridge_city_loop', 15.2, [
        [-106,-166],[-106,-64],[-106,-14],
        ...sfNorthToBridgeTurn.slice(1),
        [-90,-4.2],[0,-4.2],[90,-4.2],[96,-4.2],
        [101,-4.0],[104,-2.0],[106,-6.0],[106,-90],[106,-166],
        [0,-166],[-106,-166],
      ]),
      this.route('springfield_compact_evergreen_link_loop', 10.2, [
        [-110,150],[-110,60],[-110,9],
        ...sfSouthToWestTurn.slice(1),
        ...sfCompactToWestWestbound.slice(1),
        [-183,-18],[-186,-22],[-185,-27],[-185,-32],[-185,-60],
        [-310,-60],[-310,60],[-110,60],[-110,150],
      ]),
      // Arcade Pixel Paradise circuit: brings traffic down from Northern Viaduct into
      // the car park forecourt, out along the East Extended Road to Goldenrod, and back.
      this.route('arcade_circuit_loop', 13.5, [
        [8, -170],
        [8, -215],
        [8, -260],
        [16, -268],
        [24, -273],
        [60, -273],
        [150, -273],
        [273, -273],
        [278, -266],
        [296, -230],
        [310, -194],
        [310, -150],
        [260, -150],
        [200, -154],
        [200, -170],
        [134, -170],
        [8, -170],
      ]),
      // Arcade West Connector: brings traffic from Springfield and Airport West approach
      // into Pixel Paradise car park and back up onto the Northern Viaduct.
      this.route('arcade_west_loop', 13.0, [
        [-185, -170],
        [-185, -214],
        [-178, -248],
        [-168, -273],
        [-110, -273],
        [-40, -273],
        [-10, -273],
        [0, -268],
        [8, -260],
        [8, -215],
        [8, -170],
        [-60, -170],
        [-134, -170],
        [-185, -170],
      ]),
    ];

    // Keep the authored lane geometry available to pursuit AI. Police use this
    // only as a steering hint when practical; close-range interception still targets
    // the player directly.
    this.pursuitRoadRoutes = [...routes.slice(0, 6), routes[7], routes[8], routes[9], routes[10], routes[11], routes[12], airportOutboundRoute, airportReturnRoute].filter(Boolean);

    const factories = [createSedanTraffic, createSuvTraffic, createSportsCarTraffic, createConvertibleTraffic];
    const counts = [4, 4, 4, 3, 4, 3];
    let idCounter = 0;
    routes.slice(0, 6).forEach((route, routeIdx) => {
      const count = counts[routeIdx];
      for (let i = 0; i < count; i++) {
        const factory = factories[(routeIdx + i) % factories.length];
        // Evenly distribute by real road distance. A small per-route phase keeps
        // several different loops from all choosing the same physical intersection.
        const fraction = (i + 0.28 + routeIdx * 0.11) / Math.max(1, count);
        const pointIndex = this.routeIndexAtFraction(route, fraction);
        this.addVehicle(route, pointIndex, idCounter++, factory, false);
      }
    });
    // Populate the newly connected roads lightly. Two cars per loop are enough to
    // demonstrate that these are functioning streets without undoing the traffic
    // density/performance work.
    [routes[7], routes[8]].forEach((route, extraIdx) => {
      for (let i = 0; i < 2; i++) {
        const pointIndex = this.routeIndexAtFraction(route, (i + 0.32 + extraIdx * 0.17) / 2);
        this.addVehicle(route, pointIndex, idCounter++, factories[(extraIdx + i) % factories.length], false);
      }
    });
    // Light traffic on the rebuilt central bridge / compact T-junction. Two cars are
    // enough to exercise the connection without crowding the smaller turning area.
    const centralBridgeRoute = routes[9];
    for (let i = 0; i < 2; i++) {
      const pointIndex = this.routeIndexAtFraction(centralBridgeRoute, (i + 0.36) / 2);
      this.addVehicle(centralBridgeRoute, pointIndex, idCounter++, factories[(i + 1) % factories.length], false);
    }
    // One light-traffic car proves the new short connector is part of the live road
    // network without turning the compact junction into another congestion hotspot.
    const evergreenLinkRoute = routes[10];
    this.addVehicle(evergreenLinkRoute, 0, idCounter++, factories[0], false);

    // Pixel Paradise Arcade road network: moving ambient traffic in and out of the car park
    const arcadeCircuitRoute = routes[11];
    for (let i = 0; i < 2; i++) {
      const pointIndex = this.routeIndexAtFraction(arcadeCircuitRoute, (i + 0.25) / 2);
      this.addVehicle(arcadeCircuitRoute, pointIndex, idCounter++, factories[(i + 2) % factories.length], false);
    }
    const arcadeWestRoute = routes[12];
    for (let i = 0; i < 2; i++) {
      const pointIndex = this.routeIndexAtFraction(arcadeWestRoute, (i + 0.45) / 2);
      this.addVehicle(arcadeWestRoute, pointIndex, idCounter++, factories[(i + 1) % factories.length], false);
    }

    // Pixel Paradise Arcade Parking Lot: Stationary parked cars in the parking bays along the entrance sidewalk
    const arcadeStall1 = this.route('arcade_carpark_sedan', 0, [
      [-10.0, -281],
      [-10.0, -284],
    ]);
    this.addVehicle(arcadeStall1, 0, idCounter++, createSportsCarTraffic, false, {
      type: 'arcade_visitor_sports',
      name: 'Pixel Turbo GT',
      maxSpeed: 42,
      acceleration: 24,
      weight: 1.1,
      cruiseScale: 0,
      driverName: 'Arcade Gamer',
      noDriver: true,
    });

    const arcadeStall2 = this.route('arcade_carpark_convertible', 0, [
      [2.0, -281],
      [2.0, -284],
    ]);
    this.addVehicle(arcadeStall2, 0, idCounter++, createConvertibleTraffic, false, {
      type: 'arcade_visitor_convertible',
      name: 'Retro Roadster',
      maxSpeed: 38,
      acceleration: 21,
      weight: 1.05,
      cruiseScale: 0,
      driverName: 'Arcade Champion',
      noDriver: true,
    });

    const arcadeStall3 = this.route('arcade_carpark_suv', 0, [
      [20.0, -281],
      [20.0, -284],
    ]);
    this.addVehicle(arcadeStall3, 0, idCounter++, createSuvTraffic, false, {
      type: 'arcade_visitor_suv',
      name: 'Arcade Cruiser SUV',
      maxSpeed: 34,
      acceleration: 19,
      weight: 1.5,
      cruiseScale: 0,
      driverName: 'Arcade Visitor',
      noDriver: true,
    });

    // Airport traffic is deliberately light: enough to make both approaches feel
    // connected without turning the terminal loop into a queue. Because the route
    // contains PUBLIC access roads only, normal traffic cannot wander onto airside.
    for (const [airportRoute, count, phase] of [[airportOutboundRoute, 4, 0.17], [airportReturnRoute, 3, 0.43]] as const) {
      for (let i = 0; i < count; i++) {
        const pointIndex = this.routeIndexAtFraction(airportRoute, (i + phase) / count);
        this.addVehicle(airportRoute, pointIndex, idCounter++, factories[(i + count) % factories.length], false);
      }
    }
    // UPDATE 11: the Simpsons Family Sedan is an authored parked vehicle at
    // 742 Evergreen Terrace rather than another roaming novelty traffic car.
    // The driveway sits around world X=-198 and runs north toward Evergreen
    // Terrace. Park well clear of both the garage door (Z≈37) and the street-side
    // picket opening (Z≈51), while leaving the house's front path at X≈-213 free.
    // A second point is only a heading reference: route speed 0 keeps the car
    // intentionally parked until the player enters it.
    const simpsonsFamilyDriveway = this.route('simpsons_family_driveway_parking', 0, [
      [-198.0, 45.5],
      [-198.0, 53.5],
    ]);
    this.addVehicle(simpsonsFamilyDriveway, 0, idCounter++, createSimpsonsFamilySedan, false, {
      type: 'simpsons_family_sedan',
      name: 'Simpsons Family Sedan',
      maxSpeed: 36,
      acceleration: 22,
      weight: 1.0,
      cruiseScale: 0,
      driverName: 'Simpson Family',
      noDriver: true,
    });
    const canyoneroSpawnIndex = Math.max(0, routes[3].points.findIndex((p) => Math.abs(p.x + 310) < 0.5 && Math.abs(p.z - 56) < 0.5));
    this.addVehicle(routes[3], canyoneroSpawnIndex, idCounter++, createCanyonero, false, {
      type: 'canyonero', name: 'Canyonero', maxSpeed: 34, acceleration: 17, weight: 1.65, cruiseScale: 0.78, driverName: 'Canyonero Driver', forcePassenger: true,
    });
    const mrPlowSpawnIndex = Math.max(0, routes[2].points.findIndex((p) => Math.abs(p.x + 181) < 0.5 && Math.abs(p.z + 166) < 0.5));
    this.addVehicle(routes[2], mrPlowSpawnIndex, idCounter++, createMrPlow, false, {
      type: 'mr_plow', name: 'Mr. Plow', maxSpeed: 32, acceleration: 18, weight: 1.45, cruiseScale: 0.70, driverName: 'Mr. Plow Driver',
    });
    const rocketSpawnIndex = Math.max(0, routes[4].points.findIndex((p) => Math.abs(p.x - 134) < 0.1 && Math.abs(p.z + 166) < 0.1));
    this.addVehicle(routes[4], rocketSpawnIndex, idCounter++, createSpeedRocket, false, {
      type: 'speed_rocket', name: 'Speed Rocket', maxSpeed: 66, acceleration: 44, weight: 0.72, cruiseScale: 0.92, driverName: 'Rocket Driver',
    });
    const homerCarSpawnIndex = Math.max(0, routes[5].points.findIndex((p) => Math.abs(p.x - 134) < 0.1 && Math.abs(p.z - 154) < 0.1));
    this.addVehicle(routes[5], homerCarSpawnIndex, idCounter++, createCarBuiltForHomer, false, {
      type: 'car_built_for_homer', name: 'The Homer', maxSpeed: 46, acceleration: 27, weight: 1.35, cruiseScale: 0.84, driverName: 'Experimental Car Driver', forcePassenger: true,
    });

    // Peppa Pig family car: deliberately parked in the SOUTH-WEST strip of the
    // Krusty Burger car park. This keeps it away from the elevated magnet-rail corridor
    // to the north and away from the restaurant entrance. The second point is only a
    // heading reference; zero cruise speed keeps it parked until the player enters it.
    const peppaCarParking = this.route('peppa_family_car_parking', 0, [[-286,-144],[-276,-144]]);
    this.addVehicle(peppaCarParking, 0, idCounter++, createPeppaFamilyCar, false, {
      type: 'peppa_family_car', name: "Peppa Pig Family Car", maxSpeed: 31, acceleration: 17, weight: 0.95, cruiseScale: 0, driverName: 'Pig Family', noDriver: true,
    });

    // Start the Springfield Bus on the visible Main Boulevard lane. It then follows
    // the same compact-junction route as normal north-city traffic.
    const busVisibleIndex = Math.max(0, routes[6].points.findIndex((p) => Math.abs(p.x + 181) < 0.5 && Math.abs(p.z + 64) < 0.5));
    this.addVehicle(routes[6], busVisibleIndex, idCounter++, createCityBusTraffic, true);

    // Lightning McQueen is deliberately the ONLY autonomous character-car hybrid.
    // Keep him on the local Evergreen/south-perimeter block so he never follows the
    // deleted bridge-to-Evergreen asphalt through the restored grass.
    const lightningRoute = this.route('lightning_mcqueen_route', 15.6, springfieldEvergreenLocalLoop);
    const mcQueenVisibleIndex = Math.max(0, lightningRoute.points.findIndex((p) => Math.abs(p.x + 310) < 0.5 && Math.abs(p.z - 56) < 0.5));
    this.addLightningMcQueen(lightningRoute, mcQueenVisibleIndex);
  }

  /** Project a world point onto the closest authored LEFT-HAND traffic-lane segment.
   * The pose variant also exposes the legal lane heading so police spawns do not
   * materialise facing against Australian traffic. */
  public getNearestRoadPose(position: THREE.Vector3, maxDistance = 24): { point: THREE.Vector3; yaw: number; routeId: string } | null {
    let best: { point: THREE.Vector3; yaw: number; routeId: string } | null = null;
    let bestD2 = maxDistance * maxDistance;
    const projected = new THREE.Vector3();
    for (const route of this.pursuitRoadRoutes) {
      const points = route.points;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const len2 = abx * abx + abz * abz;
        if (len2 < 0.0001) continue;
        if (this.routeSegmentCrossesForbidden(a, b)) continue;
        const t = THREE.MathUtils.clamp(((position.x - a.x) * abx + (position.z - a.z) * abz) / len2, 0, 1);
        projected.set(a.x + abx * t, position.y, a.z + abz * t);
        if (!this.isTrafficRoadPoint(projected, 0.18)) continue;
        const dx = projected.x - position.x;
        const dz = projected.z - position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { point: projected.clone(), yaw: Math.atan2(abx, abz), routeId: route.id };
        }
      }
    }
    return best;
  }

  public getNearestRoadPoint(position: THREE.Vector3, maxDistance = 24): THREE.Vector3 | null {
    return this.getNearestRoadPose(position, maxDistance)?.point ?? null;
  }

  public isNpcVehicleHybrid(vehicle: Vehicle | null | undefined): boolean {
    return !!vehicle?.mesh.userData.npcVehicleHybrid;
  }

  /** Pause happens automatically while `inUse` is true. On exit, re-acquire the
   * nearest authored route point so McQueen's AI resumes from wherever the player
   * left him instead of fighting player controls or snapping to a spawn coordinate. */
  public resumeNpcVehicleHybrid(vehicle: Vehicle): boolean {
    const rt = this.runtimes.find((r) => r.vehicle.id === vehicle.id);
    if (!rt?.specialHybrid) return false;
    // Rejoin a lane segment that agrees with McQueen's current heading rather than
    // simply choosing the nearest point. The nearest point can belong to the
    // opposite-direction side of a road and used to make him whip around 180°.
    if (!this.reacquireForwardRouteIndex(rt, vehicle.mesh.position, vehicle.yaw ?? vehicle.mesh.rotation.y, 48, false)) {
      this.advanceForwardRouteProgress(rt, vehicle.mesh.position, 5.0);
    }
    rt.hijacked = false;
    rt.stuckTimer = 0;
    rt.stuckSampleTimer = 0;
    rt.stuckSamplePosition.copy(vehicle.mesh.position);
    rt.accidentTimer = 0;
    rt.recoveryTimer = 3.4;
    rt.reverseRecoveryTimer = 0;
    rt.committedZoneId = null;
    rt.committedSince = 0;
    rt.overtakeTargetId = null;
    rt.overtakeTimer = 0;
    rt.overtakeOffset = 0;
    rt.lastPosition.copy(vehicle.mesh.position);
    rt.groundY = this.collision.getGroundHeightNear(
      vehicle.mesh.position.x, vehicle.mesh.position.z,
      vehicle.mesh.position.y - 0.08, vehicle.mesh.position.y - 0.08, 1.0, 5.0
    );
    rt.verticalVelocity = Math.min(0, rt.verticalVelocity);
    rt.greetingCooldown = 8;
    vehicle.hijacked = false;
    vehicle.isOccupied = false;
    // McQueen is a persistent character. If the player managed to wreck him while
    // driving, recover him to a battered-but-driveable NPC state so exiting never
    // leaves his autonomous character permanently dead on the road.
    if (vehicle.wrecked || (vehicle.damage ?? 0) >= 100) {
      vehicle.wrecked = false;
      vehicle.damage = 55;
      vehicle.mesh.userData.wrecked = false;
      vehicle.mesh.userData.wreckMessageShown = false;
      vehicle.mesh.rotation.z = 0;
      vehicle.speed = 0;
    }
    vehicle.mesh.userData.wasHijacked = false;
    return true;
  }

  public consumeHybridGreeting(): { name: string; text: string } | null {
    const pending = this.pendingHybridGreeting;
    this.pendingHybridGreeting = null;
    return pending;
  }

  public markHijacked(vehicle: Vehicle) {
    const rt = this.runtimes.find((r) => r.vehicle.id === vehicle.id);
    if (rt?.specialHybrid) return;
    if (rt) {
      // Player hijacking overrides every autonomous traffic state, even if the car is
      // currently inside a junction. Do not make gameplay interaction wait for the AI
      // to clear an intersection. Once hijacked, the traffic controller must stop
      // steering/reversing/queueing/overtaking this vehicle immediately.
      rt.hijacked = true;
      rt.committedZoneId = null;
      rt.committedSince = 0;
      rt.reverseRecoveryTimer = 0;
      rt.stuckTimer = 0;
      rt.overtakeTargetId = null;
      rt.overtakeTimer = 0;
      rt.overtakeOffset = 0;
      rt.accidentTimer = 0;
      rt.driverTimer = 0;
      if (rt.driverVisual) rt.driverVisual.visible = false;
      if (rt.outsideDriver) {
        this.scene.remove(rt.outsideDriver);
        disposeTransientObject3D(rt.outsideDriver);
        rt.outsideDriver = null;
      }
    }
    vehicle.isOccupied = false;
    vehicle.mesh.userData.wasHijacked = true;
  }

  public disableVehicle(vehicle: Vehicle, seconds = 3) {
    const now = performance.now() * 0.001;
    vehicle.mesh.userData.disabledUntil = Math.max(vehicle.mesh.userData.disabledUntil ?? 0, now + seconds);
    const rt = this.runtimes.find((r) => r.vehicle.id === vehicle.id);
    if (rt) rt.disabledUntil = vehicle.mesh.userData.disabledUntil;
  }

  private trafficRadius(vehicle: Vehicle): number {
    return Math.max(1.1, Number(vehicle.mesh.userData.vehicleCollisionRadius) || (vehicle.type === 'city_bus' ? 2.05 : 1.45));
  }

  private trafficHeight(vehicle: Vehicle): number {
    return Math.max(1.5, Number(vehicle.mesh.userData.vehicleCollisionHeight) || (vehicle.type === 'city_bus' ? 3.0 : 2.2));
  }

  private trafficFootprint(vehicle: Vehicle): { halfWidth: number; halfLength: number } {
    const dims = vehicle.mesh.userData.realWorldDimensions as { length?: number; width?: number } | undefined;
    const length = Number(dims?.length);
    const width = Number(dims?.width);
    if (length > 0 && width > 0) {
      return {
        halfWidth: THREE.MathUtils.clamp(width * 0.47, 0.62, 1.38),
        halfLength: THREE.MathUtils.clamp(length * 0.46, 1.35, 4.5),
      };
    }
    if (vehicle.type === 'city_bus') return { halfWidth: 1.45, halfLength: 4.15 };
    return { halfWidth: 0.98, halfLength: 2.30 };
  }


  /** Test the actual road-vehicle footprint, including a small kerb margin.
   * This is now a TRUE drivable-road mask: every sampled body point must remain on
   * tagged asphalt/bridge road, not merely avoid water. */
  private roadVehicleFootprintForbidden(vehicle: Vehicle, position: THREE.Vector3, yaw: number): boolean {
    const footprint = this.trafficFootprint(vehicle);
    const halfWidth = footprint.halfWidth + 0.28;
    const halfLength = footprint.halfLength + 0.12;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    // In this X/Z map convention (+Z = south), the physical RIGHT side of a car is
    // (-fwdZ,+fwdX). Keeping this explicit also prevents overtake/kerb sign mistakes.
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const samples = [
      [0, 0],
      [halfLength, 0], [-halfLength * 0.88, 0],
      [0, halfWidth], [0, -halfWidth],
      [halfLength * 0.84, halfWidth], [halfLength * 0.84, -halfWidth],
      [-halfLength * 0.72, halfWidth], [-halfLength * 0.72, -halfWidth],
    ] as const;
    for (const [forward, side] of samples) {
      this.tempRoute.set(
        position.x + fwdX * forward + rightX * side,
        position.y,
        position.z + fwdZ * forward + rightZ * side,
      );
      if (!this.isTrafficRoadPoint(this.tempRoute, 0.14)) return true;
    }
    return false;
  }

  /** Continuous road-boundary check for low-rate/distant traffic. Testing only the
   * final point allowed a 4-6m LOD step to cut diagonally across a kerb even when both
   * endpoints happened to be asphalt. */
  private roadVehicleSweepForbidden(
    vehicle: Vehicle,
    from: THREE.Vector3,
    to: THREE.Vector3,
    yawFrom: number,
    yawTo = yawFrom,
  ): boolean {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.min(8, Math.ceil(distance / 1.25)));
    const yawDelta = this.normaliseAngle(yawTo - yawFrom);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.tempNext.set(
        THREE.MathUtils.lerp(from.x, to.x, t),
        THREE.MathUtils.lerp(from.y, to.y, t),
        THREE.MathUtils.lerp(from.z, to.z, t),
      );
      if (this.roadVehicleFootprintForbidden(vehicle, this.tempNext, yawFrom + yawDelta * t)) return true;
    }
    return false;
  }

  private wrapRouteIndex(route: TrafficRoute, index: number): number {
    const count = route.points.length;
    return count > 0 ? ((index % count) + count) % count : 0;
  }

  private normaliseAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  /**
   * Advance only FORWARD through the authored route when the vehicle has genuinely
   * reached or geometrically passed a waypoint. The old implementation only used a
   * small distance test, so an overshot waypoint could remain behind the car and the
   * steering controller would rotate 180 degrees to chase it.
   */
  private advanceForwardRouteProgress(rt: TrafficRuntime, position: THREE.Vector3, reachedDistance = 4.0): void {
    const points = rt.route.points;
    const count = points.length;
    if (count < 2) return;

    const footprint = this.trafficFootprint(rt.vehicle);
    const corridor = Math.max(7.0, footprint.halfWidth * 3.2);
    const reachedSq = reachedDistance * reachedDistance;

    // Several consecutive points can be very close around curves/roundabouts, so
    // allow a bounded number of forward advances in a single frame. Never decrement.
    for (let step = 0; step < Math.min(6, count); step++) {
      const index = this.wrapRouteIndex(rt.route, rt.routeIndex);
      const nextIndex = this.wrapRouteIndex(rt.route, index + 1);
      const a = points[index];
      const b = points[nextIndex];
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const lenSq = sx * sx + sz * sz;

      // Duplicate closing points are harmless, but they must not become a zero-length
      // target that leaves the AI with an undefined/behind heading.
      if (lenSq < 0.01) {
        rt.routeIndex = nextIndex;
        continue;
      }

      const tx = b.x - position.x;
      const tz = b.z - position.z;
      const targetDistSq = tx * tx + tz * tz;
      const progress = ((position.x - a.x) * sx + (position.z - a.z) * sz) / lenSq;
      const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1);
      const projX = a.x + sx * clampedProgress;
      const projZ = a.z + sz * clampedProgress;
      const lateralX = position.x - projX;
      const lateralZ = position.z - projZ;
      const lateralSq = lateralX * lateralX + lateralZ * lateralZ;

      const reached = targetDistSq <= reachedSq;
      const safelyPassed = progress > 1.015 && lateralSq <= corridor * corridor;
      if (!reached && !safelyPassed) break;
      rt.routeIndex = nextIndex;
    }
  }

  /**
   * Re-acquire the nearest route SEGMENT that continues in roughly the vehicle's
   * current forward direction. This is used after displacement/physics recovery and
   * prevents a route reset from selecting a nearby segment travelling the opposite
   * way, which previously produced visible mid-road U-turns.
   */
  private reacquireForwardRouteIndex(
    rt: TrafficRuntime,
    position = rt.vehicle.mesh.position,
    yaw = rt.vehicle.yaw ?? rt.vehicle.mesh.rotation.y,
    maxDistance = 34,
    preferContinuity = true,
  ): boolean {
    const points = rt.route.points;
    const count = points.length;
    if (count < 2) return false;

    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const current = this.wrapRouteIndex(rt.route, rt.routeIndex);
    let bestIndex = -1;
    let bestScore = Infinity;
    const maxDistanceSq = maxDistance * maxDistance;

    for (let i = 0; i < count; i++) {
      const a = points[i];
      const b = points[(i + 1) % count];
      const sx = b.x - a.x;
      const sz = b.z - a.z;
      const lenSq = sx * sx + sz * sz;
      if (lenSq < 0.01) continue;
      const len = Math.sqrt(lenSq);
      // Never re-acquire an obsolete/invisible shortcut whose segment no longer lies
      // on the current rendered road network. This keeps recovery from selecting a
      // nearby sidewalk/grass chord after map edits.
      if (this.routeSegmentCrossesForbidden(a, b, Math.max(6, Math.ceil(len / 4)))) continue;
      const dirX = sx / len;
      const dirZ = sz / len;
      const headingDot = dirX * fwdX + dirZ * fwdZ;

      // A route segment pointing more than ~100 degrees behind the vehicle is never
      // a valid automatic recovery choice for ordinary traffic.
      if (headingDot < -0.16) continue;

      const t = THREE.MathUtils.clamp(((position.x - a.x) * sx + (position.z - a.z) * sz) / lenSq, 0, 1);
      const px = a.x + sx * t;
      const pz = a.z + sz * t;
      const dx = position.x - px;
      const dz = position.z - pz;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > maxDistanceSq) continue;

      const forwardSteps = (i - current + count) % count;
      const continuityPenalty = preferContinuity ? Math.min(forwardSteps, 12) * 0.65 : 0;
      const headingPenalty = (1 - Math.max(-0.16, headingDot)) * 10;
      const score = distanceSq + continuityPenalty + headingPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex < 0) return false;
    rt.routeIndex = bestIndex;
    this.advanceForwardRouteProgress(rt, position, 4.5);
    return true;
  }

  private routeTarget(rt: TrafficRuntime): THREE.Vector3 {
    return rt.route.points[this.wrapRouteIndex(rt.route, rt.routeIndex + 1)];
  }

  private routeTargetHeadingDiff(rt: TrafficRuntime, position = rt.vehicle.mesh.position): number {
    const target = this.routeTarget(rt);
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    if (dx * dx + dz * dz < 0.0001) return 0;
    const desiredYaw = Math.atan2(dx, dz);
    return this.normaliseAngle(desiredYaw - (rt.vehicle.yaw ?? rt.vehicle.mesh.rotation.y));
  }

  private distanceToRouteTarget(rt: TrafficRuntime) {
    const target = rt.route.points[(rt.routeIndex + 1) % rt.route.points.length];
    const dx = target.x - rt.vehicle.mesh.position.x;
    const dz = target.z - rt.vehicle.mesh.position.z;
    return Math.hypot(dx, dz);
  }

  private trafficLightFactor(pos: THREE.Vector3, fwdX: number, fwdZ: number, now: number) {
    const nsGreen = Math.floor(now / 6) % 2 === 0;
    const headingNS = Math.abs(fwdZ) >= Math.abs(fwdX);
    if ((headingNS && nsGreen) || (!headingNS && !nsGreen)) return 1;
    const junctions: Array<[number, number]> = [
      [200,-90],[200,0],[200,90],
      [-210,-130],[-210,-60],[-210,60],
      [-210,-170],[200,-170],[-210,150],[200,150],
    ];
    for (const [jx,jz] of junctions) {
      const dx=jx-pos.x, dz=jz-pos.z;
      const ahead=dx*fwdX+dz*fwdZ;
      const lateral=Math.abs(dx*fwdZ-dz*fwdX);
      if (ahead>1.5 && ahead<11 && lateral<6.5) return 0;
    }
    return 1;
  }

  private pedestrianTrafficFactor(
    pos: THREE.Vector3,
    fwdX: number,
    fwdZ: number,
    vehicle: Vehicle,
    pedestrians: NPC[] | undefined
  ) {
    let factor = 1;
    const vehicleRadius = this.trafficRadius(vehicle);
    const baseStopRange = vehicle.type === 'city_bus' ? 20 : 15 + Math.max(0, vehicleRadius - 1.45) * 2.0;
    const baseLateralLaneWidth = Math.max(vehicle.type === 'city_bus' ? 3.6 : 3.1, vehicleRadius + 1.65);
    let pedestrianHardStop = false;
    this.forEachNearbyPedestrian(pos, baseStopRange + 4.5, (npc) => {
      if (npc.state === 'knocked_out' || npc.state === 'defeated' || npc.state === 'kicked') return;
      const crossing = !!npc.mesh.userData.pedestrianCrossing;
      const roadEscape = npc.mesh.userData.pedestrianRouteKind === 'road_escape';
      // A pedestrian committed to a zebra crossing gets a slightly earlier/braver
      // traffic yield. Someone recovering out of a lane also receives protection,
      // but curb-side walkers do not stop traffic simply by standing near the road.
      const stopRange = baseStopRange + (crossing ? 4.0 : roadEscape ? 2.0 : 0);
      const lateralLaneWidth = baseLateralLaneWidth + (crossing ? 0.45 : 0);
      const dx = npc.mesh.position.x - pos.x;
      const dz = npc.mesh.position.z - pos.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > stopRange * stopRange) return;
      const ahead = dx * fwdX + dz * fwdZ;
      const lateral = Math.abs(dx * fwdZ - dz * fwdX);
      if (ahead < -1.5 || ahead > stopRange || lateral > lateralLaneWidth) return;
      const safeGap = crossing ? 4.8 : roadEscape ? 4.2 : 3.5;
      const response = THREE.MathUtils.clamp((ahead - safeGap) / Math.max(1, stopRange - safeGap), 0, 1);
      factor = Math.min(factor, response);
      if (ahead < safeGap + 0.8) {
        factor = 0;
        pedestrianHardStop = true;
        return false;
      }
    });
    if (pedestrianHardStop) return 0;

    // Drivers who have temporarily stepped out are pedestrians too. Other cars must
    // queue around them rather than mowing them down while they walk back to the door.
    for (const otherRt of this.runtimes) {
      const pedestrian = otherRt.outsideDriver;
      if (!pedestrian || !pedestrian.visible) continue;
      const dx = pedestrian.position.x - pos.x;
      const dz = pedestrian.position.z - pos.z;
      const ahead = dx * fwdX + dz * fwdZ;
      const lateral = Math.abs(dx * fwdZ - dz * fwdX);
      if (ahead < -1.5 || ahead > baseStopRange || lateral > baseLateralLaneWidth) continue;
      const response = THREE.MathUtils.clamp((ahead - 4.2) / Math.max(1, baseStopRange - 4.2), 0, 1);
      factor = Math.min(factor, response);
      if (ahead < 5.0) return 0;
    }
    return factor;
  }

  /** Once a vehicle has entered a junction/crossing, ordinary yielding decisions are
   * already too late: they belong on the approach. Keep moving through the committed
   * path and brake only for a person literally inside the immediate collision envelope. */
  private committedPedestrianEmergencyFactor(
    pos: THREE.Vector3,
    fwdX: number,
    fwdZ: number,
    vehicle: Vehicle,
  ): number {
    const footprint = this.trafficFootprint(vehicle);
    const forwardClearance = footprint.halfLength + 2.0;
    const lateralClearance = footprint.halfWidth + 0.75;
    const scanRadius = forwardClearance + 3.0;
    let emergency = false;
    this.forEachNearbyPedestrian(pos, scanRadius, (npc) => {
      if (npc.state === 'knocked_out' || npc.state === 'defeated' || npc.state === 'kicked') return;
      const dx = npc.mesh.position.x - pos.x;
      const dz = npc.mesh.position.z - pos.z;
      const ahead = dx * fwdX + dz * fwdZ;
      const lateral = Math.abs(dx * fwdZ - dz * fwdX);
      if (ahead > -0.6 && ahead < forwardClearance && lateral < lateralClearance) {
        emergency = true;
        return false;
      }
    });
    if (emergency) return 0;

    for (const otherRt of this.runtimes) {
      const pedestrian = otherRt.outsideDriver;
      if (!pedestrian || !pedestrian.visible) continue;
      const dx = pedestrian.position.x - pos.x;
      const dz = pedestrian.position.z - pos.z;
      const ahead = dx * fwdX + dz * fwdZ;
      const lateral = Math.abs(dx * fwdZ - dz * fwdX);
      if (ahead > -0.6 && ahead < forwardClearance && lateral < lateralClearance) return 0;
    }
    return 1;
  }

  private canUseReverseRecovery(rt: TrafficRuntime): boolean {
    if (rt.committedZoneId || this.nearTrafficControlZone(rt.vehicle.mesh.position, 13)) return false;
    if (!this.routeLocallyStraight(rt, 3, THREE.MathUtils.degToRad(10))) return false;
    const pos = rt.vehicle.mesh.position;
    const yaw = rt.vehicle.yaw ?? rt.vehicle.mesh.rotation.y;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    let clearBehind = true;
    this.forEachNearbyTraffic(pos, 11, (otherRt) => {
      if (otherRt === rt) return;
      const dx = otherRt.vehicle.mesh.position.x - pos.x;
      const dz = otherRt.vehicle.mesh.position.z - pos.z;
      const behind = -(dx * fwdX + dz * fwdZ);
      const lateral = Math.abs(dx * fwdZ - dz * fwdX);
      if (behind > 0.2 && behind < 9 && lateral < 3.1) {
        clearBehind = false;
        return false;
      }
    });
    return clearBehind;
  }

  private recoverStuckTraffic(
    rt: TrafficRuntime,
    dt: number,
    targetSpeed: number,
    trafficFactor: number,
    playerDistanceSq: number,
    directionBlocked = false,
  ) {
    const pos = rt.vehicle.mesh.position;
    const committed = !!rt.committedZoneId;
    const shouldBeMoving = targetSpeed > 2.2 && trafficFactor > 0.62 && rt.accidentTimer <= 0 && rt.driverState === 'seated';

    // Measure progress over a real time window. The old frame-by-frame 1.8cm test
    // could call a car "stuck" while it was simply crawling in a queue, which then
    // started a reverse/forward oscillation.
    rt.stuckSampleTimer += dt;
    if (rt.stuckSampleTimer >= 0.72) {
      const sampleDt = rt.stuckSampleTimer;
      const moved = Math.sqrt(pos.distanceToSquared(rt.stuckSamplePosition));
      const genuinelyNotProgressing = shouldBeMoving && moved < Math.max(0.28, sampleDt * 0.48) && Math.abs(rt.vehicle.speed) < 1.15;
      const routeProblem = directionBlocked && moved < 0.55;
      if (genuinelyNotProgressing || routeProblem) rt.stuckTimer += sampleDt;
      else rt.stuckTimer = Math.max(0, rt.stuckTimer - sampleDt * 1.6);
      rt.stuckSampleTimer = 0;
      rt.stuckSamplePosition.copy(pos);
    }

    if (committed) {
      // Inside an intersection the only recovery is FORWARD along the already chosen
      // route. Never reverse, teleport, U-turn or select a different nearby segment.
      rt.reverseRecoveryTimer = 0;
      if (rt.stuckTimer > 2.8) {
        this.advanceCommittedRouteProgress(rt);
        rt.recoveryTimer = Math.max(rt.recoveryTimer, 1.0);
      }
      if (rt.stuckTimer > 6.5) {
        // A little extra steering urgency is enough for most bad waypoint/corner
        // cases. Keep the timer bounded so clearing the box immediately resets it.
        rt.stuckTimer = 4.5;
      }
      rt.lastPosition.copy(pos);
      return;
    }

    // Recovery order outside junctions:
    // 1) wait/keep steering, 2) forward route re-acquire, 3) only much later use a
    // short reverse on a straight clear road, 4) finally relocate off-screen.
    if (rt.stuckTimer > 4.8 && rt.recoveryTimer <= 0.05) {
      if (this.reacquireForwardRouteIndex(rt, pos, rt.vehicle.yaw ?? rt.vehicle.mesh.rotation.y, 38, true)) {
        rt.recoveryTimer = 1.8;
      }
    }

    if (rt.stuckTimer > 8.5 && rt.reverseRecoveryTimer <= 0 && this.canUseReverseRecovery(rt)) {
      rt.recoveryTimer = Math.max(rt.recoveryTimer, 2.2);
      rt.reverseRecoveryTimer = 0.55;
      rt.accidentTimer = 0;
      // Do not immediately trigger another reverse after this one finishes.
      rt.stuckTimer = 5.5;
    }

    // Last resort is deliberately late and off-screen. It always rejoins a FORWARD
    // authored segment and never lands inside a crossing/intersection or another car.
    if (rt.stuckTimer > 13.5 && playerDistanceSq > 65 * 65) {
      this.reacquireForwardRouteIndex(rt, pos, rt.vehicle.yaw ?? rt.vehicle.mesh.rotation.y, 42, true);
      const count = rt.route.points.length;
      for (let step = 1; step <= Math.min(4, count); step++) {
        const pointIndex = this.wrapRouteIndex(rt.route, rt.routeIndex + step);
        const nextIndex = this.wrapRouteIndex(rt.route, pointIndex + 1);
        const candidate = rt.route.points[pointIndex].clone();
        candidate.y = this.collision.getGroundHeightNear(candidate.x, candidate.z, rt.groundY, rt.groundY, 1.0, 4.0) + 0.08;
        const radius = this.trafficRadius(rt.vehicle);
        const height = this.trafficHeight(rt.vehicle);
        if (!this.collision.canOccupy(candidate, radius, height)) continue;
        if (this.roadVehicleFootprintForbidden(rt.vehicle, candidate, rt.vehicle.yaw ?? rt.vehicle.mesh.rotation.y)) continue;
        if (!this.isSafeTrafficSpawnPoint(candidate)) continue;
        const recoveryBlockedByTraffic = this.runtimes.some((otherRt) => {
          if (otherRt === rt) return false;
          const dx = otherRt.vehicle.mesh.position.x - candidate.x;
          const dz = otherRt.vehicle.mesh.position.z - candidate.z;
          return dx * dx + dz * dz < 13 * 13;
        });
        if (recoveryBlockedByTraffic) continue;

        const next = rt.route.points[nextIndex];
        const headingX = next.x - candidate.x;
        const headingZ = next.z - candidate.z;
        if (headingX * headingX + headingZ * headingZ < 0.01) continue;

        pos.copy(candidate);
        rt.routeIndex = pointIndex;
        rt.groundY = candidate.y - 0.08;
        rt.verticalVelocity = 0;
        rt.vehicle.yaw = Math.atan2(headingX, headingZ);
        rt.vehicle.mesh.rotation.y = rt.vehicle.yaw;
        rt.vehicle.speed = 0;
        rt.lastPosition.copy(candidate);
        rt.stuckSamplePosition.copy(candidate);
        rt.stuckSampleTimer = 0;
        rt.stuckTimer = 0;
        rt.recoveryTimer = 1.5;
        rt.reverseRecoveryTimer = 0;
        rt.overtakeTargetId = null;
        rt.overtakeOffset = 0;
        return;
      }
    }

    rt.lastPosition.copy(pos);
  }

  public update(
    dt: number,
    activeVehicle: Vehicle | null,
    playerPos?: THREE.Vector3,
    pedestrians?: NPC[],
    roadVehicleForbidden?: (point: THREE.Vector3) => boolean,
    drawDistance = 230,
    fullSimulationDistance = 135,
    detailedVehicleBudget = 24,
  ) {
    this.roadVehicleForbidden = roadVehicleForbidden ?? null;
    const now = performance.now() * 0.001;
    this.intersectionReservations.clear();
    // Snapshot nearby entities once per simulation tick. All following/yield checks
    // below query these coarse cells instead of repeatedly scanning whole rosters.
    this.rebuildTrafficSpatialIndex(pedestrians);
    const drawDistanceSq = drawDistance * drawDistance;
    const fullSimulationDistanceSq = fullSimulationDistance * fullSimulationDistance;

    // Full traffic AI is intentionally reserved for the cars that can actually
    // interact with the player right now. Previously every car inside the full-sim
    // radius ran wall sweeps, queue scans, pedestrian checks and grounding together,
    // which could turn one 20 Hz world tick into a 50+ ms traffic spike. Keep a hard
    // safety radius exact, then fill the remaining budget with the nearest cars.
    const detailedRuntimes = new Set<TrafficRuntime>();
    if (playerPos) {
      const candidates: Array<{ rt: TrafficRuntime; d2: number }> = [];
      const safetyDistanceSq = 42 * 42;
      for (const rt of this.runtimes) {
        const v = rt.vehicle;
        if (v === activeVehicle || v.inUse || rt.hijacked || !!v.mesh.userData.unoccupiedCoasting) continue;
        const dx = v.mesh.position.x - playerPos.x;
        const dz = v.mesh.position.z - playerPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= fullSimulationDistanceSq) candidates.push({ rt, d2 });
      }
      candidates.sort((a, b) => a.d2 - b.d2);
      for (const candidate of candidates) {
        if (candidate.d2 <= safetyDistanceSq || detailedRuntimes.size < detailedVehicleBudget || candidate.rt.specialHybrid) {
          detailedRuntimes.add(candidate.rt);
        }
      }
    }

    for (const rt of this.runtimes) {
      const v = rt.vehicle;
      if (v === activeVehicle || v.inUse || rt.hijacked || !!v.mesh.userData.unoccupiedCoasting) {
        // Player-abandoned cars can retain physical momentum for a few seconds.
        // Their coast body is simulated by App, so traffic AI must not simultaneously
        // steer the same mesh (especially the McQueen hybrid) until that coast ends.
        v.mesh.visible = true;
        continue;
      }

      let playerDistanceSq = 0;
      if (playerPos) {
        const pdx = v.mesh.position.x - playerPos.x;
        const pdz = v.mesh.position.z - playerPos.z;
        playerDistanceSq = pdx * pdx + pdz * pdz;
        v.mesh.visible = playerDistanceSq <= drawDistanceSq;
        if (!v.mesh.visible) continue;
      } else v.mesh.visible = true;

      rt.accidentTimer = Math.max(0, rt.accidentTimer - dt);
      rt.recoveryTimer = Math.max(0, rt.recoveryTimer - dt);
      rt.reverseRecoveryTimer = Math.max(0, rt.reverseRecoveryTimer - dt);

      // A real vehicle-to-vehicle impact temporarily hands motion to App's shared
      // collision recovery integrator. Do not immediately snap the car back onto its
      // route or overwrite transferred momentum on the next traffic-AI tick.
      const dynamicCollisionUntil = Number(v.mesh.userData.vehicleCollisionRecoveryUntil ?? 0);
      if (dynamicCollisionUntil > now) {
        rt.accidentTimer = Math.max(rt.accidentTimer, 0.18);
        rt.recoveryTimer = Math.max(rt.recoveryTimer, 0.35);
        rt.reverseRecoveryTimer = 0;
        continue;
      }

      let collisionPrev = v.mesh.userData.vehicleCollisionPreviousPosition as THREE.Vector3 | undefined;
      if (!(collisionPrev instanceof THREE.Vector3)) {
        collisionPrev = v.mesh.position.clone();
        v.mesh.userData.vehicleCollisionPreviousPosition = collisionPrev;
      } else collisionPrev.copy(v.mesh.position);

      if (v.wrecked || v.mesh.userData.wrecked) {
        v.speed = THREE.MathUtils.lerp(v.speed, 0, Math.min(1, dt * 5));
        continue;
      }
      if ((v.mesh.userData.disabledUntil ?? rt.disabledUntil) > now) {
        v.speed = THREE.MathUtils.lerp(v.speed, 0, Math.min(1, dt * 4));
        continue;
      }
      const pos = v.mesh.position;
      let committedZone = this.updateJunctionCommit(rt, now);
      this.updateOvertakeState(rt, dt);
      if (playerPos && !detailedRuntimes.has(rt)) {
        // PERFORMANCE LOD: distant traffic stays alive visually but does not run
        // pedestrian scans, car-vs-car avoidance, wall sweeps or driver AI every
        // world tick. Advance it along its authored lane at ~5 Hz instead.
        const lodInterval = 0.17 + (Math.abs(rt.driverVariant) % 5) * 0.012;
        if (rt.lodAccumulator === undefined) {
          // Deterministic phase offset prevents every distant car from waking its
          // low-rate queue/following update on the same world tick.
          const phase = (Math.abs(rt.driverVariant * 37) % 97) / 97;
          rt.lodAccumulator = phase * lodInterval;
        }
        rt.lodAccumulator += dt;
        if (rt.lodAccumulator < lodInterval) continue;
        const farDt = Math.min(0.28, rt.lodAccumulator);
        rt.lodAccumulator = Math.max(0, rt.lodAccumulator - lodInterval);

        if (committedZone) this.advanceCommittedRouteProgress(rt);
        else this.advanceForwardRouteProgress(rt, pos, 5.0);
        let target = this.routeTarget(rt).clone();
        let dx = target.x - pos.x;
        let dz = target.z - pos.z;
        let dSq = dx * dx + dz * dz;
        let desiredYaw = Math.atan2(dx, dz);
        let yawDiff = this.normaliseAngle(desiredYaw - (v.yaw ?? 0));
        const farDirectionBlockLimit = committedZone ? THREE.MathUtils.degToRad(158) : Math.PI * 0.62;

        // Distant LOD traffic used to rotate toward any missed/behind waypoint with
        // no collision context, which made the most obvious instant U-turns. Rejoin
        // a forward-facing segment; if none is suitable, hold heading instead. A car
        // already committed to a junction gets the same wide forward-turn allowance
        // as nearby traffic so it cannot freeze off-screen inside an intersection.
        if (Math.abs(yawDiff) > farDirectionBlockLimit) {
          if (committedZone) this.advanceCommittedRouteProgress(rt);
          else this.reacquireForwardRouteIndex(rt, pos, v.yaw ?? 0, 38, true);
          if (!committedZone) this.advanceForwardRouteProgress(rt, pos, 5.0);
          target = this.routeTarget(rt).clone();
          dx = target.x - pos.x;
          dz = target.z - pos.z;
          dSq = dx * dx + dz * dz;
          desiredYaw = Math.atan2(dx, dz);
          yawDiff = this.normaliseAngle(desiredYaw - (v.yaw ?? 0));
        }
        const farDirectionBlocked = Math.abs(yawDiff) > farDirectionBlockLimit;
        if (!farDirectionBlocked) {
          v.yaw = (v.yaw ?? 0) + yawDiff * Math.min(1, farDt * 1.8);
        }
        const farFwdX = Math.sin(v.yaw);
        const farFwdZ = Math.cos(v.yaw);
        // Distant traffic still obeys spacing/box-blocking at the low-rate LOD tick.
        // Without this, cars could bunch while far away and reveal a ready-made pile
        // when the player drove back into full simulation range.
        const farSpacing = this.trafficFollowingFactor(rt, pos, farFwdX, farFwdZ);
        const farIntersection = committedZone ? 1 : this.intersectionQueueFactor(rt, pos, farFwdX, farFwdZ, activeVehicle);
        const farTrafficFactor = committedZone && farSpacing >= 0.35
          ? Math.max(0.55, farSpacing)
          : Math.min(farSpacing, farIntersection);
        const farCruise = farDirectionBlocked ? 0 : rt.cruiseSpeed * 0.86 * farTrafficFactor;
        v.speed = THREE.MathUtils.lerp(
          v.speed,
          farCruise,
          Math.min(1, farDt * (farTrafficFactor < 0.55 ? 4.8 : 1.4)),
        );
        this.tempNext.set(
          pos.x + farFwdX * v.speed * farDt,
          pos.y,
          pos.z + farFwdZ * v.speed * farDt,
        );
        if (this.roadVehicleSweepForbidden(v, pos, this.tempNext, v.yaw ?? v.mesh.rotation.y)) {
          // A low-rate LOD step must remain on asphalt for its ENTIRE sweep. Holding
          // and rejoining the authored route is safer than diagonally crossing a curb.
          v.speed = 0;
          rt.reverseRecoveryTimer = 0;
          this.reacquireForwardRouteIndex(rt, pos, v.yaw ?? 0, 42, true);
        } else {
          pos.x = this.tempNext.x;
          pos.z = this.tempNext.z;
        }
        v.mesh.rotation.y = v.yaw;

        // Keep the low-rate car glued to its authored road. Spatially indexed ground
        // lookup makes this one query cheap even in a very large city.
        const farGround = this.collision.getGroundHeightNear(pos.x, pos.z, rt.groundY, rt.groundY, 1.05, 4.5);
        rt.groundY = farGround;
        const farTargetY = farGround + 0.08;
        if (pos.y > farTargetY + 0.14) {
          rt.verticalVelocity = Math.max(-24, rt.verticalVelocity - 24 * farDt);
          pos.y += rt.verticalVelocity * farDt;
          if (pos.y <= farTargetY) { pos.y = farTargetY; rt.verticalVelocity = 0; }
        } else {
          pos.y = farTargetY;
          rt.verticalVelocity = 0;
        }
        if (v.position instanceof THREE.Vector3) v.position.copy(pos);
        continue;
      }
      rt.lodAccumulator = 0;

      const driverHoldingCar = rt.specialHybrid ? false : this.updateDriverLifecycle(rt, dt, now);
      if (driverHoldingCar) continue;
      if (rt.greetingCooldown > 0) rt.greetingCooldown = Math.max(0, rt.greetingCooldown - dt);

      if (committedZone) this.advanceCommittedRouteProgress(rt);
      else this.advanceForwardRouteProgress(rt, pos, 3.8);
      let target = this.offsetRouteTargetForOvertake(rt, this.routeTarget(rt).clone());
      let toTargetX = target.x - pos.x;
      let toTargetZ = target.z - pos.z;
      let distSq = toTargetX * toTargetX + toTargetZ * toTargetZ;
      let desiredYaw = Math.atan2(toTargetX, toTargetZ);
      let diff = this.normaliseAngle(desiredYaw - (v.yaw ?? 0));
      const directionBlockLimit = committedZone ? THREE.MathUtils.degToRad(158) : Math.PI * 0.62;

      // A normal road target must never demand an in-place 180-degree turn. First
      // try to rejoin a nearby segment travelling in the existing forward direction.
      // Inside a committed junction we allow a much wider steering correction because
      // the route is already locked and stopping in the turning box is worse than
      // finishing a temporarily awkward forward arc after a bump/overshoot.
      if (Math.abs(diff) > directionBlockLimit) {
        if (committedZone) {
          // Inside a junction we may skip only already-passed points on the SAME
          // committed route. Never pick a different nearby segment/turn here.
          this.advanceCommittedRouteProgress(rt);
        } else {
          this.reacquireForwardRouteIndex(rt, pos, v.yaw ?? 0, 34, true);
          this.advanceForwardRouteProgress(rt, pos, 3.8);
        }
        target = this.offsetRouteTargetForOvertake(rt, this.routeTarget(rt).clone());
        toTargetX = target.x - pos.x;
        toTargetZ = target.z - pos.z;
        distSq = toTargetX * toTargetX + toTargetZ * toTargetZ;
        desiredYaw = Math.atan2(toTargetX, toTargetZ);
        diff = this.normaliseAngle(desiredYaw - (v.yaw ?? 0));
      }

      const directionBlocked = Math.abs(diff) > directionBlockLimit;
      const steeringRate = committedZone ? 4.5 : rt.recoveryTimer > 0 ? 4.2 : 3.0;
      if (!directionBlocked) {
        v.yaw = (v.yaw ?? 0) + diff * Math.min(1, dt * steeringRate);
      }

      // Slow progressively before sharp corners instead of reaching the corner at full speed.
      const cornerFactor = THREE.MathUtils.clamp(1 - Math.abs(diff) / (Math.PI * 0.82), 0.30, 1);
      let trafficFactor = 1;
      const fwdX = Math.sin(v.yaw);
      const fwdZ = Math.cos(v.yaw);
      // Signals stop cars BEFORE a junction. Once committed, finish clearing it.
      if (!committedZone) trafficFactor *= this.trafficLightFactor(pos, fwdX, fwdZ, now);

      // McQueen behaves like a character, not anonymous traffic: on foot, the player
      // can approach him and he deliberately slows/stops to acknowledge them.
      if (rt.specialHybrid && playerPos && !activeVehicle && playerDistanceSq < 9.0 * 9.0) {
        trafficFactor = Math.min(trafficFactor, THREE.MathUtils.clamp((Math.sqrt(playerDistanceSq) - 3.6) / 3.8, 0, 0.28));
        if (rt.greetingCooldown <= 0 && Math.abs(v.speed) < 2.2 && !this.pendingHybridGreeting) {
          this.pendingHybridGreeting = { name: 'Lightning McQueen', text: 'Ka-chow! Need a ride?' };
          rt.greetingCooldown = 38;
        }
      }

      // Speed-sensitive same-lane headway. Unlike the old fixed 12.5m radius,
      // this starts braking much earlier at speed and reserves extra room for buses.
      let followingFactor = this.trafficFollowingFactor(rt, pos, fwdX, fwdZ);
      // A committed car may gently keep rolling when the car ahead is still moving;
      // a true hard-gap blocker still returns ~0 and remains an emergency stop.
      if (committedZone && followingFactor >= 0.35) followingFactor = Math.max(0.55, followingFactor);
      trafficFactor = Math.min(trafficFactor, followingFactor);

      // Do not enter a junction that is already occupied or whose exit lane is
      // blocked. Cars queue before the turning box instead of filling its centre.
      if (!committedZone) {
        trafficFactor = Math.min(trafficFactor, this.intersectionQueueFactor(rt, pos, fwdX, fwdZ, activeVehicle));
      }

      // Pedestrian/crossing yielding belongs on the APPROACH. Once a car has entered
      // a committed intersection/roundabout/crossing it must clear the box instead of
      // stopping halfway through because somebody is standing near a zebra stripe.
      // The only exception is an unavoidable person literally in the collision path.
      trafficFactor *= committedZone
        ? this.committedPedestrianEmergencyFactor(pos, fwdX, fwdZ, v)
        : this.pedestrianTrafficFactor(pos, fwdX, fwdZ, v, pedestrians);
      if (!activeVehicle && playerPos) {
        const dx = playerPos.x - pos.x;
        const dz = playerPos.z - pos.z;
        const dSq = dx * dx + dz * dz;
        if (committedZone) {
          const footprint = this.trafficFootprint(v);
          const ahead = dx * fwdX + dz * fwdZ;
          const lateral = Math.abs(dx * fwdZ - dz * fwdX);
          if (ahead > -0.6 && ahead < footprint.halfLength + 2.0 && lateral < footprint.halfWidth + 0.8) {
            trafficFactor = 0;
          }
        } else {
          const pedestrianStopRange = (v.type === 'city_bus' ? 20 : 15) + Math.max(0, this.trafficRadius(v) - 1.45) * 1.6;
          if (dSq < pedestrianStopRange * pedestrianStopRange && dSq > 0.0001) {
            const ahead = dx * fwdX + dz * fwdZ;
            const lateral = Math.abs(dx * fwdZ - dz * fwdX);
            if (ahead > -1 && ahead < pedestrianStopRange && lateral < 3.2) {
              trafficFactor = Math.min(trafficFactor, THREE.MathUtils.clamp((ahead - 3.5) / (pedestrianStopRange - 3.5), 0, 1));
            }
          }
        }
      }

      if (activeVehicle) {
        const dx = activeVehicle.mesh.position.x - pos.x;
        const dz = activeVehicle.mesh.position.z - pos.z;
        const longitudinal = dx * fwdX + dz * fwdZ;
        const lateral = Math.abs(dx * fwdZ - dz * fwdX);
        if (longitudinal > 0.2) {
          const ownFootprint = this.trafficFootprint(v);
          const playerFootprint = this.trafficFootprint(activeVehicle);
          const sameLaneWidth = ownFootprint.halfWidth + playerFootprint.halfWidth + 0.75;
          if (lateral < sameLaneWidth) {
            const speed = Math.max(0, v.speed);
            const hardGap = ownFootprint.halfLength + playerFootprint.halfLength + 1.8;
            const desiredGap = hardGap + 4.5 + speed * 0.95;
            const lookAhead = desiredGap + 7.0;
            if (longitudinal <= hardGap) trafficFactor = 0;
            else if (longitudinal < lookAhead) {
              trafficFactor = Math.min(
                trafficFactor,
                THREE.MathUtils.clamp((longitudinal - hardGap) / Math.max(1, lookAhead - hardGap), 0, 1),
              );
            }
          }
        }
      }

      let targetSpeed = directionBlocked ? 0 : rt.cruiseSpeed * cornerFactor * trafficFactor;
      if (committedZone && !directionBlocked && trafficFactor >= 0.35) {
        targetSpeed = Math.max(targetSpeed, Math.min(5.8, rt.cruiseSpeed * 0.42));
      }
      if (rt.accidentTimer > 0) targetSpeed = committedZone ? Math.min(targetSpeed, 2.4) : 0;
      if (!committedZone && rt.reverseRecoveryTimer > 0) targetSpeed = -Math.min(2.4, Math.max(1.4, rt.cruiseSpeed * 0.16));
      if (committedZone) rt.reverseRecoveryTimer = 0;
      if (v.type === 'city_bus') targetSpeed = Math.min(targetSpeed, 11.5);
      v.speed = THREE.MathUtils.lerp(v.speed, targetSpeed, Math.min(1, dt * (trafficFactor < 0.45 ? 6.0 : 2.2)));

      this.tempNext.set(pos.x + fwdX * v.speed * dt, pos.y, pos.z + fwdZ * v.speed * dt);
      const roadBlocked = this.roadVehicleSweepForbidden(v, pos, this.tempNext, v.yaw ?? v.mesh.rotation.y);
      if (roadBlocked) {
        // Asphalt/bridge edges are real navigation boundaries for traffic. Never let
        // recovery turn a curb, sidewalk or grass verge into another drivable lane.
        this.tempNext.copy(pos);
        v.speed = Math.max(0, v.speed * 0.15);
        rt.reverseRecoveryTimer = 0;
        rt.stuckTimer = Math.max(rt.stuckTimer, 1.0);
        if (rt.recoveryTimer <= 0.05) {
          this.reacquireForwardRouteIndex(rt, pos, v.yaw ?? 0, 42, true);
          rt.recoveryTimer = 1.4;
        }
      }
      const footprint = this.trafficFootprint(v);
      const moveStart = collisionPrev;
      const resolved = this.collision.resolveOrientedVehicleCollision(
        pos,
        this.tempNext,
        v.yaw ?? v.mesh.rotation.y,
        footprint.halfWidth,
        footprint.halfLength,
        this.trafficHeight(v),
        undefined,
        true
      );
      if (this.roadVehicleFootprintForbidden(v, resolved.position, v.yaw ?? v.mesh.rotation.y)) {
        // World collision may slide a chassis sideways. If that correction would put
        // its body on the kerb/footpath, keep the last valid road position instead.
        pos.copy(moveStart);
        v.speed = Math.max(0, v.speed * 0.20);
        rt.recoveryTimer = Math.max(rt.recoveryTimer, 0.8);
        rt.reverseRecoveryTimer = 0;
      } else {
        pos.copy(resolved.position);
      }
      committedZone = this.updateJunctionCommit(rt, now);
      if (resolved.collided) {
        if (resolved.travelRatio >= 0.22) {
          // Glancing contact keeps useful road momentum. This lets traffic scrape
          // past kerbs/walls instead of instantly freezing and forming a pile-up.
          v.speed *= THREE.MathUtils.lerp(0.62, 0.88, resolved.travelRatio);
          rt.accidentTimer = Math.max(rt.accidentTimer, 0.12);
          rt.recoveryTimer = Math.max(rt.recoveryTimer, 0.35);
        } else {
          // A collision must NEVER itself flip speed negative. That old response was
          // the direct forward/back/forward loop seen in traffic jams. Stop/slow,
          // keep the same forward route, and let the delayed recovery state decide
          // whether a tiny reverse is genuinely necessary much later on a safe road.
          v.speed = Math.max(0, v.speed * 0.08);
          rt.accidentTimer = committedZone ? 0.18 : 0.35;
          rt.recoveryTimer = Math.max(rt.recoveryTimer, committedZone ? 0.55 : 1.0);
          rt.reverseRecoveryTimer = 0;
        }
      }

      if (!committedZone && this.distanceToRouteTarget(rt) > 45 && rt.recoveryTimer <= 0) {
        // Do not blindly advance to another waypoint: depending on displacement that
        // next target can be behind the car. Re-acquire a nearby forward segment.
        if (this.reacquireForwardRouteIndex(rt, pos, v.yaw ?? 0, 48, true)) {
          rt.recoveryTimer = 1.2;
        }
      }

      // Grounding uses the last VALID road/deck height, never the car's current
      // airborne Y as the fallback. The old current-Y fallback was the source of
      // cars that could remain in the sky forever (and even creep upward by 0.08).
      const sampledGround = this.collision.getGroundHeightNear(pos.x, pos.z, rt.groundY, rt.groundY, 1.05, 4.5);
      rt.groundY = sampledGround;
      const targetY = sampledGround + 0.08;
      if (!Number.isFinite(pos.y) || pos.y > targetY + 30) {
        // Corrupt/spawned sky positions are brought back into a recoverable range.
        pos.y = targetY + 18;
        rt.verticalVelocity = Math.min(rt.verticalVelocity, 0);
      }
      if (pos.y > targetY + 0.14) {
        // Legitimate bumps/impacts may leave a car briefly airborne; gravity owns
        // the return rather than snapping or allowing navigation to drive in mid-air.
        rt.verticalVelocity = Math.max(-24, rt.verticalVelocity - 24 * dt);
        pos.y += rt.verticalVelocity * dt;
        if (pos.y <= targetY) {
          pos.y = targetY;
          rt.verticalVelocity = 0;
        }
      } else {
        rt.verticalVelocity = 0;
        pos.y = Math.abs(pos.y - targetY) < 0.7
          ? THREE.MathUtils.damp(pos.y, targetY, 20, dt)
          : targetY;
      }
      v.mesh.rotation.y = v.yaw;
      // Crash tilt is allowed to be dramatic, but ordinary traffic must naturally
      // settle back onto its wheels instead of keeping an old vertical/roll angle.
      if (Math.abs(pos.y - targetY) < 0.18 && !v.wrecked) {
        v.mesh.rotation.x = THREE.MathUtils.damp(v.mesh.rotation.x, 0, 4.2, dt);
        v.mesh.rotation.z = THREE.MathUtils.damp(v.mesh.rotation.z, 0, 4.2, dt);
      }
      if (rt.specialHybrid) {
        const pupils = v.mesh.userData.mcqueenPupils as THREE.Mesh[] | undefined;
        if (pupils?.length) {
          let lookX = Math.sin(now * 0.8) * 0.012;
          let lookY = Math.sin(now * 1.1) * 0.006;
          if (playerPos && playerDistanceSq < 15 * 15) {
            const dx = playerPos.x - pos.x;
            const dz = playerPos.z - pos.z;
            const rightX = Math.cos(v.yaw ?? 0);
            const rightZ = -Math.sin(v.yaw ?? 0);
            const forwardXLocal = Math.sin(v.yaw ?? 0);
            const forwardZLocal = Math.cos(v.yaw ?? 0);
            const lateral = dx * rightX + dz * rightZ;
            const ahead = dx * forwardXLocal + dz * forwardZLocal;
            lookX = THREE.MathUtils.clamp(lateral * 0.007, -0.045, 0.045);
            lookY = THREE.MathUtils.clamp((ahead - 3) * 0.002, -0.012, 0.018);
          }
          pupils.forEach((pupil) => {
            const baseX = pupil.userData.mcqueenBaseX ?? pupil.position.x;
            const baseY = pupil.userData.mcqueenBaseY ?? pupil.position.y;
            pupil.userData.mcqueenBaseX = baseX;
            pupil.userData.mcqueenBaseY = baseY;
            pupil.position.x = THREE.MathUtils.damp(pupil.position.x, baseX + lookX, 8, dt);
            pupil.position.y = THREE.MathUtils.damp(pupil.position.y, baseY + lookY, 8, dt);
          });
        }
        const mouth = v.mesh.userData.mcqueenMouth as THREE.Object3D | undefined;
        if (mouth) {
          const targetSmile = playerPos && playerDistanceSq < 9 * 9 ? 1.16 : 1;
          mouth.scale.y = THREE.MathUtils.damp(mouth.scale.y, targetSmile, 6, dt);
        }
      }
      if (v.position instanceof THREE.Vector3) v.position.copy(pos);
      this.recoverStuckTraffic(rt, dt, targetSpeed, trafficFactor, playerDistanceSq, directionBlocked);
    }
  }

  public getNearbyVehicle(position: THREE.Vector3, radius: number, allVehicles?: Vehicle[]): Vehicle | null {
    let best: Vehicle | null = null;
    let bestDist = radius;
    for (const v of allVehicles ?? this.vehicles) {
      if (v.inUse) continue;
      const d = position.distanceTo(v.mesh.position);
      if (d < bestDist) {
        best = v;
        bestDist = d;
      }
    }
    return best;
  }
}
