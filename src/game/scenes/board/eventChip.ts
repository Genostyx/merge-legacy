import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyIcon } from '../../ui/CurrencyGlyph';
import { EVENT_TOKEN_COLOR, drawEventToken } from '../../objects/EventTokenView';
import { drawCrate } from '../../objects/TierIcons';
import { ORDER_CARD_H } from './config';
import {
  claimMilestone, eventMsRemaining, eventProgress,
  formatEventCountdown, isMilestoneClaimed, unclaimedMilestones
} from '../../events/TimedEvents';
import type { TimedEventDef } from '../../events/TimedEvents';

/**
 * Set by the longest countdown, `2D 4HR 31:18`, at the size that string
 * needs to stay readable. Everything else on the chip fits in less.
 */
export const EVENT_CHIP_W = 64;

/** Where the energy pill sits, and how big it is. */
const ENERGY_PILL_W = 36;
const ENERGY_PILL_H = 17;
const ENERGY_PILL_CY = 12;

/**
 * THE EVENT CHIP - a card at the head of the order row.
 *
 * It rides INSIDE the order strip rather than in a margin of its own, which
 * settles two things at once: it scrolls with the orders, and it cannot
 * change the row's height or its distance from the board. Those distances
 * were hard won, and a chip that appeared for three days and then vanished
 * would otherwise disturb them twice per event.
 *
 * It is the leftmost thing in the strip, except that the crate meter's own
 * lane still comes first - the meter is fixed furniture and the chip is not.
 * When the meter is cooling it leaves that lane to ride the strip's far end,
 * and the chip inherits the head of the row.
 *
 * Its text is a count and a countdown, which is exactly what show-don't-tell
 * allows: the medallion says what is being counted.
 */
export function buildEventChip(scene: BoardScene): void {
  const chip = scene.add.container(0, 0).setVisible(false);
  scene.eventChip = chip;

  const bg = scene.add.graphics();

  // THE ENERGY YOU HOLD, on the top line - the medallion beside a number, the
  // same pairing the currency chips in the header use. This is the one figure
  // that decides whether opening the event board is worth doing right now, so
  // it is the first thing on the chip rather than something you find inside.
  //
  // The medallion is here and NOWHERE ELSE on the chip. It is what you pick
  // up off the board, so it may only ever mark energy; the points below have
  // a bar instead, because two quantities wearing one piece of art was the
  // confusion this layout exists to end.
  const token = scene.add.graphics().setPosition(EVENT_CHIP_W / 2 - 9, ENERGY_PILL_CY);
  drawEventToken(token, 17, materialLighting(EVENT_TOKEN_COLOR, 5));
  const energy = scene.add.text(EVENT_CHIP_W / 2 + 1, ENERGY_PILL_CY, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric, fontSize: '11px', fontStyle: 'bold',
    color: hex(EVENT_TOKEN_COLOR)
  }).setOrigin(0, 0.5);

  // THE TRACK, as a straight bar. A ring had to be read as a proportion
  // before it said anything; a bar is a distance along a line, which is the
  // shape a progress track already is everywhere else in this game.
  const meter = scene.add.graphics();
  const count = scene.add.text(EVENT_CHIP_W / 2, 24, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric, fontSize: '8px', fontStyle: 'bold',
    color: hex(EVENT_TOKEN_COLOR)
  }).setOrigin(0.5, 0);
  const clock = scene.add.text(EVENT_CHIP_W / 2, 49, '', {
    resolution: textResolution,
    fontFamily: Theme.fontMono, fontSize: '8px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5, 0);

  // A CHILD of the chip, so it travels with the strip's scroll instead of
  // needing to be repositioned in world space every time the row moves.
  const zone = scene.add.zone(EVENT_CHIP_W / 2, ORDER_CARD_H / 2, EVENT_CHIP_W, ORDER_CARD_H)
    .setInteractive({ useHandCursor: true });
  // Tap vs. flick, on the same rule the order cards use: a press here must
  // not open the track when the player was swiping the row sideways.
  zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    scene.orderDrag = {
      active: true, slot: -1, startX: pointer.x,
      startScroll: scene.orderScroll, moved: 0, describe: null, openEvent: true
    };
  });

  scene.eventChipBg = bg;
  scene.eventChipMeter = meter;
  scene.eventChipCount = count;
  scene.eventChipEnergy = energy;
  scene.eventChipClock = clock;
  chip.add([bg, token, energy, meter, count, clock, zone]);
}

/**
 * Contents and visibility. POSITION is the order row's business - see
 * `refreshOrderBar`, which puts this at the head of the strip and then
 * bottom-anchors it alongside the cards.
 */
