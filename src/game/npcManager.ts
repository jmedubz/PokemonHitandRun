import * as THREE from 'three';
import { NPC, NPCType } from '../types';
import {
  createHomerNPC,
  createNedFlandersNPC,
  createComicBookGuyNPC,
  createChiefWiggumNPC,
  createOfficerLouNPC,
  createMoeNPC,
  createKrustyClownNPC,
  createBarneyNPC,
  createApuNPC,
  createOfficerJennyNPC,
  createYoungsterJoeyNPC,
  createWhitneyNPC,
  createPikachuModel,
  createCharmanderModel,
  createAnakinSkywalkerNPC,
  createGordonRamsayNPC,
  createShrekNPC,
  createBatmanNPC,
  createSpiderManNPC,
  createMarioNPC,
  createSonicNPC,
  createMasterChiefNPC,
  createGenericCitizenNPC,
  createArcadePrizeHostNPC,
  createPopCultureCameoNPC,
  polishPopCultureCameoNPC,
  createSnorlaxNPC,
  createCharizardNPC,
  createHoOhNPC,
  createBulbasaurNPC,
  createSquirtleNPC,
  createJigglypuffNPC,
  createEeveeNPC,
  createPsyduckNPC,
  createGengarNPC,
  createMachampNPC,
  createMagikarpNPC,
  createLaprasNPC,
  createGyaradosNPC,
  createPeppaPigNPC,
  createGeorgePigNPC,
  createMummyPigNPC,
  createDaddyPigNPC,
  createBrainrotNPC,
} from './models';
import { playSoundEffect } from './audio';

interface SpawnConfig {
  id: string;
  name: string;
  type: NPCType;
  pos: [number, number, number];
  dialogues: string[];
  modelFactory: () => THREE.Group;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  movementMode?: 'ground' | 'flying' | 'hover' | 'swimming';
  waterSurfaceY?: number;
  swimDepth?: number;
  diveAmount?: number;
  swimSpeed?: number;
  combatWeight?: number;
  combatHp?: number;
  cameo?: boolean;
  flightHeight?: number;
  flightRadius?: number;
  stationary?: boolean;
}

type GroundHeightProvider = (x: number, z: number, currentY?: number, maxDrop?: number, fallbackY?: number) => number;
type CanOccupyProvider = (position: THREE.Vector3, radius?: number, height?: number) => boolean;
type CanFlyOccupyProvider = (position: THREE.Vector3, radius?: number, height?: number) => boolean;
type RoadSurfaceProvider = (x: number, z: number, clearance?: number) => boolean;
type PedestrianSurfaceProvider = (x: number, z: number) => boolean;
type AquaticSurfaceProvider = (position: THREE.Vector3) => boolean;
type AquaticDynamicObstacle = { position: THREE.Vector3; radius: number; height?: number; enabled?: () => boolean };
type RecoverPenetrationProvider = (position: THREE.Vector3, radius?: number, height?: number) => THREE.Vector3;

type PedestrianCrossingNode = {
  id: string;
  center: THREE.Vector3;
  roadAxis: 'x' | 'z';
  roadWidth: number;
  endpointA: THREE.Vector3;
  endpointB: THREE.Vector3;
};

type MeleeHitOptions = {
  source: THREE.Vector3;
  direction: THREE.Vector3;
  horizontalForce: number;
  verticalForce: number;
  damage: number;
  style?: 'kick' | 'punch' | 'headbutt' | 'tail' | 'uppercut' | 'slam';
  attackerName?: string;
  color?: number;
  playImpactSound?: boolean;
};

type SecondaryImpactKind = 'npc' | 'prop';
type SecondaryImpactReaction = 'none' | 'flinch' | 'stumble' | 'fall' | 'knockdown';

type SecondaryImpactOptions = {
  /** Stable id for pair cooldowns, e.g. `npc:bart_4` or `prop:mailbox_12`. */
  sourceId: string;
  sourceKind: SecondaryImpactKind;
  sourcePosition: THREE.Vector3;
  /** Actual world-space velocity at contact, including rotational/tangential motion for props. */
  velocity: THREE.Vector3;
  /** Relative gameplay mass. 1 = ordinary adult pedestrian. */
  sourceMass: number;
  contactPoint?: THREE.Vector3;
  /** Carries player ownership through a thrown NPC / kicked prop for normal retaliation logic. */
  playerCaused?: boolean;
};

type RecoveryDynamicBlockerProbe = {
  blocked: boolean;
  blockerCount: number;
  /** Direction the NPC should crawl/roll to get away from the blocking body. */
  escapeDirection?: THREE.Vector3;
};

type RecoveryDynamicProbeProvider = (
  position: THREE.Vector3,
  radius: number,
  height: number
) => RecoveryDynamicBlockerProbe;

type RecoveryDynamicNudgeProvider = (
  position: THREE.Vector3,
  radius: number,
  height: number,
  strength: number
) => boolean;

type CombatEffect = {
  group: THREE.Group;
  life: number;
  maxLife: number;
  material: THREE.MeshBasicMaterial;
  mode?: 'burst' | 'beam';
};

export type NPCPowerPlayerEffect = {
  damage: number;
  impulse: THREE.Vector3;
  reason: string;
  slowSeconds?: number;
};

export type NPCPowerWorldEffect = {
  kind: 'force' | 'impact';
  source: THREE.Vector3;
  direction: THREE.Vector3;
  radius: number;
  power: number;
};

type PowerKind =
  | 'spider'
  | 'force'
  | 'sith_lightning'
  | 'iron_man'
  | 'doom_energy'
  | 'ice'
  | 'super_strength'
  | 'sonic_dash'
  | 'fire_breath'
  | 'shadow_pulse'
  | 'plasma';

type PowerProfile = {
  kind: PowerKind;
  cooldown: number;
  range: number;
  damage: number;
  color: number;
  protective?: boolean;
};

const POWER_PROFILES: Record<string, PowerProfile> = {
  cameo_spiderman: { kind: 'spider', cooldown: 6.5, range: 17, damage: 3, color: 0xe8f4ff, protective: true },
  cameo_miles: { kind: 'spider', cooldown: 6.0, range: 17, damage: 3, color: 0xe8f4ff, protective: true },
  cameo_punk_spider: { kind: 'spider', cooldown: 5.8, range: 17, damage: 3, color: 0xffedf7, protective: true },
  cameo_anakin: { kind: 'force', cooldown: 6.2, range: 13, damage: 5, color: 0x77b7ff, protective: true },
  cameo_vader: { kind: 'force', cooldown: 5.8, range: 14, damage: 6, color: 0xff4a4a },
  cameo_yoda: { kind: 'force', cooldown: 5.4, range: 12, damage: 4, color: 0x75ff71, protective: true },
  cameo_mace: { kind: 'force', cooldown: 5.6, range: 13, damage: 5, color: 0xc879ff, protective: true },
  cameo_palpatine: { kind: 'sith_lightning', cooldown: 7.0, range: 15, damage: 7, color: 0x9ec7ff },
  cameo_iron_man: { kind: 'iron_man', cooldown: 4.8, range: 20, damage: 7, color: 0x9ff4ff, protective: true },
  cameo_dr_doom: { kind: 'doom_energy', cooldown: 6.5, range: 16, damage: 7, color: 0x7dff8c },
  cameo_frozone: { kind: 'ice', cooldown: 6.2, range: 14, damage: 4, color: 0xbff7ff, protective: true },
  cameo_incredible: { kind: 'super_strength', cooldown: 5.0, range: 5.2, damage: 9, color: 0xffd95a, protective: true },
  cameo_sonic: { kind: 'sonic_dash', cooldown: 6.2, range: 9.5, damage: 5, color: 0x51b8ff, protective: true },
  wild_charizard: { kind: 'fire_breath', cooldown: 7.0, range: 14, damage: 7, color: 0xff7a22 },
  ash_defender_charizard: { kind: 'fire_breath', cooldown: 3.8, range: 13.5, damage: 7, color: 0xff7a22 },
  wild_gengar: { kind: 'shadow_pulse', cooldown: 7.2, range: 12, damage: 6, color: 0xa36cff },
  wild_machamp: { kind: 'super_strength', cooldown: 5.4, range: 5.4, damage: 9, color: 0xffd95a },
  cameo_toothless: { kind: 'plasma', cooldown: 7.2, range: 16, damage: 7, color: 0x7bbcff },
};

const GENERIC_LINES = [
  'Nice day for a completely normal Pokémon car chase.',
  'Did that Pikachu just steal a BMW?',
  'I should have stayed home today.',
  'Goldenrod is getting weirder every week.',
  'Why is there a Poliwag carrying a water pistol?',
  'I am definitely not insured for this.',
  'That highway is an insurance claim waiting to happen.',
  'I swear I just saw a Charizard over the radio tower.',
];

const HIT_LINES = [
  'HEY!',
  'WHAT WAS THAT FOR?!',
  'OW!',
  'CALL THE POLICE!',
  'I HAVE BONES, YOU KNOW!',
  'WHY AM I AIRBORNE?!',
];

// Character-specific lines for the large crossover roster. The previous Phase-8
// population all shared generic wrong-turn/car-theft chatter, which made the models
// feel like skins rather than characters. Keep each line short enough for an NPC
// bubble and give every cameo at least two recognisable/personality-matched options.
const CROSSOVER_DIALOGUES: Record<string, string[]> = {
  doc_brown: [
    'Great Scott! 1.21 Gigawatts of electricity needed!',
    "If you're gonna build a time machine into a car, why not do it with some style?",
    "The Flux Capacitor is what makes time travel possible.",
    "Roads? Where we're going, we don't need roads!",
    "When this baby hits 88 miles per hour... you're gonna see some serious stuff!",
  ],
  marty_mcfly: [
    'This is heavy, Doc!',
    'Wait a minute, Doc... Are you telling me you built a time machine... out of a DeLorean?!',
    'Whoa... check out that brushed stainless steel body!',
    "Doc, we don't have enough road to get up to 88!",
    'Hey, nobody calls me chicken!',
  ],
  donald_trump: ['This city has tremendous traffic. Nobody has traffic like this.', 'That is a very, very fast car.', 'Somebody needs to fix these roads.'],
  barack_obama: ['Let me be clear: that Pikachu is definitely speeding.', 'That is a pretty unusual motorcade.', 'I was promised a quiet walk today.'],
  peter_griffin: ['Hehehehe. This is worse than that time I got chased by a Charizard.', 'Road House.', 'Lois is never going to believe this.'],
  rick_sanchez: ['Morty, I told you not to touch the portal gun.', 'This universe has Pokémon AND Springfield? Of course it does.', '*checks portal gun* Yep. Still the wrong dimension.'],
  deadpool: ['Do I get XP for this cameo?', 'Nice HUD. Very subtle.', 'I definitely signed the crossover waiver.'],
  goku: ['You look strong! Want to spar?', 'Is there anywhere to eat around here?', 'That Charizard has incredible energy!'],
  peppa_pig: ["I'm Peppa Pig!", 'I love jumping in muddy puddles!', 'George, stay where Mummy can see you.'],
  george_pig: ['Dinosaur! Grrr!', 'Muddy puddles!', '*giggles and holds up his dinosaur*'],
  mummy_pig: ['Everybody ready?', 'Please stay together, children.', 'That was a rather bumpy drive.'],
  daddy_pig: ["I'm a bit of an expert at driving.", 'Ho ho! I know exactly where we are going.', 'Has anybody seen our red car?'],
  luigi: ['Luigi time!', 'Mario? M-Mario?!', 'I would rather take the green kart.'],
  peach: ['Thank you! But my castle is somewhere else.', 'I hope Mario is not causing trouble again.', 'A princess needs a smoother ride than this.'],
  bowser: ['BWAHAHA! This city is mine now!', 'Where is Mario?!', 'That little Pokémon has guts.'],
  wario: ['WAAAH! I smell money!', 'This car would sell for a fortune!', 'Move it! Wario is coming through!'],
  waluigi: ['WAAAH-LUIGI!', 'Everybody cheats except me!', 'Why does nobody build a purple sports car?'],
  toad: ['The princess is safe... I think!', 'This place needs more mushroom houses.', 'Please do not run me over!'],
  yoshi: ['Yoshi!', 'Yoshi-yoshi!', '*hungrily eyes a roadside fruit stand*'],
  steve: ['I could build a bridge faster than this.', 'I need wood. And maybe diamonds.', '*quietly punches a tree*'],
  villager: ['Hmmm.', 'Hrrm! Emeralds?', '*judges your trade offer*'],
  creeper: ['Sssssss...', '*gets uncomfortably close*', '...ssss?'],
  minecraft_zombie: ['Urrrrgh...', '*reaches for brains*', 'Rrrrgh!'],
  dr_doom: ['Doom does not wait in traffic.', 'This world will kneel before Doom.', 'Your tiny electric creature amuses Doom.'],
  miles_morales: ['Hey. I can do this.', 'Okay, that car chase is definitely not normal.', 'My spider-sense is going crazy.'],
  punk_spiderman: ['No rules. No masters.', 'That traffic system needs a revolution.', 'Nice chaos. Could use more guitar.'],
  punisher: ['Stay out of my way.', 'I do not miss twice.', 'That Hit & Run meter is getting my attention.'],
  darth_vader: ['I find your lack of road discipline disturbing.', 'The Force is strong with that one.', 'Do not make me stop this vehicle.'],
  stormtrooper: ['These are not the coordinates we were given.', 'I can hit a target. Probably.', 'Have you seen a rebel around here?'],
  yoda: ['Fast, that little Pokémon is.', 'Control your speed, you must.', 'A strange city, this is.'],
  palpatine: ['Good. Let the chaos flow through you.', 'Unlimited power!', 'Your Hit & Run meter is quite operational.'],
  mace_windu: ['Take a seat.', 'This traffic is outrageous.', 'I am keeping an eye on that Sith over there.'],
  pennywise: ['We all float down here.', 'Want a balloon?', 'That sewer route looks promising.'],
  art_clown: ['*waves silently*', '*grins far too widely*', '*honks an imaginary horn*'],
  donkey: ['I am making waffles!', 'Shrek! You seeing this?', 'That is one fast little Pokémon!'],
  puss_in_boots: ['Fear me, if you dare.', 'I have nine lives. Do not test all of them.', '*gives enormous pleading eyes*'],
  gru: ['Minions! Stop touching the cars.', 'This is not part of my plan.', 'I need a shrink ray for this traffic.'],
  minion: ['Bello!', 'Banana!', 'Papoy!'],
  vector: ['Committing crimes with both direction and magnitude.', 'OH YEAHHH!'],
  mr_bean: ['...Teddy?', '*looks at the car, then at you*', 'Oh dear.'],
  sulley: ['Kitty is off duty.', 'Please tell me Boo is not driving.', 'That scream could power Monstropolis.'],
  mike_wazowski: ['I am on a roll today!', 'I cannot believe I am being upstaged by a Pokémon.', 'Put that thing back where it came from!'],
  mr_incredible: ['Showtime.', 'I have got time.', 'That bridge needs a structural review.'],
  frozone: ['Where is my super suit?!', 'That road could use some ice.', 'Stay cool.'],
  po: ['Skadoosh!', 'There is no charge for awesomeness.', 'Is there a noodle shop around here?'],
  tai_lung: ['Finally, a worthy opponent.', 'The scroll should have been mine.', 'Do not mistake patience for weakness.'],
  master_shifu: ['Inner peace.', 'There is always something more to learn.', 'Your footwork needs discipline.'],
  toothless: ['*happy dragon chirp*', '*snorts and spreads his wings*', '*stares at the fish-shaped snacks*'],
  c3po: ['Oh dear! We are doomed.', 'The odds of this traffic are dreadful.', 'R2, please stop encouraging them.'],
  r2d2: ['BEEP-BWOOP!', '*indignant electronic whistle*', 'BWEE-DEE-DEE!'],
  chewbacca: ['RRAAAWWWR!', '*Wookiee grumbling*', 'WROOOAAAR!'],
  iron_man: ['Systems online.', 'Nice city. Needs more vertical parking.', 'Try not to dent the suit.'],
  spongebob: ['I am ready!', 'This river is not Bikini Bottom, but it will do!', 'Best day ever!'],
  baymax: ['Hello. I am Baymax.', 'On a scale of one to ten, how would you rate your driving?', 'I am satisfied with my care.'],
  jeffrey_epstein: ['Quite a strange city.', 'I was looking for a quieter street.', 'This traffic is impossible to ignore.'],
  diddy: ['Studio is that way, right?', 'That car has presence.', 'This city never stays quiet.'],
  billie_eilish: ['The green roots are staying.', 'This city needs a darker playlist.', 'That car is way too loud.'],
  drake: ['This city has views.', 'That ride is clean.', 'I am keeping an eye on the traffic.'],
  juice_wrld: ['Music makes the drive better.', 'That skyline feels like cover art.', 'Keep the speakers up.'],
  central_cee: ['Tracksuit weather.', 'Keep it moving.', 'That motor is serious.'],
  travis_scott: ['This place needs stage lights.', 'The energy out here is wild.', 'That engine sounds huge.'],
  kid_laroi: ['Long way from Sydney.', 'That road trip escalated quickly.', 'I need a quieter shortcut.'],
  morty_smith: ['Rick, are we supposed to be here?', 'This feels like a really bad idea.', 'Please tell me that car is not ours.'],
};


const BRAINROT_DIALOGUES: Record<string, string[]> = {
  tung_tung_sahur: [
    'TUNG TUNG TUNG... SAHUR!',
    '*taps the wooden bat in a strange rhythm*',
    'Three knocks. You should probably answer.',
  ],
  tralalero_tralala: [
    'Tralalero, tralala!',
    '*three sneakers squeak at once*',
    'Shark traffic rules are complicated.',
  ],
  bombardiro_crocodilo: [
    'Bombardiro Crocodilo!',
    '*engines rumble overhead*',
    'Airspace clear? Close enough.',
  ],
  ballerina_cappuccina: [
    'Ballerina Cappuccina!',
    '*pirouettes without spilling the coffee*',
    'One more spin.',
  ],
  cappuccino_assassino: [
    'Cappuccino Assassino.',
    '*draws both tiny swords dramatically*',
    'Espresso. Stealth. Repeat.',
  ],
  lirili_larila: [
    'Lirili Larila!',
    '*cactus trunk sways thoughtfully*',
    'Sandals on. Adventure time.',
  ],
};

