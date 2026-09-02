import Phaser from 'phaser';
import { CURRENCY_COLOR, currencyKindFor, currencyLabel } from '../ui/CurrencyGlyph';
import { Theme, hex, textResolution } from '../ui/Theme';

/**
 * Juice helpers, kept separate from BoardScene so the merge-resolution
 * logic doesn't get buried in tween/particle boilerplate. All effects
 * scale in intensity with tier so high-tier merges feel like a bigger deal,
 * but stay restrained per the industrial-minimalism art direction: a short
 * acid-green success flash (the one reserved "this succeeded" accent) plus
 * a small, toned-down material-colored particle count - not a colorful
 * confetti burst.
 */

export function burstParticles(scene: Phaser.Scene, x: number, y: number, color: number, tier: number): void {
  const intensity = Math.min(tier / 9, 1);

  // A single thin ring that expands once and fades. Previously this was a
  // bright acid-green ring firing on EVERY merge alongside a particle spray,
  // a screen shake and a big floating number - four effects stacked on the
  // most frequent action in the game, which read as noisy rather than
  // satisfying. It is now drawn in the tile's own material color (green is
  // reserved for the merge-ready state, so using it here too made the accent
  // meaningless), and stays thin/short so repeated merges don't fatigue.
  const flash = scene.add.graphics().setDepth(400);
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 190 + intensity * 90,
    ease: 'Quad.Out',
    onUpdate: (tween) => {
      const t = tween.getValue() ?? 0;
      flash.clear();
      flash.lineStyle(1.5, color, 0.55 * (1 - t));
      flash.strokeCircle(x, y, 8 + t * (14 + intensity * 10));
    },
    onComplete: () => flash.destroy()
  });

  // Particles only from mid-tier up. A tier-2 merge happens constantly and
  // does not need debris; a tier-6+ merge is rare enough to earn it.
  if (tier < 4) return;
  const count = 4 + Math.floor(intensity * 5);
  const speed = 45 + intensity * 60;

  const particles = scene.add.particles(x, y, '__WHITE', {
    lifespan: 240 + intensity * 120,
    speed: { min: speed * 0.4, max: speed },
    scale: { start: 0.16 + intensity * 0.1, end: 0 },
    quantity: count,
    blendMode: Phaser.BlendModes.NORMAL,
    tint: color,
    emitting: false
  });
  particles.explode(count);
  scene.time.delayedCall(500, () => particles.destroy());
}

export function shakeForTier(scene: Phaser.Scene, tier: number): void {
  // Reserved for the top of the chain only. Shaking the screen from tier 3
  // meant most merges rattled the board, which fights the "calm" half of the
  // art direction hard - a camera shake is the single least calm effect
  // available and it was firing many times a minute. Ramp shifted up one
  // tier (was 7-8) to preserve the same 2-tier span relative to the new
  // top (9) after chains gained a 9th masterwork tier.
  if (tier < 8) return;
  const intensity = Math.min((tier - 7) / 2, 1);
  scene.cameras.main.shake(70 + intensity * 50, 0.0012 + intensity * 0.0016);
}

export function floatingScore(scene: Phaser.Scene, x: number, y: number, amount: number, unit = ''): void {
  // Smaller, shorter, quieter: a receipt line, not a celebration.
  // Colour by unit so a floating reward matches the chip it lands in. GM
  // previously fell through to the coin amber, so gem rewards read as coins.
  const kind = currencyKindFor(unit);
  const unitColor =
    unit === 'XP' ? hex(Theme.currencyXp)
    : kind ? hex(CURRENCY_COLOR[kind])
    : hex(Theme.accentAmber);

  // A spendable currency shows its MARK rather than its letter code. `+12 E`
  // needed decoding; the bolt does not, and it is the same bolt already
  // sitting in the energy chip the number is on its way to.
  const receipt: Phaser.GameObjects.GameObject & { y: number } = kind
    ? currencyLabel(scene, `+${amount}`, kind, { fontSize: 14, align: 'center' })
    : scene.add.text(x, y, `+${amount}${unit ? ` ${unit}` : ''}`, {
        fontFamily: Theme.fontNumeric,
        fontSize: '14px',
        color: unitColor,
        resolution: textResolution
      }).setOrigin(0.5);

  if (kind) (receipt as Phaser.GameObjects.Container).setPosition(x, y);
  (receipt as Phaser.GameObjects.Container).setDepth(500).setAlpha(0.9);

  scene.tweens.add({
    targets: receipt,
    y: y - 26,
    alpha: 0,
    duration: 480,
    ease: 'Quad.Out',
    onComplete: () => receipt.destroy()
  });
}

/**
 * Ensures a 1x1 white pixel texture exists for tinted particle emission.
 * Call once during scene preload/create before using burstParticles.
 */
export function ensureParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('__WHITE')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 4, 4);
  g.generateTexture('__WHITE', 4, 4);
  g.destroy();
}
