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
export interface LegacyMachineState {
  gearOneLevel: number;
  torqueLevel: number;
  turns: number[];
  claimed: number[][];
}

export type LegacyReward =
  | { kind: 'credits'; amount: number }
  | { kind: 'gems'; amount: number }
  | { kind: 'energy'; amount: number };

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
export const LEGACY_BASE_RPH = 250;
export const LEGACY_MAX_RPH = 100_000;

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
export const LEGACY_MAX_LEVEL = 36;

/**
 * 3:1, not the reference's 10:1.
 *
 * The ratio is the entire pacing control, and it compounds: at 10:1 the
 * eighth gear needs ten million turns of the first and the machine is
 * decoration. At 3:1 it needs 2,187. Each step is still a visible slowdown -
 * three to one reads as "much slower" at a glance - and the chain as a whole
 * lands somewhere a player can actually finish.
 */
export const LEGACY_GEAR_RATIO = 3;

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
    claimed: Array.from({ length: LEGACY_BASE_GEARS }, () => [])
  };
}

export function normalizeLegacyMachine(raw: unknown): LegacyMachineState {
  const state = createDefaultLegacyMachine();
  const candidate = raw as Partial<LegacyMachineState> | undefined;
  if (!candidate || typeof candidate !== 'object') return state;
  state.gearOneLevel = Number.isFinite(candidate.gearOneLevel)
    ? Math.max(0, Math.min(LEGACY_MAX_LEVEL, Math.floor(candidate.gearOneLevel!)))
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

export function addLegacyMomentum(state: LegacyMachineState, baseTurns: number): void {
  state.turns[0] += baseTurns * legacySpeed(state);
  syncLegacyGears(state);
}

export function projectStageLegacyMomentum(stage: number): number {
  return [4, 7, 12, 20, 32][Math.max(0, Math.min(4, stage - 1))] ?? 4;
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
 * Rewards scale with DEPTH, because depth is the only cost.
 *
 * A rotation of gear six is 243 rotations of gear one, so it has to pay like
 * one - otherwise the deep end of the machine is worse value than the
 * shallow end and the whole chain collapses to "keep claiming gear one".
 */
export function legacyReward(gear: number, milestone: number): LegacyReward {
  const depth = LEGACY_GEAR_RATIO ** gear;
  if (gear === 0) return { kind: 'credits', amount: 150 * milestone };
  if (gear === 1) return { kind: 'energy', amount: Math.round(8 * milestone) };
  if (gear === 2) return { kind: 'credits', amount: Math.round(220 * depth * milestone) };
  if (gear === 3) return { kind: 'gems', amount: Math.round(6 * milestone) };
  if (gear === 4) return { kind: 'credits', amount: Math.round(260 * depth * milestone) };
  if (gear === 5) return { kind: 'gems', amount: Math.round(25 * milestone) };
  if (gear === 6) return { kind: 'energy', amount: Math.round(120 * milestone) };
  // THE LAST GEAR. One rotation, once, and it pays like the end of a
  // machine rather than like another row on a list.
  return { kind: 'gems', amount: 250 };
}

export function claimableLegacyMilestones(state: LegacyMachineState): Array<{ gear: number; milestone: number; reward: LegacyReward }> {
  const claims: Array<{ gear: number; milestone: number; reward: LegacyReward }> = [];
  for (let gear = 0; gear < legacyGearCount(state); gear++) {
    for (const milestone of legacyMilestones(gear)) {
      if (state.turns[gear] < milestone || state.claimed[gear].includes(milestone)) continue;
      claims.push({ gear, milestone, reward: legacyReward(gear, milestone) });
    }
  }
  return claims;
}

/** The next milestone a gear is working toward, or null once it is done. */
export function nextLegacyMilestone(
  state: LegacyMachineState, gear: number
): { milestone: number; progress: number } | null {
  for (const milestone of legacyMilestones(gear)) {
    if (state.claimed[gear].includes(milestone)) continue;
    return {
      milestone,
      progress: Math.max(0, Math.min(1, state.turns[gear] / milestone))
    };
  }
  return null;
}

export function markLegacyClaimed(state: LegacyMachineState, gear: number, milestone: number): void {
  if (!state.claimed[gear].includes(milestone)) state.claimed[gear].push(milestone);
}
