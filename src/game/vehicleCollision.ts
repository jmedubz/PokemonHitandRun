import * as THREE from 'three';

export type VehicleCollisionBody = {
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  yaw: number;
  velocity: THREE.Vector3;
  mass: number;
  halfWidth: number;
  halfLength: number;
};

export type VehicleCollisionResult = {
  positionA: THREE.Vector3;
  positionB: THREE.Vector3;
  velocityA: THREE.Vector3;
  velocityB: THREE.Vector3;
  yawRateA: number;
  yawRateB: number;
  normal: THREE.Vector3;
  contactPoint: THREE.Vector3;
  penetration: number;
  relativeNormalSpeed: number;
  swept: boolean;
  toi: number;
};

type SatContact = {
  normal: THREE.Vector3;
  penetration: number;
  contactPoint: THREE.Vector3;
};

function rightFromYaw(yaw: number) {
  return new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
}

function forwardFromYaw(yaw: number) {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

/** Exact planar OBB-vs-OBB SAT contact for the current chassis orientations. */
function satContact(
  a: VehicleCollisionBody,
  aPos: THREE.Vector3,
  b: VehicleCollisionBody,
  bPos: THREE.Vector3,
): SatContact | null {
  const aRight = rightFromYaw(a.yaw);
  const aForward = forwardFromYaw(a.yaw);
  const bRight = rightFromYaw(b.yaw);
  const bForward = forwardFromYaw(b.yaw);
  const delta = bPos.clone().sub(aPos).setY(0);
  const axes = [aRight, aForward, bRight, bForward];
  let minimumOverlap = Infinity;
  let minimumAxis = aRight;

  for (const axis of axes) {
    const distance = Math.abs(delta.dot(axis));
    const aRadius = a.halfWidth * Math.abs(aRight.dot(axis)) + a.halfLength * Math.abs(aForward.dot(axis));
    const bRadius = b.halfWidth * Math.abs(bRight.dot(axis)) + b.halfLength * Math.abs(bForward.dot(axis));
    const overlap = aRadius + bRadius - distance;
    if (overlap <= 0) return null;
    if (overlap < minimumOverlap) {
      minimumOverlap = overlap;
      minimumAxis = axis;
    }
  }

  const normal = minimumAxis.clone();
  if (delta.dot(normal) < 0) normal.multiplyScalar(-1);

  // Build a contact point on the overlapping faces, not an arbitrary box corner.
  // This is important for torque: a centred rear-end hit should mostly push forward,
  // while a genuine quarter-panel hit should produce a meaningful lever arm/spin.
  const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
  const aNormalRadius = a.halfWidth * Math.abs(aRight.dot(normal)) + a.halfLength * Math.abs(aForward.dot(normal));
  const bNormalRadius = b.halfWidth * Math.abs(bRight.dot(normal)) + b.halfLength * Math.abs(bForward.dot(normal));
  const normalCoord = ((aPos.dot(normal) + aNormalRadius) + (bPos.dot(normal) - bNormalRadius)) * 0.5;
  const aTangentRadius = a.halfWidth * Math.abs(aRight.dot(tangent)) + a.halfLength * Math.abs(aForward.dot(tangent));
  const bTangentRadius = b.halfWidth * Math.abs(bRight.dot(tangent)) + b.halfLength * Math.abs(bForward.dot(tangent));
  const aTangent = aPos.dot(tangent);
  const bTangent = bPos.dot(tangent);
  const overlapMin = Math.max(aTangent - aTangentRadius, bTangent - bTangentRadius);
  const overlapMax = Math.min(aTangent + aTangentRadius, bTangent + bTangentRadius);
  const tangentCoord = overlapMin <= overlapMax ? (overlapMin + overlapMax) * 0.5 : (aTangent + bTangent) * 0.5;
  const contactPoint = normal.clone().multiplyScalar(normalCoord).addScaledVector(tangent, tangentCoord);
  contactPoint.y = Math.max(aPos.y, bPos.y) + 0.55;
  return { normal, penetration: minimumOverlap, contactPoint };
}

function distanceOriginToSegment2D(start: THREE.Vector3, end: THREE.Vector3) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const denom = dx * dx + dz * dz;
  if (denom <= 1e-8) return Math.hypot(start.x, start.z);
  const t = THREE.MathUtils.clamp(-(start.x * dx + start.z * dz) / denom, 0, 1);
  return Math.hypot(start.x + dx * t, start.z + dz * t);
}

