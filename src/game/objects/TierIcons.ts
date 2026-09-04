import Phaser from 'phaser';
import { Theme, materialLighting, toneForNormal } from '../ui/Theme';
import { CHAINS, getTierDef } from '../data/chains';
import { GraphicsRecorder } from './GraphicsRecorder';

/**
 * Procedural vector art for each tier of both chains. Each function draws
 * directly into a Graphics object, centered at (0,0), sized to fit roughly
 * within an `s`-sized box. No bitmap assets required.
 *
 * Visual direction is modern, dark minimalist, organic minimalist and
 * brutalist, with about 10% industrial techno (see README). Applied to art here, that means: abstract geometric
 * solids, not representational illustration. There are no depicted tools,
 * machines or scenes anywhere in this game's art language - only materials
 * and refined objects. The "industrial techno" tenth is a thin machined
 * line or a precise indicator, never the subject.
 *
 * Design rule: a tier's
 * refinement reads as increasing GEOMETRIC ORDER, not added decoration.
 * Tier 1-2 are rough, irregular, hand-broken-looking shapes (a wood
 * splinter, a chunk of gravel). Tier 4+ become precise, engineered forms
 * (a squared block, a faceted gem) - refinement is "this got more precise
 * and deliberate," not "this got busier." The exception is the final two
 * tiers of each chain (8 and 9, since chains gained a 9th masterwork
 * capstone beyond the original 8-tier top - see
 * docs/FAMILIES_ROADMAP.md), which get an escalating luxury accent (a
 * gilt inlay line, a couple of sparkle motes, more of both at 9 than 8) -
 * a deliberate flourish reserved for the very end of a chain, not
 * scattered decoration throughout. Shape still has to carry the "this is
 * an upgrade" read on its own even across 8->9 - the accent tops it off,
 * it doesn't substitute for a real silhouette change.
 *
 * Every shape is lit by a fixed upper-left light source via the 5-tone
 * `Palette` (highlight/light/base/dark/shadow, see ui/Theme.ts
 * `materialLighting`) so materials read as physically lit objects, not
 * flat icons - see TileView.ts, which draws no card/frame behind these;
 * the shape's own silhouette IS the tile.
 *
 * To swap in real illustrated/bitmap art later: replace the call site in
 * TileView (`drawTierIcon(...)`) with `scene.add.sprite(0, 0, textureKey)`
 * and delete this file.
 */

export interface Palette {
  highlight: number;
  light: number;
  base: number;
  dark: number;
  shadow: number;
}

/**
 * What `drawTierIcon` reports back about the icon it just drew.
 *
 * `materialAlpha` is the MATERIAL alpha the icon should be displayed at
 * (1 = fully opaque, for every Wood/Stone tier; < 1 for translucent
 * materials like Glass). The caller composes this with its own locked-state
 * dim rather than the two fighting over `icon.setAlpha` - drawing
 * translucency via a plain `g.setAlpha()` call from inside here would get
 * silently overwritten by TileView's lock-state alpha, which runs after
 * every draw.
 *
 * The three footprint fields describe where the drawn shape actually sits,
 * in the same pixel space as the `s` that was passed in. They exist so the
 * CALLER can own the contact shadow (see `drawTierIcon`'s note on shadow
 * ownership) without having to guess the icon's size.
 */
export interface IconRender {
  materialAlpha: number;
  footprint: IconFootprint;
}

/** Where a drawn icon actually sits, in the pixel space of the `s` it was drawn at. */
export interface IconFootprint {
  /** Width of the drawn shape - NOT `s`, which is only a nominal box. */
  width: number;
  height: number;
  /** Centre of the drawn shape. Rarely (0,0): most tiers are drawn off-axis. */
  centerX: number;
  centerY: number;
  /** y of the lowest drawn pixel - where the shape meets the ground. */
  baselineY: number;
}

/**
 * Draws the given tier's icon and reports its material alpha and footprint.
 *
 * **Shadow ownership:** no icon in this file draws a ground/contact shadow.
 * It used to be split - 8 tiers drew their own ground ellipse while 7 drew
 * none, and those 8 stacked their ellipse on top of TileView's own footprint
 * shadow at nearly the same y, producing a doubled smudge on some tiers and
 * a floating shape on others. The contact shadow is a property of the object
 * SITTING ON THE BOARD, not of the object, so the board-side caller owns it
 * and sizes it from the footprint returned here. The shop icon (BoardScene)
 * deliberately draws no contact shadow at all, because it is on a card, not
 * on the board - which is only expressible once the icon stops drawing one
 * unconditionally.
 *
 * Self-occlusion - an icon's own drop-shadow copy of its silhouette, the
 * shading between its faces - still belongs to the icon and stays here.
 */
export function drawTierIcon(g: Phaser.GameObjects.Graphics, typeId: string, tier: number, s: number, palette: Palette): IconRender {
  const materialAlpha = drawIconShape(g, typeId, tier, s, palette);
  const f = iconFootprint(typeId, tier);
  return {
    materialAlpha,
    footprint: {
      width: f.width * s,
      height: f.height * s,
      centerX: f.centerX * s,
      centerY: f.centerY * s,
      baselineY: f.baselineY * s
    }
  };
}

/** The raw per-tier dispatch. Split out so the measuring pass can run the identical geometry. */
function drawIconShape(g: Phaser.GameObjects.Graphics, typeId: string, tier: number, s: number, palette: Palette): number {
  let materialAlpha = 1;
  if (typeId.startsWith('currency-')) {
    drawCurrencyTier(g, typeId, tier, s, palette);
  } else if (typeId === 'decagon') {
    drawDecagon(g, s, palette);
  } else if (typeId === 'water') {
    drawWaterTier(g, tier, s, palette);
    materialAlpha = 0.88;
  } else if (typeId === 'mineral') {
    switch (tier) {
      case 1: drawSlate(g, s, palette); break;
      case 2: drawRubble(g, s, palette); break;
      case 3: drawGravel(g, s, palette); break;
      case 4: drawPolishedStone(g, s, palette); break;
      case 5: drawMarble(g, s, palette); break;
      case 6: drawGranite(g, s, palette); break;
      case 7: drawQuartz(g, s, palette); break;
      case 8: drawSapphire(g, s, palette); break;
      default: drawStarSapphire(g, s, palette);
    }
  } else if (typeId === 'glass') {
    switch (tier) {
      case 1: materialAlpha = drawRawSand(g, s, palette); break;
      case 2: materialAlpha = drawGlassShard(g, s, palette); break;
      case 3: materialAlpha = drawCutGlassBlock(g, s, palette); break;
      case 4: materialAlpha = drawCrystalBlock(g, s, palette); break;
      case 5: materialAlpha = drawBeveledCrystal(g, s, palette); break;
      case 6: materialAlpha = drawCrystalObelisk(g, s, palette); break;
      case 7: materialAlpha = drawCrystalLattice(g, s, palette); break;
      case 8: materialAlpha = drawPrismaticKnot(g, s, palette); break;
      default: materialAlpha = drawAuroraCrystal(g, s, palette); break;
    }
  } else {
    switch (tier) {
      case 1: drawScrapWood(g, s, palette); break;
      case 2: drawPinePlank(g, s, palette); break;
      case 3: drawOakPlank(g, s, palette); break;
      case 4: drawMapleBlock(g, s, palette); break;
      case 5: drawWalnutBlock(g, s, palette); break;
      case 6: drawMahoganyBlock(g, s, palette); break;
      case 7: drawEbonyBlock(g, s, palette); break;
      case 8: drawGildedRosewood(g, s, palette); break;
      default: drawRosewoodHeirloom(g, s, palette);
    }
  }

  return materialAlpha;
}

/**
 * Credits 01-06.
 *
 * Tiers 1 and 2 retain the established single-coin and twin-coin art.
 * Higher tiers gain distinct silhouettes matching their names: a stacked
 * column, wrapped roll, bound bundle, and compact vault.
 */
function drawCreditTier(g: Phaser.GameObjects.Graphics, tier: number, s: number, p: Palette): void {
  if (tier >= 3) {
    p = {
      highlight: 0xfac249,
      light: 0xf9c146,
      base: 0xf8c143,
      dark: 0xf1a935,
      shadow: 0xc77d1b
    };
  }
  const r = s * 0.16;
  const coin = (px: number, py: number, lit: boolean): void => {
    g.fillStyle(lit ? p.light : p.base, 1);
    g.fillCircle(px * s, py * s, r);
    g.lineStyle(Math.max(1, s * 0.018), p.highlight, 0.8);
    g.strokeCircle(px * s, py * s, r * 0.72);
  };
  if (tier === 1) {
    coin(0, 0.08, true);
    return;
  }
  if (tier === 2) {
    coin(-0.18, 0.12, false);
    coin(0, 0.08, true);
    return;
  }

  if (tier === 3) {
    // Layered coin stack with shaded rims and a detailed top face.
    g.fillStyle(p.shadow, 0.28);
    g.fillEllipse(0, s * 0.235, s * 0.53, s * 0.13);
    for (let i = 0; i < 4; i++) {
      const y = s * (0.18 - i * 0.075);
      g.fillStyle(p.shadow, 1);
      g.fillEllipse(0, y + s * 0.018, s * 0.5, s * 0.18);
      g.fillStyle(i === 3 ? p.light : i % 2 ? p.base : p.dark, 1);
      g.fillEllipse(0, y, s * 0.48, s * 0.17);
      g.lineStyle(Math.max(1, s * 0.018), p.shadow, 0.82);
      g.strokeEllipse(0, y, s * 0.48, s * 0.17);
      g.lineStyle(Math.max(1, s * 0.011), p.highlight, 0.9);
      g.strokeEllipse(-s * 0.04, y - s * 0.018, s * 0.31, s * 0.07);
    }
    const topY = -s * 0.045;
    g.lineStyle(Math.max(1, s * 0.014), p.dark, 0.9);
    g.strokeEllipse(0, topY, s * 0.32, s * 0.09);
    g.fillStyle(p.highlight, 0.88);
    g.fillEllipse(-s * 0.095, topY - s * 0.018, s * 0.09, s * 0.025);
    g.lineStyle(Math.max(1, s * 0.012), p.highlight, 0.8);
    g.strokeCircle(0, topY, s * 0.055);
    return;
  }

  if (tier === 4) {
    // Wrapped roll with dimensional wrapping, seams, and a detailed end-cap.
    g.fillStyle(p.shadow, 0.3);
    g.fillEllipse(0, s * 0.19, s * 0.62, s * 0.12);
    g.fillStyle(p.dark, 1);
    g.fillRoundedRect(-s * 0.29, -s * 0.12, s * 0.56, s * 0.29, s * 0.08);
    g.fillStyle(p.base, 1);
    g.fillRoundedRect(-s * 0.22, -s * 0.15, s * 0.44, s * 0.27, s * 0.06);
    g.lineStyle(Math.max(1, s * 0.018), p.shadow, 0.88);
    g.strokeRoundedRect(-s * 0.22, -s * 0.15, s * 0.44, s * 0.27, s * 0.06);
    g.fillStyle(p.light, 0.8);
    g.fillRoundedRect(-s * 0.18, -s * 0.12, s * 0.34, s * 0.055, s * 0.02);
    g.fillStyle(p.highlight, 0.92);
    g.fillRect(-s * 0.045, -s * 0.16, s * 0.09, s * 0.29);
    g.lineStyle(Math.max(1, s * 0.01), p.dark, 0.72);
    g.lineBetween(-s * 0.045, -s * 0.15, -s * 0.045, s * 0.12);
    g.lineBetween(s * 0.045, -s * 0.15, s * 0.045, s * 0.12);
    coin(-0.22, 0.015, false);
    g.lineStyle(Math.max(1, s * 0.013), p.shadow, 0.9);
    g.strokeCircle(-s * 0.22, s * 0.015, r * 0.72);
    g.fillStyle(p.highlight, 0.82);
    g.fillEllipse(-s * 0.265, -s * 0.035, s * 0.065, s * 0.025);
    return;
  }

  if (tier === 5) {
    // Three dimensional coin stacks bound into one unmistakable bundle.
    g.fillStyle(p.shadow, 0.3);
    g.fillEllipse(0, s * 0.245, s * 0.62, s * 0.13);
    [-0.16, 0, 0.16].forEach((x, index) => {
      const left = s * (x - 0.1);
      const top = -s * (0.1 + index * 0.015);
      g.fillStyle(index === 1 ? p.light : p.base, 1);
      g.fillRoundedRect(left, top, s * 0.2, s * 0.31, s * 0.045);
      g.lineStyle(Math.max(1, s * 0.016), p.shadow, 0.88);
      g.strokeRoundedRect(left, top, s * 0.2, s * 0.31, s * 0.045);
      for (let line = 1; line <= 3; line++) {
        const lineY = top + s * (line * 0.068);
        g.lineStyle(Math.max(1, s * 0.01), p.dark, 0.78);
        g.lineBetween(left + s * 0.012, lineY, left + s * 0.188, lineY);
        g.lineStyle(Math.max(1, s * 0.007), p.highlight, 0.72);
        g.lineBetween(left + s * 0.025, lineY - s * 0.009, left + s * 0.145, lineY - s * 0.009);
      }
      g.fillStyle(p.highlight, 0.82);
      g.fillRoundedRect(left + s * 0.026, top + s * 0.02, s * 0.055, s * 0.2, s * 0.018);
    });
    g.fillStyle(p.dark, 0.95);
    g.fillRoundedRect(-s * 0.058, -s * 0.17, s * 0.116, s * 0.41, s * 0.025);
    g.fillStyle(p.highlight, 0.95);
    g.fillRoundedRect(-s * 0.04, -s * 0.17, s * 0.08, s * 0.41, s * 0.02);
    g.fillStyle(p.light, 1);
    g.fillCircle(0, s * 0.035, s * 0.037);
    g.lineStyle(Math.max(1, s * 0.009), p.dark, 0.8);
    g.strokeCircle(0, s * 0.035, s * 0.037);
    return;
  }

  // A compact strongbox with a circular vault door and coin-gold trim.
  g.fillStyle(p.shadow, 1);
  g.fillRoundedRect(-s * 0.31, -s * 0.25, s * 0.62, s * 0.58, s * 0.07);
  g.fillStyle(p.dark, 1);
  g.fillRoundedRect(-s * 0.27, -s * 0.29, s * 0.54, s * 0.55, s * 0.06);
  g.lineStyle(Math.max(1.5, s * 0.025), p.highlight, 0.86);
  g.strokeRoundedRect(-s * 0.27, -s * 0.29, s * 0.54, s * 0.55, s * 0.06);
  g.fillStyle(p.base, 1);
  g.fillCircle(0, -s * 0.015, s * 0.145);
  g.lineStyle(Math.max(1, s * 0.016), p.highlight, 0.85);
  g.strokeCircle(0, -s * 0.015, s * 0.105);
  g.lineBetween(0, -s * 0.1, 0, s * 0.07);
  g.lineBetween(-s * 0.085, -s * 0.015, s * 0.085, -s * 0.015);
  g.fillStyle(p.light, 1);
  g.fillCircle(s * 0.21, s * 0.18, s * 0.035);
}

function drawCurrencyTier(g: Phaser.GameObjects.Graphics, typeId: string, tier: number, s: number, p: Palette): void {
  if (typeId === 'currency-credit') {
    drawCreditTier(g, tier, s, p);
    return;
  }
  // The count IS the tier, matching how `TileView` composes these same chains
  // on the board out of image sprites.
  //
  // This was `Math.min(6, tier + 1)`, giving 1, 2, 4, 5, 6 - it skipped three
  // and never matched the tier number. The credit chain was fixed on both
  // sides; gem and energy were fixed on the board only, so the same item drew
  // a different number of glyphs in the collection than in your hand. These
  // layouts are the board's, so the two agree again.
  // Loose CLUSTERS, not columns and rows. Aligned layouts made a stack of
  // gems read as a bar chart - drops and gems are things that pile up, so no
  // three of them should ever line up.
  const layouts: [number, number][][] = [
    [[0, 0.08]],
    [[-0.18, 0.12], [0, 0.08]],
    [[-0.16, 0.14], [0.17, 0.07], [0, -0.07]],
    [[-0.19, 0.14], [0.16, 0.15], [-0.04, 0], [0.19, -0.08]],
    [[-0.2, 0.16], [0.05, 0.19], [-0.15, -0.02], [0.2, 0.05], [0.02, -0.13]],
    [[-0.21, 0.17], [0.03, 0.2], [0.21, 0.1], [-0.16, 0.01], [0.11, -0.06], [-0.03, -0.17]]
  ];
  const layout = layouts[Phaser.Math.Clamp(tier, 1, layouts.length) - 1];
  for (let i = layout.length - 1; i >= 0; i--) {
    const [px, py] = layout[i];
    // Every unit is the SAME size as tier 2's, at every tier. Shrinking them
    // to fit more in made a tier-5 gem read as smaller and cheaper than a
    // tier-2 one - the opposite of what a merge should say. A cluster is
    // allowed to overlap and crowd instead.
    // Energy runs slightly larger than the round marks: a bolt is a narrow
    // zigzag, so at an equal radius it carries far less ink and reads smaller.
    const r = s * (typeId === 'currency-energy' ? 0.19 : 0.16);
    const x = px * s, y = py * s;
    if (typeId === 'currency-energy') {
      // Back to the two-triangle bolt this family carried before the
      // single-path rewrite.
      g.fillStyle(i === 0 ? p.light : p.base, 1);
      g.fillTriangle(x - r * 0.2, y - r, x - r, y + r * 0.15, x + r * 0.08, y + r * 0.04);
      g.fillTriangle(x + r * 0.08, y - r * 0.04, x + r, y - r * 0.15, x + r * 0.2, y + r);
    } else if (typeId === 'currency-gem') {
      g.fillStyle(i === 0 ? p.light : p.base, 1);
      g.fillTriangle(x, y - r, x - r * 0.75, y, x, y + r);
      g.fillTriangle(x, y - r, x + r * 0.75, y, x, y + r);
      g.lineStyle(Math.max(1, s * 0.018), p.highlight, 0.8);
      g.lineBetween(x, y - r * 0.8, x - r * 0.5, y);
    } else {
      g.fillStyle(i === 0 ? p.light : p.base, 1);
      g.fillCircle(x, y, r);
      g.lineStyle(Math.max(1, s * 0.018), p.highlight, 0.8);
      g.strokeCircle(x, y, r * 0.72);
    }
  }
}

