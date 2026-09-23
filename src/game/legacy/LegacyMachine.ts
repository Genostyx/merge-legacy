/**
 * THE LEGACY MACHINE.
 *
 * Modelled on Daniel de Bruin's "A Machine Built to Outlive the Universe":
 * a train of gears where each one turns a fraction as fast as the one
 * feeding it, so the first gear spins visibly, the middle gears crawl, and
 * the last one is a monument. His has a hundred gears at 10:1 and its final
 * gear takes longer than the universe - which is the joke, and which is
 * exactly the part this does NOT copy.
 *
 * Here the last gear is meant to be REACHED. Eight gears at 3:1 means the
 * eighth turns once per 3^7 = 2,187 turns of the first, and a project stage
 * pays between four and thirty-two of those - so finishing the machine is a
 * long haul measured in a few hundred stages, not in geological time. The
 * feel of the reference survives (you watch gear one race while gear eight
 * has visibly not moved) without the promise being a lie.
 */
import type { CrateTier } from '../rewards/Rewards';
import type { ResourceProducerId } from '../rewards/ResourceRewards';

export interface LegacyMachineState {
  gearOneLevel: number;
  torqueLevel: number;
  turns: number[];
  claimed: number[][];
  /** Highest paid final-reward cycle per gear; avoids growing claim arrays. */
  repeatPaid: number[];
  /**
   * What gear one's total read when each gear STARTED TURNING.
   *
   * Without it a gear bought today is credited with every rotation gear
   * one has ever made, because its turns are derived from gear one's:
   * buy the ninth gear after a month and it arrives already part-way to
   * its own rewards, which is the opposite of buying them one at a time.
   *
   * The base gears have always been turning, so theirs stay 0.
   */
  gearStartTurns: number[];
  /**
   * Whole rotations of gear one already paid out as coins.
   *
   * Turns are a FLOAT - they accrue from elapsed hours - so the payout has
   * to remember where it got to. Deriving it from the total would either
   * pay a part-rotation twice or never pay it at all.
   */
  creditsPaidTurns: number;
  /** When the machine was last wound forward. 0 until it is started. */
  lastTickAt: number;
  /** Save shape, so migration knows what it is looking at. */
  schema: number;
}

/**
 * WHAT THE MACHINE PAYS: things that land ON THE BOARD.
 *
 * It used to hand over credits, gems and energy directly, which is the
 * one thing a merge game's side system must not do - it skips the board
 * entirely, so the reward costs the player no space, no merging and no
 * energy to realise. The Hydro Core already does this properly: its
 * payout arrives as items you have to make room for.
 *
 * So the machine delivers crates and producers. Their contents are
 * already balanced by the crate tables, the board-space cost is real,
 * and a full board sends them to the vault rather than evaporating.
 */
export type LegacyReward =
  | { kind: 'crate'; tier: CrateTier }
  | { kind: 'producer'; producerId: ResourceProducerId }
  /**
   * Straight into the wallet, never onto the board. Gear one pays this and
   * nothing else - see LEGACY_CREDITS_PER_TURN.
   */
  | { kind: 'credits'; amount: number };

/**
 * The machine is earned, not reached.
 *
 * A level gate says "keep playing"; finishing the living room says "you
 * built something, here is the thing that outlives it", which is what
 * this machine is for. It is also later than any level number would
 * safely be, and it lands after the player has met the project - the
 * system the machine's fiction sits next to.
 */
export function legacyUnlocked(projectStage: number, totalStages: number, furnished = true): boolean {
  return projectStage >= totalStages && furnished;
}

/**
 * What the locked button says, on TWO LINES.
 *
 * The tile is the rightmost of three and only sixty wide; a single line
 * ran off the edge of the card.
 */
export const LEGACY_UNLOCK_NOTE = 'FINISH FIRST\nHOME RENOVATION';

/** The same thing on one line, for the action tray, which has the room. */
export const LEGACY_UNLOCK_LINE = 'FINISH YOUR FIRST HOME RENOVATION';

/** Gears the machine ships with. TORQUE adds more - see `legacyGearCount`. */
/**
 * THE MACHINE ARRIVES EMPTY. Every gear is bought, starting with the
 * first - there is no free train to inherit.
 *
 * `LEGACY_PRE_BOUGHT_GEARS` is what this used to be, kept only so a save
 * written when the eight were free can be given them as purchases. See
 * `normalizeLegacyMachine`.
 */