export function refreshEventChip(scene: BoardScene, now = Date.now()): void {
  const chip = scene.eventChip;
  if (!chip) return;
  const event = scene.currentEvent();
  chip.setVisible(!!event);
  if (!event) return;

  const points = eventProgress(scene.timedEvents, event);
  scene.eventChipCount?.setText(`${points}/${event.goal}`);
  scene.eventChipEnergy?.setText(String(scene.eventBoard.energy));
  scene.eventChipClock?.setText(formatEventCountdown(eventMsRemaining(event, now)));

  const owed = unclaimedMilestones(scene.timedEvents, event).length;
  drawChipMeter(scene, event, points, owed);
  const bg = scene.eventChipBg;
  if (!bg) return;
  bg.clear();
  bg.fillStyle(Theme.bg, 0.9);
  bg.fillRoundedRect(0, 0, EVENT_CHIP_W, ORDER_CARD_H, Theme.radiusChip);
  // Lit ONLY when a rung is actually owed. A permanently glowing chip stops
  // meaning anything within a day.
  bg.lineStyle(
    Theme.borderWidth,
    owed > 0 ? EVENT_TOKEN_COLOR : Theme.borderOnDark,
    owed > 0 ? 1 : 0.85
  );
  bg.strokeRoundedRect(0, 0, EVENT_CHIP_W, ORDER_CARD_H, Theme.radiusChip);

  // A PILL around the energy, so it reads as a held amount rather than as a
  // second score stacked over the track. It is the same shape the header's
  // currency chips use, which is the point: this is a currency you spend, and
  // the track below it is not.
  const pillX = (EVENT_CHIP_W - ENERGY_PILL_W) / 2;
  const pillY = ENERGY_PILL_CY - ENERGY_PILL_H / 2;
  bg.fillStyle(Theme.bgElevated, 1);
  bg.fillRoundedRect(pillX, pillY, ENERGY_PILL_W, ENERGY_PILL_H, ENERGY_PILL_H / 2);
  bg.lineStyle(1, EVENT_TOKEN_COLOR, scene.eventBoard.energy > 0 ? 0.75 : 0.3);
  bg.strokeRoundedRect(pillX, pillY, ENERGY_PILL_W, ENERGY_PILL_H, ENERGY_PILL_H / 2);
}

/**
 * The track: a straight bar with a tick at each rung.
 *
 * A rung already reached is a filled tick, one still ahead is an empty one -
 * so the bar answers how far along, how many rungs are left, and where the
 * next one sits, in one glance and without a word.
 */
function drawChipMeter(
  scene: BoardScene, event: TimedEventDef, points: number, owed: number
): void {
  const g = scene.eventChipMeter;
  if (!g) return;
  const left = 7;
  const width = EVENT_CHIP_W - left * 2;
  const y = 37;
  g.clear();

  g.fillStyle(Theme.borderOnDark, 0.55);
  g.fillRoundedRect(left, y, width, 4, 2);

  const filled = Math.min(1, event.goal > 0 ? points / event.goal : 0);
  if (filled > 0) {
    g.fillStyle(EVENT_TOKEN_COLOR, 1);
    g.fillRoundedRect(left, y, Math.max(3, width * filled), 4, 2);
  }

  // Ticks sit UNDER the bar rather than on it, so a rung marker can never be
  // mistaken for progress that has already been made.
  for (const milestone of event.milestones) {
    const x = left + width * Math.min(1, milestone.at / event.goal);
    const reached = points >= milestone.at;
    g.fillStyle(reached ? EVENT_TOKEN_COLOR : Theme.borderOnDark, reached ? 1 : 0.85);
    g.fillCircle(x, y + 7, owed > 0 && reached ? 1.8 : 1.3);
  }
}

/**
 * THE MILESTONE TRACK - the rungs in order, each claimed on its own.
 *
 * A rung reached inside the window stays claimable after it shuts. That is
 * decided in TimedEvents; this only draws it.
 */
