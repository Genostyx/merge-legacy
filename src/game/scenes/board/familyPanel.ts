import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { FAMILY_NAMES, SPAWNER_PIECE_NAMES } from './config';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyIcon } from '../../ui/CurrencyGlyph';
import { drawTierIcon, iconPresentation } from '../../objects/TierIcons';
import { drawSpawnerPieceIcon } from '../../objects/SpawnerPieceView';
import { getChain } from '../../data/chains';
import { addGems } from '../../economy/Economy';
import { claimDiscovery, claimedInFamily, isClaimed, isDiscovered } from '../../collection/Collection';
import { loadedItemSprite, loadedPieceSprite } from '../../objects/itemSprites';

/**
 * ONE FAMILY'S LADDER, opened from the `i` in the action tray.
 *
 * The full Collection is a scrolling list of every family, which is the wrong
 * shape for the question a player actually has with an item in their hand:
 * "what does this one turn into?" This answers exactly that and nothing else.
 *
 * It mirrors the Collection rather than reinventing it - same plate, same
 * question mark for an undiscovered tier, same one-Gem claim on a discovered
 * one, resolved in place. Two views of one dataset that behaved differently
 * would be worse than either.
 */
/**
 * WHAT LADDER THE PANEL IS SHOWING.
 *
 * The `i` used to answer only one question - "what does this item turn
 * into?" - because only item chains had a ladder to show. A player
 * holding a source piece has exactly the same question and was getting
 * the ITEM chain for that family, which is a different set of things.
 *
 * `collectable` is the difference that matters: item chains are the
 * Collection, so a discovered tier there is worth a gem and counts
 * towards the book. A ladder of source pieces is reference, not
 * collection - no gems, no book, nothing to claim.
 */
export type LadderKind = 'items' | 'pieces';

interface LadderEntry {
  tier: number;
  label: string;
  color: number;
  sprite: string | null;
}

interface Ladder {
  title: string;
  entries: LadderEntry[];
  collectable: boolean;
}

function ladderFor(scene: BoardScene, kind: LadderKind, typeId: string): Ladder | null {
  const chain = getChain(typeId);
  if (!chain) return null;
  if (kind === 'pieces') {
    const names = SPAWNER_PIECE_NAMES[typeId];
    if (!names) return null;
    return {
      title: `${FAMILY_NAMES[typeId] ?? typeId.toUpperCase()} SOURCE PIECES`,
      collectable: false,
      entries: names.map((label, index) => ({
        tier: index + 1,
        label,
        // The piece takes the colour of the item tier above it, which is
        // what `drawSpawnerPieceIcon` has always used.
        color: chain.tiers[Math.min(index + 1, chain.tiers.length - 1)].color,
        sprite: loadedPieceSprite(scene, typeId, index + 1)
      }))
    };
  }
  return {
    title: FAMILY_NAMES[typeId] ?? typeId.toUpperCase(),
    collectable: true,
    entries: chain.tiers.map((def) => ({
      tier: def.tier,
      label: def.label,
      color: def.color,
      sprite: loadedItemSprite(scene, typeId, def.tier)
    }))
  };
}

