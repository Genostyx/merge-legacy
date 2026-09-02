import Phaser from 'phaser';
import type { GridPosition, TileState } from '../types';
import { getTierDef } from '../data/chains';
import { drawTierIcon, iconPresentation } from './TierIcons';
import type { IconFootprint } from './TierIcons';
import { Theme, materialLighting } from '../ui/Theme';
import type { MaterialLighting } from '../ui/Theme';

/**
 * A locked tile is drawn as a SILHOUETTE, not as a dimmed version of itself.
 *
 * The previous treatment desaturated toward grey and darkened, which read as
 * "faded" rather than "locked" - the object still had its gradient faces, its
 * specular highlight and its lit and shadowed edges, so it looked like the
 * same item behind glass. A silhouette removes the internal form instead: the
 * shape survives, the material does not.
 *
 * Three constants do the work, and they are the ones to reach for if this
 * needs retuning.
 */

/**
 * Flat fill for a locked shape. Deliberately LIGHTER than the board frame
 * (`Theme.bgElevated`, 0x272421) - a dark silhouette on a near-black board
 * disappears, so this reads as a filled cutout rather than a hole.
 */
const LOCKED_SILHOUETTE = 0x4a443d;

/**
 * How much of the family's own colour survives. Almost none, on purpose: not
 * being able to tell WHAT it is made of is most of what makes a locked item
 * feel locked. The shape still says which item it is.
 */
const LOCKED_HUE_RETENTION = 0.12;

/**
 * Spread between the five lighting tones. The lit ramp spans roughly 0.57
 * from shadow to highlight; this is a fraction of that, which is what
 * collapses the gradient faces into one flat mass. Not zero - a hair of
 * separation keeps the top edge from merging into the body and losing the
 * silhouette's outline entirely.
 */
const LOCKED_TONE_SPREAD = 0.09;

function mutedLockedLighting(baseColor: number): MaterialLighting {
  const sr = (LOCKED_SILHOUETTE >> 16) & 0xff;
  const sg = (LOCKED_SILHOUETTE >> 8) & 0xff;
  const sb = LOCKED_SILHOUETTE & 0xff;
  const r = (baseColor >> 16) & 0xff;
  const g = (baseColor >> 8) & 0xff;
  const b = baseColor & 0xff;

  const shade = (value: number) => {
    const channel = (silhouette: number, original: number) => {
      const tinted = silhouette + (original - silhouette) * LOCKED_HUE_RETENTION;
      return Math.max(0, Math.min(255, Math.round(tinted * value)));
    };
    return (channel(sr, r) << 16) | (channel(sg, g) << 8) | channel(sb, b);
  };

  // Centred on 1.0 so the flat tone IS the silhouette colour, with the ramp
  // opening only slightly either side of it.
  const half = LOCKED_TONE_SPREAD / 2;
  return {
    highlight: shade(1 + half),
    light: shade(1 + half * 0.45),
    base: shade(1),
    dark: shade(1 - half * 0.55),
    shadow: shade(1 - half)
  };
}

/**
 * Visual representation of one tile. Drawn with Graphics (a per-tier
 * vector shape, no card behind it) so the game has real distinguishable
 * art before any bitmap assets exist. To swap in bitmap/illustrated art
 * later: replace the `drawTierIcon(...)` call in `draw()` with
 * `scene.add.sprite(0, 0, textureKey)` — the idle bob and animation
 * methods are icon-agnostic and won't need to change.
 *
 * Visual model: there is deliberately no square/rounded-rect card behind
 * the shape. Every reference merge game renders the object's own
 * silhouette directly on the board - a vase, a rock, a plank - not an
 * icon centered on a colored tile. The shape IS the tile; a soft
 * footprint shadow is all that sits behind it. Illumination (the
 * merge-ready ring) is reserved strictly for that interaction state, not
 * a permanent per-tier glow - see ui/Theme.ts.
 */
export class TileView extends Phaser.GameObjects.Container {
  typeId: string;
  tier: number;
  gridPos: GridPosition;
  state: TileState = 'idle';
  cellSize: number;
  locked: boolean;

