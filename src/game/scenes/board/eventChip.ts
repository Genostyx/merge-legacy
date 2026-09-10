import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyIcon } from '../../ui/CurrencyGlyph';
import { EVENT_TOKEN_COLOR, drawEventToken } from '../../objects/EventTokenView';
import { drawCrate } from '../../objects/TierIcons';
import {
  activeEvent, claimMilestone, eventMsRemaining, eventProgress,
  isMilestoneClaimed, unclaimedMilestones
} from '../../events/TimedEvents';

/**
 * THE EVENT CHIP - the only permanent surface an event gets.
 *
 * It sits in the RIGHT margin beside the board, mirroring the crate meter in
 * the left one, and it exists only while a window is open. Nothing above or
 * below the board moves to make room for it: the board's framing was settled
 * to hold four things the same distance from the board at every screen size,
 * and an element that appeared for three days and then vanished would break
 * that spacing twice per event.
 *
 * It shows a count and a countdown, which are exactly the two things the
 * show-don't-tell rule allows as text - the medallion says what is counted.
 */
export function buildEventChip(scene: BoardScene): void {
  scene.eventChip = scene.add.container(0, 0).setDepth(8).setVisible(false);

  const bg = scene.add.graphics();
  const token = scene.add.graphics().setPosition(0, -4);
  drawEventToken(token, 34, materialLighting(EVENT_TOKEN_COLOR, 5));
  const count = scene.add.text(0, 14, '', {
    resolution: textResolution,
    fontFamily: Theme.fontNumeric, fontSize: '11px', fontStyle: 'bold',
    color: hex(EVENT_TOKEN_COLOR)
  }).setOrigin(0.5);
  const clock = scene.add.text(0, 27, '', {
    resolution: textResolution,
    fontFamily: Theme.fontMono, fontSize: '9px', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5);

  scene.eventChipBg = bg;
  scene.eventChipCount = count;
  scene.eventChipClock = clock;
  scene.eventChip.add([bg, token, count, clock]);

  scene.eventChipZone = scene.add.zone(0, 0, 48, 64).setDepth(9);
  scene.eventChipZone.on('pointerup', () => scene.openEventTrack());
}

/** Position, contents and visibility, all driven off the clock. */
export function refreshEventChip(scene: BoardScene, now = Date.now()): void {
  if (!scene.eventChip) return;
  const event = activeEvent(now);
  scene.eventChip.setVisible(!!event);
  if (!event) {
    scene.eventChipZone?.disableInteractive();
    return;
  }
  scene.eventChipZone?.setInteractive({ useHandCursor: true });

  const { cy } = scene.crateRingCentre();
  // Mirrored off the crate meter's own margin, so the two sit at the same
  // height on opposite sides of the board however wide the screen is.
  const x = Math.min(
    scene.scale.width - 26,
    scene.boardOriginX + scene.cellSize * COLS_ACROSS + 26
  );
  scene.eventChip.setPosition(x, cy);
  scene.eventChipZone?.setPosition(x, cy + 6);

  const points = eventProgress(scene.timedEvents, event);
  scene.eventChipCount?.setText(`${points}/${event.goal}`);
  scene.eventChipClock?.setText(formatRemaining(eventMsRemaining(event, now)));

  const owed = unclaimedMilestones(scene.timedEvents, event).length;
  const bg = scene.eventChipBg;
  if (!bg) return;
  bg.clear();
  bg.fillStyle(Theme.bg, 0.9);
  bg.fillRoundedRect(-24, -24, 48, 60, Theme.radiusChip);
  // Lit ONLY when a rung is actually owed. A permanently glowing chip stops
  // meaning anything within a day.
  bg.lineStyle(1, owed > 0 ? EVENT_TOKEN_COLOR : Theme.borderOnDark, owed > 0 ? 1 : 0.6);
  bg.strokeRoundedRect(-24, -24, 48, 60, Theme.radiusChip);
}

/** Board columns. Local so the chip does not import the whole board config. */
const COLS_ACROSS = 7;

/** Days once past a day, hours and minutes below that. */
function formatRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  if (days >= 1) return `${days}d ${Math.floor((totalMinutes % 1440) / 60)}h`;
  const hours = Math.floor(totalMinutes / 60);
  if (hours >= 1) return `${hours}h ${totalMinutes % 60}m`;
  return `${totalMinutes}m`;
}

/**
 * THE MILESTONE TRACK - the rungs in order, each claimed on its own.
 *
 * A rung reached inside the window stays claimable after it shuts. That is
 * decided in TimedEvents; this only draws it.
 */
export function openEventTrack(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  const event = activeEvent(Date.now());
  if (!event) return;
  scene.modalOpen = true;

  const overlay = scene.add.container(0, 0).setDepth(3020);
  scene.eventOverlay = overlay;
  const close = (): void => {
    scene.eventOverlay = null;
    scene.modalOpen = false;
    overlay.destroy(true);
    refreshEventChip(scene);
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
    `${points}/${event.goal}  ·  ${formatRemaining(eventMsRemaining(event, Date.now()))}`,
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