function inertia(body: VehicleCollisionBody) {
  // Planar rectangle inertia about Y. Mass is in game-relative tonnes; only ratios
  // matter, so this remains stable across the existing vehicle tuning values.
  return Math.max(0.18, body.mass * (body.halfWidth * body.halfWidth + body.halfLength * body.halfLength) / 3);
}

function torqueY(r: THREE.Vector3, impulse: THREE.Vector3) {
  return r.z * impulse.x - r.x * impulse.z;
}

/**
 * Swept, momentum-based arcade collision for two road-vehicle oriented boxes.
 *
 * The broad phase works in relative motion. Only pairs whose swept bounding circles
 * can meet run the OBB samples. At high speed the pair is stepped at sub-chassis
 * intervals and the first contact is binary-refined, preventing a car from crossing
 * completely through another between frames without making normal bumps rubbery.
 */
export function solveVehicleCollision(
  a: VehicleCollisionBody,
  b: VehicleCollisionBody,
): VehicleCollisionResult | null {
  const radiusA = Math.hypot(a.halfWidth, a.halfLength);
  const radiusB = Math.hypot(b.halfWidth, b.halfLength);
  const relStart = b.previousPosition.clone().sub(a.previousPosition).setY(0);
  const relEnd = b.position.clone().sub(a.position).setY(0);
  if (distanceOriginToSegment2D(relStart, relEnd) > radiusA + radiusB + 0.35) return null;

  let contact = satContact(a, a.position, b, b.position);
  let swept = false;
  let toi = 1;
  let contactAPos = a.position.clone();
  let contactBPos = b.position.clone();

  if (!contact) {
    const aTravel = a.position.clone().sub(a.previousPosition).setY(0);
    const bTravel = b.position.clone().sub(b.previousPosition).setY(0);
    const relativeTravel = aTravel.sub(bTravel).length();
    if (relativeTravel <= 0.02) return null;

    const narrowStep = Math.max(0.22, Math.min(a.halfWidth, b.halfWidth) * 0.40);
    const steps = THREE.MathUtils.clamp(Math.ceil(relativeTravel / narrowStep), 2, 36);
    let previousT = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const aPos = a.previousPosition.clone().lerp(a.position, t);
      const bPos = b.previousPosition.clone().lerp(b.position, t);
      const candidate = satContact(a, aPos, b, bPos);
      if (!candidate) {
        previousT = t;
        continue;
      }

      // Refine the first contact so a 100+ km/h hit does not visibly rewind by a
      // whole coarse substep. Four iterations are plenty at this game scale.
      let lo = previousT;
      let hi = t;
      let refined = candidate;
      for (let pass = 0; pass < 4; pass++) {
        const mid = (lo + hi) * 0.5;
        const midA = a.previousPosition.clone().lerp(a.position, mid);
        const midB = b.previousPosition.clone().lerp(b.position, mid);
        const midContact = satContact(a, midA, b, midB);
        if (midContact) {
          hi = mid;
          refined = midContact;
        } else lo = mid;
      }
      toi = hi;
      contactAPos = a.previousPosition.clone().lerp(a.position, toi);
      contactBPos = b.previousPosition.clone().lerp(b.position, toi);
      contact = satContact(a, contactAPos, b, contactBPos) ?? refined;
      swept = true;
      break;
    }
    if (!contact) return null;
  }

  const normal = contact.normal.clone().normalize();
  const velocityA = a.velocity.clone().setY(0);
  const velocityB = b.velocity.clone().setY(0);
  const relativeVelocity = velocityA.clone().sub(velocityB);
  const closingSpeed = relativeVelocity.dot(normal);

  const massA = Math.max(0.45, a.mass);
  const massB = Math.max(0.45, b.mass);
  const invA = 1 / massA;
  const invB = 1 / massB;
  const inertiaA = inertia({ ...a, mass: massA });
  const inertiaB = inertia({ ...b, mass: massB });

  const rA = contact.contactPoint.clone().sub(contactAPos).setY(0);
  const rB = contact.contactPoint.clone().sub(contactBPos).setY(0);
  const rnA = torqueY(rA, normal);
  const rnB = torqueY(rB, normal);
  const rotationalDenom = rnA * rnA / inertiaA + rnB * rnB / inertiaB;

  let yawRateA = 0;
  let yawRateB = 0;
  if (closingSpeed > 0.03) {
    // Almost-inelastic at parking speeds; a little more rebound only for genuinely
    // hard impacts. This is enough to read as a crash without rubber-car bouncing.
    const restitution = THREE.MathUtils.lerp(0.025, 0.115, THREE.MathUtils.clamp((closingSpeed - 3) / 38, 0, 1));
    const impulseMagnitude = (closingSpeed * (1 + restitution)) / Math.max(0.05, invA + invB + rotationalDenom);
    const normalImpulse = normal.clone().multiplyScalar(impulseMagnitude);
    velocityA.addScaledVector(normalImpulse, -invA);
    velocityB.addScaledVector(normalImpulse, invB);

    yawRateA += THREE.MathUtils.clamp(-torqueY(rA, normalImpulse) / inertiaA, -2.7, 2.7);
    yawRateB += THREE.MathUtils.clamp(torqueY(rB, normalImpulse) / inertiaB, -2.7, 2.7);

    // Coulomb-ish tangential impulse. It removes excessive sideways skating while
    // retaining enough scrub for quarter-panel impacts to rotate the struck car.
    const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
    const relativeTangentSpeed = velocityA.clone().sub(velocityB).dot(tangent);
    const rtA = torqueY(rA, tangent);
    const rtB = torqueY(rB, tangent);
    const tangentDenom = Math.max(0.05, invA + invB + rtA * rtA / inertiaA + rtB * rtB / inertiaB);
    const rawTangentImpulse = relativeTangentSpeed / tangentDenom;
    const maxFrictionImpulse = impulseMagnitude * 0.34;
    const tangentMagnitude = THREE.MathUtils.clamp(rawTangentImpulse, -maxFrictionImpulse, maxFrictionImpulse);
    const tangentImpulse = tangent.multiplyScalar(tangentMagnitude);
    velocityA.addScaledVector(tangentImpulse, -invA);
    velocityB.addScaledVector(tangentImpulse, invB);
    yawRateA += THREE.MathUtils.clamp(-torqueY(rA, tangentImpulse) / inertiaA, -1.2, 1.2);
    yawRateB += THREE.MathUtils.clamp(torqueY(rB, tangentImpulse) / inertiaB, -1.2, 1.2);
  }

  // At a swept hit, positions return to the time-of-impact rather than staying on
  // opposite sides of each other. For an existing overlap, separate only the actual
  // penetration and distribute it according to inverse mass.
  const positionA = contactAPos.clone();
  const positionB = contactBPos.clone();
  const penetration = Math.max(0, contact.penetration);
  const correction = Math.max(0, penetration - 0.012) * 0.88 + (swept ? 0.016 : 0);
  if (correction > 0) {
    const totalInv = invA + invB;
    positionA.addScaledVector(normal, -correction * (invA / totalInv));
    positionB.addScaledVector(normal, correction * (invB / totalInv));
  }

  // Clamp only pathological impulses. Ordinary 100 km/h impacts retain enough
  // momentum to shove/spin the other car; this cap only prevents chain explosions.
  const maxPostSpeed = Math.max(18, Math.max(a.velocity.length(), b.velocity.length()) * 1.08 + 3.5);
  if (velocityA.length() > maxPostSpeed) velocityA.setLength(maxPostSpeed);
  if (velocityB.length() > maxPostSpeed) velocityB.setLength(maxPostSpeed);

  return {
    positionA,
    positionB,
    velocityA,
    velocityB,
    yawRateA: THREE.MathUtils.clamp(yawRateA, -3.0, 3.0),
    yawRateB: THREE.MathUtils.clamp(yawRateB, -3.0, 3.0),
    normal,
    contactPoint: contact.contactPoint.clone(),
    penetration,
    relativeNormalSpeed: Math.max(0, closingSpeed),
    swept,
    toi,
  };
}
