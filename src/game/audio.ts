// Web Audio API Synthesizer with 3D Positional & Spatial World Audio for Simpsons Hit & Run x Pokemon
export interface Vec3Like {
  x: number;
  y?: number;
  z: number;
}

export interface BoundingBox3D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
}

// Major authored enterable interiors in the world for realistic acoustic wall attenuation
export const BUILDING_INTERIORS: Record<string, BoundingBox3D> = {
  simpsonsHouse: { minX: -260, maxX: -230, minZ: -125, maxZ: -95, minY: 0, maxY: 8 },
  moesTavern: { minX: -210, maxX: -180, minZ: -45, maxZ: -20, minY: 0, maxY: 6 },
  kwikEMart: { minX: -190, maxX: -155, minZ: 40, maxZ: 75, minY: 0, maxY: 6 },
  policeStation: { minX: -285, maxX: -245, minZ: 60, maxZ: 100, minY: 0, maxY: 7 },
  arcadeBuilding: { minX: -25, maxX: 35, minZ: -245, maxZ: -185, minY: 0, maxY: 14 },
  goldenrodDeptStore: { minX: 185, maxX: 235, minZ: 30, maxZ: 85, minY: 0, maxY: 18 },
  pokemonCenter: { minX: 220, maxX: 265, minZ: -30, maxZ: 15, minY: 0, maxY: 9 },
  pokemonGym: { minX: 150, maxX: 195, minZ: -75, maxZ: -30, minY: 0, maxY: 9 },
  magnetTrainStation: { minX: 225, maxX: 255, minZ: -120, maxZ: -100, minY: 0, maxY: 9 },
  airportTerminal: { minX: -110, maxX: 110, minZ: -560, maxZ: -460, minY: 0, maxY: 16 },
};

export function isPositionInsideBuilding(pos: Vec3Like): boolean {
  const y = pos.y ?? 1;
  for (const b of Object.values(BUILDING_INTERIORS)) {
    if (
      pos.x >= b.minX &&
      pos.x <= b.maxX &&
      pos.z >= b.minZ &&
      pos.z <= b.maxZ &&
      (b.minY === undefined || y >= b.minY - 0.5) &&
      (b.maxY === undefined || y <= b.maxY + 0.5)
    ) {
      return true;
    }
  }
  return false;
}

export type SoundCategory =
  | 'ui'
  | 'music'
  | 'speech'
  | 'footstep'
  | 'impact'
  | 'door'
  | 'water'
  | 'horn'
  | 'car'
  | 'crash'
  | 'power'
  | 'siren'
  | 'train'
  | 'aircraft'
  | 'volcano'
  | 'ocean';

export interface AttenuationProfile {
  refDistance: number;
  maxDistance: number;
  rolloff: number;
}

export const ATTENUATION_PROFILES: Record<SoundCategory, AttenuationProfile> = {
  ui: { refDistance: 1000, maxDistance: 2000, rolloff: 0 },
  music: { refDistance: 1000, maxDistance: 2000, rolloff: 0 },
  speech: { refDistance: 2.5, maxDistance: 32, rolloff: 1.25 },
  footstep: { refDistance: 1.5, maxDistance: 22, rolloff: 1.4 },
  impact: { refDistance: 3.0, maxDistance: 50, rolloff: 1.2 },
  door: { refDistance: 3.5, maxDistance: 42, rolloff: 1.2 },
  water: { refDistance: 4.0, maxDistance: 55, rolloff: 1.2 },
  horn: { refDistance: 8.0, maxDistance: 120, rolloff: 1.0 },
  car: { refDistance: 6.0, maxDistance: 95, rolloff: 1.0 },
  crash: { refDistance: 10.0, maxDistance: 170, rolloff: 0.95 },
  power: { refDistance: 9.0, maxDistance: 150, rolloff: 1.0 },
  siren: { refDistance: 12.0, maxDistance: 230, rolloff: 0.88 },
  train: { refDistance: 16.0, maxDistance: 280, rolloff: 0.82 },
  aircraft: { refDistance: 22.0, maxDistance: 360, rolloff: 0.78 },
  volcano: { refDistance: 25.0, maxDistance: 320, rolloff: 0.75 },
  ocean: { refDistance: 14.0, maxDistance: 150, rolloff: 0.88 },
};

export interface SpatialTransform {
  gain: number;
  pan: number;
  lowpassHz: number;
  isAudible: boolean;
  distance: number;
}

interface TrafficVoice {
  osc: OscillatorNode | null;
  subOsc: OscillatorNode | null;
  gain: GainNode | null;
  filter: BiquadFilterNode | null;
  panner: StereoPannerNode | null;
  active: boolean;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Player Vehicle Engine
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private enginePanner: StereoPannerNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  // Police Siren & Pursuit Cruiser Engine
  private sirenOsc1: OscillatorNode | null = null;
  private sirenOsc2: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private policeEngineGain: GainNode | null = null;
  private sirenPanner: StereoPannerNode | null = null;
  private sirenFilter: BiquadFilterNode | null = null;

  // Fountain Ambience
  private fountainSource: AudioBufferSourceNode | null = null;
  private fountainFilter: BiquadFilterNode | null = null;
  private fountainGain: GainNode | null = null;
  private fountainPanner: StereoPannerNode | null = null;

  // Volcano Seismic Rumble Ambience
  private volcanoOsc: OscillatorNode | null = null;
  private volcanoNoise: AudioBufferSourceNode | null = null;
  private volcanoGain: GainNode | null = null;
  private volcanoFilter: BiquadFilterNode | null = null;
  private volcanoPanner: StereoPannerNode | null = null;

  // Shoreline / River Water Ambience
  private waterSource: AudioBufferSourceNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;
  private waterPanner: StereoPannerNode | null = null;

  // Airport Ambience
  private airportSource: AudioBufferSourceNode | null = null;
  private airportFilter: BiquadFilterNode | null = null;
  private airportGain: GainNode | null = null;
  private airportPanner: StereoPannerNode | null = null;

  // Magnet Train Rail Audio
  private trainOsc1: OscillatorNode | null = null;
  private trainOsc2: OscillatorNode | null = null;
  private trainGain: GainNode | null = null;
  private trainFilter: BiquadFilterNode | null = null;
  private trainPanner: StereoPannerNode | null = null;

  // Aircraft Overhead Audio
  private aircraftOsc1: OscillatorNode | null = null;
  private aircraftOsc2: OscillatorNode | null = null;
  private aircraftNoise: AudioBufferSourceNode | null = null;
  private aircraftGain: GainNode | null = null;
  private aircraftFilter: BiquadFilterNode | null = null;
  private aircraftPanner: StereoPannerNode | null = null;

  // Traffic Car Engine Voices Pool (up to 3 closest vehicles)
  private trafficVoices: TrafficVoice[] = [];

  // Music state
  private isMusicPlaying = false;
  private musicTimer: number | null = null;

  // Arcade Isolation State
  public isArcadeActive = false;
  public enabled = true;

  // 3D Listener State (defaults to origin)
  private listenerPos: Vec3Like = { x: 0, y: 1.6, z: 0 };
  private listenerForward: Vec3Like = { x: 0, y: 0, z: -1 };
  private listenerRight: Vec3Like = { x: 1, y: 0, z: 0 };
  private listenerIndoors = false;

  private init() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.isArcadeActive ? 0 : 0.22;
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.isArcadeActive ? 0 : 0.45;
      this.sfxGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** Unlock WebAudio from a real user gesture so passive ambience can run later. */
  unlock() {
    if (!this.enabled || this.isArcadeActive) return;
    this.init();
  }