/** Cool translucent geometry for the twelve-tier Water chain. */
function drawWaterTier(g: Phaser.GameObjects.Graphics, tier: number, s: number, p: Palette): void {
  const t = Phaser.Math.Clamp(tier, 1, 12);
  const ring = (rx: number, ry: number, y = s * 0.14): void => {
    g.lineStyle(Math.max(1, s * 0.035), p.light, 0.85);
    g.strokeEllipse(0, y, rx * 2, ry * 2);
  };
  const drop = (x: number, y: number, r: number): void => {
    g.fillStyle(p.base, 0.84);
    g.fillCircle(x, y, r);
    g.fillTriangle(x - r * 0.72, y - r * 0.4, x, y - r * 1.7, x + r * 0.72, y - r * 0.4);
    g.fillStyle(p.highlight, 0.7);
    g.fillCircle(x - r * 0.26, y - r * 0.28, Math.max(1, r * 0.2));
  };
  if (t === 1) drop(0, s * 0.14, s * 0.16);
  else if (t === 2) {
    // Keep the original drop artwork; only compose it as a large foreground
    // drop with a smaller companion lifted behind it.
    drop(s * 0.19, -s * 0.08, s * 0.125);
    drop(-s * 0.11, s * 0.16, s * 0.185);
  }
  else if (t === 3) { ring(s * 0.34, s * 0.12); ring(s * 0.23, s * 0.08); ring(s * 0.12, s * 0.04); }
  else if (t === 4) {
    g.fillStyle(p.dark, 0.55); g.fillEllipse(0, s * 0.2, s * 0.8, s * 0.26);
    g.fillStyle(p.base, 0.8); g.fillEllipse(0, s * 0.14, s * 0.72, s * 0.22); ring(s * 0.28, s * 0.07);
  } else if (t === 5) {
    g.lineStyle(s * 0.12, p.base, 0.86);
    g.beginPath(); g.moveTo(-s * 0.38, s * 0.2); g.lineTo(-s * 0.12, 0); g.lineTo(s * 0.1, s * 0.16); g.lineTo(s * 0.38, -s * 0.06); g.strokePath();
    g.lineStyle(Math.max(1, s * 0.03), p.highlight, 0.7);
    g.beginPath(); g.moveTo(-s * 0.38, s * 0.14); g.lineTo(-s * 0.12, -s * 0.06); g.lineTo(s * 0.1, s * 0.1); g.lineTo(s * 0.38, -s * 0.12); g.strokePath();
  } else if (t === 6) {
    g.fillStyle(p.dark, 0.9); g.fillRoundedRect(-s * 0.38, -s * 0.02, s * 0.76, s * 0.36, s * 0.06);
    g.fillStyle(p.base, 0.82); g.fillEllipse(0, -s * 0.02, s * 0.68, s * 0.22); ring(s * 0.27, s * 0.07, -s * 0.03);
  } else if (t === 7) {
    g.fillStyle(p.base, 0.8); g.fillRoundedRect(-s * 0.08, -s * 0.35, s * 0.16, s * 0.62, s * 0.05);
    g.fillTriangle(-s * 0.18, -s * 0.25, 0, -s * 0.55, s * 0.18, -s * 0.25); ring(s * 0.25, s * 0.07, s * 0.27);
  } else if (t === 8) {
    for (let i = -1; i <= 1; i++) {
      g.fillStyle(i === 0 ? p.light : p.base, 0.8);
      g.fillRoundedRect(i * s * 0.18 - s * 0.07, -s * (0.34 - Math.abs(i) * 0.09), s * 0.14, s * 0.58, s * 0.05);
    }
    ring(s * 0.32, s * 0.085, s * 0.26);
  } else if (t === 9) {
    // A genuine inward funnel rather than tier 3's three concentric ripples:
    // the continuous spiral tightens into a dark displaced throat, giving
    // the form direction, rotation and depth at board size.
    const cy = s * 0.06;
    g.fillStyle(p.dark, 0.72);
    g.fillEllipse(0, cy + s * 0.06, s * 0.78, s * 0.38);
    g.fillStyle(p.base, 0.78);
    g.fillEllipse(0, cy, s * 0.72, s * 0.31);
    const spiral: Phaser.Geom.Point[] = [];
    const turns = Math.PI * 4.25;
    for (let i = 0; i <= 42; i++) {
      const u = i / 42;
      const angle = u * turns;
      const radius = s * (0.34 * (1 - u) + 0.025);
      spiral.push(new Phaser.Geom.Point(
        Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius * 0.43 + u * s * 0.055
      ));
    }
    g.lineStyle(Math.max(1.5, s * 0.052), p.light, 0.94);
    g.strokePoints(spiral, false, false);
    g.fillStyle(p.shadow, 0.94);
    g.fillEllipse(s * 0.018, cy + s * 0.07, s * 0.13, s * 0.075);
    g.fillStyle(p.highlight, 0.72);
    g.fillEllipse(-s * 0.18, cy - s * 0.075, s * 0.16, s * 0.035);
  }
  else if (t === 10) {
    g.fillStyle(p.base, 0.75); g.fillCircle(0, 0, s * 0.34); g.fillStyle(p.light, 0.45); g.fillCircle(-s * 0.1, -s * 0.11, s * 0.15);
    g.lineStyle(Math.max(1, s * 0.025), p.highlight, 0.75); g.strokeCircle(0, 0, s * 0.34);
  } else if (t === 11) {
    g.lineStyle(s * 0.12, p.base, 0.84); g.strokeCircle(0, 0, s * 0.31);
    g.lineStyle(Math.max(1, s * 0.028), p.highlight, 0.8); g.strokeCircle(-s * 0.035, -s * 0.035, s * 0.28);
  } else {
    g.fillStyle(p.dark, 0.92); g.fillCircle(0, 0, s * 0.37); g.fillStyle(p.base, 0.84); g.fillCircle(0, 0, s * 0.29);
    g.fillStyle(p.light, 0.6); g.fillCircle(-s * 0.06, -s * 0.07, s * 0.17); g.fillStyle(p.highlight, 0.9); g.fillCircle(-s * 0.08, -s * 0.1, s * 0.055);
    g.lineStyle(Math.max(1, s * 0.03), p.highlight, 0.75); g.strokeCircle(0, 0, s * 0.37);
    g.lineBetween(-s * 0.48, 0, -s * 0.37, 0); g.lineBetween(s * 0.37, 0, s * 0.48, 0);
  }
}

/** Footprint expressed as a fraction of `s`, so one measurement serves every size. */
export type NormalisedFootprint = IconFootprint;

/**
 * Measured once per tier, then reused. Measuring is a full (drawing-free)
 * replay of the tier's geometry, which is cheap but not free, and TileView
 * redraws on every tier change, lock change and board rebuild.
 */
const footprintCache = new Map<string, NormalisedFootprint>();

/** Geometry never reads the palette, so any well-formed one serves the measuring pass. */
const MEASURE_PALETTE: Palette = {
  highlight: 0xffffff, light: 0xcccccc, base: 0x888888, dark: 0x444444, shadow: 0x000000
};

/**
 * Fallback for a tier that draws nothing measurable. Matches the constants
 * TileView used before footprints were measured, so a hypothetical
 * empty icon degrades to the old behaviour rather than to a zero-size
 * shadow or a crash.
 */
const DEFAULT_FOOTPRINT: NormalisedFootprint = {
  width: 0.4, height: 0.4, centerX: 0, centerY: 0.16, baselineY: 0.36
};

/**
 * The drawn extent of one tier's icon, as a fraction of the `s` it is drawn
 * at. Measured by replaying the real draw call through `GraphicsRecorder`
 * rather than declared in a table: these shapes are built from hand-authored
 * `s`-relative literals, so a table would be a second source of truth that
 * silently rots the first time a shape is retouched.
 *
 * Measured at s=100 rather than s=1 so that the handful of helpers with a
 * pixel floor in them (`dropOffset`'s `Math.max(1, ...)`, 1px rim strokes)
 * land in a realistic range instead of dominating the result.
 */
export function iconFootprint(typeId: string, tier: number): NormalisedFootprint {
  const key = `${typeId}:${tier}`;
  const cached = footprintCache.get(key);
  if (cached) return cached;

  const MEASURE_AT = 100;
  const recorder = new GraphicsRecorder();
  drawIconShape(recorder as unknown as Phaser.GameObjects.Graphics, typeId, tier, MEASURE_AT, MEASURE_PALETTE);

  const measured: NormalisedFootprint = recorder.hasGeometry
    ? {
        width: (recorder.maxX - recorder.minX) / MEASURE_AT,
        height: (recorder.maxY - recorder.minY) / MEASURE_AT,
        centerX: (recorder.minX + recorder.maxX) / 2 / MEASURE_AT,
        centerY: (recorder.minY + recorder.maxY) / 2 / MEASURE_AT,
        baselineY: recorder.maxY / MEASURE_AT
      }
    : DEFAULT_FOOTPRINT;

  footprintCache.set(key, measured);
  return measured;
}

/**
 * How an icon should be transformed to sit correctly in a board cell.
 * `scale` and the two offsets apply to the icon AND to its contact shadow
 * together, so the shadow keeps following the shape.
 */
export interface IconPresentation {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Target visual size per tier, as a fraction of the icon box.
 *
 * The measured sizes these replace spanned 2.39x (Stone tier 1 at 0.32, Wood
 * tier 2 at 0.76) and were NOT monotone with tier - Wood 2 was the largest
 * object in the entire game, bigger than any tier-9 masterwork, and Stone 8
 * (0.40) was smaller than Stone 3 (0.60). Since each shape was authored on
 * its own from hand-written `s`-relative literals, size carried no meaning at
 * all: it recorded which sitting the shape was drawn in, and it actively
 * fought the merge-satisfaction read, where the result of a merge must look
 * like more than what went into it.
 *
 * The band is deliberately narrow. Nine tiers of literal size growth would
 * make tier 1 a speck and tier 9 overflow its cell; the tier read is carried
 * by shape, facet count and lighting contrast, and size only needs to not
 * contradict them.
 */
// Raised from 0.46/0.62. At those values a tier-1 piece filled under half its
// cell, which is why the board read as small objects in big empty squares -
// and why every reference merge game draws its items closer to, or past, the
// cell edge. The band stays narrow for the reason above; it just sits higher.
const SIZE_AT_TIER_ONE = 0.68;
const SIZE_AT_TIER_NINE = 0.80;

/**
 * Items sit on a common ground line rather than being centred in their cell.
 * Centring would put a tall obelisk's shadow lower than a flat chip's, and a
 * board of objects whose contact shadows sit at different heights reads as
 * objects floating at different depths. Baselines were previously anywhere
 * from 0.14 to 0.44 of the box.
 */
const GROUND_LINE = 0.32;

/**
 * Widest an icon may be, as a fraction of the box.
 *
 * Above 1: a piece is allowed to overhang its cell slightly. The cell is a
 * hit target and a grid position, not a frame - the genre draws items that
 * break their square, and detail below ~40px of drawn art stops being
 * readable at all on a phone.
 */
const MAX_WIDTH = 1.16;

/** How far above centre a shape may reach. `s` is already 0.96 of the cell, so this is measured against that. */
const MAX_RISE = 0.74;

/**
 * Tallest an icon may be. Derived, not chosen: a shape standing on
 * GROUND_LINE reaches `height - GROUND_LINE` above centre, so anything
 * taller than this would have its top clipped. Capping height is what lets
 * the ground line be honoured unconditionally - the alternative, letting
 * tall shapes ride down until they fit, silently reintroduces the scattered
 * baselines this is here to remove.
 *
 * This cap is what sets the ceiling of the size ladder above, not the other
 * way round. Two forms are much taller than they are wide (the Glass
 * obelisk, the Stone marquise) and hit it first; a ladder whose top exceeded
 * what THOSE can reach would quietly break its own monotonicity, because
 * they would clamp while their neighbours kept growing.
 */
const MAX_HEIGHT = GROUND_LINE + MAX_RISE;

/**
 * The transform that puts one tier's icon at its intended size and on the
 * board's ground line. Applied by the caller at the seam rather than by
 * rewriting 27 hand-authored shapes - the shapes are correct in themselves,
 * it is only their sizes relative to each other that were arbitrary.
 */
/**
 * Per-icon corrections to the size ladder, keyed `typeId:tier`.
 *
 * The ladder sizes every icon by its bounding box, which is right for single
 * objects and slightly wrong for arrangements: a lone water droplet fills its
 * box, while the twin droplets share theirs, so the single one came out larger
 * than the biggest droplet in the pair it merges into. A merge must never
 * produce something that looks smaller.
 *
 * Deliberately a short list of exceptions rather than a per-icon size table -
 * the ladder is the rule, and every entry here is a shape whose bounding box
 * lies about how big it looks.
 */
const ICON_SIZE_CORRECTION: Record<string, number> = {
  'water:1': 0.86
};

/** How many tiers the family has, for normalising the size ladder across it. */
function chainLength(typeId: string): number {
  return CHAINS.find((chain) => chain.typeId === typeId)?.tiers.length ?? 9;
}

export function iconPresentation(typeId: string, tier: number, s: number): IconPresentation {
  const f = iconFootprint(typeId, tier);

  // sqrt(w*h) rather than width alone: normalising on width would blow a
  // tall narrow form (the obelisks, the marquise) far out of its cell to
  // make its narrow waist hit the target.
  const metric = Math.sqrt(f.width * f.height);
  // Normalised over the FAMILY's own chain length, not a fixed nine tiers.
  // Water runs to twelve, so dividing by 8 clamped its top three tiers to the
  // same size as tier 9 - three consecutive merges that produced nothing
  // bigger, in the one family long enough to notice.
  const topTier = Math.max(2, chainLength(typeId));
  const t = Math.min(Math.max((tier - 1) / (topTier - 1), 0), 1);
  const target = SIZE_AT_TIER_ONE + (SIZE_AT_TIER_NINE - SIZE_AT_TIER_ONE) * t;

  const correction = ICON_SIZE_CORRECTION[`${typeId}:${tier}`] ?? 1;
  let scale = metric > 0 ? (target * correction) / metric : 1;
  if (f.width * scale > MAX_WIDTH) scale = MAX_WIDTH / f.width;
  if (f.height * scale > MAX_HEIGHT) scale = MAX_HEIGHT / f.height;

  return {
    scale,
    offsetX: -f.centerX * scale * s,
    offsetY: (GROUND_LINE - f.baselineY * scale) * s
  };
}

/**
 * Crate colours. A crate is a CONTAINER, not a merge tier, so these are
 * deliberately metallic rather than drawn from any family's material ramp -
 * a crate must never be mistaken for something you can merge.
 */
const CRATE_COLORS: Record<string, number> = {
  // Polished COPPER rather than cast bronze: a pinker, brighter orange with
  // more red than yellow in it, keyed off drawn copper tube. 0xc86a2e still
  // sat close to a mid brown once the shadowed faces took it down, and brown
  // is the one thing a reward crate must never read as. This holds its hue
  // through the dark faces, which is what makes it look like metal that has
  // been polished rather than a painted box.
  bronze: 0xd07a4e,
  // Cool polished steel, not grey plastic: a touch lighter and bluer than the
  // old tone so the specular band below has somewhere bright to go.
  silver: 0xc4ccd6,
  // Deeper and slightly warmer than 0xe0a929, which lit up almost white at
  // the top of its ramp and lost the metal.
  gold: 0xdca92f,
  vault: 0x8f5ad6,
  // Pulled colder and darker, away from the silver case's light cool grey.
  // Two objects that are both "metal box" have to differ in VALUE, not only
  // in detail, or they read as the same thing at board size.
  shipping: 0x4d6270
};

/**
 * A shipping crate, in the game's isometric vector language: three lit
 * faces, a banded strap across the front, a lid seam, and corner brackets.
 *
 * Kept to broad planes and two straight lines - the "industrial techno"
 * tenth of the brief is a precise indicator, never decoration - so it reads
 * as machined freight at 40px rather than as a treasure chest. Nothing here
 * is representational beyond the box itself: no latches, hinges or glow.
 */
/**
 * The crate's front face as a fraction of the size argument. The DRAWN box -
 * face plus the projection - is `w + depth` wide by `h + depth` tall, and is
 * centred on the origin, so a caller wanting a 40px-wide crate asks for
 * `40 / CRATE_DRAWN.width` and positions it dead centre with no offset.
 */
export const CRATE_FACE = { w: 0.6, h: 0.3, depth: 0.13 };
export const CRATE_DRAWN = {
  width: CRATE_FACE.w + CRATE_FACE.depth,
  height: CRATE_FACE.h + CRATE_FACE.depth
};

export function drawCrate(g: Phaser.GameObjects.Graphics, s: number, tier: string): void {
  if (tier === 'shipping') {
    // An INTERMODAL CONTAINER, and deliberately not built from any of the hard
    // case's parts. The silver crate is now a polished case with latches,
    // bumpers and a specular sweep, and the old container - a light blue-grey
    // block with a few vertical lines - had drifted close enough to be
    // mistaken for it. A container is a different object: longer and lower,
    // deeply fluted end to end, corner castings at all four corners, and a
    // pair of doors with locking bars at one end. None of that vocabulary is
    // shared with a crate, so the two can never be confused again.
    // A RECTANGULAR PRISM, in a container's own proportions.
    //
    // This has been wrong in both directions. At 0.84 long by 0.13 deep the
    // receding planes were slivers and it read as a flat panel; correcting
    // that took it to 0.66 by 0.32 by 0.26, which is barely 2:1:1 - a box.
    // A real ISO container is nearer 5:1:1, so this runs 3.3:1:1: long enough
    // to be unmistakably a container, with the depth still carrying the
    // three-quarter view.
    const w = s * 0.72;
    const h = s * 0.22;
    const d = s * 0.22;
    const x = -(w + d) / 2;
    const y = (d - h) / 2;
    const front = materialLighting(CRATE_COLORS.shipping, 5);

    // Shell: front, receding end, and top, all centred on the origin.
    g.fillGradientStyle(front.light, front.light, front.shadow, front.dark, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(toneForNormal(front, 0), 1);
    g.beginPath();
    g.moveTo(x + w, y);
    g.lineTo(x + w + d, y - d);
    g.lineTo(x + w + d, y + h - d);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fillPath();
    g.fillGradientStyle(front.highlight, front.highlight, front.light, front.light, 1);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + d, y - d);
    g.lineTo(x + w + d, y - d);
    g.lineTo(x + w, y);
    g.closePath();
    g.fillPath();

    // Corrugation on the long side: many narrow flutes, which is what a
    // container reads as from across a yard and what a machined case never
    // has.
    const flutes = 13;
    for (let i = 0; i < flutes; i++) {
      const px = x + w * 0.05 + ((w * 0.9) * i) / flutes;
      g.fillStyle(front.highlight, 0.14);
      g.fillRect(px, y + h * 0.14, Math.max(1, s * 0.012), h * 0.72);
      g.fillStyle(front.shadow, 0.42);
      g.fillRect(px + Math.max(1, s * 0.012), y + h * 0.14, Math.max(1, s * 0.01), h * 0.72);
    }

    // The DOORS go on the receding end plane, not on the long side - that is
    // where a container's doors are, and putting them on the plane that
    // recedes is what sells the three-quarter view.
    const doorInset = 0.16;
    const dp = (u: number, v: number): [number, number] => [
      x + w + d * u,
      y - d * u + (h - 0) * v
    ];
    const [dx0, dy0] = dp(doorInset, 0.12);
    const [dx1, dy1] = dp(1 - doorInset, 0.12);
    const [dx2, dy2] = dp(1 - doorInset, 0.88);
    const [dx3, dy3] = dp(doorInset, 0.88);
    g.fillStyle(front.shadow, 0.4);
    g.beginPath();
    g.moveTo(dx0, dy0);
    g.lineTo(dx1, dy1);
    g.lineTo(dx2, dy2);
    g.lineTo(dx3, dy3);
    g.closePath();
    g.fillPath();
    // Locking bars, running down the doors along the same recede.
    g.lineStyle(Math.max(1, s * 0.014), front.highlight, 0.55);
    for (const u of [0.34, 0.46, 0.6, 0.72]) {
      const [bx0, by0] = dp(u, 0.14);
      const [bx1, by1] = dp(u, 0.86);
      g.lineBetween(bx0, by0, bx1, by1);
    }
    g.lineStyle(Math.max(1, s * 0.016), front.dark, 0.85);
    const [sx0, sy0] = dp(0.53, 0.12);
    const [sx1, sy1] = dp(0.53, 0.88);
    g.lineBetween(sx0, sy0, sx1, sy1);

    // Rails along the top of the long side, and the ridges across the roof -
    // the two lines that state the top plane is a plane.
    g.lineStyle(Math.max(1, s * 0.014), front.shadow, 0.45);
    for (const t2 of [0.3, 0.7]) {
      const rx = x + w * t2;
      g.lineBetween(rx + d * 0.15, y - d * 0.15, rx + d * 0.9, y - d * 0.9);
    }

    // Corner castings: the heavy blocks a container is lifted and stacked by.
    // Sized off the HEIGHT rather than the icon, so shortening the body does
    // not leave the castings eating a quarter of the end wall.
    const cast = h * 0.2;
    g.fillStyle(front.dark, 1);
    for (const cxp of [x, x + w - cast]) {
      for (const cyp of [y, y + h - cast]) g.fillRect(cxp, cyp, cast, cast);
    }
    g.fillStyle(toneForNormal(front, 0), 1);
    for (const v of [0, 1]) {
      const [ox, oy] = dp(1, v);
      g.fillRect(ox - cast, oy - (v === 0 ? 0 : cast), cast, cast);
    }

    g.lineStyle(Math.max(1.2, s * 0.02), front.dark, 0.85);
    g.strokeRect(x, y, w, h);
    return;
  }

  const base = CRATE_COLORS[tier] ?? CRATE_COLORS.bronze;
  // Bronze sits at 6 rather than 3. The tier argument drives CONTRAST, not
  // hue: at 3 the spread across the crate's three faces was so narrow that the
  // block read as flat brown paper. Metal needs the faces to separate.
  // Bronze/copper runs at 7 alongside gold: polished metal's whole tell is a
  // WIDE specular range - a near-white hit on the lit plane against a deep
  // shadowed one - and at 6 the copper's faces sat too close together to read
  // as polished.
  const p = materialLighting(base, tier === 'vault' ? 9 : tier === 'silver' ? 6 : 7);

  // ---- A HARD CASE, not a box ----
  //
  // The earlier version was a cube with a lid seam, which is a crate in the
  // packing sense and not in the game sense. A loot crate is a transit case:
  // WIDE and shallow, ribbed shell, end bumpers standing proud of the body,
  // two latches on the seam, and a blank instrument plate. Every part is a
  // machined one, so this stays a facility object rather than a treasure
  // chest.
  const w = s * CRATE_FACE.w;
  const h = s * CRATE_FACE.h;
  const depth = s * CRATE_FACE.depth;
  // Positioned so the DRAWN box - front face plus the projection up and to
  // the right - is centred on the origin. Callers used to correct for this
  // themselves with magic offsets, and each one got it slightly wrong.
  const x = -(w + depth) / 2;
  const y = (depth - h) / 2;

  // ---- shell: three planes, drawn here rather than through drawBlock so the
  // origin can be the centre of the drawn box.
  g.fillGradientStyle(p.light, p.light, p.shadow, p.dark, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(toneForNormal(p, 0), 1);
  g.beginPath();
  g.moveTo(x + w, y);
  g.lineTo(x + w + depth, y - depth);
  g.lineTo(x + w + depth, y + h - depth);
  g.lineTo(x + w, y + h);
  g.closePath();
  g.fillPath();
  g.fillGradientStyle(p.highlight, p.highlight, p.light, p.light, 1);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + depth, y - depth);
  g.lineTo(x + w + depth, y - depth);
  g.lineTo(x + w, y);
  g.closePath();
  g.fillPath();

  // ---- SPECULAR SHEEN.
  //
  // What actually makes drawn metal look like metal is not the face-to-face
  // ramp - that only says "this is a solid" - but a bright reflected BAND
  // sweeping across the surface, with a second weaker one and a dark trough
  // between them. Polished copper, steel and gold all read that way, and the
  // crate had none of it: three flat planes, so it looked painted.
  //
  // Drawn as narrow vertical strips with a gaussian falloff, which is the only
  // way to put a soft non-linear ramp inside a shape Graphics cannot gradient
  // directly. The same t runs across the top plane's parallelogram, so the
  // highlight carries over the fold instead of stopping at it.
  const gauss = (t: number, centre: number, width: number) =>
    Math.exp(-(((t - centre) / width) ** 2));
  const SHEEN_BANDS = 26;
  for (let i = 0; i < SHEEN_BANDS; i++) {
    const t0 = i / SHEEN_BANDS;
    const t1 = (i + 1) / SHEEN_BANDS;
    const t = (t0 + t1) / 2;
    const bx = x + w * t0;
    const bw = w * (t1 - t0) + 0.6;   // overlap, or seams show as hairlines
    // Main reflection left of centre, secondary one right of it, and a
    // shadowed trough between - the arrangement in every polished-metal
    // reference, and what stops the two highlights reading as stripes.
    const lit = gauss(t, 0.29, 0.1) * 0.34 + gauss(t, 0.74, 0.07) * 0.18;
    const dark = gauss(t, 0.52, 0.09) * 0.22 + gauss(t, 0.95, 0.05) * 0.16;
    if (lit > 0.004) {
      g.fillStyle(0xffffff, lit);
      g.fillRect(bx, y, bw, h);
    }
    if (dark > 0.004) {
      g.fillStyle(0x000000, dark);
      g.fillRect(bx, y, bw, h);
    }
    // The same band across the top plane, at half strength: a lit plane
    // reflects less of the source than the one facing it.
    const quad = [
      new Phaser.Geom.Point(x + w * t0, y),
      new Phaser.Geom.Point(x + w * t0 + depth, y - depth),
      new Phaser.Geom.Point(x + w * t1 + depth, y - depth),
      new Phaser.Geom.Point(x + w * t1, y)
    ];
    if (lit > 0.004) {
      g.fillStyle(0xffffff, lit * 0.5);
      g.fillPoints(quad, true);
    }
    if (dark > 0.004) {
      g.fillStyle(0x000000, dark * 0.5);
      g.fillPoints(quad, true);
    }
  }

  // ---- ribbed shell. Four raised ribs across the face, each a lit band with
  // a shadow at its foot - the detail that makes the case read as moulded
  // rather than printed.
  const ribW = w * 0.075;
  for (let i = 0; i < 4; i++) {
    const rx = x + w * (0.17 + i * 0.22);
    g.fillStyle(p.highlight, 0.16);
    g.fillRect(rx, y + h * 0.06, ribW, h * 0.88);
    g.fillStyle(p.shadow, 0.3);
    g.fillRect(rx + ribW, y + h * 0.06, Math.max(1, s * 0.008), h * 0.88);
  }

  // ---- the seam, with the lid overhanging the body it closes onto.
  const seamY = y + h * 0.44;
  g.fillStyle(p.shadow, 0.75);
  g.fillRect(x, seamY, w, Math.max(1.4, s * 0.026));
  g.lineStyle(1, p.highlight, 0.45);
  g.lineBetween(x, seamY - 1, x + w, seamY - 1);

  // ---- two latches straddling the seam. The part that says it OPENS.
  for (const t of [0.3, 0.7]) {
    const lx = x + w * t;
    const lw = w * 0.13;
    const lh = h * 0.34;
    g.fillStyle(p.dark, 1);
    g.fillRect(lx - lw / 2 - 1, seamY - lh / 2 - 1, lw + 2, lh + 2);
    g.fillGradientStyle(p.highlight, p.highlight, p.light, p.light, 1);
    g.fillRect(lx - lw / 2, seamY - lh / 2, lw, lh);
    g.fillStyle(p.shadow, 0.85);
    g.fillRect(lx - lw * 0.3, seamY - lh * 0.06, lw * 0.6, Math.max(1.2, s * 0.022));
  }

  // ---- end bumpers, standing proud of the shell at both ends. On the
  // reference these are the heaviest parts of the case, and they are what
  // stops the silhouette being a plain rectangle.
  const bump = w * 0.055;
  for (const bx of [x, x + w - bump]) {
    g.fillGradientStyle(p.light, p.light, p.dark, p.dark, 1);
    g.fillRect(bx, y - h * 0.03, bump, h * 1.06);
    g.lineStyle(1, p.dark, 0.9);
    g.strokeRect(bx, y - h * 0.03, bump, h * 1.06);
  }

  // ---- a blank instrument plate, recessed into the lid half. Deliberately
  // empty: the game's rule is that art carries meaning and captions do not,
  // and a plate with writing on it would be a caption drawn in pixels.
  const plateW = w * 0.2;
  const plateH = h * 0.2;
  const plateX = x + w * 0.42;
  const plateY = y + h * 0.14;
  g.fillStyle(p.shadow, 0.85);
  g.fillRect(plateX, plateY, plateW, plateH);
  g.lineStyle(1, p.highlight, 0.4);
  g.lineBetween(plateX, plateY + plateH, plateX + plateW, plateY + plateH);

  // ---- stacking ridges along the top plane.
  g.lineStyle(Math.max(1, s * 0.014), p.shadow, 0.5);
  for (const t of [0.35, 0.65]) {
    const rx = x + w * t;
    g.lineBetween(rx + depth * 0.2, y - depth * 0.2, rx + depth * 0.85, y - depth * 0.85);
  }

  // ---- tier, stated in HARDWARE rather than in a word: one stud for bronze
  // up to four for the vault. The colour already carries the tier at a
  // glance; the studs are what keep them apart side by side.
  const studs = tier === 'vault' ? 4 : tier === 'gold' ? 3 : tier === 'silver' ? 2 : 1;
  const studR = Math.max(0.9, s * 0.014);
  for (let i = 0; i < studs; i++) {
    const spread = w * 0.3;
    const sx = x + w * 0.5 - spread / 2 + (studs === 1 ? spread / 2 : (spread * i) / (studs - 1));
    g.fillStyle(p.shadow, 0.9);
    g.fillCircle(sx, y + h * 0.78 + studR * 0.5, studR);
    g.fillStyle(p.highlight, 0.9);
    g.fillCircle(sx, y + h * 0.78 - studR * 0.3, studR);
  }

  // ---- outline last, so no fill sits on top of it.
  g.lineStyle(Math.max(1.2, s * 0.018), p.dark, 0.95);
  g.strokeRect(x, y, w, h);
}

/**
 * THE DECAGON. A real polyhedron, projected rather than faked.
 *
 * The first version was a flat ten-sided token, which read as a coin - the
 * worst possible association for the one item in the game that cannot merge,
 * since coins are what the currency families are made of. The second was a
 * shaded sphere, which read as a ball.
 *
 * This is an icosahedron: twenty flat triangular faces, held in a fixed
 * three-quarter orientation, back-faces culled, each face given ONE flat tone
 * from its own normal against the upper-left key every drawn object in this
 * game shares. Flat-shaded facets with visible edges are what makes a solid
 * read as cut rather than smooth, and its silhouette lands as a ten-sided
 * outline - which is where the name stays honest.
 */
export function drawDecagon(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  const R = s * 0.36;

  // The twelve vertices of a regular icosahedron: three mutually
  // perpendicular golden rectangles.
  const PHI = (1 + Math.sqrt(5)) / 2;
  const RAW: [number, number, number][] = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]
  ];
  const FACES: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  // Turned to a three-quarter view: enough yaw and pitch that a whole face
  // sits toward the viewer with others falling away on both sides, which is
  // what shows the solid off. Fixed, so every Decagon in the game is the same
  // object seen from the same angle.
  const YAW = 0.55;
  const PITCH = -0.42;
  const cy0 = Math.cos(YAW), sy0 = Math.sin(YAW);
  const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  const scale = R / Math.sqrt(1 + PHI * PHI);

  const verts = RAW.map(([x, y, z]) => {
    const x1 = x * cy0 + z * sy0;
    const z1 = -x * sy0 + z * cy0;
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return { x: x1 * scale, y: -y2 * scale, z: z2 };
  });

  // Upper-left, tilted toward the viewer.
  const LX = -0.5, LY = -0.68, LZ = 0.54;

  for (const [i, j, k] of FACES) {
    const a = verts[i], b = verts[j], c = verts[k];
    // Face normal from the projected winding: a positive cross product means
    // the triangle faces us, so this both culls the back and gives the depth
    // ordering a convex solid needs (which is none).
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (cross >= 0) continue;

    // The true 3D normal, for shading. Averaging the three unit vertices is
    // exact for a regular solid centred on the origin.
    const nx = (a.x + b.x + c.x) / 3;
    const ny = (a.y + b.y + c.y) / 3;
    const nz = (a.z + b.z + c.z) / 3;
    const len = Math.hypot(nx, ny, nz) || 1;
    const lit = Math.max(0, (nx / len) * LX + (ny / len) * LY + (nz / len) * LZ);

    const points = [
      new Phaser.Geom.Point(a.x, a.y),
      new Phaser.Geom.Point(b.x, b.y),
      new Phaser.Geom.Point(c.x, c.y)
    ];
    g.fillStyle(toneForNormal(p, Math.min(1, lit)), 1);
    g.fillPoints(points, true);
    // Every edge drawn, in the body's own dark tone: the edges are the whole
    // point of a cut solid, and a black outline would make it a cartoon.
    g.lineStyle(Math.max(1, s * 0.012), p.dark, 0.85);
    g.strokePoints(points, true);
  }
}

