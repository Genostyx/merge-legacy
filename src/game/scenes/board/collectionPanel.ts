import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyIcon } from '../../ui/CurrencyGlyph';
import { drawTierIcon, iconPresentation } from '../../objects/TierIcons';
import { CHAINS, isCurrencyChain } from '../../data/chains';
import { addGems } from '../../economy/Economy';
import { burstParticles } from '../../fx/MergeFx';
import {
  claimDiscovery,
  claimedInFamily,
  isClaimed,
  isDiscovered,
  unclaimedDiscoveryCount
} from '../../collection/Collection';

/**
 * collectionPanel, lifted out of BoardScene whole.
 *
 * Each method became a free function taking the scene, and `this.` became
 * `scene.` - no logic was rewritten.
 */

export function drawCollectionBook(scene: BoardScene, g: Phaser.GameObjects.Graphics, size: number, color: number): void {
  const w = size;
  const h = size * 0.68;
  const half = w / 2;
  g.fillStyle(color, 0.18);
  g.fillRoundedRect(-half, -h / 2, w, h, 3);
  g.lineStyle(1.5, color, 0.95);
  g.beginPath();
  g.moveTo(-half + 2, -h / 2 + 2);
  g.lineTo(-2, -h / 2 + 5);
  g.lineTo(0, h / 2 - 2);
  g.lineTo(2, -h / 2 + 5);
  g.lineTo(half - 2, -h / 2 + 2);
  g.lineTo(half - 2, h / 2 - 2);
  g.lineTo(2, h / 2);
  g.lineTo(0, h / 2 - 2);
  g.lineTo(-2, h / 2);
  g.lineTo(-half + 2, h / 2 - 2);
  g.closePath();
  g.strokePath();
  g.lineStyle(1, color, 0.45);
  g.lineBetween(-half + 6, -2, -5, 0);
  g.lineBetween(5, 0, half - 6, -2);
}

export function buildMainCollectionButton(scene: BoardScene): void {
  const x = scene.scale.width / 2;
  const y = scene.scale.height - 18;
  const w = 44;
  const h = 30;
  scene.mainCollectionPanel = scene.add.graphics().setDepth(12);
  scene.mainCollectionPanel.fillStyle(Theme.bgElevated, 0.96);
  scene.mainCollectionPanel.fillRoundedRect(x - w / 2, y - h / 2, w, h, Theme.radiusChip);
  scene.mainCollectionPanel.lineStyle(1, Theme.borderOnDark, 1);
  scene.mainCollectionPanel.strokeRoundedRect(x - w / 2, y - h / 2, w, h, Theme.radiusChip);
  const icon = scene.add.graphics().setPosition(x, y).setDepth(13);
  drawCollectionBook(scene, icon, 20, Theme.textOnDarkMuted);
  scene.mainCollectionBadge = scene.add.text(x + 17, y - 12, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric,
    fontSize: '8px',
    fontStyle: 'bold',
    color: hex(Theme.textOnDark),
    backgroundColor: hex(Theme.currencyGem),
    padding: { x: 3, y: 1 }
  }).setOrigin(0.5).setDepth(14);
  const zone = scene.add.zone(x, y, w, h).setDepth(15).setInteractive({ useHandCursor: true });
  zone.on('pointerdown', () => openCollection(scene));
  refreshMainCollectionButton(scene);
}

export function refreshMainCollectionButton(scene: BoardScene): void {
  if (!scene.mainCollectionBadge) return;
  const count = unclaimedDiscoveryCount(scene.collection);
  scene.mainCollectionBadge.setText(count > 9 ? '9+' : String(count)).setVisible(count > 0);
}

export function closeCollection(scene: BoardScene): void {
  scene.collectionOverlay?.destroy(true);
  scene.collectionOverlay = null;
  scene.modalOpen = false;
}

