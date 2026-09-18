import * as THREE from 'three';
import { createMaterial } from './models';

/**
 * Creates the entire Simpson family (Homer, Marge, Bart, Lisa, Maggie)
 * gathered together sitting on the living room couch watching television,
 * accompanied by Santa's Little Helper (dog) and Snowball II (cat).
 */
export function createSimpsonsFamilyOnCouch(): THREE.Group {
  const familyGroup = new THREE.Group();
  familyGroup.name = 'simpsons_family_on_couch';

  // Shared Simpson palette materials
  const yellowSkinMat = createMaterial(0xfad02c, 0.4); // Iconic Simpson yellow
  const homerWhiteMat = createMaterial(0xffffff, 0.5);
  const homerBluePantsMat = createMaterial(0x1565c0, 0.6);
  const homerMuzzleMat = createMaterial(0xd7ccc8, 0.85); // 5 o'clock shadow
  const margeGreenDressMat = createMaterial(0x7cb342, 0.5);
  const margeBlueHairMat = createMaterial(0x1976d2, 0.7); // Tall blue beehive
  const margeRedNecklaceMat = createMaterial(0xd32f2f, 0.2);
  const bartRedShirtMat = createMaterial(0xe53935, 0.5);
  const bartBlueShortsMat = createMaterial(0x1e88e5, 0.5);
  const lisaRedDressMat = createMaterial(0xe53935, 0.5);
  const lisaNecklaceMat = createMaterial(0xffffff, 0.2);
  const maggieBlueMat = createMaterial(0x42a5f5, 0.5);
  const maggiePacifierMat = createMaterial(0xd32f2f, 0.2);
  const eyeWhiteMat = createMaterial(0xffffff, 0.3);
  const pupilBlackMat = createMaterial(0x111111, 0.3);
  const brownShoeMat = createMaterial(0x5d4037, 0.6);
  const dogBrownMat = createMaterial(0x8d6e63, 0.7);
  const catBlackMat = createMaterial(0x212121, 0.4);
  const pinkDonutMat = createMaterial(0xf48fb1, 0.3);
  const duffBeerMat = createMaterial(0x0288d1, 0.3, 0.7);
  const goldSaxMat = createMaterial(0xffd700, 0.15, 0.9);
  const remoteBlackMat = createMaterial(0x263238, 0.3);

  // =========================================================================
  // 1. HOMER SIMPSON (Sitting on Left side of couch, X = -1.1)
  // White collared shirt, big belly, blue pants, Duff beer & donut, looking at TV!
  // =========================================================================
  const homerGroup = new THREE.Group();
  homerGroup.name = 'sitting_homer';
  homerGroup.position.set(-1.1, 0.7, 0.0);

  // Blue pants sitting on seat cushion
  const hSeatPants = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.65), homerBluePantsMat);
  hSeatPants.position.set(0, 0.05, 0);

  // Legs bent over the front of the couch
  const hLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.45, 8), homerBluePantsMat);
  hLegL.position.set(-0.2, -0.22, 0.36);
  const hLegR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.45, 8), homerBluePantsMat);
  hLegR.position.set(0.2, -0.22, 0.36);
  const hShoeL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), brownShoeMat);
  hShoeL.position.set(-0.2, -0.42, 0.42);
  const hShoeR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), brownShoeMat);
  hShoeR.position.set(0.2, -0.42, 0.42);
  homerGroup.add(hSeatPants, hLegL, hLegR, hShoeL, hShoeR);

  // Homer's iconic round belly and white shirt
  const hBellyGeo = new THREE.SphereGeometry(0.48, 10, 10);
  hBellyGeo.scale(1.15, 1.25, 1.2);
  const hBelly = new THREE.Mesh(hBellyGeo, homerWhiteMat);
  hBelly.position.set(0, 0.58, -0.05);
  homerGroup.add(hBelly);

  // Homer's yellow head & bald dome
  const hHead = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.45, 10), yellowSkinMat);
  hHead.position.set(0, 1.15, -0.02);
  const hDome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), yellowSkinMat);
  hDome.position.set(0, 1.38, -0.02);
  homerGroup.add(hHead, hDome);

  // Homer's 5 o'clock shadow tan muzzle
  const hMuzzleGeo = new THREE.SphereGeometry(0.22, 8, 8);
  hMuzzleGeo.scale(1.1, 0.85, 1.25);
  const hMuzzle = new THREE.Mesh(hMuzzleGeo, homerMuzzleMat);
  hMuzzle.position.set(0, 1.05, 0.18);
  homerGroup.add(hMuzzle);

  // Big cartoon eyes staring at TV screen
  const hEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeWhiteMat);
  hEyeL.position.set(-0.1, 1.25, 0.22);
  const hEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeWhiteMat);
  hEyeR.position.set(0.1, 1.25, 0.22);
  const hPupilL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), pupilBlackMat);
  hPupilL.position.set(-0.1, 1.25, 0.32);
  const hPupilR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), pupilBlackMat);
  hPupilR.position.set(0.1, 1.25, 0.32);
  homerGroup.add(hEyeL, hEyeR, hPupilL, hPupilR);

  // 2 curved hair strands arching over bald head
  const hairStrand1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 4, 12, Math.PI * 0.8), pupilBlackMat);
  hairStrand1.position.set(0, 1.55, -0.02);
  hairStrand1.rotation.y = Math.PI / 2;
  hairStrand1.rotation.x = -Math.PI / 6;
  const hairStrand2 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 4, 12, Math.PI * 0.8), pupilBlackMat);
  hairStrand2.position.set(0, 1.57, -0.06);
  hairStrand2.rotation.y = Math.PI / 2;
  hairStrand2.rotation.x = -Math.PI / 6;
  homerGroup.add(hairStrand1, hairStrand2);

  // Left Arm resting on couch arm, holding Duff Beer can
  const hArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.45, 6), homerWhiteMat);
  hArmL.position.set(-0.48, 0.65, 0.1);
  hArmL.rotation.z = Math.PI / 4;
  const duffCan = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8), duffBeerMat);
  duffCan.position.set(-0.64, 0.62, 0.25);
  homerGroup.add(hArmL, duffCan);

  // Right Arm resting on belly, holding Pink Sprinkled Donut
  const hArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.4, 6), homerWhiteMat);
  hArmR.position.set(0.35, 0.58, 0.18);
  hArmR.rotation.z = -Math.PI / 4;
  const pinkDonut = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.04, 6, 12), pinkDonutMat);
  pinkDonut.position.set(0.38, 0.62, 0.35);
  pinkDonut.rotation.x = Math.PI / 4;
  homerGroup.add(hArmR, pinkDonut);

  familyGroup.add(homerGroup);

  // =========================================================================
  // 2. MARGE SIMPSON (Sitting beside Homer, X = -0.4)
  // Strapless green dress, red pearl necklace, and TALL ICONIC BLUE BEEHIVE HAIR!
  // =========================================================================
  const margeGroup = new THREE.Group();
  margeGroup.name = 'sitting_marge';
  margeGroup.position.set(-0.4, 0.7, -0.05);

  // Green strapless tube dress draped down to couch seat
  const mDressSeat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.55), margeGreenDressMat);
  mDressSeat.position.set(0, 0.05, 0);
  const mTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.75, 10), margeGreenDressMat);
  mTorso.position.set(0, 0.45, 0);
  margeGroup.add(mDressSeat, mTorso);

  // Red pearl necklace
  const mNecklace = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12), margeRedNecklaceMat);
  mNecklace.rotation.x = Math.PI / 2;
  mNecklace.position.set(0, 0.88, 0);
  margeGroup.add(mNecklace);

  // Marge's yellow head
  const mHead = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.42, 10), yellowSkinMat);
  mHead.position.set(0, 1.1, 0);
  margeGroup.add(mHead);

  // Cartoon eyes & eyelashes
  const mEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeWhiteMat);
  mEyeL.position.set(-0.08, 1.18, 0.18);
  const mEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeWhiteMat);
  mEyeR.position.set(0.08, 1.18, 0.18);
  const mPupilL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), pupilBlackMat);
  mPupilL.position.set(-0.08, 1.18, 0.27);
  const mPupilR = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), pupilBlackMat);
  mPupilR.position.set(0.08, 1.18, 0.27);

  // Red smiling lips
  const mLips = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.06), margeRedNecklaceMat);
  mLips.position.set(0, 1.0, 0.2);
  margeGroup.add(mEyeL, mEyeR, mPupilL, mPupilR, mLips);

  // TALL ICONIC BLUE BEEHIVE HAIR! (Reaching ~1.7 units high above her head)
  const beehiveCol = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 1.55, 12), margeBlueHairMat);
  beehiveCol.position.set(0, 2.05, 0);
  const beehiveTop = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), margeBlueHairMat);
  beehiveTop.position.set(0, 2.82, 0);

  // Decorative side bumps for authentic cartoon texture
  for (let b = 0; b < 6; b++) {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), margeBlueHairMat);
    const by = 1.5 + b * 0.22;
    const bx = b % 2 === 0 ? 0.24 : -0.24;
    bump.position.set(bx, by, 0);
    margeGroup.add(bump);
  }
  margeGroup.add(beehiveCol, beehiveTop);

  // Slender arms folded peacefully in lap
  const mArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 6), yellowSkinMat);
  mArmL.position.set(-0.24, 0.4, 0.12);
  mArmL.rotation.x = Math.PI / 4;
  const mArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 6), yellowSkinMat);
  mArmR.position.set(0.24, 0.4, 0.12);
  mArmR.rotation.x = Math.PI / 4;
  margeGroup.add(mArmL, mArmR);

  familyGroup.add(margeGroup);

  // =========================================================================
  // 3. MAGGIE SIMPSON (Sitting snuggled between Marge and Bart, X = 0.15)
  // Baby blue star sleep sack, baby hair bow, and bright red pacifier!
  // =========================================================================
  const maggieGroup = new THREE.Group();
  maggieGroup.name = 'sitting_maggie';
  maggieGroup.position.set(0.15, 0.7, 0.05);

  // Sky blue star sleeping sack onesie
  const mgBodyGeo = new THREE.SphereGeometry(0.26, 8, 8);
  mgBodyGeo.scale(1.1, 1.2, 0.95);
  const mgBody = new THREE.Mesh(mgBodyGeo, maggieBlueMat);
  mgBody.position.set(0, 0.2, 0);
  maggieGroup.add(mgBody);

  // Baby yellow head
  const mgHead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), yellowSkinMat);
  mgHead.position.set(0, 0.48, 0);

  // Blue ribbon bow on forehead
  const mgBow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.06), maggieBlueMat);
  mgBow.position.set(0, 0.64, 0.14);

  // Pacifier in mouth
  const mgPacifier = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8), maggiePacifierMat);
  mgPacifier.rotation.x = Math.PI / 2;
  mgPacifier.position.set(0, 0.44, 0.2);
  const mgRing = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 4, 8), maggiePacifierMat);
  mgRing.position.set(0, 0.44, 0.25);

  // Cartoon eyes
  const mgEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeWhiteMat);
  mgEyeL.position.set(-0.06, 0.52, 0.16);
  const mgEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeWhiteMat);
  mgEyeR.position.set(0.06, 0.52, 0.16);
  const mgPupilL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), pupilBlackMat);
  mgPupilL.position.set(-0.06, 0.52, 0.21);
  const mgPupilR = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), pupilBlackMat);
  mgPupilR.position.set(0.06, 0.52, 0.21);

  maggieGroup.add(mgHead, mgBow, mgPacifier, mgRing, mgEyeL, mgEyeR, mgPupilL, mgPupilR);
  familyGroup.add(maggieGroup);

  // =========================================================================
  // 4. BART SIMPSON (Sitting on couch cushion, X = 0.65)
  // Red shirt, blue shorts, 9-point spiky crown hair, holding TV remote control!
  // =========================================================================
  const bartGroup = new THREE.Group();
  bartGroup.name = 'sitting_bart';
  bartGroup.position.set(0.65, 0.7, -0.05);

  // Blue shorts sitting on couch
  const bShorts = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.48), bartBlueShortsMat);
  bShorts.position.set(0, 0.04, 0);

  // Yellow legs dangling over front edge with blue sneakers
  const bLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.35, 6), yellowSkinMat);
  bLegL.position.set(-0.14, -0.18, 0.26);
  const bLegR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.35, 6), yellowSkinMat);
  bLegR.position.set(0.14, -0.18, 0.26);
  const bSneakerL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.24), bartBlueShortsMat);
  bSneakerL.position.set(-0.14, -0.34, 0.32);
  const bSneakerR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.24), bartBlueShortsMat);
  bSneakerR.position.set(0.14, -0.34, 0.32);
  bartGroup.add(bShorts, bLegL, bLegR, bSneakerL, bSneakerR);

  // Red T-Shirt body
  const bTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.52, 8), bartRedShirtMat);
  bTorso.position.set(0, 0.38, 0);
  bartGroup.add(bTorso);

  // Yellow head
  const bHead = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.55, 8), yellowSkinMat);
  bHead.position.set(0, 0.85, 0);
  bartGroup.add(bHead);

  // 9-POINT SPIKY CROWN HAIRCUT!
  for (let i = 0; i < 9; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), yellowSkinMat);
    const angle = (i / 9) * Math.PI * 2;
    spike.position.set(Math.cos(angle) * 0.18, 1.18, Math.sin(angle) * 0.18);
    bartGroup.add(spike);
  }

  // Grinning eyes looking at TV
  const bEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeWhiteMat);
  bEyeL.position.set(-0.09, 0.92, 0.2);
  const bEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeWhiteMat);
  bEyeR.position.set(0.09, 0.92, 0.2);
  const bPupilL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), pupilBlackMat);
  bPupilL.position.set(-0.09, 0.92, 0.28);
  const bPupilR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), pupilBlackMat);
  bPupilR.position.set(0.09, 0.92, 0.28);
  bartGroup.add(bEyeL, bEyeR, bPupilL, bPupilR);

  // Right arm extended forward holding TV REMOTE CONTROL pointed at TV!
  const bArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 6), yellowSkinMat);
  bArmR.position.set(0.28, 0.45, 0.2);
  bArmR.rotation.x = Math.PI / 2.2;
  const tvRemote = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.2), remoteBlackMat);
  tvRemote.position.set(0.28, 0.5, 0.42);
  const remoteLED = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 4), maggiePacifierMat);
  remoteLED.position.set(0.28, 0.5, 0.53);
  bartGroup.add(bArmR, tvRemote, remoteLED);

  familyGroup.add(bartGroup);

  // =========================================================================
  // 5. LISA SIMPSON (Sitting on far right of couch, X = 1.15)
  // Orange-red dress, white pearl necklace, starburst hair, golden saxophone!
  // =========================================================================
  const lisaGroup = new THREE.Group();
  lisaGroup.name = 'sitting_lisa';
  lisaGroup.position.set(1.15, 0.7, -0.05);

  // Orange-red dress sitting on cushion
  const lDress = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.65, 8), lisaRedDressMat);
  lDress.position.set(0, 0.35, 0);
  lisaGroup.add(lDress);

  // White pearl necklace
  const lNecklace = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 10), lisaNecklaceMat);
  lNecklace.rotation.x = Math.PI / 2;
  lNecklace.position.set(0, 0.72, 0);
  lisaGroup.add(lNecklace);

  // Yellow head
  const lHead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), yellowSkinMat);
  lHead.position.set(0, 0.95, 0);
  lisaGroup.add(lHead);

  // 8-POINT STARBURST HAIR!
  for (let i = 0; i < 8; i++) {
    const starPoint = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), yellowSkinMat);
    const angle = (i / 8) * Math.PI * 2;
    starPoint.position.set(Math.cos(angle) * 0.24, 1.12 + Math.sin(i) * 0.05, Math.sin(angle) * 0.24);
    starPoint.rotation.z = Math.cos(angle) * 0.4;
    starPoint.rotation.x = Math.sin(angle) * 0.4;
    lisaGroup.add(starPoint);
  }

  // Cartoon eyes
  const lEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeWhiteMat);
  lEyeL.position.set(-0.09, 1.0, 0.2);
  const lEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeWhiteMat);
  lEyeR.position.set(0.09, 1.0, 0.2);
  const lPupilL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), pupilBlackMat);
  lPupilL.position.set(-0.09, 1.0, 0.28);
  const lPupilR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), pupilBlackMat);
  lPupilR.position.set(0.09, 1.0, 0.28);
  lisaGroup.add(lEyeL, lEyeR, lPupilL, lPupilR);

  // Lisa's Golden Saxophone leaning against the right side of the couch
  const saxGroup = new THREE.Group();
  saxGroup.position.set(0.65, -0.2, 0.25);
  saxGroup.rotation.z = -0.35;
  const saxBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.65, 6), goldSaxMat);
  const saxBell = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 6), goldSaxMat);
  saxBell.position.set(0.08, -0.22, 0.08);
  saxBell.rotation.x = -1.1;
  const saxNeck = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 4, 8, Math.PI * 0.7), goldSaxMat);
  saxNeck.position.set(-0.04, 0.35, 0);
  saxGroup.add(saxBody, saxBell, saxNeck);
  lisaGroup.add(saxGroup);

  familyGroup.add(lisaGroup);

  // =========================================================================
  // 6. SANTA'S LITTLE HELPER (Slender brown dog curled resting on blue rug)
  // Positioned right in front of the couch looking up at the TV screen!
  // =========================================================================
  const dogGroup = new THREE.Group();
  dogGroup.name = 'santas_little_helper';
  dogGroup.position.set(-0.35, 0.08, 1.5);

  const dogBody = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.85), dogBrownMat);
  dogBody.position.set(0, 0.1, 0);

  const pawFL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.22), dogBrownMat);
  pawFL.position.set(-0.14, 0.03, 0.42);
  const pawFR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.22), dogBrownMat);
  pawFR.position.set(0.14, 0.03, 0.42);

  const dogHead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.3), dogBrownMat);
  dogHead.position.set(0, 0.18, 0.4);
  const dogSnout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.25), dogBrownMat);
  dogSnout.position.set(0, 0.12, 0.6);
  const dogNose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 4), pupilBlackMat);
  dogNose.position.set(0, 0.14, 0.74);

  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), dogBrownMat);
  earL.position.set(-0.12, 0.18, 0.34);
  earL.rotation.z = -0.4;
  const earR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), dogBrownMat);
  earR.position.set(0.12, 0.18, 0.34);
  earR.rotation.z = 0.4;

  const dogTail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.4, 4), dogBrownMat);
  dogTail.position.set(0, 0.15, -0.45);
  dogTail.rotation.x = -0.6;
  dogGroup.add(dogBody, pawFL, pawFR, dogHead, dogSnout, dogNose, earL, earR, dogTail);
  familyGroup.add(dogGroup);

  // =========================================================================
  // 7. SNOWBALL II (Black cat sleeping curled up beside the dog on the rug)
  // =========================================================================
  const catGroup = new THREE.Group();
  catGroup.name = 'snowball_ii';
  catGroup.position.set(0.5, 0.08, 1.5);

  const catBodyGeo = new THREE.SphereGeometry(0.2, 8, 8);
  catBodyGeo.scale(1.2, 0.8, 1.3);
  const catBody = new THREE.Mesh(catBodyGeo, catBlackMat);
  catBody.position.set(0, 0.12, 0);

  const catHead = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), catBlackMat);
  catHead.position.set(0, 0.22, 0.2);

  const cEarL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 3), catBlackMat);
  cEarL.position.set(-0.07, 0.34, 0.2);
  const cEarR = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 3), catBlackMat);
  cEarR.position.set(0.07, 0.34, 0.2);

  const cNose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), pinkDonutMat);
  cNose.position.set(0, 0.2, 0.33);

  const cTail = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 4, 8, Math.PI * 0.9), catBlackMat);
  cTail.position.set(0.12, 0.08, -0.1);
  cTail.rotation.x = Math.PI / 2;
  catGroup.add(catBody, catHead, cEarL, cEarR, cNose, cTail);
  familyGroup.add(catGroup);

  return familyGroup;
}