export const LEGACY_BASE_GEARS = 0;
export const LEGACY_PRE_BOUGHT_GEARS = 8;
/** Bumped when the save shape changes in a way migration has to know about. */
export const LEGACY_SCHEMA = 1;

/**
 * SPEED IS ROTATIONS PER HOUR, and the ceiling is a real one.
 *
 * De Bruin drives his first gear at about 1,000 rotations an hour, which is
 * roughly 17 rpm - nothing like a limit, just the speed he chose. The limit
 * for a spur gear that size is pitch-line velocity: about 25 m/s for steel
 * and nearer 10 for the printed plastic his are made of, which on a 100mm
 * gear is around 1,900 rpm. That is 100,000 rotations an hour, and it is
 * where the teeth genuinely start to fail.
 *
 * So the speed track runs from a quarter of his machine's rate to a hundred
 * times it, and then stops - at which point torque takes over.
 */
/**
 * The reference rate `legacySpeed` measures against - "how many times
 * stock is this machine running at" - not the rate it starts at. Gear one
 * starts at one rotation an hour and climbs a rotation per level.
 */
export const LEGACY_BASE_RPH = 250;
/**
 * The speed the player can actually reach, and it is the real ceiling again.
 *
 * This was cut to 200 because driving gear one hard "finishes the whole
 * machine in minutes" - true of the machine it was written for, which had
 * eight gears and twenty-three milestones between them. The train now runs
 * to a hundred gears at a ratio tuned so the LAST one turns once in 17.5
 * years at exactly this speed, so there is no longer anything to empty:
 * even here, gear 60 needs half a day for one rotation and gear 80 needs
 * two months.
 */
export const LEGACY_MAX_RPH = 100_000;

/**
 * ONE LEVEL IS ONE ROTATION AN HOUR, and LEVEL ZERO IS STOPPED.
 *
 * The track used to be 36 levels of +19% each. The trouble with a
 * multiplier is that the number it moves has to be read to be believed:
 * at a hundred thousand rotations an hour a 19% step is nineteen thousand
 * rotations, and the fourteen levels it was later cut to could not
 * subdivide that at all.
 *
 * A level is now worth exactly one rotation an hour, so the readout moves
 * by a whole legible unit on every single purchase, and the cap falls out
 * of the arithmetic rather than being imposed on it: 100,000 levels,
 * 100,000 rotations an hour.
 *
 * An unlocked machine nobody has powered is standing still - no rotations,
 * no turns accruing, nothing for the panel to animate. The first upgrade
 * is what starts it, at one rotation an hour.
 *
 * Starting it at the base rate instead was tried and is wrong: the level
 * then has to be offset from the speed, and 100,000 levels of +1 run the
 * last 249 of them past the cap, where they cost credits and change
 * nothing. The identity has to be exact for the two numbers to be the
 * same number.
 */
export const LEGACY_MAX_LEVEL = 100_000;

/**
 * SOLVED BACKWARDS FROM THE LAST GEAR, not chosen and then lived with.
 *
 * The constraint is that gear 100 completes one full rotation in 17.5
 * years with gear one at its 100,000/hr cap. That is the whole machine's
 * pacing in a single statement, and it has exactly one ratio:
 *
 *   ratio^99 = 17.5 years x 100,000/hr = 15,330,000,000 turns of gear one
 *   ratio    = 1.267314
 *
 * Every earlier attempt set the ratio first and discovered what it did to
 * the far end afterwards. At 4:1 - the value this held - gear 100 needs
 * 4^99 turns, and only FIFTEEN gears can complete a rotation in a year at
 * full speed; the other eighty-five are ornaments with prices attached.
 * At 10:1, the reference machine's ratio, the last gear outlives the
 * universe, which is the joke that machine is built to tell and not a
 * thing to ship.
 *
 * The cost of a shallow ratio is that gear 2 is only 1.27x slower than
 * gear 1 rather than 4x, so the near end of the train runs at close to a
 * common speed and the slowdown only becomes legible deep in it.
 */
export const LEGACY_GEAR_RATIO = 1.267314;