export function openEventTrack(scene: BoardScene, overPanel = false): void {
  // `overPanel` is how the event board opens this on top of itself. The track
  // is reachable from two places and the modal flag is owned by whichever one
  // is underneath, so a stacked open must not claim it - or closing the track
  // would leave the board beneath it inert.
  if ((scene.modalOpen && !overPanel) || scene.inputLocked) return;
  const event = scene.currentEvent();
  if (!event) return;
  if (!overPanel) scene.modalOpen = true;
  else scene.eventTrackOpen = true;

  const overlay = scene.add.container(0, 0).setDepth(overPanel ? 3060 : 3020);
  if (!overPanel) scene.eventOverlay = overlay;
  const close = (): void => {
    if (!overPanel) {
      scene.eventOverlay = null;
      scene.modalOpen = false;
    } else {
      scene.eventTrackOpen = false;
    }
    overlay.destroy(true);
    refreshEventChip(scene);
    onTrackClosed?.();
  };

  const shade = scene.add.rectangle(
    scene.scale.width / 2, scene.scale.height / 2,
    scene.scale.width, scene.scale.height, 0x000000, 0.68
  ).setInteractive();
  shade.on('pointerup', close);
  overlay.add(shade);

  const rowH = 54;
  const panelW = Math.min(scene.scale.width - 32, 320);
  const headerH = 66;
  const panelH = headerH + event.milestones.length * rowH + 18;
  const left = scene.scale.width / 2 - panelW / 2;
  const top = scene.scale.height / 2 - panelH / 2;

  const bg = scene.add.graphics();
  bg.fillStyle(Theme.bgElevated, 1);
  bg.fillRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);
  bg.lineStyle(Theme.borderWidthStrong, Theme.borderOnDark, 1);
  bg.strokeRoundedRect(left, top, panelW, panelH, Theme.radiusPanel);
  const catcher = scene.add.zone(left + panelW / 2, top + panelH / 2, panelW, panelH).setInteractive();
  overlay.add([bg, catcher]);

  // The event's NAME is kept, which the show-don't-tell rule allows: a name
  // the player has to learn, and no artwork can spell it.
  overlay.add(scene.add.text(scene.scale.width / 2, top + 24, event.title.toUpperCase(), {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '16px', fontStyle: 'bold',
    color: hex(EVENT_TOKEN_COLOR)
  }).setOrigin(0.5));
  const points = eventProgress(scene.timedEvents, event);
  overlay.add(scene.add.text(
    scene.scale.width / 2, top + 46,
    `${points}/${event.goal}  ·  ${formatEventCountdown(eventMsRemaining(event, Date.now()))}`,
    {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: '11px', color: hex(Theme.textOnDarkMuted)
    }
  ).setOrigin(0.5));

  const x = scene.add.text(left + panelW - 20, top + 20, '✕', {
    resolution: textResolution,
    fontFamily: Theme.fontHeading, fontSize: '16px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5);
  const xHit = scene.add.zone(left + panelW - 20, top + 20, 40, 40).setInteractive({ useHandCursor: true });
  xHit.on('pointerup', close);
  overlay.add([x, xHit]);

  const onTrackClosed = overPanel ? scene.eventTrackClosed : null;
  event.milestones.forEach((milestone, index) => {
    const cy = top + headerH + index * rowH + rowH / 2;
    const reached = points >= milestone.at;
    const claimed = isMilestoneClaimed(scene.timedEvents, event, index);

    const row = scene.add.graphics();
    const drawRow = (owed: boolean): void => {
      row.clear();
      row.fillStyle(Theme.bg, reached ? 0.9 : 0.45);
      row.fillRoundedRect(left + 14, cy - rowH / 2 + 4, panelW - 28, rowH - 8, Theme.radiusChip);
      row.lineStyle(1, owed ? EVENT_TOKEN_COLOR : Theme.borderOnDark, owed ? 0.95 : 0.5);
      row.strokeRoundedRect(left + 14, cy - rowH / 2 + 4, panelW - 28, rowH - 8, Theme.radiusChip);
    };
    drawRow(reached && !claimed);
    overlay.add(row);

    // The rung's cost, as a number - the one thing the art cannot say.
    overlay.add(scene.add.text(left + 34, cy, String(milestone.at), {
      resolution: textResolution,
      fontFamily: Theme.fontNumeric, fontSize: '14px', fontStyle: 'bold',
      color: hex(reached ? EVENT_TOKEN_COLOR : Theme.textOnDarkMuted)
    }).setOrigin(0, 0.5));

    const prizeX = left + panelW - 52;
    let prize: Phaser.GameObjects.GameObject & { setAlpha(v: number): unknown };
    if (milestone.kind === 'crate') {
      const art = scene.add.graphics().setPosition(prizeX + 12, cy);
      drawCrate(art, 34, milestone.tier);
      prize = art;
    } else {
      prize = currencyIcon(scene, 'gem', 30).setPosition(prizeX, cy);
      overlay.add(scene.add.text(prizeX + 20, cy, `${milestone.amount}`, {
        resolution: textResolution,
        fontFamily: Theme.fontNumeric, fontSize: '13px', fontStyle: 'bold',
        color: hex(Theme.currencyGem)
      }).setOrigin(0, 0.5));
    }
    prize.setAlpha(claimed ? 0.32 : 1);
    overlay.add(prize);

    if (!reached || claimed) return;

    const hit = scene.add.zone(
      left + panelW / 2, cy, panelW - 28, rowH - 8
    ).setInteractive({ useHandCursor: true });
    overlay.add(hit);
    hit.on('pointerup', () => {
      if (!claimMilestone(scene.timedEvents, event, index)) return;
      hit.disableInteractive();
      scene.payEventMilestone(milestone);
      drawRow(false);
      scene.tweens.add({ targets: prize, alpha: 0.32, duration: 240, ease: 'Quad.Out' });
      scene.saveState();
    });
  });
}