  /**
   * Safe helper to create a StereoPannerNode with fallback if not supported.
   */
  /**
   * Safe helper to set an AudioParam target value using setTargetAtTime.
   * Guarantees values are finite and valid, catching any Web Audio exceptions
   * so invalid or transient physics values can never crash the game loop.
   */
  private safeSetTargetAtTime(
    param: AudioParam | null | undefined,
    target: number,
    startTime: number,
    timeConstant: number,
    fallbackTarget: number = 0
  ) {
    if (!param) return;
    const safeTarget = Number.isFinite(target) ? target : fallbackTarget;
    const safeStart = Number.isFinite(startTime) && startTime >= 0 ? startTime : (this.ctx?.currentTime ?? 0);
    const safeTc = Number.isFinite(timeConstant) && timeConstant > 0 ? timeConstant : 0.05;
    try {
      param.setTargetAtTime(safeTarget, safeStart, safeTc);
    } catch {
      // Non-fatal: prevents Web Audio parameter boundary errors from breaking the animation frame
    }
  }

  private createPannerNode(): StereoPannerNode | null {
    if (!this.ctx) return null;
    if (typeof this.ctx.createStereoPanner === 'function') {
      return this.ctx.createStereoPanner();
    }
    return null;
  }

  /**
   * Updates listener position and orientation vectors every frame from the active camera.
   */
  updateListener(position: Vec3Like, forward: Vec3Like, right: Vec3Like) {
    const px = Number.isFinite(position?.x) ? position.x : 0;
    const py = Number.isFinite(position?.y) ? position.y : 1.6;
    const pz = Number.isFinite(position?.z) ? position.z : 0;
    this.listenerPos = { x: px, y: py, z: pz };

    let fx = Number.isFinite(forward?.x) ? forward.x : 0;
    let fy = Number.isFinite(forward?.y) ? forward.y : 0;
    let fz = Number.isFinite(forward?.z) ? forward.z : -1;
    const fLen = Math.hypot(fx, fy, fz);
    if (fLen > 0.0001) {
      fx /= fLen;
      fy /= fLen;
      fz /= fLen;
    } else {
      fx = 0;
      fy = 0;
      fz = -1;
    }
    this.listenerForward = { x: fx, y: fy, z: fz };

    let rx = Number.isFinite(right?.x) ? right.x : 1;
    let ry = Number.isFinite(right?.y) ? right.y : 0;
    let rz = Number.isFinite(right?.z) ? right.z : 0;
    const rLen = Math.hypot(rx, ry, rz);
    if (rLen > 0.0001) {
      rx /= rLen;
      ry /= rLen;
      rz /= rLen;
    } else {
      rx = 1;
      ry = 0;
      rz = 0;
    }
    this.listenerRight = { x: rx, y: ry, z: rz };
    this.listenerIndoors = isPositionInsideBuilding(this.listenerPos);
  }

  /**
   * Computes high-performance 3D spatial properties (gain, pan, air absorption lowpass,
   * behind-head occlusion, interior building wall attenuation).
   */
  computeSpatialTransform(sourcePos: Vec3Like, category: SoundCategory = 'impact'): SpatialTransform {
    if (category === 'ui' || category === 'music') {
      return { gain: 1, pan: 0, lowpassHz: 20000, isAudible: true, distance: 0 };
    }

    const sx = Number.isFinite(sourcePos?.x) ? sourcePos.x : 0;
    const sy = Number.isFinite(sourcePos?.y) ? sourcePos.y : 1.0;
    const sz = Number.isFinite(sourcePos?.z) ? sourcePos.z : 0;

    const lx = Number.isFinite(this.listenerPos?.x) ? this.listenerPos.x : 0;
    const ly = Number.isFinite(this.listenerPos?.y) ? this.listenerPos.y : 1.6;
    const lz = Number.isFinite(this.listenerPos?.z) ? this.listenerPos.z : 0;

    const dx = sx - lx;
    const dy = sy - ly;
    const dz = sz - lz;
    let distance = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(distance)) {
      return { gain: 0, pan: 0, lowpassHz: 20000, isAudible: false, distance: 9999 };
    }

    const profile = ATTENUATION_PROFILES[category] || ATTENUATION_PROFILES.impact;
    if (distance > profile.maxDistance) {
      return { gain: 0, pan: 0, lowpassHz: 20000, isAudible: false, distance };
    }

    // Distance attenuation with smooth cosine rolloff
    let distanceGain = 1.0;
    const denom = profile.maxDistance - profile.refDistance;
    if (distance > profile.refDistance && denom > 0.001) {
      const norm = Math.max(0, Math.min(1, (distance - profile.refDistance) / denom));
      distanceGain = Math.pow(Math.cos(norm * Math.PI * 0.5), profile.rolloff);
    }
    if (!Number.isFinite(distanceGain) || distanceGain < 0) distanceGain = 0;

    const Rx = Number.isFinite(this.listenerRight?.x) ? this.listenerRight.x : 1;
    const Ry = Number.isFinite(this.listenerRight?.y) ? this.listenerRight.y : 0;
    const Rz = Number.isFinite(this.listenerRight?.z) ? this.listenerRight.z : 0;
    const Fx = Number.isFinite(this.listenerForward?.x) ? this.listenerForward.x : 0;
    const Fy = Number.isFinite(this.listenerForward?.y) ? this.listenerForward.y : 0;
    const Fz = Number.isFinite(this.listenerForward?.z) ? this.listenerForward.z : -1;

    // Horizontal panning relative to listener ear orientation
    const rightDist = dx * Rx + dy * Ry + dz * Rz;
    const fwdDist = dx * Fx + dy * Fy + dz * Fz;
    const horizDist = Math.hypot(rightDist, fwdDist);
    let pan = 0;
    if (Number.isFinite(horizDist) && horizDist > 0.05 && Number.isFinite(rightDist)) {
      pan = Math.max(-1, Math.min(1, rightDist / horizDist));
    }
    if (!Number.isFinite(pan)) pan = 0;

    // Behind-the-listener acoustic head shadow (pinna absorption)
    let behindGain = 1.0;
    let behindCutoff = 20000;
    if (fwdDist < 0 && horizDist > 0.1) {
      const behindRatio = Math.max(0, Math.min(1, -fwdDist / horizDist));
      behindGain = 1.0 - behindRatio * 0.22; // 0.78x to 1.0x volume behind
      behindCutoff = 20000 - behindRatio * 16400; // drops down to ~3600Hz
    }

    // High frequency air absorption over distance
    const distRatio = profile.maxDistance > 0 ? Math.max(0, Math.min(1, distance / profile.maxDistance)) : 0;
    const airCutoff = Math.max(1600, 20000 - distRatio * 14000);

    // Interior vs Outdoor acoustic occlusion
    const sourceIndoors = isPositionInsideBuilding({ x: sx, y: sy, z: sz });
    let wallGain = 1.0;
    let wallCutoff = 20000;
    if (this.listenerIndoors !== sourceIndoors) {
      wallGain = this.listenerIndoors ? 0.26 : 0.35;
      wallCutoff = this.listenerIndoors ? 950 : 1200;
    }

    let finalGain = distanceGain * behindGain * wallGain;
    if (!Number.isFinite(finalGain) || finalGain < 0) finalGain = 0;
    finalGain = Math.max(0, Math.min(1, finalGain));

