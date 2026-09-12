import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { addCoins, addGems, spendCoinsGeneric, spendGems } from '../../economy/Economy';
import { addEnergy, spendEnergy } from '../../economy/Energy';
import { floatingScore } from '../../fx/MergeFx';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyIcon, currencyPill, currencyChipOptions } from '../../ui/CurrencyGlyph';
import {
  LEGACY_MAX_RPH,
  legacyGearCount,
  legacyRotationsPerHour,
  LEGACY_BASE_GEARS,
  legacyTorqueCost,
  LEGACY_GEAR_RATIO,
  LEGACY_MAX_LEVEL,
  claimableLegacyMilestones,
  gearOneTurnsFor,
  legacySpeed,
  legacyUpgradeCost,
  markLegacyClaimed,
  syncLegacyGears,
  nextLegacyMilestone,
  type LegacyReward
} from '../../legacy/LegacyMachine';

const MACHINE_TEXTURE = 'legacy-machine-0';
/** Frames in the rendered loop. Nine teeth of gear 1, so it wraps. */
const MACHINE_FRAMES = 18;
/** Teeth of gear 1 the loop covers, and the gear's tooth count. */
const MACHINE_LOOP_TEETH = 9;
const MACHINE_GEAR_TEETH = 30;
/** Below this the browser cannot show another frame anyway. */
const MIN_FRAME_MS = 33;

/**
 * How long one rendered frame should be held, for a given real rate.
 *
 * The loop is nine teeth of a thirty-tooth gear - three tenths of a
 * revolution - so at R rotations per hour it represents 1080/R seconds of
 * the machine running. Driving the playback from that rather than from a
 * fixed delay is what makes an upgrade VISIBLE: the barrel actually speeds
 * up when gear one does.
 */
function frameDelayMs(rotationsPerHour: number): number {
  const loopSeconds = (MACHINE_LOOP_TEETH / MACHINE_GEAR_TEETH)
    * 3600 / Math.max(1, rotationsPerHour);
  return Math.max(MIN_FRAME_MS, (loopSeconds * 1000) / MACHINE_FRAMES);
}

function rewardLabel(reward: LegacyReward): string {
  if (reward.kind === 'credits') return reward.amount.toLocaleString();
  return String(reward.amount);
}

function rewardKind(reward: LegacyReward): 'credit' | 'gem' | 'energy' {
  return reward.kind === 'credits' ? 'credit' : reward.kind === 'gems' ? 'gem' : 'energy';
}

/**
 * How long a gear takes to come round once, in the player's own units.
 *
 * The reference machine's whole appeal is this number getting absurd as you
 * look down the train, so the panel says it out loud rather than making the
 * player infer it from a ratio.
 */
function turnsLabel(gear: number): string {
  // Gear one IS the unit, so saying "1 turns of G1" about it is noise.
  if (gear === 0) return 'THE DRIVEN GEAR';
  return `${Math.round(gearOneTurnsFor(gear, 1)).toLocaleString()} TURNS OF G1 EACH`;
}

