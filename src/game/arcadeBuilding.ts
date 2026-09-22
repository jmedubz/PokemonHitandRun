import * as THREE from 'three';
import { Door, WallBox } from './doors';
import { ArcadeMachineInfo, DestructibleProp, MapLandmark } from '../types';
import { createMaterial, createSurfaceMaterial, createStylizedCityTreeModel } from './models';

function markSolid(mesh: THREE.Object3D, _margin = 0) {
  mesh.userData.solidCollider = true;
}

function markWalkable(mesh: THREE.Object3D, maxSlope = 8) {
  mesh.userData.walkable = true;
  mesh.userData.maxSlope = maxSlope;
}

export interface ArcadeBuildingResult {
  group: THREE.Group;
  landmarks: MapLandmark[];
  destructibles: DestructibleProp[];
  doors: Door[];
  wallColliders: WallBox[];
  arcadeMachines: ArcadeMachineInfo[];
  update: (dt: number, activePosition?: THREE.Vector3) => void;
}

/**
 * Draws a rounded rectangle path on a 2D canvas context.
 */
function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * Draws a cartoon 4-point or 8-point sparkle star in Simpsons/Pokemon comic style.
 */
function drawComicStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  fillColor = '#ffe600',
  strokeColor = '#000000',
  strokeWidth = 4
) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.fillStyle = fillColor;
  ctx.fill();

  // White center sparkle glint
  ctx.beginPath();
  ctx.arc(cx - innerR * 0.2, cy - innerR * 0.2, Math.max(2, innerR * 0.35), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/**
 * Creates a plane geometry oriented with unmirrored UVs whether facing +Z or -Z.
 */
function createOrientedSignPlane(width: number, height: number, facingDir: 'posZ' | 'negZ'): THREE.PlaneGeometry {
  const geom = new THREE.PlaneGeometry(width, height);
  if (facingDir === 'negZ') {
    geom.rotateY(Math.PI);
  }
  return geom;
}

/**
 * Generates an authentic, high-contrast, crystal-clear arcade neon marquee sign
 * designed in the iconic "Simpsons: Hit & Run" and "Pokémon Game Corner" cartoon aesthetic.
 *
 * Features:
 * - 2048px ultra-high resolution canvas (eliminates 3D blur)
 * - Simpsons Canary Yellow typography with 3D cartoon block extrusion
 * - Heavy black comic outlines (never blends into background)
 * - Donut-Pink & Electric-Cyan neon marquee badge framing
 * - Animated/vibrant arcade chaser bulbs along outer border
 * - Comic starburst sparkles and crystal-clear subtitle plaque
 */
function createSimpsonsPokemonArcadeSignTexture(
  mode: 'wide_marquee' | 'monument_billboard'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const isWide = mode === 'wide_marquee';
  canvas.width = 2048;
  canvas.height = isWide ? 410 : 1024;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const w = canvas.width;
    const h = canvas.height;

    // 1. Comic Deep Midnight Indigo Background with Radiant Contrast
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.65);
    bgGrad.addColorStop(0, '#280843');
    bgGrad.addColorStop(0.5, '#120222');
    bgGrad.addColorStop(1, '#060010');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle retro arcade checker / halftone dot pattern
    ctx.fillStyle = 'rgba(255, 0, 128, 0.06)';
    const step = isWide ? 24 : 28;
    for (let x = 0; x < w; x += step) {
      for (let y = 0; y < h; y += step) {
        if ((Math.floor(x / step) + Math.floor(y / step)) % 2 === 0) {
          ctx.fillRect(x, y, step * 0.65, step * 0.65);
        }
      }
    }

    // 2. Thick Cartoon Double Outer Frame (Simpsons & Pokemon Arcade Style)
    // Heavy black rim
    ctx.lineWidth = isWide ? 14 : 16;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(8, 8, w - 16, h - 16);

    // Hot Donut Pink / Magenta Neon Frame
    ctx.lineWidth = isWide ? 7 : 8;
    ctx.strokeStyle = '#ff007f';
    ctx.strokeRect(16, 16, w - 32, h - 32);

    // Electric Cyan Inner Frame
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00f0ff';
    ctx.strokeRect(22, 22, w - 44, h - 44);

    // 3. Vintage Arcade Marquee Chaser Bulbs (Simpsons Noiseland Arcade / Pokemon Game Corner)
    const bulbMargin = isWide ? 30 : 40;
    const bulbSpacing = isWide ? 44 : 50;
    const bulbRadius = isWide ? 7.5 : 9;
    const bulbColors = ['#ffe600', '#ff1493', '#00f0ff', '#39ff14', '#ff7700'];
    let bulbIndex = 0;

    const drawBulb = (bx: number, by: number) => {
      const col = bulbColors[bulbIndex % bulbColors.length];
      bulbIndex++;

      // Dark socket ring
      ctx.beginPath();
      ctx.arc(bx, by, bulbRadius + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();

      // Colored bulb
      ctx.beginPath();
      ctx.arc(bx, by, bulbRadius, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      // White specular glint
      ctx.beginPath();
      ctx.arc(bx - bulbRadius * 0.35, by - bulbRadius * 0.35, bulbRadius * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    };

    // Top & Bottom rows of bulbs
    for (let x = bulbMargin; x <= w - bulbMargin; x += bulbSpacing) {
      drawBulb(x, bulbMargin);
      drawBulb(x, h - bulbMargin);
    }
    // Left & Right columns of bulbs
    for (let y = bulbMargin + bulbSpacing; y <= h - bulbMargin - bulbSpacing; y += bulbSpacing) {
      drawBulb(bulbMargin, y);
      drawBulb(w - bulbMargin, y);
    }

    // 4. Corner Comic Starbursts
    const starInset = isWide ? 62 : 76;
    drawComicStar(ctx, starInset, starInset, 26, 11, '#ffe600', '#000000', 4);
    drawComicStar(ctx, w - starInset, starInset, 26, 11, '#00f0ff', '#000000', 4);
    drawComicStar(ctx, starInset, h - starInset, 26, 11, '#ff1493', '#000000', 4);
    drawComicStar(ctx, w - starInset, h - starInset, 26, 11, '#ffe600', '#000000', 4);

    if (isWide) {
      // -----------------------------------------------------------------------
      // WIDE MARQUEE LAYOUT ("PIXEL PARADISE ARCADE")
      // -----------------------------------------------------------------------
      const mainY = 160;

      // Draw Comic Pop Stars flanking the text
      drawComicStar(ctx, 150, mainY - 45, 22, 9, '#ffe600', '#000000', 3.5);
      drawComicStar(ctx, 1370, mainY + 45, 18, 8, '#ff7700', '#000000', 3);
      drawComicStar(ctx, 1880, mainY - 45, 22, 9, '#00f0ff', '#000000', 3.5);

      ctx.font = '900 114px "Arial Black", Impact, "Fredoka One", sans-serif';
      const titleText = 'PIXEL PARADISE';
      const titleX = 760;

      // 3D Block Cartoon Extrusion for "PIXEL PARADISE" (Simpsons Hit & Run 3D font style)
      // 7 offset steps down and to the right in solid black
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let s = 7; s >= 1; s--) {
        const ox = s * 1.8;
        const oy = s * 2.4;
        ctx.fillStyle = '#000000';
        ctx.fillText(titleText, titleX + ox, mainY + oy);
      }

      // Heavy Cartoon Outline (Outer stroke)
      ctx.lineWidth = 20;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(titleText, titleX, mainY);

      // Simpsons Yellow Gradient Fill
      const yellowGrad = ctx.createLinearGradient(0, mainY - 60, 0, mainY + 60);
      yellowGrad.addColorStop(0, '#ffff55'); // Sunny bright yellow
      yellowGrad.addColorStop(0.4, '#ffd200'); // Simpsons Canary Gold
      yellowGrad.addColorStop(0.85, '#ff8c00'); // Deep warm comic orange
      yellowGrad.addColorStop(1, '#ff6600');
      ctx.fillStyle = yellowGrad;
      ctx.fillText(titleText, titleX, mainY);

      // Inner Comic Stroke (crisp bright rim)
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(titleText, titleX, mainY);

      // "ARCADE" BADGE (Homer Donut Pink with Pokemon/Arcade flair)
      const badgeX = 1610;
      const badgeY = mainY;
      const badgeW = 420;
      const badgeH = 132;

      // Badge 3D drop shadow
      ctx.fillStyle = '#000000';
      drawRoundRect(ctx, badgeX - badgeW / 2 + 8, badgeY - badgeH / 2 + 10, badgeW, badgeH, 26);
      ctx.fill();

      // Badge background (Hot magenta to deep pink gradient)
      const badgeGrad = ctx.createLinearGradient(0, badgeY - badgeH / 2, 0, badgeY + badgeH / 2);
      badgeGrad.addColorStop(0, '#ff1493');
      badgeGrad.addColorStop(0.5, '#ff007f');
      badgeGrad.addColorStop(1, '#a0004e');
      ctx.fillStyle = badgeGrad;
      drawRoundRect(ctx, badgeX - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 26);
      ctx.fill();

      // Badge cartoon black outline + cyan inner neon stroke
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#000000';
      drawRoundRect(ctx, badgeX - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 26);
      ctx.stroke();

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#00f0ff';
      drawRoundRect(ctx, badgeX - badgeW / 2 + 6, badgeY - badgeH / 2 + 6, badgeW - 12, badgeH - 12, 20);
      ctx.stroke();

      // "ARCADE" Text inside badge
      ctx.font = '900 82px "Arial Black", Impact, sans-serif';
      for (let s = 6; s >= 1; s--) {
        ctx.fillStyle = '#000000';
        ctx.fillText('ARCADE', badgeX + s * 1.5, badgeY + s * 2.0);
      }
      ctx.lineWidth = 16;
      ctx.strokeStyle = '#000000';
      ctx.strokeText('ARCADE', badgeX, badgeY);

      const arcGrad = ctx.createLinearGradient(0, badgeY - 40, 0, badgeY + 40);
      arcGrad.addColorStop(0, '#ffffff');
      arcGrad.addColorStop(0.35, '#fff066');
      arcGrad.addColorStop(1, '#ffd000');
      ctx.fillStyle = arcGrad;
      ctx.fillText('ARCADE', badgeX, badgeY);

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText('ARCADE', badgeX, badgeY);

      // -----------------------------------------------------------------------
      // SUBTITLE HIGH-CONTRAST MARQUEE BANNER PLAQUE
      // "★ RETRO COIN-OP  •  MINI-GAMES  •  REDLINE RUSH  •  FREE PLAY ★"
      // -----------------------------------------------------------------------
      const subY = 312;
      const subW = 1760;
      const subH = 76;
      const subX = w / 2;

      // Banner shadow
      ctx.fillStyle = '#000000';
      drawRoundRect(ctx, subX - subW / 2 + 6, subY - subH / 2 + 8, subW, subH, 18);
      ctx.fill();

      // Banner plate background (Dark midnight obsidian violet)
      const subBgGrad = ctx.createLinearGradient(0, subY - subH / 2, 0, subY + subH / 2);
      subBgGrad.addColorStop(0, '#1c0836');
      subBgGrad.addColorStop(1, '#0d021c');
      ctx.fillStyle = subBgGrad;
      drawRoundRect(ctx, subX - subW / 2, subY - subH / 2, subW, subH, 18);
      ctx.fill();

      // Banner border (Hot Pink outer + Electric Cyan inner)
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ff007f';
      drawRoundRect(ctx, subX - subW / 2, subY - subH / 2, subW, subH, 18);
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00f0ff';
      drawRoundRect(ctx, subX - subW / 2 + 4, subY - subH / 2 + 4, subW - 8, subH - 8, 14);
      ctx.stroke();

      // Subtitle Text (Crystal clear, high-contrast, bold cartoon yellow styling)
      ctx.font = '900 38px "Arial Black", Impact, sans-serif';
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#000000';
      const subText = '★ RETRO COIN-OP  •  MINI-GAMES  •  REDLINE RUSH  •  FREE PLAY ★';
      ctx.strokeText(subText, subX, subY + 2);
      ctx.fillStyle = '#ffe600';
      ctx.fillText(subText, subX, subY + 2);

      // Star sparkle glints inside the subtitle
      drawComicStar(ctx, subX - subW / 2 + 36, subY + 1, 14, 6, '#ffffff', '#000000', 2);
      drawComicStar(ctx, subX + subW / 2 - 36, subY + 1, 14, 6, '#ffffff', '#000000', 2);
    } else {
      // -----------------------------------------------------------------------
      // MONUMENT BILLBOARD LAYOUT (X=BUILDING_X-18 roadside sign)
      // -----------------------------------------------------------------------
      const centerX = w / 2;

      // Top Comic Starbursts
      drawComicStar(ctx, 160, 160, 30, 13, '#ffe600', '#000000', 5);
      drawComicStar(ctx, w - 160, 160, 30, 13, '#00f0ff', '#000000', 5);

      // Line 1: "PIXEL PARADISE" in huge Simpsons yellow 3D lettering
      const y1 = 250;
      ctx.font = '900 120px "Arial Black", Impact, "Fredoka One", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 3D block extrusion
      for (let s = 8; s >= 1; s--) {
        ctx.fillStyle = '#000000';
        ctx.fillText('PIXEL PARADISE', centerX + s * 1.8, y1 + s * 2.4);
      }

      ctx.lineWidth = 22;
      ctx.strokeStyle = '#000000';
      ctx.strokeText('PIXEL PARADISE', centerX, y1);

      const yGrad = ctx.createLinearGradient(0, y1 - 65, 0, y1 + 65);
      yGrad.addColorStop(0, '#ffff55');
      yGrad.addColorStop(0.5, '#ffd200');
      yGrad.addColorStop(1, '#ff7700');
      ctx.fillStyle = yGrad;
      ctx.fillText('PIXEL PARADISE', centerX, y1);

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText('PIXEL PARADISE', centerX, y1);

      // Line 2: "ARCADE" in big Donut Pink / Pokemon badge
      const y2 = 490;
      const bW = 680;
      const bH = 150;

      ctx.fillStyle = '#000000';
      drawRoundRect(ctx, centerX - bW / 2 + 8, y2 - bH / 2 + 10, bW, bH, 30);
      ctx.fill();

      const bGrad = ctx.createLinearGradient(0, y2 - bH / 2, 0, y2 + bH / 2);
      bGrad.addColorStop(0, '#ff1493');
      bGrad.addColorStop(0.5, '#ff007f');
      bGrad.addColorStop(1, '#980045');
      ctx.fillStyle = bGrad;
      drawRoundRect(ctx, centerX - bW / 2, y2 - bH / 2, bW, bH, 30);
      ctx.fill();

      ctx.lineWidth = 9;
      ctx.strokeStyle = '#000000';
      drawRoundRect(ctx, centerX - bW / 2, y2 - bH / 2, bW, bH, 30);
      ctx.stroke();

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#00f0ff';
      drawRoundRect(ctx, centerX - bW / 2 + 7, y2 - bH / 2 + 7, bW - 14, bH - 14, 23);
      ctx.stroke();

      ctx.font = '900 96px "Arial Black", Impact, sans-serif';
      for (let s = 6; s >= 1; s--) {
        ctx.fillStyle = '#000000';
        ctx.fillText('ARCADE', centerX + s * 1.5, y2 + s * 2.0);
      }
      ctx.lineWidth = 18;
      ctx.strokeStyle = '#000000';
      ctx.strokeText('ARCADE', centerX, y2);

      const aGrad = ctx.createLinearGradient(0, y2 - 48, 0, y2 + 48);
      aGrad.addColorStop(0, '#ffffff');
      aGrad.addColorStop(0.35, '#fff277');
      aGrad.addColorStop(1, '#ffc700');
      ctx.fillStyle = aGrad;
      ctx.fillText('ARCADE', centerX, y2);

      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText('ARCADE', centerX, y2);

      // Line 3: Subtitle Ribbon Plaque
      const y3 = 730;
      const sW = 1050;
      const sH = 100;

      ctx.fillStyle = '#000000';
      drawRoundRect(ctx, centerX - sW / 2 + 6, y3 - sH / 2 + 8, sW, sH, 22);
      ctx.fill();

      const sGrad = ctx.createLinearGradient(0, y3 - sH / 2, 0, y3 + sH / 2);
      sGrad.addColorStop(0, '#1c0836');
      sGrad.addColorStop(1, '#0c0218');
      ctx.fillStyle = sGrad;
      drawRoundRect(ctx, centerX - sW / 2, y3 - sH / 2, sW, sH, 22);
      ctx.fill();

      ctx.lineWidth = 6;
      ctx.strokeStyle = '#00f0ff';
      drawRoundRect(ctx, centerX - sW / 2, y3 - sH / 2, sW, sH, 22);
      ctx.stroke();

      ctx.font = '900 44px "Arial Black", Impact, sans-serif';
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#000000';
      const monSubText = '★ RETRO ARCADE & MINI-GAMES ★';
      ctx.strokeText(monSubText, centerX, y3 + 2);
      ctx.fillStyle = '#ffe600';
      ctx.fillText(monSubText, centerX, y3 + 2);

      // Line 4: Bottom Coin-Op Tag
      const y4 = 880;
      ctx.font = '900 32px "Arial Black", Impact, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#000000';
      const tagText = 'INSERT COIN TO PLAY • 8-BIT & 16-BIT CLASSICS';
      ctx.strokeText(tagText, centerX, y4);
      ctx.fillText(tagText, centerX, y4);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  return texture;
}

/**
 * Creates a high-resolution, high-contrast canvas texture for signs, posters, and marquee displays.
 */
function createArcadeLabelTexture(
  text: string,
  width: number,
  height: number,
  color: string,
  bg: string,
  subtitle?: string,
  accent = '#e040fb'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  // High resolution: 1024 width and crisp proportional height
  const aspect = height / width;
  canvas.width = 1024;
  canvas.height = Math.max(256, Math.round(1024 * aspect));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const w = canvas.width;
    const h = canvas.height;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, '#05030a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Outer dark frame + vibrant neon border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, w - 14, h - 14);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, w - 24, h - 24);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    // Main Text
    const fontSize = Math.min(84, Math.round(h * (subtitle ? 0.32 : 0.44)));
    ctx.font = `900 ${fontSize}px "Arial Black", Impact, "Fredoka One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const yPos = subtitle ? h * 0.40 : h * 0.50;

    // 3D Cartoon block extrusion (comic drop shadow)
    for (let s = 6; s >= 1; s--) {
      ctx.fillStyle = '#000000';
      ctx.fillText(text, w / 2 + s * 1.5, yPos + s * 2.0);
    }

    // Heavy cartoon black stroke
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, w / 2, yPos);

    // Main text fill
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, yPos);

    // Inner bright rim highlight
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.strokeText(text, w / 2, yPos);

    if (subtitle) {
      const subFontSize = Math.min(36, Math.max(22, Math.round(h * 0.16)));
      const subY = h * 0.75;

      // Subtitle plate
      const subPlateW = Math.min(w - 60, ctx.measureText(subtitle).width + 60);
      const subPlateH = subFontSize * 1.8;
      ctx.fillStyle = '#000000';
      drawRoundRect(ctx, w / 2 - subPlateW / 2 + 4, subY - subPlateH / 2 + 4, subPlateW, subPlateH, 12);
      ctx.fill();

      ctx.fillStyle = 'rgba(15, 6, 32, 0.9)';
      drawRoundRect(ctx, w / 2 - subPlateW / 2, subY - subPlateH / 2, subPlateW, subPlateH, 12);
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = accent;
      drawRoundRect(ctx, w / 2 - subPlateW / 2, subY - subPlateH / 2, subPlateW, subPlateH, 12);
      ctx.stroke();

      ctx.font = `900 ${subFontSize}px "Arial Black", Impact, monospace`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(subtitle, w / 2, subY);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(subtitle, w / 2, subY);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  return texture;
}

/**
 * Creates an authentic retro 80s/90s cosmic geometric arcade carpet texture.
 */
function createArcadeCarpetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Deep midnight purple-black background
    ctx.fillStyle = '#080514';
    ctx.fillRect(0, 0, 512, 512);

    // Vibrant fluorescent confetti & geometric starbursts
    const colors = ['#f43f5e', '#38bdf8', '#a855f7', '#fbbf24', '#34d399', '#ec4899'];
    for (let i = 0; i < 90; i++) {
      ctx.save();
      const x = (i * 59) % 512;
      const y = (i * 83) % 512;
      ctx.translate(x, y);
      ctx.rotate((i * 47 * Math.PI) / 180);

      ctx.fillStyle = colors[i % colors.length];
      if (i % 3 === 0) {
        // Neon triangle
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(8, 8);
        ctx.lineTo(-8, 8);
        ctx.closePath();
        ctx.fill();
      } else if (i % 3 === 1) {
        // Neon starburst
        ctx.fillRect(-6, -2, 12, 4);
        ctx.fillRect(-2, -6, 4, 12);
      } else {
        // Neon circle dot
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 7);
  return texture;
}

export function buildArcadeBuilding(): ArcadeBuildingResult {
  const root = new THREE.Group();
  root.name = 'pixel_paradise_arcade_complex';

  const landmarks: MapLandmark[] = [];
  const destructibles: DestructibleProp[] = [];
  const doors: Door[] = [];
  const wallColliders: WallBox[] = [];
  const arcadeMachines: ArcadeMachineInfo[] = [];

  // -------------------------------------------------------------------------
  // LOCATION & BOUNDS
  // Positioned around X = 8, Z = -305 in the open reserve between the main
  // cities and the airport, connecting north to the highway and south to airport.
  // -------------------------------------------------------------------------
  const BUILDING_X = 8;
  const BUILDING_Z = -305;
  const BUILDING_W = 38;  // Width X: -11 to +27
  const BUILDING_D = 32;  // Depth Z: -321 to -289
  const BUILDING_H = 6.8; // Height Y: 0 to 6.8
  const FRONT_Z = BUILDING_Z + BUILDING_D / 2; // Z = -289 (North Entrance Wall facing towards cities)

  // Materials
  const asphaltMat = createSurfaceMaterial(0x23272d, 'asphalt', 0.94, 0.02, 18, 18);
  const concretePaveMat = createSurfaceMaterial(0x9ca3af, 'concrete', 0.88, 0.02, 12, 12);
  const curbYellowMat = createMaterial(0xf59e0b, 0.5, 0.1);
  const exteriorWallMat = createSurfaceMaterial(0x1e1b2e, 'concrete', 0.85, 0.05, 14, 8);
  const interiorWallMat = createSurfaceMaterial(0x2a243d, 'concrete', 0.90, 0.02, 10, 6);
  const ceilingMat = createMaterial(0x110f1c, 0.95, 0.05);
  const metalFrameMat = createMaterial(0x374151, 0.35, 0.85);
  const neonPinkMat = new THREE.MeshBasicMaterial({ color: 0xff007f, toneMapped: false });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false });
  const neonGoldMat = new THREE.MeshBasicMaterial({ color: 0xffb703, toneMapped: false });
  const neonPurpleMat = new THREE.MeshBasicMaterial({ color: 0xbc13fe, toneMapped: false });

  const carpetMat = new THREE.MeshStandardMaterial({
    map: createArcadeCarpetTexture(),
    roughness: 0.96,
    metalness: 0.02,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x8be9fd,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // -------------------------------------------------------------------------
  // 1. ACCESS ROADS & ARTERIAL BOULEVARD (Linking Highway, Arcade, and Airport)
  // Connects smoothly from Northern Highway (Z = -170) down to the Arcade plaza,
  // with causeway bridge piers and guardrails over river water, plus extended
  // East and West connector roads linking directly to the Airport road network.
  // -------------------------------------------------------------------------
  // North Access Boulevard Causeway: from Z = -161 to Z = -260 (length: 99m)
  const accessRoadNorth = new THREE.Mesh(new THREE.BoxGeometry(14, 0.18, 99), asphaltMat);
  accessRoadNorth.name = 'arcade_access_boulevard_north';
  accessRoadNorth.position.set(BUILDING_X, 0.09, -210.5);
  markWalkable(accessRoadNorth, 8);
  accessRoadNorth.userData.mapRoadSurface = true;
  accessRoadNorth.userData.permanentRoadGeometry = true;
  accessRoadNorth.userData.roadCriticalDetail = true;
  accessRoadNorth.userData.walkablePriority = 8;
  root.add(accessRoadNorth);

  // Smooth, wide approach apron with Northern Viaduct (Z = -161 to -178)
  // Generous 40m wide asphalt apron ensures seamless transition with no concrete obstruction
  const junctionDeck = new THREE.Mesh(new THREE.BoxGeometry(40, 0.18, 17), asphaltMat);
  junctionDeck.name = 'arcade_bridge_approach_apron';
  junctionDeck.position.set(BUILDING_X, 0.09, -169.5);
  markWalkable(junctionDeck, 8);
  junctionDeck.userData.mapRoadSurface = true;
  junctionDeck.userData.permanentRoadGeometry = true;
  junctionDeck.userData.roadCriticalDetail = true;
  junctionDeck.userData.walkablePriority = 8;
  root.add(junctionDeck);

  // Causeway concrete support piers in the river (Z = -190, -210, -230)
  // Positioned well below the asphalt deck (top at Y = -0.25) so concrete never pokes into the roadway
  for (const pz of [-190, -210, -230]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(13.2, 5.0, 3.0), concretePaveMat);
    pier.name = `arcade_causeway_pier_${pz}`;
    pier.position.set(BUILDING_X, -2.75, pz);
    root.add(pier);
  }

  // -------------------------------------------------------------------------
  // CAUSEWAY BRIDGE BARRIERS (STRICTLY OVER RIVER WATER: Z = -183 to Z = -237)
  // The intersection and approach zone between Z = -161 and Z = -182 is completely
  // open with ZERO barriers, allowing turning vehicles and players free transit.
  // -------------------------------------------------------------------------
  const bridgeBarrierMat = createMaterial(0x9ca3af, 0.35, 0.3); // Reinforced highway concrete
  const steelRailMat = createMaterial(0xe5e7eb, 0.25, 0.85); // Galvanized steel
  const steelPostMat = createMaterial(0x4b5563, 0.3, 0.7); // Dark treated steel posts

  const barrierGroup = new THREE.Group();
  barrierGroup.name = 'arcade_causeway_realistic_barriers';

  // Causeway straight runs: strictly between Z = -183 and Z = -237 (54m length, center Z = -210)
  // Placed at X = 0.75 (West) and X = 15.25 (East), safely outside the 14m road deck (X = 1.0 to 15.0)
  const straightLen = 54;
  const straightCenterZ = -210;

  const buildBridgeBarrierSection = (x: number, isWest: boolean) => {
    const sec = new THREE.Group();

    // 1. Concrete Parapet Base (0.72m high, 0.46m wide)
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.72, straightLen), bridgeBarrierMat);
    base.position.set(x, 0.44, straightCenterZ);
    markSolid(base, 0);
    sec.add(base);

    // 2. Dual Galvanized Steel Tubular Guardrails on top of parapet
    const lowerPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, straightLen, 8), steelRailMat);
    lowerPipe.rotation.x = Math.PI / 2;
    lowerPipe.position.set(x, 0.95, straightCenterZ);
    const upperPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, straightLen, 8), steelRailMat);
    upperPipe.rotation.x = Math.PI / 2;
    upperPipe.position.set(x, 1.25, straightCenterZ);
    sec.add(lowerPipe, upperPipe);

    // 3. Vertical Steel Mounting Stanchions every 5.4m
    for (let z = -235; z <= -185; z += 5.4) {
      const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 0.12), steelPostMat);
      stanchion.position.set(x, 1.05, z);
      sec.add(stanchion);

      // Reflector delineators
      const delineatorMat = isWest ? neonCyanMat : neonPinkMat;
      const delineator = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), delineatorMat);
      const faceOffset = isWest ? 0.25 : -0.25;
      delineator.position.set(x + faceOffset, 0.95, z);
      sec.add(delineator);
    }

    // 4. Outward-flared impact crash terminals at northern end (Z = -183) and southern end (Z = -237)
    // Flaring outward away from the road prevents vehicle snagging
    const flareDir = isWest ? -1 : 1;
    for (const termZ of [-183, -237]) {
      const termBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 1.8), bridgeBarrierMat);
      termBase.position.set(x + flareDir * 0.35, 0.42, termZ);
      markSolid(termBase, 0);
      sec.add(termBase);
    }

    return sec;
  };

  const westBarrier = buildBridgeBarrierSection(BUILDING_X - 7.25, true); // X = 0.75
  const eastBarrier = buildBridgeBarrierSection(BUILDING_X + 7.25, false); // X = 15.25
  barrierGroup.add(westBarrier, eastBarrier);
  root.add(barrierGroup);

  // Dashed lane dividers along north access road
  for (let z = -256; z <= -168; z += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 3.8), createMaterial(0xffffff, 0.4, 0.1));
    dash.position.set(BUILDING_X, 0.17, z);
    dash.userData.roadCriticalDetail = true;
    root.add(dash);
  }

  // -------------------------------------------------------------------------
  // WEST EXTENDED ROAD (Connecting Car Park to Airport West Approach Road)
  // From X = -18 (Car Park West edge) to X = -170 (Airport West road), along Z = -273
  // -------------------------------------------------------------------------
  const westRoadLen = 152;
  const westRoadX = (-18 + -170) / 2; // -94
  const roadWest = new THREE.Mesh(new THREE.BoxGeometry(westRoadLen, 0.18, 14), asphaltMat);
  roadWest.name = 'arcade_extended_road_west';
  roadWest.position.set(westRoadX, 0.09, -273);
  markWalkable(roadWest, 8);
  roadWest.userData.mapRoadSurface = true;
  roadWest.userData.permanentRoadGeometry = true;
  roadWest.userData.roadCriticalDetail = true;
  roadWest.userData.walkablePriority = 8;
  root.add(roadWest);

  // West Road Dashed Lane Centerline
  for (let wx = -164; wx <= -22; wx += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.04, 0.24), createMaterial(0xffffff, 0.4, 0.1));
    dash.position.set(wx, 0.182, -273);
    dash.userData.roadCriticalDetail = true;
    root.add(dash);
  }

  // West Road Junction Connector Fillet with Airport Road (at X = -168, Z = -273)
  const westJunction = new THREE.Mesh(new THREE.BoxGeometry(22, 0.18, 20), asphaltMat);
  westJunction.name = 'arcade_west_airport_junction';
  westJunction.position.set(-168, 0.09, -273);
  markWalkable(westJunction, 8);
  westJunction.userData.mapRoadSurface = true;
  westJunction.userData.permanentRoadGeometry = true;
  westJunction.userData.roadCriticalDetail = true;
  westJunction.userData.walkablePriority = 8;
  root.add(westJunction);

  // Kickable Streetlamps along West Extended Road
  let arcadeLampCount = 0;
  for (let lx = -155; lx <= -35; lx += 30) {
    const lamp = new THREE.Group();
    lamp.name = `arcade_lamp_west_${arcadeLampCount}`;
    lamp.position.set(lx, 0, -280.5);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 8), metalFrameMat);
    pole.position.y = 3.25;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.4), metalFrameMat);
    arm.position.set(0.6, 6.4, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), createMaterial(0xfffbeb, 0.1, 0.9));
    bulb.position.set(1.2, 6.2, 0);
    lamp.add(pole, arm, bulb);
    root.add(lamp);
    destructibles.push({
      id: `arcade_lamp_west_${arcadeLampCount++}`,
      mesh: lamp,
      type: 'lamp',
      position: { x: lx, y: 0, z: -280.5 },
      destroyed: false,
    });
  }

  // Kickable Trees along West Extended Road verge
  let arcadeTreeCount = 0;
  for (let tx = -145; tx <= -35; tx += 28) {
    const tree = new THREE.Group();
    tree.name = `kickable_tree_arcade_west_${arcadeTreeCount}`;
    tree.userData.kickableTree = true;
    tree.userData.treePhysicsProfile = 'arcade_reusable';
    tree.position.set(tx, 0, -265.5);
    const visual = createStylizedCityTreeModel(1.05);
    tree.add(visual);
    root.add(tree);
    destructibles.push({
      id: `arcade_tree_west_${arcadeTreeCount++}`,
      mesh: tree,
      type: 'tree',
      position: { x: tx, y: 0, z: -265.5 },
      destroyed: false,
    });
  }

  // -------------------------------------------------------------------------
  // EAST EXTENDED ROAD (Connecting Car Park to Airport East Approach Road)
  // From X = +34 (Car Park East edge) to X = +278 (Airport East road), along Z = -273
  // -------------------------------------------------------------------------
  const eastRoadLen = 244;
  const eastRoadX = (34 + 278) / 2; // 156
  const roadEast = new THREE.Mesh(new THREE.BoxGeometry(eastRoadLen, 0.18, 14), asphaltMat);
  roadEast.name = 'arcade_extended_road_east';
  roadEast.position.set(eastRoadX, 0.09, -273);
  markWalkable(roadEast, 8);
  roadEast.userData.mapRoadSurface = true;
  roadEast.userData.permanentRoadGeometry = true;
  roadEast.userData.roadCriticalDetail = true;
  roadEast.userData.walkablePriority = 8;
  root.add(roadEast);

  // East Road Dashed Lane Centerline
  for (let ex = 38; ex <= 270; ex += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.04, 0.24), createMaterial(0xffffff, 0.4, 0.1));
    dash.position.set(ex, 0.182, -273);
    dash.userData.roadCriticalDetail = true;
    root.add(dash);
  }

  // East Road Junction Connector Fillet with Airport Road (at X = +274, Z = -273)
  const eastJunction = new THREE.Mesh(new THREE.BoxGeometry(24, 0.18, 20), asphaltMat);
  eastJunction.name = 'arcade_east_airport_junction';
  eastJunction.position.set(274, 0.09, -273);
  markWalkable(eastJunction, 8);
  eastJunction.userData.mapRoadSurface = true;
  eastJunction.userData.permanentRoadGeometry = true;
  eastJunction.userData.roadCriticalDetail = true;
  eastJunction.userData.walkablePriority = 8;
  root.add(eastJunction);

  // Kickable Streetlamps along East Extended Road
  for (let lx = 48; lx <= 255; lx += 32) {
    const lamp = new THREE.Group();
    lamp.name = `arcade_lamp_east_${arcadeLampCount}`;
    lamp.position.set(lx, 0, -280.5);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 8), metalFrameMat);
    pole.position.y = 3.25;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.4), metalFrameMat);
    arm.position.set(0.6, 6.4, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), createMaterial(0xfffbeb, 0.1, 0.9));
    bulb.position.set(1.2, 6.2, 0);
    lamp.add(pole, arm, bulb);
    root.add(lamp);
    destructibles.push({
      id: `arcade_lamp_east_${arcadeLampCount++}`,
      mesh: lamp,
      type: 'lamp',
      position: { x: lx, y: 0, z: -280.5 },
      destroyed: false,
    });
  }

  // Kickable Trees along East Extended Road verge
  for (let tx = 56; tx <= 248; tx += 30) {
    const tree = new THREE.Group();
    tree.name = `kickable_tree_arcade_east_${arcadeTreeCount}`;
    tree.userData.kickableTree = true;
    tree.userData.treePhysicsProfile = 'arcade_reusable';
    tree.position.set(tx, 0, -265.5);
    const visual = createStylizedCityTreeModel(1.05);
    tree.add(visual);
    root.add(tree);
    destructibles.push({
      id: `arcade_tree_east_${arcadeTreeCount++}`,
      mesh: tree,
      type: 'tree',
      position: { x: tx, y: 0, z: -265.5 },
      destroyed: false,
    });
  }

  // South Access Boulevard: from Z = -321 down to Airport spine at Z = -441 (length: 120m)
  const accessRoadSouth = new THREE.Mesh(new THREE.BoxGeometry(14, 0.18, 122), asphaltMat);
  accessRoadSouth.name = 'arcade_access_boulevard_south';
  accessRoadSouth.position.set(BUILDING_X, 0.09, -381);
  markWalkable(accessRoadSouth, 8);
  accessRoadSouth.userData.mapRoadSurface = true;
  accessRoadSouth.userData.permanentRoadGeometry = true;
  accessRoadSouth.userData.roadCriticalDetail = true;
  accessRoadSouth.userData.walkablePriority = 8;
  root.add(accessRoadSouth);

  // South Road Junction Connector Fillet with Airport Road (at X = BUILDING_X, Z = -441)
  const southJunction = new THREE.Mesh(new THREE.BoxGeometry(20, 0.18, 20), asphaltMat);
  southJunction.name = 'arcade_south_airport_junction';
  southJunction.position.set(BUILDING_X, 0.09, -441);
  markWalkable(southJunction, 8);
  southJunction.userData.mapRoadSurface = true;
  southJunction.userData.permanentRoadGeometry = true;
  southJunction.userData.roadCriticalDetail = true;
  southJunction.userData.walkablePriority = 8;
  root.add(southJunction);

  // Kickable Streetlamps & Trees along South Access Boulevard
  for (let z = -420; z <= -330; z += 30) {
    const lamp = new THREE.Group();
    lamp.name = `arcade_lamp_south_${arcadeLampCount}`;
    lamp.position.set(BUILDING_X + 8.5, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 8), metalFrameMat);
    pole.position.y = 3.25;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.4), metalFrameMat);
    arm.position.set(-0.6, 6.4, 0);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), createMaterial(0xfffbeb, 0.1, 0.9));
    bulb.position.set(-1.2, 6.2, 0);
    lamp.add(pole, arm, bulb);
    root.add(lamp);
    destructibles.push({
      id: `arcade_lamp_south_${arcadeLampCount++}`,
      mesh: lamp,
      type: 'lamp',
      position: { x: BUILDING_X + 8.5, y: 0, z },
      destroyed: false,
    });

    const tree = new THREE.Group();
    tree.name = `kickable_tree_arcade_south_${arcadeTreeCount}`;
    tree.userData.kickableTree = true;
    tree.userData.treePhysicsProfile = 'arcade_reusable';
    tree.position.set(BUILDING_X - 8.5, 0, z);
    const visual = createStylizedCityTreeModel(1.05);
    tree.add(visual);
    root.add(tree);
    destructibles.push({
      id: `arcade_tree_south_${arcadeTreeCount++}`,
      mesh: tree,
      type: 'tree',
      position: { x: BUILDING_X - 8.5, y: 0, z },
      destroyed: false,
    });
  }

  // Dashed lane dividers along south access road
  for (let z = -436; z <= -326; z += 7) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 3.8), createMaterial(0xffffff, 0.4, 0.1));
    dash.position.set(BUILDING_X, 0.182, z);
    dash.userData.roadCriticalDetail = true;
    root.add(dash);
  }

  // Large Arcade Forecourt & Parking Plaza (Z = -260 to -286, X = -18 to +34)
  const plazaWidth = 52;
  const plazaDepth = 26;
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(plazaWidth, 0.18, plazaDepth), asphaltMat);
  plaza.name = 'arcade_forecourt_plaza';
  plaza.position.set(BUILDING_X, 0.09, -273);
  markWalkable(plaza, 8);
  plaza.userData.mapRoadSurface = true;
  plaza.userData.permanentRoadGeometry = true;
  plaza.userData.roadCriticalDetail = true;
  plaza.userData.walkablePriority = 8;
  root.add(plaza);

  // Concrete sidewalk apron in front of the arcade entrance (Z = -289 to -285)
  const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W + 6, 0.22, 4), concretePaveMat);
  sidewalk.name = 'arcade_entrance_sidewalk';
  sidewalk.position.set(BUILDING_X, 0.11, -287);
  markWalkable(sidewalk, 8);
  sidewalk.userData.walkablePriority = 8;
  sidewalk.userData.sidewalkSurface = true;
  sidewalk.userData.roadCriticalDetail = true;
  root.add(sidewalk);

  // Curb yellow boundary
  const curbL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.26, 4), curbYellowMat);
  curbL.position.set(BUILDING_X - (BUILDING_W + 6) / 2, 0.13, -287);
  const curbR = curbL.clone();
  curbR.position.x = BUILDING_X + (BUILDING_W + 6) / 2;
  root.add(curbL, curbR);

  // Parking Stalls (marked with white painted lines) located along entrance sidewalk (Z = -282)
  for (let px = -14; px <= 28; px += 4.5) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 5.0), createMaterial(0xffffff));
    line.position.set(px, 0.182, -282);
    root.add(line);
  }

  // Decorative Palm Trees & Neon Streetlamps around the Forecourt
  const lampPositions = [
    [-15, -266],
    [31, -266],
    [-15, -280],
    [31, -280],
  ];
  lampPositions.forEach(([lx, lz], idx) => {
    const lamp = new THREE.Group();
    lamp.name = `arcade_forecourt_lamp_${arcadeLampCount}`;
    lamp.position.set(lx, 0, lz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 6.5, 8), metalFrameMat);
    pole.position.y = 3.25;

    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.6), metalFrameMat);
    head.position.y = 6.4;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), idx % 2 === 0 ? neonPinkMat : neonCyanMat);
    bulb.position.y = 6.2;
    lamp.add(pole, head, bulb);
    root.add(lamp);
    destructibles.push({
      id: `arcade_forecourt_lamp_${arcadeLampCount++}`,
      mesh: lamp,
      type: 'lamp',
      position: { x: lx, y: 0, z: lz },
      destroyed: false,
    });

    // Decorative kickable tree with planter
    const tree = new THREE.Group();
    tree.name = `kickable_tree_arcade_forecourt_${arcadeTreeCount}`;
    tree.userData.kickableTree = true;
    tree.userData.treePhysicsProfile = 'arcade_reusable';
    tree.position.set(lx - 2.5, 0, lz);

    const planter = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.0, 0.65, 12), concretePaveMat);
    planter.position.y = 0.32;
    const treeVisual = createStylizedCityTreeModel(1.1);
    treeVisual.position.y = 0.33;
    tree.add(planter, treeVisual);
    root.add(tree);

    destructibles.push({
      id: `arcade_forecourt_tree_${arcadeTreeCount++}`,
      mesh: tree,
      type: 'tree',
      position: { x: lx - 2.5, y: 0, z: lz },
      destroyed: false,
    });
  });

  // -------------------------------------------------------------------------
  // 2. ROADSIDE MONUMENT SIGN ("PIXEL PARADISE ARCADE")
  // -------------------------------------------------------------------------
  const monument = new THREE.Group();
  monument.position.set(BUILDING_X - 18, 0, -262);
  monument.rotation.y = -Math.PI / 6;

  const monBase = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.2, 1.2), concretePaveMat);
  monBase.position.y = 0.6;
  markSolid(monBase);

  const monPillar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 7.5, 0.8), createMaterial(0x1e1b2e));
  monPillar.position.y = 4.8;
  markSolid(monPillar);

  // Glowing Marquee Billboard ("PIXEL PARADISE") - Simpsons & Pokemon Comic Style
  const monSignTex = createSimpsonsPokemonArcadeSignTexture('monument_billboard');
  const monSignMat = new THREE.MeshBasicMaterial({
    map: monSignTex,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  // Front billboard face (facing +Z)
  const monSignFront = new THREE.Mesh(createOrientedSignPlane(4.4, 2.2, 'posZ'), monSignMat);
  monSignFront.position.set(0, 5.8, 0.42);

  // Back billboard face (facing -Z, unmirrored UVs for oncoming traffic)
  const monSignBack = new THREE.Mesh(createOrientedSignPlane(4.4, 2.2, 'negZ'), monSignMat);
  monSignBack.position.set(0, 5.8, -0.42);

  // Radiant Neon Illumination Wash on Billboard
  const monNeonLightFront = new THREE.PointLight(0xffe600, 2.0, 14);
  monNeonLightFront.position.set(0, 5.8, 1.4);
  const monNeonLightBack = new THREE.PointLight(0xff007f, 2.0, 14);
  monNeonLightBack.position.set(0, 5.8, -1.4);

  // Flashing Star Topper
  const starTopper = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), neonGoldMat);
  starTopper.position.y = 9.0;

  monument.add(monBase, monPillar, monSignFront, monSignBack, monNeonLightFront, monNeonLightBack, starTopper);
  root.add(monument);

  // -------------------------------------------------------------------------
  // 3. ARCADE BUILDING EXTERIOR STRUCTURE
  // -------------------------------------------------------------------------
  const bldgGroup = new THREE.Group();
  bldgGroup.name = 'arcade_building_structure';
  bldgGroup.position.set(BUILDING_X, 0, BUILDING_Z);
  bldgGroup.rotation.y = Math.PI;

  const halfW = BUILDING_W / 2; // 19
  const halfD = BUILDING_D / 2; // 16

  // Floor Slab
  const floor = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W - 0.4, 0.22, BUILDING_D - 0.4), carpetMat);
  floor.name = 'arcade_interior_floor';
  floor.position.y = 0.11;
  markWalkable(floor, 8);
  bldgGroup.add(floor);

  // Landable Roof Slab
  const roof = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W + 1.2, 0.45, BUILDING_D + 1.2), exteriorWallMat);
  roof.name = 'arcade_rooftop_slab';
  roof.position.y = BUILDING_H;
  roof.userData.landableRoof = true;
  markWalkable(roof, 9);
  bldgGroup.add(roof);

  // Roof Parapet / Guardrails (flanking the central 23.4m marquee structure)
  const roofRailMat = createMaterial(0x4b5563, 0.4, 0.7);
  const railSideW = (BUILDING_W + 1.2 - 23.4) / 2; // ~7.9m each side
  const roofRailFrontL = new THREE.Mesh(new THREE.BoxGeometry(railSideW, 0.9, 0.35), roofRailMat);
  roofRailFrontL.position.set(-halfW - 0.6 + railSideW / 2, BUILDING_H + 0.45, -halfD - 0.5);
  const roofRailFrontR = new THREE.Mesh(new THREE.BoxGeometry(railSideW, 0.9, 0.35), roofRailMat);
  roofRailFrontR.position.set(halfW + 0.6 - railSideW / 2, BUILDING_H + 0.45, -halfD - 0.5);

  const roofRailBack = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W + 1.2, 0.9, 0.35), roofRailMat);
  roofRailBack.position.set(0, BUILDING_H + 0.45, halfD + 0.5);
  const roofRailLeft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, BUILDING_D + 1.2), roofRailMat);
  roofRailLeft.position.set(-halfW - 0.5, BUILDING_H + 0.45, 0);
  const roofRailRight = roofRailLeft.clone();
  roofRailRight.position.x = halfW + 0.5;
  for (const r of [roofRailFrontL, roofRailFrontR, roofRailBack, roofRailLeft, roofRailRight]) markSolid(r);
  bldgGroup.add(roofRailFrontL, roofRailFrontR, roofRailBack, roofRailLeft, roofRailRight);

  // Rooftop HVAC units & Antenna
  const hvac1 = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 2.5), metalFrameMat);
  hvac1.position.set(-6, BUILDING_H + 0.9, 0);
  const hvac2 = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.0, 3.0), metalFrameMat);
  hvac2.position.set(8, BUILDING_H + 1.0, 4);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.2, 0.4, 16), metalFrameMat);
  dish.rotation.x = Math.PI / 4;
  dish.position.set(0, BUILDING_H + 1.8, -4);
  markSolid(hvac1);
  markSolid(hvac2);
  bldgGroup.add(hvac1, hvac2, dish);

  // Exterior Walls (Solid box geometry with real openings)
  // Back Wall (South, Z = +halfD)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W, BUILDING_H, 0.6), exteriorWallMat);
  backWall.position.set(0, BUILDING_H / 2, halfD);
  markSolid(backWall);
  bldgGroup.add(backWall);

  // Left Wall (West, X = -halfW)
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, BUILDING_H, BUILDING_D), exteriorWallMat);
  leftWall.position.set(-halfW, BUILDING_H / 2, 0);
  markSolid(leftWall);
  bldgGroup.add(leftWall);

  // Right Wall (East, X = +halfW)
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, BUILDING_H, BUILDING_D), exteriorWallMat);
  rightWall.position.set(halfW, BUILDING_H / 2, 0);
  markSolid(rightWall);
  bldgGroup.add(rightWall);

  // Front Wall (North, Z = -halfD)
  // Leaves 6.4m central opening for entrance doors (X: -3.2 to +3.2)
  const doorWidth = 6.4;
  const sideWallWidth = (BUILDING_W - doorWidth) / 2; // 15.8m on each side
  const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(sideWallWidth, BUILDING_H, 0.6), exteriorWallMat);
  frontLeft.position.set(-halfW + sideWallWidth / 2, BUILDING_H / 2, -halfD);
  markSolid(frontLeft);

  const frontRight = new THREE.Mesh(new THREE.BoxGeometry(sideWallWidth, BUILDING_H, 0.6), exteriorWallMat);
  frontRight.position.set(halfW - sideWallWidth / 2, BUILDING_H / 2, -halfD);
  markSolid(frontRight);

  // Entrance Door Header
  const doorHeaderH = BUILDING_H - 4.2; // 2.6m header
  const frontHeader = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeaderH, 0.6), exteriorWallMat);
  frontHeader.position.set(0, 4.2 + doorHeaderH / 2, -halfD);
  markSolid(frontHeader);

  bldgGroup.add(frontLeft, frontRight, frontHeader);

  // Front Display Windows (Cutout glass panels on front left and right walls)
  const windowLeft = new THREE.Mesh(new THREE.PlaneGeometry(10.0, 3.4), glassMat);
  windowLeft.position.set(-8.5, 2.5, -halfD - 0.32);
  const windowRight = windowLeft.clone();
  windowRight.position.x = 8.5;
  bldgGroup.add(windowLeft, windowRight);

  // Giant Main Marquee Exterior Sign: "PIXEL PARADISE ARCADE" (Simpsons Hit & Run / Pokemon Style)
  const marqueeWidth = 23.0;
  const marqueeHeight = 4.4;
  const casingDepth = 2.0; // Thick substantial 3D marquee cabinet box
  const mainSignTex = createSimpsonsPokemonArcadeSignTexture('wide_marquee');
  const marqueeSignMat = new THREE.MeshBasicMaterial({
    map: mainSignTex,
    toneMapped: false,
    side: THREE.FrontSide,
  });

  const marqueeGroup = new THREE.Group();
  marqueeGroup.name = 'arcade_exterior_main_marquee';
  // Positioned so the 2.0m thick cabinet anchors into the front wall and projects well out in front of the roof overhang
  // Roof overhang is at z = -halfD - 0.6 (-16.6).
  // Front face of sign sits at z = -18.02 (1.4m IN FRONT of the roof, completely unobstructed!)
  marqueeGroup.position.set(0, 6.4, -halfD - 1.0);

  // Heavy Metal Chassis Box Casing (z depth 2.0, spans z = -1.0 to +1.0)
  const marqueeCasing = new THREE.Mesh(
    new THREE.BoxGeometry(marqueeWidth + 0.4, marqueeHeight + 0.4, casingDepth),
    metalFrameMat
  );
  markSolid(marqueeCasing);
  marqueeGroup.add(marqueeCasing);

  // Heavy industrial steel support brackets underneath connecting cabinet to facade
  for (const bx of [-9, -3, 3, 9]) {
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, casingDepth),
      metalFrameMat
    );
    bracket.position.set(bx, -marqueeHeight / 2 - 0.22, 0);
    marqueeGroup.add(bracket);
  }

  // The Illuminated Front Signboard (Facing -Z towards entrance plaza, UNMIRRORED!)
  // Placed at z = -casingDepth / 2 - 0.02 (in front of casing face, zero roof obstruction)
  const signFrontZ = -casingDepth / 2 - 0.02;
  const marqueeSignPlaneGeom = createOrientedSignPlane(marqueeWidth, marqueeHeight, 'negZ');
  const marqueeSign = new THREE.Mesh(marqueeSignPlaneGeom, marqueeSignMat);
  marqueeSign.position.z = signFrontZ;
  marqueeGroup.add(marqueeSign);

  // Physical 3D Glowing Neon Tube Accents framing the front marquee perimeter
  const neonRailTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, marqueeWidth + 0.3, 8),
    neonPinkMat
  );
  neonRailTop.rotation.z = Math.PI / 2;
  neonRailTop.position.set(0, marqueeHeight / 2 + 0.16, signFrontZ - 0.02);

  const neonRailBottom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, marqueeWidth + 0.3, 8),
    neonCyanMat
  );
  neonRailBottom.rotation.z = Math.PI / 2;
  neonRailBottom.position.set(0, -marqueeHeight / 2 - 0.16, signFrontZ - 0.02);

  const neonRailLeft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, marqueeHeight + 0.3, 8),
    neonPinkMat
  );
  neonRailLeft.position.set(-marqueeWidth / 2 - 0.16, 0, signFrontZ - 0.02);

  const neonRailRight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, marqueeHeight + 0.3, 8),
    neonCyanMat
  );
  neonRailRight.position.set(marqueeWidth / 2 + 0.16, 0, signFrontZ - 0.02);

  marqueeGroup.add(neonRailTop, neonRailBottom, neonRailLeft, neonRailRight);
  bldgGroup.add(marqueeGroup);

  // Neon Portico Canopy over entrance (lowered to Y = 3.75 so the marquee above is 100% visible)
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 2.4, 0.3, 2.6), createMaterial(0x1e1b2e));
  canopy.position.set(0, 3.75, -halfD - 1.3);
  markSolid(canopy);
  const canopyNeon = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 2.5, 0.08, 2.7), neonPinkMat);
  canopyNeon.position.set(0, 3.65, -halfD - 1.3);
  bldgGroup.add(canopy, canopyNeon);

  // Radiant Neon Illumination Wash under canopy and on forecourt floor
  const canopyWashLight = new THREE.PointLight(0xff007f, 1.8, 14);
  canopyWashLight.position.set(0, 3.4, -halfD - 1.3);
  const entranceGlowYellow = new THREE.PointLight(0xffe600, 1.6, 12);
  entranceGlowYellow.position.set(0, 3.4, -halfD - 0.4);
  bldgGroup.add(canopyWashLight, entranceGlowYellow);

  // Exterior Wall Posters
  const posterSpecs = [
    { title: 'REDLINE RUSH', sub: 'DUAL COCKPIT SIM', x: -14, col: '#ef4444' },
    { title: 'RETRO HIT & RUN', sub: '8-BIT HIGHWAY', x: -5, col: '#eab308' },
    { title: 'GALAXY DEFENDER', sub: 'SPACE COMBAT 1983', x: 5, col: '#06b6d4' },
    { title: 'CYBER PUNCHOUT', sub: 'CHAMPIONSHIP RING', x: 14, col: '#f59e0b' },
  ];
  posterSpecs.forEach((spec) => {
    const posterMat = new THREE.MeshBasicMaterial({
      map: createArcadeLabelTexture(spec.title, 2.0, 3.0, spec.col, '#0d071d', spec.sub, spec.col),
      toneMapped: false,
    });
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), posterMat);
    poster.position.set(spec.x, 2.6, -halfD - 0.32);
    bldgGroup.add(poster);
  });

  // -------------------------------------------------------------------------
  // 4. ENTRANCE AUTOMATIC GLASS SLIDING DOOR
  // -------------------------------------------------------------------------
  const entranceDoor = new Door({
    id: 'pixel_paradise_arcade_entrance_door',
    name: 'Pixel Paradise Arcade Main Entrance',
    houseName: 'Pixel Paradise Arcade',
    type: 'double_slide',
    width: doorWidth,
    height: 4.2,
    worldPos: new THREE.Vector3(BUILDING_X, 0, FRONT_Z + 0.05),
    rotationY: 0,
    frameColor: 0x2a1b4e,
    glassColor: 0x8be9fd,
    slideDistance: 2.6,
    depth: 0.20,
  });
  entranceDoor.setAutomatic(5.8, 1.25);
  doors.push(entranceDoor);
  root.add(entranceDoor.group);

  // -------------------------------------------------------------------------
  // 5. INTERIOR ARCHITECTURE & DECORATION
  // -------------------------------------------------------------------------
  // Ceiling with exposed steel trusses & neon geometric chandeliers
  for (let z = -halfD + 4; z <= halfD - 4; z += 6) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(BUILDING_W - 1.2, 0.25, 0.45), metalFrameMat);
    truss.position.set(0, BUILDING_H - 0.3, z);
    bldgGroup.add(truss);

    // Hanging Neon Hexagon / Ring
    const neonRing = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.06, 8, 24), z % 12 === 0 ? neonPinkMat : neonCyanMat);
    neonRing.rotation.x = Math.PI / 2;
    neonRing.position.set(0, BUILDING_H - 1.2, z);
    bldgGroup.add(neonRing);
  }

  // -------------------------------------------------------------------------
  // 6. ZONE 4: PRIZE COUNTER & TOKEN REDEMPTION (Front-Right, X: 12 to 17, Z: -12 to -14)
  // -------------------------------------------------------------------------
  const counterGroup = new THREE.Group();
  counterGroup.position.set(13.5, 0, -11.5);

  const counterDesk = new THREE.Mesh(new THREE.BoxGeometry(7.0, 1.1, 1.2), createMaterial(0x3730a3, 0.4, 0.2));
  counterDesk.position.set(0, 0.55, 0);
  markSolid(counterDesk);

  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.12, 1.4), createMaterial(0xf3f4f6, 0.2, 0.8));
  counterTop.position.set(0, 1.15, 0);
  counterGroup.add(counterDesk, counterTop);

  // Prize Showcase Shelves Behind Counter
  const shelfBack = new THREE.Mesh(new THREE.BoxGeometry(7.0, 3.2, 0.6), createMaterial(0x1e1b4b));
  shelfBack.position.set(0, 2.2, -2.4);
  markSolid(shelfBack);
  counterGroup.add(shelfBack);

  // Giant Plushies on shelves
  const plush1 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), createMaterial(0xfacc15)); // Pikachu yellow
  plush1.position.set(-1.8, 1.8, -2.0);
  const plush2 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.2, 12, 20), createMaterial(0xf472b6)); // Donut pink
  plush2.position.set(0, 1.8, -2.0);
  const plush3 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), createMaterial(0x38bdf8)); // Snorlax / blue plush
  plush3.position.set(1.8, 1.8, -2.0);
  counterGroup.add(plush1, plush2, plush3);

  // "TICKETS & PRIZES" Overhead Sign
  const prizeSignTex = createArcadeLabelTexture('TICKETS & PRIZES', 5.0, 1.2, '#fde047', '#311042', '★ REDEEM TICKETS HERE ★', '#a855f7');
  const prizeSign = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.2, 0.2), new THREE.MeshBasicMaterial({ map: prizeSignTex, toneMapped: false }));
  prizeSign.position.set(0, 3.6, -1.2);
  counterGroup.add(prizeSign);

  bldgGroup.add(counterGroup);

  // -------------------------------------------------------------------------
  // 7. ZONE 5: ARCADE LOUNGE & SEATING (Front-Left, X: -13.5, Z: -11.5)
  // -------------------------------------------------------------------------
  const loungeGroup = new THREE.Group();
  loungeGroup.position.set(-13.5, 0, -11.5);

  const boothTable = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.6), createMaterial(0x111827));
  boothTable.position.set(0, 0.45, 0);
  const benchL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.8), createMaterial(0xdc2626)); // Red vinyl
  benchL.position.set(0, 0.3, -1.4);
  const benchR = benchL.clone();
  benchR.position.set(0, 0.3, 1.4);
  markSolid(boothTable);
  markSolid(benchL);
  markSolid(benchR);
  loungeGroup.add(boothTable, benchL, benchR);

  // Snack / Soda Machines
  const sodaMachine = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.2), createMaterial(0xb91c1c));
  sodaMachine.position.set(-3.5, 1.2, 0);
  markSolid(sodaMachine);
  loungeGroup.add(sodaMachine);

  bldgGroup.add(loungeGroup);

  // -------------------------------------------------------------------------
  // 8. MODULAR ARCADE CABINET SYSTEM
  // Custom 3D builders for upright cabinets and twin-cockpit racing rigs!
  // -------------------------------------------------------------------------
  const buildUprightCabinetMesh = (
    title: string,
    subtitle: string,
    bodyColor: number,
    screenGlowColor: number,
    accentColor: string
  ): THREE.Group => {
    const cab = new THREE.Group();

    const bodyMat = createMaterial(bodyColor, 0.4, 0.2);
    const darkInteriorMat = createMaterial(0x0f172a);
    const marqueeTex = createArcadeLabelTexture(title, 2.0, 0.8, '#ffffff', '#090514', subtitle, accentColor);
    const marqueeMat = new THREE.MeshBasicMaterial({ map: marqueeTex, toneMapped: false });

    // Main angled side panels
    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 1.2), bodyMat);
    leftSide.position.set(-0.54, 1.15, 0);
    const rightSide = leftSide.clone();
    rightSide.position.x = 0.54;
    markSolid(leftSide, 0.02);
    markSolid(rightSide, 0.02);

    // Back Panel
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.3, 0.08), darkInteriorMat);
    back.position.set(0, 1.15, -0.56);
    markSolid(back, 0.02);

    // Lower Coin Door
    const coinDoor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.08), createMaterial(0x1e293b, 0.3, 0.8));
    coinDoor.position.set(0, 0.45, 0.5);
    markSolid(coinDoor, 0.02);

    // Control Panel (Angled surface with joysticks & buttons)
    const controlDeck = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.15, 0.55), createMaterial(0x0f172a));
    controlDeck.position.set(0, 0.95, 0.42);
    controlDeck.rotation.x = 0.15;
    markSolid(controlDeck, 0.02);

    // Joysticks & Buttons
    const stickShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), metalFrameMat);
    stickShaft.position.set(-0.25, 1.08, 0.42);
    const stickBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), neonPinkMat);
    stickBall.position.set(-0.25, 1.16, 0.42);
    cab.add(stickShaft, stickBall);

    // Buttons
    for (let b = 0; b < 4; b++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 8), b % 2 === 0 ? neonCyanMat : neonGoldMat);
      btn.position.set(0.1 + (b % 2) * 0.12, 1.04, 0.36 + Math.floor(b / 2) * 0.1);
      cab.add(btn);
    }

    // Angled CRT Screen Bezel
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.75, 0.1), createMaterial(0x0a0a0a));
    bezel.position.set(0, 1.48, 0.18);
    bezel.rotation.x = -0.25;

    // Glowing CRT Display (Attract Screen)
    const crtScreenMat = new THREE.MeshBasicMaterial({
      map: createArcadeLabelTexture(title, 1.6, 1.2, '#ffffff', '#05020c', 'INSERT COIN', accentColor),
      toneMapped: false,
    });
    const crtScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.65), crtScreenMat);
    crtScreen.position.set(0, 1.48, 0.24);
    crtScreen.rotation.x = -0.25;

    // Top Illuminated Marquee
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.15), marqueeMat);
    marquee.position.set(0, 2.05, 0.38);

    cab.add(leftSide, rightSide, back, coinDoor, controlDeck, bezel, crtScreen, marquee);
    return cab;
  };

  const buildCockpitRacingRigMesh = (
    title: string,
    isDual: boolean,
    bodyColor: number,
    accentColor: string
  ): THREE.Group => {
    const rig = new THREE.Group();

    const bodyMat = createMaterial(bodyColor, 0.3, 0.3);
    const carbonMat = createMaterial(0x18181b, 0.6, 0.4);
    const seatRedMat = createMaterial(0xdc2626, 0.5, 0.2);

    const rigWidth = isDual ? 2.4 : 1.3;

    // Base Chassis
    const base = new THREE.Mesh(new THREE.BoxGeometry(rigWidth, 0.35, 2.5), carbonMat);
    base.position.set(0, 0.18, 0);
    markSolid(base, 0.05);

    // Front Dashboard & Display Console
    const dashConsole = new THREE.Mesh(new THREE.BoxGeometry(rigWidth, 1.4, 0.8), bodyMat);
    dashConsole.position.set(0, 0.9, -0.8);
    markSolid(dashConsole, 0.05);

    // Dual Dashboard Screens
    const screenCount = isDual ? 2 : 1;
    const xOffsets = isDual ? [-0.58, 0.58] : [0];

    xOffsets.forEach((ox) => {
      // Screen
      const screenTex = createArcadeLabelTexture(title, 1.4, 0.9, '#ef4444', '#1c0404', 'REDLINE RUSH SIM', '#f59e0b');
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
      screen.position.set(ox, 1.25, -0.38);
      screen.rotation.x = -0.2;

      // Steering Wheel
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 20), metalFrameMat);
      wheel.position.set(ox, 0.95, -0.32);
      wheel.rotation.x = Math.PI / 3.5;

      // Racing Bucket Seat
      const seatBottom = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.28, 0.65), seatRedMat);
      seatBottom.position.set(ox, 0.45, 0.55);
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.2), seatRedMat);
      seatBack.position.set(ox, 0.95, 0.85);
      seatBack.rotation.x = -0.15;
      markSolid(seatBottom);
      markSolid(seatBack);

      rig.add(screen, wheel, seatBottom, seatBack);
    });

    // Overhead Rig Marquee
    const marqueeTex = createArcadeLabelTexture(title, 2.6, 0.7, '#ff3333', '#110202', 'DUAL RACING SIMULATOR', accentColor);
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(rigWidth + 0.2, 0.4, 0.3), new THREE.MeshBasicMaterial({ map: marqueeTex, toneMapped: false }));
    marquee.position.set(0, 2.1, -0.8);

    const pillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), metalFrameMat);
    pillarL.position.set(-rigWidth / 2 + 0.1, 1.7, -0.8);
    const pillarR = pillarL.clone();
    pillarR.position.x = rigWidth / 2 - 0.1;

    rig.add(base, dashConsole, marquee, pillarL, pillarR);
    return rig;
  };

  // -------------------------------------------------------------------------
  // 9. AUTHORING THE CABINET PLACEMENTS IN THE INTERIOR
  // Zone 1: Speedway Simulators (Left Wing, facing East +X towards aisle)
  // Zone 2: Action & Sci-Fi (Right Wing, facing West -X towards aisle)
  // Zone 3: Championship Showcase (Center-Back, facing North -Z)
  // -------------------------------------------------------------------------
  interface CabinetPlacement {
    id: string;
    name: string;
    gameId: string;
    type: 'cockpit_twin' | 'upright';
    localX: number;
    localZ: number;
    rotY: number;
    color: number;
    glow: number;
    accent: string;
    sub: string;
  }

  const cabinetConfigs: CabinetPlacement[] = [
    // LEFT WING (Facing East: rotY = Math.PI / 2)
    {
      id: 'arcade_cab_redline_rush_twin',
      name: 'Redline Rush • Dual Cockpit Sim',
      gameId: 'redline_rush',
      type: 'cockpit_twin',
      localX: -11.0,
      localZ: -4.0,
      rotY: Math.PI / 2,
      color: 0xdc2626,
      glow: 0xff0000,
      accent: '#ef4444',
      sub: 'DUAL RACER',
    },
    {
      id: 'arcade_cab_retro_hit_run_1',
      name: 'Retro Hit & Run 8-Bit',
      gameId: 'retro_hit_and_run',
      type: 'upright',
      localX: -11.0,
      localZ: 1.5,
      rotY: Math.PI / 2,
      color: 0xeab308,
      glow: 0xfacc15,
      accent: '#eab308',
      sub: '8-BIT RACER',
    },
    {
      id: 'arcade_cab_neon_pac_runner',
      name: 'Neon Pac-Runner',
      gameId: 'neon_pac_runner',
      type: 'upright',
      localX: -11.0,
      localZ: 5.0,
      rotY: Math.PI / 2,
      color: 0xfacc15,
      glow: 0xfde047,
      accent: '#eab308',
      sub: 'MAZE CHASE',
    },
    {
      id: 'arcade_cab_modular_expansion',
      name: 'Custom Sim Expansion Port',
      gameId: 'custom_modular_expansion',
      type: 'upright',
      localX: -11.0,
      localZ: 8.5,
      rotY: Math.PI / 2,
      color: 0x9333ea,
      glow: 0xa855f7,
      accent: '#a855f7',
      sub: 'IMPORT PORT',
    },

    // RIGHT WING (Facing West: rotY = -Math.PI / 2)
    {
      id: 'arcade_cab_galaxy_defender_1',
      name: 'Galaxy Defender (1983)',
      gameId: 'galaxy_defender',
      type: 'upright',
      localX: 11.0,
      localZ: -4.0,
      rotY: -Math.PI / 2,
      color: 0x0284c7,
      glow: 0x38bdf8,
      accent: '#06b6d4',
      sub: 'SPACE SHOOTER',
    },
    {
      id: 'arcade_cab_cyber_punchout_1',
      name: 'Cyber Punchout: Ring Masters',
      gameId: 'cyber_punchout',
      type: 'upright',
      localX: 11.0,
      localZ: 1.5,
      rotY: -Math.PI / 2,
      color: 0xd97706,
      glow: 0xfbbf24,
      accent: '#f59e0b',
      sub: 'BRAWLER / BOXING',
    },
    {
      id: 'arcade_cab_cyber_breakout_1',
      name: 'Cyber Breakout 2000',
      gameId: 'cyber_breakout',
      type: 'upright',
      localX: 11.0,
      localZ: 5.0,
      rotY: -Math.PI / 2,
      color: 0x0891b2,
      glow: 0x22d3ee,
      accent: '#06b6d4',
      sub: 'BRICK BREAKER',
    },
    {
      id: 'arcade_cab_galaxy_defender_2',
      name: 'Galaxy Defender II: Super Nova',
      gameId: 'galaxy_defender',
      type: 'upright',
      localX: 11.0,
      localZ: 8.5,
      rotY: -Math.PI / 2,
      color: 0x4f46e5,
      glow: 0x818cf8,
      accent: '#6366f1',
      sub: 'SPACE SHOOTER II',
    },

    // BACK CENTER FEATURE ROW (Facing South: rotY = Math.PI)
    {
      id: 'arcade_cab_redline_rush_champ',
      name: 'Redline Rush • Championship Edition',
      gameId: 'redline_rush',
      type: 'cockpit_twin',
      localX: -4.5,
      localZ: 11.5,
      rotY: Math.PI,
      color: 0xb91c1c,
      glow: 0xef4444,
      accent: '#ef4444',
      sub: 'PRO COCKPIT',
    },
    {
      id: 'arcade_cab_neon_pac_champ',
      name: 'Neon Pac-Runner Deluxe',
      gameId: 'neon_pac_runner',
      type: 'upright',
      localX: 0.0,
      localZ: 11.5,
      rotY: Math.PI,
      color: 0xca8a04,
      glow: 0xfde047,
      accent: '#eab308',
      sub: 'ARCADE LEGEND',
    },
    {
      id: 'arcade_cab_cyber_punchout_champ',
      name: 'Cyber Punchout • Title Match',
      gameId: 'cyber_punchout',
      type: 'upright',
      localX: 4.5,
      localZ: 11.5,
      rotY: Math.PI,
      color: 0xb45309,
      glow: 0xf59e0b,
      accent: '#f59e0b',
      sub: 'TITLE FIGHT',
    },
  ];

  cabinetConfigs.forEach((cfg) => {
    let mesh: THREE.Group;
    if (cfg.type === 'cockpit_twin') {
      mesh = buildCockpitRacingRigMesh(cfg.name, true, cfg.color, cfg.accent);
    } else {
      mesh = buildUprightCabinetMesh(cfg.name, cfg.sub, cfg.color, cfg.glow, cfg.accent);
    }

    mesh.name = cfg.id;
    mesh.position.set(cfg.localX, 0, cfg.localZ);
    mesh.rotation.y = cfg.rotY;
    bldgGroup.add(mesh);

    // Calculate player interaction target position (standing in front of machine)
    const forwardOffset = cfg.type === 'cockpit_twin' ? 1.6 : 1.2;
    const targetObj = new THREE.Object3D();
    targetObj.position.set(0, 0.1, forwardOffset);
    mesh.add(targetObj);
    mesh.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3();
    targetObj.getWorldPosition(worldPos);
    mesh.remove(targetObj);

    arcadeMachines.push({
      id: cfg.id,
      name: cfg.name,
      position: worldPos,
      gameId: cfg.gameId,
    });
  });

  root.add(bldgGroup);

  // -------------------------------------------------------------------------
  // 10. LANDMARK REGISTRATION FOR MAP & FAST TRAVEL
  // -------------------------------------------------------------------------
  landmarks.push({
    id: 'pixel_paradise_arcade',
    name: 'Pixel Paradise Arcade & Mini-Games',
    category: 'countryside',
    x: BUILDING_X,
    z: BUILDING_Z,
    icon: 'star',
    color: '#e040fb',
    travelX: BUILDING_X,
    travelZ: -281, // plaza sidewalk right outside entrance
    travelYaw: Math.PI, // facing south towards the arcade entrance
  });

  // -------------------------------------------------------------------------
  // 11. WALL COLLIDERS REGISTRATION
  // -------------------------------------------------------------------------
  // Building Outer Boundary Boxes for BUILDING_X = 8, BUILDING_Z = -305
  // Front entrance at Z = -289 (North), Back wall at Z = -321 (South)
  wallColliders.push(
    // Back Wall (South, Z = -321)
    {
      id: 'arcade_back_wall',
      minX: BUILDING_X - halfW,
      maxX: BUILDING_X + halfW,
      minZ: BUILDING_Z - halfD - 0.4,
      maxZ: BUILDING_Z - halfD + 0.4,
      collisionRole: 'fixed',
    },
    // Left Wall (West, X = -11)
    {
      id: 'arcade_left_wall',
      minX: BUILDING_X - halfW - 0.4,
      maxX: BUILDING_X - halfW + 0.4,
      minZ: BUILDING_Z - halfD,
      maxZ: BUILDING_Z + halfD,
      collisionRole: 'fixed',
    },
    // Right Wall (East, X = 27)
    {
      id: 'arcade_right_wall',
      minX: BUILDING_X + halfW - 0.4,
      maxX: BUILDING_X + halfW + 0.4,
      minZ: BUILDING_Z - halfD,
      maxZ: BUILDING_Z + halfD,
      collisionRole: 'fixed',
    },
    // Front Left Wall (leaves central entrance opening at X = 8 ± 3.2)
    {
      id: 'arcade_front_left_wall',
      minX: BUILDING_X - halfW,
      maxX: BUILDING_X - 3.2,
      minZ: BUILDING_Z + halfD - 0.4,
      maxZ: BUILDING_Z + halfD + 0.4,
      collisionRole: 'fixed',
    },
    // Front Right Wall (leaves central entrance opening at X = 8 ± 3.2)
    {
      id: 'arcade_front_right_wall',
      minX: BUILDING_X + 3.2,
      maxX: BUILDING_X + halfW,
      minZ: BUILDING_Z + halfD - 0.4,
      maxZ: BUILDING_Z + halfD + 0.4,
      collisionRole: 'fixed',
    }
  );

  return {
    group: root,
    landmarks,
    destructibles,
    doors,
    wallColliders,
    arcadeMachines,
    update: (dt: number) => {
      // Subtle pulse on neon star topper
      starTopper.rotation.y += dt * 1.5;
    },
  };
}