    let finalCutoff = Math.min(behindCutoff, airCutoff, wallCutoff);
    if (!Number.isFinite(finalCutoff) || finalCutoff < 20) finalCutoff = 20000;
    finalCutoff = Math.max(20, Math.min(20000, finalCutoff));

    const isAudible = finalGain > 0.003;

    return {
      gain: finalGain,
      pan,
      lowpassHz: finalCutoff,
      isAudible,
      distance,
    };
  }

  /**
   * Helper to create a spatialized audio output node chain:
   * Source -> GainNode -> BiquadFilterNode -> StereoPannerNode -> sfxGain
   * Returns null if inaudible or arcade mode is active.
   */
  private createSpatialOutput(
    position?: Vec3Like,
    category: SoundCategory = 'impact',
    baseVolume = 1.0
  ): {
    input: AudioNode;
    cleanup: (stopTime: number) => void;
  } | null {
    if (this.isArcadeActive || !this.enabled) return null;
    this.init();
    if (!this.ctx || !this.sfxGain) return null;

    if (!position) {
      // Non-positional or centered sound
      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(baseVolume, this.ctx.currentTime);
      gainNode.connect(this.sfxGain);
      const cleanup = (stopTime: number) => {
        const delay = Math.max(0, (stopTime - this.ctx!.currentTime) * 1000) + 50;
        window.setTimeout(() => {
          try { gainNode.disconnect(); } catch {}
        }, delay);
      };
      return { input: gainNode, cleanup };
    }

    const spatial = this.computeSpatialTransform(position, category);
    if (!spatial.isAudible) return null;

    const t = this.ctx.currentTime;
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(spatial.gain * baseVolume, t);

    const filterNode = this.ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(spatial.lowpassHz, t);

    const pannerNode = this.createPannerNode();
    gainNode.connect(filterNode);

    if (pannerNode) {
      pannerNode.pan.setValueAtTime(spatial.pan, t);
      filterNode.connect(pannerNode);
      pannerNode.connect(this.sfxGain);
    } else {
      filterNode.connect(this.sfxGain);
    }

    const cleanup = (stopTime: number) => {
      const delay = Math.max(0, (stopTime - this.ctx!.currentTime) * 1000) + 60;
      window.setTimeout(() => {
        try { gainNode.disconnect(); } catch {}
        try { filterNode.disconnect(); } catch {}
        try { pannerNode?.disconnect(); } catch {}
      }, delay);
    };

    return { input: gainNode, cleanup };
  }

  // ==========================================
  // ARCADE ISOLATION CONTROL
  // ==========================================

  setArcadeMode(active: boolean) {
    this.isArcadeActive = active;
    if (active) {
      // Instantly silence all main game audio so ONLY the arcade machine audio is heard
      if (this.ctx) {
        const now = this.ctx.currentTime;
        if (this.sfxGain) this.safeSetTargetAtTime(this.sfxGain.gain, 0, now, 0.02);
        if (this.musicGain) this.safeSetTargetAtTime(this.musicGain.gain, 0, now, 0.02);
      }
      this.stopEngine();
      this.setSiren(false);
      this.stopMusic();
      this.stopFountainAmbience();
      this.silenceContinuousAmbient();
    } else {
      // Restore normal main game volume
      if (this.ctx && this.enabled) {
        const now = this.ctx.currentTime;
        if (this.sfxGain) this.safeSetTargetAtTime(this.sfxGain.gain, 0.45, now, 0.08);
        if (this.musicGain) this.safeSetTargetAtTime(this.musicGain.gain, 0.22, now, 0.08);
      }
    }
  }

  silenceContinuousAmbient() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Silence traffic voices
    for (const v of this.trafficVoices) {
      if (v.gain) this.safeSetTargetAtTime(v.gain.gain, 0, now, 0.05);
    }
    // Silence aircraft
    if (this.aircraftGain) this.safeSetTargetAtTime(this.aircraftGain.gain, 0, now, 0.05);
    // Silence train
    if (this.trainGain) this.safeSetTargetAtTime(this.trainGain.gain, 0, now, 0.05);
    // Silence volcano
    if (this.volcanoGain) this.safeSetTargetAtTime(this.volcanoGain.gain, 0, now, 0.05);
    // Silence water
    if (this.waterGain) this.safeSetTargetAtTime(this.waterGain.gain, 0, now, 0.05);
    // Silence airport
    if (this.airportGain) this.safeSetTargetAtTime(this.airportGain.gain, 0, now, 0.05);
  }

  // ==========================================
  // POSITIONAL SOUND EFFECTS
  // ==========================================

  // Cartoon kick punch impact
  playKick(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'impact', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.connect(gain);
    gain.connect(chain.input);
    osc.start(t);
    osc.stop(t + 0.2);

    const slap = this.ctx.createOscillator();
    const slapGain = this.ctx.createGain();
    slap.type = 'sawtooth';
    slap.frequency.setValueAtTime(800, t);
    slap.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    slapGain.gain.setValueAtTime(0.4, t);
    slapGain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
    slap.connect(slapGain);
    slapGain.connect(chain.input);
    slap.start(t);
    slap.stop(t + 0.09);

    chain.cleanup(t + 0.22);
  }

  // Water Gun squirt sound
  playWaterSquirt(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'water', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.12);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
    osc.connect(gain);
    gain.connect(chain.input);
    osc.start(t);
    osc.stop(t + 0.14);

    chain.cleanup(t + 0.16);
  }

  // Tree growth magic harp chime
  playTreeSprout(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'power', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.25, t + idx * 0.05 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.4);
      osc.connect(gain);
      gain.connect(chain.input);
      osc.start(t + idx * 0.05);
      osc.stop(t + idx * 0.05 + 0.45);
    });

    chain.cleanup(t + 0.8);
  }

  // Crash into prop/car
  playCrash(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'crash', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.35);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    osc.connect(gain);
    gain.connect(chain.input);
    osc.start(t);
    osc.stop(t + 0.4);

    chain.cleanup(t + 0.42);
  }

  // Original arcade-style vehicle horns with 3D positioning
  playVehicleHorn(vehicleType = 'civilian_sedan', position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'horn', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const type = vehicleType.toLowerCase();
    const isBus = type.includes('bus');
    const isExotic = type.includes('aventador') || type.includes('f12');
    const isBmw = type.includes('bmw_');
    const isCartoonClassic = type.includes('pink') || type.includes('family_sedan') || type.includes('peppa_family_car');
    const isSpeedRocket = type.includes('speed_rocket');
    const isCanyonero = type.includes('canyonero');
    const isMrPlow = type.includes('mr_plow');
    const isHomerConcept = type.includes('car_built_for_homer');
    const isPolice = type.includes('police');
    const isMcQueen = type.includes('lightning_mcqueen');

    if (isHomerConcept) {
      const notes = [294, 370, 440, 330];
      notes.forEach((freq, index) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = index % 2 === 0 ? 'square' : 'triangle';
        osc.frequency.setValueAtTime(freq, t + index * 0.09);
        gain.gain.setValueAtTime(0.001, t + index * 0.09);
        gain.gain.linearRampToValueAtTime(0.20, t + index * 0.09 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.01, t + index * 0.09 + 0.12);
        osc.connect(gain);
        gain.connect(chain.input);
        osc.start(t + index * 0.09);
        osc.stop(t + index * 0.09 + 0.13);
      });
      chain.cleanup(t + 0.5);
      return;
    }

    if (isSpeedRocket) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(720, t);
      osc.frequency.exponentialRampToValueAtTime(1040, t + 0.12);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc.connect(gain);
      gain.connect(chain.input);
      osc.start(t);
      osc.stop(t + 0.19);
      chain.cleanup(t + 0.22);
      return;
    }

    if (isCanyonero || isMrPlow) {
      const freqs = isCanyonero ? [142, 178] : [168, 212];
      freqs.forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(isCanyonero ? 0.36 : 0.31, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, t + (isCanyonero ? 0.50 : 0.40));
        osc.connect(gain);
        gain.connect(chain.input);
        osc.start(t);
        osc.stop(t + (isCanyonero ? 0.52 : 0.42));
      });
      chain.cleanup(t + 0.55);
      return;
    }

    if (isCartoonClassic) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(235, t);
      osc.frequency.exponentialRampToValueAtTime(365, t + 0.16);
      osc.frequency.exponentialRampToValueAtTime(275, t + 0.34);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.34, t + 0.025);
      gain.gain.setValueAtTime(0.34, t + 0.26);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.42);
      osc.connect(gain);
      gain.connect(chain.input);
      osc.start(t);
      osc.stop(t + 0.44);
      chain.cleanup(t + 0.48);
      return;
    }

    const frequencies = isBus
      ? [185, 233]
      : isPolice
      ? [392, 494]
      : isMcQueen
      ? [523, 659]
      : isExotic
      ? [466, 587]
      : isBmw
      ? [415, 523]
      : [349, 440];
    const duration = isBus ? 0.46 : isPolice ? 0.28 : isMcQueen ? 0.22 : isExotic ? 0.24 : 0.32;
    const level = isBus ? 0.34 : isMcQueen ? 0.24 : 0.26;

    frequencies.forEach((freq, index) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = isExotic ? 'square' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * (index === 0 ? 0.985 : 1.01), t + duration * 0.72);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(level, t + 0.018);
      gain.gain.setValueAtTime(level, t + duration * 0.70);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
      osc.connect(gain);
      gain.connect(chain.input);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    });

    chain.cleanup(t + duration + 0.06);
  }

  playHorn(position?: Vec3Like) {
    this.playVehicleHorn('civilian_sedan', position);
  }

  playPowerEffect(
    kind: 'web' | 'energyBlade' | 'force' | 'repulsor' | 'ice' | 'dash' | 'energy',
    position?: Vec3Like
  ) {
    const chain = this.createSpatialOutput(position, 'power', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const tone = (
      type: OscillatorType,
      startHz: number,
      endHz: number,
      duration: number,
      gainLevel: number,
      delay = 0
    ) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, startHz), t + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), t + delay + duration);
      gain.gain.setValueAtTime(0.001, t + delay);
      gain.gain.linearRampToValueAtTime(gainLevel, t + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + duration);
      osc.connect(gain);
      gain.connect(chain.input);
      osc.start(t + delay);
      osc.stop(t + delay + duration + 0.02);
    };

    if (kind === 'web') {
      tone('triangle', 920, 180, 0.14, 0.28);
      tone('sine', 1400, 320, 0.08, 0.18, 0.02);
      chain.cleanup(t + 0.2);
    } else if (kind === 'energyBlade') {
      tone('sawtooth', 340, 720, 0.18, 0.22);
      tone('sine', 680, 1440, 0.12, 0.14, 0.03);
      chain.cleanup(t + 0.25);
    } else if (kind === 'force') {
      tone('sine', 160, 48, 0.32, 0.40);
      tone('triangle', 220, 75, 0.24, 0.22, 0.04);
      chain.cleanup(t + 0.38);
    } else if (kind === 'repulsor') {
      tone('square', 240, 880, 0.09, 0.16);
      tone('sine', 880, 220, 0.18, 0.32, 0.07);
      chain.cleanup(t + 0.3);
    } else if (kind === 'ice') {
      tone('sine', 1200, 1680, 0.12, 0.16);
      tone('triangle', 980, 420, 0.22, 0.24, 0.05);
      chain.cleanup(t + 0.32);
    } else if (kind === 'dash') {
      tone('triangle', 180, 480, 0.12, 0.24);
      tone('sine', 360, 720, 0.10, 0.16, 0.02);
      chain.cleanup(t + 0.18);
    } else {
      tone('sawtooth', 220, 440, 0.20, 0.24);
      tone('sine', 440, 880, 0.16, 0.18, 0.04);
      chain.cleanup(t + 0.26);
    }
  }

  playBrainrotEffect(
    kind: 'tung' | 'dance' | 'ninja' | 'fly' | 'weird',
    position?: Vec3Like
  ) {
    const chain = this.createSpatialOutput(position, 'speech', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const playChirp = (type: OscillatorType, f1: number, f2: number, dur: number, vol: number, offset = 0) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f1, t + offset);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + offset + dur);
      gain.gain.setValueAtTime(0.001, t + offset);
      gain.gain.linearRampToValueAtTime(vol, t + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + dur);
      osc.connect(gain);
      gain.connect(chain.input);
      osc.start(t + offset);
      osc.stop(t + offset + dur + 0.02);
    };

    if (kind === 'tung') {
      playChirp('triangle', 180, 85, 0.12, 0.35, 0);
      playChirp('sine', 340, 120, 0.16, 0.25, 0.08);
      chain.cleanup(t + 0.3);
    } else if (kind === 'dance') {
      [261, 329, 392, 523].forEach((f, i) => {
        playChirp('square', f, f * 1.05, 0.08, 0.16, i * 0.09);
      });
      chain.cleanup(t + 0.45);
    } else if (kind === 'ninja') {
      playChirp('sawtooth', 620, 190, 0.09, 0.22, 0);
      playChirp('triangle', 240, 520, 0.12, 0.25, 0.07);
      chain.cleanup(t + 0.25);
    } else if (kind === 'fly') {
      playChirp('sawtooth', 140, 280, 0.22, 0.18, 0);
      playChirp('sine', 280, 560, 0.18, 0.15, 0.06);
      chain.cleanup(t + 0.3);
    } else {
      playChirp('triangle', 420, 160, 0.15, 0.28, 0);
      playChirp('sine', 210, 840, 0.18, 0.22, 0.1);
      chain.cleanup(t + 0.35);
    }
  }

  playTireScreech(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'car', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.linearRampToValueAtTime(1200, t + 0.15);
    osc.frequency.linearRampToValueAtTime(600, t + 0.3);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.connect(gain);
    gain.connect(chain.input);
    osc.start(t);
    osc.stop(t + 0.3);

    chain.cleanup(t + 0.32);
  }

  playThunder(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'crash', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    osc.connect(gain);
    gain.connect(chain.input);
    osc.start(t);
    osc.stop(t + 0.35);

    chain.cleanup(t + 0.38);
  }

  playFlamethrower(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'power', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.linearRampToValueAtTime(80, t + 0.25);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.28);
    osc.connect(gain);
    gain.connect(chain.input);
    osc.start(t);
    osc.stop(t + 0.3);

    chain.cleanup(t + 0.32);
  }

  playGroundSlam(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'crash', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.45);
    gain.gain.setValueAtTime(0.95, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc.connect(gain);
    gain.connect(chain.input);
    osc.start(t);
    osc.stop(t + 0.5);

    chain.cleanup(t + 0.52);
  }

  playNitrous(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'car', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.4);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
    osc.connect(gain);
    gain.connect(chain.input);
    osc.start(t);
    osc.stop(t + 0.45);

    chain.cleanup(t + 0.48);
  }

  playDoor(position?: Vec3Like) {
    const chain = this.createSpatialOutput(position, 'door', 1.0);
    if (!chain || !this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, t);
    osc.frequency.exponentialRampToValueAtTime(820, t + 0.12);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
    osc.connect(gain);
    gain.connect(chain.input);
    osc.start(t);
    osc.stop(t + 0.22);

    chain.cleanup(t + 0.25);
  }

  // ==========================================
  // CONTINUOUS MOVING VEHICLE AUDIO
  // ==========================================

  // Player Vehicle Engine
  setEngineSound(active: boolean, speedNorm: number, position?: Vec3Like) {
    if (this.isArcadeActive || !this.enabled) {
      if (this.engineGain) {
        this.safeSetTargetAtTime(this.engineGain.gain, 0, this.ctx?.currentTime ?? 0, 0.05);
      }
      return;
    }
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    const safeSpeedNorm = Number.isFinite(speedNorm) ? Math.max(0, Math.min(1.5, speedNorm)) : 0;

    if (active) {
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 20000;
        this.enginePanner = this.createPannerNode();

        this.engineOsc.type = 'triangle';
        this.engineOsc.frequency.value = 55;
        this.engineGain.gain.value = 0.08;

        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.engineFilter);
        if (this.enginePanner) {
          this.engineFilter.connect(this.enginePanner);
          this.enginePanner.connect(this.sfxGain);
        } else {
          this.engineFilter.connect(this.sfxGain);
        }
        this.engineOsc.start();
      }

      const targetFreq = 50 + safeSpeedNorm * 180;
      this.safeSetTargetAtTime(this.engineOsc.frequency, targetFreq, now, 0.05, 55);

      if (position) {
        const spatial = this.computeSpatialTransform(position, 'car');
        const targetVol = (0.06 + safeSpeedNorm * 0.12) * spatial.gain;
        this.safeSetTargetAtTime(this.engineGain!.gain, targetVol, now, 0.05, 0.08);
        if (this.enginePanner) {
          this.safeSetTargetAtTime(this.enginePanner.pan, spatial.pan, now, 0.05, 0);
        }
        this.safeSetTargetAtTime(this.engineFilter!.frequency, spatial.lowpassHz, now, 0.05, 20000);
      } else {
        this.safeSetTargetAtTime(this.engineGain!.gain, 0.06 + safeSpeedNorm * 0.12, now, 0.05, 0.08);
      }
    } else {
      if (this.engineGain) {
        this.safeSetTargetAtTime(this.engineGain.gain, 0, now, 0.08, 0);
      }
    }
  }

  playEngine(speed: number, maxSpeed = 40, position?: Vec3Like) {
    const s = Number.isFinite(speed) ? Math.abs(speed) : 0;
    const ms = Number.isFinite(maxSpeed) && maxSpeed > 0 ? maxSpeed : 40;
    const norm = Math.max(0, Math.min(1, s / ms));
    this.setEngineSound(true, norm, position);
  }

  stopEngine() {
    this.setEngineSound(false, 0);
  }

  // Nearby Traffic Cars Engine Audio Pool (Simulates the 3 closest cars within 85m)
  updateTrafficAudio(vehicles: Array<{ position: Vec3Like; speed: number; maxSpeed?: number }>) {
    if (this.isArcadeActive || !this.enabled || !this.ctx || !this.sfxGain) {
      this.silenceTrafficVoices();
      return;
    }

    // Initialize traffic voice pool if needed
    if (this.trafficVoices.length === 0) {
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx.createOscillator();
        const subOsc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const panner = this.createPannerNode();

        osc.type = 'triangle';
        osc.frequency.value = 45;
        subOsc.type = 'sawtooth';
        subOsc.frequency.value = 24;

        gain.gain.value = 0;

        osc.connect(gain);
        subOsc.connect(gain);
        gain.connect(filter);
        if (panner) {
          filter.connect(panner);
          panner.connect(this.sfxGain);
        } else {
          filter.connect(this.sfxGain);
        }

        osc.start();
        subOsc.start();

        this.trafficVoices.push({ osc, subOsc, gain, filter, panner, active: false });
      }
    }

    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    const candidates = vehicles
      .map((v) => {
        const spatial = this.computeSpatialTransform(v.position, 'car');
        return { vehicle: v, spatial };
      })
      .filter((c) => c.spatial.isAudible && c.spatial.distance < 85 && Math.abs(c.vehicle.speed) > 0.4)
      .sort((a, b) => a.spatial.distance - b.spatial.distance)
      .slice(0, 3);

    for (let i = 0; i < this.trafficVoices.length; i++) {
      const voice = this.trafficVoices[i];
      if (i < candidates.length) {
        const item = candidates[i];
        const spd = Number.isFinite(item.vehicle.speed) ? Math.abs(item.vehicle.speed) : 0;
        const maxSpd = Number.isFinite(item.vehicle.maxSpeed) && item.vehicle.maxSpeed! > 0 ? item.vehicle.maxSpeed! : 25;
        const spdNorm = Math.min(1, spd / maxSpd);
        const freq = 42 + spdNorm * 115;
        const targetGain = (0.02 + spdNorm * 0.05) * item.spatial.gain;

        this.safeSetTargetAtTime(voice.osc!.frequency, freq, now, 0.06, 42);
        this.safeSetTargetAtTime(voice.subOsc!.frequency, freq * 0.5, now, 0.06, 21);
        this.safeSetTargetAtTime(voice.gain!.gain, targetGain, now, 0.08, 0);
        if (voice.panner) {
          this.safeSetTargetAtTime(voice.panner.pan, item.spatial.pan, now, 0.06, 0);
        }
        this.safeSetTargetAtTime(voice.filter!.frequency, item.spatial.lowpassHz, now, 0.06, 20000);
        voice.active = true;
      } else {
        if (voice.active && voice.gain) {
          this.safeSetTargetAtTime(voice.gain.gain, 0, now, 0.12, 0);
          voice.active = false;
        }
      }
    }
  }

  private silenceTrafficVoices() {
    if (!this.ctx) return;
    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    for (const v of this.trafficVoices) {
      if (v.gain) this.safeSetTargetAtTime(v.gain.gain, 0, now, 0.05, 0);
      v.active = false;
    }
  }

  // ==========================================
  // POLICE SIREN WITH 3D SPATIAL PANNING
  // ==========================================

  setSiren(active: boolean, policePosition?: Vec3Like) {
    if (this.isArcadeActive || !this.enabled) {
      if (this.sirenGain) this.sirenGain.gain.value = 0;
      if (this.policeEngineGain) this.policeEngineGain.gain.value = 0;
      return;
    }
    this.init();
    if (!this.ctx || !this.sfxGain) return;

    if (active) {
      if (!this.sirenOsc1) {
        this.sirenOsc1 = this.ctx.createOscillator();
        this.sirenOsc2 = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.policeEngineGain = this.ctx.createGain();
        this.sirenFilter = this.ctx.createBiquadFilter();
        this.sirenFilter.type = 'lowpass';
        this.sirenPanner = this.createPannerNode();

        this.sirenOsc1.type = 'triangle';
        this.sirenOsc1.frequency.value = 360;
        this.sirenOsc2.type = 'sawtooth';
        this.sirenOsc2.frequency.value = 62;
        this.sirenGain.gain.value = 0.001;
        this.policeEngineGain.gain.value = 0.001;

        this.sirenOsc1.connect(this.sirenGain);
        this.sirenOsc2.connect(this.policeEngineGain);

        this.sirenGain.connect(this.sirenFilter);
        this.policeEngineGain.connect(this.sirenFilter);

        if (this.sirenPanner) {
          this.sirenFilter.connect(this.sirenPanner);
          this.sirenPanner.connect(this.sfxGain);
        } else {
          this.sirenFilter.connect(this.sfxGain);
        }

        this.sirenOsc1.start();
        this.sirenOsc2.start();
      }

      const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
      const sweep = (Math.sin(now * 4.1) + 1) * 0.5;
      this.safeSetTargetAtTime(this.sirenOsc1.frequency, 325 + sweep * 165, now, 0.055, 360);
      this.safeSetTargetAtTime(this.sirenOsc2!.frequency, 58 + sweep * 20, now, 0.09, 62);

      if (policePosition) {
        const spatial = this.computeSpatialTransform(policePosition, 'siren');
        const sirenVol = 0.07 * spatial.gain;
        const engineVol = 0.025 * spatial.gain;
        this.safeSetTargetAtTime(this.sirenGain!.gain, sirenVol, now, 0.08, 0);
        this.safeSetTargetAtTime(this.policeEngineGain!.gain, engineVol, now, 0.1, 0);
        if (this.sirenPanner) {
          this.safeSetTargetAtTime(this.sirenPanner.pan, spatial.pan, now, 0.06, 0);
        }
        this.safeSetTargetAtTime(this.sirenFilter!.frequency, spatial.lowpassHz, now, 0.06, 20000);
      } else {
        this.safeSetTargetAtTime(this.sirenGain!.gain, 0.060, now, 0.12, 0);
        this.safeSetTargetAtTime(this.policeEngineGain!.gain, 0.020, now, 0.16, 0);
      }
    } else {
      const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
      if (this.sirenGain) this.safeSetTargetAtTime(this.sirenGain.gain, 0, now, 0.12, 0);
      if (this.policeEngineGain) this.safeSetTargetAtTime(this.policeEngineGain.gain, 0, now, 0.16, 0);
    }
  }

  // ==========================================
  // AIRCRAFT ENGINE AUDIO (DOPPLER & OVERHEAD)
  // ==========================================

  updateAircraftAudio(
    aircraftList: Array<{ position: Vec3Like; speed: number; maxSpeed: number; inFlight: boolean }>
  ) {
    if (this.isArcadeActive || !this.enabled || !this.ctx || !this.sfxGain) {
      if (this.aircraftGain) this.safeSetTargetAtTime(this.aircraftGain.gain, 0, this.ctx?.currentTime ?? 0, 0.08, 0);
      return;
    }

    const activePlanes = aircraftList
      .filter((p) => p.inFlight || p.speed > 8)
      .map((p) => ({ plane: p, spatial: this.computeSpatialTransform(p.position, 'aircraft') }))
      .filter((item) => item.spatial.isAudible && item.spatial.distance < 360)
      .sort((a, b) => a.spatial.distance - b.spatial.distance);

    if (activePlanes.length === 0) {
      if (this.aircraftGain) this.safeSetTargetAtTime(this.aircraftGain.gain, 0, this.ctx.currentTime, 0.15, 0);
      return;
    }

    const nearest = activePlanes[0];
    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;

    if (!this.aircraftOsc1) {
      this.aircraftOsc1 = this.ctx.createOscillator();
      this.aircraftOsc2 = this.ctx.createOscillator();
      this.aircraftGain = this.ctx.createGain();
      this.aircraftFilter = this.ctx.createBiquadFilter();
      this.aircraftFilter.type = 'lowpass';
      this.aircraftPanner = this.createPannerNode();

      this.aircraftOsc1.type = 'triangle';
      this.aircraftOsc1.frequency.value = 68;
      this.aircraftOsc2.type = 'sawtooth';
      this.aircraftOsc2.frequency.value = 136;
      this.aircraftGain.gain.value = 0;

      this.aircraftOsc1.connect(this.aircraftGain);
      this.aircraftOsc2.connect(this.aircraftGain);
      this.aircraftGain.connect(this.aircraftFilter);

      if (this.aircraftPanner) {
        this.aircraftFilter.connect(this.aircraftPanner);
        this.aircraftPanner.connect(this.sfxGain);
      } else {
        this.aircraftFilter.connect(this.sfxGain);
      }

      this.aircraftOsc1.start();
      this.aircraftOsc2.start();
    }

    const spd = Number.isFinite(nearest.plane.speed) ? nearest.plane.speed : 0;
    const maxSpd = Number.isFinite(nearest.plane.maxSpeed) && nearest.plane.maxSpeed > 0 ? nearest.plane.maxSpeed : 80;
    const spdNorm = Math.min(1, Math.max(0, spd / maxSpd));
    const baseFreq = 58 + spdNorm * 65;
    this.safeSetTargetAtTime(this.aircraftOsc1.frequency, baseFreq, now, 0.08, 68);
    this.safeSetTargetAtTime(this.aircraftOsc2!.frequency, baseFreq * 2.02, now, 0.08, 136);

    const targetGain = (0.05 + spdNorm * 0.07) * nearest.spatial.gain;
    this.safeSetTargetAtTime(this.aircraftGain!.gain, targetGain, now, 0.1, 0);
    if (this.aircraftPanner) {
      this.safeSetTargetAtTime(this.aircraftPanner.pan, nearest.spatial.pan, now, 0.08, 0);
    }
    this.safeSetTargetAtTime(this.aircraftFilter!.frequency, nearest.spatial.lowpassHz, now, 0.08, 20000);
  }

  // ==========================================
  // MAGNET TRAIN RAIL AUDIO
  // ==========================================

  updateTrainAudio(position: Vec3Like, isMoving: boolean) {
    if (this.isArcadeActive || !this.enabled || !this.ctx || !this.sfxGain) {
      if (this.trainGain) this.safeSetTargetAtTime(this.trainGain.gain, 0, this.ctx?.currentTime ?? 0, 0.08, 0);
      return;
    }

    const spatial = this.computeSpatialTransform(position, 'train');
    if (!isMoving || !spatial.isAudible || spatial.distance > 280) {
      if (this.trainGain) this.safeSetTargetAtTime(this.trainGain.gain, 0, this.ctx.currentTime, 0.15, 0);
      return;
    }

    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    if (!this.trainOsc1) {
      this.trainOsc1 = this.ctx.createOscillator();
      this.trainOsc2 = this.ctx.createOscillator();
      this.trainGain = this.ctx.createGain();
      this.trainFilter = this.ctx.createBiquadFilter();
      this.trainFilter.type = 'lowpass';
      this.trainPanner = this.createPannerNode();

      this.trainOsc1.type = 'sine';
      this.trainOsc1.frequency.value = 72;
      this.trainOsc2.type = 'triangle';
      this.trainOsc2.frequency.value = 144;
      this.trainGain.gain.value = 0;

      this.trainOsc1.connect(this.trainGain);
      this.trainOsc2.connect(this.trainGain);
      this.trainGain.connect(this.trainFilter);

      if (this.trainPanner) {
        this.trainFilter.connect(this.trainPanner);
        this.trainPanner.connect(this.sfxGain);
      } else {
        this.trainFilter.connect(this.sfxGain);
      }

      this.trainOsc1.start();
      this.trainOsc2.start();
    }

    const trainVol = 0.09 * spatial.gain;
    this.safeSetTargetAtTime(this.trainGain!.gain, trainVol, now, 0.1, 0);
    if (this.trainPanner) {
      this.safeSetTargetAtTime(this.trainPanner.pan, spatial.pan, now, 0.08, 0);
    }
    this.safeSetTargetAtTime(this.trainFilter!.frequency, spatial.lowpassHz, now, 0.08, 20000);
  }

  // ==========================================
  // ENVIRONMENTAL AMBIENCE
  // ==========================================

  // Pokémon Center Fountain Ambience
  setFountainAmbience(distance: number, fountainPos?: Vec3Like) {
    if (this.isArcadeActive || !this.enabled || !this.ctx || !this.sfxGain) {
      if (this.fountainGain && this.ctx) this.safeSetTargetAtTime(this.fountainGain.gain, 0, this.ctx.currentTime, 0.16, 0);
      return;
    }

    const spatial = fountainPos ? this.computeSpatialTransform(fountainPos, 'water') : null;
    const maxDistance = 38;
    const safeDist = Number.isFinite(distance) ? distance : 999;
    const proximity = Math.max(0, Math.min(1, 1 - safeDist / maxDistance));
    const targetVolume = (spatial ? spatial.gain : proximity * proximity) * 0.16;

    if (!this.fountainSource && targetVolume > 0.002) {
      const duration = 1.75;
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      let smoothed = 0;
      for (let i = 0; i < samples.length; i++) {
        const white = Math.random() * 2 - 1;
        smoothed = smoothed * 0.86 + white * 0.14;
        samples[i] = smoothed * 0.88 + white * 0.12;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 920;
      filter.Q.value = 0.42;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const panner = this.createPannerNode();

      source.connect(filter);
      filter.connect(gain);
      if (panner) {
        gain.connect(panner);
        panner.connect(this.sfxGain);
      } else {
        gain.connect(this.sfxGain);
      }
      source.start();

      this.fountainSource = source;
      this.fountainFilter = filter;
      this.fountainGain = gain;
      this.fountainPanner = panner;
    }

    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    if (this.fountainGain) {
      this.safeSetTargetAtTime(this.fountainGain.gain, targetVolume, now, targetVolume > 0 ? 0.18 : 0.28, 0);
      if (this.fountainPanner && spatial) {
        this.safeSetTargetAtTime(this.fountainPanner.pan, spatial.pan, now, 0.1, 0);
      }
    }
  }

  stopFountainAmbience() {
    if (this.fountainGain && this.ctx) {
      this.fountainGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.fountainGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    if (this.fountainSource) {
      try { this.fountainSource.stop(); } catch {}
      try { this.fountainSource.disconnect(); } catch {}
    }
    if (this.fountainFilter) {
      try { this.fountainFilter.disconnect(); } catch {}
    }
    if (this.fountainPanner) {
      try { this.fountainPanner.disconnect(); } catch {}
    }
    if (this.fountainGain) {
      try { this.fountainGain.disconnect(); } catch {}
    }
    this.fountainSource = null;
    this.fountainFilter = null;
    this.fountainGain = null;
    this.fountainPanner = null;
  }

  // Western Volcano Deep Seismic Magma Rumble Ambience
  setVolcanoAmbience(distanceToVolcano: number, volcanoPos?: Vec3Like) {
    if (this.isArcadeActive || !this.enabled || !this.ctx || !this.sfxGain) {
      if (this.volcanoGain && this.ctx) this.safeSetTargetAtTime(this.volcanoGain.gain, 0, this.ctx.currentTime, 0.16, 0);
      return;
    }

    const spatial = volcanoPos ? this.computeSpatialTransform(volcanoPos, 'volcano') : null;
    const maxDist = 320;
    const safeDist = Number.isFinite(distanceToVolcano) ? distanceToVolcano : 999;
    const proximity = Math.max(0, Math.min(1, 1 - safeDist / maxDist));
    const targetVol = (spatial ? spatial.gain : proximity * proximity) * 0.18;

    if (!this.volcanoOsc && targetVol > 0.002) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      const panner = this.createPannerNode();

      osc.type = 'triangle';
      osc.frequency.value = 42;

      filter.type = 'lowpass';
      filter.frequency.value = 160;

      gain.gain.value = 0;

      osc.connect(filter);
      filter.connect(gain);
      if (panner) {
        gain.connect(panner);
        panner.connect(this.sfxGain);
      } else {
        gain.connect(this.sfxGain);
      }
      osc.start();

      this.volcanoOsc = osc;
      this.volcanoFilter = filter;
      this.volcanoGain = gain;
      this.volcanoPanner = panner;
    }

    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    if (this.volcanoGain) {
      this.safeSetTargetAtTime(this.volcanoGain.gain, targetVol, now, 0.2, 0);
      if (this.volcanoPanner && spatial) {
        this.safeSetTargetAtTime(this.volcanoPanner.pan, spatial.pan, now, 0.15, 0);
      }
    }
  }

  // Water Shoreline / River Flow Ambience
  setWaterShoreAmbience(distanceToWater: number, waterPos?: Vec3Like | null) {
    if (this.isArcadeActive || !this.enabled || !this.ctx || !this.sfxGain) {
      if (this.waterGain && this.ctx) this.safeSetTargetAtTime(this.waterGain.gain, 0, this.ctx.currentTime, 0.16, 0);
      return;
    }

    const spatial = waterPos ? this.computeSpatialTransform(waterPos, 'ocean') : null;
    const maxDist = 48;
    const safeDist = Number.isFinite(distanceToWater) ? distanceToWater : 999;
    const proximity = Math.max(0, Math.min(1, 1 - safeDist / maxDist));
    const targetVol = (spatial ? spatial.gain : proximity * proximity) * 0.12;

    if (!this.waterSource && targetVol > 0.002) {
      const duration = 2.0;
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      let smooth = 0;
      for (let i = 0; i < samples.length; i++) {
        const white = Math.random() * 2 - 1;
        smooth = smooth * 0.92 + white * 0.08;
        samples[i] = smooth;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 450;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const panner = this.createPannerNode();

      source.connect(filter);
      filter.connect(gain);
      if (panner) {
        gain.connect(panner);
        panner.connect(this.sfxGain);
      } else {
        gain.connect(this.sfxGain);
      }
      source.start();

      this.waterSource = source;
      this.waterFilter = filter;
      this.waterGain = gain;
      this.waterPanner = panner;
    }

    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    if (this.waterGain) {
      this.safeSetTargetAtTime(this.waterGain.gain, targetVol, now, 0.2, 0);
      if (this.waterPanner && spatial) {
        this.safeSetTargetAtTime(this.waterPanner.pan, spatial.pan, now, 0.15, 0);
      }
    }
  }

  // Airport Terminal / Tarmac Airside Ambience
  setAirportAmbience(distanceToAirport: number, airportPos?: Vec3Like) {
    if (this.isArcadeActive || !this.enabled || !this.ctx || !this.sfxGain) {
      if (this.airportGain && this.ctx) this.safeSetTargetAtTime(this.airportGain.gain, 0, this.ctx.currentTime, 0.16, 0);
      return;
    }

    const spatial = airportPos ? this.computeSpatialTransform(airportPos, 'aircraft') : null;
    const maxDist = 240;
    const safeDist = Number.isFinite(distanceToAirport) ? distanceToAirport : 999;
    const proximity = Math.max(0, Math.min(1, 1 - safeDist / maxDist));
    const targetVol = (spatial ? spatial.gain : proximity * proximity) * 0.10;

    if (!this.airportSource && targetVol > 0.002) {
      const duration = 2.0;
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      let smooth = 0;
      for (let i = 0; i < samples.length; i++) {
        const white = Math.random() * 2 - 1;
        smooth = smooth * 0.94 + white * 0.06;
        samples[i] = smooth;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 850;
      filter.Q.value = 1.2;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const panner = this.createPannerNode();

      source.connect(filter);
      filter.connect(gain);
      if (panner) {
        gain.connect(panner);
        panner.connect(this.sfxGain);
      } else {
        gain.connect(this.sfxGain);
      }
      source.start();

      this.airportSource = source;
      this.airportFilter = filter;
      this.airportGain = gain;
      this.airportPanner = panner;
    }

    const now = Number.isFinite(this.ctx.currentTime) ? this.ctx.currentTime : 0;
    if (this.airportGain) {
      this.safeSetTargetAtTime(this.airportGain.gain, targetVol, now, 0.25, 0);
      if (this.airportPanner && spatial) {
        this.safeSetTargetAtTime(this.airportPanner.pan, spatial.pan, now, 0.15, 0);
      }
    }
  }

  // ==========================================
  // NON-POSITIONAL / UI / MUSIC (PRESERVED 2D)
  // ==========================================

  // Original HIT & RUN trigger stinger
  playHitAndRunAlert() {
    if (this.isArcadeActive || !this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const notes = [360, 470, 360, 520, 400, 560];

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = i % 2 === 0 ? 'square' : 'sawtooth';
      const at = t + i * 0.11;
      osc.frequency.setValueAtTime(freq, at);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.82, at + 0.10);
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.linearRampToValueAtTime(0.14, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.01, at + 0.105);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(at);
      osc.stop(at + 0.12);
    });

    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(92, t);
    thump.frequency.exponentialRampToValueAtTime(36, t + 0.65);
    thumpGain.gain.setValueAtTime(0.42, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);
    thump.connect(thumpGain);
    thumpGain.connect(this.sfxGain);
    thump.start(t);
    thump.stop(t + 0.72);
  }

  // Coin / Donut pickup
  playCoin() {
    if (this.isArcadeActive || !this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t);
    osc.frequency.setValueAtTime(1318.51, t + 0.08);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Busted sound
  playBusted() {
    if (this.isArcadeActive || !this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.linearRampToValueAtTime(70, t + 0.6);
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.7);
  }

  // Pokemon battle victory fanfare
  playVictory() {
    if (this.isArcadeActive || !this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const melody = [
      { f: 523.25, d: 0.12 },
      { f: 523.25, d: 0.12 },
      { f: 523.25, d: 0.12 },
      { f: 523.25, d: 0.3 },
      { f: 415.3, d: 0.3 },
      { f: 466.16, d: 0.3 },
      { f: 523.25, d: 0.4 },
    ];
    let offset = 0;
    melody.forEach((note) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = note.f;
      gain.gain.setValueAtTime(0.3, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, t + offset + note.d);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + offset);
      osc.stop(t + offset + note.d);
      offset += note.d * 0.9;
    });
  }

  // Simpsons Hit & Run funky music loop
  startMusic() {
    if (this.isArcadeActive || !this.enabled || this.isMusicPlaying) return;
    this.init();
    this.isMusicPlaying = true;
    const bassNotes = [110, 110, 130.81, 146.83, 110, 164.81, 146.83, 130.81];
    let step = 0;
    const playBeat = () => {
      if (this.isArcadeActive || !this.isMusicPlaying || !this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;
      const freq = bassNotes[step % bassNotes.length];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.22);

      if (step % 2 === 1) {
        const snare = this.ctx.createOscillator();
        const snareGain = this.ctx.createGain();
        snare.type = 'sine';
        snare.frequency.setValueAtTime(300, t);
        snare.frequency.exponentialRampToValueAtTime(80, t + 0.08);
        snareGain.gain.setValueAtTime(0.15, t);
        snareGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
        snare.connect(snareGain);
        snareGain.connect(this.musicGain);
        snare.start(t);
        snare.stop(t + 0.09);
      }
      step++;
      this.musicTimer = window.setTimeout(playBeat, 240);
    };
    playBeat();
  }

  stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  toggleMusic() {
    if (this.isMusicPlaying) {
      this.stopMusic();
    } else {
      this.startMusic();
    }
  }

  // ==========================================
  // CLEANUP & LIFECYCLE
  // ==========================================

  cleanup() {
    this.stopMusic();
    this.stopFountainAmbience();
    this.silenceContinuousAmbient();
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch {}
      this.engineOsc = null;
    }
    if (this.sirenOsc1) {
      try { this.sirenOsc1.stop(); } catch {}
      this.sirenOsc1 = null;
    }
    if (this.sirenOsc2) {
      try { this.sirenOsc2.stop(); } catch {}
      this.sirenOsc2 = null;
    }
    this.sirenGain = null;
    this.policeEngineGain = null;
  }

  toggleMute(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopMusic();
      this.stopEngine();
      this.setSiren(false);
      this.stopFountainAmbience();
      this.silenceContinuousAmbient();
    }
    return !this.enabled;
  }
}