export function openCollection(scene: BoardScene, initialScroll = 0): void {
  if (scene.modalOpen || scene.inputLocked) return;
  scene.modalOpen = true;

  const overlay = scene.add.container(0, 0).setDepth(3001);
  scene.collectionOverlay = overlay;
  const shade = scene.add.rectangle(
    scene.scale.width / 2, scene.scale.height / 2,
    scene.scale.width, scene.scale.height,
    0x000000, 0.68
  ).setInteractive();

  const panelW = Math.min(430, scene.scale.width - 24);
  const panelH = Math.min(620, scene.scale.height - 28);
  const left = scene.scale.width / 2 - panelW / 2;
  const top = scene.scale.height / 2 - panelH / 2;
  const bg = scene.add.graphics();
  bg.fillStyle(Theme.bgElevated, 1);
  bg.fillRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);
  bg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
  bg.strokeRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);

  const title = scene.add.text(scene.scale.width / 2, top + 24, 'COLLECTION', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading,
    fontSize: '19px',
    fontStyle: 'bold',
    color: hex(Theme.textOnDark)
  }).setOrigin(0.5);
  const subtitle = scene.add.text(scene.scale.width / 2, top + 45, 'DISCOVER ITEMS  ·  CLAIM ONE GEM EACH', {
    resolution: textResolution,
    fontFamily: Theme.fontMono,
    fontSize: '8px',
    color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5);
  const close = scene.add.text(left + panelW - 18, top + 18, '×', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading,
    fontSize: '24px',
    color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  close.on('pointerdown', () => closeCollection(scene));
  overlay.add([shade, bg, title, subtitle, close]);

  const viewportTop = top + 65;
  const viewportBottom = top + panelH - 14;
  const viewportH = viewportBottom - viewportTop;
  const scrollZone = scene.add.zone(scene.scale.width / 2, viewportTop + viewportH / 2, panelW - 20, viewportH)
    .setInteractive({ useHandCursor: true });
  const content = scene.add.container(0, 0);
  const maskShape = scene.add.graphics().setVisible(false);
  maskShape.fillStyle(0xffffff).fillRect(left + 10, viewportTop, panelW - 20, viewportH);
  content.setMask(maskShape.createGeometryMask());
  overlay.add([scrollZone, content, maskShape]);

  const innerW = panelW - 36;
  const slotGap = 3;
  const slotSize = Math.min(54, (innerW - slotGap * 2) / 3);
  const familyW = slotSize * 3 + slotGap * 2;
  const familyLeft = left + (panelW - familyW) / 2;
  // Derived from the viewport, not a fixed offset from the panel. Family
  // labels are drawn 25px ABOVE their grid, so a hardcoded `top + 85` put the
  // first one at top+60 while the scroll mask began at top+65 - clipping
  // "WOOD" and its count in half. Anchoring to the mask keeps them clear
  // however the header above changes.
  let nextGridTop = viewportTop + 34;
  let collectionDragMoved = 0;

  CHAINS.filter((chain) => !isCurrencyChain(chain.typeId)).forEach((chain) => {
    const gridTop = nextGridTop;
    const familyColor = chain.tiers[Math.min(4, chain.tiers.length - 1)].color;
    const label = scene.add.text(familyLeft, gridTop - 25, chain.typeId === 'mineral' ? 'STONE' : chain.typeId.toUpperCase(), {
      resolution: textResolution,
      fontFamily: Theme.fontHeading,
      fontSize: '10px',
      fontStyle: 'bold',
      color: hex(familyColor)
    });
    const count = scene.add.text(familyLeft + familyW, gridTop - 25,
      `${claimedInFamily(scene.collection, chain.typeId)}/${chain.tiers.length}`, {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric,
        fontSize: '9px',
        color: hex(Theme.textOnDarkMuted)
      }).setOrigin(1, 0);
    content.add([label, count]);

    chain.tiers.forEach((def, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const cellTop = gridTop + row * (slotSize + slotGap);
      const cx = familyLeft + slotSize / 2 + column * (slotSize + slotGap);
      const cy = cellTop + slotSize / 2;
      const discovered = isDiscovered(scene.collection, chain.typeId, def.tier);
      const claimed = isClaimed(scene.collection, chain.typeId, def.tier);
      const plate = scene.add.graphics();
      plate.fillStyle(Theme.bg, discovered ? 0.92 : 0.48);
      plate.fillRoundedRect(cx - slotSize / 2, cellTop, slotSize, slotSize, Theme.radiusChip);
      plate.lineStyle(1, discovered && !claimed ? Theme.currencyGem : Theme.borderOnDark, discovered && !claimed ? 0.9 : 0.55);
      plate.strokeRoundedRect(cx - slotSize / 2, cellTop, slotSize, slotSize, Theme.radiusChip);
      content.add(plate);

      if (!discovered) {
        const question = scene.add.text(cx, cy, '?', {
          resolution: textResolution,
          fontFamily: Theme.fontNumeric,
          fontSize: `${Math.max(13, slotSize * 0.42)}px`,
          fontStyle: 'bold',
          color: hex(Theme.textOnDarkMuted)
        }).setOrigin(0.5).setAlpha(0.5);
        content.add(question);
        return;
      }

      const iconSize = slotSize * 0.9;
      const icon = scene.add.graphics();
      const render = drawTierIcon(icon, chain.typeId, def.tier, iconSize, materialLighting(def.color, def.tier));
      const present = iconPresentation(chain.typeId, def.tier, iconSize);
      icon.setAlpha(render.materialAlpha * (claimed ? 1 : 0.35));
      icon.setScale(present.scale).setPosition(cx + present.offsetX, cy + present.offsetY);
      content.add(icon);

      if (!claimed) {
        const scrim = scene.add.graphics();
        scrim.fillStyle(Theme.bg, 0.35);
        scrim.fillRoundedRect(cx - slotSize / 2 + 1, cellTop + 1, slotSize - 2, slotSize - 2, Theme.radiusChip);
        const gem = currencyIcon(scene, 'gem', Math.min(44, slotSize * 1.13)).setPosition(cx, cy);
        const gemBaseScaleX = gem.scaleX;
        const gemBaseScaleY = gem.scaleY;
        const hit = scene.add.zone(cx, cy, slotSize, slotSize).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => scene.time.delayedCall(0, () => {
          if (collectionDragMoved > 6) return;
          if (!claimDiscovery(scene.collection, chain.typeId, def.tier)) return;
          hit.disableInteractive();
          addGems(scene.economy, 1);
          scene.updateCurrencyText();
          scene.updateLevelBadge();
          scene.saveState();

          // The slot resolves IN PLACE. This used to close the whole
          // collection and reopen it at the saved scroll when the gem
          // landed, which flashed the entire panel for one claim - most of
          // why claiming felt bad. The item art is already drawn under the
          // scrim, so revealing it is just a fade.
          scene.tweens.add({ targets: scrim, alpha: 0, duration: 260, ease: 'Quad.Out' });
          scene.tweens.add({
            targets: icon, alpha: render.materialAlpha, duration: 300, ease: 'Quad.Out'
          });
          plate.clear();
          plate.fillStyle(Theme.bg, 0.92);
          plate.fillRoundedRect(cx - slotSize / 2, cellTop, slotSize, slotSize, Theme.radiusChip);
          plate.lineStyle(1, Theme.borderOnDark, 0.55);
          plate.strokeRoundedRect(cx - slotSize / 2, cellTop, slotSize, slotSize, Theme.radiusChip);

          // The gem leaves the list and finishes its flight in SCENE space.
          // Inside `content` it was clipped by the list's mask and drawn
          // under the panel header, so it disappeared behind the top of the
          // collection exactly as it arrived. Reparenting keeps it whole and
          // lets it pass over everything on its way to the counter.
          const flightX = cx;
          const flightY = cy + content.y;
          content.remove(gem);
          scene.add.existing(gem);
          gem.setPosition(flightX, flightY).setDepth(4200);

          const targetX = scene.gemText.x;
          const targetY = scene.gemText.y;
          // Arc rather than a straight line, and a control point pulled up
          // and toward the counter - a collected thing thrown to a counter
          // reads as a lob, and a linear slide reads as a sprite being
          // dragged.
          const ctrlX = (flightX + targetX) / 2 + (targetX - flightX) * 0.1;
          const ctrlY = Math.min(flightY, targetY) - Math.abs(targetX - flightX) * 0.22 - 40;
          // The claim beat is now a HOLD, not a swell. A short pause before
          // the gem leaves still gives the tap its own moment, without the
          // gem ever growing - which is what read as bloated at any size the
          // swell was tuned to.
          scene.time.delayedCall(90, () => {
            burstParticles(scene, flightX, flightY, Theme.currencyGem, 1);
            scene.tweens.addCounter({
              from: 0,
              to: 1,
              duration: 430,
              ease: 'Cubic.In',
              onUpdate: (tween) => {
                const t = tween.getValue() ?? 0;
                const inv = 1 - t;
                gem.setPosition(
                  inv * inv * flightX + 2 * inv * t * ctrlX + t * t * targetX,
                  inv * inv * flightY + 2 * inv * t * ctrlY + t * t * targetY
                );
                // Preserve the SVG's display-size scale. Setting this to a
                // literal 1 reset the image to its huge native dimensions.
                const flightScale = Phaser.Math.Linear(1.06, 0.42, t);
                gem.setScale(gemBaseScaleX * flightScale, gemBaseScaleY * flightScale);
                // Holds full opacity almost the whole way, then goes in
                // the last stretch. Fading from the start made it vanish
                // in mid-air instead of arriving anywhere.
                gem.setAlpha(t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28);
              },
              onComplete: () => {
                gem.destroy();
                // The counter reacts, so the gem lands somewhere rather
                // than simply disappearing off the top of the panel.
                scene.tweens.add({
                  targets: scene.gemText,
                  scale: { from: 1.35, to: 1 },
                  duration: 260,
                  ease: 'Back.Out'
                });
              }
            });
          });
        }));
        content.add([scrim, gem, hit]);
      }
    });
    const rows = Math.ceil(chain.tiers.length / 3);
    nextGridTop += rows * (slotSize + slotGap) + 38;
  });

  const contentBottom = nextGridTop - 38;
  const maxScroll = Math.max(0, contentBottom - viewportBottom);
  let scroll = 0;
  let dragging = false;
  let dragStartY = 0;
  let dragStartScroll = 0;
  const setScroll = (value: number): void => {
    scroll = Phaser.Math.Clamp(value, 0, maxScroll);
    content.y = -scroll;
  };
  setScroll(initialScroll);
  const onDown = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.x < left + 10 || pointer.x > left + panelW - 10 || pointer.y < viewportTop || pointer.y > viewportBottom) return;
    dragging = true;
    dragStartY = pointer.y;
    dragStartScroll = scroll;
    collectionDragMoved = 0;
  };
  const onMove = (pointer: Phaser.Input.Pointer): void => {
    if (!dragging) return;
    collectionDragMoved = Math.max(collectionDragMoved, Math.abs(pointer.y - dragStartY));
    setScroll(dragStartScroll + dragStartY - pointer.y);
  };
  const onUp = (): void => { dragging = false; };
  const onWheel = (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void => {
    if (pointer.x < left || pointer.x > left + panelW || pointer.y < viewportTop || pointer.y > viewportBottom) return;
    setScroll(scroll + dy * 0.55);
  };
  scene.input.on('pointerdown', onDown);
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('wheel', onWheel);
  overlay.once('destroy', () => {
    scene.input.off('pointerdown', onDown);
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('wheel', onWheel);
  });
}
