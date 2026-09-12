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
  /** When the machine was last wound forward. 0 until it is started. */
  lastTickAt: number;
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
  | { kind: 'producer'; producerId: ResourceProducerId };

/** Gears the machine ships with. TORQUE adds more - see `legacyGearCount`. */
export const LEGACY_BASE_GEARS = 8;

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
export const LEGACY_BASE_RPH = 20;
/**
 * The speed the player can actually reach. A hundred thousand an hour is
 * what the teeth could survive - see above - but driving gear one that
 * hard finishes the whole machine in minutes: at 354 an hour, six hours
 * away crossed 22 of the 23 milestones in the base machine.
 */
export const LEGACY_MAX_RPH = 200;

/**
 * Each level is 19% faster, which reaches the cap in 35 of them - and
 * LEVEL ZERO IS STOPPED.
 *
 * An unlocked machine nobody has powered is standing still: no rotations,
 * no turns accruing, nothing for the panel to animate. The first upgrade
 * is what starts it, at the base rate, which makes that purchase the most
 * legible one in the whole track.
 */
const LEGACY_SPEED_STEP = 1.19;
export const LEGACY_MAX_LEVEL = 14;

/**
 * 4:1, not the reference's 10:1 and not the 3:1 this shipped with.
 *
 * The ratio is the entire pacing control, and it compounds. At 10:1 the
 * eighth gear needs ten million turns of the first and the machine is
 * decoration. At 3:1 it needed 2,187 - six hours - and the whole thing
 * emptied in a single session away.
 *
 * At 4:1 the eighth gear needs 16,384: about a month at the starting
 * speed, three and a half days if the player buys every upgrade. The
 * torque gears past it then run to years on their own, which is the
 * long tail the machine is for.
 */
export const LEGACY_GEAR_RATIO = 4;

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

export function legacyMilestones(gear: number): readonly number[] {
  return LEGACY_MILESTONES[gear] ?? [1];
}

export function createDefaultLegacyMachine(): LegacyMachineState {
  return {
    gearOneLevel: 0,
    torqueLevel: 0,
    turns: Array.from({ length: LEGACY_BASE_GEARS }, () => 0),
    claimed: Array.from({ length: LEGACY_BASE_GEARS }, () => []),
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
  return state;
}

/** Every gear after the first, recomputed from gear one's count. */
export function syncLegacyGears(state: LegacyMachineState): void {
  const gears = legacyGearCount(state);
  while (state.turns.length < gears) state.turns.push(0);
  while (state.claimed.length < gears) state.claimed.push([]);
  for (let i = 1; i < gears; i++) {
    state.turns[i] = state.turns[0] / LEGACY_GEAR_RATIO ** i;
  }
}

/** Gear one's actual rate, in rotations per hour. */
export function legacyRotationsPerHour(level: number): number {
  if (level <= 0) return 0;
  return Math.min(LEGACY_MAX_RPH,
    Math.round(LEGACY_BASE_RPH * LEGACY_SPEED_STEP ** (level - 1)));
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
  return state.gearOneLevel > 0;
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

export function legacyUpgradeCost(level: number): { credits: number; gems: number; energy: number } {
  return {
    credits: Math.round(250 * (level + 1) * (1 + level * 0.45)),
    gems: 4 + level * 2,
    energy: 10 + level * 5
  };
}

/**
 * A new gear costs what the LAST one is worth, near enough.
 *
 * Each added gear is three times slower than the one before it, so its
 * price triples too - the ladder stays at a constant number of claims per
 * purchase instead of getting cheaper in real terms the deeper it goes.
 */
export function legacyTorqueCost(level: number): { credits: number; gems: number } {
  return {
    credits: Math.round(120_000 * LEGACY_GEAR_RATIO ** level),
    gems: 40 + level * 25
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
  if (state.gearOneLevel <= 0) {
    state.lastTickAt = now;
    return [];
  }
  if (!state.lastTickAt) {
    state.lastTickAt = now;
    return [];
  }
  const hours = Math.max(0, now - state.lastTickAt) / 3_600_000;
  state.lastTickAt = now;
  if (hours <= 0) return [];
  state.turns[0] += legacyRotationsPerHour(state.gearOneLevel) * hours;
  syncLegacyGears(state);

  const produced = claimableLegacyMilestones(state);
  for (const entry of produced) markLegacyClaimed(state, entry.gear, entry.milestone);
  return produced;
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
  const row = LEGACY_REWARDS[gear];
  if (!row) return deepGearReward();
  const index = legacyMilestones(gear).indexOf(milestone);
  return row[index] ?? row[row.length - 1];
}

export function claimableLegacyMilestones(state: LegacyMachineState): Array<{ gear: number; milestone: number; reward: LegacyReward }> {
  const claims: Array<{ gear: number; milestone: number; reward: LegacyReward }> = [];
  for (let gear = 0; gear < legacyGearCount(state); gear++) {
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
  }
  return claims;
}

/** The next milestone a gear is working toward, or null once it is done. */
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
  return null;
}

export function markLegacyClaimed(state: LegacyMachineState, gear: number, milestone: number): void {
  if (!state.claimed[gear]) state.claimed[gear] = [];
  if (!state.claimed[gear].includes(milestone)) state.claimed[gear].push(milestone);
}
