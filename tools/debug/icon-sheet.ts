import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { drawTierIcon, iconPresentation } from '../../src/game/objects/TierIcons';
import { materialLighting } from '../../src/game/ui/Theme';
import { getChain } from '../../src/game/data/chains';

/**
 * ICON CONTACT SHEET - draws a family's whole ladder to an SVG file.
 *
 * This exists because the only way to look at an icon used to be running the
 * game, and the browser preview's WebGL context dies after a handful of
 * reloads - which during the Verdigris art pass meant several rounds of
 * "change a colour, hope". A recorder that replays the same `drawTierIcon`
 * calls into SVG needs no GPU, no canvas and no game, so the art can be
 * checked in a second and as often as needed.
 *
 * It records the SAME calls the real renderer receives, so what it shows is
 * what the board draws - the one thing a hand-built mock could not promise.
 * Gradients are flattened to their first stop, which is the one real
 * difference to keep in mind when reading a sheet.
 *
 * DEV ONLY - nothing imports it and it never ships.
 *
 *   npx vitest run --config vitest.tools.config.ts
 */

type Pt = { x: number; y: number };

const hex = (c: number): string => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

/**
 * A stand-in for Phaser's Graphics that writes SVG instead of triangles.
 *
 * Only the calls the icon code actually makes are implemented; anything else
 * would be dead weight pretending to be coverage.
 */
class SvgRecorder {
  out: string[] = [];
  private fill = '#000';
  private fillAlpha = 1;
  private stroke = '#000';
  private strokeAlpha = 1;
  private strokeWidth = 1;
  private path: Pt[] = [];

  fillStyle(color: number, alpha = 1): this {
    this.fill = hex(color);
    this.fillAlpha = alpha;
    this.grad = null;
    return this;
  }

  /**
   * Gradient stops are REMEMBERED, not discarded.
   *
   * They still flatten for rectangles - Phaser's four corner colours do not
   * map onto one linear SVG definition, and a wrong gradient would be worse
   * than a flat one. But a TRIANGLE takes one colour per vertex, and that is
   * how the smooth shapes in this game are actually built; flattening those
   * to a single stop showed a flat disc where the renderer draws a gradient,
   * which is a preview that lies about the thing it exists to check.
   */
  private grad: [number, number, number] | null = null;

  fillGradientStyle(tl: number, tr: number, bl: number, _br: number, alpha = 1): this {
    this.fillStyle(tl, alpha);
    this.grad = [tl, tr, bl];
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.strokeWidth = width;
    this.stroke = hex(color);
    this.strokeAlpha = alpha;
    return this;
  }

  beginPath(): this { this.path = []; return this; }
  moveTo(x: number, y: number): this { this.path.push({ x, y }); return this; }
  lineTo(x: number, y: number): this { this.path.push({ x, y }); return this; }
  closePath(): this { return this; }

  arc(cx: number, cy: number, r: number, from: number, to: number): this {
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const a = from + (to - from) * (i / steps);
      this.path.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return this;
  }

  fillPath(): this {
    if (this.path.length > 1) {
      this.out.push(
        `<polygon points="${this.pts()}" fill="${this.fill}" fill-opacity="${this.fillAlpha}"/>`
      );
    }
    return this;
  }

  strokePath(): this {
    if (this.path.length > 1) {
      this.out.push(
        `<polyline points="${this.pts()}" fill="none" stroke="${this.stroke}" ` +
        `stroke-opacity="${this.strokeAlpha}" stroke-width="${this.strokeWidth}"/>`
      );
    }
    return this;
  }

  strokePoints(points: { x: number; y: number }[], closed = false): this {
    const pts = points.map((p) => `${r(p.x)},${r(p.y)}`).join(' ');
    const tag = closed ? 'polygon' : 'polyline';
    this.out.push(
      `<${tag} points="${pts}" fill="none" stroke="${this.stroke}" ` +
      `stroke-opacity="${this.strokeAlpha}" stroke-width="${this.strokeWidth}" ` +
      `stroke-linejoin="round" stroke-linecap="round"/>`
    );
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    this.out.push(
      `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" ` +
      `fill="${this.fill}" fill-opacity="${this.fillAlpha}"/>`
    );
    return this;
  }

