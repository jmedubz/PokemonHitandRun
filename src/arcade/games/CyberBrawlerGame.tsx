import React, { useEffect, useRef, useState } from 'react';
import { ArcadeGameProps } from '../types';
import { Volume2, VolumeX, RotateCcw, Swords, Shield, Award, X, Sparkles, Zap, ChevronRight } from 'lucide-react';

interface OpponentDef {
  name: string;
  alias: string;
  country: string;
  record: string;
  color: string;
  hairColor: string;
  skinColor: string;
  shortsColor: string;
  glovesColor: string;
  maxHp: number;
  attackSpeed: number; // seconds between attacks
  windupDuration: number; // seconds player has to react/counter
  heavyAttackChance: number;
  trainerTip: string;
}

const OPPONENTS: OpponentDef[] = [
  {
    name: 'Kid Neon',
    alias: 'The Shibuya Spark',
    country: 'JPN',
    record: '14-2 (9 KO)',
    color: '#06b6d4',
    hairColor: '#38bdf8',
    skinColor: '#fed7aa',
    shortsColor: '#0284c7',
    glovesColor: '#38bdf8',
    maxHp: 110,
    attackSpeed: 1.8,
    windupDuration: 0.65,
    heavyAttackChance: 0.25,
    trainerTip: 'Kid Neon telegraphs with his visor blinking yellow! Dodge his hook and counter with a body blow to earn a Star!',
  },
  {
    name: 'Crusher Kowalski',
    alias: 'Siberian Sledgehammer',
    country: 'RUS',
    record: '28-1 (27 KO)',
    color: '#ef4444',
    hairColor: '#78716c',
    skinColor: '#fdba74',
    shortsColor: '#991b1b',
    glovesColor: '#dc2626',
    maxHp: 160,
    attackSpeed: 2.1,
    windupDuration: 0.75,
    heavyAttackChance: 0.45,
    trainerTip: 'Crusher raises both arms for his Sledgehammer Slam! DO NOT block—it breaks guard! Side-step and hammer his ribs!',
  },
  {
    name: 'Shadow Viper',
    alias: 'The Neon Cobra',
    country: 'BRA',
    record: '34-3 (21 KO)',
    color: '#a855f7',
    hairColor: '#22c55e',
    skinColor: '#d97706',
    shortsColor: '#581c87',
    glovesColor: '#a855f7',
    maxHp: 195,
    attackSpeed: 1.4,
    windupDuration: 0.48,
    heavyAttackChance: 0.35,
    trainerTip: 'Viper feints with lightning speed. Keep high guard up during his rapid jabs, then counter the third strike!',
  },
  {
    name: 'Iron Titan Prime',
    alias: 'World Heavyweight Champion',
    country: 'CYBER',
    record: '49-0 (49 KO)',
    color: '#eab308',
    hairColor: '#e2e8f0',
    skinColor: '#94a3b8',
    shortsColor: '#713f12',
    glovesColor: '#ca8a04',
    maxHp: 260,
    attackSpeed: 1.3,
    windupDuration: 0.42,
    heavyAttackChance: 0.55,
    trainerTip: 'Titan generates an overcharged shield. Break his guard with body hooks, then unleash a 3-Star Super Uppercut!',
  },
];