export class NPCManager {
  public npcs: NPC[] = [];
  private scene: THREE.Scene;
  private groundHeight: GroundHeightProvider;
  private canOccupy: CanOccupyProvider;
  private canFlyOccupy: CanFlyOccupyProvider;
  private isRoadSurface: RoadSurfaceProvider;
  private isPedestrianSurface: PedestrianSurfaceProvider;
  private recoverPenetration: RecoverPenetrationProvider | null = null;
  private npcScratchBox = new THREE.Box3();
  private npcScratchChildBox = new THREE.Box3();
  /** Ground pedestrians may not intentionally enter these areas. Physical throws
   * can still put them there; this mask only governs ordinary navigation. */
  private groundForbidden: ((position: THREE.Vector3) => boolean) | null = null;
  /** Water-specific navigation is intentionally separate from the road/pedestrian
   * mask because bridge decks are legal road surfaces while swimmers must still
   * be able to pass through the water column beneath them. */
  private aquaticSurface: AquaticSurfaceProvider | null = null;
  private aquaticNPCs: NPC[] = [];
  private aquaticDynamicObstacles: AquaticDynamicObstacle[] = [];
  private pedestrianCrossings: PedestrianCrossingNode[] = [];
  private idCounter = 0;
  private combatEffects: CombatEffect[] = [];
  private tempStep = new THREE.Vector3();
  private tempNext = new THREE.Vector3();
  private playerPowerEffectHandler: ((effect: NPCPowerPlayerEffect) => void) | null = null;
  private worldPowerEffectHandler: ((effect: NPCPowerWorldEffect) => void) | null = null;
  private lastPlayerAggressionPosition = new THREE.Vector3();
  private lastPlayerAggressionTarget = new THREE.Vector3();
  private lastPlayerAggressionUntil = 0;
  private playerAggressionSerial = 0;
  /** Staggers medium/far NPC updates so a large roster does not run full AI every world tick. */
  private performanceFrame = 0;
  private hostileCacheTimer = 0;
  private cachedHostileNPCs: NPC[] = [];
  /** Nearby-only pedestrian broad phase. This prevents O(N²) crowd checks while
   * still making close NPCs behave like physical bodies instead of ghosts. */
  private readonly npcAvoidanceCellSize = 4.0;
  private npcAvoidanceGrid = new Map<string, NPC[]>();
  private npcAvoidanceScratch: NPC[] = [];
  /** Impact broad phase is deliberately separate from pedestrian avoidance. Walking
   * AI may ignore a fast ragdoll, but physics may not. This grid therefore keeps
   * thrown/downed/recovering bodies queryable without making normal pedestrians
   * steer around every tumbling character several metres in advance. */
  private npcPhysicalImpactGrid = new Map<string, NPC[]>();
  private npcPhysicalImpactScratch: NPC[] = [];
  private tempAvoidDirection = new THREE.Vector3();
  private tempAvoidRepel = new THREE.Vector3();
  private tempCrowdCandidate = new THREE.Vector3();
  /** Pair cooldowns stop one overlapping ragdoll/prop from re-applying the same
   * impact every substep while still allowing a genuinely new hit shortly after. */
  private secondaryImpactPairCooldowns = new Map<string, number>();
  private secondaryImpactCleanupAt = 0;
  private secondaryImpactScratchVelocity = new THREE.Vector3();
  private secondaryImpactScratchDirection = new THREE.Vector3();
  private recoveryDynamicProbe: RecoveryDynamicProbeProvider | null = null;
  private recoveryDynamicNudge: RecoveryDynamicNudgeProvider | null = null;
  private recoveryEscapeScratch = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    groundHeight?: GroundHeightProvider,
    canOccupy?: CanOccupyProvider,
    canFlyOccupy?: CanFlyOccupyProvider,
    isRoadSurface?: RoadSurfaceProvider,
    isPedestrianSurface?: PedestrianSurfaceProvider,
    recoverPenetration?: RecoverPenetrationProvider
  ) {
    this.scene = scene;
    this.groundHeight = groundHeight ?? (() => 0.12);
    this.canOccupy = canOccupy ?? (() => true);
    this.canFlyOccupy = canFlyOccupy ?? this.canOccupy;
    this.isRoadSurface = isRoadSurface ?? (() => false);
    this.isPedestrianSurface = isPedestrianSurface ?? (() => false);
    this.recoverPenetration = recoverPenetration ?? null;
    this.collectPedestrianCrossings();
    this.spawnNamedPopulation();
    this.spawnCameoPopulation();
    this.spawnAmbientPopulation();
  }

  public setPlayerPowerEffectHandler(handler: ((effect: NPCPowerPlayerEffect) => void) | null) {
    this.playerPowerEffectHandler = handler;
  }

  public setWorldPowerEffectHandler(handler: ((effect: NPCPowerWorldEffect) => void) | null) {
    this.worldPowerEffectHandler = handler;
  }

  public setGroundForbiddenPredicate(predicate: ((position: THREE.Vector3) => boolean) | null) {
    this.groundForbidden = predicate;
  }

  public setAquaticSurfacePredicate(predicate: AquaticSurfaceProvider | null) {
    this.aquaticSurface = predicate;
  }

  public setAquaticDynamicObstacles(obstacles: AquaticDynamicObstacle[]) {
    // Store position references rather than copying every frame. Moving boats update
    // their mesh.position in place, so swimmers see the live obstacle cheaply.
    this.aquaticDynamicObstacles = obstacles;
  }

  /** Dynamic props are simulated by WorldInteractionManager, so NPC recovery uses
   * tiny injected callbacks rather than duplicating that physics here. The probe is
   * only queried for downed/recovering NPCs, keeping ordinary pedestrian updates cheap. */
  public setRecoveryDynamicBlockerHandlers(
    probe: RecoveryDynamicProbeProvider | null,
    nudge: RecoveryDynamicNudgeProvider | null
  ) {
    this.recoveryDynamicProbe = probe;
    this.recoveryDynamicNudge = nudge;
  }

  /** Populate a bounded airport without teaching ordinary city pedestrians about
   * the runway. Passenger/staff wander boxes remain entirely inside the terminal;
   * ground crew receive tiny apron-only boxes north of the taxiway. */
  public spawnAirportPopulation(spawns: Array<{
    id: string; name: string; x: number; z: number; minX: number; maxX: number;
    minZ: number; maxZ: number; stationary?: boolean; variant: number;
    role: 'traveller' | 'staff' | 'ground_crew';
  }>) {
    for (const spawn of spawns) {
      if (this.npcs.some((npc) => npc.id === spawn.id)) continue;
      const npc = this.addNPC({
        id: spawn.id,
        name: spawn.name,
        type: `airport_${spawn.role}`,
        pos: [spawn.x, 0.12, spawn.z],
        dialogues: spawn.id === 'airport_cafe_worker'
          ? ['Fresh coffee, sandwiches and pastries!', 'Grab a drink before your gate starts boarding.']
          : spawn.role === 'ground_crew'
          ? ['Ground crew: Keep clear of the taxiway.', 'Turnaround is on schedule.']
          : spawn.role === 'staff'
          ? ['Welcome to Springfield Regional Airport.', 'Departures and gates are straight ahead.']
          : ['My flight better not be delayed.', 'I wonder if Krusty Airside Café is any good.'],
        modelFactory: () => createGenericCitizenNPC(spawn.variant),
        bounds: { minX: spawn.minX, maxX: spawn.maxX, minZ: spawn.minZ, maxZ: spawn.maxZ },
        stationary: !!spawn.stationary,
        combatWeight: spawn.role === 'ground_crew' ? 1.05 : 0.92,
      });
      npc.mesh.userData.airportRole = spawn.role;
      npc.mesh.userData.airportRestrictedToBounds = true;
      npc.mesh.userData.airportCafeWorker = spawn.id === 'airport_cafe_worker';
      if (spawn.id === 'airport_cafe_worker') npc.mesh.rotation.y = 0;
      // Simple high-visibility ground-crew treatment using cloned authored materials.
      if (spawn.role === 'ground_crew') {
        npc.mesh.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh) || !(obj.material instanceof THREE.MeshStandardMaterial)) return;
          const mat = obj.material.clone();
          mat.color.lerp(new THREE.Color(0xf6c344), 0.22);
          obj.material = mat;
        });
      }
    }
  }

  private getPowerProfile(npc: NPC): PowerProfile | null {
    return POWER_PROFILES[npc.id] ?? null;
  }

  /** Capture each model's authored standing limb pose once. Recovery animation is
   * procedural, so this lets wildly different cameo models return to their own
   * neutral pose instead of assuming every NPC has identical arms/legs. */
  private captureRecoveryBasePose(mesh: THREE.Group) {
    const pose: Record<string, [number, number, number]> = {};
    for (const name of ['arm_left', 'arm_right', 'leg_left', 'leg_right']) {
      const part = mesh.getObjectByName(name);
      if (!part) continue;
      pose[name] = [part.rotation.x, part.rotation.y, part.rotation.z];
    }
    mesh.userData.recoveryBasePose = pose;
  }

  private setRecoveryPartPose(
    npc: NPC,
    name: string,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    blend: number
  ) {
    const part = npc.mesh.getObjectByName(name);
    if (!part) return;
    const basePose = (npc.mesh.userData.recoveryBasePose ?? {}) as Record<string, [number, number, number]>;
    const base = basePose[name] ?? [0, 0, 0];
    part.rotation.x = THREE.MathUtils.lerp(part.rotation.x, base[0] + offsetX, blend);
    part.rotation.y = THREE.MathUtils.lerp(part.rotation.y, base[1] + offsetY, blend);
    part.rotation.z = THREE.MathUtils.lerp(part.rotation.z, base[2] + offsetZ, blend);
  }

  private restoreRecoveryBasePose(npc: NPC) {
    const basePose = (npc.mesh.userData.recoveryBasePose ?? {}) as Record<string, [number, number, number]>;
    for (const [name, rot] of Object.entries(basePose)) {
      const part = npc.mesh.getObjectByName(name);
      if (part) part.rotation.set(rot[0], rot[1], rot[2]);
    }
  }

  private getNPCBodyRadius(npc: NPC): number {
    const weight = Math.max(0.45, npc.combatWeight ?? npc.mesh.userData.combatWeight ?? 1);
    if (npc.state === 'knocked_out' || npc.state === 'recovering') return 0.40;
    return THREE.MathUtils.clamp(0.37 + weight * 0.075, 0.42, 0.66);
  }

  private getAquaticBodyRadius(npc: NPC): number {
    const weight = Math.max(0.35, npc.combatWeight ?? npc.mesh.userData.combatWeight ?? 1);
    if (npc.id === 'water_gyarados') return 1.35;
    if (npc.id === 'water_lapras') return 1.05;
    return THREE.MathUtils.clamp(0.38 + Math.sqrt(weight) * 0.20, 0.48, 0.86);
  }

  private aquaticCandidateClear(npc: NPC, candidate: THREE.Vector3, radius: number, height: number): boolean {
    const bounds = npc.mesh.userData.wanderBounds as SpawnConfig['bounds'] | undefined;
    if (bounds) {
      const margin = Math.min(radius * 0.45, 0.75);
      if (candidate.x < bounds.minX + margin || candidate.x > bounds.maxX - margin ||
          candidate.z < bounds.minZ + margin || candidate.z > bounds.maxZ - margin) return false;
    }
    if (this.aquaticSurface && !this.aquaticSurface(candidate)) return false;
    if (!this.canFlyOccupy(candidate, radius, height)) return false;

    // Keep swimming NPCs completely away from the Arcade causeway road (X: -7 to 23, Z: -250 to -160)
    // so aquatic Pokémon never get stuck on or near the road structure in the water.
    if (candidate.x >= -7 && candidate.x <= 23 && candidate.z >= -250 && candidate.z <= -160) return false;

    // Only a handful of authored swimmers exist, so this tiny aquatic-only list is
    // much cheaper than putting them into the full pedestrian crowd grid.
    for (const other of this.aquaticNPCs) {
      if (other === npc || !other.mesh.visible || other.state === 'defeated') continue;
      if (Math.abs(other.mesh.position.y - candidate.y) > 2.4) continue;
      const otherRadius = this.getAquaticBodyRadius(other);
      const dx = other.mesh.position.x - candidate.x;
      const dz = other.mesh.position.z - candidate.z;
      const minGap = (radius + otherRadius) * 0.82;
      if (dx * dx + dz * dz < minGap * minGap) return false;
    }

    for (const obstacle of this.aquaticDynamicObstacles) {
      if (obstacle.enabled && !obstacle.enabled()) continue;
      if (Math.abs(obstacle.position.y - candidate.y) > (obstacle.height ?? 3.2)) continue;
      const dx = obstacle.position.x - candidate.x;
      const dz = obstacle.position.z - candidate.z;
      const minGap = radius + Math.max(0.2, obstacle.radius);
      if (dx * dx + dz * dz < minGap * minGap) return false;
    }
    return true;
  }

  private aquaticStepClear(npc: NPC, from: THREE.Vector3, to: THREE.Vector3, radius: number, height: number): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    const spacing = Math.max(0.18, radius * 0.42);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.tempCrowdCandidate.set(
        from.x + dx * t,
        from.y + dy * t,
        from.z + dz * t,
      );
      if (!this.aquaticCandidateClear(npc, this.tempCrowdCandidate, radius, height)) return false;
    }
    return true;
  }

  /** Soft physical response for player/water-Pokémon contact. The swimmer yields a
   * little when there is clear water behind it, but never gets shoved through a
   * bridge support, boat, shoreline or another swimmer. */
  public pushSwimmingNPCFromPlayer(npc: NPC, direction: THREE.Vector3, distance: number): boolean {
    const mode = npc.movementMode ?? npc.mesh.userData.movementMode;
    if (mode !== 'swimming' || npc.state === 'defeated') return false;
    const dir = direction.clone().setY(0);
    if (dir.lengthSq() < 0.0001) return false;
    dir.normalize();
    const radius = this.getAquaticBodyRadius(npc);
    const height = Math.max(0.9, radius * 1.65);
    const candidate = npc.mesh.position.clone().addScaledVector(dir, THREE.MathUtils.clamp(distance, 0.03, 0.32));
    if (!this.aquaticStepClear(npc, npc.mesh.position, candidate, radius, height)) return false;
    npc.mesh.position.x = candidate.x;
    npc.mesh.position.z = candidate.z;
    npc.mesh.userData.swimContactYield = 0.18;
    this.syncNPCPosition(npc);
    return true;
  }

  public getAquaticNPCsNear(center: THREE.Vector3, radius: number): NPC[] {
    const r2 = radius * radius;
    return this.aquaticNPCs.filter((npc) => {
      if (!npc.mesh.visible || npc.state === 'defeated') return false;
      const dx = npc.mesh.position.x - center.x;
      const dz = npc.mesh.position.z - center.z;
      return dx * dx + dz * dz <= r2;
    });
  }

  private isNPCAvoidanceObstacle(npc: NPC): boolean {
    const mode = npc.movementMode ?? npc.mesh.userData.movementMode ?? 'ground';
    if (mode === 'flying' || mode === 'swimming') return false;
    if (npc.state === 'defeated' || npc.state === 'kicked' || npc.state === 'grabbed') return false;
    if (npc.mesh.userData.heldByPlayer) return false;
    return true;
  }

  private isNPCMovableForSeparation(npc: NPC): boolean {
    if (!this.isNPCAvoidanceObstacle(npc)) return false;
    if (npc.state === 'knocked_out' || npc.state === 'recovering') return false;
    if (npc.mesh.userData.stationary || npc.mesh.userData.specialInteractionActive) return false;
    return true;
  }

  private npcAvoidanceKey(x: number, z: number): string {
    const inv = 1 / this.npcAvoidanceCellSize;
    return `${Math.floor(x * inv)},${Math.floor(z * inv)}`;
  }

  /** Rebuilt once per NPC tick. Normal far walkers stay out of the grid, but a
   * pedestrian actively clearing a road/crossing remains indexed even beyond the
   * usual radius so transit-critical NPCs still respect each other while moving. */
  private rebuildNPCAvoidanceGrid(playerPos: THREE.Vector3, radius = 112): void {
    this.npcAvoidanceGrid.clear();
    const radiusSq = radius * radius;
    for (const npc of this.npcs) {
      if (!this.isNPCAvoidanceObstacle(npc)) continue;
      const dx = npc.mesh.position.x - playerPos.x;
      const dz = npc.mesh.position.z - playerPos.z;
      if (dx * dx + dz * dz > radiusSq && !this.isPedestrianTransitCritical(npc)) continue;
      const key = this.npcAvoidanceKey(npc.mesh.position.x, npc.mesh.position.z);
      let cell = this.npcAvoidanceGrid.get(key);
      if (!cell) {
        cell = [];
        this.npcAvoidanceGrid.set(key, cell);
      }
      cell.push(npc);
    }
  }

  private queryNearbyAvoidanceNPCs(position: THREE.Vector3, radius: number): NPC[] {
    const out = this.npcAvoidanceScratch;
    out.length = 0;
    const cell = this.npcAvoidanceCellSize;
    const minX = Math.floor((position.x - radius) / cell);
    const maxX = Math.floor((position.x + radius) / cell);
    const minZ = Math.floor((position.z - radius) / cell);
    const maxZ = Math.floor((position.z + radius) / cell);
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gz = minZ; gz <= maxZ; gz++) {
        const bucket = this.npcAvoidanceGrid.get(`${gx},${gz}`);
        if (!bucket) continue;
        for (const npc of bucket) out.push(npc);
      }
    }
    return out;
  }

  private isNPCPhysicalImpactBody(npc: NPC): boolean {
    const mode = npc.movementMode ?? npc.mesh.userData.movementMode ?? 'ground';
    if (mode === 'flying' || mode === 'swimming') return false;
    if (npc.state === 'grabbed' || npc.mesh.userData.heldByPlayer) return false;
    return true;
  }

  /** Nearby physics bodies, including kicked/downed/recovering characters. This is
   * what a thrown NPC collides with; it intentionally does NOT reuse the pedestrian
   * avoidance filter, because that filter excludes ragdolls by design. */
  private rebuildNPCPhysicalImpactGrid(playerPos: THREE.Vector3, radius = 150): void {
    this.npcPhysicalImpactGrid.clear();
    const radiusSq = radius * radius;
    for (const npc of this.npcs) {
      if (!this.isNPCPhysicalImpactBody(npc)) continue;
      const dx = npc.mesh.position.x - playerPos.x;
      const dz = npc.mesh.position.z - playerPos.z;
      const activePhysics = npc.state === 'kicked' || npc.state === 'knocked_out' || npc.state === 'recovering';
      if (dx * dx + dz * dz > radiusSq && !activePhysics) continue;
      const key = this.npcAvoidanceKey(npc.mesh.position.x, npc.mesh.position.z);
      let cell = this.npcPhysicalImpactGrid.get(key);
      if (!cell) {
        cell = [];
        this.npcPhysicalImpactGrid.set(key, cell);
      }
      cell.push(npc);
    }
  }

  private queryNearbyPhysicalNPCs(position: THREE.Vector3, radius: number): NPC[] {
    const out = this.npcPhysicalImpactScratch;
    out.length = 0;
    const cell = this.npcAvoidanceCellSize;
    const minX = Math.floor((position.x - radius) / cell);
    const maxX = Math.floor((position.x + radius) / cell);
    const minZ = Math.floor((position.z - radius) / cell);
    const maxZ = Math.floor((position.z + radius) / cell);
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gz = minZ; gz <= maxZ; gz++) {
        const bucket = this.npcPhysicalImpactGrid.get(`${gx},${gz}`);
        if (!bucket) continue;
        for (const npc of bucket) out.push(npc);
      }
    }
    return out;
  }

  /** Local steering only: no global replanning. Head-on pedestrians share a
   * predictable keep-left bias, while overtaking/obstacle cases steer away from the
   * occupied side. Returns a speed multiplier and writes the adjusted direction. */
  private computePedestrianAvoidance(
    npc: NPC,
    desiredDirection: THREE.Vector3,
    activeCrossing: boolean,
    outDirection: THREE.Vector3
  ): number {
    outDirection.copy(desiredDirection).setY(0);
    if (outDirection.lengthSq() < 0.0001) return 1;
    outDirection.normalize();

    const ownRadius = this.getNPCBodyRadius(npc);
    const neighbors = this.queryNearbyAvoidanceNPCs(npc.mesh.position, 3.2);
    let steerX = 0;
    let steerZ = 0;
    let speedScale = 1;
    const leftX = -desiredDirection.z;
    const leftZ = desiredDirection.x;

    for (const other of neighbors) {
      if (other === npc) continue;
      const dx = other.mesh.position.x - npc.mesh.position.x;
      const dz = other.mesh.position.z - npc.mesh.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < 0.000001 || distSq > 3.2 * 3.2) continue;
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      const otherRadius = this.getNPCBodyRadius(other);
      const contact = ownRadius + otherRadius;
      const personalSpace = contact + 0.40;
      const ahead = desiredDirection.x * nx + desiredDirection.z * nz;
      if (ahead < -0.25 && dist > personalSpace) continue;

      // Close proximity: slow down smoothly rather than violently pushing backwards
      if (dist < contact + 0.15 && ahead > -0.1) {
        const gap = Math.max(0, dist - contact);
        speedScale = Math.min(speedScale, THREE.MathUtils.clamp(gap / 0.15, 0.15, 0.55));
      }

      if (ahead > -0.15 && dist < personalSpace + 1.25) {
        const proximity = 1 - THREE.MathUtils.clamp((dist - personalSpace) / 1.25, 0, 1);
        const cross = desiredDirection.x * nz - desiredDirection.z * nx;
        let sideSign: number;
        if (Math.abs(cross) < 0.22 && ahead > 0.35) {
          sideSign = Number(npc.mesh.userData.crowdAvoidSide ?? 0);
          if (sideSign !== 1 && sideSign !== -1) {
            sideSign = Array.from(npc.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
            npc.mesh.userData.crowdAvoidSide = sideSign;
          }
        } else {
          sideSign = cross > 0 ? -1 : 1;
        }
        // Steer purely laterally (perpendicular to intended motion) to sidestep cleanly
        steerX += leftX * sideSign * proximity * 1.5;
        steerZ += leftZ * sideSign * proximity * 1.5;

        if (ahead > 0.20) {
          const gapScale = THREE.MathUtils.clamp((dist - contact) / 1.1, 0.25, 1);
          speedScale = Math.min(speedScale, gapScale);
        }
      }
    }

    outDirection.x = desiredDirection.x + steerX * 0.95;
    outDirection.z = desiredDirection.z + steerZ * 0.95;
    if (outDirection.lengthSq() < 0.0001) {
      outDirection.copy(desiredDirection).setY(0);
    } else {
      outDirection.normalize();
    }

    // Mathematically prevent any backward component from ever being produced by avoidance.
    // The forward projection must remain at least 0.32 (max ~71 degree deflection).
    const fwdDot = outDirection.dot(desiredDirection);
    if (fwdDot < 0.32) {
      const lateralSign = (outDirection.x * leftX + outDirection.z * leftZ) >= 0 ? 1 : -1;
      outDirection.x = desiredDirection.x * 0.35 + leftX * lateralSign * 0.93;
      outDirection.z = desiredDirection.z * 0.35 + leftZ * lateralSign * 0.93;
      outDirection.normalize();
    }

    if (activeCrossing) {
      if (outDirection.dot(desiredDirection) < 0.45) {
        outDirection.lerp(desiredDirection, 0.40).normalize();
      }
    }
    return speedScale;
  }

  /** Deadlock escape used when an NPC's intended movement step is blocked by another NPC.
   * Works both inside zebra crossings (allowing wide multi-lane sidesteps) and on
   * sidewalks/plazas so pedestrians never queue indefinitely behind someone. */
  private findCrowdBypassStep(
    npc: NPC,
    crossing: PedestrianCrossingNode | null,
    desiredDirection: THREE.Vector3,
    stepDistance: number,
    bounds?: SpawnConfig['bounds'],
    activeCrossing = false
  ): THREE.Vector3 | null {
    const forward = desiredDirection.clone().setY(0);
    if (forward.lengthSq() < 0.0001) return null;
    forward.normalize();
    const left = new THREE.Vector3(-forward.z, 0, forward.x);
    let preferredSide = Number(npc.mesh.userData.crowdAvoidSide ?? 0);
    if (preferredSide !== 1 && preferredSide !== -1) {
      preferredSide = Array.from(npc.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
      npc.mesh.userData.crowdAvoidSide = preferredSide;
    }

    const forwardStep = THREE.MathUtils.clamp(stepDistance * 0.85, 0.04, 0.35);
    const forwardSteps = [forwardStep, forwardStep * 0.5, forwardStep * 0.15, 0.0];
    const lateralSteps = activeCrossing && crossing
      ? [0.45, 0.85, 1.30, 1.80, 2.35, 2.95, 3.60]
      : [0.40, 0.75, 1.15, 1.60, 2.10];

    for (const lateral of lateralSteps) {
      for (const side of [preferredSide, -preferredSide]) {
        for (const fwd of forwardSteps) {
          const candidate = npc.mesh.position.clone()
            .addScaledVector(forward, fwd)
            .addScaledVector(left, lateral * side);
          candidate.y = this.groundHeight(candidate.x, candidate.z, npc.mesh.position.y);
          if (activeCrossing && crossing) {
            if (!this.isInsideCrossingCorridor(crossing, candidate)) continue;
          } else {
            if (!this.pointWithinWanderBounds(candidate, bounds, 0.15)) continue;
            if (this.isRoadSurface(candidate.x, candidate.z, 0.12)) continue;
          }
          if (this.groundForbidden?.(candidate)) continue;
          if (!this.canOccupy(candidate, 0.44, 1.72)) continue;
          if (this.pedestrianCandidateOverlapsNPC(npc, candidate, 0.02)) continue;

          npc.mesh.userData.crowdAvoidSide = side;
          return candidate;
        }
      }
    }
    npc.mesh.userData.crowdAvoidSide = -preferredSide;
    return null;
  }

  /** Obstacle / Wall circumvention. When an NPC's movement step encounters a wall,
   * building, fence, or prop, this method computes a bypass step along the wall surface
   * or around the obstacle so they smoothly walk around it rather than getting stuck. */
  private findPedestrianWorldBypassStep(
    npc: NPC,
    moveDirection: THREE.Vector3,
    stepDistance: number,
    bounds?: SpawnConfig['bounds'],
    crossing?: PedestrianCrossingNode | null,
    activeCrossing = false
  ): THREE.Vector3 | null {
    const pos = npc.mesh.position;
    const forward = moveDirection.clone().setY(0);
    if (forward.lengthSq() < 0.0001) return null;
    forward.normalize();
    const left = new THREE.Vector3(-forward.z, 0, forward.x);

    const isLegalCandidate = (candidate: THREE.Vector3): boolean => {
      candidate.y = this.groundHeight(candidate.x, candidate.z, pos.y);
      if (activeCrossing && crossing) {
        if (!this.isInsideCrossingCorridor(crossing, candidate)) return false;
      } else {
        if (!this.pointWithinWanderBounds(candidate, bounds, 0.15)) return false;
        if (this.isRoadSurface(candidate.x, candidate.z, 0.12)) return false;
      }
      if (this.groundForbidden?.(candidate)) return false;
      if (!this.canOccupy(candidate, 0.44, 1.72)) return false;
      if (this.pedestrianCandidateOverlapsNPC(npc, candidate, 0.02)) return false;
      return true;
    };

    // 1. Direct Axis Slide (X or Z component) along the wall plane
    const stepDist = Math.max(0.04, stepDistance);
    if (Math.abs(forward.x) > 0.15) {
      const candX = pos.clone();
      candX.x += forward.x * stepDist;
      if (isLegalCandidate(candX)) {
        if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
        npc.walkDirection.lerp(new THREE.Vector3(Math.sign(forward.x), 0, 0), 0.40).normalize();
        return candX;
      }
    }
    if (Math.abs(forward.z) > 0.15) {
      const candZ = pos.clone();
      candZ.z += forward.z * stepDist;
      if (isLegalCandidate(candZ)) {
        if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
        npc.walkDirection.lerp(new THREE.Vector3(0, 0, Math.sign(forward.z)), 0.40).normalize();
        return candZ;
      }
    }

    // 2. Circumvention Angles (probing forward and laterally around the wall / corner)
    let preferredSide = Number(npc.mesh.userData.wallAvoidSide ?? 0);
    if (preferredSide !== 1 && preferredSide !== -1) {
      preferredSide = Array.from(npc.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
      npc.mesh.userData.wallAvoidSide = preferredSide;
    }

    // Angles from ~26 deg up to 90 deg (forward and lateral only, NEVER backwards)
    const angles = [0.45, 0.75, 1.10, 1.57];
    const distances = [stepDist * 1.1, stepDist * 0.8, stepDist * 0.5];

    for (const side of [preferredSide, -preferredSide]) {
      for (const angle of angles) {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle) * side;
        const bypassDir = forward.clone().multiplyScalar(cosA).addScaledVector(left, sinA).normalize();

        for (const dist of distances) {
          const candidate = pos.clone().addScaledVector(bypassDir, dist);
          if (isLegalCandidate(candidate)) {
            npc.mesh.userData.wallAvoidSide = side;
            if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
            npc.walkDirection.lerp(bypassDir, 0.45).normalize();
            return candidate;
          }
        }
      }
    }

    npc.mesh.userData.wallAvoidSide = -preferredSide;
    return null;
  }

  /** Depenetrate an NPC if geometry was placed on top of them or if they clipped a wall. */
  private depenetrateNPC(npc: NPC): boolean {
    const pos = npc.mesh.position;
    if (this.canOccupy(pos, 0.44, 1.70)) return true;
    if (this.recoverPenetration) {
      const recovered = this.recoverPenetration(pos, 0.44, 1.70);
      recovered.y = this.groundHeight(recovered.x, recovered.z, pos.y);
      if (this.canOccupy(recovered, 0.44, 1.70)) {
        npc.mesh.position.copy(recovered);
        this.syncNPCPosition(npc);
        return true;
      }
    }
    const bounds = npc.mesh.userData.wanderBounds as SpawnConfig['bounds'] | undefined;
    for (const r of [0.25, 0.55, 0.95, 1.45, 2.10]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const candidate = new THREE.Vector3(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
        candidate.y = this.groundHeight(candidate.x, candidate.z, pos.y);
        if (this.pointWithinWanderBounds(candidate, bounds, 0.15) &&
            !this.isRoadSurface(candidate.x, candidate.z, 0.10) &&
            !this.groundForbidden?.(candidate) &&
            this.canOccupy(candidate, 0.44, 1.70)) {
          npc.mesh.position.copy(candidate);
          this.syncNPCPosition(npc);
          return true;
        }
      }
    }
    return false;
  }

  private pedestrianCandidateOverlapsNPC(npc: NPC, candidate: THREE.Vector3, margin = 0.05): boolean {
    const ownRadius = this.getNPCBodyRadius(npc);
    const neighbors = this.queryNearbyAvoidanceNPCs(candidate, ownRadius + 1.0);
    for (const other of neighbors) {
      if (other === npc) continue;
      const otherRadius = this.getNPCBodyRadius(other);
      const dx = candidate.x - other.mesh.position.x;
      const dz = candidate.z - other.mesh.position.z;
      const minDistance = ownRadius + otherRadius + margin;
      if (dx * dx + dz * dz < minDistance * minDistance) return true;
    }
    return false;
  }

  private canSeparateNPCTo(npc: NPC, candidate: THREE.Vector3): boolean {
    candidate.y = this.groundHeight(candidate.x, candidate.z, npc.mesh.position.y);
    if (this.groundForbidden?.(candidate)) return false;
    if (!this.canOccupy(candidate, this.getNPCBodyRadius(npc), 1.72)) return false;
    // A body-separation nudge must never become accidental jaywalking. If the NPC
    // is currently off-road, do not push them onto asphalt merely to resolve a crowd.
    const currentOnRoad = this.isRoadSurface(npc.mesh.position.x, npc.mesh.position.z, 0.08);
    if (!currentOnRoad && this.isRoadSurface(candidate.x, candidate.z, 0.08)) return false;
    if (currentOnRoad && String(npc.mesh.userData.pedestrianRouteKind ?? '') === 'crossing') {
      const crossing = this.getCrossingById(String(npc.mesh.userData.pedestrianCrossingId ?? ''));
      if (crossing && !this.isInsideCrossingCorridor(crossing, candidate)) return false;
    }
    return true;
  }

  /** Final tiny contact solver for standing/walking bodies. It catches spawn or
   * low-FPS overlaps without stealing control from kicked/thrown ragdolls. */
  private resolveNPCBodyOverlaps(playerPos: THREE.Vector3): void {
    this.rebuildNPCAvoidanceGrid(playerPos, 86);
    const maxDistanceSq = 86 * 86;
    for (const npc of this.npcs) {
      if (!this.isNPCMovableForSeparation(npc)) continue;
      const pdx = npc.mesh.position.x - playerPos.x;
      const pdz = npc.mesh.position.z - playerPos.z;
      if (pdx * pdx + pdz * pdz > maxDistanceSq) continue;
      const ownRadius = this.getNPCBodyRadius(npc);
      const neighbors = this.queryNearbyAvoidanceNPCs(npc.mesh.position, ownRadius + 0.9);
      for (const other of neighbors) {
        if (other === npc || !this.isNPCAvoidanceObstacle(other)) continue;
        const otherMovable = this.isNPCMovableForSeparation(other);
        // Movable/movable pairs are solved once. Stationary/downed obstacles are
        // never outer-loop actors, so the movable character must always resolve
        // against them regardless of lexical id ordering.
        if (otherMovable && other.id <= npc.id) continue;
        const dx = npc.mesh.position.x - other.mesh.position.x;
        const dz = npc.mesh.position.z - other.mesh.position.z;
        const distSq = dx * dx + dz * dz;
        const target = ownRadius + this.getNPCBodyRadius(other) + 0.025;
        if (distSq >= target * target) continue;
        const dist = Math.sqrt(Math.max(0.000001, distSq));
        let nx = dx / dist;
        let nz = dz / dist;
        if (distSq < 0.00001) {
          // Stable deterministic fallback for two characters spawned at the same spot.
          const sign = npc.id < other.id ? 1 : -1;
          nx = sign;
          nz = 0;
        }
        const penetration = target - dist;
        const ownShare = otherMovable ? 0.5 : 1.0;
        const otherShare = otherMovable ? 0.5 : 0.0;
        // Gentle relaxation nudge (max 0.025m per frame) so physical separation never jerks or teleports
        const amount = Math.min(0.025, penetration * 0.45);

        // For walking NPCs, resolve overlap laterally (sideways) rather than pushing backward along their walking vector
        let ownNx = nx;
        let ownNz = nz;
        if (npc.state === 'walking' && npc.walkDirection && npc.walkDirection.lengthSq() > 0.01) {
          const fwdDot = ownNx * npc.walkDirection.x + ownNz * npc.walkDirection.z;
          if (fwdDot < 0) {
            const perpX = -npc.walkDirection.z;
            const perpZ = npc.walkDirection.x;
            const side = (ownNx * perpX + ownNz * perpZ) >= 0 ? 1 : -1;
            ownNx = perpX * side;
            ownNz = perpZ * side;
          }
        }

        this.tempCrowdCandidate.copy(npc.mesh.position);
        this.tempCrowdCandidate.x += ownNx * amount * ownShare;
        this.tempCrowdCandidate.z += ownNz * amount * ownShare;
        if (this.canSeparateNPCTo(npc, this.tempCrowdCandidate)) {
          npc.mesh.position.copy(this.tempCrowdCandidate);
          npc.mesh.userData.bodyPushTimer = Math.max(Number(npc.mesh.userData.bodyPushTimer ?? 0), 0.12);
          this.syncNPCPosition(npc);
        }

        if (otherShare > 0) {
          let otherNx = -nx;
          let otherNz = -nz;
          if (other.state === 'walking' && other.walkDirection && other.walkDirection.lengthSq() > 0.01) {
            const fwdDot = otherNx * other.walkDirection.x + otherNz * other.walkDirection.z;
            if (fwdDot < 0) {
              const perpX = -other.walkDirection.z;
              const perpZ = other.walkDirection.x;
              const side = (otherNx * perpX + otherNz * perpZ) >= 0 ? 1 : -1;
              otherNx = perpX * side;
              otherNz = perpZ * side;
            }
          }

          this.tempCrowdCandidate.copy(other.mesh.position);
          this.tempCrowdCandidate.x += otherNx * amount * otherShare;
          this.tempCrowdCandidate.z += otherNz * amount * otherShare;
          if (this.canSeparateNPCTo(other, this.tempCrowdCandidate)) {
            other.mesh.position.copy(this.tempCrowdCandidate);
            other.mesh.userData.bodyPushTimer = Math.max(Number(other.mesh.userData.bodyPushTimer ?? 0), 0.12);
            this.syncNPCPosition(other);
          }
        }
      }
    }
  }

  /**
   * Shared body-volume check for characters. `flight` additionally respects the
   * ceiling/roof blockers that ground characters are allowed to stand underneath.
   * `avoidNPCs` is used by large ground characters such as Ash's Charizard so they
   * do not simply walk through pedestrians while chasing the player.
   */
  private canCharacterOccupy(
    npc: NPC,
    position: THREE.Vector3,
    radius: number,
    height: number,
    flight = false,
    avoidNPCs = false
  ): boolean {
    const worldClear = flight
      ? this.canFlyOccupy(position, radius, height)
      : this.canOccupy(position, radius, height);
    if (!worldClear) return false;
    if (flight) {
      const terrain = this.groundHeight(position.x, position.z, position.y, 120, 0.12);
      if (position.y < terrain - 0.02) return false;
    }
    if (!avoidNPCs) return true;

    const bottom = position.y + 0.04;
    const top = position.y + height - 0.04;
    for (const other of this.npcs) {
      if (other === npc || !other.mesh.visible || other.state === 'defeated') continue;
      if (other.mesh.userData.specialInteractionActive && other.id === npc.id) continue;
      const weight = Math.max(0.45, other.combatWeight ?? other.mesh.userData.combatWeight ?? 1);
      const fallen = other.state === 'kicked' || other.state === 'knocked_out' || other.state === 'recovering';
      const otherRadius = fallen ? 0.34 : THREE.MathUtils.clamp(0.38 + weight * 0.07, 0.42, 0.64);
      const otherHeight = fallen ? 0.75 : THREE.MathUtils.clamp(1.55 + weight * 0.23, 1.68, 2.45);
      const otherBottom = other.mesh.position.y;
      const otherTop = otherBottom + otherHeight;
      if (top <= otherBottom + 0.08 || bottom >= otherTop - 0.08) continue;
      const dx = position.x - other.mesh.position.x;
      const dz = position.z - other.mesh.position.z;
      const minDistance = radius + otherRadius;
      if (dx * dx + dz * dz < minDistance * minDistance) return false;
    }
    return true;
  }

  /** Sample a complete 3D character path so low FPS / throttled AI cannot tunnel a
   * flying body through a wall, roof, ceiling or tall prop between frames. */
  private canTraverseCharacterPath(
    npc: NPC,
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    height: number,
    flight: boolean,
    avoidNPCs = false
  ): boolean {
    const distance = start.distanceTo(end);
    const steps = THREE.MathUtils.clamp(Math.ceil(distance / 0.28), 1, 28);
    const sample = new THREE.Vector3();
    for (let i = 1; i <= steps; i++) {
      sample.lerpVectors(start, end, i / steps);
      if (!this.canCharacterOccupy(npc, sample, radius, height, flight, avoidNPCs)) return false;
    }
    return true;
  }

  /**
   * Collision-aware flying movement shared by Ash's Charizard and ordinary flying
   * NPCs. It first tries the requested path, then slides/turns around the obstacle,
   * and only climbs when there is verified vertical clearance.
   */
  private moveFlyingNPC(
    npc: NPC,
    desiredDelta: THREE.Vector3,
    radius: number,
    height: number,
    maxFeetY = Infinity,
    avoidNPCs = false
  ): { moved: boolean; blocked: boolean } {
    const total = desiredDelta.length();
    if (total < 0.0001) return { moved: false, blocked: false };

    const steps = THREE.MathUtils.clamp(Math.ceil(total / 0.24), 1, 24);
    const increment = desiredDelta.clone().multiplyScalar(1 / steps);
    let moved = false;
    let blocked = false;
    let avoidSide = Number(npc.mesh.userData.flightAvoidSide ?? 0);
    if (avoidSide !== 1 && avoidSide !== -1) {
      avoidSide = Math.random() > 0.5 ? 1 : -1;
      npc.mesh.userData.flightAvoidSide = avoidSide;
    }

    const tryCandidate = (candidate: THREE.Vector3) => {
      if (candidate.y > maxFeetY) candidate.y = maxFeetY;
      if (!this.canCharacterOccupy(npc, candidate, radius, height, true, avoidNPCs)) return false;
      npc.mesh.position.copy(candidate);
      moved = true;
      return true;
    };

    for (let i = 0; i < steps; i++) {
      const current = npc.mesh.position.clone();
      const direct = current.clone().add(increment);
      if (tryCandidate(direct)) continue;

      blocked = true;
      const planar = new THREE.Vector3(increment.x, 0, increment.z);
      const planarLength = planar.length();
      let resolved = false;

      // Keep any safe vertical component while sliding around the obstacle.
      if (planarLength > 0.0001) {
        const side = new THREE.Vector3(-planar.z, 0, planar.x).normalize();
        for (const sign of [avoidSide, -avoidSide]) {
          const sidestep = current.clone()
            .addScaledVector(side, sign * Math.max(planarLength * 1.15, 0.12));
          sidestep.y += increment.y;
          if (tryCandidate(sidestep)) {
            npc.mesh.userData.flightAvoidSide = sign;
            resolved = true;
            break;
          }
        }
      }
      if (resolved) continue;

      // A low sign/fence/prop may be safely overflown, but only after proving the
      // extra vertical body volume is clear. Buildings/ceilings therefore remain solid.
      const climb = current.clone();
      climb.x += increment.x * 0.55;
      climb.z += increment.z * 0.55;
      climb.y += Math.max(0.34, increment.y);
      if (climb.y <= maxFeetY + 0.001 && tryCandidate(climb)) continue;

      // No legal route this sub-step: stop instead of clipping through geometry.
      break;
    }

    return { moved, blocked };
  }

  private findSafeGroundPosition(
    npc: NPC,
    preferred: THREE.Vector3,
    radius: number,
    height: number,
    searchRadius = 4.5,
    bounds?: SpawnConfig['bounds'],
    requirePedestrianSafe = false
  ): THREE.Vector3 | null {
    const rings = Array.from(new Set([0, 0.7, 1.35, 2.1, 3.0, 4.5, 6.5, 9.0, searchRadius])).filter((r) => r <= searchRadius + 0.001);
    for (const ring of rings) {
      const samples = ring === 0 ? 1 : 12;
      for (let i = 0; i < samples; i++) {
        const angle = ring === 0 ? 0 : (i / samples) * Math.PI * 2;
        const candidate = new THREE.Vector3(
          preferred.x + Math.cos(angle) * ring,
          preferred.y,
          preferred.z + Math.sin(angle) * ring
        );
        // If a character has an authored neighbourhood, never "fix" a blocked
        // spawn by moving it through a wall/road into a different district. This
        // keeps safe-spawn recovery aligned with the same local wander bounds.
        if (bounds && (
          candidate.x < bounds.minX || candidate.x > bounds.maxX ||
          candidate.z < bounds.minZ || candidate.z > bounds.maxZ
        )) continue;
        candidate.y = this.groundHeight(candidate.x, candidate.z, preferred.y, 120, 0.12);
        if (requirePedestrianSafe) {
          if (this.isRoadSurface(candidate.x, candidate.z, 0.12)) continue;
          if (this.getCrossingAtPosition(candidate)) continue;
          if (this.groundForbidden?.(candidate)) continue;
        }
        if (this.canCharacterOccupy(npc, candidate, radius, height, false, true)) return candidate;
      }
    }
    return null;
  }

  private findSafeFlightLanding(
    npc: NPC,
    preferred: THREE.Vector3,
    radius: number,
    height: number,
    searchRadius = 5.0
  ): THREE.Vector3 | null {
    const rings = [0, 0.8, 1.6, 2.6, 3.8, searchRadius];
    for (const ring of rings) {
      const samples = ring === 0 ? 1 : 14;
      for (let i = 0; i < samples; i++) {
        const angle = ring === 0 ? 0 : (i / samples) * Math.PI * 2;
        const landing = new THREE.Vector3(
          preferred.x + Math.cos(angle) * ring,
          preferred.y,
          preferred.z + Math.sin(angle) * ring
        );
        landing.y = this.groundHeight(landing.x, landing.z, npc.mesh.position.y, 120, 0.12);
        if (!this.canCharacterOccupy(npc, landing, radius, height, false, true)) continue;

        const approach = new THREE.Vector3(landing.x, Math.max(npc.mesh.position.y, landing.y + 0.35), landing.z);
        if (!this.canTraverseCharacterPath(npc, npc.mesh.position, approach, radius, height, true, false)) continue;
        if (!this.canTraverseCharacterPath(npc, approach, landing, radius, height, true, true)) continue;
        return landing;
      }
    }
    return null;
  }

  /** A recovery footprint is only truly clear when static/dynamic world collision
   * AND nearby character bodies leave enough room to stand. Dynamic props get a
   * dedicated probe so recovery can push them first instead of teleporting through. */
  private isRecoveryStandingClear(npc: NPC, position: THREE.Vector3): boolean {
    if (!this.canCharacterOccupy(npc, position, 0.43, 1.62, false, true)) return false;
    const dynamic = this.recoveryDynamicProbe?.(position, 0.43, 1.62);
    return !dynamic?.blocked;
  }

  /** Direction away from overlapping character bodies. This is used only for
   * downed/recovering NPCs, never for ordinary walking separation. */
  private recoveryNPCSeparationDirection(npc: NPC): THREE.Vector3 {
    const out = this.recoveryEscapeScratch.set(0, 0, 0);
    const ownRadius = Math.max(0.36, this.getNPCBodyRadius(npc) * 0.92);
    const neighbors = this.queryNearbyPhysicalNPCs(npc.mesh.position, ownRadius + 1.25);
    for (const other of neighbors) {
      if (other === npc || !this.isNPCPhysicalImpactBody(other)) continue;
      const dx = npc.mesh.position.x - other.mesh.position.x;
      const dz = npc.mesh.position.z - other.mesh.position.z;
      const otherRadius = Math.max(0.32, this.getNPCBodyRadius(other) * 0.88);
      const target = ownRadius + otherRadius + 0.06;
      const distSq = dx * dx + dz * dz;
      if (distSq >= target * target) continue;
      const dist = Math.sqrt(Math.max(0.000001, distSq));
      if (distSq < 0.00001) {
        // Deterministic split for two ragdolls stacked at the exact same X/Z.
        const sign = npc.id < other.id ? 1 : -1;
        out.x += sign * target;
      } else {
        const penetration = target - dist;
        out.x += (dx / dist) * Math.max(0.08, penetration);
        out.z += (dz / dist) * Math.max(0.08, penetration);
      }
    }
    if (out.lengthSq() > 0.0001) out.normalize();
    return out;
  }

  /** Crawl/roll one small physical step while pinned. Full standing clearance is NOT
   * required yet, but the low body volume still has to be collision-free. */
  private tryRecoveryCrawlStep(
    npc: NPC,
    ground: number,
    preferredDirection: THREE.Vector3,
    blockedSeconds: number
  ): boolean {
    const base = preferredDirection.clone().setY(0);
    if (base.lengthSq() < 0.0001) {
      base.set(Math.sin(npc.mesh.rotation.y), 0, Math.cos(npc.mesh.rotation.y));
    }
    base.normalize();
    const left = new THREE.Vector3(-base.z, 0, base.x);
    const directions = [base, left, left.clone().multiplyScalar(-1), base.clone().multiplyScalar(-1)];
    const step = THREE.MathUtils.clamp(0.09 + blockedSeconds * 0.035, 0.09, 0.22);

    for (const dir of directions) {
      const candidate = npc.mesh.position.clone().addScaledVector(dir, step);
      candidate.y = this.groundHeight(candidate.x, candidate.z, npc.mesh.position.y, 120, ground);
      if (!this.canCharacterOccupy(npc, candidate, 0.37, 0.72, false, true)) continue;
      const dynamic = this.recoveryDynamicProbe?.(candidate, 0.37, 0.72);
      if (dynamic?.blocked) continue;
      npc.mesh.position.x = candidate.x;
      npc.mesh.position.z = candidate.z;
      return true;
    }
    return false;
  }

  /** Nearest LAST-RESORT standing position. Normal recovery first pushes blockers and
   * crawls/rolls there physically; this search is only used after being pinned for
   * several seconds so no NPC can remain permanently broken. */
  private findRecoveryPosition(npc: NPC, preferredGround: number, maxRadius = 2.5): THREE.Vector3 {
    const origin = npc.mesh.position.clone();
    origin.y = preferredGround;
    if (this.isRecoveryStandingClear(npc, origin)) return origin;

    if (this.recoverPenetration) {
      const recovered = this.recoverPenetration(origin, 0.43, 1.62);
      recovered.y = this.groundHeight(recovered.x, recovered.z, npc.mesh.position.y, 120, preferredGround);
      if (this.isRecoveryStandingClear(npc, recovered)) return recovered;
    }

    const radii = [0.35, 0.65, 1.0, 1.4, 1.9, 2.5, 3.0].filter((r) => r <= maxRadius + 0.001);
    for (const radius of radii) {
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const candidate = new THREE.Vector3(
          origin.x + Math.cos(angle) * radius,
          origin.y,
          origin.z + Math.sin(angle) * radius
        );
        candidate.y = this.groundHeight(candidate.x, candidate.z, npc.mesh.position.y, 120, preferredGround);
        if (this.isRecoveryStandingClear(npc, candidate)) return candidate;
      }
    }
    return origin;
  }

  private beginRecovery(npc: NPC, ground: number, fromKnockout = false) {
    // Do not instantly relocate a person merely because a fallen prop/another body is
    // over them. Stay down at the real landing point and let updateRecovery push/roll
    // free first. Static collision during the airborne sweep already prevents a valid
    // ragdoll from ending deep inside a wall.
    npc.state = 'recovering';
    npc.mesh.userData.recoveryElapsed = 0;
    npc.mesh.userData.recoveryDuration = (fromKnockout ? 3.2 : 2.55) + Math.random() * 0.45;
    npc.mesh.userData.recoveryFromKnockout = fromKnockout;
    npc.mesh.userData.recoverySide = Number(npc.mesh.userData.spinDirection ?? 1) >= 0 ? 1 : -1;
    npc.mesh.userData.recoveryYaw = Math.atan2(Math.sin(npc.mesh.rotation.y), Math.cos(npc.mesh.rotation.y));
    npc.mesh.userData.recoveryBlockedSeconds = 0;
    npc.mesh.userData.recoveryNudgeCooldown = 0;
    npc.mesh.userData.recoveryFallbackCooldown = 0;
    npc.mesh.userData.pendingKnockout = false;
    npc.mesh.userData.bodyPushTimer = 0;
    npc.kickedVelocity?.set(0, 0, 0);

    if (this.recoverPenetration && !this.canOccupy(npc.mesh.position, 0.40, 0.75)) {
      const rec = this.recoverPenetration(npc.mesh.position, 0.40, 0.75);
      npc.mesh.position.x = rec.x;
      npc.mesh.position.z = rec.z;
    }

    // Start visibly down on the pavement rather than snapping upright on impact.
    const side = Number(npc.mesh.userData.recoverySide);
    npc.mesh.rotation.set(0.08 * side, Number(npc.mesh.userData.recoveryYaw), side * Math.PI * 0.5);
    const validGround = Math.max(ground, this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, ground));
    npc.mesh.position.y = validGround + 0.16;
  }

  /** Multi-stage cartoon get-up: lie still -> roll -> hands/knees -> crouch -> stand.
   * Common limb names are animated when available; unusual creatures still receive
   * the root-body recovery, so every model transitions smoothly instead of popping. */
  private updateRecovery(npc: NPC, dt: number): boolean {
    if (npc.state !== 'recovering') return false;
    const duration = Math.max(1.8, Number(npc.mesh.userData.recoveryDuration ?? 2.8));
    const previousElapsed = Number(npc.mesh.userData.recoveryElapsed ?? 0);
    const side = Number(npc.mesh.userData.recoverySide ?? 1) >= 0 ? 1 : -1;
    const yaw = Number(npc.mesh.userData.recoveryYaw ?? npc.mesh.rotation.y);
    let ground = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);

    const standingProbe = new THREE.Vector3(npc.mesh.position.x, ground, npc.mesh.position.z);
    const dynamicProbe = this.recoveryDynamicProbe?.(standingProbe, 0.43, 1.62);
    const bodyClear = this.canCharacterOccupy(npc, standingProbe, 0.43, 1.62, false, true);
    const standingClear = bodyClear && !dynamicProbe?.blocked;
    const impactHold = performance.now() * 0.001 < Number(npc.mesh.userData.recoveryImpactHoldUntil ?? 0);
    let blockedSeconds = Math.max(0, Number(npc.mesh.userData.recoveryBlockedSeconds ?? 0));
    let nudgeCooldown = Math.max(0, Number(npc.mesh.userData.recoveryNudgeCooldown ?? 0) - dt);
    let fallbackCooldown = Math.max(0, Number(npc.mesh.userData.recoveryFallbackCooldown ?? 0) - dt);
    let elapsed: number;

    if (impactHold) {
      // Still being nudged/struck: remain visibly down without treating the contact as
      // a navigation deadlock or triggering the emergency reposition timer.
      elapsed = Math.min(previousElapsed, duration * 0.18);
      blockedSeconds = Math.max(0, blockedSeconds - dt * 0.5);
    } else if (!standingClear) {
      blockedSeconds += dt;
      // Do not start standing while still covered by a prop/car/body. Hold the animation
      // in the grounded beat, push a dynamic blocker, then physically crawl/roll toward
      // clear space. A short reposition is reserved for the true failsafe below.
      elapsed = Math.min(previousElapsed, duration * 0.18);

      if (dynamicProbe?.blocked && nudgeCooldown <= 0 && this.recoveryDynamicNudge) {
        const strength = THREE.MathUtils.clamp(0.45 + blockedSeconds * 0.40, 0.45, 1.65);
        if (this.recoveryDynamicNudge(standingProbe, 0.44, 0.82, strength)) {
          nudgeCooldown = 0.24;
        }
      }

      const escape = new THREE.Vector3();
      if (dynamicProbe?.escapeDirection && dynamicProbe.escapeDirection.lengthSq() > 0.0001) {
        escape.copy(dynamicProbe.escapeDirection);
      }
      const npcEscape = this.recoveryNPCSeparationDirection(npc);
      if (npcEscape.lengthSq() > 0.0001) escape.add(npcEscape);
      if (escape.lengthSq() > 0.0001) escape.normalize();

      if (blockedSeconds >= 0.20) {
        this.tryRecoveryCrawlStep(npc, ground, escape, blockedSeconds);
        ground = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, ground);
      }

      // LAST RESORT only. After several seconds of being genuinely unable to stand,
      // move the NPC a short distance to the nearest validated ground position. This
      // guarantees a fence/tree/car/other ragdoll can never permanently brick their AI.
      if (blockedSeconds >= 2.8 && fallbackCooldown <= 0) {
        const safe = this.findRecoveryPosition(npc, ground, 2.5);
        const planarDistance = Math.hypot(safe.x - npc.mesh.position.x, safe.z - npc.mesh.position.z);
        if (planarDistance > 0.04 && planarDistance <= 2.51) {
          npc.mesh.position.x = safe.x;
          npc.mesh.position.z = safe.z;
          ground = safe.y;
          blockedSeconds = 0.75;
        }
        fallbackCooldown = 1.0;
      }
    } else {
      blockedSeconds = Math.max(0, blockedSeconds - dt * 3.5);
      elapsed = Math.min(duration, previousElapsed + dt);
    }

    npc.mesh.userData.recoveryBlockedSeconds = blockedSeconds;
    npc.mesh.userData.recoveryNudgeCooldown = nudgeCooldown;
    npc.mesh.userData.recoveryFallbackCooldown = fallbackCooldown;
    npc.mesh.userData.recoveryElapsed = elapsed;
    const t = THREE.MathUtils.clamp(elapsed / duration, 0, 1);

    const smooth = (v: number) => {
      const c = THREE.MathUtils.clamp(v, 0, 1);
      return c * c * (3 - 2 * c);
    };
    let rootX = 0;
    let rootZ = 0;
    let height = 0;
    let armX = 0;
    let armZ = 0;
    let legX = 0;
    const twitch = Math.sin(elapsed * 11.5) * 0.06;

    if (t < 0.20) {
      // Brief beat on the floor after the final impact.
      rootX = 0.08 * side + twitch * 0.25;
      rootZ = side * Math.PI * 0.5;
      height = 0.16;
      armX = -0.18 + twitch;
      legX = 0.15 - twitch * 0.5;
    } else if (t < 0.40) {
      // Roll from the side toward a braced, face-down recovery position.
      const u = smooth((t - 0.20) / 0.20);
      rootX = THREE.MathUtils.lerp(0.08 * side, -0.92, u);
      rootZ = THREE.MathUtils.lerp(side * Math.PI * 0.5, side * 0.34, u);
      height = THREE.MathUtils.lerp(0.16, 0.27, u);
      armX = THREE.MathUtils.lerp(-0.18, -1.18, u);
      armZ = THREE.MathUtils.lerp(0, side * 0.35, u);
      legX = THREE.MathUtils.lerp(0.15, -0.72, u);
    } else if (t < 0.64) {
      // Hands and knees. Keep the torso low for long enough to read clearly.
      const u = smooth((t - 0.40) / 0.24);
      rootX = THREE.MathUtils.lerp(-0.92, -0.58, u);
      rootZ = THREE.MathUtils.lerp(side * 0.34, side * 0.10, u);
      height = THREE.MathUtils.lerp(0.27, 0.20, u);
      armX = THREE.MathUtils.lerp(-1.18, -0.88, u);
      armZ = THREE.MathUtils.lerp(side * 0.35, side * 0.10, u);
      legX = THREE.MathUtils.lerp(-0.72, -0.86, u);
    } else if (t < 0.84) {
      // One knee/crouch into the actual stand.
      const u = smooth((t - 0.64) / 0.20);
      rootX = THREE.MathUtils.lerp(-0.58, -0.26, u);
      rootZ = THREE.MathUtils.lerp(side * 0.10, 0, u);
      height = THREE.MathUtils.lerp(0.20, 0.08, u);
      armX = THREE.MathUtils.lerp(-0.88, -0.38, u);
      armZ = THREE.MathUtils.lerp(side * 0.10, 0, u);
      legX = THREE.MathUtils.lerp(-0.86, -0.48, u);
    } else {
      const u = smooth((t - 0.84) / 0.16);
      rootX = THREE.MathUtils.lerp(-0.26, 0, u);
      rootZ = 0;
      height = THREE.MathUtils.lerp(0.08, 0, u);
      armX = THREE.MathUtils.lerp(-0.38, 0, u);
      legX = THREE.MathUtils.lerp(-0.48, 0, u);
    }

    npc.mesh.rotation.x = rootX;
    npc.mesh.rotation.y = yaw;
    npc.mesh.rotation.z = rootZ;
    npc.mesh.position.y = ground + height;
    const blend = Math.min(1, 12 * dt);
    this.setRecoveryPartPose(npc, 'arm_left', armX, 0, -armZ, blend);
    this.setRecoveryPartPose(npc, 'arm_right', armX, 0, armZ, blend);
    this.setRecoveryPartPose(npc, 'leg_left', legX, 0, 0.10 * side * (1 - t), blend);
    this.setRecoveryPartPose(npc, 'leg_right', legX * 0.82, 0, -0.10 * side * (1 - t), blend);

    if (elapsed < duration) {
      this.syncNPCPosition(npc);
      return true;
    }

    const wasKnockedOut = !!npc.mesh.userData.recoveryFromKnockout;
    npc.state = 'idle';
    npc.mesh.rotation.set(0, yaw, 0);
    npc.mesh.position.y = ground;
    npc.mesh.userData.recoveryElapsed = 0;
    npc.mesh.userData.recoveryDuration = 0;
    npc.mesh.userData.recoveryFromKnockout = false;
    npc.mesh.userData.recoveryBlockedSeconds = 0;
    npc.mesh.userData.recoveryNudgeCooldown = 0;
    npc.mesh.userData.recoveryFallbackCooldown = 0;
    npc.mesh.userData.recoveryImpactHoldUntil = 0;
    npc.mesh.userData.pendingKnockout = false;
    if (wasKnockedOut) npc.combatHp = npc.combatMaxHp ?? 100;
    this.restoreRecoveryBasePose(npc);
    npc.walkTimer = 0.55 + Math.random() * 0.75;
    this.syncNPCPosition(npc);
    return true;
  }

  /** Derive a conservative spawn footprint from the actual authored model once.
   * This is spawn-time only, so named/ambient NPCs can be validated against current
   * map geometry without hard-coding a different radius for every character. */
  private getSpawnFootprint(mesh: THREE.Group): { radius: number; height: number } {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const planar = Math.max(size.x, size.z);
    return {
      radius: THREE.MathUtils.clamp(planar * 0.24, 0.38, 0.88),
      height: THREE.MathUtils.clamp(size.y * 0.92, 1.55, 3.25),
    };
  }

  private addNPC(cfg: SpawnConfig): NPC {
    const mesh = cfg.modelFactory();
    const mode = cfg.movementMode ?? mesh.userData.movementMode ?? 'ground';
    const ground = this.groundHeight(cfg.pos[0], cfg.pos[2], cfg.pos[1]);
    const baseY = mode === 'flying'
      ? ground + (cfg.flightHeight ?? 13)
      : mode === 'hover'
      ? ground + 1.1
      : mode === 'swimming'
      ? cfg.pos[1]
      : Math.max(cfg.pos[1], ground);

    mesh.position.set(cfg.pos[0], baseY, cfg.pos[2]);
    if (mode === 'flying') {
      const spawnRadius = cfg.type === 'pokemon_charizard' ? 0.82 : 0.58;
      const spawnHeight = cfg.type === 'pokemon_charizard' ? 2.85 : 2.0;
      if (!this.canFlyOccupy(mesh.position, spawnRadius, spawnHeight)) {
        const requestedHeight = cfg.flightHeight ?? 13;
        let resolved: THREE.Vector3 | null = null;
        for (const ring of [1.2, 2.4, 4.0, 6.0, 9.0]) {
          for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const x = cfg.pos[0] + Math.cos(angle) * ring;
            const z = cfg.pos[2] + Math.sin(angle) * ring;
            const y = this.groundHeight(x, z, baseY, 120, 0.12) + requestedHeight;
            const candidate = new THREE.Vector3(x, y, z);
            if (this.canFlyOccupy(candidate, spawnRadius, spawnHeight)) { resolved = candidate; break; }
          }
          if (resolved) break;
        }
        if (resolved) mesh.position.copy(resolved);
      }
    }
    mesh.userData.wanderBounds = cfg.bounds;
    mesh.userData.wetness = 0;
    mesh.userData.wetTimer = 0;
    mesh.userData.burnTimer = 0;
    mesh.userData.burnTickTimer = 0;
    mesh.userData.electricTimer = 0;
    mesh.userData.slipCooldown = 0;
    mesh.userData.stateTimer = 0;
    mesh.userData.dialogues = cfg.dialogues;
    mesh.userData.movementMode = mode;
    mesh.userData.combatWeight = cfg.combatWeight ?? mesh.userData.combatWeight ?? 1;
    mesh.userData.flightHeight = cfg.flightHeight ?? (mode === 'flying' ? 13 : 0);
    mesh.userData.flightRadius = cfg.flightRadius ?? (mode === 'flying' ? 12 : 0);
    mesh.userData.flightPhase = Math.random() * Math.PI * 2;
    mesh.userData.bounceCount = 0;
    mesh.userData.pendingKnockout = false;
    mesh.userData.spinDirection = Math.random() > 0.5 ? 1 : -1;
    mesh.userData.speedMultiplier = mesh.userData.speedMultiplier ?? 1;
    this.captureRecoveryBasePose(mesh);
    mesh.userData.isCameo = !!cfg.cameo;
    mesh.userData.stationary = !!cfg.stationary;
    const initialPowerProfile = POWER_PROFILES[cfg.id];
    if (initialPowerProfile) {
      mesh.userData.powerKind = initialPowerProfile.kind;
      mesh.userData.powerCooldown = 2.5 + Math.random() * initialPowerProfile.cooldown;
      mesh.userData.powerThreatUntil = 0;
      mesh.userData.powerRevengePending = false;
      mesh.userData.powerAggressionSerial = -1;
      mesh.userData.powerShowcaseRequested = false;
      mesh.userData.powerAnimationUntil = 0;
      if (initialPowerProfile.kind === 'sonic_dash') mesh.userData.speedMultiplier = Math.max(mesh.userData.speedMultiplier ?? 1, 1.75);
      if (initialPowerProfile.kind === 'spider') mesh.userData.speedMultiplier = Math.max(mesh.userData.speedMultiplier ?? 1, 1.42);
      if (initialPowerProfile.kind === 'iron_man') {
        // ENHANCEMENT: Iron Man now lives as a pedestrian most of the time. A
        // randomized takeoff window makes flight an occasional character beat
        // instead of his permanent idle locomotion.
        const ironNow = performance.now() * 0.001;
        mesh.userData.ironFlightState = 'grounded';
        mesh.userData.ironNextTakeoffAt = ironNow + 14 + Math.random() * 18;
        mesh.userData.ironFlightDuration = 0;
        mesh.userData.ironFlightPhase = Math.random() * Math.PI * 2;
      }
    }
    if (mode === 'swimming') {
      mesh.userData.aquatic = true;
      mesh.userData.waterSurfaceY = cfg.waterSurfaceY ?? 0.075;
      mesh.userData.swimDepth = cfg.swimDepth ?? 0.45;
      mesh.userData.diveAmount = cfg.diveAmount ?? 0.35;
      mesh.userData.swimSpeed = cfg.swimSpeed ?? 0.55;
      mesh.userData.swimPhase = Math.random() * Math.PI * 2;
      mesh.userData.swimHeading = Math.random() * Math.PI * 2;
    }
    this.scene.add(mesh);

    const maxHp = cfg.combatHp ?? Math.round(80 + (mesh.userData.combatWeight ?? 1) * 30);
    const npc: NPC = {
      id: cfg.id,
      name: cfg.name,
      type: cfg.type,
      mesh,
      position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      dialogue: cfg.dialogues[0],
      voiceQuotes: cfg.dialogues,
      state: 'idle',
      walkTimer: Math.random() * 3 + 1,
      walkDirection: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
      kickedVelocity: new THREE.Vector3(),
      isWet: false,
      speechBubbleText: null,
      speechBubbleTimer: 0,
      combatHp: maxHp,
      combatMaxHp: maxHp,
      combatWeight: mesh.userData.combatWeight,
      movementMode: mode,
      knockoutTimer: 0,
      isCameo: !!cfg.cameo,
    };

    // PRIORITY FIX 7: validate every ordinary ground spawn against the CURRENT
    // fixed-world collision map. Previously only flying characters received a safe
    // spawn search, so map edits could leave named NPCs or random citizens inside a
    // doorway/wall. Dynamic objects are not part of canOccupy, so this does not turn
    // cars, people, bins, signs or other interactive props into spawn-blocking walls.
    if (mode === 'ground') {
      const footprint = this.getSpawnFootprint(mesh);
      const requested = mesh.position.clone();
      const safe = this.findSafeGroundPosition(
        npc,
        requested,
        footprint.radius,
        footprint.height,
        14.0,
        cfg.bounds,
        !cfg.stationary
      );
      if (safe && safe.distanceToSquared(requested) > 0.0004) {
        mesh.position.copy(safe);
        npc.position.x = safe.x;
        npc.position.y = safe.y;
        npc.position.z = safe.z;
        mesh.userData.spawnAdjustedFrom = requested.clone();
      }
    }

    // Home/wander origin must be the VALIDATED position, otherwise an NPC fixed at
    // spawn would immediately try to walk back into the bad doorway on its next AI tick.
    mesh.userData.home = mesh.position.clone();
    this.npcs.push(npc);
    if (mode === 'swimming') this.aquaticNPCs.push(npc);
    return npc;
  }

  public getNPCById(id: string): NPC | null {
    return this.npcs.find((npc) => npc.id === id) ?? null;
  }

  /** Spawn/reset the dedicated jailbreak miniboss outside the cell. */
  public spawnJailEscapeGuard(position: THREE.Vector3): NPC {
    let guard = this.getNPCById('jail_escape_guard');
    if (!guard) {
      guard = this.addNPC({
        id: 'jail_escape_guard',
        name: 'Officer Lou — Prison Guard',
        type: 'cop',
        pos: [position.x, position.y, position.z],
        dialogues: ['YOU ARE NOT LEAVING THIS STATION!', 'BACK IN THE CELL!', 'Chief! The prisoner is loose!'],
        modelFactory: createOfficerLouNPC,
        bounds: { minX: position.x - 15, maxX: position.x + 15, minZ: position.z - 10, maxZ: position.z + 10 },
        combatWeight: 1.45,
        combatHp: 185,
      });
    }
    guard.mesh.visible = true;
    guard.mesh.position.copy(position);
    guard.mesh.userData.home = position.clone();
    guard.mesh.userData.noRecover = true;
    guard.mesh.userData.pendingKnockout = false;
    guard.mesh.userData.hostileJailGuard = true;
    guard.combatMaxHp = 185;
    guard.combatHp = 185;
    guard.knockoutTimer = 0;
    guard.state = 'hostile_guard';
    guard.kickedVelocity?.set(0, 0, 0);
    guard.mesh.rotation.set(0, Math.PI, 0);
    this.say(guard, 'YOU HAVE TO GET THROUGH ME FIRST!', 2.4);
    return guard;
  }


  /**
   * Ash's defensive Charizard is intentionally separate from the formal challenge.
   * It is spawned only when the player attacks Ash in free roam and is fully hidden/
   * reset once the retaliation encounter ends, so it can never contaminate Ash's
   * seven-character challenge progression.
   */
  public spawnAshDefenderCharizard(position: THREE.Vector3): NPC {
    let charizard = this.getNPCById('ash_defender_charizard');
    if (!charizard) {
      charizard = this.addNPC({
        id: 'ash_defender_charizard',
        name: "Ash's Charizard",
        type: 'pokemon_charizard',
        pos: [position.x, position.y, position.z],
        dialogues: ['CHARIZARD!', '*lands with a furious roar*', '*protectively stands between you and Ash*'],
        modelFactory: createCharizardNPC,
        bounds: { minX: -235, maxX: -196, minZ: 22, maxZ: 62 },
        combatWeight: 1.75,
        combatHp: 165,
      });
    }

    const requestedGround = this.groundHeight(position.x, position.z, position.y);
    charizard.mesh.visible = true;
    const requestedSpawn = new THREE.Vector3(position.x, requestedGround, position.z);
    const safeSpawn = this.findSafeGroundPosition(charizard, requestedSpawn, 0.82, 2.85, 6.0) ?? requestedSpawn;
    charizard.mesh.position.copy(safeSpawn);
    charizard.mesh.rotation.set(0, 0, 0);
    charizard.mesh.userData.home = safeSpawn.clone();
    charizard.mesh.userData.ashDefenderActive = true;
    charizard.mesh.userData.ashDefenderPhase = 'ground';
    charizard.mesh.userData.ashDefenderPhaseTimer = 2.6;
    delete charizard.mesh.userData.ashDefenderLandingTarget;
    delete charizard.mesh.userData.flightAvoidSide;
    charizard.mesh.userData.powerCooldown = 0.85;
    charizard.mesh.userData.powerThreatUntil = performance.now() * 0.001 + 999;
    charizard.mesh.userData.pendingKnockout = false;
    charizard.mesh.userData.noRecover = false;
    charizard.mesh.userData.bounceCount = 0;
    charizard.state = 'ash_defender';
    charizard.combatMaxHp = 165;
    charizard.combatHp = 165;
    charizard.knockoutTimer = 0;
    charizard.kickedVelocity?.set(0, 0, 0);
    this.say(charizard, 'CHARIZARD!', 1.7);
    return charizard;
  }

  /**
   * Freeze the free-roam defender in-place for Ash's recall cinematic. This is
   * intentionally separate from dismissing it: attacks/powers stop immediately,
   * while App.tsx keeps the visible model alive until the beam/shrink sequence ends.
   */
  public beginAshDefenderRecall(): NPC | null {
    const charizard = this.getNPCById('ash_defender_charizard');
    if (!charizard) return null;
    charizard.mesh.userData.ashDefenderActive = false;
    charizard.mesh.userData.powerThreatUntil = 0;
    charizard.mesh.userData.powerCooldown = 999;
    charizard.mesh.userData.powerRevengePending = false;
    charizard.mesh.userData.pendingKnockout = false;
    charizard.mesh.userData.noRecover = true;
    charizard.mesh.userData.specialInteractionActive = true;
    charizard.mesh.userData.ashDefenderPhase = 'recall';
    charizard.mesh.userData.ashDefenderPhaseTimer = 0;
    charizard.kickedVelocity?.set(0, 0, 0);
    charizard.state = 'defeated';
    charizard.combatHp = 0;
    return charizard;
  }

  public dismissAshDefenderCharizard(): void {
    const charizard = this.getNPCById('ash_defender_charizard');
    if (!charizard) return;
    charizard.mesh.userData.ashDefenderActive = false;
    charizard.mesh.userData.powerThreatUntil = 0;
    charizard.mesh.userData.pendingKnockout = false;
    charizard.mesh.userData.noRecover = false;
    charizard.mesh.userData.specialInteractionActive = false;
    charizard.mesh.userData.ashDefenderPhase = 'ground';
    charizard.mesh.userData.ashDefenderPhaseTimer = 0;
    charizard.kickedVelocity?.set(0, 0, 0);
    charizard.state = 'idle';
    charizard.combatHp = charizard.combatMaxHp ?? 165;
    charizard.mesh.rotation.set(0, 0, 0);
    charizard.mesh.visible = false;
    const bubble = charizard.mesh.getObjectByName('speech_bubble');
    if (bubble) charizard.mesh.remove(bubble);
  }

  private spawnNamedPopulation() {
    const springBounds = { minX: -305, maxX: -115, minZ: -165, maxZ: 135 };
    const goldenBounds = { minX: 105, maxX: 295, minZ: -165, maxZ: 165 };
    const npcConfigs: SpawnConfig[] = [
      {
        id: 'ned_flanders', name: 'Ned Flanders', type: 'flanders', pos: [-170, 0.12, 45],
        dialogues: ['Hi-diddly-ho, Pokémon neighborino!', 'Bless my soul, are you using Water Gun on my petunias?', 'Oogly-doogly, Springfield is looking mighty lively today!'],
        modelFactory: createNedFlandersNPC, bounds: springBounds,
      },
      {
        id: 'comic_book_guy', name: 'Comic Book Guy', type: 'comic_book_guy', pos: [-210, 0.12, -118],
        dialogues: ['Worst. Pokémon. Starter. Ever.', 'A Pikachu driving an M5? Highly derivative.', 'I am documenting this entire catastrophe.'],
        modelFactory: createComicBookGuyNPC, bounds: springBounds, combatWeight: 1.35,
      },
      {
        id: 'chief_wiggum', name: 'Chief Wiggum', type: 'wiggum', pos: [-150, 0.12, -45],
        dialogues: ['Hold it right there! You got a license for that thunderbolt?', 'Lou, did you see that yellow mouse run the red light?', 'Bake him away, toys!'],
        modelFactory: createChiefWiggumNPC, bounds: springBounds, combatWeight: 1.4,
      },
      {
        id: 'officer_lou', name: 'Officer Lou', type: 'lou', pos: [-145, 0.12, -45],
        dialogues: ["Chief, I think that Pokémon is underage to drive an M3.", 'Suspect is fuzzy and traveling way too fast.', "Keep your hands where we can see 'em!"],
        modelFactory: createOfficerLouNPC, bounds: springBounds, combatWeight: 1.15,
      },
      {
        id: 'moe_szyslak', name: 'Moe Szyslak', type: 'moe', pos: [-143.5, 0.12, -136.4],
        dialogues: ["Hey, beat it, kid!", 'If Homer asks, he was never in here.', "Don't set my bar on fire!"],
        modelFactory: createMoeNPC, bounds: { minX: -147, maxX: -140, minZ: -137, maxZ: -132 }, combatWeight: 1.25, stationary: true,
      },
      {
        id: 'barney_gumble', name: 'Barney Gumble', type: 'barney', pos: [-136, 0.12, -133.8],
        dialogues: ['*BURRRRP!* Hey, little buddy!', 'Is that a Poliwag or am I seeing double again?', 'Why is everything spinning?'],
        modelFactory: createBarneyNPC, bounds: { minX: -138, maxX: -132, minZ: -136, maxZ: -126 }, combatWeight: 1.75, stationary: true,
      },
      {
        id: 'apu_nahas', name: 'Apu Nahasapeetilon', type: 'apu', pos: [-213.5, 0.12, -136.0],
        dialogues: ['Thank you, come again!', 'Please do not kick the Squishee machine!', 'This is not covered by store insurance!'],
        modelFactory: createApuNPC, bounds: { minX: -216, maxX: -208, minZ: -137, maxZ: -132 }, stationary: true,
      },
      {
        id: 'officer_jenny', name: 'Officer Jenny', type: 'officer_jenny', pos: [200, 0.12, 10],
        dialogues: ['Welcome to Goldenrod City!', 'Try not to hijack every car you see.', 'The Radio Tower looks great today.'],
        modelFactory: createOfficerJennyNPC, bounds: goldenBounds,
      },
      {
        id: 'youngster_joey', name: 'Youngster Joey', type: 'youngster_joey', pos: [185, 0.12, 25],
        dialogues: ['My Rattata is in the top percentage!', "I wear shorts because they're comfy!", 'Did you see the Charizard flying around?'],
        modelFactory: createYoungsterJoeyNPC, bounds: goldenBounds,
      },
      {
        id: 'gym_leader_whitney', name: 'Gym Leader Whitney', type: 'whitney', pos: [140, 4.55, -36.7],
        dialogues: ["Hi! I'm Whitney!", "My Miltank's Rollout is unstoppable!", 'WAAAAAH!'],
        modelFactory: createWhitneyNPC, bounds: { minX: 136, maxX: 144, minZ: -39, maxZ: -34 }, stationary: true,
      },
      {
        id: 'goldenrod_lass', name: 'Goldenrod Lass', type: 'lass', pos: [215, 0.12, -35],
        dialogues: ['The Magnet Train runs all the way to Saffron!', 'The Department Store is huge!', 'Those cars are WAY too fast.'],
        modelFactory: createYoungsterJoeyNPC, bounds: goldenBounds,
      },
      {
        id: 'bike_shop_clerk', name: 'Miracle Cycle Clerk', type: 'cooltrainer', pos: [150, 0.12, 26],
        dialogues: ['Our bikes are great, but that M5 is ridiculous.', 'Please do not powerslide through the shop.', 'Watering grass can grow trees. Somehow.'],
        modelFactory: createYoungsterJoeyNPC, bounds: goldenBounds,
      },
      {
        id: 'moes_patron_lenny', name: 'Lenny', type: 'citizen', pos: [-140.0, 0.12, -133.6],
        dialogues: ['Moe, another Duff!', 'Did that Pokemon just walk into the bar?', 'Carl is not going to believe this.'],
        modelFactory: createYoungsterJoeyNPC, bounds: { minX: -147, maxX: -133, minZ: -136, maxZ: -124 }, stationary: true,
      },
      {
        id: 'moes_patron_carl', name: 'Carl', type: 'citizen', pos: [-138.5, 0.12, -133.6],
        dialogues: ['This place gets stranger every day.', 'Lenny, do not touch the Charmander.', 'I am staying away from the road tonight.'],
        modelFactory: createOfficerJennyNPC, bounds: { minX: -147, maxX: -133, minZ: -136, maxZ: -124 }, stationary: true,
      },
      {
        id: 'kwik_customer', name: 'Kwik-E-Mart Customer', type: 'citizen', pos: [-205.5, 0.12, -130],
        dialogues: ['I only came in for a Squishee.', 'Apu really does have everything.', 'Is there a bus stop outside?'],
        modelFactory: createYoungsterJoeyNPC, bounds: { minX: -218, maxX: -201, minZ: -136, maxZ: -124 },
      },
      {
        id: 'krusty_clown', name: 'Krusty the Clown', type: 'krusty', pos: [-270, 0.12, -135.4],
        dialogues: ['HEY HEY! Welcome to Krusty Burger!', 'Buy a Krusty Burger or get outta here!', 'I have absolutely no idea what is in the meat.'],
        modelFactory: createKrustyClownNPC, bounds: { minX: -275, maxX: -265, minZ: -136.5, maxZ: -132.5 }, stationary: true, combatWeight: 1.1,
      },
      {
        id: 'arcade_prize_host_toby',
        name: 'Toby • Prize Host',
        type: 'arcade_host',
        pos: [-5.5, 0.12, -292.3],
        dialogues: [
          'Welcome to the Tickets & Prizes counter! Ready to redeem your arcade points?',
          'The giant Pikachu plush is 5,000 tickets. Better get grinding Redline Rush or Neon Claw!',
          'High score today on Space Invaders wins an exclusive retro mystery crate!',
          'Did you try the Claw Machine yet? The physics are 100% fair, I calibrated them myself!',
          'Keep your tickets safe—you can redeem everything from candy to sports car keys!',
        ],
        modelFactory: createArcadePrizeHostNPC,
        bounds: { minX: -6.5, maxX: -4.5, minZ: -293.0, maxZ: -291.6 },
        stationary: true,
      },
      // Occupied suburban interiors. These stay inside their own house bounds rather
      // than turning every residence into another empty prop building.
      {
        id: 'flanders_rod', name: 'Rod Flanders', type: 'citizen', pos: [-174, 0.12, 30],
        dialogues: ['Hi there!', 'Dad says Pokémon are neat!', 'Please do not powerslide through our living room.'],
        modelFactory: createYoungsterJoeyNPC, bounds: { minX: -178, maxX: -162, minZ: 24, maxZ: 35 }, stationary: false,
      },
      {
        id: 'flanders_todd', name: 'Todd Flanders', type: 'citizen', pos: [-166, 0.12, 31],
        dialogues: ['Hi-diddly!', 'Is that Pikachu house-trained?', 'Dad keeps the house very tidy.'],
        modelFactory: createYoungsterJoeyNPC, bounds: { minX: -178, maxX: -162, minZ: 24, maxZ: 35 }, stationary: false,
      },
      {
        id: 'resident_741', name: 'Evergreen Resident', type: 'citizen', pos: [-250, 0.12, 95],
        dialogues: ['Welcome to Evergreen Terrace.', 'The traffic has gotten ridiculous lately.', 'Please use the front door.'],
        modelFactory: () => createGenericCitizenNPC(41), bounds: { minX: -257, maxX: -243, minZ: 90, maxZ: 100 }, stationary: false,
      },
      {
        id: 'resident_743', name: 'Springfield Neighbor', type: 'citizen', pos: [-210, 0.12, 95],
        dialogues: ['I heard a bus outside.', 'This street used to be quiet.', 'Do not set the curtains on fire.'],
        modelFactory: () => createGenericCitizenNPC(42), bounds: { minX: -217, maxX: -203, minZ: 90, maxZ: 100 }, stationary: false,
      },
      {
        id: 'resident_745', name: 'Springfield Neighbor', type: 'citizen', pos: [-170, 0.12, 95],
        dialogues: ['Nice Pokémon.', 'I am staying inside during police chases.', 'That bridge goes all the way to Goldenrod.'],
        modelFactory: () => createGenericCitizenNPC(43), bounds: { minX: -177, maxX: -163, minZ: 90, maxZ: 100 }, stationary: false,
      },
      {
        id: 'resident_winfield', name: 'Winfield Resident', type: 'citizen', pos: [-250, 0.12, 30],
        dialogues: ['Please wipe your feet.', 'Evergreen Terrace is never quiet.', 'I just redecorated in here.'],
        modelFactory: () => createGenericCitizenNPC(44), bounds: { minX: -257, maxX: -243, minZ: 25, maxZ: 35 }, stationary: false,
      },
      {
        id: 'resident_740', name: 'Evergreen Resident', type: 'citizen', pos: [-285, 0.12, 30],
        dialogues: ['Hello from number 740.', 'That bus keeps stopping outside.', 'The houses are finally furnished.'],
        modelFactory: () => createGenericCitizenNPC(45), bounds: { minX: -292, maxX: -278, minZ: 25, maxZ: 35 }, stationary: false,
      },
      {
        id: 'resident_738', name: 'Evergreen Resident', type: 'citizen', pos: [-285, 0.12, 95],
        dialogues: ['Welcome in.', 'I can hear police sirens again.', 'Springfield property values are complicated.'],
        modelFactory: () => createGenericCitizenNPC(46), bounds: { minX: -292, maxX: -278, minZ: 90, maxZ: 100 }, stationary: false,
      },
    ];
    npcConfigs.forEach((cfg) => this.addNPC(cfg));
  }

  private spawnCameoPopulation() {
    const spring = { minX: -300, maxX: -120, minZ: -155, maxZ: 125 };
    const golden = { minX: 110, maxX: 295, minZ: -155, maxZ: 155 };
    const cameos: SpawnConfig[] = [
      {
        id: 'cameo_anakin', name: 'Anakin Skywalker', type: 'cameo_anakin', pos: [-232, 0.12, 25],
        dialogues: ['This is where the fun begins.', 'I have a bad feeling about that Poliwag.', 'That M5 is strong with the Force.'],
        modelFactory: createAnakinSkywalkerNPC, bounds: spring, cameo: true,
      },
      {
        id: 'cameo_gordon', name: 'Gordon Ramsay', type: 'cameo_gordon', pos: [-185, 0.12, -98],
        dialogues: ['WHERE IS THE LAMB SAUCE?!', 'That driving is RAW!', 'Why is there a Pokémon in my kitchen?'],
        modelFactory: createGordonRamsayNPC, bounds: spring, cameo: true,
      },
      {
        id: 'cameo_shrek', name: 'Shrek', type: 'cameo_shrek', pos: [-266, 0.12, 80],
        dialogues: ['What are ye doing in my swamp?', 'This is not my swamp.', 'Donkey would love this place.'],
        modelFactory: createShrekNPC, bounds: spring, cameo: true, combatWeight: 2.1,
      },
      {
        id: 'cameo_batman', name: 'Batman', type: 'cameo_batman', pos: [-125, 0.12, 82],
        dialogues: ['I AM VENGEANCE.', 'I am watching the roads.', 'That Pokémon has no licence.'],
        modelFactory: createBatmanNPC, bounds: spring, cameo: true,
      },
      {
        id: 'cameo_spiderman', name: 'Spider-Man', type: 'cameo_spiderman', pos: [-172, 0.12, 94],
        dialogues: ['My spider-sense hates this traffic.', 'Did a Poliwag just hijack that car?', 'I should probably stop this.'],
        modelFactory: createSpiderManNPC, bounds: spring, cameo: true,
      },
      {
        id: 'cameo_mario', name: 'Mario', type: 'cameo_mario', pos: [178, 0.12, 72],
        dialogues: ["It's-a me!", 'Wrong kind of power-up!', 'Nice-a city!'],
        modelFactory: createMarioNPC, bounds: golden, cameo: true,
      },
      {
        id: 'cameo_sonic', name: 'Sonic', type: 'cameo_sonic', pos: [245, 0.12, 42],
        dialogues: ['Gotta go fast!', 'That Aventador might actually keep up.', 'Too slow!'],
        modelFactory: createSonicNPC, bounds: golden, cameo: true,
      },
      {
        id: 'cameo_master_chief', name: 'Master Chief', type: 'cameo_master_chief', pos: [132, 0.12, 78],
        dialogues: ['This is not the mission briefing.', 'I need a vehicle.', 'That Snorlax is blocking the objective.'],
        modelFactory: createMasterChiefNPC, bounds: golden, cameo: true, combatWeight: 1.65,
      },

      // Roaming Pokémon. Flying species use cheap orbit AI instead of pathfinding.
      {
        id: 'wild_pikachu', name: 'Wild Pikachu', type: 'pokemon_pikachu', pos: [230, 0.12, 78],
        dialogues: ['Pika pika!', 'Pikachuuu!', '*stares at your car keys*'],
        modelFactory: createPikachuModel, bounds: golden, cameo: true, combatWeight: 0.45,
      },
      {
        id: 'wild_charmander', name: 'Wild Charmander', type: 'pokemon_charmander', pos: [165, 0.12, -62],
        dialogues: ['Char!', 'Char-char!', '*tail flame intensifies*'],
        modelFactory: createCharmanderModel, bounds: golden, cameo: true, combatWeight: 0.55,
      },
      {
        id: 'wild_snorlax', name: 'Snorlax', type: 'pokemon_snorlax', pos: [278, 0.12, 118],
        dialogues: ['Zzzzzzz...', '*SNORE*', '...'],
        modelFactory: createSnorlaxNPC, bounds: golden, cameo: true, combatWeight: 3.5, combatHp: 220,
      },
      {
        id: 'wild_bulbasaur', name: 'Bulbasaur', type: 'pokemon_bulbasaur', pos: [225, 0.12, 118],
        dialogues: ['Bulba!', 'Bulbasaur!', '*sniffs the grass*'],
        modelFactory: createBulbasaurNPC, bounds: golden, cameo: true,
      },
      {
        id: 'wild_squirtle', name: 'Squirtle', type: 'pokemon_squirtle', pos: [145, 0.12, 94],
        dialogues: ['Squirtle!', 'Squirt-squirt!', '*adjusts imaginary sunglasses*'],
        modelFactory: createSquirtleNPC, bounds: golden, cameo: true,
      },
      {
        id: 'wild_jigglypuff', name: 'Jigglypuff', type: 'pokemon_jigglypuff', pos: [193, 0.12, 112],
        dialogues: ['Jigglypuff~', '*inhales ominously*', 'Puff!'],
        modelFactory: createJigglypuffNPC, bounds: golden, cameo: true, combatWeight: 0.45,
      },
      {
        id: 'wild_eevee', name: 'Eevee', type: 'pokemon_eevee', pos: [258, 0.12, 70],
        dialogues: ['Vee!', 'Eevee!', '*happy tail noises*'],
        modelFactory: createEeveeNPC, bounds: golden, cameo: true, combatWeight: 0.5,
      },
      {
        id: 'wild_psyduck', name: 'Psyduck', type: 'pokemon_psyduck', pos: [154, 0.12, 132],
        dialogues: ['Psy?', '*headache intensifies*', 'Psyduck...'],
        modelFactory: createPsyduckNPC, bounds: golden, cameo: true,
      },
      {
        id: 'wild_gengar', name: 'Gengar', type: 'pokemon_gengar', pos: [274, 0.12, -74],
        dialogues: ['Geng geng!', '*evil giggling*', 'Gengar!'],
        modelFactory: createGengarNPC, bounds: golden, cameo: true, movementMode: 'hover',
      },
      {
        id: 'wild_machamp', name: 'Machamp', type: 'pokemon_machamp', pos: [126, 0.12, -104],
        dialogues: ['Machamp!', '*flexes all four arms*', 'Champ!'],
        modelFactory: createMachampNPC, bounds: golden, cameo: true, combatWeight: 2.2, combatHp: 170,
      },
      {
        id: 'wild_charizard', name: 'Charizard', type: 'pokemon_charizard', pos: [258, 0.12, -10],
        dialogues: ['ROAAAR!', 'Charizard!', '*circles over Goldenrod*'],
        modelFactory: createCharizardNPC, bounds: golden, cameo: true, movementMode: 'flying', flightHeight: 11, flightRadius: 18,
      },
      {
        id: 'wild_hooh', name: 'Ho-Oh', type: 'pokemon_hooh', pos: [210, 0.12, 25],
        dialogues: ['HOOOOH!', '*legendary bird noises*', '*rainbow energy intensifies*'],
        modelFactory: createHoOhNPC, bounds: golden, cameo: true, movementMode: 'flying', flightHeight: 19, flightRadius: 28, combatWeight: 1.6,
      },
    ];

    // Peppa Pig family: kept together as a recognisable family stop in the open
    // front-left section of the Krusty Burger lot. Ground-spawn validation below
    // still relocates an individual member if a future prop/map edit blocks them.
    const pigFamilyBounds = { minX: -286, maxX: -276, minZ: -120.5, maxZ: -113.0 };
    cameos.push(
      {
        id: 'cameo_peppa_pig', name: 'Peppa Pig', type: 'cameo_peppa_pig', pos: [-282.8, 0.12, -116.0],
        dialogues: CROSSOVER_DIALOGUES.peppa_pig, modelFactory: createPeppaPigNPC,
        bounds: pigFamilyBounds, cameo: true, combatWeight: 0.56,
      },
      {
        id: 'cameo_george_pig', name: 'George Pig', type: 'cameo_george_pig', pos: [-280.6, 0.12, -115.5],
        dialogues: CROSSOVER_DIALOGUES.george_pig, modelFactory: createGeorgePigNPC,
        bounds: pigFamilyBounds, cameo: true, combatWeight: 0.43,
      },
      {
        id: 'cameo_mummy_pig', name: 'Mummy Pig', type: 'cameo_mummy_pig', pos: [-283.5, 0.12, -119.0],
        dialogues: CROSSOVER_DIALOGUES.mummy_pig, modelFactory: createMummyPigNPC,
        bounds: pigFamilyBounds, cameo: true, combatWeight: 1.02,
      },
      {
        id: 'cameo_daddy_pig', name: 'Daddy Pig', type: 'cameo_daddy_pig', pos: [-280.6, 0.12, -119.1],
        dialogues: CROSSOVER_DIALOGUES.daddy_pig, modelFactory: createDaddyPigNPC,
        bounds: pigFamilyBounds, cameo: true, combatWeight: 1.42,
      },
    );

    // Expanded crossover population. These use deliberately lightweight low-poly
    // caricatures and the existing distance LOD so the city feels packed without
    // simulating forty expensive hero meshes at full detail all at once.
    const crossoverSpecs: Array<{ id: string; name: string; kind: string; city: 'spring' | 'golden'; x: number; z: number; flying?: boolean; weight?: number; bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } }> = [
      // Enhancement: a small quality-first batch of recognisable cameos. These are
      // intentionally spread across both cities instead of forming one cameo cluster.
      { id:'donald_trump', name:'Donald Trump', kind:'donald_trump', city:'spring', x:-160, z:63, weight:1.08 },
      { id:'barack_obama', name:'Barack Obama', kind:'barack_obama', city:'golden', x:211, z:-124 },
      { id:'peter_griffin', name:'Peter Griffin', kind:'peter_griffin', city:'spring', x:-247, z:112, weight:1.65 },
      { id:'rick_sanchez', name:'Rick Sanchez', kind:'rick_sanchez', city:'golden', x:279, z:-23, bounds:{ minX:265, maxX:281, minZ:-42, maxZ:-15 } },
      { id:'morty_smith', name:'Morty Smith', kind:'morty_smith', city:'golden', x:274, z:-27, weight:0.78, bounds:{ minX:265, maxX:281, minZ:-42, maxZ:-15 } },
      // Music/public-figure cameos use compact local wander zones. The requested
      // positions are deliberately off active carriageways; if map geometry changes,
      // addNPC's shared collision-grounding pass relocates them within a safe opening.
      { id:'jeffrey_epstein', name:'Jeffrey Epstein', kind:'jeffrey_epstein', city:'spring', x:-252, z:-92, weight:0.92, bounds:{ minX:-258, maxX:-246, minZ:-98, maxZ:-86 } },
      { id:'diddy', name:'Diddy', kind:'diddy', city:'spring', x:-151, z:-106, weight:1.04, bounds:{ minX:-157, maxX:-145, minZ:-112, maxZ:-100 } },
      { id:'billie_eilish', name:'Billie Eilish', kind:'billie_eilish', city:'golden', x:218, z:-116, weight:0.92, bounds:{ minX:212, maxX:224, minZ:-122, maxZ:-110 } },
      { id:'drake', name:'Drake', kind:'drake', city:'golden', x:238, z:-126, weight:1.08, bounds:{ minX:232, maxX:244, minZ:-132, maxZ:-120 } },
      { id:'juice_wrld', name:'Juice WRLD', kind:'juice_wrld', city:'golden', x:174, z:105, weight:0.95, bounds:{ minX:168, maxX:180, minZ:99, maxZ:111 } },
      { id:'central_cee', name:'Central Cee', kind:'central_cee', city:'spring', x:-176, z:104, weight:0.94, bounds:{ minX:-182, maxX:-170, minZ:98, maxZ:110 } },
      { id:'travis_scott', name:'Travis Scott', kind:'travis_scott', city:'spring', x:-150, z:108, weight:0.98, bounds:{ minX:-156, maxX:-144, minZ:102, maxZ:114 } },
      { id:'kid_laroi', name:'The Kid LAROI', kind:'kid_laroi', city:'golden', x:142, z:132, weight:0.90, bounds:{ minX:136, maxX:148, minZ:126, maxZ:138 } },
      { id:'deadpool', name:'Deadpool', kind:'deadpool', city:'spring', x:-124, z:58, weight:1.15 },
      { id:'goku', name:'Goku', kind:'goku', city:'golden', x:151, z:142, weight:1.25 },
      { id:'luigi', name:'Luigi', kind:'luigi', city:'golden', x:172, z:86 },
      { id:'peach', name:'Princess Peach', kind:'peach', city:'golden', x:204, z:103 },
      { id:'bowser', name:'Bowser', kind:'bowser', city:'golden', x:276, z:96, weight:2.4 },
      { id:'wario', name:'Wario', kind:'wario', city:'golden', x:136, z:58, weight:1.3 },
      { id:'waluigi', name:'Waluigi', kind:'waluigi', city:'golden', x:155, z:115 },
      { id:'toad', name:'Toad', kind:'toad', city:'golden', x:233, z:92 },
      { id:'yoshi', name:'Yoshi', kind:'yoshi', city:'golden', x:287, z:36 },
      { id:'steve', name:'Minecraft Steve', kind:'steve', city:'golden', x:123, z:-12 },
      { id:'villager', name:'Minecraft Villager', kind:'villager', city:'golden', x:267, z:-34 },
      { id:'creeper', name:'Creeper', kind:'creeper', city:'golden', x:284, z:-112, weight:1.2 },
      { id:'minecraft_zombie', name:'Minecraft Zombie', kind:'minecraft_zombie', city:'golden', x:119, z:-126 },
      { id:'dr_doom', name:'Doctor Doom', kind:'dr_doom', city:'spring', x:-286, z:-35, weight:1.5 },
      { id:'miles', name:'Miles Morales', kind:'miles_morales', city:'spring', x:-242, z:94 },
      { id:'punk_spider', name:'Spider-Punk', kind:'punk_spiderman', city:'spring', x:-184, z:111 },
      { id:'punisher', name:'The Punisher', kind:'punisher', city:'spring', x:-169, z:2, weight:1.3 },
      { id:'vader', name:'Darth Vader', kind:'darth_vader', city:'spring', x:-272, z:18, weight:1.8 },
      { id:'stormtrooper_1', name:'Stormtrooper', kind:'stormtrooper', city:'spring', x:-264, z:12 },
      { id:'stormtrooper_2', name:'Stormtrooper', kind:'stormtrooper', city:'spring', x:-278, z:9 },
      { id:'yoda', name:'Yoda', kind:'yoda', city:'spring', x:-128, z:102, weight:0.55 },
      { id:'palpatine', name:'Emperor Palpatine', kind:'palpatine', city:'spring', x:-295, z:-104, weight:1.2 },
      { id:'mace', name:'Mace Windu', kind:'mace_windu', city:'spring', x:-231, z:-80, weight:1.2 },
      { id:'pennywise', name:'Pennywise', kind:'pennywise', city:'spring', x:-292, z:116 },
      { id:'art', name:'Art the Clown', kind:'art_clown', city:'spring', x:-121, z:-117 },
      { id:'donkey', name:'Donkey', kind:'donkey', city:'spring', x:-275, z:70, weight:1.2 },
      { id:'puss', name:'Puss in Boots', kind:'puss_in_boots', city:'spring', x:-257, z:82, weight:0.6 },
      { id:'gru', name:'Gru', kind:'gru', city:'spring', x:-193, z:-25, weight:1.25 },
      // Keep the roundabout / grand-intersection driving surfaces clear. These cameos now start
      // on pedestrian ground beside the civic area instead of spawning in live lanes.
      { id:'minion_1', name:'Minion Kevin', kind:'minion', city:'spring', x:-188, z:5, weight:0.55 },
      { id:'minion_2', name:'Minion Bob', kind:'minion', city:'spring', x:-198, z:12, weight:0.55 },
      { id:'vector', name:'Vector', kind:'vector', city:'spring', x:-176, z:-5 },
      { id:'mr_bean', name:'Mr Bean', kind:'mr_bean', city:'spring', x:-225, z:68 },
      { id:'sulley', name:'Sulley', kind:'sulley', city:'spring', x:-154, z:101, weight:2.0 },
      { id:'mike', name:'Mike Wazowski', kind:'mike_wazowski', city:'spring', x:-148, z:106, weight:0.65 },
      // Keep the compact bridge approach physically clear. These heroes start
      // together on pedestrian/grass space well south of the junction instead.
      { id:'incredible', name:'Mr. Incredible', kind:'mr_incredible', city:'spring', x:-128, z:51, weight:2.0 },
      { id:'frozone', name:'Frozone', kind:'frozone', city:'spring', x:-132, z:51 },
      { id:'po', name:'Po', kind:'po', city:'golden', x:233, z:134, weight:2.0 },
      { id:'tai_lung', name:'Tai Lung', kind:'tai_lung', city:'golden', x:271, z:136, weight:1.5 },
      { id:'shifu', name:'Master Shifu', kind:'master_shifu', city:'golden', x:235, z:143, weight:0.65 },
      { id:'toothless', name:'Toothless', kind:'toothless', city:'golden', x:212, z:-92, weight:1.7, bounds:{ minX:198, maxX:226, minZ:-108, maxZ:-78 } },
      { id:'c3po', name:'C-3PO', kind:'c3po', city:'golden', x:127, z:112 },
      { id:'r2d2', name:'R2-D2', kind:'r2d2', city:'golden', x:134, z:114, weight:0.8 },
      { id:'chewie', name:'Chewbacca', kind:'chewbacca', city:'golden', x:145, z:119, weight:1.7 },
      // Iron Man is ground-first. His dedicated mobility state machine below
      // occasionally takes him into a short, low-altitude flight, then returns him
      // to the ordinary pedestrian AI. Do not mark him as a generic always-flying NPC.
      { id:'iron_man', name:'Iron Man', kind:'iron_man', city:'golden', x:252, z:104, weight:1.4 },
      { id:'baymax', name:'Baymax', kind:'baymax', city:'golden', x:252, z:-48, weight:1.6, bounds:{ minX:238, maxX:270, minZ:-62, maxZ:-20 } },
      // Back to the Future 1.21 Gigawatts Duo - standing right by the DeLorean Time Machine!
      { id:'doc_brown', name:'Doc Brown', kind:'doc_brown', city:'golden', x:163, z:-102, weight:1.05 },
      { id:'marty_mcfly', name:'Marty McFly', kind:'marty_mcfly', city:'golden', x:167, z:-102, weight:0.95 },
    ];

    for (const spec of crossoverSpecs) {
      const bounds = spec.bounds ?? (spec.city === 'spring' ? spring : golden);
      cameos.push({
        id: `cameo_${spec.id}`,
        name: spec.name,
        type: `cameo_${spec.id}`,
        pos: [spec.x, 0.12, spec.z],
        dialogues: CROSSOVER_DIALOGUES[spec.kind] ?? [
          `${spec.name}: This place is stranger than I expected.`,
          'I should probably keep moving.',
        ],
        modelFactory: () => polishPopCultureCameoNPC(createPopCultureCameoNPC(spec.kind), spec.kind),
        bounds,
        cameo: true,
        combatWeight: spec.weight ?? 1,
        movementMode: spec.flying ? 'flying' : 'ground',
        flightHeight: spec.flying ? 13 : undefined,
        flightRadius: spec.flying ? 24 : undefined,
      });
    }


    // Small, unique Brainrot cameo set.  These are hand-authored once each rather
    // than spawned as a crowd so the meme additions remain recognisable and cheap.
    const brainrotSpecs: Array<{
      id: string; name: string; kind: string; pos: [number, number, number];
      bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
      mode?: 'ground' | 'flying'; weight?: number; flightHeight?: number; flightRadius?: number; stationary?: boolean;
    }> = [
      {
        id: 'brainrot_tung_tung_sahur', name: 'Tung Tung Tung Sahur', kind: 'tung_tung_sahur',
        pos: [-246, 0.12, -70], bounds: { minX: -268, maxX: -226, minZ: -102, maxZ: -55 }, weight: 1.45,
      },
      {
        id: 'brainrot_tralalero_tralala', name: 'Tralalero Tralala', kind: 'tralalero_tralala',
        pos: [103, 0.12, 82], bounds: { minX: 88, maxX: 116, minZ: 62, maxZ: 105 }, weight: 1.25,
      },
      {
        id: 'brainrot_bombardiro_crocodilo', name: 'Bombardiro Crocodilo', kind: 'bombardiro_crocodilo',
        pos: [-268, 0.12, -28], bounds: { minX: -300, maxX: -210, minZ: -82, maxZ: 30 },
        mode: 'flying', weight: 2.2, flightHeight: 17, flightRadius: 30,
      },
      {
        id: 'brainrot_ballerina_cappuccina', name: 'Ballerina Cappuccina', kind: 'ballerina_cappuccina',
        pos: [-207, 0.12, -5], bounds: { minX: -212, maxX: -201, minZ: -11, maxZ: 2 }, weight: 0.72, stationary: true,
      },
      {
        id: 'brainrot_cappuccino_assassino', name: 'Cappuccino Assassino', kind: 'cappuccino_assassino',
        pos: [-195, 0.12, -116], bounds: { minX: -204, maxX: -187, minZ: -124, maxZ: -108 }, weight: 0.9,
      },
      {
        id: 'brainrot_lirili_larila', name: 'Lirili Larila', kind: 'lirili_larila',
        pos: [162, 0.12, 129], bounds: { minX: 145, maxX: 181, minZ: 112, maxZ: 148 }, weight: 1.55,
      },
    ];
    for (const spec of brainrotSpecs) {
      cameos.push({
        id: spec.id,
        name: spec.name,
        type: spec.id,
        pos: spec.pos,
        dialogues: BRAINROT_DIALOGUES[spec.kind],
        modelFactory: () => createBrainrotNPC(spec.kind),
        bounds: spec.bounds,
        cameo: true,
        combatWeight: spec.weight ?? 1,
        movementMode: spec.mode ?? 'ground',
        flightHeight: spec.flightHeight,
        flightRadius: spec.flightRadius,
        stationary: spec.stationary,
      });
    }

    // River ecosystem. These are deliberately lightweight and replace some of the
    // generic crowd budget rather than endlessly increasing the total NPC cost.
    // The water surface in the connecting canyon is y=0.075 and spans roughly
    // x=-60..60, z=-240..240. Each species gets its own swim depth and route.
    const waterBounds = { minX: -35, maxX: 35, minZ: 82, maxZ: 165 };
    cameos.push(
      {
        id: 'water_spongebob', name: 'SpongeBob', type: 'cameo_spongebob', pos: [38, -0.78, 55],
        dialogues: CROSSOVER_DIALOGUES.spongebob,
        modelFactory: () => polishPopCultureCameoNPC(createPopCultureCameoNPC('spongebob'), 'spongebob'),
        bounds: { minX: 36, maxX: 47, minZ: 38, maxZ: 82 }, cameo: true, movementMode: 'swimming',
        waterSurfaceY: 0.075, swimDepth: 0.78, diveAmount: 0.12, swimSpeed: 0.44, combatWeight: 0.7,
      },
      {
        id: 'water_squirtle', name: 'Squirtle', type: 'pokemon_squirtle', pos: [-39, -0.52, 24],
        dialogues: ['Squirtle!', '*paddles happily*', 'Squirt-squirt!'], modelFactory: createSquirtleNPC,
        bounds: { minX: -47, maxX: -27, minZ: -10, maxZ: 62 }, cameo: true, movementMode: 'swimming',
        waterSurfaceY: 0.075, swimDepth: 0.52, diveAmount: 0.22, swimSpeed: 0.72, combatWeight: 0.45,
      },
      {
        id: 'water_psyduck', name: 'Psyduck', type: 'pokemon_psyduck', pos: [40, -0.55, -108],
        dialogues: ['Psy?', '*paddles in confused circles*', 'Psyduck...'], modelFactory: createPsyduckNPC,
        bounds: { minX: 28, maxX: 47, minZ: -145, maxZ: -78 }, cameo: true, movementMode: 'swimming',
        waterSurfaceY: 0.075, swimDepth: 0.55, diveAmount: 0.16, swimSpeed: 0.38, combatWeight: 0.55,
      },
      {
        id: 'water_magikarp', name: 'Magikarp', type: 'pokemon_magikarp', pos: [2, -0.32, 122],
        dialogues: ['Karp! Karp!', '*splashes enthusiastically*', 'Magikarp!'], modelFactory: createMagikarpNPC,
        bounds: waterBounds, cameo: true, movementMode: 'swimming', waterSurfaceY: 0.075,
        swimDepth: 0.32, diveAmount: 0.48, swimSpeed: 0.92, combatWeight: 0.35,
      },
      {
        id: 'water_lapras', name: 'Lapras', type: 'pokemon_lapras', pos: [-12, -0.18, -82],
        dialogues: ['Lapras!', '*glides quietly across the river*', '*gentle song*'], modelFactory: createLaprasNPC,
        bounds: { minX: -38, maxX: 38, minZ: -135, maxZ: -38 }, cameo: true, movementMode: 'swimming',
        waterSurfaceY: 0.075, swimDepth: 0.18, diveAmount: 0.08, swimSpeed: 0.31, combatWeight: 1.8,
      },
      {
        id: 'water_gyarados', name: 'Gyarados', type: 'pokemon_gyarados', pos: [-24, -1.18, -192],
        dialogues: ['GYARADOS!', '*a huge shape moves below the surface*', '*roars from the river*'], modelFactory: createGyaradosNPC,
        bounds: { minX: -44, maxX: -9, minZ: -224, maxZ: -148 }, cameo: true, movementMode: 'swimming',
        waterSurfaceY: 0.075, swimDepth: 1.18, diveAmount: 0.75, swimSpeed: 0.26, combatWeight: 2.7, combatHp: 210,
      },
    );

    cameos.forEach((cfg) => this.addNPC(cfg));
  }

  private spawnAmbientPopulation() {
    const goldenBounds = { minX: 115, maxX: 288, minZ: -150, maxZ: 150 };
    const springBounds = { minX: -295, maxX: -120, minZ: -155, maxZ: 125 };
    const spawnCluster = (prefix: string, count: number, bounds: typeof goldenBounds, type: NPCType) => {
      for (let i = 0; i < count; i++) {
        const x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
        const z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random());
        // Ambient 'Citizen' NPCs deliberately use their own visual family. Earlier
        // builds recycled Ned Flanders every few spawns, which made unrelated
        // citizens look like duplicate Neds. Ned now exists only as ned_flanders.
        const variant = i + (prefix === 'spring' ? 20 : 0);
        const npc = this.addNPC({
          id: `${prefix}_citizen_${i}`,
          name: prefix === 'spring' ? `Springfield Citizen ${i + 1}` : `Goldenrod Citizen ${i + 1}`,
          type,
          pos: [x, 0.12, z],
          dialogues: [GENERIC_LINES[i % GENERIC_LINES.length], GENERIC_LINES[(i + 3) % GENERIC_LINES.length]],
          modelFactory: () => createGenericCitizenNPC(variant),
          bounds,
        });
        const s = 0.82 + Math.random() * 0.28;
        npc.mesh.scale.set(s, s * (0.94 + Math.random() * 0.14), s);
        npc.mesh.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            obj.material = obj.material.clone();
            obj.material.color.offsetHSL((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
          }
        });
      }
    };

    // Lots of life, but not so many full models that the browser melts.
    // Keep a believable base population, but the map should not be dominated by
    // numbered/no-name citizens. Six ambient slots were traded for named/water
    // characters above, keeping the overall simulation budget essentially flat.
    // Quality-over-quantity cameo enhancement: six new named characters replace
    // four generic crowd slots, so the simulation budget only grows by two NPCs.
    spawnCluster('golden', 3, goldenBounds, 'citizen');
    spawnCluster('spring', 3, springBounds, 'citizen');
  }

  private ensureSpeechSprite(npc: NPC, text: string) {
    const existing = npc.mesh.getObjectByName('speech_bubble');
    if (existing) {
      npc.mesh.remove(existing);
      if (existing instanceof THREE.Sprite) {
        const material = existing.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      }
    }
    if (typeof document === 'undefined') return;

    // Build a real multi-line speech bubble. The old implementation hard-trimmed
    // everything after ~34 characters and added "...", which made longer character
    // quotes look broken. Wrap against the measured canvas width instead, then grow
    // both the canvas and sprite height to fit every line without shrinking the font.
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fontSize = 29;
    const lineHeight = 36;
    const maxTextWidth = 550;
    ctx.font = `bold ${fontSize}px sans-serif`;

    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxTextWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // Extremely long unbroken tokens are split by measured width rather than
      // overflowing the bubble.
      if (ctx.measureText(word).width > maxTextWidth) {
        let chunk = '';
        for (const ch of word) {
          const nextChunk = chunk + ch;
          if (ctx.measureText(nextChunk).width > maxTextWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else chunk = nextChunk;
        }
        current = chunk;
      } else current = word;
    }
    if (current || lines.length === 0) lines.push(current || '...');

    const verticalPadding = 34;
    canvas.height = Math.max(132, verticalPadding * 2 + lines.length * lineHeight);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 24);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const blockHeight = lines.length * lineHeight;
    const firstY = canvas.height / 2 - blockHeight / 2 + lineHeight / 2;
    lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, firstY + i * lineHeight, maxTextWidth));

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'speech_bubble';
    sprite.position.set(0, Math.max(3.5, 3.5 / Math.max(0.6, npc.mesh.scale.y)), 0);
    const aspect = canvas.width / canvas.height;
    const spriteHeight = THREE.MathUtils.clamp(1.15 + Math.max(0, lines.length - 1) * 0.34, 1.15, 2.75);
    sprite.scale.set(spriteHeight * aspect, spriteHeight, 1);
    sprite.renderOrder = 999;
    npc.mesh.add(sprite);
  }

  private isDeadBody(npc: NPC): boolean {
    return npc.state === 'defeated' || npc.mesh.userData.deadBody === true || (npc.combatHp ?? 1) <= 0;
  }

  private clearNPCSpeech(npc: NPC): void {
    npc.speechBubbleText = null;
    npc.speechBubbleTimer = 0;
    const bubble = npc.mesh.getObjectByName('speech_bubble');
    if (!bubble) return;
    npc.mesh.remove(bubble);
    if (bubble instanceof THREE.Sprite) {
      const material = bubble.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }
  }

  private markDeadBody(npc: NPC): void {
    npc.mesh.userData.deadBody = true;
    npc.mesh.userData.powerShowcaseRequested = false;
    npc.mesh.userData.powerRevengePending = false;
    npc.mesh.userData.powerThreatUntil = 0;
    this.clearPedestrianRoute(npc);
    this.clearNPCSpeech(npc);
  }

  public say(npc: NPC, text: string, seconds = 2.2) {
    // Death silences the character, not the body. Physical attacks can continue to
    // relaunch the ragdoll, but no post-death hit is allowed to create dialogue,
    // pain lines, speech bubbles or character voice reactions.
    if (this.isDeadBody(npc)) {
      this.clearNPCSpeech(npc);
      return;
    }
    npc.speechBubbleText = text;
    npc.speechBubbleTimer = seconds;
    this.ensureSpeechSprite(npc, text);

    // Vector's "OH YEAHHH!" gets an actual celebratory body move instead of a
    // static speech bubble. The timer is handled in update() and restores every
    // animated transform cleanly when it finishes.
    if (npc.id === 'brainrot_tung_tung_sahur') playSoundEffect('brainrotTung', npc.mesh.position);
    else if (npc.id === 'brainrot_ballerina_cappuccina') playSoundEffect('brainrotDance', npc.mesh.position);
    else if (npc.id === 'brainrot_cappuccino_assassino') playSoundEffect('brainrotNinja', npc.mesh.position);
    else if (npc.id === 'brainrot_bombardiro_crocodilo') playSoundEffect('brainrotFly', npc.mesh.position);
    else if (npc.id.startsWith('brainrot_')) playSoundEffect('brainrotWeird', npc.mesh.position);

    if (npc.id === 'cameo_vector' && /OH YEAHHH/i.test(text) && !this.isPedestrianTransitCritical(npc)) {
      npc.mesh.userData.vectorCelebrateTimer = 1.35;
      npc.mesh.userData.vectorCelebrateDuration = 1.35;
      npc.mesh.userData.vectorCelebrateBaseY = npc.mesh.position.y;
      npc.walkTimer = Math.max(npc.walkTimer ?? 0, 1.4);
      npc.state = 'idle';
    }
  }

  public getDialogue(npc: NPC): string {
    // Talking to a powered character can request a harmless ability showcase. The
    // update loop still respects the normal cooldown, so chatting cannot spam FX.
    if (this.getPowerProfile(npc)) npc.mesh.userData.powerShowcaseRequested = true;
    const options = npc.voiceQuotes?.length
      ? npc.voiceQuotes
      : Array.isArray(npc.dialogue)
      ? npc.dialogue
      : [npc.dialogue ?? '...'];
    if (options.length <= 1) return options[0] ?? '...';

    // Character dialogue should feel varied rather than randomly picking the same
    // catchphrase twice in a row. Preserve randomness, but explicitly avoid the
    // immediately previous line for this NPC when there is another option.
    const previous = Number.isInteger(npc.mesh.userData.lastDialogueIndex)
      ? Number(npc.mesh.userData.lastDialogueIndex)
      : -1;
    let index = Math.floor(Math.random() * options.length);
    if (index === previous) index = (index + 1 + Math.floor(Math.random() * (options.length - 1))) % options.length;
    npc.mesh.userData.lastDialogueIndex = index;
    return options[index] ?? options[0] ?? '...';
  }

  private setBeamTransform(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) {
    const dir = end.clone().sub(start);
    const length = Math.max(0.05, dir.length());
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  private spawnPowerBeam(start: THREE.Vector3, end: THREE.Vector3, color: number, radius = 0.045, life = 0.18, web = false) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: web ? 0.82 : 0.92,
      depthWrite: false,
      blending: web ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, web ? 5 : 7), material);
    this.setBeamTransform(beam, start, end);
    group.add(beam);

    if (web) {
      // A couple of very cheap offset strands sell the web look without a costly
      // particle simulation or a persistent physics rope.
      const dir = end.clone().sub(start).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.045);
      for (const sign of [-1, 1]) {
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, 1, 4), material);
        this.setBeamTransform(strand, start.clone().addScaledVector(side, sign), end.clone().addScaledVector(side, sign));
        group.add(strand);
      }
    }

    this.scene.add(group);
    this.combatEffects.push({ group, life, maxLife: life, material, mode: 'beam' });
  }

  private spawnPowerRing(position: THREE.Vector3, color: number, size = 1) {
    const group = new THREE.Group();
    group.position.copy(position);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48 * size, 0.055 * size, 6, 18), material);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    this.scene.add(group);
    this.combatEffects.push({ group, life: 0.34, maxLife: 0.34, material, mode: 'burst' });
  }

  private rememberPlayerAggression(npc: NPC, source: THREE.Vector3) {
    const now = performance.now() * 0.001;
    this.playerAggressionSerial += 1;
    this.lastPlayerAggressionPosition.copy(source);
    this.lastPlayerAggressionTarget.copy(npc.mesh.position);
    this.lastPlayerAggressionUntil = now + 4.0;
    if (this.getPowerProfile(npc)) {
      // One attack from the player earns exactly one revenge action. The pending
      // flag is consumed as soon as the powered NPC answers, preventing a single
      // punch from becoming a permanent superhero boss fight.
      npc.mesh.userData.powerThreatUntil = now + 8.0;
      npc.mesh.userData.powerThreatSource = source.clone();
      npc.mesh.userData.powerRevengePending = true;
      npc.mesh.userData.powerCooldown = Math.min(Number(npc.mesh.userData.powerCooldown ?? 0), 0.35);
      npc.mesh.userData.powerAggressionSerial = this.playerAggressionSerial;
    }
  }

  private findNearbyHostileNPC(source: NPC, range: number): NPC | null {
    let best: NPC | null = null;
    let bestD2 = range * range;
    for (const other of this.cachedHostileNPCs) {
      if (other === source || !other.mesh.visible) continue;
      const d2 = other.mesh.position.distanceToSquared(source.mesh.position);
      if (d2 < bestD2) { bestD2 = d2; best = other; }
    }
    return best;
  }

  private applyPowerHitToNPC(source: NPC, target: NPC, profile: PowerProfile, now: number) {
    const from = source.mesh.position.clone().add(new THREE.Vector3(0, 1.25, 0));
    const to = target.mesh.position.clone().add(new THREE.Vector3(0, 1.05, 0));
    const away = target.mesh.position.clone().sub(source.mesh.position).setY(0);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    away.normalize();

    let launchDir = away.clone();
    let launchPower = 10;
    let vertical = 6.5;
    let damage = profile.damage;
    let sound = 'powerEnergy';

    if (profile.kind === 'spider') {
      this.spawnPowerBeam(from, to, profile.color, 0.035, 0.24, true);
      target.mesh.userData.powerSnaredUntil = now + 2.0;
      launchDir.multiplyScalar(-1);
      launchPower = 5.5;
      vertical = 3.6;
      damage = 2;
      sound = 'powerWeb';
    } else if (profile.kind === 'force') {
      this.spawnPowerRing(source.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), profile.color, 1.1);
      launchPower = source.id === 'cameo_vader' ? 13 : 11;
      sound = 'powerForce';
    } else if (profile.kind === 'sith_lightning') {
      this.spawnPowerBeam(from, to, profile.color, 0.055, 0.22);
      launchPower = 8;
      vertical = 5;
      sound = 'powerEnergy';
    } else if (profile.kind === 'iron_man') {
      this.spawnPowerBeam(from, to, profile.color, 0.075, 0.18);
      launchPower = 13;
      vertical = 7;
      sound = 'powerRepulsor';
    } else if (profile.kind === 'ice') {
      this.spawnPowerBeam(from, to, profile.color, 0.065, 0.26);
      target.mesh.userData.powerSnaredUntil = now + 2.8;
      launchPower = 4.5;
      vertical = 3.2;
      sound = 'powerIce';
    } else if (profile.kind === 'super_strength') {
      this.spawnPowerRing(target.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)), profile.color, 1.3);
      launchPower = 16;
      vertical = 8.5;
      sound = 'powerForce';
    } else if (profile.kind === 'sonic_dash') {
      this.spawnPowerBeam(from, to, profile.color, 0.12, 0.14);
      launchPower = 14;
      vertical = 6;
      sound = 'powerDash';
    } else if (profile.kind === 'fire_breath') {
      this.spawnPowerBeam(from, to, profile.color, 0.10, 0.28);
      target.mesh.userData.burnTimer = Math.max(target.mesh.userData.burnTimer ?? 0, 3.2);
      launchPower = 8;
      sound = 'fire';
    } else if (profile.kind === 'shadow_pulse') {
      this.spawnPowerRing(target.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0)), profile.color, 1.15);
      launchPower = 10;
      sound = 'powerEnergy';
    } else if (profile.kind === 'plasma' || profile.kind === 'doom_energy') {
      this.spawnPowerBeam(from, to, profile.color, 0.075, 0.20);
      launchPower = 12;
      sound = 'powerEnergy';
    }

    target.combatHp = Math.max(0, (target.combatHp ?? target.combatMaxHp ?? 100) - Math.max(1, damage));
    target.mesh.userData.pendingKnockout = (target.combatHp ?? 1) <= 0;
    this.launchNPC(target, launchDir, launchPower, vertical);
    if ((profile.kind === 'force' || profile.kind === 'super_strength') && this.worldPowerEffectHandler) {
      this.worldPowerEffectHandler({
        kind: profile.kind === 'force' ? 'force' : 'impact',
        source: source.mesh.position.clone(),
        direction: launchDir.clone(),
        radius: profile.kind === 'force' ? 5.2 : 3.6,
        power: profile.kind === 'force' ? 10 : 12,
      });
    }
    playSoundEffect(sound, source.mesh.position);
  }

  private performPowerAttackOnPlayer(npc: NPC, profile: PowerProfile, playerPos: THREE.Vector3, now: number) {
    if (!this.playerPowerEffectHandler) return;
    const source = npc.mesh.position.clone().add(new THREE.Vector3(0, 1.25, 0));
    const target = playerPos.clone().add(new THREE.Vector3(0, 0.9, 0));
    const away = playerPos.clone().sub(npc.mesh.position).setY(0);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    away.normalize();

    let impulse = away.clone().multiplyScalar(5).setY(2.0);
    let damage = profile.damage;
    let reason = `${npc.name}'s power`;
    let slowSeconds = 0;
    let sound = 'powerEnergy';

    if (profile.kind === 'spider') {
      this.spawnPowerBeam(source, target, profile.color, 0.035, 0.25, true);
      // Webs pull the attacker off balance instead of launching them across the city.
      impulse = npc.mesh.position.clone().sub(playerPos).setY(0).normalize().multiplyScalar(3.2).setY(1.1);
      damage = 2;
      slowSeconds = 1.4;
      reason = `${npc.name}'s web`; sound = 'powerWeb';
    } else if (profile.kind === 'force') {
      const close = playerPos.distanceTo(npc.mesh.position) < 3.7;
      const prop = npc.mesh.getObjectByName('signature_prop');
      if (close && prop) {
        npc.mesh.userData.powerAnimationUntil = now + 0.52;
        npc.mesh.userData.powerAnimationBaseZ = prop.rotation.z;
        damage = Math.max(profile.damage, 7);
        impulse.multiplyScalar(1.25);
        reason = `${npc.name}'s energy-blade strike`; sound = 'powerBlade';
        this.spawnImpactBurst(target, profile.color, 0.95);
      } else {
        const pull = npc.id === 'cameo_vader' && Math.random() < 0.35;
        impulse = (pull ? npc.mesh.position.clone().sub(playerPos) : away).setY(0).normalize().multiplyScalar(pull ? 4.2 : 7.2).setY(pull ? 0.8 : 2.8);
        damage = Math.min(damage, 5);
        reason = `${npc.name}'s Force-style ${pull ? 'pull' : 'push'}`; sound = 'powerForce';
        this.spawnPowerRing(npc.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), profile.color, 1.15);
      }
    } else if (profile.kind === 'sith_lightning') {
      this.spawnPowerBeam(source, target, profile.color, 0.055, 0.24);
      impulse.multiplyScalar(0.8); reason = `${npc.name}'s energy lightning`; sound = 'powerEnergy';
    } else if (profile.kind === 'iron_man') {
      this.spawnPowerBeam(source, target, profile.color, 0.08, 0.18);
      impulse.multiplyScalar(1.45); reason = `${npc.name}'s suit blast`; sound = 'powerRepulsor';
    } else if (profile.kind === 'doom_energy') {
      this.spawnPowerBeam(source, target, profile.color, 0.075, 0.20);
      impulse.multiplyScalar(1.3); reason = `${npc.name}'s energy blast`; sound = 'powerEnergy';
    } else if (profile.kind === 'ice') {
      this.spawnPowerBeam(source, target, profile.color, 0.065, 0.28);
      impulse.multiplyScalar(0.55); damage = 3; slowSeconds = 2.0; reason = `${npc.name}'s ice blast`; sound = 'powerIce';
    } else if (profile.kind === 'super_strength') {
      this.spawnPowerRing(npc.mesh.position.clone().add(new THREE.Vector3(0, 0.7, 0)), profile.color, 1.4);
      impulse.multiplyScalar(1.8); reason = `${npc.name}'s super-strength shove`; sound = 'powerForce';
    } else if (profile.kind === 'sonic_dash') {
      this.spawnPowerBeam(source, target, profile.color, 0.12, 0.14);
      impulse.multiplyScalar(1.55); damage = 4; reason = `${npc.name}'s speed burst`; sound = 'powerDash';
    } else if (profile.kind === 'fire_breath') {
      this.spawnPowerBeam(source, target, profile.color, 0.10, 0.28);
      impulse.multiplyScalar(0.9); reason = `${npc.name}'s fire breath`; sound = 'fire';
    } else if (profile.kind === 'shadow_pulse') {
      this.spawnPowerRing(target, profile.color, 1.15);
      impulse.multiplyScalar(1.05); reason = `${npc.name}'s shadow pulse`; sound = 'powerEnergy';
    } else if (profile.kind === 'plasma') {
      this.spawnPowerBeam(source, target, profile.color, 0.08, 0.20);
      impulse.multiplyScalar(1.35); reason = `${npc.name}'s plasma blast`; sound = 'powerEnergy';
    }

    if ((profile.kind === 'force' || profile.kind === 'super_strength') && this.worldPowerEffectHandler) {
      this.worldPowerEffectHandler({
        kind: profile.kind === 'force' ? 'force' : 'impact',
        source: npc.mesh.position.clone(),
        direction: away.clone(),
        radius: profile.kind === 'force' ? 5.5 : 3.8,
        power: profile.kind === 'force' ? 11 : 13,
      });
    }
    playSoundEffect(sound, npc.mesh.position);
    this.playerPowerEffectHandler({ damage, impulse, reason, slowSeconds: slowSeconds || undefined });
  }

  private startSpiderSwing(npc: NPC, now: number): boolean {
    const bounds = npc.mesh.userData.wanderBounds as SpawnConfig['bounds'] | undefined;
    const angle = Math.random() * Math.PI * 2;
    const distance = 8 + Math.random() * 6;
    const end = npc.mesh.position.clone().add(new THREE.Vector3(Math.sin(angle) * distance, 0, Math.cos(angle) * distance));
    if (bounds) {
      end.x = THREE.MathUtils.clamp(end.x, bounds.minX + 1.2, bounds.maxX - 1.2);
      end.z = THREE.MathUtils.clamp(end.z, bounds.minZ + 1.2, bounds.maxZ - 1.2);
    }
    end.y = this.groundHeight(end.x, end.z, npc.mesh.position.y);
    if (!this.canOccupy(end, 0.48, 1.75)) return false;

    const start = npc.mesh.position.clone();
    const anchor = start.clone().lerp(end, 0.52);
    anchor.y = Math.max(start.y, end.y) + 6.5 + Math.random() * 2.8;
    npc.mesh.userData.spiderSwingStart = start;
    npc.mesh.userData.spiderSwingEnd = end;
    npc.mesh.userData.spiderSwingAnchor = anchor;
    npc.mesh.userData.spiderSwingElapsed = 0;
    npc.mesh.userData.spiderSwingDuration = 1.15 + Math.random() * 0.35;
    npc.mesh.userData.spiderWebTrailTimer = 0;
    npc.state = 'power_swing';
    npc.mesh.userData.powerCooldown = 8 + Math.random() * 6;
    playSoundEffect('powerWeb', npc.mesh.position);
    return true;
  }

  private updateSpiderSwing(npc: NPC, dt: number): boolean {
    if (npc.state !== 'power_swing') return false;
    const start = npc.mesh.userData.spiderSwingStart as THREE.Vector3 | undefined;
    const end = npc.mesh.userData.spiderSwingEnd as THREE.Vector3 | undefined;
    const anchor = npc.mesh.userData.spiderSwingAnchor as THREE.Vector3 | undefined;
    const duration = Number(npc.mesh.userData.spiderSwingDuration ?? 1.25);
    if (!start || !end || !anchor) { npc.state = 'idle'; return false; }

    const elapsed = Number(npc.mesh.userData.spiderSwingElapsed ?? 0) + dt;
    npc.mesh.userData.spiderSwingElapsed = elapsed;
    const t = THREE.MathUtils.clamp(elapsed / duration, 0, 1);
    const u = 1 - t;
    const pos = start.clone().multiplyScalar(u * u)
      .add(anchor.clone().multiplyScalar(2 * u * t))
      .add(end.clone().multiplyScalar(t * t));
    const aheadT = Math.min(1, t + 0.03);
    const au = 1 - aheadT;
    const ahead = start.clone().multiplyScalar(au * au)
      .add(anchor.clone().multiplyScalar(2 * au * aheadT))
      .add(end.clone().multiplyScalar(aheadT * aheadT));
    npc.mesh.position.copy(pos);
    const motion = ahead.sub(pos);
    if (motion.lengthSq() > 0.001) npc.mesh.rotation.y = Math.atan2(motion.x, motion.z);
    npc.mesh.rotation.z = Math.sin(t * Math.PI) * 0.22;

    npc.mesh.userData.spiderWebTrailTimer = Number(npc.mesh.userData.spiderWebTrailTimer ?? 0) - dt;
    if (npc.mesh.userData.spiderWebTrailTimer <= 0) {
      this.spawnPowerBeam(npc.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), anchor, 0xf4fbff, 0.022, 0.13, true);
      npc.mesh.userData.spiderWebTrailTimer = 0.09;
    }

    if (t >= 1) {
      npc.mesh.position.copy(end);
      npc.mesh.rotation.z = 0;
      npc.state = 'idle';
      npc.walkTimer = 0.45 + Math.random() * 0.8;
      delete npc.mesh.userData.spiderSwingStart;
      delete npc.mesh.userData.spiderSwingEnd;
      delete npc.mesh.userData.spiderSwingAnchor;
    }
    return true;
  }

  private ensureIronThrusters(npc: NPC): THREE.Group {
    let fx = npc.mesh.getObjectByName('iron_thruster_fx') as THREE.Group | undefined;
    if (fx) return fx;

    fx = new THREE.Group();
    fx.name = 'iron_thruster_fx';
    fx.visible = false;
    const jetMat = new THREE.MeshBasicMaterial({
      color: 0x9ff4ff,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const addJet = (name: string, x: number, y: number, z: number, radius: number, length: number) => {
      const jet = new THREE.Group();
      jet.name = name;
      jet.position.set(x, y, z);
      const plume = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 7), jetMat);
      // ConeGeometry points along +Y. Rotate it so the thrust plume shoots down.
      plume.rotation.x = Math.PI;
      plume.position.y = -length * 0.42;
      const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.72, 7, 5), coreMat);
      core.scale.y = 0.42;
      jet.add(plume, core);
      fx!.add(jet);
      return jet;
    };

    // Boots provide the main lift while the palms act as stabilising repulsors.
    addJet('iron_boot_jet_left', -0.20, 0.08, 0.02, 0.095, 0.52);
    addJet('iron_boot_jet_right', 0.20, 0.08, 0.02, 0.095, 0.52);
    addJet('iron_palm_jet_left', -0.61, 0.88, 0.10, 0.075, 0.38);
    addJet('iron_palm_jet_right', 0.61, 0.88, 0.10, 0.075, 0.38);

    npc.mesh.add(fx);
    return fx;
  }

  private updateIronManFlightPose(npc: NPC, now: number, amount: number) {
    const t = THREE.MathUtils.clamp(amount, 0, 1);
    const armL = npc.mesh.getObjectByName('arm_left');
    const armR = npc.mesh.getObjectByName('arm_right');
    const legL = npc.mesh.getObjectByName('leg_left');
    const legR = npc.mesh.getObjectByName('leg_right');

    // A low, relaxed repulsor pose: arms angle slightly out/back so the palms point
    // towards the ground, while the boots remain separated for stable thrust.
    if (armL) {
      armL.rotation.x = THREE.MathUtils.damp(armL.rotation.x, -0.24 * t, 10, 1 / 60);
      armL.rotation.z = THREE.MathUtils.damp(armL.rotation.z, -0.30 * t, 10, 1 / 60);
    }
    if (armR) {
      armR.rotation.x = THREE.MathUtils.damp(armR.rotation.x, -0.24 * t, 10, 1 / 60);
      armR.rotation.z = THREE.MathUtils.damp(armR.rotation.z, 0.30 * t, 10, 1 / 60);
    }
    if (legL) legL.rotation.z = THREE.MathUtils.damp(legL.rotation.z, -0.055 * t, 10, 1 / 60);
    if (legR) legR.rotation.z = THREE.MathUtils.damp(legR.rotation.z, 0.055 * t, 10, 1 / 60);

    const fx = this.ensureIronThrusters(npc);
    fx.visible = t > 0.02;
    if (fx.visible) {
      const pulse = 0.94 + Math.sin(now * 15.5) * 0.10;
      fx.children.forEach((jet, index) => {
        const palm = index >= 2;
        const base = palm ? 0.78 : 1.0;
        jet.scale.setScalar(Math.max(0.05, t * base * pulse));
      });
    }
  }

  private resetIronManFlightPose(npc: NPC) {
    const armL = npc.mesh.getObjectByName('arm_left');
    const armR = npc.mesh.getObjectByName('arm_right');
    const legL = npc.mesh.getObjectByName('leg_left');
    const legR = npc.mesh.getObjectByName('leg_right');
    if (armL) { armL.rotation.x = 0; armL.rotation.z = 0; }
    if (armR) { armR.rotation.x = 0; armR.rotation.z = 0; }
    if (legL) legL.rotation.z = 0;
    if (legR) legR.rotation.z = 0;
    const fx = this.ensureIronThrusters(npc);
    fx.visible = false;
  }

  private updateIronManMobility(npc: NPC, dt: number, now: number, playerPos: THREE.Vector3): boolean {
    if (npc.id !== 'cameo_iron_man') return false;

    const radius = 0.50;
    const height = 1.92;
    const state = String(npc.mesh.userData.ironFlightState ?? 'grounded');
    const threatened = now < Number(npc.mesh.userData.powerThreatUntil ?? 0);

    // Casual Iron Man flight is deliberately LOW. His feet hover roughly 1.4-1.7m
    // above local ground, putting the suit only modestly above surrounding people.
    const casualFeetHeight = 1.55;

    if (state === 'flight') {
      this.updateIronManFlightPose(npc, now, 1);
      const center = (npc.mesh.userData.ironFlightCenter as THREE.Vector3 | undefined) ?? npc.mesh.position.clone();
      const orbitRadius = Number(npc.mesh.userData.ironFlightRadius ?? 5.8);
      let phase = Number(npc.mesh.userData.ironFlightPhase ?? 0);
      phase += dt * 0.62;
      npc.mesh.userData.ironFlightPhase = phase;

      const targetX = center.x + Math.cos(phase) * orbitRadius;
      const targetZ = center.z + Math.sin(phase) * orbitRadius;
      const terrainY = this.groundHeight(targetX, targetZ, npc.mesh.position.y, 120, 0.12);
      const bob = Math.sin(now * 2.6 + phase) * 0.10;
      const target = new THREE.Vector3(targetX, terrainY + casualFeetHeight + bob, targetZ);
      const desired = target.sub(npc.mesh.position);
      const maxTravel = Math.max(0.08, 3.8 * dt);
      if (desired.length() > maxTravel) desired.setLength(maxTravel);

      const before = npc.mesh.position.clone();
      const result = this.moveFlyingNPC(
        npc,
        desired,
        radius,
        height,
        terrainY + casualFeetHeight + 1.25,
        true
      );
      const actual = npc.mesh.position.clone().sub(before).setY(0);
      if (actual.lengthSq() > 0.0001) npc.mesh.rotation.y = Math.atan2(actual.x, actual.z);
      // A subtle forward lean sells propulsion without turning him horizontal.
      npc.mesh.rotation.x = THREE.MathUtils.damp(npc.mesh.rotation.x, -0.10, 7, dt);

      if (result.blocked && !result.moved) {
        // Pick another side of the local orbit instead of repeatedly pushing into a wall.
        npc.mesh.userData.ironFlightPhase = phase + Math.PI * 0.55;
      }

      let landAt = Number(npc.mesh.userData.ironLandAt ?? now + 5);
      if (threatened) landAt = Math.max(landAt, now + 1.2);
      if (now >= landAt) {
        const landing = this.findSafeFlightLanding(npc, npc.mesh.position, radius, height, 5.5);
        if (landing) {
          npc.mesh.userData.ironFlightState = 'landing';
          npc.mesh.userData.ironLandingTarget = landing;
          npc.mesh.userData.ironTransitionStartY = npc.mesh.position.y;
          playSoundEffect('powerRepulsor', npc.mesh.position);
        } else {
          // No clear landing yet. Keep flying briefly and try again rather than clipping down.
          npc.mesh.userData.ironLandAt = now + 1.5;
        }
      }
      return true;
    }

    if (state === 'takeoff') {
      const ground = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
      const targetY = ground + casualFeetHeight;
      const desired = new THREE.Vector3(0, Math.min(Math.max(targetY - npc.mesh.position.y, 0), 3.3 * dt), 0);
      const result = this.moveFlyingNPC(npc, desired, radius, height, ground + casualFeetHeight + 0.35, true);
      const progress = THREE.MathUtils.clamp((npc.mesh.position.y - ground) / casualFeetHeight, 0, 1);
      this.updateIronManFlightPose(npc, now, progress);
      npc.mesh.rotation.x = THREE.MathUtils.damp(npc.mesh.rotation.x, -0.06 * progress, 8, dt);

      if ((result.blocked && !result.moved) || npc.mesh.position.y >= targetY - 0.06) {
        if (result.blocked && !result.moved) {
          npc.mesh.userData.ironFlightState = 'grounded';
          npc.mesh.userData.ironNextTakeoffAt = now + 10 + Math.random() * 12;
          this.resetIronManFlightPose(npc);
          npc.mesh.rotation.x = 0;
        } else {
          npc.mesh.userData.ironFlightState = 'flight';
          npc.mesh.userData.ironFlightCenter = npc.mesh.position.clone();
          npc.mesh.userData.ironFlightRadius = 4.8 + Math.random() * 2.4;
          npc.mesh.userData.ironFlightPhase = Math.random() * Math.PI * 2;
          npc.mesh.userData.ironLandAt = now + 5.0 + Math.random() * 3.5;
        }
      }
      return true;
    }

    if (state === 'landing') {
      const landing = npc.mesh.userData.ironLandingTarget as THREE.Vector3 | undefined;
      if (!landing || !this.canCharacterOccupy(npc, landing, radius, height, false, true)) {
        npc.mesh.userData.ironFlightState = 'flight';
        npc.mesh.userData.ironLandAt = now + 1.6;
        delete npc.mesh.userData.ironLandingTarget;
        return true;
      }

      const toLanding = landing.clone().sub(npc.mesh.position);
      const horizontal = new THREE.Vector3(toLanding.x, 0, toLanding.z);
      if (horizontal.length() > 0.04) horizontal.setLength(Math.min(horizontal.length(), 2.6 * dt));
      horizontal.y = THREE.MathUtils.clamp(toLanding.y, -3.0 * dt, 1.0 * dt);
      const before = npc.mesh.position.clone();
      const result = this.moveFlyingNPC(npc, horizontal, radius, height, before.y + 0.08, true);
      const startY = Number(npc.mesh.userData.ironTransitionStartY ?? before.y);
      const progress = THREE.MathUtils.clamp(1 - Math.max(0, npc.mesh.position.y - landing.y) / Math.max(0.15, startY - landing.y), 0, 1);
      this.updateIronManFlightPose(npc, now, 1 - progress * 0.72);
      npc.mesh.rotation.x = THREE.MathUtils.damp(npc.mesh.rotation.x, -0.08 * (1 - progress), 8, dt);

      if (result.blocked && !result.moved) {
        npc.mesh.userData.ironFlightState = 'flight';
        npc.mesh.userData.ironLandAt = now + 1.4;
        delete npc.mesh.userData.ironLandingTarget;
        return true;
      }

      if (npc.mesh.position.distanceToSquared(landing) < 0.08) {
        npc.mesh.position.copy(landing);
        npc.mesh.userData.ironFlightState = 'grounded';
        npc.mesh.userData.ironNextTakeoffAt = now + 18 + Math.random() * 24;
        delete npc.mesh.userData.ironLandingTarget;
        delete npc.mesh.userData.ironFlightCenter;
        this.resetIronManFlightPose(npc);
        npc.mesh.rotation.x = 0;
        npc.state = 'idle';
      }
      return true;
    }

    // Grounded is the DEFAULT state. Let the standard pedestrian system handle his
    // walking/wandering and only trigger occasional short flights.
    this.resetIronManFlightPose(npc);
    npc.mesh.rotation.x = THREE.MathUtils.damp(npc.mesh.rotation.x, 0, 10, dt);
    const nextTakeoff = Number(npc.mesh.userData.ironNextTakeoffAt ?? (now + 15));
    if (now >= nextTakeoff && npc.state !== 'panicking') {
      const ground = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
      const takeoffTarget = new THREE.Vector3(npc.mesh.position.x, ground + casualFeetHeight, npc.mesh.position.z);
      if (this.canTraverseCharacterPath(npc, npc.mesh.position, takeoffTarget, radius, height, true, true)) {
        npc.mesh.userData.ironFlightState = 'takeoff';
        npc.mesh.userData.ironFlightCenter = npc.mesh.position.clone();
        playSoundEffect('powerRepulsor', npc.mesh.position);
        return true;
      }
      // Roof/awning/nearby body blocking the takeoff: just keep walking and retry later.
      npc.mesh.userData.ironNextTakeoffAt = now + 7 + Math.random() * 9;
    }
    return false;
  }

  private updatePowerPropAnimation(npc: NPC, now: number) {
    const until = Number(npc.mesh.userData.powerAnimationUntil ?? 0);
    const prop = npc.mesh.getObjectByName('signature_prop');
    if (!prop) return;
    if (until > now) {
      const remaining = until - now;
      const base = Number(npc.mesh.userData.powerAnimationBaseZ ?? 0);
      prop.rotation.z = base + Math.sin((0.55 - Math.min(0.55, remaining)) * 18) * 0.85;
      prop.rotation.x = -0.35 + Math.sin(now * 21) * 0.25;
    } else if (npc.mesh.userData.powerAnimationBaseZ !== undefined) {
      prop.rotation.z = Number(npc.mesh.userData.powerAnimationBaseZ);
      prop.rotation.x = 0;
      delete npc.mesh.userData.powerAnimationBaseZ;
    }
  }

  private updatePoweredCharacter(npc: NPC, dt: number, now: number, playerPos: THREE.Vector3): boolean {
    const profile = this.getPowerProfile(npc);
    if (!profile) return false;

    npc.mesh.userData.powerCooldown = Math.max(0, Number(npc.mesh.userData.powerCooldown ?? 0) - dt);
    this.updatePowerPropAnimation(npc, now);

    if (this.updateSpiderSwing(npc, dt)) return true;
    if (npc.state === 'kicked' || npc.state === 'knocked_out' || npc.state === 'recovering' || npc.state === 'defeated') {
      // If Iron Man is knocked out of the air, let the shared ragdoll/recovery
      // system bring him down naturally. Once recovered he resumes WALKING and
      // waits for a later casual-flight window rather than snapping back airborne.
      if (profile.kind === 'iron_man') {
        npc.mesh.userData.ironFlightState = 'grounded';
        npc.mesh.userData.ironNextTakeoffAt = now + 16 + Math.random() * 18;
        delete npc.mesh.userData.ironLandingTarget;
        delete npc.mesh.userData.ironFlightCenter;
        this.resetIronManFlightPose(npc);
      }
      return false;
    }
    if (this.updateIronManMobility(npc, dt, now, playerPos)) return true;

    const directThreat = !!npc.mesh.userData.powerRevengePending && now < Number(npc.mesh.userData.powerThreatUntil ?? 0);
    let shouldProtect = false;
    if (profile.protective && now < this.lastPlayerAggressionUntil) {
      const nearVictim = npc.mesh.position.distanceToSquared(this.lastPlayerAggressionTarget) < 13 * 13;
      const seenSerial = Number(npc.mesh.userData.powerAggressionSerial ?? -1);
      // Protective heroes may answer a NEW nearby assault once, but the same
      // aggression event is never re-armed every frame.
      if (nearVictim && seenSerial !== this.playerAggressionSerial) {
        npc.mesh.userData.powerThreatUntil = now + 4.0;
        npc.mesh.userData.powerThreatSource = this.lastPlayerAggressionPosition.clone();
        npc.mesh.userData.powerRevengePending = true;
        npc.mesh.userData.powerAggressionSerial = this.playerAggressionSerial;
      }
      shouldProtect = nearVictim && !!npc.mesh.userData.powerRevengePending;
    }

    const showcase = !!npc.mesh.userData.powerShowcaseRequested;
    if (showcase && Number(npc.mesh.userData.powerCooldown ?? 0) <= 0) {
      npc.mesh.userData.powerShowcaseRequested = false;
      if (profile.kind === 'spider') {
        if (this.startSpiderSwing(npc, now)) return true;
      } else if (profile.kind === 'force') {
        npc.mesh.userData.powerAnimationUntil = now + 0.65;
        const prop = npc.mesh.getObjectByName('signature_prop');
        if (prop) npc.mesh.userData.powerAnimationBaseZ = prop.rotation.z;
        this.spawnPowerRing(npc.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), profile.color, 0.9);
        playSoundEffect('powerBlade', npc.mesh.position);
      } else if (profile.kind === 'iron_man') {
        this.spawnPowerRing(npc.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), profile.color, 0.8);
        playSoundEffect('powerRepulsor', npc.mesh.position);
      } else if (profile.kind === 'ice') {
        this.spawnPowerRing(npc.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), profile.color, 0.8);
        playSoundEffect('powerIce', npc.mesh.position);
      } else if (profile.kind === 'sonic_dash') {
        this.spawnPowerRing(npc.mesh.position.clone().add(new THREE.Vector3(0, 0.45, 0)), profile.color, 0.9);
        playSoundEffect('powerDash', npc.mesh.position);
      } else {
        this.spawnPowerRing(npc.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), profile.color, 0.85);
        playSoundEffect(profile.kind === 'fire_breath' ? 'fire' : 'powerEnergy', npc.mesh.position);
      }
      npc.mesh.userData.powerCooldown = Math.max(3.5, profile.cooldown * 0.72);
      return false;
    }

    // Spider characters occasionally swing when the player is nearby, but this is
    // intentionally rare and cooldown-gated so the city never becomes a web storm.
    const playerDistance = Math.hypot(npc.mesh.position.x - playerPos.x, npc.mesh.position.z - playerPos.z);
    if (profile.kind === 'spider' && Number(npc.mesh.userData.powerCooldown ?? 0) <= 0 && playerDistance > 8 && playerDistance < 42 && Math.random() < dt * 0.035) {
      if (this.startSpiderSwing(npc, now)) return true;
    }

    if (Number(npc.mesh.userData.powerCooldown ?? 0) > 0) return false;

    const hostile = this.findNearbyHostileNPC(npc, Math.min(profile.range, 15));
    if (hostile) {
      this.applyPowerHitToNPC(npc, hostile, profile, now);
      npc.mesh.userData.powerCooldown = profile.cooldown + Math.random() * 1.8;
      return false;
    }

    if ((directThreat || shouldProtect) && playerDistance <= profile.range) {
      this.performPowerAttackOnPlayer(npc, profile, playerPos, now);
      npc.mesh.userData.powerCooldown = profile.cooldown + Math.random() * 2.0;
      // Consume the revenge token immediately. A powered character gets ONE
      // appropriate response per aggression event, then returns to ordinary AI.
      npc.mesh.userData.powerRevengePending = false;
      npc.mesh.userData.powerThreatUntil = 0;
    } else if (!!npc.mesh.userData.powerRevengePending && now >= Number(npc.mesh.userData.powerThreatUntil ?? 0)) {
      // Do not preserve stale hostility forever when the player simply walks away.
      npc.mesh.userData.powerRevengePending = false;
      npc.mesh.userData.powerThreatUntil = 0;
    }
    return false;
  }


  /**
   * Collision-safe boss-lite movement for Ash's retaliation Charizard. Grounded
   * pursuit uses the same solid-world rules as pedestrians. Flight is true swept
   * 3D movement: walls, doors, tall props, roofs, upper floors and ceilings remain
   * solid; a blocked Charizard sidesteps or climbs only when there is verified room.
   */
  private updateAshDefenderCharizard(npc: NPC, dt: number, now: number, playerPos: THREE.Vector3): boolean {
    if (npc.id !== 'ash_defender_charizard' || !npc.mesh.userData.ashDefenderActive) return false;
    if (npc.state === 'kicked' || npc.state === 'knocked_out' || npc.state === 'recovering' || npc.state === 'defeated') return false;

    const profile = POWER_PROFILES.ash_defender_charizard;
    const bodyRadius = 0.72;
    const bodyHeight = 2.85;
    const localGround = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
    const toPlayer = playerPos.clone().sub(npc.mesh.position).setY(0);
    const distance = Math.max(0.001, toPlayer.length());
    const forward = toPlayer.normalize();

    let phase = String(npc.mesh.userData.ashDefenderPhase ?? 'ground');
    let phaseTimer = Math.max(0, Number(npc.mesh.userData.ashDefenderPhaseTimer ?? 0) - dt);
    npc.mesh.userData.ashDefenderPhaseTimer = phaseTimer;
    npc.mesh.userData.powerThreatUntil = now + 2.0;
    npc.mesh.userData.powerCooldown = Math.max(0, Number(npc.mesh.userData.powerCooldown ?? 0) - dt);

    const wingL = npc.mesh.getObjectByName('wing_left');
    const wingR = npc.mesh.getObjectByName('wing_right');
    const legL = npc.mesh.getObjectByName('leg_left');
    const legR = npc.mesh.getObjectByName('leg_right');

    if (phase === 'ground') {
      const grounded = new THREE.Vector3(npc.mesh.position.x, localGround, npc.mesh.position.z);
      if (this.canCharacterOccupy(npc, grounded, bodyRadius, bodyHeight, false, true)) {
        npc.mesh.position.y = THREE.MathUtils.damp(npc.mesh.position.y, localGround, 9, dt);
      } else {
        const safe = this.findSafeGroundPosition(npc, grounded, bodyRadius, bodyHeight, 3.2);
        if (safe) npc.mesh.position.copy(safe);
      }

      const walkCycle = Math.sin(now * 8.5) * (distance > 4.4 ? 0.42 : 0.08);
      if (legL) legL.rotation.x = walkCycle;
      if (legR) legR.rotation.x = -walkCycle;
      if (wingL) wingL.rotation.y = THREE.MathUtils.damp(wingL.rotation.y, 0, 8, dt);
      if (wingR) wingR.rotation.y = THREE.MathUtils.damp(wingR.rotation.y, 0, 8, dt);

      if (distance > 4.4) {
        const travel = Math.min(distance - 3.9, 3.2 * dt);
        const direct = forward.clone().multiplyScalar(travel);
        const next = npc.mesh.position.clone().add(direct);
        next.y = this.groundHeight(next.x, next.z, npc.mesh.position.y, 3.5, npc.mesh.position.y);
        let moved = false;
        if (this.canCharacterOccupy(npc, next, bodyRadius, bodyHeight, false, true)) {
          npc.mesh.position.copy(next);
          moved = true;
        } else {
          // Ground Charizard turns/slides around people and architecture instead of
          // phasing through them or repeatedly pushing into the same wall.
          const side = new THREE.Vector3(-forward.z, 0, forward.x);
          let sign = Number(npc.mesh.userData.flightAvoidSide ?? 1) >= 0 ? 1 : -1;
          for (const candidateSign of [sign, -sign]) {
            const candidate = npc.mesh.position.clone().addScaledVector(side, candidateSign * Math.max(0.18, travel));
            candidate.y = this.groundHeight(candidate.x, candidate.z, npc.mesh.position.y, 3.5, npc.mesh.position.y);
            if (!this.canCharacterOccupy(npc, candidate, bodyRadius, bodyHeight, false, true)) continue;
            npc.mesh.position.copy(candidate);
            npc.mesh.userData.flightAvoidSide = candidateSign;
            moved = true;
            break;
          }
        }
        const movement = npc.mesh.position.clone().sub(grounded).setY(0);
        if (moved && movement.lengthSq() > 0.0001) npc.mesh.rotation.y = Math.atan2(movement.x, movement.z);
        else npc.mesh.rotation.y = Math.atan2(forward.x, forward.z);
      } else {
        npc.mesh.rotation.y = Math.atan2(forward.x, forward.z);
      }

      if (phaseTimer <= 0) {
        // Never begin a take-off if the wings/body would immediately intersect an
        // overhead floor, roof, door header or tall prop.
        const takeoffGround = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
        const takeoffTarget = npc.mesh.position.clone();
        takeoffTarget.y = takeoffGround + 3.0;
        if (this.canTraverseCharacterPath(npc, npc.mesh.position, takeoffTarget, bodyRadius, bodyHeight, true, false)) {
          phase = 'takeoff';
          npc.mesh.userData.ashDefenderPhase = phase;
          npc.mesh.userData.ashDefenderPhaseTimer = 0.85;
          playSoundEffect('powerEnergy', npc.mesh.position);
        } else {
          npc.mesh.userData.ashDefenderPhaseTimer = 0.7;
        }
      }
    } else if (phase === 'takeoff') {
      const takeoffGround = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
      const targetY = takeoffGround + 3.0;
      const wantedY = THREE.MathUtils.damp(npc.mesh.position.y, targetY, 5.5, dt);
      const movement = new THREE.Vector3(0, wantedY - npc.mesh.position.y, 0);
      const result = this.moveFlyingNPC(npc, movement, bodyRadius, bodyHeight, targetY, false);
      const flap = Math.sin(now * 13) * 0.65;
      if (wingL) wingL.rotation.y = flap;
      if (wingR) wingR.rotation.y = -flap;

      if (result.blocked && !result.moved) {
        // Lost vertical clearance (e.g. moving door/prop): abort cleanly to ground.
        npc.mesh.userData.ashDefenderPhase = 'ground';
        npc.mesh.userData.ashDefenderPhaseTimer = 0.9;
      } else if (phaseTimer <= 0 || npc.mesh.position.y >= targetY - 0.18) {
        phase = 'low_flight';
        npc.mesh.userData.ashDefenderPhase = phase;
        npc.mesh.userData.ashDefenderPhaseTimer = 4.5 + Math.random() * 2.0;
      }
    } else if (phase === 'low_flight') {
      const flightGround = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
      const nominalY = flightGround + 2.8 + Math.sin(now * 2.3) * 0.25;
      const maxFeetY = flightGround + 5.2; // enough to clear low props, not buildings
      const side = new THREE.Vector3(forward.z, 0, -forward.x);
      const desired = playerPos.clone()
        .addScaledVector(forward, -5.6)
        .addScaledVector(side, Math.sin(now * 1.4) * 2.4);
      const chase = desired.sub(npc.mesh.position).setY(0);
      if (chase.lengthSq() > 0.08) chase.normalize().multiplyScalar(4.4 * dt);
      chase.y = THREE.MathUtils.damp(npc.mesh.position.y, nominalY, 5.5, dt) - npc.mesh.position.y;

      const before = npc.mesh.position.clone();
      const result = this.moveFlyingNPC(npc, chase, bodyRadius, bodyHeight, maxFeetY, false);
      const actual = npc.mesh.position.clone().sub(before).setY(0);
      if (actual.lengthSq() > 0.0001) npc.mesh.rotation.y = Math.atan2(actual.x, actual.z);
      else npc.mesh.rotation.y = Math.atan2(forward.x, forward.z);

      const flap = Math.sin(now * 12) * 0.72;
      if (wingL) wingL.rotation.y = flap;
      if (wingR) wingR.rotation.y = -flap;

      if (result.blocked) {
        npc.mesh.userData.ashDefenderBlockedTimer = Number(npc.mesh.userData.ashDefenderBlockedTimer ?? 0) + dt;
      } else {
        npc.mesh.userData.ashDefenderBlockedTimer = Math.max(0, Number(npc.mesh.userData.ashDefenderBlockedTimer ?? 0) - dt * 2);
      }

      if (phaseTimer <= 0) {
        const landing = this.findSafeFlightLanding(npc, npc.mesh.position, bodyRadius, bodyHeight, 5.2);
        if (landing) {
          npc.mesh.userData.ashDefenderLandingTarget = landing;
          phase = 'landing';
          npc.mesh.userData.ashDefenderPhase = phase;
          npc.mesh.userData.ashDefenderPhaseTimer = 1.25;
        } else {
          // Stay airborne briefly and look again rather than descending into a roof,
          // wall, prop or another character.
          npc.mesh.userData.ashDefenderPhaseTimer = 1.0;
        }
      }
    } else { // landing
      let landing = npc.mesh.userData.ashDefenderLandingTarget as THREE.Vector3 | undefined;
      if (!landing || !this.canCharacterOccupy(npc, landing, bodyRadius, bodyHeight, false, true)) {
        landing = this.findSafeFlightLanding(npc, npc.mesh.position, bodyRadius, bodyHeight, 5.5) ?? undefined;
        npc.mesh.userData.ashDefenderLandingTarget = landing;
      }
      if (!landing) {
        npc.mesh.userData.ashDefenderPhase = 'low_flight';
        npc.mesh.userData.ashDefenderPhaseTimer = 0.9;
      } else {
        const toLanding = landing.clone().sub(npc.mesh.position);
        const horizontal = new THREE.Vector3(toLanding.x, 0, toLanding.z);
        if (horizontal.length() > 0.08) horizontal.setLength(Math.min(horizontal.length(), 3.5 * dt));
        const targetY = Math.max(landing.y, npc.mesh.position.y - Math.max(0.22, 3.7 * dt));
        horizontal.y = targetY - npc.mesh.position.y;
        const before = npc.mesh.position.clone();
        const result = this.moveFlyingNPC(npc, horizontal, bodyRadius, bodyHeight, Math.max(before.y, landing.y + 0.2), true);
        const actual = npc.mesh.position.clone().sub(before).setY(0);
        if (actual.lengthSq() > 0.0001) npc.mesh.rotation.y = Math.atan2(actual.x, actual.z);

        const flap = Math.sin(now * 9) * 0.35;
        if (wingL) wingL.rotation.y = flap;
        if (wingR) wingR.rotation.y = -flap;

        const reachedGround = npc.mesh.position.distanceToSquared(landing) < 0.16 || npc.mesh.position.y <= landing.y + 0.10;
        if (reachedGround && this.canCharacterOccupy(npc, landing, bodyRadius, bodyHeight, false, true)) {
          npc.mesh.position.copy(landing);
          npc.mesh.userData.ashDefenderPhase = 'ground';
          npc.mesh.userData.ashDefenderPhaseTimer = 3.2 + Math.random() * 1.8;
          delete npc.mesh.userData.ashDefenderLandingTarget;
        } else if (result.blocked && !result.moved && phaseTimer <= 0) {
          npc.mesh.userData.ashDefenderPhase = 'low_flight';
          npc.mesh.userData.ashDefenderPhaseTimer = 0.9;
          delete npc.mesh.userData.ashDefenderLandingTarget;
        }
      }
    }

    if (Number(npc.mesh.userData.powerCooldown ?? 0) <= 0 && distance <= profile.range) {
      this.performPowerAttackOnPlayer(npc, profile, playerPos, now);
      npc.mesh.userData.powerCooldown = 3.2 + Math.random() * 1.4;
    }

    this.syncNPCPosition(npc);
    return true;
  }

  private updateCombatEffects(dt: number) {
    for (let i = this.combatEffects.length - 1; i >= 0; i--) {
      const fx = this.combatEffects[i];
      fx.life -= dt;
      const progress = 1 - fx.life / fx.maxLife;
      if (fx.mode === 'beam') {
        fx.group.scale.set(1 + progress * 0.22, 1, 1 + progress * 0.22);
      } else {
        fx.group.scale.setScalar(0.6 + progress * 2.8);
        fx.group.rotation.z += dt * 7;
      }
      fx.material.opacity = Math.max(0, 1 - progress);
      if (fx.life <= 0) {
        this.scene.remove(fx.group);
        fx.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) obj.geometry.dispose();
        });
        fx.material.dispose();
        this.combatEffects.splice(i, 1);
      }
    }
  }

  private spawnImpactBurst(position: THREE.Vector3, color = 0xffd54f, size = 1) {
    const group = new THREE.Group();
    group.position.copy(position);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42 * size, 0.08 * size, 5, 12), material);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    for (let i = 0; i < 5; i++) {
      const spark = new THREE.Mesh(new THREE.ConeGeometry(0.08 * size, 0.48 * size, 4), material);
      const a = (i / 5) * Math.PI * 2;
      spark.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0);
      spark.rotation.z = a - Math.PI / 2;
      group.add(spark);
    }
    this.scene.add(group);
    this.combatEffects.push({ group, life: 0.28, maxLife: 0.28, material });
  }


  private ensureFireStatusEffect(npc: NPC) {
    let fx = npc.mesh.getObjectByName('npc_fire_status') as THREE.Group | undefined;
    if (fx) return fx;

    fx = new THREE.Group();
    fx.name = 'npc_fire_status';
    fx.renderOrder = 50;

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff5a00,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const hotMat = new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x3b3b3b,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    for (let i = 0; i < 4; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.24 + i * 0.025, 0.95 + i * 0.1, 6), i % 2 ? hotMat : flameMat);
      flame.name = `npc_fire_flame_${i}`;
      const a = (i / 4) * Math.PI * 2;
      flame.position.set(Math.cos(a) * 0.42, 0.65 + (i % 2) * 0.35, Math.sin(a) * 0.42);
      flame.rotation.z = (Math.random() - 0.5) * 0.2;
      fx.add(flame);
    }
    for (let i = 0; i < 2; i++) {
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.22 + i * 0.05, 6, 5), smokeMat);
      smoke.name = `npc_fire_smoke_${i}`;
      smoke.position.set((i ? 0.22 : -0.18), 1.65 + i * 0.32, 0);
      fx.add(smoke);
    }
    npc.mesh.add(fx);
    return fx;
  }

  private removeFireStatusEffect(npc: NPC) {
    const fx = npc.mesh.getObjectByName('npc_fire_status');
    if (!fx) return;
    npc.mesh.remove(fx);
    fx.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    });
  }

  private ensureElectricStatusEffect(npc: NPC) {
    let fx = npc.mesh.getObjectByName('npc_electric_status') as THREE.Group | undefined;
    if (fx) return fx;
    fx = new THREE.Group();
    fx.name = 'npc_electric_status';
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff34d,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 + i * 0.18, 0.035, 5, 12), mat);
      ring.name = `npc_electric_ring_${i}`;
      ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      ring.position.y = 0.75 + i * 0.38;
      fx.add(ring);
    }
    npc.mesh.add(fx);
    return fx;
  }

  private removeElectricStatusEffect(npc: NPC) {
    const fx = npc.mesh.getObjectByName('npc_electric_status');
    if (!fx) return;
    npc.mesh.remove(fx);
    fx.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    });
  }

  private updateElementalStatus(npc: NPC, dt: number, now: number) {
    const burnTimer = Math.max(0, (npc.mesh.userData.burnTimer ?? 0) - dt);
    npc.mesh.userData.burnTimer = burnTimer;
    if (burnTimer > 0) {
      const fx = this.ensureFireStatusEffect(npc);
      fx.visible = true;
      fx.rotation.y += dt * 1.8;
      let flameIndex = 0;
      fx.children.forEach((child) => {
        if (child.name.startsWith('npc_fire_flame_')) {
          const pulse = 0.82 + Math.sin(now * 15 + flameIndex * 1.7) * 0.16;
          child.scale.set(pulse, 0.85 + Math.sin(now * 12 + flameIndex) * 0.22, pulse);
          child.position.y = 0.7 + (flameIndex % 2) * 0.35 + Math.sin(now * 9 + flameIndex) * 0.08;
          flameIndex++;
        } else if (child.name.startsWith('npc_fire_smoke_')) {
          child.position.y += dt * 0.28;
          if (child.position.y > 2.35) child.position.y = 1.55;
        }
      });

      npc.mesh.userData.burnTickTimer = (npc.mesh.userData.burnTickTimer ?? 0) - dt;
      if (npc.mesh.userData.burnTickTimer <= 0) {
        npc.mesh.userData.burnTickTimer = 0.7;
        npc.combatHp = Math.max(0, (npc.combatHp ?? npc.combatMaxHp ?? 100) - 5);
        if ((npc.combatHp ?? 1) <= 0) {
          npc.mesh.userData.pendingKnockout = true;
          if (npc.state !== 'kicked' && npc.state !== 'knocked_out') {
            const collapseDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
            this.launchNPC(npc, collapseDir, 3.5, 3.8);
          }
        }
      }

      if (npc.state !== 'kicked' && npc.state !== 'knocked_out') {
        npc.state = 'panicking';
        npc.mesh.userData.stateTimer = Math.max(npc.mesh.userData.stateTimer ?? 0, 1.1);
      }
    } else if (npc.mesh.getObjectByName('npc_fire_status')) {
      this.removeFireStatusEffect(npc);
    }

    const electricTimer = Math.max(0, (npc.mesh.userData.electricTimer ?? 0) - dt);
    npc.mesh.userData.electricTimer = electricTimer;
    if (electricTimer > 0) {
      const fx = this.ensureElectricStatusEffect(npc);
      fx.visible = true;
      fx.rotation.x += dt * 8;
      fx.rotation.y -= dt * 11;
      const pulse = 0.88 + Math.sin(now * 35) * 0.14;
      fx.scale.setScalar(pulse);
    } else if (npc.mesh.getObjectByName('npc_electric_status')) {
      this.removeElectricStatusEffect(npc);
    }
  }


  /** Cheap personality animation for the unique Brainrot cameos. The named child
   * parts keep this independent from navigation/physics, so they can still be
   * kicked, pushed and grounded by the normal NPC systems. */
  private updateBrainrotAnimation(npc: NPC, dt: number, now: number) {
    const kind = String(npc.mesh.userData.brainrotKind ?? '');
    if (!kind || npc.state === 'kicked' || npc.state === 'knocked_out' || npc.state === 'recovering' || npc.state === 'defeated') return;

    const visual = npc.mesh.getObjectByName('brainrot_visual');
    if (visual) {
      visual.rotation.z = THREE.MathUtils.damp(visual.rotation.z, Math.sin(now * 2.2 + npc.id.length) * 0.035, 5, dt);
    }

    if (kind === 'tung_tung_sahur') {
      const bat = npc.mesh.getObjectByName('brainrot_bat');
      if (bat) bat.rotation.z = -0.28 + Math.max(0, Math.sin(now * 2.4)) * 0.68;
      if (visual) visual.position.y = Math.max(0, Math.sin(now * 4.8)) * 0.035;
    } else if (kind === 'tralalero_tralala') {
      const tail = npc.mesh.getObjectByName('brainrot_tail');
      if (tail) tail.rotation.y = Math.sin(now * 5.8) * 0.55;
      const third = npc.mesh.getObjectByName('leg_third');
      if (third) third.rotation.x = Math.sin(now * 7.6 + 1.4) * 0.35;
      if (visual) visual.position.y = 0.02 + Math.abs(Math.sin(now * 7.6)) * 0.035;
    } else if (kind === 'bombardiro_crocodilo') {
      const l = npc.mesh.getObjectByName('brainrot_propeller_left');
      const r = npc.mesh.getObjectByName('brainrot_propeller_right');
      if (l) l.rotation.z += dt * 22;
      if (r) r.rotation.z -= dt * 22;
      if (visual) visual.rotation.z = Math.sin(now * 0.9) * 0.10;
    } else if (kind === 'ballerina_cappuccina') {
      const spin = npc.mesh.getObjectByName('brainrot_pirouette');
      if (spin) {
        spin.rotation.y += dt * 1.55;
        spin.position.y = Math.abs(Math.sin(now * 2.3)) * 0.035;
      }
      npc.mesh.getObjectByName('brainrot_steam')?.rotateY(dt * 0.8);
    } else if (kind === 'cappuccino_assassino') {
      const left = npc.mesh.getObjectByName('brainrot_sword_left');
      const right = npc.mesh.getObjectByName('brainrot_sword_right');
      const slash = Math.max(0, Math.sin(now * 2.1));
      if (left) left.rotation.z = -0.42 - slash * 0.35;
      if (right) right.rotation.z = 0.42 + slash * 0.35;
    } else if (kind === 'lirili_larila') {
      const trunk = npc.mesh.getObjectByName('brainrot_trunk');
      if (trunk) trunk.rotation.z = Math.sin(now * 2.6) * 0.22;
      if (visual) visual.position.y = Math.abs(Math.sin(now * 3.0)) * 0.025;
    }
  }

  /**
   * Build the pedestrian crossing graph from the CURRENT authored zebra crossings.
   * World builders tag one marker per crossing, so NPC navigation never relies on an
   * outdated coordinate list and crossing orientation always matches the paint.
   */
  private collectPedestrianCrossings() {
    this.pedestrianCrossings = [];
    this.scene.updateMatrixWorld(true);
    let index = 0;
    this.scene.traverse((obj) => {
      if (obj.userData.pedestrianCrossingMarker !== true) return;
      const roadAxis = obj.userData.roadAxis === 'z' ? 'z' : 'x';
      const roadWidth = Math.max(6, Number(obj.userData.roadWidth ?? 14));
      const center = obj.getWorldPosition(new THREE.Vector3());
      const offset = roadWidth * 0.5 + 2.35;
      const endpointA = center.clone();
      const endpointB = center.clone();
      if (roadAxis === 'x') {
        endpointA.z -= offset;
        endpointB.z += offset;
      } else {
        endpointA.x -= offset;
        endpointB.x += offset;
      }
      endpointA.y = this.groundHeight(endpointA.x, endpointA.z, center.y);
      endpointB.y = this.groundHeight(endpointB.x, endpointB.z, center.y);
      this.pedestrianCrossings.push({
        id: obj.name || `ped_crossing_${index++}`,
        center,
        roadAxis,
        roadWidth,
        endpointA,
        endpointB,
      });
    });
  }

  private isOrdinaryPedestrian(npc: NPC): boolean {
    const mode = npc.movementMode ?? npc.mesh.userData.movementMode ?? 'ground';
    return mode === 'ground' && !npc.mesh.userData.stationary && !npc.mesh.userData.specialInteractionActive;
  }

  private clearPedestrianRoute(npc: NPC) {
    npc.mesh.userData.pedestrianCrossing = false;
    delete npc.mesh.userData.pedestrianCrossingTarget;
    delete npc.mesh.userData.pedestrianCrossingId;
    delete npc.mesh.userData.pedestrianRouteKind;
    delete npc.mesh.userData.pedestrianRoutePhase;
    delete npc.mesh.userData.pedestrianRouteApproach;
    delete npc.mesh.userData.pedestrianRouteExit;
    delete npc.mesh.userData.pedestrianRouteWait;
    delete npc.mesh.userData.pedestrianRoadEscapeTarget;
    delete npc.mesh.userData.crossingAvoidSide;
  }

  private getCrossingById(id: string | undefined): PedestrianCrossingNode | null {
    if (!id) return null;
    return this.pedestrianCrossings.find((crossing) => crossing.id === id) ?? null;
  }

  private isInsideCrossingCorridor(crossing: PedestrianCrossingNode, position: THREE.Vector3): boolean {
    const halfStripeBand = 4.35;
    const halfRoadSpan = crossing.roadWidth * 0.5 + 3.0;
    if (crossing.roadAxis === 'x') {
      return Math.abs(position.x - crossing.center.x) <= halfStripeBand && Math.abs(position.z - crossing.center.z) <= halfRoadSpan;
    }
    return Math.abs(position.z - crossing.center.z) <= halfStripeBand && Math.abs(position.x - crossing.center.x) <= halfRoadSpan;
  }

  /** The transit surface is the actual painted/road portion of a zebra crossing.
   * Crossing endpoints intentionally sit a couple of metres beyond the kerb, so do
   * not treat those safe footpath targets as still being inside the crossing. */
  private isOnCrossingTransitSurface(crossing: PedestrianCrossingNode, position: THREE.Vector3): boolean {
    if (Math.abs(position.y - crossing.center.y) > 2.2) return false;
    const halfStripeBand = 4.35;
    const halfRoadSpan = crossing.roadWidth * 0.5 + 0.8;
    if (crossing.roadAxis === 'x') {
      return Math.abs(position.x - crossing.center.x) <= halfStripeBand && Math.abs(position.z - crossing.center.z) <= halfRoadSpan;
    }
    return Math.abs(position.z - crossing.center.z) <= halfStripeBand && Math.abs(position.x - crossing.center.x) <= halfRoadSpan;
  }

  private getCrossingAtPosition(position: THREE.Vector3): PedestrianCrossingNode | null {
    let best: PedestrianCrossingNode | null = null;
    let bestDistance = Infinity;
    for (const crossing of this.pedestrianCrossings) {
      if (!this.isOnCrossingTransitSurface(crossing, position)) continue;
      const distance = crossing.center.distanceToSquared(position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = crossing;
      }
    }
    return best;
  }

  /** Crossing/road transit must never be frozen by ordinary wander LOD. This is
   * deliberately broader than pedestrianCrossing=true so an NPC whose route state
   * was cleared while physically on asphalt still gets enough simulation to escape. */
  private isPedestrianTransitCritical(npc: NPC): boolean {
    const mode = npc.movementMode ?? npc.mesh.userData.movementMode ?? 'ground';
    if (mode !== 'ground' || npc.mesh.userData.stationary) return false;
    if (npc.state === 'kicked' || npc.state === 'knocked_out' || npc.state === 'recovering' ||
        npc.state === 'grabbed' || npc.state === 'defeated') return false;
    const kind = String(npc.mesh.userData.pedestrianRouteKind ?? '');
    const phase = String(npc.mesh.userData.pedestrianRoutePhase ?? '');
    if (kind === 'crossing' && phase === 'cross') return true;
    if (kind === 'road_escape') return true;
    if (this.getCrossingAtPosition(npc.mesh.position)) return true;
    return this.isRoadSurface(npc.mesh.position.x, npc.mesh.position.z, 0.08);
  }

  /** If an ordinary pedestrian is already on a painted crossing but lost its route
   * (spawn, shove, recovery, old save, or another AI state), immediately recreate a
   * committed opposite-kerb route. Heading wins when available so we never make a
   * walker turn around halfway across the road. */
  private ensureCrossingTransitRoute(npc: NPC): boolean {
    if (!this.isOrdinaryPedestrian(npc)) return false;

    const existingKind = String(npc.mesh.userData.pedestrianRouteKind ?? '');
    const existingPhase = String(npc.mesh.userData.pedestrianRoutePhase ?? '');
    if (existingKind === 'crossing' && existingPhase === 'cross') {
      const existingCrossing = this.getCrossingById(String(npc.mesh.userData.pedestrianCrossingId ?? ''));
      const existingExit = npc.mesh.userData.pedestrianRouteExit as THREE.Vector3 | undefined;
      if (existingCrossing && existingExit) {
        npc.state = 'walking';
        npc.mesh.userData.pedestrianCrossing = true;
        npc.mesh.userData.pedestrianCrossingTarget = existingExit;
        npc.walkTimer = Math.max(npc.walkTimer ?? 0, 1.5);
        return true;
      }
    }

    const crossing = this.getCrossingAtPosition(npc.mesh.position);
    if (!crossing) return false;

    const p = npc.mesh.position;
    const deltaA = crossing.endpointA.clone().sub(p).setY(0);
    const deltaB = crossing.endpointB.clone().sub(p).setY(0);
    let exit: THREE.Vector3;
    let approach: THREE.Vector3;
    const heading = npc.walkDirection?.clone().setY(0) ?? new THREE.Vector3();
    if (heading.lengthSq() > 0.04) {
      heading.normalize();
      const scoreA = deltaA.lengthSq() > 0.001 ? deltaA.clone().normalize().dot(heading) : -1;
      const scoreB = deltaB.lengthSq() > 0.001 ? deltaB.clone().normalize().dot(heading) : -1;
      if (scoreB >= scoreA) {
        exit = crossing.endpointB.clone();
        approach = crossing.endpointA.clone();
      } else {
        exit = crossing.endpointA.clone();
        approach = crossing.endpointB.clone();
      }
    } else if (crossing.roadAxis === 'x') {
      const towardPositive = p.z <= crossing.center.z;
      exit = (towardPositive ? crossing.endpointB : crossing.endpointA).clone();
      approach = (towardPositive ? crossing.endpointA : crossing.endpointB).clone();
    } else {
      const towardPositive = p.x <= crossing.center.x;
      exit = (towardPositive ? crossing.endpointB : crossing.endpointA).clone();
      approach = (towardPositive ? crossing.endpointA : crossing.endpointB).clone();
    }

    if (this.isRoadSurface(exit.x, exit.z, 0.10) || !this.canOccupy(exit, 0.46, 1.72)) return false;
    npc.mesh.userData.pedestrianRouteKind = 'crossing';
    npc.mesh.userData.pedestrianRoutePhase = 'cross';
    npc.mesh.userData.pedestrianCrossingId = crossing.id;
    npc.mesh.userData.pedestrianRouteApproach = approach;
    npc.mesh.userData.pedestrianRouteExit = exit;
    npc.mesh.userData.pedestrianCrossing = true;
    npc.mesh.userData.pedestrianCrossingTarget = exit;
    if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
    npc.walkDirection.copy(exit).sub(p).setY(0).normalize();
    npc.state = 'walking';
    npc.walkTimer = Math.max(npc.walkTimer ?? 0, 2.0);
    npc.mesh.userData.crowdYieldTimer = 0;
    return true;
  }

  private pointWithinWanderBounds(point: THREE.Vector3, bounds?: SpawnConfig['bounds'], padding = 0.4): boolean {
    if (!bounds) return true;
    return point.x >= bounds.minX + padding && point.x <= bounds.maxX - padding &&
      point.z >= bounds.minZ + padding && point.z <= bounds.maxZ - padding;
  }

  /** Find the closest legal pavement/verge point when a ragdoll or old spawn leaves
   * an NPC physically standing in traffic. This is recovery, not intentional road
   * crossing: the target is always the nearest side of the road, never the far side. */
  private findNearestRoadExit(npc: NPC): THREE.Vector3 | null {
    const origin = npc.mesh.position;
    const bounds = npc.mesh.userData.wanderBounds as SpawnConfig['bounds'] | undefined;
    let best: THREE.Vector3 | null = null;
    let bestDistance = Infinity;
    for (const radius of [0.9, 1.4, 2.0, 2.8, 3.8, 5.2, 6.8]) {
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const candidate = new THREE.Vector3(
          origin.x + Math.cos(angle) * radius,
          origin.y,
          origin.z + Math.sin(angle) * radius
        );
        if (!this.pointWithinWanderBounds(candidate, bounds, 0.25)) continue;
        if (this.isRoadSurface(candidate.x, candidate.z, 0.18)) continue;
        candidate.y = this.groundHeight(candidate.x, candidate.z, origin.y);
        if (!this.canOccupy(candidate, 0.46, 1.72)) continue;
        const distance = candidate.distanceToSquared(origin);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
      if (best) break;
    }
    return best;
  }

  private ensureRoadEscapeRoute(npc: NPC): boolean {
    if (!this.isOrdinaryPedestrian(npc)) return false;
    if (!this.isRoadSurface(npc.mesh.position.x, npc.mesh.position.z, 0.10)) return false;
    if (npc.mesh.userData.pedestrianRouteKind === 'crossing' && npc.mesh.userData.pedestrianRoutePhase === 'cross') return false;
    const existing = npc.mesh.userData.pedestrianRoadEscapeTarget as THREE.Vector3 | undefined;
    const target = existing ?? this.findNearestRoadExit(npc);
    if (!target) return false;
    npc.mesh.userData.pedestrianRouteKind = 'road_escape';
    npc.mesh.userData.pedestrianRoadEscapeTarget = target.clone();
    npc.mesh.userData.pedestrianCrossing = false;
    if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
    npc.walkDirection.copy(target).sub(npc.mesh.position).setY(0).normalize();
    npc.state = 'walking';
    npc.walkTimer = Math.max(npc.walkTimer ?? 0, 2.0);
    return true;
  }

  /** Pick a local direction that remains on the pedestrian side of the road. The
   * normal wander system can use grass/parks, but authored sidewalks and plazas are
   * deliberately scored higher so NPCs naturally flow along the pedestrian network. */
  private chooseSafePedestrianDirection(npc: NPC, preferred?: THREE.Vector3): boolean {
    const bounds = npc.mesh.userData.wanderBounds as SpawnConfig['bounds'] | undefined;
    const origin = npc.mesh.position;
    const hasPreferred = preferred && preferred.lengthSq() > 0.001;
    let baseAngle: number;
    if (hasPreferred) {
      baseAngle = Math.atan2(preferred.x, preferred.z);
    } else if (npc.walkDirection && npc.walkDirection.lengthSq() > 0.001) {
      // Keep general forward momentum with a gentle natural wander bias
      baseAngle = Math.atan2(npc.walkDirection.x, npc.walkDirection.z);
    } else {
      baseAngle = Math.random() * Math.PI * 2;
    }
    const offsets = [0, 0.38, -0.38, 0.78, -0.78, 1.25, -1.25, 1.57, -1.57, 2.0, -2.0, 2.5, -2.5, Math.PI];
    const originPreferred = this.isPedestrianSurface(origin.x, origin.z);

    // Multi-tier search: first seek full 2.2m clearance, then 1.4m, then 0.65m
    for (const probeDistances of [[0.7, 1.4, 2.2], [0.6, 1.2], [0.55]]) {
      let best: { dir: THREE.Vector3; score: number } | null = null;
      for (const offset of offsets) {
        const angle = baseAngle + offset;
        const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        let safe = true;
        let preferredSamples = 0;
        for (const distance of probeDistances) {
          const probe = origin.clone().addScaledVector(dir, distance);
          if (!this.pointWithinWanderBounds(probe, bounds, 0.15) || this.isRoadSurface(probe.x, probe.z, 0.15)) {
            safe = false;
            break;
          }
          probe.y = this.groundHeight(probe.x, probe.z, origin.y);
          if (this.groundForbidden?.(probe)) {
            safe = false;
            break;
          }
          if (!this.canOccupy(probe, 0.44, 1.72)) {
            safe = false;
            break;
          }
          if (this.isPedestrianSurface(probe.x, probe.z)) preferredSamples += 1;
        }
        if (!safe) continue;
        const score = preferredSamples * (originPreferred ? 3.6 : 2.6) - Math.abs(offset) * 0.25 + Math.random() * 0.08;
        if (!best || score > best.score) best = { dir, score };
      }
      if (best) {
        if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
        npc.walkDirection.copy(best.dir);
        npc.mesh.userData.directionStabilityTimer = 1.2;
        return true;
      }
    }

    // Fallback: reverse away from obstruction so NPC is never pointing into a wall
    const fallbackAngle = baseAngle + Math.PI;
    const fallbackDir = new THREE.Vector3(Math.sin(fallbackAngle), 0, Math.cos(fallbackAngle));
    if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
    npc.walkDirection.copy(fallbackDir);
    npc.mesh.userData.directionStabilityTimer = 1.0;
    return false;
  }

  /**
   * Start a real zebra-crossing route: walk to the near curb, pause briefly, cross
   * straight through the marked crossing, then resume pavement wandering. No road
   * link exists anywhere else in the pedestrian navigation rules.
   */
  private maybeStartRoadCrossing(npc: NPC): boolean {
    if (!this.isOrdinaryPedestrian(npc) || this.pedestrianCrossings.length === 0) return false;
    const p = npc.mesh.position;
    const bounds = npc.mesh.userData.wanderBounds as SpawnConfig['bounds'] | undefined;
    let best: { crossing: PedestrianCrossingNode; approach: THREE.Vector3; exit: THREE.Vector3; score: number } | null = null;

    for (const crossing of this.pedestrianCrossings) {
      if (!this.pointWithinWanderBounds(crossing.endpointA, bounds, 0.05) || !this.pointWithinWanderBounds(crossing.endpointB, bounds, 0.05)) continue;
      const dA = p.distanceToSquared(crossing.endpointA);
      const dB = p.distanceToSquared(crossing.endpointB);
      const approach = dA <= dB ? crossing.endpointA : crossing.endpointB;
      const exit = dA <= dB ? crossing.endpointB : crossing.endpointA;
      const distance = Math.sqrt(Math.min(dA, dB));
      if (distance > 42) continue;
      // Do not route to a crossing approach that is itself on asphalt due to future
      // world edits or malformed authoring.
      if (this.isRoadSurface(approach.x, approach.z, 0.10) || this.isRoadSurface(exit.x, exit.z, 0.10)) continue;
      if (this.groundForbidden?.(approach) || this.groundForbidden?.(exit)) continue;
      if (!this.canOccupy(approach, 0.46, 1.72) || !this.canOccupy(exit, 0.46, 1.72)) continue;
      const score = distance + Math.abs(exit.distanceTo(p) - approach.distanceTo(p)) * 0.04;
      if (!best || score < best.score) best = { crossing, approach: approach.clone(), exit: exit.clone(), score };
    }
    if (!best) return false;

    // Distribute pedestrians across parallel lanes of the zebra crossing so they do
    // not walk in single file or collide head-on in the center.
    const laneAxis = best.crossing.roadAxis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const laneIndex = (Array.from(npc.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5) - 2;
    const laneOffset = laneIndex * 0.95;
    const approachWithLane = best.approach.clone().addScaledVector(laneAxis, laneOffset);
    const exitWithLane = best.exit.clone().addScaledVector(laneAxis, laneOffset);
    approachWithLane.y = this.groundHeight(approachWithLane.x, approachWithLane.z, best.approach.y);
    exitWithLane.y = this.groundHeight(exitWithLane.x, exitWithLane.z, best.exit.y);
    if (this.canOccupy(approachWithLane, 0.46, 1.72) && !this.isRoadSurface(approachWithLane.x, approachWithLane.z, 0.10) &&
        this.canOccupy(exitWithLane, 0.46, 1.72) && !this.isRoadSurface(exitWithLane.x, exitWithLane.z, 0.10)) {
      best.approach.copy(approachWithLane);
      best.exit.copy(exitWithLane);
    }

    npc.mesh.userData.pedestrianRouteKind = 'crossing';
    npc.mesh.userData.pedestrianRoutePhase = 'approach';
    npc.mesh.userData.pedestrianCrossingId = best.crossing.id;
    npc.mesh.userData.pedestrianRouteApproach = best.approach;
    npc.mesh.userData.pedestrianRouteExit = best.exit;
    npc.mesh.userData.pedestrianCrossingTarget = best.approach;
    npc.mesh.userData.pedestrianCrossing = false;
    if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
    npc.walkDirection.copy(best.approach).sub(p).setY(0).normalize();
    npc.state = 'walking';
    npc.walkTimer = 8.0;
    return true;
  }

  private updatePedestrianRoute(npc: NPC, dt: number): boolean {
    const kind = String(npc.mesh.userData.pedestrianRouteKind ?? '');
    if (!kind) return false;

    if (kind === 'road_escape') {
      const target = npc.mesh.userData.pedestrianRoadEscapeTarget as THREE.Vector3 | undefined;
      if (!target) {
        this.clearPedestrianRoute(npc);
        return false;
      }
      const delta = target.clone().sub(npc.mesh.position).setY(0);
      if (delta.lengthSq() < 0.65 * 0.65 || !this.isRoadSurface(npc.mesh.position.x, npc.mesh.position.z, 0.08)) {
        this.clearPedestrianRoute(npc);
        npc.state = 'idle';
        npc.walkTimer = 0.45 + Math.random() * 0.75;
        return false;
      }
      if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
      npc.walkDirection.copy(delta.normalize());
      npc.walkTimer = Math.max(npc.walkTimer ?? 0, 1.0);
      return true;
    }

    if (kind !== 'crossing') return false;
    const crossing = this.getCrossingById(String(npc.mesh.userData.pedestrianCrossingId ?? ''));
    const approach = npc.mesh.userData.pedestrianRouteApproach as THREE.Vector3 | undefined;
    const exit = npc.mesh.userData.pedestrianRouteExit as THREE.Vector3 | undefined;
    if (!crossing || !approach || !exit) {
      this.clearPedestrianRoute(npc);
      return false;
    }

    const phase = String(npc.mesh.userData.pedestrianRoutePhase ?? 'approach');
    if (phase === 'approach') {
      const delta = approach.clone().sub(npc.mesh.position).setY(0);
      if (delta.lengthSq() <= 0.70 * 0.70) {
        npc.mesh.userData.pedestrianRoutePhase = 'wait';
        npc.mesh.userData.pedestrianRouteWait = 0.22 + Math.random() * 0.30;
        npc.mesh.userData.pedestrianCrossingTarget = approach;
        npc.mesh.userData.pedestrianCrossing = false;
        return true;
      }
      // Approach the crossing through the pedestrian network with stabilized heading
      const approachDirTimer = Number(npc.mesh.userData.pedestrianApproachDirTimer ?? 0) - dt;
      npc.mesh.userData.pedestrianApproachDirTimer = approachDirTimer;
      if (approachDirTimer <= 0 || !npc.walkDirection || npc.walkDirection.lengthSq() < 0.01) {
        npc.mesh.userData.pedestrianApproachDirTimer = 0.9 + Math.random() * 0.5;
        if (!this.chooseSafePedestrianDirection(npc, delta)) {
          if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
          npc.walkDirection.copy(delta.normalize());
        }
      }
      npc.mesh.userData.pedestrianCrossingTarget = approach;
      npc.mesh.userData.pedestrianCrossing = false;
      npc.walkTimer = Math.max(npc.walkTimer ?? 0, 1.0);
      return true;
    }

    if (phase === 'wait') {
      const remaining = Math.max(0, Number(npc.mesh.userData.pedestrianRouteWait ?? 0) - dt);
      npc.mesh.userData.pedestrianRouteWait = remaining;
      npc.mesh.userData.pedestrianCrossing = false;
      if (remaining > 0) return true;
      npc.mesh.userData.pedestrianRoutePhase = 'cross';
      npc.mesh.userData.pedestrianCrossing = true;
      npc.mesh.userData.pedestrianCrossingTarget = exit;
    }

    if (String(npc.mesh.userData.pedestrianRoutePhase) === 'cross') {
      npc.state = 'walking';
      const delta = exit.clone().sub(npc.mesh.position).setY(0);
      if (delta.lengthSq() <= 0.72 * 0.72) {
        this.clearPedestrianRoute(npc);
        npc.state = 'walking';
        npc.walkTimer = 1.2 + Math.random() * 1.8;
        this.chooseSafePedestrianDirection(npc, exit.clone().sub(crossing.center).setY(0));
        return false;
      }
      if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
      npc.walkDirection.copy(delta.normalize());
      npc.mesh.userData.pedestrianCrossing = true;
      npc.mesh.userData.pedestrianCrossingTarget = exit;
      npc.walkTimer = Math.max(npc.walkTimer ?? 0, 1.0);
      return true;
    }
    return true;
  }

  public update(frameDt: number, playerPos: THREE.Vector3, drawDistanceScale = 1) {
    this.updateCombatEffects(frameDt);
    const now = performance.now() * 0.001;
    this.performanceFrame = (this.performanceFrame + 1) & 0x7fffffff;

    // Character powers used to let every powered cameo scan the full NPC roster
    // whenever its cooldown expired. Cache the tiny hostile subset a few times per
    // second instead; normal powers remain instant enough for arcade combat.
    this.hostileCacheTimer -= frameDt;
    if (this.hostileCacheTimer <= 0) {
      this.hostileCacheTimer = 0.28;
      this.cachedHostileNPCs = this.npcs.filter((npc) =>
        !!npc.mesh.userData.hostileJailGuard || npc.state === 'hostile_guard' || npc.state === 'attacking'
      );
    }

    // One nearby spatial broad phase feeds all pedestrian local-avoidance checks for
    // this tick. A second tiny physical grid keeps ragdolls/downed bodies available to
    // thrown-body collision without changing normal pedestrian avoidance behaviour.
    this.rebuildNPCAvoidanceGrid(playerPos);
    this.rebuildNPCPhysicalImpactGrid(playerPos);

    for (const npc of this.npcs) {
      let dt = frameDt;
      const dx = npc.mesh.position.x - playerPos.x;
      const dz = npc.mesh.position.z - playerPos.z;
      const distanceSq = dx * dx + dz * dz;
      const configuredMode = npc.movementMode ?? npc.mesh.userData.movementMode ?? 'ground';
      const mode = npc.id === 'cameo_iron_man' && npc.mesh.userData.ironFlightState === 'grounded' ? 'ground' : configuredMode;
      const pedestrianTransitCritical = mode === 'ground' && this.isPedestrianTransitCritical(npc);
      // The crossover roster is intentionally huge. Keep nearby streets lively but
      // do not ask the GPU to draw every cameo on the other side of the city.
      const baseDrawDistance = mode === 'flying' ? 220 : mode === 'swimming' ? 145 : npc.mesh.userData.isCameo ? 108 : 120;
      const drawDistance = baseDrawDistance * THREE.MathUtils.clamp(drawDistanceScale, 0.68, 1.05);
      npc.mesh.visible = distanceSq <= drawDistance * drawDistance;
      // Never freeze a launched/downed body simply because it crossed the render
      // distance. Physics/recovery keeps simulating off-screen until it is safely
      // grounded and back in an ordinary state.
      const ironFlightState = npc.id === 'cameo_iron_man' ? String(npc.mesh.userData.ironFlightState ?? 'grounded') : 'grounded';
      const needsOffscreenPhysics =
        npc.state === 'kicked' || npc.state === 'knocked_out' || npc.state === 'recovering' ||
        pedestrianTransitCritical ||
        (npc.id === 'cameo_iron_man' && ironFlightState !== 'grounded');
      if (!npc.mesh.visible && !needsOffscreenPhysics) continue;

      // PERFORMANCE LOD: only ordinary stable roaming NPCs are staggered. Ragdolls,
      // recovery, combat, scripted interactions and nearby pedestrians keep the
      // full simulation cadence so gameplay remains responsive and funny.
      const throttleEligible =
        !needsOffscreenPhysics &&
        !pedestrianTransitCritical &&
        !npc.mesh.userData.specialInteractionActive &&
        (npc.state === 'idle' || npc.state === 'walking') &&
        distanceSq > 48 * 48;
      if (throttleEligible) {
        const divisor = distanceSq > 84 * 84 ? 4 : 2;
        let phase = Number(npc.mesh.userData.performancePhase);
        if (!Number.isFinite(phase)) {
          phase = Array.from(npc.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) & 3;
          npc.mesh.userData.performancePhase = phase;
        }
        const accumulated = Number(npc.mesh.userData.performanceDt ?? 0) + frameDt;
        npc.mesh.userData.performanceDt = accumulated;
        if ((this.performanceFrame + phase) % divisor !== 0) continue;
        dt = Math.min(0.20, accumulated);
        npc.mesh.userData.performanceDt = 0;
      } else {
        npc.mesh.userData.performanceDt = 0;
      }

      this.updateElementalStatus(npc, dt, now);
      this.updateBrainrotAnimation(npc, dt, now);

      if ((npc.speechBubbleTimer ?? 0) > 0) {
        npc.speechBubbleTimer = Math.max(0, (npc.speechBubbleTimer ?? 0) - dt);
        if (npc.speechBubbleTimer === 0) {
          const bubble = npc.mesh.getObjectByName('speech_bubble');
          if (bubble) {
            npc.mesh.remove(bubble);
            if (bubble instanceof THREE.Sprite) {
              const material = bubble.material as THREE.SpriteMaterial;
              material.map?.dispose();
              material.dispose();
            }
          }
          npc.speechBubbleText = null;
        }
      }

      npc.mesh.userData.slipCooldown = Math.max(0, (npc.mesh.userData.slipCooldown ?? 0) - dt);
      npc.mesh.userData.wetTimer = Math.max(0, (npc.mesh.userData.wetTimer ?? 0) - dt);

      const vectorTimer = Math.max(0, (npc.mesh.userData.vectorCelebrateTimer ?? 0) - dt);
      if (npc.id === 'cameo_vector' && vectorTimer > 0 && !pedestrianTransitCritical && npc.state !== 'kicked' && npc.state !== 'knocked_out' && npc.state !== 'recovering') {
        npc.mesh.userData.vectorCelebrateTimer = vectorTimer;
        const duration = npc.mesh.userData.vectorCelebrateDuration ?? 1.35;
        const progress = 1 - vectorTimer / duration;
        const beat = Math.sin(progress * Math.PI * 4);
        const armL = npc.mesh.getObjectByName('arm_left');
        const armR = npc.mesh.getObjectByName('arm_right');
        if (armL) { armL.rotation.z = -1.05 - beat * 0.18; armL.rotation.x = -0.55; }
        if (armR) { armR.rotation.z = 1.05 + beat * 0.18; armR.rotation.x = -0.55; }
        npc.mesh.rotation.x = -0.18 - Math.max(0, beat) * 0.10;
        npc.mesh.rotation.z = Math.sin(progress * Math.PI * 2) * 0.12;
        const ground = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y);
        npc.mesh.position.y = ground + Math.max(0, Math.sin(progress * Math.PI * 4)) * 0.18;
        this.syncNPCPosition(npc);
        continue;
      } else if (npc.id === 'cameo_vector' && (npc.mesh.userData.vectorCelebrateTimer ?? 0) > 0) {
        npc.mesh.userData.vectorCelebrateTimer = 0;
      } else if (npc.id === 'cameo_vector') {
        const armL = npc.mesh.getObjectByName('arm_left');
        const armR = npc.mesh.getObjectByName('arm_right');
        if (armL) { armL.rotation.x = 0; armL.rotation.z = 0; }
        if (armR) { armR.rotation.x = 0; armR.rotation.z = 0; }
        npc.mesh.rotation.x = 0;
        npc.mesh.rotation.z = 0;
      }
      if (npc.mesh.userData.wetTimer <= 0 && npc.isWet) {
        npc.isWet = false;
        npc.mesh.userData.wetness = 0;
        npc.mesh.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
            const original = obj.userData.wetOriginalColor;
            if (typeof original === 'number') {
              obj.material.color.setHex(original);
              delete obj.userData.wetOriginalColor;
            }
          }
        });
      }

      // Soft body-contact reaction used when the player physically walks into an
      // NPC. It is intentionally a small stumble/lean, not a combat launch.
      const bodyPushTimer = Math.max(0, Number(npc.mesh.userData.bodyPushTimer ?? 0) - dt);
      npc.mesh.userData.bodyPushTimer = bodyPushTimer;
      if (bodyPushTimer > 0 && npc.state !== 'kicked' && npc.state !== 'knocked_out' && npc.state !== 'recovering' && npc.state !== 'defeated') {
        npc.mesh.userData.bodyPushWasActive = true;
        const leanSide = Number(npc.mesh.userData.bodyPushLeanSide ?? 1);
        const lean = leanSide * Math.sin(Math.min(1, bodyPushTimer / 0.32) * Math.PI) * 0.15;
        npc.mesh.rotation.z = THREE.MathUtils.damp(npc.mesh.rotation.z, lean, 18, dt);
      } else if (npc.mesh.userData.bodyPushWasActive && npc.id !== 'cameo_vector') {
        npc.mesh.rotation.z = THREE.MathUtils.damp(npc.mesh.rotation.z, 0, 16, dt);
        if (Math.abs(npc.mesh.rotation.z) < 0.01) {
          npc.mesh.rotation.z = 0;
          npc.mesh.userData.bodyPushWasActive = false;
        }
      }

      // App-level cinematic interactions temporarily own a character's transform.
      // Keep speech timers/effects alive, but do not let wandering or powers fight
      // the scripted pose/approach movement.
      if (npc.mesh.userData.specialInteractionActive) {
        this.syncNPCPosition(npc);
        continue;
      }

      if (this.updateAshDefenderCharizard(npc, dt, now, playerPos)) {
        continue;
      }

      if (this.updatePoweredCharacter(npc, dt, now, playerPos)) {
        this.syncNPCPosition(npc);
        continue;
      }

      // Dramatic cartoon launch with up to two small bounces. Airborne bodies use a
      // DEEP downward ground query: the normal pedestrian query intentionally only
      // looks a few metres down, which previously allowed a high launch to treat its
      // own current Y as the fallback "ground" and start walking in the sky.
      if (npc.state === 'kicked' && npc.kickedVelocity) {
        npc.mesh.userData.airborneSeconds = Number(npc.mesh.userData.airborneSeconds ?? 0) + dt;

        // Sub-step fast ragdolls so a low frame rate cannot tunnel an NPC through a
        // wall. Resolve X/Z independently to create a funny scrape/ricochet while
        // preserving whichever tangent direction is still free.
        const travel = npc.kickedVelocity.length() * dt;
        const steps = THREE.MathUtils.clamp(Math.ceil(travel / 0.20), 1, 16);
        const stepDt = dt / steps;
        let wallImpact = false;
        const bodyRadius = THREE.MathUtils.clamp(this.getNPCBodyRadius(npc), 0.40, 0.65);
        const bodyHeight = 1.55;

        for (let step = 0; step < steps; step++) {
          const currentGround = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
          const nextY = npc.mesh.position.y + npc.kickedVelocity.y * stepDt;

          if (nextY <= currentGround) {
            npc.mesh.position.y = currentGround;
          } else {
            const verticalProbe = npc.mesh.position.clone();
            verticalProbe.y = nextY;
            if (this.canOccupy(verticalProbe, bodyRadius, bodyHeight)) {
              npc.mesh.position.y = nextY;
            } else if (npc.kickedVelocity.y > 0.5) {
              // Ceiling/overhang contact: kill most upward momentum without teleporting.
              npc.kickedVelocity.y *= -0.18;
              wallImpact = true;
            }
          }

          const xProbe = npc.mesh.position.clone();
          xProbe.x += npc.kickedVelocity.x * stepDt;
          if (this.canOccupy(xProbe, bodyRadius, bodyHeight)) {
            npc.mesh.position.x = xProbe.x;
          } else {
            npc.kickedVelocity.x = THREE.MathUtils.clamp(npc.kickedVelocity.x * -0.38, -17, 17);
            wallImpact = true;
            if (this.recoverPenetration) {
              const rec = this.recoverPenetration(npc.mesh.position, bodyRadius, bodyHeight);
              npc.mesh.position.x = rec.x;
              npc.mesh.position.z = rec.z;
            }
          }

          const zProbe = npc.mesh.position.clone();
          zProbe.z += npc.kickedVelocity.z * stepDt;
          if (this.canOccupy(zProbe, bodyRadius, bodyHeight)) {
            npc.mesh.position.z = zProbe.z;
          } else {
            npc.kickedVelocity.z = THREE.MathUtils.clamp(npc.kickedVelocity.z * -0.38, -17, 17);
            wallImpact = true;
            if (this.recoverPenetration) {
              const rec = this.recoverPenetration(npc.mesh.position, bodyRadius, bodyHeight);
              npc.mesh.position.x = rec.x;
              npc.mesh.position.z = rec.z;
            }
          }

          // A thrown/kicked character remains a physical body. Resolve contact
          // immediately after each movement substep so low FPS cannot tunnel Person A
          // straight through Person B without transferring momentum.
          this.resolveThrownNPCSecondaryImpact(npc);
        }

        const ground = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
        if (npc.mesh.position.y < ground) {
          npc.mesh.position.y = ground;
        }
        if (this.recoverPenetration && !this.canOccupy(npc.mesh.position, bodyRadius, bodyHeight)) {
          const rec = this.recoverPenetration(npc.mesh.position, bodyRadius, bodyHeight);
          npc.mesh.position.x = rec.x;
          npc.mesh.position.z = rec.z;
        }

        if (wallImpact && Number(npc.mesh.userData.wallImpactCooldown ?? 0) <= 0) {
          npc.mesh.userData.wallImpactCooldown = 0.18;
          this.spawnImpactBurst(npc.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 0xffffff, 0.7);
          playSoundEffect('crash', npc.mesh.position);
        }
        npc.mesh.userData.wallImpactCooldown = Math.max(0, Number(npc.mesh.userData.wallImpactCooldown ?? 0) - dt);
        npc.kickedVelocity.y = Math.max(-28, npc.kickedVelocity.y - 22 * dt);

        // Every launch gets slightly different flail axes, keeping impacts absurd and
        // organic instead of making every pedestrian tumble with the exact same spin.
        const spinX = Number(npc.mesh.userData.ragdollSpinX ?? 7);
        const spinY = Number(npc.mesh.userData.ragdollSpinY ?? 4);
        const spinZ = Number(npc.mesh.userData.ragdollSpinZ ?? 9);
        npc.mesh.rotation.z += spinZ * dt;
        npc.mesh.rotation.x += spinX * dt;
        npc.mesh.rotation.y += spinY * dt;
        const flail = Math.sin(now * 19 + Number(npc.mesh.userData.ragdollFlailPhase ?? 0));
        const armL = npc.mesh.getObjectByName('arm_left');
        const armR = npc.mesh.getObjectByName('arm_right');
        const legL = npc.mesh.getObjectByName('leg_left');
        const legR = npc.mesh.getObjectByName('leg_right');
        if (armL) armL.rotation.x += flail * dt * 7;
        if (armR) armR.rotation.x -= flail * dt * 7;
        if (legL) legL.rotation.x -= flail * dt * 5;
        if (legR) legR.rotation.x += flail * dt * 5;

        // Absolute failsafe for corrupted saves/impulses: after several seconds in
        // the air, strongly bias downward rather than allowing an eternal sky NPC.
        if (Number(npc.mesh.userData.airborneSeconds ?? 0) > 4.5) {
          npc.kickedVelocity.y = Math.min(npc.kickedVelocity.y, -14);
        }
        if (npc.mesh.position.y <= ground + 0.025 && npc.kickedVelocity.y <= 0) {
          npc.mesh.position.y = ground;
          const downwardSpeed = Math.abs(npc.kickedVelocity.y);
          const bounceCount = npc.mesh.userData.bounceCount ?? 0;
          if (downwardSpeed > 4.5 && bounceCount < 2) {
            npc.mesh.userData.bounceCount = bounceCount + 1;
            npc.kickedVelocity.y = Math.min(6.5, downwardSpeed * 0.30);
            npc.kickedVelocity.x *= 0.58;
            npc.kickedVelocity.z *= 0.58;
            playSoundEffect('crash', npc.mesh.position);
          } else {
            npc.kickedVelocity.set(0, 0, 0);
            npc.mesh.userData.bounceCount = 0;
            npc.mesh.userData.airborneSeconds = 0;
            if (npc.mesh.userData.pendingKnockout) {
              npc.state = 'knocked_out';
              npc.knockoutTimer = 4.5 + Math.random() * 2.5;
              const side = Number(npc.mesh.userData.spinDirection ?? 1) >= 0 ? 1 : -1;
              npc.mesh.rotation.set(0.08 * side, npc.mesh.rotation.y, side * Math.PI / 2);
              const safeLandingPos = this.findRecoveryPosition(npc, ground);
              npc.mesh.position.copy(safeLandingPos);
              npc.mesh.position.y = safeLandingPos.y + 0.16;
            } else {
              // Ordinary impacts also get a readable get-up. Do not snap from a
              // ridiculous ragdoll directly into a walking pose on the landing frame.
              this.beginRecovery(npc, ground, false);
            }
          }
        }
        this.syncNPCPosition(npc);
        continue;
      }

      if (npc.state === 'knocked_out') {
        const ground = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
        npc.mesh.position.y = ground + 0.16;
        if (this.recoverPenetration && !this.canOccupy(npc.mesh.position, 0.40, 0.75)) {
          const rec = this.recoverPenetration(npc.mesh.position, 0.40, 0.75);
          npc.mesh.position.x = rec.x;
          npc.mesh.position.z = rec.z;
        }
        const permanentlyDown = this.isDeadBody(npc) || !!npc.mesh.userData.noRecover;
        if (!permanentlyDown) {
          npc.knockoutTimer = Math.max(0, (npc.knockoutTimer ?? 0) - dt);
          if ((npc.knockoutTimer ?? 0) <= 0) {
            this.say(npc, '...I am getting back up.', 1.6);
            this.beginRecovery(npc, ground, true);
          }
        } else {
          // Death only disables living behaviour. Keep the body in-world forever so
          // later kicks/impacts can relaunch the same physical ragdoll.
          npc.knockoutTimer = 9999;
          if (npc.id === 'jail_escape_guard' || npc.mesh.userData.hostileJailGuard) {
            npc.mesh.userData.guardDefeated = true;
          }
          this.clearNPCSpeech(npc);
        }
        this.syncNPCPosition(npc);
        continue;
      }

      if (this.updateRecovery(npc, dt)) continue;

      // Aquatic population uses lightweight water-specific navigation. The old
      // decorative orbit directly lerped through bridge supports/boats/characters.
      // Keep the same authored wandering feel, but sweep each local step against
      // real 3D collision and try a few cheap steering alternatives when blocked.
      if (mode === 'swimming') {
        const home = npc.mesh.userData.home as THREE.Vector3;
        const bounds = npc.mesh.userData.wanderBounds as SpawnConfig['bounds'] | undefined;
        const speed = npc.mesh.userData.swimSpeed ?? 0.55;
        const phase = (npc.mesh.userData.swimPhase ?? 0) + dt * speed;
        npc.mesh.userData.swimPhase = phase;

        const halfX = bounds ? Math.max(3, (bounds.maxX - bounds.minX) * 0.42) : 10;
        const halfZ = bounds ? Math.max(5, (bounds.maxZ - bounds.minZ) * 0.42) : 18;
        const centerX = bounds ? (bounds.minX + bounds.maxX) * 0.5 : home.x;
        const centerZ = bounds ? (bounds.minZ + bounds.maxZ) * 0.5 : home.z;
        const orbitX = centerX + Math.cos(phase * 0.83 + npc.id.length) * halfX;
        const orbitZ = centerZ + Math.sin(phase + npc.id.length * 0.37) * halfZ;

        const surfaceY = npc.mesh.userData.waterSurfaceY ?? 0.075;
        const baseDepth = npc.mesh.userData.swimDepth ?? 0.45;
        const diveAmount = npc.mesh.userData.diveAmount ?? 0.3;
        const diveWave = (1 + Math.sin(phase * 1.37 + npc.id.length)) * 0.5;
        const targetY = surfaceY - baseDepth - diveWave * diveAmount;
        const radius = this.getAquaticBodyRadius(npc);
        const bodyHeight = Math.max(0.9, radius * 1.65);

        const follow = 1 - Math.exp(-dt * (1.15 + speed));
        const desiredX = THREE.MathUtils.lerp(npc.mesh.position.x, orbitX, follow);
        const desiredZ = THREE.MathUtils.lerp(npc.mesh.position.z, orbitZ, follow);
        const desiredY = THREE.MathUtils.lerp(npc.mesh.position.y, targetY, Math.min(1, dt * 2.4));
        let moveX = desiredX - npc.mesh.position.x;
        let moveZ = desiredZ - npc.mesh.position.z;
        const desiredLen = Math.hypot(moveX, moveZ);
        if (desiredLen > 1.25) {
          moveX *= 1.25 / desiredLen;
          moveZ *= 1.25 / desiredLen;
        }

        let moved = false;
        const baseHeading = Math.atan2(moveX, moveZ);
        const preferSide = Number(npc.mesh.userData.swimAvoidSide ?? ((npc.id.length % 2) * 2 - 1));
        const offsets = [0, 0.52 * preferSide, -0.52 * preferSide, 0.95 * preferSide, -0.95 * preferSide, Math.PI * 0.72 * preferSide];
        const stepLength = Math.max(0.04, Math.hypot(moveX, moveZ));
        let actualDX = 0;
        let actualDZ = 0;
        for (const offset of offsets) {
          const candidate = this.tempNext.set(
            npc.mesh.position.x + Math.sin(baseHeading + offset) * stepLength,
            desiredY,
            npc.mesh.position.z + Math.cos(baseHeading + offset) * stepLength,
          );
          if (!this.aquaticStepClear(npc, npc.mesh.position, candidate, radius, bodyHeight)) continue;
          actualDX = candidate.x - npc.mesh.position.x;
          actualDZ = candidate.z - npc.mesh.position.z;
          npc.mesh.position.copy(candidate);
          moved = true;
          if (Math.abs(offset) > 0.01) npc.mesh.userData.swimAvoidSide = Math.sign(offset);
          break;
        }

        if (!moved) {
          // Do not freeze permanently against one support: alternate the preferred
          // bypass side and let the moving orbit target pull the swimmer around it.
          npc.mesh.userData.swimAvoidSide = -preferSide;
          const blockedTime = Number(npc.mesh.userData.swimBlockedTimer ?? 0) + dt;
          npc.mesh.userData.swimBlockedTimer = blockedTime;
          npc.mesh.position.y = desiredY;

          // If blocked for more than 0.8s, or if anywhere near the causeway road, smoothly steer toward open water
          if (blockedTime > 0.8 || (npc.mesh.position.x >= -7 && npc.mesh.position.x <= 23 && npc.mesh.position.z >= -250 && npc.mesh.position.z <= -160)) {
            const escapeX = npc.mesh.position.x >= 8 ? 28 : -26;
            const escapeZ = bounds ? THREE.MathUtils.clamp(npc.mesh.position.z, bounds.minZ + 4, bounds.maxZ - 4) : -188;
            const escapeDX = escapeX - npc.mesh.position.x;
            const escapeDZ = escapeZ - npc.mesh.position.z;
            const escapeDist = Math.hypot(escapeDX, escapeDZ);
            if (escapeDist > 0.1) {
              const nudge = Math.min(escapeDist, dt * 1.8);
              npc.mesh.position.x += (escapeDX / escapeDist) * nudge;
              npc.mesh.position.z += (escapeDZ / escapeDist) * nudge;
              npc.mesh.rotation.y = Math.atan2(escapeDX, escapeDZ);
            }
          }
        } else {
          npc.mesh.userData.swimBlockedTimer = 0;
          if (Math.abs(actualDX) + Math.abs(actualDZ) > 0.0001) npc.mesh.rotation.y = Math.atan2(actualDX, actualDZ);
        }

        npc.mesh.rotation.z = Math.sin(phase * 2.2) * 0.055;
        const tail = npc.mesh.getObjectByName('water_tail');
        if (tail) tail.rotation.y = Math.sin(phase * 7.5) * 0.48;
        const finL = npc.mesh.getObjectByName('water_fin_left');
        const finR = npc.mesh.getObjectByName('water_fin_right');
        if (finL) finL.rotation.z = -0.32 + Math.sin(phase * 5.2) * 0.16;
        if (finR) finR.rotation.z = 0.32 - Math.sin(phase * 5.2) * 0.16;

        this.syncNPCPosition(npc);
        continue;
      }

      // Flying NPCs use the same swept 3D collision volume as Ash's Charizard.
      // This remains deliberately cheap (no pathfinding), but direct orbit writes
      // are forbidden because they used to teleport flyers through buildings.
      if (mode === 'flying') {
        const home = npc.mesh.userData.home as THREE.Vector3;
        const phase = (npc.mesh.userData.flightPhase ?? 0) + now * 0.28 * (npc.mesh.userData.speedMultiplier ?? 1);
        const orbitRadius = npc.mesh.userData.flightRadius ?? 14;
        const targetX = home.x + Math.cos(phase) * orbitRadius;
        const targetZ = home.z + Math.sin(phase) * orbitRadius;
        const terrainY = this.groundHeight(targetX, targetZ, npc.mesh.position.y, 120, 0.12);
        const flightHeight = Math.max(3.2, Number(npc.mesh.userData.flightHeight ?? 13));
        const target = new THREE.Vector3(
          targetX,
          terrainY + flightHeight + Math.sin(now * 1.7 + phase) * 1.4,
          targetZ
        );
        const desired = target.sub(npc.mesh.position);
        // Throttled far-away AI can accumulate dt, so cap distance per update and
        // let the swept helper sub-step the remaining motion safely.
        const maxTravel = Math.max(0.08, 5.8 * dt);
        if (desired.length() > maxTravel) desired.setLength(maxTravel);
        const bodyRadius = npc.type === 'pokemon_charizard' ? 0.82 : 0.58;
        const bodyHeight = npc.type === 'pokemon_charizard' ? 2.85 : 2.0;
        const maxFeetY = terrainY + flightHeight + 5.0;
        const before = npc.mesh.position.clone();
        this.moveFlyingNPC(npc, desired, bodyRadius, bodyHeight, maxFeetY, false);
        const actual = npc.mesh.position.clone().sub(before).setY(0);
        if (actual.lengthSq() > 0.0001) npc.mesh.rotation.y = Math.atan2(actual.x, actual.z);
        const wingL = npc.mesh.getObjectByName('wing_left');
        const wingR = npc.mesh.getObjectByName('wing_right');
        const flap = Math.sin(now * 7.5) * 0.45;
        if (wingL) wingL.rotation.y = flap;
        if (wingR) wingR.rotation.y = -flap;
        this.syncNPCPosition(npc);
        continue;
      }

      // Shopkeepers/important interior characters stay at their authored position
      // unless they are currently being attacked, burning or knocked around.
      if (npc.mesh.userData.stationary && npc.state !== 'panicking') {
        const home = npc.mesh.userData.home as THREE.Vector3;
        npc.mesh.position.copy(home);
        npc.mesh.rotation.x = 0;
        npc.mesh.rotation.z = 0;
        if (npc.mesh.userData.airportCafeWorker) {
          // Tiny deterministic counter-service idle: a gentle look-around and hand
          // movement makes the worker feel alive without running full wander AI or
          // risking them stepping through the café counter.
          const head = npc.mesh.getObjectByName('head');
          const armL = npc.mesh.getObjectByName('arm_left');
          const armR = npc.mesh.getObjectByName('arm_right');
          if (head) head.rotation.y = Math.sin(now * 0.85) * 0.14;
          if (armL) armL.rotation.x = -0.12 + Math.sin(now * 1.55) * 0.07;
          if (armR) armR.rotation.x = -0.24 + Math.sin(now * 1.9 + 0.8) * 0.10;
        }
        this.syncNPCPosition(npc);
        continue;
      }

      // Cheap LOD: distant pedestrians stay visible but stop running full wander AI.
      if (distanceSq > 95 * 95 && !pedestrianTransitCritical) {
        this.syncNPCPosition(npc);
        continue;
      }

      const ordinaryNavigation = this.isOrdinaryPedestrian(npc) &&
        (npc.state === 'idle' || npc.state === 'walking' || npc.state === 'panicking');

      // A physical knock/throw/car impact may legitimately leave someone in a road.
      // Once ordinary navigation resumes, their first job is simply to reach the
      // nearest pavement/verge. They never choose the far curb as a shortcut.
      if (ordinaryNavigation) {
        const crossingLocked = this.ensureCrossingTransitRoute(npc);
        if (!crossingLocked) this.ensureRoadEscapeRoute(npc);
      }
      const routeOwned = ordinaryNavigation ? this.updatePedestrianRoute(npc, dt) : false;
      const routeKind = String(npc.mesh.userData.pedestrianRouteKind ?? '');
      const routePhase = String(npc.mesh.userData.pedestrianRoutePhase ?? '');
      const routeWaiting = routeKind === 'crossing' && routePhase === 'wait';

      if (!routeOwned) {
        npc.walkTimer = (npc.walkTimer ?? 0) - dt;
        if (npc.walkTimer <= 0) {
          if (npc.state === 'idle') {
            // Cross-street wandering is allowed ONLY through an authored zebra
            // crossing. If no usable crossing is nearby, stay on this side.
            const startedCrossing = Math.random() < 0.28 && this.maybeStartRoadCrossing(npc);
            if (!startedCrossing) {
              npc.state = 'walking';
              npc.walkTimer = 2 + Math.random() * 4;
              if (!this.chooseSafePedestrianDirection(npc)) {
                npc.state = 'idle';
                npc.walkTimer = 0.65 + Math.random() * 1.0;
              }
            }
          } else if (npc.state !== 'panicking') {
            npc.state = 'idle';
            npc.walkTimer = 1 + Math.random() * 3.5;
            this.clearPedestrianRoute(npc);
          }
        }
      }

      if (npc.state === 'panicking') {
        npc.mesh.userData.stateTimer = Math.max(0, (npc.mesh.userData.stateTimer ?? 0) - dt);
        if (npc.mesh.userData.stateTimer <= 0) {
          npc.state = 'walking';
          npc.walkTimer = 1 + Math.random() * 2;
          // Keep any road-escape route until the NPC is safely out of traffic.
          if (String(npc.mesh.userData.pedestrianRouteKind ?? '') !== 'road_escape') this.clearPedestrianRoute(npc);
        }
      }

      const crowdYieldTimer = Math.max(0, Number(npc.mesh.userData.crowdYieldTimer ?? 0) - dt);
      npc.mesh.userData.crowdYieldTimer = crowdYieldTimer;
      const directionStabilityTimer = Math.max(0, Number(npc.mesh.userData.directionStabilityTimer ?? 0) - dt);
      npc.mesh.userData.directionStabilityTimer = directionStabilityTimer;

      const crossingMustProgress = routeKind === 'crossing' && routePhase === 'cross';
      if ((npc.state === 'walking' || npc.state === 'panicking') && npc.walkDirection && !routeWaiting && (crowdYieldTimer <= 0 || crossingMustProgress)) {
        const activeKind = String(npc.mesh.userData.pedestrianRouteKind ?? '');
        const activePhase = String(npc.mesh.userData.pedestrianRoutePhase ?? '');
        const activeCrossing = activeKind === 'crossing' && activePhase === 'cross';
        const crossing = activeCrossing
          ? this.getCrossingById(String(npc.mesh.userData.pedestrianCrossingId ?? ''))
          : null;
        const baseSpeed = npc.state === 'panicking' ? 5.6 : activeCrossing ? 2.35 : activeKind === 'road_escape' ? 2.5 : 2.0 + ((npc.id.length % 5) * 0.12);
        const snared = performance.now() * 0.001 < Number(npc.mesh.userData.powerSnaredUntil ?? 0);
        const speed = baseSpeed * (npc.mesh.userData.speedMultiplier ?? 1) * (snared ? 0.28 : 1);
        const crowdSpeedScale = mode === 'ground'
          ? this.computePedestrianAvoidance(npc, npc.walkDirection, activeCrossing, this.tempAvoidDirection)
          : 1;
        const moveDirection = mode === 'ground' ? this.tempAvoidDirection : npc.walkDirection;
        this.tempStep.copy(moveDirection).multiplyScalar(speed * crowdSpeedScale * dt);
        this.tempNext.copy(npc.mesh.position).add(this.tempStep);
        const bounds = npc.mesh.userData.wanderBounds as SpawnConfig['bounds'] | undefined;
        if (bounds) {
          // Crossing/escape routes are authored inside their wander area, so do not
          // reverse direction mid-crossing. Ordinary wandering turns inwards towards the center.
          if (!activeCrossing && activeKind !== 'road_escape') {
            if (this.tempNext.x < bounds.minX || this.tempNext.x > bounds.maxX ||
                this.tempNext.z < bounds.minZ || this.tempNext.z > bounds.maxZ) {
              const centerDir = new THREE.Vector3(
                (bounds.minX + bounds.maxX) * 0.5 - npc.mesh.position.x,
                0,
                (bounds.minZ + bounds.maxZ) * 0.5 - npc.mesh.position.z
              ).normalize();
              this.chooseSafePedestrianDirection(npc, centerDir);
              npc.walkTimer = 2.5 + Math.random() * 2.5;
              npc.mesh.userData.directionStabilityTimer = 1.5;
              const reboundCrowdScale = mode === 'ground'
                ? this.computePedestrianAvoidance(npc, npc.walkDirection, false, this.tempAvoidDirection)
                : 1;
              const reboundDirection = mode === 'ground' ? this.tempAvoidDirection : npc.walkDirection;
              this.tempStep.copy(reboundDirection).multiplyScalar(speed * reboundCrowdScale * dt);
              this.tempNext.copy(npc.mesh.position).add(this.tempStep);
            }
          }
          this.tempNext.x = THREE.MathUtils.clamp(this.tempNext.x, bounds.minX + 0.15, bounds.maxX - 0.15);
          this.tempNext.z = THREE.MathUtils.clamp(this.tempNext.z, bounds.minZ + 0.15, bounds.maxZ - 0.15);
        }
        const ground = this.groundHeight(this.tempNext.x, this.tempNext.z, npc.mesh.position.y, 120, 0.12);
        this.tempNext.y = mode === 'hover' ? ground + 1.0 + Math.sin(now * 3) * 0.18 : ground;

        const candidateOnRoad = mode === 'ground' && this.isRoadSurface(this.tempNext.x, this.tempNext.z, 0.12);
        const currentOnRoad = mode === 'ground' && this.isRoadSurface(npc.mesh.position.x, npc.mesh.position.z, 0.08);
        const legalCrossingRoadStep = !!crossing && activeCrossing && this.isInsideCrossingCorridor(crossing, this.tempNext);
        const legalRecoveryRoadStep = activeKind === 'road_escape' && currentOnRoad;
        const illegalRoadEntry = candidateOnRoad && !legalCrossingRoadStep && !legalRecoveryRoadStep;
        const illegalWaterEntry = mode === 'ground' && !!this.groundForbidden?.(this.tempNext);
        const blockedByWorld = mode !== 'hover' && !this.canOccupy(this.tempNext, 0.44, 1.72);
        const blockedByCrowd = mode === 'ground' && this.pedestrianCandidateOverlapsNPC(npc, this.tempNext, 0.025);

        if (illegalRoadEntry || illegalWaterEntry) {
          // Absolute navigation masks: ordinary pedestrians cannot jaywalk and they
          // cannot intentionally walk into open river water. Instead of reversing 180 deg
          // (which would bounce into a building), steer along the sidewalk tangent.
          const walkDir = (npc.walkDirection && npc.walkDirection.lengthSq() > 0.01) ? npc.walkDirection : new THREE.Vector3(1, 0, 0);
          const leftTangent = new THREE.Vector3(-walkDir.z, 0, walkDir.x);
          const rightTangent = new THREE.Vector3(walkDir.z, 0, -walkDir.x);
          const preferredTangent = (npc.id.charCodeAt(0) % 2 === 0) ? leftTangent : rightTangent;
          this.chooseSafePedestrianDirection(npc, preferredTangent);
          npc.walkTimer = 2.5 + Math.random() * 2.5;
          npc.mesh.userData.directionStabilityTimer = 1.4;
          this.tempNext.copy(npc.mesh.position);
        } else if (blockedByWorld) {
          // Obstacle / wall circumvention: smoothly slide along the wall or walk around it
          const bypass = this.findPedestrianWorldBypassStep(
            npc,
            moveDirection,
            Math.max(this.tempStep.length(), speed * dt),
            bounds,
            crossing,
            activeCrossing
          );
          if (bypass) {
            this.tempNext.copy(bypass);
            npc.mesh.position.copy(this.tempNext);
            npc.mesh.userData.crowdYieldTimer = 0;
          } else {
            // Boxed in: find an open sidewalk heading, avoiding rapid 180 degree flips
            this.chooseSafePedestrianDirection(npc);
            npc.walkTimer = 2.0 + Math.random() * 2.0;
            npc.mesh.userData.directionStabilityTimer = 1.4;
            this.tempNext.copy(npc.mesh.position);
            if (!this.canOccupy(npc.mesh.position, 0.44, 1.70)) {
              this.depenetrateNPC(npc);
            }
          }
        } else if (blockedByCrowd) {
          // Crowd avoidance: sidestep around other pedestrians on both crossings and pavements
          const bypass = this.findCrowdBypassStep(
            npc,
            crossing,
            moveDirection,
            Math.max(this.tempStep.length(), speed * dt),
            bounds,
            activeCrossing
          );
          if (bypass) {
            const bypassDelta = bypass.clone().sub(npc.mesh.position).setY(0);
            this.tempNext.copy(bypass);
            npc.mesh.position.copy(this.tempNext);
            npc.mesh.userData.crowdYieldTimer = 0;
            npc.mesh.userData.crowdWaitTime = 0;
            if (bypassDelta.lengthSq() > 0.001) {
              npc.walkDirection.lerp(bypassDelta.normalize(), 0.30).normalize();
            }
          } else {
            const waitTime = Number(npc.mesh.userData.crowdWaitTime ?? 0) + dt;
            npc.mesh.userData.crowdWaitTime = waitTime;
            if (waitTime > 1.25) {
              npc.mesh.userData.crowdWaitTime = 0;
              if (activeCrossing && crossing) {
                npc.mesh.userData.crowdAvoidSide = -Number(npc.mesh.userData.crowdAvoidSide ?? 1);
              } else {
                this.chooseSafePedestrianDirection(npc);
                npc.walkTimer = 2.0 + Math.random() * 2.0;
                npc.mesh.userData.directionStabilityTimer = 1.4;
              }
            }
            npc.mesh.userData.crowdYieldTimer = activeCrossing ? 0.04 : 0.10 + Math.random() * 0.08;
            this.tempNext.copy(npc.mesh.position);
          }
        } else {
          npc.mesh.position.copy(this.tempNext);
        }

        const facing = (npc.walkDirection && npc.walkDirection.lengthSq() > 0.001) ? npc.walkDirection : this.tempStep;
        if (facing.lengthSq() > 0.0001) {
          const targetHeading = Math.atan2(facing.x, facing.z);
          let diff = targetHeading - npc.mesh.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          npc.mesh.rotation.y += diff * Math.min(1, dt * 10);
        }

        const actualStepDist = this.tempNext.distanceTo(npc.mesh.position);
        const actualSpeed = actualStepDist / Math.max(0.0001, dt);
        const animFactor = THREE.MathUtils.clamp(actualSpeed / 1.6, 0, 1.2);

        const legL = npc.mesh.getObjectByName('leg_left');
        const legR = npc.mesh.getObjectByName('leg_right');
        const armL = npc.mesh.getObjectByName('arm_left');
        const armR = npc.mesh.getObjectByName('arm_right');
        const stride = Math.sin(now * (npc.state === 'panicking' ? 13 : 8)) * (npc.state === 'panicking' ? 0.7 : 0.4) * animFactor;
        if (legL) legL.rotation.x = stride;
        if (legR) legR.rotation.x = -stride;
        if (armL) armL.rotation.x = -stride * 0.55;
        if (armR) armR.rotation.x = stride * 0.55;

        if (npc.isWet && npc.state === 'panicking' && npc.mesh.userData.slipCooldown <= 0 && Math.random() < dt * 1.35) {
          npc.mesh.userData.slipCooldown = 5;
          this.say(npc, 'WHOA—SLIPPERY!', 2);
          this.launchNPC(npc, npc.walkDirection.clone(), 7, 5.5);
        }
      } else {
        const ground = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
        npc.mesh.position.y = mode === 'hover' ? ground + 1.0 + Math.sin(now * 2.5) * 0.16 : ground;
      }

      // Anti-stuck watchdog: ensure no pedestrian gets trapped against world geometry or behind others
      if ((npc.state === 'walking' || npc.state === 'panicking') && mode === 'ground' && !routeWaiting) {
        if (!npc.mesh.userData.antiStuckPos) {
          npc.mesh.userData.antiStuckPos = npc.mesh.position.clone();
          npc.mesh.userData.antiStuckTimer = 0;
        }
        const lastStuckPos = npc.mesh.userData.antiStuckPos as THREE.Vector3;
        const distMoved = npc.mesh.position.distanceTo(lastStuckPos);
        if (distMoved < 0.04) {
          npc.mesh.userData.antiStuckTimer = Number(npc.mesh.userData.antiStuckTimer ?? 0) + dt;
          if (Number(npc.mesh.userData.antiStuckTimer) >= 2.5) {
            npc.mesh.userData.antiStuckTimer = 0;
            npc.mesh.userData.crowdYieldTimer = 0;
            npc.mesh.userData.crowdWaitTime = 0;
            if (!this.canOccupy(npc.mesh.position, 0.44, 1.70)) {
              this.depenetrateNPC(npc);
            }
            const isCrossing = routeKind === 'crossing' && routePhase === 'cross';
            const curCrossing = isCrossing ? this.getCrossingById(String(npc.mesh.userData.pedestrianCrossingId ?? '')) : null;
            if (isCrossing && curCrossing) {
              npc.mesh.userData.crowdAvoidSide = -Number(npc.mesh.userData.crowdAvoidSide ?? 1);
              const lateralAxis = curCrossing.roadAxis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
              const testOffset = lateralAxis.clone().multiplyScalar(Number(npc.mesh.userData.crowdAvoidSide) * 1.2);
              const unstuckCand = npc.mesh.position.clone().add(testOffset);
              unstuckCand.y = this.groundHeight(unstuckCand.x, unstuckCand.z, npc.mesh.position.y);
              if (this.isInsideCrossingCorridor(curCrossing, unstuckCand) && this.canOccupy(unstuckCand, 0.44, 1.72)) {
                npc.mesh.position.copy(unstuckCand);
              }
            } else {
              this.chooseSafePedestrianDirection(npc);
              npc.walkTimer = 2.5 + Math.random() * 2.5;
              npc.mesh.userData.directionStabilityTimer = 1.5;
            }
            lastStuckPos.copy(npc.mesh.position);
          }
        } else {
          lastStuckPos.copy(npc.mesh.position);
          npc.mesh.userData.antiStuckTimer = Math.max(0, Number(npc.mesh.userData.antiStuckTimer ?? 0) - dt * 2);
        }
      }

      this.syncNPCPosition(npc);
    }

    // Correct any tiny standing-body overlap that remains after predictive steering.
    // Kicked/thrown/recovering bodies are intentionally not moved by this solver.
    this.resolveNPCBodyOverlaps(playerPos);
  }

  private syncNPCPosition(npc: NPC) {
    npc.position = { x: npc.mesh.position.x, y: npc.mesh.position.y, z: npc.mesh.position.z };
  }

  public getNearbyNPC(playerPos: THREE.Vector3, range = 3.5): NPC | null {
    let closest: NPC | null = null;
    let minDistSq = range * range;
    for (const npc of this.npcs) {
      if (!npc.mesh.visible || this.isDeadBody(npc) || npc.state === 'knocked_out') continue;
      const distSq = playerPos.distanceToSquared(npc.mesh.position);
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closest = npc;
      }
    }
    return closest;
  }

  public getNPCInFront(origin: THREE.Vector3, forward: THREE.Vector3, range = 3.8, minDot = -0.15): NPC | null {
    let best: NPC | null = null;
    let bestScore = Infinity;
    const fwd = forward.clone().setY(0).normalize();
    for (const npc of this.npcs) {
      if (!npc.mesh.visible || this.isDeadBody(npc) || npc.state === 'knocked_out') continue;
      const delta = npc.mesh.position.clone().sub(origin);
      const vertical = Math.abs(delta.y);
      delta.y = 0;
      const distance = delta.length();
      if (distance <= 0.01 || distance > range || vertical > 2.7) continue;
      const dot = delta.normalize().dot(fwd);
      if (dot < minDot) continue;
      const score = distance - dot * 0.7;
      if (score < bestScore) {
        bestScore = score;
        best = npc;
      }
    }
    return best;
  }

  /** Melee-only target query. Unlike conversation/grab targeting, a body on the
   * ground remains a valid physical target after knockout/death. */
  public getAttackableNPCInFront(origin: THREE.Vector3, forward: THREE.Vector3, range = 3.5, minDot = 0.15): NPC | null {
    let best: NPC | null = null;
    let bestScore = Infinity;
    const fwd = forward.clone().setY(0).normalize();
    for (const npc of this.npcs) {
      if (!npc.mesh.visible || npc.state === 'grabbed' || npc.mesh.userData.heldByPlayer) continue;
      if (npc.mesh.userData.specialInteractionActive) continue;
      const delta = npc.mesh.position.clone().sub(origin);
      const vertical = Math.abs(delta.y);
      delta.y = 0;
      const distance = delta.length();
      // Fallen ragdolls are physically lower/wider than standing NPCs, so allow a
      // little more vertical tolerance without increasing the forward attack range.
      const downed = this.isDeadBody(npc) || npc.state === 'knocked_out' || npc.state === 'recovering' || npc.state === 'kicked';
      if (this.isPedestrianTransitCritical(npc) && !downed) continue;
      if (distance <= 0.01 || distance > range || vertical > (downed ? 3.1 : 2.7)) continue;
      const dot = delta.normalize().dot(fwd);
      if (dot < minDot) continue;
      const score = distance - dot * 0.7;
      if (score < bestScore) {
        bestScore = score;
        best = npc;
      }
    }
    return best;
  }

  public getNPCsInRadius(center: THREE.Vector3, radius: number): NPC[] {
    const r2 = radius * radius;
    return this.npcs.filter((npc) => npc.mesh.visible && npc.mesh.position.distanceToSquared(center) <= r2);
  }

  /** Cheap previous-tick spatial query used by moving props. The returned array is
   * shared scratch storage and must be consumed immediately by the caller. */
  public getNPCsNearPhysicalImpact(center: THREE.Vector3, radius: number): NPC[] {
    return this.queryNearbyPhysicalNPCs(center, radius);
  }

  private canReceiveSecondaryImpact(npc: NPC): boolean {
    if (npc.state === 'grabbed') return false;
    if (npc.mesh.userData.heldByPlayer || npc.mesh.userData.specialInteractionActive) return false;
    return true;
  }

  private acceptSecondaryImpactPair(sourceId: string, targetId: string, now: number, cooldown = 0.20): boolean {
    const key = `${sourceId}->${targetId}`;
    if ((this.secondaryImpactPairCooldowns.get(key) ?? 0) > now) return false;
    this.secondaryImpactPairCooldowns.set(key, now + cooldown);

    // Lazy cleanup keeps the hot collision path allocation-free in normal play.
    if (now >= this.secondaryImpactCleanupAt || this.secondaryImpactPairCooldowns.size > 640) {
      this.secondaryImpactCleanupAt = now + 2.0;
      for (const [pair, expires] of this.secondaryImpactPairCooldowns) {
        if (expires <= now) this.secondaryImpactPairCooldowns.delete(pair);
      }
    }
    return true;
  }

  /** Force-aware reaction used by thrown NPCs and moving world props. It deliberately
   * feeds back into the SAME ragdoll/recovery/aggression systems as ordinary attacks:
   * soft momentum produces a body stumble, while enough transferred momentum enters
   * the existing kicked -> landing -> dramatic recovery lifecycle. */
  public applySecondaryImpact(npc: NPC, options: SecondaryImpactOptions): SecondaryImpactReaction {
    if (!this.canReceiveSecondaryImpact(npc)) return 'none';

    const now = performance.now() * 0.001;
    if (!this.acceptSecondaryImpactPair(options.sourceId, npc.id, now)) return 'none';

    const sourceMass = THREE.MathUtils.clamp(options.sourceMass, 0.18, 4.5);
    const targetMass = Math.max(0.45, npc.combatWeight ?? npc.mesh.userData.combatWeight ?? 1);
    const relativeVelocity = this.secondaryImpactScratchVelocity.copy(options.velocity);
    if (npc.state === 'kicked' && npc.kickedVelocity) relativeVelocity.sub(npc.kickedVelocity);

    const horizontalSpeed = Math.hypot(relativeVelocity.x, relativeVelocity.z);
    const effectiveSpeed = horizontalSpeed + Math.abs(relativeVelocity.y) * 0.34;
    const massRatio = THREE.MathUtils.clamp(sourceMass / targetMass, 0.16, 5.0);
    // Square-root mass scaling keeps heavy poles/fences meaningful without letting
    // one huge object turn a street into an exponential chain explosion.
    const impactScore = effectiveSpeed * Math.sqrt(massRatio);
    if (impactScore < 0.85) return 'none';

    const direction = this.secondaryImpactScratchDirection.copy(options.velocity).setY(0);
    if (direction.lengthSq() < 0.02) direction.copy(npc.mesh.position).sub(options.sourcePosition).setY(0);
    if (direction.lengthSq() < 0.001) direction.set(0, 0, 1);
    direction.normalize();

    if (options.playerCaused && impactScore >= 2.0) {
      this.rememberPlayerAggression(npc, options.sourcePosition);
    }

    const contact = options.contactPoint?.clone() ?? npc.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const wasDown = this.isDeadBody(npc) || npc.state === 'kicked' || npc.state === 'knocked_out' || npc.state === 'recovering';
    const preserveKnockout = (npc.combatHp ?? 1) <= 0 || !!npc.mesh.userData.noRecover;
    if (wasDown) {
      // Even a small moving-object/body contact postpones the get-up beat. Stronger
      // contacts below re-launch the ragdoll entirely; soft contacts simply keep the
      // NPC down until the collision has genuinely settled.
      npc.mesh.userData.recoveryImpactHoldUntil = Math.max(
        Number(npc.mesh.userData.recoveryImpactHoldUntil ?? 0),
        now + THREE.MathUtils.clamp(0.18 + impactScore * 0.018, 0.20, 0.42)
      );
    }

    // Bodies already on the floor do not get to start standing while another impact
    // is still moving them. A meaningful new hit returns them to ragdoll motion; a
    // tiny nudge merely postpones the get-up beat and slides them slightly.
    if (wasDown) {
      if (impactScore < 3.4) {
        if (npc.state === 'recovering') {
          npc.mesh.userData.recoveryElapsed = Math.max(0, Number(npc.mesh.userData.recoveryElapsed ?? 0) - 0.36);
          npc.mesh.userData.recoveryDuration = Math.max(Number(npc.mesh.userData.recoveryDuration ?? 2.8), 2.8);
        }
        const slide = THREE.MathUtils.clamp(0.035 + impactScore * 0.018, 0.05, 0.13);
        const candidate = npc.mesh.position.clone().addScaledVector(direction, slide);
        candidate.y = this.groundHeight(candidate.x, candidate.z, npc.mesh.position.y);
        if (this.canOccupy(candidate, 0.42, 1.0)) npc.mesh.position.copy(candidate);
        this.spawnImpactBurst(contact, 0xffe7a8, 0.48);
        this.syncNPCPosition(npc);
        return 'flinch';
      }

      const existing = npc.kickedVelocity?.clone() ?? new THREE.Vector3();
      const horizontal = THREE.MathUtils.clamp(3.6 + impactScore * 0.48, 4.2, 13.5);
      const vertical = THREE.MathUtils.clamp(4.5 + impactScore * 0.10, 4.5, 7.0);
      npc.mesh.userData.pendingKnockout = preserveKnockout;
      this.launchNPC(npc, direction, horizontal, vertical);
      if (npc.kickedVelocity && existing.lengthSq() > 0.01) {
        npc.kickedVelocity.addScaledVector(existing, 0.28);
        const planar = Math.hypot(npc.kickedVelocity.x, npc.kickedVelocity.z);
        if (planar > 22) {
          const s = 22 / planar;
          npc.kickedVelocity.x *= s;
          npc.kickedVelocity.z *= s;
        }
      }
      npc.mesh.userData.pendingKnockout = preserveKnockout;
      this.spawnImpactBurst(contact, 0xffd36a, Math.min(1.15, 0.58 + impactScore * 0.035));
      if (impactScore >= 7.5) playSoundEffect('crash', contact);
      return impactScore >= 10.5 ? 'knockdown' : 'fall';
    }

    // Low force: visible flinch + one physical step, not a full ragdoll.
    if (impactScore < 5.2) {
      const pushDistance = THREE.MathUtils.clamp(0.055 + impactScore * 0.038, 0.08, 0.25);
      const moved = this.pushNPCFromPlayer(npc, options.sourcePosition, direction, pushDistance);
      npc.mesh.userData.bodyPushTimer = Math.max(Number(npc.mesh.userData.bodyPushTimer ?? 0), 0.34 + impactScore * 0.025);
      if (!moved) {
        npc.mesh.userData.bodyPushLeanSide = Math.sign(
          direction.x * Math.cos(npc.mesh.rotation.y) - direction.z * Math.sin(npc.mesh.rotation.y)
        ) || 1;
      }
      this.spawnImpactBurst(contact, 0xfff0b8, 0.42 + impactScore * 0.035);
      return 'flinch';
    }

    // Medium force begins as a strong stagger. The upper half of the band loses
    // balance completely and enters the normal ragdoll/get-up sequence.
    if (impactScore < 7.4) {
      const pushDistance = THREE.MathUtils.clamp(0.24 + (impactScore - 5.2) * 0.11, 0.24, 0.50);
      this.pushNPCFromPlayer(npc, options.sourcePosition, direction, pushDistance);
      npc.mesh.userData.bodyPushTimer = Math.max(Number(npc.mesh.userData.bodyPushTimer ?? 0), 0.58);
      this.spawnImpactBurst(contact, 0xffdd83, 0.72);
      if (Number(npc.mesh.userData.secondaryImpactSpeechAt ?? 0) <= now) {
        npc.mesh.userData.secondaryImpactSpeechAt = now + 2.2;
        this.say(npc, ['OOF!', 'WHOA!', 'WATCH IT!'][Math.floor(Math.random() * 3)], 1.15);
      }
      return 'stumble';
    }

    const high = impactScore >= 10.5;
    npc.mesh.userData.pendingKnockout = false;
    const horizontalForce = high
      ? THREE.MathUtils.clamp(7.6 + (impactScore - 10.5) * 0.66, 7.6, 18.5)
      : THREE.MathUtils.clamp(5.0 + (impactScore - 7.4) * 0.62, 5.0, 8.4);
    const verticalForce = high
      ? THREE.MathUtils.clamp(6.0 + (impactScore - 10.5) * 0.22, 6.0, 9.8)
      : THREE.MathUtils.clamp(4.7 + (impactScore - 7.4) * 0.22, 4.7, 5.8);
    this.launchNPC(npc, direction, horizontalForce, verticalForce);
    npc.mesh.userData.pendingKnockout = false;
    this.spawnImpactBurst(contact, high ? 0xffc34d : 0xffd977, high ? 1.18 : 0.90);
    playSoundEffect(high ? 'crash' : 'kick', contact);
    if (Number(npc.mesh.userData.secondaryImpactSpeechAt ?? 0) <= now) {
      npc.mesh.userData.secondaryImpactSpeechAt = now + 2.6;
      this.say(npc, high ? ['OOF—!', 'I GOT HIT BY A PERSON?!', 'NOT THE CHAIN REACTION!'][Math.floor(Math.random() * 3)] : 'WHOA!', high ? 1.55 : 1.1);
    }
    return high ? 'knockdown' : 'fall';
  }

  /** Any NPC in the world can be grabbed and thrown by the player! */
  public canPlayerGrab(npc: NPC): boolean {
    if (!npc || !npc.mesh || !npc.mesh.visible) return false;
    if (npc.state === 'defeated' || npc.state === 'grabbed') return false;
    // Don't grab the toothless mount while riding it or the boss defender
    if (npc.id === 'cameo_toothless' || npc.id === 'ash_defender_charizard') return false;
    return true;
  }

  public beginPlayerGrab(npc: NPC): boolean {
    if (!this.canPlayerGrab(npc)) return false;
    npc.mesh.userData.grabPreviousState = npc.state;
    npc.mesh.userData.grabOriginalRotation = [npc.mesh.rotation.x, npc.mesh.rotation.y, npc.mesh.rotation.z];
    npc.mesh.userData.specialInteractionActive = true;
    npc.mesh.userData.heldByPlayer = true;
    this.clearPedestrianRoute(npc);
    if (npc.kickedVelocity) npc.kickedVelocity.set(0, 0, 0);
    npc.state = 'grabbed';
    npc.walkTimer = 0;
    const phrases = ['HEY!', 'PUT ME DOWN!', 'WHAT ARE YOU DOING?!', 'WHOA!', 'LET GO!', 'HEY WATCH IT!'];
    this.say(npc, phrases[Math.floor(Math.random() * phrases.length)], 1.6);
    return true;
  }

  /** Safe non-violent drop used by death/reset cleanup. */
  public releaseGrabbedNPC(npc: NPC, position?: THREE.Vector3): void {
    npc.mesh.userData.specialInteractionActive = false;
    npc.mesh.userData.heldByPlayer = false;
    const original = npc.mesh.userData.grabOriginalRotation as number[] | undefined;
    npc.mesh.rotation.set(0, original?.[1] ?? npc.mesh.rotation.y, 0);
    if (position) {
      npc.mesh.position.copy(position);
      npc.mesh.position.y = this.groundHeight(position.x, position.z, position.y);
    } else {
      npc.mesh.position.y = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y);
    }
    npc.state = 'idle';
    npc.walkTimer = 0.45 + Math.random() * 0.75;
    delete npc.mesh.userData.grabPreviousState;
    delete npc.mesh.userData.grabOriginalRotation;
    this.syncNPCPosition(npc);
  }

  /** Soccer-throw-in style release. Uses the same bounded airborne recovery as kicks. */
  public throwGrabbedNPC(npc: NPC, source: THREE.Vector3, direction: THREE.Vector3): void {
    npc.mesh.userData.specialInteractionActive = false;
    npc.mesh.userData.heldByPlayer = false;
    delete npc.mesh.userData.grabPreviousState;
    delete npc.mesh.userData.grabOriginalRotation;
    npc.mesh.rotation.x = 0;
    npc.mesh.rotation.z = 0;
    this.rememberPlayerAggression(npc, source);
    npc.mesh.userData.playerImpactCreditUntil = performance.now() * 0.001 + 4.0;
    this.launchNPC(npc, direction, 17.5, 9.4);
    this.spawnImpactBurst(npc.mesh.position.clone().add(new THREE.Vector3(0, 0.85, 0)), 0xffe082, 0.82);
    this.say(npc, ['WHEEEE?!', 'I AM NOT A BALL!', 'PUT ME—AAAAH!'][Math.floor(Math.random() * 3)], 1.9);
  }

  /**
   * Soft character-body collision. The player cannot ghost through an NPC, but a
   * normal pedestrian yields a little and stumbles instead of becoming an
   * immovable concrete cylinder. Returns true when the NPC was actually moved.
   */
  public pushNPCFromPlayer(
    npc: NPC,
    playerPos: THREE.Vector3,
    direction: THREE.Vector3,
    distance: number,
    allowStationary = false,
  ): boolean {
    if (!npc.mesh.visible || npc.state === 'kicked' || npc.state === 'knocked_out' || npc.state === 'recovering' || npc.state === 'defeated') return false;
    if (npc.movementMode === 'flying' || npc.movementMode === 'swimming' || npc.mesh.userData.specialInteractionActive) return false;
    if (npc.mesh.userData.stationary && !allowStationary) return false;

    const dir = direction.clone().setY(0);
    if (dir.lengthSq() < 0.0001) dir.copy(npc.mesh.position).sub(playerPos).setY(0);
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
    dir.normalize();
    const shove = THREE.MathUtils.clamp(distance, 0.035, 0.42);

    const tryMove = (moveDir: THREE.Vector3, scale = 1) => {
      const candidate = npc.mesh.position.clone().addScaledVector(moveDir, shove * scale);
      candidate.y = this.groundHeight(candidate.x, candidate.z, npc.mesh.position.y);
      if (!this.canOccupy(candidate, 0.46, 1.72)) return false;
      npc.mesh.position.copy(candidate);
      this.syncNPCPosition(npc);
      return true;
    };

    let moved = tryMove(dir);
    if (!moved) {
      // If a wall is directly behind the NPC, try sliding them sideways rather than
      // pinning them permanently between the player and architecture.
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      moved = tryMove(side, 0.72) || tryMove(side.multiplyScalar(-1), 0.72);
    }
    if (!moved) return false;

    npc.mesh.userData.bodyPushTimer = 0.32;
    npc.mesh.userData.bodyPushLeanSide = Math.sign(dir.x * Math.cos(npc.mesh.rotation.y) - dir.z * Math.sin(npc.mesh.rotation.y)) || 1;
    this.clearPedestrianRoute(npc);
    if (npc.state !== 'panicking') npc.state = 'idle';
    npc.walkTimer = Math.max(npc.walkTimer ?? 0, 0.22);
    return true;
  }

  /** Collision transfer for an airborne/thrown NPC. Only the small spatial bucket
   * around the moving ragdoll is inspected, and detailed force math runs only after
   * body volumes actually overlap. */
  private resolveThrownNPCSecondaryImpact(source: NPC): SecondaryImpactReaction {
    if (source.state !== 'kicked' || !source.kickedVelocity) return 'none';
    const incomingSpeed = source.kickedVelocity.length();
    if (incomingSpeed < 1.0) return 'none';

    const sourceRadius = THREE.MathUtils.clamp(this.getNPCBodyRadius(source) * 1.25, 0.55, 0.76);
    const neighbors = this.queryNearbyPhysicalNPCs(source.mesh.position, sourceRadius + 1.35);
    // A tumbling humanoid rotates around its authored root, so a narrow standing-only
    // Y interval misses chest/shoulder hits while the model is horizontal. Use a
    // conservative ragdoll envelope that still rejects clearly over/under contacts.
    const sourceBottom = source.mesh.position.y - 0.82;
    const sourceTop = source.mesh.position.y + 1.58;
    const now = performance.now() * 0.001;

    for (const target of neighbors) {
      if (target === source || !this.canReceiveSecondaryImpact(target)) continue;
      const targetRagdoll = target.state === 'kicked';
      const targetDown = this.isDeadBody(target) || targetRagdoll || target.state === 'knocked_out' || target.state === 'recovering';
      const targetBottom = target.mesh.position.y - (targetRagdoll ? 0.82 : 0.04);
      const targetTop = target.mesh.position.y + (targetRagdoll ? 1.58 : targetDown ? 0.82 : 1.82);
      if (sourceTop < targetBottom || sourceBottom > targetTop) continue;

      const dx = target.mesh.position.x - source.mesh.position.x;
      const dz = target.mesh.position.z - source.mesh.position.z;
      const targetRadius = this.getNPCBodyRadius(target);
      const contactDistance = sourceRadius + targetRadius + 0.06;
      const distSq = dx * dx + dz * dz;
      if (distSq > contactDistance * contactDistance) continue;

      const normal = new THREE.Vector3(dx, 0, dz);
      if (normal.lengthSq() < 0.0001) {
        normal.copy(source.kickedVelocity).setY(0);
        if (normal.lengthSq() < 0.0001) normal.set(0, 0, 1);
      }
      normal.normalize();
      const closingSpeed = source.kickedVelocity.x * normal.x + source.kickedVelocity.z * normal.z;
      // Do not create impacts merely because two bodies remain touching while the
      // thrown NPC is already travelling away/tangentially from the target.
      if (closingSpeed < 0.55 && distSq > Math.pow(contactDistance * 0.72, 2)) continue;

      const sourceMass = Math.max(0.45, source.combatWeight ?? source.mesh.userData.combatWeight ?? 1);
      const contactPoint = source.mesh.position.clone().lerp(target.mesh.position, 0.5).add(new THREE.Vector3(0, 0.82, 0));
      const reaction = this.applySecondaryImpact(target, {
        sourceId: `npc:${source.id}`,
        sourceKind: 'npc',
        sourcePosition: source.mesh.position,
        velocity: source.kickedVelocity,
        sourceMass,
        contactPoint,
        playerCaused: now < Number(source.mesh.userData.playerImpactCreditUntil ?? 0),
      });
      if (reaction === 'none') continue;

      // Newton-ish but intentionally damped: momentum transfers into the victim,
      // while the thrown body loses energy and can ricochet/tumble instead of
      // continuing through a whole crowd unchanged.
      const transfer = reaction === 'knockdown' ? 0.46 : reaction === 'fall' ? 0.38 : reaction === 'stumble' ? 0.30 : 0.22;
      const retain = reaction === 'knockdown' ? 0.58 : reaction === 'fall' ? 0.66 : reaction === 'stumble' ? 0.74 : 0.82;
      if (closingSpeed > 0) source.kickedVelocity.addScaledVector(normal, -closingSpeed * transfer);
      source.kickedVelocity.x *= retain;
      source.kickedVelocity.z *= retain;
      source.kickedVelocity.y *= 0.88;
      source.mesh.userData.ragdollSpinX = Number(source.mesh.userData.ragdollSpinX ?? 7) * 1.08;
      source.mesh.userData.ragdollSpinZ = Number(source.mesh.userData.ragdollSpinZ ?? 9) * 1.10;

      const penetration = contactDistance - Math.sqrt(Math.max(0.000001, distSq));
      if (penetration > 0) {
        source.mesh.position.addScaledVector(normal, -Math.min(0.16, penetration * 0.65));
      }
      return reaction;
    }
    return 'none';
  }

  private launchNPC(npc: NPC, direction: THREE.Vector3, horizontalForce: number, verticalForce: number) {
    const preserveDeadBody = this.isDeadBody(npc);
    if (preserveDeadBody) this.markDeadBody(npc);
    this.clearPedestrianRoute(npc);
    npc.state = 'kicked';
    npc.mesh.userData.bounceCount = 0;
    npc.mesh.userData.airborneSeconds = 0;
    npc.mesh.userData.recoveryElapsed = 0;
    npc.mesh.userData.recoveryDuration = 0;
    npc.mesh.userData.recoveryFromKnockout = false;
    npc.mesh.userData.recoveryImpactHoldUntil = 0;
    npc.mesh.userData.spinDirection = Math.random() > 0.5 ? 1 : -1;
    const spin = Number(npc.mesh.userData.spinDirection);
    npc.mesh.userData.ragdollSpinX = (5.8 + Math.random() * 5.2) * (Math.random() > 0.35 ? 1 : -1);
    npc.mesh.userData.ragdollSpinY = (2.8 + Math.random() * 5.0) * spin;
    npc.mesh.userData.ragdollSpinZ = (7.0 + Math.random() * 6.5) * spin;
    npc.mesh.userData.ragdollFlailPhase = Math.random() * Math.PI * 2;
    npc.mesh.userData.wallImpactCooldown = 0;

    const ground = this.groundHeight(npc.mesh.position.x, npc.mesh.position.z, npc.mesh.position.y, 120, 0.12);
    if (npc.mesh.position.y < ground) {
      npc.mesh.position.y = ground;
    }
    if (this.recoverPenetration && !this.canOccupy(npc.mesh.position, 0.42, 1.55)) {
      const rec = this.recoverPenetration(npc.mesh.position, 0.42, 1.55);
      npc.mesh.position.x = rec.x;
      npc.mesh.position.z = rec.z;
    }

    if (!npc.kickedVelocity) npc.kickedVelocity = new THREE.Vector3();
    const dir = direction.clone();
    dir.y = 0;
    if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
    dir.normalize();
    const weight = Math.max(0.45, npc.combatWeight ?? npc.mesh.userData.combatWeight ?? 1);
    const forceScale = 1 / Math.sqrt(weight);
    // Preserve the exaggerated Hit & Run launch, but put a hard ceiling on corrupt
    // impulses so ordinary combat can never accelerate somebody into orbit.
    const horizontalSpeed = THREE.MathUtils.clamp(horizontalForce * forceScale, 4, 32);
    const verticalSpeed = THREE.MathUtils.clamp(verticalForce * Math.max(0.55, forceScale), 4.5, 15.5);
    npc.kickedVelocity.set(
      dir.x * horizontalSpeed,
      verticalSpeed,
      dir.z * horizontalSpeed
    );
    // Callers such as blast/electric/power attacks may set their own pending state.
    // A corpse is the exception: every relaunch must land back in the permanent
    // downed state rather than accidentally entering the living recovery sequence.
    if (preserveDeadBody) npc.mesh.userData.pendingKnockout = true;
  }

  public applyMeleeHit(npc: NPC, options: MeleeHitOptions) {
    const wasDeadBody = this.isDeadBody(npc);
    if (options.attackerName && !wasDeadBody) {
      this.rememberPlayerAggression(npc, options.source);
      npc.mesh.userData.playerImpactCreditUntil = performance.now() * 0.001 + 4.0;
    }
    const weight = Math.max(0.45, npc.combatWeight ?? 1);
    if (!wasDeadBody) {
      const damage = Math.max(1, Math.round(options.damage / Math.pow(weight, 0.12)));
      npc.combatHp = Math.max(0, (npc.combatHp ?? npc.combatMaxHp ?? 100) - damage);
    }
    const knockedOut = wasDeadBody || (npc.combatHp ?? 1) <= 0;
    if (knockedOut) this.markDeadBody(npc);
    npc.mesh.userData.pendingKnockout = knockedOut;

    if (options.playImpactSound !== false) playSoundEffect('kick', npc.mesh.position);
    this.spawnImpactBurst(
      npc.mesh.position.clone().add(new THREE.Vector3(0, 1.15, 0)),
      options.color ?? 0xffd54f,
      options.style === 'uppercut' || options.style === 'slam' ? 1.45 : 1
    );

    const horizontal = options.horizontalForce * (knockedOut ? 1.28 : 1);
    const vertical = options.verticalForce * (knockedOut ? 1.22 : 1);
    this.launchNPC(npc, options.direction, horizontal, vertical);

    if (!knockedOut) {
      const attackWord = options.style === 'uppercut' ? 'UPPERCUT?!' : options.style === 'tail' ? 'THE TAIL?!' : HIT_LINES[Math.floor(Math.random() * HIT_LINES.length)];
      this.say(npc, attackWord, 1.8);
    }
  }

  public kickNPC(npc: NPC, playerYaw: number, power = 16) {
    const direction = new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw));
    this.applyMeleeHit(npc, {
      source: npc.mesh.position.clone().addScaledVector(direction, -1),
      direction,
      horizontalForce: power,
      verticalForce: Math.max(7, power * 0.55),
      damage: Math.round(power * 2.1),
      style: 'kick',
      color: 0xffd54f,
    });
  }

  public blastNPC(npc: NPC, center: THREE.Vector3, power = 20, vertical = 10, recordPlayerAggression = false) {
    if (recordPlayerAggression) {
      this.rememberPlayerAggression(npc, center);
      npc.mesh.userData.playerImpactCreditUntil = performance.now() * 0.001 + 4.0;
    }
    const direction = npc.mesh.position.clone().sub(center).setY(0);
    npc.mesh.userData.pendingKnockout = false;
    this.launchNPC(npc, direction, power, vertical);
    this.spawnImpactBurst(npc.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9ad7ff, 0.9);
    this.say(npc, ['AAAAAH!', 'WHAT EVEN WAS THAT?!', 'I AM FLYING!', 'NOT AGAIN!'][Math.floor(Math.random() * 4)], 2.0);
  }

  public applyWaterHit(npc: NPC, sourcePos?: THREE.Vector3): boolean {
    if (sourcePos) this.rememberPlayerAggression(npc, sourcePos);
    const extinguished = (npc.mesh.userData.burnTimer ?? 0) > 0;
    if (extinguished) {
      npc.mesh.userData.burnTimer = 0;
      npc.mesh.userData.burnTickTimer = 0;
      this.removeFireStatusEffect(npc);
      this.say(npc, ['PHEW!', 'THANK YOU!', 'I WAS LITERALLY ON FIRE!', 'STEAMY!'][Math.floor(Math.random() * 4)], 1.8);
    }

    npc.isWet = true;
    npc.mesh.userData.wetness = Math.min(1, (npc.mesh.userData.wetness ?? 0) + 0.18);
    npc.mesh.userData.wetTimer = 8;
    if (npc.state !== 'kicked' && npc.state !== 'knocked_out') {
      npc.state = 'panicking';
      npc.mesh.userData.stateTimer = 2.5 + Math.random() * 2.5;
      if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
      if (sourcePos) npc.walkDirection.copy(npc.mesh.position).sub(sourcePos).setY(0).normalize();
    }
    if (!extinguished && Math.random() < 0.06) {
      this.say(npc, ["HEY! MY CLOTHES!", 'STOP THAT!', 'WHY IS A POLIWAG ARMED?!', 'I AM SOAKED!'][Math.floor(Math.random() * 4)], 2.0);
    }
    npc.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        if (!obj.userData.wetOriginalColor) obj.userData.wetOriginalColor = obj.material.color.getHex();
        obj.material.color.lerp(new THREE.Color(0x2f4858), 0.025);
        obj.material.roughness = Math.max(0.15, obj.material.roughness * 0.98);
      }
    });
    return extinguished;
  }

  public applyFireHit(npc: NPC, sourcePos?: THREE.Vector3): boolean {
    if (sourcePos) this.rememberPlayerAggression(npc, sourcePos);
    if (npc.state === 'defeated') return false;
    const wasBurning = (npc.mesh.userData.burnTimer ?? 0) > 0;
    npc.mesh.userData.burnTimer = Math.max(npc.mesh.userData.burnTimer ?? 0, 5.5);
    npc.mesh.userData.burnTickTimer = Math.min(npc.mesh.userData.burnTickTimer ?? 0, 0.15);
    npc.isWet = false;
    npc.mesh.userData.wetTimer = 0;
    if (npc.state !== 'kicked' && npc.state !== 'knocked_out') {
      npc.state = 'panicking';
      npc.mesh.userData.stateTimer = 4.5;
      if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
      if (sourcePos) npc.walkDirection.copy(npc.mesh.position).sub(sourcePos).setY(0).normalize();
    }
    if (!wasBurning) {
      this.ensureFireStatusEffect(npc);
      this.spawnImpactBurst(npc.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 0xff6a00, 0.95);
      this.say(npc, ['I AM ON FIRE!', 'AAAAH! FIRE!', 'WHY AM I BURNING?!', 'SOMEBODY GET WATER!'][Math.floor(Math.random() * 4)], 2.1);
    }
    return !wasBurning;
  }

  public applyElectricHit(npc: NPC, sourcePos: THREE.Vector3) {
    this.rememberPlayerAggression(npc, sourcePos);
    const dir = npc.mesh.position.clone().sub(sourcePos).setY(0).normalize();
    npc.mesh.userData.electricTimer = 0.75;
    this.ensureElectricStatusEffect(npc);
    npc.combatHp = Math.max(0, (npc.combatHp ?? npc.combatMaxHp ?? 100) - 18);
    npc.mesh.userData.pendingKnockout = (npc.combatHp ?? 1) <= 0;
    this.launchNPC(npc, dir, 9.5, 7.2);
    this.spawnImpactBurst(npc.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), 0xffee35, 1.05);
    this.say(npc, ['ZZZT!', 'MY HAIR!', 'OW! ELECTRIC MOUSE!', 'I CAN TASTE COLOURS!'][Math.floor(Math.random() * 4)], 1.8);
  }

  public panicNear(center: THREE.Vector3, radius: number, reason: 'fire' | 'crash' | 'police' = 'fire') {
    for (const npc of this.getNPCsInRadius(center, radius)) {
      if (this.isDeadBody(npc) || npc.state === 'kicked' || npc.state === 'knocked_out') continue;
      npc.state = 'panicking';
      npc.mesh.userData.stateTimer = 3 + Math.random() * 3;
      if (!npc.walkDirection) npc.walkDirection = new THREE.Vector3();
      npc.walkDirection.copy(npc.mesh.position).sub(center).setY(0).normalize();
      if (Math.random() < 0.18) {
        const text = reason === 'fire' ? 'FIRE! RUN!' : reason === 'police' ? 'THE COPS!' : 'WHAT WAS THAT?!';
        this.say(npc, text, 1.8);
      }
    }
  }

  public spawnEjectedDriver(position: THREE.Vector3, carYaw: number, name = 'Angry Driver'): NPC {
    const side = new THREE.Vector3(Math.cos(carYaw), 0, -Math.sin(carYaw));
    const spawn = position.clone().addScaledVector(side, 1.8);
    const npc = this.addNPC({
      id: `driver_${this.idCounter++}`,
      name,
      type: 'citizen',
      pos: [spawn.x, this.groundHeight(spawn.x, spawn.z, position.y), spawn.z],
      dialogues: ['MY CAR!', 'HEY! COME BACK!', 'A POKÉMON STOLE MY CAR!'],
      modelFactory: createYoungsterJoeyNPC,
      bounds: { minX: spawn.x - 35, maxX: spawn.x + 35, minZ: spawn.z - 35, maxZ: spawn.z + 35 },
    });
    this.say(npc, 'MY CAR!', 2.5);
    this.launchNPC(npc, side, 7.5, 6.5);
    return npc;
  }
}