/**
 * A briefcase, for the inventory button. A hard-shell attache rather than a
 * luggage bag: squared corners, a flat top, a slim bail handle and two
 * clasps. Reads as "the case where you keep things" without any of the
 * softness or straps a travel bag would bring, which would be wrong for a
 * game whose brief is dark and brutal but explicitly allows warmth.
 */
export function drawBriefcase(g: Phaser.GameObjects.Graphics, s: number, tint: number): void {
  const p = materialLighting(tint, 5);
  const w = s * 0.72;
  const h = s * 0.52;
  const x = -w / 2;
  const y = -h / 2 + s * 0.06;
  const r = Math.max(1.5, s * 0.04);

  // Handle: a thin bail above the case, drawn before the body so the body
  // reads as sitting in front of it.
  g.lineStyle(Math.max(1.6, s * 0.05), p.light, 1);
  g.beginPath();
  g.moveTo(-w * 0.18, y);
  g.lineTo(-w * 0.18, y - s * 0.1);
  g.lineTo(w * 0.18, y - s * 0.1);
  g.lineTo(w * 0.18, y);
  g.strokePath();

  g.fillStyle(p.base, 1);
  g.fillRoundedRect(x, y, w, h, r);
  // Lid: the top third is a separate lit plane, which is what makes it read
  // as a case that opens rather than a plain rectangle.
  g.fillStyle(p.light, 1);
  g.fillRoundedRect(x, y, w, h * 0.34, r);
  g.fillStyle(p.dark, 1);
  g.fillRect(x, y + h * 0.34 - 1, w, Math.max(1, s * 0.022));
  g.lineStyle(1, p.shadow, 0.85);
  g.strokeRoundedRect(x, y, w, h, r);

  // Two clasps on the seam.
  g.fillStyle(p.highlight, 0.95);
  const clasp = Math.max(2, s * 0.07);
  g.fillRect(-w * 0.28 - clasp / 2, y + h * 0.3, clasp, clasp * 0.8);
  g.fillRect(w * 0.28 - clasp / 2, y + h * 0.3, clasp, clasp * 0.8);
}

/** The gem diamond, matching the HUD chip, for prices shown outside it. */
export function drawGemGlyph(g: Phaser.GameObjects.Graphics, half: number, color: number): void {
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(0, -half);
  g.lineTo(half * 0.82, 0);
  g.lineTo(0, half);
  g.lineTo(-half * 0.82, 0);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xffffff, 0.34);
  g.beginPath();
  g.moveTo(0, -half * 0.64);
  g.lineTo(half * 0.36, 0);
  g.lineTo(0, -half * 0.09);
  g.lineTo(-half * 0.36, 0);
  g.closePath();
  g.fillPath();
}

// ---- Shared shape helpers ----

/**
 * Drop offset for an icon's shadow copy, proportional to the icon box.
 *
 * Every shadow copy in this file used a literal `+ 2` pixels, which is 5.5%
 * of the box at the minimum cell size (38) and 2.2% at the maximum (96) - so
 * the same icon carried a visibly different shadow weight depending on
 * viewport. Everything else in this file is `s`-relative; this makes shadows
 * match.
 */
function dropOffset(s: number): number {
  return Math.max(1, s * 0.028);
}

/** A rough, irregular polygon - hand-broken raw material, tier 1-2 territory. */
function drawIrregularChip(g: Phaser.GameObjects.Graphics, points: [number, number][], p: Palette): void {
  // Offset is derived from the shape's own extent, not a literal `+2`. The
  // old constant was 5.5% of the box at the minimum cell size and 2.2% at
  // the maximum, so the drop shadow silently changed weight with viewport.
  const extent = Math.max(...points.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
  const drop = Math.max(1, extent * 0.09);

  g.fillStyle(p.shadow, 1);
  g.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y + drop) : g.lineTo(x, y + drop)));
  g.closePath();
  g.fillPath();

  // Faceted from the centre rather than a flat base fill plus one lit wedge.
  // A broken chunk of rock or glass is a cluster of small planes catching the
  // light differently; one tone plus one highlight reads as a paper cutout.
  fillFanFacets(g, points, p);

  // Rim discipline: the upper-left arris catches the key, everything else
  // takes the shadow stroke. A uniform outline flattens the form.
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const midAngle = Math.atan2((y1 + y2) / 2, (x1 + x2) / 2);
    const facingKey = Math.cos(midAngle + Math.PI * 0.75) > 0.35;
    g.lineStyle(1, facingKey ? p.highlight : p.shadow, facingKey ? 0.7 : 0.7);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
  }
}

/**
 * A low granular mound with a scatter of grain dots - for loose/particulate
 * raw material (sand), which physically isn't a solid chunk the way rock
 * or wood is. Using drawIrregularChip (a solid polygon) for something
 * granular was the actual bug this fixes: a pile of sand should read as
 * "many small grains heaped up," not "one broken chunk."
 */
function drawGranularMound(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  const w = s * 0.42, h = s * 0.18;
  const pts: [number, number][] = [
    [-w / 2, h * 0.45], [-w * 0.32, -h * 0.5], [-w * 0.05, -h * 0.85],
    [w * 0.28, -h * 0.55], [w / 2, h * 0.4], [0, h * 0.6]
  ];
  g.fillStyle(p.shadow, 0.9);
  g.beginPath();
  const drop = dropOffset(s);
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y + drop) : g.lineTo(x, y + drop)));
  g.closePath();
  g.fillPath();

  g.fillGradientStyle(p.highlight, p.light, p.dark, p.shadow, 1);
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
  g.lineStyle(1, p.shadow, 0.5);
  g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

  // Grain scatter, not smooth - what actually reads as "granular" rather
  // than "one solid rounded pile."
  const grains: [number, number][] = [
    [-w * 0.2, -h * 0.1], [w * 0.1, -h * 0.35], [-w * 0.05, h * 0.05],
    [w * 0.22, -h * 0.05], [-w * 0.3, h * 0.15], [w * 0.05, h * 0.2], [w * 0.3, h * 0.1]
  ];
  g.fillStyle(p.dark, 0.55);
  for (const [x, y] of grains) g.fillCircle(x, y, s * 0.012);
  g.fillStyle(p.highlight, 0.5);
  for (const [x, y] of grains.slice(0, 4)) g.fillCircle(x - s * 0.008, y - s * 0.008, s * 0.007);
}

/** An axis-aligned plank/panel face - a clean rect gradient, no texture noise. */
function drawPlankFace(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, radius: number, p: Palette): void {
  g.fillGradientStyle(p.highlight, p.light, p.dark, p.shadow, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  // Rim discipline instead of one uniform outline. A single shadow-toned
  // stroke traced all the way round is the most flattening thing you can do
  // to a lit form - it reads as a sticker edge. The lit upper-left arris
  // gets a highlight, the rest keeps the shadow stroke.
  g.lineStyle(1, p.shadow, 0.8);
  g.strokeRoundedRect(x, y, w, h, radius);
  g.lineStyle(1, p.highlight, 0.55);
  g.beginPath();
  g.moveTo(x + radius * 0.7, y + 0.5);
  g.lineTo(x + w - radius * 0.7, y + 0.5);
  g.strokePath();
  g.beginPath();
  g.moveTo(x + 0.5, y + radius * 0.7);
  g.lineTo(x + 0.5, y + h - radius * 0.7);
  g.strokePath();
}

/** Straight grain lines across a plank/block face - kept sparse (minimalist), not dense texture. */
function drawGrainLines(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, count: number, p: Palette): void {
  g.lineStyle(1, p.shadow, 0.4);
  for (let i = 1; i <= count; i++) {
    const gy = y + (h / (count + 1)) * i;
    g.beginPath();
    g.moveTo(x + w * 0.06, gy);
    g.lineTo(x + w * 0.94, gy);
    g.strokePath();
  }
}

/**
 * A simple two-face engineered block (top face + front face), the visual
 * anchor for every "this material is now precise" tier in both chains.
 * Top face catches the light directly; front face sits in its own shadow -
 * same fixed upper-left light source as everything else. Takes explicit
 * proportions (not derived from a single `s`) so different tiers can be
 * genuinely different massings - a wide short slab reads differently from
 * a narrow tall block even in silhouette alone, before color or accent
 * details come into it.
 */
function drawBlock(g: Phaser.GameObjects.Graphics, w: number, h: number, depth: number, yOffset: number, p: Palette): void {
  const x = -w / 2, y = yOffset;

  // Front face
  g.fillGradientStyle(p.light, p.light, p.shadow, p.dark, 1);
  g.fillRect(x, y, w, h);

  // RIGHT face. This block had only two planes - front and top - which is
  // why every block tier read flat: a two-plane form is a silhouette with a
  // lid, not a solid. The third plane is what makes it read as volume, and
  // it faces away from the upper-left key so it takes a dark ramp tone.
  g.fillStyle(toneForNormal(p, 0), 1);
  g.beginPath();
  g.moveTo(x + w, y);
  g.lineTo(x + w + depth, y - depth);
  g.lineTo(x + w + depth, y + h - depth);
  g.lineTo(x + w, y + h);
  g.closePath();
  g.fillPath();

  // Top face (parallelogram, catching the light source directly). Graded
  // rather than a flat highlight fill so the lit plane has direction too.
  g.fillGradientStyle(p.highlight, p.highlight, p.light, p.light, 1);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + depth, y - depth);
  g.lineTo(x + w + depth, y - depth);
  g.lineTo(x + w, y);
  g.closePath();
  g.fillPath();

  g.lineStyle(1, p.shadow, 0.85);
  g.strokeRect(x, y, w, h);
  g.lineStyle(1, p.dark, 0.6);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + depth, y - depth);
  g.lineTo(x + w + depth, y - depth);
  g.lineTo(x + w, y);
  g.closePath();
  g.strokePath();
}

/**
 * A lap-jointed beam lattice (kumiko / burr-puzzle territory) - Wood's take
 * on tier 7's "blocky interlocking cross/lattice" stage.
 *
 * Deliberately NOT drawInterlockingCross (Glass tier 7): that helper is
 * three bars radiating from a shared centre, which is the same asterisk
 * whatever angles you feed it, so wood reusing it with tweaked numbers
 * would be exactly the near-identical-params duplicate the file header
 * warns about. A four-beam woven grid is a structurally different object -
 * and joinery is the one shape language wood owns outright over stone and
 * glass, so this is a more honest material story than a borrowed asterisk.
 */