/**
 * GEAR ONE IS A WAGE. One coin per rotation, and nothing else.
 *
 * It used to hand out pouches, baskets and bronze crates on a milestone
 * track like every other gear, which made the fastest gear in the machine
 * a source of ITEMS - the one thing the main board is already full of -
 * and made its output lumpy when it is the one gear that turns
 * continuously.
 *
 * A coin a rotation makes it a rate instead of a schedule, and the rate is
 * the number already on the panel: rotations per hour IS coins per hour.
 *
 * Deliberately not scaled by gear one's level, because the level already
 * IS the rate. Paying more per rotation as well would square it.
 */
export const LEGACY_CREDITS_PER_TURN = 1;

/**
 * GEARS PER RUNG of the reward ladder, and why it is not one.
 *
 * The ladder used to be indexed by gear number, which worked only because
 * 4:1 made gear number mean rarity: gear 8 needed 16,384 turns of gear
 * one, so a shipping container there was one per 3.4 days against the old
 * 200/hr ceiling.
 *
 * Two things broke that at once. The ceiling went back to 100,000/hr,
 * worth 500x on its own, and the ratio came down to 1.267314 so a gear is
 * barely slower than the one before it. Together, gear 8's shipping
 * container went from one per 3.4 days to nineteen thousand an hour.
 *
 * So the eight authored rows are spread across the train instead. 10.5
 * gears a rung puts the shipping row at GEAR 65, where one rotation costs
 * 4.1M turns of gear one - one container per 3.4 days with gear one run at
 * 50,000/hr.
 *
 * Anchored at 50,000 rather than at the 100,000 cap on purpose: the speed
 * curve is back-loaded hard enough that 50,000/hr costs 10.1M credits and
 * the last 2x costs 1.5 BILLION, so the cap is a place almost nobody
 * stands. Anchoring there would anchor to a hypothetical.
 */
export const LEGACY_REWARD_GEARS_PER_RUNG = 10.5;

/**
 * Rotation milestones, PER GEAR, thinning as the chain deepens.
 *
 * A single shared list is what made the old five-gear version dishonest: it
 * offered a 50-rotation reward on a gear that would never see three. A gear
 * only advertises milestones it can actually reach, so every row in the
 * panel is a promise the machine can keep.
 */
export const LEGACY_MILESTONES: readonly (readonly number[])[] = [
  [1, 5, 25, 100, 400],
  [1, 5, 25, 100],
  [1, 5, 25],
  [1, 5, 15],
  [1, 3, 8],
  [1, 3],
  [1, 2],
  [1]
];

/**
 * The authored row a gear draws its rewards from.
 *
 * Gear one (index 0) has no row at all - it pays coins. Everything after it
 * walks the remaining rows a rung every LEGACY_REWARD_GEARS_PER_RUNG gears,
 * so the ladder is spread across the train by rarity instead of sitting in
 * its first eight gears.
 */
export function legacyRewardRow(gear: number): number {
  if (gear <= 0) return 0;
  return Math.min(
    LEGACY_REWARDS.length - 1,
    1 + Math.floor((gear - 1) / LEGACY_REWARD_GEARS_PER_RUNG)
  );
}

export function legacyMilestones(gear: number): readonly number[] {
  // Gear one's rotations are paid as coins, continuously, so it has no
  // milestones to reach - see `legacyCreditsOwed`.
  if (gear <= 0) return [];
  return LEGACY_MILESTONES[legacyRewardRow(gear)] ?? [1];
}

export function createDefaultLegacyMachine(): LegacyMachineState {
  return {
    gearOneLevel: 0,
    torqueLevel: 0,
    turns: Array.from({ length: LEGACY_BASE_GEARS }, () => 0),
    claimed: Array.from({ length: LEGACY_BASE_GEARS }, () => []),
    repeatPaid: Array.from({ length: LEGACY_BASE_GEARS }, () => 0),
    gearStartTurns: Array.from({ length: LEGACY_BASE_GEARS }, () => 0),
    creditsPaidTurns: 0,
    schema: LEGACY_SCHEMA,
    lastTickAt: 0
  };
}

