import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { spendCoinsGeneric, spendGems } from '../../economy/Economy';
import { spendEnergy } from '../../economy/Energy';
import { Theme, hex, materialLighting, textResolution } from '../../ui/Theme';
import { currencyPill, currencyChipOptions } from '../../ui/CurrencyGlyph';
import { CRATE_LABELS } from '../../rewards/Rewards';
import { RESOURCE_PRODUCERS } from '../../rewards/ResourceRewards';
import {
  LEGACY_MAX_RPH,
  legacyGearCount,
  legacyRotationsPerHour,
  legacyIsRunning,
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

/**
 * THE MACHINE IS DRAWN LIVE, not played back.
 *
 * It used to be eighteen 512-square renders of the whole barrel swapped
 * thirty times a second - 18MB of texture to animate four gears out of
 * fifty, because a pre-rendered loop can only hold gears whose rotation
 * divides into it exactly. One gear sprite, drawn once per gear and
 * rotated, shows all of them at their true ratios and answers an upgrade
 * in the frame it is bought.
 *
 * The gear is photographed FACE ON because a sprite can only turn about
 * the axis pointing at the viewer. The ANGLE is an illusion built out of
 * layout: stepping the plates diagonally, shrinking them as they recede
 * and darkening the far ones reads as a barrel seen at an angle.
 */
const GEAR_TEXTURE = 'legacy-gear';

/** What the row calls the thing that is about to land on the board. */
function rewardLabel(reward: LegacyReward): string {
  return reward.kind === 'crate'
    ? CRATE_LABELS[reward.tier]
    : RESOURCE_PRODUCERS[reward.producerId].label.toUpperCase();
}

/**
 * How long a gear takes to come round once, in the player's own units.
 *
 * The reference machine's whole appeal is this number getting absurd as you
 * look down the train, so the panel says it out loud rather than making the
 * player infer it from a ratio.
 */
function turnsLabel(gear: number): string {
  // Gear one IS the unit - project stages turn it directly - so there is
  // nothing to convert. Everything deeper is quoted in gear one's turns,
  // spelled out, because "729 OF G1" tells a player nothing about why
  // the number is big.
  if (gear === 0) return 'PROJECT STAGES TURN THIS ONE DIRECTLY';
  return `ONE TURN OF THIS = `
    + `${Math.round(gearOneTurnsFor(gear, 1)).toLocaleString()} OF GEAR 1’S`;
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
  const art = scene.add.container(0, 0);
  const gears: Phaser.GameObjects.Image[] = [];
  let spin: Phaser.Time.TimerEvent | null = null;

  // NO WORKTOP. The pale bench was carried over from the photographs,
  // and on a dark panel it reads as a white card the machine is stuck to
  // rather than as a surface it stands on.

  if (scene.textures.exists(GEAR_TEXTURE)) {
    const stages = legacyGearCount(scene.legacyMachine);
    const plates = 26;

    // STRAIGHT UP THE SCREEN, near end at the bottom, the two barrels
    // side by side. Running them diagonally made the pair drift apart
    // across the frame; vertical keeps them parallel and lets them sit
    // close enough that driving each other is believable.
    const barrelSpans = 0.13 * (plates - 1) + 1;
    // Sized to fill the band rather than sit in the middle of it. Every
    // other measurement here is derived from `near`, so raising it scales
    // the step and the centre distance with it and the mesh holds.
    const near = Math.min(
      (w * 0.92) / 1.95,
      (h * 0.56) / barrelSpans
    );
    // The sprite is padded: the drawn wheel fills 0.863 of its canvas, so
    // spacing has to be measured on the tooth circle, not the box.
    const toothed = near * 0.863;
    const step = toothed * 0.13;
    // Just inside one tooth circle, so the two barrels overlap slightly
    // and read as being in mesh rather than as two separate stacks.
    const gap = toothed * 0.94;
    const baseY = h * 0.58;

    for (let i = plates - 1; i >= 0; i--) {
      // Receding, so the far end is smaller - the only depth cue left
      // once the barrels are square to the screen.
      const shrink = 0.982 ** i;
      // THE SPACING SHRINKS WITH THE PLATES. Held at the near end's
      // distance it left a gap that widened all the way up the barrel -
      // the first two wheels looked like they drove each other and
      // nothing above them did. Two shafts converge as they recede, so
      // the centre distance has to take the same falloff the diameter
      // does.
      const halfGap = (gap * shrink) / 2;
      for (let row = 0; row < 2; row++) {
        const gear = scene.add.image(
          w * 0.5 + (row ? halfGap : -halfGap),
          baseY - step * i,
          GEAR_TEXTURE
        ).setDisplaySize(near * shrink, near * shrink);
        gear.setData('stage', Math.min(i, stages - 1));
        // Meshing rows COUNTER-ROTATE, which is what two gears in mesh
        // actually do - the driven row runs backwards against the driver.
        gear.setData('sense', row ? -1 : 1);
        gears.push(gear);
        art.add(gear);
      }
    }

    // DRIVEN BY REAL ELAPSED TIME, not by an assumed tick length. At a
    // fixed 16ms per step the machine ran slow whenever a frame took
    // longer than that, so the barrel and the "rotations per hour" on
    // the header quietly disagreed. Now a gear that says 250 an hour
    // turns 250 times an hour, and the deeper ones divide exactly.
    let last = scene.time.now;
    spin = scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const now = scene.time.now;
        const seconds = Math.min(0.25, (now - last) / 1000);
        last = now;
        const rph = legacyRotationsPerHour(scene.legacyMachine.gearOneLevel);
        // STOPPED IS STOPPED: nothing turns before the first upgrade.
        if (rph <= 0) return;
        const radians = (rph / 3600) * 2 * Math.PI * seconds;
        for (const gear of gears) {
          gear.rotation += (gear.getData('sense') as number) * radians
            / LEGACY_GEAR_RATIO ** (gear.getData('stage') as number);
        }
      }
    });
  }

  const content = scene.add.container(0, 0);
  const redraw = (): void => {
    content.removeAll(true);
    const state = scene.legacyMachine;
    const rph = legacyRotationsPerHour(state.gearOneLevel);
    subtitle.setText(
      rph === 0
        ? 'STOPPED  ·  NOTHING IS DRIVING IT'
        : `GEAR 1  ·  ${rph.toLocaleString()} ROTATIONS / HOUR`
          + (rph >= LEGACY_MAX_RPH ? '  ·  AT THE TEETH’S LIMIT' : '')
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
    // SAY WHAT THE ROW IS. "G1 1,400" is a label and a number with no
    // relationship stated - the player has to guess the number counts
    // rotations. That is worth saying; the ratio is not, because the
    // machine shows it.
    content.add(scene.add.text(
      w / 2, countY - 14 * s, 'ROTATIONS COMPLETED',
      {
        resolution: textResolution, fontFamily: Theme.fontMono,
        fontSize: `${Math.round(8 * s)}px`, fontStyle: 'bold',
        color: hex(Theme.textOnDarkMuted)
      }
    ).setOrigin(0.5, 1));
    // The machine GROWS, so the row is laid out from its current length.
    const gears = legacyGearCount(state);
    const countStep = Math.min(46 * s, (w - 30 * s) / gears);
    const countLeft = w / 2 - (countStep * (gears - 1)) / 2;
    for (let i = 0; i < gears; i++) {
      const turns = state.turns[i] ?? 0;
      content.add(scene.add.text(countLeft + countStep * i, countY, `GEAR ${i + 1}`, {
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
        ? (rph === 0
          ? 'START IT AND PROJECT STAGES WILL TURN GEAR 1'
          : `NEXT REWARD AT GEAR ${focus + 1}’S `
            + `${next.milestone}${next.milestone === 1 ? 'ST' : 'TH'} ROTATION`
            + `  ·  ${Math.round(next.progress * 100)}% THERE`)
        : 'EVERY GEAR HAS PAID OUT',
      {
        resolution: textResolution, fontFamily: Theme.fontMono,
        fontSize: `${Math.round(9 * s)}px`, fontStyle: 'bold',
        color: hex(next ? Theme.textOnDarkMuted : Theme.currencyXp)
      }
    ).setOrigin(0.5));

    // What the gear being waited on actually costs, in the only unit the
    // player can act on - turns of gear one, which is the gear they can
    // buy speed for.
    // ONLY FOR THE DEEP GEARS, and above the bar rather than under it.
    // Gear one's version just repeated the footer, and at barY + 28 it
    // landed on the top edge of the upgrade button.
    if (next && rph > 0 && focus > 0) {
      content.add(scene.add.text(w / 2, barY - 17 * s, turnsLabel(focus), {
        resolution: textResolution, fontFamily: Theme.fontMono,
        fontSize: `${Math.round(8 * s)}px`,
        color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5));
    }

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
      maxed ? `ADD GEAR ${legacyGearCount(state) + 1}`
        : state.gearOneLevel === 0 ? 'START THE MACHINE' : 'UPGRADE GEAR 1',
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

    // NO CLAIM LIST. Rewards are delivered the moment a gear reaches a
    // milestone - on a fifteen-second tick while the game is open, and
    // in one go through the "while you were away" box when it is not -
    // so there is nothing here to press. The machine pays without being
    // asked, which is what an idle machine is for.

    content.add(scene.add.text(
      w / 2, h - 16 * s,
      'FINISH PROJECT STAGES TO TURN GEAR 1',
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