function drawJoineryLattice(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  const angle = -0.13;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rot = ([x, y]: [number, number]): [number, number] => [x * cos - y * sin, x * sin + y * cos];

  const len = s * 0.66, bw = s * 0.115, gap = s * 0.15;

  const beamPts = (horiz: boolean, off: number): [number, number][] => {
    const raw: [number, number][] = horiz
      ? [[-len / 2, off - bw / 2], [len / 2, off - bw / 2], [len / 2, off + bw / 2], [-len / 2, off + bw / 2]]
      : [[off - bw / 2, -len / 2], [off + bw / 2, -len / 2], [off + bw / 2, len / 2], [off - bw / 2, len / 2]];
    return raw.map(rot);
  };

  const fillBeam = (pts: [number, number][], tone: number): void => {
    g.fillStyle(tone, 1);
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
    g.fillPath();
    g.lineStyle(1, p.shadow, 0.55);
    g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  };

  // Verticals sit under, horizontals over - then two of the four crossings
  // get the vertical re-drawn on top, so the grid genuinely alternates
  // over/under like a real lap joint instead of reading as one flat plane.
  // Tones step strictly by depth (dark = furthest back, light = nearest
  // front) so the whole thing reads as one piece of wood at different
  // depths; an earlier pass used dark/light for the two axes and read as
  // two different materials laid on top of each other.
  for (const off of [-gap, gap]) fillBeam(beamPts(false, off), p.dark);
  for (const off of [-gap, gap]) fillBeam(beamPts(true, off), p.base);

  for (const [ox, oy] of [[-gap, gap], [gap, -gap]] as [number, number][]) {
    const patch: [number, number][] = ([
      [ox - bw / 2, oy - bw * 0.85], [ox + bw / 2, oy - bw * 0.85],
      [ox + bw / 2, oy + bw * 0.85], [ox - bw / 2, oy + bw * 0.85]
    ] as [number, number][]).map(rot);
    fillBeam(patch, p.light);
  }

  // One lit edge per horizontal beam - the fixed upper-left light catching
  // the top arris of each member.
  g.lineStyle(1, p.highlight, 0.5);
  for (const off of [-gap, gap]) {
    const [a, b] = [rot([-len / 2, off - bw / 2]), rot([len / 2, off - bw / 2])];
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.strokePath();
  }
}

/**
 * A continuous woven torus knot with real over/under crossings - Wood's
 * tier 8+ take on the "smooth interlocking knot" stage.
 *
 * Deliberately NOT drawInterlockingKnot (Glass tier 8): that one is three
 * separate overlapping rings, which reads as a gyroscope. This is ONE
 * unbroken band that passes through itself, which is what a steam-bent or
 * carved wooden knot actually is. `lobes` is the real escalation axis - a
 * 3-lobed trefoil at tier 8 vs a 5-lobed knot at tier 9 is a genuine
 * silhouette upgrade (more crossings, more intricate weave), not the same
 * outline with more decoration piled on.
 */
function drawWovenKnot(g: Phaser.GameObjects.Graphics, s: number, p: Palette, lobes: 3 | 5): void {
  const b = lobes - 1;
  const steps = 260;
  const raw: [number, number, number][] = [];
  let maxAbs = 0;
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * 2 * i) / steps;
    const x = Math.sin(t) + 2 * Math.sin(b * t);
    const y = Math.cos(t) - 2 * Math.cos(b * t);
    raw.push([x, y, -Math.sin((b + 1) * t)]);
    maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
  }
  // Normalised from the curve's own measured extent rather than a hardcoded
  // radius, so changing `lobes` can never silently overflow the tile.
  const k = (s * 0.34) / maxAbs;
  const pts = raw.map(([x, y, z]) => [x * k, y * k, z] as [number, number, number]);
  const thickness = s * (lobes === 3 ? 0.085 : 0.062);

  // Whole loop in shadow tone first - this is both the strand passing
  // behind at every crossing and the shape's outline.
  g.lineStyle(thickness, p.dark, 0.95);
  g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true, true);

  // Only the in-front runs on top. Without this pass the knot is a flat
  // outline; with it the band visibly threads through itself.
  const frontRuns: Phaser.Geom.Point[][] = [];
  let run: Phaser.Geom.Point[] = [];
  for (const [x, y, z] of pts) {
    if (z > 0) {
      run.push(new Phaser.Geom.Point(x, y));
    } else if (run.length) {
      frontRuns.push(run);
      run = [];
    }
  }
  if (run.length) frontRuns.push(run);

  g.lineStyle(thickness * 0.84, p.base, 1);
  for (const r of frontRuns) if (r.length > 1) g.strokePoints(r, false, false);

  g.lineStyle(thickness * 0.26, p.highlight, 0.75);
  for (const r of frontRuns) {
    if (r.length > 1) {
      g.strokePoints(r.map((pt) => new Phaser.Geom.Point(pt.x - thickness * 0.2, pt.y - thickness * 0.2)), false, false);
    }
  }
}

/** Traces a thin gilt filament along a woven knot's front strands - the chain-top luxury accent, following the form instead of sitting on it. */
function drawGiltFilament(g: Phaser.GameObjects.Graphics, s: number, lobes: 3 | 5, alpha: number): void {
  const b = lobes - 1;
  const steps = 260;
  const raw: [number, number, number][] = [];
  let maxAbs = 0;
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * 2 * i) / steps;
    const x = Math.sin(t) + 2 * Math.sin(b * t);
    const y = Math.cos(t) - 2 * Math.cos(b * t);
    raw.push([x, y, -Math.sin((b + 1) * t)]);
    maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
  }
  const k = (s * 0.34) / maxAbs;
  let run: Phaser.Geom.Point[] = [];
  const runs: Phaser.Geom.Point[][] = [];
  for (const [x, y, z] of raw) {
    if (z > 0) {
      run.push(new Phaser.Geom.Point(x * k, y * k + s * 0.012));
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);

  g.lineStyle(Math.max(1, s * 0.014), GILT, alpha);
  for (const r of runs) if (r.length > 1) g.strokePoints(r, false, false);
}

/** A precise faceted polygon - the geometric endpoint for both chains' gem/quartz-style tiers. */
function drawFacetedForm(g: Phaser.GameObjects.Graphics, s: number, sides: number, p: Palette): void {
  const r = s * 0.34;
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 1.15]);
  }

  g.fillStyle(p.shadow, 1);
  g.beginPath();
  const drop = dropOffset(s);
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y + drop) : g.lineTo(x, y + drop)));
  g.closePath();
  g.fillPath();

  // Fan-fill each facet from center to edge, alternating light/dark by
  // angle relative to the fixed upper-left light - this is what makes a
  // faceted gem read as cut and lit rather than a flat polygon.
  for (let i = 0; i < sides; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % sides];
    const midAngle = Math.atan2((y1 + y2) / 2, (x1 + x2) / 2);
    g.fillStyle(toneForNormal(p, midAngle), 0.92);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(x1, y1);
    g.lineTo(x2, y2);
    g.closePath();
    g.fillPath();
  }

  g.lineStyle(1, p.shadow, 0.7);
  g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
}

/**
 * A tall faceted prism with real vertical extent - tiers 6 of the shared
 * shape grammar (see docs/FAMILIES_ROADMAP.md), and the first real
 * implementation of the obelisk/prism reference saved to memory earlier
 * (a twisted paper prism model, faceted glass obelisks). Unlike
 * drawFacetedForm (a flat rosette viewed head-on), this has a top cap and
 * vertical facet strips that taper narrower toward the top, so it reads as
 * a volume standing on the board, not a flat cut gem.
 */
function drawObelisk(g: Phaser.GameObjects.Graphics, s: number, sides: number, p: Palette): void {
  const rTop = s * 0.15;
  const rBottom = s * 0.23;
  const halfH = s * 0.3;
  const top: [number, number][] = [];
  const bottom: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    top.push([Math.cos(a) * rTop, -halfH + Math.sin(a) * rTop * 0.35]);
    bottom.push([Math.cos(a) * rBottom, halfH + Math.sin(a) * rBottom * 0.35]);
  }

  for (let i = 0; i < sides; i++) {
    const [x1t, y1t] = top[i];
    const [x2t, y2t] = top[(i + 1) % sides];
    const [x1b, y1b] = bottom[i];
    const [x2b, y2b] = bottom[(i + 1) % sides];
    const midAngle = Math.atan2((y1t + y2t) / 2, (x1t + x2t) / 2);
    g.fillStyle(toneForNormal(p, midAngle), 0.95);
    g.beginPath();
    g.moveTo(x1t, y1t);
    g.lineTo(x2t, y2t);
    g.lineTo(x2b, y2b);
    g.lineTo(x1b, y1b);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, p.shadow, 0.5);
    g.strokePath();
  }

  g.fillStyle(p.highlight, 1);
  g.beginPath();
  top.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
  g.lineStyle(1, p.shadow, 0.6);
  g.strokePoints(top.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
}

/**
 * A flat, wide faceted slab - same top-cap + side-facet construction as
 * drawObelisk, but short and wide instead of tall and narrow, so it reads
 * as a cut stone slab lying flat rather than a standing prism. Exists
 * because Granite originally reused drawObelisk directly and ended up too
 * close to Glass's Crystal Obelisk (same tall-prism silhouette, just a
 * different side count) - this gives "faceted but not a tower" its own
 * shape instead of overloading the obelisk silhouette a second time.
 */
function drawFacetedSlab(g: Phaser.GameObjects.Graphics, s: number, sides: number, p: Palette): void {
  const r = s * 0.32;
  const halfH = s * 0.09;
  const top: [number, number][] = [];
  const bottom: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    top.push([Math.cos(a) * r, -halfH + Math.sin(a) * r * 0.42]);
    bottom.push([Math.cos(a) * r, halfH + Math.sin(a) * r * 0.42]);
  }

  for (let i = 0; i < sides; i++) {
    const [x1t, y1t] = top[i];
    const [x2t, y2t] = top[(i + 1) % sides];
    const [x1b, y1b] = bottom[i];
    const [x2b, y2b] = bottom[(i + 1) % sides];
    const midAngle = Math.atan2((y1t + y2t) / 2, (x1t + x2t) / 2);
    g.fillStyle(toneForNormal(p, midAngle), 0.9);
    g.beginPath();
    g.moveTo(x1t, y1t);
    g.lineTo(x2t, y2t);
    g.lineTo(x2b, y2b);
    g.lineTo(x1b, y1b);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, p.shadow, 0.45);
    g.strokePath();
  }

  g.fillStyle(p.highlight, 1);
  g.beginPath();
  top.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
  g.lineStyle(1, p.shadow, 0.55);
  g.strokePoints(top.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
}

/** Rotates a centered w x h rectangle's 4 corners by `angle` radians - Graphics has no per-shape transform, so bars/lattices that aren't axis-aligned need this. */
function rotatedRectPoints(w: number, h: number, angle: number): [number, number][] {
  const hw = w / 2, hh = h / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
}

/**
 * A blocky interlocking cross/asterisk - tier 7 of the shared shape
 * grammar, the starting half of the saved interlocking-knot-sculpture
 * reference (a green-marble cube-cross lattice before it smooths into a
 * knot). Three bars at 60 degrees apart, not a plain 4-way plus, to read
 * as a lattice rather than a single cross.
 */
function drawInterlockingCross(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  const len = s * 0.52, w = s * 0.13;
  const angles = [0, Math.PI / 3, (2 * Math.PI) / 3];
  angles.forEach((angle) => {
    const barTone = toneForNormal(p, angle);
    const pts = rotatedRectPoints(len, w, angle);
    g.fillStyle(barTone, 0.92);
    g.beginPath();
    pts.forEach(([x, y], j) => (j === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
    g.fillPath();
    g.lineStyle(1, p.shadow, 0.5);
    g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  });
  g.fillStyle(p.highlight, 0.7);
  g.fillCircle(0, 0, s * 0.07);
}

/** A thick ring, rotated and sampled as a polyline since Graphics can't rotate an ellipse stroke directly. */
function strokeRotatedRing(g: Phaser.GameObjects.Graphics, rx: number, ry: number, angle: number, thickness: number, color: number, alpha: number): void {
  const segments = 28;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const pts: Phaser.Geom.Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (Math.PI * 2 * i) / segments;
    const ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
    pts.push(new Phaser.Geom.Point(ex * cos - ey * sin, ex * sin + ey * cos));
  }
  g.lineStyle(thickness, color, alpha);
  g.strokePoints(pts, true, true);
}

/**
 * A smooth interlocking knot - tier 8, the fully-refined end of the saved
 * interlocking-knot-sculpture reference (blocky cross -> smooth rounded
 * torus/ring knot). THREE rings at three different angles/sizes, not two
 * symmetric ones - two overlapping rings just reads as a ring or a Venn
 * diagram; three asymmetric loops crossing each other is what actually
 * sells "twisted/interwoven" rather than "circle behind circle."
 */
function drawInterlockingKnot(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  const thickness = s * 0.065;
  strokeRotatedRing(g, s * 0.22, s * 0.13, -0.6, thickness, p.dark, 0.8);
  strokeRotatedRing(g, s * 0.19, s * 0.16, 1.1, thickness, p.base, 0.85);
  strokeRotatedRing(g, s * 0.24, s * 0.11, 0.35, thickness, p.light, 0.9);
  strokeRotatedRing(g, s * 0.23, s * 0.105, 0.35, thickness * 0.3, p.highlight, 0.85);
}

/** One small luxury accent - a thin inlay diamond - reserved for the top tier of a chain only. */
function drawInlayAccent(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number, accentColor: number): void {
  g.fillStyle(accentColor, 0.95);
  g.beginPath();
  g.moveTo(cx, cy - size);
  g.lineTo(cx + size * 0.6, cy);
  g.lineTo(cx, cy + size);
  g.lineTo(cx - size * 0.6, cy);
  g.closePath();
  g.fillPath();
}

function drawSparkles(g: Phaser.GameObjects.Graphics, pts: [number, number, number][]): void {
  g.fillStyle(0xffffff, 0.9);
  for (const [x, y, r] of pts) g.fillCircle(x, y, r);
}

/**
 * ---- Stone's lapidary cut language (tiers 7-9) ----
 *
 * Wood ends in joinery, Glass ends in rings; Stone ends in CUT GEMS, so its
 * top tiers speak in real lapidary cuts rather than borrowing either. This
 * replaced three consecutive `drawFacetedForm` calls that differed only by
 * side count (6/8/10) and scale - a hexagon, an octagon and a decagon, which
 * all converge on "circle" at icon size and read as the same object.
 *
 * The progression is genuine cutting complexity, and each stage has a
 * different OUTLINE so it survives a silhouette-only comparison:
 *   7 step cut      - corner-cut rectangle, a few big terraced facets
 *   8 marquise      - pointed lens, facets radiating from a spine
 *   9 brilliant     - circle, two interlocking rings of facets + asterism
 */

/** Fills a closed outline as fan facets from the centre, lit from the upper-left like every other shape here. */
function fillFanFacets(g: Phaser.GameObjects.Graphics, pts: [number, number][], p: Palette): void {
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const midAngle = Math.atan2((y1 + y2) / 2, (x1 + x2) / 2);
    g.fillStyle(toneForNormal(p, midAngle), 0.92);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(x1, y1);
    g.lineTo(x2, y2);
    g.closePath();
    g.fillPath();
  }
}

/** Tier 7 - step (emerald) cut: a corner-cut rectangle terraced inward. Blocky and orthogonal, nothing like a rosette. */
function drawStepCut(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  const w = s * 0.27, h = s * 0.34, c = s * 0.12;
  const ring = (k: number): [number, number][] => {
    const ww = w * k, hh = h * k, cc = c * k;
    return [
      [-ww + cc, -hh], [ww - cc, -hh], [ww, -hh + cc], [ww, hh - cc],
      [ww - cc, hh], [-ww + cc, hh], [-ww, hh - cc], [-ww, -hh + cc]
    ];
  };
  const fill = (pts: [number, number][], color: number): void => {
    g.fillStyle(color, 1);
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.closePath();
    g.fillPath();
    g.lineStyle(1, p.shadow, 0.5);
    g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  };

  // Successively lighter terraces read as steps cut down to a flat table.
  fill(ring(1), p.shadow);
  fill(ring(0.84), p.dark);
  fill(ring(0.62), p.base);
  fill(ring(0.38), p.light);
  // One lit corner rather than a bright centre: a top-down step cut catches
  // the light on the table's near edge, and a fully bright table flattened
  // the whole stone into a single blob.
  g.fillStyle(p.highlight, 0.9);
  g.beginPath();
  g.moveTo(-w * 0.38 + c * 0.38, -h * 0.38);
  g.lineTo(w * 0.38 - c * 0.38, -h * 0.38);
  g.lineTo(-w * 0.38 + c * 0.38, h * 0.1);
  g.closePath();
  g.fillPath();
}

/** Tier 8 - marquise: a pointed lens with facets radiating off a central spine. A silhouette no other tier in the game has. */
function drawMarquiseCut(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  const a = s * 0.2, b = s * 0.37;
  const outline = (k: number): [number, number][] => {
    const pts: [number, number][] = [];
    const M = 9;
    for (let i = 0; i <= M; i++) {
      const u = -1 + (2 * i) / M;
      pts.push([a * k * Math.pow(1 - u * u, 0.62), b * k * u]);
    }
    for (let i = M - 1; i >= 1; i--) {
      const u = -1 + (2 * i) / M;
      pts.push([-a * k * Math.pow(1 - u * u, 0.62), b * k * u]);
    }
    return pts;
  };

  const outer = outline(1);
  g.fillStyle(p.base, 1);
  g.beginPath();
  outer.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
  fillFanFacets(g, outer, p);

  // Table: a smaller marquise floating on top, plus the spine that makes the
  // radiating facets read as struck from a single axis.
  const table = outline(0.42);
  g.fillStyle(p.highlight, 0.95);
  g.beginPath();
  table.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();

  g.lineStyle(1, p.shadow, 0.65);
  g.strokePoints(outer.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineStyle(1, p.shadow, 0.35);
  g.lineBetween(0, -b * 0.92, 0, b * 0.92);
}

/** A ring of quad facets between two radii, alternating lit/dark. `phase` offsets a ring so it interlocks with its neighbour the way a real brilliant's crown does. */
function fillFacetRing(
  g: Phaser.GameObjects.Graphics, rOuter: number, rInner: number, count: number, p: Palette, phase: number
): void {
  for (let i = 0; i < count; i++) {
    const a0 = (Math.PI * 2 * i) / count + phase;
    const a1 = (Math.PI * 2 * (i + 1)) / count + phase;
    g.fillStyle(toneForNormal(p, (a0 + a1) / 2), 0.92);
    g.beginPath();
    g.moveTo(Math.cos(a0) * rInner, Math.sin(a0) * rInner);
    g.lineTo(Math.cos(a0) * rOuter, Math.sin(a0) * rOuter);
    g.lineTo(Math.cos(a1) * rOuter, Math.sin(a1) * rOuter);
    g.lineTo(Math.cos(a1) * rInner, Math.sin(a1) * rInner);
    g.closePath();
    g.fillPath();
  }
}

/** Tier 9 - round brilliant: the most-cut stone in the chain, two interlocking facet rings around a flat table. */
function drawBrilliantCut(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  const r = s * 0.35;

  g.fillStyle(p.base, 1);
  g.fillCircle(0, 0, r);
  // Two rings, phase-offset so the crown facets interlock instead of lining
  // up into obvious pie slices - this is what separates it from tier 8's
  // single fan and from the old rosette.
  fillFacetRing(g, r, r * 0.62, 16, p, 0);
  fillFacetRing(g, r * 0.62, r * 0.34, 8, p, Math.PI / 8);

  // Table kept small and slightly transparent - at 0.34r/0.95 it was a
  // white blob that swallowed both facet rings, which are the whole point
  // of a brilliant.
  g.fillStyle(p.light, 0.95);
  g.fillCircle(0, 0, r * 0.26);
  g.lineStyle(1, p.shadow, 0.6);
  g.strokeCircle(0, 0, r);
  g.lineStyle(1, p.shadow, 0.35);
  g.strokeCircle(0, 0, r * 0.62);
  g.strokeCircle(0, 0, r * 0.26);
}

/** A 4-pointed star/asterisk sparkle - references real star-sapphire asterism, distinct from drawSparkles' plain round dots. */
function drawStarSparkle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number): void {
  g.fillStyle(0xffffff, 0.95);
  const pts: [number, number][] = [
    [cx, cy - r], [cx + r * 0.22, cy - r * 0.22], [cx + r, cy], [cx + r * 0.22, cy + r * 0.22],
    [cx, cy + r], [cx - r * 0.22, cy + r * 0.22], [cx - r, cy], [cx - r * 0.22, cy - r * 0.22]
  ];
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
}

// A dulled bronze/gold, deliberately far from the reserved amber accent
// (see ui/Theme.ts) so it reads as "material," never as an interactive cue.
const GILT = 0xa8843f;

// ---- Wood chain ----

