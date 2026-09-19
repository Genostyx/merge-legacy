import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { spendCoinsGeneric, spendGems } from '../../economy/Economy';
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
  buyLegacyGear,
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
  if (gear === 0) return 'TURNS WITH REAL TIME, EVEN WHILE AWAY';
  return `ONE TURN OF THIS = `
    + `${Math.round(gearOneTurnsFor(gear, 1)).toLocaleString()} OF GEAR 1’S`;
}

/**
 * A gear count that fits its column.
 *
 * The counts sit in a row of narrow columns, one per gear, and gear
 * one runs to seven figures once the machine has been going a while -
 * `toLocaleString` put "2,187,000" where about five characters fit, so
 * the deep gears' numbers ran into each other. Thousands and millions
 * get a suffix; the small end keeps its decimals, because the whole
 * point of gear eight is watching it crawl from 0.00.
 */
function compactTurns(turns: number): string {
  if (turns >= 1_000_000) return `${(turns / 1_000_000).toFixed(turns >= 10_000_000 ? 0 : 1)}M`;
  if (turns >= 10_000) return `${Math.round(turns / 1000)}k`;
  if (turns >= 1000) return `${(turns / 1000).toFixed(1)}k`;
  if (turns >= 100) return Math.round(turns).toString();
  if (turns >= 1) return turns.toFixed(1);
  return turns.toFixed(2);
}