export function normalizeLegacyMachine(raw: unknown): LegacyMachineState {
  const state = createDefaultLegacyMachine();
  const candidate = raw as Partial<LegacyMachineState> | undefined;
  if (!candidate || typeof candidate !== 'object') return state;
  state.gearOneLevel = Number.isFinite(candidate.gearOneLevel)
    ? Math.max(0, Math.min(LEGACY_MAX_LEVEL, Math.floor(candidate.gearOneLevel!)))
    : 0;
  state.lastTickAt = Number.isFinite(candidate.lastTickAt)
    ? Math.max(0, Math.floor(candidate.lastTickAt!))
    : 0;
  state.torqueLevel = Number.isFinite(candidate.torqueLevel)
    ? Math.max(0, Math.floor(candidate.torqueLevel!))
    : 0;
  // A SAVE FROM WHEN THE FIRST EIGHT WERE FREE KEEPS THEM, as purchases.
  //
  // `torqueLevel` used to count gears ADDED to a free eight and now
  // counts every gear there is, so loading an old save without this
  // would quietly take eight gears off the end of the train - along with
  // every reward still owed on them.
  state.schema = Number.isFinite(candidate.schema)
    ? Math.max(0, Math.floor(candidate.schema!))
    : 0;
  if (state.schema < 1) state.torqueLevel += LEGACY_PRE_BOUGHT_GEARS;
  state.schema = LEGACY_SCHEMA;
  // The arrays are grown to whatever the torque level says the machine is
  // now, THEN filled - a save written at eight gears loads into a twelve
  // gear machine without losing a turn, and one written at twelve loads
  // into eight with its deep gears simply not shown.
  const gears = legacyGearCount(state);
  while (state.turns.length < gears) state.turns.push(0);
  while (state.claimed.length < gears) state.claimed.push([]);
  if (Array.isArray(candidate.turns)) {
    candidate.turns.slice(0, gears).forEach((turns, i) => {
      if (Number.isFinite(turns)) state.turns[i] = Math.max(0, turns as number);
    });
  }
  if (Array.isArray(candidate.claimed)) {
    candidate.claimed.slice(0, gears).forEach((claimed, i) => {
      if (!Array.isArray(claimed)) return;
      state.claimed[i] = claimed
        .filter((value): value is number => Number.isFinite(value))
        .map((value) => Math.max(0, Math.floor(value)));
    });
  }
  // The downstream gears are DERIVED, never stored independently: a save
  // written before a ratio change would otherwise keep its old numbers and
  // the train would disagree with itself.
  syncLegacyGears(state);
  // A SAVE FROM BEFORE GEAR ONE PAID COINS IS ALREADY SQUARE.
  //
  // Defaulting this to 0 would treat every rotation the machine has ever
  // made as unpaid and hand over the lot on the first tick - a month-old
  // save would open on a six-figure windfall it never earned. Absent means
  // "paid up to here", not "paid nothing".
  const paid = candidate.creditsPaidTurns;
  state.creditsPaidTurns = Number.isFinite(paid)
    ? Math.max(0, Math.floor(paid as number))
    : Math.floor(state.turns[0] ?? 0);
  // Old saves keep their progress without back-paying cycles from before
  // repeatable rewards existed. Time away since the saved tick still earns.
  // A SAVE FROM BEFORE `gearStartTurns` KEEPS EVERY GEAR AT 0, so nothing
  // a player already owns is retroactively wound back to a standstill.
  // Only gears bought from here on get a real starting point.
  for (let gear = 0; gear < gears; gear++) {
    const start = Array.isArray(candidate.gearStartTurns)
      ? candidate.gearStartTurns[gear] : undefined;
    state.gearStartTurns[gear] = Number.isFinite(start) ? Math.max(0, start!) : 0;
  }
  for (let gear = 0; gear < gears; gear++) {
    const saved = Array.isArray(candidate.repeatPaid) ? candidate.repeatPaid[gear] : undefined;
    state.repeatPaid[gear] = Number.isFinite(saved)
      ? Math.max(0, Math.floor(saved!))
      : Math.floor(state.turns[gear] / legacyRepeatInterval(gear));
  }
  return state;
}