  fillCircle(x: number, y: number, radius: number): this {
    this.out.push(
      `<circle cx="${r(x)}" cy="${r(y)}" r="${r(radius)}" ` +
      `fill="${this.fill}" fill-opacity="${this.fillAlpha}"/>`
    );
    return this;
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.out.push(
      `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" ` +
      `stroke="${this.stroke}" stroke-opacity="${this.strokeAlpha}" stroke-width="${this.strokeWidth}"/>`
    );
    return this;
  }

  strokeRect(x: number, y: number, w: number, h: number): this {
    this.out.push(
      `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="none" ` +
      `stroke="${this.stroke}" stroke-opacity="${this.strokeAlpha}" stroke-width="${this.strokeWidth}"/>`
    );
    return this;
  }

  strokeCircle(x: number, y: number, radius: number): this {
    this.out.push(
      `<circle cx="${r(x)}" cy="${r(y)}" r="${r(radius)}" fill="none" ` +
      `stroke="${this.stroke}" stroke-opacity="${this.strokeAlpha}" stroke-width="${this.strokeWidth}"/>`
    );
    return this;
  }

  fillEllipse(x: number, y: number, w: number, h: number): this {
    this.out.push(
      `<ellipse cx="${r(x)}" cy="${r(y)}" rx="${r(w / 2)}" ry="${r(h / 2)}" ` +
      `fill="${this.fill}" fill-opacity="${this.fillAlpha}"/>`
    );
    return this;
  }

  fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): this {
    // SVG has no per-vertex fill, so a gradient triangle takes the MEAN of
    // its three vertex colours. Across a fan of forty-odd segments that reads
    // as the same ramp the GPU interpolates, one step coarser.
    const fill = this.grad ? hex(mean(this.grad)) : this.fill;
    this.out.push(
      `<polygon points="${r(x1)},${r(y1)} ${r(x2)},${r(y2)} ${r(x3)},${r(y3)}" ` +
      `fill="${fill}" fill-opacity="${this.fillAlpha}"/>`
    );
    return this;
  }

  clear(): this { this.out = []; return this; }
  setAlpha(): this { return this; }
  setScale(): this { return this; }
  setPosition(): this { return this; }

  private pts(): string {
    return this.path.map((p) => `${r(p.x)},${r(p.y)}`).join(' ');
  }
}

const r = (n: number): number => Math.round(n * 100) / 100;

/** The average of some packed RGB colours, channel by channel. */
function mean(colors: readonly number[]): number {
  const ch = (shift: number): number =>
    Math.round(colors.reduce((sum, c) => sum + ((c >> shift) & 0xff), 0) / colors.length);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A bare recorder, for drawing one thing rather than a whole ladder. */
export function iconSheetRecorder(): SvgRecorder {
  return new SvgRecorder();
}

/** Renders every tier of `typeId` onto one sheet. */
export function iconSheet(typeId: string, cell = 120): string {
  const chain = getChain(typeId);
  const cols = chain.tiers.length;
  const w = cols * cell;
  const h = cell + 26;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    // The board's own ground, so the art is judged against what it sits on.
    `<rect width="${w}" height="${h}" fill="#1a1a18"/>`
  ];

  chain.tiers.forEach((def, i) => {
    const g = new SvgRecorder();
    const size = cell * 0.78;
    const render = drawTierIcon(
      g as never, typeId, def.tier, size, materialLighting(def.color, def.tier)
    );
    const present = iconPresentation(typeId, def.tier, size);
    const cx = i * cell + cell / 2 + present.offsetX;
    const cy = cell / 2 + present.offsetY;
    parts.push(
      `<g transform="translate(${r(cx)} ${r(cy)}) scale(${r(present.scale)})" ` +
      `opacity="${render.materialAlpha}">${g.out.join('')}</g>`,
      `<text x="${i * cell + cell / 2}" y="${h - 8}" fill="#8a8a86" font-size="11" ` +
      `font-family="monospace" text-anchor="middle">${def.tier} ${def.label}</text>`
    );
  });

  parts.push('</svg>');
  return parts.join('\n');
}

export function writeIconSheet(typeId: string, path = `tools/debug/out/icon-sheet-${typeId}.svg`): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, iconSheet(typeId), 'utf8');
  return path;
}