/**
 * 1ST, 2ND, 3RD, 4TH - and 11TH through 13TH, which are the ones a
 * naive rule gets wrong.
 *
 * The milestone line used `n === 1 ? 'ST' : 'TH'`, so every reward
 * after the first read "2TH", "3TH", "22TH". Repeating rewards made it
 * constant rather than occasional: those land on every interval, so
 * the wrong suffix was on screen most of the time.
 */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}TH`;
  const suffix = { 1: 'ST', 2: 'ND', 3: 'RD' }[n % 10] ?? 'TH';
  return `${n}${suffix}`;
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

  let builtGearCount = -1;

  /**
   * The train, rebuilt only when the NUMBER of gears changes.
   *
   * `art` sits outside `redraw` on purpose - see above - so the gears
   * keep turning while the panel is rebuilt under them. The cost of that
   * was that buying a gear never drew it: the art was built once when the
   * panel opened and the new gear only appeared after a reload. Keying
   * the rebuild to the count pays the stutter exactly once, on the one
   * redraw that has something new to show.
   */
  const buildGears = (): void => {
    const stages = legacyGearCount(scene.legacyMachine);
    art.removeAll(true);
    gears.length = 0;
    builtGearCount = stages;

    // AN EMPTY MACHINE IS A LOT OF NOTHING. With no gears there is no
    // train to draw, and the panel is mostly void - which reads as
    // broken rather than as a machine waiting to be built.
    if (stages === 0) {
      art.add(scene.add.text(w / 2, h * 0.42, 'NO GEARS YET', {
        resolution: textResolution, fontFamily: Theme.fontHeading,
        fontSize: `${Math.round(15 * s)}px`, fontStyle: 'bold',
        color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5));
      art.add(scene.add.text(w / 2, h * 0.42 + 20 * s,
        'EVERY GEAR IS BOUGHT, STARTING WITH THE FIRST', {
        resolution: textResolution, fontFamily: Theme.fontMono,
        fontSize: `${Math.round(9 * s)}px`,
        color: hex(Theme.textOnDarkMuted)
      }).setOrigin(0.5));
      return;
    }

    // ONE GEAR PER GEAR, ON ALTERNATING SHAFTS.
    //
    // This drew TWO stacks of `stages` plates, which was right when the
    // count was a fixed 26 and the pair read as two barrels in mesh -
    // but with one plate per gear it simply doubled them, so buying the
    // second gear put four on screen. A gear train is a CHAIN: each
    // wheel meshes the next and the line zigzags as it climbs, which is
    // both what the reference machine does and the only arrangement
    // where the count on screen is the count you own.
    const spans = 0.1467 * (stages - 1) + 1;
    // THE BAND STOPS CLEAR OF THE HEADER. 0.56 was tuned for the old
    // dense stack, whose real extent was shorter than its nominal span;
    // a chain with this spacing uses the whole budget and ran the top
    // wheel up behind the title.
    const near = Math.min((w * 0.92) / 1.95, (h * 0.43) / spans);
    // The sprite is padded: the drawn wheel fills 0.863 of its canvas, so
    // spacing is measured on the tooth circle, not the box.
    const toothed = near * 0.863;
    // TIGHT, so the two shafts read as dense interleaved barrels
    // rather than a ladder. This was widened to make the meshing
    // legible and that pulled the stacks apart - the reference
    // machine packs its wheels nearly touching, and the interlock
    // is the whole of what it reads as.
    const step = toothed * 0.17;
    const baseY = h * 0.58;

    for (let i = stages - 1; i >= 0; i--) {
      // Receding, so the far end is smaller - the only depth cue left
      // once the train is square to the screen.
      const shrink = 0.982 ** i;
      const side = i % 2 ? 1 : -1;
      const gear = scene.add.image(
        w * 0.5 + side * toothed * 0.45 * shrink,
        baseY - step * i,
        GEAR_TEXTURE
      ).setDisplaySize(near * shrink, near * shrink);
      gear.setData('stage', i);
      // MESHING WHEELS COUNTER-ROTATE, and since the chain alternates
      // sides, the sense alternates with it.
      gear.setData('sense', side);
      gears.push(gear);
      art.add(gear);
    }
  };

  if (scene.textures.exists(GEAR_TEXTURE)) {
    buildGears();

    // DRIVEN BY REAL ELAPSED TIME, not by an assumed tick length. At a
    // fixed 16ms per step the machine ran slow whenever a frame took
    // longer than that, so the train and the "rotations per hour" on
    // the header quietly disagreed.
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
    // A PURCHASE HAS TO REACH THE ART. `content` is all this used to
    // clear, and the gears live in `art`, so buying one drew nothing
    // until the panel was opened again. Only a change in the count
    // rebuilds, so claiming a reward still leaves the train turning.
    if (legacyGearCount(state) !== builtGearCount) buildGears();
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
        compactTurns(turns),
        {
          resolution: textResolution, fontFamily: Theme.fontNumeric,
          fontSize: `${Math.round(9 * s)}px`, fontStyle: 'bold',
          color: hex(i === 0 ? Theme.currencyXp : Theme.textOnDark)
        }
      ).setOrigin(0.5, 0));
    }

    // Show the soonest reward, including repeating rewards.
    let focus = 0;
    let remaining = Infinity;
    for (let i = 0; i < legacyGearCount(state); i++) {
      const candidate = nextLegacyMilestone(state, i);
      if (!candidate) continue;
      const turnsLeft = Math.max(0, gearOneTurnsFor(i, candidate.milestone) - state.turns[0]);
      if (turnsLeft < remaining) { focus = i; remaining = turnsLeft; }
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
      legacyGearCount(state) === 0
        ? 'BUY THE FIRST GEAR TO BUILD THE MACHINE'
        : next
        ? (rph === 0
          ? 'BUY THE FIRST UPGRADE TO START GEAR 1'
          : `NEXT REWARD AT GEAR ${focus + 1}’S `
            + `${ordinal(next.milestone)} ROTATION`
            + `  ·  ${Math.round(next.progress * 100)}% THERE`)
        : legacyGearCount(state) === 0 ? 'BUY THE FIRST GEAR TO START THE MACHINE'
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

    // ---- the two purchases ----
    // SEPARATE BUTTONS, not one that switches. Speed and length are
    // different things to spend on, and folding them into a single
    // button meant the machine decided for you - it sold speed until
    // the teeth capped and only then let you lengthen the train. Side
    // by side at the same Y, so the panel's vertical layout is
    // untouched.
    const gearsOwned = legacyGearCount(state);
    const half = Math.min(342 * s, w - 30 * s) / 2 - 4 * s;

    const buyButton = (
      cx: number, title: string, cost: { credits: number; gems: number },
      enabled: boolean, onBuy: () => void
    ): void => {
      const affordable = enabled
        && scene.economy.coins >= cost.credits
        && scene.economy.gems >= cost.gems;
      const box = scene.add.graphics();
      const color = affordable ? Theme.currencyXp : Theme.panelAlt;
      const lighting = materialLighting(color, affordable ? 5 : 2);
      box.fillGradientStyle(lighting.highlight, lighting.light, lighting.dark, lighting.shadow, 1);
      box.fillRoundedRect(cx - half / 2, upgradeY - 25 * s, half, 50 * s, Theme.radiusChip);
      box.lineStyle(1.5, affordable ? Theme.currencyXp : Theme.borderOnDark, 0.95);
      box.strokeRoundedRect(cx - half / 2, upgradeY - 25 * s, half, 50 * s, Theme.radiusChip);
      content.add(box);
      content.add(scene.add.text(cx, upgradeY - 9 * s, title, {
        resolution: textResolution, fontFamily: Theme.fontHeading,
        fontSize: `${Math.round(11 * s)}px`, fontStyle: 'bold',
        color: hex(affordable ? Theme.bg : Theme.textOnDarkMuted)
      }).setOrigin(0.5));

      if (enabled) {
        const costRow = scene.add.container(cx, upgradeY + 11 * s);
        const pills = [
          currencyPill(scene, cost.credits.toLocaleString(), 'credit', { ...currencyChipOptions('credit'), height: 16 * s, fontSize: 8 * s, iconSize: 11 * s }),
          currencyPill(scene, String(cost.gems), 'gem', { ...currencyChipOptions('gem'), height: 16 * s, fontSize: 8 * s, iconSize: 11 * s })
        ];
        let x = -pills.reduce((sum, pill) => sum + pill.width, 0) / 2 - 6 * s;
        for (const pill of pills) {
          x += pill.width / 2 + 3 * s;
          pill.setPosition(x, 0);
          x += pill.width / 2 + 3 * s;
          costRow.add(pill);
        }
        content.add(costRow);
      }

      if (!affordable) return;
      const zone = scene.add.zone(cx, upgradeY, half, 50 * s).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (scene.economy.coins < cost.credits || scene.economy.gems < cost.gems) return;
        spendCoinsGeneric(scene.economy, cost.credits);
        spendGems(scene.economy, cost.gems);
        onBuy();
        scene.updateCurrencyText();
        scene.saveState();
        redraw();
      });
      content.add(zone);
    };

    // LENGTH. Always available - it is the machine's first purchase and
    // never runs out.
    buyButton(
      w / 2 - half / 2 - 4 * s,
      `ADD GEAR ${gearsOwned + 1}`,
      legacyTorqueCost(state.torqueLevel),
      true,
      () => buyLegacyGear(scene.legacyMachine)
    );

    // SPEED. Nothing to drive until a gear exists, and capped once the
    // teeth can take no more.
    const speedCapped = state.gearOneLevel >= LEGACY_MAX_LEVEL;
    buyButton(
      w / 2 + half / 2 + 4 * s,
      gearsOwned === 0 ? 'NEEDS A GEAR'
        : speedCapped ? `GEAR 1 AT LV ${state.gearOneLevel}`
        : state.gearOneLevel === 0 ? 'START GEAR 1'
        : `SPEED UP  ·  LV ${state.gearOneLevel}`,
      legacyUpgradeCost(state.gearOneLevel),
      gearsOwned > 0 && !speedCapped,
      () => { scene.legacyMachine.gearOneLevel++; }
    );


    // NO CLAIM LIST. Rewards are delivered the moment a gear reaches a
    // milestone - on a fifteen-second tick while the game is open, and
    // in one go through the "while you were away" box when it is not -
    // so there is nothing here to press. The machine pays without being
    // asked, which is what an idle machine is for.

    content.add(scene.add.text(
      w / 2, h - 16 * s,
      'GEAR 1 RUNS WITH REAL TIME, EVEN WHILE AWAY',
      {
        resolution: textResolution, fontFamily: Theme.fontMono,
        fontSize: `${Math.round(9 * s)}px`, color: hex(Theme.textOnDarkMuted)
      }
    ).setOrigin(0.5));
  };

  const dismiss = (): void => {
    spin?.remove();
    readout.remove();
    overlay.destroy(true);
    scene.modalOpen = false;
  };
  close.on('pointerdown', dismiss);
  // ART UNDER THE HEADER. Added last it covered the title and the close
  // button, which is the one control this screen cannot do without.
  overlay.add([bg, art, title, subtitle, close, content]);
  redraw();
  let lastReadout = '';
  const readout = scene.time.addEvent({
    delay: 1_000,
    loop: true,
    callback: () => {
      const next = JSON.stringify([
        scene.legacyMachine.turns, scene.legacyMachine.claimed, scene.legacyMachine.repeatPaid,
        scene.legacyMachine.gearOneLevel, scene.legacyMachine.torqueLevel,
        scene.economy.coins, scene.economy.gems, scene.energy.current
      ]);
      if (next === lastReadout) return;
      lastReadout = next;
      redraw();
    }
  });
}