/** Every gear after the first, recomputed from gear one's count. */
export function syncLegacyGears(state: LegacyMachineState): void {
  const gears = legacyGearCount(state);
  while (state.turns.length < gears) state.turns.push(0);
  while (state.claimed.length < gears) state.claimed.push([]);
  while (state.repeatPaid.length < gears) state.repeatPaid.push(0);
  while (state.gearStartTurns.length < gears) state.gearStartTurns.push(0);
  // MEASURED FROM WHERE THE GEAR STARTED, not from zero. A gear that has
  // been on the machine since the beginning started at 0 and so is
  // unaffected; one bought later only counts the turns since it was
  // bought. See `gearStartTurns`.
  for (let i = 1; i < gears; i++) {
    const since = state.turns[0] - (state.gearStartTurns[i] ?? 0);
    state.turns[i] = Math.max(0, since) / LEGACY_GEAR_RATIO ** i;
  }
}

/**
 * Gear one's actual rate, in rotations per hour - which IS its level.
 * See LEGACY_MAX_LEVEL for why the two are the same number.
 */
export function legacyRotationsPerHour(level: number): number {
  if (level <= 0) return 0;
  return Math.min(LEGACY_MAX_RPH, level);
}

/**
 * How much faster than a stock machine this one runs - and ZERO while it
 * is stopped, so nothing turns and no turns are banked until it is
 * started.
 */
export function legacySpeed(state: LegacyMachineState): number {
  return legacyRotationsPerHour(state.gearOneLevel) / LEGACY_BASE_RPH;
}

/** Whether the machine is running at all. */
export function legacyIsRunning(state: LegacyMachineState): boolean {
  return state.gearOneLevel > 0 && legacyGearCount(state) > 0;
}

/**
 * TORQUE IS THE UNCAPPED TRACK, and what it buys is more machine.
 *
 * Once gear one is at the speed its teeth can survive, the only way to get
 * more out of the train is to drive more of it - so each torque level bolts
 * another gear onto the far end. That gear is three times slower than the
 * one before it, so the ladder gets steeper on its own: no formula has to
 * be stretched to keep the player busy, the geometry does it. Gear twenty
 * needs over a billion turns of gear one, which is past a lifetime of play,
 * and there is no last gear to reach.
 */
export function legacyGearCount(state: LegacyMachineState): number {
  return LEGACY_BASE_GEARS + Math.max(0, state.torqueLevel);
}

/**
 * Adds a gear to the far end, starting from a standstill.
 *
 * The purchase has to go through here rather than incrementing
 * `torqueLevel` directly, because the moment of buying is the only time
 * the new gear's starting point is knowable.
 */
export function buyLegacyGear(state: LegacyMachineState): void {
  state.torqueLevel++;
  syncLegacyGears(state);
  state.gearStartTurns[legacyGearCount(state) - 1] = state.turns[0];
  syncLegacyGears(state);
}

/**
 * The last upgrade's price, which is the one the curve is built from.
 *
 * Both are the top of the ORIGINAL 36-level track - `250*(l+1)*(1+l*0.45)`
 * and `4 + l*2` at level 35 - so the most expensive speed purchase in the
 * game costs exactly what it always did. Only the number of steps between
 * here and the bottom has changed.
 */
const LEGACY_TOP_UPGRADE_CREDITS = 150_750;
const LEGACY_TOP_UPGRADE_GEMS = 74;

/**
 * PRICED FROM THE TOP DOWN, not the bottom up.
 *
 * Anchoring the first upgrade and multiplying outwards is what produced a
 * curve that was flat for its first ten thousand levels - the whole range
 * has to fit above the starting price, so the early steps cannot move.
 * Dividing down from the last upgrade instead puts the cost where the
 * income is: gem and credit income both scale about 400x across this
 * track, and a back-loaded price tracks that, where a front-loaded one
 * charges most at the point the player earns least.
 *
 * At this divisor the first upgrade is ~7 credits and the hundred
 * thousandth is 150,750. The gem divisor is derived rather than chosen, so
 * the first upgrade lands on the original's 4 gems.
 */
const LEGACY_UPGRADE_DECAY = 1.0001;
const LEGACY_UPGRADE_GEM_DECAY =
  (LEGACY_TOP_UPGRADE_GEMS / 4) ** (1 / (LEGACY_MAX_LEVEL - 1));

