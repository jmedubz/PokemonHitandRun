/**
 * Dedicated brand-new-game staging point inside Professor Oak's Lab.
 *
 * The lab is centred at (200, -200), with the starter row around z=-204.2 and
 * the front doors around z=-185.  This position sits in the clear circulation
 * space directly in front of the starter mat, leaving enough room behind Ash
 * for the normal third-person camera to remain inside the building.
 */
export const OAK_LAB_NEW_GAME_START = {
  x: 200,
  y: 0.25,
  z: -196.8,
  yaw: Math.PI,
  cameraPitch: 0.35,
  cameraDistance: 6.5,
} as const;
