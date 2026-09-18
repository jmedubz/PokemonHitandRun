// Web Audio API Synthesizer for Simpsons Hit & Run x Pokemon sound effects and music
class SoundManager {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private sirenOsc1: OscillatorNode | null = null;
  private sirenOsc2: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private policeEngineGain: GainNode | null = null;
  private fountainSource: AudioBufferSourceNode | null = null;
  private fountainFilter: BiquadFilterNode | null = null;
  private fountainGain: GainNode | null = null;
  private isMusicPlaying = false;
  private musicTimer: number | null = null;
  public enabled = true;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.45;
      this.sfxGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** Unlock WebAudio from a real user gesture so passive ambience can run later. */
  unlock() {
    if (!this.enabled) return;
    this.init();
  }

  // Cartoon kick punch impact
  playKick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    // Punch snap noise
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.2);

    // Add high slap snap
    const slap = this.ctx.createOscillator();
    const slapGain = this.ctx.createGain();
    slap.type = 'sawtooth';
    slap.frequency.setValueAtTime(800, t);
    slap.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    slapGain.gain.setValueAtTime(0.4, t);
    slapGain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
    slap.connect(slapGain);
    slapGain.connect(this.sfxGain);
    slap.start(t);
    slap.stop(t + 0.09);
  }

  // Water Gun squirt sound for Poliway
  playWaterSquirt() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.12);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  // Tree growth magic harp chime
  playTreeSprout() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
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
      gain.connect(this.sfxGain!);
      osc.start(t + idx * 0.05);
      osc.stop(t + idx * 0.05 + 0.45);
    });
  }

  // Crash into prop/car
  playCrash() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.35);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  // Original arcade-style vehicle horns. Everything is synthesized locally with
  // Web Audio, so the game gets playful Hit-&-Run-style feedback without shipping
  // or copying copyrighted horn recordings.
  playVehicleHorn(vehicleType = 'civilian_sedan') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;

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

    // Simpsons bonus cars each get an original synthesized personality. These are
    // broad arcade horn archetypes, not copied samples or transcriptions from the show/game.
    if (isHomerConcept) {
      const notes = [294, 370, 440, 330];
      notes.forEach((freq, index) => {
        const osc=this.ctx!.createOscillator(); const gain=this.ctx!.createGain();
        osc.type=index%2===0?'square':'triangle'; osc.frequency.setValueAtTime(freq,t+index*0.09);
        gain.gain.setValueAtTime(0.001,t+index*0.09); gain.gain.linearRampToValueAtTime(0.20,t+index*0.09+0.012); gain.gain.exponentialRampToValueAtTime(0.01,t+index*0.09+0.12);
        osc.connect(gain); gain.connect(this.sfxGain!); osc.start(t+index*0.09); osc.stop(t+index*0.09+0.13);
      });
      return;
    }
    if (isSpeedRocket) {
      const osc=this.ctx.createOscillator(); const gain=this.ctx.createGain(); osc.type='square';
      osc.frequency.setValueAtTime(720,t); osc.frequency.exponentialRampToValueAtTime(1040,t+0.12);
      gain.gain.setValueAtTime(0.001,t); gain.gain.linearRampToValueAtTime(0.18,t+0.015); gain.gain.exponentialRampToValueAtTime(0.01,t+0.18);
      osc.connect(gain); gain.connect(this.sfxGain); osc.start(t); osc.stop(t+0.19); return;
    }
    if (isCanyonero || isMrPlow) {
      const freqs=isCanyonero?[142,178]:[168,212];
      freqs.forEach((freq,index)=>{const osc=this.ctx!.createOscillator();const gain=this.ctx!.createGain();osc.type='sawtooth';osc.frequency.setValueAtTime(freq,t);gain.gain.setValueAtTime(0.001,t);gain.gain.linearRampToValueAtTime(isCanyonero?0.36:0.31,t+0.02);gain.gain.exponentialRampToValueAtTime(0.01,t+(isCanyonero?0.50:0.40));osc.connect(gain);gain.connect(this.sfxGain!);osc.start(t);osc.stop(t+(isCanyonero?0.52:0.42));});
      return;
    }

    // The Family Sedan gets a short rising old-cartoon horn gesture; other
    // vehicles use distinct original dual-tone horn voicings.
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
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.44);
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
      // Tiny detune/settle gives the horn character without turning it into a siren.
      osc.frequency.exponentialRampToValueAtTime(freq * (index === 0 ? 0.985 : 1.01), t + duration * 0.72);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(level, t + 0.018);
      gain.gain.setValueAtTime(level, t + duration * 0.70);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    });
  }

  playHorn() {
    this.playVehicleHorn('civilian_sedan');
  }

  // Original synthesized character-power sounds. These deliberately evoke broad
  // categories (web snap, energy blade, telekinetic pulse, suit blast) without
  // copying any film/game recordings or exact signature sound design.
  playPowerEffect(kind: 'web' | 'energyBlade' | 'force' | 'repulsor' | 'ice' | 'dash' | 'energy') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const tone = (type: OscillatorType, startHz: number, endHz: number, duration: number, gainLevel: number, delay = 0) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, startHz), t + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), t + delay + duration);
      gain.gain.setValueAtTime(0.001, t + delay);
      gain.gain.linearRampToValueAtTime(gainLevel, t + delay + Math.min(0.025, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.01, t + delay + duration);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + delay);
      osc.stop(t + delay + duration + 0.025);
    };

    if (kind === 'web') {
      tone('triangle', 980, 310, 0.14, 0.22);
      tone('sine', 1450, 760, 0.08, 0.10, 0.035);
    } else if (kind === 'energyBlade') {
      tone('sawtooth', 115, 185, 0.22, 0.16);
      tone('triangle', 420, 210, 0.16, 0.13, 0.015);
    } else if (kind === 'force') {
      tone('sine', 145, 48, 0.32, 0.28);
      tone('triangle', 360, 120, 0.20, 0.10);
    } else if (kind === 'repulsor') {
      tone('square', 820, 1850, 0.12, 0.20);
      tone('sine', 1180, 260, 0.20, 0.20, 0.025);
    } else if (kind === 'ice') {
      tone('sine', 1700, 690, 0.24, 0.18);
      tone('triangle', 1180, 520, 0.28, 0.11, 0.035);
    } else if (kind === 'dash') {
      tone('sawtooth', 190, 980, 0.18, 0.16);
      tone('sine', 440, 1320, 0.14, 0.12, 0.025);
    } else {
      tone('triangle', 520, 1120, 0.16, 0.18);
      tone('sine', 980, 240, 0.24, 0.16, 0.035);
    }
  }

  // Original lightweight meme-cameo sounds. These are short synthesized cues,
  // not copies of viral audio. They give the Brainrot NPCs personality without
  // shipping or reproducing the original meme voiceovers/songs.
  playBrainrotEffect(kind: 'tung' | 'dance' | 'ninja' | 'fly' | 'weird') {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    const tone = (type: OscillatorType, start: number, end: number, duration: number, level: number, delay = 0) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(25, start), t + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, end), t + delay + duration);
      gain.gain.setValueAtTime(0.001, t + delay);
      gain.gain.linearRampToValueAtTime(level, t + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + duration);
      osc.connect(gain); gain.connect(this.sfxGain!);
      osc.start(t + delay); osc.stop(t + delay + duration + 0.02);
    };

    if (kind === 'tung') {
      // Three dry wooden knock-like synth hits.
      [0, 0.12, 0.24].forEach((delay, i) => {
        tone('triangle', 155 + i * 10, 72, 0.085, 0.30, delay);
        tone('square', 420, 130, 0.045, 0.07, delay);
      });
    } else if (kind === 'dance') {
      tone('sine', 523, 784, 0.18, 0.16);
      tone('triangle', 659, 988, 0.20, 0.11, 0.10);
    } else if (kind === 'ninja') {
      tone('sawtooth', 920, 240, 0.12, 0.12);
      tone('triangle', 1250, 510, 0.10, 0.08, 0.035);
    } else if (kind === 'fly') {
      tone('sawtooth', 92, 145, 0.30, 0.11);
      tone('triangle', 210, 128, 0.24, 0.08, 0.04);
    } else {
      tone('triangle', 330, 560, 0.16, 0.12);
      tone('sine', 610, 270, 0.21, 0.08, 0.05);
    }
  }

  // Car drift screech
  playTireScreech() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(950, t);
    osc.frequency.linearRampToValueAtTime(750, t + 0.25);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.28);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Car engine sound update (pitch shifts with speed)
  setEngineSound(active: boolean, speedNorm: number) {
    if (!this.enabled) {
      if (this.engineGain) this.engineGain.gain.value = 0;
      return;
    }
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    if (active) {
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'triangle';
        this.engineOsc.frequency.value = 55;
        this.engineGain.gain.value = 0.08;
        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.sfxGain);
        this.engineOsc.start();
      }
      const targetFreq = 50 + speedNorm * 180;
      this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
      this.engineGain!.gain.setTargetAtTime(0.06 + speedNorm * 0.12, this.ctx.currentTime, 0.05);
    } else {
      if (this.engineGain) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      }
    }
  }

  // Hit & Run police soundscape. The previous 650-870 Hz sine sweep read as a
  // piercing electronic whine. This uses a much lower triangle siren plus a quiet
  // engine-rumble layer, updated smoothly while the pursuit is active.
  setSiren(active: boolean) {
    if (!this.enabled) {
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

        this.sirenOsc1.type = 'triangle';
        this.sirenOsc1.frequency.value = 360;
        this.sirenOsc2.type = 'sawtooth';
        this.sirenOsc2.frequency.value = 62;
        this.sirenGain.gain.value = 0.001;
        this.policeEngineGain.gain.value = 0.001;

        this.sirenOsc1.connect(this.sirenGain);
        this.sirenGain.connect(this.sfxGain);
        this.sirenOsc2.connect(this.policeEngineGain);
        this.policeEngineGain.connect(this.sfxGain);
        this.sirenOsc1.start();
        this.sirenOsc2.start();
      }
      const now = this.ctx.currentTime;
      const sweep = (Math.sin(now * 4.1) + 1) * 0.5;
      this.sirenOsc1.frequency.setTargetAtTime(325 + sweep * 165, now, 0.055);
      this.sirenOsc2!.frequency.setTargetAtTime(58 + sweep * 20, now, 0.09);
      this.sirenGain!.gain.setTargetAtTime(0.060, now, 0.12);
      this.policeEngineGain!.gain.setTargetAtTime(0.020, now, 0.16);
    } else {
      const now = this.ctx.currentTime;
      if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, now, 0.12);
      if (this.policeEngineGain) this.policeEngineGain.gain.setTargetAtTime(0, now, 0.16);
    }
  }

  // Original HIT & RUN trigger stinger: urgent alternating alarm tones and a
  // low impact pulse, synthesized locally instead of copying the original game's audio.
  playHitAndRunAlert() {
    if (!this.enabled) return;
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
      osc.connect(gain); gain.connect(this.sfxGain!);
      osc.start(at); osc.stop(at + 0.12);
    });
    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(92, t);
    thump.frequency.exponentialRampToValueAtTime(36, t + 0.65);
    thumpGain.gain.setValueAtTime(0.42, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);
    thump.connect(thumpGain); thumpGain.connect(this.sfxGain);
    thump.start(t); thump.stop(t + 0.72);
  }

  // Coin / Donut pickup
  playCoin() {
    if (!this.enabled) return;
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
    if (!this.enabled) return;
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
    if (!this.enabled) return;
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
  toggleMusic() {
    this.init();
    if (this.isMusicPlaying) {
      this.stopMusic();
    } else {
      this.startMusic();
    }
    return this.isMusicPlaying;
  }

  startMusic() {
    if (!this.enabled || this.isMusicPlaying) return;
    this.init();
    this.isMusicPlaying = true;
    const bassNotes = [110, 110, 130.81, 146.83, 110, 164.81, 146.83, 130.81];
    let step = 0;
    const playBeat = () => {
      if (!this.isMusicPlaying || !this.ctx || !this.musicGain) return;
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

  // Thunder sound effect (Pikachu)
  playThunder() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  // Flamethrower whoosh (Charmander)
  playFlamethrower() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.linearRampToValueAtTime(80, t + 0.25);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.28);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Ground slam seismic boom (Geodude)
  playGroundSlam() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.45);
    gain.gain.setValueAtTime(0.95, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  // Nitro boost whoosh / turbo
  playNitrous() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.4);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  // Glass door slide / latch chime
  playDoor() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, t);
    osc.frequency.exponentialRampToValueAtTime(820, t + 0.12);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /**
   * Subtle procedural fountain ambience. The loop is synthesized from smoothed
   * broadband noise, then filtered so it reads as splashing water rather than hiss.
   * We intentionally do not create/resume an AudioContext here; the ambience begins
   * after the player's first normal game interaction has already unlocked WebAudio.
   */
  setFountainAmbience(distance: number) {
    if (!this.enabled || !this.ctx || !this.sfxGain) {
      if (this.fountainGain && this.ctx) this.fountainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.16);
      return;
    }

    const maxDistance = 38;
    const proximity = Math.max(0, Math.min(1, 1 - distance / maxDistance));
    const targetVolume = 0.16 * proximity * proximity;

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
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      source.start();

      this.fountainSource = source;
      this.fountainFilter = filter;
      this.fountainGain = gain;
    }

    if (this.fountainGain) {
      this.fountainGain.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, targetVolume > 0 ? 0.18 : 0.28);
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
    if (this.fountainGain) {
      try { this.fountainGain.disconnect(); } catch {}
    }
    this.fountainSource = null;
    this.fountainFilter = null;
    this.fountainGain = null;
  }

  cleanup() {
    this.stopMusic();
    this.stopFountainAmbience();
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

  playEngine(speed: number, maxSpeed = 40) {
    this.setEngineSound(true, Math.min(speed / maxSpeed, 1));
  }

  stopEngine() {
    this.setEngineSound(false, 0);
  }

  toggleMute(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopMusic();
      this.stopEngine();
      this.setSiren(false);
      this.stopFountainAmbience();
    }
    return !this.enabled;
  }
}