export function legacyUpgradeCost(level: number): { credits: number; gems: number } {
  // `level` is what gear one is on now, so this is the price of the step
  // that takes it to `level + 1` - the last of which is `MAX_LEVEL - 1`.
  const stepsFromTop = Math.max(0, LEGACY_MAX_LEVEL - 1 - level);
  return {
    credits: Math.max(1, Math.round(
      LEGACY_TOP_UPGRADE_CREDITS / LEGACY_UPGRADE_DECAY ** stepsFromTop)),
    gems: Math.max(1, Math.round(
      LEGACY_TOP_UPGRADE_GEMS / LEGACY_UPGRADE_GEM_DECAY ** stepsFromTop))
  };
}

/**
 * PRICE IS ITS OWN LADDER NOW, uncoupled from the turn ratio.
 *
 * It used to be `120,000 * ratio^(level - 8)`: the price tracked the
 * gear's worth exactly, rebased around the eight gears that were once
 * free. Two things broke that. The eight free gears are gone - every
 * gear is bought now, starting from none - so there is nothing to rebase
 * around and the floor was doing all the work, flattening the first four
 * gears to an identical 250c and making gear 2 cheaper than starting
 * gear 1. And the turn ratio has since been solved backwards from gear
 * 100, so it is 1.267314 and no longer a sane thing to price against:
 * a gear that is 27% slower than the last cannot cost 27% more when
 * there are a hundred of them.
 *
 * So: 250c for the first gear, 1.10 a rung.
 *
 * Deliberately SHALLOWER than the turn ratio, which is the one thing the
 * original got wrong by tying them together. The span from gear 1 to gear
 * 100 is the multiple raised to the 99th, so tracking worth at 1.267
 * makes that span 15 BILLION times - either gear 1 costs pennies or gear
 * 100 costs 3.7 trillion, and there is no anchor that avoids both. At
 * 1.618 it is worse still: the price passes MAX_SAFE_INTEGER at gear 66,
 * 34 gears before the machine runs out of pacing.
 *
 * At 1.10 the whole ladder comes to 34.45M against the speed track's
 * 1.51B, so gear one's speed stays the machine's main cost and the gears
 * are what that speed is spent on - while every gear from the first is
 * still a purchase rather than a rounding error.
 */
const LEGACY_GEAR_FIRST_CREDITS = 250;
const LEGACY_GEAR_PRICE_STEP = 1.10;

/**
 * Gems on the same shape, for the same reason.
 *
 * These were `40 + (level - 8) * 25` - linear, and rebased around the
 * eight gears that used to come free, so the ladder sat flat at 2 gems
 * through gear 8 and then stepped to 40 at gear 9. That step marked the
 * first gear you could BUY, and there is no such gear any more; every one
 * is bought, from the first.
 *
 * Geometric from 4 gems - what the first speed upgrade costs, so the
 * machine's two first purchases agree - at a rate that lands gear 100 on
 * 2,315, which is what the original linear ladder charged there. Same
 * deep-end cost, no discontinuity on the way.
 */
const LEGACY_GEAR_FIRST_GEMS = 4;
const LEGACY_GEAR_GEM_STEP = 1.0663;

export function legacyTorqueCost(level: number): { credits: number; gems: number } {
  // `level` is the number of gears already owned, so level 0 prices the
  // FIRST gear.
  return {
    credits: Math.round(LEGACY_GEAR_FIRST_CREDITS * LEGACY_GEAR_PRICE_STEP ** level),
    gems: Math.max(1, Math.round(
      LEGACY_GEAR_FIRST_GEMS * LEGACY_GEAR_GEM_STEP ** level))
  };
}

/**
 * WINDS THE MACHINE FORWARD TO `now`, AND SAYS WHAT IT PRODUCED.
 *
 * Turns come from REAL TIME, offline included, which is the only model
 * that makes "250 rotations an hour" mean anything. It used to be turns
 * per project stage multiplied by the speed factor - and since speed ran
 * to 400x, a single stage late on emptied the entire machine and every
 * reward landed at once.
 *
 * Every milestone crossed is marked claimed here and returned, so the
 * caller can deliver it; nothing is left sitting in a list waiting to be
 * pressed. A machine that has not been started does nothing at all.
 */