function drawScrapWood(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // One cut branch: the tier-one count is the object itself, not a pip.
  const body: [number, number][] = [
    [-s * 0.3, s * 0.08], [-s * 0.2, -s * 0.13], [s * 0.2, -s * 0.03],
    [s * 0.3, s * 0.11], [s * 0.17, s * 0.22], [-s * 0.22, s * 0.14]
  ];
  fillPoly(g, body.map(([x, y]) => [x, y + dropOffset(s)]), p.shadow);
  fillPoly(g, body, p.base);
  g.fillStyle(p.highlight, 0.72);
  g.fillEllipse(s * 0.245, s * 0.095, s * 0.13, s * 0.17);
  g.lineStyle(1, p.shadow, 0.62);
  g.strokeEllipse(s * 0.245, s * 0.095, s * 0.13, s * 0.17);
  g.lineStyle(1, p.light, 0.5);
  g.lineBetween(-s * 0.2, -s * 0.03, s * 0.15, s * 0.05);
  // A trimmed branch nub keeps the silhouette organic rather than plank-like.
  fillPoly(g, [[-s * 0.08, -s * 0.08], [-s * 0.02, -s * 0.2], [s * 0.05, -s * 0.16], [s * 0.02, -s * 0.04]], p.light);
}

function drawPinePlank(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Exactly two Pine planks. Each is a small isometric solid rather than a
  // decorated rectangle, continuing the fixed upper-left light and crisp
  // three-plane construction used by the source buildings.
  const plank = (cx: number, cy: number, scale: number): void => {
    const length = s * 0.58 * scale;
    const depthX = s * 0.14 * scale;
    const depthY = s * 0.075 * scale;
    const thick = s * 0.105 * scale;
    const left = cx - length / 2;
    const right = cx + length / 2;

    const top: [number, number][] = [
      [left, cy], [left + depthX, cy - depthY],
      [right + depthX, cy - depthY], [right, cy]
    ];
    const front: [number, number][] = [
      [left, cy], [right, cy], [right, cy + thick], [left, cy + thick]
    ];
    const end: [number, number][] = [
      [right, cy], [right + depthX, cy - depthY],
      [right + depthX, cy - depthY + thick], [right, cy + thick]
    ];

    // A small grounded shadow keeps the object legible without adding a
    // board-tile background.
    fillPoly(g, [
      [left + s * 0.025, cy + thick + s * 0.025],
      [right + s * 0.025, cy + thick + s * 0.025],
      [right + depthX, cy - depthY + thick + s * 0.025],
      [left + depthX, cy - depthY + thick + s * 0.025]
    ], p.shadow, 0.22);

    fillPoly(g, front, p.base);
    fillPoly(g, end, p.dark);
    fillPoly(g, top, p.light);

    g.lineStyle(1, p.shadow, 0.62);
    g.strokePoints(top.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    g.lineBetween(left, cy, left, cy + thick);
    g.lineBetween(right, cy, right, cy + thick);
    g.lineBetween(right + depthX, cy - depthY, right + depthX, cy - depthY + thick);

    // One long grain seam and a compact end-grain mark: enough material
    // information to read as pine while remaining modern and minimal.
    g.lineStyle(1, p.highlight, 0.45);
    g.lineBetween(left + depthX * 0.68, cy - depthY * 0.58,
      right + depthX * 0.45, cy - depthY * 0.58);
    g.lineStyle(1, p.shadow, 0.4);
    g.lineBetween(right + depthX * 0.33, cy - depthY * 0.22 + thick * 0.32,
      right + depthX * 0.72, cy - depthY * 0.58 + thick * 0.32);
  };

  // The stagger preserves an immediate two-object count even at small board
  // scale; neither plank is hidden behind the other.
  plank(-s * 0.055, s * 0.095, 1);
  plank(s * 0.015, -s * 0.15, 0.94);
}

function drawOakPlank(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Exactly three Oak planks in a compact rising stack.
  const w = s * 0.54, h = s * 0.125;
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + (i - 1) * s * 0.035;
    const y = s * 0.16 - i * s * 0.15;
    drawPlankFace(g, x, y, w, h, s * 0.012, p);
    drawGrainLines(g, x, y, w, h, 1, p);
  }
}

function drawMapleBlock(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Four protrusions expressed as one engineered X block.
  const bw = s * 0.13, reach = s * 0.34;
  const beam = (angle: number, tone: number): void => {
    const c = Math.cos(angle), sn = Math.sin(angle);
    const raw: [number, number][] = [[-reach, -bw], [reach, -bw], [reach, bw], [-reach, bw]];
    const pts = raw.map(([x, y]) => [x * c - y * sn, x * sn + y * c] as [number, number]);
    fillPoly(g, pts.map(([x, y]) => [x, y + dropOffset(s)]), p.shadow);
    fillPoly(g, pts, tone);
    g.lineStyle(1, p.highlight, 0.42);
    g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  };
  beam(Math.PI / 4, p.base);
  beam(-Math.PI / 4, p.light);
  g.fillStyle(p.highlight, 0.5);
  g.fillRect(-s * 0.07, -s * 0.07, s * 0.14, s * 0.14);
}

function drawWalnutBlock(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Tier five uses the Roman-numeral shortcut as its complete silhouette.
  const top = s * 0.12, outer = s * 0.34, bottom = s * 0.3, thick = s * 0.12;
  const left: [number, number][] = [
    [-outer, -top], [-outer + thick, -top - s * 0.04], [0, bottom - thick], [0, bottom]
  ];
  const right: [number, number][] = [
    [outer - thick, -top - s * 0.04], [outer, -top], [0, bottom], [0, bottom - thick]
  ];
  fillPoly(g, left.map(([x, y]) => [x, y + dropOffset(s)]), p.shadow);
  fillPoly(g, right.map(([x, y]) => [x, y + dropOffset(s)]), p.shadow);
  fillPoly(g, left, p.base);
  fillPoly(g, right, p.light);
  g.lineStyle(1, p.highlight, 0.4);
  g.lineBetween(-outer + thick, -top - s * 0.04, 0, bottom - thick);
}

function drawMahoganyBlock(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Six-direction interlocking block / burr-puzzle form from the saved
  // reference: three beams crossing at the centre create six protrusions.
  const len = s * 0.7, half = s * 0.085;
  const drawBeam = (angle: number, tone: number, depth: number): void => {
    const c = Math.cos(angle), sn = Math.sin(angle);
    const raw: [number, number][] = [[-len / 2, -half], [len / 2, -half], [len / 2, half], [-len / 2, half]];
    const pts = raw.map(([x, y]) => [x * c - y * sn, x * sn + y * c + depth] as [number, number]);
    fillPoly(g, pts.map(([x, y]) => [x, y + dropOffset(s)]), p.shadow);
    fillPoly(g, pts, tone);
    g.lineStyle(1, p.highlight, 0.34);
    g.strokePoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  };
  drawBeam(Math.PI / 2, p.dark, 0);
  drawBeam(Math.PI / 6, p.base, -s * 0.015);
  drawBeam(-Math.PI / 6, p.light, -s * 0.03);
  g.fillStyle(p.highlight, 0.62);
  g.fillRect(-s * 0.09, -s * 0.09, s * 0.18, s * 0.18);
}

function drawEbonyBlock(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Tiers 7 and 8 previously BOTH called drawTurnedForm with identical
  // arguments - the same path, differing only by a 5%-larger specular
  // ellipse and some sparkles, i.e. the exact same-complexity reskin the
  // merge-satisfaction rule forbids. Wood now walks the shared grammar's
  // real tier-7 stage (interlocking lattice) like Glass does, in its own
  // joinery language rather than Glass's asterisk.
  drawJoineryLattice(g, s, p);
}

function drawGildedRosewood(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Tier 8's "smooth interlocking knot" stage. A trefoil reads as an
  // unmistakable step up from tier 7's flat orthogonal grid: the members
  // stop being straight and start passing through each other.
  drawWovenKnot(g, s, p, 3);
  drawGiltFilament(g, s, 3, 0.75);
  drawSparkles(g, [[s * 0.24, -s * 0.2, s * 0.016], [-s * 0.25, s * 0.15, s * 0.013]]);
}

function drawRosewoodHeirloom(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Masterwork capstone. Had to move with tiers 7-8: it used to be the
  // lathe-turned profile, which after this change would have read as
  // knot -> vessel, a sideways jump at the chain's most important merge.
  // Five lobes against tier 8's three is a real silhouette escalation -
  // more crossings, a denser weave - with the gilt/sparkle accent stepped
  // up on top of it rather than doing the work by itself.
  drawWovenKnot(g, s, p, 5);
  drawGiltFilament(g, s, 5, 0.9);
  drawInlayAccent(g, 0, 0, s * 0.05, GILT);
  drawSparkles(g, [[s * 0.26, -s * 0.24, s * 0.017], [-s * 0.27, s * 0.17, s * 0.014], [s * 0.05, s * 0.3, s * 0.012]]);
}

// ---- Stone chain ----

/**
 * Offsets and scales a chip outline, so one shape can be reused as several
 * pieces in a pile without hand-writing every vertex.
 */
function chipAt(
  points: [number, number][], scale: number, dx: number, dy: number
): [number, number][] {
  return points.map(([x, y]) => [x * scale + dx, y * scale + dy] as [number, number]);
}

/** The base broken-rock outline the loose stone tiers are built from. */
const STONE_CHIP: [number, number][] = [
  [-0.16, 0.12], [-0.05, -0.15], [0.13, -0.13],
  [0.16, 0.06], [0.02, 0.17], [-0.14, 0.16]
];

/**
 * Stone 01-03 differ by COUNT AND FORM, not by size.
 *
 * All three used to be one irregular six-sided lump: the two loose tiers were
 * literally the same helper with the same point count at two scales, and the
 * sheet was a hand-inlined polygon of the same character. At cell size they
 * were indistinguishable, which made the chain's first two merges feel like
 * nothing had happened.
 *
 * The tiers now read as sheet -> broken -> loose aggregate, and the art
 * follows the tier rather than the name: `drawSlate` is tier 1 and
 * `drawGravel` is tier 3. The helpers keep their material names because that
 * is what each one DRAWS.
 */
function drawGravel(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Loose aggregate: several small pieces. Gravel is not one rock, and a
  // scatter reads as "raw material" instantly at any size.
  drawIrregularChip(g, chipAt(STONE_CHIP, s * 0.62, -s * 0.13, s * 0.09), p);
  drawIrregularChip(g, chipAt(STONE_CHIP, s * 0.54, s * 0.12, s * 0.12), p);
  drawIrregularChip(g, chipAt(STONE_CHIP, s * 0.7, s * 0.01, -s * 0.09), p);
}

function drawRubble(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Broken masonry: fewer, larger, more angular chunks resting on each other.
  // Two pieces against Gravel's three is the merge made visible.
  drawIrregularChip(g, [
    [-s * 0.28, s * 0.2], [-s * 0.22, -s * 0.06], [-s * 0.02, -s * 0.12],
    [s * 0.06, s * 0.06], [-s * 0.04, s * 0.24]
  ], p);
  drawIrregularChip(g, [
    [s * 0.0, -s * 0.08], [s * 0.12, -s * 0.28], [s * 0.3, -s * 0.18],
    [s * 0.29, s * 0.08], [s * 0.1, s * 0.14]
  ], p);
}

function drawSlate(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Stone 01: exactly ONE piece.
  //
  // The count is the tier number - one plate, two chunks, three chips - which
  // is how the genre encodes chain position, and it is why Slate sits at tier
  // 1 and Gravel at tier 3. This used to draw a stack of three offset sheets,
  // which read as "three" at a glance and fought the convention.
  //
  // Being a flat SHEET rather than a lump is what still separates it from the
  // broken chunks above it: slate's real habit is splitting into plates.
  const sheet = (dx: number, dy: number, scale: number): [number, number][] => [
    [dx - s * 0.3 * scale, dy - s * 0.02 * scale],
    [dx - s * 0.08 * scale, dy - s * 0.12 * scale],
    [dx + s * 0.3 * scale, dy - s * 0.06 * scale],
    [dx + s * 0.26 * scale, dy + s * 0.06 * scale],
    [dx + s * 0.04 * scale, dy + s * 0.14 * scale],
    [dx - s * 0.26 * scale, dy + s * 0.08 * scale]
  ];

  // A single thin rim under the plate reads as ITS OWN thickness rather than
  // as a second stone, so the piece still has weight without adding a count.
  const rim = sheet(0, s * 0.05, 0.99);
  g.fillStyle(p.dark, 1);
  g.beginPath();
  rim.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();

  const top = sheet(0, -s * 0.04, 1.0);
  g.fillStyle(p.shadow, 1);
  g.beginPath();
  const drop = dropOffset(s);
  top.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y + drop) : g.lineTo(x, y + drop)));
  g.closePath();
  g.fillPath();
  g.fillGradientStyle(p.highlight, p.light, p.dark, p.shadow, 1);
  g.beginPath();
  top.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
  g.lineStyle(1, p.shadow, 0.7);
  g.strokePoints(top.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  // One cleavage line along the plate, the tell that it splits into sheets.
  g.lineStyle(1, p.highlight, 0.32);
  g.lineBetween(-s * 0.22, -s * 0.02, s * 0.2, -s * 0.08);
}

function drawPolishedStone(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  const w = s * 0.52, h = s * 0.36;
  drawPlankFace(g, -w / 2, -h / 2, w, h, h * 0.42, p);
  g.fillStyle(0xffffff, 0.4);
  g.fillEllipse(-w * 0.18, -h * 0.2, w * 0.28, h * 0.18);
}

function drawMarble(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Was the same drawPlankFace rounded-rect as Polished Stone, just a
  // touch bigger plus veins - too close to its own previous tier. A
  // tall upright block (a marble pedestal/column fragment) instead of a
  // flat wide plank gives it genuinely different massing, not just added
  // linework on the same silhouette.
  drawBlock(g, s * 0.34, s * 0.46, s * 0.13, -s * 0.05, p);
  g.fillStyle(0xffffff, 0.35);
  g.fillEllipse(-s * 0.06, -s * 0.14, s * 0.09, s * 0.13);
  // Veining - one or two thin curved lines, not a busy pattern.
  g.lineStyle(1.2, 0xffffff, 0.3);
  g.beginPath();
  g.moveTo(-s * 0.14, s * 0.3);
  g.lineTo(-s * 0.02, s * 0.1);
  g.lineTo(s * 0.13, s * 0.34);
  g.strokePath();
}

function drawGranite(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Was drawBlock(s*0.58, s*0.4, s*0.16, s*0.06, p) - identical proportions
  // to drawMapleBlock (wood tier 4), a literal duplicate silhouette across
  // chains. Then briefly drawObelisk(5 sides), which fixed that but landed
  // too close to Glass's Crystal Obelisk (same tall-prism silhouette).
  // drawFacetedSlab reads as "cut stone slab," not a tower - genuinely
  // distinct from both. Side count (7) is also unique across the set
  // (Quartz=6, Sapphire=8, BeveledCrystal=5, CrystalObelisk=6).
  drawFacetedSlab(g, s, 7, p);
  // Heavy salt-and-pepper speckle is granite's actual real-world
  // signature (see also the tier's color - deliberately desaturated
  // grey-blue rather than the chain's usual vivid tone, for the same
  // reason) - dark AND light flecks together, not just one tone.
  const darkFlecks: [number, number][] = [[-s * 0.14, -s * 0.02], [s * 0.08, s * 0.02], [-s * 0.04, s * 0.06], [s * 0.16, -s * 0.05], [-s * 0.2, s * 0.03]];
  g.fillStyle(p.shadow, 0.6);
  for (const [x, y] of darkFlecks) g.fillCircle(x, y, s * 0.012);
  const lightFlecks: [number, number][] = [[-s * 0.08, -s * 0.06], [s * 0.02, -s * 0.03], [s * 0.12, s * 0.04], [-s * 0.18, -s * 0.03]];
  g.fillStyle(0xffffff, 0.35);
  for (const [x, y] of lightFlecks) g.fillCircle(x, y, s * 0.008);
}

function drawQuartz(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Was drawFacetedForm(6) - the first of three near-identical rosettes.
  // A step cut is the plainest real lapidary cut, which is the right read
  // for the first cut stone in the chain.
  drawStepCut(g, s, p);
}

function drawSapphire(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  drawMarquiseCut(g, s, p);
  drawSparkles(g, [[s * 0.17, -s * 0.22, s * 0.017], [-s * 0.18, s * 0.16, s * 0.014]]);
}

function drawStarSapphire(g: Phaser.GameObjects.Graphics, s: number, p: Palette): void {
  // Masterwork capstone - a real, more prestigious sapphire variety
  // (asterism, a visible "star" under light). The round brilliant is the
  // most heavily cut stone in the chain, so it earns the top slot on
  // silhouette alone; the asterism star then sits on a cut that actually
  // justifies it, rather than being the only thing separating this tier
  // from the one below (which is what a 10-sided rosette against an
  // 8-sided one amounted to).
  drawBrilliantCut(g, s, p);
  drawStarSparkle(g, 0, 0, s * 0.05);
  drawSparkles(g, [[s * 0.26, -s * 0.22, s * 0.014], [-s * 0.28, s * 0.14, s * 0.012]]);
}

// ---- Glass chain ----
//
// The first chain built directly against the shared 8-tier shape grammar
// (see docs/FAMILIES_ROADMAP.md) rather than inventing its own bespoke
// per-tier shapes. Its material identity is TRANSLUCENCY, not a hue ramp -
// alpha drops from fully opaque sand at tier 1 toward increasingly clear
// crystal at tier 8, applied via setAlpha() on the whole Graphics object
// so every fill/stroke in a tier's draw call is affected uniformly.

function drawRawSand(g: Phaser.GameObjects.Graphics, s: number, p: Palette): number {
  drawGranularMound(g, s, p);
  return 1;
}

function drawGlassShard(g: Phaser.GameObjects.Graphics, s: number, p: Palette): number {
  // Was Rubble's exact polygon with 2-4% jitter on every vertex - the same
  // six-sided lump, not a different shape. The shape grammar does allow
  // tier 1-2 to read as a FAMILY of rough chunks across chains, but that
  // means similar-in-kind, not one outline copied and nudged.
  //
  // The distinction is material, not decorative: stone rubble breaks into
  // chunky equant lumps, while glass breaks into thin bladed splinters with
  // acute points and long straight edges. Five points instead of six, a
  // narrow waist, and two sharp tips - a silhouette rubble can't have.
  drawIrregularChip(g, [
    [-s * 0.3, s * 0.2], [-s * 0.1, -s * 0.3], [s * 0.04, -s * 0.24],
    [s * 0.3, s * 0.06], [s * 0.06, s * 0.22]
  ], p);

  // Bright edge streak - a cut glass edge catching the key light. Glass is
  // read by its edges far more than its faces, which is also why this tier
  // needs it and the opaque materials don't.
  g.lineStyle(Math.max(1, s * 0.02), p.highlight, 0.85);
  g.beginPath();
  g.moveTo(-s * 0.1, -s * 0.28);
  g.lineTo(s * 0.26, s * 0.05);
  g.strokePath();
  return 0.85;
}

function drawCutGlassBlock(g: Phaser.GameObjects.Graphics, s: number, p: Palette): number {
  const w = s * 0.5, h = s * 0.3;
  drawPlankFace(g, -w / 2, -h / 2, w, h, s * 0.02, p);
  return 0.78;
}

function drawCrystalBlock(g: Phaser.GameObjects.Graphics, s: number, p: Palette): number {
  drawBlock(g, s * 0.5, s * 0.36, s * 0.14, s * 0.08, p);
  return 0.72;
}

function drawBeveledCrystal(g: Phaser.GameObjects.Graphics, s: number, p: Palette): number {
  drawFacetedForm(g, s * 0.92, 5, p);
  return 0.68;
}

function drawCrystalObelisk(g: Phaser.GameObjects.Graphics, s: number, p: Palette): number {
  drawObelisk(g, s, 6, p);
  return 0.62;
}

function drawCrystalLattice(g: Phaser.GameObjects.Graphics, s: number, p: Palette): number {
  drawInterlockingCross(g, s, p);
  return 0.58;
}

function drawPrismaticKnot(g: Phaser.GameObjects.Graphics, s: number, p: Palette): number {
  drawInterlockingKnot(g, s, p);
  drawSparkles(g, [[s * 0.22, -s * 0.18, s * 0.016], [-s * 0.24, s * 0.14, s * 0.013]]);
  return 0.55;
}