export const CyberBrawlerGame: React.FC<ArcadeGameProps> = ({ onExit, machineName }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Match state
  const [currentBout, setCurrentBout] = useState(0); // 0 to 3
  const [playerHp, setPlayerHp] = useState(100);
  const [playerStamina, setPlayerStamina] = useState(100);
  const [opponentHp, setOpponentHp] = useState(OPPONENTS[0].maxHp);
  const [stars, setStars] = useState(0);
  const [score, setScore] = useState(0);
  const [roundTime, setRoundTime] = useState(180); // 3:00 min round
  const [fightPhase, setFightPhase] = useState<'intro' | 'fighting' | 'knockdown' | 'round_clear' | 'gameover' | 'champion'>('intro');
  const [refereeCount, setRefereeCount] = useState(0);
  const [mashProgress, setMashProgress] = useState(0);
  const [playerDownsThisFight, setPlayerDownsThisFight] = useState(0);
  const [announcementText, setAnnouncementText] = useState('BOUT 1: READY TO RUMBLE');
  const [soundMuted, setSoundMuted] = useState(false);

  // Action states for animation
  const [playerStance, setPlayerStance] = useState<'idle' | 'jab_left' | 'cross_right' | 'body_hook' | 'block' | 'dodge_left' | 'dodge_right' | 'super'>('idle');
  const [opponentStance, setOpponentStance] = useState<'idle' | 'windup_left' | 'windup_heavy' | 'punch' | 'heavy_punch' | 'hit_head' | 'hit_body' | 'block' | 'down'>('idle');

  const soundMutedRef = useRef(false);
  soundMutedRef.current = soundMuted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const windupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playerCountIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Audio synthesizer
  const playSfx = (type: 'bell' | 'jab' | 'heavy_hit' | 'super_hit' | 'block' | 'whiff' | 'down' | 'cheer' | 'count' | 'star') => {
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

      if (type === 'bell') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.start(now);
        osc.stop(now + 1.2);
      } else if (type === 'jab') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'heavy_hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.22);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'super_hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.4);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'block') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'whiff') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.1);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'down') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.55);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.55);
        osc.start(now);
        osc.stop(now + 0.55);
      } else if (type === 'star') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'count') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch {}
  };

  const opponent = OPPONENTS[currentBout] || OPPONENTS[0];

  // Visual effects and floating text
  const impactFlashRef = useRef(0);
  const flashbulbsRef = useRef<{ x: number; y: number; life: number }[]>([]);

  // Player attack handlers
  const handlePlayerAttack = (attackType: 'jab_left' | 'cross_right' | 'body_hook' | 'super') => {
    if (fightPhase !== 'fighting') return;

    if (attackType === 'super') {
      if (stars <= 0) return;
      setPlayerStance('super');
      playSfx('super_hit');
      impactFlashRef.current = 1.0;
      setStars((s) => Math.max(0, s - 1));

      const damage = 35 + stars * 12;
      setOpponentStance('hit_head');
      setAnnouncementText(`★ STAR UPPERCUT! -${damage}`);
      setScore((sc) => sc + damage * 20);

      setTimeout(() => setPlayerStance('idle'), 380);
      setTimeout(() => setOpponentStance('idle'), 420);

      setOpponentHp((prev) => {
        const next = Math.max(0, prev - damage);
        if (next <= 0) {
          triggerOpponentKnockdown();
        }
        return next;
      });
      return;
    }

    if (playerStamina < 8) {
      playSfx('whiff');
      setAnnouncementText('TIRED! REST OR DODGE!');
      return;
    }

    setPlayerStamina((s) => Math.max(0, s - 10));
    setPlayerStance(attackType);
    setTimeout(() => setPlayerStance('idle'), 180);

    // Check if opponent is winding up -> Counter hit!
    const isOpponentVulnerable = opponentStance === 'windup_left' || opponentStance === 'windup_heavy';

    if (isOpponentVulnerable) {
      // Counter-punch! Rewards a Star!
      playSfx('star');
      playSfx('heavy_hit');
      impactFlashRef.current = 0.6;
      setStars((s) => Math.min(3, s + 1));
      const counterDamage = attackType === 'body_hook' ? 24 : 18;
      setOpponentStance(attackType === 'body_hook' ? 'hit_body' : 'hit_head');
      setTimeout(() => setOpponentStance('idle'), 300);

      setAnnouncementText(`COUNTER STRIKE! ★ STAR EARNED! -${counterDamage}`);
      setScore((sc) => sc + counterDamage * 25);

      setOpponentHp((prev) => {
        const next = Math.max(0, prev - counterDamage);
        if (next <= 0) triggerOpponentKnockdown();
        return next;
      });
      return;
    }

    // Normal attack against opponent
    if (opponentStance === 'block') {
      if (attackType === 'body_hook') {
        // Body blow bypasses high block!
        playSfx('heavy_hit');
        setOpponentStance('hit_body');
        setTimeout(() => setOpponentStance('idle'), 220);
        const dmg = 14;
        setAnnouncementText(`BODY HOOK PIERCED GUARD! -${dmg}`);
        setScore((sc) => sc + dmg * 15);
        setOpponentHp((prev) => {
          const next = Math.max(0, prev - dmg);
          if (next <= 0) triggerOpponentKnockdown();
          return next;
        });
      } else {
        playSfx('block');
        setAnnouncementText('BLOCKED BY OPPONENT!');
      }
    } else {
      // Clean hit
      playSfx('jab');
      setOpponentStance(attackType === 'body_hook' ? 'hit_body' : 'hit_head');
      setTimeout(() => setOpponentStance('idle'), 200);
      const dmg = attackType === 'body_hook' ? 12 : 10;
      setAnnouncementText(`${attackType.replace('_', ' ').toUpperCase()}! -${dmg}`);
      setScore((sc) => sc + dmg * 10);
      setOpponentHp((prev) => {
        const next = Math.max(0, prev - dmg);
        if (next <= 0) triggerOpponentKnockdown();
        return next;
      });
    }
  };

  const handleDefend = (defenseType: 'block' | 'dodge_left' | 'dodge_right') => {
    if (fightPhase !== 'fighting') return;
    setPlayerStance(defenseType);
    if (defenseType === 'block') {
      playSfx('block');
    } else {
      playSfx('whiff');
    }
    setTimeout(() => setPlayerStance('idle'), 550);
  };

  const handleMash = () => {
    if (fightPhase !== 'knockdown' || playerHp > 0) return;
    playSfx('jab');
    setMashProgress((prev) => {
      const next = prev + 25;
      if (next >= 100) {
        if (playerCountIntervalRef.current) {
          clearInterval(playerCountIntervalRef.current);
          playerCountIntervalRef.current = null;
        }
        setFightPhase('fighting');
        setPlayerHp(50);
        setPlayerStamina(80);
        setPlayerStance('idle');
        setAnnouncementText('BACK ON YOUR FEET! FIGHT ON!');
        playSfx('bell');
        return 0;
      }
      return next;
    });
  };

  const triggerOpponentKnockdown = () => {
    if (windupTimeoutRef.current) {
      clearTimeout(windupTimeoutRef.current);
      windupTimeoutRef.current = null;
    }
    setFightPhase('knockdown');
    setOpponentStance('down');
    playSfx('down');
    setAnnouncementText('DOWN! DOWN GOES THE FIGHTER!');

    let count = 1;
    setRefereeCount(count);
    playSfx('count');

    const countInterval = setInterval(() => {
      count++;
      setRefereeCount(count);
      playSfx('count');

      if (count >= 10) {
        clearInterval(countInterval);
        // T.K.O. Victory!
        playSfx('bell');
        setScore((sc) => sc + 5000);
        if (currentBout >= OPPONENTS.length - 1) {
          setFightPhase('champion');
          setAnnouncementText('AND NEW WORLD CHAMPION! YOU WON THE CIRCUIT!');
        } else {
          setFightPhase('round_clear');
          setAnnouncementText(`K.O.! YOU DEFEATED ${opponent.name.toUpperCase()}!`);
        }
      } else if (count === 8 && currentBout >= 2 && Math.random() < 0.35) {
        // High level opponents can get up once
        clearInterval(countInterval);
        setOpponentHp(35);
        setOpponentStance('idle');
        setFightPhase('fighting');
        setAnnouncementText(`${opponent.name} BEATS THE COUNT! FIGHT ON!`);
      }
    }, 900);
  };

  const triggerPlayerKnockdown = () => {
    if (windupTimeoutRef.current) {
      clearTimeout(windupTimeoutRef.current);
      windupTimeoutRef.current = null;
    }
    setFightPhase('knockdown');
    playSfx('down');
    setMashProgress(0);
    const newDownCount = playerDownsThisFight + 1;
    setPlayerDownsThisFight(newDownCount);

    if (newDownCount >= 3) {
      setFightPhase('gameover');
      setAnnouncementText('THREE KNOCKDOWNS RULE! T.K.O. LOSS!');
      return;
    }

    setAnnouncementText('YOU GOT KNOCKED DOWN! RAPIDLY TAP OR PRESS BUTTONS TO GET UP!');

    let count = 1;
    setRefereeCount(count);
    playSfx('count');

    if (playerCountIntervalRef.current) {
      clearInterval(playerCountIntervalRef.current);
    }

    playerCountIntervalRef.current = setInterval(() => {
      count++;
      setRefereeCount(count);
      playSfx('count');

      if (count >= 10) {
        if (playerCountIntervalRef.current) {
          clearInterval(playerCountIntervalRef.current);
          playerCountIntervalRef.current = null;
        }
        setFightPhase('gameover');
        setAnnouncementText('KNOCKED OUT! CAREER DEFEAT!');
      }
    }, 1000);
  };

  const startNextBout = () => {
    const nextBout = currentBout + 1;
    setCurrentBout(nextBout);
    const nextOpponent = OPPONENTS[nextBout];
    setOpponentHp(nextOpponent.maxHp);
    setPlayerHp(100);
    setPlayerStamina(100);
    setRoundTime(180);
    setStars(0);
    setPlayerDownsThisFight(0);
    setMashProgress(0);
    setFightPhase('fighting');
    setPlayerStance('idle');
    setOpponentStance('idle');
    playSfx('bell');
    setAnnouncementText(`BOUT ${nextBout + 1}: ${nextOpponent.name.toUpperCase()}! FIGHT!`);
  };

  const restartTournament = () => {
    setCurrentBout(0);
    setPlayerHp(100);
    setPlayerStamina(100);
    setOpponentHp(OPPONENTS[0].maxHp);
    setStars(0);
    setScore(0);
    setRoundTime(180);
    setPlayerDownsThisFight(0);
    setMashProgress(0);
    setFightPhase('fighting');
    setPlayerStance('idle');
    setOpponentStance('idle');
    playSfx('bell');
    setAnnouncementText('ROUND 1 - FIGHT!');
  };

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (fightPhase === 'intro') {
        if (e.code === 'Space' || e.code === 'Enter') {
          setFightPhase('fighting');
          playSfx('bell');
          setAnnouncementText('ROUND 1 - FIGHT!');
        }
        return;
      }

      if (fightPhase === 'knockdown' && playerHp <= 0) {
        handleMash();
        return;
      }

      if (fightPhase === 'round_clear' && (e.code === 'Space' || e.code === 'Enter')) {
        startNextBout();
        return;
      }

      if ((fightPhase === 'gameover' || fightPhase === 'champion') && (e.code === 'KeyR' || e.code === 'Space')) {
        restartTournament();
        return;
      }

      if (fightPhase !== 'fighting') return;

      if (e.code === 'KeyJ' || e.code === 'KeyZ') handlePlayerAttack('jab_left');
      if (e.code === 'KeyK' || e.code === 'KeyX') handlePlayerAttack('cross_right');
      if (e.code === 'KeyU' || e.code === 'KeyC') handlePlayerAttack('body_hook');
      if (e.code === 'Space' || e.code === 'KeyB') handlePlayerAttack('super');

      if (e.code === 'KeyS' || e.code === 'ArrowDown') handleDefend('block');
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') handleDefend('dodge_left');
      if (e.code === 'KeyD' || e.code === 'ArrowRight') handleDefend('dodge_right');

      if (e.code === 'Escape') onExit();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fightPhase, currentBout, stars, playerStamina, opponentStance]);

  // Opponent AI Attack Loop
  useEffect(() => {
    if (fightPhase !== 'fighting') return;

    const attackInterval = setInterval(() => {
      if (fightPhase !== 'fighting') return;

      const isHeavy = Math.random() < opponent.heavyAttackChance;
      const windupStance = isHeavy ? 'windup_heavy' : 'windup_left';
      setOpponentStance(windupStance);
      setAnnouncementText(
        isHeavy ? `⚠️ DANGER! ${opponent.name.toUpperCase()} PREPARES CRUSHING BLOW!` : `WATCH OUT! INCOMING PUNCH!`
      );

      // Windup timer before actual punch lands
      windupTimeoutRef.current = setTimeout(() => {
        setOpponentStance(isHeavy ? 'heavy_punch' : 'punch');

        // Check if player guarded, dodged, or got hit
        setPlayerStance((currentStance) => {
          if (isHeavy) {
            // Heavy punches CANNOT be blocked! Must be dodged!
            if (currentStance === 'dodge_left' || currentStance === 'dodge_right') {
              playSfx('whiff');
              setAnnouncementText('PERFECT DODGE! SLAM THE COUNTER!');
            } else {
              // Heavy hit connects!
              playSfx('heavy_hit');
              impactFlashRef.current = 0.8;
              const dmg = 28 + Math.floor(Math.random() * 10);
              setAnnouncementText(`HEAVY IMPACT CRUSHED DEFENSE! -${dmg}`);
              setPlayerHp((prev) => {
                const next = Math.max(0, prev - dmg);
                if (next <= 0) triggerPlayerKnockdown();
                return next;
              });
            }
          } else {
            // Normal punch
            if (currentStance === 'block') {
              playSfx('block');
              setAnnouncementText('BLOCKED! GUARD HELD!');
              setPlayerStamina((st) => Math.max(0, st - 12));
            } else if (currentStance === 'dodge_left' || currentStance === 'dodge_right') {
              playSfx('whiff');
              setAnnouncementText('SLIPPED THE JAB!');
            } else {
              // Got hit
              playSfx('jab');
              impactFlashRef.current = 0.4;
              const dmg = 12 + Math.floor(Math.random() * 6);
              setAnnouncementText(`OUCH! HIT BY JAB! -${dmg}`);
              setPlayerHp((prev) => {
                const next = Math.max(0, prev - dmg);
                if (next <= 0) triggerPlayerKnockdown();
                return next;
              });
            }
          }
          return currentStance;
        });

        setTimeout(() => setOpponentStance('idle'), 240);
      }, opponent.windupDuration * 1000);
    }, opponent.attackSpeed * 1000);

    return () => {
      clearInterval(attackInterval);
      if (windupTimeoutRef.current) {
        clearTimeout(windupTimeoutRef.current);
        windupTimeoutRef.current = null;
      }
    };
  }, [fightPhase, currentBout]);

  // Round Timer & Stamina Regeneration
  useEffect(() => {
    if (fightPhase !== 'fighting') return;

    const timer = setInterval(() => {
      setRoundTime((t) => {
        if (t <= 1) {
          // Time expired
          return 0;
        }
        return t - 1;
      });

      // Stamina naturally regenerates
      setPlayerStamina((st) => Math.min(100, st + 7));
    }, 1000);

    return () => clearInterval(timer);
  }, [fightPhase]);

  // Canvas Retro Boxing Ring & Boxers Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Arena dark background
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Crowd in background with flashbulbs
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, canvas.width, 220);

      // Flashbulbs popping
      if (Math.random() < 0.2) {
        flashbulbsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * 180,
          life: 0.15,
        });
      }

      for (let i = flashbulbsRef.current.length - 1; i >= 0; i--) {
        const fb = flashbulbsRef.current[i];
        fb.life -= 0.016;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(fb.x, fb.y, 3 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
        if (fb.life <= 0) flashbulbsRef.current.splice(i, 1);
      }

      // Boxing Ring Floor Canvas (Perspective trapezoid)
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(40, 220);
      ctx.lineTo(canvas.width - 40, 220);
      ctx.lineTo(canvas.width, canvas.height);
      ctx.lineTo(0, canvas.height);
      ctx.closePath();
      ctx.fill();

      // Ring Center Mat Logo
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, 340, 140, 50, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Ring Ropes (Neon blue & magenta)
      [150, 180, 210].forEach((ropeY, idx) => {
        ctx.strokeStyle = idx === 1 ? '#06b6d4' : '#ec4899';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, ropeY);
        ctx.lineTo(canvas.width, ropeY);
        ctx.stroke();
      });

      // -------------------------------------------------------------
      // OPPONENT BOXER (Centered in upper ring)
      // -------------------------------------------------------------
      const oppX = canvas.width / 2 + (opponentStance === 'windup_left' ? -15 : 0);
      const oppY = 240 + (opponentStance === 'hit_head' ? -12 : opponentStance === 'down' ? 60 : 0);

      ctx.save();
      ctx.translate(oppX, oppY);

      if (opponentStance !== 'down') {
        // Opponent Body / Torso
        ctx.fillStyle = opponent.skinColor;
        ctx.fillRect(-26, -10, 52, 60);

        // Shorts
        ctx.fillStyle = opponent.shortsColor;
        ctx.fillRect(-28, 48, 56, 36);

        // Head & Face
        ctx.fillStyle = opponent.skinColor;
        ctx.beginPath();
        ctx.arc(0, -32, 22, 0, Math.PI * 2);
        ctx.fill();

        // Hair
        ctx.fillStyle = opponent.hairColor;
        ctx.fillRect(-20, -52, 40, 16);

        // Visor / Eyes (Flashes yellow or red when winding up!)
        const isWindingUp = opponentStance === 'windup_left' || opponentStance === 'windup_heavy';
        ctx.fillStyle = isWindingUp ? (opponentStance === 'windup_heavy' ? '#ef4444' : '#facc15') : '#1e293b';
        ctx.fillRect(-14, -36, 28, 8);

        // Gloves
        ctx.fillStyle = opponent.glovesColor;
        if (opponentStance === 'block') {
          ctx.beginPath();
          ctx.arc(-12, -20, 14, 0, Math.PI * 2);
          ctx.arc(12, -20, 14, 0, Math.PI * 2);
          ctx.fill();
        } else if (opponentStance === 'windup_heavy') {
          // Both gloves held high in air
          ctx.beginPath();
          ctx.arc(-26, -55, 16, 0, Math.PI * 2);
          ctx.arc(26, -55, 16, 0, Math.PI * 2);
          ctx.fill();
        } else if (opponentStance === 'punch' || opponentStance === 'heavy_punch') {
          // Punch extended toward camera
          ctx.beginPath();
          ctx.arc(0, 15, 24, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Guard stance
          ctx.beginPath();
          ctx.arc(-24, 10, 14, 0, Math.PI * 2);
          ctx.arc(24, 10, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Opponent Knocked Down on Canvas
        ctx.fillStyle = opponent.skinColor;
        ctx.fillRect(-45, 10, 90, 25);
        ctx.fillStyle = opponent.shortsColor;
        ctx.fillRect(-20, 10, 40, 25);
        ctx.fillStyle = opponent.hairColor;
        ctx.beginPath();
        ctx.arc(-45, 22, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // -------------------------------------------------------------
      // PLAYER BOXER (Lower ring, viewed from behind in green wireframe/emerald)
      // -------------------------------------------------------------
      let playerX = canvas.width / 2;
      let playerY = canvas.height - 40;
      if (playerStance === 'dodge_left') playerX -= 45;
      if (playerStance === 'dodge_right') playerX += 45;

      ctx.save();
      ctx.translate(playerX, playerY);

      // Player Back/Torso
      ctx.fillStyle = '#059669';
      ctx.fillRect(-32, -80, 64, 75);

      // Player Green Shorts
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(-34, -5, 68, 35);

      // Player Head from behind
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(0, -100, 24, 0, Math.PI * 2);
      ctx.fill();

      // Player Gloves
      ctx.fillStyle = '#34d399';
      if (playerStance === 'jab_left') {
        ctx.beginPath();
        ctx.arc(-25, -145, 20, 0, Math.PI * 2); // Left glove punch extended
        ctx.arc(26, -70, 16, 0, Math.PI * 2);
        ctx.fill();
      } else if (playerStance === 'cross_right') {
        ctx.beginPath();
        ctx.arc(-26, -70, 16, 0, Math.PI * 2);
        ctx.arc(25, -145, 20, 0, Math.PI * 2); // Right cross extended
        ctx.fill();
      } else if (playerStance === 'body_hook') {
        ctx.beginPath();
        ctx.arc(0, -120, 22, 0, Math.PI * 2); // Hook to ribs
        ctx.fill();
      } else if (playerStance === 'super') {
        // Super uppercut launching high
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(0, -165, 28, 0, Math.PI * 2);
        ctx.fill();
      } else if (playerStance === 'block') {
        ctx.beginPath();
        ctx.arc(-12, -95, 18, 0, Math.PI * 2);
        ctx.arc(12, -95, 18, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Ready stance
        ctx.beginPath();
        ctx.arc(-30, -65, 16, 0, Math.PI * 2);
        ctx.arc(30, -65, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Screen Impact Flash
      if (impactFlashRef.current > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${impactFlashRef.current * 0.45})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        impactFlashRef.current = Math.max(0, impactFlashRef.current - 0.05);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [playerStance, opponentStance, opponent]);

  return (
    <div className="w-full h-full flex flex-col bg-neutral-950 text-white font-mono select-none overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-950 via-neutral-900 to-amber-950 border-b-2 border-amber-500/70 px-3 sm:px-6 py-2 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Swords className="w-5 h-5 text-amber-400 animate-pulse" />
          <div>
            <h1 className="text-sm sm:text-lg font-black text-amber-300 tracking-wider">
              CYBER PUNCHOUT <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600/30 text-amber-200 border border-amber-500/50">CHAMPIONSHIP</span>
            </h1>
            <p className="text-[10px] text-neutral-400">Bout {currentBout + 1} of 4 • {opponent.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-xs">
          <div className="text-neutral-300">
            SCORE: <span className="text-amber-400 font-bold">{score}</span>
          </div>

          <button
            onClick={() => setSoundMuted(!soundMuted)}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
          >
            {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          </button>

          <button
            onClick={restartTournament}
            className="px-2.5 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-700 text-xs font-bold transition flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Restart</span>
          </button>

          <button
            onClick={onExit}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black transition shadow flex items-center gap-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Main Fight Canvas & HUD */}
      <div className="flex-1 relative flex items-center justify-center bg-black p-2 min-h-0">
        <canvas
          ref={canvasRef}
          width={540}
          height={480}
          className="max-h-full max-w-full aspect-[9/8] rounded-xl border-2 border-amber-500/40 shadow-[0_0_40px_rgba(245,158,11,0.25)] bg-slate-950 object-contain"
        />

        {/* Top Floating Match HUD */}
        <div className="absolute top-4 inset-x-6 max-w-xl mx-auto pointer-events-none flex flex-col gap-2">
          {/* Opponent & Player Health Bars */}
          <div className="flex items-center justify-between gap-4">
            {/* Player HP */}
            <div className="flex-1">
              <div className="flex justify-between text-[10px] font-black mb-1">
                <span className="text-emerald-400">YOU (LITTLE MAC)</span>
                <span className="text-white">{playerHp}%</span>
              </div>
              <div className="h-3 bg-neutral-800 rounded-full border border-emerald-500/60 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-100"
                  style={{ width: `${playerHp}%` }}
                />
              </div>
              {/* Stamina bar */}
              <div className="h-1.5 bg-neutral-900 rounded-full mt-0.5 overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-75"
                  style={{ width: `${playerStamina}%` }}
                />
              </div>
            </div>

            {/* Center Clock & Stars */}
            <div className="flex flex-col items-center px-2">
              <span className="text-[11px] font-black text-amber-400">
                {Math.floor(roundTime / 60)}:{String(roundTime % 60).padStart(2, '0')}
              </span>
              <div className="flex gap-1 mt-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`text-xs ${i < stars ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(250,204,21,0.8)] animate-pulse' : 'text-neutral-700'}`}
                  >
                    ★
                  </span>
                ))}
              </div>
            </div>

            {/* Opponent HP */}
            <div className="flex-1 text-right">
              <div className="flex justify-between text-[10px] font-black mb-1">
                <span className="text-white">{Math.round((opponentHp / opponent.maxHp) * 100)}%</span>
                <span className="text-amber-400">{opponent.name.toUpperCase()}</span>
              </div>
              <div className="h-3 bg-neutral-800 rounded-full border border-amber-500/60 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-100 ml-auto"
                  style={{ width: `${(opponentHp / opponent.maxHp) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Announcement Banner */}
          <div className="text-center">
            <span className="px-3 py-1 rounded-full bg-neutral-900/90 border border-amber-500/60 text-[11px] font-black text-amber-300 shadow">
              {announcementText}
            </span>
          </div>
        </div>

        {/* Referee 10-Count Overlay */}
        {fightPhase === 'knockdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 p-4 z-20 backdrop-blur-xs">
            <div className="flex flex-col items-center bg-neutral-950/90 px-8 py-6 rounded-2xl border-2 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.5)] max-w-sm w-full">
              <span className="text-6xl font-black text-amber-400">{refereeCount}</span>
              <span className="text-xs text-neutral-300 uppercase tracking-widest mt-1">Referee 10-Count</span>

              {playerHp <= 0 && playerDownsThisFight < 3 && (
                <div className="mt-4 w-full flex flex-col items-center gap-2">
                  <div className="text-xs text-emerald-400 font-black text-center animate-pulse">
                    MASH BUTTONS OR TAP RAPIDLY TO GET UP!
                  </div>
                  <div className="w-full h-3 bg-neutral-900 rounded-full border border-emerald-500/80 overflow-hidden shadow">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-75"
                      style={{ width: `${mashProgress}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleMash}
                    className="w-full mt-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white font-black text-sm cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.6)] animate-bounce flex items-center justify-center gap-1"
                  >
                    <Zap className="w-4 h-4 text-emerald-200" />
                    <span>GET UP! (TAP RAPIDLY)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bout Clear Screen */}
        {fightPhase === 'round_clear' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4">
            <div className="max-w-md w-full bg-neutral-900 border-2 border-amber-500 rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(245,158,11,0.3)]">
              <Award className="w-12 h-12 text-amber-400 mx-auto mb-2 animate-bounce" />
              <h2 className="text-2xl font-black text-amber-300">VICTORY BY KNOCKOUT!</h2>
              <p className="text-xs text-neutral-300 mt-1">You defeated {opponent.name} ({opponent.country})!</p>

              {/* Corner Trainer hint for next opponent */}
              {currentBout < OPPONENTS.length - 1 && (
                <div className="my-4 p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-left text-xs text-amber-200">
                  <span className="font-bold text-amber-400">CORNER COACH ADVICE:</span>
                  <p className="mt-1 text-neutral-300 leading-relaxed">{OPPONENTS[currentBout + 1].trainerTip}</p>
                </div>
              )}

              <button
                onClick={startNextBout}
                className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg mt-2"
              >
                <span>NEXT TITLE BOUT</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Champion Victory Screen */}
        {fightPhase === 'champion' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/95 p-4">
            <div className="max-w-md w-full bg-gradient-to-b from-amber-950 to-neutral-900 border-4 border-amber-400 rounded-3xl p-6 text-center shadow-[0_0_60px_rgba(250,204,21,0.5)]">
              <Sparkles className="w-14 h-14 text-amber-300 mx-auto mb-2 animate-spin" />
              <h2 className="text-3xl font-black text-amber-300">UNDISPUTED WORLD CHAMPION!</h2>
              <p className="text-sm text-neutral-200 mt-2">
                You conquered all 4 cyber contenders and brought home the arcade championship belt!
              </p>
              <div className="text-xl font-black text-amber-400 my-4">FINAL SCORE: {score}</div>
              <button
                onClick={restartTournament}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-sm cursor-pointer shadow-lg"
              >
                PLAY CHAMPIONSHIP AGAIN
              </button>
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {fightPhase === 'gameover' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4">
            <div className="max-w-md w-full bg-neutral-900 border-2 border-rose-600 rounded-2xl p-6 text-center">
              <h2 className="text-2xl font-black text-rose-500">T.K.O. - OUT COLD!</h2>
              <p className="text-xs text-neutral-300 mt-2">Defeated in Bout {currentBout + 1} by {opponent.name}.</p>
              <div className="p-3 my-4 rounded-xl bg-neutral-800 text-left text-xs text-neutral-300">
                <span className="font-bold text-amber-400">TRAINER NOTE:</span>
                <p className="mt-1">{opponent.trainerTip}</p>
              </div>
              <button
                onClick={restartTournament}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm cursor-pointer shadow"
              >
                REMATCH FROM BOUT 1
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Touch & Boxing Pad */}
      <div className="bg-neutral-900/95 border-t border-neutral-800 px-3 py-2 flex items-center justify-between text-xs text-neutral-400 shrink-0">
        {/* Left: Defense (Dodge Left, Block, Dodge Right) */}
        <div className="flex gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => handleDefend('dodge_left')}
            className="w-12 sm:w-14 h-11 rounded-xl bg-neutral-800 active:bg-cyan-600 border border-neutral-700 text-white font-black text-xs flex flex-col items-center justify-center cursor-pointer shadow"
          >
            <span>◀</span>
            <span className="text-[9px] text-cyan-300">DODGE</span>
          </button>
          <button
            type="button"
            onClick={() => handleDefend('block')}
            className="w-12 sm:w-14 h-11 rounded-xl bg-neutral-800 active:bg-blue-600 border border-neutral-700 text-white font-black text-xs flex flex-col items-center justify-center cursor-pointer shadow"
          >
            <Shield className="w-3.5 h-3.5 text-blue-300" />
            <span className="text-[9px] text-blue-300">GUARD</span>
          </button>
          <button
            type="button"
            onClick={() => handleDefend('dodge_right')}
            className="w-12 sm:w-14 h-11 rounded-xl bg-neutral-800 active:bg-cyan-600 border border-neutral-700 text-white font-black text-xs flex flex-col items-center justify-center cursor-pointer shadow"
          >
            <span>▶</span>
            <span className="text-[9px] text-cyan-300">DODGE</span>
          </button>
        </div>

        {/* Center: Desktop Key Hint */}
        <div className="hidden lg:block text-[11px] text-neutral-400 text-center">
          J/K: High Punch • U: Body Hook • S: Block • A/D: Dodge • Space: Super Star Uppercut
        </div>

        {/* Right: Attack (Jab, Cross, Body, Super) */}
        <div className="flex gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => handlePlayerAttack('jab_left')}
            className="w-11 sm:w-12 h-11 rounded-xl bg-emerald-800 active:bg-emerald-600 border border-emerald-500 text-white font-black text-[10px] flex flex-col items-center justify-center cursor-pointer shadow"
          >
            <span>LEFT</span>
            <span className="text-[8px] text-emerald-200">JAB</span>
          </button>
          <button
            type="button"
            onClick={() => handlePlayerAttack('cross_right')}
            className="w-11 sm:w-12 h-11 rounded-xl bg-emerald-800 active:bg-emerald-600 border border-emerald-500 text-white font-black text-[10px] flex flex-col items-center justify-center cursor-pointer shadow"
          >
            <span>RIGHT</span>
            <span className="text-[8px] text-emerald-200">CROSS</span>
          </button>
          <button
            type="button"
            onClick={() => handlePlayerAttack('body_hook')}
            className="w-11 sm:w-12 h-11 rounded-xl bg-amber-800 active:bg-amber-600 border border-amber-500 text-white font-black text-[10px] flex flex-col items-center justify-center cursor-pointer shadow"
          >
            <span>BODY</span>
            <span className="text-[8px] text-amber-200">HOOK</span>
          </button>
          <button
            type="button"
            onClick={() => handlePlayerAttack('super')}
            disabled={stars <= 0}
            className={`w-14 sm:w-16 h-11 rounded-xl border text-white font-black text-[10px] flex flex-col items-center justify-center cursor-pointer shadow ${
              stars > 0
                ? 'bg-amber-600 active:bg-amber-400 border-amber-300 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.6)]'
                : 'bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed opacity-50'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-200" />
            <span>SUPER ({stars})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