export function advanceLegacyMachine(
  state: LegacyMachineState, now: number
): Array<{ gear: number; milestone: number; reward: LegacyReward }> {
  // Speed with nothing to drive is not motion. Until the first gear is
  // bought the machine has no train at all.
  if (state.gearOneLevel <= 0 || legacyGearCount(state) <= 0) {
    state.lastTickAt = Math.max(state.lastTickAt, now);
    return [];
  }
  if (!state.lastTickAt) {
    state.lastTickAt = now;
    return [];
  }
  if (now <= state.lastTickAt) return [];
  const hours = (now - state.lastTickAt) / 3_600_000;
  state.lastTickAt = now;
  if (hours <= 0) return [];
  state.turns[0] += legacyRotationsPerHour(state.gearOneLevel) * hours;
  syncLegacyGears(state);

  const produced = claimableLegacyMilestones(state);
  for (const entry of produced) markLegacyClaimed(state, entry.gear, entry.milestone);
  // Gear one's wage, as one entry rather than one per rotation - at the top
  // speed that is 100,000 an hour, and the caller animates these.
  const credits = legacyCreditsOwed(state);
  if (credits > 0) {
    produced.unshift({ gear: 0, milestone: 0, reward: { kind: 'credits', amount: credits } });
  }
  return produced;
}

/**
 * Coins gear one has turned for and not yet been paid, and the payout marker
 * moved past them.
 *
 * Whole rotations only. A part-rotation is not a rotation, and rounding it
 * would pay out faster than the machine turns.
 */
export function legacyCreditsOwed(state: LegacyMachineState): number {
  if (legacyGearCount(state) <= 0) return 0;
  const whole = Math.floor(state.turns[0] ?? 0);
  const owed = whole - state.creditsPaidTurns;
  if (owed <= 0) return 0;
  state.creditsPaidTurns = whole;
  return owed * LEGACY_CREDITS_PER_TURN;
}

/** Rotations gear one will complete over a span, for the panel's copy. */
export function legacyTurnsOver(state: LegacyMachineState, hours: number): number {
  return legacyRotationsPerHour(state.gearOneLevel) * hours;
}

/**
 * How many turns of GEAR ONE a given gear needs for one of its own.
 *
 * Used by the panel to say what a gear is waiting for, so the number the
 * player reads and the number the machine checks come from one place.
 */
export function gearOneTurnsFor(gear: number, rotations: number): number {
  return rotations * LEGACY_GEAR_RATIO ** gear;
}

/**
 * WHAT EACH MILESTONE PAYS, written out rather than computed.
 *
 * The formula version multiplied by depth and came to 393,750 credits,
 * 476 gems and 1,408 energy over the whole machine. Against the shop's
 * own anchors - 100 gems is the $0.99 pack, and gems buy coins at 50 to
 * 70 each - that is about five dollars of premium currency and several
 * thousand gems' worth of credits from one feature.
 *
 * A table is the honest tool here. Depth still pays more, but the total
 * is chosen rather than whatever an exponent happened to produce, and it
 * can be read off at a glance.
 *
 * The machine is a LONG-HAUL bonus, not an income source: finishing the
 * whole thing is worth roughly one gem pack and a couple of Hydro Cores.
 */
const LEGACY_REWARDS: readonly (readonly LegacyReward[])[] = [
  // Gear 1 - pouches and baskets. Small, frequent, and they still have to
  // be tapped out one item at a time.
  [
    { kind: 'producer', producerId: 'coin-pouch' },
    { kind: 'producer', producerId: 'energy-basket' },
    { kind: 'producer', producerId: 'coin-basket' },
    { kind: 'crate', tier: 'bronze' },
    { kind: 'crate', tier: 'bronze' }
  ],
  [
    { kind: 'producer', producerId: 'energy-basket' },
    { kind: 'producer', producerId: 'coin-basket' },
    { kind: 'crate', tier: 'bronze' },
    { kind: 'crate', tier: 'silver' }
  ],
  [
    { kind: 'crate', tier: 'bronze' },
    { kind: 'crate', tier: 'silver' },
    { kind: 'producer', producerId: 'gem-basket' }
  ],
  [
    { kind: 'producer', producerId: 'gem-basket' },
    { kind: 'crate', tier: 'silver' },
    { kind: 'crate', tier: 'gold' }
  ],
  [
    { kind: 'crate', tier: 'silver' },
    { kind: 'crate', tier: 'gold' },
    { kind: 'crate', tier: 'gold' }
  ],
  [
    { kind: 'crate', tier: 'gold' },
    { kind: 'crate', tier: 'vault' }
  ],
  [
    { kind: 'crate', tier: 'vault' },
    { kind: 'crate', tier: 'vault' }
  ],
  // THE LAST BUILT-IN GEAR: the shipping container, which is the biggest
  // thing the board ever receives.
  [{ kind: 'crate', tier: 'shipping' }]
];