export const soundManager = new SoundManager();

export function playSoundEffect(type: string) {
  if (type === 'kick') soundManager.playKick();
  else if (type === 'water') soundManager.playWaterSquirt();
  else if (type === 'tree' || type === 'treeGrow') soundManager.playTreeSprout();
  else if (type === 'crash') soundManager.playCrash();
  else if (type === 'horn') soundManager.playHorn();
  else if (type === 'siren') soundManager.setSiren(true);
  else if (type === 'screech') soundManager.playTireScreech();
  else if (type === 'coin' || type === 'click') soundManager.playCoin();
  else if (type === 'busted') soundManager.playBusted();
  else if (type === 'hitRun') soundManager.playHitAndRunAlert();
  else if (type === 'victory' || type === 'fanfare') soundManager.playVictory();
  else if (type === 'thunder') soundManager.playThunder();
  else if (type === 'fire') soundManager.playFlamethrower();
  else if (type === 'slam') soundManager.playGroundSlam();
  else if (type === 'nitro' || type === 'engineStart') soundManager.playNitrous();
  else if (type === 'door' || type === 'doorOpen') soundManager.playDoor();
  else if (type === 'jump') soundManager.playKick();
  else if (type === 'doubleJump') soundManager.playPowerEffect('dash');
  else if (type === 'stomp') soundManager.playGroundSlam();
  else if (type === 'powerWeb') soundManager.playPowerEffect('web');
  else if (type === 'powerBlade') soundManager.playPowerEffect('energyBlade');
  else if (type === 'powerForce') soundManager.playPowerEffect('force');
  else if (type === 'powerRepulsor') soundManager.playPowerEffect('repulsor');
  else if (type === 'powerIce') soundManager.playPowerEffect('ice');
  else if (type === 'powerDash') soundManager.playPowerEffect('dash');
  else if (type === 'powerEnergy') soundManager.playPowerEffect('energy');
  else if (type === 'brainrotTung') soundManager.playBrainrotEffect('tung');
  else if (type === 'brainrotDance') soundManager.playBrainrotEffect('dance');
  else if (type === 'brainrotNinja') soundManager.playBrainrotEffect('ninja');
  else if (type === 'brainrotFly') soundManager.playBrainrotEffect('fly');
  else if (type === 'brainrotWeird') soundManager.playBrainrotEffect('weird');
}