export function openFamilyPanel(
  scene: BoardScene, typeId: string, kind: LadderKind = 'items'
): void {
  if (scene.modalOpen || scene.inputLocked) return;
  const chain = getChain(typeId);
  if (!chain) return;
  const ladder = ladderFor(scene, kind, typeId);
  if (!ladder) return;
  scene.modalOpen = true;

  const overlay = scene.add.container(0, 0).setDepth(3020);
  scene.familyOverlay = overlay;

  const close = (): void => {
    scene.familyOverlay = null;
    scene.modalOpen = false;
    overlay.destroy(true);
  };

  // Tap anywhere outside closes, as well as the X.
  const shade = scene.add.rectangle(
    scene.viewW / 2, scene.viewH / 2,
    scene.viewW, scene.viewH,
    0x000000, 0.68
  ).setInteractive();
  shade.on('pointerup', close);
  overlay.add(shade);

  const COLS = 3;
  const rows = Math.ceil(ladder.entries.length / COLS);
  const slot = 62;
  const gap = 8;
  const gridW = COLS * slot + (COLS - 1) * gap;
  const panelW = Math.min(scene.viewW - 32, gridW + 44);
  const headerH = 62;
  // 22 was the bottom margin alone. The caption under the grid needs a line
  // of its own: tapping a tier names it, which is the only place in the game
  // a player can learn what an item is called.
  const captionH = 26;
  const panelH = headerH + rows * slot + (rows - 1) * gap + 22 + captionH;
  const left = scene.viewW / 2 - panelW / 2;
  const top = scene.viewH / 2 - panelH / 2;

  const bg = scene.add.graphics();
  bg.fillStyle(Theme.bgElevated, 1);
  bg.fillRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);
  bg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
  bg.strokeRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);
  // Swallow taps on the panel itself, or they fall through to the shade and
  // close the thing the player is reading.
  const catcher = scene.add.zone(left + panelW / 2, top + panelH / 2, panelW, panelH).setInteractive();
  overlay.add([bg, catcher]);

  const familyColor = ladder.entries[Math.min(4, ladder.entries.length - 1)].color;
  // The name IS kept, against the show-don't-tell rule, because a single
  // tier's icon does not tell you whether you are looking at Stone or Glass -
  // the art cannot carry it, which is exactly the exception that rule allows.
  const title = scene.add.text(scene.viewW / 2, top + 24, ladder.title, {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '17px', fontStyle: 'bold',
    color: hex(familyColor)
  }).setOrigin(0.5);
  const count = scene.add.text(
    scene.viewW / 2, top + 44,
    ladder.collectable
      ? `${claimedInFamily(scene.collection, typeId)}/${ladder.entries.length}`
      : `${ladder.entries.length} PIECES`,
    {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: '11px', color: hex(Theme.textOnDarkMuted)
    }
  ).setOrigin(0.5);
  overlay.add([title, count]);

  const x = scene.add.text(left + panelW - 20, top + 20, '✕', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '16px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5);
  const xHit = scene.add.zone(left + panelW - 20, top + 20, 40, 40).setInteractive({ useHandCursor: true });
  xHit.on('pointerup', close);
  overlay.add([x, xHit]);

  // THE ONE CAPTION, under the grid, naming whatever is selected. A label
  // under every tile at once would be the thing show-don't-tell cuts - the
  // art already says which tier is which. A name the player ASKED for by
  // tapping is the allowed case: it is a name they could not deduce.
  const caption = scene.add.text(
    scene.viewW / 2, top + panelH - 20, 'TAP A TIER TO SEE ITS NAME',
    {
      resolution: textResolution,
      fontFamily: Theme.fontMono, fontSize: '11px', fontStyle: 'bold',
      color: hex(Theme.textOnDarkMuted)
    }
  ).setOrigin(0.5);
  overlay.add(caption);

  // Every tile's own redraw, so selecting one can clear the last.
  const redraw: (() => void)[] = [];
  let selectedTier: number | null = null;
  const select = (tier: number, label: string, colour: number): void => {
    selectedTier = tier;
    caption.setText(`${String(tier).padStart(2, '0')}  ·  ${label.toUpperCase()}`)
      .setColor(hex(colour));
    redraw.forEach((fn) => fn());
  };

  const gridLeft = scene.viewW / 2 - gridW / 2;
  const gridTop = top + headerH;

  ladder.entries.forEach((def, index) => {
    const column = index % COLS;
    const row = Math.floor(index / COLS);
    const cellTop = gridTop + row * (slot + gap);
    const cx = gridLeft + slot / 2 + column * (slot + gap);
    const cy = cellTop + slot / 2;
    // A REFERENCE LADDER IS ALWAYS OPEN. Source pieces are not in the
    // Collection, so there is nothing to discover and nothing to claim -
    // every tier is simply shown.
    const discovered = ladder.collectable
      ? isDiscovered(scene.collection, typeId, def.tier) : true;
    const claimed = ladder.collectable
      ? isClaimed(scene.collection, typeId, def.tier) : true;

    const plate = scene.add.graphics();
    let lit = discovered;
    let unclaimed = discovered && !claimed;
    const drawPlate = (nextLit: boolean, nextUnclaimed: boolean): void => {
      lit = nextLit;
      unclaimed = nextUnclaimed;
      const chosen = selectedTier === def.tier;
      plate.clear();
      plate.fillStyle(Theme.bg, lit ? 0.92 : 0.48);
      plate.fillRoundedRect(cx - slot / 2, cellTop, slot, slot, Theme.radiusChip);
      // The selected tile takes the family's own colour at full strength, so
      // which one the caption is describing is never in question.
      plate.lineStyle(
        chosen ? 2 : 1,
        chosen ? def.color : (unclaimed ? Theme.currencyGem : Theme.borderOnDark),
        chosen ? 1 : (unclaimed ? 0.9 : 0.55)
      );
      plate.strokeRoundedRect(cx - slot / 2, cellTop, slot, slot, Theme.radiusChip);
    };
    drawPlate(discovered, discovered && !claimed);
    redraw.push(() => drawPlate(lit, unclaimed));
    overlay.add(plate);

    if (!discovered) {
      overlay.add(scene.add.text(cx, cy, '?', {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric, fontSize: `${Math.max(13, slot * 0.42)}px`, fontStyle: 'bold',
        color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5).setAlpha(0.5));
      return;
    }

    const iconSize = slot * 0.9;
    const spriteKey = def.sprite;
    const useSprite = spriteKey !== null;
    const icon = useSprite ? scene.add.image(cx, cy, spriteKey!).setDisplaySize(iconSize, iconSize) : scene.add.graphics();
    const render = useSprite
      ? { materialAlpha: 1 }
      : ladder.collectable
        ? drawTierIcon(icon as Phaser.GameObjects.Graphics, typeId, def.tier,
                       iconSize, materialLighting(def.color, def.tier))
        : (drawSpawnerPieceIcon(icon as Phaser.GameObjects.Graphics, typeId,
                                def.tier, iconSize), { materialAlpha: 1 });
    icon.setAlpha(render.materialAlpha * (claimed ? 1 : 0.35));
    if (!useSprite) {
      const present = iconPresentation(typeId, def.tier, iconSize);
      icon.setScale(present.scale).setPosition(cx + present.offsetX, cy + present.offsetY);
    }
    overlay.add(icon);

    if (claimed) {
      const pick = scene.add.zone(cx, cy, slot, slot).setInteractive({ useHandCursor: true });
      pick.on('pointerup', () => select(def.tier, def.label, def.color));
      overlay.add(pick);
      return;
    }

    const scrim = scene.add.graphics();
    scrim.fillStyle(Theme.bg, 0.35);
    scrim.fillRoundedRect(cx - slot / 2 + 1, cellTop + 1, slot - 2, slot - 2, Theme.radiusChip);
    const gem = currencyIcon(scene, 'gem', Math.min(44, slot * 1.13)).setPosition(cx, cy);
    const hit = scene.add.zone(cx, cy, slot, slot).setInteractive({ useHandCursor: true });
    overlay.add([scrim, gem, hit]);

    hit.on('pointerup', () => {
      if (!claimDiscovery(scene.collection, typeId, def.tier)) return;
      hit.disableInteractive();
      addGems(scene.economy, 1);
      scene.updateCurrencyText();
      scene.updateLevelBadge();
      scene.saveState();
      // Resolves IN PLACE, the same as the Collection's own claim - the art
      // is already drawn under the scrim, so revealing it is only a fade.
      scene.tweens.add({ targets: [scrim, gem], alpha: 0, duration: 260, ease: 'Quad.Out' });
      scene.tweens.add({ targets: icon, alpha: render.materialAlpha, duration: 300, ease: 'Quad.Out' });
      drawPlate(true, false);
      select(def.tier, def.label, def.color);
      count.setText(`${claimedInFamily(scene.collection, typeId)}/${ladder.entries.length}`);
    });
  });
}

export function closeFamilyPanel(scene: BoardScene): void {
  if (!scene.familyOverlay) return;
  scene.familyOverlay.destroy(true);
  scene.familyOverlay = null;
  scene.modalOpen = false;
}