/**
 * A gear past the built-in eight, added by torque.
 *
 * Each is three times slower than the last and takes weeks to years, so
 * each pays the top crate. There is nothing above a shipping container to
 * escalate to, and inventing one would only restart the inflation the
 * currency rewards caused.
 */
function deepGearReward(): LegacyReward {
  return { kind: 'crate', tier: 'shipping' };
}

export function legacyReward(gear: number, milestone: number): LegacyReward {
  const row = LEGACY_REWARDS[legacyRewardRow(gear)];
  if (!row) return deepGearReward();
  const index = legacyMilestones(gear).indexOf(milestone);
  return row[index] ?? row[row.length - 1];
}

/** After the first-time sequence, its final reward repeats each interval. */
export function legacyRepeatInterval(gear: number): number {
  const milestones = legacyMilestones(gear);
  // GEAR ONE HAS NO INTERVAL. Its milestone list is empty - it pays a wage,
  // not rewards - and reading off the end of that returned NaN, which then
  // poisoned every `turns / interval` it reached.
  if (milestones.length === 0) return Infinity;
  return milestones[milestones.length - 1];
}

export function claimableLegacyMilestones(state: LegacyMachineState): Array<{ gear: number; milestone: number; reward: LegacyReward }> {
  const claims: Array<{ gear: number; milestone: number; reward: LegacyReward }> = [];
  // FROM GEAR TWO. Gear one pays coins per rotation rather than rewards at
  // milestones, which `advanceLegacyMachine` settles on its own.
  for (let gear = 1; gear < legacyGearCount(state); gear++) {
    // TOLERATES A SHORT ARRAY. The gear count is derived from the torque
    // level, so anything that raises torque without calling
    // `syncLegacyGears` - a hand-edited save, a debug poke - leaves the
    // arrays behind the machine and this used to throw on the first gear
    // past the end.
    const claimed = state.claimed[gear] ?? [];
    const turns = state.turns[gear] ?? 0;
    for (const milestone of legacyMilestones(gear)) {
      if (turns < milestone || claimed.includes(milestone)) continue;
      claims.push({ gear, milestone, reward: legacyReward(gear, milestone) });
    }
    const interval = legacyRepeatInterval(gear);
    const earned = Math.floor(turns / interval);
    for (let cycle = Math.max(2, (state.repeatPaid[gear] ?? 0) + 1); cycle <= earned; cycle++) {
      const milestone = cycle * interval;
      claims.push({ gear, milestone, reward: legacyReward(gear, interval) });
    }
  }
  return claims;
}

/** Next first-time reward, or the next repeating final-reward cycle. */
export function nextLegacyMilestone(
  state: LegacyMachineState, gear: number
): { milestone: number; progress: number } | null {
  const claimed = state.claimed[gear] ?? [];
  for (const milestone of legacyMilestones(gear)) {
    if (claimed.includes(milestone)) continue;
    return {
      milestone,
      progress: Math.max(0, Math.min(1, (state.turns[gear] ?? 0) / milestone))
    };
  }
  const interval = legacyRepeatInterval(gear);
  const milestone = (Math.max(1, state.repeatPaid[gear] ?? 0) + 1) * interval;
  return {
    milestone,
    progress: Math.max(0, Math.min(1, ((state.turns[gear] ?? 0) - (milestone - interval)) / interval))
  };
}

export function markLegacyClaimed(state: LegacyMachineState, gear: number, milestone: number): void {
  if (!state.claimed[gear]) state.claimed[gear] = [];
  if (legacyMilestones(gear).includes(milestone) && !state.claimed[gear].includes(milestone)) {
    state.claimed[gear].push(milestone);
  }
  const interval = legacyRepeatInterval(gear);
  if (milestone >= interval && milestone % interval === 0) {
    state.repeatPaid[gear] = Math.max(state.repeatPaid[gear] ?? 0, milestone / interval);
  }
}
