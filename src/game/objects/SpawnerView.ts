import Phaser from 'phaser';
import { boxForDrawnArt } from './ArtFill';
import type { GridPosition, TileState } from '../types';
import type { SpawnerCellData } from '../Grid';
import { getTierDef } from '../data/chains';
import { cooldownForTier, isReady, msRemaining, syncDispenser } from '../dispensers/Dispensers';
import { Theme, materialLighting } from '../ui/Theme';
import { drawSourceBuilding, sourcePalette } from './TierIcons';

/** A production source that occupies, moves, and merges on the main board. */
export class SpawnerView extends Phaser.GameObjects.Container {
  spawner: SpawnerCellData;
  gridPos: GridPosition;
  state: TileState = 'idle';
  cellSize: number;

  private core: Phaser.GameObjects.Graphics;
  private sprite: Phaser.GameObjects.Image | null;
  private timerPie: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private ringTween?: Phaser.Tweens.Tween;
  /**
   * The Decagon's ten pips, on their OWN Graphics so they can be spun.
   * They used to be drawn into `core` alongside the building and the frame,
   * which cannot rotate without taking the machine with it.
   */
  private meterRing!: Phaser.GameObjects.Graphics;
  private spinTween?: Phaser.Tweens.Tween;
  private payingOut = false;
  private exiting = false;
  private lastReady: boolean | null = null;
  /**
   * How many Decagon items are standing on the board, 0-10. Drawn as ten pips
   * around the machine rather than as a HUD bar: the meter belongs to the
   * thing that fills it, and the count is only meaningful while looking at
   * the board it is counting.
   */
  private decagonHeld = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, cellSize: number, data: SpawnerCellData, gridPos: GridPosition) {
    super(scene, x, y);
    this.spawner = data;
    this.gridPos = gridPos;
    this.cellSize = cellSize;

    const textureKey = this.sourceTextureKey();
    // Per-asset framing nudges. The wood tier-2 entry that used to live here
    // was tuned for a raster that was never actually shown - wood was force
    // -excluded from the raster path - so it is gone rather than being applied
    // for the first time to different art.
    const rasterScale = this.spawner.typeId === 'glass' && this.spawner.tier === 1 ? 0.92 : 1;
    // Sized by drawn art rather than by box. The source SVGs carry between
    // 69% and 91% of their square, so an equal display size drew stone 03 far
    // smaller than glass 02 for no reason a player could see. `rasterScale`
    // stays on top of it as the per-asset framing nudge it always was.
    const imageSize = boxForDrawnArt(textureKey, cellSize * 0.86) * rasterScale;
    // Every family now uses its raster when one exists. Wood was excluded
    // while it had no art of its own; tier 5 still has none, so it falls
    // through to the vector building - which is what the fallback is for.
    const useRasterTexture = scene.textures.exists(textureKey);
    this.sprite = useRasterTexture
      ? scene.add.image(0, 0, textureKey).setDisplaySize(imageSize, imageSize)
      : null;
    if (this.sprite) {
      this.sprite.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    this.core = scene.add.graphics();
    this.timerPie = scene.add.graphics();
    this.ring = scene.add.graphics().setVisible(false);
    this.meterRing = scene.add.graphics();

    if (this.sprite) this.add(this.sprite);
    this.add([this.core, this.meterRing, this.timerPie, this.ring]);
    this.setSize(cellSize, cellSize);
    this.refresh();
    scene.add.existing(this);
  }

  /** Sets the Decagon meter reading. No-op for every other source. */
  setDecagonHeld(held: number): void {
    if (this.exiting) return;
    if (this.spawner.typeId !== 'decagon' || held === this.decagonHeld) return;
    this.decagonHeld = held;
    this.refresh();
  }

  /**
   * Ten pips in a ring around the machine, one per Decagon needed. Filled
   * pips are the ones standing on the board right now - and because the
   * count is read from the board rather than banked, a pip going dark when
   * you sell one is the honest picture of what just happened.
   */
  private drawDecagonMeter(size: number, palette: ReturnType<typeof materialLighting>): void {
    const R = size * 0.54;
    const pipR = Math.max(1.6, size * 0.035);
    const start = -Math.PI / 2;
    const g = this.meterRing;
    g.clear();
    if (this.exiting) return;
    // Paying out: every pip lit, and a faint ring drawn under them at the
    // same radius. Spun fast the pips smear into that ring instead of
    // reading as ten separate dots chasing each other.
    if (this.payingOut) {
      g.lineStyle(pipR * 1.6, palette.highlight, 0.35);
      g.strokeCircle(0, 0, R);
    }
    for (let i = 0; i < 10; i++) {
      const a = start + (i / 10) * Math.PI * 2;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      const filled = this.payingOut || i < this.decagonHeld;
      g.fillStyle(Theme.bg, 0.85);
      g.fillCircle(x, y, pipR + 1.2);
      g.fillStyle(filled ? palette.highlight : Theme.borderOnDark, filled ? 1 : 0.55);
      g.fillCircle(x, y, this.payingOut ? pipR * 1.35 : pipR);
      if (filled) {
        g.lineStyle(1, palette.light, 0.8);
        g.strokeCircle(x, y, pipR + 1.2);
      }
    }
  }

  /**
   * The payout spin. The machine has just eaten ten items and is about to
   * hand back a haul one piece at a time, and that wants a beat of its own -
   * so the meter ring accelerates into a blur and the machine shakes with it.
   *
   * Rotation lives on `meterRing`, never on the container: spinning the whole
   * source would spin the building too.
   */
  playPayoutSpin(): void {
    if (this.spawner.typeId !== 'decagon') return;
    this.payingOut = true;
    this.refresh();
    this.spinTween?.stop();
    this.meterRing.setRotation(0);
    // One full turn every 140ms. Fast enough that the ten pips smear into
    // the ring drawn under them rather than reading as ten dots chasing
    // each other around the machine.
    this.spinTween = this.scene.tweens.add({
      targets: this.meterRing,
      rotation: Math.PI * 2,
      duration: 140,
      repeat: -1,
      ease: 'Linear'
    });
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.07,
      scaleY: 1.07,
      duration: 130,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  /**
   * THE MACHINE SPENDING ITSELF.
   *
   * A Decagon exists to fill its meter once, and until now it simply blinked
   * out of existence the frame the last reward left - which threw away the
   * one moment the whole feature builds to.
   *
   * So it goes the way it was always meant to: the ten pips it has been
   * holding break formation and fly outward, and the solid pulls in on
   * itself. The pips are re-created as loose objects at their CURRENT spun
   * positions and parented to the scene rather than to this container, so
   * they scatter on their own while the machine collapses behind them -
   * children would have been dragged inward by the collapse instead.
   */
  playExit(onDone: () => void): void {
    this.exiting = true;
    this.spinTween?.stop();
    this.spinTween = undefined;
    this.scene.tweens.killTweensOf(this);
    this.disableInteractive();

    const size = this.cellSize * 0.88 - 2;
    const R = size * 0.54;
    const pipR = Math.max(1.6, size * 0.035);
    const palette = sourcePalette(this.spawner.typeId);
    const spun = this.meterRing.rotation;
    this.meterRing.clear();

    // They leave the SCREEN, not the cell. The first version sent them about
    // one cell out over 430ms while fading the whole way, which finished
    // before it registered as anything - the throw has to be long enough to
    // read as ten things escaping.
    const far = Math.max(this.scene.scale.width, this.scene.scale.height);
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2 + spun;
      const pip = this.scene.add.graphics().setDepth(3000);
      pip.fillStyle(palette.highlight, 1);
      pip.fillCircle(0, 0, pipR * 1.8);
      pip.setPosition(this.x + Math.cos(a) * R, this.y + Math.sin(a) * R);
      this.scene.tweens.add({
        targets: pip,
        x: this.x + Math.cos(a) * far,
        y: this.y + Math.sin(a) * far,
        duration: 1150,
        ease: 'Cubic.Out',
        onComplete: () => pip.destroy()
      });
      // Held at full opacity for most of the flight and dropped at the end -
      // a linear fade makes them ghosts a third of the way out.
      this.scene.tweens.add({
        targets: pip,
        alpha: 0,
        duration: 1150,
        ease: 'Quint.In'
      });
    }

    this.scene.tweens.add({
      targets: this,
      scaleX: 0,
      scaleY: 0,
      angle: 220,
      // Held a beat so the pips are clear of it before it starts to go, then
      // slow enough to actually watch the collapse.
      delay: 180,
      duration: 700,
      ease: 'Back.In',
      onComplete: onDone
    });
  }

  /** Ends the payout spin and puts the meter back to an ordinary reading. */
  stopPayoutSpin(): void {
    this.payingOut = false;
    this.spinTween?.stop();
    this.spinTween = undefined;
    this.scene.tweens.killTweensOf(this);
    this.meterRing.setRotation(0);
    this.setScale(1);
    this.refresh();
  }

  refresh(now: number = Date.now()): void {
    syncDispenser(this.spawner, now);
    const size = this.cellSize * 0.88 - 2;
    const palette = sourcePalette(this.spawner.typeId);
    const ready = isReady(this.spawner, now);
    this.lastReady = ready;

    // The family-specific building is the complete board object: no
    // cell-sized card, chassis, fasteners, tier label, or reservoir count.
    // Its mill/stone-works/glass-house silhouette and the family's actual
    // material ramp communicate what it produces; details live in the tray.
    this.core.clear().setAlpha(1);
    const textureKey = this.sourceTextureKey();
    const hasRaster = this.sprite !== null && this.scene.textures.exists(textureKey);
    if (hasRaster) {
      this.sprite!.setTexture(textureKey).setVisible(true).setAlpha(ready ? 1 : 0.72);
    } else {
      this.sprite?.setVisible(false);
    }
    const buildingR = size * (this.spawner.typeId === 'water' ? 0.33 : 0.24);
    if (!hasRaster) {
      this.core.setAlpha(ready ? 1 : 0.72);
      drawSourceBuilding(this.core, this.spawner.typeId, this.spawner.tier, buildingR, palette, ready);
      this.core.setAlpha(1);
    }
    if (this.spawner.typeId === 'decagon') this.drawDecagonMeter(size, palette);
    else this.meterRing.clear();

    const frameHalf = (this.cellSize - 3) / 2;
    const readyColor = this.spawner.typeId === 'water' ? Theme.currencyEnergy : Theme.accentAmber;
    this.core.lineStyle(1, ready ? readyColor : Theme.borderOnDark, ready ? 1 : 0.75);
    this.core.strokeRoundedRect(
      -frameHalf, -frameHalf,
      frameHalf * 2, frameHalf * 2,
      buildingR * 0.2
    );

    this.refreshTimerPie(now);
  }

  /** Redraw only the countdown wedge, allowing smooth per-frame animation. */
  refreshTimerPie(now: number = Date.now()): void {
    // The Decagon has no corner pie. It sits on the cell outline at the
    // top-right, and on a machine that is meant to be nothing but the solid
    // and its ten pips it read as a stray orange dot stuck to the frame.
    if (this.spawner.typeId === 'decagon') {
      this.timerPie.clear();
      return;
    }
    // One cycle only: the pie drains toward the next generated item, then
    // resets for the following tick. A full reservoir has no active timer.
      const size = this.cellSize * 0.96 - 6;
    const buildingR = size * 0.24;
    const remainingMs = msRemaining(this.spawner, now);
    const ready = this.spawner.charges > 0;
    // The smooth timer syncs the reservoir every frame. Redraw the complete
    // source on the exact frame its first charge returns so the ready outline
    // does not wait for the slower one-second housekeeping refresh.
    if (this.lastReady !== null && ready !== this.lastReady) {
      this.refresh(now);
      return;
    }
    const cooldownMs = cooldownForTier(this.spawner.typeId, this.spawner.tier);
    const timerX = size * 0.48;
    const timerY = -size * 0.48;
    const timerRadius = Math.max(4.5, buildingR * 0.3);
    this.timerPie.clear();
    if (remainingMs > 0) {
      const remaining = Phaser.Math.Clamp(remainingMs / cooldownMs, 0, 1);
      this.timerPie.fillStyle(Theme.bg, 0.9);
      this.timerPie.fillCircle(timerX, timerY, timerRadius + 1.5);
      this.timerPie.fillStyle(Theme.borderOnDark, 0.45);
      this.timerPie.fillCircle(timerX, timerY, timerRadius);
      this.timerPie.fillStyle(this.spawner.typeId === 'water' ? Theme.currencyEnergy : Theme.textOnDarkMuted, 0.95);
      if (remaining >= 0.999) {
        this.timerPie.fillCircle(timerX, timerY, timerRadius);
      } else {
        this.timerPie.slice(
          timerX, timerY, timerRadius,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * remaining,
          false
        );
        this.timerPie.fillPath();
      }
    }
  }

  private sourceTextureKey(): string {
    return `source-${this.spawner.typeId}-${this.spawner.tier}`;
  }

  setMergeReady(active: boolean): void {
    const size = this.cellSize * 0.88;
    const half = size / 2;
    this.ringTween?.stop();
    this.ring.clear();
    if (!active) {
      this.ring.setVisible(false).setAlpha(1);
      return;
    }
    this.ring.lineStyle(Theme.borderWidthStrong, Theme.accentGreen, 1);
    this.ring.strokeRoundedRect(-half - 3, -half - 3, size + 6, size + 6, Theme.radiusTile);
    this.ring.setVisible(true);
    this.ringTween = this.scene.tweens.add({
      targets: this.ring,
      alpha: { from: 1, to: 0.35 },
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  setGridPos(pos: GridPosition): void {
    this.gridPos = pos;
  }

  playSpawnPulse(): void {
    this.scene.tweens.add({
      targets: this,
      scale: { from: 0.94, to: 1 },
      duration: 150,
      ease: 'Back.Out'
    });
  }

  playMergeOutAndDestroy(): Promise<void> {
    this.state = 'merging';
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scale: 0,
        alpha: 0,
        angle: 8,
        duration: 150,
        ease: 'Quad.In',
        onComplete: () => {
          this.destroy();
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
