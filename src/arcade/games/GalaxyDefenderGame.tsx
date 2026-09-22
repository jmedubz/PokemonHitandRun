import React, { useEffect, useRef, useState } from 'react';
import { ArcadeGameProps } from '../types';
import { Volume2, VolumeX, RotateCcw, X, Zap, Shield, Bomb, ChevronRight, Award, Crosshair, Trophy, Pause, Play } from 'lucide-react';

interface Invader {
  x: number;
  y: number;
  type: 'scout' | 'wasp' | 'corvette' | 'cruiser' | 'commander';
  alive: boolean;
  hp: number;
  maxHp: number;
  width: number;
  height: number;
  diveTimer: number;
  isDiving: boolean;
  diveAngle: number;
  diveSpeed: number;
  baseX: number;
  baseY: number;
  shootCooldown: number;
}

interface Boss {
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  phase: number;
  attackTimer: number;
  laserCharging: boolean;
  laserTimer: number;
  dir: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fromPlayer: boolean;
  isLaser?: boolean;
  color?: string;
  damage: number;
}

interface PowerUp {
  x: number;
  y: number;
  vy: number;
  type: 'spread' | 'shield' | 'wingman' | 'bomb' | 'laser';
  alive: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  rot: number;
  rotSpeed: number;
}

export const GalaxyDefenderGame: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try {
      return Number(localStorage.getItem('galaxy_defender_hi') || '28500');
    } catch {
      return 28500;
    }
  });
  const [lives, setLives] = useState(3);
  const [sector, setSector] = useState(1);
  const [bombs, setBombs] = useState(2);
  const [weaponType, setWeaponType] = useState<'normal' | 'spread' | 'laser'>('normal');
  const [hasShield, setHasShield] = useState(false);
  const [hasWingmen, setHasWingmen] = useState(false);
  const [combo, setCombo] = useState(1);
  const [bossHpPercent, setBossHpPercent] = useState<number | null>(null);
  const [gameState, setGameState] = useState<'playing' | 'sector_clear' | 'gameover'>('playing');
  const [soundMuted, setSoundMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const soundMutedRef = useRef(false);
  soundMutedRef.current = soundMuted;
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;
  const keysRef = useRef<Record<string, boolean>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const restartRef = useRef<() => void>(() => {});
  const triggerBombRef = useRef<() => void>(() => {});

  // Web Audio Chiptune Synthesizer
  const playSfx = (type: 'laser' | 'spread' | 'boom' | 'boss_hit' | 'powerup' | 'bomb' | 'shield_hit' | 'boss_alarm' | 'clear') => {
    if (soundMutedRef.current) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'laser') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(950, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.09);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (type === 'spread') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.11);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.11);
        osc.start(now);
        osc.stop(now + 0.11);
      } else if (type === 'boom') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.28);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'boss_hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'powerup') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.06);
        osc.frequency.setValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.24);
        osc.start(now);
        osc.stop(now + 0.24);
      } else if (type === 'bomb') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.7);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.7);
        osc.start(now);
        osc.stop(now + 0.7);
      } else if (type === 'shield_hit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.14);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === 'boss_alarm') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.linearRampToValueAtTime(500, now + 0.18);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'clear') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.08);
        osc.frequency.setValueAtTime(783, now + 0.16);
        osc.frequency.setValueAtTime(1046, now + 0.24);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      }
    } catch {}
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let playerX = canvas.width / 2;
    const playerY = canvas.height - 48;
    const playerSpeed = 360;
    let shootTimer = 0;
    let invulnerableTimer = 0;
    let screenShake = 0;

    // Entities
    const bullets: Bullet[] = [];
    const particles: Particle[] = [];
    const powerUps: PowerUp[] = [];
    const floatingTexts: FloatingText[] = [];
    const asteroids: Asteroid[] = [];
    let invaders: Invader[] = [];

    // Background Stars (3 parallax layers)
    const stars = Array.from({ length: 110 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speed: 25 + Math.random() * 85,
      size: 0.8 + Math.random() * 2,
      brightness: 0.3 + Math.random() * 0.7,
      color: Math.random() > 0.8 ? '#38bdf8' : Math.random() > 0.7 ? '#facc15' : '#ffffff',
    }));

    // Game state tracking
    let currentSector = 1;
    let currentScore = 0;
    let currentLives = 3;
    let currentBombs = 2;
    let curWeapon: 'normal' | 'spread' | 'laser' = 'normal';
    let curShield = false;
    let curWingmen = false;
    let weaponTimer = 0;
    let curCombo = 1;
    let comboTimer = 0;
    let sectorTransitionTimer = 0;

    const boss: Boss = {
      active: false,
      x: canvas.width / 2,
      y: -120,
      width: 140,
      height: 70,
      hp: 100,
      maxHp: 100,
      phase: 1,
      attackTimer: 0,
      laserCharging: false,
      laserTimer: 0,
      dir: 1,
    };

    const addFloatingText = (x: number, y: number, text: string, color: string) => {
      floatingTexts.push({ x, y, text, color, life: 1.0 });
    };

    const createExplosion = (x: number, y: number, count = 22, color = '#f97316', size = 3) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 180;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: Math.random() > 0.4 ? color : '#fef08a',
          size: size * (0.6 + Math.random() * 0.8),
          life: 0.35 + Math.random() * 0.45,
          maxLife: 0.6,
        });
      }
    };

    // Setup Sector Formations
    const setupSector = (sec: number) => {
      currentSector = sec;
      setSector(sec);
      invaders = [];
      asteroids.length = 0;
      boss.active = false;
      setBossHpPercent(null);
      setGameState('playing');

      if (sec === 4) {
        // Sector 4: Final Mothership Core Boss
        boss.active = true;
        boss.x = canvas.width / 2;
        boss.y = 75;
        boss.maxHp = 650;
        boss.hp = boss.maxHp;
        boss.phase = 1;
        boss.dir = 1;
        boss.attackTimer = 2.0;
        setBossHpPercent(100);
        playSfx('boss_alarm');
        addFloatingText(canvas.width / 2, 140, 'WARNING: DREADNOUGHT CORE DETECTED!', '#ef4444');
        return;
      }

      // Standard sectors: Formations with specialized enemy types
      const rows = 3 + Math.min(sec, 2);
      const cols = 8;
      const startX = 65;
      const startY = 65;
      const spacingX = 46;
      const spacingY = 38;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let type: Invader['type'] = 'scout';
          let hp = 1;
          if (r === 0) {
            type = c % 2 === 0 ? 'commander' : 'cruiser';
            hp = 3 + sec;
          } else if (r === 1) {
            type = sec >= 2 ? 'corvette' : 'wasp';
            hp = 2 + (sec >= 3 ? 1 : 0);
          } else {
            type = 'scout';
            hp = 1;
          }

          invaders.push({
            x: startX + c * spacingX,
            y: startY + r * spacingY,
            type,
            alive: true,
            hp,
            maxHp: hp,
            width: type === 'commander' ? 34 : 26,
            height: type === 'commander' ? 24 : 20,
            diveTimer: 3 + Math.random() * 8,
            isDiving: false,
            diveAngle: 0,
            diveSpeed: 160 + sec * 20,
            baseX: startX + c * spacingX,
            baseY: startY + r * spacingY,
            shootCooldown: 2 + Math.random() * 6,
          });
        }
      }

      // Add ambient drifting asteroids in Sector 1 & 2
      if (sec <= 2) {
        for (let i = 0; i < 4; i++) {
          asteroids.push({
            x: 40 + Math.random() * (canvas.width - 80),
            y: -50 - Math.random() * 300,
            vx: (Math.random() - 0.5) * 30,
            vy: 45 + Math.random() * 50,
            radius: 14 + Math.random() * 12,
            hp: 3,
            rot: Math.random() * Math.PI,
            rotSpeed: (Math.random() - 0.5) * 2,
          });
        }
      }
    };

    const triggerBomb = () => {
      if (currentBombs <= 0) return;
      currentBombs--;
      setBombs(currentBombs);
      screenShake = 0.5;
      playSfx('bomb');

      // Wipe all enemy bullets
      bullets.forEach((b) => {
        if (!b.fromPlayer) {
          createExplosion(b.x, b.y, 6, '#38bdf8', 2);
        }
      });
      const surviving = bullets.filter((b) => b.fromPlayer);
      bullets.length = 0;
      bullets.push(...surviving);

      // Damage all living invaders
      invaders.forEach((inv) => {
        if (inv.alive) {
          inv.hp -= 4;
          createExplosion(inv.x, inv.y, 8, '#38bdf8', 2);
          if (inv.hp <= 0) {
            inv.alive = false;
            currentScore += 150 * curCombo;
            setScore(currentScore);
          }
        }
      });

      if (boss.active) {
        boss.hp = Math.max(0, boss.hp - 65);
        createExplosion(boss.x, boss.y, 25, '#38bdf8', 4);
        setBossHpPercent(Math.round((boss.hp / boss.maxHp) * 100));
      }

      addFloatingText(canvas.width / 2, canvas.height / 2, 'EMP SMART BOMB DETONATED!', '#38bdf8');
    };
    triggerBombRef.current = triggerBomb;

    const resetGame = () => {
      currentScore = 0;
      currentLives = 3;
      currentBombs = 2;
      currentSector = 1;
      curWeapon = 'normal';
      curShield = false;
      curWingmen = false;
      curCombo = 1;
      comboTimer = 0;
      weaponTimer = 0;
      invulnerableTimer = 2.0;
      playerX = canvas.width / 2;

      setScore(0);
      setLives(3);
      setBombs(2);
      setWeaponType('normal');
      setHasShield(false);
      setHasWingmen(false);
      setCombo(1);
      setupSector(1);
    };
    restartRef.current = resetGame;

    setupSector(1);

    // Keyboard handlers
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'KeyP') {
        setIsPaused((prev) => !prev);
      }
      if ((e.code === 'KeyR' || e.code === 'Space' || e.code === 'Enter') && currentLives <= 0) {
        resetGame();
      }
      if (e.code === 'KeyB' || e.code === 'KeyK') {
        triggerBomb();
      }
      if (e.code === 'Escape') {
        onExit();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let lastTime = performance.now();
    let formationPhase = 0;

    const loop = (now: number) => {
      if (isPausedRef.current) {
        lastTime = now;
        animId = requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;

      // Update screen shake
      if (screenShake > 0) {
        screenShake = Math.max(0, screenShake - dt * 2.5);
      }

      // 1. Stars Update
      for (const s of stars) {
        s.y += s.speed * dt;
        if (s.y > canvas.height) {
          s.y = 0;
          s.x = Math.random() * canvas.width;
        }
      }

      // Combo cooldown
      if (curCombo > 1) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
          curCombo = 1;
          setCombo(1);
        }
      }

      // Weapon timer
      if (curWeapon !== 'normal') {
        weaponTimer -= dt;
        if (weaponTimer <= 0) {
          curWeapon = 'normal';
          setWeaponType('normal');
          addFloatingText(playerX, playerY - 30, 'WEAPON DEPLETED', '#94a3b8');
        }
      }

      if (invulnerableTimer > 0) {
        invulnerableTimer -= dt;
      }

      if (currentLives > 0) {
        const keys = keysRef.current;

        // Player movement
        if (keys['KeyA'] || keys['ArrowLeft']) {
          playerX = Math.max(26, playerX - playerSpeed * dt);
        }
        if (keys['KeyD'] || keys['ArrowRight']) {
          playerX = Math.min(canvas.width - 26, playerX + playerSpeed * dt);
        }

        // Shooting
        shootTimer -= dt;
        if ((keys['Space'] || keys['KeyJ'] || keys['KeyZ']) && shootTimer <= 0) {
          if (curWeapon === 'spread') {
            bullets.push(
              { x: playerX - 10, y: playerY - 14, vx: -110, vy: -520, fromPlayer: true, damage: 1, color: '#f59e0b' },
              { x: playerX, y: playerY - 18, vx: 0, vy: -560, fromPlayer: true, damage: 1.5, color: '#facc15' },
              { x: playerX + 10, y: playerY - 14, vx: 110, vy: -520, fromPlayer: true, damage: 1, color: '#f59e0b' }
            );
            shootTimer = 0.16;
            playSfx('spread');
          } else if (curWeapon === 'laser') {
            bullets.push(
              { x: playerX - 4, y: playerY - 20, vx: 0, vy: -750, fromPlayer: true, isLaser: true, damage: 2.2, color: '#38bdf8' },
              { x: playerX + 4, y: playerY - 20, vx: 0, vy: -750, fromPlayer: true, isLaser: true, damage: 2.2, color: '#38bdf8' }
            );
            shootTimer = 0.13;
            playSfx('laser');
          } else {
            // Normal blasters
            bullets.push({ x: playerX - 6, y: playerY - 16, vx: 0, vy: -520, fromPlayer: true, damage: 1, color: '#38bdf8' });
            bullets.push({ x: playerX + 6, y: playerY - 16, vx: 0, vy: -520, fromPlayer: true, damage: 1, color: '#38bdf8' });
            shootTimer = 0.19;
            playSfx('laser');
          }

          // Escort Wingmen synchronized fire
          if (curWingmen) {
            bullets.push(
              { x: playerX - 32, y: playerY - 8, vx: -40, vy: -490, fromPlayer: true, damage: 0.9, color: '#a855f7' },
              { x: playerX + 32, y: playerY - 8, vx: 40, vy: -490, fromPlayer: true, damage: 0.9, color: '#a855f7' }
            );
          }
        }
      }

      // 2. Invaders Movement & Dive Attacks
      formationPhase += dt * (1.8 + currentSector * 0.4);
      const formationOffsetX = Math.sin(formationPhase) * 36;
      let livingInvaders = 0;

      for (const inv of invaders) {
        if (!inv.alive) continue;
        livingInvaders++;

        if (!inv.isDiving) {
          // Normal hovering formation
          inv.x = inv.baseX + formationOffsetX;
          inv.y = inv.baseY + Math.cos(formationPhase * 1.5) * 6;

          // Check if commander or wasp initiates a dive attack
          inv.diveTimer -= dt;
          if (inv.diveTimer <= 0 && (inv.type === 'wasp' || inv.type === 'commander' || inv.type === 'corvette')) {
            inv.isDiving = true;
            const targetAngle = Math.atan2(playerY - inv.y, playerX - inv.x);
            inv.diveAngle = targetAngle;
            inv.diveSpeed = 190 + currentSector * 30;
          }
        } else {
          // Swooping dive attack toward bottom
          inv.x += Math.cos(inv.diveAngle) * inv.diveSpeed * dt;
          inv.y += Math.sin(inv.diveAngle) * inv.diveSpeed * dt;

          // If reached bottom of screen, warp back to top of formation
          if (inv.y > canvas.height + 25) {
            inv.y = -20;
            inv.isDiving = false;
            inv.diveTimer = 4 + Math.random() * 7;
          }
        }

        // Invader shooting (capped at 4 active enemy bullets to prevent unfair death walls)
        inv.shootCooldown -= dt;
        const currentEnemyBullets = bullets.filter((b) => !b.fromPlayer).length;
        if (inv.shootCooldown <= 0 && currentEnemyBullets < 4) {
          inv.shootCooldown = 2.0 + Math.random() * 3.5 - currentSector * 0.2;
          bullets.push({
            x: inv.x,
            y: inv.y + 12,
            vx: Math.max(-70, Math.min(70, (playerX - inv.x) * 0.25)),
            vy: 200 + currentSector * 25,
            fromPlayer: false,
            damage: 1,
            color: '#ef4444',
          });
        }
      }

      // 3. Boss Logic (Sector 4)
      if (boss.active) {
        boss.x += boss.dir * 85 * dt;
        if (boss.x < 110) {
          boss.x = 110;
          boss.dir = 1;
        } else if (boss.x > canvas.width - 110) {
          boss.x = canvas.width - 110;
          boss.dir = -1;
        }

        boss.attackTimer -= dt;
        if (boss.attackTimer <= 0) {
          boss.attackTimer = 1.3 - (boss.phase === 2 ? 0.4 : 0);
          // 5-way spread cannon
          for (let a = -2; a <= 2; a++) {
            bullets.push({
              x: boss.x + a * 18,
              y: boss.y + 30,
              vx: a * 65,
              vy: 260,
              fromPlayer: false,
              damage: 1,
              color: '#f97316',
            });
          }
        }

        // Phase 2 transition at 50% HP
        if (boss.phase === 1 && boss.hp <= boss.maxHp * 0.5) {
          boss.phase = 2;
          createExplosion(boss.x, boss.y, 40, '#ef4444', 5);
          playSfx('boss_alarm');
          addFloatingText(boss.x, boss.y + 50, 'HYPER CHARGE ACTIVATED!', '#ef4444');
        }

        setBossHpPercent(Math.max(0, Math.round((boss.hp / boss.maxHp) * 100)));

        // Boss Death Check
        if (boss.hp <= 0) {
          boss.active = false;
          setBossHpPercent(null);
          createExplosion(boss.x, boss.y, 80, '#facc15', 7);
          screenShake = 1.2;
          playSfx('boom');
          currentScore += 10000;
          setScore(currentScore);
          setGameState('sector_clear');
          playSfx('clear');
          addFloatingText(canvas.width / 2, canvas.height / 2, 'COSMIC VICTORY! ALL SECTORS LIBERATED!', '#facc15');
        }
      }

      // Check Sector Progression for regular waves
      if (!boss.active && livingInvaders === 0 && currentLives > 0 && gameState === 'playing') {
        sectorTransitionTimer += dt;
        if (sectorTransitionTimer > 1.2) {
          sectorTransitionTimer = 0;
          playSfx('clear');
          const nextSec = currentSector + 1;
          if (nextSec > 4) {
            setGameState('sector_clear');
          } else {
            setupSector(nextSec);
            addFloatingText(canvas.width / 2, canvas.height / 2 - 30, `ENTERING SECTOR ${nextSec}`, '#38bdf8');
          }
        }
      }

      // 4. Asteroids Update
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const ast = asteroids[i];
        ast.x += ast.vx * dt;
        ast.y += ast.vy * dt;
        ast.rot += ast.rotSpeed * dt;
        if (ast.y > canvas.height + 40) {
          ast.y = -40;
          ast.x = 40 + Math.random() * (canvas.width - 80);
        }
      }

      // 5. Bullets Update & Collision
      for (let bIdx = bullets.length - 1; bIdx >= 0; bIdx--) {
        const b = bullets[bIdx];
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        if (b.y < -30 || b.y > canvas.height + 30 || b.x < -20 || b.x > canvas.width + 20) {
          bullets.splice(bIdx, 1);
          continue;
        }

        if (b.fromPlayer) {
          let bulletRemoved = false;

          // Check hit against Asteroids
          for (const ast of asteroids) {
            const d = Math.hypot(b.x - ast.x, b.y - ast.y);
            if (d < ast.radius) {
              ast.hp -= b.damage;
              createExplosion(b.x, b.y, 5, '#94a3b8', 2);
              if (ast.hp <= 0) {
                createExplosion(ast.x, ast.y, 16, '#cbd5e1', 3);
                currentScore += 80 * curCombo;
                setScore(currentScore);
                ast.y = -60;
                ast.hp = 3;
              }
              if (!b.isLaser) {
                bullets.splice(bIdx, 1);
                bulletRemoved = true;
                break;
              }
            }
          }
          if (bulletRemoved) continue;

          // Check hit against Invaders
          for (const inv of invaders) {
            if (!inv.alive) continue;
            if (
              b.x >= inv.x - inv.width / 2 &&
              b.x <= inv.x + inv.width / 2 &&
              b.y >= inv.y - inv.height / 2 &&
              b.y <= inv.y + inv.height / 2
            ) {
              inv.hp -= b.damage;
              createExplosion(b.x, b.y, 6, inv.type === 'commander' ? '#eab308' : '#f97316', 2);

              if (inv.hp <= 0) {
                inv.alive = false;
                createExplosion(inv.x, inv.y, 18, '#f97316', 3);
                playSfx('boom');

                // Combo calculation
                curCombo = Math.min(8, curCombo + 1);
                comboTimer = 2.5;
                setCombo(curCombo);

                const pts = (inv.type === 'commander' ? 300 : inv.type === 'corvette' ? 200 : 100) * curCombo;
                currentScore += pts;
                setScore(currentScore);
                addFloatingText(inv.x, inv.y, `+${pts}`, curCombo >= 4 ? '#f59e0b' : '#38bdf8');

                // Chance to drop power-up from commanders or wasps
                if (inv.type === 'commander' || Math.random() < 0.12) {
                  const types: PowerUp['type'][] = ['spread', 'laser', 'shield', 'wingman', 'bomb'];
                  const picked = types[Math.floor(Math.random() * types.length)];
                  powerUps.push({
                    x: inv.x,
                    y: inv.y,
                    vy: 120,
                    type: picked,
                    alive: true,
                  });
                }
              }

              if (!b.isLaser) {
                bullets.splice(bIdx, 1);
                bulletRemoved = true;
                break;
              }
            }
          }
          if (bulletRemoved) continue;

          // Check hit against Boss
          if (boss.active) {
            if (
              b.x >= boss.x - boss.width / 2 &&
              b.x <= boss.x + boss.width / 2 &&
              b.y >= boss.y - boss.height / 2 &&
              b.y <= boss.y + boss.height / 2
            ) {
              boss.hp = Math.max(0, boss.hp - b.damage);
              createExplosion(b.x, b.y, 5, '#ef4444', 2);
              playSfx('boss_hit');
              currentScore += 25;
              setScore(currentScore);
              if (!b.isLaser) {
                bullets.splice(bIdx, 1);
              }
            }
          }
        } else {
          // Enemy bullet hitting Player
          if (currentLives > 0 && invulnerableTimer <= 0) {
            const dist = Math.hypot(b.x - playerX, b.y - playerY);
            if (dist < 18) {
              bullets.splice(bIdx, 1);
              if (curShield) {
                curShield = false;
                setHasShield(false);
                invulnerableTimer = 1.5;
                createExplosion(playerX, playerY, 25, '#38bdf8', 4);
                playSfx('shield_hit');
                addFloatingText(playerX, playerY - 20, 'SHIELD BROKEN!', '#38bdf8');
                // Clear immediate enemy bullets around player
                for (let k = bullets.length - 1; k >= 0; k--) {
                  if (!bullets[k].fromPlayer && Math.hypot(bullets[k].x - playerX, bullets[k].y - playerY) < 140) {
                    bullets.splice(k, 1);
                  }
                }
              } else {
                currentLives--;
                setLives(currentLives);
                createExplosion(playerX, playerY, 35, '#ef4444', 4);
                screenShake = 0.8;
                playSfx('boom');
                invulnerableTimer = 2.5;
                curWeapon = 'normal';
                curWingmen = false;
                setWeaponType('normal');
                setHasWingmen(false);
                curCombo = 1;
                setCombo(1);

                // Vaporize enemy bullets around player with defensive EMP
                for (let k = bullets.length - 1; k >= 0; k--) {
                  if (!bullets[k].fromPlayer && Math.hypot(bullets[k].x - playerX, bullets[k].y - playerY) < 180) {
                    bullets.splice(k, 1);
                  }
                }

                if (currentLives <= 0) {
                  setGameState('gameover');
                  if (currentScore > highScore) {
                    setHighScore(currentScore);
                    try {
                      localStorage.setItem('galaxy_defender_hi', String(currentScore));
                    } catch {}
                  }
                }
              }
            }
          }
        }
      }

      // 6. PowerUps Update & Pickups
      for (let pIdx = powerUps.length - 1; pIdx >= 0; pIdx--) {
        const p = powerUps[pIdx];
        p.y += p.vy * dt;
        if (p.y > canvas.height + 20) {
          powerUps.splice(pIdx, 1);
          continue;
        }

        if (currentLives > 0 && Math.hypot(p.x - playerX, p.y - playerY) < 26) {
          playSfx('powerup');
          if (p.type === 'spread') {
            curWeapon = 'spread';
            weaponTimer = 18;
            setWeaponType('spread');
            addFloatingText(playerX, playerY - 30, 'TRIPLE SPREAD CANNON!', '#f59e0b');
          } else if (p.type === 'laser') {
            curWeapon = 'laser';
            weaponTimer = 16;
            setWeaponType('laser');
            addFloatingText(playerX, playerY - 30, 'TWIN PLASMA BEAM!', '#38bdf8');
          } else if (p.type === 'shield') {
            curShield = true;
            setHasShield(true);
            addFloatingText(playerX, playerY - 30, 'ENERGY SHIELD ONLINE!', '#06b6d4');
          } else if (p.type === 'wingman') {
            curWingmen = true;
            setHasWingmen(true);
            addFloatingText(playerX, playerY - 30, 'ESCORT WINGMEN ENGAGED!', '#a855f7');
          } else if (p.type === 'bomb') {
            currentBombs = Math.min(5, currentBombs + 1);
            setBombs(currentBombs);
            addFloatingText(playerX, playerY - 30, '+1 SMART BOMB!', '#ef4444');
          }
          currentScore += 250;
          setScore(currentScore);
          powerUps.splice(pIdx, 1);
        }
      }

      // 7. Particles Update
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) {
          particles.splice(i, 1);
        }
      }

      // 8. Floating Texts Update
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y -= dt * 35;
        ft.life -= dt * 1.2;
        if (ft.life <= 0) {
          floatingTexts.splice(i, 1);
        }
      }

      // -------------------------------------------------------------
      // RENDERING PIPELINE
      // -------------------------------------------------------------
      ctx.save();
      // Apply screen shake
      if (screenShake > 0) {
        const shakeMag = screenShake * 12;
        ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
      }

      // Background
      ctx.fillStyle = '#050711';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Stars
      for (const s of stars) {
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.brightness;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.globalAlpha = 1.0;

      // Asteroids
      for (const ast of asteroids) {
        ctx.save();
        ctx.translate(ast.x, ast.y);
        ctx.rotate(ast.rot);
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const pts = 7;
        for (let p = 0; p < pts; p++) {
          const a = (p / pts) * Math.PI * 2;
          const r = ast.radius * (0.8 + 0.2 * Math.sin(p * 2));
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Invaders
      for (const inv of invaders) {
        if (!inv.alive) continue;
        ctx.save();
        ctx.translate(inv.x, inv.y);

        if (inv.type === 'commander') {
          // Yellow / Gold flagship
          ctx.fillStyle = '#eab308';
          ctx.strokeStyle = '#ca8a04';
          ctx.beginPath();
          ctx.moveTo(0, 12);
          ctx.lineTo(-17, -10);
          ctx.lineTo(-8, -6);
          ctx.lineTo(0, -12);
          ctx.lineTo(8, -6);
          ctx.lineTo(17, -10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Glowing eye
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (inv.type === 'corvette') {
          // Purple stealth cruiser
          ctx.fillStyle = '#a855f7';
          ctx.beginPath();
          ctx.moveTo(0, 10);
          ctx.lineTo(-13, -8);
          ctx.lineTo(0, -4);
          ctx.lineTo(13, -8);
          ctx.closePath();
          ctx.fill();
        } else if (inv.type === 'wasp') {
          // Orange dive-bomber
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(0, 11);
          ctx.lineTo(-12, -7);
          ctx.lineTo(-4, 0);
          ctx.lineTo(0, -10);
          ctx.lineTo(4, 0);
          ctx.lineTo(12, -7);
          ctx.closePath();
          ctx.fill();
        } else {
          // Classic Cyan Scout
          ctx.fillStyle = '#06b6d4';
          ctx.fillRect(-11, -8, 22, 14);
          ctx.fillStyle = '#e0f2fe';
          ctx.fillRect(-6, -4, 4, 4);
          ctx.fillRect(2, -4, 4, 4);
        }
        ctx.restore();
      }

      // Boss Rendering
      if (boss.active) {
        ctx.save();
        ctx.translate(boss.x, boss.y);

        // Mothership hull
        ctx.fillStyle = boss.phase === 2 ? '#b91c1c' : '#4338ca';
        ctx.strokeStyle = '#e0e7ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 45);
        ctx.lineTo(-boss.width / 2, -15);
        ctx.lineTo(-boss.width / 4, -35);
        ctx.lineTo(boss.width / 4, -35);
        ctx.lineTo(boss.width / 2, -15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Pulsing Core
        ctx.fillStyle = boss.phase === 2 ? '#ef4444' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(0, 0, 16 + Math.sin(now * 0.01) * 3, 0, Math.PI * 2);
        ctx.fill();

        // Boss Turrets
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-boss.width / 3 - 8, 15, 16, 18);
        ctx.fillRect(boss.width / 3 - 8, 15, 16, 18);

        ctx.restore();
      }

      // Power-Ups
      for (const p of powerUps) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = p.type === 'spread' ? '#f59e0b' : p.type === 'laser' ? '#38bdf8' : p.type === 'shield' ? '#06b6d4' : p.type === 'bomb' ? '#ef4444' : '#a855f7';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = p.type === 'spread' ? 'S' : p.type === 'laser' ? 'L' : p.type === 'shield' ? 'D' : p.type === 'bomb' ? 'B' : 'W';
        ctx.fillText(label, 0, 1);
        ctx.restore();
      }

      // Bullets
      for (const b of bullets) {
        ctx.fillStyle = b.color || '#38bdf8';
        if (b.isLaser) {
          ctx.fillRect(b.x - 3, b.y - 12, 6, 24);
        } else {
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.fromPlayer ? 3.5 : 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Particles
      for (const pt of particles) {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // Player Ship
      if (currentLives > 0) {
        const isBlinking = invulnerableTimer > 0 && Math.floor(now * 0.015) % 2 === 0;
        if (!isBlinking) {
          ctx.save();
          ctx.translate(playerX, playerY);

          // Thruster flame
          ctx.fillStyle = Math.random() > 0.5 ? '#38bdf8' : '#60a5fa';
          ctx.beginPath();
          ctx.moveTo(-6, 12);
          ctx.lineTo(0, 22 + Math.random() * 8);
          ctx.lineTo(6, 12);
          ctx.closePath();
          ctx.fill();

          // Fighter Wings & Cockpit
          ctx.fillStyle = '#0284c7';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -18);
          ctx.lineTo(16, 12);
          ctx.lineTo(8, 10);
          ctx.lineTo(0, 14);
          ctx.lineTo(-8, 10);
          ctx.lineTo(-16, 12);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Canopy
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.ellipse(0, -2, 3, 7, 0, 0, Math.PI * 2);
          ctx.fill();

          // Shield Bubble
          if (curShield) {
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, 26, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Escort Wingmen
          if (curWingmen) {
            [-32, 32].forEach((offset) => {
              ctx.fillStyle = '#a855f7';
              ctx.beginPath();
              ctx.moveTo(offset, -4);
              ctx.lineTo(offset + 6, 8);
              ctx.lineTo(offset - 6, 8);
              ctx.closePath();
              ctx.fill();
            });
          }

          ctx.restore();
        }
      }

      // Floating Texts
      for (const ft of floatingTexts) {
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.globalAlpha = 1.0;

      // Overlay Game Over / Win Screens
      if (currentLives <= 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'black 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION FAILED', canvas.width / 2, canvas.height / 2 - 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(`FINAL SCORE: ${currentScore}`, canvas.width / 2, canvas.height / 2);

        ctx.fillStyle = '#facc15';
        ctx.font = '12px monospace';
        ctx.fillText('PRESS [R] OR TAP RETRY TO ENGAGE AGAIN', canvas.width / 2, canvas.height / 2 + 45);
      } else if (gameState === 'sector_clear' && currentSector >= 4) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#facc15';
        ctx.font = 'black 26px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GALAXY LIBERATED!', canvas.width / 2, canvas.height / 2 - 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(`VICTORY SCORE: ${currentScore}`, canvas.width / 2, canvas.height / 2);

        ctx.fillStyle = '#38bdf8';
        ctx.font = '12px monospace';
        ctx.fillText('PRESS [R] FOR NEW GAME+', canvas.width / 2, canvas.height / 2 + 45);
      }

      ctx.restore();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950 text-white font-mono select-none overflow-hidden">
      {/* Arcade Marquee Header */}
      <div className="bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 border-b border-cyan-500/70 px-2 py-1 sm:px-4 sm:py-1.5 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 truncate">
          <Zap className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />
          <div className="truncate">
            <h1 className="text-xs sm:text-sm font-black text-cyan-300 tracking-wider flex items-center gap-1.5 truncate">
              GALAXY DEFENDER <span className="hidden xs:inline text-[9px] px-1 py-0.2 rounded bg-cyan-600/30 text-cyan-200 border border-cyan-500/50">ARCADE PRO</span>
            </h1>
            <p className="hidden sm:inline-block text-[10px] text-slate-400">Sector {sector}</p>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs shrink-0">
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-300">
            <span>HI:</span>
            <span className="text-amber-400 font-bold">{highScore}</span>
          </div>
          <div className="text-[11px] text-slate-200">
            PTS: <span className="text-cyan-300 font-black">{score}</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSoundMuted((prev) => !prev);
            }}
            className="h-7 sm:h-8 w-7 sm:w-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 transition cursor-pointer touch-manipulation select-none flex items-center justify-center"
            title="Toggle Sound"
          >
            {soundMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsPaused((prev) => !prev);
            }}
            className="h-7 sm:h-8 px-2 rounded-lg bg-purple-900/80 hover:bg-purple-800 active:bg-purple-700 text-purple-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-purple-500/40 touch-manipulation select-none"
            title="Pause / Resume Game"
          >
            {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />}
            <span className="hidden xs:inline">{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsPaused(false);
              restartRef.current();
            }}
            className="h-7 sm:h-8 px-2 rounded-lg bg-cyan-800 hover:bg-cyan-700 active:bg-cyan-600 text-xs font-bold transition flex items-center gap-1 cursor-pointer touch-manipulation select-none"
            title="Reset Game"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExit();
            }}
            className="h-7 sm:h-8 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs transition shadow flex items-center gap-1 cursor-pointer touch-manipulation select-none"
            title="Exit Cabinet"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Main Playfield */}
      <div className="flex-1 relative flex items-center justify-center bg-black p-0.5 sm:p-2 min-h-0">
        <canvas
          ref={canvasRef}
          width={540}
          height={640}
          className="w-full h-full max-w-full max-h-full aspect-[27/32] rounded-xl border-2 border-cyan-500/40 shadow-[0_0_40px_rgba(6,182,212,0.3)] bg-slate-950 object-contain"
        />

        {/* In-Game HUD overlay elements */}
        <div className="absolute top-4 left-6 pointer-events-none flex flex-col gap-1.5">
          {/* Sector & Multiplier */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/60 text-[11px] font-black text-cyan-300">
              SECTOR {sector}
            </span>
            {combo > 1 && (
              <span className="px-2 py-0.5 rounded bg-amber-950/90 border border-amber-400 text-[11px] font-black text-amber-300 animate-bounce">
                x{combo} COMBO!
              </span>
            )}
          </div>

          {/* Lives & Bombs */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1 text-cyan-400">
              <span>LIVES:</span>
              <div className="flex gap-1">
                {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
                  <span key={i} className="text-sm">🚀</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 text-rose-400">
              <span>BOMBS:</span>
              <div className="flex gap-0.5">
                {Array.from({ length: Math.max(0, bombs) }).map((_, i) => (
                  <span key={i} className="text-sm">💣</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* INTERACTIVE PAUSED OVERLAY */}
        {isPaused && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 z-30 backdrop-blur-xs">
            <div className="max-w-xs w-full bg-neutral-900 border-2 border-purple-500/80 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(168,85,247,0.4)]">
              <Pause className="w-12 h-12 text-cyan-400 mx-auto mb-2 animate-pulse" />
              <h2 className="text-2xl font-black text-cyan-300 tracking-wider">GAME PAUSED</h2>
              <p className="text-xs text-neutral-400 mt-1 mb-6">Defenders resting in deep space...</p>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPaused(false)}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm cursor-pointer shadow flex items-center justify-center gap-2 touch-manipulation select-none"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>RESUME GAME</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPaused(false);
                    restartRef.current();
                  }}
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-bold text-xs cursor-pointer shadow flex items-center justify-center gap-1.5 touch-manipulation select-none"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESTART SECTOR</span>
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-300 font-bold text-xs cursor-pointer shadow border border-neutral-700 touch-manipulation select-none"
                >
                  EXIT TO ARCADE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Boss HP Bar */}
        {bossHpPercent !== null && (
          <div className="absolute top-4 inset-x-12 max-w-md mx-auto pointer-events-none flex flex-col items-center">
            <div className="w-full flex justify-between text-[10px] font-black text-rose-400 mb-1">
              <span>DREADNOUGHT CORE</span>
              <span>{bossHpPercent}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-900 border border-rose-500/80 overflow-hidden shadow-[0_0_15px_rgba(239,68,68,0.5)]">
              <div
                className="h-full bg-gradient-to-r from-rose-600 via-amber-500 to-rose-500 transition-all duration-100"
                style={{ width: `${bossHpPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Active Powerup Badges */}
        <div className="absolute bottom-16 left-6 pointer-events-none flex gap-2">
          {hasShield && (
            <span className="px-2 py-0.5 rounded-full bg-cyan-900/80 border border-cyan-400 text-[10px] font-bold text-cyan-200 flex items-center gap-1 shadow">
              <Shield className="w-3 h-3" /> SHIELD
            </span>
          )}
          {hasWingmen && (
            <span className="px-2 py-0.5 rounded-full bg-purple-900/80 border border-purple-400 text-[10px] font-bold text-purple-200 flex items-center gap-1 shadow">
              <Crosshair className="w-3 h-3" /> WINGMEN
            </span>
          )}
          {weaponType !== 'normal' && (
            <span className="px-2 py-0.5 rounded-full bg-amber-900/80 border border-amber-400 text-[10px] font-bold text-amber-200 flex items-center gap-1 shadow">
              <Zap className="w-3 h-3" /> {weaponType.toUpperCase()}
            </span>
          )}
        </div>

        {/* Interactive Game Over Overlay */}
        {(gameState === 'gameover' || lives <= 0) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 z-20 backdrop-blur-xs">
            <div className="max-w-sm w-full bg-gradient-to-b from-rose-950/90 to-slate-950 border-2 border-rose-500 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(244,63,94,0.4)]">
              <div className="text-4xl mb-2">💥</div>
              <h2 className="text-2xl font-black text-rose-400 tracking-wider">MISSION FAILED</h2>
              <p className="text-xs text-slate-300 mt-1">Your starship was destroyed in combat.</p>
              <div className="my-4 py-2 px-3 bg-slate-900/90 rounded-xl text-xs space-y-1">
                <div className="text-slate-400">Sector Reached: <span className="text-cyan-400 font-bold">{sector}</span></div>
                <div className="text-amber-400 font-black text-sm pt-1">SCORE: {score}</div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => restartRef.current()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    restartRef.current();
                  }}
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-neutral-950 font-black text-sm cursor-pointer shadow flex items-center justify-center gap-1.5 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>ENGAGE AGAIN</span>
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    onExit();
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 font-bold text-xs cursor-pointer shadow"
                >
                  EXIT TO ARCADE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Cosmic Victory Overlay */}
        {gameState === 'sector_clear' && sector >= 4 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-4 z-20 backdrop-blur-xs">
            <div className="max-w-sm w-full bg-gradient-to-b from-cyan-950/90 to-slate-950 border-2 border-cyan-400 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(6,182,212,0.4)]">
              <Trophy className="w-12 h-12 text-amber-300 mx-auto mb-2 animate-bounce" />
              <h2 className="text-2xl font-black text-cyan-300 tracking-wider">COSMIC VICTORY!</h2>
              <p className="text-xs text-slate-200 mt-1">Dreadnought flagship destroyed! All 4 galaxy sectors liberated!</p>
              <div className="my-4 text-xl font-black text-amber-400">FINAL SCORE: {score}</div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => restartRef.current()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    restartRef.current();
                  }}
                  className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-neutral-950 font-black text-sm cursor-pointer shadow flex items-center justify-center gap-1.5 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>PLAY AGAIN</span>
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    onExit();
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 font-bold text-xs cursor-pointer shadow"
                >
                  EXIT TO ARCADE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Touch & Gamepad Controls Bar */}
      <div className="bg-slate-900/90 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          {/* Mobile Left/Right buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onMouseDown={() => (keysRef.current['ArrowLeft'] = true)}
              onMouseUp={() => (keysRef.current['ArrowLeft'] = false)}
              onTouchStart={(e) => {
                e.preventDefault();
                keysRef.current['ArrowLeft'] = true;
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                keysRef.current['ArrowLeft'] = false;
              }}
              className="w-12 h-11 rounded-xl bg-slate-800 active:bg-cyan-600 border border-slate-700 text-white font-black text-base flex items-center justify-center cursor-pointer shadow"
            >
              ◀
            </button>
            <button
              type="button"
              onMouseDown={() => (keysRef.current['ArrowRight'] = true)}
              onMouseUp={() => (keysRef.current['ArrowRight'] = false)}
              onTouchStart={(e) => {
                e.preventDefault();
                keysRef.current['ArrowRight'] = true;
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                keysRef.current['ArrowRight'] = false;
              }}
              className="w-12 h-11 rounded-xl bg-slate-800 active:bg-cyan-600 border border-slate-700 text-white font-black text-base flex items-center justify-center cursor-pointer shadow"
            >
              ▶
            </button>
          </div>

          <span className="hidden sm:inline text-[11px] text-slate-400 ml-2">
            A/D: Move • Space/J: Blaster • B: Smart Bomb
          </span>
        </div>

        {/* Mobile Action buttons: Fire & Bomb */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => triggerBombRef.current()}
            className="px-3.5 h-11 rounded-xl bg-rose-700 active:bg-rose-500 border border-rose-400 text-white font-black text-xs flex items-center gap-1.5 shadow-[0_0_12px_rgba(225,29,72,0.4)] cursor-pointer"
          >
            <Bomb className="w-4 h-4 text-rose-200" />
            <span>BOMB ({bombs})</span>
          </button>

          <button
            type="button"
            onMouseDown={() => (keysRef.current['Space'] = true)}
            onMouseUp={() => (keysRef.current['Space'] = false)}
            onTouchStart={(e) => {
              e.preventDefault();
              keysRef.current['Space'] = true;
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              keysRef.current['Space'] = false;
            }}
            className="w-18 h-11 rounded-xl bg-cyan-600 active:bg-cyan-400 border border-cyan-300 text-white font-black text-xs flex items-center justify-center gap-1 shadow-[0_0_16px_rgba(6,182,212,0.5)] cursor-pointer"
          >
            <Zap className="w-4 h-4 text-cyan-200" />
            <span>FIRE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