  private mergeReadyRing: Phaser.GameObjects.Graphics;
  private selectedRing: Phaser.GameObjects.Graphics;
  private bg: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Graphics;
  private currencyIcons: Phaser.GameObjects.Image[] = [];
  private bobTween?: Phaser.Tweens.Tween;
  private ringTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, cellSize: number, typeId: string, tier: number, gridPos: GridPosition, locked = false) {
    super(scene, x, y);
    this.typeId = typeId;
    this.tier = tier;
    this.gridPos = gridPos;
    this.cellSize = cellSize;
    this.locked = locked;

    this.mergeReadyRing = scene.add.graphics().setVisible(false);
    this.selectedRing = scene.add.graphics().setVisible(false);
    this.bg = scene.add.graphics();
    this.icon = scene.add.graphics();

    this.add([this.bg, this.icon, this.selectedRing, this.mergeReadyRing]);
    this.setSize(cellSize, cellSize);
    this.draw();
    this.startIdleBob();

    scene.add.existing(this);
  }

  private draw(): void {
    const def = getTierDef(this.typeId, this.tier);
    const size = this.cellSize * 0.96;
    const baseColor = def?.color ?? 0x555555;
    const lighting = this.locked
      ? mutedLockedLighting(baseColor)
      : materialLighting(baseColor, this.tier);

    // The shape itself carries all the lighting (gradient faces, specular
    // highlight, lit/shadow edges) - see the per-tier draw functions in
    // TierIcons.ts. No card, no border, no background fill behind it.
    this.icon.clear();
    for (const image of this.currencyIcons) image.destroy();
    this.currencyIcons = [];
    if (this.typeId.startsWith('currency-') && !(this.typeId === 'currency-credit' && this.tier >= 3)) {
      this.icon.setVisible(false);
      this.bg.clear();
      const textureKey = this.typeId === 'currency-credit'
        ? 'currency-coin'
        : this.typeId === 'currency-gem'
          ? 'currency-gem'
          : 'currency-energy';
      // Credit tiers 1 and 2 keep these established SVG arrangements.
      // Credit tiers 3+ use their distinct named vector silhouettes through
      // drawTierIcon below; Gem and Energy retain the shared-count layout.
      // Credits keep the stacked, structured arrangement - coins are minted
      // things and stack squarely. Drops and gems do not: they get loose
      // clusters, because aligned columns made them read as a bar chart.
      const creditLayouts: [number, number][][] = [
        [[0, 4]],
        [[-10, 7], [0, 4]],
        [[0, 0.17], [0, 0.05], [0, -0.07]],
        [[-0.15, 0.15], [-0.15, 0.03], [0.15, 0.11], [0.15, -0.01]],
        [[-0.21, 0.15], [0, 0.15], [0.21, 0.15], [-0.11, 0.01], [0.11, 0.01]],
        [[-0.21, 0.18], [0, 0.18], [0.21, 0.18], [-0.11, 0.04], [0.11, 0.04], [0, -0.1]]
      ];
      const clusterLayouts: [number, number][][] = [
        [[0, 4]],
        [[-10, 7], [0, 4]],
        [[-0.16, 0.14], [0.17, 0.07], [0, -0.07]],
        [[-0.19, 0.14], [0.16, 0.15], [-0.04, 0], [0.19, -0.08]],
        [[-0.2, 0.16], [0.05, 0.19], [-0.15, -0.02], [0.2, 0.05], [0.02, -0.13]],
        [[-0.21, 0.17], [0.03, 0.2], [0.21, 0.1], [-0.16, 0.01], [0.11, -0.06], [-0.03, -0.17]]
      ];
      const layouts = this.typeId === 'currency-credit' ? creditLayouts : clusterLayouts;
      const tier = Math.max(1, Math.min(layouts.length, this.tier));
      const layout = layouts[tier - 1];
      // Coins shrink as the count climbs so six occupy the footprint of one -
      // they stack squarely, so a tidy footprint is the point. Gems and
      // droplets do NOT shrink: they hold tier 2's size at every tier and are
      // allowed to overlap, because a higher tier reading as physically
      // smaller undercuts the merge.
      const iconSize = this.typeId === 'currency-credit'
        ? this.cellSize * (tier <= 2 ? 0.52 : tier <= 4 ? 0.36 : 0.32)
        : this.cellSize * 0.52;
      layout.forEach(([x, y]) => {
        // Tiers 1-2 are authored in pixels; the rest scale with the cell.
        const px = tier <= 2 ? x : x * this.cellSize;
        const py = tier <= 2 ? y : y * this.cellSize;
        const image = this.scene.add.image(px, py, textureKey).setDisplaySize(iconSize, iconSize);
        this.currencyIcons.push(image);
        this.addAt(image, 2);
      });
      return;
    }
    this.icon.setVisible(true);
    const render = drawTierIcon(this.icon, this.typeId, this.tier, size, lighting);
    // A silhouette does not need to fade to read as locked - it reads as
    // locked because it has no interior. The old 0.82 was compensating for a
    // treatment that still looked like the finished item.
    this.icon.setAlpha(this.locked ? render.materialAlpha * 0.94 : render.materialAlpha);

    this.drawContactShadow(render.footprint);

    // Size and ground-line normalisation, applied to the drawn output rather
    // than baked into the shapes - see TierIcons.iconPresentation for why.
    // The shadow takes the identical transform so it keeps tracking the
    // shape it belongs to.
    const { scale, offsetX, offsetY } = iconPresentation(this.typeId, this.tier, size);
    this.icon.setScale(scale).setPosition(offsetX, offsetY);
    this.bg.setScale(scale).setPosition(offsetX, offsetY);
  }

  /**
   * Soft footprint shadow - a few stacked low-alpha ellipses (Graphics has
   * no blur) offset down-right, matching the fixed upper-left light.
   * Irregular and soft on purpose: a hard-edged square shadow was the single
   * biggest tell that a card was hiding behind the shape.
   *
   * TileView is the SINGLE owner of this. Icons used to be split - 8 tiers
   * drew their own ground ellipse on top of this one at nearly the same y,
   * and 7 drew nothing - so some items had a doubled smudge under them and
   * others floated. Now every icon reports where it actually sits and this
   * is the only shadow drawn.
   *
   * Everything scales off the measured footprint rather than off `size`.
   * That is the whole point of measuring: as drawn, icon widths spanned
   * 2.39x across the 27 tiers, so a shadow sized from the nominal cell box
   * was far too wide under the small tiers - which is exactly what made
   * them read as floating rather than as small.
   */
  private drawContactShadow({ width, centerX, baselineY }: IconFootprint): void {
    this.bg.clear();
    if (width <= 0) return;
    // Ratios chosen to reproduce the old shadow's weight on a
    // typical-width icon, so this change re-sizes the outliers without
    // restyling the whole board. The old constants were fractions of `size`
    // (offset 0.05, drop 0.03, height 0.14 at a width of 0.40); dividing
    // each by that 0.40 is what converts them to fractions of the footprint.
    for (let i = 3; i >= 1; i--) {
      this.bg.fillStyle(0x000000, 0.1 * i);
      this.bg.fillEllipse(
        centerX + width * 0.085 * i,
        // Lifted by about half the ellipse height so the stack tucks UNDER
        // the baseline instead of hanging off the bottom of the shape.
        baselineY - width * 0.07 + width * 0.05 * i,
        width * (1 - i * 0.05),
        width * 0.25
      );
    }
  }

  private startIdleBob(): void {
    this.bobTween?.stop();
    if (this.locked) {
      this.setAngle(0);
      return;
    }
    // Small, calm settle motion - not a playful wobble.
    this.bobTween = this.scene.tweens.add({
      targets: this,
      angle: { from: -0.45, to: 0.45 },
      duration: 1800 + Math.random() * 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
      delay: Math.random() * 500
    });
  }

  /** Thin acid-green outline pulse, shown only while a drag is hovering this tile as a valid merge target. */
  setMergeReady(active: boolean): void {
    if (active) {
      const size = this.cellSize * 0.96 - 8;
      const half = size / 2;
      const radius = Math.min(size * 0.09, 10);
      this.mergeReadyRing.clear();
      this.mergeReadyRing.lineStyle(Theme.borderWidthStrong, Theme.accentGreen, 1);
      this.mergeReadyRing.strokeRoundedRect(-half - 3, -half - 3, size + 6, size + 6, radius + 3);
      this.mergeReadyRing.setVisible(true);
      this.ringTween?.stop();
      this.ringTween = this.scene.tweens.add({
        targets: this.mergeReadyRing,
        alpha: { from: 1, to: 0.35 },
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut'
      });
    } else {
      this.ringTween?.stop();
      this.mergeReadyRing.setVisible(false).setAlpha(1);
    }
  }

  /** Selection still drives the action tray, without adding an outer frame. */
  setSelected(_active: boolean): void {
    this.selectedRing.clear();
    this.selectedRing.setVisible(false);
  }

  setTier(tier: number): void {
    this.tier = tier;
    this.draw();
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.draw();
  }

  setGridPos(pos: GridPosition): void {
    this.gridPos = pos;
  }

  /**
   * Settles in from slightly small. Was `scale 0.2 -> 1` on `Back.Out`,
   * which overshoots past full size and springs back - a cartoon bounce that
   * fired on every merge result and every produced tile. A short ease-out
   * from 0.72 reads as the piece being set down rather than popping.
   */
  playMergeIn(): Promise<void> {
    this.state = 'spawning';
    this.setScale(0.72);
    this.setAlpha(0);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scale: 1,
        alpha: 1,
        duration: 150,
        ease: 'Quad.Out',
        onComplete: () => {
          this.state = 'idle';
          resolve();
        }
      });
    });
  }

  /**
   * Single quick contract-and-fade. The old version punched UP to 1.15 first
   * and then collapsed to 0 - two opposing motions per consumed tile, times
   * two tiles per merge, which is most of what made merging feel frantic.
   */
  playMergeOutAndDestroy(): Promise<void> {
    this.state = 'merging';
    this.bobTween?.stop();
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scale: 0.82,
        alpha: 0,
        duration: 110,
        ease: 'Quad.In',
        onComplete: () => {
          this.destroy();
          resolve();
        }
      });
    });
  }

  /**
   * Flies this tile to a target (the order card that consumed it), then
   * destroys it. Order delivery used to `destroy()` the tiles outright, so
   * items simply blinked out of existence and the player could miss what
   * had been taken.
   *
   * A lift-then-fly rather than the simpler rise-and-vanish: vanishing in
   * place tells you something left, but flying to the card also tells you
   * WHERE it went, which is what actually connects the board to the order
   * you just filled. The brief lift first is what sells it as being picked
   * up rather than sliding across the board.
   *
   * The idle bob is deliberately NOT stopped - the leftover sway reads as
   * the item being carried, and it ends with the tile anyway.
   */
  playDeliverTo(x: number, y: number, delay = 0): Promise<void> {
    this.state = 'merging';
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        y: this.y - this.cellSize * 0.3,
        scale: 1.06,
        duration: 150,
        delay,
        ease: 'Sine.Out',
        onComplete: () => {
          this.scene.tweens.add({
            targets: this,
            x,
            y,
            scale: 0.2,
            alpha: 0,
            duration: 320,
            ease: 'Cubic.In',
            onComplete: () => {
              this.bobTween?.stop();
              this.destroy();
              resolve();
            }
          });
        }
      });
    });
  }

  /**
   * Flags that this tile can be merged with a locked one somewhere on the
   * board. Fired on BOTH tiles, because the point is to connect them - a
   * hint on the new item alone still leaves the player hunting for what it
   * matches.
   *
   * Reuses the merge-ready ring rather than inventing a new cue: that ring
   * already means "these two can merge" everywhere else in the game, so the
   * player has to learn nothing. The scale pulses are what actually catch
   * the eye, since a locked tile is dimmed and easy to overlook.
   */
  playUnlockHint(): void {
    if (this.state === 'merging') return;
    this.setMergeReady(true);
    this.scene.tweens.add({
      targets: this,
      scale: { from: 1, to: 1.14 },
      duration: 190,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: 2,
      onComplete: () => this.setScale(1)
    });
    this.scene.time.delayedCall(1250, () => {
      if (this.active) this.setMergeReady(false);
    });
  }

  /**
   * Arrives from somewhere else on the board rather than fading in place -
   * used when a crate gives something up, so the item visibly comes OUT of
   * the crate instead of appearing next to it.
   *
   * `Back.Out` overshoots very slightly on landing, which is the difference
   * between a piece being placed and a piece being tossed out.
   */
  playSpawnFrom(fromX: number, fromY: number): Promise<void> {
    const homeX = this.x;
    const homeY = this.y;
    this.state = 'spawning';
    this.setPosition(fromX, fromY).setScale(0.35).setAlpha(0.6);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        x: homeX,
        y: homeY,
        scale: 1,
        alpha: 1,
        duration: 300,
        ease: 'Back.Out',
        onComplete: () => {
          this.state = 'idle';
          resolve();
        }
      });
    });
  }

  snapTo(x: number, y: number, animate = true): Promise<void> {
    if (!animate) {
      this.setPosition(x, y);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        x,
        y,
        duration: 140,
        ease: 'Quad.Out',
        onComplete: () => resolve()
      });
    });
  }
}