export const soundManager = new SoundManager();

export function playSoundEffect(type: string, position?: Vec3Like) {
  if (type === 'kick') soundManager.playKick(position);
  else if (type === 'water') soundManager.playWaterSquirt(position);
  else if (type === 'tree' || type === 'treeGrow') soundManager.playTreeSprout(position);
  else if (type === 'crash') soundManager.playCrash(position);
  else if (type === 'horn') soundManager.playVehicleHorn('civilian_sedan', position);
  else if (type === 'siren') soundManager.setSiren(true, position);
  else if (type === 'screech') soundManager.playTireScreech(position);
  else if (type === 'coin' || type === 'click') soundManager.playCoin();
  else if (type === 'busted') soundManager.playBusted();
  else if (type === 'hitRun') soundManager.playHitAndRunAlert();
  else if (type === 'victory' || type === 'fanfare') soundManager.playVictory();
  else if (type === 'thunder') soundManager.playThunder(position);
  else if (type === 'fire') soundManager.playFlamethrower(position);
  else if (type === 'slam') soundManager.playGroundSlam(position);
  else if (type === 'nitro' || type === 'engineStart') soundManager.playNitrous(position);
  else if (type === 'door' || type === 'doorOpen') soundManager.playDoor(position);
  else if (type === 'jump') soundManager.playKick(position);
  else if (type === 'doubleJump') soundManager.playPowerEffect('dash', position);
  else if (type === 'stomp') soundManager.playGroundSlam(position);
  else if (type === 'powerWeb') soundManager.playPowerEffect('web', position);
  else if (type === 'powerBlade') soundManager.playPowerEffect('energyBlade', position);
  else if (type === 'powerForce') soundManager.playPowerEffect('force', position);
  else if (type === 'powerRepulsor') soundManager.playPowerEffect('repulsor', position);
  else if (type === 'powerIce') soundManager.playPowerEffect('ice', position);
  else if (type === 'powerDash') soundManager.playPowerEffect('dash', position);
  else if (type === 'powerEnergy') soundManager.playPowerEffect('energy', position);
  else if (type === 'brainrotTung') soundManager.playBrainrotEffect('tung', position);
  else if (type === 'brainrotDance') soundManager.playBrainrotEffect('dance', position);
  else if (type === 'brainrotNinja') soundManager.playBrainrotEffect('ninja', position);
  else if (type === 'brainrotFly') soundManager.playBrainrotEffect('fly', position);
  else if (type === 'brainrotWeird') soundManager.playBrainrotEffect('weird', position);
  else if (type === 'impact') soundManager.playKick(position);
}