function drawAuroraCrystal(g: Phaser.GameObjects.Graphics, s: number, p: Palette): number {
  // Masterwork capstone. This used to be drawInterlockingKnot's 3 rings
  // plus an independently-angled 4th - reasoned about as a real variation,
  // but a 4th ring among 3 is simply not visible at icon size, so tiers 8
  // and 9 read as the same pale ring separated only by a hue shift. Same
  // failure as Wood 7/8 and Stone 7-9.
  //
  // The fix is the one silhouette change that survives at 45px: the CENTRE
  // FILLS IN. Tier 8 is open loops you see straight through; tier 9 is a
  // solid faceted crystal with rings orbiting it - hollow vs cored is
  // legible instantly, where ring-counting never was. It also stays in
  // Glass's own ring language rather than borrowing Wood's weave or
  // Stone's cuts, and finally earns the name: a crystal at the heart with
  // light banded around it.
  //
  // Draw order is back-ring / core / front-ring so one loop passes behind
  // the crystal and one in front, which is what sells it as an orbit
  // rather than a circle sitting on a blob.
  strokeRotatedRing(g, s * 0.3, s * 0.15, -0.5, s * 0.055, p.dark, 0.85);

  // Bright faceted core. NOT drawFacetedForm: that alternates highlight
  // against p.dark, and at Glass's 0.5 material alpha the dark facets let
  // the board through, so the crystal came out as a dark hole in the middle
  // of the rings - the opposite of the luminous heart this tier wants. A
  // solid body first, then facets drawn only from the light half of the
  // ramp, keeps it reading as lit glass.
  const coreR = s * 0.17;
  const corePts: [number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const a = (Math.PI * 2 * i) / 7 - Math.PI / 2;
    corePts.push([Math.cos(a) * coreR, Math.sin(a) * coreR * 1.1]);
  }
  g.fillStyle(p.light, 1);
  g.beginPath();
  corePts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
  for (let i = 0; i < corePts.length; i++) {
    const [x1, y1] = corePts[i];
    const [x2, y2] = corePts[(i + 1) % corePts.length];
    const mid = Math.atan2((y1 + y2) / 2, (x1 + x2) / 2);
    g.fillStyle(toneForNormal(p, mid), 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(x1, y1);
    g.lineTo(x2, y2);
    g.closePath();
    g.fillPath();
  }
  g.lineStyle(1, p.dark, 0.55);
  g.strokePoints(corePts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

  strokeRotatedRing(g, s * 0.27, s * 0.13, 0.75, s * 0.05, p.light, 0.95);
  // Thin inner highlight riding the front ring - the "aurora" band.
  strokeRotatedRing(g, s * 0.26, s * 0.125, 0.75, s * 0.016, p.highlight, 0.9);

  drawSparkles(g, [[s * 0.26, -s * 0.24, s * 0.017], [-s * 0.28, s * 0.18, s * 0.014]]);
  return 0.5;
}

// ---- Source buildings ----
//
// A source is a compact building constructed from the material it produces:
// timber mill, stone works, or glass house. The silhouettes remain reduced
// and geometric, but they now communicate both "producer" and family without
// relying on a generic square/hex/circle symbol.

/** Regular n-gon points, flat-topped, at radius r. */
function ngon(n: number, r: number, rotation: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + rotation;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function fillPoly(g: Phaser.GameObjects.Graphics, pts: [number, number][], color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
  g.fillPath();
}

/**
 * Hand-built isometric recreation of the approved Wood S01 render. Broad
 * planes carry the 3D read at board size: foundation, two wall faces,
 * recessed work bay, lumber mass, roof plane and dark structural frame.
 */
function drawWoodSourceLevelOneIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean
): void {
  const u = r * 1.38;

  g.fillStyle(p.shadow, 0.32);
  g.fillEllipse(0, u * 0.82, u * 2.35, u * 0.42);

  // Thin brutalist foundation slab.
  const base: [number, number][] = [
    [-u * 1.16, u * 0.45], [-u * 0.08, u * 1.02],
    [u * 1.17, u * 0.47], [u * 0.1, -u * 0.02]
  ];
  fillPoly(g, base, p.shadow);
  g.lineStyle(1, p.highlight, 0.22);
  g.strokePoints(base.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

  // Timber front and darker side: separate values establish the isometric
  // light direction without fine texture or raster-style microdetail.
  const front: [number, number][] = [
    [-u * 0.92, -u * 0.22], [u * 0.05, u * 0.2],
    [u * 0.05, u * 0.78], [-u * 0.92, u * 0.36]
  ];
  const side: [number, number][] = [
    [u * 0.05, u * 0.2], [u * 0.88, -u * 0.19],
    [u * 0.88, u * 0.39], [u * 0.05, u * 0.78]
  ];
  fillPoly(g, front, ready ? p.light : p.base);
  fillPoly(g, side, p.base);

  // Sparse timber panel joints, following each face's perspective.
  g.lineStyle(1, p.shadow, 0.42);
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    g.lineBetween(
      Phaser.Math.Linear(-u * 0.92, u * 0.05, t), Phaser.Math.Linear(-u * 0.22, u * 0.2, t),
      Phaser.Math.Linear(-u * 0.92, u * 0.05, t), Phaser.Math.Linear(u * 0.36, u * 0.78, t)
    );
  }
  for (let i = 1; i <= 2; i++) {
    const t = i / 3;
    g.lineBetween(
      Phaser.Math.Linear(u * 0.05, u * 0.88, t), Phaser.Math.Linear(u * 0.2, -u * 0.19, t),
      Phaser.Math.Linear(u * 0.05, u * 0.88, t), Phaser.Math.Linear(u * 0.78, u * 0.39, t)
    );
  }

  // Recessed open bay and one simplified lumber mass.
  const bay: [number, number][] = [
    [-u * 0.74, -u * 0.08], [-u * 0.12, u * 0.19],
    [-u * 0.12, u * 0.62], [-u * 0.74, u * 0.35]
  ];
  fillPoly(g, bay, p.dark);
  fillPoly(g, [
    [-u * 0.67, u * 0.26], [-u * 0.2, u * 0.46],
    [-u * 0.2, u * 0.56], [-u * 0.67, u * 0.36]
  ], ready ? p.highlight : p.light, 0.92);
  g.lineStyle(1, p.shadow, 0.65);
  for (let i = 0; i < 3; i++) {
    const dy = u * (0.025 + i * 0.055);
    g.lineBetween(-u * 0.65, u * 0.27 + dy, -u * 0.21, u * 0.46 + dy);
  }

  // Heavy charcoal bay frame: few structural lines, high silhouette value.
  g.lineStyle(Math.max(1.2, u * 0.075), p.shadow, 1);
  g.strokePoints(bay.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

  // One broad standing-seam roof plane with a hard fascia. The diagonal ribs
  // are sparse enough to survive reduction without looking illustrated.
  const roof: [number, number][] = [
    [-u * 1.03, -u * 0.27], [-u * 0.12, -u * 0.82],
    [u * 1.01, -u * 0.32], [u * 0.08, u * 0.2]
  ];
  fillPoly(g, roof, p.dark);
  g.lineStyle(1, p.light, 0.46);
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const topX = Phaser.Math.Linear(-u * 0.12, u * 1.01, t);
    const topY = Phaser.Math.Linear(-u * 0.82, -u * 0.32, t);
    const botX = Phaser.Math.Linear(-u * 1.03, u * 0.08, t);
    const botY = Phaser.Math.Linear(-u * 0.27, u * 0.2, t);
    g.lineBetween(topX, topY, botX, botY);
  }
  g.lineStyle(Math.max(1.2, u * 0.08), p.shadow, 1);
  g.strokePoints(roof.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineStyle(1, p.highlight, 0.38);
  g.lineBetween(-u * 0.12, -u * 0.82, u * 1.01, -u * 0.32);
}

/**
 * Wood S02 continues S01's exact isometric construction language. The
 * workshop gains floor area, a side canopy, a wider illuminated bay and a
 * glazed side strip; it is still recognizably the same property one upgrade
 * later rather than an unrelated building.
 */
function drawWoodSourceLevelTwoIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean
): void {
  const u = r * 1.42;

  g.fillStyle(p.shadow, 0.34);
  g.fillEllipse(0, u * 0.84, u * 2.55, u * 0.44);

  const base: [number, number][] = [
    [-u * 1.3, u * 0.43], [-u * 0.1, u * 1.08],
    [u * 1.28, u * 0.48], [u * 0.08, -u * 0.1]
  ];
  fillPoly(g, base, p.shadow);
  g.lineStyle(1, p.highlight, 0.24);
  g.strokePoints(base.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

  // Main workshop faces, slightly wider and taller than S01.
  const front: [number, number][] = [
    [-u * 0.9, -u * 0.3], [u * 0.13, u * 0.15],
    [u * 0.13, u * 0.82], [-u * 0.9, u * 0.37]
  ];
  const side: [number, number][] = [
    [u * 0.13, u * 0.15], [u * 0.98, -u * 0.25],
    [u * 0.98, u * 0.42], [u * 0.13, u * 0.82]
  ];
  fillPoly(g, front, ready ? p.light : p.base);
  fillPoly(g, side, p.base);

  // Sparse vertical timber joints remain aligned with S01's perspective.
  g.lineStyle(1, p.shadow, 0.4);
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    g.lineBetween(
      Phaser.Math.Linear(-u * 0.9, u * 0.13, t), Phaser.Math.Linear(-u * 0.3, u * 0.15, t),
      Phaser.Math.Linear(-u * 0.9, u * 0.13, t), Phaser.Math.Linear(u * 0.37, u * 0.82, t)
    );
  }

  // Wider warm work bay with one consolidated timber stack.
  const bay: [number, number][] = [
    [-u * 0.75, -u * 0.11], [-u * 0.03, u * 0.2],
    [-u * 0.03, u * 0.66], [-u * 0.75, u * 0.35]
  ];
  fillPoly(g, bay, p.dark);
  fillPoly(g, [
    [-u * 0.66, u * 0.24], [-u * 0.13, u * 0.47],
    [-u * 0.13, u * 0.6], [-u * 0.66, u * 0.37]
  ], ready ? p.highlight : p.light, 0.94);
  g.lineStyle(1, p.shadow, 0.62);
  for (let i = 0; i < 3; i++) {
    const dy = u * (0.035 + i * 0.058);
    g.lineBetween(-u * 0.63, u * 0.25 + dy, -u * 0.15, u * 0.46 + dy);
  }
  g.lineStyle(Math.max(1.2, u * 0.07), p.shadow, 1);
  g.strokePoints(bay.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

  // A restrained glazed strip is the first refinement beyond the shed.
  const glass = ready ? p.highlight : p.light;
  const window: [number, number][] = [
    [u * 0.28, u * 0.16], [u * 0.82, -u * 0.09],
    [u * 0.82, u * 0.09], [u * 0.28, u * 0.34]
  ];
  fillPoly(g, window, p.dark);
  g.lineStyle(1, glass, ready ? 0.72 : 0.42);
  g.strokePoints(window.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineBetween(u * 0.55, u * 0.035, u * 0.55, u * 0.215);

  // Main standing-seam roof, sharing S01's pitch and upper-left highlight.
  const roof: [number, number][] = [
    [-u * 1.02, -u * 0.34], [-u * 0.1, -u * 0.9],
    [u * 1.1, -u * 0.37], [u * 0.15, u * 0.19]
  ];
  fillPoly(g, roof, p.dark);
  g.lineStyle(1, p.light, 0.46);
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    g.lineBetween(
      Phaser.Math.Linear(-u * 0.1, u * 1.1, t), Phaser.Math.Linear(-u * 0.9, -u * 0.37, t),
      Phaser.Math.Linear(-u * 1.02, u * 0.15, t), Phaser.Math.Linear(-u * 0.34, u * 0.19, t)
    );
  }
  g.lineStyle(Math.max(1.2, u * 0.075), p.shadow, 1);
  g.strokePoints(roof.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineStyle(1, p.highlight, 0.4);
  g.lineBetween(-u * 0.1, -u * 0.9, u * 1.1, -u * 0.37);

  // Lower side canopy: unmistakable added floor area without changing the
  // parent building's camera or material language.
  const canopy: [number, number][] = [
    [-u * 1.29, u * 0.02], [-u * 0.87, -u * 0.2],
    [-u * 0.35, u * 0.02], [-u * 0.79, u * 0.25]
  ];
  fillPoly(g, canopy, p.dark);
  g.lineStyle(1, p.highlight, 0.34);
  g.strokePoints(canopy.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineStyle(Math.max(1, u * 0.055), p.shadow, 1);
  g.lineBetween(-u * 1.2, u * 0.06, -u * 1.2, u * 0.48);
  g.lineBetween(-u * 0.45, u * 0.04, -u * 0.45, u * 0.5);
}

/**
 * Stone S01 uses the shared isometric camera but a different architectural
 * language: weight, masonry courses and one flat brutalist roof slab. The
 * open cutting bay holds a single broad stone mass, so family identity comes
 * from construction and contents rather than a badge.
 */
function drawStoneSourceLevelOneIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean
): void {
  const u = r * 1.38;

  g.fillStyle(p.shadow, 0.34);
  g.fillEllipse(0, u * 0.82, u * 2.35, u * 0.43);

  const base: [number, number][] = [
    [-u * 1.15, u * 0.43], [-u * 0.06, u * 1.02],
    [u * 1.16, u * 0.47], [u * 0.08, -u * 0.04]
  ];
  fillPoly(g, base, p.shadow);
  g.lineStyle(1, p.highlight, 0.2);
  g.strokePoints(base.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

  const front: [number, number][] = [
    [-u * 0.9, -u * 0.25], [u * 0.06, u * 0.18],
    [u * 0.06, u * 0.78], [-u * 0.9, u * 0.35]
  ];
  const side: [number, number][] = [
    [u * 0.06, u * 0.18], [u * 0.88, -u * 0.2],
    [u * 0.88, u * 0.4], [u * 0.06, u * 0.78]
  ];
  fillPoly(g, front, ready ? p.light : p.base);
  fillPoly(g, side, p.base);

  // Three heavy masonry courses wrap both visible faces. Alternating joints
  // keep the material legible at small size without turning into texture.
  g.lineStyle(1, p.shadow, 0.55);
  for (let row = 1; row <= 2; row++) {
    const t = row / 3;
    g.lineBetween(
      Phaser.Math.Linear(-u * 0.9, -u * 0.9, t), Phaser.Math.Linear(-u * 0.25, u * 0.35, t),
      Phaser.Math.Linear(u * 0.06, u * 0.06, t), Phaser.Math.Linear(u * 0.18, u * 0.78, t)
    );
    g.lineBetween(
      Phaser.Math.Linear(u * 0.06, u * 0.06, t), Phaser.Math.Linear(u * 0.18, u * 0.78, t),
      Phaser.Math.Linear(u * 0.88, u * 0.88, t), Phaser.Math.Linear(-u * 0.2, u * 0.4, t)
    );
  }
  g.lineBetween(-u * 0.42, -u * 0.04, -u * 0.42, u * 0.56);
  g.lineBetween(u * 0.47, -u * 0.01, u * 0.47, u * 0.59);

  // Recessed cutting bay with one faceted stone mass.
  const bay: [number, number][] = [
    [-u * 0.72, -u * 0.09], [-u * 0.12, u * 0.18],
    [-u * 0.12, u * 0.63], [-u * 0.72, u * 0.36]
  ];
  fillPoly(g, bay, p.dark);
  const stone: [number, number][] = [
    [-u * 0.6, u * 0.27], [-u * 0.4, u * 0.2], [-u * 0.19, u * 0.32],
    [-u * 0.2, u * 0.52], [-u * 0.46, u * 0.53], [-u * 0.65, u * 0.41]
  ];
  fillPoly(g, stone.map(([x, y]) => [x, y + dropOffset(r)]), p.shadow);
  fillPoly(g, stone, ready ? p.highlight : p.light);
  g.lineStyle(1, p.shadow, 0.55);
  g.lineBetween(-u * 0.4, u * 0.2, -u * 0.46, u * 0.53);
  g.lineStyle(Math.max(1.2, u * 0.075), p.shadow, 1);
  g.strokePoints(bay.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);

  // One thick, flat isometric roof slab: Stone's brutalist counterpart to
  // Wood's pitched standing-seam roof.
  const roof: [number, number][] = [
    [-u * 1.01, -u * 0.31], [-u * 0.08, -u * 0.76],
    [u * 1.02, -u * 0.28], [u * 0.08, u * 0.19]
  ];
  fillPoly(g, roof, p.dark);
  const fascia: [number, number][] = [
    [-u * 1.01, -u * 0.31], [u * 0.08, u * 0.19],
    [u * 0.08, u * 0.29], [-u * 1.01, -u * 0.21]
  ];
  fillPoly(g, fascia, p.shadow);
  g.lineStyle(1, p.highlight, 0.4);
  g.strokePoints(roof.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineBetween(-u * 0.08, -u * 0.76, u * 1.02, -u * 0.28);
}

/**
 * Glass S01 is a compact glazing studio: a dark structural frame holds
 * translucent wall and roof planes around a warm cutting bay. It shares the
 * other sources' isometric camera and grounded architectural footprint while
 * keeping glass recognizable through overlap, refraction-like highlights and
 * visible framing instead of excessive glow.
 */
function drawGlassSourceLevelOneIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean
): void {
  // Match the established S01 architectural scale used by both Wood and
  // Stone so all three source families carry equal visual weight on-board.
  const u = r * 1.38;
  const frame = p.dark;
  const glass = ready ? p.highlight : p.light;
  const glassShade = ready ? p.light : p.base;

  // Soft contact shadow only—the building itself remains the entire tile art.
  g.fillStyle(p.shadow, 0.22);
  g.fillEllipse(u * 0.06, u * 0.78, u * 2.55, u * 0.46);

  // Thin isometric foundation slab anchors the transparent structure.
  const baseTop: [number, number][] = [
    [-u * 1.08, u * 0.48], [-u * 0.2, -u * 0.03],
    [u * 1.1, u * 0.48], [u * 0.2, u * 1.0]
  ];
  fillPoly(g, baseTop, p.base);
  fillPoly(g, [
    [-u * 1.08, u * 0.48], [u * 0.2, u], [u * 0.2, u * 1.12], [-u * 1.08, u * 0.6]
  ], p.dark);
  fillPoly(g, [
    [u * 0.2, u], [u * 1.1, u * 0.48], [u * 1.1, u * 0.6], [u * 0.2, u * 1.12]
  ], p.shadow);

  const leftBottom: [number, number] = [-u * 0.82, u * 0.39];
  const centreBottom: [number, number] = [u * 0.12, u * 0.78];
  const rightBottom: [number, number] = [u * 0.86, u * 0.35];
  const leftTop: [number, number] = [-u * 0.82, -u * 0.42];
  const centreTop: [number, number] = [u * 0.12, -u * 0.03];
  const rightTop: [number, number] = [u * 0.86, -u * 0.46];
  const ridgeLeft: [number, number] = [-u * 0.35, -u * 0.92];
  const ridgeRight: [number, number] = [u * 0.58, -u * 0.53];

  // Two wall planes remain translucent so their overlaps create the sense of
  // real glass volume at board scale.
  fillPoly(g, [leftBottom, centreBottom, centreTop, leftTop], glassShade, 0.34);
  fillPoly(g, [centreBottom, rightBottom, rightTop, centreTop], glass, 0.25);

  // Pitched glass roof with different values on each plane.
  fillPoly(g, [leftTop, centreTop, ridgeRight, ridgeLeft], glass, 0.5);
  fillPoly(g, [centreTop, rightTop, ridgeRight], glassShade, 0.4);

  // A warm, recessed production bay makes this a working glass source rather
  // than a decorative greenhouse.
  fillPoly(g, [
    [-u * 0.26, u * 0.33], [u * 0.04, u * 0.46],
    [u * 0.04, u * 0.76], [-u * 0.26, u * 0.64]
  ], 0x5b3d2f, 0.92);
  fillPoly(g, [
    [-u * 0.21, u * 0.36], [-u * 0.02, u * 0.44],
    [-u * 0.02, u * 0.67], [-u * 0.21, u * 0.59]
  ], ready ? 0xffd79a : 0xb98558, ready ? 0.9 : 0.68);

  // Structural mullions describe the form more strongly than outlines around
  // the whole icon, keeping the result architectural and restrained.
  g.lineStyle(Math.max(1, u * 0.075), frame, 0.92);
  g.lineBetween(leftBottom[0], leftBottom[1], leftTop[0], leftTop[1]);
  g.lineBetween(centreBottom[0], centreBottom[1], centreTop[0], centreTop[1]);
  g.lineBetween(rightBottom[0], rightBottom[1], rightTop[0], rightTop[1]);
  g.lineBetween(leftTop[0], leftTop[1], ridgeLeft[0], ridgeLeft[1]);
  g.lineBetween(ridgeLeft[0], ridgeLeft[1], ridgeRight[0], ridgeRight[1]);
  g.lineBetween(ridgeRight[0], ridgeRight[1], rightTop[0], rightTop[1]);
  g.lineBetween(leftTop[0], leftTop[1], centreTop[0], centreTop[1]);
  g.lineBetween(centreTop[0], centreTop[1], rightTop[0], rightTop[1]);
  g.lineBetween(leftBottom[0], leftBottom[1], centreBottom[0], centreBottom[1]);
  g.lineBetween(centreBottom[0], centreBottom[1], rightBottom[0], rightBottom[1]);

  // Sparse cyan reflection strokes indicate polished glazing without texture
  // noise or a cartoon shine symbol.
  g.lineStyle(1, p.highlight, ready ? 0.82 : 0.52);
  g.lineBetween(-u * 0.68, -u * 0.3, -u * 0.68, u * 0.18);
  g.lineBetween(u * 0.7, -u * 0.34, u * 0.7, u * 0.04);
  g.lineBetween(-u * 0.2, -u * 0.77, u * 0.35, -u * 0.54);
}

/**
 * Glass S02 extends the original glazing studio into a more valuable two-bay
 * glassworks. The original pitched volume remains legible, while a framed
 * cutting annex and raised roof lantern add floor area, equipment and finish.
 */
function drawGlassSourceLevelTwoIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean
): void {
  drawGlassSourceLevelOneIsometric(g, r, p, ready);

  const u = r * 1.38;
  const frame = p.dark;
  const glass = ready ? p.highlight : p.light;
  const glassShade = ready ? p.light : p.base;

  // A projecting right-hand cutting annex increases the building's usable
  // footprint without making the second tier visually unrelated to S01.
  const annexTop: [number, number][] = [
    [u * 0.2, u * 0.28], [u * 0.83, -u * 0.08],
    [u * 1.22, u * 0.08], [u * 0.58, u * 0.45]
  ];
  const annexFront: [number, number][] = [
    [u * 0.2, u * 0.28], [u * 0.58, u * 0.45],
    [u * 0.58, u * 0.91], [u * 0.2, u * 0.75]
  ];
  const annexSide: [number, number][] = [
    [u * 0.58, u * 0.45], [u * 1.22, u * 0.08],
    [u * 1.22, u * 0.54], [u * 0.58, u * 0.91]
  ];
  fillPoly(g, annexFront, glassShade, 0.38);
  fillPoly(g, annexSide, glass, 0.3);
  fillPoly(g, annexTop, glass, 0.56);

  // Raised clerestory/vent lantern: a practical glassworks upgrade and a
  // controlled increase in height rather than decorative ornament.
  const lanternLeft = -u * 0.17;
  const lanternRight = u * 0.43;
  const lanternBase = -u * 0.58;
  const lanternTop = -u * 0.9;
  fillPoly(g, [
    [lanternLeft, lanternBase], [lanternRight, lanternBase + u * 0.24],
    [lanternRight, lanternTop + u * 0.24], [lanternLeft, lanternTop]
  ], glassShade, 0.46);
  fillPoly(g, [
    [lanternLeft, lanternTop], [lanternLeft + u * 0.18, lanternTop - u * 0.1],
    [lanternRight + u * 0.18, lanternTop + u * 0.14], [lanternRight, lanternTop + u * 0.24]
  ], glass, 0.58);

  // A longer warm workbench visibly upgrades production capacity.
  fillPoly(g, [
    [u * 0.45, u * 0.48], [u * 0.95, u * 0.2],
    [u * 0.95, u * 0.38], [u * 0.45, u * 0.67]
  ], 0x604235, 0.94);
  g.lineStyle(Math.max(1, u * 0.065), frame, 0.94);
  g.strokePoints(annexTop.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineBetween(u * 0.2, u * 0.28, u * 0.2, u * 0.75);
  g.lineBetween(u * 0.58, u * 0.45, u * 0.58, u * 0.91);
  g.lineBetween(u * 1.22, u * 0.08, u * 1.22, u * 0.54);
  g.lineBetween(u * 0.9, u * 0.27, u * 0.9, u * 0.7);
  g.lineBetween(lanternLeft, lanternBase, lanternLeft, lanternTop);
  g.lineBetween(lanternRight, lanternBase + u * 0.24, lanternRight, lanternTop + u * 0.24);

  g.lineStyle(1, p.highlight, ready ? 0.86 : 0.56);
  g.lineBetween(u * 0.72, u * 0.14, u * 1.04, -u * 0.04);
  g.lineBetween(u * 1.08, u * 0.18, u * 1.08, u * 0.43);
  g.lineBetween(lanternLeft + u * 0.1, lanternTop + u * 0.05,
    lanternRight - u * 0.04, lanternTop + u * 0.22);
}

function drawIsoBlock(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  w: number,
  d: number,
  h: number,
  topColor: number,
  leftColor: number,
  rightColor: number,
  strokeColor: number,
  alpha = 1
): void {
  const top: [number, number][] = [
    [cx - w * 0.5, cy],
    [cx, cy - d * 0.5],
    [cx + w * 0.5, cy],
    [cx, cy + d * 0.5]
  ];
  const down = (pt: [number, number]): [number, number] => [pt[0], pt[1] + h];
  fillPoly(g, [top[0], top[3], down(top[3]), down(top[0])], leftColor, alpha);
  fillPoly(g, [top[3], top[2], down(top[2]), down(top[3])], rightColor, alpha);
  fillPoly(g, top, topColor, alpha);
  g.lineStyle(1, strokeColor, 0.48 * alpha);
  g.strokePoints(top.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineBetween(top[0][0], top[0][1], top[0][0], top[0][1] + h);
  g.lineBetween(top[2][0], top[2][1], top[2][0], top[2][1] + h);
  g.lineBetween(top[3][0], top[3][1], top[3][0], top[3][1] + h);
}

function drawSourceSlab(g: Phaser.GameObjects.Graphics, u: number, p: Palette, width = 2.42, depth = 1.02): void {
  g.fillStyle(p.shadow, 0.28);
  g.fillEllipse(0, u * 0.88, u * 2.45, u * 0.4);
  drawIsoBlock(g, 0, u * 0.42, u * width, u * depth, u * 0.14, p.shadow, p.dark, p.shadow, p.highlight, 0.92);
}

function drawMutedWindow(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  w: number,
  h: number,
  p: Palette,
  ready: boolean
): void {
  g.fillStyle(p.dark, 0.82);
  g.fillRect(cx - w * 0.5, cy - h * 0.5, w, h);
  g.lineStyle(1, ready ? p.highlight : p.light, ready ? 0.62 : 0.34);
  g.strokeRect(cx - w * 0.5, cy - h * 0.5, w, h);
}

/**
 * One building mass, in the same construction language as the authored S01
 * and S02 sources.
 *
 * Two things here are what the generated tiers were missing. First, a mass is
 * placed by the y of its BASE, so every mass in a building shares one ground
 * line and sits on the slab - stacking blocks by their centres is what left
 * the old tiers looking like plates floating apart from one another. Second,
 * the roof is the TOP of a mass rather than a separate wide, flat block
 * hovering above it, which is what read as an umbrella.
 */
function sourceMass(
  g: Phaser.GameObjects.Graphics,
  p: Palette,
  cx: number,
  baseY: number,
  w: number,
  d: number,
  h: number,
  opts: { front?: number; side?: number; roof?: number; ribs?: number; alpha?: number } = {}
): void {
  const cy = baseY - h;
  const alpha = opts.alpha ?? 1;
  const L: [number, number] = [cx - w, cy];
  const T: [number, number] = [cx, cy - d];
  const R: [number, number] = [cx + w, cy];
  const B: [number, number] = [cx, cy + d];
  const dn = (pt: [number, number]): [number, number] => [pt[0], pt[1] + h];

  fillPoly(g, [L, B, dn(B), dn(L)], opts.front ?? p.base, alpha);
  fillPoly(g, [B, R, dn(R), dn(B)], opts.side ?? p.dark, alpha);
  fillPoly(g, [L, T, R, B], opts.roof ?? p.dark, alpha);

  // Sparse roof ribs following the plane's own perspective - the same
  // standing-seam treatment S01's roof uses.
  const ribs = opts.ribs ?? 4;
  g.lineStyle(1, p.light, 0.34 * alpha);
  for (let i = 1; i <= ribs; i++) {
    const t = i / (ribs + 1);
    g.lineBetween(
      Phaser.Math.Linear(L[0], T[0], t), Phaser.Math.Linear(L[1], T[1], t),
      Phaser.Math.Linear(B[0], R[0], t), Phaser.Math.Linear(B[1], R[1], t)
    );
  }

  // Heavy silhouette: few lines, high value. This is what keeps the shape
  // legible once the whole building is drawn at cell size.
  g.lineStyle(Math.max(1.1, w * 0.06), p.shadow, alpha);
  g.strokePoints([L, T, R, B].map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineBetween(L[0], L[1], L[0], L[1] + h);
  g.lineBetween(B[0], B[1], B[0], B[1] + h);
  g.lineBetween(R[0], R[1], R[0], R[1] + h);
  g.lineStyle(1, p.highlight, 0.3 * alpha);
  g.lineBetween(L[0], L[1], T[0], T[1]);
}

/** The lit working bay on a mass's front face - S01's recessed doorway. */
function sourceBay(
  g: Phaser.GameObjects.Graphics, p: Palette, ready: boolean,
  cx: number, baseY: number, w: number, h: number
): void {
  const bay: [number, number][] = [
    [cx - w, baseY - h - w * 0.28], [cx + w, baseY - h + w * 0.28],
    [cx + w, baseY + w * 0.28], [cx - w, baseY - w * 0.28]
  ];
  fillPoly(g, bay, p.dark);
  fillPoly(g, [
    [cx - w * 0.82, baseY - h * 0.34 - w * 0.2], [cx + w * 0.82, baseY - h * 0.34 + w * 0.26],
    [cx + w * 0.82, baseY - h * 0.1 + w * 0.26], [cx - w * 0.82, baseY - h * 0.1 - w * 0.2]
  ], ready ? p.highlight : p.light, ready ? 0.95 : 0.72);
  g.lineStyle(Math.max(1.1, w * 0.16), p.shadow, 1);
  g.strokePoints(bay.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
}

/** A narrow glazed slot on a front face. */
function sourceSlot(
  g: Phaser.GameObjects.Graphics, p: Palette, ready: boolean,
  cx: number, cy: number, w: number, h: number
): void {
  fillPoly(g, [
    [cx - w, cy - w * 0.28], [cx + w, cy + w * 0.28],
    [cx + w, cy + h + w * 0.28], [cx - w, cy + h - w * 0.28]
  ], p.dark, 0.9);
  g.lineStyle(1, ready ? p.highlight : p.light, ready ? 0.6 : 0.34);
  g.lineBetween(cx - w, cy - w * 0.28, cx + w, cy + w * 0.28);
}


/** Grid -> screen for the source buildings' shared isometric camera. */
type IsoFn = (x: number, y: number, z?: number) => [number, number];

/**
 * The projection S01 and S02 draw by hand, expressed once.
 *
 * Increasing x runs right-and-down, increasing y runs left-and-down, z is
 * straight up. The offsets exist because the grid origin is not the drawing's
 * centre - the slab runs longer on -x and the building rises on +z.
 */
function makeSourceIso(u: number, ox = 0.24, oy = 0.4): IsoFn {
  return (x, y, z = 0) => [
    (x - y) * u * 0.6 + u * ox,
    (x + y) * u * 0.31 - z * u + u * oy
  ];
}

interface SourceVolumeOpts {
  front: number;
  side: number;
  ribs?: number;
  /** Roof overhang in grid units. */
  overhang?: number;
  /**
   * Height the volume's walls START at. Non-zero lifts a storey onto the one
   * below it, which is what lets an upper floor CANTILEVER past the ground
   * floor's front edge - the move that reads as "two storeys" in isometric
   * rather than merely "taller".
   */
  z0?: number;
}

/**
 * One flat-roofed volume: its two lit faces, a shadowed fascia under the
 * overhang, then the roof plane on top.
 *
 * The roof takes a flat black glaze so it stays the darkest plane on the
 * object whatever the family palette is - without it, lighter families had
 * roofs that stopped out-valuing their own walls.
 */
function sourceVolume(
  g: Phaser.GameObjects.Graphics, p: Palette, iso: IsoFn, u: number,
  x0: number, x1: number, y0: number, y1: number, h: number,
  opts: SourceVolumeOpts
): void {
  const o = opts.overhang ?? 0.09;
  const rA = iso(x0 - o, y0 - o, h);
  const rB = iso(x1 + o, y0 - o, h);
  const rC = iso(x1 + o, y1 + o, h);
  const rD = iso(x0 - o, y1 + o, h);

  // Ground-level walls run slightly BELOW zero so they bed into the slab.
  // Stopping exactly at z=0 left a hairline where the wall met the plinth,
  // and the front of the building read as hovering over it.
  const z0 = opts.z0 ?? 0;
  const zBottom = z0 > 0 ? z0 : -0.05;
  fillPoly(g, [iso(x0, y1, h), iso(x1, y1, h), iso(x1, y1, zBottom), iso(x0, y1, zBottom)], opts.front);
  fillPoly(g, [iso(x1, y0, h), iso(x1, y1, h), iso(x1, y1, zBottom), iso(x1, y0, zBottom)], opts.side);
  if (z0 > 0) {
    // Soffit under the overhang, so the projecting floor casts its own edge
    // rather than floating.
    fillPoly(g, [
      iso(x0, y1, z0), iso(x1, y1, z0),
      [iso(x1, y1, z0)[0], iso(x1, y1, z0)[1] + u * 0.05],
      [iso(x0, y1, z0)[0], iso(x0, y1, z0)[1] + u * 0.05]
    ], 0x000000, 0.42);
  }

  const fasciaA: [number, number][] = [rD, rC, [rC[0], rC[1] + u * 0.05], [rD[0], rD[1] + u * 0.05]];
  const fasciaB: [number, number][] = [rC, rB, [rB[0], rB[1] + u * 0.05], [rC[0], rC[1] + u * 0.05]];
  fillPoly(g, fasciaA, p.shadow);
  fillPoly(g, fasciaB, p.shadow);
  fillPoly(g, fasciaA, 0x000000, 0.32);
  fillPoly(g, fasciaB, 0x000000, 0.32);

  fillPoly(g, [rA, rB, rC, rD], p.dark);
  fillPoly(g, [rA, rB, rC, rD], 0x000000, 0.22);
  const ribs = opts.ribs ?? 4;
  g.lineStyle(1, p.light, 0.3);
  for (let i = 1; i <= ribs; i++) {
    const t = i / (ribs + 1);
    g.lineBetween(
      Phaser.Math.Linear(rA[0], rB[0], t), Phaser.Math.Linear(rA[1], rB[1], t),
      Phaser.Math.Linear(rD[0], rC[0], t), Phaser.Math.Linear(rD[1], rC[1], t)
    );
  }
  g.lineStyle(Math.max(1.2, u * 0.07), p.shadow, 1);
  g.strokePoints([rA, rB, rC, rD].map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  g.lineStyle(1, p.highlight, 0.38);
  g.lineBetween(rA[0], rA[1], rB[0], rB[1]);
}

/** A rectangle mapped onto a volume's front-left face, in grid units. */
function sourceFace(
  iso: IsoFn, yFace: number, xa: number, xb: number, za: number, zb: number
): [number, number][] {
  return [iso(xa, yFace, zb), iso(xb, yFace, zb), iso(xb, yFace, za), iso(xa, yFace, za)];
}

/**
 * A rectangle on a volume's RIGHT face - the one at constant x.
 *
 * A volume rotated ninety degrees against the one below it shows its long
 * elevation on this face rather than on the front-left one, so it needs its
 * own mapping.
 */
function sourceFaceX(
  iso: IsoFn, xFace: number, ya: number, yb: number, za: number, zb: number
): [number, number][] {
  return [iso(xFace, ya, zb), iso(xFace, yb, zb), iso(xFace, yb, za), iso(xFace, ya, za)];
}

/** Single-pane glazing on a right face. */
function sourceGlazingX(
  g: Phaser.GameObjects.Graphics, p: Palette, iso: IsoFn, ready: boolean,
  xFace: number, ya: number, yb: number, za: number, zb: number
): void {
  const band = sourceFaceX(iso, xFace, ya, yb, za, zb);
  fillPoly(g, band, p.dark);
  // A raked reflection across the upper part of the pane. Without it a large
  // sheet of `p.dark` reads as a hole punched through the wall rather than as
  // glass - fine on the small bands, fatal on a full elevation.
  const zMid = za + (zb - za) * 0.55;
  fillPoly(g, [
    iso(xFace, ya, zb), iso(xFace, yb, zb),
    iso(xFace, yb, zMid), iso(xFace, ya, zMid)
  ], p.light, 0.16);
  g.lineStyle(1, ready ? p.highlight : p.light, ready ? 0.66 : 0.38);
  g.strokePoints(band.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
}

/** The deep recessed bay - the only warm value on a source, and its focal point. */
function sourceLitBay(
  g: Phaser.GameObjects.Graphics, p: Palette, iso: IsoFn, u: number, ready: boolean,
  yFace: number, xa: number, xb: number, h: number
): void {
  const bay = sourceFace(iso, yFace, xa, xb, 0, h);
  fillPoly(g, bay, p.dark);
  const inset = (xb - xa) * 0.14;
  fillPoly(
    g, sourceFace(iso, yFace, xa + inset, xb - inset, h * 0.12, h * 0.8),
    ready ? p.highlight : p.light, ready ? 0.95 : 0.72
  );
  g.lineStyle(1, p.shadow, 0.6);
  for (let i = 0; i < 2; i++) {
    const z = h * (0.28 + i * 0.22);
    const [ax, ay] = iso(xa + inset, yFace, z);
    const [bx, by] = iso(xb - inset, yFace, z);
    g.lineBetween(ax, ay, bx, by);
  }
  g.lineStyle(Math.max(1.3, u * 0.075), p.shadow, 1);
  g.strokePoints(bay.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
}

/**
 * A dark-framed glazing band on a front face.
 *
 * One pane by default. Modern glazing is a single sheet in a slim frame -
 * subdividing it into a grid of panes is domestic-traditional vocabulary and
 * reads as a cottage window wall, which is the opposite of this family's
 * direction. `mullions` exists for the rare wide run that genuinely needs a
 * structural split.
 */
function sourceGlazing(
  g: Phaser.GameObjects.Graphics, p: Palette, iso: IsoFn, ready: boolean,
  yFace: number, xa: number, xb: number, za: number, zb: number, mullions = 0
): void {
  const band = sourceFace(iso, yFace, xa, xb, za, zb);
  fillPoly(g, band, p.dark);
  g.lineStyle(1, ready ? p.highlight : p.light, ready ? 0.66 : 0.38);
  g.strokePoints(band.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
  for (let i = 1; i <= mullions; i++) {
    const x = Phaser.Math.Linear(xa, xb, i / (mullions + 1));
    const [ax, ay] = iso(x, yFace, zb);
    const [bx, by] = iso(x, yFace, za);
    g.lineBetween(ax, ay, bx, by);
  }
}

/** The thin brutalist slab every source stands on. */
function sourceSlabPlate(
  g: Phaser.GameObjects.Graphics, p: Palette, iso: IsoFn,
  x0: number, x1: number, y0: number, y1: number
): void {
  const slab: [number, number][] = [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)];
  fillPoly(g, slab, p.shadow);
  g.lineStyle(1, p.highlight, 0.22);
  g.strokePoints(slab.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
}

/**
 * Wood S03 - a new building, not S02 with additions bolted onto it.
 *
 * It plays off S01 and S02 by sharing their language rather than their
 * polygons: the same isometric camera, the same thin brutalist slab, flat
 * roof planes with a hard fascia, two-value walls off one upper-left key, and
 * exactly one warm recessed bay carrying the light. The composition itself is
 * new - a long low workshop with a taller plant volume set behind it, which
 * is the first tier where the source reads as a FACILITY rather than a shed.
 *
 * Shape budget is deliberate. At cell size this object can carry about five
 * readable masses; an earlier pass had nine and went muddy, with the lit bay
 * losing its job as the focal point.
 */
function drawWoodSourceLevelThreeIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean
): void {
  const u = r * 1.4;
  const iso = makeSourceIso(u);
  const wall = ready ? p.light : p.base;

  sourceSlabPlate(g, p, iso, -1.75, 0.95, -0.95, 0.95);

  // Plant volume, set back and to the right. Drawn first: it is further from
  // the camera, so the workshop in front must overlap it.
  sourceVolume(g, p, iso, u, 0.2, 0.9, -0.95, -0.15, 1.3, { front: p.base, side: p.dark, ribs: 3 });
  // Louvre slots - the one industrial-techno note, three lines, no more.
  g.lineStyle(1, p.shadow, 0.5);
  for (let i = 0; i < 3; i++) {
    const z = 0.72 + i * 0.13;
    const [ax, ay] = iso(0.3, -0.15, z);
    const [bx, by] = iso(0.8, -0.15, z);
    g.lineBetween(ax, ay, bx, by);
  }

  // The long low workshop.
  sourceVolume(g, p, iso, u, -1.55, 0.35, -0.4, 0.9, 0.66, { front: wall, side: p.base, ribs: 5 });

  // Sparse vertical panel joints on the workshop's front face.
  g.lineStyle(1, p.shadow, 0.4);
  for (let i = 1; i <= 4; i++) {
    const x = -1.55 + (1.9 * i) / 5;
    const [ax, ay] = iso(x, 0.9, 0.62);
    const [bx, by] = iso(x, 0.9, 0);
    g.lineBetween(ax, ay, bx, by);
  }

  sourceGlazing(g, p, iso, ready, 0.9, -0.5, 0.28, 0.3, 0.54);
  sourceLitBay(g, p, iso, u, ready, 0.9, -1.36, -0.62, 0.5);
}

/**
 * Wood S04 - the two-storey step, and again its own composition rather than
 * S03 with a box set on top.
 *
 * The workshop floor is now wide enough to carry an upper storey set BACK
 * from its front edge, which leaves an open roof terrace along the front with
 * a parapet - the clearest way to say "second floor" in an isometric
 * silhouette without simply making the object taller. The plant core grows
 * into a full-height shaft on the right.
 */
function drawWoodSourceLevelFourIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean
): void {
  const u = r * 1.28;
  const iso = makeSourceIso(u, 0.2, 0.52);
  const wall = ready ? p.light : p.base;

  sourceSlabPlate(g, p, iso, -1.95, 1.35, -1.0, 1.1);

  // Plant shaft, furthest back and right, so everything else overlaps it.
  // Kept at timber value and at a height close to the upper storey on
  // purpose: a darker, taller core was tried and separated the two masses
  // more cleanly, but it read as a different building bolted on. Sitting
  // close reads as one property.
  sourceVolume(g, p, iso, u, 0.5, 1.27, -0.95, -0.07, 1.42, { front: p.base, side: p.dark, ribs: 3 });
  g.lineStyle(1, p.shadow, 0.5);
  for (let i = 0; i < 4; i++) {
    const z = 1.02 + i * 0.13;
    const [ax, ay] = iso(0.62, -0.07, z);
    const [bx, by] = iso(1.15, -0.07, z);
    g.lineBetween(ax, ay, bx, by);
  }

  // Ground floor: the working level, running the full width.
  sourceVolume(g, p, iso, u, -1.7, 0.42, -0.55, 1.05, 0.74, { front: wall, side: p.base, ribs: 5 });

  // Upper storey, set back from the front edge - the setback is what reads as
  // a storey rather than as a taller shed.
  sourceVolume(g, p, iso, u, -1.5, 0.2, -0.45, 0.32, 0.66, { front: p.base, side: p.dark, ribs: 4 });

  // Terrace parapet along the open front of the ground roof.
  const [pax, pay] = iso(-1.55, 1.01, 0.86);
  const [pbx, pby] = iso(0.3, 1.01, 0.86);
  g.lineStyle(Math.max(1.1, u * 0.05), p.shadow, 1);
  g.lineBetween(pax, pay, pbx, pby);
  g.lineStyle(1, p.highlight, 0.3);
  g.lineBetween(pax, pay - u * 0.03, pbx, pby - u * 0.03);

  // Upper glazing - the office band, and the tier's second tell.
  sourceGlazing(g, p, iso, ready, 0.32, -1.34, 0.04, 0.94, 1.26);

  // Ground-floor openings: one lit bay, one narrow slot.
  sourceLitBay(g, p, iso, u, ready, 1.05, -1.5, -0.72, 0.58);
  sourceGlazing(g, p, iso, ready, 1.05, -0.5, 0.26, 0.24, 0.5);
}

/**
 * Wood S05 - the capstone, a modern two-storey house.
 *
 * The upper floor is rotated ninety degrees against the working level and
 * cantilevers off both ends of it. Two crossed bars is what makes this read
 * as designed architecture rather than a box stacked on a box.
 *
 * Its proportions matter more than the idea does. A first pass made the
 * crossing bar narrow and tall, and it read as a fin standing on edge that
 * also hid the working level behind it. It is wider than it is tall now, and
 * pulled back so the ground floor and its lit bay stay visible - the bay is
 * still the object's focal point at this tier.
 */
function drawWoodSourceLevelFiveIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean
): void {
  const u = r * 1.14;
  const iso = makeSourceIso(u, 0.27, 0.65);
  const wall = ready ? p.light : p.base;

  sourceSlabPlate(g, p, iso, -2.0, 1.4, -1.0, 1.3);

  // Service core, right and set back.
  sourceVolume(g, p, iso, u, 0.5, 1.36, -0.95, 0.03, 1.6, { front: p.base, side: p.dark, ribs: 3 });

  // Working level: long, low, glazed, with the lit bay at its left end. Its
  // front runs out to the slab's own edge so the house meets the ground.
  sourceVolume(g, p, iso, u, -1.8, 0.7, -0.45, 1.25, 0.72, { front: wall, side: p.base, ribs: 5 });
  sourceGlazing(g, p, iso, ready, 1.25, -0.5, 0.6, 0.2, 0.56);
  sourceLitBay(g, p, iso, u, ready, 1.25, -1.66, -0.9, 0.58);

  // Upper floor: crossing the level below, and set LEFT AND BACK rather than
  // centred on it. Centred, it collided with the service core and forced the
  // core to be cut short; off-centre, the core keeps the full height it has
  // at S04 and the two masses read as separate things.
  sourceVolume(g, p, iso, u, -1.62, -0.32, -0.85, 0.95, 1.58, {
    front: p.base, side: p.dark, ribs: 4, z0: 0.72
  });

  // Long elevation on the crossing bar's right face, and a short return on
  // its front - one pane each, no subdivisions.
  sourceGlazingX(g, p, iso, ready, -0.32, -0.65, 0.8, 0.98, 1.45);
  sourceGlazing(g, p, iso, ready, 0.95, -1.48, -0.46, 0.98, 1.38);

  // One gilt reveal under the cantilever - the wood family's final-tier
  // accent, and the only non-timber colour on the object.
  const [gax, gay] = iso(-1.62, 0.95, 0.76);
  const [gbx, gby] = iso(-0.32, 0.95, 0.76);
  g.lineStyle(1, GILT, 0.45);
  g.lineBetween(gax, gay, gbx, gby);
}

/**
 * Stone S02-S05. Heavier and more stepped than the wood yard - fewer, larger
 * masses and a squatter stance, the same way stone S01 reads against wood S01.
 */
function drawStoneSourceLevelIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean, level: number
): void {
  const u = r * (level >= 5 ? 1.18 : 1.24);
  const base = u * 0.62;
  drawSourceSlab(g, u, p, level >= 4 ? 2.78 : 2.56, level >= 4 ? 1.18 : 1.08);

  if (level >= 4) {
    sourceMass(g, p, -u * 0.94, base, u * 0.34, u * 0.18, u * 0.36, { front: p.base, side: p.dark });
  }
  sourceMass(g, p, u * 0.66, base, u * 0.46, u * 0.24, u * (level >= 4 ? 0.82 : 0.58),
    { front: p.base, side: p.dark });
  sourceMass(g, p, -u * 0.24, base, u * 0.78, u * 0.4, u * (0.62 + level * 0.1),
    { front: ready ? p.light : p.base, side: p.base, ribs: 3 });
  if (level >= 5) {
    sourceMass(g, p, -u * 0.24, base - u * 1.12, u * 0.5, u * 0.25, u * 0.3,
      { front: p.base, side: p.dark, ribs: 2 });
  }
  sourceBay(g, p, ready, -u * 0.32, base, u * 0.25, u * 0.4);

  // Coursing: horizontal banding on the front face, the stone family's tell.
  g.lineStyle(1, p.shadow, 0.44);
  for (let i = 1; i <= (level >= 4 ? 3 : 2); i++) {
    const y = base - u * (0.16 + i * 0.2);
    g.lineBetween(-u * 1.0, y - u * 0.12, u * 0.5, y + u * 0.14);
  }
  sourceSlot(g, p, ready, u * 0.66, base - u * (level >= 4 ? 0.54 : 0.36), u * 0.15, u * 0.15);
}

/**
 * Glass S03-S05. Translucent masses in a dark frame - the same buildings in a
 * material that lets light through instead of catching it.
 */
function drawGlassSourceLevelIsometric(
  g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean, level: number
): void {
  const u = r * (level >= 5 ? 1.18 : 1.24);
  const base = u * 0.62;
  const glass = ready ? p.highlight : p.light;
  drawSourceSlab(g, u, p, level >= 5 ? 2.76 : 2.6, level >= 4 ? 1.16 : 1.08);

  const pane = { front: glass, side: p.light, roof: glass, ribs: 3, alpha: 0.42 };
  sourceMass(g, p, u * 0.68, base, u * 0.44, u * 0.23, u * (level >= 4 ? 0.94 : 0.66), pane);
  sourceMass(g, p, -u * 0.3, base, u * 0.76, u * 0.39, u * (0.72 + level * 0.1),
    { front: glass, side: p.light, roof: glass, ribs: 4, alpha: 0.5 });
  if (level >= 5) {
    sourceMass(g, p, -u * 0.3, base - u * 1.22, u * 0.46, u * 0.23, u * 0.3,
      { front: glass, side: p.light, roof: glass, ribs: 2, alpha: 0.4 });
    sourceMass(g, p, -u * 1.0, base, u * 0.32, u * 0.17, u * 0.4,
      { front: glass, side: p.light, roof: glass, ribs: 2, alpha: 0.36 });
  }

  g.lineStyle(Math.max(1.1, u * 0.06), p.dark, 0.9);
  g.lineBetween(-u * 0.3, base - u * (0.82 + level * 0.1), -u * 0.3, base + u * 0.38);
  g.lineBetween(u * 0.68, base - u * (level >= 4 ? 0.94 : 0.66), u * 0.68, base + u * 0.22);
  sourceBay(g, p, ready, -u * 0.38, base, u * 0.24, u * 0.42);
  g.lineStyle(1, glass, ready ? 0.7 : 0.42);
  g.lineBetween(-u * 0.98, base - u * 0.52, -u * 0.34, base - u * 0.84);
}

/**
 * The tier whose chain colour every source building of a family is painted
 * in, at every level.
 *
 * Sources deliberately do NOT use their own tier's colour. The chain ramps
 * from a dark brown at wood 1 to a bright orange at wood 5, so painting each
 * source in its own tier made the upgrade path read as a colour gradient -
 * the building got more orange rather than more built. A wood source is wood
 * at every level; the upgrade is architecture, and the palette holds still so
 * the architecture is what changes.
 */
const SOURCE_PALETTE_TIER = 2;

/** Flat, tier-independent palette for a source building. */
export function sourcePalette(typeId: string): Palette {
  // Falls back to tier 1 before falling back to grey: the Decagon's chain is
  // ONE tier long, so asking it for a mid-chain colour returns nothing and
  // its machine came out the panel's dead grey rather than its own violet.
  const familyColor = getTierDef(typeId, SOURCE_PALETTE_TIER)?.color
    ?? getTierDef(typeId, 1)?.color
    ?? Theme.panelAlt;
  return materialLighting(familyColor, SOURCE_PALETTE_TIER);
}

/**
 * Draws a family-specific material building. There is deliberately no cell
 * card or chassis behind it; the structure is the complete board object.
 */
/**
 * THE DECAGON MACHINE. Every other source is a BUILDING - a mill, a stone
 * works, a glass house, a well - because every other source is permanent
 * infrastructure. This one is a machine on a stand: a ten-sided drum in a
 * cradle, with a chute at the bottom. It is temporary, and it should read as
 * something set down on the board rather than built into it.
 *
 * The drum carries the same ten-sided silhouette as the item it produces, so
 * the connection between the machine and the token needs no label.
 */
function drawDecagonMachine(g: Phaser.GameObjects.Graphics, r: number, p: Palette, ready: boolean): void {
  const SIDES = 10;
  const R = r * 1.15;
  const cy = -r * 0.15;
  const start = -Math.PI / 2 + Math.PI / SIDES;
  const ring = (radius: number): Phaser.Geom.Point[] => {
    const pts: Phaser.Geom.Point[] = [];
    for (let i = 0; i < SIDES; i++) {
      const a = start + (i / SIDES) * Math.PI * 2;
      pts.push(new Phaser.Geom.Point(Math.cos(a) * radius, cy + Math.sin(a) * radius));
    }
    return pts;
  };

  // Cradle: two legs and a base plate, drawn first so the drum sits in front.
  g.fillStyle(p.dark, 1);
  g.fillRect(-R * 0.86, cy + R * 0.5, R * 0.24, R * 0.9);
  g.fillRect(R * 0.62, cy + R * 0.5, R * 0.24, R * 0.9);
  g.fillGradientStyle(p.light, p.light, p.dark, p.dark, 1);
  g.fillRect(-R * 1.02, cy + R * 1.3, R * 2.04, R * 0.22);
  g.lineStyle(Math.max(1, r * 0.04), p.dark, 0.9);
  g.strokeRect(-R * 1.02, cy + R * 1.3, R * 2.04, R * 0.22);

  // The drum.
  const outer = ring(R);
  const inner = ring(R * 0.6);
  g.fillGradientStyle(p.highlight, p.light, p.shadow, p.dark, 1);
  g.fillPoints(outer, true);
  for (let i = 0; i < SIDES; i++) {
    const mid = start + ((i + 0.5) / SIDES) * Math.PI * 2;
    const lit = (Math.cos(mid - Math.PI * 1.25) + 1) / 2;
    g.fillStyle(toneForNormal(p, lit), 1);
    g.fillPoints([outer[i], outer[(i + 1) % SIDES], inner[(i + 1) % SIDES], inner[i]], true);
  }
  g.lineStyle(Math.max(1.2, r * 0.05), p.dark, 0.95);
  g.strokePoints(outer, true);

  // Hub, lit when there are drops left in it.
  g.fillStyle(ready ? p.highlight : p.shadow, 1);
  g.fillCircle(0, cy, R * 0.28);
  g.lineStyle(Math.max(1, r * 0.04), p.dark, 0.9);
  g.strokeCircle(0, cy, R * 0.28);

  // Chute: where the tokens come out.
  g.fillStyle(p.shadow, 1);
  g.beginPath();
  g.moveTo(-R * 0.34, cy + R * 0.95);
  g.lineTo(R * 0.34, cy + R * 0.95);
  g.lineTo(R * 0.2, cy + R * 1.3);
  g.lineTo(-R * 0.2, cy + R * 1.3);
  g.closePath();
  g.fillPath();
  g.lineStyle(Math.max(1, r * 0.035), p.dark, 0.9);
  g.strokePath();
}

export function drawSourceBuilding(
  g: Phaser.GameObjects.Graphics, typeId: string, tier: number, r: number, p: Palette, ready: boolean
): void {
  const level = Phaser.Math.Clamp(Math.round(tier), 1, 5);

  if (typeId === 'decagon') {
    drawDecagonMachine(g, r, p, ready);
  } else if (typeId === 'water') {
    drawWaterSourceIsometric(g, r, p, ready, level);
  } else if (typeId === 'mineral') {
    if (level === 1) {
      drawStoneSourceLevelOneIsometric(g, r, p, ready);
    } else {
      drawStoneSourceLevelIsometric(g, r, p, ready, level);
    }
  } else if (typeId === 'glass') {
    if (level === 1) {
      drawGlassSourceLevelOneIsometric(g, r, p, ready);
      return;
    }
    if (level === 2) {
      drawGlassSourceLevelTwoIsometric(g, r, p, ready);
      return;
    }
    drawGlassSourceLevelIsometric(g, r, p, ready, level);
  } else if (level === 1) {
    drawWoodSourceLevelOneIsometric(g, r, p, ready);
  } else if (level === 2) {
    drawWoodSourceLevelTwoIsometric(g, r, p, ready);
  } else if (level === 3) {
    drawWoodSourceLevelThreeIsometric(g, r, p, ready);
  } else if (level === 4) {
    drawWoodSourceLevelFourIsometric(g, r, p, ready);
  } else {
    drawWoodSourceLevelFiveIsometric(g, r, p, ready);
  }

  // One restrained readiness lamp keeps the techno accent functional.
  g.fillStyle(ready ? (typeId === 'water' ? 0xe5e8e5 : Theme.accentAmber) : p.dark, ready ? 1 : 0.7);
  g.fillCircle(r * 0.83, r * 0.84, Math.max(1.5, r * 0.1));
}

function drawWaterSourceIsometric(
  g: Phaser.GameObjects.Graphics, r: number, _p: Palette, ready: boolean, level: number
): void {
  // Source 01 is only the foundational well, so enlarge its simpler
  // silhouette slightly to give it the same board presence as the roofed
  // Source 02 that follows it.
  if (level === 1) r *= 1.12;
  const stoneDark = 0x4d5751;
  const stone = 0x78867c;
  const stoneLight = 0xaeb9ae;
  const postDark = 0x4b332d;
  const post = 0x765044;
  const roofDark = 0x643b31;
  const roof = 0x98533f;
  const roofEdge = 0xb87858;
  const steel = 0x282d2e;
  const steelLight = 0x687071;
  const white = 0xe5e8e5;
  const w = r * (1.62 + level * 0.025);
  const topY = r * 0.14;
  const wallBottom = r * 0.62;
  const postX = w * 0.34;
  const roofBaseY = -r * (0.58 + level * 0.018);
  const roofPeakY = -r * (0.98 + level * 0.018);

  g.fillStyle(0x111313, 0.4);
  g.fillEllipse(0, r * 0.69, w * 1.08, r * 0.3);

  // Round masonry well: thick wall, dark opening, segmented concrete lip.
  g.fillStyle(stoneDark, 1);
  g.fillRoundedRect(-w / 2, topY, w, wallBottom - topY, r * 0.08);
  g.fillStyle(stone, 1);
  g.fillEllipse(0, wallBottom, w, r * 0.44);
  g.fillStyle(stoneLight, 1);
  g.fillEllipse(0, topY, w, r * 0.5);
  g.fillStyle(0x202525, 1);
  g.fillEllipse(0, topY + r * 0.025, w * 0.68, r * 0.31);
  g.lineStyle(Math.max(1, r * 0.035), stoneDark, 0.8);
  g.strokeEllipse(0, topY, w, r * 0.5);
  g.lineBetween(-w * 0.49, r * 0.39, w * 0.49, r * 0.39);
  if (level >= 3) {
    for (const x of [-0.32, 0, 0.32]) g.lineBetween(w * x, r * 0.39, w * x, r * 0.59);
  }

  const crankY = -r * 0.27;
  // Source 01 is masonry only. Source 02 adds the timber supports and crank.
  if (level >= 2) {
    g.lineStyle(r * 0.15, postDark, 1);
    g.lineBetween(-postX, topY, -postX, roofBaseY);
    g.lineBetween(postX, topY, postX, roofBaseY);
    g.lineStyle(r * 0.045, post, 0.9);
    g.lineBetween(-postX + r * 0.025, topY, -postX + r * 0.025, roofBaseY);
    g.lineBetween(postX + r * 0.025, topY, postX + r * 0.025, roofBaseY);
    g.lineStyle(r * 0.12, steelLight, 1);
    g.lineBetween(-postX - r * 0.12, crankY, postX + r * 0.14, crankY);
    g.fillStyle(steel, 1);
    g.fillCircle(-postX, crankY, r * 0.12);
    g.fillCircle(postX, crankY, r * 0.12);
    g.lineStyle(r * 0.03, steelLight, 1);
    g.lineBetween(0, crankY, 0, topY + r * 0.04);
  }

  // Source 03 introduces the complete pitched roof above Source 02's exposed
  // support-and-crank structure.
  if (level >= 3) {
    g.fillStyle(roofDark, 1);
    g.fillPoints([
      new Phaser.Geom.Point(-w * 0.56, roofBaseY),
      new Phaser.Geom.Point(0, roofPeakY),
      new Phaser.Geom.Point(0, roofPeakY + r * 0.16),
      new Phaser.Geom.Point(-w * 0.48, roofBaseY + r * 0.13)
    ], true);
    g.fillStyle(roof, 1);
    g.fillPoints([
      new Phaser.Geom.Point(0, roofPeakY),
      new Phaser.Geom.Point(w * 0.56, roofBaseY),
      new Phaser.Geom.Point(w * 0.48, roofBaseY + r * 0.13),
      new Phaser.Geom.Point(0, roofPeakY + r * 0.16)
    ], true);
    g.lineStyle(Math.max(1, r * 0.035), roofEdge, 0.78);
    g.lineBetween(-w * 0.56, roofBaseY, 0, roofPeakY);
    g.lineBetween(0, roofPeakY, w * 0.56, roofBaseY);
  }

  if (level >= 4) {
    g.lineStyle(r * 0.035, steelLight, 0.8);
    g.lineBetween(-w * 0.38, roofBaseY - r * 0.05, 0, roofPeakY + r * 0.08);
    g.lineBetween(0, roofPeakY + r * 0.08, w * 0.38, roofBaseY - r * 0.05);
  }
  if (level >= 5) {
    g.fillStyle(steel, 1);
    g.fillRoundedRect(-r * 0.18, roofPeakY - r * 0.055, r * 0.36, r * 0.09, r * 0.025);
  }

  g.fillStyle(ready ? white : steelLight, ready ? 1 : 0.65);
  if (level === 1) {
    g.fillCircle(w * 0.34, topY + r * 0.18, Math.max(1.5, r * 0.065));
  } else {
    g.fillCircle(postX, crankY - r * 0.18, Math.max(1.5, r * 0.065));
  }
}