export function openLegacyMachine(scene: BoardScene): void {
  if (scene.modalOpen || scene.inputLocked) return;
  scene.modalOpen = true;

  const w = scene.viewW;
  const h = scene.viewH;
  // EVERYTHING IS IN THESE UNITS. The old panel placed its gears at y=122
  // and its upgrade at y=210 and stepped rows by 34 pixels, so on a short
  // screen the reward list ran off the bottom with no way to reach it.
  const s = Math.min(1, Math.min(w / 390, h / 720));

  const overlay = scene.add.container(0, 0).setDepth(4300);
  const bg = scene.add.graphics();
  bg.fillGradientStyle(0x0d1012, 0x151819, 0x1a1410, 0x090909, 1);
  bg.fillRect(0, 0, w, h);
  bg.fillStyle(Theme.currencyXp, 0.07);
  bg.fillRect(0, 0, w, Math.min(120 * s, h * 0.2));

  const title = scene.add.text(w / 2, 30 * s, 'LEGACY MACHINE', {
    resolution: textResolution, fontFamily: Theme.fontHeading,
    fontSize: `${Math.round(20 * s)}px`, fontStyle: 'bold', color: hex(Theme.textOnDark)
  }).setOrigin(0.5);
  const subtitle = scene.add.text(w / 2, 53 * s, '', {
    resolution: textResolution, fontFamily: Theme.fontMono,
    fontSize: `${Math.round(10 * s)}px`, fontStyle: 'bold', color: hex(Theme.currencyXp)
  }).setOrigin(0.5);

  const close = scene.add.text(w - 24 * s, 28 * s, 'X', {
    resolution: textResolution, fontFamily: Theme.fontHeading,
    fontSize: `${Math.round(18 * s)}px`, fontStyle: 'bold', color: hex(Theme.textOnDarkMuted)
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  // THE TRAIN, as the reference has it: the gears stacked on ONE SHARED
  // AXIS running away from the viewer, not eight discs laid out in a row.
  // The sprite is a 3D gear rendered at that angle, so the barrel is built
  // by overlapping copies of it along the axis rather than by drawing
  // circles side by side.
  //
  // Its own container, so the gears keep turning while the rest of the
  // panel is rebuilt under them - a claim redraws the reward list, and the
  // machine must not stutter every time it does.
  // THE MACHINE ITSELF, rendered whole and used as the SCREEN, the way the
  // renovations view uses its room render - not a strip of art with a
  // column of widgets under it. The worktop runs past every edge, so the
  // image cover-crops to any shape of screen without a seam.
  const art = scene.add.container(0, 0);
  let spin: Phaser.Time.TimerEvent | null = null;
  let elapsed = 0;
  if (scene.textures.exists(MACHINE_TEXTURE)) {
    const machine = scene.add.image(w / 2, h * 0.42, MACHINE_TEXTURE);
    // THE BARREL GETS LONGER AS TORQUE ADDS GEARS. The render holds far
    // more plates than the game ever uses, so growth is a matter of
    // pulling the camera back and letting more of the stack into frame -
    // no second render, and the machine on screen is always the machine
    // the player has bought.
    const grown = Math.min(0.32, (legacyGearCount(scene.legacyMachine)
      - LEGACY_BASE_GEARS) * 0.012);
    machine.setScale(
      Math.max(w / machine.width, (h * 0.86) / machine.height) * (1 - grown));
    art.add(machine);
    // THE GEARS TURN. Gear one advances a whole tooth over the loop, gear
    // two a third of that, and so on down the barrel - so what the player
    // watches is the near end working and the far end sitting still.
    let frame = 0;
    // RE-READ EVERY TICK, so buying a speed upgrade is visible the moment
    // the panel redraws rather than on the next time the screen is opened.
    spin = scene.time.addEvent({
      delay: MIN_FRAME_MS,
      loop: true,
      callback: () => {
        const delay = frameDelayMs(legacyRotationsPerHour(scene.legacyMachine.gearOneLevel));
        elapsed += MIN_FRAME_MS;
        if (elapsed < delay) return;
        elapsed = 0;
        frame = (frame + 1) % MACHINE_FRAMES;
        machine.setTexture(`legacy-machine-${frame}`);
      }
    });
    // The readout sits over the worktop's lower half, which is pale and
    // empty; a scrim there keeps the text legible without dimming the
    // machine itself.
    const scrim = scene.add.graphics();
    // A FADE, then solid. The counts row and everything under it has to
    // sit on a dark ground or the pale worktop swallows it - green text on
    // near-white was unreadable at both ends of the screen.
    // NO SCRIM OVER THE MACHINE. The render carries its own dark lower
    // half, and laying a gradient over it cut the image in two - the
    // worktop the whole render was built for stopped halfway down the
    // screen. Only the header keeps one.
    scrim.fillStyle(0x0d1012, 0.92);
    scrim.fillRect(0, 0, w, 46 * s);
    scrim.fillGradientStyle(0x0d1012, 0x0d1012, 0x0d1012, 0x0d1012, 0.92, 0.92, 0, 0);
    scrim.fillRect(0, 46 * s, w, 34 * s);
    art.add(scrim);
  }

  const content = scene.add.container(0, 0);
  const redraw = (): void => {
    content.removeAll(true);
    const state = scene.legacyMachine;
    const rph = legacyRotationsPerHour(state.gearOneLevel);
    const tooFast = frameDelayMs(rph) <= MIN_FRAME_MS;
    subtitle.setText(
      `GEAR 1  ·  ${rph.toLocaleString()} ROTATIONS / HOUR`
      + (rph >= LEGACY_MAX_RPH ? '  ·  AT THE TEETH’S LIMIT'
        : tooFast ? '  ·  FASTER THAN THE EYE' : '')
    );
    // EVERY GEAR'S COUNT ON ONE LINE, evenly spaced under the art. Eight
    // labels pinned to eight drawn gears collided the moment the barrel was
    // packed tightly enough to look right; the machine is a picture now, so
    // the numbers get a row of their own.
    // ANCHORED TO THE BOTTOM, not to the art. The machine is the screen
    // now, so the readout, the upgrade and the claims are a HUD over it -
    // stacked up from the floor, which also means a long claim list grows
    // into the space it has rather than off the end of it.
    // Clear of the footer line.
    const listBottom = h - 46 * s;
    const upgradeY = listBottom - 92 * s;
    const barY = upgradeY - 52 * s;
    const countY = barY - 34 * s;
    // The machine GROWS, so the row is laid out from its current length.
    const gears = legacyGearCount(state);
    const countStep = Math.min(46 * s, (w - 30 * s) / gears);
    const countLeft = w / 2 - (countStep * (gears - 1)) / 2;
    for (let i = 0; i < gears; i++) {
      const turns = state.turns[i] ?? 0;
      content.add(scene.add.text(countLeft + countStep * i, countY, `G${i + 1}`, {
        resolution: textResolution, fontFamily: Theme.fontMono,
        fontSize: `${Math.round(7 * s)}px`, fontStyle: 'bold',
        color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5, 1));
      content.add(scene.add.text(
        countLeft + countStep * i, countY + 2 * s,
        turns >= 100 ? Math.round(turns).toLocaleString()
          : turns >= 1 ? turns.toFixed(1) : turns.toFixed(2),
        {
          resolution: textResolution, fontFamily: Theme.fontNumeric,
          fontSize: `${Math.round(9 * s)}px`, fontStyle: 'bold',
          color: hex(i === 0 ? Theme.currencyXp : Theme.textOnDark)
        }
      ).setOrigin(0.5, 0));
    }

    // WHAT THE MACHINE IS DOING RIGHT NOW, one line: the shallowest gear
    // still working toward something, and how far along it is.
    let focus = 0;
    for (let i = 0; i < legacyGearCount(state); i++) {
      if (nextLegacyMilestone(state, i)) { focus = i; break; }
    }
    const next = nextLegacyMilestone(state, focus);
    const barW = Math.min(340 * s, w - 28 * s);
    const bar = scene.add.graphics();
    bar.fillStyle(Theme.bgElevated, 0.9);
    bar.fillRoundedRect(w / 2 - barW / 2, barY - 7 * s, barW, 14 * s, 7 * s);
    if (next) {
      bar.fillStyle(Theme.currencyXp, 0.85);
      bar.fillRoundedRect(w / 2 - barW / 2, barY - 7 * s,
        Math.max(14 * s, barW * next.progress), 14 * s, 7 * s);
    }
    content.add(bar);
    content.add(scene.add.text(
      w / 2, barY + 16 * s,
      next
        ? `GEAR ${focus + 1} -> ${next.milestone} ROTATION${next.milestone === 1 ? '' : 'S'}  ·  ${turnsLabel(focus)}`
        : 'THE MACHINE IS COMPLETE',
      {
        resolution: textResolution, fontFamily: Theme.fontMono,
        fontSize: `${Math.round(9 * s)}px`, fontStyle: 'bold',
        color: hex(next ? Theme.textOnDarkMuted : Theme.currencyXp)
      }
    ).setOrigin(0.5));

    // ---- the upgrade ----
    // ONE BUTTON, TWO TRACKS. Speed while the teeth can take it, torque
    // after - which is the point of the cap: the machine stops getting
    // faster and starts getting longer, and the upgrade never runs out.
    const maxed = state.gearOneLevel >= LEGACY_MAX_LEVEL;
    const torque = legacyTorqueCost(state.torqueLevel);
    const cost = maxed
      ? { credits: torque.credits, gems: torque.gems, energy: 0 }
      : legacyUpgradeCost(state.gearOneLevel);
    const upgradeW = Math.min(342 * s, w - 30 * s);
    const affordable = scene.economy.coins >= cost.credits
      && scene.economy.gems >= cost.gems
      && scene.energy.current >= cost.energy;
    const up = scene.add.graphics();
    const upColor = affordable ? Theme.currencyXp : Theme.panelAlt;
    const lighting = materialLighting(upColor, affordable ? 5 : 2);
    up.fillGradientStyle(lighting.highlight, lighting.light, lighting.dark, lighting.shadow, 1);
    up.fillRoundedRect(w / 2 - upgradeW / 2, upgradeY - 25 * s, upgradeW, 50 * s, Theme.radiusChip);
    up.lineStyle(1.5, affordable ? Theme.currencyXp : Theme.borderOnDark, 0.95);
    up.strokeRoundedRect(w / 2 - upgradeW / 2, upgradeY - 25 * s, upgradeW, 50 * s, Theme.radiusChip);
    content.add(up);
    content.add(scene.add.text(
      w / 2, maxed ? upgradeY : upgradeY - 8 * s,
      maxed ? `ADD GEAR ${legacyGearCount(state) + 1}` : 'UPGRADE GEAR 1',
      {
        resolution: textResolution, fontFamily: Theme.fontHeading,
        fontSize: `${Math.round(13 * s)}px`, fontStyle: 'bold',
        color: hex(affordable ? Theme.bg : Theme.textOnDarkMuted)
      }
    ).setOrigin(0.5));

    {
      const costRow = scene.add.container(w / 2, upgradeY + 12 * s);
      const pills = [
        currencyPill(scene, cost.credits.toLocaleString(), 'credit', { ...currencyChipOptions('credit'), height: 18 * s, fontSize: 9 * s, iconSize: 13 * s }),
        currencyPill(scene, String(cost.gems), 'gem', { ...currencyChipOptions('gem'), height: 18 * s, fontSize: 9 * s, iconSize: 13 * s }),
        ...(cost.energy
          ? [currencyPill(scene, String(cost.energy), 'energy', { ...currencyChipOptions('energy'), height: 18 * s, fontSize: 9 * s, iconSize: 13 * s })]
          : [])
      ];
      let x = -pills.reduce((sum, pill) => sum + pill.width, 0) / 2 - 8 * s;
      for (const pill of pills) {
        x += pill.width / 2 + 4 * s;
        pill.setPosition(x, 0);
        x += pill.width / 2 + 4 * s;
        costRow.add(pill);
      }
      content.add(costRow);
    }

    if (affordable) {
      const zone = scene.add.zone(w / 2, upgradeY, upgradeW, 50 * s).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        const atCap = scene.legacyMachine.gearOneLevel >= LEGACY_MAX_LEVEL;
        const nextTorque = legacyTorqueCost(scene.legacyMachine.torqueLevel);
        const current = atCap
          ? { credits: nextTorque.credits, gems: nextTorque.gems, energy: 0 }
          : legacyUpgradeCost(scene.legacyMachine.gearOneLevel);
        // CHECKED BEFORE ANY OF IT IS SPENT. Spending three currencies in
        // sequence and hand-refunding the earlier two on each failure was
        // three chances to leave the wallet wrong; there is nothing to
        // unwind if nothing is taken until all three are known good.
        if (scene.economy.coins < current.credits
          || scene.economy.gems < current.gems
          || scene.energy.current < current.energy) return;
        spendCoinsGeneric(scene.economy, current.credits);
        spendGems(scene.economy, current.gems);
        spendEnergy(scene.energy, current.energy);
        if (atCap) {
          scene.legacyMachine.torqueLevel++;
          syncLegacyGears(scene.legacyMachine);
        } else {
          scene.legacyMachine.gearOneLevel++;
        }
        scene.updateCurrencyText();
        scene.updateEnergyText();
        scene.saveState();
        redraw();
      });
      content.add(zone);
    }

    // ---- the reward ----
    //
    // ONE AT A TIME. A list of twenty-one claims is a chore and it buried
    // the machine under rows of its own bookkeeping; the next one, taken
    // and replaced by the one behind it, is the whole interaction.
    const claims = claimableLegacyMilestones(scene.legacyMachine);
    const claim = claims[0];
    const rowW = Math.min(340 * s, w - 28 * s);
    const yRow = listBottom - 14 * s;
    if (claim) {
      content.add(scene.add.text(
        w / 2, yRow - 30 * s,
        claims.length > 1 ? `REWARD READY  ·  ${claims.length - 1} BEHIND IT` : 'REWARD READY',
        {
          resolution: textResolution, fontFamily: Theme.fontMono,
          fontSize: `${Math.round(10 * s)}px`, fontStyle: 'bold',
          color: hex(Theme.currencyXp)
        }
      ).setOrigin(0.5));
      const row = scene.add.graphics();
      row.fillStyle(Theme.bgElevated, 0.95)
        .fillRoundedRect(w / 2 - rowW / 2, yRow - 14 * s, rowW, 28 * s, Theme.radiusChip);
      row.lineStyle(1.5, Theme.currencyXp, 0.85)
        .strokeRoundedRect(w / 2 - rowW / 2, yRow - 14 * s, rowW, 28 * s, Theme.radiusChip);
      content.add(row);
      content.add(scene.add.text(
        w / 2 - rowW / 2 + 12 * s, yRow,
        `GEAR ${claim.gear + 1}  ·  ${claim.milestone} ROT`,
        {
          resolution: textResolution, fontFamily: Theme.fontMono,
          fontSize: `${Math.round(10 * s)}px`, fontStyle: 'bold', color: hex(Theme.textOnDark)
        }
      ).setOrigin(0, 0.5));
      const value = scene.add.text(w / 2 + rowW / 2 - 12 * s, yRow, rewardLabel(claim.reward), {
        resolution: textResolution, fontFamily: Theme.fontNumeric,
        fontSize: `${Math.round(12 * s)}px`, fontStyle: 'bold', color: hex(Theme.currencyXp)
      }).setOrigin(1, 0.5);
      content.add(value);
      content.add(currencyIcon(scene, rewardKind(claim.reward), 15 * s)
        .setPosition(w / 2 + rowW / 2 - 18 * s - value.width, yRow));
      const zone = scene.add.zone(w / 2, yRow, rowW, 28 * s).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (claim.reward.kind === 'credits') addCoins(scene.economy, claim.reward.amount);
        else if (claim.reward.kind === 'gems') addGems(scene.economy, claim.reward.amount);
        else addEnergy(scene.energy, claim.reward.amount);
        markLegacyClaimed(scene.legacyMachine, claim.gear, claim.milestone);
        scene.updateCurrencyText();
        scene.updateEnergyText();
        floatingScore(scene, w / 2, yRow, claim.reward.amount,
          claim.reward.kind === 'credits' ? 'CR' : claim.reward.kind === 'gems' ? 'GEM' : 'EN');
        scene.saveState();
        redraw();
      });
      content.add(zone);
    }

    content.add(scene.add.text(
      w / 2, h - 16 * s,
      `PROJECT STAGES TURN GEAR 1  ·  EACH GEAR IS ${LEGACY_GEAR_RATIO}:1`,
      {
        resolution: textResolution, fontFamily: Theme.fontMono,
        fontSize: `${Math.round(9 * s)}px`, color: hex(Theme.textOnDarkMuted)
      }
    ).setOrigin(0.5));
  };

  const dismiss = (): void => {
    spin?.remove();
    overlay.destroy(true);
    scene.modalOpen = false;
  };
  close.on('pointerdown', dismiss);
  // ART UNDER THE HEADER. Added last it covered the title and the close
  // button, which is the one control this screen cannot do without.
  overlay.add([bg, art, title, subtitle, close, content]);
  redraw();
}
